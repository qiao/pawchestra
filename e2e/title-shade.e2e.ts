import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { LINE_MARGIN, relativeLuminance } from '../src/ui/title-shade.ts';

/** The window sizes of the check: a desktop, a laptop, and a phone (design 2.8). */
const SIZES = [
  [1440, 900],
  [1280, 720],
  [390, 844],
] as const;

/**
 * The largest change of the gray value between two neighbor pixels along a line of the shade.
 * The soft fade of the shade changes by 1 to 7 per pixel. The hard edge of a box changes by
 * about 190 over a white background.
 */
const MOST_STEP = 12;

/** The smallest contrast ratio of WCAG 2.2 AA for text of normal size. */
const AA_TEXT = 4.5;

/** The selectors of the lines of the title, in the order of `Title.lines`. */
const LINES = ['.title .logo', '.title h2', '.title p'] as const;

/**
 * The style that shows the shades alone over a white page, as over a light floor. It hides each
 * part of the title in front of the shade: the text, the icons, and the outline of the pill of the
 * link to GitHub. The outline is a part of the link, and no text stands on it.
 */
const WHITE_PAGE = `
  body { background: #fff !important; }
  #stage, .drawer, .first-screen, .bar { visibility: hidden !important; }
  .title, .title * { color: transparent !important; text-shadow: none !important; }
  .title svg { visibility: hidden !important; }
  .title .github { border-color: transparent !important; }`;

/** One pixel: red, green, and blue from 0 to 255. */
type Pixel = readonly [number, number, number];

/** The color of a line with no color, which fails each contrast check. */
const BLACK: Pixel = [0, 0, 0];

/** One line of the title on the page. */
interface LineOnPage {
  /** The box of its text and the margin that the app reads, in CSS pixels. */
  readonly left: number;
  /** The top edge of the box. */
  readonly top: number;
  /** The right edge of the box. */
  readonly right: number;
  /** The bottom edge of the box. */
  readonly bottom: number;
  /**
   * The darkest color of its text: red, green, and blue. The logo line holds the gold name and
   * the gray text of the link to GitHub, and the darker gray needs the darker backdrop.
   */
  readonly color: Pixel;
}

/**
 * Reads the pixels of the top left corner of the page.
 *
 * @param page The page.
 * @param width The width of the corner, in CSS pixels.
 * @param height The height of the corner, in CSS pixels.
 * @returns The pixels, row by row.
 */
async function cornerPixels(page: Page, width: number, height: number): Promise<Pixel[][]> {
  const png = await page.screenshot({ clip: { x: 0, y: 0, width, height } });

  return page.evaluate(
    async ({ source, w, h }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('No 2D context.');
      }
      context.drawImage(image, 0, 0, w, h);
      const { data } = context.getImageData(0, 0, w, h);
      const rows: [number, number, number][][] = [];
      for (let y = 0; y < h; y++) {
        const row: [number, number, number][] = [];
        for (let x = 0; x < w; x++) {
          const i = 4 * (y * w + x);
          row.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
        }
        rows.push(row);
      }
      return rows;
    },
    { source: `data:image/png;base64,${png.toString('base64')}`, w: width, h: height },
  );
}

/**
 * Reads the box and the darkest text color of each line of the title, before a style hides the
 * text. The colors are the color of the line and of each element in it that holds text.
 *
 * @param page The page.
 * @returns The lines, in the order of `Title.lines`.
 */
async function linesOnPage(page: Page): Promise<LineOnPage[]> {
  const lines = await page.evaluate(
    ({ selectors, margin }) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`No ${selector}.`);
        }
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = range.getBoundingClientRect();
        const texts = [...element.querySelectorAll('*')].filter((child) =>
          [...child.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
        );
        const colors = [element, ...texts].map(
          (part) => getComputedStyle(part).color.match(/\d+/gu)?.map(Number) ?? [],
        );
        return {
          left: Math.floor(box.left - margin),
          top: Math.floor(box.top - margin),
          right: Math.ceil(box.right + margin),
          bottom: Math.ceil(box.bottom + margin),
          colors,
        };
      }),
    { selectors: [...LINES], margin: LINE_MARGIN },
  );

  return lines.map((line) => {
    const pixels = line.colors.map(([r = 0, g = 0, b = 0]): Pixel => [r, g, b]);
    const [color = BLACK] = pixels.toSorted(
      (a, b) => relativeLuminance(...a) - relativeLuminance(...b),
    );
    return {
      left: line.left,
      top: line.top,
      right: line.right,
      bottom: line.bottom,
      color,
    };
  });
}

/**
 * Gives the smallest contrast ratio between the text color of a line and the pixels of its box.
 *
 * @param pixels The pixels of the corner, with the text hidden.
 * @param line The line.
 * @returns The ratio of WCAG 2.2.
 */
