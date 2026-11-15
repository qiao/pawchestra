import type { Steps } from '../score/steps.ts';
import type { PlayerNote, Technique } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import type { InstrumentOf } from './family.ts';
import { gestureSize } from './loudness.ts';
import {
  FINGERING_COSTS,
  HAND_FRAMES,
  TUNINGS,
  fingerboardPlace,
  planHandSteps,
} from './fingering.ts';
import type { HandStep, StrokePitch } from './fingering.ts';
import { CHORD_SEC, PHRASE_GAP_SEC, groupChords } from './note-groups.ts';
import { clamp01, smoothstep } from '../math.ts';

/** The bowed strings of design 4.6. */
type Bowed = InstrumentOf<'bowed'>;

/** The values of the bow motion of the bowed strings (design 5.3). */
export const BOW_MOTION = {
  /** The place on the bow where a phrase starts, as a part of the bow range from the frog. */
  frogStart: 0.12,
  /** The place on the bow of a tremolo after a rest, as a part of the bow range. */
  tremoloStart: 0.6,
  /**
   * The length of a bow, as a part of the bow range: `base + perSecond × duration`, from `min` to
   * `max`, multiplied by `1 - loudness + loudness × gesture` with the gesture size. A long note
   * uses more bow, and a short note moves the bow faster for its length. The gesture size changes
   * the length only a little, because real players change the sounding point and the force more
   * than the bow speed for a louder note (`docs/reference/string-technique.md`, section 2.4).
   */
  length: { base: 0.1, perSecond: 0.4, min: 0.06, max: 0.8, loudness: 0.3 },
  /** The highest lift of the bow off the strings in a rest, in meters. */
  lift: 0.03,
  /** A rest of at least this length lifts the bow fully. A shorter rest lifts it less. */
  fullLiftGapSec: 0.4,
  /** A rest shorter than this keeps the bow on the strings. */
  stayGapSec: 0.04,
  /** The most time that the bow takes to leave the strings after a note. */
  liftSec: 0.1,
  /** The most time that the bow takes to come down on the strings before a note. */
  landSec: 0.15,
  /** The rate of the tremolo strokes: two strokes for each cycle. */
  tremoloHz: 7,
  /** The amplitude of the tremolo strokes in meters, multiplied by the gesture size. */
  tremoloAmplitude: 0.02,
  /**
   * The string crossing (`docs/reference/string-technique.md`, section 2.3). The turn of the bow
   * to the string of the next note takes `crossSec` for each string step, and at least `crossSec`.
   * The time does not shrink in fast notes, so a crossing can start in an earlier note
   * ({@link crossAt}). It ends `crossLeadSec` before the next note, as the crossing of a violinist
   * leads the bow change by about 15° of the phase of a stroke pair.
   */
  crossSec: 0.08,
  crossLeadSec: 0.01,
  /**
   * A stroke whose next stroke starts within this time is fast: at least 4 notes a second, the
   * lower end of the fast patterns of 4 to 8 notes a second (`docs/reference/string-technique.md`,
   * section 2.3). In a fast run across two strings, the right elbow keeps the mean string, and a
   * fast bow moves toward the balance point.
   */
  fastSec: 0.25,
  /**
   * The measured tremolo (`docs/reference/string-technique.md`, section 2.5): a run of at least
   * `notes` normal strokes of one pitch, each shorter than `maxSec` (more than about 11 notes a
   * second). A real player bows these notes with short strokes from the wrist and the fingers, so
   * each stroke of the run moves the bow `travel` meters, multiplied by the gesture size, and the
   * next stroke moves it back. With a bow of its own length for each note, the arm reverses up to
   * 19 times a second, and the bow arm moves up and down too fast.
   */
  measured: { notes: 4, maxSec: 0.09, travel: 0.012 },
  /**
   * The slur rule (`docs/reference/string-technique.md`, section 2.5). The MIDI files have no
   * slurs, so two to `notes` normal strokes in one beat join into one bow when each is shorter
   * than `maxSec` and each gap is shorter than `gapSec`. A note that starts at most `beatSlackSec`
   * before a beat belongs to that beat.
   */
  slur: { notes: 4, maxSec: 0.25, gapSec: 0.03, beatSlackSec: 0.03 },
  /**
   * The fast bows move toward the balance point and the middle of the bow
   * (`docs/reference/string-technique.md`, section 2.5): the middle of each fast bow moves `share`
   * of the way to `place` of the bow range.
   */
  balance: { place: 0.45, share: 0.2 },
  /** The time constant of the loudness that the sounding point follows, in seconds. */
  loudnessSec: 0.2,
  /**
   * The change between the bow and pizzicato starts this long before the note, and not before the
   * first note of the technique before it.
   */
  techniqueLeadSec: 0.3,
  /**
   * A change from the bow to pizzicato starts at the end of the last bowed note, so that the bow
   * stays on the string while that note sounds, but not later than this before the first
   * pizzicato note (`docs/reference/string-technique.md`, section 2.10). Thus a pizzicato note
   * right after a bowed note takes the shortest change.
   */
  techniqueLeastSec: 0.2,
  /**
   * A run of notes of the other technique keeps the technique of the right hand before it when the
   * notes of that technique come back less than this time after the start of the run
   * (`docs/reference/string-technique.md`, section 2.10). Two parts on one channel can change
   * the technique each 0.1 s to 0.2 s.
   */
  techniqueHoldSec: 0.6,
  /** The change between the bow and pizzicato ends this long before the note. */
  techniqueEndSec: 0.05,
  /** The time of the pluck of a pizzicato note. */
  flickSec: 0.06,
  /** Before a pluck, the finger rests on the string for at most this time. */
  pluckHoldSec: 0.04,
  /** The finger goes back to the string in at most this time before the next pluck. */
  pluckReturnSec: 0.25,
} as const;

/**
 * The values of the left hand of the bowed strings (design 5.3,
 * `docs/reference/string-technique.md`, sections 1.5 to 1.7). The hand keeps its position, and the
 * fingers play the notes. A shift takes a part of the note before it, and the finger of the new
 * note lands before the bow change.
 */
