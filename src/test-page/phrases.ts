import { writeSmf } from '../midi/test-smf.ts';
import type { TestEvent } from '../midi/test-smf.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { RHYTHM_CHANNEL } from '../score/drum-map.ts';
import type { TestNote } from '../gallery/notes.ts';
import { TEST_VELOCITY } from '../gallery/plan.ts';

/** An instrument that a player of the test page plays: each instrument except the baton. */
export type PlayedInstrument = Exclude<InstrumentId, 'baton'>;

/**
 * The rest before the first note of each phrase, in seconds. The loop seeks from the end of the
 * phrase to 0, so this rest is also the rest between two repeats.
 */
const LEAD_SEC = 0.5;

/** The ticks of one second: 480 ticks for each quarter note at 120 BPM, a quarter of 0.5 s. */
const TICKS_PER_SEC = 960;

/** The ticks of one quarter note in the test file. */
const TICKS_PER_QUARTER = 480;

/** The tempo meta event of 120 BPM: 500,000 microseconds for each quarter note. */
const TEMPO_120 = [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] as const;

/** The GM bass drum, snare drum, crash cymbal, and open triangle keys (design 3.6). */
const DRUM_KEYS = { bass: 36, snare: 38, crash: 49, triangle: 81 } as const;

/** The MIDI source of an instrument: a GM program on channel 1, or a key of the rhythm channel. */
type PhraseSource =
  | { readonly kind: 'program'; readonly program: number }
  | { readonly kind: 'drum'; readonly key: number };

/**
 * The GM program or the drum key that the score rules give to the section of each instrument
 * (design 3.5, 3.6). The xylophone is the melodic program 13, which the percussion seat plays
 * on the xylophone (design 4.6).
 */
const SOURCES = {
  violin: { kind: 'program', program: 40 },
  viola: { kind: 'program', program: 41 },
  cello: { kind: 'program', program: 42 },
  contrabass: { kind: 'program', program: 43 },
  harp: { kind: 'program', program: 46 },
  piano: { kind: 'program', program: 0 },
  'choir-folder': { kind: 'program', program: 52 },
  flute: { kind: 'program', program: 73 },
  oboe: { kind: 'program', program: 68 },
  clarinet: { kind: 'program', program: 71 },
  bassoon: { kind: 'program', program: 70 },
  horn: { kind: 'program', program: 60 },
  trumpet: { kind: 'program', program: 56 },
  trombone: { kind: 'program', program: 57 },
  tuba: { kind: 'program', program: 58 },
  timpani: { kind: 'program', program: 47 },
  'bass-drum': { kind: 'drum', key: DRUM_KEYS.bass },
  'snare-drum': { kind: 'drum', key: DRUM_KEYS.snare },
  cymbals: { kind: 'drum', key: DRUM_KEYS.crash },
  'small-percussion': { kind: 'drum', key: DRUM_KEYS.triangle },
  xylophone: { kind: 'program', program: 13 },
} as const satisfies Readonly<Record<PlayedInstrument, PhraseSource>>;

/**
 * The keys of the four open strings of each bowed instrument, from the lowest: the violin G3 D4
 * A4 E5, the viola C3 G3 D4 A4, the cello C2 G2 D3 A3, and the contrabass E1 A1 D2 G2.
 */
const OPEN_STRINGS = {
  violin: [55, 62, 69, 76],
  viola: [48, 55, 62, 69],
  cello: [36, 43, 50, 57],
  contrabass: [28, 33, 38, 43],
} as const;

/** The lowest key of the phrase of each wind instrument, a fifth above its lowest note or more. */
const WIND_LOW = {
  flute: 67,
  oboe: 62,
  clarinet: 58,
  bassoon: 41,
  horn: 50,
  trumpet: 60,
  trombone: 45,
  tuba: 33,
} as const;

/**
 * Makes notes that follow each other at a fixed step.
 *
 * @param start The start of the first note, in seconds.
 * @param step The time from one note to the next, in seconds.
 * @param keys The keys of the notes.
 * @param length The length of each note, in seconds. The step by default.
 * @returns The notes.
 */
function run(start: number, step: number, keys: readonly number[], length = step): TestNote[] {
  return keys.map((key, i) => ({ start: start + i * step, length, key }));
}

/**
 * Makes notes that start at the same time: a chord.
 *
 * @param start The start, in seconds.
 * @param length The length, in seconds.
 * @param keys The keys.
 * @returns The notes.
 */
function chord(start: number, length: number, keys: readonly number[]): TestNote[] {
  return keys.map((key) => ({ start, length, key }));
}

/**
 * Makes the phrase of a bowed instrument: a long bow, string crossings over the four strings, a
 * rest, a fast scale on the third string, and a jump to a long high note.
 *
 * @param strings The keys of the open strings, from the lowest.
 * @returns The notes.
 */
