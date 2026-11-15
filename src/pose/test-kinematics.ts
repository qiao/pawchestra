import { Vector3 } from 'three';

import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { PlayerModel } from '../models/player.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PiecePoint } from '../models/instruments/types.ts';
import { boneRotation, chainFrames, createFrame, posePoint } from './frames.ts';
import type { Frame } from './frames.ts';
import type { PosePlan } from './plan.ts';
import { createScenePose, poseAt } from './pose-at.ts';
import { PLAYING, allAudible } from './test-scene.ts';
import type { ScenePlayer, TestScene } from './test-scene.ts';
import type { AnimalPose, Transport } from './types.ts';

/** A posed skeleton: the frame of each bone. Only tests use it. */
export interface PosedSkeleton {
  readonly model: PlayerModel;
  readonly frames: readonly Frame[];
  /** The pose of the frames. A body reads it for its own skin (`test-skin.ts`). */
  readonly pose: AnimalPose;
}

/**
 * Makes frames for {@link chainFrames}.
 *
 * @param count The number of frames.
 * @returns The frames, each with no rotation at the origin.
 */
export function createFrames(count: number): Frame[] {
  return Array.from({ length: count }, createFrame);
}

/**
 * Calculates the frames of all bones of a posed player, with the move of the trombone slide.
 * Only tests use this function, so it does not enter the first download.
 *
 * @param model The player model.
 * @param pose The pose.
 * @returns The posed skeleton.
 */
export function poseSkeleton(model: PlayerModel, pose: AnimalPose): PosedSkeleton {
  const frames = chainFrames(
    model.skeleton,
    pose.rotations,
    createFrames(BONE_NAMES.length),
    pose.rootOffset,
  );
  const positions = model.skeleton.positions;
  // The scene adds the instrument offset to the bind position of the instrument bone, in the axes
  // of its parent (design 5.1). The instrument bone has no child bone but the slide.
  const instrumentIndex = boneIndex('instrument');
  const instrumentFrame = frames[instrumentIndex];
  const parent = frames[model.skeleton.parents[instrumentIndex] ?? 0];
  if (instrumentFrame && parent && pose.instrumentOffset) {
    instrumentFrame.position.add(
      new Vector3(...pose.instrumentOffset).applyQuaternion(parent.rotation),
    );
  }
  // The scene adds the slide offset to the bind position of the slide bone, in the axes of its
  // parent, the instrument bone (design 5.1).
  const slide = boneIndex('slide');
  const instrument = frames[instrumentIndex];
  const own = frames[slide];
  if (instrument && own) {
    const bind = new Vector3(...(positions[slide] ?? [0, 0, 0]))
      .sub(new Vector3(...(positions[boneIndex('instrument')] ?? [0, 0, 0])))
      .add(new Vector3(...pose.slideOffset));
    frames[slide] = {
      rotation: own.rotation,
      position: bind.applyQuaternion(instrument.rotation).add(instrument.position),
    };
  }
  return { model, frames, pose };
}

/**
 * Tells if a pose shows a corner of the mesh of a player: each corner but the corners of a hidden
 * copy of a switched piece (`PieceCopies`, `AnimalPose.held`), as the scene draws it.
 *
 * @param posed The posed skeleton.
 * @param corner The index of the corner in the mesh.
 * @returns False for a corner of a hidden copy.
 */
export function cornerShown(posed: PosedSkeleton, corner: number): boolean {
  const { copies } = posed.model;
  if (!copies) {
    return true;
  }
  for (let c = 0; c < copies.starts.length; c++) {
    if (corner >= (copies.starts[c] ?? 0) && corner < (copies.ends[c] ?? 0)) {
      const inPaw = (posed.pose.held?.[c >> 1] ?? 0) >= 0.5;
      return (c % 2 === 1) === inPaw;
    }
  }
  return true;
}

