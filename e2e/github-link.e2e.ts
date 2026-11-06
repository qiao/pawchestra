import { expect, test } from '@playwright/test';

import { REPOSITORY_LABEL, REPOSITORY_URL } from '../src/app/page-title.ts';

test.describe('the link to GitHub after the logo (design 2.8)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('has its name and its URL, and opens the repository in a new tab', async ({
    page,
    context,
  }) => {
    // The test answers each request to GitHub, so that it needs no network.
    const github: string[] = [];
    await context.route(/^https:\/\/([\w-]+\.)?github(usercontent)?\.com\//u, async (route) => {
      github.push(route.request().url());
      await route.fulfill({ contentType: 'text/plain', body: 'Pawchestra' });
    });
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');

    // The page loads nothing from GitHub.
    expect(github).toEqual([]);

    const link = page.getByRole('link', { name: REPOSITORY_LABEL });
    await expect(link).toHaveAttribute('href', REPOSITORY_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // A hover shows the tooltip with the same text.
    await link.hover();
    await expect(page.locator('.tooltip')).toHaveText(REPOSITORY_LABEL);

    const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe(REPOSITORY_URL);
    expect(github).toEqual([REPOSITORY_URL]);
  });
});

test.describe('the link to GitHub on a phone (design 2.8)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('takes a tap in a square of 44 px around the mark', async ({ page }) => {
    await page.goto('./');
    await page.waitForSelector('#stage[data-demo]');
    const misses = await page.evaluate(() => {
      const link = document.querySelector('.title .github');
      if (!link) {
        return ['no link'];
      }

      const box = link.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const points = [-21, 0, 21].flatMap((dx) => [-21, 0, 21].map((dy) => [x + dx, y + dy]));
      return points
        .filter(([px = 0, py = 0]) => !link.contains(document.elementFromPoint(px, py)))
        .map(([px = 0, py = 0]) => `${px.toFixed(0)}, ${py.toFixed(0)}`);
    });
    expect(misses).toEqual([]);
  });
});
