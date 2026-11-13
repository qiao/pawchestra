import type { ShotKind } from './types.ts';

/**
 * The drift of the cinematic camera (design 5.6): a slow, small turn of the view, as a camera on a
 * fluid head or a steadicam that an operator holds. The camera position does not move, so the
 * distance to each animal stays. The drift is a sum of sines of the song time with fixed phases,
 * so the same time gives the same camera, a pause holds it, and a blend has no jump.
 */
export const CAMERA_DRIFT = {
  /** The largest turn of the view in a close shot, in radians: about 0.2°. */
  angle: 0.0035,
  /**
   * The part of {@link CAMERA_DRIFT}.angle in each kind of shot. A wide or a high shot stands on
   * a crane and drifts less, and the close shots are hand held.
   */
  shares: {
    wide: 0.45,
    high: 0.45,
    conductor: 1,
    side: 1,
    section: 1,
    solo: 1,
    // An insert has a narrow field of view, so the same turn moves its image more.
    insert: 0.7,
  },
  /**
   * The periods of the two sines of the side turn and of the two sines of the up turn, in
   * seconds. They have no common factor, so the path does not repeat in a piece.
   */
  periods: [11.3, 7.1, 13.7, 5.9],
  /** The weights of the two sines of each turn. Their sum is 1. */
  weights: [0.65, 0.35],
} as const satisfies {
  readonly angle: number;
  readonly shares: Readonly<Record<ShotKind, number>>;
  readonly periods: readonly [number, number, number, number];
  readonly weights: readonly [number, number];
};

/** The fixed phases of the four sines, in radians. */
const PHASES = [0.4, 2.1, 1.3, 4.0] as const;

/**
 * Calculates the turn of the drift at a song time (design 5.6).
 *
 * @param songTime The song time, in seconds.
 * @param share The part of the full drift: the share of the kind of the shot, or a blend of two.
 * @param out The side turn and the up turn to write, in radians.
 */
export function writeDrift(songTime: number, share: number, out: [number, number]): void {
  const { angle, periods, weights } = CAMERA_DRIFT;
  const wave = (i: 0 | 1 | 2 | 3): number =>
    Math.sin((2 * Math.PI * songTime) / periods[i] + PHASES[i]);
  const size = angle * share;
  out[0] = size * (weights[0] * wave(0) + weights[1] * wave(1));
  out[1] = size * (weights[0] * wave(2) + weights[1] * wave(3));
}

/**
 * Turns the point that a camera looks at by a drift, around the camera position (design 5.6).
 * The point keeps its distance from the camera to first order.
 *
 * @param position The camera position.
 * @param target The point that the camera looks at, which this function moves.
 * @param turn The side turn and the up turn, in radians, from {@link writeDrift}.
 */
export function turnTarget(
  position: readonly [number, number, number],
  target: [number, number, number],
  turn: readonly [number, number],
): void {
  const dx = target[0] - position[0];
  const dy = target[1] - position[1];
  const dz = target[2] - position[2];
  const length = Math.hypot(dx, dy, dz);
  const flat = Math.hypot(dx, dz);
  if (length <= 0 || flat <= 0) {
    return;
  }

  // The side axis lies in the stage plane, and the up axis is normal to the view and to it.
  const sideX = -dz / flat;
  const sideZ = dx / flat;
  const upX = (-dx * dy) / (flat * length);
  const upY = flat / length;
  const upZ = (-dz * dy) / (flat * length);
  const side = turn[0] * length;
  const up = turn[1] * length;
  target[0] += sideX * side + upX * up;
  target[1] += upY * up;
  target[2] += sideZ * side + upZ * up;
}
