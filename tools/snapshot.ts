import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser } from '@playwright/test';

import { DEFAULT_DEMO } from '../src/app/demos.ts';
import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import { openShot, speciesSheet, startSite, toWebp } from './screenshots.ts';
import type { Shot } from './screenshots.ts';

/** The commit that a snapshot shows. */
export interface SnapshotCommit {
  /** The short hash. */
  readonly hash: string;
  /** The date of the commit in its own time zone, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The subject line of the commit message. */
  readonly subject: string;
  /** True if the working tree has changes that are not committed. */
  readonly dirty: boolean;
}

/** One image of a snapshot. */
interface SnapshotImage {
  /** The name of the WebP file. */
  readonly file: string;
  /** What the image shows. */
  readonly caption: string;
}

/** The song time of the seek before the play frame, in seconds. */
const SNAPSHOT_SEEK_SEC = 30;

/**
 * The time from the seek to the play frame, in seconds. The bar hides 3 s after the last pointer
 * event (design 2.3), so the frame shows the scene only.
 */
const SNAPSHOT_WAIT_SEC = 3.5;

/** The play frame: the default demo at the size of the reference images of the scene. */
const PLAY_SHOT: Shot = {
  file: 'play-1440x900.webp',
  path: `/#demo=${DEFAULT_DEMO}`,
  width: 1440,
  height: 900,
  ready: SAMPLES_READY,
};

/** The images of a snapshot, in the order of the index. */
export const SNAPSHOT_IMAGES: readonly SnapshotImage[] = [
  {
    file: PLAY_SHOT.file,
    caption: `The default demo during play, with the drawer closed, in the default view of "Reset view", ${SNAPSHOT_WAIT_SEC} s after a seek to ${SNAPSHOT_SEEK_SEC} s.`,
  },
  { file: 'species-sheet.webp', caption: 'A close view of each model of the gallery.' },
];

/**
 * Gives the folder of the snapshot of a commit, from the root of the repository, in the ignored
 * folder `scratch/`. The folder depends only on the commit, so a second run on the same commit
 * writes the same files again.
 *
 * @param commit The commit.
 * @returns The folder.
 */
export function snapshotFolder(commit: SnapshotCommit): string {
  return join('scratch', 'snapshots', `${commit.date}-${commit.hash}`);
}

/**
 * Writes the index of a snapshot: the commit, the command, and each image with its caption.
 *
 * @param commit The commit.
 * @param images The images.
 * @returns The Markdown text.
 */
export function snapshotIndex(commit: SnapshotCommit, images: readonly SnapshotImage[]): string {
  const lines = [
    `# Snapshot of ${commit.date}`,
    '',
    `Commit \`${commit.hash}\`: ${commit.subject}. \`pnpm snapshot\` made these images.`,
  ];
  if (commit.dirty) {
    lines.push('', 'The working tree had changes that were not committed.');
  }
  lines.push('', '| File | View |', '|---|---|');
  for (const image of images) {
    lines.push(`| [\`${image.file}\`](${image.file}) | ${image.caption} |`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Reads the commit at `HEAD` with git.
 *
 * @param root The root of the repository.
 * @returns The commit.
 */
function readCommit(root: string): SnapshotCommit {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    hash: git('rev-parse', '--short', 'HEAD'),
    date: git('log', '-1', '--format=%cd', '--date=format:%Y-%m-%d'),
    subject: git('log', '-1', '--format=%s'),
    dirty: git('status', '--porcelain') !== '',
  };
}

/**
 * Takes the play frame: it plays the default demo, closes the drawer, moves the camera to the
 * default view with "Reset view", seeks to {@link SNAPSHOT_SEEK_SEC}, and waits
 * {@link SNAPSHOT_WAIT_SEC}. A seek keeps the free camera of "Reset view" (design 2.5).
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @returns The PNG image.
 */
async function playFrame(browser: Browser, base: string): Promise<Buffer> {
  const page = await openShot(browser, base + PLAY_SHOT.path.slice(1), PLAY_SHOT);
  try {
    await page.click(FIRST_PLAY);
    await page.waitForTimeout(1500);
    // The open drawer keeps the bar and covers the right side of the stage (design 2.8).
    await page.click('.close-drawer');
    await page.getByRole('button', { name: 'Reset view' }).click();
    await page.mouse.move(PLAY_SHOT.width / 2, PLAY_SHOT.height / 2);
    await page.$eval(
      '.seek',
      (element, value) => {
        if (element instanceof HTMLInputElement) {
          element.value = String(value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      SNAPSHOT_SEEK_SEC,
    );
    await page.waitForTimeout(SNAPSHOT_WAIT_SEC * 1000);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const root = join(import.meta.dirname, '..');
  const commit = readCommit(root);
  const folder = snapshotFolder(commit);
  await mkdir(join(root, folder), { recursive: true });

  const site = await startSite(root);
  try {
    const pngs = [
      await playFrame(site.browser, site.base),
      await speciesSheet(site.browser, site.base),
    ];
    for (const [i, image] of SNAPSHOT_IMAGES.entries()) {
      const png = pngs[i];
      if (!png) {
        throw new Error(`No image for ${image.file}.`);
      }
      const webp = await toWebp(site.browser, png);
      await writeFile(join(root, folder, image.file), webp);
      console.log(`${join(folder, image.file)}: ${webp.byteLength} B`);
    }
  } finally {
    await site.close();
  }

  await writeFile(join(root, folder, 'README.md'), snapshotIndex(commit, SNAPSHOT_IMAGES));
  console.log(join(folder, 'README.md'));
}

if (import.meta.main) {
  await main();
}
