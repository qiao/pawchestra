/** The seek of the left and the right arrow keys, in seconds (design 2.4). */
const KEY_SEEK_SEC = 5;

/** The volume step of the up and the down arrow keys, on the slider scale from 0 to 100 (2.4). */
const KEY_VOLUME_STEP = 5;

/**
 * The action of a key of the page (design 2.4). `camera` toggles the cinematic camera (2.5),
 * `mute` the mute button, and `full-screen` the full screen.
 */
type KeyAction =
  | 'play'
  | 'seek-back'
  | 'seek-forward'
  | 'seek-start'
  | 'volume-up'
  | 'volume-down'
  | 'camera'
  | 'mute'
  | 'full-screen';

/** A key action that seeks. */
type SeekAction = Extract<KeyAction, 'seek-back' | 'seek-forward' | 'seek-start'>;

/** A key action that changes the volume. */
type VolumeAction = Extract<KeyAction, 'volume-up' | 'volume-down'>;

/**
 * The letter keys that toggle a control of the bar, in lower case (design 2.4): C the automatic
 * camera, M the mute button, and F the full screen. No control of the page uses these letters.
 */
const LETTER_ACTIONS: ReadonlyMap<string, KeyAction> = new Map([
  ['c', 'camera'],
  ['m', 'mute'],
  ['f', 'full-screen'],
]);

/**
 * The kind of the element with the keyboard focus. A control that uses a key itself keeps it:
 * a button uses Space, a range uses the arrows and Home, and a menu uses Space and the arrows.
 * `dialog` is each focus while a modal dialog is open, for example the credits (design 2.8).
 */
export type FocusKind = 'page' | 'button' | 'range' | 'menu' | 'text' | 'dialog';

/** A key press of the page. */
export interface KeyPress {
  /** The `KeyboardEvent.key`, for example ' ' or 'ArrowLeft'. */
  readonly key: string;
  /** True for a key that the system repeats while the user holds it. */
  readonly repeat: boolean;
  /** True with Ctrl, Alt, or Meta: a shortcut of the browser or of the system. */
  readonly modified: boolean;
}

/**
 * Gives the action of a key of the page (design 2.4): Space plays and pauses, the left and the
 * right arrows seek 5 s, Home goes to the start, the up and the down arrows change the volume, C
 * toggles the cinematic camera, M the mute button, and F the full screen. The keys do nothing
 * while the focus is in a text field, while a modal dialog is open, with Ctrl, Alt, or Meta, and
 * when the control with the focus uses the key itself. Space and the letters do not repeat, so
 * that a held key does not toggle many times.
 *
 * @param press The key press.
 * @param focus The kind of the element with the focus.
 * @returns The action, or `null` for none.
 */
export function keyAction(press: KeyPress, focus: FocusKind): KeyAction | null {
  if (press.modified || focus === 'text' || focus === 'dialog') {
    return null;
  }
  switch (press.key) {
    case ' ':
      return press.repeat || focus === 'button' || focus === 'menu' ? null : 'play';
    case 'ArrowLeft':
      return focus === 'range' || focus === 'menu' ? null : 'seek-back';
    case 'ArrowRight':
      return focus === 'range' || focus === 'menu' ? null : 'seek-forward';
    case 'Home':
      return focus === 'range' || focus === 'menu' ? null : 'seek-start';
    case 'ArrowUp':
      return focus === 'range' || focus === 'menu' ? null : 'volume-up';
    case 'ArrowDown':
      return focus === 'range' || focus === 'menu' ? null : 'volume-down';
    default:
      return press.repeat ? null : (LETTER_ACTIONS.get(press.key.toLowerCase()) ?? null);
  }
}

/**
 * Gives the seek point of a seek key.
 *
 * @param action The seek action.
 * @param songSec The song time that the bar shows, in seconds.
 * @returns The seek point, in song seconds. `App` limits it to the song.
 */
export function keySeekPoint(action: SeekAction, songSec: number): number {
  switch (action) {
    case 'seek-back':
      return songSec - KEY_SEEK_SEC;
    case 'seek-forward':
      return songSec + KEY_SEEK_SEC;
    case 'seek-start':
      return 0;
  }
}

/**
 * Gives the volume after a volume key.
 *
 * @param action The volume action.
 * @param volume The position of the volume slider, from 0 to 100.
 * @returns The new position of the volume slider, from 0 to 100.
 */
export function keyVolume(action: VolumeAction, volume: number): number {
  const step = action === 'volume-up' ? KEY_VOLUME_STEP : -KEY_VOLUME_STEP;
  return Math.min(100, Math.max(0, volume + step));
}
