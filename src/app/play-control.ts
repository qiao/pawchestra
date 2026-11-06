import type { LoadProgress } from '../audio/player.ts';
import type { FirstScreenView } from '../ui/first-screen.ts';

/** The state of the samples of the current piece in the `Player`. */
export type SampleState = 'loading' | 'ready' | 'failed';

/** The state of the current piece that the play buttons show. */
export interface PieceStatus {
  readonly samples: SampleState;
  /** True while the transport plays. */
  readonly playing: boolean;
  /**
   * True if the piece starts when its samples are ready (design 2.2, 2.4): after a selection,
   * after a click on play during the load, and after a click on play after a failure.
   */
  readonly playWhenReady: boolean;
  /** True after the first play of the piece. Until then, the first screen shows (2.2). */
  readonly played: boolean;
}

/**
 * Gives the state of the play buttons before the first piece shows (design 2.2). After the file
 * of the first demo did not load, the samples count as failed: the first screen shows "Play"
 * with no load ring, and a click loads the file again.
 *
 * A click on play before the first piece shows waits for it, as a click during the load does.
 *
 * @param fileFailed True after the file of the first demo did not load.
 * @param playWhenShown True after a click on play before the first piece shows.
 * @returns The state.
 */
export function noPieceStatus(fileFailed: boolean, playWhenShown: boolean): PieceStatus {
  return {
    samples: fileFailed ? 'failed' : 'loading',
    playing: false,
    playWhenReady: !fileFailed && playWhenShown,
    played: false,
  };
}

/**
 * What a click on the play button of the bar does:
 *
 * - `play` and `pause`: the transport plays or pauses.
 * - `wait`: the piece starts when its samples are ready.
 * - `cancel`: the piece does not start when its samples are ready.
 * - `retry`: the app loads the audio again after a failure, and plays when it is ready.
 */
type PlayAction = 'play' | 'pause' | 'wait' | 'cancel' | 'retry';

/**
 * Gives the action of a click on the play button of the bar (design 2.4). Play waits until the
 * samples are ready. After a failed load or an audio failure, a click loads the audio again.
 *
 * @param status The state of the current piece.
 * @returns The action.
 */
export function playAction(status: PieceStatus): PlayAction {
  if (status.samples === 'failed') {
    return 'retry';
  }
  if (status.samples === 'loading') {
    return status.playWhenReady ? 'cancel' : 'wait';
  }
  return status.playing ? 'pause' : 'play';
}

/**
 * Gives the label of the play button of the bar. While the piece waits for its samples to play,
 * the button shows "Pause", so that a click can cancel the wait.
 *
 * @param status The state of the current piece.
 * @returns "Play" or "Pause".
 */
export function playLabel(status: PieceStatus): 'Play' | 'Pause' {
  return waitsForSamples(status) || (status.samples === 'ready' && status.playing)
    ? 'Pause'
    : 'Play';
}

/**
 * Tells if the piece stopped at its end, so that the play button of the bar shows "Play again" with
 * the icon "replay" (design 2.8). A play at the end starts the piece again from 0 (6.5).
 *
 * @param status The state of the current piece.
 * @param songSec The song time that the bar shows, in seconds.
 * @param durationSec The song length, `Score.durationSec`.
 * @returns True at the song end, after a play, while the transport does not play.
 */
export function atSongEnd(status: PieceStatus, songSec: number, durationSec: number): boolean {
  return status.samples === 'ready' && status.played && !status.playing && songSec >= durationSec;
}

/**
 * Tells if the piece waits for its samples to play: after a click on play during the load, or
 * after a selection (design 2.2).
 *
 * @param status The state of the current piece.
 * @returns True while the piece waits.
 */
function waitsForSamples(status: PieceStatus): boolean {
  return status.samples === 'loading' && status.playWhenReady;
}

/**
 * Tells if the first screen shows: the large play button, the load ring, and the load text
 * (design 2.2, 2.8). It shows until the first play of the piece. A newly selected piece shows it
 * while its samples load, and starts when they are ready.
 *
 * @param status The state of the current piece.
 * @returns True if the first screen shows.
 */
export function showsFirstScreen(status: PieceStatus): boolean {
  return !status.played;
}

/**
 * The line below the play button of the first screen until the first play of the session: the name
 * of the app and what it does (design 2.8).
 */
export const INTRO_TEXT = 'Pawchestra: an orchestra of animals plays your MIDI file.';

