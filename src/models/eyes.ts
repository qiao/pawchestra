import { Matrix4, Quaternion, Vector3 } from 'three';
import { toQuat, toVec3 } from './tuples.ts';
import type { Vec3 } from './tuples.ts';
import { applyTransform, transform } from './mesh.ts';
import type { MeshBuilder, Rgb, Transform } from './mesh.ts';
import { ball } from './primitives.ts';

/** A point on the surface of the head, and the unit normal of the surface there. */
export interface SurfacePoint {
  /** The point. */
  readonly point: Vec3;
  /** The unit normal of the surface at the point. */
  readonly normal: Vec3;
}

/** The size of an eye on x, y, and z, in H (design 4.5). */
export const EYE = [0.13, 0.18, 0.06] as const;

/**
 * The number of faces around the long axis of an eye. The lathe of `ball()` turns around the long
 * axis, so these faces give the shading steps across the front of the oval.
 */
const EYE_SEGMENTS = 16;

/**
 * The number of steps of an eye from its bottom point to its top point. These steps give the
 * outline of the oval in the front view: 4 steps showed the corners of an octagon in a close view.
 */
const EYE_RINGS = 8;

/** The number of faces around the axis of the light, and the steps of its outline. */
const LIGHT_BALL = [12, 6] as const;

/** The diameter of the white light on an eye, in H. */
const EYE_LIGHT = 0.04;

/** The height of the light above the middle of the eye, in H. */
const EYE_LIGHT_UP = 0.035;

/** The depth of the light on a bent eye, in H: a thin disc that lies flat on the oval. */
const EYE_LIGHT_DEPTH = 0.008;

/**
 * The place of the light of each eye to the +x side of the visible middle of the eye, in H. With
 * it, both lights show on the upper left of each eye seen from the front, as the reflection of one
 * lamp does on two real eyes. The eyes face to the sides, so a light in the middle of each oval
 * shows on the outer side of each eye, and the two lights point away from each other.
 */
const EYE_LIGHT_SIDE = 0.02;

/** The largest place of the light across the oval from its middle, in H, so it stays on the oval. */
const EYE_LIGHT_ACROSS = 0.04;

/** The colors of an eye, in linear values. */
export interface EyeColors {
  /** The black oval. */
  readonly eye: Rgb;
  /** The small white light on the oval. */
  readonly eyeLight: Rgb;
}

/**
 * The bend of an eye: the move of each point of the oval along the axis of the eye, as a function
 * of its place `u` (across) and `v` (up) in the plane of the eye, from the middle:
 * `k0 u + k1 v + k2 u² + k3 u v + k4 v²`. The places and the move are in `H`. A body bends
 * each eye to the form of its head surface, so that the rim of the oval lies in the fur (design
 * 4.5, `BodyEyes.bends` of `models/body-format.ts`).
 */
export type EyeBend = readonly [u: number, v: number, uu: number, uv: number, vv: number];

/**
 * Gives the move of a bend at a place in the plane of an eye.
 *
 * @param bend The bend.
 * @param u The place across the eye, from the middle, in `H`.
 * @param v The place up the eye, from the middle, in `H`.
 * @returns The move along the axis of the eye, in `H`.
 */
function bendAt(bend: EyeBend, u: number, v: number): number {
  return bend[0] * u + bend[1] * v + bend[2] * u * u + bend[3] * u * v + bend[4] * v * v;
}

/**
 * Gives the depth of the front of the oval in front of its middle, at a place on the oval.
 *
 * @param u The place across the oval, from the middle, in `H`.
 * @param v The place up the oval, from the middle, in `H`.
 * @returns The depth along the axis of the eye, in `H`.
 */
function frontDepth(u: number, v: number): number {
  const across = u / (0.5 * EYE[0]);
  const share = v / (0.5 * EYE[1]);
  return 0.5 * EYE[2] * Math.sqrt(Math.max(0, 1 - across * across - share * share));
}

/**
 * The share of the move of the light to the inner side of each eye, toward the visible middle of
 * the eye in the front view ({@link lightAcross}). The cheek covers a part of the outer side of an
 * eye that faces to the side, so the visible middle lies on the inner side. The full move put the
 * light of one eye of the bear in the middle and the other on the left, and no move did the
 * opposite on the pig, so the move is half the depth.
 */
const EYE_LIGHT_INNER = 0.5;

/** The steps of the scan of {@link lightAcross} on each side of the middle of the oval. */
const LIGHT_SCAN = 130;

