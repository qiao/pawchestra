import type { Vec3 } from '../models/tuples.ts';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { groupChords } from './note-groups.ts';
import { clamp01, smoothstep } from './rest.ts';

/** The times and the sizes of the hand motion of the piano and the harp (design 5.3). */
export const HAND_MOTION = {
  /** A hand moves to its next key or string in at most this time. */
  moveSec: 0.15,
  /** A piano hand moves in at most this part of the gap, and stays on its keys for the rest. */
  strikeMove: 0.6,
  /** A piano hand lifts this high in its move, at a gesture size of 1. */
  lift: 0.03,
  /**
   * A piano hand lifts its full height for a note at least this long after the note before, and
   * less for a nearer note, as the motion of a pianist gets smaller with the speed.
   */
  liftGapSec: 0.4,
  /**
   * A piano hand starts the move to a note with a pass of the thumb (`PianoFingering.pass`) at the
   * start of the note before, at most this long before the note, as a pianist prepares a thumb
   * pass up to 0.5 s before it (`docs/reference/piano-technique.md` section 9.3).
   */
  passSec: 0.5,
  /** A harp finger rests on its string for this time before the pluck: at most 0.2 of the gap. */
  restSec: 0.04,
  /** A pluck takes this time: at most 0.3 of the gap to the next note of the hand. */
  pluckSec: 0.08,
  /** A pluck pulls the palm this far from the strings, at a gesture size of 1. */
  pull: 0.025,
  /** One hand plays the notes of a chord within this span, in semitones. */
  span: 12,
  /** The keys of the left and the right hand before the first note: C3 and C5. */
  startKeys: [48, 72],
} as const;

/** The keys that each hand of a player reaches when it crosses over to the side of the other hand. */
export interface HandReach {
  /** The highest key of the left hand. */
  readonly leftHighest: number;
  /** The lowest key of the right hand. */
  readonly rightLowest: number;
}

/** The reach of two hands that cross over to each key: all MIDI keys. */
export const NO_REACH_LIMIT: HandReach = { leftHighest: 127, rightLowest: 0 };

/** How a hand plays: a piano hand strikes the keys, and a harp hand plucks the strings. */
export type HandAction = 'strike' | 'pluck';

/** The notes of a chord that one hand plays. */
export interface HandNote {
  /** The start of the chord, in song seconds. */
  readonly start: number;
  /** The latest end of the notes of the chord, in song seconds. */
  readonly end: number;
  /** The lowest and the highest key of the notes. */
  readonly low: number;
  readonly high: number;
  /**
   * The keys of the notes, sorted up, each key one time. Empty for a hand that only moves out of
   * the way of the other hand.
   */
  readonly keys: readonly number[];
  /** The highest loudness of the chord. */
  readonly loudness: number;
  /**
   * The start of the last note of either hand before the chord, for a chord that both hands move
   * to (`splitHands()` with a distance `apart`). The move of each hand then fits in the time since
   * that note, so that both moves take the same time. With no value, the move fits in the time
   * since the note before of the same hand.
   */
  readonly since?: number;
  /**
   * The semitones that the palm of the hand stands from its keys, up for a positive value, so that
   * it keeps away from the other hand (`splitHands()` with a distance `apart`). A piano hand gets
   * it from its fingering (`FingeringNote.shift`), so each claw stays on its key. 0 when it is
   * missing.
   */
  readonly shift?: number;
}

/**
 * Gives the notes of a player to its two hands (design 5.3). The left hand plays the low notes
 * and the right hand the high notes. A chord wider than one octave splits at its largest
 * interval that keeps each hand in its reach: the left hand plays the notes below it. Of two
 * equal intervals, the one nearer to the middle of the chord splits it. A chord within one octave
 * goes to the hand that is nearer to it, so that a melody stays in one hand. At the same
 * distance, it goes to the right hand from middle C up, and to the left hand below. A chord above
 * the reach of the left hand goes to the right hand, and a chord below the reach of the right
 * hand goes to the left hand, so that a melody changes hands where one hand cannot cross over the
 * other. These two rules also give a wide chord to one hand when all its keys are past the reach
 * of the other hand.
 *
 * With a distance `apart`, the middles of the keys of the two hands stay at least that far apart,
 * because two wide paws on near keys go into each other. When the middles of the two parts of a
 * chord wider than one octave are nearer, the palm of each hand asks for half of the difference
 * away from its keys (`HandNote.shift`), so that a bass and a melody stay in two hands. When a hand plays nearer
 * to the other hand, the other hand moves out of its way, away from it, at the start of the chord:
 * a note of loudness 0 on the key at that distance, with no sound.
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param reach The highest key of the left hand and the lowest key of the right hand. No limit by
 *   default.
 * @param apart The least distance between the middles of the keys of the two hands, in semitones,
 *   or 0 for no limit (the default).
 * @returns The notes of the left hand and of the right hand, sorted by start.
 */
