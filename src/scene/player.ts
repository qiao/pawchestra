import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  Matrix4,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { Matrix4Tuple, MeshStandardMaterial, Object3D } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { MeshData } from '../models/mesh.ts';
import type {
  HarpPedals,
  HarpStrings,
  PianoKeys,
  PieceCopies,
} from '../models/instruments/hold.ts';
import type { ModelCache } from '../models/model-cache.ts';
import type { PlayerModel } from '../models/player.ts';
import type { Support } from '../models/props.ts';
import type { SpeciesId } from '../models/species.ts';
import type { KettleCount } from '../models/instruments/percussion.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { BODY_BONES } from '../models/body-format.ts';
import { bodyRenderMeshSteps } from '../models/body.ts';
import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';
import {
  CLOSED_EYE_SCALE,
  BODY_POSE_BONES,
  createBodyPose,
  poseBodyBones,
  bodyOffsets,
} from '../models/body-rig.ts';
import type { BodyPose, BodyRig } from '../models/body-rig.ts';
import type { Skeleton as PlayerSkeleton } from '../models/rig.ts';
import type { AnimalPose, ScenePose } from '../pose/types.ts';
import { bodyMapMaterial } from './body-texture.ts';
import { eyeLightMaterial } from './eye-light.ts';
import { createGeometry } from './geometry.ts';
import { createDepthGeometry, shareCorners } from './shared-corners.ts';
import { createStringBands, updateStringBands } from './harp-strings.ts';
import type { StringBands } from './harp-strings.ts';

/**
 * Creates the geometry of a player model with a body (design 4.4): the body in the bind
 * pose of the body, with four bones for each vertex and the corrective shapes of the arms as morph
 * targets, and the instrument on the bones of the player. The colors of the body hold its
 * baked occlusion, so the geometry adds none. The body gets its smooth normals, with their changes
 * for the corrective shapes as morph normals (design 4.5). The instrument keeps the crease normals
 * of its finishes. A body with a color map gets its texture points as the attribute `uv1`. All
 * players of one model share the geometry.
 *
 * @param model The player model of `models/`.
 * @returns The geometry. Its skin indices point at the bones of {@link createPlayerMesh}.
 */
export function createPlayerGeometry(model: PlayerModel): BufferGeometry {
  return runAll(createPlayerGeometrySteps(model));
}

/**
 * Creates the geometry of a player model as {@link createPlayerGeometry} does, in steps (design
 * 7.2).
 *
 * @param model The player model of `models/`.
 * @returns The steps, which return the geometry.
 */
