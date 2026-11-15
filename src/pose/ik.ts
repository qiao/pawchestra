import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { Z_AXIS } from './axes.ts';
import { createFrame, posePoint, setBoneRotation } from './frames.ts';
import type { Frame } from './frames.ts';

/** The share of the arm length that a hand may reach, so that the elbow keeps a bend. */
export const ARM_REACH = 0.97;

/** The elbow and the wrist of an arm after the two-bone solution. */
interface ArmJoints {
  readonly elbow: Vector3;
  readonly wrist: Vector3;
}

/**
 * Makes the joints for {@link solveTwoBone}.
 *
 * @returns An elbow and a wrist at the origin.
 */
function createJoints(): ArmJoints {
  return { elbow: new Vector3(), wrist: new Vector3() };
}

/**
 * Gives a distance with a soft limit (design 4.7): the distance up to `limit - softness`, then a
 * curve that comes near the limit and never passes it. The curve has no kink, so an arm near its
 * full reach straightens slowly and its elbow does not stop in one frame. With no softness, it is
 * the hard limit.
 *
 * @param distance The distance, in meters.
 * @param limit The largest distance, in meters.
 * @param softness The length of the curve below the limit, in meters, 0 or more.
 * @returns The limited distance.
 */
function softLimit(distance: number, limit: number, softness: number): number {
  if (softness <= 0) {
    return Math.min(distance, limit);
  }
  const start = limit - softness;
  if (distance <= start) {
    return distance;
  }
  return start + softness * (1 - Math.exp(-(distance - start) / softness));
}

const direction = new Vector3();
const bend = new Vector3();

/**
 * Places the elbow of an arm so that the wrist reaches a target: the analytic two-bone IK of
 * design 4.7. The elbow lies in the plane of the shoulder, the target, and the pole direction. If
 * the target is out of reach, the arm points straight to it. If the target is too near, the
 * wrist stops at the nearest distance that the two bones can reach.
 *
 * @param shoulder The position of the shoulder joint: the `upperArm` bone.
 * @param target The position that the wrist must reach: the `hand` bone.
 * @param upperLength The length of the upper arm, from the shoulder to the elbow.
 * @param lowerLength The length of the forearm, from the elbow to the wrist.
 * @param pole The direction to which the elbow points. It must not be parallel to the direction
 *   from the shoulder to the target.
 * @param out The joints to write. They must not hold `shoulder`, `target`, or `pole`.
 * @param softness The length below the full reach, in meters, in which the reach comes near the
 *   full reach on a curve ({@link softLimit}). 0 by default: the hard limit.
 * @returns `out`, with the elbow and the wrist.
 */
export function solveTwoBone(
  shoulder: Vector3,
  target: Vector3,
  upperLength: number,
  lowerLength: number,
  pole: Vector3,
  out: ArmJoints = createJoints(),
  softness = 0,
): ArmJoints {
  direction.subVectors(target, shoulder);
  const reach = Math.max(
    softLimit(direction.length(), upperLength + lowerLength - 1e-6, softness),
    Math.abs(upperLength - lowerLength) + 1e-6,
  );
  direction.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
  const side = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction)).normalize();
  out.elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, side);
  out.wrist.copy(shoulder).addScaledVector(direction, reach);
  return out;
}

/** The bind positions of the three joints of an arm, in the model axes. */
export interface ArmBind {
  /** The `upperArm` bone. */
  readonly shoulder: Vec3;
  /** The `forearm` bone. */
  readonly elbow: Vec3;
  /** The `hand` bone. */
  readonly wrist: Vec3;
}

/** The world rotations of the two bones of an arm, and the joints that they reach. */
interface ArmPose extends ArmJoints {
  /** The world rotation of the upper arm, from its bind direction. */
  readonly upper: Quaternion;
  /** The world rotation of the forearm, from its bind direction. */
  readonly lower: Quaternion;
}

/**
 * Makes the arm pose for {@link solveArm}.
 *
 * @returns Joints at the origin and bones with no rotation.
 */
export function createArmPose(): ArmPose {
  return { ...createJoints(), upper: new Quaternion(), lower: new Quaternion() };
}

const upperBind = new Vector3();
const lowerBind = new Vector3();
const from = new Vector3();
const to = new Vector3();

/**
 * Solves an arm with {@link solveTwoBone} and gives the world rotations of its two bones. Each
 * bone turns by the smallest rotation from its direction under the parent rotation, so the twist
 * of the arm follows the chest.
 *
 * @param bind The bind positions of the joints.
 * @param shoulder The posed position of the shoulder joint.
 * @param parent The world rotation of the parent of the upper arm: the `shoulder` bone.
 * @param target The position that the wrist must reach.
 * @param pole The direction to which the elbow points, in the model axes.
 * @param out The arm pose to write. It must not hold an input.
 * @returns `out`, with the world rotations and the posed joints.
 */
