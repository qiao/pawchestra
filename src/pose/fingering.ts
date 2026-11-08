import type { Steps } from '../score/steps.ts';
import type { InstrumentOf } from './family.ts';

/** The bowed strings of design 4.6. */
type Bowed = InstrumentOf<'bowed'>;

/** The open strings of each bowed string, low to high, as MIDI keys (design 4.6). */
export const TUNINGS = {
  violin: [55, 62, 69, 76],
  viola: [48, 55, 62, 69],
  cello: [36, 43, 50, 57],
  contrabass: [28, 33, 38, 43],
} as const satisfies Readonly<Record<Bowed, readonly number[]>>;

/**
 * The semitones from the open string to the end of the fingerboard. The left hand reaches the
 * end of the target `fingerboard` at this interval.
 */
const FINGERBOARD_SEMITONES = 20;

/**
 * Gives the place of a stop on the target `fingerboard`. The place follows the string length:
 * one octave is half of the string.
 *
 * @param semitones The semitones above the open string. A value below 1 gives the place of 1.
 * @returns 0 at the nut, 1 at the end of the fingerboard.
 */
export function fingerboardPlace(semitones: number): number {
  const k = Math.max(1, semitones);
  return (1 - 2 ** (-k / 12)) / (1 - 2 ** (-FINGERBOARD_SEMITONES / 12));
}

/**
 * The hand frame of a bowed string: the notes that the four fingers reach in one position
 * (`docs/reference/string-technique.md`, section 1.2).
 */
interface HandFrame {
  /**
   * The notes that the fingers reach in a neck position with no extension, as semitones from the
   * position. The position is the place of the first finger: a whole tone above the open string
   * in the first position. The first finger of the violin and the viola also takes the semitone
   * below it.
   */
  readonly reach: readonly [low: number, high: number];
  /** The semitones that an extension or a pivot adds below and above {@link HandFrame.reach}. */
  readonly extend: readonly [down: number, up: number];
  /** The finger of each semitone of the reach and of its extensions, from the lowest: 1 to 4. */
  readonly fingers: readonly number[];
  /** The lowest position of the thumb position, in semitones. `Infinity` for no thumb position. */
  readonly thumbFrom: number;
  /** The reach of the thumb position, in semitones from the thumb (0) up. */
  readonly thumbReach: number;
  /** The finger of each semitone of the thumb position, from the thumb (0). */
  readonly thumbFingers: readonly number[];
  /** The highest position: the semitones of the first finger (or the thumb) above the open string. */
  readonly top: number;
}

/**
 * The hand frame of each bowed string (`docs/reference/string-technique.md`, section 1.2): the
 * violin and the viola reach a perfect fourth from the first finger to the fourth finger, the
 * cello a minor third (a major third with an extension), and the contrabass a whole tone (the
 * closed hand of Simandl). The cello and the contrabass have a thumb position from the octave.
 */
export const HAND_FRAMES = {
  violin: {
    reach: [-1, 5],
    extend: [0, 1],
    fingers: [1, 1, 2, 2, 3, 3, 4, 4],
    thumbFrom: Infinity,
    thumbReach: 5,
    thumbFingers: [],
    top: 15,
  },
  viola: {
    reach: [-1, 5],
    extend: [0, 1],
    fingers: [1, 1, 2, 2, 3, 3, 4, 4],
    thumbFrom: Infinity,
    thumbReach: 5,
    thumbFingers: [],
    top: 13,
  },
  cello: {
    reach: [0, 3],
    extend: [1, 1],
    fingers: [1, 1, 2, 3, 4, 4],
    thumbFrom: 12,
    thumbReach: 5,
    thumbFingers: [0, 1, 1, 2, 2, 3],
    top: 19,
  },
  contrabass: {
    reach: [0, 2],
    extend: [1, 1],
    fingers: [1, 1, 2, 4, 4],
    thumbFrom: 12,
    thumbReach: 4,
    thumbFingers: [0, 1, 2, 3, 3],
    top: 19,
  },
} as const satisfies Readonly<Record<Bowed, HandFrame>>;

