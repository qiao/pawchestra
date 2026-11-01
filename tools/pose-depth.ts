import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { BOW_PART, bowSweep } from './bow-sweep.ts';
import { findRole, findSweep, roleAnimal } from './fold-probe.ts';
import type { PlayFilter } from './fold-probe.ts';
import { runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import type { DemoFile } from './patch-demos.ts';
import { absoluteMidi, midiPath, probeDemos, userDemoFile } from './probe-demos.ts';
import { setHolds } from './hold-sets.ts';
import { whereLines } from './part-where.ts';
import {
  PROBE_NO_CACHE,
  ROOT,
  probeBeside,
  probeCacheDir,
  shortHash,
  storeBase,
  treeCacheFile,
  withoutOptions,
} from './ref-tree.ts';
import type { RefRole } from './ref-tree.ts';
import { scoreOf } from '../src/score/test-score.ts';
import { CONDUCTOR } from '../src/models/cast.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { BONE_NAMES } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import type { NoteLayer, PlayerPlan } from '../src/pose/plan.ts';
import { createStrikeState, strikeStateAt } from '../src/pose/strikes.ts';
import type { StrikeTrack } from '../src/pose/strikes.ts';
import { recastSceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import {
  depthLimit,
  gapPairs,
  gapSweep,
  gapText,
  pairText,
  sweepDepths,
} from '../src/pose/test-sweep.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import type {
  AcceptedDepth,
  GapPair,
  PairDepth,
  PairGap,
  RoleSweep,
  SampleSet,
  SweepPart,
  SweepPlayer,
  SweepVisit,
  TargetError,
} from '../src/pose/test-sweep.ts';
import {
  SOLOIST_FILE,
  SOLOIST_ROLES,
  SWEEP_ROLES,
  playSample,
  soloistScene,
} from '../src/pose/test-sweep-roles.ts';
import type { SoloistRole } from '../src/pose/test-sweep-roles.ts';

/** The options of the command. */
export interface Options {
  /** The role of the first argument. */
  readonly role: RoleSweep;
  /**
   * The demos, by the name of the file with no `.mid`, with each file of `--midi`. All demos of the
   * role when empty.
   */
  readonly demos: readonly string[];
  /** The absolute paths of the MIDI files of the user of `--midi` (`userDemos()`). */
  readonly midi: readonly string[];
  /** The variants: each is a list of changes of the holds. The first is the base, with none. */
  readonly variants: readonly string[];
  /** The bones of the moving parts, one part for each bone, or `null` for the parts of the role. */
  readonly bones: readonly BoneName[] | null;
  /** The obstacles, or `null` for all obstacles of the role. */
  readonly into: readonly string[] | null;
  /**
   * The song times of a play, with the limits of a play, or `null` for the sample sets of the
   * role.
   */
  readonly times: readonly number[] | null;
  /** True to also measure the smallest gap of the head to each obstacle and of each paw to the body. */
  readonly gaps: boolean;
  /** True to measure only the note targets, with no sweep of the depths. */
  readonly targets: boolean;
  /** The file into which the tool writes its rows as JSON, or `null` for none. */
  readonly json: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /**
   * The species of the standing soloist of the violin and piano duo in place of the demos
   * (`soloistScene()`), or `null` for the demos.
   */
  readonly soloist: SpeciesId | null;
  /**
   * The goal of `--goal` for each pair, in meters, or `null` for the limit of each pair: the tool
   * counts the samples with a depth over it.
   */
  readonly goal: number | null;
  /**
   * True for one part for each arm bone in place of each group of arm bones of the role, with the
   * limits of the group (`--per-bone`, {@link perBoneRole}).
   */
  readonly perBone: boolean;
  /** The step of the play samples of `--every`: each n-th sample of the play. 1 takes all. */
  readonly every: number;
  /** The bone, the demo, and the song time of `--where`, or `null` for a sweep. */
  readonly where: WhereRequest | null;
}

/** The request of `--where <bone> <demo>:<time>`: the corners of one bone at one play sample. */
export interface WhereRequest {
  /** The bone. */
  readonly bone: BoneName;
  /** The demo, with no `.mid`. */
  readonly demo: string;
  /** The song time of the play sample, in seconds. */
  readonly song: number;
}

/**
 * The most `--set` rows of a run over all demos of its role: a run with more rows needs `--demo`
 * or `--long`. A sweep of the hornist with 4 rows over its 10 demos runs for more than 20 minutes.
 */
export const ROW_LIMIT = 5;

/** The text of the usage. */
const USAGE = `Usage: pnpm pose-depth <${Object.keys(SWEEP_ROLES).join(' | ')} | <role>@<species>> [--demo <id>]... [--midi <path>]... [--soloist <species>] [--set <path>=<value>[;<path>=<value>]...]... [--bones <list>] [--into <list>] [--times <list>] [--gaps] [--targets] [--goal <cm>] [--per-bone] [--every <n>] [--base <ref>] [--json <file>] [--long] [--glb <file>], or pnpm pose-depth <role> --where <bone> <demo>:<time> [--set <changes>]`;

/** The options of the command with no value. */
const FLAGS: ReadonlySet<string> = new Set(['--gaps', '--targets', '--long', '--per-bone']);

/**
 * Tells if a role name is a bowed role with a soloist ({@link SOLOIST_ROLES}).
 *
 * @param name The name of the role.
 * @returns True for a role of the table.
 */
function isSoloistRole(name: string): name is SoloistRole {
  return Object.keys(SOLOIST_ROLES).includes(name);
}

/**
 * Reads the species of the option `--soloist`: a species of the bowed role.
 *
 * @param role The name of the role.
 * @param value The value of the option.
 * @returns The species.
 * @throws Error if the role has no soloist, or the species is not a species of the role.
 */
function soloistOf(role: string, value: string): SpeciesId {
  if (!isSoloistRole(role)) {
    throw new Error(
      `The option --soloist goes only with a bowed role: ${Object.keys(SOLOIST_ROLES).join(', ')}.`,
    );
  }
  const allowed = SOLOIST_ROLES[role].species;
  if (!isSpeciesId(value) || !allowed.has(value)) {
    throw new Error(
      `The species "${value}" is not a species of the ${role}: ${[...allowed].join(', ')}.`,
    );
  }
  return value;
}

/**
 * Tells if a text is the name of a bone.
 *
 * @param name The text.
 * @returns True for a bone name.
 */
function isBone(name: string): name is BoneName {
  return BONE_NAMES.some((bone) => bone === name);
}

/** The arguments with the option `--where` taken out ({@link takeWhere}). */
interface WhereArgs {
  /** The request of `--where`, or `null` with no `--where`. */
  readonly where: WhereRequest | null;
  /** The other arguments. */
  readonly rest: string[];
}

/**
 * Takes the option `--where <bone> <demo>:<time>` out of the arguments.
 *
 * @param args The arguments after the role.
 * @returns The request, or `null` with no `--where`, and the other arguments.
 * @throws Error if the bone is not known, or the place is not `<demo>:<time>`.
 */
function takeWhere(args: readonly string[]): WhereArgs {
  const at = args.indexOf('--where');
  if (at < 0) {
    return { where: null, rest: [...args] };
  }
  const bone = args[at + 1] ?? '';
  const place = args[at + 2] ?? '';
  const colon = place.lastIndexOf(':');
  const song = Number(place.slice(colon + 1));
  if (!isBone(bone)) {
    throw new Error(
      `The option --where takes a bone first, and "${bone}" is not a bone.\n${USAGE}`,
    );
  }
  if (colon < 1 || place.slice(colon + 1).trim() === '' || !Number.isFinite(song)) {
    throw new Error(`The option --where takes <demo>:<time> after the bone, and not "${place}".`);
  }
  const demo = place.slice(0, colon).replace(/\.mid$/, '');
  return { where: { bone, demo, song }, rest: [...args.slice(0, at), ...args.slice(at + 3)] };
}

/**
 * Reads the options from the arguments of the command.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error if an option is not known, or a value does not fit.
 */
export function parseOptions(args: readonly string[]): Options {
  const [name, ...given] = args;
  const role = findSweep(name ?? '');
  if (!role) {
    throw new Error(USAGE);
  }
  const { where, rest } = takeWhere(given);
  const demos: string[] = [];
  const midi: string[] = [];
  const variants = [''];
  let bones: BoneName[] | null = null;
  let into: string[] | null = null;
  let times: number[] | null = null;
  let json: string | null = null;
  let base: string | null = null;
  let soloist: SpeciesId | null = null;
  let goal: number | null = null;
  let every = 1;
  // The flags --gaps, --targets, --long, and --per-bone have no value. Each other option has one.
  const gaps = rest.includes('--gaps');
  const targets = rest.includes('--targets');
  const long = rest.includes('--long');
  const perBone = rest.includes('--per-bone');
  const valued = rest.filter((arg) => !FLAGS.has(arg));
  for (let i = 0; i < valued.length; i += 2) {
    const value = valued[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${valued[i]}" has no value.\n${USAGE}`);
    }
    const list = value.split(',');
    switch (valued[i]) {
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--midi':
        // A file of the user is one more demo of the sweep, so the sweep reads only the files of
        // --midi and --demo.
        midi.push(midiPath(value));
        demos.push(userDemoFile(value).replace(/\.mid$/, ''));
        break;
      case '--set':
        variants.push(value);
        break;
      case '--bones':
        bones = list.map((bone) => {
          if (!isBone(bone)) {
            throw new Error(`The bone "${bone}" is not known.`);
          }
          return bone;
        });
        break;
      case '--into':
        into = list.map((obstacle) => {
          if (!role.obstacles.some((o) => o.name === obstacle)) {
            throw new Error(
              `The part "${obstacle}" is not an obstacle of the ${role.role}: ${role.obstacles.map((o) => o.name).join(', ')}.`,
            );
          }
          return obstacle;
        });
        break;
      case '--json':
        json = value;
        break;
      case '--base':
        base = value;
        break;
      case '--soloist':
        soloist = soloistOf(role.role, value);
        break;
      case '--times':
        times = list.map(Number);
        if (times.some((t) => !Number.isFinite(t))) {
          throw new Error(`The times "${value}" are not numbers.`);
        }
        break;
      case '--every':
        every = Number(value);
        if (!Number.isInteger(every) || every < 1) {
          throw new Error(
            `The option --every takes a whole number of 1 or more, and not "${value}".`,
          );
        }
        break;
      case '--goal':
        goal = Number(value) / 100;
        if (value.trim() === '' || !Number.isFinite(goal) || goal < 0) {
          throw new Error(`The option --goal takes a depth of 0 cm or more, and not "${value}".`);
        }
        break;
      default:
        throw new Error(`The option "${valued[i]}" is not known.\n${USAGE}`);
    }
  }
  // Each change must fit before the first sweep, so that a typing fault stops the run at once.
  for (const variant of variants) {
    setHolds(variant).undo();
  }
  if (base !== null && json !== null) {
    throw new Error(`The options --base and --json do not go together.\n${USAGE}`);
  }
  if (soloist !== null && demos.length > 0) {
    throw new Error(`The options --soloist and --demo or --midi do not go together.\n${USAGE}`);
  }
  const rows = variants.length - 1;
  if (rows > ROW_LIMIT && demos.length === 0 && soloist === null && !long) {
    throw new Error(
      `The run has ${rows} --set rows over all demos of the ${role.role}, more than ${ROW_LIMIT} (ROW_LIMIT). Name the demos with --demo <id>, or give --long to sweep all demos.\n${USAGE}`,
    );
  }
  if (targets && (times !== null || gaps || base !== null)) {
    throw new Error(
      `The option --targets goes with none of --times, --gaps, and --base.\n${USAGE}`,
    );
  }
  if (perBone && bones !== null) {
    throw new Error(`The options --per-bone and --bones do not go together.\n${USAGE}`);
  }
  // An older commit of --base does not know --per-bone and --every.
  if (base !== null && (perBone || every > 1)) {
    throw new Error(`The option --base goes with neither --per-bone nor --every.\n${USAGE}`);
  }
  const sweepOptions = [demos.length > 0, gaps, targets, json, base, soloist, times, goal, long];
  if (where && (variants.length > 2 || sweepOptions.some((o) => o !== false && o !== null))) {
    throw new Error(`The option --where goes only with one --set.\n${USAGE}`);
  }
  return {
    role,
    demos,
    midi,
    variants,
    bones,
    into,
    times,
    gaps,
    targets,
    json,
    base,
    soloist,
    goal,
    perBone,
    every,
    where,
  };
}

/** The results of one variant in one demo. */
export interface DemoResult {
  /** The demo and the player with its species, such as `bach-bwv1048 pianist 20 (polar-bear)`. */
  readonly demo: string;
  /** The species of the player, or `null` when the scene has no player with its model. */
  readonly species: SpeciesId | null;
  /** The head height H of the body of the player, in meters. */
  readonly headHeight: number;
  /** The deepest point of each pair in each set of samples. */
  readonly sets: readonly SetResult[];
  /** The largest note-target error of each hand. */
  readonly targets: readonly TargetError[];
  /** The note targets of both hands within {@link TARGET_REACH}, and the largest error. */
  readonly reached: TargetReach;
}

/**
 * The largest error of a reached note target, in meters: 5 mm, as in the reach scans of the
 * mallets of the elephant.
 */
export const TARGET_REACH = 0.005;

/** The note targets of one player or of a run. */
export interface TargetReach {
  /** The number of note targets. */
  readonly samples: number;
  /** The number of note targets with an error of at most {@link TARGET_REACH}. */
  readonly within: number;
  /** The largest error, in meters, or 0 with no target. */
  readonly worst: number;
}

/** The reach of a player with no note target, or of a sweep at the song times of `--times`. */
export const NO_TARGETS: TargetReach = { samples: 0, within: 0, worst: 0 };

/** The note targets of one player: the largest error of each hand, and the reach of all. */
export interface TargetMeasure {
  /** The largest error of each hand. */
  readonly worst: readonly TargetError[];
  /** The reach of all targets. */
  readonly reach: TargetReach;
}

/**
 * Measures each note target of a player in one pass: the largest error of each hand, as
 * `targetErrors()` of `src/pose/test-sweep.ts` gives it, and the targets within
 * {@link TARGET_REACH}.
 *
 * @param player The player.
 * @returns The largest error of each hand, and the reach of all targets.
 */
export function measureTargets(player: SweepPlayer): TargetMeasure {
  const worst = new Map<'L' | 'R', TargetError>();
  let samples = 0;
  let within = 0;
  let largest = 0;
  for (const { side, sample, error: errorOf } of player.targets()) {
    const error = errorOf(poseSkeleton(player.model, player.poseAt(sample)));
    if (error >= (worst.get(side)?.error ?? -1)) {
      worst.set(side, { side, error, song: sample[0] });
    }
    samples += 1;
    within += error <= TARGET_REACH ? 1 : 0;
    largest = Math.max(largest, error);
  }
  return { worst: [...worst.values()], reach: { samples, within, worst: largest } };
}

/**
 * Joins the reach of the note targets of some results.
 *
 * @param results The results of each demo and player.
 * @returns The reach of all their targets.
 */
export function joinReach(results: readonly DemoResult[]): TargetReach {
  return results.reduce(
    (sum, { reached }) => ({
      samples: sum.samples + reached.samples,
      within: sum.within + reached.within,
      worst: Math.max(sum.worst, reached.worst),
    }),
    NO_TARGETS,
  );
}

/**
 * Writes the reach of note targets.
 *
 * @param reach The reach.
 * @returns The text, such as `98.2% of 1220 within 5 mm, worst 7.10 mm`, or `-` with no target.
 */
export function reachText(reach: TargetReach): string {
  if (reach.samples === 0) {
    return '-';
  }
  const share = ((100 * reach.within) / reach.samples).toFixed(1);
  return `${share}% of ${reach.samples} within ${TARGET_REACH * 1000} mm, worst ${(reach.worst * 1000).toFixed(2)} mm`;
}

/** The deepest point and the smallest gap of each pair in one set of samples. */
export interface SetResult {
  /** The name of the set, such as `play`. */
  readonly name: string;
  /** The deepest point of each pair of a moving part and an obstacle, with its phase. */
  readonly pairs: readonly PhasedDepth[];
  /**
   * The smallest gap of each pair of {@link gapPairs}, or of the pairs of `gapsOf` of
   * {@link sweepDemos}, or none with neither.
   */
  readonly gaps: readonly PairGap[];
}

/**
 * Gives the gap pairs of one sample set of one player, such as the free paw of a flutist in the
 * rest (`pnpm hold-fit`).
 */
export type GapsOf = (set: string, player: SweepPlayer) => readonly GapPair[];

/** The phase of the sample of a deepest point in the notes of the player ({@link pairPhase}). */
export interface PairPhase {
  /**
   * The time from the sample to the next note start of the hand of the point, such as the next
   * strike of a mallet, in seconds, or `null` after the last note.
   */
  readonly next: number | null;
  /**
   * The height of the mallet head of the hand above its target at the sample, in meters, or
   * `null` for a hand with no strikes.
   */
  readonly lift: number | null;
}

/** A deepest point of a pair, with the phase of its sample, or none for no point in an obstacle. */
export type PhasedDepth = PairDepth & {
  /** The phase of the sample, or none in a text before the format version 4. */
  readonly phase?: PairPhase;
};

/**
 * Gives the note starts of a hand in a note layer: the strikes or the notes of the hand for the
 * percussion, the keyboard, and the harp, the strokes of a bowed player, the notes of a wind, and
 * the beats of the conductor. With no hand, both hands count. A singer gives none.
 *
 * @param note The note layer.
 * @param side The hand, or `null` for both.
 * @returns The sorted note starts of each track, in the time of the note layer.
 */
function noteStarts(note: NoteLayer, side: 'L' | 'R' | null): Float64Array[] {
  switch (note.family) {
    case 'percussion':
    case 'keyboard':
    case 'harp': {
      const tracks = [side === 'R' ? null : note.left, side === 'L' ? null : note.right];
      return tracks.flatMap((track) => (track ? [track.starts] : []));
    }
    case 'bowed':
      return [note.starts];
    case 'woodwind':
    case 'brass':
      return [note.track.starts];
    case 'conductor':
      return [note.baton.beats];
    case 'choir':
      return [];
  }
}

/**
 * Gives the height of a mallet head above its target at a time (`strikeStateAt()`).
 *
 * @param track The strikes of the hand.
 * @param time The time of the note layer, in seconds.
 * @returns The height, in meters.
 */
function strikeHeight(track: StrikeTrack, time: number): number {
  const state = createStrikeState();
  strikeStateAt(track, time, state);
  return state.height;
}

/**
 * Gives the phase of the sample of a deepest point: the time to the next note start of its hand,
 * and for a mallet the height of its head above the target. The bone of the point gives the hand,
 * such as `handL` or `malletR`. The note layer runs `timeOffset` later than the song time.
 *
 * @param plan The plan of the player.
 * @param pair The deepest point of a pair.
 * @returns The phase.
 */
export function pairPhase(plan: PlayerPlan, pair: PairDepth): PairPhase {
  const end = pair.bone?.at(-1);
  const side = end === 'L' || end === 'R' ? end : null;
  const time = pair.song - plan.timeOffset;
  const nexts = noteStarts(plan.note, side).flatMap((starts) => {
    const start = starts.find((value) => value > time);
    return start === undefined ? [] : [start - time];
  });
  const { note } = plan;
  const track =
    note.family === 'percussion' && side ? (side === 'L' ? note.left : note.right) : null;
  return {
    next: nexts.length > 0 ? Math.min(...nexts) : null,
    lift: track ? strikeHeight(track, time) : null,
  };
}

/**
 * Finds the plan of a player of a sweep: the name of a player of the layout holds its index, such
 * as `timpanist 28 (stand)`, and the conductor has the name `conductor`.
 *
 * @param scene The scene.
 * @param name The name of the player in the sweep.
 * @returns The plan, or `null` for a name with no index.
 */
function planOf(scene: TestScene, name: string): PlayerPlan | null {
  if (name === 'conductor') {
    return scene.plan.conductor;
  }
  const index = /^\S+ (\d+)(?: \(|$)/.exec(name)?.[1];
  return index === undefined ? null : (scene.plan.players[Number(index)] ?? null);
}

/**
 * Finds the species of the model of a player in a scene. The models of a scene come from one
 * cache, so each kind of player has one model object: the model of a place of the layout, or of
 * the conductor.
 *
 * @param scene The scene.
 * @param model The model of the player.
 * @returns The species, or `null` when no place and no conductor has the model.
 */
export function speciesOf(scene: TestScene, model: PlayerModel): SpeciesId | null {
  for (const { cast } of scene.layout.players) {
    if (scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support) === model) {
      return cast.species;
    }
  }
  const conductor = scene.plan.conductor
    ? scene.models.get(CONDUCTOR.species, CONDUCTOR.instrument, 4)
    : null;
  return conductor === model ? CONDUCTOR.species : null;
}

/**
 * Adds the species to the name of a player in the sweep, in the parentheses of the name when it
 * has them.
 *
 * @param name The name of the player, such as `violinist 4 (chair)` or `pianist 20`.
 * @param species The species, or `null` for none.
 * @returns The label, such as `violinist 4 (fox-red, chair)` or `pianist 20 (polar-bear)`.
 */
export function playerLabel(name: string, species: SpeciesId | null): string {
  if (!species) {
    return name;
  }
  const inner = /^(.*) \((.*)\)$/.exec(name);
  return inner ? `${inner[1]} (${species}, ${inner[2]})` : `${name} (${species})`;
}

/** The options of a sweep of {@link sweepDemos}. */
export type SweepOptions = Pick<Options, 'demos' | 'times' | 'gaps'> & {
  /** The absolute paths of the MIDI files of the user of `--midi`, or none. */
  readonly midi?: readonly string[];
  /** The goal of each pair of `--goal`, in meters, or `null` or none for the limit of each pair. */
  readonly goal?: number | null;
  /** True to measure only the note targets, with no sample set ({@link Options.targets}). */
  readonly targets?: boolean;
  /** Gives the gap pairs of each set of each player, with no flag of the gaps. */
  readonly gapsOf?: GapsOf;
  /** The species of the standing soloist of the duo in place of the demos, or `null`. */
  readonly soloist?: SpeciesId | null;
  /**
   * Tells which play samples of a player count, such as the samples of one technique of
   * `pnpm hold-fit --technique`, or `null` or none for all.
   */
  readonly keep?: PlayFilter | null;
  /** The step of the play samples: each n-th sample of the play (`--every`). 1 or none takes all. */
  readonly every?: number;
};

/**
 * Joins the visits of a sweep into one visit.
 *
 * @param visits The visits, or `undefined` for none.
 * @returns The visit, or `undefined` with no visit.
 */
function joinVisits(...visits: readonly (SweepVisit | undefined)[]): SweepVisit | undefined {
  const given = visits.filter((visit) => visit !== undefined);
  if (given.length === 0) {
    return undefined;
  }
  return (posed, sample, surfaces) => {
    for (const visit of given) {
      visit(posed, sample, surfaces);
    }
  };
}

/**
 * Keeps only the play samples of a player that a filter takes. The other sets stay as they are.
 *
 * @param sets The sample sets of the player.
 * @param scene The scene.
 * @param name The name of the player, such as `bassist 21 (stand)` or `conductor`.
 * @param keep The filter.
 * @returns The sample sets.
 */
function keptPlay(
  sets: readonly SampleSet[],
  scene: TestScene,
  name: string,
  keep: PlayFilter,
): SampleSet[] {
  const found = /^\S+ (\d+)(?: \(|$)/.exec(name)?.[1];
  const index = found === undefined ? null : Number(found);
  return sets.map((set) =>
    set.name === 'play'
      ? { name: set.name, samples: [...set.samples].filter(([song]) => keep(scene, index, song)) }
      : set,
  );
}

/**
 * Keeps each n-th play sample (`--every`). The other sets stay as they are.
 *
 * @param sets The sample sets of a player.
 * @param every The step: 1 keeps all samples.
 * @returns The sample sets.
 */
function everyPlay(sets: readonly SampleSet[], every: number): readonly SampleSet[] {
  if (every <= 1) {
    return sets;
  }
  return sets.map((set) =>
    set.name === 'play'
      ? { name: set.name, samples: [...set.samples].filter((...[, i]) => i % every === 0) }
      : set,
  );
}

/**
 * Sweeps the players of the role in one scene. Each player gets the sample sets of the role. With
 * the bow points, the bow of the role (the part {@link BOW_PART}) takes a point at each 1 cm along
 * each edge in place of its corners (`bowSweep()` of `tools/bow-sweep.ts`): its depth in each
 * obstacle and in the arms, and its lowest point as a gap to the floor.
 *
 * @param id The name of the scene, such as the demo file with no `.mid`.
 * @param scene The scene.
 * @param options The song times, the flag of the gaps, and the gap pairs of each set.
 * @param role The role.
 * @param bowPoints True to measure the bow at each 1 cm.
 * @returns The results of each player.
 */
function sweepScene(
  id: string,
  scene: TestScene,
  options: SweepOptions,
  role: RoleSweep,
  bowPoints: boolean,
): DemoResult[] {
  const bowed = bowPoints && role.parts.some((part) => part.name === BOW_PART);
  const swept: RoleSweep = bowed
    ? { ...role, parts: role.parts.filter((part) => part.name !== BOW_PART) }
    : role;
  const times = options.times;
  return role.players(scene).map((player) => {
    // Each player gets its own sample sets: a set can be a generator, which one sweep uses up.
    const given: readonly SampleSet[] = options.targets
      ? []
      : times
        ? [{ name: 'play', samples: times.map((song) => playSample(scene, song)) }]
        : role.sampleSets(scene);
    const kept = options.keep ? keptPlay(given, scene, player.name, options.keep) : given;
    const sets = everyPlay(kept, options.every ?? 1);
    const species = speciesOf(scene, player.model);
    const plan = planOf(scene, player.name);
    const measured = times ? null : measureTargets(player);
    return {
      demo: `${id} ${playerLabel(player.name, species)}`,
      species,
      headHeight: player.model.body.headHeight,
      sets: sets.map(({ name, samples }) => {
        const pairs = options.gaps ? gapPairs(role) : (options.gapsOf?.(name, player) ?? []);
        const gaps = pairs.length > 0 ? gapSweep(pairs) : null;
        const bow = bowed ? bowSweep() : null;
        const goal = (pair: Pick<PairDepth, 'part' | 'into'>): number =>
          options.goal ?? depthLimit(role, pair, name).depth;
        const visits = joinVisits(gaps?.visit, bow?.visit);
        const depths = sweepDepths(swept, player, samples, visits, goal);
        const smallest = gaps?.gaps() ?? [];
        if (bow) {
          depths.push(...bow.depths());
          smallest.push(bow.floor());
        }
        const phased: PhasedDepth[] = [];
        for (const pair of depths) {
          phased.push(plan && pair.bone ? { ...pair, phase: pairPhase(plan, pair) } : pair);
        }
        return { name, pairs: phased, gaps: smallest };
      }),
      targets: measured?.worst ?? [],
      reached: measured?.reach ?? NO_TARGETS,
    };
  });
}

/**
 * Sweeps the players of the role in the demos with the holds of now. Each player gets the sample
 * sets of the role. With a soloist, it sweeps the soloist of the violin and piano duo
 * (`soloistScene()`) in place of the demos, with the bow at each 1 cm ({@link sweepScene}).
 * `pnpm hold-fit` runs it too.
 *
 * @param options The demos, the song times, the flag of the gaps, and the soloist. With no flag,
 *   `gapsOf` can give the gap pairs of each set of each player.
 * @param role The role, with the parts and the obstacles of the options.
 * @returns The results of each demo.
 * @throws Error if the role has no soloist.
 */
export async function sweepDemos(options: SweepOptions, role: RoleSweep): Promise<DemoResult[]> {
  if (options.soloist) {
    if (!isSoloistRole(role.role)) {
      throw new Error(`The ${role.role} has no soloist.`);
    }
    return sweepScene(SOLOIST_FILE, soloistScene(role.role, options.soloist), options, role, true);
  }
  const results: DemoResult[] = [];
  for (const demo of await roleDemos(options.demos, options.midi ?? [], role)) {
    const scene = recastSceneOf(demo.bytes, role.recast);
    results.push(...sweepScene(demoId(demo), scene, options, role, false));
  }
  return results;
}

/**
 * Gives the id of a demo: the name of its file with no `.mid`.
 *
 * @param demo The demo.
 * @returns The id, such as `beethoven-8`.
 */
function demoId(demo: DemoFile): string {
  return demo.file.replace(/\.mid$/, '');
}

/**
 * Gives the demos that a sweep of a role reads: the demos of `--demo` and the files of `--midi`,
 * or all demos, with a player of the role.
 *
 * @param asked The demos of `--demo` and of `--midi`, with no `.mid`, or none for all demos.
 * @param midi The absolute paths of the files of `--midi`.
 * @param role The role.
 * @returns The demos, in the order of `probeDemos()`.
 */
export async function roleDemos(
  asked: readonly string[],
  midi: readonly string[],
  role: RoleSweep,
): Promise<DemoFile[]> {
  return (await probeDemos(midi)).filter(
    (demo) =>
      (asked.length === 0 || asked.includes(demoId(demo))) && role.hasRole(scoreOf(demo.bytes)),
  );
}

/**
 * The times of the demos of the sweeps of each role: by the key of a sweep ({@link timeKey}), the
 * time of one row in each demo, in seconds.
 */
type DemoTimes = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Gives the file of the times of the sweeps ({@link DemoTimes}): `pose-depth-times.json` in the
 * folder of the probe caches, which each worktree shares.
 *
 * @returns The path of the file.
 */
function timesFile(): string {
  return join(probeCacheDir(), 'pose-depth-times.json');
}

/**
 * Gives the key of the times of a sweep: the role and the options that change the work of a
 * sample, such as `hornist --targets`.
 *
 * @param options The options.
 * @returns The key.
 */
function timeKey(options: Options): string {
  return [
    options.role.role,
    ...(options.targets ? ['--targets'] : []),
    ...(options.times ? ['--times'] : []),
    ...(options.gaps ? ['--gaps'] : []),
    ...(options.perBone ? ['--per-bone'] : []),
    ...(options.every > 1 ? [`--every ${options.every}`] : []),
  ].join(' ');
}

/**
 * Reads the times of the sweeps ({@link timesFile}).
 *
 * @returns The times, or none when the file does not exist or is not JSON text.
 */
function readTimes(): DemoTimes {
  const file = timesFile();
  if (!existsSync(file)) {
    return {};
  }
  try {
    // SAFETY: only storeTimes() of this tool writes the file, with the type DemoTimes.
    return JSON.parse(readFileSync(file, 'utf8')) as DemoTimes;
  } catch {
    return {};
  }
}

/**
 * Keeps the time of each demo of a swept row in the file of the times ({@link timesFile}), for the
 * estimate of the next run of the sweep ({@link planLines}).
 *
 * @param options The options.
 * @param seconds The time of the row in each demo, in seconds.
 */
function storeTimes(options: Options, seconds: Readonly<Record<string, number>>): void {
  const times = readTimes();
  const key = timeKey(options);
  const next = { ...times, [key]: { ...times[key], ...seconds } };
  storeBase(timesFile(), `${JSON.stringify(next, null, 2)}\n`);
}

/** The results of a row with the time of each demo. */
interface TimedRow {
  /** The results of each demo. */
  readonly results: DemoResult[];
  /** The time of each demo, in seconds, by its id. */
  readonly seconds: Record<string, number>;
}

/**
 * Sweeps the demos of a row one at a time, as {@link sweepDemos} does, and times each demo. The
 * scene of the soloist is one demo with the id {@link SOLOIST_FILE}.
 *
 * @param options The options.
 * @param role The role of the options.
 * @param ids The ids of the demos with the role, in their order.
 * @returns The results, in the order of the demos, and the time of each demo.
 */
async function timedSweep(
  options: Options,
  role: RoleSweep,
  ids: readonly string[],
): Promise<TimedRow> {
  const results: DemoResult[] = [];
  const seconds: Record<string, number> = {};
  for (const id of options.soloist ? [SOLOIST_FILE] : ids) {
    const started = performance.now();
    results.push(
      ...(await sweepDemos(options.soloist ? options : { ...options, demos: [id] }, role)),
    );
    seconds[id] = (performance.now() - started) / 1000;
  }
  return { results, seconds };
}

/**
 * Gives the time of one row of a sweep over its demos from the times of the last rows: the time of
 * each demo, or the mean time of the known demos for a demo with no time.
 *
 * @param ids The ids of the demos of the row.
 * @param known The time of each known demo, in seconds.
 * @returns The time, in seconds, and the count of the demos with a time, or `null` when no demo
 *   has a time.
 */
export function rowTime(
  ids: readonly string[],
  known: Readonly<Record<string, number>>,
): { readonly seconds: number; readonly known: number } | null {
  const times = Object.values(known);
  if (times.length === 0) {
    return null;
  }
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const own = ids.filter((id) => known[id] !== undefined);
  return { seconds: ids.reduce((sum, id) => sum + (known[id] ?? mean), 0), known: own.length };
}

/**
 * Writes the plan of a run before its first row: the demos with the role, the rows to sweep, and
 * the estimated time. The time of one row comes from the base row of the cache
 * ({@link baseRowCache}), or from the times of the last rows of the same sweep
 * ({@link rowTime}).
 *
 * @param options The options.
 * @param ids The ids of the demos of the run.
 * @param cached The time of the base row in the cache, in seconds, or `null` when the run sweeps
 *   the base row.
 * @param known The time of each demo of the last rows of the sweep, in seconds.
 * @returns The lines.
 */
export function planLines(
  options: Options,
  ids: readonly string[],
  cached: number | null,
  known: Readonly<Record<string, number>>,
): string[] {
  const demos = options.soloist ? [SOLOIST_FILE] : ids;
  const scene = options.soloist
    ? 'the scene of the soloist'
    : `${ids.length} demo${ids.length === 1 ? '' : 's'} with the role (${ids.join(', ')})`;
  const rows = options.variants.length - (cached === null ? 0 : 1);
  const base = cached === null ? '' : ', and the base row comes from the cache';
  const count = `${rows} row${rows === 1 ? '' : 's'}`;
  const lines = [`Sweep of the ${options.role.role}: ${scene}, ${count} to sweep${base}.`];
  const last = rowTime(demos, known);
  const row = cached ?? last?.seconds ?? null;
  if (row === null) {
    lines.push('No time of this sweep is known yet. The time of the first row gives it.');
    return lines;
  }
  const source =
    cached === null
      ? `from the last rows of this sweep, with a time for ${last?.known ?? 0} of ${demos.length} demos`
      : 'from the base row of the cache';
  const seconds = rows * row;
  const total = seconds < 120 ? `${seconds.toFixed(0)} s` : `${(seconds / 60).toFixed(1)} minutes`;
  lines.push(`Estimated time: about ${total}: ${count} of ${row.toFixed(1)} s, ${source}.`);
  return lines;
}

/**
 * Writes the count of the samples of a pair over its goal.
 *
 * @param pair The pair.
 * @param goal The goal, in meters.
 * @returns The text, such as `; 120 of 1162 samples over 1.5 cm (10.3%)`, or empty with no count
 *   or no goal.
 */
export function overText(pair: PairDepth, goal: number): string {
  if (pair.samples === undefined || pair.over === undefined || !Number.isFinite(goal)) {
    return '';
  }
  const share = ((100 * pair.over) / Math.max(1, pair.samples)).toFixed(1);
  return `; ${pair.over} of ${pair.samples} samples over ${(goal * 100).toFixed(1)} cm (${share}%)`;
}

/**
 * Writes the phase of the sample of a deepest point.
 *
 * @param phase The phase, or none.
 * @returns The text, such as `; next note in 0.12 s, lift 14.8 cm`, or empty with no phase.
 */
export function phaseText(phase: PairPhase | undefined): string {
  if (!phase) {
    return '';
  }
  const next =
    phase.next === null ? 'after the last note' : `next note in ${phase.next.toFixed(2)} s`;
  const lift = phase.lift === null ? '' : `, lift ${(phase.lift * 100).toFixed(1)} cm`;
  return `; ${next}${lift}`;
}

/**
 * Writes the results of one variant: the deepest point of each pair in each set, with its limit
 * (`depthLimit()`), the phase of its sample ({@link phaseText}), and the samples over the goal
 * ({@link overText}), the smallest gap of each pair of `--gaps`, and the largest note-target error
 * of each hand.
 *
 * @param role The role.
 * @param results The results of each demo.
 * @param goal The goal of `--goal`, in meters, or `null` for the limit of each pair.
 */
function printDetails(role: RoleSweep, results: readonly DemoResult[], goal: number | null): void {
  for (const { demo, sets, targets, reached } of results) {
    console.log(`  ${demo}`);
    for (const { name, pairs, gaps } of sets) {
      for (const pair of pairs) {
        const limit = depthLimit(role, pair, name);
        const mark = pair.depth > limit.depth ? ' OVER' : '';
        const text = `limit ${(limit.depth * 100).toFixed(1)} cm${mark}`;
        const over = overText(pair, goal ?? limit.depth);
        console.log(`    ${name}: ${pairText(pair)}${phaseText(pair.phase)}; ${text}${over}`);
      }
      for (const gap of gaps) {
        console.log(`    ${name}: gap of the ${gapText(gap)}`);
      }
    }
    for (const { side, error, song } of targets) {
      console.log(
        `    target ${side}: ${(error * 1000).toFixed(2)} mm at song ${song.toFixed(2)} s`,
      );
    }
    if (reached.samples > 0) {
      console.log(`    targets: ${reachText(reached)}`);
    }
  }
}

/**
 * Writes one table with one row for each variant: the deepest point of each pair in each set over
 * all demos, in cm, the smallest gap of each pair of `--gaps` over all demos, in cm, and the
 * largest note-target error of each hand, in mm. A column of depths or errors with 0 in each row
 * is left out. With note targets, the last column gives the share of the targets within
 * {@link TARGET_REACH}. A second table gives the demo and the time of the sample of each value
 * ({@link sampleAt}).
 *
 * @param rows The variant and the results of each row.
 */
function printTable(rows: readonly SweepRow[]): void {
  const columns = new Map<string, number[]>();
  const places = new Map<string, string[]>();
  const gapColumns = new Set<string>();
  const add = (column: string, row: number, value: number, at: string): void => {
    const values = columns.get(column) ?? rows.map(() => 0);
    const where = places.get(column) ?? rows.map(() => '-');
    if (value > (values[row] ?? 0)) {
      values[row] = value;
      where[row] = at;
    }
    columns.set(column, values);
    places.set(column, where);
  };
  const addGap = (column: string, row: number, value: number, at: string): void => {
    const values = columns.get(column) ?? rows.map(() => Infinity);
    const where = places.get(column) ?? rows.map(() => '-');
    if (value < (values[row] ?? Infinity)) {
      values[row] = value;
      where[row] = at;
    }
    columns.set(column, values);
    places.set(column, where);
    gapColumns.add(column);
  };
  for (const [row, { results }] of rows.entries()) {
    for (const { demo, sets, targets } of results) {
      for (const { name, pairs, gaps } of sets) {
        for (const pair of pairs) {
          const at = sampleAt(demo, name, pair);
          add(`${name} ${pair.part}>${pair.into} cm`, row, pair.depth * 100, at);
        }
        for (const gap of gaps) {
          const at = sampleAt(demo, name, gap);
          addGap(`${name} ${gap.part}~${gap.into} gap cm`, row, gap.gap * 100, at);
        }
      }
      for (const { side, error, song } of targets) {
        add(`target ${side} mm`, row, error * 1000, sampleAt(demo, 'play', { song, wall: 0 }));
      }
    }
  }
  for (const [column, values] of columns) {
    if (!gapColumns.has(column) && values.every((v) => v < 0.05)) {
      columns.delete(column);
    }
  }
  const reaches = rows.map(({ results }) => joinReach(results));
  if (reaches.some((reach) => reach.samples > 0)) {
    columns.set(
      `targets within ${TARGET_REACH * 1000} mm %`,
      reaches.map((reach) => (100 * reach.within) / Math.max(1, reach.samples)),
    );
  }
  const header = ['variant', ...columns.keys()];
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const [row, { variant }] of rows.entries()) {
    const cells = [...columns.values()].map((values) => (values[row] ?? 0).toFixed(1));
    console.log(`| ${variant || 'base'} | ${cells.join(' | ')} |`);
  }
  const placed = [...columns.keys()].filter((column) => places.has(column));
  if (placed.length > 0) {
    console.log('\nThe demo and the time of the sample of each value of the table:');
    console.log(`| variant | ${placed.join(' | ')} |`);
    console.log(`|---|${placed.map(() => '---').join('|')}|`);
    for (const [row, { variant }] of rows.entries()) {
      const cells = placed.map((column) => places.get(column)?.[row] ?? '-');
      console.log(`| ${variant || 'base'} | ${cells.join(' | ')} |`);
    }
  }
  printOverTable(rows);
}

/**
 * Writes the demo and the time of the sample of a deepest point or a smallest gap.
 *
 * @param demo The demo and the player of the result, such as `beethoven-9 timpanist 28 (elephant)`.
 * @param set The name of the sample set, such as `play`.
 * @param sample The song time and the wall time of the sample, in seconds.
 * @returns The text, such as `beethoven-9 12.25 s` in the play, or `beethoven-9 wall 11.20 s` in
 *   another set, whose samples differ by the wall time.
 */
export function sampleAt(
  demo: string,
  set: string,
  sample: { readonly song: number; readonly wall: number },
): string {
  const id = demo.split(' ')[0] ?? demo;
  return set === 'play'
    ? `${id} ${sample.song.toFixed(2)} s`
    : `${id} wall ${sample.wall.toFixed(2)} s`;
}

/**
 * Writes one table of the share of the samples over the goal of each pair in each set, in %, over
 * all demos, with one row for each variant. A column with 0 in each row is left out, and the tool
 * writes no table with no such column.
 *
 * @param rows The variant and the results of each row.
 */
function printOverTable(rows: readonly SweepRow[]): void {
  const columns = new Map<string, { samples: number; over: number }[]>();
  for (const [row, { results }] of rows.entries()) {
    for (const { sets } of results) {
      for (const { name, pairs } of sets) {
        for (const { part, into, samples, over } of pairs) {
          if (samples === undefined || over === undefined) {
            continue;
          }
          const column = `${name} ${part}>${into} %`;
          const values = columns.get(column) ?? rows.map(() => ({ samples: 0, over: 0 }));
          const cell = values[row];
          if (cell) {
            cell.samples += samples;
            cell.over += over;
          }
          columns.set(column, values);
        }
      }
    }
  }
  for (const [column, values] of columns) {
    if (values.every((cell) => cell.over === 0)) {
      columns.delete(column);
    }
  }
  if (columns.size === 0) {
    return;
  }
  const header = ['variant', ...columns.keys()];
  console.log('\nThe share of the samples over the goal of each pair (the limit, or --goal):');
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const [row, { variant }] of rows.entries()) {
    const cells = [...columns.values()].map((values) => {
      const cell = values[row];
      return cell && cell.samples > 0 ? ((100 * cell.over) / cell.samples).toFixed(1) : '-';
    });
    console.log(`| ${variant || 'base'} | ${cells.join(' | ')} |`);
  }
}

