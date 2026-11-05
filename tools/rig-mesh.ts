import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import type { Bounds } from '../src/models/bounds.ts';
import type { Side } from '../src/models/studio-format.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import {
  FOLD_ROLES,
  SAMPLE_SETS,
  SAME_FACE_DISTANCE,
  readFaceJson,
  roleAnimal,
  roleSpecies,
} from './fold-probe.ts';
import type { FaceRecord, FoldCounts } from './fold-probe.ts';
import { faceList, faceShares, foldShareText } from './face-shares.ts';
import type { FaceShare } from './face-shares.ts';
import { armGaps, gapLines } from './arm-gap.ts';
import { animalSpecies, handRigOf, runTool, scratchSettings, withGlbBody } from './glb-swap.ts';
import { measureLines, measureRig, triangleLine } from './rig-mesh-check.ts';
import { FORM_FORMAT, readFormJson } from './rig-form.ts';
import type { FormJson, PlayerForm } from './rig-form.ts';
import { setHolds } from './hold-sets.ts';
import { checkFormat, formatVersion, runChild, withProbeTree } from './ref-tree.ts';
import { trackChild, trackFolder } from './stop-cleanup.ts';
import { gzipSize } from './studio-budgets.ts';
import type { ThinRule } from './rig-mesh-check.ts';
import { ANIMALS, studioBody, writeStudioModule } from './studio-body.ts';
import type { AnimalSettings } from './studio-body.ts';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

/** The folder of the configs of the mesh rigs. */
const CONFIG_DIR = join(ROOT, 'tools', 'mesh-rigs');

/** The Blender script that rigs a mesh into the format of a studio body. */
const RIG_SCRIPT = join(ROOT, 'tools', 'blender', 'rig_mesh.py');

/** The largest part of the target by which the reach of the arms may differ from it. */
export const REACH_TOLERANCE = 0.01;

/** One joint of the config of a mesh rig, in the pose of the source. */
export interface MeshRigJoint {
  /** The head of the bone, in the units and the axes of the studio. */
  readonly head: Vec3;
  /** The tail of the bone: the name of the joint at its end, or a point of its own. */
  readonly tail: string | Vec3;
  /** The hint of the z axis of the bone, or `palm` for the normal of the palm. */
  readonly roll?: 'palm' | Vec3;
}

/**
 * The config of a mesh rig: `tools/mesh-rigs/<animal>.json`. The fields here are the fields that
 * the wrapper reads. `tools/blender/rig_mesh.py` reads the other fields: the weight rules, the
 * color rules, the seat and the bind arms of the studio, and the chair.
 */
export interface MeshRigConfig {
  /** The source GLB file, relative to the repository. */
  readonly source: string;
  /** The rigged GLB file, relative to the repository. */
  readonly output: string;
  /** The landmark of the scale in the app, and the target of the reach of the arms. */
  readonly app: {
    /** The height of the standing shoulder joints in the app, in meters. */
    readonly shoulders: number;
    /** The reach of each arm from the shoulder joint to the middle of the palm, in meters. */
    readonly reach: number;
  };
  /** The factor of the length of the upper arm and of the forearm. */
  readonly armFactor: number;
  /**
   * The factor of the length of the thigh and of the shin, 1 when it is not given. The feet keep
   * their size, and the body rises by the growth of the legs.
   */
  readonly legFactor?: number;
  /**
   * The factor of the length of the shin, the leg factor when it is not given. Then the leg factor
   * gives only the length of the thigh.
   */
  readonly shinFactor?: number;
  /** The factor of the size of the head around the neck joint, 1 when it is not given. */
  readonly headFactor?: number;
  /**
   * The factor of the length of the neck between its joints, 1 when it is not given. The head
   * keeps its size and moves along the neck with the head joint.
   */
  readonly neckFactor?: number;
  /**
   * The factor of the length of the trunk between the hips joint and the neck joint, or the joint
   * of {@link trunkTop}, 1 when it is not given. The head and the arms keep their sizes and move
   * with the trunk, and the legs and the tail keep their places.
   */
  readonly trunkFactor?: number;
  /**
   * The joint at the top of the part of the trunk that the trunk factor shortens, from the hips
   * joint: `neck` when it is not given. With `chest`, the upper chest and the arm roots keep
   * their form.
   */
  readonly trunkTop?: 'chest' | 'neck';
  /**
   * The factors of the width (along x) and of the depth (in the middle plane) of the trunk and of
   * the clavicles across the trunk axis, 1 and 1 when they are not given. The arms, the legs, and
   * the tail keep their sizes and move out with their joints.
   */
  readonly girthFactor?: readonly [width: number, depth: number];
  /**
   * The rows of the girth factors along the trunk axis, in place of {@link girthFactor}: each row
   * gives a share of the axis of the source from the hips joint (0) to the neck joint (1), and
   * the factors of the width, of the depth in front of the axis, and of the depth behind it there
   * (`girth_profile()` of `tools/blender/rig_mesh.py`). The factors blend linearly between the
   * rows, and keep the first or the last row beyond them. So the belly can become narrower and
   * flatter and the chest wider and deeper, the back on the chair can keep its place, and each
   * arm moves with the factors at its shoulder joint.
   */
  readonly girthProfile?: readonly (readonly [
    share: number,
    width: number,
    front: number,
    back: number,
  ])[];
  /**
   * The factors of the cross-section of the upper arm and of the forearm across their axes, 1 and
   * 1 when they are not given (`arm_girth()` of `tools/blender/rig_mesh.py`). The paws keep their
   * size, and the shoulder keeps its form.
   */
  readonly armGirth?: readonly [upper: number, fore: number];
  /**
   * The factors of the cross-section of the thigh and of the shin across their axes, 1 and 1 when
   * they are not given (`leg_girth()` of `tools/blender/rig_mesh.py`). The haunch and the feet
   * keep their form.
   */
  readonly legGirth?: readonly [thigh: number, shin: number];
  /**
   * The factors of the source on each axis after its scale to 1 unit high, 1 when they are not
   * given (`load_mesh()` of `tools/blender/rig_mesh.py`): `width` on x, `height` on y, and `depth`
   * on z. The joints and the boxes of the config are in the units of the scaled source.
   */
  readonly proportions?: {
    readonly width?: number;
    readonly height?: number;
    readonly depth?: number;
    /**
     * The part that keeps its form (`proportioned()` of `tools/blender/rig_mesh.py`): with
     * `head`, each vertex above the upper height of `blend` moves with the top of the neck and
     * takes only the factor {@link head} on each axis.
     */
    readonly keep?: 'head';
    /**
     * The factor of the kept head on each axis, around the top of the neck, 1 when it is not
     * given. `keep` needs it.
     */
    readonly head?: number;
    /**
     * The lower and the upper height of the zone where the scaled body blends into the kept
     * head, in the units of the source before the factors. `keep` needs it.
     */
    readonly blend?: readonly [low: number, high: number];
  };
  /** The joints of the middle and of the left side. The right side mirrors the left side. */
  readonly joints: Readonly<Record<string, MeshRigJoint>>;
  /** The rules of `--check`. */
  readonly check?: {
    /** The thin faces near the joints of the limbs that the check lists. */
    readonly thin: ThinRule;
  };
}

/** The joints of the middle and of the left side that a config gives: the 30 body bones. */
export const CONFIG_JOINTS = [
  'root',
  'hips',
  'spine',
  'spine1',
  'chest',
  'neck',
  'head',
  'ear_L',
  'clavicle_L',
  'upper_arm_L',
  'forearm_L',
  'forearm_twist_L',
  'hand_L',
  'fingers_L',
  'thigh_L',
  'shin_L',
  'foot_L',
  'toes_L',
  'tail',
] as const;

/**
 * Reads the text of a config file of a mesh rig, and checks the fields that the wrapper reads.
 *
 * @param text The text of the JSON file.
 * @returns The config.
 * @throws Error if a number of the app or a factor is not a positive number, if
 *   `proportions.keep` is not `head` with a blend zone, if `proportions.head` has no `keep`, or
 *   if the config lacks a joint of {@link CONFIG_JOINTS}.
 */
export function parseConfig(text: string): MeshRigConfig {
  // SAFETY: the configs in tools/mesh-rigs/ hold the fields of MeshRigConfig, and the checks below
  // read the fields that the wrapper uses.
  const config = JSON.parse(text) as MeshRigConfig;
  const numbers = [
    config.armFactor,
    config.legFactor ?? 1,
    config.shinFactor ?? 1,
    config.headFactor ?? 1,
    config.neckFactor ?? 1,
    config.trunkFactor ?? 1,
    ...(config.girthFactor ?? [1, 1]),
    ...(config.girthProfile ?? []).flatMap(([, width, front, back]) => [width, front, back]),
    ...(config.armGirth ?? [1, 1]),
    ...(config.legGirth ?? [1, 1]),
    config.proportions?.width ?? 1,
    config.proportions?.height ?? 1,
    config.proportions?.depth ?? 1,
    config.proportions?.head ?? 1,
    config.app.shoulders,
    config.app.reach,
  ];
  if (!numbers.every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error(
      'The arm factor, the leg factor, the shin factor, the head factor, the neck factor, the trunk factor, the girth factors, the arm and leg girth factors, the proportions, app.shoulders, and app.reach must be positive numbers.',
    );
  }
  if (config.girthProfile !== undefined) {
    if (config.girthFactor !== undefined) {
      throw new Error('girthProfile replaces girthFactor: give only one of them.');
    }
    const rows = config.girthProfile;
    if (rows.length === 0 || !rows.every((row) => row.length === 4 && Number.isFinite(row[0]))) {
      throw new Error(
        'girthProfile must hold rows of a share, a width factor, a front factor, and a back factor.',
      );
    }
  }
  const keep = config.proportions?.keep;
  if (keep === undefined && config.proportions?.head !== undefined) {
    throw new Error('proportions.head needs proportions.keep.');
  }
  if (keep !== undefined) {
    const [low, high] = config.proportions?.blend ?? [];
    if (keep !== 'head' || low === undefined || high === undefined || !(low >= 0 && low < high)) {
      throw new Error(
        'proportions.keep must be "head", with proportions.blend of a lower and a higher height from 0 up.',
      );
    }
  }
  const missing = CONFIG_JOINTS.filter((name) => config.joints[name]?.head.length !== 3);
  if (missing.length > 0) {
    throw new Error(`The config lacks the joints ${missing.join(', ')}.`);
  }
  return config;
}

/** A value of the JSON text of a config of a mesh rig. */
export type ConfigValue = number | string | boolean | null | ConfigValue[] | ConfigObject;

/** An object of the JSON text of a config of a mesh rig. */
export interface ConfigObject {
  /** The value of each key. */
  [key: string]: ConfigValue;
}

/**
 * Gives the kind of a value of a config.
 *
 * @param value The value.
 * @returns The kind: `number`, `string`, `boolean`, `null`, `list`, or `object`.
 */
function kindOf(value: ConfigValue): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a config is JSON from a file, an I/O boundary.
  return typeof value;
}

/**
 * Removes one pair of matching quotes around a text, such as the quotes of
 * `--set 'source="a.glb"'`. The shell keeps such quotes inside a quoted argument, and Blender
 * then finds no file of that name.
 *
 * @param text The text.
 * @returns The text with no outer pair of `"` or `'`, or the text as it is.
 */
export function unquoted(text: string): string {
  const first = text[0];
  const quoted = text.length >= 2 && (first === '"' || first === "'") && text.at(-1) === first;
  return quoted ? text.slice(1, -1) : text;
}