const LEFT_HAND = {
  /** The finger of a new note lands this long before the note, and a shift ends then. */
  landSec: 0.03,
  /** A shift starts at the earliest after this share of the time from the note before to the note. */
  shiftShare: 0.5,
  /** The most time of a shift. Six professional violinists took 0.29 s to 0.46 s. */
  shiftSec: 0.35,
  /**
   * The least time of a shift for each 1.0 of `fingerboard` that the hand moves, up to
   * `shiftSec`. A large shift in fast notes starts in an earlier note of the old position. With
   * only the second half of a fast note, a shift of 0.4 turned the cello forearm by 89° in one
   * frame at 120 fps.
   */
  shiftSecPerPlace: 0.7,
  /** The most time of a change of the finger or of the stop string with no shift. */
  fingerSec: 0.08,
  /** The time constant of the press of the finger after the note start. */
  pressSec: 0.12,
  /** The vibrato of a stopped note (`docs/reference/string-technique.md`, section 1.7). */
  vibrato: {
    /** A note of at least this length gets vibrato, in seconds. */
    minSec: 0.35,
    /** The vibrato starts this long after the note start, in seconds. */
    delaySec: 0.15,
    /** The vibrato grows to its full width in this time, in seconds. */
    fadeSec: 0.2,
    /** The vibrato stops in this time before the end of the note or the start of a shift. */
    stopSec: 0.1,
    /** The rate of each instrument, in hertz. */
    hz: { violin: 5.5, viola: 5.5, cello: 5.5, contrabass: 5 },
    /** The seeded change of the rate of each player, in hertz, to each side. */
    hzSpread: 0.4,
    /** The width of each instrument, in cents to each side of the pitch. */
    cents: { violin: 20, viola: 20, cello: 15, contrabass: 15 },
    /** The share that a high position and a loud note each add to the width, half each. */
    wider: 0.5,
    /** The position at which a high position adds its full share, in semitones. */
    highPosition: 12,
  },
} as const;

/** The part of the bow hair that a player uses, in meters from the frog end of the hair. */
export type BowRange = readonly [low: number, high: number];

/**
 * The motion of one bow: a note, or the notes of a slur in one bow direction (design 5.3). The
 * strokes of a slur share one bow.
 */
interface BowSlur {
  /** The note start of the first note, in song seconds. */
  readonly start: number;
  /**
   * The note start of the last note, in song seconds. The bow moves at one speed until this
   * time, and slows to a stop in the last note.
   */
  readonly lastStart: number;
  /** The end of the sound of the last note, in song seconds. */
  readonly end: number;
  /** The place of the strings on the hair at the start of the bow, in meters from the frog. */
  readonly from: number;
  /** The place of the strings on the hair at the end of the bow, in meters from the frog. */
  readonly to: number;
  /** The number of notes in the bow: 1 for a separate bow. */
  readonly notes: number;
}

/** One bow stroke: a note or a double stop of one player, from its start to the next stroke. */
export interface Stroke {
  /** The note start, in song seconds. */
  readonly start: number;
  /** The end of the sound, in song seconds. It is not later than the start of the next stroke. */
  readonly end: number;
  readonly technique: Technique;
  /**
   * The string of the bow, from 0 (the lowest) to 3. A double stop lies between two strings. The
   * plan of the left hand chooses it ({@link planHandSteps}).
   */
  readonly string: number;
  /** The plan of the left hand: the position, the hand place, and the finger of the note. */
  readonly hand: HandStep;
  /**
   * The width of the vibrato to each side, as a part of the target `fingerboard`. 0 for no
   * vibrato: an open string, a pizzicato note, or a note shorter than `LEFT_HAND.vibrato.minSec`.
   */
  readonly vibrato: number;
  /** The rate of the vibrato of the player, in hertz. */
  readonly vibratoHz: number;
  /** The gesture size: the loudness of design 5.3 and the amplitude of the player. */
  readonly gesture: number;
  /** The place of the strings on the hair at the start and at the end, in meters from the frog. */
  readonly bowFrom: number;
  readonly bowTo: number;
  /** The bow of the stroke: its own bow, or the bow of its slur. */
  readonly slur: BowSlur;
  /**
   * The string that the right elbow follows: the mean of the two strings of a fast run across two
   * strings ({@link crossStrings}), else {@link Stroke.string}.
   */
  readonly crossMean: number;
  /** The loudness of the stroke, from 0 to 1. The sounding point follows it. */
  readonly loudness: number;
  /**
   * The loudness that the sounding point follows at the start of the stroke: the loudness of the
   * strokes before it, with the time constant `BOW_MOTION.loudnessSec`.
   */
  readonly loudnessFrom: number;
  /** The tremolo amplitude in meters. 0 for the other techniques. */
  readonly tremolo: number;
  /** Whether the bow moves to `bowFrom` in the rest before the stroke, off the strings. */
  readonly retake: boolean;
  /**
   * Whether the right hand plucks in the stroke: the technique of the hand, which keeps its
   * technique over a short run of the other technique ({@link handTechniques}).
   */
  readonly plucked: boolean;
  /**
   * The start of the change of the right hand to the other technique after the stroke, in song
   * seconds. `Infinity` when the hand keeps its technique to the end.
   */
  readonly turnFrom: number;
  /** The end of that change, in song seconds. `Infinity` with no change. */
  readonly turnTo: number;
}

/** The bow and the hands of a bowed string player at one time. The pose reads it. */
export interface BowState {
  /** The place of the strings on the hair, in meters from the frog end of the hair. */
  bow: number;
  /** The distance of the hair above the strings, in meters. */
  lift: number;
  /** 0 is the bow on the strings, 1 is pizzicato. It is linear in time. */
  pizzicato: number;
  /** The place of the plucking finger across the strings, from -1 to 1. */
  pluck: number;
  /** The string of the bow, from 0 to 3. */
  string: number;
  /** The string that the right elbow follows, from 0 to 3 ({@link Stroke.crossMean}). */
  crossMean: number;
  /**
   * The loudness that the sounding point follows, from 0 to 1: the loudness of the strokes with
   * the time constant `BOW_MOTION.loudnessSec`.
   */
  loudness: number;
  /**
   * The middle of the hand frame on the target `fingerboard`, from 0 to 1. It changes only in a
   * shift.
   */
  fingerboard: number;
  /** The reach of the finger from the middle of the hand frame, from -1 to 1. */
  reach: number;
  /** The string under the finger, from 0 to 3. */
  stopString: number;
  /** The vibrato move of the hand along the strings, as a part of the target `fingerboard`. */
  vibrato: number;
  /**
   * The press of the finger: it lands before a stopped note, is 1 at the note start, and then
   * fades. 0 on an open string and in a shift.
   */
  press: number;
  /** The gesture size of the current stroke. */
  gesture: number;
}