/** The bones of the arms of each side, whose groups `--per-bone` splits ({@link perBoneRole}). */
const ARM_BONES: ReadonlySet<BoneName> = new Set([
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'fingersL',
  'fingersR',
]);

/**
 * Gives the role with one part for each arm bone in place of each part of the role that holds
 * only arm bones, such as `forearms` (`--per-bone`). Each new part keeps the obstacles and the
 * limit of its group, and the accepted depths of the group. The other parts, such as the
 * instrument and the bow, stay.
 *
 * @param role The role.
 * @returns The role.
 */
export function perBoneRole(role: RoleSweep): RoleSweep {
  const split = (part: SweepPart): boolean =>
    part.bones.length > 1 && part.bones.every((bone) => ARM_BONES.has(bone));
  const parts = role.parts.flatMap((part): SweepPart[] =>
    split(part)
      ? part.bones.map((bone) => Object.assign({}, part, { name: bone, bones: [bone] }))
      : [part],
  );
  const accepted = role.accepted.flatMap((entry): AcceptedDepth[] => {
    const group = role.parts.find((part) => part.name === entry.part);
    return group && split(group)
      ? group.bones.map((bone) => Object.assign({}, entry, { part: bone }))
      : [entry];
  });
  return { ...role, parts, accepted };
}

