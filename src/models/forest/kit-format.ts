import type { srgb } from '../mesh.ts';
import { toBase64, writeVarint, zigzag } from '../packed-bytes.ts';
import type { byteReader, readByte, readVarint, unzigzag } from '../packed-bytes.ts';
import type { Vec3 } from '../tuples.ts';

/** The kinds of the faces of a forest part, in the order of their packed index. */
export const FOREST_FACE_KINDS = ['matte', 'glow', 'water', 'foliage'] as const;

/**
 * The kind of a face of a forest part, for its material in the app: `glow` for the lamp glass,
 * `water` for the stream, and `foliage` for the leaves and the ferns, which can sway.
 */
export type ForestFaceKind = (typeof FOREST_FACE_KINDS)[number];

/** The size of one step of a packed coordinate of a forest part, in meters. */
export const FOREST_STEP = 1e-3;

/** One triangle of a forest part for {@link packForestPart}. */
export interface ForestTriangle {
  /** The three corners, in meters, counterclockwise from the front. */
  readonly corners: readonly [Vec3, Vec3, Vec3];
  /** The color of each corner as sRGB bytes, each from 0 to 255. */
  readonly colors: readonly [Vec3, Vec3, Vec3];
  /**
   * The unit normal of each corner. Two corners share a vertex only with the same normal, so
   * that a hard edge of the GLB file stays hard. The pack keeps no normal: the read rebuilds the
   * normals from the shared vertices ({@link unpackForestPart}).
   */
  readonly normals: readonly [Vec3, Vec3, Vec3];
  /** The kind of the face. */
  readonly kind: ForestFaceKind;
}

/**
 * The functions of the first download that read a packed part (design 7.2). The chunk of the
 * forest imports no module of the first download at run time, so the caller gives them.
 */
export interface KitReaders {
  /** `byteReader()` of `models/packed-bytes.ts`. */
  readonly byteReader: typeof byteReader;
  /** `readByte()` of `models/packed-bytes.ts`. */
  readonly readByte: typeof readByte;
  /** `readVarint()` of `models/packed-bytes.ts`. */
  readonly readVarint: typeof readVarint;
  /** `unzigzag()` of `models/packed-bytes.ts`. */
  readonly unzigzag: typeof unzigzag;
  /** `srgb()` of `models/mesh.ts`. */
  readonly srgb: typeof srgb;
}

/** A forest part read back by {@link unpackForestPart}: shared vertices and triangles. */
export interface ForestMesh {
  /** x, y, z of each vertex, in meters. */
  readonly positions: Float32Array;
  /**
   * The unit normal of each vertex: the sum of the normals of its triangles, each weighted by its
   * area. A vertex on a hard edge belongs to the triangles of one side only.
   */
  readonly normals: Float32Array;
  /** The linear RGB of each vertex. */
  readonly colors: Float32Array;
  /**
   * The kind of each vertex, as an index in {@link FOREST_FACE_KINDS}. The three vertices of a
   * triangle have the kind of the triangle.
   */
  readonly kinds: Uint8Array;
  /** Three vertices for each triangle, counterclockwise from the front. */
  readonly indices: Uint32Array;
}

/**
 * The number of recent vertices that the packed triangles name by their place in the list
 * ({@link cornerCodes}).
 */
const RECENT_CORNERS = 8;

/** The state of the code of the corners, the same in the pack and the read. */
interface CornerState {
  /** The recent vertices, the most recent first, at most {@link RECENT_CORNERS}. */
  readonly recent: number[];
  /** The highest vertex so far, or -1. */
  high: number;
  /** The vertex of the corner before, or 0. */
  previous: number;
}

/**
 * Records a corner in the state of the corner code.
 *
 * @param state The state. The call changes it.
 * @param corner The vertex of the corner.
 * @param place The place of the vertex in the recent vertices, or -1.
 */
function noteCorner(state: CornerState, corner: number, place: number): void {
  if (place >= 0) {
    state.recent.splice(place, 1);
  }
  state.recent.unshift(corner);
  if (state.recent.length > RECENT_CORNERS) {
    state.recent.pop();
  }
  state.high = Math.max(state.high, corner);
  state.previous = corner;
}

/**
 * Gives the code of each corner of the triangles: the place of the vertex in the recent vertices,
 * or {@link RECENT_CORNERS} for the vertex after the highest vertex so far, or else
 * {@link RECENT_CORNERS} + 1 + the zigzag number of the difference from the vertex before.
 *
 * @param corners The vertex of each corner, in order.
 * @returns The code of each corner.
 */
function cornerCodes(corners: readonly number[]): number[] {
  const state: CornerState = { recent: [], high: -1, previous: 0 };
  return corners.map((corner) => {
    const place = state.recent.indexOf(corner);
    let code: number;
    if (place >= 0) {
      code = place;
    } else if (corner === state.high + 1) {
      code = RECENT_CORNERS;
    } else {
      code = RECENT_CORNERS + 1 + zigzag(corner - state.previous);
    }
    noteCorner(state, corner, place);
    return code;
  });
}

