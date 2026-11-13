import { hashUnit, mulberry32 } from './random.ts';
import { lookBlink, overshoot } from './looks.ts';

/** The values of the idle layer (design 5.1). Its clock is the wall clock. */
export const IDLE_MOTION = {
  /** The shortest and the longest breath, in seconds. Each player gets a seeded value. */
  breathSec: [3.2, 4.4],
  /** Each blink falls at a seeded time in each window of this length. */
  blinkWindowSec: 4,
  /** The time from open eyes to closed eyes and back. */
  blinkSec: 0.16,
  /** A look at the conductor can start in each window of this length. */
  lookWindowSec: 9,
  /** The part of the windows that hold a look. */
  lookChance: 0.45,
  /** The length of a look, with the turns of the head. */
  lookSec: 2.4,
  /**
   * The time of the turn of the head to the conductor and of the turn back, each with a pass over
   * its end (`overshoot()`).
   */
  lookTurnSec: 0.5,
  /** An ear twitch can start in each window of this length. */
  earWindowSec: 6,
  earChance: 0.4,
  earSec: 0.3,
  /** The time of one sway of the tail. */
  tailSec: 5.5,
} as const;

/** The seeded idle values of one animal. */
export interface IdleParams {
  /** The seed of the animal, for the windows of the blinks, the looks, and the ears. */
  readonly seed: number;
  readonly breathSec: number;
  /** The start of the breath cycle, from 0 to 1. */
  readonly breathPhase: number;
  readonly tailPhase: number;
}

/** The idle motion of one animal at one wall clock time. */
export interface IdleState {
  /** The breath, from -1 (out) to 1 (in). */
  breath: number;
  /** 0 is open eyes, 1 is closed eyes. */
  blink: number;
  /** The weight of the look at the conductor, from about -0.1 to about 1.1 with the pass over the end. */
  look: number;
  /** The twitch of the ears, from 0 to 1. */
  ear: number;
  /** The sway of the tail, from -1 to 1. */
  tail: number;
}

/** The salts that give each idle motion its own windows. */
const SALT = { blink: 0x51ed, look: 0x10c4, ear: 0xea25 } as const;

/**
 * Makes the seeded idle values of one animal.
 *
 * @param seed The seed of the animal.
 * @returns The values.
 */
export function idleParams(seed: number): IdleParams {
  const next = mulberry32(seed);
  const [low, high] = IDLE_MOTION.breathSec;
  return {
    seed,
    breathSec: low + (high - low) * next(),
    breathPhase: next(),
    tailPhase: next(),
  };
}

/**
 * Makes an idle state with no motion.
 *
 * @returns The state.
 */
export function createIdleState(): IdleState {
  return { breath: 0, blink: 0, look: 0, ear: 0, tail: 0 };
}

/**
 * Gives the progress of an event that falls at a seeded time in each window of the wall clock.
 *
 * @param seed The seed of the animal and the event.
 * @param time The wall clock time, in seconds.
 * @param windowSec The length of a window.
 * @param chance The part of the windows that hold the event.
 * @param durationSec The length of the event. It is shorter than the window.
 * @returns The time since the start of the event, or -1 outside the event.
 */
function windowEvent(
  seed: number,
  time: number,
  windowSec: number,
  chance: number,
  durationSec: number,
): number {
  const window = Math.floor(time / windowSec);
  const u = hashUnit(seed, window);
  if (u >= chance) {
    return -1;
  }
  const start = window * windowSec + (u / chance) * (windowSec - durationSec);
  const dt = time - start;
  return dt >= 0 && dt <= durationSec ? dt : -1;
}

/**
 * Calculates the idle motion of one animal (design 5.1): the breath, the blinks, the looks at
 * the conductor, the ears, and the tail. The motion depends only on the seeded values and the
 * wall clock, so the animals stay alive while the music stops.
 *
 * @param params The seeded values of the animal.
 * @param wallTime The wall clock time, in seconds.
 * @param out The state to write.
 */
export function idleAt(params: IdleParams, wallTime: number, out: IdleState): void {
  const m = IDLE_MOTION;
  out.breath = Math.sin(2 * Math.PI * (wallTime / params.breathSec + params.breathPhase));
  out.tail = Math.sin(2 * Math.PI * (wallTime / m.tailSec + params.tailPhase));

  const blink = windowEvent(params.seed ^ SALT.blink, wallTime, m.blinkWindowSec, 1, m.blinkSec);
  out.blink = blink < 0 ? 0 : 1 - Math.abs(2 * blink - m.blinkSec) / m.blinkSec;

  const look = windowEvent(
    params.seed ^ SALT.look,
    wallTime,
    m.lookWindowSec,
    m.lookChance,
    m.lookSec,
  );
  // The head turns a little past each end of the look and settles, and a blink starts the turn.
  if (look >= 0) {
    const back = m.lookSec - m.lookTurnSec;
    out.look =
      look < back ? overshoot(look / m.lookTurnSec) : 1 - overshoot((look - back) / m.lookTurnSec);
    out.blink = Math.max(out.blink, lookBlink(look));
  } else {
    out.look = 0;
  }

  const ear = windowEvent(params.seed ^ SALT.ear, wallTime, m.earWindowSec, m.earChance, m.earSec);
  out.ear = ear < 0 ? 0 : Math.sin((Math.PI * ear) / m.earSec);
}
