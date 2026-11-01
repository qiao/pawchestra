import { Matrix4, Quaternion, Vector3 } from 'three';

import type { Quat, Vec3 } from './tuples.ts';

/**
 * The prefix that Mixamo gives each bone name: `mixamorig:`, or `mixamorig1:` and similar when a
 * file holds several characters. `pnpm mixamo-import` removes it, and the reader removes it again
 * from a file that did not pass the tool.
 */
const MIXAMO_PREFIX = /^mixamorig\d*:/;

/** The name of the top bone of a Mixamo skeleton, with no prefix. */
const TOP_BONE = 'Hips';

/**
 * The skeleton of a clip file in its rest pose (design 4.4). The bones of a Mixamo file are in
 * the axes and the units of the file: y up, the character faces +z, and its left side is +x after
 * `pnpm mixamo-import`. The rest pose of Mixamo is the T-pose.
 */
export interface SourceSkeleton {
  /** The name of each bone, with no prefix. Each parent comes before its children. */
  readonly names: readonly string[];
  /** The index of the parent of each bone, or -1 for the top bone. */
  readonly parents: readonly number[];
  /** The rest translation of each bone in the axes of its parent, in the units of the file. */
  readonly translations: readonly Vec3[];
  /** The rest rotation of each bone, relative to its parent. */
  readonly rotations: readonly Quat[];
  /**
   * The world matrix of the parent node of the top bone, 16 numbers column by column: the turn
   * and the scale of the armature object, or the identity after `pnpm mixamo-import`.
   */
  readonly base: readonly number[];
}

/** The keys of one animated property of one bone. */
export interface SourceTrack {
  /** The index of the bone in {@link SourceSkeleton.names}. */
  readonly bone: number;
  /** The animated property: the translation or the rotation relative to the parent. */
  readonly path: 'translation' | 'rotation';
  /** The time of each key, in seconds, from the start of the clip. */
  readonly times: Float32Array;
  /** 3 numbers for each key of a translation, 4 (x, y, z, w) for each key of a rotation. */
  readonly values: Float32Array;
  /** True for keys that hold their value until the next key, false for a linear blend. */
  readonly step: boolean;
}

/** One animation of a clip file. */
export interface SourceClip {
  /** The name of the animation, such as `Wave`. */
  readonly name: string;
  /** The time of the last key, in seconds. The first key is at 0. */
  readonly duration: number;
  /** The keys of each animated property of each bone. */
  readonly tracks: readonly SourceTrack[];
}

/** The skeleton and the clips of one GLB file. */
export interface SourceFile {
  /** The skeleton in its rest pose. */
  readonly skeleton: SourceSkeleton;
  /** The animations of the file, in their order. */
  readonly clips: readonly SourceClip[];
}

/** One node of a glTF document: only the fields that the reader uses. */
interface GltfNode {
  /** The name of the node. */
  readonly name?: string;
  /** The indices of the child nodes. */
  readonly children?: readonly number[];
  /** The translation relative to the parent. */
  readonly translation?: readonly number[];
  /** The rotation (x, y, z, w) relative to the parent. */
  readonly rotation?: readonly number[];
  /** The scale relative to the parent. */
  readonly scale?: readonly number[];
  /** The local matrix, column by column, in place of the three fields above. */
  readonly matrix?: readonly number[];
}

/** One accessor of a glTF document: only the fields that the reader uses. */
interface GltfAccessor {
  /** The index of the buffer view. */
  readonly bufferView?: number;
  /** The byte offset in the buffer view. */
  readonly byteOffset?: number;
  /** The type of each component: 5126 for a float. */
  readonly componentType: number;
  /** The number of elements. */
  readonly count: number;
  /** The element type, such as `VEC3`. */
  readonly type: string;
  /** True for an integer that reads as a number from 0 to 1, or from -1 to 1. */
  readonly normalized?: boolean;
}

/** One buffer view of a glTF document. */
interface GltfBufferView {
  /** The byte offset in the binary chunk. */
  readonly byteOffset?: number;
  /** The byte length. */
  readonly byteLength: number;
  /** The bytes from one element to the next, or none for packed elements. */
  readonly byteStride?: number;
}

