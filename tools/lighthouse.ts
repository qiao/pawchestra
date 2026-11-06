// Audits the page with Lighthouse (design 9.7, docs/agents/workflow.md, "Performance rounds"). Run
// it after `pnpm build`:
//
//   pnpm lighthouse [--url <url>] [--preset mobile|desktop] [--desktop] [--runs <n>] [--quick]
//     [--port <p>] [--out <file.json>]
//
// With no `--url`, the tool serves `dist/` as Vercel does (`tools/site-server.ts`): brotli for the
// text types, ETag, and the headers of `vercel.json`, at 40 Mbit/s (`LOCAL_NETWORK`). Then the
// scores and the metrics of the mobile and the desktop preset are near those of the live site.
// `--url` audits a live site, such as
// https://www.pawchestra.com/. The pinned Lighthouse of `package.json` runs in headless Chrome with
// the default simulated throttle of each preset: mobile (a Moto G Power on slow 4G with a 4x CPU)
// and desktop. `--preset` runs one preset, and `--desktop` is short for `--preset desktop`. Each
// preset runs `--runs` times (3 by default), and the tool keeps the median run of Lighthouse: the
// run nearest to the median FCP and the median TTI (`computeMedianRun()`). Use the default for a
// report. `--quick` runs one preset one time, for the iteration of a round: the mobile preset, or
// the desktop preset with `--desktop`.
//
// For the median run of each preset, it prints the four category scores, FCP, LCP, TBT, CLS, and
// SI with their scores, the LCP element with its phases, the long tasks, and each failed audit:
// a scored audit of a category below 0.9, other than a metric. `--out` writes the median result of
// Lighthouse of each preset and the metrics of each run as JSON.
//
// The server and the runs run in a child process through
// `tools/measure-lock.sh run --owner lighthouse --gate 12`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';

import { optionValue } from './ref-tree.ts';
import { startSiteServer } from './site-server.ts';
import type { Network, RunningSite } from './site-server.ts';

/** The root of the repository. */
const ROOT = resolve(import.meta.dirname, '..');

/** The command line of the pinned Lighthouse. */
const LIGHTHOUSE_CLI = join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js');

/** The usage text of the tool. */
const USAGE =
  'Usage: pnpm lighthouse [--url <url>] [--preset mobile|desktop] [--desktop] [--runs <n>] [--quick] [--port <p>] [--out <file.json>]';

/** The presets of Lighthouse, in the order of the runs. */
const PRESETS = ['mobile', 'desktop'] as const;

/** A preset of Lighthouse: a device with its simulated throttle. */
type Preset = (typeof PRESETS)[number];

/** The categories that the tool prints, with their names. */
const CATEGORIES = [
  ['performance', 'Performance'],
  ['accessibility', 'Accessibility'],
  ['best-practices', 'Best practices'],
  ['seo', 'SEO'],
] as const;

/** The metrics that the tool prints: the short name and the id of the audit. */
const METRICS = [
  ['FCP', 'first-contentful-paint'],
  ['LCP', 'largest-contentful-paint'],
  ['TBT', 'total-blocking-time'],
  ['CLS', 'cumulative-layout-shift'],
  ['SI', 'speed-index'],
] as const;

/** The score modes of the audits that pass or fail. */
const SCORED_MODES = new Set(['binary', 'numeric', 'metricSavings']);

/** The lowest score of a passed audit, as the report of Lighthouse shows it. */
const PASS_SCORE = 0.9;

/**
 * The network of the local server: 40 Mbit/s with no delay. The simulation of Lighthouse counts a
 * script as render blocking when its download ends before the observed first paint. With no limit,
 * the 1.9 MB chunk `renderer` arrives before the first paint, and the mobile FCP grew from 1.2 s to
 * 4.8 s. On the live site, and at this rate, it arrives after the first paint. Lighthouse
 * simulates the round trips itself, and a delay in the server would add to its server time.
 */