/**
 * Parses the new value of a change of a config from its text, with the kind of the old value. A
 * text value loses one pair of matching quotes ({@link unquoted}).
 *
 * @param text The text of the new value.
 * @param old The old value.
 * @param path The path, for the message.
 * @returns The new value.
 * @throws Error if the text does not give a value of the kind of the old value.
 */
function parseConfigValue(text: string, old: ConfigValue, path: string): ConfigValue {
  const kind = kindOf(old);
  const fault = new Error(`The value "${text}" of ${path} is not a ${kind} as the old value.`);
  const number = (part: string): number => {
    const value = Number(part);
    if (part.trim() === '' || !Number.isFinite(value)) {
      throw fault;
    }
    return value;
  };
  if (kind === 'number') {
    return number(text);
  }
  if (kind === 'boolean') {
    if (text !== 'true' && text !== 'false') {
      throw fault;
    }
    return text === 'true';
  }
  if (kind === 'string') {
    return unquoted(text);
  }
  if (Array.isArray(old) && old.length > 0 && old.every((v) => kindOf(v) === 'number')) {
    const list = text
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(number);
    if (list.length !== old.length) {
      throw new Error(`${path} has ${old.length} numbers, and "${text}" has ${list.length}.`);
    }
    return list;
  }

  let value: ConfigValue;
  try {
    // SAFETY: JSON.parse gives a JSON value, and the check of the kind follows.
    value = JSON.parse(text) as ConfigValue;
  } catch {
    throw fault;
  }
  if (kind !== 'null' && kindOf(value) !== kind) {
    throw fault;
  }
  return value;
}

/**
 * The optional rules of a config that a variant of `--set` can add, by their path, each with a
 * value of the kind of its value: the head factor (`headFactor`), the neck factor (`neckFactor`),
 * the trunk factor (`trunkFactor`) and the top joint of its part of the trunk (`trunkTop`), the girth factor (`girthFactor`) or its rows along the trunk (`girthProfile`), the factors of the
 * cross-section of the arms (`armGirth`) and of the legs (`legGirth`), the trunk share of the painted weights under the armpits (`weights.paintedBelow`), the factors of the source on each axis
 * (`proportions`), the depth factor of the source and the factor of the kept head
 * (`proportions.depth`, `proportions.head`), the root share of the tail in
 * the sit of the haunch (`sit.root`), the fixed seat top of the sit (`sit.top`), the move of
 * the tail with the drop of its root (`sit.carryTail`) and of the haunch near it
 * (`sit.tailSpread`), the curve of the
 * curled seated tail (`studio.tailCurl`), the move of the colors of the plain fur
 * (`colors.tone`), the light border of a black fur region (`colors.border`), the round eye
 * patches (`colors.patch`), the smile line (`colors.smile`), the move of a colored fur in Oklch
 * (`colors.shift`), the cut of the mesh where a hanging forearm touches the belly (`cut`), and
 * the smoothing of the arm tubes (`armSmooth`), the smoothing of the bent elbows of the bind
 * mesh (`bindSmooth`), the straight bind arms (`studio.straightArms`), and the bind supination of
 * each paw (`studio.bindSupination`, 0 for a side with no value). A path through an optional rule
 * that the config does not have, such as `studio.bindSupination.L`, adds the rule first.
 * `tools/blender/rig_mesh.py` describes each rule.
 */
const OPTIONAL_VALUES: ReadonlyMap<string, ConfigValue> = new Map<string, ConfigValue>([
  ['headFactor', 1],
  ['neckFactor', 1],
  ['trunkFactor', 1],
  ['trunkTop', 'neck'],
  ['girthFactor', [1, 1]],
  ['girthProfile', [[0, 1, 1, 1]]],
  ['armGirth', [1, 1]],
  ['legGirth', [1, 1]],
  ['weights.paintedBelow', { height: [0, 0], inner: 0 }],
  ['proportions', { width: 1, height: 1, depth: 1 }],
  ['proportions.depth', 1],
  ['proportions.head', 1],
  ['sit.root', [0, 1]],
  ['sit.top', 0],
  ['sit.carryTail', false],
  ['sit.tailSpread', [0, 0]],
  ['armSmooth', { rounds: 0, sides: 'LR', bones: ['upper_arm'] }],
  ['bindSmooth', { rounds: 0, sides: 'LR', bones: ['elbow'] }],
  ['studio.tailCurl', { points: [[0, 0, 0]] }],
  ['colors.tone', { chroma: 0, light: [0, 1], keep: [], points: [[0, 0, 0, 0]] }],
  [
    'colors.border',
    {
      box: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      share: 0.5,
      dark: 0.5,
    },
  ],
  [
    'colors.patch',
    {
      center: [0, 0],
      radii: [1, 1],
      box: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      dark: 0.5,
    },
  ],
  ['colors.smile', { bands: [] }],
  ['colors.shift', { chroma: [0, 1], light: [0, 1], scale: [1, 1], turn: 0 }],
  ['cut', { top: 0 }],
  ['studio.straightArms', false],
  ['studio.bindSupination', { L: 0, R: 0 }],
]);

/**
 * Changes one value of a config in place, such as `weights.haunch.height=0.16,0.27` or
 * `armFactor=1.08`. The path names the keys from the top of the config, and the index of an item
 * of a list is a key too. The new value has the kind of the old value: a number, `true` or
 * `false`, a text, numbers separated by commas for a list of the same count of numbers, or JSON
 * text for another list or an object. A last key that the config and {@link OPTIONAL_VALUES} do
 * not have is a new key of its object, or the next item of its list, with a JSON value, such as
 * `weights.rigid=[[-0.17,0.68,-0.12]]` or `raise.1={"side":"L",...}` ({@link newKeys}). A change
 * `<path>+=<value>` adds the value to the end of a list ({@link appendConfigValue}).
 *
 * @param config The config.
 * @param change The change.
 * @throws Error if the path names no value of the config and no new key, or if the value does
 *   not fit the old value, or if the value of a new key is no JSON text.
 */
function setConfigValue(config: ConfigObject, change: ConfigChange): void {
  const { path, text } = change;
  const keys = path.split('.');
  if (change.append) {
    appendConfigValue(config, keys, text);
    return;
  }
  let node: ConfigValue = config;
  for (const [i, key] of keys.entries()) {
    const last = i === keys.length - 1;
    const optional = OPTIONAL_VALUES.get(keys.slice(0, i + 1).join('.'));
    const old: ConfigValue | undefined = childOf(node, key) ?? optional;
    if (old === undefined && last && canAdd(node, key)) {
      setChild(node, key, newConfigValue(text, key, path));
      return;
    }
    if (old === undefined) {
      throw new Error(`The key "${key}" of ${path} is not known.`);
    }
    if (!last) {
      // An optional rule that the config does not have gets a copy of its value first.
      if (childOf(node, key) === undefined) {
        setChild(node, key, structuredClone(old));
      }
      node = childOf(node, key) ?? old;
    } else {
      setChild(node, key, parseConfigValue(text, old, path));
    }
  }
}

/**
 * Adds a value to the end of a list of a config, such as a rule of `raise` (`raise+=<JSON>`). An
 * object, such as a `raise` of one rule, becomes a list of the object and the value, as
 * `tools/blender/rig_mesh.py` reads one rule or a list of rules. A key that the config does not
 * have gets a list of the value.
 *
 * @param config The config.
 * @param keys The keys of the path of the list.
 * @param text The JSON text of the value.
 * @throws Error if a key before the last names no value, if the last key names a value that is not
 *   a list or an object, or if the text is no JSON text.
 */
function appendConfigValue(config: ConfigObject, keys: readonly string[], text: string): void {
  const path = keys.join('.');
  let node: ConfigValue = config;
  for (const key of keys.slice(0, -1)) {
    const child = childOf(node, key);
    if (child === undefined) {
      throw new Error(`The key "${key}" of ${path}+= is not known.`);
    }
    node = child;
  }

  const last = keys.at(-1) ?? '';
  let value: ConfigValue;
  try {
    // SAFETY: JSON.parse gives a JSON value, and parseConfig() checks the changed config.
    value = JSON.parse(text) as ConfigValue;
  } catch {
    throw new Error(`The value "${text}" of ${path}+= is no JSON text.`);
  }
  const old = childOf(node, last);
  if (Array.isArray(old)) {
    old.push(value);
  } else if (old instanceof Object) {
    setChild(node, last, [old, value]);
  } else if (old === undefined && canAdd(node, last)) {
    setChild(node, last, [value]);
  } else {
    throw new Error(`${path}+= adds an item to a list, and ${path} is a ${kindOf(old ?? null)}.`);
  }
}

/**
 * Tells if a change can add a key to an object of a config, or an item to the end of a list.
 *
 * @param node The object or the list.
 * @param key The new key, or the index of the new item as text.
 * @returns True for an object, and for a list with the index of its next item.
 */
function canAdd(node: ConfigValue, key: string): boolean {
  if (Array.isArray(node)) {
    return key === String(node.length);
  }
  return node instanceof Object;
}

/**
 * Parses the value of a new key of a config from its JSON text.
 *
 * @param text The text, such as `[[-0.17,0.68,-0.12]]` or `"R"`.
 * @param key The new key, for the message.
 * @param path The path, for the message.
 * @returns The value.
 * @throws Error if the text is no JSON text.
 */
function newConfigValue(text: string, key: string, path: string): ConfigValue {
  try {
    // SAFETY: JSON.parse gives a JSON value, and parseConfig() checks the changed config.
    return JSON.parse(text) as ConfigValue;
  } catch {
    throw new Error(
      `The key "${key}" of ${path} is not known, and its value "${text}" is no JSON text for a new key, such as 0.5, [0.1,0.2], "R", or {"side":"R"}.`,
    );
  }
}

/**
 * Tells if a config has a value at a path.
 *
 * @param config The config.
 * @param path The path, such as `weights.rigid`.
 * @returns True when each key of the path names a value.
 */
function hasPath(config: ConfigObject, path: string): boolean {
  let node: ConfigValue | undefined = config;
  for (const key of path.split('.')) {
    node = node === undefined ? undefined : childOf(node, key);
  }
  return node !== undefined;
}

/**
 * Gives the paths of the new keys of a list of changes: each path that the config and
 * {@link OPTIONAL_VALUES} do not have before its change. The tool reads no key of a new path, and
 * `tools/blender/rig_mesh.py` reads only the keys that it knows, so a wrong name of a key changes
 * nothing.
 *
 * @param text The JSON text of the config.
 * @param list The changes, such as `weights.rigid=[[-0.17,0.68,-0.12]]`.
 * @returns The new paths, in the order of the changes.
 * @throws Error as {@link setConfig} does.
 */
export function newKeys(text: string, list: string): string[] {
  // SAFETY: a config file of tools/mesh-rigs/ holds one JSON object.
  const config = JSON.parse(text) as ConfigObject;
  const added: string[] = [];
  for (const change of configChanges(list)) {
    if (!hasPath(config, change.path) && !isOptional(change.path)) {
      added.push(change.path);
    }
    setConfigValue(config, change);
  }
  return added;
}

/**
 * Tells if a path names an optional rule ({@link OPTIONAL_VALUES}) or a key of the value of an
 * optional rule, such as `studio.bindSupination.L`.
 *
 * @param path The path.
 * @returns True for such a path.
 */
function isOptional(path: string): boolean {
  if (OPTIONAL_VALUES.has(path)) {
    return true;
  }
  const cut = path.lastIndexOf('.');
  const parent = cut < 0 ? undefined : OPTIONAL_VALUES.get(path.slice(0, cut));
  return parent !== undefined && childOf(parent, path.slice(cut + 1)) !== undefined;
}

