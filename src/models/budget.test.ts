import { describe, expect, it } from 'vitest';

import { BODY_TRIANGLE_BUDGET } from '../../tools/body-budgets.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from './cast.ts';
import type { PlayingSection } from './cast.ts';
import type { MeshData } from './mesh.ts';
import { buildPlayer } from './player.ts';
import { buildMusicStand, buildSupport, seatHeights } from './props.ts';
import type { Support } from './props.ts';
import { BONE_NAMES, boneIndex } from './rig.ts';
import { INSTRUMENT_BUDGETS } from './instruments/test-budgets.ts';
import type { InstrumentId } from './instruments/types.ts';
import { SPECIES } from './species.ts';
import type { SpeciesId } from './species.ts';

/** The most triangles of a body (design 4.4, source meshes). */
const BODY_BUDGET = 2600;

/** The most triangles of a chair, a stool, or the piano bench, and of a music stand (4.5). */
const SEAT_BUDGET = 120;
const STAND_BUDGET = 80;

/** The bones that carry the instrument pieces (design 4.7). */
const INSTRUMENT_BONES: ReadonlySet<number> = new Set(
  (['instrument', 'slide', 'bow', 'malletL', 'malletR', 'baton'] as const).map((bone) =>
    boneIndex(bone),
  ),
);

/** Counts the triangles of the body and of the instrument of a player mesh. */
function countParts(mesh: MeshData) {
  let instrument = 0;
  for (let t = 0; t < mesh.bones.length / 3; t++) {
    if (INSTRUMENT_BONES.has(mesh.bones[t * 3] ?? 0)) {
      instrument++;
    }
  }
  return { body: mesh.bones.length / 3 - instrument, instrument };
}

/** Each species with each instrument of its section, and the conductor (design 4.3, 4.6). */
const CAST: readonly (readonly [SpeciesId, InstrumentId])[] = [
  ...Object.keys(SECTION_SPECIES)
    .filter((section): section is PlayingSection => section in SECTION_SPECIES)
    .flatMap((section) =>
      SECTION_SPECIES[section].flatMap((species) =>
        SECTION_INSTRUMENTS[section].map((id): readonly [SpeciesId, InstrumentId] => [species, id]),
      ),
    ),
  [CONDUCTOR.species, CONDUCTOR.instrument],
];

describe('triangle budgets (design 4.5)', () => {
  it('casts all 19 species and all 22 instruments', () => {
    expect(new Set(CAST.map(([species]) => species)).size).toBe(19);
    expect(new Set(CAST.map(([, id]) => id)).size).toBe(22);
  });

  it('keeps each body within its budget and each instrument within its budget', () => {
    for (const [species, id] of CAST) {
      for (const kettles of id === 'timpani' ? ([2, 3, 4] as const) : ([4] as const)) {
        const { mesh, bodyRig } = buildPlayer(species, id, kettles);
        const { body, instrument } = countParts(mesh);
        expect(body, `${species} with the ${id}`).toBeLessThanOrEqual(
          bodyRig ? BODY_TRIANGLE_BUDGET : BODY_BUDGET,
        );
        expect(instrument, `${species} with the ${id}`).toBeLessThanOrEqual(INSTRUMENT_BUDGETS[id]);
        expect(instrument, `${species} with the ${id}`).toBeGreaterThan(0);
        // The skeleton has all bones, so the mesh fits a pose of 5.1.
        expect(Math.max(...mesh.bones)).toBeLessThan(BONE_NAMES.length);
      }
    }
  });

  it('keeps each seat within 120 triangles and the music stand within 80', () => {
    const seats: readonly Support[] = ['chair', 'stool', 'bench'];
    for (const support of seats) {
      const seat = buildSupport(support, seatHeights(support, SPECIES.rabbit));
      expect(seat, support).not.toBeNull();
      expect((seat?.positions.length ?? Infinity) / 9, support).toBeLessThanOrEqual(SEAT_BUDGET);
    }
    expect(buildMusicStand().positions.length / 9).toBeLessThanOrEqual(STAND_BUDGET);
  });
});
