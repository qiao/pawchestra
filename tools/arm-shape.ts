/**
 * Measures the form of the arm skin of the studio body of a role (design 4.4): the twist, the
 * collapse, and the spikes, which the fold count of `pnpm fold-probe` does not see. It poses the
 * body as the app does, over each demo of the role, in the sample sets of `pnpm fold-probe`.
 *
 * For each arm, the tool takes four rings of bind vertices around the bone axis
 * ({@link ARM_RINGS}): at the shoulder, the middle of the upper arm, and the elbow of the upper
 * arm, and the middle of the forearm.
 *
 * - The roll of a ring is the mean turn of its vertices around the posed bone axis, against a
 *   frame with no roll: the chest for the upper arm, and the upper arm for the forearm. The twist
 *   of a sample is the largest change of the roll from the chest to the shoulder ring, and from
 *   one ring of the upper arm to the next. A skin that twists like a wrung cloth gives a large
 *   twist.
 * - The collapse of a ring is the mean distance of its vertices from the posed bone axis, as a share
 *   of the bind value: 1 is a round arm, and 0.5 an arm squeezed to half. The flat share is the
 *   same share of the narrowest axis of the ring. A sample gives the smallest share of its rings.
 * - A spike is a face of the shoulder or the armpit whose longest edge grows by more than
 *   {@link SPIKE_GROWTH} from the bind pose.
 *
 * Each sample set prints the median and the worst 5% of each value for each side, and the folds of
 * `pnpm fold-probe`. `--rings` adds the median roll and collapse of each ring. Each `--set`
 * changes the holds in memory, as `pnpm fold-probe --set` does, and `--glb <file>` gives the role
 * the studio body of the file. `--json <file>` writes the values of the table. `--body
 * <key>=<value>` sets a rule of the studio body of the role in memory, such as `upperTwist=0.5`
 * (`StudioBody`), as a variant with no change of the body module.
 *
 * Usage: pnpm arm-shape <role> [--demo <id>]... [--step <seconds>] [--set <changes>]...
 * [--body <key>=<value>]... [--rings] [--glb <file>] [--json <file>]
 */
import { writeFile } from 'node:fs/promises';

import { Matrix4, Quaternion, Vector3 } from 'three';

