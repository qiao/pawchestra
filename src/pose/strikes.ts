import type { Vec3 } from '../models/tuples.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { smoothstep } from './rest.ts';

/**
 * The times of a strike of a mallet, a stick, a beater, or a cymbal (design 5.3). The sizes of
 * the lift come from the hold of each instrument.
 */
export const STRIKE_MOTION = {
  /** The lift before a strike starts at most this time before the note. */
  upSec: 0.25,
  /** The lift takes at most this part of the time from the strike before of the same hand. */
  upShare: 0.6,
  /** After a strike, the mallet rebounds to its rest height in at most this time. */
  reboundSec: 0.1,
  /** The rebound takes at most this part of the time to the next strike of the same hand. */
  reboundShare: 0.4,
  /**
   * A strike within this time of the strike before it takes the other hand. A later strike takes
   * the hand on the side of its target (design 5.3).
   */
  alternateSec: 0.5,
  /**
   * The least time between two visible strikes of a roll that alternates the two hands, in
   * seconds: at most 12 strokes each second ({@link thinRolls}).
   */
  rollSec: 1 / 12,
  /**
   * The least time between two visible strikes of a roll in one hand, in seconds: at most 6
   * strokes each second, as one hand of a roll of 32nd notes at 80 beats each minute.
   */
  handRollSec: 1 / 6,
} as const;

/** The sizes of the strike motion of one instrument, in meters. */
export interface StrikeSizes {
  /** The highest lift above the target before a strike, at a gesture size of 1. */
  readonly lift: number;
  /** The height above the target between two strikes. */
  readonly rest: number;
}

/** A place that a mallet strikes, in the model axes. */
export interface StrikeTarget {
  readonly point: Vec3;
  /** The unit direction of the lift: out of the surface that the mallet strikes. */
  readonly normal: Vec3;
}

/** One strike of one hand. */
export interface Strike extends StrikeTarget {
  /** The note start, in song seconds. */
  readonly start: number;
  /** The loudness of the note, from 0 to 1. */
  readonly loudness: number;
}

/** The strikes of a player at one time: a chord gives more than one target. */
export interface StrikeGroup {
  readonly start: number;
  readonly loudness: number;
  /** The targets of the notes, with no two equal targets. */
  readonly targets: readonly StrikeTarget[];
}

/** The rules by which {@link alternateHands} gives the strikes of a player to its two hands. */
interface HandRules {
  /**
   * The longest time from the strike before in which a single target takes the other hand, in
   * seconds. With 0, each single target takes the hand on its side.
   */
  readonly alternateSec: number;
  /**
   * The least distance along x from the last target of the other hand, in meters. With 0, only
   * a target past it stays with the other hand.
   */
  readonly gap: number;
  /**
   * The farthest distance along x by which a fast single target of the other hand can pass the
   * last target of the hand before it, in meters: the hands alternate in a run, as a real player
   * plays a scale with alternate strokes. A target farther past takes the hand before it again, as
   * the double stroke of a real player. With 0, a fast target does not pass the other hand.
   */
  readonly pass: number;
  /** The places of the left and of the right hand along x before their first strikes. */
  readonly places: readonly [left: number, right: number];
  /**
   * The farthest distance on the floor plane from the shoulder joint of a hand to its target, in
   * meters. A farther target goes to the other hand when that hand is nearer to it and does not
   * cross the hand.
   */
  readonly reach: number;
  /** The places (x, z) of the left and of the right shoulder joint on the floor plane. */
  readonly shoulders: readonly [left: readonly [number, number], right: readonly [number, number]];
  /**
   * Gives the move of both shoulder joints along x at the start of a strike, in meters, as the body
   * moves from side to side behind the notes (`PercussionHold.side`). The reach counts from the
   * moved shoulders.
   */
  readonly shift: (start: number) => number;
}

/** The rules of {@link alternateHands} with no hold: no limit of the reach. */
const BASE_RULES: HandRules = {
  alternateSec: STRIKE_MOTION.alternateSec,
  gap: 0,
  pass: 0,
  places: [-Infinity, Infinity],
  reach: Infinity,
  shoulders: [
    [0, 0],
    [0, 0],
  ],
  shift: () => 0,
};

