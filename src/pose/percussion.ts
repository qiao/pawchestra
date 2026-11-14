import { MathUtils, Quaternion, Vector3 } from 'three';

import { palmTurnAngle, studioForearmTurn, twistAngle } from '../models/studio-rig.ts';
import type { PawBind } from '../models/studio-rig.ts';
import { boneIndex } from '../models/rig.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { PlayerNote } from '../score/types.ts';
import { NO_TURN, X_AXIS, Y_AXIS, Z_AXIS } from './axes.ts';
import { lastAtOrBefore, mixPole, mixRotation } from './blend.ts';
import { createFrame, setBoneRotation, setFromBasis } from './frames.ts';
import type { Frame, TorsoFrames } from './frames.ts';
import { hangingHand, hangingWrist } from './hang.ts';
import { limitReach, poseShoulder, solveTwoBone, writeArm, writeCurl } from './ik.ts';
import type { ArmRig } from './ik.ts';
import { groupChords } from './note-groups.ts';
import type { NoteGroup } from './note-groups.ts';
import {
  CRASH_MOTION,
  SUSPENDED_CYMBAL_HOLD,
  TAMBOURINE_HOLD,
  TRIANGLE_ROLL,
  acrossAxes,
  frontKettles,
  offsetTarget,
  targetKeyOf,
  xylophoneShift,
} from './percussion-rig.ts';
import type {
  DampHand,
  DampRule,
  MalletSet,
  PawPlace,
  PercussionRig,
  PercussionSide,
} from './percussion-rig.ts';
import {
  buildSwitchTrack,
  instrumentRuns,
  onlyTambourine,
  switchStateAt,
} from './percussion-switch.ts';
import type { InstrumentRun, SwitchState, SwitchTrack } from './percussion-switch.ts';
import { DAMP_MOTION, dampTrack } from './damps.ts';
import type { DampState, DampTrack, DampWish } from './damps.ts';
import { buildSideTrack, sideMoveAt } from './side-move.ts';
import type { SideTrack } from './side-move.ts';
import { smoothstep } from './rest.ts';
import {
  STRIKE_MOTION,
  alternateHands,
  beatSecAt,
  buildStrikeTrack,
  sideHands,
  thinRolls,
} from './strikes.ts';
import type { Strike, StrikeGroup, StrikeState, StrikeTarget, StrikeTrack } from './strikes.ts';

/** The strike data of the two hands. A hand with no strikes has `null`. */
interface PercussionTracks {
  readonly left: StrikeTrack | null;
  readonly right: StrikeTrack | null;
  /** The side move of the body behind the notes (`PercussionHold.side`), or `null`. */
  readonly side: SideTrack | null;
  /**
   * The long rests in which the sticks go to their set position (`PercussionHold.set`), or the
   * hand cymbals go down, or `null` for another hold or a ready hold ({@link setRests}).
   */
  readonly rests: Float64Array | null;
  /** The damps of the hand cymbals against the chest (`PercussionHold.damp`), or `null`. */
  readonly damp: DampTrack | null;
  /** The follow move of the hand cymbals after a crash ({@link CRASH_MOTION}), or `null`. */
  readonly ring: DampTrack | null;
  /** The switches and the rolls of the small percussion player, or `null`. */
  readonly small: SmallTracks | null;
  /** The strikes that swing the plate of a suspended cymbal ({@link cymbalSwingAt}), or `null`. */
  readonly swing: Float64Array | null;
}

/** The motion of the small percussion player with the held tambourine (design 5.3). */
export interface SmallTracks {
  /** The switches between the triangle and the held tambourine. */
  readonly switches: SwitchTrack;
  /**
   * The rolls of the held tambourine, three numbers for each, sorted: the start, the end, and 1
   * for a shake roll or 0 for a thumb roll (`TAMBOURINE_HOLD.shakeLoud`).
   */
  readonly rolls: Float64Array;
  /** The loudness of each strike of the right paw, in the order of its strikes. */
  readonly loudness: Float64Array;
  /** 1 for each strike of the right paw on the held tambourine, in the order of its strikes. */
  readonly held: Uint8Array;
}

/**
 * The timing of the set position in a long rest of the music (design 5.3), in beats. A drumline
 * goes back to the set position one beat after the end of a passage, and to the playing position
 * two beats before an entrance (`docs/reference/percussion-technique.md` 6).
 */
const SET_MOTION = {
  /**
   * A rest of at least this length takes the set position. The rest starts at the end of the move
   * of the hands after the strike before it, such as a damp, and ends at the next strike.
   */
  restBeats: 6,
  /** The sticks go down to the set position in this time after the last strike. */
  lowerBeats: 1,
  /**
   * The sticks lift from the set position from this time before the next strike to the time of
   * {@link liftEndBeats} before it. The lift of the strike from the rest height follows.
   */
  liftStartBeats: 2,
  /** The lift from the set position ends this time before the next strike. */
  liftEndBeats: 1,
  /** The length of a beat with no conducted beats, in seconds. */
  beatSec: 0.5,
} as const;

/**
 * Finds the long rests of a player in which the sticks go to their set position (design 5.3).
 * Before the first strike, the sticks stay in the set position until the lift before it, and after
 * the last strike, they go down and stay. A rest counts from the end of the move of the hands
 * after its first strike, because the lowering starts there. A rest that counted from the strike
 * could end its lowering after its lift, and the sticks then jumped back to the playing position
 * in one frame. A rest whose lowering ends after the start of its lift keeps the playing position.
 *
 * @param starts The starts of the strikes of the player, sorted.
 * @param beats The times of the conducted beats, sorted.
 * @param after The end of the move of the hands after each strike, such as a damp, in the order
 *   of `starts`. The lowering starts there. A strike with no value starts it at the strike.
 * @returns Four times for each rest: the start and the end of the lowering, and the start and the
 *   end of the lift. A rest with no lowering or no lift has infinite times there.
 */
function setRests(
  starts: readonly number[],
  beats: Float64Array,
  after: readonly number[],
): Float64Array {
  const m = SET_MOTION;
  const beat = (time: number): number => beatSecAt(beats, time) || m.beatSec;
  const rests: number[] = [];
  const lift = (start: number): [number, number] => [
    start - m.liftStartBeats * beat(start),
    start - m.liftEndBeats * beat(start),
  ];
  const lower = (end: number): [number, number] => [end, end + m.lowerBeats * beat(end)];
  const first = starts[0];
  const last = starts.at(-1);
  if (first === undefined || last === undefined) {
    return new Float64Array();
  }
  rests.push(-Infinity, -Infinity, ...lift(first));
  for (let i = 1; i < starts.length; i++) {
    const end = after[i - 1] ?? starts[i - 1] ?? 0;
    const start = starts[i] ?? 0;
    const [lowerStart, lowerEnd] = lower(end);
    const [liftStart, liftEnd] = lift(start);
    if (start - end >= m.restBeats * beat(end) && lowerEnd <= liftStart) {
      rests.push(lowerStart, lowerEnd, liftStart, liftEnd);
    }
  }
  rests.push(...lower(after[starts.length - 1] ?? last), Infinity, Infinity);
  return Float64Array.from(rests);
}

/**
 * The swing of the plate of a suspended cymbal after a strike (design 5.3). The plate rocks on the
 * felt of its stand: a damped sine of the time since each strike.
 */
export const CYMBAL_SWING = {
  /** The largest tilt of one strike of the loudness 1, in radians. */
  angle: 3 * MathUtils.DEG2RAD,
  /** The rate of the swing, in swings for each second. */
  hz: 1.4,
  /** The time in which the swing falls to 1/e, in seconds. */
  decaySec: 0.9,
  /** The largest tilt of the sum of the strikes, in radians, for a roll. */
  maxAngle: 4 * MathUtils.DEG2RAD,
} as const;

/**
 * Gives the tilt of the plate of a suspended cymbal at a song time (design 5.3): the sum of a
 * damped sine for each strike before the time. The sum of the swings of a linear rocker makes no
 * jump at a strike, and the pose keeps no state.
 *
 * @param swings Two numbers for each strike, sorted: the start and the size of the strike.
 * @param time The song time of the note layer.
 * @returns The tilt around x, in radians: a positive tilt lowers the near edge.
 */
export function cymbalSwingAt(swings: Float64Array, time: number): number {
  const s = CYMBAL_SWING;
  const horizon = 5 * s.decaySec;
  let tilt = 0;
  for (let k = swings.length - 2; k >= 0; k -= 2) {
    const dt = time - (swings[k] ?? 0);
    if (dt < 0) {
      continue;
    }
    if (dt > horizon) {
      break;
    }
    tilt += (swings[k + 1] ?? 0) * Math.exp(-dt / s.decaySec) * Math.sin(2 * Math.PI * s.hz * dt);
  }
  return MathUtils.clamp(s.angle * tilt, -s.maxAngle, s.maxAngle);
}

/**
 * Gives the weight of the playing position against the set position at a song time (design 5.3):
 * 0 in the set position of a long rest, and 1 in a passage.
 *
 * @param rests The long rests of the player ({@link setRests}).
 * @param time The song time of the note layer.
 * @returns The weight, from 0 to 1.
 */
export function setWeightAt(rests: Float64Array, time: number): number {
  for (let k = 0; k + 3 < rests.length; k += 4) {
    const lowerStart = rests[k] ?? 0;
    const lowerEnd = rests[k + 1] ?? 0;
    const liftStart = rests[k + 2] ?? 0;
    const liftEnd = rests[k + 3] ?? 0;
    if (time < lowerStart) {
      return 1;
    }
    if (time < liftEnd) {
      if (time < lowerEnd) {
        return 1 - smoothstep((time - lowerStart) / (lowerEnd - lowerStart));
      }
      if (time < liftStart) {
        return 0;
      }
      return smoothstep((time - liftStart) / (liftEnd - liftStart));
    }
  }
  return 1;
}