function* createPlayerGeometrySteps(model: PlayerModel): Steps<BufferGeometry> {
  const render = yield* bodyRenderMeshSteps(model.bodyRig, model.mesh);
  yield;
  const geometry = createGeometry(render.data);
  geometry.setAttribute('skinIndex', new BufferAttribute(render.joints, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(render.weights, 4));
  geometry.morphAttributes['position'] = render.correctives.map(
    (move) => new BufferAttribute(move, 3),
  );
  const normals = geometry.getAttribute('normal');
  if (normals.array instanceof Float32Array) {
    normals.array.set(render.normals.corners);
  }
  geometry.morphAttributes['normal'] = render.normals.moves.map(
    (move) => new BufferAttribute(move, 3),
  );
  if (render.texture) {
    // The texture points of the color map of the body (design 4.5), on the channel of the map.
    geometry.setAttribute('uv1', new BufferAttribute(render.texture.uvs, 2));
  }
  // The moves add to the bind places, as in a glTF file.
  geometry.morphTargetsRelative = true;
  // The keys of a keyboard, the strings of a harp, and the switched pieces move by their ranges of
  // corners (`PianoKeys.corners`, `HarpStrings.corners`, `PieceCopies`), so such a geometry keeps
  // one vertex for each corner, and each such player gets its own depth geometry
  // ({@link ownGeometry}).
  if (!movesCorners(model)) {
    yield;
    createDepthGeometry(geometry);
    yield;
    shareCorners(geometry);
  }
  return geometry;
}

/**
 * Tells if a player model moves ranges of its corners: the keys of a keyboard, the strings and
 * the pedals of a harp, or the copies of the switched pieces.
 *
 * @param model The player model.
 * @returns True for a model whose players need their own positions ({@link ownGeometry}).
 */
function movesCorners(model: PlayerModel): boolean {
  return !!(model.keys || model.strings || model.pedals || model.copies);
}

/** The parts of a player mesh with a body that a pose needs. */
interface BodyPlayer {
  readonly rig: BodyRig;
  /** The skeleton of the player, which `poseAt()` poses. */
  readonly skeleton: PlayerSkeleton;
  /** The bones of the pose, written on each frame. */
  readonly pose: BodyPose;
}

/**
 * A skeleton that the stage poses one time in each frame (design 4.5). three.js calls `update()` in
 * each render that draws a skinned mesh. A frame of the stage has three such renders: the depth
 * pass of the beam, its shadow pass, and the depth pass of the depth of field. The bones do not
 * move between them, so each later call computed the same bone matrices again, and the call of the
 * depth of field uploaded each bone texture a second time. Out of a hold, the skeleton updates as
 * a skeleton of three.js, for example in the gallery.
 */
class FrameSkeleton extends Skeleton {
  /** True between {@link FrameSkeleton.hold} and {@link FrameSkeleton.release}. */
  #held = false;

  /**
   * The matrix of each bone in the axes of its parent, from the pose of the frame, or `null` to
   * read the world matrices of the bones ({@link FrameSkeleton.readLocals}).
   */
  #locals: Float32Array | null = null;

  /** The mesh of the skeleton, whose world matrix moves the bones. */
  #mesh: Object3D | null = null;

  /** The group that holds the bones in the mesh ({@link createBoneGroup}). */
  #group: Object3D | null = null;

  /** The world matrix of the group of the bones in a hold. */
  readonly #groupWorld = new Matrix4();

  /**
   * Computes the bone matrices from the local matrices of a pose and the world matrix of the
   * mesh in each {@link FrameSkeleton.hold}, as three.js computes them from the world matrices of
   * the group and of the bones: the same products in the same order, so each bone matrix keeps
   * each bit. The bones then need no copy of the pose and no world matrix, and the scene does not
   * visit them: about 1 ms of main-thread time in each frame of `perf-60.mid` (design 9.7).
   *
   * @param locals The matrices of the bones in the axes of the group, 16 numbers for each bone.
   * @param mesh The mesh of the skeleton.
   * @param group The group of the bones. Its matrix stays the same.
   */
  readLocals(locals: Float32Array, mesh: Object3D, group: Object3D): void {
    this.#locals = locals;
    this.#mesh = mesh;
    this.#group = group;
  }

  /** True when the pose gives the bone matrices ({@link FrameSkeleton.readLocals}). */
  get readsLocals(): boolean {
    return this.#locals !== null;
  }

  /**
   * Computes the bone matrices from the world matrices of the bones, or from the local matrices
   * of {@link FrameSkeleton.readLocals}, and keeps them until {@link FrameSkeleton.release}.
   */
  hold(): void {
    this.#held = false;
    if (this.#locals && this.#mesh && this.#group) {
      this.#groupWorld.multiplyMatrices(this.#mesh.matrixWorld, this.#group.matrix);
      this.#computeFromLocals(this.#locals, this.#groupWorld.elements);
    } else {
      this.update();
    }
    this.#held = true;
  }

  /** Ends the hold: the next call of `update()` computes the bone matrices again. */
  release(): void {
    this.#held = false;
  }

  /** Computes the bone matrices, except during a hold. */
  override update(): void {
    if (!this.#held) {
      super.update();
    }
  }

  /**
   * Writes each bone matrix: the world matrix of the group times the local matrix
   * (`Object3D.updateMatrixWorld()`), times the inverse of the bind matrix of the bone
   * (`Skeleton.update()`). Each product takes the terms in the order of
   * `Matrix4.multiplyMatrices()` of three.js r186.
   *
   * @param locals The local matrices of the bones.
   * @param a The world matrix of the group of the bones.
   */
  #computeFromLocals(locals: Float32Array, a: Matrix4Tuple): void {
    const out = this.boneMatrices;
    const inverses = this.boneInverses;
    if (!out) {
      return;
    }
    const a11 = a[0];
    const a21 = a[1];
    const a31 = a[2];
    const a41 = a[3];
    const a12 = a[4];
    const a22 = a[5];
    const a32 = a[6];
    const a42 = a[7];
    const a13 = a[8];
    const a23 = a[9];
    const a33 = a[10];
    const a43 = a[11];
    const a14 = a[12];
    const a24 = a[13];
    const a34 = a[14];
    const a44 = a[15];
    for (let i = 0; i < inverses.length; i++) {
      const o = i * 16;
      const b11 = locals[o] ?? 0;
      const b21 = locals[o + 1] ?? 0;
      const b31 = locals[o + 2] ?? 0;
      const b41 = locals[o + 3] ?? 0;
      const b12 = locals[o + 4] ?? 0;
      const b22 = locals[o + 5] ?? 0;
      const b32 = locals[o + 6] ?? 0;
      const b42 = locals[o + 7] ?? 0;
      const b13 = locals[o + 8] ?? 0;
      const b23 = locals[o + 9] ?? 0;
      const b33 = locals[o + 10] ?? 0;
      const b43 = locals[o + 11] ?? 0;
      const b14 = locals[o + 12] ?? 0;
      const b24 = locals[o + 13] ?? 0;
      const b34 = locals[o + 14] ?? 0;
      const b44 = locals[o + 15] ?? 0;

      const w11 = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
      const w12 = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
      const w13 = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
      const w14 = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
      const w21 = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
      const w22 = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
      const w23 = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
      const w24 = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
      const w31 = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
      const w32 = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
      const w33 = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
      const w34 = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
      const w41 = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
      const w42 = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
      const w43 = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
      const w44 = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

      const c = inverses[i]?.elements ?? IDENTITY;
      const c11 = c[0];
      const c21 = c[1];
      const c31 = c[2];
      const c41 = c[3];
      const c12 = c[4];
      const c22 = c[5];
      const c32 = c[6];
      const c42 = c[7];
      const c13 = c[8];
      const c23 = c[9];
      const c33 = c[10];
      const c43 = c[11];
      const c14 = c[12];
      const c24 = c[13];
      const c34 = c[14];
      const c44 = c[15];
      out[o] = w11 * c11 + w12 * c21 + w13 * c31 + w14 * c41;
      out[o + 4] = w11 * c12 + w12 * c22 + w13 * c32 + w14 * c42;
      out[o + 8] = w11 * c13 + w12 * c23 + w13 * c33 + w14 * c43;
      out[o + 12] = w11 * c14 + w12 * c24 + w13 * c34 + w14 * c44;
      out[o + 1] = w21 * c11 + w22 * c21 + w23 * c31 + w24 * c41;
      out[o + 5] = w21 * c12 + w22 * c22 + w23 * c32 + w24 * c42;
      out[o + 9] = w21 * c13 + w22 * c23 + w23 * c33 + w24 * c43;
      out[o + 13] = w21 * c14 + w22 * c24 + w23 * c34 + w24 * c44;
      out[o + 2] = w31 * c11 + w32 * c21 + w33 * c31 + w34 * c41;
      out[o + 6] = w31 * c12 + w32 * c22 + w33 * c32 + w34 * c42;
      out[o + 10] = w31 * c13 + w32 * c23 + w33 * c33 + w34 * c43;
      out[o + 14] = w31 * c14 + w32 * c24 + w33 * c34 + w34 * c44;
      out[o + 3] = w41 * c11 + w42 * c21 + w43 * c31 + w44 * c41;
      out[o + 7] = w41 * c12 + w42 * c22 + w43 * c32 + w44 * c42;
      out[o + 11] = w41 * c13 + w42 * c23 + w43 * c33 + w44 * c43;
      out[o + 15] = w41 * c14 + w42 * c24 + w43 * c34 + w44 * c44;
    }
    if (this.boneTexture) {
      this.boneTexture.needsUpdate = true;
    }
  }
}

