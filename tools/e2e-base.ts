/**
 * Runs the Chromium end-to-end tests on the working tree and on a base commit, and prints the
 * failures of the tree that pass on the base: `pnpm e2e-base <ref> [--no-cache] [-- <args of
 * playwright test>]`. {@link USAGE} gives the options, and `pnpm e2e-base --help` prints it.
 *
 * Some UI tests can fail on `main`, so a failure is a fault of a change only when the same test
 * passes on the base (`docs/agents/workflow.md`). The tool builds each tree and runs
 * `playwright test --project=chromium` in it: the working tree first, then the commit in a
 * temporary folder. The runs go one after the other, because two runs at the same time give more
 * timeouts on a loaded machine. Each run uses one free port, so it does not stop on the port 4182
 * of the merge script or of another agent.
 *
 * The whole output of each run, the build and the tests, goes into a log file in
 * `scratch/e2e-base/`, beside the JSON report of Playwright. The result of the base goes into the
 * cache of the probes in the common git folder, with a copy of its log, so each worktree shares
 * it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { basename, join, relative } from 'node:path';

import type { JSONReport, JSONReportSuite, JSONReportTest } from '@playwright/test/reporter';

import { e2ePort } from './e2e-port.ts';
import { ROOT, probeCacheDir, runChildren, shortHash, storeBase, withRefTree } from './ref-tree.ts';

/** The usage text of the tool, which `--help` prints. */
export const USAGE = `Usage: pnpm e2e-base <ref> [--no-cache] [-- <args of playwright test>]

Builds the site and runs the Chromium end-to-end tests on the working tree, then on the commit
<ref> in a temporary folder. It prints the count of each list and the failures of the tree that
pass on the base. A failure of the tree that the base skips or does not have is in that list too.

  <ref>        The base: a commit, a branch, or a tag. Give the start commit of the branch.
  --no-cache   Run the tests on the base again, also when the cache holds its result.
  -- <args>    The arguments of "playwright test", such as test files or --grep <text>.
  --help       Show this text.

Each run uses the port of PAWCHESTRA_E2E_PORT, or a free port of the system. The runs go one
after the other, because two runs at the same time give more timeouts on a loaded machine.

The whole output of each run (the build and the tests) goes into a log file in
scratch/e2e-base/ of the working tree, beside the JSON report of Playwright. The tool prints
the path of the log before each run. The result of the base goes into probe-cache/ of the
common git folder, with a copy of its log. The key is the tree hash of <ref>, the arguments of
the tests, Node, and the lockfile. With a cache hit, the base does not run again.

Exit codes: 0 when no failure of the tree passes on the base, 1 when one does, and 2 for a
usage error or a run that did not finish.`;

/** The version of the records of the cache. A change of the record gives new keys. */
const CACHE_VERSION = 'e2e-base 1';

/** The command line of the tool. */
export interface E2eBaseArgs {
  /** The base: a commit, a branch, or a tag. */
  readonly ref: string;
  /** True with `--no-cache`: the tests run on the base also when the cache holds its result. */
  readonly noCache: boolean;
  /** The arguments of `playwright test` after `--`. */
  readonly testArgs: readonly string[];
}

/** The result of one test in one run. A test that passes on a retry is flaky. */
export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

/** One test of a run and its result. */
export interface TestOutcome {
  /**
   * The key of the test: the project, the file, and the titles, with no line number, so that a
   * test keeps its key when a change moves it in its file.
   */
  readonly key: string;
  /** The place of the test in its run: the file and the line, such as `e2e/ui.e2e.ts:60`. */
  readonly place: string;
  /** The titles of the `describe` blocks and of the test, joined with ` › `. */
  readonly title: string;
  /** The result. */
  readonly status: TestStatus;
}

/** A failure of the tree that does not fail on the base. */
export interface NewFailure {
  /** The test on the tree. */
  readonly test: TestOutcome;
  /** The result of the test on the base, or `null` when the base does not have the test. */
  readonly base: TestStatus | null;
}

/** The compare of the tree with the base. */
export interface RunCompare {
  /** The failures of the tree that pass on the base, or that the base skips or does not have. */
  readonly added: readonly NewFailure[];
  /** The count of the tests that fail on the tree and on the base. */
  readonly both: number;
  /** The count of the failures of the base that do not fail on the tree. */
  readonly fixed: number;
}

