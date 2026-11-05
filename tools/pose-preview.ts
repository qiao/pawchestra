/**
 * Writes the pose that the app draws for the first player of a role into a JSON file for the
 * preview in Blender (`tools/blender/studio_preview.py`, design 4.4, "Hand rig"). Each moment
 * gives the turn and the head of each bone of the skin, the arm segments and the helpers too
 * (`poseStudioBones()`), and the weight of each morph target, in the axes and the units of the
 * `.blend`. A moment of `ROLE_VIEWS` of `tools/close-views.ts` (`--moments`) poses the gallery
 * page of that moment, with the test notes of the role. A demo time (`--times`) poses the seat of
 * the first player of the role in the demo of `--demo`, or in the first demo with the role. With
 * no `--times`, the file holds each moment of the role. With `--times` and no `--moments`, it
 * holds only the demo times, and `--moments all` adds each moment.
 *
 * A standing or a seated stance of the body (`standingBody()`, `seatedBody()`) puts the stance
 * matrices before the pose, and sets the leg or the sit shapes to 1. The app skins such a body
 * twice, so the preview of that moment differs from the app at the joints of the legs. `--skin`
 * also writes, for `studio_preview.py --check`, the place of each vertex of the app in the bind of
 * the GLB file, its posed place in the app (`skinStudioMesh()` on the packed mesh), and its posed
 * place from the data of the GLB file with the same pose (the exact preview).
 *
 * `--glb <file>` takes the studio body of another GLB file, such as an export of
 * `refresh_preview()` (`tools/glb-swap.ts`). `--from <file>` is the GLB file of the module in such
 * a run.
 *
 * Usage: pnpm pose-preview <role> [--moments <name,...>] [--times <s,...>] [--demo <id>]
 *   [--wall <s>] [--set <changes>]... [--skin] [--glb <file>] [--out <file>]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

import { castRoleOf, closeViewPath, viewsOf } from './close-views.ts';
import type { RoleViews } from './close-views.ts';
import { findRole, roleBodies, roleScene } from './fold-probe.ts';
import { runTool, speciesAnimal, takeGlb, withGlbBody } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { probeDemos } from './probe-demos.ts';
import { ROOT } from './ref-tree.ts';
import {
  CORRECTIVE_NAMES,
  LEG_CORRECTIVE_NAMES,
  SIT_CORRECTIVE_NAMES,
  ANIMALS,
  eyeVertices,
  keptCorrectives,
  orderByFirstUse,
  raisesOf,
  readGlb,
  readSkeleton,
  settingsOf,
  sitsIn,
  weldMesh,
} from './studio-body.ts';
import type { Glb } from './studio-body.ts';
import {
  galleryMove,
  gallerySupport,
  galleryTransport,
  moveTransport,
  selectItems,
  speciesItems,
} from '../src/gallery/items.ts';
import type { GalleryItem } from '../src/gallery/items.ts';
import { DEFAULT_TEST_NOTES, parseTestNotes } from '../src/gallery/notes.ts';
import { galleryPlan } from '../src/gallery/plan.ts';
import type { GalleryAnimal } from '../src/gallery/plan.ts';
import { keyLightPlace } from '../src/models/beam.ts';
import { CONDUCTOR } from '../src/models/cast.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { SPECIES } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { studioBodyOf } from '../src/models/studio-body.ts';
import { STUDIO_BONES, STUDIO_PARENTS, unpackStudioMesh } from '../src/models/studio-format.ts';
import type { StudioBody, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import {
  createStudioPose,
  poseStudioBones,
  seatedBody,
  skinStudioMesh,
  standingBody,
  studioOffsets,
} from '../src/models/studio-rig.ts';
import type { StudioPose } from '../src/models/studio-rig.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { PLAYING, allAudible } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import type { PosePlan } from '../src/pose/plan.ts';
import type { AnimalPose } from '../src/pose/types.ts';
import { CLOSED_EYE_SCALE } from '../src/scene/player.ts';

/** The text of the usage. */
const USAGE =
  'Usage: pnpm pose-preview <role> [--moments <name,...>] [--times <s,...>] [--demo <id>] [--wall <s>] [--set <changes>]... [--skin] [--glb <file>] [--out <file>]';

/** The options that take a value. */
const VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '--moments',
  '--times',
  '--demo',
  '--wall',
  '--set',
  '--from',
  '--out',
]);

/** The version of the JSON format. */
const PREVIEW_FORMAT = 1;

/** The wall time of a gallery moment with no `--wall`, in seconds. */
const GALLERY_WALL = 10;

/**
 * The wall time of a demo time before the song time and the count-in, in seconds: the lift of the
 * instruments ends long before, as in the play samples of `pnpm fold-probe`.
 */
