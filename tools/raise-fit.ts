/**
 * Fits one rule of `raise` of a mesh rig config (`tools/mesh-rigs/<animal>.json`) to the folds of
 * some faces of a role (design 4.4, route 3). It poses the studio body of the role over the demos,
 * as `pnpm fold-probe` does, and keeps the keys of one arm in each sample: the turn of the
 * clavicle and of the upper arm in the axes of the chest, of the forearm from the upper arm, and
 * of the paw from the forearm. Over the samples of `--sets` in which one of the faces folds, it
 * prints the mean of each key with its spread, a table of fades with the weight of the shape in
 * each sample set, and a `raise` entry with the turns in the axes of the studio, ready for the
 * config. A rule of a bent wrist (`--bone hand`) turns 10° further than the mean on the same axis,
 * because the pose of a rule in Blender turns over fewer faces than the app at the same turn. The
 * proposed fade is full up to the angle that holds 90% of the folded samples (at least 10°), and
 * ends 10° later.
 *
 * A recast role `<role>@<species>` (`findRole()`) takes the size rule of the cast matrix
 * (`setRecastHolds()` of `tools/recast-scale.ts`), as `pnpm arm-check` does, so that a rule fits
 * the folds of a cell of the matrix.
 *
 * `--json <file>` writes the entry into a file, and
 * `pnpm rig-mesh <animal> --check --set 'raise+=@<file>'` adds it to the list of `raise`.
 *
 * Usage: pnpm raise-fit <role> --faces <list> --side L|R [--bone upper|forearm|hand]
 * [--sets <set>,...] [--demo <id>|all]... [--step <seconds>] [--set <changes>]... [--json <file>]
 * [--glb <file>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Matrix4, Quaternion } from 'three';

import {
  FOLD_ROLES,
  SAMPLE_SETS,
  findRole,
  isRole,
  meanTurn,
  probeFolds,
  roleAnimal,
  turnAngle,
} from './fold-probe.ts';
import type { SampleSet } from './fold-probe.ts';
import { runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { patchedDemos } from './patch-demos.ts';
import { setRecastHolds } from './recast-scale.ts';
import { STUDIO_BONES, STUDIO_RAISES } from '../src/models/studio-format.ts';
import type { Side } from '../src/models/studio-format.ts';
import type { Quat } from '../src/models/tuples.ts';

/** The keys of one arm: the turns that the shapes of `raise` read, and the turn of the clavicle. */
export const ARM_KEYS = ['clavicle', 'upper', 'elbow', 'wrist'] as const;

/** One key of an arm. */
export type ArmKey = (typeof ARM_KEYS)[number];

/** The bone of a rule: the upper arm, the forearm of a bent elbow, or the paw of a bent wrist. */
export type RuleBone = 'upper' | 'forearm' | 'hand';

/** The key of the turn that gives the weight of the shape of each kind of rule. */
export const RULE_KEYS: Readonly<Record<RuleBone, ArmKey>> = {
  upper: 'upper',
  forearm: 'elbow',
  hand: 'wrist',
};

/** The angle by which a rule of a bent wrist turns further than the mean turn, in degrees. */
export const WRIST_FURTHER = 10;

/** The share of the folded samples that the full weight of a proposed fade holds. */
export const FADE_SHARE = 0.9;

/** The angle from the full weight to no weight of a proposed fade, in degrees. */
export const FADE_WIDTH = 10;

/** The step of the angles of a proposed fade, in degrees. */
export const FADE_STEP = 5;

/** The smallest full angle of a proposed fade, in degrees: the angle of the rules of the mouse and of the arms of the elephant. */
export const FADE_MIN = 10;

/** The fades of the table: the fades of the rules of the cat, the mouse, and the elephant. */
export const FADES: readonly (readonly [number, number])[] = [
  [5, 10],
  [5, 25],
  [10, 20],
  [10, 35],
  [20, 40],
  [30, 50],
];

/** The step of the song time of the play by default, in seconds. */
export const RAISE_STEP = 1;

/** One posed sample of the arm. */
export interface ArmSample {
  /** The sample set. */
  readonly set: SampleSet;
  /** True when one of the faces folds in the sample. */
  readonly folded: boolean;
  /** The keys of the arm, in the model axes. */
  readonly keys: Readonly<Record<ArmKey, Quat>>;
}

