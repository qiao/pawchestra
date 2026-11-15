/**
 * Measures the rest of a seated player on its lap (design 5.2, 5.3): the lower end of the
 * instrument on the skin of the thighs, the tilt of the instrument, the place of the left paw on
 * it, the upright bow at the right side, and the right arm that holds the bow. `pnpm hold-fit`
 * gives the goals of the upright rest of the violin and of the right arm in its rest columns.
 */
import { MathUtils, Ray, Triangle, Vector3 } from 'three';

import { foldedFaces, mainBone, roleBodies, sideSplit } from './fold-probe.ts';
import type { RoleSource, SideSplit } from './fold-probe.ts';
import type { DemoFile } from './patch-demos.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { BONE_NAMES, boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import type { SpeciesId } from '../src/models/species.ts';
import {
  createStudioPose,
  poseStudioBones,
  skinStudioMesh,
  studioOffsets,
} from '../src/models/studio-rig.ts';
import { bowedRig, holdOf } from '../src/pose/bowed-rig.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { isInFamily } from '../src/pose/family.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import type { ScenePoseBuffer } from '../src/pose/pose-at.ts';
import type { NoteLayer, PosePlan } from '../src/pose/plan.ts';
import { closeSurface, closedDepth, openLoops, posedPart } from '../src/pose/test-clearance.ts';
import type { ClosedSurface } from '../src/pose/test-clearance.ts';
import { poseSkeleton, posedPiecePoint, posedPoint } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { NOT_STARTED, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { posedCorner } from '../src/pose/test-skin.ts';
import type { SweepObstacle } from '../src/pose/test-sweep.ts';
import { INSTRUMENT_PART } from '../src/pose/test-sweep-roles.ts';
import type { AnimalPose, SeatAudibility } from '../src/pose/types.ts';
import { windHoldOf, windRig } from '../src/pose/winds.ts';

/**
 * The wall times of the rest samples of the lap rest, in seconds, before the first play: the times
 * of the rest probe. The idle motion moves the bow tip of the rabbit by up to 0.8 cm between
 * them.
 */
const REST_WALLS: readonly number[] = [10, 13.7, 21.1, 29.3];

/**
 * The bones of the skin under the lower end of an instrument with no bow, such as the flute of the
 * tan fox on its right leg: the thighs and the hips.
 */
const LAP_BONES: readonly BoneName[] = ['thighL', 'thighR', 'hips'];

/**
 * The bones of the top of the lap of a studio body under the lower end of a violin and under the
 * frog of the bow: the bones of `lapPoint()` of `pose/lap.ts`. The skin blends the thighs into the
 * hips, and the round belly of the rabbit covers the top of its thighs with triangles of the
 * spine: the triangles of the thighs over the middle of its thighs are their underside.
 */
const TOP_BONES: readonly BoneName[] = ['thighL', 'thighR', 'shinL', 'shinR', 'hips', 'spine'];

/**
 * The bones of the arms that the bow must not go into: the upper arms and the forearms. The stick
 * lies in the fingers of the right paw (design 5.3), so the paws do not count.
 */
const ARM_BONES: readonly BoneName[] = ['upperArmL', 'forearmL', 'upperArmR', 'forearmR'];

/**
 * The bones of the trunk whose skin gives the back and the right side of the trunk at the height
 * of the right elbow.
 */
const TRUNK_BONES: readonly BoneName[] = ['hips', 'spine', 'chest'];

/**
 * The height of the lower end of an instrument, in meters: each corner of the instrument less
 * than this above its lowest corner is a corner of the lower end. The same length along the bow
 * from its frog end gives the corners of the frog end.
 */
const END_HEIGHT = 0.02;

/**
 * The step of the points along each edge of the bow, in meters. The stick is one long box, so its
 * corners alone miss a thigh or an arm that the middle of the stick goes through.
 */
const BOW_STEP = 0.01;

/** The upright bow at the right side in one rest sample. */
interface BowRest {
  /**
   * The angle of the bow from the vertical, from the frog to the tip, in degrees: above 90° with
   * the tip below the frog.
   */
  readonly tilt: number;
  /**
   * The height of the frog end of the bow above the right side of the top of the lap, in meters:
   * 0 when a corner of the frog end is in the body, and `Infinity` when the frog is not over it.
   */
  readonly frogGap: number;
  /** The depth of the deepest corner of the frog end in the body, in meters: 0 for none. */
  readonly frogDepth: number;
  /** The depth of the deepest point of the bow in the body, in meters: 0 for none. */
  readonly bodyDepth: number;
  /** The depth of the deepest point of the bow in the upper arms and the forearms, in meters. */
  readonly armDepth: number;
}

/**
 * The right arm of a seated player in one rest sample, in the axes of the model (the player faces
 * -z, and its right is +x). The joints are the posed heads of the `upperArmR` bone (the shoulder
 * joint) and of the `forearmR` bone (the elbow joint).
 */
interface ArmRest {
  /** The height of the elbow joint above the shoulder joint, in meters: negative below it. */
  readonly rise: number;
  /**
   * The distance of the elbow joint behind the back of the trunk at the height of the elbow, in
   * meters: negative in front of the back, and `Infinity` when no triangle of the skin of the
   * trunk crosses that height.
   */
  readonly back: number;
  /**
   * The distance of the elbow joint out from the right side of the trunk at the height of the
   * elbow, seen from the front, in meters: negative inside the side, and `Infinity` when no
   * triangle of the skin of the trunk crosses that height.
   */
  readonly out: number;
  /**
   * The angle of the upper arm from the vertical, from the shoulder joint down to the elbow joint,
   * in degrees.
   */
  readonly upperArm: number;
}

/** The lap rest of a seated player in one rest sample. */
interface LapRest {
  /**
   * The gap of the lower end of the instrument to the lap, in meters: 0 when a corner of the end is
   * in the body. With a bow, it is the height of the end above the left side of the top of the lap,
   * or `Infinity` when the end is not over it. With no bow, it is the distance to the nearest
   * triangle of the skin of the thighs and the hips.
   */
  readonly endGap: number;
  /** The depth of the deepest corner of the lower end in the body, in meters: 0 for none. */
  readonly endDepth: number;
  /** The depth of the deepest corner of the instrument in the body, in meters: 0 for none. */
  readonly heldDepth: number;
  /**
   * The angle of the instrument from the vertical, from the end of the fingerboard to the nut, in
   * degrees, or `null` for an instrument with no fingerboard.
   */
  readonly tilt: number | null;
  /**
   * The place of the middle of the left palm along the instrument: 0 at its lower end, 1 at its
   * upper end. `null` for an instrument with no fingerboard.
   */
  readonly pawPlace: number | null;
  /** The bow, or `null` for a player with no bow, such as a flutist. */
  readonly bow: BowRest | null;
  /** The right arm that holds the bow, or `null` for a player with no bow. */
  readonly arm: ArmRest | null;
}

/**
 * Gives the angle of a direction from the vertical.
 *
 * @param direction The direction.
 * @returns The angle, in degrees: 0 straight up, 180 straight down.
 */
function fromVertical(direction: Vector3): number {
  return MathUtils.radToDeg(direction.angleTo(new Vector3(0, 1, 0)));
}

/**
 * Finds the frog and the tip of a bow: the two corners of the bow that are farthest apart. The
 * frog is the end nearer to the right paw.
 *
 * @param bow The corners of the bow.
 * @param paw The right paw.
 * @returns The frog and the tip, or `null` with no corner.
 */
function bowEnds(
  bow: readonly Vector3[],
  paw: Vector3,
): { readonly frog: Vector3; readonly tip: Vector3 } | null {
  const [first] = bow;
  if (!first) {
    return null;
  }
  let frog = first;
  let tip = first;
  let far = 0;
  for (const a of bow) {
    for (const b of bow) {
      const d = a.distanceToSquared(b);
      if (d > far) {
        far = d;
        frog = a;
        tip = b;
      }
    }
  }
  return tip.distanceTo(paw) < frog.distanceTo(paw) ? { frog: tip, tip: frog } : { frog, tip };
}

/**
 * Gives the points along each edge of a set of triangles: the corners, and a point at each
 * {@link BOW_STEP} along each edge. An edge of two triangles counts one time.
 *
 * @param corners The corners, three for each triangle.
 * @returns The points.
 */
function edgePoints(corners: readonly Vector3[]): Vector3[] {
  const seen = new Set<string>();
  const key = (p: Vector3): string => `${p.x.toFixed(5)} ${p.y.toFixed(5)} ${p.z.toFixed(5)}`;
  const points: Vector3[] = [];
  for (let t = 0; t + 2 < corners.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = corners[t + k];
      const b = corners[t + ((k + 1) % 3)];
      if (!a || !b) {
        continue;
      }
      const [ka, kb] = [key(a), key(b)].toSorted();
      const edge = `${ka}|${kb}`;
      if (seen.has(edge)) {
        continue;
      }
      seen.add(edge);
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / BOW_STEP));
      for (let s = 0; s < steps; s++) {
        points.push(new Vector3().lerpVectors(a, b, s / steps));
      }
    }
  }
  return points;
}

