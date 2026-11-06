/**
 * Records a CPU profile of the main thread during play and prints the time of each function for
 * each frame (design 9.7): `pnpm cpu-profile [--demo <id>] [--seek <s>] [--sec <n>] [--top <n>]
 * [--out <file>] [--in <file>] [--callers <function>[:<line>]] [--depth <n>]`.
 *
 * The tool serves the working tree with the Vite dev server, plays the demo (default `perf-60`) in
 * Google Chrome with the flags of `pnpm frame` at 1440 × 900 and the device scale 2, seeks to the
 * song time (default 32 s, the section shot of the Chrome trace of `pnpm frame`), and samples the
 * main thread every 100 µs for `--sec` seconds (default 10). It writes the profile to `--out`
 * (default `scratch/cpu-profile.cpuprofile`), and prints the self time and the total time of the
 * top functions for each frame at 60 fps. The total time of a function holds the time of the
 * functions that it calls, and counts each sample one time for each function. `--in` reads a
 * saved profile in place of a record. `--callers` prints the paths of the callers of a function
 * by their time, up to `--depth` callers (default 6): for example `update:18279` finds the calls
 * of `Skeleton.update()` of three.js in each render of a frame.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { chromiumArgs } from './chromium-args.ts';
import { ROOT, optionValue } from './ref-tree.ts';

/** The frame rate that the times of each frame assume. */
const FRAME_RATE = 60;

/** One node of the call tree of a CPU profile of the DevTools protocol. */
export interface ProfileNode {
  readonly id: number;
  /** The function of the node. */
  readonly callFrame: {
    /** The name of the function, or an empty text for an anonymous function. */
    readonly functionName: string;
    /** The URL of the script. */
    readonly url: string;
    /** The line of the function, from 0. */
    readonly lineNumber: number;
  };
  /** The ids of the nodes that the function calls. */
  readonly children?: readonly number[];
}

/** A CPU profile of the DevTools protocol (`Profiler.stop`). */
export interface CpuProfile {
  readonly nodes: readonly ProfileNode[];
  /** The start of the profile, in microseconds. */
  readonly startTime: number;
  /** The end of the profile, in microseconds. */
  readonly endTime: number;
  /** The node of each sample. */
  readonly samples?: readonly number[];
  /** The time from the sample before to each sample, in microseconds. */
  readonly timeDeltas?: readonly number[];
}

/** The command line of the tool. */
export interface CpuProfileArgs {
  readonly demo: string;
  /** The song time of the seek, in seconds. */
  readonly seek: number;
  /** The length of the record, in seconds. */
  readonly sec: number;
  /** The count of functions in each table. */
  readonly top: number;
  /** The file of the profile to write. */
  readonly out: string;
  /** A saved profile to read in place of a record, or `null`. */
  readonly input: string | null;
  /** The function of `--callers`, as `name` or `name:line`, or `null`. */
  readonly callers: string | null;
  /** The count of callers in each path of `--callers`. */
  readonly depth: number;
}

/** The usage line of the tool. */
const USAGE =
  'Usage: pnpm cpu-profile [--demo <id>] [--seek <s>] [--sec <n>] [--top <n>] [--out <file>] ' +
  '[--in <file>] [--callers <function>[:<line>]] [--depth <n>]';

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The arguments.
 * @throws Error for an option with no value or a number that is not positive.
 */
export function cpuProfileArgs(args: readonly string[]): CpuProfileArgs {
  const text = (name: string): string | null => {
    const value = optionValue(args, name);
    if (value === undefined) {
      throw new Error(USAGE);
    }
    return value;
  };
  const positive = (name: string, fallback: number): number => {
    const value = text(name);
    const number = value === null ? fallback : Number(value);
    if (!(number > 0)) {
      throw new Error(`${name} needs a positive number. ${USAGE}`);
    }
    return number;
  };
  return {
    demo: text('--demo') ?? 'perf-60',
    seek: positive('--seek', 32),
    sec: positive('--sec', 10),
    top: positive('--top', 30),
    out: resolve(text('--out') ?? join(ROOT, 'scratch', 'cpu-profile.cpuprofile')),
    input: text('--in'),
    callers: text('--callers'),
    depth: positive('--depth', 6),
  };
}

