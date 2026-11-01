import { Vector3 } from 'three';

import type { BodyBones } from './biped.ts';
import { addEye } from './eyes.ts';
import type { EyeColors } from './eyes.ts';
import { srgb } from './mesh.ts';
import type { CornerSkin, MeshBuilder, MeshData } from './mesh.ts';
import { BONE_NAMES, boneIndex } from './rig.ts';
import { makeSkeleton } from './rig.ts';
import { STUDIO_BONES, STUDIO_INFLUENCES, unpackStudioMesh } from './studio-format.ts';
import type { StudioBody, StudioPalette } from './studio-format.ts';
import { studioCornerColorsSteps, studioNormals } from './studio-normals.ts';
import {
  NO_OFFSETS,
  createStudioPose,
  poseStudioBones,
  skinStudioMesh,
  studioRig,
} from './studio-rig.ts';
import type { StudioRig } from './studio-rig.ts';
import { STUDIO_BADGER } from './studio/badger.ts';
import { STUDIO_BEAR } from './studio/bear.ts';
import { STUDIO_BEAVER } from './studio/beaver.ts';
import { STUDIO_CAT } from './studio/cat.ts';
import { STUDIO_DEER } from './studio/deer.ts';
import { STUDIO_DOG } from './studio/dog.ts';
import { STUDIO_ELEPHANT } from './studio/elephant.ts';
import { STUDIO_FOX } from './studio/fox.ts';
import { STUDIO_HIPPO } from './studio/hippo.ts';
import { STUDIO_MONKEY } from './studio/monkey.ts';
import { STUDIO_MOUSE } from './studio/mouse.ts';
import { STUDIO_PANDA } from './studio/panda.ts';
import { STUDIO_PENGUIN } from './studio/penguin.ts';
import { STUDIO_PIG } from './studio/pig.ts';
import { STUDIO_POLAR_BEAR } from './studio/polar-bear.ts';
import { STUDIO_RABBIT } from './studio/rabbit.ts';
import { STUDIO_RHINO } from './studio/rhino.ts';
import { STUDIO_WOLF } from './studio/wolf.ts';
import { EYE_COLOR, EYE_LIGHT_COLOR } from './species.ts';
import type { Vec3 } from './tuples.ts';
import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';

/** The studio bodies that a species can have (design 4.4), by the value of `SpeciesParams.body`. */
export const STUDIO_BODIES = {
  'studio-badger': STUDIO_BADGER,
  'studio-bear': STUDIO_BEAR,
  'studio-beaver': STUDIO_BEAVER,
  'studio-cat': STUDIO_CAT,
  'studio-deer': STUDIO_DEER,
  'studio-dog': STUDIO_DOG,
  'studio-elephant': STUDIO_ELEPHANT,
  'studio-fox': STUDIO_FOX,
  'studio-hippo': STUDIO_HIPPO,
  'studio-monkey': STUDIO_MONKEY,
  'studio-mouse': STUDIO_MOUSE,
  'studio-panda': STUDIO_PANDA,
  'studio-penguin': STUDIO_PENGUIN,
  'studio-pig': STUDIO_PIG,
  'studio-rhino': STUDIO_RHINO,
  'studio-polar-bear': STUDIO_POLAR_BEAR,
  'studio-rabbit': STUDIO_RABBIT,
  'studio-wolf': STUDIO_WOLF,
} as const satisfies Readonly<Record<string, StudioBody>>;

/**
 * The test bodies (design 4.4, "Test mannequin"), by the value of `SpeciesParams.body`, each with
 * the load of its module: bodies of the rig chain that no section casts. The app loads no test
 * body, so the first download has none. A role tool or the gallery loads them with
 * {@link loadTestBodies} before it builds a player.
 */
const TEST_BODIES = {
  'studio-mannequin': async (): Promise<StudioBody> =>
    (await import('./studio/mannequin.ts')).STUDIO_MANNEQUIN,
} as const;

