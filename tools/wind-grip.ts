/**
 * Measures the contact of each paw of a woodwind player with its instrument over the sample sets
 * of the sweep of its role (design 5.3): the play, the lift, the rest, and the lowering. A gate of
 * the arms or of the depths can pass while the paws float beside the tube, so this tool measures
 * the grip itself, on the skin of the body as the GPU poses it.
 *
 * For each paw and each sample, it measures:
 *
 * - `gap`: the smallest distance from the skin of the paw (the bones `hand` and `fingers`) to the
 *   instrument, in cm. 0 when they touch or cross.
 * - `axis`: the distance from the middle of the closed paw to the axis of the tube, in cm.
 * - `in`: the depth of the axis of the tube in the closed paw, in cm. Above 0, the tube goes
 *   through the paw, as a stick goes through a fist.
 * - `tips`: the distance from the finger tips (the corners of the paw farthest from the wrist in
 *   the bind pose) to the instrument, in cm.
 * - `drift`: the distance from the middle of the closed paw to the palm point of the hand of the
 *   player, which the IK puts on the grip, in cm. The retarget turns the paw of the body
 *   (`PAW_TURN` of `models/body-rig.ts`), so the paw can leave the grip.
 * - `along`: the place of the middle of the paw along the tube from the mouthpiece, in cm, beside
 *   the place of its grip.
 * - `side`: the direction from the axis to the middle of the paw, in the axes of the chest
 *   (right, up, forward), in cm.
 * - `palm`: the angle between the normal of the palm and the direction from the middle of the paw
 *   to the axis, square to the axis, in degrees. 0 when the palm faces the tube.
 * - `place`: the angle between the direction from the axis to the middle of the paw and the side
 *   of the tube that the technique of the role names for the paw ({@link RoleGrip.places}), both
 *   square to the axis, in degrees.
 * - `top`: the height of the highest corner of the paw above the mouthpiece, in the axes of the
 *   chest, in cm. A paw far above it covers the face in the front view.
 * - For a mallet, a stick, or a beater (`ShaftContact`): `butt`, the length of the shaft from its
 *   butt end to the paw, in cm, `held`, the length of the shaft in the closed paw, in cm, `exit`,
 *   the angle of the shaft from the thumb side of the paw, and `fingers`, its angle from the line
 *   from the wrist to the finger tips, in degrees.
 *
 * A paw holds ({@link holds}) as a fist, with the tube through the middle of the paw, or as a
 * wrap, with its skin and its finger tips on the instrument. A paw grasps ({@link grasps}) as a
 * person sees a hand that holds a tube: its finger tips are on the instrument, its palm faces the
 * tube, and it is on the side of the tube that the technique names. The tool skips the palm and
 * the place when the middle of the paw is within {@link CENTERED} of the axis, because the tube
 * then goes through the closed paw. The table gives, for each set and paw, the share of the
 * samples in which the paw holds and grasps, the median of each measure, and the worst sample. It
 * also gives the smallest gap between the two paws. A paw that leaves its grip on purpose at
 * rest, as the left paw of the tan fox, still gets its row.
 *
 * The tube of a paw is the tube that the instrument names for its palm (`InstrumentGrips.tubeL`),
 * such as the valve casings of a trumpet or the brace of a trombone slide, else the tube of the
 * woodwind from its mouthpiece. The percussionist holds the clip of the triangle in its left paw
 * and the beater in its right paw. The tube of a mallet is its shaft, from its butt end to the
 * middle of its head (`docs/reference/percussion-technique.md` 1).
 *
 * Usage: pnpm wind-grip <role>... [--demo <id>]... [--every <n>] [--set <changes>] [--lines]
 *
 * `--every <n>` takes each n-th play sample (8 by default), `--set` changes the holds in memory
 * (`tools/hold-sets.ts`), and `--lines` prints each sample. With several `--set` options, the tool
 * prints a scan: one row for the working tree and one row for each variant (about 3 s each).
 */
import { MathUtils, Matrix3, Matrix4, Quaternion, Triangle, Vector3 } from 'three';

import { GRIP_GAP, volumeMiddle } from './bow-grip.ts';
import { setHolds } from './hold-sets.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { TRIANGLE_CLIP, malletButt } from '../src/models/instruments/percussion.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import { WOODWINDS } from '../src/models/instruments/woodwinds.ts';
import type { WoodwindId } from '../src/models/instruments/woodwinds.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { toVec3 } from '../src/models/tuples.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { scoreOf } from '../src/score/test-score.ts';
import {
  closeSurface,
  closedDepth,
  openLoops,
  partDistance,
  posedPart,
} from '../src/pose/test-clearance.ts';
import type { ClosedSurface, PosedPart } from '../src/pose/test-clearance.ts';
import { posedPiecePoint, posedPoint, poseSkeleton } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';
import type { SweepSample } from '../src/pose/test-sweep.ts';

/** A side of the body. */
type Side = 'L' | 'R';

/**
 * A direction in the axes of a place ({@link RoleGrip.placeAxes}): right, up, and forward in the
 * axes of the chest, or out along the slide, up, and to the right of the slide.
 */
type PlaceDirection = readonly [x: number, y: number, z: number];

/** A role that the tool measures. */
interface RoleGrip {
  /** The sweep of the role, which gives the sample sets. */
  readonly sweep: keyof typeof SWEEP_ROLES;
  readonly species: SpeciesId;
  readonly instrument: InstrumentId;
  /** Gives the posed tube or neck that a paw holds. */
  readonly tube: (posed: PosedSkeleton, side: Side) => Tube;
  /** The paws that hold it. */
  readonly paws: readonly Side[];
  /**
   * The side of the tube on which the technique of the role puts the middle of each paw, in the
   * axes of {@link RoleGrip.placeAxes}, or none for no rule.
   */
  readonly places: Readonly<Partial<Record<Side, PlaceDirection>>>;
  /**
   * The axes of the places: `chest` (right, up, forward), or `slide` for the trombone (out along
   * the slide, up, and to the right of the slide). A turn of the slide to the side then turns the
   * place with it, because a trombonist holds the brace from the right of the slide at each angle.
   */
  readonly placeAxes: 'chest' | 'slide';
  /**
   * The bones of the instrument that each paw holds, for the gaps of the skin and the tips. A
   * percussion paw holds only its own mallet.
   */
  readonly parts: Readonly<Record<Side, readonly BoneName[]>>;
  /**
   * The paws that hold a shaft, such as a mallet, a stick, or a beater, from its butt end to its
   * head. The tool then measures the butt and the exit of the shaft ({@link ShaftContact}).
   */
  readonly shafts: readonly Side[];
}

