/**
 * Measures the body form of the first player of a role, for a check of a new body against its old
 * body (`pnpm body-shape <role> --base <ref>`, design 4.4 "Replacing body"). All values are in
 * centimeters, in the axes of the model.
 *
 * The seated bind:
 *
 * - `W<i>`, `D<i>`: the width and the depth of the trunk at 10 heights from the seat top (or from
 *   the hips joint with no seat) to the neck joint, at (i + 0.5) / 10. A horizontal cut of the mesh
 *   gives loops. The trunk loop is the largest loop that holds the point between the spine joints.
 *   The width is its x extent with no arm point, and the depth its z extent with no leg point.
 * - The girths of the upper arm, the forearm, the thigh, and the shin: the perimeter of the convex
 *   hull of a cut square to the bone at its middle, as the mean of the two sides.
 * - The knee gap and the ankle gap: the gap between the inner sides of the legs near the joints.
 * - The distance of the shoulder joints.
 * - The back bulge: the largest distance of the rear outline of the trunk behind the chord from the
 *   waist to the neck, from the side.
 *
 * The first sample of the set `rest`: the paws, the elbows, and the instrument bone against the
 * hips joint, the mouth, the shoulder joints, and the trunk axis (the line from the hips joint to
 * the neck joint), and the back bulge of the posed mesh with the arms.
 *
 * With `--base <ref>`, the commit and the working tree run at the same time, each in a child
 * process (`probeBeside()` of `tools/ref-tree.ts`), and the table gives the ratio commit / tree.
 * A star marks a ratio outside 15 %, or a bulge that differs by more than 1 cm.
 *
 * Usage: pnpm body-shape <role> [--demo <id>] [--base <ref>] [--json <file>]
 */
import { writeFileSync } from 'node:fs';

import { Matrix4, Vector3 } from 'three';

