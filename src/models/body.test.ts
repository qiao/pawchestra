import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { SPECIES_COLORS } from './colors.ts';
import { FINISH_ORDER, MeshBuilder, srgb, transform } from './mesh.ts';
import type { MeshData } from './mesh.ts';
import { box } from './primitives.ts';
import { BONE_NAMES, boneIndex, makeSkeleton } from './rig.ts';
import { EYE } from './eyes.ts';
import { BODY_BONES } from './body-format.ts';
import { buildBody, bodyRenderMesh, bodyRigOf } from './body.ts';
import type { BodyBones } from './biped.ts';
import type { BodyName, BodyRenderMesh } from './body.ts';
import { bodyNormals } from './body-normals.ts';
import { NO_OFFSETS, createBodyPose, poseBodyBones } from './body-rig.ts';
import type { BodyRig } from './body-rig.ts';

/** The eye bones of the player. */
const EYE_BONES: ReadonlySet<number> = new Set([boneIndex('eyeL'), boneIndex('eyeR')]);

/**
 * Gives the place of a corner of the render mesh of a body in the bind pose of the player,
 * with the skin of the GPU and a blink.
 *
 * @param rig The body rig.
 * @param body The bones of the body (`buildBody()`).
 * @param render The render mesh.
 * @param c The corner.
 * @param eyeScale The scale of the eyes on y: 1 is open.
 * @returns The place.
 */
function blinked(
  rig: BodyRig,
  body: BodyBones,
  render: BodyRenderMesh,
  c: number,
  eyeScale: number,
): Vector3 {
  const skeleton = makeSkeleton(
    {
      ...body.positions,
      instrument: body.positions.chest,
      bow: body.positions.handR,
      malletL: body.positions.handL,
      malletR: body.positions.handR,
      baton: body.positions.handR,
      slide: body.positions.chest,
    },
    'chest',
  );
  const bind = new Float32Array(BONE_NAMES.length * 4).map((_, i) => (i % 4 === 3 ? 1 : 0));
  const pose = poseBodyBones(rig, skeleton, bind, NO_OFFSETS, eyeScale, createBodyPose());
  const place = new Vector3().fromArray(render.data.positions, c * 3);
  const out = new Vector3();
  for (let k = 0; k < 4; k++) {
    const w = render.weights[c * 4 + k] ?? 0;
    const matrix = new Matrix4().fromArray(pose.matrices, (render.joints[c * 4 + k] ?? 0) * 16);
    out.addScaledVector(place.clone().applyMatrix4(matrix), w);
  }
  return out;
}

describe('buildBody (design 4.4)', () => {
  const builder = new MeshBuilder();
  const body = buildBody(builder, 'bear', true);
  const mesh = builder.build();
  const rig = bodyRigOf('bear', true);

  it('adds one triangle for each face of the body with its color, then the bead eyes', () => {
    const faces = rig.mesh.corners.length / 3;
    expect(mesh.colors[0]).toBeCloseTo(rig.mesh.colors[0] ?? -1, 6);
    expect(mesh.finishes.length).toBeGreaterThan(faces);
    for (let t = faces; t < mesh.finishes.length; t++) {
      expect(EYE_BONES.has(mesh.bones[t * 3] ?? -1)).toBe(true);
      expect(mesh.finishes[t]).toBe(FINISH_ORDER.indexOf('lacquer'));
    }
  });

  it('hangs the paws below the shoulders in the bind pose of the player', () => {
    for (const side of ['L', 'R'] as const) {
      const shoulder = body.positions[`upperArm${side}`];
      const hand = boneIndex(`hand${side}`);
      let count = 0;
      for (let c = 0; c < mesh.bones.length; c++) {
        if (mesh.bones[c] === hand) {
          count++;
          expect(mesh.positions[c * 3 + 1] ?? 0).toBeLessThan(shoulder[1] - 0.2);
          expect(Math.abs((mesh.positions[c * 3] ?? 0) - shoulder[0])).toBeLessThan(0.12);
        }
      }
      expect(count).toBeGreaterThan(20);
    }
  });

  it('puts the mouth under the nose and the palms below the wrists', () => {
    expect(body.mouth[1]).toBeLessThan(rig.body.nose[1]);
    expect(body.palmR[1]).toBeLessThan(body.positions.handR[1]);
    expect(body.headHeight).toBe(rig.body.headHeight);
  });
});

