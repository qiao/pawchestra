import { ACESFilmicToneMapping } from 'three';
import { describe, expect, it } from 'vitest';

import { rendererSettings } from './renderer.ts';

describe('rendererSettings (design 2.6, 4.5)', () => {
  it('gives the canvas of the post effects no MSAA, because their target has it', () => {
    expect(rendererSettings('post').antialias).toBe(false);
  });

  it('keeps the MSAA of a stage with no target of floats (review of step 8, L1)', () => {
    expect(rendererSettings('stage')).toEqual({ ...rendererSettings('post'), antialias: true });
  });

  it('gives the gallery a transparent canvas with the MSAA', () => {
    expect(rendererSettings('gallery')).toEqual({
      alpha: true,
      antialias: true,
      toneMapping: ACESFilmicToneMapping,
      exposure: 1,
      clearAlpha: 0,
    });
  });
});