/**
 * Gives the role of the options: one part for each bone of `--bones`, with the accepted depths of
 * the part of the role that holds the bone, and the obstacles of `--into`.
 *
 * @param options The options.
 * @returns The role.
 */
function roleOf(options: Options): RoleSweep {
  const { role, bones, into } = options;
  const obstacles = role.obstacles.filter((o) => !into || into.includes(o.name));
  if (options.perBone) {
    return { ...perBoneRole(role), obstacles };
  }
  if (!bones) {
    return { ...role, obstacles };
  }
  const holder = (bone: BoneName): string | undefined =>
    role.parts.find((part) => part.bones.includes(bone))?.name;
  return {
    ...role,
    parts: bones.map((bone) => ({ name: bone, bones: [bone] })),
    obstacles,
    accepted: role.accepted.flatMap((entry) =>
      bones
        .filter((bone) => holder(bone) === entry.part)
        .map((bone): AcceptedDepth => ({
          part: bone,
          into: entry.into,
          samples: entry.samples,
          depth: entry.depth,
          reason: entry.reason,
        })),
    ),
  };
}

/** The rows of one run: the deepest points of each variant. */
export interface SweepRow {
  /** The text of the changes of the variant, or empty for the base. */
  readonly variant: string;
  /** The time of the sweep of the variant, in seconds. */
  readonly seconds: number;
  /** The results of each demo and player. */
  readonly results: readonly DemoResult[];
}

