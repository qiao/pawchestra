/**
 * The look lab (design 4.5): it renders the default demo at {@link LOOK_TIME_SEC} at the cameras
 * of {@link LOOK_CAMERAS} with `pnpm close-views play`, and measures the frames against
 * `docs/reference/orchestra-latest.png`. It writes `<dir>/look.md`: the luma percentiles and the
 * saturation of the stage area of each frame, the measures of the regions of {@link LOOK_REGIONS}
 * (camera `orchestra`), and the measures of the regions of the camera `default`, which come from
 * the layout of {@link LOOK_DEMO} (`tools/look-regions.ts`). `<dir>/regions-default.png` shows
 * these regions on the frame of the tree.
 *
 * Usage: `pnpm look-lab <dir> [--base <ref>] [--url <url>] [--measure]`
 *
 * - `--base <ref>` also renders a commit (the frames `play-base-*.png`), as `pnpm close-views`.
 * - `--url <url>` renders a running site, such as the dev server of `pnpm look-variants` with a
 *   look override (`src/app/look-override.ts`). It builds no site.
 * - `--measure` renders nothing, and measures the frames that `<dir>` holds.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { DEFAULT_DEMO } from '../src/app/demos.ts';
import type { DemoId } from '../src/app/demos.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { scoreOf } from '../src/score/test-score.ts';
import { defaultRegions } from './look-regions.ts';
import type { DefaultRegion } from './look-regions.ts';
import { patchedDemo } from './patch-demos.ts';
import { ROOT } from './ref-tree.ts';
import { rgbaPixels } from './sheet-check.ts';

/** A box of an image, in pixels: the left, the top, the right, and the bottom edge. */
export type PixelBox = readonly [left: number, top: number, right: number, bottom: number];

/** The RGBA pixels of an image. */
export interface Pixels {
  /** The width, in pixels. */
  readonly width: number;
  /** Four values for each pixel, row by row. */
  readonly rgba: Uint8Array;
}

/**
 * A mask of the pixels of a region by their color. A pixel is in the mask when each of its values
 * lies strictly between the two limits of its range.
 */
export interface PixelMask {
  /** The range of the hue, in degrees. */
  readonly hue: readonly [number, number];
  /** The range of the saturation, from 0 to 1. */
  readonly saturation: readonly [number, number];
  /** The range of the luma, from 0 to 255. */
  readonly luma: readonly [number, number];
}

/**
 * A region of a frame that the look lab measures. `color` gives the median color of a lit or a
 * shaded surface. `contrast` gives the contrast of the cast shadows on the floor. `tone` gives the
 * luma percentiles, the median hue, and the median saturation of the pixels of a mask.
 */
export interface LookRegion {
  /**
   * The name of the region. The box of the app and the box of the reference show the same kind
   * of surface.
   */
  readonly name: string;
  /** The measure of the region. */
  readonly kind: 'color' | 'contrast' | 'tone';
  /** The box in a frame of the camera `orchestra` of `pnpm close-views` (1440 × 900). */
  readonly app: PixelBox;
  /**
   * The box in `docs/reference/orchestra-latest.png` (1762 × 1240), or `null` when no box of the
   * reference is known.
   */
  readonly reference: PixelBox | null;
  /** The mask of a region of the kind `tone`, or `null` for all pixels of the box. */
  readonly mask: PixelMask | null;
}

/**
 * The matched regions of the look lab. The boxes of the app hold for the default demo at
 * {@link LOOK_TIME_SEC}. A new layout or a new camera moves them, so check them again on a new
 * frame.
 */