/** The options of the command. */
export interface RaiseOptions {
  /** The name of the role: a key of `FOLD_ROLES`, or a recast role `<role>@<species>`. */
  readonly role: string;
  /** The faces of the module whose folds the rule must remove. */
  readonly faces: readonly number[];
  /** The arm of the rule. */
  readonly side: Side;
  /** The bone of the rule. */
  readonly bone: RuleBone;
  /** The sample sets whose folds give the mean turns. */
  readonly sets: readonly SampleSet[];
  /** The demos, by the name of the file with `.mid`, or none for all demos. */
  readonly demos: readonly string[];
  /** The step of the song time of the play, in seconds. */
  readonly step: number;
  /** The changes of the holds, separated by `;`, or an empty text. */
  readonly changes: string;
  /** The file of `--json`, into which the tool writes the entry, or `null` for none. */
  readonly json: string | null;
}

/**
 * Converts a turn from the model axes of the app to the axes of the studio, which `raise` of a
 * config takes: the studio body faces the other way, so x and z change their signs.
 *
 * @param turn The turn in the model axes.
 * @returns The turn in the axes of the studio.
 */
export function studioAxes(turn: Quat): Quat {
  return [-turn[0], turn[1], -turn[2], turn[3]];
}

/**
 * Gives the keys of one arm from the skin matrices of a pose: the turns of the clavicle and of the
 * upper arm from the bind pose in the axes of the chest, of the forearm from the upper arm, and of
 * the paw from the forearm (`poseStudioBones()` of `src/models/studio-rig.ts`).
 *
 * @param matrices The skin matrices, 16 numbers for each bone of `STUDIO_BONES`.
 * @param side The arm.
 * @returns The keys, in the model axes.
 */
export function armKeys(matrices: ArrayLike<number>, side: Side): Record<ArmKey, Quat> {
  const m = new Matrix4();
  const turnOf = (name: string): Quaternion => {
    const at = STUDIO_BONES.findIndex((bone) => bone === name) * 16;
    return new Quaternion().setFromRotationMatrix(
      m.fromArray(Array.from({ length: 16 }, (...[, k]) => matrices[at + k] ?? 0)),
    );
  };
  const chest = turnOf('chest').invert();
  const clavicle = turnOf(`clavicle_${side}`);
  const upper = turnOf(`upper_arm_${side}`);
  const fore = turnOf(`forearm_${side}`);
  const hand = turnOf(`hand_${side}`);
  const tuple = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];
  return {
    clavicle: tuple(chest.clone().multiply(clavicle)),
    upper: tuple(chest.clone().multiply(upper)),
    elbow: tuple(upper.clone().invert().multiply(fore)),
    wrist: tuple(fore.clone().invert().multiply(hand)),
  };
}

/**
 * Turns a turn further on its own axis.
 *
 * @param turn The turn.
 * @param degrees The added angle, in degrees.
 * @returns The turn on the same axis with the larger angle.
 */
export function turnFurther(turn: Quat, degrees: number): Quat {
  const sign = turn[3] < 0 ? -1 : 1;
  const [x, y, z, w] = [sign * turn[0], sign * turn[1], sign * turn[2], sign * turn[3]];
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return turn;
  }
  const half = Math.atan2(length, w) + (degrees * Math.PI) / 360;
  const s = Math.sin(half) / length;
  return [x * s, y * s, z * s, Math.cos(half)];
}

/**
 * Gives the weight of a shape at an angle of its key from the turn of the rule, as `raiseWeight()`
 * of `src/models/studio-rig.ts` gives it: 1 up to the first angle of the fade, 0 from the second,
 * and a smooth step between them.
 *
 * @param angle The angle from the turn of the rule, in degrees.
 * @param fade The angles of the fade, in degrees.
 * @returns The weight, from 0 to 1.
 */
export function fadeWeight(angle: number, fade: readonly [number, number]): number {
  const [full, none] = fade;
  const t = Math.min(1, Math.max(0, (none - angle) / (none - full)));
  return t * t * (3 - 2 * t);
}

/**
 * Proposes a fade: the full weight up to the smallest step of {@link FADE_STEP} that holds
 * {@link FADE_SHARE} of the angles of the folded samples from the turn of the rule, at least
 * {@link FADE_MIN}, and no weight {@link FADE_WIDTH} later.
 *
 * @param angles The angle of each folded sample from the turn of the rule, in degrees.
 * @returns The fade, in degrees.
 */
export function proposeFade(angles: readonly number[]): [number, number] {
  const sorted = angles.toSorted((a, b) => a - b);
  const at = Math.max(0, Math.ceil(FADE_SHARE * sorted.length) - 1);
  const full = Math.max(FADE_MIN, Math.ceil((sorted[at] ?? 0) / FADE_STEP) * FADE_STEP);
  return [full, full + FADE_WIDTH];
}

