/**
 * Measures the form of the trunk of the first player of a role (`pnpm trunk-form <role>`,
 * `docs/agents/rigging.md`), in the seated bind and in the poses of the sample sets. The
 * frame has its origin at the hips joint, `f` along the line to the neck joint as a share of it,
 * `d` forward square to it, and `x` to the left. Each cut of the trunk across the line between
 * `--from` and `--to` gives four outlines: the left and the right side (the front view), and the
 * belly front and the back (the side view). For each outline: the largest gap to its convex hull
 * (a dent or a pinch), the count of dents deeper than 2 mm, and the largest turn between neighbor
 * cuts (a corner or a lump). For the light patch on the trunk front: the same measures of its
 * soft width on each side, the sum of the light share of each face along the cut, and the angles
 * between the normals of neighbor light faces. A pose takes the frame of its hips bone, so the
 * legs and the seat do not move the measures.
 *
 * Usage: pnpm trunk-form <role> [--sets <set>[@<n>],...] [--demo <id>] [--from <f>] [--to <f>]
 *   [--light <dark>:<light>] [--base <ref>] [--json <file>]
 */
import { writeFileSync } from 'node:fs';

import { Matrix4, Vector3 } from 'three';

import { roleDemos } from './pose-depth.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import { BODY_BONES } from '../src/models/body-format.ts';
import type { BodyMesh } from '../src/models/body-format.ts';
import {
  CLOSED_EYE_SCALE,
  createBodyPose,
  poseBodyBones,
  skinBodyMesh,
  bodyOffsets,
} from '../src/models/body-rig.ts';
import type { BodyRig } from '../src/models/body-rig.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import { sceneOf } from '../src/pose/test-scene.ts';
import type { RoleSweep, SweepPlayer, SweepSample } from '../src/pose/test-sweep.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';
import { clamp01 } from '../src/math.ts';

/** The text of the usage. */
const USAGE = `Usage: pnpm trunk-form <${Object.keys(SWEEP_ROLES).join(' | ')}> [--sets <set>[@<n>],...] [--demo <id>] [--from <f>] [--to <f>] [--light <dark>:<light>] [--base <ref>] [--json <file>]`;

/** The version of the JSON format of `--json`. */
const TRUNK_FORMAT = 1;

/** The number of cuts between `--from` and `--to`, less one. */
const LEVELS = 28;

/** The depth of a dent that the count takes, in meters. */
const DENT = 0.002;

/** The bones of the trunk: a face with more than half of its weight on them is a trunk face. */
const TRUNK_BONES: ReadonlySet<string> = new Set(['hips', 'spine', 'spine1', 'chest']);

/** The outlines of the cuts, in the order of the table. */
const OUTLINES = ['front', 'left', 'right', 'patch left', 'patch right'] as const;

/** An outline of the cuts. */
type OutlineName = (typeof OUTLINES)[number];

/** The options of the command. */
interface Options {
  /** The role. */
  readonly role: RoleSweep;
  /** The sample sets of `--sets`, each with its step: each n-th sample. */
  readonly sets: readonly (readonly [name: string, every: number])[];
  /** The demo of `--demo`, or `null` for the first demo of the role. */
  readonly demo: string | null;
  /** The share of the trunk line at the lowest cut. */
  readonly from: number;
  /** The share of the trunk line at the highest cut. */
  readonly to: number;
  /** The Oklab lightness of the dark fur and of the light patch, for the light share of a face. */
  readonly light: readonly [dark: number, light: number];
  /** The commit of `--base`, or `null`. */
  readonly base: string | null;
  /** The file of `--json`, or `null`. */
  readonly json: string | null;
}

/** The measures of one outline. */
interface OutlineForm {
  /** The largest gap of the outline to its convex hull, in meters. */
  readonly gap: number;
  /** The count of the dents deeper than {@link DENT}. */
  readonly dents: number;
  /** The largest turn of the outline between neighbor cuts, in degrees. */
  readonly turn: number;
}

