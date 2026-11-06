/**
 * Runs the paused tests of the project `paused` of `vite.config.ts` (design 9.3). With no
 * `--base`, it runs Vitest with the output of Vitest, and exits with its exit code. With `--base <ref>`, it runs the paused tests on a temporary copy of a
 * commit, a branch, or a tag (`withRefTree()` of `tools/ref-tree.ts`) and on the working tree at
 * the same time, and prints only the tests that fail on the working tree alone. The copy goes away
 * at the end, also after a failure and after Ctrl-C.
 *
 * Usage: pnpm test:paused [--base <ref>] [<path>]...
 */
import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ROOT, runChildren, shortHash, withRefTree } from './ref-tree.ts';
import type { ChildEnd } from './ref-tree.ts';
import type { PausedReport } from './paused-reporter.ts';

/** The usage text of `pnpm test:paused`. */
const USAGE = 'Usage: pnpm test:paused [--base <ref>] [<path>]...';

/** The script of Vitest in the packages of the working tree. */
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

/** The reporter of the working tree, which both runs use (`tools/paused-reporter.ts`). */
const REPORTER = join(ROOT, 'tools', 'paused-reporter.ts');

/**
 * The paths of a commit that the paused tests read: the source, the tools and the demo files that
 * the tests import, the design files that a test reads, and the config files of Vitest. A paused
 * test that reads another path fails on the copy of the commit, so its failure on the working tree
 * does not show. Add such a path here.
 */
export const PAUSED_PATHS: readonly string[] = [
  'src',
  'tools',
  'demos',
  'docs/design',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
];

/** The arguments of `pnpm test:paused`. */
interface PausedArgs {
  /** The commit, the branch, or the tag of `--base`, or `null`. */
  readonly base: string | null;
  /** The test files to run, or none for all paused test files. */
  readonly paths: readonly string[];
}

/**
 * Reads the arguments of `pnpm test:paused`.
 *
 * @param args The arguments after the script.
 * @returns The ref of `--base` and the paths.
 * @throws Error if `--base` has no value or comes more than one time, or if an option is not
 *   known.
 */
export function parsePausedArgs(args: readonly string[]): PausedArgs {
  let base: string | null = null;
  const paths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--base') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--') || base !== null) {
        throw new Error(`The option --base takes one commit, branch, or tag.\n${USAGE}`);
      }
      base = value;
      i++;
    } else if (arg.startsWith('--')) {
      throw new Error(`The option "${arg}" is not known.\n${USAGE}`);
    } else {
      paths.push(arg);
    }
  }
  return { base, paths };
}

/** The config file of the run on the copy of a commit ({@link baseConfig}), in the copy. */
const BASE_CONFIG = 'paused-base.config.ts';

/**
 * Gives the text of the config file of the run on the copy of a commit: the Vitest config of the
 * commit with a cache folder in the copy. The copy reads the packages of the working tree through
 * a link, so the default cache folder, `node_modules/.vite`, is the cache of the working tree.
 *
 * @param cacheDir The cache folder, in the copy.
 * @returns The text of the file, which goes next to `vite.config.ts` of the copy.
 */
export function baseConfig(cacheDir: string): string {
  return [
    "import { mergeConfig } from 'vitest/config';",
    "import config from './vite.config.ts';",
    `export default mergeConfig(config, { cacheDir: ${JSON.stringify(cacheDir)} });`,
    '',
  ].join('\n');
}

/**
 * Gives the arguments of Vitest for a run of the paused tests with the report of the reporter of
 * the tool (`tools/paused-reporter.ts`).
 *
 * @param json The file of the report.
 * @param paths The test files, or none for all paused test files.
 * @param config The config file of the run, or `null` for the config of the tree.
 * @returns The arguments after the script of Vitest. A path that the tree does not have runs no
 *   file, and the run passes with no test (`--passWithNoTests`).
 */
export function vitestArgs(
  json: string,
  paths: readonly string[],
  config: string | null = null,
): string[] {
  return [
    'run',
    '--project',
    'paused',
    ...(config === null ? [] : [`--config=${config}`]),
    `--reporter=${REPORTER}`,
    `--outputFile=${json}`,
    '--passWithNoTests',
    ...paths,
  ];
}

/**
 * Reads the report of one run (`tools/paused-reporter.ts`).
 *
 * @param text The JSON text of the report.
 * @returns The report.
 * @throws Error if the text has no list of failed tests or of unhandled errors.
 */
export function readReport(text: string): PausedReport {
  // SAFETY: the reporter of the tool wrote the text, and the check below reads its lists.
  const report = JSON.parse(text) as Partial<PausedReport>;
  if (
    !Array.isArray(report.failed) ||
    !Array.isArray(report.errors) ||
    !Array.isArray(report.unhandled)
  ) {
    throw new Error('The report of the paused tests has no list of failed tests or of errors.');
  }
  return {
    reason: report.reason ?? '',
    failed: report.failed,
    errors: report.errors,
    unhandled: report.unhandled,
  };
}

/**
 * A failed test or an error of a run, by its title path: the file, the suites, and the test, or a
 * kind of error and its message. The parts stay apart, so that two paths whose names join to the
 * same text stay two issues.
 */
type Issue = readonly string[];

