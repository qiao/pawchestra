import { Triangle, Vector3 } from 'three';

import { VIOLIN } from '../models/instruments/strings.ts';
import type { PlayerModel } from '../models/player.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import type { Score } from '../score/types.ts';
import { HEAD_BONES, closedDepth, surfaceGap, surfaceNearest } from './test-clearance.ts';
import type { ClosedSurface } from './test-clearance.ts';
import { poseSkeleton, posedPiecePoint } from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import type { Recast, TestScene } from './test-scene.ts';
import { posedCorner } from './test-skin.ts';
import type { AnimalPose, Transport } from './types.ts';

/** One sample of a sweep: a song time, a wall time, and a transport. */
export type SweepSample = readonly [song: number, wall: number, transport: Transport];

/** A named set of samples, such as a full play or the lift of the arms. */
export interface SampleSet {
  /** The name, such as `play`. An accepted depth names it. */
  readonly name: string;
  /** The samples, in the order of the sweep. */
  readonly samples: Iterable<SweepSample>;
}

/** A moving part of a player: the triangles of some bones. */
export interface SweepPart {
  /** The name in the reports, such as `forearms`. */
  readonly name: string;
  /** The bones. Each point belongs to the main bone of its corner (design 4.4). */
  readonly bones: readonly BoneName[];
  /** The names of the obstacles that the sweep measures the part in, or each obstacle with none. */
  readonly into?: readonly string[];
  /**
   * The largest depth of the part in each obstacle, in meters, in place of the contact depth of
   * the role ({@link depthLimit}): a real player presses a held instrument on the body, such as
   * the chin rest of a violin under the jaw. None keeps the contact depth.
   */
  readonly limit?: number;
}

/** A part that the moving parts must not enter: a closed surface of the body or the instrument. */
export interface SweepObstacle {
  /** The name in the reports, such as `body`. */
  readonly name: string;
  /** Gives the closed surface in a pose. */
  readonly surface: (posed: PosedSkeleton) => ClosedSurface;
}

/**
 * A depth that a decision accepts for one pair of parts in one set of samples. It is a contract
 * of contact: a depth that the look accepts, with a margin over the measure.
 */
export interface AcceptedDepth {
  /** The moving part. */
  readonly part: string;
  /** The part that it enters. */
  readonly into: string;
  /** The set of samples. */
  readonly samples: string;
  /** The largest depth, in meters. */
  readonly depth: number;
  /** Why the depth is accepted. */
  readonly reason: string;
}

/**
 * A place where a hand, or the part that it holds, must be at a time: the palm on the keys of a
 * note, or the bow hair on the strings.
 */
export interface NoteTarget {
  /** The hand. */
  readonly side: 'L' | 'R';
  /** The sample where the hand is at its target. */
  readonly sample: SweepSample;
  /**
   * Gives the distance of the hand, or of the part that it holds, from its target in a posed
   * skeleton of the sample.
   */
  readonly error: (posed: PosedSkeleton) => number;
}

/** One player of a role in a scene. */
export interface SweepPlayer {
  /** The name in the reports, such as `pianist 3`. */
  readonly name: string;
  /** The player model, with its mesh. */
  readonly model: PlayerModel;
  /** Gives the pose of the player at a sample. */
  readonly poseAt: (sample: SweepSample) => AnimalPose;
  /** Gives the note targets of the hands. A role with no note targets gives none. */
  readonly targets: () => readonly NoteTarget[];
}

/**
 * A role of a player for the sweep, such as the conductor or the pianist. A new role gives its
 * parts, its obstacles with the shells of its instrument, and its limits.
 */
export interface RoleSweep {
  /** The name of the role, such as `pianist`. */
  readonly role: string;
  /** The moving parts: the paws, the claws, the forearms, the upper arms, and a baton. */
  readonly parts: readonly SweepPart[];
  /** The parts that the moving parts must not enter. */
  readonly obstacles: readonly SweepObstacle[];
  /** The largest depth of a moving part in an obstacle, in meters: a paw presses the fur. */
  readonly contact: number;
  /** The depths that a decision accepts past {@link contact}. */
  readonly accepted: readonly AcceptedDepth[];
  /**
   * The largest distance from a hand, or from the part that it holds, to its note target, in
   * meters.
   */
  readonly targetError: number;
  /** Tells if a score has the role. */
  readonly hasRole: (score: Score) => boolean;
  /** Finds the players of the role in a scene. */
  readonly players: (scene: TestScene) => readonly SweepPlayer[];
  /** Gives the sets of samples of a scene. */
  readonly sampleSets: (scene: TestScene) => readonly SampleSet[];
  /**
   * The recast of the seats of a recast role (`recastSweep()` of `pose/test-sweep-roles.ts`): the
   * scene of each demo takes it (`recastScene()` of `pose/test-scene.ts`). None for a role of the
   * cast of the app.
   */
  readonly recast?: Recast;
}

