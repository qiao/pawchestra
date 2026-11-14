import { describe, expect, it } from 'vitest';

import { mulberry32 } from './random.ts';
import {
  CONDUCTOR_MOTION,
  LIFT_FIT_SEC,
  LOWER_MAX_SEC,
  REST_MOTION,
  easeMove,
  liftScale,
  moveProgress,
  restMotion,
  seatHeight,
  seatSettled,
  smoothstep,
  transportHeight,
  transportSettled,
} from './rest.ts';
import type { RestMotion } from './rest.ts';
import type { SeatAudibility, Transport } from './types.ts';

/** A player that lifts 0.2 s after a play in 0.8 s, and lowers 0.4 s after the hold in 1.2 s. */
const SLOW: RestMotion = {
  lift: { delaySec: 0.2, durationSec: 0.8, skew: 1 },
  lower: { delaySec: 0.4, durationSec: 1.2, skew: 1 },
  fitSec: 1,
};

function transport(
  playing: boolean,
  changedAtWall: number | null,
  before: Transport | null = null,
  holdSec = 3,
  leadSec = Number.POSITIVE_INFINITY,
): Transport {
  return {
    playing,
    changedAtWall,
    before,
    startSec: 0,
    seekStart: false,
    endedAtSong: false,
    holdSec,
    leadSec,
  };
}

/** A transport that plays since long ago, so each player holds its instruments up. */
const UP = transport(true, -100);

describe('transportHeight (design 5.2)', () => {
  it('keeps the rest pose before the first play', () => {
    expect(transportHeight(SLOW, transport(false, null), 0)).toBe(0);
    expect(transportHeight(SLOW, transport(false, null), 100)).toBe(0);
  });

  it('lifts the instruments with the delay and the duration of the player', () => {
    const play = transport(true, 10);
    expect(transportHeight(SLOW, play, 10)).toBe(0);
    expect(transportHeight(SLOW, play, 10.2)).toBe(0);
    expect(transportHeight(SLOW, play, 10.6)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, play, 11)).toBe(1);
    expect(transportHeight(SLOW, play, 50)).toBe(1);
  });

  it('keeps the instruments up for the hold, then lowers them with the lowering', () => {
    const pause = transport(false, 20, UP);
    expect(transportHeight(SLOW, pause, 23.4)).toBe(1);
    expect(transportHeight(SLOW, pause, 24)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, pause, 24.6)).toBe(0);
    // A pause in the count-in has no hold.
    const early = transport(false, 20, UP, 0);
    expect(transportHeight(SLOW, early, 21)).toBeCloseTo(0.5, 9);
  });

  it('starts each move from the height at the change', () => {
    // A play at 10 s and a pause at 10.6 s, half way up, then a play at 11 s.
    const play = transport(true, 10);
    const pause = transport(false, 10.6, play);
    const again = transport(true, 11, pause);
    expect(transportHeight(SLOW, pause, 10.6)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, pause, 11)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, again, 11.2)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, again, 11.6)).toBeCloseTo(0.75, 9);
    expect(transportHeight(SLOW, again, 12)).toBe(1);
    // A play in a lowering holds the height for the delay, then lifts from it.
    const lowering = transport(false, 20, UP, 0);
    const back = transport(true, 21, lowering);
    expect(transportHeight(SLOW, back, 21)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, back, 21.6)).toBeCloseTo(0.75, 9);
  });

  it('scales the lift to fit the lead time of the play', () => {
    // The group lifts in 1 s at most, and the play gives 0.55 s: the lift takes half the time,
    // and ends 0.05 s before the first sound.
    const play = transport(true, 10, null, 3, 0.55);
    expect(transportHeight(SLOW, play, 10.1)).toBe(0);
    expect(transportHeight(SLOW, play, 10.3)).toBeCloseTo(0.5, 9);
    expect(transportHeight(SLOW, play, 10.5)).toBe(1);
  });
});

describe('seatHeight (design 5.5)', () => {
  function seat(
    audible: boolean,
    changedAtWall: number,
    before: SeatAudibility | null = null,
  ): SeatAudibility {
    return { audible, changedAtWall, before };
  }

  it('keeps the instruments up for a seat with no change', () => {
    expect(seatHeight(SLOW, undefined, 100)).toBe(1);
  });

  it('lowers a silent seat after the change, and lifts it when it sounds again', () => {
    const muted = seat(false, 10);
    expect(seatHeight(SLOW, muted, 10.4)).toBe(1);
    expect(seatHeight(SLOW, muted, 11)).toBeCloseTo(0.5, 9);
    expect(seatHeight(SLOW, muted, 11.6)).toBeCloseTo(0, 9);
    const back = seat(true, 20, muted);
    expect(seatHeight(SLOW, back, 20.6)).toBeCloseTo(0.5, 9);
    expect(seatHeight(SLOW, back, 21)).toBe(1);
  });

  it('starts each move from the height at the change', () => {
    const muted = seat(false, 10);
    const back = seat(true, 11, muted);
    expect(seatHeight(SLOW, back, 11)).toBeCloseTo(0.5, 9);
    expect(seatHeight(SLOW, back, 11.6)).toBeCloseTo(0.75, 9);
  });
});