/** The measures of one row: the bind, or the worst of the samples of a set. */
interface FormRow {
  /** The name of the row: `bind`, or the set with its step. */
  readonly name: string;
  /** The number of the samples. */
  readonly samples: number;
  /** The measures of each outline, by the order of {@link OUTLINES}. */
  readonly outlines: readonly OutlineForm[];
  /** The median, the 90th percentile, and the largest angle between neighbor light faces. */
  readonly facets: readonly [p50: number, p90: number, max: number];
}

/** The mesh of a measure, in the frame of the trunk. */
interface TrunkMesh {
  /** The share `f`, the forward distance `d`, and the left distance `x` of each vertex. */
  readonly local: Float64Array;
  /** The three vertices of each triangle. */
  readonly corners: Uint32Array;
  /** The trunk mask of each triangle. */
  readonly trunk: Uint8Array;
  /** The Oklab lightness of each triangle. */
  readonly lightness: Float64Array;
  /** The length of the trunk line, in meters. */
  readonly length: number;
}

/** The trunk mask and the Oklab lightness of each triangle of a body mesh. */
interface TriangleFacts {
  /** 1 for a triangle with more than half of its weight on {@link TRUNK_BONES}, else 0. */
  readonly trunk: Uint8Array;
  /** The Oklab lightness of the color of each triangle. */
  readonly lightness: Float64Array;
}

/** The outlines of the cuts of the trunk. */
interface CutOutlines {
  /** The places of the cuts along the trunk line, in meters. */
  readonly at: number[];
  /** The values of each outline at the cuts, in meters. */
  readonly values: Map<OutlineName, number[]>;
}

/**
 * Reads the options.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error if an option is not known or a value does not fit.
 */
function parseOptions(args: readonly string[]): Options {
  const [name, ...rest] = args;
  const role = Object.entries(SWEEP_ROLES).find(([key]) => key === name)?.[1];
  if (!role) {
    throw new Error(USAGE);
  }
  let sets: (readonly [string, number])[] = [
    ['rest', 1],
    ['play', 40],
    ['lift', 6],
    ['lower', 4],
  ];
  let demo: string | null = null;
  let from = 0.1;
  let to = 0.8;
  let light: readonly [number, number] = [0.55, 0.88];
  let base: string | null = null;
  let json: string | null = null;
  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${rest[i]}" has no value.\n${USAGE}`);
    }
    switch (rest[i]) {
      case '--sets':
        sets = value.split(',').map((text) => {
          const [set = '', every = '1'] = text.split('@');
          const step = Number(every);
          if (!set || !Number.isInteger(step) || step < 1) {
            throw new Error(`The option --sets takes <set>[@<n>], and not "${text}".`);
          }
          return [set, step] as const;
        });
        break;
      case '--demo':
        demo = value.replace(/\.mid$/, '');
        break;
      case '--from':
      case '--to': {
        const share = Number(value);
        if (!Number.isFinite(share)) {
          throw new Error(`The option ${rest[i]} takes a number, and not "${value}".`);
        }
        if (rest[i] === '--from') {
          from = share;
        } else {
          to = share;
        }
        break;
      }
      case '--light': {
        const [dark, bright] = value.split(':').map(Number);
        if (dark === undefined || bright === undefined || !(bright > dark)) {
          throw new Error(`The option --light takes <dark>:<light>, and not "${value}".`);
        }
        light = [dark, bright];
        break;
      }
      case '--base':
        base = value;
        break;
      case '--json':
        json = value;
        break;
      default:
        throw new Error(`The option "${rest[i]}" is not known.\n${USAGE}`);
    }
  }
  if (!(to > from)) {
    throw new Error(`The option --to (${to}) must be above --from (${from}).`);
  }
  return { role, sets, demo, from, to, light, base, json };
}

/**
 * Gives the Oklab lightness of a linear color.
 *
 * @param r The linear red.
 * @param g The linear green.
 * @param b The linear blue.
 * @returns The lightness, from 0 to 1.
 */
function oklabLightness(r: number, g: number, b: number): number {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  return 0.2104542553 * Math.cbrt(l) + 0.793617785 * Math.cbrt(m) - 0.0040720468 * Math.cbrt(s);
}

