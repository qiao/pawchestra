import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName, Skeleton } from '../models/rig.ts';
import { toQuat } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { chainFrames, createFrame, posePoint } from './frames.ts';
import type { Frame } from './frames.ts';
import { hangingArm } from './hang.ts';
import { armRig, solveArm } from './ik.ts';

/**
 * The angles of the line from the shoulder to the wrist of a source arm from straight down, in
 * radians, over which the hanging arm rule of a clip fades out (design 4.4). Up to `full`, the
 * arm moves from the rest arm of the body. From `none` on, it takes the plain retarget. Reason:
 * the arms of the walk of the test clips swing to 23° from straight down, so a walk stays in the
 * full rule with a margin. A clap reaches forward at 79° or more, and a T-pose holds 90°, so these
 * keep the plain retarget.
 */
export const HANG_FADE = { full: 30 * MathUtils.DEG2RAD, none: 60 * MathUtils.DEG2RAD } as const;

/** The rest arm of one side of a body: the world turns of its bones from the bind pose. */
export interface RestArm {
  readonly upper: Quat;
  readonly forearm: Quat;
  readonly hand: Quat;
}

/**
 * Gives the rest arm of a standing body (design 5.2): the arm of `hangingArm()`, solved as the
 * concert solves it, from the bind pose of the shoulder.
 *
 * @param model The player model.
 * @param side The side of the body.
 * @returns The world turns of the upper arm, the forearm, and the hand.
 */
export function restArm(model: PlayerModel, side: 'L' | 'R'): RestArm {
  const arm = armRig(model, side);
  const hang = hangingArm(model, arm);
  const shoulder = new Vector3(...arm.bind.shoulder);
  const wrist = new Vector3(...hang.wrist).add(shoulder);
  const pose = solveArm(arm.bind, shoulder, new Quaternion(), wrist, new Vector3(...hang.pole));
  return { upper: toQuat(pose.upper), forearm: toQuat(pose.lower), hand: hang.hand };
}

/** The unit down direction. */
const DOWN = new Vector3(0, -1, 0);

const reach = new Vector3();

/**
 * Gives the share of the hanging arm rule for a source arm: 1 for an arm that hangs, 0 for an arm
 * that rises past {@link HANG_FADE}, with a smooth step between.
 *
 * @param shoulder The source shoulder joint, in the model axes.
 * @param wrist The source wrist, in the model axes.
 * @returns The share, from 0 to 1.
 */
export function hangShare(shoulder: Vector3, wrist: Vector3): number {
  const angle = reach.subVectors(wrist, shoulder).angleTo(DOWN);
  return 1 - MathUtils.smoothstep(angle, HANG_FADE.full, HANG_FADE.none);
}

/** The number of angle bins of a slice of a body part. */
const SLICE_BINS = 24;

/** The height step of the slices of a body part, in head heights. */
const SLICE_STEP = 0.04;

/**
 * The share of the upper arm, from the shoulder joint, whose corners the clearance rule does not
 * test. The root of the arm lies in the shoulder, inside the trunk, in each pose.
 */
const ROOT_SHARE = 0.4;

/** The largest number of test points of one arm bone. */
const ARM_POINTS = 32;

/**
 * The space that the clearance rule leaves between an arm and the body, in head heights. The body
 * parts are slices through the corners, and a face between two corners lies a little inside.
 */
const CLEAR_GAP = 0.005;

/** The largest number of turns of one arm in one frame. */
const CLEAR_STEPS = 12;

/** The largest turn of one step, in radians. */
const CLEAR_TURN = 20 * MathUtils.DEG2RAD;

/** The bones of the body that the arms of a clip keep clear of. */
const BODY_BONES: readonly BoneName[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'jaw',
  'earL',
  'earR',
  'trunk1',
  'trunk2',
  'trunk3',
  'tail1',
  'tail2',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
];

/**
 * One part of the body: horizontal slices through the corners of one bone in the bind pose. Each
 * slice has a middle, and the largest distance of the corners from it in each of
 * {@link SLICE_BINS} angle bins.
 */
interface BodyPart {
  readonly bone: number;
  /** The height of the first slice, in the bind pose. */
  readonly bottom: number;
  /** The height step between two slices. */
  readonly step: number;
  /** The number of slices: 2 or more. */
  readonly slices: number;
  /** The x and the z of the middle of each slice. */
  readonly middles: Float32Array;
  /** The distance of each angle bin of each slice from its middle. */
  readonly radii: Float32Array;
  /** The middle of a sphere around the part, in the bind pose. */
  readonly center: Vec3;
  /** The radius of the sphere. */
  readonly radius: number;
}

