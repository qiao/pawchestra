import { describe, expect, it } from 'vitest';

import { SPECIES } from '../src/models/species.ts';
import { buildPlayer } from '../src/models/player.ts';
import { SPECIES_HOLDS } from '../src/pose/bowed-rig.ts';
import { lapPoint } from '../src/pose/lap.ts';
import { windHoldOf } from '../src/pose/winds.ts';
import {
  armFactorFor,
  windReach,
  windReachLines,
  freeRestReach,
  holdReach,
  holdReachLines,
  holdReachVariantLines,
  parseReachOptions,
  reachShare,
  ruleFactor,
  ruleSize,
  scrollReach,
  sizeReach,
  takeSizes,
  violinReachAt,
} from './hold-reach.ts';
import type { HoldReach } from './hold-reach.ts';

describe('ruleFactor', () => {
  it('gives the factor that puts the scroll at the distance of the arm from the shoulder', () => {
    // The tail end at the shoulder joint, and the scroll 1 m out.
    expect(ruleFactor([0, 0, 0], [1, 0, 0], [0, 0, 0], 0.5)).toBeCloseTo(0.5, 12);
    // The shoulder joint 0.3 m beside the line, and the scroll 0.4 m from the tail end.
    expect(ruleFactor([0, 0, 0], [0.4, 0, 0], [0, 0.3, 0], 0.5)).toBeCloseTo(1, 12);
  });

  it('gives null when no length of the instrument comes to the palm', () => {
    // The line stays 0.3 m from the shoulder joint, and the arm is 0.2 m long.
    expect(ruleFactor([0, 0, 0], [0.4, 0, 0], [0, 0.3, 0], 0.2)).toBeNull();
    // The scroll points away from the shoulder joint, and the tail end is out of reach.
    expect(ruleFactor([0, 0, 0], [-1, 0, 0], [1, 0, 0], 0.5)).toBeNull();
  });
});

describe('ruleSize', () => {
  const reach: HoldReach = {
    arms: { L: 0.4, R: 0.4 },
    length: 0.5,
    scale: 0.8,
    scroll: 0.3,
    stopRange: [0, 1],
    bowRange: [0, 0.4],
    hairLength: 0.4,
    ruleFactor: 0.5,
  };

  it('multiplies the scale and the length by the factor of the rule', () => {
    expect(ruleSize(reach)).toEqual({ scale: 0.4, length: 0.25 });
  });

  it('gives null when no length puts the scroll in the palm', () => {
    expect(ruleSize({ ...reach, ruleFactor: null })).toBeNull();
  });
});

describe('pnpm hold-reach (design 4.6)', () => {
  it('puts the scroll in the middle of the palm when the player has the violin of the rule', () => {
    // The violin of the app is larger than the violin of the rule for the rabbit.
    const reach = violinReachAt('rabbit', 'chair', 1);
    const factor = reach.ruleFactor;
    if (factor === null) {
      throw new Error('The rule gives no violin for the rabbit.');
    }

    const rebuilt = violinReachAt('rabbit', 'chair', reach.scale * factor);
    expect(factor).toBeLessThan(1);
    expect(rebuilt.length).toBeCloseTo(reach.length * factor, 6);
    expect(Math.abs(rebuilt.scroll - rebuilt.arms.L)).toBeLessThan(1e-3);
  });

  it('puts the violin scale of the species back after the measure', () => {
    const before = SPECIES.rabbit.violinScale;
    violinReachAt('rabbit', 'chair', 0.3);
    violinReachAt('fox-tan', 'chair', 0.3);
    expect(SPECIES.rabbit.violinScale).toBe(before);
    expect(Object.hasOwn(SPECIES['fox-tan'], 'violinScale')).toBe(false);
  });

  it('reports the arms, the reached parts, and the rule for each instrument', () => {
    const violin = holdReachLines('rabbit', 'violin', 'chair').join('\n');
    for (const part of [
      'Arm from the shoulder joint to the middle of the palm',
      'Left shoulder joint to the scroll',
      'stopRange',
      'bowRange',
      'Rule of a violin shop',
      'Real violins',
      'Check, rebuilt',
    ]) {
      expect(violin, part).toContain(part);
    }
    const viola = holdReachLines('rabbit', 'viola', 'chair').join('\n');
    expect(viola).toContain('Rule of a violin shop');
    expect(viola).toContain('no scale of the viola');
  });
});