/**
 * Rounds the parts of a turn to 4 decimals, as the configs write them.
 *
 * @param turn The turn.
 * @returns The rounded turn.
 */
function rounded(turn: Quat): Quat {
  const r = (v: number): number => Math.round(v * 10_000) / 10_000 + 0;
  return [r(turn[0]), r(turn[1]), r(turn[2]), r(turn[3])];
}

/**
 * Gives the angle of a turn from the bind pose.
 *
 * @param turn The turn.
 * @returns The angle, in degrees.
 */
function fromBind(turn: Quat): number {
  return turnAngle(turn, [0, 0, 0, 1]);
}

/** The result of a fit: the lines to print and the entry of the config. */
export interface RaiseFit {
  /** The lines of the report. */
  readonly lines: readonly string[];
  /** The `raise` entry, or `null` when no sample of the sets folds. */
  readonly entry: object | null;
}

/**
 * Fits a rule to the samples of an arm: the mean keys of the folded samples of the sets, the
 * table of fades, and the entry of the config.
 *
 * @param samples The samples of all sample sets.
 * @param options The options of the command.
 * @returns The lines and the entry.
 */
export function fitRaise(samples: readonly ArmSample[], options: RaiseOptions): RaiseFit {
  const chosen = samples.filter((s) => options.sets.includes(s.set));
  const folded = chosen.filter((s) => s.folded);
  const share = (100 * folded.length) / Math.max(1, chosen.length);
  const lines = [
    `Faces ${options.faces.join(', ')} of the ${options.role}, arm ${options.side}, sets ${options.sets.join(', ')}: ${chosen.length} samples, ${folded.length} with a fold (${share.toFixed(1)}%).`,
  ];
  if (folded.length === 0) {
    return {
      lines: [...lines, 'No sample of the sets folds, so the tool gives no rule.'],
      entry: null,
    };
  }

  const meanOf = (key: ArmKey): Quat => meanTurn(folded.map((s) => s.keys[key])) ?? [0, 0, 0, 1];
  const means: Record<ArmKey, Quat> = {
    clavicle: meanOf('clavicle'),
    upper: meanOf('upper'),
    elbow: meanOf('elbow'),
    wrist: meanOf('wrist'),
  };
  lines.push(
    '',
    '| Key | Mean turn (studio axes) | From the bind | Mean spread of the folds |',
    '|---|---|---:|---:|',
    ...ARM_KEYS.map((key) => {
      const spread =
        folded.reduce((sum, s) => sum + turnAngle(s.keys[key], means[key]), 0) / folded.length;
      return `| ${key} | [${rounded(studioAxes(means[key])).join(', ')}] | ${fromBind(means[key]).toFixed(1)}° | ${spread.toFixed(1)}° |`;
    }),
  );

  const key = RULE_KEYS[options.bone];
  const turn = options.bone === 'hand' ? turnFurther(means.wrist, WRIST_FURTHER) : means[key];
  const angles = folded.map((s) => turnAngle(s.keys[key], turn));
  const fade = proposeFade(angles);
  const fades = [fade, ...FADES.filter(([a, b]) => a !== fade[0] || b !== fade[1])];
  const cell = (set: SampleSet, pair: readonly [number, number]): string => {
    const list = samples.filter((s) => s.set === set);
    const weights = list.map((s) => fadeWeight(turnAngle(s.keys[key], turn), pair));
    const strong = list.filter((...[, k]) => (weights[k] ?? 0) > 0.5);
    const any = weights.filter((w) => w > 0).length;
    return `${strong.length} (${strong.filter((s) => s.folded).length}) / ${any} / ${list.filter((s) => s.folded).length} of ${list.length}`;
  };
  lines.push(
    '',
    `The weight of the shape in each sample set, by the angle of the key ${key} from the turn of the rule. A cell gives the samples with a weight above 0.5 (with a fold of the faces in parentheses), the samples with a weight above 0, and the samples with a fold of the faces. The first row is the proposed fade.`,
    '',
    `| Fade | ${SAMPLE_SETS.join(' | ')} |`,
    `|---|${SAMPLE_SETS.map(() => '---').join('|')}|`,
    ...fades.map(
      (pair) =>
        `| ${pair[0]}° to ${pair[1]}° | ${SAMPLE_SETS.map((set) => cell(set, pair)).join(' | ')} |`,
    ),
  );

  const studio = (q: Quat): Quat => rounded(studioAxes(q));
  const turns =
    options.bone === 'hand'
      ? { hand: studio(turn) }
      : {
          clavicle: studio(means.clavicle),
          upper_arm: studio(means.upper),
          forearm: studio(means.elbow),
        };
  const kind =
    options.bone === 'hand'
      ? 'bent wrist'
      : options.bone === 'forearm'
        ? 'bent elbow'
        : 'raised arm';
  const note = `The shape of the ${kind} ${options.side} of the ${options.role} (pnpm raise-fit). Faces ${options.faces.join(', ')} fold in ${folded.length} of ${chosen.length} samples of the sets ${options.sets.join(', ')}, and the key ${key} turns ${fromBind(means[key]).toFixed(1)} degrees from the bind in their mean.${options.bone === 'hand' ? ` The rule turns ${WRIST_FURTHER} degrees further on the same axis.` : ''}`;
  // The config writes the bone after the side, and a rule of the upper arm has no bone.
  const head =
    options.bone === 'upper' ? { side: options.side } : { side: options.side, bone: options.bone };
  const entry = {
    ...head,
    turns,
    fade,
    below: options.bone === 'upper' ? 0.0 : 0.3,
    note,
  };
  lines.push(
    '',
    `The mean turn of the paw from the forearm is [${studio(means.wrist).join(', ')}]. A rule of a raised arm or a bent elbow can add it as turns.hand, so that its pose bends the wrist as in the samples.`,
    '',
    'The entry of raise:',
    '',
    JSON.stringify(entry, null, 2),
  );
  return { lines, entry };
}