/** A test point of an arm: a corner of an arm bone in the bind pose. */
interface ArmPoint {
  readonly bone: number;
  readonly point: Vec3;
}

/** The body parts and the arm points of the clearance rule of a clip, one time for each body. */
export interface ClipBody {
  readonly parts: readonly BodyPart[];
  readonly armL: readonly ArmPoint[];
  readonly armR: readonly ArmPoint[];
  /** The head height `H`, in meters. */
  readonly headHeight: number;
}

/**
 * Gives the different corners of some bones of a mesh in the bind pose.
 *
 * @param model The player model.
 * @param bone The bone.
 * @returns The corners.
 */
function boneCorners(model: PlayerModel, bone: number): Vec3[] {
  const { positions, bones } = model.mesh;
  const seen = new Set<string>();
  const out: Vec3[] = [];
  for (let c = 0; c < bones.length; c++) {
    if (bones[c] !== bone) {
      continue;
    }
    const point: Vec3 = [
      positions[c * 3] ?? 0,
      positions[c * 3 + 1] ?? 0,
      positions[c * 3 + 2] ?? 0,
    ];
    const key = point.join(' ');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(point);
    }
  }
  return out;
}

/**
 * Fills each empty angle bin of a slice with a linear blend of the nearest full bins.
 *
 * @param radii The bins of one slice. An empty bin is negative.
 */
function fillBins(radii: Float32Array): void {
  const full = [...radii.keys()].filter((b) => (radii[b] ?? -1) >= 0);
  if (full.length === 0) {
    radii.fill(0);
    return;
  }
  const copy = radii.slice();
  for (let b = 0; b < SLICE_BINS; b++) {
    if ((copy[b] ?? -1) >= 0) {
      continue;
    }
    const before = full.findLast((f) => f < b) ?? (full.at(-1) ?? 0) - SLICE_BINS;
    const after = full.find((f) => f > b) ?? (full[0] ?? 0) + SLICE_BINS;
    const t = (b - before) / (after - before);
    const a = copy[(before + SLICE_BINS) % SLICE_BINS] ?? 0;
    radii[b] = a + ((copy[after % SLICE_BINS] ?? 0) - a) * t;
  }
}

/**
 * Makes the slices of one bone.
 *
 * @param bone The bone.
 * @param corners The corners of the bone in the bind pose.
 * @param h The head height.
 * @returns The part, or `null` for a bone with too few corners.
 */
function bodyPart(bone: number, corners: readonly Vec3[], h: number): BodyPart | null {
  if (corners.length < 4) {
    return null;
  }
  const ys = corners.map((p) => p[1]);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const slices = Math.max(2, Math.ceil((top - bottom) / (SLICE_STEP * h)) + 1);
  const step = Math.max((top - bottom) / (slices - 1), 1e-6);
  const middles = new Float32Array(slices * 2);
  const radii = new Float32Array(slices * SLICE_BINS);

  for (let s = 0; s < slices; s++) {
    const y = bottom + s * step;
    const band = corners.filter((p) => Math.abs(p[1] - y) <= step);
    const xs = band.map((p) => p[0]);
    const zs = band.map((p) => p[2]);
    const mx = band.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const mz = band.length > 0 ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    middles.set([mx, mz], s * 2);
    const bins = radii.subarray(s * SLICE_BINS, (s + 1) * SLICE_BINS);
    bins.fill(-1);
    for (const [x, , z] of band) {
      const turn = Math.atan2(z - mz, x - mx) / (2 * Math.PI);
      const b = Math.round((turn - Math.floor(turn)) * SLICE_BINS) % SLICE_BINS;
      bins[b] = Math.max(bins[b] ?? -1, Math.hypot(x - mx, z - mz));
    }
    fillBins(bins);
  }

  const center = new Vector3();
  for (const p of corners) {
    center.add(new Vector3(...p));
  }
  center.divideScalar(corners.length);
  const radius = Math.max(...corners.map((p) => center.distanceTo(new Vector3(...p))));
  return {
    bone,
    bottom,
    step,
    slices,
    middles,
    radii,
    center: [center.x, center.y, center.z],
    radius,
  };
}

