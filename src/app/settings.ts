import type { QualityTier } from '../scene/quality.ts';
import type { SectionSize } from '../score/types.ts';

/** The value of the setting "Quality": the automatic tier, or a tier of the user (design 2.6). */
export type QualitySetting = 'auto' | QualityTier;

/** One button of a segmented control of the settings. */
export interface SettingOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** The buttons of the setting "Section size", in order (design 2.8, 3.8). */
export const SECTION_SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'one-per-part', label: 'One per part' },
  { value: 'full', label: 'Full' },
] as const satisfies readonly SettingOption<SectionSize>[];

/** The buttons of the setting "Quality", in order (design 2.6, 2.8). */
export const QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const satisfies readonly SettingOption<QualitySetting>[];

/**
 * The value of the setting "Frame rate": a frame at each refresh of the display, or a cap of 60
 * or 30 frames each second (design 2.6).
 */
export type FrameRateSetting = 'auto' | '60' | '30';

/** The buttons of the setting "Frame rate", in order (design 2.6, 2.8). */
export const FRAME_RATE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '60', label: '60 fps' },
  { value: '30', label: '30 fps' },
] as const satisfies readonly SettingOption<FrameRateSetting>[];

/** The dim line below each setting, which explains its values (design 2.8). */
export const SETTING_HELP = {
  sectionSize:
    'The number of animals in the strings and the choir. Auto gives full sections to an orchestral file.',
  quality:
    'A lower quality makes the motion smoother on a slow device. Auto lowers the quality when the frames are slow.',
  frameRate:
    'Auto draws a frame at each refresh of the display. A cap of 60 or 30 fps uses less power.',
} as const;

/**
 * The part of the interval of a cap by which a frame of the browser can come early and still
 * draw. The browser gives its frames at the refresh of the display, with a small jitter.
 */
const CAP_TOLERANCE = 0.1;

/**
 * Tells if a frame of the browser draws under the setting "Frame rate" (design 2.6). With a cap,
 * a frame draws when the interval of the cap, less a small tolerance, has passed since the last
 * drawn frame. The time of a drawn frame is the time of the last one plus the interval, so the
 * mean rate stays at the cap on a display of any refresh rate.
 *
 * @param nowMs The time of the frame of the browser, in milliseconds.
 * @param lastMs The time of the last drawn frame, in milliseconds, or `null` before the first.
 * @param setting The setting "Frame rate".
 * @returns The time of the last drawn frame after this frame, or `null` if this frame does not
 *   draw.
 */
export function frameDue(
  nowMs: number,
  lastMs: number | null,
  setting: FrameRateSetting,
): number | null {
  if (setting === 'auto' || lastMs === null) {
    return nowMs;
  }
  const interval = 1000 / Number(setting);
  const elapsed = nowMs - lastMs;
  if (elapsed < interval * (1 - CAP_TOLERANCE)) {
    return null;
  }
  // After a long stop of the frames, for example in a hidden tab, the count starts again.
  return elapsed < 2 * interval ? lastMs + interval : nowMs;
}

/** The time over which the counter of the settings measures the frame rate, in milliseconds. */
export const FPS_WINDOW_MS = 1000;

/**
 * Gives the rate of the drawn frames for the counter of the settings (design 2.8): the frames in
 * the last {@link FPS_WINDOW_MS}, over the time from the first to the last of them.
 *
 * @param times The times of the drawn frames, in milliseconds, in order.
 * @returns The rate in frames each second, or `null` with fewer than two frames in the window.
 */
export function measuredFrameRate(times: readonly number[]): number | null {
  const last = times.at(-1);
  if (last === undefined) {
    return null;
  }
  const recent = times.filter((time) => time > last - FPS_WINDOW_MS);
  const first = recent[0];
  if (first === undefined || recent.length < 2 || last === first) {
    return null;
  }
  return ((recent.length - 1) * 1000) / (last - first);
}

/** The labels of the two buttons "Auto", with the value that each one selects now. */
export interface AutoLabels {
  /** For example "Auto (Full)". */
  readonly sectionSize: string;
  /** For example "Auto (High)". */
  readonly quality: string;
}

/**
 * Gives the labels of the buttons "Auto" of the settings (design 2.8): the section size that "Auto"
 * gives the current piece (3.8), and the automatic tier (2.6).
 *
 * @param orchestral `Score.orchestral` of the current piece, or `null` before the first piece.
 * @param tier The automatic tier.
 * @returns The labels, for example "Auto (Full)" and "Auto (High)".
 */
export function autoLabels(orchestral: boolean | null, tier: QualityTier): AutoLabels {
  const label = <T extends string>(options: readonly SettingOption<T>[], value: T): string =>
    `Auto (${options.find((option) => option.value === value)?.label ?? value})`;
  return {
    sectionSize:
      orchestral === null
        ? 'Auto'
        : label(SECTION_SIZE_OPTIONS, orchestral ? 'full' : 'one-per-part'),
    quality: label(QUALITY_OPTIONS, tier),
  };
}

/** A measure of the frame intervals above this value is slow, in seconds (design 2.6). */
const SLOW_FRAME_SEC = 0.018;

/** The time of the frames that the automatic tier measures before a decision, in seconds. */
const TIER_WINDOW_SEC = 2;

/**
 * The part of the intervals of a window that the measure leaves out at each end: the shortest
 * and the longest. Thus a few long frames, for example of a scene build, do not drop the tier.
 */
const TRIM_SHARE = 0.05;

/**
 * The frame intervals of the steady frame rates below 60 fps that a lower tier does not make
 * faster, in seconds: a display at 50 Hz, and the 30 fps limit of a browser in a power-saving
 * mode (design 2.6).
 */
