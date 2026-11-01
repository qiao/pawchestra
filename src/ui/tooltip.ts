import { TOOLTIP_DELAY_MS } from '../app/tooltips.ts';
import { createElement, setText } from './dom.ts';

/** The gap between a control and its tooltip, in CSS pixels. */
const GAP_PX = 8;

/** The smallest distance of a tooltip from the edges of the window, in CSS pixels. */
const EDGE_PX = 8;

/**
 * The time after which a tooltip hides when the pointer leaves its control, in milliseconds. The
 * pointer can move onto the tooltip in this time, and the tooltip then stays (WCAG 1.4.13).
 */
const HIDE_DELAY_MS = 150;

/**
 * The tooltips of the controls (design 2.8): one box above the control, with the name of the action
 * and its key, for example "Cinematic camera (C)". It shows 400 ms after a mouse or a pen comes
 * over a control, or after a keyboard focus on it. A touch gives no tooltip. Escape hides it, and
 * the pointer can move onto it. A screen reader skips the box, because the control has the same
 * name in its `aria-label` and the key in its `aria-keyshortcuts`.
 */
export class Tooltips {
  readonly element: HTMLElement;
  /** The control of the tooltip that shows or waits to show, or `null`. */
  #control: HTMLElement | null = null;
  #text: () => string = () => '';
  #showTimer: ReturnType<typeof setTimeout> | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Creates the hidden tooltip box.
   *
   * @param target The window that gets the Escape key.
   */
  constructor(target: Window) {
    this.element = createElement('div', 'tooltip');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.hidden = true;
    this.element.addEventListener('pointerenter', () => {
      clearTimeout(this.#hideTimer);
    });
    this.element.addEventListener('pointerleave', () => {
      this.#hideSoon();
    });
    // Escape hides a tooltip that shows, and does nothing more (WCAG 1.4.13).
    target.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !this.element.hidden) {
          event.stopPropagation();
          event.preventDefault();
          this.hide();
        }
      },
      true,
    );
  }

  /**
   * Gives a control a tooltip.
   *
   * @param control The control.
   * @param text Gives the text of the tooltip. The tooltip reads it each time that it shows and
   *   on each {@link refresh}, so that it follows a change of the label.
   */
  attach(control: HTMLElement, text: () => string): void {
    control.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') {
        this.#showSoon(control, text);
      }
    });
    control.addEventListener('pointerleave', () => {
      this.#hideSoon();
    });
    control.addEventListener('pointerdown', () => {
      this.hide();
    });
    control.addEventListener('focus', () => {
      if (control.matches(':focus-visible')) {
        this.#showSoon(control, text);
      }
    });
    control.addEventListener('blur', () => {
      if (this.#control === control) {
        this.hide();
      }
    });
  }

  /**
   * Hides the tooltip at once when its control is in an element, for example in the bar that
   * hides. The tooltip of a control outside the element stays while its control has the pointer
   * or the focus (WCAG 1.4.13).
   *
   * @param container The element.
   */
  hideIn(container: Element): void {
    if (this.#control && container.contains(this.#control)) {
      this.hide();
    }
  }

  /** Hides the tooltip at once. */
  hide(): void {
    clearTimeout(this.#showTimer);
    clearTimeout(this.#hideTimer);
    this.#control = null;
    this.element.hidden = true;
  }

  /** Reads the text of the tooltip that shows again, for example after a change of the label. */
  refresh(): void {
    if (!this.element.hidden) {
      setText(this.element, this.#text());
    }
  }

  /**
   * Shows the tooltip of a control after the delay.
   *
   * @param control The control.
   * @param text Gives the text.
   */
  #showSoon(control: HTMLElement, text: () => string): void {
    clearTimeout(this.#showTimer);
    clearTimeout(this.#hideTimer);
    if (this.#control === control && !this.element.hidden) {
      return;
    }
    this.element.hidden = true;
    this.#control = control;
    this.#text = text;
    this.#showTimer = setTimeout(() => {
      this.#show(control);
    }, TOOLTIP_DELAY_MS);
  }

  /** Hides the tooltip after a short time, so that the pointer can move onto it. */
  #hideSoon(): void {
    clearTimeout(this.#showTimer);
    clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => {
      this.hide();
    }, HIDE_DELAY_MS);
  }

  /**
   * Shows the tooltip above a control, inside the window.
   *
   * @param control The control.
   */
  #show(control: HTMLElement): void {
    // A control that hides, for example in the hidden bar or in the hidden UI of Cinematic mode,
    // gets no tooltip.
    if (!control.isConnected || control.closest('.is-hidden, [hidden], .is-ui-hidden')) {
      return;
    }
    setText(this.element, this.#text());
    this.element.hidden = false;
    const box = control.getBoundingClientRect();
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const maxLeft = window.innerWidth - width - EDGE_PX;
    const left = Math.min(Math.max(EDGE_PX, box.left + box.width / 2 - width / 2), maxLeft);
    const above = box.top - GAP_PX - height;
    const top = above >= EDGE_PX ? above : box.bottom + GAP_PX;
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }
}
