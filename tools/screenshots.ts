import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { preview } from 'vite';

import { DEFAULT_DEMO, DEMO_IDS } from '../src/app/demos.ts';
import { VIEW_SHEETS } from '../src/gallery/sheets.ts';
import type { DemoId } from '../src/app/demos.ts';
import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { buildScore } from '../src/score/score.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import type { ShotKind, ShotPlan } from '../src/shots/types.ts';
import { startCinematic } from './cinematic-mode.ts';
import { patchedDemos } from './patch-demos.ts';

/** One screenshot of the review of a step (design 9.8). */
export interface Shot {
  /** The name of the WebP file. */
  readonly file: string;
  /** The path and the URL hash of the page, from the root of the site. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** The CSS selector that the page matches when its first frame shows the full scene. */
  readonly ready: string;
}

/** The largest size of one WebP file, in bytes. */
export const MAX_WEBP_BYTES = 300_000;

/**
 * The contact sheet of the species: the scale of the pixels of the gallery view at 1440 × 900,
 * and the size of one cell in CSS pixels.
 */
const SHEET = { scale: 3, cellWidth: 140, cellHeight: 175, columns: 6 } as const;

/**
 * Lists the screenshots of a review (design 9.8): the default view of each demo at 1440 × 900,
 * the default demo at 390 × 844, the two gallery pages at 1440 × 900, the animal views at the
 * size of `docs/reference/animals.webp` (1024 × 1024), and the page of each model sheet at the
 * size of its page (design 7.1), for a comparison with those images.
 *
 * @returns The screenshots, in the order of the demo list.
 */
export function reviewShots(): Shot[] {
  const demo = (id: string, width: number, height: number): Shot => ({
    file: `${id}-${width}x${height}.webp`,
    path: `/#demo=${id}`,
    width,
    height,
    ready: `canvas[data-demo="${id}"]`,
  });
  const gallery = (page: string): Shot => ({
    file: `gallery-${page}-1440x900.webp`,
    path: `/gallery.html?page=${page}`,
    width: 1440,
    height: 900,
    ready: `canvas[data-ready="${page}"]`,
  });
  return [
    ...DEMO_IDS.map((id) => demo(id, 1440, 900)),
    demo(DEFAULT_DEMO, 390, 844),
    gallery('species'),
    gallery('instruments'),
    {
      file: 'animals-views.webp',
      path: '/views.html',
      width: 1024,
      height: 1024,
      ready: 'canvas[data-ready="views"]',
    },
    ...Object.entries(VIEW_SHEETS).map(([id, sheet]) => ({
      file: `${id}-sheet-views.webp`,
      path: `/views.html?sheet=${id}`,
      width: sheet.width,
      height: sheet.height,
      ready: 'canvas[data-ready="views"]',
    })),
  ];
}

/** One screenshot during play: the shot, and the play time before it. */
export interface PlayShot extends Shot {
  /** The time from the click on play to the screenshot, in seconds. */
  readonly playSec: number;
}

/**
 * Lists the screenshots of a motion review (design 9.8): the default demo and the Beethoven 9 demo
 * at 1440 × 900, and the default demo at 390 × 844, during play. The page is ready when the
 * `Player` has loaded the samples. The bar hides 3 s after the click on play (design 2.3).
 *
 * @returns The screenshots.
 */
export function playShots(): PlayShot[] {
  const shot = (id: string, width: number, height: number): PlayShot => ({
    file: `${id}-play-${width}x${height}.webp`,
    path: `/#demo=${id}`,
    width,
    height,
    ready: SAMPLES_READY,
    playSec: 6,
  });
  return [
    shot(DEFAULT_DEMO, 1440, 900),
    shot('beethoven-9', 1440, 900),
    shot(DEFAULT_DEMO, 390, 844),
  ];
}

/** One screenshot of the UI: the shot, the device scale, and the state of the page. */
export interface UiShot extends Shot {
  /** The device pixels for each CSS pixel: 2 at 390 × 844, as the prototype screenshots. */
  readonly scale: number;
  /**
   * `first`: the first screen with the samples ready. `playing`: after 4 s of play, with the
   * drawer open, as the state "Playing, drawer open" of `docs/prototype/ui.html`.
   */
  readonly state: 'first' | 'playing';
}

