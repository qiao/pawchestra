import { describe, expect, it } from 'vitest';

import { chord, port, programChange, tempo, track } from '../midi/test-smf.ts';
import type { TestEvent, TestFile } from '../midi/test-smf.ts';
import { assignPlayersSteps } from './players.ts';
import type { PlayerAssignment } from './players.ts';
import { assignSeats } from './seats.ts';
import { runAll } from './steps.ts';
import { timelineOf } from './test-score.ts';
import type { SectionSize } from './types.ts';

function cast(file: TestFile, sectionSize: SectionSize = 'auto'): PlayerAssignment {
  const timeline = timelineOf(file);
  return runAll(assignPlayersSteps(timeline, assignSeats(timeline), sectionSize));
}

/** Makes a part: a program change at tick 0, then chords of quarter notes, one after another. */
function part(
  channel: number,
  program: number,
  ...chords: readonly (readonly number[])[]
): TestEvent[] {
  return track(
    [programChange(0, channel, program)],
    ...chords.map((keys, i) => chord(i * 480, channel, keys)),
  );
}

/** Lists the player count of each seat as text, for example "violin 4". */
function counts(result: PlayerAssignment): string[] {
  return result.seats.map((seat) => `${seat.section} ${seat.playerCount}`);
}

/** Lists the players of each note of one seat, as `pitch: players`. */
function players(result: PlayerAssignment, seatIndex = 0): string[] {
  const map = new Map<string, number[]>();
  for (const note of result.notes.filter((item) => item.seatIndex === seatIndex)) {
    const key = `${note.startSec} ${note.pitch}`;
    map.set(key, [...(map.get(key) ?? []), note.player]);
  }
  return [...map].map(([key, list]) => `${key.split(' ')[1]}: ${list.join(',')}`);
}

