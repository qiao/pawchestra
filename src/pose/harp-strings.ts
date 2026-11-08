import { HARP, harpString } from '../models/instruments/harp.ts';
import type { PlayerNote } from '../score/types.ts';
import { CHORD_SEC } from './note-groups.ts';

/** The number of strings of the harp, from C1 to G7. */
export const HARP_STRING_COUNT = HARP.strings;

/**
 * The swing of a plucked harp string over time (design 5.3, `docs/reference/harp-technique.md`,
 * section 5). A pluck releases the string at once, so the swing starts at its full size at the
 * note start. Then it decays, and a damp at the note end stops it.
 */
const STRING_MOTION = {
  /**
   * The time constant of the decay of the swing of a free string, for the bass string C1 and for
   * the treble string G7, in seconds. The strings between take the geometric mean by their place.
   * Thus the string C♭3 gets about 1.5 s, the decay of its first partial in a measure of a
   * concert harp (`docs/reference/harp-technique.md`, section 5).
   */
  ringSec: [3, 0.3],
  /**
   * The time constant of the decay after the note end, in seconds: the hand damps the string,
   * and the sound of the harp preset fades.
   */
  dampSec: 0.4,
  /**
   * The time constant in which the triangle of the pluck rounds off to the arc of the first
   * mode, in seconds. The high partials decay first.
   */
  roundSec: 0.12,
  /** The swing of a pluck at the velocity 1, as a share of the swing at the velocity 127. */
  softShare: 0.15,
  /** A swing below this share of the swing of a loudest pluck is still. */
  stillShare: 0.01,
} as const;

/**
 * The plucks of the harp strings of one player (design 5.3). A string has at most one pluck at a
 * time: a new pluck stops the swing of the pluck before it, as the finger stops the string.
 */
export interface StringTrack {
  /**
   * The first pluck of each string in the lists, then the end of the lists. String `i` has the
   * plucks from `first[i]` up to `first[i + 1]`, the end excluded.
   */
  readonly first: Uint32Array;
  /** The note start of each pluck, sorted for each string. */
  readonly starts: Float64Array;
  /** The note end of each pluck. */
  readonly ends: Float64Array;
  /** The swing of each pluck at its start, as a share of the swing of a loudest pluck. */
  readonly levels: Float32Array;
  /** The time constant of the free decay of each string, in seconds. */
  readonly ringSec: Float32Array;
}

/** One pluck of one string, from one or more notes. */
interface Pluck {
  readonly start: number;
  end: number;
  level: number;
}

/**
 * Gives the swing of a pluck at its start from the velocity of its note.
 *
 * @param velocity The MIDI velocity, from 1 to 127.
 * @returns The share of the swing of a loudest pluck.
 */
function levelOf(velocity: number): number {
  const { softShare } = STRING_MOTION;
  const share = Math.min(Math.max((velocity - 1) / 126, 0), 1);
  return softShare + (1 - softShare) * share;
}

/**
 * Builds the pluck track of the harp strings of one player from its notes (design 5.3). Each
 * note plucks the string of its key (`harpString()`) at its pluck time: the note start, or the
 * earlier pluck of its finger in a rolled chord (`notePlucks()`). Two notes of one string that
 * start within `CHORD_SEC` of each other are one pluck, with the larger velocity and the later
 * end.
 *
 * @param notes The notes of the player, sorted by start.
 * @param pluckTimes The pluck time of each note, in the order of `notes`.
 * @returns The track.
 */
export function buildStringTrack(
  notes: readonly PlayerNote[],
  pluckTimes: Float64Array,
): StringTrack {
  const plucks = Array.from({ length: HARP_STRING_COUNT }, (): Pluck[] => []);
  for (const [k, note] of notes.entries()) {
    const own = plucks[harpString(note.pitch)];
    const last = own?.[own.length - 1];
    const level = levelOf(note.velocity);
    if (last && note.startSec - last.start <= CHORD_SEC) {
      last.end = Math.max(last.end, note.endSec);
      last.level = Math.max(last.level, level);
    } else {
      // The plucks of one string stay in order.
      const start = Math.max(pluckTimes[k] ?? note.startSec, last?.start ?? -Infinity);
      own?.push({ start, end: note.endSec, level });
    }
  }

  const count = plucks.reduce((sum, own) => sum + own.length, 0);
  const first = new Uint32Array(HARP_STRING_COUNT + 1);
  const starts = new Float64Array(count);
  const ends = new Float64Array(count);
  const levels = new Float32Array(count);
  let j = 0;
  for (const [i, own] of plucks.entries()) {
    first[i] = j;
    for (const pluck of own) {
      starts[j] = pluck.start;
      ends[j] = pluck.end;
      levels[j] = pluck.level;
      j++;
    }
  }
  first[HARP_STRING_COUNT] = j;

  const [bass, treble] = STRING_MOTION.ringSec;
  const ringSec = Float32Array.from(
    { length: HARP_STRING_COUNT },
    (_, i) => bass * (treble / bass) ** (i / (HARP_STRING_COUNT - 1)),
  );
  return { first, starts, ends, levels, ringSec };
}

/**
 * Finds the last pluck of one string that starts at or before a time.
 *
 * @param starts The note starts of the plucks.
 * @param from The first pluck of the string.
 * @param to The end of the plucks of the string.
 * @param time The time.
 * @returns The index of the pluck, or -1 before the first pluck of the string.
 */
function lastPluck(starts: Float64Array, from: number, to: number, time: number): number {
  let low = from;
  let high = to;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((starts[mid] ?? Infinity) <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low > from ? low - 1 : -1;
}

/**
 * Calculates the swing of each harp string at a song time (design 5.3): a pure function of the
 * track and the time, with no state between frames, so a seek, a pause, and a change of speed
 * give the correct swing. A paused song keeps the swing of its time, as a film camera sees a
 * string that rings. The swing decays with the time constant of its string while the note
 * sounds, and with {@link STRING_MOTION.dampSec} after the note end.
 *
 * @param track The pluck track of the player.
 * @param time The song time of the note layer, in seconds.
 * @param out Two values to write for each string, from the bass string: the swing, as a share of
 *   the swing of a loudest pluck (0 for a still string), and the round share of its form, from 0
 *   (the triangle of the pluck) to 1 (the arc of the first mode). It has
 *   2 × {@link HARP_STRING_COUNT} entries.
 */
export function stringSwingsAt(track: StringTrack, time: number, out: Float32Array): void {
  const { dampSec, roundSec, stillShare } = STRING_MOTION;
  for (let i = 0; i < HARP_STRING_COUNT; i++) {
    const j = lastPluck(track.starts, track.first[i] ?? 0, track.first[i + 1] ?? 0, time);
    const start = track.starts[j];
    const end = track.ends[j];
    const level = track.levels[j];
    const ring = track.ringSec[i] ?? 1;
    let swing = 0;
    let round = 1;
    if (start !== undefined && end !== undefined && level !== undefined) {
      const rang = Math.min(time, end) - start;
      const damped = Math.max(time - end, 0);
      swing = level * Math.exp(-rang / ring - damped / dampSec);
      round = 1 - Math.exp(-(time - start) / roundSec);
    }
    out[2 * i] = swing < stillShare ? 0 : swing;
    out[2 * i + 1] = round;
  }
}
