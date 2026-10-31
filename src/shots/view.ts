import { MathUtils } from 'three';
import type { Vec3 } from '../models/tuples.ts';

/** The vertical field of view of the camera, in degrees (design 4.5, camera). */
export const FIELD_OF_VIEW = 30;

/**
 * The aspect of the frame of Cinematic mode (design 2.5, 5.6): 21:9, as a film. The app shows this
 * frame with black bars, and the shot planner tests its cameras at this aspect.
 */
export const CINEMA_ASPECT = 21 / 9;

/** The near plane of the camera, in meters. */
export const NEAR = 0.1;

/**
 * The elevation of the default view (design 4.5, camera): 29° above {@link DEFAULT_TARGET}. The
 * view of 33° followed `orchestra-latest.png`: that image shows the full stage from the back heads
 * at 0.145 of its height down to the front edge, and the depth of the orchestra in the image is
 * 0.68 of its width. This view is 4° lower than 33°, a slightly lower camera. The lower camera of
 * `mockup.png` gives 25° (0.55).
 */
export const DEFAULT_ELEVATION = 29 * MathUtils.DEG2RAD;

/**
 * The target of the default view and of the wide shots (design 4.5, camera; 5.6): the point that
 * they look at and turn around: 0.25 m below the stage top and 0.7 m behind the stage center. The
 * target behind the center puts the podium near the bottom of the frame, as in
 * `orchestra-latest.png`. With the target on the stage top and the camera 24° high, the lit rim
 * of the hall stood behind the logo, and a lamp glow touched the play button of a short screen
 * (844 × 390). At 33°, a target from 0.15 to 0.35 m below the stage top and from 0.5 to 0.8 m
 * behind the center passes these tests.
 */
export const DEFAULT_TARGET: Vec3 = [0, -0.25, -0.7];

/**
 * The azimuth of the default view: 0, on the audience axis, as view 01 of `scene.png` (design
 * 4.5, camera).
 */
export const DEFAULT_AZIMUTH = 0;

/**
 * The default distance for a viewport that is as wide as it is tall, in stage sides. It is the
 * unit of the wide and high shots, of the planner, and of the beam fade of Free mode. The default
 * view stands nearer: see {@link LANDSCAPE_RULE}.
 */
const DEFAULT_DISTANCE_IN_SIDES = 3.3;

/**
 * The landscape rule of the wide views (design 4.5, camera). The view follows `mockup.png`: the
 * stage fills the free area left of the open drawer. Thus the default view stands at a part of the
 * default distance. On a narrower landscape viewport, the camera moves back with the width, so
 * that the orchestra keeps its part of the width.
 */
const LANDSCAPE_RULE = {
  /**
   * The part of the default distance at this aspect and wider. It was 0.56 with the lower view of
   * 25°. At 33°, 0.56 put the players of K. 525 from 0.00 to 0.98 of the free area.
   */
  zoom: 0.58,
  /** The aspect from which the zoom is constant: a desktop of 1440 × 900. */
  fullAspect: 1.6,
} as const;

/**
 * Calculates the zoom of the landscape rule at an aspect (design 4.5, camera).
 *
 * @param aspect The width of the viewport divided by its height.
 * @returns The part of the default distance: 0.58 at the aspect 1.6 and wider, and more for a
 *   narrower viewport, up to 0.928 at the aspect 1 and below.
 */
export function landscapeZoom(aspect: number): number {
  const rule = LANDSCAPE_RULE;
  return Math.min(1, rule.zoom * Math.max(1, rule.fullAspect / Math.max(1, aspect)));
}

/** The view offset: half of the bar height, in CSS pixels (design 4.5, camera; 2.8). */
export const VIEW_OFFSET_Y = 34;

/** The orbit limits of the elevation, in radians (design 4.5, camera). */
export const ELEVATION_LIMITS = [10 * MathUtils.DEG2RAD, 80 * MathUtils.DEG2RAD] as const;

/**
 * The lowest near orbit limit of the distance in Free mode, in meters (design 2.5, 4.5). A close
 * shot is about 4 m from its target, so a limit of half the default distance pulled the camera
 * back at the first update of the controls. While the orbit target moves to the stage center
 * after a shot, this limit applies. Then {@link orbitMinDistance} applies.
 */
export const MIN_DISTANCE = 2;

/**
 * The space between the camera of Free mode and the box of the stage and the players, in meters
 * (design 2.5, 4.5). A zoom stops at this space, so that no player comes nearer to the camera. With
 * a limit of 2 m from the stage center, a zoom put the camera among the players and in the head of
 * the conductor, and the depth of field blurred all of them.
 */
export const ORBIT_CLEARANCE = 1;

/**
 * Calculates the near orbit limit of Free mode in one direction (design 2.5, 4.5): the distance
 * from the target at which the camera leaves the box of the stage and the players. The box is
 * the stage square and the space up to the highest head, with {@link ORBIT_CLEARANCE} on each
 * side and on the top. Thus a low camera stops in front of the stage edge, and a high camera
 * stops above the heads.
 *
 * @param target The orbit target.
 * @param direction The unit vector from the target to the camera.
 * @param stageSide The stage side `S`, in meters.
 * @param playersTop The highest point of the players above the stage top, in meters.
 * @returns The distance, in meters, and at least {@link MIN_DISTANCE}.
 */
