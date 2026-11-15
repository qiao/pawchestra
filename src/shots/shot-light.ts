import { smoothstep } from '../math.ts';
import { KEY_PLACE } from '../models/beam.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { ShotKind } from './types.ts';
import { defaultDistance } from './view.ts';

/**
 * The weight of the light of a close shot for each kind of shot (design 4.5, 5.6). On a film set,
 * the crew lights each setup again: a close shot gets its own soft key, a kicker, a little more
 * exposure, and a stronger vignette. The wide shots keep the light of the stage.
 */
export const SHOT_LIGHT = {
  wide: 0,
  high: 0,
  conductor: 1,
  // A side shot shows a large part of the orchestra, so it keeps half of the light of the stage.
  side: 0.5,
  section: 1,
  solo: 1,
  // A detail insert is a close setup of its own.
  insert: 1,
} as const satisfies Record<ShotKind, number>;

/**
 * The weight of the follow-spot for each kind of shot (design 4.5, 5.6): the soft key of a solo
 * shot becomes a narrow spot from higher up, as the follow-spot of a soloist in a concert hall.
 */
export const SHOT_SPOT = {
  wide: 0,
  high: 0,
  conductor: 0,
  side: 0,
  section: 0,
  solo: 1,
  insert: 0,
} as const satisfies Record<ShotKind, number>;

/**
 * The range of the fade of the light of a close shot in Free mode (design 2.5, 4.5): the distance
 * from the camera to the stage center, as a factor of the default distance. The section and the
 * solo shots of the planner stand at 0.25 or less, so a change from Cinematic to Free mode keeps
 * their light. The default view stands at about 0.56, and a view of the whole stage at about
 * 0.43. A fade from 0.45 to 0.5 gave such a view half of the close light.
 */
export const FREE_LIGHT_FADE = [0.25, 0.4] as const;

/**
 * Calculates the weight of the light of a close shot for a camera in Free mode (design 2.5, 4.5).
 * It follows the distance to the stage center with a smoothstep, so an orbit or a zoom changes it
 * with no jump.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param aspect The width of the viewport divided by its height.
 * @param position The camera position, in the stage axes.
 * @returns The weight, from 0 (far) to 1 (near).
 */
export function freeShotLight(stageSide: number, aspect: number, position: Vec3): number {
  const ratio = Math.hypot(...position) / defaultDistance(stageSide, aspect);
  const [near, far] = FREE_LIGHT_FADE;
  return 1 - smoothstep((ratio - near) / (far - near));
}

/** The angles of the lamps of a shot, in radians (design 4.5). */
export const SHOT_RIG = {
  /** The turn of the key from the axis of the camera around the vertical. */
  keyTurn: (35 * Math.PI) / 180,
  /** The angle of the key above the stage plane. */
  keyElevation: (35 * Math.PI) / 180,
  /** The angle of the follow-spot above the stage plane. */
  spotElevation: (55 * Math.PI) / 180,
  /** The turn of the kicker from the axis of the camera around the vertical. */
  kickerTurn: (140 * Math.PI) / 180,
  /** The angle of the kicker above the stage plane. */
  kickerElevation: (30 * Math.PI) / 180,
  /** The half angle of a cone, as a part of the vertical field of view of the camera. */
  cone: 0.7,
  /** The half angle of the cone of the follow-spot, as a part of the cone of the key. */
  spotCone: 0.6,
  /** The nearest and the farthest distance of a lamp from the target, in meters. */
  distance: [2, 12],
} as const;

/** One lamp of the light of a shot. */
export interface ShotLamp {
  /** The position of the lamp, in the stage axes. */
  readonly position: Vec3;
  /** The point that the lamp aims at: the target of the camera. */
  readonly target: Vec3;
  /** The half angle of the cone, in radians. */
  readonly angle: number;
}

/** The lamps of the light of a close shot (design 4.5, 5.6). */
export interface ShotRig {
  /** The soft key, 35° from the axis of the camera, toward the side of the stage key light. */
  readonly key: ShotLamp;
  /** The kicker, behind the subject, on the side of the nearer stage light. */
  readonly kicker: ShotLamp;
  /**
   * The part of the subject that the camera sees in the shade of the stage key light, from 0
   * (the camera stands at the key light) to 1 (the camera faces the key light). The soft key and
   * the extra exposure of the shot take this part ({@link shadeShare}).
   */
  readonly shade: number;
}

