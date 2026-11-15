import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { BODY_TRIANGLE_BUDGET } from '../../tools/body-budgets.ts';
import type { BodyBoneName } from './biped.ts';
import { seated } from './body-frame.ts';
import { BONE_NAMES, boneIndex, makeSkeleton } from './rig.ts';
import { SPECIES, SPECIES_IDS } from './species.ts';
import type { SpeciesParams } from './species.ts';
import { bodyRigOf } from './body.ts';
import { builtBody } from './test-body.ts';
import type { BuiltBody } from './test-body.ts';

/** The seat height of the bodies of these tests, in meters. */
const SEAT = 0.35;

/**
 * Builds the body of a species on a seat of {@link SEAT}.
 *
 * @param params The species parameters.
 * @returns The mesh and the bones.
 */
function build(params: SpeciesParams): BuiltBody {
  return builtBody(params, seated(SEAT));
}

describe('buildBiped for each species', () => {
  const bodyBones = BONE_NAMES.filter(
    (name): name is BodyBoneName =>
      !['instrument', 'bow', 'malletL', 'malletR', 'baton', 'slide'].includes(name),
  );

  for (const id of SPECIES_IDS) {
    const species: SpeciesParams = SPECIES[id];
    const { mesh, body } = build(species);
    const { headHeight: h } = species;
    // A body keeps the mesh, the skin, and the colors of its GLB file (design 4.4).
    const bodyRig = species.body ? bodyRigOf(species.body, false) : null;

    describe(id, () => {
      it('stays within its body budget (design 4.5)', () => {
        // A body keeps the faces of its GLB file. The first download and the frame time
        // stay the limits (design 4.5).
        expect(mesh.positions.length / 9).toBeLessThanOrEqual(
          bodyRig ? BODY_TRIANGLE_BUDGET : 2600,
        );
      });

      it.runIf(bodyRig)('keeps the faces and the colors of its GLB file (design 4.4)', () => {
        const faces = bodyRig?.mesh.colors ?? new Float32Array();
        // The bead eyes follow the faces of the file (design 4.5).
        expect(mesh.positions.length / 9).toBeGreaterThan(faces.length / 3);
        for (let t = 0; t < faces.length / 3; t++) {
          for (let k = 0; k < 3; k++) {
            expect(mesh.colors[t * 9 + k]).toBeCloseTo(faces[t * 3 + k] ?? -1, 6);
          }
        }
        // The faces point out: the signed volume of the closed shells is positive.
        let volume = 0;
        const p = mesh.positions;
        for (let t = 0; t < p.length / 9; t++) {
          const at = (k: number): Vector3 => new Vector3().fromArray(p, t * 9 + k * 3);
          volume += at(0).dot(new Vector3().crossVectors(at(1), at(2))) / 6;
        }
        expect(volume).toBeGreaterThan(0);
      });

      it.runIf(!bodyRig)(
        'puts each triangle on one body bone, with faces that point out (design 4.4)',
        () => {
          const volumes = new Map<number, number>();
          const p = mesh.positions;
          for (let t = 0; t < mesh.bones.length / 3; t++) {
            const bone = mesh.bones[t * 3] ?? -1;
            expect(mesh.bones[t * 3 + 1]).toBe(bone);
            expect(mesh.bones[t * 3 + 2]).toBe(bone);
            const at = (k: number): Vector3 =>
              new Vector3(
                p[t * 9 + k * 3] ?? 0,
                p[t * 9 + k * 3 + 1] ?? 0,
                p[t * 9 + k * 3 + 2] ?? 0,
              );
            const volume = at(0).dot(new Vector3().crossVectors(at(1), at(2))) / 6;
            volumes.set(bone, (volumes.get(bone) ?? 0) + volume);
          }
          for (const [bone, volume] of volumes) {
            expect(bodyBones).toContain(BONE_NAMES[bone]);
            expect(volume, BONE_NAMES[bone]).toBeGreaterThan(0);
          }
        },
      );

      it('puts the left side of the animal at -x, because it faces -z', () => {
        const p = body.positions;
        expect(p.upperArmL[0]).toBeLessThan(0);
        expect(p.upperArmR[0]).toBeGreaterThan(0);
        expect(p.shinL[2]).toBeLessThan(p.thighL[2]);
      });

      it('puts the mouth near the middle plane, below the eyes, and on the face', () => {
        // The mouthpiece of a wind instrument goes to the mouth (design 4.6).
        const { mouth } = body;
        const eye = body.positions.eyeR;
        expect(Math.abs(mouth[0] - body.headCenter[0])).toBeLessThan(0.05 * h);
        expect(mouth[1]).toBeLessThan(eye[1]);
        expect(mouth[2]).toBeLessThan(eye[2]);
        // A corner of the head, the jaw, or the trunk is near the mouth.
        const face = new Set((['head', 'jaw', 'trunk1'] as const).map(boneIndex));
        let nearest = Infinity;
        for (let v = 0; v < mesh.bones.length; v++) {
          if (face.has(mesh.bones[v] ?? -1)) {
            nearest = Math.min(
              nearest,
              new Vector3().fromArray(mesh.positions, v * 3).distanceTo(new Vector3(...mouth)),
            );
          }
        }
        expect(nearest).toBeLessThan(0.2 * h);
      });

      it('places each body bone, and makes a skeleton of the 38 bones of design 4.7', () => {
        expect(Object.keys(body.positions).toSorted()).toEqual([...bodyBones].toSorted());
        const skeleton = makeSkeleton(
          {
            ...body.positions,
            instrument: body.headCenter,
            bow: body.palmR,
            malletL: body.palmL,
            malletR: body.palmR,
            baton: body.palmR,
            slide: body.headCenter,
          },
          'chest',
        );
        expect(skeleton.positions).toHaveLength(38);
        expect(skeleton.parents.filter((parent) => parent === -1)).toHaveLength(1);
      });
    });
  }
});
