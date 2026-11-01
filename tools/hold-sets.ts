import { MathUtils } from 'three';

import { BOWED_HOLDS, SPECIES_HOLDS } from '../src/pose/bowed-rig.ts';
import type { BowVia, BowedHold } from '../src/pose/bowed-rig.ts';
import { CHOIR_HOLD } from '../src/pose/choir.ts';
import { CHOIR_MOTION } from '../src/pose/choir-notes.ts';
import { CONDUCTOR_HOLD, LEFT_HAND_PLACES } from '../src/pose/conductor.ts';
import { CHOIR_FOLDER } from '../src/models/instruments/folder.ts';
import {
  BASS_DRUM,
  SNARE_DRUM,
  SUSPENDED_CYMBAL,
  TAMBOURINE,
  TIMPANI,
  TRIANGLE,
  XYLOPHONE,
} from '../src/models/instruments/percussion.ts';
import { SCALE_PARAMS, SPECIES, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import type { CymbalForm } from '../src/models/instruments/types.ts';
import { HARP_PLACE } from '../src/models/instruments/harp.ts';
import { HANDS_HOLDS } from '../src/pose/hands.ts';
import type { HandAction } from '../src/pose/hand-notes.ts';
import {
  PERCUSSION_HOLDS,
  PERCUSSION_PLACES,
  SUSPENDED_CYMBAL_HOLD,
} from '../src/pose/percussion-rig.ts';
import type { HandsRule, MalletAcross, MalletSet, MalletTop } from '../src/pose/percussion-rig.ts';
import type { SideMove } from '../src/pose/side-move.ts';
import type { Fingering } from '../src/pose/wind-notes.ts';
import { IDENTITY } from '../src/models/tuples.ts';
import type { Quat } from '../src/models/tuples.ts';
import { SPECIES_WIND_HOLDS, holdTurn } from '../src/pose/winds.ts';
import type { FreePaw } from '../src/pose/winds.ts';

/**
 * The own holds of the species (`SPECIES_HOLDS` of the bowed strings and `SPECIES_WIND_HOLDS` of
 * the winds), by the root `<instrument>@<species>`, such as `violin@rabbit` or `flute@fox-tan`. A
 * species with an own hold does not use the hold of its instrument.
 */
const OWN_HOLDS = Object.fromEntries(
  [...Object.entries(SPECIES_HOLDS), ...Object.entries(SPECIES_WIND_HOLDS)].flatMap(
    ([species, holds]) =>
      Object.entries(holds ?? {}).map(([instrument, hold]) => [`${instrument}@${species}`, hold]),
  ),
);

/**
 * The holds that `--set` can change, by the first name of a path (design 5.3, 5.4). The tools
 * change the objects of the modules in memory, before they build a scene, and the source files
 * do not change. The rabbits hold the violin with a hold of their own: `violin` does not change
 * it, and `violin@rabbit` does. `kettles` changes the place of the kettles of the timpani
 * (`TIMPANI`), which the model of a scene reads when the tool builds it, `harpPlace` the place of
 * the harp at the player (`HARP_PLACE`) in the same way, and `percussion` the
 * places of the hands of a percussion player (`PERCUSSION_PLACES`). `bassDrum`, `snareDrum`,
 * `suspendedCymbal`, `tambourine`, `triangle`, and `bars` change the bass drum, the snare drum,
 * the suspended cymbal, the tambourine, the triangle, and the xylophone in the same way.
 * `suspended-cymbal` changes the hold of a species with a suspended cymbal
 * (`SpeciesParams.cymbalForm`), and `cymbals` the hold of the hand cymbals. `choir` changes the
 * hold of the flippers of a singer (`CHOIR_HOLD`), `choirMotion` the opening of the beak and the
 * lift of the head of a singer (`CHOIR_MOTION`), and `folder` the place of the choir folder
 * (`CHOIR_FOLDER`).
 */
const HOLDS = {
  piano: HANDS_HOLDS.piano,
  harp: HANDS_HOLDS.harp,
  violin: BOWED_HOLDS.violin,
  viola: BOWED_HOLDS.viola,
  cello: BOWED_HOLDS.cello,
  contrabass: BOWED_HOLDS.contrabass,
  conductor: CONDUCTOR_HOLD,
  conductorLeft: LEFT_HAND_PLACES,
  choir: CHOIR_HOLD,
  choirMotion: CHOIR_MOTION,
  folder: CHOIR_FOLDER,
  timpani: PERCUSSION_HOLDS.timpani,
  'bass-drum': PERCUSSION_HOLDS['bass-drum'],
  'snare-drum': PERCUSSION_HOLDS['snare-drum'],
  cymbals: PERCUSSION_HOLDS.cymbals,
  'suspended-cymbal': SUSPENDED_CYMBAL_HOLD,
  'small-percussion': PERCUSSION_HOLDS['small-percussion'],
  xylophone: PERCUSSION_HOLDS.xylophone,
  kettles: TIMPANI,
  harpPlace: HARP_PLACE,
  bassDrum: BASS_DRUM,
  snareDrum: SNARE_DRUM,
  suspendedCymbal: SUSPENDED_CYMBAL,
  tambourine: TAMBOURINE,
  triangle: TRIANGLE,
  bars: XYLOPHONE,
  percussion: PERCUSSION_PLACES,
  ...OWN_HOLDS,
};

/**
 * A value of a hold that `--set` writes from JSON text: a number, a flag, a text, `null`, a list,
 * or an object of such values.
 */
type HoldValue = number | boolean | string | null | readonly HoldValue[] | HoldObject;

/** An object of a hold, such as `restBow` of a bowed hold. */
interface HoldObject {
  /** The value of each key. */
  readonly [key: string]: HoldValue;
}

/**
 * The values that a field of a hold takes in place of `null`, by the path of the field below the
 * hold, such as `restBow.via` (design 5.2, 5.3). A `--set` of a field whose value is `null` takes
 * JSON text with the keys and the kinds of its entry ({@link fitJson}). Each entry satisfies the
 * type of its field, so a change of the type stops the typecheck until the entry follows it. The
 * fields of the bowed holds and of the wind holds that can be `null` have other names, so a path
 * names one field.
 */
const NULL_FIELDS: ReadonlyMap<string, HoldValue> = new Map<string, HoldValue>([
  [
    'rest',
    {
      axis: [0, 0, 0],
      top: [0, 0, 0],
      lap: { along: 0, offset: [0, 0, 0] },
    } satisfies NonNullable<BowedHold['rest']>,
  ],
  ['liftPoleL', [0, 0, 0] satisfies NonNullable<BowedHold['liftPoleL']>],
  ['restPawTurnL', 0 satisfies NonNullable<BowedHold['restPawTurnL']>],
  ['restBow.via', { tip: [0, 0, 0], hair: [0, 0, 0], reach: [0, 0, 0] } satisfies BowVia],
  [
    'standBow',
    { tip: [0, 0, 0], hair: [0, 0, 0], via: null } satisfies NonNullable<BowedHold['standBow']>,
  ],
  ['standBow.via', { tip: [0, 0, 0], hair: [0, 0, 0], reach: [0, 0, 0] } satisfies BowVia],
  ['fit', { gap: 0 } satisfies NonNullable<BowedHold['fit']>],
  [
    'restFreeL',
    {
      lap: { along: 0, offset: [0, 0, 0] },
      palm: [0, 0, 0],
      fingers: [0, 0, 0],
      arc: [0, 0, 0],
    } satisfies FreePaw,
  ],
  ['across', { rest: 0, lift: 0, pitch: null, peak: 1 } satisfies MalletAcross],
  ['across.pitch', 0 satisfies NonNullable<MalletAcross['pitch']>],
  ['set', { raise: 0, rise: [0, 0] } satisfies MalletSet],
  ['side', { span: 0, hips: 0, spine: 0, moveSec: 0 } satisfies SideMove],
  ['aimL', [0, 0, -1]],
  ['aimR', [0, 0, -1]],
  ['restGripShiftL', [0, 0, 0]],
  ['restGripShiftR', [0, 0, 0]],
  ['gripCurl', [0, 0]],
]);

/**
 * The texts that a text field of a hold takes, by the last key of its path, such as `hands` of
 * `timpani.hands` (design 5.3). Each entry has each member of the union of its field as a key, so
 * a change of the union stops the typecheck until the entry follows it. A field with no entry,
 * such as `kind` of a rest place, changes with the JSON text of its object.
 */
const TEXT_FIELDS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'hands',
    Object.keys({ alternate: true, sides: true, right: true, pair: true } satisfies Record<
      HandsRule,
      true
    >),
  ],
  ['action', Object.keys({ strike: true, pluck: true } satisfies Record<HandAction, true>)],
  ['top', Object.keys({ up: true, shoulder: true } satisfies Record<MalletTop, true>)],
  [
    'fingering',
    Object.keys({
      holes: true,
      'valves-left': true,
      'valves-right': true,
      slide: true,
    } satisfies Record<Fingering, true>),
  ],
]);

