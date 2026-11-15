import { describe, expect, it } from 'vitest';

import { Vector3 } from 'three';
import type { Vec3 } from './tuples.ts';
import type { MeshData } from './mesh.ts';
import {
  CHAIR,
  buildChair,
  buildMusicStand,
  buildRisers,
  buildSceneProps,
  buildStool,
  buildSupport,
  seatHeights,
} from './props.ts';
import { buildPianoBench } from './instruments/piano.ts';
import { BODY_POLAR_BEAR } from './bodies/polar-bear.ts';
import { BODY_RABBIT } from './bodies/rabbit.ts';
import { SCENE_COLORS } from './colors.ts';
import type { PlayerPlace, SceneLayout } from './layout.ts';
import { SPECIES } from './species.ts';

/** The seat height of the chairs of the tests, in meters. */
const SEAT = 0.35;

function heights(mesh: MeshData): number[] {
  return [...mesh.positions].filter((_, i) => i % 3 === 1);
}

describe('buildChair', () => {
  it('stays within the budget of 120 triangles (design 4.5)', () => {
    expect(buildChair(SEAT).positions.length / 9).toBeLessThanOrEqual(120);
  });

  it('has a seat at its height and a back above it (design 4.5)', () => {
    const ys = heights(buildChair(SEAT));
    expect(Math.max(...ys)).toBeGreaterThan(SEAT);
    expect(ys.filter((y) => Math.abs(y - SEAT) < 1e-6).length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
  });

  it('puts a seat of another height at that height, and keeps the back above it', () => {
    const ys = heights(buildChair(0.3));

    expect(ys.filter((y) => Math.abs(y - 0.3) < 1e-6).length).toBeGreaterThan(0);
    expect(ys.some((y) => Math.abs(y - 0.35) < 1e-6)).toBe(false);
    expect(Math.max(...ys)).toBeCloseTo(0.3 + CHAIR.back, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
  });

  it('has an open back below one wide top rail, as in animals.webp', () => {
    const mesh = buildChair(SEAT);
    const inner = CHAIR.seatWidth / 2 - 0.035;
    // No part of the chair is in the opening between the posts, the seat, and the rail.
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3] ?? 0;
      const y = mesh.positions[v * 3 + 1] ?? 0;
      const inOpening = Math.abs(x) < inner - 1e-6 && y > SEAT + 1e-6;
      if (inOpening) {
        expect(y).toBeGreaterThanOrEqual(SEAT + CHAIR.back - CHAIR.rail - 1e-6);
      }
    }
  });
});

describe('buildMusicStand', () => {
  it('stays within the budget of 80 triangles (design 4.5)', () => {
    expect(buildMusicStand().positions.length / 9).toBeLessThanOrEqual(80);
  });

  it('holds the desk at a height of 1.05 (design 4.5)', () => {
    const ys = heights(buildMusicStand());
    // The desk of 0.35 leans back 30°, so it spans 0.35 × cos 30° in height around 1.05.
    expect(Math.max(...ys)).toBeCloseTo(1.05 + (0.35 / 2) * Math.cos(Math.PI / 6) + 0.003, 2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6);
  });
});

/**
 * Gives the heights of the vertices of one color.
 *
 * @param mesh The mesh.
 * @param color The linear color.
 * @returns The heights.
 */
function heightsOf(mesh: MeshData, color: readonly number[]): number[] {
  const ys: number[] = [];
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    if (color.every((c, i) => mesh.colors[v * 3 + i] === Math.fround(c))) {
      ys.push(mesh.positions[v * 3 + 1] ?? 0);
    }
  }
  return ys;
}

describe('the desk of a music stand (design 4.5, UX audit 2026-10-05, SC9)', () => {
  it('has a dark warm gray desk with a lighter edge, and a black post and legs', () => {
    // Black desks are the largest shapes of some close shots.
    const stand = buildMusicStand();
    const deskBottom = 1.05 - (0.35 / 2) * Math.cos(Math.PI / 6);
    expect(Math.min(...heightsOf(stand, SCENE_COLORS.standDesk))).toBeGreaterThan(
      deskBottom - 0.01,
    );
    expect(heightsOf(stand, SCENE_COLORS.standDesk).length).toBe(2 * 6);
    expect(heightsOf(stand, SCENE_COLORS.standEdge).length).toBe(4 * 6);
    // The black post ends at the middle of the desk, behind it.
    expect(Math.max(...heightsOf(stand, SCENE_COLORS.stand))).toBeLessThanOrEqual(1.05 + 1e-6);
  });
});

describe('buildStool', () => {
  it('builds the stool of the harp with no back, within 120 triangles (design 4.5)', () => {
    const stool = buildStool({ seatHeight: 0.35 });
    expect(stool.positions.length / 9).toBeLessThanOrEqual(120);
    expect(Math.max(...heights(stool))).toBeCloseTo(0.35, 6);
    expect(Math.min(...heights(stool))).toBeCloseTo(0, 6);
  });
});

describe('buildSupport', () => {
  it('builds each seat at the heights that it gets', () => {
    const seat = { seatHeight: 0.3 };

    expect(buildSupport('chair', seat)).toEqual(buildChair(0.3));
    expect(buildSupport('stool', seat)).toEqual(buildStool(seat));
    expect(buildSupport('bench', seat)).toEqual(buildPianoBench(0.3));
    expect(buildSupport('stand', null)).toBeNull();
  });

  it('builds nothing under a standing player', () => {
    expect(seatHeights('stand', SPECIES.bear)).toBeNull();
    expect(seatHeights('riser', SPECIES.penguin)).toBeNull();
    expect(buildSupport('riser', null)).toBeNull();
  });
});