/** A depth of a JSON text, such as of {@link rowsJson}. JSON writes the place `NaN` as `null`. */
export type StoredDepth = Omit<PhasedDepth, 'along'> & {
  /** The place along the bone, or `null` for `NaN`. */
  readonly along: number | null;
};

/** A gap of the JSON text of {@link rowsJson}. JSON writes an infinite gap as `null`. */
type StoredGap = Omit<PairGap, 'gap'> & {
  /** The gap in meters, or `null` for an infinite gap. */
  readonly gap: number | null;
};

/**
 * A result of a JSON text, such as of {@link rowsJson}. The text of the format version 1 has no
 * reach of the note targets.
 */
export type StoredResult = Omit<DemoResult, 'sets' | 'reached'> & {
  /** The reach of the note targets, or none in the format version 1. */
  readonly reached?: TargetReach;
  /** The sets of samples. */
  readonly sets: readonly (Omit<SetResult, 'pairs' | 'gaps'> & {
    /** The deepest point of each pair. */
    readonly pairs: readonly StoredDepth[];
    /** The smallest gap of each pair. */
    readonly gaps: readonly StoredGap[];
  })[];
};

/** The JSON text of {@link rowsJson}. */
interface StoredRows {
  /** The rows, the base first. */
  readonly rows: readonly (Omit<SweepRow, 'results'> & {
    /** The results of each demo and player. */
    readonly results: readonly StoredResult[];
  })[];
}

