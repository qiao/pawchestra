import { MathUtils } from 'three';

import { clamp01, smoothstep } from './rest.ts';
import type { Transport } from './types.ts';

/**
 * The end of a concert for the conductor (design 5.4, `conductor-technique.md` 8). After the
 * cut-off of the last chord, the bear holds the release in the silence, lowers the arms, stands
 * still, turns on the podium to the audience with steps ({@link TURN_STEPS}), bows from the waist,
 * and turns back to the orchestra with steps. The times are wall seconds after the stop at the
 * song end, so the pose stays a function of the transport. The end card shows after the turn back
 * (`END_CARD` of `app/end-card.ts`), because the card stands over the podium.
 *
 * ```text
 * wall s  0    0.4        1.4   1.7          3.4               5.3  5.7         7.4
 *         |hold| arms down |still| turn (left) | bow down,hold,up |face| turn back |
 * ```
 */
export const END_BOW = {
  /** The release pose stays in the silence after the cut-off. */
  silenceSec: 0.4,
  /** The arms come down to the sides in this time. */
  lowerSec: 1,
  /** The bear stands still with the arms down before the turn. */
  stillSec: 0.3,
  /**
   * The turn to the audience, and the turn back, each take this time: the weight shift and the
   * steps of {@link TURN_STEPS}.
   */
  turnSec: 1.7,
  /** The upper body bends forward in this time. */
  downSec: 0.7,
  /** The bow holds at its lowest point for this time. */
  holdSec: 0.4,
  /** The upper body comes up in this time. */
  upSec: 0.8,
  /** The bear faces the audience for this time after the bow, before it turns back. */
  faceSec: 0.4,
  /**
   * The bend of the spine, in radians: a bow from the waist with a straight back. A conductor
   * bows less deeply than a soloist, because the bow accepts the applause for the orchestra.
   */
  angle: 35 * MathUtils.DEG2RAD,
  /** The head bends this part of the bend more, so that the eyes look down. */
  head: 0.5,
  /**
   * The time in which a play during the bow turns the bear back to the orchestra: the steps of
   * {@link TURN_STEPS} from `returnShiftSec` end in it, and the bend and the arms come back in it.
   * It is at most `LIFT_FIT_SEC` of `pose/rest.ts`, because `changeTransport()` cuts the transport
   * before a play after that time, and the end motion then stops.
   */
  returnSec: 1.5,
  /**
   * The share of the turn to the audience below which the arms can lift: the arms lift only when
   * the bear nearly faces the orchestra. A playing arm of a turned body reaches across the body
   * to the beat point, and its paw swings fast.
   */
  armsTurn: 0.3,
} as const;

/**
 * The steps of a turn on the podium (design 5.4, `conductor-technique.md` 8), as a person turns
 * on the spot: the head turns first, the weight moves over one foot, and the feet step in turn.
 * The foot on the side of the turn steps first. Each step turns one foot to at most
 * {@link TURN_STEPS.gap} past the other foot, so a half turn takes three steps and a small step
 * that closes the feet. A foot moves only while it is in the air. The planted foot keeps its
 * place and its turn, and the hips turn over it.
 */
export const TURN_STEPS = {
  /**
   * The first lift of a foot after the start of a full turn, in seconds. The weight moves over
   * the other foot in this time.
   */
  shiftSec: 0.3,
  /** The first lift after a play during the bow, in seconds. */
  returnShiftSec: 0.1,
  /** The time in the air of each step, in seconds. */
  swingSec: 0.3,
  /** The time from the lift of one step to the lift of the next step, in seconds. */
  pitchSec: 0.35,
  /** The largest turn of one foot past the other foot, in radians. */
  gap: 60 * MathUtils.DEG2RAD,
  /** The lift of a foot in a step, in head heights `H` of the body. */
  lift: 0.1,
  /**
   * The move of the hips toward the foot that carries the weight: the share of the way from the
   * middle of the feet to that foot.
   */
  weight: 0.3,
  /** The bend of the knees in the steps: the drop of the hips, in head heights `H`. */
  knees: 0.04,
  /** The share of the time in the air of a step in which the other foot carries the full weight. */
  carryShare: 0.2,
  /** The weight comes back between the feet in this time after the last step, in seconds. */
  settleSec: 0.05,
  /** The hips start to turn this time before the first lift, in seconds. */
  hipsLeadSec: 0.12,
  /** The head turns ahead of the hips by the turn of the hips this time later, in seconds. */
  headLeadSec: 0.12,
  /** The head moves from its turn at the start to its lead in this time, in seconds. */
  headEaseSec: 0.3,
} as const;