/**
 * Calculates the strike data of the two hands of a percussion player (design 5.3). The notes that
 * start within 50 ms of each other strike together ({@link chordStrikes}). A fast roll strikes
 * only on some of its notes ({@link thinRolls}). A hold with a side move
 * (`PercussionHold.side`) moves the body toward the mean side place of the targets of each strike
 * group.
 *
 * @param rig The points of the player.
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param amplitude The seeded amplitude of the player.
 * @param beats The times of the conducted beats, sorted: the lift before an entry and the set
 *   position of a long rest follow them.
 * @returns The strike data of each hand.
 */
export function percussionTracks(
  rig: PercussionRig,
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  amplitude: number,
  beats: Float64Array,
): PercussionTracks {
  const { hold, instrument } = rig;
  const noteGroups = groupChords(notes, loudness);
  const runs = rig.switch ? instrumentRuns(noteGroups) : null;
  const chords = chordStrikes(rig, notes, noteGroups, runs);
  // A fast roll keeps the strikes of a rate that reads as a roll: two hands in turn, or one hand.
  const kept = thinRolls(
    chords,
    hold.hands === 'alternate' || hold.hands === 'sides'
      ? STRIKE_MOTION.rollSec
      : STRIKE_MOTION.handRollSec,
  );
  const rolled = instrument === 'small-percussion' ? triangleRolls(rig, chords, kept) : kept;
  const held = runs ? tambourineRolls(chords, rolled, runs) : null;
  const groups = held ? held.groups : rolled;
  const side = hold.side
    ? buildSideTrack(
        hold.side,
        groups.flatMap((g) =>
          g.targets.length > 0
            ? [
                {
                  start: g.start,
                  place: g.targets.reduce((sum, t) => sum + t.point[0], 0) / g.targets.length,
                },
              ]
            : [],
        ),
      )
    : null;
  const [left, right] = handTracks(rig, groups, side, amplitude, beats);
  const moveOf = (hand: DampHand | null): number => (hand?.kind === 'grip' ? hand.moveSec : 0);
  const damp =
    hold.damp && right
      ? dampTrackOf(hold.damp, noteGroups, left, right, [
          moveOf(rig.dampHands[0]),
          moveOf(rig.dampHands[1]),
        ])
      : null;
  const ring =
    hold.hands === 'pair' && right
      ? ringTrack(
          right,
          groups.flatMap((g) => (g.targets.length > 0 ? [g.loudness] : [])),
          damp,
        )
      : null;
  // A hold with a set position and no ready pose puts the sticks there in a long rest, and the
  // hand cymbals go down. The move down starts after the damp and the follow move of the last
  // strike.
  const rests =
    (hold.set || hold.hands === 'pair') && !hold.ready
      ? setRests(
          groups.map((g) => g.start),
          beats,
          afterEnds(groups, [damp, ring]),
        )
      : null;
  const small =
    runs && held
      ? {
          switches: buildSwitchTrack(runs),
          rolls: held.rolls,
          loudness: Float64Array.from(
            groups.flatMap((g) => (g.targets.length > 0 ? [g.loudness] : [])),
          ),
          held: Uint8Array.from(
            groups.flatMap((g) => (g.targets.length > 0 ? [inHeldRun(runs, g) ? 1 : 0] : [])),
          ),
        }
      : null;
  // Each strike of a suspended cymbal swings its plate (`CYMBAL_SWING`).
  const plateSwings =
    hold === SUSPENDED_CYMBAL_HOLD
      ? Float64Array.from(groups.flatMap((g) => [g.start, g.loudness * amplitude]))
      : null;
  return { left, right, side, rests, damp, ring, small, swing: plateSwings };
}

/**
 * Tells if a note group is a note of a run of the tambourine that the left paw holds.
 *
 * @param runs The runs of the player ({@link instrumentRuns}).
 * @param group The note group.
 * @returns True for a held tambourine note.
 */
function inHeldRun(runs: readonly InstrumentRun[], group: StrikeGroup | NoteGroup): boolean {
  return runs.some(
    (run) => run.held && group.start >= run.start - 1e-9 && group.start <= run.end + 1e-9,
  );
}

/** The strikes of the small percussion player with the rolls of the held tambourine. */
interface TambourineRolls {
  /** The kept strike groups, with no target in a roll. */
  readonly groups: StrikeGroup[];
  /** The rolls (`SmallTracks.rolls`). */
  readonly rolls: Float64Array;
}

/**
 * Finds the rolls of the held tambourine (design 5.3): a run of notes of the held tambourine,
 * each within `TRIANGLE_ROLL.rollSec` of the note before it. A loud roll is a shake roll of the
 * left forearm, and a soft roll is a thumb roll along the rim, as a real player plays a long note
 * (`docs/reference/percussion-technique.md` 8). The right paw does not strike the notes of a roll.
 *
 * @param chords All strike groups of the player, sorted by start.
 * @param groups The kept strike groups, sorted by start.
 * @param runs The runs of the player.
 * @returns The kept groups with no target in a roll, and the rolls.
 */
function tambourineRolls(
  chords: readonly StrikeGroup[],
  groups: readonly StrikeGroup[],
  runs: readonly InstrumentRun[],
): TambourineRolls {
  const spans: [number, number, number][] = [];
  for (const [i, g] of chords.entries()) {
    const before = chords[i - 1];
    if (
      !before ||
      !inHeldRun(runs, g) ||
      !inHeldRun(runs, before) ||
      g.start - before.start >= TRIANGLE_ROLL.rollSec
    ) {
      continue;
    }
    const last = spans.at(-1);
    if (last && last[1] === before.start) {
      last[1] = g.start;
      last[2] = Math.max(last[2], g.loudness);
    } else {
      spans.push([before.start, g.start, Math.max(before.loudness, g.loudness)]);
    }
  }
  const inRoll = (g: StrikeGroup): boolean =>
    spans.some(([from, to]) => g.start >= from - 1e-9 && g.start <= to + 1e-9);
  return {
    groups: groups.map((g) => (inRoll(g) ? { ...g, targets: [] } : g)),
    rolls: Float64Array.from(
      spans.flatMap(([from, to, loud]) => [
        from,
        to + STRIKE_MOTION.reboundSec,
        loud >= TAMBOURINE_HOLD.shakeLoud ? 1 : 0,
      ]),
    ),
  };
}

/**
 * Gives the targets of each note group of a percussion player (design 5.3). A drum player strikes
 * its own instrument for each of its notes, also for the notes of another key group (design 3.8).
 * Of a chord of the small percussion player, the triangle sounds unless all notes are the
 * tambourine. A timpani hold with a pair of front kettles (`PercussionHold.pair`) plays each note
 * on one of them.
 *
 * @param rig The points of the player.
 * @param notes The notes of the player, sorted by start.
 * @param noteGroups The note groups of the notes, sorted by start.
 * @returns One strike group for each note group.
 */
function chordStrikes(
  rig: PercussionRig,
  notes: readonly PlayerNote[],
  noteGroups: readonly NoteGroup[],
  runs: readonly InstrumentRun[] | null,
): StrikeGroup[] {
  const { hold, instrument } = rig;
  const kettles = instrument === 'timpani' ? rig.targets.size : 4;
  // With a pair of front kettles, a note below the middle key of the part plays on the left one.
  const pair = instrument === 'timpani' && hold.pair;
  const [frontL, frontR] = frontKettles(kettles);
  let lowest = Infinity;
  let highest = -Infinity;
  for (const note of notes) {
    lowest = Math.min(lowest, note.pitch);
    highest = Math.max(highest, note.pitch);
  }
  const middle = (lowest + highest) / 2;
  const shift = instrument === 'xylophone' ? xylophoneShift(lowest, highest) : 0;
  const keyOf = (pitch: number): number =>
    pair ? (pitch < middle ? frontL : frontR) : targetKeyOf(instrument, pitch, kettles, shift);
  return noteGroups.map((group): StrikeGroup => {
    // The right paw strikes the held tambourine near the rim for a soft note, and nearer to the
    // middle for a louder note (`TAMBOURINE_HOLD`).
    if (rig.switch && runs && onlyTambourine(group) && inHeldRun(runs, group)) {
      const { head, toRight } = rig.switch;
      const t = TAMBOURINE_HOLD;
      const point = new Vector3(...head.point).addScaledVector(
        new Vector3(...toRight),
        group.loudness < t.soft ? t.rimSpot : t.middleSpot,
      );
      return {
        start: group.start,
        loudness: group.loudness,
        targets: [{ point: [point.x, point.y, point.z], normal: head.normal }],
      };
    }
    const keys = new Set<number>();
    for (const note of notes.slice(group.first, group.first + group.count)) {
      keys.add(keyOf(note.pitch));
    }
    // The triangle (key 0) sounds over the tambourine (key 1).
    const chosen = instrument === 'small-percussion' ? [Math.min(...keys)] : [...keys];
    const targets: StrikeTarget[] = [];
    for (const key of chosen) {
      const target = rig.targets.get(key) ?? nearestTarget(rig, key);
      if (target) {
        targets.push(target);
      }
    }
    return { start: group.start, loudness: group.loudness, targets };
  });
}

/**
 * Gives the strikes of a percussion player to its hands and calculates the strike data of each
 * hand (design 5.3). An alternate hold shares the strikes between the two hands
 * ({@link alternateHands}), and a hold of two sides gives each hand the targets on its side
 * ({@link sideHands}). The pair of hand cymbals strikes each note with both hands, and a louder
 * crash meets higher. Another hold strikes with the right hand alone.
 *
 * @param rig The points of the player.
 * @param groups The strike groups of the player, sorted by start.
 * @param side The side move of the body behind the notes, or `null`.
 * @param amplitude The seeded amplitude of the player.
 * @param beats The times of the conducted beats, sorted.
 * @returns The strike data of the left and the right hand, `null` for a hand with no strikes.
 */
