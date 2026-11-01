import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

import type { MeshData } from '../models/mesh.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName, Skeleton } from '../models/rig.ts';
import type { SourceClip, SourceFile, SourceTrack } from '../models/source-clips.ts';
import type { Vec3 } from '../models/tuples.ts';
import { chainFrames, createFrame, posePoint } from './frames.ts';
import { MIXAMO_BONES, isMixamoBone, mixamoDrivers } from './mixamo-bones.ts';

/** The frames for each second of a retargeted clip. Mixamo gives its clips at 30 frames. */
export const CLIP_RATE = 30;

/**
 * The height of an adult in head heights, the canon of figure drawing. The source skeleton has no
 * chin, so its head height `H` is its height over this number.
 */
export const HUMAN_HEADS = 7.5;

/**
 * The share of the mean bend of the four long fingers, over their three joints, that the
 * `fingers` block of the player turns. A fist bends each finger by about 230° over its joints,
 * and the block then turns about 90°, as a closed paw does.
 */
export const FINGER_CURL_SHARE = 0.4;

/** The smallest and the largest curl of the fingers of a clip, in radians. */
const CURL_RANGE = [-20 * MathUtils.DEG2RAD, 100 * MathUtils.DEG2RAD] as const;

/**
 * The bones of the player that keep their bind form at the rest pose of the source. Both rest
 * poses stand upright with the head forward and the feet flat, so these bones need no
 * compensation, and the trunk of each animal keeps its own lean. The limbs get the turn from
 * their bind pose to the rest pose of the source ({@link retargetClip}).
 */
const OWN_FORM: ReadonlySet<BoneName> = new Set([
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'footL',
  'footR',
]);

/** The child of each limb bone of the player that gives its direction. */
const LIMB_CHILD: ReadonlyMap<BoneName, BoneName> = new Map([
  ['shoulderL', 'upperArmL'],
  ['upperArmL', 'forearmL'],
  ['forearmL', 'handL'],
  ['handL', 'fingersL'],
  ['shoulderR', 'upperArmR'],
  ['upperArmR', 'forearmR'],
  ['forearmR', 'handR'],
  ['handR', 'fingersR'],
  ['thighL', 'shinL'],
  ['shinL', 'footL'],
  ['thighR', 'shinR'],
  ['shinR', 'footR'],
]);

/** The source bones of the soles, whose lowest point gives the height of the feet. */
const SOLE_BONES = [
  'LeftFoot',
  'LeftToeBase',
  'LeftToe_End',
  'RightFoot',
  'RightToeBase',
  'RightToe_End',
];

/** The long fingers of a Mixamo hand, which give the curl of the `fingers` block. */
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'] as const;

/** One point of a sole of the player in the bind pose. */
export interface SolePoint {
  /** The foot bone, as an index in `BONE_NAMES`. */
  readonly bone: number;
  /** The point, in the model axes. */
  readonly point: Vec3;
}

/** The body that a clip plays on: the skeleton of the player, its size, and its soles. */
export interface ClipTarget {
  /** The skeleton of the player in its bind pose (design 4.7). */
  readonly skeleton: Skeleton;
  /** The head height `H` of the body, in meters. */
  readonly headHeight: number;
  /** The lowest points of the soles in the bind pose ({@link solePoints}). */
  readonly soles: readonly SolePoint[];
}

/**
 * A clip on the skeleton of a player (design 4.4, 5.1): plain data that the clip layer reads with
 * no state (`clipPoseAt()` of `pose/clip-pose.ts`).
 */
export interface PlayerClip {
  /** The name of the source clip. */
  readonly name: string;
  /** The frames for each second. */
  readonly rate: number;
  /** The number of frames. The first frame is at 0 s, the last at the end of the clip. */
  readonly frames: number;
  /**
   * One quaternion (x, y, z, w) for each bone of `BONE_NAMES` in each frame, relative to the
   * parent bone, as `AnimalPose.rotations`: `frames × BONE_NAMES.length × 4` numbers.
   */
  readonly rotations: Float32Array;
  /** The offset of the root bone in each frame, in meters, in the model axes: `frames × 3`. */
  readonly rootOffsets: Float32Array;
  /**
   * The depth of the lowest sole under the floor in each frame, in head heights, before the floor
   * rule: the depth that a move of the hips in `H` alone gives. Positive is under the floor.
   */
  readonly floorDepths: Float32Array;
}