/**
 * Gives the distance from some points to the nearest triangle of a skin.
 *
 * @param points The points.
 * @param skin The triangles of the skin.
 * @returns The distance, in meters, or `Infinity` with no point or no triangle.
 */
function skinGap(points: readonly Vector3[], skin: readonly Triangle[]): number {
  const near = new Vector3();
  let gap = Infinity;
  for (const p of points) {
    for (const t of skin) {
      gap = Math.min(gap, t.closestPointToPoint(p, near).distanceTo(p));
    }
  }
  return gap;
}

/**
 * Gives the points of the bow of a posed player: a point at each {@link BOW_STEP} along each edge
 * of the triangles of the `bow` bone. The research probes of the lift and the lowering use them.
 *
 * @param posed The posed skeleton of the player.
 * @returns The points, in the model axes, or none for a player with no bow.
 */
export function bowPoints(posed: PosedSkeleton): Vector3[] {
  const { bones } = posed.model.mesh;
  const bow = boneIndex('bow');
  const corners: Vector3[] = [];
  for (let c = 0; c + 2 < bones.length; c += 3) {
    if (bones[c] === bow) {
      for (let k = 0; k < 3; k++) {
        corners.push(new Vector3(...posedCorner(posed, c + k)));
      }
    }
  }
  return edgePoints(corners);
}

