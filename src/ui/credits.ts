import {
  AUTHOR_LINK,
  AUTHOR_TEXT,
  COPYRIGHT_TEXT,
  HALL_REVERB_CREDITS,
  LICENSES_TEXT,
  NOW_PLAYING_LABEL,
  OTHER_PIECES_LABEL,
  SOUNDS_LABEL,
  SOUND_CREDITS,
  creditTexts,
} from '../app/credits.ts';
import type { PieceCredit, SoundCredit } from '../app/credits.ts';
import type { CreditLink, DemoId } from '../app/demos.ts';
import { createElement } from './dom.ts';
import { createIcon } from './icons.ts';

/**
 * The content of the credits dialog (design 2.8, 7.3, 8.1), in the layout of the end credits of a
 * film: the title card with the author, the group "Now playing" with the current demo, the group
 * "Sounds" with the SoundFont credits and the hall reverb credits, the group "Other pieces" with
 * the sources of the other demos, and the end card with the copyright line and the link
 * "Third-party licenses".
 */
export class Credits {
  /** The element that holds the credits. */
  readonly element: HTMLElement;
  /** The group "Now playing", which a file of the user hides. */
  readonly #nowPlaying: HTMLElement;
  /** The credit block of the current demo, in the group "Now playing". */
  readonly #current: HTMLElement;
  /** The list of the credit blocks of the other demos. */
  readonly #otherPieces: HTMLUListElement;

  /**
   * Creates the credits with no current demo.
   *
   * @param licensesHref The URL of the third-party license file.
   */
  constructor(licensesHref: string) {
    this.element = createElement('div', 'credits');

    const card = createElement('div', 'credits-card');
    const name = createElement('p', 'credits-author');
    name.append(newTabLink(AUTHOR_LINK.text, AUTHOR_LINK.href));
    card.append(
      createElement('p', 'credits-app', 'Pawchestra'),
      createElement('p', 'credits-role', AUTHOR_TEXT),
      name,
    );

    this.#current = createElement('div', 'piece now');
    this.#nowPlaying = creditGroup(NOW_PLAYING_LABEL, this.#current);

    const sounds = createElement('dl', 'credit-rows');
    sounds.append(...[...SOUND_CREDITS, ...HALL_REVERB_CREDITS].map(soundRow));

    this.#otherPieces = createElement('ul', 'pieces');
    this.#otherPieces.setAttribute('aria-label', OTHER_PIECES_LABEL);

    const end = createElement('div', 'credits-end');
    const licenses = createElement('p');
    licenses.append(newTabLink(LICENSES_TEXT, licensesHref));
    end.append(createIcon('paw'), createElement('p', '', COPYRIGHT_TEXT), licenses);

    this.element.append(
      card,
      this.#nowPlaying,
      creditGroup(SOUNDS_LABEL, sounds),
      creditGroup(OTHER_PIECES_LABEL, this.#otherPieces),
      end,
    );
    this.show(null);
  }

  /**
   * Shows the credits of a piece.
   *
   * @param current The current demo, or `null` for a file of the user.
   */
  show(current: DemoId | null): void {
    const texts = creditTexts(current);
    this.#nowPlaying.hidden = texts.current === null;
    if (texts.current) {
      fillPiece(this.#current, texts.current);
    }
    this.#otherPieces.replaceChildren(
      ...texts.otherDemos.map((piece) => fillPiece(createElement('li', 'piece'), piece)),
    );
  }
}

/**
 * Makes a group of the credits: a centered heading between two lines, and its content.
 *
 * @param label The text of the heading.
 * @param content The content of the group.
 * @returns The group.
 */
function creditGroup(label: string, content: HTMLElement): HTMLElement {
  const group = createElement('section', 'credits-group');
  group.append(createElement('h3', '', label), content);
  return group;
}

/**
 * Writes the credit block of a piece into an element: the title, the composer, and the source,
 * with the links of a CC BY file after the source.
 *
 * @param element The element of the block.
 * @param piece The texts of the block.
 * @returns The element.
 */
function fillPiece<T extends HTMLElement>(element: T, piece: PieceCredit): T {
  const source = createElement('small', '', piece.credit);
  if (piece.links) {
    appendLinks(source, piece.links);
  }
  element.replaceChildren(
    createElement('span', 'piece-title', piece.title),
    createElement('span', 'piece-composer', piece.composer),
    source,
  );
  return element;
}

/**
 * Makes a row of the group "Sounds": the name of the source in the left column, and its credit
 * line with its links, such as "… Source, CC BY 4.0.", in the right column.
 *
 * @param credit The row.
 * @returns The row.
 */
function soundRow(credit: SoundCredit): HTMLDivElement {
  const row = createElement('div', 'credit-row');
  const line = createElement('dd', '', credit.credit);
  appendLinks(line, credit.links);
  row.append(createElement('dt', '', credit.title), line);
  return row;
}

/**
 * Appends links to a credit line, such as " Source, CC BY 4.0.".
 *
 * @param line The element of the credit line, which holds its text.
 * @param links The links.
 */
function appendLinks(line: HTMLElement, links: readonly CreditLink[]): void {
  line.append(' ');
  links.forEach((link, index) => {
    line.append(index > 0 ? ', ' : '', newTabLink(link.text, link.href));
  });
  line.append('.');
}

/**
 * Makes a link that opens in a new tab, so that the music does not stop.
 *
 * @param text The text of the link.
 * @param href The URL.
 * @returns The link.
 */
function newTabLink(text: string, href: string): HTMLAnchorElement {
  const link = createElement('a', '', text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}
