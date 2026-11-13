import { MathUtils, Vector3 } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { CameraPose } from '../shots/types.ts';
import { DEFAULT_TARGET, FIELD_OF_VIEW, orbitMinDistance } from '../shots/view.ts';

/** The camera presets of the test page. */
export type ViewName = 'front' | 'side' | 'back' | 'close';

/** The direction of a preset around the stage center, and its distance rule. */
interface ViewAngles {
  /**
   * The turn around the vertical line from the side that the animal faces, in degrees. For a
   * player who faces the audience, 0 is the audience side (+z), and 90 is the side +x, at its left
   * hand.
   */
  readonly azimuth: number;
  /** The angle above the stage top, in degrees, inside the orbit limits of 10° to 80°. */
  readonly elevation: number;
  /**
   * True if the frame shows the whole animal, from the stage top to above its head. A close view
   * comes as near as the near limit of Free mode lets it.
   */
  readonly whole: boolean;
}

/** The angles of each preset. The near limit of Free mode stops the close view (design 2.5). */
const VIEWS = {
  front: { azimuth: 0, elevation: 12, whole: true },
  side: { azimuth: 90, elevation: 12, whole: true },
  back: { azimuth: 180, elevation: 20, whole: true },
  close: { azimuth: 30, elevation: 35, whole: false },
} as const satisfies Readonly<Record<ViewName, ViewAngles>>;

/**
 * The largest distance of the target of a preset from the target of the default view, in meters.
 * Free mode moves a target that is 1 m or more from it back to the stage center after a shot
 * (design 2.5), so the preset target stays nearer.
 */
const TARGET_REACH = 0.9;

/** The space between a preset camera and the near limit of Free mode, in meters. */
const LIMIT_MARGIN = 0.1;

/** The part of the height of the animal that a whole view adds above its head. */
const HEAD_MARGIN = 0.1;

/** The step of the search of the distance of a preset camera, in meters. */
const DISTANCE_STEP = 0.05;

/** The animal of the test page, as the presets see it: a player or the conductor. */
export interface ViewSubject {
  /** The top of the animal above the stage top, in meters: the ears or the head. */
  readonly top: number;
  /**
   * The turn of the side that the animal faces from the audience side, around the vertical line,
   * in radians: 0 for a player, who faces the audience, and π for the conductor, who faces the
   * orchestra. Thus the front view shows the face of each animal.
   */
  readonly turn: number;
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** The top of the players for the near limit of Free mode, in meters (`playersTop()`). */
  readonly playersTop: number;
}

/**
 * Finds if a camera keeps the near limit of Free mode from a point (`orbitMinDistance()`).
 *
 * @param from The point: the orbit target, or the target of the default view.
 * @param camera The camera position.
 * @param subject The animal and its stage.
 * @returns True if the camera is outside the box of the stage and the players.
 */
function keepsLimit(from: Vector3, camera: Vector3, subject: ViewSubject): boolean {
  const offset = camera.clone().sub(from);
  const limit = orbitMinDistance(
    from.toArray(),
    offset.clone().normalize().toArray(),
    subject.stageSide,
    subject.playersTop,
  );
  return offset.length() >= limit + LIMIT_MARGIN;
}

/**
 * Calculates the camera of a preset of the test page (design 7.1, "Test page"). The camera looks
 * at the animal at the stage center. A whole view shows the animal from the stage top to above
 * its head. No camera comes inside the near limit of Free mode. Thus Free mode keeps the camera after the
 * frame of the preset (`StageCamera.update()`), and the orbit controls turn around the animal.
 *
 * @param name The preset.
 * @param subject The animal and its stage.
 * @returns The camera, with the beam and the light of the stage.
 */
export function viewCamera(name: ViewName, subject: ViewSubject): CameraPose {
  const view: ViewAngles = VIEWS[name];
  const center = new Vector3(...DEFAULT_TARGET);
  const reach = new Vector3(0, subject.top / 2, 0).sub(center);
  if (reach.length() > TARGET_REACH) {
    reach.setLength(TARGET_REACH);
  }
  const target = center.clone().add(reach);

  const azimuth = view.azimuth * MathUtils.DEG2RAD + subject.turn;
  const elevation = view.elevation * MathUtils.DEG2RAD;
  const direction = new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
  const halfFov = (FIELD_OF_VIEW / 2) * MathUtils.DEG2RAD;
  // The target is low, so the upper half of the frame must reach above the head.
  const above = subject.top * (1 + HEAD_MARGIN) - target.y;
  let distance = view.whole ? above / Math.tan(halfFov) : 0;
  const camera = (): Vector3 => target.clone().addScaledVector(direction, distance);
  while (!keepsLimit(target, camera(), subject) || !keepsLimit(center, camera(), subject)) {
    distance += DISTANCE_STEP;
  }

  const position: Vec3 = camera().toArray();
  return {
    position,
    target: target.toArray(),
    fov: FIELD_OF_VIEW,
    beam: 1,
    close: false,
    light: 0,
    spot: 0,
  };
}
