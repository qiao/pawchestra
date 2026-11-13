import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { BATON_TIP, buildBaton } from './baton.ts';
import type { InstrumentPiece } from './types.ts';

/**
 * Finds the far end of a piece: the mean of the corners within 1 mm of the corner that is
 * farthest from a point. For a stick, it is the middle of the end face.
 *
 * @param piece The piece.
 * @param from The point, in the axes of the piece.
 * @returns The far end, in the axes of the piece.
 */
function farEnd(piece: InstrumentPiece, from: Vector3): Vector3 {
  const corners: Vector3[] = [];
  for (const part of piece.parts) {
    for (let i = 0; i < part.corners.length; i += 3) {
      corners.push(
        new Vector3(part.corners[i] ?? 0, part.corners[i + 1] ?? 0, part.corners[i + 2] ?? 0),
      );
    }
  }

  const farthest = Math.max(...corners.map((c) => c.distanceTo(from)));
  const end = corners.filter((c) => c.distanceTo(from) > farthest - 0.001);
  return end.reduce((sum, c) => sum.add(c), new Vector3()).divideScalar(end.length);
}

describe('buildBaton', () => {
  it('puts the baton in the right hand on its bone, with the tip at the end (design 4.6)', () => {
    const model = buildBaton();
    expect(model.pieces.map((p) => p.bone)).toEqual(['baton']);
    expect(model.grips.palmR).toEqual({ bone: 'baton', at: [0, 0, 0] });
    expect(model.targets).toHaveLength(1);
    expect(model.targets[0]?.from).toEqual([BATON_TIP, 0, 0]);
    expect(model.size[0]).toBeCloseTo(0.51, 2);
  });

  it('ends the straight stick at the tip target of the motion (design 4.6)', () => {
    const model = buildBaton();
    const stick = model.pieces[0];
    const grip = model.grips.palmR?.at;
    const tip = model.targets[0]?.from;
    if (!stick || !grip || !tip) {
      throw new Error('The baton has no stick, no grip, or no tip target.');
    }

    const end = farEnd(stick, new Vector3(...grip));

    expect(end.distanceTo(new Vector3(...tip))).toBeLessThan(0.005);
  });

  it('points the baton down the hanging right hand, toward its thumb and its palm', () => {
    const hold = buildBaton().pieces[0]?.hold;
    expect(hold?.anchor).toBe('palmR');
    const forward = new Vector3(1, 0, 0).applyQuaternion(
      new Quaternion(...(hold?.rotation ?? [0, 0, 0, 1])),
    );
    expect(forward.y).toBeLessThan(-0.7);
    expect(forward.z).toBeLessThan(0);
    expect(forward.x).toBeLessThan(0);
  });
});
