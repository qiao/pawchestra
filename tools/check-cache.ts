/**
 * The plans and the cache keys of `tools/check-commits.sh`. The result of a check is a fact of the
 * tree, so the script keeps each passed check under its key, and skips a commit with a known key.
 *
 * Run: `node tools/check-cache.ts plan <commit|tip> <rev>...`. For each revision, it prints a line
 * `commit<TAB><hash><TAB><key>`, then a line `check<TAB><name><TAB><command>` for each check. The
 * module reads git and the files of the repository, and it runs no check.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The kind of a check: the check of one commit, or the full unit suite on the last commit. */
export type CheckKind = 'commit' | 'tip';

/** One check of a plan. */
export interface Check {
  /** The name of the check in the report, such as "lint". */
  readonly name: string;
  /** The shell command of the check. The check passes when the command exits with 0. */
  readonly command: string;
}

/** The parts of a cache key that are the same for each commit of one run. */
interface RunParts {
  /** The SHA-256 of `tools/check-commits.sh` and of this module. */
  readonly scriptHash: string;
  /** The version, the platform, and the architecture of Node. */
  readonly node: string;
  /** The version of pnpm. */
  readonly pnpm: string;
  /** The value of `PAWCHESTRA_BASE`, the base path of the site, or empty when it is not set. */
  readonly siteBase: string;
  /** The SHA-256 of the lockfile that `pnpm install` used, or "none" with no install. */
  readonly modulesHash: string;
}

/** The parts of a cache key. A change of one part gives a new key. */
export interface CheckKeyParts extends RunParts {
  /** The kind of the check. */
  readonly kind: CheckKind;
  /** The tree hash of the commit. */
  readonly tree: string;
  /**
   * The tree hash of the parent commit, because the reached tests depend on the diff. It is empty
   * for the full suite, which does not read the diff.
   */
  readonly parentTree: string;
  /** The checks of the plan, in their order. */
  readonly checks: readonly Check[];
}

/** A line of a test file that `git grep -n` found. */
interface GrepLine {
  /** The path of the test file, from the root of the repository. */
  readonly path: string;
  /** The text of the line. */
  readonly text: string;
}

/** The plan of one revision: its commit, its cache key, and its checks. */
interface CheckPlan {
  /** The full hash of the commit. */
  readonly commit: string;
  /** The cache key: a SHA-256 in hex. */
  readonly key: string;
  /** The checks, in their order. */
  readonly checks: readonly Check[];
}

/** The lint of the repository. */
const LINT: Check = { name: 'lint', command: 'pnpm -s lint' };

/** The typecheck of the repository. */
const TYPECHECK: Check = { name: 'typecheck', command: 'pnpm -s typecheck' };

/** The unit tests that the changes of the commit reach through the imports. */
const REACHED_TESTS: Check = {
  name: 'reached tests',
  command: 'pnpm -s test --changed HEAD~1 --passWithNoTests',
};

/** The format check of the repository. */
const FORMAT: Check = { name: 'format', command: 'pnpm -s format:check' };

/** The full unit suite. */
const FULL_SUITE: Check = { name: 'full suite', command: 'pnpm -s test' };

/**
 * A text in a test that names a docs path: a path in `docs/`, a `'docs'` path part, or the end of
 * a Markdown file name.
 */