const DEMO_WALL = 10;

/** The largest gap of a module head from its fit to the head of the GLB file, in meters. */
const FIT_LIMIT = 1e-5;

/** The largest gap of a posed bone matrix from a rigid move, after the move into the `.blend`. */
const RIGID_LIMIT = 1e-4;

/**
 * The largest gap of a vertex of the packed mesh of the app from its place in the GLB file, in
 * meters: half of the step of a packed coordinate on each axis (`PACKED_STEP`), with a margin.
 */
const PACKED_LIMIT = 2.5e-4;

/** The decimals of the numbers of the file: 1e-7 units is less than 1e-6 m. */
const DECIMALS = 7;

/**
 * The turn from the axes of the app model to the axes of the `.blend`: the app animal faces -z
 * with its left side at -x (`toModelAxes()` of `tools/studio-body.ts`), and the Blender animal
 * faces -y with its left side at +x and z up.
 */
const MODEL_TO_BLEND = new Matrix3().set(-1, 0, 0, 0, 0, 1, 0, 1, 0);

/** The command line. */
interface Options {
  /** The role, such as `violist` or `violinist@wolf`. */
  readonly role: string;
  /** The names of the moments of `--moments`, or `null` for each moment (`--moments all`). */
  readonly moments: readonly string[] | null;
  /** The song times of `--times`, in seconds. */
  readonly times: readonly number[];
  /** The demo of `--demo`, with no `.mid`, or `null` for the first demo with the role. */
  readonly demo: string | null;
  /** The wall time of the gallery moments, in seconds. */
  readonly wall: number;
  /** The hold changes of `--set`, joined with `;`, or `null`. */
  readonly holds: string | null;
  /** True to write the skins for the check. */
  readonly skin: boolean;
  /** The GLB file of `--from`, or `null` for the source of the module. */
  readonly from: string | null;
  /** The output file. */
  readonly out: string;
}

/** The turn and the head of one bone in one moment, in the axes and the units of the `.blend`. */
interface PreviewBone {
  /** The world turn of the bone from the bind pose after the world turn of its parent: w, x, y, z. */
  readonly turn: readonly [number, number, number, number];
  /** The posed head of the bone. */
  readonly head: Vec3;
}

/** The stance of the body in a moment: the bind of the export, or a stance of `studioRig()`. */
type Stance = 'bind' | 'standing' | 'sitting';

/** The stance of a model and its matrices of the bones, or `null` for the bind of the export. */
interface StanceMatrices {
  readonly stance: Stance;
  readonly matrices: Float32Array | null;
}

/** The mesh of the app from the data of the GLB file, and its bind in the `.blend`. */
interface FileMesh {
  /** The mesh in the model axes, with the vertices in the order of the module. */
  readonly mesh: StudioMesh;
  /** X, y, z of each vertex in the bind pose of the GLB file, in the `.blend`. */
  readonly bind: number[];
}

/** One moment of the file. */
interface PreviewMoment {
  /** The name: the moment of `ROLE_VIEWS`, or the demo time, such as `163.50s`. */
  readonly name: string;
  /** `gallery`, or the demo of the time. */
  readonly source: string;
  /** The song time, in seconds. */
  readonly time: number;
  /** The wall time, in seconds. */
  readonly wall: number;
  readonly stance: Stance;
  /** Each bone of the GLB file, by name. */
  readonly bones: Readonly<Record<string, PreviewBone>>;
  /** The weight of each morph target, by name. A morph target that is not here has the weight 0. */
  readonly targets: Readonly<Record<string, number>>;
}

/** The skins of `--skin`, x, y, z of each vertex of the app mesh in the units of the `.blend`. */
interface PreviewSkin {
  /** The place of each vertex in the bind pose of the GLB file. */
  readonly bind: readonly number[];
  /** The posed places in the app, for each moment by name. */
  readonly app: Readonly<Record<string, readonly number[]>>;
  /** The posed places from the data of the GLB file with the pose of the preview. */
  readonly exact: Readonly<Record<string, readonly number[]>>;
}

/** The JSON file of the preview. */
interface PosePreview {
  readonly version: number;
  readonly role: string;
  readonly species: SpeciesId;
  /** The folder of the animal in `assets/models/`. */
  readonly animal: string;
  /** The GLB file of the module, as an absolute path. */
  readonly glb: string;
  /** The SHA-256 of the GLB file. */
  readonly sha256: string;
  /** The meters for each unit of the `.blend`. */
  readonly scale: number;
  /** The bones of the GLB file, each after its parent. */
  readonly bones: readonly StudioBone[];
  /** The parent of each bone, or `null` for the root. */
  readonly parents: Readonly<Record<string, string | null>>;
  /**
   * The unit direction from the chest of the player to the key light of the stage, in its seat of
   * the first demo with the role (or `--demo`).
   */
  readonly light: Vec3;
  /** The hold changes of `--set`, or `null`. */
  readonly holds: string | null;
  readonly moments: readonly PreviewMoment[];
  readonly skin?: PreviewSkin;
}