import { roleDemos } from './pose-depth.ts';
import { optionValue, probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { STUDIO_BONES } from '../src/models/studio-format.ts';
import type { StudioMesh } from '../src/models/studio-format.ts';
import {
  createStudioPose,
  poseStudioBones,
  skinStudioMesh,
  studioOffsets,
} from '../src/models/studio-rig.ts';
import type { StudioRig } from '../src/models/studio-rig.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { CLOSED_EYE_SCALE } from '../src/scene/player.ts';
import { poseSkeleton, posedPoint } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { sceneOf } from '../src/pose/test-scene.ts';
import type { RoleSweep, SweepPlayer } from '../src/pose/test-sweep.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';

/** The text of the usage. */
const USAGE = 'Usage: pnpm body-shape <role> [--demo <id>] [--base <ref>] [--json <file>]';

/** The version of the JSON format of `--json`. */
const FORM_FORMAT = 1;

/** The number of heights of the trunk and of the back line. */
const LEVELS = 10;

/** The share of a ratio off 1 that the table marks. */
const RATIO_LIMIT = 0.15;

/** The difference of a back bulge that the table marks, in centimeters. */
const BULGE_LIMIT = 1;

/** One measure. */
interface FormRow {
  /** The name, such as `W3` or `paw L above hips`. */
  readonly name: string;
  /** The value, in centimeters. */
  readonly value: number;
}

/** A point of a cut of the mesh. */
interface CutPoint {
  /** The point in the 2D axes of the cut. */
  readonly flat: readonly [number, number];
  /** The point in 3D. */
  readonly point: Vec3;
  /** The weight of the leg bones. */
  readonly leg: number;
  /** The weight of the arm bones. */
  readonly arm: number;
}

/** A cut of the mesh by a plane: its points and its loops of segments. */
interface MeshCut {
  readonly points: readonly CutPoint[];
  readonly loops: readonly (readonly (readonly [number, number])[])[];
}

/**
 * Gives the indices of the studio bones whose names match a pattern.
 *
 * @param pattern The pattern.
 * @returns The indices.
 */
function boneSet(pattern: RegExp): ReadonlySet<number> {
  const set = new Set<number>();
  for (const [i, name] of STUDIO_BONES.entries()) {
    if (pattern.test(name)) {
      set.add(i);
    }
  }
  return set;
}

/** The bones of the legs. */
const LEG_BONES = boneSet(/thigh|shin|foot|toes/);

/** The bones of the arms. */
const ARM_BONES = boneSet(/upper_arm|forearm|hand|fingers|elbow|wrist/);

/** The bones that the bind back line leaves out: the limbs, the tail, and the head. */
const NOT_BACK = boneSet(
  /upper_arm|forearm|hand|fingers|elbow|wrist|thigh|shin|foot|toes|^tail|^head|^ear|^eye|jaw/,
);

/** The bones that the posed back line leaves out: the legs and the tail. */
const NOT_POSED_BACK = boneSet(/thigh|shin|foot|toes|^tail/);

/**
 * Gives the weight of a vertex on a set of bones.
 *
 * @param mesh The mesh.
 * @param v The vertex.
 * @param set The bones.
 * @returns The weight.
 */
function weightOn(mesh: StudioMesh, v: number, set: ReadonlySet<number>): number {
  let w = 0;
  for (let k = 0; k < 4; k++) {
    if (set.has(mesh.joints[v * 4 + k] ?? 0)) {
      w += mesh.weights[v * 4 + k] ?? 0;
    }
  }
  return w;
}

/**
 * Gives a point of a list of positions.
 *
 * @param positions The positions.
 * @param v The vertex.
 * @returns The point.
 */
function pointAt(positions: ArrayLike<number>, v: number): Vec3 {
  return [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
}

/**
 * Gives the dot product of two vectors.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns The product.
 */
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Cuts the bind mesh by the plane through a point with a normal, and joins the segments into
 * loops.
 *
 * @param mesh The mesh.
 * @param center The point of the plane, which is the origin of the 2D axes.
 * @param axes The normal of the plane and the two axes of the cut.
 * @returns The cut.
 */
function cutMesh(mesh: StudioMesh, center: Vec3, axes: readonly [Vec3, Vec3, Vec3]): MeshCut {
  const [normal, s, w] = axes;
  const ids = new Map<string, number>();
  const points: CutPoint[] = [];
  const parent: number[] = [];
  const segments: [number, number][] = [];
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root] ?? root;
    }
    return root;
  };
  const side = (p: Vec3): number =>
    dot([p[0] - center[0], p[1] - center[1], p[2] - center[2]], normal);
  const key = (v: number): string =>
    pointAt(mesh.positions, v)
      .map((x) => Math.round(x * 1e5))
      .join(',');
  for (let t = 0; t < mesh.corners.length / 3; t++) {
    const found: number[] = [];
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const a = mesh.corners[t * 3 + i] ?? 0;
      const b = mesh.corners[t * 3 + j] ?? 0;
      const p = pointAt(mesh.positions, a);
      const q = pointAt(mesh.positions, b);
      const dp = side(p);
      const dq = side(q);
      if (dp * dq > 0 || dp === dq) {
        continue;
      }
      const ka = key(a);
      const kb = key(b);
      const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      let id = ids.get(edge);
      if (id === undefined) {
        const f = dp / (dp - dq);
        const point: Vec3 = [
          p[0] + f * (q[0] - p[0]),
          p[1] + f * (q[1] - p[1]),
          p[2] + f * (q[2] - p[2]),
        ];
        const rel: Vec3 = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
        id = points.length;
        points.push({
          flat: [dot(rel, s), dot(rel, w)],
          point,
          leg: (1 - f) * weightOn(mesh, a, LEG_BONES) + f * weightOn(mesh, b, LEG_BONES),
          arm: (1 - f) * weightOn(mesh, a, ARM_BONES) + f * weightOn(mesh, b, ARM_BONES),
        });
        parent.push(id);
        ids.set(edge, id);
      }
      found.push(id);
    }
    const [first, second] = found;
    if (found.length === 2 && first !== undefined && second !== undefined && first !== second) {
      segments.push([first, second]);
      parent[find(first)] = find(second);
    }
  }
  const loops = new Map<number, [number, number][]>();
  for (const segment of segments) {
    const root = find(segment[0]);
    const loop = loops.get(root) ?? [];
    loop.push(segment);
    loops.set(root, loop);
  }
  return { points, loops: [...loops.values()] };
}

