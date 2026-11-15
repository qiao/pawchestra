/**
 * Finds the clips of the players of a MIDI file over the whole song (design 9.3): the parts that
 * go into each other, which no sweep of one role sees. A sample is a time of the play from the song
 * start to the song end, at steps of `--step` seconds, with the count-in first, as the sweep plays
 * it (`playSample()` of `src/pose/test-sweep-roles.ts`). The measures:
 *
 * - `seats`: the pairs of items of the layout whose footprints overlap (`layoutObstacles()`): two
 *   players with their instruments and seats, a stand, the podium, or the risers.
 * - `paw in paw`: the depth of the corners of one paw of a player in the other paw, closed with a
 *   cap at the wrist, such as the wide paws of a pianist on near keys.
 * - `held across`: a mallet, a stick, or a beater of one hand that crosses the other paw or the
 *   held part of the other hand. A thin part can cross another part with no corner inside it, so
 *   this measure counts the samples where the triangles cross.
 * - `in instrument`: the depth of the paws, of the shafts of the held parts, and of the middle of
 *   each mallet head in the closed shells of the own instrument: the piano case off the keys
 *   (`pianoCase()`), or each closed shell of a percussion instrument. A head lies on its target at
 *   a strike, so only its middle counts. Of the body, only the paws count: `pnpm body-clip`
 *   measures the trunk, the arms, and the legs.
 * - `under floor`: the depth of the lowest corner of the instrument and of the held parts below the
 *   floor under the player.
 * - `between players`: the arms, the held parts, and the instrument of a player that cross the arms,
 *   the held parts, or the instrument of a near player, or go into the boxes of its other bones in
 *   the bind pose (one box for each bone in each band of height, as `playerFootprint()` makes).
 *
 * A measure clips when more than {@link SHARE_LIMIT} of the samples are over its limit. The files
 * are each demo and the percussion test score (`probeDemos()`), the demos of `--demo`, or the MIDI
 * files of `--midi`. With `--base <ref>`, the commit runs beside the working tree
 * (`probeBeside()`), and each value gives the value of the commit in parentheses.
 *
 * `--set <changes>` changes the holds of the working tree in memory (`setHolds()` of
 * `tools/hold-sets.ts`), and the commit of `--base` runs with no change. `--variant <name>` starts
 * a variant, and each `--set` after it adds its changes to the variant, as `pnpm arm-check` takes
 * them. Each variant runs as one child, one after the other, and one table gives a block of rows
 * for each variant ({@link variantLines}). The commit runs one time for all variants.
 *
 * Usage: pnpm clip-probe [--midi <path>]... [--demo <id>]... [--step <s>] [--jobs <n>]
 *        [--set <changes>]... [--variant <name> [--set <changes>]...]... [--base <ref>]
 *        [--json <file>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Box3, Matrix4, Triangle, Vector3 } from 'three';

import { setHolds } from './hold-sets.ts';
import { midiPath, probeDemos } from './probe-demos.ts';
import {
  ROOT,
  probeBeside,
  probeRef,
  runChild,
  runChildren,
  shortHash,
  withTempFolder,
  withoutOptions,
} from './ref-tree.ts';
import { obstaclesTouch } from '../src/models/footprint.ts';
import type { Obstacle } from '../src/models/footprint.ts';
import { layoutObstacles } from '../src/models/layout-scene.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { MOTION_FAMILIES } from '../src/pose/family.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import {
  closeSurface,
  closedDepth,
  closedPart,
  openLoops,
  partDistance,
  posedPart,
} from '../src/pose/test-clearance.ts';
import type { ClosedSurface, PosedPart } from '../src/pose/test-clearance.ts';
import { poseSkeleton, posedPiecePoint } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { pianoCase, playSample } from '../src/pose/test-sweep-roles.ts';

/** The usage text of `pnpm clip-probe`. */
const USAGE =
  'Usage: pnpm clip-probe [--midi <path>]... [--demo <id>]... [--step <s>] [--jobs <n>] [--set <changes>]... [--variant <name> [--set <changes>]...]... [--base <ref>] [--json <file>]';

/** The format version of the JSON of `--json` (`formatVersion()` of `tools/ref-tree.ts`). */
const FORMAT = 1;

/**
 * The step of the song time between two samples with no `--step`, in seconds. A file of one minute
 * takes about 6 s, and all demos with `--base` take about 8 minutes with 4 jobs.
 */
const DEFAULT_STEP = 0.25;

/**
 * The most child processes at the same time with no `--jobs`. Each child holds the models of its
 * file, about 0.5 GB.
 */
const DEFAULT_JOBS = 4;

/**
 * The contact depth of a part in another part, in meters: the `CONTACT` of the sweep
 * (`src/pose/test-sweep-roles.ts`). A paw on a paw or on the case presses the fur a little.
 */
const CONTACT = 0.015;

/** The depth of the lowest corner below the floor that counts, in meters. */
const FLOOR_LIMIT = 0.01;

/**
 * The share of the samples over the limit above which a measure clips. A cross of two thin parts
 * for one sample in a fast move of a hand does not show.
 */
const SHARE_LIMIT = 0.01;