/**
 * Gives the value of a key of an object of a config, or of an index of a list.
 *
 * @param node The object or the list.
 * @param key The key, or the index as text.
 * @returns The value, or `undefined` when the node has no such key or index.
 */
function childOf(node: ConfigValue, key: string): ConfigValue | undefined {
  if (Array.isArray(node)) {
    return /^\d+$/.test(key) ? node[Number(key)] : undefined;
  }
  return node instanceof Object && Object.hasOwn(node, key) ? node[key] : undefined;
}

/**
 * Sets the value of a key of an object of a config, or of an index of a list.
 *
 * @param node The object or the list.
 * @param key The key, or the index as text.
 * @param value The value.
 */
function setChild(node: ConfigValue, key: string, value: ConfigValue): void {
  if (Array.isArray(node)) {
    node[Number(key)] = value;
  } else if (node instanceof Object) {
    node[key] = value;
  }
}

/** One change of a config: the path of a value and the text of its new value. */
export interface ConfigChange {
  /** The path, such as `weights.haunch.height`. */
  readonly path: string;
  /** The text of the new value, such as `0.16,0.27`. */
  readonly text: string;
  /** True for `<path>+=<value>`, which adds the value to the end of the list of the path. */
  readonly append: boolean;
}

/**
 * Reads the changes of a variant of `--set`, separated by `;`. A change `<path>+=<value>` adds a
 * JSON value to the end of a list, such as `raise+=<entry>`. A value `@<file>` takes the JSON text
 * of the file, such as the entry of `pnpm raise-fit --json <file>`.
 *
 * @param list The changes, such as `weights.haunch.height=0.16,0.27;armFactor=1.08` or
 *   `raise+=@scratch/raise.json`.
 * @returns The changes, in their order.
 * @throws Error if a change is not `<path>=<value>` or `<path>+=<value>`, if the variant has no
 *   change, or if the file of a value `@<file>` cannot be read.
 */
export function configChanges(list: string): ConfigChange[] {
  const changes = list
    .split(';')
    .map((change) => change.trim())
    .filter((change) => change !== '')
    .map((change) => {
      const equals = change.indexOf('=');
      const append = change[equals - 1] === '+';
      const end = append ? equals - 1 : equals;
      if (end < 1) {
        throw new Error(`The change "${change}" is not <path>=<value> or <path>+=<value>.`);
      }
      const value = change.slice(equals + 1);
      return { path: change.slice(0, end), text: valueText(value), append };
    });
  if (changes.length === 0) {
    throw new Error(`The variant "${list}" has no change. Each --set needs <path>=<value>.`);
  }
  return changes;
}

/**
 * Gives the text of the value of a change: the text itself, or for `@<file>` the text of the file.
 *
 * @param value The value of the change, such as `0.5` or `@scratch/raise.json`.
 * @returns The text of the value.
 * @throws Error if the file of `@<file>` cannot be read.
 */
function valueText(value: string): string {
  if (!value.startsWith('@')) {
    return value;
  }
  const file = value.slice(1);
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    throw new Error(`The file ${file} of the value ${value} cannot be read.`);
  }
}

/**
 * Applies a list of changes, separated by `;`, to the JSON text of a config, as
 * {@link setConfigValue} does. The text of the input does not change.
 *
 * @param text The JSON text of the config.
 * @param list The changes, such as `weights.haunch.height=0.16,0.27;armFactor=1.08`.
 * @returns The JSON text of the changed config.
 * @throws Error if the list has no change, if a change names no value of the config, or if a
 *   value does not fit the old value.
 */
