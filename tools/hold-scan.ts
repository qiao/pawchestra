/**
 * Scans the variants of a hold fast (`pnpm hold-scan <role>`, `docs/agents/rigging.md`, "Holds
 * and reach"): the product of the grids of `--grid`, and rigid moves of a bowed
 * instrument around the end of its bone with `--move` (`yaw`, `tilt`, `side`, and `roll` in
 * degrees, `dx`, `dy`, and `dz` in meters, on the hold of `--hold` or of the first player), each on
 * top of the changes of `--set`. For each variant, it prepares the plans of the players of the role
 * again (`preparePoses()` with a reuse), and sweeps `--samples` play samples, 12 by default, and
 * the rest of the first demo of the role, or of each `--demo`, with one part for each arm bone
 * (`perBoneRole()` of `tools/pose-depth.ts`). A row gives the deepest point of each pair, the
 * reached share of the fingerboard and of the hair of a bowed player (with the mark `no reach` or
 * `short` of `tools/bow-warning.ts` at a hair part that shows nearly no stroke), and the score
 * ({@link scoreOf}). The rows come sorted by the score, and `--top` rows show. A variant that
 * changes a model, such as a scale of a species, builds new scenes, and takes about 1 s. Check the
 * best rows with `pnpm pose-depth --per-bone` and `pnpm arm-check --variant`.
 */
import { MathUtils, Quaternion, Vector3 } from 'three';

import { bowMark } from './bow-warning.ts';
import { gridChanges, gridVariants } from './hold-fit.ts';
import { setHolds } from './hold-sets.ts';
import { perBoneRole, roleDemos } from './pose-depth.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { Quat, Vec3 } from '../src/models/tuples.ts';
import { BOWED_HOLDS, SPECIES_HOLDS } from '../src/pose/bowed-rig.ts';
import type { BowedHold, BowedInstrument } from '../src/pose/bowed-rig.ts';
import { preparePoses } from '../src/pose/plan.ts';
import { sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { depthLimit, sweepDepths } from '../src/pose/test-sweep.ts';
import type { RoleSweep, SweepSample } from '../src/pose/test-sweep.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';

/** The text of the usage. */
const USAGE = `Usage: pnpm hold-scan <${Object.keys(SWEEP_ROLES).join(' | ')}> [--demo <id>]... [--set <changes>] [--grid <path>=<a>:<b>:<step>]... [--move <yaw|tilt|side|roll|dx|dy|dz>=<a>:<b>:<step>]... [--hold <instrument>[@<species>]] [--samples <n>] [--top <n>]`;

/** The axes of `--move`: the turns in degrees and the moves in meters. */
const MOVES = ['yaw', 'tilt', 'side', 'roll', 'dx', 'dy', 'dz'] as const;

/** An axis of `--move`. */
type MoveAxis = (typeof MOVES)[number];

/** The root of the paths of `--move` in the grids, such as `move.yaw=10`. */
const MOVE_ROOT = 'move.';

/**
 * The roots of `--set` that change a model of the scene and not only a hold: the places of the
 * percussion and the harp. A scale of a species, such as `hippo.bassScale`, changes a model too.
 * A variant with such a root builds a new scene.
 */
const MODEL_ROOTS: ReadonlySet<string> = new Set([
  'kettles',
  'harpPlace',
  'bassDrum',
  'snareDrum',
  'suspendedCymbal',
  'tambourine',
  'triangle',
  'bars',
]);

/**
 * The weight of a lost share of the fingerboard or of the hair in the score, in cm of depth: a
 * loss of the whole fingerboard counts as 10 cm past the limits.
 */
const REACH_WEIGHT = 10;

/** The options of the command. */
interface Options {
  /** The role. */
  readonly role: RoleSweep;
  /** The demos of `--demo`, or none for the first demo of the role. */
  readonly demos: readonly string[];
  /** The changes of `--set` under each variant. */
  readonly fixed: string;
  /** The grids of `--grid` and `--move`, the moves with the root {@link MOVE_ROOT}. */
  readonly grids: readonly string[];
  /** The hold of `--hold` that the moves change, or `null` for the hold of the player. */
  readonly hold: string | null;
  /** The number of play samples. */
  readonly samples: number;
  /** The number of rows to write, the best first. */
  readonly top: number;
}

/** The measures of one variant. */
interface ScanRow {
  /** The text of the changes, or empty for the base. */
  readonly variant: string;
  /** The deepest point of each pair over the samples, in meters, by `<part>><obstacle>`. */
  readonly depths: ReadonlyMap<string, number>;
  /** The depth past the limit of each pair, summed over the pairs, in meters. */
  readonly over: number;
  /**
   * The reached part of the fingerboard and of the hair of a bowed player, with the mark of a
   * hair part that shows nearly no stroke (`bowMark()`), or `null`.
   */
  readonly reach: {
    readonly fingerboard: number;
    readonly hair: number;
    readonly mark: ReturnType<typeof bowMark>;
  } | null;
  /** The score ({@link scoreOf}). */
  score: number;
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
  const demos: string[] = [];
  const grids: string[] = [];
  let fixed = '';
  let hold: string | null = null;
  let samples = 12;
  let top = 20;
  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${rest[i]}" has no value.\n${USAGE}`);
    }
    switch (rest[i]) {
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--set':
        fixed = fixed ? `${fixed};${value}` : value;
        break;
      case '--grid':
        gridChanges(value);
        grids.push(value);
        break;
      case '--move': {
        const axis = value.slice(0, value.indexOf('='));
        if (!MOVES.some((m) => m === axis)) {
          throw new Error(
            `The option --move takes an axis of ${MOVES.join(', ')}, and not "${axis}".`,
          );
        }
        gridChanges(value);
        grids.push(`${MOVE_ROOT}${value}`);
        break;
      }
      case '--hold':
        hold = value;
        break;
      case '--samples':
      case '--top': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(
            `The option ${rest[i]} takes a whole number of 1 or more, and not "${value}".`,
          );
        }
        if (rest[i] === '--samples') {
          samples = n;
        } else {
          top = n;
        }
        break;
      }
      default:
        throw new Error(`The option "${rest[i]}" is not known.\n${USAGE}`);
    }
  }
  setHolds(fixed).undo();
  return { role, demos, fixed, grids, hold, samples, top };
}

