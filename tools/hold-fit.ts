/**
 * Fits the hold of a role of a studio body in one run (`docs/agents/rigging.md`, "Holds and
 * reach"): for the base and for each variant of `--set`, it gives the folds of `pnpm fold-probe`
 * with the most folded faces of one rest sample by side, the deepest point of each sample set of
 * the sweep of `pnpm pose-depth` with the note-target errors, and, for a violin role, the reach of
 * `pnpm hold-reach`. For a role that holds its instrument against its body, it gives the deepest
 * point of the instrument in the body. For a wind role with a paw that leaves its grip in the rest
 * pose (`WindHold.restFreeL`), it gives the gap of that paw to the body in the rest and the reach
 * share of its rest place. It prints one table with one row for each variant. The source files do
 * not change.
 *
 * `--grid '<path>=<a>:<b>:<step>'` adds the variants of a range of values, and several `--grid`
 * options give the product of their ranges. With `--set`, the grids go on top of each variant of
 * `--set`, and the run has no row of a `--set` variant alone. The limit is {@link GRID_LIMIT}
 * variants. A run with a grid sorts the rows of the variants by the play folds, then by the
 * deepest point. With `--faces <n>`,
 * the faces that fold most in the base and in the best variant follow the table, as
 * `pnpm fold-probe --faces` writes them. `--faces-of <face>[,<face>]...` adds a column for each
 * named face with the share of the play samples in which it folds (`tools/face-shares.ts`). Each
 * row also names the {@link TOP_FOLDS} faces that fold in the most samples, with the mark `new` at
 * a face that folds in no sample of the base row of the working tree ({@link topFolds}).
 *
 * With `--base <ref>`, the commit and the working tree run at the same time, each in a child
 * process. The table then starts with the row of the commit, and one compare of the deepest
 * points in the H of each body follows for each variant.
 *
 * `--sets <set>[,<set>]...` takes only the named sample sets of {@link FIT_SETS}, such as
 * `--sets lift,rest,lower` for the rest mode: the run then skips the play samples of the folds
 * and of the sweep, which take most of its time.
 *
 * A run with the rest set gives the lap rest of a seated role with a lap rest ({@link hasLapRest}):
 * the gap of the lower end of the instrument to the skin of the thighs, and for a violin role the
 * tilt of the violin, the place of the left palm on it, the upright bow at the right side, and the
 * place of the right elbow (`tools/lap-rest.ts`).
 *
 * A wind role gives the spare reach of each grip in the play and in the rest (`spareRow()` of
 * `pnpm hold-reach`).
 *
 * `--technique <technique>` counts only the play samples of the folds, the turns, and the sweep in
 * which the last note of the seat of the player has the technique, such as `pizzicato`
 * ({@link techniqueFilter}). The note targets and the lap rest count all samples.
 *
 * `--scan` scans variants of the rest of a role with a lap rest or a wind hold in a part of the
 * time: for each variant, it builds only the rig of one seated player again, and measures one rest
 * sample at the wall time `SCAN_WALL` of `tools/lap-rest.ts`, or one sample at each wall time of
 * `--walls` ({@link scanHolds}). With no `--demo`, the sample is the first seated body of the role in the
 * first demo of the run. It goes with `--set`, `--grid` (up to {@link SCAN_GRID_LIMIT} variants),
 * and `--demo`.
 *
 * `--glb <file>` fits the hold on the studio body that the export makes from another GLB file, such
 * as a GLB file of `pnpm rig-mesh --check --keep`: the tool runs again in a child process, in a copy
 * of `src/` with the module of the file (`withGlbBody()` of `tools/glb-swap.ts`). The files of
 * `assets/` and `src/` do not change, also after a stop or a failure. It goes with each option
 * except `--base`.
 *
 * Usage: pnpm hold-fit <role> [--set <path>=<value>[;<path>=<value>]...]...
 * [--grid <path>=<a>:<b>:<step>]... [--sets <set>[,<set>]...] [--demo <id>|all]...
 * [--midi <path>]... [--step <seconds>] [--faces <n>] [--base <ref>] [--json <file>] [--glb <file>], or pnpm hold-fit
 * <role> --scan [--walls <seconds>[,<seconds>]...] [--set <changes>]... [--grid <grid>]...
 * [--demo <id>|all]... [--midi <path>]... [--glb <file>]
 *
 * Each `--midi <path>` adds a MIDI file of the user to the run as one more `--demo`.
 */
import { writeFileSync } from 'node:fs';

import { Quaternion, Vector3 } from 'three';

import {
  FOLD_ROLES,
  FOLD_ROLE_TABLE,
  SAMPLE_SETS,
  faceLines,
  findRole,
  homeBody,
  meanTurn,
  probeFolds,
  roleAnimal,
  roleBodies,
  roleScene,
  splitText,
  turnAngle,
} from './fold-probe.ts';
import type {
  FoldCount,
  FoldReport,
  FoldVisit,
  PlayFilter,
  RoleSource,
  SampleSet,
  SideSplit,
} from './fold-probe.ts';
import { faceList, faceShares, foldShareText } from './face-shares.ts';
import { runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import type { FaceShare } from './face-shares.ts';
import {
  freeRestReach,
  holdReach,
  rangeTexts,
  reachShare,
  ruleSize,
  spareRow,
} from './hold-reach.ts';
import type { ChinInstrument, GripSpare, HoldReach } from './hold-reach.ts';
import { setHolds } from './hold-sets.ts';
import { PAW_PLACES, SCAN_WALL, lapWorsts, probeLaps, scanRest, scanSamples } from './lap-rest.ts';
import type { LapWorst, LapWorsts, ScanSample } from './lap-rest.ts';
import type { DemoFile } from './patch-demos.ts';
import { absoluteMidi, midiPath, probeDemos, userDemoFile } from './probe-demos.ts';
import {
  TARGET_REACH,
  compareDepths,
  joinReach,
  restoreDepth,
  restoreResult,
  sampleAt,
  sweepDemos,
} from './pose-depth.ts';
import type { DemoResult, GapsOf, StoredDepth, StoredResult } from './pose-depth.ts';
import { armKeys } from './raise-fit.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import { twistAngle } from '../src/models/studio-rig.ts';
import type { StudioRig } from '../src/models/studio-rig.ts';
import type { Quat } from '../src/models/tuples.ts';
import type { SpeciesId } from '../src/models/species.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import type { Technique } from '../src/score/types.ts';
import { INSTRUMENT_PART, SWEEP_ROLES, recastSweep } from '../src/pose/test-sweep-roles.ts';
import { BODY_OBSTACLE, PAW_PARTS, depthLimit, pairText } from '../src/pose/test-sweep.ts';
import type { PairDepth, RoleSweep } from '../src/pose/test-sweep.ts';
import { isInFamily } from '../src/pose/family.ts';
import { windHoldOf } from '../src/pose/winds.ts';
import type { WindInstrument } from '../src/pose/winds.ts';

/**
 * The demos of a run with no `--demo`: the demos of the deepest point of each sample set of the
 * red fox in a sweep of all demos. One variant of `fox-violinist` over all 14 demos takes about
 * 173 s. A role with none of these demos takes its one demo with the most notes of the role
 * ({@link chooseDemos}), and `--demo all` takes all demos of the role.
 */
export const FIT_DEMOS: readonly string[] = [
  'bach-bwv1050',
  'beethoven-8',
  'boulanger-matin',
  'mozart-k525',
];

/** The step of the song time of the play folds by default, in seconds. */
export const FIT_STEP = 1;

/**
 * The largest share of the play samples with a fold: the goal of a mesh rig.
 */
export const PLAY_FOLD_GOAL = 0.01;

/** The number of the faces that fold most, which each row names ({@link topFolds}). */
export const TOP_FOLDS = 5;

/** The largest number of variants of the grids of a run. One variant takes 45 s to 90 s. */
export const GRID_LIMIT = 40;

/**
 * The largest number of variants of the grids of a scan (`--scan`). One variant of the violinist
 * takes about 0.04 s for each rest sample.
 */
export const SCAN_GRID_LIMIT = 1000;

/**
 * The sample sets of a run: the play, the lift of the arms at the start, the rest pose before the
 * start, and the lowering after the song end. The folds have no lowering, and a role with no sweep
 * has the folds only.
 */
export const FIT_SETS = ['play', 'lift', 'rest', 'lower'] as const;

/** A sample set of a run ({@link FIT_SETS}). */
export type FitSet = (typeof FIT_SETS)[number];

/**
 * The largest gap of the lower end of the instrument to the skin under it in the rest without the
 * mark `OVER`, in meters: the goal of the lap rest.
 */
export const LAP_GAP_GOAL = 0.02;

/**
 * The deepest corner of the lower end of a violin in the body in the rest without the mark `OVER`,
 * in meters.
 */
export const END_DEPTH_GOAL = 0.01;

/**
 * The deepest corner of a violin in the body in the rest without the mark `OVER`, in meters: the
 * violin may touch the body, at most 1 cm deep (design 5.3).
 */
export const HELD_DEPTH_GOAL = 0.01;

/** The largest tilt of the violin and of the bow from the vertical in the rest without the mark `OVER`, in degrees. */
export const TILT_GOAL = 15;

/** The largest gap of the frog end of the bow to the right thigh in the rest without the mark `OVER`, in meters. */
export const FROG_GAP_GOAL = 0.03;

/** The deepest corner of the frog end of the bow in the body in the rest without the mark `OVER`, in meters. */
export const FROG_DEPTH_GOAL = 0.01;

/**
 * The deepest point of the bow in the body or in the arms in the rest without the mark `OVER`, in
 * meters.
 */
export const BOW_DEPTH_GOAL = 0.005;

/**
 * The highest right elbow joint above the right shoulder joint in the rest without the mark
 * `OVER`, in meters: the elbow hangs below the shoulder, as the elbows of the seated violinist of
 * the reference image.
 */
export const ELBOW_RISE_GOAL = 0;

/**
 * The right elbow joint farthest behind the back of the trunk at its height in the rest without
 * the mark `OVER`, in meters.
 */
export const ELBOW_BACK_GOAL = 0.05;

/**
 * The right elbow joint farthest out from the right side of the trunk at its height, seen from the
 * front, in the rest without the mark `OVER`, in meters.
 */
export const ELBOW_OUT_GOAL = 0.08;

/**
 * The largest angle of the right upper arm from the vertical in the rest without the mark `OVER`,
 * in degrees.
 */
export const UPPER_ARM_GOAL = 35;

/**
 * The wind holds whose rest stands the instrument on a leg, by the root of `--set`: the flute of
 * the tan fox stands upright on the right leg. Each other wind role has no lap rest.
 */
export const LEG_RESTS: ReadonlySet<string> = new Set(['flute@fox-tan']);

/** The usage text of `pnpm hold-fit`. */
const USAGE = `Usage: pnpm hold-fit <${[...FOLD_ROLES.keys()].join(' | ')} | <role>@<species>> [--set <path>=<value>[;<path>=<value>]...]... [--grid <path>=<a>:<b>:<step>]... [--sets <${FIT_SETS.join(' | ')}>[,<set>]...] [--demo <id>|all]... [--midi <path>]... [--step <seconds>] [--faces <n>] [--faces-of <face>[,<face>]...] [--technique <normal | pizzicato | tremolo>] [--base <ref>] [--json <file>] [--glb <file>]
       pnpm hold-fit <role> --scan [--walls <seconds>[,<seconds>]...] [--set <changes>]... [--grid <path>=<a>:<b>:<step>]... [--demo <id>|all]... [--midi <path>]... [--glb <file>]`;

/**
 * Tells if a text is the name of a sample set of a run.
 *
 * @param name The text.
 * @returns True for a name of {@link FIT_SETS}.
 */
function isFitSet(name: string): name is FitSet {
  return FIT_SETS.some((set) => set === name);
}

/**
 * Reads the sample sets of `--sets`.
 *
 * @param value The names, separated by commas, such as `lift,rest,lower`.
 * @returns The sets, in the order of {@link FIT_SETS}.
 * @throws Error if a name is not a set of {@link FIT_SETS}, or if the list is empty.
 */
export function parseSets(value: string): FitSet[] {
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const unknown = names.filter((name) => !isFitSet(name));
  if (names.length === 0 || unknown.length > 0) {
    throw new Error(
      `The option --sets takes the names ${FIT_SETS.join(', ')}, and "${value}" has ${unknown.length > 0 ? unknown.join(', ') : 'none'}.`,
    );
  }
  return FIT_SETS.filter((set) => names.includes(set));
}

/**
 * Gives the values of one grid: from the first value to the last value at each step, with both
 * ends. A value with the unit `deg` is an angle in degrees, as in `--set`.
 *
 * @param grid The grid, as `<path>=<a>:<b>:<step>`, such as `violin@fox-red.lean=10deg:20deg:5deg`.
 * @returns The changes, one for each value, such as `violin@fox-red.lean=10deg`.
 * @throws Error if the grid is not `<path>=<a>:<b>:<step>`, if a number is not a number, if the
 *   numbers mix the unit `deg` with no unit, or if the step is not above 0.
 */
export function gridChanges(grid: string): string[] {
  const equals = grid.indexOf('=');
  const parts = grid.slice(equals + 1).split(':');
  if (equals < 1 || parts.length !== 3) {
    throw new Error(`The grid "${grid}" is not <path>=<a>:<b>:<step>.`);
  }
  const path = grid.slice(0, equals);
  const degrees = parts.map((part) => part.endsWith('deg'));
  if (degrees.some((d) => d !== degrees[0])) {
    throw new Error(`The numbers of the grid "${grid}" all have the unit deg, or none has it.`);
  }
  const unit = degrees[0] ? 'deg' : '';
  const [a = Number.NaN, b = Number.NaN, step = Number.NaN] = parts.map((part) =>
    part.trim() === '' ? Number.NaN : Number(unit ? part.slice(0, -3) : part),
  );
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(step)) {
    throw new Error(`The grid "${grid}" has a value that is not a number.`);
  }
  if (!(step > 0)) {
    throw new Error(`The step of the grid "${grid}" must be above 0.`);
  }

  const count = Math.floor(Math.abs(b - a) / step + 1e-9) + 1;
  const direction = b < a ? -1 : 1;
  return Array.from({ length: count }, (...[, i]) => {
    const value = Number((a + direction * i * step).toFixed(9));
    return `${path}=${value}${unit}`;
  });
}