/**
 * Tells if a value is a value that `--set` can write: a finite number, a flag, a text, `null`, a
 * list, or a plain object of such values.
 *
 * @param value The value of a hold, or the value of JSON text.
 * @returns True for such a value.
 */
function isHoldValue(value: unknown): value is HoldValue {
  if (value === null || value === true || value === false || Number.isFinite(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isHoldValue(item));
  }
  if (value instanceof Object) {
    return (
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => isHoldValue(item))
    );
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the JSON text of `--set` is an I/O boundary.
  return typeof value === 'string';
}

/**
 * Tells if a value of a hold is a number.
 *
 * @param value The value.
 * @returns True for a number.
 */
function isNumber(value: HoldValue): value is number {
  return Number.isFinite(value);
}

/**
 * Tells if a value of a hold is a flag.
 *
 * @param value The value.
 * @returns True for `true` or `false`.
 */
function isFlag(value: HoldValue): value is boolean {
  return value === true || value === false;
}

/**
 * Tells if a value of a hold is a text: the kind that is left after `null`, a number, a flag, a
 * list, and an object.
 *
 * @param value The value.
 * @returns True for a text.
 */
function isText(value: HoldValue): value is string {
  return value !== null && !isNumber(value) && !isFlag(value) && !(value instanceof Object);
}

