/**
 * Writes point edits into the rig GLB file of a studio body (design 4.4): `node
 * tools/glb-point-edits.ts <edits.json> [--out <file.glb>]`. The edit file names a base commit, the
 * GLB file, and its SHA-256. The tool reads the file of that commit with `git show`, so a second
 * run gives the same bytes and never adds a move to a moved file. Each move is a delta of one
 * vertex of the primitive, in the stored space of the file (the bind pose of the rig). The tool
 * moves each vertex of the primitive at the same stored place by that delta, so that the copies of
 * a place for each face color stay one place. A group with `keepShapes` takes its move back from
 * those morph targets, split evenly, so that the sum of the shapes keeps its pose (the standing
 * soloist of a seated body). A weight edit sets the bones of each vertex at a place. The tool
 * changes no other value: the other morph targets keep their deltas, so they stay valid. A rig file
 * of `pnpm rig-mesh` stores no normal (the app makes the normals), and the tool stops at a primitive
 * with normals. It updates the bounds of each changed accessor.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

/** The component type of a 32-bit float in glTF. */
const FLOAT = 5126;

/** The component type of an unsigned byte in glTF. */
const UNSIGNED_BYTE = 5121;

/** One group of moves of an edit file. */
interface MoveGroup {
  /** The name of the group, such as `tail`. */
  readonly name: string;
  /** The delta of each vertex, by its index in the primitive, in the stored space. */
  readonly moves: Readonly<Record<string, readonly [number, number, number]>>;
  /** The morph targets that take the move back, so that their sum keeps its pose. */
  readonly keepShapes?: readonly string[];
}

