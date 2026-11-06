import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { DEFAULT_DEMO, DEMOS, DEMO_IDS } from '../src/app/demos.ts';
import type { DemoId } from '../src/app/demos.ts';
import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { ABOUT_TEXT, NO_WEBGL2_TEXT } from '../src/app/messages.ts';
import { SETTING_HELP } from '../src/app/settings.ts';
import { note, writeSmf } from '../src/midi/test-smf.ts';
import { INTRO_TEXT, LOADING_TEXT, SELECT_PIECE_TEXT, WAIT_TEXT } from '../src/app/play-control.ts';

/**
 * Gets the last demo of the demo list. A test that clicks the last row of the list waits for it.
 *
 * @returns The hash id of the last demo.
 * @throws Error when the demo list is empty.
 */
function lastDemo(): DemoId {
  const id = DEMO_IDS.at(-1);
  if (!id) {
    throw new Error('The demo list is empty.');
  }
  return id;
}

/**
 * Holds each request of a preset file, so that the samples stay in the load. The preset index
 * goes through, so that the app knows the list of the presets.
 *
 * @param page The page.
 */
async function holdPresets(page: Page): Promise<void> {
  await page.context().route('**/sf/**', async (route) => {
    if (route.request().url().endsWith('/index.json')) {
      await route.continue();
    }
    // The other requests never get an answer. The page closes at the end of the test.
  });
}

test.describe('the first screen during the load (audit 2026-10-05-ux-design, LD1)', () => {
  test('a click waits for the samples, and a second click cancels the wait', async ({ page }) => {
    await holdPresets(page);
    await page.goto('./');
    const play = page.locator(FIRST_PLAY);
    await expect(play).toHaveAttribute('aria-label', 'Play');
    await page.waitForSelector('#stage[data-demo]');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause');
    await expect(page.locator('.first-screen .status')).toContainText(WAIT_TEXT);
    await expect(page.locator('.bar button').first()).toHaveAttribute('aria-label', 'Pause');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('.first-screen .status')).not.toContainText(WAIT_TEXT);
    await expect(page.locator('.bar button').first()).toHaveAttribute('aria-label', 'Play');
  });
});

test.describe('the load state on a slow network (audit 2026-10-05-ux-design, LD2)', () => {
  test('shows the name and a load text before the script runs', async ({ page }) => {
    let release = (): void => undefined;
    const held = new Promise<void>((done) => {
      release = done;
    });
    await page.route('**/*.js', async (route) => {
      await held;
      await route.continue();
    });
    // A module script runs before the event DOMContentLoaded, so the test waits only for the HTML.
    await page.goto('./', { waitUntil: 'commit' });
    // The logo stands where the logo of the app stands, so the first paint does not jump. The
    // wordmark is an SVG path, and the name is the accessible name of the heading (design 2.8).
    await expect(page.getByRole('heading', { level: 1, name: 'Pawchestra' })).toBeVisible();
    await expect(page.locator('.first-screen .status')).toHaveText(LOADING_TEXT);
    release();
    await expect(page.locator('.boot')).toHaveCount(0);
  });

  test('names the demo and shows a load text while its file loads', async ({ page }) => {
    await page.route('**/demos/**', () => {
      // The demo file never arrives. The page closes at the end of the test.
    });
    await page.goto('./');
    await expect(page.locator('.title h2')).toHaveText(DEMOS[DEFAULT_DEMO].title);
    await expect(page.locator('.first-screen .status')).toHaveText(LOADING_TEXT);
  });

  test('counts the instruments as soon as their list is known', async ({ page }) => {
    await holdPresets(page);
    await page.goto('./');
    await expect(page.locator('.first-screen .status')).toHaveText(
      /^Loading instruments: 0 of \d+$/u,
    );
  });
});

