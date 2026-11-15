import type { Vec3 } from '../models/tuples.ts';
import { smoothstep } from '../math.ts';

/**
 * The lens of the depth of field (design 4.5, post effects). The focus follows the nearer eye of
 * the hero of a shot, else the point that the camera looks at. A close camera has the full aperture and a shallow depth of field. The aperture
 * closes between two focus distances, so that the wide views keep the full stage sharp, as in
 * `scene.png`.
 */
export const LENS = {
  /**
   * The diameter of the full aperture, in meters. With 0.025 m, a close shot at 4 m blurs the
   * back of the hall to a disc of about 1.2% of the image height. An aperture of 0.07 m copies the
   * close shots of `scene.png`, but its area in focus is too small.
   */
  aperture: 0.025,
  /**
   * The aperture starts to close at this focus distance, and it is closed at the second one, in
   * stage sides. The close shots stand at 0.4 to 0.6 S from their subject, and the default view
   * at 1.85 S. With a fixed aperture, the default view blurred the near stage corner by 0.4% of
   * the image height.
   */
  closing: [1.0, 1.5],
  /** The largest diameter of the blur disc, as a part of the image height. */
  maxBlur: 0.015,
  /**
   * The largest diameter of the blur disc in front of the focus, as a part of the image height:
   * about 3.5 px at the height 900 px. The over-the-shoulder conductor shot focuses on the middle
   * of the orchestra, and the full limit blurred the bear in front to a disc of 31 px. In view 02
   * of `scene.png`, the bear in front is only a little soft.
   */
  maxNearBlur: 0.0035,
  /**
   * A blur disc below this part of the image height counts as sharp, and the frame skips the
   * blur passes. 0.0012 is about 1 px at the height 900 px.
   */
  sharpBlur: 0.0012,
} as const;

/**
 * Calculates the blur scale of a thin lens. The diameter of the blur disc at the view depth `d`,
 * as a part of the image height, is `scale × |1 - focus / d|`.
 *
 * The thin lens gives the disc `A × f / (s - f) × |1 - s / d|` on the sensor, for the aperture
 * `A`, the focal length `f`, and the focus distance `s`. The sensor height is
 * `2 × f × tan(fov / 2)`, and `f` is much smaller than `s`.
 *
 * @param focusDistance The distance from the camera to the point in focus, in meters.
 * @param fovDegrees The vertical field of view, in degrees.
 * @param aperture The diameter of the aperture, in meters.
 * @returns The blur scale, as a part of the image height.
 */
export function blurScale(focusDistance: number, fovDegrees: number, aperture: number): number {
  const halfFov = (fovDegrees * Math.PI) / 360;
  return aperture / (2 * focusDistance * Math.tan(halfFov));
}

/**
 * Calculates the signed blur of a point at a view depth (design 4.5). A point nearer than the
 * focus gets a negative value, and a point farther gets a positive value. The size is limited to
 * {@link LENS}.maxNearBlur in front of the focus and to {@link LENS}.maxBlur behind it.
 *
 * @param depth The view depth of the point, in meters. It is more than 0.
 * @param focusDistance The distance of the focus, in meters.
 * @param scale The blur scale of {@link blurScale}.
 * @returns The diameter of the blur disc, as a signed part of the image height.
 */
export function blurAt(depth: number, focusDistance: number, scale: number): number {
  const blur = scale * (1 - focusDistance / depth);
  return Math.max(-LENS.maxNearBlur, Math.min(LENS.maxBlur, blur));
}

/** The focus of one frame (design 4.5, post effects). */
export interface Focus {
  /** The distance from the camera to the point that it looks at, in meters. */
  readonly distance: number;
  /** The blur scale of {@link blurScale}, as a part of the image height. */
  readonly scale: number;
  /**
   * True if a point at the far plane gets a blur disc larger than {@link LENS}.sharpBlur. Else
   * the frame skips the blur passes. The near side does not count, because a far camera has
   * nothing near it.
   */
  readonly active: boolean;
}

