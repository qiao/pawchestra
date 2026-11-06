import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser } from '@playwright/test';

import { VIEW_SHEETS, isSheetId } from '../src/gallery/sheets.ts';
import type { SheetId, ViewSheet } from '../src/gallery/sheets.ts';
import { openShot, startSite } from './screenshots.ts';

/** The match of the silhouette of one view with the matte of the sheet. */
interface ViewMatch {
  /** The name of the view. */
  readonly view: 'front' | 'side' | 'back';
  /** The intersection over the union of the two silhouettes, from 0 to 1. */
  readonly iou: number;
  /** The pixels that only the sheet has, as a part of the pixels of the sheet. */
  readonly sheetOnly: number;
  /** The pixels that only the model has, as a part of the pixels of the sheet. */
  readonly modelOnly: number;
}

/**
 * The value of a matte pixel that the check ignores: a prop that hides a part of the animal, such
 * as the chair, the violin, the bow, the baton, or the top of the podium.
 */
export const IGNORED = 128;

/** The smallest value of a pixel of a silhouette or a matte that is part of the animal. */
const INSIDE = 200;

/** The views of a sheet, in the order of {@link ViewSheet.views}. */
const VIEW_NAMES = ['front', 'side', 'back'] as const;

/**
 * The mattes of the sheets in `tools/sheet-mattes/`. `make_matte.py` makes each one from the
 * config of its sheet (`<id>.json`).
 */
const MATTE_DIR = join(import.meta.dirname, 'sheet-mattes');

/**
 * Gives the first device column of each view of a sheet, and the end of the last view. A border
 * lies in the middle between the seats of two neighbor views.
 *
 * @param sheet The model sheet.
 * @returns Four columns: the start of the front, the side, and the back view, and the end.
 */
export function viewColumns(sheet: ViewSheet): [number, number, number, number] {
  const [front, side, back] = sheet.views.map((view) => view.x * sheet.sheetScale);
  const width = sheet.width * sheet.sheetScale;
  return [
    0,
    Math.round(((front ?? 0) + (side ?? 0)) / 2),
    Math.round(((side ?? 0) + (back ?? 0)) / 2),
    width,
  ];
}

/**
 * Compares the silhouette of a model with the matte of its sheet, view by view. A matte pixel of
 * {@link IGNORED} counts neither as animal nor as background.
 *
 * @param matte One value for each pixel of the sheet: 255 for the animal, {@link IGNORED}, or 0.
 * @param silhouette One value for each pixel of the page at the size of the sheet: white for the
 *   body, black for the background.
 * @param width The width of the sheet, in pixels.
 * @param columns The view columns of {@link viewColumns}.
 * @returns The match of each view.
 * @throws Error if the two images have different sizes.
 */
export function matchViews(
  matte: Uint8Array,
  silhouette: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
): ViewMatch[] {
  if (matte.length !== silhouette.length) {
    throw new Error(`The matte has ${matte.length} pixels, the silhouette ${silhouette.length}.`);
  }

  const height = matte.length / width;
  return VIEW_NAMES.map((view, i) => {
    let both = 0;
    let sheetOnly = 0;
    let modelOnly = 0;
    for (let y = 0; y < height; y++) {
      for (let x = columns[i] ?? 0; x < (columns[i + 1] ?? 0); x++) {
        const m = matte[y * width + x] ?? 0;
        if (m === IGNORED) {
          continue;
        }
        const inSheet = m >= INSIDE;
        const inModel = (silhouette[y * width + x] ?? 0) >= INSIDE;
        if (inSheet && inModel) {
          both++;
        } else if (inSheet) {
          sheetOnly++;
        } else if (inModel) {
          modelOnly++;
        }
      }
    }
    const sheet = Math.max(1, both + sheetOnly);
    return {
      view,
      iou: both / Math.max(1, both + sheetOnly + modelOnly),
      sheetOnly: sheetOnly / sheet,
      modelOnly: modelOnly / sheet,
    };
  });
}

/**
 * Colors the difference of the two silhouettes: gray where both have the animal, red where only
 * the sheet has it, blue where only the model has it, and dark violet for the ignored pixels.
 *
 * @param matte The matte of the sheet, as for {@link matchViews}.
 * @param silhouette The silhouette of the model, as for {@link matchViews}.
 * @returns The RGBA pixels of the difference image.
 */