/** The elements of the identity matrix. */
const IDENTITY: Matrix4Tuple = new Matrix4().elements;

/**
 * Computes the bone matrices of the players of a frame one time, and keeps them for each render of
 * the frame ({@link FrameSkeleton}). The world matrices of the bones must be ready.
 *
 * @param meshes The player meshes of {@link createPlayersSteps}.
 * @param needed A flag for each mesh, or `null` for all. A mesh with the flag 0 keeps its old bone
 *   matrices: the frame does not draw it (design 9.7).
 */
export function holdSkeletons(
  meshes: readonly SkinnedMesh[],
  needed: Uint8Array | null = null,
): void {
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (mesh?.skeleton instanceof FrameSkeleton && needed?.[i] !== 0) {
      mesh.skeleton.hold();
    }
  }
}

/**
 * Ends the hold of {@link holdSkeletons} after the renders of a frame.
 *
 * @param meshes The player meshes of {@link createPlayersSteps}.
 */
export function releaseSkeletons(meshes: readonly SkinnedMesh[]): void {
  for (const mesh of meshes) {
    if (mesh.skeleton instanceof FrameSkeleton) {
      mesh.skeleton.release();
    }
  }
}

/**
 * Creates the hidden group that holds the bones of a player mesh. three.js visits each child of a
 * visible object in each render and in each shadow map, and stops at a hidden object. A bone draws
 * nothing, so the group hides the bones: a player with a body has 74 bones, and the 55
 * players of `perf-60.mid` gave about 4,000 visits in each pass. The group stays at the origin of
 * the mesh, and a product with the identity matrix is exact, so the world matrices of the bones do
 * not change.
 *
 * @returns The group.
 */
function createBoneGroup(): Group {
  const group = new Group();
  group.visible = false;
  group.matrixAutoUpdate = false;
  return group;
}

/** The player meshes with a body. */
const bodyPlayers = new WeakMap<SkinnedMesh, BodyPlayer>();

/** The keys of a player mesh with a keyboard, which {@link applyPose} turns (design 4.6, 5.3). */
interface KeyMesh {
  readonly keys: PianoKeys;
  /** The geometry that the players of the model share. Its positions are the bind places. */
  readonly shared: BufferGeometry;
  /** The bind places of the corners: the positions of {@link KeyMesh.shared}. */
  readonly bind: Float32Array;
  /** The positions of the mesh, with the turns of its keys. */
  readonly position: BufferAttribute;
  /** The level of each key in {@link KeyMesh.position}. */
  readonly levels: Float32Array;
}

/** The player meshes with a keyboard. */
const keyMeshes = new WeakMap<SkinnedMesh, KeyMesh>();

/** The pedals of a player mesh with a harp, which {@link applyPose} turns (design 4.6, 5.3). */
interface PedalMesh {
  readonly pedals: HarpPedals;
  /** The bind places of the corners. */
  readonly bind: Float32Array;
  /** The positions of the mesh, with the turns of its pedals. */
  readonly position: BufferAttribute;
  /** The notch of each pedal in {@link PedalMesh.position}. */
  readonly notches: Float32Array;
}

/** The player meshes with a harp that has pedals. */
const pedalMeshes = new WeakMap<SkinnedMesh, PedalMesh>();

/**
 * The copies of the switched pieces of a player mesh, which {@link applyPose} shows or hides
 * (design 4.6, 5.3).
 */
interface CopyMesh {
  readonly copies: PieceCopies;
  /** The bind places of the corners. */
  readonly bind: Float32Array;
  /** The positions of the mesh, with the hidden copies at one point. */
  readonly position: BufferAttribute;
  /** 1 for each copy that {@link CopyMesh.position} shows, and 0 for a hidden copy. */
  readonly shown: Uint8Array;
}

/** The player meshes with switched pieces. */
const copyMeshes = new WeakMap<SkinnedMesh, CopyMesh>();

