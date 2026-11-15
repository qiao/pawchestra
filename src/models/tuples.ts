import type { Quaternion, QuaternionTuple, Vector3, Vector3Tuple } from 'three';

/**
 * A point or a direction in meters, as (x, y, z): the plain form of a `Vector3` (design 5.1). The
 * pure modules keep and return their points in this form, so that a test can compare them and no
 * caller can change them (design 7.1).
 */
export type Vec3 = Readonly<Vector3Tuple>;

/** A rotation as a unit quaternion (x, y, z, w): the plain form of a `Quaternion`. */
export type Quat = Readonly<QuaternionTuple>;

/** The rotation that changes nothing. */
export const IDENTITY: Quat = [0, 0, 0, 1];

/** The point (0, 0, 0). */
export const ORIGIN: Vec3 = [0, 0, 0];

/**
 * Copies a vector into its plain form. `new Vector3(...p)` makes the opposite conversion.
 *
 * @param v The vector.
 * @returns A new tuple (x, y, z).
 */
export function toVec3(v: Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

/**
 * Copies a quaternion into its plain form. `new Quaternion(...q)` makes the opposite conversion.
 *
 * @param q The quaternion.
 * @returns A new tuple (x, y, z, w).
 */
export function toQuat(q: Quaternion): Quat {
  return [q.x, q.y, q.z, q.w];
}
