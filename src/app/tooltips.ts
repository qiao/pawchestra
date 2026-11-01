/** The time from a hover or a keyboard focus on a control to its tooltip, in milliseconds. */
export const TOOLTIP_DELAY_MS = 400;

/** The key of a control: the text of its tooltip, and the value of its `aria-keyshortcuts`. */
export interface ControlKey {
  /** The key in the tooltip, for example "Space". */
  readonly text: string;
  /** The keys in the syntax of `aria-keyshortcuts`, for example "ArrowLeft ArrowRight Home". */
  readonly shortcuts: string;
}

/** The keys of the controls of the bar (design 2.4, 2.8). */
export const CONTROL_KEYS = {
  play: { text: 'Space', shortcuts: 'Space' },
  seek: { text: '← →, Home', shortcuts: 'ArrowLeft ArrowRight Home' },
  mute: { text: 'M', shortcuts: 'M' },
  volume: { text: '↑ ↓', shortcuts: 'ArrowUp ArrowDown' },
  camera: { text: 'C', shortcuts: 'C' },
  fullScreen: { text: 'F', shortcuts: 'F' },
} as const satisfies Readonly<Record<string, ControlKey>>;

/**
 * Gives the text of the tooltip of a control (design 2.8): the name of the action, and its key in
 * parentheses.
 *
 * @param label The accessible name of the control, for example "Cinematic camera".
 * @param key The key of the control, or `null` for a control with no key.
 * @returns The text, for example "Cinematic camera (C)".
 */
export function tooltipText(label: string, key: ControlKey | null): string {
  return key ? `${label} (${key.text})` : label;
}
