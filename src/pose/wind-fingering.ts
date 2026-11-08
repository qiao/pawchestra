import type { InstrumentOf } from './family.ts';

/** A woodwind of the app. */
export type Woodwind = InstrumentOf<'woodwind'>;

/** A brass instrument of the app. */
export type Brass = InstrumentOf<'brass'>;

/**
 * The fundamental of each brass tube, as a MIDI key: F1, B♭2, B♭1, and B♭0. The horn is the F
 * side of a double horn, a tube of about 3.7 m, so its written C4 is the fourth partial
 * (`docs/reference/wind-technique.md` 2.2).
 */
const BRASS_FUNDAMENTALS = { horn: 29, trumpet: 46, trombone: 34, tuba: 22 } as const;

/**
 * The partials of the trumpet, the trombone, and the tuba, in semitones above the fundamental:
 * the notes that the player plays with no valve and the slide in the first position. The list
 * has no seventh partial (34 semitones). It is about 31 cents flat, so players play its notes
 * from the eighth partial (`docs/reference/wind-technique.md` 1.2). Thus the trombone plays A♭4
 * in the third position, and the trumpet plays the written A5 with the valves 1-2.
 */
const PARTIALS = [0, 12, 19, 24, 28, 31, 36, 38, 40, 42, 43, 45, 46, 48] as const;

/**
 * The partials of the F side of the horn, in semitones above its fundamental: the open notes up
 * to the written G4, where the player takes the B♭ side ({@link HORN_B_FLAT}).
 */
const HORN_PARTIALS = [0, 12, 19, 24, 28, 31] as const;

/** The lowest semitone below a partial that three valves or the slide reach: 1-2-3, position 7. */
const MAX_LOWER = 6;

/** The bits of the valves 1, 2, 3, and 4 in a combination. */
const V1 = 1;
const V2 = 2;
const V3 = 4;
const V4 = 8;

/**
 * The valves of three valves for each semitone below an open partial: 0, 2, 1, 1-2, 2-3, 1-3, and
 * 1-2-3 (`docs/reference/wind-technique.md` 7.3).
 */
const THREE_VALVES = [0, V2, V1, V1 | V2, V2 | V3, V1 | V3, V1 | V2 | V3] as const;

/**
 * The valves of the tuba for each semitone below B♭1 down to B0: valve 4 lowers a fourth, so it
 * takes 1-3 and 2-4 takes 1-2-3, and the combinations with valve 4 reach the low notes
 * (`docs/reference/wind-technique.md` 7.3).
 */
const TUBA_LOW_VALVES = [
  0,
  V2,
  V1,
  V1 | V2,
  V2 | V3,
  V4,
  V2 | V4,
  V1 | V4,
  V1 | V2 | V4,
  V2 | V3 | V4,
  V1 | V3 | V4,
  V1 | V2 | V3 | V4,
] as const;

/**
 * The highest key of the tuba below which valve 4 takes the place of 1-3 and 2-4 the place of
 * 1-2-3: B♭2. Lower, the valve combinations of three valves play flat.
 */
const TUBA_FOURTH_BELOW = 46;

/**
 * The semitones of the written pitch of the horn above its sound: a fifth
 * (`docs/reference/wind-technique.md` 2.2).
 */
const HORN_WRITTEN = 7;

/**
 * The highest written key of the F side of the double horn: G4
 * (`docs/reference/wind-technique.md` 7.3).
 */
const HORN_F_TOP = 67;

/**
 * The valves of the B♭ side of the double horn for the written G♯4 to C6, from the chart of
 * Weidner (`docs/reference/wind-technique.md` 7.3). The left thumb holds the B♭ valve down. A
 * higher note takes the note of its pitch class an octave lower.
 */
const HORN_B_FLAT = [
  V2 | V3,
  V1 | V2,
  V1,
  V2,
  0,
  V2 | V3,
  V1 | V2,
  V1,
  V2,
  0,
  V2,
  0,
  V2,
  0,
  V1,
  V2,
  0,
] as const;

/** The first written key of {@link HORN_B_FLAT}: G♯4. */
const HORN_B_FLAT_FIRST = 68;

/**
 * The basic fingering of each woodwind as the count of the main fingers (1 to 3) of each hand
 * that close a hole or a plate, a half hole as 0.5, from the charts of the Woodwind Fingering
 * Guide (`docs/reference/wind-technique.md` 7.2). Each chart starts at its first key and goes up
 * in semitones. The clarinet chart is in written pitch, a tone above the sound.
 */
const WOODWIND_CHARTS: Readonly<
  Record<Woodwind, { readonly first: number; readonly hands: string; readonly written: number }>
