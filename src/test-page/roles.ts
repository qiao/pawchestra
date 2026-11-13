import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES, speciesOf } from '../models/cast.ts';
import type { PlayingSection } from '../models/cast.ts';
import { supportOf } from '../models/player.ts';
import type { Support } from '../models/props.ts';
import { SPECIES_IDS } from '../models/species.ts';
import type { SpeciesId } from '../models/species.ts';
import { animalText } from '../app/seat-text.ts';
import { conductorPhrase } from './conductor-phrase.ts';
import type { PlayedInstrument } from './phrases.ts';

/**
 * The group of a role in the list of the test page: the conductor, a player of a section, the
 * standing soloist of a section, or a recast role.
 */
export type RoleGroup = 'conductor' | 'section' | 'soloist' | 'recast';

/** The facts of each role of the test page (design 7.1). */
interface RoleFacts {
  /**
   * The name of the role in the URL hash: `<species>-<instrument>`, with the suffix `-standing`
   * for a standing soloist, or `<species>-conductor`. A recast species is never the own species of
   * the instrument, so a recast role needs no suffix.
   */
  readonly id: string;
  /** The text of the role in the list. */
  readonly label: string;
  readonly species: SpeciesId;
  /**
   * The species whose studio bodies load before the build: the species of the role, and the
   * species that the score rules cast in the seats of the phrase (`speciesOf()`). The layout
   * builds the models of the seats before the role takes its place.
   */
  readonly bodies: readonly SpeciesId[];
}

/** A role of a player: a species with an instrument and a support. */
export interface PlayerRole extends RoleFacts {
  readonly group: Exclude<RoleGroup, 'conductor'>;
  readonly instrument: PlayedInstrument;
  /** The chair, the stool, the bench, the riser, or `stand` for a player who stands. */
  readonly support: Support;
}

/** The role of the conductor: the bear on its podium, which conducts a small orchestra. */
export interface ConductorRole extends RoleFacts {
  readonly group: 'conductor';
}

/** One role of the test page (design 7.1). */
export type TestRole = PlayerRole | ConductorRole;

/** The title of each group in the list. */
export const GROUP_TITLES = {
  conductor: 'Conductor',
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
 * Gives the section of an instrument.
 *
 * @param instrument The instrument.
 * @returns The first section that plays it.
 * @throws Error if no section plays the instrument.
 */
function sectionOf(instrument: PlayedInstrument): PlayingSection {
  const section = SECTIONS.find((s) =>
    SECTION_INSTRUMENTS[s].some((played: PlayedInstrument) => played === instrument),
  );
  if (!section) {
    throw new Error(`No section plays the ${instrument}.`);
  }
  return section;
}

/**
 * Makes the role of the conductor (design 7.1). The bodies of the role are the bear and the first
 * species of the section of each part of the phrase of the conductor.
 *
 * @returns The role.
 */
function conductorRole(): ConductorRole {
  const species = CONDUCTOR.species;
  const seats = conductorPhrase().map((part) => speciesOf(sectionOf(part.instrument), 0));
  return {
    id: `${species}-conductor`,
    label: `${speciesName(species)}: conductor`,
    group: 'conductor',
    species,
    bodies: [...new Set([species, ...seats])],
  };
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
 * Lists each role of the test page (design 7.1): the conductor, each species with each instrument
 * of its section, then the standing soloist of each instrument whose soloist stands, then each species in each
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
  const roles: TestRole[] = [conductorRole()];
  for (const { species, seatSpecies, instrument } of own) {
    const seated = supportOf(instrument, false);
    const standing = supportOf(instrument, true);
    roles.push({
      id: `${species}-${instrument}`,
      label: labelOf(species, instrument, seated === standing ? '' : 'seated'),
      group: 'section',
      species,
      bodies: [species, seatSpecies],
      instrument,
      support: seated,
    });
    if (standing !== seated) {
      roles.push({
        id: `${species}-${instrument}-standing`,
        label: labelOf(species, instrument, 'standing soloist'),
        group: 'soloist',
        species,
        bodies: [species, seatSpecies],
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
        bodies: [species, seatSpecies],
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