export const LOOK_REGIONS: readonly LookRegion[] = [
  {
    name: 'lit floor, left of the podium',
    kind: 'color',
    app: [540, 700, 630, 780],
    reference: [700, 1050, 860, 1150],
    mask: null,
  },
  {
    name: 'lit floor, right of the podium',
    kind: 'color',
    app: [830, 700, 950, 760],
    reference: [1220, 1040, 1340, 1110],
    mask: null,
  },
  {
    name: 'back of the conductor',
    kind: 'color',
    app: [690, 580, 770, 650],
    reference: [950, 830, 1070, 960],
    mask: null,
  },
  {
    // The belly of the front left rabbit.
    name: 'white fur, front left rabbit',
    kind: 'color',
    app: [362, 552, 392, 588],
    reference: [150, 700, 200, 780],
    mask: null,
  },
  {
    name: 'floor with the shadows of the players',
    kind: 'contrast',
    app: [250, 640, 530, 760],
    reference: [1250, 880, 1450, 1000],
    mask: null,
  },
  {
    name: 'floor in front of the podium',
    kind: 'contrast',
    app: [620, 770, 820, 820],
    reference: [820, 1150, 1180, 1235],
    mask: null,
  },
  // The three regions of the tone of the stage. No box of the reference is known for the torso
  // and the chair.
  {
    name: 'rabbit torso, front left',
    kind: 'tone',
    app: [360, 550, 405, 630],
    reference: null,
    mask: null,
  },
  {
    name: 'chair, front left',
    kind: 'tone',
    app: [325, 560, 372, 660],
    reference: null,
    // The honey wood: the bright, saturated pixels with the hue of the chairs.
    mask: { hue: [28, 50], saturation: [0.3, 2], luma: [90, 256] },
  },
  {
    // The hall: 62% to 95% of the width and 2% to 14% of the height of each image.
    name: 'hall above the stage, right of the beam',
    kind: 'tone',
    app: [892, 18, 1368, 126],
    reference: [1092, 24, 1673, 173],
    mask: null,
  },
];

/** The cameras of `pnpm close-views` that the look lab renders. The first one has the regions. */
export const LOOK_CAMERAS = ['orchestra', 'default', 'violins'] as const;

/** The demo of the frames: the default demo, as `pnpm close-views play` renders it. */
export const LOOK_DEMO: DemoId = DEFAULT_DEMO;

/** The size of the frames, in pixels: `PLAY_FRAME` of `tools/close-views.ts`. */
export const LOOK_FRAME = { width: 1440, height: 900 } as const;

/** The song time of the frames, in seconds: the time of the play frame of `pnpm snapshot`. */
export const LOOK_TIME_SEC = 33.5;

/** The reference image of the look. */
const REFERENCE = 'docs/reference/orchestra-latest.png';

/** The luma of an sRGB color, from 0 to 255. */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Gives the hue and the saturation of the HSV model of an sRGB color.
 *
 * @param rgb The color, from 0 to 255 for each channel.
 * @returns The hue in degrees, and the saturation from 0 to 1.
 */
export function hueSaturation(rgb: readonly [number, number, number]): [number, number] {
  const [r, g, b] = rgb;
  const top = Math.max(r, g, b);
  const range = top - Math.min(r, g, b);
  if (range === 0) {
    return [0, 0];
  }
  let hue: number;
  if (top === r) {
    hue = ((g - b) / range) % 6;
  } else if (top === g) {
    hue = (b - r) / range + 2;
  } else {
    hue = (r - g) / range + 4;
  }
  return [(hue * 60 + 360) % 360, range / top];
}

/**
 * Reads the colors of the pixels in a box.
 *
 * @param image The image.
 * @param box The box.
 * @param step The distance between two read pixels, in pixels.
 * @returns The colors.
 */
function boxColors(image: Pixels, box: PixelBox, step = 1): [number, number, number][] {
  const [left, top, right, bottom] = box;
  const colors: [number, number, number][] = [];
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const i = (y * image.width + x) * 4;
      colors.push([image.rgba[i] ?? 0, image.rgba[i + 1] ?? 0, image.rgba[i + 2] ?? 0]);
    }
  }
  return colors;
}

/**
 * Gives the value at a part of a sorted list.
 *
 * @param sorted The values, from the smallest.
 * @param q The part, from 0 to 1.
 * @returns The value.
 */
function at<T>(sorted: readonly T[], q: number): T {
  const value = sorted[Math.floor(q * (sorted.length - 1))];
  if (value === undefined) {
    throw new Error('A region of the look lab has no pixels.');
  }
  return value;
}

/** The tone of the stage area of a frame. */
export interface StageTone {
  /** The luma at 5%, 25%, 50%, 75%, and 95% of the pixels, from 0 to 255. */
  readonly percentiles: readonly number[];
  /** The median of the saturation of the pixels, from 0 to 1. */
  readonly saturation: number;
}

/**
 * Measures the tone of the stage area: the band from 45% to 85% of the height and from 20% to
 * 80% of the width.
 *
 * @param image The image.
 * @param height The height of the image, in pixels.
 * @returns The tone.
 */