/** The motion of the conductor at the song end at one time. */
export interface EndMotion {
  /** The share of the playing pose that the arms keep, from 1 (up) to 0 (down at the sides). */
  arms: number;
  /** The turn of the hips around +y, in radians, positive to the left. */
  turn: number;
  /** The turn of the head ahead of the hips around +y, in radians. */
  headLead: number;
  /** The bend of the spine of the bow, in radians. */
  bend: number;
  /** The turn of the left foot and of the right foot around +y, in radians. */
  footL: number;
  footR: number;
  /** The lift of the left foot and of the right foot in a step, from 0 to 1. */
  stepL: number;
  stepR: number;
  /**
   * The place of the hips between the feet, from -1 (over the right foot) to 1 (over the left
   * foot), as a share of {@link TURN_STEPS.weight}.
   */
  weight: number;
  /** The share of the knee bend of the steps, from 0 to 1. */
  knees: number;
}

/**
 * Makes the motion of no song end: the arms up, no turn, no bend, and no step.
 *
 * @returns The motion.
 */
export function createEndMotion(): EndMotion {
  return {
    arms: 1,
    turn: 0,
    headLead: 0,
    bend: 0,
    footL: 0,
    footR: 0,
    stepL: 0,
    stepR: 0,
    weight: 0,
    knees: 0,
  };
}

/**
 * Tells if a motion turns or moves the legs, so that the legs need the solve of a turn with steps.
 *
 * @param motion The motion.
 * @returns True if a foot or the hips turn, a foot lifts, or the hips move.
 */
export function stepsLegs(motion: EndMotion): boolean {
  return (
    motion.turn !== 0 ||
    motion.footL !== 0 ||
    motion.footR !== 0 ||
    motion.stepL !== 0 ||
    motion.stepR !== 0 ||
    motion.weight !== 0 ||
    motion.knees !== 0
  );
}

/** The start of the turn to the audience, in wall seconds after the stop. */
const TURN_START = END_BOW.silenceSec + END_BOW.lowerSec + END_BOW.stillSec;

/** The start of the bow. */
const BOW_START = TURN_START + END_BOW.turnSec;

/** The start of the turn back to the orchestra. */
const BACK_START = BOW_START + END_BOW.downSec + END_BOW.holdSec + END_BOW.upSec + END_BOW.faceSec;

/** The end of the whole motion: after this time, the bear stands in the rest pose (design 5.2). */
export const END_BOW_SEC = BACK_START + END_BOW.turnSec;

/** The most steps of one turn. A half turn takes 4. */
const MAX_STEPS = 6;

/** A turn smaller than this, in radians, needs no step. */
const NO_TURN = 1e-6;

/**
 * Gives a value that eases from `a` at the time `t0` to `b` at the time `t1`.
 *
 * @param a The value at `t0` and before.
 * @param b The value at `t1` and after.
 * @param t0 The start of the change.
 * @param t1 The end of the change.
 * @param t The time.
 * @returns The value.
 */
function ease(a: number, b: number, t0: number, t1: number, t: number): number {
  return t1 <= t0 ? (t < t1 ? a : b) : a + (b - a) * smoothstep((t - t0) / (t1 - t0));
}

/** The plan of the steps of one turn that {@link planSteps} writes. */
interface StepPlan {
  /** The number of steps. */
  count: number;
  /** The first foot that steps: 0 for the left foot, 1 for the right foot. */
  first: number;
  /** The turn of the foot after each step, in radians. */
  readonly yaws: Float64Array;
}

/** The plan of the turn of the frame. Each call of {@link stepTurnAt} writes it first. */
const plan: StepPlan = { count: 0, first: 0, yaws: new Float64Array(MAX_STEPS) };

