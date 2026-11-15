import { Vector3 } from 'three';

import type { BodyBones } from './biped.ts';
import { addEye } from './eyes.ts';
import type { EyeColors } from './eyes.ts';
import { srgb } from './mesh.ts';
import type { CornerSkin, MeshBuilder, MeshData } from './mesh.ts';
import { BONE_NAMES, boneIndex } from './rig.ts';
import { makeSkeleton } from './rig.ts';
import {
  NO_UV,
  BODY_BONES,
  BODY_INFLUENCES,
  unpackBodyMesh,
  unpackBodyUvs,
} from './body-format.ts';
import type { Body, BodyPalette } from './body-format.ts';
import { bodyCornerColorsSteps, bodyNormals } from './body-normals.ts';
import { NO_OFFSETS, createBodyPose, poseBodyBones, skinBodyMesh, bodyRig } from './body-rig.ts';
import type { BodyRig } from './body-rig.ts';
import { BODIES } from './bodies.ts';
import { BODY_HEIGHTS } from './body-heights.ts';
import { EYE_COLOR, EYE_LIGHT_COLOR } from './species.ts';
import type { Vec3 } from './tuples.ts';
import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';

/** The name of a body of a species (design 4.4): the value of `SpeciesParams.body`. */
export type BodyName = keyof typeof BODY_HEIGHTS;

/**
 * The bodies that a player can have: in Node all bodies of `BODIES`, and in the
 * browser the bodies that the app or the gallery loaded with {@link addBody} (design 7.2).
 */
const loaded = new Map<BodyName, Body>();
for (const [name, body] of Object.entries(BODIES)) {
  if (isBodyName(name)) {
    loaded.set(name, body);
  }
}

/**
 * Tells if a text names a body.
 *
 * @param name The text.
 * @returns True for a key of `BODY_HEIGHTS`.
 */
export function isBodyName(name: string): name is BodyName {
  return Object.hasOwn(BODY_HEIGHTS, name);
}

/**
 * Adds a loaded body, so that a player can have it (design 7.2).
 *
 * @param name The body.
 * @param body The body of its module.
 */
export function addBody(name: BodyName, body: Body): void {
  loaded.set(name, body);
}

/**
 * Tells if a body is loaded.
 *
 * @param name The body.
 * @returns True if a player can have the body.
 */
export function hasBody(name: BodyName): boolean {
  return loaded.has(name);
}

/**
 * Gives a loaded body by its name.
 *
 * @param name The body.
 * @returns The body.
 * @throws Error if the body is not loaded.
 */
export function bodyOf(name: BodyName): Body {
  const body = loaded.get(name);
  if (!body) {
    throw new Error(
      `The body ${name} is not loaded. Call loadBodies() of app/body-loads.ts before a player of its species (design 7.2).`,
    );
  }
  return body;
}

/**
 * Gives the color map that a species shows on its body (design 4.5): the map of the body,
 * or the map of the palette of the faces that the species takes, such as the tan map of the tan
 * fox. A body with no map, or a palette with no map, shows the colors of its faces.
 *
 * @param name The body.
 * @param palette The palette of the faces of the species, or `undefined` for the colors of the mesh.
 * @returns The web copy of the map, relative to the repository, or `null` for no map.
 */
export function bodyMapOf(name: BodyName, palette?: BodyPalette): string | null {
  const texture = bodyOf(name).texture;
  if (!texture) {
    return null;
  }
  return palette === undefined ? texture.file : (texture.palettes?.[palette] ?? null);
}

/** The rig of each body and stance, made on its first use. */
const rigs = new Map<string, BodyRig>();

/**
 * Gives the rig of a body. The rig of each body and stance is made one time. A seated body
 * that also stands has a standing rig (`standingBody()` of `body-rig.ts`). Each other body keeps
 * the stance of its role.
 *
 * @param name The body.
 * @param stands True for a player that stands.
 * @returns The rig.
 */
export function bodyRigOf(name: BodyName, stands: boolean): BodyRig {
  const body = bodyOf(name);
  const key = `${name} ${stands && body.standing ? 'standing' : 'bind'}`;
  let rig = rigs.get(key);
  if (!rig) {
    rig = bodyRig(body, stands);
    rigs.set(key, rig);
  }
  return rig;
}

