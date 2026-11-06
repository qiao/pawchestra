// Measures the load of the default demo (design 9.7, docs/agents/workflow.md, "Performance
// rounds"). Run it after `pnpm build`:
//
//   pnpm load-probe [--phone] [--repeat] [--base <ref>] [--profile] [--runs <n>] [--port <p>]
//     [--out <file.json>]
//
// The tool serves `dist/` as GitHub Pages does (`tools/site-server.ts`): HTTP/2, gzip for the text
// types, ETag, and `Cache-Control: max-age=600`. It opens the page in headless Chrome with the GPU
// of the Mac, and gives the median of the runs (3 by default): FCP, LCP, the empty stage (the first
// draw call), the first frame of the orchestra, the time until the demo is ready to play, the
// blocking time to ready, and the bytes. Each run uses a new browser context.
//
// - `--phone` shapes the network in the server, so that the fetches of the Workers also get it:
//   Fast 4G of DevTools (165 ms for each request, 8.1 Mbit/s for all requests together). It also
//   sets a 4x CPU throttle on the main thread of the page, which does not slow the Workers.
// - `--repeat` loads the page two times in one context, and gives the second load. Chrome trusts
//   the key of the certificate of the server, so it keeps an HTTP cache.
// - `--base <ref>` builds the commit in a temporary folder (`withRefBuild()`), and measures it
//   first. The table gives the change.
// - `--profile` measures builds with no minify, so that the CPU profile of the first run names each
//   function, and prints the functions with the most time. Its times are of these builds.
// - `--out` writes each run, the bytes of each path, and the time of each response as JSON.
//
// The builds run outside the lock. The timed runs of each site run in a child process through
// `tools/measure-lock.sh run --owner load-probe`.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { chromiumArgs } from './chromium-args.ts';
import { optionValue, runChild, shortHash, withRefBuild } from './ref-tree.ts';
import { FAST_4G, NO_LIMIT, startSiteServer } from './site-server.ts';

/** The root of the repository. */
const ROOT = resolve(import.meta.dirname, '..');

/** The usage text of the tool. */
const USAGE =
  'Usage: pnpm load-probe [--phone] [--repeat] [--base <ref>] [--profile] [--runs <n>] [--port <p>] [--out <file.json>]';

/** The marks that the init script of the page writes into `window.pawchestraLoad`. */
interface LoadMarks {
  /** The first contentful paint, in ms from the navigation, or `null`. */
  readonly fcp: number | null;
  /** The last largest contentful paint, in ms, or `null`. */
  readonly lcp: number | null;
  /** Each long task: its start and its length, in ms. */
  readonly longTasks: readonly (readonly [number, number])[];
  /** The first draw call on the canvas of the stage, with no players yet, in ms. */
  readonly emptyDraw: number | null;
  /** The first draw call after the stage shows the default demo, in ms. */
  readonly firstDraw: number | null;
  /** The frame after {@link LoadMarks.firstDraw}, in ms. */
  readonly firstFrame: number | null;
  /** The time when the load ring hides: the demo is ready to play, in ms. */
  readonly ready: number | null;
}

declare global {
  /** The page of the app with the init script of the probe. */
  interface Window {
    /** The marks of the load ({@link LoadMarks}). */
    pawchestraLoad?: LoadMarks;
  }
}

/** The result of one load of the page. */
interface RunResult extends LoadMarks {
  /** The sum of each long task above 50 ms, less 50 ms, from the navigation to ready. */
  readonly blocking: number;
  /** The bytes that the server sent for each path. */
  readonly bytes: Readonly<Record<string, number>>;
  /** The sum of the bytes. */
  readonly totalBytes: number;
  /** Each response: the path, its start and its end in ms from the request of the page, the bytes. */
  readonly timeline: readonly (readonly [string, number, number, number])[];
}