/** The mallet of each paw of a percussion player. */
const OWN_MALLETS: RoleGrip['parts'] = { L: ['malletL'], R: ['malletR'] };

/**
 * The roles that the tool measures: the woodwinds, the brass, the clip of the triangle, the
 * mallets, the sticks, and the beaters of the percussion players, the left paw of the red fox on
 * the neck of the violin, an accepted grip, for a compare, and the left paw of the cat on the
 * neck of the viola, which holds it at rest too. The places come from
 * `docs/reference/wind-technique.md` and `docs/reference/percussion-technique.md`. A woodwind hand
 * has its thumb behind the tube and its fingers over the front, so the middle of the paw is at the
 * side of the tube of its own arm, and the palm faces the tube from that side. With the middle of
 * the paw behind the tube, the palm faces the audience, and the thumb points down the tube. A brass
 * hand holds the valves or the slide from its own side.
 */
const ROLES = {
  clarinetist: wind('clarinetist', 'wolf', 'clarinet', { L: [-1, 0, 0], R: [1, 0, 0] }),
  oboist: wind('oboist', 'mouse', 'oboe', { L: [-1, 0, 0], R: [1, 0, 0] }),
  // A flutist holds the flute on the base of the left index finger, with the back of the left
  // hand to the audience, so the middle of the left paw is in front of the flute and a little
  // below. The right thumb lies under the flute or on its side toward the player, between the
  // first two fingers, and the right fingers curve over the keys on its top in a C (wind-technique
  // 2.4). So the middle of the right paw is behind the flute and a little below.
  flutist: wind('flutist', 'fox-tan', 'flute', { L: [0, -0.5, 1], R: [0, -0.5, -1] }),
  bassoonist: wind('bassoonist', 'beaver', 'bassoon', { L: [-1, 0, 0], R: [1, 0, 0] }),
  trombonist: wind('trombonist', 'panda', 'trombone', { L: [0, 0, -1], R: [0, 0, 1] }, 'slide'),
  // The left paw wraps the valve casings from the left, and the right paw lies above the valves
  // with its fingers down on them (wind-technique 2.1).
  trumpeter: wind('trumpeter', 'monkey', 'trumpet', { L: [-1, 0, 0], R: [0, 1, 0] }),
  tubist: wind('tubist', 'rhino', 'tuba', { R: [1, 0, 0] }),
  // The left hoof of the pig on the three finger levers of the horn, and the right hoof in the
  // bell, on its axis (wind-technique 2.2). A hoof has no fingers to close, so the gap, the tips,
  // and the axis tell more than the share of the grasps.
  hornist: {
    sweep: 'hornist',
    species: 'pig',
    instrument: 'horn',
    tube: (posed, side) => (side === 'L' ? hornLevers(posed) : bellAxisOf(posed)),
    paws: ['L', 'R'],
    places: {},
    placeAxes: 'chest',
    parts: { L: ['instrument'], R: ['instrument'] },
    shafts: [],
  },
  percussionist: {
    sweep: 'percussionist',
    species: 'badger',
    instrument: 'small-percussion',
    tube: (posed, side) => (side === 'L' ? clipOf(posed) : shaftOf(posed, side)),
    paws: ['L', 'R'],
    places: {},
    placeAxes: 'chest',
    parts: OWN_MALLETS,
    shafts: ['R'],
  },
  'bass-drummer': percussion('bass-drummer', 'badger', 'bass-drum', ['R']),
  'snare-drummer': percussion('snare-drummer', 'badger', 'snare-drum', ['L', 'R']),
  cymbalist: percussion('cymbalist', 'badger', 'cymbals', ['L', 'R']),
  xylophonist: percussion('xylophonist', 'badger', 'xylophone', ['L', 'R']),
  timpanist: percussion('timpanist', 'elephant', 'timpani', ['L', 'R']),
  'fox-violinist': {
    sweep: 'violinist',
    species: 'fox-red',
    instrument: 'violin',
    tube: neckOf,
    paws: ['L'],
    places: {},
    placeAxes: 'chest',
    parts: { L: ['instrument'], R: ['instrument'] },
    shafts: [],
  },
  // The left paw of the cat on the neck of the viola, also at rest, where a seated violist holds
  // the neck with the left hand (string-technique 2.9).
  violist: {
    sweep: 'violist',
    species: 'cat',
    instrument: 'viola',
    tube: neckOf,
    paws: ['L'],
    places: {},
    placeAxes: 'chest',
    parts: { L: ['instrument'], R: ['instrument'] },
    shafts: [],
  },
  // The right paw of the hippo around the stick of the bow, as a bassist holds the French bow
  // (string-technique 2.1).
  bassist: {
    sweep: 'bassist',
    species: 'hippo',
    instrument: 'contrabass',
    tube: stickOf,
    paws: ['R'],
    places: {},
    placeAxes: 'chest',
    parts: { L: ['instrument'], R: ['bow'] },
    shafts: [],
  },
  // The right paw of the dog around the stick of the bow at the frog, as a cellist holds the bow
  // (string-technique 2.1).
  cellist: {
    sweep: 'cellist',
    species: 'dog',
    instrument: 'cello',
    tube: stickOf,
    paws: ['R'],
    places: {},
    placeAxes: 'chest',
    parts: { L: ['instrument'], R: ['bow'] },
    shafts: ['R'],
  },
} as const satisfies Readonly<Record<string, RoleGrip>>;

type GripRole = keyof typeof ROLES;

/**
 * Gives the role of a wind instrument.
 *
 * @param sweep The sweep of the role.
 * @param species The species.
 * @param id The instrument.
 * @param places The side of the tube for each paw ({@link RoleGrip.places}).
 * @param placeAxes The axes of the places ({@link RoleGrip.placeAxes}). The chest by default.
 * @returns The role.
 */
function wind(
  sweep: keyof typeof SWEEP_ROLES,
  species: SpeciesId,
  id: InstrumentId,
  places: RoleGrip['places'],
  placeAxes: RoleGrip['placeAxes'] = 'chest',
): RoleGrip {
  return {
    sweep,
    species,
    instrument: id,
    tube: (posed, side) => ownTube(posed, side) ?? tubeOf(posed, id),
    paws: ['L', 'R'],
    places,
    placeAxes,
    parts: { L: ['instrument', 'slide'], R: ['instrument', 'slide'] },
    shafts: [],
  };
}

