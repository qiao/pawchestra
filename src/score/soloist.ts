import type { PlayerNote, Seat, SectionId } from './types.ts';

/** A seat as the soloist rule reads it: a seat with the player counts of design 3.8. */
export interface SoloSeat extends Seat {
  /**
   * The players that the notes of the seat need with one player for each simultaneous note, or
   * 1 for a seat of one player (the piano, the harp, the timpani). A solo line has one voice.
   */
  readonly voices: number;
  /**
   * True if the size rule gives the seat one player for each simultaneous note: a seat of the
   * winds, or of the strings of a file that is not orchestral. A section of the strings with its
   * base size has more players than voices, so it is no solo line.
   */
  readonly perVoice: boolean;
}

/**
 * A note as the soloist rule reads it. The rule counts the notes of a seat that sound together,
 * so each note of the file comes one time.
 */
export type SoloNote = Pick<PlayerNote, 'seatIndex' | 'pitch' | 'velocity' | 'startSec' | 'endSec'>;

/**
 * The values of the soloist rule (design 3.8). A seat that is clearly the soloist sits at the
 * front left of the conductor, as in a concerto.
 */
const SOLOIST_RULE = {
  /** The step at which the rule reads the notes, in seconds. */
  stepSec: 0.1,
  /** The soloist sounds in this part of the piece or more, from its first note to its end. */
  coverage: 0.5,
  /**
   * In this part of its sounding time or more, the soloist is above the orchestra: its highest
   * key is above each key of the other pitched seats, or its velocity is above the loudness
   * share times the highest velocity of the other seats.
   */
  above: 0.78,
  /** The velocity of the soloist is at least this factor of the highest other velocity. */
  louder: 1.2,
  /** In this part of its sounding time or more, two or more other seats sound with it. */
  accompanied: 0.6,
  /**
   * A solo line that shares its section with the seats of the orchestra is exposed in this part
   * of its sounding time or more: no other seat of its section sounds, or it is at least
   * {@link louder} times as loud as them.
   */
  exposed: 0.75,
  /** The orchestra: at least this many other seats with players. */
  orchestra: 3,
  /**
   * A solo line sounds two or more notes together in less than this part of its sounding time.
   * A solo part can hold a few double notes, as the 9 notes of the K. 191 bassoon (0.03).
   */
  chords: 0.05,
  /**
   * A soloist of the woodwinds or the brass also leads when no other seat of the woodwinds and
   * the brass sounds in this part of its sounding time or more. The solo parts of the K. 191
   * bassoon and the K. 417 horn have 0.86 and 0.96, and each other wind seat of the demos has
   * 0.27 or less.
   */
  windsRest: 0.6,
  /**
   * Such a soloist also plays at least this part of the notes of the busiest other seat. The
   * two solo parts have 0.84 and 0.81. A horn that holds long notes under the strings is no
   * soloist.
   */
  busy: 0.5,
} as const;

/**
 * The sections whose seat can be a soloist. The timpani and the percussion carry no melody, and
 * a choir seat is a group of singers.
 */
const SOLO_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'violin',
  'viola',
  'cello',
  'contrabass',
  'harp',
  'piano',
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'horn',
  'trumpet',
  'trombone',
  'tuba',
]);

/**
 * The sections of the woodwinds and the brass. In a concerto for one of them, the strings
 * accompany the solo, and the other winds play in the tutti.
 */
const WIND_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'horn',
  'trumpet',
  'trombone',
  'tuba',
]);

/**
 * The last GM program of a piano: the acoustic and the electric pianos are 0 to 5 (design 3.5).
 * The harpsichord (6), the clavinet (7), the celesta (8), and the organs (16 to 23) also go to
 * the piano section, but they play in the orchestra.
 */
const LAST_PIANO_PROGRAM = 5;

/**
 * Finds if a seat is a piano: a seat of the piano section with a program of a piano. A celesta
 * or a harpsichord of the orchestra plays color or continuo, so it is not a concerto soloist.
 *
 * @param seat The seat.
 * @returns True for a piano.
 */