/**
 * The scope line of the output: of the body, the measure `in instrument` tests only the paws.
 * `pnpm body-clip` tests the other regions of the body.
 */
const SCOPE =
  'Of the body, "in instrument" tests the paws only. Use pnpm body-clip for the trunk, the arms, and the legs.';

/**
 * The distance of the footprints of two players below which the probe measures them against each
 * other, in meters: about the reach of an arm with a mallet past the bind footprint.
 */
const NEAR = 0.3;

/** The height of one band of the boxes of a body, in meters, as `playerFootprint()` makes them. */
const BAND_HEIGHT = 0.2;

/** The largest distance from the middle of a mallet head to a corner of its ball, in meters. */
const BALL_REACH = 0.08;

/** The bones of each paw. */
const PAWS = {
  L: ['handL', 'fingersL'],
  R: ['handR', 'fingersR'],
} as const satisfies Readonly<Record<'L' | 'R', readonly BoneName[]>>;

/** The held part of each hand: a mallet, a stick, or a beater. */
const HELD = { L: 'malletL', R: 'malletR' } as const satisfies Readonly<
  Record<'L' | 'R', BoneName>
>;

/** The bones of the parts of a player that move far from its bind footprint. */
const MOVING: readonly BoneName[] = [
  'upperArmL',
  'forearmL',
  'handL',
  'fingersL',
  'upperArmR',
  'forearmR',
  'handR',
  'fingersR',
  'malletL',
  'malletR',
  'instrument',
  'slide',
];

/** The names of the measures, in the order of the tables. */
export const MEASURES = [
  'seats',
  'paw in paw',
  'held across',
  'in instrument',
  'under floor',
  'between players',
] as const;

/** A measure of the probe. */
type MeasureName = (typeof MEASURES)[number];

/** The result of one measure in one file. */
interface MeasureResult {
  /** The deepest depth over all samples in meters, or the share of the samples for a cross. */
  readonly value: number;
  /** The share of the samples over the limit, from 0 to 1. */
  readonly share: number;
  /** The limit of the value: a depth in meters, or 0 for a cross. */
  readonly limit: number;
  /** The player or the pair of the worst sample, or `null` with no value. */
  readonly who: string | null;
  /** The song time of the worst sample, in seconds, or `null` for the seats or no value. */
  readonly at: number | null;
}

/** The results of one file. */
interface FileResult {
  /** The name of the file, such as `beethoven-9.mid`. */
  readonly file: string;
  /** The number of players. */
  readonly players: number;
  /** The number of samples of the play. */
  readonly samples: number;
  /** The result of each measure. */
  readonly measures: Readonly<Record<MeasureName, MeasureResult>>;
}

/** The JSON of `--json`. */
interface ProbeOutput {
  /** The format version ({@link FORMAT}). */
  readonly version: number;
  /** The step of the samples, in seconds. */
  readonly step: number;
  /** The results of each file. */
  readonly files: readonly FileResult[];
}

/** The options of the command line. */
interface ProbeOptions {
  /** The absolute paths of the MIDI files of `--midi`. */
  readonly midi: readonly string[];
  /** The demos of `--demo`, with no `.mid`. */
  readonly demos: readonly string[];
  /** The step of the samples, in seconds. */
  readonly step: number;
  /** The commit of `--base`, or `null`. */
  readonly base: string | null;
  /** The file of `--json`, or `null`. */
  readonly json: string | null;
  /** The most child processes at the same time, each with one file (`--jobs`). */
  readonly jobs: number;
  /** The hold changes of each `--set` for the working tree, with no `--variant`. */
  readonly sets: readonly string[];
  /** The variants of `--variant`, or empty for a run with one variant. */
  readonly variants: readonly ClipVariant[];
}

/** One variant of `--variant`: a name and the hold changes of its `--set` options. */
interface ClipVariant {
  /** The name of the variant, which the table gives. */
  readonly name: string;
  /** The value of each `--set` option of the variant, in their order. */
  readonly sets: readonly string[];
}

/** A file to probe: its name and its bytes. */
interface ProbeFile {
  /** The name of the file. */
  readonly file: string;
  /** The bytes of the file. */
  readonly bytes: Uint8Array;
}

/** The worst sample of one measure, as the probe collects it. */
class Worst {
  /** The deepest value. */
  value = 0;
  /** The number of samples over the limit. */
  over = 0;
  /** The player or the pair of the deepest value. */
  who: string | null = null;
  /** The song time of the deepest value. */
  at: number | null = null;
  /** The limit of the value. */
  readonly limit: number;

  /**
   * Makes an empty measure.
   *
   * @param limit The limit of the value.
   */
  constructor(limit: number) {
    this.limit = limit;
  }

  /**
   * Adds the value of one sample of one player or pair.
   *
   * @param value The value.
   * @param who The player or the pair.
   * @param at The song time.
   * @returns True if the value is over the limit.
   */
  add(value: number, who: string, at: number): boolean {
    if (value > this.value) {
      this.value = value;
      this.who = who;
      this.at = at;
    }
    return value > this.limit;
  }
}

