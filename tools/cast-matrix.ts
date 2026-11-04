/**
 * Measures each pair of a species and a role: the cast matrix (design 4.4, "Cast matrix"). It
 * recasts each species into each role (`findRole()` of `tools/fold-probe.ts`), and measures the
 * pair with the arm gate (`probeRole()` of `tools/arm-check.ts`) and the clearance sweep
 * (`sweepDemos()` of `tools/pose-depth.ts`), with its note targets, on a short sample
 * ({@link CAST_SAMPLE}). Thus the table shows which species can play which instrument.
 *
 * - **Hold.** A recast pair plays the shared hold of the instrument: the tool removes the own hold
 *   of the species from `SPECIES_HOLDS` and `SPECIES_WIND_HOLDS` in memory. The own role of a
 *   species keeps its own hold and its own instrument scale.
 * - **Scale.** A recast pair takes the size rule of its instrument (`setRecastScale()` of
 *   `tools/recast-scale.ts`): the rule of a violin shop for a violin or a viola, and the cello rule
 *   for a cello, and the size rule of the winds for a trumpet, a clarinet, or a flute
 *   (`tools/wind-size.ts`). Each other instrument keeps the scale 1, and the cell says so
 *   (`ScaleSource`).
 * - **Verdict.** A value of the gate over its limit fails, a clip over the limit of its pair fails,
 *   and a note target missed by more than the limit of the role fails. A value is open when the own
 *   pair of the role is over the same limit and the value is not worse by more than the margin of
 *   the limit ({@link CLIP_MARGIN} for a clip and a note target): a known item of the role. The
 *   grip of each pair counts from the accepted grip of the role (`ACCEPTED_GRIPS`), because the
 *   grip frame does not move with the bind.
 *
 * Each pair runs in a child process, with at most `--jobs` children at the same time, and its JSON
 * goes into a cache by tree (`treeCacheFile()` of `tools/ref-tree.ts`), so a second run on the same
 * tree reads it. The tool writes one table (a row for each species, a column for each role) into
 * the file of `--out`, and the JSON of all pairs beside it ({@link MatrixJson}).
 *
 * `--quick` takes the coarse {@link QUICK_SAMPLE} in place of {@link CAST_SAMPLE}.
 *
 * `--base <ref>` runs the matrix on the code of a commit and on the working tree, each in a child
 * process (`probeBeside()` of `tools/ref-tree.ts`). The child of the commit runs the tools of the
 * commit: its matrix, its gate, and its size rule. Thus a change of a size rule or of a limit shows
 * as a change of the cells, and the column of the commit is equal to a run in a tree of the commit
 * (`tools/base-tree.sh`). The commit must have the `--json` of this tool (8d4f6da1 or newer). The
 * JSON of the commit goes into the cache by commit. The table gives the cell of each pair on both
 * trees with the change ({@link compareLines}). A child writes its {@link MatrixJson} into the file
 * of `--json`.
 *
 * `--set <changes>` changes the holds of each pair in memory (`setHolds()` of
 * `tools/hold-sets.ts`), before the tool takes the shared hold and the size rule, so that a try
 * needs no edit of the source. Each `--variant <name>=<changes>` adds a column of each role with
 * its changes after those of `--set`, as `pnpm pair-scan` does ({@link MatrixVariant}). A change of
 * the scale of the recast species, such as `wolf.violinScale=0.7`, takes the place of the rule.
 *
 * Usage: pnpm cast-matrix [--roles <list>] [--species <list>] [--out <file>] [--jobs <n>]
 * [--quick] [--set <changes>]... [--variant <name>=<changes>]... [--base <ref>]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { ACCEPTED_GRIPS, ARM_LIMITS, gateRows, probeRole } from './arm-check.ts';
import type { GateRow, Measure, RoleReport } from './arm-check.ts';
import { FOLD_ROLES, findRole, findSweep } from './fold-probe.ts';
import type { RoleSource } from './fold-probe.ts';
import { setHolds } from './hold-sets.ts';
import { sampleAt, sweepDemos } from './pose-depth.ts';
import type { TargetReach } from './pose-depth.ts';
import { probeDemos } from './probe-demos.ts';
import { setRecastScale } from './recast-scale.ts';
import type { PairScale } from './recast-scale.ts';
import {
  PROBE_NO_CACHE,
  ROOT,
  probeBeside,
  runChild,
  storeBase,
  treeCacheFile,
  withTempFolder,
  withoutOptions,
} from './ref-tree.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import { isScaledInstrument } from '../src/models/instruments/types.ts';
import { SCALE_PARAMS, SPECIES, SPECIES_IDS, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { SPECIES_HOLDS } from '../src/pose/bowed-rig.ts';
import { depthLimit } from '../src/pose/test-sweep.ts';
import type { RoleSweep } from '../src/pose/test-sweep.ts';
import { SPECIES_WIND_HOLDS } from '../src/pose/winds.ts';
import { scoreOf } from '../src/score/test-score.ts';

/**
 * The roles of a run with no `--roles`: one role of each family. A bowed string under the chin, a
 * bowed string on the floor, a side-blown wind, a front wind, a brass instrument, and a drum.
 */
export const CAST_ROLES = [
  'violinist',
  'cellist',
  'flutist',
  'clarinetist',
  'trumpeter',
  'snare-drummer',
] as const;

