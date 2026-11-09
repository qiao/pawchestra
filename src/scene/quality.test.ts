import { describe, expect, it } from 'vitest';

import { TIER_SETTINGS, startTier, startTierOf, tierPixelRatio } from './quality.ts';
import type { DeviceSource } from './quality.ts';

describe('startTier', () => {
  it('starts a desktop at the high tier (design 2.6)', () => {
    expect(startTier(false, 1440, 900)).toBe('high');
    expect(startTier(false, 600, 600)).toBe('high');
  });

  it('starts a coarse pointer or a small screen at the medium tier (design 2.6)', () => {
    expect(startTier(true, 1440, 900)).toBe('medium');
    expect(startTier(false, 390, 844)).toBe('medium');
    expect(startTier(false, 1440, 599)).toBe('medium');
  });
});

/** Makes a window whose media queries match only the given queries. */
function device(matching: readonly string[], width: number, height: number): DeviceSource {
  return {
    innerWidth: width,
    innerHeight: height,
    matchMedia: (query) => ({ matches: matching.includes(query) }),
  };
}

describe('startTierOf', () => {
  it('starts a laptop with a touch screen at the high tier (review of step 3, F9)', () => {
    // The touchpad is the primary pointer. The touch screen is a second, coarse pointer.
    const laptop = ['(pointer: fine)', '(any-pointer: fine)', '(any-pointer: coarse)'];
    expect(startTierOf(device(laptop, 1440, 900))).toBe('high');
  });

  it('starts a tablet or a phone at the medium tier (design 2.6)', () => {
    const touch = ['(pointer: coarse)', '(any-pointer: coarse)'];
    expect(startTierOf(device(touch, 1024, 1366))).toBe('medium');
    expect(startTierOf(device(touch, 390, 844))).toBe('medium');
  });
});

describe('tierPixelRatio', () => {
  it('limits the pixel ratio of each tier (design 2.6)', () => {
    expect(tierPixelRatio('high', 3)).toBeGreaterThanOrEqual(tierPixelRatio('medium', 3));
    expect(tierPixelRatio('medium', 3)).toBeGreaterThanOrEqual(tierPixelRatio('low', 3));
    expect(tierPixelRatio('low', 3)).toBe(1);
  });

  it('renders no more pixels than the display has', () => {
    expect(tierPixelRatio('high', 1)).toBe(1);
    expect(tierPixelRatio('medium', 1.25)).toBe(1.25);
  });
});

describe('TIER_SETTINGS (design 2.6)', () => {
  it('drops the expensive post effects on the lower tiers', () => {
    const { high, medium, low } = TIER_SETTINGS;
    expect(high.bloomLevels).toBeGreaterThan(medium.bloomLevels);
    expect(high.blurSamples).toBeGreaterThan(medium.blurSamples);
    expect(high.motes).toBeGreaterThan(medium.motes);
    // A phone starts at the low tier: no bloom, no depth of field, and no dust motes.
    expect(low.bloomLevels).toBe(0);
    expect(low.blurSamples).toBe(0);
    expect(low.motes).toBe(0);
  });

  it('keeps the haze of the beam on each tier, with fewer samples on the lower tiers', () => {
    const samples = (['high', 'medium', 'low'] as const).map((t) => TIER_SETTINGS[t].beamSamples);
    expect(samples).toEqual(samples.toSorted((a, b) => b - a));
    expect(Math.min(...samples)).toBeGreaterThan(0);
  });
});