/**
 * Gives the place of the light across an eye: the place at which the light, on the front of the
 * oval, stands {@link EYE_LIGHT_SIDE} to the +x side of the visible middle of the eye, seen from
 * the front. The other eye of the head is about the mirror image of the eye. When the light of one
 * of the two eyes cannot go that far and stay on its oval ({@link EYE_LIGHT_ACROSS}), both lights
 * move less to the side, so that they stand at one place on the two eyes.
 *
 * @param across The axis across the eye.
 * @param n The axis of the eye.
 * @param front The depth of the front of the oval at a place across the oval, in `H`, at the
 *   height of the light.
 * @param lift The move of the light to +x from its height up the oval, in `H`.
 * @returns The place across the oval, from the middle, in `H`.
 */
function lightAcross(
  across: Vector3,
  n: Vector3,
  front: (u: number) => number,
  lift: number,
): number {
  // An eye that faces fully to the side has no place for the light to the right of its middle.
  if (Math.abs(across.x) < 0.2) {
    return 0;
  }
  // The place for a move to the side, on this eye (1) or on its mirror image (-1). The mirror
  // image has the same axis across on x, the mirror of the axis of the eye, and the depth of
  // this eye at the opposite place. The place is the step of a scan across the oval whose light
  // stands nearest to the target, because the depth can change faster than the place.
  const place = (side: number, mirror: 1 | -1): number => {
    const nx = mirror * n.x;
    const depth = (u: number): number => front(mirror * u);
    const target = -EYE_LIGHT_INNER * nx * depth(0) + side - mirror * lift;
    let best = 0;
    let miss = Infinity;
    for (let step = -LIGHT_SCAN; step <= LIGHT_SCAN; step++) {
      const u = (step / LIGHT_SCAN) * 0.5 * EYE[0];
      const off = Math.abs(u * across.x + nx * depth(u) - target);
      if (off < miss) {
        miss = off;
        best = u;
      }
    }
    return best;
  };
  let side = EYE_LIGHT_SIDE;
  for (
    let step = 0;
    step < 10 && Math.max(Math.abs(place(side, 1)), Math.abs(place(side, -1))) > EYE_LIGHT_ACROSS;
    step++
  ) {
    side *= 0.8;
  }
  return Math.min(EYE_LIGHT_ACROSS, Math.max(-EYE_LIGHT_ACROSS, place(side, 1)));
}

/**
 * Bends the corners of the unit ball of an eye along its z axis, the axis of the eye.
 *
 * @param corners The corners of the ball of radius 0.5, 9 numbers for each triangle.
 * @param bend The move along the axis at a place across and up the oval, in `H`.
 * @returns The bent corners, in the units of the ball before its scale to the size of the eye.
 */
function bentBall(corners: readonly number[], bend: (u: number, v: number) => number): number[] {
  const out = [...corners];
  for (let c = 0; c < out.length; c += 3) {
    const u = (out[c] ?? 0) * EYE[0];
    const v = (out[c + 1] ?? 0) * EYE[1];
    out[c + 2] = (out[c + 2] ?? 0) + bend(u, v) / EYE[2];
  }
  return out;
}

/** The axes of an eye, in the axes of the head. */
export interface EyeAxes {
  /** The axis across the oval: its short axis. */
  readonly across: Vector3;
  /** The axis up the oval: its long axis. */
  readonly up: Vector3;
  /** The axis of the eye: the thin axis of the oval, the direction in which the eye faces. */
  readonly n: Vector3;
}

/**
 * Gives the axes of an eye that faces a direction: its long axis points up along the plane of the
 * eye.
 *
 * @param normal The unit direction in which the eye faces.
 * @returns The axes.
 */
export function eyeAxes(normal: Vec3): EyeAxes {
  const n = new Vector3(...normal);
  const up = new Vector3(0, 1, 0).projectOnPlane(n).normalize();
  const across = new Vector3().crossVectors(up, n);
  return { across, up, n };
}

/** The largest turn of an oval in its plane by {@link uprightRoll}, in radians (35°). */
const EYE_ROLL_LIMIT = (35 * Math.PI) / 180;

/**
 * Gives the lean of the long axis of an oval in the front view, from the vertical, in radians: the
 * axis of the image of the oval under the linear part of its bend. A positive lean puts the top on
 * the +x side.
 *
 * @param across The axis across the oval, with the bend along the eye axis for each unit across.
 * @param up The axis up the oval, with the bend along the eye axis for each unit up.
 * @returns The lean.
 */
function frontLean(across: Vector3, up: Vector3): number {
  const a2 = (0.5 * EYE[0]) ** 2;
  const b2 = (0.5 * EYE[1]) ** 2;
  const xx = across.x * across.x * a2 + up.x * up.x * b2;
  const yy = across.y * across.y * a2 + up.y * up.y * b2;
  const xy = across.x * across.y * a2 + up.x * up.y * b2;
  return 0.5 * Math.atan2(2 * xy, yy - xx);
}