> = {
  // C4 to C7.
  flute: {
    first: 60,
    written: 0,
    hands:
      '33 33 33 33 32 31 31 30 30 20 11 10 ' +
      '10 00 23 23 32 31 31 30 30 20 11 10 ' +
      '10 00 20 33 22 21 21 30 20 11 01 20 31',
  },
  // B♭3 to F6.
  oboe: {
    first: 58,
    written: 0,
    hands:
      '33 33 33 33 33 33 32 32 31 30 30 20 21 10 ' +
      '11 33 33 33 32 32 31 30 30 20 21 10 ' +
      '11 21 30 32 32 22',
  },
  // The written E3 to C6: the chalumeau, the throat, and the clarion a twelfth above.
  clarinet: {
    first: 52,
    written: 2,
    hands:
      '33 33 33 33 33 32 31 31 30 30 20 20 10 00 10 00 10 10 10 ' +
      '33 33 33 33 33 32 31 31 30 30 20 20 10 00',
  },
  // B♭1 to E5, with "h" for a half hole and "q" and "t" for a quarter and three quarters.
  bassoon: {
    first: 34,
    written: 0,
    hands:
      '33 33 33 33 33 33 33 33 33 33 33 32 32 31 30 30 20 20 10 00 ' +
      'q3 h3 t3 32 32 31 30 30 20 23 23 22 22 h1 t1 31 32 22 12 22 g1 11 h3',
  },
};

/** The count of each letter of {@link WOODWIND_CHARTS}. */
const COUNTS = new Map<string, number>([
  ['0', 0],
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['q', 2.25],
  ['h', 2.5],
  ['t', 2.75],
  ['g', 1.5],
]);

/** The valves of one brass note. */
interface ValveCombination {
  /** The valves that go down, as bits: 1, 2, 4, and 8 for the valves 1 to 4. */
  readonly valves: number;
  /** True when the horn player holds the B♭ valve down with the thumb. */
  readonly thumb: boolean;
}

/** The fingering of one note of a wind player. */
interface WindFingering {
  /** The share of the main fingers of the left paw that close, from 0 to 1, or -1 to only hold. */
  readonly left: number;
  /** The share of the main fingers of the right paw that close, from 0 to 1, or -1 to only hold. */
  readonly right: number;
  /** The valves that go down, as bits: 1, 2, 4, and 8 for the valves 1 to 4. */
  readonly valves: number;
  /** True when the horn player holds the B♭ valve down with the thumb. */
  readonly thumb: boolean;
  /** The trombone slide position, from 1 to 7, or 0 for an instrument with no slide. */
  readonly position: number;
}

/**
 * Gives the semitones below the nearest partial at or above a key: a valve combination or a slide
 * position lowers that partial by these semitones. A key below the reach of the partials gives
 * the largest value.
 *
 * @param key The MIDI key.
 * @param fundamental The MIDI key of the fundamental of the tube.
 * @param partials The partials of the tube, in semitones above the fundamental.
 * @returns The semitones, from 0 to 6.
 */
function semitonesBelow(key: number, fundamental: number, partials: readonly number[]): number {
  for (const partial of partials) {
    const lower = fundamental + partial - key;
    if (lower >= 0 && lower <= MAX_LOWER) {
      return lower;
    }
  }
  return key > fundamental + (partials.at(-1) ?? 0) ? 0 : MAX_LOWER;
}

/**
 * Gives the number of valves of a combination.
 *
 * @param valves The valves, as bits.
 * @returns The count.
 */
function valveCount(valves: number): number {
  let count = 0;
  for (let v = valves; v > 0; v >>= 1) {
    count += v & 1;
  }
  return count;
}

/**
 * Gives the valves of a brass key and the thumb valve of the horn
 * (`docs/reference/wind-technique.md` 7.3).
 *
 * @param instrument The brass instrument with valves.
 * @param key The MIDI key of the sound.
 * @returns The valves, as bits, and the thumb valve.
 */
function valvesOf(instrument: Exclude<Brass, 'trombone'>, key: number): ValveCombination {
  switch (instrument) {
    case 'trumpet':
      return {
        valves: THREE_VALVES[semitonesBelow(key, BRASS_FUNDAMENTALS.trumpet, PARTIALS)] ?? 0,
        thumb: false,
      };
    case 'tuba': {
      const second = BRASS_FUNDAMENTALS.tuba + 12;
      if (key < second) {
        const lower = Math.min(second - key, TUBA_LOW_VALVES.length - 1);
        return { valves: TUBA_LOW_VALVES[lower] ?? 0, thumb: false };
      }
      const lower = semitonesBelow(key, BRASS_FUNDAMENTALS.tuba, PARTIALS);
      const valves = key < TUBA_FOURTH_BELOW ? TUBA_LOW_VALVES[lower] : THREE_VALVES[lower];
      return { valves: valves ?? 0, thumb: false };
    }
    case 'horn': {
      const written = key + HORN_WRITTEN;
      if (written <= HORN_F_TOP) {
        const lower = semitonesBelow(key, BRASS_FUNDAMENTALS.horn, HORN_PARTIALS);
        return { valves: THREE_VALVES[lower] ?? 0, thumb: false };
      }
      let at = written - HORN_B_FLAT_FIRST;
      while (at >= HORN_B_FLAT.length) {
        at -= 12;
      }
      return { valves: HORN_B_FLAT[at] ?? 0, thumb: true };
    }
    default: {
      const unhandled: never = instrument;
      throw new Error(`The brass instrument "${String(unhandled)}" is not known.`);
    }
  }
}

