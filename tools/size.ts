import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { Manifest } from 'vite';

import { castBodies } from '../src/app/body-loads.ts';
import { DEFAULT_DEMO } from '../src/app/demos.ts';
import { buildScore } from '../src/score/score.ts';
import { isGzip } from './gzip-site.ts';
import { ROOT, optionValue, shortHash, withRefBuild } from './ref-tree.ts';

/** Limit of the first download after gzip, in bytes (design 7.2). */
const SIZE_LIMIT_BYTES = 1_000_000;

/** One file of the first download, with its sizes in bytes. */
interface DownloadPart {
  /** Path relative to the repository root. */
  readonly path: string;
  readonly gzipBytes: number;
}

/** Lines of the size report, and the verdict of the limit. */
export interface SizeReport {
  readonly lines: readonly string[];
  /** True if the gzip total is at most the limit. */
  readonly pass: boolean;
}

/**
 * Lists the output files of an entry chunk, its static imports, their CSS, and their assets, such
 * as the skin textures of the rigged bodies (design 4.4), in the order of a depth-first walk. Each
 * file appears once.
 *
 * @param manifest The Vite build manifest.
 * @param entry The manifest key of the entry, such as `index.html`.
 * @returns The file paths, relative to the output directory.
 * @throws Error if the manifest has no chunk for the entry or for one of its imports.
 */
export function staticChunkFiles(manifest: Manifest, entry: string): string[] {
  const files = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) {
      throw new Error(`The Vite manifest has no chunk "${key}".`);
    }
    files.add(chunk.file);
    for (const css of chunk.css ?? []) {
      files.add(css);
    }
    for (const asset of chunk.assets ?? []) {
      files.add(asset);
    }
    for (const imported of chunk.imports ?? []) {
      visit(imported);
    }
  };
  visit(entry);
  return [...files];
}

/**
 * Lists the built assets that an HTML file loads with a `<script src>` or a `<link href>`. In a
 * build with several entries, Vite puts the module preload polyfill into a shared chunk. The
 * HTML loads this chunk, but the manifest entry of the HTML file does not import it.
 *
 * @param html The text of the built HTML file.
 * @returns The paths relative to the output directory, from the `assets/` folder of Vite.
 */
export function htmlAssetFiles(html: string): string[] {
  const files: string[] = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    const url = match[1] ?? '';
    const at = url.indexOf('assets/');
    if (at >= 0 && !/^[a-z]+:/i.test(url)) {
      files.push(url.slice(at));
    }
  }
  return files;
}

/**
 * Formats one line for each part, then the total and the limit.
 *
 * @param parts The files of the first download.
 * @param limitBytes The limit of the gzip total, in bytes.
 * @returns The report lines and the verdict.
 */
export function sizeReport(parts: readonly DownloadPart[], limitBytes: number): SizeReport {
  const bytes = (value: number): string => `${value.toLocaleString('en-US')} B`.padStart(12);
  const total = parts.reduce((sum, part) => sum + part.gzipBytes, 0);
  const pass = total <= limitBytes;
  const lines = [
    'First download after gzip (design 7.2):',
    ...parts.map((part) => `${bytes(part.gzipBytes)}  ${part.path}`),
    `${bytes(total)}  total`,
    `${bytes(limitBytes)}  limit: ${pass ? 'pass' : 'FAIL'}`,
  ];
  return { lines, pass };
}

/**
 * Finds the file of the default demo that the first download holds (design 7.2). The build writes
 * the changed file to `dist/demos/` as gzip data. With no such file, the check counts the source.
 *
 * @param dist The output directory of the build.
 * @param demosDir The folder of the demo inputs.
 * @param exists Tells if a file exists.
 * @returns The path of the built file, or of the source file.
 */
export function defaultDemoFile(
  dist: string,
  demosDir: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const built = join(dist, 'demos', `${DEFAULT_DEMO}.mid`);
  return exists(built) ? built : join(demosDir, 'src', `${DEFAULT_DEMO}.mid`);
}

/**
 * Lists the output files of the bodies that the default demo casts (design 7.2). The app
 * loads these chunks before the layout of the first piece, so they count as a part of the first
 * download. A build that has the bodies in a static chunk has no chunk for a body, and gives none.
 *
 * @param manifest The Vite build manifest.
 * @param demo The bytes of the file of the default demo, also as gzip data.
 * @returns The file paths, relative to the output directory.
 * @throws Error if the demo is not a valid file.
 */