export function stageTone(image: Pixels, height: number): StageTone {
  const box: PixelBox = [
    Math.round(image.width * 0.2),
    Math.round(height * 0.45),
    Math.round(image.width * 0.8),
    Math.round(height * 0.85),
  ];
  const colors = boxColors(image, box, 2);
  const lumas = colors.map(([r, g, b]) => luma(r, g, b)).toSorted((a, b) => a - b);
  const saturations = colors.map((c) => hueSaturation(c)[1]).toSorted((a, b) => a - b);
  return {
    percentiles: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => Math.round(at(lumas, q))),
    saturation: at(saturations, 0.5),
  };
}

/**
 * Measures the median color of a region, by the sum of the channels.
 *
 * @param image The image.
 * @param box The region.
 * @returns The color, from 0 to 255 for each channel.
 */
export function regionColor(image: Pixels, box: PixelBox): [number, number, number] {
  const sorted = boxColors(image, box).toSorted((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  return at(sorted, 0.5);
}

/** The contrast of the cast shadows in a region of the floor. */
export interface RegionContrast {
  /** The luma at 5% of the pixels. */
  readonly dark: number;
  /** The luma at 90% of the pixels. */
  readonly light: number;
  /** The mean color of the darkest 5% of the pixels: the color of the shadows. */
  readonly shadow: readonly [number, number, number];
}

/**
 * Measures the contrast of the cast shadows in a region.
 *
 * @param image The image.
 * @param box The region.
 * @returns The contrast.
 */
export function regionContrast(image: Pixels, box: PixelBox): RegionContrast {
  const sorted = boxColors(image, box).toSorted(
    (a, b) => luma(a[0], a[1], a[2]) - luma(b[0], b[1], b[2]),
  );
  const darkest = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 20)));
  const mean = (channel: 0 | 1 | 2): number =>
    Math.round(darkest.reduce((sum, color) => sum + color[channel], 0) / darkest.length);
  return {
    dark: luma(...at(sorted, 0.05)),
    light: luma(...at(sorted, 0.9)),
    shadow: [mean(0), mean(1), mean(2)],
  };
}

/** The tone of the pixels of a mask in a region. */
export interface RegionTone {
  /** The number of pixels in the mask. A change of the count shows a change of the pixel set. */
  readonly pixels: number;
  /** The luma at 10%, 50%, and 90% of the pixels, from 0 to 255. */
  readonly luma: readonly [number, number, number];
  /** The median of the hue, in degrees. */
  readonly hue: number;
  /** The median of the saturation, from 0 to 1. */
  readonly saturation: number;
}

/**
 * Tells if a color is in a mask.
 *
 * @param color The color, from 0 to 255 for each channel.
 * @param mask The mask.
 * @returns True if each value lies strictly inside its range.
 */
function inMask(color: readonly [number, number, number], mask: PixelMask): boolean {
  const [hue, saturation] = hueSaturation(color);
  const value = luma(...color);
  const inside = (v: number, [lo, hi]: readonly [number, number]): boolean => v > lo && v < hi;
  return inside(hue, mask.hue) && inside(saturation, mask.saturation) && inside(value, mask.luma);
}

/**
 * Measures the tone of colors: the luma percentiles, the median hue, and the median saturation,
 * with the percentile rule of `at()`.
 *
 * @param colors The colors, from 0 to 255 for each channel.
 * @returns The tone, or `null` with no colors.
 */
export function toneOf(colors: readonly (readonly [number, number, number])[]): RegionTone | null {
  if (colors.length === 0) {
    return null;
  }
  const lumas = colors.map((c) => luma(...c)).toSorted((a, b) => a - b);
  const hues = colors.map((c) => hueSaturation(c)[0]).toSorted((a, b) => a - b);
  const saturations = colors.map((c) => hueSaturation(c)[1]).toSorted((a, b) => a - b);
  return {
    pixels: colors.length,
    luma: [at(lumas, 0.1), at(lumas, 0.5), at(lumas, 0.9)],
    hue: at(hues, 0.5),
    saturation: at(saturations, 0.5),
  };
}

/**
 * Measures the tone of the pixels of a mask in a box.
 *
 * @param image The image.
 * @param box The box.
 * @param mask The mask, or `null` for all pixels.
 * @returns The tone, or `null` when no pixel is in the mask.
 */
export function regionTone(
  image: Pixels,
  box: PixelBox,
  mask: PixelMask | null,
): RegionTone | null {
  const colors = boxColors(image, box);
  return toneOf(mask ? colors.filter((c) => inMask(c, mask)) : colors);
}

