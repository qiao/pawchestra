import { describe, expect, it } from 'vitest';

import { patchedDemos } from '../../tools/patch-demos.ts';
import { buildScore } from '../score/score.ts';
import {
  QUALITY_OPTIONS,
  SECTION_SIZE_OPTIONS,
  SETTING_HELP,
  autoLabels,
  followFrame,
  renderTier,
  slowWindow,
  watchTier,
} from './settings.ts';
import type { TierWatch } from './settings.ts';

/**
 * Runs frames at a fixed interval.
 *
 * @param watch The watch before the frames.
 * @param from The wall time of the first frame, in seconds.
 * @param intervalSec The time between two frames, in seconds.
 * @param count The number of frames.
 * @returns The watch after the frames.
 */
function run(watch: TierWatch, from: number, intervalSec: number, count: number): TierWatch {
  let next = watch;
  for (let i = 0; i < count; i++) {
    next = followFrame(next, from + i * intervalSec, true);
  }
  return next;
}

describe('the setting texts (design 2.8)', () => {
  it('holds the buttons of the section size and of the quality', () => {
    expect(SECTION_SIZE_OPTIONS.map((option) => option.label)).toEqual([
      'Auto',
      'One per part',
      'Full',
    ]);
    expect(QUALITY_OPTIONS.map((option) => option.label)).toEqual([
      'Auto',
      'High',
      'Medium',
      'Low',
    ]);
  });
});

describe('followFrame (design 2.6)', () => {
  it('keeps the tier while the frames take 16.7 ms', () => {
    expect(run(watchTier('high'), 0, 1 / 60, 600).tier).toBe('high');
  });

  it('drops one step after each 2 s of frames of 25 ms, down to the low tier', () => {
    expect(run(watchTier('high'), 0, 0.025, 79).tier).toBe('high');
    expect(run(watchTier('high'), 0, 0.025, 82).tier).toBe('medium');
    expect(run(watchTier('high'), 0, 0.025, 162).tier).toBe('medium-125');
    expect(run(watchTier('high'), 0, 0.025, 242).tier).toBe('medium-100');
    expect(run(watchTier('high'), 0, 0.025, 322).tier).toBe('low');
    expect(run(watchTier('high'), 0, 0.025, 1000).tier).toBe('low');
  });

  it('reads the mean of the window, so that one slow frame does not drop the tier', () => {
    let watch = run(watchTier('high'), 0, 1 / 60, 60);
    watch = followFrame(watch, 1 + 0.1, true);
    watch = run(watch, 1.1 + 1 / 60, 1 / 60, 120);
    expect(watch.tier).toBe('high');
  });

  it('leaves out the longest frames, so that a scene build does not drop the tier', () => {
    // A change of the section size during play stopped the frames for 350 to 567 ms.
    let watch = run(watchTier('high'), 0, 1 / 60, 60);
    watch = followFrame(watch, 1 + 0.567, true);
    watch = run(watch, 1.567 + 1 / 60, 1 / 60, 120);
    expect(watch.tier).toBe('high');
    // Two builds in one window.
    watch = followFrame(watch, 4 + 0.5, true);
    watch = run(watch, 4.5 + 1 / 60, 1 / 60, 30);
    watch = followFrame(watch, 5 + 0.5, true);
    watch = run(watch, 5.5 + 1 / 60, 1 / 60, 200);
    expect(watch.tier).toBe('high');
  });

  it('keeps the tier at a steady 30 fps, the limit of a power-saving mode (review of step 6, N8)', () => {
    let watch = watchTier('high');
    let time = 0;
    for (let i = 0; i < 600; i++) {
      // A browser limit gives intervals of 33.3 ms with some jitter, and a few missed frames.
      time += i % 50 === 0 ? 0.05 : 1 / 30 + (i % 2 === 0 ? 0.002 : -0.002);
      watch = followFrame(watch, time, true);
    }
    expect(watch.tier).toBe('high');
  });

  it('keeps the tier at a steady 50 fps, the rate of a display at 50 Hz (re-review of step 6, R5)', () => {
    let watch = watchTier('high');
    let time = 0;
    for (let i = 0; i < 1000; i++) {
      // A display at 50 Hz gives intervals of 20 ms with some jitter, and a few missed frames.
      time += i % 50 === 0 ? 0.04 : 1 / 50 + (i % 2 === 0 ? 0.002 : -0.002);
      watch = followFrame(watch, time, true);
    }
    expect(watch.tier).toBe('high');
  });

  it('drops the tier at frames slower than 30 fps, and at frames between 60 and 30 fps', () => {
    expect(run(watchTier('high'), 0, 0.045, 60).tier).toBe('medium');
    expect(run(watchTier('high'), 0, 0.1, 30).tier).toBe('medium');
    let watch = watchTier('high');
    let time = 0;
    for (let i = 0; i < 130; i++) {
      time += i % 2 === 0 ? 1 / 60 : 1 / 30;
      watch = followFrame(watch, time, true);
    }
    expect(watch.tier).toBe('medium');
  });

  it('does not measure a pause or a hidden tab', () => {
    let watch = run(watchTier('high'), 0, 1 / 60, 60);
    watch = followFrame(watch, 1.5, false);
    // The first frame after the pause starts a new window, so the gap does not count.
    watch = run(watch, 30, 1 / 60, 200);
    expect(watch.tier).toBe('high');
  });

  it('never raises the tier', () => {
    expect(run(watchTier('low'), 0, 0.001, 5000).tier).toBe('low');
  });
});

