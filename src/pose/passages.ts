import type { PlayerNote } from '../score/types.ts';
import { groupChords, joinSpans, spanEnvelope } from './note-groups.ts';
import { smoothstep } from '../math.ts';

/** The values of the passages of a player (design 5.1, the beat layer). */
export const PASSAGE_MOTION = {
  /** A rest shorter than this keeps two notes in one passage. */
  joinSec: 0.3,
  /** The sway starts this long before the first note of a passage (design 5.3). */
  leadSec: 0.3,
  /** The sway ends in this time after the last note of a passage. */
  fadeSec: 1,
} as const;

/** The spans in which a player plays, with no long rest, sorted by start. */
export interface Passages {
  readonly starts: Float64Array;
  readonly ends: Float64Array;
  /** The highest loudness of the notes of each passage (design 5.3). */
  readonly loudness: Float32Array;
}

/** The activity of a player at one time. */
interface Activity {
  /** 1 while the player plays, from 0 to 1 at the start and at the end of a passage. */
  readonly weight: number;
  /** The loudness of the passage, from 0 to 1. */
  readonly loudness: number;
}

/**
 * Joins the notes of one player into passages.
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The passages.
 */
export function buildPassages(notes: readonly PlayerNote[], loudness: readonly number[]): Passages {
  const groups = groupChords(notes, loudness);
  const spans = joinSpans(groups, PASSAGE_MOTION.joinSec);
  const peak = (first: number, count: number): number =>
    Math.max(0, ...groups.slice(first, first + count).map((g) => g.loudness));
  return {
    starts: Float64Array.from(spans, (s) => s.start),
    ends: Float64Array.from(spans, (s) => s.end),
    loudness: Float32Array.from(spans, (s) => peak(s.first, s.count)),
  };
}

/**
 * Gives the weight of a passage from its start on: 1 until its end, then a fall to 0.
 *
 * @param time The song time.
 * @param end The end of the passage.
 * @returns The weight, from 0 to 1.
 */
function passageFall(time: number, end: number): number {
  return time <= end ? 1 : smoothstep(1 - (time - end) / PASSAGE_MOTION.fadeSec);
}

/**
 * Gives the activity of a player at a song time.
 *
 * @param passages The passages of the player.
 * @param time The song time of the note layer.
 * @returns The weight and the loudness.
 */
export function activityAt(passages: Passages, time: number): Activity {
  const { index, weight } = spanEnvelope(
    passages.starts,
    passages.ends,
    time,
    PASSAGE_MOTION.leadSec,
    passageFall,
  );
  return { weight, loudness: passages.loudness[index] ?? 0 };
}
