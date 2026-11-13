import { describe, expect, it } from 'vitest';

import { relativeLuminance } from './title-shade.ts';

describe('relativeLuminance', () => {
  it('gives the luminance of WCAG 2.2', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 6);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 6);
    expect(relativeLuminance(128, 128, 128)).toBeCloseTo(0.2159, 3);
  });
});
