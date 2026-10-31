import { MathUtils } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { ShotKey } from './types.ts';
import { defaultDistance } from './view.ts';

/** The fit distance keeps 5% of space around the subject sphere (design 5.6). */
const FIT_MARGIN = 1.05;

/**
 * Calculates the distance at which a sphere fills the view (design 5.6): `radius / sin(min(v, h))
 * × 1.05`, where `v` is half the vertical field of view and `h` is half the horizontal one.
 *
 * @param radius The radius of the sphere, in meters.
 * @param aspect The width of the view divided by its height.
 * @param fov The vertical field of view, in degrees.
 * @returns The distance from the camera to the center of the sphere.
 */
export function fitDistance(radius: number, aspect: number, fov: number): number {
  const v = (fov / 2) * MathUtils.DEG2RAD;
  const h = Math.atan(Math.tan(v) * aspect);
  return (radius / Math.sin(Math.min(v, h))) * FIT_MARGIN;
}

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
