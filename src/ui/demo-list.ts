import { DEMOS, DEMO_IDS, demoRowLabel } from '../app/demos.ts';
import type { DemoId } from '../app/demos.ts';
import { METER_BARS } from '../app/meter.ts';
import { clockText } from '../app/time-text.ts';
import { createButton, createElement, setAttribute } from './dom.ts';

/** The height of a bar of the meter at the level 0, as a share of its full height. */
const METER_FLOOR = 0.15;

/**
 * The heights of the bars of a still meter, as shares of the full height: the shape of the
 * mockup. `ui.css` shows them with reduced motion.
 */
const STILL_LEVELS = [0.35, 0.55, 0.8, 0.6, 0.95, 0.7, 0.5, 0.65, 0.4] as const;

/**
 * The demo list of the drawer (design 2.8, 8.2): one row for each demo, with the title of the
 * list, the composer, the cast line, and the length. The current demo has an accent bar on the left
 * and a level meter that moves with the music.
 */
export class DemoList {
  readonly element: HTMLElement;
  readonly #rows = new Map<DemoId, HTMLButtonElement>();
  /** The level meter, in the row of the current demo (design 2.8). */
  readonly #meter: HTMLElement;
  readonly #bars: HTMLElement[] = [];
  /** The scale of each bar that the DOM shows, so that a frame writes only a change. */
  readonly #shown = new Float32Array(METER_BARS).fill(-1);

  /**
   * Creates the rows of the five demos, in the order of the list.
   *
   * @param onSelect The action of a click on a row.
   */
  constructor(onSelect: (id: DemoId) => void) {
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
      const row = createButton('demo', demoRowLabel(id));
      row.append(
        createElement('span', 'name', demo.title),
        createElement('span', 'length', clockText(demo.lengthSec)),
        createElement('small', '', demo.composer),
        createElement('small', 'cast', demo.cast),
      );
      row.addEventListener('click', () => {
        onSelect(id);
      });
      // A row with the focus gives Space to the page, so that Space plays and pauses after a
      // click on a row (design 2.4). Enter still selects the piece. The browser clicks a button
      // on the keyup of Space, so the row stops that default.
      row.dataset['focusKind'] = 'page';
      row.addEventListener('keyup', (event) => {
        if (event.key === ' ') {
          event.preventDefault();
        }
      });
      // The browser shows the focus ring after each key press, also on a row that a click
      // focused. A row that gets the focus with no ring keeps no ring, so that Space and the
      // arrows of the page do not show it (design 2.8). A Tab into the list shows the ring.
      row.addEventListener('focus', () => {
        row.classList.toggle('is-pointer-focus', !row.matches(':focus-visible'));
      });
      row.addEventListener('blur', () => {
        row.classList.remove('is-pointer-focus');
      });
      const item = createElement('li');
      item.append(row);
      this.element.append(item);
      this.#rows.set(id, row);
    }
  }

  /** Moves the keyboard focus to the row of the current demo, or to the first row. */
  focusCurrent(): void {
    const rows = [...this.#rows.values()];
    const row = rows.find((r) => r.getAttribute('aria-current') === 'true') ?? rows[0];
    row?.focus();
  }

  /**
   * Marks the current demo.
   *
   * @param current The current demo, or `null` for a piece that is not a demo.
   */
  show(current: DemoId | null): void {
    for (const [id, row] of this.#rows) {
      setAttribute(row, 'aria-current', String(id === current));
    }
    const row = current === null ? undefined : this.#rows.get(current);
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
