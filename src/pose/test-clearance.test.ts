import { describe, expect, it } from 'vitest';

import { MathUtils, Quaternion, Triangle, Vector3 } from 'three';

import { buildPlayer } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { createMaterials } from '../scene/geometry.ts';
import { applyPose, createPlayerGeometry, createPlayerMesh } from '../scene/player.ts';
import { BIND_ROTATIONS } from './frames.ts';
import {
  boxTriangles,
  closeSurface,
  closedDepth,
  posedPart,
  surfaceGap,
} from './test-clearance.ts';
import { poseSkeleton } from './test-kinematics.ts';
import type { AnimalPose } from './types.ts';

/**
 * Makes a pose that bends the right elbow forward.
 *
 * @param degrees The bend, in degrees.
 * @returns The pose, with open eyes.
 */
function bentElbow(degrees: number): AnimalPose {
  const rotations = Float32Array.from(BIND_ROTATIONS);
  new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), degrees * MathUtils.DEG2RAD)
    .toArray(rotations, boneIndex('forearmR') * 4);
  return { rotations, rootOffset: [0, 0, 0], slideOffset: [0, 0, 0], blink: 0 };
}

describe('posedPart', () => {
  it('poses each corner with its two bones, as the skin of three.js does', () => {
    const model = buildPlayer('rabbit', 'violin');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    const pose = bentElbow(90);
    applyPose(mesh, pose);
    mesh.updateMatrixWorld(true);
    const part = posedPart(poseSkeleton(model, pose), ['upperArmR', 'forearmR']);

    // The triangles of the two bones, in the order of the mesh, against the vertices of three.js.
    const wanted = new Set([boneIndex('upperArmR'), boneIndex('forearmR')]);
    const firsts = [];
    for (let v = 0; v < model.mesh.bones.length; v += 3) {
      if (wanted.has(model.mesh.bones[v] ?? -1)) {
        firsts.push(v);
      }
    }
    expect(part.triangles).toHaveLength(firsts.length);
    const vertex = new Vector3();
    let largest = 0;
    let blended = 0;
    for (const [i, v] of firsts.entries()) {
      const triangle = part.triangles[i];
      for (const [k, corner] of [triangle?.a, triangle?.b, triangle?.c].entries()) {
        mesh.getVertexPosition(v + k, vertex);
        largest = Math.max(largest, vertex.distanceTo(corner ?? new Vector3()));
        if ((model.mesh.blendWeights[v + k] ?? 0) > 0.2) {
          blended++;
        }
      }
    }
    expect(blended).toBeGreaterThan(0);
    expect(largest).toBeLessThan(1e-6);
  });
});

/**
 * Builds a sphere of triangles whose faces point out, with welded corners. With `cut`, the rows
 * above the cut are missing, so the sphere is open at the top.
 *
 * @param radius The radius, in meters.
 * @param cut The number of rows to leave out at the top.
 * @returns The triangles.
 */
function sphere(radius: number, cut = 0): Triangle[] {
  const rows = 24;
  const columns = 32;
  const at = (row: number, column: number): Vector3 => {
    if (row === 0 || row === rows) {
      return new Vector3(0, row === 0 ? radius : -radius, 0);
    }
    const polar = (Math.PI * row) / rows;
    const turn = (2 * Math.PI * (column % columns)) / columns;
    return new Vector3(
      radius * Math.sin(polar) * Math.cos(turn),
      radius * Math.cos(polar),
      -radius * Math.sin(polar) * Math.sin(turn),
    );
  };
  const triangles: Triangle[] = [];
  for (let row = cut; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [a, b, c, d] = [
        at(row, column),
        at(row + 1, column),
        at(row + 1, column + 1),
        at(row, column + 1),
      ];
      if (row > 0) {
        triangles.push(new Triangle(a, b, d));
      }
      if (row < rows - 1) {
        triangles.push(new Triangle(b, c, d));
      }
    }
  }
  return triangles;
}

describe('closedDepth', () => {
  it('gives the distance to the nearest face for a point in a closed shell, and 0 outside', () => {
    const surface = closeSurface(sphere(0.1), 0);
    const points = [new Vector3(0, 0, 0.12), new Vector3(0.05, 0, 0), new Vector3(0, 0.02, 0)];

    // The deepest point is 0.08 m from the top. The faces cut the sphere a little, so its depth is
    // a little less.
    const { depth, index } = closedDepth(points, surface);
    expect(index).toBe(2);
    expect(depth).toBeGreaterThan(0.075);
    expect(depth).toBeLessThan(0.08);

    // Near the surface, the near triangles and the far clusters each give about half of the turn.
    expect(closedDepth([new Vector3(0.09, 0, 0)], surface).depth).toBeGreaterThan(0.008);
    expect(closedDepth([new Vector3(0.11, 0, 0), new Vector3(0, -0.2, 0)], surface)).toEqual({
      depth: 0,
      index: -1,
    });
  });

  it('closes an open shell with a cap, so that a point near the cut has its depth to the cap', () => {
    // The top four rows are missing: the cut is a circle with a radius of 0.05 m, 0.087 m above
    // the middle.
    const surface = closeSurface(sphere(0.1, 4), 1);
    const top = 0.1 * Math.cos(Math.PI / 6);
    const { depth } = closedDepth([new Vector3(0, top - 0.01, 0)], surface);
    expect(depth).toBeCloseTo(0.01, 6);

    // Above the cap, the point is outside.
    expect(closedDepth([new Vector3(0, top + 0.005, 0)], surface).depth).toBe(0);
  });

  it('stops when the shell has a different number of open loops', () => {
    expect(() => closeSurface(sphere(0.1, 4), 0)).toThrow('1 open loops');
    expect(() => closeSurface(sphere(0.1), 1)).toThrow('0 open loops');
  });
});

describe('surfaceGap', () => {
  const unit = closeSurface(boxTriangles([0, 0, 0], [1, 1, 1]), 0);

  it('gives the distance of the nearest points of two boxes, with the near triangle', () => {
    const part = boxTriangles([1.3, 0.2, 0.2], [1.5, 0.8, 0.8]);
    const { gap, index } = surfaceGap(part, unit);
    expect(gap).toBeCloseTo(0.3, 9);
    expect([part[index]?.a.x, part[index]?.b.x, part[index]?.c.x]).toEqual([1.3, 1.3, 1.3]);

    // Off a corner, the nearest points are on two edges.
    expect(surfaceGap(boxTriangles([1.3, 1.4, 0.2], [1.5, 1.6, 0.8]), unit).gap).toBeCloseTo(
      0.5,
      9,
    );
  });

  it('gives 0 for a box that crosses the surface or that is inside it', () => {
    expect(surfaceGap(boxTriangles([0.9, 0.2, 0.2], [1.5, 0.8, 0.8]), unit).gap).toBe(0);
    expect(surfaceGap(boxTriangles([0.4, 0.4, 0.4], [0.6, 0.6, 0.6]), unit).gap).toBe(0);
  });

  it('gives the limit and no triangle when the gap is not below the limit', () => {
    expect(surfaceGap(boxTriangles([1.3, 0.2, 0.2], [1.5, 0.8, 0.8]), unit, 0.25)).toEqual({
      gap: 0.25,
      index: -1,
    });
  });
});
