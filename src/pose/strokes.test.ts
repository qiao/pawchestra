import { describe, expect, it } from 'vitest';

import { chord, note, noteOff, noteOn, programChange, tempo, track } from '../midi/test-smf.ts';
import type { TestEvent } from '../midi/test-smf.ts';
import { scoreOf } from '../score/test-score.ts';
import type { SectionSize } from '../score/types.ts';
import { fingerboardPlace } from './fingering.ts';
import { noteLoudness } from './loudness.ts';
import { runAll } from '../score/steps.ts';
import { BOW_MOTION, bowStateAt, buildStrokesSteps, createBowState } from './strokes.ts';
import type { BowState, Stroke } from './strokes.ts';

/** The bow range of the tests: a hair of 0.5 m with 0.03 m kept free at each end. */
const RANGE = [0.03, 0.47] as const;

/** Builds the strokes of one player of a one-channel file at 120 BPM (a quarter is 0.5 s). */
function strokesOf(
  events: readonly TestEvent[],
  program = 40,
  sectionSize: SectionSize = 'auto',
  player = 0,
): Stroke[] {
  const score = scoreOf(
    { tracks: [track([tempo(0, 120), programChange(0, 0, program)], events)] },
    sectionSize,
  );
  const loudness = noteLoudness(score);
  const indices = score.notes.flatMap((n, i) => (n.player === player ? [i] : []));
  const notes = indices.map((i) => score.notes[i]).filter((n) => n !== undefined);
  const section = score.seats[0]?.section;
  const instrument = section === 'cello' ? 'cello' : 'violin';
  return runAll(
    buildStrokesSteps(
      notes,
      indices.map((i) => loudness[i] ?? 0),
      RANGE,
      1,
      instrument,
      5.5,
      Float64Array.from(score.beats, (b) => b.timeSec),
    ),
  );
}

function stateAt(strokes: readonly Stroke[], time: number): BowState {
  const out = createBowState();
  bowStateAt(
    strokes,
    Float64Array.from(strokes, (s) => s.start),
    time,
    out,
  );
  return out;
}

