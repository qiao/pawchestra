/**
 * Runs a probe on the body that the export makes from another GLB file (`--glb <file>`),
 * with no edit of `ANIMALS` and no written module in `src/` (`docs/agents/rigging.md`, "The asset
 * chain"). The pure core keeps no state: the probe runs in a child process on
 * a copy of `src/` that holds the module of the file, as `pnpm body-probe --base` runs the probe of
 * a commit.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { SPECIES, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { isBodyName } from '../src/models/body.ts';
import type { BodyName } from '../src/models/body.ts';
import type { Body } from '../src/models/body-format.ts';
import { ROOT } from './ref-tree.ts';
import { trackChild, trackFolder } from './stop-cleanup.ts';
import { ANIMALS, glbBody, bodyModule } from './body-module.ts';
import type { AnimalEntry } from './body-module.ts';

/** The paths of the working tree that the copy holds as files. */
const COPIED = ['src', 'package.json'] as const;

/** The folders of the working tree that the copy links: the packages and the demo files. */
const LINKED = ['node_modules', 'demos'] as const;

/** The folder of the Blender scripts, which `pnpm fold-probe --faces` runs. */
const BLENDER_SCRIPTS = join(ROOT, 'tools', 'blender');

/**
 * Tells if the copy of {@link withGlbBody} holds a path of `tools/`: each script, and the Blender
 * scripts.
 *
 * @param source The absolute path in `tools/` of the working tree.
 * @returns True for the folder `tools/`, a script, the folder of the Blender scripts, or a Blender
 *   script.
 */
export function copiedTool(source: string): boolean {
  if (source === join(ROOT, 'tools') || source === BLENDER_SCRIPTS) {
    return true;
  }
  return source.endsWith('.ts') || (dirname(source) === BLENDER_SCRIPTS && source.endsWith('.py'));
}

/** The arguments of a probe with the option `--glb` taken out. */
interface GlbArgs {
  /** The GLB file of `--glb`, as an absolute path, or `null` with no option. */
  readonly glb: string | null;
  /** The other arguments, in their order. */
  readonly rest: readonly string[];
}

/**
 * Takes the option `--glb <file>` out of the arguments of a probe.
 *
 * @param args The arguments.
 * @param cwd The folder that a relative path of the file starts from.
 * @returns The absolute path of the file, or `null`, and the other arguments.
 * @throws Error if the option has no value or comes more than one time.
 */
export function takeGlb(args: readonly string[], cwd: string = process.cwd()): GlbArgs {
  const at = args.indexOf('--glb');
  if (at < 0) {
    return { glb: null, rest: args };
  }

  const file = args[at + 1];
  if (file === undefined || file.startsWith('--')) {
    throw new Error('The option --glb takes a GLB file.');
  }
  const rest = args.filter((_, i) => i !== at && i !== at + 1);
  if (rest.includes('--glb')) {
    throw new Error('The option --glb comes more than one time.');
  }
  return { glb: resolve(cwd, file), rest };
}

/**
 * Tells if a value of `SpeciesParams.body` names a body: a body of the app or a test body.
 *
 * @param body The value.
 * @returns True for a body (`isBodyName()`).
 */
function isBody(body: string | undefined): body is BodyName {
  return body !== undefined && isBodyName(body);
}

/**
 * Gives the animal of the body of a species.
 *
 * @param species The species.
 * @returns The animal, or `null` when the species has no body.
 */
export function speciesAnimal(species: SpeciesId): string | null {
  const params: SpeciesParams = SPECIES[species];
  return isBody(params.body) ? params.body : null;
}

/**
 * Gives the path of the hand rig of an animal (design 4.4, "Hand rig"): the file `<animal>.blend`
 * in the folder of its GLB file, which can be missing.
 *
 * @param animal The animal.
 * @param glb The GLB file of the animal, from the repository root.
 * @returns The path of the `.blend` file from the repository root.
 */
export function handRigPath(animal: string, glb: string): string {
  return join(dirname(glb), `${animal}.blend`);
}

/**
 * Finds the hand rig of an animal ({@link handRigPath}). Each value of a hand rig lives only in
 * that file, and a tool reads it from the export, never from the rig config.
 *
 * @param animal The animal.
 * @param glb The GLB file of the animal, from the repository root.
 * @returns The path of the `.blend` file from the repository root, or `null` with no hand rig.
 */
export function handRigOf(animal: string, glb: string): string | null {
  const blend = handRigPath(animal, glb);
  return existsSync(join(ROOT, blend)) ? blend : null;
}

/**
 * Finds the hand rig of an animal of `ANIMALS` ({@link handRigOf} with its GLB file).
 *
 * @param animal The animal.
 * @returns The path of the `.blend` file from the repository root, or `null` for an animal with
 *   no hand rig or with no settings in `ANIMALS`.
 */
export function animalHandRig(animal: string): string | null {
  const glb = ANIMALS.get(animal)?.glb;
  return glb === undefined ? null : handRigOf(animal, glb);
}

/**
 * Gives the export summary of the hand rig of an animal of `ANIMALS`: `<file>.json` beside its GLB
 * file `<file>.glb` (`summary()` of `tools/blender/export_rig.py`).
 *
 * @param animal The animal.
 * @returns The absolute path of the summary, or `null` for an animal with no hand rig.
 */
