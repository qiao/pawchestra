import { describe, expect, it } from 'vitest';

import type { PlayerNote } from '../score/types.ts';
import { slidePositions, windFingering } from './wind-fingering.ts';
import {
  WIND_MOTION,
  buildWindTrack,
  createWindState,
  windNotes,
  windStateAt,
} from './wind-notes.ts';
import type { WindState } from './wind-notes.ts';

/** Makes a note of player 0 of seat 0. */
function n(startSec: number, endSec: number, pitch: number): PlayerNote {
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

function stateAt(track: ReturnType<typeof buildWindTrack>, time: number): WindState {
  const state = createWindState();
  windStateAt(track, time, state);
  return state;
}

describe('slidePositions', () => {
  it('gives the lowest trombone position on the partials of B♭1 first', () => {
    expect(slidePositions(58)[0]).toBe(1); // B♭3
    expect(slidePositions(57)[0]).toBe(2); // A3
    expect(slidePositions(53)[0]).toBe(1); // F3
    expect(slidePositions(52)[0]).toBe(2); // E3
    expect(slidePositions(46)[0]).toBe(1); // B♭2
    expect(slidePositions(40)[0]).toBe(7); // E2
    expect(slidePositions(34)[0]).toBe(1); // the pedal B♭1
    expect(slidePositions(37)[0]).toBe(7); // below the reach of the slide
  });
});

describe('windFingering', () => {
  it('gives the trumpet valves: none on a partial, more below it', () => {
    expect(windFingering('trumpet', 58).valves).toBe(0); // B♭3
    expect(windFingering('trumpet', 57).valves).toBe(2); // valve 2
    expect(windFingering('trumpet', 52).valves).toBe(7); // E3: all three valves
    expect(windFingering('trumpet', 100).valves).toBe(0);
  });
});

describe('windNotes (a wind player shows one note)', () => {
  it('shows the highest note of a chord', () => {
    expect(windNotes([n(1, 2, 60), n(1.03, 2.5, 67), n(1.04, 2, 64)])).toEqual([
      { start: 1, end: 2.5, pitch: 67 },
    ]);
  });

  it('shows the last note that started, while an earlier note still sounds', () => {
    expect(windNotes([n(1, 3, 72), n(1.5, 2, 60)])).toEqual([
      { start: 1, end: 3, pitch: 72 },
      { start: 1.5, end: 2, pitch: 60 },
    ]);
  });
});

describe('windStateAt (design 5.3)', () => {
  const notes = [n(1, 1.4, 53), n(1.5, 1.9, 60), n(1.53, 1.9, 57), n(3, 4, 67)];
  const track = buildWindTrack(notes, 'clarinet');

  it('releases the fingers just before a note, so that they arrive at its start', () => {
    const start = windFingering('clarinet', 53);
    const end = windFingering('clarinet', 60);
    expect(stateAt(track, 1.5 - WIND_MOTION.releaseSec - 0.001).fingersR).toBeCloseTo(
      start.right,
      6,
    );
    const middle = stateAt(track, 1.5 - WIND_MOTION.releaseSec / 2).fingersR;
    expect(middle).toBeLessThan(start.right);
    expect(middle).toBeGreaterThan(end.right);
    expect(stateAt(track, 1.5).fingersR).toBeCloseTo(end.right, 6);
    expect(stateAt(track, 0).fingersL).toBeCloseTo(start.left, 6);
  });

  it('breathes in during the 0.4 s before a phrase, and out over the phrase', () => {
    expect(stateAt(track, 0.5).breath).toBe(0);
    expect(stateAt(track, 0.8).breath).toBeGreaterThan(0.3);
    expect(stateAt(track, 1).breath).toBeCloseTo(1, 9);
    expect(stateAt(track, 1.5).breath).toBeLessThan(1);
    // A rest of 1.1 s starts a new phrase at 3 s.
    expect(stateAt(track, 2.5).breath).toBe(0);
    expect(stateAt(track, 2.8).breath).toBeGreaterThan(0.3);
    expect(stateAt(track, 3).breath).toBeCloseTo(1, 9);
  });

  it('moves the trombone slide in the last 0.1 s before a note', () => {
    const slide = buildWindTrack([n(1, 1.4, 58), n(2, 2.4, 40)], 'trombone');
    expect(stateAt(slide, 1.5).slide).toBe(0);
    expect(stateAt(slide, 2 - WIND_MOTION.slideSec).slide).toBeCloseTo(0, 9);
    expect(stateAt(slide, 1.95).slide).toBeGreaterThan(0.2);
    expect(stateAt(slide, 2).slide).toBeCloseTo(1, 9);
  });
});
