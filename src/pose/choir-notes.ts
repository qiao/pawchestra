import { MathUtils } from 'three';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { PHRASE_GAP_SEC, groupChords, joinSpans, spanEnvelope } from './note-groups.ts';
import { smoothstep } from './rest.ts';

/** The motion of a singer (design 5.3). */
export const CHOIR_MOTION = {
  /**
   * The jaw or the lower beak opens this far for a note, at a gesture size of 1. The beak of a
   * singer in the front row of the default view is about 3 pixels long, so 18° does not show.
   * With 35°, the beak does not show in a section shot at 1440 × 900. The singing penguins of
   * `orchestra-side.png` open their beaks about 60° to 75°, so the penguin mesh keeps this
   * angle.
   */
  jaw: 50 * MathUtils.DEG2RAD,
  /**
   * The neck and the head lift this far at the full opening of the jaw, so that each sung note
   * also shows from the default view, where the beak is a few pixels long. The lift follows the
   * opening of the jaw. The beak of the penguin mesh opens, so a lift of 15° is enough.
   */
  headLift: 15 * MathUtils.DEG2RAD,
  /**
   * The spine leans back by this angle at the top of the breath in before a phrase, at an
   * amplitude of 1, and the chest rises with it. The breath in takes 0.4 s and ends at the first
   * note. The breath out lasts the phrase, but at least 1 s.
   */
  breath: 4 * MathUtils.DEG2RAD,
  inhaleSec: 0.4,
  exhaleSec: 1,
  /**
   * The fastest turn of the jaw, in radians each second: 5.3° in a frame of 1/30 s. A note that
   * the jaw cannot reach at this speed opens less, and a short time between two notes gives a
   * smaller dip. A jaw that opened in 0.1 s moved up to 15° in one frame.
   */
  jawRate: 160 * MathUtils.DEG2RAD,
  /** The jaw opens in this time before a note: at most half the time from the note before. */
  openSec: 0.6,
  /**
   * The jaw closes in this time after the end of a note, or slower, so that it turns at most at
   * {@link jawRate}.
   */
  closeSec: 0.12,
  /** Between two notes, an open jaw closes to this part of its opening and opens again. */
  dip: 0.5,
  /**
   * The chest turns this far to each side in a phrase, at a gesture size of 1. Neighbor voices
   * (seats) turn to opposite sides. With 3°, the singers move very little in 6 s.
   */
  sway: 6 * MathUtils.DEG2RAD,
  /** The chest turns to one side in this number of beats. */
  swayBeats: 2,
  /** The sway rises in this time before a phrase, and fades in this time after it. */
  swayRiseSec: 0.4,
  swayFadeSec: 1,
} as const;

/** The note data of a singer that the pose looks up at each frame. */
export interface ChoirTrack {
  /** The time at which the jaw starts to open for each note, sorted. */
  readonly openStarts: Float64Array;
  /** The start and the end of each sung note. */
  readonly starts: Float64Array;
  readonly ends: Float64Array;
  /** The opening of the jaw for each note, in radians. */
  readonly opens: Float64Array;
  /** The opening of the jaw when it starts to open for each note, from the note before. */
  readonly bases: Float64Array;
  /** The dip of the jaw before each note, in radians (`CHOIR_MOTION.dip`). */
  readonly dips: Float64Array;
  /** The time in which the jaw closes after the end of each note, in seconds. */
  readonly closes: Float64Array;
  /** The start and the end of each phrase, and its gesture size. */
  readonly phraseStarts: Float64Array;
  readonly phraseEnds: Float64Array;
  readonly phraseGestures: Float64Array;
}

/**
 * Gives the opening of the jaw for a note, from its start on: open while the note sounds, then
 * closed in the close time of the note.
 *
 * @param open The opening of the note.
 * @param end The end of the note.
 * @param close The close time of the note, in seconds.
 * @param time The song time, at or after the start of the note.
 * @returns The opening, in radians.
 */
function heldJaw(open: number, end: number, close: number, time: number): number {
  return open * (1 - smoothstep((time - end) / close));
}

/**
 * Gives the time in which a jaw closes from an opening, at most at {@link CHOIR_MOTION.jawRate}.
 * The smooth step turns 1.5 times faster than its mean speed at its middle.
 *
 * @param open The opening, in radians.
 * @returns The time, in seconds.
 */
function closeTime(open: number): number {
  return Math.max(CHOIR_MOTION.closeSec, (1.5 * open) / CHOIR_MOTION.jawRate);
}

/**
 * Calculates the note data of a singer (design 5.3). A singer sings one note at a time: of the
 * notes that start within 50 ms of each other, it shows one note, from the first start to the
 * last end. Rests of at least 0.5 s end a phrase.
 *
 * @param notes The notes of the singer, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param amplitude The seeded amplitude of the singer.
 * @returns The note data.
 */