export function handRigSummaryPath(animal: string): string | null {
  const glb = ANIMALS.get(animal)?.glb;
  return glb === undefined || handRigOf(animal, glb) === null
    ? null
    : join(ROOT, glb.replace(/\.glb$/, '.json'));
}

/**
 * Gives the species with the body of an animal.
 *
 * @param animal The animal.
 * @returns The species, in the order of `SPECIES`.
 */
export function animalSpecies(animal: string): SpeciesId[] {
  return Object.keys(SPECIES).filter(
    (id): id is SpeciesId => isSpeciesId(id) && speciesAnimal(id) === animal,
  );
}

/**
 * Gives the settings of an animal with another GLB file: its entry of `ANIMALS` with the file.
 *
 * @param animal The animal.
 * @param file The absolute path of the GLB file.
 * @returns The settings.
 * @throws Error if `ANIMALS` has no such animal.
 */
function glbSettings(animal: string, file: string): AnimalEntry {
  const known = ANIMALS.get(animal);
  if (!known) {
    throw new Error(
      `ANIMALS of tools/body-module.ts has no animal ${animal}. The animals are: ${[...ANIMALS.keys()].join(', ')}.`,
    );
  }
  return { ...known, glb: relative(ROOT, file) };
}

/** The body of a GLB file, and the text of its module. */
interface GlbModule {
  /** The body that the export makes from the file. */
  readonly body: Body;
  /** The text of the module, before the formatter of the repository. */
  readonly text: string;
}

/**
 * Makes the body of an animal from another GLB file, in memory, as `pnpm body-module`
 * does.
 *
 * @param animal The animal of `ANIMALS`.
 * @param file The absolute path of the GLB file.
 * @param bytes The bytes of the file.
 * @param settings The settings of the export: by default the entry of the animal in `ANIMALS`
 *   with the file ({@link glbSettings}).
 * @returns The body and the text of its module.
 */
export function glbModule(
  animal: string,
  file: string,
  bytes: Uint8Array,
  settings: AnimalEntry = glbSettings(animal, file),
): GlbModule {
  const { body } = glbBody(bytes, settings.glb ?? '', settings);
  return { body, text: bodyModule(animal, settings.constant, body) };
}

/**
 * Makes a copy of the working tree in which the body of an animal comes from another GLB
 * file, runs a work in it, and removes it. The copy holds `src/`, `package.json`, and the scripts
 * of `tools/` ({@link copiedTool}), with links to `node_modules/`
 * and `demos/`. The copy is also an empty git repository, as the probe tree of
 * `withProbeTree()` of `tools/ref-tree.ts` is, so that a git command of a tool works there, such as
 * `probeCacheDir()`. The caches and the times that a tool writes there go away with the folder.
 * Its module of the animal is the export of the file. The folder goes away at the end, also after a failure. After a stop (INT or TERM), `tools/stop-cleanup.ts`
 * stops the children of {@link runTool} first, then removes the folder.
 *
 * @param animal The animal of `ANIMALS`.
 * @param file The absolute path of the GLB file.
 * @param work The work, which gets the folder of the copy.
 * @param parent The folder that holds the temporary folder.
 * @param settings The settings of the export ({@link glbModule}).
 * @returns The result of the work.
 * @throws Error if the file does not exist, if the export of the file fails, or if `ANIMALS` has
 *   no such animal.
 */
export async function withGlbBody<T>(
  animal: string,
  file: string,
  work: (dir: string) => Promise<T>,
  parent: string = tmpdir(),
  settings: AnimalEntry = glbSettings(animal, file),
): Promise<T> {
  const { text } = glbModule(animal, file, new Uint8Array(await readFile(file)), settings);
  const dir = mkdtempSync(join(parent, 'glb-swap-'));
  const release = trackFolder(dir);
  try {
    for (const path of COPIED) {
      cpSync(join(ROOT, path), join(dir, path), { recursive: true });
    }
    cpSync(join(ROOT, 'tools'), join(dir, 'tools'), { recursive: true, filter: copiedTool });
    for (const path of LINKED) {
      symlinkSync(join(ROOT, path), join(dir, path), 'dir');
    }
    execFileSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' });
    await writeFile(join(dir, 'src', 'models', 'bodies', `${animal}.ts`), text);
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
    release();
  }
}

/**
 * Runs a script of `tools/` of a copy in a child process, with the output of the caller and the
 * folder of the caller, so that the relative paths of its arguments stay true.
 *
 * @param dir The folder of the copy ({@link withGlbBody}).
 * @param script The script, such as `hold-reach.ts`.
 * @param args The arguments of the script.
 * @param env The environment of the child, by default the environment of the caller. A probe
 *   with a cache by tree gives `PROBE_NO_CACHE=1` (`tools/ref-tree.ts`), because the empty git
 *   repository of the copy has no index to key on.
 * @returns The exit code of the child.
 */
export function runTool(
  dir: string,
  script: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((done, fail) => {
    const child = trackChild(
      spawn(process.execPath, [join(dir, 'tools', script), ...args], { stdio: 'inherit', env }),
    );
    child.on('error', fail);
    child.on('close', (code) => done(code ?? 1));
  });
}
