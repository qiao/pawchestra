import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { NO_TURN } from './axes.ts';
import { lastAtOrBefore } from './blend.ts';
import { setBoneRotation } from './frames.ts';
import { createArmPose, solveArm } from './ik.ts';
import type { ArmBind } from './ik.ts';
import { smoothstep } from './rest.ts';

/**
 * The side move of the body of a standing player behind its notes (design 5.3), as a real
 * xylophonist moves from side to side behind the notes with the feet in place
 * (`docs/reference/percussion-technique.md` 9). The hips move to the side, the spine leans to the
 * same side, and the feet stay on the floor.
 */
export interface SideMove {
  /**
   * The side place of the notes from the middle of the player, in meters, at which the body
   * makes its full move. A nearer place gives a part of the move.
   */
  readonly span: number;
  /** The largest side move of the hips, in meters. */
  readonly hips: number;
  /** The largest side lean of the spine toward the notes, in radians. */
  readonly spine: number;
  /**
   * The time in which the body moves to the place of a new note, in seconds. The move ends at
   * the note start, so the body looks ahead by this time.
   */
  readonly moveSec: number;
}

/** The side move data of a player that the pose looks up at each frame. */
export interface SideTrack {
  /** The side move of the hold. */
  readonly move: SideMove;
  /** The start of each strike group, sorted. */
  readonly starts: Float64Array;
  /** The mean side place (x) of the targets of each strike group, in the model axes. */
  readonly places: Float64Array;
}

/**
 * Calculates the side move data of a player (design 5.3).
 *
 * @param move The side move of the hold.
 * @param groups The start and the mean side place of each strike group, sorted by start.
 * @returns The data, or `null` for a player with no strikes.
 */
export function buildSideTrack(
  move: SideMove,
  groups: readonly { readonly start: number; readonly place: number }[],
): SideTrack | null {
  if (groups.length === 0) {
    return null;
  }
  return {
    move,
    starts: Float64Array.from(groups, (g) => g.start),
    places: Float64Array.from(groups, (g) => g.place),
  };
}

/**
 * Calculates the side move of the body at a song time (design 5.3): the body moves toward the
 * side place of each note in the time `SideMove.moveSec` before its start, with an eased step,
 * and it stays at that place until the next move. Thus near notes give a mean place, and the
 * move has no jump. The share follows a quarter of a sine up to `SideMove.span`, so that the body
 * slows before its full move.
 *
 * @param track The side move data.
 * @param time The song time of the note layer.
 * @returns The share of the full move, from -1 (left) to 1 (right).
 */
export function sideMoveAt(track: SideTrack, time: number): number {
  const { move, starts, places } = track;
  const last = lastAtOrBefore(starts, time);
  let place = places[Math.max(last, 0)] ?? 0;
  for (let j = Math.max(last + 1, 1); j < starts.length; j++) {
    const begin = (starts[j] ?? 0) - move.moveSec;
    if (begin >= time) {
      break;
    }
    const step = (places[j] ?? 0) - (places[j - 1] ?? 0);
    place += step * smoothstep((time - begin) / move.moveSec);
  }
  return Math.sin((Math.PI / 2) * MathUtils.clamp(place / move.span, -1, 1));
}

/** One leg of a standing player in the bind pose, with the bones of the thigh, shin, and foot. */
interface Leg {
  /** The hip joint, the knee, and the ankle in the bind pose. */
  readonly bind: ArmBind;
  /** The direction to which the knee points: from the middle of the hip and the ankle. */
  readonly pole: Vec3;
  /** The index of the thigh bone. */
  readonly thigh: number;
  /** The index of the shin bone. */
  readonly shin: number;
  /** The index of the foot bone. */
  readonly foot: number;
}

/** The two legs of a standing player whose feet stay on the floor while the hips move. */
export interface PlantedLegs {
  /** The left leg. */
  readonly left: Leg;
  /** The right leg. */
  readonly right: Leg;
}

/**
 * Finds the legs of a standing player.
 *
 * @param model The player model.
 * @returns The legs.
 */
export function plantedLegs(model: PlayerModel): PlantedLegs {
  const p = model.skeleton.positions;
  const leg = (side: 'L' | 'R'): Leg => {
    const thigh = boneIndex(side === 'L' ? 'thighL' : 'thighR');
    const shin = boneIndex(side === 'L' ? 'shinL' : 'shinR');
    const foot = boneIndex(side === 'L' ? 'footL' : 'footR');
    const hip = new Vector3(...(p[thigh] ?? [0, 0, 0]));
    const knee = new Vector3(...(p[shin] ?? [0, 0, 0]));
    const ankle = new Vector3(...(p[foot] ?? [0, 0, 0]));
    const pole = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5));
    return {
      bind: { shoulder: toVec3(hip), elbow: toVec3(knee), wrist: toVec3(ankle) },
      pole: toVec3(pole),
      thigh,
      shin,
      foot,
    };
  };
  return { left: leg('L'), right: leg('R') };
}

/**
 * Gives the drop of the hips that a side move needs, so that the leg that the move stretches
 * keeps its bind length from the hip joint to the ankle, with the ankle in its bind place.
 *
 * @param leg The leg.
 * @param x The side move of the hips, in meters.
 * @returns The drop, in meters, 0 or more.
 */
function legDrop(leg: Leg, x: number): number {
  const [hx, hy, hz] = leg.bind.shoulder;
  const [ax, ay, az] = leg.bind.wrist;
  const length = Math.hypot(ax - hx, ay - hy, az - hz);
  const dx = ax - hx - x;
  const dz = az - hz;
  const height = Math.sqrt(Math.max(0, length ** 2 - dx ** 2 - dz ** 2));
  return Math.max(0, hy - ay - height);
}

/**
 * Writes the root offset of a side move of the hips (design 5.3): the move to the side, and the
 * drop that keeps both feet on the floor with no leg longer than in the bind pose.
 *
 * @param legs The legs.
 * @param x The side move of the hips, in meters.
 * @param out The root offset to write.
 */
export function hipsOffset(legs: PlantedLegs, x: number, out: [number, number, number]): void {
  out[0] = x;
  out[1] = -Math.max(legDrop(legs.left, x), legDrop(legs.right, x));
  out[2] = 0;
}

const legPose = createArmPose();
const hip = new Vector3();
const ankle = new Vector3();
const move = new Vector3();
const pole = new Vector3();
const local = new Quaternion();

/**
 * Writes the local rotations of the thigh, the shin, and the foot of each leg, so that each ankle
 * stays in its bind place and each foot stays flat while the root moves (design 5.3). The hips
 * keep the rotation of the bind pose.
 *
 * @param legs The legs.
 * @param root The offset of the root bone.
 * @param rotations The rotations of the pose to write.
 */
export function plantFeet(legs: PlantedLegs, root: Vec3, rotations: Float32Array): void {
  for (const leg of [legs.left, legs.right]) {
    hip.fromArray(leg.bind.shoulder).add(move.fromArray(root));
    ankle.fromArray(leg.bind.wrist);
    solveArm(leg.bind, hip, NO_TURN, ankle, pole.fromArray(leg.pole), legPose);
    setBoneRotation(rotations, leg.thigh, legPose.upper);
    setBoneRotation(
      rotations,
      leg.shin,
      local.copy(legPose.upper).invert().multiply(legPose.lower),
    );
    setBoneRotation(rotations, leg.foot, local.copy(legPose.lower).invert());
  }
}
