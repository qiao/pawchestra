import { MathUtils } from 'three';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { PHRASE_GAP_SEC, groupChords, joinSpans, spanEnvelope } from './note-groups.ts';
import { smoothstep } from '../math.ts';

/** The motion of a singer (design 5.3). */
export const CHOIR_MOTION = {
  /**
   * The jaw or the lower beak opens this far for a note, at a gesture size of 1. The lower beak
   * of the Tripo penguin turns at the back of the mouth slit, so a small angle opens a long gape,
   * as a singing bird does. At 50°, the long lower beak hung down as a wide hinge.
   */
  jaw: 20 * MathUtils.DEG2RAD,
  /**
   * The neck and the head lift this far in a phrase, as a real choir singer lifts the head a
   * little to sing and keeps it still on each note. The lift rises in {@link liftRiseSec} before
   * the phrase and falls in {@link liftFadeSec} after it. A lift of 15° that followed the jaw
   * turned the head 17° in 0.09 s at each note.
   */
  headLift: 4 * MathUtils.DEG2RAD,
  liftRiseSec: 0.8,
  liftFadeSec: 1.5,
  /**
   * The spine leans back by this angle at the top of the breath in before a phrase, at an
   * amplitude of 1, and the chest rises with it. The breath in takes 0.4 s and ends at the first
   * note. The breath out lasts the phrase, but at least 1 s.
   */
  breath: 4 * MathUtils.DEG2RAD,
  inhaleSec: 0.4,
  exhaleSec: 1,
  /**
   * The fastest turn of the jaw as it opens, in radians each second: 5.3° in a frame of 1/30 s.
   * A jaw that opened in 0.1 s moved up to 15° in one frame.
   */
  openRate: 160 * MathUtils.DEG2RAD,
  /**
   * The fastest turn of the jaw as it closes, in radians each second: 9° in a frame of 1/30 s. The
   * jaw closes faster than it opens, so that it closes in a short rest.
   */
  closeRate: 270 * MathUtils.DEG2RAD,
  /**
   * The part of the opening that is done at the note start. The opening goes on after the start,
   * so that the jaw opens just before the voice, as a real singer opens the mouth for the vowel.
   * When the jaw opened fully before the start at the open rate, the beak was 15° open 0.4 s
   * before the sound.
   */
  openShare: 0.65,
  /** After a short rest, the jaw starts to open at least this time before the note. */
  leadMinSec: 0.04,
  /** A rest shorter than this is legato: the jaw closes only to {@link dip} and opens again. */
  legatoSec: 0.1,
  /** In a legato, the jaw starts to close at most this time before the next note. */
  dipSec: 0.2,
  /** In a legato, an open jaw closes to this part of its opening and opens again. */
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
  /** The time at which the jaw is fully open for each note. It can be after the note start. */
  readonly openEnds: Float64Array;
  /** The opening of the jaw when it starts to open for each note, from the note before. */
  readonly bases: Float64Array;
  /** The opening of the jaw for each note, in radians. */
  readonly opens: Float64Array;
  /** The start and the end of the close of the jaw after each note. */
  readonly closeStarts: Float64Array;
  readonly closeEnds: Float64Array;
  /** The opening of the jaw at the end of the close after each note: 0 when it fully closes. */
  readonly lows: Float64Array;
  /** The start and the end of each sung note. */
  readonly starts: Float64Array;
  readonly ends: Float64Array;
  /** The start and the end of each phrase, and its gesture size. */
  readonly phraseStarts: Float64Array;
  readonly phraseEnds: Float64Array;
  readonly phraseGestures: Float64Array;
}

/**
 * Gives the time of a smooth step of the jaw over an angle at a rate. The smooth step turns 1.5
 * times faster than its mean speed at its middle.
 *
 * @param angle The angle, in radians.
 * @param rate The fastest turn, in radians each second.
 * @returns The time, in seconds.
 */
function stepTime(angle: number, rate: number): number {
  return (1.5 * Math.abs(angle)) / rate;
}

/**
 * Gives a smooth step from one value to another over a time span. It starts and ends with no
 * speed, so that the jaw does not jump in speed between two steps.
 *
 * @param from The value at the start.
 * @param to The value at the end.
 * @param start The start of the span.
 * @param end The end of the span.
 * @param time The time.
 * @returns The value.
 */
function easeOver(from: number, to: number, start: number, end: number, time: number): number {
  return end > start ? from + (to - from) * smoothstep((time - start) / (end - start)) : to;
}

