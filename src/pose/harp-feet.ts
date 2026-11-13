import { Quaternion, Vector3 } from 'three';

import { HARP_PEDALS, harpPedalFoot } from '../models/instruments/harp.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { NO_TURN } from './axes.ts';
import { setBoneRotation } from './frames.ts';
import { createFootState, footStateAt } from './harp-pedals.ts';
import type { PedalPlan } from './harp-pedals.ts';
import { createArmPose, solveArm } from './ik.ts';
import type { ArmBind } from './ik.ts';

/**
 * The height of the hoof over a harp pedal in the middle of its move to the pedal, in meters, so
 * that the hoof comes down on the pedal from above.
 */
const PEDAL_LIFT = 0.03;

/** The height above the lowest point of the foot that still counts as the sole, in meters. */
const SOLE = 0.015;

/**
 * The largest pitch of a hoof around its heel, in radians. A harpist keeps the heel on the floor
 * and presses a pedal with the ball of the foot (`docs/reference/harp-technique.md`, section 7.7),
 * so the hoof turns up around its heel until the front of its sole is on the pedal. Above this
 * pitch, the whole hoof lifts.
 */
const HEEL_PITCH = 45 * (Math.PI / 180);

/**
 * The lift of the heel for a pedal behind the rest place of the toe: the hoof turns down around
 * its toe by up to `pitch` radians, in full when the toe goes `back` meters behind its rest. The
 * pedals of the near harp of the Tripo fawn lie under its knees. With the heel on the floor there,
 * the right shin went 2.0 cm into the front edge of the stool, and with this lift 0 cm (`pnpm
 * pose-depth harpist`). With 40° in full at 0.2 m, it still went 2.0 cm.
 */
const HEEL_LIFT = { pitch: 60 * (Math.PI / 180), back: 0.15 };

/** The rest place of the hoof and the knee of one leg of a harpist ({@link LEG_RESTS}). */
interface LegRest {
  /** The move of the hoof from its place in the bind, in head heights, in the model axes. */
  readonly hoof: Vec3;
  /** The direction to which the knee points, in the model axes, or `null` for the bind knee. */
  readonly knee: Vec3 | null;
}

/**
 * The rest place of the hoof and the knee of each leg: the left leg, then the right leg. A
 * harpist sits with the knees apart around the harp, and the feet stand at the sides of the base
 * (`docs/reference/harp-technique.md`, sections 2 and 7.7). The near diagonal harp of the Tripo
 * fawn puts the foot of its soundbox and its base over the bind place of the left hoof: there,
 * the left hoof went 3.7 cm into the soundbox and 3.0 cm into the base, and the left shin 3.5 cm
 * into the soundbox, in each sample of `boulanger-matin`. So the left hoof rests to the left of
 * the base, behind the foot of the soundbox, and the harp stands between the knees. Its knee
 * points out, forward, and a little up: with the knee of the bind, the knee went back over the
 * front corner of the stool, and the left shin 2.0 cm into the stool. With this knee, the left
 * shin goes 1.8 cm into the stool only in a pedal move (0.7 % of the samples). The base stands to
 * the right of the middle (`HARP_PLACE.side`), so the right hoof rests 0.15 H to the right of its
 * bind place: with the bind place, the right hoof went 2.1 cm into the base in 1.9 % of the
 * samples, in pedal moves, and with this place 1.9 cm in 0.7 %.
 */
const LEG_RESTS: readonly [left: LegRest, right: LegRest] = [
  { hoof: [-0.55, 0, 0.6], knee: [-0.5, 0.3, -1] },
  { hoof: [0.15, 0, 0], knee: null },
];

/** One leg of a harpist and the harp pedals in front of it, in the model axes. */
interface HarpFoot {
  /** The bind joints of the leg: the hip (`thigh`), the knee (`shin`), the ankle (`foot`). */
  readonly bind: ArmBind;
  /** The direction to which the knee points. */
  readonly pole: Vec3;
  /** The front of the sole of the hoof in the bind: the point that presses a pedal. */
  readonly toe: Vec3;
  /** The back of the sole of the hoof in the bind: the heel, which stays on the floor. */
  readonly heel: Vec3;
  /** The move of the hoof from its bind place to its rest place, in meters ({@link LEG_RESTS}). */
  readonly rest: Vec3;
  /** The bones of the leg. */
  readonly bones: { readonly thigh: number; readonly shin: number; readonly foot: number };
}

