import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../models/tuples.ts';
import type { PlayerNote } from '../score/types.ts';
import {
  HAND_MOTION,
  buildHandTrack,
  createHandState,
  handStateAt,
  splitHands,
} from './hand-notes.ts';
import type { HandAction, HandNote, HandState, HandTrack } from './hand-notes.ts';

/** Makes a note of player 0 of seat 0. */
function n(startSec: number, pitch: number, endSec = startSec + 0.4): PlayerNote {
  return {
    seatIndex: 0,
    player: 0,
    pitch,
    velocity: 100,
    startSec,
    endSec,
    technique: 'normal',
    synthChannel: 0,
  };
}

/** Splits notes with the loudness 0.5, and gives the keys of each hand. */
function keysOf(notes: readonly PlayerNote[]): [string[], string[]] {
  const [left, right] = splitHands(
    notes,
    notes.map(() => 0.5),
  );
  const show = (h: HandNote): string => `${h.start}:${h.low}-${h.high}`;
  return [left.map(show), right.map(show)];
}

/** Places the palm of a key range at x = the middle key / 100. */
const pointOf = (low: number, high: number): Vec3 => [(low + high) / 200, 0.7, 0];

function track(action: HandAction, starts: readonly number[], keys: readonly number[]): HandTrack {
  const notes = starts.map((start, i) => ({
    start,
    end: start,
    low: keys[i] ?? 60,
    high: keys[i] ?? 60,
    keys: [keys[i] ?? 60],
    loudness: 2 / 3,
  }));
  return buildHandTrack(notes, action, pointOf, 1, 48);
}

function stateAt(t: HandTrack, time: number): HandState {
  const state = createHandState();
  handStateAt(t, time, state);
  return state;
}

describe('splitHands (design 5.3)', () => {
  it('splits a chord wider than an octave at its largest interval', () => {
    const [left, right] = keysOf([n(0, 36), n(0, 43), n(0, 64), n(0, 67), n(0, 72)]);
    expect(left).toEqual(['0:36-43']);
    expect(right).toEqual(['0:64-72']);
  });

  it('splits a chord of equal intervals in the middle', () => {
    const [left, right] = keysOf([n(0, 36), n(0, 48), n(0, 60), n(0, 72)]);
    expect(left).toEqual(['0:36-48']);
    expect(right).toEqual(['0:60-72']);
  });

  it('gives a melody to the other hand past the reach of a hand', () => {
    const melody = [62, 60, 58, 56, 54, 52, 50, 48, 46, 44];
    const notes = [n(0, 36), ...melody.map((k, i) => n((i + 1) * 0.25, k))];
    const reach = { leftHighest: 72, rightLowest: 48 };
    const [left, right] = splitHands(
      notes,
      notes.map(() => 0.5),
      reach,
    );
    expect(right.map((h) => h.low)).toEqual(melody.slice(0, 8));
    expect(left.map((h) => h.low)).toEqual([36, 46, 44]);
    // A chord above the reach of the left hand goes to the right hand, also when the left hand
    // is nearer.
    const far = [n(0, 96), n(0.25, 64)];
    expect(splitHands(far, [0.5, 0.5])[0]).toHaveLength(1);
    expect(splitHands(far, [0.5, 0.5], { leftHighest: 60, rightLowest: 0 })[1]).toHaveLength(2);
  });

  it('keeps a melody in the nearer hand, also below middle C', () => {
    const [left, right] = keysOf([62, 60, 59, 57, 55].map((k, i) => n(i * 0.25, k)));
    expect(left).toEqual([]);
    expect(right).toHaveLength(5);
  });

  it('gives a note at the same distance from both hands to the side of middle C', () => {
    // The hands start at C3 and C5. C4 is 12 keys from each, and B3 is 11 keys from C3.
    expect(keysOf([n(0, 60)])[1]).toEqual(['0:60-60']);
    expect(keysOf([n(0, 59)])[0]).toEqual(['0:59-59']);
    // After E5 and E2, B♭3 is 18 keys from each hand.
    const [left, right] = keysOf([n(0, 76), n(0.5, 40), n(1, 58)]);
    expect(left).toEqual(['0.5:40-40', '1:58-58']);
    expect(right).toEqual(['0:76-76']);
  });

  it('plays a bass under a melody with the left hand', () => {
    const [left, right] = keysOf([n(0, 76), n(0.5, 40), n(0.5, 74), n(1, 43), n(1, 72)]);
    expect(left).toEqual(['0.5:40-40', '1:43-43']);
    expect(right).toEqual(['0:76-76', '0.5:74-74', '1:72-72']);
  });
});