describe('pnpm hold-reach --instrument flute (design 4.6)', () => {
  it('measures each palm to its grip in the playing pose and in the rest pose', () => {
    // The wolf has the parametric biped, and the tan fox the studio body of the fox mesh.
    const wolf = windReach('wolf', 'flute', 'chair');
    const fox = windReach('fox-tan', 'flute', 'chair');

    for (const side of ['L', 'R'] as const) {
      expect(wolf[side].play).toBeLessThan(wolf[side].arm);
      expect(fox[side].arm).not.toBeCloseTo(wolf[side].arm, 3);
      expect(fox[side].play).toBeGreaterThan(0.1);
      expect(fox[side].rest).toBeGreaterThan(0.1);
    }
  });

  it('reports the reach or the miss of each palm', () => {
    const text = windReachLines('wolf', 'flute', 'chair').join('\n');
    for (const part of ['L: arm', 'R: arm', 'Playing pose', 'Rest pose', 'to spare']) {
      expect(text, part).toContain(part);
    }
  });

  it('gives the rest place of a paw that leaves its grip, and no rest grip of that paw', () => {
    // The tan fox frees its left paw in the rest pose, and the wolf keeps both paws on the flute.
    expect(freeRestReach('wolf', 'flute', 'chair')).toEqual([]);
    const [seated] = freeRestReach('fox-tan', 'flute', 'chair');
    expect(seated?.side).toBe('L');
    expect(seated?.kind).toBe('lap');
    // The middle of the palm is at the lap place of the hold.
    const lap = windHoldOf('fox-tan', 'flute').restFreeL?.lap;
    const model = buildPlayer('fox-tan', 'flute', 4, 'chair');
    const place = lap ? lapPoint(model, 'L', lap) : [0, 0, 0];
    for (const k of [0, 1, 2] as const) {
      expect(seated?.palm?.[k]).toBeCloseTo(place[k], 5);
    }
    const share = seated ? reachShare(seated) : null;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(1.5);
    const [standing] = freeRestReach('fox-tan', 'flute', 'stand');
    expect(standing && reachShare(standing)).toBeNull();

    const lines = windReachLines('fox-tan', 'flute', 'chair');
    const rest = lines.filter((line) => line.includes('Rest pose'));
    expect(rest).toHaveLength(2);
    expect(rest[0]).toMatch(/^ {4}Rest pose: the paw leaves its grip for the thigh \(restFreeL\)/);
    expect(rest[1]).toMatch(/^ {4}Rest pose: shoulder joint to the grip/);
    expect(windReachLines('fox-tan', 'flute', 'stand').join('\n')).toContain('the arm hangs down');
  });

  it('marks a rest place out of the reach of the arm', () => {
    const lines = holdReachVariantLines('fox-tan', {
      instrument: 'flute',
      support: 'chair',
      sets: ['flute@fox-tan.restFreeL.lap.offset=-0.6,-0.13,0.1'],
    });
    const rest = lines.filter((line) => line.includes('for the thigh'));
    expect(rest[0]).not.toContain('out of reach');
    expect(rest[1]).toMatch(/, 1\.\d{3} of the arm, out of reach$/);
  });
});

describe('parseReachOptions', () => {
  it('gives the violin on the chair with no variant by default', () => {
    expect(parseReachOptions([])).toEqual({ instrument: 'violin', support: 'chair', sets: [] });
  });

  it('reads each --set as one variant beside the other options', () => {
    const options = parseReachOptions([
      '--set',
      'violin@rabbit.lean=12deg',
      '--support',
      'stand',
      '--set',
      'violin@rabbit.slant=0;violin@rabbit.lean=0',
    ]);
    expect(options.support).toBe('stand');
    expect(options.sets).toEqual([
      'violin@rabbit.lean=12deg',
      'violin@rabbit.slant=0;violin@rabbit.lean=0',
    ]);
  });

  it('stops on an unknown option, on an option with no value, and on a value that is not permitted', () => {
    expect(() => parseReachOptions(['--glow', 'x'])).toThrow('is not known');
    expect(() => parseReachOptions(['--set'])).toThrow('has no value');
    expect(() => parseReachOptions(['--support', 'floor'])).toThrow('--support takes one of');
    expect(() => parseReachOptions(['--instrument', 'cello'])).toThrow('--instrument takes one of');
  });
});