/** The weights of the cost of a plan of the left hand. The unit is free: only the ratios count. */
interface FingeringCosts {
  /** The cost of each shift. */
  readonly shift: number;
  /** The cost of each semitone of a shift. */
  readonly shiftPerSemitone: number;
  /**
   * The time that makes a shift twice as costly, in seconds: the cost of a shift is multiplied by
   * `1 + quickSec / dt`, where `dt` is the time from the start of the last note to the new note.
   */
  readonly quickSec: number;
  /**
   * The factor of the cost of a shift when the hand is free before the note: after an open
   * string, or after a rest of at least {@link FingeringCosts.freeGapSec}.
   */
  readonly freeShift: number;
  /** A rest of at least this length frees the hand for a shift, in seconds. */
  readonly freeGapSec: number;
  /** The cost of each semitone of the position above {@link FingeringCosts.homePosition}. */
  readonly height: number;
  /** The position with no height cost: the first position. */
  readonly homePosition: number;
  /** The extra cost of the half position (the first finger one semitone above the nut). */
  readonly halfPosition: number;
  /** The extra cost of a note in the thumb position. */
  readonly thumb: number;
  /** The cost of a note that needs an extension of the hand frame. */
  readonly extension: number;
  /** The cost of an open string for a short note. */
  readonly open: number;
  /** The cost of an open string for a note of at least {@link FingeringCosts.longSec}. */
  readonly openLong: number;
  /** A note of at least this length wants vibrato, so an open string costs more, in seconds. */
  readonly longSec: number;
  /** The cost of each string that the bow crosses from one stroke to the next. */
  readonly crossing: number;
}

/**
 * The weights of the plan of the left hand (`docs/reference/string-technique.md`, section 3.1):
 * the orchestral style, with low positions and open strings. A shift costs more in a fast passage
 * and less after an open string or a rest. A high position, an extension, an open string of a
 * long note, and a string crossing also cost.
 */
export const FINGERING_COSTS: FingeringCosts = {
  shift: 3,
  shiftPerSemitone: 0.4,
  quickSec: 0.15,
  freeShift: 0.3,
  freeGapSec: 0.15,
  height: 0.4,
  homePosition: 2,
  halfPosition: 1,
  thumb: 2,
  extension: 2,
  open: -0.1,
  openLong: 1.5,
  longSec: 0.6,
  crossing: 0.2,
};

/** The pitches and the times of one stroke, the input of {@link planHandSteps}. */
export interface StrokePitch {
  /** The note start, in song seconds. */
  readonly start: number;
  /** The end of the sound, in song seconds. */
  readonly end: number;
  /** The lowest MIDI key of the stroke. A key below the high key makes a double stop. */
  readonly low: number;
  /** The highest MIDI key of the stroke. */
  readonly high: number;
}

/** The plan of the left hand for one stroke. */
export interface HandStep {
  /** The position: the semitones of the first finger (or the thumb) above the open string. */
  readonly position: number;
  /** The middle of the hand frame on the target `fingerboard`: 0 at the nut, 1 at the end. */
  readonly place: number;
  /**
   * The reach of the finger of the high note from the middle of the frame, from -1 (the lowest
   * note of the frame) to 1 (the highest note). An open string keeps the reach of the stroke
   * before it, because no finger moves.
   */
  readonly reach: number;
  /**
   * The string under the finger of the high note, from 0 (the lowest) to 3. An open string keeps
   * the string of the stroke before it.
   */
  readonly stopString: number;
  /** The finger of the high note: 0 for an open string or the thumb, 1 to 4 for a finger. */
  readonly finger: number;
  /** True when the high note is an open string: no finger presses it. */
  readonly open: boolean;
  /** The semitones of the high note above its open string. 0 for an open string. */
  readonly semitones: number;
}

/** The bow string and the hand of one stroke, the output of {@link planHandSteps}. */
interface FingeredStroke {
  /** The string of the bow, from 0 (the lowest) to 3. A double stop lies between two strings. */
  readonly string: number;
  /** The plan of the left hand. */
  readonly hand: HandStep;
}

/** One candidate of a stroke for the search. */
interface Candidate {
  /** The string of the bow: a double stop lies between two strings. */
  readonly string: number;
  /** The string of the high note. */
  readonly top: number;
  /** The position of the hand ({@link HandStep.position}). */
  readonly position: number;
  /** True when the high note is an open string. */
  readonly open: boolean;
  /** The finger of the high note ({@link HandStep.finger}). */
  readonly finger: number;
  /** The semitones of the high note above its open string. */
  readonly semitones: number;
  /** The cost of the candidate alone. */
  readonly cost: number;
}

/**
 * Gives the reach of the hand frame in a position, with no extension.
 *
 * @param frame The hand frame.
 * @param position The position.
 * @returns The lowest and the highest semitone from the position.
 */
function reachAt(frame: HandFrame, position: number): readonly [number, number] {
  return position >= frame.thumbFrom ? [0, frame.thumbReach] : frame.reach;
}

/**
 * Gives the place of the middle of the hand frame in a position. The place stops at the end of
 * the fingerboard.
 *
 * @param frame The hand frame.
 * @param position The position.
 * @returns The place on the target `fingerboard`: 0 at the nut, 1 at the end.
 */
export function handPlaceOf(frame: HandFrame, position: number): number {
  const [low, high] = reachAt(frame, position);
  return fingerboardPlace(Math.min(FINGERBOARD_SEMITONES, position + (low + high) / 2));
}

