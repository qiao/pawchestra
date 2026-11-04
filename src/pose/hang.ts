import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import type { Frame } from './frames.ts';
import type { ArmRig } from './ik.ts';

/**
 * The arm of a standing player in the rest pose (design 5.2). It hangs down and a little
 * forward, out to the side by the smallest angle at which it touches the side of the torso and
 * the legs, and the elbow bends, so that the palm rests at the hips.
 */
export interface HangingArm {
  /** The wrist, from the shoulder joint, in the axes of the `shoulder` bone. */
  readonly wrist: Vec3;
  /** The rotation of the `hand` bone, from the rotation of the `shoulder` bone. */
  readonly hand: Quat;
  /** The direction to which the elbow points, in the axes of the chest. */
  readonly pole: Vec3;
}

/** The forward angles of a hanging arm, in radians. */
export interface HangAngles {
  /** The forward swing of the upper arm. */
  readonly forward: number;
  /** The forward bend of the elbow. */
  readonly bend: number;
}

/** The angles of the hanging arm, and its gap to the body. */
const HANG = {
  /**
   * The forward swing of the upper arm. The arm hangs in front of the widest part of the hips, so
   * that it comes nearer to the side: with 8°, the arm stands 8° further out.
   */
  forward: 20 * MathUtils.DEG2RAD,
  /**
   * The forward bend of the elbow. The palms rest at the hips, as an animal of the reference images
   * holds its arms at its belly. With 30° and the short standing legs, the palms hang 0.19 H to
   * 0.25 H below the hip joints, near the knees.
   */
  bend: 60 * MathUtils.DEG2RAD,
  /**
   * The smallest swing of the arm out to the side. The paws of the studio bear rest on the front
   * of its round belly: at 8°, they go 2.2 cm into it.
   */
  minOut: 16 * MathUtils.DEG2RAD,
  /** The largest swing of the arm out to the side. */
  maxOut: 50 * MathUtils.DEG2RAD,
  /** The step of the search for the swing out to the side. */
  step: 1 * MathUtils.DEG2RAD,
  /**
   * The space between the side of the arm and the side of the body, in head heights. The arm
   * touches the body, as the arms of the reference images do (design 5.2). The gap of 0.03 H held
   * it out in the air.
   */
  gap: 0,
} as const;

/** The parts of the body that a hanging arm keeps clear of. */
const BODY: readonly BoneName[] = ['hips', 'spine', 'chest', 'thighL', 'thighR', 'shinL', 'shinR'];

/** A triangle of the body, seen along x: its corners in y and z, and in x. */
interface SideTriangle {
  readonly y: readonly [number, number, number];
  readonly z: readonly [number, number, number];
  readonly x: readonly [number, number, number];
}

/**
 * Collects the triangles of the body parts in the bind pose.
 *
 * @param model The player model.
 * @returns The triangles.
 */
function bodyTriangles(model: PlayerModel): SideTriangle[] {
  const wanted = new Set(BODY.map(boneIndex));
  const { positions, bones } = model.mesh;
  const at = (v: number, k: number): number => positions[v * 3 + k] ?? 0;
  const out: SideTriangle[] = [];
  for (let v = 0; v + 2 < bones.length; v += 3) {
    if (wanted.has(bones[v] ?? -1)) {
      out.push({
        x: [at(v, 0), at(v + 1, 0), at(v + 2, 0)],
        y: [at(v, 1), at(v + 1, 1), at(v + 2, 1)],
        z: [at(v, 2), at(v + 1, 2), at(v + 2, 2)],
      });
    }
  }
  return out;
}

/**
 * Finds the outermost point of the body on one side, on the line along x through a point: the
 * crossing of the line with a triangle of the body that is farthest to that side.
 *
 * @param triangles The triangles of the body.
 * @param point The point. Its x does not count.
 * @param side -1 for the left side (-x) and 1 for the right side.
 * @returns The distance of the crossing from the middle plane x = 0 on that side, or -Infinity
 *   if the line misses the body.
 */
function outermost(triangles: readonly SideTriangle[], point: Vector3, side: number): number {
  let far = -Infinity;
  for (const { x, y, z } of triangles) {
    const area = (y[1] - y[0]) * (z[2] - z[0]) - (y[2] - y[0]) * (z[1] - z[0]);
    if (Math.abs(area) < 1e-12) {
      continue;
    }
    const wb = ((point.y - y[0]) * (z[2] - z[0]) - (y[2] - y[0]) * (point.z - z[0])) / area;
    const wc = ((y[1] - y[0]) * (point.z - z[0]) - (point.y - y[0]) * (z[1] - z[0])) / area;
    const wa = 1 - wb - wc;
    if (wa >= 0 && wb >= 0 && wc >= 0) {
      far = Math.max(far, side * (wa * x[0] + wb * x[1] + wc * x[2]));
    }
  }
  return far;
}