describe('buildStrokesSteps (design 5.3)', () => {
  it('changes the bow direction on each note, and starts each stroke where the last ended', () => {
    const strokes = strokesOf([...note(0, 0, 67), ...note(480, 0, 69), ...note(960, 0, 71)]);
    expect(strokes).toHaveLength(3);
    const directions = strokes.map((s) => Math.sign(s.bowTo - s.bowFrom));
    expect(directions).toEqual([1, -1, 1]);
    expect(strokes[1]?.bowFrom).toBe(strokes[0]?.bowTo);
    expect(strokes[2]?.bowFrom).toBe(strokes[1]?.bowTo);
  });

  it('starts a phrase after a rest of 0.5 s with a down-bow at the frog', () => {
    const strokes = strokesOf([...note(0, 0, 67), ...note(480, 0, 69), ...note(1920, 0, 71)]);
    expect(strokes[1]?.retake).toBe(false);
    expect(strokes[2]?.retake).toBe(true);
    expect(strokes[2]?.bowFrom).toBeCloseTo(
      RANGE[0] + BOW_MOTION.frogStart * (RANGE[1] - RANGE[0]),
      9,
    );
    expect(strokes[2]?.bowTo).toBeGreaterThan(strokes[2]?.bowFrom ?? Infinity);
  });

  it('gives a long note more bow, and a short note a faster bow', () => {
    const strokes = strokesOf([...note(0, 0, 67, 1920), ...note(2880, 0, 67, 3000)]);
    const [long, short] = strokes;
    if (!long || !short) {
      throw new Error('The test file needs two strokes.');
    }
    const lengthOf = (s: Stroke): number => Math.abs(s.bowTo - s.bowFrom);
    expect(lengthOf(long)).toBeGreaterThan(lengthOf(short) * 2);
    const speedOf = (s: Stroke): number => lengthOf(s) / (s.end - s.start);
    expect(speedOf(short)).toBeGreaterThan(speedOf(long));
  });

  it('gives a loud note a longer stroke than a soft note of the same length', () => {
    const strokes = strokesOf([
      noteOn(0, 0, 67, 30),
      noteOff(480, 0, 67),
      noteOn(1440, 0, 67, 127),
      noteOff(1920, 0, 67),
    ]);
    const [soft, loud] = strokes;
    expect(loud?.gesture).toBeGreaterThan(soft?.gesture ?? Infinity);
    expect(Math.abs((loud?.bowTo ?? 0) - (loud?.bowFrom ?? 0))).toBeGreaterThan(
      Math.abs((soft?.bowTo ?? 0) - (soft?.bowFrom ?? 0)),
    );
  });

  it('plays two notes of one player as a double stop between two strings', () => {
    // Three cellos with five notes: player 0 plays 60 and 57 (design 3.8).
    const strokes = strokesOf(chord(0, 0, [36, 43, 50, 57, 60], 960), 42, 'full');
    expect(strokes).toHaveLength(1);
    // 60 is on the A string (3), and 57 on the D string (2) as its fifth.
    expect(strokes[0]?.string).toBe(2.5);
    expect(strokes[0]?.hand.place).toBeCloseTo(fingerboardPlace(5), 9);
  });

  it('keeps a held note in the double stop of each later stroke while it sounds', () => {
    // G3 from 0 s to 6 s, and ten E5 notes of 0.4 s from 0.5 s on. The full section doubles
    // each note, so player 0 plays both lines (design 3.8).
    const strokes = strokesOf(
      [
        ...note(0, 0, 55, 5760),
        ...Array.from({ length: 10 }, (_, i) => note(480 + i * 480, 0, 76, 864 + i * 480)).flat(),
      ],
      40,
      'full',
    );
    expect(strokes).toHaveLength(11);
    // Each later stroke is a double stop: E5 on the E string (3), and G3 on the string below it
    // (2). The bow lies at 2.5.
    expect(strokes.slice(1).map((s) => s.string)).toEqual(Array(10).fill(2.5));
  });

  it('gives a single note the highest open string at or below its pitch', () => {
    const strokes = strokesOf([...note(0, 0, 55), ...note(480, 0, 64), ...note(960, 0, 88)]);
    expect(strokes.map((s) => s.string)).toEqual([0, 1, 3]);
    expect(strokes[1]?.hand.place).toBeCloseTo(fingerboardPlace(2), 9);
    expect(strokes[2]?.hand.place).toBeCloseTo(fingerboardPlace(12), 9);
  });

  it('keeps the bow in place for pizzicato, and makes tremolo strokes around it', () => {
    const strokes = strokesOf(
      track(
        note(0, 0, 67),
        [programChange(480, 0, 45)],
        note(480, 0, 67),
        [programChange(960, 0, 44)],
        note(960, 0, 67, 1920),
      ),
    );
    expect(strokes.map((s) => s.technique)).toEqual(['normal', 'pizzicato', 'tremolo']);
    const [arco, pizzicato, tremolo] = strokes;
    expect(pizzicato?.bowFrom).toBe(arco?.bowTo);
    expect(pizzicato?.bowTo).toBe(arco?.bowTo);
    expect(tremolo?.bowFrom).toBe(arco?.bowTo);
    expect(tremolo?.tremolo).toBeGreaterThan(0.01);
  });
});

