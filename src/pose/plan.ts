import { MathUtils, Vector3 } from 'three';

import { CONDUCTOR } from '../models/cast.ts';
import type { ConductorPlace, PlayerPlace, SceneLayout } from '../models/layout.ts';
import { ModelCache } from '../models/model-cache.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { Skeleton } from '../models/rig.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { NO_PEDAL, sustainPedals } from '../score/pedal.ts';
import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';
import type { PedalTrack } from '../score/pedal.ts';
import type { Beat, PlayerNote, Score, SectionId } from '../score/types.ts';
import { SPECIES, instrumentScale } from '../models/species.ts';
import type { SpeciesId, SpeciesParams } from '../models/species.ts';
import { Y_AXIS } from './axes.ts';
import { bowedRig, holdOf } from './bowed-rig.ts';
import type { BowedRig } from './bowed-rig.ts';
import { choirRig } from './choir.ts';
import { conductorRig } from './conductor.ts';
import type { ConductorRig } from './conductor.ts';
import { buildLeftHandTrack } from './conductor-left.ts';
import type { LeftHandTrack } from './conductor-left.ts';
import { buildExpressionTrack, findFinal } from './conductor-expression.ts';
import type { ExpressionTrack } from './conductor-expression.ts';
import { buildBatonTrack } from './conductor-notes.ts';
import type { BatonTrack } from './conductor-notes.ts';
import { CUE_MOTION, findCues } from './cues.ts';
import type { CueFacts, CueSeat, CueTrack } from './cues.ts';
import type { ChoirRig } from './choir.ts';
import { buildChoirTrack } from './choir-notes.ts';
import type { ChoirTrack } from './choir-notes.ts';
import { MOTION_FAMILIES, isInFamily } from './family.ts';
import type { HandTrack } from './hand-notes.ts';
import type { DigitTrack } from './piano-digits.ts';
import { handTracksSteps, handsRig } from './hands.ts';
import type { HandsRig } from './hands.ts';
import { idleParams } from './idle.ts';
import { LONG_REST, findLongRests } from './long-rests.ts';
import { LOOK_PLAN, planLooks } from './looks.ts';
import type { IdleParams } from './idle.ts';
import { noteLoudness } from './loudness.ts';
import { buildPassages } from './passages.ts';
import type { Passages } from './passages.ts';
import { pedalMotion } from './pedal.ts';
import type { PedalMotion } from './pedal.ts';
import { buildKeyTrack } from './piano-keys.ts';
import type { KeyTrack } from './piano-keys.ts';
import { buildStringTrack } from './harp-strings.ts';
import { notePlucks } from './harp-fingering.ts';
import { planPedals } from './harp-pedals.ts';
import type { PedalPlan } from './harp-pedals.ts';
import type { StringTrack } from './harp-strings.ts';
import type { DampTrack } from './damps.ts';
import { percussionTracks } from './percussion.ts';
import type { SmallTracks } from './percussion.ts';
import { percussionRig } from './percussion-rig.ts';
import type { PercussionRig } from './percussion-rig.ts';
import { hashUnit, mixHash, mulberry32 } from './random.ts';
import { CONDUCTOR_MOTION, restMotion } from './rest.ts';
import type { RestMotion } from './rest.ts';
import type { SideTrack } from './side-move.ts';
import type { StrikeTrack } from './strikes.ts';
import { buildStrokesSteps, vibratoRate } from './strokes.ts';
import type { Stroke } from './strokes.ts';
import { buildWindTrack } from './wind-notes.ts';
import type { WindTrack } from './wind-notes.ts';
import { windHoldOf, windRig } from './winds.ts';
import type { WindRig } from './winds.ts';

/** The seeded offsets of each player (design 5.3). */
export const PLAYER_OFFSETS = {
  /** The largest timing offset, in seconds. The offset of a player is from -0.02 to 0.02. */
  timeSec: 0.02,
  /** The amplitude of a player is from `1 - amplitude` to `1 + amplitude`. */
  amplitude: 0.15,
} as const;

/**
 * The seeded sway of each player (design 5.1, the beat layer), so that the players of a section
 * do not sway as one.
 */
export const SWAY_VARIETY = {
  /** The largest lag of the sway behind the pulse, as a part of a pulse. */
  lagPulses: 0.35,
  /** The part of the players that sway to each side in two pulses, in place of one. */
  slowShare: 0.5,
} as const;

/** The seeded sway of one player (design 5.1). */
export interface PlayerSway {
  /** 1 or -1: the side to which the sway goes on the first pulse. */
  readonly sign: number;
  /** The lag of the sway behind the pulse, as a part of a pulse, from 0 to `lagPulses`. */
  readonly lag: number;
  /** The number of pulses of the sway to one side: 1 or 2. */
  readonly pulsesPerSide: number;
}

/**
 * The largest seeded differences of the posture of a player from its section (design 5.1), in
 * radians, so that the players of a section do not look like copies.
 */
export const POSTURE_VARIETY = {
  /** The side tilt of the head. */
  tilt: 3 * MathUtils.DEG2RAD,
  /** The turn of the head around y. */
  turn: 4 * MathUtils.DEG2RAD,
  /** The forward lean of the spine: a positive value slouches, and a negative value sits taller. */
  slouch: 2 * MathUtils.DEG2RAD,
  /** The spread of the ears at rest. */
  ear: 8 * MathUtils.DEG2RAD,
} as const;