/**
 * Gives the variants of the grids of a run: the product of the values of each grid on top of each
 * base variant, with the changes of each variant separated by `;`. The changes of a grid come
 * after the changes of its base, so a grid of a path that the base changes too wins.
 *
 * @param grids The grids ({@link gridChanges}).
 * @param bases The variants of `--set` that the grids go on top of, or the base with no change
 *   (`''`) when the run has no `--set`.
 * @param limit The largest number of variants, {@link GRID_LIMIT} by default.
 * @returns The variants, the first base and the first grid outermost, or none with no grid.
 * @throws Error if a grid does not fit, or if the product of the grids on top of the bases has
 *   more than `limit` variants.
 */
export function gridVariants(
  grids: readonly string[],
  bases: readonly string[] = [''],
  limit: number = GRID_LIMIT,
): string[] {
  if (grids.length === 0) {
    return [];
  }
  const ranges = grids.map(gridChanges);
  const product = ranges.reduce((count, range) => count * range.length, 1);
  const total = product * bases.length;
  if (total > limit) {
    const sizes = ranges.map((range) => range.length).join(' × ');
    const on =
      bases.length > 1 ? ` on each of ${bases.length} --set variants, ${total} in all,` : '';
    throw new Error(
      `The grids give ${sizes} = ${product} variants${on} more than the limit of ${limit}.`,
    );
  }
  return bases.flatMap((base) =>
    ranges
      .reduce<string[]>(
        (variants, range) => variants.flatMap((variant) => range.map((c) => `${variant};${c}`)),
        [base],
      )
      .map((variant) => (base === '' ? variant.slice(1) : variant)),
  );
}

/** The techniques of the notes of a seat (design 3.5), which `--technique` takes. */
export const TECHNIQUES = [
  'normal',
  'pizzicato',
  'tremolo',
] as const satisfies readonly Technique[];

/**
 * Reads the technique of `--technique`.
 *
 * @param value The value of the option.
 * @returns The technique.
 * @throws Error that lists the techniques, for another value.
 */
export function techniqueOf(value: string): Technique {
  const found = TECHNIQUES.find((technique) => technique === value);
  if (!found) {
    throw new Error(
      `The option --technique takes one of ${TECHNIQUES.join(', ')}, and not "${value}".`,
    );
  }
  return found;
}

/**
 * Gives the filter of the play samples of `--technique`: a sample of a player counts when the last
 * note of the seat of the player that starts at or before the song time has the technique. The
 * conductor and the samples before the first note do not count.
 *
 * @param technique The technique.
 * @returns The filter, for `probeFolds()` and the sweep.
 */
export function techniqueFilter(technique: Technique): PlayFilter {
  const seen = new WeakMap<TestScene, Map<number, { starts: number[]; techniques: Technique[] }>>();
  return (scene, player, song) => {
    const seat = player === null ? null : (scene.layout.players[player]?.cast.seatIndex ?? null);
    if (seat === null) {
      return false;
    }
    const seats =
      seen.get(scene) ?? new Map<number, { starts: number[]; techniques: Technique[] }>();
    seen.set(scene, seats);
    let notes = seats.get(seat);
    if (!notes) {
      const own = scene.score.notes
        .filter((note) => note.seatIndex === seat)
        .toSorted((a, b) => a.startSec - b.startSec);
      notes = {
        starts: own.map((note) => note.startSec),
        techniques: own.map((note) => note.technique),
      };
      seats.set(seat, notes);
    }
    let low = 0;
    let high = notes.starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((notes.starts[middle] ?? 0) <= song) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low > 0 && notes.techniques[low - 1] === technique;
  };
}

/** The options of `pnpm hold-fit`. */
export interface FitOptions {
  /** The name of the role, a key of `FOLD_ROLES` or a recast role (`findRole()`). */
  readonly name: string;
  /** The role. */
  readonly role: RoleSource;
  /**
   * The variants: each is a list of changes of the holds. The first is the base, with none. With
   * no grid, the variants of `--set` follow. With grids, the variants of the grids on top of each
   * variant of `--set`, or on top of the base with no `--set`, follow ({@link gridVariants}).
   */
  readonly variants: readonly string[];
  /** The grids of `--grid`, as `<path>=<a>:<b>:<step>`. */
  readonly grids: readonly string[];
  /** The number of variants of `--set` that the grids go on top of: 1 with no `--set`. */
  readonly gridBases: number;
  /** The number of faces of `--faces` for the base and the best variant, or 0 for none. */
  readonly faces: number;
  /** The faces of `--faces-of`, whose share of the folded play samples each row gives, or none. */
  readonly facesOf: readonly number[];
  /**
   * The demos, by the name of the file with no `.mid`, or `all`, with each file of `--midi`. The
   * demos of {@link FIT_DEMOS} when empty.
   */
  readonly demos: readonly string[];
  /** The absolute paths of the MIDI files of the user of `--midi` (`userDemos()`). */
  readonly midi: readonly string[];
  /** The step of the song time of the play folds, in seconds. */
  readonly step: number;
  /** The sample sets of the run: all of {@link FIT_SETS}, or the sets of `--sets`. */
  readonly sets: readonly FitSet[];
  /** The file into which the tool writes its rows as JSON, or `null` for none. */
  readonly json: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** True for the scan of `--scan` ({@link scanHolds}). */
  readonly scan: boolean;
  /** The wall times of the rest samples of the scan, in seconds: `--walls`, or `SCAN_WALL`. */
  readonly walls: readonly number[];
  /**
   * The technique of `--technique`: the play samples of the folds and of the sweep count only
   * when the last note of the seat of the player has it ({@link techniqueFilter}), or `null` for
   * all samples.
   */
  readonly technique: Technique | null;
}

/** The options that do not go with `--scan`: the scan has one sample set and no sweep. */
const SCAN_REFUSES: readonly string[] = [
  '--base',
  '--json',
  '--faces',
  '--faces-of',
  '--sets',
  '--step',
  '--technique',
];

/**
 * Reads the wall times of `--walls`.
 *
 * @param value The times in seconds, separated by commas, such as `10,21.1`.
 * @returns The times.
 * @throws Error if a time is not a number of 0 or more, or if the list is empty.
 */
export function parseWalls(value: string): number[] {
  const walls = value.split(',').map((text) => (text.trim() === '' ? Number.NaN : Number(text)));
  if (walls.length === 0 || walls.some((wall) => !Number.isFinite(wall) || wall < 0)) {
    throw new Error(`The option --walls takes wall times of 0 s or more, and "${value}" has none.`);
  }
  return walls;
}

/**
 * Reads the options of `pnpm hold-fit`. Each change of a variant must fit before the first run,
 * so that a typing fault stops the tool at once.
 *
 * @param args The arguments after the script.
 * @returns The options.
 * @throws Error if the role or an option is not known, if an option has no value, if the step is
 *   not above 0, if a set of `--sets` is not known, if a change of `--set` does not fit a hold, if
 *   `--scan` comes with an option of {@link SCAN_REFUSES}, or if `--walls` comes with no `--scan`.
 */