/** The colors of the faces of each body with another palette, made on their first use. */
const paletteColors = new Map<string, Float32Array>();

/**
 * Gives the colors of the faces of a body with another palette (design 4.4, 4.5).
 *
 * @param name The body.
 * @param palette The other palette.
 * @returns Linear r, g, b of each triangle.
 * @throws Error if the body has no such palette.
 */
function colorsWith(name: BodyName, palette: BodyPalette): Float32Array {
  const key = `${name} ${palette}`;
  let colors = paletteColors.get(key);
  if (!colors) {
    const body = bodyOf(name);
    const packed = body.palettes?.[palette];
    if (packed === undefined) {
      throw new Error(`The body ${name} has no ${palette} palette.`);
    }
    colors = unpackBodyMesh(body.mesh, packed).colors;
    paletteColors.set(key, colors);
  }
  return colors;
}

/**
 * The place of the mouth below the tip of the nose, in H, for a body with no mouth of its own
 * (`Body.mouth`).
 */
const MOUTH_DROP = 0.08;

/** The colors of the bead eyes: the eyes of all species (design 4.5). */
const EYE_COLORS: EyeColors = { eye: srgb(EYE_COLOR), eyeLight: srgb(EYE_LIGHT_COLOR) };

/**
 * Gives the skin of each vertex of a body on the bones of the player: the two bones of the
 * player with the largest sums of the weights of their body bones (design 4.7). The readers of
 * the bind mesh read the main bone, such as the footprints and the hanging arms.
 *
 * @param rig The body rig.
 * @returns The skin of each vertex.
 */
function playerSkins(rig: BodyRig): CornerSkin[] {
  const { joints, weights } = rig.mesh;
  const sums = new Map<number, number>();
  return Array.from({ length: rig.mesh.positions.length / 3 }, (_, v) => {
    sums.clear();
    for (let k = 0; k < BODY_INFLUENCES; k++) {
      const w = weights[v * BODY_INFLUENCES + k] ?? 0;
      if (w > 0) {
        const bone = rig.follows[joints[v * BODY_INFLUENCES + k] ?? 0] ?? 0;
        sums.set(bone, (sums.get(bone) ?? 0) + w);
      }
    }
    const [first, second] = [...sums].toSorted((a, b) => b[1] - a[1] || a[0] - b[0]);
    const main = first?.[0] ?? 0;
    if (!second) {
      return { bone: main, blendBone: main, blendWeight: 0 };
    }
    return {
      bone: main,
      blendBone: second[0],
      blendWeight: second[1] / (second[1] + (first?.[1] ?? 1)),
    };
  });
}

/**
 * Builds a body in the bind pose of the player, and adds its triangles to a mesh (design
 * 4.4). The arms of the body come down from their bind pose to hang straight, with the skin and
 * the corrective shapes of the body, as the GPU poses them. The trunk, the head, and the legs
 * keep the bind pose of the body. Each corner follows the two bones of the player with the
 * largest weights, for the readers of the bind mesh. The bead eyes (`addEye()`) follow
 * the triangles of the body, each on its eye bone (`Body.eyes`, design 4.5). The scene draws
 * the body with the skin of the body (`BodyRig`). A body keeps the stance of its role
 * on each support: the bear conductor stands, and the polar bear pianist sits on its bench
 * (`Body.seatHeight`). A seated body that also stands, such as the violinist rabbit, sits on
 * a seat and stands as a soloist ({@link bodyRigOf}). A species can take another palette of the
 * faces, as the tan foxes take the tan palette of the fox mesh.
 *
 * @param builder The mesh that gets the triangles.
 * @param name The body.
 * @param stands True for a player that stands.
 * @param palette Another palette of the faces. The colors of the mesh by default.
 * @returns The bind positions of the body bones, and the points that the instruments need.
 */
export function buildBody(
  builder: MeshBuilder,
  name: BodyName,
  stands: boolean,
  palette?: BodyPalette,
): BodyBones {
  return runAll(buildBodySteps(builder, name, stands, palette));
}

