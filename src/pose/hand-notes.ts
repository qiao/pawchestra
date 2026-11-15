import type { Vec3 } from '../models/tuples.ts';
import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { gestureSize } from './loudness.ts';
import { groupChords } from './note-groups.ts';
import { clamp01, smoothstep } from '../math.ts';
import { fingerClosesAt } from './harp-fingering.ts';
import type { FingerCloses, HarpFingering } from './harp-fingering.ts';

/** The times and the sizes of the hand motion of the piano and the harp (design 5.3). */
export const HAND_MOTION = {
  /**
   * A hand moves to its next key or string in at most this time. A harp hand takes more time for a
   * long move ({@link HAND_MOTION.placeSpeed}).
   */
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
  /**
   * The mean speed of the palm of a piano hand in a leap, in meters per second. A move that is
   * too long for its time starts earlier, at the earliest at the start of the note before, so the
   * hand gets to its keys ahead of time (`docs/reference/piano-technique.md` section 9.3). With
   * no early start, the right forearm of the polar bear turned faster than 1,000° per second in
   * 384 frames of `bach-bwv1050` at 120 frames per second, with 1.5 m/s in 55, and with 1.0 m/s
   * in 54. The length of a move counts the change of the height over
   * the other hand (`HandTrack.hovers`): with the place alone, a left paw that came down 8 cm from
   * over the right paw and 8 cm in toward the fallboard got 66 ms, and the left forearm snapped 25°
   * in one frame at 30 frames per second. At 0.75 m/s, the snaps over 15° in one frame of
   * `bach-bwv1050` went from 14 to 11, and in `boulanger-matin` from 0 to 2.
   */
  leapSpeed: 1.5,
  /**
   * The mean speed of the palm of a piano hand that moves out of the way of the other hand
   * (`splitHands()`), and back to its keys, in meters per second. The move goes at most this fast
   * from the strike of the note before. A hand that cannot get the full distance in that time
   * lifts over the other hand for the rest ({@link HAND_MOTION.over}), as a pianist lifts one hand
   * over the other in a passage in which the hands share the keys. At 1.2 m/s, the eased move is
   * at most 1.8 m/s fast.
   */
  yieldSpeed: 1.2,
  /**
   * The height above its keys at which a piano hand passes over the other hand, in meters: more
   * than the depth of the paw of the polar bear from its palm to its claw tips.
   */
  over: 0.08,
  /** The missing distance of a move at which a hand lifts the full height `over`, in meters. */
  overRamp: 0.05,
  /**
   * The distance that a piano hand draws back from the fallboard, toward the player, at the full
   * height `over`, in meters, when it makes way for one note and then comes back to its keys. That
   * hand comes down next to the other hand while the other hand rises from its keys, and the two
   * paws pass at the same height. With no draw back, the paws of the polar bear touched there in
   * `bach-bwv1050`, and with 0.03 m they stay apart. A draw back of each
   * hand that makes way turned the left forearm faster than 1,000° per second in 3 more frames, and
   * a draw back toward the fallboard put the paws 0.1 to 0.2 cm into each other.
   */
  overBack: 0.03,
  /**
   * The drop of the wrist of a piano hand at the strike of a loud take-off, in radians. The wrist
   * goes down around the claw tips at the strike, rises a little after the release, and comes back
   * (`docs/reference/piano-technique.md` section 9.3, `wristKickAt()`).
   */
  kickDrop: (5 * Math.PI) / 180,
  /** The rise of the wrist after the release, as a share of the drop of the kick. */
  kickRise: 0.4,
  /** The loudness of a note from which the wrist kicks, and the loudness of the full kick. */
  kickSoft: 0.35,
  kickLoud: 0.7,
  /** The time of the drop of the wrist before the strike, in seconds. */
  kickDropSec: 0.08,
  /** The time of the rise of the wrist after the release, and of its return, in seconds. */
  kickRiseSec: 0.12,
  /** A harp finger rests on its string for this time before the pluck: at most 0.2 of the gap. */
  restSec: 0.04,
  /** A pluck takes this time: at most 0.3 of the gap to the next note of the hand. */
  pluckSec: 0.08,
  /** A pluck pulls the palm this far from the strings, at a gesture size of 1. */
  pull: 0.025,
  /**
   * The share of the pull of a pluck inside a group of a harp hand: the hand stays still in a
   * group, and only the fingers move (`docs/reference/harp-technique.md` section 7.3). The last
   * pluck of a group pulls the whole hand away. No source gives the share.
   */
  groupPull: 0.3,
  /**
   * A harp hand damps its strings in a rest of at least this time, from the end of its notes to
   * its next pluck, in seconds: the flat palm goes onto the strings (section 7.6).
   */
  dampRestSec: 1.2,
  /**
   * The mean speed of the palm of a harp hand in a move to a new group, in meters per second. A
   * longer move takes more time than {@link HAND_MOTION.moveSec}, as the hand of a harpist travels
   * on a smooth, bell-shaped path between two places (`docs/reference/harp-technique.md` section
   * 7.8). A move that has less time after the pluck before starts at that pluck. With 0.15 s for
   * each move, the right paw of the fawn went 11.6 cm from its first place to B5 and B6 in 0.08 s,
   * and the right forearm turned 34° in one frame at 30 frames per second. Over
   * `boulanger-matin`, 32 frames turned an arm more than 15°, and with this speed 14
   * (`scratch/harp2/burst.ts`).
   */
  placeSpeed: 0.5,
  /** The time that the flat palm stays on the strings in a damp, in seconds. */
  dampSec: 0.5,
  /** The time in which the palm goes onto the strings, and off them, in seconds. */
  dampMoveSec: 0.12,
  /**
   * The distance that the flat palm of a damp moves onto the strings, in meters. The treble
   * strings of the near harp of the Tripo fawn lie near its chest: with 0.02 m, the right paw went
   * 2.8 cm into the chest in the damps, with 0.01 m 1.8 cm, and with 0 1.4 cm (`pnpm pose-depth
   * harpist`). The flat palm with the open fingers stays at the place of its group.
   */
  dampPress: 0,
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
const NO_REACH_LIMIT: HandReach = { leftHighest: 127, rightLowest: 0 };

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
 * goes to one hand. With a plan, such a chord can also split when no hand reaches it whole
 * ({@link planHands}). A chord far above the reach of the left hand goes to the right hand, and a
 * chord far below the reach of the right hand goes to the left hand, so that a melody changes
 * hands where one hand cannot cross over the other. These two rules also give a wide chord to one
 * hand when all its keys are past the reach of the other hand.
 *
 * With a distance `apart`, the middles of the keys of the two hands stay at least that far apart,
 * because two wide paws on near keys go into each other. When the middles of the two parts of a
 * chord wider than one octave are nearer, the palm of each hand asks for half of the difference
 * away from its keys (`HandNote.shift`), so that a bass and a melody stay in two hands. When a hand
 * plays nearer to the other hand, the other hand moves out of its way, away from it, at the start
 * of the chord: a note of loudness 0 on the key at that distance, with no sound. A hand that takes
 * the keys from the other hand waits at that distance from the other hand until the strike of the
 * other hand, with such a note ({@link waitAway}).
 *
 * With a distance `apart`, the hand of each chord within one octave comes from a plan of the
 * whole piece ({@link planHands}), as a pianist plans which hand takes which notes: the plan finds
 * the hands with the least travel of the two palms, and a fast move costs more than a slow move.
 * With no distance, as for the harp, such a chord goes to the hand that is nearer to it, so that a
 * melody stays in one hand. At the same distance, it goes to the right hand from middle C up, and
 * to the left hand below.
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param reach The highest key of the left hand and the lowest key of the right hand. No limit by
 *   default.
 * @param apart The least distance between the middles of the keys of the two hands, in semitones,
 *   or 0 for no limit (the default).
 * @param span The widest chord of one hand, in semitones: one octave by default
 *   ({@link HAND_MOTION.span}). A harp hand reaches a tenth.
 * @param most The most keys of a chord of one hand. A chord with more keys splits as a wide chord
 *   does, when the reach of the hands lets it. No limit by default.
 * @returns The notes of the left hand and of the right hand, sorted by start.
 */
export function splitHands(
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  reach: HandReach = NO_REACH_LIMIT,
  apart = 0,
  span: number = HAND_MOTION.span,
  most = Infinity,
): readonly [left: HandNote[], right: HandNote[]] {
  const chords = groupChords(notes, loudness).map((group): SplitChord => {
    const keys = notes
      .slice(group.first, group.first + group.count)
      .map((n) => n.pitch)
      .toSorted((a, b) => a - b);
    // A chord that no hand reaches whole, also with the slack of the plan, can split as a wide
    // chord does: the left hand plays its low keys and the right hand its high keys.
    const slack = PLAN_REACH_SLACK;
    const oneHand =
      group.high <= reach.leftHighest + slack || group.low >= reach.rightLowest - slack;
    const wide = group.high - group.low > span || keys.length > most;
    const cut = wide || !oneHand ? wideChordCut(keys, reach) : null;
    return { group, keys, cut };
  });
  const choices = apart > 0 ? planHands(chords, reach, apart, span) : null;
  const left: HandNote[] = [];
  const right: HandNote[] = [];
  let places: HandPlaces = { left: HAND_MOTION.startKeys[0], right: HAND_MOTION.startKeys[1] };
  // The start of the last note of either hand, and the hand of the last chord.
  let lastStart = -Infinity;
  let lastChoice: HandChoice | null = null;
  for (const [index, chord] of chords.entries()) {
    const { group, keys } = chord;
    const choice = choices ? (choices[index] ?? 'right') : nearerHand(chord, places, reach);
    const part = (low: number, high: number, shift = 0): HandNote => ({
      start: group.start,
      end: group.end,
      low,
      high,
      keys: [...new Set(keys.filter((k) => k >= low && k <= high))],
      loudness: group.loudness,
      shift,
    });
    const next = placeHands(chord, choice, places, apart);
    let toLeft: HandNote | null = null;
    let toRight: HandNote | null = null;
    if (choice === 'both') {
      const below = keys[(chord.cut ?? 1) - 1] ?? group.low;
      const above = keys[chord.cut ?? 0] ?? group.high;
      toLeft = part(group.low, below, -next.shift);
      toRight = part(above, group.high, next.shift);
    } else if (choice === 'right') {
      toRight = part(group.low, group.high);
      toLeft = next.left === places.left ? null : makeWay(group.start, next.left);
    } else {
      toLeft = part(group.low, group.high);
      toRight = next.right === places.right ? null : makeWay(group.start, next.right);
    }
    const wait = apart > 0 ? waitAway(choice, lastChoice, places, next, apart) : null;
    const waiting = wait === 'left' ? left : right;
    if (wait && (waiting.at(-1)?.start ?? -Infinity) < lastStart) {
      // The hand waits away from the other hand until the strike of the other hand.
      const key = wait === 'left' ? places.right - apart : places.left + apart;
      waiting.push(makeWay(lastStart, wait === 'left' ? Math.floor(key) : Math.ceil(key)));
    }
    places = next;
    lastChoice = choice;
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
 * Gives the hand of a chord with no plan (design 5.3): both hands for a wide chord with a cut, a
 * hand that alone reaches the chord, or else the hand that is nearer to it. At the same distance,
 * the right hand plays from middle C up, and the left hand below.
 *
 * @param chord The chord.
 * @param last The middles of the two hands before the chord.
 * @param reach The highest key of the left hand and the lowest key of the right hand.
 * @returns The hand.
 */
function nearerHand(chord: SplitChord, last: HandPlaces, reach: HandReach): HandChoice {
  const { group } = chord;
  if (chord.cut !== null) {
    return 'both';
  }
  const middle = (group.low + group.high) / 2;
  const fromLeft = Math.abs(middle - last.left);
  const fromRight = Math.abs(middle - last.right);
  const nearerRight = fromRight < fromLeft || (fromRight === fromLeft && middle >= 60);
  return group.low >= reach.rightLowest && (nearerRight || group.high > reach.leftHighest)
    ? 'right'
    : 'left';
}

/**
 * Finds the hand that takes the keys from the other hand (design 5.3): the hand of a chord after a
 * chord of the other hand alone, when it comes nearer than `apart` to the place of the other hand.
 * Such a hand waits away from the other hand until the strike of the chord of the other hand, as
 * a pianist keeps a hand clear of the keys of the other hand until that hand has played.
 *
 * @param choice The hand of the chord.
 * @param last The hand of the chord before, or `null` for the first chord.
 * @param before The middles of the two hands before the chord.
 * @param after The middles of the two hands after the chord.
 * @param apart The least distance between the middles of the two hands.
 * @returns The hand that waits, or `null` for none.
 */
function waitAway(
  choice: HandChoice,
  last: HandChoice | null,
  before: HandPlaces,
  after: HandPlaces,
  apart: number,
): 'left' | 'right' | null {
  if (choice === 'both' || last === 'both' || last === null || last === choice) {
    return null;
  }
  const near =
    choice === 'left' ? before.right - after.left < apart : after.right - before.left < apart;
  return near ? choice : null;
}

/** A chord of a player for {@link splitHands}. */
interface SplitChord {
  /** The notes of the chord. */
  readonly group: ReturnType<typeof groupChords>[number];
  /** The keys of the notes, sorted up. */
  readonly keys: readonly number[];
  /**
   * The index of the lowest key of the right hand in a chord wider than one octave, or in a chord
   * that no hand reaches whole ({@link wideChordCut}). `null` for a chord that one hand plays.
   */
  readonly cut: number | null;
}

/** The hand that plays a chord: one hand, or both hands for a wide chord that splits. */
type HandChoice = 'left' | 'right' | 'both';

/** The middles of the keys of the two hands, in semitones. */
interface HandPlaces {
  readonly left: number;
  readonly right: number;
}

/**
 * Gives the middles of the keys of the two hands after a chord (design 5.3). The hand of a chord
 * goes to the middle of its keys, and the other hand moves out of its way to the distance
 * `apart`. Both hands of a wide chord go to the middles of their parts, each with half of the
 * missing distance `apart` away from the other hand.
 *
 * @param chord The chord.
 * @param choice The hand of the chord.
 * @param last The middles of the two hands before the chord.
 * @param apart The least distance between the middles of the two hands, or 0 for no limit.
 * @returns The middles after the chord, and the shift of each hand of a wide chord in semitones.
 */
function placeHands(
  chord: SplitChord,
  choice: HandChoice,
  last: HandPlaces,
  apart: number,
): HandPlaces & { readonly shift: number } {
  const { group, keys, cut } = chord;
  const middle = (group.low + group.high) / 2;
  if (choice === 'both') {
    const lowMiddle = (group.low + (keys[(cut ?? 1) - 1] ?? group.low)) / 2;
    const highMiddle = ((keys[cut ?? 0] ?? group.high) + group.high) / 2;
    // Each hand moves half of the missing distance away from the other hand.
    const shift = Math.ceil(Math.max(0, apart - (highMiddle - lowMiddle)) / 2);
    return { left: lowMiddle - shift, right: highMiddle + shift, shift };
  }
  if (choice === 'right') {
    const way = apart > 0 && last.left > middle - apart;
    return { left: way ? Math.floor(middle - apart) : last.left, right: middle, shift: 0 };
  }
  const way = apart > 0 && last.right < middle + apart;
  return { left: middle, right: way ? Math.ceil(middle + apart) : last.right, shift: 0 };
}

/**
 * The shortest time of a move of a hand in the cost of {@link planHands}, in seconds: a move in a
 * shorter time costs as much as a move in this time.
 */
const PLAN_MIN_GAP = 0.02;

/**
 * The keys past its reach (`HandReach`) that a hand of the plan of {@link planHands} can play a
 * chord within one octave, at the cost {@link PLAN_REACH_COST} for each key.
 */
const PLAN_REACH_SLACK = 3;

/** The cost of each key past the reach of a hand in the plan of {@link planHands}. */
const PLAN_REACH_COST = 500;

/** One way to play the chords up to one chord, in the search of {@link planHands}. */
interface PlanStep {
  /** The hand of the last chord. */
  readonly choice: HandChoice;
  /** The middles of the two hands after the chord. */
  readonly places: HandPlaces;
  /** The start of the last note or move of each hand, in song seconds. */
  readonly leftAt: number;
  readonly rightAt: number;
  /** The sum of the costs up to the chord. */
  readonly cost: number;
  /** The index of the step before in the steps of the chord before, or -1 for the first chord. */
  readonly from: number;
}

/**
 * Plans the hand of each chord of a player (design 5.3), as a pianist plans which hand takes which
 * notes. A chord wider than one octave with a cut ({@link wideChordCut}) goes to both hands. A
 * chord within one octave goes to either hand that reaches it, or that plays at most
 * {@link PLAN_REACH_SLACK} keys past its reach at a cost for each key. A chord within one octave
 * that no hand reaches so goes to the left hand or splits between both hands, so that the hand of
 * a melody can keep its keys and play the high key of the chord. A dynamic program finds
 * the hands of the lowest cost: for each move of a palm, the square of its distance in semitones
 * over its time. Thus a fast move costs more than a slow one, as its speed is higher, and a move
 * of a hand out of the way of the other hand counts too. The search keeps the best way to play
 * the chords up to each chord for each hand of the chord. At the same cost, a chord goes to the
 * nearer hand, and at the same distance to the right hand from middle C up, and to the left hand
 * below.
 *
 * @param chords The chords of the player, sorted by start.
 * @param reach The highest key of the left hand and the lowest key of the right hand.
 * @param apart The least distance between the middles of the two hands, or 0 for no limit.
 * @param span The widest chord of one hand, in semitones.
 * @returns The hand of each chord.
 */
function planHands(
  chords: readonly SplitChord[],
  reach: HandReach,
  apart: number,
  span: number,
): HandChoice[] {
  const steps: PlanStep[][] = [];
  let before: readonly PlanStep[] = [
    {
      choice: 'both',
      places: { left: HAND_MOTION.startKeys[0], right: HAND_MOTION.startKeys[1] },
      leftAt: -Infinity,
      rightAt: -Infinity,
      cost: 0,
      from: -1,
    },
  ];
  for (const chord of chords) {
    const { group } = chord;
    const middle = (group.low + group.high) / 2;
    const options: HandChoice[] = [];
    if (chord.cut !== null) {
      options.push('both');
    }
    // A chord within one octave can also go to one hand.
    if (chord.cut === null || group.high - group.low <= span) {
      const slack = PLAN_REACH_SLACK;
      if (group.high <= reach.leftHighest + slack || group.low < reach.rightLowest - slack) {
        options.push('left');
      }
      if (group.low >= reach.rightLowest - slack) {
        options.push('right');
      }
    }
    const now: PlanStep[] = [];
    for (const choice of options) {
      let best: PlanStep | null = null;
      for (const [from, step] of before.entries()) {
        const places = placeHands(chord, choice, step.places, apart);
        const travel = (a: number, b: number, at: number): number =>
          (a - b) ** 2 / Math.max(PLAN_MIN_GAP, group.start - at);
        // The nearer hand and the side of middle C break a tie.
        const near = choice === 'left' ? middle - step.places.left : step.places.right - middle;
        const side = (choice === 'left') === middle >= 60 ? 1e-9 : 0;
        const past =
          choice === 'left'
            ? Math.max(0, group.high - reach.leftHighest)
            : Math.max(0, reach.rightLowest - group.low);
        const cost =
          step.cost +
          travel(places.left, step.places.left, step.leftAt) +
          travel(places.right, step.places.right, step.rightAt) +
          PLAN_REACH_COST * past +
          1e-6 * Math.abs(near) +
          side;
        if (!best || cost < best.cost) {
          const moved = (a: number, b: number, at: number): number => (a === b ? at : group.start);
          best = {
            choice,
            places,
            leftAt:
              choice === 'right' ? moved(places.left, step.places.left, step.leftAt) : group.start,
            rightAt:
              choice === 'left'
                ? moved(places.right, step.places.right, step.rightAt)
                : group.start,
            cost,
            from,
          };
        }
      }
      if (best) {
        now.push(best);
      }
    }
    steps.push(now);
    before = now;
  }

  // Follow the best steps back from the last chord.
  const choices: HandChoice[] = Array.from({ length: chords.length }, () => 'right');
  let at = before.reduce((b, s, i) => ((before[b]?.cost ?? Infinity) <= s.cost ? b : i), 0);
  for (let i = chords.length - 1; i >= 0; i--) {
    const step = steps[i]?.[at];
    if (!step) {
      break;
    }
    choices[i] = step.choice;
    at = step.from;
  }
  return choices;
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
  /**
   * The height above its keys at which a piano hand stays at each note, in meters: more than 0 for
   * a hand that lifts over the other hand ({@link HAND_MOTION.over}), or `null` for none.
   */
  readonly hovers: Float64Array | null;
  /** The wrist kicks of a piano hand ({@link HAND_MOTION.kickDrop}), or `null` for a harp hand. */
  readonly kicks: WristKicks | null;
  /** The fingering of a harp hand (`planHarpFingerings()`), or `null` for a piano hand. */
  readonly fingering: HarpFingering | null;
  /**
   * The time from the first pluck of each note of a harp hand to the note start, in seconds: more
   * than 0 for a rolled chord. `null` for a piano hand.
   */
  readonly rolls: Float64Array | null;
  /**
   * The start and the end of the damp after each note of a harp hand, in song seconds: two
   * numbers for each note, equal for a note with no damp. `null` for a piano hand.
   */
  readonly damps: Float64Array | null;
}

/** The wrist kicks of the notes of a piano hand (design 5.3). */
interface WristKicks {
  /** The drop of the wrist at each note, in radians: 0 for a note with no kick. */
  readonly drops: Float64Array;
  /** The release of each note: its end, at the latest at the start of the next note. */
  readonly releases: Float64Array;
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
 * @param fingering The fingering of a harp hand, or `null` for none. With a fingering, the hand
 *   places each group at its place time and stays still in the group (`harpPlacing()`).
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
  fingering: HarpFingering | null = null,
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
  const points = Float64Array.from(notes.flatMap((n, i) => pointOf(n.low, n.high, i)));
  const first = pointOf(firstKey, firstKey, -1);
  const hovers = plucks ? null : limitYields(notes, points);
  const kicks = plucks ? null : wristKicks(notes);
  // A move to or from a note that only makes way goes at the speed of a yield.
  const yields = (i: number): boolean =>
    notes[i]?.keys.length === 0 || (i > 0 && notes[i - 1]?.keys.length === 0);
  const moveStarts = Float64Array.from(notes, (_, i) => {
    const gap = gapBefore(i);
    const free = plucks ? gap - (rests[i] ?? 0) - (pluckTimes[i - 1] ?? 0) : m.strikeMove * gap;
    const end = moveEnds[i] ?? 0;
    const late = end - Math.min(m.moveSec, free);
    const before = notes[i - 1];
    if (!before || plucks) {
      return late;
    }
    // A pass moves the hand from the strike of the note before, so the hand moves smoothly. A
    // leap starts early enough for its length, as a pianist gets to the keys ahead of time.
    const pass = passes?.[i] ? m.passSec : 0;
    // A hand that comes down from over the other hand, or goes up over it, also travels the
    // change of its height.
    const rise = hovers ? Math.abs((hovers[i] ?? 0) - (hovers[i - 1] ?? 0)) : 0;
    const length = Math.hypot(moveLength(points, first, i), rise);
    const leap = length / (yields(i) ? m.yieldSpeed : m.leapSpeed);
    return Math.min(late, Math.max(before.start, end - Math.max(pass, leap)));
  });
  // A piano hand lifts less for a near note. A harp hand pulls less inside a group.
  const harp = fingering
    ? harpPlacing(
        notes,
        fingering,
        rests,
        pluckTimes,
        notes.map((_, i) => moveLength(points, first, i)),
      )
    : null;
  const share = (i: number): number =>
    harp ? (harp.pulls[i] ?? 1) : plucks ? 1 : Math.min(1, gapBefore(i) / m.liftGapSec);
  return {
    action,
    first,
    starts: Float64Array.from(notes, (n) => n.start),
    moveStarts: harp?.moveStarts ?? moveStarts,
    moveEnds: harp?.moveEnds ?? moveEnds,
    pluckTimes,
    points,
    gestures: Float64Array.from(notes, (n, i) => gestureSize(n.loudness, amplitude) * share(i)),
    turns,
    hovers,
    kicks,
    fingering,
    rolls: harp?.rolls ?? null,
    damps: harp?.damps ?? null,
  };
}

/** The moves, the pulls, the rolls, and the damps of a harp hand with a fingering. */
interface HarpPlacing {
  readonly moveStarts: Float64Array;
  readonly moveEnds: Float64Array;
  /** The share of the pull of each pluck ({@link HAND_MOTION.groupPull}). */
  readonly pulls: Float64Array;
  readonly rolls: Float64Array;
  readonly damps: Float64Array;
}

/**
 * Calculates the moves of a harp hand from its fingering (design 5.3,
 * `docs/reference/harp-technique.md` section 7.2): the hand moves to the place of each group at
 * the place time of the group, right after the pluck before, and it rests there with the fingers
 * on their strings until the first pluck of the group. Inside a group, the place of the palm does
 * not change, so the hand stays still, and each pluck pulls it only a little
 * ({@link HAND_MOTION.groupPull}). After the last note before a long rest, the flat palm damps the
 * strings ({@link HAND_MOTION.dampRestSec}), and the hand places the next group after the damp.
 * A move to a new group takes the time of its length at {@link HAND_MOTION.placeSpeed}. The first
 * group places that time before its first pluck. A move with less time after the pluck before
 * starts at the last pluck of the note before, so the hand arrives before the first pluck.
 *
 * @param notes The notes of the hand, sorted by start.
 * @param fingering The fingering of the hand.
 * @param rests The rest of the finger on its string before each pluck, in seconds.
 * @param pluckTimes The time of the pluck of each note, in seconds.
 * @param lengths The length of the move of the palm to each note, in meters.
 * @returns The moves, the pulls, the rolls, and the damps.
 */
function harpPlacing(
  notes: readonly HandNote[],
  fingering: HarpFingering,
  rests: readonly number[],
  pluckTimes: Float64Array,
  lengths: readonly number[],
): HarpPlacing {
  const m = HAND_MOTION;
  const { first, plucks, groups, places } = fingering;
  const rolls = Float64Array.from(notes, (n, i) => {
    let earliest = n.start;
    for (let j = first[i] ?? 0; j < (first[i + 1] ?? 0); j++) {
      earliest = Math.min(earliest, plucks[j] ?? earliest);
    }
    return n.start - earliest;
  });
  // The damp after each note: from its end, when the next pluck comes after a long rest.
  const damps = new Float64Array(2 * notes.length);
  let ends = -Infinity;
  for (const [i, note] of notes.entries()) {
    ends = Math.max(ends, note.end);
    const next = notes[i + 1];
    const nextPluck = next ? next.start - (rolls[i + 1] ?? 0) : Infinity;
    const free = nextPluck - ends;
    const length = Math.min(m.dampSec, free - 2 * m.dampMoveSec);
    if (note.keys.length > 0 && free >= m.dampRestSec && length > 0) {
      damps[2 * i] = ends;
      damps[2 * i + 1] = ends + length;
    } else {
      damps[2 * i] = note.start;
      damps[2 * i + 1] = note.start;
    }
  }

  const moveStarts = new Float64Array(notes.length);
  const moveEnds = new Float64Array(notes.length);
  const pulls = new Float64Array(notes.length);
  let lastStart = -Infinity;
  for (const [i, note] of notes.entries()) {
    const group = groups[i] ?? 0;
    const startsGroup = i === 0 || groups[i - 1] !== group;
    const end = note.start - (rolls[i] ?? 0) - (rests[i] ?? 0);
    // A new group places at its place time, and after the damp before it, when the palm is off
    // the strings. A note inside a group keeps the place of the palm, so its move only eases the
    // pull back. A move that starts at the damp end skips the release of the damp: the forearm
    // turned up to 40° and the fingers closed fully in 1/240 s.
    const before = i > 0 ? (notes[i - 1]?.start ?? 0) + (pluckTimes[i - 1] ?? 0) : -Infinity;
    const dampFrom = i > 0 ? (damps[2 * i - 2] ?? 0) : 0;
    const dampTo = i > 0 ? (damps[2 * i - 1] ?? 0) : 0;
    const damped = dampTo > dampFrom ? dampTo + m.dampMoveSec : -Infinity;
    const place = startsGroup ? (places[group] ?? end) : before;
    // A long move takes more time. With too little time after the place, it starts earlier, at
    // the earliest at the last pluck of the note before, which is its start.
    const time = Math.max(m.moveSec, (lengths[i] ?? 0) / m.placeSpeed);
    const earliest = i > 0 ? (notes[i - 1]?.start ?? 0) : -Infinity;
    const early = startsGroup ? Math.max(earliest, Math.min(place, end - time)) : place;
    const start = Math.min(end, Math.max(early, damped, lastStart));
    moveStarts[i] = start;
    moveEnds[i] = Math.max(start, Math.min(start + time, end));
    lastStart = start;
    pulls[i] = groups[i + 1] === group ? m.groupPull : 1;
  }
  return { moveStarts, moveEnds, pulls, rolls, damps };
}

/**
 * Limits the moves of a piano hand out of the way of the other hand (design 5.3). The palm of a
 * note that only makes way (a note with no keys) goes toward its place only so far that the move
 * from the note before and the move to the note after keep to {@link HAND_MOTION.yieldSpeed}. A
 * pass from the first note moves each palm toward the palm before, and a pass from the last note
 * toward the palm after, so that a run of such notes ends near the next keys. For the missing
 * distance, the hand lifts over the other hand: up to {@link HAND_MOTION.over} at a missing
 * distance of {@link HAND_MOTION.overRamp}. When it comes back to its keys after the note, it
 * also draws back from the fallboard, up to {@link HAND_MOTION.overBack}.
 *
 * @param notes The notes of the hand, sorted by start.
 * @param points The place of the palm for each note: three numbers for each note. The function
 *   moves the places of the notes that make way.
 * @returns The height above the keys at each note, in meters, or `null` when no hand lifts over.
 */
function limitYields(notes: readonly HandNote[], points: Float64Array): Float64Array | null {
  const yields = notes.flatMap((n, i) => (n.keys.length === 0 && i > 0 ? [i] : []));
  if (yields.length === 0) {
    return null;
  }
  const targets = Float64Array.from(points);
  const reach = (i: number, j: number): number =>
    HAND_MOTION.yieldSpeed * Math.abs((notes[j]?.start ?? 0) - (notes[i]?.start ?? 0));
  for (const i of yields) {
    pullToward(points, i, i - 1, reach(i, i - 1));
  }
  for (const i of yields.toReversed()) {
    if (i + 1 < notes.length) {
      pullToward(points, i, i + 1, reach(i, i + 1));
    }
  }
  const hovers = new Float64Array(notes.length);
  for (const i of yields) {
    const missing = Math.hypot(
      ...[0, 1, 2].map((k) => (targets[3 * i + k] ?? 0) - (points[3 * i + k] ?? 0)),
    );
    const share = smoothstep(missing / HAND_MOTION.overRamp);
    hovers[i] = HAND_MOTION.over * share;
    // A lifted hand that comes back to its keys after this note also draws back toward the player
    // (+z), so two paws that pass at the same height do not touch.
    if (notes[i + 1]?.keys.length) {
      points[3 * i + 2] = (points[3 * i + 2] ?? 0) + HAND_MOTION.overBack * share;
    }
  }
  return hovers;
}

/**
 * Moves the palm of one note toward the palm of another note until it is at most a distance away.
 *
 * @param points The place of the palm for each note: three numbers for each note.
 * @param i The index of the note to move.
 * @param j The index of the other note.
 * @param most The largest distance, in meters.
 */
function pullToward(points: Float64Array, i: number, j: number, most: number): void {
  const offset = [0, 1, 2].map((k) => (points[3 * i + k] ?? 0) - (points[3 * j + k] ?? 0));
  const length = Math.hypot(...offset);
  if (length <= most) {
    return;
  }
  for (let k = 0; k < 3; k++) {
    points[3 * i + k] = (points[3 * j + k] ?? 0) + ((offset[k] ?? 0) * most) / length;
  }
}

/**
 * Gives the length of the move of a palm to a note.
 *
 * @param points The place of the palm for each note: three numbers for each note.
 * @param first The place of the palm before the first note.
 * @param i The index of the note.
 * @returns The distance from the place of the note before, in meters.
 */
function moveLength(points: Float64Array, first: Vec3, i: number): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const a = i > 0 ? (points[3 * i - 3 + k] ?? 0) : (first[k] ?? 0);
    sum += ((points[3 * i + k] ?? 0) - a) ** 2;
  }
  return Math.sqrt(sum);
}

/** The motion of one hand at one time. The pose reads it. */
export interface HandState {
  /** The place of the palm on its keys or strings, in the model axes. */
  readonly point: [number, number, number];
  /** The lift of a piano hand above its keys, in meters. */
  lift: number;
  /** The pull of a harp palm away from the strings, in meters. */
  pull: number;
  /**
   * The close of the fingers after a pluck, from 0 to 1. For a harp hand with a fingering, the
   * close of fingers 2 to 4, which close as one group (`fingerClosesAt()`).
   */
  closed: number;
  /** The close of the thumb of a harp hand with a fingering, from 0 to 1, or 0. */
  thumb: number;
  /** The share of the flat palm of a harp hand that damps its strings, from 0 to 1. */
  flat: number;
  /** The roll of a piano hand around the line of its fingers, in radians (`HandTurns.rolls`). */
  roll: number;
  /** The turn of a piano hand in the plane of the palm, in radians (`HandTurns.yaws`). */
  yaw: number;
  /** The claw around which a piano hand turns, in meters (`HandTurns.pivots`). */
  pivot: number;
  /** The drop of the wrist of a piano hand around its claw tips, in radians (`wristKickAt()`). */
  kick: number;
}

/**
 * Makes a hand state with no motion.
 *
 * @returns The state.
 */
export function createHandState(): HandState {
  return {
    point: [0, 0, 0],
    lift: 0,
    pull: 0,
    closed: 0,
    thumb: 0,
    flat: 0,
    roll: 0,
    yaw: 0,
    pivot: 0,
    kick: 0,
  };
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
    out.thumb = 0;
    out.flat = 0;
    out.roll = 0;
    out.yaw = 0;
    out.pivot = 0;
    out.kick = 0;
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
    // The lift ends with its full speed at the note start: the hand strikes the keys. A hand that
    // lifts over the other hand eases its height from the note before, as the palm does.
    const hover = track.hovers ? easeTurn(track.hovers, i, eased) : 0;
    out.lift =
      hover + (time < moveEnd ? Math.sin(Math.PI * progress) * HAND_MOTION.lift * gesture : 0);
    out.pull = 0;
    out.closed = 0;
    out.thumb = 0;
    out.flat = 0;
    out.kick = track.kicks ? wristKickAt(track.kicks, track.starts, time) : 0;
    return;
  }
  // Before the move, the hand is away from the strings after the pluck of the note before. In a
  // rolled chord, the fingers pluck from the first pluck on, and the hand pulls away only after
  // the last pluck, at the note start. The move to the next group of a hand can start before
  // that pull ends, so the pull before eases from its value at the time.
  const pluckAt = (k: number): number =>
    smoothstep((time - (track.starts[k] ?? 0)) / (track.pluckTimes[k] ?? 1));
  const before = i > 0 ? (track.gestures[i - 1] ?? 1) * pluckAt(i - 1) * (1 - eased) : 0;
  const pluck = time < start ? 0 : pluckAt(i);
  out.lift = 0;
  out.kick = 0;
  out.pull = HAND_MOTION.pull * (time < start ? before : gesture * pluck);
  if (track.fingering) {
    fingerClosesAt(track.fingering, time, closes);
    out.closed = closes.fingers;
    out.thumb = closes.thumb;
  } else {
    out.closed = time < start ? (i > 0 ? 1 - eased : 0) : pluck;
    out.thumb = 0;
  }
  // A damp after the note before puts the flat palm onto the strings.
  const flat = track.damps ? dampShare(track.damps, i, time) : 0;
  out.flat = flat;
  out.pull = out.pull * (1 - flat) - HAND_MOTION.dampPress * flat;
}

