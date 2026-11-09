import { describe, expect, it } from 'vitest';

import { patchedDemo } from '../../tools/patch-demos.ts';
import { note, port, programChange, track } from '../midi/test-smf.ts';
import { scoreOf } from '../score/test-score.ts';
import type { Score, SectionSize } from '../score/types.ts';
import { layoutScene } from '../models/layout-scene.ts';
import { ModelCache } from '../models/model-cache.ts';
import {
  NO_ANIMAL_TEXT,
  animalText,
  keyboardName,
  listText,
  playerCounts,
  seatNames,
  seatRows,
  sourceLine,
} from './seat-text.ts';

/**
 * Gives the seat names of a score, with the player counts of its layout and its soloist.
 *
 * @param score The score.
 * @returns One name for each seat.
 */
function namesOf(score: Score): string[] {
  const casts = layoutScene(score, new ModelCache()).players.map((player) => player.cast);
  return seatNames(score.seats, playerCounts(casts, score.seats.length), score.soloist);
}

/**
 * Builds the score of a demo after `demos/patches.json`.
 *
 * @param file The file name of the demo, for example "mozart-k315.mid".
 * @param sectionSize The section size.
 * @returns The score.
 */
async function demoScore(file: string, sectionSize: SectionSize = 'auto'): Promise<Score> {
  return scoreOf((await patchedDemo(file)).bytes, sectionSize);
}

describe('listText (design 2.8)', () => {
  it('joins two items with "and", and three or more with commas and "and"', () => {
    expect(listText(['4'])).toBe('4');
    expect(listText(['4', '5'])).toBe('4 and 5');
    expect(listText(['1', '2', '9'])).toBe('1, 2, and 9');
  });
});

describe('seatNames (design 2.8)', () => {
  it('numbers the seats of a section with more than one seat, from 1', () => {
    const score = scoreOf({
      tracks: [
        track([programChange(0, 0, 40)], note(0, 0, 76)),
        track([programChange(0, 1, 40)], note(0, 1, 72)),
        track([programChange(0, 2, 41)], note(0, 2, 60)),
        track([programChange(0, 3, 80)], note(0, 3, 60)),
      ],
    });
    expect(seatNames(score.seats, [4, 4, 3, 0], null)).toEqual([
      'Violins 1',
      'Violins 2',
      'Violas',
      'Other sounds',
    ]);
  });
});

describe('the name of a seat with one player (audit 2026-10-06-ux-design-2, N20)', () => {
  it('uses the singular, and keeps the number of the section', () => {
    const score = scoreOf({
      tracks: [
        track([programChange(0, 0, 40)], note(0, 0, 76)),
        track([programChange(0, 1, 40)], note(0, 1, 72)),
        track([programChange(0, 2, 73)], note(0, 2, 72)),
        track([programChange(0, 3, 52)], note(0, 3, 60)),
      ],
    });
    expect(seatNames(score.seats, [1, 4, 1, 1], null)).toEqual([
      'Violin 1',
      'Violins 2',
      'Flute',
      'Voice',
    ]);
  });

  it('names the soloist of K. 315 "Flute soloist"', async () => {
    const score = await demoScore('mozart-k315.mid');
    expect(score.soloist).not.toBeNull();
    const names = namesOf(score);
    expect(names[score.soloist ?? -1]).toBe('Flute soloist');
  });

  it('keeps the keyboard name of a soloist of the section "piano"', () => {
    const score = scoreOf({ tracks: [track([programChange(0, 0, 8)], note(0, 0, 76))] });
    expect(seatNames(score.seats, [1], 0)).toEqual(['Celesta']);
  });

  it('uses the singular for the cello of K. 525 in "One per part"', async () => {
    const score = await demoScore('mozart-k525.mid', 'one-per-part');
    const names = namesOf(score);
    expect(names).toContain('Cello');
    expect(names).not.toContain('Cellos');
  });
});

