import type { Beat, PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { EXPRESSION_MOTION } from './conductor-expression.ts';
import type { ExpressionTrack } from './conductor-expression.ts';
import { COUNT_IN, inCountIn } from './count-in.ts';
import type { CountIn } from './count-in.ts';
import { gestureSize } from './loudness.ts';
import { smoothstep } from '../math.ts';

/** A point in the beat plane of the conductor: to the right and up, in units of the pattern. */
export type PatternPoint = readonly [x: number, y: number];

/**
 * The point of each beat of a bar in each pattern of design 5.4, as the conductor sees it. Beat 1
 * comes down at (0, 0). Then the baton goes to the left (inward) on beat 2 of four and of six, to
 * the right (outward) on the next beats, and up on the last beat. A bar of a `generic` pattern
 * gives each beat the point (0, 0).
 */
export const BEAT_PATTERNS = {
  1: [[0, 0]],
  2: [
    [0, 0],
    [0.35, 0.15],
  ],
  3: [
    [0, 0],
    [0.6, 0.1],
    [0.3, 0.3],
  ],
  4: [
    [0, 0],
    [-0.5, 0.1],
    [0.6, 0.1],
    [0.3, 0.3],
  ],
  6: [
    [0, 0],
    [-0.25, 0.05],
    [-0.5, 0.1],
    [0.45, 0.05],
    [0.7, 0.1],
    [0.3, 0.3],
  ],
  generic: [[0, 0]],
} as const satisfies Readonly<Record<Beat['pattern'], readonly PatternPoint[]>>;

/** The sizes and the times of the motion of the conductor (design 5.4). */
export const CONDUCTOR_MOTION = {
  /**
   * One unit of a pattern, in meters, at a gesture size of 1. A unit of 0.35 m gives a small
   * motion of the wrist.
   */
  scale: 0.5,
  /**
   * The height of the arc of the baton between two beats, in units of the pattern. The arc to a
   * downbeat is higher, so that each bar starts with a large gesture.
   */
  downbeatArc: 0.5,
  beatArc: 0.3,
  /**
   * In the ready gesture of a count-in, the baton waits this much higher than the point of the
   * last beat of the first bar, in units of the pattern, and above the point of beat 1 (design
   * 5.4). Thus both paws are up at the height of the chin, as in `bear-views.png`. Above the last
   * beat, the right paw of the parametric bear was 0.2 H further out than the left paw, and with
   * 0.4 units, it was 0.17 H higher.
   */
  readyLift: 0.22,
  /**
   * A staccato stroke rebounds to the top of its arc in this part of the beat, stops there, and
   * falls into the next beat from `strokeFall` with its full speed (`strokeOf()`). A legato stroke
   * moves with no stop, as a change of direction with no click (`conductor-technique.md`).
   */
  strokeRebound: 0.3,
  strokeFall: 0.7,
} as const;

/** The baton data that the pose looks up at each frame. */
export interface BatonTrack {
  /** The times of the conducted beats, sorted. */
  readonly beats: Float64Array;
  /** The point of each beat in the beat plane, in meters: two numbers for each beat. */
  readonly points: Float64Array;
  /** The height of the arc of the baton before each beat, in meters. */
  readonly arcs: Float64Array;
  /** The staccato weight of the stroke from each beat to the next: 0 legato, 1 staccato. */
  readonly snaps: Float32Array;
  /** The energy of the stroke from each beat to the next: the loud weight, from 0 to 1. */
  readonly energies: Float32Array;
  /**
   * The point of the baton before the first beat and after the last beat: the point of the last
   * beat of the first bar, in meters.
   */
  readonly rest: PatternPoint;
  /**
   * The point of the baton in the ready gesture of a count-in: above the point of beat 1, and
   * higher than {@link BatonTrack.rest}.
   */
  readonly ready: PatternPoint;
}

/**
 * Gives the loudness of each beat: the highest loudness of the notes that sound in it (design
 * 5.4: the size of the gestures follows the loudness of all notes).
 *
 * @param beats The times of the beats, sorted.
 * @param notes The notes of the score, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @returns The loudness of each beat, from 0 to 1.
 */
function beatLoudness(
  beats: Float64Array,
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
): Float32Array {
  const out = new Float32Array(beats.length);
  for (const [i, note] of notes.entries()) {
    const value = loudness[i] ?? 0;
    // The note sounds in the beat of its start and in each later beat that starts before its end.
    for (let k = Math.max(0, lastAtOrBefore(beats, note.startSec)); k < beats.length; k++) {
      if ((beats[k] ?? Infinity) >= note.endSec) {
        break;
      }
      out[k] = Math.max(out[k] ?? 0, value);
    }
  }
  return out;
}

/**
 * Calculates the baton data of a score (design 5.4). Each beat has the point of its pattern,
 * scaled by the gesture size of the loudness of the beat. A loud passage makes the pattern larger
 * and higher, and a soft passage makes it smaller and lower (`EXPRESSION_MOTION`). Each stroke
 * takes the staccato weight of its beat.
 *
 * @param beats The conducted beats of the score, sorted by time.
 * @param notes The notes of the score, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param expression The expression data of the score, with the same beats.
 * @returns The baton data.
 */
export function buildBatonTrack(
  beats: readonly Beat[],
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
  expression: ExpressionTrack,
): BatonTrack {
  const m = CONDUCTOR_MOTION;
  const e = EXPRESSION_MOTION;
  const times = Float64Array.from(beats, (b) => b.timeSec);
  const loud = beatLoudness(times, notes, loudness);
  const sizes = Array.from(loud, (l, k) => {
    const dynamics =
      1 +
      e.loudSize * (expression.loud[k] ?? 0) -
      e.softSize * (expression.soft[k] ?? 0) +
      e.riseSize * (expression.rise[k] ?? 0);
    return m.scale * gestureSize(l, 1) * dynamics;
  });
  const points = new Float64Array(2 * beats.length);
  const arcs = new Float64Array(beats.length);
  for (const [k, beat] of beats.entries()) {
    const pattern: readonly PatternPoint[] = BEAT_PATTERNS[beat.pattern];
    const [x, y] = pattern[beat.indexInBar % pattern.length] ?? [0, 0];
    const size = sizes[k] ?? 0;
    points[2 * k] = x * size;
    points[2 * k + 1] =
      y * size + e.loudLift * (expression.loud[k] ?? 0) - e.softDrop * (expression.soft[k] ?? 0);
    arcs[k] = (beat.indexInBar === 0 ? m.downbeatArc : m.beatArc) * size;
  }
  const first = beats[0];
  const last: readonly PatternPoint[] = first ? BEAT_PATTERNS[first.pattern] : [[0, 0]];
  const [x, y] = last[(first?.beatsInBar ?? 1) - 1] ?? last.at(-1) ?? [0, 0];
  const size = sizes[0] ?? 0;
  return {
    beats: times,
    points,
    arcs,
    snaps: expression.snap,
    energies: expression.loud,
    rest: [x * size, y * size],
    ready: [0, (y + m.readyLift) * size],
  };
}

/** The point of the tip of the baton in the beat plane at one time, in meters. */
export interface BatonState {
  x: number;
  y: number;
}

/**
 * Gives the part of the path of a stroke at a part of its time (design 5.4). A legato stroke
 * moves at an even pace. A staccato stroke rebounds fast to the top of its arc, stops there, and
 * falls into the next beat with its full speed, as a click of the wrist.
 *
 * @param progress The part of the time of the stroke, from 0 to 1.
 * @param snap The staccato weight: 0 legato, 1 staccato.
 * @param energy The energy of the stroke, from 0 to 1: a loud stroke rebounds sooner and falls
 *   later and faster (`EXPRESSION_MOTION.loudEnergy`).
 * @returns The part of the path, from 0 to 1.
 */
function strokeOf(progress: number, snap: number, energy: number): number {
  const rebound = CONDUCTOR_MOTION.strokeRebound - EXPRESSION_MOTION.loudEnergy * energy;
  const fall = CONDUCTOR_MOTION.strokeFall + EXPRESSION_MOTION.loudEnergy * energy;
  let stopped = 0.5;
  if (progress < rebound) {
    stopped = 0.5 * (1 - (1 - progress / rebound) ** 2);
  } else if (progress > fall) {
    stopped = 0.5 + 0.5 * ((progress - fall) / (1 - fall)) ** 2;
  }
  return progress + (stopped - progress) * snap;
}

/**
 * Writes the point of the baton on its path from one point to the next. The baton leaves a point
 * upward and comes down into the next point, so that each beat is the low point of a bounce.
 *
 * @param out The state to write.
 * @param from The start point.
 * @param to The end point.
 * @param arc The height of the arc.
 * @param progress The part of the time of the path, from 0 to 1.
 * @param snap The staccato weight of the stroke ({@link strokeOf}).
 * @param energy The energy of the stroke ({@link strokeOf}).
 */
function onArc(
  out: BatonState,
  from: PatternPoint,
  to: PatternPoint,
  arc: number,
  progress: number,
  snap = 0,
  energy = 0,
): void {
  const part = strokeOf(Math.min(1, Math.max(0, progress)), snap, energy);
  const along = smoothstep(part);
  out.x = from[0] + (to[0] - from[0]) * along;
  out.y = from[1] + (to[1] - from[1]) * along + arc * Math.sin(Math.PI * part);
}

/**
 * Calculates the point of the tip of the baton at a song time (design 5.4). At each beat time,
 * the tip is at the point of the beat. Between two beats, it rises in an arc and comes down into
 * the next point with its full speed. It comes to the first beat in the time of the first beat:
 * the preparatory beat of the count-in. Before it, it waits at the rest point, raised to the
 * ready point by the weight of the ready gesture. After the last beat, it goes back to the rest
 * point.
 *
 * @param track The baton data.
 * @param time The song time.
 * @param out The state to write.
 * @param ready The weight of the ready gesture of the count-in, from 0 to 1 (`readyAt()`).
 */
export function batonAt(track: BatonTrack, time: number, out: BatonState, ready = 0): void {
  const { beats, points, arcs, rest } = track;
  const k = lastAtOrBefore(beats, time);
  const pointOf = (i: number): PatternPoint => [points[2 * i] ?? 0, points[2 * i + 1] ?? 0];
  const first = beats[0];
  const second = beats[1];
  const lastBeat = beats[beats.length - 1];
  if (first === undefined || lastBeat === undefined) {
    out.x = rest[0];
    out.y = rest[1];
    return;
  }
  if (k < 0) {
    // The preparatory beat: the baton comes to the first beat in the time of the first beat.
    const length = second === undefined ? COUNT_IN.defaultBeatSec : second - first;
    const progress = Math.max(0, 1 - (first - time) / length);
    const from: PatternPoint = [
      rest[0] + (track.ready[0] - rest[0]) * ready,
      rest[1] + (track.ready[1] - rest[1]) * ready,
    ];
    onArc(out, from, pointOf(0), arcs[0] ?? 0, progress);
    return;
  }
  const start = beats[k] ?? first;
  const end = beats[k + 1];
  if (end === undefined) {
    // After the last beat, the baton goes back to the rest point in the time of the beat before.
    const length = k > 0 ? lastBeat - (beats[k - 1] ?? 0) : COUNT_IN.defaultBeatSec;
    const progress = Math.min(1, (time - start) / length);
    onArc(out, pointOf(k), rest, arcs[k] ?? 0, progress);
    return;
  }
  const progress = (time - start) / (end - start);
  const snap = track.snaps[k] ?? 0;
  onArc(out, pointOf(k), pointOf(k + 1), arcs[k + 1] ?? 0, progress, snap, track.energies[k] ?? 0);
}

/**
 * Gives the lift of the tip of the baton in the preparatory beat of a count-in after a pause
 * (design 5.4). The pose holds the baton at its point of the pause point. In the time of the beat,
 * the tip rises in the arc of the next beat and comes down to that point with its full speed at
 * the pause point.
 *
 * @param track The baton data.
 * @param count The count-in of the last play.
 * @param time The song time.
 * @returns The lift in meters, 0 outside such a count-in.
 */
export function resumeLift(track: BatonTrack, count: CountIn, time: number): number {
  if (count.readySec > 0 || !inCountIn(count, time)) {
    return 0;
  }
  const k = lastAtOrBefore(track.beats, count.startSec);
  const arc = track.arcs[k + 1] ?? track.arcs[k] ?? 0;
  return arc * Math.sin(Math.PI * (1 - (count.startSec - time) / count.beatSec));
}