/**
 * Gives the height of some points above the top of the lap: for each point, the height above the
 * highest crossing of the vertical line through the point with a triangle of the skin, below the
 * point. A point with no such crossing is not over the lap.
 *
 * @param points The points.
 * @param skin The triangles of the top of the lap.
 * @returns The smallest height, in meters, or `Infinity` when no point is over the lap.
 */
function heightAbove(points: readonly Vector3[], skin: readonly Triangle[]): number {
  const down = new Ray();
  const hit = new Vector3();
  let gap = Infinity;
  for (const p of points) {
    down.set(p, new Vector3(0, -1, 0));
    for (const t of skin) {
      if (down.intersectTriangle(t.a, t.b, t.c, false, hit)) {
        gap = Math.min(gap, p.y - hit.y);
      }
    }
  }
  return gap;
}

/**
 * Gives the closed surface of the upper arms and the forearms of a posed player, with a cap on
 * each open loop: the cuts to the shoulders and to the paws.
 *
 * @param posed The posed skeleton.
 * @returns The closed surface.
 */
export function armSurface(posed: PosedSkeleton): ClosedSurface {
  const { triangles } = posedPart(posed, ARM_BONES);
  return closeSurface(triangles, openLoops(triangles));
}

/**
 * Measures the bow of a seated player in one rest sample ({@link BowRest}).
 *
 * @param posed The posed skeleton of the player.
 * @param corners The posed corners of the `bow` bone, three for each triangle.
 * @param body The closed surface of the body.
 * @param frogSkin The triangles of the right side of the top of the lap.
 * @returns The bow, or `null` with no corner.
 */
function bowRest(
  posed: PosedSkeleton,
  corners: readonly Vector3[],
  body: ClosedSurface,
  frogSkin: readonly Triangle[],
): BowRest | null {
  const paw = posed.frames[boneIndex('handR')]?.position ?? new Vector3();
  const ends = bowEnds(corners, paw);
  if (!ends) {
    return null;
  }
  const axis = new Vector3().subVectors(ends.tip, ends.frog).normalize();
  const frogEnd = corners.filter((p) => p.clone().sub(ends.frog).dot(axis) < END_HEIGHT);
  const frogDepth = closedDepth(frogEnd, body).depth;
  const points = edgePoints(corners);
  return {
    tilt: fromVertical(axis),
    frogGap: frogDepth > 0 ? 0 : heightAbove(frogEnd, frogSkin),
    frogDepth,
    bodyDepth: closedDepth(points, body).depth,
    armDepth: closedDepth(points, armSurface(posed)).depth,
  };
}

/**
 * Gives the points where a horizontal plane cuts the edges of some triangles.
 *
 * @param triangles The triangles.
 * @param height The height of the plane.
 * @returns The points.
 */