/** The medians of the runs of one site, in ms and in bytes. */
interface Medians {
  /** The first contentful paint. */
  readonly fcp: number;
  /** The largest contentful paint: a text, because a canvas is no candidate. */
  readonly lcp: number;
  /** The first draw call on the stage, with no players. */
  readonly emptyStage: number;
  /** The first frame of the orchestra of the default demo. */
  readonly firstFrame: number;
  /** The time when the demo is ready to play. */
  readonly ready: number;
  /** The blocking time from the navigation to ready ({@link RunResult.blocking}). */
  readonly blocking: number;
  /** The bytes that the server sent. */
  readonly totalBytes: number;
}

/** The options of a measure. */
export interface ProbeOptions {
  /** Fast 4G of DevTools and a 4x CPU throttle of the main thread. */
  readonly phone: boolean;
  /** The second load of the page in one browser context, inside the 600 s of `max-age`. */
  readonly repeat: boolean;
  /** A CPU profile of the main thread of the first run. */
  readonly profile: boolean;
  /** The number of runs. */
  readonly runs: number;
  /** The port of the server. */
  readonly port: number;
}

/** The CPU throttle of the phone run: a factor on the main thread of the page. */
const PHONE_CPU_RATE = 4;

/**
 * The init script of the page: it writes the marks of {@link LoadMarks} into
 * `window.pawchestraLoad`. A draw call of the WebGL2 context of the stage gives the empty stage,
 * and the first one after `data-demo` of the canvas gives the first frame. The load ring hides
 * when the demo is ready.
 */
const INIT = `(() => {
  const load = { fcp: null, lcp: null, longTasks: [], emptyDraw: null, firstDraw: null, firstFrame: null, ready: null };
  window.pawchestraLoad = load;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') load.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) load.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) load.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, options) {
    const gl = getContext.call(this, kind, options);
    if (gl && kind === 'webgl2' && this.id === 'stage' && !gl.pawchestraWrapped) {
      gl.pawchestraWrapped = true;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const draw = gl[name].bind(gl);
        gl[name] = function (...a) {
          if (load.emptyDraw === null) load.emptyDraw = performance.now();
          if (load.firstDraw === null && this.canvas.dataset.demo) {
            load.firstDraw = performance.now();
            requestAnimationFrame(() => { load.firstFrame = performance.now(); });
          }
          return draw(...a);
        };
      }
    }
    return gl;
  };
  const check = () => {
    if (load.ready !== null) return;
    const canvas = document.querySelector('#stage');
    const ring = document.querySelector('.first-screen:not(.boot) .ring');
    if (canvas && canvas.dataset.demo && ring && ring.style.visibility === 'hidden') {
      load.ready = performance.now();
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
})();`;

/**
 * Gives the median of numbers.
 *
 * @param values The numbers.
 * @returns The median, the upper one of an even count.
 */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/**
 * Gives the medians of the runs.
 *
 * @param results The runs.
 * @returns The medians, rounded to whole ms and bytes.
 */
export function medians(results: readonly RunResult[]): Medians {
  const of = (pick: (run: RunResult) => number | null): number =>
    Math.round(median(results.map((run) => pick(run) ?? Number.NaN)));
  return {
    fcp: of((run) => run.fcp),
    lcp: of((run) => run.lcp),
    emptyStage: of((run) => run.emptyDraw),
    firstFrame: of((run) => run.firstFrame),
    ready: of((run) => run.ready),
    blocking: of((run) => run.blocking),
    totalBytes: of((run) => run.totalBytes),
  };
}

/** The function of a node of a CPU profile. */
interface CallFrame {
  /** The name of the function, or an empty text. */
  readonly functionName: string;
  /** The URL of the script. */
  readonly url: string;
  /** The line of the function, from 0. */
  readonly lineNumber: number;
}

/** A node of a CPU profile of the DevTools protocol. */
interface ProfileNode {
  /** The id of the node. */
  readonly id: number;
  /** The function of the node. */
  readonly callFrame: CallFrame;
  /** The ids of the nodes that the function calls. */
  readonly children?: readonly number[];
}

/** A CPU profile of the DevTools protocol. */
interface CpuProfile {
  /** The nodes of the call tree. */
  readonly nodes: readonly ProfileNode[];
  /** The node of each sample. */
  readonly samples: readonly number[];
  /** The time from the sample before, in µs, for each sample. */
  readonly timeDeltas: readonly number[];
}

