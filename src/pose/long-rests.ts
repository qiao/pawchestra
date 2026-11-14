import type { InstrumentId } from '../models/instruments/types.ts';
import type { PlayerNote } from '../score/types.ts';
import { beatLengthAt } from './count-in.ts';
import type { MotionFamily } from './family.ts';
import { easeMove } from './rest.ts';
import type { RestMotion } from './rest.ts';

/** The rules of the long rests ({@link LONG_REST}). */
interface LongRestRules {
  /**
   * A rest of at least this length, in song seconds, lowers the instruments of a family. A family
   * with no entry keeps the playing pose in each rest of the music.
   */
  readonly minSec: Readonly<Partial<Record<MotionFamily, number>>>;
  /** The instrument stays up for this time after the end of the last note, in song seconds. */
  readonly holdSec: number;
  /** The lift ends at least this many conducted beats before the entry. */
  readonly liftEndBeats: number;
  /**
   * The instruments that keep the playing pose in each rest of the music. In a long rest of the
   * viola, the right paw of the cat went 0.1 cm deeper into the viola than in the lowering after a
   * pause. The rest pose of the contrabass puts the left paw of the hippo 4.4 cm into the neck.
   */
  readonly keepUp: ReadonlySet<InstrumentId>;
}

/**
 * The lowering and the lift of the instruments in a long rest of the music (design 5.2). A real
 * wind player lowers the instrument in a rest of many bars, and lifts it one or two beats before
 * the entry (`docs/reference/wind-technique.md`, "Use in the app").
 */
export const LONG_REST: LongRestRules = {
  minSec: { woodwind: 8, brass: 8, bowed: 12 },
  holdSec: 1,
  liftEndBeats: 1,
  keepUp: new Set<InstrumentId>(['viola', 'contrabass']),
};

/**
 * Finds the long rests of one player (design 5.2): each gap of at least `minSec` from the end of
 * all earlier notes to the next note. The time before the first note and after the last note count
 * as rests. The lowering starts after {@link LONG_REST.holdSec} and the seeded delay of the
 * lowering of the player, so that a seat lowers in a ripple. The lift starts so that the principal
 * of a seat lifts first and each lift ends at least one beat before the entry.
 *
 * @param notes The notes of the player, sorted by start.
 * @param beats The times of the conducted beats, sorted.
 * @param endSec The song end. A rest after the last note that ends there lowers the instrument
 *   for good. `Infinity` gives no rest at the end.
 * @param minSec The shortest rest that lowers the instrument, in song seconds.
 * @param motion The seeded rest motion of the player (design 5.2).
 * @returns Four times for each rest: the start and the end of the lowering, and the start and the
 *   end of the lift. A rest at the song start has a lowering at `-Infinity`, and a rest at the song
 *   end a lift at `Infinity`. A player with no notes has no rests, so that a pose sheet with no
 *   notes keeps the playing pose.
 */
export function findLongRests(
  notes: readonly PlayerNote[],
  beats: Float64Array,
  endSec: number,
  minSec: number,
  motion: RestMotion,
): Float64Array {
  const { lift, lower, fitSec } = motion;
  const lowerAt = (end: number): [number, number] => {
    const start = end + LONG_REST.holdSec + lower.delaySec;
    return [start, start + lower.durationSec];
  };
  const liftAt = (entry: number): [number, number] => {
    const start =
      entry - LONG_REST.liftEndBeats * beatLengthAt(beats, entry) - fitSec + lift.delaySec;
    return [start, start + lift.durationSec];
  };
  const first = notes[0];
  if (!first) {
    return new Float64Array();
  }
  const rests: number[] = [];
  if (first.startSec >= minSec) {
    rests.push(-Infinity, -Infinity, ...liftAt(first.startSec));
  }
  let end = first.endSec;
  for (const note of notes) {
    if (note.startSec - end >= minSec) {
      const down = lowerAt(end);
      const up = liftAt(note.startSec);
      if (up[0] > down[1]) {
        rests.push(...down, ...up);
      }
    }
    end = Math.max(end, note.endSec);
  }
  if (endSec - end >= minSec) {
    rests.push(...lowerAt(end), Infinity, Infinity);
  }
  return Float64Array.from(rests);
}

/**
 * Gives the height of the instruments of a player from its long rests at a song time (design
 * 5.2): 0 in the rest pose of a long rest, and 1 in a passage. The moves ease with the seeded skew
 * of the lift and of the lowering of the player. The height is a function of the song time only,
 * so a seek gives the same pose.
 *
 * @param rests The long rests of the player ({@link findLongRests}).
 * @param motion The seeded rest motion of the player.
 * @param time The song time of the note layer of the player.
 * @returns The height, from 0 to 1.
 */
export function longRestHeight(rests: Float64Array, motion: RestMotion, time: number): number {
  for (let k = 0; k + 3 < rests.length; k += 4) {
    const lowerStart = rests[k] ?? 0;
    const lowerEnd = rests[k + 1] ?? 0;
    const liftStart = rests[k + 2] ?? 0;
    const liftEnd = rests[k + 3] ?? 0;
    if (time < lowerStart) {
      return 1;
    }
    if (time < liftEnd) {
      if (time < lowerEnd) {
        return 1 - easeMove((time - lowerStart) / (lowerEnd - lowerStart), motion.lower.skew);
      }
      if (time < liftStart) {
        return 0;
      }
      return easeMove((time - liftStart) / (liftEnd - liftStart), motion.lift.skew);
    }
  }
  return 1;
}