/**
 * Calculates the aperture of the lens for a focus distance (design 4.5): the full aperture up to
 * the first distance of {@link LENS}.closing, closed from the second, with a smoothstep between.
 *
 * @param distance The focus distance, in meters.
 * @param stageSide The stage side `S`, in meters.
 * @returns The diameter of the aperture, in meters.
 */
export function apertureAt(distance: number, stageSide: number): number {
  const [open, closed] = LENS.closing;
  return LENS.aperture * (1 - smoothstep((distance / stageSide - open) / (closed - open)));
}

/**
 * Calculates the focus of a frame from the camera and the point that it looks at (design 4.5).
 *
 * @param position The camera position.
 * @param target The point that the camera looks at.
 * @param fovDegrees The vertical field of view, in degrees.
 * @param far The far plane, in meters.
 * @param stageSide The stage side `S`, in meters.
 * @param pull The factor of the focus distance of a focus pull, 1 on the point. The aperture
 *   follows the distance to the point, so a pull does not open or close it.
 * @param depth The view depth of the point in focus, such as an eye of the hero
 *   ({@link heroFocusDepth}), or `null` for the point that the camera looks at. The aperture
 *   follows the distance to the point that the camera looks at, so the eye does not open it.
 * @returns The focus.
 */
export function focusOf(
  position: Vec3,
  target: Vec3,
  fovDegrees: number,
  far: number,
  stageSide: number,
  pull = 1,
  depth: number | null = null,
): Focus {
  const toPoint = Math.max(
    0.1,
    Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2]),
  );
  const distance = Math.max(0.1, depth ?? toPoint) * pull;
  const scale = blurScale(distance, fovDegrees, apertureAt(toPoint, stageSide));
  return { distance, scale, active: blurAt(far, distance, scale) > LENS.sharpBlur };
}

/**
 * The rule of the focus on an eye (design 4.5, 5.6). A focus puller keeps the eyes of a face in a
 * close shot sharp, and with a shallow depth of field the eye nearer to the camera
 * (`camera-technique.md`).
 */
export const EYE_FOCUS = {
  /**
   * An eye shows when the front of the head turns at most about 100° away from the camera: the
   * cosine between the front of the head and the line from the eye to the camera is at least this
   * value. Thus a profile keeps the focus on its nearer eye, and a head seen from behind focuses on
   * the middle of the head.
   */
  facing: -0.17,
  /**
   * A body whose eye bones lie nearer than this to the middle of its head, in meters, has no eye
   * facts. Its focus goes to the middle of the head.
   */
  eyeOffset: 0.01,
} as const;

/** The middles of the eyes and of the head of a posed hero, in world axes. */
export interface HeroHead {
  /** The middle of the left eye. */
  readonly eyeL: Vec3;
  /** The middle of the right eye. */
  readonly eyeR: Vec3;
  /** The middle of the head. */
  readonly head: Vec3;
}

/** The view of a camera for {@link heroFocusDepth}. */
export interface FocusView {
  /** The camera position. */
  readonly position: Vec3;
  /** The point that the camera looks at. */
  readonly target: Vec3;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
  /** The width of the frame divided by its height. */
  readonly aspect: number;
}

/**
 * Gives the view depth of a point, and tells if the point is in the frame of a camera.
 *
 * @param view The camera.
 * @param point The point.
 * @returns The depth along the view axis, in meters, or `null` for a point out of the frame.
 */
function depthInFrame(view: FocusView, point: Vec3): number | null {
  const { position: c, target: t } = view;
  let fx = t[0] - c[0];
  let fy = t[1] - c[1];
  let fz = t[2] - c[2];
  const length = Math.hypot(fx, fy, fz);
  if (length <= 0) {
    return null;
  }
  fx /= length;
  fy /= length;
  fz /= length;
  // The right axis is level, as the camera of a shot has no roll: forward × up. Up is right ×
  // forward.
  const flat = Math.hypot(fx, fz) || 1;
  const rx = -fz / flat;
  const rz = fx / flat;
  const ux = -fy * rz;
  const uy = rz * fx - rx * fz;
  const uz = fy * rx;
  const dx = point[0] - c[0];
  const dy = point[1] - c[1];
  const dz = point[2] - c[2];
  const depth = dx * fx + dy * fy + dz * fz;
  const tanV = Math.tan((view.fov * Math.PI) / 360);
  const tanH = tanV * view.aspect;
  const inside =
    depth > 0 &&
    Math.abs(dx * rx + dz * rz) <= depth * tanH &&
    Math.abs(dx * ux + dy * uy + dz * uz) <= depth * tanV;
  return inside ? depth : null;
}

