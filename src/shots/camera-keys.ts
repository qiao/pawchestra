import { MathUtils } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { ShotKey } from './types.ts';
import { defaultDistance } from './view.ts';

/**
 * Calculates the distance of a camera key from its target (design 5.6). A close shot stands at
 * the distance at which its field of view shows half its frame height at the target. Thus the
 * frame does not depend on the aspect of the view.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param halfHeight Half the height of the frame of a close shot at its target, or 0 for a wide
 *   or a high shot. These use the distance of the default view.
 * @param key The key.
 * @param aspect The width of the view divided by its height.
 * @returns The distance in meters.
 */
export function keyDistance(
  stageSide: number,
  halfHeight: number,
  key: ShotKey,
  aspect: number,
): number {
  const base =
    halfHeight > 0
      ? halfHeight / Math.tan((key.fov / 2) * MathUtils.DEG2RAD)
      : defaultDistance(stageSide, aspect);
  return base * key.zoom;
}

/**
 * Writes the camera position of a key: `target + d × (sin az × cos el, sin el, cos az × cos el)`
 * (design 5.6).
 *
 * @param target The target of the shot.
 * @param azimuth The azimuth, in radians from +z to +x.
 * @param elevation The elevation, in radians above the stage plane.
 * @param distance The distance from the target, in meters.
 * @param out The position to write.
 */
export function writeKeyPosition(
  target: Vec3,
  azimuth: number,
  elevation: number,
  distance: number,
  out: [number, number, number],
): void {
  const flat = Math.cos(elevation) * distance;
  out[0] = target[0] + Math.sin(azimuth) * flat;
  out[1] = target[1] + Math.sin(elevation) * distance;
  out[2] = target[2] + Math.cos(azimuth) * flat;
}

/**
 * Calculates the angle between the view directions of two keys. The jump cut rule of design 5.6
 * compares it with 30°.
 *
 * @param a A key.
 * @param b Another key.
 * @returns The angle in radians, from 0 to π.
 */
export function viewAngle(a: ShotKey, b: ShotKey): number {
  const dot =
    Math.cos(a.elevation) * Math.cos(b.elevation) * Math.cos(a.azimuth - b.azimuth) +
    Math.sin(a.elevation) * Math.sin(b.elevation);
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

/** The axes of a camera with no roll, which {@link cameraAxes} writes before each read. */
export interface CameraAxes {
  /** The x of the forward axis. */
  fx: number;
  /** The y of the forward axis. */
  fy: number;
  /** The z of the forward axis. */
  fz: number;
  /** The x of the right axis, which lies in the stage plane. */
  rx: number;
  /** The z of the right axis. */
  rz: number;
  /** The x of the up axis. */
  ux: number;
  /** The y of the up axis. */
  uy: number;
  /** The z of the up axis. */
  uz: number;
}

/** The axes that {@link cameraAxes} writes. Each call writes all fields before a read. */
const axes: CameraAxes = { fx: 0, fy: 0, fz: 1, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0 };

/**
 * Writes the axes of a camera that looks at a point with no roll, as `lookAt()` of three.js.
 *
 * @param camera The camera.
 * @param look The point that the camera looks at.
 * @returns The axes. The function writes them into one shared object, so a caller reads them
 *   before the next call.
 */
export function cameraAxes(camera: Vec3, look: Vec3): CameraAxes {
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

/**
 * Gives the azimuth of a direction in the stage plane.
 *
 * @param x The x of the direction.
 * @param z The z of the direction.
 * @returns The azimuth in radians, from +z to +x.
 */
export function azimuthOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

/**
 * Gives the difference of two angles, in the range from -π to π.
 *
 * @param a An angle in radians.
 * @param b Another angle in radians.
 * @returns `a - b`, wrapped.
 */
export function angleDifference(a: number, b: number): number {
  const d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) {
    return d - 2 * Math.PI;
  }
  return d < -Math.PI ? d + 2 * Math.PI : d;
}
