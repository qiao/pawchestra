import { MathUtils } from 'three';

import { clamp01, smoothstep } from './rest.ts';

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
 * Calculates the motion of the conductor at the song end (design 5.4): a pure function of the
 * wall seconds after the stop at the song end.
 *
 * @param elapsed The wall seconds after the stop at the song end, or `NaN` when the song does
 *   not stand at its end.
 * @param audienceTurn The turn from the facing of the conductor to the audience, in radians,
 *   positive to the left (`ConductorLayer.audienceTurn`).
 * @param out The motion to write.
 * @returns `out`.
 */
export function endMotionAt(elapsed: number, audienceTurn: number, out: EndMotion): EndMotion {
  const b = END_BOW;
  if (Number.isNaN(elapsed)) {
    out.arms = 1;
    out.turn = 0;
    out.bend = 0;
    out.stepL = 0;
    out.stepR = 0;
    return out;
  }
  out.arms = 1 - smoothstep((elapsed - b.silenceSec) / b.lowerSec);

  const there = clamp01((elapsed - TURN_START) / b.turnSec);
  const back = clamp01((elapsed - BACK_START) / b.turnSec);
  out.turn = audienceTurn * (smoothstep(there) - smoothstep(back));
  stepsOf(back > 0 ? smoothstep(back) : smoothstep(there), out);

  const down = smoothstep((elapsed - BOW_START) / b.downSec);
  const up = smoothstep((elapsed - BOW_START - b.downSec - b.holdSec) / b.upSec);
  out.bend = b.angle * (down - up);
  return out;
}
