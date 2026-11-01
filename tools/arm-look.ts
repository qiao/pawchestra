/**
 * Measures the look of the arm skin of the studio bodies of mesh rigs against the source mesh
 * (design 4.4, "Upper arm form"): the crumple of the skin of the upper arm and the shoulder, and
 * the section of the upper arm. The fold count of `pnpm fold-probe` and the arm gate do not see a
 * skin that crumples into flaps or an upper arm that reads as a flat plank.
 *
 * The rig script gives the corners of the source face of each face of the module
 * (`face_corners()` of `tools/blender/rig_mesh.py`, `--corners`), in about 2 s for each animal.
 * The region of an arm is each face with a corner on the upper arm, its twist bone, or the
 * clavicle of the side, with a weight of {@link REGION_WEIGHT} or more.
 *
 * - The crease share of a sample is the share of the edges of the region whose fold angle (the
 *   angle between the normals of its two faces) differs from the fold angle of the same edge in the
 *   long-armed source by more than {@link CREASE_ANGLE}. A crumpled skin gives a large share.
 * - The section of a sample is the ratio of the narrow axis to the wide axis of the ring of the
 *   middle of the upper arm of `pnpm arm-shape` ({@link armBinds}), in the plane normal to the
 *   posed bone. A round arm gives about 1, and a flat plank gives less than 0.5.
 *
 * Each value is the median of the play samples. {@link ARM_LOOK_LIMITS} gives the limits, from the
 * red fox, whose arms are accepted as good. A value over its limit is `FAIL`, and the
 * exit code is 1. `--set` changes the holds in memory, as `pnpm fold-probe --set` does. `--glb
 * <file>` gives one role the studio body of the file, with the corners of the rig script that wrote
 * it: the file `<name>.corners.json` beside `<name>.glb` of `pnpm rig-mesh --check --keep`
 * ({@link keptCorners}), or `--corners <file>`.
 *
 * Usage: pnpm arm-look <role>... | --all [--demo <id>]... [--step <seconds>] [--set <changes>]...
 * [--glb <file> --corners <file>]
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Matrix4, Vector3 } from 'three';

import { armBinds } from './arm-shape.ts';
import { FOLD_ROLES, findRole, isRole, probeFolds, roleAnimal } from './fold-probe.ts';
import { rigConfigPath, runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import { keptCorners } from './rig-mesh.ts';
import { setHolds } from './hold-sets.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { trackFolder } from './stop-cleanup.ts';
import { STUDIO_BONES } from '../src/models/studio-format.ts';
import type { Side, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import { UPPER_TWIST_BONES } from '../src/models/studio-rig.ts';
import type { StudioRig } from '../src/models/studio-rig.ts';

/** The smallest weight of a corner on the upper arm or the clavicle that puts a face in a region. */
export const REGION_WEIGHT = 0.05;

/** The change of a fold angle from the source, in degrees, above which an edge is a crease. */
export const CREASE_ANGLE = 40;

/** One limit of {@link ARM_LOOK_LIMITS}. */
export interface ArmLookLimit {
  /** The limit. */
  readonly limit: number;
  /** True when a value above the limit fails, false when a value below it fails. */
  readonly up: boolean;
  /** The source of the limit. */
  readonly source: string;
}

/**
 * The limits of the values, from the red fox (`fox-violinist`): its play medians are 3.5% and
 * 7.3% creases and the sections 0.74 and 0.93, left and right.
 */
export const ARM_LOOK_LIMITS: Readonly<Record<'crease' | 'section', ArmLookLimit>> = {
  crease: { limit: 0.146, up: true, source: 'twice the worst arm of the red fox (7.3%)' },
  section: { limit: 0.44, up: false, source: '0.6 of the worst arm of the red fox (0.74)' },
};

/** The source face of a face of the module: its corners in the source and the long-armed source. */
export interface SourceFace {
  /** The corners in the source, x, y, and z of each one. */
  readonly s: readonly (readonly number[])[];
  /** The corners in the long-armed source. */
  readonly l: readonly (readonly number[])[];
}