/**
 * Gives the role of a percussion player with a mallet, a stick, or a beater in each of its paws.
 * The tube of each paw is the shaft of its mallet, from the butt end to the middle of the head.
 *
 * @param sweep The sweep of the role.
 * @param species The species.
 * @param id The instrument.
 * @param paws The paws with a mallet.
 * @returns The role.
 */
function percussion(
  sweep: keyof typeof SWEEP_ROLES,
  species: SpeciesId,
  id: InstrumentId,
  paws: readonly Side[],
): RoleGrip {
  return {
    sweep,
    species,
    instrument: id,
    tube: shaftOf,
    paws,
    places: {},
    placeAxes: 'chest',
    parts: OWN_MALLETS,
    shafts: paws,
  };
}

/** The largest gap of the skin of a paw to the instrument for a hold, in meters. */
const TOUCH = 0.003;

/** The largest gap of the finger tips to the instrument for a hold, in meters. */
const TIPS = 0.006;

/** The share of the corners of the paw, farthest from the wrist, that make the finger tips. */
const TIP_SHARE = 0.15;

/** The largest distance of interest between two parts, in meters. */
const FAR = 0.3;

/** The step of the points along the axis of the tube, in meters. */
const AXIS_STEP = 0.0025;

/** The measures of one paw in one sample. */
interface PawContact {
  /** The gap of the skin of the paw to the instrument, in meters: 0 when they touch. */
  readonly gap: number;
  /** The distance from the middle of the closed paw to the axis of the tube, in meters. */
  readonly axis: number;
  /** The depth of the axis of the tube in the closed paw, in meters: 0 when it is outside. */
  readonly inside: number;
  /** The gap of the finger tips to the instrument, in meters. */
  readonly tips: number;
  /** The distance from the middle of the closed paw to the palm point of the player, in meters. */
  readonly drift: number;
  /** The place of the middle of the paw along the tube from the mouthpiece, in meters. */
  readonly along: number;
  /** The direction from the axis to the middle of the paw in the axes of the chest, in meters. */
  readonly side: readonly [number, number, number];
  /**
   * The angle between the normal of the palm and the direction from the middle of the paw to the
   * axis, square to the axis, in degrees, or `null` when the paw is centered on the axis.
   */
  readonly palm: number | null;
  /**
   * The angle between the direction from the axis to the middle of the paw and the side that the
   * technique names, square to the axis, in degrees, or `null` with no rule or a centered paw.
   */
  readonly place: number | null;
  /** The height of the highest corner of the paw above the mouthpiece, in meters. */
  readonly top: number;
  /** The measures of a shaft through the paw, or `null` when the paw holds no shaft. */
  readonly shaft: ShaftContact | null;
}

/** The measures of a shaft of a mallet, a stick, or a beater in one paw. */
interface ShaftContact {
  /**
   * The length of the shaft from its butt end to its first point in the closed paw, in meters, or
   * `null` when no point of the shaft is in the paw. A real player has 13 mm to 25 mm of the butt
   * behind the hand (`docs/reference/percussion-technique.md` 1).
   */
  readonly butt: number | null;
  /** The length of the shaft in the closed paw, in meters. */
  readonly held: number;
  /**
   * The angle between the shaft, toward its head, and the thumb side of the paw, in degrees. The
   * thumb side is normal to the palm and to the line from the wrist to the finger tips of the
   * skin. Near 0, the head leaves the front of the fist at the side of the thumb and the index
   * finger, as a real grip. Near 90, the shaft leaves the paw along the fingers or the palm.
   */
  readonly exit: number;
  /** The angle between the shaft, toward its head, and the line from the wrist to the tips. */
  readonly fingers: number;
}

/**
 * Tells if a paw holds its instrument, in one of two ways. A fist: the axis of the tube passes
 * within {@link GRIP_GAP} of the middle of the closed paw and goes into it, the rule of the bow
 * grip (`tools/bow-grip.ts`). A wrap: the skin touches the instrument, and the finger tips touch
 * it too, so that the fingers close around it. The left paw of the red fox on the violin neck, an
 * accepted grip, has its finger tips 0.1 cm from the neck in the play. A paw whose skin only
 * touches the tube can point away from it, with the tube in the back of the paw.
 *
 * @param c The measures of the paw.
 * @returns True when the paw holds.
 */
export function holds(c: PawContact): boolean {
  const fist = c.axis <= GRIP_GAP && c.inside > 0;
  return fist || (c.gap <= TOUCH && c.tips <= TIPS);
}

/**
 * The distance of the middle of a paw from the axis below which the tool skips the palm and the
 * place, in meters: the tube goes through the closed paw.
 */
const CENTERED = 0.01;

/** The largest angle of the palm from the tube for a grasp, in degrees. */
const PALM_LIMIT = 60;

/** The largest angle of the paw from the side of the tube that the technique names, in degrees. */
const PLACE_LIMIT = 60;

/**
 * Tells if a paw grasps its tube as a person sees a hand that holds it: its finger tips are on the
 * instrument ({@link TIPS}), its palm faces the tube ({@link PALM_LIMIT}), and the paw is on the
 * side of the tube that the technique names ({@link PLACE_LIMIT}). A paw with a shaft also has the
 * shaft in the closed paw, and the head leaves the paw at the thumb side ({@link EXIT_LIMIT}). An
 * open paw with the tube through its middle holds as a fist ({@link holds}), but it does not
 * grasp, because its finger tips stand off the tube.
 *
 * @param c The measures of the paw.
 * @returns True when the paw grasps.
 */
export function grasps(c: PawContact): boolean {
  const palm = c.palm === null || c.palm <= PALM_LIMIT;
  const place = c.place === null || c.place <= PLACE_LIMIT;
  const shaft = c.shaft === null || (c.inside > 0 && c.shaft.exit <= EXIT_LIMIT);
  return c.tips <= TIPS && palm && place && shaft;
}

/**
 * The largest angle of a shaft from the thumb side of the paw for a grasp, in degrees
 * ({@link ShaftContact.exit}). A shaft at a larger angle leaves the paw along the fingers.
 */
const EXIT_LIMIT = 60;

/** The tube of a woodwind in one pose, from the mouthpiece, or the neck of a violin from the nut. */
interface Tube {
  readonly start: Vector3;
  readonly axis: Vector3;
  readonly length: number;
}

/**
 * Gives the posed axis of the tube of a woodwind. The piece has the mouthpiece at its origin, and
 * the tube runs along +x. The grip of the right palm gives the scale of the instrument.
 *
 * @param posed The posed skeleton.
 * @param id The woodwind.
 * @returns The tube.
 * @throws Error if the instrument has no grip of the right palm.
 */
