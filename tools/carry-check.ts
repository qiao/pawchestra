/**
 * Measures the carry of a bowed instrument in the left paw, in each lift and each lowering of the
 * roles with a carried instrument: the violin and the viola (design 5.2). At each step of
 * {@link MOVE_STEP} of each move of `demoMoves()` of `tools/arm-check.ts`, it compares the turn of
 * the instrument with the turn of the left paw (the studio bone `hand_L`). A rigid carry turns the
 * two together. For each role, it prints:
 *
 * - the fast steps, in which both turn faster than {@link FAST_TURN}, and the count of those in
 *   which the two turn axes are more than {@link OPPOSED_ANGLE} apart (opposite senses);
 * - the largest angle between the two turn axes in a fast step, with its move;
 * - the turn of the instrument in the paw over one move, as the largest path (the sum of the step
 *   turns) and the largest net turn (from the first to the last step);
 * - the largest detour of the instrument in the stage over one move, with its move: the largest
 *   sum of the turn from the first step to a step and the turn from that step to the last step,
 *   less the turn from the first step to the last step. A turn on the short arc has a detour near
 *   0°. A turn the long way round, such as a viola that swings upside down on its way to the jaw,
 *   has a large detour.
 *
 * With `--base <ref>`, the commit and the working tree run at the same time, each in a child
 * process (`probeBeside()` of `tools/ref-tree.ts`), and each value of the commit follows in
 * parentheses. The cache by tree keeps the JSON text of the commit. `--set` changes the holds of
 * the working tree only.
 *
 * Usage: pnpm carry-check <role,...> [--demo <id>]... [--set <changes>] [--base <ref>]
 *        [--json <file>]
 */
import { writeFileSync } from 'node:fs';

import { Quaternion, Vector3 } from 'three';

import { MOVE_STEP, demoMoves } from './arm-check.ts';
import { turnOf } from './bone-turns.ts';
import { FOLD_ROLES, findRole, isRole, roleBodies, roleScene } from './fold-probe.ts';
import { setHolds } from './hold-sets.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import { boneIndex } from '../src/models/rig.ts';
import { STUDIO_BONES } from '../src/models/studio-format.ts';
import { createStudioPose, poseStudioBones, studioOffsets } from '../src/models/studio-rig.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { LIFT_FIT_SEC, LOWER_MAX_SEC } from '../src/pose/rest.ts';
import { PLAYING, allAudible } from '../src/pose/test-scene.ts';
import type { Transport } from '../src/pose/types.ts';

/** The usage text of `pnpm carry-check`. */
const USAGE =
  'Usage: pnpm carry-check <role,...> [--demo <id>]... [--set <changes>] [--base <ref>] [--json <file>]';

/** The instruments that the left paw carries in the lift and in the lowering. */
const CARRIED: ReadonlySet<InstrumentId> = new Set(['violin', 'viola']);

/** The turn rate above which a step of the instrument or of the paw is fast, in degrees per second. */
const FAST_TURN = 20;

/**
 * The angle between the turn axes of a fast step above which the instrument and the paw turn in
 * opposite senses, in degrees.
 */
const OPPOSED_ANGLE = 90;

/** The format version of the JSON text of `--json` (`probeFormat()` of `tools/ref-tree.ts`). */
const CARRY_FORMAT = 2;

/**
 * The oldest format version whose fields {@link CARRY_FORMAT} keeps: the version 2 only adds the
 * turn of the instrument in the stage.
 */
const CARRY_SINCE = 1;

/** The values of one lift or one lowering of one body. */
interface MoveCarry {
  /** The file of the demo, such as `bach-bwv1047.mid`. */
  readonly demo: string;
  /** The kind of the move. */
  readonly kind: 'lift' | 'lower';
  /** The song time of the pause point of the move, in seconds: 0 for the lift at the start. */
  readonly at: number;
  /** The steps in which the instrument and the paw both turn faster than {@link FAST_TURN}. */
  readonly fast: number;
  /** The fast steps whose turn axes are more than {@link OPPOSED_ANGLE} apart. */
  readonly opposed: number;
  /** The largest angle between the turn axes in a fast step, in degrees, or 0 with none. */
  readonly angle: number;
  /** The sum of the step turns of the instrument in the paw, in degrees. */
  readonly path: number;
  /** The turn of the instrument in the paw from the first to the last step, in degrees. */
  readonly net: number;
  /**
   * The turn of the instrument in the stage from the first to the last step, in degrees. A text of
   * the format version 1 does not have it.
   */
  readonly turn?: number;
  /**
   * The largest detour of the instrument in the stage from the short arc of the move, in degrees
   * ({@link detourOf}). A text of the format version 1 does not have it.
   */
  readonly detour?: number;
}

