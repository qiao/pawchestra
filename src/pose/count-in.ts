import { lastAtOrBefore } from './blend.ts';
import { smoothstep } from '../math.ts';

/** The times of the count-in, in song seconds (design 5.2, 5.4). */
export const COUNT_IN = {
  /**
   * The ready pause before the preparatory beat of a play from the song start. The players lift
   * their instruments in it (design 5.2).
   */
  readySec: 1.2,
  /** The ready gesture rises in this time from the start of the count-in. */
  readyRiseSec: 0.2,
  /** After the downbeat, the left hand of the ready gesture comes down in this time. */
  readyFallSec: 0.6,
  /**
   * The conducted beat of a score with fewer than two beats: a quarter note at 120 BPM, the MIDI
   * default (design 5.4).
   */
  defaultBeatSec: 0.5,
  /**
   * The longest preparatory beat. A conductor gives a slow beat in two, so the baton comes down
   * faster than the beat of the music. With the full beat of K. 315 (46 BPM, 1.3 s), the first
   * sound comes 3.1 s after the tap on a phone.
   */
  maxBeatSec: 0.9,
} as const;

/**
 * The count-in of one play (design 5.2, 5.4): the time from the play to the first sound. A play
 * from the song start has a ready pause and one preparatory beat. A play after a pause in the
 * song has only the preparatory beat.
 */
export interface CountIn {
  /** The song time of the first sound: 0 (the downbeat), or the pause point. */
  readonly startSec: number;
  /** The ready pause: {@link COUNT_IN.readySec} from the song start, else 0. */
  readonly readySec: number;
  /** The preparatory beat: the conducted beat at the start point, at most 0.9 s. */
  readonly beatSec: number;
  /** The full count-in: the ready pause plus the preparatory beat. */
  readonly lengthSec: number;
}

/**
 * Gives the length of the conducted beat at a song time: from the last beat at or before it to
 * the next beat. Before the first beat, it is the first beat, and after the last beat, the last
 * beat.
 *
 * @param beats The times of the conducted beats, sorted.
 * @param time The song time.
 * @returns The beat length in song seconds.
 */
export function beatLengthAt(beats: Float64Array, time: number): number {
  const count = beats.length;
  if (count < 2) {
    return COUNT_IN.defaultBeatSec;
  }
  const k = Math.min(Math.max(lastAtOrBefore(beats, time), 0), count - 2);
  return (beats[k + 1] ?? 0) - (beats[k] ?? 0);
}

/**
 * Calculates the count-in of a play from a start point (design 5.2, 5.4). The ready pause and
 * the preparatory beat come only from the song start. The preparatory beat has the length of the
 * conducted beat at the start point, so that the baton comes down to the downbeat at the tempo of
 * the music. A beat longer than {@link COUNT_IN.maxBeatSec} gives a preparatory beat of that
 * length, as a conductor gives a slow beat in two.
 *
 * @param beats The times of the conducted beats, sorted (`PosePlan.beats`).
 * @param startSec The song time of the first sound: 0, or the pause point.
 * @returns The count-in.
 */
export function countInAt(beats: Float64Array, startSec: number): CountIn {
  const readySec = startSec <= 0 ? COUNT_IN.readySec : 0;
  const beatSec = Math.min(COUNT_IN.maxBeatSec, beatLengthAt(beats, startSec));
  return { startSec, readySec, beatSec, lengthSec: readySec + beatSec };
}

/**
 * The count-in of a start point that a seek during play sets (`Transport.seekStart`, design 5.4,
 * 6.5): no count-in. Its start point is before each song time, so no song time is in it, and it
 * gives no ready gesture, no leader nod, and no lift of the baton.
 */
export const NO_COUNT_IN: CountIn = {
  startSec: Number.NEGATIVE_INFINITY,
  readySec: 0,
  beatSec: 0,
  lengthSec: 0,
};

/**
 * Tells if a song time is in a count-in: from its start to the start point.
 *
 * @param count The count-in of the last play.
 * @param time The song time.
 * @returns True in the count-in.
 */
export function inCountIn(count: CountIn, time: number): boolean {
  return time < count.startSec && time >= count.startSec - count.lengthSec;
}

/**
 * Gives the song time that the note layers of the players read (design 5.2). In the count-in of a
 * play after a pause, the players hold their pose at the pause point, because the notes before it
 * do not sound again. From the song start, no note comes before the downbeat, so the players
 * prepare for the first notes as the song time runs.
 *
 * @param count The count-in of the last play.
 * @param time The song time.
 * @returns The song time of the note layers.
 */
export function noteLayerTime(count: CountIn, time: number): number {
  return count.readySec === 0 && inCountIn(count, time) ? count.startSec : time;
}

/**
 * Gives the weight of the ready gesture of the conductor (design 5.4), from 0 to 1. In a count-in
 * from the song start, it rises in 0.2 s from the start of the count-in. The left hand comes down
 * in 0.6 s after the downbeat. A count-in after a pause has no ready gesture.
 *
 * @param count The count-in of the last play.
 * @param time The song time.
 * @returns The weight.
 */
export function readyAt(count: CountIn, time: number): number {
  const c = COUNT_IN;
  if (count.readySec === 0) {
    return 0;
  }
  const from = count.startSec - count.lengthSec;
  if (time < from) {
    return 0;
  }
  if (time < count.startSec) {
    return smoothstep((time - from) / c.readyRiseSec);
  }
  return 1 - smoothstep((time - count.startSec) / c.readyFallSec);
}

/**
 * The count-in of a chamber group, which has no conductor (design 5.4). The leader breathes in on
 * the preparatory beat and nods on the downbeat, as the first violin of a string quartet or a
 * pianist does. The other players see it and start together.
 */
export const LEADER_NOD = {
  /** The lean back of the upper body at the top of the breath, in radians: 4°. */
  breath: (4 * Math.PI) / 180,
  /** The lean forward of the upper body at the downbeat, in radians: 6°. */
  nod: (6 * Math.PI) / 180,
  /** The part of the preparatory beat in which the leader breathes in. Then it nods. */
  breathShare: 0.5,
  /** The time after the downbeat in which the leader comes back up, in song seconds. */
  settleSec: 0.4,
} as const;

/**
 * Gives the lean of the upper body of the leader of a chamber group in a count-in (design 5.4).
 * In the first half of the preparatory beat, the leader leans back with a breath in. In the second
 * half, it leans forward along a quarter cosine, so that the nod comes down with its full speed on
 * the downbeat, as a conductor brings the baton down. It comes back up in 0.4 s after the
 * downbeat. The ready pause of a play from the song start has no nod: the players lift their
 * instruments in it (design 5.2).
 *
 * @param count The count-in of the last play.
 * @param time The song time.
 * @returns The lean in radians: positive leans forward, negative leans back.
 */
export function leaderNodAt(count: CountIn, time: number): number {
  const n = LEADER_NOD;
  const from = count.startSec - count.beatSec;
  if (time < from || time >= count.startSec + n.settleSec) {
    return 0;
  }
  if (time >= count.startSec) {
    return n.nod * (1 - smoothstep((time - count.startSec) / n.settleSec));
  }
  const u = (time - from) / count.beatSec;
  if (u < n.breathShare) {
    return -n.breath * smoothstep(u / n.breathShare);
  }
  const v = (u - n.breathShare) / (1 - n.breathShare);
  return -n.breath + (n.breath + n.nod) * (1 - Math.cos((v * Math.PI) / 2));
}
