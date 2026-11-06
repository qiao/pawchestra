import { FINISHES, FINISH_ORDER } from './mesh.ts';
import type { MeshData } from './mesh.ts';
import { boneIndex } from './rig.ts';

/**
 * The step of the weld grid, in meters. Two corners at the same point of this grid share one
 * vertex. The models place their corners with float math, so the two corners of a seam can
 * differ by a few micrometers.
 */
const WELD_STEP = 1e-4;

/**
 * The welded vertices of a mesh: the corners at one point. The corners of two bones can share a
 * vertex, for example on the seam of the torso between `spine` and `chest`. Each corner still
 * follows its own bones (design 4.4).
 */
interface Welds {
  /**
   * The start of the corner list of each vertex in {@link Welds.corners}, with one more entry
   * at the end. The corners of vertex `v` are `corners[start[v]]` to `corners[start[v + 1] - 1]`.
   */
  readonly start: Uint32Array;
  /** The corners, in the order of their vertices. */
  readonly corners: Uint32Array;
}

/**
 * Welds the corners of a mesh by their position.
 *
 * @param mesh The mesh data.
 * @returns The welded vertices.
 */
export function weldCorners(mesh: MeshData): Welds {
  const cornerCount = mesh.bones.length;
  const vertexOf = new Uint32Array(cornerCount);
  const p = mesh.positions;
  // An open hash table of the grid points, with at least two slots for each corner. Each slot
  // holds a vertex index plus 1, or 0 when it is free.
  let size = 1;
  while (size < cornerCount * 2) {
    size *= 2;
  }
  const slots = new Uint32Array(size);
  const grid = new Int32Array(cornerCount * 3);
  let vertexCount = 0;
  for (let c = 0; c < cornerCount; c++) {
    const x = Math.round((p[c * 3] ?? 0) / WELD_STEP);
    const y = Math.round((p[c * 3 + 1] ?? 0) / WELD_STEP);
    const z = Math.round((p[c * 3 + 2] ?? 0) / WELD_STEP);
    let slot =
      (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ Math.imul(z, 83_492_791)) & (size - 1);
    for (;;) {
      const entry = slots[slot] ?? 0;
      if (entry === 0) {
        grid[vertexCount * 3] = x;
        grid[vertexCount * 3 + 1] = y;
        grid[vertexCount * 3 + 2] = z;
        vertexCount++;
        slots[slot] = vertexCount;
        vertexOf[c] = vertexCount - 1;
        break;
      }
      const v = entry - 1;
      if (grid[v * 3] === x && grid[v * 3 + 1] === y && grid[v * 3 + 2] === z) {
        vertexOf[c] = v;
        break;
      }
      slot = (slot + 1) & (size - 1);
    }
  }
  const start = new Uint32Array(vertexCount + 1);
  for (const vertex of vertexOf) {
    start[vertex + 1] = (start[vertex + 1] ?? 0) + 1;
  }
  for (let v = 0; v < vertexCount; v++) {
    start[v + 1] = (start[v + 1] ?? 0) + (start[v] ?? 0);
  }
  const fill = start.slice(0, vertexCount);
  const corners = new Uint32Array(cornerCount);
  for (let c = 0; c < cornerCount; c++) {
    const vertex = vertexOf[c] ?? 0;
    const at = fill[vertex] ?? 0;
    corners[at] = c;
    fill[vertex] = at + 1;
  }
  return { start, corners };
}

/** The face values of a mesh. */
interface FaceData {
  /** The unit normal of each triangle: x, y, z. A triangle with no area has 0, 0, 0. */
  readonly normals: Float32Array;
  /** The angle of each corner in its triangle, in radians. */
  readonly angles: Float32Array;
  /** The area of each triangle, in square meters. */
  readonly areas: Float32Array;
}

/**
 * Calculates the unit normal of each triangle and the angle of each corner.
 *
 * @param mesh The mesh data.
 * @returns The normals, the angles, and the areas.
 */