/** The parts of one player at one sample, in the stage axes, for the measures between players. */
interface StagedPlayer {
  /** The posed moving parts ({@link MOVING}). */
  readonly moving: PosedPart;
  /** The corners of the moving parts. */
  readonly corners: readonly Vector3[];
}

/** The data of one player that the probe finds one time. */
interface PlayerData {
  /** The index of the player in the layout. */
  readonly index: number;
  /** The name of the player in the tables, such as `badger xylophone (player 3)`. */
  readonly label: string;
  /** The player model. */
  readonly model: PlayerModel;
  /** The place of the model on the stage. */
  readonly toStage: Matrix4;
  /** The turn back from the stage axes to the axes of the model. */
  readonly fromStage: Matrix4;
  /** The boxes of the bones that do not move far ({@link MOVING}), in the axes of the model. */
  readonly body: readonly Box3[];
  /** The box around {@link PlayerData.body}. */
  readonly bodyBounds: Box3;
  /** The open loops of each paw in the bind pose, for its closed surface. */
  readonly pawLoops: Readonly<Record<'L' | 'R', number>>;
  /** True when the player holds a mallet, a stick, or a beater in the hand. */
  readonly held: Readonly<Record<'L' | 'R', boolean>>;
}

/**
 * Reads the command line.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error with the usage text for an option that does not fit.
 */
function readOptions(args: readonly string[]): ProbeOptions {
  const midi: string[] = [];
  const demos: string[] = [];
  let step = DEFAULT_STEP;
  let base: string | null = null;
  let json: string | null = null;
  let jobs = DEFAULT_JOBS;
  const sets: string[] = [];
  const variants: { readonly name: string; readonly sets: string[] }[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`The option ${arg ?? ''} needs a value.\n${USAGE}`);
    }
    switch (arg) {
      case '--set': {
        const variant = variants.at(-1);
        if (variant) {
          variant.sets.push(value);
        } else {
          sets.push(value);
        }
        break;
      }
      case '--variant':
        if (variants.some((variant) => variant.name === value)) {
          throw new Error(`The variant ${value} comes more than one time.`);
        }
        variants.push({ name: value, sets: [] });
        break;
      case '--midi':
        midi.push(midiPath(value));
        break;
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--step':
        step = Number(value);
        if (!(step > 0)) {
          throw new Error(`The step ${value} is not a number above 0.\n${USAGE}`);
        }
        break;
      case '--base':
        base = value;
        break;
      case '--json':
        json = value;
        break;
      case '--jobs':
        jobs = Number(value);
        if (!Number.isInteger(jobs) || jobs < 1) {
          throw new Error(`The jobs ${value} are not a whole number above 0.\n${USAGE}`);
        }
        break;
      default:
        throw new Error(`The option ${arg ?? ''} is not known.\n${USAGE}`);
    }
    i++;
  }
  if (variants.length > 0 && sets.length > 0) {
    throw new Error(
      `With --variant, each --set goes after a --variant, and "--set ${sets[0] ?? ''}" comes before the first one.\n${USAGE}`,
    );
  }
  if (variants.length > 0 && json !== null) {
    throw new Error(`The options --variant and --json do not go together.\n${USAGE}`);
  }
  // Each change must fit before the first probe, so that a typing fault stops the run at once.
  for (const changes of [sets, ...variants.map((variant) => variant.sets)]) {
    setHolds(changes.join(';')).undo();
  }
  return { midi, demos, step, base, json, jobs, sets, variants };
}

/**
 * Gives the files to probe: the MIDI files of `--midi` and the demos of `--demo`, or each demo and
 * the percussion test score with neither option.
 *
 * @param options The options.
 * @returns The files.
 * @throws Error if a demo is not known.
 */
async function probeFiles(options: ProbeOptions): Promise<ProbeFile[]> {
  const midi = options.midi.map((path) => ({
    file: basename(path),
    bytes: new Uint8Array(readFileSync(path)),
  }));
  if (options.midi.length > 0 && options.demos.length === 0) {
    return midi;
  }
  const all = await probeDemos();
  const demos =
    options.demos.length === 0
      ? all
      : options.demos.map((id) => {
          const found = all.find((demo) => demo.file === `${id}.mid`);
          if (!found) {
            throw new Error(
              `The demo ${id} is not known. The demos are: ${all.map((d) => d.file).join(', ')}.`,
            );
          }
          return found;
        });
  return [...demos.map((d) => ({ file: d.file, bytes: d.bytes })), ...midi];
}

/**
 * Calculates the boxes of the triangles of the bones of a model that do not move far, one box for
 * each bone in each band of {@link BAND_HEIGHT}, as `playerFootprint()` makes them.
 *
 * @param model The player model.
 * @returns The boxes, in the axes of the model.
 */
function bodyBoxes(model: PlayerModel): Box3[] {
  const moving = new Set(MOVING.map(boneIndex));
  const boxes = new Map<number, Box3>();
  const { positions, bones } = model.mesh;
  const corner = new Vector3();
  for (let t = 0; t < positions.length / 9; t++) {
    const bone = bones[t * 3] ?? 0;
    if (moving.has(bone)) {
      continue;
    }
    const y =
      ((positions[t * 9 + 1] ?? 0) + (positions[t * 9 + 4] ?? 0) + (positions[t * 9 + 7] ?? 0)) / 3;
    const key = bone * 100 + Math.floor(y / BAND_HEIGHT);
    const box = boxes.get(key) ?? new Box3();
    for (let k = 0; k < 3; k++) {
      box.expandByPoint(corner.fromArray(positions, t * 9 + k * 3));
    }
    boxes.set(key, box);
  }
  return [...boxes.values()];
}