/**
 * The short sample of each pair. Each pair plays the shortest demo with the role, because one demo
 * holds the rest, the lift, the play, and the lowering of the role. The arm gate takes a play
 * sample at each `step` of song time, twice the step of the gate (`GATE_STEP`), and the sweep each
 * `every`-th play sample of its role. A pair then takes less than 1 minute. The matrix finds the
 * pairs to work on, and the full gate of one pair checks a change.
 */
export const CAST_SAMPLE = { step: 0.5, every: 4 } as const;

/**
 * The coarse sample of `--quick`: a gate step of 2 s and each 16th sweep sample. It finds the
 * faults of a pair early: a pair alone takes about half of the time of {@link CAST_SAMPLE}. A change
 * still gets its full sample before its report.
 */
export const QUICK_SAMPLE = { step: 2, every: 16 } as const;

/** The sample of each pair: {@link CAST_SAMPLE} or {@link QUICK_SAMPLE}. */
export interface CastSample {
  /** The step of song time between two play samples of the arm gate, in seconds. */
  readonly step: number;
  /** The sweep takes each `every`-th play sample of its role. */
  readonly every: number;
}

/**
 * The depth of a clip, or the error of a note target, past the own pair of the role above which
 * the value fails, in meters.
 */
export const CLIP_MARGIN = 0.01;

/** The format version of {@link PairJson}. A new version gives new cache keys. */
export const CAST_FORMAT = 2;

/** One variant of a run: a column of each role, with the hold changes of the variant. */
export interface MatrixVariant {
  /** The name: `base` for the changes of `--set` alone, else the name of `--variant`. */
  readonly name: string;
  /** The hold changes (`setHolds()` of `tools/hold-sets.ts`), or `''` for no change. */
  readonly changes: string;
}

/** The deepest point of one pair of parts in one sample set of the sweep. */
export interface PairClip {
  /** The sample set, such as `play`. */
  readonly set: string;
  /** The moving part, such as `paws`. */
  readonly part: string;
  /** The obstacle, such as `body`. */
  readonly into: string;
  /** The depth, in meters. */
  readonly depth: number;
  /** The limit of the pair in the set (`depthLimit()`), in meters. */
  readonly limit: number;
  /** The demo and the time of the sample. */
  readonly at: string;
}

/** The JSON of one pair, as a child writes it. */
export interface PairJson {
  /** The format version ({@link CAST_FORMAT}). */
  readonly version: number;
  /** The species. */
  readonly species: SpeciesId;
  /** The role of `FOLD_ROLES`. */
  readonly role: string;
  /** The name of the pair for the role tools: the role, or `<role>@<species>`. */
  readonly name: string;
  /** True for the own role of the species. */
  readonly own: boolean;
  /** The demo of the sample. */
  readonly demo: string;
  /** The instrument scale. */
  readonly scale: PairScale;
  /** The report of the arm gate, or `null` after an error. */
  readonly arms: RoleReport | null;
  /** The deepest point of each pair of parts of the sweep in each set. */
  readonly clips: readonly PairClip[];
  /** The note targets of the sweep. */
  readonly targets: TargetReach;
  /** The largest error of a note target of the role (`RoleSweep.targetError`), in meters. */
  readonly targetLimit: number;
  /** The message of an error of the pair, or `null`. */
  readonly error: string | null;
  /** The run time of the pair, in seconds. */
  readonly seconds: number;
}

/** One value of a cell: a value that does not pass, or the value nearest to its limit. */
export interface CellItem {
  /** The verdict of the value. */
  readonly verdict: 'PASS' | 'OPEN' | 'FAIL';
  /** The text, such as `grip L 62/45` or `paws>body 4.1/1.5 cm`. */
  readonly text: string;
  /** The value as a share of its limit: above 1 is over the limit. */
  readonly ratio: number;
}

/** One cell of the matrix. */
export interface MatrixCell {
  /** The verdict of the cell: the worst verdict of its values. */
  readonly verdict: 'PASS' | 'OPEN' | 'FAIL';
  /** The value of the gate with the largest ratio, or `null` with no value. */
  readonly worst: CellItem | null;
  /** The deepest clip with the largest ratio, or `null` with no clip. */
  readonly clip: CellItem | null;
  /** The largest error of a note target, or `null` with no note target. */
  readonly targets: CellItem | null;
  /** The values that do not pass. */
  readonly items: readonly CellItem[];
}

/** The JSON file of a run. */
export interface MatrixJson {
  /** The format version ({@link CAST_FORMAT}). */
  readonly version: number;
  /** The roles, in the order of the columns. */
  readonly roles: readonly string[];
  /** The species, in the order of the rows. */
  readonly species: readonly SpeciesId[];
  /** The sample of each pair. */
  readonly sample: CastSample;
  /** The demo of each role. */
  readonly demos: Readonly<Record<string, string>>;
  /** The variants, in the order of their columns. */
  readonly variants: readonly MatrixVariant[];
  /** The run time of the matrix, in seconds. */
  readonly seconds: number;
  /** Each pair, with its cell. */
  readonly pairs: readonly MatrixPair[];
}

