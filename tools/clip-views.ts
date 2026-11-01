/**
 * Shows a retargeted clip on the animals, and measures its depths (design 4.4). Usage:
 * `pnpm clip-views <dir> --clip <file>[:<animation>] [--species wolf,rabbit] [--times a,b,c]
 * [--elevation <deg>] [--aim pawL|pawR] [--clips <folder>] [--no-images]`.
 *
 * The clip file is `<folder>/<file>.glb`, a file of `pnpm mixamo-import` (`scratch/clips/` by
 * default). The tool starts a dev server of the working tree, whose plugin serves the folder at
 * `clips/` (`vite.config.ts`), and opens the gallery with the query `clip` (design 7.1) for each
 * species. It writes `<dir>/<clip>-<species>.png`: one row for each time (the quarter, the half,
 * and three quarters of the clip by default), and one column for each view (the front, the back,
 * the left, and the right). `--aim pawL` aims each view at the posed left paw from a distance of
 * `AIM_DISTANCE` head heights, so that a wrong roll of the forearm shows at once.
 *
 * The measures come from the same retarget in Node, at each frame of the clip, on the standing
 * body that the gallery shows:
 *
 * - `floor`: the deepest sole under the floor with a move of the hips in `H` alone, before the
 *   floor rule of the retarget, in head heights. The floor rule takes this depth away.
 * - `paw`, `forearm`, `upper`: the deepest corner of each arm part of each side in the closed body
 *   of the role sweeps (the trunk, the head, the tail, and the legs with a cap on each arm cut,
 *   design 9.3), in head heights (`closedDepth()` of `pose/test-clearance.ts`).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { Vector3 } from 'three';
import { createServer } from 'vite';

import { speciesItems } from '../src/gallery/items.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { readSourceFile } from '../src/models/source-clips.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { clipDuration, clipPoseAt, createClipPose } from '../src/pose/clip-pose.ts';
import { retargetClip, solePoints } from '../src/pose/retarget.ts';
import type { PlayerClip } from '../src/pose/retarget.ts';
import { closedDepth } from '../src/pose/test-clearance.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { posedCorner } from '../src/pose/test-skin.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';
import { BODY_OBSTACLE } from '../src/pose/test-sweep.ts';
import type { SweepObstacle } from '../src/pose/test-sweep.ts';
import { chromiumArgs } from './chromium-args.ts';
import { grid } from './close-views.ts';
import { optionValue } from './ref-tree.ts';

/** The root of the repository. */
const ROOT = join(import.meta.dirname, '..');

/** The usage line. */
const USAGE =
  'Usage: pnpm clip-views <dir> --clip <file>[:<animation>] [--species wolf,rabbit] [--times a,b,c] [--elevation <deg>] [--aim pawL|pawR] [--clips <folder>] [--no-images]';

/** The distance of the camera from an aimed paw, in head heights. */
const AIM_DISTANCE = 1.6;

/** The four views of a mesh check (`docs/agents/workflow.md`): azimuths in degrees. */
const VIEWS = [
  { name: 'front', azimuth: 0 },
  { name: 'back', azimuth: 180 },
  { name: 'left', azimuth: -90 },
  { name: 'right', azimuth: 90 },
] as const;