test.describe('the intro of the first screen (audit 2026-10-05-ux-design, FI2)', () => {
  test('names the app, and its button opens the demo list', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector(SAMPLES_READY);
    await expect(page.locator('.first-screen .intro p')).toHaveText(INTRO_TEXT);
    await page.getByRole('button', { name: SELECT_PIECE_TEXT }).click();
    await expect(page.locator('.drawer')).toBeVisible();
    await expect(page.locator('.demo[aria-current="true"]')).toBeFocused();
  });

  test('hides after the first play', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector(SAMPLES_READY);
    await page.click(FIRST_PLAY);
    await expect(page.locator('.first-screen')).toBeHidden();
    // The new presets of the Ode to Joy (the choir) stay in the load, so the first screen shows.
    await holdPresets(page);
    await page.mouse.move(10, 10);
    await page.locator('.bar button[aria-expanded]').click();
    await page.locator('.demo', { hasText: 'Ode to Joy' }).click();
    await expect(page.locator('.first-screen')).toBeVisible();
    await expect(page.locator('.first-screen .intro')).toBeHidden();
  });
});

test.describe('the place of the first screen (audit 2026-10-05-ux-design, FI3)', () => {
  for (const [width, height, share] of [
    [1440, 900, 0.72],
    [390, 844, 0.7],
  ] as const) {
    test(`puts the play button below the stage at ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('./');
      await page.waitForSelector(SAMPLES_READY);
      const play = await page.locator(FIRST_PLAY).boundingBox();
      const intro = await page.locator('.first-screen .intro').boundingBox();
      const bar = await page.locator('.bar').boundingBox();
      if (!play || !intro || !bar) {
        throw new Error('The first screen or the bar has no box.');
      }
      expect(play.y + play.height / 2).toBeCloseTo(height * share, 0);
      expect(intro.y + intro.height).toBeLessThan(bar.y);
    });
  }
});

test.describe('the drawer after a selection (audit 2026-10-05-ux-design, PH1)', () => {
  /**
   * Opens the drawer with the drawer button of the bar, and selects the last demo of the list.
   *
   * @param page The page.
   */
  async function selectDemo(page: Page): Promise<void> {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').click();
    await expect(page.locator('.drawer')).toBeVisible();
    await page.locator('.demo').last().click();
    await page.waitForSelector(`#stage[data-demo="${lastDemo()}"]`);
  }

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('a demo selection closes the sheet', async ({ page }) => {
      await selectDemo(page);
      await expect(page.locator('.drawer')).toBeHidden();
    });

    test('an accepted file closes the sheet, and a refused file keeps it', async ({ page }) => {
      await page.goto('./');
      await page.waitForSelector('#stage[data-demo]');
      await page.locator('.bar button[aria-expanded]').click();
      const input = page.locator('.drawer input[type="file"]');
      await input.setInputFiles({
        name: 'not-midi.mid',
        mimeType: 'audio/midi',
        buffer: Buffer.from('hello'),
      });
      await expect(page.locator('.message')).toContainText('This file is not a valid MIDI file.');
      await expect(page.locator('.drawer')).toBeVisible();
      const file = Buffer.from(writeSmf({ tracks: [note(0, 0, 60)] }));
      await input.setInputFiles({ name: 'one-note.mid', mimeType: 'audio/midi', buffer: file });
      await page.waitForSelector('#stage[data-demo="file"]');
      await expect(page.locator('.drawer')).toBeHidden();
    });
  });

  test('a demo selection keeps the drawer of a desktop open', async ({ page }) => {
    await selectDemo(page);
    await expect(page.locator('.drawer')).toBeVisible();
  });
});

test.describe('the tooltips of the bar (audit 2026-10-05-ux-design, CT1)', () => {
  test('a hover shows the name and the key, and Escape hides it', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.hover('.bar .camera');
    await expect(page.locator('.tooltip')).toHaveText('Cinematic camera (C)');
    await expect(page.locator('.bar .camera')).toHaveAttribute('aria-keyshortcuts', 'C');
    await page.keyboard.press('Escape');
    await expect(page.locator('.tooltip')).toBeHidden();
  });

  test('a keyboard focus shows the tooltip', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    // A focus with no pointer before it matches :focus-visible, as a focus of the Tab key does.
    // WebKit on macOS moves the Tab key past buttons by default, so the test sets the focus.
    await page.locator('.bar button[aria-label="Mute"]').focus();
    await expect(page.locator('.tooltip')).toHaveText('Mute (M)');
  });
});

