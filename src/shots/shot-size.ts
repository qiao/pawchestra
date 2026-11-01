import type { Vec3 } from '../models/tuples.ts';
import { FILM_GRAMMAR } from './grammar.ts';
import type { Subject } from './subjects.ts';
import { CINEMA_ASPECT } from './view.ts';

/** The size of the frame of one kind of close shot (design 5.6). */
export interface ShotSize {
  /**
   * The part of the width of the frame that the outline of the subject fills at the end of the
   * push-in, the closest moment of the move.
   */
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
 * players. The low-poly animals show their facets and the seams of their meshes from near, so the
 * closest frames stay 1.25 times larger than a waist shot.
 */
export const SHOT_SIZES = {
  /**
   * A knee shot of one player (a medium long shot): the frame shows the player from about the
   * knees up, with its instrument and its hands. A seated player is about as wide as it is high
   * from the waist to the top of the head, and the eyes stand one third down from the top, so the
   * player fills about 0.4 of the width of a 21:9 waist shot. A push-in to 0.9 from that frame
   * ends at 0.44. The knee shot at the end of the push-in is 1.25 times larger.
   */
  solo: { share: 0.36, inside: true },
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
   * A shot of the conductor from behind, with its raised arms (view 05 of `scene.png`). In view
   * 05, the bear fills about 0.45 of a 16:9 frame, and thus about 0.35 of a 21:9 frame of the
   * same height. A push-in to 0.92 from that frame ends at 0.38. The frame at the end of the
   * push-in is 1.25 times larger.
   */
  conductor: { share: 0.3, inside: true },
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
   * The top of each head stays this far below the top edge, so the head is not cut. Long ears can
   * leave the frame ({@link HEAD_BONES} of `subjects.ts`).
   * The fit reads the head of the bind pose, and a playing pose can lift the head above it.
   */
  top: 0.1,
  /** The hands and the instrument stay this far above the bottom edge. */
  bottom: 0.1,
  /**
   * The depth of a point toward the camera counts up to this part of the distance of the camera,
   * so that a point near the camera does not make the frame infinite.
   */
  near: 0.7,
} as const;

/** The passes of the fit: one with no perspective, then each with the distance of the last pass. */
const FIT_PASSES = 3;

/**
 * The place of a point in the view of a camera, relative to the target: the offset to the right
 * and up, and the offset of the depth, in meters.
 */
interface ViewOffset {
  /** The offset to the right. */
  readonly right: number;
  /** The offset up, in the frame of a camera that looks at the target. */
  readonly up: number;
  /** The depth less the depth of the target: below 0 nearer to the camera. */
  readonly depth: number;
}

/**
 * Gives the view offsets of points for a camera at an azimuth and an elevation around a target.
 *
 * @param points The points.
 * @param target The target.
 * @param azimuth The azimuth of the camera, in radians.
 * @param elevation The elevation of the camera, in radians.
 * @returns The offset of each point.
 */
function viewOffsets(
  points: readonly Vec3[],
  target: Vec3,
  azimuth: number,
  elevation: number,
): ViewOffset[] {
  const cos = Math.cos(azimuth);
  const sin = Math.sin(azimuth);
  const ce = Math.cos(elevation);
  const se = Math.sin(elevation);
  return points.map((p) => {
    const dx = p[0] - target[0];
    const dy = p[1] - target[1];
    const dz = p[2] - target[2];
    const toward = dx * sin + dz * cos;
    return {
      right: dx * cos - dz * sin,
      up: dy * ce - toward * se,
      depth: -(toward * ce + dy * se),
    };
  });
}

/**
 * Gives the scale of an offset at a depth to its size at the depth of the target.
 *
 * @param depth The depth offset of the point.
 * @param distance The distance of the camera from the target, or `Infinity` for no perspective.
 * @returns The scale: more than 1 for a point nearer to the camera.
 */
function depthScale(depth: number, distance: number): number {
  if (!Number.isFinite(distance)) {
    return 1;
  }
  return distance / Math.max((1 - FRAME_MARGINS.near) * distance, distance + depth);
}

/**
 * Calculates the frame of a close camera (design 5.6): half its height at the target, at the
 * aspect of Cinematic mode, at the zoom 1. Each rule holds at the closest zoom of the move, the
 * end of its push-in, so the move ends at the shot size.
 *
 * - The outline of the subject fills the share of the width of its shot size.
 * - With `inside`, the outline stays inside the side edges, with the target on its third line.
 * - With the eyes on the upper third line, the frame holds the top of each head below its top
 *   edge and each low point above its bottom edge.
 *
 * A point near the camera looks larger, and a camera above the subject sees a far point higher in
 * the frame. After a first pass with no perspective, each pass scales the offsets of the points
 * by their depth at the closest distance of the last pass.
 *
 * @param subject The subject.
 * @param size The shot size.
 * @param azimuth The azimuth of the camera around the target, in radians.
 * @param elevation The elevation of the camera above the target, in radians.
 * @param third The third line of the target: -1, 0, or 1.
 * @param fov The vertical field of view, in degrees.
 * @param zoom The closest zoom of the move: the push-in at its end.
 * @returns Half the height of the frame at the target, in meters.
 */
export function frameHalfHeight(
  subject: Subject,
  size: ShotSize,
  azimuth: number,
  elevation: number,
  third: number,
  fov: number,
  zoom: number,
): number {
  const margins = FRAME_MARGINS;
  const line = FILM_GRAMMAR.thirdLine;
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const { target, reach, eyes } = subject;
  const outline = viewOffsets(subject.outline, target, azimuth, elevation);
  const [eye] = eyes ? viewOffsets([eyes], target, azimuth, elevation) : [];
  const tops = eye ? viewOffsets(subject.tops, target, azimuth, elevation) : [];
  const lows = eye ? viewOffsets(subject.lows, target, azimuth, elevation) : [];
  const x0 = third * line;
  const room = 1 - margins.side;
  let half = 0;
  let distance = Infinity;
  for (let pass = 0; pass < FIT_PASSES; pass++) {
    const near = distance * zoom;
    let [low, high] = [Infinity, -Infinity];
    for (const p of outline) {
      const close = depthScale(p.depth, near);
      low = Math.min(low, (p.right - reach) * close);
      high = Math.max(high, (p.right + reach) * close);
    }
    // At the closest zoom, half the width of the frame at the target is `width × zoom`.
    let width = (high - low) / (2 * size.share * zoom);
    if (size.inside) {
      width = Math.max(width, high / ((room - x0) * zoom), -low / ((room + x0) * zoom));
    }

    let tall = 0;
    if (eye) {
      const eyeUp = eye.up * depthScale(eye.depth, near);
      for (const p of tops) {
        const above = p.up * depthScale(p.depth, near) - eyeUp;
        tall = Math.max(tall, above / ((1 - line - margins.top) * zoom));
      }
      for (const p of lows) {
        const below = eyeUp - p.up * depthScale(p.depth, near);
        tall = Math.max(tall, below / ((1 + line - margins.bottom) * zoom));
      }
    }
    half = Math.max(tall, width / CINEMA_ASPECT);
    distance = half / tanV;
  }
  return half;
}
