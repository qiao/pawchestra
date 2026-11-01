import type { ScreenBox } from '../shots/frame.ts';

/** The color of `--title-shade` in ui.css: red, green, and blue from 0 to 255. */
export const SHADE_RGB = [11, 9, 8] as const;

/** The alpha of `--title-shade` in ui.css: the alpha of the shade at the level 1. */
export const SHADE_ALPHA = 0.8;

/**
 * The lightest backdrop of the piece title and the composer line at which their text (`--text`)
 * keeps more than 4.5:1 with no shade, as a relative luminance of WCAG 2.2. The limit of 4.5:1
 * is 0.141. The margin covers a colored backdrop (ui/contrast.test.ts).
 */
export const TEXT_BACKDROP_LIMIT = 0.125;

/**
 * The lightest backdrop of the logo line at which its gold (`--accent-strong`) and the gray text
 * of the link to GitHub (`--github-mark`) keep more than 4.5:1 with no shade. The limit of 4.5:1
 * is 0.095 for the gold and 0.089 for the gray.
 */
export const LOGO_BACKDROP_LIMIT = 0.085;

/**
 * The time in which the shade fades from the level 1 to 0, in seconds. The shade comes in at
 * once, and goes out slowly, so that it does not flicker during a camera move.
 */
export const SHADE_FALL_SEC = 0.8;

/**
 * The margin around the text of a line of the title that the app reads for the shade, in CSS
 * pixels. It holds the smoothed edges of the letters and their text shadow.
 */
export const LINE_MARGIN = 4;

/** One line of the title text, for its shade (design 2.8). */
export interface TitleLine {
  /**
   * The box of the text of the line and a small margin, in CSS pixels of the window, or `null`
   * for a line that does not show.
   */
  readonly box: ScreenBox | null;
  /** The lightest backdrop at which the text keeps 4.5:1 with no shade, a relative luminance. */
  readonly limit: number;
}

/** A rectangle of pixels in an image, with its origin at the first pixel of the image. */
export interface PixelRect {
  /** The column of the first pixel. */
  readonly x: number;
  /** The row of the first pixel. */
  readonly y: number;
  /** The width, in pixels. */
  readonly width: number;
  /** The height, in pixels. */
  readonly height: number;
}

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

/**
 * Gives the sRGB value of a gray with a relative luminance.
 *
 * @param luminance The luminance, from 0 to 1.
 * @returns The sRGB value, from 0 to 1.
 */
function grayOf(luminance: number): number {
  return luminance <= 0.0031308 ? 12.92 * luminance : 1.055 * luminance ** (1 / 2.4) - 0.055;
}

/**
 * Calculates the luminance of the lightest block of a rectangle of an RGBA image: the mean
 * luminance of each square of `block` × `block` pixels, then the largest mean. A thin light line
 * in a dark block, such as a whisker or a string, thus does not turn the shade on.
 *
 * @param pixels The RGBA bytes of the image, row by row.
 * @param rowWidth The width of the image, in pixels.
 * @param rect The rectangle, inside the image.
 * @param block The side of a block, in pixels, from 1.
 * @returns The luminance of the lightest block, from 0 to 1, or 0 for an empty rectangle.
 */
export function lightestBlock(
  pixels: Uint8Array,
  rowWidth: number,
  rect: PixelRect,
  block: number,
): number {
  let lightest = 0;

  for (let top = rect.y; top < rect.y + rect.height; top += block) {
    const bottom = Math.min(top + block, rect.y + rect.height);
    for (let left = rect.x; left < rect.x + rect.width; left += block) {
      const right = Math.min(left + block, rect.x + rect.width);
      let sum = 0;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const i = 4 * (y * rowWidth + x);
          sum += relativeLuminance(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
        }
      }
      lightest = Math.max(lightest, sum / ((bottom - top) * (right - left)));
    }
  }

  return lightest;
}

/**
 * Calculates the level of the shade that a line of the title needs over its lightest backdrop:
 * the backdrop under the shade is then at most as light as the limit of the line. The level
 * multiplies the alpha of `--title-shade`. The calculation mixes the sRGB values of a gray with
 * the luminance of the backdrop and of the shade.
 *
 * @param backdrop The luminance of the lightest block behind the line, from 0 to 1.
 * @param limit The lightest backdrop at which the text keeps 4.5:1 with no shade.
 * @returns The level, from 0 (no shade) to 1 (the full shade).
 */
export function shadeLevel(backdrop: number, limit: number): number {
  const light = grayOf(backdrop);
  const target = grayOf(limit);
  if (light <= target) {
    return 0;
  }

  const shade = grayOf(relativeLuminance(...SHADE_RGB));
  const alpha = (light - target) / (light - shade);

  return Math.min(1, alpha / SHADE_ALPHA);
}

/**
 * Calculates the level of the shade in the next frame. It rises at once to the level that the
 * text needs, and falls by 1 in {@link SHADE_FALL_SEC}.
 *
 * @param level The level of the last frame, from 0 to 1.
 * @param needed The level that the text needs now, from 0 to 1.
 * @param elapsedSec The time since the last frame, in seconds.
 * @returns The new level, from 0 to 1.
 */
export function nextShadeLevel(level: number, needed: number, elapsedSec: number): number {
  const fallen = level - Math.max(0, elapsedSec) / SHADE_FALL_SEC;
  return Math.min(1, Math.max(needed, fallen, 0));
}