/**
 * The format version of the JSON text of `--json` (`ProbeFormat` of `tools/ref-tree.ts`). A
 * change of the format takes the next version. Version 2 added the reach of the note targets,
 * version 3 the samples over the goal of each pair, version 4 the phase of the sample of each
 * deepest point ({@link PairPhase}), and version 5 the places of each deepest point
 * (`PairDepth.partPlace`, `PairDepth.intoPlace`).
 */
export const ROWS_FORMAT = 5;

/**
 * The oldest format version that {@link ROWS_FORMAT} only adds fields to (`ProbeFormat.since` of
 * `tools/ref-tree.ts`): a compare with `--base` reads a text of each version from it to
 * {@link ROWS_FORMAT}. A change that only adds fields keeps it, and a change of a field sets it to
 * the new version.
 */
export const ROWS_SINCE = 1;

/**
 * Writes the rows of a run as JSON (`--json`), with the format version {@link ROWS_FORMAT} and
 * {@link ROWS_SINCE}. JSON writes the place `NaN` of a depth with no bone and the infinite gap of
 * a set with no sample as `null`.
 *
 * @param rows The rows.
 * @returns The text.
 */
export function rowsJson(rows: readonly SweepRow[]): string {
  return JSON.stringify({ version: ROWS_FORMAT, since: ROWS_SINCE, rows });
}