describe('the names of the keyboard seats (audit 2026-10-05-ux-design, DR2)', () => {
  it('names a seat of the section "piano" after its first program', () => {
    expect([0, 5, 6, 7, 8, 16, 19, 21, 22, 23].map(keyboardName)).toEqual([
      'Piano',
      'Piano',
      'Harpsichord',
      'Clavinet',
      'Celesta',
      'Organ',
      'Organ',
      'Accordion',
      'Harmonica',
      'Accordion',
    ]);
  });

  it('gives the celesta of the Boulanger demo and the harpsichord of the Bach demo', async () => {
    const boulanger = namesOf(await demoScore('boulanger-matin.mid'));
    expect(boulanger).toContain('Celesta');
    expect(boulanger).not.toContain('Piano');
    expect(namesOf(await demoScore('bach-bwv1048.mid'))).toContain('Harpsichord');
  });

  it('takes the first program of a pianist who plays several keyboards', () => {
    // The pianist plays all piano channels (3.7).
    const score = scoreOf({
      tracks: [
        track([programChange(0, 0, 8)], note(0, 0, 76)),
        track([programChange(0, 1, 6)], note(480, 1, 72)),
      ],
    });
    expect(seatNames(score.seats, [1], null)).toEqual(['Celesta']);
  });
});

describe('sourceLine (design 2.8)', () => {
  it('names one source with the channel from 1 and the port from 0', () => {
    const score = scoreOf({ tracks: [track([programChange(0, 7, 40)], note(0, 7, 76))] });
    expect(score.seats.map(sourceLine)).toEqual(['Port 0, channel 8, program 40']);
  });

  it('names the programs of a seat in the order of first use', () => {
    const score = scoreOf({
      tracks: [
        track(
          [programChange(0, 11, 45)],
          note(0, 11, 76),
          [programChange(480, 11, 40)],
          note(480, 11, 76),
        ),
      ],
    });
    expect(score.seats.map(sourceLine)).toEqual(['Port 0, channel 12, programs 45 and 40']);
  });

  it('names several channels of one port, with commas and "and" for three', () => {
    const score = scoreOf({
      tracks: [
        track(note(0, 0, 60)),
        track(note(0, 1, 64)),
        track(note(0, 8, 67)),
        track([programChange(0, 3, 40)], note(0, 3, 76), [programChange(0, 4, 40)], note(0, 4, 79)),
      ],
    });
    // The pianist plays all piano channels (3.7). One track with two violin channels forms one
    // seat (3.7, merge rule for articulation channels).
    expect(score.seats.map(sourceLine)).toEqual([
      'Port 0, channels 4 and 5, program 40',
      'Port 0, channels 1, 2, and 9, program 0',
    ]);
  });

  it('names the port of each source when a seat has several ports', () => {
    const score = scoreOf({
      tracks: [track([port(0)], note(0, 3, 60)), track([port(1)], note(0, 1, 64))],
    });
    expect(score.seats.map(sourceLine)).toEqual(['Port 0 channel 4, port 1 channel 2, program 0']);
  });

  it('names the kit of a rhythm channel, also next to the program of a melodic source', () => {
    const drums = scoreOf({ tracks: [track([programChange(0, 9, 48)], note(0, 9, 36))] });
    expect(drums.seats.map(sourceLine)).toEqual(['Port 0, channel 10, kit 48']);
    const timpani = scoreOf({
      tracks: [
        track([programChange(0, 6, 47)], note(0, 6, 45)),
        track([programChange(0, 9, 48)], note(480, 9, 41)),
      ],
    });
    expect(timpani.seats.map(sourceLine)).toEqual([
      'Port 0, channels 7 and 10, program 47, kit 48',
    ]);
  });

  it('names only the programs and the kits of the sound-only seat', () => {
    const score = scoreOf({
      tracks: [
        track(
          [programChange(0, 2, 80)],
          note(0, 2, 60),
          [programChange(480, 2, 81)],
          note(480, 2, 60),
        ),
      ],
    });
    expect(score.seats.map(sourceLine)).toEqual(['Programs 80 and 81']);
  });

  it('gives the rows of the default demo that the prototype shows', async () => {
    const score = await demoScore('boulanger-matin.mid');
    const names = namesOf(score);
    const rows = score.seats.map((seat, i) => `${names[i]}: ${sourceLine(seat)}`);
    expect(rows.slice(0, 5)).toEqual([
      'Violins 1: Port 0, channel 12, programs 40 and 45',
      'Violins 2: Port 0, channel 13, programs 40 and 45',
      'Violas: Port 0, channel 14, programs 41 and 45',
      'Cellos: Port 0, channel 15, programs 45 and 42',
      'Contrabasses: Port 0, channel 16, programs 43 and 32',
    ]);
    expect(rows.at(-1)).toBe('Percussion: Port 0, channel 10, kit 48');
  });
});