/** The size of one cell of the grid, in CSS pixels. */
const CELL = { width: 400, height: 480 } as const;

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
  /** The paw that each view aims at, or `null` for the whole body. */
  readonly aim: 'pawL' | 'pawR' | null;
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
  const aim = optionValue(args, '--aim') ?? null;
  if (
    !out ||
    out.startsWith('--') ||
    !clip ||
    !species.every(isSpeciesId) ||
    (aim !== null && aim !== 'pawL' && aim !== 'pawR')
  ) {
    return null;
  }
  return {
    out: resolve(out),
    clip,
    species: species.filter(isSpeciesId),
    times: times ? times.split(',').map(Number) : null,
    elevation: Number(optionValue(args, '--elevation') ?? 20),
    clips: resolve(optionValue(args, '--clips') ?? join(ROOT, 'scratch', 'clips')),
    aim,
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

/** The arm parts whose depth in the body the tool measures, with their bones. */
const ARM_PARTS = [
  { name: 'paw L', bones: ['handL', 'fingersL'] },
  { name: 'paw R', bones: ['handR', 'fingersR'] },
  { name: 'forearm L', bones: ['forearmL'] },
  { name: 'forearm R', bones: ['forearmR'] },
  { name: 'upper L', bones: ['upperArmL'] },
  { name: 'upper R', bones: ['upperArmR'] },
] as const satisfies readonly { readonly name: string; readonly bones: readonly BoneName[] }[];

/**
 * Finds the closed surface of the body of a model: the body obstacle of the role sweeps
 * (`SWEEP_ROLES`) whose cuts match the mesh. Each body has its own number of open loops, and the
 * surface of another body refuses the mesh.
 *
 * @param posed The model in its bind pose.
 * @returns The obstacle.
 * @throws Error if no sweep fits the mesh.
 */
function bodyObstacle(posed: PosedSkeleton): SweepObstacle {
  for (const sweep of Object.values(SWEEP_ROLES)) {
    const body = sweep.obstacles.find((obstacle) => obstacle.name === BODY_OBSTACLE);
    try {
      if (body) {
        body.surface(posed);
        return body;
      }
    } catch {
      // The cuts of this body differ from the mesh: try the next role.
    }
  }
  throw new Error('No role sweep has a body surface that fits the mesh.');
}

/**
 * Measures the depths of a clip on a model at each frame, and prints one line: the floor depth
 * before the floor rule, and the deepest point of each arm part in the closed body (the body
 * obstacle of the sweeps of design 9.3), in head heights.
 *
 * @param species The species.
 * @param model The model.
 * @param clip The clip on the model.
 */
function printDepths(species: SpeciesId, model: PlayerModel, clip: PlayerClip): void {
  const h = model.body.headHeight;
  const pose = createClipPose();
  const obstacle = bodyObstacle(poseSkeleton(model, clipPoseAt(clip, 0, pose)));
  const corners = ARM_PARTS.map((part) => {
    const bones = new Set<number>(part.bones.map(boneIndex));
    const out: number[] = [];
    for (let c = 0; c < model.mesh.bones.length; c++) {
      if (bones.has(model.mesh.bones[c] ?? -1)) {
        out.push(c);
      }
    }
    return out;
  });
  const deepest = ARM_PARTS.map((part) => ({ name: part.name, depth: 0, time: 0 }));
  for (let f = 0; f < clip.frames; f++) {
    const time = f / clip.rate;
    const posed = poseSkeleton(model, clipPoseAt(clip, time, pose));
    const surface = obstacle.surface(posed);
    for (const [p, list] of corners.entries()) {
      const points = list.map((c) => new Vector3(...posedCorner(posed, c)));
      const { depth } = closedDepth(points, surface);
      const known = deepest[p];
      if (known && depth / h > known.depth) {
        known.depth = depth / h;
        known.time = time;
      }
    }
  }
  const floor = Math.max(...clip.floorDepths);
  const floorAt = clip.floorDepths.indexOf(floor) / clip.rate;
  const parts = deepest
    .filter((value) => value.depth > 0)
    .toSorted((a, b) => b.depth - a.depth)
    .map((v) => `${v.name} ${v.depth.toFixed(3)} H at ${v.time.toFixed(2)} s`);
  console.log(
    `${clip.name} on ${species}: floor ${floor.toFixed(3)} H at ${floorAt.toFixed(2)} s; ` +
      `in body: ${parts.length > 0 ? parts.join('; ') : 'none'}`,
  );
}

/** The place of the first model of the gallery: x and z in meters, and the turn around y. */
interface FirstPlace {
  /** The x of the model origin, in meters. */
  readonly x: number;
  /** The z of the model origin, in meters. */
  readonly z: number;
  /** The turn of the model around y, in radians. */
  readonly facing: number;
}

/**
 * Reads the place of the first model of the gallery of one species (`data-first` of the canvas).
 *
 * @param browser The browser.
 * @param base The URL of the dev server.
 * @param species The species.
 * @returns The place.
 */
async function firstPlace(browser: Browser, base: string, species: SpeciesId): Promise<FirstPlace> {
  const page = await browser.newPage({ viewport: CELL });
  try {
    await page.goto(`${base}gallery.html?only=${itemName(species)}&stand`);
    await page.waitForSelector('canvas[data-first]', { timeout: 120_000 });
    const [x = 0, z = 0, facing = 0] = ((await page.getAttribute('canvas', 'data-first')) ?? '')
      .split(' ')
      .map(Number);
    return { x, z, facing };
  } finally {
    await page.close();
  }
}

/**
 * Gives the posed place of a paw in the axes of the gallery: the middle of the wrist and of the
 * finger joint.
 *
 * @param model The model.
 * @param clip The clip on the model.
 * @param time The time in the clip.
 * @param aim The paw.
 * @param place The place of the model in the gallery.
 * @returns The point, in meters.
 */
function aimedPaw(
  model: PlayerModel,
  clip: PlayerClip,
  time: number,
  aim: 'pawL' | 'pawR',
  place: FirstPlace,
): Vector3 {
  const posed = poseSkeleton(model, clipPoseAt(clip, time, createClipPose()));
  const side = aim === 'pawL' ? 'L' : 'R';
  const hand = posed.frames[boneIndex(`hand${side}`)]?.position ?? new Vector3();
  const fingers = posed.frames[boneIndex(`fingers${side}`)]?.position ?? hand;
  return hand
    .clone()
    .lerp(fingers, 0.5)
    .applyAxisAngle(new Vector3(0, 1, 0), place.facing)
    .add(new Vector3(place.x, 0, place.z));
}

/**
 * Takes the cells of one species: each time in a row, each view in a column.
 *
 * @param browser The browser.
 * @param base The URL of the dev server.
 * @param args The arguments.
 * @param species The species.
 * @param model The standing model.
 * @param clip The clip on the model.
 * @param times The times of the rows.
 * @returns The cells, row by row, and their labels.
 */
async function speciesCells(
  browser: Browser,
  base: string,
  args: ClipViewsArgs,
  species: SpeciesId,
  model: PlayerModel,
  clip: PlayerClip,
  times: readonly number[],
): Promise<{ readonly cells: Buffer[]; readonly labels: string[] }> {
  let top = 0;
  for (let i = 1; i < model.mesh.positions.length; i += 3) {
    top = Math.max(top, model.mesh.positions[i] ?? 0);
  }
  const place = args.aim ? await firstPlace(browser, base, species) : null;
  const cells: Buffer[] = [];
  const labels: string[] = [];
  for (const time of times) {
    for (const view of VIEWS) {
      const query = new URLSearchParams({
        only: itemName(species),
        clip: args.clip,
        azimuth: String(view.azimuth),
        elevation: String(args.elevation),
        fill: '2',
      });
      if (args.aim && place) {
        const paw = aimedPaw(model, clip, time, args.aim, place);
        query.set('x', paw.x.toFixed(4));
        query.set('z', paw.z.toFixed(4));
        query.set('target', paw.y.toFixed(4));
        query.set('distance', (AIM_DISTANCE * model.body.headHeight).toFixed(4));
      } else {
        query.set('distance', (3.2 * top).toFixed(3));
        query.set('body', '');
      }
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
        labels.push(
          `${species} ${time.toFixed(2)} s ${view.name}${args.aim ? ` ${args.aim}` : ''}`,
        );
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
      const { cells, labels } = await speciesCells(
        browser,
        base,
        args,
        species,
        model,
        clip,
        times,
      );
      const aim = args.aim ? `-${args.aim}` : '';
      const file = join(args.out, `${args.clip.replace(':', '-')}-${species}${aim}.png`);
      writeFileSync(file, await grid(browser, cells, labels, VIEWS.length, CELL));
      console.log(`wrote ${file}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
