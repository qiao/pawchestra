import { Vector3 } from 'three';

import type { MeshData } from './mesh.ts';
import { boneIndex } from './rig.ts';
import type { BoneName } from './rig.ts';
import type { Vec3 } from './tuples.ts';

/** The number of angle bins of a slice of a body part. */
const SLICE_BINS = 24;

/** The height step of the slices of a body part, in head heights. */
const SLICE_STEP = 0.04;

/** The bones of the body that the arms keep clear of (design 4.4). */
const SLICE_BONES: readonly BoneName[] = [
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
export interface BodyPart {
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

/** The body of the clearance rules of the arms (design 4.4), one time for each body. */
export interface SliceBody {
  /** One part for each bone of {@link SLICE_BONES} with enough corners. */
  readonly parts: readonly BodyPart[];
}

/**
 * Gives the different corners of some bones of a mesh in the bind pose.
 *
 * @param mesh The mesh in the bind pose.
 * @param bone The bone.
 * @returns The corners.
 */
export function boneCorners(mesh: MeshData, bone: number): Vec3[] {
  const { positions, bones } = mesh;
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
 * Makes the body of the clearance rules of the arms (design 4.4), one time for each body.
 *
 * @param mesh The mesh in the bind pose.
 * @param h The head height `H`, in meters.
 * @returns The body.
 */
export function sliceBody(mesh: MeshData, h: number): SliceBody {
  const parts: BodyPart[] = [];
  for (const name of SLICE_BONES) {
    const bone = boneIndex(name);
    const part = bodyPart(bone, boneCorners(mesh, bone), h);
    if (part) {
      parts.push(part);
    }
  }
  return { parts };
}

/**
 * Gives the depth of a point in one body part, in the bind axes of the part, and the direction out
 * of the part.
 *
 * @param part The part.
 * @param local The point, moved into the bind pose of the bone of the part.
 * @param out The vector to write with the direction out, in the bind axes. It does not change when
 *   the point is above or below the part.
 * @returns The depth, in meters, or `-Infinity` when the point is above or below the part.
 */
export function bindDepth(part: BodyPart, local: Vector3, out: Vector3): number {
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
    out.set(dx / distance, 0, dz / distance);
  } else {
    out.set(0, 0, -1);
  }
  return depth;
}
