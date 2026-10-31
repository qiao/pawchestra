import type { Vec3 } from '../models/tuples.ts';
import { angleDifference } from './camera-keys.ts';

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
} as const;

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