/**
 * Tells if a value of a hold is a list.
 *
 * @param value The value.
 * @returns True for a list.
 */
function isHoldList(value: HoldValue): value is readonly HoldValue[] {
  return Array.isArray(value);
}

/**
 * Tells if a value of a hold is an object that is not a list.
 *
 * @param value The value.
 * @returns True for such an object.
 */
function isHoldObject(value: HoldValue): value is HoldObject {
  return value instanceof Object && !Array.isArray(value);
}

/**
 * Writes a value of a hold as the text of a change: a number or a list of numbers as `--set`
 * takes it, and another value as JSON text.
 *
 * @param value The value.
 * @returns The text, such as `0.5`, `0,1,0`, or `{"tip":[0,1,0]}`.
 */
function valueText(value: HoldValue): string {
  if (isNumber(value) || (isHoldList(value) && value.every((item) => isNumber(item)))) {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Fits a value of JSON text to the old value of a hold: the new value keeps the keys and the kinds
 * of the old value. A number takes a number, or a text with the unit `deg` ({@link parseNumber}).
 * A list takes a list of the same length. An object takes an object with the same keys: a key
 * that the old object does not have stops the change, and so does a key that the new object does
 * not have. A flag takes a flag, and a text takes a text. `null` takes the entry of its field in
 * {@link NULL_FIELDS}, and a field of that table also takes `null`.
 *
 * @param old The old value.
 * @param value The value of the JSON text.
 * @param path The path of the value from the root of the hold, for the messages.
 * @param field The path of the value below the hold, the key of {@link NULL_FIELDS}.
 * @returns The new value.
 * @throws Error if the value does not fit, or if the old value is `null` and its field has no
 *   entry.
 */
function fitJson(old: HoldValue, value: HoldValue, path: string, field: string): HoldValue {
  const nullable = NULL_FIELDS.get(field);
  if (value === null) {
    if (old === null || nullable !== undefined) {
      return null;
    }
    throw new Error(`The value of ${path} cannot be null.`);
  }
  const like = old ?? nullable;
  if (like === undefined || like === null) {
    throw new Error(
      `The value of ${path} is null, and the tool knows no keys for it. Add its field ${field} to NULL_FIELDS of tools/hold-sets.ts.`,
    );
  }

  if (isHoldList(like)) {
    if (!isHoldList(value) || value.length !== like.length) {
      throw new Error(
        `${path} takes a list of ${like.length} values, and the value is ${JSON.stringify(value)}.`,
      );
    }
    return like.map((item, k) => fitJson(item, value[k] ?? null, `${path}.${k}`, `${field}.${k}`));
  }
  if (isHoldObject(like)) {
    const keys = Object.keys(like);
    if (!isHoldObject(value)) {
      throw new Error(
        `${path} takes an object with the keys ${keys.join(', ')}, and the value is ${JSON.stringify(value)}.`,
      );
    }
    const unknown = Object.keys(value).find((key) => !keys.includes(key));
    if (unknown !== undefined) {
      throw new Error(
        `The key "${unknown}" of ${path} is not known. The keys are ${keys.join(', ')}.`,
      );
    }
    const missing = keys.find((key) => value[key] === undefined);
    if (missing !== undefined) {
      throw new Error(
        `The value of ${path} has no key "${missing}". The keys are ${keys.join(', ')}.`,
      );
    }
    return Object.fromEntries(
      keys.map((key) => [
        key,
        fitJson(like[key] ?? null, value[key] ?? null, `${path}.${key}`, `${field}.${key}`),
      ]),
    );
  }
  if (isNumber(like)) {
    if (isNumber(value)) {
      return value;
    }
    if (isText(value)) {
      return parseNumber(value, path);
    }
  } else if ((isFlag(like) && isFlag(value)) || (isText(like) && isText(value))) {
    return value;
  }
  throw new Error(
    `The value ${JSON.stringify(value)} of ${path} does not fit the old value ${JSON.stringify(like)}.`,
  );
}

/**
 * The text of a turn of a wind hold, `holdTurn(<x>,<z>)` or `holdTurn(<x>,<z>,<first turn>)`, with
 * the turns in degrees, as `holdTurn()` of `src/pose/winds.ts` takes them.
 */
const TURN_TEXT = /^holdTurn\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*(?:,\s*(.+?)\s*)?\)$/;

/**
 * Parses the text of a turn of a wind hold, such as `holdTurn(20,20)` or
 * `holdTurn(-16,-1,holdTurn(30,26))` ({@link TURN_TEXT}).
 *
 * @param text The text.
 * @param path The path of the value, for the messages.
 * @returns The turn, or `null` when the text does not start with `holdTurn(`.
 * @throws Error if the text starts with `holdTurn(` and does not fit {@link TURN_TEXT}, or if a
 *   turn is not a number.
 */
function parseTurn(text: string, path: string): Quat | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('holdTurn(')) {
    return null;
  }
  const match = TURN_TEXT.exec(trimmed);
  if (!match) {
    throw new Error(
      `The value "${text}" of ${path} is not holdTurn(<x>,<z>) or holdTurn(<x>,<z>,holdTurn(...)), with the turns in degrees.`,
    );
  }

  const [, x = '', z = '', first] = match;
  const degrees = (part: string): number => {
    const value = Number(part);
    if (part.trim() === '' || !Number.isFinite(value)) {
      throw new Error(`The turn "${part}" of ${path} is not a number of degrees.`);
    }
    return value;
  };
  const inner = first === undefined ? IDENTITY : parseTurn(first, path);
  if (!inner) {
    throw new Error(`The first turn "${first ?? ''}" of ${path} is not holdTurn(<x>,<z>).`);
  }
  return holdTurn(degrees(x), degrees(z), inner);
}

