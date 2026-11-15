/**
 * Scores named variants of the holds on chosen pairs of the sweep of a role, in one process
 * (`pnpm pair-scan <role>`, `docs/agents/rigging.md`, "Holds and reach"). A pair is a sample set, a
 * moving part, and an obstacle, such as `lower:upper arms:body`. For the base and each
 * `--variant`, the tool builds the scene of each demo of the role, sweeps each n-th play sample
 * (`--every`) and all samples of the other sets, or only the samples of `--at`, and gives the
 * deepest point of each pair with its sample, and the share of the samples over the limit of the
 * pair (`depthLimit()`). A row of a bowed player also gives the reached fingerboard and bow hair,
 * with the mark `no reach` or `short` of `tools/bow-warning.ts` at a hair part that shows nearly
 * no stroke.
 * `pnpm hold-scan` scores grids on 12 play samples and one rest, and this tool checks the chosen
 * pairs over the lift and the lowering too. Check the best rows with `pnpm pose-depth --set` and
 * `pnpm arm-check --variant`.
 */
import { bowMark } from './bow-warning.ts';
import { setHolds } from './hold-sets.ts';
import { roleDemos } from './pose-depth.ts';
import { sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { depthLimit, sweepDepths } from '../src/pose/test-sweep.ts';
import type { RoleSweep, SweepSample } from '../src/pose/test-sweep.ts';
import { SWEEP_ROLES } from '../src/pose/test-sweep-roles.ts';

/** The text of the usage. */
const USAGE = `Usage: pnpm pair-scan <${Object.keys(SWEEP_ROLES).join(' | ')}> --pairs <set>:<part>:<obstacle>,... [--demo <id>]... [--every <n>] [--at <demo>@<time>]... [--variant <name>=<changes>]...`;

/** A pair of the sweep: a sample set, a moving part, and an obstacle. */
interface ScanPair {
  /** The name of the sample set, such as `play` or `lower`. */
  readonly set: string;
  /** The name of the moving part, such as `upper arms`. */
  readonly part: string;
  /** The name of the obstacle, such as `body`. */
  readonly into: string;
}

/** A sample of `--at`: a demo and a time, the song time in the play or the wall time else. */
interface ScanAt {
  /** The start of the file name of the demo. */
  readonly demo: string;
  /** The time, in seconds. */
  readonly time: number;
}

/** The options of the command. */
interface Options {
  /** The role. */
  readonly role: RoleSweep;
  /** The pairs of `--pairs`. */
  readonly pairs: readonly ScanPair[];
  /** The demos of `--demo`, or none for all demos of the role. */
  readonly demos: readonly string[];
  /** The step of the play samples of `--every`. */
  readonly every: number;
  /** The samples of `--at`, or none for all samples. */
  readonly at: readonly ScanAt[];
  /** The variants of `--variant`: the name and the changes, after the base with no change. */
  readonly variants: readonly (readonly [name: string, changes: string])[];
}

/** The deepest point of a pair over the samples, and the count of the samples over its limit. */
interface PairResult {
  /** The depth, in meters. */
  depth: number;
  /** The demo and the time of the sample of the deepest point. */
  where: string;
  /** The number of the samples. */
  samples: number;
  /** The number of the samples over the limit of the pair. */
  over: number;
}

/** The measures of one variant. */
interface VariantResult {
  /** The result of each pair, by its text `<set>:<part>:<obstacle>`. */
  readonly results: Map<string, PairResult>;
  /** The reached fingerboard and bow hair of the first bowed player, or `null`. */
  readonly reach: string | null;
}

/**
 * Reads the options.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error if an option is not known, a value does not fit, or `--pairs` is missing.
 */
function parseOptions(args: readonly string[]): Options {
  const [name, ...rest] = args;
  const role = Object.entries(SWEEP_ROLES).find(([key]) => key === name)?.[1];
  if (!role) {
    throw new Error(USAGE);
  }
  const pairs: ScanPair[] = [];
  const demos: string[] = [];
  const at: ScanAt[] = [];
  const variants: (readonly [string, string])[] = [['base', '']];
  let every = 1;
  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${rest[i]}" has no value.\n${USAGE}`);
    }
    switch (rest[i]) {
      case '--pairs':
        for (const text of value.split(',')) {
          const [set = '', part = '', into = ''] = text.split(':');
          if (!set || !part || !into) {
            throw new Error(`The pair "${text}" is not <set>:<part>:<obstacle>.`);
          }
          pairs.push({ set, part, into });
        }
        break;
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--every':
        every = Number(value);
        if (!Number.isInteger(every) || every < 1) {
          throw new Error(
            `The option --every takes a whole number of 1 or more, and not "${value}".`,
          );
        }
        break;
      case '--at': {
        const [demo = '', time = ''] = value.split('@');
        if (!demo || !Number.isFinite(Number(time))) {
          throw new Error(`The option --at takes <demo>@<time>, and not "${value}".`);
        }
        at.push({ demo, time: Number(time) });
        break;
      }
      case '--variant': {
        const cut = value.indexOf('=');
        if (cut < 1) {
          throw new Error(`The option --variant takes <name>=<changes>, and not "${value}".`);
        }
        setHolds(value.slice(cut + 1)).undo();
        variants.push([value.slice(0, cut), value.slice(cut + 1)]);
        break;
      }
      default:
        throw new Error(`The option "${rest[i]}" is not known.\n${USAGE}`);
    }
  }
  if (pairs.length === 0) {
    throw new Error(`The option --pairs is missing.\n${USAGE}`);
  }
  return { role, pairs, demos, every, at, variants };
}