export function setConfig(text: string, list: string): string {
  // SAFETY: a config file of tools/mesh-rigs/ holds one JSON object.
  const config = JSON.parse(text) as ConfigObject;
  for (const change of configChanges(list)) {
    setConfigValue(config, change);
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Gives the reason why a change of a path of a config changes only the printed text of
 * `--check`, with the place of the real value. These paths change no rig and no measure of the
 * table:
 * - `output`: the check writes the rig into its temporary folder.
 * - `app.reach`: the target of the printed reach line.
 * - `app` and `app.shoulders` of an animal of `ANIMALS`: the export takes the scale from its
 *   entry in `ANIMALS`.
 * - A note: a key `note`, or a key whose name ends with `Note`.
 *
 * @param path The path of the change.
 * @param known True for an animal of `ANIMALS` of `tools/studio-body.ts`.
 * @returns The reason, or `null` when the change can change the rig or its measures.
 */
export function printedOnly(path: string, known: boolean): string | null {
  const last = path.split('.').at(-1) ?? '';
  if (path === 'output') {
    return 'the check writes the rig into its temporary folder, and output names only the file in the text of the module. A run with no --check writes the file of output.';
  }
  if (path === 'app.reach') {
    return 'app.reach is only the target of the reach line. The reach of the rig comes from armFactor.';
  }
  if (known && (path === 'app' || path === 'app.shoulders')) {
    return 'the export takes the scale of the animal from its entry in ANIMALS of tools/studio-body.ts, and app.shoulders sets only the scale of the reach line and of the log of Blender.';
  }
  if (last === 'note' || last.endsWith('Note')) {
    return 'a note changes no value that the rig or the check reads.';
  }
  return null;
}

/**
 * Gives the factor of the landmark height of a variant of `--check` that keeps the meters for each
 * unit of the base: the height of the standing shoulder joints of the variant over the height of
 * the shoulder joints of the base, after the rise of the legs and the drop of the trunk
 * ({@link shoulderHeight}). A variant of `legFactor` raises the shoulder joints, a variant of
 * `trunkFactor` lowers them, and a variant of the depth of `girthFactor` or `girthProfile` moves them a little. The landmark moves with them, so that the trunk, the head, and the
 * arms keep their meters. A variant of `headFactor` or `neckFactor` keeps the shoulder joints, so
 * its factor is 1.
 *
 * @param base The config of the base.
 * @param variant The config of the variant.
 * @returns The factor, exactly 1 when the variant keeps the shoulder joints.
 */
export function keptHeight(base: MeshRigConfig, variant: MeshRigConfig): number {
  return shoulderHeight(variant) / shoulderHeight(base);
}

/**
 * Gives the JSON text of a variant of `--set` of `--check`. The variant keeps the meters for each
 * unit of the base: `app.shoulders` takes the factor of {@link keptHeight}, so that the reach line
 * and the scale of an animal that is not in `ANIMALS` follow the rise of the legs.
 *
 * @param text The JSON text of the config.
 * @param list The changes of the variant ({@link setConfig}).
 * @param known True for an animal of `ANIMALS` of `tools/studio-body.ts`.
 * @returns The JSON text of the changed config.
 * @throws Error if the variant has no change, if a change changes only the printed text of the
 *   check ({@link printedOnly}), if a change does not fit the config, or if the changed config
 *   fails the checks of {@link parseConfig}.
 */
export function variantText(text: string, list: string, known: boolean): string {
  for (const { path } of configChanges(list)) {
    const reason = printedOnly(path, known);
    if (reason) {
      throw new Error(`--set ${path} changes only the printed text of the check: ${reason}`);
    }
  }
  const changed = setConfig(text, list);
  const variant = parseConfig(changed);
  const factor = keptHeight(parseConfig(text), variant);
  return factor === 1
    ? changed
    : setConfig(changed, `app.shoulders=${variant.app.shoulders * factor}`);
}

/**
 * Gives the head of a joint of a config. A joint of the right side mirrors its left joint.
 *
 * @param config The config.
 * @param name The name of the joint, such as `hand_R`.
 * @returns The head, in the units and the axes of the studio.
 * @throws Error if the config has no joint of the name or of its left side.
 */
export function jointHead(config: MeshRigConfig, name: string): Vec3 {
  const own = config.joints[name];
  if (own) {
    return own.head;
  }
  const left = config.joints[name.replace(/_R$/, '_L')];
  if (!name.endsWith('_R') || !left) {
    throw new Error(`The config has no joint "${name}".`);
  }
  return [-left.head[0], left.head[1], left.head[2]];
}

/**
 * Gives the distance of two points.
 *
 * @param a The first point.
 * @param b The second point.
 * @returns The distance.
 */
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Gives the rise of the body of a rig by the growth of its legs, as `tools/blender/rig_mesh.py`
 * gives it: the thigh takes the leg factor, the shin takes the shin factor (the leg factor when
 * the config gives none), the foot keeps its size, and the body rises by the drop of the ankle, so
 * that the soles stay on the floor.
 *
 * @param config The config.
 * @returns The rise, in the units of the studio.
 */
export function legRise(config: MeshRigConfig): number {
  const hip = jointHead(config, 'thigh_L');
  const knee = jointHead(config, 'shin_L');
  const ankle = jointHead(config, 'foot_L');
  const thigh = config.legFactor ?? 1;
  const shin = config.shinFactor ?? thigh;
  return (thigh - 1) * (hip[1] - knee[1]) + (shin - 1) * (knee[1] - ankle[1]);
}

/**
 * Gives the drop of the left arm by the trunk factor, as `trunk_moves()` of
 * `tools/blender/rig_mesh.py` gives it: the trunk shortens by the factor along the line from the
 * hips joint to the joint of `trunkTop`, and the arm moves with the point of the line at its
 * clavicle joint.
 *
 * @param config The config.
 * @returns The drop, in the units of the studio: negative for a factor below 1.
 */
export function trunkDrop(config: MeshRigConfig): number {
  const hips = jointHead(config, 'hips');
  const neck = jointHead(config, config.trunkTop ?? 'neck');
  const clavicle = jointHead(config, 'clavicle_L');
  const length = distance(hips, neck);
  const axis: Vec3 = [
    (neck[0] - hips[0]) / length,
    (neck[1] - hips[1]) / length,
    (neck[2] - hips[2]) / length,
  ];
  const along =
    (clavicle[0] - hips[0]) * axis[0] +
    (clavicle[1] - hips[1]) * axis[1] +
    (clavicle[2] - hips[2]) * axis[2];
  const clamped = Math.min(Math.max(along, 0), length);
  return ((config.trunkFactor ?? 1) - 1) * clamped * axis[1];
}

/**
 * Gives the rise of the left shoulder joint by the girth factors, as `girth_moves()` of
 * `tools/blender/rig_mesh.py` gives it: the arm moves with its shoulder joint, which moves away
 * from the trunk axis through the hips joint and the neck joint. The axis lies in the middle
 * plane, so only the depth factor moves the joint up or down, by the depth factor less 1 times the
 * height of its distance across the axis. With `girthProfile`, the depth factor is the blend of
 * the rows at the share of the joint along the axis, in front of the axis or behind it
 * ({@link girthDepth}).
 *
 * @param config The config.
 * @returns The rise, in the units of the studio: small, because the axis is nearly vertical.
 */
export function girthRise(config: MeshRigConfig): number {
  const hips = jointHead(config, 'hips');
  const neck = jointHead(config, 'neck');
  const shoulder = jointHead(config, 'upper_arm_L');
  const length = distance(hips, neck);
  const axis: Vec3 = [
    (neck[0] - hips[0]) / length,
    (neck[1] - hips[1]) / length,
    (neck[2] - hips[2]) / length,
  ];
  const rel: Vec3 = [shoulder[0] - hips[0], shoulder[1] - hips[1], shoulder[2] - hips[2]];
  const along = rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2];
  // The source of a rig config faces +z, so a joint in front of the axis has a positive z part
  // across it.
  const depth = girthDepth(config, along / length, rel[2] - along * axis[2] > 0);
  return (depth - 1) * (rel[1] - along * axis[1]);
}

/**
 * Gives the depth factor of the girth at a share of the trunk axis, as `girth_profile()` of
 * `tools/blender/rig_mesh.py` gives it: the linear blend of the rows of `girthProfile` in the
 * order of their shares, the first or the last row beyond them, or the depth of `girthFactor`.
 *
 * @param config The config.
 * @param share The share of the axis from the hips joint (0) to the neck joint (1).
 * @param front True for a point in front of the axis, false for a point behind it.
 * @returns The depth factor, 1 with no girth rule.
 */
export function girthDepth(config: MeshRigConfig, share: number, front: boolean): number {
  const depth = config.girthFactor?.[1] ?? 1;
  const column = front ? 2 : 3;
  const rows = (config.girthProfile ?? [[0, 1, depth, depth] as const]).toSorted(
    (a, b) => a[0] - b[0],
  );
  let value = rows[0]?.[column] ?? 1;
  for (const [i, row] of rows.entries()) {
    const before = rows[i - 1];
    if (share >= row[0]) {
      value = row[column];
      continue;
    }
    if (before) {
      value =
        before[column] +
        ((share - before[0]) / (row[0] - before[0])) * (row[column] - before[column]);
    }
    break;
  }
  return value;
}

/**
 * Gives the height of the standing shoulder joint of a rig, after the rise of the legs, the drop
 * of the trunk, and the move of the girth.
 *
 * @param config The config.
 * @returns The height, in the units of the studio.
 */
export function shoulderHeight(config: MeshRigConfig): number {
  return (
    jointHead(config, 'upper_arm_L')[1] + legRise(config) + trunkDrop(config) + girthRise(config)
  );
}

/**
 * Measures the reach of an arm of the rig in the app, as `pnpm studio-body --inspect` does: from
 * the shoulder joint over the elbow and the wrist to the middle of the palm, the midpoint of the
 * wrist and the finger joint. The upper arm and the forearm take the factor, and the paw keeps
 * its size (`tools/blender/rig_mesh.py`). The scale puts the shoulder joint, after the rise of the
 * legs, at the height of the app.
 *
 * @param config The config.
 * @param side The side of the arm.
 * @param factor The factor of the upper arm and the forearm.
 * @returns The reach, in meters.
 */
export function armReach(config: MeshRigConfig, side: Side, factor = config.armFactor): number {
  const shoulder = jointHead(config, `upper_arm_${side}`);
  const elbow = jointHead(config, `forearm_${side}`);
  const wrist = jointHead(config, `hand_${side}`);
  const fingers = jointHead(config, `fingers_${side}`);
  const palm: Vec3 = [
    (wrist[0] + fingers[0]) / 2,
    (wrist[1] + fingers[1]) / 2,
    (wrist[2] + fingers[2]) / 2,
  ];
  const units =
    factor * (distance(shoulder, elbow) + distance(elbow, wrist)) + distance(wrist, palm);
  return (units * config.app.shoulders) / shoulderHeight(config);
}

/**
 * Checks that the arm factor of a config gives the reach of the app.
 *
 * @param config The config.
 * @returns The reach of the left arm, in meters.
 * @throws Error if the reach of an arm differs from the target by more than
 *   {@link REACH_TOLERANCE} of it. The message gives the factor that gives the target.
 */
export function checkReach(config: MeshRigConfig): number {
  for (const side of ['L', 'R'] as const) {
    const reach = armReach(config, side);
    if (Math.abs(reach - config.app.reach) > REACH_TOLERANCE * config.app.reach) {
      throw new Error(
        `The arm factor ${config.armFactor} gives a reach of ${reach.toFixed(4)} m, not ${config.app.reach} m. The factor ${targetFactor(config, side).toFixed(4)} gives the target.`,
      );
    }
  }
  return armReach(config, 'L');
}

/**
 * Gives the arm factor that gives the reach of the app: the upper arm and the forearm take the
 * factor, and the paw keeps its size.
 *
 * @param config The config.
 * @param side The side of the arm.
 * @returns The factor.
 */
export function targetFactor(config: MeshRigConfig, side: Side): number {
  const short = armReach(config, side, 1);
  const paw = armReach(config, side, 0);
  return (config.app.reach - paw) / (short - paw);
}

/**
 * Writes the line of the reach of `--check`, which goes on when the reach misses the target. A
 * question about the arms gives this measured factor (`docs/agents/rigging.md`, "The asset
 * chain").
 *
 * @param config The config.
 * @returns The line.
 */
export function reachLine(config: MeshRigConfig): string {
  const shoulder = shoulderHeight(config);
  const scale = config.app.shoulders / shoulder;
  const sides = (['L', 'R'] as const).map(
    (side) =>
      `Reach ${side}: ${armReach(config, side, 1).toFixed(4)} m with no factor, ${armReach(config, side).toFixed(4)} m with ${config.armFactor}, and the factor ${targetFactor(config, side).toFixed(4)} gives ${config.app.reach} m.`,
  );
  return [
    `Shoulder joint at ${Number(shoulder.toFixed(6))} u, ${scale.toFixed(4)} m for each unit.`,
    ...sides,
  ].join(' ');
}

/**
 * The options of the app checks of `--check`, which make one variant faster: the roles, the play
 * step, and the demos of the fold probes, and the faces of the table of the variants.
 */
export interface CheckProbe {
  /** The roles of `--roles` (keys of `FOLD_ROLES`), or `null` for each role of the animal. */
  readonly roles: readonly string[] | null;
  /** The play step of `pnpm fold-probe` of `--step`, in seconds, or `null` for its default. */
  readonly step: number | null;
  /** The demos of `--demo` for `pnpm fold-probe`, or none for all demos. */
  readonly demos: readonly string[];
  /** The number of faces of `--faces` of each role in the table of the variants, or 0. */
  readonly faces: number;
  /**
   * The changes of the holds of `--hold` for the fold probes, separated by `;`, as `--set` of the
   * hold tools takes them, or an empty text for none.
   */
  readonly hold: string;
  /**
   * The faces of `--watch`, by their index in the packed mesh, whose share of the folded samples
   * the tool prints ({@link watchLines}), or none.
   */
  readonly watch: readonly number[];
}

/**
 * The app checks of `--check` with no option: each role, all demos, no faces, no hold change, and
 * no watched face.
 */
export const DEFAULT_PROBE: CheckProbe = {
  roles: null,
  step: null,
  demos: [],
  faces: 0,
  hold: '',
  watch: [],
};

/** The arguments of `pnpm rig-mesh`. */
export interface RigMeshArgs {
  /** The id of the animal: the name of its config in `tools/mesh-rigs/`. */
  readonly animal: string;
  /** The folder of the preview images, or `null` for no preview. */
  readonly preview: string | null;
  /** True for `--check`: the rig goes into a temporary folder, and the tool measures it. */
  readonly check: boolean;
  /**
   * The variants of `--set` for `--check`: each is a list of changes of the config, separated by
   * `;` ({@link setConfig}). The check runs the base first, then each variant.
   */
  readonly sets: readonly string[];
  /** The options of the app checks of `--check`. */
  readonly probe: CheckProbe;
  /**
   * The folder of `--keep`, into which `--check` copies the GLB file of each rig as `base.glb`,
   * `variant-1.glb`, and so on, each with its corners for `pnpm arm-look` ({@link keptCorners}),
   * or `null` for none.
   */
  readonly keep: string | null;
  /**
   * True for `--no-base`: `--check` rigs and probes only the variants of `--set`, and the tables
   * have no row of the base config ({@link checkVariants}).
   */
  readonly noBase: boolean;
}

/** The usage text of `pnpm rig-mesh`. */
const USAGE =
  'Usage: node tools/rig-mesh.ts <animal> [--preview <dir>] [--check [--set <path>=<value>[;<path>=<value>]...]... [--no-base] [--roles <role>[,<role>]...] [--step <seconds>] [--demo <id>]... [--faces <n>] [--watch <face>[,<face>]...] [--hold <changes>]... [--keep <dir>]]';

/** The options of `pnpm rig-mesh` that take a value. */
const VALUED = [
  '--preview',
  '--set',
  '--roles',
  '--step',
  '--demo',
  '--faces',
  '--watch',
  '--hold',
  '--keep',
] as const;

/**
 * Tells if an argument is an option of `pnpm rig-mesh` that takes a value.
 *
 * @param arg The argument.
 * @returns True for an option of {@link VALUED}.
 */
function isValued(arg: string): arg is (typeof VALUED)[number] {
  return VALUED.some((option) => option === arg);
}

/**
 * Reads the arguments of `pnpm rig-mesh <animal> [--preview <dir>] [--check] [--set <changes>]...`
 * and the options of the app checks of `--check`: `--roles`, `--step`, `--demo`, `--faces`,
 * `--watch`, and `--hold`, whose changes of the holds the fold probes take in memory, the
 * folder of `--keep`, and `--no-base`.
 *
 * @param args The arguments after the script.
 * @returns The animal, the preview folder, the check flag, the variants, and the options of the
 *   app checks.
 * @throws Error with the usage for other arguments, for `--set` or an option of the app checks
 *   with no `--check`, for `--no-base` with no `--set`, for a step that is not above 0, for a count
 *   of faces that is not a whole number above 0, or for a watched face that is not a whole number
 *   of 0 or more.
 */
export function parseArgs(args: readonly string[]): RigMeshArgs {
  let preview: string | null = null;
  let check = false;
  const sets: string[] = [];
  const rest: string[] = [];
  let roles: string[] | null = null;
  let step: number | null = null;
  const demos: string[] = [];
  let faces = 0;
  const watch: number[] = [];
  const holds: string[] = [];
  let keep: string | null = null;
  let noBase = false;
  let checkOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--check') {
      check = true;
      continue;
    }
    if (arg === '--no-base') {
      noBase = true;
      checkOnly = true;
      continue;
    }
    if (!isValued(arg)) {
      rest.push(arg);
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(USAGE);
    }
    i++;
    checkOnly ||= arg !== '--preview';
    switch (arg) {
      case '--preview':
        preview = value;
        break;
      case '--set':
        sets.push(value);
        break;
      case '--roles':
        roles = value.split(',').map((role) => role.trim());
        break;
      case '--step':
        step = Number(value);
        if (!(step > 0)) {
          throw new Error(`The option --step takes seconds above 0.\n${USAGE}`);
        }
        break;
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--faces':
        faces = Number(value);
        if (!Number.isInteger(faces) || faces < 1) {
          throw new Error(`The option --faces takes a whole number of faces above 0.\n${USAGE}`);
        }
        break;
      case '--watch':
        watch.push(...faceList(value, '--watch'));
        break;
      case '--hold':
        holds.push(value);
        break;
      case '--keep':
        keep = value;
        break;
    }
  }
  const [animal] = rest;
  if (!animal || rest.length !== 1 || animal.startsWith('--') || (checkOnly && !check)) {
    throw new Error(USAGE);
  }
  if (noBase && sets.length === 0) {
    throw new Error(`The option --no-base needs at least one --set.\n${USAGE}`);
  }
  // Each change must fit before the first rig, so that a typing fault stops the run at once.
  const hold = holds.join(';');
  if (hold) {
    setHolds(hold).undo();
  }
  return {
    animal,
    preview,
    check,
    sets,
    probe: { roles, step, demos, faces, hold, watch },
    keep,
    noBase,
  };
}

/**
 * Chooses the roles of the app checks of `--check`: the roles of the animal, or the roles of
 * `--roles` in the order of the roles of the animal.
 *
 * @param roles The roles of the animal ({@link animalRoles}).
 * @param asked The roles of `--roles`, or `null` for each role.
 * @returns The roles.
 * @throws Error if a role of `--roles` is not a role of the animal.
 */