/**
 * Gives the name of a node: the function, the file, and the line from 1.
 *
 * @param node The node.
 * @returns The name, such as `update three.module-D6Z8HiYx.js:18279`.
 */
export function nodeName(node: ProfileNode): string {
  const frame = node.callFrame;
  const file = frame.url.split('/').at(-1)?.split('?')[0] ?? '';
  return `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}`;
}

/**
 * Gives the parent of each node of a profile.
 *
 * @param profile The profile.
 * @returns The id of the parent by the id of the node. The root has no entry.
 */
function parents(profile: CpuProfile): Map<number, number> {
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parent.set(child, node.id);
    }
  }
  return parent;
}

/**
 * Gives the count of frames of a profile at {@link FRAME_RATE}.
 *
 * @param profile The profile.
 * @returns The count.
 */
export function profileFrames(profile: CpuProfile): number {
  return ((profile.endTime - profile.startTime) / 1e6) * FRAME_RATE;
}

/** The time of the functions of a profile, in milliseconds for the whole profile, by name. */
export interface ProfileTimes {
  /** The time of the samples in the function itself. */
  readonly self: ReadonlyMap<string, number>;
  /** The time of the samples in the function and in the functions that it calls. */
  readonly total: ReadonlyMap<string, number>;
}

/**
 * Sums the self time and the total time of each function of a profile. The total time counts a
 * sample one time for a function, also when the function calls itself.
 *
 * @param profile The profile.
 * @returns The times by the name of {@link nodeName}.
 */
export function profileTimes(profile: CpuProfile): ProfileTimes {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = parents(profile);
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  for (const [i, id] of (profile.samples ?? []).entries()) {
    const ms = (profile.timeDeltas?.[i] ?? 0) / 1000;
    const node = nodes.get(id);
    if (!node) {
      continue;
    }
    const name = nodeName(node);
    self.set(name, (self.get(name) ?? 0) + ms);
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const up = nodes.get(at);
      const upName = up ? nodeName(up) : '';
      if (up && !seen.has(upName)) {
        seen.add(upName);
        total.set(upName, (total.get(upName) ?? 0) + ms);
      }
    }
  }
  return { self, total };
}

/**
 * Tells if a node is the function of `--callers`.
 *
 * @param node The node.
 * @param target The function, as `name` or `name:line` with the line from 1.
 * @returns True if the name and, when given, the line match.
 */
export function isTarget(node: ProfileNode, target: string): boolean {
  const at = target.lastIndexOf(':');
  const line = at > 0 ? Number(target.slice(at + 1)) : Number.NaN;
  const name = Number.isInteger(line) ? target.slice(0, at) : target;
  const frame = node.callFrame;
  return frame.functionName === name && (!Number.isInteger(line) || frame.lineNumber + 1 === line);
}

/**
 * Sums the time of a function by the path of its callers: for each sample in the function, the
 * outermost call of the function and up to `depth` callers above it.
 *
 * @param profile The profile.
 * @param target The function, as `name` or `name:line` with the line from 1.
 * @param depth The count of callers in each path.
 * @returns The time of each path in milliseconds for the whole profile, by the path, such as
 *   `setProgram:52328 < renderBufferDirect:51786`.
 */
