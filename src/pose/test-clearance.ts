import { Box3, Ray, Triangle, Vector3 } from 'three';

import { patchedDemos } from '../../tools/patch-demos.ts';
import { CONDUCTOR } from '../models/cast.ts';
import { layoutScene } from '../models/layout-scene.ts';
import { ModelCache } from '../models/model-cache.ts';
import { placePoint } from '../models/instruments/hold.ts';
import { VIOLIN } from '../models/instruments/strings.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import type { Vec3 } from '../models/tuples.ts';
import { scoreOf } from '../score/test-score.ts';
import { headOf, lookAngles } from './plan.ts';
import type { PosePlan } from './plan.ts';
import { createScenePose, poseAt } from './pose-at.ts';
import { poseSkeleton } from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { posedCorner } from './test-skin.ts';
import { PLAYING } from './test-scene.ts';
import type { TestScene } from './test-scene.ts';

/** The bones of the head and the face of an animal. */
export const HEAD_BONES = [
  'head',
  'jaw',
  'eyeL',
  'eyeR',
  'earL',
  'earR',
  'trunk1',
  'trunk2',
  'trunk3',
] as const satisfies readonly BoneName[];

/** The posed triangles of some bones, with their bounding box. */
export interface PosedPart {
  /** The posed triangles. */
  readonly triangles: readonly Triangle[];
  /** The box around the triangles. */
  readonly box: Box3;
  /**
   * Gives the closed shells that hold the triangles, posed: a welded part on two bones is one
   * closed shell, and the triangles of one of its bones are an open surface. {@link signedDistance}
   * measures the shells. With no value, the triangles are one closed shell.
   */
  readonly closed?: () => readonly PosedPart[];
}

/** The closed shells of a mesh, found one time for each mesh. */
interface MeshShells {
  /** The shell of each triangle. */
  readonly shellOf: Int32Array;
  /** The first corner of each triangle of each shell. */
  readonly shells: readonly (readonly number[])[];
}

/** The shells of each mesh, by the mesh data. */
const SHELLS = new WeakMap<PlayerModel['mesh'], MeshShells>();

/**
 * Finds the closed shells of a mesh: the triangles that share an edge in the bind pose are in the
 * same shell. A welded part on two bones is one shell, and each rigid part is its own shell.
 *
 * @param mesh The mesh.
 * @returns The shells.
 */
function meshShells(mesh: PlayerModel['mesh']): MeshShells {
  const known = SHELLS.get(mesh);
  if (known) {
    return known;
  }

  // Each triangle starts as its own shell. An edge joins the shells of its two triangles. Two
  // closed parts that only touch at a corner, such as a cap point on a joint, stay apart.
  const count = mesh.bones.length / 3;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const rootOf = (i: number): number => {
    let r = i;
    while (parent[r] !== r) {
      r = parent[r] ?? r;
    }
    parent[i] = r;
    return r;
  };
  const owner = new Map<string, number>();
  const p = mesh.positions;
  const placeOf = (corner: number): string =>
    `${p[corner * 3]} ${p[corner * 3 + 1]} ${p[corner * 3 + 2]}`;
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const a = placeOf(t * 3 + k);
      const b = placeOf(t * 3 + ((k + 1) % 3));
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const other = owner.get(key);
      if (other === undefined) {
        owner.set(key, t);
      } else {
        parent[rootOf(t)] = rootOf(other);
      }
    }
  }

  const index = new Map<number, number>();
  const shells: number[][] = [];
  const shellOf = new Int32Array(count);
  for (let t = 0; t < count; t++) {
    const r = rootOf(t);
    let shell = index.get(r);
    if (shell === undefined) {
      shell = shells.length;
      index.set(r, shell);
      shells.push([]);
    }
    shells[shell]?.push(t * 3);
    shellOf[t] = shell;
  }
  const found = { shellOf, shells };
  SHELLS.set(mesh, found);
  return found;
}

/**
 * Poses the triangles that start at some corners: each corner follows its own two bones, as the
 * skin of the GPU does ({@link posedCorner}).
 *
 * @param posed The posed skeleton.
 * @param firsts The first corner of each triangle.
 * @returns The posed triangles and their box.
 */
function posedTriangles(posed: PosedSkeleton, firsts: readonly number[]): PosedPart {
  const triangles: Triangle[] = [];
  const box = new Box3();
  for (const v of firsts) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3(...posedCorner(posed, v + k)));
    if (!a || !b || !c) {
      continue;
    }
    const triangle = new Triangle(a, b, c);
    box.expandByPoint(triangle.a).expandByPoint(triangle.b).expandByPoint(triangle.c);
    triangles.push(triangle);
  }
  return { triangles, box };
}