/**
 * Gives the trunk mask and the lightness of each triangle of a body mesh.
 *
 * @param mesh The mesh.
 * @returns The trunk mask and the lightness.
 */
function triangleFacts(mesh: BodyMesh): TriangleFacts {
  const count = mesh.corners.length / 3;
  const trunk = new Uint8Array(count);
  const lightness = new Float64Array(count);
  for (let t = 0; t < count; t++) {
    let share = 0;
    for (let k = 0; k < 3; k++) {
      const v = mesh.corners[t * 3 + k] ?? 0;
      for (let j = 0; j < 4; j++) {
        if (TRUNK_BONES.has(BODY_BONES[mesh.joints[v * 4 + j] ?? 0] ?? '')) {
          share += (mesh.weights[v * 4 + j] ?? 0) / 3;
        }
      }
    }
    trunk[t] = share > 0.5 ? 1 : 0;
    lightness[t] = oklabLightness(
      mesh.colors[t * 3] ?? 0,
      mesh.colors[t * 3 + 1] ?? 0,
      mesh.colors[t * 3 + 2] ?? 0,
    );
  }
  return { trunk, lightness };
}

/**
 * Puts the vertices of a mesh into the frame of the trunk: the hips joint, the line to the neck
 * joint, and the forward direction of the nose square to it.
 *
 * @param rig The rig of the body, with its bind joints.
 * @param positions The places of the vertices, in the bind frame of the hips bone, in meters.
 * @param facts The trunk mask and the lightness of each triangle.
 * @returns The mesh in the frame.
 */
function trunkMesh(rig: BodyRig, positions: Float32Array, facts: TriangleFacts): TrunkMesh {
  const hips = new Vector3(...rig.body.heads.hips);
  const up = new Vector3(...rig.body.heads.neck).sub(hips);
  const length = up.length();
  up.normalize();
  const nose = new Vector3(...rig.body.nose).sub(hips);
  const forward = nose.addScaledVector(up, -nose.dot(up)).normalize();
  const left = new Vector3().crossVectors(up, forward);
  const local = new Float64Array(positions.length);
  const p = new Vector3();
  for (let v = 0; v < positions.length / 3; v++) {
    p.fromArray(positions, v * 3).sub(hips);
    local[v * 3] = p.dot(up) / length;
    local[v * 3 + 1] = p.dot(forward);
    local[v * 3 + 2] = p.dot(left);
  }
  return { local, corners: rig.mesh.corners, ...facts, length };
}

/**
 * Gives the outlines of each cut of the trunk faces across the trunk line: the front, the left
 * and the right side, and the soft width of the light patch on each side of the front half.
 *
 * @param mesh The mesh in the frame of the trunk.
 * @param options The options.
 * @returns The places of the cuts along the line, in meters, and the values of each outline.
 */
function cutOutlines(mesh: TrunkMesh, options: Options): CutOutlines {
  const at: number[] = [];
  const values = new Map<OutlineName, number[]>(OUTLINES.map((name) => [name, []]));
  const [dark, bright] = options.light;
  const { local, corners } = mesh;
  for (let k = 0; k <= LEVELS; k++) {
    const level = options.from + ((options.to - options.from) * k) / LEVELS;
    let front = -Infinity;
    let leftSide = -Infinity;
    let rightSide = -Infinity;
    let softLeft = 0;
    let softRight = 0;
    for (let t = 0; t < corners.length / 3; t++) {
      if (!mesh.trunk[t]) {
        continue;
      }
      const ends: [number, number][] = [];
      for (let e = 0; e < 3; e++) {
        const a = corners[t * 3 + e] ?? 0;
        const b = corners[t * 3 + ((e + 1) % 3)] ?? 0;
        const fa = (local[a * 3] ?? 0) - level;
        const fb = (local[b * 3] ?? 0) - level;
        if (fa < 0 !== fb < 0) {
          const r = fa / (fa - fb);
          const d = (local[a * 3 + 1] ?? 0) * (1 - r) + (local[b * 3 + 1] ?? 0) * r;
          const x = (local[a * 3 + 2] ?? 0) * (1 - r) + (local[b * 3 + 2] ?? 0) * r;
          ends.push([d, x]);
        }
      }
      const [p, q] = ends;
      if (!p || !q) {
        continue;
      }
      front = Math.max(front, p[0], q[0]);
      leftSide = Math.max(leftSide, p[1], q[1]);
      rightSide = Math.max(rightSide, -p[1], -q[1]);
      if (p[0] + q[0] > 0) {
        const share = clamp01(((mesh.lightness[t] ?? 0) - dark) / (bright - dark));
        softLeft += share * Math.abs(Math.max(0, p[1]) - Math.max(0, q[1]));
        softRight += share * Math.abs(Math.max(0, -p[1]) - Math.max(0, -q[1]));
      }
    }
    if (front === -Infinity) {
      continue;
    }
    at.push(level * mesh.length);
    const row: Readonly<Record<OutlineName, number>> = {
      front,
      left: leftSide,
      right: rightSide,
      'patch left': softLeft,
      'patch right': softRight,
    };
    for (const name of OUTLINES) {
      values.get(name)?.push(row[name]);
    }
  }
  return { at, values };
}

