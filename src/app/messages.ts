/** The time for which a message shows, in seconds (design 2.8). */
const MESSAGE_SEC = 6;

/** The message of a demo file that did not load, with a "Try again" button (design 2.8). */
export const FILE_FAILURE_TEXT = 'The demo did not load. Check the connection.';

/** The message of a failed load of the samples, with a "Try again" button (design 2.8). */
export const LOAD_FAILURE_TEXT = 'The instruments did not load. Check the connection.';

/**
 * The message of an audio failure after the load, for example during play, with a "Try again"
 * button (design 2.8, 6.8).
 */
export const PLAY_FAILURE_TEXT = 'An error stopped the music. Try again.';

/**
 * The line about the app above the full-page message of a browser with no WebGL2, below the name
 * "Pawchestra" (design 2.8).
 */
export const ABOUT_TEXT = 'An orchestra of animals plays your MIDI file.';

/** The full-page message of a browser with no WebGL2 (design 2.6, 2.8). */
export const NO_WEBGL2_TEXT =
  'This browser cannot show the orchestra, because it does not support WebGL2. Use a current version of Chrome, Firefox, or Safari.';

/** The text of the button of a failure message that loads the file or the audio again. */
export const RETRY_TEXT = 'Try again';

/**
 * The kind of a failure: `file` for a demo file that did not load (design 2.2), `load` for the
 * audio module or the samples of a piece, and `play` for an audio failure that no load reports,
 * for example during play (design 6.8).
 */
export type Failure = 'file' | 'load' | 'play';

/** The message text of each kind of failure (design 2.8). */
const FAILURE_TEXTS = {
  file: FILE_FAILURE_TEXT,
  load: LOAD_FAILURE_TEXT,
  play: PLAY_FAILURE_TEXT,
} as const satisfies Readonly<Record<Failure, string>>;

/** A message at the bottom center of the page (design 2.8). */
export interface Message {
  readonly text: string;
  /** True if the message has the "Try again" button. */
  readonly retry: boolean;
  /** The wall time at which the message closes, in seconds. */
  readonly closesAtSec: number;
}

/**
 * Makes the message of a failure. It has the "Try again" button.
 *
 * @param failure The kind of the failure.
 * @param nowSec The wall time, in seconds.
 * @returns The message.
 */
export function failureMessage(failure: Failure, nowSec: number): Message {
  return {
    text: FAILURE_TEXTS[failure],
    retry: true,
    closesAtSec: nowSec + MESSAGE_SEC,
  };
}

/**
 * Makes a message with no button, for example the refusal of a file (design 3.3).
 *
 * @param text The text of design 2.8.
 * @param nowSec The wall time, in seconds.
 * @returns The message.
 */
export function textMessage(text: string, nowSec: number): Message {
  return { text, retry: false, closesAtSec: nowSec + MESSAGE_SEC };
}

/**
 * Gives the message after a frame (design 2.8). A message closes after 6 s. While the pointer is
 * over it or it holds the keyboard focus, it stays, and it closes 6 s after the user leaves it.
 * Thus a user can read it and reach its buttons.
 *
 * @param message The message, or `null` for none.
 * @param nowSec The wall time of the frame, in seconds.
 * @param held True while the pointer is over the message or it holds the focus.
 * @returns The message, `null` when it closes, or `message` if nothing changes.
 */
export function followMessage(
  message: Message | null,
  nowSec: number,
  held: boolean,
): Message | null {
  if (!message) {
    return null;
  }
  if (held) {
    const closesAtSec = Math.max(message.closesAtSec, nowSec + MESSAGE_SEC);
    return closesAtSec === message.closesAtSec ? message : { ...message, closesAtSec };
  }
  return nowSec >= message.closesAtSec ? null : message;
}