/**
 * Gives the posed triangles of the parts that follow some bones. A triangle belongs to the bone
 * of its first corner, its main bone. Each corner follows its own two bones, as the skin of the
 * GPU does (design 4.4, 4.7), so a triangle of a welded part keeps its place in the skin.
 *
 * @param posed The posed skeleton.
 * @param bones The bones.
 * @param keep Tells if a triangle belongs to the part, from its three corners in the bind pose.
 *   All triangles by default.
 * @returns The triangles, their bounding box, and their closed shells.
 */
export function posedPart(
  posed: PosedSkeleton,
  bones: readonly BoneName[],
  keep: (corners: readonly Vector3[]) => boolean = () => true,
): PosedPart {
  const wanted = new Set(bones.map(boneIndex));
  const { mesh } = posed.model;
  const { positions, bones: vertexBones } = mesh;
  const firsts: number[] = [];
  for (let v = 0; v < vertexBones.length; v += 3) {
    if (!wanted.has(vertexBones[v] ?? 0)) {
      continue;
    }
    const corners = [0, 1, 2].map(
      (k) =>
        new Vector3(
          positions[(v + k) * 3] ?? 0,
          positions[(v + k) * 3 + 1] ?? 0,
          positions[(v + k) * 3 + 2] ?? 0,
        ),
    );
    if (keep(corners)) {
      firsts.push(v);
    }
  }
  const part = posedTriangles(posed, firsts);

  // The shells of the triangles, posed only when a signed distance needs them.
  let shells: readonly PosedPart[] | null = null;
  const closed = (): readonly PosedPart[] => {
    if (!shells) {
      const { shellOf, shells: all } = meshShells(mesh);
      const ids = new Set(firsts.map((v) => shellOf[v / 3] ?? 0));
      shells = [...ids].map((id) => posedTriangles(posed, all[id] ?? []));
    }
    return shells;
  };
  return { ...part, closed };
}

const inside = new Ray();
const insideHit = new Vector3();
const nearestPoint = new Vector3();
/** A direction with no simple ratio, so that a ray passes no edge of the low-poly mesh. */
const RAY_DIRECTION = new Vector3(0.31, 0.89, 0.17).normalize();

/**
 * Gives the signed distance from a point to the surface of one closed shell: negative inside it.
 * A ray from the point crosses the surface an odd number of times if the point is in the shell.
 *
 * @param shell The closed shell.
 * @param point The point.
 * @returns The distance, in meters.
 */
function shellDistance(shell: PosedPart, point: Vector3): number {
  let nearest = Infinity;
  let crossings = 0;
  inside.set(point, RAY_DIRECTION);
  for (const t of shell.triangles) {
    nearest = Math.min(nearest, t.closestPointToPoint(point, nearestPoint).distanceTo(point));
    if (inside.intersectTriangle(t.a, t.b, t.c, false, insideHit)) {
      crossings++;
    }
  }
  return crossings % 2 === 1 ? -nearest : nearest;
}

/**
 * Gives the signed distance from a point to a posed part: negative inside it. The function
 * measures the closed shells of the part ({@link PosedPart.closed}), so a welded part on two
 * bones counts as its whole closed surface, and the point is inside when it is inside one of the
 * shells. Only tests use it.
 *
 * @param part The part.
 * @param point The point.
 * @returns The distance, in meters.
 */
export function signedDistance(part: PosedPart, point: Vector3): number {
  const shells = part.closed?.() ?? [part];
  const distances = shells.map((shell) => shellDistance(shell, point));
  const inner = distances.filter((d) => d < 0);

  // Inside one shell: the depth in the deepest shell. Outside all: the nearest surface.
  return inner.length > 0 ? Math.min(...inner) : Math.min(Infinity, ...distances);
}

/**
 * Gives the posed neck of a bowed string: the triangles of the instrument with a corner past the
 * upper end of the body, toward the scroll. These are the neck, the fingerboard over it, the
 * pegbox, and the scroll (design 4.6).
 *
 * @param posed The posed skeleton of a bowed string player.
 * @returns The neck.
 * @throws Error if the instrument has no target `fingerboard`, or no triangles past its body.
 */
export function posedNeck(posed: PosedSkeleton): PosedPart {
  const board = posed.model.instrument.targets.find((t) => t.kind === 'fingerboard');
  if (!board) {
    throw new Error(`The ${posed.model.instrument.id} has no target "fingerboard".`);
  }
  const nut = new Vector3(...placePoint(posed.model.pieces, { bone: board.bone, at: board.from }));
  const end = new Vector3(...placePoint(posed.model.pieces, { bone: board.bone, at: board.to }));
  // The target runs from the nut to the end of the fingerboard. The body ends between them.
  const v = VIOLIN;
  const share = (v.bodyLength - v.fingerboardEnd) / (v.nut - v.fingerboardEnd);
  const along = nut.clone().sub(end);
  const bodyEnd = end.clone().addScaledVector(along, share);
  const past = (p: Vector3): boolean => p.clone().sub(bodyEnd).dot(along) > 0;
  const neck = posedPart(posed, ['instrument'], (corners) => corners.some(past));
  if (neck.triangles.length === 0) {
    throw new Error(`The ${posed.model.instrument.id} has no triangles past its body.`);
  }
  return neck;
}

