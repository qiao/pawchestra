/**
 * Counts the folded faces of the skin of the studio body of a role (design 4.4). It poses the
 * body as the app does, over each demo of the role. The test of a fold is the test of the
 * studio. The bind normal of a face moves by the mean of the skin matrices of its corners. The
 * face is folded when its posed normal is more than 90° from that normal. For each sample set,
 * the tool prints the samples, the samples with a fold, their share, and the most folded faces.
 * Then it prints the main bone of the folded faces. With `--faces <n>`, it also prints the `n`
 * faces that fold in the most samples, with their places, their corner angles, and the mark `ALL`
 * of a face that folds in each sample. For the body of a mesh rig, the table also gives the middle
 * of each face in the units of the source, ready for `weights.rigid` of the config
 * ({@link sourceMiddles}). A table of their corners in the worst fold of each face
 * follows: the places in the bind pose and in the posed skin, the moves of the corrective shapes,
 * and the weights. With `--json <file>`, it also writes the counts of each sample set into the
 * file for `pnpm rig-mesh --check`, and `--middles <faces>` adds the middle of each named face to
 * the file, so that `--watch` of the check pairs the faces of a rig with other corners. With
 * `--turns <face>`, it also prints the mean turn of the
 * upper arm of the side of the face in the axes of the chest in the samples in which the face
 * folds, and the share of the samples with a fold by the angle from that turn. Each `--set` changes
 * the holds in memory, as `pnpm pose-depth --set` does, so that `pnpm rig-mesh --check --hold`
 * fits a corrective shape to a hold with no commit. With `--base <ref> --faces-of <faces>`, the
 * faces of the commit pair with the folded faces of the working tree by their middles
 * ({@link pairBaseFaces}).
 *
 * `--bins <face>` gives the turn of each bone of the arm of the face from its bind pose with a fold
 * and with no fold, and the share of the samples with a fold by that turn ({@link binProbe}).
 *
 * Usage: pnpm fold-probe <role> [--demo <id>]... [--step <seconds>] [--faces <n>] [--turns <face>]
 * [--bins <face>] [--set <changes>]... [--json <file> [--middles <faces>]] [--glb <file>]
 * [--base <ref> [--faces-of <faces>]]
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Matrix4, Quaternion, Vector3 } from 'three';

import { faceList } from './face-shares.ts';
import { rigConfigPath, runTool, speciesAnimal, takeGlb, withGlbBody } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import { trackFolder } from './stop-cleanup.ts';
import type { RefRole } from './ref-tree.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from '../src/models/cast.ts';
import type { PlayingSection } from '../src/models/cast.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { STUDIO_BONES, STUDIO_PARENTS } from '../src/models/studio-format.ts';
import type { Side, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import {
  createStudioPose,
  poseStudioBones,
  skinStudioMesh,
  studioOffsets,
} from '../src/models/studio-rig.ts';
import type { StudioPose, StudioRig } from '../src/models/studio-rig.ts';
import { toVec3 } from '../src/models/tuples.ts';
import type { Quat, Vec3 } from '../src/models/tuples.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { NOT_STARTED, PLAYING, allAudible, recastScene, sceneOf } from '../src/pose/test-scene.ts';
import type { Recast, TestScene } from '../src/pose/test-scene.ts';
import { SWEEP_ROLES, recastSweep } from '../src/pose/test-sweep-roles.ts';
import type { RoleSweep } from '../src/pose/test-sweep.ts';
import type { AnimalPose, Transport } from '../src/pose/types.ts';

/** The source of the body of a role: the conductor, or each player of an instrument. */
export type RoleSource =
  | {
      /** The conductor of the plan. */
      readonly kind: 'conductor';
    }
  | {
      /** Each player of the instrument with a studio body. */
      readonly kind: 'player';
      /** The instrument of the players. */
      readonly instrument: InstrumentId;
      /**
       * The species of the role. The rabbits of the first violins and the red foxes of the second
       * violins play one instrument with two studio bodies, so each body has a role of its own.
       */
      readonly species: readonly SpeciesId[];
      /**
       * The recast of a role `<role>@<species>` ({@link findRole}): the species of the role
       * leave their seats to the new species, or none for a role of {@link FOLD_ROLES}.
       */
      readonly recast?: Recast;
    };

/** The roles with a studio body. A new role of route 3 adds one entry. */
export const FOLD_ROLES: ReadonlyMap<string, RoleSource> = new Map<string, RoleSource>([
  ['conductor', { kind: 'conductor' }],
  ['pianist', { kind: 'player', instrument: 'piano', species: ['polar-bear'] }],
  ['harpist', { kind: 'player', instrument: 'harp', species: ['deer'] }],
  ['violinist', { kind: 'player', instrument: 'violin', species: ['rabbit'] }],
  ['fox-violinist', { kind: 'player', instrument: 'violin', species: ['fox-red'] }],
  ['violist', { kind: 'player', instrument: 'viola', species: ['cat'] }],
  ['cellist', { kind: 'player', instrument: 'cello', species: ['dog'] }],
  ['bassist', { kind: 'player', instrument: 'contrabass', species: ['hippo'] }],
  ['flutist', { kind: 'player', instrument: 'flute', species: ['fox-tan'] }],
  ['trombonist', { kind: 'player', instrument: 'trombone', species: ['panda'] }],
  ['oboist', { kind: 'player', instrument: 'oboe', species: ['mouse'] }],
  ['timpanist', { kind: 'player', instrument: 'timpani', species: ['elephant'] }],
  ['bassoonist', { kind: 'player', instrument: 'bassoon', species: ['beaver'] }],
  ['hornist', { kind: 'player', instrument: 'horn', species: ['pig'] }],
  ['clarinetist', { kind: 'player', instrument: 'clarinet', species: ['wolf'] }],
  ['trumpeter', { kind: 'player', instrument: 'trumpet', species: ['monkey'] }],
  ['tubist', { kind: 'player', instrument: 'tuba', species: ['rhino'] }],
  ['singer', { kind: 'player', instrument: 'choir-folder', species: ['penguin'] }],
  ['bass-drummer', { kind: 'player', instrument: 'bass-drum', species: ['badger'] }],
  ['snare-drummer', { kind: 'player', instrument: 'snare-drum', species: ['badger'] }],
  ['cymbalist', { kind: 'player', instrument: 'cymbals', species: ['badger'] }],
  ['percussionist', { kind: 'player', instrument: 'small-percussion', species: ['badger'] }],
  ['xylophonist', { kind: 'player', instrument: 'xylophone', species: ['badger'] }],
]);

/**
 * The table of {@link FOLD_ROLES}, which the commit of `--base` must hold with the role of the
 * probe (`checkRefRole()` of `tools/ref-tree.ts`). `pnpm hold-fit --base` checks it too.
 */
export const FOLD_ROLE_TABLE: Omit<RefRole, 'name'> = {
  module: 'tools/fold-probe.ts',
  table: 'FOLD_ROLES',
};

/** The mark between a role and a species in the name of a recast role, such as `violinist@wolf`. */
const RECAST_MARK = '@';

/**
 * Finds a role by its name: a role of {@link FOLD_ROLES}, or a recast role `<role>@<species>`,
 * such as `violinist@wolf`. A recast role puts the species into the seats of the role, with the
 * instrument of the role (`recastScene()` of `src/pose/test-scene.ts`). Each role tool reads its
 * role with this function.
 *
 * @param name The name of the role.
 * @returns The role, or `undefined` when no role has the name.
 * @throws Error if a recast role names an unknown species, the conductor, or the own species of
 *   the role.
 */
export function findRole(name: string): RoleSource | undefined {
  const at = name.indexOf(RECAST_MARK);
  if (at < 0) {
    return FOLD_ROLES.get(name);
  }
  const base = FOLD_ROLES.get(name.slice(0, at));
  const species = name.slice(at + 1);
  if (!base) {
    return undefined;
  }
  if (!isSpeciesId(species)) {
    throw new Error(`The recast role ${name} names no species: ${species}.`);
  }
  if (base.kind === 'conductor') {
    throw new Error(`The recast role ${name} takes a player role, and not the conductor.`);
  }
  if (base.species.includes(species)) {
    throw new Error(`The ${species} already plays the role of ${name}.`);
  }
  return {
    kind: 'player',
    instrument: base.instrument,
    species: [species],
    recast: { instrument: base.instrument, from: base.species, species },
  };
}

/**
 * Tells if a role has a name: a role of {@link FOLD_ROLES}, or a recast role ({@link findRole}).
 *
 * @param name The name.
 * @returns True for a role.
 */