/** The seeded posture of one player (design 5.1), in radians: each value is within the range of {@link POSTURE_VARIETY}. */
export interface PlayerPosture {
  /** The side tilt of the head: a positive tilt turns the head to the left. */
  readonly tilt: number;
  /** The turn of the head around y. */
  readonly turn: number;
  /** The forward lean of the spine. */
  readonly slouch: number;
  /** The spread of the ears at rest: a positive spread turns each ear out. */
  readonly ear: number;
}

/** The posture of the conductor: no seeded difference. */
const PLAIN_POSTURE: PlayerPosture = { tilt: 0, turn: 0, slouch: 0, ear: 0 };

/**
 * Chooses the seeded posture of a player (design 5.1).
 *
 * @param seed The seed of the player.
 * @returns The posture.
 */
function postureOfSeed(seed: number): PlayerPosture {
  const s = mixHash(seed, 4);
  const signed = (slot: number): number => 2 * hashUnit(s, slot) - 1;
  const v = POSTURE_VARIETY;
  return {
    tilt: v.tilt * signed(0),
    turn: v.turn * signed(1),
    slouch: v.slouch * signed(2),
    ear: v.ear * signed(3),
  };
}

/** The sway of the conductor and of a player with no seeded sway: with the pulse, to the left. */
const PLAIN_SWAY: PlayerSway = { sign: 1, lag: 0, pulsesPerSide: 1 };

/**
 * Chooses the seeded sway of a player (design 5.1).
 *
 * @param seed The seed of the player.
 * @returns The sway.
 */
function swayOfSeed(seed: number): PlayerSway {
  const s = mixHash(seed, 3);
  return {
    sign: hashUnit(s, 0) < 0.5 ? 1 : -1,
    lag: SWAY_VARIETY.lagPulses * hashUnit(s, 1),
    pulsesPerSide: hashUnit(s, 2) < SWAY_VARIETY.slowShare ? 2 : 1,
  };
}

/** The largest turns of the head for a look at the conductor, in radians. */
const LOOK_LIMITS = { yaw: 1.2, pitch: 0.5 } as const;

/** The note layer of a bowed string player (design 5.3). */
interface BowedLayer {
  readonly family: 'bowed';
  readonly rig: BowedRig;
  readonly strokes: readonly Stroke[];
  /** The starts of the strokes, for the search by time. */
  readonly starts: Float64Array;
}

/** The note layer of a woodwind or brass player (design 5.3). */
interface WindLayer {
  readonly family: 'woodwind' | 'brass';
  readonly rig: WindRig;
  readonly track: WindTrack;
}

/** The note layer of a piano or harp player: the two hands (design 5.3). */
export interface HandsLayer {
  readonly family: 'keyboard' | 'harp';
  readonly rig: HandsRig;
  readonly left: HandTrack;
  readonly right: HandTrack;
  /** The damper pedal under the right foot of a pianist. It stays up for a harp player. */
  readonly pedal: PedalMotion;
  /** The presses of the piano keys of a pianist, or `null` for a harp player. */
  readonly keys: KeyTrack | null;
  /** The plucks of the harp strings of a harp player, or `null` for a pianist. */
  readonly strings: StringTrack | null;
  /** The presses of the claws of each paw of a pianist, or `null` for a harp player. */
  readonly digits: { readonly left: DigitTrack; readonly right: DigitTrack } | null;
  /** The pedal changes of a harp player (`planPedals()`), or `null` for a pianist. */
  readonly pedals: PedalPlan | null;
}

/** The note layer of a singer: the jaw and the sway of the phrases (design 5.3). */
interface ChoirLayer {
  readonly family: 'choir';
  readonly rig: ChoirRig;
  readonly track: ChoirTrack;
}

/** The note layer of a percussion player: the strikes of the two hands (design 5.3). */
export interface PercussionLayer {
  readonly family: 'percussion';
  readonly rig: PercussionRig;
  /** The strikes of each hand. The cymbals share one track, and a free hand has `null`. */
  readonly left: StrikeTrack | null;
  readonly right: StrikeTrack | null;
  /** The side move of the body behind the notes (`PercussionHold.side`), or `null`. */
  readonly side: SideTrack | null;
  /** The long rests with the sticks in their set position (`setRests()`), or `null`. */
  readonly rests: Float64Array | null;
  /** The damps of the hand cymbals against the chest (`PercussionHold.damp`), or `null`. */
  readonly damp: DampTrack | null;
  /** The follow move of the hand cymbals after a crash (`CRASH_MOTION`), or `null`. */
  readonly ring: DampTrack | null;
  /** The switches and the rolls of the small percussion player, or `null`. */
  readonly small: SmallTracks | null;
  /** The strikes that swing the plate of a suspended cymbal (`cymbalSwingAt()`), or `null`. */
  readonly swing: Float64Array | null;
}

/**
 * The note layer of the conductor: the baton, the cues, the left hand, and the expression of the
 * body (design 5.4).
 */
