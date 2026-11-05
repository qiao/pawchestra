import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Triangle, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { STUDIO_BONES, unpackStudioMesh } from '../src/models/studio-format.ts';
import type { StudioBody } from '../src/models/studio-format.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { CHAIR } from '../src/models/props.ts';
import type { AnimalSettings } from './studio-body.ts';
import {
  ANIMALS,
  eyeOnHead,
  eyePush,
  headRig,
  ownBone,
  rigMeshSettings,
  studioBody,
  studioGlbPath,
  ungrown,
} from './studio-body.ts';

describe('pnpm studio-body with four digits on each paw (design 4.4)', () => {
  it('gives each digit to the finger bone of its side', () => {
    expect(ownBone('finger3_L')).toBe('fingers_L');
    expect(ownBone('finger1_R')).toBe('fingers_R');
    expect(ownBone('hand_L')).toBe('hand_L');
  });
});

/**
 * Gives the settings of an animal with no seat height, so that the export drops a seated body
 * until its lowest point is on the floor.
 *
 * @param settings The settings.
 * @returns The settings with no seat height.
 */
function onFloor(settings: AnimalSettings): AnimalSettings {
  const floor: AnimalSettings = {
    landmark: settings.landmark,
    height: settings.height,
    seated: settings.seated,
    soloist: settings.soloist,
    constant: settings.constant,
    crease: settings.crease,
  };
  if (settings.glb) {
    return { ...floor, glb: settings.glb };
  }
  return floor;
}

describe('pnpm studio-body with a tail of two bones (design 4.4)', async () => {
  const settings = ANIMALS.get('fox');
  if (!settings?.glb) {
    throw new Error('The fox has no settings with a GLB file.');
  }
  const bytes = await readFile(join(import.meta.dirname, '..', settings.glb));
  const { body } = studioBody(bytes, settings.glb, settings);
  const mesh = unpackStudioMesh(body.mesh);
  const tip = STUDIO_BONES.indexOf('tail_tip');
  const root = STUDIO_BONES.indexOf('tail');

  it('turns both pea eyes of the uneven mesh out from one point (design 4.5)', () => {
    const h = body.eyes.headHeight;
    const line = (side: 'L' | 'R') => {
      const facing = new Vector3(...body.eyes.directions[side]);
      const eye = new Vector3(...body.heads[`eye_${side}`]).addScaledVector(facing, 0.01 * h);
      return { eye, facing };
    };
    const left = line('L');
    const right = line('R');
    // The nearest points of the two lines through the eyes.
    const w = left.eye.clone().sub(right.eye);
    const b = left.facing.dot(right.facing);
    const d = left.facing.dot(w);
    const e = right.facing.dot(w);
    const t = (b * e - d) / (1 - b * b);
    const u = (e - b * d) / (1 - b * b);
    const onLeft = left.eye.clone().addScaledVector(left.facing, t);
    const onRight = right.eye.clone().addScaledVector(right.facing, u);
    expect(onLeft.distanceTo(onRight)).toBeLessThan(1e-4);
    expect(t).toBeLessThan(0);
  });

  it('keeps the tip of the tail behind its root, with the vertices of the tip on it', () => {
    const head = body.heads.tail_tip;
    if (!head) {
      throw new Error('The fox has no tip of its tail.');
    }
    // The body faces -z, so the seated tail goes back to +z.
    expect(head[2]).toBeGreaterThan(body.heads.tail[2]);
    let onTip = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      for (let k = 0; k < 4; k++) {
        onTip += mesh.joints[v * 4 + k] === tip && (mesh.weights[v * 4 + k] ?? 0) > 0.5 ? 1 : 0;
      }
    }
    expect(onTip).toBeGreaterThan(50);
  });

  it('rests the haunch on the seat, and the tail goes over the seat', () => {
    const seat = body.seatHeight ?? 0;
    const back = CHAIR.seatDepth / 2;
    const depth = body.chairDepth ?? 0;
    let tailLow = Infinity;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const [x = 0, y = 0, z = 0] = [0, 1, 2].map((k) => mesh.positions[v * 3 + k] ?? 0);
      let tail = 0;
      for (let k = 0; k < 4; k++) {
        const joint = mesh.joints[v * 4 + k];
        tail += joint === tip || joint === root ? (mesh.weights[v * 4 + k] ?? 0) : 0;
      }
      if (tail > 0.5 && Math.abs(x) <= CHAIR.seatWidth / 2 && z <= back && z >= back - depth) {
        tailLow = Math.min(tailLow, y);
      }
    }
    expect(seat).toBeGreaterThan(0.05);
    // The tail lies on the back of the seat or above it, within 5 mm.
    expect(tailLow).toBeGreaterThan(seat - 0.005);
  });

  it('stands the tail with the turns of its two bones in the pose of the sheet', () => {
    const turns = body.standing?.tailTurns;
    if (!turns) {
      throw new Error('The fox has no turns of its tail in its standing pose.');
    }
    // The seated tail goes back, and the standing tail hangs down as in the source.
    expect(2 * Math.acos(Math.min(1, Math.abs(turns.tail[3])))).toBeGreaterThan(Math.PI / 6);
  });
});

