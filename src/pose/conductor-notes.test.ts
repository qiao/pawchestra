import { describe, expect, it } from 'vitest';

import { noteOff, noteOn, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestEvent } from '../midi/test-smf.ts';
import { scoreOf } from '../score/test-score.ts';
import type { Beat, Score } from '../score/types.ts';
import { gestureSize, noteLoudness } from './loudness.ts';
import { buildExpressionTrack } from './conductor-expression.ts';
import { BEAT_PATTERNS, CONDUCTOR_MOTION, batonAt, buildBatonTrack } from './conductor-notes.ts';
import type { BatonState, BatonTrack, PatternPoint } from './conductor-notes.ts';

/** A violin note on each beat unit of `bars` bars, at a velocity. */
function violins(bars: number, beatsInBar: number, unit: number, velocity = 100): TestEvent[] {
  return track(
    [programChange(0, 0, 40)],
    ...Array.from({ length: bars * beatsInBar }, (_, i) => [
      noteOn(i * unit, 0, 67, velocity),
      noteOff(i * unit + unit - 10, 0, 67),
    ]),
  );
}

/** Builds the score of 4 bars of a time signature at a quarter tempo. */
function scoreIn(numerator: number, denominator: number, bpm: number, velocity = 100): Score {
  const unit = (480 * 4) / denominator;
  return scoreOf({
    tracks: [
      [tempo(0, bpm), timeSignature(0, numerator, denominator)],
      violins(4, numerator, unit, velocity),
    ],
  });
}

function trackOf(score: Score): BatonTrack {
  const loudness = noteLoudness(score);
  const expression = buildExpressionTrack(score.beats, score.notes, loudness, score.seats.length);
  return buildBatonTrack(score.beats, score.notes, loudness, expression);
}

function at(baton: BatonTrack, time: number): BatonState {
  const out = { x: 0, y: 0 };
  batonAt(baton, time, out);
  return out;
}

/** The size of the pattern of a score of loud notes with no controllers. */
function sizeOf(velocity: number): number {
  // The loudness of a note is a 32-bit float.
  return CONDUCTOR_MOTION.scale * gestureSize(Math.fround((velocity / 127) * (100 / 127)), 1);
}

describe('buildBatonTrack (design 5.4)', () => {
  it.each<readonly [string, number, number, number, Beat['pattern']]>([
    ['2/4 at 192', 2, 4, 192, 1],
    ['2/4 at 100', 2, 4, 100, 2],
    ['3/4 at 100', 3, 4, 100, 3],
    ['4/4 at 100', 4, 4, 100, 4],
    ['6/8 at an eighth tempo of 120', 6, 8, 60, 6],
    ['5/4 at 100', 5, 4, 100, 'generic'],
  ])('puts the baton on the point of the pattern of %s at each beat', (_, n, d, bpm, pattern) => {
    const score = scoreIn(n, d, bpm);
    const baton = trackOf(score);
    const points: readonly PatternPoint[] = BEAT_PATTERNS[pattern];
    const size = sizeOf(100);
    expect(score.beats.every((b) => b.pattern === pattern)).toBe(true);
    for (const beat of score.beats) {
      const [x, y] = points[beat.indexInBar % points.length] ?? [0, 0];
      const tip = at(baton, beat.timeSec);
      expect(tip.x, `${beat.timeSec}`).toBeCloseTo(x * size, 9);
      expect(tip.y, `${beat.timeSec}`).toBeCloseTo(y * size, 9);
    }
  });

  it('draws the patterns as a conductor sees them: in, out, and up', () => {
    const [b1, b2, b3, b4] = BEAT_PATTERNS[4];
    expect(b1).toEqual([0, 0]);
    // Beat 2 goes inward (to the left), beat 3 outward (to the right), and beat 4 up.
    expect(b2?.[0]).toBeLessThan(0);
    expect(b3?.[0]).toBeGreaterThan(0);
    expect(b4?.[1]).toBeGreaterThan(Math.max(b2?.[1] ?? 0, b3?.[1] ?? 0));
    const [, c2, c3] = BEAT_PATTERNS[3];
    expect(c2?.[0]).toBeGreaterThan(0);
    expect(c3?.[1]).toBeGreaterThan(c2?.[1] ?? 0);
    const six = BEAT_PATTERNS[6];
    expect(six.slice(1, 3).every(([x]) => x < 0)).toBe(true);
    expect(six.slice(3, 5).every(([x]) => x > 0)).toBe(true);
    expect(BEAT_PATTERNS[2][1][0]).toBeGreaterThan(0);
  });

  it('makes the gestures larger with the loudness of the notes', () => {
    const loud = trackOf(scoreIn(4, 4, 100, 127));
    const soft = trackOf(scoreIn(4, 4, 100, 30));
    // Beat 3 of the first bar is 0.6 units to the right.
    expect(loud.points[4]).toBeCloseTo(0.6 * sizeOf(127), 9);
    expect(soft.points[4]).toBeCloseTo(0.6 * sizeOf(30), 9);
  });

  it('lifts the baton in an arc between two beats, higher before a downbeat', () => {
    const score = scoreIn(4, 4, 120);
    const baton = trackOf(score);
    const size = sizeOf(100);
    // Beats 1 and 2 of 4/4 at 120 BPM: 0 s and 0.5 s. The middle of the arc to beat 2.
    const [, b2] = BEAT_PATTERNS[4];
    expect(at(baton, 0.25).y).toBeCloseTo(((b2?.[1] ?? 0) / 2 + 0.3) * size, 9);
    // The arc from beat 4 to the downbeat of bar 2.
    const [, , , b4] = BEAT_PATTERNS[4];
    expect(at(baton, 1.75).y).toBeCloseTo(((b4?.[1] ?? 0) / 2 + 0.5) * size, 9);
    expect([CONDUCTOR_MOTION.downbeatArc, CONDUCTOR_MOTION.beatArc]).toEqual([0.5, 0.3]);
    // Each beat is the low point of the path: the baton comes down into it and leaves upward.
    for (const time of [0.5, 1, 1.5, 2]) {
      expect(at(baton, time - 0.01).y, `${time}`).toBeGreaterThan(at(baton, time).y);
      expect(at(baton, time + 0.01).y, `${time}`).toBeGreaterThan(at(baton, time).y);
    }
  });

  it('comes to the first beat from the point of the last beat of the bar, and goes back to it', () => {
    const score = scoreIn(3, 4, 100);
    const baton = trackOf(score);
    const size = sizeOf(100);
    const [, , up] = BEAT_PATTERNS[3];
    const rest = { x: (up?.[0] ?? 0) * size, y: (up?.[1] ?? 0) * size };
    const first = score.beats[0]?.timeSec ?? 0;
    const before = at(baton, first - 1);
    expect(before.x).toBeCloseTo(rest.x, 12);
    expect(before.y).toBeCloseTo(rest.y, 12);
    const last = score.beats.at(-1)?.timeSec ?? 0;
    const end = at(baton, last + 2);
    expect(end.x).toBeCloseTo(rest.x, 12);
    expect(end.y).toBeCloseTo(rest.y, 12);
  });
});