export interface ConductorLayer {
  readonly family: 'conductor';
  readonly rig: ConductorRig;
  readonly baton: BatonTrack;
  readonly cues: CueTrack;
  readonly left: LeftHandTrack;
  readonly expression: ExpressionTrack;
  /**
   * The turn from the facing of the conductor to the audience at +z, in radians, positive to the
   * left: the turn of the bow at the song end ({@link audienceTurnOf}).
   */
  readonly audienceTurn: number;
}

/**
 * The note data of one animal, by motion family. A switch on `family` selects the data. Each
 * family has its own member, its branch in `noteLayerSteps()`, and its case in `poseAnimal()` of
 * `pose-at.ts`.
 */
export type NoteLayer =
  | BowedLayer
  | WindLayer
  | HandsLayer
  | ChoirLayer
  | PercussionLayer
  | ConductorLayer;

/** The data of one animal that the pose calculates one time for each score. */
export interface PlayerPlan {
  /** The index of the seat in `Score.seats`, or -1 for the conductor. */
  readonly seatIndex: number;
  readonly instrument: InstrumentId;
  /** The bind skeleton of the player model. */
  readonly skeleton: Skeleton;
  /**
   * The seeded timing offset, in seconds. The note layer of the player runs this much later than
   * the song time (design 5.3).
   */
  readonly timeOffset: number;
  /** The seeded amplitude of the gestures, near 1 (design 5.3). */
  readonly amplitude: number;
  /**
   * The seeded lift and lowering of the instruments of the player, with the ripple of its seat
   * (design 5.2, 5.5). The conductor has {@link CONDUCTOR_MOTION}.
   */
  readonly motion: RestMotion;
  readonly idle: IdleParams;
  /**
   * The share of the idle sway of the tail (design 5.1): 0 for a seated tail that lies curled on
   * the seat (`SpeciesParams.seatedTail`), so that it does not swing into the haunch and the
   * thighs, and 1 for each other tail.
   */
  readonly tailSway: number;
  /**
   * The share of the idle twitch of the ears (design 5.1): 0 for a species whose ears hang
   * (`SpeciesParams.hangingEars`), and 1 for each other species and the conductor.
   */
  readonly earTwitch: number;
  /** The turn of the head to the conductor, around y then around x, in radians. */
  readonly lookYaw: number;
  readonly lookPitch: number;
  /** The spans in which the player plays, for the sway of the beat layer. */
  readonly passages: Passages;
  /** The seeded sign, lag, and pulse level of the sway of the beat layer. */
  readonly sway: PlayerSway;
  /** The seeded head tilt, head turn, slouch, and ear spread of the player. */
  readonly posture: PlayerPosture;
  /**
   * The planned looks at the conductor, or at the leader of a chamber group (`planLooks()`,
   * design 5.1): two song times for each, between which the head is on the target.
   */
  readonly looks: Float64Array;
  /**
   * The long rests in which the player lowers its instruments (`findLongRests()`, design 5.2),
   * four song times for each. It is empty for a family that keeps the playing pose in a rest.
   */
  readonly longRests: Float64Array;
  /** The note data and the rig of the motion family of the player. */
  readonly note: NoteLayer;
}

/**
 * The data of a score that the pose calculates one time, so that each frame only looks up the
 * time (design 5.1). `preparePoses()` makes it.
 */
export interface PosePlan {
  /** One entry for each player, in the order of `SceneLayout.players`. */
  readonly players: readonly PlayerPlan[];
  /** The plan of the conductor, or `null` for a chamber group with no conductor (design 4.2). */
  readonly conductor: PlayerPlan | null;
  /**
   * The index of the player that leads a chamber group, or `null` with a conductor (design 5.4).
   * The leader breathes in and nods in the count-in.
   */
  readonly leader: number | null;
  /** The times of the conducted beats, in song seconds (`Score.beats`). */
  readonly beats: Float64Array;
  /**
   * The times of the beats of the felt pulse, in song seconds: the beats of `Score.beats` with
   * `pulse`. The sway of a player changes its side at each one (design 5.1).
   */
  readonly pulses: Float64Array;
}

/** The rigs of the player models of one score. Players of one kind share them. */
interface RigCache {
  readonly bowedRigs: Map<PlayerModel, BowedRig>;
  readonly windRigs: Map<PlayerModel, WindRig>;
  readonly handsRigs: Map<PlayerModel, HandsRig>;
  readonly choirRigs: Map<PlayerModel, ChoirRig>;
  readonly percussionRigs: Map<PlayerModel, PercussionRig>;
}

/**
 * Makes an empty rig cache.
 *
 * @returns The cache.
 */
export function createRigCache(): RigCache {
  return {
    bowedRigs: new Map(),
    windRigs: new Map(),
    handsRigs: new Map(),
    choirRigs: new Map(),
    percussionRigs: new Map(),
  };
}

