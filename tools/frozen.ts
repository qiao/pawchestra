/**
 * Renders the frozen shots of the stage and compares the pixels of two trees (design 9.7):
 * `pnpm frozen [--base <ref>] [--shots <list>] [--out <dir>] [--tree <dir>] [--canvas-only]`. A
 * frozen shot holds the song time and the wall time, so that two runs of one tree give the same
 * pixels. A cut of the frame time that must keep the look runs `pnpm frozen --base main`
 * (`docs/agents/commands.md`). `--tree` renders another folder in place of the working tree.
 * `--canvas-only` hides the parts of the page over the canvas before each shot, so that a shot
 * holds only the pixels of the canvas. A refactor check against the base of a round with a
 * planned change of the UI then shows only the changes of the scene.
 *
 * The tool serves the working tree with the Vite dev server, opens each shot in Google Chrome at
 * 1440 × 900 and the device scale 2, and writes `<out>/tree/<shot>.png`. With `--base`, it
 * extracts the commit into a temporary folder, serves it in the same way, writes
 * `<out>/base/<shot>.png`, and prints for each shot the mean difference of the channels (0 to
 * 255), the largest difference, the count of changed pixels, and the part of the pixels with a
 * difference above 16. It exits with 1 when a pixel changed.
 */
import { existsSync, symlinkSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { createServer } from 'vite';
import type { InlineConfig } from 'vite';

import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { chromiumArgs } from './chromium-args.ts';
import { startCinematic } from './cinematic-mode.ts';
import { ROOT, optionValue, runChild, shortHash, withRefTree } from './ref-tree.ts';

/**
 * The frozen shots: the demo, the song time of the pause, and Free mode at the default view. The
 * section shot is the shot of the Chrome trace of `pnpm frame`, with the depth of field.
 */
export const FROZEN_SHOTS = {
  play: { demo: 'boulanger-matin', seek: 30, free: true },
  conductor: { demo: 'boulanger-matin', seek: 73, free: false },
  'perf-wide': { demo: 'perf-60', seek: 5, free: false },
  'perf-section': { demo: 'perf-60', seek: 36, free: false },
} as const;

/** The name of a frozen shot. */
export type FrozenShot = keyof typeof FROZEN_SHOTS;

/** The names of the frozen shots in their order. */
export const SHOT_NAMES: readonly FrozenShot[] = ['play', 'conductor', 'perf-wide', 'perf-section'];

/**
 * The scripts that write the files of the dev server that git does not hold: the presets of the
 * SoundFont, the demos, and `perf-60.mid`. `pnpm frame` runs them too.
 */
const ASSET_SCRIPTS = [
  'tools/split-soundfont.ts',
  'tools/patch-demos.ts',
  'tools/write-perf-60.ts',
] as const;

/** The first port of the dev server. 4182 is the port of the end-to-end tests. */
const PORT = 4192;

/** The difference of the channels above which a pixel counts in {@link PixelDiff.above}. */
const VISIBLE = 16;

/**
 * The script that holds the time of the page after `window.freezeTime()`: `performance.now()` and
 * the time stamp of each animation frame stay at 1,000,000 ms. The effects that read the wall
 * time, such as the film grain, the motes, and the idle motion, then draw the same frame in each
 * run.
 */
const FREEZE = `(() => {
  const realNow = performance.now.bind(performance);
  let frozen = null;
  performance.now = () => frozen ?? realNow();
  window.freezeTime = () => { frozen = 1e6; };
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => request((t) => cb(frozen ?? t));
})();`;

/**
 * The style of `--canvas-only`: it hides each part of the page over the canvas, such as the
 * title, the bar, and the drawer. The opacity hides each part with all its children, and it keeps
 * the layout. Thus the app keeps the frame of the camera that the first screen and the drawer
 * give. The letterbox is a part of the canvas, so it stays.
 */
const CANVAS_ONLY = 'body > :not(#stage) { opacity: 0 !important; transition: none !important; }';

/** The command line of the tool. */
export interface FrozenArgs {
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** The shots to render. */
  readonly shots: readonly FrozenShot[];
  /** The output folder. */
  readonly out: string;
  /**
   * The root of another tree to render in place of the working tree, with its `node_modules`, or
   * `null`. `pnpm frame-compare` renders its temporary trees with it.
   */
  readonly tree: string | null;
  /** True with `--canvas-only`: each shot hides the parts of the page over the canvas. */
  readonly canvasOnly: boolean;
}

/**
 * Tells if a name is the name of a frozen shot.
 *
 * @param name The name.
 * @returns True for a shot of {@link FROZEN_SHOTS}.
 */
function isShot(name: string): name is FrozenShot {
  return SHOT_NAMES.some((shot) => shot === name);
}

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The arguments. The default output folder is `scratch/frozen/` of the repository.
 * @throws Error for an option with no value, or for a shot that does not exist.
 */
export function frozenArgs(args: readonly string[]): FrozenArgs {
  const base = optionValue(args, '--base');
  const shots = optionValue(args, '--shots');
  const out = optionValue(args, '--out');
  const tree = optionValue(args, '--tree');
  if (base === undefined || shots === undefined || out === undefined || tree === undefined) {
    throw new Error(
      'Usage: pnpm frozen [--base <ref>] [--shots <list>] [--out <dir>] [--tree <dir>] ' +
        '[--canvas-only]',
    );
  }
  const names = shots === null ? [...SHOT_NAMES] : shots.split(',');
  const unknown = names.filter((name) => !isShot(name));
  if (unknown.length > 0) {
    throw new Error(`No frozen shot "${unknown.join('", "')}". Shots: ${SHOT_NAMES.join(', ')}.`);
  }
  return {
    base,
    shots: names.filter((name) => isShot(name)),
    out: resolve(out ?? join(ROOT, 'scratch', 'frozen')),
    tree: tree === null ? null : resolve(tree),
    canvasOnly: args.includes('--canvas-only'),
  };
}

/** The options of {@link renderShots}. */
interface RenderOptions {
  /** True to hide the parts of the page over the canvas before each shot. */
  readonly canvasOnly: boolean;
  /**
   * The cache folder of Vite, or `undefined` for the cache of the tree. A temporary tree gets its
   * own, so that it does not write the cache of the repository through its link to
   * `node_modules`.
   */
  readonly cacheDir?: string;
}

/**
 * Renders the frozen shots of a tree with the Vite dev server of the tree, and writes one PNG
 * file for each shot.
 *
 * @param browser The browser.
 * @param root The root of the tree, with a `node_modules` folder.
 * @param out The folder of the PNG files.
 * @param shots The shots.
 * @param options The canvas-only flag and the cache folder of Vite.
 */
async function renderShots(
  browser: Browser,
  root: string,
  out: string,
  shots: readonly FrozenShot[],
  options: RenderOptions,
): Promise<void> {
  await mkdir(out, { recursive: true });
  const config: InlineConfig = {
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: PORT, strictPort: false },
  };
  if (options.cacheDir) {
    config.cacheDir = options.cacheDir;
  }
  const server = await createServer(config);
  await server.listen();
  try {
    const base = server.resolvedUrls?.local[0] ?? '';
    for (const name of shots) {
      const shot = FROZEN_SHOTS[name];
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      });
      try {
        await page.addInitScript(FREEZE);
        await page.goto(`${base}#demo=${shot.demo}`);
        await page.waitForSelector(SAMPLES_READY, { timeout: 120_000 });
        if (!shot.free) {
          await startCinematic(page);
        }
        await page.click(FIRST_PLAY);
        await page.waitForTimeout(1500);
        await page.click('.close-drawer', { timeout: 2000 }).catch(() => undefined);
        if (shot.free) {
          await page.getByRole('button', { name: 'Reset view' }).click();
        }
        await page.mouse.move(720, 450);
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });
        // Space pauses, then the seek moves the song time with no play.
        await page.keyboard.press(' ');
        await page.waitForTimeout(500);
        await page.$eval(
          '.seek',
          (element, value) => {
            if (element instanceof HTMLInputElement) {
              element.value = String(value);
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
          shot.seek,
        );
        await page.waitForTimeout(1500);
        await page.evaluate('window.freezeTime()');
        await page.mouse.move(0, 0);
        await page.waitForTimeout(4000);
        if (options.canvasOnly) {
          await page.addStyleTag({ content: CANVAS_ONLY });
          await page.waitForTimeout(300);
        }
        await writeFile(join(out, `${name}.png`), await page.screenshot({ type: 'png' }));
        const song = await page.evaluate(() => window.pawchestra?.songTime ?? Number.NaN);
        console.log(`${relative(ROOT, join(out, `${name}.png`))}: song time ${song.toFixed(2)} s`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await server.close();
  }
}

/** The difference of two frames of one size. */
export interface PixelDiff {
  /** The mean absolute difference of the channels, from 0 to 255. */
  readonly mean: number;
  /** The largest difference of a channel. */
  readonly largest: number;
  /** The count of pixels with a difference in a channel. */
  readonly changed: number;
  /** The part of the pixels with a difference above {@link VISIBLE} in a channel, from 0 to 1. */
  readonly above: number;
}

/**
 * Decodes two PNG files in a page of the browser, and compares their pixels there, channel by
 * channel, with no alpha. The page decodes each image into a canvas with no color change of its
 * own, so two files with the same pixels give no difference. The pixels stay in the page: two
 * frames of 2880 × 1800 hold 41 MB.
 *
 * @param browser The browser.
 * @param a The first PNG file.
 * @param b The second PNG file.
 * @returns The difference of the pixels.
 * @throws Error if the images have different sizes.
 */
export async function comparePngs(browser: Browser, a: Buffer, b: Buffer): Promise<PixelDiff> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ first, second, visible }) => {
        const decode = async (source: string): Promise<ImageData> => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) {
            throw new Error('The canvas has no 2D context.');
          }
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        };
        const [one, two] = [await decode(first), await decode(second)];
        if (one.width !== two.width || one.height !== two.height) {
          throw new Error(`The frames have different sizes.`);
        }
        let sum = 0;
        let largest = 0;
        let changed = 0;
        let above = 0;
        for (let i = 0; i < one.data.length; i += 4) {
          let pixel = 0;
          for (let c = 0; c < 3; c++) {
            const d = Math.abs((one.data[i + c] ?? 0) - (two.data[i + c] ?? 0));
            sum += d;
            pixel = Math.max(pixel, d);
          }
          largest = Math.max(largest, pixel);
          changed += pixel > 0 ? 1 : 0;
          above += pixel > visible ? 1 : 0;
        }
        const pixels = one.width * one.height;
        return { mean: sum / (pixels * 3), largest, changed, above: above / pixels };
      },
      {
        first: `data:image/png;base64,${a.toString('base64')}`,
        second: `data:image/png;base64,${b.toString('base64')}`,
        visible: VISIBLE,
      },
    );
  } finally {
    await page.close();
  }
}