describe('holdReachVariantLines', () => {
  /**
   * Gives the distance from the left shoulder joint to the scroll of each report of the lines.
   *
   * @param lines The lines of the reports.
   * @returns The distances, in meters.
   */
  const scrolls = (lines: readonly string[]): number[] =>
    lines.flatMap((line) => {
      const match = /to the scroll in the playing pose: ([\d.]+) m/.exec(line);
      return match ? [Number(match[1])] : [];
    });

  it('reports the flute for --instrument flute', () => {
    const lines = holdReachVariantLines('wolf', {
      instrument: 'flute',
      support: 'chair',
      sets: [],
    });
    expect(lines[0]).toContain('wolf with the flute on the chair');
  });

  it('measures each variant with its changes, and puts the holds back after it', () => {
    const shift = SPECIES_HOLDS.rabbit?.violin?.playShift;
    const lines = holdReachVariantLines('rabbit', {
      instrument: 'violin',
      support: 'chair',
      sets: ['violin@rabbit.playShift=-0.054,-0.005,0.311'],
    });

    expect(lines[0]).toBe('base:');
    expect(lines).toContain('violin@rabbit.playShift=-0.054,-0.005,0.311:');
    const [base = 0, moved = 0] = scrolls(lines);
    // The violin moves 0.16 H back, so its scroll comes nearer to the left shoulder joint.
    expect(moved).toBeLessThan(base - 0.01);
    expect(SPECIES_HOLDS.rabbit?.violin?.playShift).toEqual(shift);
  });

  it('stops on a variant that does not fit before the first report', () => {
    expect(() =>
      holdReachVariantLines('rabbit', {
        instrument: 'violin',
        support: 'chair',
        sets: ['violin@rabbit.nothing=1'],
      }),
    ).toThrow('is not known');
  });
});

describe('scrollReach and armFactorFor', () => {
  it('grows the instrument from its tail end along its axis', () => {
    // The tail end 0.3 m beside the shoulder joint, and the scroll 0.4 m along the axis.
    expect(scrollReach([0, 0.3, 0], [0.4, 0.3, 0], [0, 0, 0], 1)).toBeCloseTo(0.5, 12);
    expect(scrollReach([0, 0.3, 0], [0.4, 0.3, 0], [0, 0, 0], 0)).toBeCloseTo(0.3, 12);
    expect(scrollReach([0, 0.3, 0], [0.2, 0.3, 0], [0, 0, 0], 2)).toBeCloseTo(0.5, 12);
  });

  it('makes the upper arm and the forearm longer, and keeps the paw', () => {
    // An arm of 0.5 m with a paw of 0.1 m reaches 0.9 m with the factor 2.
    expect(armFactorFor(0.9, 0.5, 0.1)).toBeCloseTo(2, 12);
    expect(armFactorFor(0.5, 0.5, 0.1)).toBeCloseTo(1, 12);
  });
});

describe('takeSizes', () => {
  it('takes the scales of --size out of the arguments', () => {
    expect(takeSizes(['--support', 'stand', '--size', '0.85,1'])).toEqual({
      sizes: [0.85, 1],
      rest: ['--support', 'stand'],
    });
    expect(takeSizes(['--support', 'stand'])).toEqual({ sizes: [], rest: ['--support', 'stand'] });
  });

  it('stops on no value, a second --size, or a scale that is not above 0', () => {
    expect(() => takeSizes(['--size'])).toThrow(/one time/);
    expect(() => takeSizes(['--size', '1', '--size', '0.9'])).toThrow(/one time/);
    expect(() => takeSizes(['--size', '0.85,0'])).toThrow(/above 0/);
    expect(() => takeSizes(['--size', '0.85,,1'])).toThrow(/above 0/);
  });
});

describe('sizeReach (design 4.6)', () => {
  it('needs the reach of the arm at the size of the rule, and the arm factor of the rig there', () => {
    const now = holdReach('rabbit', 'violin', 'chair');
    const rule = ruleSize(now);
    if (!rule) {
      throw new Error('The rule gives no violin for the rabbit.');
    }
    const report = sizeReach('rabbit', 'chair', [rule.scale, 1]);
    const [fit, full] = report.sizes;
    expect(report.arm).toBeCloseTo(now.arms.L, 9);
    // At the size of the rule, the scroll lies in the palm of the current arm.
    expect(fit?.reach).toBeCloseTo(report.arm, 6);
    expect(fit?.factor).toBeCloseTo(1, 6);
    // The arm of the app comes from the rig within 1% (pnpm rig-mesh --check).
    const rig = report.rig;
    expect(rig?.file).toBe('tools/mesh-rigs/rabbit.json');
    expect(Math.abs((fit?.rigFactor ?? 0) / (rig?.armFactor ?? 1) - 1)).toBeLessThan(0.02);
    // The player rebuilt at each scale keeps its tail end, so the check agrees within 1 mm.
    for (const size of report.sizes) {
      expect(Math.abs(size.rebuilt - size.reach)).toBeLessThan(0.001);
    }
    expect(full?.length).toBeGreaterThan(fit?.length ?? Infinity);
    expect(full?.reach).toBeGreaterThan(fit?.reach ?? Infinity);
  });
});