export function isRole(name: string): boolean {
  try {
    return findRole(name) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Builds the scene of a demo for a role: the scene of the cast of the score, with the recast of a
 * recast role ({@link findRole}).
 *
 * @param role The role.
 * @param bytes The bytes of the MIDI file.
 * @returns The scene.
 */
export function roleScene(role: RoleSource, bytes: Uint8Array): TestScene {
  const scene = sceneOf(bytes);
  return role.kind === 'player' && role.recast ? recastScene(scene, role.recast) : scene;
}

/**
 * Gives the sweep of a role of `pnpm pose-depth` by its name: a role of `SWEEP_ROLES` of
 * `src/pose/test-sweep-roles.ts`, or a recast role ({@link findRole}) with the body of its species
 * (`recastSweep()`). The body comes from the sweep of the first role of {@link FOLD_ROLES} with
 * the species.
 *
 * @param name The name of the role.
 * @returns The sweep, or `undefined` when no sweep has the name.
 * @throws Error if the species of a recast role has no sweep of its own.
 */
export function findSweep(name: string): RoleSweep | undefined {
  const own = Object.entries(SWEEP_ROLES).find(([key]) => key === name)?.[1];
  const role = own ? undefined : findRole(name);
  if (own || role?.kind !== 'player' || !role.recast) {
    return own;
  }
  const sweep = Object.entries(SWEEP_ROLES).find(
    ([key]) => key === name.slice(0, name.indexOf(RECAST_MARK)),
  )?.[1];
  return sweep
    ? recastSweep(sweep, role.recast.species, homeSweep(role.recast.species))
    : undefined;
}

/**
 * Gives the sweep of the own role of a species: the sweep of the first role of
 * {@link FOLD_ROLES} with the species.
 *
 * @param species The species.
 * @returns The sweep.
 * @throws Error if no role of `SWEEP_ROLES` has the species.
 */
export function homeSweep(species: SpeciesId): RoleSweep {
  const home = [...FOLD_ROLES].find(
    ([, role]) => role.kind === 'player' && role.species.includes(species),
  )?.[0];
  const sweep = Object.entries(SWEEP_ROLES).find(([key]) => key === home)?.[1];
  if (!sweep) {
    throw new Error(`The ${species} has no role of its own in SWEEP_ROLES.`);
  }
  return sweep;
}

/**
 * Gives the species of a role: the conductor, the species of a recast, or the species of the role
 * in each section with the instrument of the role.
 *
 * @param role The role.
 * @returns The species.
 */
export function roleSpecies(role: RoleSource): SpeciesId[] {
  if (role.kind === 'conductor') {
    return [CONDUCTOR.species];
  }
  if (role.recast) {
    return [role.recast.species];
  }
  return Object.keys(SECTION_INSTRUMENTS)
    .filter((section): section is PlayingSection => section in SECTION_SPECIES)
    .filter((section) =>
      SECTION_INSTRUMENTS[section].some((instrument) => instrument === role.instrument),
    )
    .flatMap((section) => SECTION_SPECIES[section])
    .filter((species) => role.species.includes(species));
}

/**
 * Gives the animal of the studio body of a role (`tools/glb-swap.ts`).
 *
 * @param role The role.
 * @returns The animal, such as `rabbit` for the violinist.
 * @throws Error if no species of the role has a studio body, or more than one has.
 */
export function roleAnimal(role: RoleSource): string {
  const animals = [
    ...new Set(roleSpecies(role).flatMap((species) => speciesAnimal(species) ?? [])),
  ];
  const [animal] = animals;
  if (animal === undefined || animals.length > 1) {
    throw new Error(`The role has the studio bodies of ${animals.join(', ') || 'no animal'}.`);
  }
  return animal;
}

/** The names of the sample sets: the rest pose, the play, and the lift of the arms at the start. */
export const SAMPLE_SETS = ['rest', 'play', 'lift'] as const;

/** One set of samples. */
export type SampleSet = (typeof SAMPLE_SETS)[number];

/** The folded faces of one posed body by the side of their main studio bone. */
export interface SideSplit {
  /** The faces whose main bone is a bone of the left side, such as `upper_arm_L`. */
  readonly L: number;
  /** The faces whose main bone is a bone of the right side. */
  readonly R: number;
  /** The faces whose main bone is a bone of the middle, such as `chest` or `neck`. */
  readonly other: number;
}

/**
 * Splits folded faces by the side of their main studio bone: a name that ends with `_L` is on the
 * left, a name that ends with `_R` is on the right, and the other names are in the middle.
 *
 * @param bones The main bone of each folded face ({@link mainBone}).
 * @returns The faces of each side.
 */
export function sideSplit(bones: readonly string[]): SideSplit {
  const L = bones.filter((bone) => bone.endsWith('_L')).length;
  const R = bones.filter((bone) => bone.endsWith('_R')).length;
  return { L, R, other: bones.length - L - R };
}

/**
 * Writes a split of folded faces.
 *
 * @param split The split.
 * @returns The text, such as `L 11 / R 0 / other 2`.
 */
export function splitText(split: SideSplit): string {
  return `L ${split.L} / R ${split.R} / other ${split.other}`;
}

/** The folds of one set of samples. */
export interface FoldCount {
  /** The number of posed bodies. */
  samples: number;
  /** The number of posed bodies with one folded face or more. */
  withFold: number;
  /** The most folded faces of one posed body. */
  most: number;
  /** The folded faces of the posed body with the most folded faces, by the side of their bone. */
  split: SideSplit;
  /** The demo and the time of the posed body with the most folded faces. */
  worst: string;
  /** The folded faces of all samples, by the main studio bone of the face. */
  readonly bones: Map<string, number>;
  /** The number of samples in which each folded face folds, by the index of the face. */
  readonly byFace: Map<number, number>;
  /** The worst fold of each folded face in the set, by the index of the face. */
  readonly faceWorst: Map<number, WorstSample>;
}

/** The worst fold of a face: the sample in which its normal turns farthest. */
export interface FaceWorst {
  /** The demo and the time of the sample. */
  readonly label: string;
  /**
   * The angle between the posed normal of the face and its bind normal moved by the mean skin
   * matrix of its corners, in degrees. A folded face has more than 90°.
   */
  readonly angle: number;
  /** The studio bone whose turn changes the normal of the face most in the sample ({@link turnBone}). */
  readonly bone: string;
  /** The change of the normal by the turn of that bone, in degrees. */
  readonly turn: number;
}

/** One corner of a face in a posed sample ({@link cornerSamples}). */
export interface CornerSample {
  /** The index of the vertex in the mesh. */
  readonly vertex: number;
  /** The place of the vertex in the bind pose, in meters. */
  readonly bind: Vec3;
  /** The place of the vertex in the posed skin, in meters. */
  readonly posed: Vec3;
  /**
   * The length of the move of the vertex by each corrective shape at its full weight, in meters,
   * in the order of the shapes of the mesh.
   */
  readonly fullMoves: readonly number[];
  /** The length of the move of the vertex by all corrective shapes at their weights, in meters. */
  readonly move: number;
}

/**
 * The worst fold of a face in a sample set, with the corners of the face in the sample of the
 * fold. The JSON text of `--json` holds only the fields of {@link FaceWorst}.
 */
export interface WorstSample extends FaceWorst {
  /** The weight of each corrective shape of the mesh in the sample, from 0 to 1. */
  readonly correctiveWeights: readonly number[];
  /** The three corners of the face in the sample, in the order of the corners of the face. */
  readonly corners: readonly CornerSample[];
}

/** The folds of a role over its demos. */
export interface FoldReport {
  /** The demos that have the role. */
  readonly demos: string[];
  /** The number of faces of the studio body. */
  faces: number;
  /**
   * The bind mesh of the first studio body of the role, or `null` when no demo has the role. The
   * bodies of a role share their faces, so the facts of a face come from this mesh.
   */
  mesh: StudioMesh | null;
  /** The folds of each sample set. */
  readonly sets: Readonly<Record<SampleSet, FoldCount>>;
}

/**
 * Gives the normal of a triangle of a flat array of places, with the length of twice its area.
 *
 * @param p The places, three numbers for each vertex.
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @returns The normal.
 */
function normal(p: ArrayLike<number>, a: number, b: number, c: number): Vec3 {
  const u = [0, 1, 2].map((k) => (p[b * 3 + k] ?? 0) - (p[a * 3 + k] ?? 0));
  const v = [0, 1, 2].map((k) => (p[c * 3 + k] ?? 0) - (p[a * 3 + k] ?? 0));
  const [ux = 0, uy = 0, uz = 0] = u;
  const [vx = 0, vy = 0, vz = 0] = v;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/**
 * Moves a normal by the cofactor of a 3 × 3 linear part, which keeps a normal at right angles to
 * its moved face.
 *
 * @param m The linear part, column by column.
 * @param n The normal.
 * @returns The moved normal.
 */
function cofactor(m: readonly number[], n: Vec3): Vec3 {
  const [a = 0, d = 0, g = 0, b = 0, e = 0, h = 0, c = 0, f = 0, i = 0] = m;
  const [x, y, z] = n;
  return [
    (e * i - f * h) * x - (d * i - f * g) * y + (d * h - e * g) * z,
    -(b * i - c * h) * x + (a * i - c * g) * y - (a * h - b * g) * z,
    (b * f - c * e) * x - (a * f - c * d) * y + (a * e - b * d) * z,
  ];
}

/** The posed normal of a face, and its bind normal moved by the mean skin matrix of its corners. */
interface FaceNormals {
  /** The bind normal, moved by the mean of the skin matrices of the corners. */
  readonly expected: Vec3;
  /** The normal of the posed face. */
  readonly now: Vec3;
}

/**
 * Writes the mean of the linear parts of the skin matrices of the corners of a face.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param matrices The skin matrices, 16 numbers for each bone, column by column.
 * @param corners The three corners of the face.
 * @param linear The 9 numbers of the mean, column by column, which the function writes.
 * @returns `linear`.
 */
function meanLinear(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  matrices: ArrayLike<number>,
  corners: readonly number[],
  linear: number[],
): number[] {
  linear.fill(0);
  for (const v of corners) {
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[v * 4 + k] ?? 0;
      const j = (mesh.joints[v * 4 + k] ?? 0) * 16;
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
          linear[col * 3 + row] =
            (linear[col * 3 + row] ?? 0) + (w / 3) * (matrices[j + col * 4 + row] ?? 0);
        }
      }
    }
  }
  return linear;
}

/**
 * Gives the posed normal of a face and its bind normal moved by the mean of the skin matrices of
 * its corners.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param matrices The skin matrices, 16 numbers for each bone, column by column.
 * @param posed The posed places, three numbers for each vertex.
 * @param face The index of the triangle.
 * @param linear A scratch array of 9 numbers, which the function writes before it reads it.
 * @returns The two normals.
 */
function faceNormals(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights' | 'corners'>,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
  face: number,
  linear: number[] = Array.from({ length: 9 }, () => 0),
): FaceNormals {
  const corners = [0, 1, 2].map((k) => mesh.corners[face * 3 + k] ?? 0);
  const [a = 0, b = 0, c = 0] = corners;
  return {
    expected: cofactor(
      meanLinear(mesh, matrices, corners, linear),
      normal(mesh.positions, a, b, c),
    ),
    now: normal(posed, a, b, c),
  };
}

/**
 * Gives the angle between two directions.
 *
 * @param u The first direction.
 * @param v The second direction.
 * @returns The angle, in degrees, from 0 to 180. A direction of length 0 gives 0.
 */
function angleOf(u: Vec3, v: Vec3): number {
  const lengths = Math.hypot(...u) * Math.hypot(...v);
  if (lengths === 0) {
    return 0;
  }
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / lengths;
  return Math.acos(Math.min(1, Math.max(-1, cos))) * (180 / Math.PI);
}

/**
 * Finds the folded faces of a posed studio mesh. The bind normal of a face moves by the mean of
 * the skin matrices of its corners. The face is folded when its posed normal is more than 90°
 * from that normal.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param matrices The skin matrices, 16 numbers for each bone, column by column.
 * @param posed The posed places, three numbers for each vertex.
 * @returns The folded faces, as indices of the triangles of the mesh.
 */
export function foldedFaces(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights' | 'corners'>,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
): number[] {
  const folded: number[] = [];
  const linear = Array.from({ length: 9 }, () => 0);
  for (let t = 0; t < mesh.corners.length / 3; t++) {
    const { expected, now } = faceNormals(mesh, matrices, posed, t, linear);
    if (now[0] * expected[0] + now[1] * expected[1] + now[2] * expected[2] < 0) {
      folded.push(t);
    }
  }
  return folded;
}

/**
 * Gives the angle of the fold of a face: the angle between its posed normal and its bind normal
 * moved by the mean of the skin matrices of its corners ({@link foldedFaces}).
 *
 * @param mesh The studio mesh in the bind pose.
 * @param matrices The skin matrices, 16 numbers for each bone, column by column.
 * @param posed The posed places, three numbers for each vertex.
 * @param face The index of the triangle.
 * @returns The angle, in degrees: more than 90 for a folded face.
 */
export function foldAngle(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights' | 'corners'>,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
  face: number,
): number {
  const { expected, now } = faceNormals(mesh, matrices, posed, face);
  return angleOf(expected, now);
}

