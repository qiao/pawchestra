import { HARP_PEDALS, harpString } from '../models/instruments/harp.ts';
import type { HarpPedal } from '../models/instruments/harp.ts';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { smoothstep } from './rest.ts';

/**
 * The times of the pedal moves of a harpist, in seconds (design 5.3,
 * `docs/reference/harp-technique.md` section 7.7). No source gives the times of one move.
 */
const PEDAL_MOTION = {
  /** The time in which the foot moves a pedal into its new notch. */
  pressSec: 0.15,
  /** The time in which the foot goes from its rest to the pedal. */
  reachSec: 0.25,
  /** The time that the foot stays on the pedal after the notch. */
  holdSec: 0.05,
  /** The time in which the foot goes back to its rest. */
  returnSec: 0.3,
  /**
   * The least time between two pedal changes of one foot: a harpist moves 1 to 2 pedals each
   * second, and two pedals of one foot at the same time are difficult (section 7.7).
   */
  footGapSec: 0.5,
  /**
   * A pedal changes at the earliest this long after the last pluck of a string of its old notch,
   * so that the pluck sounds in the old notch.
   */
  afterSec: 0.1,
} as const;

/** The foot of each pedal: the left foot moves D, C, and B, and the right foot E, F, G, and A. */
const PEDAL_FEET: Readonly<Record<HarpPedal, 'L' | 'R'>> = {
  D: 'L',
  C: 'L',
  B: 'L',
  E: 'R',
  F: 'R',
  G: 'R',
  A: 'R',
};