/** One channel of an animation. */
interface GltfChannel {
  /** The index of the sampler. */
  readonly sampler: number;
  /** The node and the property that the channel animates. */
  readonly target: { readonly node?: number; readonly path: string };
}

/** One sampler of an animation. */
interface GltfSampler {
  /** The accessor of the key times. */
  readonly input: number;
  /** The accessor of the key values. */
  readonly output: number;
  /** `LINEAR`, `STEP`, or `CUBICSPLINE`. */
  readonly interpolation?: string;
}

/** One animation of a glTF document. */
interface GltfAnimation {
  /** The name of the animation. */
  readonly name?: string;
  /** The channels. */
  readonly channels: readonly GltfChannel[];
  /** The samplers. */
  readonly samplers: readonly GltfSampler[];
}

/** The parts of a glTF document that the reader uses. */
interface Gltf {
  /** The nodes. */
  readonly nodes?: readonly GltfNode[];
  /** The accessors. */
  readonly accessors?: readonly GltfAccessor[];
  /** The buffer views. */
  readonly bufferViews?: readonly GltfBufferView[];
  /** The animations. */
  readonly animations?: readonly GltfAnimation[];
}

/** The number of components of each accessor type that the reader reads. */
const COMPONENTS: ReadonlyMap<string, number> = new Map([
  ['SCALAR', 1],
  ['VEC3', 3],
  ['VEC4', 4],
]);

/**
 * Reads the float values of an accessor.
 *
 * @param gltf The document.
 * @param bin The binary chunk.
 * @param index The accessor.
 * @returns The values, `count × components` numbers.
 * @throws Error if the accessor does not exist or does not hold floats.
 */
function readFloats(gltf: Gltf, bin: Uint8Array, index: number): Float32Array {
  const accessor = gltf.accessors?.[index];
  const n = accessor ? COMPONENTS.get(accessor.type) : undefined;
  if (!accessor || n === undefined || accessor.componentType !== 5126) {
    throw new Error(`The accessor ${index} holds no float scalars, VEC3, or VEC4 values.`);
  }

  const view =
    accessor.bufferView === undefined ? undefined : gltf.bufferViews?.[accessor.bufferView];
  const out = new Float32Array(accessor.count * n);
  if (!view) {
    return out;
  }
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const stride = view.byteStride ?? 4 * n;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let i = 0; i < accessor.count; i++) {
    for (let k = 0; k < n; k++) {
      out[i * n + k] = data.getFloat32(start + i * stride + 4 * k, true);
    }
  }
  return out;
}

/**
 * Gives the local matrix of a node in its rest pose.
 *
 * @param node The node.
 * @returns The matrix.
 */
function restMatrix(node: GltfNode): Matrix4 {
  if (node.matrix) {
    return new Matrix4().fromArray(node.matrix);
  }
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [rx = 0, ry = 0, rz = 0, rw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  return new Matrix4().compose(
    new Vector3(tx, ty, tz),
    new Quaternion(rx, ry, rz, rw),
    new Vector3(sx, sy, sz),
  );
}

/** The two chunks of a GLB file. */
interface GlbParts {
  /** The glTF document of the JSON chunk. */
  readonly gltf: Gltf;
  /** The binary chunk. */
  readonly bin: Uint8Array;
}

/**
 * Splits a GLB file into its glTF document and its binary chunk.
 *
 * @param bytes The file.
 * @returns The document and the binary chunk.
 * @throws Error if the bytes are not a GLB file of version 2.
 */
function splitGlb(bytes: Uint8Array): GlbParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('The file is not a GLB file.');
  }

  const jsonLength = view.getUint32(12, true);
  const binAt = 20 + jsonLength;
  const binLength = binAt + 8 <= bytes.byteLength ? view.getUint32(binAt, true) : 0;
  // SAFETY: the JSON chunk of a GLB file holds a glTF document. The reader checks each field
  // that it reads before it uses the field.
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, binAt))) as Gltf;
  return { gltf, bin: bytes.subarray(binAt + 8, binAt + 8 + binLength) };
}

