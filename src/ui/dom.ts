import type { FocusKind } from '../app/keys.ts';

/**
 * Creates an HTML element with a class and a text.
 *
 * @param tag The tag name.
 * @param className The class, or '' for none.
 * @param text The text content, or '' for none.
 * @returns The element.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

/**
 * Creates a button with an accessible name (design 2.8).
 *
 * @param className The class, or '' for none.
 * @param label The `aria-label`, or '' for a button that shows its name as text.
 * @returns The button.
 */
export function createButton(className: string, label: string): HTMLButtonElement {
  const button = createElement('button', className);
  button.type = 'button';
  if (label) {
    button.setAttribute('aria-label', label);
  }
  return button;
}

/**
 * Sets the text of an element if it changed. A frame calls it, so it writes the DOM only on a
 * change.
 *
 * @param element The element.
 * @param text The text.
 */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/**
 * Sets an attribute of an element if it changed.
 *
 * @param element The element.
 * @param name The attribute name.
 * @param value The value.
 */
export function setAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * Gives the kind of an element with the keyboard focus, for the keys of the page (design 2.4).
 *
 * @param element The element with the focus, `document.activeElement`.
 * @returns The kind: a button, a range, a menu or a tab, a text field, or the page for any other
 *   element. A control with `data-focus-kind="page"` uses no key of the page, so it also gives the
 *   page. A button or a tab that a click focused (`data-pointer-focus`, {@link keepKeysAfterClick})
 *   also gives the page.
 */
export function focusKindOf(element: Element | null): FocusKind {
  if (
    element instanceof HTMLElement &&
    (element.dataset['focusKind'] === 'page' || element.dataset['pointerFocus'] !== undefined)
  ) {
    return 'page';
  }
  // A tab of the drawer uses Space, the arrows, and Home, as a menu does.
  if (element?.getAttribute('role') === 'tab') {
    return 'menu';
  }
  if (element instanceof HTMLButtonElement) {
    return 'button';
  }
  if (element instanceof HTMLSelectElement) {
    return 'menu';
  }
  if (element instanceof HTMLInputElement) {
    return element.type === 'range' ? 'range' : 'text';
  }
  if (element instanceof HTMLTextAreaElement) {
    return 'text';
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return 'text';
  }
  return 'page';
}

/**
 * Gives the keys of the page back after a click on a button or a tab (design 2.4). A click
 * focuses the control, and the control then takes Space and the arrows: a click on the camera
 * button and then Space would toggle the camera again in place of a pause. A control that a
 * click focused gets `data-pointer-focus`, so that {@link focusKindOf} gives the page, and the
 * browser does not click it on the keyup of Space. A focus from the keyboard keeps the keys of
 * the control. The control also shows no focus ring after a key of the page (design 2.8).
 *
 * @param root The document.
 */
export function keepKeysAfterClick(root: Document): void {
  root.addEventListener('focusin', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target instanceof HTMLButtonElement || target.getAttribute('role') === 'tab') &&
      !target.matches(':focus-visible')
    ) {
      target.dataset['pointerFocus'] = '';
    }
  });
  root.addEventListener('focusout', (event) => {
    if (event.target instanceof HTMLElement) {
      delete event.target.dataset['pointerFocus'];
    }
  });
  root.addEventListener(
    'keyup',
    (event) => {
      const active = root.activeElement;
      if (
        event.key === ' ' &&
        active instanceof HTMLElement &&
        active.dataset['pointerFocus'] !== undefined
      ) {
        event.preventDefault();
      }
    },
    { capture: true },
  );
}
