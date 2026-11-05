import { Quaternion, Vector3 } from 'three';

import { placePoint } from '../src/models/instruments/hold.ts';
import { STRING_SCALES, VIOLIN } from '../src/models/instruments/strings.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import { SPECIES, SPECIES_IDS, instrumentScale, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { toVec3 } from '../src/models/tuples.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { SPECIES_HOLDS, bowedRig, holdOf, playingFrames } from '../src/pose/bowed-rig.ts';
import { createBowPlaces, instrumentAt } from '../src/pose/bowed.ts';
import { poseShoulder } from '../src/pose/ik.ts';
import {
  SPECIES_WIND_HOLDS,
  WIND_HOLDS,
  windGrips,
  windHoldOf,
  windRig,
} from '../src/pose/winds.ts';
import type { WindInstrument } from '../src/pose/winds.ts';
import {
  animalHandRig,
  glbAnimal,
  runTool,
  speciesAnimal,
  takeGlb,
  withGlbBody,
} from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { armReach, parseConfig } from './rig-mesh.ts';
import {
  PERCUSSION_INSTRUMENTS,
  isPercussion,
  strikeReach,
  strikeReachLines,
} from './strike-reach.ts';
import type { PercussionInstrument } from '../src/pose/percussion-rig.ts';

/** An instrument that the player holds under the chin. */
export type ChinInstrument = 'violin' | 'viola';

/**
 * An instrument that `pnpm hold-reach` measures: an instrument under the chin, a wind, or a
 * percussion instrument.
 */
export type ReachInstrument = ChinInstrument | WindInstrument | PercussionInstrument;

/** The instruments under the chin. */
export const CHIN_INSTRUMENTS = ['violin', 'viola'] as const satisfies readonly ChinInstrument[];

/** The wind instruments, in the order of `WIND_HOLDS`. */
export const WIND_INSTRUMENTS: readonly WindInstrument[] = Object.keys(WIND_HOLDS).filter(
  (id): id is WindInstrument => Object.hasOwn(WIND_HOLDS, id),
);

/** The instruments of `--instrument`, in the order of the usage. */
export const REACH_INSTRUMENTS: readonly ReachInstrument[] = [
  ...CHIN_INSTRUMENTS,
  ...WIND_INSTRUMENTS,
  ...PERCUSSION_INSTRUMENTS,
];

/**
 * Tells if an instrument of `pnpm hold-reach` is a wind instrument.
 *
 * @param instrument The instrument.
 * @returns True for a key of `WIND_HOLDS`.
 */
export function isWind(instrument: ReachInstrument): instrument is WindInstrument {
  return Object.hasOwn(WIND_HOLDS, instrument);
}

/** A support of the player that `pnpm hold-reach` takes. */
export type ReachSupport = 'chair' | 'stand';

/**
 * The total lengths of the smallest and the largest violin of the size chart of a violin teacher,
 * in meters.
 */
export const REAL_VIOLINS = { smallest: 0.33, largest: 0.59 } as const;

/** The reach of the arms of a player against its instrument under the chin, in meters. */
export interface HoldReach {
  /**
   * The arm of each side along its joints: from the shoulder joint over the elbow and the wrist
   * to the middle of the palm.
   */
  readonly arms: Readonly<Record<'L' | 'R', number>>;
  /** The length of the instrument, from the tail end to the scroll. */
  readonly length: number;
  /**
   * The scale of the instrument, as a factor of the instrument of the app. For a violin, it is
   * the `violinScale` of the species.
   */
  readonly scale: number;
  /** The distance from the left shoulder joint to the scroll, in the playing pose of the hold. */
  readonly scroll: number;
  /** The reached part of the fingerboard, from 0 at the nut to 1 at the end (`stopRange`). */
  readonly stopRange: readonly [low: number, high: number];
  /** The reached part of the bow hair, from the frog end (`bowRange`). */
  readonly bowRange: readonly [low: number, high: number];
  /** The length of the bow hair. */
  readonly hairLength: number;
  /**
   * The factor of the length that puts the scroll in the middle of the palm of the extended left
   * arm, the rule of a violin shop. It is `null` when no length does.
   */
  readonly ruleFactor: number | null;
}

/**
 * Solves the rule of a violin shop on a line: the instrument grows from its tail end, which stays
 * in place, and its scroll comes to the middle of the palm of the extended left arm. The scroll
 * is then `arm` from the shoulder joint.
 *
 * @param tail The tail end, in the playing pose.
 * @param scroll The scroll at the current length, in the playing pose.
 * @param shoulder The left shoulder joint, in the playing pose.
 * @param arm The arm from the shoulder joint to the middle of the palm.
 * @returns The largest factor `f > 0` of the current length that puts the scroll at
 *   `tail + f (scroll - tail)` at the distance `arm` from the shoulder joint, or `null` when no
 *   factor does.
 */