/** The text button below {@link INTRO_TEXT}. It opens the drawer at the demo list (design 2.8). */
export const SELECT_PIECE_TEXT = 'Select music';

/** The load text before the file of the first piece shows: the page loads the piece. */
export const LOADING_TEXT = 'Loading';

/** The load text before the list of the preset files is known (design 2.8). */
export const INSTRUMENTS_TEXT = 'Loading instruments';

/** The second line of the load text while the piece waits for its samples (design 2.8). */
export const WAIT_TEXT = 'The music starts after the load.';

/**
 * The part of the load ring that turns before the first byte of the samples arrives, and until the
 * bytes pass it (design 2.8).
 */
export const PENDING_SHARE = 0.15;

/**
 * The time of a load after which the load text also gives the megabytes, in seconds (design 2.8). A
 * slow network then shows how much remains.
 */
export const SIZE_AFTER_SEC = 10;

/**
 * Writes a number of bytes in megabytes of 1,000,000 bytes, with one decimal.
 *
 * @param bytes The bytes.
 * @returns For example "5.1".
 */
function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

/**
 * Gives the load text of the first screen (design 2.8). After {@link SIZE_AFTER_SEC} of load, it
 * also gives the megabytes that arrived and their sum.
 *
 * @param progress The progress, or `null` before the list of the preset files is known.
 * @param pieceShown False before the file of the first piece shows.
 * @param loadSec The time since the load of the samples started, in seconds.
 * @returns The text, for example "Loading instruments: 4 of 12", or "Loading instruments: 9 of
 *   17 (5.1 of 9.4 MB)".
 */
export function loadText(progress: LoadProgress | null, pieceShown: boolean, loadSec = 0): string {
  if (!pieceShown) {
    return LOADING_TEXT;
  }
  if (!progress || progress.total === 0) {
    return INSTRUMENTS_TEXT;
  }
  const count = `${INSTRUMENTS_TEXT}: ${progress.done} of ${progress.total}`;
  if (loadSec < SIZE_AFTER_SEC || progress.totalBytes <= 0) {
    return count;
  }
  return `${count} (${megabytes(progress.bytes)} of ${megabytes(progress.totalBytes)} MB)`;
}

/**
 * Gives the state of the first screen in one frame (design 2.2, 2.8). The large play button
 * follows the rules of the play button of the bar: while the piece waits for its samples, it
 * shows "Pause", the ring turns, and the load text gets {@link WAIT_TEXT}. A second click
 * cancels the wait. The ring follows the bytes of the preset files. Until the bytes pass
 * {@link PENDING_SHARE}, that short part of the ring turns slowly, so that the ring does not jump
 * back when the first byte arrives.
 *
 * @param status The state of the current piece.
 * @param progress The progress of the load, or `null` before the list of the preset files is
 *   known.
 * @param pieceShown False before the file of the first piece shows.
 * @param sessionPlayed True after the first play of the session. Then the first screen of a new
 *   piece has no {@link INTRO_TEXT} and no {@link SELECT_PIECE_TEXT} button.
 * @param loadSec The time since the load of the samples started, in seconds, for
 *   {@link loadText}.
 * @returns The view of the first screen.
 */
export function firstScreenView(
  status: PieceStatus,
  progress: LoadProgress | null,
  pieceShown: boolean,
  sessionPlayed = false,
  loadSec = 0,
): FirstScreenView {
  const loading = status.samples === 'loading';
  const waiting = waitsForSamples(status);
  const share = loadShare(progress);
  const pending = loading && share < PENDING_SHARE;
  const text = loading ? loadText(progress, pieceShown, loadSec) : '';
  return {
    shown: showsFirstScreen(status),
    loading,
    waiting,
    pending,
    intro: !sessionPlayed,
    playLabel: playLabel(status),
    loadShare: pending ? PENDING_SHARE : share,
    loadText: waiting ? `${text}\n${WAIT_TEXT}` : text,
  };
}

/**
 * Gives the part of the load ring that shows the progress: the bytes of the preset files that
 * arrived, of the sum of their sizes (design 2.8).
 *
 * @param progress The progress, or `null` before the list of the preset files is known.
 * @returns The part from 0 to 1.
 */
export function loadShare(progress: LoadProgress | null): number {
  if (!progress) {
    return 0;
  }
  if (progress.totalBytes > 0) {
    return Math.min(1, progress.bytes / progress.totalBytes);
  }
  return progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
}