export function callerTimes(
  profile: CpuProfile,
  target: string,
  depth: number,
): Map<string, number> {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = parents(profile);
  const short = (node: ProfileNode): string =>
    `${node.callFrame.functionName || '(anonymous)'}:${node.callFrame.lineNumber + 1}`;
  const times = new Map<string, number>();
  for (const [i, id] of (profile.samples ?? []).entries()) {
    let hit: number | null = null;
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const node = nodes.get(at);
      if (node && isTarget(node, target)) {
        hit = at;
      }
    }
    if (hit === null) {
      continue;
    }
    const path: string[] = [];
    for (let at = parent.get(hit); at !== undefined && path.length < depth; at = parent.get(at)) {
      const node = nodes.get(at);
      if (node) {
        path.push(short(node));
      }
    }
    const key = path.join(' < ');
    times.set(key, (times.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1000);
  }
  return times;
}

/**
 * Gives the lines of a table of times for each frame, from the largest. A line below 0.0005 ms
 * does not show.
 *
 * @param times The times in milliseconds for the whole profile.
 * @param frames The count of frames of the profile.
 * @param top The count of lines.
 * @returns The lines, such as `1.323  update three.module.js:18279`.
 */
export function topLines(
  times: ReadonlyMap<string, number>,
  frames: number,
  top: number,
): string[] {
  return [...times]
    .filter(([, ms]) => ms / frames >= 0.0005)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, ms]) => `${(ms / frames).toFixed(3)}  ${name}`);
}

/**
 * Tells if a value of a JSON file is a CPU profile.
 *
 * @param value The value.
 * @returns True if it has the nodes and the times of a profile.
 */
function isProfile(value: unknown): value is CpuProfile {
  return (
    value instanceof Object &&
    'nodes' in value &&
    Array.isArray(value.nodes) &&
    'startTime' in value &&
    Number.isFinite(value.startTime) &&
    'endTime' in value &&
    Number.isFinite(value.endTime)
  );
}

/**
 * Plays a demo in Google Chrome with the dev server of the working tree, and records a CPU profile
 * of the main thread.
 *
 * @param args The command line.
 * @returns The profile.
 */
async function record(args: CpuProfileArgs): Promise<CpuProfile> {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 4196, strictPort: false },
  });
  await server.listen();
  const browser = await chromium.launch({ channel: 'chrome', args: chromiumArgs('darwin') });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(`${server.resolvedUrls?.local[0] ?? ''}#demo=${args.demo}`);
    await page.waitForSelector(SAMPLES_READY, { timeout: 120_000 });
    await page.click(FIRST_PLAY);
    await page.waitForTimeout(3000);
    await page.$eval(
      '.seek',
      (element, value) => {
        if (element instanceof HTMLInputElement) {
          element.value = String(value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      args.seek,
    );
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    await page.waitForTimeout(args.sec * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    const song = await page.evaluate(() => window.pawchestra?.songTime ?? Number.NaN);
    console.log(`Recorded ${args.sec} s of ${args.demo} up to the song time ${song.toFixed(1)} s.`);
    return profile;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main(): Promise<void> {
  const args = cpuProfileArgs(process.argv.slice(2));
  let profile: CpuProfile;
  if (args.input === null) {
    profile = await record(args);
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify(profile));
    console.log(`Wrote ${args.out}.`);
  } else {
    const value: unknown = JSON.parse(await readFile(args.input, 'utf8'));
    if (!isProfile(value)) {
      throw new Error(`${args.input} is no CPU profile.`);
    }
    profile = value;
  }

  const frames = profileFrames(profile);
  if (args.callers !== null) {
    console.log(`\nCallers of ${args.callers}, time for each frame (ms):`);
    console.log(
      topLines(callerTimes(profile, args.callers, args.depth), frames, args.top).join('\n'),
    );
    return;
  }
  const { self, total } = profileTimes(profile);
  console.log(`\nSelf time for each frame (ms), ${frames.toFixed(0)} frames at ${FRAME_RATE} fps:`);
  console.log(topLines(self, frames, args.top).join('\n'));
  console.log('\nTotal time for each frame (ms):');
  console.log(topLines(total, frames, args.top).join('\n'));
}

if (import.meta.main) {
  await main();
}
