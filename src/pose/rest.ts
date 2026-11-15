import type { InstrumentId } from '../models/instruments/types.ts';
import { isInFamily } from './family.ts';
import { hashUnit, mixHash } from './random.ts';
import type { SeatAudibility, Transport } from './types.ts';

/** The times of the rest pose, in wall clock seconds (design 5.2, 5.5). */
export const REST_TIMES = {
  /**
   * The players keep their instruments up for this time after a pause or a stop. A pause in the
   * count-in has no hold (`Transport.holdSec`).
   */
  hold: 3,
} as const;

/**
 * Limits a number to [0, 1].
 *
 * @param x The number.
 * @returns The number in [0, 1].
 */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Eases a linear weight, so that a lift or a lowering starts and stops with no jump of speed.
 *
 * @param x The linear weight, in [0, 1].
 * @returns The eased weight, in [0, 1].
 */
export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/**
 * The timing of one move of the instruments of an animal: a lift or a lowering (design 5.2). The
 * move starts after its delay and eases from the height at its start to the new height.
 */
interface RestMove {
  /** The wait before the move starts, in wall clock seconds. */
  readonly delaySec: number;
  /** The duration of the move, in wall clock seconds, above 0. */
  readonly durationSec: number;
  /**
   * The seeded skew of the curve of the move, near 1. A value below 1 moves the largest speed
   * nearer to the start, and a value above 1 nearer to the end.
   */
  readonly skew: number;
}

/** The seeded lift and lowering of the instruments of one animal (design 5.2, 5.5). */
export interface RestMotion {
  readonly lift: RestMove;
  readonly lower: RestMove;
  /**
   * The longest lift of the group of the animal, with its delay, in seconds. The players with a
   * carried instrument are one group, and the other players are a second group. A play with a
   * short count-in scales all lifts of a group by one factor, so that they end in time and keep
   * their order ({@link liftScale}). A long rest starts the lift of the animal by this time
   * before the entry (`findLongRests()` of `pose/long-rests.ts`).
   */
  readonly fitSec: number;
}

/** A range of seeded values. */
interface Range {
  readonly min: number;
  readonly max: number;
}

/** The ranges of the seeded lift and lowering of a player, in seconds (design 5.2). */
export const REST_MOTION = {
  /**
   * The duration of the lift of a player. A carried instrument ({@link carriesInstrument}) goes
   * from the lap to the jaw or to the lips, and its lift takes as long as the lowering on the
   * mean, because a real player brings the instrument up calmly. The lift of the other players
   * moves only the paws and the bow, so it is shorter.
   */
  liftSec: {
    carried: { min: 1.1, max: 1.5 },
    others: { min: 0.6, max: 0.9 },
  },
  /** The duration of the lowering of a player. */
  lowerSec: { min: 1, max: 1.6 },
  /**
   * The delay of the lift of the principal of a seat. The woodwinds and the brass lift a moment
   * before the other seats, because they also take a breath before the first note.
   */
  seatLiftSec: {
    winds: { min: 0, max: 0.1 },
    others: { min: 0.05, max: 0.2 },
  },
  /** The delay of the lowering of the principal of a seat, after the hold. */
  seatLowerSec: { min: 0, max: 0.25 },
  /**
   * The ripple through a seat: the later players of a seat follow the principal, and their delay
   * comes nearer to this value with each player.
   */
  rippleSec: 0.45,
  /** Each player after the principal closes this seeded part of the ripple that remains. */
  rippleStep: { min: 0.3, max: 0.5 },
  /** The skew of the curve of each move ({@link RestMove.skew}). */
  skew: { min: 0.8, max: 1.25 },
  /** The lifts of a play end at least this time before its first sound. */
  leadMarginSec: 0.05,
} as const;

/**
 * Tells if a player carries its instrument from the lap to the jaw or to the lips in a lift
 * (design 5.2): a violin, a viola, a woodwind, or a brass instrument. A cellist, a contrabassist, a
 * pianist, a harpist, a percussionist, and a singer lift only the paws and the bow.
 *
 * @param instrument The instrument of the player.
 * @returns True for a carried instrument.
 */
function carriesInstrument(instrument: InstrumentId): boolean {
  return (
    instrument === 'violin' ||
    instrument === 'viola' ||
    isInFamily(instrument, ['woodwind', 'brass'])
  );
}

/**
 * Gives the longest lift of a kind of player, with its delay: the longest delay of a seat, the
 * full ripple, and the longest lift of the kind (design 5.2). The lifts of the players of one kind
 * scale together by it in a count-in, and a long rest starts the lift by it.
 *
 * @param carried True for a player with a carried instrument ({@link carriesInstrument}).
 * @returns The time, in seconds.
 */