export function ruleFactor(tail: Vec3, scroll: Vec3, shoulder: Vec3, arm: number): number | null {
  const d = new Vector3(...scroll).sub(new Vector3(...tail));
  const e = new Vector3(...tail).sub(new Vector3(...shoulder));
  const a = d.lengthSq();
  const b = d.dot(e);
  const disc = b * b - a * (e.lengthSq() - arm * arm);
  if (a === 0 || disc < 0) {
    return null;
  }

  const factor = (-b + Math.sqrt(disc)) / a;
  return factor > 0 ? factor : null;
}

/**
 * Gives the length of an arm of a player along its joints: from the shoulder joint over the elbow
 * and the wrist to the middle of the palm. The rule of a violin shop measures the extended arm.
 *
 * @param model The player.
 * @param side The side of the arm.
 * @returns The length, in meters.
 */
export function armLength(model: PlayerModel, side: 'L' | 'R'): number {
  const joint = (bone: 'upperArm' | 'forearm' | 'hand'): Vector3 =>
    new Vector3(...(model.skeleton.positions[boneIndex(`${bone}${side}`)] ?? [0, 0, 0]));
  const palm = new Vector3(...(side === 'L' ? model.body.palmL : model.body.palmR));
  return (
    joint('upperArm').distanceTo(joint('forearm')) +
    joint('forearm').distanceTo(joint('hand')) +
    joint('hand').distanceTo(palm)
  );
}

/**
 * Measures the reach of the arms of a species against its violin or viola in the playing pose of
 * its hold (`holdOf()`), with no idle motion.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param support The support of the player.
 * @returns The reach.
 * @throws Error if the instrument has no fingerboard.
 */
export function holdReach(
  species: SpeciesId,
  instrument: ChinInstrument,
  support: ReachSupport,
): HoldReach {
  const { model, rig, size, tail, scroll, shoulder } = posedViolin(species, instrument, support);
  const arms = { L: armLength(model, 'L'), R: armLength(model, 'R') };

  return {
    arms,
    length: VIOLIN.length * size,
    scale: size / STRING_SCALES[instrument],
    scroll: scroll.distanceTo(shoulder),
    stopRange: rig.stopRange,
    bowRange: rig.bowRange,
    hairLength: rig.hairLength,
    ruleFactor: ruleFactor(toVec3(tail), toVec3(scroll), toVec3(shoulder), arms.L),
  };
}

/** The player with its instrument under the chin, in the playing pose of its hold. */
interface PosedViolin {
  /** The player. */
  readonly model: PlayerModel;
  /** The rig of the hold. */
  readonly rig: ReturnType<typeof bowedRig>;
  /** The size of the piece of the instrument, as a factor of `VIOLIN`. */
  readonly size: number;
  /** The tail end, in the playing pose. */
  readonly tail: Vector3;
  /** The scroll, in the playing pose. */
  readonly scroll: Vector3;
  /** The left shoulder joint, in the playing pose. */
  readonly shoulder: Vector3;
}

/**
 * Poses a species with its violin or viola in the playing pose of its hold (`holdOf()`), with no
 * idle motion.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param support The support of the player.
 * @returns The player, the rig, the size of the instrument, and the posed points.
 * @throws Error if the instrument has no fingerboard.
 */
function posedViolin(
  species: SpeciesId,
  instrument: ChinInstrument,
  support: ReachSupport,
): PosedViolin {
  const model = buildPlayer(species, instrument, 4, support);
  const rig = bowedRig(model, instrument, holdOf(species, instrument));
  const frames = playingFrames(rig);
  const { place } = createBowPlaces();
  instrumentAt(rig, frames, 1, place);
  const posed = (at: Vec3): Vector3 =>
    new Vector3(...placePoint(model.pieces, { bone: 'instrument', at }))
      .sub(new Vector3(...rig.pivot))
      .applyQuaternion(place.rotation)
      .add(place.pivot);

  // The piece of the instrument scales around its origin, the tail end. The nut of the
  // fingerboard thus gives the size of the piece.
  const board = model.instrument.targets.find((target) => target.kind === 'fingerboard');
  if (!board) {
    throw new Error(`The ${instrument} has no fingerboard.`);
  }
  const size = board.from[0] / VIOLIN.nut;
  const tail = posed([0, 0, 0]);
  const scroll = posed([VIOLIN.length * size, VIOLIN.stringHeight * size, 0]);
  const shoulder = poseShoulder(rig.armL, frames.chest, rig.chestBind, new Quaternion()).position;
  return { model, rig, size, tail, scroll, shoulder };
}

/**
 * Measures the reach with another `violinScale` of the species, in memory. The source files do
 * not change, and the old value comes back after the measure.
 *
 * @param species The species.
 * @param support The support of the player.
 * @param scale The scale of the violin and its bow.
 * @returns The reach of the violin at the scale.
 */
export function violinReachAt(species: SpeciesId, support: ReachSupport, scale: number): HoldReach {
  const params: SpeciesParams = SPECIES[species];
  const had = Object.hasOwn(params, 'violinScale');
  const old = params.violinScale;
  Reflect.set(params, 'violinScale', scale);
  try {
    return holdReach(species, 'violin', support);
  } finally {
    if (had) {
      Reflect.set(params, 'violinScale', old);
    } else {
      Reflect.deleteProperty(params, 'violinScale');
    }
  }
}