const ray = new Ray();
const hit = new Vector3();

/**
 * Tells if a segment crosses a triangle.
 *
 * @param p The start of the segment.
 * @param q The end of the segment.
 * @param triangle The triangle.
 * @returns True if the segment and the triangle have a common point.
 */
function crosses(p: Vector3, q: Vector3, triangle: Triangle): boolean {
  const length = p.distanceTo(q);
  ray.origin.copy(p);
  ray.direction.subVectors(q, p).normalize();
  const point = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit);
  return point !== null && point.distanceTo(p) <= length;
}

const d1 = new Vector3();
const d2 = new Vector3();
const r = new Vector3();
const c1 = new Vector3();
const c2 = new Vector3();

/**
 * Gives the smallest distance between two segments (Ericson, "Real-Time Collision Detection",
 * 5.1.9).
 *
 * @param p1 The start of the first segment.
 * @param q1 The end of the first segment.
 * @param p2 The start of the second segment.
 * @param q2 The end of the second segment.
 * @returns The distance.
 */
function segmentDistance(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): number {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  r.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    return p1.distanceTo(p2);
  }
  if (a <= 1e-12) {
    t = clamp(f / e);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-12) {
      s = clamp(-c / a);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? clamp((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  c1.copy(p1).addScaledVector(d1, s);
  c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

const closest = new Vector3();

/**
 * Gives the smallest distance between two triangles: 0 if they cross, else the smallest of the
 * distances from a corner to the other triangle and between two edges.
 *
 * @param a The first triangle.
 * @param b The second triangle.
 * @returns The distance.
 */
function triangleDistance(a: Triangle, b: Triangle): number {
  const cornersA = [a.a, a.b, a.c] as const;
  const cornersB = [b.a, b.b, b.c] as const;
  for (let i = 0; i < 3; i++) {
    const pa = cornersA[i] ?? a.a;
    const qa = cornersA[(i + 1) % 3] ?? a.a;
    const pb = cornersB[i] ?? b.a;
    const qb = cornersB[(i + 1) % 3] ?? b.a;
    if (crosses(pa, qa, b) || crosses(pb, qb, a)) {
      return 0;
    }
  }
  let best = Infinity;
  for (const p of cornersA) {
    best = Math.min(best, b.closestPointToPoint(p, closest).distanceTo(p));
  }
  for (const p of cornersB) {
    best = Math.min(best, a.closestPointToPoint(p, closest).distanceTo(p));
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      best = Math.min(
        best,
        segmentDistance(
          cornersA[i] ?? a.a,
          cornersA[(i + 1) % 3] ?? a.a,
          cornersB[j] ?? b.a,
          cornersB[(j + 1) % 3] ?? b.a,
        ),
      );
    }
  }
  return best;
}

const boxA = new Box3();
const boxB = new Box3();

/**
 * Sets a box to the bounding box of a triangle.
 *
 * @param triangle The triangle.
 * @param out The box to write.
 * @returns `out`.
 */
function boxOf(triangle: Triangle, out: Box3): Box3 {
  return out
    .makeEmpty()
    .expandByPoint(triangle.a)
    .expandByPoint(triangle.b)
    .expandByPoint(triangle.c);
}

/** A group of near triangles of a closed surface. */
interface SurfaceCluster {
  /** The indices of the triangles in the surface. */
  readonly members: Int32Array;
  /** The sum of the area vectors of the triangles: half the cross product of two edges. */
  readonly area: Vector3;
  /** The middle of the triangles, weighted by their areas. */
  readonly middle: Vector3;
  /** The largest distance from the middle to a corner of a triangle, in meters. */
  readonly radius: number;
}

/**
 * A closed surface: the triangles of a part, and a fan cap on each open boundary loop, such as
 * the cut at a shoulder of a trunk with no arms. {@link closedDepth} measures it.
 */
export interface ClosedSurface {
  /** The triangles: the triangles of the part, then the triangles of the caps. */
  readonly triangles: readonly Triangle[];
  /** The groups of near triangles, for a fast winding number. */
  readonly clusters: readonly SurfaceCluster[];
  /** The box around the triangles. */
  readonly box: Box3;
  /**
   * The main bone of each triangle of the part, before the caps, as an index of `BONE_NAMES`, for
   * the region of a point on the surface ({@link surfaceNearest}). A surface of
   * {@link closeSurface} has none.
   */
  readonly bones?: Int32Array;
}

/** The caps and the clusters of a surface, found from its corners in the bind pose. */
interface SurfacePlan {
  /** The number of triangles of the part, with no caps. */
  readonly count: number;
  /** The number of open boundary loops. */
  readonly loops: number;
  /**
   * The two corners of the edge of each cap triangle, in the corners of the part: the end, then
   * the start of the edge in its own triangle. Thus each cap turns as the part.
   */
  readonly capEdges: Int32Array;
  /** The loop of each cap triangle. */
  readonly capLoops: Int32Array;
  /** The triangles of each cluster: the triangles of the part, then the caps. */
  readonly clusters: readonly Int32Array[];
}

/** The largest number of triangles in a cluster of a closed surface. */
const CLUSTER_SIZE = 32;

/**
 * A cluster farther than this many radii from a point counts as one area vector at its middle in
 * the winding number. The error of this sum falls with the square of the ratio.
 */
const FAR_RATIO = 2;

/**
 * Groups triangles into clusters of near triangles: a split at the median of the longest axis of
 * their middles, until each cluster has at most {@link CLUSTER_SIZE} triangles.
 *
 * @param middles The middle of each triangle.
 * @returns The triangles of each cluster.
 */
function clusterTriangles(middles: readonly Vector3[]): Int32Array[] {
  const clusters: Int32Array[] = [];
  const split = (members: number[]): void => {
    if (members.length <= CLUSTER_SIZE) {
      clusters.push(Int32Array.from(members));
      return;
    }
    const box = new Box3().setFromPoints(members.map((m) => middles[m] ?? new Vector3()));
    const size = box.getSize(new Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const sorted = members.toSorted(
      (a, b) => (middles[a]?.[axis] ?? 0) - (middles[b]?.[axis] ?? 0),
    );
    const half = sorted.length >> 1;
    split(sorted.slice(0, half));
    split(sorted.slice(half));
  };
  split(middles.map((_, i) => i));
  return clusters;
}

/**
 * Finds the open boundary loops of a set of triangles, the caps that close them, and the
 * clusters. Two corners at the same place are one vertex, so a mesh with split normals counts as
 * welded. An edge of one triangle is on a boundary. The boundary edges that share vertices form
 * one loop.
 *
 * @param corners The corners of the triangles in the bind pose: x, y, z of three corners for each
 *   triangle.
 * @returns The plan of the surface.
 */
function planSurface(corners: ArrayLike<number>): SurfacePlan {
  const count = Math.floor(corners.length / 9);
  const keyOf = (corner: number): string =>
    `${corners[corner * 3]} ${corners[corner * 3 + 1]} ${corners[corner * 3 + 2]}`;

  // Each edge with its uses. An edge with one use is on an open boundary.
  const edges = new Map<string, { uses: number; start: number; end: number }>();
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const start = t * 3 + k;
      const end = t * 3 + ((k + 1) % 3);
      const a = keyOf(start);
      const b = keyOf(end);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(key);
      if (edge) {
        edge.uses++;
      } else {
        edges.set(key, { uses: 1, start, end });
      }
    }
  }
  const open = [...edges.values()].filter((edge) => edge.uses === 1);

  // The boundary edges that share a vertex are in one loop.
  const parent = new Map<string, string>();
  const rootOf = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    parent.set(key, root);
    return root;
  };
  for (const { start, end } of open) {
    for (const key of [keyOf(start), keyOf(end)]) {
      if (!parent.has(key)) {
        parent.set(key, key);
      }
    }
    parent.set(rootOf(keyOf(start)), rootOf(keyOf(end)));
  }
  const loopIds = new Map<string, number>();
  const capLoops = Int32Array.from(open, ({ start }) => {
    const root = rootOf(keyOf(start));
    const known = loopIds.get(root);
    if (known !== undefined) {
      return known;
    }
    loopIds.set(root, loopIds.size);
    return loopIds.size - 1;
  });
  const capEdges = Int32Array.from(open.flatMap(({ start, end }) => [end, start]));

  // The clusters, from the middles of the triangles and of the caps in the bind pose.
  const at = (corner: number): Vector3 => new Vector3().fromArray(corners, corner * 3);
  const loopMiddles = middlesOfLoops(at, capEdges, capLoops, loopIds.size);
  const middles = Array.from({ length: count }, (_, t) =>
    at(t * 3)
      .add(at(t * 3 + 1))
      .add(at(t * 3 + 2))
      .divideScalar(3),
  );
  for (const [i, loop] of capLoops.entries()) {
    const middle = loopMiddles[loop] ?? new Vector3();
    middles.push(
      at(capEdges[i * 2] ?? 0)
        .add(at(capEdges[i * 2 + 1] ?? 0))
        .add(middle)
        .divideScalar(3),
    );
  }
  return { count, loops: loopIds.size, capEdges, capLoops, clusters: clusterTriangles(middles) };
}