/**
 * The steps of a unit normal in the key of a vertex of {@link packForestPart}. Two corners with
 * normals within half a step share a vertex.
 */
const NORMAL_STEPS = 64;

/**
 * Packs the triangles of a forest part as base64 text. The corners with the same place in whole
 * steps of {@link FOREST_STEP}, the same color, the same normal, and the same kind share one
 * vertex. The vertices take the order of their first corner, so that most corner codes are small,
 * and the colors of neighbor vertices are near.
 *
 * The packed bytes, each count and each number of the LEB128 kind unless the list says else:
 *
 * 1. The vertex count, the triangle count, and the count of the runs of kinds.
 * 2. The place of each vertex, one axis after the other: the difference from the vertex before,
 *    in steps of {@link FOREST_STEP}, as a zigzag number.
 * 3. The color of each vertex, one channel after the other: the difference of the sRGB byte from
 *    the vertex before, as a zigzag number.
 * 4. The runs of the kinds of the vertices: the kind index as one byte, and the vertex count.
 * 5. The code of each corner of the triangles ({@link cornerCodes}).
 *
 * @param triangles The triangles.
 * @returns The packed part as base64.
 */
export function packForestPart(triangles: readonly ForestTriangle[]): string {
  const keys = new Map<string, number>();
  const vertices: { readonly steps: Vec3; readonly rgb: Vec3; readonly kind: number }[] = [];
  const corners = triangles.flatMap((t) =>
    t.corners.map((corner, k) => {
      const steps: Vec3 = [
        Math.round(corner[0] / FOREST_STEP),
        Math.round(corner[1] / FOREST_STEP),
        Math.round(corner[2] / FOREST_STEP),
      ];
      const color = t.colors[k] ?? t.colors[0];
      const rgb: Vec3 = [byteOf(color[0]), byteOf(color[1]), byteOf(color[2])];
      const normal = (t.normals[k] ?? t.normals[0]).map((n) => Math.round(n * NORMAL_STEPS));
      const kind = FOREST_FACE_KINDS.indexOf(t.kind);
      const key = `${steps.join(' ')} ${rgb.join(' ')} ${normal.join(' ')} ${kind}`;
      let index = keys.get(key);
      if (index === undefined) {
        index = vertices.length;
        keys.set(key, index);
        vertices.push({ steps, rgb, kind });
      }
      return index;
    }),
  );

  const runs: [kind: number, count: number][] = [];
  for (const { kind } of vertices) {
    const last = runs.at(-1);
    if (last && last[0] === kind) {
      last[1] += 1;
    } else {
      runs.push([kind, 1]);
    }
  }

  const out: number[] = [];
  writeVarint(out, vertices.length);
  writeVarint(out, triangles.length);
  writeVarint(out, runs.length);
  for (const field of ['steps', 'rgb'] as const) {
    for (let axis = 0; axis < 3; axis++) {
      let last = 0;
      for (const vertex of vertices) {
        const value = vertex[field][axis] ?? 0;
        writeVarint(out, zigzag(value - last));
        last = value;
      }
    }
  }
  for (const [kind, count] of runs) {
    out.push(kind);
    writeVarint(out, count);
  }
  for (const code of cornerCodes(corners)) {
    writeVarint(out, code);
  }
  return toBase64(out);
}

/**
 * Rounds a color channel to a byte.
 *
 * @param value The channel, from 0 to 255.
 * @returns The byte.
 */
function byteOf(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * Gives the linear value of each sRGB byte.
 *
 * @param srgb `srgb()` of `models/mesh.ts`.
 * @returns 256 linear values.
 */
function linearBytes(srgb: KitReaders['srgb']): Float32Array {
  const out = new Float32Array(256);
  for (let b = 0; b < 256; b++) {
    out[b] = srgb(`#${b.toString(16).padStart(2, '0')}0000`)[0];
  }
  return out;
}

/**
 * Rebuilds the normal of each vertex: the sum of the normals of its triangles, each as long as
 * two times the area of its triangle, made unit. A vertex with no area gets the normal +y.
 *
 * @param positions x, y, z of each vertex.
 * @param indices Three vertices for each triangle.
 * @returns The unit normal of each vertex.
 */
function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = (indices[t] ?? 0) * 3;
    const b = (indices[t + 1] ?? 0) * 3;
    const c = (indices[t + 2] ?? 0) * 3;
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0);
    const uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
    const uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0);
    const vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
    const vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      normals[v] = (normals[v] ?? 0) + nx;
      normals[v + 1] = (normals[v + 1] ?? 0) + ny;
      normals[v + 2] = (normals[v + 2] ?? 0) + nz;
    }
  }

  for (let v = 0; v < normals.length; v += 3) {
    const x = normals[v] ?? 0;
    const y = normals[v + 1] ?? 0;
    const z = normals[v + 2] ?? 0;
    const length = Math.hypot(x, y, z);
    if (length > 1e-12) {
      normals[v] = x / length;
      normals[v + 1] = y / length;
      normals[v + 2] = z / length;
    } else {
      normals[v + 1] = 1;
    }
  }
  return normals;
}