export function differenceImage(matte: Uint8Array, silhouette: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(matte.length * 4);
  for (let i = 0; i < matte.length; i++) {
    const m = matte[i] ?? 0;
    const inSheet = m >= INSIDE;
    const inModel = (silhouette[i] ?? 0) >= INSIDE;
    let rgb: readonly [number, number, number] = [40, 40, 40];
    if (m === IGNORED) {
      rgb = [70, 30, 70];
    } else if (inSheet && inModel) {
      rgb = [150, 150, 150];
    } else if (inSheet) {
      rgb = [230, 60, 60];
    } else if (inModel) {
      rgb = [60, 110, 240];
    }
    out.set([...rgb, 255], i * 4);
  }
  return out;
}

/**
 * The pixels of one row of one view where the sheet and the page differ, on each side of the seat
 * of the view.
 */
interface RowDiff {
  /** The name of the view. */
  readonly view: 'front' | 'side' | 'back';
  /** The row of the sheet. */
  readonly row: number;
  /** The animal pixels that only the sheet has, left and right of the seat column. */
  readonly sheetOnly: readonly [number, number];
  /** The body pixels that only the page has, left and right of the seat column. */
  readonly modelOnly: readonly [number, number];
}

/** The rows of the top and the bottom of the animal in one view of the sheet and of the page. */
interface ViewExtent {
  /** The name of the view. */
  readonly view: 'front' | 'side' | 'back';
  /** The first and the last row of the animal in the sheet. */
  readonly sheet: readonly [number, number];
  /** The first and the last row of the body on the page. */
  readonly page: readonly [number, number];
}

/**
 * Finds the runs of a mask in one row, between two columns.
 *
 * @param inside The test of one pixel.
 * @param row The row.
 * @param width The width of the image, in pixels.
 * @param from The first column.
 * @param to The column after the last column.
 * @returns The first and the last column of each run, from the left.
 */
export function rowRuns(
  inside: (i: number) => boolean,
  row: number,
  width: number,
  from: number,
  to: number,
): [number, number][] {
  const runs: [number, number][] = [];
  for (let x = from; x < to; x++) {
    if (!inside(row * width + x)) {
      continue;
    }
    const last = runs.at(-1);
    if (last && last[1] === x - 1) {
      last[1] = x;
    } else {
      runs.push([x, x]);
    }
  }
  return runs;
}

/**
 * Counts the pixels where the sheet and the page differ, row by row and view by view, on each side
 * of the seat of the view. An ignored pixel of the matte does not count.
 *
 * @param matte The matte of the sheet, as for {@link matchViews}.
 * @param silhouette The silhouette of the model, as for {@link matchViews}.
 * @param width The width of the sheet, in pixels.
 * @param columns The view columns of {@link viewColumns}.
 * @param seats The column of the seat of each view: the border between the left and the right.
 * @returns The rows with a difference, from the top down.
 */
export function rowDiffs(
  matte: Uint8Array,
  silhouette: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
  seats: readonly [number, number, number],
): RowDiff[] {
  const height = matte.length / width;
  const out: RowDiff[] = [];
  for (const [i, view] of VIEW_NAMES.entries()) {
    const seat = seats[i] ?? 0;
    for (let row = 0; row < height; row++) {
      const sheetOnly: [number, number] = [0, 0];
      const modelOnly: [number, number] = [0, 0];
      for (let x = columns[i] ?? 0; x < (columns[i + 1] ?? 0); x++) {
        const m = matte[row * width + x] ?? 0;
        if (m === IGNORED) {
          continue;
        }
        const inSheet = m >= INSIDE;
        const inModel = (silhouette[row * width + x] ?? 0) >= INSIDE;
        const side = x < seat ? 0 : 1;
        if (inSheet && !inModel) {
          sheetOnly[side]++;
        } else if (inModel && !inSheet) {
          modelOnly[side]++;
        }
      }
      if (sheetOnly[0] + sheetOnly[1] + modelOnly[0] + modelOnly[1] > 0) {
        out.push({ view, row, sheetOnly, modelOnly });
      }
    }
  }
  return out;
}

/**
 * Finds the top and the bottom row of the animal in each view of the sheet and of the page.
 *
 * @param matte The matte of the sheet, as for {@link matchViews}.
 * @param silhouette The silhouette of the model, as for {@link matchViews}.
 * @param width The width of the sheet, in pixels.
 * @param columns The view columns of {@link viewColumns}.
 * @returns The extent of each view. A view with no pixel gives the rows -1 and -1.
 */
