import { describe, expect, it } from 'vitest';

import { noteOff, noteOn, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestEvent, TestFile } from '../midi/test-smf.ts';
import { CONDUCTOR } from '../models/cast.ts';
import { boneIndex } from '../models/rig.ts';
import { scoreOf } from '../score/test-score.ts';
import type { SectionId } from '../score/types.ts';
import { CUE_MOTION, CUE_RULES, findEntries, handWeight, lookWeight } from './cues.ts';
import type { Cue, CueTrack } from './cues.ts';
import { noteLoudness } from './loudness.ts';
import { ofConductor, sceneOf } from './test-scene.ts';
import type { TestScene } from './test-scene.ts';

/** The GM program of each section that the tests use. */
const PROGRAMS = {
  violin: 40,
  viola: 41,
  cello: 42,
  contrabass: 43,
  flute: 73,
  horn: 60,
} as const satisfies Partial<Record<SectionId, number>>;

/** One part of a test file: a section on its own channel, with notes as [start, end, velocity]. */
interface Part {
  readonly section: keyof typeof PROGRAMS;
  /** Ticks of 480 to a quarter note, and the velocity of each note. */
  readonly notes: readonly (readonly [start: number, end: number, velocity?: number])[];
}

/** A quarter note: 0.5 s at 120 BPM. A bar of 4/4 is 1920 ticks, 2 s. */
const Q = 480;

/**
 * Makes a test file of parts, one channel for each part.
 *
 * @param parts The parts.
 * @param bpm The quarter tempo.
 * @param signature The time signature.
 * @returns The file.
 */
function fileOf(
  parts: readonly Part[],
  bpm = 120,
  signature: readonly [number, number] = [4, 4],
): TestFile {
  return {
    tracks: [
      [tempo(0, bpm), timeSignature(0, signature[0], signature[1])],
      ...parts.map((part, channel): TestEvent[] =>
        track(
          [programChange(0, channel, PROGRAMS[part.section])],
          ...part.notes.map(([start, end, velocity = 64]) => [
            noteOn(start, channel, 60 + channel, velocity),
            noteOff(end, channel, 60 + channel),
          ]),
        ),
      ),
    ],
  };
}

/** A part that holds one long note, so that the music has no general rest. */
function held(section: Part['section'], end = 40 * Q): Part {
  return { section, notes: [[0, end]] };
}

/**
 * Gives the entries of a test file as "start section".
 *
 * @param file The file.
 * @returns The entries.
 */
function entriesOf(file: TestFile): string[] {
  const score = scoreOf(file);
  return findEntries(score.beats, score.notes, noteLoudness(score), () => true).map(
    (e) => `${e.start} ${score.seats[e.seatIndex]?.section}`,
  );
}

/** The scene of a test file and the cues of its conductor. */
interface SceneCues {
  readonly scene: TestScene;
  readonly track: CueTrack;
}

/**
 * Gives the cues of a test file with the real layout.
 *
 * @param file The file.
 * @returns The scene and its cues.
 */
function cuesOf(file: TestFile): SceneCues {
  const scene = sceneOf(file, 1, 'full');
  const note = ofConductor(scene.plan.conductor).note;
  if (note.family !== 'conductor') {
    throw new Error('The conductor has the conductor layer.');
  }
  return { scene, track: note.cues };
}

/**
 * Describes a cue as "landing kind sections".
 *
 * @param scene The scene of the cue.
 * @param cue The cue.
 * @returns The text.
 */
function describeCue(scene: TestScene, cue: Cue): string {
  const sections = cue.seats.map((s) => scene.score.seats[s]?.section).join('+');
  return `${cue.landSec} ${cue.kind} ${sections}`;
}

function describeAll(file: TestFile): string[] {
  const { scene, track: cues } = cuesOf(file);
  return cues.cues.map((cue) => describeCue(scene, cue));
}

describe('findEntries (design 5.4)', () => {
  it('finds the first note of each seat and each note after a rest of one bar', () => {
    // The violins rest 2.02 s (one bar of 2 s), then 1.52 s.
    const file = fileOf([
      {
        section: 'violin',
        notes: [
          [0, 1900],
          [8 * Q, 8 * Q + 1900],
          [15 * Q, 16 * Q],
        ],
      },
      held('cello'),
    ]);
    expect(entriesOf(file)).toEqual(['0 violin', '0 cello', '4 violin']);
  });

  it('needs at least 1.2 s at a fast tempo and at most 3 s at a slow tempo', () => {
    // 2/4 at 192: a bar of one beat is 0.625 s. The rests are 1.09 s and 1.25 s.
    const fast = fileOf(
      [
        {
          section: 'violin',
          notes: [
            [0, Q],
            [2160, 2640],
            [4560, 5040],
          ],
        },
        held('cello', 9000),
      ],
      192,
      [2, 4],
    );
    expect(entriesOf(fast)).toEqual(['0 violin', '0 cello', '2.96875 violin']);
    // 4/4 at 50: a bar is 4.8 s. The rests are 3.6 s and 2.4 s.
    const slow = fileOf(
      [
        {
          section: 'violin',
          notes: [
            [0, Q],
            [4 * Q, 5 * Q],
            [7 * Q, 8 * Q],
          ],
        },
        held('cello'),
      ],
      50,
    );
    expect(entriesOf(slow)).toEqual(['0 violin', '0 cello', '4.8 violin']);
    expect([CUE_RULES.minRestSec, CUE_RULES.maxRestSec]).toEqual([1.2, 3]);
  });

  it('finds each seat that starts again after a general rest of 0.75 beats', () => {
    // All seats rest one beat (0.5 s) at 2 s, and half a beat (0.25 s) at 4.5 s.
    const notes = [
      [0, 4 * Q],
      [5 * Q, 9 * Q],
      [9.5 * Q, 12 * Q],
    ] as const;
    const file = fileOf([
      { section: 'violin', notes },
      { section: 'cello', notes },
    ]);
    expect(entriesOf(file)).toEqual(['0 violin', '0 cello', '2.5 violin', '2.5 cello']);
    expect(CUE_RULES.generalRestBeats).toBe(0.75);
  });
});

