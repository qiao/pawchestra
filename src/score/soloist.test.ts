import { describe, expect, it } from 'vitest';

import { noteOff, noteOn, programChange, track } from '../midi/test-smf.ts';
import type { TestEvent, TestFile } from '../midi/test-smf.ts';
import { patchedDemos } from '../../tools/patch-demos.ts';
import { violinConcertinoFile } from './test-audit-files.ts';
import { scoreOf } from './test-score.ts';
import { measureSoloists, passesSoloistRule } from './soloist.ts';
import type { Score, SectionSize } from './types.ts';

/** The beats of a test piece: 32 quarter notes at 120 BPM, 16 s. */
const BEATS = 32;

/**
 * Makes one part of a test piece: one note on each beat.
 *
 * @param channel The channel.
 * @param program The program.
 * @param key The key of each beat, or `null` for a rest.
 * @param velocity The velocity of each note.
 * @returns The events of the track.
 */
function line(
  channel: number,
  program: number,
  key: (beat: number) => number | null,
  velocity = 70,
): TestEvent[] {
  const notes: TestEvent[] = [];
  for (let beat = 0; beat < BEATS; beat++) {
    const k = key(beat);
    if (k !== null) {
      notes.push(noteOn(beat * 480, channel, k, velocity), noteOff(beat * 480 + 470, channel, k));
    }
  }
  return track([programChange(0, channel, program)], notes);
}

/** The strings of a test piece: violins, viola, cello, and contrabass, from 50 to 76. */
function strings(top = 76): TestEvent[][] {
  return [
    line(0, 40, (b) => top - (b % 3)),
    line(1, 41, () => 62),
    line(2, 42, () => 55),
    line(3, 43, () => 43),
  ];
}

/**
 * Builds a test piece and gives its soloist.
 *
 * @param parts The tracks.
 * @param sectionSize The section size setting.
 * @returns The score.
 */
function piece(parts: readonly TestEvent[][], sectionSize: SectionSize = 'auto'): Score {
  const file: TestFile = { tracks: [[], ...parts] };
  return scoreOf(file, sectionSize);
}

/** Gives the section of the soloist of a score, or `none`. */
function soloistOf(score: Score): string {
  return score.soloist === null ? 'none' : (score.seats[score.soloist]?.section ?? 'none');
}

/** A flute that rests for the first 4 beats, then plays above the strings. */
const FLUTE_SOLO = line(4, 73, (b) => (b < 4 ? null : 84 + (b % 5)));