/**
 * Makes a bow state with no motion.
 *
 * @returns The state.
 */
export function createBowState(): BowState {
  return {
    bow: 0,
    lift: 0,
    pizzicato: 0,
    pluck: -1,
    string: 0,
    crossMean: 0,
    loudness: 0,
    fingerboard: 0,
    reach: 0,
    stopString: 0,
    vibrato: 0,
    press: 0,
    gesture: 1,
  };
}

/**
 * Gives the rate of the vibrato of a player (`docs/reference/string-technique.md`, section 1.7):
 * the rate of the instrument, with a seeded change of each player.
 *
 * @param instrument The bowed string.
 * @param unit A seeded number of the player, from 0 to 1.
 * @returns The rate, in hertz.
 */
export function vibratoRate(instrument: Bowed, unit: number): number {
  const v = LEFT_HAND.vibrato;
  return v.hz[instrument] + (2 * unit - 1) * v.hzSpread;
}

/**
 * Gives the width of the vibrato of a stopped note to each side, as a part of the target
 * `fingerboard` (design 5.3). The width in cents of the instrument grows by up to
 * `LEFT_HAND.vibrato.wider` in a high position and in a loud note, half for each. A cent moves
 * the finger less high on the string, as the string length gives.
 *
 * @param instrument The bowed string.
 * @param hand The plan of the left hand for the note.
 * @param loudness The loudness of the note, from 0 to 1.
 * @returns The width. 0 for an open string.
 */
function vibratoWidth(instrument: Bowed, hand: HandStep, loudness: number): number {
  if (hand.open) {
    return 0;
  }
  const v = LEFT_HAND.vibrato;
  const high = clamp01(
    (hand.position - FINGERING_COSTS.homePosition) /
      (v.highPosition - FINGERING_COSTS.homePosition),
  );
  const cents = v.cents[instrument] * (1 + v.wider * 0.5 * (high + clamp01(loudness)));
  const semitones = Math.max(1, hand.semitones);
  // The slope of `fingerboardPlace()` at the note, for each semitone.
  const slope = fingerboardPlace(semitones + 0.5) - fingerboardPlace(semitones - 0.5);
  return (cents / 100) * slope;
}

/** The pitches, the times, the technique, and the loudness of one stroke. */
interface StrokeNotes extends StrokePitch {
  /** The technique of the first note of the stroke. */
  readonly technique: Technique;
  /** The highest loudness of the notes that start the stroke. */
  readonly loudness: number;
}

/**
 * Gives the pitches and the times of the strokes of one player. Notes that start together form
 * one stroke, and an earlier note that still sounds at a new stroke joins it: two pitches make a
 * double stop. A stroke ends at the start of the next stroke at the latest.
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns One entry for each stroke, with its technique and its loudness.
 */
function strokePitches(notes: readonly PlayerNote[], loudness: readonly number[]): StrokeNotes[] {
  const groups = groupChords(notes, loudness);
  // The notes of the earlier strokes that may still sound.
  let sounding: readonly PlayerNote[] = [];
  return groups.map((g, k): StrokeNotes => {
    const next = groups[k + 1];
    sounding = sounding.filter((held) => held.endSec > g.start + CHORD_SEC);
    let low = g.low;
    let high = g.high;
    for (const held of sounding) {
      low = Math.min(low, held.pitch);
      high = Math.max(high, held.pitch);
    }
    sounding = [...sounding, ...notes.slice(g.first, g.first + g.count)];
    return {
      start: g.start,
      end: next ? Math.min(g.end, next.start) : g.end,
      low,
      high,
      technique: notes[g.first]?.technique ?? 'normal',
      loudness: g.loudness,
    };
  });
}

/**
 * Tells for each stroke if it is a stroke of a measured tremolo (`BOW_MOTION.measured`): a run of
 * at least `notes` normal strokes of one pitch, each shorter than `maxSec`, with each stroke
 * starting the next within `maxSec`.
 *
 * @param strokes The strokes of the player, sorted by start.
 * @returns For each stroke, `true` in a measured tremolo.
 */
function measuredTremolo(strokes: readonly StrokeNotes[]): boolean[] {
  const { notes, maxSec } = BOW_MOTION.measured;
  const short = (s: StrokeNotes | undefined): boolean =>
    s !== undefined && s.technique === 'normal' && s.end - s.start < maxSec;
  const out = strokes.map(() => false);
  let k = 0;
  while (k < strokes.length) {
    let m = k;
    for (;;) {
      const here = strokes[m];
      const next = strokes[m + 1];
      if (
        !here ||
        !next ||
        !short(here) ||
        !short(next) ||
        next.start - here.start >= maxSec ||
        next.low !== here.low ||
        next.high !== here.high
      ) {
        break;
      }
      m += 1;
    }
    if (m - k + 1 >= notes) {
      out.fill(true, k, m + 1);
    }
    k = m + 1;
  }
  return out;
}

/** The times, the pitches, and the technique of a stroke, for the slur rule. */
type SlurNote = StrokePitch & { readonly technique: Technique };

/**
 * Gives the slurs of the strokes of one player (design 5.3, `docs/reference/string-technique.md`,
 * section 2.5). The MIDI files have no slurs, so the rule guesses them: two to
 * `BOW_MOTION.slur.notes` normal strokes in one beat join into one bow when each stroke is shorter
 * than `BOW_MOTION.slur.maxSec`, each gap is shorter than `BOW_MOTION.slur.gapSec`, and each
 * stroke changes the pitch. A longer run splits into slurs of nearly equal size. A repeated pitch
 * takes a new bow, because the file plays it as a new note. With no beats, each stroke takes its
 * own bow.
 *
 * @param strokes The strokes of the player, sorted by start.
 * @param beats The times of the beats, sorted.
 * @returns For each stroke, the number of notes of the slur that starts at it, 0 for a stroke
 *   inside a slur, and 1 for a separate bow.
 */