export function parseFitOptions(args: readonly string[]): FitOptions {
  const [name = '', ...rest] = args;
  const role = findRole(name);
  if (!role) {
    throw new Error(USAGE);
  }
  const sets: string[] = [];
  const grids: string[] = [];
  const demos: string[] = [];
  const midi: string[] = [];
  const given = new Set<string>();
  let step = FIT_STEP;
  let samples: readonly FitSet[] = FIT_SETS;
  let faces = 0;
  const facesOf: number[] = [];
  let json: string | null = null;
  let base: string | null = null;
  let scan = false;
  let walls: readonly number[] | null = null;
  let technique: Technique | null = null;
  for (let i = 0; i < rest.length; i++) {
    const option = rest[i] ?? '';
    given.add(option);
    if (option === '--scan') {
      scan = true;
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${option}" has no value.\n${USAGE}`);
    }
    i++;
    switch (option) {
      case '--set':
        sets.push(value);
        break;
      case '--grid':
        grids.push(value);
        break;
      case '--sets':
        samples = parseSets(value);
        break;
      case '--faces':
        faces = Number(value);
        if (!Number.isInteger(faces) || faces < 1) {
          throw new Error('The option --faces takes a whole number of faces above 0.');
        }
        break;
      case '--faces-of':
        facesOf.push(...faceList(value, '--faces-of'));
        break;
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--midi':
        midi.push(midiPath(value));
        demos.push(userDemoFile(value).replace(/\.mid$/, ''));
        break;
      case '--json':
        json = value;
        break;
      case '--base':
        base = value;
        break;
      case '--step':
        step = Number(value);
        if (!(step > 0)) {
          throw new Error('The step must be a number of seconds above 0.');
        }
        break;
      case '--walls':
        walls = parseWalls(value);
        break;
      case '--technique':
        technique = techniqueOf(value);
        break;
      default:
        throw new Error(`The option "${option}" is not known.\n${USAGE}`);
    }
  }
  const refused = SCAN_REFUSES.filter((option) => given.has(option));
  if (scan && refused.length > 0) {
    throw new Error(`The option --scan goes with none of ${refused.join(', ')}.\n${USAGE}`);
  }
  if (!scan && walls !== null) {
    throw new Error(`The option --walls needs --scan.\n${USAGE}`);
  }
  const bases = sets.length > 0 ? sets : [''];
  const limit = scan ? SCAN_GRID_LIMIT : GRID_LIMIT;
  const variants = ['', ...(grids.length > 0 ? gridVariants(grids, bases, limit) : sets)];
  for (const variant of variants) {
    setHolds(variant).undo();
  }
  if (base !== null && json !== null) {
    throw new Error(`The options --base and --json do not go together.\n${USAGE}`);
  }
  if (base !== null && technique !== null) {
    throw new Error(
      `The option --technique goes with no --base, because the hold-fit of the commit does not know it.\n${USAGE}`,
    );
  }
  return {
    name,
    role,
    variants,
    grids,
    gridBases: bases.length,
    faces,
    facesOf,
    demos,
    midi,
    step,
    sets: samples,
    json,
    base,
    scan,
    walls: walls ?? [SCAN_WALL],
    technique,
  };
}

/**
 * Gives the sweep of a fold role: the role of `SWEEP_ROLES` whose players in a scene are bodies of
 * the fold role, with only these players. The violinist sweep holds the rabbits and the red foxes,
 * so the fold role `fox-violinist` sweeps only the red foxes. A new role of both tables thus needs
 * no entry here. A recast role (`findRole()`) takes the body of its species (`recastSweep()`). The sweep of a role that holds its instrument against its body measures the
 * instrument in the body (`INSTRUMENT_PART` of `src/pose/test-sweep-roles.ts`, {@link splitHeld}).
 *
 * @param role The fold role.
 * @param scene A scene with a body of the role.
 * @param sets The sample sets to sweep, all of {@link FIT_SETS} by default.
 * @returns The sweep, or `null` when no sweep role has a body of the role.
 */
export function fitSweep(
  role: RoleSource,
  scene: TestScene,
  sets: readonly FitSet[] = FIT_SETS,
): RoleSweep | null {
  const models = new Set(roleBodies(role, scene).map((body) => body.model));
  const sweep = Object.values(SWEEP_ROLES).find((candidate) =>
    candidate.players(scene).some((player) => models.has(player.model)),
  );
  if (!sweep) {
    return null;
  }
  const cast =
    role.kind === 'player' && role.recast
      ? recastSweep(sweep, role.recast, homeBody(role.recast.species))
      : sweep;
  return {
    ...cast,
    sampleSets: (other) =>
      sweep.sampleSets(other).filter((set) => sets.some((name) => name === set.name)),
    players: (other) => {
      const own = new Set(roleBodies(role, other).map((body) => body.model));
      return cast.players(other).filter((player) => own.has(player.model));
    },
  };
}

/** The results of a sweep with the instrument in the body taken out. */
export interface HeldSplit {
  /** The deepest pair of the instrument in the body, or `null`. */
  readonly held: SetWorst | null;
  /** The results with no pair of the instrument, for the deepest points of the role. */
  readonly results: DemoResult[];
}

/**
 * Takes the pairs of the instrument (`INSTRUMENT_PART` of `src/pose/test-sweep-roles.ts`) out of
 * the results of a sweep, and gives the deepest pair of the instrument in the body over each
 * sample set, with its limit (`depthLimit()`): a real player touches the instrument with the
 * body, and the instrument goes no deeper than the limit of the part.
 *
 * @param role The sweep.
 * @param results The results of each demo.
 * @returns The pair of the instrument in the body, and the results with no pair of the instrument.
 */
export function splitHeld(role: RoleSweep, results: readonly DemoResult[]): HeldSplit {
  let held: SetWorst | null = null;
  const kept = results.map((result): DemoResult => ({
    demo: result.demo,
    species: result.species,
    headHeight: result.headHeight,
    reached: result.reached,
    sets: result.sets.map((set) => {
      for (const pair of set.pairs) {
        if (pair.part !== INSTRUMENT_PART.name || pair.into !== BODY_OBSTACLE) {
          continue;
        }
        if (!held || pair.depth > held.pair.depth) {
          const limit = depthLimit(role, pair, set.name).depth;
          held = { set: set.name, demo: result.demo, pair, limit };
        }
      }
      return {
        name: set.name,
        pairs: set.pairs.filter((pair) => pair.part !== INSTRUMENT_PART.name),
        gaps: set.gaps,
      };
    }),
    targets: result.targets,
  }));
  return { held, results: kept };
}

/** The gap of a paw that leaves its grip in the rest pose to the body. */
export interface PawGap {
  /** The name of the paw, such as `paw L`. */
  readonly paw: string;
  /**
   * The largest gap over the seated players of the smallest gap in the rest, in meters: 0 when the
   * paw touches the body of each player.
   */
  readonly gap: number;
  /** The demo and the player of the largest gap. */
  readonly demo: string;
}

/**
 * Gives the gap of each free paw to the body in the rest: for each paw, the largest over the
 * results of the smallest gap of the rest set. Each seated player measures the gap of its free
 * paws ({@link freeGaps}), and a result with no gap of a paw does not count.
 *
 * @param results The results of each demo.
 * @returns The gap of each paw, in the order of their first result.
 */
export function restGaps(results: readonly DemoResult[]): PawGap[] {
  const gaps = new Map<string, PawGap>();
  for (const { demo, sets } of results) {
    for (const gap of sets.find((set) => set.name === 'rest')?.gaps ?? []) {
      const known = gaps.get(gap.part);
      if (Number.isFinite(gap.gap) && gap.into === BODY_OBSTACLE && gap.gap >= (known?.gap ?? -1)) {
        gaps.set(gap.part, { paw: gap.part, gap: gap.gap, demo });
      }
    }
  }
  return [...gaps.values()];
}

/**
 * Gives the gap pairs of the sweep of a wind role with a free paw: each paw that leaves its grip in
 * the rest pose (`WindHold.restFreeL`) to the body, in the rest set of each seated player. The
 * free paw of a seated player rests on its thigh, and the paw of a standing player hangs.
 *
 * @param role The fold role.
 * @returns The gap pairs of each set of each player.
 */
export function freeGaps(role: RoleSource): GapsOf {
  const wind = windOf(role);
  const free = wind && windHoldOf(wind.species, wind.instrument).restFreeL ? ['paw L'] : [];
  const pairs = PAW_PARTS.filter((part) => free.includes(part.name)).map((part) => ({
    part,
    into: BODY_OBSTACLE,
  }));
  return (set, player) => (set === 'rest' && player.model.support !== 'stand' ? pairs : []);
}

/** The reach share of the rest place of a free paw (`reachShare()` of `pnpm hold-reach`). */
export interface FreeShare {
  /** The side of the paw. */
  readonly side: 'L' | 'R';
  /** The share of the arm, or `null` for a hanging arm. Above 1, the arm cannot reach the place. */
  readonly share: number | null;
}

/** The pair of a sample set that is nearest to its limit, or most over it. */
export interface SetWorst {
  /** The name of the sample set, such as `lift`. */
  readonly set: string;
  /** The demo and the player of the deepest point, such as
   * `beethoven-8 violinist 3 (fox-red, chair)`. */
  readonly demo: string;
  /** The deepest point of the pair. */
  readonly pair: PairDepth;
  /** The limit of the pair in the set, in meters, or `Infinity` for a pair with no limit. */
  readonly limit: number;
}

/**
 * Finds the deepest point of each sample set over the demos: the pair with the largest depth
 * less its limit (`depthLimit()`), so that a pair over its limit always shows. With one limit for
 * each pair, it is the deepest pair. The sets keep the order of their first result.
 *
 * @param role The sweep.
 * @param results The results of each demo.
 * @returns The pair of each set.
 */
export function worstPairs(role: RoleSweep, results: readonly DemoResult[]): SetWorst[] {
  const worst = new Map<string, SetWorst>();
  for (const { demo, sets } of results) {
    for (const { name, pairs } of sets) {
      for (const pair of pairs) {
        const limit = depthLimit(role, pair, name).depth;
        const best = worst.get(name);
        if (!best || pair.depth - limit > best.pair.depth - best.limit) {
          worst.set(name, { set: name, demo, pair, limit });
        }
      }
    }
  }
  return [...worst.values()];
}

/** The samples of a set and the samples with a fold. */
export type FoldShare = Readonly<Pick<FoldCount, 'samples' | 'withFold'>>;

/**
 * The rest samples, and the most folded faces of one rest sample, split by the side of their main
 * bone (`sideSplit()` of `pnpm fold-probe`). The rest folds in each sample on `main`, so the share
 * of the samples cannot show a change of the rest, and the faces can. A run with no rest set has
 * no rest sample.
 */
export type RestFolds = Readonly<Pick<FoldCount, 'samples' | 'most' | 'split'>>;

/**
 * The shares of the samples with a fold in the play and in the lift, and the most folded faces of
 * one rest sample.
 */
export interface FoldShares {
  /** The samples of the play and the samples with a fold. */
  readonly play: FoldShare;
  /** The samples of the lift and the samples with a fold. */
  readonly lift: FoldShare;
  /** The most folded faces of one rest sample, by side. */
  readonly rest: RestFolds;
}

/**
 * Gives the shares of the samples with a fold of a fold report, in plain numbers.
 *
 * @param report The folds.
 * @returns The samples and the samples with a fold of the play and of the lift, and the most
 *   folded faces of one rest sample by side.
 */
export function foldShares(report: FoldReport): FoldShares {
  const { play, lift, rest } = report.sets;
  return {
    play: { samples: play.samples, withFold: play.withFold },
    lift: { samples: lift.samples, withFold: lift.withFold },
    rest: { samples: rest.samples, most: rest.most, split: { ...rest.split } },
  };
}

/**
 * Gives the share of the samples of each set in which each face of `--faces-of` folds
 * (`faceShares()` of `tools/face-shares.ts`).
 *
 * @param report The folds of the variant.
 * @param faces The indices of the faces.
 * @returns The shares of each face, in the order of the faces.
 */
export function reportShares(report: FoldReport, faces: readonly number[]): FaceShare[] {
  const { rest, play, lift } = report.sets;
  return faceShares(
    { rest: rest.samples, play: play.samples, lift: lift.samples },
    (face) => ({
      rest: rest.byFace.get(face) ?? 0,
      play: play.byFace.get(face) ?? 0,
      lift: lift.byFace.get(face) ?? 0,
    }),
    faces,
  );
}