describe('findCues (design 5.4)', () => {
  it('gives the entries at the song start the downbeat of the count-in', () => {
    const { scene, track: cues } = cuesOf(
      fileOf([
        { section: 'violin', notes: [[Q / 2, Q]] },
        { section: 'cello', notes: [[Q / 2, Q]] },
      ]),
    );
    const [first] = cues.cues;
    expect(first && describeCue(scene, first)).toBe('0 baton violin+cello');
    expect(first?.entrySec).toBe(0.25);
    expect(first?.batonLift).toBe(0);
  });

  it('groups the entries of one family into one cue to the middle of its players', () => {
    const file = fileOf([
      held('contrabass'),
      { section: 'violin', notes: [[8 * Q, 12 * Q]] },
      { section: 'violin', notes: [[8 * Q, 12 * Q]] },
      { section: 'flute', notes: [[16 * Q, 20 * Q]] },
    ]);
    const { scene, track: cues } = cuesOf(file);
    expect(scene.score.seats.map((s) => s.section)).toEqual([
      'violin',
      'violin',
      'contrabass',
      'flute',
    ]);
    const cue = cues.cues[1];
    expect(cue && describeCue(scene, cue)).toBe('4 hand violin+violin');
    // The turn goes to the middle of the eight violins, at the left of the conductor.
    const { layout } = scene;
    const bear = scene.models.get(CONDUCTOR.species, CONDUCTOR.instrument);
    const eyes = bear.skeleton.positions[boneIndex('head')] ?? [0, 0, 0];
    const violins = layout.players.filter((p) => p.cast.seatIndex < 2);
    const x = violins.reduce((sum, p) => sum + p.position[0], 0) / violins.length;
    const z = violins.reduce((sum, p) => sum + p.position[2], 0) / violins.length;
    const [cx, , cz] = ofConductor(layout.conductor).position;
    const turn = Math.atan2(-(x - cx - eyes[0]), -(z - cz - eyes[2]));
    expect(turn).toBeGreaterThan(0.3);
    expect((cue?.torsoYaw ?? 0) + (cue?.headYaw ?? 0)).toBeCloseTo(turn, 9);
    expect(cue?.torsoYaw).toBeCloseTo(CUE_MOTION.torsoPart * turn, 9);
  });

  it('gives the cue of a moment to the loudest family', () => {
    // The held violins make the group larger than a chamber group, which has no conductor.
    const file = fileOf([
      held('contrabass'),
      held('violin'),
      { section: 'flute', notes: [[8 * Q, 12 * Q, 50]] },
      { section: 'horn', notes: [[8 * Q, 12 * Q, 90]] },
    ]);
    expect(describeAll(file).slice(1)).toEqual(['4 hand horn']);
  });

  it('keeps the cue with the higher priority of two cues less than 1.5 s apart', () => {
    // The held violins make the group larger than a chamber group, which has no conductor.
    const near = fileOf([
      held('contrabass'),
      held('violin'),
      { section: 'flute', notes: [[8 * Q, 12 * Q, 50]] },
      { section: 'horn', notes: [[10 * Q, 14 * Q, 90]] },
    ]);
    expect(describeAll(near).slice(1)).toEqual(['5 hand horn']);
    const apart = fileOf([
      held('contrabass'),
      held('violin'),
      { section: 'flute', notes: [[8 * Q, 12 * Q, 50]] },
      { section: 'horn', notes: [[11 * Q, 14 * Q, 90]] },
    ]);
    expect(describeAll(apart).slice(1)).toEqual(['4 hand flute', '5.5 hand horn']);
    expect(CUE_RULES.gapSec).toBe(1.5);
  });

  it('gives no cue when most other seats play through the last two bars', () => {
    const flute: Part = {
      section: 'flute',
      notes: [
        [0, Q],
        [12 * Q, 16 * Q],
      ],
    };
    const dense = fileOf([held('violin'), held('violin'), held('viola'), held('cello'), flute]);
    expect(describeAll(dense).slice(1)).toEqual([]);
    // Two of the four other seats rest from 2 s, so the flutes at 6 s get the cue.
    const resting: Part = { section: 'cello', notes: [[0, 4 * Q]] };
    const light = fileOf([
      held('violin'),
      held('violin'),
      { ...resting, section: 'viola' },
      resting,
      flute,
    ]);
    expect(describeAll(light).slice(1)).toEqual(['6 hand flute']);
    expect([CUE_RULES.denseBars, CUE_RULES.busyCover, CUE_RULES.denseShare]).toEqual([
      2, 0.8, 0.75,
    ]);
  });

  it('cues a tutti with the baton, to all seats that enter', () => {
    const notes = [
      [0, Q],
      [12 * Q, 16 * Q],
    ] as const;
    const file = fileOf([
      { section: 'violin', notes },
      { section: 'viola', notes },
      { section: 'cello', notes },
      { section: 'flute', notes },
      { section: 'horn', notes: [[0, 16 * Q]] },
    ]);
    expect(describeAll(file).slice(1)).toEqual(['6 baton violin+viola+cello+flute']);
  });

  it('cues a strong entry with the baton on a beat, and with the left hand off the beat', () => {
    // The held violins make the group larger than a chamber group, which has no conductor.
    const file = fileOf([
      held('contrabass'),
      held('violin'),
      {
        section: 'flute',
        notes: [
          [8 * Q, 10 * Q, 120],
          [16.5 * Q, 18 * Q, 120],
        ],
      },
    ]);
    const { scene, track: cues } = cuesOf(file);
    expect(cues.cues.slice(1).map((c) => describeCue(scene, c))).toEqual([
      '4 baton flute',
      '8.25 hand flute',
    ]);
    // The arc into the beat of the baton cue is higher by the boost of a baton cue.
    const note = ofConductor(scene.plan.conductor).note;
    const arcs = note.family === 'conductor' ? note.baton.arcs : new Float64Array(0);
    expect(cues.cues[1]?.batonLift).toBeCloseTo(CUE_MOTION.batonBoost * (arcs[8] ?? 0), 12);
    expect(CUE_RULES.loud).toBe(0.6);
  });

  it('cues a section far to the right with the baton on a beat', () => {
    // With the full strings, the cellos sit 62° or more to the right (design 4.5).
    const file = fileOf([
      { section: 'violin', notes: [[0, Q]] },
      { section: 'violin', notes: [[0, Q]] },
      { section: 'viola', notes: [[0, Q]] },
      held('contrabass'),
      {
        section: 'cello',
        notes: [
          [8 * Q, 10 * Q],
          [16.5 * Q, 18 * Q],
        ],
      },
    ]);
    const { scene, track: cues } = cuesOf(file);
    expect(cues.cues.slice(1).map((c) => describeCue(scene, c))).toEqual([
      '4 baton cello',
      '8.25 hand cello',
    ]);
    // The left hand points no further right than the front of the upper body, and at least 25°
    // to the left of the front of the bear.
    const hand = cues.cues[2];
    expect(hand?.handYaw).toBeCloseTo(Math.max(hand?.torsoYaw ?? 0, CUE_MOTION.handLeft), 12);
    expect(hand?.handYaw).toBeCloseTo(CUE_MOTION.handLeft, 12);
    expect((hand?.torsoYaw ?? 0) + (hand?.headYaw ?? 0)).toBeLessThan(-CUE_RULES.batonRight);
  });
});

