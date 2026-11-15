/**
 * A quality tier of the renderer (design 2.6). `medium-125` and `medium-100` are the steps of the
 * automatic tier between the medium and the low tier: the medium tier with the largest pixel ratio
 * 1.25 and 1.0. The setting "Quality" has no button for them.
 */
export type QualityTier = 'high' | 'medium' | 'medium-125' | 'medium-100' | 'low';

/** The render values of one quality tier. MSAA is on in all tiers. */
interface TierSettings {
  /** The width and the height of the shadow map of the key light, in texels. */
  readonly shadowMapSize: number;
  /**
   * The blur radius of the `PCFShadowMap` filter, in texels. three.js r186 replaces
   * `PCFSoftShadowMap` with `PCFShadowMap`, so a larger radius makes the soft shadows of the high
   * tier.
   */
  readonly shadowRadius: number;
  /** The largest pixel ratio of the canvas. */
  readonly maxPixelRatio: number;
  /** The number of levels of the bloom, from half size down. 0 turns the bloom off. */
  readonly bloomLevels: number;
  /** The number of samples of the depth of field for each pixel. 0 turns it off. */
  readonly blurSamples: number;
  /** True for the lateral color of the lens at the frame edges (`LENS_FRINGE` of `post.ts`). */
  readonly lensFringe: boolean;
  /** The number of dust motes in the visible beam. */
  readonly motes: number;
  /** The number of samples of the haze of the visible beam along each view ray. */
  readonly beamSamples: number;
  /**
   * The number of samples of the contact shade for each pixel of the surface pass (`CONTACT_SHADE`
   * of `surface.ts`). 0 turns it off.
   */
  readonly contactSamples: number;
  /**
   * The size of the surface pass: 1 for half the size of the canvas, 2 for a quarter. A quarter
   * reads the depth for a quarter of the pixels of the half size.
   */
  readonly surfaceLevel: 1 | 2;
  /** True for the floor gloss of the surface pass (`FLOOR_GLOSS` of `surface.ts`). */
  readonly floorGloss: boolean;
  /**
   * The scale of the side of each color map and normal map of a body on the GPU
   * (`body-texture.ts`): 1 for the size of the file, 0.5 for half the side and a quarter of the
   * memory.
   */
  readonly bodyMapScale: 1 | 0.5;
}

/** The values of the medium tier ({@link TIER_SETTINGS}). Its steps change only the pixel ratio. */
const MEDIUM_TIER = {
  shadowMapSize: 1024,
  shadowRadius: 1,
  maxPixelRatio: 1.5,
  bloomLevels: 5,
  blurSamples: 16,
  lensFringe: true,
  motes: 70,
  beamSamples: 3,
  contactSamples: 6,
  surfaceLevel: 2,
  floorGloss: false,
  bodyMapScale: 0.5,
} as const satisfies TierSettings;

/**
 * The values of each tier (design 2.6). The low tier keeps the final pass of the post effects
 * (the tone mapping, the color grade, the vignette, and the grain), because it costs one sample
 * for each pixel. It drops the bloom, the lens fringe, the depth of field, and the dust motes.
 * The high tier has the surface pass of the contact shade and the floor gloss at half size. The
 * medium tier has only a cheap contact shade, at a quarter size with fewer samples, so that a
 * phone does not look flat. The floor gloss traces a ray for each floor pixel, so it stays on the
 * high tier. The medium and the low tiers load the body maps at half size: the maps of a large
 * cast took about 390 MB of GPU memory at full size, and a phone can lose the WebGL context
 * with so much. A head of a close shot on a phone is about 350 pixels high, so half size is
 * enough.
 * No tier has the shadows of the side lights: they cost about 0.9 ms of GPU time in each frame of
 * `perf-60.mid`, and they changed only small shadows on the players.
 * The steps `medium-125` and `medium-100` lower only the pixel ratio of the medium tier, because
 * the pixel count is a smooth lever, and the post effects make the look of the film.
 */
export const TIER_SETTINGS = {
  high: {
    shadowMapSize: 2048,
    // 5 in place of 3: with 3, the shadow of an arm on the white trunk of the rabbit shows black
    // wedges with the steps of the map.
    shadowRadius: 5,
    // 1.5 in place of 2: the GPU time grows with the pixels, and 2 cost about 2.8 ms more of each
    // frame of `perf-60.mid` on a Retina screen (design 9.7). The image is a little softer.
    maxPixelRatio: 1.5,
    bloomLevels: 6,
    blurSamples: 32,
    lensFringe: true,
    motes: 140,
    beamSamples: 4,
    contactSamples: 10,
    surfaceLevel: 1,
    floorGloss: true,
    bodyMapScale: 1,
  },
  medium: MEDIUM_TIER,
  'medium-125': { ...MEDIUM_TIER, maxPixelRatio: 1.25 },
  'medium-100': { ...MEDIUM_TIER, maxPixelRatio: 1 },
  low: {
    shadowMapSize: 512,
    shadowRadius: 1,
    maxPixelRatio: 1,
    bloomLevels: 0,
    blurSamples: 0,
    lensFringe: false,
    motes: 0,
    beamSamples: 2,
    contactSamples: 0,
    surfaceLevel: 1,
    floorGloss: false,
    bodyMapScale: 0.5,
  },
} as const satisfies Readonly<Record<QualityTier, TierSettings>>;

/** A viewport with a shorter side below this value, in CSS pixels, is a small screen (2.6). */
const SMALL_SCREEN_SIDE = 600;

/**
 * Selects the tier at start from the device (design 2.6).
 *
 * @param coarsePointer True if the primary pointer is a finger, as on a phone or a tablet.
 * @param viewportWidth The width of the viewport, in CSS pixels.
 * @param viewportHeight The height of the viewport, in CSS pixels.
 * @returns `medium` for a coarse pointer or a small screen, else `high`.
 */
export function startTier(
  coarsePointer: boolean,
  viewportWidth: number,
  viewportHeight: number,
): QualityTier {
  if (coarsePointer || Math.min(viewportWidth, viewportHeight) < SMALL_SCREEN_SIDE) {
    return 'medium';
  }
  return 'high';
}

/** The part of a window that {@link startTierOf} reads. */
export interface DeviceSource {
  readonly innerWidth: number;
  readonly innerHeight: number;
  matchMedia(query: string): { readonly matches: boolean };
}

/**
 * Selects the tier at start from a window (design 2.6). The media query `(pointer: coarse)` is
 * the touch signal. A laptop with a touch screen has a fine primary pointer, so it starts at the
 * high tier.
 *
 * @param source The window.
 * @returns The start tier.
 */
export function startTierOf(source: DeviceSource): QualityTier {
  const coarse = source.matchMedia('(pointer: coarse)').matches;
  return startTier(coarse, source.innerWidth, source.innerHeight);
}

/**
 * Calculates the pixel ratio of the canvas. A tier never renders more pixels than the display has.
 *
 * @param tier The quality tier.
 * @param devicePixelRatio The `devicePixelRatio` of the window.
 * @returns The smaller of the device ratio and the limit of the tier.
 */
export function tierPixelRatio(tier: QualityTier, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, TIER_SETTINGS[tier].maxPixelRatio);
}