function slurSizes(strokes: readonly SlurNote[], beats: Float64Array): number[] {
  const rule = BOW_MOTION.slur;
  const sizes = strokes.map(() => 1);
  if (beats.length === 0) {
    return sizes;
  }

  const beatOf = (time: number): number => lastAtOrBefore(beats, time + rule.beatSlackSec);
  const joins = (a: SlurNote | undefined, b: SlurNote | undefined): boolean =>
    a !== undefined &&
    b !== undefined &&
    a.technique === 'normal' &&
    b.technique === 'normal' &&
    a.end - a.start < rule.maxSec &&
    b.end - b.start < rule.maxSec &&
    b.start - a.end < rule.gapSec &&
    (a.low !== b.low || a.high !== b.high) &&
    beatOf(a.start) === beatOf(b.start);
  let first = 0;
  for (let k = 1; k <= strokes.length; k++) {
    if (k === strokes.length || !joins(strokes[k - 1], strokes[k])) {
      // The run from `first` to `k - 1` splits into slurs of nearly equal size.
      const count = k - first;
      const slurs = Math.ceil(count / rule.notes);
      for (let j = 0; j < slurs; j++) {
        const a = first + Math.floor((j * count) / slurs);
        const b = first + Math.floor(((j + 1) * count) / slurs);
        sizes.fill(0, a, b);
        sizes[a] = b - a;
      }
      first = k;
    }
  }
  return sizes;
}

/** The technique of the right hand in each stroke, and the times of its changes. */
interface HandTechniques {
  /** Whether the right hand plucks in each stroke. */
  readonly plucked: boolean[];
  /** The start of the next change of the right hand after each stroke, in song seconds. */
  readonly from: number[];
  /** The end of the next change of the right hand after each stroke, in song seconds. */
  readonly to: number[];
}

/**
 * Gives the technique of the right hand in each stroke and the times of its changes (design 5.3,
 * `docs/reference/string-technique.md`, section 2.10). A player who alternates the bow and
 * pizzicato fast keeps the hand of one technique, so a run of strokes of the other technique keeps
 * the technique before it when the strokes of that technique come back within
 * `BOW_MOTION.techniqueHoldSec` of the start of the run. A change starts
 * `BOW_MOTION.techniqueLeadSec` before the first stroke of the new technique, but not before the
 * first stroke of the old technique, and it ends `BOW_MOTION.techniqueEndSec` before that stroke.
 * A change from the bow to pizzicato also starts not before the end of the last bowed stroke,
 * unless that end is less than `BOW_MOTION.techniqueLeastSec` before the new stroke.
 *
 * @param strokes The start, the end, and the technique of each stroke, sorted by start.
 * @returns The technique of the hand and the changes.
 */
function handTechniques(
  strokes: readonly {
    readonly start: number;
    readonly end: number;
    readonly technique: Technique;
  }[],
): HandTechniques {
  const m = BOW_MOTION;
  const plucks = (k: number): boolean => strokes[k]?.technique === 'pizzicato';
  const plucked: boolean[] = [];
  let hand = plucks(0);
  for (const [k, stroke] of strokes.entries()) {
    if (plucks(k) !== hand) {
      let back = k + 1;
      while (back < strokes.length && plucks(back) !== hand) {
        back += 1;
      }
      if ((strokes[back]?.start ?? Infinity) - stroke.start >= m.techniqueHoldSec) {
        hand = !hand;
      }
    }
    plucked.push(hand);
  }

  const from: number[] = [];
  const to: number[] = [];
  let runStart = 0;
  let k = 0;
  while (k < strokes.length) {
    let next = k + 1;
    while (next < strokes.length && plucked[next] === plucked[k]) {
      next += 1;
    }
    const target = strokes[next]?.start ?? Infinity;
    const start = strokes[runStart]?.start ?? 0;
    // The bow leaves the string after its last note, as late as the shortest change allows.
    const bowEnd = plucked[k] === true ? -Infinity : (strokes[next - 1]?.end ?? -Infinity);
    const a =
      target === Infinity
        ? Infinity
        : Math.max(
            start,
            target - m.techniqueLeadSec,
            Math.min(bowEnd, target - m.techniqueLeastSec),
          );
    const b = target === Infinity ? Infinity : Math.max(a + 1e-3, target - m.techniqueEndSec);
    for (; k < next; k++) {
      from.push(a);
      to.push(b);
    }
    runStart = next;
  }
  return { plucked, from, to };
}

/** The start, the technique, and the string of the bow of a stroke, for the crossing rule. */
interface CrossNote {
  readonly start: number;
  readonly technique: Technique;
  /** The string of the bow, from 0 to 3. */
  readonly string: number;
}

/**
 * Gives the string that the right elbow follows for each stroke (design 5.3,
 * `docs/reference/string-technique.md`, section 2.3). In a fast run across two neighbor strings,
 * the upper arm moves little: the elbow keeps the mean string, and the forearm and the wrist make
 * the rest of the crossing. A run is fast when each stroke but the last starts the next stroke
 * within `BOW_MOTION.fastSec`, and no stroke is pizzicato. The rule takes the part of a run on
 * two strings at most one string apart in which each stroke has a change of the string just
 * before or after it, when that part changes the string at least twice. A stroke of a run that
 * stays on its string follows its own string, as each other stroke.
 *
 * @param strokes The strokes of the player, sorted by start.
 * @returns The string of the elbow of each stroke, from 0 to 3.
 */