function liftFitSec(carried: boolean): number {
  const m = REST_MOTION;
  return (
    Math.max(m.seatLiftSec.winds.max, m.seatLiftSec.others.max) +
    m.rippleSec +
    (carried ? m.liftSec.carried.max : m.liftSec.others.max)
  );
}

/**
 * The longest lift of a player, with its delay: the fit of a carried instrument. After it, no
 * player moves for a play (design 5.2).
 */
export const LIFT_FIT_SEC = liftFitSec(true);

/** The longest lowering of a player, with its delay after the hold (design 5.2). */
export const LOWER_MAX_SEC =
  REST_MOTION.seatLowerSec.max + REST_MOTION.rippleSec + REST_MOTION.lowerSec.max;

/**
 * The lift and the lowering of the conductor (design 5.2, 5.4). The conductor gives the count-in,
 * so it does not vary: it lifts in 0.3 s and lowers in 0.6 s, with no delay.
 */
export const CONDUCTOR_MOTION: RestMotion = {
  lift: { delaySec: 0, durationSec: 0.3, skew: 1 },
  lower: { delaySec: 0, durationSec: 0.6, skew: 1 },
  fitSec: 0.3,
};

/**
 * Gives a seeded value in a range.
 *
 * @param range The range.
 * @param unit A seeded number in [0, 1).
 * @returns The value.
 */
function inRange(range: Range, unit: number): number {
  return range.min + unit * (range.max - range.min);
}

/** The slots of the seeded values of a seat, for {@link hashUnit}. */
const SEAT_SLOTS = { liftDelay: 0, lowerDelay: 1, liftRipple: 2, lowerRipple: 3 } as const;

/**
 * Calculates the ripple delay of a player of a seat (design 5.2). The principal (index 0) has no
 * delay. Each later player closes a seeded part of the ripple that remains, so the delays rise
 * with the index, and come nearer to {@link REST_MOTION.rippleSec}.
 *
 * @param seatSeed The seed of the seat. The players of one seat share it.
 * @param slot The slot of the move: one value for the lift and one for the lowering.
 * @param index The index of the player in its seat.
 * @returns The delay, in seconds, from 0 to below `rippleSec`.
 */
function rippleDelay(seatSeed: number, slot: number, index: number): number {
  const m = REST_MOTION;
  const seed = mixHash(seatSeed, slot);
  let remaining = 1;
  for (let k = 1; k <= index; k++) {
    remaining *= 1 - inRange(m.rippleStep, hashUnit(seed, k));
  }
  return m.rippleSec * (1 - remaining);
}

/**
 * Chooses the seeded lift and lowering of a player (design 5.2). The principal of a seat moves
 * first, after the seeded delay of its seat, and the later players follow in a ripple. Each move
 * has its own seeded duration and curve, so a player that lifts early does not lower late.
 *
 * @param instrument The instrument of the player.
 * @param index The index of the player in its seat: 0 is the principal.
 * @param seatSeed The seed of the seat. The players of one seat share it.
 * @param next The seeded random numbers of the player, in [0, 1).
 * @returns The rest motion of the player.
 */
export function restMotion(
  instrument: InstrumentId,
  index: number,
  seatSeed: number,
  next: () => number,
): RestMotion {
  const m = REST_MOTION;
  const winds = isInFamily(instrument, ['woodwind', 'brass']);
  const seatLift = winds ? m.seatLiftSec.winds : m.seatLiftSec.others;
  const carried = carriesInstrument(instrument);
  const s = SEAT_SLOTS;
  return {
    lift: {
      delaySec:
        inRange(seatLift, hashUnit(seatSeed, s.liftDelay)) +
        rippleDelay(seatSeed, s.liftRipple, index),
      durationSec: inRange(carried ? m.liftSec.carried : m.liftSec.others, next()),
      skew: inRange(m.skew, next()),
    },
    lower: {
      delaySec:
        inRange(m.seatLowerSec, hashUnit(seatSeed, s.lowerDelay)) +
        rippleDelay(seatSeed, s.lowerRipple, index),
      durationSec: inRange(m.lowerSec, next()),
      skew: inRange(m.skew, next()),
    },
    fitSec: liftFitSec(carried),
  };
}

/**
 * Eases the progress of a move: a smoothstep of the progress with a seeded skew of the time. The
 * move starts and ends with no speed. With the skew 1, it is the curve of the conductor.
 *
 * @param x The linear progress, in [0, 1].
 * @param skew The skew of the move, near 1.
 * @returns The eased progress, in [0, 1].
 */
export function easeMove(x: number, skew: number): number {
  return smoothstep(clamp01(x) ** skew);
}

