import { MathUtils } from 'three';

import { KEY_PLACE, RIM_PLACE } from '../models/beam.ts';
import type { PlayerPlace } from '../models/layout.ts';
import { INSTRUMENT_COLORS, SCENE_COLORS, SPECIES_COLORS } from '../models/colors.ts';
import { FINISHES, srgb } from '../models/mesh.ts';
import { STAGE_COLORS } from '../models/props.ts';
import { OCCLUSION } from '../models/shading.ts';
import { SPECIES_IDS, isSpeciesId } from '../models/species.ts';
import { FREE_BEAM_FADE, SHOT_BEAM_OPACITY } from '../shots/beam-opacity.ts';
import { FREE_LIGHT_FADE, SHOT_LIGHT, SHOT_RIG, SHOT_SPOT } from '../shots/shot-light.ts';
import { BEAM_LOOK } from './beam.ts';
import { CAPTURE, ENVIRONMENT } from './environment.ts';
import { FREE_LENS, LENS } from './focus.ts';
import { GRADE } from './grade.ts';
import { GLOW_LIGHT, HALL_COLORS, HALL_FLOOR, HALL_LIGHT } from './hall.ts';
import { LIGHT_POOL } from './light-pool.ts';
import {
  BACK_ROW_LIGHT,
  CONDUCTOR_LIGHT,
  FILL,
  KEY_LIGHT,
  RIM_LIGHT,
  SIDE_LIGHT,
} from './lights.ts';
import { POST_LOOK, ROOM_HAZE } from './post.ts';
import { TIER_SETTINGS } from './quality.ts';
import { STAGE_TONE } from './renderer.ts';
import { SHOT_LOOK } from './shot-light.ts';
import { SOLO_LIGHT } from './solo-light.ts';
import { STAGE_BAKE } from './stage-bake.ts';
import { SIDE_GLOW, STAGE_FINISH, STAGE_SHADOW } from './stage.ts';

/**
 * The roots of the look paths: each exported light, pool, color, grade, tone, finish, haze, lens, and
 * beam constant of the scene (design 4.5). A look path starts with a root and names a value in it,
 * such as `BACK_ROW_LIGHT.illuminance` or `BACK_ROW_LIGHT.position.1`. The look override of the
 * dev server (`src/app/look-override.ts`), `pnpm look-variants`, and `pnpm light-probe` read this
 * list. A new constant of the look goes into it.
 */
const LOOK_ROOTS = {
  BACK_ROW_LIGHT,
  BEAM_LOOK,
  CAPTURE,
  CONDUCTOR_LIGHT,
  ENVIRONMENT,
  FILL,
  FINISHES,
  FREE_BEAM_FADE,
  FREE_LENS,
  FREE_LIGHT_FADE,
  GLOW_LIGHT,
  GRADE,
  HALL_COLORS,
  HALL_FLOOR,
  HALL_LIGHT,
  INSTRUMENT_COLORS,
  KEY_LIGHT,
  KEY_PLACE,
  LENS,
  LIGHT_POOL,
  OCCLUSION,
  POST_LOOK,
  RIM_LIGHT,
  RIM_PLACE,
  ROOM_HAZE,
  SCENE_COLORS,
  SHOT_BEAM_OPACITY,
  SHOT_LIGHT,
  SHOT_LOOK,
  SHOT_RIG,
  SHOT_SPOT,
  SIDE_GLOW,
  SIDE_LIGHT,
  SOLO_LIGHT,
  SPECIES_COLORS,
  STAGE_BAKE,
  STAGE_COLORS,
  STAGE_FINISH,
  STAGE_SHADOW,
  STAGE_TONE,
  TIER_SETTINGS,
} as const;

/**
 * The look paths that a module reads at its load, by the code that reads them. The override acts
 * after the load of the modules of {@link LOOK_ROOTS} and of their imports, so it refuses these
 * paths. `*` stands for one key. The other modules read the roots at use time, or they load after
 * the override, because `src/app/look-override.ts` is the first import of `src/main.ts`, such as
 * `CLOSE_DISTANCE_SHARE` of `shots/prepare.ts`. To change a refused value, read it at use time,
 * as `gradeLutDataSteps()` of `scene/grade.ts` reads the tone curve, and remove it from the list.
 */