function handTracks(
  rig: PercussionRig,
  groups: readonly StrikeGroup[],
  side: SideTrack | null,
  amplitude: number,
  beats: Float64Array,
): readonly [left: StrikeTrack | null, right: StrikeTrack | null] {
  const { hold } = rig;
  // With a gap, a hand waits at its rest target before its first strike, and the other hand keeps
  // the gap from that place.
  const waits = hold.gap > 0;
  // Each strike point rises out of its surface by the radius of the mallet head (ballLift).
  const lifted = (s: Strike, offset: Vec3): Vec3 => {
    const [nx, ny, nz] = s.normal;
    const lift = hold.ballLift;
    return [offset[0] + nx * lift, offset[1] + ny * lift, offset[2] + nz * lift];
  };
  const track = (strikes: readonly Strike[], offset: Vec3, rest: StrikeTarget): StrikeTrack =>
    buildStrikeTrack(
      strikes.map((s) => ({ ...s, point: offsetTarget(s, lifted(s, offset)).point })),
      strikes[0] && !waits ? offsetTarget(strikes[0], offset) : rest,
      hold.sizes,
      amplitude,
      beats,
    );
  if (hold.hands === 'sides') {
    // With a pair of front kettles, each paw waits over the kettle of its side.
    const [frontL, frontR] = frontKettles(rig.targets.size);
    const [strikesL, strikesR] = sideHands(
      groups,
      rig.instrument === 'timpani' && hold.pair
        ? [rig.targets.get(frontL), rig.targets.get(frontR)]
        : [undefined, undefined],
    );
    return [track(strikesL, hold.offsetL, rig.restL), track(strikesR, hold.offsetR, rig.restR)];
  }
  if (hold.hands === 'alternate') {
    const [strikesL, strikesR] = alternateHands(groups, {
      alternateSec: STRIKE_MOTION.alternateSec,
      gap: hold.gap,
      pass: hold.pass,
      places: waits ? [rig.restL.point[0], rig.restR.point[0]] : [-Infinity, Infinity],
      reach: hold.reach * rig.headHeight,
      shoulders: [
        [rig.left.arm.bind.shoulder[0], rig.left.arm.bind.shoulder[2]],
        [rig.right.arm.bind.shoulder[0], rig.right.arm.bind.shoulder[2]],
      ],
      // The hips and the lean of the spine move the shoulders toward the notes.
      shift: (start) =>
        side && hold.side
          ? sideMoveAt(side, start) * (hold.side.hips + Math.sin(hold.side.spine) * rig.lever)
          : 0,
    });
    return [track(strikesL, hold.offsetL, rig.restL), track(strikesR, hold.offsetR, rig.restR)];
  }
  const strikes = groups.flatMap((g): Strike[] => {
    const target = g.targets[0];
    if (!target) {
      return [];
    }
    // A louder crash of the hand cymbals meets higher.
    const raise = hold.hands === 'pair' ? CRASH_MOTION.raise * rig.headHeight * g.loudness : 0;
    return [{ ...offsetTarget(target, [0, raise, 0]), start: g.start, loudness: g.loudness }];
  });
  const right = track(strikes, hold.offsetR, rig.restR);
  return [hold.hands === 'pair' ? right : null, right];
}

/**
 * Moves the strikes of a triangle roll into the closed corner ({@link TRIANGLE_ROLL}). A roll is a
 * run of notes on the triangle, each within `rollSec` of the note before it. Its kept strikes
 * ({@link thinRolls}) strike the two sides of the corner in turn, from inside, from the bottom
 * side. Another strike keeps the outer face of the right side.
 *
 * @param rig The points of the small percussion player.
 * @param chords All strikes of the player, sorted by start.
 * @param groups The kept strikes, sorted by start.
 * @returns The kept strikes with the roll targets.
 */
function triangleRolls(
  rig: PercussionRig,
  chords: readonly StrikeGroup[],
  groups: readonly StrikeGroup[],
): StrikeGroup[] {
  const bar = rig.targets.get(0);
  const corner = TRIANGLE_ROLL.keys.map((key) => rig.targets.get(key));
  const onBar = (g: StrikeGroup | undefined): boolean => !!g && g.targets[0] === bar;
  // The spans of the rolls: from the first to the last note of each run.
  const spans: [number, number][] = [];
  for (const [i, g] of chords.entries()) {
    const before = chords[i - 1];
    if (!onBar(g) || !before || !onBar(before) || g.start - before.start >= TRIANGLE_ROLL.rollSec) {
      continue;
    }
    const last = spans.at(-1);
    if (last && last[1] === before.start) {
      last[1] = g.start;
    } else {
      spans.push([before.start, g.start]);
    }
  }
  let turn = 0;
  return groups.map((g) => {
    const rolls = onBar(g) && spans.some(([from, to]) => g.start >= from && g.start <= to);
    if (!rolls) {
      turn = 0;
      return g;
    }
    const target = corner[turn % corner.length];
    turn++;
    return target ? { ...g, targets: [target] } : g;
  });
}

/**
 * Gives the times at which the moves after each strike end their stay at the place: the start of
 * the move back of the last window that starts before the next strike, or the strike itself.
 *
 * @param groups The strikes, sorted by start.
 * @param tracks The moves after the strikes.
 * @returns One time for each strike.
 */
function afterEnds(
  groups: readonly StrikeGroup[],
  tracks: readonly (DampTrack | null)[],
): number[] {
  return groups.map((g, i) => {
    const next = groups[i + 1]?.start ?? Infinity;
    let end = g.start;
    for (const t of tracks) {
      if (!t) {
        continue;
      }
      for (let k = 0; k < t.starts.length; k++) {
        const start = t.starts[k] ?? 0;
        if (start >= g.start && start < next) {
          end = Math.max(end, t.releases[k] ?? 0);
        }
      }
    }
    return end;
  });
}

/**
 * Finds the damps of a player (`PercussionHold.damp`, design 5.3). A note is damped at its end
 * when the silence to the next note of the player is at least `restSec`. The hand cymbals go to
 * the chest: the move starts at the crash of the note and ends before the next lift. The free paw
 * of the bass drum goes to the far head, and the paw that did not strike a note of the suspended
 * cymbal grips its rim: the move starts after the rebound of the strike, and ends at the next note
 * or before the next lift of a paw. The paw of the timpani that struck the note lays its end on the
 * head, until the next note or the next lift of that paw. The key of each window is the hand: 0
 * for the left hand, and 1 for the right hand.
 *
 * @param rule The rule of the damp.
 * @param groups The note groups of the player, sorted by start.
 * @param left The strikes of the left hand, or `null`.
 * @param right The strikes of the right hand: the hand cymbals, the beater, or the right mallet.
 * @returns The damps.
 */
function dampTrackOf(
  rule: DampRule,
  groups: readonly NoteGroup[],
  left: StrikeTrack | null,
  right: StrikeTrack,
  moves: readonly [left: number, right: number],
): DampTrack {
  const m = DAMP_MOTION;
  const wishes: DampWish[] = [];
  // The last strike of a hand at or before a time, or -1.
  const lastOf = (track: StrikeTrack | null, time: number): number =>
    track ? lastAtOrBefore(track.starts, time + 1e-6) : -1;
  for (const [k, g] of groups.entries()) {
    const next = groups[k + 1];
    const i = lastOf(right, g.start);
    if ((next && next.start - g.end < rule.restSec) || (i < 0 && lastOf(left, g.start) < 0)) {
      continue;
    }
    const after = {
      contact: g.end,
      hold: rule.hold,
      inSec: m.inSec,
      outSec: m.outSec,
      minInSec: m.minInSec,
    };
    if (rule.kind === 'chest') {
      wishes.push({
        ...after,
        earliest: right.starts[i] ?? g.start,
        latest: right.upStarts[i + 1] ?? Infinity,
        key: 0,
      });
      continue;
    }
    // The paw of the damp: the free left paw of the bass drum, the paw whose last strike is older
    // at the suspended cymbal, or the paw that struck the note at the timpani.
    const j = lastOf(left, g.start);
    const rightLater = (right.starts[i] ?? -Infinity) > (left?.starts[j] ?? -Infinity);
    const free =
      rule.kind === 'palm' || (rule.kind === 'edge' ? rightLater : !rightLater) ? left : right;
    // The next lift of a paw with a mallet.
    const liftOf = (track: StrikeTrack | null): number =>
      track ? (track.upStarts[lastOf(track, g.start) + 1] ?? Infinity) : Infinity;
    // A paw of the timpani muffles its own kettle, so only its own next lift ends the muffle.
    const lift =
      rule.kind === 'palm'
        ? Infinity
        : rule.kind === 'fingers'
          ? liftOf(free)
          : Math.min(liftOf(left), liftOf(right));
    // A long move of a paw takes the time that keeps it at the speed of a real player
    // (`DampHand.moveSec`).
    const move = moves[free === right ? 1 : 0];
    wishes.push({
      ...after,
      inSec: Math.max(m.inSec, move),
      outSec: Math.max(m.outSec, move),
      minInSec: Math.max(m.minInSec, move),
      earliest: g.start + STRIKE_MOTION.reboundSec,
      latest: Math.min(next?.start ?? Infinity, lift),
      key: free === right ? 1 : 0,
    });
  }
  return dampTrack(wishes);
}

/**
 * Finds the follow moves of the hand cymbals after each crash ({@link CRASH_MOTION}): the plates
 * turn out from the crash, and turn back before the damp of the note or the next lift. A crash
 * with too little time has no follow move, so a short note goes to the chest at once. The key of
 * each move is the loudness of its crash.
 *
 * @param crashes The crashes.
 * @param loudness The loudness of each crash.
 * @param damps The damps of the crashes.
 * @returns The follow moves.
 */
function ringTrack(
  crashes: StrikeTrack,
  loudness: readonly number[],
  damps: DampTrack | null,
): DampTrack {
  const c = CRASH_MOTION;
  const wishes: DampWish[] = [];
  for (let i = 0; i < crashes.starts.length; i++) {
    const start = crashes.starts[i] ?? 0;
    let latest = crashes.upStarts[i + 1] ?? Infinity;
    if (damps) {
      const k = lastAtOrBefore(damps.starts, latest);
      const damp = damps.starts[k];
      if (damp !== undefined && damp >= start) {
        latest = Math.min(latest, damps.contacts[k] ?? latest);
      }
    }
    wishes.push({
      contact: start + c.ringInSec,
      earliest: start,
      latest,
      hold: Infinity,
      key: loudness[i] ?? 0,
      inSec: c.ringInSec,
      outSec: c.ringOutSec,
      minInSec: DAMP_MOTION.minInSec,
    });
  }
  return dampTrack(wishes);
}

