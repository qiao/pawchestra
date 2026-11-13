import { MathUtils } from 'three';

import { clamp01, smoothstep } from './rest.ts';
import type { Transport } from './types.ts';

/**
 * The end of a concert for the conductor (design 5.4, `conductor-technique.md` 8). After the
 * cut-off of the last chord, the bear holds the release in the silence, lowers the arms, stands
 * still, turns on the podium to the audience, bows from the waist, and turns back to the
 * orchestra. The times are wall seconds after the stop at the song end, so the pose stays a
 * function of the transport. The end card shows after the turn back (`END_CARD` of
 * `app/end-card.ts`), because the card stands over the podium.
 *
 * ```text
 * wall s  0    0.4        1.4     2.0          3.4               5.3     6.0         7.4
 *         |hold| arms down |still | turn (left) | bow down,hold,up | face  | turn back |
 * ```
 */
export const END_BOW = {
  /** The release pose stays in the silence after the cut-off. */
  silenceSec: 0.4,
  /** The arms come down to the sides in this time. */
  lowerSec: 1,
  /** The bear stands still with the arms down before the turn. */
  stillSec: 0.6,
  /** The turn to the audience, and the turn back, each take this time. */
  turnSec: 1.4,
  /** The upper body bends forward in this time. */
  downSec: 0.7,
  /** The bow holds at its lowest point for this time. */
  holdSec: 0.4,
  /** The upper body comes up in this time. */
  upSec: 0.8,
  /** The bear faces the audience for this time after the bow, before it turns back. */
  faceSec: 0.7,
  /**
   * The bend of the spine, in radians: a bow from the waist with a straight back. A conductor
   * bows less deeply than a soloist, because the bow accepts the applause for the orchestra.
   */
  angle: 35 * MathUtils.DEG2RAD,
  /** The head bends this part of the bend more, so that the eyes look down. */
  head: 0.5,
  /** The small steps of the feet in each turn, the left foot first. */
  steps: 4,
  /** The lift of a foot in a step, in head heights `H` of the body. */
  stepLift: 0.06,
  /**
   * The share of the turn to the audience below which the arms can lift: the arms lift only when
   * the bear nearly faces the orchestra. A playing arm of a turned body reaches across the body
   * to the beat point, and its paw swings fast.
   */
  armsTurn: 0.3,
} as const;

/** The motion of the conductor at the song end at one time. */
export interface EndMotion {
  /** The share of the playing pose that the arms keep, from 1 (up) to 0 (down at the sides). */
  arms: number;
  /** The turn of the whole body around +y, in radians, positive to the left. */
  turn: number;
  /** The bend of the spine of the bow, in radians. */
  bend: number;
  /** The lift of the left foot and of the right foot in a step of a turn, from 0 to 1. */
  stepL: number;
  stepR: number;
}

/**
 * Makes the motion of no song end: the arms up, no turn, no bend, and no step.
 *
 * @returns The motion.
 */
export function createEndMotion(): EndMotion {
  return { arms: 1, turn: 0, bend: 0, stepL: 0, stepR: 0 };
}

/** The start of the turn to the audience, in wall seconds after the stop. */
const TURN_START = END_BOW.silenceSec + END_BOW.lowerSec + END_BOW.stillSec;

/** The start of the bow. */
const BOW_START = TURN_START + END_BOW.turnSec;

/** The start of the turn back to the orchestra. */
const BACK_START = BOW_START + END_BOW.downSec + END_BOW.holdSec + END_BOW.upSec + END_BOW.faceSec;

/** The end of the whole motion: after this time, the bear stands in the rest pose (design 5.2). */
export const END_BOW_SEC = BACK_START + END_BOW.turnSec;

/**
 * Writes the lifts of the feet in the steps of a turn. The steps follow the eased turn, so that
 * the feet step while the body turns, and each foot lifts in a half sine.
 *
 * @param progress The eased progress of the turn, from 0 to 1.
 * @param out The motion to write.
 */
function stepsOf(progress: number, out: EndMotion): void {
  out.stepL = 0;
  out.stepR = 0;
  if (progress <= 0 || progress >= 1) {
    return;
  }
  const phase = progress * END_BOW.steps;
  const step = Math.floor(phase);
  const lift = Math.sin(Math.PI * (phase - step));
  if (step % 2 === 0) {
    out.stepL = lift;
  } else {
    out.stepR = lift;
  }
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
  out.bend = 0;
  out.stepL = 0;
  out.stepR = 0;
  return out;
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
  const there = clamp01((elapsed - TURN_START) / b.turnSec);
  const back = clamp01((elapsed - BACK_START) / b.turnSec);
  const lowered = smoothstep((elapsed - b.silenceSec) / b.lowerSec);
  const raised = back > 0 ? armsLimit(1 - smoothstep(back)) : 0;
  out.arms = 1 - lowered * (1 - raised);
  out.turn = audienceTurn * (smoothstep(there) - smoothstep(back));
  stepsOf(back > 0 ? smoothstep(back) : smoothstep(there), out);

  const down = smoothstep((elapsed - BOW_START) / b.downSec);
  const up = smoothstep((elapsed - BOW_START - b.downSec - b.holdSec) / b.upSec);
  out.bend = b.angle * (down - up);
  return out;
}

/**
 * Calculates the motion of the conductor at the song end from the transport (design 5.4). The
 * pause at the song end (`Transport.endedAtSong`) runs {@link endMotionAt}. A later play or pause
 * starts from the motion at its change, and eases it back to no end motion in `END_BOW.turnSec`.
 * Thus a play during the bow turns the bear back to the orchestra with no jump, and the feet step
 * in this turn for its share of the full turn. The result is a pure function of the transport
 * chain and the wall time. The fade ends before `changeTransport()` cuts a transport from the
 * chain, because a cut needs at least `LIFT_FIT_SEC` after a play.
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
  const back = smoothstep((wallTime - changed) / END_BOW.turnSec);
  if (back <= 0) {
    return out;
  }
  const { stepL, stepR } = out;
  const share = audienceTurn === 0 ? 0 : Math.min(1, Math.abs(out.turn / audienceTurn));
  stepsOf(back, out);
  out.stepL = stepL * (1 - back) + share * out.stepL;
  out.stepR = stepR * (1 - back) + share * out.stepR;
  out.turn *= 1 - back;
  out.bend *= 1 - back;
  out.arms = Math.min(out.arms + (1 - out.arms) * back, armsLimit(share * (1 - back)));
  return out;
}
