import { describe, expect, it } from 'vitest';

import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { buildWoodwind } from './woodwinds.ts';
import type { WoodwindId } from './woodwinds.ts';

/** Gives the direction of a piece axis in the model axes, in the bind pose. */
function direction(id: WoodwindId, axis: Vec3): Vec3 {
  const hold = buildWoodwind(id).pieces[0]?.hold;
  return toVec3(
    new Vector3(...axis).applyQuaternion(new Quaternion(...(hold?.rotation ?? [0, 0, 0, 1]))),
  );
}

describe('buildWoodwind', () => {
  it('puts the point at the mouth at the origin, on a bone of the chest', () => {
    for (const id of ['flute', 'oboe', 'clarinet', 'bassoon'] as const) {
      const model = buildWoodwind(id);
      expect(model.parent).toBe('chest');
      expect(model.pieces[0]?.hold.anchor).toBe('mouth');
      expect(model.grips.mouth).toEqual({ bone: 'instrument', at: [0, 0, 0] });
    }
  });

  it('points the flute to the right, a little to the front and down (design 4.6)', () => {
    const along = direction('flute', [1, 0, 0]);
    expect(along[0]).toBeGreaterThan(0.95);
    expect(along[1]).toBeLessThan(0);
    expect(along[2]).toBeLessThan(0);
  });

  it('hangs the oboe 30° and the clarinet 25° forward from the vertical (design 4.6)', () => {
    for (const [id, angle] of [
      ['oboe', 30],
      ['clarinet', 25],
    ] as const) {
      const along = direction(id, [1, 0, 0]);
      const down = new Vector3(...along).dot(new Vector3(0, -1, 0));
      expect(Math.acos(down) / MathUtils.DEG2RAD).toBeCloseTo(angle, 6);
      expect(along[0]).toBeCloseTo(0, 9);
      expect(along[2]).toBeLessThan(0);
    }
  });

  it('leans the bassoon to the left across the body (design 4.6)', () => {
    const tube = direction('bassoon', [0, 1, 0]);
    expect(tube[0]).toBeCloseTo(
      -Math.sin(35 * MathUtils.DEG2RAD) * Math.cos(8 * MathUtils.DEG2RAD),
      9,
    );
    expect(tube[1]).toBeGreaterThan(0.8);
  });

  it('makes the clarinet black lacquer with silver rings and keys, as in mockup.png', () => {
    const parts = buildWoodwind('clarinet').pieces[0]?.parts ?? [];
    const black = parts.filter((part) => part.color === INSTRUMENT_COLORS.clarinet);
    const silver = parts.filter((part) => part.color === INSTRUMENT_COLORS.silver);
    const reed = parts.filter((part) => part.color === INSTRUMENT_COLORS.reed);
    expect(black.length).toBeGreaterThan(0);
    expect(black.every((part) => part.finish === 'lacquer')).toBe(true);
    expect(silver.length).toBeGreaterThan(0);
    expect(silver.every((part) => part.finish === 'metal')).toBe(true);
    expect(parts).toHaveLength(black.length + silver.length + reed.length);
  });
});
