import { MathUtils } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { smoothstep } from './rest.ts';

/**
 * The times of a strike of a mallet, a stick, a beater, or a cymbal (design 5.3). The sizes of
 * the lift come from the hold of each instrument.
 */
export const STRIKE_MOTION = {
  /**
   * The shortest lift from rest before a strike, and the longest move to a new target before the
   * note. A lift of this time or more reaches the full height.
   */
  upSec: 0.25,
  /** The lift takes at most this part of the time from the strike before of the same hand. */
  upShare: 0.6,
  /**
   * A lift from rest starts one beat before the note, as a real player brings the mallets up a
   * beat before an entry, but at most this time before it.
   */
  leadSec: 1,
  /** The down stroke of a strike takes at most this time before the note. */
  downSec: 0.125,
  /**
   * A strike within this time of the strike before it of the same hand is a legato stroke: the
   * mallet lifts at once after the strike before, up to the top of this strike, and waits there,
   * as a real player lifts the mallet at once after the attack (design 5.3).
   */
  legatoSec: 0.75,
  /**
   * After a strike, the mallet rebounds to its rest height in this time. A rebound after a small
   * stroke takes more time, so that it starts no faster than the stroke came down.
   */
  reboundSec: 0.1,
  /** The rebound after a small stroke takes at most this time. */
  reboundMaxSec: 0.4,
  /** The rebound takes at most this part of the time to the next strike of the same hand. */
  reboundShare: 0.4,
  /**
   * A strike within this time of the strike before it takes the other hand. A later strike takes
   * the hand on the side of its target (design 5.3).
   */
  alternateSec: 0.5,
  /**
   * In a hold whose hands do not cross, a strike within this time of the strike before it takes
   * the other hand ({@link sideHands}): one hand alone strikes at most 4 times each second.
   */
  sideAlternateSec: 0.25,
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
  /**
   * The slide of a glancing stroke at the strike, as a share of its full slide
   * (`StrikeState.slide`): the hand cymbals meet a little offset, and slide on past each other.
   */
  slideContact: 0.3,
  /** After the rebound, the slide goes back to 0 in this time, in seconds. */
  slideSettleSec: 0.4,
} as const;

/** The sizes of the strike motion of one instrument, in meters. */
export interface StrikeSizes {
  /** The highest lift above the target before a strike, at a gesture size of 1. */
  readonly lift: number;
  /** The height above the target between two strikes. */
  readonly rest: number;
  /**
   * The highest lift of a stroke in a roll of one hand, at a gesture size of 1: a stroke within
   * `1.5 × handRollSec` of the stroke before it. With no value, a roll lifts as other strokes.
   */
  readonly roll?: number;
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

/**
 * Gives the strikes of a player whose hands do not cross to its two hands (design 5.3): each hand
 * strikes only the targets on its side of the middle of the player, as the timpanist with short
 * arms and a kettle on each side. A chord takes both hands. A single target takes the hand on its
 * side. A single target within `alternateSec` of the strike before it takes the other hand, so
 * that a roll and a fast run alternate the hands, as a real timpanist plays single strokes from
 * hand to hand (`docs/reference/percussion-technique.md` 4). A hand that takes a target on the
 * other side strikes its own last target in place of it, and the sound plays the pitch of each
 * note. With one hand alone, a run of 9 notes each second showed 4 strikes each second of one
 * paw, and the other paw did not move.
 *
 * @param groups The strikes of the player, sorted by start.
 * @param own The target of the left and of the right hand before its first strike, or `undefined`
 *   for a hand that takes no target of the other side before its first strike.
 * @param alternateSec The longest time from the strike before in which a single target takes the
 *   other hand, in seconds.
 * @returns The strikes of the left hand and of the right hand, sorted by start.
 */
export function sideHands(
  groups: readonly StrikeGroup[],
  own: readonly [left: StrikeTarget | undefined, right: StrikeTarget | undefined],
  alternateSec: number = STRIKE_MOTION.sideAlternateSec,
): readonly [left: Strike[], right: Strike[]] {
  const left: Strike[] = [];
  const right: Strike[] = [];
  // The last target of each hand.
  let [ownL, ownR] = own;
  let last: 'L' | 'R' | 'both' = 'both';
  let lastStart = -Infinity;
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
    if (sorted.length > 1) {
      left.push(strike(first));
      right.push(strike(end));
      ownL = first;
      ownR = end;
      last = 'both';
    } else {
      const onSide: 'L' | 'R' = first.point[0] < 0 ? 'L' : 'R';
      const other: 'L' | 'R' = last === 'L' ? 'R' : 'L';
      const fast: boolean = last !== 'both' && group.start - lastStart < alternateSec;
      // A fast note goes to the hand that did not strike last: on the target itself when that is
      // on the side of the hand, and else on the last target of the hand.
      const taken: StrikeTarget | undefined =
        fast && other !== onSide ? (other === 'L' ? ownL : ownR) : undefined;
      const side: 'L' | 'R' = taken ? other : onSide;
      (side === 'L' ? left : right).push(strike(taken ?? first));
      if (!taken && side === 'L') {
        ownL = first;
      } else if (!taken) {
        ownR = first;
      }
      last = side;
    }
    lastStart = group.start;
  }
  return [left, right];
}

