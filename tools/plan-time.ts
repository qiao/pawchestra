/**
 * Times the shot planner (`prepareShots()`, design 5.6) on each demo after the changes of
 * `demos/patches.json`, on the working tree and on each commit of `--base`.
 *
 * The tool takes the measure lock (`tools/measure-lock.sh run --owner plan-time --gate <load>`,
 * default 12), so do not run it inside the lock. In the lock, each tree runs in a child process
 * of its own, the trees in turns (`--turns`, default 5), so that a slow change of the machine
 * reaches each tree. A child plans each demo one time to warm up, then `--runs` times (default 5),
 * and gives the median. The table gives, for each demo, the median of the turns of each tree, and
 * the ratio of the working tree to the first tree. The total is the sum of the demos. The load
 * average shows at the start and at the end, because a load above about 10 makes one run invalid.
 *
 * A commit gets the script of the working tree, so each tree runs the same measure.
 *
 * Usage: pnpm plan-time [--base <ref>]... [--demo <id>]... [--runs <n>] [--turns <n>]
 *        [--gate <load>]
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';

import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { buildScore } from '../src/score/score.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import { patchedDemos } from './patch-demos.ts';
import { ROOT, runChild, shortHash, withProbeTree } from './ref-tree.ts';

/** The owner name of the measure lock. */
const OWNER = 'plan-time';

/** The variable that tells the tool that it runs in the measure lock. */
const LOCKED = 'PLAN_TIME_LOCKED';

/** The longest time of the tool in the lock, in seconds. */
const LOCK_MAX_SEC = 1800;

/** The usage text of the tool. */
const USAGE =
  'Usage: pnpm plan-time [--base <ref>]... [--demo <id>]... [--runs <n>] [--turns <n>] [--gate <load>]';

/** The command line of the tool. */
export interface PlanTimeArgs {
  /** The commits to time beside the working tree, in their order. */
  readonly bases: readonly string[];
  /** The demos with no `.mid`, or none for all demos. */
  readonly demos: readonly string[];
  /** The timed runs of each demo in one child, after one run to warm up. */
  readonly runs: number;
  /** The turns of the trees. */
  readonly turns: number;
  /** The load average of 1 minute below which the lock starts the tool. */
  readonly gate: number;
  /** The file for the times of one child, or `null` for the parent. */
  readonly child: string | null;
}

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The command line.
 * @throws Error for an unknown option, a missing value, or a count that is not a whole number
 *   above 0.
 */
