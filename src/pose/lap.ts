import { Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { setFromBasis } from './frames.ts';
import type { ArmRig } from './ik.ts';

/** A place on the top of a thigh of a seated player. */
export interface LapPlace {
  /** The part of the way from the hip to the knee. */
  readonly along: number;
  /** The move from the top of the thigh, in head heights. */
  readonly offset: Vec3;
}

/**
 * Finds the height of the top of a leg above a point: the highest crossing of the vertical line
 * through the point with a triangle of the thigh or the knee. For a body, the triangles of
 * the hips and the belly count too.
 *
 * @param model The player model.
 * @param side The side of the leg.
 * @param point The point. Its height does not count.
 * @returns The height, or the height of the point if the line misses the leg.
 */
function legTop(model: PlayerModel, side: 'L' | 'R', point: Vector3): number {
  // The knee is a ball on the shin bone. The skin of a body blends the thighs into the
  // hips and the belly, so its lap is the top of the hips, the spine, and the legs (design 4.4).
  const leg = new Set([
    boneIndex(`thigh${side}`),
    boneIndex(`shin${side}`),
    boneIndex('hips'),
    boneIndex('spine'),
  ]);
  const { positions, bones, blendBones } = model.mesh;
  const corner = (v: number, k: number): number => positions[v * 3 + k] ?? 0;
  const onLeg = (v: number): boolean => leg.has(bones[v] ?? -1) || leg.has(blendBones[v] ?? -1);
  let top = point.y;
  for (let v = 0; v + 2 < bones.length; v += 3) {
    if (!onLeg(v)) {
      continue;
    }
    // The barycentric weights of the point in the triangle, seen from above.
    const [ax, az, bx, bz, cx, cz] = [
      corner(v, 0),
      corner(v, 2),
      corner(v + 1, 0),
      corner(v + 1, 2),
      corner(v + 2, 0),
      corner(v + 2, 2),
    ];
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-12) {
      continue;
    }
    const wb = ((point.x - ax) * (cz - az) - (cx - ax) * (point.z - az)) / area;
    const wc = ((bx - ax) * (point.z - az) - (point.x - ax) * (bz - az)) / area;
    const wa = 1 - wb - wc;
    if (wa >= 0 && wb >= 0 && wc >= 0) {
      top = Math.max(top, wa * corner(v, 1) + wb * corner(v + 1, 1) + wc * corner(v + 2, 1));
    }
  }
  return top;
}

/**
 * Finds a place on the top of a thigh of a seated player: a point of the way from the hip to the
 * knee, on the top of the leg, then a move in head heights.
 *
 * @param model The player model.
 * @param side The side of the thigh.
 * @param lap The place.
 * @returns The point, in the model axes.
 */
export function lapPoint(model: PlayerModel, side: 'L' | 'R', lap: LapPlace): Vec3 {
  const h = model.body.headHeight;
  const hip = new Vector3(...(model.skeleton.positions[boneIndex(`thigh${side}`)] ?? [0, 0, 0]));
  const knee = new Vector3(...(model.skeleton.positions[boneIndex(`shin${side}`)] ?? [0, 0, 0]));
  const point = hip.lerp(knee, lap.along);
  point.y = legTop(model, side, point);
  return toVec3(point.addScaledVector(new Vector3(...lap.offset), h));
}

/** A paw that rests on the top of a thigh of a seated player (design 5.3). */
export interface LapHand {
  /** The place of the palm. */
  readonly lap: LapPlace;
  /** The side of the palm: down onto a thigh, or back and down onto a round belly. */
  readonly palm: Vec3;
  /** The direction of the fingers. The pose keeps only its part in the plane of the palm. */
  readonly fingers: Vec3;
}

/** The `hand` bone of a paw that rests on a thigh, in the bind pose. */
interface LapHandPlace {
  /** The place of the `hand` bone, in the model axes. */
  readonly wrist: Vec3;
  /** The world rotation of the `hand` bone. */
  readonly rotation: Quat;
}

/**
 * Finds the `hand` bone of a paw that rests on a thigh: the middle of the palm is at the lap place
 * ({@link lapPoint}), the palm faces the side of the rest hand, and the fingers point in the plane
 * of the palm.
 *
 * @param model The player model.
 * @param arm The arm of the paw. The paw rests on the thigh of the same side.
 * @param rest The place of the palm, the side of the palm, and the direction of the fingers.
 * @returns The place and the world rotation of the `hand` bone.
 */
export function lapHand(model: PlayerModel, arm: ArmRig, rest: LapHand): LapHandPlace {
  // The bind palm faces the body: +x on the left and -x on the right. The fingers point down.
  const side = new Vector3(...rest.palm).normalize();
  const back = new Vector3(...rest.fingers);
  back.addScaledVector(side, -back.dot(side)).normalize().negate();
  side.multiplyScalar(arm.side === 'L' ? 1 : -1);
  const rotation = setFromBasis(new Quaternion(), side, back);
  const palm = new Vector3(...lapPoint(model, arm.side, rest.lap));

  return {
    wrist: toVec3(palm.sub(new Vector3(...arm.palm).applyQuaternion(rotation))),
    rotation: toQuat(rotation),
  };
}
