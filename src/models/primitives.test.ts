import { describe, expect, it } from 'vitest';

import { Vector3 } from 'three';
import type { Vec3 } from './tuples.ts';
import { triangleNormal } from './mesh.ts';
import { ball, box, cylinder, icosphere, lathe, plate, prism } from './primitives.ts';

function centroid(corners: readonly number[], t: number): Vec3 {
  const sum = (axis: number): number =>
    ((corners[t * 9 + axis] ?? 0) +
      (corners[t * 9 + 3 + axis] ?? 0) +
      (corners[t * 9 + 6 + axis] ?? 0)) /
    3;
  return [sum(0), sum(1), sum(2)];
}

/** Counts the triangles whose normal does not point away from an inner point of a convex solid. */
function inwardFaces(corners: readonly number[], inside: Vec3): number {
  let count = 0;
  for (let t = 0; t < corners.length / 9; t++) {
    const outward = new Vector3(...centroid(corners, t)).sub(new Vector3(...inside));
    if (new Vector3(...triangleNormal(corners, t)).dot(outward) <= 0) {
      count++;
    }
  }
  return count;
}

describe('primitives', () => {
  it('makes a box of 12 outward triangles', () => {
    const corners = box(1, 2, 3);
    expect(corners.length / 9).toBe(12);
    expect(inwardFaces(corners, [0, 0, 0])).toBe(0);
    expect(Math.max(...corners.filter((_, i) => i % 3 === 2))).toBe(1.5);
  });

  it('makes a limb cylinder of 6 segments with 24 outward triangles (design 4.5)', () => {
    const corners = cylinder(0.1, 0.08, 0.5, 6);
    expect(corners.length / 9).toBe(24);
    expect(inwardFaces(corners, [0, 0.25, 0])).toBe(0);
  });

  it('makes a cone with no empty triangles', () => {
    const corners = cylinder(0.1, 0, 0.5, 6);
    expect(corners.length / 9).toBe(12);
    expect(inwardFaces(corners, [0, 0.1, 0])).toBe(0);
  });

  it('makes an icosphere with 20 outward triangles', () => {
    const corners = icosphere(0.5);
    expect(corners.length / 9).toBe(20);
    expect(inwardFaces(corners, [0, 0, 0])).toBe(0);
    for (let i = 0; i < corners.length; i += 3) {
      expect(Math.hypot(corners[i] ?? 0, corners[i + 1] ?? 0, corners[i + 2] ?? 0)).toBeCloseTo(
        0.5,
        6,
      );
    }
  });

  it('makes a ball of 8 segments and 4 rings with 48 outward triangles on its surface', () => {
    const corners = ball(0.3, 8, 4);
    expect(corners.length / 9).toBe(48);
    expect(inwardFaces(corners, [0, 0, 0])).toBe(0);
    for (let i = 0; i < corners.length; i += 3) {
      expect(Math.hypot(corners[i] ?? 0, corners[i + 1] ?? 0, corners[i + 2] ?? 0)).toBeCloseTo(
        0.3,
        6,
      );
    }
  });

  it('makes a closed torso lathe of 8 segments with outward triangles (design 4.5)', () => {
    const corners = lathe(
      [
        [0, 0],
        [0.5, 0.2],
        [0.4, 1],
        [0, 1.3],
      ],
      8,
    );
    // The first and the last step lose the triangles at the radius 0.
    expect(corners.length / 9).toBe(8 + 16 + 8);
    expect(inwardFaces(corners, [0, 0.6, 0])).toBe(0);
  });

  it('makes a prism with outward triangles', () => {
    const outline = [
      [1, 0],
      [0, -1],
      [-1, 0],
      [0, 1],
    ] as const;
    const corners = prism(outline, -0.1, 0.1);
    expect(corners.length / 9).toBe(16);
    expect(inwardFaces(corners, [0, 0, 0])).toBe(0);
  });

  it('makes a plate with rounded edges and outward triangles', () => {
    const outline = [
      [1, 0],
      [0, -1],
      [-1, 0],
      [0, 1],
    ] as const;
    const corners = plate(outline, [
      [0.8, 0],
      [1, 0.1],
      [1, 0.2],
      [0.6, 0.3],
    ]);
    expect(corners.length / 9).toBe(3 * 8 + 2 * 4);
    expect(inwardFaces(corners, [0, 0.15, 0])).toBe(0);
    const ys = corners.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(0.3);
    // The top is smaller than the middle, so the edge is round.
    const topXs = corners.filter((_, i) => i % 3 === 0 && corners[i + 1] === 0.3);
    expect(Math.max(...topXs)).toBeCloseTo(0.6, 9);
  });
});
