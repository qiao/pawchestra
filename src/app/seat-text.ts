import { chamberFormOf, speciesOf } from '../models/cast.ts';
import { SPECIES } from '../models/species.ts';
import type { SpeciesId } from '../models/species.ts';
import type { Seat, SectionId } from '../score/types.ts';
import { relativeLuminance } from '../ui/title-shade.ts';

/** The name of each section in the seat list (design 2.8). */
const SECTION_NAMES = {
  violin: 'Violins',
  viola: 'Violas',
  cello: 'Cellos',
  contrabass: 'Contrabasses',
  harp: 'Harp',
  piano: 'Piano',
  flute: 'Flutes',
  oboe: 'Oboes',
  clarinet: 'Clarinets',
  bassoon: 'Bassoons',
  horn: 'Horns',
  trumpet: 'Trumpets',
  trombone: 'Trombones',
  tuba: 'Tuba',
  timpani: 'Timpani',
  percussion: 'Percussion',
  choir: 'Choir',
  'sound-only': 'Other sounds',
} as const satisfies Readonly<Record<SectionId, string>>;

/**
 * The name of each section for a seat with one player (design 2.8). One singer of the choir is a
 * voice. The names of the other sections stay the same.
 */
const SECTION_SINGULARS = {
  ...SECTION_NAMES,
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  contrabass: 'Contrabass',
  flute: 'Flute',
  oboe: 'Oboe',
  clarinet: 'Clarinet',
  bassoon: 'Bassoon',
  horn: 'Horn',
  trumpet: 'Trumpet',
  trombone: 'Trombone',
  choir: 'Voice',
} as const satisfies Readonly<Record<SectionId, string>>;

/**
 * The name of a seat of the section "piano" after its first program (design 2.8): the section holds
 * the pianos, the celesta, and the organs (3.5). Each entry gives the highest program of a group of
 * GM programs. The piano model stays.
 */
const KEYBOARD_NAMES: readonly (readonly [number, string])[] = [
  [5, 'Piano'],
  [6, 'Harpsichord'],
  [7, 'Clavinet'],
  [8, 'Celesta'],
  [20, 'Organ'],
  [21, 'Accordion'],
  [22, 'Harmonica'],
  [23, 'Accordion'],
];

/**
 * Gives the name of a seat of the section "piano" after its first program.
 *
 * @param program The first program of the seat, or undefined for none.
 * @returns For example "Celesta" for program 8, or "Piano".
 */
export function keyboardName(program: number | undefined): string {
  if (program === undefined) {
    return SECTION_NAMES.piano;
  }
  return KEYBOARD_NAMES.find(([last]) => program <= last)?.[1] ?? SECTION_NAMES.piano;
}

/**
 * Joins the items of a list (design 2.8): "a", "a and b", or "a, b, and c".
 *
 * @param items The items.
 * @returns The text of the list.
 */