/**
 * Skins one vertex of a studio mesh as `skinStudioMesh()` does: the corrective shapes by their
 * weights, then the blend of up to four bones. The vertex can take the skin matrix of another
 * bone in place of the matrix of one bone.
 *
 * @param mesh The studio mesh.
 * @param pose The pose of the bones.
 * @param v The index of the vertex.
 * @param swap The bone whose matrix the vertex does not take, and the bone whose matrix it takes
 *   in its place, or `null` for no change.
 * @returns The posed place.
 */
function skinVertex(
  mesh: StudioMesh,
  pose: Pick<StudioPose, 'matrices' | 'correctives'>,
  v: number,
  swap: readonly [from: number, to: number] | null,
): Vec3 {
  const bind = [0, 1, 2].map((axis) => {
    let x = mesh.positions[v * 3 + axis] ?? 0;
    for (const [c, corrective] of mesh.correctives.entries()) {
      x += (pose.correctives[c] ?? 0) * (corrective[v * 3 + axis] ?? 0);
    }
    return x;
  });
  const [x = 0, y = 0, z = 0] = bind;
  const m = pose.matrices;
  const out = [0, 0, 0].map((...[, row]) => {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[v * 4 + k] ?? 0;
      const joint = mesh.joints[v * 4 + k] ?? 0;
      if (w === 0) {
        continue;
      }
      const b = (swap && joint === swap[0] ? swap[1] : joint) * 16;
      sum +=
        w *
        ((m[b + row] ?? 0) * x +
          (m[b + 4 + row] ?? 0) * y +
          (m[b + 8 + row] ?? 0) * z +
          (m[b + 12 + row] ?? 0));
    }
    return sum;
  });
  const [px = 0, py = 0, pz = 0] = out;
  return [px, py, pz];
}

/** The bone whose turn changes the normal of a face most, with the change. */
export interface FaceTurn {
  /** The name of the studio bone, or empty when no bone of the face has a parent. */
  readonly bone: string;
  /** The change of the normal, in degrees. */
  readonly turn: number;
}

/**
 * Finds the studio bone whose turn changes the normal of a posed face most. For each bone of the
 * corners of the face, the corners take the skin matrix of its parent in place of its own matrix:
 * the face then moves as if the bone had no turn from its parent. The bone whose loss turns the
 * normal of the face farthest is the bone of the fold.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param pose The pose of the bones.
 * @param face The index of the triangle.
 * @returns The bone and the change of the normal.
 */
export function turnBone(
  mesh: StudioMesh,
  pose: Pick<StudioPose, 'matrices' | 'correctives'>,
  face: number,
): FaceTurn {
  const corners = [0, 1, 2].map((k) => mesh.corners[face * 3 + k] ?? 0);
  const normalWith = (swap: readonly [number, number] | null): Vec3 =>
    normal(
      corners.flatMap((v) => skinVertex(mesh, pose, v, swap)),
      0,
      1,
      2,
    );
  const posed = normalWith(null);
  const bones = new Set(
    corners.flatMap((v) =>
      [0, 1, 2, 3].flatMap((k) =>
        (mesh.weights[v * 4 + k] ?? 0) > 0 ? [mesh.joints[v * 4 + k] ?? 0] : [],
      ),
    ),
  );
  let best: FaceTurn = { bone: '', turn: 0 };
  for (const bone of [...bones].toSorted((a, b) => a - b)) {
    const name = STUDIO_BONES[bone];
    const parent = name ? STUDIO_PARENTS[name] : null;
    if (!name || !parent) {
      continue;
    }
    const turn = angleOf(posed, normalWith([bone, STUDIO_BONES.indexOf(parent)]));
    if (turn > best.turn) {
      best = { bone: name, turn };
    }
  }
  return best;
}

/**
 * Gives the three corners of a face in a posed sample: the index of each vertex, its place in the
 * bind pose and in the posed skin, the length of the move of each corrective shape at its full
 * weight, and the length of the move of all shapes at their weights in the sample, as
 * `skinStudioMesh()` adds them before the blend of the bones.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param correctiveWeights The weight of each corrective shape of the mesh in the sample.
 * @param posed The posed places, three numbers for each vertex.
 * @param face The index of the triangle.
 * @returns The corners, in the order of the corners of the face.
 */
export function cornerSamples(
  mesh: Pick<StudioMesh, 'positions' | 'corners' | 'correctives'>,
  correctiveWeights: ArrayLike<number>,
  posed: ArrayLike<number>,
  face: number,
): CornerSample[] {
  const point = (places: ArrayLike<number>, v: number): Vec3 => [
    places[v * 3] ?? 0,
    places[v * 3 + 1] ?? 0,
    places[v * 3 + 2] ?? 0,
  ];
  return [0, 1, 2].map((k) => {
    const vertex = mesh.corners[face * 3 + k] ?? 0;
    const moves = mesh.correctives.map((corrective) => point(corrective, vertex));
    const sum = [0, 1, 2].map((axis) =>
      moves.reduce((total, move, c) => total + (correctiveWeights[c] ?? 0) * (move[axis] ?? 0), 0),
    );
    return {
      vertex,
      bind: point(mesh.positions, vertex),
      posed: point(posed, vertex),
      fullMoves: moves.map((move) => Math.hypot(...move)),
      move: Math.hypot(...sum),
    };
  });
}

/**
 * Gives the main studio bone of a face: the bone with the largest weight over its three corners.
 *
 * @param mesh The studio mesh.
 * @param face The index of the triangle.
 * @returns The name of the bone.
 */
export function mainBone(
  mesh: Pick<StudioMesh, 'joints' | 'weights' | 'corners'>,
  face: number,
): string {
  const sums = new Map<number, number>();
  for (let k = 0; k < 3; k++) {
    const v = mesh.corners[face * 3 + k] ?? 0;
    for (let s = 0; s < 4; s++) {
      const bone = mesh.joints[v * 4 + s] ?? 0;
      sums.set(bone, (sums.get(bone) ?? 0) + (mesh.weights[v * 4 + s] ?? 0));
    }
  }
  const [best] = [...sums].toSorted((x, y) => y[1] - x[1]);
  return STUDIO_BONES[best?.[0] ?? 0] ?? '';
}

/**
 * Makes an empty count of folds.
 *
 * @returns The count.
 */
function emptyCount(): FoldCount {
  return {
    samples: 0,
    withFold: 0,
    most: 0,
    split: { L: 0, R: 0, other: 0 },
    worst: '',
    bones: new Map(),
    byFace: new Map(),
    faceWorst: new Map(),
  };
}

/**
 * Gets each posed studio body of {@link probeFolds}: the rig, the pose of its bones, the posed
 * places, the folded faces, the sample set, and the label of the sample: the demo and the time,
 * such as `bach-bwv1047.mid 12.25 s`.
 */
export type FoldVisit = (
  rig: StudioRig,
  studio: StudioPose,
  posed: Float32Array,
  folded: readonly number[],
  set: SampleSet,
  label: string,
) => void;

/**
 * Counts the folded faces of one posed body into a count.
 *
 * @param model The player model with its studio rig.
 * @param pose The pose of the player.
 * @param label The demo and the time of the sample.
 * @param count The count to update.
 * @param set The sample set, for the visit.
 * @param visit Gets the posed body, or `undefined` for none.
 */
function countPose(
  model: PlayerModel,
  pose: AnimalPose,
  label: string,
  count: FoldCount,
  set: SampleSet,
  visit?: FoldVisit,
): void {
  const rig = model.studio;
  const studio = poseStudioBones(
    rig,
    model.skeleton,
    pose.rotations,
    studioOffsets(pose),
    1,
    createStudioPose(),
  );
  const posed = skinStudioMesh(rig.mesh, studio);
  const folded = foldedFaces(rig.mesh, studio.matrices, posed);
  visit?.(rig, studio, posed, folded, set, label);
  const bones: string[] = [];
  for (const face of folded) {
    const bone = mainBone(rig.mesh, face);
    bones.push(bone);
    count.bones.set(bone, (count.bones.get(bone) ?? 0) + 1);
    count.byFace.set(face, (count.byFace.get(face) ?? 0) + 1);
    const angle = foldAngle(rig.mesh, studio.matrices, posed, face);
    if (angle > (count.faceWorst.get(face)?.angle ?? 0)) {
      const correctiveWeights = Array.from(
        studio.correctives.subarray(0, rig.mesh.correctives.length),
      );
      count.faceWorst.set(face, {
        label,
        angle,
        ...turnBone(rig.mesh, studio, face),
        correctiveWeights,
        corners: cornerSamples(rig.mesh, correctiveWeights, posed, face),
      });
    }
  }
  count.samples += 1;
  if (folded.length > 0) {
    count.withFold += 1;
  }
  if (folded.length > count.most) {
    count.most = folded.length;
    count.split = sideSplit(bones);
    count.worst = label;
  }
}

/** One studio body of a role in a scene. */
export interface RoleBody {
  /** The index of the player in the layout, or `null` for the conductor. */
  readonly index: number | null;
  /** The player model, with its studio rig. */
  readonly model: PlayerModel;
}

/**
 * Finds the studio bodies of a role in a scene: the first player of each model of a species of the
 * role. The violin seats of a demo hold many rabbits with one model, so the first of them stands
 * for all.
 *
 * @param role The role.
 * @param scene The scene of a demo.
 * @returns The bodies, or none when the scene has no body of the role.
 */
export function roleBodies(role: RoleSource, scene: TestScene): RoleBody[] {
  if (role.kind === 'conductor') {
    const model = scene.models.get(CONDUCTOR.species, CONDUCTOR.instrument, 4);
    return scene.plan.conductor ? [{ index: null, model }] : [];
  }
  const bodies: RoleBody[] = [];
  for (const [index, place] of scene.layout.players.entries()) {
    const { species, instrument, kettles, support } = place.cast;
    if (instrument !== role.instrument || !role.species.includes(species)) {
      continue;
    }
    const model = scene.models.get(species, instrument, kettles, support);
    if (!bodies.some((b) => b.model === model)) {
      bodies.push({ index, model });
    }
  }
  return bodies;
}

/**
 * Tells if a play sample of a body counts: it gets the scene, the index of the player in the
 * layout (`null` for the conductor), and the song time, in seconds.
 */
export type PlayFilter = (scene: TestScene, player: number | null, song: number) => boolean;

/**
 * Counts the folded faces of the studio body of a role over demos. Each demo has three sample
 * sets. The rest pose is the pose before the start. The play goes from the count-in to the end
 * at each step. The lift of the arms takes the first 3 s of wall time after the start.
 *
 * @param role The role.
 * @param demos The demos. A demo with no body of the role adds nothing.
 * @param step The step of the song time of the play, in seconds.
 * @param visit Gets each posed body, such as the turn probe of `--turns`.
 * @param sets The sample sets to count, all by default. A set that is not in the list keeps no
 *   sample, such as the play in the rest mode of `pnpm hold-fit --sets`.
 * @param keep Tells which play samples of a body count, such as the samples of one technique of
 *   `pnpm hold-fit --technique`, or none for all.
 * @returns The report.
 */