/**
 * Gives the middle of each open loop: the mean of the starts of its edges.
 *
 * @param at Gives the place of a corner of the part.
 * @param capEdges The end and the start corner of each boundary edge.
 * @param capLoops The loop of each boundary edge.
 * @param loops The number of loops.
 * @returns The middle of each loop.
 */
function middlesOfLoops(
  at: (corner: number) => Vector3,
  capEdges: Int32Array,
  capLoops: Int32Array,
  loops: number,
): Vector3[] {
  const sums = Array.from({ length: loops }, () => new Vector3());
  const counts = Array.from({ length: loops }, () => 0);
  for (const [i, loop] of capLoops.entries()) {
    sums[loop]?.add(at(capEdges[i * 2 + 1] ?? 0));
    counts[loop] = (counts[loop] ?? 0) + 1;
  }
  return sums.map((sum, loop) => sum.divideScalar(Math.max(1, counts[loop] ?? 1)));
}

/**
 * Builds the closed surface of a plan from the posed corners of its part.
 *
 * @param plan The plan.
 * @param at Gives the posed place of a corner of the part, as a new vector.
 * @returns The surface.
 */
function surfaceOf(plan: SurfacePlan, at: (corner: number) => Vector3): ClosedSurface {
  const triangles: Triangle[] = [];
  for (let t = 0; t < plan.count; t++) {
    triangles.push(new Triangle(at(t * 3), at(t * 3 + 1), at(t * 3 + 2)));
  }
  const middles = middlesOfLoops(at, plan.capEdges, plan.capLoops, plan.loops);
  for (const [i, loop] of plan.capLoops.entries()) {
    const middle = middles[loop] ?? new Vector3();
    triangles.push(
      new Triangle(at(plan.capEdges[i * 2] ?? 0), at(plan.capEdges[i * 2 + 1] ?? 0), middle),
    );
  }

  const box = new Box3();
  for (const t of triangles) {
    box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
  }
  const clusters = plan.clusters.map((members): SurfaceCluster => {
    const area = new Vector3();
    const middle = new Vector3();
    let weight = 0;
    for (const m of members) {
      const t = triangles[m];
      if (!t) {
        continue;
      }
      const size = t.getArea();
      area.add(t.getNormal(clusterNormal).multiplyScalar(size));
      middle.addScaledVector(t.getMidpoint(clusterMiddle), size);
      weight += size;
    }
    middle.divideScalar(Math.max(weight, 1e-12));
    let radius = 0;
    for (const m of members) {
      const t = triangles[m];
      if (t) {
        radius = Math.max(
          radius,
          middle.distanceTo(t.a),
          middle.distanceTo(t.b),
          middle.distanceTo(t.c),
        );
      }
    }
    return { members, area, middle, radius };
  });
  return { triangles, clusters, box };
}

