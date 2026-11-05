/**
 * Gives the bind supination of each paw of a body by the rule of design 4.4 ("Role-neutral
 * bind"): the value that makes the largest paw twist p95 of any role smallest. The roles are the
 * roles of the cast matrix (`CAST_ROLES` of `tools/cast-matrix.ts`) and the own roles of the
 * species, each on the sample of the matrix (`CAST_SAMPLE`), with the shared hold and the size rule
 * of a recast pair (`setPair()`).
 *
 * Each pair runs in a child process, which writes the signed paw twist of each arm in each sample
 * of the rest, the play, and the lift (`pawRoll` of `measureArm()` of `tools/arm-check.ts`). A
 * change d of the supination moves each signed twist of the left arm by +d and of the right arm by
 * -d, because the left paw supinates by a negative turn about its forearm (`paw_supination()` of
 * `tools/blender/rig_mesh.py`). So the twists of one rig give the value of each side
 * ({@link supinationChange}), with no new rig. The value is the supination of now plus the change.
 * The supination of now comes from `--from` for a GLB file rigged with another value, else from
 * the export summary of a hand rig (`bindSupination` of `<file>.json` beside the GLB file, or
 * `--summary`), else from `studio.bindSupination` of the rig config of the animal. A hand rig keeps
 * its values only in its `.blend`, so the last line then says to key the values in its Action
 * `bind`.
 *
 * The JSON of each pair goes into a cache by tree (`treeCacheFile()` of `tools/ref-tree.ts`). With
 * `--glb <file>`, the tool runs again in a copy of `src/` with the studio body of the file
 * (`tools/glb-swap.ts`), with no cache.
 *
 * Usage: pnpm bind-supination <species> [--glb <file>] [--from <L>,<R>] [--summary <file>] [--jobs <n>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { armBinds, measureArm } from './arm-check.ts';
import { CAST_ROLES, CAST_SAMPLE, pairName, roleDemo, setPair } from './cast-matrix.ts';
import { FOLD_ROLES, SAMPLE_SETS, findRole, findSweep, probeFolds } from './fold-probe.ts';
import type { RoleSource, SampleSet } from './fold-probe.ts';
import {
  glbAnimal,
  handRigOf,
  handRigPath,
  rigConfigPath,
  runTool,
  takeGlb,
  withGlbBody,
} from './glb-swap.ts';
import { probeDemos } from './probe-demos.ts';
import { ANIMALS } from './studio-body.ts';
import {
  PROBE_NO_CACHE,
  ROOT,
  runChild,
  storeBase,
  treeCacheFile,
  withTempFolder,
} from './ref-tree.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import type { Side } from '../src/models/studio-format.ts';

/** The sides of the arms. */
const SIDES = ['L', 'R'] as const;

/** The format version of {@link RollJson}. A new version gives new cache keys. */
const ROLL_FORMAT = 1;

/**
 * The sign of the move of the signed paw twist of each arm for a larger supination: the left paw
 * supinates by a negative turn about its forearm, and the right paw by a positive turn.
 */
export const SUPINATION_SIGN: Readonly<Record<Side, 1 | -1>> = { L: 1, R: -1 };

/** The step of the changes that {@link supinationChange} tries, in degrees. */
const CHANGE_STEP = 0.5;

/** The signed paw twists of one pair, in degrees, by arm and sample set. */
export type PawRolls = Readonly<Record<Side, Readonly<Record<SampleSet, readonly number[]>>>>;

/** The JSON of one pair, as a child writes it. */
export interface RollJson {
  /** The format version ({@link ROLL_FORMAT}). */
  readonly version: number;
  /** The species. */
  readonly species: SpeciesId;
  /** The role of `FOLD_ROLES`. */
  readonly role: string;
  /** The name of the pair: the role, or `<role>@<species>`. */
  readonly name: string;
  /** The demo of the sample. */
  readonly demo: string;
  /** The signed paw twists from the bind of now. */
  readonly rolls: PawRolls;
}