/**
 * Gives the functions with the most time in a CPU profile: the time of the function with its
 * calls, and its own time, in ms.
 *
 * @param profile The profile.
 * @param count The number of lines.
 * @returns One line for each function, the most time first.
 */
export function profileTop(profile: CpuProfile, count: number): string[] {
  const parent = new Map<number, number>();
  const byId = new Map<number, ProfileNode>();
  for (const node of profile.nodes) {
    byId.set(node.id, node);
    for (const child of node.children ?? []) {
      parent.set(child, node.id);
    }
  }

  const keyOf = (node: ProfileNode): string => {
    const file = node.callFrame.url.split('/').pop() ?? '';
    return `${node.callFrame.functionName || '(anonymous)'} ${file}:${node.callFrame.lineNumber + 1}`;
  };
  const total = new Map<string, number>();
  const own = new Map<string, number>();
  for (const [i, sample] of profile.samples.entries()) {
    const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const seen = new Set<string>();
    let id: number | undefined = sample;
    let first = true;
    while (id !== undefined) {
      const node = byId.get(id);
      if (!node) {
        break;
      }
      const key = keyOf(node);
      if (first) {
        own.set(key, (own.get(key) ?? 0) + ms);
        first = false;
      }
      if (!seen.has(key)) {
        seen.add(key);
        total.set(key, (total.get(key) ?? 0) + ms);
      }
      id = parent.get(id);
    }
  }

  return [...total.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(
      ([key, ms]) =>
        `${ms.toFixed(0).padStart(7)} ${(own.get(key) ?? 0).toFixed(0).padStart(7)}  ${key}`,
    );
}

/**
 * Measures the load of a site: the runs of the options, each one in a new browser context. The
 * caller holds the measure lock.
 *
 * @param root The folder of the built site.
 * @param options The options.
 * @param profileFile The file of the CPU profile of the first run, with `--profile`.
 * @returns Each run.
 */
async function measureSite(
  root: string,
  options: ProbeOptions,
  profileFile: string,
): Promise<RunResult[]> {
  const site = await startSiteServer({
    root,
    host: 'pages',
    network: options.phone ? FAST_4G : NO_LIMIT,
    port: options.port,
  });
  const { server } = site;
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [...chromiumArgs('darwin'), site.trustFlag],
  });
  const results: RunResult[] = [];
  try {
    for (let run = 0; run < options.runs; run++) {
      const context = await browser.newContext(
        options.phone
          ? {
              viewport: { width: 412, height: 823 },
              deviceScaleFactor: 1.75,
              isMobile: true,
              hasTouch: true,
            }
          : { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 },
      );
      await context.addInitScript(INIT);
      let result: RunResult | null = null;
      for (let visit = 0; visit < (options.repeat ? 2 : 1); visit++) {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', {
          rate: options.phone ? PHONE_CPU_RATE : 1,
        });
        server.reset();
        const profiling = options.profile && run === 0 && visit === (options.repeat ? 1 : 0);
        if (profiling) {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
          await cdp.send('Profiler.start');
        }
        await page.goto(`https://localhost:${options.port}/`, {
          waitUntil: 'load',
          timeout: 120_000,
        });
        await page.waitForFunction(() => (window.pawchestraLoad?.ready ?? null) !== null, null, {
          timeout: 180_000,
          polling: 500,
        });
        const marks = await page.evaluate(() => window.pawchestraLoad ?? null);
        if (!marks) {
          throw new Error('The page has no marks of the load.');
        }
        if (profiling) {
          const { profile } = await cdp.send('Profiler.stop');
          writeFileSync(profileFile, JSON.stringify(profile));
        }
        const ready = marks.ready ?? Infinity;
        result = {
          ...marks,
          blocking: marks.longTasks
            .filter(([start]) => start <= ready)
            .reduce((sum, [, length]) => sum + Math.max(0, length - 50), 0),
          bytes: Object.fromEntries([...server.sent.entries()].toSorted((a, b) => b[1] - a[1])),
          totalBytes: [...server.sent.values()].reduce((sum, bytes) => sum + bytes, 0),
          timeline: server.timeline.toSorted((a, b) => a[1] - b[1]),
        };
        await page.close();
      }
      if (result) {
        results.push(result);
        console.log(
          `run ${run + 1}: fcp ${Math.round(result.fcp ?? -1)}, first frame ${Math.round(result.firstFrame ?? -1)}, ready ${Math.round(result.ready ?? -1)}, blocking ${result.blocking}, bytes ${result.totalBytes}`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    site.close();
  }
  return results;
}