describe('eyeOnHead (design 4.5)', () => {
  /**
   * Makes a vertex of a test mesh.
   *
   * @param x The x of the place.
   * @param y The y of the place.
   * @param z The z of the place.
   * @param material The material.
   * @param head The weight of the head bone. The neck takes the rest.
   * @returns The vertex.
   */
  const vertex = (x: number, y: number, z: number, material = 'fur', head = 1) => ({
    position: new Vector3(x, y, z),
    skin:
      head < 1 ? [['head', head] as const, ['neck', 1 - head] as const] : [['head', 1] as const],
    moves: [],
    material,
  });
  // A roof of two planes that meet at the ridge x = 0, z = 1. A gloss face and a face of the neck
  // lie nearer to the point than the roof, and a fur face of the head lies far away.
  const vertices = [
    vertex(-1, -1, 0),
    vertex(-1, 1, 0),
    vertex(0, -1, 1),
    vertex(0, 1, 1),
    vertex(1, -1, 0),
    vertex(1, 1, 0),
    vertex(-0.1, -0.1, 1.5, 'gloss'),
    vertex(0.1, -0.1, 1.5, 'gloss'),
    vertex(0, 0.1, 1.5, 'gloss'),
    vertex(-0.1, -0.1, 1.8, 'fur', 0.4),
    vertex(0.1, -0.1, 1.8, 'fur', 0.4),
    vertex(0, 0.1, 1.8, 'fur', 0.4),
    vertex(10, 0, 1),
    vertex(10, 1, 1),
    vertex(11, 0, 1),
  ];
  const face = (a: number, b: number, c: number) => ({
    corners: [a, b, c] satisfies [number, number, number],
    color: [1, 1, 1] satisfies Vec3,
    finish: 'matte' as const,
  });
  const mesh = {
    vertices,
    faces: [
      face(0, 2, 3),
      face(0, 3, 1),
      face(2, 4, 5),
      face(2, 5, 3),
      face(6, 7, 8),
      face(9, 10, 11),
      face(12, 14, 13),
    ],
  };

  it('finds the nearest point of the fur of the head', () => {
    const point = eyeOnHead(mesh, new Vector3(0, 0, 2));
    expect(point.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-9);
    expect(
      eyeOnHead(mesh, new Vector3(-1.5, 0, 0.5)).distanceTo(new Vector3(-1, 0, 0)),
    ).toBeLessThan(1e-9);
  });

  it('refuses a head with no fur face', () => {
    expect(() => eyeOnHead({ vertices, faces: [face(6, 7, 8)] }, new Vector3())).toThrow(
      /no fur face/,
    );
  });
});

describe('eyePush (design 4.5)', () => {
  /**
   * Makes a square of two faces through the origin, with a unit normal.
   *
   * @param normal The normal of the square.
   * @param at The place of the middle of the square.
   * @returns The two faces, counterclockwise from outside.
   */
  const square = (normal: Vector3, at = new Vector3()): Triangle[] => {
    const u = new Vector3(1, 0, 0).cross(normal).normalize();
    const w = normal.clone().cross(u);
    const corner = (a: number, b: number): Vector3 =>
      at.clone().addScaledVector(u, a).addScaledVector(w, b);
    return [
      new Triangle(corner(-1, -1), corner(1, -1), corner(1, 1)),
      new Triangle(corner(-1, -1), corner(1, 1), corner(-1, 1)),
    ];
  };
  const facing: Vec3 = [0, 0, 1];
  const h = 0.3;
  const middle: Vec3 = [0, 0, -0.01 * h];

  it('keeps an eye whose front face shows in place', () => {
    expect(eyePush(square(new Vector3(0, 0, 1)), { point: middle, normal: facing }, h)).toBe(0);
  });

  it('moves an eye out by the smallest step that shows its front face', () => {
    // A surface that faces 40° up covers the lower front of an eye that faces forward.
    const tilted = square(new Vector3(0, Math.sin(0.7), Math.cos(0.7)));
    const push = eyePush(tilted, { point: middle, normal: facing }, h);
    expect(push).toBeGreaterThan(0);
    const moved = (by: number): Vec3 => [0, 0, middle[2] + by];
    expect(eyePush(tilted, { point: moved(push), normal: facing }, h)).toBe(0);
    expect(eyePush(tilted, { point: moved(push - 0.001 * h), normal: facing }, h)).toBeCloseTo(
      0.001 * h,
      9,
    );
  });

  it('refuses an eye that no move up to 0.1 H takes out of the head', () => {
    const wall = square(new Vector3(0, 0, 1), new Vector3(0, 0, h));
    expect(() => eyePush(wall, { point: middle, normal: facing }, h)).toThrow(/No move/);
  });
});