/** A face that folds in many samples of a variant ({@link topFolds}). */
export interface TopFold {
  /** The index of the face. */
  readonly face: number;
  /** The share of the samples of all sets in which the face folds, from 0 to 1. */
  readonly share: number;
  /** True when the face folds in no sample of the base row of the run. */
  readonly isNew: boolean;
}

/**
 * Gives the faces that fold in one sample or more of a fold report.
 *
 * @param report The folds.
 * @returns The indices of the faces.
 */
export function foldedFaces(report: FoldReport): Set<number> {
  return new Set(SAMPLE_SETS.flatMap((set) => [...report.sets[set].byFace.keys()]));
}

/**
 * Gives the faces that fold in the most samples of all sets, in the order of `faceLines()` of
 * `pnpm fold-probe`, and marks each face that folds in no sample of the base.
 *
 * @param report The folds of the variant.
 * @param base The faces that fold in the base row ({@link foldedFaces}).
 * @param count The number of faces.
 * @returns The faces, the most folded first.
 */
export function topFolds(
  report: FoldReport,
  base: ReadonlySet<number>,
  count: number = TOP_FOLDS,
): TopFold[] {
  const totals = new Map<number, number>();
  let samples = 0;
  for (const set of SAMPLE_SETS) {
    samples += report.sets[set].samples;
    for (const [face, n] of report.sets[set].byFace) {
      totals.set(face, (totals.get(face) ?? 0) + n);
    }
  }
  return [...totals]
    .toSorted((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, count)
    .map(([face, n]) => ({ face, share: n / Math.max(1, samples), isNew: !base.has(face) }));
}

/**
 * Writes the faces that fold most of a row ({@link topFolds}).
 *
 * @param folds The faces.
 * @returns The text, such as `116 13.7%, 1738 5.0% new`, or `none` when no face folds.
 */
export function topFoldsText(folds: readonly TopFold[]): string {
  if (folds.length === 0) {
    return 'none';
  }
  return folds
    .map(({ face, share, isNew }) => `${face} ${(100 * share).toFixed(1)}%${isNew ? ' new' : ''}`)
    .join(', ');
}

/** The results of one variant. */
export interface FitRow {
  /** The text of the changes, or empty for the base. */
  readonly variant: string;
  /** The folds of the variant. */
  readonly folds: FoldShares;
  /** The deepest point of each sample set of the sweep, or none for a role with no sweep. */
  readonly depths: readonly SetWorst[];
  /** The reach of a violin role, or `null`. */
  readonly reach: HoldReach | null;
  /** The time of the run of the variant, in seconds. */
  readonly seconds: number;
  /** The results of the sweep in each demo, for the compare of `--base`. */
  readonly results: readonly DemoResult[];
  /** The table of the faces that fold most (`faceLines()` of `pnpm fold-probe`), or none. */
  readonly faces: readonly string[];
  /** The shares of the folded samples of each face of `--faces-of` ({@link reportShares}). */
  readonly facesOf: readonly FaceShare[];
  /** The faces that fold in the most samples, with the mark of a new face ({@link topFolds}). */
  readonly topFolds: readonly TopFold[];
  /** The pair of the instrument in the body ({@link splitHeld}), or `null`. */
  readonly held: SetWorst | null;
  /** The gap of each free paw to the body in the rest ({@link restGaps}). */
  readonly gaps: readonly PawGap[];
  /** The reach share of the rest place of each free paw on the chair, or none. */
  readonly free: readonly FreeShare[];
  /**
   * The largest value of each measure of the lap rest over the rest samples (`probeLaps()` of
   * `tools/lap-rest.ts`), or `null` for a role with no lap rest or a run with no rest set.
   */
  readonly lap: LapWorsts | null;
  /** The mean turns of the arms ({@link armTurns}), or `null` with no sample of the folds. */
  readonly turns: ArmTurns | null;
  /**
   * The spare reach of each grip of a wind hold on the chair ({@link windSpare}), or `null` for a
   * role with no wind hold.
   */
  readonly spare: GripSpares | null;
}

/** The spare reach of the grip of each side of a wind hold (`spareRow()` of `pnpm hold-reach`). */
export type GripSpares = Readonly<Record<'L' | 'R', GripSpare>>;

/** The angles of the mean turns of one arm, in degrees. */
export interface ArmAngles {
  /** The mean turn of the upper arm from its bind pose, in the axes of the chest. */
  readonly upper: number;
  /** The mean turn of the paw from the forearm. */
  readonly paw: number;
  /**
   * The twist of the mean turn of the paw around the bind axis of the forearm, from the elbow to
   * the wrist, from -180 to 180, or none in a text before the format version 14.
   */
  readonly twist?: number;
  /** The angle of the mean turn of the paw with no twist, or none before the format version 14. */
  readonly swing?: number;
}

/** The mean turns of both arms over the samples of one sample set of the folds. */
export interface ArmTurns {
  /** The sample set: the play, or the first set of the run with no play. */
  readonly set: SampleSet;
  /** The left arm. */
  readonly L: ArmAngles;
  /** The right arm. */
  readonly R: ArmAngles;
}

/** The turns of the upper arms and of the paws that {@link armTurns} keeps, by sample set. */
type TurnSamples = Map<SampleSet, { readonly upper: Quat[]; readonly paw: Quat[] }[]>;

/** The probe of the arm turns of a fold probe ({@link armTurns}). */
export interface ArmTurnProbe {
  /** Keeps the turns of the arms in each sample. */
  readonly visit: FoldVisit;
  /** Gives the angles of the mean turns, or `null` with no sample. */
  readonly turns: () => ArmTurns | null;
}

/** The angles of the mean turn of a paw from its forearm, in degrees ({@link pawAngles}). */
export interface PawAngles {
  /** The whole turn. */
  readonly paw: number;
  /** The twist around the bind axis of the forearm, from -180 to 180. */
  readonly twist: number;
  /** The angle of the turn with no twist. */
  readonly swing: number;
}

/**
 * Gives the angles of the mean turn of a paw from its forearm: the whole turn, the twist around
 * the forearm, and the swing with no twist (`twistAngle()` of `src/models/studio-rig.ts`).
 *
 * @param turn The mean turn of the paw from the forearm.
 * @param axis The bind axis of the forearm, from the elbow to the wrist, as a unit vector.
 * @returns The angles, in degrees.
 */
export function pawAngles(turn: Quat, axis: Vector3): PawAngles {
  const q = new Quaternion(...turn);
  const twist = twistAngle(q, axis);
  const swing = q.clone().multiply(new Quaternion().setFromAxisAngle(axis, -twist));
  return {
    paw: turnAngle(turn, [0, 0, 0, 1]),
    twist: (twist * 180) / Math.PI,
    swing: turnAngle([swing.x, swing.y, swing.z, swing.w], [0, 0, 0, 1]),
  };
}

/**
 * Gives the bind axis of a forearm of a studio rig, from the elbow to the wrist.
 *
 * @param rig The studio rig.
 * @param side The arm.
 * @returns The unit vector, in the axes of the skin matrices.
 */
function forearmAxis(rig: StudioRig, side: 'L' | 'R'): Vector3 {
  const { heads } = rig.body;
  return new Vector3(...heads[`hand_${side}`])
    .sub(new Vector3(...heads[`forearm_${side}`]))
    .normalize();
}

/**
 * Starts the probe of the arm turns of a fold probe: a visit that keeps the turn of each upper arm
 * in the axes of the chest and of each paw from its forearm in each sample (`armKeys()` of
 * `tools/raise-fit.ts`), and a function that gives the angles of their mean turns, with the twist
 * and the swing of each paw ({@link pawAngles}). The mean turns of the play show an upper arm that
 * a hold twists, such as elbows out and level, and a paw that twists on its forearm, such as a
 * mallet grip.
 *
 * @returns The visit, and the function of the result.
 */
export function armTurns(): ArmTurnProbe {
  const samples: TurnSamples = new Map();
  let axes: Readonly<Record<'L' | 'R', Vector3>> | null = null;
  const visit: FoldVisit = (...[rig, studio, , , set]) => {
    axes ??= { L: forearmAxis(rig, 'L'), R: forearmAxis(rig, 'R') };
    const sides = samples.get(set) ?? [
      { upper: [], paw: [] },
      { upper: [], paw: [] },
    ];
    for (const [k, side] of (['L', 'R'] as const).entries()) {
      const keys = armKeys(studio.matrices, side);
      sides[k]?.upper.push(keys.upper);
      sides[k]?.paw.push(keys.wrist);
    }
    samples.set(set, sides);
  };
  const turns = (): ArmTurns | null => {
    const set = samples.has('play') ? 'play' : [...samples.keys()][0];
    const sides = set === undefined ? undefined : samples.get(set);
    if (set === undefined || !sides) {
      return null;
    }
    const angle = (list: readonly Quat[]): number =>
      turnAngle(meanTurn(list) ?? [0, 0, 0, 1], [0, 0, 0, 1]);
    const [left, right] = sides.map((side, k): ArmAngles => {
      const axis = axes?.[k === 0 ? 'L' : 'R'];
      const upper = angle(side.upper);
      if (!axis) {
        return { upper, paw: angle(side.paw) };
      }
      const { paw, twist, swing } = pawAngles(meanTurn(side.paw) ?? [0, 0, 0, 1], axis);
      return { upper, paw, twist, swing };
    });
    return left && right ? { set, L: left, R: right } : null;
  };
  return { visit, turns };
}

/** A pair of a set of the JSON text of {@link fitJson}. JSON writes the limit `Infinity` as `null`. */
type StoredWorst = Omit<SetWorst, 'pair' | 'limit'> & {
  /** The deepest point of the pair. */
  readonly pair: StoredDepth;
  /** The limit, in meters, or `null` for no limit. */
  readonly limit: number | null;
};

/** A largest value of the lap rest in the JSON text: JSON writes `Infinity` as `null`. */
type StoredLapWorst = Omit<LapWorst, 'value'> & {
  /** The value, or `null` for `Infinity`. */
  readonly value: number | null;
};

/**
 * The measures of the lap rest that the format versions after {@link FIT_SINCE} added: the text of
 * the version {@link FIT_SINCE} does not have them.
 */
type AddedLaps = 'elbowRise' | 'elbowBack' | 'elbowOut' | 'upperArm';

/** The largest values of the lap rest in the JSON text. */
type StoredLaps = {
  readonly [K in Exclude<keyof LapWorsts, AddedLaps>]: null extends LapWorsts[K]
    ? StoredLapWorst | null
    : StoredLapWorst;
} & {
  readonly [K in AddedLaps]?: StoredLapWorst | null;
};

/** The JSON text of {@link fitJson}. JSON writes the place `NaN` of a depth as `null`. */
interface StoredFit {
  /** The demos of the run. */
  readonly demos: readonly string[];
  /** The rows, the base first. */
  readonly rows: readonly (Omit<
    FitRow,
    'depths' | 'results' | 'held' | 'lap' | 'turns' | 'facesOf' | 'topFolds' | 'spare'
  > & {
    /** The shares of the faces of `--faces-of`, or none in a text before the format version 11. */
    readonly facesOf?: readonly FaceShare[];
    /** The faces that fold most, or none in a text before the format version 13. */
    readonly topFolds?: readonly TopFold[];
    /** The largest values of the lap rest, or `null`. */
    readonly lap: StoredLaps | null;
    /** The mean turns of the arms, or none in a text before the format version 9. */
    readonly turns?: ArmTurns | null;
    /** The spare reach of the grips, or none in a text before the format version 12. */
    readonly spare?: GripSpares | null;
    /** The deepest point of each sample set. */
    readonly depths: readonly StoredWorst[];
    /** The pair of the instrument in the body, or `null`. */
    readonly held: StoredWorst | null;
    /** The results of the sweep in each demo. */
    readonly results: readonly StoredResult[];
  })[];
}

/** The rows of a run and its demos. */
export interface FitRun {
  /** The demos of the run. */
  readonly demos: readonly string[];
  /** The rows, the base first. */
  readonly rows: readonly FitRow[];
}

/**
 * The format version of the JSON text of `--json` (`ProbeFormat` of `tools/ref-tree.ts`). A
 * change of the format takes the next version. Version 2 added the rest faces by side, version 3
 * the instrument in the body, the rest gaps, and the reach shares of the free paws, version 4 the
 * rest samples of the folds, version 5 the lap rest, version 6 the upright rest of the violin,
 * version 7 the right arm in the rest, version 8 the reach of the note targets of each result,
 * version 9 the mean turns of the arms, version 10 the instrument in the body of the contrabass,
 * with `null` for its limit: the pair has no limit (a reader of an older version shows that limit
 * as 0), version 11 the shares of the faces of `--faces-of` and the samples over the limit of
 * each pair of the sweep, version 12 the spare reach of the grips of a wind hold, version 13 the
 * faces that fold most of each row, and version 14 the twist and the swing of each paw and the
 * phase of the sample of each deepest point of the sweep (`PairPhase` of `pnpm pose-depth`).
 */
export const FIT_FORMAT = 14;

/**
 * The oldest format version that {@link FIT_FORMAT} only adds fields to (`ProbeFormat.since` of
 * `tools/ref-tree.ts`), so that a compare with `--base` reads a text of each version from it to
 * {@link FIT_FORMAT}. Version 6 removed the measures of the bow tip and changed the gap of the
 * lower end of a violin, and version 7 only added the right arm ({@link AddedLaps}). A change of a
 * field sets it to the new version. An added field that the reader gives as `-` on an older text
 * is an optional field of the stored types.
 */
export const FIT_SINCE = 6;

/**
 * Writes the rows of a run as JSON (`--json`), with the format version {@link FIT_FORMAT} and
 * {@link FIT_SINCE}.
 *
 * @param run The demos and the rows.
 * @returns The text.
 */
export function fitJson(run: FitRun): string {
  return JSON.stringify({ version: FIT_FORMAT, since: FIT_SINCE, ...run });
}

/**
 * Reads the rows of a run from the text of {@link fitJson}, with `NaN` in place of `null`.
 *
 * @param text The text.
 * @returns The demos and the rows.
 */
export function readFit(text: string): FitRun {
  // SAFETY: the text comes from fitJson() of this tool, in the probe of a commit or of the
  // working tree.
  const stored = JSON.parse(text) as StoredFit;
  const restore = (worst: StoredWorst): SetWorst => ({
    set: worst.set,
    demo: worst.demo,
    pair: restoreDepth(worst.pair),
    limit: worst.limit ?? Infinity,
  });
  return {
    demos: stored.demos,
    rows: stored.rows.map((row) => ({
      variant: row.variant,
      folds: row.folds,
      depths: row.depths.map(restore),
      reach: row.reach,
      seconds: row.seconds,
      results: row.results.map(restoreResult),
      faces: row.faces,
      facesOf: row.facesOf ?? [],
      topFolds: row.topFolds ?? [],
      held: row.held ? restore(row.held) : null,
      gaps: row.gaps,
      free: row.free,
      lap: row.lap ? restoreLaps(row.lap) : null,
      turns: row.turns ?? null,
      spare: row.spare ?? null,
    })),
  };
}

/**
 * Reads the largest values of the lap rest from the JSON text, with `Infinity` in place of `null`:
 * a frog or a lower end that is not over the top of the lap. A measure that the text of an older
 * format version does not have ({@link AddedLaps}) is `null`, and its cell is `-`.
 *
 * @param stored The values of the JSON text.
 * @returns The values.
 */
function restoreLaps(stored: StoredLaps): LapWorsts {
  const one = (worst: StoredLapWorst): LapWorst => ({ ...worst, value: worst.value ?? Infinity });
  const maybe = (worst: StoredLapWorst | null): LapWorst | null => (worst ? one(worst) : null);
  return {
    endGap: one(stored.endGap),
    endDepth: one(stored.endDepth),
    heldDepth: one(stored.heldDepth),
    tilt: maybe(stored.tilt),
    pawPlace: maybe(stored.pawPlace),
    bowTilt: maybe(stored.bowTilt),
    frogGap: maybe(stored.frogGap),
    frogDepth: maybe(stored.frogDepth),
    bowBody: maybe(stored.bowBody),
    bowArms: maybe(stored.bowArms),
    elbowRise: maybe(stored.elbowRise ?? null),
    elbowBack: maybe(stored.elbowBack ?? null),
    elbowOut: maybe(stored.elbowOut ?? null),
    upperArm: maybe(stored.upperArm ?? null),
  };
}

/**
 * Writes the share of the samples of a set with a fold.
 *
 * @param folds The folds.
 * @param set The sample set.
 * @param goal The largest share without a mark, or `null` for no mark.
 * @returns The text, such as `2.3% (103/4454) OVER`, or `-` for a set that the run skips.
 */
function foldCell(folds: FoldShares, set: 'play' | 'lift', goal: number | null): string {
  const { withFold, samples } = folds[set];
  if (samples === 0) {
    return '-';
  }
  const share = withFold / samples;
  const mark = goal !== null && share > goal ? ' OVER' : '';
  return `${(100 * share).toFixed(1)}% (${withFold}/${samples})${mark}`;
}

/**
 * Writes a length of the lap rest in cm.
 *
 * @param worst The largest value of the measure, or `null`.
 * @param goal The largest value without the mark `OVER`, in meters, or `null` for no mark.
 * @returns The text, such as `2.4 OVER`, or `-` with no value.
 */
function lapCell(worst: LapWorst | null | undefined, goal: number | null): string {
  if (!worst) {
    return '-';
  }
  return `${(worst.value * 100).toFixed(1)}${goal !== null && worst.value > goal ? ' OVER' : ''}`;
}

/**
 * Writes a tilt of the lap rest in degrees.
 *
 * @param worst The largest tilt, or `null`.
 * @param goal The largest tilt without the mark `OVER`, in degrees.
 * @returns The text, such as `18 OVER`, or `-` with no value.
 */
function tiltCell(worst: LapWorst | null | undefined, goal: number = TILT_GOAL): string {
  if (!worst) {
    return '-';
  }
  return `${worst.value.toFixed(0)}${worst.value > goal ? ' OVER' : ''}`;
}

/**
 * Writes the place of the left palm along the violin in the rest.
 *
 * @param worst The place farthest from the middle of `PAW_PLACES`, or `null`.
 * @returns The text, such as `0.38 OVER`, or `-` with no value.
 */
function placeCell(worst: LapWorst | null | undefined): string {
  if (!worst) {
    return '-';
  }
  const out = worst.value < PAW_PLACES[0] || worst.value > PAW_PLACES[1];
  return `${worst.value.toFixed(2)}${out ? ' OVER' : ''}`;
}

/**
 * Writes the cells of the lap rest of a row: the gap of the lower end with its depth in the body,
 * and for a violin role the deepest corner of the violin in the body, the tilt of the violin, the place of the left palm, the tilt of the bow,
 * the gap of the frog end with its depth in the body, the deepest points of the bow in the
 * body and in the arms, the rise of the right elbow above the shoulder, its distances behind the
 * back and out from the side of the trunk, and the angle of the right upper arm.
 *
 * @param lap The lap rest of the row, or `null`.
 * @param bow True for a table with the violin columns.
 * @returns The cells.
 */
function lapCells(lap: LapWorsts | null, bow: boolean): string[] {
  if (!lap) {
    return ['-', ...(bow ? ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'] : [])];
  }
  const violin = lap.bowTilt !== null;
  const end = `${lapCell(lap.endGap, LAP_GAP_GOAL)} (${lapCell(lap.endDepth, violin ? END_DEPTH_GOAL : null)})`;
  if (!bow) {
    return [end];
  }
  const frog = lap.frogGap
    ? `${lapCell(lap.frogGap, FROG_GAP_GOAL)} (${lapCell(lap.frogDepth, FROG_DEPTH_GOAL)})`
    : '-';
  return [
    end,
    lapCell(lap.heldDepth, HELD_DEPTH_GOAL),
    tiltCell(lap.tilt),
    placeCell(lap.pawPlace),
    tiltCell(lap.bowTilt),
    frog,
    lapCell(lap.bowBody, BOW_DEPTH_GOAL),
    lapCell(lap.bowArms, BOW_DEPTH_GOAL),
    lapCell(lap.elbowRise, ELBOW_RISE_GOAL),
    lapCell(lap.elbowBack, ELBOW_BACK_GOAL),
    lapCell(lap.elbowOut, ELBOW_OUT_GOAL),
    tiltCell(lap.upperArm, UPPER_ARM_GOAL),
  ];
}

/**
 * Writes the header cells of the lap rest ({@link lapCells}).
 *
 * @param bow True for a table with the violin columns.
 * @returns The cells.
 */
function lapHeader(bow: boolean): string[] {
  return [
    'Rest end gap cm (in body)',
    ...(bow
      ? [
          'Rest violin in body cm',
          'Rest violin tilt °',
          'Rest paw L place',
          'Rest bow tilt °',
          'Rest frog gap cm (in body)',
          'Rest bow in body cm',
          'Rest bow in arms cm',
          'Rest elbow R rise cm',
          'Rest elbow R back cm',
          'Rest elbow R out cm',
          'Rest upper arm R °',
        ]
      : []),
  ];
}

/** The header cells of the spare reach of the grips of a wind hold ({@link spareCells}). */
const SPARE_HEADER: readonly string[] = ['Spare L cm play / rest', 'Spare R cm play / rest'];

/**
 * Writes the cells of the spare reach of each grip of a wind hold: the spare reach in the playing
 * pose and in the rest pose, in cm, with `MISS` below 0, and `free` for a paw that leaves its grip
 * in the rest pose.
 *
 * @param spare The spare reach of each grip, or `null`.
 * @returns The cell of each side, or `-` with no spare reach.
 */
function spareCells(spare: GripSpares | null): string[] {
  const cm = (value: number | null): string => {
    if (value === null) {
      return 'free';
    }
    return `${(value * 100).toFixed(1)}${value < 0 ? ' MISS' : ''}`;
  };
  return (['L', 'R'] as const).map((side) =>
    spare ? `${cm(spare[side].play)} / ${cm(spare[side].rest)}` : '-',
  );
}

/**
 * Counts the grips of a wind hold that the palm misses, in the playing pose and in the rest pose.
 *
 * @param spare The spare reach of each grip, or `null`.
 * @returns The number of the spare reaches below 0.
 */
function spareMisses(spare: GripSpares | null): number {
  if (!spare) {
    return 0;
  }
  const values = [spare.L.play, spare.L.rest, spare.R.play, spare.R.rest];
  return values.filter((value) => value !== null && value < 0).length;
}

/**
 * Writes the table of `pnpm hold-fit`: one row for each variant, with the play folds and the lift
 * folds, the most folded faces of one rest sample by side, the share of the play samples in which
 * each face of `--faces-of` folds, the deepest point of each sample set in
 * cm with its pair and its limit, the largest note-target error with the share of the targets
 * within `TARGET_REACH` of `tools/pose-depth.ts`, the instrument in the body with its set, the gap of each free
 * paw to the body in the rest in cm, the spare reach of each grip of a wind hold
 * ({@link spareCells}), the reach share of the rest place of each free paw, the lap
 * rest, and the reach of a violin role. The lap rest gives the gap of the lower end of the
 * instrument to the skin under it with the depth of its deepest corner in the body, and with a bow
 * the depth of the violin in the body, the tilt of the violin, the place of the left palm on it, the tilt of the bow, the gap of the
 * frog end to the right thigh with its depth in the body, the deepest points of the bow in the
 * body and in the arms, and the place of the right elbow and the angle of the right upper arm
 * ({@link lapCells}). A mark `OVER` follows a depth over its limit, play folds
 * over {@link PLAY_FOLD_GOAL}, a reach share above 1, and a lap measure outside its goal
 * ({@link LAP_GAP_GOAL}, {@link END_DEPTH_GOAL}, {@link HELD_DEPTH_GOAL}, {@link TILT_GOAL}, `PAW_PLACES`,
 * {@link FROG_GAP_GOAL}, {@link FROG_DEPTH_GOAL}, {@link BOW_DEPTH_GOAL}, {@link ELBOW_RISE_GOAL},
 * {@link ELBOW_BACK_GOAL}, {@link ELBOW_OUT_GOAL}, {@link UPPER_ARM_GOAL}).
 *
 * @param rows The rows, the base first.
 * @returns The lines.
 */
export function fitTable(rows: readonly FitRow[]): string[] {
  const sets = [...new Set(rows.flatMap((row) => row.depths.map((d) => d.set)))];
  const violin = rows.some((row) => row.reach);
  const held = rows.some((row) => row.held);
  const paws = [...new Set(rows.flatMap((row) => row.gaps.map((gap) => gap.paw)))];
  const sides = [...new Set(rows.flatMap((row) => row.free.map((free) => free.side)))];
  const lap = rows.some((row) => row.lap);
  const bow = rows.some((row) => row.lap?.bowTilt);
  const grips = rows.some((row) => row.spare);
  const reaches = rows.map((row) => joinReach(row.results));
  const targets = reaches.some((reached) => reached.samples > 0);
  const turnSet = rows.find((row) => row.turns)?.turns?.set;
  const named = rows.find((row) => row.facesOf.length > 0)?.facesOf.map(({ face }) => face) ?? [];
  const header = [
    'Variant',
    'Play folds',
    'Lift folds',
    'Rest faces (by side)',
    ...named.map((face) => `Face ${face} play`),
    ...sets.map((set) => `${set} depth cm (limit)`),
    ...(targets ? [`Note targets: worst mm (within ${TARGET_REACH * 1000} mm)`] : []),
    ...(turnSet ? [`${turnSet} turns: upper arm, paw (twist, swing) L / R`] : []),
    ...(held ? ['Instrument in body cm'] : []),
    ...(grips ? SPARE_HEADER : []),
    ...paws.map((paw) => `Rest gap ${paw} cm`),
    ...sides.map((side) => `Rest reach ${side}`),
    ...(lap ? lapHeader(bow) : []),
    ...(violin ? ['Rule scale', 'Violin m', 'stopRange', 'bowRange'] : []),
  ];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const [k, row] of rows.entries()) {
    const reached = reaches[k];
    const targetCell =
      reached && reached.samples > 0
        ? `${(reached.worst * 1000).toFixed(1)} (${((100 * reached.within) / reached.samples).toFixed(1)}%)`
        : '-';
    const turns = row.turns;
    const angles = (arm: ArmAngles): string => {
      const parts =
        arm.twist === undefined || arm.swing === undefined
          ? ''
          : ` (${arm.twist.toFixed(0)}°, ${arm.swing.toFixed(0)}°)`;
      return `${arm.upper.toFixed(0)}°, ${arm.paw.toFixed(0)}°${parts}`;
    };
    const turnCell = turns ? `${angles(turns.L)} / ${angles(turns.R)}` : '-';
    const depths = sets.map((set) => {
      const worst = row.depths.find((d) => d.set === set);
      if (!worst) {
        return '-';
      }
      const { pair, limit } = worst;
      const mark = pair.depth > limit ? ' OVER' : '';
      return `${(pair.depth * 100).toFixed(1)} ${pair.part}>${pair.into} (${(limit * 100).toFixed(1)})${mark}`;
    });
    const heldMark = row.held && row.held.pair.depth > row.held.limit ? ' OVER' : '';
    const heldCell = row.held
      ? `${(row.held.pair.depth * 100).toFixed(1)} ${row.held.set}${heldMark}`
      : '-';
    const gapCells = paws.map((paw) => {
      const gap = row.gaps.find((g) => g.paw === paw);
      return gap ? (gap.gap * 100).toFixed(1) : '-';
    });
    const reachCells = sides.map((side) => {
      const free = row.free.find((f) => f.side === side);
      if (!free) {
        return '-';
      }
      return free.share === null
        ? 'hangs'
        : `${free.share.toFixed(3)}${free.share > 1 ? ' OVER' : ''}`;
    });
    const reach = row.reach;
    const rule = reach ? ruleSize(reach) : null;
    const ranges = reach ? rangeTexts(reach) : null;
    const cells = [
      row.variant || 'base',
      foldCell(row.folds, 'play', PLAY_FOLD_GOAL),
      foldCell(row.folds, 'lift', null),
      row.folds.rest.samples > 0
        ? `${row.folds.rest.most} (${splitText(row.folds.rest.split)})`
        : '-',
      ...named.map((face) => {
        const share = row.facesOf.find((f) => f.face === face);
        return share ? foldShareText(share.shares.play) : '-';
      }),
      ...depths,
      ...(targets ? [targetCell] : []),
      ...(turnSet ? [turnCell] : []),
      ...(held ? [heldCell] : []),
      ...(grips ? spareCells(row.spare) : []),
      ...gapCells,
      ...reachCells,
      ...(lap ? lapCells(row.lap, bow) : []),
      ...(violin
        ? [
            rule ? rule.scale.toFixed(3) : 'none',
            reach ? reach.length.toFixed(3) : '-',
            ranges?.stop ?? '-',
            ranges?.bow ?? '-',
          ]
        : []),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Writes the table of the samples of the deepest points of {@link fitTable}: one row for each
 * variant, with the demo and the time of the deepest point of each sample set and of the
 * instrument in the body (`sampleAt()` of `tools/pose-depth.ts`).
 *
 * @param rows The rows, in the order of the fit table.
 * @returns The lines: an empty line, a title, and the table, or none with no deepest point.
 */
export function placeTable(rows: readonly FitRow[]): string[] {
  const sets = [...new Set(rows.flatMap((row) => row.depths.map((d) => d.set)))];
  const held = rows.some((row) => row.held);
  if (sets.length === 0 && !held) {
    return [];
  }
  const header = [
    'Variant',
    ...sets.map((set) => `${set} deepest at`),
    ...(held ? ['Instrument in body at'] : []),
  ];
  const lines = [
    '',
    'The demo and the time of each deepest point of the table:',
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
  ];
  for (const row of rows) {
    const cells = sets.map((set) => {
      const worst = row.depths.find((d) => d.set === set);
      return worst ? sampleAt(worst.demo, set, worst.pair) : '-';
    });
    const heldCell = row.held ? sampleAt(row.held.demo, row.held.set, row.held.pair) : '-';
    lines.push(`| ${[row.variant || 'base', ...cells, ...(held ? [heldCell] : [])].join(' | ')} |`);
  }
  return lines;
}

/** The rest of one variant in one rest sample of a scan (`--scan`). */
export interface ScanRow {
  /** The text of the changes, or empty for the base. */
  readonly variant: string;
  /** The rest sample ({@link ScanSample.sample}). */
  readonly sample: string;
  /** The folded faces of the studio skin by the side of their main bone. */
  readonly folds: SideSplit;
  /** The lap rest of the sample, as the largest values of one sample, or `null` for none. */
  readonly lap: LapWorsts | null;
  /** The depth of the instrument in the body in the sample, in meters (`ScanRest.held`). */
  readonly held: number;
  /** The spare reach of each grip of a wind hold ({@link windSpare}), or `null` for none. */
  readonly spare: GripSpares | null;
}

/**
 * Counts the goals that a scan row misses: the cells of the lap rest ({@link lapCells}) with the
 * mark `OVER`, and the grips of a wind hold that the palm misses ({@link spareMisses}).
 *
 * @param row The row.
 * @param bow True for a table with the violin columns.
 * @returns The number of missed goals.
 */
export function scanMisses(row: ScanRow, bow: boolean): number {
  const lap = row.lap ? lapCells(row.lap, bow).filter((cell) => cell.includes('OVER')).length : 0;
  return lap + spareMisses(row.spare);
}

/**
 * Writes the table of a scan: one row for each variant and rest sample, with the folded faces of
 * the studio skin by side, the goals that the row misses ({@link scanMisses}), for a wind hold the
 * instrument in the body and the spare reach of each grip ({@link spareCells}), and the cells of
 * the lap rest of the rest columns of a run ({@link lapCells}). A wind hold with no lap rest has
 * no lap columns. A run with one sample has no column of the sample.
 *
 * @param rows The rows, the base first.
 * @returns The lines.
 */
export function scanTable(rows: readonly ScanRow[]): string[] {
  const samples = new Set(rows.map((row) => row.sample)).size > 1;
  const bow = rows.some((row) => row.lap?.bowTilt);
  const grips = rows.some((row) => row.spare);
  const lap = !grips || rows.some((row) => row.lap);
  const header = [
    'Variant',
    ...(samples ? ['Sample'] : []),
    'Rest faces (by side)',
    'Goals missed',
    ...(grips ? ['Rest instrument in body cm', ...SPARE_HEADER] : []),
    ...(lap ? lapHeader(bow) : []),
  ];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const row of rows) {
    const { L, R, other } = row.folds;
    const cells = [
      row.variant || 'base',
      ...(samples ? [row.sample] : []),
      `${L + R + other} (${splitText(row.folds)})`,
      String(scanMisses(row, bow)),
      ...(grips ? [(row.held * 100).toFixed(1), ...spareCells(row.spare)] : []),
      ...(lap ? lapCells(row.lap, bow) : []),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Sorts the rows of a scan by variant: the base first, then the variants by the goals that they
 * miss over their samples ({@link scanMisses}), and at the same count by their folded faces. The
 * rows of one variant stay together, in the order of the samples.
 *
 * @param rows The rows, the base first, the rows of each variant together.
 * @returns The sorted rows.
 */
export function sortScanRows(rows: readonly ScanRow[]): ScanRow[] {
  const bow = rows.some((row) => row.lap?.bowTilt);
  const groups = new Map<string, ScanRow[]>();
  for (const row of rows) {
    const group = groups.get(row.variant) ?? [];
    group.push(row);
    groups.set(row.variant, group);
  }
  const sum = (group: readonly ScanRow[], value: (row: ScanRow) => number): number =>
    group.reduce((total, row) => total + value(row), 0);
  const misses = (group: readonly ScanRow[]): number => sum(group, (row) => scanMisses(row, bow));
  const folds = (group: readonly ScanRow[]): number =>
    sum(group, (row) => row.folds.L + row.folds.R + row.folds.other);
  const [base, ...variants] = [...groups.values()];
  return [
    ...(base ?? []),
    ...variants.toSorted((a, b) => misses(a) - misses(b) || folds(a) - folds(b)).flat(),
  ];
}

/**
 * Sorts the rows of a run: the base first, then the variants by the share of the play samples
 * with a fold, and at the same share by the deepest point: the largest depth less its limit over
 * the sample sets. A variant with no sweep has the deepest point 0.
 *
 * @param rows The rows, the base first.
 * @returns The sorted rows.
 */
export function sortFitRows(rows: readonly FitRow[]): FitRow[] {
  const [base, ...variants] = rows;
  const share = (row: FitRow): number =>
    row.folds.play.withFold / Math.max(1, row.folds.play.samples);
  const margin = (row: FitRow): number =>
    row.depths.length > 0 ? Math.max(...row.depths.map((d) => d.pair.depth - d.limit)) : 0;
  return [
    ...(base ? [base] : []),
    ...variants.toSorted((a, b) => share(a) - share(b) || margin(a) - margin(b)),
  ];
}

/**
 * Writes the faces of `--faces` for the base, for the working tree with no change when the base is
 * another row, such as the row of the commit of `--base`, and for the best variant: the first
 * variant of {@link sortFitRows}.
 *
 * @param base The row of the base, such as the row of the commit of `--base`.
 * @param baseName The name of the base.
 * @param rows The rows of the working tree, the base first.
 * @returns The lines, or none when no row has faces.
 */
export function faceSections(
  base: FitRow | undefined,
  baseName: string,
  rows: readonly FitRow[],
): string[] {
  const [own] = rows;
  const best = sortFitRows(rows)[1];
  const sections: [string, FitRow | undefined][] = [[baseName, base]];
  if (own !== base) {
    sections.push(['the working tree', own]);
  }
  sections.push([`the best variant, ${best?.variant ?? ''}`, best]);
  const lines: string[] = [];
  for (const [name, row] of sections) {
    if (row && row.faces.length > 0) {
      lines.push('', `Faces of ${name}:`, '', ...row.faces);
    }
  }
  return lines;
}

/**
 * Writes the size of the grids of a run.
 *
 * @param grids The grids.
 * @param bases The number of variants of `--set` that the grids go on top of: 1 with no `--set`.
 * @param limit The largest number of variants of the grids.
 * @param order The order of the sorted rows.
 * @returns The text, such as `Grids: 3 × 4 = 12 variants (the limit is 40), sorted by ...`, or
 *   empty with no grid.
 */
function gridText(
  grids: readonly string[],
  bases: number,
  limit: number = GRID_LIMIT,
  order = 'the play folds, then by the deepest point',
): string {
  if (grids.length === 0) {
    return '';
  }
  const counts = grids.map((grid) => gridChanges(grid).length);
  const total = counts.reduce((product, n) => product * n, 1);
  const on = bases > 1 ? ` on top of each of ${bases} --set variants, ${total * bases} in all` : '';
  return `Grids: ${counts.join(' × ')} = ${total} variants${on} (the limit is ${limit}), sorted by ${order}.`;
}

/**
 * Gives the instrument under the chin of a role, for the reach of `pnpm hold-reach`.
 *
 * @param role The role.
 * @returns The species and the instrument, or `null` for a role with no violin or viola.
 */
function chinOf(
  role: RoleSource,
): { readonly species: SpeciesId; readonly instrument: ChinInstrument } | null {
  if (role.kind !== 'player' || (role.instrument !== 'violin' && role.instrument !== 'viola')) {
    return null;
  }
  const [species] = role.species;
  return species ? { species, instrument: role.instrument } : null;
}

/**
 * Gives the wind instrument of a role, for the free paws of its hold.
 *
 * @param role The role.
 * @returns The species and the instrument, or `null` for a role with no woodwind or brass.
 */
function windOf(
  role: RoleSource,
): { readonly species: SpeciesId; readonly instrument: WindInstrument } | null {
  if (role.kind !== 'player' || !isInFamily(role.instrument, ['woodwind', 'brass'])) {
    return null;
  }
  const [species] = role.species;
  return species ? { species, instrument: role.instrument } : null;
}

/**
 * Tells if a seated player of a role rests its instrument on the lap: a violin or a viola, which
 * stands upright on the thighs (design 5.2), or a wind instrument of {@link LEG_RESTS}.
 *
 * @param role The role.
 * @returns True for a role whose rest the lap columns measure.
 */
export function hasLapRest(role: RoleSource): boolean {
  const wind = windOf(role);
  return chinOf(role) !== null || (!!wind && LEG_RESTS.has(`${wind.instrument}@${wind.species}`));
}

/**
 * Gives the reach share of the rest place of each free paw of a wind role on the chair
 * (`freeRestReach()` of `pnpm hold-reach`).
 *
 * @param role The role.
 * @returns The share of each free paw, or none for a role with no free paw.
 */
function freeShares(role: RoleSource): FreeShare[] {
  const wind = windOf(role);
  if (!wind) {
    return [];
  }
  return freeRestReach(wind.species, wind.instrument, 'chair').map((reach) => ({
    side: reach.side,
    share: reachShare(reach),
  }));
}

/**
 * Gives the spare reach of each grip of the wind hold of a role on the chair, with the current
 * holds (`spareRow()` of `pnpm hold-reach`).
 *
 * @param role The role.
 * @returns The spare reach of each grip, or `null` for a role with no wind hold.
 */
function windSpare(role: RoleSource): GripSpares | null {
  const wind = windOf(role);
  return wind ? spareRow('', wind.species, wind.instrument, 'chair').spare : null;
}

/**
 * Counts the notes of a role in a scene: the notes of each player whose instrument and species
 * are those of the role, or the beats of the plan for the conductor.
 *
 * @param role The role.
 * @param scene The scene.
 * @returns The number of notes.
 */
export function roleNotes(role: RoleSource, scene: TestScene): number {
  if (role.kind === 'conductor') {
    return scene.plan.beats.length;
  }
  const players = new Set(
    scene.layout.players
      .filter(
        ({ cast }) => cast.instrument === role.instrument && role.species.includes(cast.species),
      )
      .map(({ cast }) => `${cast.seatIndex}:${cast.player}`),
  );
  return scene.score.notes.filter((note) => players.has(`${note.seatIndex}:${note.player}`)).length;
}

/**
 * Chooses the demo ids of a run.
 *
 * @param asked The demos of `--demo`, with no `.mid`, or `all`.
 * @param withRole The ids of the demos with a body of the role.
 * @param notes The notes of the role in each demo of `withRole` ({@link roleNotes}).
 * @returns The ids of `--demo`, all ids of the role with `all`, or the ids of {@link FIT_DEMOS}
 *   with the role. When no demo of {@link FIT_DEMOS} has the role, the one id of the role with the
 *   most notes, the first of a tie.
 */
export function chooseDemos(
  asked: readonly string[],
  withRole: readonly string[],
  notes: ReadonlyMap<string, number>,
): string[] {
  if (asked.includes('all')) {
    return [...withRole];
  }
  if (asked.length > 0) {
    return withRole.filter((id) => asked.includes(id));
  }
  const fit = withRole.filter((id) => FIT_DEMOS.includes(id));
  if (fit.length > 0) {
    return fit;
  }
  const most = withRole.reduce<string | null>(
    (best, id) => (best === null || (notes.get(id) ?? 0) > (notes.get(best) ?? 0) ? id : best),
    null,
  );
  return most === null ? [] : [most];
}

/**
 * Gives the demos of the options ({@link chooseDemos}).
 *
 * @param options The options.
 * @returns The demo files, and the scene of the first one.
 * @throws Error if a demo of `--demo` does not exist or has no body of the role, or if no demo
 *   has the role.
 */
async function fitDemos(
  options: FitOptions,
): Promise<{ readonly demos: DemoFile[]; readonly first: TestScene }> {
  const all = await probeDemos(options.midi);
  const id = (demo: DemoFile): string => demo.file.replace(/\.mid$/, '');
  const unknown = options.demos.filter(
    (name) => name !== 'all' && !all.some((demo) => id(demo) === name),
  );
  if (unknown.length > 0) {
    throw new Error(`No demo has the name ${unknown.join(', ')}.`);
  }
  const scenes = new Map<string, TestScene>();
  const notes = new Map<string, number>();
  for (const demo of all) {
    const scene = roleScene(options.role, demo.bytes);
    if (roleBodies(options.role, scene).length > 0) {
      scenes.set(id(demo), scene);
      notes.set(id(demo), roleNotes(options.role, scene));
    }
  }
  const missing = options.demos.filter((name) => name !== 'all' && !scenes.has(name));
  if (missing.length > 0) {
    throw new Error(`The demos ${missing.join(', ')} have no body of the ${options.name}.`);
  }
  const ids = chooseDemos(options.demos, [...scenes.keys()], notes);
  const first = scenes.get(ids[0] ?? '');
  if (!first) {
    throw new Error(`No demo has the role ${options.name}.`);
  }
  return { demos: all.filter((demo) => ids.includes(id(demo))), first };
}

/**
 * Writes a length in cm.
 *
 * @param value The length, in meters.
 * @returns The text, such as `1.5 cm`.
 */
function cmText(value: number): string {
  return `${(value * 100).toFixed(1)} cm`;
}

/**
 * Writes the time, the faces that fold most, and the deepest point of each sample set of a row.
 *
 * @param row The row.
 */
function printRow(row: FitRow): void {
  console.log(`${row.variant || 'base'} (${row.seconds.toFixed(1)} s):`);
  console.log(`  faces that fold most: ${topFoldsText(row.topFolds)}`);
  for (const { set, demo, pair } of row.depths) {
    console.log(`  ${set}: ${pairText(pair)}, ${demo}`);
  }
  if (row.held) {
    console.log(`  ${row.held.set}: ${pairText(row.held.pair)}, ${row.held.demo}`);
  }
  for (const { paw, gap, demo } of row.gaps) {
    console.log(`  rest: ${paw} to body: ${(gap * 100).toFixed(1)} cm, ${demo}`);
  }
  const lap = row.lap;
  if (!lap) {
    return;
  }
  const lines: [string, LapWorst | null, (value: number) => string][] = [
    ['lower end to the skin', lap.endGap, cmText],
    ['lower end in the body', lap.endDepth, cmText],
    ['instrument in the body', lap.heldDepth, cmText],
    ['tilt of the instrument', lap.tilt, (v) => `${v.toFixed(1)}°`],
    ['place of the left palm', lap.pawPlace, (v) => v.toFixed(2)],
    ['tilt of the bow', lap.bowTilt, (v) => `${v.toFixed(1)}°`],
    ['frog end to the right thigh', lap.frogGap, cmText],
    ['frog end in the body', lap.frogDepth, cmText],
    ['bow in the body', lap.bowBody, cmText],
    ['bow in the arms', lap.bowArms, cmText],
    ['right elbow above the shoulder', lap.elbowRise, cmText],
    ['right elbow behind the back', lap.elbowBack, cmText],
    ['right elbow out from the side', lap.elbowOut, cmText],
    ['right upper arm from the vertical', lap.upperArm, (v) => `${v.toFixed(1)}°`],
  ];
  for (const [name, worst, text] of lines) {
    if (worst) {
      console.log(`  rest: ${name}: ${text(worst.value)}, ${worst.sample}`);
    }
  }
}

/**
 * Fits the commit of `--base` and the working tree at the same time, each in a child process
 * (`probeBeside()`). The commit runs the base with no change, with the tools of the commit. A role
 * that the commit does not have stops the run before the probes (`checkRefRole()`). Then the tool
 * writes the table with the row of the commit first, and one compare of the deepest points of each
 * variant with the commit, in the H of each body (`compareDepths()`).
 *
 * @param options The options.
 * @param ref The commit, the branch, or the tag.
 */
async function compareFit(options: FitOptions, ref: string): Promise<void> {
  const label = `${ref} (${shortHash(ref)})`;
  const args = withoutOptions(absoluteMidi(process.argv.slice(2)), ['--base']);
  if (options.demos.length === 0) {
    // The one demo with the most notes goes to both children by name, because the hold-fit of an
    // older commit takes all demos of a role that no demo of FIT_DEMOS has.
    const ids = (await fitDemos(options)).demos.map((demo) => demo.file.replace(/\.mid$/, ''));
    if (!ids.some((id) => FIT_DEMOS.includes(id))) {
      args.push(...ids.flatMap((id) => ['--demo', id]));
    }
  }
  const started = performance.now();
  const texts = await probeBeside(
    ref,
    'hold-fit.ts',
    { base: withoutOptions(args, ['--set', '--grid', '--faces-of']), tree: args },
    {
      prefix: 'hold-fit-',
      role: { ...FOLD_ROLE_TABLE, name: options.name },
      cache: true,
    },
  );
  const base = readFit(texts.base);
  const tree = readFit(texts.tree);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Hold fit of the ${options.name} on ${label} and on the working tree: ${seconds} s.`);
  console.log(`Demos of ${label}: ${base.demos.join(', ')}`);
  console.log(`Demos of the working tree: ${tree.demos.join(', ')}`);
  if (options.sets.length < FIT_SETS.length) {
    console.log(`Sample sets: ${options.sets.join(', ')}.`);
  }
  const grid = gridText(options.grids, options.gridBases);
  if (grid) {
    console.log(grid);
  }
  const [first] = base.rows;
  const rows = options.grids.length > 0 ? sortFitRows(tree.rows) : [...tree.rows];
  for (const row of rows) {
    printRow(row);
  }
  const shown = [...(first ? [{ ...first, variant: label }] : []), ...rows];
  console.log(['', ...fitTable(shown), ...placeTable(shown)].join('\n'));
  if (options.faces > 0) {
    console.log(faceSections(first, label, tree.rows).join('\n'));
  }
  for (const { variant, results } of rows) {
    console.log(`\nThe depths of ${label} and of the working tree with ${variant || 'no change'}:`);
    console.log(compareDepths(label, first?.results ?? [], results).join('\n'));
  }
}

/**
 * Finds the rest samples of a scan ({@link scanSamples}): with `--demo`, the first seated body of
 * the role in each demo of the run, and with no `--demo`, only in the first demo of the run with a
 * seated body of the role.
 *
 * @param options The options.
 * @param demos The demos of the run.
 * @returns The samples.
 * @throws Error if no demo of the run has a seated body of the role.
 */
function scanSamplesOf(options: FitOptions, demos: readonly DemoFile[]): ScanSample[] {
  if (options.demos.length > 0) {
    return scanSamples(options.role, demos, options.walls);
  }
  for (const demo of demos) {
    const samples = scanSamples(options.role, [demo], options.walls);
    if (samples.length > 0) {
      return samples;
    }
  }
  throw new Error(`No demo of the run has a seated body of the ${options.name}.`);
}

/**
 * Scans the variants of the rest of a role with a lap rest or a wind hold (`--scan`). For each
 * variant, it builds only the rig of the player of each rest sample again (`scanRest()` of
 * `tools/lap-rest.ts`), in place of the scenes of each demo, and writes one row for each variant
 * and sample: the folded faces of the studio skin by side, the cells of the lap rest of the rest
 * columns, and for a wind hold the instrument in the body and the spare reach of each grip
 * ({@link windSpare}). With a
 * grid, the rows are sorted by {@link sortScanRows}. It prints its samples and its time.
 *
 * @param options The options.
 * @throws Error if the role has no lap rest and no wind hold, or no sweep with a body, or if no
 *   demo of the run has
 *   a seated body of the role.
 */
async function scanHolds(options: FitOptions): Promise<void> {
  const laps = hasLapRest(options.role);
  if (!laps && !windOf(options.role)) {
    throw new Error(
      `The scan measures the lap rest or a wind hold, and the ${options.name} has neither: only a violin, a viola, or a wind hold of LEG_RESTS has a lap rest.`,
    );
  }
  const started = performance.now();
  const { demos, first } = await fitDemos(options);
  const body = fitSweep(options.role, first, ['rest'])?.obstacles.find(
    (obstacle) => obstacle.name === BODY_OBSTACLE,
  );
  if (!body) {
    throw new Error(`The ${options.name} has no sweep with the obstacle ${BODY_OBSTACLE}.`);
  }
  const samples = scanSamplesOf(options, demos);
  console.log(
    `Hold scan of the ${options.name}: ${laps ? 'the lap rest' : 'the instrument in the body, the spare reach of the grips,'} and the folded faces by side of ${samples.length} rest sample${samples.length > 1 ? 's' : ''}. Each variant builds only the rig of the player again.`,
  );
  for (const { sample } of samples) {
    console.log(`Rest sample: ${sample}`);
  }
  const grid = gridText(
    options.grids,
    options.gridBases,
    SCAN_GRID_LIMIT,
    'the goals missed, then by the folded faces',
  );
  if (grid) {
    console.log(grid);
  }

  const scanned = performance.now();
  const rows: ScanRow[] = [];
  for (const variant of options.variants) {
    const { undo, text } = setHolds(variant);
    try {
      const spare = windSpare(options.role);
      for (const sample of samples) {
        const rest = scanRest(sample, body);
        const lap = laps && rest.lap ? lapWorsts([{ sample: rest.sample, rest: rest.lap }]) : null;
        const { folds, held } = rest;
        rows.push({ variant: text, sample: rest.sample, folds, lap, held, spare });
      }
    } finally {
      undo();
    }
  }
  const done = performance.now();
  console.log(['', ...scanTable(options.grids.length > 0 ? sortScanRows(rows) : rows)].join('\n'));
  const count = options.variants.length;
  console.log(
    `\nScan of ${count} variants × ${samples.length} samples: ${((done - scanned) / 1000).toFixed(1)} s, ${((done - scanned) / 1000 / count).toFixed(3)} s for each variant, and ${((scanned - started) / 1000).toFixed(1)} s for the scenes of the demos.`,
  );
}

/**
 * Fits the hold on the studio body of another GLB file (`--glb <file>`): the tool runs again with
 * the other arguments in a copy of `src/` with the module of the file (`withGlbBody()` of
 * `tools/glb-swap.ts`).
 *
 * @param options The options of the other arguments.
 * @param glb The absolute path of the GLB file.
 * @param args The other arguments, with no `--glb`.
 * @returns The exit code of the child.
 * @throws Error with `--base`.
 */
function fitGlb(options: FitOptions, glb: string, args: readonly string[]): Promise<number> {
  if (options.base !== null) {
    throw new Error(`The options --glb and --base do not go together.\n${USAGE}`);
  }
  return withGlbBody(roleAnimal(options.role), glb, (dir) => runTool(dir, 'hold-fit.ts', args));
}

/**
 * Runs the tool: `node tools/hold-fit.ts <role> [options]`. With `--glb <file>`, the fit runs on
 * the studio body of the file ({@link fitGlb}).
 */
async function main(): Promise<void> {
  const { glb, rest } = takeGlb(process.argv.slice(2));
  const options = parseFitOptions(rest);
  if (glb) {
    process.exitCode = await fitGlb(options, glb, rest);
    return;
  }
  if (options.scan) {
    await scanHolds(options);
    return;
  }
  if (options.base !== null) {
    await compareFit(options, options.base);
    return;
  }
  const { demos, first } = await fitDemos(options);
  const sweep = fitSweep(options.role, first, options.sets);
  const chin = chinOf(options.role);
  const laps = hasLapRest(options.role) && options.sets.includes('rest');
  const ids = demos.map((demo) => demo.file.replace(/\.mid$/, ''));
  console.log(
    `Hold fit of the ${options.name}: play folds at a step of ${options.step} s, ${sweep ? `the sweep of the ${sweep.role} with the bodies of the role` : 'no sweep (folds only)'}${chin ? `, and the reach of ${chin.species} with the ${chin.instrument}` : ''}.`,
  );
  console.log(`Demos: ${ids.join(', ')}`);
  if (options.sets.length < FIT_SETS.length) {
    console.log(`Sample sets: ${options.sets.join(', ')}.`);
  }
  const keep = options.technique === null ? undefined : techniqueFilter(options.technique);
  if (options.technique !== null) {
    console.log(
      `Play samples: only the samples of the ${options.technique} notes of the seat of each player.`,
    );
  }
  const grid = gridText(options.grids, options.gridBases);
  if (grid) {
    console.log(grid);
  }

  const rows: FitRow[] = [];
  let baseFolds: ReadonlySet<number> | null = null;
  for (const variant of options.variants) {
    const started = performance.now();
    const { undo, text } = setHolds(variant);
    try {
      const arms = armTurns();
      const report = probeFolds(
        options.role,
        demos,
        options.step,
        arms.visit,
        SAMPLE_SETS.filter((set) => options.sets.some((name) => name === set)),
        keep,
      );
      const swept = sweep
        ? await sweepDemos(
            {
              demos: ids,
              times: null,
              gaps: false,
              gapsOf: freeGaps(options.role),
              keep: keep ?? null,
            },
            sweep,
          )
        : [];
      const { held, results } = sweep ? splitHeld(sweep, swept) : { held: null, results: swept };
      const body = laps ? sweep?.obstacles.find((o) => o.name === BODY_OBSTACLE) : undefined;
      baseFolds ??= foldedFaces(report);
      const row: FitRow = {
        variant: text,
        folds: foldShares(report),
        depths: sweep ? worstPairs(sweep, results) : [],
        reach: chin ? holdReach(chin.species, chin.instrument, 'chair') : null,
        seconds: (performance.now() - started) / 1000,
        results,
        faces: options.faces > 0 ? faceLines(report, options.faces) : [],
        facesOf: reportShares(report, options.facesOf),
        topFolds: topFolds(report, baseFolds),
        held,
        gaps: restGaps(results),
        free: freeShares(options.role),
        lap: body ? probeLaps(options.role, demos, body) : null,
        turns: arms.turns(),
        spare: windSpare(options.role),
      };
      rows.push(row);
      printRow(row);
    } finally {
      undo();
    }
  }
  const table = options.grids.length > 0 ? sortFitRows(rows) : rows;
  console.log(['', ...fitTable(table), ...placeTable(table)].join('\n'));
  if (options.faces > 0) {
    console.log(faceSections(rows[0], 'the base', rows).join('\n'));
  }
  if (options.json !== null) {
    writeFileSync(options.json, fitJson({ demos: ids, rows }));
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