/** A frame that the look lab measures. */
export interface LookFrame {
  /** The label of the frame in the tables. */
  readonly label: string;
  /** The pixels. */
  readonly image: Pixels;
  /** The height, in pixels. */
  readonly height: number;
  /** The kind of the boxes of the regions, or `null` for a frame with no regions. */
  readonly boxes: 'app' | 'reference' | null;
  /** The camera of the frame, or `null` for the reference. */
  readonly camera: LookCamera | null;
}

/** A camera of {@link LOOK_CAMERAS}. */
export type LookCamera = (typeof LOOK_CAMERAS)[number];

/**
 * Gives the box of a region in a frame.
 *
 * @param region The region.
 * @param frame The frame.
 * @returns The box, or `null` for a frame with no box of the region.
 */
function boxIn(region: LookRegion, frame: LookFrame): PixelBox | null {
  if (frame.boxes === 'app') {
    return region.app;
  }
  return frame.boxes === 'reference' ? region.reference : null;
}

/** The measures of the regions of {@link LOOK_REGIONS} in one frame, by the name of the region. */
export interface RegionMeasures {
  /** The median color of each region of the kind `color`. */
  readonly colors: ReadonlyMap<string, readonly [number, number, number]>;
  /** The contrast of each region of the kind `contrast`. */
  readonly contrasts: ReadonlyMap<string, RegionContrast>;
  /** The tone of each region of the kind `tone`, or `null` when no pixel is in its mask. */
  readonly tones: ReadonlyMap<string, RegionTone | null>;
}

/**
 * Measures the regions of {@link LOOK_REGIONS} in one frame. A region with no box in the frame
 * gives no entry.
 *
 * @param frame The frame.
 * @returns The measures.
 */
export function measureRegions(frame: LookFrame): RegionMeasures {
  const colors = new Map<string, [number, number, number]>();
  const contrasts = new Map<string, RegionContrast>();
  const tones = new Map<string, RegionTone | null>();
  for (const region of LOOK_REGIONS) {
    const box = boxIn(region, frame);
    if (!box) {
      continue;
    }
    if (region.kind === 'color') {
      colors.set(region.name, regionColor(frame.image, box));
    } else if (region.kind === 'contrast') {
      contrasts.set(region.name, regionContrast(frame.image, box));
    } else {
      tones.set(region.name, regionTone(frame.image, box, region.mask));
    }
  }
  return { colors, contrasts, tones };
}

/**
 * Writes the tables of the look lab as Markdown.
 *
 * @param frames The frames.
 * @param regions The regions of the camera `default`, from {@link lookRegions}.
 * @returns The text.
 */
export function lookTables(
  frames: readonly LookFrame[],
  regions: readonly DefaultRegion[],
): string {
  const f = (value: number, digits = 0): string => value.toFixed(digits);
  const lines = [
    '## Stage tone',
    '',
    '| Frame | p5 | p25 | p50 | p75 | p95 | Median saturation |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const frame of frames) {
    const tone = stageTone(frame.image, frame.height);
    lines.push(`| ${frame.label} | ${tone.percentiles.join(' | ')} | ${f(tone.saturation, 2)} |`);
  }

  const measured = frames
    .filter((frame) => frame.boxes)
    .map((frame) => ({ frame, measures: measureRegions(frame) }));
  lines.push(
    '',
    '## Colors of the regions',
    '',
    '| Region | Frame | Median RGB | Luma | Hue | Saturation |',
    '|---|---|---|---|---|---|',
  );
  for (const region of LOOK_REGIONS.filter((r) => r.kind === 'color')) {
    for (const { frame, measures } of measured) {
      const color = measures.colors.get(region.name);
      if (color) {
        const [hue, saturation] = hueSaturation(color);
        lines.push(
          `| ${region.name} | ${frame.label} | (${color.join(', ')}) | ${f(luma(...color))} | ${f(hue)} | ${f(saturation, 2)} |`,
        );
      }
    }
  }

  lines.push(
    '',
    '## Shadows on the floor',
    '',
    '| Region | Frame | Luma p5 | Luma p90 | Ratio | Shadow RGB |',
    '|---|---|---|---|---|---|',
  );
  for (const region of LOOK_REGIONS.filter((r) => r.kind === 'contrast')) {
    for (const { frame, measures } of measured) {
      const c = measures.contrasts.get(region.name);
      if (c) {
        lines.push(
          `| ${region.name} | ${frame.label} | ${f(c.dark, 1)} | ${f(c.light, 1)} | ${f(c.light / c.dark, 1)} | (${c.shadow.join(', ')}) |`,
        );
      }
    }
  }

  lines.push(
    '',
    '## Tones of the regions',
    '',
    'A region with a mask measures only the pixels of its colors. The column Pixels gives their',
    'count, so a change of the pixel set shows.',
    '',
    '| Region | Frame | Pixels | Luma p10 | Luma p50 | Luma p90 | Hue | Saturation |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const region of LOOK_REGIONS.filter((r) => r.kind === 'tone')) {
    for (const { frame, measures } of measured) {
      if (!measures.tones.has(region.name)) {
        continue;
      }
      const t = measures.tones.get(region.name);
      lines.push(
        t
          ? `| ${region.name} | ${frame.label} | ${t.pixels} | ${t.luma.map((v) => f(v)).join(' | ')} | ${f(t.hue)} | ${f(t.saturation, 2)} |`
          : `| ${region.name} | ${frame.label} | 0 | - | - | - | - | - |`,
      );
    }
  }
  lines.push(...defaultTable(frames, regions));
  return `${lines.join('\n')}\n`;
}