/**
 * Gives the triangles of the bones of a model in the bind pose: the triangles whose first corner
 * follows one of the bones, as `posedPart()` takes them.
 *
 * @param model The player model.
 * @param bones The bones.
 * @returns The triangles.
 */
function bindTriangles(model: PlayerModel, bones: readonly BoneName[]): Triangle[] {
  const wanted = new Set(bones.map(boneIndex));
  const { positions, bones: owners } = model.mesh;
  const triangles: Triangle[] = [];
  for (let t = 0; t < positions.length / 9; t++) {
    if (wanted.has(owners[t * 3] ?? -1)) {
      const at = (k: number): Vector3 => new Vector3().fromArray(positions, t * 9 + k * 3);
      triangles.push(new Triangle(at(0), at(1), at(2)));
    }
  }
  return triangles;
}

/**
 * Finds the data of each player of a scene that the probe needs one time.
 *
 * @param scene The scene.
 * @returns The data of each player, in the order of the layout.
 */
function playerData(scene: TestScene): PlayerData[] {
  return scene.layout.players.map((place, index) => {
    const { species, instrument, kettles, support } = place.cast;
    const model = scene.models.get(species, instrument, kettles, support);
    const toStage = new Matrix4().makeRotationY(place.facing).setPosition(...place.position);
    const owners = new Set(model.mesh.bones);
    const body = bodyBoxes(model);
    return {
      index,
      label: `${species} ${instrument} (player ${index})`,
      model,
      toStage,
      fromStage: toStage.clone().invert(),
      body,
      bodyBounds: body.reduce((all, box) => all.union(box), new Box3()),
      pawLoops: {
        L: openLoops(bindTriangles(model, PAWS.L)),
        R: openLoops(bindTriangles(model, PAWS.R)),
      },
      held: { L: owners.has(boneIndex(HELD.L)), R: owners.has(boneIndex(HELD.R)) },
    };
  });
}

/**
 * Gives the closed surface of the instrument of a player that a paw or a mallet must not enter:
 * the case of the piano off the keys, or the closed shells of a percussion instrument. The other
 * instruments have no such surface, because a paw holds them.
 *
 * @param posed The posed skeleton.
 * @returns The surface, or `null`.
 */
function instrumentSurface(posed: PosedSkeleton): ClosedSurface | null {
  const family = MOTION_FAMILIES[posed.model.instrument.id];
  if (family === 'keyboard') {
    return pianoCase(posed).surface;
  }
  if (family !== 'percussion') {
    return null;
  }
  const part = posedPart(posed, ['instrument']);
  const shells = (part.closed?.() ?? [part]).filter((shell) => openLoops(shell.triangles) === 0);
  return shells.length > 0
    ? closeSurface(
        shells.flatMap((shell) => shell.triangles),
        0,
      )
    : null;
}

/**
 * Gives the corners of the triangles of a part.
 *
 * @param part The part.
 * @returns The corners.
 */
function cornersOf(part: PosedPart): Vector3[] {
  return part.triangles.flatMap((t) => [t.a, t.b, t.c]);
}

/** The corners of a held part, split by {@link shaftAndHead}. */
interface HeldCorners {
  /** The corners of the shaft, out of the ball of the head. */
  readonly shaft: Vector3[];
  /** The middle of the head, or nothing for a part with no head. */
  readonly head: Vector3[];
}

/**
 * Splits the corners of a held part into the shaft and the middle of its head: a corner within the
 * ball of the head does not count, because the head lies on its target at a strike.
 *
 * @param posed The posed skeleton.
 * @param bone The bone of the held part.
 * @param corners The posed corners of the held part.
 * @returns The corners of the shaft and the middle of the head, or all corners with no head.
 */
function shaftAndHead(
  posed: PosedSkeleton,
  bone: (typeof HELD)['L' | 'R'],
  corners: readonly Vector3[],
): HeldCorners {
  const target = posed.model.instrument.targets.find(
    (t) => t.kind === 'mallet-head' && t.bone === bone,
  );
  if (!target) {
    return { shaft: [...corners], head: [] };
  }
  const middle = new Vector3(...posedPiecePoint(posed, { bone, at: target.from }));
  const near = corners.map((c) => c.distanceTo(middle)).filter((d) => d < BALL_REACH);
  const radius = near.length > 0 ? Math.max(...near) : 0;
  return {
    shaft: corners.filter((c) => c.distanceTo(middle) > radius + 0.005),
    head: [middle],
  };
}

/**
 * Moves a posed part into the stage axes.
 *
 * @param part The part, in the axes of the model.
 * @param toStage The place of the model on the stage.
 * @returns The part on the stage.
 */