/**
 * Finds how far the corners of some bones reach from a vertical line toward the middle of the
 * body: the inner half width of a part of the hanging arm of the bind pose. The test of the arm
 * against the side of the body counts only this side. The front and the back of a part can reach
 * further, as the front of the upper arm of the tan fox does: 0.140 m against 0.061 m on the
 * inner side.
 *
 * @param model The player model.
 * @param bones The bones of the part.
 * @param axis A point of the vertical line.
 * @param below Only the corners below this height count.
 * @param side -1 for the left arm (-x) and 1 for the right arm.
 * @returns The inner half width, in meters.
 */
function radiusOf(
  model: PlayerModel,
  bones: readonly BoneName[],
  axis: Vec3,
  below: number,
  side: number,
): number {
  const wanted = new Set(bones.map(boneIndex));
  const { positions, bones: cornerBones } = model.mesh;
  let radius = 0;
  for (let v = 0; v < cornerBones.length; v++) {
    const y = positions[v * 3 + 1] ?? 0;
    if (wanted.has(cornerBones[v] ?? -1) && y <= below) {
      radius = Math.max(radius, side * (axis[0] - (positions[v * 3] ?? 0)));
    }
  }
  return radius;
}

/**
 * Finds the length of a paw: the largest drop of a corner of the hand or the fingers below the
 * wrist in the bind pose, where the arm hangs straight down.
 *
 * @param model The player model.
 * @param arm The arm.
 * @returns The length, in meters.
 */
function pawLength(model: PlayerModel, arm: ArmRig): number {
  const wanted = new Set([boneIndex(`hand${arm.side}`), boneIndex(`fingers${arm.side}`)]);
  const { positions, bones } = model.mesh;
  let length = 0;
  for (let v = 0; v < bones.length; v++) {
    if (wanted.has(bones[v] ?? -1)) {
      length = Math.max(length, arm.bind.wrist[1] - (positions[v * 3 + 1] ?? 0));
    }
  }
  return length;
}

/**
 * Gives the direction of a part of a hanging arm: down, out to the side, and forward.
 *
 * @param out The angle out to the side.
 * @param forward The angle forward.
 * @param side -1 for the left arm and 1 for the right arm.
 * @param result The vector to write.
 * @returns `result`, a unit vector.
 */
function downward(out: number, forward: number, side: number, result: Vector3): Vector3 {
  return result.set(
    side * Math.sin(out) * Math.cos(forward),
    -Math.cos(out) * Math.cos(forward),
    -Math.sin(forward),
  );
}

/** The swings of a hanging arm out to the side, in radians. */
interface HangOut {
  /** The swing of the upper arm. */
  readonly upper: number;
  /** The swing of the forearm. */
  readonly lower: number;
}

/**
 * Finds the swings of a hanging arm out to the side: the smallest angles at which each part keeps
 * {@link HANG.gap} from the torso and the legs of the bind pose, seen along x. The inner half
 * width of each part comes from the mesh (`radiusOf()`), so a thicker body or arm swings the arm
 * further out.
 *
 * @param model The player model.
 * @param arm The arm.
 * @param angles The forward swing of the upper arm and the forward bend of the elbow, in radians.
 * @param minOut The smallest swing of the search.
 * @returns The swings.
 */
function hangOut(model: PlayerModel, arm: ArmRig, angles: HangAngles, minOut: number): HangOut {
  const { forward, bend } = angles;
  const h = model.body.headHeight;
  const side = arm.side === 'L' ? -1 : 1;
  const shoulder = new Vector3(...arm.bind.shoulder);
  const elbow = new Vector3(...arm.bind.elbow);
  const wrist = new Vector3(...arm.bind.wrist);
  const upperLength = elbow.distanceTo(shoulder);
  const lowerLength = wrist.distanceTo(elbow);
  const triangles = bodyTriangles(model);
  const s = arm.side;
  const radii = {
    upper: radiusOf(model, [`upperArm${s}`], arm.bind.shoulder, shoulder.y, side),
    elbow: radiusOf(model, [`forearm${s}`], arm.bind.elbow, Infinity, side),
    lower: radiusOf(model, [`forearm${s}`], arm.bind.elbow, Infinity, side),
    hand: radiusOf(model, [`hand${s}`, `fingers${s}`], arm.bind.wrist, Infinity, side),
  };
  // The points of the arm that must keep clear: the lower half of the upper arm, the forearm,
  // and the hand, each with the radius of its part. The shoulder ball sinks into the torso. The
  // hand points are at a third, two thirds, and the end of the paw below the wrist.
  const paw = pawLength(model, arm);
  const checks: readonly (readonly [part: 'upper' | 'elbow' | 'lower' | 'hand', along: number])[] =
    [
      ['upper', 0.5],
      ['upper', 0.75],
      ['elbow', 0],
      ['lower', 0.33],
      ['lower', 0.67],
      ['lower', 1],
      ['hand', paw / 3],
      ['hand', (2 * paw) / 3],
      ['hand', paw],
    ];

  const upper = new Vector3();
  const lower = new Vector3();
  const point = new Vector3();
  const isClear = (outUpper: number, outLower: number, parts: readonly string[]): boolean => {
    downward(outUpper, forward, side, upper);
    downward(outLower, forward + bend, side, lower);
    return checks.every(([part, along]) => {
      if (!parts.includes(part)) {
        return true;
      }
      point.copy(shoulder);
      if (part === 'upper' || part === 'elbow') {
        point.addScaledVector(upper, part === 'upper' ? along * upperLength : upperLength);
      } else {
        point.addScaledVector(upper, upperLength);
        point.addScaledVector(lower, part === 'lower' ? along * lowerLength : lowerLength);
        if (part === 'hand') {
          point.addScaledVector(lower, along);
        }
      }
      const body = outermost(triangles, point, side);
      return side * point.x - body >= radii[part] + HANG.gap * h;
    });
  };

  // First the upper arm swings out until it and the elbow are clear, then the forearm and the
  // hand swing out from the elbow until they are clear.
  let outUpper = minOut;
  while (outUpper < HANG.maxOut && !isClear(outUpper, outUpper, ['upper', 'elbow'])) {
    outUpper += HANG.step;
  }
  let outLower = minOut;
  while (outLower < HANG.maxOut && !isClear(outUpper, outLower, ['lower', 'hand'])) {
    outLower += HANG.step;
  }
  return { upper: outUpper, lower: outLower };
}