/**
 * Gives the samples of a set that the scan sweeps: each n-th play sample and each sample of the
 * other sets, or only the samples of `--at` of the demo.
 *
 * @param options The options.
 * @param demo The file name of the demo.
 * @param set The name of the set.
 * @param samples The samples of the set.
 * @returns The samples.
 */
function scanSamples(
  options: Options,
  demo: string,
  set: string,
  samples: Iterable<SweepSample>,
): SweepSample[] {
  const play = set === 'play';
  const all = [...samples].filter((_, i) => !play || i % options.every === 0);
  if (options.at.length === 0) {
    return all;
  }
  const times = options.at.filter((a) => demo.startsWith(a.demo)).map((a) => a.time);
  return all.filter((s) => times.some((t) => Math.abs((play ? s[0] : s[1]) - t) < 0.01));
}

/**
 * Measures the pairs in the scenes of one variant, applied by the caller.
 *
 * @param options The options.
 * @param scenes The scenes of the demos, built with the changes of the variant.
 * @returns The measures.
 */
function scanVariant(
  options: Options,
  scenes: readonly (readonly [demo: string, scene: TestScene])[],
): VariantResult {
  const results = new Map<string, PairResult>();
  const sets = new Set(options.pairs.map((p) => p.set));
  let reach: string | null = null;
  for (const [demo, scene] of scenes) {
    for (const player of options.role.players(scene)) {
      const index = Number(/^\S+ (\d+)/.exec(player.name)?.[1] ?? -1);
      const note = scene.plan.players[index]?.note;
      if (note?.family === 'bowed' && !reach) {
        const [low, high] = note.rig.stopRange;
        const [from, to] = note.rig.bowRange;
        const mark = bowMark(note.rig);
        reach = `${low.toFixed(2)} to ${high.toFixed(2)}, ${((to - from) / note.rig.hairLength).toFixed(3)}${mark ? ` (${mark})` : ''}`;
      }
      for (const set of options.role.sampleSets(scene)) {
        if (!sets.has(set.name)) {
          continue;
        }
        const samples = scanSamples(options, demo, set.name, set.samples);
        const depths = sweepDepths(
          options.role,
          player,
          samples,
          undefined,
          (pair) => depthLimit(options.role, pair, set.name).depth,
        );
        for (const pair of options.pairs.filter((p) => p.set === set.name)) {
          const found = depths.find((d) => d.part === pair.part && d.into === pair.into);
          if (!found) {
            continue;
          }
          const key = `${pair.set}:${pair.part}:${pair.into}`;
          const old = results.get(key) ?? { depth: 0, where: '', samples: 0, over: 0 };
          old.samples += found.samples ?? 0;
          old.over += found.over ?? 0;
          if (found.depth > old.depth) {
            old.depth = found.depth;
            old.where = `${demo} ${set.name === 'play' ? found.song.toFixed(2) : `w${found.wall.toFixed(2)}`}`;
          }
          results.set(key, old);
        }
      }
    }
  }
  return { results, reach };
}

/**
 * Runs the tool: `node tools/pair-scan.ts <role> --pairs <list> [options]`. It prints one row for
 * the base and one row for each variant: for each pair, the deepest point in cm, the share of the
 * samples over the limit, and the sample of the deepest point.
 */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const demos = await roleDemos(options.demos, [], options.role);
  if (demos.length === 0) {
    throw new Error(`No demo has the ${options.role.role}.`);
  }
  const head = [
    'variant',
    ...options.pairs.map((p) => `${p.set} ${p.part} in ${p.into}`),
    'fingerboard, hair',
  ];
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  const started = performance.now();
  for (const [name, changes] of options.variants) {
    const applied = setHolds(changes);
    try {
      const scenes = demos.map((demo) => [demo.id, sceneOf(demo.bytes)] as const);
      const { results, reach } = scanVariant(options, scenes);
      const cells = options.pairs.map((p) => {
        const r = results.get(`${p.set}:${p.part}:${p.into}`);
        return r
          ? `${(r.depth * 100).toFixed(2)} (${((100 * r.over) / Math.max(1, r.samples)).toFixed(1)}%) ${r.where}`
          : '-';
      });
      console.log(`| ${[name, ...cells, reach ?? '-'].join(' | ')} |`);
    } finally {
      applied.undo();
    }
  }
  const seconds = (performance.now() - started) / 1000;
  console.log(
    `\n${options.variants.length} rows over ${demos.length} demo(s) in ${seconds.toFixed(1)} s. A cell gives the deepest point in cm, the share of the samples over the limit of the pair, and the sample: the demo and the song time, or w and the wall time.`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