/** The deepest point of a moving part in an obstacle over a set of samples. */
export interface PairDepth {
  /** The name of the moving part. */
  readonly part: string;
  /** The name of the obstacle. */
  readonly into: string;
  /** The depth, in meters: 0 when no point entered. */
  readonly depth: number;
  /** The song time of the sample of the deepest point, in seconds. */
  readonly song: number;
  /** The wall time of the sample of the deepest point, in seconds. */
  readonly wall: number;
  /** The bone of the deepest point, or `null` when no point entered. */
  readonly bone: BoneName | null;
  /**
   * The place of the deepest point along its bone: 0 at the joint of the bone, 1 at the joint of
   * its first child. `NaN` for a bone with no child.
   */
  readonly along: number;
  /**
   * The part of a bowed string at the deepest point of the instrument ({@link bowedPlace}), such
   * as `neck`, or none for another point.
   */
  readonly partPlace?: string;
  /**
   * The region of the obstacle at its nearest point to the deepest point: a region of the body
   * ({@link BODY_REGIONS}), or a part of a bowed string ({@link bowedPlace}), or none.
   */
  readonly intoPlace?: string;
  /** The number of samples of the sweep, when the sweep has a goal ({@link PairGoal}). */
  readonly samples?: number;
  /** The number of samples with a depth over the goal, when the sweep has a goal. */
  readonly over?: number;
}

/**
 * Gives the goal of a pair: the depth in meters over which a sample counts, such as the limit of
 * the pair or `--goal` of `pnpm pose-depth`. `Infinity` counts no sample. A deepest point that goes
 * fully through an obstacle keeps one depth, so the count shows a change that the depth hides.
 */
type PairGoal = (pair: Pick<PairDepth, 'part' | 'into'>) => number;

/** The largest distance from a hand, or from the part that it holds, to its note target. */
export interface TargetError {
  /** The hand. */
  readonly side: 'L' | 'R';
  /** The distance, in meters. */
  readonly error: number;
  /** The song time of the sample, in seconds. */
  readonly song: number;
}

/** The points of a moving part: one corner for each place in the bind pose. */
interface PartPoints {
  /** The corners in the mesh data. */
  readonly corners: readonly number[];
}

/** The points of the parts of each mesh, by the list of their bones. */
const PART_POINTS = new WeakMap<PlayerModel['mesh'], Map<string, PartPoints>>();

/**
 * Gives the corners whose main bone is one of some bones, with one corner for each place in the
 * bind pose: the corners of a vertex share a place.
 *
 * @param mesh The mesh.
 * @param bones The bones.
 * @returns The points.
 */
function partPoints(mesh: PlayerModel['mesh'], bones: readonly BoneName[]): PartPoints {
  let parts = PART_POINTS.get(mesh);
  if (!parts) {
    parts = new Map();
    PART_POINTS.set(mesh, parts);
  }
  const key = bones.join(' ');
  const known = parts.get(key);
  if (known) {
    return known;
  }

  const wanted = new Set(bones.map(boneIndex));
  const places = new Map<string, number>();
  const p = mesh.positions;
  for (let c = 0; c < mesh.bones.length; c++) {
    const place = `${p[c * 3]} ${p[c * 3 + 1]} ${p[c * 3 + 2]}`;
    if (wanted.has(mesh.bones[c] ?? -1) && !places.has(place)) {
      places.set(place, c);
    }
  }
  const found = { corners: [...places.values()] };
  parts.set(key, found);
  return found;
}

/**
 * The region of the body of each bone of a body obstacle, for the place of a clip. A cap of an
 * open loop of the body, such as the cut to an upper arm, is the `arm root`.
 */