/** The note names of the strings in an octave from C. */
const STRING_NAMES: readonly HarpPedal[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** The black keys in an octave from C: the app plays each as the sharp of the natural below. */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** The pedal and the notch that a note needs. */
interface PedalNeed {
  /** The index of the pedal in `HARP_PEDALS.order`. */
  readonly pedal: number;
  /** The notch: 0 for natural and 1 for sharp. */
  readonly notch: number;
}

/**
 * Gives the pedal and the notch that a MIDI key needs (section 7.7). The app spells each black key
 * as the sharp of the natural below it, as `harpString()` gives it the string of that natural.
 *
 * @param key The MIDI key.
 * @returns The index of the pedal in `HARP_PEDALS.order`, and the notch: 0 for natural and 1 for
 *   sharp.
 */
function pedalOf(key: number): PedalNeed {
  const name = STRING_NAMES[harpString(key) % 7] ?? 'C';
  const pedal = HARP_PEDALS.order.indexOf(name);
  return { pedal, notch: BLACK_KEYS.has(((Math.round(key) % 12) + 12) % 12) ? 1 : 0 };
}

/**
 * The pedal changes of a harp player (design 5.3): the notch of each pedal at the start, and each
 * change, sorted by its time. A notch is -1 for flat, 0 for natural, and 1 for sharp.
 */
export interface PedalPlan {
  /** The notch of each pedal before the first note, in the order of `HARP_PEDALS.order`. */
  readonly start: Int8Array;
  /** The time at which each change puts its pedal into the new notch, in song seconds, sorted. */
  readonly times: Float64Array;
  /** The pedal of each change, as an index of `HARP_PEDALS.order`. */
  readonly pedals: Uint8Array;
  /** The notch before and after each change. */
  readonly from: Int8Array;
  readonly to: Int8Array;
  /** The foot of each change: 0 for the left foot, 1 for the right foot. */
  readonly feet: Uint8Array;
  /** The number of changes with less time than {@link PEDAL_MOTION.footGapSec} after the change before of the foot. */
  readonly rushed: number;
}

/** One pedal change before the plan gives it a time. */
interface ChangeDraft {
  readonly pedal: number;
  readonly from: number;
  readonly to: number;
  /** The earliest and the latest time of the change. */
  readonly earliest: number;
  readonly latest: number;
}

/**
 * Plans the pedal changes of a harp player from its notes (design 5.3, section 7.7): a pure
 * function of the notes. Each pedal starts in the notch of its first note. When a note needs
 * another notch, its pedal changes as early as the music lets it: after the last pluck in the old
 * notch, in the time of its foot. The changes of one foot keep
 * {@link PEDAL_MOTION.footGapSec} apart when the music lets them. A change with less time comes
 * at its latest time, just before its note.
 *
 * @param notes The notes of the player, sorted by start.
 * @param plucks The pluck time of each note (`notePlucks()`).
 * @returns The plan.
 */
export function planPedals(notes: readonly PlayerNote[], plucks: Float64Array): PedalPlan {
  const m = PEDAL_MOTION;
  const count = HARP_PEDALS.order.length;
  const start = new Int8Array(count);
  const seen = new Uint8Array(count);
  const notch = new Int8Array(count);
  const lastPluck = new Float64Array(count).fill(-Infinity);
  const drafts: ChangeDraft[] = [];
  for (const [k, note] of notes.entries()) {
    const time = plucks[k] ?? note.startSec;
    const need = pedalOf(note.pitch);
    if (!seen[need.pedal]) {
      seen[need.pedal] = 1;
      start[need.pedal] = need.notch;
      notch[need.pedal] = need.notch;
    } else if (notch[need.pedal] !== need.notch) {
      drafts.push({
        pedal: need.pedal,
        from: notch[need.pedal] ?? 0,
        to: need.notch,
        earliest: (lastPluck[need.pedal] ?? -Infinity) + m.afterSec,
        latest: time - m.holdSec,
      });
      notch[need.pedal] = need.notch;
    }
    lastPluck[need.pedal] = Math.max(lastPluck[need.pedal] ?? -Infinity, time);
  }

  // Each foot takes its changes in the order of their latest times, each as early as it can.
  const timed: (ChangeDraft & { readonly time: number; readonly foot: number })[] = [];
  let rushed = 0;
  for (const foot of ['L', 'R'] as const) {
    let last = -Infinity;
    const own = drafts
      .filter((d) => PEDAL_FEET[HARP_PEDALS.order[d.pedal] ?? 'C'] === foot)
      .toSorted((a, b) => a.latest - b.latest);
    for (const draft of own) {
      let time = Math.max(draft.earliest, last + m.footGapSec);
      if (time > draft.latest) {
        time = Math.max(draft.latest, last);
        rushed += 1;
      }
      timed.push({ ...draft, time, foot: foot === 'L' ? 0 : 1 });
      last = time;
    }
  }
  const sorted = timed.toSorted((a, b) => a.time - b.time);
  return {
    start,
    times: Float64Array.from(sorted, (c) => c.time),
    pedals: Uint8Array.from(sorted, (c) => c.pedal),
    from: Int8Array.from(sorted, (c) => c.from),
    to: Int8Array.from(sorted, (c) => c.to),
    feet: Uint8Array.from(sorted, (c) => c.foot),
    rushed,
  };
}

/**
 * Calculates the notch of each pedal at a song time (design 5.3): a pure function of the plan and
 * the time. A pedal moves from its old notch to its new notch in {@link PEDAL_MOTION.pressSec}
 * before the time of its change.
 *
 * @param plan The pedal plan.
 * @param time The song time of the note layer.
 * @param out The notch of each pedal to write, from -1 (flat) over 0 (natural) to 1 (sharp), in
 *   the order of `HARP_PEDALS.order`.
 */
export function pedalNotchesAt(plan: PedalPlan, time: number, out: Float32Array): void {
  for (let p = 0; p < out.length; p++) {
    out[p] = plan.start[p] ?? 0;
  }
  const last = lastAtOrBefore(plan.times, time + PEDAL_MOTION.pressSec);
  for (let j = 0; j <= last; j++) {
    const p = plan.pedals[j] ?? 0;
    const from = plan.from[j] ?? 0;
    const to = plan.to[j] ?? 0;
    const share = smoothstep((time - (plan.times[j] ?? 0)) / PEDAL_MOTION.pressSec + 1);
    out[p] = from + (to - from) * share;
  }
}

/** The motion of one foot of a harpist at one time. */
interface FootState {
  /**
   * The pedal under the foot, as an index of `HARP_PEDALS.order`, or -1 for a foot at rest. In a
   * move from one pedal to another, the pedal of the next change.
   */
  pedal: number;
  /** The pedal that the foot comes from in a move between two pedals, or -1 from the rest. */
  fromPedal: number;
  /** The share of the way from the place before ({@link FootState.fromPedal}, or the rest) to the pedal, from 0 to 1. */
  share: number;
  /** The share of the foot that is still at the place before, at the start of the move. */
  fromShare: number;
  /** The lift of the foot over the pedal, from 0 (on the pedal) to 1 (the full lift of a move). */
  lift: number;
}

/**
 * Makes a foot state at rest.
 *
 * @returns The state.
 */
export function createFootState(): FootState {
  return { pedal: -1, fromPedal: -1, share: 0, fromShare: 0, lift: 0 };
}

/**
 * Gives the share of the foot on the pedal of one change at a time: it goes to the pedal in
 * {@link PEDAL_MOTION.reachSec} before the press, presses, stays, and goes back to the rest.
 *
 * @param change The time of the change.
 * @param time The song time.
 * @returns The share, from 0 (at the rest) to 1 (on the pedal).
 */
function onPedal(change: number, time: number): number {
  const m = PEDAL_MOTION;
  const arrive = smoothstep((time - (change - m.pressSec - m.reachSec)) / m.reachSec);
  const leave = smoothstep((time - (change + m.holdSec)) / m.returnSec);
  return arrive * (1 - leave);
}

/**
 * Calculates the motion of one foot of a harpist at a song time (design 5.3): a pure function of
 * the plan and the time. For each change of the pedals of the foot, the foot goes from its rest
 * to the pedal, lifted, comes down on the pedal, moves it into the new notch, and goes back to its
 * rest. When the next change of the foot comes before the foot is back, the foot goes from the
 * pedal before to the next pedal.
 *
 * @param plan The pedal plan.
 * @param foot The foot: 0 for the left foot, 1 for the right foot.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function footStateAt(plan: PedalPlan, foot: number, time: number, out: FootState): void {
  const m = PEDAL_MOTION;
  const lead = m.pressSec + m.reachSec;
  out.pedal = -1;
  out.fromPedal = -1;
  out.share = 0;
  out.fromShare = 0;
  out.lift = 0;
  // The last change of the foot whose move has started, and the change before it.
  let now = -1;
  let before = -1;
  for (let j = lastAtOrBefore(plan.times, time + lead); j >= 0; j--) {
    if (plan.feet[j] !== foot) {
      continue;
    }
    if (now < 0) {
      now = j;
    } else {
      before = j;
      break;
    }
    if ((plan.times[j] ?? 0) + m.holdSec + m.returnSec < time - lead) {
      break;
    }
  }
  if (now < 0) {
    return;
  }
  const change = plan.times[now] ?? 0;
  out.pedal = plan.pedals[now] ?? 0;
  out.share = onPedal(change, time);
  // The foot comes from the pedal before when it was not back at the rest at the move start. It
  // goes back to its rest after the hold, so the pedal before counts only until then: the share
  // on the pedal is 1 at that time, so the foot does not jump. With the pedal before in the return
  // too, the right hoof went back to that pedal at the height of a press, 2.4 cm through the
  // corner of the base, and jumped 15 cm to the rest at the start of its next move (117.1 s to
  // 117.6 s of `boulanger-matin`).
  if (before >= 0 && time < change + m.holdSec) {
    const stay = onPedal(plan.times[before] ?? 0, change - lead);
    if (stay > 0) {
      out.fromPedal = plan.pedals[before] ?? 0;
      out.fromShare = stay;
    }
  }
  // The foot lifts in its move to the pedal, and comes down on it before the press.
  const toward = (time - (change - lead)) / m.reachSec;
  out.lift = toward < 1 ? Math.sin(Math.PI * Math.min(Math.max(toward, 0), 1)) : 0;
}
