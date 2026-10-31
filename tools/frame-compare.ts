/**
 * Measures the frame target of design 9.7 on several commits and patches, and compares their
 * frozen shots: `pnpm frame-compare <ref|patch>... [--runs <n>] [--gate <load>] [--out <dir>]
 * [--no-frozen] [-- <flags of pnpm frame>]`.
 *
 * Each item gets a temporary tree: a commit, a branch, or a tag gives its tree, and a file that
 * ends in `.patch` gives the tree of `HEAD` with the patch. Each tree links the `node_modules` of
 * the repository, and the tool prepares the site and `perf-60.mid` of each tree one time. Then it
 * runs `tools/measure-frame.ts --long` in each tree `--runs` times (default 3), the items in
 * turns (A B A B), so that a slow change of the machine reaches each item. `--long` records the
 * main thread in five traces over the shots of `perf-60.mid`, about 3,000 frames. Each run goes
 * through `tools/measure-lock.sh run --owner frame-compare --gate <load>` (default 12). A refusal
 * (exit code 2: the CPU gate or the guard of the GPU phase) waits 60 s outside the lock and runs
 * again, at most 3 times. Then `pnpm frozen --tree` renders the frozen shots of each tree through
 * the lock, and the tool compares each item with the first item.
 *
 * It prints the median of the runs for each item, the p95 of each run with the spread, and the
 * p95 of all frames of all runs together with a block bootstrap 90% interval and the frames
 * above 4 ms in each 1,000 frames ({@link pooledStats}). Then it prints the pixel difference of
 * each shot. The output of each run is in `<out>` (default `scratch/frame-compare/`).
 */
import { spawn } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from '@playwright/test';

import { chromiumArgs } from './chromium-args.ts';
import { SHOT_NAMES, comparePngs, diffLine } from './frozen.ts';
import { FRAME_LIMIT_MS } from './measure-frame.ts';
import type { FrameTimes } from './measure-frame.ts';
import { ROOT, run, shortHash, withRefTree } from './ref-tree.ts';

/** The owner name of the measure lock. */
const OWNER = 'frame-compare';

/** The exit code of `pnpm frame` for a refusal of a guard: run again later. */
const REFUSED = 2;

/** The tries of one run of `pnpm frame`. */
const TRIES = 3;

/** The wait outside the lock after a refusal, in milliseconds. */
const RETRY_WAIT_MS = 60_000;

/** The longest time of one run of `pnpm frame` in the lock, in seconds. */
const RUN_MAX_SEC = 900;

/** One item of the command line: a commit or a patch. */
export interface CompareItem {
  /** The name in the table, such as `main (70b948a4)` or `HEAD + msaa2.patch`. */
  readonly label: string;
  /** The ref of the tree: the item itself, or `HEAD` for a patch. */
  readonly ref: string;
  /** The absolute path of the patch, or `null` for a commit. */
  readonly patch: string | null;
}

/** The command line of the tool. */
export interface CompareArgs {
  readonly items: readonly CompareItem[];
  /** The runs of `pnpm frame` for each item. */
  readonly runs: number;
  /** The load average of 1 minute below which a run starts (`tools/measure-lock.sh --gate`). */
  readonly gate: number;
  /** The output folder. */
  readonly out: string;
  /** False with `--no-frozen`: no frozen shots. */
  readonly frozen: boolean;
  /** The flags of `pnpm frame` after `--`. */
  readonly frameFlags: readonly string[];
}

/** The usage line of the tool. */
const USAGE =
  'Usage: pnpm frame-compare <ref|patch>... [--runs <n>] [--gate <load>] [--out <dir>] ' +
  '[--no-frozen] [-- <flags of pnpm frame>]';

/**
 * Reads the command line. A word that ends in `.patch` is a patch on `HEAD`, and each other word
 * that is no option is a ref.
 *
 * @param args The arguments after the script.
 * @returns The arguments.
 * @throws Error with fewer than one item, a missing patch, or an option with no valid value.
 */