const DOCS_PATH_TEXT = /docs\/|['"`]docs['"`]|\.md['"`]/;

/**
 * Tells if a changed path is a docs path: a file in `docs/` or a Markdown file. A commit with only
 * docs paths cannot change the lint, the typecheck, or a test that imports its module.
 *
 * @param path The path from the root of the repository.
 * @returns True for a docs path.
 */
export function isDocsPath(path: string): boolean {
  return path.startsWith('docs/') || path.endsWith('.md');
}

/**
 * Finds the test files that read a docs path. Vitest finds no change of a file that a test reads
 * with no import, so `--changed` does not run these tests. A comment line does not count.
 *
 * @param lines The lines of the test files that hold "docs" or ".md".
 * @returns The paths of the test files, sorted, each one time.
 */
export function docsReadingTests(lines: readonly GrepLine[]): string[] {
  const paths = new Set<string>();
  for (const { path, text } of lines) {
    const trimmed = text.trimStart();
    const comment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    if (!comment && DOCS_PATH_TEXT.test(text)) {
      paths.add(path);
    }
  }
  return [...paths].toSorted();
}

/**
 * Gives the checks of one commit. A commit that changes only docs paths skips the lint, the
 * typecheck, and the reached tests. A commit that changes a docs path runs the tests that read
 * docs paths. Each commit runs the format check.
 *
 * @param changedPaths The paths that the commit changes, with the old and the new path of a move.
 * @param docsTests The test files that read a docs path, from {@link docsReadingTests}.
 * @returns The checks, in their order.
 */
export function commitChecks(
  changedPaths: readonly string[],
  docsTests: readonly string[],
): Check[] {
  const checks: Check[] = [];
  if (!changedPaths.every(isDocsPath)) {
    checks.push(LINT, TYPECHECK, REACHED_TESTS);
  }
  if (changedPaths.some(isDocsPath) && docsTests.length > 0) {
    checks.push({ name: 'docs tests', command: `pnpm -s test ${docsTests.join(' ')}` });
  }
  checks.push(FORMAT);
  return checks;
}

/**
 * Gives the checks of the last commit with the full unit suite.
 *
 * @returns The checks.
 */
export function tipChecks(): Check[] {
  return [FULL_SUITE];
}

/**
 * Calculates the cache key of a check. Each part goes into the hash in a fixed order.
 *
 * @param parts The parts of the key.
 * @returns The key: a SHA-256 in hex.
 */
export function checkKey(parts: CheckKeyParts): string {
  const fields = [
    'check-cache 1',
    parts.kind,
    parts.tree,
    parts.parentTree,
    parts.checks.map((check) => [check.name, check.command]),
    parts.scriptHash,
    parts.node,
    parts.pnpm,
    parts.siteBase,
    parts.modulesHash,
  ];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

/**
 * Parses the output of `git grep -n <rev> -- <paths>`. Each line is `<rev>:<path>:<line>:<text>`.
 *
 * @param output The output of git.
 * @param rev The revision that git searched.
 * @returns The lines.
 */
export function parseGrepOutput(output: string, rev: string): GrepLine[] {
  const lines: GrepLine[] = [];
  for (const line of output.split('\n')) {
    const match = line.startsWith(`${rev}:`)
      ? /^([^:]+):\d+:(.*)$/.exec(line.slice(rev.length + 1))
      : null;
    if (match?.[1] !== undefined && match[2] !== undefined) {
      lines.push({ path: match[1], text: match[2] });
    }
  }
  return lines;
}

/**
 * Runs git and gives its output.
 *
 * @param args The arguments of git.
 * @returns The output, with no newline at the end.
 */
function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}

/**
 * Finds the test files of a commit that read a docs path.
 *
 * @param commit The full hash of the commit.
 * @returns The paths of the test files.
 */
function docsTestsOf(commit: string): string[] {
  const result = spawnSync(
    'git',
    ['grep', '-n', '-I', '-F', '-e', 'docs', '-e', '.md', commit, '--', '*.test.ts'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // git grep exits with 1 when no line matches.
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git grep failed in ${commit}: ${result.stderr}`);
  }
  return docsReadingTests(parseGrepOutput(result.stdout, commit));
}

/**
 * Gives the plan of a revision from git, with no checkout.
 *
 * @param kind The kind of the check.
 * @param rev The revision.
 * @param run The parts of the key that are the same for each commit of the run.
 * @returns The plan.
 * @throws When the commit has no parent.
 */
function planOf(kind: CheckKind, rev: string, run: RunParts): CheckPlan {
  const commit = git(['rev-parse', '--verify', `${rev}^{commit}`]);
  const tree = git(['rev-parse', `${commit}^{tree}`]);
  if (kind === 'tip') {
    const checks = tipChecks();
    const key = checkKey({ ...run, kind, tree, parentTree: '', checks });
    return { commit, key, checks };
  }

  const parentTree = git(['rev-parse', '--verify', `${commit}^^{tree}`]);
  const changed = git(['diff', '--name-only', '--no-renames', parentTree, tree]);
  const changedPaths = changed === '' ? [] : changed.split('\n');
  const docsTests = changedPaths.some(isDocsPath) ? docsTestsOf(commit) : [];
  const checks = commitChecks(changedPaths, docsTests);
  const key = checkKey({ ...run, kind, tree, parentTree, checks });
  return { commit, key, checks };
}

/**
 * Calculates the SHA-256 of the check script and of this module. A copy of both files in a
 * temporary folder gives the same hash.
 *
 * @returns The hash in hex.
 */
function scriptHashOf(): string {
  return createHash('sha256')
    .update(readFileSync(new URL('./check-commits.sh', import.meta.url)))
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex');
}

/**
 * Calculates the SHA-256 of the lockfile that `pnpm install` used in the worktree. The checks of
 * an old commit run with the packages of the last install, so the key holds them.
 *
 * @returns The hash in hex, or "none" when the worktree has no install.
 */
function modulesHashOf(): string {
  const lock = join(git(['rev-parse', '--show-toplevel']), 'node_modules', '.pnpm', 'lock.yaml');
  if (!existsSync(lock)) {
    return 'none';
  }
  return createHash('sha256').update(readFileSync(lock)).digest('hex');
}

/**
 * Prints the plan of each revision.
 *
 * @param args The arguments: `plan`, the kind, and the revisions.
 * @throws When the arguments are wrong.
 */
function main(args: readonly string[]): void {
  const [command, kind, ...revs] = args;
  if (command !== 'plan' || (kind !== 'commit' && kind !== 'tip') || revs.length === 0) {
    throw new Error('Usage: node tools/check-cache.ts plan <commit|tip> <rev>...');
  }

  const run: RunParts = {
    scriptHash: scriptHashOf(),
    node: `${process.version} ${process.platform}-${process.arch}`,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    siteBase: process.env['PAWCHESTRA_BASE'] ?? '',
    modulesHash: modulesHashOf(),
  };
  const lines: string[] = [];
  for (const rev of revs) {
    const plan = planOf(kind, rev, run);
    lines.push(`commit\t${plan.commit}\t${plan.key}`);
    for (const check of plan.checks) {
      lines.push(`check\t${check.name}\t${check.command}`);
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