/**
 * Finds the target of the nearest key, for a key that the instrument does not have.
 *
 * @param rig The points of the player.
 * @param key The key of the target.
 * @returns The target, or `undefined` if the instrument has no targets.
 */
function nearestTarget(rig: PercussionRig, key: number): StrikeTarget | undefined {
  let best: StrikeTarget | undefined;
  let distance = Infinity;
  for (const [k, target] of rig.targets) {
    if (Math.abs(k - key) < distance) {
      best = target;
      distance = Math.abs(k - key);
    }
  }
  return best;
}

/** The motion of the two hands of a percussion player at one time. */
export interface PercussionState {
  readonly left: StrikeState;
  readonly right: StrikeState;
  /** The damp of the hand cymbals against the chest (`PercussionHold.damp`). */
  readonly damp: DampState;
  /** The follow move of the hand cymbals after a crash ({@link CRASH_MOTION}). */
  readonly ring: DampState;
  /** The switch of the small percussion player between the triangle and the tambourine. */
  readonly swap: SwitchState;
  /** The small percussion player at the held tambourine ({@link smallStateAt}). */
  readonly small: SmallState;
}

/** The roll and the strike of the small percussion player at one time (design 5.3). */
export interface SmallState {
  /** The roll of the held tambourine: -1 for no roll, 0 for a thumb roll, 1 for a shake roll. */
  roll: number;
  /** The share of the time of the roll, from 0 to 1. */
  rollShare: number;
  /** The time since the start of the roll, in seconds. */
  rollSec: number;
  /** The loudness of the last or the next strike of the right paw, from 0 to 1. */
  loudness: number;
  /** True when the last or the next strike of the right paw is on the held tambourine. */
  onHead: boolean;
  /** True when the strike before it is on the held tambourine too. */
  fromHead: boolean;
  /** The target of the last or the next strike of the right paw. */
  readonly point: [number, number, number];
}

/**
 * Makes a state with no roll and no loudness.
 *
 * @returns The state.
 */
export function createSmallState(): SmallState {
  return {
    roll: -1,
    rollShare: 0,
    rollSec: 0,
    loudness: 0,
    onHead: false,
    fromHead: false,
    point: [0, 0, 0],
  };
}

/**
 * Calculates the switch, the roll, and the loudness of the strike of the right paw of the small
 * percussion player at a song time (design 5.3).
 *
 * @param small The tracks of the player, or `null` for another player.
 * @param right The strikes of the right paw, or `null`.
 * @param time The song time of the note layer.
 * @param swap Gets the switch.
 * @param out Gets the roll and the loudness.
 */
export function smallStateAt(
  small: SmallTracks | null,
  right: StrikeTrack | null,
  time: number,
  swap: SwitchState,
  out: SmallState,
): void {
  out.roll = -1;
  out.rollShare = 0;
  out.rollSec = 0;
  out.loudness = 0;
  out.onHead = false;
  out.fromHead = false;
  if (!small) {
    return;
  }
  switchStateAt(small.switches, time, swap);
  const { rolls } = small;
  for (let k = 0; k + 2 < rolls.length; k += 3) {
    const start = rolls[k] ?? 0;
    const end = rolls[k + 1] ?? 0;
    if (time >= start && time < end) {
      out.roll = rolls[k + 2] ?? 0;
      out.rollShare = (time - start) / (end - start || 1);
      out.rollSec = time - start;
    }
  }
  const i = right ? lastAtOrBefore(right.upStarts, time) : -1;
  if (right && i >= 0) {
    out.loudness = small.loudness[i] ?? 0;
    out.onHead = small.held[i] === 1;
    out.fromHead = small.held[i - 1] === 1;
    out.point[0] = right.points[3 * i] ?? 0;
    out.point[1] = right.points[3 * i + 1] ?? 0;
    out.point[2] = right.points[3 * i + 2] ?? 0;
  }
}

const shoulder = createFrame();
const wrist = new Vector3();
const turn = new Quaternion();
const hanging = new Vector3();
const restHand = new Quaternion();
const head = new Vector3();
const along = new Vector3();
const top = new Vector3();
const offset = new Vector3();
const wristBind = new Vector3();
const grip = new Vector3();
const homeShift = new Vector3();
/** The chest and a shoulder of the body that only leans ({@link steadyRoll}). */
const steadyChest = createFrame();
const steadyShoulder = createFrame();
const steadyPole = new Vector3();
const steadyHead = new Vector3();
/** The head of a mallet at the damp of its paw. */
const dampHead = new Vector3();
/** No move of the home of a mallet. Nothing writes it. */
const NO_SHIFT = new Vector3();
const tablePole = new Vector3();
const playPole = new Vector3();
const nowPole = new Vector3();
const corner = new Vector3();
const level = new Vector3();
const swing = new Quaternion();
const inverse = new Quaternion();
const piece = new Quaternion();
const pieceTurn = new Quaternion();

/** The index of the bone of the piece in the left paw: the triangle or the tambourine. */
const MALLET_L = boneIndex('malletL');
const strikeAlong = new Vector3();
const forearm = new Vector3();
const upperArm = new Vector3();
const acrossUp = new Vector3();
const acrossOut = new Vector3();
const elbowBind = new Vector3();
const shoulderBind = new Vector3();
const turnedPole = new Vector3();
const joints = { elbow: new Vector3(), wrist: new Vector3() };

const thumbAxis = new Vector3();
const rollSide = new Vector3();
const rollUp = new Vector3();
const shaftInHand = new Vector3();
const strikeTurn = new Quaternion();
const strikeHand = new Quaternion();
const rollTurn = new Quaternion();
const strikeDirection = new Vector3();
const inward = new Vector3();

/**
 * Writes the turn of a paw that holds its mallet across the forearm with no bend and the
 * direction of the mallet: the mallet points at an angle around the forearm from the direction of
 * no twist, and the top of the grip points along the forearm toward the elbow. A mallet that
 * slants toward the wrist in the bind pose keeps that slant.
 *
 * @param side The hand with a mallet.
 * @param armForearm The unit direction of the posed forearm, from the elbow to the wrist. The
 *   module vectors `acrossUp` and `acrossOut` hold its axes ({@link acrossAxes}).
 * @param angle The angle of the mallet around the forearm from the direction of no twist toward
 *   the out side of the hand, in radians.
 * @param out Gets the world rotation of the hand from the bind pose.
 * @param direction Gets the unit direction of the mallet.
 */
function crossTurn(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  armForearm: Vector3,
  angle: number,
  out: Quaternion,
  direction: Vector3,
): void {
  direction
    .copy(acrossUp)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(acrossOut, Math.sin(angle))
    .multiplyScalar(Math.cos(side.tilt))
    .addScaledVector(armForearm, Math.sin(side.tilt));
  top.copy(armForearm).negate();
  top.addScaledVector(direction, -top.dot(direction)).normalize();
  setFromBasis(out, direction, top).multiply(inverse.fromArray(side.inverse));
}

/**
 * Writes the turn of a hand with a mallet across the forearm and the direction of the mallet,
 * for one share of the turn toward the rest direction (see `acrossHand()`). The roll of the paw
 * around the mallet comes from the rest direction, where the top of the grip points along the
 * forearm toward the elbow, and the swings carry it to the strike.
 *
 * @param side The hand with a mallet across the forearm.
 * @param armForearm The unit direction of the posed forearm, from the elbow to the wrist. The
 *   module vectors `acrossUp` and `acrossOut` hold its axes ({@link acrossAxes}).
 * @param share The share of the turn toward the rest direction, from 0 at a strike to 1. With a
 *   pitch, a share above 1 lifts the head higher than between strikes (`MalletAcross.peak`).
 * @param out Gets the world rotation of the hand from the bind pose.
 * @param direction Gets the unit direction of the mallet.
 */
function holdTurn(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  armForearm: Vector3,
  share: number,
  out: Quaternion,
  direction: Vector3,
): void {
  const { across } = side;
  if (!across) {
    return;
  }
  // The rest direction across the armForearm, and the paw that holds it with no swing.
  crossTurn(side, armForearm, across.rest, out, direction);
  // The wrist lifts the head: a out of the paw around the level axis normal to the armForearm,
  // with no twist on the armForearm.
  level.crossVectors(armForearm, Y_AXIS);
  if (across.lift !== 0 && level.lengthSq() > 1e-8) {
    swing.setFromAxisAngle(level.normalize(), across.lift);
    out.premultiply(swing);
    direction.applyQuaternion(swing);
  }
  // The smallest turn from the rest direction to the strike direction, by the share left. A share
  // above 1 turns past the rest direction, away from the strike.
  swing
    .setFromUnitVectors(direction, strikeAlong)
    .slerp(NO_TURN, across.pitch === null ? share : 0);
  out.premultiply(swing);
  direction.applyQuaternion(swing);
  // With a pitch, the paw keeps the out of the strike, and the wrist lifts the head over its
  // spot by a share of the pitch.
  level.crossVectors(armForearm, Y_AXIS);
  if (across.pitch !== null && level.lengthSq() > 1e-8) {
    swing.setFromAxisAngle(level.normalize(), across.pitch * share);
    out.premultiply(swing);
    direction.applyQuaternion(swing);
  }
}