/**
 * Finds the hanging arm of a standing player for the rest pose (design 5.2). The arm swings out
 * to the side by the smallest angle at which each part keeps {@link HANG.gap} from the torso and
 * the legs of the bind pose, seen along x: it touches their side ({@link hangOut}).
 *
 * @param model The player model.
 * @param arm The arm.
 * @param angles The forward swing of the upper arm and the forward bend of the elbow, in radians.
 *   The angles of {@link HANG} by default.
 * @returns The hanging arm.
 */
export function hangingArm(model: PlayerModel, arm: ArmRig, angles: HangAngles = HANG): HangingArm {
  const { forward, bend } = angles;
  const side = arm.side === 'L' ? -1 : 1;
  const shoulder = new Vector3(...arm.bind.shoulder);
  const elbow = new Vector3(...arm.bind.elbow);
  const upperLength = elbow.distanceTo(shoulder);
  const lowerLength = new Vector3(...arm.bind.wrist).distanceTo(elbow);
  const out = hangOut(model, arm, angles, HANG.minOut);
  const upper = downward(out.upper, forward, side, new Vector3());
  const lower = downward(out.lower, forward + bend, side, new Vector3());
  const hangWrist = upper.clone().multiplyScalar(upperLength).addScaledVector(lower, lowerLength);
  const along = hangWrist.clone().normalize();
  const pole = upper.clone().addScaledVector(along, -upper.dot(along)).normalize();
  return {
    wrist: toVec3(hangWrist),
    hand: toQuat(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), lower)),
    pole: toVec3(pole),
  };
}

/**
 * Finds the out swing that an arm needs beside the trunk (design 5.3, "Free round arms"): the
 * smallest swing of the hanging upper arm out to the side, from 0, at which the upper arm and the
 * elbow clear the side of the trunk and the legs of the bind pose, with the forward swing of
 * {@link HANG} ({@link hangOut}). A thin arm beside a thin trunk needs a small swing, and a round
 * arm beside a round trunk needs a large swing.
 *
 * @param model The player model.
 * @param arm The arm.
 * @returns The swing, in radians.
 */
export function armOut(model: PlayerModel, arm: ArmRig): number {
  return hangOut(model, arm, HANG, 0).upper;
}

const offset = new Vector3();

/**
 * Gives the wrist of a hanging arm from its posed shoulder: the wrist of the rest pose of a
 * standing player (design 5.2).
 *
 * @param hang The hanging arm.
 * @param shoulder The posed `shoulder` bone, from `poseShoulder()`.
 * @param out The vector to write.
 * @returns `out`, with the wrist.
 */
export function hangingWrist(hang: HangingArm, shoulder: Frame, out: Vector3): Vector3 {
  return out
    .copy(offset.fromArray(hang.wrist).applyQuaternion(shoulder.rotation))
    .add(shoulder.position);
}

const turn = new Quaternion();

/**
 * Gives the world rotation of the hand of a hanging arm from its posed shoulder.
 *
 * @param hang The hanging arm.
 * @param shoulder The posed `shoulder` bone, from `poseShoulder()`.
 * @param out The quaternion to write. It must not be the rotation of `shoulder`.
 * @returns `out`, with the rotation.
 */
export function hangingHand(hang: HangingArm, shoulder: Frame, out: Quaternion): Quaternion {
  return out.multiplyQuaternions(shoulder.rotation, turn.fromArray(hang.hand));
}