describe('assignPlayersSteps', () => {
  it('gives a woodwind one player for each simultaneous note, highest note first', () => {
    const result = cast({ tracks: [part(0, 73, [72, 76], [74], [71, 79])] });

    expect(counts(result)).toEqual(['flute 2']);
    expect(players(result)).toEqual(['72: 1', '76: 0', '74: 0', '71: 1', '79: 0']);
  });

  it('gives a note the nearest free player while an earlier note still sounds', () => {
    const result = cast({
      tracks: [
        track(
          [programChange(0, 0, 73)],
          chord(0, 0, [72], 1920),
          chord(480, 0, [76]),
          chord(960, 0, [79, 77]),
        ),
      ],
    });

    expect(counts(result)).toEqual(['flute 3']);
    expect(players(result)).toEqual(['72: 0', '76: 1', '79: 1', '77: 2']);
  });

  it('gives the higher free player when two free players are equally near', () => {
    const result = cast({
      tracks: [
        track(
          [programChange(0, 0, 73)],
          chord(0, 0, [79, 72]),
          chord(0, 0, [77], 1920),
          // Rank 1 below the held 77, whose player is 1. Players 0 and 2 are both free.
          chord(960, 0, [75]),
        ),
      ],
    });

    expect(counts(result)).toEqual(['flute 3']);
    expect(players(result)).toEqual(['79: 0', '72: 2', '77: 1', '75: 0']);
  });

  it('counts an overlap of at most 50 ms as one note, for a legato or a grace note', () => {
    // At 120 BPM and 480 ticks for each quarter note, 1 tick is 1/960 s.
    const legato = (overlap: number): TestFile => ({
      tracks: [
        track(
          [tempo(0, 120), programChange(0, 0, 73)],
          chord(0, 0, [72], 480 + overlap),
          chord(480, 0, [74]),
        ),
      ],
    });

    expect(counts(cast(legato(47)))).toEqual(['flute 1']);
    expect(players(cast(legato(47)))).toEqual(['72: 0', '74: 0']);
    expect(counts(cast(legato(49)))).toEqual(['flute 2']);
  });

  it('joins notes that start at most 50 ms apart into one chord (design 3.8)', () => {
    // At 125 BPM and 480 ticks for each quarter note, 1 tick is 1 ms.
    const violins = (starts: readonly number[]): TestFile => ({
      tracks: [
        [tempo(0, 125)],
        track(
          [programChange(0, 0, 40)],
          chord(starts[0] ?? 0, 0, [67], 480),
          chord(starts[1] ?? 0, 0, [74], 480),
          chord(starts[2] ?? 0, 0, [70], 480),
        ),
        part(1, 73, [80]),
      ],
    });
    const rolled = cast(violins([0, 8, 15]));
    const held = rolled.notes.filter((note) => note.seatIndex === 0);

    expect(players(rolled).toSorted()).toEqual(players(cast(violins([0, 0, 0]))).toSorted());
    expect(players(rolled).toSorted()).toEqual(['67: 3', '70: 2', '74: 0,1']);
    for (const note of held) {
      const others = held.filter((other) => other !== note && other.player === note.player);
      expect(others.filter((other) => other.startSec < note.endSec)).toEqual([]);
    }
  });

  it('counts an earlier note for all notes of a rolled chord that it overlaps at the first note', () => {
    // At 125 BPM and 480 ticks for each quarter note, 1 tick is 1 ms. The note 72 overlaps the
    // note 74 by 70 ms, but the note 76 by only 30 ms. It still counts for the full chord.
    const result = cast({
      tracks: [
        track(
          [tempo(0, 125), programChange(0, 0, 73)],
          chord(0, 0, [72], 130),
          chord(60, 0, [74], 1000),
          chord(100, 0, [76], 1000),
        ),
      ],
    });

    expect(counts(result)).toEqual(['flute 3']);
    expect(players(result)).toEqual(['72: 0', '74: 2', '76: 1']);
  });

  it('keeps a grace note 30 ms before a long note in one part', () => {
    const result = cast({
      tracks: [
        track(
          [tempo(0, 125), programChange(0, 0, 73)],
          chord(0, 0, [74], 30),
          chord(30, 0, [72], 1000),
        ),
      ],
    });

    expect(counts(result)).toEqual(['flute 1']);
  });

  it('keeps short notes with the same start in one chord', () => {
    const result = cast({
      tracks: [track([tempo(0, 125), programChange(0, 0, 73)], chord(0, 0, [72, 76], 30))],
    });

    expect(counts(result)).toEqual(['flute 2']);
  });

  it('gives one player to the piano, the harp, the timpani, and the mallets', () => {
    const result = cast({
      tracks: [
        part(0, 0, [60, 64, 67]),
        part(1, 46, [50, 62]),
        part(2, 47, [43, 50]),
        part(3, 13, [72, 76]),
      ],
    });

    expect(counts(result)).toEqual(['harp 1', 'piano 1', 'timpani 1', 'percussion 1']);
    expect(result.notes.every((note) => note.player === 0)).toBe(true);
  });

  it('gives a rhythm channel one player for each key group, in the order of design 3.8', () => {
    const result = cast({
      tracks: [track(chord(0, 9, [49, 81, 45]), chord(480, 9, [36, 54]))],
    });

    expect(counts(result)).toEqual(['timpani 1', 'percussion 3']);
    expect(players(result, 1)).toEqual(['49: 1', '81: 2', '36: 0', '54: 2']);
  });

  it('gives the sound-only seat no players and no player notes (design 3.5)', () => {
    const result = cast({ tracks: [part(0, 81, [60, 64]), part(1, 40, [70])] });

    expect(counts(result)).toEqual(['violin 1', 'sound-only 0']);
    expect(result.notes.map((note) => note.seatIndex)).toEqual([0]);
  });

  it('caps the players of each seat (design 3.8)', () => {
    const result = cast({
      tracks: [
        part(0, 73, [60, 62, 64, 65, 67]),
        part(1, 58, [30, 34]),
        part(2, 60, [50, 52, 54, 55, 57]),
      ],
    });
    const strings = cast({ tracks: [part(0, 40, [55, 57, 59, 60, 62, 64, 65, 67])] });

    expect(counts(result)).toEqual(['flute 3', 'horn 4', 'tuba 1']);
    expect(counts(strings)).toEqual(['violin 6']);
  });

  it.each<readonly [string, number, number]>([
    ['viola', 41, 4],
    ['cello', 42, 4],
    ['contrabass', 43, 3],
    ['oboe', 68, 3],
    ['clarinet', 71, 3],
    ['bassoon', 70, 3],
    ['trumpet', 56, 3],
    ['trombone', 57, 3],
    ['choir', 52, 8],
  ])('caps the players of a %s seat (design 3.8)', (section, program, cap) => {
    const keys = Array.from({ length: 10 }, (...[, i]) => 60 + i);
    const result = cast({ tracks: [part(0, program, keys)] }, 'one-per-part');

    expect(counts(result)).toEqual([`${section} ${cap}`]);
  });

  it('gives the techniques of the programs to the player notes (design 3.5)', () => {
    const file: TestFile = {
      tracks: [
        track(
          [programChange(0, 0, 40)],
          chord(0, 0, [60]),
          [programChange(480, 0, 45)],
          chord(480, 0, [62]),
          [programChange(960, 0, 44)],
          chord(960, 0, [64]),
        ),
      ],
    };
    const result = cast(file, 'one-per-part');

    expect(result.notes.map((note) => note.technique)).toEqual(['normal', 'pizzicato', 'tremolo']);
  });

  it('gives each player note the synth channel of its note on (design 3.2)', () => {
    const file: TestFile = {
      tracks: [
        track(
          [programChange(0, 0, 40), programChange(0, 1, 40)],
          chord(0, 0, [60]),
          chord(0, 1, [64]),
        ),
        [port(1), ...track([programChange(0, 2, 41)], chord(0, 2, [55]))],
      ],
    };
    const result = cast(file, 'one-per-part');

    expect(result.notes.map((note) => [note.pitch, note.synthChannel])).toEqual([
      [60, 0],
      [64, 1],
      [55, 18],
    ]);
  });

  it.each<readonly [string, number, number, boolean]>([
    ['a flute seat', 73, 72, true],
    ['a horn seat', 60, 60, true],
    ['a timpani seat', 47, 45, true],
    ['the contrabass program 43', 43, 40, true],
    ['the ensemble program 48', 48, 60, true],
    ['the ensemble program 49', 49, 60, true],
    ['the synth strings program 50', 50, 60, true],
    ['the synth strings program 51', 51, 60, true],
    ['the tremolo program 44', 44, 60, true],
    ['the pizzicato program 45', 45, 60, true],
    ['the bass guitar program 33', 33, 40, false],
    ['the piano program 0', 0, 60, false],
    ['the choir program 52', 52, 60, false],
  ])('makes a file with %s orchestral: %s', (...[, program, key, orchestral]) => {
    const result = cast({ tracks: [[], part(0, 40, [70]), part(1, program, [key])] });

    expect(result.orchestral).toBe(orchestral);
    expect(result.seats[0]?.playerCount).toBe(orchestral ? 4 : 1);
  });

  it('does not count the Orchestra kit 48 of a rhythm channel as the ensemble program 48', () => {
    const result = cast({
      tracks: [[], part(0, 40, [70]), track([programChange(0, 9, 48)], chord(0, 9, [38]))],
    });

    expect(result.orchestral).toBe(false);
    expect(counts(result)).toEqual(['violin 1', 'percussion 1']);
  });

  it.each<readonly [number, boolean]>([
    [0, false],
    [48, true],
  ])('makes a file with toms of kit %s on a timpani seat orchestral: %s', (kit, orchestral) => {
    const result = cast({
      tracks: [[], part(0, 40, [70, 74]), track([programChange(0, 9, kit)], chord(0, 9, [45]))],
    });

    expect(counts(result)).toEqual(['violin ' + (orchestral ? 4 : 2), 'timpani 1']);
    expect(result.orchestral).toBe(orchestral);
  });

  it('gives the base sizes to the strings and the choir of an orchestral file (design 3.8)', () => {
    const result = cast({
      tracks: [
        [],
        part(0, 40, [70]),
        part(1, 41, [60]),
        part(2, 42, [50]),
        part(3, 43, [40]),
        part(4, 52, [60]),
      ],
    });

    expect(counts(result)).toEqual(['violin 4', 'viola 3', 'cello 3', 'contrabass 2', 'choir 8']);
    expect(players(result)).toEqual(['70: 0,1,2,3']);
  });

  it('follows the section size setting (design 3.8)', () => {
    const orchestral: TestFile = { tracks: [[], part(0, 40, [70, 74]), part(1, 73, [80])] };
    const other: TestFile = { tracks: [part(0, 40, [70, 74], [72])] };

    expect(counts(cast(orchestral, 'auto'))).toEqual(['violin 4', 'flute 1']);
    expect(counts(cast(orchestral, 'one-per-part'))).toEqual(['violin 2', 'flute 1']);
    expect(counts(cast(orchestral, 'full'))).toEqual(['violin 4', 'flute 1']);
    expect(counts(cast(other, 'auto'))).toEqual(['violin 2']);
    expect(counts(cast(other, 'full'))).toEqual(['violin 4']);
    expect(cast(other, 'full').orchestral).toBe(false);
  });

  it('divides the players of a section across the notes of a chord, highest first (divisi)', () => {
    const result = cast({
      tracks: [
        [],
        part(0, 40, [70], [70, 74], [70, 72, 74]),
        part(1, 41, [60, 64]),
        part(2, 73, [80]),
      ],
    });

    expect(players(result, 0)).toEqual([
      '70: 0,1,2,3',
      '70: 2,3',
      '74: 0,1',
      '70: 3',
      '72: 2',
      '74: 0,1',
    ]);
    expect(players(result, 1)).toEqual(['60: 2', '64: 0,1']);
  });

  it('gives a note over a held note the players of its rank (divisi)', () => {
    const result = cast({
      tracks: [
        [],
        track([programChange(0, 0, 40)], chord(0, 0, [70], 1920), chord(480, 0, [74], 960)),
        part(1, 73, [80]),
      ],
    });

    expect(counts(result)).toEqual(['violin 4', 'flute 1']);
    expect(players(result)).toEqual(['70: 0,1,2,3', '74: 0,1']);
  });

  it('divides the players one time for each chord, so two notes of a chord do not share one (divisi)', () => {
    // At 125 BPM, 1 tick is 1 ms. The viola note 60 ends 70 ms after the start of the note 64,
    // and 30 ms after the start of the note 67 of the same rolled chord.
    const result = cast({
      tracks: [
        [],
        track(
          [tempo(0, 125), programChange(0, 0, 41)],
          chord(0, 0, [60], 130),
          chord(60, 0, [64], 1000),
          chord(100, 0, [67], 1000),
        ),
        part(1, 73, [80]),
      ],
    });

    expect(counts(result)).toEqual(['viola 3', 'flute 1']);
    expect(players(result)).toEqual(['60: 0,1,2', '64: 1', '67: 0']);
  });

  it('gives the players of a flute chord of 16,000 notes', () => {
    // A valid file of 96 KB. `score-speed.test.ts` times it.
    const keys = Array.from({ length: 16_000 }, (...[, i]) => 40 + (i % 60));
    const result = cast({
      tracks: [
        [programChange(0, 0, 73), ...chord(0, 0, keys)],
        [programChange(0, 1, 73), ...chord(0, 1, [72])],
      ],
    });

    expect(counts(result)).toEqual(['flute 3', 'flute 1']);
  });

  it('gives a player two notes when a string seat has more notes than players (double stop)', () => {
    const result = cast({ tracks: [[], part(0, 42, [48, 50, 52, 55, 57]), part(1, 73, [80])] });

    expect(counts(result)).toEqual(['cello 3', 'flute 1']);
    expect(players(result)).toEqual(['48: 2', '50: 1', '52: 1', '55: 0', '57: 0']);
  });

  it.each([
    ['viola', 41, ['72: 0,1', '70: 2', '60: 2', '64: 1', '67: 1']],
    ['flute', 73, ['72: 0', '70: 1', '60: 2', '64: 1', '67: 2']],
  ])('counts the held notes when a %s chord divides the players', (section, program, expected) => {
    // The chord has 3 notes and the seat has 3 players, but 5 notes sound.
    const result = cast({
      tracks: [
        [],
        track(
          [programChange(0, 0, program)],
          chord(0, 0, [72, 70], 1920),
          chord(480, 0, [60, 64, 67], 480),
        ),
        part(1, 73, [80]),
      ],
    });

    expect(counts(result)).toEqual([`${section} 3`, 'flute 1']);
    expect(players(result)).toEqual(expected);
  });

  describe('above 60 players (design 3.8)', () => {
    /** Makes one track for each part, with the 15 melodic channels of each port. */
    function tracks(parts: readonly ((channel: number) => TestEvent[])[]): TestEvent[][] {
      const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
      return [
        [],
        ...parts.map((make, i) => track([port(Math.floor(i / 15))], make(melodic[i % 15] ?? 0))),
      ];
    }

    function total(result: PlayerAssignment): number {
      return result.seats.reduce((sum, seat) => sum + seat.playerCount, 0);
    }

    it('removes string players first, from the largest and then the later seat', () => {
      const violins = Array.from(
        { length: 20 },
        () => (channel: number) => part(channel, 40, [70]),
      );
      const result = cast({ tracks: tracks([...violins, (channel) => part(channel, 73, [80])]) });

      expect(total(result)).toBe(60);
      expect(result.seats.map((seat) => seat.playerCount)).toEqual([
        ...Array.from({ length: 19 }, () => 3),
        2,
        1,
      ]);
    });

    it('stops at the size of one player for each part, then removes other players', () => {
      const violins = Array.from(
        { length: 8 },
        () => (channel: number) => part(channel, 40, [70, 74]),
      );
      const flutes = Array.from(
        { length: 16 },
        () => (channel: number) => part(channel, 73, [72, 76, 79]),
      );
      const result = cast({ tracks: tracks([...violins, ...flutes]) });

      expect(total(result)).toBe(60);
      expect(counts(result)).toEqual([
        ...Array.from({ length: 8 }, () => 'violin 2'),
        ...Array.from({ length: 12 }, () => 'flute 3'),
        ...Array.from({ length: 4 }, () => 'flute 2'),
      ]);
    });

    it('excludes the strings and the choir from the largest other seat', () => {
      const violins = Array.from(
        { length: 8 },
        () => (channel: number) => part(channel, 40, [60, 62, 64, 65, 67, 69]),
      );
      const flutes = Array.from(
        { length: 6 },
        () => (channel: number) => part(channel, 73, [72, 76, 79]),
      );
      const result = cast({ tracks: tracks([...violins, ...flutes]) }, 'one-per-part');

      expect(total(result)).toBe(60);
      expect(counts(result)).toEqual([
        ...Array.from({ length: 8 }, () => 'violin 6'),
        ...Array.from({ length: 6 }, () => 'flute 2'),
      ]);
    });

    it('then removes players from the largest seat of any section', () => {
      const violins = Array.from(
        { length: 10 },
        () => (channel: number) => part(channel, 40, [60, 62, 64, 65, 67, 69]),
      );
      const result = cast({ tracks: tracks([...violins, (channel) => part(channel, 0, [60])]) });

      expect(total(result)).toBe(60);
      expect(counts(result)).toEqual([
        ...Array.from({ length: 9 }, () => 'violin 6'),
        'violin 5',
        'piano 1',
      ]);
    });

    it('moves the notes of the seats with the fewest notes to the sound-only seat above 60 seats', () => {
      // 75 violin seats on 5 ports. The first 16 seats have one note, the others two notes.
      const violins = Array.from(
        { length: 75 },
        (...[, i]) =>
          (channel: number) =>
            i < 16 ? part(channel, 40, [70]) : part(channel, 40, [70], [72]),
      );
      const file: TestFile = { tracks: tracks(violins) };

      for (const size of ['auto', 'one-per-part', 'full'] as const) {
        const result = cast(file, size);
        const seated = result.seats.filter((seat) => seat.playerCount > 0);

        expect(seated).toHaveLength(60);
        expect(total(result)).toBeLessThanOrEqual(60);
        expect(result.seats.at(-1)?.section).toBe('sound-only');
      }
      const result = cast(file);
      const moved = result.seats
        .at(-1)
        ?.sources.map((source) => `${source.port}:${source.channel}`);

      // Of the 16 seats with one note, the 15 later seats move. The first seat stays.
      expect(result.seats[0]?.sources).toEqual([{ port: 0, channel: 0 }]);
      expect(moved).toEqual([
        ...[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].map((channel) => `0:${channel}`),
        '1:0',
      ]);
      expect(result.notes.filter((note) => note.seatIndex === 60)).toHaveLength(0);
      expect(result.notes).toHaveLength(1 + 59 * 2);
    });

    it('gives the key groups of a smaller percussion seat to its last player', () => {
      const flutes = Array.from(
        { length: 20 },
        () => (channel: number) => part(channel, 73, [72, 76, 79]),
      );
      const drums = track([port(0)], chord(0, 9, [36, 38, 49, 81]));
      const result = cast({ tracks: [...tracks(flutes), drums] });

      expect(total(result)).toBe(60);
      expect(counts(result).at(-1)).toBe('percussion 2');
      expect(players(result, 20)).toEqual(['36: 0', '38: 1', '49: 1', '81: 1']);
    });
  });
});