/** The best change of the supination of one arm. */
export interface SupinationChange {
  /** The change of the supination, in degrees. */
  readonly change: number;
  /** The largest paw twist p95 of any role and sample set with the change, in degrees. */
  readonly worst: number;
  /** The largest paw twist p95 with no change, in degrees. */
  readonly now: number;
  /** The smallest and the largest change whose largest p95 is within 1° of the best. */
  readonly near: readonly [number, number];
}

/**
 * Gives an angle in -180° to 180°.
 *
 * @param degrees The angle, in degrees.
 * @returns The same turn in -180° to 180°.
 */
function wrap(degrees: number): number {
  return degrees - 360 * Math.round(degrees / 360);
}

/**
 * Gives the 95th percentile of some values, as the arm gate gives it (`setStats()` of
 * `tools/arm-check.ts`): the value at the rank of the floor of 0.95 times the count.
 *
 * @param values The values.
 * @returns The percentile, or 0 with no value.
 */
function p95(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] ?? 0;
}

/**
 * Gives the largest paw twist p95 of one arm over all pairs and sample sets after a change of the
 * supination.
 *
 * @param pairs The twists of each pair.
 * @param side The arm.
 * @param change The change of the supination, in degrees.
 * @returns The largest p95, in degrees.
 */
export function worstTwist(pairs: readonly PawRolls[], side: Side, change: number): number {
  const shift = SUPINATION_SIGN[side] * change;
  let worst = 0;
  for (const rolls of pairs) {
    for (const set of SAMPLE_SETS) {
      const values = rolls[side][set];
      if (values.length > 0) {
        worst = Math.max(worst, p95(values.map((roll) => Math.abs(wrap(roll + shift)))));
      }
    }
  }
  return worst;
}

/**
 * Gives the change of the supination of one arm that makes the largest paw twist p95 of any pair
 * smallest (design 4.4), over the changes from -180° to 180° at steps of {@link CHANGE_STEP}. Of
 * two changes with the same largest p95, the smaller change wins.
 *
 * @param pairs The twists of each pair.
 * @param side The arm.
 * @returns The change.
 */
export function supinationChange(pairs: readonly PawRolls[], side: Side): SupinationChange {
  const tries: { readonly change: number; readonly worst: number }[] = [];
  for (let k = -180 / CHANGE_STEP; k < 180 / CHANGE_STEP; k++) {
    const change = k * CHANGE_STEP;
    tries.push({ change, worst: worstTwist(pairs, side, change) });
  }
  const best = tries.reduce((found, item) =>
    item.worst < found.worst ||
    (item.worst === found.worst && Math.abs(item.change) < Math.abs(found.change))
      ? item
      : found,
  );
  const near = tries.filter((item) => item.worst <= best.worst + 1).map((item) => item.change);
  return {
    change: best.change,
    worst: best.worst,
    now: worstTwist(pairs, side, 0),
    near: [Math.min(...near), Math.max(...near)],
  };
}

/**
 * Gives the roles of a species: the roles of the cast matrix, then each own role of the species
 * that the matrix does not have.
 *
 * @param species The species.
 * @returns The roles.
 */
export function supinationRoles(species: SpeciesId): string[] {
  const own = [...FOLD_ROLES]
    .filter(([, role]) => role.kind === 'player' && role.species.includes(species))
    .map(([name]) => name);
  return [...new Set<string>([...CAST_ROLES, ...own])];
}

/**
 * Gives the role whose demo a role takes: the role, or, for an own role with no sweep of its own,
 * the first role of its instrument with a sweep. The sweep of the violinist holds the red fox, so
 * the fox-violinist takes the demo of the violinist.
 *
 * @param role The role.
 * @returns The role of the demo.
 */
function demoRole(role: string): string {
  const source = FOLD_ROLES.get(role);
  if (findSweep(role) || source?.kind !== 'player') {
    return role;
  }
  const same = [...FOLD_ROLES].find(
    ([name, other]) =>
      other.kind === 'player' && other.instrument === source.instrument && findSweep(name),
  );
  return same?.[0] ?? role;
}

/** One pair of this tool, set up in memory by {@link pairSource}. */
interface SupinationPair {
  /** The name of the pair: the role, or `<role>@<species>`. */
  readonly name: string;
  /** The role of the pair (`findRole()`). */
  readonly source: RoleSource;
}

