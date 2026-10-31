import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../models/tuples.ts';
import { NOT_STARTED, PLAYING } from '../pose/test-scene.ts';
import type { Transport } from '../pose/types.ts';
import { CLOSE_BEAM_OPACITY, SHOT_BEAM_OPACITY, freeBeamOpacity } from './beam-opacity.ts';
import { cameraAt, createCameraPose } from './camera-at.ts';
import { demoShotScenes } from './test-shots.ts';
import type { CameraView, ShotPlan } from './types.ts';
import { PORTRAIT_RULE, defaultDistance, defaultView } from './view.ts';

const SIDE = 11;

const SCENES = await demoShotScenes();

const DESKTOP: CameraView = { aspect: 1440 / 900, still: false };

/**
 * Gives the factor of the beam opacity of the camera of a time.
 *
 * @param plan The plan.
 * @param time The song time.
 * @param view The view.
 * @param transport The transport.
 * @returns The factor.
 */
function beamOf(
  plan: ShotPlan,
  time: number,
  view: CameraView = DESKTOP,
  transport: Transport = PLAYING,
): number {
  return cameraAt(plan, time, transport, view, createCameraPose()).beam;
}

/**
 * Gives the song times of the samples of a shot, every quarter second after its blend.
 *
 * @param start The start of the shot, in song seconds.
 * @param blendSec The blend time of the shot.
 * @param end The end of the shot, in song seconds.
 * @returns The times.
 */
function shotTimes(start: number, blendSec: number, end: number): number[] {
  const times: number[] = [];
  for (let t = start + blendSec; t < end; t += 0.25) {
    times.push(t);
  }
  return times;
}

/**
 * Gives a camera on the ray of the default view at a factor of the default distance. The portrait
 * rule moves the default view nearer than the default distance (design 4.5).
 *
 * @param factor The factor of the default distance.
 * @param aspect The aspect of the view.
 * @returns The camera position.
 */
function cameraAtRatio(factor: number, aspect: number): Vec3 {
  const view = defaultView(SIDE, aspect, 1);
  const scale = (factor * defaultDistance(SIDE, aspect)) / view.distance;
  const [x, y, z] = view.position;
  return [x * scale, y * scale, z * scale];
}

describe('SHOT_BEAM_OPACITY (design 5.6)', () => {
  it('keeps the full beam in the wide and high shots, and fades it in the close shots', () => {
    expect(SHOT_BEAM_OPACITY.wide).toBe(1);
    expect(SHOT_BEAM_OPACITY.high).toBe(1);
    for (const kind of ['conductor', 'section', 'solo'] as const) {
      expect(SHOT_BEAM_OPACITY[kind]).toBe(CLOSE_BEAM_OPACITY);
    }
    expect(CLOSE_BEAM_OPACITY).toBeLessThan(0.3);
  });
});

describe('freeBeamOpacity (design 2.5, 4.5)', () => {
  it('gives the full beam at the default view and at the distance of a high shot', () => {
    for (const aspect of [1440 / 900, 1, 390 / 844]) {
      expect(freeBeamOpacity(SIDE, aspect, defaultView(SIDE, aspect, 1).position)).toBe(1);
      expect(freeBeamOpacity(SIDE, aspect, cameraAtRatio(0.6, aspect))).toBe(1);
    }
  });

  it('gives the full beam at each wide camera of the portrait rule (design 4.5)', () => {
    // The nearest wide camera in portrait: the start of the pull-out of the last shot (0.85).
    const phone = 390 / 844;
    expect(freeBeamOpacity(SIDE, phone, cameraAtRatio(0.85 * PORTRAIT_RULE.nearer, phone))).toBe(1);
  });

  it('fades the beam for a camera near the stage', () => {
    for (const aspect of [1440 / 900, 390 / 844]) {
      expect(freeBeamOpacity(SIDE, aspect, cameraAtRatio(0.3, aspect))).toBe(CLOSE_BEAM_OPACITY);
      expect(freeBeamOpacity(SIDE, aspect, [0, 2, 0])).toBe(CLOSE_BEAM_OPACITY);
    }
  });

  it('reads the distance to the stage center as a factor of the default distance', () => {
    // A phone in portrait has a default distance 2.16 times larger, so the same camera is nearer.
    const phone = 390 / 844;
    const far = defaultDistance(SIDE, phone) * 0.6;
    expect(freeBeamOpacity(SIDE, phone, [0, 0, far])).toBe(1);
    expect(freeBeamOpacity(SIDE, 1, [0, 0, far])).toBe(1);
    const near = defaultDistance(SIDE, 1) * 0.6;
    expect(freeBeamOpacity(SIDE, phone, [0, 0, near])).toBe(CLOSE_BEAM_OPACITY);
  });

  it('changes the beam with no jump when the camera zooms in', () => {
    const aspect = 1440 / 900;
    let last = freeBeamOpacity(SIDE, aspect, cameraAtRatio(1, aspect));
    for (let factor = 1; factor >= 0.1; factor -= 0.0005) {
      const opacity = freeBeamOpacity(SIDE, aspect, cameraAtRatio(factor, aspect));
      expect(opacity).toBeLessThanOrEqual(last);
      expect(last - opacity).toBeLessThan(0.02);
      last = opacity;
    }
    expect(last).toBe(CLOSE_BEAM_OPACITY);
  });
});