/** The move from the axes and the meters of the app model into the axes and the units of the `.blend`. */
interface BlendFrame {
  /** The meters for each unit. */
  readonly scale: number;
  /** The move of a point: x of the `.blend` = this matrix × x of the model. */
  readonly toBlend: Matrix4;
  /** The inverse move. */
  readonly toModel: Matrix4;
  /** The bones of the GLB file, each after its parent. */
  readonly bones: readonly StudioBone[];
  /** The head of each bone in the bind pose of the GLB file, in the `.blend`. */
  readonly heads: ReadonlyMap<StudioBone, Vector3>;
}

/** A pose of the player in one moment, with its model. */
interface Posed {
  readonly name: string;
  readonly source: string;
  readonly time: number;
  readonly wall: number;
  readonly model: PlayerModel;
  readonly pose: AnimalPose;
}

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The options.
 * @throws Error for a missing role or a value that is not valid.
 */
function optionsOf(args: readonly string[]): Options {
  const value = (name: string): string | null => {
    const at = args.indexOf(name);
    const next = at >= 0 ? args[at + 1] : undefined;
    if (at >= 0 && (next === undefined || next.startsWith('--'))) {
      throw new Error(`The option ${name} takes a value. ${USAGE}`);
    }
    return next ?? null;
  };
  const role = args.find(
    (arg, i) => !arg.startsWith('--') && !VALUE_OPTIONS.has(args[i - 1] ?? ''),
  );
  if (!role) {
    throw new Error(USAGE);
  }
  const list = (text: string | null): string[] | null =>
    text === null
      ? null
      : text.split(',').flatMap((item) => (item.trim() === '' ? [] : [item.trim()]));
  const times = (list(value('--times')) ?? []).map(Number);
  if (times.some((t) => !Number.isFinite(t))) {
    throw new Error(`The option --times takes song times in seconds. ${USAGE}`);
  }
  const wall = Number(value('--wall') ?? GALLERY_WALL);
  if (!Number.isFinite(wall)) {
    throw new Error(`The option --wall takes a time in seconds. ${USAGE}`);
  }
  const moments = list(value('--moments'));
  const sets = args.flatMap((arg, i) => (arg === '--set' ? [args[i + 1] ?? ''] : []));
  const from = value('--from');
  return {
    role,
    moments: moments?.join() === 'all' ? null : (moments ?? (times.length > 0 ? [] : null)),
    times,
    demo: value('--demo'),
    wall,
    holds: sets.length > 0 ? sets.join(';') : null,
    skin: args.includes('--skin'),
    from: from === null ? null : resolve(from),
    out: resolve(value('--out') ?? join(ROOT, 'scratch', 'pose-preview', `${role}.json`)),
  };
}

/**
 * Gives the turn of a model of the gallery around y (`facingOf()` of `src/gallery/main.ts`): the
 * pianist faces +x, and each other model faces the camera.
 *
 * @param item The item.
 * @returns The turn, in radians.
 */
function galleryFacing(item: GalleryItem): number {
  return item.instrument === 'piano' ? -Math.PI / 2 : Math.PI;
}

/**
 * Poses the gallery page of each moment of a role as `src/gallery/main.ts` does: the models of
 * the query `only`, each player in its own seat, the plan of the test notes, and the transport of
 * the query (`rest`, `lift`, `lower`, or the play). The subject is the first model of the page.
 *
 * @param views The close view of the role.
 * @param names The moments, or `null` for each moment of the role.
 * @param wall The wall time, in seconds.
 * @returns The pose of the subject in each moment.
 * @throws Error for a moment that the role does not have.
 */