const LOCAL_NETWORK: Network = { latencyMs: 0, bytesPerSecond: 40e6 / 8 };

/** The seconds that each run of Lighthouse can take under the measure lock. */
const RUN_LIMIT_S = 300;

/** A DOM node of a result of Lighthouse. */
interface LhNode {
  /** The CSS selector of the node. */
  readonly selector?: string;
  /** The text of the node, or its tag. */
  readonly nodeLabel?: string;
}

/** A row of a table of the details of an audit: the fields that the tool reads. */
interface LhItem {
  /** The DOM node of the row. */
  readonly node?: LhNode;
  /** The name of a phase of the LCP. */
  readonly phase?: string;
  /** The time of a phase of the LCP, in ms. */
  readonly timing?: number;
  /** The URL of the script of a long task, or "Unattributable". */
  readonly url?: string;
  /** The start of a long task, in ms. */
  readonly startTime?: number;
  /** The length of a long task, in ms. */
  readonly duration?: number;
  /** The rows of a table in a list. */
  readonly items?: readonly LhItem[];
}

/** An audit of a result of Lighthouse. */
interface LhAudit {
  /** The title of the audit. */
  readonly title: string;
  /** The score from 0 to 1, or `null` for no score. */
  readonly score: number | null;
  /** The kind of the score, such as `numeric` or `informative`. */
  readonly scoreDisplayMode: string;
  /** The value as the report shows it, such as "1.2 s". */
  readonly displayValue?: string;
  /** The value of a metric, in ms or with no unit. */
  readonly numericValue?: number;
  /** The details: a table or a list of tables. */
  readonly details?: { readonly items?: readonly LhItem[] };
}

/** A category of a result of Lighthouse. */
interface LhCategory {
  /** The score from 0 to 1, or `null` after an error. */
  readonly score: number | null;
  /** The audits of the category, with their groups. */
  readonly auditRefs: readonly { readonly id: string; readonly group?: string }[];
}

/** A result of Lighthouse (LHR): the fields that the tool reads. */
interface LhResult {
  /** The version of Lighthouse. */
  readonly lighthouseVersion: string;
  /** The URL that the run audited. */
  readonly requestedUrl: string;
  /** The warnings of the run. */
  readonly runWarnings: readonly string[];
  /** The fatal error of the run, if any. */
  readonly runtimeError?: { readonly code: string; readonly message: string };
  /** The categories by id. */
  readonly categories: Readonly<Partial<Record<string, LhCategory>>>;
  /** The audits by id. */
  readonly audits: Readonly<Partial<Record<string, LhAudit>>>;
}

/** The scores and the metrics of one run. */
interface RunSummary {
  /** The score of each category, from 0 to 100. */
  readonly scores: Readonly<Record<string, number | null>>;
  /** The value of each metric, in ms or with no unit for CLS. */
  readonly metrics: Readonly<Record<string, number | null>>;
}

/** The runs of one preset. */
interface PresetResult {
  /** The preset. */
  readonly preset: Preset;
  /** The scores and the metrics of each run. */
  readonly runs: readonly RunSummary[];
  /** The median run of Lighthouse. */
  readonly median: LhResult;
}

/** The options of the command line. */
interface AuditOptions {
  /** The URL of a live site, or `null` for `dist/`. */
  readonly url: string | null;
  /** The presets that run. */
  readonly presets: readonly Preset[];
  /** The runs of each preset. */
  readonly runs: number;
  /** The port of the server of `dist/`. */
  readonly port: number;
}

/**
 * Gives an audit of a result.
 *
 * @param lhr The result.
 * @param id The id of the audit.
 * @returns The audit, or `null` when the result has no such audit.
 */
function auditOf(lhr: LhResult, id: string): LhAudit | null {
  return lhr.audits[id] ?? null;
}

/**
 * Gives the scores and the metrics of one run.
 *
 * @param lhr The result of the run.
 * @returns The scores from 0 to 100, and the metric values.
 */