/**
 * Gives the length of the beat at a song time: the time between the two conducted beats around
 * it, or the last such time after the last beat.
 *
 * @param beats The times of the conducted beats, sorted.
 * @param time The song time.
 * @returns The length of the beat, in seconds, or 0 with fewer than two beats.
 */
export function beatSecAt(beats: Float64Array, time: number): number {
  if (beats.length < 2) {
    return 0;
  }
  const i = Math.min(Math.max(lastAtOrBefore(beats, time), 0), beats.length - 2);
  return (beats[i + 1] ?? 0) - (beats[i] ?? 0);
}

/** The strike data of one hand that the pose looks up at each frame. */
export interface StrikeTrack {
  /** The note start of each strike, sorted. */
  readonly starts: Float64Array;
  /**
   * The start of the lift before each strike. A legato stroke lifts from the strike before
   * (`STRIKE_MOTION.legatoSec`), so its lift starts at that strike.
   */
  readonly upStarts: Float64Array;
  /** The time of the down stroke of each strike, from the top to the target, in seconds. */
  readonly downs: Float64Array;
  /**
   * 1 for a legato stroke, which lifts at once from the strike before, and 0 for a lift from
   * rest.
   */
  readonly legato: Uint8Array;
  /** The end of the rebound after each strike. */
  readonly reboundEnds: Float64Array;
  /** The point and the normal of each target, in the model axes: three numbers for each. */
  readonly points: Float64Array;
  readonly normals: Float64Array;
  /** The top of the lift before each strike, in meters. */
  readonly peaks: Float64Array;
  /** The height above the target between two strikes, in meters. */
  readonly rest: number;
  /** The target before the first strike. */
  readonly first: StrikeTarget;
}

/**
 * Calculates the strike data of one hand (design 5.3). A strike within `legatoSec` of the strike
 * before it is a legato stroke: the mallet lifts at once after the strike before and waits at its
 * top. Another strike lifts from the rest height, one beat before the note, at least 0.25 s and at
 * most 1 s before it, and in at most 0.6 of the time from the strike before. The height of the top
 * follows the gesture size of the note, and a short lift is lower in proportion. The down stroke
 * takes at most 0.125 s, and at most half of the lift. After a strike with no legato stroke after
 * it, the mallet rebounds to its rest height in 0.1 s, and in at most 0.4 of the time to the next
 * strike. A rebound starts no faster than its stroke came down: after a stroke with a top below
 * the rest height, it takes more time, at most 0.4 s. In 0.1 s, the beater of the triangle left a
 * soft stroke four times faster than it came, 32° in one frame.
 *
 * @param strikes The strikes of the hand, sorted by start.
 * @param first The target of the hand before its first strike.
 * @param sizes The sizes of the motion of the instrument.
 * @param amplitude The seeded amplitude of the player.
 * @param beats The times of the conducted beats, sorted. With fewer than two beats, a lift from
 *   rest starts at most 0.25 s before the note.
 * @returns The strike data.
 */