function sectionPoints(triangles: readonly Triangle[], height: number): Vector3[] {
  const points: Vector3[] = [];
  for (const t of triangles) {
    const corners = [t.a, t.b, t.c];
    for (let k = 0; k < 3; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 3];
      if (!a || !b || a.y === b.y || (a.y - height) * (b.y - height) > 0) {
        continue;
      }
      points.push(new Vector3().lerpVectors(a, b, (height - a.y) / (b.y - a.y)));
    }
  }
  return points;
}

/**
 * Gives the triangles of the trunk of a posed player, each moved by its main bone alone: the bone
 * of its first corner, one of {@link TRUNK_BONES}. The skin of a studio body gives the side of the
 * trunk under the armpit a part of the weight of the upper arm, so a raised arm drags that skin
 * out. In a rest of the rabbit, the posed skin of the trunk can reach 26 cm out from the middle at
 * the height of the right elbow, and the trunk moved by its main bones alone reaches 14 cm.
 *
 * @param posed The posed skeleton of the player.
 * @returns The triangles, in the model axes.
 */
function trunkTriangles(posed: PosedSkeleton): Triangle[] {
  const { positions, bones } = posed.model.mesh;
  const trunk = new Set(TRUNK_BONES.map(boneIndex));
  const triangles: Triangle[] = [];
  for (let c = 0; c + 2 < bones.length; c += 3) {
    const bone = BONE_NAMES[bones[c] ?? -1];
    if (!bone || !trunk.has(bones[c] ?? -1)) {
      continue;
    }
    const [a, b, d] = [0, 1, 2].map(
      (k) =>
        new Vector3(
          ...posedPoint(posed, bone, [
            positions[(c + k) * 3] ?? 0,
            positions[(c + k) * 3 + 1] ?? 0,
            positions[(c + k) * 3 + 2] ?? 0,
          ]),
        ),
    );
    if (a && b && d) {
      triangles.push(new Triangle(a, b, d));
    }
  }
  return triangles;
}

/**
 * Measures the right arm of a posed player ({@link ArmRest}). The plane at the height of the
 * elbow joint cuts the trunk ({@link trunkTriangles}). The back of the trunk is the cut point
 * farthest back (+z), and the right side is the cut point farthest to the right (+x).
 *
 * @param posed The posed skeleton of the player.
 * @returns The right arm.
 * @throws Error if a bone of the arm has no frame.
 */
function armRest(posed: PosedSkeleton): ArmRest {
  const at = (bone: BoneName): Vector3 => {
    const frame = posed.frames[boneIndex(bone)];
    if (!frame) {
      throw new Error(`The bone "${bone}" has no frame.`);
    }
    return frame.position;
  };
  const shoulder = at('upperArmR');
  const elbow = at('forearmR');
  const cut = sectionPoints(trunkTriangles(posed), elbow.y);
  const back = cut.length > 0 ? elbow.z - Math.max(...cut.map((p) => p.z)) : Infinity;
  const out = cut.length > 0 ? elbow.x - Math.max(...cut.map((p) => p.x)) : Infinity;
  const upper = elbow.clone().sub(shoulder);
  return {
    rise: upper.y,
    back,
    out,
    upperArm: MathUtils.radToDeg(upper.angleTo(new Vector3(0, -1, 0))),
  };
}

/**
 * Measures the lap rest of a seated player in one rest sample, in the axes of the model (the
 * player faces -z). The lower end of the instrument is each corner of the `instrument` bone less
 * than {@link END_HEIGHT} above its lowest corner, and its depth is the depth of its deepest corner
 * in the body (`closedDepth()`). A corner in the body gives the gap 0. The axis of the instrument
 * runs from the end of its fingerboard to the nut. The ends of the bow are the two corners of the
 * `bow` bone that are farthest apart, and the frog is the end nearer to the right paw. The frog end
 * is each corner of the bow less than {@link END_HEIGHT} from the frog along the bow. With a bow,
 * the gap of the lower end is its height above the left side (-x) of the top of the lap
 * ({@link TOP_BONES}), and the gap of the frog end is its height above the right side (+x). With no
 * bow, the gap of the lower end is its distance to the nearest triangle of the skin of
 * {@link LAP_BONES}. The depths of the bow take a point at each {@link BOW_STEP} along each edge
 * of the bow. A player with a bow also gets the measures of its right arm ({@link armRest}).
 *
 * @param posed The posed skeleton of the player.
 * @param body The closed surface of the body, such as the obstacle `body` of the sweep.
 * @returns The lap rest, or `null` for a player with no corner of the `instrument` bone.
 */