/**
 * Lists the screenshots of the UI review of step 6 (design 9.5, 9.8): the default demo at
 * 1440 × 900 and at 390 × 844, on the first screen and during play with the drawer open. They
 * have the sizes of the prototype screenshots in `docs/prototype/`.
 *
 * @returns The screenshots.
 */
export function uiShots(): UiShot[] {
  const shot = (state: UiShot['state'], width: number, height: number): UiShot => ({
    file: `ui-${state}-${width}x${height}.webp`,
    path: '/',
    width,
    height,
    ready: SAMPLES_READY,
    scale: width < 700 ? 2 : 1,
    state,
  });
  return [
    shot('first', 1440, 900),
    shot('playing', 1440, 900),
    shot('first', 390, 844),
    shot('playing', 390, 844),
  ];
}

/** One screenshot of a kind of camera shot during play (design 5.6, 9.8). */
export interface CameraShot extends Shot {
  readonly kind: ShotKind;
  /** The seek point, in whole song seconds. The screenshot comes 1.5 s after the seek. */
  readonly seekSec: number;
}

/** The kinds of camera shot, in the order of the screenshots. */
const SHOT_KINDS: readonly ShotKind[] = ['conductor', 'side', 'section', 'solo', 'wide', 'high'];

/** The time from the seek to the screenshot of a camera shot, in seconds. */
const SHOT_WAIT_SEC = 1.5;

/**
 * Picks the seek point of one screenshot for each kind of shot in a plan: the first shot of the
 * kind after the opening and before the last shot, with 3 s or more after the seek. The seek bar
 * moves in whole seconds.
 *
 * @param plan The shot plan.
 * @returns The kind and the seek point of each kind in the plan.
 */
export function shotSeeks(plan: ShotPlan): { kind: ShotKind; seekSec: number }[] {
  const middle = plan.shots.slice(1, -1);
  return SHOT_KINDS.flatMap((kind) => {
    const shot = middle.find((s) => s.kind === kind && s.endSec - s.startSec >= 4);
    if (!shot) {
      return [];
    }
    return [{ kind, seekSec: Math.ceil(shot.startSec + 0.5) }];
  });
}

/**
 * Lists the screenshots of the camera shots of a demo (design 5.6, 9.8): one for each kind of
 * shot in its plan, at 1440 × 900 and at 390 × 844.
 *
 * @param id The demo.
 * @param plan The shot plan of the demo.
 * @returns The screenshots.
 */
export function cameraShots(id: DemoId, plan: ShotPlan): CameraShot[] {
  return shotSeeks(plan).flatMap(({ kind, seekSec }) =>
    (
      [
        [1440, 900],
        [390, 844],
      ] as const
    ).map(([width, height]) => ({
      file: `shot-${id}-${kind}-${width}x${height}.webp`,
      path: `/#demo=${id}`,
      width,
      height,
      ready: SAMPLES_READY,
      kind,
      seekSec,
    })),
  );
}

/**
 * Calculates the shot plan of a demo, as the app does: the section size "Auto" and the seed of
 * the app.
 *
 * @param bytes The bytes of the demo file.
 * @returns The shot plan.
 * @throws Error if the file is not valid.
 */
function demoShotPlan(bytes: Uint8Array): ShotPlan {
  const result = buildScore(bytes, 'auto');
  if (!result.ok) {
    throw new Error(`The demo is not valid: ${result.error}.`);
  }
  const models = new ModelCache();
  return prepareShots(result.score, layoutScene(result.score, models), SHOT_SEED, models);
}

/**
 * Takes the screenshot of a camera shot: it turns on the cinematic camera, plays the demo, seeks
 * to the shot during play, and waits 1.5 s. The bar hides 3 s after the click on play, so the screenshot shows the scene only.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param shot The shot.
 * @returns The PNG image.
 */
