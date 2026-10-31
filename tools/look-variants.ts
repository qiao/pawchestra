/**
 * Renders look variants with `pnpm look-lab` on a dev server of its own, and prints the measures
 * of each variant in one table (design 4.5).
 *
 * Usage: `pnpm look-variants <variants.json> --out <dir> [--port <p>]`
 *
 * `<variants.json>` holds one object: the name of each variant, a folder name, and its changes.
 * The changes are look paths and values, as the query `look` of the dev server
 * (`src/app/look-override.ts`, `LOOK_ROOTS` of `src/scene/look-values.ts`), and the optional key
 * `solo`, as the query `solo` (`soloSeats()`). An empty object renders the working tree:
 *
 * ```json
 * { "main": { "BACK_ROW_LIGHT.illuminance": 0, "LIGHT_POOL.reachBack": 0.42 }, "tree": {} }
 * ```
 *
 * The steps:
 *
 * 1. It checks each change in Node, before it starts a server: an unknown path, a refused path,
 *    a value of the wrong kind, and a solo with no seat in the layout of the default demo stop
 *    the run with a message that names them.
 * 2. It writes the files of `pnpm dev`, and starts the Vite dev server on 127.0.0.1 at a free port,
 *    or at `--port`. It refuses a port that is in use, because other dev servers can run too.
 * 3. It runs `pnpm look-lab <dir>/<name> --url <url>` for each variant, with the log in
 *    `<dir>/<name>.log`. A failed variant does not stop the others.
 * 4. It stops the server by its PID, also after a failure and after Ctrl-C. Each run of
 *    `pnpm look-lab` has a process group of its own, which a stop ends as a whole.
 * 5. It prints the tables of `lookSummary()` and `defaultSummary()` of `tools/look-lab.ts`, one
 *    row for each variant, with the row of the reference first, and writes them to
 *    `<dir>/variants.md`. The white fur of each variant takes the pixels of the mask of the first
 *    variant, so the light color does not change the pixel set. The column `n` gives the count
 *    of the own mask of the variant, so a change of the pixel set shows.
 *
 * It exits with 1 when a variant fails.
 */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { DEFAULT_DEMO } from '../src/app/demos.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { checkLook, parseLook, soloSeats } from '../src/scene/look-values.ts';
import type { LookChanges } from '../src/scene/look-values.ts';
import { scoreOf } from '../src/score/test-score.ts';
import { defaultSummary, lookRegions, lookSummary, readLookFrames } from './look-lab.ts';
import type { LookFrame, SummaryRow } from './look-lab.ts';
import { patchedDemo } from './patch-demos.ts';
import { ROOT, optionValue } from './ref-tree.ts';
import { stopChildren, trackChild } from './stop-cleanup.ts';

/** The host of the dev server. A fixed address keeps the server off a port of another host. */
const HOST = '127.0.0.1';

/** The longest wait for the dev server to answer, in milliseconds. */
const READY_MS = 30_000;

/** One variant of the variants file. */
interface Variant {
  /** The name: the folder of its frames in the output folder. */
  readonly name: string;
  /** The look changes. */
  readonly look: LookChanges;
  /** The seats and species of the solo, or `null` with no solo. */
  readonly solo: string | null;
}

/** The command line. */
interface VariantsArgs {
  /** The variants file. */
  readonly file: string;
  /** The output folder. */
  readonly out: string;
  /** The port of the dev server, or `null` for a free port. */
  readonly port: number | null;
}

const USAGE = 'Usage: pnpm look-variants <variants.json> --out <dir> [--port <p>]';

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The command line.
 * @throws Error with the usage for a missing file or folder, or a wrong port.
 */
function readArgs(args: readonly string[]): VariantsArgs {
  const [file] = args;
  const out = optionValue(args, '--out');
  const portText = optionValue(args, '--port');
  if (!file || file.startsWith('--') || !out || portText === undefined) {
    throw new Error(USAGE);
  }
  const port = portText === null ? null : Number(portText);
  if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65_535)) {
    throw new Error(`The port must be an integer from 1024 to 65535, and it is "${portText}".`);
  }
  return { file: resolve(file), out: resolve(out), port };
}

/**
 * Reads the variants file: the name of each variant and its changes.
 *
 * @param text The JSON text of the file.
 * @returns The variants, in the order of the file.
 * @throws Error that names the variant, for a wrong name, a wrong solo, or a wrong change.
 */