function lineContrast(pixels: readonly (readonly Pixel[])[], line: LineOnPage): number {
  const text = relativeLuminance(...line.color);
  let lightest = 0;

  for (let y = Math.max(0, line.top); y < line.bottom; y++) {
    for (let x = Math.max(0, line.left); x < line.right; x++) {
      const pixel = pixels[y]?.[x];
      if (pixel) {
        lightest = Math.max(lightest, relativeLuminance(...pixel));
      }
    }
  }

  return (text + 0.05) / (lightest + 0.05);
}

/**
 * Gives the largest change between two neighbor values.
 *
 * @param values The values along a line.
 * @returns The largest step.
 */
function largestStep(values: readonly number[]): number {
  let most = 0;
  for (let i = 1; i < values.length; i++) {
    most = Math.max(most, Math.abs((values[i] ?? 0) - (values[i - 1] ?? 0)));
  }
  return most;
}

/**
 * Reads the opacity of the shade of each line of the title: its level from 0 to 1.
 *
 * @param page The page.
 * @returns The opacity of each shade, in the order of `Title.lines`.
 */
async function shadeOpacities(page: Page): Promise<number[]> {
  return page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector);
        return element ? Number(getComputedStyle(element, '::before').opacity) : Number.NaN;
      }),
    [...LINES],
  );
}

test.describe('the shade of each title line (design 2.8, audit 2026-10-06-ux-design-2, N21)', () => {
  for (const [width, height] of SIZES) {
    test(`is dark behind the text and has no straight edge at ${width} × ${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('./');
      await page.waitForSelector('#stage[data-demo]');
      const lines = await linesOnPage(page);
      // The probe of the backdrop reads the hidden canvas, so the test sets the full level.
      await page.addStyleTag({
        content: `${WHITE_PAGE}
          .title *::before { opacity: 1 !important; transition: none !important; }`,
      });
      await page.waitForTimeout(100);

      const right = Math.max(...lines.map((line) => line.right));
      const bottom = Math.max(...lines.map((line) => line.bottom));
      const pixels = await cornerPixels(
        page,
        Math.min(width, right + 120),
        Math.min(height, bottom + 80),
      );
      const grays = pixels.map((row) => row.map(([r, g, b]) => (r + g + b) / 3));

      for (const line of lines) {
        expect(lineContrast(pixels, line), JSON.stringify(line)).toBeGreaterThanOrEqual(AA_TEXT);
      }

      // Along the top row, the left column, and the rows and the columns through each line, the
      // shade fades with no hard step.
      const rows = [1, ...lines.map((line) => Math.round((line.top + line.bottom) / 2))];
      const columns = [
        1,
        ...lines.flatMap((line) => [line.left + 8, Math.round((line.left + line.right) / 2)]),
      ];
      for (const y of rows) {
        expect(largestStep(grays[y] ?? []), `row ${y}`).toBeLessThanOrEqual(MOST_STEP);
      }
      for (const x of columns) {
        const column = grays.map((row) => row[x] ?? 0);
        expect(largestStep(column), `column ${x}`).toBeLessThanOrEqual(MOST_STEP);
      }
    });
  }
});

test.describe('the level of the title shade (design 2.8)', () => {
  test('shows no shade behind the logo and the composer in the default view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    // The mockup shows the logo and the composer over the dark hall, with no shade.
    await expect
      .poll(async () => {
        const [logo, , composer] = await shadeOpacities(page);
        return [logo, composer];
      })
      .toEqual([0, 0]);
  });

  test('keeps 4.5:1 for each line over a white frame', async ({ page }) => {
    // With the attribute `data-white-frame` on the root, each read of the frame behind the title
    // gives white pixels, as white fur in a close shot.
    await page.addInitScript(() => {
      // oxlint-disable-next-line typescript/unbound-method -- the wrapper gives it its context.
      const read = WebGL2RenderingContext.prototype.getBufferSubData;
      WebGL2RenderingContext.prototype.getBufferSubData = function white(
        this: WebGL2RenderingContext,
        ...args: Parameters<WebGL2RenderingContext['getBufferSubData']>
      ): void {
        read.apply(this, args);
        if (document.documentElement.dataset['whiteFrame'] !== 'on') {
          return;
        }
        const [, , destination] = args;
        new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength).fill(
          255,
        );
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await expect.poll(async () => (await shadeOpacities(page))[0]).toBe(0);
    const lines = await linesOnPage(page);

    await page.addStyleTag({ content: WHITE_PAGE });
    await page.evaluate(() => {
      document.documentElement.dataset['whiteFrame'] = 'on';
    });
    // Each shade rises to the level that its text needs over white (ui/title-shade.ts).
    await expect.poll(async () => Math.min(...(await shadeOpacities(page)))).toBeGreaterThan(0.75);
    await page.waitForTimeout(300);

    const pixels = await cornerPixels(page, 600, 200);
    for (const line of lines) {
      expect(lineContrast(pixels, line), JSON.stringify(line)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