const clusterNormal = new Vector3();
const clusterMiddle = new Vector3();

/**
 * Closes a set of triangles with a fan cap on each open boundary loop. The triangles turn as one
 * surface, and their faces point out. Only tests use it.
 *
 * @param triangles The triangles.
 * @param loops The expected number of open boundary loops.
 * @returns The closed surface.
 * @throws Error if the triangles have a different number of open loops.
 */
export function closeSurface(triangles: readonly Triangle[], loops: number): ClosedSurface {
  const corners = cornersOf(triangles);
  const plan = planSurface(corners);
  checkLoops(plan, loops, 'The triangles');
  return surfaceOf(plan, (corner) => new Vector3().fromArray(corners, corner * 3));
}

/**
 * Counts the open boundary loops of a set of triangles, as {@link closeSurface} finds them. Only
 * tests use it.
 *
 * @param triangles The triangles.
 * @returns The number of open loops: 0 for a closed shell.
 */
export function openLoops(triangles: readonly Triangle[]): number {
  return planSurface(cornersOf(triangles)).loops;
}

/**
 * Gives the corners of some triangles as one list.
 *
 * @param triangles The triangles.
 * @returns x, y, z of three corners for each triangle.
 */
function cornersOf(triangles: readonly Triangle[]): Float64Array {
  return Float64Array.from(
    triangles.flatMap((t) => [...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()]),
  );
}

/**
 * Stops when a plan has a different number of open loops than expected: a new body or a new set
 * of bones can open a new loop, and a cap over the wrong loop gives false depths.
 *
 * @param plan The plan.
 * @param loops The expected number of open loops.
 * @param name The name of the part, for the message.
 * @throws Error if the numbers differ.
 */
function checkLoops(plan: SurfacePlan, loops: number, name: string): void {
  if (plan.loops !== loops) {
    throw new Error(`${name} have ${plan.loops} open loops, and the caller expects ${loops}.`);
  }
}

/** The plans of the closed parts of each mesh, by the list of their bones. */
const SURFACE_PLANS = new WeakMap<PlayerModel['mesh'], Map<string, SurfacePlan>>();

/**
 * Gives the posed closed surface of the parts that follow some bones: the triangles of the bones,
 * as {@link posedPart} gives them, with a cap on each open loop. Only tests use it.
 *
 * @param posed The posed skeleton.
 * @param bones The bones.
 * @param loops The expected number of open loops of the triangles in the bind pose.
 * @returns The closed surface.
 * @throws Error if the triangles have a different number of open loops.
 */
