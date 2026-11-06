import { describe, expect, it } from 'vitest';

import { HARP, buildHarp, harpString, harpStringPosition } from './harp.ts';

describe('harpString', () => {
  it('gives each natural note from C1 to G7 its own string', () => {
    expect(harpString(24)).toBe(0);
    expect(harpString(103)).toBe(HARP.strings - 1);
    // C4 is 3 octaves of 7 strings above C1.
    expect(harpString(60)).toBe(21);
  });

  it('plays a sharp on the string of the natural below it', () => {
    expect(harpString(61)).toBe(harpString(60));
    expect(harpString(66)).toBe(harpString(65));
    expect(harpString(70)).toBe(harpString(69));
  });

  it('never goes down as the pitch goes up', () => {
    for (let key = 24; key < 103; key++) {
      expect(harpString(key + 1)).toBeGreaterThanOrEqual(harpString(key));
    }
  });

  it('plays the nearest string for a key outside the harp', () => {
    expect(harpString(10)).toBe(0);
    expect(harpString(120)).toBe(HARP.strings - 1);
  });
});

describe('harpStringPosition', () => {
  it('gives the pluck point of the string, on the line of the target "strings"', () => {
    const target = buildHarp().targets.find((t) => t.kind === 'strings');
    expect(harpStringPosition(24)).toEqual(target?.from);
    expect(harpStringPosition(103)).toEqual(target?.to);
  });

  it('moves the string toward the player as the pitch goes up', () => {
    expect(harpStringPosition(72)[2]).toBeGreaterThan(harpStringPosition(48)[2]);
    expect(harpStringPosition(48)[0]).toBe(0);
  });
});