function crossStrings(strokes: readonly CrossNote[]): number[] {
  const out = strokes.map((s) => s.string);
  let k = 0;
  while (k < strokes.length) {
    const head = strokes[k];
    if (!head) {
      break;
    }

    // The longest fast run from `k` on at most two neighbor strings.
    let low = head.string;
    let high = head.string;
    let changes = 0;
    let changedAt = k;
    let m = k;
    for (;;) {
      const here = strokes[m];
      const next = strokes[m + 1];
      if (
        !here ||
        !next ||
        here.technique === 'pizzicato' ||
        next.technique === 'pizzicato' ||
        next.start - here.start >= BOW_MOTION.fastSec
      ) {
        break;
      }
      const string = next.string;
      const wider = Math.max(high, string) - Math.min(low, string);
      if (string !== low && string !== high && (low !== high || wider > 1)) {
        break;
      }
      low = Math.min(low, string);
      high = Math.max(high, string);
      if (string !== here.string) {
        changes += 1;
        changedAt = m + 1;
      }
      m += 1;
    }

    if (changes >= 2) {
      // Only the strokes next to a change cross. The strokes that stay on one string keep it.
      const crosses = (i: number): boolean => {
        const own = strokes[i]?.string;
        return (
          (i > k && strokes[i - 1]?.string !== own) || (i < m && strokes[i + 1]?.string !== own)
        );
      };
      let i = k;
      while (i <= m) {
        let j = i;
        let turns = 0;
        while (j <= m && crosses(j)) {
          turns += j > i && strokes[j - 1]?.string !== strokes[j]?.string ? 1 : 0;
          j += 1;
        }
        if (turns >= 2) {
          out.fill((low + high) / 2, i, j);
        }
        i = Math.max(i + 1, j);
      }
      k = m + 1;
    } else {
      // A run that starts at the last change can still reach a second string.
      k = changes === 0 ? m + 1 : Math.max(k + 1, changedAt);
    }
  }
  return out;
}

/**
 * Gives the change of the move of a fast bow toward the balance point and the middle of the bow
 * (design 5.3, `docs/reference/string-technique.md`, section 2.5): the middle of the bow moves
 * `BOW_MOTION.balance.share` of the way to the target. The change is at most half of the move, so
 * the bow keeps its direction.
 *
 * @param from The place of the strings on the hair at the start of the bow, in meters.
 * @param travel The move of the bow without the change, in meters: positive to the tip.
 * @param target The place of the balance point on the hair, in meters.
 * @returns The change of the move, in meters.
 */
function balanceShift(from: number, travel: number, target: number): number {
  const most = 0.5 * Math.abs(travel);
  const shift = BOW_MOTION.balance.share * (target - (from + travel / 2));
  return Math.min(most, Math.max(-most, shift));
}

/**
 * Gives the loudness that the sounding point follows (design 5.3): it moves from its value at the
 * start of a stroke to the loudness of the stroke, with the time constant
 * `BOW_MOTION.loudnessSec`.
 *
 * @param from The value at the start of the stroke.
 * @param loudness The loudness of the stroke.
 * @param dt The time since the start of the stroke, in seconds.
 * @returns The value, from 0 to 1.
 */
function followLoudness(from: number, loudness: number, dt: number): number {
  return loudness + (from - loudness) * Math.exp(-Math.max(0, dt) / BOW_MOTION.loudnessSec);
}

/**
 * Gives the place of the strings on the hair in a bow. The bow starts at its full speed, keeps it
 * until its last note, and slows to a stop in its last note, so the change of direction at the
 * next bow is sharp. A separate note slows down from its start. The notes of a slur share one
 * bow, so the bow does not stop between them.
 *
 * @param slur The bow.
 * @param time The song time.
 * @returns The place, in meters from the frog end of the hair.
 */
function bowInSlur(slur: BowSlur, time: number): number {
  const even = Math.max(0, slur.lastStart - slur.start);
  const last = Math.max(0, slur.end - slur.lastStart);
  // The bow moves `even` at the full speed and `last / 2` while it slows to a stop.
  const total = even + last / 2;
  if (total <= 0) {
    return slur.to;
  }
  const dt = time - slur.start;
  const x = last > 0 ? clamp01((dt - even) / last) : 1;
  const done = dt <= even ? Math.max(0, dt) : even + last * (x - (x * x) / 2);
  return slur.from + ((slur.to - slur.from) * done) / total;
}

/** The number of strokes in one step of the bow plan of {@link buildStrokesSteps}. */
const BOW_STROKES_PER_STEP = 500;

/**
 * Builds the bow strokes of one bowed string player, in steps (design 5.3, 7.2). Notes that start
 * together form one stroke, a double stop. The plan of the left hand ({@link planHandSteps})
 * gives each stroke its string, its position, and its finger: the hand keeps its position, and
 * the fingers play the notes. The bow changes direction on each bow: a note, or a slur of short notes in one beat
 * ({@link slurSizes}). A phrase starts with a down-bow at the frog. The length of a bow comes
 * from its length in time, and a little from the gesture size, and a fast bow moves toward the
 * balance point ({@link balanceShift}). A stroke of a measured tremolo moves the bow only a short
 * way ({@link measuredTremolo}). In a fast run across two strings, the right elbow keeps the mean
 * string ({@link crossStrings}). Pizzicato strokes keep the bow where it is. A tremolo
 * stroke makes short fast strokes around the place of the bow. A stopped bowed note of at least
 * `LEFT_HAND.vibrato.minSec` gets vibrato.
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes` (design 5.3).
 * @param range The part of the bow hair that the player uses, in meters from the frog end of the
 *   hair. A small player cannot reach the tip of a long bow.
 * @param amplitude The seeded amplitude of the player, near 1.
 * @param instrument The bowed string of the player.
 * @param vibratoHz The rate of the vibrato of the player, from {@link vibratoRate}.
 * @param beats The times of the conducted beats, sorted. The slur rule reads them.
 * @returns The steps, which return the strokes, sorted by start, with no overlap.
 */