import { FOLD_ROLES, SAMPLE_SETS, probeFolds, roleAnimal, roleSpecies } from './fold-probe.ts';
import type { FoldReport, SampleSet } from './fold-probe.ts';
import { runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { patchedDemos } from './patch-demos.ts';
import { SPECIES } from '../src/models/species.ts';
import type { SpeciesParams } from '../src/models/species.ts';
import { studioBodyOf } from '../src/models/studio-body.ts';
import type { StudioBodyName } from '../src/models/studio-body.ts';
import { STUDIO_BONES } from '../src/models/studio-format.ts';
import { sideSegmentBones } from './arm-segments.ts';
import type { Side, StudioBody, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import { UPPER_TWIST_BONES, twistAngle } from '../src/models/studio-rig.ts';
import type { StudioRig } from '../src/models/studio-rig.ts';

/** A ring of the arm skin: the bone of its axis and its place along the bone. */
export interface ArmRing {
  /** The name of the ring. */
  readonly name: 'shoulder' | 'upper' | 'elbow' | 'forearm';
  /** The bone of the axis: the upper arm or the forearm. */
  readonly bone: 'upper' | 'fore';
  /** The place along the bone, from 0 at its head to 1 at the head of the next bone. */
  readonly at: number;
}

/** The rings of each arm, from the shoulder out. */
export const ARM_RINGS: readonly ArmRing[] = [
  { name: 'shoulder', bone: 'upper', at: 0.15 },
  { name: 'upper', bone: 'upper', at: 0.5 },
  { name: 'elbow', bone: 'upper', at: 0.85 },
  { name: 'forearm', bone: 'fore', at: 0.5 },
];

/** The half width of the slab of a ring along its bone, as a share of the bone length. */
export const RING_HALF_WIDTH = 0.08;

/**
 * The smallest weight of a vertex of a ring on the bones of its arm, from the upper arm out. A
 * vertex of the trunk near the shoulder has less.
 */
export const RING_WEIGHT = 0.25;

/**
 * The largest distance of a vertex of a ring from the bind axis, as a factor of the median
 * distance of the vertices of the ring with a weight on the arm of 0.9 or more.
 */
export const RING_REACH = 2;

/** The growth of the longest edge of a face above which the face is a spike. */
export const SPIKE_GROWTH = 1.8;

/**
 * The largest distance of the bind middle of a face of the shoulder or the armpit from the
 * shoulder joint, as a share of the length of the upper arm.
 */
export const SPIKE_REACH = 0.6;

/**
 * The smallest weight of a corner on the upper arm or the clavicle that puts a face in the spike
 * region.
 */
export const SPIKE_WEIGHT = 0.05;

/** The bind facts of one ring of one arm. */
interface RingBind {
  readonly ring: ArmRing;
  /** The two vertices of each edge that crosses the plane of the ring. */
  readonly edges: Uint32Array;
  /** The place of the crossing along each edge, from 0 at its first vertex to 1 at its second. */
  readonly along: Float32Array;
  /** The bind vector of each crossing from the axis, normal to the axis: x, y, z of each one. */
  readonly radial: Float32Array;
  /** The mean length of the bind vectors. */
  readonly mean: number;
  /** The narrowest axis of the bind ring: the root of the smaller principal value. */
  readonly narrow: number;
}

/** The bind facts of one arm. */
interface ArmBind {
  readonly side: Side;
  /** The indices of the arm bones and of the chest in `STUDIO_BONES`. */
  readonly bones: Readonly<Record<'chest' | 'upper' | 'fore' | 'hand', number>>;
  /** The bind heads of the shoulder, the elbow, and the wrist. */
  readonly joints: Readonly<Record<'shoulder' | 'elbow' | 'wrist', Vector3>>;
  readonly rings: readonly RingBind[];
  /** The three vertices of each face of the shoulder and the armpit. */
  readonly corners: Uint32Array;
  /** The bind length of the longest edge of each face of the shoulder and the armpit. */
  readonly edges: Float32Array;
}

/** The values of one arm in one sample. */
export interface ArmSample {
  /** The roll of the upper arm bone against the chest, in degrees. */
  readonly boneRoll: number;
  /** The roll of each ring, in degrees, in the order of {@link ARM_RINGS}. */
  readonly rolls: readonly number[];
  /** The twist: the largest change of the roll along the upper arm, in degrees. */
  readonly twist: number;
  /** The mean distance share of each ring. */
  readonly collapses: readonly number[];
  /** The narrow axis share of each ring. */
  readonly flats: readonly number[];
  /** The number of spikes. */
  readonly spikes: number;
}

/**
 * Gives the index of a bone in `STUDIO_BONES`.
 *
 * @param bone The bone.
 * @returns The index.
 */
function boneAt(bone: StudioBone): number {
  return STUDIO_BONES.indexOf(bone);
}

/**
 * Gives the weight of a vertex on some bones.
 *
 * @param mesh The skin.
 * @param v The vertex.
 * @param bones The indices of the bones.
 * @returns The sum of the weights.
 */
function weightOn(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  v: number,
  bones: readonly number[],
): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    if (bones.includes(mesh.joints[v * 4 + k] ?? -1)) {
      sum += mesh.weights[v * 4 + k] ?? 0;
    }
  }
  return sum;
}

/**
 * Gives the root of the smaller principal value of some vectors in the plane normal to an axis.
 *
 * @param vectors The vectors, x, y, z of each one.
 * @param axis The unit axis.
 * @returns The root, in the units of the vectors.
 */