function lapRest(posed: PosedSkeleton, body: ClosedSurface): LapRest | null {
  const { bones } = posed.model.mesh;
  const instrument = boneIndex('instrument');
  const bowBone = boneIndex('bow');
  const corner = (c: number): Vector3 => new Vector3(...posedCorner(posed, c));
  const held: Vector3[] = [];
  const bow: Vector3[] = [];
  for (let c = 0; c + 2 < bones.length; c += 3) {
    const bone = bones[c] ?? -1;
    if (bone === instrument) {
      held.push(corner(c), corner(c + 1), corner(c + 2));
    } else if (bone === bowBone) {
      bow.push(corner(c), corner(c + 1), corner(c + 2));
    }
  }
  if (held.length === 0) {
    return null;
  }
  // The skin of the lap, and the left side (-x) and the right side (+x) of its top by the middle
  // of each triangle.
  const skinOf = (names: readonly BoneName[]): Triangle[] => {
    const wanted = new Set(names.map(boneIndex));
    const skin: Triangle[] = [];
    for (let c = 0; c + 2 < bones.length; c += 3) {
      if (wanted.has(bones[c] ?? -1)) {
        skin.push(new Triangle(corner(c), corner(c + 1), corner(c + 2)));
      }
    }
    return skin;
  };
  const top = bow.length > 0 ? skinOf(TOP_BONES) : [];
  const middle = new Vector3();
  const left = top.filter((t) => t.getMidpoint(middle).x < 0);
  const right = top.filter((t) => t.getMidpoint(middle).x > 0);

  const low = Math.min(...held.map((p) => p.y));
  const end = held.filter((p) => p.y < low + END_HEIGHT);
  const endDepth = closedDepth(end, body).depth;
  let endGap = 0;
  if (endDepth === 0) {
    endGap = bow.length > 0 ? heightAbove(end, left) : skinGap(end, skinOf(LAP_BONES));
  }

  const board = posed.model.instrument.targets.find((t) => t.kind === 'fingerboard');
  let tilt: number | null = null;
  let pawPlace: number | null = null;
  if (board) {
    const nut = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.from }));
    const boardEnd = new Vector3(...posedPiecePoint(posed, { bone: board.bone, at: board.to }));
    const axis = nut.sub(boardEnd).normalize();
    tilt = fromVertical(axis);
    const along = held.map((p) => p.dot(axis));
    const [lower, upper] = [Math.min(...along), Math.max(...along)];
    const palm = new Vector3(...posedPoint(posed, 'handL', posed.model.body.palmL));
    pawPlace = (palm.dot(axis) - lower) / (upper - lower);
  }

  return {
    endGap,
    endDepth,
    heldDepth: closedDepth(held, body).depth,
    tilt,
    pawPlace,
    bow: bowRest(posed, bow, body, right),
    arm: bow.length > 0 ? armRest(posed) : null,
  };
}

/** The largest value of a measure of the lap rest over the rest samples, with its sample. */
export interface LapWorst {
  /** The value: meters for a length, degrees for a tilt, a share for a place. */
  readonly value: number;
  /** The demo, the player, and the wall time of the sample, such as `beethoven-8 player 3 (fox-red, chair) wall 10 s`. */
  readonly sample: string;
}

/** The largest value of each measure of the lap rest over the rest samples of a run. */
export interface LapWorsts {
  /** The largest gap of the lower end of the instrument to the skin under it. */
  readonly endGap: LapWorst;
  /** The deepest corner of the lower end in the body. */
  readonly endDepth: LapWorst;
  /** The deepest corner of the instrument in the body. */
  readonly heldDepth: LapWorst;
  /** The largest tilt of the instrument from the vertical, or `null` with no fingerboard. */
  readonly tilt: LapWorst | null;
  /**
   * The place of the left palm farthest from the middle of {@link PAW_PLACES}, or `null` with no
   * fingerboard.
   */
  readonly pawPlace: LapWorst | null;
  /** The largest tilt of the bow from the vertical, or `null` with no bow. */
  readonly bowTilt: LapWorst | null;
  /** The largest gap of the frog end of the bow to the right thigh, or `null` with no bow. */
  readonly frogGap: LapWorst | null;
  /** The deepest corner of the frog end in the body, or `null` with no bow. */
  readonly frogDepth: LapWorst | null;
  /** The deepest point of the bow in the body, or `null` with no bow. */
  readonly bowBody: LapWorst | null;
  /** The deepest point of the bow in the upper arms and the forearms, or `null` with no bow. */
  readonly bowArms: LapWorst | null;
  /** The highest right elbow joint above the right shoulder joint, or `null` with no bow. */
  readonly elbowRise: LapWorst | null;
  /** The right elbow joint farthest behind the back of the trunk, or `null` with no bow. */
  readonly elbowBack: LapWorst | null;
  /** The right elbow joint farthest out from the right side of the trunk, or `null` with no bow. */
  readonly elbowOut: LapWorst | null;
  /** The largest angle of the right upper arm from the vertical, or `null` with no bow. */
  readonly upperArm: LapWorst | null;
}

