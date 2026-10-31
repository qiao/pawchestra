import { describe, expect, it } from 'vitest';

import { DEMO_IDS } from '../src/app/demos.ts';
import type { Shot as CameraPlanShot, ShotKind, ShotPlan } from '../src/shots/types.ts';
import {
  cameraShots,
  drawerShots,
  loadShots,
  playShots,
  reviewShots,
  shotSeeks,
  uiShots,
} from './screenshots.ts';

describe('reviewShots', () => {
  it('lists each demo at 1440 × 900, the default demo at 390 × 844, the gallery, and the views pages (9.8)', () => {
    const shots = reviewShots();
    // The index of the shot at 390 × 844. It follows the shot of each demo at 1440 × 900.
    const phone = DEMO_IDS.length;
    expect(shots.map((shot) => shot.file)).toEqual([
      ...DEMO_IDS.map((id) => `${id}-1440x900.webp`),
      'mozart-k191-390x844.webp',
      'gallery-species-1440x900.webp',
      'gallery-instruments-1440x900.webp',
      'animals-views.webp',
      'fox-sheet-views.webp',
      'rabbit-sheet-views.webp',
      'dog-sheet-views.webp',
      'polar-bear-sheet-views.webp',
      'bear-sheet-views.webp',
    ]);
    expect(shots[phone]).toEqual({
      file: 'mozart-k191-390x844.webp',
      path: '/#demo=mozart-k191',
      width: 390,
      height: 844,
      ready: 'canvas[data-demo="mozart-k191"]',
    });
    expect(shots[phone + 2]?.ready).toBe('canvas[data-ready="instruments"]');
    // The views page has the size of docs/reference/animals.webp.
    expect(shots[phone + 3]).toMatchObject({ path: '/views.html', width: 1024, height: 1024 });
    // The page of fox-views.png has half of its size (design 7.1).
    expect(shots[phone + 4]).toMatchObject({
      path: '/views.html?sheet=fox',
      width: 1247,
      height: 677,
    });
  });
});

describe('playShots', () => {
  it('lists the default demo and the Beethoven 9 demo at 1440 × 900, and the default demo at 390 × 844, during play (9.8)', () => {
    expect(playShots()).toEqual([
      {
        file: 'mozart-k191-play-1440x900.webp',
        path: '/#demo=mozart-k191',
        width: 1440,
        height: 900,
        ready: 'body[data-samples="ready"]',
        playSec: 6,
      },
      {
        file: 'beethoven-9-play-1440x900.webp',
        path: '/#demo=beethoven-9',
        width: 1440,
        height: 900,
        ready: 'body[data-samples="ready"]',
        playSec: 6,
      },
      {
        file: 'mozart-k191-play-390x844.webp',
        path: '/#demo=mozart-k191',
        width: 390,
        height: 844,
        ready: 'body[data-samples="ready"]',
        playSec: 6,
      },
    ]);
  });
});

describe('uiShots', () => {
  it('lists the first screen and the play with the drawer open at both sizes of step 6 (9.5)', () => {
    const shots = uiShots();
    expect(shots.map((shot) => shot.file)).toEqual([
      'ui-first-1440x900.webp',
      'ui-playing-1440x900.webp',
      'ui-first-390x844.webp',
      'ui-playing-390x844.webp',
    ]);
    expect(shots[3]).toEqual({
      file: 'ui-playing-390x844.webp',
      path: '/',
      width: 390,
      height: 844,
      ready: 'body[data-samples="ready"]',
      scale: 2,
      state: 'playing',
    });
    expect(shots[0]?.scale).toBe(1);
  });
});

describe('drawerShots', () => {
  it('lists the seat list, the settings, the credits, and the drop overlay at both sizes of step 6 (9.8)', () => {
    const shots = drawerShots();
    expect(shots.map((shot) => shot.file)).toEqual([
      'ui-seats-1440x900.webp',
      'ui-seats-390x844.webp',
      'ui-settings-1440x900.webp',
      'ui-settings-390x844.webp',
      'ui-credits-1440x900.webp',
      'ui-credits-390x844.webp',
      'ui-drop-1440x900.webp',
      'ui-drop-390x844.webp',
    ]);
    expect(shots[1]).toEqual({
      file: 'ui-seats-390x844.webp',
      path: '/',
      width: 390,
      height: 844,
      ready: 'body[data-samples="ready"]',
      scale: 2,
      state: 'seats',
    });
    expect(shots[0]?.scale).toBe(1);
  });
});

describe('loadShots', () => {
  it('lists the load, the load failure, and the missing WebGL2 at both sizes of step 6 (2.8, 9.8)', () => {
    const shots = loadShots();
    expect(shots.map((shot) => shot.file)).toEqual([
      'ui-loading-1440x900.webp',
      'ui-loading-390x844.webp',
      'ui-error-1440x900.webp',
      'ui-error-390x844.webp',
      'ui-no-webgl2-1440x900.webp',
      'ui-no-webgl2-390x844.webp',
    ]);
    expect(shots[3]).toEqual({
      file: 'ui-error-390x844.webp',
      path: '/',
      width: 390,
      height: 844,
      ready: '.message:not([hidden])',
      scale: 2,
      state: 'error',
    });
    // The load text shows "Loading" at once, so the shot waits for the first preset that is
    // ready.
    expect(shots[0]?.ready).toBe('.first-screen .status:text-matches("instruments: [1-9]")');
    expect(shots[4]?.ready).toBe('.full-page');
  });
});

/**
 * Makes a shot plan of shots of given kinds and starts. The last shot holds after the end.
 *
 * @param list The kind and the start of each shot.
 * @returns The plan.
 */
function planOf(list: readonly [ShotKind, number][]): ShotPlan {
  const key = { azimuth: 0, elevation: 0.3, zoom: 1, fov: 30 };
  const shots = list.map(([kind, start], i): CameraPlanShot => {
    const end = list[i + 1]?.[1] ?? Infinity;
    return {
      kind,
      startSec: i === 0 ? -Infinity : start,
      endSec: end,
      moveEndSec: Number.isFinite(end) ? end : start + 8,
      seats: [],
      part: null,
      target: [0, 0, 0],
      halfHeight: 0,
      composition: null,
      from: key,
      to: key,
      blendSec: 0,
    };
  });
  return { stageSide: 10, shots, starts: Float64Array.from(shots, (s) => s.startSec) };
}

describe('shotSeeks and cameraShots (design 5.6, 9.8)', () => {
  const plan = planOf([
    ['conductor', 0],
    ['solo', 9.6],
    ['section', 17.2],
    ['conductor', 25.5],
    ['wide', 33.0],
    ['solo', 37.0],
    ['wide', 45.25],
  ]);

  it('seeks into the first shot of each kind after the opening and before the last shot', () => {
    expect(shotSeeks(plan)).toEqual([
      { kind: 'conductor', seekSec: 26 },
      { kind: 'section', seekSec: 18 },
      { kind: 'solo', seekSec: 11 },
      { kind: 'wide', seekSec: 34 },
    ]);
  });

  it('lists each kind at both sizes', () => {
    const shots = cameraShots('mozart-k525', plan);
    expect(shots).toHaveLength(8);
    expect(shots[0]).toEqual({
      file: 'shot-mozart-k525-conductor-1440x900.webp',
      path: '/#demo=mozart-k525',
      width: 1440,
      height: 900,
      ready: 'body[data-samples="ready"]',
      kind: 'conductor',
      seekSec: 26,
    });
    expect(shots[1]?.file).toBe('shot-mozart-k525-conductor-390x844.webp');
  });
});