export function parseVariants(text: string): Variant[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('The variants file is no JSON text.', { cause: error });
  }
  if (!(parsed instanceof Object) || Array.isArray(parsed)) {
    throw new Error('The variants file is no JSON object of name -> changes.');
  }
  return Object.entries(parsed).map(([name, value]) => {
    if (!/^[\w.-]+$/.test(name)) {
      throw new Error(
        `The variant name "${name}" is no folder name: use letters, digits, ., -, _.`,
      );
    }
    let look: LookChanges;
    try {
      look = parseLook(JSON.stringify(value));
    } catch (error) {
      throw new Error(`The variant ${name} is no object of look paths and values.`, {
        cause: error,
      });
    }
    const solo = look.get('solo');
    if (solo !== undefined && !/^[\w,-]+$/.test(String(solo))) {
      throw new Error(
        `The solo of the variant ${name} is no list of seats and species: ${JSON.stringify(solo)}.`,
      );
    }
    const changes = new Map([...look].filter(([path]) => path !== 'solo'));
    return { name, look: changes, solo: solo === undefined ? null : String(solo) };
  });
}

/**
 * Checks the changes of each variant in Node, with the same code as the dev server.
 *
 * @param variants The variants.
 * @returns A text line for each change.
 * @throws Error that names the variant and the path, for a change that the override refuses, or
 *   a solo with no seat in the layout of the default demo.
 */
async function checkVariants(variants: readonly Variant[]): Promise<string[]> {
  const lines: string[] = [];
  const solos = variants.filter((v) => v.solo !== null);
  const layout =
    solos.length > 0
      ? layoutScene(scoreOf((await patchedDemo(`${DEFAULT_DEMO}.mid`)).bytes), new ModelCache())
      : null;
  for (const variant of variants) {
    try {
      const changes = checkLook(variant.look).map((c) => `${c.path} ${c.before} -> ${c.after}`);
      if (variant.solo !== null && layout) {
        changes.push(
          `solo ${variant.solo}: seats ${soloSeats(variant.solo, layout.players).join(', ')}`,
        );
      }
      lines.push(`${variant.name}: ${changes.length > 0 ? changes.join(', ') : 'no change'}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      throw new Error(`The variant ${variant.name} has a wrong change. ${text}`, { cause: error });
    }
  }
  return lines;
}

/**
 * Gives a port that no server uses on {@link HOST}: the given port, or a free port of the system.
 *
 * @param port The port, or `null` for a free port.
 * @returns A promise of the port.
 * @throws Error if the given port is in use.
 */
function freePort(port: number | null): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', (error) => {
      fail(
        new Error(
          `The port ${port} is in use on ${HOST}. Give another --port, or no --port for a free port.`,
          { cause: error },
        ),
      );
    });
    server.listen({ host: HOST, port: port ?? 0, exclusive: true }, () => {
      const address = server.address();
      const found = address instanceof Object ? address.port : 0;
      server.close(() => done(found));
    });
  });
}

/**
 * Starts the Vite dev server on a port, and waits until it answers.
 *
 * @param port The port. Vite exits when another server takes it first (`--strictPort`).
 * @param log The file of the output of the server.
 * @returns The server process and its URL.
 * @throws Error if the server exits or does not answer in {@link READY_MS}.
 */
async function startServer(
  port: number,
  log: string,
): Promise<{ readonly child: ChildProcess; readonly url: string }> {
  const fd = openSync(log, 'w');
  const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
  const child = trackChild(
    spawn(process.execPath, [vite, '--host', HOST, '--port', String(port), '--strictPort'], {
      cwd: ROOT,
      stdio: ['ignore', fd, fd],
    }),
  );
  closeSync(fd);
  const url = `http://${HOST}:${port}/`;
  const start = Date.now();
  while (Date.now() - start < READY_MS) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The dev server stopped before it answered. See ${log}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return { child, url };
      }
    } catch {
      // The server does not answer yet.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`The dev server did not answer in ${READY_MS / 1000} s. See ${log}.`);
}

/**
 * Gives the URL of a variant: the site with the queries `look` and `solo`.
 *
 * @param site The URL of the dev server.
 * @param variant The variant.
 * @returns The URL.
 */
export function variantUrl(site: string, variant: Variant): string {
  const query = new URLSearchParams();
  if (variant.look.size > 0) {
    query.set('look', JSON.stringify(Object.fromEntries(variant.look)));
  }
  if (variant.solo !== null) {
    query.set('solo', variant.solo);
  }
  const text = query.toString();
  return text ? `${site}?${text}` : site;
}

/** The process groups of the runs of `pnpm look-lab` that run now, by the PID of each run. */
const groups = new Set<number>();

/**
 * Sends TERM to each process group of {@link groups}: the run of `pnpm look-lab`, its run of
 * `close-views`, and their browsers. A signal to the PID of the run alone leaves its children.
 */
function stopGroups(): void {
  for (const pid of groups) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // The group has ended.
    }
  }
}

/**
 * Runs `pnpm look-lab --url` for one variant, in a process group of its own, with its output in a
 * log file. A stop of the tool ends the group ({@link stopGroups}).
 *
 * @param out The output folder.
 * @param site The URL of the dev server.
 * @param variant The variant.
 * @returns A promise of the exit code.
 */
