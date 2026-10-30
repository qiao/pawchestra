/**
 * Writes `src/models/forest/kit-data.ts` from the GLB file of the forest kit, with no Blender.
 *
 * Usage: `pnpm forest-kit [--glb <file>] [--check]`
 *
 * - `--glb <file>`: the GLB file. `assets/forest/forest-kit.glb` by default. The script
 *   `tools/forest-kit/build-kit.py` writes it.
 * - `--check`: prints the parts and the placements, and writes no file.
 *
 * The tool reads each mesh node with no `part` property as a part, each node with a `part`
 * property as a placed copy, each node with a `rope` property as a rope end on the tree of its
 * parent node, and the node `stage` for the stage side of the places. It packs each part with
 * `packForestPart()`, and prints the triangles of each part, the placed triangles around the
 * stage of the kit, and the gzip size of the module. The same GLB file gives the same bytes.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { FOREST_FACE_KINDS, packForestPart } from '../../src/models/forest/kit-format.ts';
import type {
  ForestFaceKind,
  ForestKitData,
  ForestPartData,
  ForestPlacementData,
  ForestRopeData,
  ForestRopeEnd,
  ForestTriangle,
} from '../../src/models/forest/kit-format.ts';
import type { Vec3 } from '../../src/models/tuples.ts';

/** The root of the repository. */
const ROOT = resolve(import.meta.dirname, '..', '..');

/** The GLB file of the kit, relative to the repository. */
const DEFAULT_GLB = 'assets/forest/forest-kit.glb';

/** The module that the tool writes. */
const OUT = join(ROOT, 'src', 'models', 'forest', 'kit-data.ts');

/** The custom properties of a node of the kit. */
interface KitExtras {
  /** The part of a placed copy. */
  readonly part?: string;
  /** The rope of a rope end. */
  readonly rope?: number;
  /** The end of a rope end: 0 or 1. */
  readonly end?: number;
  /** The extra length of the rope of a rope end. */
  readonly slack?: number;
  /** The lantern count of the rope of a rope end. */
  readonly lanterns?: number;
  /** The stage side of the node `stage`. */
  readonly side?: number;
}

/** A node of the GLB file. */
interface KitNode {
  /** The object name of Blender. */
  readonly name?: string;
  /** The child nodes. */
  readonly children?: readonly number[];
  /** The place, in meters. */
  readonly translation?: readonly number[];
  /** The rotation, as a quaternion (x, y, z, w). */
  readonly rotation?: readonly number[];
  /** The scale on x, y, and z. */
  readonly scale?: readonly number[];
  /** The mesh of a part. */
  readonly mesh?: number;
  /** The custom properties of Blender. */
  readonly extras?: KitExtras;
}

/** A primitive of a mesh of the GLB file: the faces of one material. */
interface KitPrimitive {
  /** The accessors of the places and of the colors of the vertices. */
  readonly attributes: { readonly POSITION: number; readonly COLOR_0?: number };
  /** The accessor of the vertices of the triangles. */
  readonly indices: number;
  /** The material, whose name is the kind of the faces. */
  readonly material: number;
}

/** An accessor of the GLB file. */
interface KitAccessor {
  /** The buffer view of the values. */
  readonly bufferView: number;
  /** The start in the buffer view, in bytes. */
  readonly byteOffset?: number;
  /** The type of each number, such as 5126 for a float. */
  readonly componentType: number;
  /** The number of values. */
  readonly count: number;
  /** The kind of each value, such as `VEC3`. */
  readonly type: string;
  /** True if an integer stands for a number from 0 to 1. */
  readonly normalized?: boolean;
}

/** The parts of the glTF document that the tool reads. */
interface KitGltf {
  /** The nodes: the parts, the placed copies, the rope ends, and the stage. */
  readonly nodes: readonly KitNode[];
  /** The meshes of the parts. */
  readonly meshes: readonly { readonly primitives: readonly KitPrimitive[] }[];
  /** The materials, one for each kind of face. */
  readonly materials: readonly { readonly name: string }[];
  /** The accessors of the binary chunk. */
  readonly accessors: readonly KitAccessor[];
  /** The buffer views of the binary chunk: the start and the stride, in bytes. */
  readonly bufferViews: readonly {
    readonly byteOffset?: number;
    readonly byteStride?: number;
  }[];
}

/** The GLB file: its document and its binary chunk. */
interface KitGlb {
  /** The glTF document of the JSON chunk. */
  readonly json: KitGltf;
  /** The binary chunk. */
  readonly bin: Uint8Array;
}

/** The components of each accessor type that the tool reads. */
const COMPONENTS: ReadonlyMap<string, number> = new Map([
  ['SCALAR', 1],
  ['VEC3', 3],
  ['VEC4', 4],
]);

