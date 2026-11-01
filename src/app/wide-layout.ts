/** The narrowest window of the wide layout, in CSS pixels (design 2.8). */
const WIDE_MIN_WIDTH_PX = 1200;

/**
 * The smallest aspect of the window of the wide layout, as width and height. Beside the open
 * drawer, the stage then keeps a free area that is wider than it is high.
 */
const WIDE_MIN_ASPECT = [3, 2] as const;

/**
 * The media query of the wide layout (design 2.8). `ui.css` uses the same query, so that the load
 * state of `index.html` stands beside the drawer that opens at start.
 */
export const WIDE_LAYOUT_QUERY = `(min-width: ${WIDE_MIN_WIDTH_PX}px) and (min-aspect-ratio: ${WIDE_MIN_ASPECT[0]}/${WIDE_MIN_ASPECT[1]})`;

/**
 * Tells if a window has the wide layout (design 2.3, 2.8): at least 1200 px wide, with an aspect
 * of at least 3:2. The drawer then opens at start at the tab "Music", so that the stage does not
 * move at the click on play.
 *
 * @param width The width of the window, in CSS pixels.
 * @param height The height of the window, in CSS pixels.
 * @returns True for the wide layout.
 */
export function isWideLayout(width: number, height: number): boolean {
  const [aspectWidth, aspectHeight] = WIDE_MIN_ASPECT;
  return width >= WIDE_MIN_WIDTH_PX && width * aspectHeight >= height * aspectWidth;
}
