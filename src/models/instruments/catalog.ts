import { buildHarp } from './harp.ts';
import {
  buildBassDrum,
  buildCymbals,
  buildSmallPercussion,
  buildSnareDrum,
  buildSuspendedCymbal,
  buildTimpani,
  buildXylophone,
} from './percussion.ts';
import type { KettleCount } from './percussion.ts';
import { buildPiano } from './piano.ts';
import { buildBaton } from './baton.ts';
import { buildBrass } from './brass.ts';
import { buildChoirFolder } from './folder.ts';
import { buildBowedString } from './strings.ts';
import type { BowGrip } from './strings.ts';
import { buildWoodwind } from './woodwinds.ts';
import { isScaledInstrument } from './types.ts';
import type { CymbalForm, InstrumentId, InstrumentModel, ScaledInstrument } from './types.ts';

/** All instruments of design 4.6, in the order of the inventory. */
export const INSTRUMENT_IDS = [
  'violin',
  'viola',
  'cello',
  'contrabass',
  'harp',
  'piano',
  'choir-folder',
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'horn',
  'trumpet',
  'trombone',
  'tuba',
  'timpani',
  'bass-drum',
  'snare-drum',
  'cymbals',
  'small-percussion',
  'xylophone',
  'baton',
] as const satisfies readonly InstrumentId[];

/**
 * Builds the geometry and the play data of an instrument (design 4.6). The model holds no
 * Three.js object. An instrument of `SCALED_INSTRUMENTS` of `types.ts` goes to
 * {@link buildScaled}, so a case of it here stops the typecheck.
 *
 * @param id The instrument.
 * @param kettles The number of kettles of the timpani (design 4.6). The other instruments
 *   ignore it.
 * @param scale The scale of an instrument of `SCALED_INSTRUMENTS` and its bow, for the species of
 *   the player (`instrumentScale()` of `models/species.ts`). The other instruments ignore it.
 * @param bowGrip The grip of the bow in the right paw of the species of the player
 *   (`SpeciesParams.bowGrip`), or `undefined` for the grip of the bind pose of the bow. The
 *   instruments with no bow ignore it.
 * @param cymbalForm The form of the cymbals of the species of the player
 *   (`SpeciesParams.cymbalForm`). The other instruments ignore it.
 * @param tubaPipe The lengths by which the lead pipe of the tuba reaches back and to the left from
 *   the mouthpiece (`SpeciesParams.tubaPipe`), in meters. The other instruments ignore it.
 * @param endPin The end pin of a cello for the body of the player (`celloPinOf()` of
 *   `cello-fit.ts`), in meters, or `undefined` for the end pin of the size. The other instruments
 *   ignore it.
 * @returns The model.
 */
export function buildInstrument(
  id: InstrumentId,
  kettles: KettleCount = 4,
  scale = 1,
  bowGrip?: BowGrip,
  cymbalForm: CymbalForm = 'hand',
  tubaPipe: readonly [back: number, left: number] = [0, 0],
  endPin?: number,
): InstrumentModel {
  if (isScaledInstrument(id)) {
    return buildScaled(id, scale, bowGrip, cymbalForm, endPin);
  }
  switch (id) {
    case 'piano':
      return buildPiano();
    case 'choir-folder':
      return buildChoirFolder();
    case 'flute':
    case 'clarinet':
      return buildWoodwind(id);
    case 'horn':
    case 'trombone':
      return buildBrass(id);
    case 'tuba':
      return buildBrass(id, 1, tubaPipe);
    case 'timpani':
      return buildTimpani(kettles);
    case 'bass-drum':
      return buildBassDrum();
    case 'snare-drum':
      return buildSnareDrum();
    case 'small-percussion':
      return buildSmallPercussion();
    case 'xylophone':
      return buildXylophone();
    case 'baton':
      return buildBaton();
    default: {
      const unhandled: never = id;
      throw new Error(`The instrument "${String(unhandled)}" is not known.`);
    }
  }
}

/**
 * Builds an instrument of `SCALED_INSTRUMENTS` of `types.ts` at the scale of the species of the
 * player. A new instrument of that list stops the typecheck until it has a case here.
 *
 * @param id The instrument.
 * @param scale The scale of the instrument and its bow (`instrumentScale()` of
 *   `models/species.ts`).
 * @param bowGrip The grip of the bow in the right paw, or `undefined` for the grip of the bind
 *   pose of the bow.
 * @param cymbalForm The form of the cymbals.
 * @param endPin The end pin of a cello, in meters, or `undefined` for the end pin of the size.
 * @returns The model.
 */
function buildScaled(
  id: ScaledInstrument,
  scale: number,
  bowGrip: BowGrip | undefined,
  cymbalForm: CymbalForm,
  endPin: number | undefined,
): InstrumentModel {
  switch (id) {
    case 'violin':
    case 'viola':
    case 'cello':
    case 'contrabass':
      return buildBowedString(id, scale, bowGrip, endPin);
    case 'oboe':
    case 'bassoon':
      return buildWoodwind(id, scale);
    case 'trumpet':
      return buildBrass(id, scale);
    case 'cymbals':
      return cymbalForm === 'suspended' ? buildSuspendedCymbal(scale) : buildCymbals(scale);
    case 'harp':
      return buildHarp(scale);
    default: {
      const unhandled: never = id;
      throw new Error(`The scaled instrument "${String(unhandled)}" is not known.`);
    }
  }
}
