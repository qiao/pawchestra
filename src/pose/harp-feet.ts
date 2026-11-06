import { Quaternion, Vector3 } from 'three';

import { HARP_PEDALS, harpPedalFoot } from '../models/instruments/harp.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
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

/** One leg of a harpist and the harp pedals in front of it, in the model axes. */
interface HarpFoot {
  /** The bind joints of the leg: the hip (`thigh`), the knee (`shin`), the ankle (`foot`). */
  readonly bind: ArmBind;
  /** The direction to which the knee points. */
  readonly pole: Vec3;
  /** The front of the sole of the hoof in the bind: the point that presses a pedal. */
  readonly toe: Vec3;
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
    const x = sole.reduce((sum, c) => sum + c.x, 0) / sole.length;
    const p = model.skeleton.positions;
    const hip = new Vector3(...(p[bones.thigh] ?? [0, 0, 0]));
    const knee = new Vector3(...(p[bones.shin] ?? [0, 0, 0]));
    const ankle = new Vector3(...(p[bones.foot] ?? [0, 0, 0]));
    const pole = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5));
    return {
      bind: { shoulder: toVec3(hip), elbow: toVec3(knee), wrist: toVec3(ankle) },
      pole: toVec3(pole),
      toe: [x, low, front],
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
const fromAt = new Vector3();
const pedalAt = new Vector3();
const ankleAt = new Vector3();
const poleAt = new Vector3();
const local = new Quaternion();
const IDENTITY = new Quaternion();
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
 * back. The foot keeps its bind turn, so the front of the sole lies on the top of the pedal. The
 * two-bone IK of each leg places the knee, and a pedal out of the reach of the leg stays at the
 * end of the stretched leg.
 *
 * @param feet The feet.
 * @param plan The pedal plan of the player.
 * @param notches The notch of each pedal at the time (`pedalNotchesAt()`).
 * @param time The song time of the note layer.
 * @param weight The eased weight of the playing pose: at rest, the feet stay in their bind places.
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
    toeAt.fromArray(foot.toe);
    fromAt.copy(toeAt);
    if (footState.fromPedal >= 0) {
      const p = footState.fromPedal;
      fromAt.lerp(pressPoint(feet, p, notches[p] ?? 0, press), footState.fromShare);
    }
    if (footState.pedal >= 0) {
      const p = footState.pedal;
      pressPoint(feet, p, notches[p] ?? 0, pedalAt);
      pedalAt.y += PEDAL_LIFT * footState.lift;
      fromAt.lerp(pedalAt, footState.share);
    }
    // The ankle keeps its place over the front of the sole.
    toeAt.lerp(fromAt, weight);
    ankleAt.fromArray(foot.bind.wrist).sub(press.fromArray(foot.toe)).add(toeAt);
    hipAt.fromArray(foot.bind.shoulder);
    poleAt.fromArray(foot.pole);
    solveArm(foot.bind, hipAt, IDENTITY, ankleAt, poleAt, legPose);
    setBoneRotation(rotations, foot.bones.thigh, legPose.upper);
    setBoneRotation(
      rotations,
      foot.bones.shin,
      local.copy(legPose.upper).invert().multiply(legPose.lower),
    );
    setBoneRotation(rotations, foot.bones.foot, local.copy(legPose.lower).invert());
  }
}