function tubeOf(posed: PosedSkeleton, id: InstrumentId): Tube {
  const grip = posed.model.instrument.grips.palmR;
  if (!grip || !isWoodwind(id)) {
    throw new Error(`The ${id} has no tube of a woodwind for the palms.`);
  }
  const w = WOODWINDS[id];
  const length = (grip.at[0] / w.palmR) * w.length;
  const start = new Vector3(...posedPiecePoint(posed, { bone: 'instrument', at: [0, 0, 0] }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: 'instrument', at: [length, 0, 0] }));
  return { start, axis: end.sub(start).normalize(), length };
}

/**
 * Tells if an instrument is a woodwind.
 *
 * @param id The instrument.
 * @returns True for a woodwind.
 */
function isWoodwind(id: InstrumentId): id is WoodwindId {
  return id in WOODWINDS;
}

/**
 * Gives the posed tube that the instrument names for a palm (`InstrumentGrips.tubeL`).
 *
 * @param posed The posed skeleton.
 * @param side The side of the palm.
 * @returns The tube, or `null` when the instrument names none.
 */
function ownTube(posed: PosedSkeleton, side: Side): Tube | null {
  const { grips } = posed.model.instrument;
  const own = side === 'L' ? grips.tubeL : grips.tubeR;
  if (!own) {
    return null;
  }
  const start = new Vector3(...posedPiecePoint(posed, { bone: own.bone, at: own.from }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: own.bone, at: own.to }));
  const length = end.distanceTo(start);
  return { start, axis: end.sub(start).normalize(), length };
}

/**
 * Gives the posed clip of the triangle in the left paw, from its upper end in the paw to its
 * lower end (`TRIANGLE_CLIP` of `models/instruments/percussion.ts`).
 *
 * @param posed The posed skeleton.
 * @returns The clip.
 */
function clipOf(posed: PosedSkeleton): Tube {
  const { clip, clipEnd } = TRIANGLE_CLIP;
  const start = new Vector3(...posedPiecePoint(posed, { bone: 'malletL', at: clip }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: 'malletL', at: clipEnd }));
  const length = end.distanceTo(start);
  return { start, axis: end.sub(start).normalize(), length };
}

/**
 * Gives the posed shaft of the mallet of a paw, from its butt end ({@link malletButt} behind the
 * grip) to the middle of its head.
 *
 * @param posed The posed skeleton.
 * @param side The side of the paw.
 * @returns The shaft.
 * @throws Error if the mallet of the paw has no head target.
 */
function shaftOf(posed: PosedSkeleton, side: Side): Tube {
  const bone = side === 'L' ? 'malletL' : 'malletR';
  const head = posed.model.instrument.targets.find(
    (t) => t.kind === 'mallet-head' && t.bone === bone,
  );
  if (!head) {
    throw new Error(`The ${posed.model.instrument.id} has no mallet head on ${bone}.`);
  }
  const start = new Vector3(
    ...posedPiecePoint(posed, { bone, at: [-malletButt(posed.model.instrument.id), 0, 0] }),
  );
  const end = new Vector3(...posedPiecePoint(posed, { bone, at: head.from }));
  const length = end.distanceTo(start);
  return { start, axis: end.sub(start).normalize(), length };
}

/**
 * Gives the posed neck of a violin: the line of its target `fingerboard`, from the nut to the end
 * of the fingerboard, along the strings.
 *
 * @param posed The posed skeleton.
 * @returns The neck.
 * @throws Error if the instrument has no target `fingerboard`.
 */
function neckOf(posed: PosedSkeleton): Tube {
  const board = posed.model.instrument.targets.find((t) => t.kind === 'fingerboard');
  if (!board) {
    throw new Error(`The ${posed.model.instrument.id} has no target "fingerboard".`);
  }
  const start = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.from }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.to }));
  const length = end.distanceTo(start);
  return { start, axis: end.sub(start).normalize(), length };
}

/**
 * Gives the posed line of the tips of the three finger levers of the horn, from the lever of the
 * first valve to the lever of the third valve: the tube that the horn names for the left palm
 * (`InstrumentGrips.tubeL`, `horn()` of `models/instruments/brass.ts`).
 *
 * @param posed The posed skeleton.
 * @returns The line of the lever tips.
 * @throws Error if the horn names no tube for the left palm.
 */
function hornLevers(posed: PosedSkeleton): Tube {
  const levers = ownTube(posed, 'L');
  if (!levers) {
    throw new Error(`The ${posed.model.instrument.id} has no tube of the left palm.`);
  }
  return levers;
}

/** The length of the axis of the horn bell from the rim in, in meters. */
const BELL_AXIS = 0.12;

/**
 * Gives the posed axis of the bell of the horn: from the middle of the opening (the target `bell`)
 * into the bell, along its axis. The right palm of the hornist lies near this axis, a little inside
 * the opening (`HORN.palm` of `models/instruments/brass.ts`).
 *
 * @param posed The posed skeleton.
 * @returns The axis of the bell.
 * @throws Error if the instrument has no target `bell`.
 */
function bellAxisOf(posed: PosedSkeleton): Tube {
  const bell = posed.model.instrument.targets.find((t) => t.kind === 'bell');
  if (!bell) {
    throw new Error(`The ${posed.model.instrument.id} has no target "bell".`);
  }
  const inside = new Vector3(...bell.from).addScaledVector(new Vector3(...bell.normal), -BELL_AXIS);
  const start = new Vector3(...posedPiecePoint(posed, { bone: bell.bone, at: bell.from }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: bell.bone, at: toVec3(inside) }));
  return { start, axis: end.sub(start).normalize(), length: BELL_AXIS };
}

/**
 * Gives the posed stick of a bow: the line of its target `bow-hair`, moved from the hair onto the
 * stick, from the frog end to the tip end.
 *
 * @param posed The posed skeleton.
 * @returns The stick.
 * @throws Error if the instrument has no target `bow-hair`.
 */
function stickOf(posed: PosedSkeleton): Tube {
  const hair = posed.model.instrument.targets.find((t) => t.kind === 'bow-hair');
  if (!hair) {
    throw new Error(`The ${posed.model.instrument.id} has no target "bow-hair".`);
  }
  const onStick = (p: Vec3): Vector3 =>
    new Vector3(...posedPiecePoint(posed, { bone: hair.bone, at: [p[0], 0, p[2]] }));
  const start = onStick(hair.from);
  const end = onStick(hair.to);
  const length = end.distanceTo(start);
  return { start, axis: end.sub(start).normalize(), length };
}