/**
 * Measures one outline: the largest gap to its upper convex hull, the count of the dents deeper
 * than {@link DENT}, and the largest turn between neighbor cuts.
 *
 * @param at The places of the cuts along the line, in meters.
 * @param values The values of the outline, in meters, larger outward.
 * @returns The measures.
 */
function outlineForm(at: readonly number[], values: readonly number[]): OutlineForm {
  const hull: number[] = [];
  for (let i = 0; i < at.length; i++) {
    for (;;) {
      const a = hull.at(-2);
      const b = hull.at(-1);
      if (a === undefined || b === undefined) {
        break;
      }
      const cross =
        ((at[b] ?? 0) - (at[a] ?? 0)) * ((values[i] ?? 0) - (values[a] ?? 0)) -
        ((values[b] ?? 0) - (values[a] ?? 0)) * ((at[i] ?? 0) - (at[a] ?? 0));
      if (cross < 0) {
        break;
      }
      hull.pop();
    }
    hull.push(i);
  }
  let gap = 0;
  let dents = 0;
  let inDent = false;
  for (let k = 0; k + 1 < hull.length; k++) {
    const a = hull[k] ?? 0;
    const b = hull[k + 1] ?? 0;
    for (let i = a; i <= b; i++) {
      const span = (at[b] ?? 0) - (at[a] ?? 0) || 1;
      const top =
        (values[a] ?? 0) +
        (((values[b] ?? 0) - (values[a] ?? 0)) * ((at[i] ?? 0) - (at[a] ?? 0))) / span;
      const g = top - (values[i] ?? 0);
      gap = Math.max(gap, g);
      if (g > DENT && !inDent) {
        dents += 1;
      }
      inDent = g > DENT;
    }
  }
  let turn = 0;
  for (let i = 1; i + 1 < at.length; i++) {
    const before = Math.atan2(
      (values[i] ?? 0) - (values[i - 1] ?? 0),
      (at[i] ?? 0) - (at[i - 1] ?? 0),
    );
    const after = Math.atan2(
      (values[i + 1] ?? 0) - (values[i] ?? 0),
      (at[i + 1] ?? 0) - (at[i] ?? 0),
    );
    turn = Math.max(turn, (Math.abs(after - before) * 180) / Math.PI);
  }
  return { gap, dents, turn };
}

/**
 * Gives the angles between the normals of neighbor light faces of the trunk front between the
 * cuts: the median, the 90th percentile, and the largest, in degrees.
 *
 * @param mesh The mesh in the frame of the trunk.
 * @param options The options.
 * @returns The three angles.
 */
