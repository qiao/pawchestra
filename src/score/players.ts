import { drumPart, ORCHESTRA_KIT, PERCUSSION_PARTS, RHYTHM_CHANNEL } from './drum-map.ts';
import type { PercussionPart } from './drum-map.ts';
import { techniqueOf } from './program-map.ts';
import type { SeatPlan, Seating } from './seats.ts';
import { findSoloist } from './soloist.ts';
import type { Steps } from './steps.ts';
import { findVocalSoloists } from './vocal-soloists.ts';
import type { Note, Timeline } from './timeline.ts';
import type { PlayerNote, Seat, SectionId, SectionSize } from './types.ts';

/** The seats with their player counts, and the notes of each player (design 3.8). */
export interface PlayerAssignment {
  /** The result of the rule for an orchestral file (3.8). The section size setting has no effect. */
  readonly orchestral: boolean;
  /** The seat of the soloist (3.8), or `null`. The soloist has one player. */
  readonly soloist: number | null;
  /** The choir seat of the vocal soloists (3.8), or `null`. It has one singer for each voice. */
  readonly vocalSoloists: number | null;
  /** The seats of the {@link Seating}, in the same order, with their player counts. */
  readonly seats: readonly Seat[];
  /**
   * Sorted by `startSec`. A note gives one player note for each of its players. The notes of the
   * sound-only seat give none.
   */
  readonly notes: readonly PlayerNote[];
}

/** The most players for one seat (design 3.8). The other sections have one player. */
const CAPS: ReadonlyMap<SectionId, number> = new Map<SectionId, number>([
  ['violin', 6],
  ['viola', 4],
  ['cello', 4],
  ['contrabass', 3],
  ['flute', 3],
  ['oboe', 3],
  ['clarinet', 3],
  ['bassoon', 3],
  ['horn', 4],
  ['trumpet', 3],
  ['trombone', 3],
  ['tuba', 1],
  ['choir', 8],
]);

/** The base section sizes of the strings and the choir in an orchestral file (design 3.8). */
const BASE_SIZES: ReadonlyMap<SectionId, number> = new Map<SectionId, number>([
  ['violin', 4],
  ['viola', 3],
  ['cello', 3],
  ['contrabass', 2],
  ['choir', 8],
]);

/**
 * The sections whose seats make a file orchestral (design 3.8). A timpani seat counts only with
 * real timpani (see {@link hasTimpani}).
 */
const ORCHESTRAL_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'horn',
  'trumpet',
  'trombone',
  'tuba',
]);

/** The melodic program of the timpani (design 3.5). */
const TIMPANI_PROGRAM = 47;

/** The programs that make a file orchestral: the ensembles and the contrabass (design 3.8). */
const ORCHESTRAL_PROGRAMS: ReadonlySet<number> = new Set([43, 44, 45, 48, 49, 50, 51]);

/** The most players in the scene. The conductor is not a player (design 3.8). */
const MAX_PLAYERS = 60;

/**
 * The longest overlap of two notes that one player can play. A note that ends at most this long
 * after the start of a later note does not sound together with it. Such an overlap is a legato
 * or a grace note.
 */
const OVERLAP_SEC = 0.05;

/** The way a seat gives its notes to its players. */
type Allocation =
  /** One player plays all notes: the piano, the harp, the timpani, and the mallets. */
  | 'single'
  /** One player for each key group of a rhythm channel. */
  | 'drums'
  /** One player for each simultaneous note. */
  | 'parts'
  /** All players play each note, and a chord divides them (divisi). */
  | 'divisi'
  /** No players: the sound-only seat. */
  | 'none';

/**
 * Gives each seat its player count and each note its players, in steps (design 3.8, 7.2).
 *
 * @param timeline The notes of the file.
 * @param seating The seats and the seat of each note, from `assignSeats()`.
 * @param sectionSize The value of the setting "Section size" (2.8, 3.8).
 * @returns The steps, which return the seats with their player counts and the player notes.
 */