function onStage(part: PosedPart, toStage: Matrix4): PosedPart {
  const box = new Box3();
  const triangles = part.triangles.map((t) => {
    const moved = new Triangle(
      t.a.clone().applyMatrix4(toStage),
      t.b.clone().applyMatrix4(toStage),
      t.c.clone().applyMatrix4(toStage),
    );
    box.expandByPoint(moved.a).expandByPoint(moved.b).expandByPoint(moved.c);
    return moved;
  });
  return { triangles, box };
}

/**
 * Gives the depth of the deepest of some points of the stage in the body boxes of a player: the
 * distance to the nearest face of a box that holds the point.
 *
 * @param points The points, in the stage axes.
 * @param player The player.
 * @returns The depth, in meters, or 0 when no point is in a box.
 */
function boxDepth(points: readonly Vector3[], player: PlayerData): number {
  let deepest = 0;
  const local = new Vector3();
  for (const point of points) {
    local.copy(point).applyMatrix4(player.fromStage);
    if (!player.bodyBounds.containsPoint(local)) {
      continue;
    }
    for (const box of player.body) {
      if (!box.containsPoint(local)) {
        continue;
      }
      const depth = Math.min(
        local.x - box.min.x,
        box.max.x - local.x,
        local.y - box.min.y,
        box.max.y - local.y,
        local.z - box.min.z,
        box.max.z - local.z,
      );
      deepest = Math.max(deepest, depth);
    }
  }
  return deepest;
}

/**
 * Measures one player at one sample: the paw in paw, the held across, the in instrument, and the
 * under floor measures.
 *
 * @param player The player.
 * @param posed The posed skeleton.
 * @param song The song time.
 * @param worst The measures to add to.
 */
function measurePlayer(
  player: PlayerData,
  posed: PosedSkeleton,
  song: number,
  worst: Readonly<Record<MeasureName, Worst>>,
): void {
  const paw = { L: posedPart(posed, PAWS.L), R: posedPart(posed, PAWS.R) };
  const held = {
    L: player.held.L ? posedPart(posed, [HELD.L]) : null,
    R: player.held.R ? posedPart(posed, [HELD.R]) : null,
  };

  // The closed surfaces of the paws cost more than the rest, so only paws whose boxes meet get
  // them.
  let pawDepth = 0;
  if (paw.L.box.intersectsBox(paw.R.box)) {
    const closedL = closedPart(posed, PAWS.L, player.pawLoops.L);
    const closedR = closedPart(posed, PAWS.R, player.pawLoops.R);
    pawDepth = Math.max(
      closedDepth(cornersOf(paw.L), closedR).depth,
      closedDepth(cornersOf(paw.R), closedL).depth,
    );
  }
  if (worst['paw in paw'].add(pawDepth, player.label, song)) {
    worst['paw in paw'].over++;
  }

  const crosses = (['L', 'R'] as const).some((side) => {
    const own = held[side];
    const other = side === 'L' ? 'R' : 'L';
    const otherHeld = held[other];
    return (
      own !== null &&
      (partDistance(own, paw[other], CONTACT) === 0 ||
        (otherHeld !== null && partDistance(own, otherHeld, CONTACT) === 0))
    );
  });
  worst['held across'].add(crosses ? 1 : 0, player.label, song);
  if (crosses) {
    worst['held across'].over++;
  }

  const surface = instrumentSurface(posed);
  if (surface) {
    const points = [...cornersOf(paw.L), ...cornersOf(paw.R)];
    for (const side of ['L', 'R'] as const) {
      const part = held[side];
      if (part) {
        const { shaft, head } = shaftAndHead(posed, HELD[side], cornersOf(part));
        points.push(...shaft, ...head);
      }
    }
    if (worst['in instrument'].add(closedDepth(points, surface).depth, player.label, song)) {
      worst['in instrument'].over++;
    }
  }

  const low = posedPart(posed, ['instrument', HELD.L, HELD.R]);
  const under = low.triangles.length > 0 ? Math.max(0, -low.box.min.y) : 0;
  if (worst['under floor'].add(under, player.label, song)) {
    worst['under floor'].over++;
  }
}

/**
 * Probes one file over its whole song.
 *
 * @param file The file.
 * @param step The step of the samples, in seconds.
 * @returns The results of the file.
 */