function bowedPhrase(strings: readonly [number, number, number, number]): TestNote[] {
  const [g, d, a, e] = strings;
  return [
    ...chord(LEAD_SEC, 1.5, [d + 2]),
    ...run(2, 0.25, [g + 4, d + 4, a + 4, e + 4, a + 4, d + 4, g + 4, d + 4]),
    ...run(4.75, 0.125, [a, a + 2, a + 4, a + 5, a + 7, a + 9, a + 11, a + 12]),
    ...chord(5.75, 0.5, [e + 12]),
    ...chord(6.25, 0.5, [g]),
    ...chord(6.75, 1.25, [e + 7]),
  ];
}

/**
 * Makes the phrase of a wind instrument: a long note, a fast scale up, a rest for a breath, leaps
 * of an octave, and a long note in the high register.
 *
 * @param low The lowest key of the phrase.
 * @returns The notes.
 */
function windPhrase(low: number): TestNote[] {
  return [
    ...chord(LEAD_SEC, 1.5, [low + 7]),
    ...run(
      2,
      0.125,
      [7, 9, 11, 12, 14, 16, 17, 19].map((step) => low + step),
    ),
    ...chord(3, 0.5, [low + 19]),
    ...run(4.5, 0.5, [low, low + 12, low + 5, low + 17]),
    ...chord(6.5, 1.5, [low + 12]),
  ];
}

/**
 * Makes the phrase of the harp: an arpeggio up over three octaves, a chord, a rest, a fast run
 * down, and a jump from the bass to a chord of both hands.
 *
 * @returns The notes.
 */
function harpPhrase(): TestNote[] {
  return [
    ...run(LEAD_SEC, 0.25, [48, 52, 55, 60, 64, 67, 72, 76], 1),
    ...chord(2.5, 1, [48, 55, 60, 64]),
    ...run(4.25, 0.125, [79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60]),
    ...chord(5.75, 0.5, [36]),
    ...chord(6.25, 0.5, [43]),
    ...chord(6.75, 1.25, [48, 72]),
  ];
}

/**
 * Makes the phrase of the piano: a melody over a held bass, a fast scale over a chord, a rest, the
 * hands far apart, an arpeggio over four octaves, and a long chord.
 *
 * @returns The notes.
 */
function pianoPhrase(): TestNote[] {
  return [
    ...chord(LEAD_SEC, 1.5, [48]),
    ...run(LEAD_SEC, 0.5, [64, 67, 72]),
    ...chord(2, 1, [48, 55]),
    ...run(2, 0.125, [72, 74, 76, 77, 79, 81, 83, 84]),
    ...chord(3.75, 0.5, [36, 84]),
    ...chord(4.25, 0.5, [43, 79]),
    ...run(4.75, 0.25, [48, 55, 64, 72, 76, 72, 64, 55]),
    ...chord(6.75, 1.25, [48, 55, 64, 72]),
  ];
}

/**
 * Makes the phrase of the timpani: strokes on two kettles, a faster pattern over all four
 * kettles, a rest, a measured roll at 8 strokes each second, and a last long stroke. The roll
 * stays below 12 strokes each second, because a faster roll sounds harsh.
 *
 * @returns The notes.
 */
function timpaniPhrase(): TestNote[] {
  return [
    ...run(LEAD_SEC, 0.5, [45, 40, 45, 40], 0.4),
    ...run(2.5, 0.25, [50, 45, 50, 45, 55, 50, 45, 40], 0.2),
    ...run(5.5, 0.125, [40, 40, 40, 40, 40, 40, 40, 40]),
    ...chord(6.5, 1.5, [40]),
  ];
}

/**
 * Makes the phrase of one drum key: quarter notes, eighth notes, a rest, sixteenth notes at 8
 * strokes each second, and two last strokes with a rest between them.
 *
 * @param key The drum key.
 * @returns The notes.
 */
function drumPhrase(key: number): TestNote[] {
  return [
    ...run(LEAD_SEC, 0.5, [key, key, key, key], 0.1),
    ...run(2.5, 0.25, [key, key, key, key], 0.1),
    ...run(4.5, 0.125, [key, key, key, key, key, key, key, key], 0.1),
    ...chord(5.5, 0.5, [key]),
    ...chord(6.5, 1.5, [key]),
  ];
}

/**
 * Makes the phrase of the cymbals: a long crash, two short crashes, a rest, three crashes in
 * quarter notes, and a long crash. A pair of cymbals needs time between two crashes.
 *
 * @returns The notes.
 */
function cymbalPhrase(): TestNote[] {
  const key = DRUM_KEYS.crash;
  return [
    ...chord(LEAD_SEC, 1.5, [key]),
    ...run(2, 0.5, [key, key]),
    ...run(4.5, 0.5, [key, key, key]),
    ...chord(6, 2, [key]),
  ];
}

/**
 * Makes the phrase of the xylophone: a broken chord, a fast scale, a rest, leaps over three
 * octaves, and a last note.
 *
 * @returns The notes.
 */
function xylophonePhrase(): TestNote[] {
  return [
    ...run(LEAD_SEC, 0.25, [72, 76, 79, 84, 79, 76, 72, 76]),
    ...run(2.5, 0.125, [72, 74, 76, 77, 79, 81, 83, 84]),
    ...run(4.5, 0.5, [60, 84, 67, 91]),
    ...chord(6.5, 1.5, [72]),
  ];
}