/**
 * Gives the distance from the shoulder joint to the scroll of a longer or shorter instrument: the
 * tail end stays in its place, and the instrument grows along its axis.
 *
 * @param tail The tail end, in the playing pose.
 * @param scroll The scroll at the current length, in the playing pose.
 * @param shoulder The left shoulder joint, in the playing pose.
 * @param factor The factor of the current length.
 * @returns The distance from the shoulder joint to `tail + factor (scroll - tail)`.
 */
export function scrollReach(tail: Vec3, scroll: Vec3, shoulder: Vec3, factor: number): number {
  return new Vector3(...scroll)
    .sub(new Vector3(...tail))
    .multiplyScalar(factor)
    .add(new Vector3(...tail))
    .distanceTo(new Vector3(...shoulder));
}

/**
 * Gives the factor of the upper arm and the forearm that gives an arm a reach: the paw keeps its
 * size, as the arm factor of `pnpm rig-mesh` does.
 *
 * @param reach The reach to give, from the shoulder joint to the middle of the palm.
 * @param arm The current reach of the arm.
 * @param paw The part of the arm from the wrist to the middle of the palm.
 * @returns The factor.
 */
export function armFactorFor(reach: number, arm: number, paw: number): number {
  return (reach - paw) / (arm - paw);
}

/** The reach that one size of the violin needs in the hold of a species. */
export interface SizeReach {
  /** The scale of the violin, as a factor of the violin of the app (`violinScale`). */
  readonly scale: number;
  /** The length of the violin from the tail end to the scroll, in meters. */
  readonly length: number;
  /**
   * The reach that puts the scroll in the middle of the palm of the extended left arm: the
   * distance from the left shoulder joint to the scroll, with the tail end in its place in the
   * playing pose and the violin longer or shorter along its axis ({@link scrollReach}).
   */
  readonly reach: number;
  /**
   * The distance from the left shoulder joint to the scroll with the player rebuilt at the scale,
   * as a check of `reach`.
   */
  readonly rebuilt: number;
  /** The factor of the current upper arm and forearm that gives the reach ({@link armFactorFor}). */
  readonly factor: number;
  /**
   * The arm factor of the mesh rig of the species (`pnpm rig-mesh`) that gives the reach, or
   * `null` with no config of a mesh rig.
   */
  readonly rigFactor: number | null;
}

/** The arm of a mesh rig, in the meters of the app. */
export interface RigArm {
  /** The config file, relative to the repository. */
  readonly file: string;
  /** The arm factor of the config. */
  readonly armFactor: number;
  /** The reach of the left arm with the factor 1. */
  readonly short: number;
  /** The part of the left arm from the wrist to the middle of the palm. */
  readonly paw: number;
}

/**
 * Reads the arm of the mesh rig of a species from `tools/mesh-rigs/<animal>.json`.
 *
 * @param species The species.
 * @returns The arm, or `null` when the species has no mesh rig config next to this script, as in
 *   the copy of `--glb`, or when it has a hand rig, whose joints live only in its `.blend`.
 */
function rigArm(species: SpeciesId): RigArm | null {
  const animal = speciesAnimal(species);
  const path = animal ? join(import.meta.dirname, 'mesh-rigs', `${animal}.json`) : '';
  if (!animal || !existsSync(path) || animalHandRig(animal) !== null) {
    return null;
  }
  const config = parseConfig(readFileSync(path, 'utf8'));
  return {
    file: `tools/mesh-rigs/${animal}.json`,
    armFactor: config.armFactor,
    short: armReach(config, 'L', 1),
    paw: armReach(config, 'L', 0),
  };
}

/** The reach that each size of the violin needs in the hold of a species. */
export interface SizeReport {
  /** The reach of the left arm now, from the shoulder joint to the middle of the palm. */
  readonly arm: number;
  /** The part of the left arm from the wrist to the middle of the palm. */
  readonly paw: number;
  /** The scale of the violin now (`violinScale`). */
  readonly scale: number;
  /** The length of the violin now, in meters. */
  readonly length: number;
  /** The arm of the mesh rig of the species, or `null`. */
  readonly rig: RigArm | null;
  /** The reach of each size, in the order of the scales. */
  readonly sizes: readonly SizeReach[];
}

/**
 * Measures the reach and the arm factor that each size of the violin needs in the hold of a
 * species (`--size`). The violin grows from its tail end along its axis in the playing pose, and
 * its scroll comes to the middle of the palm of the extended left arm, the rule of a violin shop.
 * A check rebuilds the player at each scale. With `--glb`, the body of the file gives the arm, so
 * the factor of the current arm is 1 at the size that the arm of the file fits.
 *
 * @param species The species.
 * @param support The support of the player.
 * @param scales The scales of the violin (`violinScale`).
 * @returns The report.
 */