/**
 * Gives the loops of a cut that hold a 2D point, from the smallest to the largest.
 *
 * @param cut The cut.
 * @param at The point.
 * @returns The loops.
 */
function loopsAround(
  cut: MeshCut,
  at: readonly [number, number],
): (readonly (readonly [number, number])[])[] {
  const holds = (loop: readonly (readonly [number, number])[]): boolean => {
    let inside = false;
    for (const [i, j] of loop) {
      const a = cut.points[i]?.flat ?? [0, 0];
      const b = cut.points[j]?.flat ?? [0, 0];
      if (a[1] > at[1] !== b[1] > at[1]) {
        const x = a[0] + ((at[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
        if (x > at[0]) {
          inside = !inside;
        }
      }
    }
    return inside;
  };
  return cut.loops.filter(holds).toSorted((a, b) => a.length - b.length);
}

/**
 * Gives the perimeter of the convex hull of 2D points.
 *
 * @param points The points.
 * @returns The perimeter.
 */
function hullPerimeter(points: readonly (readonly [number, number])[]): number {
  const sorted = points.toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]): number =>
    ((a[0] ?? 0) - (o[0] ?? 0)) * ((b[1] ?? 0) - (o[1] ?? 0)) -
    ((a[1] ?? 0) - (o[1] ?? 0)) * ((b[0] ?? 0) - (o[0] ?? 0));
  const half = (list: readonly (readonly [number, number])[]): (readonly [number, number])[] => {
    const out: (readonly [number, number])[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out.at(-2) ?? q, out.at(-1) ?? q, q) <= 0) {
        out.pop();
      }
      out.push(q);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(sorted), ...half(sorted.toReversed())];
  let sum = 0;
  for (const [i, p] of hull.entries()) {
    const q = hull[(i + 1) % hull.length] ?? p;
    sum += Math.hypot(p[0] - q[0], p[1] - q[1]);
  }
  return sum;
}

/**
 * Measures the trunk widths and depths of the bind mesh.
 *
 * @param rig The studio rig.
 * @returns The rows.
 */
function trunkRows(rig: StudioRig): FormRow[] {
  const heads = rig.body.heads;
  const bottom = rig.body.seatHeight ?? heads.hips[1];
  const rows: FormRow[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const y = bottom + ((i + 0.5) / LEVELS) * (heads.neck[1] - bottom);
    const t = Math.min(1, Math.max(0, (y - heads.hips[1]) / (heads.neck[1] - heads.hips[1])));
    const zMid = heads.hips[2] + t * (heads.neck[2] - heads.hips[2]);
    const cut = cutMesh(
      rig.mesh,
      [0, y, 0],
      [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 1],
      ],
    );
    // With no loop around the middle point, the smallest loop across x = 0.
    const across = cut.loops
      .filter((l) => {
        const xs = l.flat().map((k) => cut.points[k]?.point[0] ?? 0);
        return Math.min(...xs) < 0 && Math.max(...xs) > 0;
      })
      .toSorted((a, b) => a.length - b.length);
    const loop = loopsAround(cut, [0, zMid]).at(-1) ?? across[0] ?? [];
    const points = [...new Set(loop.flat())]
      .map((k) => cut.points[k])
      .filter((p) => p !== undefined);
    const xs = points.filter((p) => p.arm < 0.5).map((p) => p.point[0]);
    const zs = points.filter((p) => p.arm < 0.5 && p.leg < 0.5).map((p) => p.point[2]);
    rows.push(
      { name: `W${i}`, value: (Math.max(...xs) - Math.min(...xs)) * 100 },
      { name: `D${i}`, value: (Math.max(...zs) - Math.min(...zs)) * 100 },
    );
  }
  return rows;
}