const LOAD_TIME_PATHS: ReadonlyMap<string, string> = new Map([
  ['BEAM_LOOK.maxConcentration', '`BEAM_FRAGMENT` of `scene/beam.ts`'],
  ['STAGE_BAKE.offset', '`RECEIVER_FRAGMENT` of `scene/stage-bake.ts`'],
  ['STAGE_BAKE.bias', '`RECEIVER_FRAGMENT` of `scene/stage-bake.ts`'],
  ['STAGE_BAKE.skyReach', '`RECEIVER_FRAGMENT` of `scene/stage-bake.ts`'],
  ['FINISHES.*.crease', '`CREASE_COSINES` of `models/shading.ts`'],
]);

/** A value of a look path: a number, a flag, a text, or a list of such values. */
export type LookValue = number | boolean | string | readonly LookValue[];

/** The changes of a look: the new value of each look path. */
export type LookChanges = ReadonlyMap<string, LookValue>;

/** One change of a look path, with the old and the new value as JSON text. */
interface LookChange {
  /** The look path, such as `KEY_LIGHT.illuminance`. */
  readonly path: string;
  /** The old value. */
  readonly before: string;
  /** The new value. */
  readonly after: string;
}

/** A CSS hex color, such as `#ffca98`. */
const HEX_COLOR = /^#[\da-f]{6}$/i;

/** An angle in degrees, such as `14deg`. */
const DEGREES = /^(-?\d+(?:\.\d+)?)deg$/;

/**
 * Tells if a value is a value of a look path.
 *
 * @param value A value of JSON text or of a root.
 * @returns True for a finite number, a flag, a text, or a list of such values.
 */
function isLookValue(value: unknown): value is LookValue {
  if (value === true || value === false || Number.isFinite(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isLookValue(item));
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the JSON of a look override is an I/O boundary.
  return typeof value === 'string';
}

/**
 * Tells if a value of a look path is a number.
 *
 * @param value The value.
 * @returns True for a number.
 */
function isNumber(value: LookValue): value is number {
  return Number.isFinite(value);
}

/**
 * Tells if a value of a look path is a flag.
 *
 * @param value The value.
 * @returns True for `true` or `false`.
 */
function isFlag(value: LookValue): value is boolean {
  return value === true || value === false;
}

/**
 * Tells if a value of a look path is a text.
 *
 * @param value The value.
 * @returns True for a text.
 */
function isText(value: LookValue): value is string {
  return !isNumber(value) && !isFlag(value) && !isList(value);
}

/**
 * Tells if a value of a look path is a list.
 *
 * @param value The value.
 * @returns True for a list.
 */
function isList(value: LookValue): value is readonly LookValue[] {
  return Array.isArray(value);
}

/**
 * Reads the JSON text of a look override: an object of look paths and values.
 *
 * @param text The JSON text, such as `{"BACK_ROW_LIGHT.illuminance": 2.81}`.
 * @returns The changes.
 * @throws Error if the text is no JSON object of look values.
 */
export function parseLook(text: string): LookChanges {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`The look override is no JSON text: ${text}`, { cause: error });
  }
  if (!(parsed instanceof Object) || Array.isArray(parsed)) {
    throw new Error(`The look override is no JSON object of path -> value: ${text}`);
  }
  const changes = new Map<string, LookValue>();
  for (const [path, value] of Object.entries(parsed)) {
    if (!isLookValue(value)) {
      throw new Error(
        `The value of the look path ${path} is no number, flag, text, or list: ${JSON.stringify(value)}.`,
      );
    }
    changes.set(path, value);
  }
  return changes;
}

/**
 * Gives the value of a key of an object or a list.
 *
 * @param node The object or the list.
 * @param key The key, or the index of a list item as text.
 * @returns The entry of the key, or `undefined` if the node has no such key.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- a look path is an I/O boundary that walks any root.
function entryOf(node: object, key: string): [string, unknown] | undefined {
  return Object.entries(node).find(([k]) => k === key);
}

/**
 * Tells if a look path matches a pattern of {@link LOAD_TIME_PATHS}.
 *
 * @param keys The keys of the path.
 * @param pattern The pattern, with `*` for one key.
 * @returns True on a match.
 */
function matchesPattern(keys: readonly string[], pattern: string): boolean {
  const parts = pattern.split('.');
  return parts.length === keys.length && parts.every((part, i) => part === '*' || part === keys[i]);
}