function galleryPoses(views: RoleViews, names: readonly string[] | null, wall: number): Posed[] {
  const known = views.moments.map((moment) => moment.name);
  const unknown = (names ?? []).filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `The role has no moment ${unknown.join(', ')}. Its moments: ${known.join(', ')}.`,
    );
  }
  const notes = parseTestNotes(views.notes ?? DEFAULT_TEST_NOTES);
  if (!notes.ok) {
    throw new Error(`The test notes of the role are not valid at line ${notes.line}.`);
  }
  const view = views.views[0];
  if (!view) {
    throw new Error('The role has no view.');
  }

  const posed: Posed[] = [];
  for (const moment of views.moments.filter((m) => names === null || names.includes(m.name))) {
    const search = new URLSearchParams(closeViewPath(views, view, moment).split('?')[1] ?? '');
    const animals = selectItems(speciesItems(), search.get('only')).map((item) => ({
      item,
      model: buildPlayer(item.species, item.instrument, 4, gallerySupport(search, item.instrument)),
    }));
    const subject = animals[0];
    if (!subject) {
      throw new Error(`The gallery query ${search.toString()} shows no animal.`);
    }
    const lead = animals.find((a) => a.item.instrument === CONDUCTOR.instrument) ?? null;
    const place = (a: (typeof animals)[number], seatIndex: number): GalleryAnimal => ({
      model: a.model,
      place: {
        position: [0, 0, 0],
        facing: galleryFacing(a.item),
        cast: {
          seatIndex,
          player: 0,
          species: a.item.species,
          instrument: a.item.instrument,
          kettles: 4,
          support: a.model.support,
        },
      },
    });
    const players = animals.filter((a) => a !== lead);
    const plan = galleryPlan(
      players.map(place),
      lead ? place(lead, players.length) : null,
      notes.notes,
    );
    const pose = subjectPose(plan, players.indexOf(subject), moment.time, wall, search);
    if (!pose) {
      throw new Error(
        `The gallery gives no pose of the ${subject.item.species} at ${moment.name}.`,
      );
    }
    posed.push({
      name: moment.name,
      source: 'gallery',
      time: moment.time,
      wall,
      model: subject.model,
      pose,
    });
  }
  return posed;
}

/**
 * Poses the subject of a gallery page as `galleryPose()` of `src/gallery/main.ts` does: with no
 * move, the transport of the query poses the plan of all animals. With the query `lift` or
 * `lower`, the subject alone has the transport at the share of its own move (`aloneOf()`).
 *
 * @param plan The plan of the page.
 * @param k The index of the subject in the players, or -1 for the conductor.
 * @param time The song time of the slider, in seconds.
 * @param wall The wall time, in seconds.
 * @param search The query of the page.
 * @returns The pose, or `null` when the plan has no such animal.
 */
function subjectPose(
  plan: PosePlan,
  k: number,
  time: number,
  wall: number,
  search: URLSearchParams,
): AnimalPose | null {
  const move = galleryMove(search);
  if (k >= 0) {
    const own = plan.players[k];
    if (!own) {
      return null;
    }
    if (!move) {
      return (
        poseAt(plan, time, wall, galleryTransport(search), [], createScenePose(plan)).players[k] ??
        null
      );
    }
    const alone: PosePlan = { ...plan, players: [own], conductor: null };
    const at = moveTransport(move, own.motion, wall);
    return poseAt(alone, time, wall, at, [], createScenePose(alone)).players[0] ?? null;
  }

  const own = plan.conductor;
  if (!own) {
    return null;
  }
  if (!move) {
    return poseAt(plan, time, wall, galleryTransport(search), [], createScenePose(plan)).conductor;
  }
  const alone: PosePlan = { ...plan, players: [], conductor: own };
  const at = moveTransport(move, own.motion, wall);
  return poseAt(alone, time, wall, at, [], createScenePose(alone)).conductor;
}

/** The seat of the first player of a role in a demo. */
interface RoleSeat {
  /** The demo, with no `.mid`. */
  readonly id: string;
  readonly scene: TestScene;
  /** The index of the player in the layout, or `null` for the conductor. */
  readonly index: number | null;
  readonly model: PlayerModel;
}

/**
 * Finds the seat of the first player of a role in a demo, as `pnpm fold-probe` finds it: the
 * scene of the cast of the score, with the recast of a recast role.
 *
 * @param name The role.
 * @param demo The demo, with no `.mid`, or `null` for the first demo with the role.
 * @returns The seat.
 * @throws Error for an unknown role, or with no demo with the role.
 */
async function roleSeat(name: string, demo: string | null): Promise<RoleSeat> {
  const role = findRole(name);
  if (!role) {
    throw new Error(`${name} is no role. ${USAGE}`);
  }
  for (const file of await probeDemos()) {
    const id = file.file.replace(/\.mid$/, '');
    if (demo !== null && id !== demo) {
      continue;
    }
    const scene = roleScene(role, file.bytes);
    const body = roleBodies(role, scene)[0];
    if (body) {
      return { id, scene, index: body.index, model: body.model };
    }
  }
  throw new Error(`No demo${demo === null ? '' : ` ${demo}`} has a player of the role ${name}.`);
}

/**
 * Poses the first player of a role at song times of a demo, as `pnpm fold-probe` poses its play
 * samples: the play since long before, and each seat audible.
 *
 * @param seat The seat of the player.
 * @param times The song times, in seconds.
 * @returns The pose in each time.
 * @throws Error if the plan gives no pose of the player.
 */