/** The moves of one role, as the JSON text of `--json` holds them. */
interface RoleCarry {
  /** The role, such as `violist`. */
  readonly role: string;
  /** The moves of each body of the role in each demo, in their order. */
  readonly moves: readonly MoveCarry[];
}

/** The values of one role over all its moves. */
interface CarrySummary {
  /** The number of moves. */
  readonly moves: number;
  /** The sum of the fast steps. */
  readonly fast: number;
  /** The sum of the fast steps in opposite senses. */
  readonly opposed: number;
  /** The largest angle between the turn axes in a fast step, in degrees. */
  readonly angle: number;
  /** The move of the largest angle, or `null` with no move. */
  readonly worst: MoveCarry | null;
  /** The largest path of the instrument in the paw over one move, in degrees. */
  readonly path: number;
  /** The largest net turn of the instrument in the paw over one move, in degrees. */
  readonly net: number;
  /**
   * The move of the largest detour of the instrument in the stage, or `null` when no move has a
   * detour (a text of the format version 1).
   */
  readonly detour: MoveCarry | null;
}

/** The command line of `pnpm carry-check`. */
interface CarryArgs {
  /** The roles, in their order. */
  readonly roles: readonly string[];
  /** The demos of `--demo`, with no `.mid`, or none for all demos and tool scores. */
  readonly demos: readonly string[];
  /** The hold changes of `--set` for the working tree, or `null`. */
  readonly holds: string | null;
  /** The commit, the branch, or the tag of `--base`, or `null`. */
  readonly base: string | null;
  /** The file of `--json`, or `null`. */
  readonly json: string | null;
}

/**
 * Gives the roles with a carried instrument: the roles of `FOLD_ROLES` of `tools/fold-probe.ts`
 * whose instrument is in {@link CARRIED}.
 *
 * @returns The roles, in the order of the table.
 */
function carryRoles(): string[] {
  return [...FOLD_ROLES]
    .filter(([, source]) => source.kind === 'player' && CARRIED.has(source.instrument))
    .map(([role]) => role);
}

/**
 * Tells if a role carries its instrument: a role of {@link carryRoles}, or a recast role
 * (`findRole()` of `tools/fold-probe.ts`) with an instrument of {@link CARRIED}.
 *
 * @param role The name of the role.
 * @returns True for a role with a carried instrument.
 */
function carries(role: string): boolean {
  const source = isRole(role) ? findRole(role) : undefined;
  return source?.kind === 'player' && CARRIED.has(source.instrument);
}

/**
 * Reads the command line of `pnpm carry-check`.
 *
 * @param args The arguments after the script.
 * @returns The command line.
 * @throws Error with the usage for a missing role list, an unknown option, or an option with no
 *   value, and an error that lists the roles for a role with no carried instrument or a role that
 *   comes two times. `--base` and `--json` do not go together.
 */
