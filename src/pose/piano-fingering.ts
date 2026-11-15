import { PIANO, PIANO_SCALE, isBlack, pianoKeyPosition } from '../models/instruments/piano.ts';
import type { Steps } from '../score/steps.ts';

/** The keys and the times of one note of one hand that the fingering plan reads (design 5.3). */
interface FingeringNote {
  /** The start of the note, in song seconds. */
  readonly start: number;
  /** The latest end of the keys of the note, in song seconds. */
  readonly end: number;
  /** The MIDI keys of the note, sorted up. Empty for a hand that only moves. */
  readonly keys: readonly number[];
  /**
   * The semitones that the palm stands from the keys, away from the other hand: up for a positive
   * value (`HandNote.shift`). The plan picks the fingers that move the palm this far, so the claws
   * stay on their keys. 0 when it is missing.
   */
  readonly shift?: number;
}

/** The size and the claws of the paw that plays the fingering (design 5.3). */
interface PianoPaw {
  /** The size of the hand, as a part of a human hand: the spans of the table scale with it. */
  readonly spanScale: number;
  /** The distance between the tips of two claws in a row, in white keys. */
  readonly clawPitch: number;
}

/**
 * The paw of the polar bear: a row of 5 claws about 9.7 cm wide in the app, so the claws
 * stand about 24 mm apart, 0.87 of a white key. A human hand of 0.9 times the size takes the
 * spans times 0.9 (`docs/reference/piano-technique.md` section 9.2), and the paw spans a little
 * less than its claw row.
 */
export const POLAR_BEAR_PAW: PianoPaw = { spanScale: 0.85, clawPitch: 0.87 };

/** The width of one white key of the piano, in meters. */
const WHITE_KEY = (PIANO.keyboardWidth / 52) * PIANO_SCALE;

/**
 * Gives the place of the tip of a claw along the keys, from the tip of claw 3 (design 5.3). The
 * palm faces down, so the thumb of the right paw lies toward the low keys, and the thumb of the
 * left paw toward the high keys.
 *
 * @param finger The finger: 1 (the thumb) to 5.
 * @param side The hand.
 * @param paw The paw.
 * @returns The offset along the keys, in meters: positive toward the high keys.
 */
export function clawOffset(finger: number, side: 'L' | 'R', paw: PianoPaw): number {
  return (side === 'R' ? finger - 3 : 3 - finger) * paw.clawPitch * WHITE_KEY;
}

/** The fingering of the notes of one hand (design 5.3). */
export interface PianoFingering {
  /** The first entry of each hand note in `keys` and `fingers`, then the end: notes + 1 entries. */
  readonly first: Uint32Array;
  /** The MIDI key of each pressed key, sorted up inside each hand note. */
  readonly keys: Uint8Array;
  /** The finger of each pressed key: 1 (the thumb) to 5 (the little finger). */
  readonly fingers: Uint8Array;
  /**
   * The pass of the thumb at each hand note: +1 when the thumb passes under the hand to its key,
   * -1 when a finger crosses over the thumb, else 0.
   */
  readonly pass: Int8Array;
}

/**
 * The points of the cost of a fingering (design 5.3): the 12 rules of Parncutt et al., with the
 * points of `docs/reference/piano-technique.md` section 9.2, and the rules of a real score.
 */