/**
 * The strings of a player mesh with a harp, which {@link applyPose} moves (design 4.6, 5.3): the
 * bands of the swinging strings, and the parts of the strings, which close onto their lines while
 * their bands show.
 */
interface StringMesh {
  readonly bands: StringBands;
  /** The geometry that the players of the model share. Its positions are the bind places. */
  readonly shared: BufferGeometry;
  /** The bind places of the corners: the positions of {@link StringMesh.shared}. */
  readonly bind: Float32Array;
  /** The positions of the mesh, with the closed strings. */
  readonly position: BufferAttribute;
  /** The point on the line of its string of each corner of the strings, from the first string. */
  readonly lines: Float32Array;
  /** 1 for each string whose part is closed in {@link StringMesh.position}. */
  readonly closed: Uint8Array;
}

/** The player meshes with a harp. */
const stringMeshes = new WeakMap<SkinnedMesh, StringMesh>();

/**
 * Creates the geometry of one player with keys or strings that move: a position attribute of its
 * own, because two players of one model play different notes, and each other attribute and the
 * morph attributes of the shared geometry (design 4.6). The attribute names stay the same, so the
 * mesh keeps the program variant of the shared geometry, and it adds no draw call.
 *
 * @param shared The geometry that the players of the model share.
 * @returns The geometry of the player.
 * @throws Error if the shared geometry has no positions of 32-bit floats.
 */
function ownGeometry(shared: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(shared.attributes)) {
    if (name !== 'position') {
      geometry.setAttribute(name, attribute);
    }
  }
  const bind = shared.getAttribute('position');
  if (!(bind instanceof BufferAttribute) || !(bind.array instanceof Float32Array)) {
    throw new Error('The geometry of a player has no positions of 32-bit floats.');
  }
  const position = new BufferAttribute(new Float32Array(bind.array), 3);
  position.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.morphAttributes = { ...shared.morphAttributes };
  geometry.morphTargetsRelative = shared.morphTargetsRelative;
  for (const group of shared.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  createDepthGeometry(geometry);
  return geometry;
}

/**
 * Gives the geometry that the players of the model of a mesh share. A player with a keyboard or a
 * harp has a geometry of its own ({@link ownGeometry}), with the same bind places.
 *
 * @param mesh A mesh of {@link createPlayerMesh}.
 * @returns The shared geometry.
 */
export function sharedGeometryOf(mesh: SkinnedMesh): BufferGeometry {
  return keyMeshes.get(mesh)?.shared ?? stringMeshes.get(mesh)?.shared ?? mesh.geometry;
}

/**
 * Gives the point on the line of its string of each corner of the strings of a harp (design
 * 4.6), in the bind pose: the place of the corner when the part of its string closes.
 *
 * @param strings The strings of the player model.
 * @param bind The bind places of the corners.
 * @returns Three numbers for each corner of the strings, from the first corner of the first
 *   string.
 */
function stringLinePoints(strings: HarpStrings, bind: Float32Array): Float32Array {
  const start = strings.corners[0] ?? 0;
  const end = strings.corners[strings.lines.length] ?? start;
  const out = new Float32Array((end - start) * 3);
  for (const [i, line] of strings.lines.entries()) {
    const [bx, by, bz] = line.bottom;
    const [tx, ty, tz] = line.top;
    const length = Math.hypot(tx - bx, ty - by, tz - bz);
    const [ux, uy, uz] = [(tx - bx) / length, (ty - by) / length, (tz - bz) / length];
    for (let c = strings.corners[i] ?? 0; c < (strings.corners[i + 1] ?? 0); c++) {
      const along =
        ((bind[c * 3] ?? 0) - bx) * ux +
        ((bind[c * 3 + 1] ?? 0) - by) * uy +
        ((bind[c * 3 + 2] ?? 0) - bz) * uz;
      out.set([bx + ux * along, by + uy * along, bz + uz * along], (c - start) * 3);
    }
  }
  return out;
}

/**
 * Creates the skinned mesh of one player (design 4.4). Each player has its own bones, so that
 * each player gets its own pose. A player with a keyboard or a harp also gets its own positions,
 * so that its keys go down with its notes, and its strings close while their bands show
 * ({@link ownGeometry}). The bands of a harp are a child of the mesh ({@link createStringBands}).
 * A player whose body has a color map for the palette of its species
 * (`PlayerModel.bodyMap`) gets the copy of the shared material with the map (`bodyMapMaterial()`,
 * design 4.5). A player whose body has eyeballs gets a copy with
 * the eye light (`eyeLightMaterial()`, design 4.5).
 *
 * @param model The player model of `models/`.
 * @param geometry The geometry of the model, from {@link createPlayerGeometry}.
 * @param materials The shared material.
 * @returns The mesh, with its bones in the order of `BONE_NAMES`.
 */
