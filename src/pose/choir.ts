import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { Vec3 } from '../models/tuples.ts';
import { NO_TURN, Z_AXIS } from './axes.ts';
import { createFrame, posePoint } from './frames.ts';
import type { TorsoFrames } from './frames.ts';
import { armRig, handToward, poseShoulder, writeArm, writeCurl } from './ik.ts';
import type { ArmRig } from './ik.ts';

/** The hold of the choir folder (design 5.3). */
export const CHOIR_HOLD = {
  /**
   * The elbows point down and out, so that the upper flippers stay near the sides of the body, as
   * in the reference images. The flippers of the Tripo penguin are flat blades from the back half
   * of the sides. With these elbows, the flipper tips turn 28° about the flipper (40° with
   * (1.4, -1, 0.1)), and the roots of the upper flippers go 2.0 cm into the sides in each pose.
   */
  poleL: [-1, -1, 0.1],
  poleR: [1, -1, 0.1],
  /**
   * The curl of the fingers around the outer edges of the folder. With {@link CHOIR_HOLD.flex}
   * and the grip 1 cm in front of the cover (`CHOIR_FOLDER.gripFront`), the flipper tip of the
   * Tripo penguin curls around the outer edge onto the front of the cover. The digits then come 3.0
   * cm inside the edge, 0.3 cm off the cover, and no flipper edge crosses the folder. With 15°, the
   * digits stood 2.7 cm off the cover beside its edge. With 85°, they lay 0.1 cm off it, and with
   * 90°, the flipper went through the cover. A larger flex in place of the curl moves the wrist
   * away from the shoulder: with 45°, the palms missed their grips by 10.7 mm.
   */
  curl: 80 * MathUtils.DEG2RAD,
  /**
   * The bend of each paw toward the palm at the wrist. The palm keeps its grip, and the arm
   * follows. The wrist of the Tripo penguin is at two thirds of the flipper, so the bend starts
   * the curl of the outer third.
   */
  flex: 30 * MathUtils.DEG2RAD,
} as const;

/** One hand of a singer in the bind pose: its arm and its grip on the folder. */
interface ChoirSide {
  readonly arm: ArmRig;
  /** The grip of the palm on the folder, in the bind pose. */
  readonly grip: Vec3;
  readonly pole: Vec3;
}

/** The points of a singer in the bind pose that the pose needs. */
export interface ChoirRig {
  readonly chestBind: Vec3;
  readonly left: ChoirSide;
  readonly right: ChoirSide;
}

/**
 * Finds the points of a singer that the pose needs.
 *
 * @param model A player with the choir folder.
 * @returns The rig.
 * @throws Error if the folder does not hang on the chest, or if it has no grips of the palms.
 */
export function choirRig(model: PlayerModel): ChoirRig {
  const { positions, parents } = model.skeleton;
  const chest = boneIndex('chest');
  if (parents[boneIndex('instrument')] !== chest) {
    throw new Error('The choir folder does not hang on the chest.');
  }
  const { palmL, palmR } = model.instrument.grips;
  if (!palmL || !palmR) {
    throw new Error('The choir folder has no grips of the palms.');
  }
  return {
    chestBind: positions[chest] ?? [0, 0, 0],
    left: {
      arm: armRig(model, 'L'),
      grip: placePoint(model.pieces, palmL),
      pole: CHOIR_HOLD.poleL,
    },
    right: {
      arm: armRig(model, 'R'),
      grip: placePoint(model.pieces, palmR),
      pole: CHOIR_HOLD.poleR,
    },
  };
}

const shoulder = createFrame();
const grip = new Vector3();
const hand = new Quaternion();
const palm = new Vector3();
const flex = new Quaternion();

/**
 * Writes the arms and the fingers of a singer (design 5.3, 4.7). The folder follows the chest,
 * and the palms keep their grips on it, also in the rest pose. The hand points from the
 * shoulder to the grip, then bends toward the palm by `CHOIR_HOLD.flex`, and the two-bone IK
 * places each arm.
 *
 * The caller writes the jaw, and the sway of the phrase into the chest, before it calculates
 * the frames.
 *
 * @param rig The points of the singer.
 * @param frames The posed frames of the root and of the chest.
 * @param rotations The rotations of the pose to write.
 */
export function poseChoir(rig: ChoirRig, frames: TorsoFrames, rotations: Float32Array): void {
  const chest = frames.chest;
  for (const side of [rig.left, rig.right]) {
    const { arm } = side;
    poseShoulder(arm, chest, rig.chestBind, NO_TURN, shoulder);
    posePoint(chest, rig.chestBind, side.grip, grip);
    handToward(shoulder, grip, hand);
    const bend = arm.side === 'L' ? CHOIR_HOLD.flex : -CHOIR_HOLD.flex;
    hand.multiply(flex.setFromAxisAngle(Z_AXIS, bend));
    const wrist = grip.sub(palm.fromArray(arm.palm).applyQuaternion(hand));
    writeArm({ arm, shoulder, wrist, hand, pole: side.pole }, chest.rotation, rotations);
    writeCurl(arm, CHOIR_HOLD.curl, rotations);
  }
}
