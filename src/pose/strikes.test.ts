import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../models/tuples.ts';
import { gestureSize } from './loudness.ts';
import {
  STRIKE_MOTION,
  alternateHands,
  buildStrikeTrack,
  createStrikeState,
  strikeStateAt,
} from './strikes.ts';
import type { Strike, StrikeGroup, StrikeState, StrikeTarget, StrikeTrack } from './strikes.ts';

const UP: Vec3 = [0, 1, 0];

/** A target at x on a head 0.7 m high. */
function at(x: number): StrikeTarget {
  return { point: [x, 0.7, -0.5], normal: UP };
}

/** A group of strikes with the loudness 2/3: a gesture size of 1. */
function group(start: number, ...xs: number[]): StrikeGroup {
  return { start, loudness: 2 / 3, targets: xs.map(at) };
}

/** Shows the strikes of a hand as `start:x`. */
function show(strikes: readonly Strike[]): string[] {
  return strikes.map((s) => `${s.start}:${s.point[0]}`);
}

const SIZES = { lift: 0.1, rest: 0.03 } as const;

function trackOf(starts: readonly number[], xs: readonly number[] = []): StrikeTrack {
  const strikes = starts.map((start, i): Strike => ({ ...at(xs[i] ?? 0), start, loudness: 2 / 3 }));
  return buildStrikeTrack(strikes, at(-0.2), SIZES, 1, new Float64Array());
}

function stateAt(track: StrikeTrack, time: number): StrikeState {
  const state = createStrikeState();
  strikeStateAt(track, time, state);
  return state;
}

describe('alternateHands (design 5.3)', () => {
  it('alternates the hands on fast strikes, and starts with the hand on the side', () => {
    const [left, right] = alternateHands([
      group(0, -0.3),
      group(0.2, -0.3),
      group(0.4, -0.3),
      group(1.5, 0.3),
      group(1.7, -0.3),
    ]);
    expect(show(left)).toEqual(['0:-0.3', '0.4:-0.3', '1.7:-0.3']);
    expect(show(right)).toEqual(['0.2:-0.3', '1.5:0.3']);
  });

  it('gives the hand on the side of the target after a rest of 0.5 s', () => {
    const [left, right] = alternateHands([group(0, 0.3), group(0.5, 0.3), group(0.99, 0.3)]);
    expect(show(left)).toEqual(['0.99:0.3']);
    expect(show(right)).toEqual(['0:0.3', '0.5:0.3']);
    expect(STRIKE_MOTION.alternateSec).toBe(0.5);
  });

  it('keeps a hand from crossing the other hand in a fast run', () => {
    // A run up to the right: the left hand would cross the right hand at 0.4 s and 0.6 s, so the
    // right hand strikes again.
    const [left, right] = alternateHands([
      group(0, -0.4),
      group(0.2, 0),
      group(0.4, 0.2),
      group(0.6, 0.4),
      group(0.8, 0.1),
    ]);
    expect(show(left)).toEqual(['0:-0.4', '0.8:0.1']);
    expect(show(right)).toEqual(['0.2:0', '0.4:0.2', '0.6:0.4']);
    const [down] = alternateHands([group(0, 0.4), group(0.2, 0.2), group(0.4, -0.2)]);
    // The right hand strikes 0.4, then the left hand 0.2, then the left hand again at -0.2,
    // because the right hand would cross it.
    expect(show(down)).toEqual(['0.2:0.2', '0.4:-0.2']);
  });

  it('gives the two outer targets of a chord to the two hands', () => {
    const [left, right] = alternateHands([group(0, 0.1, -0.2, 0.4), group(0.2, 0.1)]);
    expect(show(left)).toEqual(['0:-0.2']);
    // After a chord, a single strike takes the hand on its side.
    expect(show(right)).toEqual(['0:0.4', '0.2:0.1']);
  });
});

describe('strikeStateAt (design 5.3)', () => {
  it('rests above the first target before the first lift', () => {
    const state = stateAt(trackOf([1], [0.3]), 0.5);
    expect(state.point).toEqual([-0.2, 0.7, -0.5]);
    expect(state.height).toBeCloseTo(SIZES.rest, 12);
  });

  it('strikes the target at the note start with its full speed', () => {
    const track = trackOf([1, 2], [0.3, -0.1]);
    const strike = stateAt(track, 1);
    expect(strike.point).toEqual([0.3, 0.7, -0.5]);
    expect(strike.height).toBe(0);
    // The head comes down before the start and goes up after it.
    const before = stateAt(track, 1 - 0.001).height;
    const after = stateAt(track, 1 + 0.001).height;
    expect(before).toBeGreaterThan(0.001);
    expect(after).toBeGreaterThan(0.0005);
  });

  it('starts the lift 0.25 s before the note, and lifts to the height of the gesture', () => {
    const track = trackOf([1, 3], [0.3, 0.3]);
    expect(Array.from(track.upStarts)).toEqual([1 - STRIKE_MOTION.upSec, 3 - STRIKE_MOTION.upSec]);
    const middle = stateAt(track, 3 - STRIKE_MOTION.upSec / 2).height;
    // The middle of the lift: half the rest height and the full peak.
    expect(middle).toBeCloseTo(SIZES.rest / 2 + SIZES.lift * gestureSize(2 / 3, 1), 9);
  });

  it('lifts in 0.6 of the gap before a fast strike, and lower in proportion', () => {
    const track = trackOf([1, 1.2], [0.3, 0.3]);
    expect(track.upStarts[1]).toBeCloseTo(1.2 - 0.6 * 0.2, 12);
    expect(track.peaks[1]).toBeCloseTo((SIZES.lift * 0.12) / STRIKE_MOTION.upSec, 12);
    expect(track.reboundEnds[0]).toBeCloseTo(1 + 0.4 * 0.2, 12);
  });

  it('moves to the next target in the lift, and rebounds to the rest height', () => {
    const track = trackOf([1, 2], [0.3, -0.1]);
    expect(stateAt(track, 1 + STRIKE_MOTION.reboundSec / 2).height).toBeCloseTo(
      SIZES.rest * 0.75,
      12,
    );
    expect(stateAt(track, 1.5)).toEqual({
      point: [0.3, 0.7, -0.5],
      normal: [0, 1, 0],
      height: SIZES.rest,
    });
    expect(stateAt(track, 2 - STRIKE_MOTION.upSec / 2).point[0]).toBeCloseTo(0.1, 12);
  });
});
