/**
 * Shows a retargeted clip on the animals, and measures its depths (design 4.4). Usage:
 * `pnpm clip-views <dir> --clip <file>[:<animation>] [--species wolf,rabbit] [--times a,b,c]
 * [--elevation <deg>] [--clips <folder>] [--no-images]`.
 *
 * The clip file is `<folder>/<file>.glb`, a file of `pnpm mixamo-import` (`scratch/clips/` by
 * default). The tool starts a dev server of the working tree, whose plugin serves the folder at
 * `clips/` (`vite.config.ts`), and opens the gallery with the query `clip` (design 7.1) for each
 * species. It writes `<dir>/<clip>-<species>.png`: one row for each time (the quarter, the half,
 * and three quarters of the clip by default), and one column for each view (the front, the back,
 * the left, and the right).
 *
 * The measures come from the same retarget in Node, at each frame of the clip, on the standing
 * body that the gallery shows:
 *
 * - `floor`: the deepest sole under the floor with a move of the hips in `H` alone, before the
 *   floor rule of the retarget, in head heights. The floor rule takes this depth away.
 * - `paw`, `forearm`, `upper`: the deepest point of each arm part of each side in the trunk or in
 *   the legs (`armGaps()` of `pose/test-arm-clearance.ts`), in head heights. A depth up to
 *   `ARM_CONTACT_DEPTH` is a contact.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { createServer } from 'vite';

import { speciesItems } from '../src/gallery/items.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { readSourceFile } from '../src/models/source-clips.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { clipDuration, clipPoseAt, createClipPose } from '../src/pose/clip-pose.ts';
import { retargetClip, solePoints } from '../src/pose/retarget.ts';
import type { PlayerClip } from '../src/pose/retarget.ts';
import { armGaps, clearanceRig } from '../src/pose/test-arm-clearance.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import { chromiumArgs } from './chromium-args.ts';
import { grid } from './close-views.ts';
import { optionValue } from './ref-tree.ts';

/** The root of the repository. */
const ROOT = join(import.meta.dirname, '..');

/** The usage line. */
const USAGE =
  'Usage: pnpm clip-views <dir> --clip <file>[:<animation>] [--species wolf,rabbit] [--times a,b,c] [--elevation <deg>] [--clips <folder>] [--no-images]';

/** The four views of a mesh check (`docs/agents/workflow.md`): azimuths in degrees. */
const VIEWS = [
  { name: 'front', azimuth: 0 },
  { name: 'back', azimuth: 180 },
  { name: 'left', azimuth: -90 },
  { name: 'right', azimuth: 90 },
] as const;

/** The size of one cell of the grid, in CSS pixels. */
const CELL = { width: 400, height: 480 } as const;

/** The largest arm gap of interest, in head heights. A larger gap is no contact. */
const GAP_LIMIT = 0.2;

/** The arguments of the tool. */
interface ClipViewsArgs {
  /** The output folder. */
  readonly out: string;
  /** The clip query: `<file>` or `<file>:<animation>`. */
  readonly clip: string;
  /** The species to show. */
  readonly species: readonly SpeciesId[];
  /** The times of the rows, in seconds, or `null` for the quarters of the clip. */
  readonly times: readonly number[] | null;
  /** The angle of the camera above the floor, in degrees. */
  readonly elevation: number;
  /** The folder of the clip files. */
  readonly clips: string;
  /** False with `--no-images`: only the measures. */
  readonly images: boolean;
}

/**
 * Reads the arguments.
 *
 * @param args The command line after the tool name.
 * @returns The arguments, or `null` for a wrong command line.
 */
function readArgs(args: readonly string[]): ClipViewsArgs | null {
  const out = args[0];
  const clip = optionValue(args, '--clip');
  const species = (optionValue(args, '--species') ?? 'wolf,rabbit').split(',');
  const times = optionValue(args, '--times');
  if (!out || out.startsWith('--') || !clip || !species.every(isSpeciesId)) {
    return null;
  }
  return {
    out: resolve(out),
    clip,
    species: species.filter(isSpeciesId),
    times: times ? times.split(',').map(Number) : null,
    elevation: Number(optionValue(args, '--elevation') ?? 20),
    clips: resolve(optionValue(args, '--clips') ?? join(ROOT, 'scratch', 'clips')),
    images: !args.includes('--no-images'),
  };
}

/**
 * Gives the gallery item name of a species: `<instrument>@<species>` with the first instrument of
 * the species, so that the gallery shows one model.
 *
 * @param species The species.
 * @returns The name for the query `only`.
 */
function itemName(species: SpeciesId): string {
  const item = speciesItems().find((i) => i.species === species);
  return `${item?.instrument ?? 'violin'}@${species}`;
}

/**
 * Builds the standing model of a species, as the gallery shows it with a clip.
 *
 * @param species The species.
 * @returns The model.
 */
function standingModel(species: SpeciesId): PlayerModel {
  const item = speciesItems().find((i) => i.species === species);
  return buildPlayer(species, item?.instrument ?? 'violin', 4, 'stand');
}

/**
 * Retargets the clip onto a model, as the gallery does.
 *
 * @param args The arguments.
 * @param model The model.
 * @returns The clip on the model.
 * @throws Error if the file has no animation of the name.
 */