export function probeFolds(
  role: RoleSource,
  demos: readonly DemoFile[],
  step: number,
  visit?: FoldVisit,
  sets: readonly SampleSet[] = SAMPLE_SETS,
  keep?: PlayFilter,
): FoldReport {
  const report: FoldReport = {
    demos: [],
    faces: 0,
    mesh: null,
    sets: { rest: emptyCount(), play: emptyCount(), lift: emptyCount() },
  };
  for (const demo of demos) {
    const scene = roleScene(role, demo.bytes);
    const bodies = roleBodies(role, scene);
    if (bodies.length === 0) {
      continue;
    }
    report.demos.push(demo.file);
    report.faces = (bodies[0]?.model.studio.mesh.corners.length ?? 0) / 3;
    report.mesh ??= bodies[0]?.model.studio.mesh ?? null;

    const audible = allAudible(scene.score);
    const buffer = createScenePose(scene.plan);
    const start = -countInAt(scene.plan.beats, 0).lengthSec;
    const samples: [SampleSet, number, number, Transport, string][] = [
      ['rest', start, 10, NOT_STARTED, 'rest'],
    ];
    for (let song = start; song <= scene.score.durationSec; song += step) {
      samples.push(['play', song, 10 + song - start, PLAYING, `${song.toFixed(2)} s`]);
    }
    const lift: Transport = { ...PLAYING, changedAtWall: 10 };
    for (let wall = 10; wall < 13; wall += 0.1) {
      const song = Math.min(0, start + wall - 10);
      samples.push(['lift', song, wall, lift, `wall ${(wall - 10).toFixed(1)} s`]);
    }
    const kept = samples.filter(([set]) => sets.includes(set));
    for (const [set, song, wall, transport, label] of kept) {
      const frame = poseAt(scene.plan, song, wall, transport, audible, buffer);
      for (const { index, model } of bodies) {
        if (set === 'play' && keep && !keep(scene, index, song)) {
          continue;
        }
        const pose = index === null ? frame.conductor : frame.players[index];
        const who = bodies.length > 1 ? ` player ${index ?? ''}` : '';
        if (pose) {
          countPose(model, pose, `${demo.file}${who} ${label}`, report.sets[set], set, visit);
        }
      }
    }
  }
  return report;
}

/**
 * Writes a report as lines: a table of the sample sets, and the bones of the folded faces.
 *
 * @param name The name of the role.
 * @param report The report.
 * @param step The step of the song time of the play, in seconds.
 * @returns The lines.
 */
export function foldLines(name: string, report: FoldReport, step: number): string[] {
  const all = emptyCount();
  for (const set of SAMPLE_SETS) {
    const count = report.sets[set];
    all.samples += count.samples;
    all.withFold += count.withFold;
    if (count.most > all.most) {
      all.most = count.most;
      all.split = count.split;
      all.worst = count.worst;
    }
    for (const [bone, n] of count.bones) {
      all.bones.set(bone, (all.bones.get(bone) ?? 0) + n);
    }
  }
  const row = (set: string, count: FoldCount): string => {
    const share = (100 * count.withFold) / Math.max(1, count.samples);
    return `| ${set} | ${count.samples} | ${count.withFold} | ${share.toFixed(1)}% | ${count.most} (${splitText(count.split)}) | ${count.worst || '-'} |`;
  };
  const bones = [...all.bones].toSorted((a, b) => b[1] - a[1]).map(([bone, n]) => `${bone} ${n}`);
  return [
    `Folded faces of the studio body of the ${name} (${report.faces} faces), play step ${step} s.`,
    `Demos: ${report.demos.join(', ') || 'none'}`,
    '',
    '| Set | Samples | With a fold | Share | Most faces (by the side of the main bone) | Worst sample |',
    '|---|---:|---:|---:|---:|---|',
    ...SAMPLE_SETS.map((set) => row(set, report.sets[set])),
    row('all', all),
    '',
    `Folded faces of all samples by the main studio bone: ${bones.join(', ') || 'none'}`,
  ];
}

/** One bone of a corner of a face, with its weight. */
export interface CornerWeight {
  /** The name of the studio bone. */
  readonly bone: string;
  /** The weight, from 0 to 1. */
  readonly weight: number;
}

/** The facts of one face of a studio mesh in the bind pose. */
export interface FaceFacts {
  /** The index of the triangle in the mesh. */
  readonly face: number;
  /** The main studio bone of the face ({@link mainBone}). */
  readonly bone: string;
  /** The middle of the face: the mean of its three corners, in meters. */
  readonly middle: Vec3;
  /** The angle at each corner, in degrees, in the order of the corners. */
  readonly angles: readonly [number, number, number];
  /**
   * The bones of each corner with a weight above 0, the largest weight first: at most 4 for each
   * corner.
   */
  readonly weights: readonly (readonly CornerWeight[])[];
}

/**
 * Gives the facts of one face of a studio mesh in the bind pose: its main bone, its middle, the
 * angle at each corner, and the weights of each corner.
 *
 * @param mesh The studio mesh in the bind pose.
 * @param face The index of the triangle.
 * @returns The facts.
 */
export function faceFacts(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights' | 'corners'>,
  face: number,
): FaceFacts {
  const corners = [0, 1, 2].map((k) => mesh.corners[face * 3 + k] ?? 0);
  const points = corners.map((v): Vec3 => [
    mesh.positions[v * 3] ?? 0,
    mesh.positions[v * 3 + 1] ?? 0,
    mesh.positions[v * 3 + 2] ?? 0,
  ]);
  const mean = (axis: 0 | 1 | 2): number => points.reduce((sum, p) => sum + p[axis], 0) / 3;
  const middle: Vec3 = [mean(0), mean(1), mean(2)];
  const angle = (k: number): number => {
    const p = points[k] ?? [0, 0, 0];
    const a = (points[(k + 1) % 3] ?? p).map((x, axis) => x - (p[axis] ?? 0));
    const b = (points[(k + 2) % 3] ?? p).map((x, axis) => x - (p[axis] ?? 0));
    const dot = a.reduce((sum, x, axis) => sum + x * (b[axis] ?? 0), 0);
    const cos = dot / (Math.hypot(...a) * Math.hypot(...b));
    return Math.acos(Math.min(1, Math.max(-1, cos))) * (180 / Math.PI);
  };
  const weights = corners.map((v) =>
    [0, 1, 2, 3]
      .map((k) => ({
        bone: STUDIO_BONES[mesh.joints[v * 4 + k] ?? 0] ?? '',
        weight: mesh.weights[v * 4 + k] ?? 0,
      }))
      .filter((entry) => entry.weight > 0)
      .toSorted((x, y) => y.weight - x.weight),
  );
  return {
    face,
    bone: mainBone(mesh, face),
    middle,
    angles: [angle(0), angle(1), angle(2)],
    weights,
  };
}

/**
 * Gives the worst fold of a face over all sample sets of a report: the fold with the largest angle.
 *
 * @param report The report.
 * @param face The index of the face.
 * @returns The worst fold with the corners of its sample, or `null` when the face does not fold.
 */
export function worstFold(report: FoldReport, face: number): WorstSample | null {
  let worst: WorstSample | null = null;
  for (const set of SAMPLE_SETS) {
    const fold = report.sets[set].faceWorst.get(face);
    if (fold && fold.angle > (worst?.angle ?? 0)) {
      worst = fold;
    }
  }
  return worst;
}

/**
 * Writes a worst fold: the sample, the angle, and the bone of the fold.
 *
 * @param worst The worst fold, or `null`.
 * @returns The text, such as `beethoven-8.mid 12.00 s, 134°, turn of neck 41°`.
 */
export function worstText(worst: FaceWorst | null): string {
  if (!worst) {
    return '-';
  }
  const turn = worst.bone ? `, turn of ${worst.bone} ${worst.turn.toFixed(0)}°` : '';
  return `${worst.label}, ${worst.angle.toFixed(0)}°${turn}`;
}

/**
 * Tells if a face folds in each sample of each sample set that has samples: the mark `ALL` of the
 * table of the faces ({@link faceLines}).
 *
 * @param report The report.
 * @param face The index of the face.
 * @returns True when each set with samples has the face folded in all its samples. A report with
 *   no samples gives false.
 */
export function foldsInAll(report: FoldReport, face: number): boolean {
  const counts = SAMPLE_SETS.map((set) => report.sets[set]).filter((count) => count.samples > 0);
  return (
    counts.length > 0 && counts.every((count) => (count.byFace.get(face) ?? 0) === count.samples)
  );
}

/**
 * Writes the corners of each face in its worst fold ({@link worstFold}) as a table, one row for
 * each corner: the vertex, its place in the bind pose and in the posed skin, the move of each
 * corrective shape at its full weight with the weight of the shape in the sample, the move of all
 * shapes in the sample, and the bones and the weights of the corner.
 *
 * @param report The report.
 * @param faces The indices of the faces.
 * @returns The lines, or none when no face has a worst fold.
 */
export function cornerLines(report: FoldReport, faces: readonly number[]): string[] {
  const mesh = report.mesh;
  if (!mesh) {
    return [];
  }

  const place = (p: Vec3): string => p.map((x) => x.toFixed(3)).join(', ');
  const mm = (meters: number): string => (meters * 1000).toFixed(1);
  const rows = faces.flatMap((face) => {
    const worst = worstFold(report, face);
    if (!worst) {
      return [];
    }
    const { weights } = faceFacts(mesh, face);
    return worst.corners.map((corner, k) => {
      const moves =
        corner.fullMoves
          .map((length, c) => `${mm(length)} × ${(worst.correctiveWeights[c] ?? 0).toFixed(2)}`)
          .join(' / ') || '-';
      const bones = (weights[k] ?? []).map((w) => `${w.bone} ${w.weight.toFixed(2)}`).join(' ');
      return `| ${face} | ${corner.vertex} | ${place(corner.bind)} | ${place(corner.posed)} | ${moves} | ${mm(corner.move)} | ${bones} |`;
    });
  });
  if (rows.length === 0) {
    return [];
  }
  return [
    'The corners of each face in its worst sample. Each shape move gives the move of the corner by one corrective shape at its full weight, then the weight of the shape in the sample. The shapes are in the order of the mesh: the left arm down, the right arm down, and the shapes of a raised arm, a bent elbow, or a bent wrist of a body with such shapes. The move in the sample is the move of all shapes at their weights.',
    '',
    '| Face | Vertex | Bind (m) | Posed (m) | Shape moves (mm) × weights | Move in the sample (mm) | Bones and weights |',
    '|---:|---:|---|---|---|---:|---|',
    ...rows,
  ];
}

/**
 * Writes the faces that fold in the most samples of all sample sets as a table: for each face,
 * its index, the share of the samples of each set in which it folds, the mark `ALL` when it folds
 * in each sample ({@link foldsInAll}), its main bone, its middle, its corner angles
 * ({@link faceFacts}), and its worst fold with the bone whose turn changes its normal most
 * ({@link worstFold}). With the source middles of a mesh rig ({@link sourceMiddles}), a column
 * gives the middle of each face in the units of the source. The table of the corners of each face
 * in its worst sample ({@link cornerLines}) follows it.
 *
 * @param report The report.
 * @param count The number of faces.
 * @param sources The middle of each face of the module in the units of the source, or `null` for
 *   no column.
 * @returns The lines, or a line that names no face when no face folds.
 */
