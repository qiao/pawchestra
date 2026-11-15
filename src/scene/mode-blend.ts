import type { Vec3 } from '../models/tuples.ts';
import { smoothstep } from '../math.ts';
import type { Focus } from './focus.ts';

/**
 * The blend between Free mode and Cinematic mode (design 2.5). A change of the mode moves the
 * camera, the field of view, the letterbox bars, the light of the shot, and the focus over this
 * time, as a crane move of a film. With reduced motion, the change is a hard cut.
 */
export const MODE_BLEND = {
  /** The time of the blend, in milliseconds. */
  durationMs: 1500,
  /**
   * The power of the curves of the camera: the late part of the move goes with `w ** power`, and
   * the early part with `1 - (1 - w) ** power`. A camera that comes nearer first turns and then
   * dollies in along the line of sight of the new camera. A camera that goes away first dollies
   * out and then turns. With 1, all parts move together, and in the probe of the demos 3% of the
   * middle samples of a blend from Free mode into a shot came nearer than `ANIMAL_FLOOR` to an
   * animal in the frame.
   */
  power: 3,
  /**
   * The swell of the distance at the middle of a blend with a half turn, as a part of the
   * distance: the camera swings out and around the stage, as a crane. A smaller turn swells less.
   * It is 0 at the start and at the end, so the distance floor of the shots holds there.
   */
  swell: 0.5,
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

/**
 * The blend of the camera of a change of the mode (design 2.5). Each frame moves its base camera
 * toward the live camera of the new mode, so that a cut of the shots in the blend does not jump
 * ({@link blendShare}). The camera on the screen is the base camera with the swell.
 */
export interface OrbitBlend {
  /** The camera of the blend with no swell. */
  readonly base: OrbitView;
  /** The weight of the blend in the last frame, from 0 to 1. */
  readonly weight: number;
  /** True when the new camera stood nearer to its point than the camera of the change. */
  readonly inward: boolean;
  /** The swell of the distance at the middle of the blend, as a part of the distance. */
  readonly swell: number;
}

/** One frame of a blend of the camera: the blend of the frame, and the camera on the screen. */
interface OrbitStep {
  readonly blend: OrbitBlend;
  readonly view: OrbitView;
}

/**
 * Starts the blend of the camera of a change of the mode (design 2.5).
 *
 * @param from The camera on the screen at the change.
 * @param to The live camera of the new mode in the frame of the change.
 * @returns The blend, at the weight 0.
 */
export function startOrbitBlend(from: OrbitView, to: OrbitView): OrbitBlend {
  const a = sphereOf(from);
  const b = sphereOf(to);
  return {
    base: from,
    weight: 0,
    inward: b.distance < a.distance,
    swell: (MODE_BLEND.swell * Math.abs(shortTurn(a.azimuth, b.azimuth))) / Math.PI,
  };
}

/**
 * Moves the blend of the camera to the weight of a frame (design 2.5), as a crane move around the
 * points that the cameras look at. The point moves on a straight line. The camera stands on a
 * sphere around that point: the azimuth turns the short way around the vertical axis, the
 * elevation changes linearly, and the distance changes by a constant factor for each step. Thus
 * a camera on the other side of the stage goes around the players, and not through them. The
 * point, the azimuth, and the elevation go together, and the distance and the field of view go
 * together, on the two curves of {@link MODE_BLEND}.power. The distance swells in the middle
 * ({@link MODE_BLEND}.swell).
 *
 * @param blend The blend of the last frame.
 * @param live The live camera of the new mode.
 * @param w The weight of the blend in this frame, from 0 to 1.
 * @returns The blend of this frame, and the camera on the screen: `live` at the weight 1.
 */
export function stepOrbitBlend(blend: OrbitBlend, live: OrbitView, w: number): OrbitStep {
  const before = blend.weight;
  const next = { ...blend, weight: w };
  if (w >= 1) {
    return { blend: { ...next, base: live }, view: live };
  }

  const power = MODE_BLEND.power;
  const early = (x: number): number => 1 - (1 - x) ** power;
  const late = (x: number): number => x ** power;
  const turnCurve = blend.inward ? early : late;
  const dollyCurve = blend.inward ? late : early;
  const turn = blendShare(turnCurve(before), turnCurve(w));
  const dolly = blendShare(dollyCurve(before), dollyCurve(w));

  const a = sphereOf(blend.base);
  const b = sphereOf(live);
  const target: Vec3 = [
    mix(blend.base.target[0], live.target[0], turn),
    mix(blend.base.target[1], live.target[1], turn),
    mix(blend.base.target[2], live.target[2], turn),
  ];
  const place: SpherePlace = {
    azimuth: a.azimuth + shortTurn(a.azimuth, b.azimuth) * turn,
    elevation: mix(a.elevation, b.elevation, turn),
    distance: a.distance * (b.distance / a.distance) ** dolly,
  };
  const fov = mix(blend.base.fov, live.fov, dolly);
  const base = orbitView(target, place, fov);
  const swell = 1 + blend.swell * Math.sin(Math.PI * w);
  const view = orbitView(target, { ...place, distance: place.distance * swell }, fov);
  return { blend: { ...next, base }, view };
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

/**
 * Gives the short turn from one azimuth to another.
 *
 * @param from The first azimuth, in radians.
 * @param to The second azimuth, in radians.
 * @returns The turn, from -π to π.
 */
function shortTurn(from: number, to: number): number {
  const turn = to - from;
  return turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI));
}

/**
 * Gives the camera at a place on the sphere around a point.
 *
 * @param target The point.
 * @param place The place.
 * @param fov The vertical field of view, in degrees.
 * @returns The camera.
 */
function orbitView(target: Vec3, place: SpherePlace, fov: number): OrbitView {
  const flat = place.distance * Math.cos(place.elevation);
  return {
    position: [
      target[0] + flat * Math.sin(place.azimuth),
      target[1] + place.distance * Math.sin(place.elevation),
      target[2] + flat * Math.cos(place.azimuth),
    ],
    target,
    fov,
  };
}
