/**
 * Runs a probe on the studio body that the export makes from another GLB file (`--glb <file>`),
 * with no edit of `ANIMALS` and no written module in `src/` (`docs/agents/rigging.md`, "The asset
 * chain"). The pure core keeps no state: the probe runs in a child process on
 * a copy of `src/` that holds the module of the file, as `pnpm body-probe --base` runs the probe of
 * a commit. A species with no studio body also works when it has a rig config
 * `tools/mesh-rigs/<species>.json`: the copy then gives the species the body, and `ANIMALS` of the
 * copy gets a scratch entry ({@link addScratchBody}). Thus the first check of a new mesh probes
 * the real body before the commit of the body.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { SPECIES, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { isStudioBodyName } from '../src/models/studio-body.ts';
import type { StudioBodyName } from '../src/models/studio-body.ts';
import type { StudioBody } from '../src/models/studio-format.ts';
import { trackChild, trackFolder } from './stop-cleanup.ts';
import { ANIMALS, studioBody, studioModule } from './studio-body.ts';
import type { AnimalSettings } from './studio-body.ts';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

/** The paths of the working tree that the copy holds as files. */
const COPIED = ['src', 'package.json'] as const;

/** The folders of the working tree that the copy links: the packages and the demo files. */
const LINKED = ['node_modules', 'demos'] as const;

/** The folder of the configs of the mesh rigs, which `pnpm hold-reach --size` reads. */
const RIG_CONFIGS = join(ROOT, 'tools', 'mesh-rigs');

/** The folder of the Blender scripts, which `pnpm fold-probe --faces` runs. */
const BLENDER_SCRIPTS = join(ROOT, 'tools', 'blender');

/**
 * Tells if the copy of {@link withGlbBody} holds a path of `tools/`: each script, the configs of
 * the mesh rigs, so that `pnpm hold-reach --size --glb <file>` gives the arm factor of the rig, and
 * the Blender scripts, so that `pnpm fold-probe --faces --glb <file>` gives the source middles.
 *
 * @param source The absolute path in `tools/` of the working tree.
 * @returns True for the folder `tools/`, a script, the folder of the rig configs, a config, the
 *   folder of the Blender scripts, or a Blender script.
 */