/** An edit file of point edits (`assets/models/<animal>/<animal>-edits.json`). */
interface EditFile {
  /** The commit that holds the unedited GLB file. */
  readonly base: string;
  /** The SHA-256 of the unedited GLB file. */
  readonly baseSha256: string;
  /** The path of the GLB file from the repository root, in the commit and in the tree. */
  readonly glb: string;
  /** The index of the primitive of the skinned mesh. */
  readonly primitive: number;
  /** The groups of moves. */
  readonly groups: readonly MoveGroup[];
  /** The bones and the weights of each vertex, by its index in the primitive. */
  readonly weights?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** The fields of a glTF accessor that the tool reads and writes. */
interface Accessor {
  readonly bufferView: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  min?: number[];
  max?: number[];
}

/** The fields of a glTF document that the tool reads and writes. */
interface Document {
  readonly accessors: Accessor[];
  readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[];
  readonly nodes: readonly { readonly name?: string }[];
  readonly skins: readonly { readonly joints: readonly number[] }[];
  readonly meshes: readonly {
    readonly extras?: { readonly targetNames?: readonly string[] };
    readonly primitives: readonly {
      readonly attributes: Readonly<Record<string, number>>;
      readonly targets?: readonly Readonly<Record<string, number>>[];
    }[];
  }[];
}

/** A float or byte view of the data of one accessor in the binary chunk. */
interface AccessorView {
  /** The accessor. */
  readonly accessor: Accessor;
  /** Reads component `k` of element `i`. */
  readonly get: (i: number, k: number) => number;
  /** Writes component `k` of element `i`. */
  readonly set: (i: number, k: number, value: number) => void;
}

/**
 * Gives a view of the data of one accessor of a VEC3 or VEC4 type.
 *
 * @param doc The document.
 * @param bin The binary chunk.
 * @param index The accessor.
 * @returns The view.
 * @throws Error if the accessor has another component type or a sparse part.
 */
function viewOf(doc: Document, bin: DataView, index: number): AccessorView {
  const accessor = doc.accessors[index];
  if (!accessor || (accessor.componentType !== FLOAT && accessor.componentType !== UNSIGNED_BYTE)) {
    throw new Error(`The accessor ${index} is not a float or byte accessor.`);
  }

  const size = accessor.componentType === FLOAT ? 4 : 1;
  const n = accessor.type === 'VEC4' ? 4 : 3;
  const bufferView = doc.bufferViews[accessor.bufferView];
  const stride = bufferView?.byteStride ?? size * n;
  const start = (bufferView?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const at = (i: number, k: number): number => start + i * stride + k * size;
  return accessor.componentType === FLOAT
    ? {
        accessor,
        get: (i, k) => bin.getFloat32(at(i, k), true),
        set: (i, k, value) => bin.setFloat32(at(i, k), value, true),
      }
    : {
        accessor,
        get: (i, k) => bin.getUint8(at(i, k)),
        set: (i, k, value) => bin.setUint8(at(i, k), value),
      };
}

/**
 * Sets the bounds of a VEC3 float accessor from its data.
 *
 * @param view The view of the accessor.
 */
function updateBounds(view: AccessorView): void {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < view.accessor.count; i++) {
    for (let k = 0; k < 3; k++) {
      const value = view.get(i, k);
      min[k] = Math.min(min[k] ?? Infinity, value);
      max[k] = Math.max(max[k] ?? -Infinity, value);
    }
  }
  view.accessor.min = min;
  view.accessor.max = max;
}

/**
 * Groups the vertices of a primitive by their stored place: the three floats.
 *
 * @param positions The view of the POSITION accessor, before a move.
 * @returns The vertices at the place of each vertex, by its index.
 */
function placesOf(positions: AccessorView): number[][] {
  const places = new Map<string, number[]>();
  const keys: string[] = [];
  for (let i = 0; i < positions.accessor.count; i++) {
    const key = [0, 1, 2].map((k) => positions.get(i, k)).join(' ');
    keys.push(key);
    places.set(key, [...(places.get(key) ?? []), i]);
  }
  return keys.map((key) => places.get(key) ?? []);
}

/**
 * Counts the welded vertices of a primitive, as the studio export welds them: one for each place
 * with its bones.
 *
 * @param positions The view of the POSITION accessor.
 * @param joints The view of the JOINTS_0 accessor.
 * @returns The count.
 */
function weldedCount(positions: AccessorView, joints: AccessorView): number {
  const keys = new Set<string>();
  for (let i = 0; i < positions.accessor.count; i++) {
    keys.add(
      [0, 1, 2].map((k) => positions.get(i, k)).join(' ') +
        ' ' +
        [0, 1, 2, 3].map((k) => joints.get(i, k)).join(' '),
    );
  }
  return keys.size;
}

/**
 * Applies an edit file to the GLB bytes of its base commit.
 *
 * @param edits The edit file.
 * @param base The bytes of the unedited GLB file.
 * @returns The bytes of the edited file, and a line of facts for each group.
 * @throws Error if the base bytes have another SHA-256, if an index or a bone does not exist, or
 *   if two moves name one place with different deltas.
 */
export function applyPointEdits(
  edits: EditFile,
  base: Uint8Array,
): { bytes: Uint8Array; lines: string[] } {
  const sha = createHash('sha256').update(base).digest('hex');
  if (sha !== edits.baseSha256) {
    throw new Error(
      `The base file has the SHA-256 ${sha}, and the edit file names ${edits.baseSha256}.`,
    );
  }

  const view = new DataView(base.buffer, base.byteOffset, base.byteLength);
  const jsonLength = view.getUint32(12, true);
  // SAFETY: the JSON chunk of a GLB file holds a glTF document, and the reads below check the
  // fields that they use.
  const doc = JSON.parse(new TextDecoder().decode(base.subarray(20, 20 + jsonLength))) as Document;
  const binStart = 20 + jsonLength + 8;
  // A copy: the slice of a Node Buffer shares its memory with the base bytes.
  const binBytes = Uint8Array.from(
    base.subarray(binStart, binStart + view.getUint32(20 + jsonLength, true)),
  );
  const bin = new DataView(binBytes.buffer, binBytes.byteOffset, binBytes.byteLength);
  const primitive = doc.meshes[0]?.primitives[edits.primitive];
  const names = doc.meshes[0]?.extras?.targetNames ?? [];
  const positionIndex = primitive?.attributes['POSITION'];
  if (!primitive || positionIndex === undefined) {
    throw new Error(`The mesh has no primitive ${edits.primitive} with positions.`);
  }
  if (primitive.attributes['NORMAL'] !== undefined) {
    throw new Error('The primitive has normals, and a move would leave them wrong.');
  }

  const positions = viewOf(doc, bin, positionIndex);
  const jointView = viewOf(doc, bin, primitive.attributes['JOINTS_0'] ?? -1);
  const welded = weldedCount(positions, jointView);
  const places = placesOf(positions);
  const placeOf = (key: string): readonly number[] => {
    const place = places[Number(key)];
    if (!Number.isInteger(Number(key)) || !place) {
      throw new Error(`The vertex ${key} is not in the primitive.`);
    }
    return place;
  };
  const lines: string[] = [];
  const moved = new Map<number, string>();
  const touched = new Set<number>();
  for (const group of edits.groups) {
    const shapes = (group.keepShapes ?? []).map((name) => {
      const t = names.indexOf(name);
      const index = primitive.targets?.[t]?.['POSITION'];
      if (t < 0 || index === undefined) {
        throw new Error(`The mesh has no morph target ${name}.`);
      }
      touched.add(index);
      return viewOf(doc, bin, index);
    });
    let count = 0;
    let largest = 0;
    for (const [key, delta] of Object.entries(group.moves)) {
      const text = delta.join(' ');
      for (const i of placeOf(key)) {
        if (moved.has(i)) {
          if (moved.get(i) !== text) {
            throw new Error(`Two moves name the place of the vertex ${i} with different deltas.`);
          }
          continue;
        }
        moved.set(i, text);
        for (let k = 0; k < 3; k++) {
          positions.set(i, k, positions.get(i, k) + (delta[k] ?? 0));
          for (const shape of shapes) {
            shape.set(i, k, shape.get(i, k) - (delta[k] ?? 0) / shapes.length);
          }
        }
        count += 1;
      }
      largest = Math.max(largest, Math.hypot(...delta));
    }
    lines.push(
      `${group.name}: ${Object.keys(group.moves).length} places, ${count} vertices, largest move ${largest.toFixed(4)}`,
    );
  }
  touched.add(positionIndex);
  for (const index of touched) {
    updateBounds(viewOf(doc, bin, index));
  }

  const weightEdits = Object.entries(edits.weights ?? {});
  if (weightEdits.length > 0) {
    const joints = doc.skins[0]?.joints.map((node) => doc.nodes[node]?.name ?? '') ?? [];
    const weightView = viewOf(doc, bin, primitive.attributes['WEIGHTS_0'] ?? -1);
    let count = 0;
    for (const [key, bones] of weightEdits) {
      const slots = Object.entries(bones).toSorted((a, b) => b[1] - a[1]);
      if (slots.length > 4 || slots.some(([bone]) => !joints.includes(bone))) {
        throw new Error(`The weights of the vertex ${key} name an unknown bone or more than 4.`);
      }
      for (const i of placeOf(key)) {
        for (let k = 0; k < 4; k++) {
          const slot = slots[k];
          jointView.set(i, k, slot ? joints.indexOf(slot[0]) : 0);
          weightView.set(i, k, slot ? slot[1] : 0);
        }
        count += 1;
      }
    }
    lines.push(`weights: ${weightEdits.length} places, ${count} vertices`);
  }
  if (weldedCount(positions, jointView) !== welded) {
    throw new Error('The edits join two places or split one place of the welded mesh.');
  }

  const text = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPadded = Math.ceil(text.length / 4) * 4;
  const out = new Uint8Array(12 + 8 + jsonPadded + 8 + binBytes.length);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, out.length, true);
  outView.setUint32(12, jsonPadded, true);
  outView.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonPadded);
  out.set(text, 20);
  outView.setUint32(20 + jsonPadded, binBytes.length, true);
  outView.setUint32(24 + jsonPadded, 0x004e4942, true);
  out.set(binBytes, 28 + jsonPadded);
  return { bytes: out, lines };
}