/**
 * Gives the new value of a look path in the kind of its old value. A number takes a number, or
 * degrees such as `"14deg"`, which give radians. A flag takes a flag, and a text a text. A list of
 * numbers takes a list of the same length, or a CSS hex color for three numbers, which gives its
 * linear values (`srgb()` of `models/mesh.ts`). Another list takes a list of any length, with each
 * item in the kind of the old first item.
 *
 * @param path The look path, for the messages.
 * @param old The old value.
 * @param value The new value.
 * @returns The new value.
 * @throws Error if the new value does not fit the old value.
 */
function convert(path: string, old: LookValue, value: LookValue): LookValue {
  const got = JSON.stringify(value);
  if (isNumber(old)) {
    if (isNumber(value)) {
      return value;
    }
    const degrees = isText(value) ? DEGREES.exec(value) : null;
    if (degrees) {
      return Number(degrees[1]) * MathUtils.DEG2RAD;
    }
    throw new Error(`The look path ${path} takes a number, or degrees such as "14deg": ${got}.`);
  }
  if (isFlag(old)) {
    if (isFlag(value)) {
      return value;
    }
    throw new Error(`The look path ${path} takes true or false: ${got}.`);
  }
  if (isList(old)) {
    const numbers = old.every((item) => isNumber(item));
    if (numbers && old.length === 3 && isText(value) && HEX_COLOR.test(value)) {
      return srgb(value);
    }
    if (!isList(value)) {
      throw new Error(`The look path ${path} takes a list such as ${JSON.stringify(old)}: ${got}.`);
    }
    if (numbers) {
      if (value.length !== old.length || !value.every((item) => isNumber(item))) {
        throw new Error(`The look path ${path} takes a list of ${old.length} numbers: ${got}.`);
      }
      return value;
    }
    const first = old[0];
    if (first === undefined) {
      throw new Error(`The look path ${path} is an empty list, so it has no kind of item.`);
    }
    return value.map((item, i) => convert(`${path}.${i}`, first, item));
  }
  if (!isText(value)) {
    throw new Error(`The look path ${path} takes a text: ${got}.`);
  }
  if (HEX_COLOR.test(old) && !HEX_COLOR.test(value)) {
    throw new Error(`The look path ${path} takes a CSS hex color such as "#ffca98": ${got}.`);
  }
  return value;
}

/** A checked change of a look path: the place of its value and the new value. */
interface PlannedChange {
  /** The object or the list that holds the value, or `null` for a root that is a list. */
  readonly parent: object | null;
  /** The key of the value in its parent. */
  readonly key: string;
  /** The old value. */
  readonly old: LookValue;
  /** The new value. */
  readonly value: LookValue;
  /** The change, for the log. */
  readonly change: LookChange;
}

/** The place of the value of a look path. */
interface LookPlace {
  /** The object or the list that holds the value, or `null` for a root that is a list. */
  readonly parent: object | null;
  /** The key of the value in its parent. */
  readonly key: string;
  /** The value. */
  readonly old: LookValue;
}

/**
 * Finds the value of a look path.
 *
 * @param path The look path.
 * @returns The place of the value.
 * @throws Error that names the path for an unknown root or key, a path that names an object, or a
 *   path of {@link LOAD_TIME_PATHS}.
 */
function locate(path: string): LookPlace {
  const [first = '', ...keys] = path.split('.');
  const root = entryOf(LOOK_ROOTS, first)?.[1];
  if (!(root instanceof Object)) {
    const roots = Object.keys(LOOK_ROOTS).join(', ');
    throw new Error(`The look path ${path} has no known root. The roots are ${roots}.`);
  }
  const refused = [...LOAD_TIME_PATHS].find(([pattern]) =>
    matchesPattern([first, ...keys], pattern),
  );
  if (refused) {
    throw new Error(
      `The look path ${path} is read at the load of its module (${refused[1]}), before the override acts. Read it at use time first.`,
    );
  }

  let parent: object | null = null;
  let key = first;
  let walked = first;
  let node: unknown = root;
  for (const next of keys) {
    if (!(node instanceof Object)) {
      throw new Error(`The look path ${path} goes below ${walked}, which has no keys.`);
    }
    const entry = entryOf(node, next);
    if (!entry) {
      const known = Object.keys(node).join(', ');
      throw new Error(
        `The look path ${path} names no value: ${walked} has no key "${next}". The keys are ${known}.`,
      );
    }
    parent = node;
    key = next;
    walked = `${walked}.${next}`;
    node = entry[1];
  }
  if (!isLookValue(node)) {
    const example = node instanceof Object ? Object.keys(node)[0] : undefined;
    throw new Error(
      `The look path ${path} names an object. Give the path of a value in it, such as ${path}.${example ?? '<key>'}.`,
    );
  }
  return { parent, key, old: node };
}