function faceData(mesh: MeshData): FaceData {
  const p = mesh.positions;
  const triangleCount = mesh.finishes.length;
  const normals = new Float32Array(triangleCount * 3);
  const angles = new Float32Array(triangleCount * 3);
  const areas = new Float32Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const i = t * 9;
    const ax = p[i] ?? 0;
    const ay = p[i + 1] ?? 0;
    const az = p[i + 2] ?? 0;
    const ux = (p[i + 3] ?? 0) - ax;
    const uy = (p[i + 4] ?? 0) - ay;
    const uz = (p[i + 5] ?? 0) - az;
    const wx = (p[i + 6] ?? 0) - ax;
    const wy = (p[i + 7] ?? 0) - ay;
    const wz = (p[i + 8] ?? 0) - az;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    areas[t] = length / 2;
    if (length > 0) {
      normals[t * 3] = nx / length;
      normals[t * 3 + 1] = ny / length;
      normals[t * 3 + 2] = nz / length;
    }
    // The angle at corner k, between the edges to the two other corners.
    for (let k = 0; k < 3; k++) {
      const o = i + k * 3;
      const b = i + ((k + 1) % 3) * 3;
      const c = i + ((k + 2) % 3) * 3;
      const ex = (p[b] ?? 0) - (p[o] ?? 0);
      const ey = (p[b + 1] ?? 0) - (p[o + 1] ?? 0);
      const ez = (p[b + 2] ?? 0) - (p[o + 2] ?? 0);
      const fx = (p[c] ?? 0) - (p[o] ?? 0);
      const fy = (p[c + 1] ?? 0) - (p[o + 1] ?? 0);
      const fz = (p[c + 2] ?? 0) - (p[o + 2] ?? 0);
      const lengths = Math.sqrt((ex * ex + ey * ey + ez * ez) * (fx * fx + fy * fy + fz * fz));
      angles[t * 3 + k] =
        lengths > 0
          ? Math.acos(Math.min(1, Math.max(-1, (ex * fx + ey * fy + ez * fz) / lengths)))
          : 0;
    }
  }
  return { normals, angles, areas };
}

/** The cosine of the crease angle of each finish, in the order of {@link FINISH_ORDER}. */
const CREASE_COSINES = FINISH_ORDER.map((finish) =>
  Math.cos((FINISHES[finish].crease * Math.PI) / 180),
);

/**
 * Calculates the crease normal of each corner of a mesh (design 4.5, materials). A corner gets
 * the mean of the normals of the faces at its welded vertex that turn from its own face by less
 * than the crease angle of its finish. Each face counts with the angle of its corner at the
 * vertex. Thus a curved part looks smooth, and a box keeps its hard edges.
 *
 * @param mesh The mesh data.
 * @param welds The welded vertices of the mesh.
 * @param data The face data of the mesh.
 * @returns The unit normal of each corner: x, y, z, in the order of the corners.
 */
function creaseNormals(mesh: MeshData, welds: Welds, data: FaceData): Float32Array {
  const { normals: faces, angles } = data;
  const out = new Float32Array(mesh.bones.length * 3);
  const vertexCount = welds.start.length - 1;
  for (let v = 0; v < vertexCount; v++) {
    const first = welds.start[v] ?? 0;
    const end = welds.start[v + 1] ?? 0;
    for (let i = first; i < end; i++) {
      const corner = welds.corners[i] ?? 0;
      const own = Math.floor(corner / 3);
      const ox = faces[own * 3] ?? 0;
      const oy = faces[own * 3 + 1] ?? 0;
      const oz = faces[own * 3 + 2] ?? 0;
      const finishCrease = CREASE_COSINES[mesh.finishes[own] ?? 0] ?? 1;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let j = first; j < end; j++) {
        const other = welds.corners[j] ?? 0;
        const face = Math.floor(other / 3);
        const fx = faces[face * 3] ?? 0;
        const fy = faces[face * 3 + 1] ?? 0;
        const fz = faces[face * 3 + 2] ?? 0;
        // A crease of 0 has the cosine 1, so only the own face (and a face of the same
        // direction) counts.
        if (other === corner || ox * fx + oy * fy + oz * fz >= finishCrease - 1e-6) {
          const weight = angles[other] ?? 0;
          sx += fx * weight;
          sy += fy * weight;
          sz += fz * weight;
        }
      }
      let length = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (length === 0) {
        // A face with no area: it takes its own normal, or up.
        [sx, sy, sz] = ox !== 0 || oy !== 0 || oz !== 0 ? [ox, oy, oz] : [0, 1, 0];
        length = 1;
      }
      out[corner * 3] = sx / length;
      out[corner * 3 + 1] = sy / length;
      out[corner * 3 + 2] = sz / length;
    }
  }
  return out;
}

