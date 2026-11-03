/**
 * Measures the options of the size, the arms, and the legs of a new source mesh (step "Options" of
 * `docs/agents/rigging.md`, "The asset chain"), and draws them in one labeled image:
 * `node tools/mesh-options.ts <animal> <dir> --size <label>=<head top>... [--legs <f>,...]
 * [--arms <f>,...] [--instrument <id>] [--species <id>]`.
 *
 * Each size is the height of the standing head top in meters: the top of the skull, with no ear
 * ({@link HEAD_STRIP}). Each size goes with each leg factor, with the arm factor 1. Each arm factor
 * goes with the last size and the last leg factor. Each variant is a rig of
 * `tools/blender/rig_mesh.py`, as `pnpm rig-mesh <animal> --check --set` makes it, with the
 * measures of `measureRig()` of `tools/rig-mesh-check.ts`. The tool calls these functions in place
 * of the command, so that it keeps the GLB file of each rig for `pnpm hold-reach --glb`. With
 * `--instrument`, each row also gives the reach of the hold on the real body
 * (`tools/glb-swap.ts`): the slide reach of a trombone, the spare reach of each palm to its grip on
 * another wind instrument, the scale of the rule of a violin shop, or the share of the strikes of
 * a percussion instrument within 5 mm with the worst error.
 *
 * The tool writes into `<dir>`: `options.md` with the table of the measures and the warnings of
 * the rigs (`warningLines()`), `options.png` with the image, and `rigs/` with the config, the GLB
 * file, the long-armed source, the preview images, and the log of Blender of each variant. The
 * scale of a variant GLB file is the value of the column "Shoulder joints m" (`app.shoulders`).
 * It writes no file of the repository. Blender comes from the environment variable `BLENDER`, or
 * `blender` on the path, and the image from Python with Pillow (`uv run`).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { Vector3 } from 'three';

import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { SPECIES_IDS, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { glbAnimal, rigConfigPath, runTool, scratchSettings, withGlbBody } from './glb-swap.ts';
import {
  REACH_INSTRUMENTS,
  armLength,
  holdReach,
  isWind,
  ruleSize,
  slideReach,
  windReach,
} from './hold-reach.ts';
import type { ReachInstrument } from './hold-reach.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import { isPercussion, strikeCell, strikeReach } from './strike-reach.ts';
import {
  blenderArgs,
  jointHead,
  legRise,
  parseConfig,
  RIG_WARNING,
  rigWarnings,
  shoulderHeight,
} from './rig-mesh.ts';
import type { MeshRigConfig } from './rig-mesh.ts';
import { measureRig, noseWarning } from './rig-mesh-check.ts';
import type { ThinRule } from './rig-mesh-check.ts';
import { trackChild } from './stop-cleanup.ts';
import { ANIMALS, readAccessor, readGlb, worldMatrices } from './studio-body.ts';
import type { AnimalSettings } from './studio-body.ts';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

/** The Python script that draws the image of the options. */
const PLOT_SCRIPT = join(ROOT, 'tools', 'mesh_options.py');

/**
 * The half width of the middle strip of the head in which the skull top lies, in the units of the
 * studio. The ears of the source meshes stand beside the skull, outside the strip, so the
 * head top of a size leaves the ears out, as the head top of the parametric bodies does.
 */
export const HEAD_STRIP = 0.03;

/** The pixels for each meter of the rows of the image that have one scale. */
export const IMAGE_SCALE = 260;

/**
 * The rule of the thin faces of a config with no `check.thin`: it lists no face, because the tool
 * reads no thin face.
 */
const NO_THIN: ThinRule = { angle: 0, length: Infinity, near: 0 };

/** The bones of the instruments, whose faces the image of the body of the working tree leaves out. */
const INSTRUMENT_BONES: readonly BoneName[] = [
  'instrument',
  'slide',
  'bow',
  'malletL',
  'malletR',
  'baton',
];

/** One size of the options: a label and the height of the standing head top. */
export interface SizeOption {
  /** The label in the table and in the image, such as `fox`. */
  readonly label: string;
  /** The height of the standing head top (the skull top, with no ear), in meters. */
  readonly top: number;
}

/** The options of `pnpm mesh-options`. */
export interface OptionsArgs {
  /** The animal of the rig config `tools/mesh-rigs/<animal>.json`. */
  readonly animal: string;
  /** The folder of the output, as an absolute path. */
  readonly dir: string;
  /** The sizes, in their order. */
  readonly sizes: readonly SizeOption[];
  /** The leg factors, in their order. */
  readonly legs: readonly number[];
  /** The arm factors other than 1, at the last size and the last leg factor. */
  readonly arms: readonly number[];
  /** The instrument of the reach of the hold, or `null` for no reach. */
  readonly instrument: ReachInstrument | null;
  /** The species of the first row and of the reach of the hold. */
  readonly species: SpeciesId;
}