export function splitHands(
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  reach: HandReach = NO_REACH_LIMIT,
  apart = 0,
): readonly [left: HandNote[], right: HandNote[]] {
  const left: HandNote[] = [];
  const right: HandNote[] = [];
  let lastLeft: number = HAND_MOTION.startKeys[0];
  let lastRight: number = HAND_MOTION.startKeys[1];
  // The start of the last note of either hand.
  let lastStart = -Infinity;
  for (const group of groupChords(notes, loudness)) {
    const keys = notes
      .slice(group.first, group.first + group.count)
      .map((n) => n.pitch)
      .toSorted((a, b) => a - b);
    const part = (low: number, high: number, shift = 0): HandNote => ({
      start: group.start,
      end: group.end,
      low,
      high,
      keys: [...new Set(keys.filter((k) => k >= low && k <= high))],
      loudness: group.loudness,
      shift,
    });
    let toLeft: HandNote | null = null;
    let toRight: HandNote | null = null;
    const cut = group.high - group.low > HAND_MOTION.span ? wideChordCut(keys, reach) : null;
    const below = cut === null ? group.low : (keys[cut - 1] ?? group.low);
    const above = cut === null ? group.high : (keys[cut] ?? group.high);
    const middle = (group.low + group.high) / 2;
    if (cut !== null) {
      // Each hand moves half of the missing distance away from the other hand.
      const lowMiddle = (group.low + below) / 2;
      const highMiddle = (above + group.high) / 2;
      const shift = Math.ceil(Math.max(0, apart - (highMiddle - lowMiddle)) / 2);
      toLeft = part(group.low, below, -shift);
      toRight = part(above, group.high, shift);
      lastLeft = lowMiddle - shift;
      lastRight = highMiddle + shift;
    } else {
      const fromLeft = Math.abs(middle - lastLeft);
      const fromRight = Math.abs(middle - lastRight);
      const nearerRight = fromRight < fromLeft || (fromRight === fromLeft && middle >= 60);
      if (group.low >= reach.rightLowest && (nearerRight || group.high > reach.leftHighest)) {
        toRight = part(group.low, group.high);
        lastRight = middle;
        if (apart > 0 && lastLeft > middle - apart) {
          lastLeft = Math.floor(middle - apart);
          toLeft = makeWay(group.start, lastLeft);
        }
      } else {
        toLeft = part(group.low, group.high);
        lastLeft = middle;
        if (apart > 0 && lastRight < middle + apart) {
          lastRight = Math.ceil(middle + apart);
          toRight = makeWay(group.start, lastRight);
        }
      }
    }
    if (toLeft && toRight && apart > 0 && Number.isFinite(lastStart)) {
      // Both hands move to the chord in the same time, so that they keep apart in the moves.
      toLeft = { ...toLeft, since: lastStart };
      toRight = { ...toRight, since: lastStart };
    }
    if (toLeft) {
      left.push(toLeft);
    }
    if (toRight) {
      right.push(toRight);
    }
    lastStart = group.start;
  }
  return [left, right];
}

/**
 * Makes the note of a hand that moves out of the way of the other hand (design 5.3): one key, with
 * the loudness 0, so that the hand makes its smallest lift. The note has no sound.
 *
 * @param start The start of the chord of the other hand, in song seconds.
 * @param key The key.
 * @returns The note of the hand.
 */
function makeWay(start: number, key: number): HandNote {
  return { start, end: start, low: key, high: key, keys: [], loudness: 0 };
}

/**
 * Finds where a chord wider than one octave splits (design 5.3): at its largest interval that
 * keeps the notes below it in the reach of the left hand and the notes above it in the reach of
 * the right hand. Of two equal intervals, the one nearer to the middle of the chord splits it.
 *
 * @param keys The keys of the chord, sorted up.
 * @param reach The highest key of the left hand and the lowest key of the right hand.
 * @returns The index of the lowest key of the right hand, or null when all keys are past the
 *   reach of one hand.
 */