/** The name of a studio body of the app. */
type AppBodyName = keyof typeof STUDIO_BODIES;

/** The name of a test body. */
type TestBodyName = keyof typeof TEST_BODIES;

/** The name of a studio body of a species: a body of the app or a test body. */
export type StudioBodyName = AppBodyName | TestBodyName;

/** The test bodies that {@link loadTestBodies} loaded. */
const testBodies = new Map<TestBodyName, StudioBody>();

/**
 * Loads the module of each test body (design 4.4, "Test mannequin"), so that a player can have it.
 * Each module loads one time.
 */
export async function loadTestBodies(): Promise<void> {
  const loads = Object.entries(TEST_BODIES).map(async ([name, load]) => {
    if (isTestBody(name) && !testBodies.has(name)) {
      testBodies.set(name, await load());
    }
  });
  await Promise.all(loads);
}

/**
 * Tells if a name is the name of a test body.
 *
 * @param name The name.
 * @returns True for a key of {@link TEST_BODIES}.
 */
function isTestBody(name: string): name is TestBodyName {
  return Object.hasOwn(TEST_BODIES, name);
}

/**
 * Tells if a text names a studio body: a body of the app or a test body.
 *
 * @param name The text.
 * @returns True for a key of {@link STUDIO_BODIES} or of the test bodies.
 */
export function isStudioBodyName(name: string): name is StudioBodyName {
  return Object.hasOwn(STUDIO_BODIES, name) || isTestBody(name);
}

/**
 * Tells if a body name is the name of a body of the app.
 *
 * @param name The name of a studio body.
 * @returns True for a key of {@link STUDIO_BODIES}.
 */
function isAppBody(name: StudioBodyName): name is AppBodyName {
  return Object.hasOwn(STUDIO_BODIES, name);
}

/**
 * Gives a studio body by its name: a body of the app, or a test body that
 * {@link loadTestBodies} loaded.
 *
 * @param name The studio body.
 * @returns The body.
 * @throws Error if the name is a test body that is not loaded.
 */
export function studioBodyOf(name: StudioBodyName): StudioBody {
  if (isAppBody(name)) {
    return STUDIO_BODIES[name];
  }

  const body = testBodies.get(name);
  if (!body) {
    throw new Error(
      `The test body ${name} is not loaded. Call loadTestBodies() before a player of a test species (design 4.4).`,
    );
  }
  return body;
}

/** The rig of each studio body and stance, made on its first use. */
const rigs = new Map<string, StudioRig>();

/**
 * Gives the rig of a studio body. The rig of each body and stance is made one time. A seated body
 * that also stands has a standing rig (`standingBody()` of `studio-rig.ts`), and a standing body
 * that also sits has a seated rig (`seatedBody()`). Each other body keeps the stance of its role.
 *
 * @param name The studio body.
 * @param stands True for a player that stands.
 * @returns The rig.
 */
export function studioRigOf(name: StudioBodyName, stands: boolean): StudioRig {
  const body = studioBodyOf(name);
  const stance =
    stands && body.standing ? 'standing' : !stands && body.sitting ? 'sitting' : 'bind';
  const key = `${name} ${stance}`;
  let rig = rigs.get(key);
  if (!rig) {
    rig = studioRig(body, stands);
    rigs.set(key, rig);
  }
  return rig;
}

/** The colors of the faces of each studio body with another palette, made on their first use. */
const paletteColors = new Map<string, Float32Array>();

/**
 * Gives the colors of the faces of a studio body with another palette (design 4.4, 4.5).
 *
 * @param name The studio body.
 * @param palette The other palette.
 * @returns Linear r, g, b of each triangle.
 * @throws Error if the body has no such palette.
 */
function colorsWith(name: StudioBodyName, palette: StudioPalette): Float32Array {
  const key = `${name} ${palette}`;
  let colors = paletteColors.get(key);
  if (!colors) {
    const body = studioBodyOf(name);
    const packed = body.palettes?.[palette];
    if (packed === undefined) {
      throw new Error(`The studio body ${name} has no ${palette} palette.`);
    }
    colors = unpackStudioMesh(body.mesh, packed).colors;
    paletteColors.set(key, colors);
  }
  return colors;
}