/**
 * Moves a bind point of a bone to its posed place.
 *
 * @param posed The posed skeleton.
 * @param bone The bone that the point follows.
 * @param point The bind point, in the model axes.
 * @returns The posed point.
 * @throws Error if the bone has no frame.
 */
export function posedPoint(posed: PosedSkeleton, bone: BoneName, point: Vec3): Vec3 {
  const i = boneIndex(bone);
  const frame = posed.frames[i];
  if (!frame) {
    throw new Error(`The bone "${bone}" has no frame.`);
  }
  return toVec3(posePoint(frame, posed.model.skeleton.positions[i] ?? [0, 0, 0], point));
}

/**
 * Moves a point of an instrument piece to its posed place.
 *
 * @param posed The posed skeleton.
 * @param point The point on its piece.
 * @returns The posed point.
 */
export function posedPiecePoint(posed: PosedSkeleton, point: PiecePoint): Vec3 {
  return posedPoint(posed, point.bone, placePoint(posed.model.pieces, point));
}

/** The step of the samples of the pose timing tests: 0.5 ms (design 9.7). */
export const SAMPLE_STEP = 0.0005;

/** A measure of one posed player at one song time. */
export interface PoseSample {
  readonly time: number;
  readonly value: Vec3;
}

/**
 * Samples a measure of one player every {@link SAMPLE_STEP} of song time, while it plays at the
 * wall time 10 s. `poseAt()` reads the seat from the player plan, so a plan with only this player
 * gives the same pose, and each sample poses one player.
 *
 * @param plan The plan of the score.
 * @param index The index of the player in the plan.
 * @param from The first song time.
 * @param to The last song time.
 * @param measure Gives the measure of a pose.
 * @returns The samples, sorted by time.
 * @throws Error if the plan has no player at the index.
 */
export function sampleAround(
  plan: PosePlan,
  index: number,
  from: number,
  to: number,
  measure: (pose: AnimalPose) => Vec3,
): PoseSample[] {
  const player = plan.players[index];
  if (!player) {
    throw new Error(`The plan has no player ${index}.`);
  }
  const one: PosePlan = { ...plan, players: [player] };
  const buffer = createScenePose(one);
  const samples: PoseSample[] = [];
  for (let time = from; time <= to; time += SAMPLE_STEP) {
    const pose = poseAt(one, time, 10, PLAYING, [], buffer).players[0];
    if (!pose) {
      throw new Error('The player has no pose.');
    }
    samples.push({ time, value: measure(pose) });
  }
  return samples;
}

/**
 * Finds the first sample at which a motion starts or stops: the first sample after which the
 * motion has the given state, while it did not have that state before the sample.
 *
 * @param samples The samples, sorted by time.
 * @param moves Tells whether the measure moves from one sample to the next.
 * @param starts `true` to find a start of the motion, `false` to find a stop.
 * @returns The time of the sample, or `null` if the motion does not change in the samples.
 */
export function firstChange(
  samples: readonly PoseSample[],
  moves: (from: Vec3, to: Vec3) => boolean,
  starts: boolean,
): number | null {
  const moving = (k: number): boolean => {
    const a = samples[k];
    const b = samples[k + 1];
    return a && b ? moves(a.value, b.value) : false;
  };
  for (let k = 1; k + 1 < samples.length; k++) {
    if (moving(k) === starts && moving(k - 1) !== starts) {
      return samples[k]?.time ?? null;
    }
  }
  return null;
}

/** The angles of a hanging arm of a posed player. */
interface ArmHang {
  /** The angle of the upper arm out to the side of the body, from the vertical, in radians. */
  readonly out: number;
  /** The angle of the bend of the elbow, in radians: 0 for a straight arm. */
  readonly bend: number;
}

/**
 * Measures how an arm of a posed player hangs: the swing of the upper arm out to the side, and
 * the bend of the elbow.
 *
 * @param posed The posed skeleton.
 * @param side The side of the arm.
 * @returns The angles.
 * @throws Error if a bone of the arm has no frame.
 */