describe('the times of a cue (design 5.4)', () => {
  // The held violins make the group larger than a chamber group, which has no conductor.
  const { track: cues } = cuesOf(
    fileOf([held('contrabass'), held('violin'), { section: 'flute', notes: [[8 * Q, 12 * Q]] }]),
  );
  const cue = cues.cues[1];
  if (!cue) {
    throw new Error('The flutes get a cue.');
  }

  it('turns the head and the upper body to the section one beat before the landing', () => {
    // The beat is 0.5 s, so the turn takes 2.9 s to 3.5 s.
    expect(cue.landSec).toBe(4);
    expect(lookWeight(cue, 2.89)).toBe(0);
    expect(lookWeight(cue, 3.2)).toBeCloseTo(0.5, 9);
    expect(lookWeight(cue, 3.5)).toBe(1);
    // The eyes stay on the section for 0.6 s after the landing, then turn back in 0.6 s.
    expect(lookWeight(cue, 4.6)).toBe(1);
    expect(lookWeight(cue, 4.9)).toBeCloseTo(0.5, 9);
    expect(lookWeight(cue, 5.2)).toBe(0);
  });

  it('raises the left hand before the preparation, and holds it after the landing', () => {
    expect(handWeight(cue, 2.99)).toBe(0);
    expect(handWeight(cue, 3.25)).toBeCloseTo(0.5, 9);
    expect(handWeight(cue, 3.5)).toBe(1);
    expect(handWeight(cue, 4.3)).toBe(1);
    expect(handWeight(cue, 4.6)).toBeCloseTo(0.5, 9);
    expect(handWeight(cue, 4.9)).toBe(0);
  });
});