export const BODY_REGIONS: Readonly<Partial<Record<BoneName, string>>> = {
  hips: 'belly',
  spine: 'belly',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  jaw: 'jaw',
  eyeL: 'head',
  eyeR: 'head',
  earL: 'head',
  earR: 'head',
  tail1: 'tail',
  tail2: 'tail',
  trunk1: 'trunk',
  trunk2: 'trunk',
  trunk3: 'trunk',
  shoulderL: 'shoulder L',
  shoulderR: 'shoulder R',
  thighL: 'thigh L',
  thighR: 'thigh R',
  shinL: 'shin L',
  shinR: 'shin R',
  footL: 'foot L',
  footR: 'foot R',
};

/** The distance below the tail end of a bowed string from which a point is on the end pin. */
const END_PIN_FROM = 0.005;

/**
 * Gives the part of a bowed string at a posed point, from its place along the instrument in the
 * violin axes (`VIOLIN`): the end pin below the tail end, the body, the neck up to the nut, and the
 * scroll after the nut. The fingerboard target of the model gives the axes in the pose.
 *
 * @param posed The posed skeleton.
 * @param point The posed point.
 * @returns The part, or `null` for an instrument with no fingerboard.
 */
export function bowedPlace(posed: PosedSkeleton, point: Vector3): string | null {
  const board = posed.model.instrument.targets.find((target) => target.kind === 'fingerboard');
  if (!board) {
    return null;
  }
  const nut = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.from }));
  const end = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.to }));
  const span = nut.distanceTo(end);
  if (!(span > 0)) {
    return null;
  }
  const axis = nut.clone().sub(end).divideScalar(span);
  const x =
    VIOLIN.nut + (point.clone().sub(nut).dot(axis) * (VIOLIN.nut - VIOLIN.fingerboardEnd)) / span;
  if (x < -END_PIN_FROM) {
    return 'end pin';
  }
  if (x <= VIOLIN.bodyLength) {
    return 'body';
  }
  return x <= VIOLIN.nut ? 'neck' : 'scroll';
}

/** The places of the deepest point of a pair ({@link PairDepth}), as {@link clipPlaces} fills them. */
interface ClipPlaces {
  /** The part of a bowed string at the deepest point of the instrument. */
  partPlace?: string;
  /** The region of the obstacle at its nearest point to the deepest point. */
  intoPlace?: string;
}

/**
 * Gives the places of the deepest point of a moving part in an obstacle: the part of a bowed
 * string for a point of the instrument, and the region of the obstacle at its nearest point, a
 * region of a body obstacle or a part of the bowed string of the player.
 *
 * @param posed The posed skeleton.
 * @param obstacle The name of the obstacle.
 * @param surface The surface of the obstacle.
 * @param point The deepest point.
 * @param bone The main bone of the deepest point.
 * @returns The places.
 */
function clipPlaces(
  posed: PosedSkeleton,
  obstacle: string,
  surface: ClosedSurface,
  point: Vector3,
  bone: number,
): ClipPlaces {
  const places: ClipPlaces = {};
  const part = BONE_NAMES[bone] === 'instrument' ? bowedPlace(posed, point) : null;
  if (part !== null) {
    places.partPlace = part;
  }
  const near = surfaceNearest(surface, point);
  const bones = surface.bones;
  let into: string | null = null;
  if (bones && near.triangle >= 0) {
    const main = bones[near.triangle];
    const name = main === undefined ? undefined : BONE_NAMES[main];
    into = main === undefined ? 'arm root' : name ? (BODY_REGIONS[name] ?? name) : null;
  } else if (obstacle === posed.model.instrument.id) {
    into = bowedPlace(posed, near.point);
  }
  if (into !== null) {
    places.intoPlace = into;
  }
  return places;
}

/**
 * Gives the place of a posed point along the main bone of its corner.
 *
 * @param posed The posed skeleton.
 * @param bone The index of the bone.
 * @param point The posed point.
 * @returns 0 at the joint of the bone, 1 at the joint of its first child, `NaN` with no child.
 */
function alongBone(posed: PosedSkeleton, bone: number, point: Vector3): number {
  const child = posed.model.skeleton.parents.indexOf(bone);
  const from = posed.frames[bone]?.position;
  const to = posed.frames[child]?.position;
  if (child < 0 || !from || !to) {
    return Number.NaN;
  }
  const axis = new Vector3().subVectors(to, from);
  return new Vector3().subVectors(point, from).dot(axis) / axis.lengthSq();
}

/**
 * Gets each posed sample of a sweep, with the closed surface of each obstacle by its name, for
 * the other checks of a role.
 */