export function createPlayerMesh(
  model: PlayerModel,
  geometry: BufferGeometry,
  materials: readonly MeshStandardMaterial[],
): SkinnedMesh {
  const own = movesCorners(model) ? ownGeometry(geometry) : geometry;
  const { body } = model.bodyRig;
  const file = model.bodyMap;
  const mapped =
    file === null
      ? materials
      : materials.map((shared) => bodyMapMaterial(shared, file, body.texture?.file));
  const mesh = createBodyMesh(
    model,
    model.bodyRig,
    own,
    body.eyeballs ? mapped.map((base) => eyeLightMaterial(base, body, model.bodyRig.mesh)) : mapped,
  );
  const position = own.getAttribute('position');
  const bind = geometry.getAttribute('position').array;
  if (!(position instanceof BufferAttribute) || !(bind instanceof Float32Array)) {
    return mesh;
  }
  if (model.keys) {
    keyMeshes.set(mesh, {
      keys: model.keys,
      shared: geometry,
      bind,
      position,
      levels: new Float32Array(model.keys.corners.length - 1),
    });
  }
  if (model.pedals) {
    pedalMeshes.set(mesh, {
      pedals: model.pedals,
      bind,
      position,
      notches: new Float32Array(model.pedals.turns.length),
    });
  }
  if (model.copies) {
    copyMeshes.set(mesh, {
      copies: model.copies,
      bind,
      position,
      shown: new Uint8Array(model.copies.starts.length).fill(1),
    });
  }
  const material = materials[0];
  if (model.strings && material) {
    const bands = createStringBands(model.strings, geometry, material);
    mesh.add(bands.mesh);
    stringMeshes.set(mesh, {
      bands,
      shared: geometry,
      bind,
      position,
      lines: stringLinePoints(model.strings, bind),
      closed: new Uint8Array(model.strings.lines.length),
    });
  }
  return mesh;
}

/**
 * Creates the skinned mesh of a player with a body (design 4.4). Each bone of the body and
 * of the player is a child of the mesh, with no parent bone: {@link applyPose} writes the matrix
 * of each bone from the pose of the player (`poseBodyBones()`).
 *
 * @param model The player model.
 * @param rig The rig of its body.
 * @param geometry The geometry of the model, from {@link createPlayerGeometry}.
 * @param materials The shared material.
 * @returns The mesh in the bind pose of the player.
 */
function createBodyMesh(
  model: PlayerModel,
  rig: BodyRig,
  geometry: BufferGeometry,
  materials: readonly MeshStandardMaterial[],
): SkinnedMesh {
  const mesh = new SkinnedMesh(geometry, [...materials]);
  const group = createBoneGroup();
  mesh.add(group);
  const bones = Array.from({ length: BODY_POSE_BONES }, () => {
    const bone = new Bone();
    bone.matrixAutoUpdate = false;
    group.add(bone);
    return bone;
  });
  mesh.updateMatrixWorld(true);
  mesh.bind(
    new FrameSkeleton(
      bones,
      bones.map(() => new Matrix4()),
    ),
  );
  bodyPlayers.set(mesh, { rig, skeleton: model.skeleton, pose: createBodyPose() });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  applyBodyPose(mesh, {
    rotations: new Float32Array(model.skeleton.positions.length * 4).map((_, i) =>
      i % 4 === 3 ? 1 : 0,
    ),
    rootOffset: [0, 0, 0],
    slideOffset: [0, 0, 0],
    blink: 0,
  });
  return mesh;
}

/**
 * Copies a pose to the bones of a player mesh with a body: the matrix of each bone and the
 * weights of the corrective shapes (design 4.4, 5.1).
 *
 * @param mesh A mesh of {@link createBodyMesh}. Another mesh does not change.
 * @param pose The pose of the player.
 */
function applyBodyPose(mesh: SkinnedMesh, pose: AnimalPose): void {
  const player = bodyPlayers.get(mesh);
  if (!player) {
    return;
  }
  const eyeScale = Math.max(CLOSED_EYE_SCALE, 1 - pose.blink);
  const { matrices, correctives } = poseBodyBones(
    player.rig,
    player.skeleton,
    pose.rotations,
    bodyOffsets(pose),
    eyeScale,
    player.pose,
  );
  // A skeleton that reads the pose computes its bone matrices from it, so its bones keep no copy.
  const skeleton = mesh.skeleton;
  const bones = skeleton instanceof FrameSkeleton && skeleton.readsLocals ? [] : skeleton.bones;
  // A copy by index: an iterator of entries with Matrix4.fromArray() took twice the time.
  for (let b = 0; b < bones.length; b++) {
    const bone = bones[b];
    if (!bone) {
      continue;
    }
    const elements = bone.matrix.elements;
    const offset = b * 16;
    for (let k = 0; k < 16; k++) {
      elements[k] = matrices[offset + k] ?? 0;
    }
    bone.matrixWorldNeedsUpdate = true;
  }
  const influences = mesh.morphTargetInfluences;
  if (influences) {
    // A body has two morph targets for the arms down, and one more for each shape of a raised
    // arm or of a bent wrist.
    for (let i = 0; i < influences.length; i++) {
      influences[i] = correctives[i] ?? 0;
    }
  }
}

/**
 * Lets the skeleton of a player mesh compute its bone matrices from the pose of each frame
 * ({@link FrameSkeleton.readLocals}), and takes the group of the bones out of the mesh, so that
 * no update of the world matrices visits the bones. The stage holds the skeletons in each frame
 * ({@link holdSkeletons}). The bones of the mesh then keep the bind pose, so {@link hideBone}
 * does not apply to the mesh.
 *
 * @param mesh A mesh of {@link createBodyMesh}. Another mesh does not change.
 */
function readPoseLocals(mesh: SkinnedMesh): void {
  const player = bodyPlayers.get(mesh);
  const skeleton = mesh.skeleton;
  const group = skeleton.bones[0]?.parent;
  if (player && group && skeleton instanceof FrameSkeleton) {
    skeleton.readLocals(player.pose.matrices, mesh, group);
    mesh.remove(group);
  }
}