/**
 * The places of the left palm along a violin in the rest, from its lower end: from the upper bout
 * to the bottom of the neck. The body of the violin model ends at 0.6 of its length, and the hand
 * place on the neck of the model is at 0.675 (`VIOLIN` of `models/instruments/strings.ts`).
 */
export const PAW_PLACES = [0.45, 0.7] as const;

/** The lap rest of one rest sample, with its name. */
interface LapSample {
  /** The demo, the player, and the wall time, as {@link LapWorst.sample}. */
  readonly sample: string;
  /** The lap rest of the sample. */
  readonly rest: LapRest;
}

/**
 * Finds the largest value of each measure of the lap rest over the rest samples. For the place of
 * the left palm, it finds the place farthest from the middle of {@link PAW_PLACES}. Of two samples
 * with the same value, the first stays.
 *
 * @param samples The lap rest of each sample.
 * @returns The largest values, or `null` with no sample.
 */
export function lapWorsts(samples: readonly LapSample[]): LapWorsts | null {
  const largest = (
    value: (rest: LapRest) => number | null | undefined,
    score: (v: number) => number = (v) => v,
  ): LapWorst | null => {
    let worst: LapWorst | null = null;
    for (const { sample, rest } of samples) {
      const v = value(rest);
      if (v !== undefined && v !== null && (!worst || score(v) > score(worst.value))) {
        worst = { value: v, sample };
      }
    }
    return worst;
  };
  const endGap = largest((rest) => rest.endGap);
  const endDepth = largest((rest) => rest.endDepth);
  const heldDepth = largest((rest) => rest.heldDepth);
  if (!endGap || !endDepth || !heldDepth) {
    return null;
  }
  const middle = (PAW_PLACES[0] + PAW_PLACES[1]) / 2;
  return {
    endGap,
    endDepth,
    heldDepth,
    tilt: largest((rest) => rest.tilt),
    pawPlace: largest(
      (rest) => rest.pawPlace,
      (v) => Math.abs(v - middle),
    ),
    bowTilt: largest((rest) => rest.bow?.tilt),
    frogGap: largest((rest) => rest.bow?.frogGap),
    frogDepth: largest((rest) => rest.bow?.frogDepth),
    bowBody: largest((rest) => rest.bow?.bodyDepth),
    bowArms: largest((rest) => rest.bow?.armDepth),
    elbowRise: largest((rest) => rest.arm?.rise),
    elbowBack: largest((rest) => rest.arm?.back),
    elbowOut: largest((rest) => rest.arm?.out),
    upperArm: largest((rest) => rest.arm?.upperArm),
  };
}

/**
 * Measures the lap rest of each seated body of a role ({@link lapRest}) in the rest pose before the
 * first play of each demo, at each wall time of {@link REST_WALLS}, with the holds of now. A
 * standing player, such as a soloist, has no lap and does not count.
 *
 * @param role The role.
 * @param demos The demos. A demo with no seated body of the role adds nothing.
 * @param body The obstacle of the body of the sweep of the role.
 * @returns The largest value of each measure ({@link lapWorsts}), or `null` with no sample.
 */
export function probeLaps(
  role: RoleSource,
  demos: readonly DemoFile[],
  body: SweepObstacle,
): LapWorsts | null {
  const samples: LapSample[] = [];
  for (const demo of demos) {
    const scene = sceneOf(demo.bytes);
    const audible = allAudible(scene.score);
    const buffer = createScenePose(scene.plan);
    const start = -countInAt(scene.plan.beats, 0).lengthSec;
    const id = demo.file.replace(/\.mid$/, '');
    for (const { index, model } of roleBodies(role, scene)) {
      const cast = index === null ? null : scene.layout.players[index]?.cast;
      if (index === null || !cast || cast.support === 'stand') {
        continue;
      }
      for (const wall of REST_WALLS) {
        const pose = poseAt(scene.plan, start, wall, NOT_STARTED, audible, buffer).players[index];
        if (!pose) {
          continue;
        }
        const posed = poseSkeleton(model, pose);
        const rest = lapRest(posed, body.surface(posed));
        if (rest) {
          samples.push({
            sample: `${id} player ${index} (${cast.species}, ${cast.support}) wall ${wall} s`,
            rest,
          });
        }
      }
    }
  }
  return lapWorsts(samples);
}