/** A posed paw: its triangles, and its closed surface. */
interface PosedPaw {
  readonly part: PosedPart;
  readonly closed: ClosedSurface;
}

/**
 * Gives the closed paw of one side: the triangles of the bones `hand` and `fingers`, as the skin
 * poses them, with a cap on each open loop.
 *
 * @param posed The posed skeleton.
 * @param side The side.
 * @returns The open part and the closed surface.
 */
function pawOf(posed: PosedSkeleton, side: 'L' | 'R'): PosedPaw {
  const bones: BoneName[] = [`hand${side}`, `fingers${side}`];
  const part = posedPart(posed, bones);
  return { part, closed: closeSurface(part.triangles, openLoops(part.triangles)) };
}

const nearest = new Vector3();

/**
 * Gives the smallest distance from points to the triangles of a part.
 *
 * @param points The points.
 * @param part The part.
 * @returns The distance, in meters.
 */
function pointsDistance(points: readonly Vector3[], part: PosedPart): number {
  let best = Infinity;
  for (const p of points) {
    for (const t of part.triangles) {
      best = Math.min(best, t.closestPointToPoint(p, nearest).distanceTo(p));
    }
  }
  return best;
}

/** The order of the corners of each paw by their distance from the wrist in the bind pose. */
const TIP_ORDERS = new WeakMap<PosedSkeleton['model'], Partial<Record<Side, readonly number[]>>>();

/**
 * Gives the finger tips of a posed paw: the corners of the paw farthest from the wrist in the bind
 * pose, where the fingers are straight. The skin of a body gives most corners of the
 * fingers the bone `hand`, so the tool reads the whole paw. A paw that closes its fingers has the
 * knuckles as its farthest corners in the pose, so the tool picks the corners in the bind pose.
 *
 * @param posed The posed skeleton.
 * @param paw The posed paw ({@link pawOf}).
 * @param side The side.
 * @returns The corners.
 */
function tipsOf(posed: PosedSkeleton, paw: PosedPart, side: Side): Vector3[] {
  const corners = paw.triangles.flatMap((t: Triangle) => [t.a, t.b, t.c]);
  const orders = TIP_ORDERS.get(posed.model) ?? {};
  let order = orders[side];
  if (!order) {
    const bind = bindSkeleton(posed);
    const wrist = new Vector3(
      ...(posed.model.skeleton.positions[boneIndex(`hand${side}`)] ?? [0, 0, 0]),
    );
    const bindCorners = pawOf(bind, side).part.triangles.flatMap((t: Triangle) => [t.a, t.b, t.c]);
    order = bindCorners
      .map((c, i) => [c.distanceTo(wrist), i] as const)
      .toSorted((x, y) => y[0] - x[0])
      .map(([, i]) => i);
    orders[side] = order;
    TIP_ORDERS.set(posed.model, orders);
  }
  const count = Math.max(1, Math.round(order.length * TIP_SHARE));
  return order.slice(0, count).flatMap((i) => (corners[i] ? [corners[i]] : []));
}

/**
 * Gives the world direction of a place of the technique ({@link RoleGrip.places}). The axes of the
 * slide come from the posed slide target (out along the slide) and the posed brace of the right
 * palm (`InstrumentGrips.tubeR`), which runs down from the upper tube.
 *
 * @param posed The posed skeleton.
 * @param place The place, in the axes of `axes`.
 * @param axes The axes of the place.
 * @returns The unit direction, in world axes.
 * @throws Error if the axes of the slide come with no slide target or no brace.
 */
function placeDirection(
  posed: PosedSkeleton,
  place: PlaceDirection,
  axes: RoleGrip['placeAxes'],
): Vector3 {
  if (axes === 'chest') {
    const chest = posed.frames[boneIndex('chest')]?.rotation ?? new Quaternion();
    return new Vector3(place[0], place[1], -place[2]).applyQuaternion(chest).normalize();
  }
  const slide = posed.model.instrument.targets.find((t) => t.kind === 'slide');
  const brace = ownTube(posed, 'R');
  if (!slide || !brace) {
    throw new Error(`The ${posed.model.instrument.id} has no slide and no brace for the places.`);
  }
  const from = new Vector3(...posedPiecePoint(posed, { bone: slide.bone, at: slide.from }));
  const out = new Vector3(...posedPiecePoint(posed, { bone: slide.bone, at: slide.to }))
    .sub(from)
    .normalize();
  const up = brace.axis.clone().negate().projectOnPlane(out).normalize();
  const right = new Vector3().crossVectors(out, up);
  return out
    .multiplyScalar(place[0])
    .addScaledVector(up, place[1])
    .addScaledVector(right, place[2])
    .normalize();
}

/**
 * Measures one paw in one pose ({@link PawContact}).
 *
 * @param posed The posed skeleton.
 * @param tube The posed tube.
 * @param side The side.
 * @param instrument The posed instrument.
 * @param shaft True when the tube is the shaft of a mallet ({@link ShaftContact}).
 * @param place The side of the tube that the technique names for the paw, in world axes
 *   ({@link placeDirection}), or none.
 * @returns The measures.
 */