/**
 * Adds the triangles of a body to the mesh of a player as {@link buildBody} does, in
 * steps (design 7.2).
 *
 * @param builder The mesh that gets the triangles.
 * @param name The body.
 * @param stands True for a player that stands.
 * @param palette Another palette of the faces. The colors of the mesh by default.
 * @returns The steps, which return the bind positions of the body bones and the points that the
 *   instruments need.
 */
export function* buildBodySteps(
  builder: MeshBuilder,
  name: BodyName,
  stands: boolean,
  palette?: BodyPalette,
): Steps<BodyBones> {
  const rig = bodyRigOf(name, stands);
  yield;
  const { body, positions } = rig;
  const skeleton = makeSkeleton(
    {
      ...positions,
      instrument: positions.chest,
      bow: positions.handR,
      malletL: positions.handL,
      malletR: positions.handR,
      baton: positions.handR,
      slide: positions.chest,
    },
    'chest',
  );
  const bind = new Float32Array(BONE_NAMES.length * 4).map((_, i) => (i % 4 === 3 ? 1 : 0));
  const posed = skinBodyMesh(
    rig.mesh,
    poseBodyBones(rig, skeleton, bind, NO_OFFSETS, 1, createBodyPose()),
  );
  yield;

  const { corners, finishes } = rig.mesh;
  const colors = yield* bodyCornerColorsSteps(
    rig.mesh,
    palette ? colorsWith(name, palette) : rig.mesh.colors,
    body.crease,
    body.colorBlend ?? 0,
    body.caps,
  );
  yield;
  const skins = playerSkins(rig);
  const places = new Float32Array(corners.length * 3);
  for (const [c, v] of corners.entries()) {
    places.set(posed.subarray(v * 3, v * 3 + 3), c * 3);
  }
  builder.addFaces(places, colors, finishes, (c) => {
    const skin = skins[corners[c] ?? 0];
    return skin ?? { bone: 0, blendBone: 0, blendWeight: 0 };
  });
  yield;
  // The head keeps the bind pose of the body, so each bead eye goes to the bind place of its eye
  // bone, bent to the head surface when the body has bends. The eyes blink with the eye bones of
  // the body (`bodyRenderMesh()`). A body that shows the eyes of its mesh gets no pea eyes.
  const { eyes } = body;
  if (eyes) {
    for (const side of ['L', 'R'] as const) {
      addEye(
        builder,
        EYE_COLORS,
        { point: body.heads[`eye_${side}`], normal: eyes.directions[side] },
        eyes.headHeight,
        boneIndex(`eye${side}`),
        eyes.bends?.[side],
      );
    }
  }

  const midpoint = (a: Vec3, b: Vec3): Vec3 => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
  // The finger block of the bind pose of the player hangs straight down from its bone.
  const tip = (side: 'L' | 'R'): Vec3 => {
    const length = new Vector3(...body.fingerTips[side]).distanceTo(
      new Vector3(...body.heads[`fingers_${side}`]),
    );
    const fingers = positions[`fingers${side}`];
    return [fingers[0], fingers[1] - length, fingers[2]];
  };
  const h = body.headHeight;
  return {
    headHeight: h,
    headCenter: body.headCenter,
    mouth: body.mouth ?? [body.nose[0], body.nose[1] - MOUTH_DROP * h, body.nose[2]],
    floor: body.floor,
    palmL: midpoint(positions.handL, positions.fingersL),
    palmR: midpoint(positions.handR, positions.fingersR),
    fingerBlockL: midpoint(positions.fingersL, tip('L')),
    positions,
  };
}

/**
 * The mesh of a player with a body as the GPU draws it (design 4.4): the body in the bind
 * pose of the body, with the skin of the body, and the instrument in the bind pose of the
 * player, on the bones of the player.
 */
export interface BodyRenderMesh {
  /**
   * The corners, the colors, and the finishes. The bones of the corners are the main bones of the
   * mesh of the player, for the readers of the bind mesh.
   */
  readonly data: MeshData;
  /**
   * The four bones of each corner, as indices in the matrices of a `BodyPose`: the body bones,
   * then the bones of the player.
   */
  readonly joints: Uint16Array;
  /** The four weights of each corner. */
  readonly weights: Float32Array;
  /** The move of each corner for each corrective shape: x, y, z in meters. */
  readonly correctives: readonly Float32Array[];
  /** The smooth normals of the body, with its crease angle (`Body.crease`, design 4.5). */
  readonly normals: SmoothNormals;
  /**
   * The color map of the fur (`Body.texture`, design 4.5), or `null` for a body that shows
   * the colors of its faces.
   */
  readonly texture: PlayerTexture | null;
}