/**
 * The wall time of the rest sample of a scan of `pnpm hold-fit --scan` by default, in seconds: one
 * of {@link REST_WALLS}.
 */
export const SCAN_WALL = 21.1;

/** A rest sample of a scan: one seated body of a role in the scene of a demo at one wall time. */
export interface ScanSample {
  /** The demo, the player, and the wall time, as {@link LapWorst.sample}. */
  readonly sample: string;
  /** The scene of the demo, with the plan of the holds of the start of the run. */
  readonly scene: TestScene;
  /** The index of the player in the layout. */
  readonly index: number;
  /** The player model, with its studio rig. */
  readonly model: PlayerModel;
  /** The species of the player. */
  readonly species: SpeciesId;
  /** The wall time of the sample, in seconds, before the first play. */
  readonly wall: number;
  /** The audibility of each seat: all audible. */
  readonly audible: readonly SeatAudibility[];
  /** The pose buffer of the scene, which each pose of the sample writes before it reads it. */
  readonly buffer: ScenePoseBuffer;
}

/**
 * Finds the rest samples of a scan: the first seated body of the role in each demo
 * (`roleBodies()` of `pnpm fold-probe`), at each wall time. A standing player, such as a soloist,
 * has no lap and does not count.
 *
 * @param role The role.
 * @param demos The demos. A demo with no seated body of the role adds nothing.
 * @param walls The wall times of the rest pose before the first play, in seconds.
 * @returns The samples, by demo, then by wall time.
 */
export function scanSamples(
  role: RoleSource,
  demos: readonly DemoFile[],
  walls: readonly number[],
): ScanSample[] {
  const samples: ScanSample[] = [];
  for (const demo of demos) {
    const scene = sceneOf(demo.bytes);
    const seated = roleBodies(role, scene).find(
      (body) => body.index !== null && scene.layout.players[body.index]?.cast.support !== 'stand',
    );
    if (!seated || seated.index === null) {
      continue;
    }
    const cast = scene.layout.players[seated.index]?.cast;
    if (!cast) {
      continue;
    }
    const id = demo.file.replace(/\.mid$/, '');
    const audible = allAudible(scene.score);
    const buffer = createScenePose(scene.plan);
    for (const wall of walls) {
      samples.push({
        sample: `${id} player ${seated.index} (${cast.species}, ${cast.support}) wall ${wall} s`,
        scene,
        index: seated.index,
        model: seated.model,
        species: cast.species,
        wall,
        audible,
        buffer,
      });
    }
  }
  return samples;
}

/**
 * Builds the note layer of a player again with the holds of now (`holdOf()` and `windHoldOf()`),
 * as `noteLayerSteps()` of `pose/plan.ts` builds it. Only the rig changes: the strokes of a bowed
 * player and the track of a wind player keep the rig of the old layer, and the rest pose before
 * the first play does not read them.
 *
 * @param note The note layer of the plan.
 * @param model The player model.
 * @param species The species of the player.
 * @param instrument The instrument of the player.
 * @returns The note layer with the new rig.
 * @throws Error for an instrument that is not a bowed string or a wind instrument.
 */
function rebuiltNote(
  note: NoteLayer,
  model: PlayerModel,
  species: SpeciesId,
  instrument: InstrumentId,
): NoteLayer {
  if (note.family === 'bowed' && isInFamily(instrument, ['bowed'])) {
    return { ...note, rig: bowedRig(model, instrument, holdOf(species, instrument)) };
  }
  if (
    (note.family === 'woodwind' || note.family === 'brass') &&
    isInFamily(instrument, ['woodwind', 'brass'])
  ) {
    return { ...note, rig: windRig(model, instrument, windHoldOf(species, instrument)) };
  }
  throw new Error(
    `The scan builds the rig of a bowed string or a wind instrument again, and the ${instrument} has the motion family ${note.family}.`,
  );
}