export function chooseRoles(
  roles: readonly AnimalRole[],
  asked: readonly string[] | null,
): AnimalRole[] {
  if (!asked) {
    return [...roles];
  }
  const unknown = asked.filter((name) => !roles.some(({ role }) => role === name));
  if (unknown.length > 0) {
    throw new Error(
      `The roles ${unknown.join(', ')} are not roles of the animal. Its roles are: ${roles.map(({ role }) => role).join(', ') || 'none'}.`,
    );
  }
  return roles.filter(({ role }) => asked.includes(role));
}

/**
 * Gives the arguments of `pnpm fold-probe` for a role of the app checks of `--check`.
 *
 * @param role The role.
 * @param json The file of `--json`.
 * @param probe The options of the app checks.
 * @returns The arguments, such as `fox-violinist --json f.json --step 1 --demo beethoven-8`.
 */
export function foldArgs(role: string, json: string, probe: CheckProbe): string[] {
  return [
    role,
    '--json',
    json,
    ...(probe.step === null ? [] : ['--step', String(probe.step)]),
    ...probe.demos.flatMap((demo) => ['--demo', demo]),
    ...(probe.hold ? ['--set', probe.hold] : []),
    ...(probe.watch.length > 0 ? ['--middles', probe.watch.join(',')] : []),
  ];
}

/**
 * Gives the arguments of the run of Blender for a rig.
 *
 * @param config The path of the config.
 * @param output The path of the rigged GLB file.
 * @param preview The folder of the preview images, or `null`.
 * @param obj The OBJ file of the long-armed source of `--check`, or `null` for a rig with no
 *   check. With a file, the script also gets `--check`, and it lists the faces that the stretch
 *   turns or squeezes and the long thin faces across an arm joint that no ring cuts.
 * @param corners The JSON file of the source corners of each face of the module (`--corners` of
 *   the script), or `null` for none.
 * @returns The arguments of `blender`.
 */
export function blenderArgs(
  config: string,
  output: string,
  preview: string | null,
  obj: string | null = null,
  corners: string | null = null,
): string[] {
  // A Python error of the script gives the exit code 1. Blender gives 0 by default, and the
  // rig then seems to pass with the old file.
  const args = [
    '-b',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    RIG_SCRIPT,
    '--',
    config,
    output,
  ];
  return [
    ...args,
    ...(preview ? ['--preview', preview] : []),
    ...(obj ? ['--obj', obj, '--check'] : []),
    ...(corners ? ['--corners', corners] : []),
  ];
}

/**
 * Gives the path of the corners file beside a kept GLB file (`--keep`), which `pnpm arm-look
 * --glb` reads by default: `<name>.corners.json` for `<name>.glb`.
 *
 * @param glb The path of the GLB file.
 * @returns The path of the corners file.
 */
export function keptCorners(glb: string): string {
  return `${glb.replace(/\.glb$/, '')}.corners.json`;
}

/** The start of a warning line of the log of `tools/blender/rig_mesh.py` (`warn()`). */
export const RIG_WARNING = 'rig_mesh: warning:';

/**
 * Gives the warning lines of a log of the rig script: the seat that the thighs set, the eye box in
 * a dark patch, and the dark faces outside the eye and nose boxes.
 *
 * @param log The text of the log.
 * @returns The lines that start with {@link RIG_WARNING}, in their order.
 */
export function rigWarnings(log: string): string[] {
  return log.split('\n').filter((line) => line.startsWith(RIG_WARNING));
}

/**
 * Gives the cause of a failed run of Blender from its error output: the last line that is not
 * empty, such as the message of `SystemExit` or the last line of a Python traceback.
 *
 * @param errors The error output of Blender.
 * @returns The line, or `null` when the output has no line.
 */
export function blenderCause(errors: string): string | null {
  const lines = errors
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.at(-1) ?? null;
}

/**
 * Runs the rig script of Blender, and prints and gives the lines of its log. Its error output goes to the
 * error output of the tool at once, and the message of a failure ends with its last line
 * ({@link blenderCause}), so that the table of `--check` gives the cause. A stop signal (INT or
 * TERM) stops Blender first (`tools/stop-cleanup.ts`).
 *
 * @param args The arguments of `blender` ({@link blenderArgs}).
 * @returns The lines of the log, each with the start `rig_mesh:`.
 * @throws Error if Blender fails.
 */
function runBlender(args: readonly string[]): Promise<string[]> {
  const blender = process.env['BLENDER'] ?? 'blender';
  return new Promise((done, fail) => {
    const child = trackChild(
      spawn(blender, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    let out = '';
    let errors = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (text: string) => {
      out += text;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => {
      errors += text;
      process.stderr.write(text);
    });
    child.on('error', fail);
    child.on('close', (code) => {
      const lines = out.split('\n').filter((l) => l.startsWith('rig_mesh:'));
      for (const line of lines) {
        console.log(line);
      }
      if (code === 0) {
        done(lines);
      } else {
        const cause = blenderCause(errors);
        fail(
          new Error(
            `${blender} failed with the status ${String(code)}${cause ? `: ${cause}` : '.'}`,
          ),
        );
      }
    });
  });
}

/**
 * Gives the SHA-256 of the bytes of a file, so that a check shows if a rig gives the bytes of the
 * GLB file in the repository.
 *
 * @param bytes The bytes.
 * @returns The hash, as hex.
 */
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The settings of the animal of a rig. */
export interface RigSettings {
  /** The settings of the export. */
  readonly settings: AnimalSettings;
  /** True when the settings come from `ANIMALS`. */
  readonly known: boolean;
}

/** A role of the app with the studio body of an animal. */
export interface AnimalRole {
  /** The role, a key of `FOLD_ROLES`. */
  readonly role: string;
  /** The species of the role with the body. */
  readonly species: string;
}

/**
 * Gives the settings of the animal of a rig: its entry of `ANIMALS`, or the scratch settings of a
 * seated role that also stands, at the shoulders of the config (`scratchSettings()` of
 * `tools/glb-swap.ts`).
 *
 * @param animal The animal.
 * @param config The config.
 * @param factor The factor of the landmark height of a variant ({@link keptHeight}), so that the
 *   variant keeps the meters for each unit of the base. The config of a variant already holds the
 *   factor in `app.shoulders` ({@link variantText}), so only the height of `ANIMALS` takes it.
 * @returns The settings, and true when they come from `ANIMALS`.
 */
export function rigSettings(animal: string, config: MeshRigConfig, factor = 1): RigSettings {
  const known = ANIMALS.get(animal);
  if (known) {
    return {
      settings: factor === 1 ? known : { ...known, height: known.height * factor },
      known: true,
    };
  }
  return { settings: scratchSettings(animal, config.app.shoulders), known: false };
}

/**
 * Gives the roles of the app with the studio body of an animal, with the species of each role
 * that has the body.
 *
 * @param animal The animal.
 * @returns The name and the species of each role.
 */
export function animalRoles(animal: string): AnimalRole[] {
  const own = animalSpecies(animal);
  return [...FOLD_ROLES].flatMap(([role, source]) => {
    const species = roleSpecies(source).find((s) => own.includes(s));
    return species && roleAnimal(source) === animal ? [{ role, species }] : [];
  });
}

/** The face-samples of the folded faces of one main bone. */
export interface BoneFolds {
  /** The main studio bone of the faces, as `pnpm fold-probe` gives it. */
  readonly bone: string;
  /** The total over the faces of the samples of all sets in which each face folds. */
  readonly samples: number;
}

/** A folded face with the samples of all sets in which it folds. */
export interface FaceFolds {
  /** The index of the triangle in the packed mesh, as `pnpm fold-probe` counts the faces. */
  readonly face: number;
  /** The samples of all sets in which the face folds. */
  readonly samples: number;
}

/** The folds of one role of the app with the body of a rig. */
export interface RoleFolds {
  /** The role, a key of `FOLD_ROLES`. */
  readonly role: string;
  /** The counts of each sample set of `pnpm fold-probe`. */
  readonly counts: FoldCounts;
  /** The main bones of the most folded faces ({@link foldBones}). */
  readonly bones: readonly BoneFolds[];
  /** The faces that fold in the most samples, for `--faces` ({@link topFaces}), or none. */
  readonly faces: readonly FaceFolds[];
  /** The faces of `--watch` with their shares of folded samples (`faceShares()`), or none. */
  readonly watched: readonly FaceShare[];
  /**
   * The SHA-256 of the corners of the faces of the mesh (`FaceJson.topology` of `pnpm fold-probe`):
   * two rigs with one topology give each face the same index.
   */
  readonly topology: string;
  /** The folded faces of `pnpm fold-probe --json`, with their middles in the bind pose. */
  readonly records: readonly FaceRecord[];
  /**
   * The middle of each face of `--watch` in the bind pose, in meters, by the index of the face
   * (`FaceJson.middles` of `pnpm fold-probe --middles`).
   */
  readonly middles: Readonly<Record<string, Vec3>>;
}

/** A face of `--watch` of the base with its share of folded samples in a variant. */
export interface WatchPair {
  /** The face of the base. */
  readonly face: number;
  /**
   * The folded face of the variant with the nearest middle within `SAME_FACE_DISTANCE`, or `null`
   * when no folded face of the variant is that near.
   */
  readonly paired: number | null;
  /** The share of the samples of each set in which the face of the variant folds. */
  readonly shares: FaceShare['shares'];
}

/**
 * Pairs the faces of `--watch` of the base with the faces of a variant whose mesh has other
 * corners, as `sameFaces()` of `pnpm fold-probe --base` pairs folded faces: the pairs go in the
 * order of the distance of their middles in the bind pose, the nearest first, up to
 * `SAME_FACE_DISTANCE`, and each face goes into one pair at most. A face of the base with no pair
 * folds in no sample of the variant.
 *
 * @param base The folds of the role in the base, with the middles of the watched faces.
 * @param variant The folds of the role in the variant.
 * @returns The pair of each watched face, in the order of the faces, or `null` when the base has
 *   no middle of a watched face.
 */
export function watchPairs(base: RoleFolds, variant: RoleFolds): WatchPair[] | null {
  const faces = base.watched.map(({ face }) => face);
  const middles = faces.map((face) => base.middles[String(face)]);
  if (middles.some((middle) => !middle)) {
    return null;
  }
  const candidates = faces.flatMap((face, k) =>
    variant.records.flatMap((record) => {
      const [x, y, z] = middles[k] ?? [0, 0, 0];
      const [a, b, c] = record.middle;
      const gap = Math.hypot(a - x, b - y, c - z);
      return gap <= SAME_FACE_DISTANCE ? [{ face, record, gap }] : [];
    }),
  );
  const pairs = new Map<number, FaceRecord>();
  const taken = new Set<number>();
  for (const { face, record } of candidates.toSorted(
    (p, q) => p.gap - q.gap || p.face - q.face || p.record.face - q.record.face,
  )) {
    if (!pairs.has(face) && !taken.has(record.face)) {
      pairs.set(face, record);
      taken.add(record.face);
    }
  }
  const samples = {
    rest: variant.counts.rest.samples,
    play: variant.counts.play.samples,
    lift: variant.counts.lift.samples,
  };
  return faceShares(samples, (face) => pairs.get(face)?.folds, faces).map((share) => ({
    face: share.face,
    paired: pairs.get(share.face)?.face ?? null,
    shares: share.shares,
  }));
}

/**
 * Gives the share of the samples of each set in which each face of `--watch` folds
 * (`faceShares()` of `tools/face-shares.ts`). A face that folds in no sample is not in the JSON
 * text of `pnpm fold-probe`, so its shares are 0.
 *
 * @param counts The counts of each sample set of `pnpm fold-probe --json`.
 * @param faces The folded faces of `pnpm fold-probe --json`.
 * @param watch The indices of the faces of `--watch`.
 * @returns The watched faces, in the order of `--watch`.
 */
export function watchFaces(
  counts: FoldCounts,
  faces: readonly FaceRecord[],
  watch: readonly number[],
): FaceShare[] {
  const samples = {
    rest: counts.rest.samples,
    play: counts.play.samples,
    lift: counts.lift.samples,
  };
  return faceShares(samples, (face) => faces.find((f) => f.face === face)?.folds, watch);
}

/** The number of main bones of the folds of each role in the table of `--check`. */
export const FOLD_BONES = 3;

/**
 * Gives the main bones of the folded faces of a role with the most face-samples: for each main
 * bone, the total over its faces of the samples of all sets in which each face folds. Thus the
 * table of the variants shows which bone gives the new folds of a variant.
 *
 * @param faces The folded faces of `pnpm fold-probe --json`.
 * @param count The number of bones.
 * @returns The bones with the most face-samples, the most first, and of two bones with the same
 *   total, the first name in alphabetical order first.
 */
export function foldBones(faces: readonly FaceRecord[], count = FOLD_BONES): BoneFolds[] {
  const totals = new Map<string, number>();
  for (const face of faces) {
    const samples = SAMPLE_SETS.reduce((sum, set) => sum + face.folds[set], 0);
    totals.set(face.bone, (totals.get(face.bone) ?? 0) + samples);
  }
  return [...totals]
    .filter(([, samples]) => samples > 0)
    .map(([bone, samples]) => ({ bone, samples }))
    .toSorted((a, b) => b.samples - a.samples || a.bone.localeCompare(b.bone))
    .slice(0, count);
}

/**
 * Gives the faces that fold in the most samples of all sets, for the column of `--faces`.
 *
 * @param faces The folded faces of `pnpm fold-probe --json`.
 * @param count The number of faces.
 * @returns The faces, the most samples first, and of two faces with the same samples, the lower
 *   index first.
 */
export function topFaces(faces: readonly FaceRecord[], count: number): FaceFolds[] {
  return faces
    .map((face) => ({
      face: face.face,
      samples: SAMPLE_SETS.reduce((sum, set) => sum + face.folds[set], 0),
    }))
    .filter((face) => face.samples > 0)
    .toSorted((a, b) => b.samples - a.samples || a.face - b.face)
    .slice(0, count);
}

/**
 * The faces that one corrective shape of `raise` turns over in the pose of its rule, before and
 * after its relax (`raise_shape()` of `tools/blender/rig_mesh.py`). A relax that leaves a face
 * turned failed.
 */
export interface RaiseTurns {
  /** The name of the shape, such as `arm_raise_R`. */
  readonly name: string;
  /** The faces of the module that turn over before the relax. */
  readonly before: readonly number[];
  /** The faces of the module that stay turned over after the relax. */
  readonly after: readonly number[];
}

/**
 * Reads the faces that each shape of `raise` turns over from the log of the rig script: its lines
 * `raise <shape>: ... (faces of the module before [..], after [..])`.
 *
 * @param lines The lines of the log.
 * @returns The faces of each shape, in the order of the log.
 */
export function raiseTurns(lines: readonly string[]): RaiseTurns[] {
  const faces = (text: string): number[] =>
    text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map(Number);
  return lines.flatMap((line) => {
    const found =
      /^rig_mesh: raise (\S+): .*\(faces of the module before \[([^\]]*)\], after \[([^\]]*)\]\)$/.exec(
        line,
      );
    return found
      ? [{ name: found[1] ?? '', before: faces(found[2] ?? ''), after: faces(found[3] ?? '') }]
      : [];
  });
}

