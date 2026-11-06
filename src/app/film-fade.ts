import { END_BOW } from '../pose/rest.ts';
import type { Transport } from '../pose/types.ts';

/**
 * The fades of the film open and the film end (design 2.5), in wall seconds. A play from the song
 * start fades the picture in from black, as the first shot of a film. At the song end, after the
 * bow of the conductor, the picture fades to black, holds, and fades in again to the stage at
 * rest, the end screen with "Play again".
 */
export const FILM_FADE = {
  /** The black after a click on play from the song start, before the fade in starts. */
  openHoldSec: 0.15,
  /**
   * The length of the fade in. The count-in from the song start is about 1.7 s, so the picture is
   * nearly full when the music starts.
   */
  openSec: 2.2,
  /** The wait after the end of the bow, before the fade to black starts. */
  endWaitSec: 0.4,
  /** The length of the fade to black at the song end. */
  endOutSec: 1.6,
  /** The black between the fade to black and the fade in of the end screen. */
  endHoldSec: 0.8,
  /** The length of the fade in of the end screen. */
  endInSec: 2,
} as const;

/** The wall seconds from the pause at the song end to the end of the bow (design 5.4). */
const BOW_SEC = END_BOW.startSec + 2 * END_BOW.downSec + END_BOW.holdSec;

/**
 * Calculates a smoothstep from 0 to 1.
 *
 * @param x The input, from 0 to 1. Values outside are clamped.
 * @returns The eased value.
 */
function ease(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** The state of the frame that decides the film fade. */
export interface FilmFadeFrame {
  /** The play state. */
  readonly transport: Transport;
  /** The song time, in seconds. */
  readonly songSec: number;
  /** The song length, `Score.durationSec`. */
  readonly durationSec: number;
  /** The wall clock time of the frame, in seconds. */
  readonly wallSec: number;
  /** True if the user prefers reduced motion: the picture does not fade. */
  readonly still: boolean;
}

/**
 * Calculates the level of the fade in of a play at a wall time. Only a play from the song start
 * (start point 0) fades in. A play from a pause point, and a seek during play, which moves the
 * start point, show the picture at once.
 *
 * @param play The transport of the play.
 * @param wallSec The wall clock time, in seconds.
 * @returns The level, from 0 (black) to 1.
 */
function openLevel(play: Transport, wallSec: number): number {
  if (!play.playing || play.startSec !== 0 || play.changedAtWall === null) {
    return 1;
  }
  const { openHoldSec, openSec } = FILM_FADE;
  return ease((wallSec - play.changedAtWall - openHoldSec) / openSec);
}

/**
 * Calculates the level of the picture in a frame (design 2.5): 1 shows the scene, 0 is black. It
 * is a pure function of the transport, the song time, and the wall time, as the pose (5.1), so a
 * pause, a seek, and a new frame rate are always correct.
 *
 * - After a click on play from the song start, the picture fades in from black.
 * - A pause in the fade in holds the level of the pause.
 * - At the song end, after the bow, the picture fades to black, holds, and fades in again.
 * - With reduced motion, the picture does not fade.
 *
 * @param frame The play state, the times, and the motion preference.
 * @returns The level, from 0 to 1.
 */
export function filmFadeLevel(frame: FilmFadeFrame): number {
  const { transport, wallSec } = frame;
  if (frame.still || transport.changedAtWall === null) {
    return 1;
  }
  if (transport.playing) {
    return openLevel(transport, wallSec);
  }
  const paused = transport.before ? openLevel(transport.before, transport.changedAtWall) : 1;
  if (frame.songSec < frame.durationSec) {
    return paused;
  }
  const { endWaitSec, endOutSec, endHoldSec, endInSec } = FILM_FADE;
  const since = wallSec - transport.changedAtWall - BOW_SEC - endWaitSec;
  const end =
    since < endOutSec + endHoldSec
      ? 1 - ease(since / endOutSec)
      : ease((since - endOutSec - endHoldSec) / endInSec);
  return Math.min(paused, end);
}
