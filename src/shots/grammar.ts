import type { Vec3 } from '../models/tuples.ts';
import { angleDifference } from './camera-keys.ts';
import type { Composition, ShotKey } from './types.ts';

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
  /** The third lines of the frame, as a part of half its width or half its height. */
  thirdLine: 1 / 3,
  /**
   * The largest tilt that puts the eyes on the upper third line, as a part of half the frame
   * height. Within it, the target of the shot stays in the frame.
   */
  maxTilt: 1,
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

/** The tolerance of the neutral look, in the sine of the angle. */
const NEUTRAL_TIE = 1e-9;

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
  // A look on the limit is neutral: the azimuth grid of the search reaches the limit exactly.
  if (Math.abs(x) < Math.sin(FILM_GRAMMAR.neutral) + NEUTRAL_TIE) {
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

/** The axes of a camera with no roll, which {@link writeAxes} writes before each read. */
interface CameraAxes {
  /** The forward axis. */
  fx: number;
  fy: number;
  fz: number;
  /** The right axis, in the stage plane. */
  rx: number;
  rz: number;
  /** The up axis. */
  ux: number;
  uy: number;
  uz: number;
}

const axes: CameraAxes = { fx: 0, fy: 0, fz: 1, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0 };

/**
 * Writes the axes of a camera that looks at a point with no roll, as `lookAt()` of three.js.
 *
 * @param camera The camera.
 * @param look The point that the camera looks at.
 * @returns The axes. The function writes them into one shared object.
 */
function writeAxes(camera: Vec3, look: Vec3): CameraAxes {
  let fx = look[0] - camera[0];
  let fy = look[1] - camera[1];
  let fz = look[2] - camera[2];
  const length = Math.hypot(fx, fy, fz) || 1;
  fx /= length;
  fy /= length;
  fz /= length;
  // right = forward × (0, 1, 0), and up = right × forward
  const flat = Math.hypot(fx, fz) || 1;
  axes.fx = fx;
  axes.fy = fy;
  axes.fz = fz;
  axes.rx = -fz / flat;
  axes.rz = fx / flat;
  axes.ux = -axes.rz * fy;
  axes.uy = axes.rz * fx - axes.rx * fz;
  axes.uz = axes.rx * fy;
  return axes;
}

/** The steps of the correction of the point that a camera looks at for a composition. */
const LOOK_STEPS = 3;

/**
 * Writes the point that a camera looks at for the composition of a close shot (design 5.6): the
 * target stands on its third line, with the look room on the side of the look, and the eyes stand
 * on the upper third line. The camera keeps its position: it only turns, with no roll. Each step
 * measures the target and the eyes in the frame and moves the point by the errors, because a turn
 * of a steep camera with no roll also moves the points up or down.
 *
 * @param camera The camera.
 * @param target The target of the shot.
 * @param composition The composition, or `null` for the target in the middle.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @param out The point to write.
 * @returns The height of the target in the frame, as a part of half the frame height above the
 *   middle: 0 for no composition.
 */
export function writeLookPoint(
  camera: Vec3,
  target: Vec3,
  composition: Composition | null,
  fov: number,
  aspect: number,
  out: [number, number, number],
): number {
  out[0] = target[0];
  out[1] = target[1];
  out[2] = target[2];
  if (!composition) {
    return 0;
  }

  const rules = FILM_GRAMMAR;
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const wantedX = composition.third * rules.thirdLine;
  const [ex, ey, ez] = composition.eyes;
  const tx = target[0] - camera[0];
  const ty = target[1] - camera[1];
  const tz = target[2] - camera[2];
  const dx = ex - camera[0];
  const dy = ey - camera[1];
  const dz = ez - camera[2];
  let targetY = 0;
  for (let step = 0; step < LOOK_STEPS; step++) {
    const a = writeAxes(camera, out);
    const depth = Math.max(1e-6, tx * a.fx + ty * a.fy + tz * a.fz);
    const x = (tx * a.rx + tz * a.rz) / (depth * tanH);
    targetY = (tx * a.ux + ty * a.uy + tz * a.uz) / (depth * tanV);
    const eyesDepth = Math.max(1e-6, dx * a.fx + dy * a.fy + dz * a.fz);
    const eyesY = (dx * a.ux + dy * a.uy + dz * a.uz) / (eyesDepth * tanV);
    // The target keeps its distance below the eyes, and it stays within the largest tilt.
    const wantedY = Math.min(
      rules.maxTilt,
      Math.max(-rules.maxTilt, rules.thirdLine - eyesY + targetY),
    );
    const side = (x - wantedX) * depth * tanH;
    const up = (targetY - wantedY) * depth * tanV;
    out[0] += a.rx * side + a.ux * up;
    out[1] += a.uy * up;
    out[2] += a.rz * side + a.uz * up;
  }
  return targetY;
}

/**
 * Gives the third line of a subject that faces an azimuth, for a camera at an azimuth seen from
 * the subject (design 5.6): the side of the frame away from its look.
 *
 * @param facing The azimuth of the front of the subject, in radians.
 * @param azimuth The azimuth of the camera seen from the subject, in radians.
 * @returns -1 for the left third, 1 for the right third, or 0 for the middle.
 */
export function thirdOf(facing: number, azimuth: number): -1 | 0 | 1 {
  const side = lookSide(facing, azimuth);
  return side === 0 ? 0 : side > 0 ? -1 : 1;
}