function probeFile(file: ProbeFile, step: number): FileResult {
  const scene = sceneOf(file.bytes);
  const players = playerData(scene);
  const worst: Record<MeasureName, Worst> = {
    seats: new Worst(0),
    'paw in paw': new Worst(CONTACT),
    'held across': new Worst(0),
    'in instrument': new Worst(CONTACT),
    'under floor': new Worst(FLOOR_LIMIT),
    'between players': new Worst(0),
  };

  // The footprints of the layout: each pair that overlaps.
  const obstacles = layoutObstacles(scene.layout, scene.models);
  const pairs: [Obstacle, Obstacle][] = [];
  for (const [i, a] of obstacles.entries()) {
    for (const b of obstacles.slice(i + 1)) {
      if (obstaclesTouch(a, b, 0)) {
        pairs.push([a, b]);
      }
    }
  }
  worst.seats.value = pairs.length;
  worst.seats.over = pairs.length;
  worst.seats.who =
    pairs.length > 0 ? pairs.map(([a, b]) => `${a.label} | ${b.label}`).join('; ') : null;

  // The pairs of players near enough to touch.
  const near: [PlayerData, PlayerData][] = [];
  for (const [i, a] of players.entries()) {
    for (const b of players.slice(i + 1)) {
      const oa = obstacleOfPlayer(obstacles, scene, a);
      const ob = obstacleOfPlayer(obstacles, scene, b);
      if (oa && ob && obstaclesTouch(oa, ob, NEAR)) {
        near.push([a, b]);
      }
    }
  }

  const buffer = createScenePose(scene.plan);
  const audible = allAudible(scene.score);
  let samples = 0;
  for (let song = 0; song <= scene.score.durationSec; song += step) {
    samples++;
    const [, wall, transport] = playSample(scene, song);
    const pose = poseAt(scene.plan, song, wall, transport, audible, buffer);
    const staged = new Map<number, StagedPlayer>();
    for (const player of players) {
      const own = pose.players[player.index];
      if (!own) {
        continue;
      }
      const posed = poseSkeleton(player.model, own);
      measurePlayer(player, posed, song, worst);
      if (near.some(([a, b]) => a === player || b === player)) {
        const moving = onStage(posedPart(posed, MOVING), player.toStage);
        staged.set(player.index, { moving, corners: cornersOf(moving) });
      }
    }
    for (const [a, b] of near) {
      const sa = staged.get(a.index);
      const sb = staged.get(b.index);
      if (!sa || !sb) {
        continue;
      }
      const touch = partDistance(sa.moving, sb.moving, CONTACT) === 0;
      const depth = Math.max(boxDepth(sa.corners, b), boxDepth(sb.corners, a));
      const value = touch ? Math.max(depth, 1e-3) : depth;
      if (worst['between players'].add(value, `${a.label} | ${b.label}`, song) || touch) {
        worst['between players'].over++;
      }
    }
  }

  const result = (name: MeasureName): MeasureResult => {
    const w = worst[name];
    const share = w.over / Math.max(1, samples);
    return {
      value: name === 'held across' ? share : w.value,
      share: name === 'seats' ? w.over : share,
      limit: w.limit,
      who: w.who,
      at: name === 'seats' ? null : w.at,
    };
  };
  const measures: Record<MeasureName, MeasureResult> = {
    seats: result('seats'),
    'paw in paw': result('paw in paw'),
    'held across': result('held across'),
    'in instrument': result('in instrument'),
    'under floor': result('under floor'),
    'between players': result('between players'),
  };
  return { file: file.file, players: players.length, samples, measures };
}

/**
 * Finds the footprint of a player among the obstacles of the layout.
 *
 * @param obstacles The obstacles of the layout (`layoutObstacles()`).
 * @param scene The scene.
 * @param player The player.
 * @returns The obstacle, or `undefined`.
 */
function obstacleOfPlayer(
  obstacles: readonly Obstacle[],
  scene: TestScene,
  player: PlayerData,
): Obstacle | undefined {
  const { cast } = scene.layout.players[player.index] ?? {};
  if (!cast) {
    return undefined;
  }
  const label = `${cast.species} ${cast.instrument} (seat ${cast.seatIndex}, player ${cast.player})`;
  return obstacles.find((o) => o.label === label);
}

/**
 * Tells if a measure clips: more than {@link SHARE_LIMIT} of the samples over its limit, or one
 * pair of footprints that overlap.
 *
 * @param name The measure.
 * @param result The result.
 * @returns True if it clips.
 */
export function clips(name: MeasureName, result: MeasureResult): boolean {
  return name === 'seats' ? result.share > 0 : result.share > SHARE_LIMIT;
}

/**
 * Writes the value of a measure: a depth in centimeters, a share of the samples, or a count of
 * pairs.
 *
 * @param name The measure.
 * @param result The result.
 * @returns The text, such as `4.7 cm (96.0%)`.
 */
function valueText(name: MeasureName, result: MeasureResult): string {
  if (name === 'seats') {
    return `${result.share} pairs`;
  }
  const share = `${(100 * result.share).toFixed(1)}%`;
  const text = name === 'held across' ? share : `${(100 * result.value).toFixed(1)} cm, ${share}`;
  return clips(name, result) ? `${text} CLIP` : text;
}

/**
 * Writes the worst sample of a measure.
 *
 * @param result The result.
 * @returns The text, such as `polar-bear piano (player 1) at 29.50 s`, or `-`.
 */
function worstText(result: MeasureResult): string {
  if (result.who === null) {
    return '-';
  }
  return result.at === null ? result.who : `${result.who} at ${result.at.toFixed(2)} s`;
}

/**
 * Writes the tables of the results: one row for each file with the value of each measure, and the
 * worst sample of each measure that clips. With the results of a commit, each value gives the value
 * of the commit in parentheses.
 *
 * @param tree The results of the working tree.
 * @param base The results of the commit, or `null`.
 * @param label The name of the commit, or `null`.
 * @returns The lines.
 */