/**
 * Gives the options of the command line.
 *
 * @param args The arguments.
 * @returns The options, or `null` for a bad use.
 */
function probeOptions(args: readonly string[]): ProbeOptions | null {
  const runs = optionValue(args, '--runs');
  const port = optionValue(args, '--port');
  if (runs === undefined || port === undefined) {
    return null;
  }

  const options: ProbeOptions = {
    phone: args.includes('--phone'),
    repeat: args.includes('--repeat'),
    profile: args.includes('--profile'),
    runs: Number(runs ?? '3'),
    port: Number(port ?? '4321'),
  };
  if (!Number.isInteger(options.runs) || options.runs < 1 || !Number.isInteger(options.port)) {
    return null;
  }
  return options;
}

/**
 * Builds the site of a folder with no minify, for the names of the CPU profile, and copies the
 * SoundFont files of its `dist/`.
 *
 * @param dir The folder of the tree.
 * @param out The output folder.
 */
async function plainBuild(dir: string, out: string): Promise<void> {
  await runChild('pnpm', ['exec', 'vite', 'build', '--minify', 'false', '--outDir', out], dir);
  cpSync(join(dir, 'dist', 'sf'), join(out, 'sf'), { recursive: true });
}

/** The result of the measure of one site, as the child under the lock writes it. */
interface SiteResult {
  /** The name of the site: the working tree or the base. */
  readonly label: string;
  /** The medians of the runs. */
  readonly medians: Medians;
  /** Each run. */
  readonly runs: readonly RunResult[];
  /** The lines of the CPU profile, with `--profile`. */
  readonly profile: readonly string[];
}

/**
 * Measures one site through `tools/measure-lock.sh`: the child process holds the lock for the
 * timed runs only, and writes its result into a file.
 *
 * @param label The name of the site.
 * @param root The folder of the built site.
 * @param args The options of the command line.
 * @returns The result.
 * @throws Error if the measure fails.
 */
