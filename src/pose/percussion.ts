import { MathUtils, Quaternion, Vector3 } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { PlayerNote } from '../score/types.ts';
import { NO_TURN, Y_AXIS, Z_AXIS } from './axes.ts';
import { lastAtOrBefore, mixPole, mixRotation } from './blend.ts';
import { createFrame, setFromBasis } from './frames.ts';
import type { Frame, TorsoFrames } from './frames.ts';
import { hangingHand, hangingWrist } from './hang.ts';
import { limitReach, poseShoulder, solveTwoBone, writeArm, writeCurl } from './ik.ts';
import { groupChords } from './note-groups.ts';
import type { NoteGroup } from './note-groups.ts';
import {
  CRASH_MOTION,
  TRIANGLE_ROLL,
  acrossAxes,
  frontKettles,
  offsetTarget,
  targetKeyOf,
  xylophoneShift,
} from './percussion-rig.ts';
import type { DampRule, MalletSet, PercussionRig, PercussionSide } from './percussion-rig.ts';
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
}

/**
 * The timing of the set position in a long rest of the music (design 5.3), in beats. A drumline
 * goes back to the set position one beat after the end of a passage, and to the playing position
 * two beats before an entrance (`docs/reference/percussion-technique.md` 6).
 */
const SET_MOTION = {
  /** A rest between two strikes of at least this length takes the set position. */
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
 * the last strike, they go down and stay.
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
    const end = starts[i - 1] ?? 0;
    const start = starts[i] ?? 0;
    if (start - end >= m.restBeats * beat(end)) {
      rests.push(...lower(after[i - 1] ?? end), ...lift(start));
    }
  }
  rests.push(...lower(after[starts.length - 1] ?? last), Infinity, Infinity);
  return Float64Array.from(rests);
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
  const chords = chordStrikes(rig, notes, noteGroups);
  // A fast roll keeps the strikes of a rate that reads as a roll: two hands in turn, or one hand.
  const kept = thinRolls(
    chords,
    hold.hands === 'alternate' ? STRIKE_MOTION.rollSec : STRIKE_MOTION.handRollSec,
  );
  const groups = instrument === 'small-percussion' ? triangleRolls(rig, chords, kept) : kept;
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
  const damp = hold.damp && right ? dampTrackOf(hold.damp, noteGroups, right) : null;
  const ring =
    hold.hands === 'pair' && right
      ? ringTrack(
          right,
          groups.flatMap((g) => (g.targets.length > 0 ? [g.loudness] : [])),
          damp,
        )
      : null;
  // A hold with a set position and no ready pose puts the sticks there in a long rest, and the
  // hand cymbals go down after the move after the last crash.
  const rests =
    (hold.set || hold.hands === 'pair') && !hold.ready
      ? setRests(
          groups.map((g) => g.start),
          beats,
          hold.hands === 'pair' ? afterEnds(groups, [damp, ring]) : [],
        )
      : null;
  return { left, right, side, rests, damp, ring };
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
 * hand (design 5.3). An alternate hold or a hold of two sides shares the strikes between the two
 * hands ({@link alternateHands}). The pair of hand cymbals strikes each note with both hands, and
 * a louder crash meets higher. Another hold strikes with the right hand alone.
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
  const track = (strikes: readonly Strike[], offset: Vec3, rest: StrikeTarget): StrikeTrack =>
    buildStrikeTrack(
      strikes.map((s) => ({ ...s, point: offsetTarget(s, offset).point })),
      strikes[0] && !waits ? offsetTarget(strikes[0], offset) : rest,
      hold.sizes,
      amplitude,
      beats,
    );
  if (hold.hands === 'alternate' || hold.hands === 'sides') {
    const [strikesL, strikesR] = alternateHands(groups, {
      alternateSec: hold.hands === 'sides' ? 0 : STRIKE_MOTION.alternateSec,
      gap: hold.gap,
      pass: hold.pass,
      places: waits ? [rig.restL.point[0], rig.restR.point[0]] : [-Infinity, Infinity],
      reach: hold.reach,
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
 * Finds the damps of the hand cymbals against the chest (`PercussionHold.damp`, design 5.3). A
 * note is damped at its end when the silence to the next note of the player is at least
 * `restSec`. The move starts at the crash of the note and ends before the next lift.
 *
 * @param rule The rule of the damp.
 * @param groups The note groups of the player, sorted by start.
 * @param crashes The crashes of the hand cymbals.
 * @returns The damps of both hands.
 */
function dampTrackOf(
  rule: DampRule,
  groups: readonly NoteGroup[],
  crashes: StrikeTrack,
): DampTrack {
  const m = DAMP_MOTION;
  const wishes: DampWish[] = [];
  for (const [k, g] of groups.entries()) {
    const next = groups[k + 1];
    // The crash of the note: the last crash at or before its start.
    const i = lastAtOrBefore(crashes.starts, g.start + 1e-6);
    if ((next && next.start - g.end < rule.restSec) || i < 0) {
      continue;
    }
    wishes.push({
      contact: g.end,
      earliest: crashes.starts[i] ?? g.start,
      latest: crashes.upStarts[i + 1] ?? Infinity,
      hold: rule.hold,
      key: 0,
      inSec: m.inSec,
      outSec: m.outSec,
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
const level = new Vector3();
const swing = new Quaternion();
const inverse = new Quaternion();
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
 * for each moment of the stroke turns the paws up to 79° in 0.01 s.
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
  // The axis of the mallet in the axes of the hand.
  shaftInHand.set(1, 0, 0).applyQuaternion(inverse.fromArray(side.inverse).invert());
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
 * Writes the wrist and the world rotation of a hand with a mallet across the forearm between
 * strikes (`PercussionHold.across`, design 5.3). At a strike, the mallet points from the home of
 * the hand to the target, and the grip stays at that place. The paw at rest holds the mallet
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
 */
function acrossHand(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  point: Vector3,
  share: number,
  joint: Vector3,
  pole: Vector3,
): void {
  const { across, arm } = side;
  if (!across) {
    return;
  }
  strikeAlong.copy(point).sub(offset.fromArray(side.home)).normalize();
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
    if (side.strikeRoll) {
      holdTurn(side, forearm, 0, strikeTurn, strikeDirection);
      turn.multiply(gripRoll(side, strikeDirection, forearm, strikeTurn));
    }
    point.copy(grip).addScaledVector(along, side.length);
    offset.fromArray(side.head).sub(wristBind.fromArray(arm.bind.wrist)).applyQuaternion(turn);
    wrist.copy(point).sub(offset);
  }
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
  pole: Vec3,
  joint: Vector3,
  chest: Frame,
  wristOut: Vector3,
  handOut: Quaternion,
): void {
  const { arm } = side;
  wristOut.y += set.raise;
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
 * from the two-bone solution to the wrist, two times, because the wrist follows the roll. The
 * function writes the module vectors `wrist` and `turn`, and it changes `point`.
 *
 * @param side The hand with a mallet.
 * @param point The target of the mallet head. The function writes the head into it.
 * @param hand The strike state of the hand.
 * @param joint The posed shoulder joint of the side.
 * @param pole The direction to which the elbow points, in the model axes.
 */
function malletHand(
  side: Extract<PercussionSide, { kind: 'mallet' }>,
  point: Vector3,
  hand: StrikeState,
  joint: Vector3,
  pole: Vector3,
): void {
  const { arm } = side;
  wristBind.fromArray(arm.bind.wrist);
  rollTurn.identity();
  if (side.strikeRoll) {
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
      solveTwoBone(joint, wrist, upper, lower, pole, joints);
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
  // The turn out around the vertical, after the turn up around the forward axis, after the tilt.
  swing.setFromAxisAngle(Y_AXIS, -side.sign * turnOut);
  turn
    .setFromAxisAngle(Z_AXIS, -side.sign * c.ringUp * follow)
    .premultiply(swing)
    .multiply(strikeTurn.fromArray(side.turn));
  offset.fromArray(side.face).sub(wristBind.fromArray(side.arm.bind.wrist)).applyQuaternion(turn);
  wrist.subVectors(head, offset);
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
 */
function poseHand(
  rig: PercussionRig,
  which: 'L' | 'R',
  state: PercussionState,
  chest: Frame,
  weight: number,
  rotations: Float32Array,
): void {
  const left = which === 'L';
  const side = left ? rig.left : rig.right;
  const hang = left ? rig.hangL : rig.hangR;
  const hand = left ? state.left : state.right;
  // The direction to which the elbow points while the player plays.
  const pole = left ? rig.hold.poleL : rig.hold.poleR;
  const { arm } = side;
  poseShoulder(arm, chest, rig.chestBind, NO_TURN, shoulder);
  hangingWrist(hang, shoulder, hanging);
  hangingHand(hang, shoulder, restHand);
  // A hold with a set position holds the sticks across the body at rest.
  if (side.kind === 'mallet' && rig.hold.set) {
    setHand(side, rig.hold.set, hang.pole, shoulder.position, chest, hanging, restHand);
  }
  const play = side.kind === 'free' ? 0 : rig.hold.ready ? 1 : weight;

  head.fromArray(hand.point);
  turnedPole.fromArray(pole).applyQuaternion(chest.rotation);
  if (side.kind === 'mallet' && side.across) {
    const rest = rig.hold.sizes.rest;
    const share = MathUtils.clamp(rest > 0 ? hand.height / rest : 0, 0, side.across.peak);
    acrossHand(side, head, share, shoulder.position, turnedPole);
  } else if (side.kind === 'mallet') {
    malletHand(side, head, hand, shoulder.position, turnedPole);
  } else if (side.kind === 'plate') {
    plateHand(rig, side, hand, state.damp, state.ring);
  } else if (side.kind === 'hold') {
    wrist.fromArray(side.wrist);
    turn.fromArray(side.hand);
  } else {
    wrist.copy(hanging);
    turn.copy(restHand);
  }
  limitReach(arm, shoulder.position, wrist);

  writeArm(
    {
      arm,
      shoulder,
      wrist: wrist.lerpVectors(hanging, wrist, play),
      hand: mixRotation(restHand, turn, play, turn),
      // The elbow of the hanging arm points back and out.
      pole: mixPole(hang.pole, pole, play),
    },
    chest.rotation,
    rotations,
  );
  // A paw with a mallet holds it also at rest and in the lift.
  writeCurl(arm, side.kind === 'mallet' ? rig.hold.curl : rig.hold.curl * play, rotations);
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
 */
export function posePercussion(
  rig: PercussionRig,
  frames: TorsoFrames,
  state: PercussionState,
  weight: number,
  rotations: Float32Array,
): void {
  poseHand(rig, 'L', state, frames.chest, weight, rotations);
  poseHand(rig, 'R', state, frames.chest, weight, rotations);
}
