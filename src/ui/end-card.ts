import { PLAY_AGAIN_TEXT, nextText } from '../app/end-card.ts';
import type { EndCardView } from '../app/end-card.ts';
import { createButton, createElement, setAttribute, setText } from './dom.ts';
import { createIcon } from './icons.ts';

/** The namespace of SVG elements. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The radius of the countdown ring in its view box of 20 × 20. */
const RING_RADIUS = 8;

/** The length of the countdown ring. */
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The actions of the buttons of the end card. */
export interface EndCardActions {
  /** A click on "Play again". */
  readonly onPlayAgain: () => void;
  /** A click on "Next: {title}". */
  readonly onNext: () => void;
}

/**
 * The end card (design 2.8): at the song end, the composer, the piece title, "Play again", and
 * "Next: {title}" with a ring that counts down to the next demo. A tap or a key stops the count,
 * and the ring then goes. A file of the user has no next demo, so the card shows only "Play
 * again".
 */
export class EndCard {
  /** The element of the card. */
  readonly element: HTMLElement;
  readonly #composer: HTMLElement;
  readonly #title: HTMLElement;
  readonly #next: HTMLButtonElement;
  readonly #nextText: HTMLElement;
  /** The countdown ring of the button "Next". */
  readonly #ring: SVGSVGElement;
  readonly #ringDone: SVGCircleElement;
  /** The opacity that the page shows, or NaN before the first frame. */
  #level = Number.NaN;

  /**
   * Creates the card, hidden.
   *
   * @param actions The actions of the buttons.
   */
  constructor(actions: EndCardActions) {
    this.element = createElement('section', 'end-card');
    this.element.setAttribute('aria-label', 'End of the piece');
    this.#composer = createElement('p', 'title-card-composer');
    this.#title = createElement('p', 'title-card-title');
    const again = createButton('end-again', PLAY_AGAIN_TEXT);
    again.append(createIcon('replay'), PLAY_AGAIN_TEXT);
    again.addEventListener('click', actions.onPlayAgain);
    this.#next = createButton('end-next', '');
    this.#ring = document.createElementNS(SVG_NS, 'svg');
    this.#ring.setAttribute('class', 'end-ring');
    this.#ring.setAttribute('viewBox', '0 0 20 20');
    this.#ring.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(SVG_NS, 'circle');
    this.#ringDone = document.createElementNS(SVG_NS, 'circle');
    for (const [circle, name] of [
      [track, 'track'],
      [this.#ringDone, 'done'],
    ] as const) {
      circle.setAttribute('class', name);
      circle.setAttribute('cx', '10');
      circle.setAttribute('cy', '10');
      circle.setAttribute('r', String(RING_RADIUS));
    }
    this.#ringDone.setAttribute('stroke-dasharray', RING_LENGTH.toFixed(2));
    this.#ring.append(track, this.#ringDone);
    this.#nextText = createElement('span', 'end-next-text');
    this.#next.append(this.#ring, this.#nextText);
    this.#next.addEventListener('click', actions.onNext);
    const buttons = createElement('div', 'end-buttons');
    buttons.append(again, this.#next);
    this.element.append(
      this.#composer,
      createElement('span', 'title-card-rule'),
      this.#title,
      buttons,
    );
    this.show({ level: 0, countShare: 0 }, false);
  }

  /**
   * Writes the piece of the card and its next demo.
   *
   * @param title The piece title.
   * @param composer The composer, or '' for none.
   * @param next The title of the next demo, or `null` for none.
   */
  setPiece(title: string, composer: string, next: string | null): void {
    setText(this.#title, title);
    setText(this.#composer, composer);
    this.#composer.hidden = composer === '';
    this.#next.hidden = next === null;
    const text = next === null ? '' : nextText(next);
    setText(this.#nextText, text);
    setAttribute(this.#next, 'aria-label', text);
  }

  /**
   * Shows the card in a frame. It writes the DOM only where a value changed.
   *
   * @param view The opacity and the part of the countdown that passed, from `endCardView()`.
   * @param counting True while the countdown runs. A tap or a key stops it.
   */
  show(view: EndCardView, counting: boolean): void {
    const rounded = Math.round(view.level * 100) / 100;
    if (rounded !== this.#level) {
      this.#level = rounded;
      this.element.hidden = rounded <= 0;
      this.element.style.setProperty('--card-level', String(rounded));
    }
    const ring = counting ? '' : 'hidden';
    if (this.#ring.style.visibility !== ring) {
      this.#ring.style.visibility = ring;
    }
    const offset = (RING_LENGTH * view.countShare).toFixed(1);
    setAttribute(this.#ringDone, 'stroke-dashoffset', offset);
  }
}