/** A limb bone of the studio with two sides. */
type LimbBone = 'upper_arm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

/**
 * Measures the girth of a limb of the bind mesh at its middle, as the mean of the two sides: the
 * convex hull of the points of the cut on its side of the middle, so that a thigh that joins the
 * other thigh in the cut keeps its own girth.
 *
 * @param rig The studio rig.
 * @param from The bone at the start of the limb part, such as `upper_arm`.
 * @param to The bone at its end, such as `forearm`.
 * @param ownWeight True to take only the points with more than half of their weight on a limb,
 *   for a thigh that the cut joins to the belly.
 * @returns The girth in centimeters.
 */
function limbGirth(rig: StudioRig, from: LimbBone, to: LimbBone, ownWeight = false): number {
  let sum = 0;
  for (const side of ['L', 'R'] as const) {
    const a = rig.body.heads[`${from}_${side}`];
    const b = rig.body.heads[`${to}_${side}`];
    const axis = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const s = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
    const w = new Vector3().crossVectors(axis, s);
    const center: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const cut = cutMesh(rig.mesh, center, [axis.toArray(), s.toArray(), w.toArray()]);
    const loop = loopsAround(cut, [0, 0])[0] ?? [];
    const flats: (readonly [number, number])[] = [];
    for (const k of new Set(loop.flat())) {
      const p = cut.points[k];
      const own = p !== undefined && (side === 'L' ? p.point[0] < 0 : p.point[0] > 0);
      if (p && own && (!ownWeight || p.leg + p.arm >= 0.5)) {
        flats.push(p.flat);
      }
    }
    sum += hullPerimeter(flats) / 2;
  }
  return sum * 100;
}

/**
 * Measures the gap between the inner sides of the legs near a joint of the bind mesh.
 *
 * @param rig The studio rig.
 * @param joint The joint, such as `shin` for the knee.
 * @returns The gap in centimeters.
 */
function legGap(rig: StudioRig, joint: 'shin' | 'foot'): number {
  const left = rig.body.heads[`${joint}_L`];
  const right = rig.body.heads[`${joint}_R`];
  let innerL = -Infinity;
  let innerR = Infinity;
  for (let v = 0; v < rig.mesh.positions.length / 3; v++) {
    if (weightOn(rig.mesh, v, LEG_BONES) < 0.5) {
      continue;
    }
    const p = pointAt(rig.mesh.positions, v);
    const j = p[0] < 0 ? left : right;
    if (Math.abs(p[1] - j[1]) > 0.03 || Math.abs(p[2] - j[2]) > 0.06) {
      continue;
    }
    if (p[0] < 0) {
      innerL = Math.max(innerL, p[0]);
    } else {
      innerR = Math.min(innerR, p[0]);
    }
  }
  return (innerR - innerL) * 100;
}

/**
 * Measures the bulge of the back line from the side: at 10 heights from the hips joint to the
 * neck joint, the rear outline (the largest z) of the points off the bones of `skip`, and the
 * largest distance of that outline behind the chord from the waist to the last height. A view at
 * an elevation sees the height `y cos e + x sin e`.
 *
 * @param mesh The mesh, for the triangles and the weights.
 * @param positions The positions of the vertices, with the front of the body to -z.
 * @param ends The hips joint and the neck joint.
 * @param skip The bones that the outline leaves out.
 * @param elevation The elevation of the view, in degrees.
 * @returns The bulge in centimeters.
 */
