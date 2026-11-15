import { describe, expect, it } from 'vitest';

import { FINISH_ORDER } from './mesh.ts';
import type { Finish } from './mesh.ts';
import { unpackBodyMesh } from './body-format.ts';
import type { BodyMesh } from './body-format.ts';
import { bodyNormals } from './body-normals.ts';
import { BODY_RABBIT } from './bodies/rabbit.ts';

/**
 * Makes two triangles that share the edge from (0, 0, 0) to (1, 0, 0): one on the floor, facing
 * up, and one that turns up from the far side of the edge by a fold angle.
 *
 * @param fold The angle between the normals of the two faces, in degrees.
 * @param finishes The finish of each face.
 * @returns The mesh.
 */
function hinge(
  fold: number,
  finishes: readonly [Finish, Finish] = ['matte', 'matte'],
): Pick<BodyMesh, 'positions' | 'corners' | 'finishes'> {
  const turn = (fold * Math.PI) / 180;
  return {
    // The vertices: the two ends of the edge, a point on the floor, and a point of the fold.
    positions: Float32Array.from([
      0,
      0,
      0,
      1,
      0,
      0,
      0.5,
      0,
      1,
      0.5,
      Math.sin(turn),
      -Math.cos(turn),
    ]),
    corners: Uint32Array.from([0, 2, 1, 0, 1, 3]),
    finishes: Uint8Array.from(finishes, (finish) => FINISH_ORDER.indexOf(finish)),
  };
}

/**
 * Gives the normal of a corner.
 *
 * @param normals The normals of the corners.
 * @param c The corner.
 * @returns The normal.
 */
function normalOf(normals: Float32Array, c: number): [number, number, number] {
  return [normals[c * 3] ?? 0, normals[c * 3 + 1] ?? 0, normals[c * 3 + 2] ?? 0];
}

/**
 * Gives the angle between two unit vectors, in degrees.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns The angle.
 */
function angle(a: readonly number[], b: readonly number[]): number {
  const dot = (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

describe('bodyNormals (design 4.4, 4.5)', () => {
  it('gives the corners of an edge below the crease angle one normal between the two faces', () => {
    const normals = bodyNormals(hinge(20), 35);
    // Corner 0 of the floor face and corner 3 of the folded face are the same vertex.
    expect(angle(normalOf(normals, 0), normalOf(normals, 3))).toBeLessThan(0.05);
    expect(angle(normalOf(normals, 0), [0, 1, 0])).toBeGreaterThan(5);
    expect(angle(normalOf(normals, 0), [0, 1, 0])).toBeLessThan(15);
  });

  it('keeps an edge above the crease angle sharp, with the normal of each face', () => {
    const normals = bodyNormals(hinge(50), 35);
    expect(angle(normalOf(normals, 0), [0, 1, 0])).toBeLessThan(0.05);
    expect(angle(normalOf(normals, 0), normalOf(normals, 3))).toBeCloseTo(50, 3);
  });

  it('keeps each face of another finish flat, and does not count it for a matte face', () => {
    const normals = bodyNormals(hinge(20, ['matte', 'lacquer']), 35);
    for (const c of [0, 1, 2]) {
      expect(angle(normalOf(normals, c), [0, 1, 0])).toBeLessThan(0.05);
    }
    expect(angle(normalOf(normals, 3), normalOf(normals, 5))).toBeLessThan(0.05);
    expect(angle(normalOf(normals, 3), [0, 1, 0])).toBeCloseTo(20, 3);
  });

  it('weights each face by its corner angle, so the normal leans to the face with the wider corner', () => {
    const turn = (20 * Math.PI) / 180;
    const narrow = (20 * Math.PI) / 180;
    const wide = (120 * Math.PI) / 180;
    const mesh = {
      // The shared edge from vertex 0 to vertex 1, a floor point with a corner of 120° at vertex
      // 0, and a point of a face that turns up by 20° with a corner of 20° at vertex 0.
      positions: Float32Array.from([
        0,
        0,
        0,
        1,
        0,
        0,
        Math.cos(wide),
        0,
        Math.sin(wide),
        Math.cos(narrow),
        Math.sin(narrow) * Math.sin(turn),
        -Math.sin(narrow) * Math.cos(turn),
      ]),
      corners: Uint32Array.from([0, 2, 1, 0, 1, 3]),
      finishes: Uint8Array.from([FINISH_ORDER.indexOf('matte'), FINISH_ORDER.indexOf('matte')]),
    };
    const normals = bodyNormals(mesh, 35);
    // Equal weights put the normal halfway, 10° from the floor face. The weights 120 and 20 put
    // it about 3° from the floor face.
    const lean = angle(normalOf(normals, 0), [0, 1, 0]);
    expect(lean).toBeGreaterThan(1);
    expect(lean).toBeLessThan(5);
    expect(angle(normalOf(normals, 0), normalOf(normals, 3))).toBeLessThan(0.05);
  });

  it('gives each corner of the rabbit a unit normal within the crease angle of its face', () => {
    const mesh = unpackBodyMesh(BODY_RABBIT.mesh);
    const crease = 40;
    const normals = bodyNormals(mesh, crease);
    const flat = bodyNormals(mesh, 0);
    let smoothed = 0;
    for (let c = 0; c < mesh.corners.length; c++) {
      const normal = normalOf(normals, c);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
      const turn = angle(normal, normalOf(flat, c));
      expect(turn).toBeLessThanOrEqual(crease + 1e-3);
      if (turn > 1) {
        smoothed++;
      }
    }
    expect(smoothed).toBeGreaterThan(mesh.corners.length / 2);
  });
});