function summaryOf(lhr: LhResult): RunSummary {
  const scores: Record<string, number | null> = {};
  for (const [id] of CATEGORIES) {
    const score = lhr.categories[id]?.score ?? null;
    scores[id] = score === null ? null : Math.round(score * 100);
  }

  const metrics: Record<string, number | null> = {};
  for (const [name, id] of METRICS) {
    metrics[name] = auditOf(lhr, id)?.numericValue ?? null;
  }
  return { scores, metrics };
}

/**
 * Formats the value of a metric.
 *
 * @param name The short name of the metric.
 * @param value The value, in ms or with no unit for CLS.
 * @returns The text, such as "1,230 ms" or "0.012".
 */
function metricText(name: string, value: number | null): string {
  if (value === null) {
    return '-';
  }
  if (name === 'CLS') {
    return value.toFixed(3);
  }
  return `${Math.round(value).toLocaleString('en-US')} ms`;
}

/**
 * Formats a score from 0 to 1 as a whole number from 0 to 100.
 *
 * @param score The score, or `null`.
 * @returns The text, or "-" for no score.
 */
function scoreText(score: number | null | undefined): string {
  return score === null || score === undefined ? '-' : String(Math.round(score * 100));
}

/**
 * Gives the path of a URL of the audited site, or the whole URL for another origin.
 *
 * @param url The URL.
 * @param origin The origin of the audited page.
 * @returns The short text.
 */
function shortUrl(url: string, origin: string): string {
  return url.startsWith(origin) ? url.slice(origin.length) || '/' : url;
}

/**
 * Formats the LCP element of a result and the phases of its time.
 *
 * @param lhr The result.
 * @returns The lines.
 */
function lcpLines(lhr: LhResult): string[] {
  const [nodeTable, phaseTable] =
    auditOf(lhr, 'largest-contentful-paint-element')?.details?.items ?? [];
  const node = nodeTable?.items?.[0]?.node;
  if (!node) {
    return ['LCP element: none'];
  }

  const phases = (phaseTable?.items ?? []).map(
    (row) => `${row.phase ?? '?'} ${metricText('', row.timing ?? null)}`,
  );
  return [
    `LCP element: ${node.selector ?? '?'} ("${node.nodeLabel ?? ''}")`,
    ...(phases.length > 0 ? [`LCP phases: ${phases.join(', ')}`] : []),
  ];
}

/**
 * Formats the long tasks of a result, with their simulated times.
 *
 * @param lhr The result.
 * @returns The lines.
 */
function longTaskLines(lhr: LhResult): string[] {
  const origin = new URL(lhr.requestedUrl).origin;
  const tasks = auditOf(lhr, 'long-tasks')?.details?.items ?? [];
  if (tasks.length === 0) {
    return ['Long tasks: none'];
  }

  const lines = ['Long tasks (start, length, script):'];
  for (const task of tasks) {
    lines.push(
      `  ${metricText('', task.startTime ?? null).padStart(10)} ${metricText('', task.duration ?? null).padStart(10)}  ${shortUrl(task.url ?? '?', origin)}`,
    );
  }
  return lines;
}

/**
 * Formats each failed audit of a result: a scored audit of a category below
 * {@link PASS_SCORE}, other than a metric. An audit of the group `hidden` does not show in the
 * report of Lighthouse, so its line says so.
 *
 * @param lhr The result.
 * @returns The lines.
 */