/**
 * Gives the view depth of the focus on the hero of a shot (design 4.5, 5.6), as a focus puller
 * focuses on the eye nearer to the camera:
 *
 * 1. The nearer eye, when it is in the frame and the front of the head turns toward the camera
 *    ({@link EYE_FOCUS}).
 * 2. Else, out of a detail insert, the middle of the head when it is in the frame: a head seen
 *    from behind, or a body with no eye facts.
 * 3. Else `null`: the focus stays on the point that the camera looks at, such as the detail of an
 *    insert.
 *
 * The front of the head goes from the middle of the head to the middle of the eyes, so the rule
 * reads only the eye places of the body.
 *
 * @param view The camera of the frame.
 * @param hero The posed head of the hero.
 * @param detail True in a detail insert.
 * @returns The view depth, in meters, or `null`.
 */
export function heroFocusDepth(view: FocusView, hero: HeroHead, detail: boolean): number | null {
  const { eyeL, eyeR, head } = hero;
  const c = view.position;
  const near = Math.hypot(eyeL[0] - c[0], eyeL[1] - c[1], eyeL[2] - c[2]);
  const far = Math.hypot(eyeR[0] - c[0], eyeR[1] - c[1], eyeR[2] - c[2]);
  const eye = near <= far ? eyeL : eyeR;
  const fx = (eyeL[0] + eyeR[0]) / 2 - head[0];
  const fy = (eyeL[1] + eyeR[1]) / 2 - head[1];
  const fz = (eyeL[2] + eyeR[2]) / 2 - head[2];
  const front = Math.hypot(fx, fy, fz);
  if (front >= EYE_FOCUS.eyeOffset) {
    const tx = c[0] - eye[0];
    const ty = c[1] - eye[1];
    const tz = c[2] - eye[2];
    const toCamera = Math.hypot(tx, ty, tz) || 1;
    const facing = (fx * tx + fy * ty + fz * tz) / (front * toCamera);
    const depth = facing >= EYE_FOCUS.facing ? depthInFrame(view, eye) : null;
    if (depth !== null) {
      return depth;
    }
  }
  return detail ? null : depthInFrame(view, head);
}

/**
 * The lens of Free mode (design 4.5). The user turns and zooms the view and looks at any part of
 * the stage, so the focus follows the middle of the frame, and the image keeps more of the stage
 * sharp than a shot of the film.
 */
export const FREE_LENS = {
  /**
   * The part of the aperture of {@link apertureAt} in Free mode. At the near limit of 25° in
   * Boulanger, the focus is on the stage top behind the conductor, 6.7 m away. With the full
   * aperture, the hall wall 25 m away gets a disc of 13 px at the height 900 px, and the head of
   * the conductor 3 m away gets 7 px. With 0.25, they get 3 px and 5 px, and the zoomed view is
   * still too blurry. With 0, Free mode has no depth of field.
   */
  apertureShare: 0,
  /**
   * The radius of the column of a player around the middle of its head, in meters. The view axis
   * finds the first player in its way with these columns.
   */
  radius: 0.3,
  /**
   * The time constant of the move of the focus to a new distance, in milliseconds. A drag moves
   * the middle of the frame from a player to the floor behind it, and the focus follows in about
   * 0.3 s, so the blur does not flicker. With reduced motion, the focus moves at once.
   */
  glideMs: 80,
} as const;

/** The place of one player for the focus of Free mode: a column from the stage top to its head. */
export interface FocusSpot {
  /** The x of the middle of the head, in meters. */
  readonly x: number;
  /** The z of the middle of the head, in meters. */
  readonly z: number;
  /** The height of the middle of the head above the stage top, in meters. */
  readonly top: number;
}