export function closedPart(
  posed: PosedSkeleton,
  bones: readonly BoneName[],
  loops: number,
): ClosedSurface {
  const { mesh } = posed.model;
  const firsts = firstCorners(mesh, bones);
  let plans = SURFACE_PLANS.get(mesh);
  if (!plans) {
    plans = new Map();
    SURFACE_PLANS.set(mesh, plans);
  }
  const key = bones.join(' ');
  let plan = plans.get(key);
  if (!plan) {
    const corners = new Float64Array(firsts.length * 9);
    for (const [t, v] of firsts.entries()) {
      corners.set(mesh.positions.subarray(v * 3, v * 3 + 9), t * 9);
    }
    plan = planSurface(corners);
    plans.set(key, plan);
  }
  checkLoops(plan, loops, `The bones ${key}`);
  let mains = MAIN_BONES.get(plan);
  if (!mains) {
    mains = Int32Array.from(firsts, (v) => mesh.bones[v] ?? -1);
    MAIN_BONES.set(plan, mains);
  }
  const surface = surfaceOf(plan, (corner) => {
    const v = (firsts[Math.floor(corner / 3)] ?? 0) + (corner % 3);
    return new Vector3(...posedCorner(posed, v));
  });
  return { ...surface, bones: mains };
}

/** The main bone of each triangle of each plan of {@link closedPart}, before the caps. */
const MAIN_BONES = new WeakMap<SurfacePlan, Int32Array>();

/**
 * Gives the first corner of each triangle whose main bone is one of some bones.
 *
 * @param mesh The mesh.
 * @param bones The bones.
 * @returns The first corners.
 */
function firstCorners(mesh: PlayerModel['mesh'], bones: readonly BoneName[]): number[] {
  const wanted = new Set(bones.map(boneIndex));
  const firsts: number[] = [];
  for (let v = 0; v < mesh.bones.length; v += 3) {
    if (wanted.has(mesh.bones[v] ?? -1)) {
      firsts.push(v);
    }
  }
  return firsts;
}

const toA = new Vector3();
const toB = new Vector3();
const toC = new Vector3();
const across = new Vector3();
const toMiddle = new Vector3();

/**
 * Gives the solid angle of a triangle seen from a point, with a sign: positive when the point is
 * behind the face (Van Oosterom and Strackee, 1983).
 *
 * @param t The triangle.
 * @param p The point.
 * @returns The solid angle, in steradians.
 */
function solidAngle(t: Triangle, p: Vector3): number {
  toA.subVectors(t.a, p);
  toB.subVectors(t.b, p);
  toC.subVectors(t.c, p);
  const a = toA.length();
  const b = toB.length();
  const c = toC.length();
  const volume = toA.dot(across.crossVectors(toB, toC));
  const below = a * b * c + toA.dot(toB) * c + toB.dot(toC) * a + toC.dot(toA) * b;
  return 2 * Math.atan2(volume, below);
}

/**
 * Gives the winding number of a closed surface around a point: about 1 inside and 0 outside. A
 * near cluster adds the solid angles of its triangles. A far cluster adds the solid angle of its
 * area vector at its middle (Barill and others, "Fast winding numbers", 2018).
 *
 * @param surface The surface.
 * @param p The point.
 * @returns The winding number.
 */
function windingNumber(surface: ClosedSurface, p: Vector3): number {
  let sum = 0;
  for (const cluster of surface.clusters) {
    toMiddle.subVectors(cluster.middle, p);
    const distance = toMiddle.length();
    if (distance > FAR_RATIO * cluster.radius) {
      sum += cluster.area.dot(toMiddle) / distance ** 3;
      continue;
    }
    for (const m of cluster.members) {
      const t = surface.triangles[m];
      if (t) {
        sum += solidAngle(t, p);
      }
    }
  }
  return sum / (4 * Math.PI);
}

/**
 * Gives the distance from a point to the nearest triangle of a surface. A cluster whose nearest
 * possible point is farther than the best distance is skipped.
 *
 * @param surface The surface.
 * @param p The point.
 * @returns The distance, in meters.
 */
function surfaceDistance(surface: ClosedSurface, p: Vector3): number {
  let best = Infinity;
  for (const cluster of surface.clusters) {
    if (cluster.middle.distanceTo(p) - cluster.radius >= best) {
      continue;
    }
    for (const m of cluster.members) {
      const t = surface.triangles[m];
      if (t) {
        best = Math.min(best, t.closestPointToPoint(p, nearestPoint).distanceTo(p));
      }
    }
  }
  return best;
}

/** The nearest point of a closed surface to a point ({@link surfaceNearest}). */
export interface SurfacePoint {
  /** The index of the triangle in the surface: a cap when it is past the triangles of the part. */
  readonly triangle: number;
  /** The nearest point on the triangle. */
  readonly point: Vector3;
}

/**
 * Finds the nearest point of a closed surface to a point, as {@link closedDepth} measures the
 * depth, with its triangle, such as for the region of the body at the deepest point of a part.
 * Only tests use it.
 *
 * @param surface The surface.
 * @param p The point.
 * @returns The nearest point and its triangle, or the triangle -1 for a surface with no triangle.
 */