/**
 * Gives the part of a subject that a camera sees in the shade of the key light of the stage
 * (`KEY_PLACE`), as the phase of a lit sphere: (1 - cos α) / 2, where α is the angle at the
 * subject between the camera and the key light. The key light stands far from the stage, so its
 * direction is the same for each subject. The key light stands in front of the stage, so the
 * cameras of most close shots see the lit side of the subject: a soft key and more exposure on
 * that side make the light fur clip.
 *
 * @param azimuth The azimuth of the camera around the subject, in radians.
 * @param elevation The angle of the camera above the subject, in radians.
 * @returns The part, from 0 to 1.
 */
function shadeShare(azimuth: number, elevation: number): number {
  const key = KEY_PLACE;
  const cosine =
    Math.cos(elevation) * Math.cos(key.elevation) * Math.cos(azimuth - key.azimuth) +
    Math.sin(elevation) * Math.sin(key.elevation);
  return (1 - cosine) / 2;
}

/**
 * Calculates a point on a sphere around a target.
 *
 * @param target The center.
 * @param azimuth Radians around y, from +z (the audience) to +x.
 * @param elevation Radians above the stage plane.
 * @param distance The radius, in meters.
 * @returns The point.
 */
function around(target: Vec3, azimuth: number, elevation: number, distance: number): Vec3 {
  const flat = distance * Math.cos(elevation);
  return [
    target[0] + flat * Math.sin(azimuth),
    target[1] + distance * Math.sin(elevation),
    target[2] + flat * Math.cos(azimuth),
  ];
}

/**
 * Gives the angle between two azimuths.
 *
 * @param a The first azimuth, in radians.
 * @param b The second azimuth, in radians.
 * @returns The angle, from 0 to π.
 */
function azimuthGap(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/**
 * Gives the angle from the azimuth of a lamp to the nearer stage light: the key light in front of
 * the stage (`KEY_PLACE`) or the rim lights behind it, at the azimuth π.
 *
 * @param azimuth The azimuth of the lamp, in radians.
 * @returns The angle, from 0 to π.
 */
function stageLightGap(azimuth: number): number {
  return Math.min(azimuthGap(azimuth, KEY_PLACE.azimuth), azimuthGap(azimuth, Math.PI));
}

/**
 * Places the lamps of the light of a shot around the target of a camera (design 4.5, 5.6). Pure:
 * the lamps come only from the camera, so a seek gives the light of the shot at once.
 *
 * 1. The key turns 35° from the axis of the camera toward the key light of the stage, which
 *    stands in front of the stage and to the left (`KEY_PLACE`). The lit side of the subject then
 *    faces away from its shadow on the stage.
 * 2. The kicker stands 140° from the axis of the camera, behind the subject, on the side that
 *    puts it nearer to a stage light: the rim lights behind the stage, or the key light for a
 *    camera behind the orchestra.
 * 3. Each cone covers the frame. The follow-spot of a solo shot rises and narrows the key.
 * 4. The soft key and the extra exposure fill only the part of the subject that the camera sees
 *    in the shade of the stage key light ({@link shadeShare}).
 *
 * @param position The camera position.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view of the camera, in degrees.
 * @param spot The weight of the follow-spot, from 0 to 1.
 * @returns The lamps and the shade share.
 */
export function shotRig(position: Vec3, target: Vec3, fov: number, spot: number): ShotRig {
  const rig = SHOT_RIG;
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const azimuth = Math.atan2(dx, dz);
  // The key turns toward the key light of the stage, the short way around.
  const side = Math.sin(KEY_PLACE.azimuth - azimuth) >= 0 ? 1 : -1;
  const kickSide =
    stageLightGap(azimuth + rig.kickerTurn) <= stageLightGap(azimuth - rig.kickerTurn) ? 1 : -1;
  const [near, far] = rig.distance;
  const distance = Math.min(far, Math.max(near, Math.hypot(dx, dy, dz)));
  const cone = (fov * Math.PI * rig.cone) / 180;
  const elevation = rig.keyElevation + (rig.spotElevation - rig.keyElevation) * spot;
  return {
    key: {
      position: around(target, azimuth + side * rig.keyTurn, elevation, distance),
      target,
      angle: cone * (1 + (rig.spotCone - 1) * spot),
    },
    kicker: {
      position: around(target, azimuth + kickSide * rig.kickerTurn, rig.kickerElevation, distance),
      target,
      angle: cone,
    },
    shade: shadeShare(azimuth, Math.atan2(dy, Math.hypot(dx, dz))),
  };
}