/** The turn of the left and the right foot in a plan. Each call of {@link planSteps} writes it. */
const plannedFeet = new Float64Array(2);

/**
 * Plans the steps of a turn from the feet of a motion to a target (design 5.4). A foot that is in
 * the air steps first. Else the foot that is farther from the target steps first, and of two feet
 * at the same turn, the foot on the side of the turn. The feet then step in turn. Each step turns
 * the foot to the target, or to {@link TURN_STEPS.gap} past the other foot.
 *
 * @param from The motion at the start of the turn.
 * @param target The turn of the feet at the end, in radians.
 * @param out The plan to write.
 */
function planSteps(from: EndMotion, target: number, out: StepPlan): void {
  const feet = plannedFeet;
  feet[0] = from.footL;
  feet[1] = from.footR;
  const dir = Math.sign(target - (from.footL + from.footR) / 2) || 1;
  const offL = Math.abs(target - from.footL);
  const offR = Math.abs(target - from.footR);
  if (from.stepL > 0 || from.stepR > 0) {
    out.first = from.stepL >= from.stepR ? 0 : 1;
  } else if (Math.abs(offL - offR) > NO_TURN) {
    out.first = offL > offR ? 0 : 1;
  } else {
    out.first = dir > 0 ? 0 : 1;
  }

  out.count = 0;
  for (let k = 0; k < MAX_STEPS; k++) {
    const moving = (out.first + k) % 2;
    const other = feet[1 - moving] ?? 0;
    const here = feet[moving] ?? 0;
    const lifted = k === 0 && (moving === 0 ? from.stepL : from.stepR) > 0;
    if (!lifted && Math.abs(target - here) < NO_TURN && Math.abs(target - other) < NO_TURN) {
      return;
    }
    const near = Math.abs(target - other) <= TURN_STEPS.gap + NO_TURN;
    const next = near ? target : other + dir * TURN_STEPS.gap;
    feet[moving] = next;
    out.yaws[k] = next;
    out.count = k + 1;
  }
}

/**
 * Calculates the turn of the hips of a turn with steps: a smooth turn from the start turn to the
 * target. It starts {@link TURN_STEPS.hipsLeadSec} before the first lift and ends with the last
 * step.
 *
 * @param start The turn of the hips at the start, in radians.
 * @param target The turn at the end, in radians.
 * @param shiftSec The first lift after the start, in seconds.
 * @param count The number of steps.
 * @param t The seconds after the start.
 * @returns The turn, in radians.
 */
function hipsTurnAt(
  start: number,
  target: number,
  shiftSec: number,
  count: number,
  t: number,
): number {
  const s = TURN_STEPS;
  const begin = Math.max(0, shiftSec - s.hipsLeadSec);
  const end = count > 0 ? shiftSec + (count - 1) * s.pitchSec + s.swingSec : shiftSec;
  return ease(start, target, begin, end, t);
}

/**
 * Calculates a turn with steps on the podium (design 5.4): a pure function of the motion at the
 * start, the target, and the time. The weight moves over the foot that stays in each step
 * ({@link TURN_STEPS.carryShare}), each foot turns and moves on its circle around
 * the root only in the air, the hips turn smoothly, and the head turns ahead of the hips. The
 * knees bend in the steps.
 *
 * ```text
 * t   0      shift    +pitch    +2 pitch  +3 pitch
 *     |weight | L up   | R up    | L up    | R up (close) | settle
 * ```
 *
 * @param from The motion at the start. It must not be `out`.
 * @param target The turn of the feet and of the hips at the end, in radians.
 * @param shiftSec The first lift after the start, in seconds. A foot that is in the air at the
 *   start steps at once.
 * @param t The seconds after the start.
 * @param out The motion to write: the turns, the steps, the weight, and the knees.
 */
