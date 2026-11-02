import { MathUtils, Quaternion, Vector3 } from 'three';

import { IDENTITY } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { PlayerModel } from '../models/player.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import type { SceneLayout } from '../models/layout.ts';
import type { SpeciesId } from '../models/species.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { setBoneRotation } from '../pose/frames.ts';
import { solveTwoBone } from '../pose/ik.ts';
import { preparePoses } from '../pose/plan.ts';
import { poseAt } from '../pose/pose-at.ts';
import type { AnimalPose, Transport } from '../pose/types.ts';
import type { Score } from '../score/types.ts';

/** The target of one hand of a static pose, in the axes of the model. */
interface HandTarget {
  /** The place of the wrist: the `hand` bone. */
  readonly wrist: Vector3;
  /** The world rotation of the hand. */
  readonly hand: Quaternion;
  /** The direction to which the elbow points. */
  readonly pole: Vector3;
}

/** The bones that `poseAt()` turns to look at the conductor or for the idle motion. */
const LOOK_BONES: readonly BoneName[] = ['neck', 'head', 'earL', 'earR', 'tail1', 'tail2'];

/** A transport that plays since long before the time of the pose. */
export const PLAYING: Transport = {
  playing: true,
  changedAtWall: -100,
  before: null,
  startSec: 0,
  holdSec: 3,
  leadSec: Number.POSITIVE_INFINITY,
};

/** The share of a note at which the views page takes the pose of a player. */
const NOTE_SHARE = 0.4;

/** The x axis of the model. */
const X_AXIS = new Vector3(1, 0, 0);

/** The z axis of the model. */
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Reads the bind position of a bone.
 *
 * @param model The player model.
 * @param name The bone.
 * @returns A new vector.
 */
function bindPosition(model: PlayerModel, name: BoneName): Vector3 {
  return new Vector3(...(model.skeleton.positions[boneIndex(name)] ?? [0, 0, 0]));
}

/**
 * Makes a pose from world rotations of some bones. Each other bone keeps no turn of its own.
 *
 * @param model The player model.
 * @param world The world rotation of each posed bone.
 * @returns The pose, with one rotation for each bone relative to its parent.
 */
function poseOfWorld(model: PlayerModel, world: ReadonlyMap<BoneName, Quaternion>): AnimalPose {
  const rotations = new Float32Array(BONE_NAMES.length * 4);
  const worldOf: Quaternion[] = [];
  for (const [i, name] of BONE_NAMES.entries()) {
    const parent = model.skeleton.parents[i] ?? -1;
    const parentWorld = (parent >= 0 ? worldOf[parent] : undefined) ?? new Quaternion();
    const target = world.get(name);
    const turn = target ? parentWorld.clone().invert().multiply(target) : new Quaternion();
    worldOf.push(target ?? parentWorld);
    setBoneRotation(rotations, i, turn);
  }
  return { rotations, rootOffset: [0, 0, 0], slideOffset: [0, 0, 0], blink: 0 };
}

/**
 * Calculates a static pose that puts each wrist on its target with the two-bone IK (design 4.7).
 *
 * @param model The player model.
 * @param hands The target of the left and of the right hand. `null` keeps the arm down.
 * @returns The pose.
 */
function armsPose(
  model: PlayerModel,
  hands: { readonly L: HandTarget | null; readonly R: HandTarget | null },
): AnimalPose {
  const world = new Map<BoneName, Quaternion>();
  for (const side of ['L', 'R'] as const) {
    const target = hands[side];
    if (!target) {
      continue;
    }
    const shoulder = bindPosition(model, `upperArm${side}`);
    const elbow = bindPosition(model, `forearm${side}`);
    const wrist = bindPosition(model, `hand${side}`);
    const joints = solveTwoBone(
      shoulder,
      target.wrist,
      shoulder.distanceTo(elbow),
      elbow.distanceTo(wrist),
      target.pole,
    );
    world.set(
      `upperArm${side}`,
      new Quaternion().setFromUnitVectors(
        new Vector3().subVectors(elbow, shoulder).normalize(),
        new Vector3().subVectors(joints.elbow, shoulder).normalize(),
      ),
    );
    world.set(
      `forearm${side}`,
      new Quaternion().setFromUnitVectors(
        new Vector3().subVectors(wrist, elbow).normalize(),
        new Vector3().subVectors(joints.wrist, joints.elbow).normalize(),
      ),
    );
    world.set(`hand${side}`, target.hand);
  }
  return poseOfWorld(model, world);
}

/**
 * Calculates the pose of a wind player that holds the grips of its instrument with bent elbows
 * near the body. The views page uses it for a species that plays no wind instrument on the stage,
 * such as the rabbit and the red fox with the clarinet of `animals.webp`.
 *
 * @param model The player model.
 * @returns The pose, or `null` if the instrument has no grip for a palm.
 */