export function buildStrikeTrack(
  strikes: readonly Strike[],
  first: StrikeTarget,
  sizes: StrikeSizes,
  amplitude: number,
  beats: Float64Array,
): StrikeTrack {
  const m = STRIKE_MOTION;
  const gapBefore = (i: number): number => {
    const before = strikes[i - 1];
    const strike = strikes[i];
    return before && strike ? strike.start - before.start : Infinity;
  };
  const legato = strikes.map((_, i) => gapBefore(i) <= m.legatoSec);
  // A lift from rest starts one beat before the note, within its limits.
  const lead = (start: number): number =>
    Math.min(m.leadSec, Math.max(m.upSec, beatSecAt(beats, start)));
  const ups = strikes.map((s, i) =>
    legato[i] ? gapBefore(i) : Math.min(lead(s.start), m.upShare * gapBefore(i)),
  );
  const downs = ups.map((up) => Math.min(m.downSec, up / 2));
  const peaks = strikes.map(
    (s, i) =>
      (gapBefore(i) < 1.5 * m.handRollSec ? (sizes.roll ?? sizes.lift) : sizes.lift) *
      gestureSize(s.loudness, amplitude) *
      Math.min(1, (ups[i] ?? 0) / m.upSec),
  );
  // The down stroke ends with the speed `(π / 2) × top / down`, and a rebound of the time `t`
  // starts with the speed `2 × rest / t`.
  const rebound = (i: number): number => {
    const speed = ((Math.PI / 2) * (peaks[i] ?? 0)) / (downs[i] || 1);
    const slow = speed > 0 ? (2 * sizes.rest) / speed : m.reboundMaxSec;
    return MathUtils.clamp(slow, m.reboundSec, m.reboundMaxSec);
  };
  return {
    starts: Float64Array.from(strikes, (s) => s.start),
    upStarts: Float64Array.from(strikes, (s, i) => s.start - (ups[i] ?? 0)),
    downs: Float64Array.from(downs),
    legato: Uint8Array.from(legato, (l) => (l ? 1 : 0)),
    reboundEnds: Float64Array.from(
      strikes,
      (s, i) => s.start + Math.min(rebound(i), m.reboundShare * gapBefore(i + 1)),
    ),
    points: Float64Array.from(strikes.flatMap((s) => s.point)),
    normals: Float64Array.from(strikes.flatMap((s) => s.normal)),
    peaks: Float64Array.from(peaks),
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
  /**
   * The share of the slide of a glancing stroke along the face of the target, from -1 to 1: it
   * goes to -1 in the lift, comes to `-slideContact` at the strike, and goes on to 1 in the
   * rebound, then back to 0 (`STRIKE_MOTION.slideSettleSec`). Only the hand cymbals read it.
   */
  slide: number;
}

/**
 * Makes a strike state with no motion.
 *
 * @returns The state.
 */
export function createStrikeState(): StrikeState {
  return { point: [0, 0, 0], normal: [0, 1, 0], height: 0, slide: 0 };
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
 * rests above its last target. Before a strike, it moves to the new target and lifts to the top,
 * from the rest height or, in a legato stroke, at once from the strike before. Then it comes down
 * with its full speed and reaches the target at the note start. After a strike with no legato
 * stroke after it, it rebounds to its rest height.
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
    out.slide = 0;
    return;
  }
  out.slide = slideAt(track, i, time);
  if (time < start) {
    // The mallet moves to the new target in the last part of the lift, also in a legato stroke.
    const moveStart = Math.max(upStart, start - STRIKE_MOTION.upSec);
    writeTarget(track, i, smoothstep((time - moveStart) / (start - moveStart)), out);
    const top = track.peaks[i] ?? 0;
    const down = track.downs[i] ?? 0;
    const downStart = start - down;
    if (time >= downStart) {
      // The down stroke ends at the target with its full speed: the mallet strikes at the note
      // start.
      out.height = top * Math.sin((Math.PI / 2) * ((start - time) / (down || 1)));
      return;
    }
    const rise = (time - upStart) / (downStart - upStart || 1);
    // A legato stroke leaves the strike before with its full speed, as a rebound. A lift from
    // rest starts and ends slowly.
    out.height = track.legato[i]
      ? top * Math.sin((Math.PI / 2) * rise)
      : track.rest + (top - track.rest) * smoothstep(rise);
    return;
  }
  writeTarget(track, i, 1, out);
  const rebound = Math.min(1, (time - start) / ((track.reboundEnds[i] ?? start) - start || 1));
  // The rebound starts with its full speed and slows to the rest height.
  out.height = track.rest * rebound * (2 - rebound);
}

/**
 * Gives the slide of a glancing stroke of one strike of a track at a time (`StrikeState.slide`).
 * In the lift, the slide goes from its value at the start of the lift to -1. In the down stroke,
 * it comes to `-slideContact` at the strike, and in the rebound it goes on to 1. Then it goes back
 * to 0 in `slideSettleSec`. A legato stroke lifts from the slide of the strike before.
 *
 * @param track The strike data of the hand.
 * @param i The index of the strike whose lift has started at the time.
 * @param time The song time.
 * @returns The share of the slide.
 */
function slideAt(track: StrikeTrack, i: number, time: number): number {
  const m = STRIKE_MOTION;
  const start = track.starts[i] ?? 0;
  const upStart = track.upStarts[i] ?? 0;
  const after = (k: number, at: number): number => {
    const struck = track.starts[k];
    if (struck === undefined) {
      return 0;
    }
    const rebound = (track.reboundEnds[k] ?? struck) - struck;
    const since = at - struck;
    if (since < rebound) {
      const share = since / (rebound || 1);
      return -m.slideContact + (1 + m.slideContact) * share * (2 - share);
    }
    return 1 - smoothstep((since - rebound) / m.slideSettleSec);
  };
  if (time >= start) {
    return after(i, time);
  }
  const down = track.downs[i] ?? 0;
  const downStart = start - down;
  if (time >= downStart) {
    return -1 + (1 - m.slideContact) * (1 - (start - time) / (down || 1));
  }
  // The lift starts from the slide of the strike before at the start of the lift.
  const from = i > 0 ? after(i - 1, upStart) : 0;
  return from + (-1 - from) * smoothstep((time - upStart) / (downStart - upStart || 1));
}