/**
 * Gives the roll of a mallet in its paw that removes the side bend of the paw on the forearm at
 * a strike (design 5.3). The retarget turns each studio paw in the plane of its palm toward the
 * forearm (`PAW_TURN` of `models/studio-rig.ts`), but the mallet follows the hand of the player.
 * With a side bend, the shaft thus moves in the visible paw and leaves it along the fingers. The
 * hand turns around the shaft until its thumb
 * axis is normal to the forearm: then the retarget turns no paw, and the shaft stays where the
 * bind pose holds it. Of the two turns, the function takes the smaller one. When the forearm is
 * nearer to the shaft than the shaft to the fingers in the bind pose, no turn removes the side
 * bend, and the function takes the turn with the least side bend. Near the line of the shaft, the
 * roll fades out ({@link GRIP_FADE}). The paw keeps the roll through the stroke, because a roll
 * for each moment of the stroke turns the paws up to 79° in 0.01 s. A small move of the forearm
 * can change the roll by 20° where the two turns meet, so a mallet across the forearm takes the
 * roll of the body that only leans ({@link steadyRoll}).
 *
 * @param side The hand with a mallet.
 * @param direction The unit direction of the mallet at the strike, from the grip to the head.
 * @param armForearm The unit direction of the posed forearm, from the elbow to the wrist.
 * @param out The world rotation of the hand at the strike. Gets the roll, as a rotation in the
 *   axes of the hand.
 * @returns `out`.
 */
function gripRoll(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  direction: Vector3,
  armForearm: Vector3,
  out: Quaternion,
): Quaternion {
  // The roll r around the shaft that puts the thumb axis (z of the hand) normal to the forearm:
  // c + a cos(r) + b sin(r) = 0.
  thumbAxis.copy(Z_AXIS).applyQuaternion(out);
  const c = thumbAxis.dot(direction) * armForearm.dot(direction);
  rollSide.copy(thumbAxis).addScaledVector(direction, -thumbAxis.dot(direction));
  rollUp.crossVectors(direction, rollSide);
  const a = armForearm.dot(rollSide);
  const b = armForearm.dot(rollUp);
  const radius = Math.hypot(a, b);
  shaftOf(side, shaftInHand);
  if (radius < 1e-8) {
    return out.identity();
  }
  const base = Math.atan2(b, a);
  const spread = Math.acos(MathUtils.clamp(-c / radius, -1, 1));
  const wrap = (r: number): number => Math.atan2(Math.sin(r), Math.cos(r));
  const first = wrap(base + spread);
  const second = wrap(base - spread);
  const roll = Math.abs(first) <= Math.abs(second) ? first : second;
  const fromFingers = Math.PI / 2 - side.tilt;
  const fade = MathUtils.smoothstep(
    armForearm.angleTo(direction),
    fromFingers - GRIP_FADE[0],
    fromFingers - GRIP_FADE[1],
  );
  return out.setFromAxisAngle(shaftInHand, roll * fade);
}

const GRIP_FADE = [30 * MathUtils.DEG2RAD, 10 * MathUtils.DEG2RAD] as const;

/**
 * Gives the axis of a mallet in the axes of its hand, from the grip to the head.
 *
 * @param side The hand with a mallet.
 * @param out Gets the unit axis.
 * @returns `out`.
 */
function shaftOf(side: Extract<PercussionSide, { kind: 'mallet' }>, out: Vector3): Vector3 {
  return out.set(1, 0, 0).applyQuaternion(inverse.fromArray(side.inverse).invert());
}

/**
 * Turns the strike direction of a mallet up, so that its grip is at most the height of
 * `PercussionHold.gripRise` over its target (design 5.3). The heading of the mallet on the floor
 * plane stays. A mallet that slopes down less, or a hold with no limit, keeps its direction.
 *
 * @param direction The unit direction of the mallet at the strike, from the grip to the head. The
 *   function changes it.
 * @param side The hand with a mallet.
 */
function limitRise(direction: Vector3, side: Extract<PercussionSide, { kind: 'mallet' }>): void {
  if (side.gripRise === null) {
    return;
  }
  const most = MathUtils.clamp(side.gripRise / side.length, 0, 1);
  const flat = Math.hypot(direction.x, direction.z);
  if (-direction.y <= most || flat < 1e-6) {
    return;
  }
  const scale = Math.sqrt(1 - most * most) / flat;
  direction.set(direction.x * scale, -most, direction.z * scale);
}

/**
 * Writes the wrist and the world rotation of a hand with a mallet across the forearm between
 * strikes (`PercussionHold.across`, design 5.3). At a strike, the mallet points from the home of
 * the hand to the target, and the grip stays at that place. A hold can turn the mallet up
 * ({@link limitRise}). The paw at rest holds the mallet
 * across the forearm, at its angle in the frame of the elbow, with the top of the grip along the
 * forearm toward the elbow, and the wrist lifts the head by `MalletAcross.lift`. Between the
 * two, the paw turns around the grip by a share of the smallest turn from the rest direction to
 * the strike direction. With `MalletAcross.pitch`, the paw keeps the turn of the strike, and the
 * wrist lifts the head by a share of the pitch around the level axis normal to the forearm, so
 * that the tip stays over its spot. The forearm comes from the
 * two-bone solution to the wrist, two times, because the wrist follows the turn of the paw. The
 * function writes the module vectors `wrist` and `turn`, and it writes the head into `point`.
 *
 * @param side The hand with a mallet across the forearm.
 * @param point The target of the mallet head. The function writes the head into it.
 * @param share The share of the turn toward the rest direction, from 0 at a strike to 1. With a
 *   pitch, a share above 1 lifts the head higher than between strikes (`MalletAcross.peak`).
 * @param joint The posed shoulder joint of the side.
 * @param pole The direction to which the elbow points, in the model axes.
 * @param shift The move of the home of the mallet, in meters: the move of the paw at a damp that
 *   keeps the direction of the mallet (`DampHand.keep`).
 * @param held The roll of the mallet in the paw ({@link steadyRoll}), in radians, or `null` for
 *   the roll that has no side bend on the forearm of this arm at the strike ({@link gripRoll}).
 * @returns The roll of the mallet in the paw, in radians: 0 for a paw with no bend rule.
 */
function acrossHand(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  point: Vector3,
  share: number,
  joint: Vector3,
  pole: Vector3,
  shift: Vector3,
  held: number | null,
): number {
  const { across, arm } = side;
  let roll = 0;
  if (!across) {
    return roll;
  }
  strikeAlong.copy(point).sub(offset.fromArray(side.home).add(shift)).normalize();
  limitRise(strikeAlong, side);
  grip.copy(point).addScaledVector(strikeAlong, -side.length);
  shoulderBind.fromArray(arm.bind.shoulder);
  elbowBind.fromArray(arm.bind.elbow);
  const upper = elbowBind.distanceTo(shoulderBind);
  const lower = wristBind.fromArray(arm.bind.wrist).distanceTo(elbowBind);
  wrist.copy(grip);
  for (let pass = 0; pass < 2; pass++) {
    solveTwoBone(joint, wrist, upper, lower, pole, joints);
    forearm.subVectors(joints.wrist, joints.elbow).normalize();
    acrossAxes(forearm, upperArm.subVectors(joints.elbow, joint), arm.side, acrossUp, acrossOut);
    holdTurn(side, forearm, share, turn, along);
    // A paw with a bend rule holds the mallet with no side bend on the forearm at the strike, and
    // keeps that roll of the mallet in the paw through the stroke.
    if (side.strikeRoll && held === null) {
      holdTurn(side, forearm, 0, strikeTurn, strikeDirection);
      gripRoll(side, strikeDirection, forearm, rollTurn.copy(strikeTurn));
      roll =
        2 *
        Math.atan2(
          rollTurn.x * shaftInHand.x + rollTurn.y * shaftInHand.y + rollTurn.z * shaftInHand.z,
          rollTurn.w,
        );
      turn.multiply(rollTurn);
    } else if (side.strikeRoll && held !== null) {
      roll = held;
      turn.multiply(rollTurn.setFromAxisAngle(shaftOf(side, shaftInHand), held));
    }
    point.copy(grip).addScaledVector(along, side.length);
    offset.fromArray(side.head).sub(wristBind.fromArray(arm.bind.wrist)).applyQuaternion(turn);
    wrist.copy(point).sub(offset);
  }
  return roll;
}

/**
 * Gives the roll of a mallet across the forearm in its paw for a target (design 5.3): the roll
 * that has no side bend at the strike ({@link gripRoll}) on the arm of the body that only leans
 * over the instrument (`PercussionRig.steadyChest`). The sway, the breath, and the damp of the
 * body thus do not turn the paw around the shaft, as a real player keeps one grip. The roll of
 * the posed arm changed by up to 20° in one frame, because the forearm of the elephant stands
 * where the two turns of {@link gripRoll} meet. The function writes the module vectors of
 * {@link acrossHand}.
 *
 * @param rig The points of the player.
 * @param side The hand with a mallet across the forearm and a bend rule.
 * @param target The target of the mallet head. The function does not change it.
 * @param pole The direction to which the elbow points, in the axes of the chest.
 * @returns The roll, in radians.
 */
function steadyRoll(
  rig: PercussionRig,
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  target: Vector3,
  pole: Vec3,
): number {
  steadyChest.position.fromArray(rig.steadyChest.position);
  steadyChest.rotation.fromArray(rig.steadyChest.rotation);
  poseShoulder(side.arm, steadyChest, rig.chestBind, NO_TURN, steadyShoulder);
  steadyPole.fromArray(pole).applyQuaternion(steadyChest.rotation);
  return acrossHand(
    side,
    steadyHead.copy(target),
    0,
    steadyShoulder.position,
    steadyPole,
    NO_SHIFT,
    null,
  );
}

/**
 * Moves the wrist and the hand of the rest pose to the set position of the sticks
 * (`PercussionHold.set`, design 5.2). The wrist goes up from its place on the hanging arm by the
 * raise, the elbow points as on the hanging arm, and the paw turns on the forearm with no bend
 * until its stick points in across the body, level, and then up by the rise of its side. The
 * slant of the stick toward the wrist (`PercussionSide.tilt`) also points it forward.
 *
 * @param side The hand with a mallet.
 * @param set The set position.
 * @param h The head height `H` of the body, in meters: the unit of `set.raise`.
 * @param pole The direction to which the elbow of the hanging arm points, in the axes of the
 *   chest.
 * @param joint The posed shoulder joint of the side.
 * @param chest The posed frame of the chest.
 * @param wristOut The wrist of the hanging arm. Gets the wrist of the set position.
 * @param handOut Gets the world rotation of the hand.
 */
