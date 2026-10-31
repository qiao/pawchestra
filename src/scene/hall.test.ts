import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../models/tuples.ts';
import { AdditiveBlending, Mesh, Points, ShaderMaterial, Vector3 } from 'three';

import {
  HALL,
  HALL_FLOOR,
  buildHall,
  createHall,
  hallCutaway,
  hallLight,
  hallUnit,
  setHallCamera,
} from './hall.ts';
import { STAGE_THICKNESS } from '../models/stage.ts';
import { rimLightPlace } from '../models/beam.ts';

/** Gives the corners and the normal of each triangle of a hall mesh. */
function triangles(positions: Float32Array): { center: Vec3; normal: Vec3 }[] {
  const list = [];
  for (let t = 0; t < positions.length / 9; t++) {
    const p = (k: number): Vec3 => [
      positions[t * 9 + k * 3] ?? 0,
      positions[t * 9 + k * 3 + 1] ?? 0,
      positions[t * 9 + k * 3 + 2] ?? 0,
    ];
    const [a, b, c] = [p(0), p(1), p(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: Vec3 = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    const center: Vec3 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ];
    list.push({ center, normal });
  }
  return list;
}

describe('buildHall (design 4.5, hall)', () => {
  const side = 11.19;
  const unit = hallUnit(side);
  const hall = buildHall(side);
  const centerZ = HALL.centerZ * unit;

  it('turns each vertical face of the shell to the ring center', () => {
    for (const { center, normal } of triangles(hall.shell.positions)) {
      const horizontal = Math.hypot(normal[0], normal[2]);
      if (horizontal < 1e-9) {
        continue;
      }
      const toCenter = [-center[0], centerZ - center[2]];
      expect(normal[0] * (toCenter[0] ?? 0) + normal[2] * (toCenter[1] ?? 0)).toBeGreaterThan(0);
    }
  });

  it('keeps the hall away from the stage corners', () => {
    const corner = (side / 2) * Math.SQRT2;
    for (let v = 0; v < hall.shell.positions.length / 3; v++) {
      const x = hall.shell.positions[v * 3] ?? 0;
      const z = hall.shell.positions[v * 3 + 2] ?? 0;
      expect(Math.hypot(x, z)).toBeGreaterThan(corner + 2);
    }
  });

  it('puts the lamps on the rails of the two tiers and low on the wall, evenly apart', () => {
    const centers = hall.lampList.map((lamp) => lamp.center);
    const heights = [...new Set(centers.map((c) => Math.round(c[1] * 100)))];
    expect(heights).toHaveLength(HALL.tiers.length + 1);
    // The smallest arc between two lamps of a row.
    const spacing = (height: number): number => {
      const row = centers.filter((c) => Math.round(c[1] * 100) === height);
      const radius = Math.hypot(row[0]?.[0] ?? 0, (row[0]?.[2] ?? 0) - centerZ);
      const angles = row.map((c) => Math.atan2(c[0], c[2] - centerZ)).toSorted((a, b) => a - b);
      const steps = angles.slice(1).map((angle, i) => angle - (angles[i] ?? 0));
      return radius * Math.min(...steps);
    };
    const [low, ...rails] = heights.toSorted((a, b) => a - b);
    expect(spacing(low ?? 0)).toBeCloseTo(HALL.wallLamps.spacing, 0);
    for (const rail of rails) {
      expect(spacing(rail)).toBeCloseTo(HALL.lampSpacing, 0);
    }
    // The low lamps stand below the lower balcony, so the default view sees them at the sides.
    expect((low ?? 0) / 100).toBeLessThan(-STAGE_THICKNESS + (HALL.tiers[0]?.height ?? 0) * unit);
    const glows = new Set(hall.lampList.map((lamp) => lamp.glow));
    expect([...glows].toSorted((a, b) => a - b)).toEqual([HALL.glow.rail, HALL.glow.wall]);
  });

  it('keeps the low lamps off the wall behind the stage, and at the sides', () => {
    const lowY = -STAGE_THICKNESS + HALL.wallLamps.height * unit;
    // The angle of each low lamp from the back of the hall (-z), seen from the ring center.
    const fromBack = hall.lampList
      .filter((lamp) => Math.abs(lamp.center[1] - lowY) < 1e-6)
      .map((lamp) => Math.PI - Math.abs(Math.atan2(lamp.center[0], lamp.center[2] - centerZ)));
    // The low lamps 13 m behind the stage floated above the orchestra in the default view. The
    // lamps 42° and 54° from the back stood behind the composer line and the play button of the
    // first screen in the view of orchestra-latest.png.
    expect(Math.min(...fromBack)).toBeGreaterThanOrEqual(HALL.wallLamps.backGap);
    expect(Math.min(...fromBack)).toBeGreaterThan((55 * Math.PI) / 180);
    // The row goes on at the sides: the lamps of the default view at the edges of the image.
    const step = HALL.wallLamps.spacing / (HALL.wallRadius * unit - HALL.wallLamps.size);
    expect(fromBack.filter((angle) => angle < HALL.wallLamps.backGap + step)).toHaveLength(2);
  });

  it('gives each lamp a glow that faces the camera and writes no depth', () => {
    const glows = createHall(side).children.find((child) => child instanceof Points);
    if (!(glows instanceof Points) || !(glows.material instanceof ShaderMaterial)) {
      throw new Error('The hall has no lamp glows.');
    }
    expect(glows.geometry.getAttribute('position').count).toBe(hall.lampList.length);
    expect(glows.material.depthWrite).toBe(false);
    expect(glows.material.blending).toBe(AdditiveBlending);
  });

  it('gives the floor the gloss of the rim light', () => {
    const floor = createHall(side).children[0];
    if (!(floor instanceof Mesh) || !(floor.material instanceof ShaderMaterial)) {
      throw new Error('The hall has no floor.');
    }
    const uniforms = floor.material.uniforms;
    expect(uniforms['uGlossLight']?.value.toArray()).toEqual(rimLightPlace(side));
    expect(uniforms['uShine']?.value).toBe(HALL_FLOOR.shine);
    expect(uniforms['uFloorY']?.value).toBe(-STAGE_THICKNESS);
    expect(floor.material.fragmentShader).toContain('pow(max(h.y, 0.0), uShine)');
  });

  it('gives the glows the cutaway of the camera and the size of the drawing buffer', () => {
    const group = createHall(side);
    const radius = HALL.wallRadius * unit;
    setHallCamera(group, side, new Vector3(0, 2, centerZ + 1.01 * radius), 1800);
    const glows = group.children.find((child) => child instanceof Points);
    if (!(glows instanceof Points) || !(glows.material instanceof ShaderMaterial)) {
      throw new Error('The hall has no lamp glows.');
    }
    expect(glows.material.uniforms['uCutaway']?.value).toBeCloseTo(Math.cos(HALL.cutawayAngle), 12);
    expect(glows.material.uniforms['uPixels']?.value).toBe(1800);
  });

  it('gives the two triangles of each quad one anchor, so the cutaway keeps or drops both', () => {
    const anchors = hall.shell.anchors;
    expect(anchors).toHaveLength((hall.shell.positions.length / 3) * 2);
    // The shell is a list of quads: six vertices each.
    for (let v = 0; v < anchors.length / 2; v += 6) {
      for (let k = 1; k < 6; k++) {
        expect(anchors[(v + k) * 2]).toBe(anchors[v * 2]);
        expect(anchors[(v + k) * 2 + 1]).toBe(anchors[v * 2 + 1]);
      }
    }
  });

  it('gives the lamps a light above 1, so that the bloom takes them', () => {
    expect(Math.min(...hall.lamps.colors)).toBeGreaterThan(1);
  });

  it('keeps the shell dark: no baked color above 0.2', () => {
    expect(Math.max(...hall.shell.colors)).toBeLessThan(0.2);
  });
});

describe('hallLight', () => {
  const unit = 11.19;
  const facing: Vec3 = [0, 0, 1];

  it('is brighter near the stage, and darker high on the walls', () => {
    expect(hallLight([0, 0, -8], facing, unit)).toBeGreaterThan(
      hallLight([0, 0, -16], facing, unit),
    );
    expect(hallLight([0, 0, -16], facing, unit)).toBeGreaterThan(
      hallLight([0, 14, -16], facing, unit),
    );
  });

  it('gives a face that turns away from the stage less light', () => {
    expect(hallLight([0, 0, -16], [0, 0, -1], unit)).toBeLessThan(
      hallLight([0, 0, -16], facing, unit),
    );
  });
});

describe('hallCutaway (design 4.5, hall)', () => {
  const side = 11.19;
  const unit = hallUnit(side);
  const radius = HALL.wallRadius * unit;
  const centerZ = HALL.centerZ * unit;

  it('cuts nothing for a camera inside the ring, as in a close shot', () => {
    expect(hallCutaway(side, [0, 2, centerZ + 0.5 * radius]).limit).toBe(2);
  });

  it('cuts the side of the camera for a camera outside the ring', () => {
    const cut = hallCutaway(side, [0, 18, centerZ + 2 * radius]);
    expect(cut.limit).toBeCloseTo(Math.cos(HALL.cutawayAngle), 12);
    expect(cut.direction[0]).toBeCloseTo(0, 12);
    expect(cut.direction[1]).toBeCloseTo(1, 12);
  });

  it('opens the cut step by step near the wall, so a move of the camera has no jump', () => {
    const limits = [0.8, 0.88, 0.92, 0.96, 1.01].map(
      (share) => hallCutaway(side, [share * radius, 2, centerZ]).limit,
    );
    expect(limits).toEqual(limits.toSorted((a, b) => b - a));
    expect(limits[0]).toBe(2);
    expect(limits.at(-1)).toBeCloseTo(Math.cos(HALL.cutawayAngle), 12);
  });

  it('keeps the cutaway in the depth pass of the post effects (review of step 8, U2)', () => {
    const cutaway = createHall(side).children.flatMap((child) =>
      child instanceof Mesh &&
      child.material instanceof ShaderMaterial &&
      child.material.uniforms['uCutaway']
        ? [child.material]
        : [],
    );
    expect(cutaway).toHaveLength(2);
    // The override material of the depth pass has no cutaway, so it does not replace these.
    for (const material of cutaway) {
      expect(material.allowOverride).toBe(false);
    }
  });
});