export function gripPose(model: PlayerModel): AnimalPose | null {
  const { grips } = model.instrument;
  if (!grips.palmL && !grips.palmR) {
    return null;
  }
  const target = (
    grip: typeof grips.palmL,
    palm: Vec3,
    wristBone: BoneName,
    out: number,
  ): HandTarget | null => {
    if (!grip) {
      return null;
    }
    // The palm turns to the instrument, and the elbow points down and a little out and back.
    const hand = new Quaternion().setFromAxisAngle(Z_AXIS, -out * 60 * MathUtils.DEG2RAD);
    const palmOffset = new Vector3(...palm)
      .sub(bindPosition(model, wristBone))
      .applyQuaternion(hand);
    return {
      wrist: new Vector3(...placePoint(model.pieces, grip)).sub(palmOffset),
      hand,
      pole: new Vector3(out * 0.35, -1, 0.5),
    };
  };
  return armsPose(model, {
    L: target(grips.palmL, model.body.palmL, 'handL', -1),
    R: target(grips.palmR, model.body.palmR, 'handR', 1),
  });
}

/**
 * Calculates the pose of the conductor with the baton raised in the right hand and the left hand
 * low in front of the body, as the bear of `animals.webp`.
 *
 * @param model The model of the conductor.
 * @returns The pose.
 */
export function conductorPose(model: PlayerModel): AnimalPose {
  const h = model.body.headHeight;
  return armsPose(model, {
    // The right wrist is beside the head, and the baton points up and a little out.
    R: {
      wrist: bindPosition(model, 'upperArmR').add(new Vector3(0.45 * h, 0.45 * h, -0.45 * h)),
      hand: new Quaternion()
        .setFromAxisAngle(Z_AXIS, -15 * MathUtils.DEG2RAD)
        .multiply(new Quaternion().setFromAxisAngle(X_AXIS, 100 * MathUtils.DEG2RAD)),
      pole: new Vector3(1, -0.6, 0.4),
    },
    L: {
      wrist: bindPosition(model, 'upperArmL').add(new Vector3(-0.05 * h, -0.75 * h, -0.55 * h)),
      hand: new Quaternion().setFromAxisAngle(X_AXIS, 50 * MathUtils.DEG2RAD),
      pole: new Vector3(-0.6, -1, 0.4),
    },
  });
}

/**
 * Copies a pose of `poseAt()` for a still view: the head looks to the front, and the eyes are
 * open.
 *
 * @param pose A pose of `poseAt()`. Its arrays can be scratch arrays of the pose buffer.
 * @returns A new pose.
 */
export function stillPose(pose: AnimalPose): AnimalPose {
  const rotations = Float32Array.from(pose.rotations);
  for (const bone of LOOK_BONES) {
    rotations.set(IDENTITY, boneIndex(bone) * 4);
  }

  const copy = ([x, y, z]: readonly [number, number, number]): [number, number, number] => [
    x,
    y,
    z,
  ];
  return {
    rotations,
    rootOffset: copy(pose.rootOffset),
    slideOffset: copy(pose.slideOffset),
    // The bowed pose moves the instrument while the player plays (design 5.3).
    instrumentOffset: copy(pose.instrumentOffset ?? [0, 0, 0]),
    // The violin and the viola keep the turn of the playing grip in the left paw (design 5.2).
    pawTurnL: pose.pawTurnL ?? null,
    // The bow paw bends off the forearm by the bend of the hold (design 5.3).
    pawBendR: pose.pawBendR ?? 0,
    blink: 0,
  };
}

/**
 * Calculates the playing pose of each species and instrument of a score at a moment of play,
 * with `poseAt()` (design 5.1). The head looks to the front, and the idle motion rests.
 *
 * @param score The score of a demo.
 * @param layout The layout of the score.
 * @returns The pose of the first player of each species and instrument that plays a note.
 */
export function playingPoses(
  score: Score,
  layout: SceneLayout,
): Map<`${SpeciesId} ${InstrumentId}`, AnimalPose> {
  const plan = preparePoses(score, layout, 1);
  const poses = new Map<`${SpeciesId} ${InstrumentId}`, AnimalPose>();
  for (const [i, place] of layout.players.entries()) {
    const key = `${place.cast.species} ${place.cast.instrument}` as const;
    if (poses.has(key)) {
      continue;
    }
    const note = score.notes.find(
      (n) => n.seatIndex === place.cast.seatIndex && n.player === place.cast.player,
    );
    if (!note) {
      continue;
    }
    const time = note.startSec + NOTE_SHARE * (note.endSec - note.startSec);
    const pose = poseAt(plan, time, 0, PLAYING, []).players[i];
    if (!pose) {
      continue;
    }
    poses.set(key, stillPose(pose));
  }
  return poses;
}