const PIANO_FINGERING_COSTS = {
  /** Rule 1: the points for each semitone past MaxComf or below MinComf. */
  stretch: 2,
  /** Rules 2 and 3: the points for each semitone past the relaxed span, for a pair with the thumb. */
  relaxedThumb: 1,
  /** Rules 2 and 3: the points for each semitone past the relaxed span, for other pairs. */
  relaxed: 2,
  /** Rule 4: the points of a full position change (the thumb plays the middle note between). */
  positionFull: 2,
  /** Rule 4: the points of a half position change. */
  positionHalf: 1,
  /** Rule 5: the points for each semitone of a position change past the comfortable span. */
  positionSize: 1,
  /**
   * The points for each white key that a claw of a chord stands off its key, when the palm stands
   * over the mean of the keys (`PianoPaw.clawPitch`). The claws of a paw keep their distance, so
   * a chord takes the fingers that fit its keys.
   */
  clawFit: 2,
  /** Rule 6: the points of finger 4 or 5. */
  weak: 1,
  /** Rule 7: the points of a run of the fingers 3, 4, and 5 in any order. */
  threeFourFive: 1,
  /** Rule 8: the points of finger 3 followed by finger 4. */
  threeToFour: 1,
  /** Rule 9: the points of finger 3 on a white key next to finger 4 on a black key. */
  fourOnBlack: 1,
  /** Rule 10: the points of the thumb on a black key. */
  thumbOnBlack: 1,
  /** Rules 10 and 11: the points of a white key before or after the thumb or finger 5 on black. */
  blackNextToWhite: 2,
  /** Rule 12: the points of a pass on one level (white to white, black to black). */
  passLevel: 1,
  /** Rule 12: the points of a finger on a white key below the thumb on a black key in a pass. */
  passUnderBlack: 3,
  /**
   * The points of a move of the whole hand between two notes that are not legato, plus
   * {@link PIANO_FINGERING_COSTS.jumpSemitone} for each semitone of the move of the hand center.
   */
  jump: 4,
  /** The points for each semitone of the move of the hand center in a jump. */
  jumpSemitone: 1,
  /**
   * The points for each semitone of the move of the hand center from a chord or to a chord. The
   * arm carries the hand from chord to chord, so the move has no fixed points.
   */
  chordSemitone: 0.5,
  /**
   * The points for each white key that the palm stands nearer to the other hand than the shift of
   * the note asks (`FingeringNote.shift`). Thus a paw near the other paw takes the claws on the
   * side of the other paw, and each claw stays on its key. A palm that moved off its claws by the
   * shift jumped 12 cm between two notes of `bach-bwv1050`.
   */
  room: 4,
  /** The points of a pair past MinPrac or MaxPrac in legato: a hard limit. */
  hard: 1000,
  /** The points of the same finger on the same key within {@link PIANO_FINGERING_COSTS.repeatSec}. */
  repeat: 3,
  /** A repeat with less time than this between the starts changes fingers, such as 3-2-1. */
  repeatSec: 0.2,
  /** A note is legato when the note before ends less than this before its start, in seconds. */
  legatoSec: 0.05,
  /** After a rest of at least this length, in seconds, the hand is free to change position. */
  freeSec: 0.25,
  /** After such a rest, rules 4 and 5 cost this part of their points. */
  freeShare: 0.3,
} as const;

/**
 * The finger spans of the right hand in semitones, from Parncutt et al. table 1 (design 5.3), for
 * each pair of fingers from the lower to the higher finger: MinPrac, MinComf, MinRel, MaxRel,
 * MaxComf, and MaxPrac.
 */
const PIANO_SPANS = [
  { from: 1, to: 2, spans: [-5, -3, 1, 5, 8, 10] },
  { from: 1, to: 3, spans: [-4, -2, 3, 7, 10, 12] },
  { from: 1, to: 4, spans: [-3, -1, 5, 9, 12, 14] },
  { from: 1, to: 5, spans: [-1, 1, 7, 10, 13, 15] },
  { from: 2, to: 3, spans: [1, 1, 1, 2, 3, 5] },
  { from: 2, to: 4, spans: [1, 1, 3, 4, 5, 7] },
  { from: 2, to: 5, spans: [2, 2, 5, 6, 8, 10] },
  { from: 3, to: 4, spans: [1, 1, 1, 2, 2, 4] },
  { from: 3, to: 5, spans: [1, 1, 3, 4, 5, 7] },
  { from: 4, to: 5, spans: [1, 1, 1, 2, 3, 5] },
] as const;