export function armHang(posed: PosedSkeleton, side: 'L' | 'R'): ArmHang {
  const at = (bone: BoneName): Vector3 => {
    const frame = posed.frames[boneIndex(bone)];
    if (!frame) {
      throw new Error(`The bone "${bone}" has no frame.`);
    }
    return frame.position;
  };
  const shoulder = at(`upperArm${side}`);
  const elbow = at(`forearm${side}`);
  const wrist = at(`hand${side}`);
  const upper = elbow.clone().sub(shoulder).normalize();
  const lower = wrist.clone().sub(elbow).normalize();
  return {
    out: Math.asin((side === 'L' ? -1 : 1) * upper.x),
    bend: upper.angleTo(lower),
  };
}

/**
 * Gives the angle of the turn of a bone from the bind pose.
 *
 * @param rotations The rotations of a pose.
 * @param bone The bone index.
 * @returns The angle, in radians, from 0 to π.
 */
export function turnOf(rotations: Float32Array, bone: number): number {
  const { w } = boneRotation(rotations, bone);
  return 2 * Math.acos(Math.min(1, Math.abs(w)));
}

/**
 * Poses a scene and gives the posed skeleton of one player. All seats sound.
 *
 * @param scene The scene.
 * @param player The player.
 * @param songTime The song time.
 * @param wall The wall clock time.
 * @param transport The play state.
 * @returns The posed skeleton.
 * @throws Error if the scene has no pose for the player.
 */
export function posedAt(
  scene: TestScene,
  player: ScenePlayer,
  songTime: number,
  wall = 10,
  transport: Transport = PLAYING,
): PosedSkeleton {
  const pose = poseAt(scene.plan, songTime, wall, transport, allAudible(scene.score)).players[
    player.index
  ];
  if (!pose) {
    throw new Error('The player has no pose.');
  }
  return poseSkeleton(player.model, pose);
}

/** The bones of the arms, as pairs of a bone and its child. */
const ARM_BONES = [
  ['upperArmL', 'forearmL'],
  ['forearmL', 'handL'],
  ['upperArmR', 'forearmR'],
  ['forearmR', 'handR'],
] as const satisfies readonly (readonly [BoneName, BoneName])[];

/**
 * Gives the change of length of each bone of the arms from the bind pose. The IK must keep each
 * length (design 4.7).
 *
 * @param posed The posed skeleton.
 * @returns The absolute change of the upper arm and the forearm of the left and the right arm,
 *   in meters.
 */
export function armLengthErrors(posed: PosedSkeleton): number[] {
  const bind = posed.model.skeleton.positions;
  const at = (bone: BoneName): Vector3 => posed.frames[boneIndex(bone)]?.position ?? new Vector3();
  const bindAt = (bone: BoneName): Vector3 => new Vector3(...(bind[boneIndex(bone)] ?? [0, 0, 0]));
  return ARM_BONES.map(([a, b]) =>
    Math.abs(at(a).distanceTo(at(b)) - bindAt(a).distanceTo(bindAt(b))),
  );
}

/**
 * Gives the turn of the instrument bone of one player at the song time 1 s.
 *
 * @param scene The scene.
 * @param index The index of the player.
 * @param wall The wall clock time.
 * @param transport The play state.
 * @param mutedAtWall The wall time at which the seat of the player went silent, or `null` for a
 *   seat that sounds.
 * @returns The angle, in radians.
 */
export function instrumentTurn(
  scene: TestScene,
  index: number,
  wall: number,
  transport: Transport = PLAYING,
  mutedAtWall: number | null = null,
): number {
  const seat = scene.plan.players[index]?.seatIndex;
  const audibility = allAudible(scene.score).map((a, i) =>
    mutedAtWall !== null && i === seat
      ? { audible: false, changedAtWall: mutedAtWall, before: null }
      : a,
  );
  const pose = poseAt(scene.plan, 1, wall, transport, audibility).players[index];
  return turnOf(pose?.rotations ?? new Float32Array(0), boneIndex('instrument'));
}