function narrowAxis(vectors: ArrayLike<number>, axis: Vector3): number {
  const e1 = new Vector3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) {
    e1.set(0, 1, 0);
  }
  e1.addScaledVector(axis, -e1.dot(axis)).normalize();
  const e2 = new Vector3().crossVectors(axis, e1);
  const count = vectors.length / 3;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  let mx = 0;
  let my = 0;
  const p = new Vector3();
  for (let i = 0; i < count; i++) {
    p.fromArray(vectors, i * 3);
    mx += p.dot(e1) / count;
    my += p.dot(e2) / count;
  }
  for (let i = 0; i < count; i++) {
    p.fromArray(vectors, i * 3);
    const a = p.dot(e1) - mx;
    const b = p.dot(e2) - my;
    xx += (a * a) / count;
    yy += (b * b) / count;
    xy += (a * b) / count;
  }
  const half = (xx + yy) / 2;
  const root = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  return Math.sqrt(Math.max(0, half - root));
}

/**
 * Finds the bind facts of one arm: the vertices of each ring and the faces of the shoulder.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @returns The facts.
 */
function armBind(rig: StudioRig, side: Side): ArmBind {
  const { mesh } = rig;
  const h = rig.body.heads;
  const joints = {
    shoulder: new Vector3(...h[`upper_arm_${side}`]),
    elbow: new Vector3(...h[`forearm_${side}`]),
    wrist: new Vector3(...h[`hand_${side}`]),
  };
  const bones = {
    chest: boneAt('chest'),
    upper: boneAt(`upper_arm_${side}`),
    fore: boneAt(`forearm_${side}`),
    hand: boneAt(`hand_${side}`),
  };
  // The twist bone of the upper arm (`StudioBody.upperTwist`) and the arm segments and helpers
  // (`sideSegmentBones()`) hold the arm weight of a body with them, so the rings of such a body
  // take the same vertices as with no such bone.
  const armBones = [
    bones.upper,
    UPPER_TWIST_BONES[side],
    bones.fore,
    boneAt(`forearm_twist_${side}`),
    bones.hand,
    boneAt(`fingers_${side}`),
    ...sideSegmentBones(side).map((bone) => boneAt(bone)),
  ];
  const edgeList = meshEdges(mesh.corners);
  const rings = ARM_RINGS.map((ring) =>
    ringBind(
      mesh,
      edgeList,
      ring,
      ring.bone === 'upper' ? joints.shoulder : joints.elbow,
      ring.bone === 'upper' ? joints.elbow : joints.wrist,
      armBones,
    ),
  );

  const upperLength = joints.elbow.distanceTo(joints.shoulder);
  const faces: number[] = [];
  const edges: number[] = [];
  const corners = [new Vector3(), new Vector3(), new Vector3()] as const;
  for (let f = 0; f < mesh.corners.length / 3; f++) {
    let onUpper = false;
    const middle = new Vector3();
    for (const [k, corner] of corners.entries()) {
      const v = mesh.corners[f * 3 + k] ?? 0;
      corner.fromArray(mesh.positions, v * 3);
      middle.addScaledVector(corner, 1 / 3);
      onUpper ||=
        weightOn(mesh, v, [bones.upper, UPPER_TWIST_BONES[side], boneAt(`clavicle_${side}`)]) >=
        SPIKE_WEIGHT;
    }
    if (onUpper && middle.distanceTo(joints.shoulder) <= SPIKE_REACH * upperLength) {
      faces.push(...mesh.corners.subarray(f * 3, f * 3 + 3));
      edges.push(longestEdge(corners[0], corners[1], corners[2]));
    }
  }
  return {
    side,
    bones,
    joints,
    rings,
    corners: Uint32Array.from(faces),
    edges: Float32Array.from(edges),
  };
}

/**
 * Gives each edge of a mesh one time.
 *
 * @param corners The three vertices of each triangle.
 * @returns The two vertices of each edge, the smaller index first.
 */
function meshEdges(corners: Uint32Array): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let f = 0; f < corners.length / 3; f++) {
    for (let k = 0; k < 3; k++) {
      const a = corners[f * 3 + k] ?? 0;
      const b = corners[f * 3 + ((k + 1) % 3)] ?? 0;
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const key = low * 0x10000 + high;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(low, high);
      }
    }
  }
  return Uint32Array.from(out);
}