export type SweepVisit = (
  posed: PosedSkeleton,
  sample: SweepSample,
  surfaces: ReadonlyMap<string, ClosedSurface>,
) => void;

/**
 * Sweeps one player of a role over a set of samples: in each sample, it poses the skin of the GPU
 * (`posedCorner()`), and measures the depth of each point of each moving part in each obstacle of
 * the part (`closedDepth()`). It gives the deepest point of each pair. With a goal, each pair also
 * gives its samples and the samples with a depth over the goal.
 *
 * @param role The role.
 * @param player The player.
 * @param samples The samples.
 * @param visit Gets each posed sample with the surfaces of the obstacles.
 * @param goal Gives the goal of each pair, or none for no count.
 * @returns The deepest point of each pair of a moving part and an obstacle.
 */
export function sweepDepths(
  role: RoleSweep,
  player: SweepPlayer,
  samples: Iterable<SweepSample>,
  visit?: SweepVisit,
  goal?: PairGoal,
): PairDepth[] {
  const { mesh } = player.model;
  const parts = role.parts.map((part) => ({ part, points: partPoints(mesh, part.bones) }));
  const deepest = new Map<string, PairDepth>();
  const enters = (part: SweepPart, obstacle: string): boolean =>
    !part.into || part.into.includes(obstacle);
  for (const { part } of parts) {
    for (const { name } of role.obstacles.filter((o) => enters(part, o.name))) {
      deepest.set(`${part.name} ${name}`, {
        part: part.name,
        into: name,
        depth: 0,
        song: 0,
        wall: 0,
        bone: null,
        along: Number.NaN,
      });
    }
  }

  const goals = new Map(
    [...deepest].map(([key, pair]) => [key, goal ? goal(pair) : Infinity] as const),
  );
  const counts = new Map([...deepest.keys()].map((key) => [key, { samples: 0, over: 0 }]));
  for (const sample of samples) {
    const posed = poseSkeleton(player.model, player.poseAt(sample));
    const surfaces = role.obstacles.map((obstacle) => ({
      name: obstacle.name,
      surface: obstacle.surface(posed),
    }));
    visit?.(posed, sample, new Map(surfaces.map(({ name, surface }) => [name, surface])));
    for (const { part, points } of parts) {
      const placed = points.corners.map((c) => new Vector3(...posedCorner(posed, c)));
      for (const { name, surface } of surfaces.filter((s) => enters(part, s.name))) {
        const key = `${part.name} ${name}`;
        const { depth, index } = closedDepth(placed, surface);
        const count = counts.get(key);
        if (count) {
          count.samples += 1;
          count.over += depth > (goals.get(key) ?? Infinity) ? 1 : 0;
        }
        const best = deepest.get(key);
        const corner = points.corners[index];
        const point = placed[index];
        if (!best || depth <= best.depth || corner === undefined || !point) {
          continue;
        }
        const bone = mesh.bones[corner] ?? 0;
        deepest.set(key, {
          part: best.part,
          into: best.into,
          depth,
          song: sample[0],
          wall: sample[1],
          bone: BONE_NAMES[bone] ?? null,
          along: alongBone(posed, bone, point),
          ...clipPlaces(posed, name, surface, point, bone),
        });
      }
    }
  }
  if (!goal) {
    return [...deepest.values()];
  }
  const counted: PairDepth[] = [];
  for (const [key, pair] of deepest) {
    const count = counts.get(key);
    counted.push({ ...pair, samples: count?.samples ?? 0, over: count?.over ?? 0 });
  }
  return counted;
}

/**
 * Measures the distance from each hand of a player, or from the part that it holds, to its note
 * targets, with the pose of the skeleton.
 *
 * @param player The player.
 * @returns The largest error of each hand with a note target.
 */
export function targetErrors(player: SweepPlayer): TargetError[] {
  const worst = new Map<'L' | 'R', TargetError>();
  for (const { side, sample, error: errorOf } of player.targets()) {
    const error = errorOf(poseSkeleton(player.model, player.poseAt(sample)));
    if (error >= (worst.get(side)?.error ?? -1)) {
      worst.set(side, { side, error, song: sample[0] });
    }
  }
  return [...worst.values()];
}

/** The largest depth of a pair of parts in a set of samples. */
interface DepthLimit {
  /** The depth, in meters. */
  readonly depth: number;
  /** The accepted depth that sets the limit, or `null` for the limit of the part or the contact. */
  readonly accepted: AcceptedDepth | null;
}

