import { Quaternion, Vector3 } from 'three';

import type { Vec3 } from '../models/tuples.ts';

/**
 * Mixes two rotations along the shorter path, with a normalized linear mix. For the small
 * changes of a pose, it is near a spherical mix (`Quaternion.slerp()`) and costs less.
 *
 * @param a The rotation at the weight 0.
 * @param b The rotation at the weight 1.
 * @param t The weight.
 * @param out The quaternion to write. It can be `a` or `b`.
 * @returns `out`, a unit quaternion.
 */
export function mixRotation(a: Quaternion, b: Quaternion, t: number, out: Quaternion): Quaternion {
  const sign = a.dot(b) < 0 ? -1 : 1;
  return out
    .set(
      a.x + (sign * b.x - a.x) * t,
      a.y + (sign * b.y - a.y) * t,
      a.z + (sign * b.z - a.z) * t,
      a.w + (sign * b.w - a.w) * t,
    )
    .normalize();
}

const fromUnit = new Vector3();
const toUnit = new Vector3();
const fullTurn = new Quaternion();
const partTurn = new Quaternion();

/**
 * Mixes two directions with a turn of even speed: the result turns from `a` toward `b` by the
 * share `t` of the angle between them. A normalized linear mix turns fastest in the middle, and
 * an elbow that follows it swings fast there.
 *
 * @param a The direction at the weight 0.
 * @param b The direction at the weight 1.
 * @param t The weight.
 * @param out The vector to write. It can be `a` or `b`.
 * @returns `out`, a unit vector.
 */
export function mixDirection(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  fromUnit.copy(a).normalize();
  toUnit.copy(b).normalize();
  fullTurn.setFromUnitVectors(fromUnit, toUnit);
  partTurn.identity().slerp(fullTurn, t);
  return out.copy(fromUnit).applyQuaternion(partTurn);
}

const poleRest = new Vector3();
const polePlay = new Vector3();
const poleTuple: [number, number, number] = [0, 0, 0];

/**
 * Mixes the direction of an elbow in the rest pose with its direction while the player plays, with
 * {@link mixDirection}.
 *
 * @param rest The direction in the rest pose.
 * @param play The direction while the player plays.
 * @param weight The weight of the playing pose.
 * @returns The mixed unit direction, in a module tuple that the next call writes again.
 */
export function mixPole(rest: Vec3, play: Vec3, weight: number): Vec3 {
  mixDirection(poleRest.fromArray(rest), polePlay.fromArray(play), weight, poleRest);
  return poleRest.toArray(poleTuple);
}

/**
 * Finds the last time of a sorted list at or before a time.
 *
 * @param times The times, sorted.
 * @param time The time.
 * @returns The index, or -1 before the first time.
 */
export function lastAtOrBefore(times: Float64Array, time: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((times[mid] ?? 0) <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low - 1;
}