/**
 * Removes strikes from the fast rolls of a player, so that the mallets move at a rate that the eye
 * reads as a roll (design 5.3). A roll is a run of single strikes on one target, each nearer than
 * `least` to the strike before it. The run keeps its first strike and then each `k`-th strike,
 * with the smallest `k` that puts the kept strikes at least `least` apart on average. Thus the
 * kept strikes stay on the note grid and follow the tempo. A kept strike takes the highest
 * loudness of the strikes up to the next kept strike. The sound plays each note.
 *
 * @param groups The strikes of the player, sorted by start.
 * @param least The least time between two kept strikes of a roll, in seconds.
 * @returns The kept strikes, sorted by start.
 */
export function thinRolls(groups: readonly StrikeGroup[], least: number): StrikeGroup[] {
  const same = (a: StrikeGroup | undefined, b: StrikeGroup | undefined): boolean => {
    const p = a?.targets[0]?.point;
    const q = b?.targets[0]?.point;
    return (
      !!p &&
      !!q &&
      a.targets.length === 1 &&
      b.targets.length === 1 &&
      p[0] === q[0] &&
      p[1] === q[1] &&
      p[2] === q[2] &&
      b.start - a.start < least
    );
  };
  const kept: StrikeGroup[] = [];
  for (let i = 0; i < groups.length;) {
    let end = i + 1;
    while (end < groups.length && same(groups[end - 1], groups[end])) {
      end++;
    }
    const first = groups[i];
    const last = groups[end - 1];
    if (!first || !last) {
      break;
    }
    const mean = end - i > 1 ? (last.start - first.start) / (end - i - 1) : least;
    const step = Math.max(1, Math.ceil(least / mean - 1e-9));
    for (let k = i; k < end; k += step) {
      const group = groups[k];
      if (!group) {
        break;
      }
      let loudness = group.loudness;
      for (let j = k + 1; j < Math.min(k + step, end); j++) {
        loudness = Math.max(loudness, groups[j]?.loudness ?? 0);
      }
      kept.push(step === 1 ? group : { ...group, loudness });
    }
    i = end;
  }
  return kept;
}

/**
 * Gives the strikes of a player to its two hands (design 5.3). A chord with two or more targets
 * takes both hands: the left hand strikes the target farthest to the left, and the right hand the
 * target farthest to the right. A single target within 0.5 s of the strike before takes the other
 * hand, so that a roll and a run alternate the hands. A fast target can pass the last target of
 * the other hand by the pass, and a target farther past takes the hand before it again, as a
 * double stroke. A later single target takes the hand on its side, and it does not cross the
 * other hand: a target to the right of the last target of the right hand takes the right hand,
 * and a target to the left of the last target of the left hand takes the left hand. With a gap,
 * a later target nearer than the gap to the last target of the other hand also stays with that
 * hand, so that a mallet does not strike where the other mallet rests. With a
 * reach, a target out of the reach of its hand goes to the other hand, when that hand is nearer
 * and keeps the gap on its side of the last target of the first hand. Thus a run that leaves the
 * reach of one hand goes on in the other hand, and no paw reaches across the body.
 *
 * @param groups The strikes of the player, sorted by start.
 * @param rules The rules that differ from {@link BASE_RULES}.
 * @returns The strikes of the left hand and of the right hand, sorted by start.
 */