/**
 * Tells if a text is a bowed instrument, with a hold of {@link BOWED_HOLDS}.
 *
 * @param id The text.
 * @returns True for a bowed instrument.
 */
function isBowedInstrument(id: string): id is BowedInstrument {
  return Object.keys(BOWED_HOLDS).includes(id);
}

/**
 * Finds the bowed hold of a path of `--hold`, such as `contrabass@hippo` or `violin`.
 *
 * @param path The path.
 * @returns The hold object of the module.
 * @throws Error if the path names no bowed hold.
 */
function bowedHoldOf(path: string): BowedHold {
  const [instrument = '', species] = path.split('@');
  const own = species && isSpeciesId(species) ? SPECIES_HOLDS[species] : undefined;
  const bowed = isBowedInstrument(instrument) ? instrument : null;
  const found = bowed ? (species ? own?.[bowed] : BOWED_HOLDS[bowed]) : undefined;
  if (!found) {
    throw new Error(`The hold "${path}" is not a bowed hold, so --move does not apply.`);
  }
  return found;
}

/**
 * Gives the hold path of the moves: `--hold`, or the own hold of the species of the first player
 * of the role, or the hold of its instrument.
 *
 * @param scene The first scene.
 * @param role The role.
 * @param given The path of `--hold`, or `null`.
 * @returns The path.
 * @throws Error if the role has no player in the scene.
 */
function movePath(scene: TestScene, role: RoleSweep, given: string | null): string {
  if (given) {
    return given;
  }
  const [player] = role.players(scene);
  const index = Number(/^\S+ (\d+)/.exec(player?.name ?? '')?.[1] ?? -1);
  const cast = scene.layout.players[index]?.cast;
  if (!cast) {
    throw new Error(`The ${role.role} has no player in the first demo, so give --hold.`);
  }
  const bowed = isBowedInstrument(cast.instrument) ? cast.instrument : null;
  const own = bowed ? SPECIES_HOLDS[cast.species]?.[bowed] : undefined;
  return own ? `${cast.instrument}@${cast.species}` : cast.instrument;
}

/**
 * Turns the moves of a variant into changes of the place of the instrument: a turn around the end
 * of the `instrument` bone in the model axes (the yaw around y, the tilt around x with the top
 * forward for a positive tilt, the side lean around z, and the roll around the turned long axis),
 * on top of the turn of the hold (`BowedHold.playTurn`), and a move in meters
 * (`BowedHold.playShift`, in head heights).
 *
 * @param moves The values of each axis.
 * @param path The hold path.
 * @param hold The hold, with the changes of `--set`.
 * @param headHeight The head height H of the player, in meters.
 * @returns The changes, such as `contrabass@hippo.playTurn=[...];contrabass@hippo.playShift=[...]`.
 */
