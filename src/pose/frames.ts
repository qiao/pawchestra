import { Matrix4, Quaternion, Vector3 } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import { BONE_NAMES } from '../models/rig.ts';
import type { Skeleton } from '../models/rig.ts';

/**
 * The world rotation and the posed position of one bone. The pose code writes the two objects in
 * place, so that a frame of `poseAt()` makes no new objects.
 */
export interface Frame {
  /** The world rotation from the bind pose. */
  readonly rotation: Quaternion;
  /** The posed position of the bone, in the model axes. */
  readonly position: Vector3;
}

/** The frames of the torso that the arms of a player hang from. */
export interface TorsoFrames {
  readonly root: Frame;
  readonly chest: Frame;
}

/**
 * The part of a turn of the head around y that the neck bone turns (design 5.1). The head bone
 * turns the rest, so the head turns by the whole angle.
 */
export const NECK_SHARE = 0.4;

/** The rotations of the bind pose: no rotation on any bone (design 4.7). */
export const BIND_ROTATIONS: Float32Array = new Float32Array(
  BONE_NAMES.flatMap(() => [0, 0, 0, 1]),
);

/**
 * Makes a frame for the pose code to write.
 *
 * @returns A frame with no rotation at the origin.
 */
export function createFrame(): Frame {
  return { rotation: new Quaternion(), position: new Vector3() };
}

/**
 * Reads the rotation of one bone from the rotations of a pose.
 *
 * @param rotations The rotations, four numbers for each bone.
 * @param bone The bone index.
 * @param out The quaternion to write. A new quaternion by default.
 * @returns `out`, with the rotation.
 */
export function boneRotation(
  rotations: Float32Array,
  bone: number,
  out: Quaternion = new Quaternion(),
): Quaternion {
  return out.fromArray(rotations, bone * 4);
}

/**
 * Writes the rotation of one bone into the rotations of a pose.
 *
 * @param rotations The rotations, four numbers for each bone.
 * @param bone The bone index.
 * @param q The rotation.
 */
export function setBoneRotation(rotations: Float32Array, bone: number, q: Quaternion): void {
  q.toArray(rotations, bone * 4);
}

const local = new Quaternion();
const offset = new Vector3();

/**
 * Calculates the frames of the first bones of a skeleton from the local rotations of a pose.
 * Each parent comes before its children in `BONE_NAMES`, so the first bones form a closed
 * chain: `root`, `hips`, `spine`, `chest` for 4 frames.
 *
 * @param skeleton The bind skeleton.
 * @param rotations The local rotations of the pose.
 * @param frames The frames to write, one for each of the first bones, each from
 *   {@link createFrame}.
 * @param rootOffset The offset of the root bone.
 * @returns `frames`, with the frames of the pose.
 */
export function chainFrames<F extends readonly Frame[]>(
  skeleton: Skeleton,
  rotations: Float32Array,
  frames: F,
  rootOffset: Vec3 = [0, 0, 0],
): F {
  // An index loop makes no pair for each frame, as `entries()` does in each call.
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame) {
      continue;
    }
    boneRotation(rotations, i, local);
    frame.position.fromArray(skeleton.positions[i] ?? [0, 0, 0]);
    const parentIndex = skeleton.parents[i] ?? -1;
    const parent = parentIndex < i ? frames[parentIndex] : undefined;
    if (!parent) {
      frame.rotation.copy(local);
      frame.position.add(offset.fromArray(rootOffset));
      continue;
    }
    frame.position
      .sub(offset.fromArray(skeleton.positions[parentIndex] ?? [0, 0, 0]))
      .applyQuaternion(parent.rotation)
      .add(parent.position);
    frame.rotation.multiplyQuaternions(parent.rotation, local);
  }
  return frames;
}

/**
 * Moves a bind point that follows a bone to its posed place.
 *
 * @param frame The frame of the bone.
 * @param bind The bind position of the bone.
 * @param point The bind point.
 * @param out The vector to write. A new vector by default.
 * @returns `out`, with the posed point.
 */
export function posePoint(
  frame: Frame,
  bind: Vec3,
  point: Vec3,
  out: Vector3 = new Vector3(),
): Vector3 {
  return out
    .fromArray(point)
    .sub(offset.fromArray(bind))
    .applyQuaternion(frame.rotation)
    .add(frame.position);
}

const basis = new Matrix4();
const zAxis = new Vector3();

/**
 * Sets a quaternion to the rotation that turns the x axis to `xAxis` and the y axis to `yAxis`.
 *
 * @param out The quaternion to write.
 * @param xAxis The new x axis, a unit vector.
 * @param yAxis The new y axis, a unit vector normal to `xAxis`.
 * @returns `out`, with the rotation. The z axis turns to `xAxis × yAxis`.
 */
export function setFromBasis(out: Quaternion, xAxis: Vector3, yAxis: Vector3): Quaternion {
  basis.makeBasis(xAxis, yAxis, zAxis.crossVectors(xAxis, yAxis));
  return out.setFromRotationMatrix(basis);
}