/**
 * Calculates the note data of a singer (design 5.3). A singer sings one note at a time: of the
 * notes that start within 50 ms of each other, it shows one note, from the first start to the
 * last end. Rests of at least 0.5 s end a phrase.
 *
 * For each note, the jaw opens at most at {@link CHOIR_MOTION.openRate}, and {@link
 * CHOIR_MOTION.openShare} of the opening is done at the note start. After the note end, the jaw
 * closes at most at {@link CHOIR_MOTION.closeRate}, fully when the rest gives the time, or else
 * as far as it can before the jaw opens for the next note. In a legato, it closes to {@link
 * CHOIR_MOTION.dip} of the opening.
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
  const opens = Float64Array.from(sung, (g) => m.jaw * gestureSize(g.loudness, amplitude));
  const openStarts = new Float64Array(notesSung);
  const openEnds = new Float64Array(notesSung);
  const bases = new Float64Array(notesSung);
  const closeStarts = new Float64Array(notesSung);
  const closeEnds = new Float64Array(notesSung);
  const lows = new Float64Array(notesSung);
  for (const [i, g] of sung.entries()) {
    const open = opens[i] ?? 0;
    const base = lows[i - 1] ?? 0;
    const opening = stepTime(open - base, m.openRate);
    const openStart = Math.max(closeEnds[i - 1] ?? -Infinity, g.start - m.openShare * opening);
    const openEnd = openStart + opening;
    const next = sung[i + 1];
    const legato = next !== undefined && next.start - g.end < m.legatoSec;
    const closeStart = Math.max(openEnd, legato ? Math.min(g.end, next.start - m.dipSec) : g.end);
    // A legato dip closes at the open rate, so that its turn from the close to the opening is
    // not sudden.
    const rate = legato ? m.openRate : m.closeRate;
    // The close ends before the jaw opens for the next note. A short rest gives a part of it.
    const room = next ? next.start - m.leadMinSec - closeStart : Infinity;
    const floor = legato ? m.dip * Math.min(open, opens[i + 1] ?? 0) : 0;
    const low = room > 0 ? Math.max(floor, open - room * (rate / 1.5)) : open;
    openStarts[i] = openStart;
    openEnds[i] = openEnd;
    bases[i] = base;
    closeStarts[i] = closeStart;
    closeEnds[i] = closeStart + stepTime(open - low, rate);
    lows[i] = low;
  }
  const phrases = joinSpans(sung, PHRASE_GAP_SEC);
  const gestureOf = (first: number, count: number): number => {
    const loudest = Math.max(...sung.slice(first, first + count).map((g) => g.loudness));
    return gestureSize(loudest, amplitude);
  };
  return {
    openStarts,
    openEnds,
    bases,
    opens,
    closeStarts,
    closeEnds,
    lows,
    starts: Float64Array.from(sung, (g) => g.start),
    ends: Float64Array.from(sung, (g) => g.end),
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
  /** The lift of the head in a phrase, from 0 to 1 (`CHOIR_MOTION.headLift`). */
  lift: number;
}

/**
 * Makes a choir state with no motion.
 *
 * @returns The state.
 */
export function createChoirState(): ChoirState {
  return { jaw: 0, sway: 0, breath: 0, lift: 0 };
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
 * Gives the lift of the head in a phrase from its start on: full in the phrase, then 0 in
 * {@link CHOIR_MOTION.liftFadeSec}.
 *
 * @param time The song time.
 * @param end The end of the phrase.
 * @returns The weight, from 0 to 1.
 */
function liftFade(time: number, end: number): number {
  return 1 - smoothstep((time - end) / CHOIR_MOTION.liftFadeSec);
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
 * Calculates the jaw, the sway, the breath, and the head lift of a singer at a song time (design
 * 5.3). The jaw starts to open just before each note, and it is fully open a little after the
 * note start. It stays open while the note sounds, and closes after it: fully in a rest, and a
 * part of the way in a legato, so that each note shows ({@link buildChoirTrack}). The sway and
 * the head lift rise before each phrase and fade after it. The breath in rises in the 0.4 s
 * before each phrase.
 *
 * @param track The note data of the singer.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function choirStateAt(track: ChoirTrack, time: number, out: ChoirState): void {
  const i = lastAtOrBefore(track.openStarts, time);
  const openStart = track.openStarts[i];
  const open = track.opens[i] ?? 0;
  const closeStart = track.closeStarts[i] ?? 0;
  if (openStart === undefined) {
    out.jaw = 0;
  } else if (time < closeStart) {
    out.jaw = easeOver(track.bases[i] ?? 0, open, openStart, track.openEnds[i] ?? 0, time);
  } else {
    out.jaw = easeOver(open, track.lows[i] ?? 0, closeStart, track.closeEnds[i] ?? 0, time);
  }
  const phrase = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    CHOIR_MOTION.swayRiseSec,
    swayFade,
  );
  out.sway = phrase.weight * (track.phraseGestures[phrase.index] ?? 0);
  out.lift = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    CHOIR_MOTION.liftRiseSec,
    liftFade,
  ).weight;
  out.breath = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    CHOIR_MOTION.inhaleSec,
    exhale,
  ).weight;
}