/** The byte size and the largest value of each component type that the tool reads. */
const COMPONENT_TYPES: ReadonlyMap<number, readonly [bytes: number, max: number]> = new Map([
  [5126, [4, 1]],
  [5121, [1, 255]],
  [5123, [2, 65535]],
  [5125, [4, 4294967295]],
]);

/**
 * Splits a GLB file into its document and its binary chunk.
 *
 * @param bytes The file.
 * @returns The document and the binary chunk.
 * @throws Error if the file is not a GLB file of version 2.
 */
function readGlb(bytes: Uint8Array): KitGlb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('The file is not a GLB file of version 2.');
  }

  const jsonLength = view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  const binAt = 20 + jsonLength;
  const binLength = view.getUint32(binAt, true);
  // SAFETY: the JSON chunk of a GLB file holds a glTF document. The reads below check each field
  // that they use.
  const json = JSON.parse(text) as KitGltf;
  return { json, bin: bytes.subarray(binAt + 8, binAt + 8 + binLength) };
}

/**
 * Reads an accessor. A normalized integer becomes a number from 0 to 1.
 *
 * @param glb The file.
 * @param index The accessor.
 * @returns The values, `count × components` numbers.
 * @throws Error if the accessor or its type is not known.
 */
function readAccessor(glb: KitGlb, index: number): Float64Array {
  const accessor = glb.json.accessors[index];
  const type = accessor && COMPONENT_TYPES.get(accessor.componentType);
  const n = accessor && COMPONENTS.get(accessor.type);
  const bufferView = accessor && glb.json.bufferViews[accessor.bufferView];
  if (!accessor || !type || !n || !bufferView) {
    throw new Error(`The accessor ${index} has a form that the tool does not read.`);
  }

  const [size, max] = type;
  const scale = accessor.normalized ? max : 1;
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const stride = bufferView.byteStride ?? size * n;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Float64Array(accessor.count * n);
  for (let i = 0; i < accessor.count; i++) {
    for (let k = 0; k < n; k++) {
      const at = start + i * stride + k * size;
      out[i * n + k] = component(view, at, accessor.componentType) / scale;
    }
  }
  return out;
}

/**
 * Reads one component.
 *
 * @param view The binary chunk.
 * @param at The byte offset.
 * @param type The component type.
 * @returns The value, as stored.
 */
function component(view: DataView, at: number, type: number): number {
  switch (type) {
    case 5121:
      return view.getUint8(at);
    case 5123:
      return view.getUint16(at, true);
    case 5125:
      return view.getUint32(at, true);
    default:
      return view.getFloat32(at, true);
  }
}

/**
 * Turns a linear color channel into an sRGB byte.
 *
 * @param value The linear channel, from 0 to 1.
 * @returns The sRGB byte.
 */