/** The color map of a body as the GPU draws it (design 4.5). */
export interface PlayerTexture {
  /** The web copy of the image, relative to the repository (`BodyTexture.file`). */
  readonly file: string;
  /**
   * u and v of each corner of the mesh of the player, with v from the top edge. A corner with no
   * texture, such as a corner of the gloss nose, a whisker, a pea eye, or the instrument, has
   * `NO_UV` in both.
   */
  readonly uvs: Float32Array;
}

/** The texture points of the body corners of each body with a color map, made once. */
const bodyUvs = new WeakMap<Body, Float32Array>();

/**
 * Gives the color map of a body for the mesh of a player: the texture points of the body
 * corners, which come first, and {@link NO_UV} for the other corners.
 *
 * @param body The body.
 * @param total The number of corners of the mesh of the player, with the instrument.
 * @returns The color map, or `null` for a body with none.
 */
function bodyTextureOf(body: Body, total: number): PlayerTexture | null {
  if (!body.texture) {
    return null;
  }
  let corners = bodyUvs.get(body);
  if (!corners) {
    corners = unpackBodyUvs(body.texture.uvs, unpackBodyMesh(body.mesh));
    bodyUvs.set(body, corners);
  }
  const uvs = new Float32Array(total * 2).fill(NO_UV);
  uvs.set(corners.subarray(0, Math.min(corners.length, uvs.length)));
  return { file: body.texture.file, uvs };
}

/** The smooth normals of a body as the GPU draws them (design 4.5). */
export interface SmoothNormals {
  /** The unit normal of each corner of the body: x, y, z, in the order of the corners. */
  readonly corners: Float32Array;
  /**
   * The change of the normal of each corner of the mesh for each corrective shape at its full
   * weight: x, y, z, in the order of {@link BodyRenderMesh.correctives}. The instrument has 0.
   */
  readonly moves: readonly Float32Array[];
}

/**
 * The smooth normals of the body corners of each body rig, made on their first use: the players
 * of one species share a rig, so each rig calculates its normals one time.
 */
const rigNormals = new WeakMap<BodyRig, SmoothNormals>();

/**
 * Calculates the smooth normals of the body corners of a body rig, and their changes for each
 * corrective shape, one time for each rig.
 *
 * @param rig The body rig.
 * @returns The steps, which return the normals. Each array holds the body corners only. The
 *   callers do not change it.
 */
function* rigSmoothNormalsSteps(rig: BodyRig): Steps<SmoothNormals> {
  let normals = rigNormals.get(rig);
  if (!normals) {
    const { positions, correctives } = rig.mesh;
    const { caps, rim, eyeballs, crease } = rig.body;
    const corners = bodyNormals(rig.mesh, crease, caps, rim, eyeballs);
    const moves: Float32Array[] = [];
    for (const corrective of correctives) {
      yield;
      const moved = positions.map((p, i) => p + (corrective[i] ?? 0));
      const after = bodyNormals({ ...rig.mesh, positions: moved }, crease, caps, rim, eyeballs);
      const move = new Float32Array(corners.length);
      for (let i = 0; i < corners.length; i++) {
        move[i] = (after[i] ?? 0) - (corners[i] ?? 0);
      }
      moves.push(move);
    }
    normals = { corners, moves };
    rigNormals.set(rig, normals);
  }
  return normals;
}

/**
 * Gives the smooth normals of a body with its crease angle (`Body.crease`), and their
 * changes for each corrective shape. A shape moves the skin of a shoulder by a few centimeters,
 * and turns the normals of some corners by more than 20°, so the GPU adds the changes as morph
 * normals.
 *
 * @param rig The body rig.
 * @param total The number of corners of the mesh of the player, with the instrument.
 * @returns The steps, which return the normals.
 */