/**
 * Reads the arguments of the command.
 *
 * @param args The arguments, with no `--glb`.
 * @returns The options.
 * @throws Error if an argument is missing or does not fit.
 */
export function parseRaiseArgs(args: readonly string[]): RaiseOptions {
  const role = args[0] ?? '';
  const usage = `Usage: pnpm raise-fit <role> --faces <list> --side L|R [--bone upper|forearm|hand] [--sets <set>,...] [--demo <id>|all]... [--step <seconds>] [--set <changes>]... [--json <file>] [--glb <file>], with a role of: ${[...FOLD_ROLES.keys()].join(', ')}, or a recast role <role>@<species>.`;
  if (!isRole(role)) {
    throw new Error(usage);
  }
  const values = (name: string): string[] =>
    args.flatMap((arg, i) => (args[i - 1] === name ? [arg] : []));
  const value = (name: string): string | undefined => values(name).at(-1);

  const faces = (value('--faces') ?? '')
    .split(',')
    .filter((f) => f !== '')
    .map(Number);
  if (faces.length === 0 || faces.some((f) => !Number.isInteger(f) || f < 0)) {
    throw new Error('The option --faces takes a list of face indices, such as 959,960.');
  }
  const side = value('--side');
  if (side !== 'L' && side !== 'R') {
    throw new Error('The option --side takes L or R.');
  }
  const bone = value('--bone') ?? 'upper';
  if (bone !== 'upper' && bone !== 'forearm' && bone !== 'hand') {
    throw new Error('The option --bone takes upper, forearm, or hand.');
  }
  const sets = (value('--sets') ?? 'play').split(',');
  const known = (set: string): set is SampleSet => SAMPLE_SETS.some((s) => s === set);
  if (!sets.every(known)) {
    throw new Error(`The option --sets takes a list of ${SAMPLE_SETS.join(', ')}.`);
  }
  const demos = values('--demo')
    .filter((id) => id !== 'all')
    .map((id) => (id.endsWith('.mid') ? id : `${id}.mid`));
  const step = Number(value('--step') ?? RAISE_STEP);
  if (!(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const json = value('--json') ?? null;
  return { role, faces, side, bone, sets, demos, step, changes: values('--set').join(';'), json };
}

/**
 * Poses the studio body of the role over the demos, and keeps the keys of the arm and the folds of
 * the faces in each sample.
 *
 * @param options The options of the command.
 * @returns The samples of all sample sets.
 * @throws Error if a demo has an unknown name.
 */
export async function armSamples(options: RaiseOptions): Promise<ArmSample[]> {
  const role = findRole(options.role);
  if (!role) {
    throw new Error(`No role has the name ${options.role}.`);
  }
  const all = await patchedDemos();
  const unknown = options.demos.filter((file) => !all.some((demo) => demo.file === file));
  if (unknown.length > 0) {
    throw new Error(`No demo has the name ${unknown.join(', ')}.`);
  }
  const demos =
    options.demos.length > 0 ? all.filter((demo) => options.demos.includes(demo.file)) : all;
  const faces = new Set(options.faces);
  const samples: ArmSample[] = [];
  const recast = role.kind === 'player' && role.recast !== undefined;
  const changes = recast
    ? setRecastHolds([options.role], options.changes)
    : options.changes
      ? setHolds(options.changes)
      : null;
  try {
    probeFolds(role, demos, options.step, (...[, studio, , folded, set]) => {
      samples.push({
        set,
        folded: folded.some((face) => faces.has(face)),
        keys: armKeys(studio.matrices, options.side),
      });
    });
  } finally {
    changes?.undo();
  }
  return samples;
}

/**
 * Runs the command. With `--glb <file>`, the role gets the studio body that the export makes from
 * the file, in a copy of `src/` (`tools/glb-swap.ts`).
 */
async function main(): Promise<void> {
  const { glb, rest } = takeGlb(process.argv.slice(2));
  const options = parseRaiseArgs(rest);
  if (glb) {
    const role = findRole(options.role);
    if (role) {
      process.exitCode = await withGlbBody(roleAnimal(role), glb, (dir) =>
        runTool(dir, 'raise-fit.ts', rest),
      );
    }
    return;
  }
  const started = performance.now();
  const samples = await armSamples(options);
  if (options.changes) {
    console.log(`Hold changes: ${options.changes}`);
  }
  if (findRole(options.role)?.kind === 'player' && options.role.includes('@')) {
    console.log('The recast role takes the size rule of the cast matrix (tools/recast-scale.ts).');
  }
  const fit = fitRaise(samples, options);
  console.log(fit.lines.join('\n'));
  const free = freeRaises(options.role);
  if (free) {
    console.log(`\n${free}`);
  }
  if (options.json !== null) {
    console.log(`\n${writeEntry(options.json, fit, options.role)}`);
  }
  console.log(`\nRun time ${((performance.now() - started) / 1000).toFixed(1)} s.`);
}

/**
 * Counts the rules of `raise` in a config of a mesh rig: a list of rules, one rule as an object, or
 * none.
 *
 * @param text The JSON text of the config.
 * @returns The count.
 */
export function raiseCount(text: string): number {
  // SAFETY: a config file of tools/mesh-rigs/ holds one JSON object, and only `raise` is read.
  const config = JSON.parse(text) as { readonly raise?: unknown };
  if (Array.isArray(config.raise)) {
    return config.raise.length;
  }
  return config.raise instanceof Object ? 1 : 0;
}

/**
 * Writes how many shapes of `raise` the body of a role has free: the limit of a body
 * (`STUDIO_RAISES`, `RAISE_LIMIT` of `tools/blender/rig_mesh.py`) less the rules of its config.
 *
 * @param role The name of the role.
 * @returns The line, or `null` when the animal of the role has no config next to this script, as
 *   in the copy of `--glb`.
 */
function freeRaises(role: string): string | null {
  const source = findRole(role);
  const animal = source ? roleAnimal(source) : '';
  const path = join(import.meta.dirname, 'mesh-rigs', `${animal}.json`);
  if (!animal || !existsSync(path)) {
    return null;
  }
  const count = raiseCount(readFileSync(path, 'utf8'));
  const free = Math.max(0, STUDIO_RAISES - count);
  const full = free === 0 ? ' A new rule must take the place of a rule of the config.' : '';
  return `Shapes: tools/mesh-rigs/${animal}.json has ${count} rules of raise, and a body has at most ${STUDIO_RAISES} (STUDIO_RAISES, RAISE_LIMIT of tools/blender/rig_mesh.py), so ${free} are free.${full}`;
}

/**
 * Writes the entry of a fit into the file of `--json`, as JSON text that
 * `pnpm rig-mesh <animal> --check --set 'raise+=@<file>'` adds to the list of `raise`.
 *
 * @param file The file.
 * @param fit The fit, with no entry when no sample of the sets folds.
 * @param role The name of the role, for the animal of the command.
 * @returns The line that tells what the tool wrote.
 */
function writeEntry(file: string, fit: RaiseFit, role: string): string {
  const { entry } = fit;
  if (!entry) {
    return `No entry, so the tool writes no file ${file}.`;
  }
  writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
  const source = findRole(role);
  const animal = source ? roleAnimal(source) : '<animal>';
  return `Wrote the entry to ${file}. Check it with: pnpm rig-mesh ${animal} --check --set 'raise+=@${file}'`;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