/**
 * Parses the text of a `--set` for a value of a hold. A number takes a number, a flag takes
 * `true` or `false`, and a list of numbers takes the numbers separated by commas, with the same
 * count, or a JSON list, such as
 * `[-0.5,-1,-0.5]`. A turn of 4 numbers also takes `holdTurn(<x>,<z>)` in degrees
 * ({@link parseTurn}). A text takes a member of the union of its field ({@link TEXT_FIELDS}),
 * such as `timpani.hands=sides`. A value that is `null`, an object, or another list takes JSON
 * text, which fits the old value ({@link fitJson}). A field of {@link NULL_FIELDS} also takes
 * `null`, such as `violin@rabbit.liftPoleL=null`.
 *
 * @param old The old value.
 * @param text The text, such as `16deg`, `0,1,0`, `[0,1,0]`, `holdTurn(20,20)`, or
 *   `{"tip":[0,1,0],"hair":[0,0,-1]}`.
 * @param path The path of the value from the root of the hold, for the messages.
 * @param field The path of the value below the hold.
 * @returns The new value.
 * @throws Error if the text does not fit the old value.
 */
function parseValue(old: HoldValue, text: string, path: string, field: string): HoldValue {
  if (text.trim() === 'null' && NULL_FIELDS.has(field)) {
    return null;
  }
  const turn = parseTurn(text, path);
  if (turn) {
    if (!isHoldList(old) || old.length !== 4 || !old.every((item) => isNumber(item))) {
      throw new Error(
        `holdTurn() gives a turn of 4 numbers, and ${path} is ${JSON.stringify(old)}.`,
      );
    }
    return turn;
  }
  if (isHoldList(old) && old.every((item) => isNumber(item)) && !text.trim().startsWith('[')) {
    const value = text.split(',').map((part) => parseNumber(part, path));
    if (value.length !== old.length) {
      throw new Error(`${path} has ${old.length} numbers, and "${text}" has ${value.length}.`);
    }
    return value;
  }
  if (isNumber(old)) {
    return parseNumber(text, path);
  }
  if (old === true || old === false) {
    if (text !== 'true' && text !== 'false') {
      throw new Error(`${path} takes true or false, and the value is "${text}".`);
    }
    return text === 'true';
  }
  if (isText(old)) {
    const members = TEXT_FIELDS.get(field.split('.').at(-1) ?? '');
    if (!members) {
      throw new Error(
        `The text ${path} has no list of values in TEXT_FIELDS of tools/hold-sets.ts, so --set cannot change it.`,
      );
    }
    if (!members.includes(text)) {
      throw new Error(`${path} takes one of ${members.join(', ')}, and the value is "${text}".`);
    }
    return text;
  }
  if (old !== null && !isHoldList(old) && !isHoldObject(old)) {
    throw new Error(
      `The value of ${path} is not a number, a list of numbers, a text, an object, or null.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The value "${text}" of ${path} is not JSON text.`);
  }
  if (!isHoldValue(parsed)) {
    throw new Error(
      `The value "${text}" of ${path} holds a value that is not a number, a flag, a text, null, a list, or an object.`,
    );
  }
  return fitJson(old, parsed, path, field);
}

