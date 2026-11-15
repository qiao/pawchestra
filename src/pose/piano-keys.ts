import { PIANO } from '../models/instruments/piano.ts';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { CHORD_SEC } from './note-groups.ts';
import { smoothstep } from '../math.ts';

/** The number of keys of the piano, from A0 to C8. */
export const PIANO_KEY_COUNT = PIANO.keys[1] - PIANO.keys[0] + 1;

/** The times of the press of a piano key (design 5.3), in seconds. */
const KEY_MOTION = {
  /** A key goes down in this time, and reaches the key bottom at its note start. */
  pressSec: 0.03,
  /** A key comes up in this time after its note end. */
  releaseSec: 0.06,
  /**
   * Between two presses of one key, the press and the release each take at most this share of
   * the time from one note start to the next. Thus the key comes up between the two notes, also
   * when the first note ends at the start of the next.
   */
  repeatShare: 0.5,
} as const;

/**
 * The presses of the piano keys of one player (design 5.3). Each press has four times: the key
 * starts to go down, reaches the key bottom at the note start, starts to come up, and is up. The
 * presses of one key do not overlap.
 */
export interface KeyTrack {
  /**
   * The first press of each key in the lists of times, then the end of the lists. Key `k` (the
   * MIDI key `PIANO.keys[0] + k`) has the presses from `first[k]` up to `first[k + 1]`, the end
   * excluded.
   */
  readonly first: Uint32Array;
  /** The time when the key of each press starts to go down, sorted for each key. */
  readonly downStarts: Float64Array;
  /** The time when the key of each press reaches the key bottom: the note start. */
  readonly downEnds: Float64Array;
  /** The time when the key of each press starts to come up: the note end, or before a repeat. */
  readonly upStarts: Float64Array;
  /** The time when the key of each press is up again. */
  readonly upEnds: Float64Array;
}

/** One press of one key, from one or more notes. */
interface Press {
  /** The note start, and the latest note end of the press. */
  readonly start: number;
  end: number;
}

/**
 * Gives the index of the key that a note presses: the nearest key of the piano, as
 * `pianoKeyPosition()` does.
 *
 * @param pitch The MIDI key of the note.
 * @returns The index of the key, from 0 (A0) to 87 (C8).
 */
function keyIndexOf(pitch: number): number {
  const [low, high] = PIANO.keys;
  return Math.min(Math.max(Math.round(pitch), low), high) - low;
}

/**
 * Collects the presses of each key. Two notes of one key that start within `CHORD_SEC` of each
 * other are one press, as one finger plays a unison of two voices.
 *
 * @param notes The notes of the player, sorted by start.
 * @returns The presses of each key, sorted by start.
 */
function pressesOf(notes: readonly PlayerNote[]): Press[][] {
  const presses = Array.from({ length: PIANO_KEY_COUNT }, (): Press[] => []);
  for (const note of notes) {
    const own = presses[keyIndexOf(note.pitch)];
    const last = own?.[own.length - 1];
    if (last && note.startSec - last.start <= CHORD_SEC) {
      last.end = Math.max(last.end, note.endSec);
    } else {
      own?.push({ start: note.startSec, end: note.endSec });
    }
  }
  return presses;
}

/**
 * Builds the key track of one player from its notes (design 5.3). A key reaches the key bottom at
 * its note start, after a press of {@link KEY_MOTION.pressSec}. It stays down until the note end,
 * and comes up in {@link KEY_MOTION.releaseSec}. Before a repeat of the key, the key comes up
 * early enough to go down again at the next start, so that the repeat shows a rise.
 *
 * @param notes The notes of the player, sorted by start. A note outside A0 to C8 presses the
 *   nearest key.
 * @returns The track.
 */
export function buildKeyTrack(notes: readonly PlayerNote[]): KeyTrack {
  const m = KEY_MOTION;
  const presses = pressesOf(notes);
  const count = presses.reduce((sum, own) => sum + own.length, 0);
  const first = new Uint32Array(PIANO_KEY_COUNT + 1);
  const downStarts = new Float64Array(count);
  const downEnds = new Float64Array(count);
  const upStarts = new Float64Array(count);
  const upEnds = new Float64Array(count);
  let j = 0;
  for (const [k, own] of presses.entries()) {
    first[k] = j;
    for (const [i, press] of own.entries()) {
      const before = own[i - 1];
      const next = own[i + 1];
      const gapBefore = before ? press.start - before.start : Infinity;
      const gapAfter = next ? next.start - press.start : Infinity;
      const pressSec = Math.min(m.pressSec, m.repeatShare * gapBefore);
      const releaseSec = Math.min(m.releaseSec, m.repeatShare * gapAfter);
      const nextPressSec = Math.min(m.pressSec, m.repeatShare * gapAfter);
      const latestUp = next ? next.start - nextPressSec - releaseSec : Infinity;
      const upStart = Math.max(press.start, Math.min(press.end, latestUp));
      downStarts[j] = press.start - pressSec;
      downEnds[j] = press.start;
      upStarts[j] = upStart;
      upEnds[j] = upStart + releaseSec;
      j++;
    }
  }
  first[PIANO_KEY_COUNT] = j;
  return { first, downStarts, downEnds, upStarts, upEnds };
}

/**
 * Calculates the press level of each piano key at a song time (design 5.3): a pure function of
 * the track and the time, with no state between frames. A key goes down with a rising speed, and
 * reaches the key bottom at its full speed at the note start, as the paw strikes it. It comes up
 * with an eased start and stop.
 *
 * @param track The key track of the player.
 * @param time The song time of the note layer, in seconds.
 * @param out The level of each key from A0 to write, from 0 (up) to 1 (at the key bottom). It has
 *   {@link PIANO_KEY_COUNT} entries.
 */
export function keyLevelsAt(track: KeyTrack, time: number, out: Float32Array): void {
  for (let k = 0; k < PIANO_KEY_COUNT; k++) {
    const j = lastAtOrBefore(track.downStarts, time, track.first[k] ?? 0, track.first[k + 1] ?? 0);
    const downStart = track.downStarts[j];
    const downEnd = track.downEnds[j];
    const upStart = track.upStarts[j];
    const upEnd = track.upEnds[j];
    if (
      downStart === undefined ||
      downEnd === undefined ||
      upStart === undefined ||
      upEnd === undefined ||
      time >= upEnd
    ) {
      out[k] = 0;
    } else if (time < downEnd) {
      const share = (time - downStart) / (downEnd - downStart);
      out[k] = share * share;
    } else if (time < upStart) {
      out[k] = 1;
    } else {
      out[k] = 1 - smoothstep((time - upStart) / (upEnd - upStart));
    }
  }
}