describe('bowStateAt (design 5.3)', () => {
  it('turns the bow at the note start', () => {
    const strokes = strokesOf([...note(0, 0, 67), ...note(480, 0, 69)]);
    const start = strokes[1]?.start ?? 0;
    const before = stateAt(strokes, start - 0.002).bow;
    const at = stateAt(strokes, start).bow;
    const after = stateAt(strokes, start + 0.002).bow;
    // The first stroke is a down-bow: the bow moves up the hair, then turns back.
    expect(before).toBeLessThan(at);
    expect(after).toBeLessThan(at);
  });

  it('lifts the bow in a rest and lands it at the next note start', () => {
    const strokes = strokesOf([...note(0, 0, 67), ...note(1440, 0, 69)]);
    const second = strokes[1];
    if (!second) {
      throw new Error('The test file needs two strokes.');
    }
    expect(stateAt(strokes, 0.25).lift).toBe(0);
    expect(stateAt(strokes, 1).lift).toBeCloseTo(BOW_MOTION.lift, 9);
    expect(stateAt(strokes, second.start - 0.05).lift).toBeGreaterThan(0);
    // The landing ends at the note start with no jump.
    expect(stateAt(strokes, second.start - 0.001).lift).toBeLessThan(0.001);
    expect(stateAt(strokes, second.start).lift).toBe(0);
    // Before the first note, the bow waits above the strings.
    expect(stateAt(strokes, -1).lift).toBeCloseTo(BOW_MOTION.lift, 9);
    expect(stateAt(strokes, 0).lift).toBe(0);
  });

  it('moves the bow back to the frog in a long rest, before the landing', () => {
    const strokes = strokesOf([...note(0, 0, 67, 1440), ...note(2880, 0, 69)]);
    const [first, second] = strokes;
    if (!first || !second) {
      throw new Error('The test file needs two strokes.');
    }
    expect(stateAt(strokes, first.end + 0.05).bow).toBeCloseTo(first.bowTo, 9);
    const land = second.start - BOW_MOTION.landSec;
    expect(stateAt(strokes, land).bow).toBeCloseTo(second.bowFrom, 9);
    expect(stateAt(strokes, second.start).bow).toBeCloseTo(second.bowFrom, 9);
  });

  it('moves the left hand and the bow string to the next note by its start', () => {
    const strokes = strokesOf([...note(0, 0, 55), ...note(480, 0, 88)]);
    const second = strokes[1];
    if (!second) {
      throw new Error('The test file needs two strokes.');
    }
    const early = stateAt(
      strokes,
      second.start - BOW_MOTION.crossLeadSec - BOW_MOTION.crossSec - 0.01,
    );
    expect(early.string).toBe(0);
    expect(early.fingerboard).toBe(strokes[0]?.hand.place);
    const at = stateAt(strokes, second.start);
    expect(at.string).toBe(3);
    expect(at.fingerboard).toBeCloseTo(second.hand.place, 9);
  });

  it('plucks a pizzicato note at its start, after the finger rests on the string', () => {
    const strokes = strokesOf(track([programChange(0, 0, 45)], note(0, 0, 67), note(480, 0, 69)));
    const second = strokes[1];
    if (!second) {
      throw new Error('The test file needs two strokes.');
    }
    expect(stateAt(strokes, second.start - 0.03).pluck).toBe(-1);
    expect(stateAt(strokes, second.start).pluck).toBe(-1);
    expect(stateAt(strokes, second.start + 0.03).pluck).toBeGreaterThan(0);
    expect(stateAt(strokes, second.start + 0.1).pluck).toBe(1);
    expect(stateAt(strokes, 0.3).pizzicato).toBe(1);
  });

  it('ends the change from the bow to pizzicato before the note', () => {
    const strokes = strokesOf(
      track(note(0, 0, 67, 960), [programChange(960, 0, 45)], note(960, 0, 69)),
    );
    const second = strokes[1];
    if (!second) {
      throw new Error('The test file needs two strokes.');
    }
    expect(stateAt(strokes, second.start - BOW_MOTION.techniqueLeadSec).pizzicato).toBe(0);
    expect(stateAt(strokes, second.start - 0.15).pizzicato).toBeGreaterThan(0);
    expect(stateAt(strokes, second.start - BOW_MOTION.techniqueEndSec).pizzicato).toBe(1);
  });

  it('makes fast short strokes for tremolo', () => {
    const strokes = strokesOf(note(0, 0, 67, 1920), 44);
    expect(strokes[0]?.technique).toBe('tremolo');
    const samples = Array.from({ length: 200 }, (_, i) => stateAt(strokes, i * 0.005).bow);
    let turns = 0;
    for (let i = 2; i < samples.length; i++) {
      const a = (samples[i - 1] ?? 0) - (samples[i - 2] ?? 0);
      const b = (samples[i] ?? 0) - (samples[i - 1] ?? 0);
      if (a * b < 0) {
        turns++;
      }
    }
    // 7 cycles a second give 14 turns in 1 s.
    expect(turns).toBeGreaterThanOrEqual(13);
    expect(turns).toBeLessThanOrEqual(15);
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.05);
  });
});