/** The scratch closes of {@link handStateAt}. Each call writes them before it reads them. */
const closes: FingerCloses = { thumb: 0, fingers: 0 };

/**
 * Gives the share of the flat palm of a damp at a time: it goes onto the strings at the damp
 * start, stays, and leaves at the damp end, each move in {@link HAND_MOTION.dampMoveSec}.
 *
 * @param damps The start and the end of the damp after each note.
 * @param i The note after which the hand damps.
 * @param time The song time.
 * @returns The share, from 0 to 1.
 */
function dampShare(damps: Float64Array, i: number, time: number): number {
  const from = damps[2 * i] ?? 0;
  const to = damps[2 * i + 1] ?? 0;
  if (to <= from) {
    return 0;
  }
  const t = HAND_MOTION.dampMoveSec;
  return smoothstep((time - from) / t) * (1 - smoothstep((time - to) / t));
}

/**
 * Finds the wrist kick of each note of a piano hand (design 5.3): a drop for a loud note after the
 * hand leaves the keys, as the take-off of a jump starts with a small down kick of the wrist
 * (`docs/reference/piano-technique.md` section 9.3). The drop grows with the loudness from
 * {@link HAND_MOTION.kickSoft} to {@link HAND_MOTION.kickLoud}. A note with no keys has no kick.
 * A note kicks only when the rise and the return of the note before end before its drop, so two
 * kicks do not add up.
 *
 * @param notes The notes of the hand, sorted by start.
 * @returns The kicks.
 */
