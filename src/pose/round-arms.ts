import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import type { Vec3 } from '../models/tuples.ts';
import { armOut } from './hang.ts';
import type { ArmRig } from './ik.ts';

/**
 * The turn of an elbow for each radian of out swing that an arm needs more than the arm of the
 * body that a shared hold fits ({@link elbowOutTurn}). The turn of an elbow moves the upper arm
 * near the shoulder less than the elbow, so the turn is larger than the swing. With 1, the cast
 * matrix kept each cell of the clarinet over its limit (the cat 2.4 cm, the panda 5.4 cm, the
 * mannequin 2.5 cm). With 2, the mannequin and the rabbit clarinetists pass (0.8 cm and 1.1 cm),
 * and the panda goes 1.9 cm into the body. A larger turn also turns the paw on its forearm: the
 * left paw of the rabbit flutist turns 50° from its accepted grip (limit 45°).
 */
const TURN_PER_SWING = 2;

/**
 * Gives the turn of an elbow out to the side by the rule of the round free arms in a shared hold
 * (design 5.3, "Free round arms"): {@link TURN_PER_SWING} times the out swing that the arm needs
 * beside the trunk ({@link armOut}) less the swing of the body that the hold fits. A body that
 * needs the same swing or less keeps the elbows of the hold, and a rounder body turns each elbow
 * out, so that its upper arms stay off the trunk.
 *
 * @param model The player model.
 * @param arm The arm.
 * @param fitOut The out swing of the arms of the body that the hold fits, in radians, or `null`
 *   for a hold with no rule.
 * @returns The turn, in radians: 0 or more.
 */
export function elbowOutTurn(model: PlayerModel, arm: ArmRig, fitOut: number | null): number {
  return fitOut === null ? 0 : Math.max(0, TURN_PER_SWING * (armOut(model, arm) - fitOut));
}

/**
 * The lift of a shoulder bone for each radian of out swing that an arm needs more than the arm of
 * the body that a shared hold fits ({@link shoulderLift}).
 */
const LIFT_PER_SWING = 0.5;

/**
 * The largest lift of a shoulder bone: the rise of the clavicle of a real person from the arm at
 * the side (6°) to the raised arm (17°), measured with bone pins (Ludewig et al. 2009,
 * `docs/reference/wind-technique.md`).
 */
const MAX_LIFT = 11 * MathUtils.DEG2RAD;

/**
 * Gives the lift of a shoulder bone up and out around the forward axis by the rule of the round
 * free arms in a shared hold (design 5.3, "Free round arms in a shared hold"):
 * {@link LIFT_PER_SWING} times the out swing that the arm needs beside the trunk
 * ({@link armOut}) less the swing of the body that the hold fits, up to {@link MAX_LIFT}. The
 * shoulder joint goes up with the shoulder bone, and the arm keeps its paw, so the upper arm turns
 * less against the shoulder, and its root stays out of the trunk.
 *
 * @param model The player model.
 * @param arm The arm.
 * @param fitOut The out swing of the arms of the body that the hold fits, in radians, or `null`
 *   for a hold with no rule.
 * @returns The lift, in radians: 0 or more.
 */
export function shoulderLift(model: PlayerModel, arm: ArmRig, fitOut: number | null): number {
  if (fitOut === null) {
    return 0;
  }
  return Math.min(MAX_LIFT, Math.max(0, LIFT_PER_SWING * (armOut(model, arm) - fitOut)));
}

const Z_AXIS = new Vector3(0, 0, 1);
const lift = new Quaternion();

/**
 * Adds the lift of a shoulder bone ({@link shoulderLift}) to its turn: a turn around z after the
 * turn, the left shoulder from -x toward +y, and the right one from +x toward +y.
 *
 * @param turn The local rotation of the `shoulder` bone, which the function changes.
 * @param angle The lift, in radians. A negative angle takes a lift off a lifted turn.
 * @param side The side of the arm.
 * @returns `turn`, with the lift.
 */
export function liftShoulder(turn: Quaternion, angle: number, side: 'L' | 'R'): Quaternion {
  if (angle === 0) {
    return turn;
  }
  return turn.multiply(lift.setFromAxisAngle(Z_AXIS, side === 'L' ? -angle : angle));
}

/**
 * Turns the direction to which an elbow points out to the side of its arm, around the forward
 * axis: its part in the plane of x and y turns toward the out side by an angle, and stops at the
 * out side. Its forward part stays.
 *
 * @param pole The direction, in the axes of the chest or of the root.
 * @param turn The angle, in radians.
 * @param side The side of the arm.
 * @returns The turned direction, or `pole` itself for no turn.
 */
export function turnPoleOut(pole: Vec3, turn: number, side: 'L' | 'R'): Vec3 {
  if (turn <= 0) {
    return pole;
  }
  const out = side === 'L' ? -1 : 1;
  const [x, y, z] = pole;
  const length = Math.hypot(x, y);
  const angle = Math.atan2(y, out * x);
  const turned = Math.sign(angle) * Math.max(0, Math.abs(angle) - turn);
  return [out * length * Math.cos(turned), length * Math.sin(turned), z];
}