describe('findSoloist (design 3.8)', () => {
  it('finds a flute that plays above the orchestra most of the piece', () => {
    expect(soloistOf(piece([...strings(), FLUTE_SOLO]))).toBe('flute');
  });

  it('finds the same soloist with each section size', () => {
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      expect(soloistOf(piece([...strings(), FLUTE_SOLO], size)), size).toBe('flute');
    }
  });

  it('finds no soloist for a flute under the strings at the same loudness', () => {
    expect(soloistOf(piece([...strings(96), FLUTE_SOLO]))).toBe('none');
  });

  it('finds no soloist that is above the orchestra in less than three quarters of its time', () => {
    // Above the violins (74 to 76) on 3 of each 5 beats: 0.6 of the time.
    const mixed = line(4, 73, (b) => (b < 4 ? null : b % 5 < 3 ? 84 : 70));
    expect(soloistOf(piece([...strings(), mixed]))).toBe('none');
    const mostly = line(4, 73, (b) => (b < 4 ? null : b % 5 < 4 ? 84 : 70));
    expect(soloistOf(piece([...strings(), mostly]))).toBe('flute');
  });

  it('finds a low soloist that is louder than the orchestra', () => {
    const bassoon = line(4, 70, (b) => (b < 4 ? null : 48 + (b % 4)), 110);
    expect(soloistOf(piece([...strings(), bassoon]))).toBe('bassoon');
    const soft = line(4, 70, (b) => (b < 4 ? null : 48 + (b % 4)), 80);
    expect(soloistOf(piece([...strings(), soft]))).toBe('none');
  });

  it('finds no soloist that plays less than half of the piece', () => {
    const short = line(4, 73, (b) => (b < 18 ? null : 84));
    expect(soloistOf(piece([...strings(), short]))).toBe('none');
    const half = line(4, 73, (b) => (b < 15 ? null : 84));
    expect(soloistOf(piece([...strings(), half]))).toBe('flute');
  });

  it('finds no soloist without an orchestra of three other seats', () => {
    const duo = [line(0, 40, () => 70), line(1, 42, () => 50), FLUTE_SOLO];
    expect(soloistOf(piece(duo))).toBe('none');
    expect(soloistOf(piece([...duo, line(2, 41, () => 60)]))).toBe('flute');
  });

  it('finds no soloist that the orchestra does not accompany', () => {
    // The strings play only in the first 8 beats, then the flute plays alone.
    const tutti = [0, 1, 2, 3].map((c) => line(c, 40 + c, (b) => (b < 8 ? 60 - 5 * c : null)));
    expect(soloistOf(piece([...tutti, FLUTE_SOLO]))).toBe('none');
  });

  it('finds no soloist when two seats lead, as in a double concerto', () => {
    const bassoon = line(5, 70, (b) => (b < 4 ? null : 48 + (b % 4)), 110);
    expect(soloistOf(piece([...strings(), FLUTE_SOLO, bassoon]))).toBe('none');
  });

  it('finds no soloist in a seat with several players or in a shared section', () => {
    // The first violins lead, but they share the section with the second violins.
    const quartet = [
      line(0, 40, (b) => 88 + (b % 3)),
      line(1, 40, () => 67),
      line(2, 41, () => 60),
      line(3, 42, () => 48),
    ];
    for (const size of ['auto', 'one-per-part'] as const) {
      expect(soloistOf(piece(quartet, size)), size).toBe('none');
    }
    // A choir of 8 singers on one line is not a soloist.
    const choir = line(4, 52, (b) => (b < 4 ? null : 84));
    expect(soloistOf(piece([...strings(), choir]))).toBe('none');
  });

  it('makes a piano seat the soloist, as the layout of a piano concerto (design 4.2)', () => {
    const piano = line(4, 0, () => 40, 30);
    expect(soloistOf(piece([...strings(), piano]))).toBe('piano');
    expect(soloistOf(piece([...strings(), piano, FLUTE_SOLO]))).toBe('piano');
  });

  it('makes no celesta, harpsichord, or organ of the orchestra the soloist (audit 2, N1)', () => {
    // The celesta of Boulanger and the harpsichord of Bach play color and continuo.
    for (const program of [6, 7, 8, 19]) {
      const keyboard = line(5, program, () => 40, 30);
      expect(soloistOf(piece([...strings(), keyboard])), `program ${program}`).toBe('none');
      expect(soloistOf(piece([...strings(), keyboard, FLUTE_SOLO])), `program ${program}`).toBe(
        'flute',
      );
    }
    // The electric pianos are pianos.
    expect(soloistOf(piece([...strings(), line(4, 4, () => 40, 30)]))).toBe('piano');
  });

  it('finds a harpsichord that clearly leads, as in a harpsichord concerto', () => {
    const harpsichord = line(4, 6, (b) => (b < 4 ? null : 84 + (b % 5)));
    expect(soloistOf(piece([...strings(), harpsichord]))).toBe('piano');
  });

  it('finds a solo line beside the violins of the orchestra, with one player (audit 2, N10)', () => {
    // The strings of an orchestral file, with a contrabass: the violins get 4 players.
    const tutti = (velocity: number) => [
      line(1, 40, () => 67, velocity),
      line(2, 41, () => 60),
      line(3, 42, () => 48),
      line(5, 43, () => 40),
    ];
    const solo = line(0, 40, (b) => (b < 4 ? null : 84 + (b % 5)), 100);
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      const score = piece([solo, ...tutti(70)], size);
      expect(soloistOf(score), size).toBe('violin');
      expect(score.soloist === null ? undefined : score.seats[score.soloist], size).toMatchObject({
        sources: [{ port: 0, channel: 0 }],
        playerCount: 1,
      });
    }
    // At the loudness of the violins of the orchestra, the line is not exposed: it is the first
    // violins of a string orchestra.
    expect(soloistOf(piece([solo, ...tutti(100)]))).toBe('none');
    // A line that the violins of the orchestra leave alone is exposed at any loudness.
    const resting = line(1, 40, (b) => (b < 4 ? 67 : null), 100);
    expect(soloistOf(piece([solo, resting, ...tutti(100).slice(1)]))).toBe('violin');
  });

  it('finds the solo violin of the concertino of the audit (audit 2, N10)', () => {
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      const score = scoreOf(violinConcertinoFile(), size);
      const first = score.seats.findIndex((s) => s.section === 'violin');
      expect(score.soloist, size).toBe(first);
      expect(score.seats[first]?.playerCount, size).toBe(1);
    }
    // The violins of the string ensemble keep their section of 4.
    const auto = scoreOf(violinConcertinoFile());
    expect(auto.seats.filter((s) => s.section === 'violin').map((s) => s.playerCount)).toEqual([
      1, 4,
    ]);
  });

  it('gives no soloist to a file with no notes of a candidate', () => {
    expect(piece(strings()).soloist).toBeNull();
  });
});