describe('slowWindow (design 2.6)', () => {
  it('reads the mean without the shortest and the longest 5% of the intervals', () => {
    const steady = Array.from({ length: 19 }, () => 0.0167);
    expect(slowWindow([...steady, 1])).toBe(false);
    expect(slowWindow(Array.from({ length: 20 }, () => 0.025))).toBe(true);
  });

  it('finds a steady 50 fps from 16 ms to 24 ms', () => {
    expect(slowWindow([0.0161, 0.02, 0.0239, 0.021])).toBe(false);
    expect(slowWindow([0.0181, 0.02, 0.0241, 0.021])).toBe(true);
  });

  it('needs one steady rate for the full window', () => {
    expect(slowWindow([0.02, 0.02, 0.033, 0.033])).toBe(true);
  });

  it('finds a steady 30 fps from 26.7 ms to 40 ms', () => {
    expect(slowWindow([0.027, 0.033, 0.0399, 0.035])).toBe(false);
    expect(slowWindow([0.026, 0.033, 0.0399, 0.035])).toBe(true);
    expect(slowWindow([0.027, 0.033, 0.0401, 0.035])).toBe(true);
  });
});

describe('renderTier (design 2.6)', () => {
  it('uses the automatic tier for "Auto", else the tier of the user', () => {
    const watch = watchTier('medium');
    expect(renderTier('auto', watch)).toBe('medium');
    expect(renderTier('high', watch)).toBe('high');
    expect(renderTier('low', watch)).toBe('low');
  });
});

describe('autoLabels (design 2.8, audit 2026-10-05-ux-design, DR4)', () => {
  it('names the value that each button "Auto" selects now', async () => {
    const demos = await patchedDemos();
    const orchestral = (file: string): boolean => {
      const demo = demos.find((d) => d.file === file);
      const result = demo ? buildScore(demo.bytes, 'auto') : null;
      if (!result?.ok) {
        throw new Error(`No demo ${file}.`);
      }
      return result.score.orchestral;
    };
    expect(autoLabels(orchestral('boulanger-matin.mid'), 'high')).toEqual({
      sectionSize: 'Auto (Full)',
      quality: 'Auto (High)',
    });
    // Eine kleine Nachtmusik is not an orchestral file (8.2).
    expect(autoLabels(orchestral('mozart-k525.mid'), 'low')).toEqual({
      sectionSize: 'Auto (One per part)',
      quality: 'Auto (Low)',
    });
    expect(autoLabels(null, 'medium').sectionSize).toBe('Auto');
  });

  it('explains each setting in one line', () => {
    for (const help of Object.values(SETTING_HELP)) {
      expect(help).toMatch(/^[A-Z].*\.$/u);
    }
  });
});