/**
 * The place of each finger in a hand at rest on C, D, E, F, and G, in semitones from finger 3. The
 * hand center of a finger on a key is the key minus this offset.
 */
const FINGER_OFFSETS = [0, -4, -2, 0, 1, 3] as const;

/** The number of hand notes in one step of {@link planFingeringSteps}. */
const NOTES_PER_STEP = 200;

/** The limits of the spans of each ordered pair of fingers, after the span scale. */
interface SpanLimits {
  /** MinPrac, MinComf, MinRel, MaxRel, MaxComf, and MaxPrac of the pair (a, b) at 6 * (6 a + b). */
  readonly values: Int32Array;
}

/**
 * Scales the span table for a hand of a size, and makes the limits of each ordered pair of fingers.
 * A pair from the higher to the lower finger takes the values of the reverse pair, negated, with
 * Min and Max swapped.
 *
 * @param scale The size of the hand, as a part of a human hand.
 * @returns The limits.
 */
function spanLimits(scale: number): SpanLimits {
  const values = new Int32Array(6 * 36);
  for (const { from: a, to: b, spans } of PIANO_SPANS) {
    const row = spans.map((v) => Math.round(v * scale));
    for (let k = 0; k < 6; k++) {
      values[6 * (6 * a + b) + k] = row[k] ?? 0;
      values[6 * (6 * b + a) + k] = -(row[5 - k] ?? 0);
    }
  }
  return { values };
}

/** One sounding note of a hand in the search: its keys in the axes of a right hand. */
interface SearchNote {
  /** The index of the note in the notes of the hand. */
  readonly index: number;
  readonly start: number;
  readonly end: number;
  /** The keys, sorted up. A left hand plays mirrored keys: the negated keys. */
  readonly keys: Int32Array;
  /** 1 for a black key, in the order of `keys`. */
  readonly black: Uint8Array;
  /** The place of each key along the keys, in white keys, in the axes of a right hand. */
  readonly places: Float64Array;
  /** The finger choices: the fingers of each key, in the order of `keys`. */
  readonly choices: readonly Uint8Array[];
  /**
   * The distance of the palm from the mean of the keys that the shift of the note asks, in white
   * keys, in the axes of a right hand: positive away from the other hand.
   */
  readonly away: number;
}

/** The choice of finger 3 alone: a fallback for a missing choice. */
const MIDDLE_FINGER = Uint8Array.of(3);

/** The finger choices of a chord of each size up to 5 keys: the fingers rise with the keys. */
const CHOICES: readonly (readonly Uint8Array[])[] = [0, 1, 2, 3, 4, 5].map((size) => {
  const out: Uint8Array[] = [];
  const pick = (from: number, chosen: number[]): void => {
    if (chosen.length === size) {
      out.push(Uint8Array.from(chosen));
      return;
    }
    for (let f = from; f <= 5; f++) {
      pick(f + 1, [...chosen, f]);
    }
  };
  pick(1, []);
  return out;
});

/**
 * Gives the finger choices of the keys of a note (design 5.3). The fingers of a chord do not
 * cross. An octave takes 1-5, or 1-4 when its upper key is black. A chord of more than 5 keys
 * gives 1 and 5 to its outer keys, and its inner keys take 2, 3, and 4 by their place.
 *
 * @param keys The keys in the axes of a right hand, sorted up.
 * @param black 1 for a black key, in the order of `keys`.
 * @returns The choices.
 */
function choicesOf(keys: Int32Array, black: Uint8Array): readonly Uint8Array[] {
  const n = keys.length;
  if (n === 2 && (keys[1] ?? 0) - (keys[0] ?? 0) === 12) {
    return [Uint8Array.of(1, black[1] ? 4 : 5)];
  }
  if (n <= 5) {
    return CHOICES[n] ?? [];
  }
  const fingers = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    fingers[j] = j === 0 ? 1 : j === n - 1 ? 5 : 2 + Math.round((2 * (j - 1)) / (n - 3));
  }
  return [fingers];
}