describe('transportSettled and seatSettled (design 5.2, 5.5)', () => {
  it('tells when the slowest player ends the move of a change', () => {
    expect(transportSettled(transport(false, null), 0)).toBe(true);
    expect(transportSettled(transport(true, 10), 10 + LIFT_FIT_SEC - 0.01)).toBe(false);
    expect(transportSettled(transport(true, 10), 10 + LIFT_FIT_SEC + 1e-9)).toBe(true);
    expect(transportSettled(transport(false, 10), 13 + LOWER_MAX_SEC - 0.01)).toBe(false);
    expect(transportSettled(transport(false, 10), 13 + LOWER_MAX_SEC + 1e-9)).toBe(true);
    expect(transportSettled(transport(false, 10, null, 0), 10 + LOWER_MAX_SEC + 1e-9)).toBe(true);
    const muted: SeatAudibility = { audible: false, changedAtWall: 10, before: null };
    expect(seatSettled(muted, 10 + LOWER_MAX_SEC - 0.01)).toBe(false);
    expect(seatSettled(muted, 10 + LOWER_MAX_SEC + 1e-9)).toBe(true);
    expect(seatSettled({ ...muted, audible: true }, 10 + LIFT_FIT_SEC + 1e-9)).toBe(true);
  });
});

describe('smoothstep', () => {
  it('eases from 0 to 1 with a flat start and end', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.01)).toBeLessThan(0.001);
  });
});

/** Gives the rest motions of the players of one seat, with the seeds of the plan. */
function seatMotions(
  seatSeed: number,
  count: number,
  instrument: 'violin' | 'trumpet',
): RestMotion[] {
  return Array.from({ length: count }, (_, index) =>
    restMotion(instrument, index, seatSeed, mulberry32(seatSeed * 31 + index)),
  );
}