/** The place of the mouth below the tip of the nose, in H. */
const MOUTH_DROP = 0.08;

/** The colors of the pea eyes: the eyes of all species (design 4.5). */
const EYE_COLORS: EyeColors = { eye: srgb(EYE_COLOR), eyeLight: srgb(EYE_LIGHT_COLOR) };

/**
 * Gives the skin of each vertex of a studio body on the bones of the player: the two bones of the
 * player with the largest sums of the weights of their studio bones (design 4.7). The readers of
 * the bind mesh read the main bone, such as the footprints and the hanging arms.
 *
 * @param rig The studio rig.
 * @returns The skin of each vertex.
 */
function playerSkins(rig: StudioRig): CornerSkin[] {
  const { joints, weights } = rig.mesh;
  const sums = new Map<number, number>();
  return Array.from({ length: rig.mesh.positions.length / 3 }, (_, v) => {
    sums.clear();
    for (let k = 0; k < STUDIO_INFLUENCES; k++) {
      const w = weights[v * STUDIO_INFLUENCES + k] ?? 0;
      if (w > 0) {
        const bone = rig.follows[joints[v * STUDIO_INFLUENCES + k] ?? 0] ?? 0;
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
 * Builds a studio body in the bind pose of the player, and adds its triangles to a mesh (design
 * 4.4). The arms of the studio come down from their bind pose to hang straight, with the skin and
 * the corrective shapes of the studio, as the GPU poses them. The trunk, the head, and the legs
 * keep the bind pose of the studio. Each corner follows the two bones of the player with the
 * largest weights, for the readers of the bind mesh. The pea eyes of the parametric bodies follow
 * the triangles of the body, each on its eye bone (`StudioBody.eyes`, design 4.5). The scene draws
 * the body with the skin of the studio (`StudioRig`). A studio body keeps the stance of its role
 * on each support: the bear conductor stands, and the polar bear pianist sits on its bench
 * (`StudioBody.seatHeight`). A seated body that also stands, such as the violinist rabbit, sits on
 * a seat and stands as a soloist, and a standing body that also sits (`StudioBody.sitting`) sits
 * on a seat ({@link studioRigOf}). A species can take another palette of the
 * faces, as the tan foxes take the tan palette of the fox mesh.
 *
 * @param builder The mesh that gets the triangles.
 * @param name The studio body.
 * @param stands True for a player that stands.
 * @param palette Another palette of the faces. The colors of the mesh by default.
 * @returns The bind positions of the body bones, and the points that the instruments need.
 */
export function buildStudioBody(
  builder: MeshBuilder,
  name: StudioBodyName,
  stands: boolean,
  palette?: StudioPalette,
): BodyBones {
  return runAll(buildStudioBodySteps(builder, name, stands, palette));
}

/**
 * Adds the triangles of a studio body to the mesh of a player as {@link buildStudioBody} does, in
 * steps (design 7.2).
 *
 * @param builder The mesh that gets the triangles.
 * @param name The studio body.
 * @param stands True for a player that stands.
 * @param palette Another palette of the faces. The colors of the mesh by default.
 * @returns The steps, which return the bind positions of the body bones and the points that the
 *   instruments need.
 */
export function* buildStudioBodySteps(
  builder: MeshBuilder,
  name: StudioBodyName,
  stands: boolean,
  palette?: StudioPalette,
): Steps<BodyBones> {
  const rig = studioRigOf(name, stands);
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
  const posed = skinStudioMesh(
    rig.mesh,
    poseStudioBones(rig, skeleton, bind, NO_OFFSETS, 1, createStudioPose()),
  );
  yield;

  const { corners, finishes } = rig.mesh;
  const colors = yield* studioCornerColorsSteps(
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
  // The head keeps the bind pose of the studio, so each pea eye goes to the bind place of its eye
  // bone, bent to the head surface when the body has bends. The eyes blink with the eye bones of
  // the studio (`studioRenderMesh()`).
  for (const side of ['L', 'R'] as const) {
    addEye(
      builder,
      EYE_COLORS,
      { point: body.heads[`eye_${side}`], normal: body.eyes.directions[side] },
      body.eyes.headHeight,
      boneIndex(`eye${side}`),
      body.eyes.bends?.[side],
    );
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
    mouth: [body.nose[0], body.nose[1] - MOUTH_DROP * h, body.nose[2]],
    floor: body.floor,
    palmL: midpoint(positions.handL, positions.fingersL),
    palmR: midpoint(positions.handR, positions.fingersR),
    fingerBlockL: midpoint(positions.fingersL, tip('L')),
    fingerBlockR: midpoint(positions.fingersR, tip('R')),
    positions,
  };
}

/**
 * The mesh of a player with a studio body as the GPU draws it (design 4.4): the body in the bind
 * pose of the studio, with the skin of the studio, and the instrument in the bind pose of the
 * player, on the bones of the player.
 */
export interface StudioRenderMesh {
  /**
   * The corners, the colors, and the finishes. The bones of the corners are the main bones of the
   * mesh of the player, for the readers of the bind mesh.
   */
  readonly data: MeshData;
  /**
   * The four bones of each corner, as indices in the matrices of a `StudioPose`: the studio bones,
   * then the bones of the player.
   */
  readonly joints: Uint16Array;
  /** The four weights of each corner. */
  readonly weights: Float32Array;
  /** The move of each corner for each corrective shape: x, y, z in meters. */
  readonly correctives: readonly Float32Array[];
  /** The smooth normals of the body, with its crease angle (`StudioBody.crease`, design 4.5). */
  readonly normals: SmoothNormals;
}

/** The smooth normals of a studio body as the GPU draws them (design 4.5). */
export interface SmoothNormals {
  /** The unit normal of each corner of the body: x, y, z, in the order of the corners. */
  readonly corners: Float32Array;
  /**
   * The change of the normal of each corner of the mesh for each corrective shape at its full
   * weight: x, y, z, in the order of {@link StudioRenderMesh.correctives}. The instrument has 0.
   */
  readonly moves: readonly Float32Array[];
}

/**
 * The smooth normals of the body corners of each studio rig, made on their first use: the players
 * of one species share a rig, so each rig calculates its normals one time.
 */
const rigNormals = new WeakMap<StudioRig, SmoothNormals>();

/**
 * Calculates the smooth normals of the body corners of a studio rig, and their changes for each
 * corrective shape, one time for each rig.
 *
 * @param rig The studio rig.
 * @returns The steps, which return the normals. Each array holds the body corners only. The
 *   callers do not change it.
 */
function* rigSmoothNormalsSteps(rig: StudioRig): Steps<SmoothNormals> {
  let normals = rigNormals.get(rig);
  if (!normals) {
    const { positions, correctives } = rig.mesh;
    const { caps, rim, crease } = rig.body;
    const corners = studioNormals(rig.mesh, crease, caps, rim);
    const moves: Float32Array[] = [];
    for (const corrective of correctives) {
      yield;
      const moved = positions.map((p, i) => p + (corrective[i] ?? 0));
      const after = studioNormals({ ...rig.mesh, positions: moved }, crease, caps, rim);
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
 * Gives the smooth normals of a studio body with its crease angle (`StudioBody.crease`), and their
 * changes for each corrective shape. A shape moves the skin of a shoulder by a few centimeters,
 * and turns the normals of some corners by more than 20°, so the GPU adds the changes as morph
 * normals.
 *
 * @param rig The studio rig.
 * @param total The number of corners of the mesh of the player, with the instrument.
 * @returns The steps, which return the normals.
 */
function* smoothNormalsSteps(rig: StudioRig, total: number): Steps<SmoothNormals> {
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
 * The eye bone of the studio for each eye bone of the player. A part of the mesh of the player on
 * an eye bone of the player follows the eye bone of the studio, so that it closes in a blink
 * (design 5.1): the scene scales only the eye bones of the studio (`poseStudioBones()`).
 */
const STUDIO_EYES: ReadonlyMap<number, number> = new Map([
  [boneIndex('eyeL'), STUDIO_BONES.indexOf('eye_L')],
  [boneIndex('eyeR'), STUDIO_BONES.indexOf('eye_R')],
]);

/**
 * Gives the index of a bone of the player in the matrices of a `StudioPose`: the eye bone of the
 * studio for an eye bone of the player ({@link STUDIO_EYES}), or the bone of the player after the
 * bones of the studio.
 *
 * @param bone The bone of the player.
 * @returns The index of the matrix.
 */
function playerJoint(bone: number): number {
  return STUDIO_EYES.get(bone) ?? STUDIO_BONES.length + bone;
}

/**
 * Makes the mesh of a player with a studio body as the GPU draws it. The triangles of the body
 * come first in the mesh of the player (`buildStudioBody()`), and the parts on the bones of the
 * player follow, such as the instrument. A part on an eye bone of the player follows the eye bone
 * of the studio ({@link STUDIO_EYES}).
 *
 * @param rig The studio rig.
 * @param mesh The mesh of the player in its bind pose.
 * @returns The render mesh.
 */
export function studioRenderMesh(rig: StudioRig, mesh: MeshData): StudioRenderMesh {
  return runAll(studioRenderMeshSteps(rig, mesh));
}

/**
 * Makes the mesh of a player with a studio body as {@link studioRenderMesh} does, in steps
 * (design 7.2).
 *
 * @param rig The studio rig.
 * @param mesh The mesh of the player in its bind pose.
 * @returns The steps, which return the render mesh.
 */
export function* studioRenderMeshSteps(rig: StudioRig, mesh: MeshData): Steps<StudioRenderMesh> {
  const normals = yield* smoothNormalsSteps(rig, mesh.bones.length);
  yield;
  const { corners, positions, joints, weights, correctives } = rig.mesh;
  const bodyCorners = corners.length;
  const total = mesh.bones.length;
  const places = new Float32Array(mesh.positions);
  const cornerJoints = new Uint16Array(total * STUDIO_INFLUENCES);
  const cornerWeights = new Float32Array(total * STUDIO_INFLUENCES);
  const moves = correctives.map(() => new Float32Array(total * 3));
  for (let c = 0; c < total; c++) {
    if (c < bodyCorners) {
      const v = corners[c] ?? 0;
      places.set(positions.subarray(v * 3, v * 3 + 3), c * 3);
      for (let k = 0; k < STUDIO_INFLUENCES; k++) {
        cornerJoints[c * STUDIO_INFLUENCES + k] = joints[v * STUDIO_INFLUENCES + k] ?? 0;
        cornerWeights[c * STUDIO_INFLUENCES + k] = weights[v * STUDIO_INFLUENCES + k] ?? 0;
      }
      for (const [s, move] of moves.entries()) {
        move.set(correctives[s]?.subarray(v * 3, v * 3 + 3) ?? [0, 0, 0], c * 3);
      }
    } else {
      const blend = mesh.blendWeights[c] ?? 0;
      cornerJoints[c * STUDIO_INFLUENCES] = playerJoint(mesh.bones[c] ?? 0);
      cornerJoints[c * STUDIO_INFLUENCES + 1] = playerJoint(mesh.blendBones[c] ?? 0);
      cornerWeights[c * STUDIO_INFLUENCES] = 1 - blend;
      cornerWeights[c * STUDIO_INFLUENCES + 1] = blend;
    }
  }
  return {
    data: { ...mesh, positions: places },
    joints: cornerJoints,
    weights: cornerWeights,
    correctives: moves,
    normals,
  };
}