/**
 * Makes the phrase of a singer: a long note, a slow step melody, a rest for a breath, a leap of an
 * octave, and a long last note.
 *
 * @returns The notes.
 */
function choirPhrase(): TestNote[] {
  return [
    ...chord(LEAD_SEC, 2, [64]),
    ...run(2.5, 0.5, [65, 67, 69, 67]),
    ...chord(5.25, 0.75, [60]),
    ...chord(6, 0.5, [72]),
    ...chord(6.5, 1.5, [67]),
  ];
}

/**
 * Gives the test phrase of an instrument (design 7.1, "Test page"). Each phrase shows the
 * technique of the role: long notes, fast notes, string crossings or changes of the register, and
 * rests. Each phrase starts after {@link LEAD_SEC} and lasts about 8 s at 120 BPM.
 *
 * @param instrument The instrument.
 * @returns The notes, in the gallery form of a test note list.
 */
export function phraseOf(instrument: PlayedInstrument): TestNote[] {
  switch (instrument) {
    case 'violin':
    case 'viola':
    case 'cello':
    case 'contrabass':
      return bowedPhrase(OPEN_STRINGS[instrument]);
    case 'flute':
    case 'oboe':
    case 'clarinet':
    case 'bassoon':
    case 'horn':
    case 'trumpet':
    case 'trombone':
    case 'tuba':
      return windPhrase(WIND_LOW[instrument]);
    case 'harp':
      return harpPhrase();
    case 'piano':
      return pianoPhrase();
    case 'timpani':
      return timpaniPhrase();
    case 'cymbals':
      return cymbalPhrase();
    case 'bass-drum':
    case 'snare-drum':
    case 'small-percussion':
      return drumPhrase(SOURCES[instrument].key);
    case 'xylophone':
      return xylophonePhrase();
    case 'choir-folder':
      return choirPhrase();
  }
}

/** A note of a part of a test file, with its velocity. */
export interface PartNote extends TestNote {
  /** The MIDI velocity, 1 to 127. {@link TEST_VELOCITY} when it is not given. */
  readonly velocity?: number;
}

/** One part of a test file: an instrument and its notes. */
export interface PhrasePart {
  readonly instrument: PlayedInstrument;
  readonly notes: readonly PartNote[];
}

/**
 * Writes the Standard MIDI File of the parts of a test phrase (design 7.1, "Test page"): one track
 * at 120 BPM. Each melodic part gets its own channel with the GM program of its instrument, from
 * channel 1, and a drum part plays its key on the rhythm channel. The score rules of the app read
 * the file, so the sound and the motion come from one `Score`.
 *
 * @param parts The parts. At most 15 melodic parts.
 * @returns The bytes of the file.
 * @throws Error if the file has more than 15 melodic parts.
 */
export function partsFile(parts: readonly PhrasePart[]): Uint8Array<ArrayBuffer> {
  const tick = (sec: number): number => Math.round(sec * TICKS_PER_SEC);
  const programs: TestEvent[] = [];
  const notes: { tick: number; on: boolean; channel: number; key: number; velocity: number }[] = [];
  let next = 0;
  for (const part of parts) {
    const source: PhraseSource = SOURCES[part.instrument];
    let channel = RHYTHM_CHANNEL;
    if (source.kind === 'program') {
      channel = next === RHYTHM_CHANNEL ? next + 1 : next;
      next = channel + 1;
      if (channel > 15) {
        throw new Error(`A test file has room for 15 melodic parts, not ${parts.length}.`);
      }
      programs.push({ tick: 0, bytes: [0xc0 | channel, source.program] });
    }
    for (const note of part.notes) {
      const velocity = note.velocity ?? TEST_VELOCITY;
      notes.push(
        { tick: tick(note.start + note.length), on: false, channel, key: note.key, velocity },
        { tick: tick(note.start), on: true, channel, key: note.key, velocity },
      );
    }
  }
  // At one tick, a note-off comes before a note-on, so that a repeated key sounds again.
  const sorted = notes.toSorted((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));
  const events: TestEvent[] = [
    { tick: 0, bytes: TEMPO_120 },
    ...programs,
    ...sorted.map((note): TestEvent => ({
      tick: note.tick,
      bytes: note.on
        ? [0x90 | note.channel, note.key, note.velocity]
        : [0x80 | note.channel, note.key, 0],
    })),
  ];
  return writeSmf({ format: 0, ticksPerQuarter: TICKS_PER_QUARTER, tracks: [events] });
}

/**
 * Writes the Standard MIDI File of the test phrase of an instrument (design 7.1, "Test page"):
 * the one part of {@link partsFile}, on channel 1 or on the rhythm channel.
 *
 * @param instrument The instrument.
 * @returns The bytes of the file.
 */
export function phraseFile(instrument: PlayedInstrument): Uint8Array<ArrayBuffer> {
  return partsFile([{ instrument, notes: phraseOf(instrument) }]);
}