/**
 * Gives the closed share of each hand of a woodwind key from its chart. A key out of the chart
 * takes the chart key of its pitch class in the nearest octave.
 *
 * @param instrument The woodwind.
 * @param key The MIDI key of the sound.
 * @returns The closed share of the left and of the right main fingers, from 0 to 1.
 */
function holesOf(instrument: Woodwind, key: number): readonly [left: number, right: number] {
  const chart = WOODWIND_CHARTS[instrument];
  const cells = chart.hands.split(' ');
  let at = key + chart.written - chart.first;
  while (at < 0) {
    at += 12;
  }
  while (at >= cells.length) {
    at -= 12;
  }
  const cell = cells[at] ?? '00';
  return [(COUNTS.get(cell[0] ?? '0') ?? 0) / 3, (COUNTS.get(cell[1] ?? '0') ?? 0) / 3];
}

/**
 * Gives the trombone positions of a key: the position on each partial that reaches the key, from
 * the lowest position (`docs/reference/wind-technique.md` 7.3, 1.3). The list has no seventh
 * partial, so F♯4, G4, and A♭4 take the positions 5, 4, and 3.
 *
 * @param key The MIDI key.
 * @returns The positions, from 1 (closed) to 7, the first the lowest. A key below the reach of the
 *   slide gives the seventh position alone.
 */
export function slidePositions(key: number): number[] {
  const positions: number[] = [];
  for (const partial of PARTIALS) {
    const lower = BRASS_FUNDAMENTALS.trombone + partial - key;
    if (lower >= 0 && lower <= MAX_LOWER) {
      positions.push(lower + 1);
    }
  }
  if (positions.length === 0) {
    positions.push(key > BRASS_FUNDAMENTALS.trombone + (PARTIALS.at(-1) ?? 0) ? 1 : MAX_LOWER + 1);
  }
  return positions.toSorted((a, b) => a - b);
}

/**
 * The rule of the alternate trombone positions (`docs/reference/wind-technique.md` 1.3): a note
 * that starts less than `fastSec` after the note before takes another position of its key when
 * that saves at least `saving` positions of slide travel from the position before. Trombonists
 * use alternates to move the slide less in fast passages.
 */
const SLIDE_ALTERNATE = { fastSec: 0.3, saving: 2 } as const;

/**
 * Gives the trombone position of each note: the lowest position, or an alternate of a fast note
 * ({@link SLIDE_ALTERNATE}).
 *
 * @param notes The pitch and the start of each shown note, sorted by start.
 * @returns The position of each note, from 1 to 7.
 */
export function planSlide(
  notes: readonly { readonly pitch: number; readonly start: number }[],
): number[] {
  const out: number[] = [];
  let previous: { readonly start: number; readonly position: number } | null = null;
  for (const note of notes) {
    const options = slidePositions(note.pitch);
    let position = options[0] ?? 1;
    if (previous && note.start - previous.start < SLIDE_ALTERNATE.fastSec) {
      const from = previous.position;
      const nearest = options.reduce((a, b) => (Math.abs(b - from) < Math.abs(a - from) ? b : a));
      if (Math.abs(position - from) - Math.abs(nearest - from) >= SLIDE_ALTERNATE.saving) {
        position = nearest;
      }
    }
    out.push(position);
    previous = { start: note.start, position };
  }
  return out;
}

/**
 * Gives the fingering of one note of a wind player (`docs/reference/wind-technique.md` 7): the
 * closed share of the main fingers of each woodwind hand from the chart, the valves of a brass
 * key with the hand that presses them, or the slide position of the trombone. A hand that only
 * holds the instrument gives -1.
 *
 * @param instrument The wind instrument.
 * @param key The MIDI key of the sound.
 * @param position The trombone position of the note ({@link planSlide}). The other instruments
 *   ignore it.
 * @returns The fingering.
 */
export function windFingering(
  instrument: Woodwind | Brass,
  key: number,
  position = 0,
): WindFingering {
  switch (instrument) {
    case 'flute':
    case 'oboe':
    case 'clarinet':
    case 'bassoon': {
      const [left, right] = holesOf(instrument, key);
      return { left, right, valves: 0, thumb: false, position: 0 };
    }
    case 'trombone':
      return { left: -1, right: -1, valves: 0, thumb: false, position };
    case 'horn': {
      const { valves, thumb } = valvesOf(instrument, key);
      return { left: valveCount(valves) / 3, right: -1, valves, thumb, position: 0 };
    }
    case 'trumpet':
    case 'tuba': {
      const { valves, thumb } = valvesOf(instrument, key);
      const all = instrument === 'tuba' ? 4 : 3;
      return { left: -1, right: valveCount(valves) / all, valves, thumb, position: 0 };
    }
    default: {
      const unhandled: never = instrument;
      throw new Error(`The wind instrument "${String(unhandled)}" is not known.`);
    }
  }
}