/** One pair of the matrix with its cell. */
export interface MatrixPair {
  /** The name of the variant of the pair ({@link MatrixVariant}). */
  readonly variant: string;
  /** The JSON of the pair. */
  readonly pair: PairJson;
  /** The cell. */
  readonly cell: MatrixCell;
}

/** The command line of the tool. */
interface MatrixArgs {
  /** The roles of the columns. */
  readonly roles: readonly string[];
  /** The species of the rows. */
  readonly species: readonly SpeciesId[];
  /** The file of the table. The JSON goes beside it, with the extension `.json`. */
  readonly out: string;
  /** The largest number of children at the same time. */
  readonly jobs: number;
  /** The sample of each pair: {@link QUICK_SAMPLE} with `--quick`, else {@link CAST_SAMPLE}. */
  readonly sample: CastSample;
  /** The variants: `base`, then each `--variant`. */
  readonly variants: readonly MatrixVariant[];
  /** The commit of `--base`, or `null`. */
  readonly base: string | null;
  /** The JSON file of a child of `--base` (`--json`), or `null`. */
  readonly json: string | null;
}

/** The usage text. */
const USAGE =
  'Usage: pnpm cast-matrix [--roles <role>,...] [--species <species>,...] [--out <file>] [--jobs <n>] [--quick] [--set <changes>]... [--variant <name>=<changes>]... [--base <ref>]';

/**
 * Reads the command line.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error for an unknown option, role, or species, for a variant with no name or a name
 *   that comes two times, and for a hold change that does not fit.
 */
export function parseMatrixArgs(args: readonly string[]): MatrixArgs {
  const values = new Map<string, string>();
  const sets: string[] = [];
  const named: (readonly [string, string])[] = [];
  const quick = args.includes('--quick');
  const rest = args.filter((arg) => arg !== '--quick');
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i] ?? '';
    const value = rest[i + 1];
    const known = [
      '--roles',
      '--species',
      '--out',
      '--jobs',
      '--set',
      '--variant',
      '--base',
      '--json',
    ];
    if (!known.includes(name) || value === undefined) {
      throw new Error(`The option ${name} is unknown or has no value.\n${USAGE}`);
    }
    if (name === '--set') {
      sets.push(value);
    } else if (name === '--variant') {
      const cut = value.indexOf('=');
      const label = value.slice(0, cut);
      if (cut < 1 || label === 'base' || named.some(([n]) => n === label)) {
        throw new Error(
          `The option --variant takes <name>=<changes> with a new name other than base, and not "${value}".`,
        );
      }
      named.push([label, value.slice(cut + 1)]);
    } else {
      values.set(name, value);
    }
  }
  const joined = (...parts: readonly string[]): string => parts.filter((p) => p !== '').join(';');
  const variants: MatrixVariant[] = [
    { name: 'base', changes: joined(...sets) },
    ...named.map(([name, changes]) => ({
      name,
      changes: joined(...sets, changes),
    })),
  ];
  for (const variant of variants) {
    setHolds(variant.changes).undo();
  }
  const list = (name: string): string[] | null =>
    values
      .get(name)
      ?.split(',')
      .filter((item) => item !== '') ?? null;
  const roles = list('--roles') ?? [...CAST_ROLES];
  const players = [...FOLD_ROLES].filter(([, role]) => role.kind === 'player').map(([n]) => n);
  const unknownRoles = roles.filter((role) => !players.includes(role));
  if (unknownRoles.length > 0) {
    throw new Error(
      `No player role has the name ${unknownRoles.join(', ')}. The roles are: ${players.join(', ')}.`,
    );
  }
  const species = list('--species') ?? [...SPECIES_IDS];
  const unknownSpecies = species.filter((id) => !isSpeciesId(id));
  if (unknownSpecies.length > 0) {
    throw new Error(`No species has the id ${unknownSpecies.join(', ')}.`);
  }
  const jobs = Number(values.get('--jobs') ?? 4);
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new Error('The option --jobs takes a whole number above 0.');
  }
  return {
    roles,
    species: species.filter(isSpeciesId),
    out: resolve(
      values.get('--out') ??
        join(
          ROOT,
          'scratch',
          `cast-matrix${quick ? '-quick' : ''}${values.has('--base') ? '-compare' : ''}.md`,
        ),
    ),
    jobs,
    sample: quick ? QUICK_SAMPLE : CAST_SAMPLE,
    variants,
    base: values.get('--base') ?? null,
    json: values.has('--json') ? resolve(values.get('--json') ?? '') : null,
  };
}

/**
 * Gives the species of the own role of a role of `FOLD_ROLES`.
 *
 * @param role The role.
 * @returns The species.
 * @throws Error if the role is no player role.
 */
function homeSpecies(role: string): readonly SpeciesId[] {
  const source = FOLD_ROLES.get(role);
  if (source?.kind !== 'player') {
    throw new Error(`The ${role} is no player role.`);
  }
  return source.species;
}

/**
 * Gives the name of a pair for the role tools: the role for its own species, else the recast role
 * `<role>@<species>`.
 *
 * @param species The species.
 * @param role The role.
 * @returns The name.
 */
export function pairName(species: SpeciesId, role: string): string {
  return homeSpecies(role).includes(species) ? role : `${role}@${species}`;
}