/** A change of a hold in memory. */
interface HoldChange {
  /** Puts the old value back. */
  readonly undo: () => void;
  /** The text of the old value. */
  readonly before: string;
  /** The text of the new value. */
  readonly after: string;
  /**
   * The other paths that the change moves too. A hold that copies another hold with a spread
   * shares its nested objects, such as `violin.restBow` and `viola.restBow`. A change of the own
   * hold of a species moves no other path ({@link copyPath}).
   */
  readonly also: readonly string[];
}

/** The changes of a list of `--set`. */
interface HoldChanges {
  /** Puts all old values back. */
  readonly undo: () => void;
  /** The text of the list. */
  readonly text: string;
}

/** The names of the holds that `--set` can change. */
const HOLD_NAMES = Object.keys(HOLDS);

/**
 * The scales of the instruments of a species that `--set` can change, with the id of the species
 * as the root, such as `mouse.oboeScale=0.8` (`SCALE_PARAMS` of `src/models/species.ts`, design
 * 4.6). The tools build the players after the change, so the instrument, its grips, and its
 * shells follow the scale.
 */
const SCALE_KEYS = Object.values(SCALE_PARAMS);

/**
 * Changes the scale of an instrument of a species in memory, such as `mouse.oboeScale=0.8`. A
 * scale that the species does not give is 1, and the undo removes it again.
 *
 * @param species The species, the root of the path.
 * @param keys The keys after the root: one key of {@link SCALE_KEYS}.
 * @param text The new scale.
 * @returns The change.
 * @throws Error if the path names no scale, or if the scale is not a number above 0.
 */