/** The measures of one rig of `--check`, for the table of the variants. */
export interface CheckMeasures {
  /** The triangles of the packed mesh. */
  readonly triangles: number;
  /** The size of the packed mesh after gzip, in bytes. */
  readonly meshGzip: number;
  /** The meters for each unit of the rig. */
  readonly scale: number;
  /** The height of the seat, in meters, or `null` for a body that stands. */
  readonly seat: number | null;
  /** The seat that fits the legs, in meters, or `null` for a body that stands. */
  readonly legSeat: number | null;
  /** The depth of the chair, in meters, or `null`. */
  readonly chair: number | null;
  /** The arm of each side from the shoulder joint to the middle of the palm, in meters. */
  readonly reach: Readonly<Record<Side, number | null>>;
  /** The largest error of the standing body against the long-armed source, in meters. */
  readonly standing: number;
  /** The faces that each shape of `raise` leaves turned over ({@link raiseTurns}). */
  readonly raises: readonly RaiseTurns[];
  /** The folds of each role of the animal. */
  readonly folds: readonly RoleFolds[];
  /**
   * The form of the players of each role and the stage side of each demo in the app with the body
   * of the rig (`tools/rig-form.ts`), or `null` when no role of the app has the body.
   */
  readonly form: FormJson | null;
}

/** One row of the table of `--check`: a variant and its measures or its failure. */
export interface CheckRow {
  /** The changes of the variant, or empty for the base. */
  readonly variant: string;
  /** The measures, or `null` when the variant failed. */
  readonly measures: CheckMeasures | null;
  /** The message of the failure, or `null`. */
  readonly error: string | null;
}

/**
 * Writes the faces that each shape of `raise` leaves turned over after its relax, such as
 * `arm_raise_R: 434, 436 FAIL / arm_raise_L: none`.
 *
 * @param raises The shapes of `raise`.
 * @returns The text, or `none` with no shape.
 */
export function raisesCell(raises: readonly RaiseTurns[]): string {
  const texts = raises.map(
    ({ name, after }) => `${name}: ${after.length > 0 ? `${after.join(', ')} FAIL` : 'none'}`,
  );
  return texts.join(' / ') || 'none';
}

/**
 * Writes the table of the variants of `--check`: one row for each variant, with the triangles, the
 * gzip size of the packed mesh, the scale, the seat, the seat of the legs, the chair depth, the
 * reach of each arm, the error of the
 * standing body, the share of the samples with a fold in the play, the lift, and the rest pose
 * of each role, and the main bones of the most folded faces of each role with their face-samples
 * ({@link foldBones}). With `--faces`, a column of each role gives the faces that fold in the most
 * samples ({@link topFaces}). The last column gives the faces that each shape of `raise` leaves
 * turned over, with the mark `FAIL` of a failed relax ({@link raisesCell}). A variant that failed
 * gives its message.
 *
 * @param rows The rows, the base first.
 * @returns The lines.
 */
