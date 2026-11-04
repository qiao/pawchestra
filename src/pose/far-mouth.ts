import { MathUtils, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { armRig } from './ik.ts';

/**
 * The bow of the head for each unit of the mouth share ({@link mouthShare}) more than the share
 * of the body that a shared hold fits ({@link headBow}). Each 10° of bow brings the mouth about
 * 2 cm to 3 cm nearer to the shoulder joints of the recast trumpeters. With 60°, the wolf bows
 * 15°, the beaver 16°, and the dog 12°, and their paws reach the valves within 16 mm.
 */
const BOW_PER_SHARE = 60 * MathUtils.DEG2RAD;

/**
 * The largest bow of the head of a wind player in the play ({@link headBow}). No source of
 * `docs/reference/wind-technique.md` gives the range of the neck flexion of a wind player in
 * degrees, so the bow stays small. The elephant, the rhino, the badger, and the penguin need more
 * than 30° to bring the mouth into the reach of the arms.
 */
const MAX_BOW = 20 * MathUtils.DEG2RAD;

const mouth = new Vector3();
const joint = new Vector3();

/**
 * Gives the mouth share of a body: the mean distance from the two shoulder joints of the bind pose
 * to the mouth, as a share of the arm from the shoulder joint to the middle of the palm. A long
 * snout or a big head puts the mouth far in front of the shoulders, and the share grows.
 *
 * @param model The player model.
 * @returns The share: 0 or more.
 */
export function mouthShare(model: PlayerModel): number {
  mouth.fromArray(model.body.mouth);
  let sum = 0;
  for (const side of ['L', 'R'] as const) {
    const arm = armRig(model, side);
    const length = arm.reach + Math.hypot(...arm.palm);
    joint.fromArray(model.skeleton.positions[arm.bones.upperArm] ?? [0, 0, 0]);
    sum += mouth.distanceTo(joint) / length;
  }
  return sum / 2;
}

/**
 * Gives the bow of the head of a wind player in the play by the rule of the far mouth in a shared
 * hold (design 5.3, "Far mouth in a shared hold"): {@link BOW_PER_SHARE} times the mouth share of
 * the body ({@link mouthShare}) less the share of the body that the hold fits, up to
 * {@link MAX_BOW}. The head bows around the neck and the head joints, so the mouth comes down and
 * back toward the shoulders, and the instrument turns down with the head.
 *
 * @param model The player model.
 * @param fit The mouth share of the body that the hold fits, or `null` for a hold with no rule.
 * @returns The bow, in radians: 0 or more.
 */
export function headBow(model: PlayerModel, fit: number | null): number {
  if (fit === null) {
    return 0;
  }
  return Math.min(MAX_BOW, Math.max(0, BOW_PER_SHARE * (mouthShare(model) - fit)));
}
