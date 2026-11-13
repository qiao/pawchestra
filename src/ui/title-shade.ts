/** The color of `--title-shade` in ui.css: red, green, and blue from 0 to 255. */
export const SHADE_RGB = [11, 9, 8] as const;

/** The alpha of `--title-shade` in ui.css, the darkest part of the title shade (design 2.8). */
export const SHADE_ALPHA = 0.8;

/**
 * The margin around the text of a line of the title that keeps 4.5:1 over the shade, in CSS pixels
 * (e2e/title-shade.e2e.ts). It holds the smoothed edges of the letters and their text shadow.
 */
export const LINE_MARGIN = 4;

/** The linear value of each sRGB byte, from 0 to 1 (WCAG 2.2). */
const LINEAR = Float32Array.from({ length: 256 }, (_, byte) => {
  const s = byte / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

/**
 * Calculates the relative luminance of WCAG 2.2 of an sRGB color.
 *
 * @param r The red byte, from 0 to 255.
 * @param g The green byte, from 0 to 255.
 * @param b The blue byte, from 0 to 255.
 * @returns The luminance, from 0 to 1.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * (LINEAR[r] ?? 0) + 0.7152 * (LINEAR[g] ?? 0) + 0.0722 * (LINEAR[b] ?? 0);
}