/** The demo files, after the changes of `demos/patches.json`. */
const DEMOS = await patchedDemos();

describe('the soloist of each demo (design 3.8, 8.2)', () => {
  const demos = DEMOS;
  const expected = new Map([
    ['mozart-k315.mid', 'flute'],
    ['boulanger-matin.mid', 'none'],
    ['beethoven-9.mid', 'none'],
    ['mozart-k525.mid', 'none'],
    ['bach-bwv1048.mid', 'none'],
    ['beethoven-8.mid', 'none'],
    ['beethoven-1.mid', 'none'],
    ['brahms-2.mid', 'none'],
    ['beethoven-8-4.mid', 'none'],
    ['bach-bwv1047.mid', 'none'],
    ['bach-bwv1050.mid', 'none'],
    ['mendelssohn-op61.mid', 'none'],
    ['mozart-k417.mid', 'none'],
    ['mozart-k191.mid', 'none'],
    ['pachelbel-p37.mid', 'none'],
    ['beethoven-5-4.mid', 'none'],
    ['beethoven-7-4.mid', 'none'],
    ['beethoven-6-1.mid', 'none'],
  ]);

  it.each(demos.map((d) => d.file))('gives %s its soloist with each section size', (file) => {
    const bytes = demos.find((d) => d.file === file)?.bytes ?? new Uint8Array();
    expect(expected.has(file)).toBe(true);
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      expect(soloistOf(scoreOf(bytes, size)), size).toBe(expected.get(file));
    }
  });

  it('finds the K. 315 flute with a margin, and no other seat that leads', () => {
    for (const demo of demos) {
      const { seats, notes, durationSec } = scoreOf(demo.bytes, 'one-per-part');
      // With "One per part", each seat has one player for each simultaneous note.
      const voiced = seats.map((seat) => ({ ...seat, voices: seat.playerCount, perVoice: true }));
      measureSoloists(voiced, notes, durationSec).forEach((m, i) => {
        if (!m || seats[i]?.section === 'piano') {
          return;
        }
        const flute = demo.file === 'mozart-k315.mid' && seats[i]?.section === 'flute';
        expect(passesSoloistRule(m), `${demo.file} seat ${i}`).toBe(flute);
        if (flute) {
          expect(m.coverage).toBeGreaterThan(0.7);
          expect(m.above).toBeGreaterThan(0.85);
          expect(m.accompanied).toBeGreaterThan(0.85);
        }
      });
    }
  });
});