export function* buildStrokesSteps(
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  range: BowRange,
  amplitude: number,
  instrument: Bowed,
  vibratoHz: number,
  beats: Float64Array,
): Steps<Stroke[]> {
  const m = BOW_MOTION;
  const pitches = strokePitches(notes, loudness);
  yield;
  const plan = yield* planHandSteps(
    pitches,
    TUNINGS[instrument],
    HAND_FRAMES[instrument],
    FINGERING_COSTS,
  );
  const sizes = slurSizes(pitches, beats);
  const measured = measuredTremolo(pitches);
  const arms = crossStrings(
    pitches.map((p, k) => ({
      start: p.start,
      technique: p.technique,
      string: plan[k]?.string ?? 0,
    })),
  );
  const hands = handTechniques(pitches);

  // The loudness that the sounding point follows, at the start of each stroke.
  const levels = pitches.map((p) => clamp01(p.loudness));
  const levelsFrom: number[] = [];
  for (const [k, p] of pitches.entries()) {
    const before = pitches[k - 1];
    const level = levels[k] ?? 0;
    const from = levelsFrom[k - 1];
    levelsFrom.push(
      before && from !== undefined
        ? followLoudness(from, levels[k - 1] ?? level, p.start - before.start)
        : level,
    );
  }

  const strokes: Stroke[] = [];
  const [low, high] = range;
  const span = high - low;
  let bow = low + m.frogStart * span;
  let direction = -1;
  let previousEnd = -Infinity;
  let bowed = false;
  let k = 0;
  let done = 0;
  while (k < pitches.length) {
    const p = pitches[k];
    if (!p) {
      break;
    }
    if (++done % BOW_STROKES_PER_STEP === 0) {
      yield;
    }
    const technique = p.technique;
    const count = technique === 'normal' ? Math.max(1, sizes[k] ?? 1) : 1;
    const last = pitches[k + count - 1] ?? p;
    const phrase = p.start - previousEnd >= PHRASE_GAP_SEC;
    let from = bow;
    let to = bow;
    let tremolo = 0;
    let retake = false;
    if (technique === 'tremolo') {
      if (phrase || !bowed) {
        from = low + m.tremoloStart * span;
        retake = true;
      }
      const duration = Math.max(0, p.end - p.start);
      const gesture = gestureSize(p.loudness, amplitude);
      tremolo = Math.max(0, Math.min(m.tremoloAmplitude * gesture, from - low, high - from));
      to = from + tremolo * Math.sin(2 * Math.PI * m.tremoloHz * duration);
      bowed = true;
    } else if (technique === 'normal') {
      if (phrase || !bowed) {
        from = low + m.frogStart * span;
        direction = 1;
        retake = true;
      } else {
        direction = -direction;
      }
      const l = m.length;
      const duration = Math.max(0, last.end - p.start);
      const gesture = gestureSize(p.loudness, amplitude);
      const part = Math.min(l.max, Math.max(l.min, l.base + l.perSecond * duration));
      let travel = direction * part * span * (1 - l.loudness + l.loudness * gesture);
      const next = pitches[k + count];
      if (measured[k]) {
        travel = direction * m.measured.travel * gesture;
      } else if (next && next.start - p.start < m.fastSec) {
        travel += balanceShift(from, travel, low + m.balance.place * span);
      }
      to = Math.min(high, Math.max(low, from + travel));
      bowed = true;
    }

    const slur: BowSlur = {
      start: p.start,
      lastStart: last.start,
      end: last.end,
      from,
      to,
      notes: count,
    };
    for (let j = k; j < k + count; j++) {
      const own = pitches[j];
      const fingered = plan[j];
      if (!own || !fingered) {
        continue;
      }
      const duration = Math.max(0, own.end - own.start);
      const vibrato =
        technique !== 'pizzicato' && duration >= LEFT_HAND.vibrato.minSec
          ? vibratoWidth(instrument, fingered.hand, own.loudness)
          : 0;
      const single = count === 1;
      strokes.push({
        start: own.start,
        end: own.end,
        technique,
        string: fingered.string,
        hand: fingered.hand,
        vibrato,
        vibratoHz,
        gesture: gestureSize(own.loudness, amplitude),
        bowFrom: single ? from : bowInSlur(slur, own.start),
        bowTo: single ? to : bowInSlur(slur, own.end),
        slur,
        crossMean: arms[j] ?? fingered.string,
        loudness: levels[j] ?? 0,
        loudnessFrom: levelsFrom[j] ?? 0,
        tremolo,
        retake: retake && j === k,
        plucked: hands.plucked[j] ?? technique === 'pizzicato',
        turnFrom: hands.from[j] ?? Infinity,
        turnTo: hands.to[j] ?? Infinity,
      });
    }
    bow = to;
    previousEnd = last.end;
    k += count;
  }
  return strokes;
}

/**
 * Gives the place of the strings on the hair during a stroke. A stroke moves with its bow
 * ({@link bowInSlur}), and a tremolo stroke makes short fast strokes around its place.
 *
 * @param stroke The stroke.
 * @param time The song time, from the start to the end of the stroke.
 * @returns The place, in meters from the frog end of the hair.
 */
function bowInStroke(stroke: Stroke, time: number): number {
  if (stroke.technique === 'tremolo') {
    const dt = time - stroke.start;
    return stroke.bowFrom + stroke.tremolo * Math.sin(2 * Math.PI * BOW_MOTION.tremoloHz * dt);
  }
  return bowInSlur(stroke.slur, time);
}

/**
 * Gives 1 for a stroke in which the right hand plucks and 0 for a stroke in which it bows.
 *
 * @param stroke The stroke.
 * @returns The weight of pizzicato.
 */
function pizzicatoOf(stroke: Stroke): number {
  return stroke.plucked ? 1 : 0;
}

/**
 * Gives the quintic ease `10x³ − 15x⁴ + 6x⁵`: its speed is a bell with no jump at the ends.
 *
 * @param x The time share, clamped to 0 to 1.
 * @returns The share of the move.
 */
function quintic(x: number): number {
  const t = clamp01(x);
  return t * t * t * (10 + t * (6 * t - 15));
}

/**
 * Gives the press of the finger of a stroke (design 5.3). The finger lands in the time `land`
 * before the note, presses fully at the note start, and then the press fades. An open string has
 * no press.
 *
 * @param stroke The stroke.
 * @param time The song time.
 * @param land The time of the landing before the note, in seconds.
 * @returns The press, from 0 to 1.
 */
function pressOf(stroke: Stroke, time: number, land: number): number {
  if (stroke.hand.open) {
    return 0;
  }
  const dt = time - stroke.start;
  if (dt >= 0) {
    return Math.exp(-dt / LEFT_HAND.pressSec);
  }
  return land > 0 ? smoothstep(1 + dt / land) : 0;
}

/** The start and the end of a shift, from {@link shiftSpan}. */
const span: [number, number] = [0, 0];