/**
 * Gives the demo of the sample of a role: the shortest demo with a player of the role
 * ({@link CAST_SAMPLE}).
 *
 * @param role The role.
 * @returns The file of the demo.
 * @throws Error if no demo has the role.
 */
export async function roleDemo(role: string): Promise<string> {
  const sweep = findSweep(role);
  if (!sweep) {
    throw new Error(`The ${role} has no sweep.`);
  }
  let best: { readonly file: string; readonly length: number } | null = null;
  for (const demo of await probeDemos()) {
    const score = scoreOf(demo.bytes);
    if (sweep.hasRole(score) && (!best || score.durationSec < best.length)) {
      best = { file: demo.file, length: score.durationSec };
    }
  }
  if (!best) {
    throw new Error(`No demo has the ${role}.`);
  }
  return best.file;
}

/**
 * Gives a recast species the shared hold of an instrument: it removes the own hold of the species
 * from `SPECIES_HOLDS` and `SPECIES_WIND_HOLDS`, in memory. A child measures one pair and ends, so
 * the change stays.
 *
 * @param species The species.
 * @param instrument The instrument.
 */
function useSharedHold(species: SpeciesId, instrument: InstrumentId): void {
  for (const entry of [SPECIES_HOLDS[species], SPECIES_WIND_HOLDS[species]]) {
    if (entry && Object.hasOwn(entry, instrument)) {
      Reflect.deleteProperty(entry, instrument);
    }
  }
}

/**
 * Gives the scale of the instrument of a recast species that a hold change sets, such as
 * `wolf.violinScale=0.7`, or `null` when the changes set no such scale.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param changes The hold changes.
 * @returns The scale, or `null`.
 */
function scaleOfChanges(
  species: SpeciesId,
  instrument: InstrumentId,
  changes: string,
): PairScale | null {
  if (!isScaledInstrument(instrument)) {
    return null;
  }
  const path = `${species}.${SCALE_PARAMS[instrument]}=`;
  const named = changes.split(';').some((change) => change.trim().startsWith(path));
  const params: SpeciesParams = SPECIES[species];
  return named ? { value: params[SCALE_PARAMS[instrument]] ?? 1, source: 'set' } : null;
}

/** One pair of the matrix, set up in memory by {@link setPair}. */
export interface CastPair {
  /** The name of the pair for the role tools: the role, or `<role>@<species>`. */
  readonly name: string;
  /** True for the own role of the species. */
  readonly own: boolean;
  /** The role of the pair (`findRole()`). */
  readonly source: Extract<RoleSource, { readonly kind: 'player' }>;
  /** The sweep of the pair (`findSweep()`). */
  readonly sweep: RoleSweep;
  /** The instrument scale. */
  readonly scale: PairScale;
}

/**
 * Sets up one pair of the matrix in memory, as the matrix measures it: the hold changes, then, for
 * a recast pair, the shared hold of the instrument and the size rule. The change stays, so a
 * caller measures one pair in its own process.
 *
 * @param species The species.
 * @param role The role.
 * @param changes The hold changes ({@link MatrixVariant}), before the shared hold and the size
 *   rule, or `''` for none.
 * @returns The pair.
 * @throws Error if the pair has no role or no sweep.
 */
export function setPair(species: SpeciesId, role: string, changes: string): CastPair {
  const name = pairName(species, role);
  const own = name === role;
  const source = findRole(name);
  const sweep = findSweep(name);
  if (source?.kind !== 'player' || !sweep) {
    throw new Error(`The pair ${name} has no role or no sweep.`);
  }
  setHolds(changes);
  let scale: PairScale = { value: 1, source: 'own' };
  if (!own) {
    useSharedHold(species, source.instrument);
    scale =
      scaleOfChanges(species, source.instrument, changes) ??
      setRecastScale(species, source.instrument);
  }
  return { name, own, source, sweep, scale };
}

/**
 * Measures one pair in this process: the arm gate and the sweep on the sample of the role. A fault
 * of the pair, such as a species with no body sweep, gives the JSON with its message, so that the
 * matrix shows it as a cell.
 *
 * @param species The species.
 * @param role The role.
 * @param demo The demo of the sample.
 * @param sample The sample of the pair.
 * @param changes The hold changes of the variant ({@link MatrixVariant}), before the shared hold
 *   and the size rule.
 * @returns The JSON of the pair.
 */