function failedLines(lhr: LhResult): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const [categoryId] of CATEGORIES) {
    for (const ref of lhr.categories[categoryId]?.auditRefs ?? []) {
      const audit = auditOf(lhr, ref.id);
      if (
        !audit ||
        ref.group === 'metrics' ||
        seen.has(ref.id) ||
        !SCORED_MODES.has(audit.scoreDisplayMode) ||
        audit.score === null ||
        audit.score >= PASS_SCORE
      ) {
        continue;
      }

      seen.add(ref.id);
      const value = audit.displayValue ? `, ${audit.displayValue}` : '';
      const hidden = ref.group === 'hidden' ? ' (hidden)' : '';
      lines.push(
        `  ${categoryId} ${ref.id}${hidden}: score ${scoreText(audit.score)}${value}. ${audit.title}`,
      );
    }
  }
  return lines.length > 0 ? ['Failed audits:', ...lines] : ['Failed audits: none'];
}

/**
 * Formats the median run of a preset.
 *
 * @param result The runs of the preset.
 * @returns The lines.
 */
function presetLines(result: PresetResult): string[] {
  const lhr = result.median;
  const lines = [
    `Lighthouse ${lhr.lighthouseVersion}, ${result.preset}, ${lhr.requestedUrl}, median of ${result.runs.length} runs`,
  ];
  lines.push(
    CATEGORIES.map(([id, name]) => `${name} ${scoreText(lhr.categories[id]?.score)}`).join(', '),
  );
  for (const [name, id] of METRICS) {
    const audit = auditOf(lhr, id);
    lines.push(
      `${name.padEnd(4)} ${(audit?.displayValue ?? '-').padStart(10)}  score ${scoreText(audit?.score)}`,
    );
  }
  lines.push(...lcpLines(lhr), ...longTaskLines(lhr), ...failedLines(lhr));
  for (const warning of lhr.runWarnings) {
    lines.push(`Warning: ${warning}`);
  }
  return lines;
}

/**
 * Runs Lighthouse one time on a URL.
 *
 * @param url The URL of the page.
 * @param preset The preset.
 * @param chromeFlags The flags of headless Chrome.
 * @returns The result.
 * @throws Error if Lighthouse fails or gives a fatal error of the run.
 */
async function runLighthouse(
  url: string,
  preset: Preset,
  chromeFlags: readonly string[],
): Promise<LhResult> {
  const file = join(tmpdir(), `lighthouse-${process.pid}-${preset}.json`);
  const args = [
    LIGHTHOUSE_CLI,
    url,
    '--quiet',
    '--output=json',
    `--output-path=${file}`,
    `--chrome-flags=${chromeFlags.join(' ')}`,
    ...(preset === 'desktop' ? ['--preset=desktop'] : []),
  ];
  const status = await new Promise<number | null>((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', done);
  });
  if (status !== 0) {
    throw new Error(`Lighthouse failed with the status ${String(status)}.`);
  }

  // SAFETY: the JSON output of Lighthouse is a result (LHR).
  const lhr = JSON.parse(readFileSync(file, 'utf8')) as LhResult;
  rmSync(file, { force: true });
  if (lhr.runtimeError) {
    throw new Error(`Lighthouse stopped: ${lhr.runtimeError.code}, ${lhr.runtimeError.message}`);
  }
  return lhr;
}

/**
 * Runs the presets under the measure lock: `--measure --result <file>`. Without `--url`, it serves
 * `dist/` as Vercel does while the runs last.
 *
 * @param options The options.
 * @param resultFile The file that gets the result of each preset.
 */
async function measureMain(options: AuditOptions, resultFile: string): Promise<void> {
  const chromeFlags = ['--headless=new'];
  let site: RunningSite | null = null;
  let url = options.url;
  if (url === null) {
    site = await startSiteServer({
      root: join(ROOT, 'dist'),
      host: 'vercel',
      network: LOCAL_NETWORK,
      port: options.port,
    });
    chromeFlags.push(site.trustFlag);
    url = `https://localhost:${options.port}/`;
  }

  const results: PresetResult[] = [];
  try {
    for (const preset of options.presets) {
      const runs: LhResult[] = [];
      for (let run = 0; run < options.runs; run++) {
        const start = performance.now();
        const lhr = await runLighthouse(url, preset, chromeFlags);
        runs.push(lhr);
        const { scores, metrics } = summaryOf(lhr);
        const metricParts = METRICS.map(
          ([name]) => `${name} ${metricText(name, metrics[name] ?? null)}`,
        );
        const seconds = Math.round((performance.now() - start) / 1000);
        console.log(
          `${preset} run ${run + 1} (${seconds} s): performance ${String(scores['performance'])}, ${metricParts.join(', ')}`,
        );
      }
      // SAFETY: computeMedianRun() gives one of the results that it gets.
      const median = computeMedianRun(runs) as LhResult;
      results.push({ preset, runs: runs.map(summaryOf), median });
    }
  } finally {
    site?.close();
  }
  writeFileSync(resultFile, JSON.stringify(results));
}