function setScale(species: SpeciesId, keys: readonly string[], text: string): HoldChange {
  const path = [species, ...keys].join('.');
  const key = SCALE_KEYS.find((k) => keys.length === 1 && k === keys[0]);
  if (key === undefined) {
    throw new Error(`The path ${path} names no scale. A species takes ${SCALE_KEYS.join(', ')}.`);
  }
  const value = parseNumber(text, path);
  if (!(value > 0)) {
    throw new Error(`The scale ${path} must be above 0, and the value is "${text}".`);
  }
  const params: SpeciesParams = SPECIES[species];
  const had = Object.hasOwn(params, key);
  const old = params[key];
  Reflect.set(params, key, value);
  return {
    undo: () => {
      if (had) {
        Reflect.set(params, key, old);
      } else {
        Reflect.deleteProperty(params, key);
      }
    },
    before: String(old ?? 1),
    after: String(value),
    also: [],
  };
}

/** The forms of the cymbals that `<species>.cymbalForm` takes (`SpeciesParams.cymbalForm`). */
const CYMBAL_FORMS = Object.keys({ hand: true, suspended: true } satisfies Record<
  CymbalForm,
  true
>);

/**
 * Changes the form of the cymbals of a species in memory, such as `badger.cymbalForm=suspended`.
 * A form that the species does not give is `hand`, and the undo removes it again.
 *
 * @param species The species, the root of the path.
 * @param text The new form.
 * @returns The change.
 * @throws Error if the text is not a form of {@link CYMBAL_FORMS}.
 */
function setCymbalForm(species: SpeciesId, text: string): HoldChange {
  const form = CYMBAL_FORMS.find((f) => f === text);
  if (form === undefined) {
    throw new Error(
      `The form "${text}" of ${species}.cymbalForm is not one of ${CYMBAL_FORMS.join(', ')}.`,
    );
  }
  const params: SpeciesParams = SPECIES[species];
  const had = Object.hasOwn(params, 'cymbalForm');
  const old = params.cymbalForm;
  Reflect.set(params, 'cymbalForm', form);
  return {
    undo: () => {
      if (had) {
        Reflect.set(params, 'cymbalForm', old);
      } else {
        Reflect.deleteProperty(params, 'cymbalForm');
      }
    },
    before: old ?? 'hand',
    after: form,
    also: [],
  };
}

/**
 * Changes the lengths of the lead pipe of the tuba of a species in memory, back and to the left,
 * such as `rhino.tubaPipe=0.25,0.1` (`SpeciesParams.tubaPipe`, in meters). Lengths that the
 * species does not give are 0, and the undo removes them again.
 *
 * @param species The species, the root of the path.
 * @param text The new lengths, as two numbers with a comma, in brackets or not.
 * @returns The change.
 * @throws Error if the text is not two numbers.
 */
function setTubaPipe(species: SpeciesId, text: string): HoldChange {
  const path = `${species}.tubaPipe`;
  const parts = text.replace(/^\[|\]$/g, '').split(',');
  if (parts.length !== 2) {
    throw new Error(
      `The value of ${path} must be two numbers, back and left, and it is "${text}".`,
    );
  }
  const value = [parseNumber(parts[0] ?? '', path), parseNumber(parts[1] ?? '', path)] as const;
  const params: SpeciesParams = SPECIES[species];
  const had = Object.hasOwn(params, 'tubaPipe');
  const old = params.tubaPipe;
  Reflect.set(params, 'tubaPipe', value);
  return {
    undo: () => {
      if (had) {
        Reflect.set(params, 'tubaPipe', old);
      } else {
        Reflect.deleteProperty(params, 'tubaPipe');
      }
    },
    before: (old ?? [0, 0]).join(','),
    after: value.join(','),
    also: [],
  };
}

/**
 * Parses one number of a `--set` value. A number with the unit `deg` is an angle in degrees, and
 * the hold gets it in radians.
 *
 * @param text The text, such as `0.1` or `16deg`.
 * @param path The path, for the message.
 * @returns The number.
 * @throws Error if the text is not a number.
 */