export function* assignPlayersSteps(
  timeline: Timeline,
  seating: Seating,
  sectionSize: SectionSize,
): Steps<PlayerAssignment> {
  const notes = timeline.notes;
  const orchestral = isOrchestral(notes, seating.seats);
  const divisi = sectionSize === 'full' || (sectionSize === 'auto' && orchestral);
  const seatNotes = seating.seats.map((): number[] => []);
  seating.noteSeats.forEach((seat, i) => seatNotes[seat]?.push(i));
  const plans: SeatCount[] = [];
  for (const [s, seat] of seating.seats.entries()) {
    yield;
    plans.push(planSeat(seat, notes, seatNotes[s] ?? [], divisi));
  }
  yield;
  // The soloist rule runs before the soloist gets its one player, so that it finds a solo line
  // of a string section, which the size rule gives a full section.
  const soloSeats = seating.seats.map((seat, s) => ({
    ...seat,
    playerCount: plans[s]?.count ?? 0,
    voices: plans[s]?.allocation === 'single' ? 1 : (plans[s]?.onePerPart ?? 0),
    perVoice: plans[s]?.allocation === 'parts',
  }));
  const soloNotes = notes.map((note, i) => ({ ...note, seatIndex: seating.noteSeats[i] ?? 0 }));
  const soloist = findSoloist(soloSeats, soloNotes, timeline.durationSec);
  yield;
  const solo = soloist === null ? undefined : plans[soloist];
  if (soloist !== null && solo && solo.count > 1) {
    plans[soloist] = { ...solo, allocation: 'parts', count: 1, onePerPart: 1 };
  }
  // The vocal soloists sing with one singer for each voice, as the choir of "One per part".
  const vocalSoloists = findVocalSoloists(soloSeats, soloNotes, timeline.durationSec);
  const vocal = vocalSoloists === null ? undefined : plans[vocalSoloists];
  if (vocalSoloists !== null && vocal) {
    plans[vocalSoloists] = { ...vocal, allocation: 'parts', count: vocal.onePerPart };
  }
  yield;
  const counts = removePlayers(plans);
  const players = notes.map((): readonly number[] => []);
  for (const [s, plan] of plans.entries()) {
    yield;
    for (const [i, list] of playersOf(plan, notes, seatNotes[s] ?? [], counts[s] ?? 0)) {
      players[i] = list;
    }
  }
  yield;
  const playerNotes: PlayerNote[] = [];
  notes.forEach((note, i) => {
    const seatIndex = seating.noteSeats[i] ?? 0;
    for (const player of players[i] ?? []) {
      playerNotes.push({
        seatIndex,
        player,
        pitch: note.pitch,
        velocity: note.velocity,
        startSec: note.startSec,
        endSec: note.endSec,
        technique: note.channel === RHYTHM_CHANNEL ? 'normal' : techniqueOf(note.program),
        synthChannel: note.synthChannel,
      });
    }
  });
  return {
    orchestral,
    soloist,
    vocalSoloists,
    seats: seating.seats.map((seat, s) => ({ ...seat, playerCount: counts[s] ?? 0 })),
    notes: playerNotes,
  };
}

/**
 * Applies the rule for an orchestral file (design 3.8). A file is orchestral if it has a
 * woodwind, brass, or timpani seat. It is also orchestral if a note of a melodic channel uses an
 * ensemble program (44, 45, 48 to 51) or the contrabass (43). The toms of a GM1 kit go to the
 * timpani seat, but they do not make a file orchestral.
 */
function isOrchestral(notes: readonly Note[], seats: readonly SeatPlan[]): boolean {
  return (
    seats.some((seat) => ORCHESTRAL_SECTIONS.has(seat.section) || hasTimpani(seat)) ||
    notes.some((note) => note.channel !== RHYTHM_CHANNEL && ORCHESTRAL_PROGRAMS.has(note.program))
  );
}

/** Finds if a seat is a timpani seat with program 47 or with the Orchestra kit (design 3.8). */
function hasTimpani(seat: SeatPlan): boolean {
  return (
    seat.section === 'timpani' &&
    (seat.programs.includes(TIMPANI_PROGRAM) || seat.kits.includes(ORCHESTRA_KIT))
  );
}

/** A seat and the player counts that the rules of design 3.8 give it. */
interface SeatCount {
  readonly section: SectionId;
  readonly allocation: Allocation;
  /** The player count before the removal above 60 players. */
  readonly count: number;
  /** The count that "One per part" gives. The removal of string players stops there first. */
  readonly onePerPart: number;
  /** The key groups of a rhythm channel that the seat uses, in the order of design 3.8. */
  readonly parts: readonly PercussionPart[];
}