/**
 * Gives the eased progress of a move at a time after its start point (design 5.2).
 *
 * @param move The timing of the move.
 * @param elapsed The wall clock seconds since the change, or since the end of the hold.
 * @param scale The factor of the delay and the duration: 1, or less to fit a short count-in.
 * @returns The eased progress, from 0 before the delay ends to 1 at the end of the move.
 */
export function moveProgress(move: RestMove, elapsed: number, scale: number): number {
  const delay = move.delaySec * scale;
  const duration = move.durationSec * scale;
  if (elapsed <= delay) {
    return 0;
  }
  return duration > 0 ? easeMove((elapsed - delay) / duration, move.skew) : 1;
}

/**
 * Gives the factor by which a play scales the lifts of a group (design 5.2). The lifts end
 * {@link REST_MOTION.leadMarginSec} before the first sound, also in a short count-in, and they
 * keep their order.
 *
 * @param motion The rest motion of an animal of the group.
 * @param leadSec The wall clock seconds from the play to its first sound.
 * @returns The factor, from 0 to 1.
 */
export function liftScale(motion: RestMotion, leadSec: number): number {
  return Math.min(1, Math.max(0, leadSec - REST_MOTION.leadMarginSec) / motion.fitSec);
}

/**
 * Calculates the height of the instruments of an animal from the transport (design 5.2): 0 is
 * the rest pose, and 1 is the playing pose. Before the first play, it is 0. A play lifts the
 * instruments with the lift of the animal, scaled to fit the count-in. A pause keeps them for
 * `transport.holdSec`, then lowers them with the lowering of the animal. Each move starts from
 * the height of the animal at the change, in `transport.before`, so fast changes make no jump.
 *
 * @param motion The rest motion of the animal.
 * @param transport The play state.
 * @param wallTime The wall clock time, in seconds.
 * @returns The height, in [0, 1].
 */
export function transportHeight(
  motion: RestMotion,
  transport: Transport,
  wallTime: number,
): number {
  const changed = transport.changedAtWall;
  if (changed === null) {
    return 0;
  }
  const from = transport.before ? transportHeight(motion, transport.before, changed) : 0;
  if (transport.playing) {
    const scale = liftScale(motion, transport.leadSec);
    return from + (1 - from) * moveProgress(motion.lift, wallTime - changed, scale);
  }
  return from * (1 - moveProgress(motion.lower, wallTime - changed - transport.holdSec, 1));
}

/**
 * Calculates the height of the instruments of a player from the audibility of its seat (design
 * 5.5). A seat with no change sounds: the height is 1. A silent seat lowers the instruments with
 * the lowering of the player, and a seat that sounds again lifts them with the lift of the
 * player. Each move starts from the height of the player at the change, in `audibility.before`.
 *
 * @param motion The rest motion of the player.
 * @param audibility The mute and solo result of the seat, or `undefined` for a seat with no change.
 * @param wallTime The wall clock time, in seconds.
 * @returns The height, in [0, 1].
 */
export function seatHeight(
  motion: RestMotion,
  audibility: SeatAudibility | undefined,
  wallTime: number,
): number {
  if (!audibility) {
    return 1;
  }
  const changed = audibility.changedAtWall;
  const from = seatHeight(motion, audibility.before ?? undefined, changed);
  const elapsed = wallTime - changed;
  if (audibility.audible) {
    return from + (1 - from) * moveProgress(motion.lift, elapsed, 1);
  }
  return from * (1 - moveProgress(motion.lower, elapsed, 1));
}

/**
 * Tells if all animals end the move of a transport by a wall time (design 5.2). After that time,
 * the height of each animal is the end of the move, whatever came before the transport.
 *
 * @param transport The play state.
 * @param wallTime The wall clock time, in seconds.
 * @returns True if no animal moves for this transport after `wallTime`.
 */
export function transportSettled(transport: Transport, wallTime: number): boolean {
  const changed = transport.changedAtWall;
  if (changed === null) {
    return true;
  }
  const end = transport.playing ? LIFT_FIT_SEC : transport.holdSec + LOWER_MAX_SEC;
  return wallTime - changed >= end;
}

/**
 * Tells if all players of a seat end the move of its audibility by a wall time (design 5.5).
 *
 * @param audibility The mute and solo result of the seat.
 * @param wallTime The wall clock time, in seconds.
 * @returns True if no player of the seat moves for this audibility after `wallTime`.
 */
export function seatSettled(audibility: SeatAudibility, wallTime: number): boolean {
  const end = audibility.audible ? LIFT_FIT_SEC : LOWER_MAX_SEC;
  return wallTime - audibility.changedAtWall >= end;
}
