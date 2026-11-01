import { describe, expect, it } from 'vitest';

import { keyAction, keySeekPoint } from './keys.ts';
import type { FocusKind, KeyPress } from './keys.ts';

/** Gives a key press with no repeat and no modifier. */
function press(key: string, more: Partial<KeyPress> = {}): KeyPress {
  return { key, repeat: false, modified: false, ...more };
}

describe('keyAction (design 2.4)', () => {
  it('plays with Space, seeks with the arrows, and goes to the start with Home', () => {
    expect(keyAction(press(' '), 'page')).toBe('play');
    expect(keyAction(press('ArrowLeft'), 'page')).toBe('seek-back');
    expect(keyAction(press('ArrowRight'), 'page')).toBe('seek-forward');
    expect(keyAction(press('Home'), 'page')).toBe('seek-start');
    expect(keyAction(press('End'), 'page')).toBeNull();
    expect(keyAction(press('k'), 'page')).toBeNull();
  });

  it('toggles the cinematic camera with C, on each control but a text field (design 2.5)', () => {
    for (const focus of ['page', 'button', 'range', 'menu'] as const) {
      expect(keyAction(press('c'), focus)).toBe('camera');
      expect(keyAction(press('C'), focus)).toBe('camera');
    }
    expect(keyAction(press('c'), 'text')).toBeNull();
    expect(keyAction(press('c', { modified: true }), 'page')).toBeNull();
    expect(keyAction(press('c', { repeat: true }), 'page')).toBeNull();
  });

  it('toggles the mute button with M and the full screen with F (audit 2026-10-05-ux-design)', () => {
    for (const focus of ['page', 'button', 'range', 'menu'] as const) {
      expect(keyAction(press('m'), focus)).toBe('mute');
      expect(keyAction(press('M'), focus)).toBe('mute');
      expect(keyAction(press('f'), focus)).toBe('full-screen');
      expect(keyAction(press('F'), focus)).toBe('full-screen');
    }
    expect(keyAction(press('m', { repeat: true }), 'page')).toBeNull();
    expect(keyAction(press('f', { repeat: true }), 'page')).toBeNull();
  });

  it('does nothing in a text field and with a modifier', () => {
    for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'c', 'm', 'f']) {
      expect(keyAction(press(key), 'text')).toBeNull();
      expect(keyAction(press(key, { modified: true }), 'page')).toBeNull();
    }
  });

  it('does nothing while a modal dialog is open (design 2.8)', () => {
    for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'c', 'm', 'f']) {
      expect(keyAction(press(key), 'dialog'), key).toBeNull();
    }
  });

  it('leaves each key that the control with the focus uses to that control', () => {
    const cases: [FocusKind, string, boolean][] = [
      ['button', ' ', false],
      ['button', 'ArrowLeft', true],
      ['button', 'Home', true],
      ['range', ' ', true],
      ['range', 'ArrowRight', false],
      ['range', 'Home', false],
      ['menu', ' ', false],
      ['menu', 'ArrowLeft', false],
      ['menu', 'Home', false],
    ];
    for (const [focus, key, acts] of cases) {
      expect(keyAction(press(key), focus) !== null, `${key} on a ${focus}`).toBe(acts);
    }
  });

  it('does not repeat Space', () => {
    expect(keyAction(press(' ', { repeat: true }), 'page')).toBeNull();
    expect(keyAction(press('ArrowRight', { repeat: true }), 'page')).toBe('seek-forward');
  });
});

describe('keySeekPoint (design 2.4)', () => {
  it('seeks 5 s back or forward, or to the start', () => {
    expect(keySeekPoint('seek-back', 83)).toBe(78);
    expect(keySeekPoint('seek-forward', 83)).toBe(88);
    expect(keySeekPoint('seek-start', 83)).toBe(0);
  });
});