export function compareArgs(args: readonly string[]): CompareArgs {
  const end = args.indexOf('--');
  const own = end < 0 ? args : args.slice(0, end);
  const frameFlags = end < 0 ? [] : args.slice(end + 1);
  const items: CompareItem[] = [];
  let runs = 3;
  let gate = 12;
  let out = join(ROOT, 'scratch', 'frame-compare');
  let frozen = true;
  for (let i = 0; i < own.length; i++) {
    const word = own[i] ?? '';
    const value = own[i + 1];
    if (word === '--runs' || word === '--gate') {
      const number = Number(value);
      if (!(number > 0)) {
        throw new Error(`${word} needs a positive number. ${USAGE}`);
      }
      if (word === '--runs') {
        runs = Math.round(number);
      } else {
        gate = number;
      }
      i += 1;
    } else if (word === '--out') {
      if (!value) {
        throw new Error(USAGE);
      }
      out = resolve(value);
      i += 1;
    } else if (word === '--no-frozen') {
      frozen = false;
    } else if (word.startsWith('--')) {
      throw new Error(`No option ${word}. ${USAGE}`);
    } else if (word.endsWith('.patch')) {
      const patch = resolve(word);
      if (!existsSync(patch)) {
        throw new Error(`No patch ${patch}.`);
      }
      items.push({ label: `HEAD + ${basename(patch)}`, ref: 'HEAD', patch });
    } else {
      items.push({ label: word, ref: word, patch: null });
    }
  }
  if (items.length === 0) {
    throw new Error(USAGE);
  }
  return { items, runs, gate, out, frozen, frameFlags };
}

/** The values of one run of `pnpm frame`, in milliseconds, or `null` for a missing row. */
export interface FrameRun {
  /** The main thread: p50 and p95. */
  readonly main: readonly [number, number] | null;
  /** The GPU row of the Metal trace: p50 and p95. */
  readonly gpu: readonly [number, number] | null;
  /** The frame rate with no frame cap, in frames each second. */
  readonly uncapped: number | null;
  /** The time of each frame of the run (`--frames` of `measure-frame.ts`), or `null`. */
  readonly times: FrameTimes | null;
}

/**
 * Reads the p50 and the p95 of a row of the table of `pnpm frame`.
 *
 * @param output The output of the run.
 * @param start The start of the row, such as `| Main thread`.
 * @returns The two values, or `null`.
 */
function rowValues(output: string, start: string): readonly [number, number] | null {
  const line = output.split('\n').find((row) => row.startsWith(start));
  const cells = line?.split('|').map((cell) => cell.trim());
  const p50 = Number(cells?.[3]);
  const p95 = Number(cells?.[4]);
  return Number.isFinite(p50) && Number.isFinite(p95) && cells ? [p50, p95] : null;
}

/**
 * Reads the values of one run from the output of `pnpm frame`.
 *
 * @param output The output.
 * @returns The values.
 */
export function frameRun(output: string, times: FrameTimes | null = null): FrameRun {
  const rate = /([\d.]+) fps with no cap/.exec(output)?.[1];
  return {
    main: rowValues(output, '| Main thread'),
    gpu: rowValues(output, '| GPU: WebGL frames in the Metal trace'),
    uncapped: rate === undefined ? null : Number(rate),
    times,
  };
}

/** The frames of all runs of one item together ({@link pooledStats}). */
export interface PooledStats {
  /** The count of the frames. */
  readonly count: number;
  /** The p95 of all frames, at the nearest rank, in milliseconds. */
  readonly p95: number;
  /** The 5th and the 95th percentile of the p95 of the bootstrap draws, in milliseconds. */
  readonly interval: readonly [number, number];
  /** The frames above the limit of design 9.7 in each 1,000 frames. */
  readonly overPerThousand: number;
}

/** The count of the bootstrap draws of {@link pooledStats}. */
const DRAWS = 1000;

/**
 * The frames of one block of the bootstrap: one second at 60 fps. Slow frames come in groups,
 * such as the frames of one shot, so the draws take whole blocks of frames in their order.
 */
const BLOCK = 60;