function carryArgs(args: readonly string[]): CarryArgs {
  const [list = '', ...rest] = args;
  if (list === '' || list.startsWith('--')) {
    throw new Error(USAGE);
  }
  const roles = list.split(',').map((role) => role.trim());
  const known = carryRoles();
  const wrong = roles.filter((role, i) => !carries(role) || roles.indexOf(role) !== i);
  if (wrong.length > 0) {
    throw new Error(
      `The roles ${wrong.join(', ')} are not roles with a carried instrument, or come two times. The roles are: ${known.join(', ')}, and their recast roles <role>@<species>.`,
    );
  }

  const demos: string[] = [];
  let holds: string | null = null;
  let base: string | null = null;
  let json: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i] ?? '';
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option "${flag}" has no value, or is not an option.\n${USAGE}`);
    }
    i++;
    switch (flag) {
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--set':
        holds = holds === null ? value : `${holds};${value}`;
        break;
      case '--base':
        base = value;
        break;
      case '--json':
        json = value;
        break;
      default:
        throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  if (base !== null && json !== null) {
    throw new Error(`The options --base and --json do not go together.\n${USAGE}`);
  }
  return { roles, demos, holds, base, json };
}

/**
 * Gives the angular velocity in the world from one turn to the next.
 *
 * @param from The first turn.
 * @param to The next turn.
 * @param dt The time between them, in seconds.
 * @returns The axis of the turn, scaled by the rate in degrees per second.
 */
function angularVelocity(from: Quaternion, to: Quaternion, dt: number): Vector3 {
  const step = to.clone().multiply(from.clone().invert());
  if (step.w < 0) {
    step.set(-step.x, -step.y, -step.z, -step.w);
  }
  const angle = 2 * Math.acos(Math.min(1, step.w));
  const sin = Math.sqrt(Math.max(0, 1 - step.w * step.w));
  if (sin < 1e-9) {
    return new Vector3();
  }
  const axis = new Vector3(step.x / sin, step.y / sin, step.z / sin);
  return axis.multiplyScalar((angle * 180) / Math.PI / dt);
}

/**
 * Gives the angle between two turns, in degrees. A quaternion and its negative give one turn.
 *
 * @param a The first turn.
 * @param b The second turn.
 * @returns The angle, from 0° to 180°.
 */
function turnDegrees(a: Quaternion, b: Quaternion): number {
  return (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;
}

/** The turns of one step of a move, in the axes of the stage. */
interface CarryStep {
  /** The turn of the left paw. */
  readonly held: Quaternion;
  /** The turn of the instrument. */
  readonly carried: Quaternion;
}

/** The values of {@link MoveCarry} that the steps of a move give. */
type StepValues = Omit<MoveCarry, 'demo' | 'kind' | 'at'>;

/**
 * Gives the largest detour of a turn path from its short arc: the largest sum of the turn from the
 * first turn to a turn and the turn from that turn to the last turn, less the turn from the first
 * turn to the last turn.
 *
 * @param turns The turns, in their order.
 * @returns The detour, in degrees, or 0 with fewer than two turns.
 */
function detourOf(turns: readonly Quaternion[]): number {
  const [first] = turns;
  const last = turns.at(-1);
  if (!first || !last) {
    return 0;
  }
  const direct = turnDegrees(first, last);
  return Math.max(0, ...turns.map((q) => turnDegrees(first, q) + turnDegrees(q, last) - direct));
}

/**
 * Measures the carry over the steps of one move.
 *
 * @param steps The turns of each step, in their order, at steps of {@link MOVE_STEP}.
 * @returns The fast steps, the opposed steps, the largest angle, and the path and the net turn
 *   of the instrument in the paw.
 */
function stepsCarry(steps: readonly CarryStep[]): StepValues {
  const inPaw = steps.map((step) => step.held.clone().invert().multiply(step.carried));
  let fast = 0;
  let opposed = 0;
  let angle = 0;
  let path = 0;
  for (const [k, step] of steps.entries()) {
    const before = steps[k - 1];
    const turnBefore = inPaw[k - 1];
    const turnNow = inPaw[k];
    if (!before || !turnBefore || !turnNow) {
      continue;
    }
    path += turnDegrees(turnBefore, turnNow);
    const turnI = angularVelocity(before.carried, step.carried, MOVE_STEP);
    const turnP = angularVelocity(before.held, step.held, MOVE_STEP);
    if (turnI.length() > FAST_TURN && turnP.length() > FAST_TURN) {
      const apart = (turnI.angleTo(turnP) * 180) / Math.PI;
      fast++;
      angle = Math.max(angle, apart);
      opposed += apart > OPPOSED_ANGLE ? 1 : 0;
    }
  }

  const [first] = inPaw;
  const last = inPaw.at(-1);
  const carried = steps.map((step) => step.carried);
  const [start] = carried;
  const end = carried.at(-1);
  return {
    fast,
    opposed,
    angle,
    path,
    net: first && last ? turnDegrees(first, last) : 0,
    turn: start && end ? turnDegrees(start, end) : 0,
    detour: detourOf(carried),
  };
}

/**
 * Measures the carry of one role in each lift and each lowering of the demos. A lift starts from
 * the rest pose and takes {@link LIFT_FIT_SEC}. A lowering starts after the hold of the play pose
 * at its pause point, and takes the hold and {@link LOWER_MAX_SEC}, as in `probeMoves()` of
 * `tools/arm-check.ts`.
 *
 * @param role The role, with a carried instrument.
 * @param demos The demos. A demo with no body of the role adds nothing.
 * @returns The moves of each body in each demo.
 * @throws Error if the role has no carried instrument.
 */
function measureCarry(role: string, demos: readonly DemoFile[]): MoveCarry[] {
  const source = findRole(role);
  if (source?.kind !== 'player' || !CARRIED.has(source.instrument)) {
    throw new Error(`The role ${role} has no carried instrument.`);
  }
  const instrument = STUDIO_BONES.length + boneIndex('instrument');
  const paw = STUDIO_BONES.indexOf('hand_L');
  const studio = createStudioPose();

  const moves: MoveCarry[] = [];
  for (const demo of demos) {
    const scene = roleScene(source, demo.bytes);
    const audible = allAudible(scene.score);
    const buffer = createScenePose(scene.plan);
    for (const { index, model } of roleBodies(source, scene)) {
      if (index === null) {
        continue;
      }
      const rig = model.studio;
      for (const move of demoMoves(scene.score.durationSec)) {
        const lead = countInAt(scene.plan.beats, move.at).lengthSec;
        const transport: Transport =
          move.kind === 'lift'
            ? { ...PLAYING, changedAtWall: 10, startSec: move.at }
            : { ...PLAYING, playing: false, changedAtWall: 10, before: PLAYING };
        const span = move.kind === 'lift' ? LIFT_FIT_SEC : transport.holdSec + LOWER_MAX_SEC;
        const from = move.kind === 'lift' ? 0 : transport.holdSec;
        const count = Math.round((span - from) / MOVE_STEP) + 1;
        const steps: CarryStep[] = [];
        for (let k = 0; k < count; k++) {
          const wall = from + k * MOVE_STEP;
          const song = move.kind === 'lift' ? Math.min(move.at, move.at - lead + wall) : move.at;
          const frame = poseAt(scene.plan, song, 10 + wall, transport, audible, buffer);
          const pose = frame.players[index];
          if (pose) {
            poseStudioBones(rig, model.skeleton, pose.rotations, studioOffsets(pose), 1, studio);
            steps.push({
              held: turnOf(studio.matrices, paw),
              carried: turnOf(studio.matrices, instrument),
            });
          }
        }
        moves.push({ demo: demo.file, kind: move.kind, at: move.at, ...stepsCarry(steps) });
      }
    }
  }
  return moves;
}

/**
 * Sums the moves of one role.
 *
 * @param moves The moves.
 * @returns The sums and the largest values.
 */
function carrySummary(moves: readonly MoveCarry[]): CarrySummary {
  let worst: MoveCarry | null = null;
  let detour: MoveCarry | null = null;
  for (const move of moves) {
    if (!worst || move.angle > worst.angle) {
      worst = move;
    }
    if (move.detour !== undefined && (!detour || move.detour > (detour.detour ?? 0))) {
      detour = move;
    }
  }
  return {
    moves: moves.length,
    fast: moves.reduce((sum, move) => sum + move.fast, 0),
    opposed: moves.reduce((sum, move) => sum + move.opposed, 0),
    angle: worst?.angle ?? 0,
    worst,
    path: Math.max(0, ...moves.map((move) => move.path)),
    net: Math.max(0, ...moves.map((move) => move.net)),
    detour,
  };
}

/**
 * Writes the table of the roles, with each value of the commit in parentheses.
 *
 * @param tree The roles of the working tree.
 * @param base The roles of the commit, or `null` with no `--base`.
 * @returns The lines.
 */
function carryLines(tree: readonly RoleCarry[], base: readonly RoleCarry[] | null): string[] {
  const degrees = (value: number): string => `${value.toFixed(0)}°`;
  const lines = [
    `| Role | Moves | Steps >${OPPOSED_ANGLE}° of the fast steps | Largest angle | Turn in the paw: path | Turn in the paw: net | Move of the largest angle | Detour in the stage | Move of the largest detour |`,
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const own of tree) {
    const now = carrySummary(own.moves);
    const old = base ? carrySummary(base.find((b) => b.role === own.role)?.moves ?? []) : null;
    const pair = (text: (s: CarrySummary) => string): string =>
      old ? `${text(now)} (${text(old)})` : text(now);
    const moveName = (move: MoveCarry | null): string =>
      move ? `${move.demo.replace(/\.mid$/, '')} ${move.kind} ${move.at.toFixed(1)} s` : '-';
    // The detour of a move, with the turn of its short arc: `-` for a text of the version 1.
    const detour = (s: CarrySummary): string =>
      s.detour ? `${degrees(s.detour.detour ?? 0)} of ${degrees(s.detour.turn ?? 0)}` : '-';
    const cells = [
      own.role,
      pair((s) => String(s.moves)),
      pair((s) => `${s.opposed} of ${s.fast}`),
      pair((s) => degrees(s.angle)),
      pair((s) => degrees(s.path)),
      pair((s) => degrees(s.net)),
      moveName(now.worst),
      pair(detour),
      moveName(now.detour),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Measures each role of the command line on the working tree.
 *
 * @param args The command line.
 * @returns The moves of each role.
 * @throws Error if a demo of `--demo` is not known, or if a hold change does not fit.
 */
async function measureRoles(args: CarryArgs): Promise<RoleCarry[]> {
  const all = await probeDemos();
  const names = all.map((demo) => demo.id);
  const unknown = args.demos.filter((demo) => !names.includes(demo));
  if (unknown.length > 0) {
    throw new Error(
      `The demos ${unknown.join(', ')} are not known. The demos are: ${names.join(', ')}.`,
    );
  }
  const demos = args.demos.length === 0 ? all : all.filter((demo) => args.demos.includes(demo.id));
  const changes = args.holds === null ? null : setHolds(args.holds);
  try {
    return args.roles.map((role) => ({ role, moves: measureCarry(role, demos) }));
  } finally {
    changes?.undo();
  }
}

/**
 * Measures the commit of `--base` and the working tree at the same time, each in a child process
 * (`probeBeside()`), and prints the table with each value of the commit in parentheses.
 *
 * @param ref The commit, the branch, or the tag.
 * @param holds The hold changes of the working tree, or `null`.
 */
async function compareCarry(ref: string, holds: string | null): Promise<void> {
  const label = `${ref} (${shortHash(ref)})`;
  const tree = withoutOptions(process.argv.slice(2), ['--base']);
  const started = performance.now();
  const texts = await probeBeside(
    ref,
    'carry-check.ts',
    { base: withoutOptions(tree, ['--set']), tree },
    { prefix: 'carry-check-', cache: true },
  );
  // SAFETY: each text comes from the --json output of this script in a child process.
  const after = (JSON.parse(texts.tree) as { readonly roles: readonly RoleCarry[] }).roles;
  // SAFETY: as above.
  const before = (JSON.parse(texts.base) as { readonly roles: readonly RoleCarry[] }).roles;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `Carry of the instrument in the left paw on the working tree${holds === null ? '' : ` with the hold changes ${holds}`}, with ${label} in parentheses: ${seconds} s. A fast step turns both faster than ${FAST_TURN}°/s, at steps of ${MOVE_STEP} s.`,
  );
  console.log(['', ...carryLines(after, before)].join('\n'));
}

/** Runs the tool: `node tools/carry-check.ts <role,...> [options]`. */
async function main(): Promise<void> {
  const args = carryArgs(process.argv.slice(2));
  if (args.holds !== null) {
    // A wrong hold change stops the tool before the first probe.
    setHolds(args.holds).undo();
  }
  if (args.base !== null) {
    await compareCarry(args.base, args.holds);
    return;
  }
  const started = performance.now();
  const roles = await measureRoles(args);
  if (args.json !== null) {
    writeFileSync(args.json, JSON.stringify({ version: CARRY_FORMAT, since: CARRY_SINCE, roles }));
    return;
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `Carry of the instrument in the left paw on the working tree${args.holds === null ? '' : ` with the hold changes ${args.holds}`}: ${seconds} s. A fast step turns both faster than ${FAST_TURN}°/s, at steps of ${MOVE_STEP} s.`,
  );
  console.log(['', ...carryLines(roles, null)].join('\n'));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