function backBulge(
  mesh: StudioMesh,
  positions: ArrayLike<number>,
  ends: readonly [Vec3, Vec3],
  skip: ReadonlySet<number>,
  elevation: number,
): number {
  const c = Math.cos((elevation * Math.PI) / 180);
  const sn = Math.sin((elevation * Math.PI) / 180);
  const height = (p: Vec3): number => p[1] * c + p[0] * sn;
  const [hips, neck] = ends;
  const hv = height(hips);
  const dy = height(neck) - hv;
  const dz = neck[2] - hips[2];
  const len = Math.hypot(dy, dz);
  const heights = Array.from({ length: positions.length / 3 }, (_, v) =>
    height(pointAt(positions, v)),
  );
  const rear: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const y = hv + ((i + 0.5) / LEVELS) * dy;
    let best = -Infinity;
    for (let t = 0; t < mesh.corners.length / 3; t++) {
      for (const [i0, i1] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        const a = mesh.corners[t * 3 + i0] ?? 0;
        const b = mesh.corners[t * 3 + i1] ?? 0;
        const pa = heights[a] ?? 0;
        const pb = heights[b] ?? 0;
        if ((pa - y) * (pb - y) > 0 || pa === pb) {
          continue;
        }
        const f = (y - pa) / (pb - pa);
        if ((1 - f) * weightOn(mesh, a, skip) + f * weightOn(mesh, b, skip) >= 0.5) {
          continue;
        }
        const za = positions[a * 3 + 2] ?? 0;
        best = Math.max(best, za + f * ((positions[b * 3 + 2] ?? 0) - za));
      }
    }
    rear.push(best);
    ys.push(y);
  }
  const behind = rear.map((z, i) => ((z - (hips[2] + (((ys[i] ?? 0) - hv) / dy) * dz)) * dy) / len);
  let waist = 0;
  for (let i = 1; i < LEVELS; i++) {
    if ((behind[i] ?? 0) < (behind[waist] ?? 0)) {
      waist = i;
    }
  }
  const z0 = rear[waist] ?? 0;
  const y0 = ys[waist] ?? 0;
  const cy = (ys.at(-1) ?? 0) - y0;
  const cz = (rear.at(-1) ?? 0) - z0;
  const cl = Math.hypot(cy, cz);
  if (cl === 0) {
    return 0;
  }
  let bulge = 0;
  for (let i = waist; i < LEVELS; i++) {
    bulge = Math.max(bulge, (((rear[i] ?? 0) - z0) * cy - ((ys[i] ?? 0) - y0) * cz) / cl);
  }
  return bulge * 100;
}

/**
 * Measures the seated bind of a studio rig.
 *
 * @param rig The studio rig.
 * @returns The rows.
 */
function bindRows(rig: StudioRig): FormRow[] {
  const heads = rig.body.heads;
  return [
    { name: 'H', value: rig.body.headHeight * 100 },
    { name: 'seat', value: (rig.body.seatHeight ?? Number.NaN) * 100 },
    ...trunkRows(rig),
    { name: 'upper arm girth', value: limbGirth(rig, 'upper_arm', 'forearm') },
    { name: 'forearm girth', value: limbGirth(rig, 'forearm', 'hand') },
    { name: 'thigh girth', value: limbGirth(rig, 'thigh', 'shin') },
    { name: 'thigh girth on the leg', value: limbGirth(rig, 'thigh', 'shin', true) },
    { name: 'shin girth', value: limbGirth(rig, 'shin', 'foot') },
    { name: 'knee gap', value: legGap(rig, 'shin') },
    { name: 'ankle gap', value: legGap(rig, 'foot') },
    { name: 'shoulder joints', value: (heads.upper_arm_R[0] - heads.upper_arm_L[0]) * 100 },
    {
      name: 'bind back bulge',
      value: backBulge(rig.mesh, rig.mesh.positions, [heads.hips, heads.neck], NOT_BACK, 0),
    },
  ];
}

/**
 * Measures the first sample of the set `rest` of a player.
 *
 * @param role The role.
 * @param player The player.
 * @param scene The scene.
 * @returns The rows.
 */