/**
 * Gives the value at the nearest rank of a sorted list, as `frameStats()` of `measure-frame.ts`.
 *
 * @param sorted The values, in increasing order.
 * @param q The share, such as 0.95.
 * @returns The value, or 0 for an empty list.
 */
function rank(sorted: ArrayLike<number>, q: number): number {
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
}

/**
 * Gives a seeded generator of numbers from 0 to 1 (mulberry32), so that each table repeats.
 *
 * @param seed The seed.
 * @returns The generator.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calculates the statistics of the frames of all runs of one item together: the p95, a block
 * bootstrap 90% interval of the p95, and the frames above {@link FRAME_LIMIT_MS} in each 1,000
 * frames. Each draw takes as many blocks of {@link BLOCK} frames as the runs have, with
 * replacement, from all runs.
 *
 * @param runs The time of each frame of each run, in milliseconds.
 * @returns The statistics, or `null` with no frame.
 */
export function pooledStats(runs: readonly (readonly number[])[]): PooledStats | null {
  const all = Float64Array.from(runs.flat()).toSorted();
  if (all.length === 0) {
    return null;
  }

  const blocks = runs.flatMap((frames) =>
    Array.from({ length: Math.ceil(frames.length / BLOCK) }, (_, b) =>
      frames.slice(b * BLOCK, (b + 1) * BLOCK),
    ),
  );
  const random = seeded(9.7e6);
  const draws = new Float64Array(DRAWS);
  for (let d = 0; d < DRAWS; d++) {
    const sample: number[] = [];
    for (let b = 0; b < blocks.length; b++) {
      sample.push(...(blocks[Math.floor(random() * blocks.length)] ?? []));
    }
    draws[d] = rank(Float64Array.from(sample).toSorted(), 0.95);
  }
  const sortedDraws = draws.toSorted();
  const over = all.length - all.findIndex((time) => time > FRAME_LIMIT_MS);
  return {
    count: all.length,
    p95: rank(all, 0.95),
    interval: [rank(sortedDraws, 0.05), rank(sortedDraws, 0.95)],
    overPerThousand: all.some((time) => time > FRAME_LIMIT_MS) ? (over / all.length) * 1000 : 0,
  };
}

/**
 * Gives the lines of the table of the runs: the p95 of each run and their spread, and the
 * statistics of all frames together ({@link pooledStats}), for the main thread and the GPU.
 *
 * @param labels The label of each item.
 * @param runs The runs of each item.
 * @returns The lines of the table.
 */
export function spreadTable(
  labels: readonly string[],
  runs: readonly (readonly FrameRun[])[],
): string[] {
  const lines = [
    '| Item | Row | p95 of each run | Spread | p95 of all frames (90% interval) | Above 4 ms per 1,000 | Frames |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const [i, label] of labels.entries()) {
    const done = (runs[i] ?? []).filter((one) => one.times !== null);
    for (const [row, pick] of [
      ['Main thread', (times: FrameTimes) => times.main],
      ['GPU', (times: FrameTimes) => times.gpu],
    ] as const) {
      const frames = done.map((one) => (one.times ? pick(one.times) : []));
      const each = frames.map((list) => rank(Float64Array.from(list).toSorted(), 0.95));
      const stats = pooledStats(frames);
      const spread = each.length > 0 ? Math.max(...each) - Math.min(...each) : NaN;
      const cells = stats
        ? [
            each.map((value) => value.toFixed(2)).join(', '),
            spread.toFixed(2),
            `${stats.p95.toFixed(2)} (${stats.interval[0].toFixed(2)} to ${stats.interval[1].toFixed(2)})`,
            stats.overPerThousand.toFixed(1),
            String(stats.count),
          ]
        : ['-', '-', '-', '-', '0'];
      lines.push(`| ${label} | ${row} | ${cells.join(' | ')} |`);
    }
  }
  return lines;
}

/**
 * Gives the median of numbers: the middle value, or the mean of the two middle values.
 *
 * @param values The values.
 * @returns The median, or `null` with no value.
 */