async function measurePair(
  species: SpeciesId,
  role: string,
  demo: string,
  sample: CastSample,
  changes: string,
): Promise<PairJson> {
  const started = performance.now();
  const name = pairName(species, role);
  const own = name === role;
  const base = { version: CAST_FORMAT, species, role, name, own, demo };
  let scale: PairScale = { value: 1, source: 'own' };
  try {
    const cast = setPair(species, role, changes);
    const { source, sweep } = cast;
    scale = cast.scale;
    const demos = (await probeDemos()).filter((file) => file.file === demo);
    const grips = ACCEPTED_GRIPS.get(role) ?? null;
    const arms = probeRole(source, demos, sample.step, grips);
    const results = await sweepDemos(
      {
        demos: [demo.replace(/\.mid$/, '')],
        times: null,
        gaps: false,
        every: sample.every,
      },
      sweep,
    );
    const clips = new Map<string, PairClip>();
    let targets: TargetReach = { samples: 0, within: 0, worst: 0 };
    for (const result of results) {
      for (const set of result.sets) {
        for (const pair of set.pairs) {
          const key = `${set.name} ${pair.part} ${pair.into}`;
          const found = clips.get(key);
          if (!found || pair.depth > found.depth) {
            clips.set(key, {
              set: set.name,
              part: pair.part,
              into: pair.into,
              depth: pair.depth,
              limit: depthLimit(sweep, pair, set.name).depth,
              at: sampleAt(result.demo, set.name, pair),
            });
          }
        }
      }
      targets = {
        samples: targets.samples + result.reached.samples,
        within: targets.within + result.reached.within,
        worst: Math.max(targets.worst, result.reached.worst),
      };
    }
    const seconds = (performance.now() - started) / 1000;
    const targetLimit = sweep.targetError;
    const found = { arms, clips: [...clips.values()], targets, targetLimit };
    return { ...base, scale, ...found, error: null, seconds };
  } catch (error) {
    return {
      ...base,
      scale,
      arms: null,
      clips: [],
      targets: { samples: 0, within: 0, worst: 0 },
      targetLimit: 0,
      error: error instanceof Error ? error.message : String(error),
      seconds: (performance.now() - started) / 1000,
    };
  }
}

/**
 * Gives the verdict of a value against its limit and the value of the own pair of the role: over
 * the limit fails, unless the own pair is over the limit too and the value is not worse by more
 * than the margin (a known item of the role, `OPEN`).
 *
 * @param over True when the value is over its limit.
 * @param homeOver True when the value of the own pair is over the limit.
 * @param worse The amount by which the value is worse than the value of the own pair.
 * @param margin The margin.
 * @returns The verdict.
 */
export function cellVerdict(
  over: boolean,
  homeOver: boolean,
  worse: number,
  margin: number,
): CellItem['verdict'] {
  if (!over) {
    return 'PASS';
  }
  return homeOver && worse <= margin ? 'OPEN' : 'FAIL';
}

/** The short names of the measures of the gate in a cell. */
const SHORT: Readonly<Record<Measure, string>> = {
  folds: 'folds',
  twist: 'twist',
  foreTwist: 'forearm twist',
  flat: 'flat',
  pawTwist: 'paw twist',
  pawSwing: 'paw swing',
  pawJump: 'paw jumps',
  stretch: 'stretch',
  grip: 'grip',
  moveTwist: 'move twist',
  moveTurn: 'move turn',
};

/**
 * Gives the item of one value of the gate.
 *
 * @param row The value.
 * @param home The value of the own pair of the role with the same arm and measure, or none.
 * @returns The item.
 */
function gateItem(row: GateRow, home: GateRow | undefined): CellItem {
  const limit = ARM_LIMITS[row.measure];
  const over = (value: number): boolean => (limit.up ? value > limit.limit : value < limit.limit);
  const worse = home ? (limit.up ? row.value - home.value : home.value - row.value) : Infinity;
  const ratio = limit.up ? row.value / limit.limit : limit.limit / Math.max(1e-6, row.value);
  const digits = limit.stat === 'share' ? 3 : limit.digits;
  return {
    verdict: cellVerdict(over(row.value), home ? over(home.value) : false, worse, limit.margin),
    text: `${SHORT[row.measure]} ${row.side} ${row.value.toFixed(digits)}/${limit.limit}`,
    ratio,
  };
}

/**
 * Gives the item of one clip of the sweep.
 *
 * @param clip The clip.
 * @param home The clip of the own pair of the role with the same set and parts, or none.
 * @returns The item.
 */
function clipItem(clip: PairClip, home: PairClip | undefined): CellItem {
  const over = (c: PairClip): boolean => c.depth > c.limit;
  const worse = home ? clip.depth - home.depth : Infinity;
  const cm = (m: number): string => (m * 100).toFixed(1);
  return {
    verdict: cellVerdict(over(clip), home ? over(home) : false, worse, CLIP_MARGIN),
    text: `${clip.set} ${clip.part}>${clip.into} ${cm(clip.depth)}/${cm(clip.limit)} cm`,
    ratio: clip.depth / Math.max(1e-6, clip.limit),
  };
}

/**
 * Gives the item of the note targets of a pair: the largest error of a hand, or of the part that
 * it holds, from its note target. It goes over its limit when a paw misses its strings, keys, or
 * valves.
 *
 * @param pair The pair.
 * @param home The own pair of the role, or `null`.
 * @returns The item, or `null` for a pair with no note target.
 */
function targetItem(pair: PairJson, home: PairJson | null): CellItem | null {
  if (pair.targets.samples === 0) {
    return null;
  }
  const { worst } = pair.targets;
  const limit = pair.targetLimit;
  const homeWorst = home && home.targets.samples > 0 ? home.targets.worst : null;
  const mm = (m: number): string => (m * 1000).toFixed(m < 0.01 ? 1 : 0);
  return {
    verdict: cellVerdict(
      worst > limit,
      homeWorst !== null && homeWorst > limit,
      homeWorst === null ? Infinity : worst - homeWorst,
      CLIP_MARGIN,
    ),
    text: `targets ${mm(worst)}/${mm(limit)} mm`,
    ratio: worst / Math.max(1e-4, limit),
  };
}