function srgbByte(value: number): number {
  const c = Math.min(1, Math.max(0, value));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/**
 * Finds if a material name is a kind of face.
 *
 * @param name The name.
 * @returns True for a kind of {@link FOREST_FACE_KINDS}.
 */
function isKind(name: string): name is ForestFaceKind {
  return FOREST_FACE_KINDS.some((kind) => kind === name);
}

/**
 * Reads the triangles of the mesh of a part node.
 *
 * @param glb The file.
 * @param node The node of the part.
 * @returns The triangles, each with the color of its first corner.
 * @throws Error if the node moves its mesh, a material is not a kind, a primitive has no color,
 *   or the corners of a triangle have different colors.
 */
function partTriangles(glb: KitGlb, node: KitNode): ForestTriangle[] {
  const moved =
    node.translation?.some((v) => v !== 0) ||
    node.rotation?.some((v, i) => v !== (i === 3 ? 1 : 0)) ||
    node.scale?.some((v) => v !== 1);
  const mesh = node.mesh === undefined ? undefined : glb.json.meshes[node.mesh];
  if (moved || !mesh) {
    throw new Error(`The part ${node.name ?? '?'} is not a mesh at the origin.`);
  }

  const triangles: ForestTriangle[] = [];
  for (const primitive of mesh.primitives) {
    const kind = glb.json.materials[primitive.material]?.name ?? '';
    if (!isKind(kind) || primitive.attributes.COLOR_0 === undefined) {
      throw new Error(`The part ${node.name ?? '?'} has a primitive with no kind or no color.`);
    }
    const positions = readAccessor(glb, primitive.attributes.POSITION);
    const colors = readAccessor(glb, primitive.attributes.COLOR_0);
    const colorSize = colors.length / (positions.length / 3);
    const indices = readAccessor(glb, primitive.indices);
    for (let t = 0; t < indices.length; t += 3) {
      const corner = (k: number): Vec3 => {
        const v = indices[t + k] ?? 0;
        return [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
      };
      const [rgb, ...others] = [0, 1, 2].map((k): Vec3 => {
        const at = (indices[t + k] ?? 0) * colorSize;
        return [
          srgbByte(colors[at] ?? 0),
          srgbByte(colors[at + 1] ?? 0),
          srgbByte(colors[at + 2] ?? 0),
        ];
      });
      if (!rgb || others.some((other) => other.join() !== rgb.join())) {
        throw new Error(`A triangle of the part ${node.name ?? '?'} has corners of two colors.`);
      }
      triangles.push({ corners: [corner(0), corner(1), corner(2)], rgb, kind });
    }
  }
  return triangles;
}

/** The height up to which a corner counts for the footprint of a part, in meters. */
const FOOTPRINT_TOP = 0.4;

/**
 * Measures the footprint and the height of a part.
 *
 * @param triangles The triangles of the part.
 * @returns The largest distance from the vertical axis of a corner from 0 to
 *   {@link FOOTPRINT_TOP} high, and the highest corner, in meters, rounded to 1 cm.
 */
function extent(
  triangles: readonly ForestTriangle[],
): Pick<ForestPartData, 'footprint' | 'height'> {
  let footprint = 0;
  let height = 0;
  for (const { corners } of triangles) {
    for (const [x, y, z] of corners) {
      if (y >= -0.05 && y <= FOOTPRINT_TOP) {
        footprint = Math.max(footprint, Math.hypot(x, z));
      }
      height = Math.max(height, y);
    }
  }
  return { footprint: round(footprint, 0.01), height: round(height, 0.01) };
}

/**
 * Rounds a number to a step, with no negative zero and with the shortest decimal text.
 *
 * @param value The number.
 * @param step The step, such as 0.001.
 * @returns The rounded number.
 */
function round(value: number, step: number): number {
  const inverse = Math.round(1 / step);
  return Math.round(value * inverse) / inverse + 0;
}

/**
 * Reads a placed copy from its node: the place, the yaw about +y, and the scale.
 *
 * @param node The node.
 * @param part The part of the copy.
 * @returns The placement.
 * @throws Error if the node turns about another axis or has a scale that is not uniform.
 */
function placementOf(node: KitNode, part: string): ForestPlacementData {
  const [x = 0, y = 0, z = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  if (Math.abs(qx) > 1e-6 || Math.abs(qz) > 1e-6 || Math.abs(sx - sy) + Math.abs(sx - sz) > 1e-6) {
    throw new Error(
      `The copy ${node.name ?? '?'} turns about another axis than y, or scales unevenly.`,
    );
  }

  const yaw = 2 * Math.atan2(qy, qw);
  return [
    part,
    round(x, 1e-3),
    round(y, 1e-3),
    round(z, 1e-3),
    round(Math.atan2(Math.sin(yaw), Math.cos(yaw)), 1e-4),
    round(sx, 1e-3),
  ];
}

/** The kit of a GLB file, with the triangles of each part. */
interface ReadKit {
  /** The packed kit. */
  readonly kit: ForestKitData;
  /** The triangle count of each part, by name. */
  readonly triangles: ReadonlyMap<string, number>;
}

/**
 * Reads the kit from the GLB file.
 *
 * @param glb The file.
 * @param source The path of the file, relative to the repository.
 * @param sha256 The SHA-256 of the file.
 * @returns The kit, and the triangles of each part.
 * @throws Error if a node of the kit is broken.
 */
function readKit(glb: KitGlb, source: string, sha256: string): ReadKit {
  const { nodes } = glb.json;
  const parts: ForestPartData[] = [];
  const triangles = new Map<string, number>();
  const placements: ForestPlacementData[] = [];
  const placementOfNode = new Map<number, number>();
  for (const [i, node] of nodes.entries()) {
    const part = node.extras?.part;
    if (part !== undefined) {
      placementOfNode.set(i, placements.length);
      placements.push(placementOf(node, part));
    } else if (node.mesh !== undefined) {
      const list = partTriangles(glb, node);
      parts.push({ name: node.name ?? `part-${i}`, packed: packForestPart(list), ...extent(list) });
      triangles.set(node.name ?? `part-${i}`, list.length);
    }
  }

  const parents = new Map<number, number>();
  for (const [i, node] of nodes.entries()) {
    for (const child of node.children ?? []) {
      parents.set(child, i);
    }
  }
  const ends = new Map<number, { end: ForestRopeEnd; slack: number; lanterns: number }[]>();
  for (const [i, node] of nodes.entries()) {
    const extras = node.extras;
    if (extras?.rope === undefined) {
      continue;
    }
    const tree = placementOfNode.get(parents.get(i) ?? -1);
    if (tree === undefined || extras.end === undefined) {
      throw new Error(`The rope end ${node.name ?? '?'} is not a child of a placed copy.`);
    }
    const [x = 0, y = 0, z = 0] = node.translation ?? [];
    const list = ends.get(extras.rope) ?? [];
    list[extras.end] = {
      end: { tree, offset: [round(x, 1e-3), round(y, 1e-3), round(z, 1e-3)] },
      slack: extras.slack ?? 0,
      lanterns: extras.lanterns ?? 0,
    };
    ends.set(extras.rope, list);
  }
  const ropes = [...ends.keys()]
    .toSorted((a, b) => a - b)
    .map((key): ForestRopeData => {
      const [a, b] = ends.get(key) ?? [];
      if (!a || !b) {
        throw new Error(`The rope ${key} has no two ends.`);
      }
      return { ends: [a.end, b.end], slack: a.slack, lanterns: a.lanterns };
    });

  const stageSide = nodes.find((node) => node.name === 'stage')?.extras?.side;
  if (stageSide === undefined) {
    throw new Error('The file has no node `stage` with the stage side.');
  }
  return {
    kit: { source, sha256, stageSide, parts, placements, ropes },
    triangles,
  };
}

/**
 * Gives the text of the module of the kit.
 *
 * @param kit The kit.
 * @returns The TypeScript text, before the formatter.
 */
function kitModule(kit: ForestKitData): string {
  return [
    `import type { ForestKitData } from './kit-format.ts';`,
    '',
    '/**',
    ` * The forest kit (\`src/models/forest/kit.ts\`), from \`${kit.source}\`. The command`,
    ' * `pnpm forest-kit` writes this file. Do not change it by hand.',
    ' */',
    `export const FOREST_KIT = ${JSON.stringify(kit, null, 2)} satisfies ForestKitData;`,
    '',
  ].join('\n');
}

/**
 * Prints the parts, the placed triangles, and the gzip size of the module.
 *
 * @param kit The kit.
 * @param triangles The triangles of each part.
 * @param text The text of the module.
 */
function report(kit: ForestKitData, triangles: ReadonlyMap<string, number>, text: string): void {
  const copies = new Map<string, number>();
  for (const [part] of kit.placements) {
    copies.set(part, (copies.get(part) ?? 0) + 1);
  }
  const ropeLanterns = kit.ropes.reduce((sum, rope) => sum + rope.lanterns, 0);
  copies.set('lantern-hanging', (copies.get('lantern-hanging') ?? 0) + ropeLanterns);

  let placed = 0;
  console.log('part                triangles  copies  placed');
  for (const { name } of kit.parts) {
    const count = triangles.get(name) ?? 0;
    const n = copies.get(name) ?? 0;
    placed += count * n;
    console.log(
      `${name.padEnd(20)}${String(count).padStart(9)}${String(n).padStart(8)}${String(count * n).padStart(8)}`,
    );
  }
  const own = [...triangles.values()].reduce((sum, n) => sum + n, 0);
  console.log(`parts ${kit.parts.length}, triangles ${own}, placed ${placed}`);
  console.log(
    `placements ${kit.placements.length}, ropes ${kit.ropes.length}, rope lanterns ${ropeLanterns}`,
  );
  console.log(
    `module ${text.length} bytes, ${gzipSync(text, { level: 9 }).length} bytes after gzip`,
  );
}

/**
 * Reads the options, reads the GLB file, and writes or checks the module.
 *
 * @throws Error if an option is not known, or for the reasons of {@link readKit}.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let check = false;
  let glb = DEFAULT_GLB;
  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === '--check') {
      check = true;
    } else if (args[i] === '--glb' && next !== undefined) {
      glb = next;
      i += 1;
    } else {
      throw new Error(`Usage: pnpm forest-kit [--glb <file>] [--check]. Unknown: ${args[i]}`);
    }
  }

  const glbPath = resolve(ROOT, glb);
  const bytes = new Uint8Array(await readFile(glbPath));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { kit, triangles } = readKit(readGlb(bytes), relative(ROOT, glbPath), sha256);
  const text = kitModule(kit);
  if (check) {
    report(kit, triangles, text);
    return;
  }

  await writeFile(OUT, text);
  const format = spawnSync(join(ROOT, 'node_modules', '.bin', 'oxfmt'), [OUT], {
    stdio: 'inherit',
  });
  if (format.status !== 0) {
    throw new Error(`oxfmt failed with the status ${String(format.status)}.`);
  }
  report(kit, triangles, await readFile(OUT, 'utf8'));
  console.log(`wrote ${relative(ROOT, OUT)}`);
}

await main();