describe('the bead eyes of each body (design 4.5, 5.1)', () => {
  const names: readonly BodyName[] = ['bear', 'fox', 'polar-bear', 'rabbit'];
  for (const name of names) {
    const builder = new MeshBuilder();
    const body = buildBody(builder, name, false);
    const rig = bodyRigOf(name, false);
    const render = bodyRenderMesh(rig, builder.build());
    const first = rig.mesh.corners.length;
    if (!rig.body.eyes) {
      // A body that shows the eyes of its mesh has no pea eyes.
      continue;
    }
    const h = rig.body.eyes.headHeight;

    it(`${name}: puts each bead eye at its eye bone, with the size of the head that shows`, () => {
      for (const side of ['L', 'R'] as const) {
        const bone = boneIndex(`eye${side}`);
        const eye = new Vector3(...rig.body.heads[`eye_${side}`]);
        let far = 0;
        for (let c = first; c < render.data.bones.length; c++) {
          if (render.data.bones[c] === bone) {
            far = Math.max(
              far,
              eye.distanceTo(new Vector3().fromArray(render.data.positions, c * 3)),
            );
          }
        }
        // The farthest corner of the oval is at the end of its long axis.
        expect(far / h).toBeCloseTo(EYE[1] / 2, 2);
      }
    });

    it(`${name}: closes each bead eye on y around its eye bone in a blink`, () => {
      let count = 0;
      for (let c = first; c < render.data.bones.length; c++) {
        const side = render.data.bones[c] === boneIndex('eyeL') ? 'L' : 'R';
        const eye = new Vector3(...rig.body.heads[`eye_${side}`]);
        const open = blinked(rig, body, render, c, 1);
        const closed = blinked(rig, body, render, c, 0.05);
        expect(closed.y - eye.y).toBeCloseTo(0.05 * (open.y - eye.y), 6);
        expect(closed.x).toBeCloseTo(open.x, 6);
        count++;
      }
      expect(count).toBeGreaterThan(100);
    });
  }
});

describe('buildBody with another palette (design 4.4, 4.5)', () => {
  const build = (palette?: 'tan'): MeshData => {
    const builder = new MeshBuilder();
    buildBody(builder, 'fox', false, palette);
    return builder.build();
  };
  const red = build();
  const tan = build('tan');
  const matte = FINISH_ORDER.indexOf('matte');

  /**
   * Gives the mean color of the faces of a mesh whose red color is near a color: the faces of one
   * class of the colors of the red fox.
   *
   * @param mesh The mesh.
   * @param near The linear color of the class.
   * @returns The mean linear color.
   */
  const meanNear = (mesh: MeshData, near: readonly number[]): number[] => {
    const sum = [0, 0, 0];
    let count = 0;
    for (const [t, finish] of red.finishes.entries()) {
      const color = [0, 1, 2].map((k) => red.colors[t * 9 + k] ?? 0);
      if (finish === matte && Math.hypot(...color.map((c, k) => c - (near[k] ?? 0))) < 0.1) {
        count++;
        for (let k = 0; k < 3; k++) {
          sum[k] = (sum[k] ?? 0) + (mesh.colors[t * 9 + k] ?? 0);
        }
      }
    }
    return sum.map((value) => value / count);
  };

  it('keeps the faces and the gloss of the eyes and of the nose', () => {
    expect([...tan.positions]).toEqual([...red.positions]);
    expect([...tan.finishes]).toEqual([...red.finishes]);
    for (const [t, finish] of red.finishes.entries()) {
      if (finish !== matte) {
        expect([...tan.colors.subarray(t * 9, t * 9 + 9)]).toEqual([
          ...red.colors.subarray(t * 9, t * 9 + 9),
        ]);
      }
    }
  });

  it('moves the fur faces of the red fox mesh toward the tan fur', () => {
    const redFur = srgb(SPECIES_COLORS['fox-red'].fur);
    const tanFur = srgb(SPECIES_COLORS['fox-tan'].fur);
    const off = (color: readonly number[]): number =>
      Math.hypot(...color.map((c, k) => c - (tanFur[k] ?? 0)));

    expect(off(meanNear(tan, redFur))).toBeLessThan(off(meanNear(red, redFur)) / 2);
  });
});