function wideChordCut(keys: readonly number[], reach: HandReach): number | null {
  const gapAt = (i: number): number => (keys[i] ?? 0) - (keys[i - 1] ?? 0);
  const offMiddle = (i: number): number => Math.abs(i - keys.length / 2);
  let cut: number | null = null;
  for (let i = 1; i < keys.length; i++) {
    if ((keys[i - 1] ?? 0) > reach.leftHighest || (keys[i] ?? 0) < reach.rightLowest) {
      continue;
    }
    if (
      cut === null ||
      gapAt(i) > gapAt(cut) ||
      (gapAt(i) === gapAt(cut) && offMiddle(i) < offMiddle(cut))
    ) {
      cut = i;
    }
  }
  return cut;
}

/** The turns of a piano hand at each note (design 5.3). */
export interface HandTurns {
  /** The roll of the hand around the line of its fingers, in radians: + to the thumb side. */
  readonly rolls: Float64Array;
  /** The turn of the hand in the plane of the palm, in radians: + toward the high keys. */
  readonly yaws: Float64Array;
  /**
   * The place of the claw of the note along the keys, from the palm, in meters: the hand turns
   * around this claw, so that the claw stays on its key. 0 for a chord.
   */
  readonly pivots: Float64Array;
}

/** The note data of one hand that the pose looks up at each frame. */
export interface HandTrack {
  readonly action: HandAction;
  /** The place of the palm before the first note, in the model axes. */
  readonly first: Vec3;
  /** The start of each note of the hand, sorted. */
  readonly starts: Float64Array;
  /**
   * The start and the end of the move of the hand to each note. A strike ends its move at the
   * note start. A pluck ends it a short rest before the note start.
   */
  readonly moveStarts: Float64Array;
  readonly moveEnds: Float64Array;
  /** The time of the pluck of each note. 0 for a strike. */
  readonly pluckTimes: Float64Array;
  /** The place of the palm for each note, in the model axes: three numbers for each note. */
  readonly points: Float64Array;
  /**
   * The gesture size of each note (design 5.3). For a strike, it also holds the smaller lift of a
   * near note (`HAND_MOTION.liftGapSec`).
   */
  readonly gestures: Float64Array;
  /** The turns of the hand at each note, or `null` for a hand that does not turn. */
  readonly turns: HandTurns | null;
}

/**
 * Calculates the note data of one hand (design 5.3).
 *
 * @param notes The notes of the hand, sorted by start.
 * @param action How the hand plays.
 * @param pointOf Gives the place of the palm for the lowest and the highest key of a note and the
 *   index of the note, or -1 for the place before the first note.
 * @param amplitude The seeded amplitude of the player.
 * @param firstKey The key of the hand before its first note.
 * @param passes For each note, a value other than 0 when the thumb passes under the hand or a
 *   finger crosses over the thumb (`PianoFingering.pass`), or `null` for none.
 * @param turns The turns of the hand at each note, or `null` for none.
 * @returns The note data.
 */
export function buildHandTrack(
  notes: readonly HandNote[],
  action: HandAction,
  pointOf: (low: number, high: number, index: number) => Vec3,
  amplitude: number,
  firstKey: number,
  passes: ArrayLike<number> | null = null,
  turns: HandTurns | null = null,
): HandTrack {
  const m = HAND_MOTION;
  const plucks = action === 'pluck';
  const gapAfter = (i: number): number => {
    const next = notes[i + 1];
    const note = notes[i];
    return next && note ? next.start - note.start : Infinity;
  };
  const pluckTimes = Float64Array.from(notes, (_, i) =>
    plucks ? Math.min(m.pluckSec, 0.3 * gapAfter(i)) : 0,
  );
  const rests = notes.map((_, i) => (plucks ? Math.min(m.restSec, 0.2 * gapAfter(i - 1)) : 0));
  const moveEnds = Float64Array.from(notes, (n, i) => n.start - (rests[i] ?? 0));
  const gapBefore = (i: number): number => {
    const n = notes[i];
    return n?.since === undefined ? gapAfter(i - 1) : n.start - n.since;
  };
  const moveStarts = Float64Array.from(notes, (_, i) => {
    const gap = gapBefore(i);
    const free = plucks ? gap - (rests[i] ?? 0) - (pluckTimes[i - 1] ?? 0) : m.strikeMove * gap;
    const late = (moveEnds[i] ?? 0) - Math.min(m.moveSec, free);
    // A pass moves the hand from the strike of the note before, so the hand moves smoothly.
    const before = notes[i - 1];
    if (!passes?.[i] || !before || plucks) {
      return late;
    }
    return Math.min(late, Math.max(before.start, (moveEnds[i] ?? 0) - m.passSec));
  });
  // A piano hand lifts less for a near note.
  const liftShare = (i: number): number => (plucks ? 1 : Math.min(1, gapBefore(i) / m.liftGapSec));
  return {
    action,
    first: pointOf(firstKey, firstKey, -1),
    starts: Float64Array.from(notes, (n) => n.start),
    moveStarts,
    moveEnds,
    pluckTimes,
    points: Float64Array.from(notes.flatMap((n, i) => pointOf(n.low, n.high, i))),
    gestures: Float64Array.from(notes, (n, i) => gestureSize(n.loudness, amplitude) * liftShare(i)),
    turns,
  };
}