function facetAngles(mesh: TrunkMesh, options: Options): readonly [number, number, number] {
  const { local, corners } = mesh;
  const cut = (options.light[0] + options.light[1]) / 2;
  const point = (v: number): Vector3 =>
    new Vector3((local[v * 3] ?? 0) * mesh.length, local[v * 3 + 1] ?? 0, local[v * 3 + 2] ?? 0);
  const normals = new Map<number, Vector3>();
  const edges = new Map<string, number[]>();
  for (let t = 0; t < corners.length / 3; t++) {
    const a = corners[t * 3] ?? 0;
    const b = corners[t * 3 + 1] ?? 0;
    const c = corners[t * 3 + 2] ?? 0;
    const pa = point(a);
    const pb = point(b);
    const pc = point(c);
    const middle = pa.clone().add(pb).add(pc).divideScalar(3);
    const inRange = middle.x >= options.from * mesh.length && middle.x <= options.to * mesh.length;
    if (!mesh.trunk[t] || (mesh.lightness[t] ?? 0) < cut || !inRange || middle.y <= 0) {
      continue;
    }
    normals.set(t, pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize());
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      edges.set(key, [...(edges.get(key) ?? []), t]);
    }
  }
  const angles: number[] = [];
  for (const faces of edges.values()) {
    const [s, t] = faces;
    const ns = s === undefined ? undefined : normals.get(s);
    const nt = t === undefined ? undefined : normals.get(t);
    if (faces.length === 2 && ns && nt) {
      angles.push((Math.acos(Math.min(1, Math.max(-1, ns.dot(nt)))) * 180) / Math.PI);
    }
  }
  const sorted = angles.toSorted((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return [at(0.5), at(0.9), sorted.at(-1) ?? 0];
}

/**
 * Measures one mesh: the outlines and the facets.
 *
 * @param mesh The mesh in the frame of the trunk.
 * @param options The options.
 * @returns The measures of each outline and the facet angles.
 */
function measureMesh(mesh: TrunkMesh, options: Options): Omit<FormRow, 'name' | 'samples'> {
  const { at, values } = cutOutlines(mesh, options);
  return {
    outlines: OUTLINES.map((name) => outlineForm(at, values.get(name) ?? [])),
    facets: facetAngles(mesh, options),
  };
}

/**
 * Gives the worst measures of several meshes: the largest of each value.
 *
 * @param rows The measures.
 * @returns The worst measures.
 */
function worstOf(
  rows: readonly Omit<FormRow, 'name' | 'samples'>[],
): Omit<FormRow, 'name' | 'samples'> {
  const facet = (k: number): number => Math.max(...rows.map((row) => row.facets[k] ?? 0));
  return {
    outlines: OUTLINES.map((_, k) => ({
      gap: Math.max(...rows.map((row) => row.outlines[k]?.gap ?? 0)),
      dents: Math.max(...rows.map((row) => row.outlines[k]?.dents ?? 0)),
      turn: Math.max(...rows.map((row) => row.outlines[k]?.turn ?? 0)),
    })),
    facets: [facet(0), facet(1), facet(2)],
  };
}

/**
 * Poses the mesh of a player at a sample, and moves it into the bind frame of its hips bone.
 *
 * @param player The player.
 * @param rig The rig of its body.
 * @param sample The sample.
 * @returns The places of the vertices.
 */
function posedInHips(player: SweepPlayer, rig: BodyRig, sample: SweepSample): Float32Array {
  const posed = poseSkeleton(player.model, player.poseAt(sample));
  const pose = poseBodyBones(
    rig,
    posed.model.skeleton,
    posed.pose.rotations,
    bodyOffsets(posed.pose),
    Math.max(CLOSED_EYE_SCALE, 1 - posed.pose.blink),
    createBodyPose(),
  );
  const out = skinBodyMesh(rig.mesh, pose);
  const back = new Matrix4().fromArray(pose.matrices, BODY_BONES.indexOf('hips') * 16).invert();
  const p = new Vector3();
  for (let v = 0; v < out.length / 3; v++) {
    p.fromArray(out, v * 3)
      .applyMatrix4(back)
      .toArray(out, v * 3);
  }
  return out;
}

/**
 * Measures the trunk of the first player of the role in the first demo of the role, or in the
 * demo of `--demo`: the bind, and the worst of each set.
 *
 * @param options The options.
 * @returns The rows.
 * @throws Error if no demo has the role, or the player has no body.
 */
async function measureRows(options: Options): Promise<FormRow[]> {
  const demos = await roleDemos(options.demo ? [options.demo] : [], [], options.role);
  const [demo] = demos;
  if (!demo) {
    throw new Error(`No demo has the ${options.role.role}.`);
  }
  const scene = sceneOf(demo.bytes);
  const [player] = options.role.players(scene);
  if (!player) {
    throw new Error(`The first ${options.role.role} of ${demo.file} has no player.`);
  }
  const rig = player.model.bodyRig;
  const facts = triangleFacts(rig.mesh);
  const rows: FormRow[] = [
    {
      name: 'bind',
      samples: 1,
      ...measureMesh(trunkMesh(rig, rig.mesh.positions, facts), options),
    },
  ];
  for (const [name, every] of options.sets) {
    const set = options.role.sampleSets(scene).find((s) => s.name === name);
    if (!set) {
      throw new Error(`The ${options.role.role} has no sample set "${name}".`);
    }
    const samples = [...set.samples].filter((_, i) => i % every === 0);
    const measures = samples.map((sample) =>
      measureMesh(trunkMesh(rig, posedInHips(player, rig, sample), facts), options),
    );
    rows.push({
      name: every > 1 ? `${name}@${every}` : name,
      samples: samples.length,
      ...worstOf(measures),
    });
  }
  return rows;
}

/**
 * Gives the lines of the table: one row for each measure, with the value of the commit in
 * parentheses when there is one.
 *
 * @param rows The rows of the working tree.
 * @param base The rows of the commit, or `null`.
 * @returns The lines.
 */
function tableLines(rows: readonly FormRow[], base: readonly FormRow[] | null): string[] {
  const cell = (value: number, old: number | undefined, digits: number): string =>
    old === undefined ? value.toFixed(digits) : `${value.toFixed(digits)} (${old.toFixed(digits)})`;
  const head = ['row', 'samples'];
  for (const name of OUTLINES) {
    head.push(`${name} gap cm`, `${name} dents`, `${name} turn °`);
  }
  head.push('facets p50 °', 'p90 °', 'max °');
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const row of rows) {
    const old = base?.find((b) => b.name === row.name);
    const cells = [row.name, String(row.samples)];
    for (const [k, form] of row.outlines.entries()) {
      const was = old?.outlines[k];
      cells.push(
        cell(form.gap * 100, was === undefined ? undefined : was.gap * 100, 2),
        cell(form.dents, was?.dents, 0),
        cell(form.turn, was?.turn, 1),
      );
    }
    for (const [k, angle] of row.facets.entries()) {
      cells.push(cell(angle, old?.facets[k], 1));
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/** Runs the tool: `node tools/trunk-form.ts <role> [options]`. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const started = performance.now();
  let base: FormRow[] | null = null;
  let rows: FormRow[];
  if (options.base !== null) {
    const tree = withoutOptions(process.argv.slice(2), ['--base']);
    const texts = await probeBeside(
      options.base,
      'trunk-form.ts',
      { base: tree, tree },
      { prefix: 'trunk-form-', cache: true },
    );
    // SAFETY: each text comes from the --json output of this script in a child process.
    rows = (JSON.parse(texts.tree) as { readonly rows: FormRow[] }).rows;
    // SAFETY: as above.
    base = (JSON.parse(texts.base) as { readonly rows: FormRow[] }).rows;
  } else {
    rows = await measureRows(options);
  }
  if (options.json !== null) {
    writeFileSync(options.json, JSON.stringify({ version: TRUNK_FORMAT, rows }));
    return;
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const label =
    options.base === null
      ? ''
      : `, with ${options.base} (${shortHash(options.base)}) in parentheses`;
  console.log(
    `Trunk form of the ${options.role.role} from ${options.from} to ${options.to} of the line from the hips joint to the neck joint${label}: ${seconds} s. A row of a set gives the worst of its samples. The patch is the soft width of the light faces (Oklab ${options.light[0]} to ${options.light[1]}).`,
  );
  console.log(['', ...tableLines(rows, base)].join('\n'));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
