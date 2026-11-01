/**
 * Probes the rest joints and a hash of the body mesh of each species on each support, and the
 * skeleton and a hash of the mesh of each player of the section cast and of the conductor (design
 * 4.3, 4.4). It also probes a hash of the poses of each player of each demo in each set of
 * samples: the rest pose, the lift, the play, and the lowering after a pause (design 5.1, 5.2).
 * Two runs on two commits show if a change moved a body or a pose: the JSON of the same code is
 * the same, byte for byte. `--out` writes the JSON. With no `--out`, the tool prints a summary
 * with a SHA-256 of the JSON. `--no-poses` probes only the bodies and the players.
 *
 * Usage: pnpm body-probe [--out <file>] [--no-poses]
 *        pnpm body-probe --compare <base.json> <new.json>
 *        pnpm body-probe --base <ref>
 */
import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildBiped } from '../src/models/biped.ts';
import type { BodyBones } from '../src/models/biped.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from '../src/models/cast.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import { MeshBuilder } from '../src/models/mesh.ts';
import type { MeshData } from '../src/models/mesh.ts';
import { INSTRUMENT_SUPPORTS, buildPlayer, stanceOn } from '../src/models/player.ts';
import type { Support } from '../src/models/props.ts';
import { BONE_NAMES } from '../src/models/rig.ts';
import { SPECIES } from '../src/models/species.ts';
import { loadTestBodies, studioRenderMesh, studioRigOf } from '../src/models/studio-body.ts';
import type { SmoothNormals, StudioRenderMesh } from '../src/models/studio-body.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { LOWER_MAX_SEC } from '../src/pose/rest.ts';
import { NOT_STARTED, PLAYING, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import type { AnimalPose, Transport } from '../src/pose/types.ts';
import { patchedDemos } from './patch-demos.ts';
import { checkFormat, formatVersion, runChild, withProbeTree } from './ref-tree.ts';

// The probe takes each species of SPECIES, also a test species whose body the app does not load
// (design 4.4, "Test mannequin").
await loadTestBodies();

/** The supports of each species in the probe: each seat, and standing. */
export const PROBE_SUPPORTS = [
  'chair',
  'stool',
  'high-stool',
  'bench',
  'stand',
] as const satisfies readonly Support[];

/** The rest joints and the landmarks of a body by name, and its head height. */
export type JointTable = Record<string, Vec3 | number>;

/**
 * The fields of a mesh that the probe hashes: the places, the colors, the bones, the blend
 * weights, and the finishes of each mesh, and the corrective shapes and the smooth normals of a
 * studio body (design 4.4, 4.5).
 */
export const MESH_FIELDS = [
  'positions',
  'colors',
  'bones',
  'blendBones',
  'blendWeights',
  'finishes',
  'correctives',
  'normals',
] as const;

/** A field of a mesh that the probe hashes. */
export type MeshField = (typeof MESH_FIELDS)[number];

/**
 * The hash of each field of a mesh, as 16 hex digits. A mesh with no studio skin has no
 * `correctives` and no `normals`.
 */
export type FieldHashes = Partial<Record<MeshField, string>>;

/** The probe of one body on one support. */
export interface BodyProbe {
  /** The rest joints and the landmarks of the body, rounded to micrometers. */
  readonly joints: Readonly<JointTable>;
  /** The number of triangles of the body. */
  readonly triangles: number;
  /** The hash of the mesh of the body: all its fields. */
  readonly mesh: string;
  /** The hash of each field of the mesh. A file of an older tool has none. */
  readonly fields?: Readonly<FieldHashes>;
}

/** The probe of one player: the body, the instrument, and its support. */
export interface PlayerProbe {
  /** The position of each bone of the skeleton, by name, rounded to micrometers. */
  readonly skeleton: Readonly<Record<string, Vec3>>;
  /** The number of triangles of the player. */
  readonly triangles: number;
  /** The hash of the mesh of the player: all its fields. */
  readonly mesh: string;
  /** The hash of each field of the mesh. A file of an older tool has none. */
  readonly fields?: Readonly<FieldHashes>;
}

/** The names of the sets of samples of the pose probe. */
export const POSE_SETS = ['rest', 'lift', 'play', 'lower'] as const;

/** The name of a set of samples of the pose probe. */
export type PoseSetName = (typeof POSE_SETS)[number];

/** One sample of the pose probe: a song time, a wall time, and a transport. */
export type PoseSample = readonly [song: number, wall: number, transport: Transport];

/** The poses of one player in one set of samples. */
export interface PoseSetProbe {
  /** The hash of the rounded poses of all samples of the set, as 16 hex digits. */
  readonly hash: string;
  /**
   * The short hash of the rounded pose of each sample, as {@link STEP_DIGITS} hex digits for
   * each sample, in the order of the samples. It finds the first sample that differs.
   */
  readonly steps: string;
}

/** The poses of the players of one demo. */
export interface DemoPoses {
  /** The song time and the wall time of each sample of each set, in seconds, rounded. */
  readonly samples: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /**
   * The poses of each player in each set, by the index of the player in the layout and its
   * section, species, and instrument (such as `3 viola/cat/viola`), and the conductor.
   */
  readonly players: Readonly<Record<string, Readonly<Record<string, PoseSetProbe>>>>;
}

/** The bodies and the players of the probe, with no poses. */
export interface BodiesProbe {
  /** The body of each species on each support. */
  readonly species: Readonly<Record<string, Readonly<Record<string, BodyProbe>>>>;
  /** Each player of the section cast and the conductor, by section, species, and instrument. */
  readonly players: Readonly<Record<string, PlayerProbe>>;
}

/** The output of the probe. */
export interface Probe extends BodiesProbe {
  /**
   * The poses of the players of each demo, by the name of the demo file with no `.mid`. A file of
   * an older tool has none.
   */
  readonly poses?: Readonly<Record<string, DemoPoses>>;
}

/** The comparison of two probes. */
export interface ProbeComparison {
  /** The counts of the equal bodies, players, and pose sets. */
  readonly counts: readonly string[];
  /** One line for each difference. */
  readonly differences: readonly string[];
}

/**
 * Rounds a number to micrometers, so that the noise of a refactor below that does not count.
 *
 * @param value The number.
 * @returns The rounded number, with no negative zero.
 */
export function round(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Rounds the three values of a point.
 *
 * @param point The point.
 * @returns The rounded point.
 */
function roundPoint(point: Vec3): Vec3 {
  return [round(point[0]), round(point[1]), round(point[2])];
}

/** The values of one field of a mesh, in the order of the hash. */
interface FieldValues {
  /** The field. */
  readonly field: MeshField;
  /** The lists of values: one list, or one list for each corrective shape. */
  readonly lists: readonly ArrayLike<number>[];
  /** True for integers, which the hash does not round. */
  readonly exact: boolean;
}

/**
 * Gives the values of each field of a mesh, in the order of {@link MESH_FIELDS}.
 *
 * @param mesh The mesh data.
 * @param studio The render mesh of a studio body, or `null` for a mesh with no studio skin.
 * @returns The values of each field that the mesh has.
 */
function fieldValues(mesh: MeshData, studio: StudioRenderMesh | null): FieldValues[] {
  const fields: FieldValues[] = [
    { field: 'positions', lists: [mesh.positions], exact: false },
    { field: 'colors', lists: [mesh.colors], exact: false },
    { field: 'bones', lists: [mesh.bones], exact: true },
    { field: 'blendBones', lists: [mesh.blendBones], exact: true },
    { field: 'blendWeights', lists: [mesh.blendWeights], exact: false },
    { field: 'finishes', lists: [mesh.finishes], exact: true },
  ];
  if (studio) {
    fields.push({ field: 'correctives', lists: studio.correctives, exact: false });
    // `--base` runs this tool on the code of a commit. A studio body of an older commit can have
    // no smooth normals.
    const normals: SmoothNormals | undefined = studio.normals;
    if (normals) {
      fields.push({ field: 'normals', lists: [normals.corners, ...normals.moves], exact: false });
    }
  }
  return fields;
}

/**
 * Adds the values of one field to a hash: a label and the length of each list, then the values,
 * each rounded to micrometers when the field is not exact.
 *
 * @param hash The hash.
 * @param values The values of the field.
 */
function addField(hash: Hash, values: FieldValues): void {
  for (const [i, list] of values.lists.entries()) {
    const label = values.lists.length === 1 ? values.field : `${values.field}[${i}]`;
    hash.update(`${label}:${list.length};`);
    const rounded = Array.from(list, (v) => (values.exact ? v : round(v)));
    hash.update(rounded.join(','));
  }
}

/**
 * Gives a hash of the parts of a mesh that make its look and its motion: the places, the colors,
 * the bones, the blend weights, and the finishes, and for a studio body the corrective shapes and
 * the smooth normals. Each value is rounded to micrometers first. A mesh with no studio skin
 * keeps the hash of the tool before the studio fields.
 *
 * @param mesh The mesh data.
 * @param studio The render mesh of a studio body, or `null` for a mesh with no studio skin.
 * @returns The hash, as 16 hex digits.
 */
export function meshHash(mesh: MeshData, studio: StudioRenderMesh | null = null): string {
  const hash = createHash('sha256');
  for (const values of fieldValues(mesh, studio)) {
    addField(hash, values);
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Gives a hash of each field of a mesh, so that a comparison names the fields that changed.
 *
 * @param mesh The mesh data.
 * @param studio The render mesh of a studio body, or `null` for a mesh with no studio skin.
 * @returns The hash of each field that the mesh has, as 16 hex digits.
 */
export function fieldHashes(mesh: MeshData, studio: StudioRenderMesh | null = null): FieldHashes {
  const hashes: FieldHashes = {};
  for (const values of fieldValues(mesh, studio)) {
    const hash = createHash('sha256');
    addField(hash, values);
    hashes[values.field] = hash.digest('hex').slice(0, 16);
  }
  return hashes;
}

/**
 * Gives the render mesh of a body with a studio skin (design 4.4), with its corrective shapes and
 * its smooth normals.
 *
 * @param species The species parameters.
 * @param standing True for a body that stands.
 * @param mesh The mesh of the body or of the player in its bind pose.
 * @returns The render mesh, or `null` for a body with no studio skin.
 */
function studioMeshOf(
  species: SpeciesParams,
  standing: boolean,
  mesh: MeshData,
): StudioRenderMesh | null {
  if (!species.body) {
    return null;
  }
  return studioRenderMesh(studioRigOf(species.body, standing), mesh);
}

/**
 * Gives the rest joints and the landmarks of a body, rounded.
 *
 * @param bones The body bones.
 * @returns The joints by name, and the head height.
 */
export function jointsOf(bones: BodyBones): JointTable {
  const sorted = Object.entries(bones.positions).toSorted(([a], [b]) => a.localeCompare(b));
  const landmarks = [
    'headCenter',
    'mouth',
    'floor',
    'palmL',
    'palmR',
    'fingerBlockL',
    'fingerBlockR',
  ] as const;
  return Object.fromEntries([
    ['headHeight', round(bones.headHeight)],
    ...sorted.map(([name, point]) => [name, roundPoint(point)] as const),
    ...landmarks.map((name) => [name, roundPoint(bones[name])] as const),
  ]);
}

/**
 * Probes the body of one species on one support.
 *
 * @param species The species parameters.
 * @param support The support.
 * @returns The probe.
 */
function probeBody(species: SpeciesParams, support: Support): BodyProbe {
  const builder = new MeshBuilder();
  const stance = stanceOn(support, species);
  const bones = buildBiped(builder, species, stance);
  const mesh = builder.build();
  const studio = studioMeshOf(species, stance.kind === 'standing', mesh);
  return {
    joints: jointsOf(bones),
    triangles: mesh.finishes.length,
    mesh: meshHash(mesh, studio),
    fields: fieldHashes(mesh, studio),
  };
}

/**
 * Probes all bodies and all players.
 *
 * @returns The bodies and the players.
 */
export function probeBodies(): BodiesProbe {
  const species: Record<string, Record<string, BodyProbe>> = {};
  for (const [id, params] of Object.entries<SpeciesParams>(SPECIES)) {
    const bySupport: Record<string, BodyProbe> = {};
    for (const support of PROBE_SUPPORTS) {
      bySupport[support] = probeBody(params, support);
    }
    species[id] = bySupport;
  }

  const players: Record<string, PlayerProbe> = {};
  const instruments = new Map<string, readonly InstrumentId[]>(Object.entries(SECTION_INSTRUMENTS));
  const cast: { key: string; id: SpeciesId; instrument: InstrumentId }[] = Object.entries(
    SECTION_SPECIES,
  ).flatMap(([section, list]) =>
    list.flatMap((id) =>
      (instruments.get(section) ?? []).map((instrument) => ({
        key: `${section}/${id}/${instrument}`,
        id,
        instrument,
      })),
    ),
  );
  cast.push({
    key: `conductor/${CONDUCTOR.species}/${CONDUCTOR.instrument}`,
    id: CONDUCTOR.species,
    instrument: CONDUCTOR.instrument,
  });
  for (const { key, id, instrument } of cast) {
    const player = buildPlayer(id, instrument, 4, INSTRUMENT_SUPPORTS[instrument]);
    const studio = player.studio ? studioRenderMesh(player.studio, player.mesh) : null;
    const skeleton: Record<string, Vec3> = {};
    BONE_NAMES.forEach((name, i) => {
      const point = player.skeleton.positions[i];
      if (point) {
        skeleton[name] = roundPoint(point);
      }
    });
    players[key] = {
      skeleton,
      triangles: player.mesh.finishes.length,
      mesh: meshHash(player.mesh, studio),
      fields: fieldHashes(player.mesh, studio),
    };
  }
  return { species, players };
}

/** The step of the song time between two samples of a play, in seconds. */
export const PLAY_STEP = 0.5;

/** The number of hex digits of the short hash of one sample. */
export const STEP_DIGITS = 6;

/** The transport of a play that started at the wall time 10 s, for the lift. */
const LIFTING: Transport = { ...PLAYING, changedAtWall: 10 };

/** The transport of a pause at the wall time 10 s, after a play. */
const PAUSED: Transport = { ...PLAYING, playing: false, changedAtWall: 10, before: PLAYING };

/**
 * Gives the samples of each set of the pose probe of a scene, as the sweep of a role does
 * (`pose/test-sweep-roles.ts`). The rest pose has a sample at each second of 4 s of the wall
 * clock before the first play. The lift has a sample each 0.1 s in the first 4 s of a play from
 * the count-in. The play has a sample each {@link PLAY_STEP} of the song from the count-in to the
 * end. The lowering has the samples of a pause in the middle of the song and of a stop at its
 * end, through the hold and the longest lowering.
 *
 * @param scene The scene.
 * @returns The samples of each set.
 */
export function poseSamples(scene: TestScene): Record<PoseSetName, PoseSample[]> {
  const start = -countInAt(scene.plan.beats, 0).lengthSec;
  const end = scene.score.durationSec;
  const rest = Array.from({ length: 4 }, (_, i): PoseSample => [start, 10 + i, NOT_STARTED]);
  const lift = Array.from({ length: 40 }, (_, i): PoseSample => [
    Math.min(0, start + i * 0.1),
    10 + i * 0.1,
    LIFTING,
  ]);
  const play: PoseSample[] = [];
  for (let i = 0; start + i * PLAY_STEP <= end; i++) {
    const song = start + i * PLAY_STEP;
    play.push([song, 10 - start + song, PLAYING]);
  }
  const lower: PoseSample[] = [];
  for (const song of [end / 2, end]) {
    for (let i = 0; i * 0.5 < PAUSED.holdSec; i++) {
      lower.push([song, 10 + i * 0.5, PAUSED]);
    }
    for (let i = 0; i * 0.1 < LOWER_MAX_SEC; i++) {
      lower.push([song, 10 + PAUSED.holdSec + i * 0.1, PAUSED]);
    }
  }
  return { rest, lift, play, lower };
}

/**
 * Writes the values of a pose into a list of integers in micro-units: the rotations, the root
 * offset, the slide offset, the instrument offset, and the blink. Thus the rounding is the
 * rounding of {@link round}, and an integer has no negative zero.
 *
 * @param pose The pose.
 * @returns The integers.
 */
export function poseValues(pose: AnimalPose): Int32Array {
  const instrument = pose.instrumentOffset ?? [0, 0, 0];
  const values = new Int32Array(pose.rotations.length + 10);
  let k = 0;
  for (const list of [pose.rotations, pose.rootOffset, pose.slideOffset, instrument]) {
    for (const value of list) {
      values[k++] = Math.round(value * 1e6);
    }
  }
  values[k] = Math.round(pose.blink * 1e6);
  return values;
}

/**
 * Gives the short hash of the values of one pose: the high bits of a 32-bit FNV-1a hash of the
 * integers. It only finds the first sample that differs, so a fast hash is enough.
 *
 * @param values The values of the pose, from {@link poseValues}.
 * @returns The hash, as {@link STEP_DIGITS} hex digits.
 */
export function stepHash(values: Int32Array): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash = Math.imul(hash ^ value, 0x01000193);
  }
  return (hash >>> (32 - STEP_DIGITS * 4)).toString(16).padStart(STEP_DIGITS, '0');
}

/**
 * Probes the poses of each player and of the conductor of a scene in each set of samples.
 *
 * @param scene The scene.
 * @returns The samples and the poses of each player.
 */
export function probeScenePoses(scene: TestScene): DemoPoses {
  const sets = poseSamples(scene);
  const buffer = createScenePose(scene.plan);
  const audible = allAudible(scene.score);
  const keys = scene.layout.players.map(({ cast }, index) => {
    const section = scene.score.seats[cast.seatIndex]?.section ?? 'none';
    return `${index} ${section}/${cast.species}/${cast.instrument}`;
  });
  if (scene.plan.conductor) {
    keys.push(`conductor/${CONDUCTOR.species}/${CONDUCTOR.instrument}`);
  }

  const players: Record<string, Record<string, PoseSetProbe>> = {};
  for (const name of POSE_SETS) {
    const hashes: Hash[] = keys.map(() => createHash('sha256'));
    const steps: string[][] = keys.map(() => []);
    for (const [song, wall, transport] of sets[name]) {
      const pose = poseAt(scene.plan, song, wall, transport, audible, buffer);
      const all = pose.conductor ? [...pose.players, pose.conductor] : pose.players;
      for (const [i, player] of all.entries()) {
        const values = poseValues(player);
        hashes[i]?.update(values);
        steps[i]?.push(stepHash(values));
      }
    }
    for (const [i, key] of keys.entries()) {
      players[key] = {
        ...players[key],
        [name]: {
          hash: hashes[i]?.digest('hex').slice(0, 16) ?? '',
          steps: steps[i]?.join('') ?? '',
        },
      };
    }
  }

  const samples = Object.fromEntries(
    POSE_SETS.map((name) => [
      name,
      sets[name].map(([song, wall]): readonly [number, number] => [round(song), round(wall)]),
    ]),
  );
  return { samples, players };
}

/**
 * Probes the poses of the players of each demo (design 8.2), after the changes of
 * `demos/patches.json`.
 *
 * @returns The poses of each demo, by the name of the file with no `.mid`.
 */
export async function probePoses(): Promise<Record<string, DemoPoses>> {
  const poses: Record<string, DemoPoses> = {};
  for (const demo of await patchedDemos()) {
    poses[demo.file.replace(/\.mid$/, '')] = probeScenePoses(sceneOf(demo.bytes));
  }
  return poses;
}

/**
 * Probes all bodies, all players, and the poses of each demo.
 *
 * @returns The probe.
 */
export async function runProbe(): Promise<Probe> {
  const bodies = probeBodies();
  return { ...bodies, poses: await probePoses() };
}

/** The samples of one set of one player and their short hashes, from one probe. */
interface SetSamples {
  /** The song time and the wall time of each sample, in seconds, rounded. */
  readonly samples: readonly (readonly [number, number])[];
  /** The short hash of each sample, {@link STEP_DIGITS} hex digits each, in sample order. */
  readonly steps: string;
}

/**
 * Gives the first sample of a set that differs between two probes: the first sample with another
 * time or another short hash.
 *
 * @param a The samples and the poses of the base.
 * @param b The samples and the poses of the new probe.
 * @returns The text of the sample, such as `sample 3 of 40 (song -1.80 s, wall 10.20 s)`.
 */
function firstDifference(a: SetSamples, b: SetSamples): string {
  const count = Math.max(a.samples.length, b.samples.length);
  for (let i = 0; i < count; i++) {
    const at = (side: SetSamples): string =>
      `${String(side.samples[i])} ${side.steps.slice(i * STEP_DIGITS, (i + 1) * STEP_DIGITS)}`;
    if (at(a) !== at(b)) {
      const [song, wall] = b.samples[i] ?? a.samples[i] ?? [Number.NaN, Number.NaN];
      return `sample ${i + 1} of ${b.samples.length} (song ${song.toFixed(2)} s, wall ${wall.toFixed(2)} s)`;
    }
  }
  return 'a sample that the short hashes do not show';
}

/** The comparison of the poses of two probes. */
interface PoseComparison {
  /** The number of pose sets: a set of one player in one demo. */
  readonly sets: number;
  /** The number of equal pose sets. */
  readonly equal: number;
  /** One line for each player with a difference. */
  readonly lines: readonly string[];
}

/**
 * Compares the poses of two probes.
 *
 * @param base The poses of the base.
 * @param next The poses to check.
 * @returns The comparison.
 */
function comparePoses(
  base: Readonly<Record<string, DemoPoses>>,
  next: Readonly<Record<string, DemoPoses>>,
): PoseComparison {
  let sets = 0;
  let equal = 0;
  const lines: string[] = [];
  for (const demo of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const a = base[demo];
    const b = next[demo];
    const keys = new Set([...Object.keys(a?.players ?? {}), ...Object.keys(b?.players ?? {})]);
    for (const key of keys) {
      const pa = a?.players[key];
      const pb = b?.players[key];
      if (!a || !b || !pa || !pb) {
        sets += POSE_SETS.length;
        lines.push(`pose ${demo} ${key}: missing in the ${pa ? 'new probe' : 'base'}`);
        continue;
      }
      const changed: string[] = [];
      for (const name of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        sets += 1;
        const sa: SetSamples = { samples: a.samples[name] ?? [], steps: pa[name]?.steps ?? '' };
        const sb: SetSamples = { samples: b.samples[name] ?? [], steps: pb[name]?.steps ?? '' };
        const sameTimes = JSON.stringify(sa.samples) === JSON.stringify(sb.samples);
        if (pa[name] && pa[name]?.hash === pb[name]?.hash && sameTimes) {
          equal += 1;
        } else {
          changed.push(`${name} from ${firstDifference(sa, sb)}`);
        }
      }
      if (changed.length > 0) {
        lines.push(`pose ${demo} ${key}: ${changed.join(', ')}`);
      }
    }
  }
  return { sets, equal, lines };
}

/**
 * Tells how the mesh of a body or of a player changed: `mesh same`, or `mesh differs` with the
 * fields whose hashes differ, such as `mesh differs (colors, normals)`. A field that only one
 * probe has counts as changed. When a probe of an older tool has no hash of each field, the text
 * says so.
 *
 * @param a The probe of the base.
 * @param b The new probe.
 * @returns The text of the change.
 */
export function meshChange(
  a: Pick<BodyProbe, 'mesh' | 'fields'>,
  b: Pick<BodyProbe, 'mesh' | 'fields'>,
): string {
  if (a.mesh === b.mesh) {
    return 'mesh same';
  }
  if (!a.fields || !b.fields) {
    return `mesh differs (no field hashes in the ${a.fields ? 'new probe' : 'base'})`;
  }
  const changed = MESH_FIELDS.filter((field) => a.fields?.[field] !== b.fields?.[field]);
  return changed.length > 0 ? `mesh differs (${changed.join(', ')})` : 'mesh differs';
}

/**
 * Compares two probes, and gives the counts of equal bodies, players, and pose sets, and a line
 * for each difference. A line of a body or of a player names the fields of the mesh that changed.
 * A line of a pose names the player and each set that changed, with the first sample that
 * differs.
 *
 * @param base The probe of the base.
 * @param next The probe to check.
 * @returns The counts and the differences.
 */
export function compareProbes(base: Probe, next: Probe): ProbeComparison {
  const same = (a: JointTable | Vec3 | undefined, b: JointTable | Vec3 | undefined): boolean =>
    JSON.stringify(a) === JSON.stringify(b);
  const lines: string[] = [];
  let bodies = 0;
  let equalBodies = 0;
  const ids = [...new Set([...Object.keys(base.species), ...Object.keys(next.species)])];
  for (const id of ids) {
    const supports = new Set([
      ...Object.keys(base.species[id] ?? {}),
      ...Object.keys(next.species[id] ?? {}),
    ]);
    for (const support of supports) {
      const a = base.species[id]?.[support];
      const b = next.species[id]?.[support];
      bodies += 1;
      const mesh = a?.mesh === b?.mesh;
      const joints = same(a?.joints, b?.joints);
      if (a && b && mesh && joints) {
        equalBodies += 1;
      } else {
        const fields = a && b ? meshChange(a, b) : `mesh ${mesh ? 'same' : 'differs'}`;
        lines.push(`body ${id} ${support}: ${fields}, joints ${joints ? 'same' : 'differ'}`);
      }
    }
  }
  let players = 0;
  let equalPlayers = 0;
  for (const key of new Set([...Object.keys(base.players), ...Object.keys(next.players)])) {
    const a = base.players[key];
    const b = next.players[key];
    players += 1;
    if (a && b && a.mesh === b.mesh && same(a.skeleton, b.skeleton)) {
      equalPlayers += 1;
      continue;
    }
    const moved =
      a && b
        ? Object.keys(a.skeleton).filter((name) => !same(a.skeleton[name], b.skeleton[name]))
        : [];
    const mesh = a && b ? meshChange(a, b) : `mesh ${a?.mesh === b?.mesh ? 'same' : 'differs'}`;
    lines.push(
      `player ${key}: ${mesh}, moved bones: ${moved.join(' ') || (a && b ? 'none' : 'missing')}`,
    );
  }
  // A file of an older tool has no poses. Then one line tells it, in place of a line for each
  // player.
  const poses = comparePoses(base.poses ?? {}, next.poses ?? {});
  const missing = [
    ...(base.poses ? [] : ['poses missing in the base']),
    ...(next.poses ? [] : ['poses missing in the new probe']),
  ];
  return {
    counts: [
      `bodies equal: ${equalBodies} of ${bodies}`,
      `players equal: ${equalPlayers} of ${players}`,
      `pose sets equal: ${poses.equal} of ${poses.sets}`,
    ],
    differences: [...lines, ...(missing.length > 0 ? missing : poses.lines)],
  };
}

/**
 * The format version of the JSON of `--out` (`formatVersion()` of `tools/ref-tree.ts`). A change
 * of the format takes the next version, so that a compare stops on two formats.
 */
export const PROBE_FORMAT = 1;

/**
 * Writes a probe as the JSON of `--out`, with the format version {@link PROBE_FORMAT}. The JSON of
 * the same code is the same, byte for byte.
 *
 * @param probe The probe.
 * @returns The text, with a line end at the end.
 */
export function probeText(probe: Probe): string {
  return `${JSON.stringify({ version: PROBE_FORMAT, ...probe }, null, 1)}\n`;
}

/** A probe file and the format version of its JSON. */
interface ProbeFile {
  /** The probe. */
  readonly probe: Probe;
  /** The format version of the JSON. */
  readonly version: number;
}

/**
 * Reads a probe file that this tool wrote.
 *
 * @param file The path of the file.
 * @returns The probe and the format version of its JSON.
 */
async function readProbe(file: string): Promise<ProbeFile> {
  const text = await readFile(file, 'utf8');
  // SAFETY: the file is the output of this tool, which writes a Probe as JSON.
  return { probe: JSON.parse(text) as Probe, version: formatVersion(text) };
}

/**
 * Probes the bodies and the poses of a commit. The folder of `withProbeTree()` holds the code, the
 * demos, and the tools of the commit, so the probe runs `tools/body-probe.ts` of the commit. A
 * commit with no such script gets the script of the working tree. The probe runs there in a child
 * process, so that the caller can probe the working tree at the same time. The folder goes away
 * at the end, also after a failure or a stop (INT or TERM).
 *
 * @param ref The commit, a branch, or a tag.
 * @param parent The folder that holds the temporary folder.
 * @param poses False to probe only the bodies and the players, as `--no-poses` does.
 * @returns The probe of the commit.
 * @throws Error if git does not know the ref, if the probe fails on the code of the commit, or if
 *   its JSON has another format version than {@link PROBE_FORMAT}.
 */
export function probeRef(ref: string, parent: string = tmpdir(), poses = true): Promise<Probe> {
  return withProbeTree(
    ref,
    async (dir) => {
      // The child starts before the first await, so it runs beside a probe of the caller.
      const out = join(dir, 'probe.json');
      const args = [join('tools', 'body-probe.ts'), '--out', out, ...(poses ? [] : ['--no-poses'])];
      await runChild(process.execPath, args, dir);
      const { probe, version } = await readProbe(out);
      checkFormat('body-probe.ts', ref, version, PROBE_FORMAT);
      return probe;
    },
    { parent, prefix: 'body-probe-' },
  );
}

/**
 * Gives the summary of a probe: the counts of the species, the bodies, the players, the demos, and
 * the pose sets, and the SHA-256 of its JSON.
 *
 * @param probe The probe.
 * @param json The JSON of the probe, as `--out` writes it.
 * @returns The lines of the summary.
 */
export function summarize(probe: Probe, json: string): string[] {
  const species = Object.values(probe.species);
  const bodies = species.reduce((sum, supports) => sum + Object.keys(supports).length, 0);
  const demos = Object.values(probe.poses ?? {});
  const sets = demos
    .flatMap((demo) => Object.values(demo.players))
    .reduce((sum, player) => sum + Object.keys(player).length, 0);
  const hash = createHash('sha256').update(json).digest('hex');
  return [
    `species ${species.length}, bodies ${bodies}, players ${Object.keys(probe.players).length}, demos ${demos.length}, pose sets ${sets}`,
    `sha256 of the JSON: ${hash}`,
  ];
}

/**
 * Prints a comparison, and ends the process: with 1 when there is a difference.
 *
 * @param title The first line, or `null` for none.
 * @param comparison The comparison.
 */
function printComparison(title: string | null, comparison: ProbeComparison): never {
  const lines = [...comparison.counts, ...comparison.differences];
  console.log((title ? [title, ...lines] : lines).join('\n'));
  process.exit(comparison.differences.length > 0 ? 1 : 0);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf('--base');
  if (baseAt >= 0) {
    const ref = args[baseAt + 1];
    if (!ref || ref.startsWith('--')) {
      throw new Error('Usage: pnpm body-probe --base <ref>');
    }
    // Both probes end before a failure stops the process, so the temporary folder goes away.
    const [base, next] = await Promise.allSettled([probeRef(ref), runProbe()]);
    if (base.status === 'rejected') {
      throw base.reason;
    }
    if (next.status === 'rejected') {
      throw next.reason;
    }
    printComparison(`base ${ref}, new: the working tree`, compareProbes(base.value, next.value));
  }
  const compare = args.indexOf('--compare');
  if (compare >= 0) {
    const [baseFile, nextFile] = [args[compare + 1], args[compare + 2]];
    if (!baseFile || !nextFile) {
      throw new Error('Usage: pnpm body-probe --compare <base.json> <new.json>');
    }
    const [base, next] = [await readProbe(baseFile), await readProbe(nextFile)];
    if (base.version !== next.version) {
      throw new Error(
        `The probe file ${baseFile} has the format version ${base.version}, and ${nextFile} has the format version ${next.version}. A compare of two formats gives false differences.`,
      );
    }
    printComparison(null, compareProbes(base.probe, next.probe));
  }
  // The JSON is about 1 MB, so only --out writes it. The summary is a few lines.
  const outIndex = args.indexOf('--out');
  const probe: Probe = args.includes('--no-poses') ? probeBodies() : await runProbe();
  const text = probeText(probe);
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  if (out) {
    await writeFile(out, text);
  }
  const next = out ? `Wrote ${out}.` : 'Write the JSON with --out <file>.';
  console.log([...summarize(probe, text), next].join('\n'));
}