describe('cameraAt and the beam (design 5.6)', () => {
  const scene = SCENES[0];
  if (!scene) {
    throw new Error('No scene.');
  }

  it('gives the full beam at the default view before the first play', () => {
    expect(beamOf(scene.plan, 30, DESKTOP, NOT_STARTED)).toBe(1);
  });

  it.each(SCENES)('keeps the beam of the kind of each shot of $file for the full shot', (s) => {
    const { plan, score } = s;
    for (const still of [false, true]) {
      for (const [i, shot] of plan.shots.entries()) {
        const end = Math.min(shot.endSec, score.durationSec + 5);
        const blend = still ? 0 : shot.blendSec;
        for (const t of shotTimes(Math.max(shot.startSec, 0), blend, end)) {
          expect(beamOf(plan, t, { ...DESKTOP, still }), `shot ${i}`).toBe(
            SHOT_BEAM_OPACITY[shot.kind],
          );
        }
      }
    }
  });

  it.each(SCENES)('gives the beam of Free mode at each camera of $file, with no jump', (s) => {
    // A change from Cinematic to Free mode keeps the camera, so it must keep the beam.
    const { plan, score } = s;
    for (const aspect of [1440 / 900, 1, 0.46]) {
      const view: CameraView = { aspect, still: false };
      for (let t = 0; t < score.durationSec + 5; t += 0.25) {
        const camera = cameraAt(plan, t, PLAYING, view, createCameraPose());
        expect(freeBeamOpacity(plan.stageSide, aspect, camera.position), `${t} s`).toBeCloseTo(
          camera.beam,
          9,
        );
      }
    }
  });

  it('changes the beam at once at a hard cut from a wide shot to a close shot', () => {
    const { plan } = scene;
    const cut = plan.shots.findIndex(
      (shot, i) => shot.blendSec === 0 && plan.shots[i - 1]?.kind === 'wide' && shot.halfHeight > 0,
    );
    const shot = plan.shots[cut];
    if (!shot) {
      throw new Error('No cut from a wide shot to a close shot.');
    }
    expect(beamOf(plan, shot.startSec - 0.001)).toBe(1);
    expect(beamOf(plan, shot.startSec)).toBe(CLOSE_BEAM_OPACITY);
  });

  it('blends the beam smoothly over a blend from a wide shot to a close shot', () => {
    // The planner blends only between close shots, so the test gives a cut a blend of 1 s.
    const { plan } = scene;
    const cut = plan.shots.findIndex(
      (shot, i) => plan.shots[i - 1]?.kind === 'wide' && shot.halfHeight > 0,
    );
    const shot = plan.shots[cut];
    if (!shot) {
      throw new Error('No cut from a wide shot to a close shot.');
    }
    const shots = plan.shots.with(cut, { ...shot, blendSec: 1 });
    const blended: ShotPlan = { ...plan, shots };
    const start = shot.startSec;
    expect(beamOf(blended, start - 0.001)).toBe(1);
    expect(beamOf(blended, start)).toBe(1);
    expect(beamOf(blended, start + 0.5)).toBeCloseTo((1 + CLOSE_BEAM_OPACITY) / 2, 9);
    expect(beamOf(blended, start + 1)).toBe(CLOSE_BEAM_OPACITY);
    // A smoothstep over 1 s changes at most 1.5 times the full change in each second.
    const step = 0.001;
    const limit = 1.5 * (1 - CLOSE_BEAM_OPACITY) * step * 1.01;
    let last = beamOf(blended, start);
    for (let t = start + step; t <= start + 1; t += step) {
      const beam = beamOf(blended, t);
      expect(last - beam).toBeGreaterThanOrEqual(0);
      expect(last - beam).toBeLessThanOrEqual(limit);
      last = beam;
    }
    // With reduced motion, the cut is hard.
    expect(beamOf(blended, start, { ...DESKTOP, still: true })).toBe(CLOSE_BEAM_OPACITY);
  });
});