/** The bind facts of the region of one arm. */
interface Region {
  /** The faces of the module in the region. */
  readonly faces: readonly number[];
  /** The pairs of indices in {@link faces} of the faces that share an edge. */
  readonly edges: readonly (readonly [number, number])[];
  /** The fold angle of each edge in the long-armed source, in degrees, or NaN with no source. */
  readonly sourceAngles: Float64Array;
}

/** The values of one arm in one sample. */
export interface ArmLookSample {
  /** The share of the edges of the region that crease against the source. */
  readonly crease: number;
  /** The narrow axis of the middle ring of the upper arm as a share of its wide axis. */
  readonly section: number;
}

/** The medians of one arm over the play samples. */
export interface ArmLookValues {
  /** The median crease share. */
  readonly crease: number;
  /** The median section. */
  readonly section: number;
  /** The number of play samples. */
  readonly samples: number;
}

/**
 * Gives the index of a studio bone.
 *
 * @param bone The bone.
 * @returns The index in `STUDIO_BONES`.
 */
function boneAt(bone: StudioBone): number {
  return STUDIO_BONES.indexOf(bone);
}

/**
 * Gives the weight of a vertex on some bones.
 *
 * @param mesh The skin.
 * @param v The vertex.
 * @param bones The indices of the bones.
 * @returns The sum of the weights.
 */
function weightOn(mesh: StudioMesh, v: number, bones: readonly number[]): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    if (bones.includes(mesh.joints[v * 4 + k] ?? -1)) {
      sum += mesh.weights[v * 4 + k] ?? 0;
    }
  }
  return sum;
}

/**
 * Gives the unit normal of a triangle.
 *
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @returns The normal, or a zero vector for a triangle with no area.
 */
function normalOf(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  return new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
}

/**
 * Gives the normal of a face of the module from a list of places.
 *
 * @param places The places, x, y, and z of each vertex.
 * @param corners The three vertices of each face.
 * @param f The face.
 * @returns The normal.
 */
function faceNormal(places: ArrayLike<number>, corners: Uint32Array, f: number): Vector3 {
  const at = (k: number): Vector3 => new Vector3().fromArray(places, (corners[f * 3 + k] ?? 0) * 3);
  return normalOf(at(0), at(1), at(2));
}

/**
 * Gives the normal of a source face.
 *
 * @param face The source face.
 * @returns The normal in the long-armed source.
 */
function sourceNormal(face: SourceFace): Vector3 {
  const [a = [], b = [], c = []] = face.l;
  return normalOf(new Vector3(...a), new Vector3(...b), new Vector3(...c));
}

/**
 * Gives the angle between two unit vectors.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns The angle in degrees.
 */
function angleOf(a: Vector3, b: Vector3): number {
  return (Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180) / Math.PI;
}

/**
 * Finds the region of one arm: the faces of the module with a corner on the upper arm, its twist
 * bone, or the clavicle of the side, and the edges between them.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @param sources The source face of each face of the module, or null.
 * @returns The region.
 */
export function armRegion(
  rig: StudioRig,
  side: Side,
  sources: readonly (SourceFace | null)[],
): Region {
  const { mesh } = rig;
  const bones = [boneAt(`upper_arm_${side}`), UPPER_TWIST_BONES[side], boneAt(`clavicle_${side}`)];
  const faces: number[] = [];
  for (let f = 0; f < mesh.corners.length / 3; f++) {
    const corners = [0, 1, 2].map((k) => mesh.corners[f * 3 + k] ?? 0);
    if (corners.some((v) => weightOn(mesh, v, bones) >= REGION_WEIGHT)) {
      faces.push(f);
    }
  }

  const index = new Map(faces.map((f, i) => [f, i]));
  const byEdge = new Map<number, number[]>();
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const u = mesh.corners[f * 3 + k] ?? 0;
      const v = mesh.corners[f * 3 + ((k + 1) % 3)] ?? 0;
      const key = Math.min(u, v) * 0x10000 + Math.max(u, v);
      byEdge.set(key, [...(byEdge.get(key) ?? []), index.get(f) ?? 0]);
    }
  }
  const edges: [number, number][] = [];
  for (const pair of byEdge.values()) {
    const [i, j] = pair;
    if (pair.length === 2 && i !== undefined && j !== undefined) {
      edges.push([i, j]);
    }
  }

  const sourceAngles = Float64Array.from(edges, ([i, j]) => {
    const a = sources[faces[i] ?? -1];
    const b = sources[faces[j] ?? -1];
    return a && b ? angleOf(sourceNormal(a), sourceNormal(b)) : Number.NaN;
  });
  return { faces, edges, sourceAngles };
}