/**
 * Plans the fingering of the notes of one piano hand (design 5.3): the fingering of the lowest
 * cost by the rules of {@link PIANO_FINGERING_COSTS}. A second-order dynamic program keeps a node
 * for each pair of finger choices of two notes in a row, so the rules of three notes are exact.
 * The left hand mirrors the right hand. The plan runs in steps (design 7.2).
 *
 * @param notes The notes of the hand, sorted by start.
 * @param side The hand: `L` or `R`.
 * @param paw The size and the claws of the paw.
 * @returns The steps, which return the fingering.
 */
export function* planFingeringSteps(
  notes: readonly FingeringNote[],
  side: 'L' | 'R',
  paw: PianoPaw,
): Steps<PianoFingering> {
  const c = PIANO_FINGERING_COSTS;
  const { spanScale, clawPitch } = paw;
  const limits = spanLimits(spanScale).values;
  const mirror = side === 'R' ? 1 : -1;
  const sounding: SearchNote[] = [];
  for (const [index, note] of notes.entries()) {
    if (note.keys.length === 0) {
      continue;
    }
    const n = note.keys.length;
    const keys = new Int32Array(n);
    const black = new Uint8Array(n);
    const places = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      // A left hand reads its keys down, as mirrored keys up.
      const k = note.keys[side === 'R' ? j : n - 1 - j] ?? 0;
      keys[j] = mirror * k;
      black[j] = isBlack(k) ? 1 : 0;
      places[j] = (mirror * pianoKeyPosition(k)[0]) / WHITE_KEY;
    }
    const choices = choicesOf(keys, black);
    const away = (mirror * (note.shift ?? 0) * 7) / 12;
    sounding.push({ index, start: note.start, end: note.end, keys, black, places, choices, away });
  }

  const limit = (a: number, b: number, k: number): number => limits[6 * (6 * a + b) + k] ?? 0;

  /** The points of the span rules 1, 2, and 3 of a pair of different fingers. */
  const spanCost = (a: number, b: number, s: number): number => {
    const relaxed = a === 1 || b === 1 ? c.relaxedThumb : c.relaxed;
    return (
      c.stretch * (Math.max(0, s - limit(a, b, 4)) + Math.max(0, limit(a, b, 1) - s)) +
      relaxed * (Math.max(0, limit(a, b, 2) - s) + Math.max(0, s - limit(a, b, 3)))
    );
  };

  /** Gives +1 for a thumb pass under, -1 for a finger over the thumb, else 0. */
  const passOf = (a: number, b: number, s: number): number => {
    if (a > 1 && b === 1 && s > 0) {
      return 1;
    }
    return a === 1 && b > 1 && s < 0 ? -1 : 0;
  };

  /** The points of one key of a note to one key of the next note. */
  const stepCost = (
    a: number,
    pa: number,
    blackA: number,
    b: number,
    pb: number,
    blackB: number,
    legato: boolean,
    gap: number,
    chord: boolean,
  ): number => {
    const s = pb - pa;
    const move = Math.abs(s - spanScale * ((FINGER_OFFSETS[b] ?? 0) - (FINGER_OFFSETS[a] ?? 0)));
    const jump = chord ? c.chordSemitone * move : c.jump + c.jumpSemitone * move;
    if (a === b) {
      if (s === 0) {
        return gap < c.repeatSec ? c.repeat : 0;
      }
      return legato ? c.hard + jump : jump;
    }
    let cost = spanCost(a, b, s);
    if (a === 3 && b === 4) {
      cost += c.threeToFour;
    }
    if ((a === 3 && b === 4 && !blackA && blackB) || (a === 4 && b === 3 && blackA && !blackB)) {
      cost += c.fourOnBlack;
    }
    const pass = passOf(a, b, s);
    if (pass !== 0) {
      // The finger on the lower key, and the thumb on the upper key.
      const fingerBlack = pass > 0 ? blackA : blackB;
      const thumbBlack = pass > 0 ? blackB : blackA;
      if (fingerBlack === thumbBlack) {
        cost += c.passLevel;
      } else if (!fingerBlack && thumbBlack) {
        cost += c.passUnderBlack;
      }
    }
    // In a pass, the arm carries the hand to the next position, so a pass has no hard limit.
    if (pass === 0 && (s < limit(a, b, 0) || s > limit(a, b, 5))) {
      return legato ? c.hard + cost : Math.min(cost, jump);
    }
    return legato ? cost : Math.min(cost, jump);
  };

  /** The points of the keys and the fingers of one note alone. */
  const noteCost = (i: number, fingers: Uint8Array): number => {
    const note = sounding[i];
    if (!note) {
      return 0;
    }
    const before = sounding[i - 1];
    const after = sounding[i + 1];
    const whiteBefore = before && !before.black[0] ? 1 : 0;
    const whiteAfter = after && !after.black[0] ? 1 : 0;
    const topWhiteBefore = before && !before.black[before.black.length - 1] ? 1 : 0;
    const topWhiteAfter = after && !after.black[after.black.length - 1] ? 1 : 0;
    let cost = 0;
    let fingerSum = 0;
    for (let j = 0; j < fingers.length; j++) {
      const f = fingers[j] ?? 1;
      const black = note.black[j] ?? 0;
      fingerSum += f - 3;
      if (f >= 4) {
        cost += c.weak;
      }
      if (f === 1 && black) {
        cost += c.thumbOnBlack + c.blackNextToWhite * (whiteBefore + whiteAfter);
      }
      if (f === 5 && black) {
        cost += c.blackNextToWhite * (topWhiteBefore + topWhiteAfter);
      }
      if (j > 0) {
        const s = (note.keys[j] ?? 0) - (note.keys[j - 1] ?? 0);
        cost += spanCost(fingers[j - 1] ?? 1, f, s);
      }
    }
    if (note.away > 0) {
      // The palm stands from the mean of the keys by the offsets of the claws, in the other way.
      const palm = (-fingerSum / fingers.length) * clawPitch;
      cost += c.room * Math.max(0, note.away - palm);
    }
    return fingers.length > 1 ? cost + c.clawFit * clawMisfit(note, fingers) : cost;
  };

  /** The sum of the distances of the claws of a chord from their keys, in white keys. */
  const clawMisfit = (note: SearchNote, fingers: Uint8Array): number => {
    let palm = 0;
    for (let j = 0; j < fingers.length; j++) {
      palm += (note.places[j] ?? 0) - ((fingers[j] ?? 3) - 3) * clawPitch;
    }
    palm /= fingers.length;
    let misfit = 0;
    for (let j = 0; j < fingers.length; j++) {
      misfit += Math.abs((note.places[j] ?? 0) - ((fingers[j] ?? 3) - 3) * clawPitch - palm);
    }
    return misfit;
  };

  /** The points of the move from note i - 1 to note i. */
  const pairCost = (i: number, from: Uint8Array, to: Uint8Array): number => {
    const a = sounding[i - 1];
    const b = sounding[i];
    if (!a || !b) {
      return 0;
    }
    const gap = b.start - a.end;
    // A chord moves the whole hand to the next keys, so only single notes keep the legato limits.
    const chord = a.keys.length > 1 || b.keys.length > 1;
    const legato = gap < c.legatoSec && !chord;
    const repeatGap = b.start - a.start;
    const ta = from.length - 1;
    const tb = to.length - 1;
    let cost = stepCost(
      from[ta] ?? 1,
      a.keys[ta] ?? 0,
      a.black[ta] ?? 0,
      to[tb] ?? 1,
      b.keys[tb] ?? 0,
      b.black[tb] ?? 0,
      legato,
      repeatGap,
      chord,
    );
    if (ta > 0 || tb > 0) {
      cost += stepCost(
        from[0] ?? 1,
        a.keys[0] ?? 0,
        a.black[0] ?? 0,
        to[0] ?? 1,
        b.keys[0] ?? 0,
        b.black[0] ?? 0,
        legato,
        repeatGap,
        chord,
      );
    }
    return cost;
  };

  /**
   * Makes the points of the rules 4, 5, and 7 of three single notes: notes i - 2, i - 1, and i.
   * The arm carries the hand from chord to chord, so a group with a chord has no points.
   *
   * @returns The points for the fingers of the three notes, at 36 f1 + 6 f2 + f3, or null for a
   *   group with no points. Each call writes the same buffer.
   */
  const tripleBuffer = new Float64Array(216);
  const tripleCosts = (i: number): Float64Array | null => {
    const a = sounding[i - 2];
    const b = sounding[i - 1];
    const n = sounding[i];
    if (!a || !b || !n || a.keys.length > 1 || b.keys.length > 1 || n.keys.length > 1) {
      return null;
    }
    const share = b.start - a.end >= c.freeSec || n.start - b.end >= c.freeSec ? c.freeShare : 1;
    const p1 = a.keys[0] ?? 0;
    const p2 = b.keys[0] ?? 0;
    const s = (n.keys[0] ?? 0) - p1;
    const between = (p2 - p1) * ((n.keys[0] ?? 0) - p2) > 0;
    const out = tripleBuffer;
    for (let f1 = 1; f1 <= 5; f1++) {
      for (let f3 = 1; f3 <= 5; f3++) {
        // The span table has no limits for one finger: its comfortable span is 0.
        const minComf = f1 === f3 ? 0 : limit(f1, f3, 1);
        const maxComf = f1 === f3 ? 0 : limit(f1, f3, 4);
        const past = Math.max(0, s - maxComf) + Math.max(0, minComf - s);
        for (let f2 = 1; f2 <= 5; f2++) {
          let cost = 0;
          if (past > 0) {
            const full = f2 === 1 && between;
            cost += share * ((full ? c.positionFull : c.positionHalf) + c.positionSize * past);
          }
          if (f1 !== f2 && f2 !== f3 && f1 !== f3 && f1 >= 3 && f2 >= 3 && f3 >= 3) {
            cost += c.threeFourFive;
          }
          out[36 * f1 + 6 * f2 + f3] = cost;
        }
      }
    }
    return out;
  };

  // The forward pass. A node of note i is the pair (choice of note i - 1, choice of note i), at
  // the index j * (choices of note i) + k. Note 0 has one node for each choice. A plain function
  // does the work of one note, because the engine optimizes a loop in a generator less well.
  const back: Int16Array[] = [];
  let totals = new Float64Array(0);
  const advance = (i: number, note: SearchNote): void => {
    const cur = note.choices;
    // A typed array from a map function is slow in the engine, so a plain loop fills it.
    const own = new Float64Array(cur.length);
    for (let k = 0; k < cur.length; k++) {
      own[k] = noteCost(i, cur[k] ?? MIDDLE_FINGER);
    }
    if (i === 0) {
      totals = own;
      back.push(new Int16Array(0));
      return;
    }
    const prev = sounding[i - 1]?.choices ?? [];
    const next = new Float64Array(prev.length * cur.length);
    const from = new Int16Array(prev.length * cur.length);
    const older = i >= 2 ? (sounding[i - 2]?.choices.length ?? 0) : 0;
    const triple = i >= 2 ? tripleCosts(i) : null;
    for (let j = 0; j < prev.length; j++) {
      const fj = prev[j] ?? MIDDLE_FINGER;
      for (let k = 0; k < cur.length; k++) {
        const fk = cur[k] ?? fj;
        let best = Infinity;
        let bestH = 0;
        if (i === 1) {
          best = totals[j] ?? 0;
        } else {
          // A single note has one finger, so its choice index is the finger minus 1.
          const tail = triple ? 36 + 6 * (fj[0] ?? 1) + (fk[0] ?? 1) : 0;
          for (let h = 0; h < older; h++) {
            const extra = triple ? (triple[36 * h + tail] ?? 0) : 0;
            const total = (totals[h * prev.length + j] ?? Infinity) + extra;
            if (total < best) {
              best = total;
              bestH = h;
            }
          }
        }
        next[j * cur.length + k] = best + pairCost(i, fj, fk) + (own[k] ?? 0);
        from[j * cur.length + k] = bestH;
      }
    }
    totals = next;
    back.push(from);
  };
  for (const [i, note] of sounding.entries()) {
    if (i % NOTES_PER_STEP === NOTES_PER_STEP - 1) {
      yield;
    }
    advance(i, note);
  }
  yield;

  // The backward pass from the node of the lowest cost. Of equal costs, the lower index wins.
  const chosen = new Int32Array(sounding.length);
  let bestNode = 0;
  for (let n = 1; n < totals.length; n++) {
    if ((totals[n] ?? Infinity) < (totals[bestNode] ?? Infinity)) {
      bestNode = n;
    }
  }
  const last = sounding.length - 1;
  if (last === 0) {
    chosen[0] = bestNode;
  } else if (last > 0) {
    const lastSize = sounding[last]?.choices.length ?? 1;
    chosen[last] = bestNode % lastSize;
    chosen[last - 1] = Math.floor(bestNode / lastSize);
    for (let i = last; i >= 2; i--) {
      const size = sounding[i]?.choices.length ?? 1;
      const node = (chosen[i - 1] ?? 0) * size + (chosen[i] ?? 0);
      chosen[i - 2] = back[i]?.[node] ?? 0;
    }
  }

  return fingeringOf(notes, sounding, chosen, side);
}