export function viewExtents(
  matte: Uint8Array,
  silhouette: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
): ViewExtent[] {
  const height = matte.length / width;
  const extent = (values: Uint8Array, from: number, to: number): [number, number] => {
    let top = -1;
    let bottom = -1;
    for (let row = 0; row < height; row++) {
      if (rowRuns((p) => (values[p] ?? 0) >= INSIDE, row, width, from, to).length > 0) {
        if (top < 0) {
          top = row;
        }
        bottom = row;
      }
    }
    return [top, bottom];
  };
  return VIEW_NAMES.map((view, i) => ({
    view,
    sheet: extent(matte, columns[i] ?? 0, columns[i + 1] ?? 0),
    page: extent(silhouette, columns[i] ?? 0, columns[i + 1] ?? 0),
  }));
}

/** The colors of the animal pixels of one view of an image. */
interface ColorStats {
  /** The name of the view. */
  readonly view: 'front' | 'side' | 'back';
  /** The number of pixels. */
  readonly count: number;
  /** The median of the red, the green, and the blue channel. */
  readonly median: readonly [number, number, number];
  /** The 20th and the 80th percentile of the value (the largest channel of each pixel). */
  readonly value: readonly [number, number];
}

/**
 * Gives the colors of the pixels of each view inside a mask: the medians of the channels and two
 * percentiles of the value, so that two images can be compared for color and contrast.
 *
 * @param rgba The RGBA pixels of the image.
 * @param mask One value for each pixel: a pixel counts at {@link INSIDE} or more.
 * @param width The width of the image, in pixels.
 * @param columns The view columns of {@link viewColumns}.
 * @returns The colors of each view.
 */
export function colorStats(
  rgba: Uint8Array,
  mask: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
): ColorStats[] {
  const height = mask.length / width;
  const percentile = (values: number[], part: number): number => {
    const sorted = values.toSorted((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(part * sorted.length))] ?? 0;
  };
  return VIEW_NAMES.map((view, i) => {
    const channels: [number[], number[], number[]] = [[], [], []];
    const values: number[] = [];
    for (let row = 0; row < height; row++) {
      for (let x = columns[i] ?? 0; x < (columns[i + 1] ?? 0); x++) {
        const p = row * width + x;
        if ((mask[p] ?? 0) < INSIDE) {
          continue;
        }
        const rgb = [rgba[p * 4] ?? 0, rgba[p * 4 + 1] ?? 0, rgba[p * 4 + 2] ?? 0] as const;
        channels[0].push(rgb[0]);
        channels[1].push(rgb[1]);
        channels[2].push(rgb[2]);
        values.push(Math.max(...rgb));
      }
    }
    return {
      view,
      count: values.length,
      median: [
        percentile(channels[0], 0.5),
        percentile(channels[1], 0.5),
        percentile(channels[2], 0.5),
      ],
      value: [percentile(values, 0.2), percentile(values, 0.8)],
    };
  });
}

/**
 * Picks the rows of a view with the most different pixels, at least some rows apart, so that one
 * wide part does not fill the list.
 *
 * @param diffs The rows of {@link rowDiffs}.
 * @param view The view.
 * @param count The largest number of rows.
 * @param spacing The smallest distance between two picked rows.
 * @returns The rows, the largest difference first.
 */
export function largestDiffs(
  diffs: readonly RowDiff[],
  view: RowDiff['view'],
  count: number,
  spacing: number,
): RowDiff[] {
  const size = (d: RowDiff): number =>
    d.sheetOnly[0] + d.sheetOnly[1] + d.modelOnly[0] + d.modelOnly[1];
  const picked: RowDiff[] = [];
  for (const diff of diffs.filter((d) => d.view === view).toSorted((a, b) => size(b) - size(a))) {
    if (picked.length >= count) {
      break;
    }
    if (picked.every((p) => Math.abs(p.row - diff.row) >= spacing)) {
      picked.push(diff);
    }
  }
  return picked;
}

/**
 * Reads the RGBA pixels of a PNG image with the canvas of the browser.
 *
 * @param browser The browser.
 * @param png The PNG image.
 * @returns The width and four values for each pixel.
 */
export async function rgbaPixels(
  browser: Browser,
  png: Buffer,
): Promise<{ width: number; rgba: Uint8Array }> {
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(
      async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let text = '';
        for (const value of rgba) {
          text += String.fromCharCode(value);
        }
        return { width: canvas.width, base64: btoa(text) };
      },
      `data:image/png;base64,${png.toString('base64')}`,
    );
    return { width: result.width, rgba: new Uint8Array(Buffer.from(result.base64, 'base64')) };
  } finally {
    await page.close();
  }
}