function moveChanges(
  moves: ReadonlyMap<MoveAxis, number>,
  path: string,
  hold: BowedHold,
  headHeight: number,
): string {
  const at = (axis: MoveAxis): number => moves.get(axis) ?? 0;
  const deg = MathUtils.DEG2RAD;
  let turn = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), at('yaw') * deg)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -at('tilt') * deg))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), at('side') * deg))
    .multiply(new Quaternion(...hold.playTurn));
  if (at('roll') !== 0) {
    const axis = new Vector3(0, 1, 0).applyQuaternion(turn).normalize();
    turn = new Quaternion().setFromAxisAngle(axis, at('roll') * deg).multiply(turn);
  }
  const quat: Quat = [turn.x, turn.y, turn.z, turn.w];
  const shift: Vec3 = [
    hold.playShift[0] + at('dx') / headHeight,
    hold.playShift[1] + at('dy') / headHeight,
    hold.playShift[2] + at('dz') / headHeight,
  ];
  const text = (values: readonly number[]): string =>
    `[${values.map((v) => Number(v.toFixed(4))).join(',')}]`;
  return `${path}.playTurn=${text(quat)};${path}.playShift=${text(shift)}`;
}

/**
 * Gives the play samples of a scene evenly over the play of the role, and the rest samples.
 *
 * @param role The role.
 * @param scene The scene.
 * @param count The number of play samples.
 * @returns The samples by set.
 */
function scanSamples(
  role: RoleSweep,
  scene: TestScene,
  count: number,
): { readonly name: string; readonly samples: SweepSample[] }[] {
  return role.sampleSets(scene).flatMap(({ name, samples }) => {
    if (name === 'rest') {
      return [{ name, samples: [...samples] }];
    }
    if (name !== 'play') {
      return [];
    }
    const all = [...samples];
    const step = Math.max(1, all.length / count);
    return [
      {
        name,
        samples: Array.from(
          { length: Math.min(count, all.length) },
          (...[, i]) => all[Math.floor(i * step)],
        ).filter((s) => s !== undefined),
      },
    ];
  });
}

/**
 * Tells if a variant changes a model of the scene ({@link MODEL_ROOTS}, or a scale of a species).
 *
 * @param variant The changes.
 * @returns True when the scan must build a new scene.
 */
function changesModel(variant: string): boolean {
  return variant
    .split(';')
    .map((change) => change.trim().split('.')[0] ?? '')
    .some((root) => MODEL_ROOTS.has(root) || isSpeciesId(root));
}

/**
 * Measures one variant in the scenes: the deepest point of each pair of each arm bone and of the
 * other parts of the role ({@link perBoneRole}), the depth past the limits, and the reach of a
 * bowed player.
 *
 * @param role The role with one part for each arm bone.
 * @param scenes The scenes of the demos, with the models.
 * @param count The number of play samples.
 * @param variant The changes, applied by the caller.
 * @returns The row, with no score.
 */
function scanVariant(
  role: RoleSweep,
  scenes: readonly TestScene[],
  count: number,
  variant: string,
): ScanRow {
  const depths = new Map<string, number>();
  const limits = new Map<string, number>();
  let reach: ScanRow['reach'] = null;
  for (const base of scenes) {
    const own = new Set(
      role.players(base).map((player) => Number(/^\S+ (\d+)/.exec(player.name)?.[1] ?? -1)),
    );
    const reuse = { plan: base.plan, players: own };
    const scene = changesModel(variant)
      ? base
      : { ...base, plan: preparePoses(base.score, base.layout, 1, base.models, reuse) };
    for (const player of role.players(scene)) {
      for (const { name, samples } of scanSamples(role, scene, count)) {
        for (const pair of sweepDepths(role, player, samples)) {
          const key = `${pair.part}>${pair.into}`;
          depths.set(key, Math.max(depths.get(key) ?? 0, pair.depth));
          const limit = depthLimit(role, pair, name).depth;
          limits.set(key, Math.min(limits.get(key) ?? Infinity, limit));
        }
      }
      const index = Number(/^\S+ (\d+)/.exec(player.name)?.[1] ?? -1);
      const note = scene.plan.players[index]?.note;
      if (note?.family === 'bowed' && !reach) {
        const [low, high] = note.rig.stopRange;
        const [from, to] = note.rig.bowRange;
        reach = {
          fingerboard: high - low,
          hair: (to - from) / note.rig.hairLength,
          mark: bowMark(note.rig),
        };
      }
    }
  }
  let over = 0;
  for (const [key, depth] of depths) {
    over += Math.max(0, depth - (limits.get(key) ?? Infinity));
  }
  return { variant, depths, over, reach, score: 0 };
}

/**
 * Gives the score of a row: the depth past the limit of each pair, summed over the pairs, in cm,
 * and {@link REACH_WEIGHT} for each share of the fingerboard and of the hair that the row reaches
 * less than the base. A lower score is better.
 *
 * @param row The row.
 * @param base The base row.
 * @returns The score.
 */