/**
 * Picks the lowest points of each sole of a bind mesh: of the corners on each foot bone that lie
 * within 1 cm of its lowest corner, the corner furthest to the front, the back, and each side.
 *
 * @param mesh The bind mesh of the player.
 * @returns Up to four points for each foot.
 */
export function solePoints(mesh: MeshData): SolePoint[] {
  const points: SolePoint[] = [];
  for (const bone of [boneIndex('footL'), boneIndex('footR')]) {
    const corners: Vec3[] = [];
    for (let c = 0; c < mesh.bones.length; c++) {
      if (mesh.bones[c] === bone) {
        corners.push([
          mesh.positions[c * 3] ?? 0,
          mesh.positions[c * 3 + 1] ?? 0,
          mesh.positions[c * 3 + 2] ?? 0,
        ]);
      }
    }
    const lowest = Math.min(...corners.map((p) => p[1]));
    const low = corners.filter((p) => p[1] < lowest + 0.01);
    const extremes = [
      (p: Vec3) => p[2],
      (p: Vec3) => -p[2],
      (p: Vec3) => p[0],
      (p: Vec3) => -p[0],
    ].map((key) => low.reduce((best, p) => (key(p) < key(best) ? p : best), low[0] ?? [0, 0, 0]));
    for (const point of new Set(extremes)) {
      points.push({ bone, point });
    }
  }
  return points;
}

/** The two keys of a rotation blend. Each call writes them before it reads them. */
const keyA = new Quaternion();
const keyB = new Quaternion();

/**
 * Gives the value of a track at a time: a linear blend of the translations, a spherical blend of
 * the rotations, or the last key of a step track.
 *
 * @param track The track.
 * @param time The time, in seconds.
 * @param out The 3 or 4 numbers to write.
 */
function sampleTrack(track: SourceTrack, time: number, out: number[]): void {
  const { times, values } = track;
  const size = track.path === 'rotation' ? 4 : 3;
  let hi = 0;
  while (hi < times.length && (times[hi] ?? 0) <= time) {
    hi++;
  }
  const lo = Math.max(0, hi - 1);
  const next = Math.min(hi, times.length - 1);
  const span = (times[next] ?? 0) - (times[lo] ?? 0);
  const t = track.step || span <= 0 ? 0 : (time - (times[lo] ?? 0)) / span;
  if (size === 4) {
    keyA.fromArray(values, lo * 4);
    keyB.fromArray(values, next * 4);
    keyA.slerp(keyB, t).toArray(out);
    return;
  }
  for (let k = 0; k < 3; k++) {
    const a = values[lo * 3 + k] ?? 0;
    out[k] = a + ((values[next * 3 + k] ?? 0) - a) * t;
  }
}

/** The world turns and places of a source skeleton at one time. */
interface SourcePose {
  /** The world rotation of each bone. */
  readonly rotations: readonly Quaternion[];
  /** The world place of each bone. */
  readonly positions: readonly Vector3[];
}

/**
 * Calculates the world turns and places of the bones of a source skeleton at a time of a clip, or
 * in the rest pose.
 *
 * @param file The source file.
 * @param clip The clip, or `null` for the rest pose.
 * @param time The time, in seconds.
 * @returns The pose.
 */
function sourcePose(file: SourceFile, clip: SourceClip | null, time: number): SourcePose {
  const { skeleton } = file;
  const n = skeleton.names.length;
  const t = skeleton.translations.map((v) => [...v]);
  const r = skeleton.rotations.map((q) => [...q]);
  for (const track of clip?.tracks ?? []) {
    sampleTrack(track, time, (track.path === 'rotation' ? r : t)[track.bone] ?? []);
  }

  const base = new Matrix4().fromArray(skeleton.base);
  const worlds: Matrix4[] = [];
  const rotations: Quaternion[] = [];
  const positions: Vector3[] = [];
  const scale = new Vector3();
  for (let i = 0; i < n; i++) {
    const [tx = 0, ty = 0, tz = 0] = t[i] ?? [];
    const [qx = 0, qy = 0, qz = 0, qw = 1] = r[i] ?? [];
    const local = new Matrix4().compose(
      new Vector3(tx, ty, tz),
      new Quaternion(qx, qy, qz, qw).normalize(),
      new Vector3(1, 1, 1),
    );
    const parent = worlds[skeleton.parents[i] ?? -1] ?? base;
    const world = parent.clone().multiply(local);
    worlds.push(world);
    const position = new Vector3();
    const rotation = new Quaternion();
    world.decompose(position, rotation, scale);
    rotations.push(rotation);
    positions.push(position);
  }
  return { rotations, positions };
}

