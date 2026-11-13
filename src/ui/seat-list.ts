import type { SeatFlag, SeatFlags } from '../app/seat-flags.ts';
import { NO_FLAGS } from '../app/seat-flags.ts';
import type { SeatRowText } from '../app/seat-text.ts';
import { createButton, createElement, setAttribute } from './dom.ts';
import type { Tooltips } from './tooltip.ts';

/**
 * The least level at which a dot is full with reduced motion, where the dot is small or full with
 * no fade (design 2.8). The dot then stays full for nearly all of its fade of 0.3 s, so that
 * short notes do not make it flicker.
 */
const GLOW_ON = 0.05;

/** The least change of a level that the dot shows. A frame writes the DOM only on a change. */
const GLOW_STEP = 0.01;

/** The controls of one row of the seat list. */
interface SeatRow {
  /** The row. */
  readonly item: HTMLLIElement;
  /** The dot in the fur color, which grows and glows while the seat plays. */
  readonly dot: HTMLSpanElement;
  /** The button "M". */
  readonly mute: HTMLButtonElement;
  /** The button "S". */
  readonly solo: HTMLButtonElement;
}

/**
 * Creates a toggle button of a seat row: "M" (mute) or "S" (solo).
 *
 * @param text The text of the button.
 * @param label The `aria-label`, for example "Mute Violins 1".
 * @param onClick The action of a click.
 * @returns The button.
 */
function createToggle(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = createButton('toggle', label);
  button.textContent = text;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', onClick);
  return button;
}

/**
 * The seat list of the drawer (design 2.3, 2.8): one row for each seat, with a dot in the fur
 * color of the species, the seat name, the animals, the source line for a screen reader, and the
 * toggle buttons "M" and "S". A silent seat shows dim text. The tab "Seats" of the drawer holds it.
 */
export class SeatList {
  /** The list of the rows. */
  readonly element: HTMLUListElement;
  readonly #onFlag: (seatIndex: number, flag: SeatFlag) => void;
  readonly #tooltips: Tooltips;
  readonly #keepFocus: () => void;
  #rows: SeatRow[] = [];
  /** The level of the dot that each row shows, or -1 before the first frame. */
  #shown = new Float32Array(0);

  /**
   * Creates the list with no rows.
   *
   * @param onFlag The action of a click on a mute or a solo button.
   * @param tooltips The tooltips of the page. The buttons "M" and "S" show their labels in them.
   * @param keepFocus Gives the focus to an element near the list, when a new piece removes the
   *   row with the focus.
   */
  constructor(
    onFlag: (seatIndex: number, flag: SeatFlag) => void,
    tooltips: Tooltips,
    keepFocus: () => void,
  ) {
    this.#onFlag = onFlag;
    this.#tooltips = tooltips;
    this.#keepFocus = keepFocus;
    this.element = createElement('ul', 'list');
    this.element.setAttribute('aria-label', 'Seats');
  }

  /**
   * Shows the rows of a new piece, with no mute and no solo (design 6.6). When a row of the old
   * piece held the focus, the tab "Seats" gets it, so that the focus stays near the seat list
   * (design 2.8).
   *
   * @param rows The texts of each seat, from `seatRows()`.
   */
  show(rows: readonly SeatRowText[]): void {
    const hadFocus = this.element.contains(document.activeElement);
    this.#rows = rows.map((row, seatIndex) => {
      const item = createElement('li', 'seat');
      const dot = createElement('span', row.color ? 'dot' : 'dot no-color');
      if (row.color) {
        dot.style.background = row.color;
      }
      if (row.ring) {
        dot.style.setProperty('--ring', row.ring);
      }
      const name = createElement('span', 'name', row.name);
      name.append(
        createElement('small', '', row.animals),
        createElement('small', 'source', row.source),
      );
      const mute = createToggle('M', `Mute ${row.name}`, () => {
        this.#onFlag(seatIndex, 'muted');
      });
      const solo = createToggle('S', `Solo ${row.name}`, () => {
        this.#onFlag(seatIndex, 'soloed');
      });
      for (const toggle of [mute, solo]) {
        this.#tooltips.attach(toggle, () => toggle.getAttribute('aria-label') ?? '');
      }
      item.append(dot, name, mute, solo);
      return { item, dot, mute, solo };
    });
    this.#shown = new Float32Array(this.#rows.length).fill(-1);
    this.element.replaceChildren(...this.#rows.map((row) => row.item));
    if (hadFocus) {
      this.#keepFocus();
    }
  }

  /**
   * Shows the flags of the seats, and dims the silent seats.
   *
   * @param flags The flags of each seat. A missing entry has no flag.
   * @param audible True for each seat that sounds.
   */
  update(flags: readonly SeatFlags[], audible: readonly boolean[]): void {
    for (const [i, row] of this.#rows.entries()) {
      const seat = flags[i] ?? NO_FLAGS;
      setAttribute(row.mute, 'aria-pressed', String(seat.muted));
      setAttribute(row.solo, 'aria-pressed', String(seat.soloed));
      row.item.classList.toggle('silent', audible[i] === false);
    }
  }

  /**
   * Grows the dot of each seat that plays (design 2.8). The level sets the opacity, the size, and
   * the glow of the dot through `--glow`, and the class `playing` makes the dot full with reduced
   * motion. The dot grows only between the start and the end of the piece.
   *
   * @param levels The level of each seat, from 0 to 1, from `seatLevels()`.
   * @param inPiece True while the song time is after the start and before the end of the piece.
   */
  showLevels(levels: Float32Array, inPiece: boolean): void {
    for (const [i, row] of this.#rows.entries()) {
      const level = inPiece ? (levels[i] ?? 0) : 0;
      const shown = this.#shown[i] ?? -1;
      if (Math.abs(level - shown) < GLOW_STEP && (level > 0 || shown === 0)) {
        continue;
      }
      this.#shown[i] = level;
      row.dot.style.setProperty('--glow', level.toFixed(2));
      row.dot.classList.toggle('playing', level >= GLOW_ON);
    }
  }
}