/** The legs of a harpist and the press points of the harp pedals (design 5.3). */
export interface HarpFeet {
  readonly left: HarpFoot;
  readonly right: HarpFoot;
  /**
   * The point where the hoof presses each pedal, in the order of `HARP_PEDALS.order`: in the flat,
   * the natural, and the sharp notch, in the model axes.
   */
  readonly pedals: readonly (readonly [flat: Vec3, natural: Vec3, sharp: Vec3])[];
}

/**
 * Finds the legs of a harpist and the press point of each harp pedal (design 5.3).
 *
 * @param model A player with the harp.
 * @param scale The scale of the harp of the species (`SpeciesParams.harpScale`).
 * @returns The feet, or `null` for a body with no corner on a foot.
 */
export function harpFeet(model: PlayerModel, scale: number): HarpFeet | null {
  const leg = (side: 'L' | 'R'): HarpFoot | null => {
    const bones = {
      thigh: boneIndex(`thigh${side}`),
      shin: boneIndex(`shin${side}`),
      foot: boneIndex(`foot${side}`),
    };
    const { positions, bones: owners } = model.mesh;
    const corners: Vector3[] = [];
    for (let corner = 0; corner < owners.length; corner++) {
      if (owners[corner] === bones.foot) {
        corners.push(new Vector3().fromArray(positions, corner * 3));
      }
    }
    if (corners.length === 0) {
      return null;
    }
    const low = Math.min(...corners.map((c) => c.y));
    const sole = corners.filter((c) => c.y <= low + SOLE);
    const front = Math.min(...sole.map((c) => c.z));
    const back = Math.max(...sole.map((c) => c.z));
    const x = sole.reduce((sum, c) => sum + c.x, 0) / sole.length;
    const p = model.skeleton.positions;
    const hip = new Vector3(...(p[bones.thigh] ?? [0, 0, 0]));
    const knee = new Vector3(...(p[bones.shin] ?? [0, 0, 0]));
    const ankle = new Vector3(...(p[bones.foot] ?? [0, 0, 0]));
    const pole = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5));
    const rest = LEG_RESTS[side === 'L' ? 0 : 1];
    return {
      bind: { shoulder: toVec3(hip), elbow: toVec3(knee), wrist: toVec3(ankle) },
      pole: rest.knee ?? toVec3(pole),
      toe: [x, low, front],
      heel: [x, low, back],
      rest: toVec3(new Vector3(...rest.hoof).multiplyScalar(model.body.headHeight)),
      bones,
    };
  };
  const left = leg('L');
  const right = leg('R');
  if (!left || !right) {
    return null;
  }
  const at = (point: Vec3): Vec3 => placePoint(model.pieces, { bone: 'instrument', at: point });
  return {
    left,
    right,
    pedals: HARP_PEDALS.order.map(
      (pedal) =>
        [
          at(harpPedalFoot(pedal, 'flat', scale)),
          at(harpPedalFoot(pedal, 'natural', scale)),
          at(harpPedalFoot(pedal, 'sharp', scale)),
        ] as const,
    ),
  };
}

/** The scratch foot of {@link poseHarpFeet}. Each call writes it before it reads it. */
const footState = createFootState();
const legPose = createArmPose();
const hipAt = new Vector3();
const toeAt = new Vector3();
const restToe = new Vector3();
const fromAt = new Vector3();
const pedalAt = new Vector3();
const ankleAt = new Vector3();
const heelAt = new Vector3();
const sole = new Vector3();
/** The axis of the pitch of a hoof: the sole points to -z, so the toe goes up around +x. */
const PITCH_AXIS = new Vector3(1, 0, 0);
const pitch = new Quaternion();
const poleAt = new Vector3();
const local = new Quaternion();
const press = new Vector3();
const pressNext = new Vector3();

