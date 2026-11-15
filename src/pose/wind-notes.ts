import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { PHRASE_GAP_SEC, groupChords, joinSpans, spanEnvelope } from './note-groups.ts';
import { smoothstep } from '../math.ts';
import { planSlide, windFingering } from './wind-fingering.ts';
import type { Brass, Woodwind } from './wind-fingering.ts';

/** The times of the note layer of the woodwinds and the brass, in seconds (design 5.3). */
export const WIND_MOTION = {
  /** The breath in takes this time, and it ends at the first note of the phrase. */
  inhaleSec: 0.4,
  /** The breath out lasts the phrase, but at least this time. */
  exhaleSec: 1,
  /**
   * A press of keys or valves takes at most this time, and arrives at the note start. A flute key
   * moves in about 10 ms (`docs/reference/wind-technique.md` 7.4). The app takes about two times
   * that, so that the press shows in at least one frame at 60 frames each second.
   */
  pressSec: 0.02,
  /** A release takes at most this time: a key spring returns in about 16 ms (7.4). */
  releaseSec: 0.03,
  /** The trombone slide takes at most this time to move to the next note. */
  slideSec: 0.1,
} as const;

/** The highest trombone position: the seventh. */
const LAST_POSITION = 7;

/**
 * Gives the distance of a slide position from the first position, as a part of the distance of
 * the seventh position (design 5.3). Each position lowers the pitch by one semitone, so the tube
 * of position n is 2^((n - 1) / 12) times the tube of the first position. The slide moves by half
 * of the added tube, so each step is longer than the step before, as on a real slide.
 *
 * @param position The position, from 1 to 7.
 * @returns The part, from 0 at the first position to 1 at the seventh position.
 */
function slideTravel(position: number): number {
  return (2 ** ((position - 1) / 12) - 1) / (2 ** ((LAST_POSITION - 1) / 12) - 1);
}

/** The note that a wind player shows from one time on: one note of a chord, or one note alone. */
interface WindNote {
  /** The note start, in song seconds. */
  readonly start: number;
  /** The end of the sound, in song seconds. */
  readonly end: number;
  readonly pitch: number;
}

/**
 * Gives the notes that a wind player shows (design 5.3). A wind instrument plays one note at a
 * time, but a seat at its cap can give one player two notes (3.8). The player shows the last
 * note that started. Of the notes that start within 50 ms of each other (a chord), it shows the
 * highest.
 *
 * @param notes The notes of the player, sorted by start.
 * @returns The shown notes, sorted by start.
 */
export function windNotes(notes: readonly PlayerNote[]): WindNote[] {
  return groupChords(notes).map((g) => ({ start: g.start, end: g.end, pitch: g.high }));
}

/** The note data of a wind player that the pose looks up at each frame. */
export interface WindTrack {
  /** The start of each shown note, sorted. */
  readonly starts: Float64Array;
  /** The close of the left and the right fingers for each note, from 0 to 1, or -1 to hold. */
  readonly fingersL: Float32Array;
  readonly fingersR: Float32Array;
  /** The part of the slide travel of each note: 0 at the first position, 1 at the seventh. */
  readonly slide: Float32Array;
  /**
   * The time of the move of the left and the right fingers to each note: a press or a release
   * ({@link WIND_MOTION}). It ends at the note start.
   */
  readonly moveL: Float32Array;
  readonly moveR: Float32Array;
  /** The time of the move of the slide to each note. It ends at the note start. */
  readonly slideMove: Float32Array;
  /** The start and the end of each phrase. */
  readonly phraseStarts: Float64Array;
  readonly phraseEnds: Float64Array;
}

/**
 * Gives the time of the move of one hand to each note: a press when the hand closes more, and a
 * release when it opens, at most the time from the note before.
 *
 * @param closes The close of the hand for each note.
 * @param starts The note starts.
 * @returns The move time of each note.
 */
function moveTimes(closes: Float32Array, starts: Float64Array): Float32Array {
  return Float32Array.from(closes, (close, i) => {
    const before = closes[i - 1] ?? close;
    const time = close > before ? WIND_MOTION.pressSec : WIND_MOTION.releaseSec;
    return Math.min(time, (starts[i] ?? 0) - (starts[i - 1] ?? -Infinity));
  });
}