/**
 * Finds the bind facts of one ring: the cross section of the skin with the plane of the ring,
 * normal to the bone, as the crossings of the mesh edges. A crossing takes the weights of its
 * edge by its place, and a crossing with too little weight on the arm, or too far from the axis,
 * is part of the trunk ({@link RING_WEIGHT}, {@link RING_REACH}).
 *
 * @param mesh The skin.
 * @param edges The edges of the mesh ({@link meshEdges}).
 * @param ring The ring.
 * @param head The bind head of the bone.
 * @param tail The bind head of the next bone.
 * @param armBones The indices of the bones of the arm, from the upper arm out.
 * @returns The facts.
 */
function ringBind(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights'>,
  edges: Uint32Array,
  ring: ArmRing,
  head: Vector3,
  tail: Vector3,
  armBones: readonly number[],
): RingBind {
  const axis = tail.clone().sub(head);
  const length = axis.length();
  axis.normalize();
  const center = head.clone().addScaledVector(axis, ring.at * length);
  const a = new Vector3();
  const b = new Vector3();
  const found: { i: number; j: number; t: number; r: Vector3; arm: number }[] = [];
  for (let e = 0; e < edges.length; e += 2) {
    const i = edges[e] ?? 0;
    const j = edges[e + 1] ?? 0;
    const si = a
      .fromArray(mesh.positions, i * 3)
      .sub(center)
      .dot(axis);
    const sj = b
      .fromArray(mesh.positions, j * 3)
      .sub(center)
      .dot(axis);
    if (si * sj >= 0) {
      continue;
    }
    const t = si / (si - sj);
    const q = a.lerp(b, t);
    const arm = (1 - t) * weightOn(mesh, i, armBones) + t * weightOn(mesh, j, armBones);
    if (arm >= RING_WEIGHT) {
      found.push({ i, j, t, r: q.clone().addScaledVector(axis, -q.dot(axis)), arm });
    }
  }
  const core = found.filter((f) => f.arm >= 0.5);
  const sorted = (core.length > 0 ? core : found)
    .map((f) => f.r.length())
    .toSorted((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const kept = found.filter((f) => f.r.length() <= RING_REACH * median);
  const radial = new Float32Array(kept.length * 3);
  for (const [k, f] of kept.entries()) {
    f.r.toArray(radial, k * 3);
  }
  return {
    ring,
    edges: Uint32Array.from(kept.flatMap((f) => [f.i, f.j])),
    along: Float32Array.from(kept.map((f) => f.t)),
    radial,
    mean: kept.reduce((sum, f) => sum + f.r.length(), 0) / Math.max(1, kept.length),
    narrow: narrowAxis(radial, axis),
  };
}

/**
 * Gives the longest edge of a triangle.
 *
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @returns The length.
 */
function longestEdge(a: Vector3, b: Vector3, c: Vector3): number {
  return Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
}

/** The bind facts of the arms of each rig. */
const binds = new WeakMap<StudioRig, Readonly<Record<Side, ArmBind>>>();

/**
 * Gives the bind facts of both arms of a rig, made one time for each rig.
 *
 * @param rig The rig.
 * @returns The facts of each side.
 */
export function armBinds(rig: StudioRig): Readonly<Record<Side, ArmBind>> {
  let found = binds.get(rig);
  if (!found) {
    found = { L: armBind(rig, 'L'), R: armBind(rig, 'R') };
    binds.set(rig, found);
  }
  return found;
}

/**
 * Gives the turn of a bone from the skin matrices of a pose.
 *
 * @param matrices The skin matrices.
 * @param bone The index of the bone.
 * @returns The turn.
 */
function turnOf(matrices: ArrayLike<number>, bone: number): Quaternion {
  return new Quaternion().setFromRotationMatrix(matrixOf(matrices, bone));
}

/**
 * Gives the skin matrix of a bone.
 *
 * @param matrices The skin matrices.
 * @param bone The index of the bone.
 * @returns The matrix.
 */
function matrixOf(matrices: ArrayLike<number>, bone: number): Matrix4 {
  return new Matrix4().fromArray(
    Array.from({ length: 16 }, (...[, k]) => matrices[bone * 16 + k] ?? 0),
  );
}

/**
 * Wraps an angle into -180° to 180°.
 *
 * @param degrees The angle.
 * @returns The wrapped angle.
 */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * Measures one arm of a posed body.
 *
 * @param arm The bind facts of the arm.
 * @param matrices The skin matrices of the pose.
 * @param posed The posed places of the vertices.
 * @returns The values.
 */
export function measureArm(
  arm: ArmBind,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
): ArmSample {
  const chest = turnOf(matrices, arm.bones.chest);
  const upperTurn = turnOf(matrices, arm.bones.upper);
  const place = (joint: Vector3, bone: number): Vector3 =>
    joint.clone().applyMatrix4(matrixOf(matrices, bone));
  const shoulder = place(arm.joints.shoulder, arm.bones.upper);
  const elbow = place(arm.joints.elbow, arm.bones.fore);
  const wrist = place(arm.joints.wrist, arm.bones.hand);
  const upperBind = arm.joints.elbow.clone().sub(arm.joints.shoulder).normalize();
  const foreBind = arm.joints.wrist.clone().sub(arm.joints.elbow).normalize();
  const upperAxis = elbow.clone().sub(shoulder).normalize();
  const foreAxis = wrist.clone().sub(elbow).normalize();

  // The frames with no roll: the chest swung onto the upper arm, and the upper arm swung onto the
  // forearm.
  const upperFrame = new Quaternion()
    .setFromUnitVectors(upperBind.clone().applyQuaternion(chest), upperAxis)
    .multiply(chest);
  const foreFrame = new Quaternion()
    .setFromUnitVectors(foreBind.clone().applyQuaternion(upperTurn), foreAxis)
    .multiply(upperTurn);
  const boneRoll =
    (twistAngle(upperFrame.clone().invert().multiply(upperTurn), upperBind) * 180) / Math.PI;

  const rolls: number[] = [];
  const collapses: number[] = [];
  const flats: number[] = [];
  const p = new Vector3();
  const q = new Vector3();
  const r = new Vector3();
  const ref = new Vector3();
  for (const ring of arm.rings) {
    const upper = ring.ring.bone === 'upper';
    const frame = upper ? upperFrame : foreFrame;
    const axis = upper ? upperAxis : foreAxis;
    const origin = upper ? shoulder : elbow;
    const count = ring.along.length;
    const moved = new Float32Array(count * 3);
    let sin = 0;
    let cos = 0;
    let total = 0;
    for (let k = 0; k < count; k++) {
      const t = ring.along[k] ?? 0;
      p.fromArray(posed, (ring.edges[k * 2] ?? 0) * 3)
        .lerp(q.fromArray(posed, (ring.edges[k * 2 + 1] ?? 0) * 3), t)
        .sub(origin);
      r.copy(p).addScaledVector(axis, -p.dot(axis));
      r.toArray(moved, k * 3);
      total += r.length();
      ref.fromArray(ring.radial, k * 3).applyQuaternion(frame);
      const weight = ref.length();
      const angle = Math.atan2(new Vector3().crossVectors(ref, r).dot(axis), ref.dot(r));
      sin += weight * Math.sin(angle);
      cos += weight * Math.cos(angle);
    }
    rolls.push(count > 0 ? (Math.atan2(sin, cos) * 180) / Math.PI : 0);
    collapses.push(count > 0 && ring.mean > 0 ? total / count / ring.mean : 1);
    flats.push(ring.narrow > 0 ? narrowAxis(moved, axis) / ring.narrow : 1);
  }

  const stations = [0, ...rolls.slice(0, 3)];
  let twist = 0;
  for (let i = 1; i < stations.length; i++) {
    twist = Math.max(twist, Math.abs(wrap((stations[i] ?? 0) - (stations[i - 1] ?? 0))));
  }

  let spikes = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < arm.edges.length; i++) {
    a.fromArray(posed, (arm.corners[i * 3] ?? 0) * 3);
    b.fromArray(posed, (arm.corners[i * 3 + 1] ?? 0) * 3);
    c.fromArray(posed, (arm.corners[i * 3 + 2] ?? 0) * 3);
    if (longestEdge(a, b, c) > SPIKE_GROWTH * (arm.edges[i] ?? Infinity)) {
      spikes += 1;
    }
  }
  return { boneRoll, rolls, twist, collapses, flats, spikes };
}

/** The samples of one side in one sample set. */
interface SideSamples {
  readonly samples: ArmSample[];
}

/** The samples of a role, by the sample set and the side. */
export type ArmSamples = Readonly<Record<SampleSet, Readonly<Record<Side, SideSamples>>>>;

/**
 * Makes an empty store of samples.
 *
 * @returns The store.
 */
function emptySamples(): ArmSamples {
  const sides = (): Readonly<Record<Side, SideSamples>> => ({
    L: { samples: [] },
    R: { samples: [] },
  });
  return { rest: sides(), play: sides(), lift: sides() };
}

/**
 * Gives a quantile of some values.
 *
 * @param values The values.
 * @param share The share, from 0 to 1.
 * @returns The value at the share of the sorted values, or `NaN` with no value.
 */
export function quantile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? Number.NaN;
}