describe('studioGlbPath', () => {
  const settings = ANIMALS.get('rabbit');

  it('gives the file of the settings when the settings name one', () => {
    if (!settings) {
      throw new Error('ANIMALS has no rabbit.');
    }
    const glb = 'assets/models/rabbit/rabbit-4.rig.glb';
    expect(studioGlbPath('rabbit', { ...settings, glb })).toBe(
      join(import.meta.dirname, '..', glb),
    );
  });
});

describe('pnpm studio-body with a head that the rig grows (design 4.4)', () => {
  it('moves each vertex of a grown head back by its share of the growth', () => {
    const neck = new Vector3(0, 0.6, 0.05);
    const source = new Vector3(0.02, 0.8, 0.2);
    const rig = headRig(neck, new Vector3(0, 0.75, 0.05), 1.5, 1);
    expect(rig.drop.length()).toBe(0);
    for (const share of [0, 0.4, 1]) {
      const grown = source
        .clone()
        .sub(neck)
        .multiplyScalar(1 + share * 0.5)
        .add(neck);
      expect(ungrown(grown, { head: share, neck: 1 - share }, rig).distanceTo(source)).toBeLessThan(
        1e-12,
      );
    }
  });

  it('keeps the move of the head along a short neck, and removes the growth and the neck stretch', () => {
    const neck = new Vector3(0, 0.6, 0.05);
    // A neck of 0.1 units, a head factor of 1.2, and a neck factor of 0.5: the head joint of the
    // file is 0.06 units above the neck joint, and the head moves 0.06 units down.
    const rig = headRig(neck, new Vector3(0, 0.66, 0.05), 1.2, 0.5);
    expect(rig.drop.distanceTo(new Vector3(0, -0.06, 0))).toBeLessThan(1e-12);
    expect(rig.length).toBeCloseTo(0.1, 12);
    // A point beyond the head joint and a point of the neck halfway along it.
    for (const source of [new Vector3(0.02, 0.8, 0.2), new Vector3(0.05, 0.65, 0.08)]) {
      const along = Math.min(Math.max(source.y - neck.y, 0), 0.1);
      for (const [head, share] of [
        [0, 1],
        [0.4, 0.6],
        [1, 0],
      ] as const) {
        const moved = source
          .clone()
          .addScaledVector(source.clone().sub(neck).multiplyScalar(0.2).add(rig.drop), head)
          .add(new Vector3(0, -0.5 * along * share, 0));
        const back = ungrown(moved, { head, neck: share }, rig);
        expect(back.distanceTo(source.clone().add(rig.drop))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('pnpm studio-body with a seat height in the settings (design 4.4)', async () => {
  const settings = rigMeshSettings('rabbit');
  if (!settings?.glb) {
    throw new Error('The rabbit has no settings with a GLB file.');
  }
  const bytes = await readFile(join(import.meta.dirname, '..', settings.glb));
  const floor = onFloor(settings);

  it('puts the seat top at the height of the settings, with the feet above the floor', () => {
    const high = studioBody(bytes, settings.glb ?? '', { ...floor, seat: 0.3 }).body;
    const low = studioBody(bytes, settings.glb ?? '', floor).body;
    expect(high.seatHeight).toBeCloseTo(0.3, 6);
    expect(low.seatHeight ?? 1).toBeLessThan(0.3);
    const lowest = (body: typeof high): number => {
      const { positions } = unpackStudioMesh(body.mesh);
      let y = Infinity;
      for (let v = 1; v < positions.length; v += 3) {
        y = Math.min(y, positions[v] ?? 0);
      }
      return y;
    };
    // The packed mesh keeps each place within 0.1 mm.
    expect(lowest(low)).toBeCloseTo(0, 3);
    expect(lowest(high)).toBeCloseTo(0.3 - (low.seatHeight ?? 0), 3);
  });
});

describe('pnpm studio-body with a move back on the chair in the settings (design 4.4)', async () => {
  const settings = ANIMALS.get('fox');
  if (!settings?.glb) {
    throw new Error('The fox has no settings with a GLB file.');
  }
  const bytes = await readFile(join(import.meta.dirname, '..', settings.glb));
  const at = (seatBack: number): StudioBody =>
    studioBody(bytes, settings.glb ?? '', { ...settings, seatBack }).body;
  const plain = at(0);
  // The move of the hips back (+z in the model axes) and the growth of the chair.
  const back = (body: StudioBody): number => body.heads.hips[2] - plain.heads.hips[2];
  const growth = (body: StudioBody): number => (body.chairDepth ?? 0) - (plain.chairDepth ?? 0);

  it('moves the body back on its chair, and the chair keeps its depth', () => {
    const near = at(0.01);
    expect(back(near)).toBeCloseTo(0.01, 6);
    expect(growth(near)).toBeCloseTo(0, 6);
  });

  it('moves the body back to the clearance of the back posts, and grows the chair forward by the rest', () => {
    const far = at(0.2);
    expect(back(far)).toBeGreaterThan(0.01);
    expect(back(far)).toBeLessThan(0.1);
    expect(back(far) + growth(far)).toBeCloseTo(0.2, 6);
  });
});