function parseNumber(text: string, path: string): number {
  const degrees = text.endsWith('deg');
  const value = Number(degrees ? text.slice(0, -3) : text);
  if (text.trim() === '' || !Number.isFinite(value)) {
    throw new Error(`The value "${text}" of ${path} is not a number.`);
  }
  return degrees ? value * MathUtils.DEG2RAD : value;
}

/**
 * Gives the value of a key of an object, or reports that the object has no such key.
 *
 * @param node The object.
 * @param key The key.
 * @returns The entry of the key, or `undefined` if the object has no such key.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- a `--set` path is an I/O boundary that walks any hold.
function entryOf(node: object, key: string): [string, unknown] | undefined {
  return Object.entries(node).find(([k]) => k === key);
}

/**
 * Finds each path from the roots of {@link HOLDS} to an object.
 *
 * @param target The object.
 * @returns The paths, such as `viola.restBow.lap`.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- a `--set` path is an I/O boundary that walks any hold.
function pathsTo(target: object): string[] {
  const found: string[] = [];
  // oxlint-disable-next-line anti-slop/no-object-parameters -- the walk goes down into each hold.
  const walk = (node: object, path: string): void => {
    for (const [key, child] of Object.entries(node)) {
      if (!(child instanceof Object)) {
        continue;
      }
      const next = path ? `${path}.${key}` : key;
      if (child === target) {
        found.push(next);
      } else {
        walk(child, next);
      }
    }
  };
  walk(HOLDS, '');
  return found;
}

/** The copies of the objects on the path of a change ({@link copyPath}). */
interface PathCopy {
  /** The copy of the last object of the path, which gets the change. */
  readonly target: object;
  /** Puts each shared object back in its parent. */
  readonly undo: () => void;
}

/**
 * Copies each object and each list on a path below a hold before a change, so that the change
 * reaches only that hold. A hold that copies another hold with a spread shares its nested objects
 * and lists, such as the `restBow` of two species, or a list of a module constant. Each copy is
 * shallow, and it takes the place of the shared object in its parent.
 *
 * @param hold The hold, the root of the path.
 * @param keys The keys from the hold to the object that holds the value, with no last key.
 * @returns The copy of the last object of the path, or the hold with no key, and a function that
 *   puts each shared object back in its parent.
 */
// oxlint-disable-next-line anti-slop/no-object-parameters -- a `--set` path is an I/O boundary that walks any hold.
function copyPath(hold: object, keys: readonly string[]): PathCopy {
  const copies: [parent: object, key: string, shared: object][] = [];
  let target = hold;
  for (const key of keys) {
    const shared = entryOf(target, key)?.[1];
    if (!(shared instanceof Object)) {
      break;
    }
    const copy = Array.isArray(shared) ? [...shared] : { ...shared };
    Reflect.set(target, key, copy);
    copies.push([target, key, shared]);
    target = copy;
  }
  return {
    target,
    undo: () => {
      for (const [parent, key, shared] of copies.toReversed()) {
        Reflect.set(parent, key, shared);
      }
    },
  };
}

/**
 * Changes one value of a hold in memory, such as `piano.lean=16deg` or
 * `piano.restL.lap.offset=-0.75,0.1,0`. The path names the keys from a hold of {@link HOLDS}. The
 * new value has the type of the old value: a number, a list of numbers of the same length (also
 * as a JSON list, such as `bassoon@beaver.poleL=[-0.5,-1,-0.5]`), a turn of a wind hold as
 * `holdTurn(<x>,<z>)` ({@link parseTurn}), or a text of the union of its field, such as
 * `timpani.hands=sides` ({@link TEXT_FIELDS}). A
 * value that is `null`, an object, or another list takes JSON text with the keys and the kinds of
 * the old value ({@link parseValue}), such as
 * `viola.restBow.via={"tip":[-0.3,0.3,-1],"hair":[0,-1,0],"reach":[0,0,-0.4]}`. A path below a
 * value that is `null` names no value, and the message gives the keys of that value from
 * {@link NULL_FIELDS}. A change of the own hold of a species, with the root
 * `<instrument>@<species>`, first copies each object on its path ({@link copyPath}), so that it
 * changes only that species. A change with the root of an instrument, such as
 * `violin.restBow.lap.along`, changes the shared object, and gives the other paths that it moves
 * too, such as `viola.restBow.lap.along`. A path with the id of a species as the root changes a
 * scale of an instrument of the species ({@link setScale}), such as `mouse.oboeScale=0.8`, or the
 * form of its cymbals ({@link setCymbalForm}), such as `badger.cymbalForm=suspended`, or the
 * lead pipe of its tuba ({@link setTubaPipe}), such as `rhino.tubaPipe=0.25,0.1`.
 *
 * @param change The change, as `<path>=<value>`.
 * @returns A function that puts the old value back, the texts of the old and the new value, and
 *   the other paths that the change moves too.
 * @throws Error if the path has an unknown key, or if the value does not fit the old value.
 */