/**
 * Gives the largest depth of a pair of parts in a set of samples: the accepted depth of the pair,
 * the limit of the part ({@link SweepPart.limit}), or the contact depth of the role.
 *
 * @param role The role.
 * @param pair The pair.
 * @param samples The name of the set of samples.
 * @returns The limit, with the accepted depth that sets it, if any.
 */
export function depthLimit(
  role: RoleSweep,
  pair: Pick<PairDepth, 'part' | 'into'>,
  samples: string,
): DepthLimit {
  const accepted = role.accepted.find(
    (a) => a.part === pair.part && a.into === pair.into && a.samples === samples,
  );
  if (accepted) {
    return { depth: accepted.depth, accepted };
  }
  const part = role.parts.find((p) => p.name === pair.part);
  return { depth: part?.limit ?? role.contact, accepted: null };
}

/**
 * Writes a pair depth as one line of text.
 *
 * @param pair The pair.
 * @returns The text, such as `forearms in body: 5.9 cm at song 12.25 s (forearmL 0.62)`.
 */
export function pairText(pair: PairDepth): string {
  const along = Number.isNaN(pair.along) ? '' : ` ${pair.along.toFixed(2)}`;
  const place = pair.bone ? ` (${pair.bone}${along})` : '';
  const from = pair.partPlace ? `, the ${pair.partPlace}` : '';
  const into = pair.intoPlace ? `${from ? '' : ','} into the ${pair.intoPlace}` : '';
  return `${pair.part} in ${pair.into}: ${(pair.depth * 100).toFixed(1)} cm at song ${pair.song.toFixed(2)} s, wall ${pair.wall.toFixed(2)} s${place}${from}${into}`;
}

/** The name of the obstacle of the body of the player in each role. */
export const BODY_OBSTACLE = 'body';

/** The head and the face of a player, for the gap to an obstacle. */
export const HEAD_PART: SweepPart = { name: 'head', bones: HEAD_BONES };

/** Each paw with its claws, for the gap to the body. */
export const PAW_PARTS: readonly SweepPart[] = [
  { name: 'paw L', bones: ['handL', 'fingersL'] },
  { name: 'paw R', bones: ['handR', 'fingersR'] },
];

/** A part and an obstacle whose smallest gap a sweep measures. */
export interface GapPair {
  /** The part. */
  readonly part: SweepPart;
  /** The name of the obstacle. */
  readonly into: string;
}

/** The smallest gap from a part to an obstacle over a set of samples. */
export interface PairGap {
  /** The name of the part. */
  readonly part: string;
  /** The name of the obstacle. */
  readonly into: string;
  /** The gap, in meters: 0 when the parts touch, and infinite with no sample. */
  readonly gap: number;
  /** The song time of the first sample with the smallest gap, in seconds. */
  readonly song: number;
  /** The wall time of the first sample with the smallest gap, in seconds. */
  readonly wall: number;
  /** The bone of the nearest point of the part, or `null` with no sample. */
  readonly bone: BoneName | null;
}

/** The smallest gaps of some pairs over the samples of a sweep. */
interface GapSweep {
  /** Measures the gaps of one posed sample. Give it to {@link sweepDepths}. */
  readonly visit: SweepVisit;
  /** Gives the smallest gap of each pair over the samples so far. */
  readonly gaps: () => PairGap[];
}

/**
 * Gives the pairs of the gaps of a role: the head to each obstacle that is not the body, such as
 * the case of a piano, and each paw to the body. The head is a part of the body, so it has no gap
 * to it.
 *
 * @param role The role.
 * @returns The pairs.
 */
export function gapPairs(role: Pick<RoleSweep, 'obstacles'>): GapPair[] {
  const names = role.obstacles.map((obstacle) => obstacle.name);
  const head = names
    .filter((name) => name !== BODY_OBSTACLE)
    .map((into): GapPair => ({ part: HEAD_PART, into }));
  const paws = names.includes(BODY_OBSTACLE)
    ? PAW_PARTS.map((part): GapPair => ({ part, into: BODY_OBSTACLE }))
    : [];
  return [...head, ...paws];
}

/** The triangles of a part of a mesh, for a gap. */
interface PartTriangles {
  /** The first corner of each triangle, in the order of the mesh. */
  readonly firsts: readonly number[];
  /** One triangle of each piece of the triangles that share corners, by its index in `firsts`. */
  readonly probes: readonly number[];
}