/**
 * Gives the reach of a stopped note from the middle of the hand frame.
 *
 * @param frame The hand frame.
 * @param position The position.
 * @param semitones The semitones of the note above the open string.
 * @returns -1 at the lowest note of the frame, 1 at the highest, and the ends past them.
 */
function reachOf(frame: HandFrame, position: number, semitones: number): number {
  const [low, high] = reachAt(frame, position);
  const half = (high - low) / 2;
  const offset = semitones - position - (low + high) / 2;
  return half > 0 ? Math.min(1, Math.max(-1, offset / half)) : 0;
}

/**
 * Gives the finger that stops a note in a position.
 *
 * @param frame The hand frame.
 * @param position The position.
 * @param semitones The semitones of the note above the open string.
 * @returns 0 for the thumb, 1 (the index finger) to 4.
 */
function fingerOf(frame: HandFrame, position: number, semitones: number): number {
  const offset = semitones - position;
  if (position >= frame.thumbFrom) {
    return frame.thumbFingers[Math.min(frame.thumbReach, Math.max(0, offset))] ?? 3;
  }
  const first = frame.reach[0] - frame.extend[0];
  return frame.fingers[offset - first] ?? 4;
}

/**
 * Gives the candidates of one note on one string: one for each position that reaches it.
 *
 * @param frame The hand frame.
 * @param costs The weights of the cost.
 * @param string The string.
 * @param semitones The semitones above the open string.
 * @param duration The note length, in seconds.
 * @returns The positions with their finger and their cost.
 */
function placesOf(
  frame: HandFrame,
  costs: FingeringCosts,
  string: number,
  semitones: number,
  duration: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (let position = 1; position <= frame.top; position++) {
    const thumb = position >= frame.thumbFrom;
    let height = costs.height * Math.max(0, position - costs.homePosition);
    if (position < costs.homePosition) {
      height += costs.halfPosition;
    }
    if (thumb) {
      height += costs.thumb;
    }
    if (semitones === 0) {
      const open = duration >= costs.longSec ? costs.openLong : costs.open;
      out.push({
        string,
        top: string,
        position,
        open: true,
        finger: 0,
        semitones,
        cost: open + height,
      });
      continue;
    }
    const [low, high] = reachAt(frame, position);
    const offset = semitones - position;
    const [down, up] = thumb ? [0, 0] : frame.extend;
    if (offset < low - down || offset > high + up) {
      continue;
    }
    const extended = offset < low || offset > high;
    out.push({
      string,
      top: string,
      position,
      open: false,
      finger: fingerOf(frame, position, semitones),
      semitones,
      cost: height + (extended ? costs.extension : 0),
    });
  }
  return out;
}

/**
 * Gives the candidates of a stroke: a single note on each string that has it, or a double stop
 * on two neighbor strings in one position.
 *
 * @param stroke The stroke.
 * @param tuning The open strings, low to high, as MIDI keys.
 * @param frame The hand frame.
 * @param costs The weights of the cost.
 * @returns The candidates. A pitch below the lowest string takes the lowest open string, and a
 *   pitch above the highest place takes the highest place.
 */
function candidatesOf(
  stroke: StrokePitch,
  tuning: readonly number[],
  frame: HandFrame,
  costs: FingeringCosts,
): Candidate[] {
  const duration = stroke.end - stroke.start;
  const lowest = tuning[0] ?? 0;
  const topString = tuning.length - 1;
  const highestKey = (tuning[topString] ?? 0) + frame.top + frame.thumbReach;
  const clampKey = (key: number): number => Math.min(highestKey, Math.max(lowest, key));
  const high = clampKey(stroke.high);
  const low = clampKey(stroke.low);

  const singles = (key: number): Candidate[] =>
    tuning.flatMap((open, string) =>
      key >= open ? placesOf(frame, costs, string, key - open, duration) : [],
    );
  if (high === low) {
    return singles(high);
  }

  // A double stop: the high note on a string, and the low note on the string below, in the same
  // position. The bow lies between the two strings.
  const out: Candidate[] = [];
  for (let string = 1; string < tuning.length; string++) {
    const upper = tuning[string] ?? 0;
    const under = tuning[string - 1] ?? 0;
    if (high < upper || low < under) {
      continue;
    }
    const tops = placesOf(frame, costs, string, high - upper, duration);
    const bottoms = placesOf(frame, costs, string - 1, low - under, duration);
    for (const t of tops) {
      const b = bottoms.find((c) => c.position === t.position);
      if (b) {
        out.push({ ...t, string: string - 0.5, cost: t.cost + b.cost });
      }
    }
  }
  return out.length > 0 ? out : singles(high);
}

