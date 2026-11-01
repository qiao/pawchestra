import { DEFAULT_SPEED, SPEEDS, speedText } from '../app/bar-rules.ts';
import type { Speed } from '../app/bar-rules.ts';
import { clockText, seekValueText } from '../app/time-text.ts';
import { CONTROL_KEYS, tooltipText } from '../app/tooltips.ts';
import type { ControlKey } from '../app/tooltips.ts';
import { createButton, createElement, setAttribute, setText } from './dom.ts';
import { createIcon, setIcon } from './icons.ts';
import type { IconName } from './icons.ts';
import type { PlaybackSlots } from './settings.ts';
import type { Tooltips } from './tooltip.ts';

/** The actions of the controls of the bar. */
export interface BarActions {
  /** A click on play or pause. */
  readonly onPlay: () => void;
  /** A move of the seek bar, in song seconds. */
  readonly onSeek: (songSec: number) => void;
  readonly onSpeed: (speed: Speed) => void;
  /** A move of the volume slider, from 0 to 100. */
  readonly onVolume: (volume: number) => void;
  readonly onMute: () => void;
  /** A click on the "Cinematic camera" toggle (design 2.5). */
  readonly onCamera: () => void;
  readonly onResetView: () => void;
  readonly onFullScreen: () => void;
  readonly onDrawer: () => void;
}

/** What the bar shows in one frame. */
interface BarView {
  /**
   * The label of the play button. "Play again" at the song end gives the icon "replay" (design
   * 2.8).
   */
  readonly playLabel: 'Play' | 'Pause' | 'Play again';
  /**
   * False before the file of the first piece arrives. Then the bar shows no times and no seek bar,
   * because the length is not known.
   */
  readonly pieceShown: boolean;
  /** The current song time, in seconds. */
  readonly songSec: number;
  /** The song length in whole seconds. */
  readonly lengthSec: number;
  /** False while the seek bar cannot seek: before the samples are ready. */
  readonly seekable: boolean;
  readonly muted: boolean;
  /** The position of the volume slider, from 0 to 100. A volume key also moves it (design 2.4). */
  readonly volume: number;
  /** True in Cinematic mode: the "Cinematic camera" toggle is on (design 2.5). */
  readonly cinematicCamera: boolean;
  readonly fullScreen: boolean;
  readonly drawerOpen: boolean;
  /** False while the bar hides during play (design 2.3). */
  readonly shown: boolean;
}

/** The icon of each label of the play button (design 2.8). */
const PLAY_ICONS = {
  Play: 'play',
  Pause: 'pause',
  'Play again': 'replay',
} as const satisfies Readonly<Record<BarView['playLabel'], IconName>>;

/**
 * The time after the end of the tap that showed the hidden bar, after which its controls take the
 * pointer again if no click came, in milliseconds. A long press or a drag gives no click.
 */
const WAKE_END_MS = 500;

/**
 * Creates the speed menu.
 *
 * @param onSpeed The action of a new speed.
 * @returns The `select` element.
 */
function createSpeedMenu(onSpeed: (speed: Speed) => void): HTMLSelectElement {
  const menu = createElement('select', 'speed');
  menu.setAttribute('aria-label', 'Speed');
  for (const speed of SPEEDS) {
    const option = createElement('option', '', speedText(speed));
    option.value = String(speed);
    option.selected = speed === DEFAULT_SPEED;
    menu.append(option);
  }
  menu.addEventListener('change', () => {
    const speed = SPEEDS.find((value) => String(value) === menu.value);
    if (speed !== undefined) {
      onSpeed(speed);
    }
  });
  return menu;
}

/**
 * Creates a range input.
 *
 * @param className The class.
 * @param label The `aria-label`.
 * @param max The largest value.
 * @returns The input.
 */
function createRange(className: string, label: string, max: number): HTMLInputElement {
  const input = createElement('input', className);
  input.type = 'range';
  input.min = '0';
  input.max = String(max);
  input.step = '1';
  input.setAttribute('aria-label', label);
  return input;
}

/**
 * Shows the filled part of a slider: the CSS property `--fill` from 0 to 1 (design 2.8). The
 * track of Chromium and WebKit has no element for the filled part, so `ui.css` paints it with
 * this value. It writes the style only when the value changed.
 *
 * @param input The slider.
 */
