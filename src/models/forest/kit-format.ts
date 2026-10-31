import { srgb } from '../mesh.ts';
import {
  byteReader,
  readByte,
  readVarint,
  toBase64,
  unzigzag,
  writeVarint,
  zigzag,
} from '../packed-bytes.ts';
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
  /** The color of the face as sRGB bytes, each from 0 to 255. */
  readonly rgb: Vec3;
  /** The kind of the face. */
  readonly kind: ForestFaceKind;
}

/** A forest part read back by {@link unpackForestPart}, as flat triangles. */
export interface ForestMesh {
  /** Three numbers for each corner, three corners for each triangle, in meters. */
  readonly positions: Float32Array;
  /** The linear RGB of each corner. The three corners of a triangle have the same color. */
  readonly colors: Float32Array;
  /** The kind of each triangle, as an index in {@link FOREST_FACE_KINDS}. */
  readonly kinds: Uint8Array;
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
 * Packs the triangles of a forest part as base64 text. The corners with the same place in whole
 * steps of {@link FOREST_STEP} share one vertex, and the vertices take the order of their first
 * corner, so that most corner codes are small.
 *
 * The packed bytes, each count and each number of the LEB128 kind unless the list says else:
 *
 * 1. The vertex count, the triangle count, and the color count.
 * 2. The place of each vertex, one axis after the other: the difference from the vertex before,
 *    in steps of {@link FOREST_STEP}, as a zigzag number.
 * 3. The code of each corner of the triangles ({@link cornerCodes}).
 * 4. The colors: r, g, b as sRGB bytes and the kind index, each as one byte.
 * 5. The color of each triangle, as an index in the colors.
 *
 * @param triangles The triangles.
 * @returns The packed part as base64.
 */
export function packForestPart(triangles: readonly ForestTriangle[]): string {
  const keys = new Map<string, number>();
  const vertices: Vec3[] = [];
  const corners = triangles.flatMap((t) =>
    t.corners.map((corner) => {
      const steps: Vec3 = [
        Math.round(corner[0] / FOREST_STEP),
        Math.round(corner[1] / FOREST_STEP),
        Math.round(corner[2] / FOREST_STEP),
      ];
      const key = steps.join(' ');
      let index = keys.get(key);
      if (index === undefined) {
        index = vertices.length;
        keys.set(key, index);
        vertices.push(steps);
      }
      return index;
    }),
  );

  const colorKeys = new Map<string, number>();
  const colors: (readonly [Vec3, ForestFaceKind])[] = [];
  const triangleColors = triangles.map((t) => {
    const key = `${t.rgb.join(' ')} ${t.kind}`;
    let index = colorKeys.get(key);
    if (index === undefined) {
      index = colors.length;
      colorKeys.set(key, index);
      colors.push([t.rgb, t.kind]);
    }
    return index;
  });

  const out: number[] = [];
  writeVarint(out, vertices.length);
  writeVarint(out, triangles.length);
  writeVarint(out, colors.length);
  for (let axis = 0; axis < 3; axis++) {
    let last = 0;
    for (const vertex of vertices) {
      const steps = vertex[axis] ?? 0;
      writeVarint(out, zigzag(steps - last));
      last = steps;
    }
  }
  for (const code of cornerCodes(corners)) {
    writeVarint(out, code);
  }
  for (const [rgb, kind] of colors) {
    out.push(...rgb.map((c) => Math.min(255, Math.max(0, Math.round(c)))));
    out.push(FOREST_FACE_KINDS.indexOf(kind));
  }
  for (const index of triangleColors) {
    writeVarint(out, index);
  }
  return toBase64(out);
}

/**
 * Reads a forest part of {@link packForestPart} back as flat triangles.
 *
 * @param packed The packed part as base64.
 * @returns The corners, their linear colors, and the kind of each triangle.
 * @throws Error if the bytes end early, or if a corner or a triangle names a vertex or a color
 *   that does not exist.
 */
export function unpackForestPart(packed: string): ForestMesh {
  const reader = byteReader(packed);
  const vertexCount = readVarint(reader);
  const triangleCount = readVarint(reader);
  const colorCount = readVarint(reader);

  const places = new Float32Array(vertexCount * 3);
  for (let axis = 0; axis < 3; axis++) {
    let last = 0;
    for (let v = 0; v < vertexCount; v++) {
      last += unzigzag(readVarint(reader));
      places[v * 3 + axis] = last * FOREST_STEP;
    }
  }

  const corners = new Uint32Array(triangleCount * 3);
  const state: CornerState = { recent: [], high: -1, previous: 0 };
  for (let c = 0; c < corners.length; c++) {
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
    corners[c] = corner;
    noteCorner(state, corner, place);
  }

  const entries = Array.from({ length: colorCount }, () => {
    const bytes = [readByte(reader), readByte(reader), readByte(reader)];
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
    return { rgb: srgb(`#${hex}`), kind: readByte(reader) };
  });

  const positions = new Float32Array(triangleCount * 9);
  const colors = new Float32Array(triangleCount * 9);
  const kinds = new Uint8Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const entry = entries[readVarint(reader)];
    if (!entry) {
      throw new Error(`The triangle ${t} names a color that does not exist.`);
    }
    kinds[t] = entry.kind;
    for (let k = 0; k < 3; k++) {
      const v = corners[t * 3 + k] ?? 0;
      positions.set(places.subarray(v * 3, v * 3 + 3), t * 9 + k * 3);
      colors.set(entry.rgb, t * 9 + k * 3);
    }
  }
  return { positions, colors, kinds };
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
