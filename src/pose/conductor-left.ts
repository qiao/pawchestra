import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { smoothstep } from '../math.ts';

/**
 * The rules of the left hand of the conductor between its cues (design 5.4). The values come from
 * the score, so the pose keeps no state.
 */
export const LEFT_HAND_RULES = {
  /**
   * The level of a beat is a part of this percentile of the levels of the song, so that each song
   * has its own loud passages.
   */
  topPercentile: 0.95,
  /** The level at a beat is the mean of the beats within this time before and after it. */
  levelSec: 1,
  /** The trend at a beat compares the mean level of this time after it with this time before it. */
  trendSec: 2,
  /** The left hand starts to mirror the beat at this level, and mirrors it fully at `mirrorTo`. */
  mirrorFrom: 0.7,
  mirrorTo: 0.9,
  /** A crescendo or a diminuendo starts to show at this trend, and shows fully at `trendTo`. */
  trendFrom: 0.06,
  trendTo: 0.2,
  /** A held chord: no note starts in at least this time, and the chord sounds this long. */
  holdGapSec: 1.2,
  /** A weight of the mirror, the swell, or the fade changes by at most this much in 1 s. */
  maxRate: 1.5,
  /** The palm of a held chord rises in this time after the start of the chord. */
  holdRiseSec: 0.4,
  /** At a cut-off, the hand closes in this time before the sound ends. */
  closeSec: 0.25,
  /** After the cut-off, or when the next notes start, the hand goes back in this time. */
  holdFallSec: 0.5,
} as const;

/** A held chord: a time with sound and with no new note, for the held palm (design 5.4). */
interface Hold {
  /** The start of the last notes before the gap, in song seconds. */
  readonly startSec: number;
  /** The end of the hold: the end of the sound, or the start of the next notes. */
  readonly endSec: number;
  /** Whether the sound stops at `endSec` before the next notes, so that the hand cuts it off. */
  readonly cutOff: boolean;
}

/** The data of the left hand that the pose looks up at each frame (design 5.4). */
export interface LeftHandTrack {
  /** The times of the conducted beats, sorted. */
  readonly beats: Float64Array;
  /** The weight of the mirror of the beat at each beat, from 0 to 1. */
  readonly mirror: Float32Array;
  /** The weight of the raised hand of a crescendo at each beat, from 0 to 1. */
  readonly swell: Float32Array;
  /** The weight of the lowered hand of a diminuendo at each beat, from 0 to 1. */
  readonly fade: Float32Array;
  /** The held chords, sorted by start. */
  readonly holds: readonly Hold[];
  /** The starts of the holds, for the search. */
  readonly holdStarts: Float64Array;
}

/** The weights of the left hand at one time, each from 0 to 1 (design 5.4). */
export interface LeftHandState {
  /** The weight of the mirror of the beat in a loud passage. */
  mirror: number;
  /** The weight of the raised hand of a crescendo. */
  swell: number;
  /** The weight of the lowered hand of a diminuendo. */
  fade: number;
  /** The weight of the held palm of a held chord. */
  hold: number;
  /** The close of the hand at a cut-off: 0 open, 1 closed. */
  close: number;
}

/**
 * Makes a state of the left hand with no gesture.
 *
 * @returns The state.
 */
export function createLeftHandState(): LeftHandState {
  return { mirror: 0, swell: 0, fade: 0, hold: 0, close: 0 };
}

/**
 * Gives the level of each beat: the root of the sum of the squares of the loudness of the notes
 * that sound in it, as a part of the level of the loud beats of the song. Thus more players and
 * louder notes give a higher level.
 *
 * @param beats The times of the beats, sorted.
 * @param notes The notes, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The level of each beat, from 0 to 1.
 */