function pawContact(
  posed: PosedSkeleton,
  tube: Tube,
  side: Side,
  instrument: PosedPart,
  shaft: boolean,
  place?: Vector3,
): PawContact {
  const paw = pawOf(posed, side);
  const middle = volumeMiddle(paw.closed);
  const along = Math.min(tube.length, Math.max(0, middle.clone().sub(tube.start).dot(tube.axis)));
  const onAxis = tube.start.clone().addScaledVector(tube.axis, along);
  const points: Vector3[] = [];
  for (let s = 0; s <= tube.length; s += AXIS_STEP) {
    points.push(tube.start.clone().addScaledVector(tube.axis, s));
  }
  const palm = side === 'L' ? posed.model.body.palmL : posed.model.body.palmR;
  const chest = posed.frames[boneIndex('chest')]?.rotation ?? new Quaternion();
  const toChest = chest.clone().invert();
  const out = middle.clone().sub(onAxis);
  const offset = out.clone().applyQuaternion(toChest);
  const centered = out.length() < CENTERED;
  const square = out.clone().projectOnPlane(tube.axis);

  // The palm faces +x of the hand of the player on the left hand and -x on the right hand, the
  // side to which a curl moves the finger tips (`faceTube()` of `pose/winds.ts`). The retarget
  // turns the paw of the body only in the plane of its palm, so the normal is the same.
  const hand = posed.frames[boneIndex(`hand${side}`)]?.rotation ?? new Quaternion();
  const normal = new Vector3(side === 'L' ? 1 : -1, 0, 0)
    .applyQuaternion(hand)
    .projectOnPlane(tube.axis);
  const palmAngle = centered ? null : angleOf(normal, square.clone().negate());
  let placeAngle: number | null = null;
  if (place && !centered) {
    const wanted = place.clone().projectOnPlane(tube.axis);
    placeAngle = angleOf(wanted, square);
  }

  const mouth = posed.model.instrument.grips.mouth;
  const top = mouth
    ? new Vector3(...posedPiecePoint(posed, mouth))
    : (posed.frames[boneIndex('head')]?.position.clone() ?? new Vector3());
  const up = new Vector3(0, 1, 0).applyQuaternion(chest);
  const highest = Math.max(
    ...paw.part.triangles.flatMap((t) => [t.a, t.b, t.c]).map((p) => p.clone().sub(top).dot(up)),
  );
  return {
    gap: partDistance(paw.part, instrument, FAR),
    axis: middle.distanceTo(onAxis),
    inside: closedDepth(points, paw.closed).depth,
    tips: pointsDistance(tipsOf(posed, paw.part, side), instrument),
    drift: middle.distanceTo(new Vector3(...posedPoint(posed, `hand${side}`, palm))),
    along,
    side: [offset.x, offset.y, -offset.z],
    palm: palmAngle,
    place: placeAngle,
    top: highest,
    shaft: shaft ? shaftContact(posed, tube, side, paw) : null,
  };
}

/**
 * Measures a shaft in a paw ({@link ShaftContact}).
 *
 * @param posed The posed skeleton.
 * @param tube The posed shaft, from its butt end.
 * @param side The side.
 * @param paw The posed paw.
 * @returns The measures.
 */
function shaftContact(posed: PosedSkeleton, tube: Tube, side: Side, paw: PosedPaw): ShaftContact {
  let butt: number | null = null;
  let held = 0;
  for (let s = 0; s <= tube.length; s += AXIS_STEP) {
    const point = tube.start.clone().addScaledVector(tube.axis, s);
    if (closedDepth([point], paw.closed).depth > 0) {
      butt ??= s;
      held += AXIS_STEP;
    }
  }
  // The axes of the visible paw: in the bind pose, the fingers point down and the thumb forward.
  const turn = pawTurn(posed, side);
  const fingers = new Vector3(0, -1, 0).applyQuaternion(turn);
  const thumb = new Vector3(0, 0, -1).applyQuaternion(turn);
  return {
    butt,
    held,
    exit: angleOf(tube.axis, thumb),
    fingers: angleOf(tube.axis, fingers),
  };
}

/** The corners of the `hand` bone of each paw in the bind pose, by the model. */
const BIND_HANDS = new WeakMap<PosedSkeleton['model'], Partial<Record<Side, readonly Vector3[]>>>();

/**
 * Gives the turn of the visible paw from the bind pose: the rotation that best maps the corners of
 * the `hand` bone of the bind pose onto the posed corners (Kabsch, by a polar decomposition). The
 * retarget turns the body paw in the plane of its palm (`PAW_TURN` of `models/body-rig.ts`),
 * so the visible paw can differ from the hand of the player. The curled fingers do not move it.
 *
 * @param posed The posed skeleton.
 * @param side The side.
 * @returns The turn.
 */
function pawTurn(posed: PosedSkeleton, side: Side): Quaternion {
  const bones: BoneName[] = [`hand${side}`];
  const hands = BIND_HANDS.get(posed.model) ?? {};
  let bindCorners = hands[side];
  if (!bindCorners) {
    bindCorners = posedPart(bindSkeleton(posed), bones).triangles.flatMap((t: Triangle) => [
      t.a,
      t.b,
      t.c,
    ]);
    hands[side] = bindCorners;
    BIND_HANDS.set(posed.model, hands);
  }
  const corners = posedPart(posed, bones).triangles.flatMap((t: Triangle) => [t.a, t.b, t.c]);
  const bindMiddle = new Vector3();
  const middle = new Vector3();
  for (const [i, c] of corners.entries()) {
    bindMiddle.add(bindCorners[i] ?? c);
    middle.add(c);
  }
  bindMiddle.divideScalar(Math.max(1, corners.length));
  middle.divideScalar(Math.max(1, corners.length));
  // The cross covariance: the sum of the posed corner times the bind corner, both centered.
  const sums = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const a = new Vector3();
  const b = new Vector3();
  for (const [i, c] of corners.entries()) {
    a.copy(bindCorners[i] ?? c).sub(bindMiddle);
    b.copy(c).sub(middle);
    const bind = a.toArray();
    const pose = b.toArray();
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        sums[r * 3 + k] = (sums[r * 3 + k] ?? 0) + (pose[r] ?? 0) * (bind[k] ?? 0);
      }
    }
  }
  let rotation = new Matrix3().fromArray(sums).transpose();
  for (let step = 0; step < 60; step++) {
    const inverse = rotation.clone().invert().transpose();
    rotation = new Matrix3().fromArray(
      rotation.elements.map((x, k) => 0.5 * (x + (inverse.elements[k] ?? 0))),
    );
  }
  return new Quaternion().setFromRotationMatrix(new Matrix4().setFromMatrix3(rotation));
}

/**
 * Gives the skeleton of a posed player in its bind pose: no rotation on any bone.
 *
 * @param posed The posed skeleton.
 * @returns The bind skeleton.
 */
function bindSkeleton(posed: PosedSkeleton): PosedSkeleton {
  const rotations = new Float32Array(posed.pose.rotations.length);
  for (let i = 3; i < rotations.length; i += 4) {
    rotations[i] = 1;
  }
  return poseSkeleton(posed.model, { ...posed.pose, rotations });
}

/**
 * Gives the angle between two directions, in degrees.
 *
 * @param a The first direction.
 * @param b The second direction.
 * @returns The angle, or 180 when a direction is 0.
 */
function angleOf(a: Vector3, b: Vector3): number {
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) {
    return 180;
  }
  return a.angleTo(b) * MathUtils.RAD2DEG;
}

