import { SECTION_INSTRUMENTS, SECTION_SPECIES, speciesOf } from '../models/cast.ts';
import type { PlayingSection } from '../models/cast.ts';
import { supportOf } from '../models/player.ts';
import type { Support } from '../models/props.ts';
import { SPECIES_IDS } from '../models/species.ts';
import type { SpeciesId } from '../models/species.ts';
import { animalText } from '../app/seat-text.ts';
import type { PlayedInstrument } from './phrases.ts';

/**
 * The group of a role in the list of the test page: a player of a section, the standing soloist
 * of a section, or a recast role.
 */
export type RoleGroup = 'section' | 'soloist' | 'recast';

/** One role of the test page: a species with an instrument and a support (design 7.1). */
export interface TestRole {
  /**
   * The name of the role in the URL hash: `<species>-<instrument>`, with the suffix `-standing`
   * for a standing soloist. A recast species is never the own species of the instrument, so a
   * recast role needs no suffix.
   */
  readonly id: string;
  /** The text of the role in the list. */
  readonly label: string;
  readonly group: RoleGroup;
  readonly species: SpeciesId;
  /**
   * The species that the score rules cast in the seat of the phrase: the first species of the
   * section (`speciesOf()`). The layout builds its model before the role takes the place.
   */
  readonly seatSpecies: SpeciesId;
  readonly instrument: PlayedInstrument;
  /** The chair, the stool, the bench, the riser, or `stand` for a player who stands. */
  readonly support: Support;
}

/** The title of each group in the list. */
export const GROUP_TITLES = {
  section: 'Section players',
  soloist: 'Standing soloists',
  recast: 'Recast roles',
} as const satisfies Readonly<Record<RoleGroup, string>>;

/**
 * The instruments of the recast roles: the instruments of the roles of the cast matrix
 * (`CAST_ROLES` of `tools/cast-matrix.ts`, design 4.4). The role tools test a recast species in
 * these roles.
 */
const RECAST_INSTRUMENTS = [
  'violin',
  'cello',
  'flute',
  'clarinet',
  'trumpet',
  'snare-drum',
] as const satisfies readonly PlayedInstrument[];

/** The sections in the order of design 4.3. */
const SECTIONS = Object.keys(SECTION_SPECIES).filter(
  (key): key is PlayingSection => key in SECTION_INSTRUMENTS,
);

/**
 * Gives the name of a species in a label, with a capital letter: "Red fox".
 *
 * @param species The species.
 * @returns The name.
 */
function speciesName(species: SpeciesId): string {
  const name = animalText(species, 1).replace(/^1 /u, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Gives the label of a role in the list.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @param form The form of the role in parentheses, or an empty text for none.
 * @returns For example "Rabbit: violin (seated)".
 */
function labelOf(species: SpeciesId, instrument: PlayedInstrument, form: string): string {
  const text = `${speciesName(species)}: ${instrument.replaceAll('-', ' ')}`;
  return form === '' ? text : `${text} (${form})`;
}

/**
 * Lists each role of the test page (design 7.1): each species with each instrument of its section,
 * then the standing soloist of each instrument whose soloist stands, then each species in each
 * recast instrument that is not its own.
 *
 * @returns The roles, in the order of the groups and of the sections of design 4.3.
 */
export function testRoles(): TestRole[] {
  const own = SECTIONS.flatMap((section) =>
    SECTION_SPECIES[section].flatMap((species: SpeciesId) =>
      SECTION_INSTRUMENTS[section].map((instrument: PlayedInstrument) => ({
        species,
        seatSpecies: speciesOf(section, 0),
        instrument,
      })),
    ),
  );
  const roles: TestRole[] = [];
  for (const { species, seatSpecies, instrument } of own) {
    const seated = supportOf(instrument, false);
    const standing = supportOf(instrument, true);
    roles.push({
      id: `${species}-${instrument}`,
      label: labelOf(species, instrument, seated === standing ? '' : 'seated'),
      group: 'section',
      species,
      seatSpecies,
      instrument,
      support: seated,
    });
    if (standing !== seated) {
      roles.push({
        id: `${species}-${instrument}-standing`,
        label: labelOf(species, instrument, 'standing soloist'),
        group: 'soloist',
        species,
        seatSpecies,
        instrument,
        support: standing,
      });
    }
  }
  for (const instrument of RECAST_INSTRUMENTS) {
    const seats = own.filter((r) => r.instrument === instrument);
    const owners = new Set<SpeciesId>(seats.map((r) => r.species));
    const seatSpecies = seats[0]?.seatSpecies ?? 'rabbit';
    for (const species of SPECIES_IDS.filter((id) => !owners.has(id))) {
      roles.push({
        id: `${species}-${instrument}`,
        label: labelOf(species, instrument, 'recast'),
        group: 'recast',
        species,
        seatSpecies,
        instrument,
        support: supportOf(instrument, false),
      });
    }
  }
  return roles;
}

/**
 * Finds the role of a URL hash, such as `#rabbit-violin`.
 *
 * @param roles The roles.
 * @param hash The hash, with or without the `#`.
 * @returns The role, or `null` when no role has the name.
 */
export function roleOfHash(roles: readonly TestRole[], hash: string): TestRole | null {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/u, ''));
  } catch {
    return null;
  }
  return roles.find((role) => role.id === id) ?? null;
}