/**
 * Gives the time span of the shift into a stroke (design 5.3). The shift takes the second part
 * of the note before it, at most `LEFT_HAND.shiftSec`, and it ends when the finger of the stroke
 * lands, `LEFT_HAND.landSec` before the note. A large shift takes at least
 * `LEFT_HAND.shiftSecPerPlace` for each 1.0 of `fingerboard`, so in fast notes it starts in an
 * earlier note of the old position, at the earliest at the first note of that position.
 *
 * @param strokes The strokes of the player.
 * @param index The index of the stroke after the shift. It is at least 1.
 * @returns The start and the end of the shift, in a module tuple that the next call writes again.
 */
function shiftSpan(strokes: readonly Stroke[], index: number): readonly [number, number] {
  const l = LEFT_HAND;
  const before = strokes[index - 1];
  const after = strokes[index];
  if (!before || !after) {
    return span.fill(Infinity);
  }
  const interval = after.start - before.start;
  const landed = after.start - Math.min(l.landSec, 0.25 * interval);
  let from = Math.max(
    landed - l.shiftSec,
    Math.min(before.start + l.shiftShare * interval, before.end),
  );
  const least = Math.min(
    l.shiftSec,
    l.shiftSecPerPlace * Math.abs(after.hand.place - before.hand.place),
  );
  if (landed - from < least) {
    // Go back to the earliest note of the old position that the shift needs.
    let first = index - 1;
    while (
      first > 0 &&
      (strokes[first]?.start ?? 0) > landed - least &&
      strokes[first - 1]?.hand.position === before.hand.position
    ) {
      first--;
    }
    from = Math.min(from, Math.max(landed - least, strokes[first]?.start ?? from));
  }
  span[0] = from;
  span[1] = landed;
  return span;
}

/**
 * Finds the next shift that can start before a time: the first stroke after the next stroke
 * with another position, up to the longest span of a shift after the time.
 *
 * @param strokes The strokes of the player.
 * @param index The index of the stroke at the time.
 * @param time The song time.
 * @returns The index of the stroke after the shift, or -1.
 */
function laterShift(strokes: readonly Stroke[], index: number, time: number): number {
  const position = strokes[index]?.hand.position;
  const horizon = time + LEFT_HAND.shiftSec + LEFT_HAND.landSec;
  for (let j = index + 2; j < strokes.length; j++) {
    const stroke = strokes[j];
    if (!stroke || stroke.start > horizon) {
      return -1;
    }
    if (stroke.hand.position !== position) {
      return j;
    }
  }
  return -1;
}

/**
 * Writes the left hand of a bowed string player at one time (design 5.3). The hand frame keeps
 * its place in a position, and moves only in a shift to the next position, in the span of
 * {@link shiftSpan}, with a quintic ease. The finger turns toward the next note and moves to its
 * string with the shift, or in at most `LEFT_HAND.fingerSec` before the landing. The press of a
 * finger lifts in a shift, and a stopped note of the stroke has vibrato, with its phase from the
 * note start. The vibrato stops before the end of the note and before a shift.
 *
 * @param strokes The strokes of the player.
 * @param index The index of the stroke at the time.
 * @param time The song time, at or after the start of the stroke.
 * @param out The state to write: the fingerboard, the reach, the stop string, the vibrato, and
 *   the press.
 */
function leftHandAt(strokes: readonly Stroke[], index: number, time: number, out: BowState): void {
  const l = LEFT_HAND;
  const current = strokes[index];
  if (!current) {
    return;
  }
  const next = strokes[index + 1];
  const hand = current.hand;
  out.fingerboard = hand.place;
  out.reach = hand.reach;
  out.stopString = hand.stopString;
  let shift = 0;
  let stop = current.end;
  let landing = 0;
  // A shift that starts in an earlier note also lifts the landing of the next note.
  let landingShare = 1;
  if (next) {
    const interval = next.start - current.start;
    const land = Math.min(l.landSec, 0.25 * interval);
    const landed = next.start - land;
    let x: number;
    if (next.hand.position !== hand.position) {
      const [from, end] = shiftSpan(strokes, index + 1);
      shift = quintic((time - from) / (end - from));
      // The finger of the next note moves only in this note.
      const fingerFrom = Math.max(from, current.start);
      x = quintic((time - fingerFrom) / (end - fingerFrom));
      stop = Math.min(stop, from);
      out.fingerboard += (next.hand.place - hand.place) * shift;
    } else {
      const from = Math.max(current.start, landed - l.fingerSec);
      x = smoothstep((time - from) / (landed - from));
      // A large shift in fast notes can start in this note.
      const later = laterShift(strokes, index, time);
      const target = strokes[later];
      if (target) {
        const [shiftFrom, end] = shiftSpan(strokes, later);
        if (time > shiftFrom) {
          shift = quintic((time - shiftFrom) / (end - shiftFrom));
          landingShare = 1 - shift;
          stop = Math.min(stop, shiftFrom);
          out.fingerboard += (target.hand.place - hand.place) * shift;
        }
      }
    }
    out.reach += (next.hand.reach - hand.reach) * x;
    out.stopString += (next.hand.stopString - hand.stopString) * x;
    landing = pressOf(next, time, land) * landingShare;
  }

  out.vibrato = 0;
  if (current.vibrato > 0) {
    const v = l.vibrato;
    const dt = time - current.start;
    const grow = smoothstep((dt - v.delaySec) / v.fadeSec);
    const fade = 1 - smoothstep((time - (stop - v.stopSec)) / v.stopSec);
    out.vibrato = current.vibrato * grow * fade * Math.sin(2 * Math.PI * current.vibratoHz * dt);
  }

  out.press = Math.max(pressOf(current, time, 0) * (1 - shift), landing);
}

/** The largest string step of a crossing: from the lowest string to the highest string. */
const CROSS_MOST_STEPS = 3;

/**
 * Writes the string of the bow and the string of the right elbow at one time (design 5.3,
 * `docs/reference/string-technique.md`, section 2.3). Each change of the string between two
 * strokes is a smooth step that takes `BOW_MOTION.crossSec` for each string step, also in fast
 * notes. It ends `BOW_MOTION.crossLeadSec` before the later stroke when it fits into the time from
 * the stroke before. Else it ends later by half of the part that does not fit, so that its middle
 * moves toward the bow change. The value is the string of a stroke before the time plus the sum
 * of the later steps. Thus a crossing in fast notes starts in an earlier note, and in a fast
 * alternation the steps overlap, so the arm swings less around the middle of the strings and
 * never jumps.
 *
 * @param strokes The strokes of the player.
 * @param index The index of the stroke at the time, or 0 before the first stroke.
 * @param time The song time.
 * @param out The state to write: the string and the string of the elbow.
 */