export function solveArm(
  bind: ArmBind,
  shoulder: Vector3,
  parent: Quaternion,
  target: Vector3,
  pole: Vector3,
  out: ArmPose = createArmPose(),
): ArmPose {
  upperBind.fromArray(bind.elbow).sub(from.fromArray(bind.shoulder));
  lowerBind.fromArray(bind.wrist).sub(from.fromArray(bind.elbow));
  solveTwoBone(shoulder, target, upperBind.length(), lowerBind.length(), pole, out);
  from.copy(upperBind).applyQuaternion(parent).normalize();
  to.subVectors(out.elbow, shoulder).normalize();
  out.upper.setFromUnitVectors(from, to).multiply(parent);
  from.copy(lowerBind).applyQuaternion(out.upper).normalize();
  to.subVectors(out.wrist, out.elbow).normalize();
  out.lower.setFromUnitVectors(from, to).multiply(out.upper);
  return out;
}

/** The bone indices of one side of the body, from the shoulder to the fingers. */
interface ArmBones {
  readonly shoulder: number;
  readonly upperArm: number;
  readonly forearm: number;
  readonly hand: number;
  readonly fingers: number;
}

/** One side of the body in the bind pose, in the model axes. */
export interface ArmRig {
  readonly side: 'L' | 'R';
  /** The bind position of the `shoulder` bone. */
  readonly clavicle: Vec3;
  readonly bind: ArmBind;
  /** The palm, from its hand bone. */
  readonly palm: Vec3;
  /** The longest distance from the shoulder joint to the wrist: {@link ARM_REACH} of the arm. */
  readonly reach: number;
  readonly bones: ArmBones;
}

/**
 * Reads the arm of one side from a player model.
 *
 * @param model The player model.
 * @param side The side of the body.
 * @returns The arm.
 */
export function armRig(model: PlayerModel, side: 'L' | 'R'): ArmRig {
  const bones: ArmBones = {
    shoulder: boneIndex(`shoulder${side}`),
    upperArm: boneIndex(`upperArm${side}`),
    forearm: boneIndex(`forearm${side}`),
    hand: boneIndex(`hand${side}`),
    fingers: boneIndex(`fingers${side}`),
  };
  const at = (bone: number): Vector3 =>
    new Vector3(...(model.skeleton.positions[bone] ?? [0, 0, 0]));
  const shoulder = at(bones.upperArm);
  const elbow = at(bones.forearm);
  const wrist = at(bones.hand);
  const palm = new Vector3(...(side === 'L' ? model.body.palmL : model.body.palmR));
  return {
    side,
    clavicle: toVec3(at(bones.shoulder)),
    bind: { shoulder: toVec3(shoulder), elbow: toVec3(elbow), wrist: toVec3(wrist) },
    palm: toVec3(palm.sub(wrist)),
    reach: ARM_REACH * (elbow.distanceTo(shoulder) + wrist.distanceTo(elbow)),
    bones,
  };
}

const clavicleToShoulder = new Vector3();

/**
 * Turns the `shoulder` bone of an arm and gives its posed frame. The position of the frame is
 * the posed shoulder joint: the `upperArm` bone.
 *
 * @param arm The arm.
 * @param chest The posed frame of the chest.
 * @param chestBind The bind position of the chest.
 * @param turn The local rotation of the `shoulder` bone.
 * @param out The frame to write. A new frame by default. It must not be `chest`.
 * @returns `out`, with the world rotation of the `shoulder` bone and the posed shoulder joint.
 */
export function poseShoulder(
  arm: ArmRig,
  chest: Frame,
  chestBind: Vec3,
  turn: Quaternion,
  out: Frame = createFrame(),
): Frame {
  out.rotation.multiplyQuaternions(chest.rotation, turn);
  clavicleToShoulder
    .fromArray(arm.bind.shoulder)
    .sub(from.fromArray(arm.clavicle))
    .applyQuaternion(out.rotation);
  posePoint(chest, chestBind, arm.clavicle, out.position).add(clavicleToShoulder);
  return out;
}

/** One arm to solve: the arm, its posed shoulder, and the targets of the hand. */
interface ArmTask {
  readonly arm: ArmRig;
  /** The posed `shoulder` bone, from {@link poseShoulder}. */
  readonly shoulder: Frame;
  readonly wrist: Vector3;
  readonly hand: Quaternion;
  readonly pole: Vec3;
  /**
   * The largest twist of the hand on its forearm, around the bind axis of the forearm, in
   * radians. A larger twist turns the hand back to it around that axis. No limit by default.
   */
  readonly maxTwist?: number;
  /**
   * A twist of the hand on its forearm, around the bind axis of the forearm, in radians, toward
   * which the hand turns by {@link ArmTask.twistWeight}. The turn changes the twist of `hand` with
   * no wrap at ±180°, so a twist that moves smoothly gives a hand that moves smoothly.
   */
  readonly twist?: number;
  /** The weight of {@link ArmTask.twist}, from 0 to 1. 0 by default. */
  readonly twistWeight?: number;
}

const twistAxis = new Vector3();
const twistTurn = new Quaternion();

/**
 * Gives the twist of a local rotation around an axis, from -π to π.
 *
 * @param q The local rotation.
 * @param axis The unit axis of the twist.
 * @returns The twist, in radians.
 */