/**
 * The values of the baked occlusion (design 4.5, materials). The occlusion darkens the folds of
 * a model: the neck under the head, the joints, and the parts that touch.
 */
export const OCCLUSION = {
  /** The largest distance from a vertex to the middle of an occluding triangle, in meters. */
  radius: 0.12,
  /** The factor of the occlusion sum. */
  strength: 4.5,
  /** The darkest value: the light that a vertex keeps in the deepest fold. */
  floor: 0.4,
} as const;

/**
 * The bones that move far from the body in a pose: the arms and the pieces in the hands. A raised
 * arm leaves the side of the torso, so an occlusion between the arm and the torso of the bind
 * pose would stay as a dark stripe.
 */
const FREE_BONES: ReadonlySet<number> = new Set(
  (
    [
      'shoulderL',
      'upperArmL',
      'forearmL',
      'handL',
      'fingersL',
      'shoulderR',
      'upperArmR',
      'forearmR',
      'handR',
      'fingersR',
      'bow',
      'malletL',
      'malletR',
      'baton',
      'slide',
    ] as const
  ).map((name) => boneIndex(name)),
);

/**
 * Tells which bones can shade each other. A bone shades itself, its parent, and its children.
 * The other bones of the body stay near each other in each pose, so they all shade each other:
 * the head shades the chest, and the thighs shade the hips. A free bone (an arm or a piece in a
 * hand) shades only its parent and its children.
 *
 * @param parents The parent of each bone, or -1 for the root. An empty list gives one bone.
 * @param boneCount The number of bones.
 * @returns A table of `boneCount × boneCount` flags.
 */
function relatedBones(parents: readonly number[], boneCount: number): Uint8Array {
  const related = new Uint8Array(boneCount * boneCount);
  for (let a = 0; a < boneCount; a++) {
    for (let b = 0; b < boneCount; b++) {
      const near = a === b || parents[a] === b || parents[b] === a;
      const body = parents.length > 0 && !FREE_BONES.has(a) && !FREE_BONES.has(b);
      if (near || body) {
        related[a * boneCount + b] = 1;
      }
    }
  }
  return related;
}

/**
 * Bakes an ambient occlusion for each corner of a mesh (design 4.5, materials). Each triangle
 * near a vertex counts as a disc that faces its normal. A disc in front of the vertex that turns
 * its front to the vertex hides a part of the sky of the vertex. The sum of these parts gives
 * the occlusion. A convex part does not shade itself, because each of its own triangles is
 * behind the plane of its vertices. The bake reads only the main bones (design 4.7): a disc
 * takes the main bone of the first corner of its triangle, and a vertex the main bone of its
 * first corner.
 *
 * @param mesh The mesh data.
 * @param normals The unit normal of each corner.
 * @param parents The parent of each bone, or -1 for the root.
 * @param welds The welded vertices of the mesh.
 * @param data The face data of the mesh.
 * @returns The light that each corner keeps, from {@link OCCLUSION.floor} to 1.
 */
