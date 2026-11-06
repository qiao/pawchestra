import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser } from '@playwright/test';

import { openShot, startSite, toWebp } from './screenshots.ts';

/**
 * One view of the choir check: a crop of one penguin in a reference image, and the gallery camera
 * that copies the camera of that image (design 4.4, 7.1).
 */
interface ChoirView {
  /** The name of the view in the file names. */
  readonly name: 'front' | 'side';
  /** The reference image in `docs/reference/`. */
  readonly reference: string;
  /** The crop of one penguin in the reference image, in pixels: left, top, width, height. */
  readonly crop: readonly [left: number, top: number, width: number, height: number];
  /** The turn of the gallery camera to the right side of the penguin, in degrees. */
  readonly azimuth: number;
  /** The angle of the gallery camera above the floor, in degrees. */
  readonly elevation: number;
  /**
   * The time of the gallery time slider, in seconds. The default test notes sound from 0 s to
   * 2.5 s and from 3 s to 4 s, so the beak is open at 1.75 s and closed at 2.75 s.
   */
  readonly time: number;
}

/**
 * The views of the check. The front view copies the penguin at the front right of the choir in
 * `orchestra-latest.png`, with a closed beak. The side view copies the penguin at the front left
 * of `orchestra-side.png`, which sings with an open beak and turns its right side to the camera.
 */
export const CHOIR_VIEWS: readonly ChoirView[] = [
  {
    name: 'front',
    reference: 'orchestra-latest.png',
    crop: [1060, 236, 80, 132],
    azimuth: 0,
    elevation: 25,
    time: 2.75,
  },
  {
    name: 'side',
    reference: 'orchestra-side.png',
    crop: [86, 280, 150, 166],
    azimuth: 40,
    elevation: 22,
    time: 1.75,
  },
];

/** The size of the gallery page of each view, in CSS pixels. */
const CHOIR_PAGE = { width: 480, height: 600 } as const;

/** The close view of the gallery on the penguin: the zoom and the height of the target. */
const CLOSE = { zoom: 2.6, target: 0.55 } as const;

/**
 * Gives the path of the gallery page of a view: the penguin alone, close, at the camera of the
 * view.
 *
 * @param view The view.
 * @returns The path and the query, from the root of the site.
 */
export function choirPath(view: ChoirView): string {
  const query = new URLSearchParams({
    page: 'species',
    only: 'penguin',
    zoom: String(CLOSE.zoom),
    target: String(CLOSE.target),
    azimuth: String(view.azimuth),
    elevation: String(view.elevation),
  });
  return `/gallery.html?${query.toString()}`;
}

/**
 * Renders the gallery page of a view at the time of the view, with no panel and no labels.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param view The view.
 * @returns The PNG image.
 */
async function render(browser: Browser, base: string, view: ChoirView): Promise<Buffer> {
  const path = choirPath(view);
  const page = await openShot(browser, base + path.slice(1), {
    file: '',
    path,
    ...CHOIR_PAGE,
    ready: 'canvas[data-ready="species"]',
  });
  try {
    await page.addStyleTag({ content: '#controls, #labels { display: none; }' });
    await page.evaluate((time) => {
      const slider = document.querySelector('#time');
      if (slider instanceof HTMLInputElement) {
        slider.value = String(time);
        slider.dispatchEvent(new Event('input'));
      }
    }, view.time);
    // The idle motion and the jaw need a few frames at the new time.
    await page.waitForTimeout(300);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * Puts the crop of each reference image beside the render of its view, one row for each view.
 * Each crop grows to the height of the page.
 *
 * @param browser The browser.
 * @param rows The reference image, the crop, and the render of each view.
 * @returns The PNG image.
 */
async function sideBySide(
  browser: Browser,
  rows: readonly { reference: Buffer; crop: ChoirView['crop']; render: Buffer }[],
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const dataUrl = await page.evaluate(
      async ({ items, size }) => {
        const load = async (source: string): Promise<HTMLImageElement> => {
          const image = new Image();
          image.src = source;
          await image.decode();
          return image;
        };
        const loaded = await Promise.all(
          items.map(async (item) => ({
            reference: await load(item.reference),
            render: await load(item.render),
            crop: item.crop,
          })),
        );
        const widthOf = (crop: readonly number[]): number =>
          Math.round(((crop[2] ?? 1) * size.height) / (crop[3] ?? 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(...items.map((item) => widthOf(item.crop))) + size.width;
        canvas.height = size.height * items.length;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        context.fillStyle = '#201c19';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingQuality = 'high';
        for (const [i, item] of loaded.entries()) {
          const [left = 0, top = 0, width = 1, height = 1] = item.crop;
          const top0 = i * size.height;
          const cropWidth = widthOf(item.crop);
          context.drawImage(
            item.reference,
            left,
            top,
            width,
            height,
            0,
            top0,
            cropWidth,
            size.height,
          );
          context.drawImage(item.render, cropWidth, top0, size.width, size.height);
        }
        return canvas.toDataURL('image/png');
      },
      {
        items: rows.map((row) => ({
          reference: `data:image/png;base64,${row.reference.toString('base64')}`,
          render: `data:image/png;base64,${row.render.toString('base64')}`,
          crop: [...row.crop],
        })),
        size: CHOIR_PAGE,
      },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const [out] = process.argv.slice(2);
  if (!out) {
    console.error('Usage: pnpm choir-check <output directory>');
    process.exit(1);
  }

  const root = join(import.meta.dirname, '..');
  await mkdir(out, { recursive: true });
  const site = await startSite(root);
  try {
    const rows = [];
    for (const view of CHOIR_VIEWS) {
      const rendered = await render(site.browser, site.base, view);
      await writeFile(join(out, `penguin-${view.name}.png`), rendered);
      const reference = await readFile(join(root, 'docs', 'reference', view.reference));
      rows.push({ reference, crop: view.crop, render: rendered });
    }
    const compare = await sideBySide(site.browser, rows);
    await writeFile(join(out, 'choir-compare.png'), compare);
    await writeFile(join(out, 'choir-compare.webp'), await toWebp(site.browser, compare));
    console.log(join(out, 'choir-compare.png'));
  } finally {
    await site.close();
  }
}

if (import.meta.main) {
  await main();
}