/**
 * Reads the skeleton and the clips of a GLB file with a Mixamo skeleton (design 4.4): the bone
 * `Hips` and all nodes under it, and each animation of those nodes. The reader keeps the
 * translations and the rotations, and drops the scales and the morph weights.
 *
 * @param bytes The GLB file, such as a file of `pnpm mixamo-import`.
 * @returns The skeleton in its rest pose, and the clips.
 * @throws Error if the file has no bone `Hips`, or an animation has keys of an unknown form.
 */
export function readSourceFile(bytes: Uint8Array): SourceFile {
  const { gltf, bin } = splitGlb(bytes);
  const nodes = gltf.nodes ?? [];
  const parentOf = new Map<number, number>();
  for (const [i, node] of nodes.entries()) {
    for (const child of node.children ?? []) {
      parentOf.set(child, i);
    }
  }
  const nameOf = (i: number): string => (nodes[i]?.name ?? '').replace(MIXAMO_PREFIX, '');
  const top = nodes.findIndex((_, i) => nameOf(i) === TOP_BONE);
  if (top < 0) {
    throw new Error(`The file has no bone "${TOP_BONE}".`);
  }

  // The world matrix of the parent of the top bone: each node above it, from the root down.
  const base = new Matrix4();
  for (let at = parentOf.get(top); at !== undefined; at = parentOf.get(at)) {
    base.premultiply(restMatrix(nodes[at] ?? {}));
  }

  const order: number[] = [];
  const queue = [top];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    order.push(next);
    queue.push(...(nodes[next]?.children ?? []));
  }
  const boneOf = new Map(order.map((node, bone) => [node, bone]));
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const translations: Vec3[] = [];
  const rotations: Quat[] = [];
  for (const node of order) {
    restMatrix(nodes[node] ?? {}).decompose(position, rotation, scale);
    translations.push([position.x, position.y, position.z]);
    rotations.push([rotation.x, rotation.y, rotation.z, rotation.w]);
  }
  const skeleton: SourceSkeleton = {
    names: order.map(nameOf),
    parents: order.map((node) => boneOf.get(parentOf.get(node) ?? -1) ?? -1),
    translations,
    rotations,
    base: base.toArray(),
  };

  const clips = (gltf.animations ?? []).map((animation, a): SourceClip => {
    const tracks: SourceTrack[] = [];
    for (const channel of animation.channels) {
      const bone = boneOf.get(channel.target.node ?? -1);
      const path = channel.target.path;
      const sampler = animation.samplers[channel.sampler];
      if (bone === undefined || !sampler || (path !== 'translation' && path !== 'rotation')) {
        continue;
      }
      const size = path === 'rotation' ? 4 : 3;
      const times = readFloats(gltf, bin, sampler.input);
      const raw = readFloats(gltf, bin, sampler.output);
      // A cubic spline holds an in-tangent, the value, and an out-tangent for each key. The
      // clip keeps the values, with a linear blend.
      const cubic = sampler.interpolation === 'CUBICSPLINE';
      const values = cubic ? new Float32Array(times.length * size) : raw;
      if (cubic) {
        for (let k = 0; k < times.length; k++) {
          values.set(raw.subarray((3 * k + 1) * size, (3 * k + 2) * size), k * size);
        }
      }
      if (values.length !== times.length * size) {
        throw new Error(
          `An animation of the file has ${values.length} values for ${times.length} keys.`,
        );
      }
      tracks.push({ bone, path, times, values, step: sampler.interpolation === 'STEP' });
    }
    const start = Math.min(...tracks.map((t) => t.times[0] ?? 0));
    const end = Math.max(...tracks.map((t) => t.times.at(-1) ?? 0));
    for (const track of tracks) {
      for (let k = 0; k < track.times.length; k++) {
        track.times[k] = (track.times[k] ?? 0) - start;
      }
    }
    return {
      name: animation.name ?? `clip${a}`,
      duration: tracks.length > 0 ? end - start : 0,
      tracks,
    };
  });
  return { skeleton, clips };
}