/**
 * Sets up one pair in memory. A recast pair takes the shared hold and the size rule of the matrix
 * (`setPair()`). An own role keeps its hold and its scale. It needs no sweep, because the tool reads
 * only the paw twists of the bodies of the role.
 *
 * @param species The species.
 * @param role The role.
 * @returns The pair.
 * @throws Error if the pair has no role.
 */
function pairSource(species: SpeciesId, role: string): SupinationPair {
  const name = pairName(species, role);
  if (name !== role) {
    return setPair(species, role, '');
  }
  const source = findRole(name);
  if (!source) {
    throw new Error(`The pair ${name} has no role.`);
  }
  return { name, source };
}

/**
 * Measures the signed paw twists of one pair in this process, on the demo of the matrix.
 *
 * @param species The species.
 * @param role The role.
 * @returns The JSON of the pair.
 */
async function measureRolls(species: SpeciesId, role: string): Promise<RollJson> {
  const { name, source } = pairSource(species, role);
  const demo = await roleDemo(demoRole(role));
  const demos = (await probeDemos()).filter((file) => file.file === demo);
  const lists = (): Record<SampleSet, number[]> => ({ rest: [], play: [], lift: [] });
  const rolls: Record<Side, Record<SampleSet, number[]>> = { L: lists(), R: lists() };
  probeFolds(source, demos, CAST_SAMPLE.step, (rig, studio, posed, folded, set) => {
    const arms = armBinds(rig);
    for (const side of SIDES) {
      rolls[side][set].push(measureArm(arms[side], studio.matrices, posed, folded, null).pawRoll);
    }
  });
  return { version: ROLL_FORMAT, species, role, name, demo, rolls };
}

/**
 * Reads the JSON text of a pair.
 *
 * @param text The text.
 * @returns The JSON.
 */
function readRolls(text: string): RollJson {
  // SAFETY: the text comes from childMain() of this tool, with the format of the cache key.
  return JSON.parse(text) as RollJson;
}

/**
 * Measures one pair in a child process, or reads it from the cache by tree.
 *
 * @param species The species.
 * @param role The role.
 * @returns The JSON of the pair.
 */