/**
 * Calculates the note data of a wind player (design 5.3): the fingering of each shown note from
 * the charts of `pose/wind-fingering.ts`, the trombone position with its alternates, and the
 * phrases for the breath.
 *
 * @param notes The notes of the player, sorted by start.
 * @param instrument The wind instrument.
 * @returns The note data.
 */
export function buildWindTrack(
  notes: readonly PlayerNote[],
  instrument: Woodwind | Brass,
): WindTrack {
  const shown = windNotes(notes);
  const positions = instrument === 'trombone' ? planSlide(shown) : null;
  const fingerings = shown.map((n, i) => windFingering(instrument, n.pitch, positions?.[i] ?? 0));
  const phrases = joinSpans(shown, PHRASE_GAP_SEC);
  const starts = Float64Array.from(shown, (n) => n.start);
  const fingersL = Float32Array.from(fingerings, (f) => f.left);
  const fingersR = Float32Array.from(fingerings, (f) => f.right);
  return {
    starts,
    fingersL,
    fingersR,
    slide: Float32Array.from(fingerings, (f) => (f.position > 0 ? slideTravel(f.position) : 0)),
    moveL: moveTimes(fingersL, starts),
    moveR: moveTimes(fingersR, starts),
    slideMove: Float32Array.from(starts, (start, i) =>
      Math.min(WIND_MOTION.slideSec, start - (starts[i - 1] ?? -Infinity)),
    ),
    phraseStarts: Float64Array.from(phrases, (p) => p.start),
    phraseEnds: Float64Array.from(phrases, (p) => p.end),
  };
}

/** The fingers, the slide, and the breath of a wind player at one time. The pose reads it. */
export interface WindState {
  /** The close of the left and the right fingers, from 0 to 1, or -1 to hold. */
  fingersL: number;
  fingersR: number;
  /** The part of the slide travel: 0 at the first position, 1 at the seventh. */
  slide: number;
  /** The breath: 1 at the start of a phrase, after the breath in. */
  breath: number;
}

/**
 * Makes a wind state with no motion.
 *
 * @returns The state.
 */
export function createWindState(): WindState {
  return { fingersL: 0, fingersR: 0, slide: 0, breath: 0 };
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
  return 1 - smoothstep((time - start) / Math.max(WIND_MOTION.exhaleSec, end - start));
}

/**
 * Moves from the value of the note before to the value of a note, in the move time before the
 * note start.
 *
 * @param values The value of each note.
 * @param moves The move time of each note.
 * @param starts The note starts.
 * @param i The index of the last note at or before the time.
 * @param time The song time.
 * @param first The value before the first note.
 * @returns The value at the time.
 */
function moveTo(
  values: Float32Array,
  moves: Float32Array,
  starts: Float64Array,
  i: number,
  time: number,
  first: number,
): number {
  const current = i < 0 ? first : (values[i] ?? first);
  const next = values[i + 1];
  const start = starts[i + 1];
  const move = moves[i + 1];
  if (next === undefined || start === undefined || move === undefined || time < start - move) {
    return current;
  }
  return current + (next - current) * smoothstep((time - start + move) / move);
}

/**
 * Calculates the fingers, the slide, and the breath of a wind player at a song time (design
 * 5.3). The fingers and the slide arrive at the note start. Before the first note, the fingers
 * and the slide keep the values of the first note.
 *
 * @param track The note data.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function windStateAt(track: WindTrack, time: number, out: WindState): void {
  const i = lastAtOrBefore(track.starts, time);
  const firstL = track.fingersL[0] ?? 0;
  const firstR = track.fingersR[0] ?? 0;
  out.fingersL = moveTo(track.fingersL, track.moveL, track.starts, i, time, firstL);
  out.fingersR = moveTo(track.fingersR, track.moveR, track.starts, i, time, firstR);
  out.slide = moveTo(track.slide, track.slideMove, track.starts, i, time, track.slide[0] ?? 0);
  // The breath in rises in the `inhaleSec` before a phrase.
  out.breath = spanEnvelope(
    track.phraseStarts,
    track.phraseEnds,
    time,
    WIND_MOTION.inhaleSec,
    exhale,
  ).weight;
}
