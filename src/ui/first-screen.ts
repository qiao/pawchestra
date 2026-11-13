import { INTRO_TEXT, SELECT_PIECE_TEXT, WATCH_FILM_TEXT } from '../app/play-control.ts';
import type { ScreenBox } from '../shots/frame.ts';
import { createButton, createElement, setAttribute, setText } from './dom.ts';
import { createIcon, setIcon } from './icons.ts';

/** The radius of the load ring in its view box of 84 × 84. */
const RING_RADIUS = 40;

/** The space between the play button and the outer edge of its load ring, in CSS pixels. */
const RING_MARGIN = 6;

/** The length of the load ring. */
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The namespace of SVG elements. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** What the first screen shows in one frame. */
export interface FirstScreenView {
  readonly shown: boolean;
  /** True while the samples load. Then the ring shows the progress. */
  readonly loading: boolean;
  /**
   * True after a click on play during the load: the piece starts when the samples are ready.
   * Then the ring turns, and the button shows "Pause", so that a second click cancels the wait.
   */
  readonly waiting: boolean;
  /**
   * True until the bytes of the samples pass the short part of the ring that turns (design 2.8).
   */
  readonly pending: boolean;
  /**
   * True until the first play of the session: the line about the app, and the button that opens
   * the demo list, show below the load text (design 2.8).
   */
  readonly intro: boolean;
  /** The label of the play button, as the play button of the bar (design 2.2). */
  readonly playLabel: 'Play' | 'Pause';
  /** The part of the ring that shows the progress, from 0 to 1. */
  readonly loadShare: number;
  /** The load text, or '' for none. A line break separates two lines. */
  readonly loadText: string;
}

/**
 * Creates one circle of the load ring.
 *
 * @param className The class of the circle.
 * @returns The circle.
 */
function createRingCircle(className: string): SVGCircleElement {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', className);
  circle.setAttribute('cx', '42');
  circle.setAttribute('cy', '42');
  circle.setAttribute('r', String(RING_RADIUS));
  return circle;
}

/**
 * The first screen (design 2.2, 2.8): a round play button of 72 px in the middle of the stage.
 * While the samples load, a ring around the button shows the progress, and a label below it shows
 * the load text. A polite live region reads the load text (2.8). Until the first play of the
 * session, a line tells what the app does, a text button starts the piece as a film, and a text
 * button opens the demo list.
 */
export class FirstScreen {
  readonly element: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #icon: SVGSVGElement;
  readonly #ring: SVGSVGElement;
  readonly #done: SVGCircleElement;
  readonly #status: HTMLElement;
  readonly #intro: HTMLElement;
  readonly #focusAfterHide: () => void;

  /**
   * Creates the first screen.
   *
   * @param onPlay The action of a click on the play button.
   * @param onSelectPiece The action of a click on the button that opens the demo list.
   * @param onWatchFilm The action of a click on "Watch as a film": the piece starts in Cinematic
   *   mode.
   * @param focusAfterHide Gets the keyboard focus when the first screen hides with the keyboard
   *   focus in it.
   */
  constructor(
    onPlay: () => void,
    onSelectPiece: () => void,
    onWatchFilm: () => void,
    focusAfterHide: () => void,
  ) {
    this.#focusAfterHide = focusAfterHide;
    this.element = createElement('div', 'first-screen');
    const button = createButton('play', 'Play');
    button.addEventListener('click', onPlay);
    this.#button = button;
    this.#icon = createIcon('play', 'icon');
    this.#ring = document.createElementNS(SVG_NS, 'svg');
    this.#ring.setAttribute('class', 'ring');
    this.#ring.setAttribute('viewBox', '0 0 84 84');
    this.#ring.setAttribute('aria-hidden', 'true');
    this.#done = createRingCircle('done');
    this.#done.setAttribute('stroke-dasharray', RING_LENGTH.toFixed(1));
    this.#done.setAttribute('stroke-dashoffset', RING_LENGTH.toFixed(1));
    this.#ring.append(createRingCircle('track'), this.#done);
    button.append(this.#ring, this.#icon);
    this.#status = createElement('div', 'status');
    this.#status.setAttribute('aria-live', 'polite');
    this.#intro = createElement('div', 'intro');
    const line = createElement('p', '', INTRO_TEXT);
    const selectPiece = createButton('select-piece', '');
    selectPiece.textContent = SELECT_PIECE_TEXT;
    selectPiece.addEventListener('click', onSelectPiece);
    const watchFilm = createButton('select-piece watch-film', '');
    watchFilm.textContent = WATCH_FILM_TEXT;
    watchFilm.addEventListener('click', onWatchFilm);
    const actions = createElement('div', 'intro-actions');
    actions.append(watchFilm, selectPiece);
    this.#intro.append(line, actions);
    this.element.append(button, this.#status, this.#intro);
  }

  /**
   * The box of the load ring around the play button on the page, in CSS pixels, or `null` while
   * the play button does not show (design 2.8). The ring is 6 px larger than the button on each
   * side. A play button in a gap that is too narrow has no visibility, and gives `null`.
   */
  get ringBox(): ScreenBox | null {
    if (this.element.hidden || !this.#button.checkVisibility({ visibilityProperty: true })) {
      return null;
    }
    const box = this.#button.getBoundingClientRect();
    return {
      left: box.left - RING_MARGIN,
      top: box.top - RING_MARGIN,
      right: box.right + RING_MARGIN,
      bottom: box.bottom + RING_MARGIN,
    };
  }

  /**
   * Shows the state of one frame. It writes the DOM only where a value changed. When the first
   * screen hides with the keyboard focus on its play button, the focus goes to
   * `focusAfterHide()` (design 2.8). A focus from a pointer goes to the page, so that the bar can
   * hide during play.
   *
   * @param view The values of the frame.
   */
  update(view: FirstScreenView): void {
    if (!view.shown && !this.element.hidden) {
      const keyboardFocus = this.element.querySelector(':focus-visible') !== null;
      this.element.hidden = true;
      if (keyboardFocus) {
        this.#focusAfterHide();
      }
    }
    this.element.hidden = !view.shown;
    this.element.classList.toggle('is-waiting', view.waiting);
    this.element.classList.toggle('is-pending', view.pending);
    this.#intro.hidden = !view.intro;
    setAttribute(this.#button, 'aria-label', view.playLabel);
    if (this.#icon.dataset['shown'] !== view.playLabel) {
      this.#icon.dataset['shown'] = view.playLabel;
      setIcon(this.#icon, view.playLabel === 'Play' ? 'play' : 'pause');
    }
    this.#ring.style.visibility = view.loading ? '' : 'hidden';
    const offset = (RING_LENGTH * (1 - view.loadShare)).toFixed(1);
    setAttribute(this.#done, 'stroke-dashoffset', offset);
    setText(this.#status, view.loading ? view.loadText : '');
  }
}