describe('seatRows (design 2.8)', () => {
  it('gives the dot the fur color of the species of the seat, and no color to other sounds', () => {
    const score = scoreOf({
      tracks: [
        track([programChange(0, 0, 40)], note(0, 0, 76)),
        track([programChange(0, 1, 40)], note(0, 1, 72)),
        track([programChange(0, 3, 80)], note(0, 3, 60)),
      ],
    });
    // The rabbit plays the first violins and the red fox the second violins (4.3).
    expect(seatRows(score.seats, [1, 3, 0], null)).toMatchObject([
      {
        name: 'Violin 1',
        animals: '1 rabbit',
        source: 'Port 0, channel 1, program 40',
        color: '#ece6dc',
      },
      {
        name: 'Violins 2',
        animals: '3 red foxes',
        source: 'Port 0, channel 2, program 40',
        color: '#bd4a00',
      },
      { name: 'Other sounds', animals: NO_ANIMAL_TEXT, source: 'Program 80', color: null },
    ]);
  });
});

describe('the seat rows of a chamber group (design 4.2)', () => {
  it('names no soloist, because the soloist rule does not apply', () => {
    // A flute and three strings: four players, so the group has no conductor.
    const score = scoreOf(
      {
        tracks: [73, 40, 41, 42].map((program, channel) =>
          track([programChange(0, channel, program)], note(0, channel, 60 + channel)),
        ),
      },
      'one-per-part',
    );
    const counts = score.seats.map((seat) => seat.playerCount);
    expect(counts).toEqual([1, 1, 1, 1]);
    const flute = score.seats.findIndex((seat) => seat.section === 'flute');
    expect(seatNames(score.seats, counts, flute)[flute]).toBe('Flute soloist');
    expect(seatRows(score.seats, counts, flute)[flute]?.name).toBe('Flute');
  });
});

describe('the animal line of a seat row (audit 2026-10-05-ux-design, DR1)', () => {
  it('names the count and the species, with the plural of each species', () => {
    expect(animalText('rabbit', 5)).toBe('5 rabbits');
    expect(animalText('deer', 1)).toBe('1 deer');
    expect(animalText('deer', 2)).toBe('2 deer');
    expect(animalText('mouse', 2)).toBe('2 mice');
    expect(animalText('wolf', 3)).toBe('3 wolves');
    expect(animalText(null, 0)).toBe('No animal');
  });

  it('counts the players of each seat in the layout of the default demo', async () => {
    const score = await demoScore('boulanger-matin.mid');
    const casts = layoutScene(score, new ModelCache()).players.map((player) => player.cast);
    const counts = playerCounts(casts, score.seats.length);
    const rows = seatRows(score.seats, counts, score.soloist);
    const first = rows[0];
    expect(first?.name).toBe('Violins 1');
    expect(first?.animals).toMatch(/^\d+ rabbits$/u);
    expect(rows.find((row) => row.name === 'Harp')?.animals).toBe('1 deer');
    expect(counts.reduce((a, b) => a + b, 0)).toBe(casts.length);
  });
});
