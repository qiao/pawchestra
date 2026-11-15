import { DEMOS, DEMO_IDS, demoRowLabel } from '../app/demos.ts';
import type { DemoId } from '../app/demos.ts';
import { METER_BARS } from '../app/meter.ts';
import { clockText, spokenTime } from '../app/time-text.ts';
import { createButton, createElement, setAttribute } from './dom.ts';

/** The height of a bar of the meter at the level 0, as a share of its full height. */
const METER_FLOOR = 0.15;

/**
 * The heights of the bars of a still meter, as shares of the full height: the shape of the
 * mockup. `ui.css` shows them with reduced motion.
 */
const STILL_LEVELS = [0.35, 0.55, 0.8, 0.6, 0.95, 0.7, 0.5, 0.65, 0.4] as const;

/** The start of the name of the row of a file of the user (design 2.8). */
const OWN_FILE_TEXT = 'Your file';

/** The current row of the list: a demo, the file of the user, or none. */
export type DemoListRow = DemoId | 'file' | null;

/**
 * The demo list of the drawer (design 2.8, 8.2): one row for each demo, with the title of the
 * list, the composer, and the length. The current demo has an accent bar on the left
 * and a level meter that moves with the music.
 */
export class DemoList {
  readonly element: HTMLElement;
  readonly #rows = new Map<DemoId, HTMLButtonElement>();
  /** The action of a click on the row of the file of the user. */
  readonly #onSelectFile: () => void;
  /** The row of the last file of the user in the session, or `null` before the first file. */
  #fileRow: HTMLButtonElement | null = null;
  /** The level meter, in the row of the current demo (design 2.8). */
  readonly #meter: HTMLElement;
  readonly #bars: HTMLElement[] = [];
  /** The scale of each bar that the DOM shows, so that a frame writes only a change. */
  readonly #shown = new Float32Array(METER_BARS).fill(-1);

  /**
   * Creates the rows of the demos, in the order of the list.
   *
   * @param onSelect The action of a click on a row.
   * @param onSelectFile The action of a click on the row of the file of the user.
   */
  constructor(onSelect: (id: DemoId) => void, onSelectFile: () => void) {
    this.#onSelectFile = onSelectFile;
    this.element = createElement('ul', 'list');
    this.element.setAttribute('aria-label', 'Music');
    this.#meter = createElement('span', 'meter');
    this.#meter.setAttribute('aria-hidden', 'true');
    for (const still of STILL_LEVELS) {
      const bar = createElement('span');
      bar.style.setProperty('--still', String(still));
      this.#bars.push(bar);
      this.#meter.append(bar);
    }
    for (const id of DEMO_IDS) {
      const demo = DEMOS[id];
      const row = this.#createRow(demoRowLabel(id));
      row.append(
        createElement('span', 'name', demo.title),
        createElement('span', 'length', clockText(demo.lengthSec)),
        createElement('small', '', demo.composer),
      );
      row.addEventListener('click', () => {
        onSelect(id);
      });
      const item = createElement('li');
      item.append(row);
      this.element.append(item);
      this.#rows.set(id, row);
    }
  }

  /**
   * Creates the button of a row, with the focus rules of the list.
   *
   * @param label The `aria-label` of the row.
   * @returns The button.
   */
  #createRow(label: string): HTMLButtonElement {
    const row = createButton('demo', label);
    // A row with the focus gives Space to the page, so that Space plays and pauses after a
    // click on a row (design 2.4). Enter still selects the piece. The browser clicks a button
    // on the keyup of Space, so the row stops that default.
    row.dataset['focusKind'] = 'page';
    row.addEventListener('keyup', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
      }
    });
    return row;
  }

  /**
   * Shows the row of the last file of the user at the top of the list, so that the file plays
   * again after a demo (design 2.8). The row lives in memory only: the page stores no file.
   *
   * @param title The title of the file.
   * @param second The second line of the title, or '' for none.
   * @param lengthSec The song length in whole seconds.
   */
  showFile(title: string, second: string, lengthSec: number): void {
    const name = `${OWN_FILE_TEXT}: ${title}`;
    const label = second ? `${name}, ${second}` : name;
    const row = this.#createRow(`${label}, ${spokenTime(lengthSec)}`);
    row.classList.add('own-file');
    row.append(
      createElement('span', 'name', name),
      createElement('span', 'length', clockText(lengthSec)),
      createElement('small', '', second),
    );
    row.addEventListener('click', this.#onSelectFile);
    if (this.#fileRow?.parentElement) {
      this.#fileRow.parentElement.replaceChildren(row);
    } else {
      const item = createElement('li');
      item.append(row);
      this.element.prepend(item);
    }
    this.#fileRow = row;
  }

  /** Moves the keyboard focus to the row of the current demo, or to the first row. */
  focusCurrent(): void {
    const rows = [...this.#rows.values()];
    const row = rows.find((r) => r.getAttribute('aria-current') === 'true') ?? rows[0];
    row?.focus();
  }

  /**
   * Marks the current row.
   *
   * @param current The current demo, `file` for the file of the user, or `null` for none.
   */
  show(current: DemoListRow): void {
    for (const [id, row] of this.#rows) {
      setAttribute(row, 'aria-current', String(id === current));
    }
    if (this.#fileRow) {
      setAttribute(this.#fileRow, 'aria-current', String(current === 'file'));
    }
    let row: HTMLButtonElement | null | undefined = null;
    if (current === 'file') {
      row = this.#fileRow;
    } else if (current !== null) {
      row = this.#rows.get(current);
    }
    if (row) {
      row.querySelector('.length')?.before(this.#meter);
    } else {
      this.#meter.remove();
    }
  }

  /**
   * Shows the levels of the music on the meter of the current demo (design 2.8). Each bar keeps
   * a small height at the level 0. With reduced motion, `ui.css` shows the bars still. The meter
   * shows only after the piece starts: a piece that waits at its start shows no meter.
   *
   * @param levels The level of each bar, from 0 to 1, from `meterLevels()`.
   * @param started True while the piece plays, or after it has left its start.
   */
  showLevels(levels: Float32Array, started: boolean): void {
    const visibility = started ? '' : 'hidden';
    if (this.#meter.style.visibility !== visibility) {
      this.#meter.style.visibility = visibility;
    }
    for (const [i, bar] of this.#bars.entries()) {
      const scale = METER_FLOOR + (1 - METER_FLOOR) * (levels[i] ?? 0);
      if (Math.abs(scale - (this.#shown[i] ?? -1)) >= 0.01) {
        this.#shown[i] = scale;
        bar.style.transform = `scaleY(${scale.toFixed(2)})`;
      }
    }
  }
}