/**
 * Gives the current value of a look path.
 *
 * @param path The look path, such as `BACK_ROW_LIGHT.illuminance`.
 * @returns The value.
 * @throws Error that names the path (see {@link applyLook}).
 */
export function lookValueAt(path: string): LookValue {
  return locate(path).old;
}

/**
 * Finds the value of a look path, and checks the new value.
 *
 * @param path The look path.
 * @param value The new value.
 * @returns The planned change.
 * @throws Error that names the path for an unknown root or key, a path that names an object, a
 *   path of {@link LOAD_TIME_PATHS}, or a value that does not fit the old value.
 */
function plan(path: string, value: LookValue): PlannedChange {
  const { parent, key, old } = locate(path);
  const converted = convert(path, old, value);
  return {
    parent,
    key,
    old,
    value: converted,
    change: { path, before: JSON.stringify(old), after: JSON.stringify(converted) },
  };
}

/**
 * Checks the changes of a look, and changes no value.
 *
 * @param changes The changes.
 * @returns The changes with their old and new values.
 * @throws Error that names the path of the first change that does not fit (see {@link applyLook}).
 */
export function checkLook(changes: LookChanges): LookChange[] {
  return [...changes].map(([path, value]) => plan(path, value).change);
}

/**
 * Changes the values of the look paths in the roots of {@link LOOK_ROOTS}. It checks each change
 * first, so a refused change changes no value. A list changes in place, so that a module that
 * keeps the list, such as `METAL` of `models/instruments/brass.ts`, sees the new items. The
 * modules read the other values at use time.
 *
 * @param changes The changes.
 * @returns The changes with their old and new values.
 * @throws Error that names the path for an unknown root or key, a path that names an object, a
 *   path that a module reads at its load ({@link LOAD_TIME_PATHS}), or a value that does not fit
 *   the old value.
 */
export function applyLook(changes: LookChanges): LookChange[] {
  const planned = [...changes].map(([path, value]) => plan(path, value));
  for (const { parent, key, old, value } of planned) {
    if (isList(old) && isList(value)) {
      // SAFETY: the roots are plain objects and lists, and `as const` makes them read-only only
      // for the type check.
      (old as LookValue[]).splice(0, old.length, ...value);
    } else if (parent) {
      Reflect.set(parent, key, value);
    }
  }
  return planned.map((item) => item.change);
}

/**
 * Gives the seats of a solo of the look tools: the query `solo` of the dev server
 * (`src/app/look-override.ts`) and the key `solo` of `pnpm look-variants`.
 *
 * @param text Seat indices of `Score.seats` and species, separated by commas, such as `13` or
 *   `panda,0`. A species gives each seat with a player of that species.
 * @param players The players of the layout.
 * @returns The seats, from the smallest, each one time.
 * @throws Error that names the item, for a seat with no player or a species with no seat.
 */
export function soloSeats(text: string, players: readonly PlayerPlace[]): number[] {
  const seats = new Set<number>();
  for (const item of text.split(',').map((part) => part.trim())) {
    const of = players.filter((p) =>
      /^\d+$/.test(item) ? p.cast.seatIndex === Number(item) : p.cast.species === item,
    );
    if (of.length === 0) {
      const kind = /^\d+$/.test(item)
        ? 'The seat has no player.'
        : isSpeciesId(item)
          ? 'No player of the layout has this species.'
          : `The species are ${SPECIES_IDS.join(', ')}.`;
      throw new Error(`The solo "${item}" names no seat of the layout. ${kind}`);
    }
    for (const p of of) {
      seats.add(p.cast.seatIndex);
    }
  }
  return [...seats].toSorted((a, b) => a - b);
}
