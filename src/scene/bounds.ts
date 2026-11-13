import { Matrix4 } from 'three';
import type { BufferGeometry, SkinnedMesh, Sphere } from 'three';

/**
 * The spheres of the bones of a skinned geometry in the bind pose: for each bone, a center and a
 * radius that hold each vertex that the bone moves, with the largest move of the morph targets of
 * the vertex.
 */
export interface BoneSpheres {
  /** Three numbers for each bone: the center, in the axes of the bind pose. */
  readonly centers: Float32Array;
  /** The radius of each bone, or -1 for a bone that moves no vertex. */
  readonly radii: Float32Array;
  /** The largest distance of the sum of the weights of a vertex from 1. */
  readonly weightError: number;
}

/**
 * The largest distance of the sum of the weights of a vertex from 1. A sum of `1 + e` moves the
 * vertex by `e` times its distance from the origin of the world, so the fit adds this move to the
 * radius.
 */
const WEIGHT_SUM_TOLERANCE = 1e-3;

/**
 * The margin of a fitted sphere, in meters: it holds the float error of the transform of the
 * sphere into the axes of the mesh and back.
 */
const SPHERE_MARGIN = 0.001;

/**
 * Calculates the bone spheres of a skinned geometry (design 4.5). The vertex shader moves a vertex
 * `v` (with its morph moves) to `sum(w_k * B_k * v)`, with the bone matrix `B_k` and the weight
 * `w_k` of each of its bones. Each bone matrix of a player is a turn, a move, and a scale of at
 * most 1 (the eyes). Thus `B_k * v` lies within the radius of bone `k` of `B_k` times its center,
 * and a vertex whose weights sum to 1 lies in the convex hull of these balls.
 *
 * @param geometry The geometry, with the attributes `position`, `skinIndex`, and `skinWeight`, and
 *   relative morph targets of the position, if any.
 * @param boneCount The count of bones of the skeleton.
 * @returns The spheres, or `null` when a vertex has weights that do not sum to 1 or a weight below
 *   0, or the geometry has no skin.
 */
export function boneSpheres(geometry: BufferGeometry, boneCount: number): BoneSpheres | null {
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight) {
    return null;
  }
  const morphs = geometry.morphAttributes['position'] ?? [];
  if (morphs.length > 0 && !geometry.morphTargetsRelative) {
    return null;
  }

  const vertexCount = position.count;
  let weightError = 0;
  const moves = new Float32Array(vertexCount);
  for (const morph of morphs) {
    for (let v = 0; v < vertexCount; v++) {
      moves[v] = (moves[v] ?? 0) + Math.hypot(morph.getX(v), morph.getY(v), morph.getZ(v));
    }
  }

  // The box of the vertices of each bone gives its center.
  const low = new Float32Array(boneCount * 3).fill(Infinity);
  const high = new Float32Array(boneCount * 3).fill(-Infinity);
  for (let v = 0; v < vertexCount; v++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(v, k);
      if (weight < 0) {
        return null;
      }
      sum += weight;
      const bone = skinIndex.getComponent(v, k);
      if (weight === 0 || bone >= boneCount) {
        continue;
      }
      const point = [position.getX(v), position.getY(v), position.getZ(v)] as const;
      for (let axis = 0; axis < 3; axis++) {
        const i = bone * 3 + axis;
        low[i] = Math.min(low[i] ?? Infinity, point[axis] ?? 0);
        high[i] = Math.max(high[i] ?? -Infinity, point[axis] ?? 0);
      }
    }
    weightError = Math.max(weightError, Math.abs(sum - 1));
    if (weightError > WEIGHT_SUM_TOLERANCE) {
      return null;
    }
  }
  const centers = new Float32Array(boneCount * 3);
  for (let i = 0; i < boneCount * 3; i++) {
    centers[i] = ((low[i] ?? 0) + (high[i] ?? 0)) / 2;
  }

  // The radius of each bone: the farthest vertex with its morph moves.
  const radii = new Float32Array(boneCount).fill(-1);
  for (let v = 0; v < vertexCount; v++) {
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(v, k);
      if (skinWeight.getComponent(v, k) === 0 || bone >= boneCount) {
        continue;
      }
      const distance =
        Math.hypot(
          position.getX(v) - (centers[bone * 3] ?? 0),
          position.getY(v) - (centers[bone * 3 + 1] ?? 0),
          position.getZ(v) - (centers[bone * 3 + 2] ?? 0),
        ) + (moves[v] ?? 0);
      radii[bone] = Math.max(radii[bone] ?? -1, distance);
    }
  }
  return { centers, radii, weightError };
}

/**
 * Calculates the sphere of a skinned geometry in its bind pose from its bone spheres
 * ({@link boneSpheres}): the middle of the box of the bone centers, and the farthest bone sphere
 * from it.
 *
 * @param spheres The bone spheres of the geometry.
 * @param out The sphere to write, in the axes of the geometry.
 * @returns `out`.
 */
