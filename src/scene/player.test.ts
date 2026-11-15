import { describe, expect, it } from 'vitest';

import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

import { ModelCache } from '../models/model-cache.ts';
import { INSTRUMENT_SUPPORTS, buildPlayer } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { BODY_BONES } from '../models/body-format.ts';
import { bodyNormals } from '../models/body-normals.ts';
import { CLOSED_EYE_SCALE } from '../models/body-rig.ts';
import type { Vec3 } from '../models/tuples.ts';
import { BIND_ROTATIONS } from '../pose/frames.ts';
import { poseSkeleton } from '../pose/test-kinematics.ts';
import { posedCorner } from '../pose/test-skin.ts';
import { poseAt } from '../pose/pose-at.ts';
import { PLAYING, allAudible, demoSceneOf } from '../pose/test-scene.ts';
import type { AnimalPose } from '../pose/types.ts';
import { runAll } from '../score/steps.ts';
import { createMaterials } from './geometry.ts';
import {
  applyPose,
  applyScenePose,
  createPlayerGeometry,
  createPlayerMesh,
  createPlayersSteps,
  hideBone,
} from './player.ts';
import type { PlayerSpot } from './player.ts';

/** Makes a player spot at a place. */
function spot(species: PlayerSpot['species'], instrument: PlayerSpot['instrument']): PlayerSpot {
  return {
    species,
    instrument,
    kettles: 4,
    support: INSTRUMENT_SUPPORTS[instrument],
    position: [1, 0, 2],
    facing: 0.5,
  };
}

describe('createPlayerGeometry', () => {
  it('gives each vertex its main bone and its second bone, with weights that add up to 1', () => {
    const model = buildPlayer('wolf', 'violin');
    const geometry = createPlayerGeometry(model);
    const { bones, blendBones, blendWeights } = model.mesh;

    const index = geometry.getAttribute('skinIndex');
    const weight = geometry.getAttribute('skinWeight');
    const actual = Array.from(bones, (_, v) => [
      index.getX(v),
      index.getY(v),
      index.getZ(v),
      index.getW(v),
      weight.getX(v),
      weight.getY(v),
      weight.getZ(v),
      weight.getW(v),
    ]);
    const expected = Array.from(bones, (bone, v) => {
      const w = blendWeights[v] ?? 0;
      return [bone, blendBones[v], 0, 0, Math.fround(1 - w), w, 0, 0];
    });
    expect(actual).toEqual(expected);
    // The body blends some vertices, and each rigid vertex has the weights 1 and 0.
    expect(blendWeights.some((w) => w > 0.2)).toBe(true);
    expect(actual.every(([, , , , a = 0, b = 0]) => Math.abs(a + b - 1) < 1e-6)).toBe(true);
  });
});

/**
 * Makes a pose from local turns of some bones.
 *
 * @param turns Each turn: the bone, the axis, and the angle in degrees.
 * @param rootOffset The offset of the root bone.
 * @returns The pose, with open eyes.
 */
function turnedPose(
  turns: readonly (readonly [BoneName, Vec3, number])[],
  rootOffset: Vec3 = [0, 0, 0],
): AnimalPose {
  const rotations = Float32Array.from(BIND_ROTATIONS);
  for (const [bone, axis, degrees] of turns) {
    new Quaternion()
      .setFromAxisAngle(new Vector3(...axis).normalize(), degrees * MathUtils.DEG2RAD)
      .toArray(rotations, boneIndex(bone) * 4);
  }
  return { rotations, rootOffset, slideOffset: [0, 0, 0], blink: 0 };
}