function modelClip(args: ClipViewsArgs, model: PlayerModel): PlayerClip {
  const [file = '', ...rest] = args.clip.split(':');
  const source = readSourceFile(new Uint8Array(readFileSync(join(args.clips, `${file}.glb`))));
  const name = rest.join(':');
  const clip = name ? source.clips.find((c) => c.name === name) : source.clips[0];
  if (!clip) {
    throw new Error(`The file ${file}.glb has no animation "${name}".`);
  }
  return retargetClip(source, clip, {
    skeleton: model.skeleton,
    headHeight: model.body.headHeight,
    soles: solePoints(model.mesh),
  });
}

/**
 * Measures the depths of a clip on a model at each frame, and prints one line.
 *
 * @param species The species.
 * @param model The model.
 * @param clip The clip on the model.
 */
function printDepths(species: SpeciesId, model: PlayerModel, clip: PlayerClip): void {
  const rig = clearanceRig(model);
  const pose = createClipPose();
  const deepest = new Map<string, { depth: number; time: number }>();
  for (let f = 0; f < clip.frames; f++) {
    const time = f / clip.rate;
    const posed = poseSkeleton(model, clipPoseAt(clip, time, pose));
    for (const gap of armGaps(rig, posed, GAP_LIMIT)) {
      const part = gap.part === 'hand' ? 'paw' : gap.part === 'upperArm' ? 'upper' : 'forearm';
      const key = `${part} ${gap.side} in ${gap.group}`;
      const known = deepest.get(key);
      if (!known || -gap.gap > known.depth) {
        deepest.set(key, { depth: -gap.gap, time });
      }
    }
  }
  const floor = Math.max(...clip.floorDepths);
  const floorAt = clip.floorDepths.indexOf(floor) / clip.rate;
  const parts = [...deepest.entries()]
    .filter(([, value]) => value.depth > 0)
    .toSorted((a, b) => b[1].depth - a[1].depth)
    .map(([key, value]) => `${key} ${value.depth.toFixed(3)} H at ${value.time.toFixed(2)} s`);
  console.log(
    `${clip.name} on ${species}: floor ${floor.toFixed(3)} H at ${floorAt.toFixed(2)} s; ` +
      (parts.length > 0 ? parts.join('; ') : 'no arm part in the body'),
  );
}

/**
 * Takes the cells of one species: each time in a row, each view in a column.
 *
 * @param browser The browser.
 * @param base The URL of the dev server.
 * @param args The arguments.
 * @param species The species.
 * @param model The standing model.
 * @param times The times of the rows.
 * @returns The cells, row by row, and their labels.
 */
async function speciesCells(
  browser: Browser,
  base: string,
  args: ClipViewsArgs,
  species: SpeciesId,
  model: PlayerModel,
  times: readonly number[],
): Promise<{ readonly cells: Buffer[]; readonly labels: string[] }> {
  let top = 0;
  for (let i = 1; i < model.mesh.positions.length; i += 3) {
    top = Math.max(top, model.mesh.positions[i] ?? 0);
  }
  const cells: Buffer[] = [];
  const labels: string[] = [];
  for (const time of times) {
    for (const view of VIEWS) {
      const query = new URLSearchParams({
        only: itemName(species),
        clip: args.clip,
        azimuth: String(view.azimuth),
        elevation: String(args.elevation),
        distance: (3.2 * top).toFixed(3),
        fill: '2',
      });
      query.set('body', '');
      const page = await browser.newPage({ viewport: CELL });
      try {
        page.on('pageerror', (error) => {
          console.error(`${species}: ${error.message}`);
        });
        await page.goto(`${base}gallery.html?${query.toString()}`);
        await page.waitForSelector('canvas[data-clip]', { timeout: 120_000 });
        if ((await page.getAttribute('canvas', 'data-clip')) !== 'ready') {
          throw new Error(`The clip did not load: ${(await page.textContent('#status')) ?? ''}`);
        }
        await page.addStyleTag({ content: '#controls, #labels { display: none; }' });
        await page.evaluate((value) => {
          const slider = document.querySelector('#time');
          if (slider instanceof HTMLInputElement) {
            slider.value = String(value);
            slider.dispatchEvent(new Event('input'));
          }
        }, time);
        await page.waitForTimeout(300);
        cells.push(await page.screenshot({ type: 'png' }));
        labels.push(`${species} ${time.toFixed(2)} s ${view.name}`);
      } finally {
        await page.close();
      }
    }
  }
  return { cells, labels };
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  if (!args) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const models = args.species.map((species) => {
    const model = standingModel(species);
    return { species, model, clip: modelClip(args, model) };
  });
  for (const { species, model, clip } of models) {
    printDepths(species, model, clip);
  }
  if (!args.images) {
    return;
  }

  mkdirSync(args.out, { recursive: true });
  process.env['ZOOPHONY_CLIPS'] = args.clips;
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 5281, strictPort: false },
  });
  await server.listen();
  const browser = await chromium.launch({ args: chromiumArgs(process.platform) });
  try {
    const base = server.resolvedUrls?.local[0] ?? '';
    for (const { species, model, clip } of models) {
      const duration = clipDuration(clip);
      const times = args.times ?? [0.25, 0.5, 0.75].map((share) => share * duration);
      const { cells, labels } = await speciesCells(browser, base, args, species, model, times);
      const file = join(args.out, `${args.clip.replace(':', '-')}-${species}.png`);
      writeFileSync(file, await grid(browser, cells, labels, VIEWS.length, CELL));
      console.log(`wrote ${file}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