test.describe('the motion and the close button of the drawer (audit 2026-10-05-ux-design, DR3)', () => {
  /**
   * Gives the CSS transitions of the drawer that run.
   *
   * @param page The page.
   * @returns The names of the properties.
   */
  async function drawerTransitions(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      (document.querySelector('.drawer')?.getAnimations() ?? []).flatMap((animation) =>
        animation instanceof CSSTransition ? [animation.transitionProperty] : [],
      ),
    );
  }

  test('the drawer fades in and out, and its close button closes it', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').click();
    expect(await drawerTransitions(page)).toContain('opacity');
    // The open ends before the close starts.
    await page.waitForTimeout(400);
    await page.locator('.drawer .close-drawer').click();
    expect(await drawerTransitions(page)).toContain('opacity');
    await expect(page.locator('.drawer')).toBeHidden();
    await expect(page.locator('.bar button[aria-expanded]')).toBeFocused();
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the drawer opens with no transition', async ({ page }) => {
      await page.goto('./');
      await page.waitForSelector('#stage[data-demo]');
      await page.locator('.bar button[aria-expanded]').click();
      expect(await drawerTransitions(page)).toEqual([]);
    });
  });
});

test.describe('the drop hint on a touch screen (audit 2026-10-05-ux-design, PH2)', () => {
  // Firefox has no mobile emulation.
  test.skip(({ browserName }) => browserName === 'firefox', 'No mobile emulation in Firefox.');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a phone says only "From this device"', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').tap();
    await expect(
      page.getByRole('button', { name: 'Open a MIDI file' }),
    ).toHaveAccessibleDescription('From this device');
  });
});

test('a desktop shows the drop hint (audit 2026-10-05-ux-design, PH2)', async ({ page }) => {
  // A wide window opens the drawer at start at the tab "Music" (design 2.8). The default window
  // of the tests (960 × 600) is not wide, so its drawer stays closed.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForSelector('#stage[data-demo]');
  const button = page.getByRole('button', { name: 'Open a MIDI file' });
  // The second line of the button says where the file comes from, and it describes the button.
  await expect(button).toHaveAccessibleDescription('From this device, or drop it on the page');
  await expect(page.getByText('From this device, or drop it on the page')).toBeVisible();
});

test.describe('the labels of the "Playback" group (audit 2026-10-05-ux-design, PH3)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('names each control of the group', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').click();
    // The group is in the tab "Settings", and the drawer opens at the tab "Music" (design 2.3).
    await page.getByRole('tab', { name: 'Settings' }).click();
    const group = page.getByRole('group', { name: 'Playback' });
    await group.scrollIntoViewIfNeeded();
    for (const label of ['Speed', 'Volume', 'Reset view']) {
      await expect(group.getByText(label, { exact: true })).toBeVisible();
    }
    // The full screen button shows only where the browser has a full screen for the page.
    if (await page.evaluate(() => document.fullscreenEnabled)) {
      await expect(group.getByText('Full screen', { exact: true })).toBeVisible();
    }
  });
});

test.describe('the stage beside the open drawer (audit 2026-10-05-ux-design, PH4)', () => {
  /**
   * Opens the drawer and gives the frame of the camera after its move. The canvas stays over the
   * full window.
   *
   * @param page The page.
   * @returns The middle of the frame on the canvas, in CSS pixels, and its scale.
   */
  async function frameWithDrawer(page: Page): Promise<number[]> {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await page.locator('.bar button[aria-expanded]').click();
    await page.waitForTimeout(400);
    const viewport = page.viewportSize();
    expect(await page.locator('#stage').boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
    const frame = await page.getAttribute('#stage', 'data-frame');
    return (frame ?? '').split(' ').map(Number);
  }

  test('the stage moves left beside the drawer of a desktop', async ({ page }) => {
    const [x = 0] = await frameWithDrawer(page);
    // The default viewport of the tests is 960 × 600. The frame of the first screen shrinks
    // around the middle of the stage, so its middle moves by a pixel at most.
    expect(Math.abs(x - (480 - 176))).toBeLessThanOrEqual(1);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the stage moves up above the sheet, and the first screen stays', async ({ page }) => {
      const [x, y] = await frameWithDrawer(page);
      expect(x).toBe(195);
      expect(y).toBeCloseTo(422 - 34 - (0.3 * 844 - 20), 0);
      const play = await page.locator(FIRST_PLAY).boundingBox();
      expect((play?.x ?? 0) + (play?.width ?? 0) / 2).toBeCloseTo(390 / 2, 0);
    });
  });
});