/**
 * Gives the distance at which a ray first meets the column of a player: a vertical cylinder with
 * the radius {@link FREE_LENS}.radius, from the stage top to the head, and a flat top.
 *
 * @param position The start of the ray.
 * @param step The unit vector of the ray.
 * @param spot The player.
 * @returns The distance, or `Infinity` when the ray does not meet the column.
 */
function columnHit(position: Vec3, step: Vec3, spot: FocusSpot): number {
  const r = FREE_LENS.radius;
  const top = spot.top + r;
  const dx = position[0] - spot.x;
  const dz = position[2] - spot.z;
  let best = Infinity;

  // The flat top: a camera above the heads looks down at it.
  if (step[1] < 0 && position[1] > top) {
    const t = (top - position[1]) / step[1];
    if (Math.hypot(dx + step[0] * t, dz + step[2] * t) <= r) {
      best = t;
    }
  }

  // The side of the cylinder: the nearer root of |d + t × step| = r in the plane of the stage.
  const a = step[0] * step[0] + step[2] * step[2];
  const b = dx * step[0] + dz * step[2];
  const c = dx * dx + dz * dz - r * r;
  const root = b * b - a * c;
  if (a > 0 && root >= 0) {
    const t = (-b - Math.sqrt(root)) / a;
    const y = position[1] + step[1] * t;
    if (t > 0 && y >= 0 && y <= top) {
      best = Math.min(best, t);
    }
  }
  return best;
}

/**
 * Calculates the focus distance of Free mode (design 4.5): the distance along the view axis to
 * the first thing in the middle of the frame. The view axis goes from the camera through the
 * orbit target. It can meet the column of a player, or the stage top in the stage square. When
 * it meets neither before the target, the focus is the target.
 *
 * @param position The camera position.
 * @param target The orbit target.
 * @param stageSide The stage side `S`, in meters.
 * @param spots The players and the conductor.
 * @returns The distance, in meters.
 */
export function freeFocusDistance(
  position: Vec3,
  target: Vec3,
  stageSide: number,
  spots: readonly FocusSpot[],
): number {
  const length = Math.hypot(
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  );
  if (length <= 0) {
    return 0;
  }
  const step: Vec3 = [
    (target[0] - position[0]) / length,
    (target[1] - position[1]) / length,
    (target[2] - position[2]) / length,
  ];

  let hit = length;
  if (step[1] < 0 && position[1] > 0) {
    const t = -position[1] / step[1];
    const half = stageSide / 2;
    const x = position[0] + step[0] * t;
    const z = position[2] + step[2] * t;
    if (Math.abs(x) <= half && Math.abs(z) <= half) {
      hit = Math.min(hit, t);
    }
  }
  for (const spot of spots) {
    hit = Math.min(hit, columnHit(position, step, spot));
  }
  return hit;
}

/**
 * Calculates the focus of a frame of Free mode (design 4.5). The aperture comes from the
 * distance to the orbit target, as in {@link focusOf}, times {@link FREE_LENS}.apertureShare.
 * Thus the default view stays sharp, and a near camera keeps the middle of the frame sharp.
 *
 * @param orbitDistance The distance from the camera to the orbit target, in meters.
 * @param focusDistance The focus distance, from {@link freeFocusDistance}, in meters.
 * @param fovDegrees The vertical field of view, in degrees.
 * @param far The far plane, in meters.
 * @param stageSide The stage side `S`, in meters.
 * @returns The focus.
 */
export function freeFocusOf(
  orbitDistance: number,
  focusDistance: number,
  fovDegrees: number,
  far: number,
  stageSide: number,
): Focus {
  const distance = Math.max(0.1, focusDistance);
  const aperture = apertureAt(orbitDistance, stageSide) * FREE_LENS.apertureShare;
  const scale = blurScale(distance, fovDegrees, aperture);
  return { distance, scale, active: blurAt(far, distance, scale) > LENS.sharpBlur };
}