/** The result of the base in the cache. */
interface BaseRecord {
  /** The full hash of the commit of the run. */
  readonly commit: string;
  /** The time of the run, in ISO 8601. */
  readonly date: string;
  /** The copy of the log of the run in the cache folder. */
  readonly log: string;
  /** The result of each test. */
  readonly outcomes: readonly TestOutcome[];
}

/** The files of one run. */
interface RunFiles {
  /** The log of the build and of the tests. */
  readonly log: string;
  /** The JSON report of Playwright. */
  readonly json: string;
}

/** The result of a test in the JSON report of Playwright, as a {@link TestStatus}. */
const STATUS = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
} as const satisfies Record<JSONReportTest['status'], TestStatus>;

/**
 * Reads the command line.
 *
 * @param args The arguments after the script, with no `--help`.
 * @returns The arguments.
 * @throws Error with no ref, with two refs, or with an option that does not exist.
 */
export function e2eBaseArgs(args: readonly string[]): E2eBaseArgs {
  const end = args.indexOf('--');
  const own = end < 0 ? args : args.slice(0, end);
  const testArgs = end < 0 ? [] : args.slice(end + 1);
  let ref: string | null = null;
  let noCache = false;
  for (const word of own) {
    if (word === '--no-cache') {
      noCache = true;
    } else if (word.startsWith('-')) {
      throw new Error(`No option ${word}. Run pnpm e2e-base --help.`);
    } else if (ref === null) {
      ref = word;
    } else {
      throw new Error(`Give one ref, and put the arguments of the tests after --.`);
    }
  }

  if (ref === null) {
    throw new Error('Give the base ref. Run pnpm e2e-base --help.');
  }
  return { ref, noCache, testArgs };
}

/**
 * Gives the result of each test of a JSON report of Playwright.
 *
 * @param report The report.
 * @returns One result for each test and project, in the order of the report.
 */
export function reportOutcomes(report: JSONReport): TestOutcome[] {
  const folder = basename(report.config.rootDir);
  const outcomes: TestOutcome[] = [];
  const visit = (suite: JSONReportSuite, titles: readonly string[]): void => {
    for (const spec of suite.specs) {
      const title = [...titles, spec.title].join(' › ');
      for (const test of spec.tests) {
        outcomes.push({
          key: `${test.projectName} › ${spec.file} › ${title}`,
          place: `${folder}/${spec.file}:${spec.line}`,
          title,
          status: STATUS[test.status],
        });
      }
    }
    for (const child of suite.suites ?? []) {
      visit(child, [...titles, child.title]);
    }
  };

  // The suite of a file has the name of the file as its title, and the place names the file.
  for (const file of report.suites) {
    visit(file, []);
  }
  return outcomes;
}

/**
 * Compares the results of the tree with the results of the base, test by test.
 *
 * @param tree The results of the tree.
 * @param base The results of the base.
 * @returns The new failures and the counts.
 */
export function compareRuns(
  tree: readonly TestOutcome[],
  base: readonly TestOutcome[],
): RunCompare {
  const onBase = new Map(base.map((test) => [test.key, test.status]));
  const onTree = new Map(tree.map((test) => [test.key, test.status]));
  const added: NewFailure[] = [];
  let both = 0;
  for (const test of tree) {
    if (test.status !== 'failed') {
      continue;
    }
    const status = onBase.get(test.key) ?? null;
    if (status === 'failed') {
      both += 1;
    } else {
      added.push({ test, base: status });
    }
  }

  let fixed = 0;
  for (const test of base) {
    if (test.status === 'failed' && onTree.get(test.key) !== 'failed') {
      fixed += 1;
    }
  }
  return { added, both, fixed };
}

/**
 * Gives the line of the counts of one run.
 *
 * @param label The name of the run, such as `Tree` or `Base main (70b948a4)`.
 * @param outcomes The results of the run.
 * @returns The line.
 */