/**
 * Gives the failed tests and the errors of one run: each failed test by its title path, each error
 * of a test file or a suite outside its tests, each unhandled error, and the exit code when the run ends with a code other than 0 and the report
 * gives no failed test and no error. A crash of a run thus shows too.
 *
 * @param report The report of the run.
 * @param status The exit code of the run, or `null` when a signal ended it.
 * @returns The failed tests and the errors, in the order of the report. A test that fails two
 *   times gives two issues.
 */
export function runIssues(report: PausedReport, status: number | null): Issue[] {
  const issues: Issue[] = [
    ...report.failed,
    ...report.errors,
    ...report.unhandled.map((error) => ['(unhandled error)', error]),
  ];
  if (issues.length === 0 && status !== 0) {
    issues.push([`(exit code ${String(status)} with no failed test and no error)`]);
  }
  return issues;
}

/**
 * Writes an issue as one line: the parts of its title path with ` > `.
 *
 * @param issue The issue.
 * @returns The line.
 */
export function issueText(issue: Issue): string {
  return issue.join(' > ');
}

/**
 * Gives the tests that fail and the errors on the working tree alone: each issue of the working
 * tree that the commit does not have, such as a test that passes on the commit or that the commit
 * does not have.
 *
 * @param base The failed tests and the errors of the commit ({@link runIssues}).
 * @param tree The failed tests and the errors of the working tree.
 * @returns The issues, in the order of the working tree. Each issue counts: a test of the working
 *   tree that fails one time more than on the commit, such as a name that repeats in its file,
 *   gives one issue.
 */
export function newFailures(base: readonly Issue[], tree: readonly Issue[]): Issue[] {
  const left = new Map<string, number>();
  for (const issue of base) {
    const key = JSON.stringify(issue);
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  return tree.filter((issue) => {
    const key = JSON.stringify(issue);
    const count = left.get(key) ?? 0;
    left.set(key, count - 1);
    return count <= 0;
  });
}

/**
 * Reads the failed tests and the errors of one run ({@link runIssues}).
 *
 * @param name The name of the tree, for the message.
 * @param end The end of the run of Vitest.
 * @param json The file of the report.
 * @returns The failed tests and the errors.
 * @throws Error if the run wrote no report, with the cause from the error output.
 */
async function runFailures(name: string, end: ChildEnd, json: string): Promise<Issue[]> {
  if (!existsSync(json)) {
    const cause = end.errors.trim().split('\n').slice(-20).join('\n');
    throw new Error(
      `The paused tests of ${name} wrote no report (exit code ${String(end.status)}):\n${cause}`,
    );
  }
  return runIssues(readReport(await readFile(json, 'utf8')), end.status);
}

/**
 * Runs the paused tests on a copy of a commit and on the working tree at the same time, each in a
 * child process of `runChildren()`, and prints the tests that fail on the working tree alone. When
 * one run cannot start, the other run ends first.
 * The copy holds {@link PAUSED_PATHS} of the commit, a link to the `node_modules` of the working
 * tree, and a config file with a cache folder of its own ({@link baseConfig}). The copy goes away at the end, also after a failure and after a stop (INT or
 * TERM), which ends both runs first.
 *
 * @param ref The commit, the branch, or the tag.
 * @param paths The test files, or none for all paused test files.
 * @returns The exit code: 1 when a test fails or an error comes on the working tree alone, else 0.
 * @throws Error if git does not know the ref, or if a run writes no report.
 */
async function compareBase(ref: string, paths: readonly string[]): Promise<number> {
  const label = `${ref} (${shortHash(ref)})`;
  const started = performance.now();
  console.log(`Paused tests on ${label} and on the working tree, at the same time:`);
  return withRefTree(
    ref,
    async (dir) => {
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
      writeFileSync(join(dir, BASE_CONFIG), baseConfig(join(dir, '.vite-cache')));
      const files = { base: join(dir, 'base.json'), tree: join(dir, 'tree.json') };
      // Both runs start before the first await, so a stop ends both.
      const [baseEnd, treeEnd] = await runChildren([
        {
          command: process.execPath,
          args: [VITEST, ...vitestArgs(files.base, paths, BASE_CONFIG)],
          cwd: dir,
        },
        { command: process.execPath, args: [VITEST, ...vitestArgs(files.tree, paths)], cwd: ROOT },
      ]);
      if (!baseEnd || !treeEnd) {
        throw new Error('A run of the paused tests gave no end.');
      }
      const base = await runFailures(label, baseEnd, files.base);
      const tree = await runFailures('the working tree', treeEnd, files.tree);
      const fresh = newFailures(base, tree);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.log(
        [
          `${label}: ${base.length} failed tests and errors. The working tree: ${tree.length} failed tests and errors. ${seconds} s.`,
          fresh.length > 0
            ? `Tests that fail and errors on the working tree alone (${fresh.length}):`
            : 'No test fails and no error comes on the working tree alone.',
          ...fresh.map((issue) => `  ${issueText(issue)}`),
        ].join('\n'),
      );
      return fresh.length > 0 ? 1 : 0;
    },
    { prefix: 'test-paused-', paths: PAUSED_PATHS },
  );
}

/** Runs the tool: `node tools/test-paused.ts [--base <ref>] [<path>]...`. */
async function main(): Promise<void> {
  const { base, paths } = parsePausedArgs(process.argv.slice(2));
  if (base !== null) {
    process.exitCode = await compareBase(base, paths);
    return;
  }
  const result = spawnSync(process.execPath, [VITEST, 'run', '--project', 'paused', ...paths], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