/** The summary of the samples of one side in one sample set. */
export interface ArmSummary {
  readonly samples: number;
  /** The median roll of the upper arm bone, in degrees. */
  readonly boneRoll: number;
  /** The median and the 95th percentile of the twist, in degrees. */
  readonly twist: readonly [number, number];
  /** The median and the 5th percentile of the smallest collapse share of the rings. */
  readonly collapse: readonly [number, number];
  /** The median and the 5th percentile of the smallest flat share of the rings. */
  readonly flat: readonly [number, number];
  /** The mean and the largest number of spikes. */
  readonly spikes: readonly [number, number];
  /** The median roll, collapse, and flat share of each ring. */
  readonly rings: readonly { roll: number; collapse: number; flat: number }[];
}

/**
 * Sums up the samples of one side in one sample set.
 *
 * @param samples The samples.
 * @returns The summary.
 */
export function summarize(samples: readonly ArmSample[]): ArmSummary {
  const twists = samples.map((s) => s.twist);
  const collapses = samples.map((s) => Math.min(...s.collapses));
  const flats = samples.map((s) => Math.min(...s.flats));
  const spikes = samples.map((s) => s.spikes);
  return {
    samples: samples.length,
    boneRoll: quantile(
      samples.map((s) => s.boneRoll),
      0.5,
    ),
    twist: [quantile(twists, 0.5), quantile(twists, 0.95)],
    collapse: [quantile(collapses, 0.5), quantile(collapses, 0.05)],
    flat: [quantile(flats, 0.5), quantile(flats, 0.05)],
    spikes: [
      spikes.reduce((sum, n) => sum + n, 0) / Math.max(1, spikes.length),
      Math.max(0, ...spikes),
    ],
    rings: ARM_RINGS.map((_, i) => ({
      roll: quantile(
        samples.map((s) => s.rolls[i] ?? 0),
        0.5,
      ),
      collapse: quantile(
        samples.map((s) => s.collapses[i] ?? 1),
        0.5,
      ),
      flat: quantile(
        samples.map((s) => s.flats[i] ?? 1),
        0.5,
      ),
    })),
  };
}