function isPianoSeat(seat: Seat): boolean {
  return seat.section === 'piano' && seat.programs.some((p) => p <= LAST_PIANO_PROGRAM);
}

/** The notes of one seat on the grid of the rule. */
interface SeatGrid {
  /** The highest key that sounds at each step, or -1. */
  readonly top: Int8Array;
  /** The highest velocity that sounds at each step, or 0. */
  readonly velocity: Uint8Array;
  /** The number of notes that sound at each step, up to 255. */
  readonly count: Uint8Array;
  /** The number of notes of the seat. */
  notes: number;
}

/**
 * Writes the notes of each seat on a grid of steps of 0.1 s.
 *
 * @param seats The seats.
 * @param notes The player notes.
 * @param steps The number of steps.
 * @returns One grid for each seat.
 */
function gridOf(
  seats: readonly Seat[],
  notes: readonly SoloNote[],
  steps: number,
): readonly SeatGrid[] {
  const grids = seats.map((): SeatGrid => ({
    top: new Int8Array(steps).fill(-1),
    velocity: new Uint8Array(steps),
    count: new Uint8Array(steps),
    notes: 0,
  }));
  const step = SOLOIST_RULE.stepSec;
  for (const note of notes) {
    const grid = grids[note.seatIndex];
    if (!grid) {
      continue;
    }
    grid.notes += 1;
    const from = Math.max(0, Math.round(note.startSec / step));
    const to = Math.min(steps, Math.round(note.endSec / step));
    for (let i = from; i < to; i++) {
      grid.top[i] = Math.max(grid.top[i] ?? -1, note.pitch);
      grid.velocity[i] = Math.max(grid.velocity[i] ?? 0, note.velocity);
      grid.count[i] = Math.min(255, (grid.count[i] ?? 0) + 1);
    }
  }
  return grids;
}

/** The measures of the soloist rule for one seat (design 3.8). */
interface SoloMeasures {
  /** The part of the piece in which the seat sounds, from the first note of the piece. */
  readonly coverage: number;
  /** The part of its sounding time in which it is above the orchestra. */
  readonly above: number;
  /** The part of its sounding time in which two or more other seats sound with it. */
  readonly accompanied: number;
  /**
   * For a solo line that shares its section: the part of its sounding time in which it is
   * exposed ({@link SOLOIST_RULE}). `null` for the only seat of its section.
   */
  readonly exposed: number | null;
  /**
   * For a seat of the woodwinds or the brass beside other such seats: the part of its sounding
   * time in which no other such seat sounds. `null` for each other seat.
   */
  readonly windsRest: number | null;
  /** The notes of the seat as a part of the notes of the busiest other seat that can carry a solo. */
  readonly busy: number;
}

/**
 * Finds if another seat gets notes from a (port, channel) pair of a seat. A string ensemble
 * divided by pitch feeds several seats, so none of them plays a solo line.
 */
function sharesChannel(index: number, seats: readonly Seat[]): boolean {
  const own = seats[index]?.sources ?? [];
  return seats.some(
    (seat, i) =>
      i !== index &&
      seat.sources.some((a) => own.some((b) => a.port === b.port && a.channel === b.channel)),
  );
}

/**
 * Finds if the notes of a seat are one line: the seat has one voice, or two or more of its notes
 * sound together in less than {@link SOLOIST_RULE}.chords of its sounding time. Thus a few
 * double notes of a solo part do not make it a section.
 *
 * @param seat The seat.
 * @param grid The grid of the seat.
 * @returns True for one line.
 */
function isLine(seat: SoloSeat, grid: SeatGrid): boolean {
  if (seat.voices === 1) {
    return true;
  }
  let sounding = 0;
  let chords = 0;
  for (const count of grid.count) {
    sounding += count > 0 ? 1 : 0;
    chords += count > 1 ? 1 : 0;
  }
  return sounding > 0 && chords < SOLOIST_RULE.chords * sounding;
}

