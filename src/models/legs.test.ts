import { describe, expect, it } from 'vitest';

import { SECTION_INSTRUMENTS, SECTION_SPECIES } from './cast.ts';
import type { PlayingSection } from './cast.ts';
import type { MeshData } from './mesh.ts';
import { buildPlayer } from './player.ts';
import type { PlayerModel } from './player.ts';
import { boneIndex } from './rig.ts';
import type { BoneName } from './rig.ts';

/** One player of each species with the first instrument of its section, on its support. */
const CAST: readonly { readonly label: string; readonly model: PlayerModel }[] = Object.keys(
  SECTION_SPECIES,
)
  .filter((section): section is PlayingSection => section in SECTION_SPECIES)
  .flatMap((section) =>
    SECTION_SPECIES[section].map((species) => {
      const instrument = SECTION_INSTRUMENTS[section][0];
      return { label: `${species} ${instrument}`, model: buildPlayer(species, instrument) };
    }),
  );

/**
 * Gives the highest point of the mesh on some bones.
 *
 * @param mesh The mesh.
 * @param bones The bones.
 * @returns The height, in meters.
 */
function topOf(mesh: MeshData, bones: readonly BoneName[]): number {
  const set = new Set(bones.map((bone) => boneIndex(bone)));
  let top = -Infinity;
  for (let v = 0; v < mesh.bones.length; v++) {
    if (set.has(mesh.bones[v] ?? -1)) {
      top = Math.max(top, mesh.positions[v * 3 + 1] ?? -Infinity);
    }
  }
  return top;
}

describe('the seated legs (design 4.3, 4.5)', () => {
  const seatedCast = CAST.filter(({ model }) => model.seat);

  it('has a seated player of each support', () => {
    const supports = new Set(seatedCast.map(({ model }) => model.support));

    expect([...supports].toSorted()).toEqual(['bench', 'chair', 'stool']);
  });

  it('keeps the knees near the height of the seat, as in the reference images', () => {
    // The knee tops of the reference images are 0.23 to 0.43 H above the seat. A round knee of
    // 0.3 H above the seat reaches 0.53 H.
    for (const { label, model } of seatedCast) {
      const seat = model.seat?.seatHeight ?? NaN;
      const kneeTop = topOf(model.mesh, ['shinL', 'shinR']);

      expect((kneeTop - seat) / model.body.headHeight, label).toBeLessThan(0.45);
    }
  });
});