export function sizeReach(
  species: SpeciesId,
  support: ReachSupport,
  scales: readonly number[],
): SizeReport {
  const { model, size, tail, scroll, shoulder } = posedViolin(species, 'violin', support);
  const arm = armLength(model, 'L');
  const paw = new Vector3(
    ...(model.skeleton.positions[boneIndex('handL')] ?? [0, 0, 0]),
  ).distanceTo(new Vector3(...model.body.palmL));
  const scale = size / STRING_SCALES.violin;
  const rig = rigArm(species);
  const sizes: SizeReach[] = scales.map((wanted) => {
    const reach = scrollReach(toVec3(tail), toVec3(scroll), toVec3(shoulder), wanted / scale);
    return {
      scale: wanted,
      length: (VIOLIN.length * size * wanted) / scale,
      reach,
      rebuilt: violinReachAt(species, support, wanted).scroll,
      factor: armFactorFor(reach, arm, paw),
      rigFactor: rig ? armFactorFor(reach, rig.short, rig.paw) : null,
    };
  });
  return { arm, paw, scale, length: VIOLIN.length * size, rig, sizes };
}

/**
 * Writes the report of `--size` ({@link sizeReach}).
 *
 * @param species The species.
 * @param support The support of the player.
 * @param scales The scales of the violin (`violinScale`).
 * @returns The lines.
 */
export function sizeReachLines(
  species: SpeciesId,
  support: ReachSupport,
  scales: readonly number[],
): string[] {
  const { arm, paw, scale, length, rig, sizes } = sizeReach(species, support, scales);
  const m = (value: number): string => `${value.toFixed(3)} m`;
  return [
    `Violin sizes of ${species} on the ${support} (--size): the tail end stays in its place in the playing pose, and the violin grows along its axis.`,
    `  Arm L now ${m(arm)}, with a paw of ${m(paw)} from the wrist to the middle of the palm. Violin now ${m(length)}, scale ${scale.toFixed(3)}.`,
    rig
      ? `  Mesh rig ${rig.file}: arm factor ${rig.armFactor}, arm L ${m(rig.short)} with the factor 1, paw ${m(rig.paw)}.`
      : '  No config of a mesh rig next to the script (the copy of --glb holds none), so the table gives only the factor of the current arm: 1 at the size that the arm fits.',
    '',
    '| Scale | Violin m | Reach m | Rebuilt m | Arm factor of the rig | Factor of the current arm |',
    '|---:|---:|---:|---:|---:|---:|',
    ...sizes.map(
      (row) =>
        `| ${row.scale.toFixed(3)} | ${row.length.toFixed(3)} | ${row.reach.toFixed(3)} | ${row.rebuilt.toFixed(3)} | ${row.rigFactor === null ? '-' : row.rigFactor.toFixed(3)} | ${row.factor.toFixed(3)} |`,
    ),
  ];
}

/** The arguments of `pnpm hold-reach` with the option `--size` taken out. */
export interface SizeArgs {
  /** The scales of `--size`, or none with no option. */
  readonly sizes: readonly number[];
  /** The other arguments, in their order. */
  readonly rest: readonly string[];
}

/**
 * Takes the option `--size <scale>[,<scale>]...` out of the arguments of `pnpm hold-reach`.
 *
 * @param args The arguments.
 * @returns The scales and the other arguments.
 * @throws Error if the option has no value, comes more than one time, or has a scale that is not
 *   a number above 0.
 */
export function takeSizes(args: readonly string[]): SizeArgs {
  const at = args.indexOf('--size');
  if (at < 0) {
    return { sizes: [], rest: args };
  }

  const text = args[at + 1];
  const rest = args.filter((...[, i]) => i !== at && i !== at + 1);
  if (text === undefined || text.startsWith('--') || rest.includes('--size')) {
    throw new Error('The option --size comes one time, with scales of the violin, such as 0.85,1.');
  }
  const sizes = text.split(',').map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (!sizes.every((size) => Number.isFinite(size) && size > 0)) {
    throw new Error(`The option --size takes scales above 0, and "${text}" has another value.`);
  }
  return { sizes, rest };
}

/** The size of the instrument by the rule of a violin shop. */
export interface RuleSize {
  /** The scale, as a factor of the instrument of the app (`violinScale` for a violin). */
  readonly scale: number;
  /** The length from the tail end to the scroll, in meters. */
  readonly length: number;
}

/**
 * Gives the size of the instrument by the rule of a violin shop: the current scale and length,
 * times the factor of the rule.
 *
 * @param reach The reach.
 * @returns The size, or `null` when no length puts the scroll in the palm.
 */
export function ruleSize(reach: HoldReach): RuleSize | null {
  if (reach.ruleFactor === null) {
    return null;
  }
  return { scale: reach.scale * reach.ruleFactor, length: reach.length * reach.ruleFactor };
}

/** The reach of one arm to its grip on a wind instrument, in meters. */
export interface GripReach {
  /** The arm from the shoulder joint over the elbow and the wrist to the middle of the palm. */
  readonly arm: number;
  /** The distance from the shoulder joint to the grip of the palm in the playing pose. */
  readonly play: number;
  /** The distance from the shoulder joint to the grip of the palm in the rest pose. */
  readonly rest: number;
}