/** The columns of a row of {@link lookSummary}: the name and the text of each measure. */
export type SummaryRow = readonly (readonly [name: string, text: string])[];

/**
 * Gives the measures of the camera `orchestra` in one row. `pnpm look-variants` prints one row for
 * each variant.
 *
 * @param frame The frame of the camera `orchestra`, or the reference.
 * @returns The columns. A measure with no box or no pixel in the frame gives `-`.
 */
export function lookSummary(frame: LookFrame): SummaryRow {
  const f = (value: number, digits = 0): string => value.toFixed(digits);
  const { colors, contrasts, tones } = measureRegions(frame);
  const color = (name: string): string => {
    const c = colors.get(name);
    if (!c) {
      return '-';
    }
    const [hue, saturation] = hueSaturation(c);
    return `${f(luma(...c))}/${f(hue)}°/${f(saturation, 2)}`;
  };
  const tone = (name: string, full: boolean): string => {
    const t = tones.get(name);
    if (!t) {
      return '-';
    }
    const [p10, p50, p90] = t.luma.map((v) => f(v));
    return full
      ? `${p10}/${p50}/${p90} ${f(t.hue)}°/${f(t.saturation, 2)}`
      : `${p50}/${f(t.hue)}°/${f(t.saturation, 2)}`;
  };
  const stage = stageTone(frame.image, frame.height).percentiles;
  const shadow = contrasts.get('floor with the shadows of the players');
  const hall = tones.get('hall above the stage, right of the beam');
  return [
    ['stage p5/p50/p95', `${stage[0]}/${stage[2]}/${stage[4]}`],
    ['fur L/hue/sat', color('white fur, front left rabbit')],
    ['rabbit torso p10/p50/p90 hue/sat', tone('rabbit torso, front left', true)],
    ['floor L', color('lit floor, left of the podium')],
    ['floor R', color('lit floor, right of the podium')],
    ['chair L/hue/sat', tone('chair, front left', false)],
    ['shadow p5/ratio', shadow ? `${f(shadow.dark)}/${f(shadow.light / shadow.dark, 1)}` : '-'],
    ['conductor', color('back of the conductor')],
    ['hall p50/p90', hall ? `${f(hall.luma[1])}/${f(hall.luma[2])}` : '-'],
  ];
}

/**
 * Calculates the regions of the camera `default` from the layout of {@link LOOK_DEMO} in the
 * working tree (`tools/look-regions.ts`). A frame of `--base` takes the same regions, so a change
 * of the layout moves its regions.
 *
 * @returns The regions.
 */
export async function lookRegions(): Promise<DefaultRegion[]> {
  const models = new ModelCache();
  const layout = layoutScene(scoreOf((await patchedDemo(`${LOOK_DEMO}.mid`)).bytes), models);
  return defaultRegions(layout, models, LOOK_FRAME.width, LOOK_FRAME.height);
}

