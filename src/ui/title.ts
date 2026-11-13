import { APP_NAME, REPOSITORY_LABEL, REPOSITORY_TEXT, REPOSITORY_URL } from '../app/page-title.ts';
import { createElement, setText } from './dom.ts';
import { createIcon, createWordmark } from './icons.ts';

/**
 * Creates the logo (design 2.8): the gold paw and the wordmark "Pawchestra". It is plain content, no
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

/** The class of the root element that names the font Fraunces for the titles (`ui/ui.css`). */
const TITLE_FONT_CLASS = 'title-font';

/**
 * The title at the top left (2.8): the logo with the link to GitHub, then the piece title (`h2`)
 * in Fraunces (24 px to 36 px) and the composer. It is a polite live region, so that a screen
 * reader reads the current piece when it changes. The logo does not change, so the region does not
 * read it again.
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
  /** True while the pointer is over the link to the repository, the only control of the title. */
  #hovered = false;

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
    this.repositoryLink.addEventListener('pointerenter', () => {
      this.#hovered = true;
    });
    this.repositoryLink.addEventListener('pointerleave', () => {
      this.#hovered = false;
    });
  }

  /**
   * Loads the brand font of the piece title, the title card, and the end card (design 2.8, 7.2).
   * The app calls it where the audio code loads: after the first frame of the first built piece.
   * The timeout adds the class in a task after that frame. The browser then loads the font, and
   * swaps it for the fallback face when it is ready.
   */
  loadFont(): void {
    setTimeout(() => {
      document.documentElement.classList.add(TITLE_FONT_CLASS);
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
}