/** Finds the allocation and the player count of a seat (design 3.8). */
function planSeat(
  seat: SeatPlan,
  notes: readonly Note[],
  indices: readonly number[],
  divisi: boolean,
): SeatCount {
  const section = seat.section;
  const base = { section, onePerPart: 1, parts: [] };
  if (section === 'sound-only') {
    return { ...base, allocation: 'none', count: 0, onePerPart: 0 };
  }
  if (
    seat.sources.some((source) => source.channel === RHYTHM_CHANNEL) &&
    section === 'percussion'
  ) {
    const used = new Set(indices.map((i) => notePart(notes[i])));
    const parts = PERCUSSION_PARTS.filter((part) => used.has(part));
    return { ...base, allocation: 'drums', count: parts.length, onePerPart: parts.length, parts };
  }
  const cap = CAPS.get(section);
  if (cap === undefined) {
    return { ...base, allocation: 'single', count: 1 };
  }
  const onePerPart = Math.min(polyphony(notes, indices), cap);
  const size = BASE_SIZES.get(section);
  if (divisi && size !== undefined) {
    return { ...base, allocation: 'divisi', count: size, onePerPart };
  }
  return { ...base, allocation: 'parts', count: onePerPart, onePerPart };
}

/** Finds the percussion player of a note of a rhythm channel (design 3.6). */
function notePart(note: Note | undefined): PercussionPart {
  const part = note ? drumPart(note.program, note.pitch) : 'small-percussion';
  return part === 'timpani' ? 'small-percussion' : part;
}

/**
 * Removes players until the total is at most 60 (design 3.8). First, one player goes from the
 * largest string or choir seat, again and again, down to the size that "One per part" gives.
 * Then one player goes from the largest other seat. Of two seats with the same count, the later
 * seat loses the player. A seat always keeps at least one player.
 *
 * @returns The final player count of each seat.
 */
function removePlayers(plans: readonly SeatCount[]): number[] {
  const counts = plans.map((plan) => plan.count);
  let total = counts.reduce((sum, count) => sum + count, 0);
  const steps: readonly ((plan: SeatCount, count: number) => boolean)[] = [
    (plan, count) => BASE_SIZES.has(plan.section) && count > plan.onePerPart,
    (plan, count) => !BASE_SIZES.has(plan.section) && count > 1,
    (...[, count]) => count > 1,
  ];
  for (const removable of steps) {
    while (total > MAX_PLAYERS) {
      let largest = -1;
      plans.forEach((plan, s) => {
        const count = counts[s] ?? 0;
        if (removable(plan, count) && count >= (counts[largest] ?? 0)) {
          largest = s;
        }
      });
      if (largest < 0) {
        break;
      }
      counts[largest] = (counts[largest] ?? 1) - 1;
      total -= 1;
    }
  }
  return counts;
}

/**
 * Finds the most notes of a seat that sound together. A note that ends at most
 * {@link OVERLAP_SEC} after a later start does not count at that start. An earlier note that
 * sounds at the start of the first note of a chord counts for all notes of the chord.
 */
function polyphony(notes: readonly Note[], indices: readonly number[]): number {
  let most = 0;
  for (const { chord, sounding } of chords(notes, indices)) {
    most = Math.max(most, chord.length + sounding.length);
  }
  return most;
}

/** The notes of a seat that start together, and the earlier notes that still sound. */
interface Chord {
  readonly chord: readonly number[];
  /** The earlier notes that sound at the start of the first note of the chord. */
  readonly sounding: readonly number[];
}

/**
 * Lists the chords of a seat. A note joins the current chord if it starts at the same time as
 * the first note of the chord. It also joins if it starts at most {@link OVERLAP_SEC} after
 * that note, and each note of the chord ends more than {@link OVERLAP_SEC} after its start. At
 * each chord, it also gives the earlier notes that still sound, by the same rule.
 */
function* chords(notes: readonly Note[], indices: readonly number[]): Generator<Chord> {
  let sounding: number[] = [];
  let n = 0;
  while (n < indices.length) {
    const startSec = notes[indices[n] ?? 0]?.startSec ?? 0;
    const chord: number[] = [];
    while (n < indices.length && joins(notes, chord, startSec, indices[n] ?? 0)) {
      chord.push(indices[n] ?? 0);
      n += 1;
    }
    sounding = sounding.filter((i) => (notes[i]?.endSec ?? 0) - startSec > OVERLAP_SEC);
    yield { chord, sounding };
    sounding.push(...chord);
  }
}