/**
 * Measures the reach of the arms of a species to their grips on a wind instrument (`palmL` and
 * `palmR` of the instrument), with the mouthpiece at its place of the hold, in the playing pose and
 * in the rest pose of its hold (`windHoldOf()`), with the chest in its bind pose. A palm misses its
 * grip by the distance less the arm when the distance is longer than the arm. The grip of the
 * trombone slide is at the first position.
 *
 * @param species The species.
 * @param instrument The wind instrument.
 * @param support The support of the player.
 * @returns The reach of each side.
 */
export function windReach(
  species: SpeciesId,
  instrument: WindInstrument,
  support: ReachSupport,
): Readonly<Record<'L' | 'R', GripReach>> {
  const model = buildPlayer(species, instrument, 4, support);
  const rig = windRig(model, instrument, windHoldOf(species, instrument));
  const play = windGrips(rig, 1);
  const rest = windGrips(rig, 0);
  const distance = (grip: { readonly joint: Vec3; readonly grip: Vec3 }): number =>
    new Vector3(...grip.joint).distanceTo(new Vector3(...grip.grip));
  const side = (s: 'L' | 'R'): GripReach => ({
    arm: armLength(model, s),
    play: distance(play[s]),
    rest: distance(rest[s]),
  });
  return { L: side('L'), R: side('R') };
}

/** The reach of an arm to the rest place of a paw that leaves its grip in the rest pose. */
export interface FreeRestReach {
  /** The side of the paw. */
  readonly side: 'L' | 'R';
  /**
   * The rest of the paw (`WindHold.restFreeL`): on the thigh of a seated player, or at the end of
   * the hanging arm of a standing player.
   */
  readonly kind: 'lap' | 'hang';
  /** The arm from the shoulder joint over the elbow and the wrist to the middle of the palm. */
  readonly arm: number;
  /**
   * The middle of the palm at its rest place on the thigh, in the model axes, or `null` for a
   * hanging arm.
   */
  readonly palm: Vec3 | null;
  /**
   * The distance from the shoulder joint to the middle of the palm at its rest place, with the
   * chest in its bind pose, or `null` for a hanging arm, which always reaches its rest place.
   */
  readonly distance: number | null;
}

/**
 * Measures the reach of each arm to the rest place of its paw, for each paw of the wind hold of a
 * species that leaves its grip in the rest pose (`WindHold.restFreeL`, design 5.3). The chest is in
 * its bind pose, as for the grips of {@link windReach}.
 *
 * @param species The species.
 * @param instrument The wind instrument.
 * @param support The support of the player.
 * @returns The reach of each free paw, or none when each paw stays on its grip.
 */
export function freeRestReach(
  species: SpeciesId,
  instrument: WindInstrument,
  support: ReachSupport,
): FreeRestReach[] {
  const model = buildPlayer(species, instrument, 4, support);
  const rig = windRig(model, instrument, windHoldOf(species, instrument));
  const free = rig.freeL;
  if (!free) {
    return [];
  }
  const arm = armLength(model, 'L');
  if (free.kind === 'hang') {
    return [{ side: 'L', kind: 'hang', arm, palm: null, distance: null }];
  }
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  const joint = poseShoulder(rig.left.arm, chest, rig.chestBind, new Quaternion()).position;
  const palm = new Vector3(...rig.left.arm.palm)
    .applyQuaternion(new Quaternion(...free.rotation))
    .add(new Vector3(...free.wrist));
  return [{ side: 'L', kind: 'lap', arm, palm: toVec3(palm), distance: palm.distanceTo(joint) }];
}

/**
 * Gives the reach share of a rest place: the distance from the shoulder joint to the middle of the
 * palm at the rest place over the arm. Above 1, the arm cannot reach the place, and the paw stops
 * short of it.
 *
 * @param reach The reach of the free paw.
 * @returns The share, or `null` for a hanging arm.
 */
export function reachShare(reach: FreeRestReach): number | null {
  return reach.distance === null ? null : reach.distance / reach.arm;
}

/** The slide of a trombone player: its full travel and the part that the right arm reaches. */
export interface SlideReach {
  /** The travel of the slide from the first to the seventh position, in meters. */
  readonly travel: number;
  /**
   * The part of the travel that the right arm reaches in the playing pose (`slideReach` of
   * `windRig()`), in meters. The slide positions map into this part (design 5.3).
   */
  readonly reach: number;
}

/**
 * Measures the slide of a wind player: the travel of the slide target of the instrument, and the
 * part of it that the right arm reaches in the playing pose of the hold (`slideReach`).
 *
 * @param species The species.
 * @param instrument The wind instrument.
 * @param support The support of the player.
 * @returns The slide, or `null` for an instrument with no slide.
 */
export function slideReach(
  species: SpeciesId,
  instrument: WindInstrument,
  support: ReachSupport,
): SlideReach | null {
  const model = buildPlayer(species, instrument, 4, support);
  const slide = model.instrument.targets.find((t) => t.kind === 'slide');
  if (!slide) {
    return null;
  }
  const rig = windRig(model, instrument, windHoldOf(species, instrument));
  const at = (point: Vec3): Vector3 =>
    new Vector3(...placePoint(model.pieces, { bone: 'slide', at: point }));
  return { travel: at(slide.to).distanceTo(at(slide.from)), reach: rig.slideReach };
}