function measureLocked(label: string, root: string, args: readonly string[]): SiteResult {
  const out = join(tmpdir(), `load-probe-${process.pid}-${label.replaceAll(/\W/gu, '-')}.json`);
  const child = spawnSync(
    join(ROOT, 'tools', 'measure-lock.sh'),
    [
      'run',
      '--owner',
      'load-probe',
      '--',
      process.execPath,
      join(ROOT, 'tools', 'load-probe.ts'),
      '--measure',
      root,
      '--result',
      out,
      '--label',
      label,
      ...args,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (child.status !== 0) {
    throw new Error(`The measure of ${label} failed with the status ${String(child.status)}.`);
  }
  // SAFETY: the child of this tool writes the file as a SiteResult.
  const result = JSON.parse(readFileSync(out, 'utf8')) as SiteResult;
  rmSync(out, { force: true });
  rmSync(out.replace(/\.json$/u, '-profile.json'), { force: true });
  return result;
}

/**
 * Formats the medians of the sites as a table, with the change from the first site.
 *
 * @param sites The results, the base first.
 * @param options The options of the measure.
 * @returns The lines.
 */
function tableLines(sites: readonly SiteResult[], options: ProbeOptions): string[] {
  const mode = `${options.phone ? 'phone (Fast 4G, 4x CPU)' : 'desktop'}, ${options.repeat ? 'repeat visit' : 'first visit'}, median of ${options.runs}`;
  const rows: [string, keyof Medians, string][] = [
    ['FCP', 'fcp', 'ms'],
    ['LCP', 'lcp', 'ms'],
    ['empty stage', 'emptyStage', 'ms'],
    ['first frame of the orchestra', 'firstFrame', 'ms'],
    ['ready to play', 'ready', 'ms'],
    ['blocking time to ready', 'blocking', 'ms'],
    ['bytes', 'totalBytes', 'B'],
  ];
  const first = sites[0];
  const lines = [`Load of the default demo: ${mode}`];
  lines.push(
    [
      'measure'.padEnd(30),
      ...sites.map((site) => site.label.padStart(18)),
      'change'.padStart(12),
    ].join(''),
  );
  for (const [name, key, unit] of rows) {
    const values = sites.map((site) => site.medians[key]);
    const last = values.at(-1) ?? 0;
    const change = sites.length > 1 && first ? last - first.medians[key] : null;
    lines.push(
      [
        name.padEnd(30),
        ...values.map((value) => `${value.toLocaleString('en-US')} ${unit}`.padStart(18)),
        change === null
          ? ''
          : `${change > 0 ? '+' : ''}${change.toLocaleString('en-US')}`.padStart(12),
      ].join(''),
    );
  }
  return lines;
}

/**
 * Runs the timed part under the lock: `--measure <root> --result <file> --label <name>`.
 *
 * @param args The arguments.
 * @param options The options.
 */
async function measureMain(args: readonly string[], options: ProbeOptions): Promise<void> {
  const root = optionValue(args, '--measure');
  const out = optionValue(args, '--result');
  const label = optionValue(args, '--label') ?? 'site';
  if (!root || !out) {
    throw new Error('The child mode needs --measure <root> and --result <file>.');
  }

  const profileFile = out.replace(/\.json$/u, '-profile.json');
  const runs = await measureSite(resolve(root), options, profileFile);
  let profile: string[] = [];
  if (options.profile) {
    // SAFETY: Profiler.stop of the DevTools protocol gives a CpuProfile.
    profile = profileTop(JSON.parse(readFileSync(profileFile, 'utf8')) as CpuProfile, 40);
  }
  const result: SiteResult = { label, medians: medians(runs), runs, profile };
  writeFileSync(out, JSON.stringify(result));
}

/**
 * Measures the load of the default demo: `pnpm load-probe` after `pnpm build` (design 9.7,
 * `docs/agents/workflow.md`). With `--base <ref>`, it builds the commit in a temporary folder and
 * measures it first. Each timed measure runs through `tools/measure-lock.sh`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = probeOptions(args);
  const base = optionValue(args, '--base');
  const outFile = optionValue(args, '--out');
  if (!options || base === undefined || outFile === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.includes('--measure')) {
    await measureMain(args, options);
    return;
  }

  const dist = join(ROOT, 'dist');
  if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'sf'))) {
    console.error('The probe reads dist/. Run pnpm build first.');
    process.exitCode = 1;
    return;
  }

  const childArgs = [
    ...(options.phone ? ['--phone'] : []),
    ...(options.repeat ? ['--repeat'] : []),
    ...(options.profile ? ['--profile'] : []),
    '--runs',
    String(options.runs),
    '--port',
    String(options.port),
  ];
  const sites: SiteResult[] = [];
  const temp = join(tmpdir(), `load-probe-${process.pid}`);
  if (base !== null) {
    const label = `${base} (${shortHash(base)})`;
    sites.push(
      await withRefBuild(base, async (dir) => {
        let root = join(dir, 'dist');
        if (options.profile) {
          root = join(dir, 'dist-plain');
          await plainBuild(dir, root);
        }
        return measureLocked(label, root, childArgs);
      }),
    );
  }
  let root = dist;
  if (options.profile) {
    root = `${temp}-plain`;
    await plainBuild(ROOT, root);
  }
  try {
    sites.push(measureLocked('working tree', root, childArgs));
  } finally {
    if (options.profile) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  console.log(tableLines(sites, options).join('\n'));
  for (const site of sites) {
    if (site.profile.length > 0) {
      console.log(`\nCPU profile of ${site.label} (ms with the calls, own ms, function):`);
      console.log(site.profile.join('\n'));
    }
  }
  if (outFile !== null) {
    writeFileSync(outFile, `${JSON.stringify({ options, sites }, null, 2)}\n`);
  }
}

if (import.meta.main) {
  await main();
}
