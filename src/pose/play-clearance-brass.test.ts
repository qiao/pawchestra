import { describe, expect, it } from 'vitest';

import { buildPlayer } from '../models/player.ts';
import type { BoneName } from '../models/rig.ts';
import { BIND_ROTATIONS } from './frames.ts';
import { posedPart, signedDistance } from './test-clearance.ts';
import { poseSkeleton } from './test-kinematics.ts';
import type { WritablePose } from './pose-at.ts';
import { describePlayClearance } from './test-play-clearance.ts';

/** The parts of the body that a held instrument keeps out of: the legs and the torso. */
const BODY_PARTS = [
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'spine',
  'chest',
] as const satisfies readonly BoneName[];

/**
 * Makes the pose of the bind pose, in which a wind instrument has its playing place.
 *
 * @returns The pose.
 */
function bindPose(): WritablePose {
  return {
    rotations: Float32Array.from(BIND_ROTATIONS),
    rootOffset: [0, 0, 0],
    slideOffset: [0, 0, 0],
    instrumentOffset: [0, 0, 0],
    pawTurnL: null,
    pawBendR: 0,
    blink: 0,
    keys: null,
  };
}

describePlayClearance(['horn', 'trumpet', 'trombone', 'tuba']);

describe('the instruments in the playing pose (design 4.6, 5.3)', () => {
  it('keeps the horn out of the thighs and the belly of the pig', () => {
    // A horn at an incorrect place can hang its coil and its bell into the right thigh and the
    // belly of the pig in the bind pose.
    const model = buildPlayer('pig', 'horn');
    const posed = poseSkeleton(model, bindPose());
    const h = model.body.headHeight;
    const instrument = posedPart(posed, ['instrument']);

    const depths = BODY_PARTS.map((bone) => {
      const part = posedPart(posed, [bone]);
      let gap = Infinity;
      for (const t of instrument.triangles) {
        for (const p of [t.a, t.b, t.c]) {
          if (part.box.containsPoint(p)) {
            gap = Math.min(gap, signedDistance(part, p) / h);
          }
        }
      }
      return { bone, gap };
    });

    expect(depths.filter((d) => d.gap < 0)).toEqual([]);
  });
});