const CAPPED_FRAME_SECS = [1 / 50, 1 / 30] as const;

/**
 * The largest distance of an interval from a value of {@link CAPPED_FRAME_SECS} in a steady capped
 * rate, as a part of that value.
 */
const CAPPED_SPREAD = 0.2;

/**
 * The least part of the kept intervals of a window in the band of a capped rate
 * ({@link CAPPED_SPREAD}), so that the window keeps that rate. The other intervals are missed
 * frames.
 */
const CAPPED_SHARE = 0.9;

/**
 * The largest distance of the mean of the intervals in the band of a value of
 * {@link CAPPED_FRAME_SECS} from that value in a window at that rate, as a part of that value. The
 * intervals of a display at 60 Hz (16.7 ms) lie in the band of 50 Hz (16 ms to 24 ms), but 17% from
 * 20 ms.
 */
const CAPPED_MEAN_SPREAD = 0.1;

/**
 * The frame interval of a display at 60 Hz, in seconds. {@link SLOW_FRAME_SEC} is 1.08 times it.
 * A window at a capped rate is slow at 1.08 times the capped interval, so it permits the same
 * share of missed frames as a window at 60 Hz.
 */
const DISPLAY_60_SEC = 1 / 60;

/** The state of the automatic tier: the tier, and the frames of the current window. */
export interface TierWatch {
  readonly tier: QualityTier;
  /** The wall time of the first frame of the window, in seconds, or `null` for no window. */
  readonly windowStart: number | null;
  /** The wall time of the last frame of the window, in seconds. */
  readonly lastFrame: number;
  /** The intervals between the frames of the window, in seconds, in order. */
  readonly intervals: readonly number[];
}

/**
 * Starts the automatic tier at the tier of the device (design 2.6). It also starts a new window
 * after a known stop of the frames, for example a build of the scene.
 *
 * @param tier The start tier, from `startTier()` of `scene/quality.ts`, or the current tier.
 * @returns The watch with no window.
 */
export function watchTier(tier: QualityTier): TierWatch {
  return { tier, windowStart: null, lastFrame: 0, intervals: [] };
}

/** The next lower tier of each tier. The low tier stays low. */
const LOWER_TIER = {
  high: 'medium',
  medium: 'low',
  low: 'low',
} as const satisfies Readonly<Record<QualityTier, QualityTier>>;

/**
 * Tells if the frames of a window are slow (design 2.6). The measure is the mean interval
 * without the shortest and the longest 5%. A window at one steady rate of
 * {@link CAPPED_FRAME_SECS} is not slow: a display at 50 Hz, or a browser that limits the frame
 * rate to 30 fps in a power-saving mode, gives such a window, and a lower tier does not make its
 * frames faster. Such a window keeps at least {@link CAPPED_SHARE} of its kept intervals in the
 * band of the rate, with their mean near the rate, and its mean is at most 1.08 times the capped
 * interval, so it permits the same share of missed frames as a window at 60 Hz.
 *
 * @param intervals The intervals of the window, in seconds. There is at least one.
 * @returns True if the tier drops.
 */
export function slowWindow(intervals: readonly number[]): boolean {
  const trim = Math.floor(intervals.length * TRIM_SHARE);
  const kept = intervals.toSorted((a, b) => a - b).slice(trim, intervals.length - trim);
  const mean = kept.reduce((sum, interval) => sum + interval, 0) / kept.length;
  if (mean <= SLOW_FRAME_SEC) {
    return false;
  }

  const capped = CAPPED_FRAME_SECS.some((cap) => {
    const inBand = kept.filter((interval) => Math.abs(interval - cap) <= CAPPED_SPREAD * cap);
    const bandMean = inBand.reduce((sum, interval) => sum + interval, 0) / inBand.length;
    const steady =
      inBand.length >= CAPPED_SHARE * kept.length &&
      Math.abs(bandMean - cap) <= CAPPED_MEAN_SPREAD * cap;
    return steady && mean <= cap * (SLOW_FRAME_SEC / DISPLAY_60_SEC);
  });
  return !capped;
}

/**
 * Follows the frames of the page for the automatic tier (design 2.6). The tier drops one step
 * when the frames of a window of 2 s are slow ({@link slowWindow}). It only goes down, so the
 * quality does not go down and up many times. A frame that does not measure ends the window, so
 * that the time of a pause or of a hidden tab does not count.
 *
 * @param watch The watch before the frame.
 * @param wallTime The wall time of the frame, in seconds.
 * @param measuring True while the music plays, the tab is visible, and the setting is "Auto".
 * @returns The watch after the frame.
 */
export function followFrame(watch: TierWatch, wallTime: number, measuring: boolean): TierWatch {
  if (!measuring) {
    return watch.windowStart === null ? watch : watchTier(watch.tier);
  }
  if (watch.windowStart === null) {
    return { tier: watch.tier, windowStart: wallTime, lastFrame: wallTime, intervals: [] };
  }
  const intervals = [...watch.intervals, wallTime - watch.lastFrame];
  if (wallTime - watch.windowStart < TIER_WINDOW_SEC) {
    return { tier: watch.tier, windowStart: watch.windowStart, lastFrame: wallTime, intervals };
  }
  const tier = slowWindow(intervals) ? LOWER_TIER[watch.tier] : watch.tier;
  return { tier, windowStart: wallTime, lastFrame: wallTime, intervals: [] };
}

/**
 * Gives the tier of the renderer (design 2.6). A manual setting overrides the automatic tier.
 *
 * @param setting The setting "Quality".
 * @param watch The automatic tier.
 * @returns The tier.
 */
export function renderTier(setting: QualitySetting, watch: TierWatch): QualityTier {
  return setting === 'auto' ? watch.tier : setting;
}