describe('seatHeights (design 4.5)', () => {
  it('fits the seat of the chair to the legs of the species', () => {
    for (const species of [SPECIES.mouse, SPECIES['fox-red'], SPECIES.rhino]) {
      const { seatHeight, headHeight } = species;

      expect(seatHeights('chair', species)?.seatHeight).toBeCloseTo(seatHeight * headHeight, 9);
    }
    expect(seatHeights('chair', SPECIES.mouse)?.seatHeight).toBeLessThan(
      seatHeights('chair', SPECIES.rhino)?.seatHeight ?? NaN,
    );
  });

  it('gives a body on a chair the depth of the chair of the body (design 4.4)', () => {
    const seat = seatHeights('chair', SPECIES.rabbit);
    expect(seat?.seatDepth).toBe(BODY_RABBIT.chairDepth);
    expect(seat?.seatHeight).toBeCloseTo(BODY_RABBIT.seatHeight, 6);
  });

  it('keeps the back of a chair with a short seat, and moves its front edge back', () => {
    const depthOf = (mesh: MeshData): [number, number] => {
      let [front, back] = [Infinity, -Infinity];
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        front = Math.min(front, mesh.positions[v * 3 + 2] ?? 0);
        back = Math.max(back, mesh.positions[v * 3 + 2] ?? 0);
      }
      return [front, back];
    };
    const [front, back] = depthOf(buildChair(0.13, BODY_RABBIT.chairDepth));
    const [, standardBack] = depthOf(buildChair(0.13));
    expect(back).toBeCloseTo(standardBack, 6);
    expect(back - front).toBeCloseTo(BODY_RABBIT.chairDepth, 6);
  });

  it('fits the piano bench to the legs of the polar bear (design 4.4)', () => {
    const seat = seatHeights('bench', SPECIES['polar-bear']);
    expect(seat?.seatHeight).toBeCloseTo(BODY_POLAR_BEAR.seatHeight, 9);
  });
});

describe('buildRisers', () => {
  const podium = [0, 0, 1] as const;
  const level = { level: 0, radius: 3, height: 0.25, halfAngle: 0.5 };
  const mesh = buildRisers([level], podium);

  it('closes the blocks with faces that point out', () => {
    // The stage top closes the blocks, so the volume from the origin on the stage top is exact.
    let volume = 0;
    const p = mesh.positions;
    for (let t = 0; t < p.length / 9; t++) {
      const at = (k: number): Vector3 =>
        new Vector3(p[t * 9 + k * 3] ?? 0, p[t * 9 + k * 3 + 1] ?? 0, p[t * 9 + k * 3 + 2] ?? 0);
      volume += at(0).dot(new Vector3().crossVectors(at(1), at(2))) / 6;
    }
    expect(volume).toBeGreaterThan(0);
  });
});

describe('buildSceneProps', () => {
  /** Makes the place of a player for a test layout. */
  function player(
    position: Vec3,
    facing: number,
    support: PlayerPlace['cast']['support'],
  ): PlayerPlace {
    return {
      position,
      facing,
      cast: {
        seatIndex: 0,
        player: 0,
        species: 'rabbit',
        instrument: 'violin',
        kettles: 4,
        support,
      },
    };
  }

  const layout: SceneLayout = {
    stageSide: 8,
    podium: [0, 0, 3],
    conductor: { position: [0, 0.25, 3], facing: 0 },
    players: [
      player([1, 0, 2], Math.PI / 2, 'chair'),
      player([0, 0.25, -2], 0, 'riser'),
      player([-1, 0, 0], 0, 'stool'),
    ],
    stands: [{ position: [-1, 0, -1], facing: 0, deskHeight: 1.05 }],
    risers: [{ level: 0, radius: 5, height: 0.25, halfAngle: 0.3 }],
  };

  it('merges the seats, the stands, and the risers into one mesh (design 4.4)', () => {
    const mesh = buildSceneProps(layout);
    const parts = [
      buildChair(seatHeights('chair', SPECIES.rabbit)?.seatHeight ?? NaN),
      buildStool(seatHeights('stool', SPECIES.rabbit) ?? { seatHeight: 0.35 }),
      buildMusicStand(),
      buildRisers(layout.risers, layout.podium),
    ];
    const triangles = parts.reduce((sum, part) => sum + part.positions.length / 9, 0);
    expect(mesh.positions.length / 9).toBe(triangles);
  });

  it('puts each seat at the place and the facing of its player', () => {
    const mesh = buildSceneProps({ ...layout, players: layout.players.slice(0, 1), stands: [] });
    const points = Array.from({ length: mesh.positions.length / 3 }, (_, v): Vec3 => [
      mesh.positions[v * 3] ?? 0,
      mesh.positions[v * 3 + 1] ?? 0,
      mesh.positions[v * 3 + 2] ?? 0,
    ]).filter((p) => Math.hypot(p[0] - 1, p[2] - 2) < 0.5);
    // A facing of 90° turns the chair back from +z to +x.
    const seat = seatHeights('chair', SPECIES.rabbit)?.seatHeight ?? NaN;
    const top = points.filter((p) => Math.abs(p[1] - seat - CHAIR.back) < 1e-6);
    expect(top.length).toBeGreaterThan(0);
    for (const p of top) {
      expect(p[0]).toBeGreaterThan(1.1);
    }
  });
});