/** The axes of a source skeleton. */
interface SourceAxes {
  /** The turn from the axes of the source to the model axes. */
  readonly turn: Quaternion;
  /** The unit up direction of the source, in its own axes. */
  readonly up: Vector3;
}

/**
 * Gives the turn from the axes of a source file to the model axes of the player: the left side of
 * the source goes to -x, its up to +y, and its front to -z (design 4.4).
 *
 * @param names The names of the source bones.
 * @param rest The rest pose of the source.
 * @returns The turn, and the unit up direction of the source.
 * @throws Error if the source has no hips, legs, or head to read its axes.
 */
function sourceAxes(names: readonly string[], rest: SourcePose): SourceAxes {
  const at = (name: string): Vector3 | undefined => rest.positions[names.indexOf(name)];
  const hips = at('Hips');
  const top = at('Head') ?? at('Neck') ?? at('Spine2');
  const left = at('LeftUpLeg') ?? at('LeftArm');
  const right = at('RightUpLeg') ?? at('RightArm');
  if (!hips || !top || !left || !right) {
    throw new Error('The source skeleton has no hips, head, or left and right legs.');
  }

  const up = top.clone().sub(hips).normalize();
  const side = left.clone().sub(right);
  side.sub(up.clone().multiplyScalar(side.dot(up))).normalize();
  const front = side.clone().cross(up);
  const from = new Matrix4().makeBasis(side, up, front);
  const to = new Matrix4().makeBasis(
    new Vector3(-1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, -1),
  );
  const turn = new Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
  return { turn, up };
}

/**
 * Gives the turn of a limb bone of the player from its bind pose to the rest pose of the source:
 * the shortest turn from the direction of the bone to its child to the direction of the source
 * bone to its children that drive that child, in the model axes. The hanging arm of the player
 * goes to the T-pose of the source, with the palm down, as in the T-pose.
 *
 * @param bone The bone of the player.
 * @param target The body.
 * @param source The index of the source bone that drives it.
 * @param names The names of the source bones.
 * @param parents The parents of the source bones.
 * @param rest The rest pose of the source.
 * @param axes The turn from the source axes to the model axes.
 * @returns The turn, or the identity for a bone that keeps its bind form.
 */
function restTurn(
  bone: BoneName,
  target: ClipTarget,
  source: number,
  names: readonly string[],
  parents: readonly number[],
  rest: SourcePose,
  axes: Quaternion,
): Quaternion {
  const child = LIMB_CHILD.get(bone);
  if (OWN_FORM.has(bone) || !child) {
    return new Quaternion();
  }

  const mean = new Vector3();
  let count = 0;
  for (const [i, name] of names.entries()) {
    if (parents[i] === source && isMixamoBone(name) && MIXAMO_BONES[name] === child) {
      mean.add(rest.positions[i] ?? new Vector3());
      count++;
    }
  }
  if (count === 0) {
    return new Quaternion();
  }
  const sourceDir = mean
    .divideScalar(count)
    .sub(rest.positions[source] ?? new Vector3())
    .normalize()
    .applyQuaternion(axes);
  const positions = target.skeleton.positions;
  const ownDir = new Vector3(...(positions[boneIndex(child)] ?? [0, 0, 0]))
    .sub(new Vector3(...(positions[boneIndex(bone)] ?? [0, 0, 0])))
    .normalize();
  return new Quaternion().setFromUnitVectors(ownDir, sourceDir);
}