export function alternateHands(
  groups: readonly StrikeGroup[],
  rules: Partial<HandRules> = {},
): readonly [left: Strike[], right: Strike[]] {
  const { alternateSec, gap, pass, places, reach, shoulders, shift } = {
    ...BASE_RULES,
    ...rules,
  };
  const [leftShoulder, rightShoulder] = shoulders;
  const left: Strike[] = [];
  const right: Strike[] = [];
  let last: 'L' | 'R' | 'both' = 'both';
  let lastStart = -Infinity;
  // The places of the hands along x: the last targets of the left and of the right hand.
  let [leftX, rightX] = places;
  for (const group of groups) {
    const strike = (target: StrikeTarget): Strike => ({
      ...target,
      start: group.start,
      loudness: group.loudness,
    });
    const sorted = group.targets.toSorted((a, b) => a.point[0] - b.point[0]);
    const first = sorted[0];
    const end = sorted.at(-1);
    if (!first || !end) {
      continue;
    }
    const x = first.point[0];
    if (sorted.length > 1) {
      left.push(strike(first));
      right.push(strike(end));
      last = 'both';
      leftX = x;
      rightX = end.point[0];
    } else {
      const alternate: boolean = last !== 'both' && group.start - lastStart < alternateSec;
      const onSide: 'L' | 'R' = x < 0 ? 'L' : 'R';
      const chosen: 'L' | 'R' = alternate ? (last === 'L' ? 'R' : 'L') : onSide;
      // The distance of the target past the last target of the other hand: below 0 on the side
      // of the hand.
      const past = (hand: 'L' | 'R'): number => (hand === 'L' ? x - rightX : leftX - x);
      // A fast strike can pass the other hand by the pass, and a later strike keeps the gap.
      const crosses: boolean = alternate ? past(chosen) > pass : past(chosen) > -gap;
      let side: 'L' | 'R' = crosses ? (chosen === 'L' ? 'R' : 'L') : chosen;
      const z = first.point[2];
      const moved = shift(group.start);
      const toLeft = Math.hypot(x - leftShoulder[0] - moved, z - leftShoulder[1]);
      const toRight = Math.hypot(x - rightShoulder[0] - moved, z - rightShoulder[1]);
      // The other hand can take a target out of reach, as far past the hand as the rules allow.
      const allowed = alternate ? pass : -gap;
      if (side === 'L' && toLeft > reach && toRight < toLeft && past('R') <= allowed) {
        side = 'R';
      } else if (side === 'R' && toRight > reach && toLeft < toRight && past('L') <= allowed) {
        side = 'L';
      }
      (side === 'L' ? left : right).push(strike(first));
      if (side === 'L') {
        leftX = x;
      } else {
        rightX = x;
      }
      last = side;
    }
    lastStart = group.start;
  }
  return [left, right];
}

/** The strike data of one hand that the pose looks up at each frame. */
export interface StrikeTrack {
  /** The note start of each strike, sorted. */
  readonly starts: Float64Array;
  /** The start of the lift before each strike. */
  readonly upStarts: Float64Array;
  /** The end of the rebound after each strike. */
  readonly reboundEnds: Float64Array;
  /** The point and the normal of each target, in the model axes: three numbers for each. */
  readonly points: Float64Array;
  readonly normals: Float64Array;
  /** The highest lift before each strike, in meters. */
  readonly peaks: Float64Array;
  /** The height above the target between two strikes, in meters. */
  readonly rest: number;
  /** The target before the first strike. */
  readonly first: StrikeTarget;
}

/**
 * Calculates the strike data of one hand (design 5.3). The lift before a strike starts at most
 * 0.25 s before the note, and in at most 0.6 of the time from the strike before. Its height
 * follows the gesture size of the note, and a short lift is lower in proportion. After the strike,
 * the mallet rebounds to its rest height in at most 0.1 s, and in at most 0.4 of the time to the
 * next strike.
 *
 * @param strikes The strikes of the hand, sorted by start.
 * @param first The target of the hand before its first strike.
 * @param sizes The sizes of the motion of the instrument.
 * @param amplitude The seeded amplitude of the player.
 * @returns The strike data.
 */
export function buildStrikeTrack(
  strikes: readonly Strike[],
  first: StrikeTarget,
  sizes: StrikeSizes,
  amplitude: number,
): StrikeTrack {
  const m = STRIKE_MOTION;
  const gapBefore = (i: number): number => {
    const before = strikes[i - 1];
    const strike = strikes[i];
    return before && strike ? strike.start - before.start : Infinity;
  };
  const ups = strikes.map((_, i) => Math.min(m.upSec, m.upShare * gapBefore(i)));
  return {
    starts: Float64Array.from(strikes, (s) => s.start),
    upStarts: Float64Array.from(strikes, (s, i) => s.start - (ups[i] ?? 0)),
    reboundEnds: Float64Array.from(
      strikes,
      (s, i) => s.start + Math.min(m.reboundSec, m.reboundShare * gapBefore(i + 1)),
    ),
    points: Float64Array.from(strikes.flatMap((s) => s.point)),
    normals: Float64Array.from(strikes.flatMap((s) => s.normal)),
    peaks: Float64Array.from(
      strikes,
      (s, i) => sizes.lift * gestureSize(s.loudness, amplitude) * ((ups[i] ?? 0) / m.upSec),
    ),
    rest: sizes.rest,
    first,
  };
}