export function beatLevels(
  beats: Float64Array,
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
): Float32Array {
  const energy = new Float64Array(beats.length);
  for (const [i, note] of notes.entries()) {
    const square = (loudness[i] ?? 0) ** 2;
    // The note sounds in the beat of its start and in each later beat that starts before its end.
    for (let k = Math.max(0, lastAtOrBefore(beats, note.startSec)); k < beats.length; k++) {
      if ((beats[k] ?? Infinity) >= note.endSec) {
        break;
      }
      energy[k] = (energy[k] ?? 0) + square;
    }
  }
  const levels = Array.from(energy, Math.sqrt);
  const sounding = levels.filter((l) => l > 0).toSorted((a, b) => a - b);
  const top =
    sounding[Math.floor((sounding.length - 1) * LEFT_HAND_RULES.topPercentile)] ?? Infinity;
  return Float32Array.from(levels, (l) => Math.min(1, l / top));
}

/**
 * Gives the mean of the values of the beats in a time window.
 *
 * @param beats The times of the beats, sorted.
 * @param values The value of each beat.
 * @param from The start of the window.
 * @param to The end of the window.
 * @returns The mean, or `null` if no beat is in the window.
 */
export function meanIn(
  beats: Float64Array,
  values: Float32Array,
  from: number,
  to: number,
): number | null {
  let sum = 0;
  let count = 0;
  for (let k = Math.max(0, lastAtOrBefore(beats, from - 1e-9) + 1); k < beats.length; k++) {
    if ((beats[k] ?? Infinity) > to) {
      break;
    }
    sum += values[k] ?? 0;
    count++;
  }
  return count > 0 ? sum / count : null;
}

/**
 * Finds the held chords of a score (design 5.4): the last notes that start before a gap of at
 * least 1.2 s with no new note, while the sound goes on for at least 1.2 s. The sound goes on
 * until the end of all earlier notes. A hold that starts at the end of the last hold, with no
 * cut-off between them, makes the last hold longer.
 *
 * @param notes The notes, sorted by start.
 * @returns The holds, sorted by start.
 */
export function findHolds(notes: readonly PlayerNote[]): Hold[] {
  const gap = LEFT_HAND_RULES.holdGapSec;
  const holds: Hold[] = [];
  let soundEnd = -Infinity;
  let i = 0;
  while (i < notes.length) {
    const start = notes[i]?.startSec ?? 0;
    while (i < notes.length && (notes[i]?.startSec ?? 0) === start) {
      soundEnd = Math.max(soundEnd, notes[i]?.endSec ?? 0);
      i++;
    }
    const next = notes[i]?.startSec ?? Infinity;
    const end = Math.min(soundEnd, next);
    if (next - start < gap || end - start < gap) {
      continue;
    }
    // A hold that starts at the end of the last hold goes on, so that the palm stays up over a
    // run of long notes.
    const last = holds.at(-1);
    const from = last && !last.cutOff && last.endSec === start ? last.startSec : start;
    if (from !== start) {
      holds.pop();
    }
    holds.push({ startSec: from, endSec: end, cutOff: soundEnd < next });
  }
  return holds;
}

/**
 * Limits the change of a weight from one beat to the next, so that a gesture takes at least
 * `1 / rate` seconds. A forward pass limits each rise, and a backward pass limits each fall.
 * Both only lower a weight, so a short peak gives a smaller gesture.
 *
 * @param beats The times of the beats, sorted.
 * @param weights The weight at each beat. The function changes it in place.
 * @param rate The largest change in 1 s. `LEFT_HAND_RULES.maxRate` by default.
 * @returns `weights`.
 */
export function limitRate(
  beats: Float64Array,
  weights: Float32Array,
  rate: number = LEFT_HAND_RULES.maxRate,
): Float32Array {
  for (let k = 1; k < weights.length; k++) {
    const step = rate * ((beats[k] ?? 0) - (beats[k - 1] ?? 0));
    weights[k] = Math.min(weights[k] ?? 0, (weights[k - 1] ?? 0) + step);
  }
  for (let k = weights.length - 2; k >= 0; k--) {
    const step = rate * ((beats[k + 1] ?? 0) - (beats[k] ?? 0));
    weights[k] = Math.min(weights[k] ?? 0, (weights[k + 1] ?? 0) + step);
  }
  return weights;
}

