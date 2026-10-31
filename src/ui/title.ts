import { APP_NAME, REPOSITORY_LABEL, REPOSITORY_TEXT, REPOSITORY_URL } from '../app/page-title.ts';
import { createElement, setText } from './dom.ts';
import { createIcon, createWordmark } from './icons.ts';
import { LINE_MARGIN, LOGO_BACKDROP_LIMIT, TEXT_BACKDROP_LIMIT } from './title-shade.ts';
import type { TitleLine } from './title-shade.ts';

/**
 * Creates the logo (design 2.8): the gold paw and the wordmark "Zoophony". It is plain content, no
 * control. The wordmark is the heading of the page (`h1`), with the name of the app as its
 * accessible name. A screen reader reads the name and skips the paw.
 *
 * @returns The logo element.
 */
function createLogo(): HTMLElement {
  const logo = createElement('div', 'logo');
  const name = createElement('h1', 'name');
  name.append(createWordmark(APP_NAME));
  logo.append(createIcon('paw'), name);
  return logo;
}

/**
 * Creates the link to the repository of the app on GitHub (design 2.8): an outlined pill with the
 * GitHub mark and the text "Open source", which opens the repository in a new tab. The pill sets
 * the link apart from the name of the logo. The page loads nothing from GitHub, and the link sends
 * no referrer.
 *
 * @returns The link.
 */
function createRepositoryLink(): HTMLAnchorElement {
  const link = createElement('a', 'github');
  link.href = REPOSITORY_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${REPOSITORY_TEXT}: ${REPOSITORY_LABEL}`);
  link.append(createIcon('github'), createElement('span', '', REPOSITORY_TEXT));
  return link;
}

/**
 * The title at the top left (2.8): the logo with the link to GitHub, then the piece title (`h2`)
 * in a serif (24 px to 36 px) and the composer. It is a polite live region, so that a screen reader
 * reads the current piece when it changes. The logo does not change, so the region does not read
 * it again.
 */
export class Title {
  /** The `header` element of the title. */
  readonly element: HTMLElement;
  /** The link to the repository on GitHub, after the name in the logo line. */
  readonly repositoryLink = createRepositoryLink();
  /** The logo above the piece title. */
  readonly #logo: HTMLElement;
  /** The piece title. */
  readonly #title: HTMLElement;
  /** The composer line. */
  readonly #composer: HTMLElement;
  /** The range that measures the text of a line. */
  readonly #range = document.createRange();
  /** True while the pointer is over the link to the repository, the only control of the title. */
  #hovered = false;
  /** Each line with the lightest backdrop at which its text keeps 4.5:1 with no shade. */
  readonly #lines: readonly (readonly [HTMLElement, number])[];
  /** The level of the shade of each line, from 0 to 1, or NaN before the first level. */
  readonly #shadeLevels = [Number.NaN, Number.NaN, Number.NaN];

  /**
   * Creates the title. It keeps the static title of `index.html` and its text (design 2.8, 7.2):
   * the browser paints the title lines of the default demo with the first paint, and does not
   * paint them again. The logo of the app replaces the static logo, because only the logo of the
   * app has the link to the repository.
   *
   * @param page The static title of `index.html`, or `null` for a new title with no text.
   */
  constructor(page: HTMLElement | null) {
    this.element = page ?? createElement('header', 'title');
    this.element.setAttribute('aria-live', 'polite');
    this.#logo = createLogo();
    this.#logo.append(this.repositoryLink);
    const pageLogo = this.element.querySelector(':scope > .logo');
    if (pageLogo) {
      pageLogo.replaceWith(this.#logo);
    } else {
      this.element.prepend(this.#logo);
    }
    this.#title = this.element.querySelector(':scope > h2') ?? createElement('h2');
    this.#composer = this.element.querySelector(':scope > p') ?? createElement('p');
    if (!this.#title.isConnected || !this.#composer.isConnected) {
      this.element.append(this.#title, this.#composer);
    }
    this.#lines = [
      [this.#logo, LOGO_BACKDROP_LIMIT],
      [this.#title, TEXT_BACKDROP_LIMIT],
      [this.#composer, TEXT_BACKDROP_LIMIT],
    ];
    this.repositoryLink.addEventListener('pointerenter', () => {
      this.#hovered = true;
    });
    this.repositoryLink.addEventListener('pointerleave', () => {
      this.#hovered = false;
    });
  }

  /** True while the pointer is over the link to the repository. */
  get hovered(): boolean {
    return this.#hovered;
  }

  /** True while the link to the repository shows the focus of the keyboard (`:focus-visible`). */
  get focusShown(): boolean {
    return this.repositoryLink.matches(':focus-visible');
  }

  /**
   * The lines of the title, for their shades (design 2.8): the logo, the piece title, and the
   * composer. Each has the box of its text with a margin of 4 px, and the lightest backdrop at
   * which its color keeps 4.5:1 with no shade. Each read measures the layout.
   */
  get lines(): TitleLine[] {
    return this.#lines.map(([element, limit]) => {
      if (element.hidden) {
        return { box: null, limit };
      }

      this.#range.selectNodeContents(element);
      const text = this.#range.getBoundingClientRect();
      if (text.width === 0 || text.height === 0) {
        return { box: null, limit };
      }

      const box = {
        left: text.left - LINE_MARGIN,
        top: text.top - LINE_MARGIN,
        right: text.right + LINE_MARGIN,
        bottom: text.bottom + LINE_MARGIN,
      };
      return { box, limit };
    });
  }

  /**
   * Shows the title of a piece.
   *
   * @param title The piece title.
   * @param composer The composer, or '' for none.
   */
  show(title: string, composer: string): void {
    setText(this.#title, title);
    setText(this.#composer, composer);
    this.#composer.hidden = composer === '';
  }

  /**
   * Shows the shade behind each line of the title at a level: the level multiplies the alpha of
   * `--title-shade` (design 2.8). It writes the DOM only when a level changes by 0.01 or more.
   *
   * @param levels The level of each line in the order of {@link Title.lines}, from 0 (no shade)
   *   to 1 (the full shade). A missing level is 0.
   */
  showShade(levels: readonly number[]): void {
    for (const [i, [element]] of this.#lines.entries()) {
      const level = Math.round((levels[i] ?? 0) * 100) / 100;
      if (level === this.#shadeLevels[i]) {
        continue;
      }

      this.#shadeLevels[i] = level;
      element.style.setProperty('--title-shade-level', String(level));
    }
  }
}