/** The inputs of the plan of one player. A page with no `Score`, such as the gallery, gives them. */
interface PlayerInputs {
  readonly model: PlayerModel;
  /** The place of the player on the stage, with its seat and its instrument. */
  readonly place: PlayerPlace;
  /** The notes of the player, sorted by start. */
  readonly notes: readonly PlayerNote[];
  /** The loudness of each note, from 0 to 1, in the order of `notes` (design 5.3). */
  readonly loudness: readonly number[];
  /** The times of the conducted beats, sorted (`Score.beats`). The slurs of a bow read them. */
  readonly beats: Float64Array;
  /**
   * The point that the head turns to in the idle looks (5.1): the head of the conductor, or in a
   * chamber group the head of the leader, or the middle of the heads of the others for the leader.
   */
  readonly lookTarget: Vec3;
  /**
   * The seed of the seat of the player, from {@link seatSeedOf}. The players of one seat share
   * it, for the delay of the seat and the ripple of the lift and the lowering (design 5.2).
   */
  readonly seatSeed: number;
  /** The sustain pedal of the seat (`sustainPedals()`). The pedal stays up by default. */
  readonly pedal?: PedalTrack;
  /**
   * The song end, for the long rest after the last note (design 5.2). With no value, the player
   * keeps its instruments up after its last note.
   */
  readonly endSec?: number;
}

/** The inputs of the plan of the conductor (design 5.4). */
interface ConductorInputs {
  readonly model: PlayerModel;
  readonly place: ConductorPlace;
  /** The conducted beats, sorted by time. */
  readonly beats: readonly Beat[];
  /** All notes, sorted by start. */
  readonly notes: readonly PlayerNote[];
  /** The loudness of each note, in the order of `notes`. */
  readonly loudness: ArrayLike<number>;
  /** The number of seats. */
  readonly seatCount: number;
  /** The places of the players. A cue turns to the middle of the players of its seats. */
  readonly players: readonly PlayerPlace[];
}

/**
 * Gives the value of a key from a cache, and makes the value one time.
 *
 * @param cache The cache.
 * @param key The key.
 * @param make Makes the value of a key that is not in the cache.
 * @returns The value.
 */