function* smoothNormalsSteps(rig: BodyRig, total: number): Steps<SmoothNormals> {
  const { corners, moves } = yield* rigSmoothNormalsSteps(rig);
  return {
    corners,
    moves: moves.map((body) => {
      const move = new Float32Array(total * 3);
      move.set(body);
      return move;
    }),
  };
}

/**
 * The eye bone of the body for each eye bone of the player. A part of the mesh of the player on
 * an eye bone of the player follows the eye bone of the body, so that it closes in a blink
 * (design 5.1): the scene scales or turns only the eye bones of the body (`poseBodyBones()`).
 */
const BODY_EYES: ReadonlyMap<number, number> = new Map([
  [boneIndex('eyeL'), BODY_BONES.indexOf('eye_L')],
  [boneIndex('eyeR'), BODY_BONES.indexOf('eye_R')],
]);

/**
 * Gives the index of a bone of the player in the matrices of a `BodyPose`: the eye bone of the
 * body for an eye bone of the player ({@link BODY_EYES}), or the bone of the player after the
 * bones of the body.
 *
 * @param bone The bone of the player.
 * @returns The index of the matrix.
 */
function playerJoint(bone: number): number {
  return BODY_EYES.get(bone) ?? BODY_BONES.length + bone;
}

/**
 * Makes the mesh of a player with a body as the GPU draws it. The triangles of the body
 * come first in the mesh of the player (`buildBody()`), and the parts on the bones of the
 * player follow, such as the instrument. A part on an eye bone of the player follows the eye bone
 * of the body ({@link BODY_EYES}).
 *
 * @param rig The body rig.
 * @param mesh The mesh of the player in its bind pose.
 * @returns The render mesh.
 */
export function bodyRenderMesh(rig: BodyRig, mesh: MeshData): BodyRenderMesh {
  return runAll(bodyRenderMeshSteps(rig, mesh));
}

/**
 * Makes the mesh of a player with a body as {@link bodyRenderMesh} does, in steps
 * (design 7.2).
 *
 * @param rig The body rig.
 * @param mesh The mesh of the player in its bind pose.
 * @returns The steps, which return the render mesh.
 */
export function* bodyRenderMeshSteps(rig: BodyRig, mesh: MeshData): Steps<BodyRenderMesh> {
  const normals = yield* smoothNormalsSteps(rig, mesh.bones.length);
  yield;
  const { corners, positions, joints, weights, correctives } = rig.mesh;
  const bodyCorners = corners.length;
  const total = mesh.bones.length;
  const places = new Float32Array(mesh.positions);
  const cornerJoints = new Uint16Array(total * BODY_INFLUENCES);
  const cornerWeights = new Float32Array(total * BODY_INFLUENCES);
  const moves = correctives.map(() => new Float32Array(total * 3));
  for (let c = 0; c < total; c++) {
    if (c < bodyCorners) {
      const v = corners[c] ?? 0;
      places.set(positions.subarray(v * 3, v * 3 + 3), c * 3);
      for (let k = 0; k < BODY_INFLUENCES; k++) {
        cornerJoints[c * BODY_INFLUENCES + k] = joints[v * BODY_INFLUENCES + k] ?? 0;
        cornerWeights[c * BODY_INFLUENCES + k] = weights[v * BODY_INFLUENCES + k] ?? 0;
      }
      for (const [s, move] of moves.entries()) {
        move.set(correctives[s]?.subarray(v * 3, v * 3 + 3) ?? [0, 0, 0], c * 3);
      }
    } else {
      const blend = mesh.blendWeights[c] ?? 0;
      cornerJoints[c * BODY_INFLUENCES] = playerJoint(mesh.bones[c] ?? 0);
      cornerJoints[c * BODY_INFLUENCES + 1] = playerJoint(mesh.blendBones[c] ?? 0);
      cornerWeights[c * BODY_INFLUENCES] = 1 - blend;
      cornerWeights[c * BODY_INFLUENCES + 1] = blend;
    }
  }
  return {
    data: { ...mesh, positions: places },
    joints: cornerJoints,
    weights: cornerWeights,
    correctives: moves,
    normals,
    texture: bodyTextureOf(rig.body, total),
  };
}
