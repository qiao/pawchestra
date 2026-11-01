import { describe, expect, it } from 'vitest';

import { keyAction } from './keys.ts';
import { CONTROL_KEYS, tooltipText } from './tooltips.ts';

describe('tooltipText (design 2.8, audit 2026-10-05-ux-design, CT1)', () => {
  it('names the action and its key', () => {
    expect(tooltipText('Cinematic camera', CONTROL_KEYS.camera)).toBe('Cinematic camera (C)');
    expect(tooltipText('Play', CONTROL_KEYS.play)).toBe('Play (Space)');
    expect(tooltipText('Exit full screen', CONTROL_KEYS.fullScreen)).toBe('Exit full screen (F)');
    expect(tooltipText('Reset view', null)).toBe('Reset view');
  });

  it('names only keys that act on the page (design 2.4)', () => {
    const actions = {
      play: [' '],
      seek: ['ArrowLeft', 'ArrowRight', 'Home'],
      mute: ['m'],
      volume: ['ArrowUp', 'ArrowDown'],
      camera: ['c'],
      fullScreen: ['f'],
    } as const;
    for (const [control, keys] of Object.entries(actions)) {
      for (const key of keys) {
        const press = { key, repeat: false, modified: false };
        expect(keyAction(press, 'page'), `${control}: ${key}`).not.toBeNull();
      }
    }
    expect(Object.keys(actions).toSorted()).toEqual(Object.keys(CONTROL_KEYS).toSorted());
  });
});