export function surfaceNearest(surface: ClosedSurface, p: Vector3): SurfacePoint {
  let best = Infinity;
  let found: SurfacePoint = { triangle: -1, point: p.clone() };
  const near = new Vector3();
  for (const cluster of surface.clusters) {
    if (cluster.middle.distanceTo(p) - cluster.radius >= best) {
      continue;
    }
    for (const m of cluster.members) {
      const distance = surface.triangles[m]?.closestPointToPoint(p, near).distanceTo(p);
      if (distance !== undefined && distance < best) {
        best = distance;
        found = { triangle: m, point: near.clone() };
      }
    }
  }
  return found;
}

/** The deepest point of a set of points in a closed surface. */
interface DeepestPoint {
  /** The depth, in meters: 0 when no point is inside. */
  readonly depth: number;
  /** The index of the deepest point, or -1 when no point is inside. */
  readonly index: number;
}

/**
 * Finds the deepest point of a set in a closed surface: the distance from the point to the
 * nearest triangle, for a point with a winding number of more than 0.5. A point outside the box
 * of the surface is outside. The caps of the open loops count as surface, so the depth of a point
 * near a cut is its distance to the cap. Only tests use it.
 *
 * @param points The points.
 * @param surface The surface.
 * @returns The deepest point.
 */
export function closedDepth(points: readonly Vector3[], surface: ClosedSurface): DeepestPoint {
  let deepest: DeepestPoint = { depth: 0, index: -1 };
  for (const [index, point] of points.entries()) {
    if (!surface.box.containsPoint(point) || Math.abs(windingNumber(surface, point)) <= 0.5) {
      continue;
    }
    const depth = surfaceDistance(surface, point);
    if (depth > deepest.depth) {
      deepest = { depth, index };
    }
  }
  return deepest;
}

/**
 * Gives the smallest distance between two posed parts, up to a limit. Only tests use it.
 *
 * @param a The first part.
 * @param b The second part.
 * @param limit The largest distance of interest, in meters. A pair of triangles farther apart
 *   than this is not measured.
 * @returns The distance, 0 if the parts cross, or `limit` if they are at least that far apart.
 */
export function partDistance(a: PosedPart, b: PosedPart, limit: number): number {
  let best = limit;
  if (!a.box.clone().expandByScalar(limit).intersectsBox(b.box)) {
    return best;
  }
  for (const ta of a.triangles) {
    boxOf(ta, boxA).expandByScalar(best);
    if (!boxA.intersectsBox(b.box)) {
      continue;
    }
    for (const tb of b.triangles) {
      if (!boxA.intersectsBox(boxOf(tb, boxB))) {
        continue;
      }
      best = Math.min(best, triangleDistance(ta, tb));
      if (best === 0) {
        return 0;
      }
      boxOf(ta, boxA).expandByScalar(best);
    }
  }
  return best;
}

/**
 * Builds the triangles of a closed box with its faces to the outside. Only tests use it.
 *
 * @param min The corner with the smallest x, y, and z.
 * @param max The corner with the largest x, y, and z.
 * @returns The 12 triangles.
 */
export function boxTriangles(min: Vec3, max: Vec3): Triangle[] {
  const corner = (i: number): Vector3 =>
    new Vector3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
  const faces = [
    [0, 4, 6, 2],
    [1, 3, 7, 5],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 2, 3, 1],
    [4, 5, 7, 6],
  ] as const;
  return faces.flatMap(([a, b, c, d]) => [
    new Triangle(corner(a), corner(b), corner(c)),
    new Triangle(corner(a), corner(c), corner(d)),
  ]);
}

/** The smallest gap from a part to a closed surface. */
interface SurfaceGap {
  /** The gap, in meters: 0 when the part touches the surface, or the limit when none is nearer. */
  readonly gap: number;
  /** The index of the triangle of the part with the nearest point, or -1 when none is nearer. */
  readonly index: number;
}

const gapMiddle = new Vector3();

/**
 * Gives the smallest gap from the triangles of a part to a closed surface: the distance of the
 * nearest points. The gap is 0 when a triangle crosses the surface or the part is inside it. A
 * piece of a part that crosses no triangle is either inside or outside, so the first corner of one
 * triangle of each piece tells it. A cluster of the surface whose bounding sphere is farther than
 * the best gap is skipped, and so is a triangle whose box is farther. Only tests and tools use it.
 *
 * @param triangles The posed triangles of the part.
 * @param surface The closed surface.
 * @param limit The largest gap of interest, in meters.
 * @param probes The indices of the triangles whose first corner tells if the part is inside: one
 *   for each connected piece of the part. All triangles by default.
 * @returns The gap, and the triangle of the part with the nearest point.
 */