function scoreOf(row: ScanRow, base: ScanRow): number {
  const lost =
    row.reach && base.reach
      ? Math.max(0, base.reach.fingerboard - row.reach.fingerboard) +
        Math.max(0, base.reach.hair - row.reach.hair)
      : 0;
  return row.over * 100 + REACH_WEIGHT * lost;
}

/**
 * Builds the scene of each demo of the scan with the changes of now.
 *
 * @param options The options.
 * @returns The scenes.
 * @throws Error if no demo has the role.
 */
async function scenesOf(options: Options): Promise<TestScene[]> {
  const demos = await roleDemos(options.demos, [], options.role);
  const chosen = options.demos.length > 0 ? demos : demos.slice(0, 1);
  if (chosen.length === 0) {
    throw new Error(`No demo of --demo has the ${options.role.role}.`);
  }
  return chosen.map((demo) => sceneOf(demo.bytes));
}

/**
 * Runs the tool: `node tools/hold-scan.ts <role> [options]`. Each variant of the grids goes on top
 * of the changes of `--set`. The rows come sorted by the score ({@link scoreOf}), the base first
 * in a tie.
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const role = perBoneRole(options.role);
  const fixed = setHolds(options.fixed);
  const scenes = await scenesOf(options);
  const variants = ['', ...gridVariants(options.grids)];
  const moving = options.grids.some((grid) => grid.startsWith(MOVE_ROOT));
  const first = scenes[0];
  const path = moving && first ? movePath(first, options.role, options.hold) : null;
  const hold = path ? bowedHoldOf(path) : null;
  const [player] = first ? options.role.players(first) : [];
  const headHeight = player?.model.body.headHeight ?? 1;
  const rows: ScanRow[] = [];
  const started = performance.now();
  try {
    for (const variant of variants) {
      const moves = new Map<MoveAxis, number>();
      const changes: string[] = [];
      for (const change of variant.split(';').filter((c) => c !== '')) {
        if (change.startsWith(MOVE_ROOT)) {
          const [axis = '', value = ''] = change.slice(MOVE_ROOT.length).split('=');
          // SAFETY: parseOptions() takes only the axes of MOVES.
          moves.set(axis as MoveAxis, Number(value.replace(/deg$/, '')));
        } else {
          changes.push(change);
        }
      }
      if (moves.size > 0 && path && hold) {
        changes.push(moveChanges(moves, path, hold, headHeight));
      }
      const applied = setHolds(changes.join(';'));
      try {
        const own = changesModel(applied.text) ? await scenesOf(options) : scenes;
        rows.push(scanVariant(role, own, options.samples, variant));
      } finally {
        applied.undo();
      }
    }
  } finally {
    fixed.undo();
  }
  const seconds = (performance.now() - started) / 1000;
  const [base] = rows;
  for (const row of rows) {
    row.score = base ? scoreOf(row, base) : 0;
  }
  const sorted = rows.toSorted((a, b) => a.score - b.score);
  const keys = [
    ...new Set(rows.flatMap((row) => [...row.depths].filter(([, d]) => d > 0).map(([k]) => k))),
  ].toSorted();
  const bowed = rows.some((row) => row.reach);
  console.log(
    `Hold scan of the ${options.role.role}: ${scenes.length} demo(s), ${options.samples} play samples and the rest of each player, ${rows.length} variants in ${seconds.toFixed(1)} s (${(seconds / Math.max(1, rows.length)).toFixed(2)} s each)${path ? `, moves of ${path}` : ''}.`,
  );
  console.log(
    `The score is the depth past the limit of each pair, summed in cm, plus ${REACH_WEIGHT} for each share of the fingerboard and of the hair lost against the base. Lower is better.`,
  );
  const head = [
    'rank',
    'score',
    'variant',
    ...keys.map((k) => `${k} cm`),
    ...(bowed ? ['fingerboard', 'hair'] : []),
  ];
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const [rank, row] of sorted.slice(0, options.top).entries()) {
    const cells = keys.map((k) => ((row.depths.get(k) ?? 0) * 100).toFixed(1));
    const reach = bowed
      ? [
          row.reach ? row.reach.fingerboard.toFixed(2) : '-',
          row.reach
            ? `${row.reach.hair.toFixed(2)}${row.reach.mark ? ` (${row.reach.mark})` : ''}`
            : '-',
        ]
      : [];
    console.log(
      `| ${[rank + 1, row.score.toFixed(1), row.variant || 'base', ...cells, ...reach].join(' | ')} |`,
    );
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