/**
 * Gives a pose plan with the rig of one player built again with the holds of now
 * ({@link rebuiltNote}). The other players keep their plans. The scene keeps its layout, because
 * no layout rule reads a hold.
 *
 * @param plan The plan of the scene.
 * @param index The index of the player.
 * @param model The player model.
 * @param species The species of the player.
 * @returns The new plan.
 * @throws Error if the plan has no player at the index, or the player has no bowed string or wind
 *   instrument.
 */
function rebuiltRig(
  plan: PosePlan,
  index: number,
  model: PlayerModel,
  species: SpeciesId,
): PosePlan {
  const player = plan.players[index];
  if (!player) {
    throw new Error(`The plan has no player ${index}.`);
  }
  const note = rebuiltNote(player.note, model, species, player.instrument);
  return {
    ...plan,
    players: plan.players.map((other, i) => (i === index ? { ...other, note } : other)),
  };
}

/**
 * Counts the folded faces of the studio skin of a posed player by the side of their main bone, as
 * `countPose()` of `pnpm fold-probe` finds them (`foldedFaces()`).
 *
 * @param model The player model.
 * @param pose The pose of the player.
 * @returns The folded faces by side, or none for a model with no studio rig.
 */
function studioFolds(model: PlayerModel, pose: AnimalPose): SideSplit {
  const rig = model.studio;
  const studio = poseStudioBones(
    rig,
    model.skeleton,
    pose.rotations,
    studioOffsets(pose),
    1,
    createStudioPose(),
  );
  const posed = skinStudioMesh(rig.mesh, studio);
  return sideSplit(foldedFaces(rig.mesh, studio.matrices, posed).map((f) => mainBone(rig.mesh, f)));
}

/** The rest of one scan sample with the holds of now. */
interface ScanRest {
  /** The name of the sample ({@link ScanSample.sample}). */
  readonly sample: string;
  /** The lap rest of the sample ({@link lapRest}), or `null` for a player with no instrument. */
  readonly lap: LapRest | null;
  /** The folded faces of the studio skin by the side of their main bone ({@link studioFolds}). */
  readonly folds: SideSplit;
  /**
   * The depth of the instrument in the body, in meters: the deepest corner of the bones of
   * `INSTRUMENT_PART` of the sweep ({@link instrumentDepth}).
   */
  readonly held: number;
}

/**
 * Gives the depth of the instrument of a posed player in its body, as the sweep measures the part
 * `INSTRUMENT_PART` of `src/pose/test-sweep-roles.ts`: the deepest corner of the bones of the part
 * (`closedDepth()`).
 *
 * @param posed The posed skeleton of the player.
 * @param body The closed surface of the body.
 * @returns The depth, in meters: 0 with no corner in the body.
 */
function instrumentDepth(posed: PosedSkeleton, body: ClosedSurface): number {
  const wanted = new Set(INSTRUMENT_PART.bones.map(boneIndex));
  const { bones } = posed.model.mesh;
  const corners: Vector3[] = [];
  for (let c = 0; c < bones.length; c++) {
    if (wanted.has(bones[c] ?? -1)) {
      corners.push(new Vector3(...posedCorner(posed, c)));
    }
  }
  return corners.length > 0 ? closedDepth(corners, body).depth : 0;
}

/**
 * Measures one rest sample with the holds of now: it builds the rig of the player again
 * ({@link rebuiltRig}), poses the scene in the rest before the first play at the wall time of the
 * sample, and measures the lap rest, the folded faces, and the instrument in the body of the
 * player. The scene, the layout, and the other players stay, so a variant of a hold takes a part
 * of the time of `sceneOf()`.
 *
 * @param sample The sample ({@link scanSamples}).
 * @param body The obstacle of the body of the sweep of the role.
 * @returns The rest of the sample.
 * @throws Error if the pose has no player at the index of the sample.
 */
export function scanRest(sample: ScanSample, body: SweepObstacle): ScanRest {
  const { scene, index, model, species, wall } = sample;
  const plan = rebuiltRig(scene.plan, index, model, species);
  const start = -countInAt(plan.beats, 0).lengthSec;
  const pose = poseAt(plan, start, wall, NOT_STARTED, sample.audible, sample.buffer).players[index];
  if (!pose) {
    throw new Error(`The pose has no player ${index}.`);
  }
  const posed = poseSkeleton(model, pose);
  const surface = body.surface(posed);
  return {
    sample: sample.sample,
    lap: lapRest(posed, surface),
    folds: studioFolds(model, pose),
    held: instrumentDepth(posed, surface),
  };
}
