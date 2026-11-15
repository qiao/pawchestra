/** The radians of one degree. */
export const DEG = Math.PI / 180;

/**
 * Limits a number to [0, 1].
 *
 * @param x The number.
 * @returns The number in [0, 1].
 */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Eases a linear weight, so that a move starts and stops with no jump of speed. A weight outside
 * [0, 1] is limited first.
 *
 * @param x The linear weight.
 * @returns The eased weight, in [0, 1].
 */
export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