function cached<K, V>(cache: Map<K, V>, key: K, make: () => V): V {
  let value = cache.get(key);
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

/**
 * Calculates the turn of the head of a player to look at a point (design 5.1, the looks at the
 * conductor). The player model faces -z, and `facing` turns it around y.
 *
 * @param skeleton The bind skeleton of the player.
 * @param position The place of the player on the stage.
 * @param facing The facing of the player.
 * @param target The point to look at.
 * @returns The yaw around y and the pitch around x, in radians, within {@link LOOK_LIMITS}.
 */
export function lookAngles(
  skeleton: Skeleton,
  position: Vec3,
  facing: number,
  target: Vec3,
): readonly [yaw: number, pitch: number] {
  const head = new Vector3(...(skeleton.positions[boneIndex('head')] ?? [0, 0, 0]));
  const local = new Vector3(...target)
    .sub(new Vector3(...position))
    .sub(head.applyAxisAngle(Y_AXIS, facing))
    .applyAxisAngle(Y_AXIS, -facing);
  const yaw = Math.atan2(-local.x, -local.z);
  const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
  const limit = (x: number, max: number): number => Math.max(-max, Math.min(max, x));
  return [limit(yaw, LOOK_LIMITS.yaw), limit(pitch, LOOK_LIMITS.pitch)];
}

/** The notes of one player, with their loudness. */
interface PlayerNotes {
  readonly notes: PlayerNote[];
  readonly loudness: number[];
}

/**
 * Gives the notes of each player of a layout.
 *
 * @param score The score.
 * @param layout The layout.
 * @returns One entry for each player of the layout, with the notes sorted by start.
 */
function notesOfPlayers(score: Score, layout: SceneLayout, loudness: Float32Array): PlayerNotes[] {
  const out = layout.players.map((): PlayerNotes => ({ notes: [], loudness: [] }));
  const byPlayer = new Map<string, PlayerNotes>();
  for (const [i, place] of layout.players.entries()) {
    const entry = out[i];
    if (entry) {
      byPlayer.set(`${place.cast.seatIndex} ${place.cast.player}`, entry);
    }
  }
  for (const [i, note] of score.notes.entries()) {
    const entry = byPlayer.get(`${note.seatIndex} ${note.player}`);
    if (entry) {
      entry.notes.push(note);
      entry.loudness.push(loudness[i] ?? 0);
    }
  }
  return out;
}

/**
 * Calculates the note layer of one player from its notes (design 5.3).
 *
 * @param rigs The rigs of the score.
 * @param model The player model.
 * @param species The species of the player. A species can hold a bowed string or a wind
 *   instrument in its own way.
 * @param instrument The instrument of the player.
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note.
 * @param amplitude The seeded amplitude of the player.
 * @param seed The seed of the player. The rate of the vibrato of a bowed string comes from it.
 * @param beats The times of the conducted beats, sorted. The slurs of a bowed string read them.
 * @param pedal The sustain pedal of the seat, for the foot of a pianist.
 * @returns The note layer of the motion family of the instrument.
 */
function* noteLayerSteps(
  rigs: RigCache,
  model: PlayerModel,
  species: SpeciesId,
  instrument: InstrumentId,
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  amplitude: number,
  seed: number,
  beats: Float64Array,
  pedal: PedalTrack,
): Steps<NoteLayer> {
  if (isInFamily(instrument, ['bowed'])) {
    const rig = cached(rigs.bowedRigs, model, () =>
      bowedRig(model, instrument, holdOf(species, instrument)),
    );
    yield;
    const vibratoHz = vibratoRate(instrument, hashUnit(seed, 2));
    const strokes = yield* buildStrokesSteps(
      notes,
      loudness,
      rig.bowRange,
      amplitude,
      instrument,
      vibratoHz,
      beats,
    );
    return { family: 'bowed', rig, strokes, starts: Float64Array.from(strokes, (s) => s.start) };
  }
  if (isInFamily(instrument, ['woodwind', 'brass'])) {
    const rig = cached(rigs.windRigs, model, () =>
      windRig(model, instrument, windHoldOf(species, instrument)),
    );
    yield;
    return {
      family: MOTION_FAMILIES[instrument],
      rig,
      track: buildWindTrack(notes, instrument),
    };
  }
  if (isInFamily(instrument, ['keyboard', 'harp'])) {
    const rig = cached(rigs.handsRigs, model, () =>
      handsRig(model, instrument, instrumentScale(SPECIES[species], instrument)),
    );
    yield;
    const { left, right, digits } = yield* handTracksSteps(rig, notes, loudness, amplitude);
    yield;
    const family = MOTION_FAMILIES[instrument];
    const plucks = family === 'harp' ? notePlucks(notes, [left, right]) : null;
    return {
      family,
      rig,
      left,
      right,
      pedal: pedalMotion(rig.foot ? pedal : NO_PEDAL),
      keys: family === 'keyboard' ? buildKeyTrack(notes) : null,
      strings: plucks ? buildStringTrack(notes, plucks) : null,
      digits,
      pedals: plucks ? planPedals(notes, plucks) : null,
    };
  }
  if (isInFamily(instrument, ['choir'])) {
    const rig = cached(rigs.choirRigs, model, () => choirRig(model));
    yield;
    return { family: 'choir', rig, track: buildChoirTrack(notes, loudness, amplitude) };
  }
  if (isInFamily(instrument, ['percussion'])) {
    const rig = cached(rigs.percussionRigs, model, () => percussionRig(model, instrument));
    yield;
    return {
      family: 'percussion',
      rig,
      ...percussionTracks(rig, notes, loudness, amplitude, beats),
    };
  }
  throw new Error(`The ${instrument} is not the instrument of a player.`);
}

/**
 * Gives the seed of a seat (design 5.2). The players of the seat share it, for the delay of the
 * seat and the ripple of the lift and the lowering.
 *
 * @param seed The seed of the scene.
 * @param seatIndex The index of the seat.
 * @returns The seed of the seat.
 */
export function seatSeedOf(seed: number, seatIndex: number): number {
  return mixHash(mixHash(seed, -2), seatIndex);
}

/**
 * Gives the share of the idle sway of the tail of a player (design 5.1): 0 for a seated player
 * whose species has a tail that lies curled on the seat (`SpeciesParams.seatedTail`), and 1 for
 * each other player.
 *
 * @param model The player model. A seated model has a seat.
 * @param species The species of the player.
 * @returns The share, 0 or 1.
 */
function tailSwayOf(model: PlayerModel, species: SpeciesId): number {
  const params: SpeciesParams = SPECIES[species];
  return model.seat && params.seatedTail === 'curl' ? 0 : 1;
}

/**
 * Gives the share of the idle twitch of the ears of a species (design 5.1): 0 for a species whose
 * ears hang (`SpeciesParams.hangingEars`), and 1 for each other species.
 *
 * @param species The species of the player.
 * @returns The share, 0 or 1.
 */
function earTwitchOf(species: SpeciesId): number {
  const params: SpeciesParams = SPECIES[species];
  return params.hangingEars ? 0 : 1;
}

/**
 * Calculates the data of one player that the pose needs at each frame (design 5.1, 5.3): the
 * seeded offsets, the seeded rest motion (5.2), the idle values, the look at the conductor, the
 * passages, and the note layer. Pure: the same inputs give the same plan.
 *
 * @param inputs The model, the place, and the notes of the player.
 * @param seed The seed of the player. `preparePoses()` mixes the seed of the scene with the index
 *   of the player.
 * @param rigs The rigs of the score, which the players of one model share. A new cache by default.
 * @returns The plan of the player.
 */
export function preparePlayer(
  inputs: PlayerInputs,
  seed: number,
  rigs = createRigCache(),
): PlayerPlan {
  return runAll(preparePlayerSteps(inputs, seed, rigs));
}

/**
 * Calculates the plan of one player as {@link preparePlayer} does, in steps (design 7.2).
 *
 * @param inputs The model, the place, the notes, and the other inputs of the player.
 * @param seed The seed of the player.
 * @param rigs The rigs of the score, which the players of one model share.
 * @returns The steps, which return the plan of the player.
 */
function* preparePlayerSteps(
  inputs: PlayerInputs,
  seed: number,
  rigs: RigCache,
): Steps<PlayerPlan> {
  const { model, place, notes, loudness, beats } = inputs;
  const next = mulberry32(seed);
  const timeOffset = (next() * 2 - 1) * PLAYER_OFFSETS.timeSec;
  const amplitude = 1 + (next() * 2 - 1) * PLAYER_OFFSETS.amplitude;
  const motion = restMotion(place.cast.instrument, place.cast.player, inputs.seatSeed, next);
  const [lookYaw, lookPitch] = lookAngles(
    model.skeleton,
    place.position,
    place.facing,
    inputs.lookTarget,
  );
  const passages = buildPassages(notes, loudness);
  yield;
  const note = yield* noteLayerSteps(
    rigs,
    model,
    place.cast.species,
    place.cast.instrument,
    notes,
    loudness,
    amplitude,
    seed,
    beats,
    inputs.pedal ?? NO_PEDAL,
  );
  const restSec = LONG_REST.minSec[note.family];
  const longRests =
    restSec === undefined || LONG_REST.keepUp.has(place.cast.instrument)
      ? new Float64Array()
      : findLongRests(notes, beats, inputs.endSec ?? Infinity, restSec, motion);
  return {
    seatIndex: place.cast.seatIndex,
    instrument: place.cast.instrument,
    skeleton: model.skeleton,
    timeOffset,
    amplitude,
    motion,
    idle: idleParams(mixHash(seed, 1)),
    tailSway: tailSwayOf(model, place.cast.species),
    earTwitch: earTwitchOf(place.cast.species),
    lookYaw,
    lookPitch,
    passages,
    sway: swayOfSeed(seed),
    posture: postureOfSeed(seed),
    looks: planLooks(notes, beats, []),
    longRests,
    note,
  };
}

/**
 * Gives the place of the head of an animal on the stage, for the looks of the players: the
 * conductor, or the leader of a chamber group.
 *
 * @param model The model of the animal.
 * @param place The place of the animal.
 * @returns The point of the `head` bone in the bind pose.
 */
export function headOf(
  model: PlayerModel,
  place: Pick<ConductorPlace, 'position' | 'facing'>,
): Vec3 {
  return toVec3(
    new Vector3(...(model.skeleton.positions[boneIndex('head')] ?? [0, 0, 0]))
      .applyAxisAngle(Y_AXIS, place.facing)
      .add(new Vector3(...place.position)),
  );
}

/**
 * Gives the seats of a score as the cues see them (design 5.4): the motion family of each seat,
 * its players, and the middle of their eyes in the model axes of the conductor.
 *
 * @param place The place of the conductor.
 * @param players The places of the players.
 * @param seatCount The number of seats.
 * @returns One entry for each seat, `null` for a seat with no players.
 */
function cueSeats(
  place: ConductorPlace,
  players: readonly PlayerPlace[],
  seatCount: number,
): (CueSeat | null)[] {
  return Array.from({ length: seatCount }, (_, seat): CueSeat | null => {
    const own = players.filter((p) => p.cast.seatIndex === seat);
    const first = own[0];
    if (!first) {
      return null;
    }
    const middle = new Vector3();
    for (const p of own) {
      middle.add(new Vector3(...p.position));
    }
    middle.multiplyScalar(1 / own.length).sub(new Vector3(...place.position));
    middle.y += CUE_MOTION.eyeHeight;
    return {
      family: MOTION_FAMILIES[first.cast.instrument],
      players: own.length,
      center: toVec3(middle.applyAxisAngle(Y_AXIS, -place.facing)),
    };
  });
}

/**
 * Gives the times of the beats of the felt pulse (design 5.1).
 *
 * @param beats The conducted beats, sorted by time.
 * @returns The times of the beats with `pulse`, sorted.
 */
export function pulseTimes(beats: readonly Beat[]): Float64Array {
  return Float64Array.from(
    beats.filter((beat) => beat.pulse),
    (beat) => beat.timeSec,
  );
}

/**
 * Gives the facts of the body of the conductor that limit a cue (design 5.4): the largest turn of
 * the head to each side and the angle up of the left hand, from degrees to radians. A body with no
 * such fact takes the values of `CUE_MOTION`.
 *
 * @param model The model of the conductor.
 * @returns The limits that the body gives.
 */
function cueFacts(model: PlayerModel): CueFacts {
  const { cueHeadLeft, cueHeadRight, cueLift } = model.studio.body;
  const facts: CueFacts = {};
  if (cueHeadLeft !== undefined) {
    facts.headLeft = cueHeadLeft * MathUtils.DEG2RAD;
  }
  if (cueHeadRight !== undefined) {
    facts.headRight = cueHeadRight * MathUtils.DEG2RAD;
  }
  if (cueLift !== undefined) {
    facts.cueLift = cueLift * MathUtils.DEG2RAD;
  }
  return facts;
}

/**
 * Calculates the data of the conductor that the pose needs at each frame (design 5.4): the beats
 * of the baton, the cues with the turns to the cued seats, the levels, the trends, and the held
 * chords for the left hand, and the expression of the body. The conductor has no timing offset, no look, and a rest motion
 * that does not vary. Pure: the same inputs give the same plan.
 *
 * @param inputs The model, the place, the beats, and the notes of the score.
 * @param seed The seed of the conductor.
 * @returns The plan of the conductor.
 */
export function prepareConductor(inputs: ConductorInputs, seed: number): PlayerPlan {
  return runAll(prepareConductorSteps(inputs, seed));
}

/**
 * Calculates the plan of the conductor as {@link prepareConductor} does, in steps (design 7.2).
 *
 * @param inputs The model, the place, the beats, and the notes.
 * @param seed The seed of the conductor.
 * @returns The steps, which return the plan of the conductor.
 */
function* prepareConductorSteps(inputs: ConductorInputs, seed: number): Steps<PlayerPlan> {
  const { model, place, beats, notes, loudness, players } = inputs;
  const rig = conductorRig(model);
  yield;
  const expression = buildExpressionTrack(beats, notes, loudness, inputs.seatCount);
  const baton = buildBatonTrack(beats, notes, loudness, expression);
  yield;
  const cues = findCues({
    beats,
    notes,
    loudness,
    seats: cueSeats(place, players, inputs.seatCount),
    eyes: model.skeleton.positions[boneIndex('head')] ?? [0, 0, 0],
    shoulder: rig.left.bind.shoulder,
    baton,
    ...cueFacts(model),
  });
  yield;
  const left = buildLeftHandTrack(baton.beats, notes, loudness);
  return {
    seatIndex: -1,
    instrument: CONDUCTOR.instrument,
    skeleton: model.skeleton,
    timeOffset: 0,
    amplitude: 1,
    motion: CONDUCTOR_MOTION,
    idle: idleParams(mixHash(seed, 1)),
    tailSway: 1,
    earTwitch: 1,
    lookYaw: 0,
    lookPitch: 0,
    passages: buildPassages([], []),
    sway: PLAIN_SWAY,
    posture: PLAIN_POSTURE,
    looks: new Float64Array(),
    longRests: new Float64Array(),
    note: {
      family: 'conductor',
      rig,
      baton,
      cues,
      left,
      expression,
      audienceTurn: audienceTurnOf(place.facing),
    },
  };
}

/**
 * Gives the turn of the conductor from its facing to the audience (design 5.4). The audience sits
 * at +z, so a facing of 0 (to -z, the orchestra) gives a half turn. The bear turns to its left,
 * past the first violins and the leader of the orchestra, also in a half turn.
 *
 * @param facing The facing of the conductor, in radians around y: 0 faces -z.
 * @returns The turn, in radians, from above -pi to pi, positive to the left.
 */
function audienceTurnOf(facing: number): number {
  const turn = MathUtils.euclideanModulo(Math.PI - facing + Math.PI, 2 * Math.PI) - Math.PI;
  return turn <= -Math.PI + 1e-9 ? Math.PI : turn;
}

/**
 * The sections whose principal player leads a chamber group, in order (design 5.4): the first
 * violin, the pianist, then the high winds and the brass, which give the breath of the start.
 */
const LEADER_SECTIONS: readonly SectionId[] = [
  'violin',
  'piano',
  'flute',
  'oboe',
  'clarinet',
  'trumpet',
  'horn',
];

/**
 * Finds the leader of a chamber group (design 5.4): the principal player of the first seat of the
 * first section of {@link LEADER_SECTIONS}, such as the first violin of a string quartet or the
 * pianist of a piano trio. With none of these sections, the principal player of the first seat
 * leads.
 *
 * @param score The score.
 * @param layout The layout of the score.
 * @returns The index of the player in `layout.players`, or `null` with no players.
 */
function leaderOf(score: Score, layout: SceneLayout): number | null {
  const principals = layout.players.flatMap((place, index) => {
    const seat = score.seats[place.cast.seatIndex];
    if (!seat || place.cast.player !== 0) {
      return [];
    }
    const section = LEADER_SECTIONS.indexOf(seat.section);
    return [
      {
        index,
        section: section < 0 ? LEADER_SECTIONS.length : section,
        inSection: seat.indexInSection,
        seat: place.cast.seatIndex,
      },
    ];
  });
  const first = principals.toSorted(
    (a, b) => a.section - b.section || a.inSection - b.inSection || a.seat - b.seat,
  )[0];
  return first ? first.index : null;
}

/**
 * Gives the point of each player of a chamber group for its idle looks (design 5.1, 5.4). The
 * players look at the head of the leader, and the leader looks at the middle of the heads of the
 * others. A player alone looks ahead, to the audience.
 *
 * @param layout The layout of the group.
 * @param models The player models.
 * @param leader The index of the leader.
 * @returns The point of each player, in the order of `layout.players`.
 */
function chamberLooks(layout: SceneLayout, models: ModelCache, leader: number): Vec3[] {
  const heads = layout.players.map((place) => {
    const { species, instrument, kettles, support } = place.cast;
    return headOf(models.get(species, instrument, kettles, support), place);
  });
  const others = heads.filter((_, i) => i !== leader);
  const middle = new Vector3();
  for (const head of others) {
    middle.add(new Vector3(...head));
  }
  middle.multiplyScalar(1 / Math.max(1, others.length));
  return heads.map((head, i) => {
    if (i !== leader) {
      return heads[leader] ?? head;
    }
    if (others.length > 0) {
      return toVec3(middle);
    }
    const facing = layout.players[i]?.facing ?? 0;
    return [head[0] - 3 * Math.sin(facing), head[1], head[2] - 3 * Math.cos(facing)];
  });
}

/** A plan to reuse in {@link preparePoses}, with the players to prepare again. */
interface PlanReuse {
  /** The plan of the same score, layout, seed, and models. */
  readonly plan: PosePlan;
  /** The indices of the players of the layout to prepare again. */
  readonly players: ReadonlySet<number>;
}

/**
 * The seed of the pose of the app. A fixed seed gives each demo the same seeded offsets and idle
 * motion on each visit (design 5.3).
 */
export const POSE_SEED = 1;

/**
 * Calculates the data of a score that the pose needs at each frame (design 5.1): the plan of each
 * player and of the conductor. Pure: the same inputs give the same plan.
 *
 * @param score The score.
 * @param layout The layout of the score, from `layoutScene()`.
 * @param seed The seed of the scene.
 * @param models The player models of the score, which the layout and the scene can share. A new
 *   cache by default.
 * @param reuse The plan of the same score, layout, seed, and models, and the indices of the
 *   players to prepare again. Each other player keeps its plan. A tool that changes one hold in
 *   memory, such as `pnpm hold-scan`, prepares only the players of that hold. `null` prepares
 *   each player.
 * @returns The plan for `poseAt()`.
 */
export function preparePoses(
  score: Score,
  layout: SceneLayout,
  seed: number,
  models = new ModelCache(),
  reuse: PlanReuse | null = null,
): PosePlan {
  return runAll(preparePosesSteps(score, layout, seed, models, reuse));
}

/**
 * Calculates the pose plan of a score as {@link preparePoses} does, in steps (design 7.2).
 *
 * @param score The score.
 * @param layout The layout of the score.
 * @param seed The seed of the scene.
 * @param models The player models of the score.
 * @param reuse The plan to reuse for the players that do not change, or `null`.
 * @returns The steps, which return the plan.
 */
export function* preparePosesSteps(
  score: Score,
  layout: SceneLayout,
  seed: number,
  models: ModelCache,
  reuse: PlanReuse | null = null,
): Steps<PosePlan> {
  const rigs = createRigCache();
  const bear = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
  const stand = layout.conductor;
  const leader = stand ? null : leaderOf(score, layout);
  let looks: readonly Vec3[] = [];
  if (stand) {
    const head = headOf(bear, stand);
    looks = layout.players.map(() => head);
  } else if (leader !== null) {
    looks = chamberLooks(layout, models, leader);
  }
  const loudness = noteLoudness(score);
  yield;
  const notes = notesOfPlayers(score, layout, loudness);
  yield;
  const pedals = sustainPedals(score);
  const beats = Float64Array.from(score.beats, (b) => b.timeSec);
  const players: PlayerPlan[] = [];
  for (const [index, place] of layout.players.entries()) {
    yield;
    const kept = reuse && !reuse.players.has(index) ? reuse.plan.players[index] : undefined;
    if (kept) {
      players.push(kept);
      continue;
    }
    const { cast } = place;
    const own = notes[index] ?? { notes: [], loudness: [] };
    const plan = yield* preparePlayerSteps(
      {
        model: models.get(cast.species, cast.instrument, cast.kettles, cast.support),
        place,
        notes: own.notes,
        loudness: own.loudness,
        beats,
        lookTarget: looks[index] ?? layout.podium,
        seatSeed: seatSeedOf(seed, cast.seatIndex),
        pedal: pedals[cast.seatIndex] ?? NO_PEDAL,
        endSec: score.durationSec,
      },
      mixHash(seed, index),
      rigs,
    );
    players.push(plan);
  }
  yield;
  const conductor = stand
    ? yield* prepareConductorSteps(
        {
          model: bear,
          place: stand,
          beats: score.beats,
          notes: score.notes,
          loudness,
          seatCount: score.seats.length,
          players: layout.players,
        },
        mixHash(seed, -1),
      )
    : null;
  yield;
  const shared = scoreLooks(score, beats, conductor);
  const looked: PlayerPlan[] = [];
  for (const [index, plan] of players.entries()) {
    const planned = planLooks(notes[index]?.notes ?? [], beats, shared(plan.seatIndex));
    looked.push({ ...plan, looks: planned });
  }
  return {
    players: looked,
    conductor,
    leader,
    beats,
    pulses: pulseTimes(score.beats),
  };
}

/**
 * Gives the looks of a score that its players share (design 5.1): a look at each cue of the
 * conductor to the seats of the cue, and a look at the final chord for each seat.
 *
 * @param score The score.
 * @param beats The times of the conducted beats.
 * @param conductor The plan of the conductor, or `null` for a chamber group.
 * @returns The looks of the seat of a player, two song times each: the head comes onto the target
 *   at the first and leaves it at the second.
 */
function scoreLooks(
  score: Score,
  beats: Float64Array,
  conductor: PlayerPlan | null,
): (seatIndex: number) => (readonly [number, number])[] {
  const bySeat = new Map<number, [number, number][]>();
  if (conductor?.note.family === 'conductor') {
    for (const cue of conductor.note.cues.cues) {
      for (const seat of cue.seats) {
        const list = bySeat.get(seat) ?? [];
        list.push([cue.landSec - cue.beatSec, cue.landSec + LOOK_PLAN.cueHoldSec]);
        bySeat.set(seat, list);
      }
    }
  }
  const final = findFinal(score.notes, beats, score.seats.length);
  const last: [number, number][] = final ? [[final.startSec - final.beatSec, final.endSec]] : [];
  return (seatIndex) => [...(bySeat.get(seatIndex) ?? []), ...last];
}