describe('handStateAt (design 5.3)', () => {
  it('strikes the keys at the note start after a move of 0.15 s with a lift', () => {
    const t = track('strike', [1, 2], [60, 72]);
    expect(stateAt(t, 0.8).point).toEqual([0.48, 0.7, 0]);
    expect(stateAt(t, 1 - HAND_MOTION.moveSec - 0.001).point[0]).toBeCloseTo(0.48, 9);
    const middle = stateAt(t, 1 - HAND_MOTION.moveSec / 2);
    expect(middle.point[0]).toBeCloseTo(0.54, 9);
    // The lift is 0.03 m at a gesture size of 1, at the middle of the move.
    expect(middle.lift).toBeCloseTo(HAND_MOTION.lift, 9);
    // Just before the note, the hand comes down fast. At the note, it is on the keys.
    expect(stateAt(t, 0.999).lift).toBeGreaterThan(0.0005);
    expect(stateAt(t, 1).lift).toBe(0);
    expect(stateAt(t, 1).point[0]).toBeCloseTo(0.6, 9);
    expect(stateAt(t, 1.5).point[0]).toBeCloseTo(0.6, 9);
    expect(stateAt(t, 3).point[0]).toBeCloseTo(0.72, 9);
  });

  it('moves in 0.6 of the gap of two fast notes, and strikes each of them', () => {
    const t = track('strike', [1, 1.1, 1.2], [60, 60, 62]);
    // The hand stays on the keys for 0.04 s, and moves in the last 0.06 s before each note. It
    // lifts less for a near note.
    expect(stateAt(t, 1.039).lift).toBe(0);
    expect(stateAt(t, 1.07).lift).toBeCloseTo((HAND_MOTION.lift * 0.1) / HAND_MOTION.liftGapSec, 9);
    expect(stateAt(t, 1.1).lift).toBe(0);
    expect(stateAt(t, 1.17).point[0]).toBeCloseTo(0.61, 9);
  });

  it('rests on the string, plucks at the note start, and pulls away from the strings', () => {
    const t = track('pluck', [1, 2], [60, 64]);
    const rest = 1 - HAND_MOTION.restSec;
    expect(stateAt(t, rest).pull).toBe(0);
    expect(stateAt(t, rest).point[0]).toBeCloseTo(0.6, 9);
    expect(stateAt(t, 1).pull).toBe(0);
    expect(stateAt(t, 1).closed).toBe(0);
    expect(stateAt(t, 1 + HAND_MOTION.pluckSec / 2).pull).toBeCloseTo(HAND_MOTION.pull / 2, 9);
    expect(stateAt(t, 1 + HAND_MOTION.pluckSec).pull).toBeCloseTo(HAND_MOTION.pull, 9);
    expect(stateAt(t, 1.5).closed).toBe(1);
    // The hand comes back to the strings for the next note, and rests on its string.
    const next = stateAt(t, 2 - HAND_MOTION.restSec);
    expect(next.pull).toBe(0);
    expect(next.closed).toBe(0);
    expect(next.point[0]).toBeCloseTo(0.64, 9);
  });

  it('keeps the first move on the strings, with open fingers', () => {
    const t = track('pluck', [1, 2], [60, 64]);
    const move = stateAt(t, 1 - HAND_MOTION.restSec - HAND_MOTION.moveSec / 2);
    expect(move.point[0]).toBeCloseTo(0.54, 9);
    expect(move.pull).toBe(0);
    expect(move.closed).toBe(0);
  });

  it('shortens the rest and the pluck between fast notes', () => {
    const t = track('pluck', [1, 1.1], [60, 62]);
    // The rest is 0.2 of the gap, and the pluck 0.3 of the gap.
    expect(stateAt(t, 1.1 - 0.02).pull).toBe(0);
    expect(stateAt(t, 1.03).closed).toBeCloseTo(1, 9);
    expect(stateAt(t, 1.0799).pull).toBeGreaterThan(0);
  });
});
