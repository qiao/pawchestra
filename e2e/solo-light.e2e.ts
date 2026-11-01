import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { SAMPLES_READY } from '../src/app/dev-hook.ts';
import { SCENE_ONLY, stillFrame } from './stage-frame.ts';
import type { FrameOnPage } from './stage-frame.ts';

/** A box of the scene, in parts of the size of the frame, from the middle of the frame. */
interface FrameBox {
  /** The middle of the box, right of the middle of the frame. */
  readonly x: number;
  /** The middle of the box, below the middle of the frame. */
  readonly y: number;
  /** The width of the box. */
  readonly width: number;
  /** The height of the box. */
  readonly height: number;
}

/**
 * The size of the window of the test. The drawer opens at start at this size, at the tab "Music"
 * (design 2.8).
 */
const WINDOW = { width: 1440, height: 900 } as const;

/** The box of the conductor in the default view of the Boulanger demo. */
const CONDUCTOR: FrameBox = { x: 0, y: 0.43, width: 0.12, height: 0.23 };

/** The box of the three cellos at the front right in the default view of Boulanger. */
const CELLOS: FrameBox = { x: 0.33, y: 0.4, width: 0.23, height: 0.34 };

/**
 * Measures the mean value (0.2126 R + 0.7152 G + 0.0722 B) of a box of the scene, with the parts
 * of the page over the canvas hidden.
 *
 * @param page The page.
 * @param frame The frame of the camera.
 * @param box The box.
 * @returns The mean value, from 0 to 255.
 */
async function meanValue(page: Page, frame: FrameOnPage, box: FrameBox): Promise<number> {
  const frameWidth = frame.scale * WINDOW.width;
  const frameHeight = frame.scale * WINDOW.height;
  const width = Math.round(box.width * frameWidth);
  const height = Math.round(box.height * frameHeight);
  const png = await page.screenshot({
    clip: {
      x: frame.x + box.x * frameWidth - width / 2,
      y: frame.y + box.y * frameHeight - height / 2,
      width,
      height,
    },
  });
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

      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      }
      return sum / (w * h);
    },
    { source: `data:image/png;base64,${png.toString('base64')}`, w: width, h: height },
  );
}

/**
 * Measures the boxes of the conductor and the cellos with the parts of the page over the canvas
 * hidden, then shows the parts again.
 *
 * @param page The page.
 * @param frame The frame of the camera.
 * @returns The mean value of the conductor box and of the cello box.
 */
async function measureStage(page: Page, frame: FrameOnPage): Promise<[number, number]> {
  const style = await page.addStyleTag({ content: SCENE_ONLY });
  await page.waitForTimeout(300);
  const values: [number, number] = [
    await meanValue(page, frame, CONDUCTOR),
    await meanValue(page, frame, CELLOS),
  ];
  await style.evaluate((node) => {
    node.parentNode?.removeChild(node);
  });
  return values;
}

test.describe('the spotlight of a solo (design 2.4, 4.5)', () => {
  // With reduced motion, the page starts in Free mode at the default view, and the lights move to
  // a new aim at once.
  test.use({ reducedMotion: 'reduce', viewport: WINDOW });

  test('moves to the soloed cellos, and back when the solo ends', async ({ page }) => {
    await page.goto('./#demo=boulanger-matin');
    await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
    // The solo buttons are in the tab "Seats". The drawer stays open, so the frame does not move.
    await page.getByRole('tab', { name: 'Seats' }).click();
    const frame = await stillFrame(page);
    const solo = page.locator('button[aria-label="Solo Cellos"]');
    const [conductor, cellos] = await measureStage(page, frame);

    await solo.click();
    await expect(solo).toHaveAttribute('aria-pressed', 'true');
    const [conductorSolo, cellosSolo] = await measureStage(page, frame);

    await solo.click();
    await expect(solo).toHaveAttribute('aria-pressed', 'false');
    const [conductorBack, cellosBack] = await measureStage(page, frame);

    // In Chromium on the development Mac, the conductor box fell from 106 to 55, and the cello
    // box rose from 106 to 116.
    expect(conductorSolo).toBeLessThan(0.75 * conductor);
    expect(cellosSolo).toBeGreaterThan(1.04 * cellos);
    expect(Math.abs(conductorBack - conductor)).toBeLessThan(0.03 * conductor);
    expect(Math.abs(cellosBack - cellos)).toBeLessThan(0.03 * cellos);
  });
});