/**
 * Gives the press point of a pedal at a notch between the notches.
 *
 * @param feet The feet.
 * @param pedal The index of the pedal.
 * @param notch The notch, from -1 (flat) to 1 (sharp).
 * @param out The point to write.
 * @returns `out`.
 */
function pressPoint(feet: HarpFeet, pedal: number, notch: number, out: Vector3): Vector3 {
  const [flat, natural, sharp] = feet.pedals[pedal] ?? [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  out.fromArray(natural);
  return notch >= 0
    ? out.lerp(pressNext.fromArray(sharp), notch)
    : out.lerp(pressNext.fromArray(flat), -notch);
}

/**
 * Puts the legs of a harpist on the harp pedals and writes the local rotations of the thighs, the
 * shins, and the feet (design 5.3). Each foot goes from its rest place to the pedal of its next
 * change ({@link footStateAt}), lifted in the move, presses the pedal into its new notch, and goes
 * back. The hoof turns up around its heel until the front of its sole lies on the top of the
 * pedal, so the heel stays on the floor, as a harpist presses a pedal with the ball of the foot.
 * The two-bone IK of each leg places the knee, and a pedal out of the reach of the leg stays at
 * the end of the stretched leg.
 *
 * @param feet The feet.
 * @param plan The pedal plan of the player.
 * @param notches The notch of each pedal at the time (`pedalNotchesAt()`).
 * @param time The song time of the note layer.
 * @param weight The eased weight of the playing pose: at rest, the feet stay in their rest places.
 * @param rotations The rotations of the pose to write.
 */
export function poseHarpFeet(
  feet: HarpFeet,
  plan: PedalPlan,
  notches: Float32Array,
  time: number,
  weight: number,
  rotations: Float32Array,
): void {
  for (const [side, foot] of [feet.left, feet.right].entries()) {
    footStateAt(plan, side, time, footState);
    restToe.fromArray(foot.toe).add(press.fromArray(foot.rest));
    toeAt.copy(restToe);
    fromAt.copy(toeAt);
    if (footState.fromPedal >= 0) {
      const p = footState.fromPedal;
      fromAt.lerp(pressPoint(feet, p, notches[p] ?? 0, press), footState.fromShare);
    }
    if (footState.pedal >= 0) {
      const p = footState.pedal;
      pressPoint(feet, p, notches[p] ?? 0, pedalAt);
      fromAt.lerp(pedalAt, footState.share);
      // The lift goes on after the mix, so the hoof stands the full lift above the line of its
      // move. With the lift on the pedal only, the hoof rose half of it in the middle, and the
      // right hoof went 1.4 cm into the base in a move from one pedal to the next (116.8 s of
      // `boulanger-matin`, `pnpm body-clip harpist`).
      fromAt.y += PEDAL_LIFT * footState.lift;
    }
    toeAt.lerp(fromAt, weight);

    // The hoof pitches around its heel until the front of the sole reaches its height above the
    // rest, and the heel goes to the place behind it. The ankle turns with the hoof.
    sole.fromArray(foot.toe).sub(press.fromArray(foot.heel));
    const length = sole.length();
    const rise = Math.min(Math.max((toeAt.y - (foot.toe[1] ?? 0)) / length, 0), 1);
    const back = Math.min(Math.max((toeAt.z - restToe.z) / HEEL_LIFT.back, 0), 1);
    pitch.setFromAxisAngle(
      PITCH_AXIS,
      Math.min(Math.asin(rise), HEEL_PITCH) - HEEL_LIFT.pitch * back,
    );
    heelAt.copy(toeAt).sub(sole.applyQuaternion(pitch));
    ankleAt.fromArray(foot.bind.wrist).sub(press).applyQuaternion(pitch).add(heelAt);
    hipAt.fromArray(foot.bind.shoulder);
    poleAt.fromArray(foot.pole);
    solveArm(foot.bind, hipAt, NO_TURN, ankleAt, poleAt, legPose);
    setBoneRotation(rotations, foot.bones.thigh, legPose.upper);
    setBoneRotation(
      rotations,
      foot.bones.shin,
      local.copy(legPose.upper).invert().multiply(legPose.lower),
    );
    setBoneRotation(rotations, foot.bones.foot, local.copy(legPose.lower).invert().multiply(pitch));
  }
}
