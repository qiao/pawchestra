import { Data3DTexture, LinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from 'three';

import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';

/** A color with three channels from 0 to 1. */
type GradeColor = readonly [r: number, g: number, b: number];

/** A point of the tone curve: the input and the output luma, as display values from 0 to 255. */
type CurvePoint = readonly [input: number, output: number];

/**
 * The values of the color grade on the display values, after AgX (design 4.5, post effects).
 * {@link gradeColor} applies them, and the lookup table of {@link gradeLut} holds the result. The
 * look lab (`pnpm look-lab`) fitted them to `orchestra-latest.png` at the exposure of
 * `STAGE_TONE` of `scene/renderer.ts`.
 */
export const GRADE = {
  /**
   * The tone curve on the luma. AgX gives flat middle tones and compresses the highlights, so the
   * curve lowers the middle tones and spreads the upper middle tones. It scales the three channels
   * by one factor, so it keeps the hue and the saturation. The old lift of each channel toward
   * white made the middle tones milky, and it moved the lit floor from a hue of 28° to 35°.
   *
   * The curve keeps a soft shoulder above 172, so it does not undo the roll-off of AgX. A point
   * (172, 210) takes 176 to 216 and 192 to 230: 13.5% of the floor clips in red, and 19.4% of the
   * white fur clips, against 9.2% in `orchestra-latest.png`.
   */
  curve: [
    [0, 0],
    [31, 25],
    [62, 57],
    [110, 104],
    [139, 145],
    [172, 195],
    [210, 232],
    [255, 252],
  ],
  /** The saturation of all colors, as a factor. */
  saturation: 1.0,
  /**
   * The extra saturation of the pale colors: the factor grows by this value times the square of
   * 1 minus the saturation of the color. AgX takes the saturation from the lit wood, and a dark
   * fur that is already saturated keeps its saturation. White fur is the palest color, so it got
   * the most, and 0.9 made it cream (a saturation of 0.47 against 0.30 in `orchestra-latest.png`).
   */
  vibrance: 0.5,
  /** The part of the saturation that the shadows keep. */
  shadowSaturation: 0.85,
  /** The tint of the shadows, added to each channel: neutral to a little cool. */
  shadowTint: [-0.006, 0, 0.012],
  /**
   * The tint of the highlights, added to each channel: warm amber. Twice this tint made the lit
   * white fur yellow.
   */
  highlightTint: [0.01, 0.002, -0.015],
} as const;

/**
 * Makes a monotone cubic curve through points (Fritsch and Carlson, 1980). The curve does not
 * overshoot between two points, so a tone curve stays monotone.
 *
 * @param points The points, by increasing input. Each value is from 0 to 1.
 * @returns The curve. It holds the first and the last output outside the inputs.
 */
function monotoneCurve(points: readonly CurvePoint[]): (x: number) => number {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push(((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / ((xs[i + 1] ?? 0) - (xs[i] ?? 0)));
  }
  const tangents = xs.map((_, i) => {
    const before = slopes[i - 1] ?? slopes[i] ?? 0;
    const after = slopes[i] ?? before;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  for (const [i, slope] of slopes.entries()) {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = (tangents[i] ?? 0) / slope;
    const b = (tangents[i + 1] ?? 0) / slope;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * slope;
      tangents[i + 1] = t * b * slope;
    }
  }

  return (x) => {
    const first = xs[0] ?? 0;
    const last = xs[n - 1] ?? 1;
    if (x <= first) {
      return ys[0] ?? 0;
    }
    if (x >= last) {
      return ys[n - 1] ?? 1;
    }
    let i = 0;
    while (x > (xs[i + 1] ?? last)) {
      i++;
    }
    const x0 = xs[i] ?? 0;
    const h = (xs[i + 1] ?? 1) - x0;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * (ys[i] ?? 0) +
      (t3 - 2 * t2 + t) * h * (tangents[i] ?? 0) +
      (-2 * t3 + 3 * t2) * (ys[i + 1] ?? 0) +
      (t3 - t2) * h * (tangents[i + 1] ?? 0)
    );
  };
}

/**
 * Calculates the smooth step of GLSL.
 *
 * @param edge0 The value that gives 0.
 * @param edge1 The value that gives 1.
 * @param x The value.
 * @returns A value from 0 to 1.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Calculates the luma of a display color.
 *
 * @param color The color.
 * @returns The luma, from 0 to 1.
 */
function lumaOf(color: GradeColor): number {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

/**
 * Grades one display color (design 4.5, post effects): the tone curve on the luma, the saturation
 * with the vibrance, and the tints of the shadows and of the highlights ({@link GRADE}).
 *
 * @param color The display color after AgX, from 0 to 1 for each channel.
 * @param curve The tone curve of `GRADE.curve`, on values from 0 to 1 ({@link monotoneCurve}).
 * @returns The graded color.
 */
function gradeColor(color: GradeColor, curve: (x: number) => number): [number, number, number] {
  const g = GRADE;
  const clamped = color.map((value) => Math.min(1, Math.max(0, value)));
  const [r0 = 0, g0 = 0, b0 = 0] = clamped;
  const before = lumaOf([r0, g0, b0]);
  const factor = before > 1e-4 ? curve(before) / before : 1;
  const [r = 0, gr = 0, b = 0] = clamped.map((value) => Math.min(1, value * factor));

  const luma = lumaOf([r, gr, b]);
  const top = Math.max(r, gr, b);
  const pale = top > 0 ? 1 - (top - Math.min(r, gr, b)) / top : 1;
  const shadows = g.shadowSaturation + (1 - g.shadowSaturation) * smoothstep(0.03, 0.3, luma);
  const saturation = g.saturation * (1 + g.vibrance * pale * pale) * shadows;

  // The tint of the shadows fades in above black, so that black stays black.
  const shadowWeight = (1 - smoothstep(0, 0.45, luma)) * smoothstep(0, 0.08, luma);
  const highlightWeight = smoothstep(0.4, 1, luma);
  const grade = (value: number, i: number): number =>
    luma +
    (value - luma) * saturation +
    (g.shadowTint[i] ?? 0) * shadowWeight +
    (g.highlightTint[i] ?? 0) * highlightWeight;
  return [grade(r, 0), grade(gr, 1), grade(b, 2)];
}

/**
 * The number of entries of the lookup table on each axis. The middle of the first entry holds the
 * grade of 0, and the middle of the last entry the grade of 1.
 */
export const GRADE_LUT_SIZE = 33;

/**
 * Fills the lookup table of the grade in steps, one for each blue entry (design 7.2): the
 * {@link gradeColor} of each entry, as RGBA bytes. Red changes fastest, then green, then blue, as
 * `Data3DTexture` reads them.
 *
 * @param size The number of entries on each axis.
 * @returns The steps, which return four bytes for each entry.
 */
function* gradeLutDataSteps(size: number): Steps<Uint8Array> {
  const data = new Uint8Array(size * size * size * 4);
  // The curve reads `GRADE.curve` at the call, so that the look override of the dev server
  // (`src/app/look-override.ts`) reaches it.
  const curve = monotoneCurve(GRADE.curve.map(([x, y]) => [x / 255, y / 255]));
  for (let b = 0; b < size; b++) {
    yield;
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const graded = gradeColor([r / (size - 1), g / (size - 1), b / (size - 1)], curve);
        const i = ((b * size + g) * size + r) * 4;
        for (const [channel, value] of graded.entries()) {
          data[i + channel] = Math.round(Math.min(1, Math.max(0, value)) * 255);
        }
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

/** The lookup table of the grade, which all materials and passes share. */
let lut: Data3DTexture | null = null;

/**
 * Gives the lookup table of the grade (design 4.5, post effects), as a 3D texture with a linear
 * filter. The final pass and the views page read it with `GRADE_FUNCTION` of `post-shaders.ts`.
 *
 * @returns The texture. Its pixels stay in memory, so a restored WebGL context loads it again.
 */
export function gradeLut(): Data3DTexture {
  return lut ?? runAll(gradeLutSteps());
}

/**
 * Makes the lookup table of the grade as {@link gradeLut} does, in steps (design 7.2).
 *
 * @returns The steps, which return the texture. A made table takes no step.
 */
export function* gradeLutSteps(): Steps<Data3DTexture> {
  if (!lut) {
    const size = GRADE_LUT_SIZE;
    lut = new Data3DTexture(yield* gradeLutDataSteps(size), size, size, size);
    lut.format = RGBAFormat;
    lut.type = UnsignedByteType;
    lut.minFilter = LinearFilter;
    lut.magFilter = LinearFilter;
    lut.colorSpace = NoColorSpace;
    lut.needsUpdate = true;
  }
  return lut;
}