describe('restMotion (design 5.2)', () => {
  it('gives each player a lift and a lowering in their ranges', () => {
    const m = REST_MOTION;
    for (let seatId = 0; seatId < 200; seatId++) {
      for (const motion of seatMotions(seatId, 8, seatId % 2 === 0 ? 'violin' : 'trumpet')) {
        const { lift, lower } = motion;
        expect(lift.durationSec).toBeGreaterThanOrEqual(m.liftSec.carried.min);
        expect(lift.durationSec).toBeLessThanOrEqual(m.liftSec.carried.max);
        expect(lower.durationSec).toBeGreaterThanOrEqual(m.lowerSec.min);
        expect(lower.durationSec).toBeLessThanOrEqual(m.lowerSec.max);
        expect(lift.delaySec + lift.durationSec).toBeLessThanOrEqual(LIFT_FIT_SEC);
        expect(lower.delaySec + lower.durationSec).toBeLessThanOrEqual(LOWER_MAX_SEC);
        for (const move of [lift, lower]) {
          expect(move.skew).toBeGreaterThanOrEqual(m.skew.min);
          expect(move.skew).toBeLessThanOrEqual(m.skew.max);
        }
        expect(motion.fitSec).toBe(LIFT_FIT_SEC);
      }
    }
  });

  it('moves the principal first, and each later player of the seat after the one before', () => {
    for (let seatId = 0; seatId < 50; seatId++) {
      const motions = seatMotions(seatId, 6, 'violin');
      for (const move of ['lift', 'lower'] as const) {
        const delays = motions.map((m) => m[move].delaySec);
        for (let i = 1; i < delays.length; i++) {
          expect(delays[i]).toBeGreaterThan(delays[i - 1] ?? Infinity);
        }
        // The principal waits only for the delay of its seat, and the ripple stays below 0.5 s.
        expect((delays.at(-1) ?? 0) - (delays[0] ?? 0)).toBeLessThan(REST_MOTION.rippleSec);
        expect((delays[1] ?? 0) - (delays[0] ?? 0)).toBeGreaterThan(0.1);
      }
    }
  });

  it('gives each move its own timing, so an early lifter does not have to lower late', () => {
    const motions = Array.from({ length: 40 }, (_, seatId) =>
      seatMotions(seatId, 4, 'violin'),
    ).flat();
    const liftOrder = motions.map((m) => m.lift.delaySec + m.lift.durationSec);
    const lowerOrder = motions.map((m) => m.lower.delaySec + m.lower.durationSec);
    // The players that end the lift early include players that end the lowering early too.
    const early = (values: number[]): Set<number> => {
      const sorted = values.toSorted((a, b) => a - b);
      const limit = sorted[Math.floor(values.length / 4)] ?? 0;
      return new Set(values.flatMap((v, i) => (v <= limit ? [i] : [])));
    };
    const earlyLift = early(liftOrder);
    const both = [...early(lowerOrder)].filter((i) => earlyLift.has(i));
    expect(both.length).toBeGreaterThan(0);
    const durations = motions.map((m) => m.lift.durationSec);
    expect(new Set(durations).size).toBe(motions.length);
  });

  it('gives the same motion for the same seeds, and other motions for other seeds', () => {
    expect(seatMotions(7, 4, 'violin')).toEqual(seatMotions(7, 4, 'violin'));
    expect(seatMotions(8, 4, 'violin')).not.toEqual(seatMotions(7, 4, 'violin'));
  });

  it('lifts the winds a moment before the other seats', () => {
    const m = REST_MOTION.seatLiftSec;
    for (let seatId = 0; seatId < 100; seatId++) {
      const [winds] = seatMotions(seatId, 1, 'trumpet');
      const [strings] = seatMotions(seatId, 1, 'violin');
      expect(winds?.lift.delaySec).toBeLessThanOrEqual(m.winds.max);
      expect(strings?.lift.delaySec).toBeGreaterThanOrEqual(m.others.min);
    }
  });

  it('spreads the starts of a seat of 4 players over the ripple', () => {
    const spreads = Array.from({ length: 100 }, (_, seatId) => {
      const delays = seatMotions(seatId, 4, 'violin').map((m) => m.lift.delaySec);
      return (delays[3] ?? 0) - (delays[0] ?? 0);
    });
    expect(Math.min(...spreads)).toBeGreaterThan(0.25);
    expect(Math.max(...spreads)).toBeLessThan(0.5);
  });
});

describe('easeMove', () => {
  it('eases from 0 to 1 with little speed at the start and at the end', () => {
    for (const skew of [0.8, 1, 1.25]) {
      expect(easeMove(-1, skew)).toBe(0);
      expect(easeMove(0, skew)).toBe(0);
      expect(easeMove(1, skew)).toBe(1);
      expect(easeMove(2, skew)).toBe(1);
      expect(easeMove(0.01, skew)).toBeLessThan(0.005);
      expect(1 - easeMove(0.99, skew)).toBeLessThan(0.005);
      let last = 0;
      for (let x = 0.01; x <= 1; x += 0.01) {
        const value = easeMove(x, skew);
        expect(value).toBeGreaterThanOrEqual(last);
        last = value;
      }
    }
    expect(easeMove(0.5, 1)).toBeCloseTo(0.5, 9);
  });

  it('moves the largest speed earlier with a skew below 1', () => {
    expect(easeMove(0.5, 0.8)).toBeGreaterThan(easeMove(0.5, 1));
    expect(easeMove(0.5, 1.25)).toBeLessThan(easeMove(0.5, 1));
  });
});

describe('moveProgress and liftScale (design 5.2)', () => {
  const move = { delaySec: 0.2, durationSec: 0.8, skew: 1 };

  it('waits for the delay, then moves in the duration', () => {
    expect(moveProgress(move, 0, 1)).toBe(0);
    expect(moveProgress(move, 0.2, 1)).toBe(0);
    expect(moveProgress(move, 0.6, 1)).toBeCloseTo(0.5, 9);
    expect(moveProgress(move, 1, 1)).toBe(1);
  });

  it('scales the delay and the duration to fit a short count-in', () => {
    const scale = liftScale({ ...CONDUCTOR_MOTION, fitSec: 2 }, 1.05);
    expect(scale).toBe(0.5);
    expect(moveProgress(move, 0.1, scale)).toBe(0);
    expect(moveProgress(move, 0.3, scale)).toBeCloseTo(0.5, 9);
    expect(moveProgress(move, 0.5, scale)).toBe(1);
    expect(liftScale(CONDUCTOR_MOTION, 10)).toBe(1);
    expect(liftScale(CONDUCTOR_MOTION, Infinity)).toBe(1);
  });
});