/**
 * Finds the turn of an oval in its plane that makes it upright in the front view. An eye that
 * faces up and to the side, or a bend on a sloped cheek, leans the long axis of the oval: the tops
 * of the two ovals of the rhino leaned 22° toward each other, a sad look. The turn cancels the lean
 * of the linear part of the bend ({@link frontLean}), up to {@link EYE_ROLL_LIMIT}.
 *
 * @param axes The axes of the eye.
 * @param bend The bend of the oval in these axes.
 * @returns The turn from `up` toward `-across`, in radians.
 */
function uprightRoll(axes: EyeAxes, bend: EyeBend): number {
  const across = axes.across.clone().addScaledVector(axes.n, bend[0]);
  const up = axes.up.clone().addScaledVector(axes.n, bend[1]);
  const lean = (roll: number): number => {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    return frontLean(
      across.clone().multiplyScalar(c).addScaledVector(up, s),
      up.clone().multiplyScalar(c).addScaledVector(across, -s),
    );
  };
  // The lean changes about as fast as the turn, so a few Newton steps reach the root.
  let roll = 0;
  const d = 1e-4;
  for (let step = 0; step < 6; step++) {
    const slope = (lean(roll + d) - lean(roll - d)) / (2 * d);
    if (Math.abs(slope) < 1e-6) {
      break;
    }
    roll = Math.min(EYE_ROLL_LIMIT, Math.max(-EYE_ROLL_LIMIT, roll - lean(roll) / slope));
  }
  return roll;
}

/** The axes of an upright oval on the head, and its bend in these axes. */
interface OvalFrame extends EyeAxes {
  /** The move of the oval along its axis at a place across and up the oval, in `H`. */
  readonly bend: (u: number, v: number) => number;
}

/**
 * Gives the axes of the oval of an eye: the axes of the eye ({@link eyeAxes}), turned in the plane
 * of the eye so that the oval is upright in the front view ({@link uprightRoll}). The bend keeps
 * its fit in the axes of the eye.
 *
 * @param normal The unit direction in which the eye faces.
 * @param bend The bend of the oval, or none for a flat face.
 * @param upright False for no turn.
 * @returns The axes and the bend in these axes.
 */
function ovalFrame(normal: Vec3, bend: EyeBend | undefined, upright = true): OvalFrame {
  const axes = eyeAxes(normal);
  const k = bend ?? [0, 0, 0, 0, 0];
  const roll = upright ? uprightRoll(axes, k) : 0;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return {
    across: axes.across.clone().multiplyScalar(c).addScaledVector(axes.up, s),
    up: axes.up.clone().multiplyScalar(c).addScaledVector(axes.across, -s),
    n: axes.n,
    bend: (u, v) => bendAt(k, u * c - v * s, u * s + v * c),
  };
}

/**
 * Gives the transform of the unit ball of an eye: the scale to the size of the oval, the turn
 * onto the axes of the oval, and the move to its middle.
 *
 * @param point The middle of the eye.
 * @param frame The axes of the oval.
 * @param h The head height that sizes the eye, in meters.
 * @returns The transform.
 */
function ovalTransform(point: Vec3, frame: OvalFrame, h: number): Transform {
  const onFace = toQuat(
    new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(frame.across, frame.up, frame.n),
    ),
  );
  return transform(point, onFace, [EYE[0] * h, EYE[1] * h, EYE[2] * h]);
}

/** The number of faces around the long axis and of steps up an oval, for {@link ovalCorners}. */
export type OvalFaces = readonly [segments: number, rings: number];

/** A corner of the oval of an eye, in the axes of the head. */
export interface OvalCorner {
  /** The corner, with the bend of the oval. */
  readonly point: Vec3;
  /** The depth of the corner in front of the middle of the eye before the bend, in meters. */
  readonly depth: number;
}

/**
 * Gives the corners of the oval of an eye, 3 for each triangle, as {@link addEye} places them.
 *
 * @param eye The middle of the eye and the direction in which it faces.
 * @param h The head height that sizes the eye, in meters.
 * @param bend The bend of the oval, or none for a flat face.
 * @param faces The faces around the long axis and the steps up the oval.
 * @param upright True for the oval of the app, upright in the front view ({@link uprightRoll}).
 *   False keeps the long axis on the up axis of the eye ({@link eyeAxes}).
 * @returns The corners.
 */
export function ovalCorners(
  eye: SurfacePoint,
  h: number,
  bend: EyeBend | undefined,
  faces: OvalFaces,
  upright: boolean,
): OvalCorner[] {
  const frame = ovalFrame(eye.normal, bend, upright);
  const at = ovalTransform(eye.point, frame, h);
  const oval = ball(0.5, ...faces);
  const bent = bend ? bentBall(oval, frame.bend) : oval;
  const corners: OvalCorner[] = [];
  for (let c = 0; c < oval.length; c += 3) {
    corners.push({
      point: applyTransform(at, [bent[c] ?? 0, bent[c + 1] ?? 0, bent[c + 2] ?? 0]),
      depth: (oval[c + 2] ?? 0) * EYE[2] * h,
    });
  }
  return corners;
}

