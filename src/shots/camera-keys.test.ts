import { describe, expect, it } from 'vitest';

import {
  angleDifference,
  fitDistance,
  keyDistance,
  viewAngle,
  writeKeyPosition,
} from './camera-keys.ts';
import { DEFAULT_TARGET, defaultDistance, defaultView } from './view.ts';

const DEG = Math.PI / 180;

describe('fitDistance (design 5.6)', () => {
  it('fits a sphere by the vertical field of view when the view is as wide as it is tall', () => {
    expect(fitDistance(0.95, 1.6, 26)).toBeCloseTo((0.95 / Math.sin(13 * DEG)) * 1.05, 9);
    expect(fitDistance(0.95, 1, 26)).toBeCloseTo(fitDistance(0.95, 2.4, 26), 9);
  });

  it('fits a sphere by the width on a phone in portrait: about 2.1 times farther', () => {
    const ratio = fitDistance(1, 0.46, 30) / fitDistance(1, 1.6, 30);
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(2.2);
  });
});

describe('keyDistance', () => {
  it('uses the default distance for a frame of 0, times the zoom', () => {
    const key = { azimuth: 0, elevation: 0, zoom: 0.6, fov: 30 };
    expect(keyDistance(10, 0, key, 1440 / 900)).toBeCloseTo(0.6 * 33, 9);
    expect(keyDistance(10, 0, key, 390 / 844)).toBeCloseTo(0.6 * defaultDistance(10, 390 / 844), 9);
  });

  it('shows half the frame height at the target with the field of view, times the zoom', () => {
    const key = { azimuth: 0, elevation: 0, zoom: 0.85, fov: 26 };
    expect(keyDistance(10, 0.6, key, 1.6)).toBeCloseTo((0.85 * 0.6) / Math.tan(13 * DEG), 9);
    expect(keyDistance(10, 0.6, key, 0.46)).toBeCloseTo(keyDistance(10, 0.6, key, 2.4), 9);
  });
});

describe('writeKeyPosition', () => {
  it('gives the default view for the azimuth 0° and the elevation 33° (design 4.5)', () => {
    const out: [number, number, number] = [0, 0, 0];
    writeKeyPosition(DEFAULT_TARGET, 0, 33 * DEG, 0.58 * 33, out);
    const view = defaultView(10, 1440, 900);
    for (const k of [0, 1, 2]) {
      expect(out[k]).toBeCloseTo(view.position[k] ?? 0, 9);
    }
  });

  it('puts the camera around the target', () => {
    const out: [number, number, number] = [0, 0, 0];
    writeKeyPosition([1, 2, 3], 90 * DEG, 0, 4, out);
    expect(out[0]).toBeCloseTo(5, 9);
    expect(out[1]).toBeCloseTo(2, 9);
    expect(out[2]).toBeCloseTo(3, 9);
  });
});

describe('viewAngle', () => {
  it('gives the angle between two view directions', () => {
    const a = { azimuth: 0, elevation: 0, zoom: 1, fov: 30 };
    expect(viewAngle(a, { ...a, azimuth: 30 * DEG })).toBeCloseTo(30 * DEG, 9);
    expect(viewAngle(a, { ...a, elevation: 40 * DEG })).toBeCloseTo(40 * DEG, 9);
    expect(viewAngle(a, a)).toBeCloseTo(0, 6);
  });
});

describe('angleDifference', () => {
  it('wraps the difference into -π to π', () => {
    expect(angleDifference(350 * DEG, 10 * DEG)).toBeCloseTo(-20 * DEG, 9);
    expect(angleDifference(10 * DEG, 350 * DEG)).toBeCloseTo(20 * DEG, 9);
    expect(angleDifference(-170 * DEG, 170 * DEG)).toBeCloseTo(20 * DEG, 9);
  });
});