/** The middles of the eyes and of the head of a posed player, in world axes (design 4.5, 5.6). */
export interface HeadPoints {
  /** The middle of the left eye: the posed head of the eye bone `eye_L`. */
  readonly eyeL: [number, number, number];
  /** The middle of the right eye: the posed head of the eye bone `eye_R`. */
  readonly eyeR: [number, number, number];
  /** The middle of the head: the posed `headCenter` of the body. */
  readonly head: [number, number, number];
}

/** The indices of the body bones of {@link HeadPoints}. */
const HEAD_POINT_BONES = {
  eyeL: BODY_BONES.indexOf('eye_L'),
  eyeR: BODY_BONES.indexOf('eye_R'),
  head: BODY_BONES.indexOf('head'),
} as const;

/** The pose matrix of one bone, which {@link writePosedPoint} writes before it reads it. */
const posedMatrix = new Matrix4();

/** The point of {@link writePosedPoint}, which it writes before it reads it. */
const posedPoint = new Vector3();

/**
 * Writes a point of a body in the bind pose at its place in the pose of the last frame, in
 * world axes.
 *
 * @param mesh The player mesh. Its world matrix must be ready.
 * @param matrices The pose matrices of the body bones of the mesh (`BodyPose.matrices`).
 * @param bone The index of the body bone that the point follows.
 * @param bind The point in the bind pose, in the model axes.
 * @param out The point to write.
 */
function writePosedPoint(
  mesh: SkinnedMesh,
  matrices: Float32Array,
  bone: number,
  bind: Vec3,
  out: [number, number, number],
): void {
  posedMatrix.fromArray(matrices, bone * 16);
  posedPoint
    .set(...bind)
    .applyMatrix4(posedMatrix)
    .applyMatrix4(mesh.matrixWorld);
  out[0] = posedPoint.x;
  out[1] = posedPoint.y;
  out[2] = posedPoint.z;
}

/**
 * Writes the middles of the eyes and of the head of a player in the pose of the last frame, for
 * the focus of a shot (design 4.5, 5.6). Each body gives the bind place of its eye bones: the
 * middle of a bead eye, or of the sphere of an eye of its mesh (design 4.4). The pose matrix of
 * an eye bone keeps the middle of the eye at its place in a blink. Thus the points need no
 * constant of a species.
 *
 * @param mesh A mesh of {@link createPlayerMesh}, posed by {@link applyPose}. Its world matrix
 *   must be ready.
 * @param out The points to write.
 * @returns True if it wrote the points, or false for a mesh with no body.
 */
export function writeHeadPoints(mesh: SkinnedMesh, out: HeadPoints): boolean {
  const player = bodyPlayers.get(mesh);
  if (!player) {
    return false;
  }

  const { heads, headCenter } = player.rig.body;
  const { matrices } = player.pose;
  writePosedPoint(mesh, matrices, HEAD_POINT_BONES.eyeL, heads.eye_L, out.eyeL);
  writePosedPoint(mesh, matrices, HEAD_POINT_BONES.eyeR, heads.eye_R, out.eyeR);
  writePosedPoint(mesh, matrices, HEAD_POINT_BONES.head, headCenter, out.head);
  return true;
}

/**
 * Hides the parts of one bone of a player mesh: the bone scales to 0, for example the baton of a
 * silhouette. The next pose shows the parts again.
 *
 * @param mesh A mesh of {@link createPlayerMesh}.
 * @param name The bone of the player.
 */
export function hideBone(mesh: SkinnedMesh, name: BoneName): void {
  const bone = mesh.skeleton.bones[BODY_BONES.length + boneIndex(name)];
  if (!bone) {
    return;
  }
  bone.matrix.multiply(new Matrix4().makeScale(0, 0, 0));
  bone.matrixWorldNeedsUpdate = true;
}

/**
 * Copies a pose to the bones of a player mesh: the bones of the body from the pose
 * ({@link applyBodyPose}), the turns of the keys of a mesh with a keyboard ({@link applyKeys}),
 * and the swings of the strings of a mesh with a harp ({@link applyStrings}) (design 5.1).
 *
 * @param mesh A mesh of {@link createPlayerMesh}.
 * @param pose The pose, with one rotation for each bone.
 */
export function applyPose(mesh: SkinnedMesh, pose: AnimalPose): void {
  applyKeys(mesh, pose.keys);
  applyPedals(mesh, pose.pedals);
  applyCopies(mesh, pose.held);
  applyBodyPose(mesh, pose);
  applyStrings(mesh, pose.strings);
}

/**
 * Sends a range of corners of a position attribute to the GPU in the next render. A range that the
 * renderer did not upload, for example of a culled mesh, joins the new range.
 *
 * @param position The positions.
 * @param from The first corner of the range.
 * @param to The end of the range, excluded.
 */
function uploadCorners(position: BufferAttribute, from: number, to: number): void {
  let start = from;
  let end = to;
  const pending = position.updateRanges[0];
  if (pending) {
    start = Math.min(start, pending.start / 3);
    end = Math.max(end, (pending.start + pending.count) / 3);
    position.clearUpdateRanges();
  }
  position.addUpdateRange(start * 3, (end - start) * 3);
  position.needsUpdate = true;
}