function showFill(input: HTMLInputElement): void {
  const range = Number(input.max) - Number(input.min);
  const fill = range > 0 ? (Number(input.value) - Number(input.min)) / range : 0;
  const text = fill.toFixed(4);
  if (input.style.getPropertyValue('--fill') !== text) {
    input.style.setProperty('--fill', text);
  }
}

/**
 * Creates the name of an icon button. It shows only in the "Playback" group of a phone, and a
 * screen reader skips it, because the button has the same `aria-label` (design 2.8).
 *
 * @param text The name.
 * @returns The element.
 */
function createButtonText(text: string): HTMLElement {
  const element = createElement('span', 'button-text', text);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/**
 * The bar at the bottom (design 2.3, 2.8). From left to right: play or pause, the current time,
 * the seek bar, the duration, the speed menu, mute, the volume slider, "Cinematic camera", "Reset
 * view", full screen, and the drawer button.
 */
export class Bar {
  readonly element: HTMLElement;
  readonly #play: HTMLButtonElement;
  readonly #playIcon: SVGSVGElement;
  readonly #time: HTMLElement;
  readonly #seek: HTMLInputElement;
  readonly #length: HTMLElement;
  readonly #speed: HTMLSelectElement;
  readonly #mute: HTMLButtonElement;
  readonly #muteIcon: SVGSVGElement;
  readonly #volume: HTMLInputElement;
  readonly #camera: HTMLButtonElement;
  readonly #reset: HTMLButtonElement;
  readonly #fullScreen: HTMLButtonElement;
  readonly #fullScreenIcon: SVGSVGElement;
  /** The name of the full screen button, which shows in the "Playback" group of a phone. */
  readonly #fullScreenText: HTMLElement;
  readonly #drawer: HTMLButtonElement;
  readonly #tooltips: Tooltips;
  /** True while the pointer drags the seek bar. Then a frame does not move its thumb. */
  #dragging = false;
  #hovered = false;
  /**
   * True from a press on the hidden bar until the click of that tap. Until then, the controls
   * ignore the pointer, so that the tap only shows the bar (design 2.3). The browser finds the
   * target of a tap at its end, after the bar shows.
   */
  #waking = false;
  #wakeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Creates the bar and its controls.
   *
   * @param actions The actions of the controls.
   * @param volume The position of the volume slider at start, from 0 to 100.
   * @param canFullScreen False if the browser has no full screen for the page. Then the full
   *   screen button does not show.
   * @param tooltips The tooltips of the page.
   */
  constructor(actions: BarActions, volume: number, canFullScreen: boolean, tooltips: Tooltips) {
    this.#tooltips = tooltips;
    this.element = createElement('nav', 'bar');
    this.element.setAttribute('aria-label', 'Player controls');

    this.#play = createButton('play', 'Play');
    this.#playIcon = createIcon('play');
    this.#play.append(this.#playIcon);
    this.#play.addEventListener('click', actions.onPlay);

    this.#time = createElement('span', 'time', '0:00');
    this.#seek = createRange('seek', 'Seek', 0);
    this.#seek.value = '0';
    this.#seek.addEventListener('input', () => {
      actions.onSeek(Number(this.#seek.value));
    });
    this.#seek.addEventListener('pointerdown', () => {
      this.#dragging = true;
    });
    this.#seek.addEventListener('change', () => {
      this.#dragging = false;
    });
    window.addEventListener('pointerup', () => {
      this.#dragging = false;
    });
    this.#length = createElement('span', 'time length', '0:00');

    this.#mute = createButton('', 'Mute');
    this.#mute.setAttribute('aria-pressed', 'false');
    this.#muteIcon = createIcon('volume');
    this.#mute.append(this.#muteIcon);
    this.#mute.addEventListener('click', actions.onMute);

    this.#speed = createSpeedMenu(actions.onSpeed);
    const volumeSlider = createRange('volume', 'Volume', 100);
    volumeSlider.value = String(volume);
    showFill(volumeSlider);
    volumeSlider.addEventListener('input', () => {
      showFill(volumeSlider);
      actions.onVolume(Number(volumeSlider.value));
    });
    this.#volume = volumeSlider;

    this.#camera = createButton('camera', 'Cinematic camera');
    this.#camera.setAttribute('aria-pressed', 'false');
    this.#camera.append(createIcon('movie-camera'));
    this.#camera.addEventListener('click', actions.onCamera);

    this.#reset = createButton('reset', 'Reset view');
    this.#reset.append(createIcon('reset-view'), createButtonText('Reset view'));
    this.#reset.addEventListener('click', actions.onResetView);

    this.#fullScreen = createButton('full-screen', 'Full screen');
    this.#fullScreenIcon = createIcon('full-screen');
    this.#fullScreenText = createButtonText('Full screen');
    this.#fullScreen.append(this.#fullScreenIcon, this.#fullScreenText);
    this.#fullScreen.hidden = !canFullScreen;
    this.#fullScreen.addEventListener('click', actions.onFullScreen);

    this.#drawer = createButton('drawer-button', 'Open the drawer');
    this.#drawer.setAttribute('aria-expanded', 'false');
    this.#drawer.append(createIcon('drawer'));
    this.#drawer.addEventListener('click', actions.onDrawer);

    this.element.addEventListener('pointerenter', () => {
      this.#hovered = true;
    });
    this.element.addEventListener('pointerleave', () => {
      this.#hovered = false;
    });
    this.#guardWakingTap();
    this.#addTooltip(this.#play, CONTROL_KEYS.play);
    this.#addTooltip(this.#seek, CONTROL_KEYS.seek);
    this.#addTooltip(this.#speed, null);
    this.#addTooltip(this.#mute, CONTROL_KEYS.mute);
    this.#addTooltip(this.#volume, CONTROL_KEYS.volume);
    this.#addTooltip(this.#camera, CONTROL_KEYS.camera);
    this.#addTooltip(this.#reset, null);
    this.#addTooltip(this.#fullScreen, CONTROL_KEYS.fullScreen);
    this.#addTooltip(this.#drawer, null);

    this.element.append(
      this.#play,
      this.#time,
      this.#seek,
      this.#length,
      this.#speed,
      this.#mute,
      this.#volume,
      this.#camera,
      this.#reset,
      this.#fullScreen,
      this.#drawer,
    );
  }

  /**
   * Keeps the controls inert for the full tap that shows the hidden bar (design 2.3). A click of
   * that tap on the bar stops in the capture phase. The guard ends at that click, or
   * {@link WAKE_END_MS} after the end of the tap.
   */
  #guardWakingTap(): void {
    this.element.addEventListener('pointerdown', () => {
      if (this.element.classList.contains('is-hidden')) {
        clearTimeout(this.#wakeTimer);
        this.#setWaking(true);
      }
    });
    const endTap = (): void => {
      if (this.#waking) {
        clearTimeout(this.#wakeTimer);
        this.#wakeTimer = setTimeout(() => {
          this.#setWaking(false);
        }, WAKE_END_MS);
      }
    };
    window.addEventListener('pointerup', endTap);
    window.addEventListener('pointercancel', endTap);
    window.addEventListener(
      'click',
      (event) => {
        if (!this.#waking) {
          return;
        }
        if (event.target instanceof Node && this.element.contains(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
        clearTimeout(this.#wakeTimer);
        this.#setWaking(false);
      },
      true,
    );
  }

  /**
   * Gives a control of the bar a tooltip with its current label and its key (design 2.8), and
   * names the key in `aria-keyshortcuts`.
   *
   * @param control The control.
   * @param key The key of the control, or `null` for none.
   */
  #addTooltip(control: HTMLElement, key: ControlKey | null): void {
    if (key) {
      control.setAttribute('aria-keyshortcuts', key.shortcuts);
    }
    this.#tooltips.attach(control, () =>
      tooltipText(control.getAttribute('aria-label') ?? '', key),
    );
  }

  /**
   * Starts or ends the guard of the tap that shows the hidden bar.
   *
   * @param waking True while the controls ignore the pointer.
   */
  #setWaking(waking: boolean): void {
    this.#waking = waking;
    this.element.classList.toggle('is-waking', waking);
  }

  /**
   * Moves the speed menu, the volume slider, "Reset view", and full screen into the "Playback"
   * group of the settings on a phone, or back into the bar (design 2.8). "Cinematic camera" stays
   * in the bar. The page has one control of each kind, so the two places never differ. In the
   * group, each control has a visible label.
   *
   * @param slots The places of the "Playback" group, or `null` for the bar.
   */
  placePlayback(slots: PlaybackSlots | null): void {
    if (slots) {
      slots.speed.append(this.#speed);
      slots.volume.append(this.#volume);
      slots.buttons.append(this.#reset, this.#fullScreen);
    } else {
      this.#length.after(this.#speed);
      this.#mute.after(this.#volume);
      this.#camera.after(this.#reset, this.#fullScreen);
    }
  }

  /** Moves the keyboard focus to the play button. */
  focusPlay(): void {
    this.#play.focus();
  }

  /** Moves the keyboard focus to the drawer button. */
  focusDrawerButton(): void {
    this.#drawer.focus();
  }

  /** True while the pointer is over the bar. */
  get hovered(): boolean {
    return this.#hovered;
  }

  /**
   * True while a control of the bar has the keyboard focus. A focus from a click or a tap does not
   * count, so that the bar still hides during play (design 2.3).
   */
  get focused(): boolean {
    return this.element.querySelector(':focus-visible') !== null;
  }

  /**
   * Shows the state of one frame. It writes the DOM only where a value changed.
   *
   * @param view The values of the frame.
   */
  update(view: BarView): void {
    setAttribute(this.#play, 'aria-label', view.playLabel);
    if (this.#playIcon.dataset['shown'] !== view.playLabel) {
      this.#playIcon.dataset['shown'] = view.playLabel;
      setIcon(this.#playIcon, PLAY_ICONS[view.playLabel]);
    }

    const current = Math.min(Math.max(0, Math.floor(view.songSec)), view.lengthSec);
    setText(this.#time, clockText(current));
    setText(this.#length, clockText(view.lengthSec));
    setAttribute(this.#seek, 'max', String(view.lengthSec));
    if (!this.#dragging) {
      if (this.#seek.value !== String(current)) {
        this.#seek.value = String(current);
      }
      setAttribute(this.#seek, 'aria-valuetext', seekValueText(current, view.lengthSec));
    } else {
      const dragged = Number(this.#seek.value);
      setText(this.#time, clockText(dragged));
      setAttribute(this.#seek, 'aria-valuetext', seekValueText(dragged, view.lengthSec));
    }
    this.#seek.disabled = !view.seekable;
    showFill(this.#seek);
    this.element.classList.toggle('is-empty', !view.pieceShown);

    setAttribute(this.#mute, 'aria-pressed', String(view.muted));
    if (this.#volume.value !== String(view.volume)) {
      this.#volume.value = String(view.volume);
      showFill(this.#volume);
    }
    if (this.#muteIcon.dataset['shown'] !== String(view.muted)) {
      this.#muteIcon.dataset['shown'] = String(view.muted);
      setIcon(this.#muteIcon, view.muted ? 'volume-off' : 'volume');
    }

    setAttribute(this.#camera, 'aria-pressed', String(view.cinematicCamera));

    setAttribute(
      this.#fullScreen,
      'aria-label',
      view.fullScreen ? 'Exit full screen' : 'Full screen',
    );
    setText(this.#fullScreenText, view.fullScreen ? 'Exit full screen' : 'Full screen');
    if (this.#fullScreenIcon.dataset['shown'] !== String(view.fullScreen)) {
      this.#fullScreenIcon.dataset['shown'] = String(view.fullScreen);
      setIcon(this.#fullScreenIcon, view.fullScreen ? 'exit-full-screen' : 'full-screen');
    }

    setAttribute(this.#drawer, 'aria-expanded', String(view.drawerOpen));
    setAttribute(
      this.#drawer,
      'aria-label',
      view.drawerOpen ? 'Close the drawer' : 'Open the drawer',
    );
    this.element.classList.toggle('is-hidden', !view.shown);
    if (view.shown) {
      this.#tooltips.refresh();
    } else {
      this.#tooltips.hide();
    }
  }
}