function stepTurnAt(
  from: EndMotion,
  target: number,
  shiftSec: number,
  t: number,
  out: EndMotion,
): void {
  const s = TURN_STEPS;
  planSteps(from, target, plan);
  const { count, first, yaws } = plan;
  const lead = from.stepL > 0 || from.stepR > 0 ? 0 : shiftSec;

  out.footL = from.footL;
  out.footR = from.footR;
  out.stepL = 0;
  out.stepR = 0;
  let weight = from.weight;
  let weightAt = 0;
  let weighted = false;
  for (let k = 0; k < count; k++) {
    const moving = (first + k) % 2;
    const start = lead + k * s.pitchSec;
    // The foot that stays carries the full weight in the middle of the step.
    const support = moving === 0 ? -1 : 1;
    const carry = start + s.swingSec * (0.5 - s.carryShare / 2);
    const carried = start + s.swingSec * (0.5 + s.carryShare / 2);
    if (!weighted && t < carried) {
      out.weight = ease(weight, support, weightAt, carry, t);
      weighted = true;
    }
    weight = support;
    weightAt = carried;
    if (t < start) {
      break;
    }

    const share = clamp01((t - start) / s.swingSec);
    const before = moving === 0 ? out.footL : out.footR;
    const yaw = before + ((yaws[k] ?? target) - before) * smoothstep(share);
    // A foot in the air at the start comes down from its lift in its first step.
    const lifted = k === 0 ? (moving === 0 ? from.stepL : from.stepR) : 0;
    const lift = share >= 1 ? 0 : Math.sin(Math.PI * share) * (1 - lifted) + lifted * (1 - share);
    if (moving === 0) {
      out.footL = yaw;
      out.stepL = lift;
    } else {
      out.footR = yaw;
      out.stepR = lift;
    }
  }
  const last = count > 0 ? lead + (count - 1) * s.pitchSec + s.swingSec : lead;
  if (!weighted) {
    out.weight = ease(weight, 0, weightAt, last + s.settleSec, t);
  }

  // The knees bend in the weight shift, and straighten in the last step.
  const bent = count > 0 ? 1 : 0;
  const knees = from.knees + (bent - from.knees) * smoothstep(t / shiftSec);
  out.knees = ease(knees, 0, last - s.swingSec, last + s.settleSec, t);

  const start = from.turn;
  out.turn = hipsTurnAt(start, target, lead, count, t);
  const ahead = hipsTurnAt(start, target, lead, count, t + s.headLeadSec) - out.turn;
  // The head leaves the lead of the motion at the start in its own time, with no jump.
  const eased = smoothstep(t / s.headEaseSec);
  out.headLead = ahead * eased + from.headLead * (1 - eased);
}

/**
 * Gives the largest arms factor for a turn of the body (`END_BOW.armsTurn`).
 *
 * @param share The share of the turn to the audience, from 0 (to the orchestra) to 1.
 * @returns The largest arms factor, from 0 to 1.
 */
function armsLimit(share: number): number {
  return 1 - smoothstep(share / END_BOW.armsTurn);
}

/**
 * Writes the motion of no song end: the arms up, no turn, no bend, and no step.
 *
 * @param out The motion to write.
 * @returns `out`.
 */
function noEndMotion(out: EndMotion): EndMotion {
  out.arms = 1;
  out.turn = 0;
  out.headLead = 0;
  out.bend = 0;
  out.footL = 0;
  out.footR = 0;
  out.stepL = 0;
  out.stepR = 0;
  out.weight = 0;
  out.knees = 0;
  return out;
}

/**
 * Copies a motion.
 *
 * @param from The motion to copy.
 * @param out The motion to write.
 * @returns `out`.
 */
function copyEndMotion(from: EndMotion, out: EndMotion): EndMotion {
  out.arms = from.arms;
  out.turn = from.turn;
  out.headLead = from.headLead;
  out.bend = from.bend;
  out.footL = from.footL;
  out.footR = from.footR;
  out.stepL = from.stepL;
  out.stepR = from.stepR;
  out.weight = from.weight;
  out.knees = from.knees;
  return out;
}

/** The start of a turn of the frame. Each call writes it first. */
const turnFrom = createEndMotion();

/**
 * Gives the share of the turn to the audience of a motion.
 *
 * @param motion The motion.
 * @param audienceTurn The turn to the audience, in radians.
 * @returns The share, from 0 (to the orchestra) to 1.
 */
function turnShare(motion: EndMotion, audienceTurn: number): number {
  return audienceTurn === 0 ? 0 : Math.min(1, Math.abs(motion.turn / audienceTurn));
}