/**
 * Writes the report of `pnpm hold-reach <species> --instrument <wind>`, with the scale of the
 * instrument of the species (`instrumentScale()`). A paw that leaves its grip in the rest pose
 * gives the reach of its rest place ({@link freeRestReach}) in place of the reach of its grip. A
 * trombone adds the reach of its slide ({@link slideReach}).
 *
 * @param species The species.
 * @param instrument The wind instrument.
 * @param support The support of the player.
 * @returns The lines.
 */
export function windReachLines(
  species: SpeciesId,
  instrument: WindInstrument,
  support: ReachSupport,
): string[] {
  const reach = windReach(species, instrument, support);
  const free = freeRestReach(species, instrument, support);
  const own = SPECIES_WIND_HOLDS[species]?.[instrument] !== undefined;
  const m = (value: number): string => `${value.toFixed(3)} m`;
  const miss = (distance: number, arm: number): string =>
    distance > arm
      ? `misses the grip by ${m(distance - arm)}`
      : `reaches the grip with ${m(arm - distance)} to spare`;
  const scale = instrumentScale(SPECIES[species], instrument);
  const lines = [
    `${species} with the ${instrument} on the ${support}, hold ${own ? `${instrument}@${species} (SPECIES_WIND_HOLDS)` : `${instrument} (WIND_HOLDS)`}, the mouthpiece at its place of the hold:`,
    `  Scale ${scale.toFixed(3)} of the ${instrument} of the app (instrumentScale())`,
  ];
  for (const s of ['L', 'R'] as const) {
    const { arm, play, rest } = reach[s];
    const freed = free.find((paw) => paw.side === s);
    lines.push(
      `  ${s}: arm ${m(arm)} from the shoulder joint to the middle of the palm`,
      `    Playing pose: shoulder joint to the grip ${m(play)}, the palm ${miss(play, arm)}`,
      freed
        ? freeRestLine(freed)
        : `    Rest pose: shoulder joint to the grip ${m(rest)}, the palm ${miss(rest, arm)}`,
    );
  }
  const slide = slideReach(species, instrument, support);
  if (slide) {
    lines.push(
      `  Slide: the right arm reaches ${m(slide.reach)} of the travel of ${m(slide.travel)} in the playing pose (slideReach)`,
    );
  }
  return lines;
}

/**
 * Writes the line of the rest pose of a paw that leaves its grip in the rest pose.
 *
 * @param reach The reach of the free paw.
 * @returns The line, such as `    Rest pose: the paw leaves its grip for the thigh (restFreeL),
 *   shoulder joint to the middle of the palm 0.520 m, 0.954 of the arm`.
 */
function freeRestLine(reach: FreeRestReach): string {
  const share = reachShare(reach);
  if (reach.distance === null || share === null) {
    return '    Rest pose: the paw leaves its grip (restFreeL), and the arm hangs down.';
  }
  const over = share > 1 ? ', out of reach' : '';
  return `    Rest pose: the paw leaves its grip for the thigh (restFreeL), shoulder joint to the middle of the palm ${reach.distance.toFixed(3)} m, ${share.toFixed(3)} of the arm${over}`;
}

/** The texts of the reached parts of a reach. */
export interface RangeTexts {
  /** The reached part of the fingerboard. */
  readonly stop: string;
  /** The reached part of the bow hair. */
  readonly bow: string;
}

/**
 * Writes a part of the fingerboard and a part of the bow hair.
 *
 * @param reach The reach.
 * @returns The two texts.
 */
export function rangeTexts(reach: HoldReach): RangeTexts {
  const [stopLow, stopHigh] = reach.stopRange;
  const [bowLow, bowHigh] = reach.bowRange;
  return {
    stop: `${stopLow.toFixed(2)} to ${stopHigh.toFixed(2)}`,
    bow: `${bowLow.toFixed(3)} to ${bowHigh.toFixed(3)} m of ${reach.hairLength.toFixed(3)} m`,
  };
}

/**
 * Writes the report of `pnpm hold-reach`.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param support The support of the player.
 * @returns The lines.
 */
