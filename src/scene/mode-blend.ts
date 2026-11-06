import type { Vec3 } from '../models/tuples.ts';
import { smoothstep } from '../pose/rest.ts';
import type { Focus } from './focus.ts';

/**
 * The blend between Free mode and Cinematic mode (design 2.5). A change of the mode moves the
 * camera, the field of view, the letterbox bars, the light of the shot, and the focus over this
 * time, as a crane move of a film. With reduced motion, the change is a hard cut.
 */
export const MODE_BLEND = {
  /** The time of the blend, in milliseconds. */
  durationMs: 1500,
} as const;

/** A camera: its position, the point that it looks at, and its vertical field of view. */
export interface OrbitView {
  readonly position: Vec3;
  readonly target: Vec3;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
}

/**
 * Gives the weight of a blend of the mode at a time after its start (design 2.5): a smoothstep
 * over {@link MODE_BLEND}, so that the move starts and stops at rest.
 *
 * @param elapsedMs The time since the start of the blend, in milliseconds.
 * @returns The weight, from 0 (the start) to 1 (the end and later).
 */
export function modeBlendWeight(elapsedMs: number): number {
  const durationMs = MODE_BLEND.durationMs;
  if (durationMs <= 0) {
    return 1;
  }
  return smoothstep(elapsedMs / durationMs);
}

/**
 * Gives the share of the rest of the way that one frame of a blend moves (design 2.5). Each frame
 * moves the values on the screen by this share toward the live values of the new mode. With a
 * fixed end, the values thus follow the weight of {@link modeBlendWeight} exactly. A live end
 * that jumps, such as a cut of the shots or a seek, moves the values on the screen only by the
 * share, so the frame does not jump. The last frame of the blend has the share 1.
 *
 * @param before The weight of the blend in the last frame, from 0 to 1.
 * @param after The weight of the blend in this frame, from 0 to 1.
 * @returns The share, from 0 to 1.
 */
export function blendShare(before: number, after: number): number {
  if (before >= 1 || after >= 1) {
    return 1;
  }
  return Math.max(0, (after - before) / (1 - before));
}

/**
 * Mixes two numbers.
 *
 * @param from The value at the weight 0.
 * @param to The value at the weight 1.
 * @param w The weight.
 * @returns The value between them: exactly `from` at 0 and `to` at 1.
 */
export function mix(from: number, to: number, w: number): number {
  if (w <= 0) {
    return from;
  }
  if (w >= 1) {
    return to;
  }
  return from + (to - from) * w;
}

/**
 * Blends two cameras around the points that they look at (design 2.5), as a crane move. The
 * point moves on a straight line. The camera stands on a sphere around that point: the distance
 * changes by a constant factor for each step, the azimuth turns the short way around the
 * vertical axis, and the elevation changes linearly. Thus a camera on the other side of the stage
 * goes around the players, and not through them. The field of view changes linearly.
 *
 * @param from The camera at the weight 0.
 * @param to The camera at the weight 1.
 * @param w The weight, from 0 to 1.
 * @returns The camera between them: `from` at 0 and `to` at 1.
 */
export function blendOrbitView(from: OrbitView, to: OrbitView, w: number): OrbitView {
  if (w <= 0) {
    return from;
  }
  if (w >= 1) {
    return to;
  }

  const a = sphereOf(from);
  const b = sphereOf(to);
  let turn = b.azimuth - a.azimuth;
  turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
  const azimuth = a.azimuth + turn * w;
  const elevation = mix(a.elevation, b.elevation, w);
  const distance = a.distance * (b.distance / a.distance) ** w;

  const target: Vec3 = [
    mix(from.target[0], to.target[0], w),
    mix(from.target[1], to.target[1], w),
    mix(from.target[2], to.target[2], w),
  ];
  const flat = distance * Math.cos(elevation);
  const position: Vec3 = [
    target[0] + flat * Math.sin(azimuth),
    target[1] + distance * Math.sin(elevation),
    target[2] + flat * Math.cos(azimuth),
  ];
  return { position, target, fov: mix(from.fov, to.fov, w) };
}

/**
 * Blends two focuses of the lens (design 2.5, 4.5): the focus distance and the blur scale change
 * linearly. The blur passes run while one of the two focuses needs them.
 *
 * @param from The focus at the weight 0.
 * @param to The focus at the weight 1.
 * @param w The weight, from 0 to 1.
 * @returns The focus between them: `to` at 1.
 */
export function blendFocus(from: Focus, to: Focus, w: number): Focus {
  if (w >= 1) {
    return to;
  }
  return {
    distance: mix(from.distance, to.distance, w),
    scale: mix(from.scale, to.scale, w),
    active: from.active || to.active,
  };
}

/** The place of a camera on the sphere around the point that it looks at. */
interface SpherePlace {
  /** Radians around y, from +z (the audience) to +x. */
  readonly azimuth: number;
  /** Radians above the horizontal plane. */
  readonly elevation: number;
  /** The distance from the point, in meters. */
  readonly distance: number;
}

/**
 * Gives the place of a camera on the sphere around the point that it looks at.
 *
 * @param view The camera.
 * @returns The place. A camera on the point gets a small distance, so a blend has no division by 0.
 */
function sphereOf(view: OrbitView): SpherePlace {
  const x = view.position[0] - view.target[0];
  const y = view.position[1] - view.target[1];
  const z = view.position[2] - view.target[2];
  const distance = Math.max(1e-3, Math.hypot(x, y, z));
  return {
    azimuth: Math.atan2(x, z),
    elevation: Math.asin(Math.max(-1, Math.min(1, y / distance))),
    distance,
  };
}