describe('createPlayerMesh', () => {
  it('skins each vertex as posedCorner() of the tests, within 1e-6 m', () => {
    const model = buildPlayer('wolf', 'violin');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    // A bent elbow, a raised arm with the clavicle turn and the elbow of the baton (plan of the
    // skinned bodies, section 1.5), and a turned body with a twist of the wrist.
    const poses = [
      turnedPose([['forearmR', [1, 0, 0], 90]]),
      turnedPose([
        ['chest', [0, 1, 0], 15],
        ['shoulderR', [0, 1, 0], 45],
        ['upperArmR', [0, 0, 1], 100],
        ['forearmR', [1, 0, 0], 146],
      ]),
      turnedPose(
        [
          ['spine', [1, 0, 0], 10],
          ['upperArmR', [1, 0, 0], -60],
          ['forearmR', [1, 1, 0], 120],
          ['handR', [0, 1, 0], 179],
        ],
        [0.1, 0.05, -0.2],
      ),
    ];
    const vertex = new Vector3();

    for (const pose of poses) {
      applyPose(mesh, pose);
      mesh.updateMatrixWorld(true);
      const posed = poseSkeleton(model, pose);
      let largest = 0;
      for (let v = 0; v < model.mesh.bones.length; v++) {
        mesh.getVertexPosition(v, vertex);
        largest = Math.max(largest, vertex.distanceTo(new Vector3(...posedCorner(posed, v))));
      }
      expect(largest).toBeLessThan(1e-6);
    }
  });

  describe('a body (design 4.4)', () => {
    const model = buildPlayer('bear', 'baton');
    const geometry = createPlayerGeometry(model);

    it('gives each vertex up to four bones, and the two corrective shapes of the arms', () => {
      const weights = geometry.getAttribute('skinWeight');
      for (let v = 0; v < weights.count; v++) {
        const sum = [0, 1, 2, 3].reduce((s, k) => s + weights.getComponent(v, k), 0);
        expect(sum).toBeCloseTo(1, 5);
      }
      expect(geometry.morphAttributes['position']).toHaveLength(2);
      expect(geometry.morphTargetsRelative).toBe(true);
    });

    it('skins each vertex as posedCorner() of the tests, within 1e-5 m', () => {
      const mesh = createPlayerMesh(model, geometry, createMaterials());
      // A raised right arm with a twist of the wrist and a turned and bent body, and an arm that
      // hangs, which gives the corrective shape its weight.
      const poses = [
        turnedPose([
          ['spine', [1, 0, 0], 20],
          ['upperArmR', [0, 0, 1], 110],
          ['forearmR', [1, 0, 0], 60],
          ['handR', [0, 1, 0], 70],
          ['fingersR', [0, 0, 1], -50],
        ]),
        turnedPose(
          [
            ['chest', [0, 1, 0], -25],
            ['upperArmL', [1, 0, 0], -40],
          ],
          [0, 0.02, 0],
        ),
      ];
      const vertex = new Vector3();
      for (const pose of poses) {
        applyPose(mesh, pose);
        mesh.updateMatrixWorld(true);
        const posed = poseSkeleton(model, pose);
        let largest = 0;
        for (let v = 0; v < model.mesh.bones.length; v++) {
          mesh.getVertexPosition(v, vertex);
          largest = Math.max(largest, vertex.distanceTo(new Vector3(...posedCorner(posed, v))));
        }
        expect(largest).toBeLessThan(1e-5);
        expect(mesh.morphTargetInfluences?.some((w) => w > 0)).toBe(true);
      }
    });

    it('draws the body with the shared material and the smooth normals of its crease angle', () => {
      const rig = model.bodyRig;
      if (!rig) {
        throw new Error('The bear has no body.');
      }
      const smoothModel = { ...model, bodyRig: { ...rig, body: { ...rig.body, crease: 30 } } };
      const smooth = createPlayerGeometry(smoothModel);
      const normals = smooth.getAttribute('normal');
      expect(smooth.morphAttributes['normal']).toHaveLength(2);
      const expected = bodyNormals(rig.mesh, 30);
      const bodyCorners = rig.mesh.corners.length;
      for (let c = 0; c < bodyCorners; c += 97) {
        expect(normals.getY(c)).toBeCloseTo(expected[c * 3 + 1] ?? 2, 6);
      }
      // The baton keeps the crease normals of its finish.
      const flat = geometry.getAttribute('normal');
      for (let c = bodyCorners; c < normals.count; c++) {
        expect(normals.getX(c)).toBe(flat.getX(c));
      }

      const shared = createMaterials();
      const mesh = createPlayerMesh(smoothModel, smooth, shared);
      expect(mesh.material).toEqual(shared);
      expect(shared[0]?.flatShading).toBe(false);
    });

    it('hides the baton by its bone', () => {
      const mesh = createPlayerMesh(model, geometry, createMaterials());
      hideBone(mesh, 'baton');
      mesh.updateMatrixWorld(true);
      const baton = model.mesh.bones.indexOf(boneIndex('baton'));
      const vertex = new Vector3();
      const first = mesh.getVertexPosition(baton, new Vector3());
      for (let v = baton; v < baton + 30; v++) {
        expect(mesh.getVertexPosition(v, vertex).distanceTo(first)).toBeLessThan(1e-9);
      }
    });
  });
});