export function listText(items: readonly string[]): string {
  if (items.length <= 2) {
    return items.join(' and ');
  }
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

/**
 * Gives the name of each seat in the seat list (design 2.8). A seat of the section "piano" takes
 * the name of its first program, for example "Celesta". A seat with one player takes the singular,
 * for example "Flute", and the soloist that does not play a keyboard is "Flute soloist". With the
 * name "Solo flute", the solo button of the row would read "Solo Solo flute". If more than one seat
 * of a section has a name, the name gets the number of the seat in that section, from 1:
 * "Violins 1", "Violin 2". The soloist gets no number.
 *
 * @param seats The seats of a score, `Score.seats`.
 * @param counts The number of players of each seat, from {@link playerCounts}.
 * @param soloist The seat of the soloist, `Score.soloist`, or `null` for none.
 * @returns One name for each seat, in the order of the seats.
 */
export function seatNames(
  seats: readonly Seat[],
  counts: readonly number[],
  soloist: number | null,
): string[] {
  const keys = seats.map((seat) =>
    seat.section === 'piano' ? keyboardName(seat.programs[0]) : seat.section,
  );
  const solo = (i: number): boolean => i === soloist && seats[i]?.section !== 'piano';
  const sizes = new Map<string, number>();
  keys.forEach((key, i) => {
    if (!solo(i)) {
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
  });
  const numbers = new Map<string, number>();
  return seats.map((seat, i) => {
    const key = keys[i] ?? '';
    if (seat.section === 'piano') {
      return numbered(key, key, sizes, numbers);
    }
    const one = SECTION_SINGULARS[seat.section];
    if (solo(i)) {
      return `${one} soloist`;
    }
    const name = counts[i] === 1 ? one : SECTION_NAMES[seat.section];
    return numbered(name, key, sizes, numbers);
  });
}

/**
 * Adds the number of a seat in its section to its name when the section has more than one seat.
 *
 * @param name The name of the seat, for example "Violins".
 * @param key The section of the seat, or the keyboard name of a seat of the section "piano".
 * @param sizes The number of named seats of each key.
 * @param numbers The last number of each key. The function writes the new number.
 * @returns For example "Violins 2", or the name alone.
 */
function numbered(
  name: string,
  key: string,
  sizes: ReadonlyMap<string, number>,
  numbers: Map<string, number>,
): string {
  if ((sizes.get(key) ?? 0) < 2) {
    return name;
  }
  const number = (numbers.get(key) ?? 0) + 1;
  numbers.set(key, number);
  return `${name} ${number}`;
}

/**
 * Gives a counted part of a source line, for example "program 40" or "programs 40 and 45".
 *
 * @param noun The noun for one item.
 * @param values The numbers.
 * @returns The part, or '' with no numbers.
 */
function countedPart(noun: string, values: readonly number[]): string {
  if (values.length === 0) {
    return '';
  }
  return `${noun}${values.length > 1 ? 's' : ''} ${listText(values.map(String))}`;
}

/**
 * Gives the part of a source line that names the ports and the channels (design 2.8). The UI
 * shows the channels as 1 to 16 and the ports from 0.
 *
 * @param sources The (port, channel) pairs of a seat, with channels from 0.
 * @returns For example "Port 0, channels 4 and 5", or "Port 0 channel 4, port 1 channel 2".
 */
function channelPart(sources: Seat['sources']): string {
  const ports = new Set(sources.map((source) => source.port));
  const [first] = sources;
  if (ports.size === 1 && first) {
    const channels = countedPart(
      'channel',
      sources.map((source) => source.channel + 1),
    );
    return `Port ${first.port}, ${channels}`;
  }
  const items = sources.map((source) => `port ${source.port} channel ${source.channel + 1}`);
  return capitalize(items.join(', '));
}

/**
 * Makes the first letter of a text upper case.
 *
 * @param text The text.
 * @returns The text with an upper case first letter.
 */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Gives the source line of a seat in the seat list (design 2.8): the ports, the channels, the
 * programs in the order of first use, and the drum kits. The sound-only seat names only its
 * programs and kits.
 *
 * @param seat The seat.
 * @returns For example "Port 0, channel 12, programs 40 and 45", or "Programs 80 and 81".
 */
export function sourceLine(seat: Seat): string {
  const parts = [countedPart('program', seat.programs), countedPart('kit', seat.kits)];
  if (seat.section !== 'sound-only') {
    parts.unshift(channelPart(seat.sources));
  }
  return capitalize(parts.filter((part) => part !== '').join(', '));
}

/** The name of each species in the seat list: one animal, and more than one (design 2.8). */
const SPECIES_NAMES = {
  rabbit: ['rabbit', 'rabbits'],
  'fox-red': ['red fox', 'red foxes'],
  'fox-tan': ['tan fox', 'tan foxes'],
  wolf: ['wolf', 'wolves'],
  elephant: ['elephant', 'elephants'],
  bear: ['bear', 'bears'],
  cat: ['cat', 'cats'],
  hippo: ['hippo', 'hippos'],
  deer: ['deer', 'deer'],
  panda: ['panda', 'pandas'],
  mouse: ['mouse', 'mice'],
  beaver: ['beaver', 'beavers'],
  dog: ['dog', 'dogs'],
  monkey: ['monkey', 'monkeys'],
  pig: ['pig', 'pigs'],
  rhino: ['rhino', 'rhinos'],
  badger: ['badger', 'badgers'],
  penguin: ['penguin', 'penguins'],
  'polar-bear': ['polar bear', 'polar bears'],
  mannequin: ['mannequin', 'mannequins'],
} as const satisfies Readonly<Record<SpeciesId, readonly [string, string]>>;

/** The animal line of the sound-only seat, which has no animal (design 2.8). */
export const NO_ANIMAL_TEXT = 'No animal';

/**
 * Gives the animal line of a seat (design 2.8): the number of players and their species.
 *
 * @param species The species of the seat, or `null` for the sound-only seat.
 * @param count The number of players of the seat.
 * @returns For example "5 rabbits", "1 deer", or "No animal".
 */
export function animalText(species: SpeciesId | null, count: number): string {
  if (!species || count === 0) {
    return NO_ANIMAL_TEXT;
  }
  const [one, more] = SPECIES_NAMES[species];
  return `${count} ${count === 1 ? one : more}`;
}

/**
 * Counts the players of each seat.
 *
 * @param players The players of the scene, each with the index of its seat.
 * @param seatCount The number of seats.
 * @returns The number of players of each seat, in the order of the seats.
 */
export function playerCounts(
  players: readonly { readonly seatIndex: number }[],
  seatCount: number,
): number[] {
  const counts = Array.from({ length: seatCount }, () => 0);
  for (const player of players) {
    counts[player.seatIndex] = (counts[player.seatIndex] ?? 0) + 1;
  }
  return counts;
}

/** The texts and the dot color of one row of the seat list (design 2.8). */
export interface SeatRowText {
  /** For example "Violins 1". */
  readonly name: string;
  /** The players of the seat, for example "5 rabbits" (design 2.8). */
  readonly animals: string;
  /** For example "Port 0, channel 12, programs 40 and 45". */
  readonly source: string;
  /** The fur color of the species of the seat, or `null` for the sound-only seat. */
  readonly color: string | null;
  /**
   * The color of the ring on the dot while the seat plays, from {@link ringColor}, or `null` for
   * the sound-only seat. `ui.css` then uses the color of its border.
   */
  readonly ring: string | null;
}

/** The red, green, and blue bytes of a color, from 0 to 255. */
type Rgb = readonly [number, number, number];

/** The color of `--text` in `ui.css`. A dark ring moves toward it. */
const RING_LIGHT: Rgb = [0xef, 0xe8, 0xdc];

/**
 * The lightest backdrop of a ring: the hover row (`--line-faint`) on the drawer panel
 * (`--panel-glass`), with white fur behind the panel.
 */
const RING_BACKDROP: Rgb = [44, 40, 37];

/** The least contrast of a ring with its backdrop: 3:1 for a part of the UI (WCAG 1.4.11). */
const RING_CONTRAST = 3;

/** The step of the share of {@link RING_LIGHT} in a ring. */
const RING_STEP = 0.05;

/**
 * Calculates the contrast of two colors (WCAG 2.2).
 *
 * @param a The first color.
 * @param b The second color.
 * @returns The contrast, from 1 to 21.
 */
function contrastOf(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Gives the color of the ring on the dot of a seat row (design 2.8): the fur color, mixed with
 * the smallest share of `--text` that gives 3:1 on the lightest backdrop of the row. A light fur
 * keeps its own color, and a dark fur, such as the penguin, gets a lighter ring.
 *
 * @param fur The fur color, as `#rrggbb`.
 * @returns The ring color, as `#rrggbb`.
 */
function ringColor(fur: string): string {
  const value = Number.parseInt(fur.slice(1), 16);
  const base: Rgb = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const mix = (share: number, i: 0 | 1 | 2): number =>
    Math.round(base[i] * (1 - share) + RING_LIGHT[i] * share);
  let ring = base;
  for (let step = 0; step * RING_STEP <= 1; step++) {
    const share = step * RING_STEP;
    ring = [mix(share, 0), mix(share, 1), mix(share, 2)];
    if (contrastOf(ring, RING_BACKDROP) >= RING_CONTRAST) {
      break;
    }
  }
  return `#${ring.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Gives the rows of the seat list of a score (design 2.8): the name, the animal line, the source
 * line, and the color of the dot. The sound-only seat has no animal, so its dot has no color.
 *
 * @param seats The seats of a score, `Score.seats`.
 * @param counts The number of players of each seat, from {@link playerCounts}.
 * @param soloist The seat of the soloist, `Score.soloist`, or `null` for none. A chamber group
 *   (design 4.2) names no soloist, because the soloist rule does not apply to it.
 * @returns One row for each seat, in the order of the seats.
 */
export function seatRows(
  seats: readonly Seat[],
  counts: readonly number[],
  soloist: number | null,
): SeatRowText[] {
  const names = seatNames(seats, counts, chamberFormOf(seats) ? null : soloist);
  return seats.map((seat, i) => {
    const species =
      seat.section === 'sound-only' ? null : speciesOf(seat.section, seat.indexInSection);
    return {
      name: names[i] ?? '',
      animals: animalText(species, counts[i] ?? 0),
      source: sourceLine(seat),
      color: species ? SPECIES[species].colors.fur : null,
      ring: species ? ringColor(SPECIES[species].colors.fur) : null,
    };
  });
}