export function holdReachLines(
  species: SpeciesId,
  instrument: ChinInstrument,
  support: ReachSupport,
): string[] {
  const reach = holdReach(species, instrument, support);
  const own = SPECIES_HOLDS[species]?.[instrument] !== undefined;
  const ranges = rangeTexts(reach);
  const m = (value: number): string => `${value.toFixed(3)} m`;
  const spare = reach.arms.L - reach.scroll;
  const name = instrument === 'violin' ? 'Violin' : 'Viola';
  const lines = [
    `${species} with the ${instrument} on the ${support}, hold ${own ? `${instrument}@${species} (SPECIES_HOLDS)` : `${instrument} (BOWED_HOLDS)`}:`,
    `  Arm from the shoulder joint to the middle of the palm: L ${m(reach.arms.L)}, R ${m(reach.arms.R)}`,
    `  ${name}: ${m(reach.length)}, scale ${reach.scale.toFixed(3)} of the ${instrument} of the app (${instrument === 'violin' ? 'violinScale' : 'violaScale'})`,
    `  Left shoulder joint to the scroll in the playing pose: ${m(reach.scroll)} (arm L less this: ${Math.abs(spare) < 5e-4 ? '0.000' : spare.toFixed(3)} m)`,
    `  Reached part of the fingerboard (stopRange, 0 at the nut, 1 at the end): ${ranges.stop}`,
    `  Reached part of the bow hair (bowRange, from the frog end): ${ranges.bow}`,
    '  Rule of a violin shop (the scroll in the middle of the palm of the extended left arm):',
  ];
  const rule = ruleSize(reach);
  if (!rule) {
    lines.push('    No length of the instrument puts the scroll in the palm.');
    return lines;
  }

  const { scale: ruleScale, length: ruleLength } = rule;
  lines.push(`    scale ${ruleScale.toFixed(3)}, ${instrument} ${m(ruleLength)}`);
  if (instrument === 'viola') {
    lines.push(
      '    The tool rebuilds only a violin at this scale. Probe a viola at this scale with',
      `    --set '${species}.violaScale=${ruleScale.toFixed(3)}'.`,
    );
    return lines;
  }

  const fits =
    ruleLength < REAL_VIOLINS.smallest
      ? 'smaller than the smallest real violin'
      : ruleLength > REAL_VIOLINS.largest
        ? 'larger than the largest real violin'
        : 'a real violin size';
  lines.push(
    `    Real violins: ${m(REAL_VIOLINS.smallest)} (1/32) to ${m(REAL_VIOLINS.largest)} (4/4), so this is ${fits}.`,
  );
  const check = violinReachAt(species, support, ruleScale);
  const checked = rangeTexts(check);
  lines.push(
    `  Check, rebuilt with violinScale ${ruleScale.toFixed(3)}: scroll ${m(check.scroll)} (arm L ${m(check.arms.L)}),`,
    `    stopRange ${checked.stop}, bowRange ${checked.bow}`,
  );
  return lines;
}

/** The options of `pnpm hold-reach <species>`. */
export interface ReachOptions {
  /** The instrument under the chin, or a wind instrument. */
  readonly instrument: ReachInstrument;
  /** The support of the player. */
  readonly support: ReachSupport;
  /**
   * The variants of `--set`, each a list of hold changes separated by `;`, as in
   * `pnpm pose-depth`. The report gives the base first, then each variant.
   */
  readonly sets: readonly string[];
}

/** The usage text of `pnpm hold-reach`. */
const USAGE =
  'Usage: pnpm hold-reach <species> [--instrument violin|viola|<wind>|<percussion>] [--support chair|stand] [--set <path>=<value>[;<path>=<value>]...]... [--size <scale>[,<scale>]...] [--glb <file>]';

/**
 * Reads the options after the species. Each option has one value, and `--set` can come more than
 * one time.
 *
 * @param args The arguments after the species.
 * @returns The options. The first permitted value of an option is its default.
 * @throws Error if an option is not known, has no value, or has a value that is not permitted.
 */
export function parseReachOptions(args: readonly string[]): ReachOptions {
  let instrument: ReachInstrument = 'violin';
  let support: ReachSupport = 'chair';
  const sets: string[] = [];
  const pick = <T extends string>(flag: string, text: string, values: readonly T[]): T => {
    const value = values.find((v) => v === text);
    if (value === undefined) {
      throw new Error(`${flag} takes one of: ${values.join(', ')}.`);
    }
    return value;
  };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] ?? '';
    const value = args[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${flag}" has no value.\n${USAGE}`);
    }
    switch (flag) {
      case '--instrument':
        instrument = pick(flag, value, REACH_INSTRUMENTS);
        break;
      case '--support':
        support = pick(flag, value, ['chair', 'stand'] as const);
        break;
      case '--set':
        sets.push(value);
        break;
      default:
        throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  return { instrument, support, sets };
}

/** The spare reach of one grip of a wind hold: the arm less the distance to the grip, in meters. */
export interface GripSpare {
  /** The spare reach in the playing pose. Below 0, the palm misses the grip. */
  readonly play: number;
  /** The spare reach in the rest pose, or `null` for a paw that leaves its grip. */
  readonly rest: number | null;
}

/** The spare reach of each grip of a wind hold in one variant, in meters. */
export interface SpareRow {
  /** The text of the changes, or empty for the base. */
  readonly variant: string;
  /**
   * The arm less the distance from the shoulder joint to the grip, in the playing pose and in the
   * rest pose, for each side ({@link windReach}). Below 0, the palm misses the grip. The rest pose
   * of a paw that leaves its grip ({@link freeRestReach}) has `null`.
   */
  readonly spare: Readonly<
    Record<'L' | 'R', { readonly play: number; readonly rest: number | null }>
  >;
}

