import { smoothstep } from '../math.ts';

/**
 * The times of the title card of Cinematic mode (design 2.8), in song seconds. The card shows the
 * composer and the piece title in the lower part of the frame at the song start, as the main title
 * of a film. The times are song times, so a pause holds the card, and a seek shows the card of the
 * new time.
 */
const TITLE_CARD = {
  /**
   * The song time at which the fade in starts. A play reads the song time 0 for one frame before
   * its count-in, so the card starts later and that frame shows no card.
   */
  inSec: 0.3,
  /** The length of the fade in. */
  fadeInSec: 1.2,
  /** The song time at which the fade out starts. */
  outSec: 5.5,
  /** The length of the fade out. */
  fadeOutSec: 1.5,
} as const;

/** The state of the frame that decides the title card. */
interface TitleCardFrame {
  /** True in Cinematic mode. Free mode shows the title at the top left only. */
  readonly cinematic: boolean;
  /** True after the first play of the piece (`Transport.changedAtWall` is not `null`). */
  readonly played: boolean;
  /** The song time, in seconds. */
  readonly songSec: number;
  /** True if the user prefers reduced motion: the card shows and hides with no fade. */
  readonly still: boolean;
}

/**
 * Calculates the opacity of the title card in a frame (design 2.8). It is a pure function of the
 * song time, so a pause, a seek, and a speed change are always correct.
 *
 * @param frame The mode, the play state, the song time, and the motion preference.
 * @returns The opacity, from 0 (no card) to 1.
 */
export function titleCardLevel(frame: TitleCardFrame): number {
  if (!frame.cinematic || !frame.played) {
    return 0;
  }

  const { inSec, fadeInSec, outSec, fadeOutSec } = TITLE_CARD;
  const t = frame.songSec;
  if (frame.still) {
    return t >= inSec && t < outSec + fadeOutSec / 2 ? 1 : 0;
  }
  return Math.min(smoothstep((t - inSec) / fadeInSec), 1 - smoothstep((t - outSec) / fadeOutSec));
}