/**
 * Measures a seat for the soloist rule (design 3.8). The seat is a candidate when its section
 * can carry a solo, at least three other seats have players, and one of these is true:
 *
 * - No other seat with players has its section, and the size rule gives it one player. A seat
 *   with one player for each simultaneous note also counts when its notes are one line
 *   ({@link isLine}).
 * - It is a solo line beside the seats of its section: one line, on channels that feed no other
 *   seat. The first violins of a string quartet are such a line too, so the line must also be
 *   exposed ({@link SOLOIST_RULE}).
 *
 * @param index The seat.
 * @param seats The seats, with the player counts of the size rule.
 * @param grids The grid of each seat.
 * @param span The steps from the first note to the end of the piece.
 * @returns The measures, or `null` if the seat is not a candidate.
 */
function measure(
  index: number,
  seats: readonly SoloSeat[],
  grids: readonly SeatGrid[],
  span: readonly [number, number],
): SoloMeasures | null {
  const seat = seats[index];
  const own = grids[index];
  if (!seat || !own || seat.playerCount === 0 || !SOLO_SECTIONS.has(seat.section)) {
    return null;
  }
  const rule = SOLOIST_RULE;
  const others = seats.flatMap((s, i) => (i !== index && s.playerCount > 0 ? [i] : []));
  const mates = others.filter((i) => seats[i]?.section === seat.section);
  if (others.length < rule.orchestra) {
    return null;
  }
  const line = isLine(seat, own);
  const alone = seat.playerCount === 1 || (seat.perVoice && line);
  if (mates.length === 0 ? !alone : !line || sharesChannel(index, seats)) {
    return null;
  }
  const winds = others.filter((i) => WIND_SECTIONS.has(seats[i]?.section ?? 'percussion'));
  const busiest = Math.max(
    1,
    ...others.map((i) =>
      SOLO_SECTIONS.has(seats[i]?.section ?? 'percussion') ? (grids[i]?.notes ?? 0) : 0,
    ),
  );
  let sounding = 0;
  let above = 0;
  let accompanied = 0;
  let exposed = 0;
  let windsRest = 0;
  for (let t = span[0]; t < span[1]; t++) {
    const key = own.top[t] ?? -1;
    if (key < 0) {
      continue;
    }
    sounding++;
    const velocity = own.velocity[t] ?? 0;
    let otherKey = -1;
    let otherVelocity = 0;
    let mateVelocity = 0;
    let along = 0;
    for (const i of others) {
      const grid = grids[i];
      const top = grid?.top[t] ?? -1;
      if (top < 0) {
        continue;
      }
      along++;
      otherVelocity = Math.max(otherVelocity, grid?.velocity[t] ?? 0);
      if (SOLO_SECTIONS.has(seats[i]?.section ?? 'percussion')) {
        otherKey = Math.max(otherKey, top);
      }
      if (seats[i]?.section === seat.section) {
        mateVelocity = Math.max(mateVelocity, grid?.velocity[t] ?? 0);
      }
    }
    if (key > otherKey || velocity >= rule.louder * otherVelocity) {
      above++;
    }
    if (along >= 2) {
      accompanied++;
    }
    if (velocity >= rule.louder * mateVelocity) {
      exposed++;
    }
    if (winds.every((i) => (grids[i]?.top[t] ?? -1) < 0)) {
      windsRest++;
    }
  }
  const heard = Math.max(1, sounding);
  return {
    coverage: sounding / Math.max(1, span[1] - span[0]),
    above: above / heard,
    accompanied: accompanied / heard,
    exposed: mates.length === 0 ? null : exposed / heard,
    windsRest: WIND_SECTIONS.has(seat.section) && winds.length > 0 ? windsRest / heard : null,
    busy: own.notes / busiest,
  };
}

