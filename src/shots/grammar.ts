import type { Vec3 } from '../models/tuples.ts';
import { angleDifference } from './camera-keys.ts';
import type { ShotKey } from './types.ts';

/** Degrees to radians. */
const DEG = Math.PI / 180;

/**
 * The rules of film grammar of the shot planner (design 5.6, `docs/reference/camera-technique.md`).
 * `pnpm shot-trace --rules` checks the plans against a copy of these values.
 */
export const FILM_GRAMMAR = {
  /**
   * The largest angle of the view direction of a camera from the audience axis. Within it, the
   * right vector of the camera points to +x, so the stage keeps the sides of the master shot on the
   * screen (the 180° rule). The margin from 90° keeps the left and the right of the stage apart on
   * the screen.
   */
  lineAzimuth: 75 * DEG,
  /**
   * A subject that looks less than this angle from the camera axis, or from the axis away from the
   * camera, has no screen direction (a head-on or a tail-away shot). At 20°, the snout of a
   * player turns less than 0.35 of its length to the side, so the look reads as frontal.
   */
  neutral: 20 * DEG,
  /**
   * Two shots in a row turn the camera by at least this angle around their targets (the 30°
   * rule), or they change the size of the frame by {@link FILM_GRAMMAR.jumpSize}.
   */
  jumpAngle: 30 * DEG,
  /**
   * The smallest ratio of the frame sizes of two shots in a row with a smaller turn: about one step
   * of the shot sizes, such as from a medium shot to a close-up.
   */
  jumpSize: 1.5,
  /**
   * A move counts on an axis when it moves the camera at least this part of its distance to the
   * target. A shot with no move that counts is still.
   */
  moveShare: 0.02,
} as const;

/**
 * The move of a shot on the axes of its camera (design 5.6): to the right, up, and forward. Each
 * part is -1, 0 for no move that counts, or 1.
 */
export type Motion = readonly [number, number, number];

/**
 * Gives the sign of a part of a move that counts.
 *
 * @param share The part of the move, as a part of the distance to the target.
 * @returns -1, 0, or 1.
 */
function moveSign(share: number): number {
  return Math.abs(share) < FILM_GRAMMAR.moveShare ? 0 : Math.sign(share);
}

/**
 * Gives the move of a shot from its keys (design 5.6). An arc around the target moves the camera
 * to the right when the azimuth grows, a rise moves it up, and a push-in moves it forward.
 *
 * @param from The key at the start.
 * @param to The key at the end.
 * @returns The move.
 */
export function motionOf(from: ShotKey, to: ShotKey): Motion {
  const elevation = (from.elevation + to.elevation) / 2;
  return [
    moveSign((to.azimuth - from.azimuth) * Math.cos(elevation)),
    moveSign(to.elevation - from.elevation),
    moveSign((from.zoom - to.zoom) / from.zoom),
  ];
}

/**
 * Gives the screen direction of a look: the side of the frame to which a subject that faces an
 * azimuth looks, for a camera at an azimuth seen from the subject (design 5.6).
 *
 * @param facing The azimuth of the front of the subject, in radians.
 * @param azimuth The azimuth of the camera seen from the subject, in radians.
 * @returns 1 for the right, -1 for the left, 0 for a neutral look.
 */
export function lookSide(facing: number, azimuth: number): -1 | 0 | 1 {
  const x = Math.sin(facing - azimuth);
  if (Math.abs(x) < Math.sin(FILM_GRAMMAR.neutral)) {
    return 0;
  }
  return x > 0 ? 1 : -1;
}

/**
 * Gives the azimuth of a camera seen from a point.
 *
 * @param camera The camera.
 * @param point The point.
 * @returns The azimuth, in radians from +z to +x.
 */
export function azimuthFrom(camera: Vec3, point: Vec3): number {
  return Math.atan2(camera[0] - point[0], camera[2] - point[2]);
}

/**
 * Tells if a camera keeps the line of the stage (design 5.6): its view direction turns at most
 * {@link FILM_GRAMMAR.lineAzimuth} from the audience axis.
 *
 * @param camera The camera.
 * @param look The point that the camera looks at.
 * @returns True if the camera keeps the line.
 */
export function keepsLine(camera: Vec3, look: Vec3): boolean {
  const turn = Math.atan2(camera[0] - look[0], camera[2] - look[2]);
  return Math.abs(angleDifference(turn, 0)) <= FILM_GRAMMAR.lineAzimuth;
}