async function runPair(species: SpeciesId, role: string): Promise<RollJson> {
  const cache =
    process.env[PROBE_NO_CACHE] === '1'
      ? null
      : treeCacheFile('bind-supination.ts', [`format ${ROLL_FORMAT}`, `${species},${role}`]);
  if (cache && existsSync(cache)) {
    return readRolls(await readFile(cache, 'utf8'));
  }
  const text = await withTempFolder(
    async (dir) => {
      const file = join(dir, 'pair.json');
      await runChild(
        process.execPath,
        [join('tools', 'bind-supination.ts'), '--pair', `${species},${role}`, '--json', file],
        ROOT,
      );
      return readFile(file, 'utf8');
    },
    { prefix: 'bind-supination-' },
  );
  if (cache) {
    storeBase(cache, text);
  }
  return readRolls(text);
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

/** The supination of now of each arm. */
interface SupinationNow {
  /** The supination of each arm, in degrees. */
  readonly value: Readonly<Record<Side, number>>;
  /** The source of the values: `--from`, the export summary of a hand rig, a rig config, or none. */
  readonly source: string;
}

/**
 * Gives the export summary of the hand rig of the animal of a species (design 4.4, "Hand rig"):
 * `<file>.json` beside its GLB file `<file>.glb`, which holds the bind supination of the rig
 * (`bindSupination` of `tools/blender/export_rig.py`).
 *
 * @param species The species.
 * @param glb The GLB file of `--glb`, or `null` for the GLB file of `ANIMALS`.
 * @returns The absolute path of the summary, or `null` for an animal with no hand rig.
 */
function handRigSummary(species: SpeciesId, glb: string | null): string | null {
  const animal = glbAnimal(species);
  const file = animal === null ? undefined : ANIMALS.get(animal)?.glb;
  if (animal === null || file === undefined || handRigOf(animal, file) === null) {
    return null;
  }
  return (glb ?? join(ROOT, file)).replace(/\.glb$/, '.json');
}

/**
 * Gives the supination of now of each arm: the value of `--from`, else the bind supination of the
 * export summary of a hand rig ({@link handRigSummary}), else `studio.bindSupination` of the rig
 * config of the animal of the species, with 0 for an arm with no value. A hand rig keeps its
 * values only in its `.blend`, so the rig config does not count for it.
 *
 * @param species The species.
 * @param from The value of `--from`, or `null`.
 * @param summary The export summary of a hand rig, or `null`.
 * @returns The supination of each arm.
 * @throws Error if `--from` is not two numbers, or if the summary has no bind supination.
 */
function supinationNow(
  species: SpeciesId,
  from: string | null,
  summary: string | null,
): SupinationNow {
  if (from !== null) {
    const [left = Number.NaN, right = Number.NaN, ...rest] = from.split(',').map(Number);
    if (!Number.isFinite(left) || !Number.isFinite(right) || rest.length > 0) {
      throw new Error('The option --from takes <L>,<R> in degrees, such as 57,15.');
    }
    return { value: { L: left, R: right }, source: '--from' };
  }
  if (summary !== null) {
    // SAFETY: the summary of `export_rig.py` is a JSON object, and the check below reads the one
    // field that this tool needs.
    const json = JSON.parse(readFileSync(summary, 'utf8')) as {
      readonly bindSupination?: Partial<Record<Side, number>>;
    };
    const { L, R } = json.bindSupination ?? {};
    if (L === undefined || R === undefined) {
      throw new Error(`${summary} has no bindSupination. Run pnpm rig-export first.`);
    }
    const shown = summary.startsWith(ROOT) ? relative(ROOT, summary) : summary;
    return { value: { L, R }, source: shown };
  }
  const animal = glbAnimal(species);
  const path = animal === null ? null : rigConfigPath(animal);
  if (path === null || !existsSync(path)) {
    return { value: { L: 0, R: 0 }, source: 'no rig config' };
  }
  // SAFETY: the rig config is a JSON file of the repository with an object `studio`.
  const config = JSON.parse(readFileSync(path, 'utf8')) as {
    readonly studio?: { readonly bindSupination?: Partial<Record<Side, number>> };
  };
  const value = config.studio?.bindSupination ?? {};
  return { value: { L: value.L ?? 0, R: value.R ?? 0 }, source: `tools/mesh-rigs/${animal}.json` };
}

/**
 * Writes a range of signed twists, such as `-84` or `122..131`.
 *
 * @param values The twists, in degrees.
 * @returns The text, or `-` with no value.
 */
function range(values: readonly number[]): string {
  if (values.length === 0) {
    return '-';
  }
  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  return low === high ? `${low}` : `${low}..${high}`;
}

/**
 * Writes the table of the signed twists: one row for each arm of each pair, with the range of each
 * sample set, and the largest p95 of the pair now and with the change of its arm.
 *
 * @param pairs The pairs.
 * @param changes The change of each arm.
 * @returns The lines.
 */
export function rollLines(
  pairs: readonly RollJson[],
  changes: Readonly<Record<Side, number>>,
): string[] {
  const lines = [
    '| Role | Demo | Arm | Rest | Play | Lift | p95 now | p95 new |',
    '|---|---|---|---|---|---|---:|---:|',
  ];
  for (const pair of pairs) {
    for (const side of SIDES) {
      const sets = SAMPLE_SETS.map((set) => range(pair.rolls[side][set]));
      const now = worstTwist([pair.rolls], side, 0).toFixed(0);
      const next = worstTwist([pair.rolls], side, changes[side]).toFixed(0);
      lines.push(
        `| ${pair.name} | ${pair.demo} | ${side} | ${sets.join(' | ')} | ${now} | ${next} |`,
      );
    }
  }
  return lines;
}

/** The usage text. */
const USAGE =
  'Usage: pnpm bind-supination <species> [--glb <file>] [--from <L>,<R>] [--summary <file>] [--jobs <n>]';

/**
 * Runs the tool as a child: it measures one pair, and writes {@link RollJson} into the file of
 * `--json`.
 *
 * @param args The arguments: `--pair <species>,<role> --json <file>`.
 */
async function childMain(args: readonly string[]): Promise<void> {
  const [species = '', role = ''] = (args[1] ?? '').split(',');
  const file = args[3];
  if (!isSpeciesId(species) || !FOLD_ROLES.has(role) || args[2] !== '--json' || !file) {
    throw new Error('The child takes --pair <species>,<role> --json <file>.');
  }
  writeFileSync(file, `${JSON.stringify(await measureRolls(species, role))}\n`);
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

  const { glb, rest } = takeGlb(args);
  const species = rest[0] ?? '';
  if (!isSpeciesId(species)) {
    throw new Error(`No species has the id "${species}".\n${USAGE}`);
  }
  if (glb) {
    const animal = glbAnimal(species);
    if (animal === null) {
      throw new Error(`The ${species} has no studio body and no rig config for --glb.`);
    }
    // The empty git repository of the copy has no index to key a cache on.
    const env = { ...process.env, [PROBE_NO_CACHE]: '1' };
    // The copy has no assets, so the summary of a hand rig beside the GLB file goes to it.
    const summary = rest.includes('--from') ? null : handRigSummary(species, glb);
    const childArgs = summary === null ? rest : [...rest, '--summary', summary];
    return withGlbBody(animal, glb, (dir) => runTool(dir, 'bind-supination.ts', childArgs, env));
  }
  const values = new Map<string, string>();
  for (let i = 1; i < rest.length; i += 2) {
    const name = rest[i] ?? '';
    const value = rest[i + 1];
    if (!['--from', '--summary', '--jobs'].includes(name) || value === undefined) {
      throw new Error(`The option ${name} is unknown or has no value.\n${USAGE}`);
    }
    values.set(name, value);
  }
  const jobs = Number(values.get('--jobs') ?? 4);
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new Error('The option --jobs takes a whole number above 0.');
  }
  const from = values.get('--from') ?? null;
  const summary = values.get('--summary') ?? (from === null ? handRigSummary(species, null) : null);
  const now = supinationNow(species, from, summary);
  const animal = glbAnimal(species);
  const glbFile = animal === null ? undefined : ANIMALS.get(animal)?.glb;
  const handRig =
    from === null && summary !== null && animal !== null && glbFile !== undefined
      ? handRigPath(animal, glbFile)
      : null;

  const started = performance.now();
  const roles = supinationRoles(species);
  const pairs = await eachLimited(roles, jobs, async (role) => {
    const pair = await runPair(species, role);
    console.log(`${pairName(species, role)}: ${pair.demo}`);
    return pair;
  });
  const rolls = pairs.map((pair) => pair.rolls);
  const both = { L: supinationChange(rolls, 'L'), R: supinationChange(rolls, 'R') };
  const seconds = (performance.now() - started) / 1000;
  const value = (side: Side): number => Math.round(wrap(now.value[side] + both[side].change));
  const worstOf = (side: Side): string =>
    pairs
      .filter((pair) => worstTwist([pair.rolls], side, both[side].change) >= both[side].worst - 0.5)
      .map((pair) => pair.name)
      .join(', ');
  console.log(
    [
      '',
      `Bind supination of the ${species} from ${roles.length} roles on the sample of the cast matrix (a step of ${CAST_SAMPLE.step} s) in ${seconds.toFixed(0)} s. Now: L ${now.value.L}, R ${now.value.R} (${now.source}). A cell gives the signed paw twist from the bind of now, in degrees: the range of each sample set, and the largest p95 of the pair now and with the new value.`,
      '',
      ...rollLines(pairs, { L: both.L.change, R: both.R.change }),
      '',
      ...SIDES.map(
        (side) =>
          `${side}: change ${both[side].change.toFixed(1)}, value ${value(side)}. Largest p95 ${both[side].now.toFixed(0)} now, ${both[side].worst.toFixed(0)} new (${worstOf(side)}). Changes within 1° of the best: ${both[side].near[0].toFixed(1)} to ${both[side].near[1].toFixed(1)}.`,
      ),
      '',
      handRig === null
        ? `studio.bindSupination: { "L": ${value('L')}, "R": ${value('R')} }`
        : `Key the values in the Action bind of ${handRig}: { "L": ${value('L')}, "R": ${value('R')} }`,
    ].join('\n'),
  );
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