/** The motion of one hand at one time. The pose reads it. */
export interface HandState {
  /** The place of the palm on its keys or strings, in the model axes. */
  readonly point: [number, number, number];
  /** The lift of a piano hand above its keys, in meters. */
  lift: number;
  /** The pull of a harp palm away from the strings, in meters. */
  pull: number;
  /** The close of the fingers after a pluck, from 0 to 1. */
  closed: number;
  /** The roll of a piano hand around the line of its fingers, in radians (`HandTurns.rolls`). */
  roll: number;
  /** The turn of a piano hand in the plane of the palm, in radians (`HandTurns.yaws`). */
  yaw: number;
  /** The claw around which a piano hand turns, in meters (`HandTurns.pivots`). */
  pivot: number;
}

/**
 * Makes a hand state with no motion.
 *
 * @returns The state.
 */
export function createHandState(): HandState {
  return { point: [0, 0, 0], lift: 0, pull: 0, closed: 0, roll: 0, yaw: 0, pivot: 0 };
}

/**
 * Calculates the motion of one hand at a song time (design 5.3). The hand moves to the place of
 * each note before the note, in at most 0.15 s. A piano hand lifts in the move and strikes the
 * keys at the note start. A harp hand rests on its string, plucks at the note start, and pulls
 * away from the strings. It comes back to the strings in the move to the next note.
 *
 * @param track The note data of the hand.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function handStateAt(track: HandTrack, time: number, out: HandState): void {
  const i = lastAtOrBefore(track.moveStarts, time);
  const p = track.points;
  const moveStart = track.moveStarts[i];
  const moveEnd = track.moveEnds[i];
  const start = track.starts[i];
  if (moveStart === undefined || moveEnd === undefined || start === undefined) {
    out.point[0] = track.first[0];
    out.point[1] = track.first[1];
    out.point[2] = track.first[2];
    out.lift = 0;
    out.pull = 0;
    out.closed = 0;
    out.roll = 0;
    out.yaw = 0;
    out.pivot = 0;
    return;
  }
  const progress = clamp01((time - moveStart) / (moveEnd - moveStart));
  const eased = smoothstep(progress);
  for (let k = 0; k < 3; k++) {
    // The move starts at the place of the note before, or at the first place.
    const a = (i > 0 ? p[3 * i - 3 + k] : track.first[k]) ?? 0;
    out.point[k] = a + ((p[3 * i + k] ?? a) - a) * eased;
  }
  // The turns ease from the turns of the note before, as the palm does.
  const { turns } = track;
  out.roll = turns ? easeTurn(turns.rolls, i, eased) : 0;
  out.yaw = turns ? easeTurn(turns.yaws, i, eased) : 0;
  out.pivot = turns ? easeTurn(turns.pivots, i, eased) : 0;
  const gesture = track.gestures[i] ?? 1;
  if (track.action === 'strike') {
    // The lift ends with its full speed at the note start: the hand strikes the keys.
    out.lift = time < moveEnd ? Math.sin(Math.PI * progress) * HAND_MOTION.lift * gesture : 0;
    out.pull = 0;
    out.closed = 0;
    return;
  }
  // Before the move, the hand is away from the strings after the pluck of the note before.
  const before = i > 0 ? (track.gestures[i - 1] ?? 1) * (1 - eased) : 0;
  const pluck = time < start ? 0 : smoothstep((time - start) / (track.pluckTimes[i] ?? 1));
  out.lift = 0;
  out.closed = time < start ? (i > 0 ? 1 - eased : 0) : pluck;
  out.pull = HAND_MOTION.pull * (time < start ? before : gesture * pluck);
}

/**
 * Eases a turn of a hand from its value at the note before to its value at a note.
 *
 * @param values The value at each note.
 * @param i The index of the note.
 * @param eased The eased progress of the move to the note, from 0 to 1.
 * @returns The value. The value before the first note is 0.
 */
function easeTurn(values: Float64Array, i: number, eased: number): number {
  const a = i > 0 ? (values[i - 1] ?? 0) : 0;
  return a + ((values[i] ?? 0) - a) * eased;
}
