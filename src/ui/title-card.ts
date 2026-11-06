import { createElement, setText } from './dom.ts';

/**
 * The title card of Cinematic mode (design 2.8): the composer in spaced capitals, a short gold
 * rule, and the piece title in the serif, in the lower part of the frame at the song start, as
 * the main title of a film. A screen reader skips it, because the live region of the title reads
 * the same piece. It takes no pointer.
 */
export class TitleCard {
  /** The element of the card. */
  readonly element: HTMLElement;
  /** The composer line. */
  readonly #composer: HTMLElement;
  /** The piece title. */
  readonly #title: HTMLElement;
  /** The opacity that the page shows, or NaN before the first frame. */
  #level = Number.NaN;

  /** Creates the card, hidden. */
  constructor() {
    this.element = createElement('div', 'title-card');
    this.element.setAttribute('aria-hidden', 'true');
    this.#composer = createElement('p', 'title-card-composer');
    this.#title = createElement('p', 'title-card-title');
    this.element.append(this.#composer, createElement('span', 'title-card-rule'), this.#title);
    this.show(0);
  }

  /**
   * Writes the piece of the card.
   *
   * @param title The piece title.
   * @param composer The composer, or '' for none.
   */
  setPiece(title: string, composer: string): void {
    setText(this.#title, title);
    setText(this.#composer, composer);
    this.#composer.hidden = composer === '';
  }

  /**
   * Shows the card at an opacity (`titleCardLevel()` of `app/title-card.ts`). It writes the DOM
   * only when the opacity changes by 0.01 or more.
   *
   * @param level The opacity, from 0 to 1.
   */
  show(level: number): void {
    const rounded = Math.round(level * 100) / 100;
    if (rounded === this.#level) {
      return;
    }

    this.#level = rounded;
    this.element.hidden = rounded <= 0;
    this.element.style.setProperty('--card-level', String(rounded));
  }
}