/**
 * Reads the rows of a run from the text of {@link rowsJson}, with `NaN` and the infinite gaps in
 * place of `null`.
 *
 * @param text The text.
 * @returns The rows.
 */
export function readRows(text: string): SweepRow[] {
  // SAFETY: the text comes from rowsJson() of this tool, in the probe of a commit or of the
  // working tree.
  const stored = JSON.parse(text) as StoredRows;
  return stored.rows.map((row) => ({
    variant: row.variant,
    seconds: row.seconds,
    results: row.results.map(restoreResult),
  }));
}

/**
 * Gives back a depth of a JSON text, with `NaN` in place of `null`.
 *
 * @param stored The depth of the text.
 * @returns The depth.
 */
export function restoreDepth(stored: StoredDepth): PhasedDepth {
  let base: PairDepth = {
    part: stored.part,
    into: stored.into,
    depth: stored.depth,
    song: stored.song,
    wall: stored.wall,
    bone: stored.bone,
    along: stored.along ?? Number.NaN,
  };
  // A text before the format version 5 has no places.
  if (stored.partPlace !== undefined) {
    base = { ...base, partPlace: stored.partPlace };
  }
  if (stored.intoPlace !== undefined) {
    base = { ...base, intoPlace: stored.intoPlace };
  }
  const depth: PhasedDepth = stored.phase ? { ...base, phase: stored.phase } : base;
  if (stored.samples === undefined || stored.over === undefined) {
    return depth;
  }
  return { ...depth, samples: stored.samples, over: stored.over };
}

