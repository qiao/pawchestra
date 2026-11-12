import { describe, expect, it } from 'vitest';

import type { PlayerNote } from '../score/types.ts';
import { CHOIR_MOTION, buildChoirTrack, choirStateAt, createChoirState } from './choir-notes.ts';
import type { ChoirState, ChoirTrack } from './choir-notes.ts';
import { gestureSize } from './loudness.ts';

/** Makes a note of player 0 of seat 0. */
function n(startSec: number, endSec: number, pitch = 67): PlayerNote {
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

/** The loudness that gives a gesture size of 1 at the amplitude 1. */
const LOUD = 2 / 3;

function track(notes: readonly PlayerNote[]): ChoirTrack {
  return buildChoirTrack(
    notes,
    notes.map(() => LOUD),
    1,
  );
}

function stateAt(t: ChoirTrack, time: number): ChoirState {
  const state = createChoirState();
  choirStateAt(t, time, state);
  return state;
}

const OPEN = CHOIR_MOTION.jaw * gestureSize(LOUD, 1);

describe('choirStateAt (design 5.3)', () => {
  it('opens the jaw in the 0.1 s before a note, and keeps it open while the note sounds', () => {
    const t = track([n(1, 2)]);
    expect(OPEN).toBeCloseTo(CHOIR_MOTION.jaw, 12);
    expect(stateAt(t, 0.89).jaw).toBe(0);
    expect(stateAt(t, 0.95).jaw).toBeCloseTo(OPEN / 2, 9);
    expect(stateAt(t, 1).jaw).toBeCloseTo(OPEN, 9);
    expect(stateAt(t, 1.5).jaw).toBeCloseTo(OPEN, 9);
    expect(stateAt(t, 2).jaw).toBeCloseTo(OPEN, 9);
  });

  it('closes the jaw in 0.12 s after the note', () => {
    const t = track([n(1, 2)]);
    expect(stateAt(t, 2.06).jaw).toBeCloseTo(OPEN / 2, 9);
    expect(stateAt(t, 2.12).jaw).toBe(0);
  });

  it('closes the jaw to half and opens it again between two notes that touch', () => {
    const t = track([n(1, 2), n(2, 3, 69)]);
    expect(stateAt(t, 1.9).jaw).toBeCloseTo(OPEN, 9);
    expect(stateAt(t, 1.95).jaw).toBeCloseTo(OPEN / 2, 9);
    expect(stateAt(t, 2).jaw).toBeCloseTo(OPEN, 9);
    // The jaw opens with its full speed at the note start, as the voice starts.
    expect(stateAt(t, 2).jaw - stateAt(t, 1.999).jaw).toBeGreaterThan(1e-3);
  });

  it('opens in half the gap between two fast notes', () => {
    const t = track([n(1, 1.12), n(1.12, 1.3)]);
    // The jaw opens for the second note from 1.06 s.
    expect(stateAt(t, 1.06).jaw).toBeCloseTo(OPEN, 9);
    expect(stateAt(t, 1.09).jaw).toBeCloseTo(OPEN / 2, 9);
  });

  it('opens with the loudness of the note', () => {
    const notes = [n(1, 2), n(3, 4)];
    const t = buildChoirTrack(notes, [0, 1], 1);
    expect(stateAt(t, 1.5).jaw).toBeCloseTo(CHOIR_MOTION.jaw * 0.6, 9);
    expect(stateAt(t, 3.5).jaw).toBeCloseTo(CHOIR_MOTION.jaw * 1.2, 9);
  });

  it('sings the notes of a chord as one note', () => {
    const t = track([n(1, 2, 64), n(1.02, 2.5, 67)]);
    expect(t.starts).toHaveLength(1);
    expect(stateAt(t, 2.3).jaw).toBeCloseTo(OPEN, 9);
  });

  it('sways in a phrase, from 0.4 s before it to 1 s after it', () => {
    const t = track([n(1, 2), n(2.2, 3)]);
    expect(stateAt(t, 0.5).sway).toBe(0);
    expect(stateAt(t, 0.8).sway).toBeCloseTo(0.5, 9);
    expect(stateAt(t, 2.1).sway).toBeCloseTo(1, 9);
    expect(stateAt(t, 3.5).sway).toBeCloseTo(0.5, 9);
    expect(stateAt(t, 4).sway).toBe(0);
  });
});