/**
 * Writes the chosen fingers of the sounding notes into the arrays of a fingering, in the order of
 * the real keys. A note with no keys gets no entries.
 *
 * @param notes The notes of the hand.
 * @param sounding The sounding notes of the search.
 * @param chosen The chosen choice of each sounding note.
 * @param side The hand.
 * @returns The fingering.
 */
function fingeringOf(
  notes: readonly FingeringNote[],
  sounding: readonly SearchNote[],
  chosen: Int32Array,
  side: 'L' | 'R',
): PianoFingering {
  const first = new Uint32Array(notes.length + 1);
  for (const [i, note] of notes.entries()) {
    first[i + 1] = (first[i] ?? 0) + note.keys.length;
  }
  const total = first[notes.length] ?? 0;
  const keys = new Uint8Array(total);
  const fingers = new Uint8Array(total);
  const pass = new Int8Array(notes.length);
  let before: Uint8Array | null = null;
  let beforeKey = 0;
  for (const [s, search] of sounding.entries()) {
    const choice = search.choices[chosen[s] ?? 0] ?? search.choices[0] ?? new Uint8Array(0);
    const at = first[search.index] ?? 0;
    const n = search.keys.length;
    for (let j = 0; j < n; j++) {
      // The search keys of a left hand run down the real keys.
      const real = side === 'R' ? j : n - 1 - j;
      keys[at + real] = Math.abs(search.keys[j] ?? 0);
      fingers[at + real] = choice[j] ?? 1;
    }
    const top = choice[n - 1] ?? 1;
    const topKey = search.keys[n - 1] ?? 0;
    if (before) {
      const a = before[before.length - 1] ?? 1;
      const step = topKey - beforeKey;
      pass[search.index] =
        a > 1 && top === 1 && step > 0 ? 1 : a === 1 && top > 1 && step < 0 ? -1 : 0;
    }
    before = choice;
    beforeKey = topKey;
  }
  return { first, keys, fingers, pass };
}