async function cameraScreenshot(browser: Browser, base: string, shot: CameraShot): Promise<Buffer> {
  const page = await openShot(browser, base + shot.path.slice(1), shot);
  try {
    await startCinematic(page);
    await page.click(FIRST_PLAY);
    const clicked = Date.now();
    await page.waitForTimeout(1500);
    await page.$eval(
      '.seek',
      (element, value) => {
        if (element instanceof HTMLInputElement) {
          element.value = String(value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      shot.seekSec,
    );
    const wait = Math.max(SHOT_WAIT_SEC * 1000, 3500 - (Date.now() - clicked));
    await page.waitForTimeout(wait);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/** The time of play before a screenshot of the state `playing`, in seconds. */
const UI_PLAY_SEC = 4;

/** One screenshot of a part of the drawer, or of the drop overlay, during play. */
export interface DrawerShot extends Shot {
  /** The device pixels for each CSS pixel: 2 at 390 × 844, as the prototype screenshots. */
  readonly scale: number;
  /**
   * `seats`: the drawer at the tab "Seats", with the cellos muted, as the state "Playing, drawer
   * open" of `docs/prototype/ui.html`. `settings`: the drawer at the tab "Settings". On a phone,
   * the settings start with the "Playback" group. `credits`: the credits dialog, which the link
   * "Credits" at the end of the tab "Settings" opens. `drop`: a file
   * over the page, as the state "File over the page".
   */
  readonly state: 'seats' | 'settings' | 'credits' | 'drop';
}

/**
 * Lists the screenshots of the seat list, the settings, the credits, and the drop overlay of
 * step 6 (design 2.8, 9.8), at the two sizes of the prototype screenshots.
 *
 * @returns The screenshots.
 */
export function drawerShots(): DrawerShot[] {
  const shot = (state: DrawerShot['state'], width: number, height: number): DrawerShot => ({
    file: `ui-${state}-${width}x${height}.webp`,
    path: '/',
    width,
    height,
    ready: SAMPLES_READY,
    scale: width < 700 ? 2 : 1,
    state,
  });
  return (['seats', 'settings', 'credits', 'drop'] as const).flatMap((state) => [
    shot(state, 1440, 900),
    shot(state, 390, 844),
  ]);
}

/** One screenshot of the load of the samples, or of a message of design 2.8. */
export interface LoadShot extends Shot {
  /** The device pixels for each CSS pixel: 2 at 390 × 844, as the prototype screenshots. */
  readonly scale: number;
  /**
   * `loading`: the first screen with the load ring and the load text, as the state "First
   * screen" of `docs/prototype/ui.html`. `error`: the samples do not load, with the message "The
   * instruments did not load." and the drawer open, as the state "Error". `no-webgl2`: the
   * full-page message of a browser with no WebGL2.
   */
  readonly state: 'loading' | 'error' | 'no-webgl2';
}

/** The count of SF3 requests that a `loading` shot lets through: the index and six presets. */
const LOADING_REQUESTS = 7;

/**
 * Lists the screenshots of the load and of the messages of step 6 (design 2.8, 9.8), at the two
 * sizes of the prototype screenshots.
 *
 * @returns The screenshots.
 */
export function loadShots(): LoadShot[] {
  const ready = {
    // The load text shows at once, so the shot waits for the first preset that is ready.
    loading: '.first-screen .status:text-matches("instruments: [1-9]")',
    error: '.message:not([hidden])',
    'no-webgl2': '.full-page',
  } as const;
  const shot = (state: LoadShot['state'], width: number, height: number): LoadShot => ({
    file: `ui-${state}-${width}x${height}.webp`,
    path: '/',
    width,
    height,
    ready: ready[state],
    scale: width < 700 ? 2 : 1,
    state,
  });
  return (['loading', 'error', 'no-webgl2'] as const).flatMap((state) => [
    shot(state, 1440, 900),
    shot(state, 390, 844),
  ]);
}

/**
 * Takes the screenshot of a load shot. The context of the page routes the requests of the SF3
 * files, also those of the decode Worker. For `loading`, it holds each request after the first
 * seven, so that the progress stops at 6 presets. For `error`, it stops each request. For
 * `no-webgl2`, the browser has WebGL2 off.
 *
 * @param browser The browser, with WebGL2 off for `no-webgl2`.
 * @param base The URL of the site.
 * @param shot The shot.
 * @returns The PNG image.
 */
async function loadScreenshot(browser: Browser, base: string, shot: LoadShot): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: shot.scale,
  });
  let release = (): void => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  let requests = 0;
  try {
    if (shot.state === 'error') {
      await context.route('**/sf/**', (route) => route.abort());
    }
    if (shot.state === 'loading') {
      await context.route('**/sf/**', async (route) => {
        requests++;
        if (requests > LOADING_REQUESTS) {
          await held;
          await route.abort().catch(() => undefined);
          return;
        }
        await route.continue();
      });
    }
    const page = await context.newPage();
    await page.goto(base + shot.path.slice(1));
    await page.waitForSelector(shot.ready, { timeout: 60_000 });
    if (shot.state === 'error') {
      await openDrawer(page);
      await page.mouse.move(0, 0);
    }
    // The decode of the presets that went through ends, and the ring stops.
    await page.waitForTimeout(shot.state === 'loading' ? 3000 : 300);
    return await page.screenshot({ type: 'png' });
  } finally {
    release();
    await context.close();
  }
}

/**
 * Opens the drawer with the drawer button of the bar. The pointer first moves over the bar, as
 * the pointer of a person does, because the controls of a hidden bar ignore the pointer (design
 * 2.3). A wide window opened the drawer at start (design 2.8), and it stays open.
 *
 * @param page The page.
 */
export async function openDrawer(page: Page): Promise<void> {
  if (await page.locator('.drawer').isVisible()) {
    return;
  }
  await page.hover('.bar');
  // The bar shows in the next frame.
  await page.waitForTimeout(100);
  await page.click('.bar button[aria-expanded]');
}

/**
 * Puts a page that plays into the state of a drawer shot.
 *
 * @param page The page, after the play time.
 * @param state The state of the shot.
 */
async function showDrawerState(page: Page, state: DrawerShot['state']): Promise<void> {
  if (state === 'drop') {
    // A drag of a file over the page shows the overlay. The shot needs no drop.
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(4)], 'piece.mid', { type: 'audio/midi' }));
      window.dispatchEvent(
        new DragEvent('dragenter', { dataTransfer: transfer, cancelable: true }),
      );
    });
  } else {
    await openDrawer(page);
    await page.click(state === 'seats' ? '#tab-seats' : '#tab-settings');
    if (state === 'seats') {
      await page.click('button[aria-label="Mute Cellos"]');
    }
    if (state === 'credits') {
      // The link "Credits" at the end of the tab "Settings" opens the credits dialog (design 2.8).
      await page.locator('.credits-line button').scrollIntoViewIfNeeded();
      await page.click('.credits-line button');
    }
  }
  await page.mouse.move(0, 0);
  // The bar hid 3 s after the click on play. It fades in again in 0.2 s.
  await page.waitForTimeout(500);
}