/** The motion of one hand at one time. The pose reads it. */
export interface StrikeState {
  /** The target of the mallet, in the model axes. */
  readonly point: [number, number, number];
  /** The unit direction of the lift. */
  readonly normal: [number, number, number];
  /** The height of the mallet head above the target, along the normal, in meters. */
  height: number;
}

/**
 * Makes a strike state with no motion.
 *
 * @returns The state.
 */
export function createStrikeState(): StrikeState {
  return { point: [0, 0, 0], normal: [0, 1, 0], height: 0 };
}

/**
 * Reads one point of a flat list of points.
 *
 * @param list Three numbers for each point.
 * @param i The index of the point, or -1 for the fallback.
 * @param fallback The point for the index -1.
 * @returns The point.
 */
function pointAt(list: Float64Array, i: number, fallback: Vec3): Vec3 {
  return i < 0 ? fallback : [list[3 * i] ?? 0, list[3 * i + 1] ?? 0, list[3 * i + 2] ?? 0];
}

/**
 * Writes a target of a track into a state, mixed with the target before it.
 *
 * @param track The strike data.
 * @param i The index of the target, or -1 for the first target.
 * @param t The weight of the target `i` against the target `i - 1`, from 0 to 1.
 * @param out The state to write.
 */
function writeTarget(track: StrikeTrack, i: number, t: number, out: StrikeState): void {
  const { points, normals, first } = track;
  const [px, py, pz] = pointAt(points, i, first.point);
  const [nx, ny, nz] = pointAt(normals, i, first.normal);
  const [bx, by, bz] = pointAt(points, Math.max(i - 1, -1), first.point);
  const [mx, my, mz] = pointAt(normals, Math.max(i - 1, -1), first.normal);
  out.point[0] = bx + (px - bx) * t;
  out.point[1] = by + (py - by) * t;
  out.point[2] = bz + (pz - bz) * t;
  const x = mx + (nx - mx) * t;
  const y = my + (ny - my) * t;
  const z = mz + (nz - mz) * t;
  const length = Math.hypot(x, y, z) || 1;
  out.normal[0] = x / length;
  out.normal[1] = y / length;
  out.normal[2] = z / length;
}

/**
 * Calculates the motion of one hand at a song time (design 5.3). Between two strikes, the mallet
 * rests above its last target. Before a strike, it moves to the new target, lifts, and comes down
 * with its full speed: it reaches the target at the note start. Then it rebounds to its rest
 * height.
 *
 * @param track The strike data of the hand.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function strikeStateAt(track: StrikeTrack, time: number, out: StrikeState): void {
  const i = lastAtOrBefore(track.upStarts, time);
  const start = track.starts[i];
  const upStart = track.upStarts[i];
  if (start === undefined || upStart === undefined) {
    writeTarget(track, -1, 1, out);
    out.height = track.rest;
    return;
  }
  if (time < start) {
    const progress = (time - upStart) / (start - upStart);
    writeTarget(track, i, smoothstep(progress), out);
    // The lift ends at the target with its full speed: the mallet strikes at the note start.
    const peak = track.peaks[i] ?? 0;
    out.height = track.rest * (1 - progress) + peak * Math.sin(Math.PI * progress);
    return;
  }
  writeTarget(track, i, 1, out);
  const rebound = Math.min(1, (time - start) / ((track.reboundEnds[i] ?? start) - start || 1));
  // The rebound starts with its full speed and slows to the rest height.
  out.height = track.rest * rebound * (2 - rebound);
}
