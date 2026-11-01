import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { SAMPLES_READY } from '../src/app/dev-hook.ts';

/**
 * Shows the link "Credits" at the end of the tab "Settings". A narrow window opens the drawer
 * first, and a wide window opens it at the tab "Music" (design 2.8).
 *
 * @param page The page, with the first piece on the stage.
 * @returns The link.
 */
async function showCreditsLink(page: Page): Promise<Locator> {
  const link = page.getByRole('button', { name: 'Credits', exact: true });
  if ((await page.locator('.drawer[hidden]').count()) > 0) {
    await page.locator('.bar button[aria-expanded]').click();
  }
  await page.getByRole('tab', { name: 'Settings' }).click();
  await link.scrollIntoViewIfNeeded();
  return link;
}

/**
 * Opens the credits dialog with a click on the link "Credits".
 *
 * @param page The page, with the first piece on the stage.
 */
async function openCredits(page: Page): Promise<void> {
  const link = await showCreditsLink(page);
  await link.click();
}

test.describe('the credits dialog (design 2.8)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('opens from the link, holds the focus, and stops the keys of the page', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector(SAMPLES_READY, { timeout: 60_000 });
    const link = await showCreditsLink(page);
    await expect(link).toHaveAttribute('aria-haspopup', 'dialog');
    // The drawer holds no credits section, only the link.
    await expect(page.locator('.drawer h2', { hasText: 'Credits' })).toHaveCount(0);

    await link.click();
    const dialog = page.getByRole('dialog', { name: 'Credits' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Third-party licenses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close the credits' })).toBeFocused();

    // A click on the text of the dialog puts the focus on no control. Space and M then must not
    // play or mute the music behind the dialog.
    await dialog.getByText('Other pieces').click();
    await page.keyboard.press('Space');
    await page.keyboard.press('m');
    await page.waitForTimeout(300);
    await expect(page.locator('.bar button[aria-label="Play"]')).toHaveCount(1);
    await expect(page.locator('.bar button[aria-label="Mute"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(dialog).toBeVisible();

    // Escape closes only the dialog. The drawer stays open, and the link gets the focus.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.drawer')).toBeVisible();
    await expect(link).toBeFocused();
  });

  test('closes with a click on the backdrop and with its close button', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    const link = page.getByRole('button', { name: 'Credits', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Credits' });

    await openCredits(page);
    await expect(dialog).toBeVisible();
    // A click in the dialog does not close it.
    await dialog.getByText('Other pieces').click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(40, 450);
    await expect(dialog).toBeHidden();
    await expect(link).toBeFocused();

    await openCredits(page);
    await page.getByRole('button', { name: 'Close the credits' }).click();
    await expect(dialog).toBeHidden();
    await expect(link).toBeFocused();
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('opens with no animation', async ({ page }) => {
      await page.goto('./');
      await page.waitForSelector('#stage[data-demo]');
      await openCredits(page);
      const animations = await page.evaluate(
        () => document.querySelector('dialog')?.getAnimations({ subtree: true }).length ?? -1,
      );
      expect(animations).toBe(0);
    });
  });
});

test.describe('the credits dialog on a phone (design 2.8)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fills most of the screen', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    await openCredits(page);
    const box = await page.getByRole('dialog', { name: 'Credits' }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(370);
    expect(box?.height).toBeGreaterThanOrEqual(0.7 * 844);
  });
});