/** The measures of the paws in one sample. */
interface SampleContact {
  readonly set: string;
  readonly song: number;
  readonly wall: number;
  readonly paws: Readonly<Partial<Record<'L' | 'R', PawContact>>>;
  /** The gap between the skins of the two paws, in meters: 0 when they touch or cross. */
  readonly between: number;
  /**
   * The gap of the instrument to the skin of the trunk and the legs ({@link BODY_BONES}), in
   * meters: 0 when they touch or cross. At rest, a real player puts the instrument on the body.
   */
  readonly body: number;
  /** The gap of the lower end of the tube to the skin of the trunk and the legs, in meters. */
  readonly end: number;
}

/** The bones of the trunk and of the legs, on which a player at rest puts its instrument. */
const BODY_BONES: readonly BoneName[] = [
  'hips',
  'spine',
  'chest',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
];

/**
 * Finds the first player of the species and the instrument of a role in a scene.
 *
 * @param grip The role.
 * @param scene The scene.
 * @returns The index of the player in the layout, or -1.
 */
function playerOf(grip: RoleGrip, scene: TestScene): number {
  return scene.layout.players.findIndex(
    (p) => p.cast.species === grip.species && p.cast.instrument === grip.instrument,
  );
}

/**
 * Measures each sample of the sweep of a role in one demo.
 *
 * @param grip The role.
 * @param scene The scene of the demo.
 * @param every The step of the play samples: each n-th sample.
 * @returns The measures, or none when the demo has no player of the role.
 */
function measureScene(grip: RoleGrip, scene: TestScene, every: number): SampleContact[] {
  const index = playerOf(grip, scene);
  const place = scene.layout.players[index];
  if (!place) {
    return [];
  }
  const { species, instrument, kettles, support } = place.cast;
  const model = scene.models.get(species, instrument, kettles, support);
  const buffer = createScenePose(scene.plan);
  const audible = allAudible(scene.score);
  const out: SampleContact[] = [];
  for (const set of SWEEP_ROLES[grip.sweep].sampleSets(scene)) {
    const samples: SweepSample[] = [...set.samples];
    const kept = set.name === 'play' ? samples.filter((_, i) => i % every === 0) : samples;
    for (const [song, wall, transport] of kept) {
      const pose = poseAt(scene.plan, song, wall, transport, audible, buffer).players[index];
      if (!pose) {
        throw new Error(`The pose has no player ${index}.`);
      }
      const posed = poseSkeleton(model, pose);
      const instrumentPart = posedPart(posed, [...new Set([...grip.parts.L, ...grip.parts.R])]);
      const tube = grip.tube(posed, grip.paws[0] ?? 'L');
      const paws: Partial<Record<Side, PawContact>> = {};
      for (const side of grip.paws) {
        const own = grip.tube(posed, side);
        const wanted = grip.places[side];
        const toward = wanted ? placeDirection(posed, wanted, grip.placeAxes) : undefined;
        const part = posedPart(posed, grip.parts[side]);
        paws[side] = pawContact(posed, own, side, part, grip.shafts.includes(side), toward);
      }
      const between = partDistance(
        posedPart(posed, ['handL', 'fingersL']),
        posedPart(posed, ['handR', 'fingersR']),
        FAR,
      );
      const body = posedPart(posed, BODY_BONES);
      const end = tube.start.clone().addScaledVector(tube.axis, tube.length);
      out.push({
        set: set.name,
        song,
        wall,
        paws,
        between,
        body: partDistance(instrumentPart, body, FAR),
        end: pointsDistance([end], body),
      });
    }
  }
  return out;
}

/**
 * Gives the median of numbers.
 *
 * @param values The numbers.
 * @returns The median, or `NaN` for none.
 */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? Number.NaN)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Writes the median of angles in whole degrees, with the share of the samples that have no angle.
 *
 * @param values The angles, or `null` for a paw centered on its tube.
 * @returns The text, or "-" when no sample has an angle.
 */
function degrees(values: readonly (number | null)[]): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) {
    return '-';
  }
  const centered = values.length - known.length;
  return `${median(known).toFixed(0)}${centered > 0 ? ` (${centered} centered)` : ''}`;
}

/**
 * Writes the cells of the shaft measures of a set: the median butt length, held length, exit
 * angle, and fingers angle ({@link ShaftContact}).
 *
 * @param paws The measures of one paw in the samples of the set.
 * @returns The cells, or "-" cells when the paw holds no shaft.
 */
function shaftCells(paws: readonly PawContact[]): string {
  const shafts = paws.flatMap((p) => (p.shaft ? [p.shaft] : []));
  if (shafts.length === 0) {
    return '- | - | - | -';
  }
  const butts = shafts.flatMap((s) => (s.butt === null ? [] : [s.butt]));
  const out = shafts.length - butts.length;
  const butt = butts.length > 0 ? cm(median(butts)) : '-';
  return [
    `${butt}${out > 0 ? ` (${out} out)` : ''}`,
    cm(median(shafts.map((s) => s.held))),
    median(shafts.map((s) => s.exit)).toFixed(0),
    median(shafts.map((s) => s.fingers)).toFixed(0),
  ].join(' | ');
}

/**
 * Writes centimeters with one decimal.
 *
 * @param meters The value, in meters.
 * @returns The text.
 */
function cm(meters: number): string {
  return (meters * 100).toFixed(1);
}

/**
 * Writes the lines of the table of a role.
 *
 * @param name The name of the role.
 * @param grip The role.
 * @param samples The measures.
 * @param lines True to add one line for each sample.
 * @returns The lines.
 */
