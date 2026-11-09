import type { Player } from '../audio/player.ts';

/** The part of the `Player` that gives the song time of the test page (design 6.5, 7.1). */
export type SongClock = Pick<Player, 'play' | 'pause' | 'seek' | 'setRate' | 'now'>;

/**
 * A song clock with no sound, with the transport rules of the processor (design 6.5). The test
 * page uses it until the samples of the `Player` are ready, because the browser starts the audio
 * only after a click, and after a failed load.
 */
export class SilentClock implements SongClock {
  /** The song seconds for each wall clock second. */
  #rate = 1;
  #playing = false;
  /** The song time at the wall time of the anchor, or the pause point while paused. */
  #songSec = 0;
  /** The wall time of the last play, seek, or change of the rate, in milliseconds. */
  #anchorMs = 0;

  /**
   * Plays from the pause point. The song time starts one count-in before it. A play during play
   * does nothing, as in the processor.
   *
   * @param countInSec The count-in in song seconds, 0 or more.
   */
  play(countInSec: number): void {
    if (this.#playing) {
      return;
    }
    this.#songSec -= Math.max(0, countInSec);
    this.#anchorMs = performance.now();
    this.#playing = true;
  }

  /** Pauses at the song time of now, or at the start point during the count-in. */
  pause(): void {
    if (!this.#playing) {
      return;
    }
    this.#songSec = Math.max(0, this.now());
    this.#playing = false;
  }

  /**
   * Moves the song time.
   *
   * @param songSec The new song time, 0 or more.
   */
  seek(songSec: number): void {
    this.#songSec = Math.max(0, songSec);
    this.#anchorMs = performance.now();
  }

  /**
   * Changes the speed, from the song time of now.
   *
   * @param rate The song seconds for each wall clock second.
   */
  setRate(rate: number): void {
    this.#songSec = this.now();
    this.#anchorMs = performance.now();
    this.#rate = rate;
  }

  /**
   * Gives the song time of now.
   *
   * @returns The song time in seconds. It is less than 0 in the count-in of the first play.
   */
  now(): number {
    if (!this.#playing) {
      return this.#songSec;
    }
    return this.#songSec + ((performance.now() - this.#anchorMs) / 1000) * this.#rate;
  }
}