/**
 * Moves the strings of a player mesh with a harp to the swings of a pose (design 4.6, 5.3): the
 * bands of the swinging strings follow the bone of the strings, and the part of each swinging
 * string closes onto its line, so that only its band shows. A still string opens again.
 *
 * @param mesh A mesh of {@link createPlayerMesh}. A mesh with no harp does not change.
 * @param swings The swings of the strings, from `AnimalPose.strings`. With none, all are still.
 */
function applyStrings(mesh: SkinnedMesh, swings: Float32Array | null | undefined): void {
  const own = stringMeshes.get(mesh);
  const player = bodyPlayers.get(mesh);
  if (!own || !player) {
    return;
  }

  const { bands, bind, position, lines, closed } = own;
  const { strings } = bands;
  const offset = (BODY_BONES.length + boneIndex(strings.bone)) * 16;
  const shown = updateStringBands(bands, swings, player.pose.matrices, offset);
  const out = position.array;
  if (!(out instanceof Float32Array)) {
    return;
  }
  const first = strings.corners[0] ?? 0;
  let from = Infinity;
  let to = -Infinity;
  for (let i = 0; i < closed.length; i++) {
    const close = (shown[2 * i] ?? 0) > 0 ? 1 : 0;
    if (close === closed[i]) {
      continue;
    }
    closed[i] = close;
    const start = strings.corners[i] ?? 0;
    const end = strings.corners[i + 1] ?? start;
    out.set(
      close
        ? lines.subarray((start - first) * 3, (end - first) * 3)
        : bind.subarray(start * 3, end * 3),
      start * 3,
    );
    from = Math.min(from, start);
    to = Math.max(to, end);
  }
  if (from < to) {
    uploadCorners(position, from, to);
  }
}

/**
 * Turns the corners of one key from their bind places around the line of the keys (design 4.6).
 *
 * @param keys The keys of the mesh.
 * @param bind The bind places of the corners.
 * @param out The positions to write.
 * @param key The index of the key.
 * @param angle The turn, in radians. A positive turn moves the front of the key down.
 */
function turnKey(
  keys: PianoKeys,
  bind: Float32Array,
  out: Float32Array,
  key: number,
  angle: number,
): void {
  turnCorners(bind, out, keys.corners[key] ?? 0, keys.corners[key + 1] ?? 0, keys, angle);
}

/**
 * Turns a range of corners from their bind places around a line (design 4.6).
 *
 * @param bind The bind places of the corners.
 * @param out The positions to write.
 * @param from The first corner.
 * @param to The end of the corners, excluded.
 * @param line A point on the line and its unit direction.
 * @param angle The turn, in radians, around the direction of the line.
 */
function turnCorners(
  bind: Float32Array,
  out: Float32Array,
  from: number,
  to: number,
  line: { readonly pivot: Vec3; readonly axis: Vec3 },
  angle: number,
): void {
  const [ux, uy, uz] = line.axis;
  const [px, py, pz] = line.pivot;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const end = to * 3;
  // The rotation formula of Rodrigues, around the unit axis through the pivot.
  for (let i = from * 3; i < end; i += 3) {
    const x = (bind[i] ?? 0) - px;
    const y = (bind[i + 1] ?? 0) - py;
    const z = (bind[i + 2] ?? 0) - pz;
    const along = (ux * x + uy * y + uz * z) * (1 - cos);
    out[i] = px + x * cos + (uy * z - uz * y) * sin + ux * along;
    out[i + 1] = py + y * cos + (uz * x - ux * z) * sin + uy * along;
    out[i + 2] = pz + z * cos + (ux * y - uy * x) * sin + uz * along;
  }
}

/**
 * Turns the keys of a player mesh with a keyboard to their press levels (design 4.6, 5.3). Only
 * the keys whose level changed since the last frame move, and only their corners go to the GPU:
 * one range from the first changed key to the last.
 *
 * @param mesh A mesh of {@link createPlayerMesh}. A mesh with no keyboard does not change.
 * @param levels The level of each key, from `AnimalPose.keys`. With none, all keys are up.
 */
function applyKeys(mesh: SkinnedMesh, levels: Float32Array | null | undefined): void {
  const own = keyMeshes.get(mesh);
  if (!own) {
    return;
  }

  const { keys, bind, position, levels: shown } = own;
  const out = position.array;
  if (!(out instanceof Float32Array)) {
    return;
  }
  let from = Infinity;
  let to = -Infinity;
  for (let k = 0; k < shown.length; k++) {
    const level = levels?.[k] ?? 0;
    if (level === shown[k]) {
      continue;
    }
    shown[k] = level;
    turnKey(keys, bind, out, k, level * keys.angle);
    from = Math.min(from, keys.corners[k] ?? 0);
    to = Math.max(to, keys.corners[k + 1] ?? 0);
  }
  if (from < to) {
    uploadCorners(position, from, to);
  }
}

/**
 * Turns the pedals of a player mesh with a harp into their notches (design 4.6, 5.3). Only the
 * pedals whose notch changed since the last frame move.
 *
 * @param mesh A mesh of {@link createPlayerMesh}. A mesh with no pedals does not change.
 * @param notches The notch of each pedal, from `AnimalPose.pedals`. With none, each pedal stays
 *   in its natural notch.
 */