/** The number of strokes in one step of {@link planHandSteps}. */
const STROKES_PER_STEP = 200;

/**
 * Plans the left hand of one bowed string player (design 5.3). The hand keeps its position while
 * the fingers reach the notes on all strings, and shifts only when the shift costs less than each
 * other choice: a search over the candidates of each stroke (a Viterbi search) finds the plan of
 * the lowest cost. A shift costs more in a fast passage and less after an open string or a rest,
 * because the hand then has time to move. A high position, an extension, an open string of a long
 * note, and a string crossing also cost. Pure: the same strokes give the same plan, so the pose
 * after a seek is the same. The plan runs in steps (design 7.2).
 *
 * @param strokes The strokes of the player, sorted by start.
 * @param tuning The open strings, low to high, as MIDI keys.
 * @param frame The hand frame of the instrument.
 * @param costs The weights of the cost.
 * @returns The steps, which return the bow string and the hand of each stroke.
 * @throws Error if a stroke has no candidate.
 */
export function* planHandSteps(
  strokes: readonly StrokePitch[],
  tuning: readonly number[],
  frame: HandFrame,
  costs: FingeringCosts,
): Steps<FingeredStroke[]> {
  const layers: Candidate[][] = [];
  for (const [i, stroke] of strokes.entries()) {
    if (i % STROKES_PER_STEP === STROKES_PER_STEP - 1) {
      yield;
    }
    layers.push(candidatesOf(stroke, tuning, frame, costs));
  }
  yield;
  const totals: Float64Array[] = [];
  const from: Int32Array[] = [];
  // The fields of the candidates of the stroke before, as typed arrays for the inner loop.
  let positions = new Int32Array(0);
  let strings = new Float64Array(0);
  let opens = new Uint8Array(0);
  for (const [i, layer] of layers.entries()) {
    if (i % STROKES_PER_STEP === STROKES_PER_STEP - 1) {
      yield;
    }
    const n = layer.length;
    const total = new Float64Array(n);
    const back = new Int32Array(n).fill(-1);
    const previousTotal = totals[i - 1];
    const stroke = strokes[i];
    const before = strokes[i - 1];
    if (!previousTotal || !stroke || !before) {
      for (let j = 0; j < n; j++) {
        total[j] = layer[j]?.cost ?? Infinity;
      }
    } else {
      const dt = Math.max(1e-3, stroke.start - before.start);
      const quick = 1 + costs.quickSec / dt;
      const rested = stroke.start - before.end >= costs.freeGapSec;
      const m = previousTotal.length;
      for (let j = 0; j < n; j++) {
        const c = layer[j];
        if (!c) {
          continue;
        }
        let best = Infinity;
        let arg = -1;
        for (let k = 0; k < m; k++) {
          const position = positions[k] ?? 0;
          let move = 0;
          if (position !== c.position) {
            const free = opens[k] === 1 || rested ? costs.freeShift : 1;
            const distance = Math.abs(position - c.position);
            move = (costs.shift + costs.shiftPerSemitone * distance) * quick * free;
          }
          const value =
            (previousTotal[k] ?? Infinity) +
            move +
            costs.crossing * Math.abs((strings[k] ?? 0) - c.string);
          if (value < best) {
            best = value;
            arg = k;
          }
        }
        total[j] = best + c.cost;
        back[j] = arg;
      }
    }
    totals.push(total);
    from.push(back);
    positions = Int32Array.from(layer, (c) => c.position);
    strings = Float64Array.from(layer, (c) => c.string);
    opens = Uint8Array.from(layer, (c) => (c.open ? 1 : 0));
  }

  yield;
  // Walk back from the cheapest end.
  const picks = Array.from({ length: layers.length }, () => 0);
  const last = totals[totals.length - 1];
  if (last) {
    let arg = 0;
    for (let j = 1; j < last.length; j++) {
      if ((last[j] ?? Infinity) < (last[arg] ?? Infinity)) {
        arg = j;
      }
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      picks[i] = arg;
      arg = from[i]?.[arg] ?? 0;
    }
  }

  // An open string keeps the finger place of the stroke before it.
  let reach = 0;
  let stopString = -1;
  return layers.map((layer, i): FingeredStroke => {
    const c = layer[picks[i] ?? 0];
    if (!c) {
      throw new Error(`Stroke ${i} has no candidate.`);
    }
    if (!c.open) {
      reach = reachOf(frame, c.position, c.semitones);
      stopString = c.top;
    } else if (stopString < 0) {
      stopString = c.top;
    }
    return {
      string: c.string,
      hand: {
        position: c.position,
        place: handPlaceOf(frame, c.position),
        reach,
        stopString,
        finger: c.finger,
        open: c.open,
        semitones: c.semitones,
      },
    };
  });
}