/** The report of a role: the arm samples and the folds of `pnpm fold-probe`. */
export interface ArmReport {
  readonly samples: ArmSamples;
  readonly folds: FoldReport;
}

/**
 * Measures the arm skin of the studio body of a role over demos, in the samples of
 * `probeFolds()` of `tools/fold-probe.ts`.
 *
 * @param role The name of a role of `FOLD_ROLES`.
 * @param demos The demos.
 * @param step The step of the song time of the play, in seconds.
 * @returns The report.
 * @throws Error for an unknown role.
 */
export async function probeArms(
  role: string,
  demos: Awaited<ReturnType<typeof patchedDemos>>,
  step: number,
): Promise<ArmReport> {
  const source = FOLD_ROLES.get(role);
  if (!source) {
    throw new Error(`No role has the name ${role}.`);
  }
  const samples = emptySamples();
  const folds = probeFolds(source, demos, step, (rig, studio, posed, _folded, set) => {
    const arms = armBinds(rig);
    for (const side of ['L', 'R'] as const) {
      samples[set][side].samples.push(measureArm(arms[side], studio.matrices, posed));
    }
  });
  return { samples, folds };
}

/**
 * Writes a value with a fixed number of digits.
 *
 * @param value The value.
 * @param digits The digits after the point.
 * @returns The text.
 */