export function median(values: readonly number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return null;
  }
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Gives the cell of a pair of medians, such as `4.63 / 5.61`.
 *
 * @param runs The runs.
 * @param pick The pair of a run.
 * @returns The cell, or `-` with no value.
 */
function pairCell(
  runs: readonly FrameRun[],
  pick: (run: FrameRun) => readonly [number, number] | null,
): string {
  const pairs = runs.map(pick).filter((pair) => pair !== null);
  const p50 = median(pairs.map((pair) => pair[0]));
  const p95 = median(pairs.map((pair) => pair[1]));
  return p50 === null || p95 === null ? '-' : `${p50.toFixed(2)} / ${p95.toFixed(2)}`;
}

/**
 * Runs a command in the repository root and gives its exit code. The output goes to a file and,
 * line by line, to the console with a prefix.
 *
 * @param command The command.
 * @param args The arguments.
 * @param log The file of the output.
 * @param prefix The prefix of the lines on the console.
 * @returns The exit code, or 1 after a signal.
 */
async function runLogged(
  command: string,
  args: readonly string[],
  log: string,
  prefix: string,
): Promise<number> {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const read = (chunk: Buffer): void => {
    const text = chunk.toString();
    output += text;
    for (const line of text.split('\n')) {
      if (/^(\| |CPU use|Frame rate|measure-lock|The frame target)/.test(line)) {
        console.log(`${prefix} ${line}`);
      }
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  const code = await new Promise<number>((done) => {
    child.on('close', (status) => {
      done(status ?? 1);
    });
  });
  await writeFile(log, output);
  return code;
}

/**
 * Runs `tools/measure-frame.ts --long` of a prepared tree through the measure lock, and runs it
 * again after a refusal.
 *
 * @param tree The root of the tree, with its site and `perf-60.mid` ({@link prepareTree}).
 * @param args The command line.
 * @param log The file of the output of the last try. The times of the frames go beside it.
 * @param prefix The prefix of the lines on the console.
 * @returns The values of the run, or `null` after the last refusal or a failure.
 */
async function frameIn(
  tree: string,
  args: CompareArgs,
  log: string,
  prefix: string,
): Promise<FrameRun | null> {
  const timesFile = log.replace(/\.txt$/, '.frames.json');
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    const lock = ['run', '--owner', OWNER, '--gate', String(args.gate), '--max'];
    const script = join(tree, 'tools', 'measure-frame.ts');
    const frame = ['node', script, '--long', `--frames=${timesFile}`, ...args.frameFlags];
    const code = await runLogged(
      join(ROOT, 'tools', 'measure-lock.sh'),
      [...lock, String(RUN_MAX_SEC), '--', ...frame],
      log,
      prefix,
    );
    // Exit code 0 passes the target, and 1 fails it. Both give a table.
    if (code === 0 || code === 1) {
      // SAFETY: measure-frame.ts writes this file as JSON of FrameTimes.
      const times = JSON.parse(await readFile(timesFile, 'utf8')) as FrameTimes;
      return frameRun(await readFile(log, 'utf8'), times);
    }
    if (code !== REFUSED || attempt === TRIES) {
      console.log(`${prefix} pnpm frame ended with ${code}. See ${log}.`);
      return null;
    }
    console.log(`${prefix} refused (try ${attempt} of ${TRIES}): a new try in 60 s.`);
    await delay(RETRY_WAIT_MS);
  }
  return null;
}

/**
 * Prepares a tree one time for all its runs, as the script `pnpm frame` does before each run:
 * the files of the site (`pnpm prepare-site`) and `perf-60.mid`.
 *
 * @param tree The root of the tree.
 * @throws Error if a step fails.
 */
function prepareTree(tree: string): void {
  run('pnpm', ['prepare-site'], tree);
  run('node', ['tools/write-perf-60.ts'], tree);
}

/**
 * Makes a temporary tree for each item, one inside the other, and gives the roots to a function.
 * Each tree goes away at the end, also after a failure or a stop.
 *
 * @param items The items.
 * @param use The function that reads the roots, in the order of the items.
 * @param roots The roots of the trees made so far.
 * @returns The result of the function.
 */
async function withTrees<T>(
  items: readonly CompareItem[],
  use: (roots: readonly string[]) => Promise<T>,
  roots: readonly string[] = [],
): Promise<T> {
  const [item, ...rest] = items;
  if (!item) {
    return use(roots);
  }
  return withRefTree(
    item.ref,
    async (dir) => {
      if (item.patch !== null) {
        run('git', ['apply', item.patch], dir);
      }
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
      prepareTree(dir);
      return withTrees(rest, use, [...roots, dir]);
    },
    { prefix: 'frame-compare-' },
  );
}

async function main(): Promise<void> {
  const args = compareArgs(process.argv.slice(2));
  const items = args.items.map((item) =>
    item.patch === null ? { ...item, label: `${item.label} (${shortHash(item.ref)})` } : item,
  );
  await mkdir(args.out, { recursive: true });

  await withTrees(items, async (roots) => {
    const runs: FrameRun[][] = items.map(() => []);
    for (let r = 1; r <= args.runs; r++) {
      for (const [i, item] of items.entries()) {
        const prefix = `[${item.label}, run ${r}]`;
        const log = join(args.out, `item${i + 1}-run${r}.txt`);
        const result = await frameIn(roots[i] ?? ROOT, args, log, prefix);
        if (result) {
          runs[i]?.push(result);
        }
      }
    }

    const lines = [
      '| Item | Runs | Main thread p50 / p95 | GPU p50 / p95 | Frame rate with no cap |',
      '|---|---|---|---|---|',
    ];
    for (const [i, item] of items.entries()) {
      const done = runs[i] ?? [];
      const rates = done.map((one) => one.uncapped).filter((rate) => rate !== null);
      const rate = median(rates);
      const thread = pairCell(done, (one) => one.main);
      const gpu = pairCell(done, (one) => one.gpu);
      const fps = rate === null ? '-' : `${rate.toFixed(1)} fps`;
      lines.push(
        `| ${item.label} | ${done.length} of ${args.runs} | ${thread} | ${gpu} | ${fps} |`,
      );
    }
    const command = ['pnpm frame --long', ...args.frameFlags].join(' ');
    console.log(`\nMedian of the runs (ms), ${command}:\n`);
    console.log(lines.join('\n'));
    const spread = spreadTable(
      items.map((item) => item.label),
      runs,
    );
    console.log('\nEach run and all frames together (ms):\n');
    console.log(spread.join('\n'));
    await writeFile(join(args.out, 'table.md'), `${[...lines, '', ...spread].join('\n')}\n`);
    if (!args.frozen || items.length < 2) {
      return;
    }

    for (const [i, item] of items.entries()) {
      const folder = join(args.out, `frozen-item${i + 1}`);
      const frozen = ['node', 'tools/frozen.ts', '--tree', roots[i] ?? ROOT, '--out', folder];
      const code = await runLogged(
        join(ROOT, 'tools', 'measure-lock.sh'),
        ['run', '--owner', OWNER, '--', ...frozen],
        join(args.out, `frozen-item${i + 1}.txt`),
        `[${item.label}, frozen]`,
      );
      if (code !== 0) {
        throw new Error(`pnpm frozen --tree failed for ${item.label} with ${code}.`);
      }
    }
    const browser = await chromium.launch({ channel: 'chrome', args: chromiumArgs('darwin') });
    try {
      for (const [i, item] of items.entries()) {
        if (i === 0) {
          continue;
        }
        console.log(`\n${item.label} against ${items[0]?.label ?? ''}:`);
        for (const shot of SHOT_NAMES) {
          const [a, b] = await Promise.all([
            readFile(join(args.out, 'frozen-item1', 'tree', `${shot}.png`)),
            readFile(join(args.out, `frozen-item${i + 1}`, 'tree', `${shot}.png`)),
          ]);
          console.log(diffLine(shot, await comparePngs(browser, a, b)));
        }
      }
    } finally {
      await browser.close();
    }
  });
}

if (import.meta.main) {
  await main();
}