/**
 * Measures the spare reach of each grip of a wind hold with the holds of now ({@link SpareRow}).
 *
 * @param variant The text of the changes, or empty for the base.
 * @param species The species.
 * @param instrument The wind instrument.
 * @param support The support of the player.
 * @returns The row.
 */
export function spareRow(
  variant: string,
  species: SpeciesId,
  instrument: WindInstrument,
  support: ReachSupport,
): SpareRow {
  const reach = windReach(species, instrument, support);
  const free = freeRestReach(species, instrument, support);
  const side = (s: 'L' | 'R'): GripSpare => ({
    play: reach[s].arm - reach[s].play,
    rest: free.some((paw) => paw.side === s) ? null : reach[s].arm - reach[s].rest,
  });
  return { variant, spare: { L: side('L'), R: side('R') } };
}

/**
 * Writes the table of the spare reach of each grip of a wind hold, with one row for each variant
 * ({@link SpareRow}).
 *
 * @param rows The rows, the base first.
 * @returns The lines.
 */
export function spareTable(rows: readonly SpareRow[]): string[] {
  const cm = (value: number | null): string => {
    if (value === null) {
      return 'free';
    }
    return `${(value * 100).toFixed(1)}${value < 0 ? ' MISS' : ''}`;
  };
  return [
    'Spare reach of each grip in cm: the arm less the distance from the shoulder joint to the grip (MISS below 0, free for a paw that leaves its grip):',
    '',
    '| Variant | L play | L rest | R play | R rest |',
    '|---|---:|---:|---:|---:|',
    ...rows.map(
      ({ variant, spare }) =>
        `| ${variant || 'base'} | ${cm(spare.L.play)} | ${cm(spare.L.rest)} | ${cm(spare.R.play)} | ${cm(spare.R.rest)} |`,
    ),
  ];
}

/**
 * Writes the report of `pnpm hold-reach` for the base and for each variant of `--set`. Each
 * variant changes the holds in memory, as `pnpm pose-depth --set` does, and the old values come
 * back after its report. A percussion instrument gives the strikes of the species in the demos
 * (`strikeReach()` of `tools/strike-reach.ts`), on the support of each demo. A wind instrument
 * with variants ends with the table of the spare reach of each grip ({@link spareTable}).
 *
 * @param species The species.
 * @param options The options.
 * @param demos The demos of a percussion instrument, or none for another instrument.
 * @returns The lines. With variants, each report starts with the line of its changes.
 * @throws Error if a variant names an unknown key or a value that does not fit, before the first
 *   report.
 */
export function holdReachVariantLines(
  species: SpeciesId,
  options: ReachOptions,
  demos: readonly DemoFile[] = [],
): string[] {
  for (const set of options.sets) {
    setHolds(set).undo();
  }

  const lines: string[] = [];
  const spares: SpareRow[] = [];
  for (const set of ['', ...options.sets]) {
    const { undo, text } = setHolds(set);
    try {
      if (options.sets.length > 0) {
        lines.push(`${text || 'base'}:`);
      }
      const { instrument, support } = options;
      if (isPercussion(instrument)) {
        lines.push(
          ...strikeReachLines(species, instrument, strikeReach(species, instrument, demos)),
        );
      } else if (isWind(instrument)) {
        lines.push(...windReachLines(species, instrument, support));
        spares.push(spareRow(text, species, instrument, support));
      } else {
        lines.push(...holdReachLines(species, instrument, support));
      }
    } finally {
      undo();
    }
  }
  if (options.sets.length > 0 && spares.length > 0) {
    lines.push('', ...spareTable(spares));
  }
  return lines;
}

/**
 * Runs the tool: `node tools/hold-reach.ts <species> [options]`. With `--glb <file>`, the species
 * gets the studio body that the export makes from the file, in a copy of `src/`
 * (`tools/glb-swap.ts`). A species with no studio body takes the body when it has a rig config
 * (`glbAnimal()` of `tools/glb-swap.ts`).
 */
async function main(): Promise<void> {
  const [species = '', ...args] = process.argv.slice(2);
  if (!isSpeciesId(species)) {
    console.error(`${USAGE}, with a species of: ${SPECIES_IDS.join(', ')}.`);
    process.exit(1);
  }

  const { glb, rest } = takeGlb(args);
  const { sizes, rest: others } = takeSizes(rest);
  const options = parseReachOptions(others);
  if (sizes.length > 0 && options.instrument !== 'violin') {
    throw new Error('The option --size takes the violin only.');
  }
  if (glb) {
    const animal = glbAnimal(species);
    if (!animal) {
      throw new Error(
        `The species ${species} has no studio body and no rig config tools/mesh-rigs/${species}.json, so --glb does not apply.`,
      );
    }
    process.exitCode = await withGlbBody(animal, glb, (dir) =>
      runTool(dir, 'hold-reach.ts', [species, ...rest]),
    );
    return;
  }
  const demos = isPercussion(options.instrument) ? await probeDemos() : [];
  console.log(holdReachVariantLines(species, options, demos).join('\n'));
  if (sizes.length > 0) {
    console.log(['', ...sizeReachLines(species, options.support, sizes)].join('\n'));
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