export function countLine(label: string, outcomes: readonly TestOutcome[]): string {
  const count = (status: TestStatus): number =>
    outcomes.filter((test) => test.status === status).length;
  return (
    `${label}: ${outcomes.length} tests, ${count('passed')} passed, ${count('failed')} failed, ` +
    `${count('flaky')} flaky, ${count('skipped')} skipped.`
  );
}

/**
 * Gives the lines of a compare: the count of each list, and each failure of the tree that does
 * not fail on the base.
 *
 * @param compare The compare.
 * @returns The lines.
 */
export function compareLines(compare: RunCompare): string[] {
  const lines = [`Failures of the tree that pass on the base: ${compare.added.length}`];
  for (const { test, base } of compare.added) {
    const note =
      base === null ? ' (not on the base)' : base === 'skipped' ? ' (skipped on the base)' : '';
    lines.push(`  ${test.place} › ${test.title}${note}`);
  }
  lines.push(
    `Failures of the tree that fail on the base too: ${compare.both}`,
    `Failures of the base that do not fail on the tree: ${compare.fixed}`,
  );
  return lines;
}

/**
 * Runs git in the repository, and gives its output.
 *
 * @param args The arguments of git.
 * @returns The output, with no newline at the end.
 * @throws Error if git fails, with its error output.
 */
function git(args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trimEnd();
}

/**
 * Gives the SHA-256 of a text or of the bytes of a file.
 *
 * @param data The text or the bytes.
 * @returns The hash, in hex.
 */
function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Gives the file of the cache of the result of a base: `probe-cache/e2e-<key>.json` in the common
 * git folder. The key holds the tree of the commit, the arguments of the tests, Node, and the
 * lockfile of `node_modules`, so a commit with the same tree gets a hit.
 *
 * @param ref The base.
 * @param testArgs The arguments of `playwright test`.
 * @returns The path of the file.
 * @throws Error if git does not know the ref.
 */
function cacheFile(ref: string, testArgs: readonly string[]): string {
  const lock = join(ROOT, 'node_modules', '.pnpm', 'lock.yaml');
  const key = sha256(
    JSON.stringify([
      CACHE_VERSION,
      git(['rev-parse', `${ref}^{tree}`]),
      testArgs,
      `${process.version} ${process.platform} ${process.arch}`,
      existsSync(lock) ? sha256(readFileSync(lock)) : 'none',
    ]),
  );
  return join(probeCacheDir(), `e2e-${key}.json`);
}

/**
 * Gives a free TCP port of the system.
 *
 * @returns A promise of the port.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = address instanceof Object ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Runs a command in a folder, and adds its output and its error output to a log file.
 *
 * @param command The command and its arguments.
 * @param cwd The folder.
 * @param log The log file.
 * @param env The variables of the command, such as `PAWCHESTRA_E2E_PORT=4391`.
 * @returns A promise of the exit code, or `null` when a signal ended the command.
 */
async function runLogged(
  command: readonly string[],
  cwd: string,
  log: string,
  env: readonly string[],
): Promise<number | null> {
  appendFileSync(log, `\n$ ${[...env, ...command].join(' ')}\n`);
  const script = 'log=$1; shift; exec env "$@" >>"$log" 2>&1';
  const [end] = await runChildren([
    { command: 'sh', args: ['-c', script, 'sh', log, ...env, ...command], cwd },
  ]);
  return end?.status ?? null;
}

/**
 * Builds a tree and runs its Chromium end-to-end tests. The output goes into the log of the run.
 *
 * @param root The root of the tree, with a `node_modules` folder.
 * @param port The port of `vite preview`.
 * @param files The log and the JSON report of the run.
 * @param testArgs The arguments of `playwright test`.
 * @returns A promise of the result of each test.
 * @throws Error when the build fails, when the run writes no report, or when the report has an
 *   error outside the tests, such as a web server that does not start.
 */