function demoPoses(seat: RoleSeat, times: readonly number[]): Posed[] {
  const { scene, index, model, id } = seat;
  const audible = allAudible(scene.score);
  const countIn = countInAt(scene.plan.beats, 0).lengthSec;
  return times.map((time) => {
    const wall = DEMO_WALL + countIn + time;
    // The pose arrays are scratch arrays of the buffer, so each time has its own buffer.
    const frame = poseAt(scene.plan, time, wall, PLAYING, audible, createScenePose(scene.plan));
    const pose = index === null ? frame.conductor : frame.players[index];
    if (!pose) {
      throw new Error(`The demo ${id} gives no pose of the role at ${time} s.`);
    }
    return { name: `${time.toFixed(2)}s`, source: id, time, wall, model, pose };
  });
}

/**
 * Gives the direction from the chest of a player to the key light of the stage (design 4.5,
 * `keyLightPlace()`), in the axes of the `.blend`.
 *
 * @param seat The seat of the player.
 * @returns The unit direction.
 */
function keyLight(seat: RoleSeat): Vec3 {
  const { layout } = seat.scene;
  const place = seat.index === null ? layout.conductor : layout.players[seat.index];
  const facing = place?.facing ?? 0;
  const up = new Vector3(0, 1, 0);
  const chest = new Vector3(...seat.model.studio.body.heads.chest)
    .applyAxisAngle(up, facing)
    .add(new Vector3(...(place?.position ?? [0, 0, 0])));
  const toLight = new Vector3(...keyLightPlace(layout.stageSide))
    .sub(chest)
    .applyAxisAngle(up, -facing)
    .applyMatrix3(MODEL_TO_BLEND)
    .normalize();
  return [fixed(toLight.x), fixed(toLight.y), fixed(toLight.z)];
}

/**
 * Finds the move from the app model into the `.blend`: the scale and the offset of the export
 * (`sceneFrame()` of `tools/studio-body.ts`), fitted to the heads of the module and of the GLB
 * file by least squares.
 *
 * @param body The studio body of the module.
 * @param glb The GLB file of the module.
 * @returns The frame.
 * @throws Error if the module does not fit the file: the module comes from another export.
 */
function blendFrame(body: StudioBody, glb: Glb): BlendFrame {
  const binds = readSkeleton(glb).binds;
  const bones = STUDIO_BONES.filter((bone) => binds.has(bone));
  // The model point m = s D (p + o), with D = diag(-1, 1, -1): D m = s p + s o for each head.
  const pairs = bones.map((bone) => {
    const [x = 0, y = 0, z = 0] = body.heads[bone] ?? [];
    return {
      model: new Vector3(-x, y, -z),
      file: new Vector3().setFromMatrixPosition(binds.get(bone) ?? new Matrix4()),
    };
  });
  const mean = (pick: 'model' | 'file'): Vector3 =>
    pairs.reduce((sum, pair) => sum.add(pair[pick]), new Vector3()).divideScalar(pairs.length);
  const modelMean = mean('model');
  const fileMean = mean('file');
  let across = 0;
  let square = 0;
  for (const pair of pairs) {
    const f = pair.file.clone().sub(fileMean);
    across += pair.model.clone().sub(modelMean).dot(f);
    square += f.lengthSq();
  }
  const scale = across / square;
  const offset = modelMean.clone().divideScalar(scale).sub(fileMean);
  const gap = Math.max(
    ...pairs.map((pair) =>
      pair.file.clone().add(offset).multiplyScalar(scale).distanceTo(pair.model),
    ),
  );
  if (gap > FIT_LIMIT) {
    throw new Error(
      `The heads of the module are ${gap.toExponential(2)} m off the GLB file: the module comes from another export. Run pnpm studio-body, or give the file with --glb.`,
    );
  }

  // x of the .blend = B (D m / s - o), with B (x, y, z) = (x, -z, y) from the studio axes.
  const turn = new Matrix4().setFromMatrix3(MODEL_TO_BLEND);
  const toBlend = new Matrix4()
    .makeTranslation(-offset.x, offset.z, -offset.y)
    .multiply(new Matrix4().makeScale(1 / scale, 1 / scale, 1 / scale))
    .multiply(turn);
  const heads = new Map(
    bones.map((bone) => [
      bone,
      new Vector3()
        .setFromMatrixPosition(binds.get(bone) ?? new Matrix4())
        .applyMatrix4(fileToBlend()),
    ]),
  );
  return { scale, toBlend, toModel: toBlend.clone().invert(), bones, heads };
}

