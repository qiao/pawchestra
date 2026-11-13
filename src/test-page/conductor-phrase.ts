import type { PartNote, PhrasePart } from './phrases.ts';

/** The time of one beat at 120 BPM, in seconds. A bar of 4/4 has 4 beats: 2 s. */
const BEAT = 0.5;

/** The length of a staccato note, in seconds: less than a third of a beat. */
const STACCATO = 0.15;

/**
 * The part of the step that a legato note sounds. A note that ends at the start of the next note
 * counts as a second voice, and the score rules then give the part a second player (design 3.8).
 */
const LEGATO = 0.95;

/** The velocities of the dynamics of the phrase: piano, mezzo forte, forte, and the accent. */
const VELOCITY = { p: 40, mf: 75, f: 108, accent: 127 } as const;

/**
 * Makes notes that follow each other at a fixed step, with a velocity that goes in a straight
 * line from the first note to the last note.
 *
 * @param start The start of the first note, in seconds.
 * @param step The time from one note to the next, in seconds.
 * @param keys The keys of the notes.
 * @param velocities The velocity of the first note and of the last note.
 * @param length The length of each note, in seconds. The legato part of the step by default.
 * @returns The notes.
 */
function line(
  start: number,
  step: number,
  keys: readonly number[],
  velocities: readonly [from: number, to: number],
  length = LEGATO * step,
): PartNote[] {
  const [from, to] = velocities;
  const last = Math.max(1, keys.length - 1);
  return keys.map((key, i) => ({
    start: start + i * step,
    length,
    key,
    velocity: Math.round(from + ((to - from) * i) / last),
  }));
}

/**
 * Makes the bars 5 and 6 of a part: staccato quarter notes in forte, with an accent on the first
 * note.
 *
 * @param keys The keys of the 8 notes.
 * @returns The notes.
 */
function forteBars(keys: readonly number[]): PartNote[] {
  const [first, ...rest] = line(8, BEAT, keys, [VELOCITY.f, VELOCITY.f], STACCATO);
  return first ? [{ ...first, velocity: VELOCITY.accent }, ...rest] : [];
}

/**
 * Makes the bars 3 to 8 of a part: the crescendo from its entry, the forte, the diminuendo, and
 * the final chord.
 *
 * @param entry The start of the first note of the crescendo: 4 s, or later for a later entry.
 * @param keys The 7 legato quarter notes of the crescendo from 4 s, the 8 staccato quarter notes
 *   of the forte, the 4 legato quarter notes of the diminuendo, and the key of the final chord.
 * @returns The notes.
 */
function partFrom(
  entry: number,
  keys: readonly [
    rise: readonly number[],
    forte: readonly number[],
    fall: readonly number[],
    last: number,
  ],
): PartNote[] {
  const [rise, forte, fall, last] = keys;
  return [
    ...line(4, BEAT, rise, [VELOCITY.p + 10, VELOCITY.f - 8]).filter((note) => note.start >= entry),
    ...forteBars(forte),
    ...line(12, BEAT, fall, [VELOCITY.mf + 10, VELOCITY.p + 5]),
    { start: 14, length: 2.5, key: last, velocity: VELOCITY.mf },
  ];
}

/**
 * Gives the test phrase of the conductor (design 7.1, "Test page"): 8 bars of 4/4 at 120 BPM for
 * six sections, so that the conductor shows each gesture that it reads from the score (design
 * 5.4). Six players make an orchestra with a conductor. A group of five or fewer has none (4.2).
 *
 * - Bars 1 and 2: the violin and the cello play legato in piano. The beat pattern is small and
 *   low, and the body leans in.
 * - Bars 3 and 4: the viola and the flute enter at 4 s, and the contrabass at 6 s. The left hand
 *   cues each entry. All parts play a crescendo in legato quarter notes, and the left hand
 *   rises. A general rest on the last beat gives the breath.
 * - Bars 5 and 6: all parts play forte in staccato quarter notes, with an accent on the first
 *   note. The horn enters there, and the baton cues the tutti.
 * - Bar 7: a diminuendo in legato quarter notes. The left hand comes down.
 * - Bar 8: the final chord of all parts, and the left hand cues the horn again. The baton holds
 *   the chord, and the conductor cuts it off.
 *
 * @returns The parts, one player for each part.
 */
export function conductorPhrase(): PhrasePart[] {
  const piano = [VELOCITY.p, VELOCITY.p] as const;
  return [
    {
      instrument: 'violin',
      notes: [
        ...line(0, 2 * BEAT, [76, 74, 72, 74], piano),
        ...partFrom(4, [
          [76, 77, 79, 81, 83, 84, 86],
          [88, 84, 79, 84, 86, 83, 79, 83],
          [84, 83, 81, 79],
          76,
        ]),
      ],
    },
    {
      instrument: 'viola',
      notes: partFrom(4, [
        [60, 62, 64, 65, 67, 69, 71],
        [72, 67, 64, 67, 71, 67, 62, 67],
        [69, 67, 65, 64],
        67,
      ]),
    },
    {
      instrument: 'cello',
      notes: [
        ...line(0, 4 * BEAT, [48, 43], piano),
        ...partFrom(4, [
          [48, 50, 52, 53, 55, 57, 59],
          [48, 55, 52, 55, 43, 50, 47, 50],
          [53, 55, 53, 55],
          48,
        ]),
      ],
    },
    {
      instrument: 'contrabass',
      notes: partFrom(6, [
        [36, 36, 40, 40, 43, 43, 47],
        [36, 36, 43, 43, 31, 31, 35, 35],
        [41, 43, 41, 43],
        36,
      ]),
    },
    {
      instrument: 'flute',
      notes: partFrom(4, [
        [79, 81, 83, 84, 86, 88, 89],
        [91, 88, 84, 88, 89, 86, 83, 86],
        [88, 86, 84, 83],
        84,
      ]),
    },
    {
      instrument: 'horn',
      notes: [
        ...forteBars([67, 67, 67, 67, 62, 62, 62, 62]),
        { start: 14, length: 2.5, key: 64, velocity: VELOCITY.mf },
      ],
    },
  ];
}
