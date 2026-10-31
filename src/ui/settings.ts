import {
  FRAME_RATE_OPTIONS,
  QUALITY_OPTIONS,
  SECTION_SIZE_OPTIONS,
  SETTING_HELP,
} from '../app/settings.ts';
import type {
  AutoLabels,
  FrameRateSetting,
  QualitySetting,
  SettingOption,
} from '../app/settings.ts';
import type { SectionSize } from '../score/types.ts';
import { createButton, createElement, setAttribute, setText } from './dom.ts';

/** A segmented control: a group of toggle buttons, one of which is pressed (design 2.8). */
class Segmented<T extends string> {
  readonly element: HTMLElement;
  readonly #buttons: readonly (readonly [T, HTMLButtonElement])[];

  /**
   * Creates the control.
   *
   * @param label The `aria-label` of the group, for example "Quality".
   * @param options The buttons, in order.
   * @param onSelect The action of a click on a button.
   */
  constructor(label: string, options: readonly SettingOption<T>[], onSelect: (value: T) => void) {
    this.element = createElement('div', 'segmented');
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', label);
    this.#buttons = options.map((option) => {
      const button = createButton('', '');
      button.textContent = option.label;
      button.addEventListener('click', () => {
        onSelect(option.value);
      });
      return [option.value, button] as const;
    });
    this.element.append(...this.#buttons.map(([, button]) => button));
  }

  /**
   * Marks the current value, and sets the label of the button "Auto".
   *
   * @param value The value of the pressed button.
   * @param autoLabel The label of the button "Auto", for example "Auto (High)".
   */
  show(value: T, autoLabel: string): void {
    for (const [option, button] of this.#buttons) {
      setAttribute(button, 'aria-pressed', String(option === value));
      if (option === 'auto') {
        setText(button, autoLabel);
      }
    }
  }
}

/**
 * The places of the controls of the bar in the "Playback" group of a phone (design 2.8). Each
 * place has a visible label, and the buttons show their names.
 */
export interface PlaybackSlots {
  /** The place of the speed menu, after the label "Speed". */
  readonly speed: HTMLElement;
  /** The place of the volume slider, after the label "Volume". */
  readonly volume: HTMLElement;
  /** The place of "Reset view" and full screen. */
  readonly buttons: HTMLElement;
}

/**
 * Creates a place of the "Playback" group, with a visible label.
 *
 * @param label The label, or '' for none.
 * @returns The place.
 */
function createSlot(label: string): HTMLElement {
  const slot = createElement('div', 'playback-slot');
  if (label) {
    slot.append(createElement('span', 'setting-label', label));
  }
  return slot;
}

/**
 * Creates the group of one setting: the head line with the label and an optional value at the
 * right, the control, and the dim line that explains its values (design 2.8).
 *
 * @param label The label of the setting.
 * @param control The control.
 * @param help The dim line.
 * @param value The element of the value at the right of the label, or `null` for none.
 * @returns The group.
 */
function createGroup(
  label: string,
  control: HTMLElement,
  help: string,
  value: HTMLElement | null = null,
): HTMLElement {
  const head = createElement('div', 'setting-head');
  head.append(createElement('span', 'setting-label', label));
  if (value) {
    head.append(value);
  }
  const group = createElement('div', 'setting');
  group.append(head, control, createElement('p', 'setting-help', help));
  return group;
}

/**
 * The settings of the drawer (design 2.3, 2.8): "Section size", "Quality", and "Frame rate", each
 * with a dim line that explains its values. "Frame rate" shows the rate of the drawn frames at the
 * right of its label. On a phone, the "Playback" group at the top holds the speed menu, the volume
 * slider, "Reset view", and full screen of the bar, each with a visible label.
 */
export class Settings {
  readonly element: HTMLElement;
  /** The places of the "Playback" group, for `Bar.placePlayback()`. */
  readonly playback: PlaybackSlots;
  readonly #sectionSize: Segmented<SectionSize>;
  readonly #quality: Segmented<QualitySetting>;
  readonly #frameRate: Segmented<FrameRateSetting>;
  /** The counter of the drawn frames, at the right of the label "Frame rate". */
  readonly #fps = createElement('span', 'setting-value');

  /**
   * Creates the three segmented controls.
   *
   * @param onSectionSize The action of a new section size.
   * @param onQuality The action of a new quality setting.
   * @param onFrameRate The action of a new frame rate setting.
   */
  constructor(
    onSectionSize: (size: SectionSize) => void,
    onQuality: (quality: QualitySetting) => void,
    onFrameRate: (frameRate: FrameRateSetting) => void,
  ) {
    this.element = createElement('div', 'settings');
    this.playback = {
      speed: createSlot('Speed'),
      volume: createSlot('Volume'),
      buttons: createSlot(''),
    };
    const row = createElement('div', 'playback-row');
    row.append(this.playback.speed, this.playback.volume, this.playback.buttons);
    const playback = createElement('div', 'playback');
    playback.setAttribute('role', 'group');
    playback.setAttribute('aria-label', 'Playback');
    playback.append(createElement('span', 'setting-label', 'Playback'), row);
    this.#sectionSize = new Segmented('Section size', SECTION_SIZE_OPTIONS, onSectionSize);
    this.#quality = new Segmented('Quality', QUALITY_OPTIONS, onQuality);
    this.#frameRate = new Segmented('Frame rate', FRAME_RATE_OPTIONS, onFrameRate);
    this.element.append(
      playback,
      createGroup('Section size', this.#sectionSize.element, SETTING_HELP.sectionSize),
      createGroup('Quality', this.#quality.element, SETTING_HELP.quality),
      createGroup('Frame rate', this.#frameRate.element, SETTING_HELP.frameRate, this.#fps),
    );
  }

  /**
   * Marks the current values, and shows the value that each button "Auto" selects now.
   *
   * @param sectionSize The setting "Section size".
   * @param quality The setting "Quality".
   * @param frameRate The setting "Frame rate".
   * @param auto The labels of the buttons "Auto", from `autoLabels()`.
   */
  show(
    sectionSize: SectionSize,
    quality: QualitySetting,
    frameRate: FrameRateSetting,
    auto: AutoLabels,
  ): void {
    this.#sectionSize.show(sectionSize, auto.sectionSize);
    this.#quality.show(quality, auto.quality);
    this.#frameRate.show(frameRate, 'Auto');
  }

  /**
   * Shows the rate of the drawn frames at the right of the label "Frame rate".
   *
   * @param fps The rate, from `measuredFrameRate()`, or `null` for no measure.
   */
  showFrameRate(fps: number | null): void {
    setText(this.#fps, fps === null ? '' : `${Math.round(fps)} fps`);
  }
}