/**
 * Gives the move from the axes of the studio (the GLB file) into the axes of the `.blend`.
 *
 * @returns The matrix: (x, y, z) goes to (x, -z, y).
 */
function fileToBlend(): Matrix4 {
  return new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
}

/**
 * Gives the stance matrices of the rig of a model (`standingBody()`, `seatedBody()`), or `null` for
 * a rig in the bind of the export.
 *
 * @param model The model.
 * @param bound The studio body of the module.
 * @returns The stance and its matrices.
 */
function stanceOf(model: PlayerModel, bound: StudioBody): StanceMatrices {
  if (model.studio.body === bound) {
    return { stance: 'bind', matrices: null };
  }
  const unpacked = unpackStudioMesh(bound.mesh);
  return bound.standing && model.studio.body.standing === null
    ? { stance: 'standing', matrices: standingBody(bound, unpacked).stance }
    : { stance: 'sitting', matrices: seatedBody(bound, unpacked).stance };
}

/**
 * Gives the matrices that move each bone from the bind pose of the GLB file to a pose: the
 * stance, then the pose of the app.
 *
 * @param studio The pose of the app.
 * @param stance The stance matrices, or `null`.
 * @returns 16 numbers for each bone of `STUDIO_BONES`.
 */
function exportMatrices(studio: StudioPose, stance: Float32Array | null): Float32Array {
  const out = studio.matrices.slice(0, STUDIO_BONES.length * 16);
  if (!stance) {
    return out;
  }
  const pose = new Matrix4();
  const move = new Matrix4();
  for (let b = 0; b < STUDIO_BONES.length; b++) {
    pose
      .fromArray(out, b * 16)
      .multiply(move.fromArray(stance, b * 16))
      .toArray(out, b * 16);
  }
  return out;
}

/**
 * Rounds a number for the file.
 *
 * @param value The number.
 * @returns The rounded number.
 */
function fixed(value: number): number {
  return Number(value.toFixed(DECIMALS)) + 0;
}

/**
 * Gives the bones of one moment in the `.blend`: the turn of each bone after the turn of its
 * parent, and its posed head.
 *
 * @param frame The frame of the `.blend`.
 * @param matrices The matrices of the bones from the bind pose of the GLB file, in the model axes.
 * @returns The bones by name.
 * @throws Error if a matrix in the `.blend` is not a rigid move.
 */
function previewBones(frame: BlendFrame, matrices: Float32Array): PreviewMoment['bones'] {
  const turns = new Map<StudioBone, Quaternion>();
  const out: Record<string, PreviewBone> = {};
  const m = new Matrix4();
  const basis = new Matrix3();
  for (const bone of frame.bones) {
    m.fromArray(matrices, STUDIO_BONES.indexOf(bone) * 16)
      .premultiply(frame.toBlend)
      .multiply(frame.toModel);
    basis.setFromMatrix4(m);
    const e = basis.elements;
    const columns = [0, 3, 6].map((k) => new Vector3(e[k] ?? 0, e[k + 1] ?? 0, e[k + 2] ?? 0));
    const gap = Math.max(
      ...columns.map((c) => Math.abs(c.length() - 1)),
      Math.abs(columns[0]?.dot(columns[1] ?? new Vector3()) ?? 1),
      Math.abs(columns[1]?.dot(columns[2] ?? new Vector3()) ?? 1),
      Math.abs(basis.determinant() - 1),
    );
    if (gap > RIGID_LIMIT) {
      throw new Error(`The pose of the bone ${bone} is no rigid move in the .blend (gap ${gap}).`);
    }
    const world = new Quaternion().setFromRotationMatrix(m);
    const parent = STUDIO_PARENTS[bone];
    const local = (parent ? turns.get(parent)?.clone().invert() : undefined) ?? new Quaternion();
    local.multiply(world);
    turns.set(bone, world);
    const head = (frame.heads.get(bone) ?? new Vector3()).clone().applyMatrix4(m);
    out[bone] = {
      turn: [fixed(local.w), fixed(local.x), fixed(local.y), fixed(local.z)],
      head: [fixed(head.x), fixed(head.y), fixed(head.z)],
    };
  }
  return out;
}

/**
 * Gives the weight of each morph target of the GLB file in one moment: the corrective weights of
 * the app, and 1 for the leg shapes of a standing stance or the sit shapes of a seated stance.
 *
 * @param studio The pose of the app.
 * @param raises The morph target of each shape of a raised arm or of a bent wrist, in order.
 * @param stance The stance.
 * @returns The weights by name.
 */