function setHand(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  set: MalletSet,
  h: number,
  pole: Vec3,
  joint: Vector3,
  chest: Frame,
  wristOut: Vector3,
  handOut: Quaternion,
): void {
  const { arm } = side;
  wristOut.y += set.raise * h;
  shoulderBind.fromArray(arm.bind.shoulder);
  elbowBind.fromArray(arm.bind.elbow);
  const upper = elbowBind.distanceTo(shoulderBind);
  const lower = wristBind.fromArray(arm.bind.wrist).distanceTo(elbowBind);
  turnedPole.fromArray(pole).applyQuaternion(chest.rotation);
  solveTwoBone(joint, wristOut, upper, lower, turnedPole, joints);
  forearm.subVectors(joints.wrist, joints.elbow).normalize();
  acrossAxes(forearm, upperArm.subVectors(joints.elbow, joint), arm.side, acrossUp, acrossOut);
  // The level direction in across the body, as an angle around the forearm from no twist.
  inward.set(arm.side === 'L' ? 1 : -1, 0, 0).applyQuaternion(chest.rotation);
  const across = Math.atan2(inward.dot(acrossOut), inward.dot(acrossUp));
  const rise = set.rise[arm.side === 'L' ? 0 : 1];
  // A turn toward the direction of no twist lifts the tip.
  crossTurn(side, forearm, across - Math.sign(across) * rise, handOut, along);
}

/**
 * Writes the world rotation of a hand whose mallet points along a direction, with the top of the
 * mallet up or toward the shoulder joint (`PercussionHold.top`).
 *
 * @param side The hand with a mallet.
 * @param direction The unit direction of the mallet, from the grip to the head.
 * @param at The head of the mallet.
 * @param joint The posed shoulder joint of the side.
 * @param out Gets the world rotation of the hand from the bind pose.
 * @returns `out`.
 */
function topTurn(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  direction: Vector3,
  at: Vector3,
  joint: Vector3,
  out: Quaternion,
): Quaternion {
  if (side.top === 'shoulder') {
    top.subVectors(joint, at).normalize();
  } else {
    top.set(0, 1, 0);
  }
  top.addScaledVector(direction, -top.dot(direction));
  if (top.length() > 1e-6) {
    top.normalize();
  } else {
    top.set(0, 0, 1);
  }
  return setFromBasis(out, direction, top).multiply(inverse.fromArray(side.inverse));
}

/**
 * Writes the wrist and the world rotation of a hand with a mallet (design 5.3). The head is at
 * the height of the strike state above its target, and the mallet points from the home of the
 * hand to the head, so that the mallet turns around the home in the stroke. The top of the mallet
 * points up or toward the shoulder joint (`PercussionHold.top`). With `PercussionHold.strikeRoll`,
 * the paw also turns around the shaft until it has no side bend on the forearm at the strike
 * ({@link gripRoll}), and keeps that roll through the stroke. The forearm of the strike comes
 * from the two-bone solution to the wrist on the steady arm (`PercussionRig.steadyChest`), two
 * times, because the wrist follows the roll. Thus the sway and the turn of the body at a damp do
 * not turn the paw around the shaft: with the posed arm, the right paw of the bass drummer turned
 * 54° in one frame where the two rolls of {@link gripRoll} met. The function writes the module
 * vectors `wrist` and `turn`, and it changes `point`.
 *
 * @param rig The points of the player.
 * @param side The hand with a mallet.
 * @param point The target of the mallet head. The function writes the head into it.
 * @param hand The strike state of the hand.
 * @param joint The posed shoulder joint of the side.
 * @param pole The direction to which the elbow points, in the axes of the chest.
 */
function malletHand(
  rig: PercussionRig,
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  point: Vector3,
  hand: StrikeState,
  joint: Vector3,
  pole: Vec3,
): void {
  const { arm } = side;
  wristBind.fromArray(arm.bind.wrist);
  rollTurn.identity();
  if (side.strikeRoll) {
    steadyChest.position.fromArray(rig.steadyChest.position);
    steadyChest.rotation.fromArray(rig.steadyChest.rotation);
    poseShoulder(arm, steadyChest, rig.chestBind, NO_TURN, steadyShoulder);
    steadyPole.fromArray(pole).applyQuaternion(steadyChest.rotation);
    strikeDirection.copy(point).sub(offset.fromArray(side.home)).normalize();
    topTurn(side, strikeDirection, point, joint, strikeTurn);
    shoulderBind.fromArray(arm.bind.shoulder);
    elbowBind.fromArray(arm.bind.elbow);
    const upper = elbowBind.distanceTo(shoulderBind);
    const lower = wristBind.distanceTo(elbowBind);
    for (let pass = 0; pass < 2; pass++) {
      strikeHand.copy(strikeTurn).multiply(rollTurn);
      offset.fromArray(side.head).sub(wristBind).applyQuaternion(strikeHand);
      wrist.copy(point).sub(offset);
      solveTwoBone(steadyShoulder.position, wrist, upper, lower, steadyPole, joints);
      forearm.subVectors(joints.wrist, joints.elbow).normalize();
      gripRoll(side, strikeDirection, forearm, rollTurn.copy(strikeTurn));
    }
  }
  point.addScaledVector(offset.fromArray(hand.normal), hand.height);
  along.copy(point).sub(offset.fromArray(side.home)).normalize();
  topTurn(side, along, point, joint, turn).multiply(rollTurn);
  offset.fromArray(side.head).sub(wristBind).applyQuaternion(turn);
  wrist.copy(point).sub(offset);
}

/**
 * Writes the wrist and the world rotation of a hand with a cymbal (design 5.3,
 * {@link CRASH_MOTION}). The rims of the two plates meet at the crash point at the note start, and
 * part along the crash normal by the height of the strike state. The plates slide along their
 * faces by the slide of the strike state: the right plate down past the left plate, and the left
 * plate up by a share. After a crash, each plate turns out to the front and up, parts further,
 * and rises, by the follow weight and the loudness. At a damp, the crash point
 * goes to the chest, and the plates close. The function writes the module vectors `wrist` and
 * `turn`.
 *
 * @param rig The points of the player.
 * @param side The hand with a cymbal.
 * @param hand The strike state of the pair.
 * @param damp The damp of the pair.
 * @param ring The follow move of the pair.
 */
function plateHand(
  rig: PercussionRig,
  side: Extract<PercussionSide, { kind: 'plate' }>,
  hand: StrikeState,
  damp: DampState,
  ring: DampState,
): void {
  const c = CRASH_MOTION;
  const h = rig.headHeight;
  const closed = rig.dampPlace ? damp.weight : 0;
  const follow = ring.weight * (c.ringSoft + (1 - c.ringSoft) * Math.max(ring.key, 0));
  const normal = offset.fromArray(hand.normal);
  head.fromArray(hand.point);
  if (rig.dampPlace) {
    head.lerp(along.fromArray(rig.dampPlace), closed);
  }
  // The slide runs down along the faces: the down direction with no part along the normal.
  along.set(0, -1, 0).addScaledVector(normal, normal.y).normalize();
  const slide = c.slide * h * hand.slide * (1 - closed) * (side.sign > 0 ? 1 : -c.leftShare);
  const turnOut = c.ringTurn * follow;
  head
    .addScaledVector(normal, side.sign * (hand.height * (1 - closed) + c.ringOpen * h * follow))
    .addScaledVector(along, slide);
  // Each plate turns around its middle and moves out by the swing of its back rim, so that the
  // back rims do not meet and the plates do not come back to the body.
  head.addScaledVector(normal, side.sign * side.radius * Math.sin(turnOut));
  head.y += c.ringLift * h * follow;
  // The right plate leads with its top rim at the angle of the flam, and moves out by the swing
  // of that rim, so that the top rims meet first.
  const flam = side.sign > 0 ? c.flam * (1 - closed) : 0;
  head.addScaledVector(normal, side.radius * Math.sin(flam));
  // The turn out around the vertical, after the turn up around the forward axis, after the flam
  // and the tilt.
  swing.setFromAxisAngle(Y_AXIS, -side.sign * turnOut);
  turn
    .setFromAxisAngle(Z_AXIS, -side.sign * c.ringUp * follow + flam)
    .premultiply(swing)
    .multiply(strikeTurn.fromArray(side.turn));
  offset.fromArray(side.face).sub(wristBind.fromArray(side.arm.bind.wrist)).applyQuaternion(turn);
  wrist.subVectors(head, offset);
}

/**
 * Gives the height of the lowest corner of a posed paw.
 *
 * @param paw The corners of the paw in the bind pose, from the bind wrist.
 * @param at The posed wrist.
 * @param hand The world rotation of the hand from the bind pose.
 * @returns The height, in meters.
 */
function lowestPoint(paw: Float32Array, at: Vector3, hand: Quaternion): number {
  let low = Infinity;
  for (let i = 0; i + 2 < paw.length; i += 3) {
    corner.set(paw[i] ?? 0, paw[i + 1] ?? 0, paw[i + 2] ?? 0).applyQuaternion(hand);
    low = Math.min(low, corner.y);
  }
  return Number.isFinite(low) ? at.y + low : at.y;
}

/**
 * Writes one arm and its fingers. An arm with no instrument hangs, also while the player plays.
 *
 * @param rig The points of the player.
 * @param which The hand: `L` for the left hand and `R` for the right hand.
 * @param state The motion of the hands at the song time of the note layer.
 * @param chest The posed frame of the chest.
 * @param weight The eased weight of the playing pose.
 * @param rotations The rotations of the pose to write.
 * @returns The turn of the paw in the plane of its palm (`pawTurnL`, `pawTurnR` of `AnimalPose`):
 *   0 for a paw that a hold with `keepPaw` keeps on the hand of the player, the mixed turn of the
 *   left paw or of a kept paw at a switch, or `null` for the turn of the studio body.
 */