/** Finds if a note joins a chord that starts at `startSec` (see {@link chords}). */
function joins(
  notes: readonly Note[],
  chord: readonly number[],
  startSec: number,
  note: number,
): boolean {
  const noteStart = notes[note]?.startSec ?? 0;
  if (chord.length === 0 || noteStart === startSec) {
    return true;
  }
  return (
    noteStart - startSec <= OVERLAP_SEC &&
    chord.every((i) => (notes[i]?.endSec ?? 0) - noteStart > OVERLAP_SEC)
  );
}

/**
 * Gives each note of a seat its players (design 3.8).
 *
 * @param plan The allocation of the seat.
 * @param notes All notes of the file.
 * @param indices The indices of the notes of the seat, sorted by start.
 * @param count The final player count of the seat.
 * @returns The players of each note of the seat, as `[note index, players]` pairs.
 */
function playersOf(
  plan: SeatCount,
  notes: readonly Note[],
  indices: readonly number[],
  count: number,
): Map<number, readonly number[]> {
  const result = new Map<number, readonly number[]>();
  switch (plan.allocation) {
    case 'none':
      break;
    case 'single':
      for (const i of indices) {
        result.set(i, [0]);
      }
      break;
    case 'drums':
      for (const i of indices) {
        const rank = plan.parts.indexOf(notePart(notes[i]));
        result.set(i, [Math.min(Math.max(rank, 0), count - 1)]);
      }
      break;
    case 'parts':
    case 'divisi':
      for (const { chord, sounding } of chords(notes, indices)) {
        // One order and one division for each chord and the earlier notes that sound. Thus two
        // notes of a chord share a player only when the chord and these earlier notes have
        // more notes than players (design 3.8).
        const ranked = byPitch(notes, [...sounding, ...chord]);
        const rank = new Map(ranked.map((i, r) => [i, r]));
        const busy = new Set(sounding.flatMap((i) => result.get(i) ?? []));
        for (const i of byPitch(notes, chord)) {
          const r = rank.get(i) ?? 0;
          const list =
            plan.allocation === 'divisi'
              ? divide(r, ranked.length, count)
              : [freePlayer(r, ranked.length, count, busy)];
          list.forEach((player) => busy.add(player));
          result.set(i, list);
        }
      }
      break;
  }
  return result;
}

/** Sorts note indices by pitch, highest first. Notes of one pitch keep their order. */
function byPitch(notes: readonly Note[], indices: readonly number[]): number[] {
  return indices.toSorted((a, b) => (notes[b]?.pitch ?? 0) - (notes[a]?.pitch ?? 0));
}

/**
 * Finds the player of the note of one rank in a chord, for one player for each part. The highest
 * note goes to player 0, so each player keeps a stable pitch range. If that player still plays
 * an earlier note, the note takes the nearest free player, the higher one at the same distance.
 * With no free player, it takes the player of its rank in a chord of more notes than players.
 */
function freePlayer(
  rank: number,
  notes: number,
  players: number,
  busy: ReadonlySet<number>,
): number {
  const wanted = notes <= players ? rank : Math.floor((rank * players) / notes);
  for (let distance = 0; distance < players; distance += 1) {
    for (const player of [wanted - distance, wanted + distance]) {
      if (player >= 0 && player < players && !busy.has(player)) {
        return player;
      }
    }
  }
  return wanted;
}

/**
 * Finds the players of the note of one rank in a chord, for divisi (design 3.8). All players
 * play one note. A chord divides the players across the notes, highest note first: the first
 * notes get one more player when the division leaves some. With more notes than players, a
 * player takes several notes (a double stop), highest notes first.
 */
function divide(rank: number, notes: number, players: number): number[] {
  if (notes > players) {
    return [Math.floor((rank * players) / notes)];
  }
  const size = Math.floor(players / notes);
  const extra = players % notes;
  const first = rank * size + Math.min(rank, extra);
  const length = size + (rank < extra ? 1 : 0);
  return Array.from({ length }, (...[, k]) => first + k);
}
