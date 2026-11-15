import { Quaternion, Vector3 } from 'three';

import { PIANO_PEDALS, PIANO_SCALE, pianoPedalTip } from '../models/instruments/piano.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { PedalTrack } from '../score/pedal.ts';
import { NO_TURN, X_AXIS } from './axes.ts';
import { lastAtOrBefore } from './blend.ts';
import { setBoneRotation } from './frames.ts';
import { createArmPose, solveArm } from './ik.ts';
import type { ArmBind } from './ik.ts';
import { smoothstep } from '../math.ts';

/**
 * The time of one press or one release of the damper pedal, in seconds. A pianist changes the
 * pedal in a short move of the ankle (design 5.3).
 */
const PEDAL_SEC = 0.1;

/**
 * The share of the length of the sole from the heel to the ball of the foot. On the polar bear,
 * the toe joint of the rig is at 0.64 of the sole.
 */
const BALL_SHARE = 0.64;

/** The height above the lowest point of the foot that still counts as the sole, in meters. */
const SOLE = 0.015;

/** The gap between the foot and the sostenuto pedal, in meters. */
const SOSTENUTO_GAP = 0.01;

/** The distance of the ball of the foot behind the tip of the pedal, in meters. */
const TIP_INSET = 0.01;

/** The sustain pedal of a pianist, with the level at each change for the stateless ramp. */
export interface PedalMotion extends PedalTrack {
  /** The level of the pedal at each change, where the ramp of the change starts. */
  readonly from: Float32Array;
}

/**
 * Makes the motion of the damper pedal from the sustain pedal of a seat. Each change ramps the
 * pedal in {@link PEDAL_SEC} from the level that the change finds.
 *
 * @param track The changes of the sustain pedal of the seat.
 * @returns The motion.
 */
export function pedalMotion(track: PedalTrack): PedalMotion {
  const from = new Float32Array(track.times.length);
  for (let i = 1; i < from.length; i++) {
    from[i] = rampLevel(track, from, i - 1, track.times[i] ?? 0);
  }
  return { ...track, from };
}

/**
 * Gives the level of the pedal in the ramp of one change.
 *
 * @param track The changes.
 * @param from The level at each change.
 * @param i The index of the change.
 * @param time The song time, at or after the change.
 * @returns The level, from 0 (up) to 1 (down).
 */
function rampLevel(track: PedalTrack, from: Float32Array, i: number, time: number): number {
  const start = from[i] ?? 0;
  const end = track.down[i] ?? 0;
  return start + (end - start) * smoothstep((time - (track.times[i] ?? 0)) / PEDAL_SEC);
}

/**
 * Gives the level of the damper pedal at a song time: a pure function of the motion and the time.
 *
 * @param motion The motion of the pedal.
 * @param time The song time of the note layer, in seconds.
 * @returns The level, from 0 (up) to 1 (down).
 */
export function pedalLevelAt(motion: PedalMotion, time: number): number {
  const i = lastAtOrBefore(motion.times, time);
  return i < 0 ? 0 : rampLevel(motion, motion.from, i, time);
}

/** The right leg of a pianist and the damper pedal in front of it, in the model axes. */
export interface PedalFoot {
  /** The bind joints of the leg: the hip (`thighR`), the knee (`shinR`), the ankle (`footR`). */
  readonly bind: ArmBind;
  /** The direction to which the knee points. */
  readonly pole: Vec3;
  /** The back of the sole in the bind: the heel stays on the floor at this height. */
  readonly heel: Vec3;
  /** The distance from the heel to the ball of the foot along the sole. */
  readonly ball: number;
  /**
   * The place of the ball of the foot on the damper pedal at rest: the line of the foot, the top
   * of the pedal, and a point just behind its tip.
   */
  readonly target: Vec3;
  /** The drop of the pressed pedal, in meters. */
  readonly travel: number;
}

/** The bones of the right leg. */
const LEG = {
  thigh: boneIndex('thighR'),
  shin: boneIndex('shinR'),
  foot: boneIndex('footR'),
} as const;

/**
 * Finds the right leg of a pianist and the place of its foot on the damper pedal (design 5.3).
 * The heel stays on the floor, and the ball of the foot lies on the pedal, as a pianist pedals.
 * A wide foot keeps its inner edge right of the sostenuto pedal, so that only the damper pedal
 * lies under it.
 *
 * @param model A player with the piano.
 * @returns The foot, or `null` for a body with no corner on the right foot.
 */