/**
 * Gives the unit normal of the palm of one hand of the source in its rest pose, from the knuckles:
 * the index finger lies on the side of the thumb, so the line from the index to the little finger
 * and the line of the hand give the side of the palm. In the T-pose, the palm faces down.
 *
 * @param side `Left` or `Right`.
 * @param names The names of the source bones.
 * @param rest The rest pose of the source.
 * @returns The normal, or the zero vector when the hand has no knuckles.
 */
function palmNormal(side: 'Left' | 'Right', names: readonly string[], rest: SourcePose): Vector3 {
  const at = (name: string): Vector3 | undefined => rest.positions[names.indexOf(`${side}${name}`)];
  const wrist = at('Hand');
  const index = at('HandIndex1');
  const little = at('HandPinky1');
  const middle = at('HandMiddle1');
  if (!wrist || !index || !little || !middle) {
    return new Vector3();
  }
  const along = middle.clone().sub(wrist);
  const across = little.clone().sub(index);
  return side === 'Left' ? across.cross(along).normalize() : along.cross(across).normalize();
}

/**
 * Gives the curl of the fingers of one hand of the source at one time: the mean bend of the four
 * long fingers over their three joints, toward the palm, times {@link FINGER_CURL_SHARE}.
 *
 * @param side `Left` or `Right`.
 * @param names The names of the source bones.
 * @param parents The parents of the source bones.
 * @param rest The rest pose of the source.
 * @param pose The pose of the source.
 * @returns The curl, in radians.
 */
function fingerCurl(
  side: 'Left' | 'Right',
  names: readonly string[],
  parents: readonly number[],
  rest: SourcePose,
  pose: SourcePose,
): number {
  const palm = palmNormal(side, names, rest);
  const delta = (i: number): Quaternion =>
    (pose.rotations[i] ?? new Quaternion())
      .clone()
      .multiply((rest.rotations[i] ?? new Quaternion()).clone().invert());
  let total = 0;
  let fingers = 0;
  for (const finger of FINGERS) {
    let bend = 0;
    let joints = 0;
    for (let k = 1; k <= 3; k++) {
      const i = names.indexOf(`${side}Hand${finger}${k}`);
      const end = names.indexOf(`${side}Hand${finger}${k + 1}`);
      const parent = parents[i] ?? -1;
      if (i < 0 || end < 0 || parent < 0) {
        continue;
      }
      const along = (rest.positions[end] ?? new Vector3())
        .clone()
        .sub(rest.positions[i] ?? new Vector3())
        .normalize();
      const turned = along.clone().applyQuaternion(delta(parent).invert().multiply(delta(i)));
      bend += Math.atan2(turned.dot(palm), turned.dot(along));
      joints++;
    }
    if (joints > 0) {
      total += bend;
      fingers++;
    }
  }
  const curl = fingers > 0 ? (total / fingers) * FINGER_CURL_SHARE : 0;
  return MathUtils.clamp(curl, CURL_RANGE[0], CURL_RANGE[1]);
}

/**
 * Retargets a clip of a Mixamo skeleton onto the skeleton of a player (design 4.4).
 *
 * 1. The axes of the source go to the model axes: its left to -x, its up to +y.
 * 2. Rest compensation: each source bone gives its world turn from its rest pose, D(t). A limb
 *    bone of the player first takes the turn from its bind pose to the rest pose of the source,
 *    A, so its world turn is D(t) A. The trunk, the head, and the feet keep their bind form.
 * 3. Each bone with no source bone follows its parent. The fingers take one curl.
 * 4. The hips move in head heights `H` across the floor. The floor rule then sets the height of
 *    the body: the lowest sole of the player keeps the height of the lowest sole of the source,
 *    in `H`, so a foot on the floor of the source stays on the floor.
 *
 * The rolls of the source bones do not matter, because each step reads world turns.
 *
 * @param file The source file.
 * @param clip A clip of the file.
 * @param target The body.
 * @returns The clip on the player, with {@link CLIP_RATE} frames for each second.
 */