/**
 * Gives the skin matrix of a bone.
 *
 * @param matrices The skin matrices.
 * @param bone The index of the bone.
 * @returns The matrix.
 */
function matrixOf(matrices: ArrayLike<number>, bone: number): Matrix4 {
  return new Matrix4().fromArray(
    Array.from({ length: 16 }, (...[, k]) => matrices[bone * 16 + k] ?? 0),
  );
}

/**
 * Gives the ratio of the narrow axis to the wide axis of some points in the plane normal to an axis.
 *
 * @param points The points.
 * @param axis The unit axis.
 * @returns The ratio, or 1 for fewer than three points.
 */
export function sectionRatio(points: readonly Vector3[], axis: Vector3): number {
  if (points.length < 3) {
    return 1;
  }
  const e1 = new Vector3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) {
    e1.set(0, 1, 0);
  }
  e1.addScaledVector(axis, -e1.dot(axis)).normalize();
  const e2 = new Vector3().crossVectors(axis, e1);
  const n = points.length;
  const mx = points.reduce((sum, p) => sum + p.dot(e1), 0) / n;
  const my = points.reduce((sum, p) => sum + p.dot(e2), 0) / n;

  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of points) {
    const a = p.dot(e1) - mx;
    const b = p.dot(e2) - my;
    xx += (a * a) / n;
    yy += (b * b) / n;
    xy += (a * b) / n;
  }
  const half = (xx + yy) / 2;
  const root = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  return Math.sqrt(Math.max(0, half - root)) / Math.sqrt(Math.max(1e-12, half + root));
}

/**
 * Measures one arm of a posed body.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @param region The region of the arm ({@link armRegion}).
 * @param matrices The skin matrices of the pose.
 * @param posed The posed places of the vertices.
 * @returns The values.
 */
export function measureArmLook(
  rig: StudioRig,
  side: Side,
  region: Region,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
): ArmLookSample {
  const { corners } = rig.mesh;
  const normals = region.faces.map((f) => faceNormal(posed, corners, f));
  let creases = 0;
  let counted = 0;
  for (const [k, [i, j]] of region.edges.entries()) {
    const source = region.sourceAngles[k] ?? Number.NaN;
    const a = normals[i];
    const b = normals[j];
    if (Number.isNaN(source) || !a || !b) {
      continue;
    }
    counted += 1;
    if (Math.abs(angleOf(a, b) - source) > CREASE_ANGLE) {
      creases += 1;
    }
  }

  const arm = armBinds(rig)[side];
  const shoulder = arm.joints.shoulder.clone().applyMatrix4(matrixOf(matrices, arm.bones.upper));
  const elbow = arm.joints.elbow.clone().applyMatrix4(matrixOf(matrices, arm.bones.fore));
  const axis = elbow.sub(shoulder).normalize();
  const ring = arm.rings.find((r) => r.ring.name === 'upper');
  const points: Vector3[] = [];
  for (let k = 0; k < (ring?.along.length ?? 0); k++) {
    const p = new Vector3().fromArray(posed, (ring?.edges[k * 2] ?? 0) * 3);
    const q = new Vector3().fromArray(posed, (ring?.edges[k * 2 + 1] ?? 0) * 3);
    points.push(p.lerp(q, ring?.along[k] ?? 0));
  }
  return { crease: counted > 0 ? creases / counted : 0, section: sectionRatio(points, axis) };
}

/**
 * Gives the median of some values.
 *
 * @param values The values.
 * @returns The median, or 0 with no value.
 */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

/**
 * Reads the JSON text of the corners of the rig script, with no face of an eye shell: the export
 * drops these faces for the pea eyes, so the other faces keep their order in the module.
 *
 * @param text The text.
 * @returns The source face of each face, or null.
 * @throws Error if the text holds no such list.
 */
