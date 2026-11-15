import type { SpeciesColors } from '../src/models/colors.ts';
import { srgb } from '../src/models/mesh.ts';
import type { Finish } from '../src/models/mesh.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { clamp01 } from '../src/math.ts';

/**
 * The map of another palette of a studio body (design 4.4, 4.5): the colors of the species of the
 * mesh, and the colors of the species that takes the palette.
 */
export interface PaletteMap {
  /** The colors of the species whose colors the mesh has, such as the red fox. */
  readonly from: SpeciesColors;
  /** The colors of the species that takes the palette, such as the tan fox. */
  readonly to: SpeciesColors;
}

/**
 * The Oklab distance at which the share of a class falls to 1/e. A face between two species
 * colors takes a mix of their steps, so the palette has no sudden step between two classes.
 */
const SPREAD = 0.08;

/** The classes of the colors of a species, in the order of their steps. */
const CLASSES = ['fur', 'belly', 'accent'] as const;

/**
 * Converts a linear color to Oklab (Björn Ottosson, 2020).
 *
 * @param rgb The linear color.
 * @returns L, a, b.
 */
export function oklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Converts an Oklab color to a linear color, with each channel clipped to 0 to 1.
 *
 * @param lab L, a, b.
 * @returns The linear color.
 */
export function linearOfOklab([lightness, a, b]: Vec3): Vec3 {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (value: number): number => clamp01(value);
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Gives the color map of another palette of a studio body (design 4.4, 4.5). The map moves the
 * Oklab color of each matte face
 * by the step from each color of the species of the mesh (the fur, the belly, and the accent) to
 * the same color of the other species. It blends the steps by the nearness of the face to each
 * color of the species of the mesh ({@link SPREAD}), and a face far from each color takes the step
 * of its nearest color. The hue step of the fur shrinks with the chroma of the face, so a face of
 * low chroma does not turn green. The faces of the other finishes, the gloss of the eyes and of
 * the nose, keep their colors.
 *
 * @param map The colors of the two species.
 * @returns The map of a linear color and its finish to the new linear color.
 */
export function paletteMap(map: PaletteMap): (color: Vec3, finish: Finish) => Vec3 {
  const anchors = CLASSES.map((name) => oklab(srgb(map.from[name])));
  const steps = CLASSES.map((name, k) => {
    const to = oklab(srgb(map.to[name]));
    const from = anchors[k] ?? [0, 0, 0];
    return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  });
  const furChroma = Math.hypot(anchors[0]?.[1] ?? 0, anchors[0]?.[2] ?? 0);

  return (color, finish) => {
    if (finish !== 'matte') {
      return color;
    }

    const lab = oklab(color);
    const distances = anchors.map((anchor) =>
      Math.hypot(lab[0] - anchor[0], lab[1] - anchor[1], lab[2] - anchor[2]),
    );
    const nearest = distances.indexOf(Math.min(...distances));
    const shares = distances.map(
      (d, k) => Math.exp(-((d / SPREAD) ** 2)) + (k === nearest ? 1e-12 : 0),
    );
    const total = shares.reduce((sum, share) => sum + share, 0);
    const chroma = furChroma > 0 ? Math.min(1, Math.hypot(lab[1], lab[2]) / furChroma) : 1;

    const moved: [number, number, number] = [lab[0], lab[1], lab[2]];
    for (const [k, step] of steps.entries()) {
      const share = (shares[k] ?? 0) / total;
      // The hue step of the fur shrinks with the chroma of the face.
      const hue = k === 0 ? chroma : 1;
      moved[0] += share * (step[0] ?? 0);
      moved[1] += share * hue * (step[1] ?? 0);
      moved[2] += share * hue * (step[2] ?? 0);
    }
    return linearOfOklab(moved);
  };
}