export function orbitMinDistance(
  target: Vec3,
  direction: Vec3,
  stageSide: number,
  playersTop: number,
): number {
  const half = stageSide / 2 + ORBIT_CLEARANCE;
  const top = playersTop + ORBIT_CLEARANCE;
  const highs = [half, top, half];
  const lows = [-half, -Infinity, -half];

  let exit = Infinity;
  for (let k = 0; k < 3; k++) {
    const d = direction[k] ?? 0;
    const from = target[k] ?? 0;
    if (d > 0) {
      exit = Math.min(exit, ((highs[k] ?? 0) - from) / d);
    } else if (d < 0) {
      exit = Math.min(exit, ((lows[k] ?? 0) - from) / d);
    }
  }

  return Math.max(MIN_DISTANCE, Number.isFinite(exit) ? exit : MIN_DISTANCE);
}

/** The far orbit limit of the distance in Free mode, as a factor of the default distance. */
export const MAX_DISTANCE_FACTOR = 2;

/** The default view of the camera for one stage and one viewport. */
interface DefaultView {
  /** The point that the camera looks at: {@link DEFAULT_TARGET}. */
  readonly target: Vec3;
  readonly position: Vec3;
  readonly distance: number;
}

/**
 * Calculates the default distance (design 4.5, camera): the distance of the default view before
 * the portrait rule. The wide and high shots, the beam fade of Free mode, and the planner use it
 * as their unit.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param aspect The width of the viewport divided by its height.
 * @returns `3.3 × S`, multiplied by the height divided by the width when the viewport is taller
 *   than wide.
 */
export function defaultDistance(stageSide: number, aspect: number): number {
  return DEFAULT_DISTANCE_IN_SIDES * stageSide * Math.max(1, 1 / aspect);
}

/**
 * The portrait rule of the wide views (design 4.5, camera). A portrait viewport has a lower and
 * more frontal camera, so that the orchestra fills more of a tall screen, and the stage corners
 * can leave the frame.
 */
export const PORTRAIT_RULE = {
  /** The rule applies in full at this aspect and below, and not at all at the aspect 1. */
  fullAspect: 0.6,
  /** The part of the azimuth that the full rule removes. */
  frontal: 0.8,
  /** The elevation that the full rule removes, in radians: 4°. */
  lower: 4 * MathUtils.DEG2RAD,
  /** The factor of the distance of the full rule. */
  nearer: 0.68,
} as const;

/**
 * Calculates the share of the portrait rule at an aspect: a smoothstep from 0 at the aspect 1 to
 * 1 at the aspect 0.6. Thus a turn of the screen or a resize changes the view with no jump.
 *
 * @param aspect The width of the viewport divided by its height.
 * @returns The share, from 0 to 1.
 */
export function portraitShare(aspect: number): number {
  const x = Math.min(1, Math.max(0, (1 - aspect) / (1 - PORTRAIT_RULE.fullAspect)));
  return x * x * (3 - 2 * x);
}

/** The camera of a wide view after the portrait rule. */
interface WideAngles {
  /** Radians around y, from +z (the audience) to +x. */
  readonly azimuth: number;
  /** Radians above the stage plane. */
  readonly elevation: number;
  /** A factor of the default distance. */
  readonly zoom: number;
}

/**
 * Applies the landscape rule and the portrait rule to the camera of a wide view (design 4.5,
 * camera; 5.6). The landscape rule moves the camera to its part of the default distance. The
 * portrait rule turns the camera to the front, lowers it by 4°, and moves it nearer, by the share
 * of the aspect. The zoom of a wide variant fits the players of its angle in a landscape view,
 * so the portrait rule removes it, and keeps the move of the shot.
 *
 * @param azimuth The azimuth of the key, in radians.
 * @param elevation The elevation of the key, in radians.
 * @param zoom The zoom of the key: 1 for the default view.
 * @param variantZoom The zoom of the variant of the shot, at rest: 1 for the default view.
 * @param aspect The width of the viewport divided by its height.
 * @returns The camera of the view. Its zoom is a factor of the default distance.
 */
export function wideView(
  azimuth: number,
  elevation: number,
  zoom: number,
  variantZoom: number,
  aspect: number,
): WideAngles {
  const p = portraitShare(aspect);
  const rule = PORTRAIT_RULE;
  const landscape = landscapeZoom(aspect);
  const portrait = rule.nearer / variantZoom;
  return {
    azimuth: azimuth * (1 - rule.frontal * p),
    elevation: elevation - rule.lower * p,
    zoom: zoom * (landscape + (portrait - landscape) * p),
  };
}

/**
 * Calculates the default view (design 4.5, camera): the camera of view 01 of `scene.png`, after
 * the landscape rule and the portrait rule.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param width The width of the viewport.
 * @param height The height of the viewport.
 * @returns The camera on the audience axis at 0.58 of the default distance on a desktop, and
 *   farther on a narrower viewport. A portrait viewport gets a lower and nearer camera.
 */
export function defaultView(stageSide: number, width: number, height: number): DefaultView {
  const aspect = width / height;
  const angles = wideView(DEFAULT_AZIMUTH, DEFAULT_ELEVATION, 1, 1, aspect);
  const distance = defaultDistance(stageSide, aspect) * angles.zoom;
  const flat = Math.cos(angles.elevation) * distance;
  const [x, y, z] = DEFAULT_TARGET;
  return {
    target: DEFAULT_TARGET,
    position: [
      x + Math.sin(angles.azimuth) * flat,
      y + Math.sin(angles.elevation) * distance,
      z + Math.cos(angles.azimuth) * flat,
    ],
    distance,
  };
}

/**
 * Calculates the far plane of the camera (design 4.5, camera).
 *
 * @param distance The current distance from the camera to the target.
 * @param stageSide The stage side `S`, in meters.
 * @returns The distance plus `3 × S`, so that a full zoom-out still shows the stage.
 */
export function farPlane(distance: number, stageSide: number): number {
  return distance + 3 * stageSide;
}