async function runTests(
  root: string,
  port: number,
  files: RunFiles,
  testArgs: readonly string[],
): Promise<TestOutcome[]> {
  appendFileSync(files.log, `${new Date().toISOString()} in ${root}\n`);
  const built = await runLogged(['pnpm', 'run', 'build'], root, files.log, []);
  if (built !== 0) {
    throw new Error(`The build failed (exit code ${built}). Log: ${files.log}`);
  }

  const command = ['pnpm', 'exec', 'playwright', 'test', '--project=chromium'];
  const status = await runLogged(
    [...command, '--reporter=list,json', ...testArgs],
    root,
    files.log,
    [`PAWCHESTRA_E2E_PORT=${port}`, `PLAYWRIGHT_JSON_OUTPUT_FILE=${files.json}`],
  );
  if (!existsSync(files.json)) {
    throw new Error(`The tests wrote no report (exit code ${status}). Log: ${files.log}`);
  }

  // SAFETY: the JSON reporter of Playwright writes this file with the fields of JSONReport.
  const report = JSON.parse(readFileSync(files.json, 'utf8')) as JSONReport;
  if (report.errors.length > 0) {
    const messages = report.errors.map((error) => error.message ?? 'no message').join('\n');
    throw new Error(`The run has errors outside the tests:\n${messages}\nLog: ${files.log}`);
  }
  return reportOutcomes(report);
}

/**
 * Gives a path relative to the repository, for the output of the tool.
 *
 * @param path The absolute path.
 * @returns The relative path.
 */
function shown(path: string): string {
  return relative(ROOT, path);
}

/**
 * Gives the result of the base: from the cache, or from a new run in a temporary folder, which
 * then goes into the cache.
 *
 * @param args The command line.
 * @param port The port of `vite preview`.
 * @param stamp The start of the names of the files of the run.
 * @returns A promise of the result.
 * @throws Error when the base cannot use another port, or when its run fails.
 */
async function baseOutcomes(args: E2eBaseArgs, port: number, stamp: string): Promise<BaseRecord> {
  const file = cacheFile(args.ref, args.testArgs);
  const label = `${args.ref} (${shortHash(args.ref)})`;
  if (!args.noCache && existsSync(file)) {
    // SAFETY: the tool writes this file with the fields of BaseRecord, under a versioned key.
    const record = JSON.parse(readFileSync(file, 'utf8')) as BaseRecord;
    console.log(`Base ${label}: the cache holds the run of ${record.date}. Log: ${record.log}`);
    return record;
  }

  const name = join(ROOT, 'scratch', 'e2e-base', `${stamp}-base-${shortHash(args.ref)}`);
  const run = { log: `${name}.log`, json: `${name}.json` };
  console.log(`Base ${label}: build and test in a temporary folder. Log: ${shown(run.log)}`);
  const outcomes = await withRefTree(
    args.ref,
    async (dir) => {
      if (!existsSync(join(dir, 'tools', 'e2e-port.ts'))) {
        throw new Error(`${label} has no tools/e2e-port.ts, so its tests use the port 4182.`);
      }
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
      return runTests(dir, port, run, args.testArgs);
    },
    { prefix: 'e2e-base-' },
  );

  const log = file.replace(/\.json$/u, '.log');
  const record: BaseRecord = {
    commit: git(['rev-parse', `${args.ref}^{commit}`]),
    date: new Date().toISOString(),
    log,
    outcomes,
  };
  storeBase(file, JSON.stringify(record));
  copyFileSync(run.log, log);
  return record;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const end = argv.indexOf('--');
  if ((end < 0 ? argv : argv.slice(0, end)).includes('--help')) {
    console.log(USAGE);
    return;
  }
  const args = e2eBaseArgs(argv);
  // The ref must exist before the long run of the tree.
  shortHash(args.ref);

  const set = process.env['PAWCHESTRA_E2E_PORT'];
  const port = set ? e2ePort(set) : await freePort();
  const out = join(ROOT, 'scratch', 'e2e-base');
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const tree = { log: join(out, `${stamp}-tree.log`), json: join(out, `${stamp}-tree.json`) };
  console.log(`Tree: build and test on port ${port}. Log: ${shown(tree.log)}`);
  const treeOutcomes = await runTests(ROOT, port, tree, args.testArgs);
  console.log(countLine('Tree', treeOutcomes));

  const base = await baseOutcomes(args, port, stamp);
  console.log(countLine(`Base ${args.ref} (${base.commit.slice(0, 8)})`, base.outcomes));
  const compare = compareRuns(treeOutcomes, base.outcomes);
  console.log(['', ...compareLines(compare)].join('\n'));
  process.exitCode = compare.added.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
