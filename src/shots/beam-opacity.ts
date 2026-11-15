import type { Vec3 } from '../models/tuples.ts';
import { smoothstep } from '../math.ts';
import type { ShotKind } from './types.ts';
import { defaultDistance } from './view.ts';

/**
 * The factor of the opacity of the visible beam in a close view (design 4.5, 5.6). A close camera
 * outside the cone sees the additive beam over the full image, and at the factor 1 it washed out
 * the image. The factor keeps a hint of the light.
 */
export const CLOSE_BEAM_OPACITY = 0.15;

/** The factor of the opacity of the visible beam for each kind of shot (design 5.6). */
export const SHOT_BEAM_OPACITY = {
  wide: 1,
  high: 1,
  conductor: CLOSE_BEAM_OPACITY,
  side: CLOSE_BEAM_OPACITY,
  section: CLOSE_BEAM_OPACITY,
  solo: CLOSE_BEAM_OPACITY,
  insert: CLOSE_BEAM_OPACITY,
} as const satisfies Record<ShotKind, number>;

/**
 * The range of the fade of the beam in Free mode (design 2.5, 4.5): the distance from the camera
 * to the stage center, as a factor of the default distance. At the first value and nearer, the
 * beam has {@link CLOSE_BEAM_OPACITY}. At the second value and farther, it has the full opacity.
 *
 * The default view stands at about 0.55, so a zoom keeps the full beam for about 4 wheel steps.
 * The fade takes about 16 wheel steps, so each step changes the opacity by 0.08 or less. With the
 * range 0.45 to 0.5, 2 wheel steps removed most of the beam. The wide shots stand at 0.51 or more
 * and the high shots at 0.74 (design 4.5), so they keep the full beam. The planner keeps each
 * close camera nearer than the second value (design 5.6), so a change from a close shot to Free
 * mode never gives the full beam. The blend of the mode change (design 2.5) moves the opacity
 * from the value of the shot to the value of Free mode with no jump.
 */
export const FREE_BEAM_FADE = [0.2, 0.45] as const;

/**
 * Calculates the factor of the opacity of the visible beam for a camera in Free mode (design
 * 2.5, 4.5). The factor follows the logarithm of the distance to the stage center with a
 * smoothstep. A wheel step multiplies the distance by a constant factor, so each step changes the
 * factor by about the same amount, and an orbit or a zoom changes it with no jump.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param aspect The width of the viewport divided by its height.
 * @param position The camera position, in the stage axes.
 * @returns The factor, from {@link CLOSE_BEAM_OPACITY} to 1.
 */
export function freeBeamOpacity(stageSide: number, aspect: number, position: Vec3): number {
  const ratio = Math.hypot(...position) / defaultDistance(stageSide, aspect);
  const [near, far] = FREE_BEAM_FADE;
  const w = smoothstep(Math.log(ratio / near) / Math.log(far / near));
  return CLOSE_BEAM_OPACITY + (1 - CLOSE_BEAM_OPACITY) * w;
}