/**
 * Gives the weight of a value between two limits, with a smoothstep.
 *
 * @param value The value.
 * @param from The value of the weight 0.
 * @param to The value of the weight 1.
 * @returns The weight, from 0 to 1.
 */
export function rampOf(value: number, from: number, to: number): number {
  return smoothstep((value - from) / (to - from));
}

/**
 * Calculates the data of the left hand of a score (design 5.4). The level at a beat is the mean
 * level of the beats within 1 s, and the trend is the mean level of the 2 s after it minus the
 * mean level of the 2 s before it. The level gives the weight of the mirror, and the trend the
 * weights of the raised and the lowered hand.
 *
 * @param beats The times of the conducted beats, sorted.
 * @param notes The notes, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The data.
 */
export function buildLeftHandTrack(
  beats: Float64Array,
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
): LeftHandTrack {
  const r = LEFT_HAND_RULES;
  const levels = beatLevels(beats, notes, loudness);
  const mirror = new Float32Array(beats.length);
  const swell = new Float32Array(beats.length);
  const fade = new Float32Array(beats.length);
  for (const [k, time] of beats.entries()) {
    const level = meanIn(beats, levels, time - r.levelSec, time + r.levelSec) ?? 0;
    const before = meanIn(beats, levels, time - r.trendSec, time);
    const after = meanIn(beats, levels, time + 1e-9, time + r.trendSec);
    const trend = before === null || after === null ? 0 : after - before;
    mirror[k] = rampOf(level, r.mirrorFrom, r.mirrorTo);
    swell[k] = rampOf(trend, r.trendFrom, r.trendTo);
    fade[k] = rampOf(-trend, r.trendFrom, r.trendTo);
  }
  const holds = findHolds(notes);
  return {
    beats,
    mirror: limitRate(beats, mirror),
    swell: limitRate(beats, swell),
    fade: limitRate(beats, fade),
    holds,
    holdStarts: Float64Array.from(holds, (h) => h.startSec),
  };
}

/**
 * Gives a value of the beats at a time: the values of the two beats around it, mixed with a
 * smoothstep, so that the value changes with no jump of speed.
 *
 * @param beats The times of the beats, sorted.
 * @param values The value of each beat.
 * @param time The song time.
 * @returns The value. Before the first beat and after the last beat, the value of that beat.
 */
export function valueAt(beats: Float64Array, values: Float32Array, time: number): number {
  const k = lastAtOrBefore(beats, time);
  if (k < 0) {
    return values[0] ?? 0;
  }
  const start = beats[k] ?? 0;
  const end = beats[k + 1];
  if (end === undefined) {
    return values[k] ?? 0;
  }
  const a = values[k] ?? 0;
  const b = values[k + 1] ?? 0;
  return a + (b - a) * smoothstep((time - start) / (end - start));
}

/**
 * Writes the weights of the left hand at a song time (design 5.4). The mirror follows the level,
 * the raised and the lowered hand follow the trend, and the held palm follows the held chords.
 *
 * @param track The data of the left hand.
 * @param time The song time.
 * @param out The state to write.
 */
export function leftHandAt(track: LeftHandTrack, time: number, out: LeftHandState): void {
  const r = LEFT_HAND_RULES;
  out.mirror = valueAt(track.beats, track.mirror, time);
  out.swell = valueAt(track.beats, track.swell, time);
  out.fade = valueAt(track.beats, track.fade, time);
  out.hold = 0;
  out.close = 0;
  // A hold can start while the hold before it still goes back, so both count.
  const k = lastAtOrBefore(track.holdStarts, time);
  for (const hold of [track.holds[k - 1], track.holds[k]]) {
    if (!hold) {
      continue;
    }
    const rise = smoothstep((time - hold.startSec) / r.holdRiseSec);
    const fall = 1 - smoothstep((time - hold.endSec) / r.holdFallSec);
    out.hold = Math.max(out.hold, Math.min(rise, fall));
    if (hold.cutOff) {
      out.close = Math.max(out.close, smoothstep(1 - (hold.endSec - time) / r.closeSec) * fall);
    }
  }
}