function wristKicks(notes: readonly HandNote[]): WristKicks {
  const m = HAND_MOTION;
  const releases = Float64Array.from(notes, (n, i) =>
    Math.min(n.end, notes[i + 1]?.start ?? n.end),
  );
  // The wrist of the note before ends its rise and its return before the drop starts.
  const free = (i: number): boolean =>
    i === 0 || (releases[i - 1] ?? 0) + 2 * m.kickRiseSec + m.kickDropSec <= (notes[i]?.start ?? 0);
  const drops = Float64Array.from(notes, (n, i) =>
    n.keys.length === 0 || !free(i)
      ? 0
      : m.kickDrop * clamp01((n.loudness - m.kickSoft) / (m.kickLoud - m.kickSoft)),
  );
  return { drops, releases };
}

/**
 * Calculates the drop of the wrist of a piano hand at a song time (design 5.3). The wrist of each
 * kick goes down in {@link HAND_MOTION.kickDropSec} before the strike, stays down while the keys
 * are down, rises a little above its place after the release in {@link HAND_MOTION.kickRiseSec},
 * and comes back in the same time. Each part eases, and the kicks of near notes add up, so the
 * drop changes with no step.
 *
 * @param kicks The wrist kicks of the hand.
 * @param starts The start of each note of the hand.
 * @param time The song time of the note layer.
 * @returns The drop, in radians: + down.
 */
function wristKickAt(kicks: WristKicks, starts: Float64Array, time: number): number {
  const m = HAND_MOTION;
  let sum = 0;
  for (let j = lastAtOrBefore(starts, time + m.kickDropSec); j >= 0; j--) {
    const drop = kicks.drops[j] ?? 0;
    const release = kicks.releases[j] ?? 0;
    if (drop > 0) {
      const down = smoothstep((time - (starts[j] ?? 0) + m.kickDropSec) / m.kickDropSec);
      const up = smoothstep((time - release) / m.kickRiseSec);
      const back = smoothstep((time - release - m.kickRiseSec) / m.kickRiseSec);
      sum += drop * (down - (1 + m.kickRise) * up + m.kickRise * back);
    }
    // A release is at the latest at the next start, so the notes before end their kicks earlier.
    if (release + 2 * m.kickRiseSec < time) {
      break;
    }
  }
  return sum;
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
