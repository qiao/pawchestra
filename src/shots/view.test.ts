import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TARGET,
  MIN_DISTANCE,
  ORBIT_CLEARANCE,
  PORTRAIT_RULE,
  defaultView,
  farPlane,
  landscapeZoom,
  orbitMinDistance,
  portraitShare,
  wideView,
} from './view.ts';
import type { Vec3 } from '../models/tuples.ts';

describe('defaultView', () => {
  it('puts the camera in front of the stage on the audience axis (design 4.5, scene.png 01)', () => {
    const view = defaultView(10, 1440, 900);
    // The landscape rule: 0.58 of the default distance of 33 m on a desktop.
    expect(view.distance).toBeCloseTo(0.58 * 33, 9);
    // The target is 0.25 m below the stage top and 0.7 m behind the stage center.
    expect(view.target).toEqual([0, -0.25, -0.7]);
    const [x, y, z] = view.position.map((v, k) => v - (DEFAULT_TARGET[k] ?? NaN));
    expect(Math.hypot(x ?? NaN, y ?? NaN, z ?? NaN)).toBeCloseTo(view.distance, 9);
    // On the audience axis (+z), as orchestra-latest.png.
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeGreaterThan(0);
  });

  it('keeps the width of the orchestra on a narrower landscape viewport', () => {
    // A wider viewport keeps the distance of the desktop. A narrower one moves the camera back
    // with the width, up to the aspect 1.
    expect(defaultView(10, 1920, 900).distance).toBeCloseTo(0.58 * 33, 9);
    expect(defaultView(10, 1200, 900).distance).toBeCloseTo(0.58 * 33 * (1.6 / (4 / 3)), 9);
    expect(defaultView(10, 800, 800).distance).toBeCloseTo(0.58 * 1.6 * 33, 9);
  });

  it('gives the portrait camera the distance of its rule (design 4.5, SC8)', () => {
    const view = defaultView(10, 390, 844);
    const [x, , z] = view.position.map((v, k) => v - (view.target[k] ?? NaN));
    // The full rule: 0.68 of the default distance.
    expect(view.distance).toBeCloseTo((0.68 * 33 * 844) / 390, 9);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeGreaterThan(0);
  });

  it('changes the view with no jump from portrait to landscape', () => {
    let previous = defaultView(10, 500, 1000).position;
    for (let width = 501; width <= 1100; width++) {
      const next = defaultView(10, width, 1000).position;
      const step = Math.hypot(...next.map((v, k) => v - (previous[k] ?? 0)));
      expect(step, `width ${width}`).toBeLessThan(0.15);
      previous = next;
    }
  });
});

describe('portraitShare', () => {
  it('is 0 at the aspect 1 and wider, 1 at 0.6 and narrower, and smooth between', () => {
    expect(portraitShare(1)).toBe(0);
    expect(portraitShare(1.6)).toBe(0);
    expect(portraitShare(0.6)).toBe(1);
    expect(portraitShare(390 / 844)).toBe(1);
    expect(portraitShare(0.8)).toBeCloseTo(0.5, 9);
    expect(portraitShare(0.99)).toBeLessThan(0.01);
  });
});

describe('landscapeZoom', () => {
  it('is 0.58 at the aspect 1.6 and wider, and grows with 1 / aspect to the aspect 1', () => {
    expect(landscapeZoom(2.4)).toBeCloseTo(0.58, 9);
    expect(landscapeZoom(1.6)).toBeCloseTo(0.58, 9);
    expect(landscapeZoom(1.2)).toBeCloseTo((0.58 * 1.6) / 1.2, 9);
    expect(landscapeZoom(1)).toBeCloseTo(0.928, 9);
    expect(landscapeZoom(0.5)).toBeCloseTo(0.928, 9);
  });
});

describe('wideView', () => {
  it('removes the zoom of a wide variant in portrait, and keeps the move of the shot', () => {
    const phone = wideView(0, 0.4, 1.1 * 0.92, 1.1, 390 / 844);
    expect(phone.zoom).toBeCloseTo(0.92 * PORTRAIT_RULE.nearer, 9);
    const desktop = wideView(0, 0.4, 1.1 * 0.92, 1.1, 1.6);
    expect(desktop.azimuth).toBe(0);
    expect(desktop.elevation).toBe(0.4);
    expect(desktop.zoom).toBeCloseTo(1.1 * 0.92 * 0.58, 9);
  });
});

describe('farPlane', () => {
  it('adds three stage sides to the distance (design 4.5)', () => {
    expect(farPlane(20, 8)).toBe(44);
  });
});

describe('orbitMinDistance', () => {
  /** The stage side of the Boulanger demo, in meters. */
  const side = 11.28;

  /** The highest point of the players above the stage top, in meters. */
  const top = 2.5;

  /**
   * Gives the unit vector from the target to a camera at an elevation on the audience axis.
   *
   * @param degrees The elevation, in degrees.
   * @returns The unit vector.
   */
  function up(degrees: number): Vec3 {
    const e = (degrees * Math.PI) / 180;
    return [0, Math.sin(e), Math.cos(e)];
  }

  it('stops a low camera in front of the stage edge (bug report of 2026-10-07)', () => {
    // A camera 25° above the target leaves the box through its front face. The target stands
    // 0.7 m behind the stage center.
    const limit = orbitMinDistance(DEFAULT_TARGET, up(25), side, top);
    const front = side / 2 + ORBIT_CLEARANCE - (DEFAULT_TARGET[2] ?? NaN);
    expect(limit).toBeCloseTo(front / Math.cos((25 * Math.PI) / 180), 9);
    // The camera stands 1 m in front of the stage edge, and the old limit of 2 m put it among
    // the players.
    expect(limit).toBeGreaterThan(3 * MIN_DISTANCE);
    expect(limit).toBeLessThan(0.5 * defaultView(side, 1440, 900).distance);
  });

  it('stops a high camera 1 m above the highest head', () => {
    const limit = orbitMinDistance(DEFAULT_TARGET, up(80), side, top);
    const height = top + ORBIT_CLEARANCE - (DEFAULT_TARGET[1] ?? 0);
    expect(limit).toBeCloseTo(height / Math.sin((80 * Math.PI) / 180), 9);
  });

  it('follows the azimuth: a camera at a corner leaves the box later', () => {
    const e = (25 * Math.PI) / 180;
    const corner: Vec3 = [Math.cos(e) * Math.SQRT1_2, Math.sin(e), Math.cos(e) * Math.SQRT1_2];
    const limit = orbitMinDistance(DEFAULT_TARGET, corner, side, top);
    expect(limit).toBeGreaterThan(orbitMinDistance(DEFAULT_TARGET, up(25), side, top));
  });

  it('keeps the lowest limit of 2 m for a target outside the box', () => {
    expect(orbitMinDistance([0, 9, 0], up(40), side, top)).toBe(MIN_DISTANCE);
  });
});