export function faceLines(
  report: FoldReport,
  count: number,
  sources: readonly (Vec3 | null)[] | null = null,
): string[] {
  const totals = new Map<number, number>();
  for (const set of SAMPLE_SETS) {
    for (const [face, n] of report.sets[set].byFace) {
      totals.set(face, (totals.get(face) ?? 0) + n);
    }
  }
  const top = [...totals]
    .toSorted((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, count)
    .map(([face]) => face);
  if (!report.mesh || top.length === 0) {
    return ['No face folds.'];
  }

  const share = (set: SampleSet, face: number): string => {
    const { byFace, samples } = report.sets[set];
    return `${((100 * (byFace.get(face) ?? 0)) / Math.max(1, samples)).toFixed(1)}%`;
  };
  const mesh = report.mesh;
  const corners = cornerLines(report, top);
  return [
    `The ${top.length} faces that fold in the most samples, with the places of the bind pose. The mark ALL shows a face that folds in each sample of each set with samples.`,
    '',
    `| Face | ${SAMPLE_SETS.map((set) => `${set[0]?.toUpperCase()}${set.slice(1)}`).join(' | ')} | Mark | Main bone | Middle (m) |${sources ? ' Source middle (u) |' : ''} Corner angles | Worst sample, angle, bone of the fold |`,
    `|---:|${SAMPLE_SETS.map(() => '---:|').join('')}---|---|---|${sources ? '---|' : ''}---|---|`,
    ...top.map((face) => {
      const facts = faceFacts(mesh, face);
      const middle = facts.middle.map((x) => x.toFixed(3)).join(', ');
      const angles = facts.angles.map((a) => `${a.toFixed(1)}°`).join(', ');
      const mark = foldsInAll(report, face) ? 'ALL' : '';
      const source = sources?.[face];
      const sourceCell = sources
        ? ` ${source ? `[${source.join(', ')}]` : 'no source face'} |`
        : '';
      return `| ${face} | ${SAMPLE_SETS.map((set) => share(set, face)).join(' | ')} | ${mark} | ${facts.bone} | ${middle} |${sourceCell} ${angles} | ${worstText(worstFold(report, face))} |`;
    }),
    ...(corners.length > 0 ? ['', ...corners] : []),
  ];
}

/** The Blender script of the mesh rigs, which gives the source middles of the faces. */
const RIG_SCRIPT = join(import.meta.dirname, 'blender', 'rig_mesh.py');

/**
 * Reads the JSON text of the source middles of the rig script, with no face of an eye shell: the
 * export drops these faces for the pea eyes, so the other faces keep their order in the module.
 *
 * @param text The text.
 * @returns The middle of each face, or `null` for a face with no source face, or `null` when the
 *   text holds no such list.
 */
function parseMiddles(text: string): (Vec3 | null)[] | null {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) {
    return null;
  }
  const out: (Vec3 | null)[] = [];
  for (const item of value) {
    if (item === 'eye') {
      continue;
    }
    if (item === null) {
      out.push(null);
      continue;
    }
    const point: unknown[] = Array.isArray(item) ? item : [];
    const [x = Number.NaN, y = Number.NaN, z = Number.NaN] = point.map(Number);
    if (point.length !== 3 || ![x, y, z].every(Number.isFinite)) {
      return null;
    }
    out.push([x, y, z]);
  }
  return out;
}

/** The source middles of the faces of a module, or the reason why the tool has none. */
export interface SourceMiddles {
  /** The middle of each face, or `null` for a face with no source face, or `null` for none. */
  readonly middles: readonly (Vec3 | null)[] | null;
  /** The reason why the tool has no middles, or `null`. */
  readonly note: string | null;
}

/**
 * Gives the middle of each face of the module of a mesh rig in the units of the source, as
 * `weights.rigid` of its config takes it: a run of the rig script of Blender with the config of
 * the working tree and `--faces`, into a temporary folder (`face_sources()` of
 * `tools/blender/rig_mesh.py`), in about 2 s. A face that a ring adds or a face of an eye has no
 * source face. Blender comes from the variable `BLENDER`, or from the path.
 *
 * @param animal The animal of the studio body.
 * @param faces The number of faces of the module, which the rig must have.
 * @returns The middle of each face, or the reason why the tool has none.
 */