/**
 * Picks the test points of one arm: the corners of the upper arm past {@link ROOT_SHARE} of its
 * length, of the forearm, of the hand, and of the fingers, at most {@link ARM_POINTS} of each bone.
 *
 * @param model The player model.
 * @param side The side.
 * @returns The points.
 */
function armPoints(model: PlayerModel, side: 'L' | 'R'): ArmPoint[] {
  const shoulder = model.skeleton.positions[boneIndex(`upperArm${side}`)] ?? [0, 0, 0];
  const elbow = model.skeleton.positions[boneIndex(`forearm${side}`)] ?? [0, 0, 0];
  const along = new Vector3(...elbow).sub(new Vector3(...shoulder));
  const length = along.length();
  along.normalize();
  const out: ArmPoint[] = [];
  const names: readonly BoneName[] = [
    `upperArm${side}`,
    `forearm${side}`,
    `hand${side}`,
    `fingers${side}`,
  ];
  for (const name of names) {
    const bone = boneIndex(name);
    const corners = boneCorners(model, bone).filter(
      (p) =>
        bone !== boneIndex(`upperArm${side}`) ||
        new Vector3(...p).sub(new Vector3(...shoulder)).dot(along) > ROOT_SHARE * length,
    );
    const stride = Math.max(1, Math.ceil(corners.length / ARM_POINTS));
    for (let k = 0; k < corners.length; k += stride) {
      const point = corners[k];
      if (point) {
        out.push({ bone, point });
      }
    }
  }
  return out;
}

/**
 * Makes the body of the clearance rule of a clip (design 4.4), one time for each body.
 *
 * @param model The player model.
 * @returns The body parts and the arm points.
 */
export function clipBody(model: PlayerModel): ClipBody {
  const h = model.body.headHeight;
  const parts: BodyPart[] = [];
  for (const name of BODY_BONES) {
    const bone = boneIndex(name);
    const part = bodyPart(bone, boneCorners(model, bone), h);
    if (part) {
      parts.push(part);
    }
  }
  return { parts, armL: armPoints(model, 'L'), armR: armPoints(model, 'R'), headHeight: h };
}

/** The deepest point of an arm in the body. */
interface Contact {
  /** The depth, in meters. Negative when the arm is clear. */
  depth: number;
  /** The posed point of the arm. */
  readonly point: Vector3;
  /** The unit direction out of the body, in the model axes. */
  readonly normal: Vector3;
}

const local = new Vector3();
const posed = new Vector3();
const center = new Vector3();
const inverse = new Quaternion();

/**
 * Gives the depth of a posed point in one body part, and the direction out of the part.
 *
 * @param part The part.
 * @param frame The posed frame of its bone.
 * @param bind The bind position of its bone.
 * @param point The posed point.
 * @param normal The vector to write with the direction out, in the model axes.
 * @returns The depth, in meters, or `-Infinity` when the point is above or below the part.
 */
function partDepth(
  part: BodyPart,
  frame: Frame,
  bind: Vec3,
  point: Vector3,
  normal: Vector3,
): number {
  inverse.copy(frame.rotation).invert();
  local.subVectors(point, frame.position).applyQuaternion(inverse);
  local.x += bind[0];
  local.y += bind[1];
  local.z += bind[2];
  const at = (local.y - part.bottom) / part.step;
  if (at < 0 || at > part.slices - 1) {
    return -Infinity;
  }
  const s0 = Math.min(Math.floor(at), part.slices - 2);
  const t = at - s0;
  const mix = (a: number, b: number, u: number): number => a + (b - a) * u;
  const mx = mix(part.middles[s0 * 2] ?? 0, part.middles[s0 * 2 + 2] ?? 0, t);
  const mz = mix(part.middles[s0 * 2 + 1] ?? 0, part.middles[s0 * 2 + 3] ?? 0, t);
  const dx = local.x - mx;
  const dz = local.z - mz;
  const distance = Math.hypot(dx, dz);
  const turn = Math.atan2(dz, dx) / (2 * Math.PI);
  const bin = (turn - Math.floor(turn)) * SLICE_BINS;
  const b0 = Math.floor(bin) % SLICE_BINS;
  const b1 = (b0 + 1) % SLICE_BINS;
  const u = bin - Math.floor(bin);
  const radius = (s: number): number =>
    mix(part.radii[s * SLICE_BINS + b0] ?? 0, part.radii[s * SLICE_BINS + b1] ?? 0, u);
  const depth = mix(radius(s0), radius(s0 + 1), t) - distance;
  if (distance > 1e-9) {
    normal.set(dx / distance, 0, dz / distance).applyQuaternion(frame.rotation);
  } else {
    normal.set(0, 0, -1).applyQuaternion(frame.rotation);
  }
  return depth;
}