/**
 * Gives the cell of a pair against the own pair of its role.
 *
 * @param pair The pair.
 * @param home The own pair of the role, or `null` when it failed.
 * @returns The cell.
 */
export function matrixCell(pair: PairJson, home: PairJson | null): MatrixCell {
  if (pair.error !== null || !pair.arms) {
    const text = `error: ${(pair.error ?? 'no report').split('\n')[0] ?? ''}`;
    const item: CellItem = { verdict: 'FAIL', text, ratio: Infinity };
    return {
      verdict: 'FAIL',
      worst: item,
      clip: null,
      targets: null,
      items: [item],
    };
  }

  const homeRows = home?.arms ? gateRows(home.name, home.arms, null) : [];
  const gate = gateRows(pair.name, pair.arms, null).map((row) =>
    gateItem(
      row,
      homeRows.find((h) => h.side === row.side && h.measure === row.measure),
    ),
  );
  const clips = pair.clips.map((clip) =>
    clipItem(
      clip,
      home?.clips.find((h) => h.set === clip.set && h.part === clip.part && h.into === clip.into),
    ),
  );
  const largest = (items: readonly CellItem[]): CellItem | null =>
    items.reduce<CellItem | null>(
      (best, item) => (!best || item.ratio > best.ratio ? item : best),
      null,
    );
  const targets = targetItem(pair, home);
  const items = [...gate, ...clips, ...(targets ? [targets] : [])].filter(
    (item) => item.verdict !== 'PASS',
  );
  const verdict = items.some((item) => item.verdict === 'FAIL')
    ? 'FAIL'
    : items.length > 0
      ? 'OPEN'
      : 'PASS';
  return {
    verdict,
    worst: largest(gate),
    clip: largest(clips),
    targets,
    items,
  };
}

/**
 * Writes the text of a cell: the verdict, the worst value of the gate, the deepest clip, the note
 * targets when they do not pass, and the scale.
 *
 * @param pair The pair.
 * @param cell The cell.
 * @returns The text.
 */
export function cellText(pair: PairJson, cell: MatrixCell): string {
  const scale =
    pair.scale.source === 'fixed'
      ? ''
      : pair.scale.source === 'own'
        ? ' · own'
        : pair.scale.source === 'none'
          ? ' · x1 no rule'
          : ` · x${pair.scale.value.toFixed(2)}${pair.scale.source === 'rule' ? '' : ` ${pair.scale.source}`}`;
  const missed = cell.targets?.verdict === 'PASS' ? undefined : cell.targets?.text;
  const parts = [cell.verdict, cell.worst?.text, cell.clip?.text, missed].filter(
    (part) => part !== undefined,
  );
  return `${parts.join(' · ')}${scale}`;
}

/**
 * Writes the table of the matrix: a row for each species, and a column for each role of each
 * variant, with the counts of the verdicts of each variant and the changes of each variant.
 *
 * @param json The matrix.
 * @returns The lines.
 */