export async function sourceMiddles(animal: string, faces: number): Promise<SourceMiddles> {
  const config = rigConfigPath(animal);
  if (!existsSync(config) || !existsSync(RIG_SCRIPT)) {
    return {
      middles: null,
      note: `The ${animal} has no mesh rig here, so the table has no source middles.`,
    };
  }

  const dir = mkdtempSync(join(tmpdir(), 'fold-probe-faces-'));
  const release = trackFolder(dir);
  try {
    const file = join(dir, 'faces.json');
    const blender = process.env['BLENDER'] ?? 'blender';
    const args = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', RIG_SCRIPT];
    await promisify(execFile)(blender, [
      ...args,
      '--',
      config,
      join(dir, 'rig.glb'),
      '--faces',
      file,
    ]);
    const middles = parseMiddles(await readFile(file, 'utf8'));
    if (!middles) {
      return { middles: null, note: 'The rig script gave no list of source middles.' };
    }
    if (middles.length !== faces) {
      const note = `The rig of tools/mesh-rigs/${animal}.json has ${middles.length} faces and the module ${faces}, so the table has no source middles. Rig the config into the module first.`;
      return { middles: null, note };
    }
    return { middles, note: null };
  } catch (error) {
    const cause = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return {
      middles: null,
      note: `The rig script failed, so the table has no source middles: ${cause}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
    release();
  }
}

/** The width of an angle bin of the turn probe of `--turns`, in degrees. */
export const TURN_BIN = 10;

/**
 * Gives the side of the body of a face: the side of its middle in the bind pose. The animal faces
 * -z, and its left side is -x, so a face of the chest near the right shoulder is on the right.
 *
 * @param mesh The places and the triangles of the studio mesh in the bind pose.
 * @param face The index of the triangle.
 * @returns `L` for a middle at x < 0, else `R`.
 */
export function faceSide(mesh: Pick<StudioMesh, 'positions' | 'corners'>, face: number): Side {
  let x = 0;
  for (let k = 0; k < 3; k++) {
    x += mesh.positions[(mesh.corners[face * 3 + k] ?? 0) * 3] ?? 0;
  }
  return x < 0 ? 'L' : 'R';
}

/**
 * Gives the turn of a bone from its bind pose in the bind axes of another bone, from the skin
 * matrices of a pose: the turn of the other bone from its bind pose comes off first. For the
 * upper arm and the chest, it is the turn of the arm in the axes of the chest, with no lean of
 * the body.
 *
 * @param matrices The skin matrices, 16 numbers for each bone, column by column.
 * @param bone The index of the bone.
 * @param frame The index of the other bone, such as the chest.
 * @returns The turn.
 */
export function relativeTurn(matrices: ArrayLike<number>, bone: number, frame: number): Quat {
  const turnOf = (index: number): Quaternion =>
    new Quaternion().setFromRotationMatrix(
      new Matrix4().fromArray(
        Array.from({ length: 16 }, (...[, k]) => matrices[index * 16 + k] ?? 0),
      ),
    );
  const q = turnOf(frame).invert().multiply(turnOf(bone));
  return [q.x, q.y, q.z, q.w];
}

/**
 * Gives the angle between two turns: the angle of the turn from one to the other.
 *
 * @param a The first turn.
 * @param b The second turn.
 * @returns The angle, in degrees, from 0 to 180.
 */
export function turnAngle(a: Quat, b: Quat): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot)) * (180 / Math.PI);
}

/**
 * Gives the mean of some turns: the sum of the turns, each with the sign of the quaternion that is
 * nearest to the first turn, made a unit quaternion. For turns near each other, it is the middle
 * turn.
 *
 * @param turns The turns.
 * @returns The mean, or `null` with no turn.
 */
export function meanTurn(turns: readonly Quat[]): Quat | null {
  const [first] = turns;
  if (!first) {
    return null;
  }
  const sum = [0, 0, 0, 0];
  for (const turn of turns) {
    const dot = turn[0] * first[0] + turn[1] * first[1] + turn[2] * first[2] + turn[3] * first[3];
    const sign = dot < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) {
      sum[k] = (sum[k] ?? 0) + sign * (turn[k] ?? 0);
    }
  }
  const [x = 0, y = 0, z = 0, w = 1] = sum;
  const length = Math.hypot(x, y, z, w);
  return [x / length, y / length, z / length, w / length];
}

/** One sample of the turn probe: the turn of the upper arm in the axes of the chest. */
export interface TurnSample {
  /** The turn of the upper arm from its bind pose, in the bind axes of the chest. */
  readonly turn: Quat;
  /** True when the face folds in the sample. */
  readonly folded: boolean;
}

/** The samples of one bin of the angle from the mean turn. */
export interface TurnBin {
  /** The smallest angle of the bin, in degrees. */
  readonly from: number;
  /** The samples in the bin. */
  readonly samples: number;
  /** The samples in the bin in which the face folds. */
  readonly withFold: number;
}

/**
 * Sorts the samples into bins of the angle of their turn from a mean turn, from 0° up to the bin
 * of the largest angle.
 *
 * @param samples The samples.
 * @param mean The mean turn.
 * @param width The width of a bin, in degrees.
 * @returns The bins, the smallest angles first. A bin with no sample stays in the list.
 */
export function turnBins(
  samples: readonly TurnSample[],
  mean: Quat,
  width: number = TURN_BIN,
): TurnBin[] {
  const counts: { samples: number; withFold: number }[] = [];
  for (const { turn, folded } of samples) {
    const bin = Math.min(Math.floor(turnAngle(turn, mean) / width), Math.ceil(180 / width) - 1);
    for (let k = counts.length; k <= bin; k++) {
      counts.push({ samples: 0, withFold: 0 });
    }
    const count = counts[bin];
    if (count) {
      count.samples += 1;
      count.withFold += folded ? 1 : 0;
    }
  }
  return counts.map((count, k) => ({
    from: k * width,
    samples: count.samples,
    withFold: count.withFold,
  }));
}

/**
 * Writes the turn probe of a face (`--turns`): the mean turn of the upper arm of the side of the
 * face in the axes of the chest over the samples in which the face folds, the mean direction of
 * the upper arm in these samples, and the share of the samples with a fold by the angle of the
 * turn from that mean ({@link turnBins}).
 *
 * @param face The index of the face.
 * @param side The side of the face ({@link faceSide}).
 * @param samples The turn of each sample, and if the face folds in it.
 * @param bind The direction of the upper arm in the bind pose: from its joint to the elbow.
 * @returns The lines.
 */
export function turnLines(
  face: number,
  side: Side,
  samples: readonly TurnSample[],
  bind: Vec3,
): string[] {
  const folded = samples.filter((sample) => sample.folded);
  const mean = meanTurn(folded.map((sample) => sample.turn));
  const head = `Turn probe of face ${face}: the upper arm ${side} in the bind axes of the chest (x to the right side of the animal, y up, z to its back).`;
  if (!mean) {
    return [head, `The face folds in none of the ${samples.length} samples.`];
  }

  const q = new Quaternion(...mean);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * (180 / Math.PI);
  const sign = q.w < 0 ? -1 : 1;
  const axis = new Vector3(q.x, q.y, q.z).multiplyScalar(sign).normalize();
  const direction = new Vector3(...bind).normalize().applyQuaternion(q);
  const out = side === 'R' ? direction.x : -direction.x;
  const n = (value: number): string => value.toFixed(2);
  return [
    head,
    `The face folds in ${folded.length} of ${samples.length} samples. Mean turn of the upper arm from its bind pose in these samples: ${angle.toFixed(1)}° around (${n(axis.x)}, ${n(axis.y)}, ${n(axis.z)}).`,
    `Mean direction of the upper arm in these samples: out ${n(out)}, up ${n(direction.y)}, forward ${n(-direction.z)}.`,
    '',
    '| Angle from the mean turn | Samples | With a fold | Share |',
    '|---|---:|---:|---:|',
    ...turnBins(samples, mean).map(
      (bin) =>
        `| ${bin.from}° to ${bin.from + TURN_BIN}° | ${bin.samples} | ${bin.withFold} | ${bin.samples > 0 ? `${((100 * bin.withFold) / bin.samples).toFixed(1)}%` : '-'} |`,
    ),
  ];
}

/** The turn probe of a face: a visit of {@link probeFolds} and the lines of its result. */
export interface TurnProbe {
  /** Keeps the turn of the upper arm and the fold of the face in each sample. */
  readonly visit: FoldVisit;
  /**
   * Writes the lines of the probe ({@link turnLines}).
   *
   * @throws Error if the mesh of the role has no such face.
   */
  readonly lines: () => string[];
}

/**
 * Starts the turn probe of a face: a visit of {@link probeFolds} that keeps the turn of the upper
 * arm of the side of the face in the axes of the chest in each sample, and if the face folds.
 *
 * @param face The index of the face.
 * @returns The visit, and a function that writes the lines of the probe ({@link turnLines}).
 */
export function turnProbe(face: number): TurnProbe {
  const samples: TurnSample[] = [];
  let found: { readonly side: Side; readonly bind: Vec3 } | null = null;
  let faces = 0;
  const visit: FoldVisit = (rig, studio, ...[, folded]) => {
    faces = rig.mesh.corners.length / 3;
    if (face >= faces) {
      return;
    }
    const side = faceSide(rig.mesh, face);
    const joint = new Vector3(...rig.body.heads[`upper_arm_${side}`]);
    const bind = toVec3(new Vector3(...rig.body.heads[`forearm_${side}`]).sub(joint));
    found ??= { side, bind };
    const turn = relativeTurn(
      studio.matrices,
      STUDIO_BONES.indexOf(`upper_arm_${side}`),
      STUDIO_BONES.indexOf('chest'),
    );
    samples.push({ turn, folded: folded.includes(face) });
  };
  const lines = (): string[] => {
    if (!found) {
      throw new Error(`The studio body of the role has ${faces} faces, so it has no face ${face}.`);
    }
    return turnLines(face, found.side, samples, found.bind);
  };
  return { visit, lines };
}

/** The width of a bin of the bin probe (`--bins`), in degrees. */
export const BONE_BIN = 20;

/** The turn of no turn: the bind pose. */
const NO_TURN: Quat = [0, 0, 0, 1];

/** The bins of one bone of the bin probe of a face. */
export interface BoneBins {
  /** The bone, such as `forearm_R`. */
  readonly bone: string;
  /** The mean turn of the bone from its bind pose in the samples with a fold, in degrees. */
  readonly folded: number;
  /** The mean turn of the bone from its bind pose in the samples with no fold, in degrees. */
  readonly clear: number;
  /** The samples by the turn of the bone from its bind pose ({@link turnBins}). */
  readonly bins: readonly TurnBin[];
}

/**
 * Sums up the samples of the bin probe of each bone: the mean turn from the bind pose with a fold
 * and with no fold, and the bins of {@link BONE_BIN}. The bones go from the largest gap between
 * the two means, so that the bone whose turn comes with the fold comes first.
 *
 * @param bones The bones, in the order of the turns of a sample.
 * @param samples The turn of each bone in the axes of its parent, and if the face folds, of each
 *   sample.
 * @returns The bins of each bone.
 */
export function boneBins(
  bones: readonly string[],
  samples: readonly { readonly turns: readonly Quat[]; readonly folded: boolean }[],
): BoneBins[] {
  const mean = (values: readonly number[]): number =>
    values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : Number.NaN;
  return bones
    .map((bone, k) => {
      const own = samples.map(({ turns, folded }) => ({ turn: turns[k] ?? NO_TURN, folded }));
      const angle = (folded: boolean): number =>
        mean(own.filter((s) => s.folded === folded).map((s) => turnAngle(s.turn, NO_TURN)));
      return {
        bone,
        folded: angle(true),
        clear: angle(false),
        bins: turnBins(own, NO_TURN, BONE_BIN),
      };
    })
    .toSorted((a, b) => (b.folded - b.clear || 0) - (a.folded - a.clear || 0));
}

/**
 * Writes the bin probe of a face (`--bins`): for each bone of the arm of the side of the face, the
 * mean turn from its bind pose in the axes of its parent with a fold and with no fold, and the share
 * of the samples with a fold in each bin of that turn ({@link boneBins}).
 *
 * @param face The index of the face.
 * @param side The side of the face.
 * @param bins The bins of each bone.
 * @param samples The number of samples, and the samples with a fold.
 * @returns The lines.
 */
export function binLines(
  face: number,
  side: Side,
  bins: readonly BoneBins[],
  samples: { readonly all: number; readonly folded: number },
): string[] {
  const columns = Math.max(0, ...bins.map((bone) => bone.bins.length));
  const degrees = (value: number): string => (Number.isNaN(value) ? '-' : `${value.toFixed(0)}°`);
  return [
    `Bin probe of face ${face} (arm ${side}): it folds in ${samples.folded} of ${samples.all} samples. Each bone turns from its bind pose in the axes of its parent. The bones go from the largest gap of the mean turn with a fold and with no fold, and a cell gives the share of the samples with a fold.`,
    '',
    `| Bone | Turn with a fold | Turn with no fold | ${Array.from({ length: columns }, (...[, k]) => `${k * BONE_BIN}° to ${(k + 1) * BONE_BIN}°`).join(' | ')} |`,
    `|---|---:|---:|${Array.from({ length: columns }, () => '---:').join('|')}|`,
    ...bins.map((bone) => {
      const cells = Array.from({ length: columns }, (...[, k]) => {
        const bin = bone.bins[k];
        return bin && bin.samples > 0
          ? `${((100 * bin.withFold) / bin.samples).toFixed(0)}% of ${bin.samples}`
          : '-';
      });
      return `| ${bone.bone} | ${degrees(bone.folded)} | ${degrees(bone.clear)} | ${cells.join(' | ')} |`;
    }),
  ];
}

/**
 * Starts the bin probe of a face: a visit of {@link probeFolds} that keeps the turn of each bone of
 * the arm of the side of the face, from the clavicle to the fingers, in the axes of its parent, and
 * if the face folds, in each sample.
 *
 * @param face The index of the face.
 * @returns The visit, and a function that writes the lines of the probe ({@link binLines}).
 */
export function binProbe(face: number): TurnProbe {
  const samples: { readonly turns: Quat[]; readonly folded: boolean }[] = [];
  let side: Side | null = null;
  let faces = 0;
  const bonesOf = (of: Side): StudioBone[] =>
    (['clavicle', 'upper_arm', 'forearm', 'forearm_twist', 'hand', 'fingers'] as const).map(
      (bone): StudioBone => `${bone}_${of}`,
    );
  const visit: FoldVisit = (rig, studio, ...[, folded]) => {
    faces = rig.mesh.corners.length / 3;
    if (face >= faces) {
      return;
    }
    side ??= faceSide(rig.mesh, face);
    const turns = bonesOf(side).map((bone) => {
      const parent = STUDIO_PARENTS[bone] ?? 'chest';
      return relativeTurn(
        studio.matrices,
        STUDIO_BONES.indexOf(bone),
        STUDIO_BONES.indexOf(parent),
      );
    });
    samples.push({ turns, folded: folded.includes(face) });
  };
  const lines = (): string[] => {
    if (side === null) {
      throw new Error(`The studio body of the role has ${faces} faces, so it has no face ${face}.`);
    }
    const all = samples.length;
    const folded = samples.filter((sample) => sample.folded).length;
    return binLines(face, side, boneBins(bonesOf(side), samples), { all, folded });
  };
  return { visit, lines };
}

/** The samples, the samples with a fold, and the most folded faces of one sample set. */
export interface SetCount {
  /** The number of posed bodies. */
  readonly samples: number;
  /** The number of posed bodies with one folded face or more. */
  readonly withFold: number;
  /** The most folded faces of one posed body. */
  readonly most: number;
  /** The folded faces of the posed body with the most folded faces, by the side of their bone. */
  readonly split: SideSplit;
}

/** The counts of the folds of each sample set, as `--json` writes them. */
export type FoldCounts = Readonly<Record<SampleSet, SetCount>>;

/** One folded face of a report, as `--json` writes it. */
export interface FaceRecord {
  /** The index of the triangle in the mesh. */
  readonly face: number;
  /** The number of samples of each set in which the face folds. */
  readonly folds: Readonly<Record<SampleSet, number>>;
  /** The main studio bone of the face ({@link mainBone}). */
  readonly bone: string;
  /** The middle of the face in the bind pose, in meters. */
  readonly middle: Vec3;
  /** The worst fold of the face over all sample sets ({@link worstFold}). */
  readonly worst: FaceWorst | null;
}

/** The folds of a report, as `--json` writes them. */
export interface FaceJson {
  /** The counts of each sample set. */
  readonly sets: FoldCounts;
  /**
   * The SHA-256 of the corners of the faces of the mesh, or empty with no mesh. Two bodies with
   * the same corners give each face the same index.
   */
  readonly topology: string;
  /** Each face that folds in a sample, by its index. */
  readonly faces: readonly FaceRecord[];
  /**
   * The middle of each face of `--middles` in the bind pose, in meters, by the index of the face,
   * or none.
   */
  readonly middles: Readonly<Record<string, Vec3>>;
}

/**
 * The format version of the JSON text of `--json` (`ProbeFormat` of `tools/ref-tree.ts`). A
 * change of the format takes the next version. Version 3 added the middles of `--middles`.
 */
export const FOLD_FORMAT = 3;

/**
 * The oldest format version that {@link FOLD_FORMAT} only adds fields to (`ProbeFormat.since` of
 * `tools/ref-tree.ts`): a compare with `--base` reads a text of each version from it to
 * {@link FOLD_FORMAT}. A change that only adds fields keeps it, and a change of a field sets it to
 * the new version.
 */
export const FOLD_SINCE = 2;

/**
 * Gives the fields of a worst fold that the JSON text of `--json` holds: the sample, the angle,
 * and the bone of the fold, with no corners.
 *
 * @param worst The worst fold, or `null`.
 * @returns The fields, or `null`.
 */
function foldOnly(worst: FaceWorst | null): FaceWorst | null {
  if (!worst) {
    return null;
  }
  const { label, angle, bone, turn } = worst;
  return { label, angle, bone, turn };
}

/**
 * Writes the folds of a report as the JSON text of `--json`: the format version
 * ({@link FOLD_FORMAT} and {@link FOLD_SINCE}), the counts of each sample set, the hash of the
 * corners of the mesh, each folded face ({@link FaceRecord}), and the middle of each named face.
 *
 * @param report The report.
 * @param named The faces of `--middles`. A face that the mesh does not have gets no middle.
 * @returns The JSON text.
 */
export function foldJson(report: FoldReport, named: readonly number[] = []): string {
  const sets = Object.fromEntries(
    SAMPLE_SETS.map((set) => {
      const { samples, withFold, most, split } = report.sets[set];
      return [set, { samples, withFold, most, split }];
    }),
  );
  const mesh = report.mesh;
  const folded = new Set(SAMPLE_SETS.flatMap((set) => [...report.sets[set].byFace.keys()]));
  const faces: FaceRecord[] = mesh
    ? [...folded]
        .toSorted((a, b) => a - b)
        .map((face) => ({
          face,
          folds: {
            rest: report.sets.rest.byFace.get(face) ?? 0,
            play: report.sets.play.byFace.get(face) ?? 0,
            lift: report.sets.lift.byFace.get(face) ?? 0,
          },
          bone: mainBone(mesh, face),
          middle: faceFacts(mesh, face).middle,
          worst: foldOnly(worstFold(report, face)),
        }))
    : [];
  const topology = mesh
    ? createHash('sha256')
        .update(
          new Uint8Array(mesh.corners.buffer, mesh.corners.byteOffset, mesh.corners.byteLength),
        )
        .digest('hex')
    : '';
  const count = mesh ? mesh.corners.length / 3 : 0;
  const middles = Object.fromEntries(
    mesh
      ? named.filter((face) => face < count).map((face) => [face, faceFacts(mesh, face).middle])
      : [],
  );
  return JSON.stringify({
    version: FOLD_FORMAT,
    since: FOLD_SINCE,
    sets,
    topology,
    faces,
    middles,
  });
}

/**
 * Reads the folded faces of the JSON text of `--json` ({@link foldJson}).
 *
 * @param text The JSON text.
 * @returns The counts of each sample set, the hash of the corners, the folded faces, and the
 *   middles of the named faces.
 * @throws Error if a sample set has no whole counts.
 */
export function readFaceJson(text: string): FaceJson {
  // SAFETY: the text comes from foldJson() of this tool in a child process, and readFoldJson()
  // checks the counts.
  const parsed = JSON.parse(text) as Partial<FaceJson>;
  return {
    sets: readFoldJson(text),
    topology: parsed.topology ?? '',
    faces: parsed.faces ?? [],
    middles: parsed.middles ?? {},
  };
}

/** The largest distance of the middles of one face in two bodies with other corners, in meters. */
export const SAME_FACE_DISTANCE = 0.01;

/**
 * Pairs the folded faces of two bodies one to one: each face goes into one pair at most. Two
 * bodies with the same corners give each face the same index, so a pair holds the faces of one
 * index. Else the pairs go in the order of the distance of the middles of their faces in the bind
 * pose, the nearest first, up to {@link SAME_FACE_DISTANCE}. A pair whose face of either body is in
 * a nearer pair does not count. Of two pairs at the same distance, the pair with the lower index
 * of the face of the first body goes first, then the pair with the lower index of the face of the
 * second body.
 *
 * @param first The folds of the first body.
 * @param second The folds of the second body.
 * @returns The face of the second body of each face of the first body that has a pair, by the
 *   index of the face of the first body.
 */
export function sameFaces(first: FaceJson, second: FaceJson): Map<number, FaceRecord> {
  const pairs = new Map<number, FaceRecord>();
  if (first.topology === second.topology) {
    const byIndex = new Map(second.faces.map((face) => [face.face, face]));
    for (const face of first.faces) {
      const other = byIndex.get(face.face);
      if (other) {
        pairs.set(face.face, other);
      }
    }
    return pairs;
  }

  const candidates = first.faces.flatMap((a) =>
    second.faces.flatMap((b) => {
      const distance = Math.hypot(
        a.middle[0] - b.middle[0],
        a.middle[1] - b.middle[1],
        a.middle[2] - b.middle[2],
      );
      return distance <= SAME_FACE_DISTANCE ? [{ a, b, distance }] : [];
    }),
  );
  const taken = new Set<number>();
  for (const { a, b } of candidates.toSorted(
    (x, y) => x.distance - y.distance || x.a.face - y.a.face || x.b.face - y.b.face,
  )) {
    if (!pairs.has(a.face) && !taken.has(b.face)) {
      pairs.set(a.face, b);
      taken.add(b.face);
    }
  }
  return pairs;
}

/**
 * Writes the share of the samples of each set in which a face folds.
 *
 * @param folds The folds of the tree of the face.
 * @param record The face, or `null` for a face that folds in no sample.
 * @returns The text, such as `0.0% / 13.7% / 0.0%`, in the order of the sample sets.
 */
function shareCells(folds: FaceJson, record: FaceRecord | null): string {
  return SAMPLE_SETS.map((set) => {
    const share = (100 * (record?.folds[set] ?? 0)) / Math.max(1, folds.sets[set].samples);
    return `${share.toFixed(1)}%`;
  }).join(' / ');
}

/**
 * Gives the total of the samples of all sets in which a face folds.
 *
 * @param record The face.
 * @returns The total.
 */
function totalFolds(record: FaceRecord): number {
  return SAMPLE_SETS.reduce((sum, set) => sum + record.folds[set], 0);
}

/**
 * Writes the folded faces of a commit and of the working tree side by side: the `count` faces
 * that fold in the most samples of the working tree, then the `count` faces of the commit that the
 * rows do not hold yet. Each row gives the share of the samples of each set in which the face
 * folds on both trees ({@link sameFaces}), a mark `new` for a face that folds only on the working
 * tree and `gone` for a face that folds only on the commit, the main bone, and the worst fold with
 * the bone whose turn changes the normal most.
 *
 * @param label The name of the commit.
 * @param base The folds of the commit.
 * @param tree The folds of the working tree.
 * @param count The number of faces of each tree.
 * @returns The lines.
 */
export function faceCompareLines(
  label: string,
  base: FaceJson,
  tree: FaceJson,
  count: number,
): string[] {
  const top = (folds: FaceJson): FaceRecord[] =>
    folds.faces
      .toSorted((a, b) => totalFolds(b) - totalFolds(a) || a.face - b.face)
      .slice(0, count);
  const pairs = sameFaces(tree, base);
  const back = new Map([...pairs].map(([face, record]) => [record.face, face]));
  const treeFaces = new Map(tree.faces.map((record) => [record.face, record]));
  const rows: { readonly tree: FaceRecord | null; readonly base: FaceRecord | null }[] = top(
    tree,
  ).map((record) => ({ tree: record, base: pairs.get(record.face) ?? null }));
  for (const record of top(base)) {
    if (!rows.some((row) => row.base === record)) {
      const face = back.get(record.face);
      rows.push({ tree: face === undefined ? null : (treeFaces.get(face) ?? null), base: record });
    }
  }
  if (rows.length === 0) {
    return ['No face folds on either tree.'];
  }

  const lines = [
    tree.topology === base.topology
      ? `The faces of ${label} and of the working tree have the same corners, so a face keeps its index.`
      : `The faces of ${label} and of the working tree have other corners, so the faces pair one to one by the nearest middles within ${SAME_FACE_DISTANCE} m.`,
    '',
    `| Face (tree) | Face (${label}) | ${label}: rest / play / lift | Working tree: rest / play / lift | Mark | Main bone | Worst sample, angle, bone of the fold |`,
    '|---:|---:|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const mark = !row.base ? 'new' : !row.tree ? 'gone' : '';
    const record = row.tree ?? row.base;
    lines.push(
      `| ${row.tree?.face ?? '-'} | ${row.base?.face ?? '-'} | ${shareCells(base, row.base)} | ${shareCells(tree, row.tree)} | ${mark} | ${record?.bone ?? '-'} | ${worstText(record?.worst ?? null)} |`,
    );
  }
  return lines;
}

/** A face of `--faces-of` of the commit with its pair in the working tree ({@link pairBaseFaces}). */
export interface BaseFacePair {
  /** The index of the face in the mesh of the commit. */
  readonly face: number;
  /** The folds of the face on the commit, or `null` when it folds in no sample. */
  readonly base: FaceRecord | null;
  /**
   * The index of the face of the working tree: the same index when both meshes have the same
   * corners, else the folded face with the nearest middle within {@link SAME_FACE_DISTANCE}, or
   * `null` when no folded face is that near.
   */
  readonly paired: number | null;
  /** The folds of the face of the working tree, or `null` when it folds in no sample. */
  readonly tree: FaceRecord | null;
}

/**
 * Pairs the faces of `--faces-of`, as the commit numbers them, with the faces of the working tree.
 * Two meshes with the same corners keep the index of each face. Else the pairs go in the order of
 * the distance of the middles in the bind pose, the nearest first, up to
 * {@link SAME_FACE_DISTANCE}, and each face goes into one pair at most, as `watchPairs()` of
 * `pnpm rig-mesh --watch` pairs the faces after a `cut`. A named face with no pair folds in no
 * sample of the working tree.
 *
 * @param base The folds of the commit, with the middles of the named faces (`--middles`).
 * @param tree The folds of the working tree.
 * @param faces The faces of the commit.
 * @returns The pair of each face, in the order of the faces.
 * @throws Error if the meshes have other corners and the commit gives no middle of a face.
 */
export function pairBaseFaces(
  base: FaceJson,
  tree: FaceJson,
  faces: readonly number[],
): BaseFacePair[] {
  const baseFaces = new Map(base.faces.map((record) => [record.face, record]));
  const treeFaces = new Map(tree.faces.map((record) => [record.face, record]));
  if (base.topology === tree.topology) {
    return faces.map((face) => ({
      face,
      base: baseFaces.get(face) ?? null,
      paired: face,
      tree: treeFaces.get(face) ?? null,
    }));
  }

  const missing = faces.filter((face) => !base.middles[String(face)]);
  if (missing.length > 0) {
    throw new Error(
      `The commit gives no middle of the faces ${missing.join(', ')}: its mesh has fewer faces, or its fold-probe has no --middles.`,
    );
  }
  const candidates = faces.flatMap((face) =>
    tree.faces.flatMap((record) => {
      const [x, y, z] = base.middles[String(face)] ?? [0, 0, 0];
      const [a, b, c] = record.middle;
      const gap = Math.hypot(a - x, b - y, c - z);
      return gap <= SAME_FACE_DISTANCE ? [{ face, record, gap }] : [];
    }),
  );
  const pairs = new Map<number, FaceRecord>();
  const taken = new Set<number>();
  for (const { face, record } of candidates.toSorted(
    (p, q) => p.gap - q.gap || p.face - q.face || p.record.face - q.record.face,
  )) {
    if (!pairs.has(face) && !taken.has(record.face)) {
      pairs.set(face, record);
      taken.add(record.face);
    }
  }
  return faces.map((face) => ({
    face,
    base: baseFaces.get(face) ?? null,
    paired: pairs.get(face)?.face ?? null,
    tree: pairs.get(face) ?? null,
  }));
}

/**
 * Writes the faces of `--faces-of` of the commit with their pairs in the working tree
 * ({@link pairBaseFaces}): the share of the samples of each set in which each face folds on both
 * trees.
 *
 * @param label The name of the commit.
 * @param base The folds of the commit.
 * @param tree The folds of the working tree.
 * @param pairs The pairs.
 * @returns The lines.
 */
export function baseFaceLines(
  label: string,
  base: FaceJson,
  tree: FaceJson,
  pairs: readonly BaseFacePair[],
): string[] {
  return [
    base.topology === tree.topology
      ? `The faces of --faces-of on ${label}: the meshes have the same corners, so a face keeps its index.`
      : `The faces of --faces-of on ${label}, each with the folded face of the working tree with the nearest middle within ${SAME_FACE_DISTANCE} m.`,
    '',
    `| Face (${label}) | Face (tree) | ${label}: rest / play / lift | Working tree: rest / play / lift |`,
    '|---:|---:|---|---|',
    ...pairs.map(
      (pair) =>
        `| ${pair.face} | ${pair.paired ?? 'none'} | ${shareCells(base, pair.base)} | ${shareCells(tree, pair.tree)} |`,
    ),
  ];
}

/**
 * Reads the JSON text of `--json` ({@link foldJson}).
 *
 * @param text The JSON text.
 * @returns The counts of each sample set.
 * @throws Error if a sample set has no whole counts.
 */
export function readFoldJson(text: string): FoldCounts {
  // SAFETY: the text comes from foldJson(), and the loop below checks each count that it reads.
  const parsed = JSON.parse(text) as {
    readonly sets?: Partial<
      Record<SampleSet, Partial<Omit<SetCount, 'split'> & { split: Partial<SideSplit> }>>
    >;
  };
  const count = (set: SampleSet): SetCount => {
    const { samples, withFold, most, split } = parsed.sets?.[set] ?? {};
    const counts = [samples, withFold, most, split?.L, split?.R, split?.other];
    if (!counts.every((n) => Number.isInteger(n))) {
      throw new Error(`The fold counts have no whole counts of the set ${set}.`);
    }
    return {
      samples: samples ?? 0,
      withFold: withFold ?? 0,
      most: most ?? 0,
      split: { L: split?.L ?? 0, R: split?.R ?? 0, other: split?.other ?? 0 },
    };
  };
  return { rest: count('rest'), play: count('play'), lift: count('lift') };
}

/**
 * Probes the folds of a commit and of the working tree at the same time, each in a child process
 * (`probeBeside()`), and writes the share of the samples with a fold of each set on both trees,
 * with the most folded faces of one sample split by the side of their main bone ({@link sideSplit}).
 * A role that the commit does not have stops the run before the probes (`checkRefRole()`). With
 * `faces` above 0, the table of the faces of {@link faceCompareLines} follows. With faces of
 * `--faces-of`, the commit also gives their middles (`--middles`), and the table of
 * {@link baseFaceLines} follows.
 *
 * @param name The name of the role.
 * @param ref The commit, the branch, or the tag.
 * @param args The arguments of the children, with no `--base` and no `--faces-of`.
 * @param faces The number of faces of each tree in the table of the faces, or 0 for no table.
 * @param facesOf The faces of `--faces-of`, as the commit numbers them, or none.
 */
async function compareFolds(
  name: string,
  ref: string,
  args: readonly string[],
  faces: number,
  facesOf: readonly number[],
): Promise<void> {
  const label = `${ref} (${shortHash(ref)})`;
  const started = performance.now();
  const middles = facesOf.length > 0 ? ['--middles', facesOf.join(',')] : [];
  const texts = await probeBeside(
    ref,
    'fold-probe.ts',
    { base: [...args, ...middles], tree: args },
    { prefix: 'fold-probe-', role: { ...FOLD_ROLE_TABLE, name }, cache: true },
  );
  const base = readFaceJson(texts.base);
  const tree = readFaceJson(texts.tree);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const cell = (count: SetCount): string =>
    `${((100 * count.withFold) / Math.max(1, count.samples)).toFixed(1)}% (${count.withFold}/${count.samples}), most ${count.most} (${splitText(count.split)})`;
  const lines = [
    `Folded faces of the studio body of the ${name} on ${label} and on the working tree: ${seconds} s.`,
    '',
    `| Set | ${label} | Working tree |`,
    '|---|---:|---:|',
    ...SAMPLE_SETS.map((set) => `| ${set} | ${cell(base.sets[set])} | ${cell(tree.sets[set])} |`),
  ];
  if (faces > 0) {
    lines.push('', ...faceCompareLines(label, base, tree, faces));
  }
  if (facesOf.length > 0) {
    lines.push('', ...baseFaceLines(label, base, tree, pairBaseFaces(base, tree, facesOf)));
  }
  console.log(lines.join('\n'));
}

/**
 * Runs the probe: `node tools/fold-probe.ts <role> [--demo <id>]... [--step <seconds>]`. With
 * `--glb <file>`, the role gets the studio body that the export makes from the file, in a copy of
 * `src/` (`tools/glb-swap.ts`). With `--base <ref>`, the probe of the commit and of the working
 * tree run at the same time ({@link compareFolds}).
 */
async function main(): Promise<void> {
  const { glb, rest: args } = takeGlb(process.argv.slice(2));
  const name = args[0] ?? '';
  const role = findRole(name);
  if (!role) {
    throw new Error(
      `Usage: pnpm fold-probe <role> [--demo <id>]... [--step <seconds>] [--faces <n>] [--turns <face>] [--bins <face>] [--set <changes>]... [--json <file>] [--glb <file>] [--base <ref> [--faces-of <faces>]], with a role of: ${[...FOLD_ROLES.keys()].join(', ')}, or a recast role <role>@<species>, such as violinist@wolf.`,
    );
  }
  const baseAt = args.indexOf('--base');
  const ref = baseAt >= 0 ? args[baseAt + 1] : undefined;
  if (baseAt >= 0 && (!ref || ref.startsWith('--'))) {
    throw new Error('The option --base takes a commit, a branch, or a tag.');
  }
  const options = ['--json', '--middles', '--turns', '--bins', '--set'];
  if (ref && (glb || options.some((option) => args.includes(option)))) {
    throw new Error(
      'The option --base goes with none of --glb, --json, --middles, --turns, --bins, and --set.',
    );
  }
  if (glb) {
    process.exitCode = await withGlbBody(roleAnimal(role), glb, (dir) =>
      runTool(dir, 'fold-probe.ts', args),
    );
    return;
  }
  // A demo is its file name, with or without `.mid`, as in `pnpm pose-depth`.
  const chosen = args.flatMap((arg, i) =>
    args[i - 1] === '--demo' ? [arg.endsWith('.mid') ? arg : `${arg}.mid`] : [],
  );
  const stepAt = args.indexOf('--step');
  const step = stepAt >= 0 ? Number(args[stepAt + 1]) : 0.25;
  if (!(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const facesAt = args.indexOf('--faces');
  const faces = facesAt >= 0 ? Number(args[facesAt + 1]) : 0;
  if (!Number.isInteger(faces) || faces < 0) {
    throw new Error('The option --faces takes a whole number of faces.');
  }
  const turnsAt = args.indexOf('--turns');
  const turnFace = turnsAt >= 0 ? Number(args[turnsAt + 1]) : null;
  if (turnFace !== null && (!Number.isInteger(turnFace) || turnFace < 0)) {
    throw new Error('The option --turns takes the index of a face.');
  }
  const binsAt = args.indexOf('--bins');
  const binFace = binsAt >= 0 ? Number(args[binsAt + 1]) : null;
  if (binFace !== null && (!Number.isInteger(binFace) || binFace < 0)) {
    throw new Error('The option --bins takes the index of a face.');
  }

  const facesOfAt = args.indexOf('--faces-of');
  const facesOf = facesOfAt >= 0 ? faceList(args[facesOfAt + 1] ?? '', '--faces-of') : [];
  if (facesOfAt >= 0 && !ref) {
    throw new Error('The option --faces-of goes with --base: it names the faces of the commit.');
  }

  if (ref) {
    await compareFolds(name, ref, withoutOptions(args, ['--base', '--faces-of']), faces, facesOf);
    return;
  }

  const all = await probeDemos();
  const unknown = chosen.filter((file) => !all.some((demo) => demo.file === file));
  if (unknown.length > 0) {
    throw new Error(`No demo has the name ${unknown.join(', ')}.`);
  }
  const demos = chosen.length > 0 ? all.filter((demo) => chosen.includes(demo.file)) : all;
  const turns = turnFace === null ? null : turnProbe(turnFace);
  const bins = binFace === null ? null : binProbe(binFace);
  const visits = [turns, bins].flatMap((probe) => (probe ? [probe.visit] : []));
  const visit: FoldVisit | undefined =
    visits.length > 0
      ? (...sample) => {
          for (const each of visits) {
            each(...sample);
          }
        }
      : undefined;
  const holds = args.flatMap((arg, i) => (args[i - 1] === '--set' ? [arg] : [])).join(';');
  const changes = holds ? setHolds(holds) : null;
  let report: FoldReport;
  try {
    report = probeFolds(role, demos, step, visit);
  } finally {
    changes?.undo();
  }
  if (changes) {
    console.log(`Hold changes: ${changes.text}`);
  }
  console.log(foldLines(name, report, step).join('\n'));
  if (faces > 0) {
    const sources = report.mesh ? await sourceMiddles(roleAnimal(role), report.faces) : null;
    if (sources?.note) {
      console.log(`\n${sources.note}`);
    }
    console.log(['', ...faceLines(report, faces, sources?.middles ?? null)].join('\n'));
  }
  if (turns) {
    console.log(['', ...turns.lines()].join('\n'));
  }
  if (bins) {
    console.log(['', ...bins.lines()].join('\n'));
  }
  const jsonAt = args.indexOf('--json');
  const json = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  if (jsonAt >= 0 && (!json || json.startsWith('--'))) {
    throw new Error('The option --json takes a file.');
  }
  const middlesAt = args.indexOf('--middles');
  const named = middlesAt >= 0 ? faceList(args[middlesAt + 1] ?? '', '--middles') : [];
  if (json) {
    await writeFile(json, foldJson(report, named));
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