/**
 * Opens a page at a size and waits until it shows its scene, plus two more frames.
 *
 * @param browser The browser.
 * @param url The URL of the page.
 * @param shot The size and the ready selector.
 * @param scale The device pixels for each CSS pixel.
 * @returns The page.
 */
export async function openShot(
  browser: Browser,
  url: string,
  shot: Shot,
  scale = 1,
): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: scale,
  });
  page.on('pageerror', (error) => {
    console.error(`${shot.path}: ${error.message}`);
  });
  await page.goto(url);
  await page.waitForSelector(shot.ready, { timeout: 60_000 });
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
  return page;
}

/**
 * Encodes a PNG image as WebP in the browser, at the highest quality that keeps the file at most
 * {@link MAX_WEBP_BYTES}.
 *
 * @param browser The browser.
 * @param png The PNG image.
 * @returns The WebP file.
 */
export async function toWebp(browser: Browser, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ source, limit }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      let encoded = '';
      for (let quality = 0.92; quality > 0.3; quality -= 0.08) {
        encoded = canvas.toDataURL('image/webp', quality);
        // A base64 character holds 6 bits.
        if (((encoded.length - encoded.indexOf(',') - 1) * 3) / 4 <= limit) {
          break;
        }
      }
      return encoded;
    },
    { source: `data:image/png;base64,${png.toString('base64')}`, limit: MAX_WEBP_BYTES },
  );
  await page.close();
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/**
 * Takes a contact sheet of the species: the gallery species page at 1440 × 900 with three device
 * pixels for each CSS pixel, with one cell for each model above its label. The screenshot has no
 * labels, and each cell gets only the text of its own label. A crop of the page with its labels
 * shows parts of the labels of the next models.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The PNG image of the sheet.
 */