/**
 * Calculates the motion of the conductor at the song end (design 5.4): a pure function of the
 * wall seconds after the stop at the song end. The arms factor comes back to 1 in the turn back.
 * The transport lowers the arms of the conductor before that (`REST_TIMES.hold` and the lowering
 * of `CONDUCTOR_MOTION` end before {@link BACK_START}), so this change does not show, and a play
 * after the bow lifts the arms with the normal lift.
 *
 * @param elapsed The wall seconds after the stop at the song end.
 * @param audienceTurn The turn from the facing of the conductor to the audience, in radians,
 *   positive to the left (`ConductorLayer.audienceTurn`).
 * @param out The motion to write.
 * @returns `out`.
 */
export function endMotionAt(elapsed: number, audienceTurn: number, out: EndMotion): EndMotion {
  const b = END_BOW;
  noEndMotion(turnFrom);
  if (elapsed < BACK_START) {
    stepTurnAt(turnFrom, audienceTurn, TURN_STEPS.shiftSec, elapsed - TURN_START, out);
  } else {
    // The turn to the audience ends with the feet and the hips at the turn, and the weight
    // between the feet.
    turnFrom.turn = audienceTurn;
    turnFrom.footL = audienceTurn;
    turnFrom.footR = audienceTurn;
    stepTurnAt(turnFrom, 0, TURN_STEPS.shiftSec, elapsed - BACK_START, out);
  }
  const lowered = smoothstep((elapsed - b.silenceSec) / b.lowerSec);
  const raised = elapsed > BACK_START ? armsLimit(turnShare(out, audienceTurn)) : 0;
  out.arms = 1 - lowered * (1 - raised);

  const down = smoothstep((elapsed - BOW_START) / b.downSec);
  const up = smoothstep((elapsed - BOW_START - b.downSec - b.holdSec) / b.upSec);
  out.bend = b.angle * (down - up);
  return out;
}

/**
 * Calculates the motion of the conductor at the song end from the transport (design 5.4). The
 * pause at the song end (`Transport.endedAtSong`) runs {@link endMotionAt}. A later play or pause
 * starts from the motion at its change, and steps back to no end motion in `END_BOW.returnSec`.
 * Thus a play during the bow turns the bear back to the orchestra with steps and no jump. The
 * result is a pure function of the transport chain and the wall time. The steps end before
 * `changeTransport()` cuts a transport from the chain, because a cut needs at least
 * `LIFT_FIT_SEC` after a play.
 *
 * @param transport The play state.
 * @param wallTime The wall clock time, in seconds.
 * @param audienceTurn The turn from the facing of the conductor to the audience, in radians,
 *   positive to the left (`ConductorLayer.audienceTurn`).
 * @param out The motion to write.
 * @returns `out`.
 */
export function transportEndMotion(
  transport: Transport,
  wallTime: number,
  audienceTurn: number,
  out: EndMotion,
): EndMotion {
  const changed = transport.changedAtWall;
  if (changed === null) {
    return noEndMotion(out);
  }
  if (!transport.playing && transport.endedAtSong) {
    return endMotionAt(wallTime - changed, audienceTurn, out);
  }
  if (!transport.before) {
    return noEndMotion(out);
  }

  transportEndMotion(transport.before, changed, audienceTurn, out);
  const elapsed = wallTime - changed;
  if (elapsed <= 0 || !stepsLegs(out)) {
    out.bend *= elapsed > 0 ? 1 - smoothstep(elapsed / END_BOW.returnSec) : 1;
    if (elapsed > 0) {
      out.arms += (1 - out.arms) * smoothstep(elapsed / END_BOW.returnSec);
    }
    return out;
  }
  copyEndMotion(out, turnFrom);
  stepTurnAt(turnFrom, 0, TURN_STEPS.returnShiftSec, elapsed, out);
  const back = smoothstep(elapsed / END_BOW.returnSec);
  out.bend = turnFrom.bend * (1 - back);
  out.arms = Math.min(
    turnFrom.arms + (1 - turnFrom.arms) * back,
    armsLimit(turnShare(out, audienceTurn)),
  );
  return out;
}