export function buildChoirTrack(
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  amplitude: number,
): ChoirTrack {
  const m = CHOIR_MOTION;
  const sung = groupChords(notes, loudness);
  const notesSung = sung.length;
  const openStarts = new Float64Array(notesSung);
  const opens = new Float64Array(notesSung);
  const bases = new Float64Array(notesSung);
  const dips = new Float64Array(notesSung);
  const closes = new Float64Array(notesSung);
  for (const [i, g] of sung.entries()) {
    const before = sung[i - 1];
    const time = before ? Math.min(m.openSec, (g.start - before.start) / 2) : m.openSec;
    const at = g.start - time;
    const base = before ? heldJaw(opens[i - 1] ?? 0, before.end, closes[i - 1] ?? 1, at) : 0;
    // The smooth step from the base turns at most at the jaw rate, and the dip takes the rest of
    // the speed: its sine turns π times faster than its depth over the time.
    const reach = (m.jawRate * time) / 1.5;
    const open = MathUtils.clamp(
      m.jaw * gestureSize(g.loudness, amplitude),
      base - reach,
      base + reach,
    );
    const room = (m.jawRate * time - 1.5 * Math.abs(open - base)) / Math.PI;
    openStarts[i] = at;
    opens[i] = open;
    bases[i] = base;
    dips[i] = MathUtils.clamp(m.dip * Math.min(base, open), 0, Math.max(room, 0));
    closes[i] = closeTime(open);
  }
  const phrases = joinSpans(sung, PHRASE_GAP_SEC);
  const gestureOf = (first: number, count: number): number => {
    const loudest = Math.max(...sung.slice(first, first + count).map((g) => g.loudness));
    return gestureSize(loudest, amplitude);
  };
  return {
    openStarts,
    starts: Float64Array.from(sung, (g) => g.start),
    ends: Float64Array.from(sung, (g) => g.end),
    opens,
    bases,
    dips,
    closes,
    phraseStarts: Float64Array.from(phrases, (p) => p.start),
    phraseEnds: Float64Array.from(phrases, (p) => p.end),
    phraseGestures: Float64Array.from(phrases, (p) => gestureOf(p.first, p.count)),
  };
}

/** The jaw, the sway, and the breath of a singer at one time. The pose reads it. */
export interface ChoirState {
  /** The opening of the jaw, in radians. */
  jaw: number;
  /** The size of the sway of the phrase: the gesture size times the envelope of the phrase. */
  sway: number;
  /** The breath: 1 at the start of a phrase, after the breath in. */
  breath: number;
}

/**
 * Makes a choir state with no motion.
 *
 * @returns The state.
 */
export function createChoirState(): ChoirState {
  return { jaw: 0, sway: 0, breath: 0 };
}

/**
 * Gives the fade of the sway of a phrase from its start on: full in the phrase, then 0 in
 * {@link CHOIR_MOTION.swayFadeSec}.
 *
 * @param time The song time.
 * @param end The end of the phrase.
 * @returns The weight, from 0 to 1.
 */
function swayFade(time: number, end: number): number {
  return 1 - smoothstep((time - end) / CHOIR_MOTION.swayFadeSec);
}

/**
 * Gives the breath of a phrase from its start on: it falls over the phrase, in at least 1 s.
 *
 * @param time The song time.
 * @param end The end of the phrase.
 * @param start The start of the phrase.
 * @returns The breath, from 0 to 1.
 */
function exhale(time: number, end: number, start: number): number {
  return 1 - smoothstep((time - start) / Math.max(CHOIR_MOTION.exhaleSec, end - start));
}

/**
 * Calculates the jaw, the sway, and the breath of a singer at a song time (design
 * 5.3). The jaw opens before each note, and it is open at the note start. It stays open while the
 * note sounds, and closes after it. Between two notes, it closes a part of the way and opens
 * again, so that each note shows. The jaw turns at most at `CHOIR_MOTION.jawRate`. The sway
 * rises before each phrase and fades after it. The breath in rises in the 0.4 s
 * before each phrase.
 *
 * @param track The note data of the singer.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function choirStateAt(track: ChoirTrack, time: number, out: ChoirState): void {
  const i = lastAtOrBefore(track.openStarts, time);
  const openStart = track.openStarts[i];
  const start = track.starts[i];
  const open = track.opens[i] ?? 0;
  const base = track.bases[i] ?? 0;
  const dip = track.dips[i] ?? 0;
  if (openStart === undefined || start === undefined) {
    out.jaw = 0;
  } else if (time < start) {
    const p = (time - openStart) / (start - openStart);
    // The dip ends with its full speed at the note start, as the voice starts.
    out.jaw = base + (open - base) * smoothstep(p) - dip * Math.sin(Math.PI * p);
  } else {
    out.jaw = heldJaw(open, track.ends[i] ?? start, track.closes[i] ?? 1, time);
  }
  const phrase = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    CHOIR_MOTION.swayRiseSec,
    swayFade,
  );
  out.sway = phrase.weight * (track.phraseGestures[phrase.index] ?? 0);
  out.breath = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    CHOIR_MOTION.inhaleSec,
    exhale,
  ).weight;
}
