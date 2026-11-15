/**
 * Reads the matrix and the turn of one bone from the packed bone matrices of a posed body
 * (16 numbers for each bone), for the tools that measure the arms (`arm-check`, `arm-shape`, and
 * `carry-check`).
 */
import { Matrix4, Quaternion } from 'three';

/**
 * Gives the matrix of a bone.
 *
 * @param matrices The bone matrices, 16 numbers each.
 * @param bone The index of the bone.
 * @returns The matrix.
 */
export function matrixOf(matrices: ArrayLike<number>, bone: number): Matrix4 {
  return new Matrix4().fromArray(
    Array.from({ length: 16 }, (...[, k]) => matrices[bone * 16 + k] ?? 0),
  );
}

/**
 * Gives the turn of a bone.
 *
 * @param matrices The bone matrices, 16 numbers each.
 * @param bone The index of the bone.
 * @returns The turn.
 */
export function turnOf(matrices: ArrayLike<number>, bone: number): Quaternion {
  return new Quaternion().setFromRotationMatrix(matrixOf(matrices, bone));
}

/**
 * Wraps an angle into -180° to 180°.
 *
 * @param degrees The angle.
 * @returns The wrapped angle.
 */
export function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
