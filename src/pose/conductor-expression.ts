import { MathUtils } from 'three';

import type { Beat, PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import type { BatonState } from './conductor-notes.ts';
import { beatLevels, limitRate, meanIn, rampOf, valueAt } from './conductor-left.ts';
import { smoothstep } from '../math.ts';

/**
 * The rules that read the expression of the conductor from the score (design 5.4,
 * `docs/reference/conductor-technique.md`). The values come from the score, so the pose keeps no
 * state.
 */
export const EXPRESSION_RULES = {
  /** The level at a beat is the mean of the beat levels within this time before and after it. */
  levelSec: 1,
  /** The soft weight is 0 at this level and 1 at `softTo`. */
  softFrom: 0.45,
  softTo: 0.15,
  /** The loud weight is 0 at this level and 1 at `loudTo`. */
  loudFrom: 0.6,
  loudTo: 0.9,
  /**
   * The trend at a beat compares the mean level of this time after it with this time before it.
   * A crescendo starts to show at the trend `riseFrom`, and shows fully at `riseTo`.
   */
  trendSec: 2,
  riseFrom: 0.06,
  riseTo: 0.2,
  /** The soft, the loud, and the crescendo weights change by at most this much in 1 s. */
  maxRate: 1,
  /**
   * The legato index of a beat is the mean length of the notes that start in it, as a part of the
   * beat, with the square of the loudness as the weight. The stroke is legato above `legatoFrom`
   * and staccato below `staccatoTo`.
   */
  legatoFrom: 0.7,
  staccatoTo: 0.35,
  /** The stroke of a beat is the mean of the beats within one beat, and at least this time, of it. */
  snapSec: 0.5,
  /** A note is on a beat when it starts this long before the beat or `onBeatAfterSec` after it. */
  onBeatBeforeSec: 0.03,
  onBeatAfterSec: 0.06,
  /** The onsets of a beat compare with the mean onsets of the beats in this time before it. */
  accentWindowSec: 2,
  /** An accent starts to show at this ratio to the onsets before it, and shows fully at `accentTo`. */
  accentFrom: 1.3,
  accentTo: 2.2,
  /**
   * An accent also needs strong onsets: this part of the 95th percentile of the onsets of the song
   * starts to show it, and `accentTopTo` shows it fully.
   */
  accentTopFrom: 0.3,
  accentTopTo: 0.6,
  /** Two accents are at least this far apart. The larger stays. */
  accentGapSec: 0.75,
  /**
   * A phrase starts after a time with no note start of at least this part of a beat, and of at
   * least `phraseGapMinSec`.
   */
  phraseGapBeats: 0.9,
  phraseGapMinSec: 0.6,
  /** The breath of a phrase start that is not an accent. */
  phraseBreath: 0.6,
  /** A smaller breath does not show. */
  minBreath: 0.15,
  /** Two breaths are at least this far apart. The larger breath stays. */
  breathGapSec: 4,
  /**
   * A climax is a downbeat with a level of at least `climaxLevel` that is at least `climaxRise`
   * above the lowest level of the time from `climaxBackSec` to 1 s before it.
   */
  climaxLevel: 0.85,
  climaxRise: 0.12,
  climaxBackSec: 6,
  /** Of the climax downbeats within this time, the downbeat with the largest rise wins. */
  climaxGroupSec: 4,
  /** A climax comes at least this long after the first beat. */
  climaxStartSec: 15,
  /** A piece has one climax for each this time of music, and at least one. */
  climaxEverySec: 80,
  /** Two climaxes are at least this far apart, and the last one is this far before the final chord. */
  climaxGapSec: 20,
  /**
   * The final chord: the last start of notes in at least this part of the seats that sound until
   * the end of the sound, within `finalEndSec`, at least `finalMinSec` before the end.
   */
  finalShare: 0.4,
  finalEndSec: 0.15,
  finalMinSec: 1.5,
  /** The final chord starts at most this long before the end of the sound. */
  finalBackSec: 12,
} as const;

/**
 * The sizes and the times of the expression of the conductor (design 5.4). Angles are in
 * radians, lengths in meters, times in seconds. A forte is "more energetic" more than larger
 * (`conductor-technique.md`), so the loud passage changes the speed of the stroke and the body
 * more than the size of the beat. The beat stays below the chin, except at a climax.
 */
export const EXPRESSION_MOTION = {
  /** The gesture size of the baton grows by this part in a loud passage. */
  loudSize: 0.2,
  /** The gesture size of the baton shrinks by this part in a soft passage. */
  softSize: 0.3,
  /**
   * In a crescendo, the gesture size grows by this part at the full trend, so that the beat grows
   * over the build.
   */
  riseSize: 0.25,
  /**
   * In a loud passage, a stroke rebounds this part of the beat sooner and falls this part later,
   * so that the stop is longer and the fall into the ictus is faster (`strokeOf()`).
   */
  loudEnergy: 0.1,
  /** The beat of a loud passage is this much higher in the beat plane. */
  loudLift: 0.04,
  /** The beat of a soft passage is this much lower in the beat plane. */
  softDrop: 0.045,
  /** The forward lean of the upper body in a soft passage: smaller, toward the players. */
  softLean: 7.5 * MathUtils.DEG2RAD,
  /** The head turns down this far in a soft passage. */
  softHead: 6 * MathUtils.DEG2RAD,
  /**
   * In a soft passage, the left hand takes this weight of the lowered open palm of a diminuendo
   * (`LEFT_HAND_PLACES.fade`), as a conductor keeps the sound down with the palm.
   */
  softPalm: 0.8,
  /** The knees bend so far that the hips drop this much in a soft passage. */
  softCrouch: 0.018,
  /** The upper body comes up by this angle in a loud passage, with the chest open. */
  loudLean: 2.25 * MathUtils.DEG2RAD,
  /** The head comes up this far in a loud passage. */
  loudHead: 3 * MathUtils.DEG2RAD,
  /** In a crescendo, the chest opens back by this angle, the head comes up, and the shoulders rise. */
  riseLean: 1.5 * MathUtils.DEG2RAD,
  riseHead: 3 * MathUtils.DEG2RAD,
  riseShrug: 5 * MathUtils.DEG2RAD,
  /** The breath lifts the chest by this angle back and the head by `breathHead`. */
  breathLean: 3.75 * MathUtils.DEG2RAD,
  breathHead: 6 * MathUtils.DEG2RAD,
  /** The breath raises the shoulders by this turn of each clavicle. */
  breathShrug: 4 * MathUtils.DEG2RAD,
  /** The breath takes this part of the preparation before the entry: it starts earlier. */
  breathStart: 1.5,
  /** The preparation of a breath is the beat before the entry, within these limits. */
  breathPrepMinSec: 0.3,
  breathPrepMaxSec: 0.8,
  /** The chest comes down in this time after the entry. */
  breathReleaseSec: 0.4,
  /**
   * The chest turns this part of the turn of a cue further, so that the upper body twists toward
   * the cued section.
   */
  cueTwist: 0.3,
  /**
   * A cue of the left hand takes away this part of a forward lean, so that the body comes up for
   * the cue and the head stays clear of the raised paw.
   */
  cueUpright: 0.6,
  /** An accent turns the head down by this angle and the upper body forward by `joltLean`. */
  joltHead: 9 * MathUtils.DEG2RAD,
  joltLean: 3 * MathUtils.DEG2RAD,
  /** An accent also raises the shoulders by this turn of each clavicle. */
  joltShrug: 4 * MathUtils.DEG2RAD,
  /** The jolt starts this long before the beat, is at its peak this long after it, and decays. */
  joltLeadSec: 0.1,
  joltPeakSec: 0.03,
  joltDecaySec: 0.22,
  /** The knees dip so far that the hips drop this much on an accented downbeat. */
  dip: 0.03,
  /** An accent on another beat dips this part of the dip. */
  offbeatDip: 0.5,
  dipLeadSec: 0.15,
  dipPeakSec: 0.06,
  dipDecaySec: 0.4,
  /** At a climax, the upper body comes up by this angle and the head by `climaxHead`. */
  climaxLean: 4.5 * MathUtils.DEG2RAD,
  climaxHead: 10.5 * MathUtils.DEG2RAD,
  /** At a climax, the shoulders rise by this turn of each clavicle, with the chest open. */
  climaxShrug: 8 * MathUtils.DEG2RAD,
  /** At a climax, the tip of the baton goes this far out and up in the beat plane. */
  climaxOut: 0.45,
  climaxUp: 0.33,
  /** The beat pattern keeps this part of its motion at the peak of a climax. */
  climaxBeat: 0.2,
  /** The arms open over a preparation within these limits, and stay open for one bar. */
  climaxFallBeats: 2,
  /** On the final chord, the baton rises to its hold this much above its beat, in this time. */
  finalRise: 0.12,
  finalRiseSec: 0.5,
  /** On a short final chord, the baton stops at the beat of the chord in this time. */
  finalStopSec: 0.12,
  /** During the hold, the baton rises slowly by this much more, to sustain the sound. */
  finalSustain: 0.04,
  /** The cut-off: one circle of this radius, in this time before the end of the sound. */
  finalCircle: 0.07,
  finalCircleSec: 0.7,
  /** After the cut-off, the baton stops this much lower, in this time. */
  finalClose: 0.06,
  finalCloseSec: 0.2,
  /** On the final chord, the body takes this part of the climax pose. */
  finalBody: 0.6,
} as const;

/** The final chord of a score, held to the end (design 5.4). */
export interface FinalChord {
  /** The start of the final chord, in song seconds. */
  readonly startSec: number;
  /** The end of the sound, in song seconds: the cut-off. */
  readonly endSec: number;
  /** The conducted beat at the start of the chord, in seconds. */
  readonly beatSec: number;
  /**
   * True for a chord held at least `finalMinSec`: the baton holds it and makes the circle of the
   * release. A short final chord stops the baton at its beat, with no hold.
   */
  readonly held: boolean;
}

/** The expression data of the conductor that the pose looks up at each frame (design 5.4). */
export interface ExpressionTrack {
  /** The times of the conducted beats, sorted. */
  readonly beats: Float64Array;
  /** The weight of a soft passage at each beat, from 0 to 1. */
  readonly soft: Float32Array;
  /** The weight of a loud passage at each beat, from 0 to 1. */
  readonly loud: Float32Array;
  /** The weight of a crescendo at each beat, from 0 to 1. */
  readonly rise: Float32Array;
  /** The staccato weight of the stroke from each beat to the next: 0 legato, 1 staccato. */
  readonly snap: Float32Array;
  /** The accent of each beat, from 0 to 1. */
  readonly accent: Float32Array;
  /** The dip of the knees at each beat, from 0 to 1: the accent, less on a beat that is not a downbeat. */
  readonly dip: Float32Array;
  /** The entries that get a breath, sorted. */
  readonly breaths: Float64Array;
  /** The size of each breath, from 0 to 1. */
  readonly breathSizes: Float32Array;
  /** The preparation of each breath, in seconds. */
  readonly breathPreps: Float32Array;
  /** The downbeats of the climaxes, sorted. */
  readonly climaxes: Float64Array;
  /** The conducted beat at each climax, in seconds. */
  readonly climaxBeats: Float32Array;
  /** The bar at each climax, in seconds. */
  readonly climaxBars: Float32Array;
  /** The final chord, or `null` for a song with no held final chord. */
  readonly final: FinalChord | null;
}

/** The expression of the conductor at one time (design 5.4). */
export interface ExpressionState {
  /** The forward lean of the upper body, in radians. */
  lean: number;
  /** The upward turn of the head, in radians. */
  head: number;
  /** The drop of the hips from a bend of the knees, in meters. */
  drop: number;
  /** The weight of the open arms of a climax, from 0 to 1. */
  climax: number;
  /** The weight of the final chord, from 0 to 1. */
  final: number;
  /** The weight of a held final chord, from 0 to 1: 0 for a short final chord. */
  hold: number;
  /** The close of the left hand at the final cut-off, from 0 to 1. */
  close: number;
  /** The weight of a soft passage, from 0 to 1: the left palm keeps the sound down. */
  soft: number;
  /** The weight of a crescendo, from 0 to 1: the left palm rises up. */
  rise: number;
  /** The weight of a loud passage, from 0 to 1. */
  loud: number;
  /** The rise of the shoulders: the turn of each clavicle, in radians. */
  shrug: number;
}

/**
 * Makes an expression state with no expression.
 *
 * @returns The state.
 */
export function createExpressionState(): ExpressionState {
  return {
    lean: 0,
    head: 0,
    drop: 0,
    climax: 0,
    final: 0,
    hold: 0,
    close: 0,
    soft: 0,
    rise: 0,
    loud: 0,
    shrug: 0,
  };
}

/**
 * Gives the onset strength of each beat: the root of the sum of the squares of the loudness of
 * the notes that start on it.
 *
 * @param beats The times of the beats, sorted.
 * @param notes The notes, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The onset strength of each beat.
 */
function onsetsOf(
  beats: Float64Array,
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
): Float32Array {
  const r = EXPRESSION_RULES;
  const energy = new Float64Array(beats.length);
  for (const [i, note] of notes.entries()) {
    const k = lastAtOrBefore(beats, note.startSec + r.onBeatBeforeSec);
    const beat = beats[k];
    if (beat !== undefined && note.startSec <= beat + r.onBeatAfterSec) {
      energy[k] = (energy[k] ?? 0) + (loudness[i] ?? 0) ** 2;
    }
  }
  return Float32Array.from(energy, Math.sqrt);
}

/**
 * Gives the accent of each beat: strong onsets, well above the onsets of the time before.
 *
 * @param beats The times of the beats, sorted.
 * @param onsets The onset strength of each beat.
 * @returns The accent of each beat, from 0 to 1.
 */
function accentsOf(beats: Float64Array, onsets: Float32Array): Float32Array {
  const r = EXPRESSION_RULES;
  const strong = Array.from(onsets)
    .filter((o) => o > 0)
    .toSorted((a, b) => a - b);
  const top = strong[Math.floor((strong.length - 1) * 0.95)] ?? Infinity;
  const accents = Float32Array.from(beats, (time, k) => {
    const onset = onsets[k] ?? 0;
    const before = meanIn(beats, onsets, time - r.accentWindowSec, time - 1e-6);
    if (before === null) {
      return 0;
    }
    const ratio = onset / Math.max(before, 1e-3);
    return (
      rampOf(ratio, r.accentFrom, r.accentTo) * rampOf(onset / top, r.accentTopFrom, r.accentTopTo)
    );
  });
  // Of two accents within `accentGapSec`, the larger stays, so that the head does not jolt on
  // each beat of a run of strong chords.
  for (const k of Array.from(accents.keys()).toSorted(
    (a, b) => (accents[b] ?? 0) - (accents[a] ?? 0),
  )) {
    const value = accents[k] ?? 0;
    if (value <= 0) {
      continue;
    }
    for (
      let j = k + 1;
      j < beats.length && (beats[j] ?? 0) - (beats[k] ?? 0) < r.accentGapSec;
      j++
    ) {
      if ((accents[j] ?? 0) <= value) {
        accents[j] = 0;
      }
    }
    for (let j = k - 1; j >= 0 && (beats[k] ?? 0) - (beats[j] ?? 0) < r.accentGapSec; j--) {
      if ((accents[j] ?? 0) < value) {
        accents[j] = 0;
      }
    }
  }
  return accents;
}

/**
 * Gives the staccato weight of the stroke from each beat to the next, from the legato index of
 * the notes that start in the beat.
 *
 * @param beats The times of the beats, sorted.
 * @param notes The notes, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The staccato weight of each beat, from 0 to 1.
 */
function snapsOf(
  beats: Float64Array,
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
): Float32Array {
  const r = EXPRESSION_RULES;
  const sum = new Float64Array(beats.length);
  const weight = new Float64Array(beats.length);
  for (const [i, note] of notes.entries()) {
    const k = Math.max(0, lastAtOrBefore(beats, note.startSec + r.onBeatBeforeSec));
    const start = beats[k] ?? 0;
    const end = beats[k + 1] ?? start + (k > 0 ? start - (beats[k - 1] ?? 0) : 0.5);
    const w = (loudness[i] ?? 0) ** 2;
    sum[k] = (sum[k] ?? 0) + w * Math.min(1, (note.endSec - note.startSec) / (end - start));
    weight[k] = (weight[k] ?? 0) + w;
  }
  const snaps = Float32Array.from(sum, (s, k) => {
    const w = weight[k] ?? 0;
    // A beat with no note start keeps the stroke of the beat before it.
    return w > 0 ? rampOf(s / w, r.legatoFrom, r.staccatoTo) : -1;
  });
  for (let k = 0; k < snaps.length; k++) {
    if ((snaps[k] ?? 0) < 0) {
      snaps[k] = k > 0 ? (snaps[k - 1] ?? 0) : 0;
    }
  }
  return snaps;
}

/** The breaths of a score, in the order of their times. */
interface Breaths {
  /** The entries, in song seconds. */
  readonly times: number[];
  /** The size of each breath, from 0 to 1. */
  readonly sizes: number[];
  /** The preparation of each breath, in seconds. */
  readonly preps: number[];
}

/**
 * Finds the entries that get a breath (design 5.4): the first beat, the starts of phrases after a
 * time with no note start, and the accents. Of two breaths within `breathGapSec`, the larger
 * stays.
 *
 * @param beats The times of the beats, sorted.
 * @param starts The starts of the notes, sorted.
 * @param onsets The onset strength of each beat.
 * @param accents The accent of each beat.
 * @returns The times, the sizes, and the preparations of the breaths.
 */
function findBreaths(
  beats: Float64Array,
  starts: Float64Array,
  onsets: Float32Array,
  accents: Float32Array,
): Breaths {
  const r = EXPRESSION_RULES;
  const m = EXPRESSION_MOTION;
  const times: number[] = [];
  const sizes: number[] = [];
  const preps: number[] = [];
  for (const [k, time] of beats.entries()) {
    if ((onsets[k] ?? 0) <= 0) {
      continue;
    }
    const beatSec = k > 0 ? time - (beats[k - 1] ?? 0) : (beats[1] ?? time + 0.5) - time;
    const gap = Math.max(r.phraseGapMinSec, r.phraseGapBeats * beatSec);
    const before = starts[lastAtOrBefore(starts, time - r.onBeatBeforeSec - 1e-6)] ?? -Infinity;
    let size = accents[k] ?? 0;
    if (times.length === 0 || time - before >= gap) {
      size = Math.max(size, times.length === 0 ? 1 : r.phraseBreath);
    }
    if (size < r.minBreath) {
      continue;
    }
    const prep = MathUtils.clamp(beatSec, m.breathPrepMinSec, m.breathPrepMaxSec);
    const last = times.length - 1;
    if (last >= 0 && time - (times[last] ?? 0) < r.breathGapSec) {
      if (size > (sizes[last] ?? 0) && last > 0) {
        times[last] = time;
        sizes[last] = size;
        preps[last] = prep;
      }
      continue;
    }
    times.push(time);
    sizes.push(size);
    preps.push(prep);
  }
  return { times, sizes, preps };
}

/**
 * Finds the climaxes of a score (design 5.4): a loud downbeat after a rise of the level within the
 * music. Of the climax downbeats within `climaxGroupSec`, the downbeat with the largest rise wins.
 * The largest rises stay: one for each `climaxEverySec` of the piece, at least `climaxGapSec`
 * apart, so that a climax is a rare moment.
 *
 * @param beats The conducted beats, sorted by time.
 * @param times The times of the beats.
 * @param levels The level at each beat (the mean of `levelSec`).
 * @param finalSec The start of the final chord, or `Infinity`.
 * @returns The indices of the beats of the climaxes, sorted.
 */
function findClimaxes(
  beats: readonly Beat[],
  times: Float64Array,
  levels: Float32Array,
  finalSec: number,
): number[] {
  const r = EXPRESSION_RULES;
  const first = times[0] ?? 0;
  const groups: { k: number; gain: number }[] = [];
  for (const [k, beat] of beats.entries()) {
    const time = beat.timeSec;
    // A climax needs a build, so the first part of a piece has none.
    if (
      beat.indexInBar !== 0 ||
      time - first < r.climaxStartSec ||
      time > finalSec - r.climaxGapSec
    ) {
      continue;
    }
    const level = levels[k] ?? 0;
    let low = Infinity;
    for (
      let j = lastAtOrBefore(times, time - 1);
      j >= 0 && (times[j] ?? 0) >= time - r.climaxBackSec;
      j--
    ) {
      low = Math.min(low, levels[j] ?? 0);
    }
    const gain = level - low;
    if (level < r.climaxLevel || gain < r.climaxRise) {
      continue;
    }
    const last = groups.at(-1);
    if (last && time - (times[last.k] ?? 0) <= r.climaxGroupSec) {
      if (gain > last.gain) {
        groups[groups.length - 1] = { k, gain };
      }
      continue;
    }
    groups.push({ k, gain });
  }
  const count = Math.max(1, Math.round(((times.at(-1) ?? first) - first) / r.climaxEverySec));
  const found: number[] = [];
  for (const group of groups.toSorted((a, b) => b.gain - a.gain)) {
    const time = times[group.k] ?? 0;
    if (
      found.length < count &&
      found.every((k) => Math.abs((times[k] ?? 0) - time) >= r.climaxGapSec)
    ) {
      found.push(group.k);
    }
  }
  return found.toSorted((a, b) => a - b);
}

/**
 * Finds the final chord of a score (design 5.4): the last start of notes in at least
 * `finalShare` of the seats that sound until the end of the sound.
 *
 * @param notes The notes, sorted by start.
 * @param times The times of the conducted beats.
 * @param seatCount The number of seats of the score.
 * @returns The final chord, or `null`.
 */
export function findFinal(
  notes: readonly PlayerNote[],
  times: Float64Array,
  seatCount: number,
): FinalChord | null {
  const r = EXPRESSION_RULES;
  let end = -Infinity;
  for (const note of notes) {
    end = Math.max(end, note.endSec);
  }
  let i = notes.length - 1;
  while (i >= 0) {
    const start = notes[i]?.startSec ?? 0;
    if (start < end - r.finalBackSec) {
      break;
    }
    const seats = new Set<number>();
    while (i >= 0 && (notes[i]?.startSec ?? 0) >= start - r.onBeatBeforeSec) {
      const note = notes[i];
      if (note && note.endSec >= end - r.finalEndSec) {
        seats.add(note.seatIndex);
      }
      i--;
    }
    if (seats.size >= r.finalShare * seatCount) {
      const k = Math.max(0, lastAtOrBefore(times, start + r.onBeatBeforeSec));
      const beatSec = (times[k + 1] ?? end) - (times[k] ?? start);
      return { startSec: start, endSec: end, beatSec, held: end - start >= r.finalMinSec };
    }
  }
  return null;
}

/**
 * Calculates the expression data of the conductor for a score (design 5.4): the soft and the
 * loud passages, the stroke of each beat, the accents, the sway, the breaths, the climaxes, and
 * the final chord.
 *
 * @param beats The conducted beats of the score, sorted by time.
 * @param notes The notes of the score, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param seatCount The number of seats of the score.
 * @returns The data.
 */
export function buildExpressionTrack(
  beats: readonly Beat[],
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
  seatCount: number,
): ExpressionTrack {
  const r = EXPRESSION_RULES;
  const times = Float64Array.from(beats, (b) => b.timeSec);
  const raw = beatLevels(times, notes, loudness);
  const levels = Float32Array.from(
    times,
    (time) => meanIn(times, raw, time - r.levelSec, time + r.levelSec) ?? 0,
  );
  const soft = Float32Array.from(levels, (l) => rampOf(l, r.softFrom, r.softTo));
  const loud = Float32Array.from(levels, (l) => rampOf(l, r.loudFrom, r.loudTo));
  const rise = Float32Array.from(times, (time) => {
    const before = meanIn(times, raw, time - r.trendSec, time);
    const after = meanIn(times, raw, time + 1e-9, time + r.trendSec);
    return before === null || after === null ? 0 : rampOf(after - before, r.riseFrom, r.riseTo);
  });
  const onsets = onsetsOf(times, notes, loudness);
  const accent = accentsOf(times, onsets);
  const strokes = snapsOf(times, notes, loudness);
  // The stroke follows the notes of about one beat on each side, so that a single short note does
  // not change the style of a legato passage.
  const snap = Float32Array.from(times, (time, k) => {
    const side = Math.max(r.snapSec, (times[k + 1] ?? time) - time);
    return Math.max(meanIn(times, strokes, time - side, time + side) ?? 0, accent[k] ?? 0);
  });
  const dip = Float32Array.from(beats, (beat, k) => {
    const a = accent[k] ?? 0;
    return beat.indexInBar === 0 ? a : a * EXPRESSION_MOTION.offbeatDip;
  });
  const starts = Float64Array.from(notes, (n) => n.startSec);
  const breaths = findBreaths(times, starts, onsets, accent);
  const final = findFinal(notes, times, seatCount);
  const climaxes = findClimaxes(beats, times, levels, final?.startSec ?? Infinity);
  const beatOf = (k: number): number => (times[k + 1] ?? (times[k] ?? 0) + 0.5) - (times[k] ?? 0);
  return {
    beats: times,
    soft: limitRate(times, soft, r.maxRate),
    loud: limitRate(times, loud, r.maxRate),
    rise: limitRate(times, rise, r.maxRate),
    snap,
    accent,
    dip,
    breaths: Float64Array.from(breaths.times),
    breathSizes: Float32Array.from(breaths.sizes),
    breathPreps: Float32Array.from(breaths.preps),
    climaxes: Float64Array.from(climaxes, (k) => times[k] ?? 0),
    climaxBeats: Float32Array.from(climaxes, beatOf),
    climaxBars: Float32Array.from(climaxes, (k) => beatOf(k) * (beats[k]?.beatsInBar ?? 1)),
    final,
  };
}

/**
 * Gives the size of a short motion around a beat: it rises from `lead` before the beat to its
 * peak at `peak` after the beat, then decays in `decay`.
 *
 * @param delta The time from the beat.
 * @param lead The rise before the beat.
 * @param peak The time of the peak after the beat.
 * @param decay The time of the decay.
 * @returns The size, from 0 to 1.
 */
function pulseOf(delta: number, lead: number, peak: number, decay: number): number {
  if (delta < peak) {
    return smoothstep((delta + lead) / (lead + peak));
  }
  return 1 - smoothstep((delta - peak) / decay);
}

/**
 * Gives the largest pulse of the beats near a time, each scaled by its value.
 *
 * @param beats The times of the beats, sorted.
 * @param values The value of each beat.
 * @param time The song time.
 * @param lead The rise before the beat.
 * @param peak The time of the peak after the beat.
 * @param decay The time of the decay.
 * @returns The pulse, from 0 to 1.
 */
function beatPulse(
  beats: Float64Array,
  values: Float32Array,
  time: number,
  lead: number,
  peak: number,
  decay: number,
): number {
  let out = 0;
  for (let k = lastAtOrBefore(beats, time + lead); k >= 0; k--) {
    const delta = time - (beats[k] ?? 0);
    if (delta > peak + decay) {
      break;
    }
    out = Math.max(out, (values[k] ?? 0) * pulseOf(delta, lead, peak, decay));
  }
  return out;
}

/**
 * Gives the breath of the conductor at a time (design 5.4): the chest rises in the preparation
 * before an entry, and comes down after it.
 *
 * @param track The expression data.
 * @param time The song time.
 * @returns The breath, from 0 to 1.
 */
function breathAt(track: ExpressionTrack, time: number): number {
  const m = EXPRESSION_MOTION;
  const k = lastAtOrBefore(track.breaths, time);
  let out = 0;
  if (k >= 0) {
    const delta = time - (track.breaths[k] ?? 0);
    out = (track.breathSizes[k] ?? 0) * (1 - smoothstep(delta / m.breathReleaseSec));
  }
  const next = track.breaths[k + 1];
  if (next !== undefined) {
    const prep = track.breathPreps[k + 1] ?? m.breathPrepMinSec;
    const start = next - m.breathStart * prep;
    const rise = smoothstep((time - start) / (next - 0.1 * prep - start));
    out = Math.max(out, (track.breathSizes[k + 1] ?? 0) * rise);
  }
  return out;
}

/**
 * Gives the weight of the open arms of a climax at a time (design 5.4): the arms open in the
 * preparation, stay open for one bar, and close in two beats.
 *
 * @param track The expression data.
 * @param time The song time.
 * @returns The weight, from 0 to 1.
 */
function climaxAt(track: ExpressionTrack, time: number): number {
  const m = EXPRESSION_MOTION;
  const k = lastAtOrBefore(track.climaxes, time + m.breathPrepMaxSec);
  const at = track.climaxes[k];
  if (at === undefined) {
    return 0;
  }
  const beat = track.climaxBeats[k] ?? 0.5;
  const prep = MathUtils.clamp(beat, m.breathPrepMinSec, m.breathPrepMaxSec);
  const rise = smoothstep((time - at + prep) / prep);
  const fall =
    1 - smoothstep((time - at - (track.climaxBars[k] ?? beat)) / (m.climaxFallBeats * beat));
  return Math.min(rise, fall);
}

/**
 * Writes the expression of the conductor at a song time (design 5.4). Soft passages lean the
 * body in, bend the knees a little, and lower the head. Loud passages raise the body and the
 * head. A breath lifts the chest before each entry, and an accent jolts the head and dips the
 * knees. The body does not sway to the side with the beat or the bar: the stance stays grounded.
 * A climax and the final chord raise the
 * body and the head.
 *
 * @param track The expression data.
 * @param time The song time.
 * @param out The state to write.
 */
export function expressionAt(track: ExpressionTrack, time: number, out: ExpressionState): void {
  const m = EXPRESSION_MOTION;
  const { beats } = track;
  const soft = valueAt(beats, track.soft, time);
  const loud = valueAt(beats, track.loud, time);
  const breath = breathAt(track, time);
  const jolt = beatPulse(beats, track.accent, time, m.joltLeadSec, m.joltPeakSec, m.joltDecaySec);
  const dip = beatPulse(beats, track.dip, time, m.dipLeadSec, m.dipPeakSec, m.dipDecaySec);
  const rise = valueAt(beats, track.rise, time);
  out.soft = soft;
  out.rise = rise;
  out.loud = loud;
  out.final = finalAt(track, time);
  out.hold = track.final?.held ? out.final : 0;
  out.climax = Math.max(climaxAt(track, time), m.finalBody * out.hold);
  out.close = 0;
  if (track.final) {
    const { endSec } = track.final;
    out.close = smoothstep(1 - (endSec - time) / m.finalCloseSec);
  }

  out.lean =
    m.softLean * soft -
    m.loudLean * loud -
    m.riseLean * rise -
    m.climaxLean * out.climax -
    m.breathLean * breath +
    m.joltLean * jolt;
  out.head =
    -m.softHead * soft +
    m.loudHead * loud +
    m.riseHead * rise +
    m.climaxHead * out.climax +
    m.breathHead * breath -
    m.joltHead * jolt;
  out.shrug = Math.max(
    m.riseShrug * rise,
    m.climaxShrug * out.climax,
    m.breathShrug * breath,
    m.joltShrug * jolt,
  );
  out.drop = m.softCrouch * soft + m.dip * dip;
}

/**
 * Gives the weight of the held final chord at a time: 0 before the chord, rising to 1 in
 * `finalRiseSec`, and 1 after it.
 *
 * @param track The expression data.
 * @param time The song time.
 * @returns The weight, from 0 to 1.
 */
function finalAt(track: ExpressionTrack, time: number): number {
  if (!track.final) {
    return 0;
  }
  const { startSec, held } = track.final;
  const m = EXPRESSION_MOTION;
  return smoothstep((time - startSec) / (held ? m.finalRiseSec : m.finalStopSec));
}

/**
 * Changes the point of the tip of the baton by the expression (design 5.4). At a climax, the tip
 * goes out and up, and the pattern keeps a part of its motion. On the final chord, the tip
 * leaves the pattern for a hold above the beat of the chord and rises slowly. Before the end of
 * the sound, it makes one circle and comes down at the end with an ictus, and then it stops a
 * little lower.
 *
 * @param track The expression data.
 * @param state The expression at the song time, from {@link expressionAt}.
 * @param time The song time.
 * @param chordPoint The point of the baton at the start of the final chord, or `null`.
 * @param baton The point of the baton to change in place.
 */
export function expressBaton(
  track: ExpressionTrack,
  state: ExpressionState,
  time: number,
  chordPoint: BatonState | null,
  baton: BatonState,
): void {
  const m = EXPRESSION_MOTION;
  const open = Math.min(1, state.climax);
  const keep = 1 - (1 - m.climaxBeat) * open;
  baton.x = baton.x * keep + m.climaxOut * open;
  baton.y = baton.y * keep + m.climaxUp * open;

  const final = track.final;
  if (!final || !chordPoint || state.final <= 0) {
    return;
  }
  if (!final.held) {
    // A short final chord: the baton stops at the beat of the chord, with no rebound.
    const y = chordPoint.y - m.finalClose * smoothstep((time - final.endSec) / m.finalCloseSec);
    baton.x += (chordPoint.x - baton.x) * state.final;
    baton.y += (y - baton.y) * state.final;
    return;
  }
  const holdSec = Math.max(0, final.endSec - m.finalCircleSec - final.startSec);
  const sustain = smoothstep((time - final.startSec) / Math.max(holdSec, 1e-3));
  let x = chordPoint.x + m.climaxOut * m.finalBody;
  let y = chordPoint.y + m.finalRise + m.finalSustain * sustain;
  const circle = (time - (final.endSec - m.finalCircleSec)) / m.finalCircleSec;
  if (circle > 0 && circle < 1) {
    // The circle starts and ends at its bottom, and turns to the right first, so that it comes
    // down into the end with its full speed.
    const turn = 2 * Math.PI * circle ** 1.3;
    x += m.finalCircle * Math.sin(turn);
    y += m.finalCircle * (1 - Math.cos(turn));
  }
  y -= m.finalClose * smoothstep((time - final.endSec) / m.finalCloseSec);
  baton.x += (x - baton.x) * state.final;
  baton.y += (y - baton.y) * state.final;
}
