import { lastAtOrBefore } from './blend.ts';
import { smoothstep } from '../math.ts';

/**
 * The timing of a move of a hand after a strike (design 5.3): a damp, in which the hand stops the
 * sound of the instrument, or the follow move of the crash cymbals, in which the plates turn out to
 * let the sound ring. The hand moves to the place of the move, stays there, and goes back.
 */
export const DAMP_MOTION = {
  /** The move of a hand to the place of a damp takes this time, and ends at the contact. */
  inSec: 0.12,
  /** The shortest move to the place, when the strike before is near (`DampWish.minInSec`). */
  minInSec: 0.06,
  /** The shortest time at the place. A shorter window has no move. */
  minHoldSec: 0.08,
  /** The move of a hand back from the place of a damp takes this time. */
  outSec: 0.15,
} as const;

/** A wanted move of a hand after a strike. */
export interface DampWish {
  /** The time at which the hand reaches the place: the note end for a damp, in seconds. */
  readonly contact: number;
  /** The earliest start of the move: the end of the rebound of the strike. */
  readonly earliest: number;
  /** The latest end of the move back: the start of the next lift of the hand. */
  readonly latest: number;
  /** The longest time at the place, in seconds. */
  readonly hold: number;
  /** The time of the move to the place and of the move back, in seconds. */
  readonly inSec: number;
  readonly outSec: number;
  /**
   * The shortest move to the place, in seconds, when the strike before is near. A long move takes
   * more time, so that the hand moves no faster than a real player's hand.
   */
  readonly minInSec: number;
  /** A number that the pose reads for the move, such as the kettle of a damp. */
  readonly key: number;
}

/** The moves of one hand after its strikes, that the pose looks up at each frame. */
export interface DampTrack {
  /** The start of the move of each window, sorted. */
  readonly starts: Float64Array;
  /** The time of the contact, the start of the move back, and its end, of each window. */
  readonly contacts: Float64Array;
  readonly releases: Float64Array;
  readonly ends: Float64Array;
  /** The key of each window ({@link DampWish.key}). */
  readonly keys: Float64Array;
}

/**
 * Makes the windows of the moves of one hand after its strikes (design 5.3). A move starts at most
 * its `inSec` before its contact and not before the end of the rebound, and reaches the place at
 * least its `minInSec` after its start. It stays at the place for at most its hold, and goes back in
 * its `outSec`, so that it ends before the next lift of the hand. A window with less than
 * `minHoldSec` at the place, or one that starts before the end of the window before it, has no
 * move.
 *
 * @param wishes The wanted moves, sorted by contact.
 * @returns The windows.
 */
export function dampTrack(wishes: readonly DampWish[]): DampTrack {
  const m = DAMP_MOTION;
  const rows: [number, number, number, number, number][] = [];
  let free = -Infinity;
  for (const wish of wishes) {
    const start = Math.max(wish.earliest, free, wish.contact - wish.inSec);
    const contact = Math.max(wish.contact, start + wish.minInSec);
    const end = Math.min(wish.latest, contact + wish.hold + wish.outSec);
    const release = end - wish.outSec;
    if (release - contact < m.minHoldSec) {
      continue;
    }
    rows.push([start, contact, release, end, wish.key]);
    free = end;
  }
  return {
    starts: Float64Array.from(rows, (r) => r[0]),
    contacts: Float64Array.from(rows, (r) => r[1]),
    releases: Float64Array.from(rows, (r) => r[2]),
    ends: Float64Array.from(rows, (r) => r[3]),
    keys: Float64Array.from(rows, (r) => r[4]),
  };
}

/** The move of a hand after a strike at one time. */
export interface DampState {
  /** The weight of the place of the move, from 0 to 1. */
  weight: number;
  /** The key of the window, or -1 with no window. */
  key: number;
}

/**
 * Makes a state with no move.
 *
 * @returns The state.
 */
export function createDampState(): DampState {
  return { weight: 0, key: -1 };
}

/**
 * Calculates the move of a hand after a strike at a song time (design 5.3): the weight rises
 * smoothly to the contact, stays 1 at the place, and falls smoothly to the end of the window.
 *
 * @param track The windows of the hand, or `null` for a hand with no moves.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function dampStateAt(track: DampTrack | null, time: number, out: DampState): void {
  out.weight = 0;
  out.key = -1;
  if (!track) {
    return;
  }
  const i = lastAtOrBefore(track.starts, time);
  const start = track.starts[i];
  const contact = track.contacts[i] ?? 0;
  const release = track.releases[i] ?? 0;
  const end = track.ends[i] ?? 0;
  if (start === undefined || time >= end) {
    return;
  }
  out.key = track.keys[i] ?? -1;
  if (time < contact) {
    out.weight = smoothstep((time - start) / (contact - start));
  } else if (time < release) {
    out.weight = 1;
  } else {
    out.weight = 1 - smoothstep((time - release) / (end - release));
  }
}