function poseHand(
  rig: PercussionRig,
  which: 'L' | 'R',
  state: PercussionState,
  chest: Frame,
  weight: number,
  rotations: Float32Array,
): number | null {
  const left = which === 'L';
  const side = left ? rig.left : rig.right;
  const hang = left ? rig.hangL : rig.hangR;
  const hand = left ? state.left : state.right;
  // With no beater in the right paw, the fingers strike the held tambourine.
  const fingers = !left && rig.switch !== null && state.swap.held[2] === 0;
  // The direction to which the elbow points while the player plays. The right elbow points
  // further out at the held tambourine, so that the forearm stays out of the belly.
  const pole = left ? rig.hold.poleL : fingers ? TAMBOURINE_HOLD.poleR : rig.hold.poleR;
  const { arm } = side;
  poseShoulder(arm, chest, rig.chestBind, NO_TURN, shoulder);
  hangingWrist(hang, shoulder, hanging);
  hangingHand(hang, shoulder, restHand);
  // A hold with a set position holds the sticks across the body at rest.
  if (side.kind === 'mallet' && rig.hold.set) {
    setHand(
      side,
      rig.hold.set,
      rig.headHeight,
      hang.pole,
      shoulder.position,
      chest,
      hanging,
      restHand,
    );
  }
  // A paw goes to its place at a damp of its hand (`PalmDamp`, `EdgeDamp`) while the player
  // plays. The free paw else rests on the instrument while the player plays, or hangs.
  const index = left ? 0 : 1;
  const damped = rig.dampHands[index];
  // The muffle of the timpani does not follow the lift and the lowering: the paws of the ready
  // hold stay at the kettles, and a muffle that grew with the lift turned a paw 540° each second.
  const steady = rig.hold.damp?.kind === 'fingers' ? 1 : weight;
  const muffle = damped && state.damp.key === index ? state.damp.weight * steady : 0;
  // The free paw on the instrument goes there in the lift, also in a ready hold, and hangs at rest.
  let play = rig.hold.ready ? 1 : weight;
  if (side.kind === 'free') {
    play = side.steady ? weight : muffle;
  }

  head.fromArray(hand.point);
  turnedPole.fromArray(pole).applyQuaternion(chest.rotation);
  if (side.kind === 'mallet' && side.across && !fingers) {
    const rest = rig.hold.sizes.rest;
    let share = MathUtils.clamp(rest > 0 ? hand.height / rest : 0, 0, side.across.peak);
    // A ready hold lowers the heads toward their targets in the rest pose (`restPitch`).
    if (rig.hold.ready) {
      share *= rig.hold.restPitch + (1 - rig.hold.restPitch) * weight;
    }
    // At a damp, the grip goes to its place, and the wrist lifts the head of the mallet.
    homeShift.set(0, 0, 0);
    // The paw keeps the roll of the mallet of its target on the steady arm, also at a muffle of
    // the timpani. The roll of the posed forearm turned a paw 22° in 1/30 s on the way to the
    // muffle, and up to 20° in one frame of a stroke.
    let held = side.strikeRoll ? steadyRoll(rig, side, head, pole) : null;
    if (damped?.kind === 'grip' && muffle > 0) {
      grip.fromArray(damped.grip);
      if (damped.keep) {
        // The paw moves to the grip and keeps the direction of the mallet at its target.
        along.copy(head).sub(offset.fromArray(side.home)).normalize();
        homeShift.copy(grip).addScaledVector(along, side.length).sub(head).multiplyScalar(muffle);
        head.add(homeShift);
      } else {
        along.copy(grip).sub(offset.fromArray(side.home)).normalize();
        dampHead.copy(grip).addScaledVector(along, side.length);
        // The roll goes to the roll of the place of the damp, the shorter way around the shaft.
        if (held !== null) {
          const change = steadyRoll(rig, side, dampHead, pole) - held;
          held += Math.atan2(Math.sin(change), Math.cos(change)) * muffle;
        }
        head.lerp(dampHead, muffle);
      }
      share += (damped.share - share) * muffle;
    }
    acrossHand(side, head, share, shoulder.position, turnedPole, homeShift, held);
    // At a muffle of the timpani, the lowest point of the paw goes to the head. On the way, a paw
    // under the head goes up to it at once, so that it does not go into the kettle.
    if (damped?.kind === 'grip' && damped.touch !== null && muffle > 0) {
      const rise = damped.touch - lowestPoint(damped.paw, wrist, turn);
      wrist.y += rise > 0 ? rise : rise * muffle;
      // On the way to the muffle and back, the paw passes over the hoop (`FingersDamp.arc`).
      wrist.y += damped.arc * Math.sin(Math.PI * muffle);
    }
  } else if (side.kind === 'mallet' && fingers) {
    fingerHand(rig, hand, state.small);
  } else if (side.kind === 'mallet') {
    malletHand(rig, side, head, hand, shoulder.position, pole);
  } else if (side.kind === 'plate') {
    plateHand(rig, side, hand, state.damp, state.ring);
  } else if (side.kind === 'hold' && rig.switch && state.swap.held[0] === 1) {
    // The left paw holds the tambourine, and turns the forearm to and fro in a shake roll.
    wrist.fromArray(rig.switch.tambourine.wrist);
    turn.fromArray(rig.switch.tambourine.hand);
    if (state.small.roll === 1) {
      const t = TAMBOURINE_HOLD;
      along.copy(wrist).sub(shoulder.position).normalize();
      swing.setFromAxisAngle(
        along,
        t.shake * Math.sin(2 * Math.PI * t.shakeRate * state.small.rollSec),
      );
      turn.premultiply(swing);
    }
  } else if (side.kind === 'hold') {
    wrist.fromArray(side.wrist);
    turn.fromArray(side.hand);
  } else if (side.kind === 'free' && side.steady) {
    // The free paw goes from its rest on the hoop to the far head at a damp.
    wrist.fromArray(side.steady.wrist);
    turn.fromArray(side.steady.hand);
    if (damped?.kind === 'palm' && muffle > 0) {
      wrist.lerp(offset.fromArray(damped.wrist), muffle);
      turn.slerp(swing.fromArray(damped.hand), muffle);
    }
  } else if (damped?.kind === 'palm') {
    wrist.fromArray(damped.wrist);
    turn.fromArray(damped.hand);
  } else {
    wrist.copy(hanging);
    turn.copy(restHand);
  }
  // The triangle in the paw turns back around the pinch of the clip, so that it keeps its hang
  // while the paw stays in line with its forearm. At the trap table, the turn fades out, because
  // the places of the table hold the triangle as the bind pose does.
  if (side.kind === 'hold' && state.swap.held[0] === 0) {
    pieceTurn.slerpQuaternions(NO_TURN, piece.fromArray(side.piece), 1 - state.swap.table);
    setBoneRotation(rotations, MALLET_L, pieceTurn);
  }
  // A hold with keepPaw keeps each paw that holds a piece on the hand of the player, so that the
  // piece stays where the bind pose holds it in the closed paw.
  const keep = rig.hold.keepPaw && side.kind !== 'free' && side.kind !== 'plate';
  // At a switch, the paws go to the trap table: the left paw from the place of the instrument that
  // it puts down to the place of the instrument that it takes, and the right paw to the beater.
  const swap = state.swap;
  let pawTurn: number | null = keep ? 0 : null;
  if (rig.switch && swap.table > 0) {
    const s = rig.switch;
    // The elbow points as on the hanging arm at the table (`writeArm()` below).
    const poleAt = (share: number, out: Vector3): Vector3 =>
      out.fromArray(mixPole(hang.pole, pole, 1 - share)).applyQuaternion(chest.rotation);
    poleAt(0, playPole);
    poleAt(1, tablePole);
    poleAt(swap.table, nowPole);
    // The left paw goes from the piece that it puts down to the piece that it takes. The right
    // wrist goes on an arc in front of the belly (`TAMBOURINE_HOLD.beaterArc`).
    const [from, to] = !left
      ? [s.tableBeater, s.tableBeater]
      : swap.toTambourine
        ? [s.tableTriangle, s.tableTambourine]
        : [s.tableTambourine, s.tableTriangle];
    const palm = tablePaw(
      s.pawBinds[which],
      arm,
      shoulder.position,
      from,
      to,
      swap.across,
      swap.table,
      left ? 0 : TAMBOURINE_HOLD.beaterArc * rig.headHeight,
      keep,
    );
    pawTurn = left || keep ? palm : null;
  }
  limitReach(arm, shoulder.position, wrist);

  writeArm(
    {
      arm,
      shoulder,
      wrist: wrist.lerpVectors(hanging, wrist, play),
      hand: mixRotation(restHand, turn, play, turn),
      // The elbow of the hanging arm points back and out, also at the trap table.
      pole: mixPole(hang.pole, pole, rig.switch ? play * (1 - state.swap.table) : play),
    },
    chest.rotation,
    rotations,
  );
  // A paw with a mallet holds it also at rest and in the lift. The free paw keeps its fingers
  // open, also with the palm on a drum head.
  const curl =
    side.kind === 'free' ? 0 : fingers ? fingerCurl(state.small) : rig.hold.curl[left ? 0 : 1];
  writeCurl(arm, side.kind === 'mallet' ? curl : curl * play, rotations);
  return pawTurn;
}

/** The turn of a studio paw at one place of a switch (design 5.3). */
interface PawKey {
  /** The turn of the studio paw on its forearm from its bind (`studioForearmTurn()`). */
  readonly paw: Quaternion;
  /** The turn of the paw in the plane of its palm, in radians (`palmTurnAngle()`). */
  palm: number;
}

const keyPlay: PawKey = { paw: new Quaternion(), palm: 0 };
const keyFrom: PawKey = { paw: new Quaternion(), palm: 0 };
const keyTo: PawKey = { paw: new Quaternion(), palm: 0 };
const keyTable: PawKey = { paw: new Quaternion(), palm: 0 };
const keyNow: PawKey = { paw: new Quaternion(), palm: 0 };
const keyTurn = new Quaternion();
const swingA = new Quaternion();
const swingB = new Quaternion();
const twistAxis = new Vector3();

