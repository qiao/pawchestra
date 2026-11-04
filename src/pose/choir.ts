import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { Vec3 } from '../models/tuples.ts';
import { createFrame, posePoint } from './frames.ts';
import type { TorsoFrames } from './frames.ts';
import { armRig, handToward, poseShoulder, writeArm, writeCurl } from './ik.ts';
import type { ArmRig } from './ik.ts';

/** The hold of the choir folder (design 5.3). */
export const CHOIR_HOLD = {
  /**
   * The elbows point down and out, so that the upper arms stay near the sides of the body, as in
   * the reference images. The rebuilt flippers are round tubes with their full inner half width
   * (design 5.3, "Free round arms"): with the elbows of the old flippers, (0.7, -1, 0.1), the
   * upper arms go 3.3 cm into the chest, and 1.5 cm with these elbows and the wider folder of
   * `CHOIR_FOLDER`. Out and down, (1, -0.6, 0), they stand 49° out from the side, and with
   * (2.5, -1, 0.1), the grips turn 28° from the accepted grip.
   */
  poleL: [-1.2, -1, 0.1],
  poleR: [1.2, -1, 0.1],
  /** The curl of the fingers around the edges of the folder. */
  curl: 35 * MathUtils.DEG2RAD,
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

/** The rotation that changes nothing. Nothing writes it. */
const NO_TURN = new Quaternion();

const shoulder = createFrame();
const grip = new Vector3();
const hand = new Quaternion();
const palm = new Vector3();

/**
 * Writes the arms and the fingers of a singer (design 5.3, 4.7). The folder follows the chest,
 * and the palms keep their grips on it, also in the rest pose. The hand points from the
 * shoulder to the grip, and the two-bone IK places each arm.
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
    const wrist = grip.sub(palm.fromArray(arm.palm).applyQuaternion(hand));
    writeArm({ arm, shoulder, wrist, hand, pole: side.pole }, chest.rotation, rotations);
    writeCurl(arm, CHOIR_HOLD.curl, rotations);
  }
}