/**
 * Finds if a seat of the woodwinds or the brass leads as the soloist of a concerto does: the
 * strings accompany its solo, the other woodwinds and brass rest ({@link SOLOIST_RULE}.windsRest),
 * and it plays a line of many notes ({@link SOLOIST_RULE}.busy).
 *
 * @param m The measures of a candidate.
 * @returns True if the seat leads the winds.
 */
function leadsTheWinds(m: SoloMeasures): boolean {
  return (
    m.windsRest !== null && m.windsRest >= SOLOIST_RULE.windsRest && m.busy >= SOLOIST_RULE.busy
  );
}

/**
 * Finds if the measures of a seat pass the soloist rule: it sounds in half the piece or more, it
 * leads the orchestra, and two or more other seats sound with it in 0.6 of its sounding time. A
 * seat leads when it is above the orchestra in register or in loudness in three quarters of its
 * sounding time. A seat of the woodwinds or the brass also leads when the other woodwinds and
 * brass rest in 0.6 of its sounding time, and it plays half the notes of the busiest other seat
 * or more. A file with one loudness for all notes gives a low soloist, such as a bassoon or a
 * horn, no other lead. A solo line beside the seats of its section is also exposed in three
 * quarters of its sounding time.
 *
 * @param m The measures of a candidate.
 * @returns True if the seat is clearly the soloist.
 */
export function passesSoloistRule(m: SoloMeasures): boolean {
  const rule = SOLOIST_RULE;
  return (
    m.coverage >= rule.coverage &&
    (m.above >= rule.above || leadsTheWinds(m)) &&
    m.accompanied >= rule.accompanied &&
    (m.exposed === null || m.exposed >= rule.exposed)
  );
}

/**
 * Measures each seat for the soloist rule (design 3.8).
 *
 * @param seats The seats, with the player counts of the size rule and their voices.
 * @param notes The notes of the seats, sorted by start.
 * @param durationSec The time of the last note-off.
 * @returns The measures of each seat, or `null` for a seat that is not a candidate.
 */
export function measureSoloists(
  seats: readonly SoloSeat[],
  notes: readonly SoloNote[],
  durationSec: number,
): (SoloMeasures | null)[] {
  const first = notes[0];
  if (!first) {
    return seats.map(() => null);
  }
  const steps = Math.ceil(durationSec / SOLOIST_RULE.stepSec) + 1;
  const grids = gridOf(seats, notes, steps);
  const span = [Math.round(first.startSec / SOLOIST_RULE.stepSec), steps] as const;
  return seats.map((_, i) => measure(i, seats, grids, span));
}

/**
 * Finds the soloist of a score: the seat that sits at the front left of the conductor, as in a
 * concerto (design 3.8, 4.2). A piano seat with players ({@link isPianoSeat}) is the soloist,
 * because a piano with an orchestra has the layout of a piano concerto. Else the soloist is the
 * one seat that clearly leads ({@link SOLOIST_RULE}). Two such seats, as in a double concerto,
 * give no soloist. A celesta, a harpsichord, or an organ is a soloist only by this rule. The
 * rule runs before the soloist gets its one player, so that a solo line of a string section is
 * found.
 *
 * @param seats The seats, with the player counts of the size rule and their voices.
 * @param notes The notes of the seats, sorted by start.
 * @param durationSec The time of the last note-off.
 * @returns The index of the seat, or `null` if no seat is the soloist.
 */
export function findSoloist(
  seats: readonly SoloSeat[],
  notes: readonly SoloNote[],
  durationSec: number,
): number | null {
  const piano = seats.findIndex((seat) => isPianoSeat(seat) && seat.playerCount > 0);
  if (piano >= 0) {
    return piano;
  }
  const soloists = measureSoloists(seats, notes, durationSec).flatMap((m, i) =>
    m && passesSoloistRule(m) ? [i] : [],
  );
  return soloists.length === 1 ? (soloists[0] ?? null) : null;
}