export function surfaceGap(
  triangles: readonly Triangle[],
  surface: ClosedSurface,
  limit = Infinity,
  probes: Iterable<number> = triangles.keys(),
): SurfaceGap {
  for (const index of probes) {
    const corner = triangles[index]?.a;
    if (
      corner &&
      surface.box.containsPoint(corner) &&
      Math.abs(windingNumber(surface, corner)) > 0.5
    ) {
      return { gap: 0, index };
    }
  }

  // The box of each triangle of the surface, made on its first use.
  const boxes: (Box3 | undefined)[] = [];
  let best: SurfaceGap = { gap: limit, index: -1 };
  for (const [index, part] of triangles.entries()) {
    part.getMidpoint(gapMiddle);
    const radius = Math.max(
      gapMiddle.distanceTo(part.a),
      gapMiddle.distanceTo(part.b),
      gapMiddle.distanceTo(part.c),
    );
    boxOf(part, boxA).expandByScalar(best.gap);
    for (const cluster of surface.clusters) {
      if (cluster.middle.distanceTo(gapMiddle) - cluster.radius - radius >= best.gap) {
        continue;
      }
      for (const m of cluster.members) {
        const other = surface.triangles[m];
        if (!other) {
          continue;
        }
        const otherBox = boxes[m] ?? boxOf(other, new Box3());
        boxes[m] = otherBox;
        if (!boxA.intersectsBox(otherBox)) {
          continue;
        }
        const gap = triangleDistance(part, other);
        if (gap < best.gap) {
          best = { gap, index };
          boxOf(part, boxA).expandByScalar(gap);
        }
        if (gap === 0) {
          return best;
        }
      }
    }
  }
  return best;
}

/** A look at the conductor: the yaw and the pitch of the head, in radians. */
type Look = readonly [yaw: number, pitch: number];

/**
 * Finds the largest looks at the conductor of the players of some instruments in the demo
 * layouts. All players face the podium, so the yaw is near 0, and the pitch follows the heights.
 *
 * @param instruments The instruments.
 * @returns The corners of the range of the yaws and the pitches, with no two the same to 0.001.
 */
export async function demoLooks(instruments: readonly InstrumentId[]): Promise<Look[]> {
  const looks: Look[] = [];
  for (const demo of await patchedDemos()) {
    const score = scoreOf(demo.bytes);
    const models = new ModelCache();
    const layout = layoutScene(score, models);
    const bear = models.get(CONDUCTOR.species, CONDUCTOR.instrument, 4);
    if (!layout.conductor) {
      continue;
    }
    const head = headOf(bear, layout.conductor);
    for (const { cast, position, facing } of layout.players) {
      if (instruments.includes(cast.instrument)) {
        const model = models.get(cast.species, cast.instrument, cast.kettles, cast.support);
        looks.push(lookAngles(model.skeleton, position, facing, head));
      }
    }
  }
  const yaws = looks.map(([yaw]) => yaw);
  const pitches = looks.map(([, pitch]) => pitch);
  const corners = [Math.min(...yaws), Math.max(...yaws)].flatMap((yaw) =>
    [Math.min(...pitches), Math.max(...pitches)].map((pitch): Look => [yaw, pitch]),
  );
  const key = ([yaw, pitch]: Look): string => `${yaw.toFixed(3)} ${pitch.toFixed(3)}`;
  return [...new Map(corners.map((look) => [key(look), look])).values()];
}

/**
 * Gives the smallest distance from the head of a player to a part of its instrument while it
 * plays, with each look, at some song times, and over the looks and the breaths of 30 s of the
 * wall clock.
 *
 * @param scene The scene.
 * @param index The index of the player.
 * @param looks The looks at the conductor.
 * @param songTimes The song times.
 * @param part Gives the part of the instrument of a posed skeleton.
 * @param limit The largest distance of interest, in meters.
 * @returns The distance, up to `limit`.
 * @throws Error if the scene has no player at the index.
 */
export function headClearance(
  scene: TestScene,
  index: number,
  looks: readonly Look[],
  songTimes: readonly number[],
  part: (posed: PosedSkeleton) => PosedPart,
  limit: number,
): number {
  const plan = scene.plan.players[index];
  const place = scene.layout.players[index];
  if (!plan || !place) {
    throw new Error(`The scene has no player ${index}.`);
  }
  const { species, instrument, kettles, support } = place.cast;
  const model = scene.models.get(species, instrument, kettles, support);
  let nearest = limit;
  for (const [lookYaw, lookPitch] of looks) {
    const one: PosePlan = { ...scene.plan, players: [{ ...plan, lookYaw, lookPitch }] };
    const buffer = createScenePose(one);
    for (const songTime of songTimes) {
      for (let wall = 10; wall < 40; wall += 2) {
        const pose = poseAt(one, songTime, wall, PLAYING, [], buffer).players[0];
        if (!pose) {
          throw new Error('The player has no pose.');
        }
        const posed = poseSkeleton(model, pose);
        nearest = Math.min(nearest, partDistance(posedPart(posed, HEAD_BONES), part(posed), limit));
      }
    }
  }
  return nearest;
}