export function pedalFoot(model: PlayerModel): PedalFoot | null {
  const { positions, bones } = model.mesh;
  const corners: Vector3[] = [];
  for (let corner = 0; corner < bones.length; corner++) {
    if (bones[corner] === LEG.foot) {
      corners.push(new Vector3().fromArray(positions, corner * 3));
    }
  }
  if (corners.length === 0) {
    return null;
  }
  const x0 = Math.min(...corners.map((c) => c.x));
  const x1 = Math.max(...corners.map((c) => c.x));
  const y0 = Math.min(...corners.map((c) => c.y));
  const z0 = Math.min(...corners.map((c) => c.z));
  // The heel is the back of the sole. A higher point at the back of the foot is no pivot: the foot
  // that turns up around it lifts the heel 2 cm off the floor.
  const z1 = Math.max(...corners.filter((c) => c.y <= y0 + SOLE).map((c) => c.z));

  const at = (point: Vec3): Vec3 => placePoint(model.pieces, { bone: 'instrument', at: point });
  const damper = at(pianoPedalTip('damper'));
  const sostenuto = at(pianoPedalTip('sostenuto'));
  const plate = (PIANO_PEDALS.plateWidth * PIANO_SCALE) / 2;
  const half = (x1 - x0) / 2;
  const inner = sostenuto[0] + plate + SOSTENUTO_GAP + half;
  const outer = damper[0] - plate + half;
  const line = inner <= outer ? (inner + outer) / 2 : inner;

  const p = model.skeleton.positions;
  const hip = new Vector3(...(p[LEG.thigh] ?? [0, 0, 0]));
  const knee = new Vector3(...(p[LEG.shin] ?? [0, 0, 0]));
  const ankle = new Vector3(...(p[LEG.foot] ?? [0, 0, 0]));
  const pole = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5));
  return {
    bind: { shoulder: toVec3(hip), elbow: toVec3(knee), wrist: toVec3(ankle) },
    pole: toVec3(pole),
    heel: [(x0 + x1) / 2, y0, z1],
    ball: BALL_SHARE * (z1 - z0),
    target: [line, damper[1], damper[2] - TIP_INSET],
    travel: PIANO_PEDALS.travel * PIANO_SCALE,
  };
}

const leg = createArmPose();
const hipAt = new Vector3();
const ankleAt = new Vector3();
const heelAt = new Vector3();
const heelBind = new Vector3();
const poleAt = new Vector3();
const footTurn = new Quaternion();
const local = new Quaternion();

/**
 * Puts the right foot of a pianist on the damper pedal and writes the local rotations of the
 * thigh, the shin, and the foot (design 5.3). The heel stays on the floor, the foot turns up
 * around it, and the ball of the foot lies on the top of the pedal. In the first half of the
 * lift, the foot turns up in its bind place. In the second half, it moves onto the pedal, so that
 * the sole comes down on the pedal from above and does not go through its edge.
 *
 * @param foot The foot.
 * @param level The level of the pedal, from 0 (up) to 1 (down).
 * @param weight The eased weight of the playing pose.
 * @param rotations The rotations of the pose to write.
 * @returns The drop of the damper pedal, in meters.
 */
export function posePedalFoot(
  foot: PedalFoot,
  level: number,
  weight: number,
  rotations: Float32Array,
): number {
  const drop = foot.travel * level * weight;
  const turnShare = smoothstep(2 * weight);
  const moveShare = smoothstep(2 * weight - 1);
  const [x, y, z] = foot.target;
  const [hx, hy, hz] = foot.heel;
  const rise = Math.min(Math.max((y - drop - hy) / foot.ball, -1), 1);
  const pitch = Math.asin(rise);
  footTurn.setFromAxisAngle(X_AXIS, pitch * turnShare);
  heelAt.set(
    hx + (x - hx) * moveShare,
    hy,
    hz + (z + foot.ball * Math.cos(pitch) - hz) * moveShare,
  );
  ankleAt
    .fromArray(foot.bind.wrist)
    .sub(heelBind.fromArray(foot.heel))
    .applyQuaternion(footTurn)
    .add(heelAt);

  hipAt.fromArray(foot.bind.shoulder);
  poleAt.fromArray(foot.pole);
  solveArm(foot.bind, hipAt, NO_TURN, ankleAt, poleAt, leg);
  setBoneRotation(rotations, LEG.thigh, leg.upper);
  setBoneRotation(rotations, LEG.shin, local.copy(leg.upper).invert().multiply(leg.lower));
  setBoneRotation(rotations, LEG.foot, local.copy(leg.lower).invert().multiply(footTurn));
  return drop;
}