/** The triangles of the parts of each mesh, by the list of their bones. */
const PART_TRIANGLES = new WeakMap<PlayerModel['mesh'], Map<string, PartTriangles>>();

/**
 * Gives the triangles whose main bone is one of some bones, and one triangle of each piece of
 * them. The triangles that share a corner place in the bind pose are in one piece.
 *
 * @param mesh The mesh.
 * @param bones The bones.
 * @returns The triangles.
 */
function partTriangles(mesh: PlayerModel['mesh'], bones: readonly BoneName[]): PartTriangles {
  let parts = PART_TRIANGLES.get(mesh);
  if (!parts) {
    parts = new Map();
    PART_TRIANGLES.set(mesh, parts);
  }
  const key = bones.join(' ');
  const known = parts.get(key);
  if (known) {
    return known;
  }

  const wanted = new Set(bones.map(boneIndex));
  const firsts: number[] = [];
  for (let c = 0; c < mesh.bones.length; c += 3) {
    if (wanted.has(mesh.bones[c] ?? -1)) {
      firsts.push(c);
    }
  }

  // Each triangle starts as its own piece. A shared corner place joins two pieces.
  const parent = firsts.map((_, i) => i);
  const rootOf = (i: number): number => {
    let r = i;
    while (parent[r] !== r) {
      r = parent[r] ?? r;
    }
    parent[i] = r;
    return r;
  };
  const owner = new Map<string, number>();
  const p = mesh.positions;
  for (const [t, first] of firsts.entries()) {
    for (let c = first; c < first + 3; c++) {
      const place = `${p[c * 3]} ${p[c * 3 + 1]} ${p[c * 3 + 2]}`;
      const other = owner.get(place);
      if (other === undefined) {
        owner.set(place, t);
      } else {
        parent[rootOf(t)] = rootOf(other);
      }
    }
  }
  const probes = [...new Set(firsts.map((_, t) => rootOf(t)))];
  const found = { firsts, probes };
  parts.set(key, found);
  return found;
}

/**
 * Starts the sweep of the smallest gaps of some pairs: in each sample, it poses the triangles of
 * each part with the skin of the GPU (`posedCorner()`), and measures the gap to the closed
 * surface of the obstacle (`surfaceGap()`), with one corner of each piece of the part for the test
 * of a part inside the obstacle. A gap of 0 is a touch. The smallest gap so far is the
 * limit of the next sample, so that a far sample costs little.
 *
 * @param pairs The pairs.
 * @returns The sweep.
 */
export function gapSweep(pairs: readonly GapPair[]): GapSweep {
  const smallest = pairs.map(({ part, into }): PairGap => ({
    part: part.name,
    into,
    gap: Infinity,
    song: 0,
    wall: 0,
    bone: null,
  }));
  const visit: SweepVisit = (posed, [song, wall], surfaces) => {
    const { mesh } = posed.model;
    for (const [i, { part, into }] of pairs.entries()) {
      const best = smallest[i];
      const surface = surfaces.get(into);
      if (!best || best.gap === 0 || !surface) {
        continue;
      }
      const { firsts, probes } = partTriangles(mesh, part.bones);
      const triangles = firsts.map(
        (c) =>
          new Triangle(
            new Vector3(...posedCorner(posed, c)),
            new Vector3(...posedCorner(posed, c + 1)),
            new Vector3(...posedCorner(posed, c + 2)),
          ),
      );
      const { gap, index } = surfaceGap(triangles, surface, best.gap, probes);
      const corner = firsts[index];
      if (corner !== undefined && gap < best.gap) {
        const bone = BONE_NAMES[mesh.bones[corner] ?? 0] ?? null;
        smallest[i] = { ...best, gap, song, wall, bone };
      }
    }
  };
  return { visit, gaps: () => [...smallest] };
}

/**
 * Writes a pair gap as one line of text.
 *
 * @param pair The pair.
 * @returns The text, such as `head to case: 3.2 cm at song 12.25 s, wall 22.50 s (head)`.
 */
export function gapText(pair: PairGap): string {
  if (!pair.bone) {
    return `${pair.part} to ${pair.into}: no sample`;
  }
  return `${pair.part} to ${pair.into}: ${(pair.gap * 100).toFixed(1)} cm at song ${pair.song.toFixed(2)} s, wall ${pair.wall.toFixed(2)} s (${pair.bone})`;
}