function applyPedals(mesh: SkinnedMesh, notches: Float32Array | null | undefined): void {
  const own = pedalMeshes.get(mesh);
  const out = own?.position.array;
  if (!own || !(out instanceof Float32Array)) {
    return;
  }

  let from = Infinity;
  let to = -Infinity;
  for (const [p, turn] of own.pedals.turns.entries()) {
    const notch = notches?.[p] ?? 0;
    if (notch === own.notches[p]) {
      continue;
    }
    own.notches[p] = notch;
    const start = own.pedals.corners[p] ?? 0;
    const end = own.pedals.corners[p + 1] ?? start;
    turnCorners(own.bind, out, start, end, turn, notch * (notch > 0 ? turn.sharp : -turn.flat));
    from = Math.min(from, start);
    to = Math.max(to, end);
  }
  if (from < to) {
    uploadCorners(own.position, from, to);
  }
}

/**
 * Shows the copies of the switched pieces of a player mesh that a pose holds (design 4.6, 5.3):
 * copy `2 p` of piece `p` on the trap table when its value is 0, and copy `2 p + 1` in a paw when
 * it is 1. The corners of a hidden copy go to its point (`PieceCopies.hides`), so its triangles
 * draw nothing. Only the copies that changed since the last frame move.
 *
 * @param mesh A mesh of {@link createPlayerMesh}. A mesh with no copies does not change.
 * @param held The value of each switched piece, from `AnimalPose.held`. With none, the pieces lie
 *   on the table.
 */
function applyCopies(mesh: SkinnedMesh, held: Float32Array | null | undefined): void {
  const own = copyMeshes.get(mesh);
  const out = own?.position.array;
  if (!own || !(out instanceof Float32Array)) {
    return;
  }
  const { copies, bind, shown } = own;
  let from = Infinity;
  let to = -Infinity;
  for (let c = 0; c < shown.length; c++) {
    const inPaw = (held?.[c >> 1] ?? 0) >= 0.5;
    const show = (c % 2 === 1) === inPaw ? 1 : 0;
    if (show === shown[c]) {
      continue;
    }
    shown[c] = show;
    const start = copies.starts[c] ?? 0;
    const end = copies.ends[c] ?? start;
    if (show) {
      out.set(bind.subarray(start * 3, end * 3), start * 3);
    } else {
      for (let i = start * 3; i < end * 3; i += 3) {
        out[i] = copies.hides[c * 3] ?? 0;
        out[i + 1] = copies.hides[c * 3 + 1] ?? 0;
        out[i + 2] = copies.hides[c * 3 + 2] ?? 0;
      }
    }
    from = Math.min(from, start);
    to = Math.max(to, end);
  }
  if (from < to) {
    uploadCorners(own.position, from, to);
  }
}

/**
 * Copies the poses of a scene to the player meshes (design 5.1).
 *
 * @param meshes The meshes of {@link createPlayersSteps}: one for each player in the order of
 *   `ScenePose.players`, then the conductor.
 * @param pose The poses of the frame, from `poseAt()`.
 * @param needed A flag for each mesh, or `null` for all. A mesh with the flag 0 keeps its old pose
 *   (design 9.7).
 */
export function applyScenePose(
  meshes: readonly SkinnedMesh[],
  pose: ScenePose,
  needed: Uint8Array | null = null,
): void {
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const animal = i === pose.players.length ? pose.conductor : pose.players[i];
    if (mesh && animal && needed?.[i] !== 0) {
      applyPose(mesh, animal);
    }
  }
}

/** One player to show: the species, the instrument, and the place on the stage. */
export interface PlayerSpot {
  readonly species: SpeciesId;
  readonly instrument: InstrumentId;
  readonly kettles: KettleCount;
  /** The support of the player: a soloist can stand (design 4.5). */
  readonly support: Support;
  readonly position: Vec3;
  /** Radians around y. 0 faces -z (the back). */
  readonly facing: number;
}

/**
 * Creates the players of a scene in the bind pose, in steps (design 7.2). The players of one kind
 * (species, instrument, and kettle count) share one model and one geometry, and all players share
 * the material. `poseAt()` gives their poses from the first frame (design 5.1).
 *
 * @param spots The players and their places.
 * @param materials The shared material.
 * @param models The player models of the score, which the layout and the pose plan share.
 * @returns The steps, which return one skinned mesh for each player, in the order of `spots`.
 */
export function* createPlayersSteps(
  spots: readonly PlayerSpot[],
  materials: readonly MeshStandardMaterial[],
  models: ModelCache,
): Steps<SkinnedMesh[]> {
  const geometries = new Map<PlayerModel, BufferGeometry>();
  const meshes: SkinnedMesh[] = [];
  for (const spot of spots) {
    yield;
    const model = models.get(spot.species, spot.instrument, spot.kettles, spot.support);
    let geometry = geometries.get(model);
    if (!geometry) {
      geometry = yield* createPlayerGeometrySteps(model);
      geometries.set(model, geometry);
      yield;
    }
    const mesh = createPlayerMesh(model, geometry, materials);
    readPoseLocals(mesh);
    mesh.position.set(...spot.position);
    mesh.rotation.y = spot.facing;
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Creates a static mesh from mesh data, for example the merged props of a layout.
 *
 * @param data The mesh data of `models/`.
 * @param materials The shared material.
 * @returns The mesh. It casts and receives shadows.
 */
export function createStaticMesh(data: MeshData, materials: readonly MeshStandardMaterial[]): Mesh {
  const mesh = new Mesh(shareCorners(createGeometry(data)), [...materials]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