export function retargetClip(file: SourceFile, clip: SourceClip, target: ClipTarget): PlayerClip {
  const { names, parents } = file.skeleton;
  const rest = sourcePose(file, null, 0);
  const { turn: axes, up } = sourceAxes(names, rest);
  const axesInverse = axes.clone().invert();
  const height = (p: Vector3 | undefined): number => (p ? p.dot(up) : Infinity);
  const soleBones = SOLE_BONES.map((name) => names.indexOf(name)).filter((i) => i >= 0);
  const lowest = (pose: SourcePose): number =>
    soleBones.length > 0 ? Math.min(...soleBones.map((i) => height(pose.positions[i]))) : 0;
  const soleRest = lowest(rest);
  const top = Math.max(...rest.positions.map((p) => p.dot(up)));
  const scale = target.headHeight / ((top - soleRest) / HUMAN_HEADS);
  const hips = names.indexOf('Hips');

  const drivers = mixamoDrivers(names);
  const turns = new Map<number, Quaternion>();
  for (const [bone, source] of drivers) {
    turns.set(boneIndex(bone), restTurn(bone, target, source, names, parents, rest, axes));
  }
  const fingers = { L: boneIndex('fingersL'), R: boneIndex('fingersR') } as const;

  const count = BONE_NAMES.length;
  const frames = Math.max(1, Math.floor(clip.duration * CLIP_RATE + 1e-6) + 1);
  const rotations = new Float32Array(frames * count * 4);
  const rootOffsets = new Float32Array(frames * 3);
  const floorDepths = new Float32Array(frames);
  const worlds = BONE_NAMES.map(() => new Quaternion());
  const chain = BONE_NAMES.map(() => createFrame());
  const local = new Quaternion();
  const posed = new Vector3();
  const bindLow = target.soles.length > 0 ? Math.min(...target.soles.map((s) => s.point[1])) : 0;

  for (let f = 0; f < frames; f++) {
    const time = Math.min(f / CLIP_RATE, clip.duration);
    const pose = sourcePose(file, clip, time);
    const out = rotations.subarray(f * count * 4, (f + 1) * count * 4);
    for (let i = 0; i < count; i++) {
      const parent = target.skeleton.parents[i] ?? -1;
      const parentWorld = worlds[parent];
      const world = worlds[i] ?? local;
      const source = drivers.get(BONE_NAMES[i] ?? 'root');
      if (source !== undefined) {
        // D(t) in the model axes: C D C^-1, then the rest compensation A.
        world
          .copy(axes)
          .multiply(pose.rotations[source] ?? local)
          .multiply((rest.rotations[source] ?? local).clone().invert())
          .multiply(axesInverse)
          .multiply(turns.get(i) ?? local);
      } else if (i === fingers.L || i === fingers.R) {
        const side = i === fingers.L ? 'Left' : 'Right';
        const curl = fingerCurl(side, names, parents, rest, pose);
        // A positive curl closes the fingers of each side (`writeCurl()` of `pose/ik.ts`).
        local.setFromAxisAngle(new Vector3(0, 0, 1), side === 'Left' ? curl : -curl);
        world.copy(parentWorld ?? local).multiply(local);
      } else {
        world.copy(parentWorld ?? new Quaternion());
      }
      local
        .copy(parentWorld ?? new Quaternion())
        .invert()
        .multiply(world);
      local.toArray(out, i * 4);
    }

    // The hips move across the floor in H. The floor rule sets the height.
    const move = (pose.positions[hips] ?? new Vector3())
      .clone()
      .sub(rest.positions[hips] ?? new Vector3())
      .applyQuaternion(axes)
      .multiplyScalar(scale);
    chainFrames(target.skeleton, out, chain, [move.x, 0, move.z]);
    let low = Infinity;
    for (const sole of target.soles) {
      const frame = chain[sole.bone];
      if (frame) {
        low = Math.min(
          low,
          posePoint(frame, target.skeleton.positions[sole.bone] ?? [0, 0, 0], sole.point, posed).y,
        );
      }
    }
    const lift = Number.isFinite(low)
      ? bindLow + Math.max(0, lowest(pose) - soleRest) * scale - low
      : 0;
    rootOffsets.set([move.x, lift, move.z], f * 3);
    floorDepths[f] = Number.isFinite(low) ? (bindLow - (low + move.y)) / target.headHeight : 0;
  }
  return { name: clip.name, rate: CLIP_RATE, frames, rotations, rootOffsets, floorDepths };
}