function restRows(
  role: RoleSweep,
  player: SweepPlayer,
  scene: Parameters<RoleSweep['sampleSets']>[0],
): FormRow[] {
  const model = player.model;
  const set = role.sampleSets(scene).find((s) => s.name === 'rest');
  const [sample] = set ? [...set.samples] : [];
  if (!sample) {
    throw new Error(`The ${role.role} has no rest sample.`);
  }
  const posed: PosedSkeleton = poseSkeleton(model, player.poseAt(sample));
  const rootFrame = posed.frames[boneIndex('root')];
  if (!rootFrame) {
    throw new Error('The root bone has no frame.');
  }
  const toRoot = new Matrix4()
    .compose(rootFrame.position, rootFrame.rotation, new Vector3(1, 1, 1))
    .invert();
  const rootBind = new Vector3(...(model.skeleton.positions[boneIndex('root')] ?? [0, 0, 0]));
  const local = (p: Vec3): Vector3 => new Vector3(...p).applyMatrix4(toRoot).add(rootBind);
  const joint = (bone: BoneName): Vector3 =>
    local(posed.frames[boneIndex(bone)]?.position.toArray() ?? [0, 0, 0]);
  const hips = joint('hips');
  const neck = joint('neck');
  const mouth = local(posedPoint(posed, 'head', model.body.mouth));
  const axisDistance = (p: Vector3): number => {
    const d = neck.clone().sub(hips);
    const t = Math.max(0, Math.min(1, p.clone().sub(hips).dot(d) / d.lengthSq()));
    const q = hips.clone().addScaledVector(d, t);
    return Math.hypot(p.x - q.x, p.z - q.z);
  };
  const rows: FormRow[] = [];
  for (const s of ['L', 'R'] as const) {
    const out = s === 'L' ? -1 : 1;
    const paw = local(
      posedPoint(posed, `hand${s}`, s === 'L' ? model.body.palmL : model.body.palmR),
    );
    const shoulder = joint(`upperArm${s}`);
    const elbow = joint(`forearm${s}`);
    rows.push(
      { name: `paw ${s} above hips`, value: (paw.y - hips.y) * 100 },
      { name: `paw ${s} below mouth`, value: (mouth.y - paw.y) * 100 },
      { name: `paw ${s} front of hips`, value: (hips.z - paw.z) * 100 },
      { name: `elbow ${s} from trunk axis`, value: axisDistance(elbow) * 100 },
      { name: `elbow ${s} out of shoulder`, value: out * (elbow.x - shoulder.x) * 100 },
      { name: `elbow ${s} below shoulder`, value: (shoulder.y - elbow.y) * 100 },
    );
  }
  const instrument = joint('instrument');
  rows.push(
    { name: 'instrument above hips', value: (instrument.y - hips.y) * 100 },
    { name: 'instrument front of hips', value: (hips.z - instrument.z) * 100 },
    { name: 'instrument out of middle', value: (instrument.x - hips.x) * 100 },
    { name: 'rest back bulge', value: restBulge(player, posed) },
  );
  return rows;
}

/**
 * Measures the back bulge of the posed mesh of a player, with the arms, the clavicles, and the
 * head, from the side. The mesh first turns about the vertical, so that the hips face -z.
 *
 * @param player The player.
 * @param posed The posed skeleton.
 * @returns The bulge in centimeters.
 */
function restBulge(player: SweepPlayer, posed: PosedSkeleton): number {
  const rig = player.model.studio;
  const pose = poseStudioBones(
    rig,
    posed.model.skeleton,
    posed.pose.rotations,
    studioOffsets(posed.pose),
    Math.max(CLOSED_EYE_SCALE, 1 - posed.pose.blink),
    createStudioPose(),
  );
  const out = skinStudioMesh(rig.mesh, pose);
  const hipsMatrix = new Matrix4().fromArray(pose.matrices, STUDIO_BONES.indexOf('hips') * 16);
  const forward = new Vector3(0, 0, -1).transformDirection(hipsMatrix);
  const turn = new Matrix4().makeRotationY(Math.atan2(forward.x, -forward.z));
  const q = new Vector3();
  for (let v = 0; v < out.length / 3; v++) {
    q.fromArray(out, v * 3)
      .applyMatrix4(turn)
      .toArray(out, v * 3);
  }
  const at = (name: 'hips' | 'neck'): Vec3 =>
    new Vector3(...rig.body.heads[name])
      .applyMatrix4(new Matrix4().fromArray(pose.matrices, STUDIO_BONES.indexOf(name) * 16))
      .applyMatrix4(turn)
      .toArray();
  return backBulge(rig.mesh, out, [at('hips'), at('neck')], NOT_POSED_BACK, 0);
}