/** The measure of a region of the camera `default` in one frame. */
export interface DefaultMeasure {
  /** The region. */
  readonly region: DefaultRegion;
  /** The tone of the pixels of the region, or `null` with no pixel. */
  readonly tone: RegionTone | null;
  /**
   * The count of the pixels in the mask of the region in this frame. With the pixel set of
   * another frame, it differs from the count of the tone.
   */
  readonly own: number;
}

/**
 * Gives the pixels of a region in a frame: the pixels of the layout in a frame of the app, or the
 * pixels of the boxes of the reference.
 *
 * @param frame The frame.
 * @param region The region.
 * @returns The pixels, as `y × width + x`, or `null` when the frame has no such region.
 */
function regionPixels(frame: LookFrame, region: DefaultRegion): Uint32Array | null {
  if (frame.camera === 'default') {
    return region.pixels;
  }
  if (frame.boxes !== 'reference' || !region.reference) {
    return null;
  }
  const pixels: number[] = [];
  for (const [left, top, right, bottom] of region.reference) {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        pixels.push(y * frame.image.width + x);
      }
    }
  }
  return Uint32Array.from(pixels);
}

/**
 * Reads the colors of pixels.
 *
 * @param image The image.
 * @param pixels The pixels, as `y × width + x`.
 * @returns The colors.
 */
function pixelColors(image: Pixels, pixels: Uint32Array): [number, number, number][] {
  return Array.from(pixels, (i) => [
    image.rgba[i * 4] ?? 0,
    image.rgba[i * 4 + 1] ?? 0,
    image.rgba[i * 4 + 2] ?? 0,
  ]);
}

/**
 * Gives the pixels of a region that are in its mask in a frame.
 *
 * @param frame The frame.
 * @param region The region.
 * @returns The pixels, or `null` when the frame has no such region.
 */
export function maskedPixels(frame: LookFrame, region: DefaultRegion): Uint32Array | null {
  const pixels = regionPixels(frame, region);
  const mask = region.mask;
  if (!pixels || !mask) {
    return pixels;
  }
  return pixels.filter((i) => {
    const r = frame.image.rgba[i * 4] ?? 0;
    const g = frame.image.rgba[i * 4 + 1] ?? 0;
    const b = frame.image.rgba[i * 4 + 2] ?? 0;
    return inMask([r, g, b], mask);
  });
}

/**
 * Measures the regions of the camera `default` in a frame. A region with a mask measures the
 * pixels of the mask in `pixelsOf`, so that two frames under two lights compare on one pixel set
 * (`docs/agents/look-work.md`, "Traps"). The reference takes its own boxes and its own mask.
 *
 * @param frame The frame of the camera `default`, or the reference.
 * @param regions The regions of {@link lookRegions}.
 * @param pixelsOf The frame of the camera `default` that gives the pixels of the masks, or `null`
 *   for the frame itself.
 * @returns The measure of each region that the frame has.
 */
export function measureDefault(
  frame: LookFrame,
  regions: readonly DefaultRegion[],
  pixelsOf: LookFrame | null,
): DefaultMeasure[] {
  const source = frame.camera === 'default' && pixelsOf ? pixelsOf : frame;
  return regions.flatMap((region) => {
    const own = maskedPixels(frame, region);
    const pixels = source === frame ? own : maskedPixels(source, region);
    if (!own || !pixels) {
      return [];
    }
    return [{ region, tone: toneOf(pixelColors(frame.image, pixels)), own: own.length }];
  });
}

/**
 * Writes the table of the regions of the camera `default` as Markdown: the reference, each frame
 * with its own pixel sets, and the frame of the tree with the pixel sets of the base.
 *
 * @param frames The frames.
 * @param regions The regions of {@link lookRegions}.
 * @returns The lines.
 */