export function outputLines(
  tree: ProbeOutput,
  base: ProbeOutput | null,
  label: string | null,
): string[] {
  const lines = [
    `Clip probe of ${tree.files.length} files at steps of ${tree.step} s${label ? `, with ${label} in parentheses` : ''}. A depth gives the share of the samples over ${(100 * CONTACT).toFixed(1)} cm (${(100 * FLOOR_LIMIT).toFixed(1)} cm under the floor). A measure clips when the share is over ${(100 * SHARE_LIMIT).toFixed(0)}%.`,
    SCOPE,
    '',
    `| File | Players | Samples | ${MEASURES.join(' | ')} | Verdict |${base ? ' Base |' : ''}`,
    `|---|---|---|${MEASURES.map(() => '---|').join('')}---|${base ? '---|' : ''}`,
  ];
  const { rows, details } = tableRows(tree, base, null);
  lines.push(...rows);
  if (details.length > 0) {
    lines.push('', 'The worst sample of each measure that clips:', ...details);
  }
  return lines;
}

/**
 * Writes the table of the variants of `--variant`: the hold changes of each variant, then one
 * table with a block of rows for each variant, as {@link outputLines} writes the rows, and the
 * worst sample of each measure that clips.
 *
 * @param blocks The name, the changes, and the results of each variant.
 * @param base The results of the commit, or `null`.
 * @param label The name of the commit, or `null`.
 * @returns The lines.
 */
export function variantLines(
  blocks: readonly { readonly variant: ClipVariant; readonly output: ProbeOutput }[],
  base: ProbeOutput | null,
  label: string | null,
): string[] {
  const [first] = blocks;
  const lines = [
    `Clip probe of ${first?.output.files.length ?? 0} files in ${blocks.length} variants at steps of ${first?.output.step ?? 0} s${label ? `, with ${label} in parentheses` : ''}. A depth gives the share of the samples over ${(100 * CONTACT).toFixed(1)} cm (${(100 * FLOOR_LIMIT).toFixed(1)} cm under the floor). A measure clips when the share is over ${(100 * SHARE_LIMIT).toFixed(0)}%.`,
    SCOPE,
    '',
    ...blocks.map(({ variant }) => `- ${variant.name}: ${variant.sets.join(';') || 'no change'}`),
    '',
    `| Variant | File | Players | Samples | ${MEASURES.join(' | ')} | Verdict |${base ? ' Base |' : ''}`,
    `|---|---|---|---|${MEASURES.map(() => '---|').join('')}---|${base ? '---|' : ''}`,
  ];
  const details: string[] = [];
  for (const { variant, output } of blocks) {
    const table = tableRows(output, base, variant.name);
    lines.push(...table.rows);
    details.push(...table.details);
  }
  if (details.length > 0) {
    lines.push('', 'The worst sample of each measure that clips:', ...details);
  }
  return lines;
}

/** The rows of a table of {@link outputLines} and the worst sample of each measure that clips. */
interface TableRows {
  /** The rows of the table, one for each file. */
  readonly rows: readonly string[];
  /** The worst sample of each measure that clips, one line each. */
  readonly details: readonly string[];
}

/**
 * Writes the rows of the table of {@link outputLines}: one row for each file, and the worst sample
 * of each measure that clips.
 *
 * @param tree The results of the working tree.
 * @param base The results of the commit, or `null`.
 * @param variant The name of the variant of the first cell of each row, or `null` for no such
 *   cell.
 * @returns The rows and the details.
 */
function tableRows(tree: ProbeOutput, base: ProbeOutput | null, variant: string | null): TableRows {
  const lines: string[] = [];
  const details: string[] = [];
  const first = variant === null ? '' : ` ${variant} |`;
  const lead = variant === null ? '' : `${variant}, `;
  for (const file of tree.files) {
    const old = base?.files.find((f) => f.file === file.file) ?? null;
    const cells = MEASURES.map((name) => {
      const result = file.measures[name];
      if (clips(name, result)) {
        details.push(`- ${lead}${file.file}, ${name}: ${worstText(result)}`);
      }
      const before = old ? ` (${valueText(name, old.measures[name])})` : '';
      return `${valueText(name, result)}${before}`;
    });
    const verdict = (f: FileResult): string =>
      MEASURES.some((name) => clips(name, f.measures[name])) ? 'CLIP' : 'PASS';
    const baseCell = base ? ` ${old ? verdict(old) : '-'} |` : '';
    lines.push(
      `|${first} ${file.file} | ${file.players} | ${file.samples} | ${cells.join(' | ')} | ${verdict(file)} |${baseCell}`,
    );
  }
  return { rows: lines, details };
}

/**
 * Gives the option of the command line that selects one file in a child process.
 *
 * @param file The file.
 * @param options The options.
 * @returns The option and its value.
 */
function fileOption(file: ProbeFile, options: ProbeOptions): string[] {
  const path = options.midi.find((m) => basename(m) === file.file);
  return path ? ['--midi', path] : ['--demo', file.file];
}

/**
 * Probes the files of the options: in this process for one file or one job, else in child
 * processes of one file each, at most `--jobs` at the same time.
 *
 * @param options The options.
 * @returns The output.
 * @throws Error if a child fails.
 */