export function parseCorners(text: string): (SourceFace | null)[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) {
    throw new Error('The corners file holds no list.');
  }
  const out: (SourceFace | null)[] = [];
  for (const item of value) {
    if (item === 'eye') {
      continue;
    }
    if (item === null) {
      out.push(null);
      continue;
    }
    // SAFETY: the rig script writes each face as an object of two lists of three points.
    out.push(item as SourceFace);
  }
  return out;
}

/**
 * Gives the corners of the source faces of the module of an animal: a run of the rig script of
 * Blender with the config of the working tree and `--corners`, into a temporary folder. Blender
 * comes from the variable `BLENDER`, or from the path.
 *
 * @param animal The animal of the studio body.
 * @returns The source face of each face of the module, or null.
 * @throws Error if the animal has no mesh rig, or if the run fails.
 */
export async function sourceCorners(animal: string): Promise<(SourceFace | null)[]> {
  const config = rigConfigPath(animal);
  if (!existsSync(config)) {
    throw new Error(`The ${animal} has no mesh rig.`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'arm-look-'));
  const release = trackFolder(dir);
  try {
    const file = join(dir, 'corners.json');
    const script = join(import.meta.dirname, 'blender', 'rig_mesh.py');
    const blender = process.env['BLENDER'] ?? 'blender';
    await promisify(execFile)(
      blender,
      [
        '-b',
        '--factory-startup',
        '--python-exit-code',
        '1',
        '--python',
        script,
        '--',
        config,
      ].concat([join(dir, 'rig.glb'), '--corners', file]),
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return parseCorners(await readFile(file, 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
    release();
  }
}

/**
 * Measures both arms of a role over the play samples of its demos.
 *
 * @param role The name of a role of `FOLD_ROLES`, or a recast role (`findRole()`).
 * @param sources The source face of each face of the module, or null.
 * @param demos The demos.
 * @param step The step of the song time of the play, in seconds.
 * @returns The medians of each arm.
 * @throws Error for an unknown role, or when the corners do not fit the module.
 */
export function probeArmLook(
  role: string,
  sources: readonly (SourceFace | null)[],
  demos: readonly DemoFile[],
  step: number,
): Readonly<Record<Side, ArmLookValues>> {
  const source = findRole(role);
  if (!source) {
    throw new Error(`No role has the name ${role}.`);
  }
  const samples: Record<Side, ArmLookSample[]> = { L: [], R: [] };
  const regions = new WeakMap<StudioRig, Readonly<Record<Side, Region>>>();
  probeFolds(
    source,
    demos,
    step,
    (rig, studio, posed) => {
      let found = regions.get(rig);
      if (!found) {
        if (sources.length !== rig.mesh.corners.length / 3) {
          throw new Error(
            `The rig has ${sources.length} faces and the module ${rig.mesh.corners.length / 3}. Rig the config into the module first.`,
          );
        }
        found = { L: armRegion(rig, 'L', sources), R: armRegion(rig, 'R', sources) };
        regions.set(rig, found);
      }
      for (const side of ['L', 'R'] as const) {
        samples[side].push(measureArmLook(rig, side, found[side], studio.matrices, posed));
      }
    },
    ['play'],
  );
  const values = (side: Side): ArmLookValues => ({
    crease: median(samples[side].map((s) => s.crease)),
    section: median(samples[side].map((s) => s.section)),
    samples: samples[side].length,
  });
  return { L: values('L'), R: values('R') };
}

/**
 * Gives the verdict of a value against its limit.
 *
 * @param value The value.
 * @param limit The limit.
 * @returns `FAIL` or `PASS`.
 */
export function lookVerdict(value: number, limit: ArmLookLimit): 'FAIL' | 'PASS' {
  return (limit.up ? value > limit.limit : value < limit.limit) ? 'FAIL' : 'PASS';
}

/**
 * Gives the roles of `--all`: each role of `FOLD_ROLES` whose animal has a mesh rig.
 *
 * @returns The roles.
 */
function meshRoles(): string[] {
  return [...FOLD_ROLES].flatMap(([name, role]) => {
    try {
      return existsSync(rigConfigPath(roleAnimal(role))) ? [name] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Runs the tool from the command line.
 */
async function main(): Promise<void> {
  const { glb, rest: args } = takeGlb(process.argv.slice(2));
  const cornersAt = args.indexOf('--corners');
  // A GLB file of `pnpm rig-mesh --check --keep` has its corners beside it.
  const cornersFile =
    cornersAt >= 0
      ? args[cornersAt + 1]
      : glb && existsSync(keptCorners(glb))
        ? keptCorners(glb)
        : undefined;
  const roles = args.includes('--all')
    ? meshRoles()
    : args.filter((arg, i) => isRole(arg) && !(args[i - 1] ?? '').startsWith('--'));
  if (roles.length === 0) {
    throw new Error(
      `Usage: pnpm arm-look <role>... | --all [--demo <id>]... [--step <seconds>] [--set <changes>]... [--glb <file> --corners <file>], with a role of: ${[...FOLD_ROLES.keys()].join(', ')}, or a recast role <role>@<species>.`,
    );
  }
  if (glb) {
    const [role] = roles;
    const source = role ? findRole(role) : undefined;
    if (roles.length !== 1 || !source || !cornersFile) {
      throw new Error(
        'The option --glb takes one role and the corners of its rig: --corners <file>, or <name>.corners.json beside <name>.glb of pnpm rig-mesh --check --keep.',
      );
    }
    const passed = cornersAt >= 0 ? args : [...args, '--corners', cornersFile];
    process.exitCode = await withGlbBody(roleAnimal(source), glb, (dir) =>
      runTool(dir, 'arm-look.ts', passed),
    );
    return;
  }

  const chosen = args.flatMap((arg, i) =>
    args[i - 1] === '--demo' ? [arg.endsWith('.mid') ? arg : `${arg}.mid`] : [],
  );
  const stepAt = args.indexOf('--step');
  const step = stepAt >= 0 ? Number(args[stepAt + 1]) : 1;
  if (!(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const all = await probeDemos();
  const demos = chosen.length > 0 ? all.filter((demo) => chosen.includes(demo.file)) : all;
  const holds = args.flatMap((arg, i) => (args[i - 1] === '--set' ? [arg] : [])).join(';');
  const changes = holds ? setHolds(holds) : null;
  const byAnimal = new Map<string, (SourceFace | null)[]>();
  const lines: string[] = [];
  let failed = false;
  try {
    for (const role of roles) {
      const source = findRole(role);
      if (!source) {
        continue;
      }
      const animal = roleAnimal(source);
      let sources = byAnimal.get(animal);
      if (!sources) {
        sources = cornersFile
          ? parseCorners(await readFile(cornersFile, 'utf8'))
          : await sourceCorners(animal);
        byAnimal.set(animal, sources);
      }
      const values = probeArmLook(role, sources, demos, step);
      for (const side of ['L', 'R'] as const) {
        const v = values[side];
        if (v.samples === 0) {
          lines.push(`| ${role} | ${side} | 0 | - | - |`);
          continue;
        }
        const crease = lookVerdict(v.crease, ARM_LOOK_LIMITS.crease);
        const section = lookVerdict(v.section, ARM_LOOK_LIMITS.section);
        failed ||= crease === 'FAIL' || section === 'FAIL';
        const mark = (verdict: string): string => (verdict === 'FAIL' ? ' FAIL' : '');
        lines.push(
          `| ${role} | ${side} | ${v.samples} | ${(100 * v.crease).toFixed(1)}%${mark(crease)} | ${v.section.toFixed(2)}${mark(section)} |`,
        );
      }
    }
  } finally {
    changes?.undo();
  }

  if (changes) {
    console.log(`Hold changes: ${changes.text}`);
  }
  console.log(
    `Arm look of ${roles.length} roles, play step ${step} s. Limits: crease share ${100 * ARM_LOOK_LIMITS.crease.limit}% (${ARM_LOOK_LIMITS.crease.source}), section ${ARM_LOOK_LIMITS.section.limit} (${ARM_LOOK_LIMITS.section.source}).`,
  );
  console.log('');
  console.log('| Role | Arm | Play samples | Crease share p50 | Section p50 |');
  console.log('|---|---|---:|---:|---:|');
  console.log(lines.join('\n'));
  if (failed) {
    process.exitCode = 1;
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
