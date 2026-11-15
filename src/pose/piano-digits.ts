import { MathUtils } from 'three';

import type { HandNote } from './hand-notes.ts';
import type { PianoFingering } from './piano-fingering.ts';
import { smoothstep } from '../math.ts';

/** The number of claws of a paw: the digits 1 (the thumb side) to 5. */
const DIGIT_COUNT = 5;

/**
 * The motion of the claws of a piano paw (design 5.3, `docs/reference/piano-technique.md` 9.3). A
 * bend turns a claw around the curl axis of its paw, after the curl of the fingers: + down toward
 * the key, - up. The claw is short (about 3 cm in the app), so the angles stay moderate.
 */
const DIGIT_MOTION = {
  /** The bend of a claw on a key at the key bed. */
  press: 20 * MathUtils.DEG2RAD,
  /**
   * The share of the press of a claw, from the rest bend, that each claw next to it follows. Little
   * of the motion of a striking finger goes into its neighbors [38], so the share is small: about
   * 4° at the full press. A claw does not bend past the press by the spill.
   */
  spill: 0.15,
  /** The bend of a claw that plays no note: a little up, so that the pressing claw shows. */
  rest: -4 * MathUtils.DEG2RAD,
  /**
   * The bend of each claw in the rest pose, when the paw lies on the belly: up, so that the claw
   * tips stay out of the round belly. With no bend, they go 0.9 cm into the belly, with -10° 0.4
   * cm, and with -18° 0.5 cm (`pnpm pose-depth pianist`).
   */
  lap: -10 * MathUtils.DEG2RAD,
  /**
   * The weight of the playing pose at which the lap bend is gone. The paw leaves the belly early
   * in the lift. With a lap bend over the whole lift, the claw tips went 1.7 cm into the front of
   * the case in the lowering onto the keys, and with no lap bend 1.1 cm. With 0.25, they go 1.2 cm
   * into the case and 0.4 cm into the belly (`pnpm pose-depth pianist`).
   */
  lapFade: 0.25,
  /**
   * The lift of each claw before its strike at a slow tempo, from the thumb side: the thumb lifts
   * highest (26.1 mm) and the ring finger lowest (21.7 mm) [39].
   */
  lift: [14, 12.5, 12.5, 11.6, 12.3].map((deg) => deg * MathUtils.DEG2RAD),
  /** The share that the lift grows from 2 notes/s up to {@link DIGIT_MOTION.fastRate} [39]. */
  liftGrowth: 0.3,
  /** The rate of the notes of a hand, in notes/s, at and above which the overlap starts [40]. */
  fastRate: 8,
  /** The time of the drop from the lift to the key bed at a slow tempo, in seconds. */
  dropSec: 0.08,
  /**
   * The share of the time from the note before at which a fast drop starts: above 1, the claw
   * starts down before the key of the note before reaches the key bed [40].
   */
  fastDrop: 1.2,
  /** The time of the lift before the drop, in seconds. */
  liftSec: 0.12,
  /**
   * The time from the end of the last press of a claw to its next drop below which the claw does
   * not lift: it stays on the keys, as a fast repeat of one finger does.
   */
  stayDownSec: 0.03,
  /**
   * The largest mean speed of a drop, in radians per second. The eased drop is about 1.5 times
   * faster at its middle, so a claw turns less than about 1,000° per second. A short drop takes
   * a smaller lift.
   */
  dropSpeed: 650 * MathUtils.DEG2RAD,
  /**
   * The time in which a claw comes back to the rest bend after the note end, in seconds: the
   * release of a key (`KEY_MOTION.releaseSec` of `pose/piano-keys.ts`).
   */
  releaseSec: 0.06,
} as const;

/** The presses of one claw, sorted by the start of the drop. */
interface DigitPresses {
  /** The time at which the claw starts down from its lift. */
  readonly downs: Float64Array;
  /** The note start: the claw is at the key bed. */
  readonly starts: Float64Array;
  /** The note end: the claw comes up. */
  readonly ends: Float64Array;
  /** The bend at the start of the drop, in radians: the lift, or less after a short gap. */
  readonly froms: Float64Array;
}

/** The presses of the five claws of one paw (design 5.3). */
export interface DigitTrack {
  readonly digits: readonly DigitPresses[];
}

/**
 * Builds the presses of each claw of a piano paw from its fingering (design 5.3): each key of a
 * hand note is a press of the claw of its finger. The drop takes {@link DIGIT_MOTION.dropSec}, or
 * a share of the time from the note before at {@link DIGIT_MOTION.fastRate} notes/s and faster,
 * so that the claw starts down before the last key reaches the key bed. The lift grows with the
 * rate of the notes.
 *
 * @param notes The notes of the hand, sorted by start.
 * @param fingering The fingering of the hand.
 * @returns The track.
 */
