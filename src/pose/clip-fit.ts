import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { toQuat } from '../models/tuples.ts';
import type { Quat } from '../models/tuples.ts';
import { hangingArm } from './hang.ts';
import { armRig, solveArm } from './ik.ts';

/**
 * The angles of the line from the shoulder to the wrist of a source arm from straight down, in
 * radians, over which the hanging arm rule of a clip fades out (design 4.4). Up to `full`, the
 * arm moves from the rest arm of the body. From `none` on, it takes the plain retarget. Reason:
 * the arms of the walk of the test clips swing to 23° from straight down, so a walk stays in the
 * full rule with a margin. A clap reaches forward at 79° or more, and a T-pose holds 90°, so these
 * keep the plain retarget.
 */
export const HANG_FADE = { full: 30 * MathUtils.DEG2RAD, none: 60 * MathUtils.DEG2RAD } as const;

/** The rest arm of one side of a body: the world turns of its bones from the bind pose. */
export interface RestArm {
  readonly upper: Quat;
  readonly forearm: Quat;
  readonly hand: Quat;
}

/**
 * Gives the rest arm of a standing body (design 5.2): the arm of `hangingArm()`, solved as the
 * concert solves it, from the bind pose of the shoulder.
 *
 * @param model The player model.
 * @param side The side of the body.
 * @returns The world turns of the upper arm, the forearm, and the hand.
 */
export function restArm(model: PlayerModel, side: 'L' | 'R'): RestArm {
  const arm = armRig(model, side);
  const hang = hangingArm(model, arm);
  const shoulder = new Vector3(...arm.bind.shoulder);
  const wrist = new Vector3(...hang.wrist).add(shoulder);
  const pose = solveArm(arm.bind, shoulder, new Quaternion(), wrist, new Vector3(...hang.pole));
  return { upper: toQuat(pose.upper), forearm: toQuat(pose.lower), hand: hang.hand };
}

/** The unit down direction. */
const DOWN = new Vector3(0, -1, 0);

const reach = new Vector3();

/**
 * Gives the share of the hanging arm rule for a source arm: 1 for an arm that hangs, 0 for an arm
 * that rises past {@link HANG_FADE}, with a smooth step between.
 *
 * @param shoulder The source shoulder joint, in the model axes.
 * @param wrist The source wrist, in the model axes.
 * @returns The share, from 0 to 1.
 */
export function hangShare(shoulder: Vector3, wrist: Vector3): number {
  const angle = reach.subVectors(wrist, shoulder).angleTo(DOWN);
  return 1 - MathUtils.smoothstep(angle, HANG_FADE.full, HANG_FADE.none);
}