function crossAt(strokes: readonly Stroke[], index: number, time: number, out: BowState): void {
  const m = BOW_MOTION;
  const longest = CROSS_MOST_STEPS * m.crossSec;
  // A step ends at the latest half of its longest time after its stroke starts.
  let first = index;
  while (first > 0 && (strokes[first]?.start ?? -Infinity) + longest / 2 > time) {
    first--;
  }
  let before = strokes[first];
  if (!before) {
    return;
  }

  out.string = before.string;
  out.crossMean = before.crossMean;
  for (let j = first + 1; j < strokes.length; j++) {
    const after = strokes[j];
    if (!after || after.start - m.crossLeadSec - longest > time) {
      break;
    }
    const step = after.string - before.string;
    const mean = after.crossMean - before.crossMean;
    const cross = m.crossSec * Math.max(1, Math.abs(step), Math.abs(mean));
    const room = after.start - before.start;
    const end = after.start - Math.min(m.crossLeadSec, 0.1 * room) + Math.max(0, cross - room) / 2;
    const x = smoothstep((time - (end - cross)) / cross);
    out.string += step * x;
    out.crossMean += mean * x;
    before = after;
  }
}

/**
 * Calculates the bow and the hands of a bowed string player at one time (design 5.3). The
 * state is a function of the strokes and the time only. Each note event happens at the note
 * start: the stroke of the bow starts, or the finger plucks. The motion before the note (the
 * landing of the bow, the retake, and the return of the plucking finger) ends at the note start.
 * The shift of the left hand and the finger of the note end a little earlier, when the finger
 * lands (`LEFT_HAND.landSec`), and the string crossing of the bow ends `BOW_MOTION.crossLeadSec`
 * before the note.
 *
 * @param strokes The strokes of the player, from {@link buildStrokesSteps}.
 * @param starts The starts of the strokes.
 * @param time The song time of the note layer, in seconds.
 * @param out The state to write.
 */
export function bowStateAt(
  strokes: readonly Stroke[],
  starts: Float64Array,
  time: number,
  out: BowState,
): void {
  const m = BOW_MOTION;
  const i = lastAtOrBefore(starts, time);
  const current = strokes[i];
  const next = strokes[i + 1];
  const first = strokes[0];
  if (!first) {
    out.bow = 0;
    out.lift = m.lift;
    out.pizzicato = 0;
    out.pluck = -1;
    out.string = 1.5;
    out.crossMean = 1.5;
    out.loudness = 0;
    out.fingerboard = fingerboardPlace(2);
    out.reach = 0;
    out.stopString = 1.5;
    out.vibrato = 0;
    out.press = 0;
    out.gesture = 1;
    return;
  }
  if (!current) {
    // Before the first note, the bow waits above the strings and lands at the note start.
    out.bow = first.bowFrom;
    out.lift = m.lift * smoothstep((first.start - time) / m.landSec);
    out.pizzicato = pizzicatoOf(first);
    out.pluck = -1;
    crossAt(strokes, 0, time, out);
    out.loudness = first.loudnessFrom;
    out.fingerboard = first.hand.place;
    out.reach = first.hand.reach;
    out.stopString = first.hand.stopString;
    out.vibrato = 0;
    out.press = pressOf(first, time, LEFT_HAND.landSec);
    out.gesture = first.gesture;
    return;
  }

  // The bow on the strings, and the lift and the retake in a rest. In a slur, the bow moves on
  // between its notes.
  if (time <= current.end) {
    out.bow = bowInStroke(current, time);
    out.lift = 0;
  } else if (next && next.slur === current.slur) {
    out.bow = bowInSlur(current.slur, time);
    out.lift = 0;
  } else if (!next) {
    out.bow = current.bowTo;
    out.lift = m.lift * smoothstep((time - current.end) / m.liftSec);
  } else {
    const gap = next.start - current.end;
    out.bow = current.bowTo;
    out.lift = 0;
    if (gap > m.stayGapSec) {
      const up = Math.min(m.liftSec, gap / 3);
      const land = Math.min(m.landSec, gap / 3);
      const height = m.lift * Math.min(1, gap / m.fullLiftGapSec);
      out.lift =
        height * smoothstep(Math.min((time - current.end) / up, (next.start - time) / land));
      if (next.retake) {
        const x = (time - current.end - up) / (gap - up - land);
        out.bow = current.bowTo + (next.bowFrom - current.bowTo) * smoothstep(x);
      }
    }
  }

  // The bow crosses to the string of the next note before it, and the right elbow follows the
  // string of its arm. The sounding point follows the loudness.
  crossAt(strokes, i, time, out);
  out.loudness = followLoudness(current.loudnessFrom, current.loudness, time - current.start);
  leftHandAt(strokes, i, time, out);

  // The change between the bow and pizzicato.
  out.pizzicato = pizzicatoOf(current);
  if (time > current.turnFrom) {
    const x = clamp01((time - current.turnFrom) / (current.turnTo - current.turnFrom));
    out.pizzicato += (1 - 2 * out.pizzicato) * x;
  }

  // The pluck: the finger crosses the strings at the note start, then goes back before the
  // next pluck and rests on the string.
  out.pluck = -1;
  if (current.plucked) {
    const interval = next ? next.start - current.start : Infinity;
    const flick = Math.min(m.flickSec, 0.4 * interval);
    const dt = time - current.start;
    if (dt < flick) {
      const x = dt / flick;
      out.pluck = -1 + 2 * (1 - (1 - x) * (1 - x));
    } else if (next?.plucked === true) {
      const hold = Math.min(m.pluckHoldSec, 0.2 * interval);
      const back = Math.max(current.start + flick, next.start - m.pluckReturnSec);
      out.pluck = 1 - 2 * smoothstep((time - back) / (next.start - hold - back));
    } else {
      out.pluck = 1;
    }
  }

  out.gesture = current.gesture;
}