function runVariant(out: string, site: string, variant: Variant): Promise<number> {
  const fd = openSync(join(out, `${variant.name}.log`), 'w');
  const child = trackChild(
    spawn(
      process.execPath,
      [
        join(ROOT, 'tools/look-lab.ts'),
        join(out, variant.name),
        '--url',
        variantUrl(site, variant),
      ],
      { cwd: ROOT, stdio: ['ignore', fd, fd], detached: true },
    ),
  );
  closeSync(fd);
  const pid = child.pid;
  if (pid !== undefined) {
    groups.add(pid);
  }
  return new Promise((done) => {
    child.once('close', (code) => {
      if (pid !== undefined) {
        groups.delete(pid);
      }
      done(code ?? 1);
    });
  });
}

/**
 * Writes a Markdown table of summary rows.
 *
 * @param rows The label and the columns of each row.
 * @returns The table.
 */
export function summaryTable(rows: readonly (readonly [label: string, row: SummaryRow])[]): string {
  const first = rows[0]?.[1] ?? [];
  const lines = [
    `| variant | ${first.map(([name]) => name).join(' | ')} |`,
    `|---|${first.map(() => '---|').join('')}`,
  ];
  for (const [label, row] of rows) {
    lines.push(`| ${label} | ${row.map(([, text]) => text).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Checks the variants, renders each one on a dev server of its own, stops the server, and prints
 * the table of the measures.
 */
async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const variants = parseVariants(await readFile(args.file, 'utf8'));
  for (const line of await checkVariants(variants)) {
    console.log(line);
  }
  const port = await freePort(args.port);
  await mkdir(args.out, { recursive: true });

  // The files of `pnpm dev`: the presets of the SoundFont, the changed demos, and perf-60.mid.
  for (const tool of ['split-soundfont.ts', 'patch-demos.ts', 'write-perf-60.ts']) {
    execFileSync(process.execPath, [join(ROOT, 'tools', tool)], { cwd: ROOT, stdio: 'ignore' });
  }

  const failed: string[] = [];
  const log = join(args.out, 'dev-server.log');
  const server = await startServer(port, log);
  // The handler of `stop-cleanup.ts` stops the server and each run by its PID, and this one ends
  // the process group of each run.
  process.on('SIGINT', stopGroups);
  process.on('SIGTERM', stopGroups);
  console.log(`dev server: ${server.url} (PID ${server.child.pid}), log ${log}`);
  try {
    for (const variant of variants) {
      const start = Date.now();
      const code = await runVariant(args.out, server.url, variant);
      const time = `${((Date.now() - start) / 1000).toFixed(0)} s`;
      if (code === 0) {
        console.log(`${variant.name}: done in ${time}`);
      } else {
        failed.push(variant.name);
        console.log(`${variant.name}: FAILED (exit ${code}) in ${time}, see ${variant.name}.log`);
      }
    }
  } finally {
    await stopChildren();
    console.log(`dev server: stopped (PID ${server.child.pid})`);
  }

  // The browser decodes the PNG files with no GPU flags, as `pnpm look-lab` does, so that the
  // pixels of the reference are the same in both tools.
  const browser = await chromium.launch();
  const regions = await lookRegions();
  const orchestraRows: [string, SummaryRow][] = [];
  const defaultRows: [string, SummaryRow][] = [];
  let pixelsOf: { readonly name: string; readonly frame: LookFrame } | null = null;
  try {
    for (const variant of variants.filter((v) => !failed.includes(v.name))) {
      const frames = await readLookFrames(browser, join(args.out, variant.name));
      const find = (label: string): LookFrame | undefined =>
        frames.find((frame) => frame.label === label);
      const reference = frames[0];
      if (orchestraRows.length === 0 && reference) {
        orchestraRows.push(['reference', lookSummary(reference)]);
        defaultRows.push(['reference', defaultSummary(reference, regions, null)]);
      }
      const orchestra = find('tree, orchestra');
      if (orchestra) {
        orchestraRows.push([variant.name, lookSummary(orchestra)]);
      }
      const view = find('tree, default');
      if (view) {
        // The white fur of each variant takes the pixel set of the first variant.
        pixelsOf ??= { name: variant.name, frame: view };
        defaultRows.push([variant.name, defaultSummary(view, regions, pixelsOf.frame)]);
      }
    }
  } finally {
    await browser.close();
  }
  const note = pixelsOf
    ? `The white fur of each variant takes the pixels of the variant ${pixelsOf.name}, and n gives the count of its own mask (\`tools/look-regions.ts\`).\n`
    : '';
  const tables = [
    `## Camera orchestra\n\n${summaryTable(orchestraRows)}`,
    `## Camera default\n\n${note}\n${summaryTable(defaultRows)}`,
  ].join('\n');
  await writeFile(join(args.out, 'variants.md'), `# Look variants\n\n${tables}`);
  console.log(`\n${tables}`);
  if (failed.length > 0) {
    console.log(`Failed variants: ${failed.join(', ')}.`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // A refused variant or port is no bug of the tool, so the message alone is enough.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
