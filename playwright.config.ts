import { defineConfig } from '@playwright/test';

import { chromiumArgs } from './tools/chromium-args.ts';
import { e2ePort } from './tools/e2e-port.ts';

/**
 * The port of `vite preview` for the Playwright tests: `ZOOPHONY_E2E_PORT`, or 4182. Ports 4179 to
 * 4181, and 4300 and above for `pnpm close-views`, are for the tools.
 */
const PORT = e2ePort(process.env['ZOOPHONY_E2E_PORT']);

/**
 * The URL of the built site. With `ZOOPHONY_BASE`, the build and `vite preview` use that base path
 * (design 9.2).
 */
const SITE = `http://localhost:${PORT}${process.env['ZOOPHONY_BASE'] ?? '/'}`;

/**
 * The Playwright tests run on the built site in `dist/`, so that CI tests what it deploys (design
 * 9.2, 9.3). Run `pnpm build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  // The load of the samples can take 20 s on a slow runner, and the play takes 4 s.
  timeout: 120_000,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: SITE,
    viewport: { width: 960, height: 600 },
    // A click on a hidden control fails after 15 s, not after the timeout of the whole test.
    actionTimeout: 15_000,
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: SITE,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { args: chromiumArgs(process.platform) } },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        // These preferences turn off the autoplay policy of Firefox.
        launchOptions: {
          firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 },
        },
      },
    },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