/**
 * Gives back a gap of a JSON text, with an infinite gap in place of `null`.
 *
 * @param stored The gap of the text.
 * @returns The gap.
 */
function restoreGap(stored: StoredGap): PairGap {
  return {
    part: stored.part,
    into: stored.into,
    gap: stored.gap ?? Infinity,
    song: stored.song,
    wall: stored.wall,
    bone: stored.bone,
  };
}

/**
 * Gives back the result of a demo and a player of a JSON text ({@link restoreDepth}).
 *
 * @param stored The result of the text.
 * @returns The result.
 */
export function restoreResult(stored: StoredResult): DemoResult {
  return {
    demo: stored.demo,
    species: stored.species,
    headHeight: stored.headHeight,
    targets: stored.targets,
    reached: stored.reached ?? NO_TARGETS,
    sets: stored.sets.map((set) => ({
      name: set.name,
      pairs: set.pairs.map(restoreDepth),
      gaps: set.gaps.map(restoreGap),
    })),
  };
}

/** The step of the depths that the tool prints, in meters: 0.1 cm. */
export const DEPTH_STEP = 0.001;

/** The deepest point of a species in one pair of parts in one set of samples. */
interface SpeciesDepth {
  /** The species. */
  readonly species: string;
  /** The set of samples. */
  readonly set: string;
  /** The pair, such as `forearms in body`. */
  readonly pair: string;
  /** The depth, in meters. */
  readonly depth: number;
  /** The head height H of the body of the species, in meters. */
  readonly headHeight: number;
  /** The demo and the time of the sample of the deepest point (`sampleAt()`). */
  readonly at: string;
}

/**
 * Gives the deepest point of each species in each pair of parts in each set of samples, over the
 * demos and the players.
 *
 * @param results The results of each demo and player.
 * @returns The deepest points, by the species, the set, and the pair, in the order of the results.
 */
function speciesDepths(results: readonly DemoResult[]): Map<string, SpeciesDepth> {
  const deepest = new Map<string, SpeciesDepth>();
  for (const { demo, species, headHeight, sets } of results) {
    const name = species ?? 'unknown';
    for (const { name: set, pairs } of sets) {
      for (const { part, into, depth, song, wall } of pairs) {
        const pair = `${part} in ${into}`;
        const key = `${name}\t${set}\t${pair}`;
        const best = deepest.get(key);
        if (!best || depth > best.depth) {
          const at = sampleAt(demo, set, { song, wall });
          deepest.set(key, { species: name, set, pair, depth, headHeight, at });
        }
      }
    }
  }
  return deepest;
}

/**
 * Compares the deepest points of the sweep of a commit with the deepest points of the working
 * tree, in cm and in the head height H of each body. A body that grows keeps its depths in H, so
 * its depths in cm grow with it. The table has one row for each species, set, and pair with a
 * depth that prints as 0.1 cm or more on one side. A mark `GROWS` follows a depth whose value in H grows by more than one step
 * of the print ({@link DEPTH_STEP}) in the H of the body of the working tree. The last column
 * gives the demo and the time of the deepest point of the working tree.
 *
 * @param label The name of the commit, such as `main (ac0f4d56)`.
 * @param base The results of the commit.
 * @param tree The results of the working tree.
 * @returns The lines: the H of each species, then the table, grouped by species.
 */
export function compareDepths(
  label: string,
  base: readonly DemoResult[],
  tree: readonly DemoResult[],
): string[] {
  const before = speciesDepths(base);
  const after = speciesDepths(tree);
  const keys = [...new Set([...after.keys(), ...before.keys()])];
  const species = [...new Set(keys.map((key) => key.split('\t')[0] ?? ''))];
  const heights = species.map((name) => {
    const of = (depths: Map<string, SpeciesDepth>): string => {
      const found = [...depths.values()].find((d) => d.species === name);
      return found ? `${found.headHeight.toFixed(3)} m` : '-';
    };
    return `${name} ${of(before)} -> ${of(after)}`;
  });

  const cm = (d: SpeciesDepth | undefined): string => (d ? (d.depth * 100).toFixed(1) : '-');
  const inH = (d: SpeciesDepth | undefined): string =>
    d ? (d.depth / d.headHeight).toFixed(3) : '-';
  const lines = [
    `H of each body, ${label} -> working tree: ${heights.join(', ')}`,
    `| Species | Set | Pair | ${label} cm | ${label} H | tree cm | tree H | Mark | tree at |`,
    '|---|---|---|---:|---:|---:|---:|---|---|',
  ];
  for (const name of species) {
    for (const key of keys.filter((k) => k.startsWith(`${name}\t`))) {
      const a = before.get(key);
      const b = after.get(key);
      const any = b ?? a;
      // A row whose depths both print as 0.0 cm shows nothing.
      if (!any || Math.max(a?.depth ?? 0, b?.depth ?? 0) < DEPTH_STEP / 2) {
        continue;
      }
      const grows =
        a && b && b.depth / b.headHeight - a.depth / a.headHeight > DEPTH_STEP / b.headHeight;
      lines.push(
        `| ${name} | ${any.set} | ${any.pair} | ${cm(a)} | ${inH(a)} | ${cm(b)} | ${inH(b)} | ${grows ? 'GROWS' : ''} | ${b?.at ?? '-'} |`,
      );
    }
  }
  return lines;
}

/**
 * Gives the cache file of the base row of a run with `--set` ({@link treeCacheFile}): the tree of
 * the working tree and the arguments with no `--set`, `--json`, and `--base`. A run with no
 * `--set`, or with {@link PROBE_NO_CACHE} set to `1`, has none.
 *
 * @param options The options.
 * @returns The file, or `null`.
 */