test('the title of the page names the demo (audit 2026-10-05-ux-design, CP1)', async ({ page }) => {
  await page.goto('./#demo=beethoven-9');
  await page.waitForSelector('#stage[data-demo="beethoven-9"]');
  const demo = DEMOS['beethoven-9'];
  await expect(page).toHaveTitle(`${demo.title}, ${demo.composer} · Pawchestra`);
});

test('a demo switch fades the stage out and in (audit 2026-10-05-ux-design, PF1)', async ({
  page,
}) => {
  await page.goto('./');
  await page.waitForSelector('#stage[data-demo]');
  // The page records each change of the cover of the stage: 1 for a cover, 0 for none.
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset['covers'] = '';
    new MutationObserver(() => {
      const building = document.body.classList.contains('is-building');
      root.dataset['covers'] = `${root.dataset['covers'] ?? ''}${building ? '1' : '0'}`;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('.bar button[aria-expanded]').click();
  await page.locator('.demo').last().click();
  await page.waitForSelector(`#stage[data-demo="${lastDemo()}"]`);
  await expect(page.locator('body')).not.toHaveClass(/is-building/u);
  expect(await page.getAttribute('html', 'data-covers')).toBe('10');
});

test.describe('the page with no WebGL2 (audit 2026-10-05-ux-design, LE5)', () => {
  test('names the app and tells what it does above the message', async ({ page }) => {
    // The page gets no WebGL2 context, as in a browser with no WebGL2.
    await page.addInitScript({
      content: `
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
        };`,
    });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Pawchestra' })).toBeVisible();
    await expect(page.getByText(ABOUT_TEXT)).toBeVisible();
    await expect(page.getByText(NO_WEBGL2_TEXT)).toBeVisible();
  });
});

test.describe('the seek bar of a phone (audit 2026-10-05-ux-design, PH5)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('gets the width of the duration, which the phone does not show', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await expect(page.locator('.bar .time.length')).toBeHidden();
    const seek = await page.locator('.bar .seek').boundingBox();
    expect(seek?.width ?? 0).toBeGreaterThanOrEqual(110);
  });
});

test('the settings explain their values (audit 2026-10-05-ux-design, DR4)', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('#stage[data-demo]');
  await page.locator('.bar button[aria-expanded]').click();
  // The settings are in the tab "Settings", and the drawer opens at the tab "Music" (design 2.3).
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'Section size' })).toContainText('Auto (Full)');
  await expect(page.getByRole('group', { name: 'Quality' })).toContainText(
    /Auto \((High|Medium|Low)\)/u,
  );
  for (const help of Object.values(SETTING_HELP)) {
    await expect(page.getByText(help)).toBeVisible();
  }
});

test.describe('the small interaction details (audit 2026-10-05-ux-design, CT3)', () => {
  test('the pointer over the stage hides with the bar during play', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector(SAMPLES_READY);
    await page.click(FIRST_PLAY);
    await page.mouse.move(400, 200);
    await expect(page.locator('#stage')).toHaveCSS('cursor', 'auto');
    // The bar hides 3 s after the last pointer motion.
    await expect(page.locator('.bar')).toHaveClass(/is-hidden/u, { timeout: 6000 });
    await expect(page.locator('#stage')).toHaveCSS('cursor', 'none');
  });

  test('a button changes its background in 120 ms', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await expect(page.locator('.bar .camera')).toHaveCSS('transition-duration', '0.12s, 0.12s');
  });
});