/**
 * Gives the line of the difference of one shot.
 *
 * @param shot The shot.
 * @param diff The difference.
 * @returns The line, such as `play: same pixels`.
 */
export function diffLine(shot: FrozenShot, diff: PixelDiff): string {
  if (diff.changed === 0) {
    return `${shot}: same pixels`;
  }
  const above = (diff.above * 100).toFixed(2);
  return (
    `${shot}: mean ${diff.mean.toFixed(3)}, largest ${diff.largest}, ` +
    `changed ${diff.changed} pixels, above ${VISIBLE}: ${above}%`
  );
}

/**
 * Writes the files of the dev server that git does not hold into a tree: the scripts of
 * {@link ASSET_SCRIPTS} that the tree has.
 *
 * @param dir The root of the tree.
 */
async function writeAssets(dir: string): Promise<void> {
  for (const script of ASSET_SCRIPTS) {
    if (existsSync(join(dir, script))) {
      await runChild('node', [script], dir);
    }
  }
}

async function main(): Promise<void> {
  const args = frozenArgs(process.argv.slice(2));
  const browser = await chromium.launch({ channel: 'chrome', args: chromiumArgs('darwin') });
  try {
    const tree = join(args.out, 'tree');
    const { canvasOnly } = args;
    if (args.tree === null) {
      await renderShots(browser, ROOT, tree, args.shots, { canvasOnly });
    } else {
      await renderShots(browser, args.tree, tree, args.shots, {
        canvasOnly,
        cacheDir: join(args.tree, '.vite-cache'),
      });
    }
    if (args.base === null) {
      return;
    }

    const label = `${args.base} (${shortHash(args.base)})`;
    const baseDir = join(args.out, 'base');
    await withRefTree(
      args.base,
      async (dir) => {
        symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
        await writeAssets(dir);
        await renderShots(browser, dir, baseDir, args.shots, {
          canvasOnly,
          cacheDir: join(dir, '.vite-cache'),
        });
      },
      { prefix: 'frozen-' },
    );
    console.log(`\nThe working tree against ${label}:`);
    let changed = false;
    for (const shot of args.shots) {
      const [a, b] = await Promise.all([
        readFile(join(baseDir, `${shot}.png`)),
        readFile(join(tree, `${shot}.png`)),
      ]);
      const diff = await comparePngs(browser, a, b);
      changed ||= diff.changed > 0;
      console.log(diffLine(shot, diff));
    }
    if (changed) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  await main();
}