/**
 * Reads the edit file of the command line, applies it to the GLB file of its base commit, and
 * writes the result to the GLB file of the tree, or to `--out`.
 */
function main(): void {
  const args = process.argv.slice(2);
  const file = args[0];
  const outAt = args.indexOf('--out');
  if (!file || file.startsWith('--') || (outAt >= 0 && !args[outAt + 1])) {
    throw new Error('Usage: node tools/glb-point-edits.ts <edits.json> [--out <file.glb>]');
  }

  // SAFETY: the edit file is a JSON file of the repository, and `applyPointEdits()` checks each
  // index, bone, and hash that it uses.
  const edits = JSON.parse(readFileSync(resolve(file), 'utf8')) as EditFile;
  const base = execFileSync('git', ['show', `${edits.base}:${edits.glb}`], {
    cwd: ROOT,
    maxBuffer: 1 << 28,
  });
  const { bytes, lines } = applyPointEdits(edits, base);
  const out = outAt >= 0 ? resolve(args[outAt + 1] ?? '') : join(ROOT, edits.glb);
  writeFileSync(out, bytes);
  for (const line of lines) {
    console.log(line);
  }
  const sha = createHash('sha256').update(bytes).digest('hex');
  console.log(`Wrote ${relative(ROOT, out)}: ${bytes.length} bytes, SHA-256 ${sha}.`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
