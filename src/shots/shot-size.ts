import { FILM_GRAMMAR } from './grammar.ts';
import type { Subject } from './subjects.ts';
import { CINEMA_ASPECT } from './view.ts';

/** The size of the frame of one kind of close shot (design 5.6). */
export interface ShotSize {
  /** The part of the width of the frame that the outline of the subject fills, at the zoom 1. */
  readonly share: number;
  /**
   * True if the outline stays inside the side edges of the frame, with its look room. False for a
   * sphere that the frame can cut, as the deep part of a side of the stage.
   */
  readonly inside: boolean;
}

/**
 * The shot sizes of the close shots (design 5.6, `docs/reference/camera-technique.md`). The frame
 * of a close shot has the aspect 21:9, so it fits the width of its subject. A frame that fits the
 * height of the subject shows about 2.3 times its width, and a solo shot then showed about eight
 * players.
 */
export const SHOT_SIZES = {
  /**
   * A waist shot of one player (a medium shot): the frame shows the player from the waist up, with
   * its instrument and its hands. A seated player is about as wide as it is high from the waist to
   * the top of the head, and the eyes stand one third down from the top, so the player fills about
   * 0.4 of the width of a 21:9 frame.
   */
  solo: { share: 0.4, inside: true },
  /**
   * A group shot of the players of a section, or a two-shot of a small group. The section stands
   * on its third line, and the look room on the other side holds the rest of the width.
   */
  section: { share: 0.6, inside: true },
  /**
   * A group shot of the front half of one side of the stage (views 03 and 04 of `scene.png`). The
   * frame holds the sphere of the side across its width, and it cuts the deep part of the side.
   */
  side: { share: 1, inside: false },
  /**
   * A waist shot of the conductor from behind, with its raised arms (view 05 of `scene.png`). In
   * view 05, the bear fills about 0.45 of a 16:9 frame, and thus about 0.35 of a 21:9 frame of
   * the same height.
   */
  conductor: { share: 0.35, inside: true },
  /**
   * The view over the shoulder of the conductor at the orchestra (view 02 of `scene.png`): a long
   * shot of the players behind the bear. The frame is about as wide as the stage.
   */
  conductorBack: { share: 0.6, inside: false },
} as const satisfies Readonly<Record<string, ShotSize>>;

/** The margins of the frame of a close shot, as parts of half the width or half the height. */
export const FRAME_MARGINS = {
  /** The outline stays this far inside each side edge. */
  side: 0.1,
  /**
   * The top of the subject stays this far below the top edge: the head with the ears is not cut.
   * A playing pose can lift the head above its bind pose, and with 0.05 the ears of a rabbit
   * touched the top edge.
   */
  top: 0.1,
  /** The hands and the instrument stay this far above the bottom edge. */
  bottom: 0.1,
  /**
   * The depth of a point of the outline toward the camera counts up to this part of the flat
   * distance of the camera, so that a point near the camera does not make the frame infinite.
   */
  near: 0.7,
} as const;

/** The passes of the fit: one with no perspective, then each with the distance of the last pass. */
const FIT_PASSES = 3;

/**
 * Calculates the frame of a close camera (design 5.6): half its height at the target, at the
 * aspect of Cinematic mode. The outline of the subject fills the share of the width of its shot
 * size. With `inside`, the outline also stays inside the side edges, with the target on its third
 * line. The frame also holds the subject from its top to its bottom, with its eyes on the upper
 * third line. A near point of the outline looks larger: after a first pass with no perspective,
 * each pass scales the points by their depth at the distance of the last pass.
 *
 * @param subject The subject.
 * @param size The shot size.
 * @param azimuth The azimuth of the camera around the target, in radians.
 * @param elevation The elevation of the camera above the target, in radians.
 * @param third The third line of the target: -1, 0, or 1.
 * @param fov The vertical field of view, in degrees.
 * @returns Half the height of the frame at the target, in meters.
 */
export function frameHalfHeight(
  subject: Subject,
  size: ShotSize,
  azimuth: number,
  elevation: number,
  third: number,
  fov: number,
): number {
  const margins = FRAME_MARGINS;
  const line = FILM_GRAMMAR.thirdLine;
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  let tall = 0;
  if (subject.eyes) {
    const eyes = subject.eyes[1];
    tall = Math.max(
      (subject.top - eyes) / (1 - line - margins.top),
      (eyes - subject.bottom) / (1 + line - margins.bottom),
    );
  }

  // The right axis of the camera and the axis toward it, in the stage plane.
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  const [tx, , tz] = subject.target;
  const x0 = third * line;
  const { reach } = subject;
  let half = tall;
  let flat = Infinity;
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    let low = Infinity;
    let high = -Infinity;
    for (const p of subject.outline) {
      const dx = p[0] - tx;
      const dz = p[2] - tz;
      const toward = Math.min(dx * sin + dz * cos, margins.near * flat);
      const scale = Number.isFinite(flat) ? flat / (flat - toward) : 1;
      const right = dx * cos - dz * sin;
      low = Math.min(low, (right - reach) * scale);
      high = Math.max(high, (right + reach) * scale);
    }
    let width = (high - low) / (2 * size.share);
    if (size.inside) {
      const room = 1 - margins.side;
      width = Math.max(width, high / (room - x0), -low / (room + x0));
    }
    half = Math.max(tall, width / CINEMA_ASPECT);
    flat = (half / tanV) * Math.cos(elevation);
  }
  return half;
}
