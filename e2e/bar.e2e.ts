import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

import { SAMPLES_READY } from '../src/app/dev-hook.ts';
import { note, writeSmf } from '../src/midi/test-smf.ts';

/** The counts of two kinds of pixels in a screenshot. */
interface PixelCounts {
  /** Pixels with red, green, and blue above 200 and no strong hue: white or light gray. */
  readonly light: number;
  /** Pixels near `--accent` (#e7b45a) or `--accent-strong` (#f0c676). */
  readonly accent: number;
}

/**
 * Takes a screenshot of a control, and counts its light pixels and its accent pixels. The page
 * decodes the PNG image in a canvas.
 *
 * @param control The control.
 * @returns The counts.
 */
async function pixelCounts(control: Locator): Promise<PixelCounts> {
  const png = await control.screenshot({ animations: 'disabled' });
  return control.page().evaluate(
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
      let light = 0;
      let accent = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r = 0, g = 0, b = 0] = [data[i], data[i + 1], data[i + 2]];
        if (r > 200 && g > 200 && b > 200 && r - b < 60) {
          light++;
        }
        if (r > 200 && g > 160 && g < 215 && b > 70 && b < 140 && r - b > 100) {
          accent++;
        }
      }
      return { light, accent };
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

test.describe('the sliders of the bar (audit 2026-10-06-ux-design-2, N13)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('have a dark track and an accent thumb in each browser', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector(SAMPLES_READY);
    // The pointer stays away from the bar, so that no hover state shows.
    await page.mouse.move(700, 100);
    for (const selector of ['.bar .seek', '.bar .volume']) {
      const counts = await pixelCounts(page.locator(selector));
      expect(counts.light, `${selector}: light pixels`).toBe(0);
      expect(counts.accent, `${selector}: accent pixels`).toBeGreaterThan(50);
    }
  });

  test('the speed menu has no native arrows', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await expect(page.locator('.bar .speed')).toHaveCSS('appearance', 'none');
  });
});

test.describe('the bar before the first piece (audit 2026-10-06-ux-design-2, N15)', () => {
  test('shows no times and no seek bar until the file of the piece arrives', async ({ page }) => {
    let release = (): void => undefined;
    const held = new Promise<void>((done) => {
      release = done;
    });
    await page.route('**/demos/**', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('./');
    await expect(page.locator('.bar')).toBeVisible();
    await expect(page.locator('.bar .seek')).toBeHidden();
    await expect(page.locator('.bar .time')).toHaveCount(2);
    for (const time of await page.locator('.bar .time').all()) {
      await expect(time).toBeHidden();
    }
    release();
    await page.waitForSelector('#stage[data-demo]');
    await expect(page.locator('.bar .seek')).toBeVisible();
    await expect(page.locator('.bar .time').first()).toBeVisible();
  });
});

test.describe('the play button at the song end (audit 2026-10-05-ux-design, AM2)', () => {
  test('shows "Play again", and a click plays the piece from the start', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').click();
    // A file of one short note plays when its samples are ready, and ends after the count-in.
    const file = Buffer.from(writeSmf({ tracks: [note(0, 0, 60)] }));
    await page
      .locator('.drawer input[type="file"]')
      .setInputFiles({ name: 'one-note.mid', mimeType: 'audio/midi', buffer: file });
    const play = page.locator('.bar button').first();
    await expect(play).toHaveAttribute('aria-label', 'Play again', { timeout: 60_000 });
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause');
  });
});

test.describe('the tooltips of the speed and the volume (audit 2026-10-06-ux-design-2, N17)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a hover names the control', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    // The tooltip of the volume names its keys too, and the speed has no key (design 2.8).
    for (const [selector, text] of [
      ['.bar .speed', 'Speed'],
      ['.bar .volume', 'Volume (↑ ↓)'],
    ] as const) {
      await page.hover(selector);
      await expect(page.locator('.tooltip')).toHaveText(text);
      await page.mouse.move(700, 100);
      await expect(page.locator('.tooltip')).toBeHidden();
    }
  });
});