/**
 * Takes one channel of RGBA pixels.
 *
 * @param rgba The RGBA pixels.
 * @param channel The channel: 0 for red.
 * @returns One value for each pixel.
 */
function channelOf(rgba: Uint8Array, channel: number): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = rgba[i * 4 + channel] ?? 0;
  }
  return out;
}

/**
 * Encodes RGBA pixels, or stacks PNG images from the top down, as one PNG image with the canvas
 * of the browser.
 *
 * @param browser The browser.
 * @param width The width of the image, in pixels.
 * @param parts The RGBA pixels at the width, or PNG images, from the top down.
 * @returns The PNG image.
 */
async function stackPng(
  browser: Browser,
  width: number,
  parts: readonly (Uint8ClampedArray | Buffer)[],
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const sources = parts.map((part) =>
      Buffer.isBuffer(part)
        ? { png: `data:image/png;base64,${part.toString('base64')}`, rgba: '' }
        : { png: '', rgba: Buffer.from(part.buffer).toString('base64') },
    );
    const dataUrl = await page.evaluate(
      async ({ width: w, items }) => {
        const layers: (HTMLImageElement | ImageData)[] = [];
        for (const item of items) {
          if (item.png) {
            const image = new Image();
            image.src = item.png;
            await image.decode();
            layers.push(image);
          } else {
            const bytes = Uint8ClampedArray.from(atob(item.rgba), (c) => c.charCodeAt(0));
            layers.push(new ImageData(bytes, w));
          }
        }
        const heightOf = (layer: HTMLImageElement | ImageData): number =>
          layer instanceof ImageData
            ? layer.height
            : (layer.naturalHeight * w) / layer.naturalWidth;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = layers.reduce((sum, layer) => sum + heightOf(layer), 0);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        let top = 0;
        for (const layer of layers) {
          if (layer instanceof ImageData) {
            context.putImageData(layer, 0, top);
          } else {
            context.drawImage(layer, 0, top, w, heightOf(layer));
          }
          top += heightOf(layer);
        }
        return canvas.toDataURL('image/png');
      },
      { width, items: sources },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await page.close();
  }
}

/**
 * Captures a sheet page at the size of the sheet.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param id The sheet.
 * @param matte True for the silhouette of the body.
 * @returns The PNG image.
 */
