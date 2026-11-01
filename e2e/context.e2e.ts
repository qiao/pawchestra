import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { SAMPLES_READY } from '../src/app/dev-hook.ts';

/** A box of the stage in the first screen at 1440 × 900, in CSS pixels. */
const STAGE_BOX = { x: 200, y: 300, width: 650, height: 220 } as const;

/**
 * Gives the mean light of a box of the page: the mean of the red, green, and blue channels.
 *
 * @param page The page.
 * @returns The mean, from 0 to 255.
 */
async function meanLight(page: Page): Promise<number> {
  const png = await page.screenshot({ clip: STAGE_BOX });
  return page.evaluate(
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
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
      }
      return sum / (3 * (data.length / 4));
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

test('keeps the reflections after a loss of the WebGL context (review of step 8, U1)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
  // The UI does not cover the stage. The opacity keeps the first screen for the app, so the
  // frame does not change.
  await page.addStyleTag({
    content: '.first-screen, .title, .bar, .drawer { opacity: 0 !important; }',
  });
  await page.waitForTimeout(500);
  const before = await meanLight(page);
  await page.evaluate(async () => {
    const canvas = document.querySelector('#stage');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('No stage canvas.');
    }
    const lose = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!lose) {
      throw new Error('No WEBGL_lose_context.');
    }
    const restored = new Promise((done) => {
      canvas.addEventListener('webglcontextrestored', done, { once: true });
    });
    lose.loseContext();
    await new Promise((done) => setTimeout(done, 300));
    lose.restoreContext();
    await restored;
  });
  // The environment of the reflections lights the stage and the players. Without it, the box
  // was 2.6% darker. The grain and the dust change it by about 0.1%. The app makes the maps again
  // in slices after the restore (design 7.2), so the test waits until the light comes back.
  await expect
    .poll(async () => meanLight(page), { timeout: 30_000 })
    .toBeGreaterThan(0.99 * before);
});
