import { MathUtils } from 'three';

import type { Vec3 } from './tuples.ts';

/**
 * The place of the key light (design 4.5), seen from the stage center on the stage top. The key
 * light is the spotlight of the stage, and the only light that casts shadows. It stands far in
 * front of the stage, high over the audience, and to the left, as the front light of a concert
 * hall. It lights the faces, and the shadows of the players fall to the back right of the stage,
 * parallel. A far light keeps the shadows parallel: a key light 1.4 S from the stage center casts
 * shadows that fan out from the middle.
 */
export const KEY_PLACE = {
  /** The distance from the stage center, in stage sides. */
  distance: 2.45,
  /**
   * The turn from the front of the stage axis toward the right side, in radians: a negative turn
   * goes to the left. The light stands to one side of the default camera, so each body keeps a
   * lit side and a shade side, and the shadows fall beside the players. With 20°, the fronts are
   * flat and the players hide most of their shadows. The default camera looks at the stage from
   * the front right, so the light stands at the left, far from that camera.
   */
  azimuth: -35 * MathUtils.DEG2RAD,
  /**
   * The angle above the stage top, in radians. A front light lights the fronts of the players by
   * the cosine of this angle and the floor by its sine, so a higher light keeps the white fur
   * below the shoulder of the tone curve. A shadow is 0.58 times as long as its player.
   */
  elevation: 60 * MathUtils.DEG2RAD,
} as const;

/**
 * Gives the position of the key light of a stage ({@link KEY_PLACE}). The stage axes have +x to
 * the right, +y up, and +z to the audience, so the front of the stage is at +z.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The position, in meters.
 */
export function keyLightPlace(stageSide: number): Vec3 {
  const { distance, azimuth, elevation } = KEY_PLACE;
  const flat = distance * stageSide * Math.cos(elevation);
  return [
    flat * Math.sin(azimuth),
    distance * stageSide * Math.sin(elevation),
    flat * Math.cos(azimuth),
  ];
}

/**
 * The place of the rim lights (design 4.5), seen from the stage center on the stage top: far
 * behind the orchestra, and high, as the back lights on a truss of a concert film. Each rim light
 * has a visible beam, which leans from its foot on the stage toward the light. A rim light stands
 * at the x of its beam, so the beam stands upright in the frontal default view, as the fan of
 * `orchestra-latest.png`.
 */
export const RIM_PLACE = {
  /** The distance from the stage center, in stage sides. */
  distance: 2.45,
  /** The angle above the stage top, in radians. */
  elevation: 66 * MathUtils.DEG2RAD,
  /** The number of rim lights, each with its beam. 0 gives no rim light and no beam. */
  count: 1,
  /** The distance between two neighbor rim lights, in stage sides. */
  spread: 0.3,
} as const;

/**
 * Gives the x of each rim light of a stage ({@link RIM_PLACE}): the lights stand in a row across
 * the stage, centered on the stage axis.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The x of each light, in meters, from the left.
 */
export function rimLightXs(stageSide: number): number[] {
  const { count, spread } = RIM_PLACE;
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spread * stageSide);
}

/**
 * Gives the position of a rim light of a stage ({@link RIM_PLACE}). The stage axes have +x to
 * the right, +y up, and +z to the audience, so the back of the stage is at -z.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param x The x of the light, in meters: 0 on the stage axis.
 * @returns The position, in meters.
 */
export function rimLightPlace(stageSide: number, x = 0): Vec3 {
  const { distance, elevation } = RIM_PLACE;
  return [
    x,
    distance * stageSide * Math.sin(elevation),
    -distance * stageSide * Math.cos(elevation),
  ];
}

/**
 * The height of the cone that the shot planner keeps clear of cameras, in stage sides (design
 * 5.6). The cone stands upright on the stage center and holds the haze of the visible beam near
 * the stage, also when the beam leans to the key light.
 */
export const BEAM_HEIGHT_IN_SIDES = 1.2;

/** The radius of the cone of the shot planner on the stage, in stage sides (design 4.5). */
export const BEAM_RADIUS_IN_SIDES = 0.75;

/** The radius of the visible beam at the light, in stage sides. */
export const BEAM_TOP_RADIUS_IN_SIDES = 0.02;

/**
 * Tells if a point is inside the cone of the visible beam that the shot planner keeps clear
 * (design 4.5, 5.6): an upright cone from the light circle on the stage top around the stage
 * center up to {@link BEAM_HEIGHT_IN_SIDES}. The beam draws only its outer faces, so a camera
 * inside the haze sees the beam in another way than a camera outside.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param point The point, in the stage axes.
 * @param margin A distance in meters that makes the cone narrower and lower, or wider and higher
 *   for a negative value. 0 by default.
 * @returns True inside the cone.
 */
export function insideBeam(stageSide: number, point: Vec3, margin = 0): boolean {
  const height = BEAM_HEIGHT_IN_SIDES * stageSide;
  const [x, y, z] = point;
  if (y < 0 || y >= height - margin) {
    return false;
  }
  const bottom = BEAM_RADIUS_IN_SIDES * stageSide;
  const top = BEAM_TOP_RADIUS_IN_SIDES * stageSide;
  return Math.hypot(x, z) < bottom + (top - bottom) * (y / height) - margin;
}
