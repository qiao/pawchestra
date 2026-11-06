import { describe, expect, it } from 'vitest';

import { MathUtils, Quaternion, Vector3 } from 'three';
import { toQuat } from './tuples.ts';
import {
  FINISH_ORDER,
  MeshBuilder,
  applyTransform,
  splitByCentroid,
  splitByFacing,
  srgb,
  transform,
  triangleNormal,
} from './mesh.ts';
import { box } from './primitives.ts';

describe('srgb', () => {
  it('converts a hex color to linear values', () => {
    const [r, g, b] = srgb('#ff8000');
    expect(r).toBe(1);
    expect(g).toBeCloseTo(0.2158605, 6);
    expect(b).toBe(0);
  });
});

describe('applyTransform', () => {
  it('scales, then rotates, then moves a point', () => {
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 90 * MathUtils.DEG2RAD);
    const t = transform([1, 2, 3], toQuat(turn), [2, 1, 1]);
    // (1, 0, 0) scales to (2, 0, 0), turns to (0, 2, 0), and moves to (1, 4, 3).
    const [x, y, z] = applyTransform(t, [1, 0, 0]);
    expect(x).toBeCloseTo(1, 9);
    expect(y).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(3, 9);
  });
});

describe('MeshBuilder', () => {
  it('keeps the parts in order, with the color, the bone, and the finish of each triangle', () => {
    const builder = new MeshBuilder();
    builder.add(box(1, 1, 1), { color: [0, 0, 1], finish: 'metal', bone: 3 });
    builder.add(box(1, 1, 1), { color: [1, 0, 0], bone: 2 });
    const mesh = builder.build();

    expect(builder.triangleCount).toBe(24);
    expect(mesh.positions).toHaveLength(24 * 9);
    expect(mesh.finishes).toHaveLength(24);
    expect(mesh.finishes[0]).toBe(FINISH_ORDER.indexOf('metal'));
    expect(mesh.finishes.at(-1)).toBe(FINISH_ORDER.indexOf('matte'));
    expect(mesh.colors[2]).toBe(1);
    expect(mesh.colors.at(-3)).toBe(1);
    expect(mesh.bones[0]).toBe(3);
    expect(mesh.bones.at(-1)).toBe(2);
  });

  it('makes a part rigid: its second bone is its bone, with the weight 0', () => {
    const builder = new MeshBuilder();
    builder.add(box(1, 1, 1), { color: [1, 1, 1], bone: 3 });
    const mesh = builder.build();

    expect(mesh.blendBones).toHaveLength(36);
    expect(mesh.blendWeights).toHaveLength(36);
    expect([...mesh.blendBones]).toEqual([...mesh.bones]);
    expect(mesh.blendWeights.every((w) => w === 0)).toBe(true);
  });

  it('keeps the faces outside under a mirror scale', () => {
    const builder = new MeshBuilder();
    builder.add(box(1, 1, 1), {
      color: [1, 1, 1],
      at: transform([5, 0, 0], undefined, [-1, 1, 1]),
    });
    const positions = [...builder.build().positions];
    for (let t = 0; t < 12; t++) {
      const n = new Vector3(...triangleNormal(positions, t));
      const center = [0, 1, 2].map(
        (axis) =>
          ((positions[t * 9 + axis] ?? 0) +
            (positions[t * 9 + 3 + axis] ?? 0) +
            (positions[t * 9 + 6 + axis] ?? 0)) /
          3,
      );
      const outward = new Vector3((center[0] ?? 0) - 5, center[1] ?? 0, center[2] ?? 0);
      expect(n.dot(outward)).toBeGreaterThan(0);
    }
  });
});

describe('MeshBuilder.addMesh', () => {
  it('places a built mesh and keeps its colors, bones, and finishes', () => {
    const part = new MeshBuilder();
    part.add(box(1, 1, 1), { color: [0, 1, 0], finish: 'metal', bone: 4 });
    part.add(box(1, 1, 1), { color: [1, 0, 0], finish: 'lacquer', bone: 2 });
    const data = part.build();
    const merged = new MeshBuilder();
    merged.add(box(1, 1, 1), { color: [0, 0, 1], finish: 'varnish' });
    merged.addMesh(data, transform([10, 0, 0]));
    const mesh = merged.build();

    expect(mesh.positions).toHaveLength(36 * 9);
    expect([0, 12, 24].map((t) => mesh.finishes[t])).toEqual(
      (['varnish', 'metal', 'lacquer'] as const).map((f) => FINISH_ORDER.indexOf(f)),
    );
    // The own box comes first, then the placed boxes at x = 10.
    expect(mesh.positions[0]).toBeLessThan(1);
    expect(mesh.positions[12 * 9]).toBeGreaterThan(9);
    expect(mesh.colors[12 * 9 + 1]).toBe(1);
    expect(mesh.bones[12 * 3]).toBe(4);
    expect(mesh.colors.at(-3)).toBe(1);
    expect(mesh.bones.at(-1)).toBe(2);
  });

  it('keeps the second bone and its weight of each corner', () => {
    const part = new MeshBuilder();
    part.addFaces(
      box(1, 1, 1),
      Array.from({ length: 108 }, () => 0),
      Array.from({ length: 12 }, () => 0),
      () => ({
        bone: 5,
        blendBone: 4,
        blendWeight: 0.25,
      }),
    );
    const merged = new MeshBuilder();
    merged.add(box(1, 1, 1), { color: [0, 0, 1], bone: 2 });
    merged.addMesh(part.build(), transform([10, 0, 0]));
    const mesh = merged.build();

    expect([mesh.bones[0], mesh.blendBones[0], mesh.blendWeights[0]]).toEqual([2, 2, 0]);
    expect([mesh.bones.at(-1), mesh.blendBones.at(-1), mesh.blendWeights.at(-1)]).toEqual([
      5, 4, 0.25,
    ]);
  });
});

describe('MeshBuilder.addFaces', () => {
  it('gives each triangle its color and finish, and each corner its skin', () => {
    const builder = new MeshBuilder();
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1];
    builder.addFaces(positions, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0, 2], (c) => ({
      bone: c,
      blendBone: c + 1,
      blendWeight: c === 4 ? 0.25 : 0,
    }));
    const mesh = builder.build();

    expect([...mesh.positions]).toEqual(positions);
    expect(mesh.colors[2]).toBeCloseTo(0.3, 6);
    expect(mesh.colors[9]).toBeCloseTo(0.4, 6);
    expect([...mesh.finishes]).toEqual([0, 2]);
    expect([...mesh.bones]).toEqual([0, 1, 2, 3, 4, 5]);
    // A corner with the weight 0 keeps its main bone as its second bone.
    expect([...mesh.blendBones]).toEqual([0, 1, 2, 3, 5, 5]);
    expect(mesh.blendWeights[4]).toBe(0.25);
  });
});

describe('splitByFacing', () => {
  it('finds the faces that point in a direction', () => {
    const [front, rest] = splitByFacing(box(1, 1, 1), [0, 0, -1], 0.5);
    expect(front.length / 9).toBe(2);
    expect(rest.length / 9).toBe(10);
  });
});

describe('splitByCentroid', () => {
  it('finds the triangles whose centroids match a test', () => {
    // The +y face of the box has its centroids at y = 0.5, and the side faces at y = ±1/6.
    const [top, rest] = splitByCentroid(box(1, 1, 1), ([, y]) => y > 0.4);
    expect(top.length / 9).toBe(2);
    expect(rest.length / 9).toBe(10);
    expect(Math.min(...top.filter((_, i) => i % 3 === 1))).toBeCloseTo(0.5, 9);
  });
});