/**
 * Gives the options of the command line.
 *
 * @param args The arguments.
 * @returns The options, or `null` for a bad use.
 */
function auditOptions(args: readonly string[]): AuditOptions | null {
  const quick = args.includes('--quick');
  const desktop = args.includes('--desktop');
  const url = optionValue(args, '--url');
  const preset = optionValue(args, '--preset');
  const runs = Number(optionValue(args, '--runs') ?? (quick ? '1' : '3'));
  const port = Number(optionValue(args, '--port') ?? '4330');
  if (url === undefined || preset === undefined || (desktop && preset !== null)) {
    return null;
  }

  const chosen = desktop ? 'desktop' : (preset ?? (quick ? 'mobile' : null));
  const presets = PRESETS.filter((name) => chosen === null || name === chosen);
  if (presets.length === 0 || !Number.isInteger(runs) || runs < 1 || !Number.isInteger(port)) {
    return null;
  }
  return { url, presets, runs, port };
}

/**
 * Gives the arguments of the child under the lock, from the options.
 *
 * @param options The options.
 * @returns The arguments, with no `--measure` and no `--result`.
 */
function childArgs(options: AuditOptions): string[] {
  const args = ['--runs', String(options.runs), '--port', String(options.port)];
  if (options.url !== null) {
    args.push('--url', options.url);
  }
  if (options.presets.length === 1) {
    args.push('--preset', options.presets[0] ?? 'mobile');
  }
  return args;
}

/**
 * Audits the page: `pnpm lighthouse` after `pnpm build` (`docs/agents/commands.md`). The server
 * and the runs of Lighthouse run in a child process through `tools/measure-lock.sh`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = auditOptions(args);
  const outFile = optionValue(args, '--out');
  if (!options || outFile === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const resultFile = optionValue(args, '--result');
  if (args.includes('--measure')) {
    if (!resultFile) {
      throw new Error('The child mode needs --result <file>.');
    }
    await measureMain(options, resultFile);
    return;
  }

  if (options.url === null && !existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('The tool reads dist/. Run pnpm build first.');
    process.exitCode = 1;
    return;
  }

  const out = join(tmpdir(), `lighthouse-${process.pid}-result.json`);
  const limit = RUN_LIMIT_S * options.runs * options.presets.length;
  const child = spawnSync(
    join(ROOT, 'tools', 'measure-lock.sh'),
    [
      'run',
      '--owner',
      'lighthouse',
      '--gate',
      '12',
      '--max',
      String(limit),
      '--',
      process.execPath,
      join(ROOT, 'tools', 'lighthouse.ts'),
      '--measure',
      '--result',
      out,
      ...childArgs(options),
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (child.status !== 0) {
    throw new Error(`The audit failed with the status ${String(child.status)}.`);
  }

  // SAFETY: the child of this tool writes the file as a list of PresetResult.
  const results = JSON.parse(readFileSync(out, 'utf8')) as PresetResult[];
  rmSync(out, { force: true });
  for (const result of results) {
    console.log(`\n${presetLines(result).join('\n')}`);
  }
  if (outFile !== null) {
    writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
  }
}

if (import.meta.main) {
  await main();
}