export function castBodyFiles(manifest: Manifest, demo: Uint8Array): string[] {
  const result = buildScore(isGzip(demo) ? gunzipSync(demo) : demo, 'auto');
  if (!result.ok) {
    throw new Error(`The default demo ${DEFAULT_DEMO} is not valid: ${result.error}.`);
  }
  return castBodies(result.score)
    .map((name) => `src/models/bodies/${name}.ts`)
    .filter((key) => manifest[key] !== undefined)
    .flatMap((key) => staticChunkFiles(manifest, key));
}

/**
 * Formats the totals of a base commit and of the working tree, and their difference.
 *
 * @param label The name of the base, such as `main (cc83899c)`.
 * @param base The parts of the first download of the base.
 * @param parts The parts of the first download of the working tree.
 * @returns The lines.
 */
export function baseLines(
  label: string,
  base: readonly DownloadPart[],
  parts: readonly DownloadPart[],
): string[] {
  const total = (list: readonly DownloadPart[]): number =>
    list.reduce((sum, part) => sum + part.gzipBytes, 0);
  const change = total(parts) - total(base);
  const sign = change > 0 ? '+' : change < 0 ? '-' : '';
  const bytes = (text: string): string => `${text} B`.padStart(12);
  return [
    `Base ${label}, built in a temporary folder:`,
    `${bytes(total(base).toLocaleString('en-US'))}  total of the base`,
    `${bytes(total(parts).toLocaleString('en-US'))}  total of the working tree`,
    `${bytes(`${sign}${Math.abs(change).toLocaleString('en-US')}`)}  difference`,
  ];
}

/**
 * Measures one file as the host sends it. The build gzips the demo files (`tools/gzip-site.ts`),
 * and GitHub Pages sends them with no second gzip. Thus a file that is gzip data counts with its
 * own size, and each other file counts with the size of its gzip.
 *
 * @param root The folder that the path of the part is relative to.
 * @param path The path of the file.
 * @returns The part.
 */
async function measure(root: string, path: string): Promise<DownloadPart> {
  const data = await readFile(path);
  return {
    path: relative(root, path),
    gzipBytes: isGzip(data) ? data.byteLength : gzipSync(data).byteLength,
  };
}

/**
 * Measures the files of the first download of a build: the page, its static chunks, the default
 * demo, and the bodies that the default demo casts.
 *
 * @param root The folder of the build, with its `dist/` and its `demos/`.
 * @returns The parts, with their paths relative to the folder.
 */
async function measureBuild(root: string): Promise<DownloadPart[]> {
  const dist = join(root, 'dist');
  const manifestText = await readFile(join(dist, '.vite', 'manifest.json'), 'utf8');
  // SAFETY: Vite writes this file in the format of its Manifest type (build.manifest).
  const manifest = JSON.parse(manifestText) as Manifest;
  const demo = defaultDemoFile(dist, join(root, 'demos'));
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  // The build puts the CSS of index.html inline (design 7.2), so the page holds the CSS that the
  // manifest names. The check counts only the CSS files that the page links.
  const linked = htmlAssetFiles(html);
  const chunks = staticChunkFiles(manifest, 'index.html').filter(
    (file) => !file.endsWith('.css') || linked.includes(file),
  );
  const bodies = castBodyFiles(manifest, await readFile(demo));
  const files = new Set([...chunks, ...linked, ...bodies]);
  const paths = [join(dist, 'index.html'), ...[...files].map((file) => join(dist, file)), demo];
  return Promise.all(paths.map((path) => measure(root, path)));
}

/**
 * Prints the size report of the build in `dist/`: `node tools/size.ts [--base <ref>]`. With
 * `--base`, it also builds the commit in a temporary folder, and prints the totals and their
 * difference.
 */
async function main(): Promise<void> {
  const ref = optionValue(process.argv.slice(2), '--base');
  if (ref === undefined) {
    console.error('Usage: pnpm size [--base <ref>]');
    process.exitCode = 1;
    return;
  }

  let label = '';
  if (ref !== null) {
    try {
      label = `${ref} (${shortHash(ref)})`;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
  }

  const parts = await measureBuild(ROOT);
  const report = sizeReport(parts, SIZE_LIMIT_BYTES);
  console.log(report.lines.join('\n'));
  if (ref !== null) {
    const base = await withRefBuild(ref, measureBuild);
    console.log(baseLines(label, base, parts).join('\n'));
  }
  if (!report.pass) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
