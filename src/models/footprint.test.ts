import { describe, expect, it } from 'vitest';

import type { Bounds } from './bounds.ts';
import { centeredBox } from './bounds.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from './cast.ts';
import type { PlayingSection } from './cast.ts';
import {
  boxesTouch,
  footprintOf,
  obstacleOf,
  obstaclesTouch,
  placeFootprint,
  playerFootprint,
  standFootprint,
} from './footprint.ts';
import type { Footprint } from './footprint.ts';
import type { MeshData } from './mesh.ts';
import { buildPlayer } from './player.ts';
import { CHAIR, MUSIC_STAND, buildMusicStand, buildSupport } from './props.ts';
import type { SpeciesId } from './species.ts';
import type { KettleCount } from './instruments/percussion.ts';
import type { InstrumentId } from './instruments/types.ts';

/** Each kind of player that `castScore()` gives, and the conductor (design 4.3, 4.6). */
const PLAYER_KINDS: readonly (readonly [SpeciesId, InstrumentId, KettleCount])[] = [
  ...Object.keys(SECTION_SPECIES)
    .filter((section): section is PlayingSection => section in SECTION_SPECIES)
    .flatMap((section) =>
      SECTION_SPECIES[section].flatMap((species) =>
        SECTION_INSTRUMENTS[section].flatMap((id) =>
          (id === 'timpani' ? ([2, 3, 4] as const) : ([4] as const)).map(
            (kettles): readonly [SpeciesId, InstrumentId, KettleCount] => [species, id, kettles],
          ),
        ),
      ),
    ),
  [CONDUCTOR.species, CONDUCTOR.instrument, 4],
];

/** Lists the vertices of a mesh that no box of a footprint holds. */
function verticesOutside(mesh: MeshData, footprint: Footprint): number[][] {
  const inside = (box: Bounds, p: readonly number[]): boolean =>
    [0, 1, 2].every(
      (k) => (p[k] ?? 0) >= (box.min[k] ?? 0) - 1e-6 && (p[k] ?? 0) <= (box.max[k] ?? 0) + 1e-6,
    );
  const outside: number[][] = [];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const p = [0, 1, 2].map((k) => mesh.positions[v * 3 + k] ?? 0);
    if (!footprint.boxes.some((box) => inside(box, p))) {
      outside.push(p);
    }
  }
  return outside;
}

/** A footprint of one box of 1 × 1 × 1 m on the floor, centered on the origin. */
const CUBE = footprintOf([centeredBox([0, 0.5, 0], [1, 1, 1])]);

describe('placeFootprint', () => {
  it('turns the boxes around y as three.js does', () => {
    // A box 1 m in front of the origin (-z) goes to +x when the item faces -π/2.
    const ahead = footprintOf([centeredBox([0, 0.5, -1], [0.2, 1, 0.2])]);
    const [box] = placeFootprint(ahead, [2, 0, 3], -Math.PI / 2);
    expect(box?.x).toBeCloseTo(3, 9);
    expect(box?.z).toBeCloseTo(3, 9);
    const [lifted] = placeFootprint(ahead, [0, 0.25, 0], 0);
    expect(lifted?.minY).toBeCloseTo(0.25, 9);
  });
});

describe('boxesTouch', () => {
  it('finds two boxes apart along an axis, and closer than the gap', () => {
    const [a] = placeFootprint(CUBE, [0, 0, 0], 0);
    const [b] = placeFootprint(CUBE, [1.1, 0, 0], 0);
    if (!a || !b) {
      throw new Error('No boxes.');
    }
    expect(boxesTouch(a, b, 0)).toBe(false);
    expect(boxesTouch(a, b, 0.2)).toBe(true);
  });

  it('separates a turned box only along a diagonal axis', () => {
    // A cube turned 45° reaches 0.707 m from its center along x.
    const [a] = placeFootprint(CUBE, [0, 0, 0], 0);
    const [turned] = placeFootprint(CUBE, [1.15, 0, 0], Math.PI / 4);
    const [near] = placeFootprint(CUBE, [1.2, 0, 0.6], Math.PI / 4);
    if (!a || !turned || !near) {
      throw new Error('No boxes.');
    }
    expect(boxesTouch(a, turned, 0)).toBe(true);
    // At (1.2, 0.6), the corner of the turned cube misses the first cube: only the diagonal axes
    // of the turned cube separate them.
    expect(boxesTouch(a, near, 0)).toBe(false);
  });

  it('finds boxes at different heights apart', () => {
    const [a] = placeFootprint(CUBE, [0, 0, 0], 0);
    const [above] = placeFootprint(CUBE, [0, 1, 0], 0);
    if (!a || !above) {
      throw new Error('No boxes.');
    }
    expect(boxesTouch(a, above, 0)).toBe(false);
  });
});

describe('obstaclesTouch', () => {
  it('checks each pair of boxes of two obstacles', () => {
    const a = obstacleOf('a', placeFootprint(CUBE, [0, 0, 0], 0));
    const two = footprintOf([
      centeredBox([0, 0.5, 0], [1, 1, 1]),
      centeredBox([-1.2, 0.5, 0], [1, 1, 1]),
    ]);
    expect(obstaclesTouch(a, obstacleOf('b', placeFootprint(two, [2.25, 0, 0], 0)), 0)).toBe(false);
    expect(obstaclesTouch(a, obstacleOf('b', placeFootprint(two, [2.15, 0, 0], 0)), 0)).toBe(true);
  });
});

describe('playerFootprint', () => {
  it('holds the seat and splits the player into boxes of bones and heights', () => {
    const cello = playerFootprint(buildPlayer('elephant', 'cello'));
    // The box of the chair reaches back to the back of the seat.
    expect(cello.boxes.some((b) => Math.abs(b.max[2] - CHAIR.seatDepth / 2) < 1e-6)).toBe(true);
    expect(cello.bounds.max[1]).toBeGreaterThan(1.5);
    // The end pin of the cello stands in front of the player.
    expect(cello.bounds.min[2]).toBeLessThan(-0.65);
    expect(cello.boxes.length).toBeGreaterThan(40);
  });

  it('holds each vertex of each player model and of its seat (review of step 4, F5)', () => {
    expect(PLAYER_KINDS).toHaveLength(25);
    for (const [species, instrument, kettles] of PLAYER_KINDS) {
      const player = buildPlayer(species, instrument, kettles);
      const footprint = playerFootprint(player);
      const name = `${species} ${instrument} ${kettles}`;
      expect(verticesOutside(player.mesh, footprint), name).toEqual([]);
      const seat = buildSupport(player.support, player.seat);
      if (seat) {
        expect(verticesOutside(seat, footprint), `${name} seat`).toEqual([]);
      }
    }
  });

  it('gives the timpani the width of its kettles (design 4.6)', () => {
    const timpani = playerFootprint(buildPlayer('badger', 'timpani'));
    expect(timpani.bounds.max[0] - timpani.bounds.min[0]).toBeGreaterThan(1.8);
  });
});

describe('standFootprint', () => {
  it('has a box for each leg, the post, and the desk', () => {
    const footprint = standFootprint(MUSIC_STAND.deskHeight);
    expect(footprint.boxes).toHaveLength(5);
    const heights = footprint.boxes.map((b) => b.max[1]).toSorted((a, b) => a - b);
    expect(heights[2]).toBeLessThan(0.15);
    expect(heights[4]).toBeGreaterThan(1.1);
  });

  it('holds each vertex of the music stand (review of step 4, F5)', () => {
    expect(verticesOutside(buildMusicStand(), standFootprint(MUSIC_STAND.deskHeight))).toEqual([]);
  });
});
