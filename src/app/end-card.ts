import { END_BOW_SEC } from '../pose/end-bow.ts';
import { DEMO_IDS } from './demos.ts';
import type { DemoId } from './demos.ts';
import { clamp01 } from '../math.ts';

/**
 * The times of the end card (design 2.8), in seconds after the song end. The card comes after the
 * bow of the conductor (5.4), and the countdown to the next demo starts with the card.
 */
const END_CARD = {
  /**
   * The time after the end at which the fade in starts: when the conductor faces the orchestra
   * again after the bow (5.4). The card stands in the middle of the view, over the podium, so an
   * earlier card hides the turn and the bow.
   */
  inSec: END_BOW_SEC,
  /** The length of the fade in. */
  fadeInSec: 0.8,
  /** The length of the countdown to the next demo. */
  countSec: 10,
} as const;

/** The state of the frame that decides the end card. */
interface EndCardFrame {
  /** True while the piece stands at its end after a play (`atSongEnd()`). */
  readonly ended: boolean;
  /** The time since the transport stopped at the end, in seconds. */
  readonly sinceEndSec: number;
  /** True if the user prefers reduced motion: the card shows with no fade. */
  readonly still: boolean;
}

/** What the end card shows in one frame. */
export interface EndCardView {
  /** The opacity, from 0 (no card) to 1. */
  readonly level: number;
  /** The part of the countdown to the next demo that passed, from 0 to 1. */
  readonly countShare: number;
}

/**
 * Calculates the end card of a frame (design 2.8). It is a pure function of the song end and the
 * time since the transport stopped there, as `titleCardLevel()` is of the song time. Thus a seek
 * back or a play hides the card, and a new end shows it again.
 *
 * @param frame The end state and the time since the end.
 * @returns The opacity and the part of the countdown that passed.
 */
export function endCardView(frame: EndCardFrame): EndCardView {
  if (!frame.ended) {
    return { level: 0, countShare: 0 };
  }

  const { inSec, fadeInSec, countSec } = END_CARD;
  const t = frame.sinceEndSec - inSec;
  const countShare = clamp01(t / countSec);
  if (frame.still) {
    return { level: t >= 0 ? 1 : 0, countShare };
  }
  return { level: clamp01(t / fadeInSec), countShare };
}

/**
 * Gives the demo after a demo in the order of the demo list (design 2.8, 8.2). The last demo
 * goes back to the first.
 *
 * @param id The current demo.
 * @returns The next demo.
 */
export function nextDemo(id: DemoId): DemoId {
  const at = DEMO_IDS.indexOf(id);
  return DEMO_IDS[(at + 1) % DEMO_IDS.length] ?? DEMO_IDS[0];
}

/** The button of the end card that plays the piece again (design 2.8). */
export const PLAY_AGAIN_TEXT = 'Play again';

/**
 * Gives the text of the button of the end card that starts the next demo (design 2.8).
 *
 * @param title The title of the next demo.
 * @returns For example "Next: Horn Concerto No. 2, K. 417: III".
 */
export function nextText(title: string): string {
  return `Next: ${title}`;
}