function bakeOcclusion(
  mesh: MeshData,
  normals: Float32Array,
  parents: readonly number[],
  welds: Welds,
  data: FaceData,
): Float32Array {
  const { normals: faces, areas } = data;
  const triangleCount = mesh.finishes.length;
  const p = mesh.positions;
  let boneCount = parents.length;
  for (const bone of mesh.bones) {
    boneCount = Math.max(boneCount, bone + 1);
  }
  const related = relatedBones(parents, boneCount);

  // The grid of the triangle middles. A cell is half a radius wide, so the triangles within the
  // radius of a vertex are in the 5 × 5 × 5 cells around it.
  const radius = OCCLUSION.radius;
  const cellSize = radius / 2;
  const middles = new Float32Array(triangleCount * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let t = 0; t < triangleCount; t++) {
    const i = t * 9;
    const x = ((p[i] ?? 0) + (p[i + 3] ?? 0) + (p[i + 6] ?? 0)) / 3;
    const y = ((p[i + 1] ?? 0) + (p[i + 4] ?? 0) + (p[i + 7] ?? 0)) / 3;
    const z = ((p[i + 2] ?? 0) + (p[i + 5] ?? 0) + (p[i + 8] ?? 0)) / 3;
    middles[t * 3] = x;
    middles[t * 3 + 1] = y;
    middles[t * 3 + 2] = z;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const out = new Float32Array(mesh.bones.length).fill(1);
  if (triangleCount === 0) {
    return out;
  }
  const nx = Math.floor((maxX - minX) / cellSize) + 1;
  const ny = Math.floor((maxY - minY) / cellSize) + 1;
  const nz = Math.floor((maxZ - minZ) / cellSize) + 1;
  const cellCount = nx * ny * nz;
  // The triangles of one cell, one main bone, and one main direction of the normal merge into
  // one disc: the sum of the areas, at the middle and with the normal of the mean of the
  // triangles, each weighted by its area. Thus a vertex tests about a fourth of the discs.
  const discOf = new Map<number, number>();
  const sums: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const fx = faces[t * 3] ?? 0;
    const fy = faces[t * 3 + 1] ?? 0;
    const fz = faces[t * 3 + 2] ?? 0;
    const ax = Math.abs(fx);
    const ay = Math.abs(fy);
    const az = Math.abs(fz);
    const direction =
      ax >= ay && ax >= az ? (fx > 0 ? 0 : 1) : ay >= az ? (fy > 0 ? 2 : 3) : fz > 0 ? 4 : 5;
    const cell =
      (Math.floor(((middles[t * 3 + 2] ?? 0) - minZ) / cellSize) * ny +
        Math.floor(((middles[t * 3 + 1] ?? 0) - minY) / cellSize)) *
        nx +
      Math.floor(((middles[t * 3] ?? 0) - minX) / cellSize);
    const bone = mesh.bones[t * 3] ?? 0;
    const key = (cell * boneCount + bone) * 6 + direction;
    let disc = discOf.get(key);
    if (disc === undefined) {
      disc = sums.length / 9;
      discOf.set(key, disc);
      sums.push(0, 0, 0, 0, 0, 0, 0, bone, cell);
    }
    const area = areas[t] ?? 0;
    const at = disc * 9;
    sums[at] = (sums[at] ?? 0) + (middles[t * 3] ?? 0) * area;
    sums[at + 1] = (sums[at + 1] ?? 0) + (middles[t * 3 + 1] ?? 0) * area;
    sums[at + 2] = (sums[at + 2] ?? 0) + (middles[t * 3 + 2] ?? 0) * area;
    sums[at + 3] = (sums[at + 3] ?? 0) + fx * area;
    sums[at + 4] = (sums[at + 4] ?? 0) + fy * area;
    sums[at + 5] = (sums[at + 5] ?? 0) + fz * area;
    sums[at + 6] = (sums[at + 6] ?? 0) + area;
  }
  const discCount = sums.length / 9;
  const cellStart = new Uint32Array(cellCount + 1);
  for (let d = 0; d < discCount; d++) {
    const cell = sums[d * 9 + 8] ?? 0;
    cellStart[cell + 1] = (cellStart[cell + 1] ?? 0) + 1;
  }
  for (let c = 0; c < cellCount; c++) {
    cellStart[c + 1] = (cellStart[c + 1] ?? 0) + (cellStart[c] ?? 0);
  }
  // The discs in the order of their cells, 8 values for each: the middle, the unit normal, the
  // area, and the bone.
  const fill = cellStart.slice(0, cellCount);
  const discs = new Float32Array(discCount * 8);
  for (let d = 0; d < discCount; d++) {
    const i = d * 9;
    const area = sums[i + 6] ?? 0;
    const scale = area > 0 ? 1 / area : 0;
    const cell = sums[i + 8] ?? 0;
    const at = (fill[cell] ?? 0) * 8;
    fill[cell] = (fill[cell] ?? 0) + 1;
    const sx = sums[i + 3] ?? 0;
    const sy = sums[i + 4] ?? 0;
    const sz = sums[i + 5] ?? 0;
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz);
    discs[at] = (sums[i] ?? 0) * scale;
    discs[at + 1] = (sums[i + 1] ?? 0) * scale;
    discs[at + 2] = (sums[i + 2] ?? 0) * scale;
    discs[at + 3] = length > 0 ? sx / length : 0;
    discs[at + 4] = length > 0 ? sy / length : 0;
    discs[at + 5] = length > 0 ? sz / length : 0;
    discs[at + 6] = area;
    discs[at + 7] = sums[i + 7] ?? 0;
  }

  const vertexCount = welds.start.length - 1;
  for (let v = 0; v < vertexCount; v++) {
    const first = welds.start[v] ?? 0;
    const end = welds.start[v + 1] ?? 0;
    const corner = welds.corners[first] ?? 0;
    const px = p[corner * 3] ?? 0;
    const py = p[corner * 3 + 1] ?? 0;
    const pz = p[corner * 3 + 2] ?? 0;
    // The mean normal of the corners: at a hard edge, the vertex sees the sky of both faces.
    let rx = 0;
    let ry = 0;
    let rz = 0;
    for (let i = first; i < end; i++) {
      const c = welds.corners[i] ?? 0;
      rx += normals[c * 3] ?? 0;
      ry += normals[c * 3 + 1] ?? 0;
      rz += normals[c * 3 + 2] ?? 0;
    }
    const length = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (length === 0) {
      continue;
    }
    rx /= length;
    ry /= length;
    rz /= length;
    const row = (mesh.bones[corner] ?? 0) * boneCount;
    const cx = Math.floor((px - minX) / cellSize);
    const cy = Math.floor((py - minY) / cellSize);
    const cz = Math.floor((pz - minZ) / cellSize);
    const r2 = radius * radius;
    let sum = 0;
    for (let z = Math.max(0, cz - 2); z <= Math.min(nz - 1, cz + 2); z++) {
      for (let y = Math.max(0, cy - 2); y <= Math.min(ny - 1, cy + 2); y++) {
        const rowStart = (z * ny + y) * nx;
        const from = cellStart[rowStart + Math.max(0, cx - 2)] ?? 0;
        const to = cellStart[rowStart + Math.min(nx - 1, cx + 2) + 1] ?? 0;
        for (let k = from * 8; k < to * 8; k += 8) {
          const dx = (discs[k] ?? 0) - px;
          const dy = (discs[k + 1] ?? 0) - py;
          const dz = (discs[k + 2] ?? 0) - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2 || d2 === 0) {
            continue;
          }
          // The vertex sees the disc in front of its plane, and the disc turns its front to the
          // vertex. The limit of 1e-3 keeps the neighbors of a flat or a convex surface out.
          const front = rx * dx + ry * dy + rz * dz;
          const back = -(
            (discs[k + 3] ?? 0) * dx +
            (discs[k + 4] ?? 0) * dy +
            (discs[k + 5] ?? 0) * dz
          );
          if (back <= 0 || front * front <= 1e-6 * d2 || front <= 0) {
            continue;
          }
          if (related[row + (discs[k + 7] ?? 0)] === 0) {
            continue;
          }
          const area = discs[k + 6] ?? 0;
          // The cosines are front / d and back / d.
          sum += (area * front * back) / (d2 * (Math.PI * d2 + area));
        }
      }
    }
    const light = Math.max(OCCLUSION.floor, 1 - OCCLUSION.strength * sum);
    for (let i = first; i < end; i++) {
      out[welds.corners[i] ?? 0] = light;
    }
  }
  return out;
}

/** The shading of a mesh: the values that the geometry adds to the mesh data. */
interface MeshShading {
  /** The unit crease normal of each corner: x, y, z, in the order of the corners. */
  readonly normals: Float32Array;
  /**
   * The light that each corner keeps after the baked occlusion, from {@link OCCLUSION.floor} to
   * 1, or `null` for a mesh with no occlusion.
   */
  readonly light: Float32Array | null;
}

/**
 * Calculates the shading of a mesh (design 4.5, materials): the crease normals, and for a player
 * the baked occlusion. The work runs one time for each model, before the first frame of a scene.
 *
 * @param mesh The mesh data.
 * @param parents The parent of each bone of a player, or -1 for the root, for the occlusion. A
 *   bone shades its parent and its children, and the bones of the body shade each other. An arm
 *   and a piece in a hand move far in a pose, so they do not shade the body. `null` gives no
 *   occlusion.
 * @returns The normals and the light.
 */
export function shadeMesh(mesh: MeshData, parents: readonly number[] | null): MeshShading {
  const welds = weldCorners(mesh);
  const data = faceData(mesh);
  const normals = creaseNormals(mesh, welds, data);
  const light = parents ? bakeOcclusion(mesh, normals, parents, welds, data) : null;
  return { normals, light };
}