function targetWeights(
  studio: StudioPose,
  raises: readonly string[],
  stance: Stance,
): PreviewMoment['targets'] {
  const out: Record<string, number> = {};
  for (const [k, name] of [...CORRECTIVE_NAMES, ...raises].entries()) {
    out[name] = fixed(studio.correctives[k] ?? 0);
  }
  const full =
    stance === 'standing' ? LEG_CORRECTIVE_NAMES : stance === 'sitting' ? SIT_CORRECTIVE_NAMES : [];
  for (const name of full) {
    out[name] = 1;
  }
  return out;
}

/**
 * Writes the points of a list of x, y, z into the `.blend`.
 *
 * @param frame The frame of the `.blend`.
 * @param points The points in the model axes.
 * @returns The points in the `.blend`.
 */
function blendPoints(frame: BlendFrame, points: ArrayLike<number>): number[] {
  const p = new Vector3();
  const out: number[] = [];
  for (let v = 0; v < points.length; v += 3) {
    p.set(points[v] ?? 0, points[v + 1] ?? 0, points[v + 2] ?? 0).applyMatrix4(frame.toBlend);
    out.push(fixed(p.x), fixed(p.y), fixed(p.z));
  }
  return out;
}

/**
 * Makes the mesh of the app from the data of the GLB file, with no packing: the welded vertices
 * in the order of the module (`studioBody()` of `tools/studio-body.ts`), their places in the GLB
 * file, their weights, and the moves of the kept morph targets, in the model axes.
 *
 * @param glb The GLB file.
 * @param kept The kept morph targets, in the order of the module.
 * @param frame The frame of the `.blend`.
 * @param app The packed mesh of the module, for the check of the order.
 * @returns The mesh, and the place of each vertex in the bind pose of the GLB file, in the `.blend`.
 * @throws Error if a vertex of the GLB file is not at the place of the vertex of the module.
 */
function fileMesh(glb: Glb, kept: readonly string[], frame: BlendFrame, app: StudioMesh): FileMesh {
  const welded = weldMesh(glb, kept);
  // The export drops the faces of the old eyes, as `studioBody()` does.
  const eyes = eyeVertices(welded);
  const inEye = (v: number): boolean => eyes.L.has(v) || eyes.R.has(v);
  const { vertices } = orderByFirstUse({
    vertices: welded.vertices,
    faces: welded.faces.filter((face) => !face.corners.every(inEye)),
  });
  if (vertices.length * 3 !== app.positions.length) {
    throw new Error(
      `The GLB file has ${vertices.length} vertices, and the module ${app.positions.length / 3}.`,
    );
  }

  const toFile = fileToBlend();
  const toModel = frame.toModel;
  const fileToModel = new Matrix4().multiplyMatrices(toModel, toFile);
  const turn = new Matrix3().setFromMatrix4(fileToModel);
  const positions = new Float32Array(vertices.length * 3);
  const joints = new Uint8Array(vertices.length * 4);
  const weights = new Float32Array(vertices.length * 4);
  const correctives = kept.map(() => new Float32Array(vertices.length * 3));
  const bind: number[] = [];
  let worst = 0;
  for (const [v, vertex] of vertices.entries()) {
    const placed = vertex.position.clone().applyMatrix4(fileToModel);
    placed.toArray(positions, v * 3);
    worst = Math.max(worst, placed.distanceTo(new Vector3().fromArray(app.positions, v * 3)));
    const inBlend = vertex.position.clone().applyMatrix4(toFile);
    bind.push(inBlend.x, inBlend.y, inBlend.z);
    for (const [k, [bone, weight]] of vertex.skin.slice(0, 4).entries()) {
      joints[v * 4 + k] = STUDIO_BONES.findIndex((own) => own === bone);
      weights[v * 4 + k] = weight;
    }
    for (const [s, move] of vertex.moves.entries()) {
      move
        .clone()
        .applyMatrix3(turn)
        .toArray(correctives[s] ?? new Float32Array(3), v * 3);
    }
  }
  if (worst > PACKED_LIMIT) {
    throw new Error(`A vertex of the GLB file is ${worst.toFixed(6)} m off the module.`);
  }
  return { mesh: { ...app, positions, joints, weights, correctives }, bind };
}

/**
 * Makes the file of the preview.
 *
 * @param options The options.
 * @returns The file.
 * @throws Error for a role with no close view or no studio body.
 */