/** The usage text of `pnpm mesh-options`. */
const USAGE =
  'Usage: pnpm mesh-options <animal> <dir> --size <label>=<head top m>... [--legs <f>,...] [--arms <f>,...] [--instrument <id>] [--species <id>]';

/**
 * Reads a list of positive numbers, separated by commas.
 *
 * @param flag The option, for the message.
 * @param text The text.
 * @returns The numbers.
 * @throws Error if a part is not a positive number.
 */
function positiveList(flag: string, text: string): number[] {
  return text.split(',').map((part) => {
    const value = Number(part);
    if (part.trim() === '' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${flag} takes positive numbers separated by commas, not "${text}".`);
    }
    return value;
  });
}

/**
 * Reads the arguments of `pnpm mesh-options`.
 *
 * @param args The arguments.
 * @param cwd The folder that a relative output folder starts from.
 * @returns The options. The leg factor is the factor of the config with no `--legs`, and the
 *   species is the animal with no `--species`.
 * @throws Error if the animal has no rig config, if no size is given, if an option is not known or
 *   has no value, or if a value does not fit.
 */
export function parseOptionsArgs(
  args: readonly string[],
  cwd: string = process.cwd(),
): OptionsArgs {
  const [animal = '', dir = '', ...rest] = args;
  if (animal === '' || dir === '' || animal.startsWith('--') || dir.startsWith('--')) {
    throw new Error(USAGE);
  }
  if (!existsSync(rigConfigPath(animal))) {
    throw new Error(`tools/mesh-rigs/${animal}.json does not exist.`);
  }
  const sizes: SizeOption[] = [];
  let legs: number[] = [parseConfig(readFileSync(rigConfigPath(animal), 'utf8')).legFactor ?? 1];
  let arms: number[] = [];
  let instrument: ReachInstrument | null = null;
  let species: string = animal;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i] ?? '';
    const value = rest[i + 1];
    if (value === undefined) {
      throw new Error(`The option "${flag}" has no value.\n${USAGE}`);
    }
    switch (flag) {
      case '--size': {
        const equals = value.indexOf('=');
        const top = Number(value.slice(equals + 1));
        if (equals < 1 || !Number.isFinite(top) || top <= 0) {
          throw new Error(`--size takes <label>=<head top in meters>, not "${value}".`);
        }
        sizes.push({ label: value.slice(0, equals), top });
        break;
      }
      case '--legs':
        legs = positiveList(flag, value);
        break;
      case '--arms':
        arms = positiveList(flag, value).filter((factor) => factor !== 1);
        break;
      case '--instrument': {
        const known = REACH_INSTRUMENTS.find((id) => id === value);
        if (known === undefined) {
          throw new Error(`--instrument takes one of: ${REACH_INSTRUMENTS.join(', ')}.`);
        }
        instrument = known;
        break;
      }
      case '--species':
        species = value;
        break;
      default:
        throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  if (sizes.length === 0) {
    throw new Error(`Give at least one --size.\n${USAGE}`);
  }
  if (!isSpeciesId(species)) {
    throw new Error(
      `The species ${species} is not known. Give --species with one of: ${SPECIES_IDS.join(', ')}.`,
    );
  }
  return { animal, dir: resolve(cwd, dir), sizes, legs, arms, instrument, species };
}

/** One variant of the options: a size, a leg factor, and an arm factor. */
export interface OptionVariant {
  /** The name of the variant in the files, such as `fox-legs1.5-arms1.497`. */
  readonly name: string;
  /** The size. */
  readonly size: SizeOption;
  /** The leg factor. */
  readonly leg: number;
  /** The arm factor. */
  readonly arm: number;
}

/**
 * Gives the variants of the options: each size with each leg factor and the arm factor 1, the
 * leg factors in the outer loop, then each arm factor with the last size and the last leg factor.
 *
 * @param args The options.
 * @returns The variants, in the order of the rows of the table.
 */
export function optionVariants(args: OptionsArgs): OptionVariant[] {
  const variant = (size: SizeOption, leg: number, arm: number): OptionVariant => ({
    name: `${size.label}-legs${leg}-arms${arm}`,
    size,
    leg,
    arm,
  });
  const lastSize = args.sizes.at(-1);
  const lastLeg = args.legs.at(-1) ?? 1;
  return [
    ...args.legs.flatMap((leg) => args.sizes.map((size) => variant(size, leg, 1))),
    ...(lastSize ? args.arms.map((arm) => variant(lastSize, lastLeg, arm)) : []),
  ];
}

/** The heights of the source mesh of a rig, in the units of the studio. */
export interface SourceTops {
  /** The skull top: the highest vertex in the middle strip of {@link HEAD_STRIP}. */
  readonly skull: number;
  /** The highest vertex, which the units put at 1. */
  readonly top: number;
}

/**
 * Measures the heights of a point cloud in the units of the studio: the skull top in the middle
 * strip of {@link HEAD_STRIP}, and the highest point.
 *
 * @param points The points, in the units and the axes of the studio.
 * @returns The heights.
 * @throws Error if no point lies in the middle strip.
 */
export function topsOf(points: readonly (readonly number[])[]): SourceTops {
  let skull = -Infinity;
  let top = -Infinity;
  for (const [x = 0, y = 0] of points) {
    top = Math.max(top, y);
    if (Math.abs(x) < HEAD_STRIP) {
      skull = Math.max(skull, y);
    }
  }
  if (!Number.isFinite(skull)) {
    throw new Error(`No vertex lies within ${HEAD_STRIP} units of the middle plane.`);
  }
  return { skull, top };
}

/**
 * Measures the heights of the source GLB file of a rig in the units of the studio, as
 * `load_source()` of `tools/blender/rig_mesh.py` reads it: the vertices of each mesh in world
 * space, with the soles at 0 and the highest vertex at 1. The scale of a variant takes the skull
 * top of the source plus the rise of the legs ({@link sizeShoulders}). A head factor, a neck
 * factor, or a trunk factor of the config also moves the skull top, so the table gives the head
 * top that each rig measures.
 *
 * @param bytes The source GLB file.
 * @returns The heights.
 */
export function sourceTops(bytes: Uint8Array): SourceTops {
  const glb = readGlb(bytes);
  const worlds = worldMatrices(glb.json, new Map());
  const points: Vector3[] = [];
  for (const [i, node] of glb.json.nodes.entries()) {
    const world = worlds[i];
    const mesh = node.mesh === undefined ? undefined : glb.json.meshes[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const at = primitive.attributes['POSITION'];
      const xyz = at === undefined ? new Float64Array() : readAccessor(glb, at);
      for (let k = 0; k + 2 < xyz.length; k += 3) {
        const p = new Vector3(xyz[k], xyz[k + 1], xyz[k + 2]);
        points.push(world ? p.applyMatrix4(world) : p);
      }
    }
  }
  const floor = Math.min(...points.map((p) => p.y));
  const scale = 1 / (Math.max(...points.map((p) => p.y)) - floor);
  return topsOf(points.map((p) => [p.x * scale, (p.y - floor) * scale]));
}

/**
 * Gives the height of the standing shoulder joints that puts the head top of a variant at its
 * size: the scale is the size over the skull top of the variant, which rises with the legs.
 *
 * @param config The config of the variant, with its leg factor.
 * @param skull The skull top of the source, in the units of the studio ({@link sourceTops}).
 * @param top The height of the head top in the app, in meters.
 * @returns The height of the shoulder joints, in meters (`app.shoulders`).
 */
export function sizeShoulders(config: MeshRigConfig, skull: number, top: number): number {
  return (top / (skull + legRise(config))) * shoulderHeight(config);
}

/** The fields of a rig config that a variant sets. */
interface VariantFields {
  /** The leg factor. */
  legFactor?: number;
  /** The arm factor. */
  armFactor: number;
  /** The landmark of the scale and the target of the reach. */
  app: MeshRigConfig['app'];
}

/**
 * Gives the JSON text of the config of a variant: the leg factor, the arm factor, and the height of
 * the shoulder joints, with the other fields of the config.
 *
 * @param text The JSON text of the config.
 * @param variant The variant.
 * @param skull The skull top of the source, in the units of the studio.
 * @returns The JSON text.
 */
export function variantConfig(text: string, variant: OptionVariant, skull: number): string {
  // SAFETY: a rig config holds one JSON object, and parseConfig() checks the fields below.
  const json = JSON.parse(text) as VariantFields;
  json.legFactor = variant.leg;
  json.armFactor = variant.arm;
  const shoulders = sizeShoulders(parseConfig(JSON.stringify(json)), skull, variant.size.top);
  json.app = { ...json.app, shoulders };
  return `${JSON.stringify(json, null, 2)}\n`;
}

/**
 * Gives the length of the trunk of a config from the hips joint to the middle of the shoulder
 * joints, in the units of the studio, after the drop of the trunk and the move of the girth.
 *
 * @param config The config.
 * @returns The length.
 */
export function trunkUnits(config: MeshRigConfig): number {
  const hips = jointHead(config, 'hips');
  const shoulder = jointHead(config, 'upper_arm_L');
  const rise = shoulderHeight(config) - legRise(config) - shoulder[1];
  return Math.hypot(shoulder[1] + rise - hips[1], shoulder[2] - hips[2]);
}

/** The measures of one row of the table of the options. */
export interface OptionMeasures {
  /** The height of the standing head top (the skull top), in meters. */
  readonly headTop: number;
  /** The height of the highest point of the standing body, in meters. */
  readonly top: number;
  /** The height of the standing shoulder joints, in meters. */
  readonly shoulders: number;
  /** The meters for each unit, or `null` for the body of the working tree. */
  readonly scale: number | null;
  /** The head height H, in meters. */
  readonly headHeight: number;
  /** The seat that fits the legs, in meters. */
  readonly seat: number | null;
  /** The depth of the chair, in meters, or `null` when the body has none. */
  readonly chair: number | null;
  /** The reach of the left arm from the shoulder joint to the middle of the palm, in meters. */
  readonly reach: number;
  /**
   * The reach over the trunk from the hips joint to the middle of the shoulder joints of the rig
   * config ({@link trunkUnits}), or `null` for the body of the working tree, whose joints have
   * other places.
   */
  readonly armTrunk: number | null;
  /** The text of the reach of the hold ({@link reachCell}), or `null` with no instrument. */
  readonly hold: string | null;
}

/**
 * Writes the reach of the hold of a species for the table: the slide reach of a trombone, the
 * spare reach of each palm to its grip in the playing pose on another wind instrument (negative
 * for a miss), the scale of the rule of a violin shop, or the share of the strikes of a
 * percussion instrument within 5 mm with the worst error (`tools/strike-reach.ts`). The player
 * sits on a chair, and a percussion player stands as in the demos.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param demos The demos of a percussion instrument, or none for another instrument.
 * @returns The text, such as `slide 0.155 m`.
 */
export function reachCell(
  species: SpeciesId,
  instrument: ReachInstrument,
  demos: readonly DemoFile[] = [],
): string {
  if (isPercussion(instrument)) {
    return strikeCell(strikeReach(species, instrument, demos));
  }
  if (!isWind(instrument)) {
    const rule = ruleSize(holdReach(species, instrument, 'chair'));
    return rule ? `rule scale ${rule.scale.toFixed(3)}` : 'no rule scale';
  }
  const slide = slideReach(species, instrument, 'chair');
  if (slide) {
    return `slide ${slide.reach.toFixed(3)} m`;
  }
  const grips = windReach(species, instrument, 'chair');
  const spare = (side: 'L' | 'R'): string => (grips[side].arm - grips[side].play).toFixed(3);
  return `spare L ${spare('L')} m, R ${spare('R')} m`;
}

/** The faces of a body for the image: the corners in meters and their linear colors. */
export interface BodyFaces {
  /** x, y, z of each corner, three corners for each triangle. */
  readonly positions: readonly number[];
  /** Linear r, g, b of each corner. */
  readonly colors: readonly number[];
}

/**
 * Gives the faces of the body of a player, with no face of the instrument.
 *
 * @param model The player.
 * @returns The faces, rounded to 0.1 mm and to 1/1000 of a color.
 */
export function bodyFaces(model: PlayerModel): BodyFaces {
  const skip = new Set(INSTRUMENT_BONES.map((bone) => boneIndex(bone)));
  const positions: number[] = [];
  const colors: number[] = [];
  const { mesh } = model;
  for (let c = 0; c + 2 < mesh.bones.length; c += 3) {
    if (skip.has(mesh.bones[c] ?? -1)) {
      continue;
    }
    for (let k = c; k < c + 3; k++) {
      for (let a = 0; a < 3; a++) {
        positions.push(Math.round((mesh.positions[k * 3 + a] ?? 0) * 1e4) / 1e4);
        colors.push(Math.round((mesh.colors[k * 3 + a] ?? 0) * 1e3) / 1e3);
      }
    }
  }
  return { positions, colors };
}

/** The body of a species in the working tree: its measures and its standing player. */
export interface WorkingBody {
  /** The measures, with no scale and no chair depth. */
  readonly measures: OptionMeasures;
  /** The standing player, for the image. */
  readonly model: PlayerModel;
}

/**
 * Measures the body of a species in the working tree: the standing head top, the highest corner of
 * the body, the standing shoulder joints, H, the seat on a chair, and the reach of the left arm.
 * The head top is the highest corner of the head bone in the middle strip of {@link HEAD_STRIP}
 * times the highest corner, so that the ears of a studio body on the head bone stay out, as for a
 * rig.
 *
 * @param species The species.
 * @param instrument The instrument of the reach of the hold, or `null`.
 * @param demos The demos of a percussion instrument, or none for another instrument.
 * @returns The measures, and the standing player.
 */
export function workingBody(
  species: SpeciesId,
  instrument: ReachInstrument | null,
  demos: readonly DemoFile[] = [],
): WorkingBody {
  const held = instrument ?? 'violin';
  const standing = buildPlayer(species, held, 4, 'stand');
  const seated = buildPlayer(species, held, 4, 'chair');
  const head = boneIndex('head');
  const skip = new Set(INSTRUMENT_BONES.map((bone) => boneIndex(bone)));
  const { mesh, skeleton } = standing;
  let top = -Infinity;
  for (let c = 0; c < mesh.bones.length; c++) {
    if (!skip.has(mesh.bones[c] ?? -1)) {
      top = Math.max(top, mesh.positions[c * 3 + 1] ?? 0);
    }
  }
  let headTop = -Infinity;
  for (let c = 0; c < mesh.bones.length; c++) {
    if (mesh.bones[c] === head && Math.abs(mesh.positions[c * 3] ?? 0) < HEAD_STRIP * top) {
      headTop = Math.max(headTop, mesh.positions[c * 3 + 1] ?? 0);
    }
  }
  const at = (bone: BoneName): Vector3 =>
    new Vector3(...(skeleton.positions[boneIndex(bone)] ?? [0, 0, 0]));
  const reach = armLength(standing, 'L');
  return {
    measures: {
      headTop,
      top,
      shoulders: at('upperArmL').y,
      scale: null,
      headHeight: standing.body.headHeight,
      seat: seated.seat?.seatHeight ?? null,
      chair: null,
      reach,
      armTrunk: null,
      hold: instrument ? reachCell(species, instrument, demos) : null,
    },
    model: standing,
  };
}

/**
 * Runs the rig script of Blender, with its log in a file. A stop signal (INT or TERM) stops
 * Blender first (`tools/stop-cleanup.ts`).
 *
 * @param args The arguments of `blender` (`blenderArgs()` of `tools/rig-mesh.ts`).
 * @param log The path of the log file.
 * @returns A promise of the text of the log.
 * @throws Error if Blender fails.
 */
function runBlender(args: readonly string[], log: string): Promise<string> {
  const blender = process.env['BLENDER'] ?? 'blender';
  return new Promise((done, fail) => {
    const child = trackChild(
      spawn(blender, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (text: string) => {
      out += text;
    });
    child.stderr?.on('data', (text: string) => {
      out += text;
    });
    child.on('error', fail);
    child.on('close', (code) => {
      void writeFile(log, out).then(() => {
        if (code === 0) {
          done(out);
        } else {
          fail(new Error(`${blender} failed with the status ${String(code)}. The log: ${log}`));
        }
      }, fail);
    });
  });
}

/** One rigged variant: its measures and the files of its rig. */
export interface RiggedVariant {
  /** The variant. */
  readonly variant: OptionVariant;
  /** The measures. */
  readonly measures: OptionMeasures;
  /** The folder of the preview images of the rig. */
  readonly preview: string;
  /** The highest point of the standing source, in the units of the studio. */
  readonly tall: number;
  /** The warning lines of the log of the rig (`rigWarnings()` of `tools/rig-mesh.ts`) and of the nose. */
  readonly warnings: readonly string[];
}

/**
 * Rigs one variant with Blender into `<dir>/rigs/`, and measures it.
 *
 * @param args The options.
 * @param text The JSON text of the config of the variant ({@link variantConfig}).
 * @param variant The variant.
 * @returns The rigged variant.
 * @throws Error if the rig or the probe of the reach fails.
 */
async function rigVariant(
  args: OptionsArgs,
  text: string,
  variant: OptionVariant,
): Promise<RiggedVariant> {
  const rigs = join(args.dir, 'rigs');
  const base = join(rigs, variant.name);
  const configFile = `${base}.json`;
  const glb = `${base}.rig.glb`;
  const obj = `${base}.obj`;
  const preview = `${base}-preview`;
  await writeFile(configFile, text);
  const log = await runBlender(blenderArgs(configFile, glb, preview, obj), `${base}.log`);

  const config = parseConfig(text);
  const known = ANIMALS.get(args.animal);
  const settings: AnimalSettings = {
    ...(known ?? scratchSettings(args.animal, config.app.shoulders)),
    landmark: 'shoulders',
    height: config.app.shoulders,
    glb: relative(ROOT, glb),
  };
  const objText = await readFile(obj, 'utf8');
  const measures = measureRig(
    new Uint8Array(await readFile(glb)),
    config.output,
    settings,
    objText,
    config.check?.thin ?? NO_THIN,
  );
  const points = objText
    .split('\n')
    .filter((line) => line.startsWith('v '))
    .map((line) => line.split(' ').slice(1).map(Number));
  const tops = topsOf(points);
  const scale = measures.body.scale;
  const reach = measures.arms.L ?? 0;
  const nose = noseWarning(measures.body);

  let hold: string | null = null;
  const { instrument } = args;
  if (instrument) {
    const out = `${base}-reach.json`;
    const code = await withGlbBody(
      args.animal,
      glb,
      (copy) => runTool(copy, 'mesh-options.ts', ['--reach', args.species, instrument, out]),
      tmpdir(),
      settings,
    );
    if (code !== 0) {
      throw new Error(`The reach of the hold failed with the status ${code}.`);
    }
    // SAFETY: the child of --reach writes one JSON string.
    hold = JSON.parse(await readFile(out, 'utf8')) as string;
  }
  return {
    variant,
    measures: {
      headTop: tops.skull * scale,
      top: tops.top * scale,
      shoulders: config.app.shoulders,
      scale,
      headHeight: measures.body.headHeight,
      seat: measures.legSeat,
      chair: measures.body.chairDepth,
      reach,
      armTrunk: reach / (trunkUnits(config) * scale),
      hold,
    },
    preview,
    tall: tops.top,
    warnings: nose ? [...rigWarnings(log), `${RIG_WARNING} ${nose}`] : rigWarnings(log),
  };
}

/**
 * Writes the table of the options: one row for the body of the species in the working tree, then
 * one row for each variant.
 *
 * @param species The species of the first row.
 * @param working The measures of the body of the working tree.
 * @param rows The rigged variants.
 * @returns The lines of the Markdown table.
 */
export function optionsTable(
  species: SpeciesId,
  working: OptionMeasures,
  rows: readonly RiggedVariant[],
): string[] {
  const hold = working.hold !== null;
  const header = [
    'Variant',
    'Size',
    'Legs',
    'Arms',
    'Head top m',
    'Top m',
    'Shoulder joints m',
    'Scale m/u',
    'H m',
    'Seat m',
    'Chair m',
    'Reach m',
    'Arm/trunk',
    ...(hold ? ['Hold reach'] : []),
  ];
  const m = (value: number | null, digits = 3): string =>
    value === null ? '-' : value.toFixed(digits);
  const cells = (measures: OptionMeasures): string[] => [
    m(measures.headTop),
    m(measures.top),
    m(measures.shoulders, 6),
    m(measures.scale, 6),
    m(measures.headHeight),
    m(measures.seat),
    m(measures.chair),
    m(measures.reach),
    m(measures.armTrunk, 2),
    ...(hold ? [measures.hold ?? '-'] : []),
  ];
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    `| ${species} of the working tree | - | - | - | ${cells(working).join(' | ')} |`,
    ...rows.map(
      ({ variant, measures }) =>
        `| ${variant.name} | ${variant.size.label} (${variant.size.top} m) | ${variant.leg} | ${variant.arm} | ${cells(measures).join(' | ')} |`,
    ),
  ];
}

/**
 * Writes the warnings of the rigs of the variants for `options.md`: the seat that the thighs set
 * and the eye box in a dark patch (`tools/blender/rig_mesh.py`), and the tip of the nose off the
 * middle plane (`noseWarning()` of `tools/rig-mesh-check.ts`).
 *
 * @param rows The rigged variants.
 * @returns The lines: a heading and one item for each warning, or none with no warning.
 */
export function warningLines(rows: readonly RiggedVariant[]): string[] {
  const items = rows.flatMap(({ variant, warnings }) =>
    warnings.map((warning) => `- ${variant.name}: ${warning.slice(RIG_WARNING.length).trim()}`),
  );
  return items.length > 0 ? ['## Warnings of the rigs', '', ...items, ''] : [];
}

/** One cell of the image: a preview tile or the body of the working tree, with its labels. */
interface PlotCell {
  /** The preview sheet of Blender, or `null` for the faces of the body of the working tree. */
  readonly image: string | null;
  /** The index of the tile in the sheet: 0 is the front of `standing.png`, the right of `knees.png`. */
  readonly tile: number;
  /** The pixels for each meter of the tile, or `null` to keep the tile as it is. */
  readonly pxPerMeter: number | null;
  /** The pixel row of the floor in the tile, for a cell at one scale. */
  readonly floorRow: number | null;
  /** The lines of the label. */
  readonly labels: readonly string[];
}

/** One row of the image: a title and its cells. */
interface PlotRow {
  /** The title above the row. */
  readonly title: string;
  /** The cells, from the left. */
  readonly cells: readonly PlotCell[];
}

/** The plan of the image for `tools/mesh_options.py`. */
interface PlotPlan {
  /** The path of the image. */
  readonly out: string;
  /** The pixels for each meter of the rows with one scale. */
  readonly scale: number;
  /** The faces of the body of the working tree. */
  readonly body: BodyFaces;
  /** The rows, from the top. */
  readonly rows: readonly PlotRow[];
}

/** The size of one tile of a preview of `tools/blender/rig_mesh.py`, in pixels. */
const VIEW = 500;

/**
 * Gives the plan of the image: a row of the sizes, a row of the arm factors, and a row of the
 * knees of each leg factor from the side. A tile of a standing body of `rig_mesh.py` has the
 * height 1.1 × its highest point, with the middle at half of that point, so its floor row and its
 * pixels for each meter follow from the highest point and the scale.
 *
 * @param args The options.
 * @param working The measures of the body of the working tree.
 * @param body The faces of the body of the working tree.
 * @param rows The rigged variants.
 * @returns The plan.
 */
function plotPlan(
  args: OptionsArgs,
  working: OptionMeasures,
  body: BodyFaces,
  rows: readonly RiggedVariant[],
): PlotPlan {
  const m = (value: number | null): string => (value === null ? '-' : `${value.toFixed(3)} m`);
  const standing = (row: RiggedVariant, labels: readonly string[]): PlotCell => ({
    image: join(row.preview, 'standing.png'),
    tile: 0,
    pxPerMeter: VIEW / (1.1 * row.tall * (row.measures.scale ?? 1)),
    floorRow: VIEW / 2 + (0.5 * VIEW) / 1.1,
    labels,
  });
  const sizes = rows.filter((row) => row.variant.arm === 1);
  const lastSize = args.sizes.at(-1);
  const lastLeg = args.legs.at(-1) ?? 1;
  const atLast = sizes.filter((row) => row.variant.size === lastSize);
  const armRows = [
    ...atLast.filter((row) => row.variant.leg === lastLeg),
    ...rows.filter((row) => row.variant.arm !== 1),
  ];
  const hold = (row: RiggedVariant): string[] =>
    row.measures.hold === null ? [] : [row.measures.hold];
  return {
    out: join(args.dir, 'options.png'),
    scale: IMAGE_SCALE,
    body,
    rows: [
      {
        title: `Size options (standing, front, arm factor 1, one scale: ${IMAGE_SCALE} px = 1 m)`,
        cells: [
          {
            image: null,
            tile: 0,
            pxPerMeter: null,
            floorRow: null,
            labels: [
              `${args.species} of the working tree`,
              `head top ${m(working.headTop)}`,
              `H ${m(working.headHeight)}, seat ${m(working.seat)}`,
            ],
          },
          ...sizes.map((row) =>
            standing(row, [
              `${row.variant.size.label}, legs ${row.variant.leg}`,
              `head top ${m(row.measures.headTop)}`,
              `H ${m(row.measures.headHeight)}, seat ${m(row.measures.seat)}`,
            ]),
          ),
        ],
      },
      {
        title: `Arm options at ${lastSize?.label ?? '-'}, legs ${lastLeg} (standing, front, one scale)`,
        cells: armRows.map((row) =>
          standing(row, [
            `arm factor ${row.variant.arm}`,
            `${m(row.measures.reach)}, arm/trunk ${row.measures.armTrunk?.toFixed(2) ?? '-'}`,
            ...hold(row),
          ]),
        ),
      },
      {
        title: 'Leg options: knees from the side (each view at its own scale)',
        cells: atLast.map((row) => ({
          image: join(row.preview, 'knees.png'),
          tile: 0,
          pxPerMeter: null,
          floorRow: null,
          labels: [
            `legs ${row.variant.leg} (${row.variant.size.label})`,
            `seat ${m(row.measures.seat)}, chair ${m(row.measures.chair)}`,
          ],
        })),
      },
    ],
  };
}

/**
 * Draws the image of a plan with Python and Pillow.
 *
 * @param plan The path of the JSON file of the plan.
 * @returns A promise of the end of the run.
 * @throws Error if Python fails.
 */
function runPlot(plan: string): Promise<void> {
  const args = [
    'run',
    '--no-project',
    '--with',
    'pillow',
    '--with',
    'numpy',
    'python',
    '-I',
    PLOT_SCRIPT,
    plan,
  ];
  return new Promise((done, fail) => {
    const child = trackChild(spawn('uv', args, { stdio: ['ignore', 'inherit', 'inherit'] }));
    child.on('error', fail);
    child.on('close', (code) => {
      if (code === 0) {
        done();
      } else {
        fail(new Error(`The plot failed with the status ${String(code)}.`));
      }
    });
  });
}

/**
 * Runs the tool. The hidden form `--reach <species> <instrument> <json>` runs in the copy of
 * `tools/glb-swap.ts`, and writes the text of {@link reachCell} into the JSON file.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === '--reach') {
    const [, species = '', instrument = '', out = ''] = argv;
    const known = REACH_INSTRUMENTS.find((id) => id === instrument);
    if (!isSpeciesId(species) || known === undefined || out === '') {
      throw new Error('Usage: node tools/mesh-options.ts --reach <species> <instrument> <json>');
    }
    const demos = isPercussion(known) ? await probeDemos() : [];
    await writeFile(out, JSON.stringify(reachCell(species, known, demos)));
    return;
  }

  const args = parseOptionsArgs(argv);
  const started = Date.now();
  mkdirSync(join(args.dir, 'rigs'), { recursive: true });
  const text = await readFile(rigConfigPath(args.animal), 'utf8');
  const config = parseConfig(text);
  const source = sourceTops(new Uint8Array(await readFile(join(ROOT, config.source))));
  console.log(
    `${config.source}: skull top ${source.skull.toFixed(4)} u (|x| < ${HEAD_STRIP} u), highest point ${source.top.toFixed(4)} u.`,
  );
  // The swap gives the body of the rig to the species of the animal, so the reach of the hold
  // needs that species.
  if (args.instrument && glbAnimal(args.species) !== args.animal) {
    throw new Error(
      `The species ${args.species} does not take the body of ${args.animal} in the swap of --glb. Give --species with a species of the animal.`,
    );
  }
  const demos = args.instrument && isPercussion(args.instrument) ? await probeDemos() : [];
  const { measures: working, model } = workingBody(args.species, args.instrument, demos);

  const rows: RiggedVariant[] = [];
  for (const variant of optionVariants(args)) {
    const at = Date.now();
    const row = await rigVariant(args, variantConfig(text, variant, source.skull), variant);
    rows.push(row);
    console.log(
      `${variant.name}: head top ${row.measures.headTop.toFixed(3)} m, H ${row.measures.headHeight.toFixed(3)} m, seat ${row.measures.seat?.toFixed(3) ?? '-'} m, reach ${row.measures.reach.toFixed(3)} m${row.measures.hold ? `, ${row.measures.hold}` : ''} (${((Date.now() - at) / 1000).toFixed(1)} s)`,
    );
    for (const warning of row.warnings) {
      console.log(`  ${warning}`);
    }
  }

  const table = optionsTable(args.species, working, rows);
  const report = [
    `# Options of the ${args.animal} mesh`,
    '',
    `\`pnpm mesh-options ${argv.join(' ')}\`. Source skull top ${source.skull.toFixed(4)} u, highest point ${source.top.toFixed(4)} u. The column "Shoulder joints m" is the \`app.shoulders\` of the config of each variant in \`rigs/\`.`,
    '',
    ...table,
    '',
    ...warningLines(rows),
  ];
  await writeFile(join(args.dir, 'options.md'), report.join('\n'));
  const planFile = join(args.dir, 'plot.json');
  await writeFile(planFile, JSON.stringify(plotPlan(args, working, bodyFaces(model), rows)));
  await runPlot(planFile);
  console.log(['', ...table, ''].join('\n'));
  console.log(
    `Wrote ${join(args.dir, 'options.md')} and ${join(args.dir, 'options.png')} in ${((Date.now() - started) / 1000).toFixed(0)} s.`,
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