describe('bodyRenderMesh (design 4.4)', () => {
  const builder = new MeshBuilder();
  buildBody(builder, 'bear', true);
  const first = builder.build().bones.length;
  const baton = boneIndex('baton');
  builder.add(box(0.01, 0.01, 0.4), { color: [1, 1, 1], bone: baton });
  const rig = bodyRigOf('bear', true);
  const render = bodyRenderMesh(rig, builder.build());

  it('draws the body in the bind pose of the body, with the skin of the body', () => {
    const v = rig.mesh.corners[5] ?? 0;
    expect([...render.data.positions.subarray(15, 18)]).toEqual([
      ...rig.mesh.positions.subarray(v * 3, v * 3 + 3),
    ]);
    expect(render.joints[20]).toBe(rig.mesh.joints[(rig.mesh.corners[5] ?? 0) * 4]);
    expect(render.correctives).toHaveLength(2);
  });

  it('keeps the instrument on the bones of the player, after the bones of the body', () => {
    expect(render.joints[first * 4]).toBe(BODY_BONES.length + baton);
    expect(render.weights[first * 4]).toBe(1);
    expect(render.correctives[0]?.[first * 3]).toBe(0);
  });
});

describe('bodyRenderMesh with a part on an eye bone (design 4.4, 5.1)', () => {
  const builder = new MeshBuilder();
  const body = buildBody(builder, 'bear', true);
  const rig = bodyRigOf('bear', true);
  const eye = new Vector3(...rig.body.heads.eye_L);
  const first = builder.build().bones.length;
  builder.add(box(0.02, 0.03, 0.01), {
    color: [0, 0, 0],
    bone: boneIndex('eyeL'),
    at: transform(rig.body.heads.eye_L),
  });
  const render = bodyRenderMesh(rig, builder.build());

  it('puts the part on the eye bone of the body', () => {
    expect(render.joints[first * 4]).toBe(BODY_BONES.indexOf('eye_L'));
    expect(render.weights[first * 4]).toBe(1);
  });

  it('closes the part on y around the eye bone in a blink', () => {
    for (let c = first; c < render.data.bones.length; c++) {
      const open = blinked(rig, body, render, c, 1);
      const closed = blinked(rig, body, render, c, 0.05);
      expect(open.distanceTo(new Vector3().fromArray(render.data.positions, c * 3))).toBeLessThan(
        1e-6,
      );
      expect(closed.y - eye.y).toBeCloseTo(0.05 * (open.y - eye.y), 6);
      expect(closed.x).toBeCloseTo(open.x, 6);
      expect(closed.z).toBeCloseTo(open.z, 6);
    }
  });
});

describe('bodyRenderMesh with a crease angle (design 4.5)', () => {
  const builder = new MeshBuilder();
  buildBody(builder, 'bear', true);
  const mesh = builder.build();
  const rig = bodyRigOf('bear', true);

  it('gives each corner of the body the smooth normal of the crease angle of the body', () => {
    const smooth = bodyRenderMesh({ ...rig, body: { ...rig.body, crease: 30 } }, mesh);
    expect(smooth.normals.corners).toEqual(bodyNormals(rig.mesh, 30));
  });

  it('turns the normals with each corrective shape, as the normals of the moved skin', () => {
    const smooth = bodyRenderMesh({ ...rig, body: { ...rig.body, crease: 30 } }, mesh).normals;
    expect(smooth.moves).toHaveLength(rig.mesh.correctives.length);
    for (const [s, corrective] of rig.mesh.correctives.entries()) {
      const moved = rig.mesh.positions.map((p, i) => p + (corrective[i] ?? 0));
      const target = bodyNormals({ ...rig.mesh, positions: moved }, 30);
      let turned = 0;
      for (let c = 0; c < rig.mesh.corners.length; c++) {
        const normal = [0, 1, 2].map(
          (k) => (smooth.corners[c * 3 + k] ?? 0) + (smooth.moves[s]?.[c * 3 + k] ?? 0),
        );
        const length = Math.hypot(...normal);
        const dot = normal.reduce((sum, n, k) => sum + (n / length) * (target[c * 3 + k] ?? 0), 0);
        expect(dot).toBeGreaterThan(0.9999);
        const before = [0, 1, 2].reduce(
          (sum, k) => sum + (smooth.corners[c * 3 + k] ?? 0) * (target[c * 3 + k] ?? 0),
          0,
        );
        if (before < Math.cos(Math.PI / 18)) {
          turned++;
        }
      }
      // Some corners of the shoulder turn by more than 10° with the shape.
      expect(turned).toBeGreaterThan(10);
      expect(smooth.moves[s]).toHaveLength(mesh.bones.length * 3);
    }
  });
});