async function preview(options: Options): Promise<PosePreview> {
  const cast = castRoleOf(options.role);
  if (!cast) {
    throw new Error(`${options.role} is no role of ROLE_VIEWS. ${USAGE}`);
  }
  const views = viewsOf(cast);
  const species = views.species;
  const animal = speciesAnimal(species);
  const name = SPECIES[species].body;
  if (!animal || !name) {
    throw new Error(`The ${species} has no studio body.`);
  }
  const bound = studioBodyOf(name);
  const file = options.from ?? resolve(ROOT, bound.source);
  const bytes = new Uint8Array(readFileSync(file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== bound.sha256) {
    throw new Error(
      `The module of the ${species} comes from another export than ${relative(ROOT, file)}. Run pnpm studio-body ${animal}, or give the file with --glb.`,
    );
  }
  const glb = readGlb(bytes);
  const frame = blendFrame(bound, glb);
  const raises = raisesOf(glb).map((raise) => raise.target);
  if (bound.upperTwist !== undefined) {
    console.warn(
      'The body has an upper arm twist bone (upperTwist), which the GLB file does not hold: the preview shows the upper arms with the weights of the file.',
    );
  }

  if (options.holds !== null) {
    console.log(`Hold changes: ${setHolds(options.holds).text}.`);
  }
  const seat = await roleSeat(options.role, options.demo);
  const posed = [
    ...galleryPoses(views, options.moments, options.wall),
    ...demoPoses(seat, options.times),
  ];

  const entry = ANIMALS.get(animal);
  if (!entry) {
    throw new Error(`ANIMALS of tools/studio-body.ts has no animal ${animal}.`);
  }
  const settings = settingsOf(glb, entry);
  const kept = keptCorrectives(settings, raises, sitsIn(glb, settings));
  const app = unpackStudioMesh(bound.mesh);
  const exact = options.skin ? fileMesh(glb, kept, frame, app) : null;
  const appSkins: Record<string, number[]> = {};
  const exactSkins: Record<string, number[]> = {};
  const moments = posed.map((p): PreviewMoment => {
    const studio = poseStudioBones(
      p.model.studio,
      p.model.skeleton,
      p.pose.rotations,
      studioOffsets(p.pose),
      Math.max(CLOSED_EYE_SCALE, 1 - p.pose.blink),
      createStudioPose(),
    );
    const { stance, matrices: stanceMatrices } = stanceOf(p.model, bound);
    const matrices = exportMatrices(studio, stanceMatrices);
    const targets = targetWeights(studio, raises, stance);
    if (exact) {
      appSkins[p.name] = blendPoints(frame, skinStudioMesh(p.model.studio.mesh, studio));
      const weights = Float32Array.from(kept, (target) => targets[target] ?? 0);
      exactSkins[p.name] = blendPoints(
        frame,
        skinStudioMesh(exact.mesh, { matrices, correctives: weights }),
      );
    }
    return {
      name: p.name,
      source: p.source,
      time: p.time,
      wall: p.wall,
      stance,
      bones: previewBones(frame, matrices),
      targets,
    };
  });

  const out: PosePreview = {
    version: PREVIEW_FORMAT,
    role: options.role,
    species,
    animal,
    glb: file,
    sha256,
    scale: fixed(frame.scale),
    bones: frame.bones,
    parents: Object.fromEntries(frame.bones.map((bone) => [bone, STUDIO_PARENTS[bone]])),
    light: keyLight(seat),
    holds: options.holds,
    moments,
  };
  return exact ? { ...out, skin: { bind: exact.bind, app: appSkins, exact: exactSkins } } : out;
}

/** Runs the command. */
async function main(): Promise<void> {
  const { glb, rest } = takeGlb(process.argv.slice(2));
  if (glb !== null) {
    // The body of the file lives in a copy of src/, so the run goes to a child in that copy.
    const options = optionsOf(rest);
    const cast = castRoleOf(options.role);
    const animal = cast ? speciesAnimal(viewsOf(cast).species) : null;
    if (!animal) {
      throw new Error(`${options.role} is no role with a studio body. ${USAGE}`);
    }
    const args = [
      ...rest.filter((arg, i) => arg !== '--out' && rest[i - 1] !== '--out'),
      '--out',
      options.out,
      '--from',
      glb,
    ];
    const code = await withGlbBody(animal, glb, (dir) => runTool(dir, 'pose-preview.ts', args));
    process.exitCode = code;
    return;
  }

  const options = optionsOf(rest);
  const file = await preview(options);
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(file)}\n`);
  const lines = file.moments.map((m) => {
    const weights = Object.entries(m.targets).flatMap(([target, w]) =>
      w > 0 ? [`${target} ${w.toFixed(3)}`] : [],
    );
    return `  ${m.name.padEnd(10)} ${m.source.padEnd(16)} ${m.time.toFixed(2).padStart(7)} s  ${m.stance.padEnd(8)} ${weights.join(', ')}`;
  });
  console.log(
    `Wrote ${relative(process.cwd(), options.out)}: ${file.moments.length} moments of the ${file.species} (${file.role}), ${file.bones.length} bones.`,
  );
  console.log(
    ['  moment     source              time  stance   morph targets', ...lines].join('\n'),
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
