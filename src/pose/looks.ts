import type { PlayerNote } from '../score/types.ts';
import { beatLengthAt } from './count-in.ts';
import { clamp01, smoothstep } from '../math.ts';

/**
 * The planned looks of a player at the conductor, or at the leader of a chamber group (design
 * 5.1). A real player looks up before an entry after a long rest, at a cue, and at the final
 * cut-off. Times are in song seconds.
 */
export const LOOK_PLAN = {
  /** A rest of at least this length before a note gives a look before the entry. */
  restSec: 6,
  /** The head is on the target from this many beats before the entry. */
  entryBeats: 2,
  /** The head leaves the target this many beats before the entry. */
  entryOffBeats: 0.5,
  /** The head stays on the target for at least this time. */
  holdSec: 0.6,
  /** The head stays on the target this long after the landing of a cue. */
  cueHoldSec: 0.3,
  /** The head turns to the target and back in this time. */
  turnSec: 0.5,
  /** Two looks closer than this join into one. */
  joinSec: 1,
} as const;

/**
 * The curve of a turn of the head (design 5.1): it passes its end by about `size`, and settles.
 * A real head passes the end of a fast turn a little.
 */
export const LOOK_OVERSHOOT = {
  /** The part of the turn by which the head passes its end. */
  size: 0.1,
  /** The main turn ends at this part of the time. */
  mainShare: 0.6,
  /** The pass over the end starts at this part of the time. */
  passShare: 0.35,
} as const;

/**
 * Eases a turn of the head past its end (design 5.1): 0 at the start, about 1.1 at 0.68 of the
 * time, and 1 at the end. The turn starts and ends with no speed.
 *
 * @param x The linear progress. Below 0 it gives 0, and above 1 it gives 1.
 * @returns The eased progress.
 */
export function overshoot(x: number): number {
  const o = LOOK_OVERSHOOT;
  const pass = Math.sin(Math.PI * clamp01((x - o.passShare) / (1 - o.passShare)));
  return smoothstep(x / o.mainShare) + o.size * pass * pass;
}

/** The blink at the start of a look (design 5.1). A real blink closes fast and opens slower. */
export const LOOK_BLINK = {
  /** The time from open eyes to closed eyes: 2 frames at 60 fps. */
  closeSec: 2 / 60,
  /** The time from closed eyes to open eyes: 4.5 frames at 60 fps. */
  openSec: 4.5 / 60,
} as const;

/**
 * Gives the closure of the eyes in a blink at the start of a look (design 5.1).
 *
 * @param dt The time since the start of the look, in seconds.
 * @returns 0 for open eyes, 1 for closed eyes.
 */
export function lookBlink(dt: number): number {
  const b = LOOK_BLINK;
  if (dt < 0 || dt > b.closeSec + b.openSec) {
    return 0;
  }
  return dt < b.closeSec ? dt / b.closeSec : 1 - (dt - b.closeSec) / b.openSec;
}

/** The planned look of a player at one song time. */
export interface PlannedLook {
  /** The weight of the look, from about -0.1 to about 1.1 with the pass over the end. */
  weight: number;
  /** The closure of the eyes in the blink at the start of the look. */
  blink: number;
}

/**
 * Plans the looks of one player (design 5.1): a look before each entry after a rest of at least
 * {@link LOOK_PLAN.restSec}, and the extra looks of the score, such as the cues of the conductor
 * and the final chord. Looks that overlap or nearly touch join into one.
 *
 * @param notes The notes of the player, sorted by start.
 * @param beats The times of the conducted beats, sorted.
 * @param extra The other looks, two song times each: the head comes onto the target at the first
 *   and leaves it at the second.
 * @returns Two song times for each look, sorted: the head is on the target between them.
 */
export function planLooks(
  notes: readonly PlayerNote[],
  beats: Float64Array,
  extra: readonly (readonly [number, number])[],
): Float64Array {
  const p = LOOK_PLAN;
  const spans: [number, number][] = extra.map(([on, off]) => [on, Math.max(off, on + p.holdSec)]);
  let end = 0;
  for (const note of notes) {
    if (note.startSec - end >= p.restSec) {
      const beat = beatLengthAt(beats, note.startSec);
      const off = note.startSec - p.entryOffBeats * beat;
      spans.push([Math.min(note.startSec - p.entryBeats * beat, off - p.holdSec), off]);
    }
    end = Math.max(end, note.endSec);
  }
  const sorted = spans.toSorted((a, b) => a[0] - b[0]);
  const joined: number[] = [];
  for (const [on, off] of sorted) {
    const last = joined.length - 1;
    if (joined.length > 0 && on - (joined[last] ?? 0) < p.joinSec + 2 * p.turnSec) {
      joined[last] = Math.max(joined[last] ?? 0, off);
    } else {
      joined.push(on, off);
    }
  }
  return Float64Array.from(joined);
}

/**
 * Gives the planned look of a player at a song time (design 5.1). The head turns to the target in
 * {@link LOOK_PLAN.turnSec} before the look, and back after it, each time a little past its end
 * ({@link overshoot}). A blink starts
 * with the turn to the target.
 *
 * @param looks The looks of the player ({@link planLooks}).
 * @param time The song time of the note layer of the player.
 * @param out The state to write.
 */
export function plannedLookAt(looks: Float64Array, time: number, out: PlannedLook): void {
  const turn = LOOK_PLAN.turnSec;
  out.weight = 0;
  out.blink = 0;
  // The look with the last start at or before the end of its turn back.
  const starts = looks.length;
  if (starts === 0) {
    return;
  }
  let k = 0;
  let lo = 0;
  let hi = starts / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((looks[2 * mid] ?? 0) - turn <= time) {
      k = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const on = looks[2 * k] ?? 0;
  const off = looks[2 * k + 1] ?? 0;
  const start = on - turn;
  if (time < start || time > off + turn) {
    return;
  }
  out.blink = lookBlink(time - start);
  out.weight = time < off ? overshoot((time - start) / turn) : 1 - overshoot((time - off) / turn);
}