function tableLines(
  name: GripRole,
  grip: RoleGrip,
  samples: readonly SampleContact[],
  lines: boolean,
): string[] {
  const out = [
    `${name} (${grip.species}, ${grip.instrument}): the gaps and the distances in cm, the median of each set; "worst" names the sample with the largest axis distance`,
    '| Set | Paw | Samples | Holds | Grasps | Gap | Axis | In | Tips | Palm ° | Place ° | Butt | Held | Exit ° | Fingers ° | Top | Drift | Along | Side (right, up, fwd) | Worst axis | Paws gap min | Body gap | End gap |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|---:|',
  ];
  for (const set of ['play', 'lift', 'rest', 'lower']) {
    const of = samples.filter((s) => s.set === set);
    if (of.length === 0) {
      continue;
    }
    for (const side of grip.paws) {
      const measured = of.flatMap((s) => {
        const c = s.paws[side];
        return c ? [{ s, c }] : [];
      });
      const paws = measured.map((m) => m.c);
      const held = paws.filter(holds).length;
      const grasped = paws.filter(grasps).length;
      const worst = measured.reduce((a, b) => (b.c.axis > a.c.axis ? b : a));
      const at = (f: (c: PawContact) => number): string => cm(median(paws.map(f)));
      const sideMedian = [0, 1, 2].map((k) => at((p) => p.side[k] ?? 0));
      const share = (n: number): string => `${((100 * n) / of.length).toFixed(0)}%`;
      out.push(
        `| ${set} | ${side} | ${of.length} | ${share(held)} | ${share(grasped)} | ${at((p) => p.gap)} | ${at((p) => p.axis)} | ${at((p) => p.inside)} | ${at((p) => p.tips)} | ${degrees(paws.map((p) => p.palm))} | ${degrees(paws.map((p) => p.place))} | ${shaftCells(paws)} | ${at((p) => p.top)} | ${at((p) => p.drift)} | ${at((p) => p.along)} | ${sideMedian.join(', ')} | ${cm(worst.c.axis)} at ${worst.s.song.toFixed(2)} s, wall ${worst.s.wall.toFixed(2)} s | ${cm(Math.min(...of.map((s) => s.between)))} | ${cm(median(of.map((s) => s.body)))} | ${cm(median(of.map((s) => s.end)))} |`,
      );
    }
  }
  if (lines) {
    out.push('', 'set song wall | paw gap axis in tips drift along | ... | paws gap');
    for (const s of samples) {
      const p = (side: 'L' | 'R'): string => {
        const c = s.paws[side];
        return c
          ? `${side} ${[c.gap, c.axis, c.inside, c.tips, c.drift, c.along].map(cm).join(' ')}`
          : `${side} -`;
      };
      out.push(
        `${s.set} ${s.song.toFixed(2)} ${s.wall.toFixed(2)} | ${grip.paws.map(p).join(' | ')} | ${cm(s.between)}`,
      );
    }
  }
  return out;
}

/**
 * Writes one row of a scan: the share of the samples in which each paw holds, and the median
 * distance of its middle to the axis and of its finger tips to the instrument, for each set.
 *
 * @param label The variant.
 * @param grip The role.
 * @param samples The measures.
 * @returns The row.
 */
function scanRow(label: string, grip: RoleGrip, samples: readonly SampleContact[]): string {
  const cells = ['play', 'lift', 'rest', 'lower'].flatMap((set) =>
    grip.paws.map((side) => {
      const paws = samples.flatMap((s) => (s.set === set && s.paws[side] ? [s.paws[side]] : []));
      if (paws.length === 0) {
        return '-';
      }
      const held = (100 * paws.filter(holds).length) / paws.length;
      const grasped = (100 * paws.filter(grasps).length) / paws.length;
      const at = (f: (c: PawContact) => number): string => cm(median(paws.map(f)));
      return `${held.toFixed(0)}% ${grasped.toFixed(0)}% ${at((p) => p.axis)} ${at((p) => p.tips)} ${at((p) => p.gap)} ${degrees(paws.map((p) => p.palm))}`;
    }),
  );
  const between = cm(Math.min(...samples.map((s) => s.between)));
  const rest = samples.filter((s) => s.set === 'rest');
  const body = `${cm(median(rest.map((s) => s.body)))} ${cm(median(rest.map((s) => s.end)))}`;
  return `| ${label} | ${cells.join(' | ')} | ${between} | ${body} |`;
}

/**
 * Finds the first demo with a player of a role, and measures it.
 *
 * @param grip The role.
 * @param demos The demos.
 * @param asked The names of the demos to take, or none for all.
 * @param every The step of the play samples.
 * @returns The demo and the measures, or `null` when no demo has the role.
 */
function measureFirst(
  grip: RoleGrip,
  demos: readonly DemoFile[],
  asked: readonly string[],
  every: number,
): { file: string; samples: SampleContact[] } | null {
  const sweep = SWEEP_ROLES[grip.sweep];
  for (const demo of demos) {
    const wanted = asked.length === 0 || asked.some((a) => demo.file.startsWith(a));
    if (!wanted || !sweep.hasRole(scoreOf(demo.bytes))) {
      continue;
    }
    const samples = measureScene(grip, sceneOf(demo.bytes), every);
    if (samples.length > 0) {
      return { file: demo.file, samples };
    }
  }
  return null;
}

/**
 * Runs the tool. One `--set` prints the table of the variant. Several `--set` options print a
 * scan: one row for the working tree and one row for each variant.
 *
 * @param args The arguments after the script.
 * @throws Error if a role is not known, or if no demo has a role.
 */
async function main(args: readonly string[]): Promise<void> {
  const roles = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const value = (name: string): string[] =>
    args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1] ?? ''] : []));
  const isRole = (r: string): r is GripRole => r in ROLES;
  if (roles.length === 0 || !roles.every(isRole)) {
    throw new Error(
      `Usage: pnpm wind-grip <${Object.keys(ROLES).join(' | ')}>... [--demo <id>]... [--every <n>] [--set <changes>]... [--lines]`,
    );
  }
  const every = Number(value('--every')[0] ?? 8);
  const asked = value('--demo');
  const variants = value('--set');
  const demos = await probeDemos();
  for (const name of roles.filter(isRole)) {
    const grip: RoleGrip = ROLES[name];
    if (variants.length > 1) {
      const sets = ['play', 'lift', 'rest', 'lower'];
      const heads = sets.flatMap((set) => grip.paws.map((side) => `${set} ${side}`));
      console.log(
        `\n${name}: each cell gives the share of the samples that hold and that grasp, then the median axis distance, tip gap, and skin gap in cm, and the median palm angle in degrees`,
      );
      console.log(`| Variant | ${heads.join(' | ')} | Paws gap min | Rest body, end gap |`);
      console.log(`|---|${heads.map(() => '---').join('|')}|---:|---|`);
      for (const variant of ['', ...variants]) {
        const { undo } = setHolds(variant);
        try {
          const measured = measureFirst(grip, demos, asked, every);
          console.log(scanRow(variant || 'tree', grip, measured?.samples ?? []));
        } finally {
          undo();
        }
      }
      continue;
    }
    const changes = variants[0];
    const undo = changes ? setHolds(changes).undo : (): void => {};
    if (changes) {
      console.log(`set: ${changes}`);
    }
    const measured = measureFirst(grip, demos, asked, every);
    undo();
    if (!measured) {
      throw new Error(`No demo has the role ${name}.`);
    }
    console.log(`\n${measured.file}`);
    console.log(tableLines(name, grip, measured.samples, args.includes('--lines')).join('\n'));
  }
}

await main(process.argv.slice(2));