export function parsePlanTimeArgs(args: readonly string[]): PlanTimeArgs {
  const bases: string[] = [];
  const demos: string[] = [];
  let runs = 5;
  let turns = 5;
  let gate = 12;
  let child: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i] ?? '';
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option "${flag}" has no value.\n${USAGE}`);
    }
    i++;
    const count = (): number => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`The option ${flag} takes a whole number above 0, not "${value}".`);
      }
      return n;
    };
    if (flag === '--base') {
      bases.push(value);
    } else if (flag === '--demo') {
      demos.push(value.replace(/\.mid$/, ''));
    } else if (flag === '--runs') {
      runs = count();
    } else if (flag === '--turns') {
      turns = count();
    } else if (flag === '--gate') {
      gate = Number(value);
    } else if (flag === '--child') {
      child = value;
    } else {
      throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  return { bases, demos, runs, turns, gate, child };
}

/**
 * Times the planner on each demo in this process: one run to warm up, then the median of the
 * timed runs, in milliseconds.
 *
 * @param demos The demos with no `.mid`, or none for all demos.
 * @param runs The timed runs of each demo.
 * @returns The median of each demo, by its name.
 * @throws Error if `buildScore()` refuses a demo.
 */
export async function timeDemos(
  demos: readonly string[],
  runs: number,
): Promise<Record<string, number>> {
  const times: Record<string, number> = {};
  for (const demo of await patchedDemos()) {
    const name = demo.file.replace(/\.mid$/, '');
    if (demos.length > 0 && !demos.includes(name)) {
      continue;
    }
    const result = buildScore(demo.bytes, 'auto');
    if (!result.ok) {
      throw new Error(`buildScore() refused the demo ${name}: ${result.error}.`);
    }
    const models = new ModelCache();
    const layout = layoutScene(result.score, models);
    prepareShots(result.score, layout, SHOT_SEED, models);
    const each: number[] = [];
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      prepareShots(result.score, layout, SHOT_SEED, models);
      each.push(performance.now() - start);
    }
    times[name] = median(each);
  }
  return times;
}

/**
 * Gives the median of numbers.
 *
 * @param values The numbers.
 * @returns The median, or 0 with no numbers.
 */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** One tree of the measure. */
interface TimedTree {
  /** The name in the table, such as `0d7a8555` or `tree`. */
  readonly label: string;
  /** The folder of the tree. */
  readonly dir: string;
  /** The median of each demo in each turn, by the name of the demo. */
  readonly turns: Record<string, number>[];
}

/**
 * Extracts the tree of each commit ({@link withProbeTree}), with the script of the working tree,
 * and gives the folders to a function. The folders go away at the end.
 *
 * @param refs The commits.
 * @param use The function that reads the folders, in the order of the commits.
 * @param dirs The folders so far.
 * @returns The result of the function.
 */
function withTrees<T>(
  refs: readonly string[],
  use: (dirs: readonly string[]) => Promise<T>,
  dirs: readonly string[] = [],
): Promise<T> {
  const [first, ...rest] = refs;
  if (first === undefined) {
    return use(dirs);
  }
  return withProbeTree(first, (dir) => withTrees(rest, use, [...dirs, dir]), {
    parent: tmpdir(),
    prefix: 'plan-time-',
    scripts: ['plan-time.ts'],
  });
}

/**
 * Times each tree in turns, and gives the table.
 *
 * @param args The command line.
 * @returns The lines of the table.
 */
async function timeTrees(args: PlanTimeArgs): Promise<string[]> {
  const out = await mkdtemp(join(tmpdir(), 'plan-time-out-'));
  try {
    return await withTrees(args.bases, async (dirs) => {
      const trees: TimedTree[] = [
        ...args.bases.map((ref, i) => ({ label: shortHash(ref), dir: dirs[i] ?? ROOT, turns: [] })),
        { label: 'tree', dir: ROOT, turns: [] },
      ];
      const childArgs = [
        '--runs',
        String(args.runs),
        ...args.demos.flatMap((demo) => ['--demo', demo]),
      ];
      for (let turn = 0; turn < args.turns; turn++) {
        for (const [i, tree] of trees.entries()) {
          const file = join(out, `${turn}-${i}.json`);
          await runChild(
            process.execPath,
            [join('tools', 'plan-time.ts'), ...childArgs, '--child', file],
            tree.dir,
          );
          // SAFETY: the child of this script writes its times as a JSON object of numbers.
          tree.turns.push(JSON.parse(await readFile(file, 'utf8')) as Record<string, number>);
        }
      }
      return tableLines(trees);
    });
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/**
 * Writes the table of the times: one row for each demo and the total, one column for each tree,
 * and the ratio of the working tree to the first tree.
 *
 * @param trees The trees with their times.
 * @returns The lines.
 */
function tableLines(trees: readonly TimedTree[]): string[] {
  const first = trees[0];
  const last = trees.at(-1);
  const names = Object.keys(last?.turns[0] ?? {});
  const totals = trees.map(() => 0);
  const lines = [
    `| Demo | ${trees.map((t) => `${t.label} ms`).join(' | ')} | Ratio |`,
    `|---|${trees.map(() => '---:').join('|')}|---:|`,
  ];
  const ratio = (a: number, b: number): string => (a > 0 ? (b / a).toFixed(2) : '-');
  for (const name of names) {
    const values = trees.map((tree, i) => {
      const value = median(tree.turns.map((turn) => turn[name] ?? 0));
      totals[i] = (totals[i] ?? 0) + value;
      return value;
    });
    lines.push(
      `| ${name} | ${values.map((v) => v.toFixed(1)).join(' | ')} | ${ratio(values[0] ?? 0, values.at(-1) ?? 0)} |`,
    );
  }
  lines.push(
    `| total | ${totals.map((v) => v.toFixed(1)).join(' | ')} | ${ratio(totals[0] ?? 0, totals.at(-1) ?? 0)} |`,
  );
  if (first && last && first !== last) {
    lines.push('', `Ratio: ${last.label} / ${first.label}, from the median of each demo.`);
  }
  return lines;
}

/**
 * Runs the tool again in the measure lock, with the same arguments.
 *
 * @param args The arguments after the script.
 * @param gate The load average of the gate.
 * @returns The exit code of the lock.
 */
function runLocked(args: readonly string[], gate: number): number {
  const result = spawnSync(
    join(ROOT, 'tools', 'measure-lock.sh'),
    [
      'run',
      '--owner',
      OWNER,
      '--gate',
      String(gate),
      '--max',
      String(LOCK_MAX_SEC),
      '--',
      process.execPath,
      join(ROOT, 'tools', 'plan-time.ts'),
      ...args,
    ],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, [LOCKED]: '1' } },
  );
  return result.status ?? 1;
}

/**
 * Formats the load averages of 1, 5, and 15 minutes.
 *
 * @returns The text, such as `7.4 7.3 9.9`.
 */
function loadText(): string {
  return loadavg()
    .map((v) => v.toFixed(1))
    .join(' ');
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  try {
    const args = parsePlanTimeArgs(argv);
    if (args.child !== null) {
      await writeFile(args.child, JSON.stringify(await timeDemos(args.demos, args.runs)));
    } else if (process.env[LOCKED] !== '1') {
      process.exit(runLocked(argv, args.gate));
    } else {
      console.log(`Load average at the start: ${loadText()}.`);
      const lines = await timeTrees(args);
      console.log(
        [
          ...lines,
          `${args.turns} turns, ${args.runs} runs of each demo in each turn.`,
          `Load average at the end: ${loadText()}.`,
        ].join('\n'),
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