describe('a body with the shape of a raised arm (design 4.4)', async () => {
  // The bow arm of the first red fox of K. 525 at 3.1 s, which gives the shape its full weight.
  const scene = await demoSceneOf('mozart-k525.mid');
  const index = scene.layout.players.findIndex((p) => p.cast.species === 'fox-red');
  const cast = scene.layout.players[index]?.cast;
  if (!cast) {
    throw new Error('K. 525 has no red fox.');
  }
  const model = scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support);
  const frame = poseAt(scene.plan, 3.1, 20, PLAYING, allAudible(scene.score));
  const pose = frame.players[index];

  it('gives the shape its weight as a third morph target, as posedCorner() of the tests skins it', () => {
    if (!pose) {
      throw new Error('The red fox has no pose.');
    }
    const geometry = createPlayerGeometry(model);
    expect(geometry.morphAttributes['position']).toHaveLength(3);
    const mesh = createPlayerMesh(model, geometry, createMaterials());
    applyPose(mesh, pose);
    mesh.updateMatrixWorld(true);
    expect(mesh.morphTargetInfluences?.[2]).toBeGreaterThan(0.5);
    const posed = poseSkeleton(model, pose);
    const vertex = new Vector3();
    let largest = 0;
    for (let v = 0; v < model.mesh.bones.length; v++) {
      mesh.getVertexPosition(v, vertex);
      largest = Math.max(largest, vertex.distanceTo(new Vector3(...posedCorner(posed, v))));
    }
    expect(largest).toBeLessThan(1e-5);
  });
});

describe('createPlayersSteps', () => {
  it('shares one geometry for each kind of player, and the shared material', () => {
    const materials = createMaterials();
    const asked: string[] = [];
    /** A cache that records each kind of player that the scene asks for. */
    class RecordingCache extends ModelCache {
      override get(...args: Parameters<ModelCache['get']>) {
        const [species, instrument, kettles = 4] = args;
        asked.push(`${species} ${instrument} ${kettles}`);
        return super.get(...args);
      }
    }
    const meshes = runAll(
      createPlayersSteps(
        [spot('wolf', 'violin'), spot('cat', 'viola'), spot('wolf', 'violin')],
        materials,
        new RecordingCache(),
      ),
    );
    // The models come from the cache of the score.
    expect(asked).toEqual(['wolf violin 4', 'cat viola 4', 'wolf violin 4']);
    expect(meshes).toHaveLength(3);
    const [a, b, c] = meshes;
    expect(a?.geometry).toBe(c?.geometry);
    expect(a?.geometry).not.toBe(b?.geometry);
    expect(a?.skeleton).not.toBe(c?.skeleton);
    for (const mesh of meshes) {
      expect(mesh.material).toEqual(materials);
      expect(mesh.position.toArray()).toEqual([1, 0, 2]);
      expect(mesh.rotation.y).toBe(0.5);
    }
  });
});

describe('applyScenePose', () => {
  it('gives each player its pose, and the last mesh the pose of the conductor', () => {
    const meshes = runAll(
      createPlayersSteps(
        [spot('wolf', 'violin'), spot('cat', 'viola'), spot('bear', 'baton')],
        createMaterials(),
        new ModelCache(),
      ),
    );
    const head = boneIndex('head');
    /** Makes a pose that turns the head about x by an angle. */
    const turned = (angle: number): AnimalPose => {
      const rotations = Float32Array.from(BIND_ROTATIONS);
      rotations.set([Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)], head * 4);
      return { rotations, rootOffset: [0, 0, 0], slideOffset: [0, 0, 0], blink: 0 };
    };
    applyScenePose(meshes, { players: [turned(0.1), turned(0.2)], conductor: turned(0.3) });
    // The bear of the conductor gets the matrix of each bone from the pose (design 4.4).
    const bodyHead = meshes[2]?.skeleton.bones[BODY_BONES.indexOf('head')]?.matrix;
    const angles = [
      ...meshes
        .slice(0, 2)
        .map((mesh) => 2 * Math.asin(mesh.skeleton.bones[head]?.quaternion.x ?? 0)),
      new Euler().setFromRotationMatrix(bodyHead ?? new Matrix4()).x,
    ];
    expect(angles[0]).toBeCloseTo(0.1, 6);
    expect(angles[1]).toBeCloseTo(0.2, 6);
    expect(angles[2]).toBeCloseTo(0.3, 6);
  });
});