export function copiedTool(source: string): boolean {
  if (source === join(ROOT, 'tools') || source === RIG_CONFIGS || source === BLENDER_SCRIPTS) {
    return true;
  }
  return (
    source.endsWith('.ts') ||
    (dirname(source) === RIG_CONFIGS && source.endsWith('.json')) ||
    (dirname(source) === BLENDER_SCRIPTS && source.endsWith('.py'))
  );
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
 * Tells if a value of `SpeciesParams.body` names a studio body: a body of the app or a test body.
 *
 * @param body The value.
 * @returns True for a studio body (`isStudioBodyName()`).
 */
function isStudioBody(body: string | undefined): body is StudioBodyName {
  return body !== undefined && isStudioBodyName(body);
}

/**
 * Gives the animal of a studio body: its id in `ANIMALS` and the name of its module in
 * `src/models/studio/`. The body `studio-<animal>` comes from the module `studio/<animal>.ts`.
 *
 * @param body The studio body.
 * @returns The animal, such as `rabbit`.
 */
export function studioAnimal(body: StudioBodyName): string {
  return body.replace(/^studio-/, '');
}

/**
 * Gives the animal of the studio body of a species.
 *
 * @param species The species.
 * @returns The animal, or `null` when the species has no studio body.
 */
export function speciesAnimal(species: SpeciesId): string | null {
  const params: SpeciesParams = SPECIES[species];
  return isStudioBody(params.body) ? studioAnimal(params.body) : null;
}

/**
 * Gives the path of the rig config of an animal.
 *
 * @param animal The animal.
 * @returns The absolute path of `tools/mesh-rigs/<animal>.json`, which can be missing.
 */
export function rigConfigPath(animal: string): string {
  return join(RIG_CONFIGS, `${animal}.json`);
}

/**
 * Gives the animal whose studio body `--glb <file>` swaps for a species: the animal of the studio
 * body of the species, or the species itself when it has no studio body and has a rig config
 * ({@link rigConfigPath}), such as a new mesh before the commit of its body.
 *
 * @param species The species.
 * @returns The animal, or `null` when the species has no studio body and no rig config.
 */
export function glbAnimal(species: SpeciesId): string | null {
  return speciesAnimal(species) ?? (existsSync(rigConfigPath(species)) ? species : null);
}

/**
 * Gives the name of the constant of the module of the studio body of an animal.
 *
 * @param animal The animal, such as `polar-bear`.
 * @returns The name, such as `STUDIO_POLAR_BEAR`.
 */
function studioConstant(animal: string): string {
  return `STUDIO_${animal.toUpperCase().replaceAll('-', '_')}`;
}

/**
 * Gives the scratch settings of an animal with no entry in `ANIMALS`, for the swap and for
 * `rigSettings()` of `pnpm rig-mesh --check`: a seated role that also stands, with its seat on its
 * legs, at the landmark of its standing shoulder joints. The crease angle is 0, because a new body
 * has no measured angle yet. The angle changes only the normals, which no probe reads. In a pose,
 * the GPU skin turns the three normals of a face by different blends, so a new body needs its
 * measured angle before it goes into the scene.
 *
 * @param animal The animal.
 * @param shoulders The height of the standing shoulder joints in the app, in meters.
 * @returns The settings, with no GLB file.
 */
export function scratchSettings(animal: string, shoulders: number): AnimalSettings {
  return {
    landmark: 'shoulders',
    height: shoulders,
    seated: true,
    soloist: true,
    constant: studioConstant(animal),
    crease: 0,
  };
}

/** The field of a rig config that the scratch settings read. */
interface RigLandmark {
  /** The landmark of the scale in the app. */
  readonly app?: {
    /** The height of the standing shoulder joints in the app, in meters. */
    readonly shoulders?: number;
  };
}

/**
 * Reads the height of the standing shoulder joints of the rig config of an animal (`app.shoulders`
 * of `tools/mesh-rigs/<animal>.json`).
 *
 * @param animal The animal.
 * @returns The height, in meters.
 * @throws Error if the file is missing, or if the value is not a positive number.
 */
function rigShoulders(animal: string): number {
  // SAFETY: a rig config holds the fields of `MeshRigConfig` of `tools/rig-mesh.ts`, and the check
  // below reads the one field that the scratch settings need.
  const config = JSON.parse(readFileSync(rigConfigPath(animal), 'utf8')) as RigLandmark;
  const shoulders = config.app?.shoulders;
  if (shoulders === undefined || !Number.isFinite(shoulders) || shoulders <= 0) {
    throw new Error(`app.shoulders of tools/mesh-rigs/${animal}.json is not a positive number.`);
  }
  return shoulders;
}

/**
 * Gives the species with the studio body of an animal.
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
 * Gives the settings of an animal with another GLB file: its entry of `ANIMALS`, or the scratch
 * settings of its rig config ({@link scratchSettings}).
 *
 * @param animal The animal.
 * @param file The absolute path of the GLB file.
 * @returns The settings.
 * @throws Error if `ANIMALS` has no such animal and no rig config of the animal exists.
 */
function glbSettings(animal: string, file: string): AnimalSettings {
  const known = ANIMALS.get(animal);
  if (known) {
    return { ...known, glb: relative(ROOT, file) };
  }
  if (!existsSync(rigConfigPath(animal))) {
    throw new Error(
      `ANIMALS of tools/studio-body.ts has no animal ${animal}, and tools/mesh-rigs/${animal}.json does not exist. The animals are: ${[...ANIMALS.keys()].join(', ')}.`,
    );
  }
  return { ...scratchSettings(animal, rigShoulders(animal)), glb: relative(ROOT, file) };
}

/** The studio body of a GLB file, and the text of its module. */
interface GlbModule {
  /** The body that the export makes from the file. */
  readonly body: StudioBody;
  /** The text of the module, before the formatter of the repository. */
  readonly text: string;
}

/**
 * Makes the studio body of an animal from another GLB file, in memory, as `pnpm studio-body`
 * does.
 *
 * @param animal The animal of `ANIMALS`.
 * @param file The absolute path of the GLB file.
 * @param bytes The bytes of the file.
 * @param settings The settings of the export: by default the entry of the animal in `ANIMALS`
 *   with the file ({@link glbSettings}). A variant of `pnpm rig-mesh --check` gives its own
 *   landmark height, so that it keeps the meters for each unit of the base.
 * @returns The body and the text of its module.
 */
export function glbModule(
  animal: string,
  file: string,
  bytes: Uint8Array,
  settings: AnimalSettings = glbSettings(animal, file),
): GlbModule {
  const { body } = studioBody(bytes, settings.glb ?? '', settings);
  return { body, text: studioModule(animal, settings.constant, body) };
}

/** The line that marks each scratch addition of {@link addScratchBody} in a file of a copy. */
const SCRATCH_MARK = '// A scratch addition of tools/glb-swap.ts for --glb.';

/**
 * Adds the studio body of an animal to the text of `src/models/studio-body.ts`: the import of its
 * module and its entry in `STUDIO_BODIES`.
 *
 * @param text The text of the file.
 * @param animal The animal, such as `panda`.
 * @param constant The name of the constant of the module.
 * @returns The changed text.
 * @throws Error if the text has not exactly one start of `STUDIO_BODIES`.
 */
function withStudioBody(text: string, animal: string, constant: string): string {
  const start = 'export const STUDIO_BODIES = {';
  if (text.split(start).length !== 2) {
    throw new Error(`src/models/studio-body.ts has not exactly one "${start}".`);
  }
  return [
    SCRATCH_MARK,
    `import { ${constant} } from './studio/${animal}.ts';`,
    text.replace(start, `${start}\n  ${JSON.stringify(`studio-${animal}`)}: ${constant},`),
  ].join('\n');
}

/**
 * Gives a species the studio body of an animal in the text of `src/models/species.ts`, as the
 * species of a studio body has it: the body, and the head height and the seat height
 * of the body. The other fields stay. The change goes at the end of the file, after `SPECIES`.
 *
 * @param text The text of the file.
 * @param species The species.
 * @param animal The animal.
 * @param constant The name of the constant of the module.
 * @returns The changed text.
 * @throws Error if the text has no `SPECIES`.
 */
function withSpeciesBody(
  text: string,
  species: SpeciesId,
  animal: string,
  constant: string,
): string {
  if (!text.includes('export const SPECIES = {')) {
    throw new Error('src/models/species.ts has no "export const SPECIES = {".');
  }
  const key = JSON.stringify(species);
  return [
    text,
    SCRATCH_MARK,
    `import { ${constant} as GLB_SWAP_BODY } from './studio/${animal}.ts';`,
    'Object.assign(SPECIES, {',
    `  [${key}]: {`,
    `    ...SPECIES[${key}],`,
    `    body: ${JSON.stringify(`studio-${animal}`)},`,
    '    headHeight: GLB_SWAP_BODY.headHeight,',
    '    seatHeight: (GLB_SWAP_BODY.seatHeight ?? 0) / GLB_SWAP_BODY.headHeight,',
    '  },',
    '});',
    '',
  ].join('\n');
}

/**
 * Adds an entry of `ANIMALS` to the text of `tools/studio-body.ts`, at the end of the file.
 *
 * @param text The text of the file.
 * @param animal The animal.
 * @param settings The settings of the entry, with no palettes.
 * @returns The changed text.
 * @throws Error if the text has no `ANIMALS`.
 */
function withAnimalEntry(text: string, animal: string, settings: AnimalSettings): string {
  if (!text.includes('export const ANIMALS')) {
    throw new Error('tools/studio-body.ts has no "export const ANIMALS".');
  }
  return [
    text,
    SCRATCH_MARK,
    `ANIMALS.set(${JSON.stringify(animal)}, ${JSON.stringify(settings)});`,
    '',
  ].join('\n');
}

/**
 * Adds the scratch entries of an animal with no studio body to a copy ({@link withGlbBody}). An
 * animal with no studio body (`isStudioBodyName()`) gets its entry in `STUDIO_BODIES`, and the
 * species of the same id gets the body ({@link withSpeciesBody}). An animal with no entry in
 * `ANIMALS` gets the settings of the export as its entry in `ANIMALS` of the copy. An animal with
 * a studio body, also a test body, and an entry changes nothing.
 *
 * @param dir The folder of the copy.
 * @param animal The animal.
 * @param settings The settings of the export.
 * @throws Error if the animal has no studio body and is not a species.
 */
async function addScratchBody(
  dir: string,
  animal: string,
  settings: AnimalSettings,
): Promise<void> {
  if (!isStudioBodyName(`studio-${animal}`)) {
    if (!isSpeciesId(animal)) {
      throw new Error(
        `The animal ${animal} has no studio body and is not a species, so no species can take its body.`,
      );
    }
    const bodies = join(dir, 'src', 'models', 'studio-body.ts');
    await writeFile(
      bodies,
      withStudioBody(await readFile(bodies, 'utf8'), animal, settings.constant),
    );
    const species = join(dir, 'src', 'models', 'species.ts');
    await writeFile(
      species,
      withSpeciesBody(await readFile(species, 'utf8'), animal, animal, settings.constant),
    );
  }
  if (!ANIMALS.has(animal)) {
    const tool = join(dir, 'tools', 'studio-body.ts');
    await writeFile(tool, withAnimalEntry(await readFile(tool, 'utf8'), animal, settings));
  }
}

/**
 * Makes a copy of the working tree in which the studio body of an animal comes from another GLB
 * file, runs a work in it, and removes it. The copy holds `src/`, `package.json`, the scripts of
 * `tools/`, and the configs of the mesh rigs ({@link copiedTool}), with links to `node_modules/`
 * and `demos/`. The copy is also an empty git repository, as the probe tree of
 * `withProbeTree()` of `tools/ref-tree.ts` is, so that a git command of a tool works there, such as
 * `probeCacheDir()`. The caches and the times that a tool writes there go away with the folder.
 * Its module of the animal is the export of the file. An animal with no studio body
 * or no entry in `ANIMALS` gets scratch entries in the copy ({@link addScratchBody}). The folder
 * goes away at the end, also after a failure. After a stop (INT or TERM), `tools/stop-cleanup.ts`
 * stops the children of {@link runTool} first, then removes the folder.
 *
 * @param animal The animal of `ANIMALS`, or a species with a rig config.
 * @param file The absolute path of the GLB file.
 * @param work The work, which gets the folder of the copy.
 * @param parent The folder that holds the temporary folder.
 * @param settings The settings of the export ({@link glbModule}).
 * @returns The result of the work.
 * @throws Error if the file does not exist, if the export of the file fails, or if the animal has
 *   no studio body and is not a species.
 */
export async function withGlbBody<T>(
  animal: string,
  file: string,
  work: (dir: string) => Promise<T>,
  parent: string = tmpdir(),
  settings: AnimalSettings = glbSettings(animal, file),
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
    await writeFile(join(dir, 'src', 'models', 'studio', `${animal}.ts`), text);
    await addScratchBody(dir, animal, settings);
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