export function matrixLines(json: MatrixJson): string[] {
  const named = json.variants.length > 1;
  const columns = json.variants.flatMap((variant) =>
    json.roles.map((role) => ({ variant: variant.name, role })),
  );
  const find = (species: SpeciesId, role: string, variant: string): MatrixPair | undefined =>
    json.pairs.find(
      (p) => p.variant === variant && p.pair.species === species && p.pair.role === role,
    );
  const header = columns.map(
    ({ variant, role }) => `${role} (${json.demos[role] ?? '-'})${named ? ` [${variant}]` : ''}`,
  );
  const lines = [
    `Cast matrix of ${json.species.length} species and ${json.roles.length} roles in ${Math.round(json.seconds)} s. Sample: the shortest demo with the role, a gate step of ${json.sample.step} s, and each ${json.sample.every}th sweep sample. A cell gives the verdict, the worst value of the gate, the deepest clip (value/limit), the note targets that do not pass, and the scale of a scaled instrument.`,
    '',
    ...json.variants
      .filter((variant) => variant.changes !== '')
      .map((variant) => `Changes of ${variant.name}: \`${variant.changes}\`.`),
    ...(json.variants.some((variant) => variant.changes !== '') ? [''] : []),
    `| Species | ${header.join(' | ')} |`,
    `|---|${columns.map(() => '---').join('|')}|`,
  ];
  for (const species of json.species) {
    const cells = columns.map(({ variant, role }) => {
      const found = find(species, role, variant);
      return found ? cellText(found.pair, found.cell) : '-';
    });
    lines.push(`| ${species} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  for (const variant of json.variants) {
    const count = (verdict: MatrixCell['verdict']): number =>
      json.pairs.filter(
        (p) =>
          p.variant === variant.name &&
          json.species.includes(p.pair.species) &&
          p.cell.verdict === verdict,
      ).length;
    const counts = `PASS ${count('PASS')}, OPEN ${count('OPEN')}, FAIL ${count('FAIL')}.`;
    lines.push(named ? `${variant.name}: ${counts}` : counts);
  }
  return lines;
}

/**
 * Gives the cache file of a pair: the key of the tree (`treeCacheFile()`), with the pair and the
 * sample in its arguments, or `null` with `PROBE_NO_CACHE=1`.
 *
 * @param tree The key file of the tree for the run.
 * @param species The species.
 * @param role The role.
 * @returns The file, or `null`.
 */
function pairCacheFile(tree: string | null, species: SpeciesId, role: string): string | null {
  return tree ? tree.replace(/\.json$/, `-${species}.${role}.json`) : null;
}

/**
 * Measures one pair in a child process, or reads it from the cache.
 *
 * @param tree The key file of the tree, or `null` for no cache.
 * @param species The species.
 * @param role The role.
 * @param demo The demo of the sample.
 * @param sample The sample of the pair.
 * @param changes The hold changes of the variant, or `''` for none.
 * @returns The JSON of the pair.
 */
async function runPair(
  tree: string | null,
  species: SpeciesId,
  role: string,
  demo: string,
  sample: CastSample,
  changes: string,
): Promise<PairJson> {
  const cache = pairCacheFile(tree, species, role);
  if (cache && existsSync(cache)) {
    return readPair(await readFile(cache, 'utf8'));
  }
  const text = await withTempFolder(
    async (dir) => {
      const file = join(dir, 'pair.json');
      await runChild(
        process.execPath,
        [
          join('tools', 'cast-matrix.ts'),
          '--pair',
          `${species},${role},${demo}`,
          '--json',
          file,
          '--sample',
          `${sample.step},${sample.every}`,
          ...(changes === '' ? [] : ['--set', changes]),
        ],
        ROOT,
      );
      return readFile(file, 'utf8');
    },
    { prefix: 'cast-matrix-' },
  );
  if (cache) {
    storeBase(cache, text);
  }
  return readPair(text);
}

/**
 * Reads the JSON text of a pair.
 *
 * @param text The text.
 * @returns The JSON.
 */
function readPair(text: string): PairJson {
  // SAFETY: the text comes from childMain() of this tool, with the format of the cache key.
  return JSON.parse(text) as PairJson;
}

/**
 * Runs a function on each item, with at most a number of calls at the same time.
 *
 * @param items The items.
 * @param jobs The largest number of calls at the same time.
 * @param work The function.
 * @returns The results, in the order of the items.
 */
async function eachLimited<T, R>(
  items: readonly T[],
  jobs: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const k = next;
      next += 1;
      const item = items[k];
      if (item !== undefined) {
        results[k] = await work(item);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane));
  return results;
}

/**
 * Runs the tool as a child: it measures one pair, and writes {@link PairJson} into the file of
 * `--json`.
 *
 * @param args The arguments: `--pair <species>,<role>,<demo> --json <file> --sample <step>,<every>`,
 *   and `--set <changes>` for a variant with changes.
 */
async function childMain(args: readonly string[]): Promise<void> {
  const [species = '', role = '', demo = ''] = (args[1] ?? '').split(',');
  const file = args[3];
  const [step = NaN, every = NaN] = (args[5] ?? '').split(',').map(Number);
  const changes = args[6] === '--set' ? (args[7] ?? '') : '';
  if (
    !isSpeciesId(species) ||
    !FOLD_ROLES.has(role) ||
    args[2] !== '--json' ||
    !file ||
    args[4] !== '--sample' ||
    !(step > 0) ||
    !Number.isInteger(every) ||
    args.length !== (args[6] === '--set' ? 8 : 6)
  ) {
    throw new Error(
      'The child takes --pair <species>,<role>,<demo> --json <file> --sample <step>,<every> [--set <changes>].',
    );
  }
  const pair = await measurePair(species, role, demo, { step, every }, changes);
  writeFileSync(file, `${JSON.stringify(pair)}\n`);
}

/**
 * Gives the cache file of the pairs of one variant of a run (`treeCacheFile()`), or `null` with
 * `PROBE_NO_CACHE=1` or with no index of git. The probe tree of a commit of `--base` is an empty git
 * repository with no index, so its pairs have no cache, and `probeBeside()` caches the whole JSON
 * of the commit in place of them.
 *
 * @param sample The sample of the run.
 * @param changes The hold changes of the variant, or `''` for none.
 * @returns The key file of the tree, or `null`.
 */
function variantCache(sample: CastSample, changes: string): string | null {
  if (process.env[PROBE_NO_CACHE] === '1') {
    return null;
  }
  try {
    // A variant with no change keeps the key of a run with no --set.
    return treeCacheFile('cast-matrix.ts', [
      `format ${CAST_FORMAT}`,
      JSON.stringify(sample),
      ...(changes === '' ? [] : [`set ${changes}`]),
    ]);
  } catch {
    return null;
  }
}

/**
 * Measures each pair of a run in its child process, or reads it from the cache, and gives the
 * JSON of the run with the cell of each pair.
 *
 * @param options The command line.
 * @param progress True to print a line at the end of each pair.
 * @returns The JSON of the run.
 */
async function runMatrix(options: MatrixArgs, progress: boolean): Promise<MatrixJson> {
  const started = performance.now();
  const demos: Record<string, string> = {};
  for (const role of options.roles) {
    demos[role] = await roleDemo(role);
  }
  const trees = new Map(
    options.variants.map((variant) => [
      variant.name,
      variantCache(options.sample, variant.changes),
    ]),
  );
  const wanted = options.variants.flatMap((variant) =>
    options.roles.flatMap((role) => {
      const homes = homeSpecies(role).filter((s) => !options.species.includes(s));
      return [...options.species, ...homes].map((species) => ({
        species,
        role,
        variant,
      }));
    }),
  );
  let done = 0;
  const pairs = await eachLimited(wanted, options.jobs, async ({ species, role, variant }) => {
    const tree = trees.get(variant.name) ?? null;
    const demo = demos[role] ?? '';
    const pair = await runPair(tree, species, role, demo, options.sample, variant.changes);
    done += 1;
    const state = pair.error === null ? '' : ` error: ${pair.error.split('\n')[0] ?? ''}`;
    const label = options.variants.length > 1 ? ` [${variant.name}]` : '';
    if (progress) {
      console.log(
        `${done}/${wanted.length} ${pairName(species, role)}${label} ${pair.seconds.toFixed(0)} s${state}`,
      );
    }
    return { variant: variant.name, pair };
  });
  return {
    version: CAST_FORMAT,
    roles: options.roles,
    species: options.species,
    sample: options.sample,
    demos,
    variants: options.variants,
    seconds: (performance.now() - started) / 1000,
    pairs: pairs.map(({ variant, pair }) => {
      const home = pairs.find(
        (p) => p.variant === variant && p.pair.role === pair.role && p.pair.own,
      );
      return { variant, pair, cell: matrixCell(pair, home?.pair ?? null) };
    }),
  };
}

/**
 * Writes the table of a run of `--base`: one row for each pair of each variant, with the cell of
 * the commit, the cell of the working tree, and the change: `same`, the change of the verdict, or
 * `value` for a cell with the same verdict and another text.
 *
 * @param base The JSON of the run of the commit.
 * @param tree The JSON of the run of the working tree.
 * @param ref The commit, as the command line gives it.
 * @returns The lines.
 */
export function compareLines(base: MatrixJson, tree: MatrixJson, ref: string): string[] {
  const named = tree.variants.length > 1;
  const rows = tree.pairs
    .filter((p) => tree.species.includes(p.pair.species))
    .map(({ variant, pair, cell }) => {
      const before = base.pairs.find(
        (p) =>
          p.variant === variant && p.pair.species === pair.species && p.pair.role === pair.role,
      );
      const was = before ? cellText(before.pair, before.cell) : '-';
      const now = cellText(pair, cell);
      const change = !before
        ? 'new'
        : before.cell.verdict !== cell.verdict
          ? `${before.cell.verdict} -> ${cell.verdict}`
          : was === now
            ? 'same'
            : 'value';
      const label = named ? ` [${variant}]` : '';
      return {
        change,
        line: `| ${pair.species} | ${pair.role}${label} | ${was} | ${now} | ${change} |`,
      };
    });
  const count = (json: MatrixJson, verdict: MatrixCell['verdict']): number =>
    json.pairs.filter((p) => json.species.includes(p.pair.species) && p.cell.verdict === verdict)
      .length;
  const counts = (json: MatrixJson): string =>
    `PASS ${count(json, 'PASS')}, OPEN ${count(json, 'OPEN')}, FAIL ${count(json, 'FAIL')}`;
  const changed = rows.filter((row) => row.change !== 'same').length;
  return [
    `Cast matrix of ${tree.species.length} species and ${tree.roles.length} roles against ${ref}: ${changed} of ${rows.length} cells change. Base: ${counts(base)}. Tree: ${counts(tree)}. A cell gives the verdict, the worst value of the gate, the deepest clip, and the scale.`,
    '',
    `| Species | Role | ${ref} | Tree | Change |`,
    '|---|---|---|---|---|',
    ...rows.map((row) => row.line),
  ];
}

/**
 * Reads the JSON text of a run.
 *
 * @param text The text.
 * @returns The JSON.
 */
function readMatrix(text: string): MatrixJson {
  // SAFETY: the text comes from main() of this tool with --json, and probeFormat() checked it.
  return JSON.parse(text) as MatrixJson;
}

/**
 * Runs the tool.
 *
 * @returns The exit code.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args[0] === '--pair') {
    await childMain(args);
    return 0;
  }

  const options = parseMatrixArgs(args);
  if (options.json !== null) {
    writeFileSync(options.json, `${JSON.stringify(await runMatrix(options, false))}\n`);
    return 0;
  }
  if (options.base !== null) {
    console.log(`The matrix runs on ${options.base} and on the working tree, each in a child.`);
    const child = withoutOptions(args, ['--base', '--out', '--json']);
    const texts = await probeBeside(
      options.base,
      'cast-matrix.ts',
      { base: child, tree: child },
      { prefix: 'cast-matrix-', cache: true },
    );
    const lines = compareLines(readMatrix(texts.base), readMatrix(texts.tree), options.base);
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${lines.join('\n')}\n`);
    console.log(['', ...lines, '', `Table: ${options.out}`].join('\n'));
    return 0;
  }
  const json = await runMatrix(options, true);
  const lines = matrixLines(json);
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${lines.join('\n')}\n`);
  writeFileSync(options.out.replace(/\.md$/, '') + '.json', `${JSON.stringify(json, null, 1)}\n`);
  console.log(['', ...lines, '', `Table: ${options.out}`].join('\n'));
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