/**
 * Writes the wrist and the hand of a paw at a switch (design 5.3) into the module values `wrist`
 * and `turn`, which hold the play place. The paw goes from the play place to the place of the
 * piece that it puts down, then to the place of the piece that it takes, and back to the play
 * place. The turn of the paw mixes in the frame of the studio forearm ({@link mixPawKeys}), as the
 * arm gate measures it, so that the twist of the paw changes on a straight line between its places
 * and the twist bones do not turn over. The turn in the plane of the palm mixes too. The left
 * studio paw takes it from the pose (`pawTurnL` of `AnimalPose`), so it takes exactly the mixed
 * turn. The elbow points to the module values `playPole` at the play place, `tablePole` at the
 * table, and `nowPole` at this time.
 *
 * @param bind The bind of the studio paw of the arm.
 * @param arm The arm.
 * @param joint The posed shoulder joint.
 * @param from The place of the piece that the paw puts down.
 * @param to The place of the piece that the paw takes.
 * @param across The share of the move from `from` to `to` (`SwitchState.across`).
 * @param table The weight of the table (`SwitchState.table`).
 * @param arc The move of the wrist forward in the middle of the move to the table, in meters.
 * @param keep True: the paw at the play place keeps the turn of the hand of the player
 *   (`PercussionHold.keepPaw`).
 * @returns The turn of the paw in the plane of its palm, in radians.
 */
function tablePaw(
  bind: PawBind,
  arm: ArmRig,
  joint: Vector3,
  from: PawPlace,
  to: PawPlace,
  across: number,
  table: number,
  arc: number,
  keep: boolean,
): number {
  twistAxis.fromArray(bind.fore).normalize();
  pawKey(bind, arm, joint, wrist, playPole, turn, keyPlay, keep);
  grip.fromArray(from.wrist);
  pawKey(bind, arm, joint, grip, tablePole, strikeHand.fromArray(from.hand), keyFrom);
  grip.fromArray(to.wrist);
  pawKey(bind, arm, joint, grip, tablePole, strikeHand.fromArray(to.hand), keyTo);
  mixPawKeys(keyFrom, keyTo, across, keyTable);
  mixPawKeys(keyPlay, keyTable, table, keyNow);
  grip.fromArray(from.wrist).lerp(offset.fromArray(to.wrist), across);
  wrist.lerp(grip, table);
  wrist.z -= arc * Math.sin(Math.PI * table);
  limitReach(arm, joint, wrist);
  armJoints(arm, joint, wrist, nowPole);
  // The hand of the player that gives the mixed studio paw: the studio paw is the hand times the
  // turn in the plane of the palm times the bind of the paw (`poseStudioBones()`).
  studioForearmTurn(bind, joint, joints.elbow, joints.wrist, turn)
    .multiply(keyNow.paw)
    .multiply(keyTurn.fromArray(bind.paw).invert())
    .multiply(keyTurn.setFromAxisAngle(X_AXIS, -keyNow.palm));
  return keyNow.palm;
}

/**
 * Solves the joints of an arm into the module value `joints`.
 *
 * @param arm The arm.
 * @param joint The posed shoulder joint.
 * @param at The wrist.
 * @param pole The direction to which the elbow points, in the model axes.
 */
function armJoints(arm: ArmRig, joint: Vector3, at: Vector3, pole: Vector3): void {
  shoulderBind.fromArray(arm.bind.shoulder);
  elbowBind.fromArray(arm.bind.elbow);
  const upper = elbowBind.distanceTo(shoulderBind);
  const lower = wristBind.fromArray(arm.bind.wrist).distanceTo(elbowBind);
  solveTwoBone(joint, corner.copy(at), upper, lower, pole, joints);
}

/**
 * Finds the turn of a studio paw on its forearm for a wrist and a hand of the player.
 *
 * @param bind The bind of the studio paw of the arm.
 * @param arm The arm.
 * @param joint The posed shoulder joint.
 * @param at The wrist. A wrist out of reach comes in ({@link limitReach}).
 * @param pole The direction to which the elbow points, in the model axes.
 * @param hand The world rotation of the hand of the player.
 * @param out The key to write.
 * @param keep True: the studio paw keeps the turn of the hand, with no turn in the plane of its
 *   palm (`PercussionHold.keepPaw`).
 */
function pawKey(
  bind: PawBind,
  arm: ArmRig,
  joint: Vector3,
  at: Vector3,
  pole: Vector3,
  hand: Quaternion,
  out: PawKey,
  keep = false,
): void {
  armJoints(arm, joint, limitReach(arm, joint, along.copy(at)), pole);
  forearm.subVectors(joints.wrist, joints.elbow).normalize();
  out.palm = keep ? 0 : palmTurnAngle(arm.side, hand, forearm);
  studioForearmTurn(bind, joint, joints.elbow, joints.wrist, out.paw)
    .invert()
    .multiply(hand)
    .multiply(keyTurn.setFromAxisAngle(X_AXIS, out.palm))
    .multiply(keyTurn.fromArray(bind.paw));
}

/**
 * Mixes two turns of the studio paw: the twist around the bind forearm goes on a straight line
 * from its first angle to its second angle, between -π and π, and the bend of the wrist mixes on
 * its own. The twist of the mix around the bind forearm is then exactly the mixed angle, because a
 * mix of two bends has no twist.
 *
 * @param a The turn at the share 0.
 * @param b The turn at the share 1.
 * @param share The share of `b`, from 0 to 1.
 * @param out The key to write. It must not be `a` or `b`.
 */
function mixPawKeys(a: PawKey, b: PawKey, share: number, out: PawKey): void {
  const twistA = twistAngle(a.paw, twistAxis);
  const twistB = twistAngle(b.paw, twistAxis);
  swingA.copy(a.paw).multiply(keyTurn.setFromAxisAngle(twistAxis, -twistA));
  swingB.copy(b.paw).multiply(keyTurn.setFromAxisAngle(twistAxis, -twistB));
  out.paw
    .slerpQuaternions(swingA, swingB, share)
    .multiply(keyTurn.setFromAxisAngle(twistAxis, twistA + (twistB - twistA) * share));
  out.palm = a.palm + (b.palm - a.palm) * share;
}

/**
 * Gives the curl of the right fingers on the held tambourine by the loudness
 * (`TAMBOURINE_HOLD.curls`): open fingertips for a soft note, bunched fingers for a middle note,
 * and a loose fist for a loud note.
 *
 * @param small The state of the small percussion player.
 * @returns The curl, in radians.
 */
function fingerCurl(small: SmallState): number {
  const t = TAMBOURINE_HOLD;
  if (small.roll === 0 || small.loudness < t.soft) {
    return t.curls[0];
  }
  return small.loudness < t.loud ? t.curls[1] : t.curls[2];
}

/**
 * Writes the wrist and the world rotation of the right paw that strikes the held tambourine
 * (design 5.3). The palm faces the head, and the fingers point away from the right shoulder. The tip
 * of the middle claw goes to the height of the strike state over its spot. In a thumb roll, the tip
 * moves along the rim on the side of the right paw, on the head. In a shake roll, it rests over the
 * spot of a soft note. The function writes the module vectors `wrist` and `turn`.
 *
 * @param rig The points of the player, with the held tambourine.
 * @param hand The strike state of the right paw.
 * @param small The state of the small percussion player.
 */
function fingerHand(rig: PercussionRig, hand: StrikeState, small: SmallState): void {
  const s = rig.switch;
  if (!s) {
    return;
  }
  const t = TAMBOURINE_HOLD;
  turn.fromArray(s.fingerHand);
  level.fromArray(s.head.normal);
  let height = hand.height;
  if (small.roll === 0) {
    swing.setFromAxisAngle(level, t.thumbAt + (small.rollShare - 0.5) * t.thumbArc);
    head
      .fromArray(s.toRight)
      .applyQuaternion(swing)
      .multiplyScalar(t.thumbRadius)
      .add(top.fromArray(s.head.point));
    height = 0;
  } else if (small.roll === 1 || !small.onHead) {
    // In a shake roll and before the first strike on the head, the paw rests over the spot of a
    // soft note.
    head.fromArray(s.toRight).multiplyScalar(t.rimSpot).add(top.fromArray(s.head.point));
    height = rig.hold.sizes.rest;
  } else {
    // The first strike on the head comes from its own spot, not from the target of the beater
    // before it.
    head.fromArray(small.fromHead ? hand.point : small.point);
  }
  head.addScaledVector(level, height);
  wrist.copy(head).sub(offset.fromArray(s.tip).applyQuaternion(turn));
}

/**
 * Writes the arms and the fingers of a percussion player (design 5.3, 4.7). Each mallet head goes
 * to the place of its strike state, and the two-bone IK places each arm. The rims of the hand
 * cymbals meet at the crash point at the note start ({@link plateHand}). In the rest pose, the
 * arms hang a little out to the sides, clear of the body (design 5.2).
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the root and of the chest.
 * @param state The motion of the hands at the song time of the note layer.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2, 5.5).
 * @param rotations The rotations of the pose to write.
 * @param turns Gets the turn of each paw in the plane of its palm (`pawTurnL`, `pawTurnR` of
 *   `AnimalPose`), or `null` for the turn of the studio body.
 */
export function posePercussion(
  rig: PercussionRig,
  frames: TorsoFrames,
  state: PercussionState,
  weight: number,
  rotations: Float32Array,
  turns: PawTurns,
): void {
  turns.pawTurnL = poseHand(rig, 'L', state, frames.chest, weight, rotations);
  turns.pawTurnR = poseHand(rig, 'R', state, frames.chest, weight, rotations);
}

/** The turns of the paws in the planes of their palms that a percussion pose writes. */
export interface PawTurns {
  /** The turn of the left paw, or `null` for the turn of the studio body. */
  pawTurnL: number | null;
  /** The turn of the right paw, or `null` for the turn of the studio body. */
  pawTurnR: number | null;
}