describe('applyPose', () => {
  it('moves the trombone slide along its axis from its bind place (design 5.1)', () => {
    const model = buildPlayer('pig', 'trombone');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    const slide = mesh.skeleton.bones[boneIndex('slide')];
    const bind = slide?.position.toArray();
    const pose = {
      rotations: BIND_ROTATIONS,
      rootOffset: [0, 0, 0] as const,
      slideOffset: [0.1, -0.02, 0.05] as const,
      blink: 0,
    };
    applyPose(mesh, pose);
    expect(slide?.position.x).toBeCloseTo((bind?.[0] ?? 0) + 0.1, 9);
    expect(slide?.position.y).toBeCloseTo((bind?.[1] ?? 0) - 0.02, 9);
    expect(slide?.position.z).toBeCloseTo((bind?.[2] ?? 0) + 0.05, 9);
    // A later pose starts from the bind place again.
    applyPose(mesh, { ...pose, slideOffset: [0, 0, 0] });
    expect(slide?.position.toArray()).toEqual(bind);
  });

  it('moves the instrument from its bind place by the instrument offset (design 5.1)', () => {
    const model = buildPlayer('wolf', 'violin');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    const instrument = mesh.skeleton.bones[boneIndex('instrument')];
    const bind = instrument?.position.toArray();
    const pose = {
      rotations: BIND_ROTATIONS,
      rootOffset: [0, 0, 0] as const,
      slideOffset: [0, 0, 0] as const,
      instrumentOffset: [0.03, -0.2, -0.1] as const,
      blink: 0,
    };
    applyPose(mesh, pose);
    expect(instrument?.position.x).toBeCloseTo((bind?.[0] ?? 0) + 0.03, 9);
    expect(instrument?.position.y).toBeCloseTo((bind?.[1] ?? 0) - 0.2, 9);
    expect(instrument?.position.z).toBeCloseTo((bind?.[2] ?? 0) - 0.1, 9);
    // A pose with no offset puts the instrument back at its bind place.
    const { rotations, rootOffset, slideOffset, blink } = pose;
    applyPose(mesh, { rotations, rootOffset, slideOffset, blink });
    expect(instrument?.position.toArray()).toEqual(bind);
  });

  it('closes the eyes on y by the blink, with no other scale (design 4.7, 5.1)', () => {
    const model = buildPlayer('wolf', 'violin');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    const bones = mesh.skeleton.bones;
    const eyes = [bones[boneIndex('eyeL')], bones[boneIndex('eyeR')]];
    const pose = (blink: number): AnimalPose => ({
      rotations: BIND_ROTATIONS,
      rootOffset: [0, 0, 0],
      slideOffset: [0, 0, 0],
      blink,
    });
    applyPose(mesh, pose(0.6));
    for (const eye of eyes) {
      expect(eye?.scale.y).toBeCloseTo(0.4, 6);
      expect(eye?.scale.x).toBe(1);
      expect(eye?.scale.z).toBe(1);
    }
    // A closed eye keeps a thin line, so that the bone matrix stays valid.
    applyPose(mesh, pose(1));
    for (const eye of eyes) {
      expect(eye?.scale.y).toBe(CLOSED_EYE_SCALE);
    }
    applyPose(mesh, pose(0));
    for (const eye of eyes) {
      expect(eye?.scale.y).toBe(1);
    }
    const others = bones.filter((bone) => !eyes.includes(bone));
    expect(others.every((bone) => bone.scale.equals(eyes[0]?.scale ?? bone.scale))).toBe(true);
  });

  it('writes the quaternions with no update of the Euler angles (review of step 5, F13)', () => {
    const model = buildPlayer('wolf', 'violin');
    const mesh = createPlayerMesh(model, createPlayerGeometry(model), createMaterials());
    const head = mesh.skeleton.bones[boneIndex('head')];
    const rotations = Float32Array.from(BIND_ROTATIONS);
    rotations.set([Math.sin(0.2), 0, 0, Math.cos(0.2)], boneIndex('head') * 4);
    applyPose(mesh, { rotations, rootOffset: [0, 0, 0], slideOffset: [0, 0, 0], blink: 0 });
    expect(head?.quaternion.x).toBeCloseTo(Math.sin(0.2), 6);
    // The Euler angles stay at the bind pose, because no code reads them.
    expect(head?.rotation.x).toBe(0);
    // The matrix of the bone follows the quaternion.
    head?.updateMatrix();
    const turned = new Vector3(0, 0, -1).applyQuaternion(head?.quaternion ?? new Quaternion());
    const fromMatrix = new Vector3(0, 0, -1).transformDirection(head?.matrix ?? new Matrix4());
    expect(fromMatrix.distanceTo(turned)).toBeLessThan(1e-6);
  });
});