/**
 * Adds one eye on an eye bone: a black upright oval of 0.13 × 0.18 H, with a wet finish and a
 * small white light above the middle, as the eyes of the polished images. The thin axis of the
 * oval is the normal of the head surface, and its long axis points up along the surface, turned in
 * the plane of the eye so that the oval is upright in the front view ({@link ovalFrame}). The light
 * follows the eye bone, so it closes with the eye. A bend moves each point of the oval along the
 * axis, so that the oval follows a curved or a sloped head surface, and the light of a bent eye
 * lies on the front of the oval.
 *
 * @param builder The mesh that gets the parts.
 * @param colors The colors of the eye.
 * @param eye The middle of the eye and the normal of the head surface there.
 * @param h The head height that sizes the eye, in meters.
 * @param bone The eye bone.
 * @param bend The bend of the oval, or none for a flat face.
 */
export function addEye(
  builder: MeshBuilder,
  colors: EyeColors,
  eye: SurfacePoint,
  h: number,
  bone: number,
  bend?: EyeBend,
): void {
  const { point, normal } = eye;
  // The oval lies on the face: its thin axis is the normal of the surface, and its long axis
  // points up along the surface, upright in the front view.
  const frame = ovalFrame(normal, bend);
  const { across, n } = frame;
  const oval = ball(0.5, EYE_SEGMENTS, EYE_RINGS);
  builder.add(bend ? bentBall(oval, frame.bend) : oval, {
    color: colors.eye,
    bone,
    at: ovalTransform(point, frame, h),
    finish: 'lacquer',
  });

  if (bend) {
    addBentLight(builder, colors, point, frame, h, bone);
    return;
  }
  const u = lightAcross(across, n, () => 0.5 * EYE[2], 0);
  const light = new Vector3(...point)
    .addScaledVector(n, 0.5 * EYE[2] * h)
    .addScaledVector(across, u * h)
    .add(new Vector3(0, EYE_LIGHT_UP * h, 0));
  builder.add(ball(0.5, ...LIGHT_BALL), {
    color: colors.eyeLight,
    bone,
    at: transform(toVec3(light), undefined, [EYE_LIGHT * h, EYE_LIGHT * h, 0.5 * EYE_LIGHT * h]),
    finish: 'lacquer',
  });
}

/**
 * Adds the light of a bent eye: a thin disc on the front of the oval, 0.035 H up the oval from the
 * middle and to the right of the middle seen from the front ({@link lightAcross}), so that it
 * stays on an oval that faces up or to the side. The disc lies flat on the front of the bent oval
 * there, so that it stands only half its depth out of the oval in each view.
 *
 * @param builder The mesh that gets the light.
 * @param colors The colors of the eye.
 * @param point The middle of the eye.
 * @param frame The axes of the oval and its bend.
 * @param h The head height that sizes the eye, in meters.
 * @param bone The eye bone.
 */
function addBentLight(
  builder: MeshBuilder,
  colors: EyeColors,
  point: Vec3,
  frame: OvalFrame,
  h: number,
  bone: number,
): void {
  const { across, up, n } = frame;
  const v = EYE_LIGHT_UP;
  const front = (u: number, at: number): number => frontDepth(u, at) + frame.bend(u, at);
  const u = lightAcross(across, n, (place) => front(place, v), v * up.x);
  const d = 1e-4;
  // The slopes of the front of the bent oval at the light, along the axes of the eye.
  const slopeU = (front(u + d, v) - front(u - d, v)) / (2 * d);
  const slopeV = (front(u, v + d) - front(u, v - d)) / (2 * d);
  const facing = new Vector3()
    .addScaledVector(across, -slopeU)
    .addScaledVector(up, -slopeV)
    .add(n)
    .normalize();
  const discUp = up.clone().projectOnPlane(facing).normalize();
  const discAcross = new Vector3().crossVectors(discUp, facing);
  const onOval = toQuat(
    new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(discAcross, discUp, facing)),
  );
  const light = new Vector3(...point)
    .addScaledVector(up, v * h)
    .addScaledVector(across, u * h)
    .addScaledVector(n, front(u, v) * h);
  builder.add(ball(0.5, ...LIGHT_BALL), {
    color: colors.eyeLight,
    bone,
    at: transform(toVec3(light), onOval, [EYE_LIGHT * h, EYE_LIGHT * h, EYE_LIGHT_DEPTH * h]),
    finish: 'lacquer',
  });
}
