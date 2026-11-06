import type { Page } from '@playwright/test';

/** The limits of the first paint of the page (design 2.8, `index.html`). */
const FIRST_PAINT = {
  /**
   * The largest share of white pixels: pixels with each channel above 200. The title "Pawchestra"
   * in `--text` has a few. A page with no styles is white in full.
   */
  whiteShare: 0.02,
  /** The time that the test lets the page paint while it holds the scripts, in milliseconds. */
  paintMs: 300,
} as const;

/** The values of the first paint of the page, before a script runs. */
export interface FirstPaint {
  /** The share of white pixels in the screenshot, from 0 to 1. */
  readonly whiteShare: number;
  /**
   * The computed `fill` of the track circle of the load ring of `index.html`. With no styles, it
   * is black, and the ring shows as a black disc.
   */
  readonly ringFill: string;
}

/**
 * Checks the first paint of the page (design 2.8). Before a script runs, the page must be dark,
 * and the load ring must have no fill.
 *
 * @param paint The values of the first paint.
 * @returns One text for each failed check. An empty list is a pass.
 */
export function firstPaintFailures(paint: FirstPaint): string[] {
  const failures: string[] = [];
  if (!(paint.whiteShare <= FIRST_PAINT.whiteShare)) {
    failures.push(`The first paint has ${(paint.whiteShare * 100).toFixed(1)}% white pixels.`);
  }
  if (paint.ringFill !== 'none') {
    failures.push(`The load ring of the first paint has the fill ${paint.ringFill}.`);
  }
  return failures;
}

/**
 * Reads the first paint of a page: it holds each script request, lets the page paint the static
 * HTML of `index.html` with its style sheets, and then lets the scripts run. Thus the page shows
 * what a slow CPU or a slow network shows before the script runs.
 *
 * @param page A new page.
 * @param url The URL of the app.
 * @returns The values of the first paint.
 */
export async function readFirstPaint(page: Page, url: string): Promise<FirstPaint> {
  let release = (): void => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') {
      await held;
    }
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForSelector('.first-screen.boot .ring .track', { state: 'attached' });
    await page.waitForTimeout(FIRST_PAINT.paintMs);
    const png = await page.screenshot({ type: 'png' });
    const ringFill = await page.$eval(
      '.first-screen.boot .ring .track',
      (circle) => getComputedStyle(circle).fill,
    );
    const whiteShare = await page.evaluate(
      async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('No 2D context.');
        }
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let white = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (Math.min(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) > 200) {
            white++;
          }
        }
        return white / (data.length / 4);
      },
      `data:image/png;base64,${png.toString('base64')}`,
    );
    return { whiteShare, ringFill };
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}