export function setHold(change: string): HoldChange {
  const equals = change.indexOf('=');
  if (equals < 1) {
    throw new Error(`The change "${change}" is not <path>=<value>.`);
  }
  const path = change.slice(0, equals);
  const text = change.slice(equals + 1);
  const [first = '', ...keys] = path.split('.');
  if (isSpeciesId(first)) {
    if (keys.length === 1 && keys[0] === 'tubaPipe') {
      return setTubaPipe(first, text);
    }
    return keys.length === 1 && keys[0] === 'cymbalForm'
      ? setCymbalForm(first, text)
      : setScale(first, keys, text);
  }
  const hold = entryOf(HOLDS, first)?.[1];
  if (!(hold instanceof Object) || keys.length === 0) {
    throw new Error(
      `The path ${path} names no hold value. The holds are ${HOLD_NAMES.join(', ')}, and a species takes ${SCALE_KEYS.join(', ')}.`,
    );
  }

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- the walk goes down into each hold.
  let node: object = hold;
  let [key = ''] = keys;
  for (const [k, next] of keys.slice(1).entries()) {
    const child = entryOf(node, key)?.[1];
    if (child === null) {
      const field = keys.slice(0, k + 1).join('.');
      const entry = NULL_FIELDS.get(field);
      const example =
        entry === undefined
          ? ''
          : ` Set it first, such as ${first}.${field}=${JSON.stringify(entry)}.`;
      throw new Error(
        `The value of ${first}.${field} is null, so ${path} names no value.${example}`,
      );
    }
    if (!(child instanceof Object)) {
      throw new Error(`The key "${key}" of ${path} has no keys.`);
    }
    node = child;
    key = next;
  }
  const entry = entryOf(node, key);
  if (!entry) {
    throw new Error(`The key "${key}" of ${path} is not known.`);
  }

  const old = entry[1];
  if (!isHoldValue(old)) {
    throw new Error(`The value of ${path} is not a value that --set can write.`);
  }
  const value = parseValue(old, text, path, keys.join('.'));
  const copied: PathCopy = first.includes('@')
    ? copyPath(hold, keys.slice(0, -1))
    : { target: node, undo: () => {} };
  const target = copied.target;
  Reflect.set(target, key, value);
  const parent = [first, ...keys.slice(0, -1)].join('.');
  return {
    undo: () => {
      Reflect.set(target, key, old);
      copied.undo();
    },
    before: valueText(old),
    after: valueText(value),
    also: pathsTo(target)
      .filter((other) => other !== parent)
      .map((other) => `${other}.${key}`),
  };
}

/**
 * Applies a list of changes, separated by `;`, as {@link setHold} does.
 *
 * @param list The changes, such as `piano.lean=16deg;piano.curl=0.4`.
 * @returns A function that puts all old values back, and a text of the changes, with the other
 *   paths that they move too.
 * @throws Error if a change does not fit. The changes before it are then put back.
 */
export function setHolds(list: string): HoldChanges {
  const done: HoldChange[] = [];
  const undo = (): void => {
    for (const change of done.toReversed()) {
      change.undo();
    }
  };
  try {
    for (const change of list.split(';').filter((c) => c.trim() !== '')) {
      done.push(setHold(change.trim()));
    }
  } catch (error) {
    undo();
    throw error;
  }
  const also = done.flatMap((change) => change.also);
  const text = also.length > 0 ? `${list} (also moves ${also.join(', ')})` : list;
  return { undo, text };
}