export function defaultTable(
  frames: readonly LookFrame[],
  regions: readonly DefaultRegion[],
): string[] {
  const f = (value: number, digits = 0): string => value.toFixed(digits);
  const base = frames.find((frame) => frame.label === 'base, default') ?? null;
  const tree = frames.find((frame) => frame.label === 'tree, default') ?? null;
  const rows: [string, LookFrame, LookFrame | null][] = frames
    .filter((frame) => frame.camera === 'default' || frame.camera === null)
    .map((frame) => [frame.label, frame, null]);
  if (base && tree) {
    rows.push(['tree, default, pixel sets of base', tree, base]);
  }
  const lines = [
    '',
    '## Regions of the camera default',
    '',
    'The regions come from the layout of the default demo (`tools/look-regions.ts`). The white fur',
    'takes the pixels with a saturation below 0.4 and a luma above 60. Pixels gives the count of',
    'the measured pixels, and Own the count of the own mask of the frame. Dropped gives the pixels',
    'of the boxes of the region that nearer items cover. The reference takes the boxes of',
    '`back_measures.py`.',
    '',
    '| Region | Frame | Pixels | Own | Dropped | Luma p10 | Luma p50 | Luma p90 | p10 / p90 | Hue | Saturation |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const ratios: string[] = [];
  for (const [label, frame, pixelsOf] of rows) {
    const measures = measureDefault(frame, regions, pixelsOf);
    for (const { region, tone, own } of measures) {
      const dropped = frame.camera === 'default' ? String(region.dropped) : '-';
      lines.push(
        tone
          ? `| ${region.name} | ${label} | ${tone.pixels} | ${own} | ${dropped} | ${tone.luma.map((v) => f(v)).join(' | ')} | ${f(tone.luma[0] / tone.luma[2], 2)} | ${f(tone.hue)} | ${f(tone.saturation, 2)} |`
          : `| ${region.name} | ${label} | 0 | ${own} | ${dropped} | - | - | - | - | - | - |`,
      );
    }
    const fur = (name: string): number | undefined =>
      measures.find((m) => m.region.name === name)?.tone?.luma[2];
    const front = fur('white fur, front rows');
    const back = fur('white fur, back rows');
    if (front && back) {
      ratios.push(`| ${label} | ${f(back / front, 2)} |`);
    }
  }
  lines.push('', '| Frame | White fur p90, back rows against front rows |', '|---|---|', ...ratios);
  return lines;
}

/**
 * Gives the measures of the camera `default` in one row for `pnpm look-variants`: the luma p50
 * and p90 of the front rows and of the back rows, the luma p50 of the back floor, and the white
 * fur of the front rows and of the back rows with the count of the own mask.
 *
 * @param frame The frame of the camera `default`, or the reference.
 * @param regions The regions of {@link lookRegions}.
 * @param pixelsOf The frame that gives the pixels of the masks, or `null` for the frame itself.
 * @returns The columns. A region that the frame does not have gives `-`.
 */
export function defaultSummary(
  frame: LookFrame,
  regions: readonly DefaultRegion[],
  pixelsOf: LookFrame | null,
): SummaryRow {
  const f = (value: number): string => value.toFixed(0);
  const measures = measureDefault(frame, regions, pixelsOf);
  const of = (name: string): DefaultMeasure | undefined =>
    measures.find((m) => m.region.name === name);
  const rows = (name: string): string => {
    const tone = of(name)?.tone;
    return tone ? `${f(tone.luma[1])}/${f(tone.luma[2])}` : '-';
  };
  const fur = (name: string): string => {
    const m = of(name);
    return m?.tone ? `${f(m.tone.luma[1])}/${f(m.tone.luma[2])} n ${m.own}` : '-';
  };
  const front = of('white fur, front rows')?.tone?.luma[2];
  const back = of('white fur, back rows')?.tone?.luma[2];
  const floor = of('back floor')?.tone;
  return [
    ['front rows p50/p90', rows('front rows')],
    ['back rows p50/p90', rows('back rows')],
    ['back floor p50', floor ? f(floor.luma[1]) : '-'],
    ['fur front p50/p90', fur('white fur, front rows')],
    ['fur back p50/p90', fur('white fur, back rows')],
    ['fur back/front p90', front && back ? (back / front).toFixed(2) : '-'],
  ];
}

/** The colors of the regions in the image of {@link writeRegionsImage}, by the region index. */
const REGION_TINTS: readonly (readonly [number, number, number])[] = [
  [60, 120, 255],
  [60, 220, 90],
  [255, 220, 40],
];

/**
 * Writes a frame of the camera `default` with its regions tinted: the front rows blue, the back
 * rows green, and the back floor yellow. Thus a moved layout or camera shows at once.
 *
 * @param browser The browser that encodes the image.
 * @param frame The frame.
 * @param regions The regions of {@link lookRegions}.
 * @param file The path of the PNG image.
 */
export async function writeRegionsImage(
  browser: Parameters<typeof rgbaPixels>[0],
  frame: LookFrame,
  regions: readonly DefaultRegion[],
  file: string,
): Promise<void> {
  const rgba = Uint8ClampedArray.from(frame.image.rgba);
  for (const [k, region] of regions.slice(0, REGION_TINTS.length).entries()) {
    const tint = REGION_TINTS[k] ?? [0, 0, 0];
    for (const i of region.pixels) {
      for (const [c, value] of tint.entries()) {
        rgba[i * 4 + c] = ((rgba[i * 4 + c] ?? 0) + value) / 2;
      }
    }
  }
  const page = await browser.newPage();
  try {
    const url = await page.evaluate(
      ([width, height, data]) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        const pixels = Uint8ClampedArray.from(atob(data), (ch) => ch.charCodeAt(0));
        context.putImageData(new ImageData(pixels, width, height), 0, 0);
        return canvas.toDataURL('image/png');
      },
      [frame.image.width, frame.height, Buffer.from(rgba).toString('base64')] as const,
    );
    await writeFile(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally {
    await page.close();
  }
}

/**
 * Reads a PNG image as a frame.
 *
 * @param browser The browser that decodes the image.
 * @param path The path of the image.
 * @param label The label of the frame in the tables.
 * @param boxes The kind of the boxes of the regions, or `null`.
 * @param camera The camera of the frame, or `null` for the reference.
 * @returns The frame.
 */
export async function readFrame(
  browser: Parameters<typeof rgbaPixels>[0],
  path: string,
  label: string,
  boxes: LookFrame['boxes'],
  camera: LookCamera | null,
): Promise<LookFrame> {
  const image = await rgbaPixels(browser, await readFile(path));
  return { label, image, height: image.rgba.length / 4 / image.width, boxes, camera };
}

/**
 * Reads the reference and the frames of a look lab folder: the frames of the commit of `--base`
 * (`play-base-<camera>.png`) first, then the frames of the tree (`play-<camera>.png`). A missing
 * frame gives no entry.
 *
 * @param browser The browser that decodes the images.
 * @param dir The folder.
 * @returns The frames, the reference first.
 */
export async function readLookFrames(
  browser: Parameters<typeof rgbaPixels>[0],
  dir: string,
): Promise<LookFrame[]> {
  const frames = [await readFrame(browser, join(ROOT, REFERENCE), 'reference', 'reference', null)];
  for (const [prefix, tree] of [
    ['play-base-', 'base'],
    ['play-', 'tree'],
  ] as const) {
    for (const [i, camera] of LOOK_CAMERAS.entries()) {
      const path = join(dir, `${prefix}${camera}.png`);
      if (existsSync(path)) {
        const boxes = i === 0 ? 'app' : null;
        frames.push(await readFrame(browser, path, `${tree}, ${camera}`, boxes, camera));
      }
    }
  }
  return frames;
}

const USAGE = 'Usage: pnpm look-lab <dir> [--base <ref>] [--url <url>] [--measure]';

/**
 * Renders the frames of the look lab with `pnpm close-views play`, unless `--measure` is given,
 * then measures each frame and the reference, and writes `<dir>/look.md`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [dir, ...rest] = args;
  if (!dir || dir.startsWith('--')) {
    throw new Error(USAGE);
  }
  const measureOnly = rest.includes('--measure');
  const passed = rest.filter((arg) => arg !== '--measure');
  if (!measureOnly) {
    const cameras = LOOK_CAMERAS.flatMap((camera) => ['--camera', camera]);
    const play = ['play', dir, '--time', String(LOOK_TIME_SEC), ...cameras, ...passed];
    // With --url, close-views renders the running site, so the build of `pnpm close-views` is
    // no use. The build also writes `dist/` while another run can read it.
    const [command, line] = passed.includes('--url')
      ? [process.execPath, [join(ROOT, 'tools/close-views.ts'), ...play]]
      : ['pnpm', ['close-views', ...play]];
    execFileSync(command, line, { cwd: ROOT, stdio: 'inherit' });
  }

  const browser = await chromium.launch();
  try {
    const frames = await readLookFrames(browser, dir);
    const regions = await lookRegions();
    const tree = frames.find((frame) => frame.label === 'tree, default');
    if (tree) {
      await writeRegionsImage(browser, tree, regions, join(dir, 'regions-default.png'));
    }
    const text = `# Look lab\n\nThe frames of \`${dir}\` against \`${REFERENCE}\`.\n\n${lookTables(frames, regions)}`;
    await writeFile(join(dir, 'look.md'), text);
    console.log(text);
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  await main();
}