function twistOf(q: Quaternion, axis: Vector3): number {
  const along = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  const twist = 2 * Math.atan2(along, q.w);
  if (twist > Math.PI) {
    return twist - 2 * Math.PI;
  }
  return twist < -Math.PI ? twist + 2 * Math.PI : twist;
}

/**
 * Turns the twist of the local rotation of a hand toward the twist of its task and limits it, in
 * place: the swing stays. The turn goes from the twist of the rotation to the twist of the task
 * with no wrap, so the hand moves smoothly while the twist of the rotation stays away from ±180°.
 * Reason: a limit on a twist near 180° turned the hand 90° in one frame, from one limit to the
 * other.
 *
 * @param q The local rotation of the hand on its forearm.
 * @param axis The unit axis of the twist.
 * @param task The arm, with its twist and its limit.
 * @returns `q`.
 */
function turnTwist(q: Quaternion, axis: Vector3, task: ArmTask): Quaternion {
  const now = twistOf(q, axis);
  const weight = task.twistWeight ?? 0;
  let goal = task.twist === undefined ? now : now + (task.twist - now) * weight;
  if (task.maxTwist !== undefined) {
    goal = MathUtils.clamp(goal, -task.maxTwist, task.maxTwist);
  }
  if (goal === now) {
    return q;
  }
  return q.multiply(twistTurn.setFromAxisAngle(axis, goal - now));
}

const solved = createArmPose();
const turnedPole = new Vector3();
const local = new Quaternion();

/**
 * Solves one arm and writes the local rotations of its upper arm, its forearm, and its hand.
 *
 * @param task The arm.
 * @param chest The world rotation of the chest, which turns the pole.
 * @param rotations The rotations of the pose to write.
 */
export function writeArm(task: ArmTask, chest: Quaternion, rotations: Float32Array): void {
  const { arm, shoulder } = task;
  const parent = shoulder.rotation;
  turnedPole.fromArray(task.pole).applyQuaternion(chest);
  solveArm(arm.bind, shoulder.position, parent, task.wrist, turnedPole, solved);
  setBoneRotation(
    rotations,
    arm.bones.upperArm,
    local.copy(parent).invert().multiply(solved.upper),
  );
  setBoneRotation(
    rotations,
    arm.bones.forearm,
    local.copy(solved.upper).invert().multiply(solved.lower),
  );
  local.copy(solved.lower).invert().multiply(task.hand);
  if (task.maxTwist !== undefined || task.twist !== undefined) {
    twistAxis.fromArray(arm.bind.wrist).sub(from.fromArray(arm.bind.elbow)).normalize();
    turnTwist(local, twistAxis, task);
  }
  setBoneRotation(rotations, arm.bones.hand, local);
}

/**
 * Writes the curl of the fingers of one hand. A positive curl closes the fingers of each side.
 *
 * @param arm The arm.
 * @param curl The curl angle, in radians.
 * @param rotations The rotations of the pose to write.
 */
export function writeCurl(arm: ArmRig, curl: number, rotations: Float32Array): void {
  local.setFromAxisAngle(Z_AXIS, arm.side === 'L' ? curl : -curl);
  setBoneRotation(rotations, arm.bones.fingers, local);
}

/**
 * Moves a wrist target toward the shoulder until the arm reaches it with {@link ARM_REACH} of
 * its length, so that the elbow keeps a bend. A target in reach does not move.
 *
 * @param arm The arm.
 * @param shoulder The posed shoulder joint, from {@link poseShoulder}.
 * @param wrist The wrist target. The function moves it in place.
 * @param softness The length below the reach, in meters, in which the target comes near the reach
 *   on a curve ({@link softLimit}), so that the elbow does not stop in one frame. 0 by default: a
 *   target in reach does not move.
 * @returns `wrist`, in reach.
 */
export function limitReach(arm: ArmRig, shoulder: Vector3, wrist: Vector3, softness = 0): Vector3 {
  const distance = wrist.distanceTo(shoulder);
  if (distance <= arm.reach - softness) {
    return wrist;
  }
  return wrist
    .sub(shoulder)
    .multiplyScalar(softLimit(distance, arm.reach, softness) / distance)
    .add(shoulder);
}

/**
 * Gives the world rotation of a hand that points from its shoulder to a grip: the hand hangs
 * along the line from the shoulder to the grip, so that the wrist lies between them.
 *
 * @param shoulder The posed `shoulder` bone, from {@link poseShoulder}.
 * @param grip The posed grip of the palm.
 * @param out The quaternion to write. It must not be the rotation of `shoulder`.
 * @returns `out`, with the world rotation of the `hand` bone.
 */
export function handToward(shoulder: Frame, grip: Vector3, out: Quaternion): Quaternion {
  from.set(0, 1, 0).applyQuaternion(shoulder.rotation).normalize();
  to.subVectors(shoulder.position, grip).normalize();
  return out.setFromUnitVectors(from, to).multiply(shoulder.rotation);
}