export function buildDigitTrack(notes: readonly HandNote[], fingering: PianoFingering): DigitTrack {
  const m = DIGIT_MOTION;
  const rows: [number, number, number, number][][] = Array.from({ length: DIGIT_COUNT }, () => []);
  let before = Number.NEGATIVE_INFINITY;
  for (const [i, note] of notes.entries()) {
    const from = fingering.first[i] ?? 0;
    const to = fingering.first[i + 1] ?? from;
    if (to === from) {
      continue;
    }
    const gap = note.start - before;
    before = note.start;
    const rate = gap > 0 ? 1 / gap : 0;
    const growth = 1 + m.liftGrowth * MathUtils.clamp((rate - 2) / (m.fastRate - 2), 0, 1);
    const drop = rate >= m.fastRate ? m.fastDrop * gap : Math.min(m.dropSec, gap);
    for (let j = from; j < to; j++) {
      const finger = MathUtils.clamp(fingering.fingers[j] ?? 3, 1, DIGIT_COUNT) - 1;
      const lift = Math.min(
        (m.lift[finger] ?? 0) * growth,
        Math.max(0, drop * m.dropSpeed - m.press),
      );
      rows[finger]?.push([note.start - drop, note.start, Math.max(note.end, note.start), lift]);
    }
  }
  return {
    digits: rows.map((presses) => {
      presses.sort((a, b) => a[0] - b[0]);
      // After a short gap, the claw lifts less, and after no gap, it stays down.
      const froms = Float64Array.from(presses, (p, k) => {
        const gap = p[0] - (presses[k - 1]?.[2] ?? Number.NEGATIVE_INFINITY);
        const share = MathUtils.clamp((gap - m.stayDownSec) / (m.liftSec - m.stayDownSec), 0, 1);
        return m.press + (-p[3] - m.press) * share;
      });
      return {
        downs: Float64Array.from(presses, (p) => p[0]),
        starts: Float64Array.from(presses, (p) => p[1]),
        ends: Float64Array.from(presses, (p) => p[2]),
        froms,
      };
    }),
  };
}

/**
 * Gives the eased share of the way from one time to another, from 0 to 1.
 *
 * @param from The start time.
 * @param to The end time.
 * @param time The time.
 * @returns The share.
 */
function ramp(from: number, to: number, time: number): number {
  return to > from ? smoothstep((time - from) / (to - from)) : 1;
}

/**
 * Gives the index of the last press whose drop starts at or before a time, or -1.
 *
 * @param downs The starts of the drops, sorted.
 * @param time The time.
 * @returns The index.
 */
function lastDown(downs: Float64Array, time: number): number {
  let lo = 0;
  let hi = downs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((downs[mid] ?? 0) <= time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

/**
 * Gives the bend of one claw at a song time (design 5.3). The claw drops from its lift to the key
 * bed at the note start and stays down until the note end, then comes back to the rest bend. Before
 * its next press, it lifts over {@link DIGIT_MOTION.liftSec}, but not before the end of its last
 * press. A claw with no press near the time keeps the rest bend.
 *
 * @param presses The presses of the claw.
 * @param time The song time.
 * @returns The bend, in radians.
 */
function digitBendAt(presses: DigitPresses, time: number): number {
  const m = DIGIT_MOTION;
  const i = lastDown(presses.downs, time);
  let bend: number = m.rest;
  let end = Number.NEGATIVE_INFINITY;
  if (i >= 0) {
    const down = presses.downs[i] ?? 0;
    const start = presses.starts[i] ?? 0;
    end = presses.ends[i] ?? 0;
    const lift = presses.froms[i] ?? m.rest;
    if (time < start) {
      bend = lift + (m.press - lift) * ramp(down, start, time);
    } else if (time <= end) {
      bend = m.press;
    } else {
      bend = m.press + (m.rest - m.press) * ramp(end, end + m.releaseSec, time);
    }
  }
  const next = i + 1;
  if (next < presses.downs.length) {
    const down = presses.downs[next] ?? 0;
    const from = Math.max(end, down - m.liftSec);
    if (time > from && down > from) {
      const lift = presses.froms[next] ?? m.rest;
      bend += (lift - bend) * ramp(from, down, time);
    }
  }
  return bend;
}

/**
 * Writes the bends of the five claws of a paw at a song time (design 5.3): only from the track, the
 * time, and the weight, so a seek or a speed change is correct. Between the rest pose and the
 * play, the bend blends to the bend of the play. The lap bend is gone at the weight
 * {@link DIGIT_MOTION.lapFade}.
 *
 * @param track The presses of the claws of the paw.
 * @param time The song time.
 * @param weight The weight of the playing pose: 0 is the rest pose, with the bend
 *   {@link DIGIT_MOTION.lap}.
 * @param out The bends of both paws, the left paw first.
 * @param offset The index of the first claw of the paw in `out`: 0 or 5.
 */
export function digitBendsAt(
  track: DigitTrack,
  time: number,
  weight: number,
  out: Float32Array,
  offset: number,
): void {
  const m = DIGIT_MOTION;
  for (let k = 0; k < DIGIT_COUNT; k++) {
    const presses = track.digits[k];
    ownBends[k] = presses ? digitBendAt(presses, time) : 0;
  }
  for (let k = 0; k < DIGIT_COUNT; k++) {
    // Each claw follows a part of the press of the claws next to it, as the tendons join them.
    const press = (j: number): number => Math.max(0, (ownBends[j] ?? m.rest) - m.rest);
    const own = ownBends[k] ?? 0;
    const play = Math.min(Math.max(own, m.press), own + m.spill * (press(k - 1) + press(k + 1)));
    out[offset + k] = play * weight + m.lap * (1 - smoothstep(weight / m.lapFade));
  }
}

/** The bends of the claws of one paw before the spill. Each call writes it before it reads it. */
const ownBends = new Float64Array(DIGIT_COUNT);