export function checkTable(rows: readonly CheckRow[]): string[] {
  const roles = [
    ...new Set(rows.flatMap((row) => row.measures?.folds.map((fold) => fold.role) ?? [])),
  ];
  const sets = ['play', 'lift', 'rest'] as const satisfies readonly (typeof SAMPLE_SETS)[number][];
  const withFaces = rows.some((row) => row.measures?.folds.some((fold) => fold.faces.length > 0));
  const withRaises = rows.some((row) => (row.measures?.raises.length ?? 0) > 0);
  const header = [
    'Variant',
    'Triangles',
    'Mesh gzip B',
    'Scale m/u',
    'Seat m',
    'Leg seat m',
    'Chair m',
    'Reach L m',
    'Reach R m',
    'Standing mm',
    ...roles.flatMap((role) => sets.map((set) => `${role} ${set}`)),
    ...roles.map((role) => `${role} bones`),
    ...(withFaces ? roles.map((role) => `${role} faces`) : []),
    ...(withRaises ? ['Shapes: faces left turned'] : []),
  ];
  const m = (value: number | null): string => (value === null ? 'none' : value.toFixed(3));
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const { variant, measures, error } of rows) {
    if (!measures) {
      const cells = header.slice(2).map(() => '-');
      lines.push(
        `| ${variant || 'base'} | failed: ${error ?? 'no measures'} | ${cells.join(' | ')} |`,
      );
      continue;
    }
    const folds = roles.flatMap((role) =>
      sets.map((set) => {
        const count = measures.folds.find((fold) => fold.role === role)?.counts[set];
        return count ? `${((100 * count.withFold) / Math.max(1, count.samples)).toFixed(1)}%` : '-';
      }),
    );
    const bones = roles.map((role) => {
      const fold = measures.folds.find((f) => f.role === role);
      if (!fold) {
        return '-';
      }
      return fold.bones.map(({ bone, samples }) => `${bone} ${samples}`).join(', ') || 'none';
    });
    const faces = roles.map((role) => {
      const fold = measures.folds.find((f) => f.role === role);
      if (!fold) {
        return '-';
      }
      return fold.faces.map(({ face, samples }) => `${face} ${samples}`).join(', ') || 'none';
    });
    const cells = [
      variant || 'base',
      String(measures.triangles),
      String(measures.meshGzip),
      measures.scale.toFixed(4),
      m(measures.seat),
      m(measures.legSeat),
      m(measures.chair),
      m(measures.reach.L),
      m(measures.reach.R),
      (measures.standing * 1000).toFixed(3),
      ...folds,
      ...bones,
      ...(withFaces ? faces : []),
      ...(withRaises ? [raisesCell(measures.raises)] : []),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Writes the table of the faces of `--watch`: one row for each variant and role, and one column
 * for each face, with the share of the samples in which the face folds in the play, the lift, and
 * the rest. A role of a variant whose mesh has another topology than the mesh of the base, such as
 * after a `cut` or a ring, gets the mark `other mesh`, because a face index then names another
 * face. Its cells give the folded face of the variant with the nearest middle ({@link watchPairs})
 * and its index, or `none` when no folded face is within `SAME_FACE_DISTANCE`.
 *
 * @param rows The rows, the base first.
 * @returns The lines, or none when no role has a watched face.
 */
export function watchLines(rows: readonly CheckRow[]): string[] {
  const faces = rows.flatMap((row) => row.measures?.folds ?? []).at(0)?.watched ?? [];
  if (faces.length === 0) {
    return [];
  }

  const header = ['Variant', 'Role', ...faces.map(({ face }) => `Face ${face}`)];
  const lines = [
    'Watched faces: the share of the samples in which each face folds (play / lift / rest).',
    '',
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
  ];
  const base = rows[0]?.measures?.folds ?? [];
  const text = (shares: FaceShare['shares']): string =>
    (['play', 'lift', 'rest'] as const).map((set) => foldShareText(shares[set])).join(' / ');
  for (const { variant, measures } of rows) {
    for (const fold of measures?.folds ?? []) {
      const own = base.find((b) => b.role === fold.role);
      const other = own !== undefined && own.topology !== fold.topology;
      const pairs = own && other ? watchPairs(own, fold) : null;
      const mark = other ? ` (other mesh${pairs ? ', paired by the middle' : ''})` : '';
      const cells = pairs
        ? pairs.map(
            ({ shares, paired }) => `${text(shares)} (${paired === null ? 'none' : paired})`,
          )
        : fold.watched.map(({ shares }) => text(shares));
      lines.push(`| ${variant || 'base'} | ${fold.role}${mark} | ${cells.join(' | ')} |`);
    }
  }
  return lines;
}

/** The commit that the form of the players and the stage sides of `--check` compare with. */
export const FORM_BASE = 'main';

/**
 * Gives the arguments of `tools/rig-form.ts` for the roles of an animal: one `--player` with the
 * species and the instrument of each role of a player. The conductor has no instrument, so it has
 * no player.
 *
 * @param roles The roles of the animal ({@link animalRoles}).
 * @returns The arguments, such as `--player fox-red:violin`.
 */
export function playerArgs(roles: readonly AnimalRole[]): string[] {
  return roles.flatMap(({ role, species }) => {
    const source = FOLD_ROLES.get(role);
    return source?.kind === 'player' ? ['--player', `${species}:${source.instrument}`] : [];
  });
}

/**
 * Writes a value in meters with its difference from the value of the commit.
 *
 * @param value The value.
 * @param base The value of the commit, or `undefined` with no commit.
 * @returns The text, such as `1.637 (+0.050)`.
 */
function againstBase(value: number, base: number | undefined): string {
  if (base === undefined) {
    return value.toFixed(3);
  }
  const change = value - base;
  return `${value.toFixed(3)} (${change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(3)})`;
}

/**
 * The move of a hold anchor from the commit {@link FORM_BASE} above which the table of the anchors
 * marks it, in meters. A move of the head center of 1.71 cm in the fox rig changes the layout,
 * because it takes the violin with it.
 */
export const ANCHOR_MARK = 0.001;

/**
 * Gives the move of a point from its place on the commit.
 *
 * @param point The point, or `null`.
 * @param old The point on the commit, or `null` or `undefined` when the commit has none.
 * @returns The distance, in meters, or `null` when either point is missing.
 */
export function pointMove(point: Vec3 | null, old: Vec3 | null | undefined): number | null {
  return point && old ? distance(point, old) : null;
}

/**
 * Gives the move of a box from its place on the commit: the larger move of its two corners.
 *
 * @param box The box, or `null`.
 * @param old The box on the commit, or `null` or `undefined` when the commit has none.
 * @returns The move, in meters, or `null` when either box is missing.
 */
export function boxMove(box: Bounds | null, old: Bounds | null | undefined): number | null {
  return box && old ? Math.max(distance(box.min, old.min), distance(box.max, old.max)) : null;
}

/**
 * Writes the move of a hold anchor in millimeters, with the mark `MOVED` above
 * {@link ANCHOR_MARK}.
 *
 * @param move The move, in meters, or `null` with no value of the commit.
 * @param sign True to write the sign of a change of a length.
 * @returns The text, such as ` (17.1 mm MOVED)`, or empty with no move.
 */
function moveText(move: number | null, sign = false): string {
  if (move === null) {
    return '';
  }
  const mark = Math.abs(move) > ANCHOR_MARK ? ' MOVED' : '';
  const plus = sign && move >= 0 ? '+' : '';
  return ` (${plus}${(move * 1000).toFixed(1)} mm${mark})`;
}

/**
 * Writes a point in meters.
 *
 * @param point The point.
 * @returns The text, such as `(0.000, 1.234, -0.056)`.
 */
function pointText(point: Vec3): string {
  return `(${point.map((x) => x.toFixed(3)).join(', ')})`;
}

/**
 * Writes the hold anchors of a player against the commit: the head center, the head height, the
 * nose, and the box of the instrument (`tools/rig-form.ts`), each with its move from the commit
 * and the mark `MOVED` above {@link ANCHOR_MARK}. A point moves by its distance, a box by the
 * larger move of its corners, and the head height by its change.
 *
 * @param player The form of the player.
 * @param old The form of the same player on the commit, or `undefined` for none.
 * @returns The four cells.
 */
export function anchorCells(player: PlayerForm, old: PlayerForm | undefined): string[] {
  const box = player.instrumentBox;
  return [
    `${pointText(player.headCenter)}${moveText(pointMove(player.headCenter, old?.headCenter))}`,
    `${player.headHeight.toFixed(3)}${moveText(old ? player.headHeight - old.headHeight : null, true)}`,
    player.nose
      ? `${pointText(player.nose)}${moveText(pointMove(player.nose, old?.nose))}`
      : 'none',
    box
      ? `${pointText(box.min)} to ${pointText(box.max)}${moveText(boxMove(box, old?.instrumentBox))}`
      : 'none',
  ];
}

/**
 * Writes the form of the players and the stage sides of the variants of `--check` against the
 * commit {@link FORM_BASE}: a table of the seat, the visible head, the standing and the seated
 * head tops, and the footprint of each player, a table of the hold anchors of each player
 * ({@link anchorCells}), and a table of the stage side of each demo, with the largest change of
 * each variant (`none` below 0.05%). Each value has its difference from the commit. A variant
 * with no form has no rows.
 *
 * @param rows The rows of the variants, the base first.
 * @param base The form of the commit, or `null` when its probe failed.
 * @returns The lines, or none when no row has a form.
 */
export function formLines(rows: readonly CheckRow[], base: FormJson | null): string[] {
  const forms = rows.flatMap((row) =>
    row.measures?.form ? [{ variant: row.variant || 'base', form: row.measures.form }] : [],
  );
  if (forms.length === 0) {
    return [];
  }

  const label = base ? FORM_BASE : 'no commit';
  const lines = [
    `Form of the players against ${label} (each value with its difference from ${label}):`,
    '',
    '| Variant | Player | Seat m | Visible head m | Standing head top m | Seated head top m | Footprint m |',
    '|---|---|---|---|---|---|---|',
  ];
  const same = (a: PlayerForm, b: PlayerForm): boolean =>
    a.species === b.species && a.instrument === b.instrument;
  const playerRow = (variant: string, player: PlayerForm, old: PlayerForm | undefined): string =>
    `| ${variant} | ${player.species} ${player.instrument} | ${againstBase(player.seat, old?.seat)} | ${againstBase(player.visibleHead, old?.visibleHead)} | ${againstBase(player.standingTop, old?.standingTop)} | ${againstBase(player.seatedTop, old?.seatedTop)} | ${againstBase(player.width, old?.width)} by ${againstBase(player.depth, old?.depth)} |`;
  for (const player of base?.players ?? []) {
    lines.push(playerRow(FORM_BASE, player, undefined));
  }
  for (const { variant, form } of forms) {
    for (const player of form.players) {
      lines.push(
        playerRow(
          variant,
          player,
          base?.players.find((p) => same(p, player)),
        ),
      );
    }
  }

  lines.push(
    '',
    `Hold anchors of the seated players against ${label} (each move from ${label} in mm, MOVED above ${ANCHOR_MARK * 1000} mm):`,
    '',
    '| Variant | Player | Head center m | Head height m | Nose m | Instrument box m |',
    '|---|---|---|---|---|---|',
  );
  const anchorRow = (variant: string, player: PlayerForm, old: PlayerForm | undefined): string =>
    `| ${variant} | ${player.species} ${player.instrument} | ${anchorCells(player, old).join(' | ')} |`;
  for (const player of base?.players ?? []) {
    lines.push(anchorRow(FORM_BASE, player, undefined));
  }
  for (const { variant, form } of forms) {
    for (const player of form.players) {
      lines.push(
        anchorRow(
          variant,
          player,
          base?.players.find((p) => same(p, player)),
        ),
      );
    }
  }

  const demos = forms[0]?.form.stages.map((stage) => stage.demo) ?? [];
  const sideOf = (form: FormJson | null | undefined, demo: string): number | undefined =>
    form?.stages.find((stage) => stage.demo === demo)?.side;
  const share = (side: number, old: number | undefined): number | null =>
    old === undefined ? null : (100 * (side - old)) / old;
  const percent = (value: number): string =>
    `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}%`;
  const shareText = (value: number | null): string =>
    value === null ? '' : ` (${percent(value)})`;
  lines.push(
    '',
    `Stage side of each demo against ${label}:`,
    '',
    `| Demo | ${base ? `${FORM_BASE} m | ` : ''}${forms.map((f) => f.variant).join(' | ')} |`,
    `|---|${base ? '---|' : ''}${forms.map(() => '---').join('|')}|`,
  );
  for (const demo of demos) {
    const old = sideOf(base, demo);
    const cells = forms.map(({ form }) => {
      const side = sideOf(form, demo);
      return side === undefined ? '-' : `${side.toFixed(3)}${shareText(share(side, old))}`;
    });
    lines.push(
      `| ${demo} | ${base ? `${old === undefined ? '-' : old.toFixed(3)} | ` : ''}${cells.join(' | ')} |`,
    );
  }
  if (base) {
    const largest = forms.map(({ form }) => {
      const changes = form.stages.flatMap((stage) => {
        const value = share(stage.side, sideOf(base, stage.demo));
        return value === null ? [] : [{ demo: stage.demo, value }];
      });
      const [top] = changes.toSorted((a, b) => Math.abs(b.value) - Math.abs(a.value));
      if (!top) {
        return '-';
      }
      return Math.abs(top.value) < 0.05 ? 'none' : `${percent(top.value)} ${top.demo}`;
    });
    lines.push(`| Largest change | | ${largest.join(' | ')} |`);
  }
  return lines;
}

/**
 * Measures the form of the players of an animal and the stage sides on the commit
 * {@link FORM_BASE}: `tools/rig-form.ts` of the working tree runs in a probe tree of the commit
 * (`tools/ref-tree.ts`), in place of the script of the commit. The script imports only the code of
 * the app and the demo patches, so it runs on the source of the commit, and both tables have one
 * format with the same measures. It runs before the first rig, so that only the stop of the probe
 * tree is on during the run.
 *
 * @param args The players of the roles ({@link playerArgs}).
 * @returns The form, or `null` when the probe fails. The message of the failure goes to the
 *   error output.
 */
async function baseForm(args: readonly string[]): Promise<FormJson | null> {
  try {
    return await withProbeTree(
      FORM_BASE,
      async (dir) => {
        copyFileSync(join(ROOT, 'tools', 'rig-form.ts'), join(dir, 'tools', 'rig-form.ts'));
        const file = join(dir, 'form.json');
        await runChild(
          process.execPath,
          [join('tools', 'rig-form.ts'), ...args, '--json', file],
          dir,
        );
        const text = await readFile(file, 'utf8');
        checkFormat('rig-form.ts', FORM_BASE, formatVersion(text), FORM_FORMAT);
        return readFormJson(text);
      },
      { prefix: 'rig-form-' },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `The form of ${FORM_BASE} failed, so the tables have no values of it: ${message}`,
    );
    return null;
  }
}

/**
 * Checks that the source file of a config exists, before Blender starts. For a missing file,
 * Blender prints only "Please select a file", and the rig fails with no clear cause.
 *
 * @param config The config.
 * @param label The name of the config in the message, such as `tools/mesh-rigs/deer.json` or
 *   `--set source=scratch/glb/deer.glb`.
 * @returns The absolute path of the source file.
 * @throws Error that names the path of the config and the absolute path, if no file exists there.
 */
export function checkSource(config: MeshRigConfig, label: string): string {
  const path = resolve(ROOT, config.source);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(
      `The source file "${config.source}" of ${label} does not exist at ${path}. A relative path of source starts at the root of the repository, such as scratch/glb/deer.glb.`,
    );
  }
  return path;
}

/**
 * Gives the JSON text of the config of each row of `--check`: the text of the base as the tool
 * read it, then the text of each variant from it ({@link variantText}). The base and the variants
 * thus come from one read of the config file, and each variant fits before the first rig.
 *
 * @param text The JSON text of the config, read one time at the start.
 * @param sets The variants of `--set`.
 * @param known True for an animal of `ANIMALS` of `tools/studio-body.ts`.
 * @returns The text of the base, then the text of each variant.
 * @throws Error if a variant does not fit.
 */
export function checkTexts(text: string, sets: readonly string[], known: boolean): string[] {
  return [text, ...sets.map((set) => variantText(text, set, known))];
}

/**
 * Rigs a mesh into a temporary folder and measures the rig, with no write into the repository
 * (`--check`). The JSON text of the config goes into the folder, and the rig reads it from there,
 * so that the base and each variant read the text that the tool read at its start. The app checks run on a copy of `src/` with the body of the rig: the violin by the rule
 * of a violin shop for the violinist, and the folds and the tail gaps (`tools/tail-gap.ts`) of each
 * role of the animal. The folder goes
 * away at the end, also after a failure. After a stop (INT or TERM), `tools/stop-cleanup.ts` stops
 * Blender and the probes first, then removes the folder.
 *
 * @param animal The animal.
 * @param text The JSON text of the config of the base or of a variant ({@link variantText}).
 * @param preview The folder of the preview images, or `null`.
 * @param factor The factor of the landmark height of the variant ({@link keptHeight}).
 * @param probe The options of the app checks: the roles, the play step, the demos, and the faces.
 * @param keep The file into which the tool copies the GLB file of the rig (`--keep`), with its
 *   corners beside it ({@link keptCorners}), or `null`.
 * @returns The measures.
 * @throws Error if the config has no rule of the thin faces, if the rig fails, if it is above the
 *   triangle budget, or if a probe fails.
 */
async function checkRig(
  animal: string,
  text: string,
  preview: string | null,
  factor: number,
  probe: CheckProbe,
  keep: string | null = null,
): Promise<CheckMeasures> {
  const config = parseConfig(text);
  const thin = config.check?.thin;
  if (!thin) {
    throw new Error(`The config of ${animal} has no check.thin: angle, length, and near.`);
  }
  console.log(reachLine(config));

  const dir = mkdtempSync(join(tmpdir(), 'rig-mesh-check-'));
  const release = trackFolder(dir);
  try {
    const path = join(dir, `${animal}.json`);
    await writeFile(path, text);
    const output = join(dir, `${animal}.rig.glb`);
    const obj = join(dir, 'source-long-arms.obj');
    const corners = keep ? join(dir, 'corners.json') : null;
    const log = await runBlender(blenderArgs(path, output, preview, obj, corners));
    const bytes = new Uint8Array(await readFile(output));
    console.log(`Rig: ${bytes.byteLength} B, sha256 ${sha256(bytes)}.`);
    if (keep && corners) {
      await mkdir(dirname(keep), { recursive: true });
      copyFileSync(output, keep);
      copyFileSync(corners, keptCorners(keep));
      console.log(`Kept the rig as ${keep}, with its corners for pnpm arm-look.`);
    }
    const { settings, known } = rigSettings(animal, config, factor);
    if (!known) {
      console.log(`ANIMALS has no ${animal}, so the check takes a seated role that also stands.`);
    }
    if (factor !== 1) {
      console.log(
        `The shoulder joints move by the factor ${factor.toFixed(4)}, and the landmark of the scale moves with them to ${settings.height.toFixed(4)} m, so the variant keeps the meters for each unit of the base.`,
      );
    }

    const measures = measureRig(bytes, config.output, settings, await readFile(obj, 'utf8'), thin);
    console.log(triangleLine(measures.triangles));
    const module = join(dir, `${animal}.ts`);
    await writeStudioModule(module, animal, settings.constant, measures.body);
    console.log(measureLines(measures, await readFile(module, 'utf8'), thin).join('\n'));
    // The intake check of the seams: a role that only sits gets the standing pose of the export.
    const stance = studioBody(bytes, config.output, { ...settings, seated: true, soloist: true });
    console.log(gapLines(animal, armGaps(stance.body)).join('\n'));
    const result = {
      triangles: measures.triangles,
      meshGzip: gzipSize(measures.body.mesh),
      scale: measures.body.scale,
      seat: measures.body.seatHeight,
      legSeat: measures.legSeat,
      chair: measures.body.chairDepth,
      reach: measures.arms,
      standing: measures.standing.worst,
      raises: raiseTurns(log),
    };

    const roles = known ? chooseRoles(animalRoles(animal), probe.roles) : [];
    if (roles.length === 0) {
      console.log(`No role of the app has the body of ${animal}, so the app checks do not run.`);
      return { ...result, folds: [], form: null };
    }
    const folds: RoleFolds[] = [];
    let form: FormJson | null = null;
    // The copy takes the settings of the measures, so that the app checks of a variant keep the
    // meters for each unit of the base too.
    const own = { ...settings, glb: relative(ROOT, output) };
    await withGlbBody(
      animal,
      output,
      async (copy) => {
        const formFile = join(dir, 'form.json');
        const formCode = await runTool(copy, 'rig-form.ts', [
          ...playerArgs(roles),
          '--json',
          formFile,
        ]);
        if (formCode !== 0) {
          throw new Error(`rig-form.ts failed with the status ${formCode}.`);
        }
        form = readFormJson(await readFile(formFile, 'utf8'));
        for (const { role, species } of roles) {
          const json = join(dir, `folds-${role}.json`);
          const runs: [string, string[]][] = [
            ['fold-probe.ts', foldArgs(role, json, probe)],
            ['tail-gap.ts', [role]],
          ];
          const source = FOLD_ROLES.get(role);
          if (source?.kind === 'player' && source.instrument === 'violin') {
            runs.unshift(['hold-reach.ts', [species]]);
          }
          for (const [script, args] of runs) {
            console.log(`\n${script.replace('.ts', '')} ${args[0]} with the body of the rig:`);
            const code = await runTool(copy, script, args);
            if (code !== 0) {
              throw new Error(`${script} failed with the status ${code}.`);
            }
          }
          const read = readFaceJson(await readFile(json, 'utf8'));
          folds.push({
            role,
            counts: read.sets,
            bones: foldBones(read.faces),
            faces: topFaces(read.faces, probe.faces),
            watched: watchFaces(read.sets, read.faces, probe.watch),
            topology: read.topology,
            records: read.faces,
            middles: read.middles,
          });
        }
      },
      tmpdir(),
      own,
    );
    return { ...result, folds, form };
  } finally {
    await rm(dir, { recursive: true, force: true });
    release();
  }
}

/**
 * Checks the base and each variant of the config of an animal, one rig at a time, and prints the
 * table of the variants ({@link checkTable}). Each variant must fit ({@link variantText}) and
 * name a source file that exists ({@link checkSource}) before the first rig, and it keeps the
 * meters for each unit of the base ({@link keptHeight}). The tool names the new keys of each
 * variant ({@link newKeys}) before the first rig. Before the first rig, the form of the players
 * on the commit {@link FORM_BASE} comes from a probe tree, and the tables of the form and of the
 * stage sides follow the table of the variants ({@link formLines}). A variant whose rig or probe
 * fails prints its message, and the next variant runs. With `noBase`, the base config gets no rig
 * and no probe, which saves about half of the time of a check of one variant. The variants still
 * keep the meters for each unit of the base, and the first variant takes the place of the base in
 * the table of the watched faces ({@link watchLines}).
 *
 * @param animal The animal.
 * @param text The JSON text of the config, read one time at the start.
 * @param sets The variants of `--set`.
 * @param preview The folder of the preview images, or `null`. With variants, each rig writes into
 *   a folder of its own in it: `base`, `variant-1`, and so on.
 * @param probe The options of the app checks. The roles of `--roles` also choose the players of
 *   the form tables.
 * @param keep The folder of `--keep`, into which each rig goes as `base.glb`, `variant-1.glb`,
 *   and so on, each with its corners file, or `null`.
 * @param noBase True for `--no-base`: only the variants get a rig and the probes.
 * @returns True when each variant passed.
 * @throws Error if a variant does not fit or names no source file that exists, or if a role of
 *   `--roles` is not a role of the animal, before the first rig.
 */
async function checkVariants(
  animal: string,
  text: string,
  sets: readonly string[],
  preview: string | null,
  probe: CheckProbe,
  keep: string | null = null,
  noBase = false,
): Promise<boolean> {
  const texts = checkTexts(text, sets, ANIMALS.has(animal));
  for (const [k, set] of sets.entries()) {
    checkSource(parseConfig(texts[k + 1] ?? text), `--set ${set}`);
  }
  for (const set of sets) {
    const added = newKeys(text, set);
    if (added.length > 0) {
      console.log(
        `The variant "${set}" adds the new keys ${added.join(', ')}. tools/blender/rig_mesh.py reads only the keys that it knows.`,
      );
    }
  }
  const base = parseConfig(text);
  const roles = chooseRoles(animalRoles(animal), probe.roles);
  const players = ANIMALS.has(animal) ? playerArgs(roles) : [];
  const form = players.length > 0 ? await baseForm(players) : null;
  const rows: CheckRow[] = [];
  for (const [k, variant] of ['', ...sets].entries()) {
    if (k === 0 && noBase) {
      console.log('The base config gets no rig and no probe (--no-base).');
      continue;
    }
    if (sets.length > 0) {
      console.log(`\n${variant || 'base'}:`);
    }
    const folder =
      preview && sets.length > 0 ? join(preview, k === 0 ? 'base' : `variant-${k}`) : preview;
    try {
      const own = texts[k] ?? text;
      const kept = keep ? join(keep, k === 0 ? 'base.glb' : `variant-${k}.glb`) : null;
      const measures = await checkRig(
        animal,
        own,
        folder,
        keptHeight(base, parseConfig(own)),
        probe,
        kept,
      );
      rows.push({ variant, measures, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      rows.push({ variant, measures: null, error: message });
    }
  }
  const watched = watchLines(rows);
  console.log(
    [
      '',
      ...checkTable(rows),
      ...(watched.length > 0 ? ['', ...watched] : []),
      '',
      ...formLines(rows, form),
    ].join('\n'),
  );
  return rows.every((row) => row.measures);
}

/**
 * Rigs the source mesh of an animal into the format of a studio body (`docs/agents/rigging.md`,
 * "The asset chain"):
 * `node tools/rig-mesh.ts <animal> [--preview <dir>] [--check [--set <changes>]...]`.
 * It checks the source file and the arm factor of `tools/mesh-rigs/<animal>.json`, and runs
 * `tools/blender/rig_mesh.py`, which writes the GLB file of the config. With `--preview`, the
 * script also writes the images of the rig into the folder. With `--check`, the rig goes into a
 * temporary folder, and the tool measures it with no write into the repository. Each `--set` of
 * `--check` is a variant of the config in memory, and the tool checks the base and each variant,
 * or only the variants with `--no-base`.
 * Blender comes from the environment variable `BLENDER`, or `blender` on the path.
 */
async function main(): Promise<void> {
  const { animal, preview, check, sets, probe, keep, noBase } = parseArgs(process.argv.slice(2));
  const configPath = join(CONFIG_DIR, `${animal}.json`);
  const text = await readFile(configPath, 'utf8');
  const config = parseConfig(text);
  const handRig = handRigOf(animal, config.output);
  if (handRig !== null) {
    throw new Error(
      `${handRig} is the rig of ${animal} (design 4.4, "Hand rig"). pnpm rig-export ${animal} writes ${config.output} from it, and pnpm rig-mesh does not rig this animal.`,
    );
  }
  checkSource(config, relative(ROOT, configPath));
  if (check) {
    if (!(await checkVariants(animal, text, sets, preview, probe, keep, noBase))) {
      process.exitCode = 1;
    }
    return;
  }
  const reach = checkReach(config);
  console.log(`Arm factor ${config.armFactor}: reach ${reach.toFixed(4)} m in the app.`);

  const output = join(ROOT, config.output);
  await runBlender(blenderArgs(configPath, output, preview));
  const bytes = await readFile(output);
  console.log(`Wrote ${config.output}: ${bytes.byteLength} B, sha256 ${sha256(bytes)}.`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