const normal = new Vector3();

/**
 * Finds the deepest point of an arm in the body.
 *
 * @param body The body.
 * @param points The points of the arm.
 * @param skeleton The skeleton.
 * @param frames The posed frames.
 * @param out The contact to write.
 * @returns `out`.
 */
function deepest(
  body: ClipBody,
  points: readonly ArmPoint[],
  skeleton: Skeleton,
  frames: readonly Frame[],
  out: Contact,
): Contact {
  out.depth = -Infinity;
  for (const { bone, point } of points) {
    const frame = frames[bone];
    if (!frame) {
      continue;
    }
    posePoint(frame, skeleton.positions[bone] ?? [0, 0, 0], point, posed);
    for (const part of body.parts) {
      const partFrame = frames[part.bone];
      const bind = skeleton.positions[part.bone] ?? [0, 0, 0];
      if (!partFrame) {
        continue;
      }
      posePoint(partFrame, bind, part.center, center);
      if (center.distanceTo(posed) > part.radius) {
        continue;
      }
      const depth = partDepth(part, partFrame, bind, posed, normal);
      if (depth > out.depth) {
        out.depth = depth;
        out.point.copy(posed);
        out.normal.copy(normal);
      }
    }
  }
  return out;
}

const contact: Contact = { depth: 0, point: new Vector3(), normal: new Vector3() };
const parentInverse = new Quaternion();
const axis = new Vector3();
const arm = new Vector3();
const turn = new Quaternion();
const world = new Quaternion();

/**
 * Turns each arm of a pose out of the body (design 4.4): while a point of the arm lies in a part
 * of the body, the upper arm turns about the shoulder joint by the smallest turn that moves that
 * point out by its depth and {@link CLEAR_GAP}, at most {@link CLEAR_STEPS} times. The forearm
 * and the paw keep their turns from the upper arm, so the motion of a clip keeps its form: a wave
 * still waves beside the head.
 *
 * @param body The body.
 * @param skeleton The skeleton.
 * @param rotations The rotations of the pose, relative to the parents. The tool writes the upper
 *   arms.
 * @param frames The frames to write, one for each bone.
 * @returns The largest depth of an arm that remains, in meters.
 */
export function clearArms(
  body: ClipBody,
  skeleton: Skeleton,
  rotations: Float32Array,
  frames: readonly Frame[],
): number {
  let remains = 0;
  for (const side of ['L', 'R'] as const) {
    const points = side === 'L' ? body.armL : body.armR;
    const upper = boneIndex(`upperArm${side}`);
    const parent = skeleton.parents[upper] ?? -1;
    for (let step = 0; step <= CLEAR_STEPS; step++) {
      chainFrames(skeleton, rotations, frames);
      deepest(body, points, skeleton, frames, contact);
      if (contact.depth <= 0 || step === CLEAR_STEPS) {
        remains = Math.max(remains, contact.depth);
        break;
      }
      const shoulder = frames[upper]?.position ?? new Vector3();
      arm.subVectors(contact.point, shoulder);
      axis.crossVectors(arm, contact.normal);
      const lever = axis.length();
      if (lever < 1e-6) {
        remains = Math.max(remains, contact.depth);
        break;
      }
      const angle = Math.min((contact.depth + CLEAR_GAP * body.headHeight) / lever, CLEAR_TURN);
      turn.setFromAxisAngle(axis.divideScalar(lever), angle);
      parentInverse.identity();
      if (frames[parent]) {
        parentInverse.copy(frames[parent].rotation).invert();
      }
      world
        .copy(frames[upper]?.rotation ?? world)
        .premultiply(turn)
        .premultiply(parentInverse);
      world.toArray(rotations, upper * 4);
    }
  }
  return remains;
}

/**
 * Makes the frames for {@link clearArms}.
 *
 * @param skeleton The skeleton.
 * @returns One frame for each bone.
 */
export function clearFrames(skeleton: Skeleton): Frame[] {
  return skeleton.parents.map(() => createFrame());
}