function baseRowCache(options: Options): string | null {
  if (options.variants.length < 2 || process.env[PROBE_NO_CACHE] === '1') {
    return null;
  }
  const args = withoutOptions(
    absoluteMidi(process.argv.slice(2)),
    ['--set', '--json', '--base'],
    ['--long'],
  );
  return treeCacheFile('pose-depth.ts', [String(ROWS_FORMAT), ...args]);
}

/**
 * Sets the hold changes of a variant in memory, with the scale of the size rule of a recast role,
 * as the cast matrix gives it (`recastChanges()` of `tools/recast-scale.ts`). The rule runs in a
 * child process, because the imports of its module come back to this module.
 *
 * @param role The role.
 * @param variant The hold changes of the variant, or `''`.
 * @returns The changes, with a function that puts the old values back.
 */
function setRoleHolds(role: RoleSweep, variant: string): ReturnType<typeof setHolds> {
  if (!role.recast) {
    return setHolds(variant);
  }
  const script = join(ROOT, 'tools', 'recast-scale.ts');
  const args = [script, role.role, variant];
  return setHolds(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }).trim());
}

/**
 * Sweeps each variant of the options with the holds of now, and writes the details of each
 * variant after its sweep. A run with `--set` takes the base row from its cache when the working
 * tree and the other arguments did not change ({@link baseRowCache}), and prints
 * `base: cached`. The sweep of the base fills the cache.
 *
 * @param options The options.
 * @param role The role of the options.
 * @returns The rows, the base first.
 */
async function sweepRows(options: Options, role: RoleSweep): Promise<SweepRow[]> {
  const rows: SweepRow[] = [];
  const cache = baseRowCache(options);
  const cached = cache && existsSync(cache) ? readRows(readFileSync(cache, 'utf8'))[0] : undefined;
  const ids = options.soloist
    ? []
    : (await roleDemos(options.demos, options.midi, role)).map(demoId);
  for (const variant of options.variants) {
    if (variant === '' && cached) {
      rows.push(cached);
      console.log(`base: cached (tree, ${basename(cache ?? '', '.json').slice(5, 17)})`);
      console.log(`base (${cached.seconds.toFixed(1)} s when swept):`);
      printDetails(role, cached.results, options.goal);
      continue;
    }
    const { undo, text } = setRoleHolds(role, variant);
    const started = performance.now();
    let timed: TimedRow;
    try {
      timed = await timedSweep(options, role, ids);
    } finally {
      undo();
    }
    const seconds = (performance.now() - started) / 1000;
    const { results } = timed;
    storeTimes(options, timed.seconds);
    rows.push({ variant: text, seconds, results });
    if (variant === '' && cache) {
      storeBase(cache, rowsJson([{ variant: text, seconds, results }]));
    }
    console.log(`${text || 'base'} (${seconds.toFixed(1)} s):`);
    printDetails(role, results, options.goal);
  }
  return rows;
}

/**
 * The table of the sweep roles, which the commit of `--base` must hold with the role of the sweep
 * (`checkRefRole()` of `tools/ref-tree.ts`).
 */
export const SWEEP_ROLE_TABLE: Omit<RefRole, 'name'> = {
  module: 'src/pose/test-sweep-roles.ts',
  table: 'SWEEP_ROLES',
};

/**
 * Sweeps the commit of `--base` and the working tree at the same time, each in a child process
 * (`probeBeside()`). The commit runs the base with no change. A role that the commit does not have
 * stops the run before the probes (`checkRefRole()`). Then the tool writes the details and the
 * table of the working tree, and one compare of each variant with the commit
 * ({@link compareDepths}).
 *
 * @param role The role of the options.
 * @param ref The commit, the branch, or the tag.
 * @param goal The goal of `--goal`, in meters, or `null` for the limit of each pair.
 */
async function compareRef(role: RoleSweep, ref: string, goal: number | null): Promise<void> {
  const label = `${ref} (${shortHash(ref)})`;
  const args = withoutOptions(absoluteMidi(process.argv.slice(2)), ['--base']);
  const started = performance.now();
  const texts = await probeBeside(
    ref,
    'pose-depth.ts',
    { base: withoutOptions(args, ['--set', '--goal'], ['--gaps', '--long']), tree: args },
    { prefix: 'pose-depth-', role: { ...SWEEP_ROLE_TABLE, name: role.role }, cache: true },
  );
  const [base] = readRows(texts.base);
  const rows = readRows(texts.tree);
  console.log(
    `Sweeps of ${label} and of the working tree: ${((performance.now() - started) / 1000).toFixed(1)} s.`,
  );
  for (const { variant, seconds, results } of rows) {
    console.log(`${variant || 'base'} (${seconds.toFixed(1)} s):`);
    printDetails(role, results, goal);
  }
  printTable(rows);
  for (const { variant, results } of rows) {
    console.log(`\nThe depths of ${label} and of the working tree with ${variant || 'no change'}:`);
    console.log(compareDepths(label, base?.results ?? [], results).join('\n'));
  }
}

/**
 * Writes the plan of a run before its first row ({@link planLines}).
 *
 * @param options The options.
 * @param role The role of the options.
 */
async function printPlan(options: Options, role: RoleSweep): Promise<void> {
  const ids = options.soloist
    ? []
    : (await roleDemos(options.demos, options.midi, role)).map(demoId);
  const cache = options.base === null ? baseRowCache(options) : null;
  const cached = cache && existsSync(cache) ? readRows(readFileSync(cache, 'utf8'))[0] : undefined;
  const known = readTimes()[timeKey(options)] ?? {};
  console.log(planLines(options, ids, cached ? cached.seconds : null, known).join('\n'));
}

/**
 * Sweeps the role on the studio body that the export makes from another GLB file (`--glb <file>`),
 * such as a GLB file of `pnpm rig-mesh --check --keep`. The tool runs again in a child process, in
 * a copy of `src/` with the module of the file (`withGlbBody()` of `tools/glb-swap.ts`). The files
 * of `assets/` and `src/` do not change, also after a stop or a failure. The child sweeps the base
 * row each time, because a cache by tree does not know the file ({@link PROBE_NO_CACHE}).
 *
 * @param options The options of the other arguments.
 * @param glb The absolute path of the GLB file.
 * @param args The other arguments, with no `--glb`.
 * @returns The exit code of the child.
 * @throws Error with `--base`, or for a role with no studio body.
 */
async function sweepGlb(options: Options, glb: string, args: readonly string[]): Promise<number> {
  if (options.base !== null) {
    throw new Error(`The options --glb and --base do not go together.\n${USAGE}`);
  }
  const source = findRole(options.role.role);
  if (!source) {
    throw new Error(`The ${options.role.role} has no studio body, so --glb does not apply.`);
  }
  return withGlbBody(roleAnimal(source), glb, (dir) =>
    runTool(dir, 'pose-depth.ts', args, { ...process.env, [PROBE_NO_CACHE]: '1' }),
  );
}

/**
 * Runs the tool: `node tools/pose-depth.ts <role> [options]`. With `--glb <file>`, the sweep runs
 * on the studio body of the file ({@link sweepGlb}).
 */
async function main(): Promise<void> {
  const { glb, rest } = takeGlb(process.argv.slice(2));
  const options = parseOptions(rest);
  if (glb) {
    process.exitCode = await sweepGlb(options, glb, rest);
    return;
  }
  if (options.where) {
    const undo = setRoleHolds(options.role, options.variants[1] ?? '').undo;
    try {
      console.log(
        whereLines(
          options.role,
          options.where,
          await roleDemos([options.where.demo], [], options.role),
        ).join('\n'),
      );
    } finally {
      undo();
    }
    return;
  }
  const role = roleOf(options);
  await printPlan(options, role);
  if (options.base !== null) {
    await compareRef(role, options.base, options.goal);
    return;
  }
  const rows = await sweepRows(options, role);
  printTable(rows);
  if (options.json !== null) {
    writeFileSync(options.json, rowsJson(rows));
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