async function capture(
  browser: Browser,
  base: string,
  id: SheetId,
  matte: boolean,
): Promise<Buffer> {
  const sheet = VIEW_SHEETS[id];
  const path = `/views.html?sheet=${id}${matte ? '&matte' : ''}`;
  const page = await openShot(
    browser,
    base + path.slice(1),
    { file: '', path, width: sheet.width, height: sheet.height, ready: '[data-ready="views"]' },
    sheet.sheetScale,
  );
  try {
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * Gives the device column of the seat of each view of a sheet.
 *
 * @param sheet The model sheet.
 * @returns The three columns.
 */
function seatColumns(sheet: ViewSheet): [number, number, number] {
  const [front, side, back] = sheet.views.map((view) => Math.round(view.x * sheet.sheetScale));
  return [front ?? 0, side ?? 0, back ?? 0];
}

/**
 * Prints the top and the bottom row of each view, the rows with the most different pixels, and the
 * colors of the animal in the sheet and on the page.
 *
 * @param matte The matte of the sheet.
 * @param silhouette The silhouette of the page.
 * @param width The width of the sheet, in pixels.
 * @param columns The view columns.
 * @param seats The seat column of each view.
 * @param sheetRgba The RGBA pixels of the sheet.
 * @param pageRgba The RGBA pixels of the page.
 */
function report(
  matte: Uint8Array,
  silhouette: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
  seats: readonly [number, number, number],
  sheetRgba: Uint8Array,
  pageRgba: Uint8Array,
): void {
  const diffs = rowDiffs(matte, silhouette, width, columns, seats);
  const sheetColors = colorStats(sheetRgba, matte, width, columns);
  const pageColors = colorStats(pageRgba, silhouette, width, columns);
  const color = (stats: ColorStats | undefined): string =>
    stats ? `${stats.median.join(', ')} (value p20 ${stats.value[0]}, p80 ${stats.value[1]})` : '';
  for (const extent of viewExtents(matte, silhouette, width, columns)) {
    const { view } = extent;
    console.log(
      `${view.padEnd(5)} top: sheet ${extent.sheet[0]}, page ${extent.page[0]}  bottom: sheet ${extent.sheet[1]}, page ${extent.page[1]}`,
    );
    for (const d of largestDiffs(diffs, view, 5, 12)) {
      console.log(
        `      row ${d.row}: sheet only ${d.sheetOnly[0]} px left, ${d.sheetOnly[1]} px right; page only ${d.modelOnly[0]} px left, ${d.modelOnly[1]} px right`,
      );
    }
    console.log(
      `      color: sheet ${color(sheetColors.find((c) => c.view === view))}, page ${color(pageColors.find((c) => c.view === view))}`,
    );
  }
}

/**
 * Formats the runs of the animal of each view, every second row, as a table: the runs of the sheet
 * and the runs of the page.
 *
 * @param matte The matte of the sheet.
 * @param silhouette The silhouette of the page.
 * @param width The width of the sheet, in pixels.
 * @param columns The view columns.
 * @returns The text of the table.
 */
function rowTable(
  matte: Uint8Array,
  silhouette: Uint8Array,
  width: number,
  columns: readonly [number, number, number, number],
): string {
  const height = matte.length / width;
  const text = (runs: readonly [number, number][]): string =>
    runs.map(([a, b]) => `${a}-${b}`).join(' ') || '-';
  const lines: string[] = [];
  for (const [i, view] of VIEW_NAMES.entries()) {
    const from = columns[i] ?? 0;
    const to = columns[i + 1] ?? 0;
    lines.push(`${view}: row | sheet runs | page runs`);
    for (let row = 0; row < height; row += 2) {
      const sheet = rowRuns((p) => (matte[p] ?? 0) >= INSIDE, row, width, from, to);
      const page = rowRuns((p) => (silhouette[p] ?? 0) >= INSIDE, row, width, from, to);
      if (sheet.length > 0 || page.length > 0) {
        lines.push(`${String(row).padStart(5)} | ${text(sheet)} | ${text(page)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const [name, out] = process.argv.slice(2);
  if (!isSheetId(name) || !out) {
    console.error(
      `Usage: pnpm sheet-check <${Object.keys(VIEW_SHEETS).join(' | ')}> <output directory>`,
    );
    process.exit(1);
  }

  const id = name;
  const root = join(import.meta.dirname, '..');
  const sheet = VIEW_SHEETS[id];
  await mkdir(out, { recursive: true });
  const site = await startSite(root);
  try {
    const look = await capture(site.browser, site.base, id, false);
    const matte = await capture(site.browser, site.base, id, true);
    await writeFile(join(out, `${id}-render.png`), look);
    await writeFile(join(out, `${id}-matte.png`), matte);
    const reference = await readFile(join(root, 'docs', 'reference', sheet.file));
    const compare = await stackPng(site.browser, sheet.width * sheet.sheetScale, [reference, look]);
    await writeFile(join(out, `${id}-compare.png`), compare);
    console.log(join(out, `${id}-compare.png`));

    const matteFile = join(MATTE_DIR, `${id}.png`);
    const sheetMatte = await readFile(matteFile).catch(() => null);
    if (!sheetMatte) {
      console.log(`No matte ${matteFile}: no silhouette check.`);
      return;
    }
    const expected = await rgbaPixels(site.browser, sheetMatte);
    const actual = await rgbaPixels(site.browser, matte);
    const width = expected.width;
    const sheetValues = channelOf(expected.rgba, 0);
    const pageValues = channelOf(actual.rgba, 0);
    const columns = viewColumns(sheet);
    for (const match of matchViews(sheetValues, pageValues, width, columns)) {
      console.log(
        `${match.view.padEnd(5)} IoU ${match.iou.toFixed(3)}  sheet only ${(100 * match.sheetOnly).toFixed(1)}%  model only ${(100 * match.modelOnly).toFixed(1)}%`,
      );
    }
    report(
      sheetValues,
      pageValues,
      width,
      columns,
      seatColumns(sheet),
      (await rgbaPixels(site.browser, reference)).rgba,
      (await rgbaPixels(site.browser, look)).rgba,
    );
    await writeFile(join(out, `${id}-rows.txt`), rowTable(sheetValues, pageValues, width, columns));
    const diff = differenceImage(sheetValues, pageValues);
    await writeFile(join(out, `${id}-diff.png`), await stackPng(site.browser, width, [diff]));
  } finally {
    await site.close();
  }
}

if (import.meta.main) {
  await main();
}