function fixed(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

/**
 * Writes a report as lines: one row for each sample set and side.
 *
 * @param role The name of the role.
 * @param report The report.
 * @param rings True to add the median values of each ring.
 * @returns The lines.
 */
export function armLines(role: string, report: ArmReport, rings: boolean): string[] {
  const lines = [
    `Arm skin of ${role} over ${report.folds.demos.length} demos: twist and roll in degrees, collapse and flat as shares of the bind, spikes of the shoulder and the armpit (edge growth > ${SPIKE_GROWTH}).`,
    '',
    '| Set | Side | Samples | Bone roll | Twist p50 / p95 | Collapse p50 / p5 | Flat p50 / p5 | Spikes mean / max | Folds |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const set of SAMPLE_SETS) {
    const count = report.folds.sets[set];
    const folds = count.samples > 0 ? `${fixed((100 * count.withFold) / count.samples, 1)}%` : '-';
    for (const side of ['L', 'R'] as const) {
      const s = summarize(report.samples[set][side].samples);
      lines.push(
        `| ${set} | ${side} | ${s.samples} | ${fixed(s.boneRoll, 0)} | ${fixed(s.twist[0], 0)} / ${fixed(s.twist[1], 0)} | ${fixed(s.collapse[0], 2)} / ${fixed(s.collapse[1], 2)} | ${fixed(s.flat[0], 2)} / ${fixed(s.flat[1], 2)} | ${fixed(s.spikes[0], 1)} / ${s.spikes[1]} | ${folds} |`,
      );
    }
  }
  if (rings) {
    lines.push(
      '',
      `Median of each ring (roll / collapse / flat): ${ARM_RINGS.map((r) => r.name).join(', ')}.`,
      '',
      `| Set | Side | ${ARM_RINGS.map((r) => r.name).join(' | ')} |`,
      `|---|---|${ARM_RINGS.map(() => '---').join('|')}|`,
    );
    for (const set of SAMPLE_SETS) {
      for (const side of ['L', 'R'] as const) {
        const s = summarize(report.samples[set][side].samples);
        const cells = s.rings.map(
          (r) => `${fixed(r.roll, 0)} / ${fixed(r.collapse, 2)} / ${fixed(r.flat, 2)}`,
        );
        lines.push(`| ${set} | ${side} | ${cells.join(' | ')} |`);
      }
    }
  }
  return lines;
}

/**
 * Gives the values of the table of a report for `--json`.
 *
 * @param report The report.
 * @returns The JSON text.
 */
export function armJson(report: ArmReport): string {
  const sets = Object.fromEntries(
    SAMPLE_SETS.map((set) => {
      const count = report.folds.sets[set];
      return [
        set,
        {
          folds: count.samples > 0 ? count.withFold / count.samples : null,
          L: summarize(report.samples[set].L.samples),
          R: summarize(report.samples[set].R.samples),
        },
      ];
    }),
  );
  return `${JSON.stringify({ demos: report.folds.demos, sets }, null, 1)}\n`;
}

/** The rules of a studio body that `--body` can set in memory, with the parse of each value. */
const BODY_RULES: Readonly<Partial<Record<keyof StudioBody, (text: string) => string | number>>> = {
  upperTwist: (text) => {
    const share = Number(text);
    if (!(share >= 0 && share <= 1)) {
      throw new Error(`The rule upperTwist takes a share from 0 to 1, and not "${text}".`);
    }
    return share;
  },
};

/**
 * Sets rules of the studio bodies of a role in memory (`--body <key>=<value>`).
 *
 * @param bodies The studio bodies of the role.
 * @param rules The rules, such as `upperTwist=0.5`.
 * @returns A function that puts the old values back.
 * @throws Error for an unknown rule or a wrong value.
 */
export function setBodyRules(
  bodies: readonly StudioBodyName[],
  rules: readonly string[],
): () => void {
  const undo: (() => void)[] = [];
  for (const rule of rules) {
    const [key = '', text = ''] = rule.split('=');
    const parse = Object.entries(BODY_RULES).find(([k]) => k === key)?.[1];
    if (!parse) {
      throw new Error(
        `The rule ${key} is not a body rule of --body: ${Object.keys(BODY_RULES).join(', ')}.`,
      );
    }
    const value = parse(text);
    for (const name of bodies) {
      const body = studioBodyOf(name);
      const had = Object.hasOwn(body, key);
      const old: unknown = Object.entries(body).find(([k]) => k === key)?.[1];
      Reflect.set(body, key, value);
      undo.push(() => (had ? Reflect.set(body, key, old) : Reflect.deleteProperty(body, key)));
    }
  }
  return () => {
    for (const step of undo.toReversed()) {
      step();
    }
  };
}

/**
 * Gives the studio bodies of the species of a role.
 *
 * @param role The name of a role of `FOLD_ROLES`.
 * @returns The names of the bodies.
 */
function roleBodyNames(role: string): StudioBodyName[] {
  const source = FOLD_ROLES.get(role);
  const names = (source ? roleSpecies(source) : []).flatMap((species) => {
    const params: SpeciesParams = SPECIES[species];
    return params.body ? [params.body] : [];
  });
  return [...new Set(names)];
}

/**
 * Runs the tool from the command line. With `--glb <file>`, the role gets the studio body that
 * the export makes from the file, in a copy of `src/` (`tools/glb-swap.ts`).
 */
async function main(): Promise<void> {
  const { glb, rest: args } = takeGlb(process.argv.slice(2));
  const role = args[0] ?? '';
  const source = FOLD_ROLES.get(role);
  if (!source) {
    throw new Error(
      `Usage: pnpm arm-shape <role> [--demo <id>]... [--step <seconds>] [--set <changes>]... [--body <key>=<value>]... [--rings] [--glb <file>] [--json <file>], with a role of: ${[...FOLD_ROLES.keys()].join(', ')}.`,
    );
  }
  if (glb) {
    process.exitCode = await withGlbBody(roleAnimal(source), glb, (dir) =>
      runTool(dir, 'arm-shape.ts', args),
    );
    return;
  }
  const chosen = args.flatMap((arg, i) =>
    args[i - 1] === '--demo' ? [arg.endsWith('.mid') ? arg : `${arg}.mid`] : [],
  );
  const stepAt = args.indexOf('--step');
  const step = stepAt >= 0 ? Number(args[stepAt + 1]) : 0.25;
  if (!(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const jsonAt = args.indexOf('--json');
  const json = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  if (jsonAt >= 0 && (!json || json.startsWith('--'))) {
    throw new Error('The option --json takes a file.');
  }

  const all = await patchedDemos();
  const unknown = chosen.filter((file) => !all.some((demo) => demo.file === file));
  if (unknown.length > 0) {
    throw new Error(`No demo has the name ${unknown.join(', ')}.`);
  }
  const demos = chosen.length > 0 ? all.filter((demo) => chosen.includes(demo.file)) : all;
  const holds = args.flatMap((arg, i) => (args[i - 1] === '--set' ? [arg] : [])).join(';');
  const changes = holds ? setHolds(holds) : null;
  const rules = args.flatMap((arg, i) => (args[i - 1] === '--body' ? [arg] : []));
  const undoRules = setBodyRules(roleBodyNames(role), rules);
  let report: ArmReport;
  try {
    report = await probeArms(role, demos, step);
  } finally {
    undoRules();
    changes?.undo();
  }
  if (rules.length > 0) {
    console.log(`Body rules: ${rules.join(', ')}`);
  }
  if (changes) {
    console.log(`Hold changes: ${changes.text}`);
  }
  console.log(armLines(role, report, args.includes('--rings')).join('\n'));
  if (json) {
    await writeFile(json, armJson(report));
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