async function runProbe(options: ProbeOptions): Promise<ProbeOutput> {
  const files = await probeFiles(options);
  if (files.length <= 1 || options.jobs <= 1) {
    const changes = options.sets.length > 0 ? setHolds(options.sets.join(';')) : null;
    try {
      return {
        version: FORMAT,
        step: options.step,
        files: files.map((f) => probeFile(f, options.step)),
      };
    } finally {
      changes?.undo();
    }
  }
  const results = await withTempFolder(
    async (dir) => {
      const done: FileResult[] = [];
      for (let first = 0; first < files.length; first += options.jobs) {
        const batch = files.slice(first, first + options.jobs);
        const runs = batch.map((file, i) => ({
          command: process.execPath,
          args: [
            join(ROOT, 'tools', 'clip-probe.ts'),
            ...fileOption(file, options),
            ...options.sets.flatMap((set) => ['--set', set]),
            '--step',
            String(options.step),
            '--json',
            join(dir, `${first + i}.json`),
          ],
          cwd: ROOT,
        }));
        const ends = await runChildren(runs);
        for (const [i, end] of ends.entries()) {
          if (end.status !== 0) {
            throw new Error(`The probe of ${batch[i]?.file ?? '?'} failed: ${end.errors}`);
          }
          // SAFETY: the child writes the --json output of this script.
          const output = JSON.parse(
            readFileSync(join(dir, `${first + i}.json`), 'utf8'),
          ) as ProbeOutput;
          done.push(...output.files);
        }
      }
      return done;
    },
    { prefix: 'clip-probe-' },
  );
  return { version: FORMAT, step: options.step, files: results };
}

/**
 * Runs each variant of `--variant` as one child, one after the other, each with its `--set`
 * options alone and the `--jobs` of the run, and the commit of `--base` one time before them
 * (`probeRef()`). Then it writes one table ({@link variantLines}).
 *
 * @param options The options, with variants.
 * @param child The arguments of each child: the files, the step, and the jobs, with absolute paths.
 */
async function checkVariants(options: ProbeOptions, child: readonly string[]): Promise<void> {
  const label = options.base ? `${options.base} (${shortHash(options.base)})` : null;
  const base = options.base
    ? readOutput(await probeRef(options.base, 'clip-probe.ts', child, { prefix: 'clip-probe-' }))
    : null;
  const blocks: { readonly variant: ClipVariant; readonly output: ProbeOutput }[] = [];
  for (const variant of options.variants) {
    const text = await withTempFolder(
      async (dir) => {
        const file = join(dir, 'tree.json');
        const sets = variant.sets.flatMap((set) => ['--set', set]);
        await runChild(
          process.execPath,
          [join(ROOT, 'tools', 'clip-probe.ts'), ...child, ...sets, '--json', file],
          ROOT,
        );
        return readFileSync(file, 'utf8');
      },
      { prefix: 'clip-probe-' },
    );
    blocks.push({ variant, output: readOutput(text) });
  }
  console.log(variantLines(blocks, base, label).join('\n'));
}

/**
 * Writes the hold changes of `--set` for the working tree, or nothing with no change.
 *
 * @param sets The changes of each `--set`.
 */
function printChanges(sets: readonly string[]): void {
  if (sets.length === 0) {
    return;
  }
  const changes = setHolds(sets.join(';'));
  changes.undo();
  console.log(`The working tree takes the hold changes ${changes.text}.`);
}

/**
 * Reads the JSON text of a child.
 *
 * @param text The text of the `--json` output of this script.
 * @returns The output.
 */
function readOutput(text: string): ProbeOutput {
  // SAFETY: the text comes from the --json output of this script in a child process.
  return JSON.parse(text) as ProbeOutput;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = readOptions(args);
  // The paths of --midi are absolute, so that the child on the commit reads the same files.
  const own = withoutOptions(args, ['--base', '--json', '--midi', '--set', '--variant']);
  const child = [...own, ...options.midi.flatMap((path) => ['--midi', path])];
  const sets = options.sets.flatMap((set) => ['--set', set]);
  if (options.variants.length > 0) {
    await checkVariants(options, child);
  } else if (options.base) {
    const label = `${options.base} (${shortHash(options.base)})`;
    printChanges(options.sets);
    const texts = await probeBeside(
      options.base,
      'clip-probe.ts',
      { base: child, tree: [...child, ...sets] },
      { prefix: 'clip-probe-' },
    );
    // SAFETY: each text comes from the --json output of this script in a child process.
    const base = JSON.parse(texts.base) as ProbeOutput;
    // SAFETY: as above.
    const tree = JSON.parse(texts.tree) as ProbeOutput;
    console.log(outputLines(tree, base, label).join('\n'));
    if (options.json) {
      writeFileSync(options.json, `${JSON.stringify({ base, tree }, null, 1)}\n`);
    }
  } else {
    if (!options.json) {
      printChanges(options.sets);
    }
    const output = await runProbe(options);
    if (options.json) {
      writeFileSync(options.json, `${JSON.stringify(output, null, 1)}\n`);
    } else {
      console.log(outputLines(output, null, null).join('\n'));
    }
  }
}