/**
 * Reads a forest part of {@link packForestPart} back as shared vertices and triangles, and
 * rebuilds the normals of the vertices.
 *
 * @param packed The packed part as base64.
 * @param readers The functions of the first download that read the bytes.
 * @returns The vertices with their normals, linear colors, and kinds, and the triangles.
 * @throws Error if the bytes end early, if a corner names a vertex that does not exist, or if
 *   the runs of the kinds do not cover the vertices.
 */
export function unpackForestPart(packed: string, readers: KitReaders): ForestMesh {
  const { byteReader, readByte, readVarint, unzigzag, srgb } = readers;
  const reader = byteReader(packed);
  const vertexCount = readVarint(reader);
  const triangleCount = readVarint(reader);
  const runCount = readVarint(reader);

  const positions = new Float32Array(vertexCount * 3);
  for (let axis = 0; axis < 3; axis++) {
    let last = 0;
    for (let v = 0; v < vertexCount; v++) {
      last += unzigzag(readVarint(reader));
      positions[v * 3 + axis] = last * FOREST_STEP;
    }
  }
  const linear = linearBytes(srgb);
  const colors = new Float32Array(vertexCount * 3);
  for (let channel = 0; channel < 3; channel++) {
    let last = 0;
    for (let v = 0; v < vertexCount; v++) {
      last += unzigzag(readVarint(reader));
      colors[v * 3 + channel] = linear[last & 0xff] ?? 0;
    }
  }

  const kinds = new Uint8Array(vertexCount);
  let filled = 0;
  for (let r = 0; r < runCount; r++) {
    const kind = readByte(reader);
    const count = readVarint(reader);
    kinds.fill(kind, filled, filled + count);
    filled += count;
  }
  if (filled !== vertexCount) {
    throw new Error(`The runs of the kinds cover ${filled} of ${vertexCount} vertices.`);
  }

  const indices = new Uint32Array(triangleCount * 3);
  const state: CornerState = { recent: [], high: -1, previous: 0 };
  for (let c = 0; c < indices.length; c++) {
    const code = readVarint(reader);
    const place = code < RECENT_CORNERS ? code : -1;
    let corner: number;
    if (place >= 0) {
      corner = state.recent[place] ?? -1;
    } else if (code === RECENT_CORNERS) {
      corner = state.high + 1;
    } else {
      corner = state.previous + unzigzag(code - RECENT_CORNERS - 1);
    }
    if (corner < 0 || corner >= vertexCount) {
      throw new Error(`The corner ${c} names the vertex ${corner}, which does not exist.`);
    }
    indices[c] = corner;
    noteCorner(state, corner, place);
  }
  return { positions, normals: vertexNormals(positions, indices), colors, kinds, indices };
}

/** One end of a rope of the light string: a point on a tree. */
export interface ForestRopeEnd {
  /** The index of the tree in {@link ForestKitData.placements}. */
  readonly tree: number;
  /** The place of the end in the axes of the tree, before its yaw and its scale, in meters. */
  readonly offset: Vec3;
}

/** One rope of the light string, which hangs between two trees. */
export interface ForestRopeData {
  /** The two ends of the rope. */
  readonly ends: readonly [ForestRopeEnd, ForestRopeEnd];
  /** The extra length of the rope, as a part of the distance between its ends. */
  readonly slack: number;
  /** The number of lanterns that hang from the rope, at equal steps between its ends. */
  readonly lanterns: number;
}

/** One packed part of the forest kit. */
export interface ForestPartData {
  /** The name of the part, such as 'tree-1' or 'lantern-hanging'. */
  readonly name: string;
  /** The triangles of {@link packForestPart}. */
  readonly packed: string;
  /**
   * The radius of the part on the ground, in meters: the largest distance from the vertical axis
   * of a corner from 0 to 0.4 m high.
   */
  readonly footprint: number;
  /** The highest corner of the part, in meters. */
  readonly height: number;
}

/**
 * One placed copy of a part around the stage of {@link ForestKitData.stageSide}: the part name,
 * x, y, z in meters, the yaw about +y in radians, and the scale.
 */
export type ForestPlacementData = readonly [
  part: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
];

/** The forest kit as packed data, which `pnpm forest-kit` writes from the GLB file of the kit. */
export interface ForestKitData {
  /** The GLB file of the kit, relative to the repository. */
  readonly source: string;
  /** The SHA-256 of the GLB file. */
  readonly sha256: string;
  /** The stage side of the placements, in meters: the stage of the default demo. */
  readonly stageSide: number;
  /** The parts, each at its own origin. */
  readonly parts: readonly ForestPartData[];
  /** The placed copies around the stage of {@link ForestKitData.stageSide}. */
  readonly placements: readonly ForestPlacementData[];
  /** The ropes of the light string. */
  readonly ropes: readonly ForestRopeData[];
}
