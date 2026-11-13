import type { Vec3 } from '../models/tuples.ts';

/**
 * The kinds of shot (design 5.6). An `insert` is a short cutaway to a detail of the playing, which
 * the plan keeps apart from the main shots (`ShotPlan.inserts`).
 */
export type ShotKind = 'wide' | 'high' | 'conductor' | 'side' | 'section' | 'solo' | 'insert';

/** The details that an insert shows (design 5.6). */
export type InsertDetail =
  | 'keys'
  | 'bow'
  | 'fingers'
  | 'harp'
  | 'slide'
  | 'bell'
  | 'sticks'
  | 'bars'
  | 'baton';

/**
 * Tells if a kind of shot is a close shot, which fits the frame to its subject.
 *
 * @param kind The kind.
 * @returns True for a conductor, side, section, solo, or insert shot.
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
   * A factor of the distance of the frame of the shot, or of the wide distance for a frame of 0.
   * Less than 1 is closer.
   */
  readonly zoom: number;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
}

/** The place of the subject in the frame of a close shot (design 5.6): look room and headroom. */
export interface Composition {
  /** The middle of the heads of the subject players. The frame puts it on the upper third line. */
  readonly eyes: Vec3;
  /**
   * The third line of the target: -1 on the left, 1 on the right, or 0 in the middle. A subject
   * that looks to one side stands on the third line on the other side, so it looks into the frame.
   */
  readonly third: -1 | 0 | 1;
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
  /** The middle of the subject. The camera turns around it at its distance. */
  readonly target: Vec3;
  /**
   * Half the height of the frame of a close shot at the distance of its target, at the zoom 1, in
   * meters. The camera stands at the distance that gives this frame with its field of view. 0 for
   * a wide or a high shot: these use the default distance of design 4.5.
   */
  readonly halfHeight: number;
  /**
   * The place of the subject in the frame, or `null` for the target in the middle: a wide, a
   * high, or an over-the-shoulder conductor shot.
   */
  readonly composition: Composition | null;
  /** The camera at the start of the move. */
  readonly from: ShotKey;
  /** The camera at `moveEndSec`. */
  readonly to: ShotKey;
  /** The time of the blend from the previous shot, in song seconds. 0 is a hard cut. */
  readonly blendSec: number;
  /**
   * The hero of the shot (design 5.6): the player whose nearer eye takes the focus, as its index
   * in `SceneLayout.players`, or `CONDUCTOR_OWNER` for the conductor. `null` keeps the focus on
   * the point that the camera looks at.
   */
  readonly hero: number | null;
  /** The detail of an insert. The other kinds have none. */
  readonly detail?: InsertDetail;
}

/** The shots of one score. `prepareShots()` makes it. */
export interface ShotPlan {
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** Sorted by `startSec`. Neighbor shots touch: each `endSec` is the next `startSec`. */
  readonly shots: readonly Shot[];
  /** The `startSec` of each shot, for the search by time. */
  readonly starts: Float64Array;
  /**
   * The detail inserts, sorted by `startSec` (design 5.6). Each one cuts away from the main shot
   * of its time and back to it. The main shot moves on under the insert, as the camera of a live
   * concert film keeps its shot while the director cuts to another camera.
   */
  readonly inserts: readonly Shot[];
  /** The `startSec` of each insert, for the search by time. */
  readonly insertStarts: Float64Array;
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
  /**
   * The factor of the focus distance (design 4.5, 5.6): 1 on the subject. After a hard cut into a
   * close shot, the focus starts behind the subject and pulls onto it (`FOCUS_PULL`). A pose with
   * no value has the focus on the subject.
   */
  readonly focusPull?: number;
  /**
   * The hero of the shot ({@link Shot.hero}). The scene finds the nearer eye of its posed head and
   * focuses on it (design 4.5, 5.6). A pose with no value focuses on the point that it looks at.
   */
  readonly hero?: number | null;
  /**
   * The hero of the previous shot during a blend, else the same as {@link CameraPose.hero}. The
   * focus goes from its eye to the eye of the hero over the blend.
   */
  readonly heroFrom?: number | null;
  /** The weight of the eye of {@link CameraPose.hero} against the eye of `heroFrom`, from 0 to 1. */
  readonly heroShare?: number;
  /**
   * True in a detail insert (design 5.6): with no eye of the hero in the frame, the focus stays
   * on the detail, the point that the camera looks at, and not on the head of the hero.
   */
  readonly detail?: boolean;
  /**
   * The sphere that the shadow map of the key light holds (design 4.5): the center and the radius,
   * in meters. It is constant in a shot (`writeShadowFit()`). A radius of 0, or a pose with no
   * value, holds the whole stage.
   */
  readonly shadowFit?: readonly [number, number, number, number];
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
  focusPull: number;
  hero: number | null;
  heroFrom: number | null;
  heroShare: number;
  detail: boolean;
  shadowFit: [number, number, number, number];
}

/** The view of one frame. */
export interface CameraView {
  /** The width of the canvas divided by its height. */
  readonly aspect: number;
  /** True if the user prefers reduced motion: each shot holds its `from` key, with no blend. */
  readonly still: boolean;
}