export function bindSphere(spheres: BoneSpheres, out: Sphere): Sphere {
  const { centers, radii } = spheres;
  let lowX = Infinity;
  let lowY = Infinity;
  let lowZ = Infinity;
  let highX = -Infinity;
  let highY = -Infinity;
  let highZ = -Infinity;
  for (let b = 0; b < radii.length; b++) {
    if ((radii[b] ?? -1) < 0) {
      continue;
    }
    const x = centers[b * 3] ?? 0;
    const y = centers[b * 3 + 1] ?? 0;
    const z = centers[b * 3 + 2] ?? 0;
    lowX = Math.min(lowX, x);
    lowY = Math.min(lowY, y);
    lowZ = Math.min(lowZ, z);
    highX = Math.max(highX, x);
    highY = Math.max(highY, y);
    highZ = Math.max(highZ, z);
  }
  out.center.set((lowX + highX) / 2, (lowY + highY) / 2, (lowZ + highZ) / 2);

  let radius = 0;
  for (let b = 0; b < radii.length; b++) {
    const r = radii[b] ?? -1;
    if (r >= 0) {
      const dx = (centers[b * 3] ?? 0) - out.center.x;
      const dy = (centers[b * 3 + 1] ?? 0) - out.center.y;
      const dz = (centers[b * 3 + 2] ?? 0) - out.center.z;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz) + r);
    }
  }
  out.radius = radius;
  return out;
}

/** The inverse of the world matrix of a mesh, written before each read. */
const inverse = new Matrix4();

/** The moved center of each bone sphere of a mesh, written before each read. */
let moved = new Float32Array(0);

/**
 * Fits the bounding sphere of a posed skinned mesh from the bone matrices of its frame
 * ({@link boneSpheres}), so that three.js can leave the mesh out of each pass whose view or shadow
 * camera does not see the sphere. A pass draws no pixel of a mesh outside its frustum, so the cut
 * keeps each pixel.
 *
 * @param mesh The mesh, whose skeleton computed the bone matrices of the frame, in world axes.
 * @param spheres The bone spheres of its geometry.
 * @param out The sphere to write, in the axes of the mesh.
 * @returns `out`.
 */
export function fitPoseSphere(mesh: SkinnedMesh, spheres: BoneSpheres, out: Sphere): Sphere {
  const m = mesh.skeleton.boneMatrices;
  const { centers, radii } = spheres;
  const boneCount = radii.length;
  // A skeleton with no bone matrices yet gives a sphere that no frustum leaves out.
  if (!m) {
    out.center.set(0, 0, 0);
    out.radius = Infinity;
    return out;
  }
  if (moved.length < boneCount * 3) {
    moved = new Float32Array(boneCount * 3);
  }

  // The box of the moved centers gives the center of the sphere.
  let lowX = Infinity;
  let lowY = Infinity;
  let lowZ = Infinity;
  let highX = -Infinity;
  let highY = -Infinity;
  let highZ = -Infinity;
  for (let b = 0; b < boneCount; b++) {
    if ((radii[b] ?? -1) < 0) {
      continue;
    }
    const x = centers[b * 3] ?? 0;
    const y = centers[b * 3 + 1] ?? 0;
    const z = centers[b * 3 + 2] ?? 0;
    const e = b * 16;
    const mx = (m[e] ?? 0) * x + (m[e + 4] ?? 0) * y + (m[e + 8] ?? 0) * z + (m[e + 12] ?? 0);
    const my = (m[e + 1] ?? 0) * x + (m[e + 5] ?? 0) * y + (m[e + 9] ?? 0) * z + (m[e + 13] ?? 0);
    const mz = (m[e + 2] ?? 0) * x + (m[e + 6] ?? 0) * y + (m[e + 10] ?? 0) * z + (m[e + 14] ?? 0);
    moved[b * 3] = mx;
    moved[b * 3 + 1] = my;
    moved[b * 3 + 2] = mz;
    lowX = Math.min(lowX, mx);
    lowY = Math.min(lowY, my);
    lowZ = Math.min(lowZ, mz);
    highX = Math.max(highX, mx);
    highY = Math.max(highY, my);
    highZ = Math.max(highZ, mz);
  }
  const cx = (lowX + highX) / 2;
  const cy = (lowY + highY) / 2;
  const cz = (lowZ + highZ) / 2;

  let radius = 0;
  for (let b = 0; b < boneCount; b++) {
    const r = radii[b] ?? -1;
    if (r >= 0) {
      const dx = (moved[b * 3] ?? 0) - cx;
      const dy = (moved[b * 3 + 1] ?? 0) - cy;
      const dz = (moved[b * 3 + 2] ?? 0) - cz;
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz) + r);
    }
  }
  // A sum of weights of 1 + e moves a vertex by e times its distance from the world origin.
  radius += spheres.weightError * (Math.hypot(cx, cy, cz) + radius) + SPHERE_MARGIN;

  inverse.copy(mesh.matrixWorld).invert();
  out.center.set(cx, cy, cz).applyMatrix4(inverse);
  out.radius = radius;
  return out;
}
