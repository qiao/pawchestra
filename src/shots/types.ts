import type { Vec3 } from '../models/tuples.ts';

/** The kinds of shot (design 5.6). */
export type ShotKind = 'wide' | 'high' | 'conductor' | 'side' | 'section' | 'solo';

/**
 * Tells if a kind of shot is a close shot, which fits its subject sphere into the frame.
 *
 * @param kind The kind.
 * @returns True for a conductor, side, section, or solo shot.
 */
export function isCloseShot(kind: ShotKind): boolean {
  return kind !== 'wide' && kind !== 'high';
}

/** One camera on a sphere around the target of a shot (design 5.6). */
export interface ShotKey {
  /** Radians around y, from +z (the audience) to +x, as in `defaultView()`. */
  readonly azimuth: number;
  /** Radians above the stage plane, seen from the target. */
  readonly elevation: number;
  /**
   * A factor of the fit distance of the shot, or of the wide distance for a radius of 0. Less
   * than 1 is closer.
   */
  readonly zoom: number;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
}

/** One shot of the film of a score (design 5.6). */
export interface Shot {
  readonly kind: ShotKind;
  /** Song seconds. The first shot starts at `-Infinity`, so the count-in has a shot. */
  readonly startSec: number;
  /** Song seconds. The last shot ends at `Infinity`, so the song end holds its camera. */
  readonly endSec: number;
  /**
   * The end of the move of the shot, in song seconds. It is `endSec`, except for the last shot.
   * The move starts at `startSec`, or at the song start for the first shot.
   */
  readonly moveEndSec: number;
  /** The seats of the subject. Empty for a wide, a high, or a conductor shot. */
  readonly seats: readonly number[];
  /**
   * The players of a choir part by their number in the seat, for example the sopranos, or `null`
   * for all players of the seats.
   */
  readonly part: readonly number[] | null;
  /** The point that the camera looks at. */
  readonly target: Vec3;
  /**
   * The radius of the subject sphere, in meters. 0 for a wide or a high shot: these use the
   * default distance of design 4.5.
   */
  readonly radius: number;
  /** The camera at the start of the move. */
  readonly from: ShotKey;
  /** The camera at `moveEndSec`. */
  readonly to: ShotKey;
  /** The time of the blend from the previous shot, in song seconds. 0 is a hard cut. */
  readonly blendSec: number;
}

/** The shots of one score. `prepareShots()` makes it. */
export interface ShotPlan {
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** Sorted by `startSec`. Neighbor shots touch: each `endSec` is the next `startSec`. */
  readonly shots: readonly Shot[];
  /** The `startSec` of each shot, for the search by time. */
  readonly starts: Float64Array;
}

/** The camera of one frame. */
export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
  /**
   * The factor of the opacity of the visible beam, from 0 to 1 (design 4.5, 5.6). It is constant
   * in a shot, and it changes at a cut or over a blend.
   */
  readonly beam: number;
  /**
   * True in a close shot: a conductor, side, section, or solo shot. Its full frame stands in the
   * free area above the bar and left of the open drawer (design 4.5, 5.6).
   */
  readonly close: boolean;
  /**
   * The weight of the light of a close shot, from 0 (the light of the stage) to 1 (design 4.5,
   * 5.6). It is constant in a shot, and it changes at a cut or over a blend.
   */
  readonly light: number;
  /** The weight of the follow-spot of a solo shot, from 0 to 1, as {@link CameraPose.light}. */
  readonly spot: number;
}

/** A `CameraPose` with writable values. `cameraAt()` writes each frame into it. */
export interface CameraPoseBuffer {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  beam: number;
  close: boolean;
  light: number;
  spot: number;
}

/** The view of one frame. */
export interface CameraView {
  /** The width of the canvas divided by its height. */
  readonly aspect: number;
  /** True if the user prefers reduced motion: each shot holds its `from` key, with no blend. */
  readonly still: boolean;
}