/**
 * Measures the first player of a role in the first demo of the role.
 *
 * @param name The name of the role.
 * @param demo The demo, or `null` for the first demo of the role.
 * @returns The rows.
 */
async function measureRows(name: string, demo: string | null): Promise<FormRow[]> {
  const role = Object.entries(SWEEP_ROLES).find(([key]) => key === name)?.[1];
  if (!role) {
    throw new Error(`${USAGE}\nThe role "${name}" does not exist.`);
  }
  const [file] = await roleDemos(demo === null ? [] : [demo], [], role);
  if (!file) {
    throw new Error(`No demo has the ${name}.`);
  }
  const scene = sceneOf(file.bytes);
  const [player] = role.players(scene);
  if (!player) {
    throw new Error(`The demo ${file.file} has no ${name}.`);
  }
  return [...bindRows(player.model.studio), ...restRows(role, player, scene)];
}

/**
 * Gives the lines of the table.
 *
 * @param rows The rows of the working tree.
 * @param base The rows of the commit, or `null`.
 * @returns The lines.
 */
function tableLines(rows: readonly FormRow[], base: readonly FormRow[] | null): string[] {
  const head = base ? ['measure', 'base', 'tree', 'base/tree', 'tree - base'] : ['measure', 'tree'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const row of rows) {
    const old = base?.find((b) => b.name === row.name)?.value;
    if (old === undefined) {
      lines.push(`| ${row.name} | ${row.value.toFixed(1)} |`);
      continue;
    }
    const ratio = old / row.value;
    const off = row.name.endsWith('bulge')
      ? Math.abs(old - row.value) > BULGE_LIMIT
      : Math.abs(ratio - 1) > RATIO_LIMIT;
    const cells = [
      row.name,
      old.toFixed(1),
      row.value.toFixed(1),
      `${Number.isFinite(ratio) ? ratio.toFixed(2) : '-'}${off ? ' *' : ''}`,
      (row.value - old).toFixed(1),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Reads the rows of the --json output of this script. JSON writes NaN as `null`, so `null` gives
 * NaN again.
 *
 * @param text The JSON text.
 * @returns The rows.
 */
function parseRows(text: string): FormRow[] {
  // SAFETY: the text comes from the --json output of this script in a child process.
  const json = JSON.parse(text) as { readonly rows: { name: string; value: number | null }[] };
  return json.rows.map((row) => ({ name: row.name, value: row.value ?? Number.NaN }));
}

/** Runs the tool: `node tools/body-shape.ts <role> [options]`. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [name] = args;
  if (name === undefined || name.startsWith('--')) {
    throw new Error(USAGE);
  }
  const demo = optionValue(args, '--demo') ?? null;
  const ref = optionValue(args, '--base') ?? null;
  const json = optionValue(args, '--json') ?? null;
  let base: FormRow[] | null = null;
  let rows: FormRow[];
  if (ref !== null) {
    const tree = withoutOptions(args, ['--base']);
    const texts = await probeBeside(
      ref,
      'body-shape.ts',
      { base: tree, tree },
      { prefix: 'body-shape-', cache: true },
    );
    rows = parseRows(texts.tree);
    base = parseRows(texts.base);
  } else {
    rows = await measureRows(name, demo);
  }
  if (json !== null) {
    writeFileSync(json, JSON.stringify({ version: FORM_FORMAT, rows }));
    return;
  }
  const label = ref === null ? '' : `, base ${ref} (${shortHash(ref)})`;
  console.log(`Body form of the ${name} in cm${label}. A star marks a value off the base.\n`);
  console.log(tableLines(rows, base).join('\n'));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