export async function speciesSheet(browser: Browser, base: string): Promise<Buffer> {
  const shot: Shot = {
    file: 'species-sheet.webp',
    path: '/gallery.html?page=species',
    width: 1440,
    height: 900,
    ready: 'canvas[data-ready="species"]',
  };
  const page = await openShot(browser, base + shot.path.slice(1), shot, SHEET.scale);
  // The panel covers the top left corner. The sheet does not need it.
  await page.addStyleTag({ content: '#controls { display: none; }' });
  const cells = await page.$$eval('#labels > span', (labels) =>
    labels.map((label) => {
      const box = label.getBoundingClientRect();
      return {
        x: box.x + box.width / 2,
        top: box.top,
        bottom: box.bottom,
        lines: (label.textContent ?? '').split('\n'),
      };
    }),
  );
  await page.addStyleTag({ content: '#labels { visibility: hidden; }' });
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  const sheet = await browser.newPage();
  const result = await sheet.evaluate(
    async ({ source, places, size }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const cellWidth = size.cellWidth * size.scale;
      const cellHeight = size.cellHeight * size.scale;
      const rows = Math.ceil(places.length / size.columns);
      const canvas = document.createElement('canvas');
      canvas.width = cellWidth * size.columns;
      canvas.height = cellHeight * rows;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('No 2D context.');
      }
      context.fillStyle = '#201c19';
      context.fillRect(0, 0, canvas.width, canvas.height);
      // The label text of the gallery: 12 px, centered, with a dark shadow.
      context.font = `${12 * size.scale}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.shadowColor = '#000';
      context.shadowOffsetY = size.scale;
      context.shadowBlur = 2 * size.scale;
      places.forEach((place, i) => {
        const left = place.x * size.scale - cellWidth / 2;
        const top = (place.bottom + 4) * size.scale - cellHeight;
        const x = (i % size.columns) * cellWidth;
        const y = Math.floor(i / size.columns) * cellHeight;
        context.drawImage(image, left, top, cellWidth, cellHeight, x, y, cellWidth, cellHeight);
        const lineHeight = ((place.bottom - place.top) * size.scale) / place.lines.length;
        context.fillStyle = '#ece6d6';
        place.lines.forEach((line, k) => {
          context.fillText(
            line,
            x + cellWidth / 2,
            y + place.top * size.scale - top + k * lineHeight,
          );
        });
      });
      return canvas.toDataURL('image/png');
    },
    {
      source: `data:image/png;base64,${png.toString('base64')}`,
      places: cells,
      size: SHEET,
    },
  );
  await sheet.close();
  return Buffer.from(result.slice(result.indexOf(',') + 1), 'base64');
}

/** The built site that `vite preview` serves, and a headless Chromium that opens it. */
export interface Site {
  /** The URL of the site, with a slash at the end. */
  readonly base: string;
  /** The browser. */
  readonly browser: Browser;
  /** Stops the browser and the server. */
  close(): Promise<void>;
}

/**
 * Serves the build in `dist/`, or in another folder, with `vite preview`, and starts headless
 * Chromium with the GPU of the Mac. ANGLE on Metal gives the GPU to the browser. The autoplay
 * policy lets the click of a play shot start the audio.
 *
 * @param root The root of the repository.
 * @param port The first port to try. Vite takes the next free port above it.
 * @param outDir The folder of the build, relative to the root or absolute.
 * @returns The site.
 */
export async function startSite(root: string, port = 4179, outDir = 'dist'): Promise<Site> {
  const server = await preview({
    root,
    build: { outDir },
    preview: { port, strictPort: false, open: false },
  });
  const base = server.resolvedUrls?.local[0] ?? `http://localhost:${port}/`;
  const browser = await chromium.launch({
    args: [
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  return {
    base,
    browser,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

async function main(): Promise<void> {
  const root = join(import.meta.dirname, '..');
  const [outArgument, ...flags] = process.argv.slice(2);
  if (!outArgument) {
    console.error(
      'Usage: pnpm screenshots <output directory> [--sheet] [--play] [--ui] [--drawer] [--load] [--shots]',
    );
    process.exitCode = 1;
    return;
  }
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    console.error('No build in dist/. Run pnpm build first.');
    process.exitCode = 1;
    return;
  }
  const out = resolve(outArgument);
  await mkdir(out, { recursive: true });
  const site = await startSite(root);
  const { base, browser } = site;
  try {
    for (const shot of reviewShots()) {
      const page = await openShot(browser, base + shot.path.slice(1), shot);
      const png = await page.screenshot({ type: 'png' });
      await page.close();
      const webp = await toWebp(browser, png);
      await writeFile(join(out, shot.file), webp);
      console.log(`${shot.file}: ${webp.byteLength} B`);
    }
    if (flags.includes('--sheet')) {
      const webp = await toWebp(browser, await speciesSheet(browser, base));
      await writeFile(join(out, 'species-sheet.webp'), webp);
      console.log(`species-sheet.webp: ${webp.byteLength} B`);
    }
    if (flags.includes('--play')) {
      for (const shot of playShots()) {
        const page = await openShot(browser, base + shot.path.slice(1), shot);
        await page.click(FIRST_PLAY);
        await page.waitForTimeout(shot.playSec * 1000);
        const webp = await toWebp(browser, await page.screenshot({ type: 'png' }));
        await page.close();
        await writeFile(join(out, shot.file), webp);
        console.log(`${shot.file}: ${webp.byteLength} B`);
      }
    }
    if (flags.includes('--ui')) {
      for (const shot of uiShots()) {
        const page = await openShot(browser, base + shot.path.slice(1), shot, shot.scale);
        if (shot.state === 'playing') {
          await page.click(FIRST_PLAY);
          await page.waitForTimeout(UI_PLAY_SEC * 1000);
          // The open drawer keeps the bar (design 2.8).
          await openDrawer(page);
          await page.mouse.move(0, 0);
          // The bar hid 3 s after the click on play. It fades in again in 0.2 s.
          await page.waitForTimeout(500);
        }
        const webp = await toWebp(browser, await page.screenshot({ type: 'png' }));
        await page.close();
        await writeFile(join(out, shot.file), webp);
        console.log(`${shot.file}: ${webp.byteLength} B`);
      }
    }
    if (flags.includes('--load')) {
      // The full-page message needs a browser with WebGL2 off.
      const noWebgl2 = await chromium.launch({ args: ['--disable-webgl2', '--disable-es3-apis'] });
      try {
        for (const shot of loadShots()) {
          const png = await loadScreenshot(
            shot.state === 'no-webgl2' ? noWebgl2 : browser,
            base,
            shot,
          );
          const webp = await toWebp(browser, png);
          await writeFile(join(out, shot.file), webp);
          console.log(`${shot.file}: ${webp.byteLength} B`);
        }
      } finally {
        await noWebgl2.close();
      }
    }
    if (flags.includes('--shots')) {
      const demos = await patchedDemos();
      for (const id of DEMO_IDS) {
        const demo = demos.find((d) => d.file === `${id}.mid`);
        if (!demo) {
          continue;
        }
        for (const shot of cameraShots(id, demoShotPlan(demo.bytes))) {
          const webp = await toWebp(browser, await cameraScreenshot(browser, base, shot));
          await writeFile(join(out, shot.file), webp);
          console.log(`${shot.file}: ${webp.byteLength} B (seek ${shot.seekSec} s)`);
        }
      }
    }
    if (flags.includes('--drawer')) {
      for (const shot of drawerShots()) {
        const page = await openShot(browser, base + shot.path.slice(1), shot, shot.scale);
        await page.click(FIRST_PLAY);
        await page.waitForTimeout(UI_PLAY_SEC * 1000);
        await showDrawerState(page, shot.state);
        const webp = await toWebp(browser, await page.screenshot({ type: 'png' }));
        await page.close();
        await writeFile(join(out, shot.file), webp);
        console.log(`${shot.file}: ${webp.byteLength} B`);
      }
    }
  } finally {
    await site.close();
  }
}

if (import.meta.main) {
  await main();
}
