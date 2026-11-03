import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Box3, Quaternion, Triangle, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { STUDIO_BONES, unpackStudioMesh } from '../src/models/studio-format.ts';
import type { RequiredStudioBone, StudioBody } from '../src/models/studio-format.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { PIANO_BENCH } from '../src/models/instruments/piano.ts';
import { CHAIR, CHAIR_LEG } from '../src/models/props.ts';
import type { AnimalSettings, Glb, SeatExtras } from './studio-body.ts';
import {
  ANIMALS,
  eyeOnHead,
  eyePush,
  eyeVertices,
  headFactorOf,
  headRig,
  headShiftOf,
  keptCorrectives,
  neckFactorOf,
  inspectStudioGlb,
  inspectionLines,
  ownBone,
  studioBody,
  studioGlbPath,
  studioModule,
  raisesOf,
  readGlb,
  ungrown,
  weldMesh,
} from './studio-body.ts';

/** The GLB file of the studio bear. */
const SOURCE = 'lowpoly-studio/animals/bear/out/bear.glb';

describe('pnpm studio-body (design 4.4)', async () => {
  const bytes = await readFile(join(import.meta.dirname, '..', SOURCE));
  const { body, sheetWeights } = studioBody(bytes, SOURCE, {
    landmark: 'shoulders',
    height: 1,
    seated: false,
    soloist: false,
    constant: 'STUDIO_BEAR',
    crease: 15,
  });
  const mesh = unpackStudioMesh(body.mesh);

  it('scales the animal so that its shoulder joints are at the height of the settings', () => {
    expect(body.heads.upper_arm_L[1]).toBeCloseTo(1, 5);
    expect(body.heads.upper_arm_R[1]).toBeCloseTo(1, 5);
    expect(body.scale).toBeGreaterThan(1);
  });

  it('keeps a standing body over the origin with no seat', () => {
    expect(body.floor).toEqual([0, 0, 0]);
    expect(body.seatHeight).toBeNull();
  });

  it('turns the animal to face -z with its left side at -x', () => {
    expect(body.heads.upper_arm_L[0]).toBeLessThan(0);
    expect(body.heads.upper_arm_R[0]).toBeGreaterThan(0);
    expect(body.nose[2]).toBeLessThan(body.headCenter[2]);
    expect(body.heads.eye_L[0]).toBeLessThan(0);
  });

  it('keeps the two sides of the skeleton mirror images', () => {
    for (const bone of STUDIO_BONES.filter((b) => b.endsWith('_L'))) {
      const left = body.heads[bone];
      const right = body.heads[STUDIO_BONES.find((b) => b === bone.replace(/_L$/, '_R')) ?? bone];
      if (!left || !right) {
        throw new Error(`The body has no head of ${bone} or of its right side.`);
      }
      expect(right[0], bone).toBeCloseTo(-left[0], 5);
      expect(right[1], bone).toBeCloseTo(left[1], 5);
      expect(right[2], bone).toBeCloseTo(left[2], 5);
    }
  });

  it('keeps the body, and drops the eyes and the baton of the studio', () => {
    expect(mesh.corners.length / 3).toBeGreaterThan(2000);
    const used = new Set<number>();
    for (let v = 0; v < mesh.weights.length; v++) {
      if ((mesh.weights[v] ?? 0) > 0) {
        used.add(mesh.joints[v] ?? 0);
      }
    }
    // The app adds the pea eyes on the eye bones (design 4.5).
    expect(used.has(STUDIO_BONES.indexOf('eye_L'))).toBe(false);
    expect(used.has(STUDIO_BONES.indexOf('eye_R'))).toBe(false);
    expect(Math.max(...used)).toBeLessThan(STUDIO_BONES.length);
    const welded = weldMesh(readGlb(bytes), []);
    const eyes = eyeVertices(welded);
    const eyeFaces = welded.faces.filter((face) =>
      face.corners.every((c) => eyes.L.has(c) || eyes.R.has(c)),
    ).length;
    expect(eyeFaces).toBeGreaterThan(0);
    expect(mesh.corners.length / 3).toBe(welded.faces.length - eyeFaces);
  });

  it('puts each eye bone in the head surface under the old eye, facing out (design 4.5)', () => {
    const welded = weldMesh(readGlb(bytes), []);
    const eyes = eyeVertices(welded);
    const h = body.eyes.headHeight;
    // The head of the bear does not grow, so the eyes take the head height of the holds.
    expect(h).toBe(body.headHeight);
    // The studio faces +z with its left side at +x, and the app faces -z.
    const toApp = (p: Vector3): Vector3 => new Vector3(-p.x, p.y, -p.z).multiplyScalar(body.scale);
    const head = new Box3();
    for (const vertex of welded.vertices) {
      const share = vertex.skin.find(([bone]) => bone === 'head')?.[1] ?? 0;
      if (vertex.material === 'fur' && share > 0.5) {
        head.expandByPoint(toApp(vertex.position));
      }
    }
    const middleOfHead = head.getCenter(new Vector3());
    for (const side of ['L', 'R'] as const) {
      const old = new Vector3();
      for (const v of eyes[side]) {
        old.add(welded.vertices[v]?.position ?? new Vector3());
      }
      const middle = toApp(old.divideScalar(eyes[side].size));
      const eye = new Vector3(...body.heads[`eye_${side}`]);
      const facing = new Vector3(...body.eyes.directions[side]);
      expect(eye.distanceTo(middle) / h).toBeLessThan(0.1);
      expect(facing.length()).toBeCloseTo(1, 5);
      // The middle of the eye lies 0.01 H into the head, and the eye faces out from the middle
      // of the head, forward and to its own side.
      const surface = eye.clone().addScaledVector(facing, 0.01 * h);
      expect(surface.sub(middleOfHead).normalize().dot(facing)).toBeGreaterThan(0.99999);
      expect(facing.z).toBeLessThan(0);
      expect(Math.sign(facing.x)).toBe(side === 'L' ? -1 : 1);
    }
  });

  it('moves each pea eye out until the head covers no part of its front face (design 4.5)', () => {
    const packed = unpackStudioMesh(body.mesh);
    const at = (v: number): Vector3 => new Vector3().fromArray(packed.positions, v * 3);
    const faces = Array.from(
      { length: packed.corners.length / 3 },
      (_, t) =>
        new Triangle(
          at(packed.corners[t * 3] ?? 0),
          at(packed.corners[t * 3 + 1] ?? 0),
          at(packed.corners[t * 3 + 2] ?? 0),
        ),
    );
    for (const side of ['L', 'R'] as const) {
      const eye = { point: body.heads[`eye_${side}`], normal: body.eyes.directions[side] };
      expect(eyePush(faces, eye, body.eyes.headHeight)).toBe(0);
    }
  });

  it('gives each vertex weights that add up to 1', () => {
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const sum = [0, 1, 2, 3].reduce((s, k) => s + (mesh.weights[v * 4 + k] ?? 0), 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('keeps the faces turned outward', () => {
    // The signed volume of the closed shells is positive when the faces point out.
    let volume = 0;
    const at = (v: number, k: number): number => mesh.positions[v * 3 + k] ?? 0;
    for (let t = 0; t < mesh.corners.length; t += 3) {
      const [a, b, c] = [mesh.corners[t] ?? 0, mesh.corners[t + 1] ?? 0, mesh.corners[t + 2] ?? 0];
      volume +=
        (at(a, 0) * (at(b, 1) * at(c, 2) - at(b, 2) * at(c, 1)) -
          at(a, 1) * (at(b, 0) * at(c, 2) - at(b, 2) * at(c, 0)) +
          at(a, 2) * (at(b, 0) * at(c, 1) - at(b, 1) * at(c, 0))) /
        6;
    }
    expect(volume).toBeGreaterThan(0);
  });

  it('moves only the skin of its own side with each corrective shape', () => {
    const [left, right] = mesh.correctives;
    expect(left && right).toBeTruthy();
    let movedLeft = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3] ?? 0;
      const moveLeft = Math.hypot(...[0, 1, 2].map((k) => left?.[v * 3 + k] ?? 0));
      const moveRight = Math.hypot(...[0, 1, 2].map((k) => right?.[v * 3 + k] ?? 0));
      if (moveLeft > 0) {
        movedLeft += 1;
        expect(x).toBeLessThan(0.05);
      }
      if (moveRight > 0) {
        expect(x).toBeGreaterThan(-0.05);
      }
    }
    expect(movedLeft).toBeGreaterThan(100);
  });

  it('gives the corrective shapes their full weight in the pose of the sheet', () => {
    expect(sheetWeights).toEqual([1, 1]);
    // The arms of the sheet hang down and a little out.
    expect(body.sheetArms.L[1]).toBeLessThan(-0.5);
    expect(body.sheetArms.L[0]).toBeLessThan(0);
    expect(body.sheetArms.R[0]).toBeGreaterThan(0);
  });

  it('writes a module with the constant of the body', () => {
    const text = studioModule('bear', 'STUDIO_BEAR', body);
    expect(text).toContain('export const STUDIO_BEAR = {');
    expect(text).toContain('} satisfies StudioBody;');
    expect(text).toContain(body.sha256);
  });
});

describe('pnpm studio-body with four digits on each paw (design 4.4)', async () => {
  const source = 'lowpoly-studio/animals/polar-bear/out/polar-bear.glb';
  const bytes = withSeat(await readFile(join(import.meta.dirname, '..', source)));
  const settings = ANIMALS.get('polar-bear');
  if (!settings) {
    throw new Error('The polar bear has no settings.');
  }
  const { body } = studioBody(bytes, source, settings);
  const mesh = unpackStudioMesh(body.mesh);

  it('gives each digit to the finger bone of its side', () => {
    expect(ownBone('finger3_L')).toBe('fingers_L');
    expect(ownBone('finger1_R')).toBe('fingers_R');
    expect(ownBone('hand_L')).toBe('hand_L');
  });

  it('moves the claws of each paw with its finger bone', () => {
    for (const side of ['L', 'R'] as const) {
      const bone = STUDIO_BONES.indexOf(`fingers_${side}`);
      let count = 0;
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        const w = [0, 1, 2, 3].reduce(
          (sum, k) => sum + (mesh.joints[v * 4 + k] === bone ? (mesh.weights[v * 4 + k] ?? 0) : 0),
          0,
        );
        count += w > 0.5 ? 1 : 0;
      }
      expect(count, side).toBeGreaterThan(50);
      // The claw tips are beyond the knuckles.
      const knuckle = body.heads[`fingers_${side}`];
      const wrist = body.heads[`hand_${side}`];
      const tip = body.fingerTips[side];
      const along = (p: readonly number[]): number =>
        [0, 1, 2].reduce(
          (sum, k) => sum + ((p[k] ?? 0) - (wrist[k] ?? 0)) * ((knuckle[k] ?? 0) - (wrist[k] ?? 0)),
          0,
        );
      expect(along(tip), side).toBeGreaterThan(along(knuckle));
    }
  });
});

describe('pnpm studio-body with a seated body (design 4.4)', async () => {
  const source = 'lowpoly-studio/animals/polar-bear/out/polar-bear.glb';
  const bytes = withSeat(await readFile(join(import.meta.dirname, '..', source)));
  const settings = ANIMALS.get('polar-bear');
  if (!settings) {
    throw new Error('The polar bear has no settings.');
  }
  const { body } = studioBody(bytes, source, settings);
  const mesh = unpackStudioMesh(body.mesh);
  const at = (v: number, k: number): number => mesh.positions[v * 3 + k] ?? 0;
  const count = mesh.positions.length / 3;
  // The polar bear sits on a bench of its own height (`seat`). With no seat height, the export
  // drops the body to the floor, and the studio fitted the keys to the elbows of that body.
  const floor = studioBody(bytes, source, onFloor(settings)).body;

  it('drops the seated body so that its soles are on the floor', () => {
    const { positions } = unpackStudioMesh(floor.mesh);
    let low = Infinity;
    for (let v = 1; v < positions.length; v += 3) {
      low = Math.min(low, positions[v] ?? 0);
    }
    expect(low).toBeCloseTo(0, 3);
    expect(floor.heads.hips[1]).toBeGreaterThan(floor.heads.thigh_L[1] - 0.05);
  });

  it('puts the keys of the studio a little below the elbows of the seated bind pose', () => {
    // The landmark height is the height of the keys of the studio in the app. The longer shins
    // raise them above the keys of the piano of the app.
    for (const side of ['L', 'R'] as const) {
      const elbow = floor.heads[`forearm_${side}`][1];
      expect(elbow - settings.height, side).toBeGreaterThan(0);
      expect(elbow - settings.height, side).toBeLessThan(0.2);
    }
  });

  it('rests the body on a bench that no part of it goes into', () => {
    const seat = body.seatHeight ?? 0;
    expect(seat).toBeGreaterThan(0);
    let low = Infinity;
    for (let v = 0; v < count; v++) {
      const inside =
        Math.abs(at(v, 0)) <= PIANO_BENCH.width / 2 && Math.abs(at(v, 2)) <= PIANO_BENCH.depth / 2;
      if (inside) {
        low = Math.min(low, at(v, 1));
      }
    }
    // The packed places have steps of 1 mm or less.
    expect(Math.abs(low - seat)).toBeLessThan(0.001);
    // The hips are above the seat, and the body sits in front of the center of the bench.
    expect(body.heads.hips[1]).toBeGreaterThan(seat);
    expect(body.floor[1]).toBe(0);
    expect(body.floor[2]).toBeLessThan(0);
  });
});

describe('pnpm studio-body --inspect (design 4.4)', async () => {
  const read = async (animal: string): Promise<Uint8Array> =>
    withSeat(
      await readFile(
        join(import.meta.dirname, '..', `lowpoly-studio/animals/${animal}/out/${animal}.glb`),
      ),
    );
  const bear = inspectStudioGlb(await read('bear'), ANIMALS.get('bear') ?? null);
  const polar = inspectStudioGlb(await read('polar-bear'), ANIMALS.get('polar-bear') ?? null);
  const bearText = inspectionLines(bear).join('\n');
  const polarText = inspectionLines(polar).join('\n');

  it('prints each part that a new studio body needs', () => {
    for (const text of [bearText, polarText]) {
      for (const part of [
        'Scale:',
        'Scene nodes',
        'Joints of the skin',
        'Digits of the left paw',
        'Morph targets',
        'Clips',
        'Hips in the bind pose',
        'Lowest point of the skin',
        'Props',
      ]) {
        expect(text, part).toContain(part);
      }
      // Each length is in units of the studio and in meters.
      expect(text).toMatch(/Hips in the bind pose: [\d.]+ u \([\d.]+ m\)/);
    }
  });

  it('lists the skinned mesh, the root joint, and the joints that the export drops', () => {
    expect(bear.nodes.filter((node) => node.kind === 'skinned mesh')).toHaveLength(1);
    const root = bear.nodes.find((node) => node.kind === 'joint');
    expect(root?.joints).toBe(bear.joints.all.length);
    expect(bear.joints.dropped).toEqual(['baton']);
    expect(bear.props).toEqual([]);
    for (const facts of [bear, polar]) {
      expect(facts.joints.missing).toEqual([]);
      expect(facts.joints.unknown).toEqual([]);
    }
  });

  it('lists the digits of each paw, and the morph targets that the export drops', () => {
    expect(bear.joints.digits.L).toEqual([]);
    expect(polar.joints.digits.L.length).toBeGreaterThan(1);
    expect(polar.joints.digits.R.length).toBe(polar.joints.digits.L.length);
    // Each digit is on the paw of its own side.
    for (const side of ['L', 'R'] as const) {
      for (const digit of polar.joints.digits[side]) {
        expect(digit.endsWith(`_${side}`), digit).toBe(true);
      }
    }
    expect(polarText).toMatch(/Digits of the right paw: finger\d_R/);
    expect(polar.targets.filter((t) => t.kept).map((t) => t.name)).toEqual([
      'arm_down_L',
      'arm_down_R',
    ]);
    expect(polar.targets.some((t) => !t.kept)).toBe(true);
  });

  it('gives the hips of the seated clips below the hips of the bind pose', () => {
    const play = polar.clips.find((clip) => clip.name === 'play');
    expect(play?.seconds).toBeGreaterThan(0);
    expect(play?.hips).toBeLessThan(polar.bindHips - 0.05);
    // The soles of a seated bind pose are above the floor, and a standing body stands on it.
    expect(polar.lowest[1]).toBeGreaterThan(0.05);
    expect(Math.abs(bear.lowest[1])).toBeLessThan(0.05);
    expect(bear.clips.map((clip) => clip.name)).toContain('reference');
    // Only a seated body drops.
    expect(polarText).toContain('Seated: the body drops');
    expect(bearText).toContain('Standing: no drop.');
    expect(bearText).not.toContain('drops');
  });

  it('gives the bench top, the key top, and the key front at the scale of the settings', () => {
    expect(polar.props.map((prop) => prop.name)).toEqual(
      expect.arrayContaining(['bench', 'piano', 'piano_key_*']),
    );
    const bench = polar.props.find((prop) => prop.name === 'bench');
    const keys = polar.keys;
    if (!bench || !keys || polar.benchTop === null) {
      throw new Error('The polar bear has no bench or no keys.');
    }
    expect(polar.benchTop).toBeLessThan(keys.top);
    // The front edge of the keys is the edge near the player, in front of the bench.
    expect(keys.front).toBeGreaterThan(bench.box.max[2]);
    expect(keys.front).toBeLessThan(
      polar.props.find((prop) => prop.name === 'piano_key_*')?.box.max[2] ?? 0,
    );
    expect(keys.top * polar.scale).toBeCloseTo(ANIMALS.get('polar-bear')?.height ?? 0, 5);
    expect(polarText).toContain('Key front');
  });

  it('gives the arm from the shoulder joint to the middle of the palm at the joints of the export', async () => {
    // The bear has one finger joint on each paw, and the polar bear has the digits of a paw.
    for (const [animal, facts] of [
      ['bear', bear],
      ['polar-bear', polar],
    ] as const) {
      const settings = ANIMALS.get(animal);
      if (!settings) {
        throw new Error(`The ${animal} has no settings.`);
      }
      const { heads } = studioBody(await read(animal), 'x.glb', settings).body;
      for (const side of ['L', 'R'] as const) {
        const head = (bone: RequiredStudioBone): Vector3 => new Vector3(...heads[bone]);
        const wrist = head(`hand_${side}`);
        const palm = wrist
          .clone()
          .add(head(`fingers_${side}`))
          .multiplyScalar(0.5);
        const arm =
          head(`upper_arm_${side}`).distanceTo(head(`forearm_${side}`)) +
          head(`forearm_${side}`).distanceTo(wrist) +
          wrist.distanceTo(palm);
        expect((facts.arms[side] ?? 0) * facts.scale, `${animal} ${side}`).toBeCloseTo(arm, 4);
      }
    }
    expect(bearText).toMatch(
      /Arm from the shoulder joint to the middle of the palm.*: L [\d.]+ u \([\d.]+ m\), R /,
    );
  });

  it('gives the scale of the export, and assumes the shoulders at 1 m for a new animal', async () => {
    const bytes = await read('polar-bear');
    const settings = ANIMALS.get('polar-bear');
    if (!settings) {
      throw new Error('The polar bear has no settings.');
    }
    expect(polar.scale).toBeCloseTo(studioBody(bytes, 'x.glb', settings).body.scale, 5);

    const facts = inspectStudioGlb(bytes, null);
    expect(facts.scaleFrom).toContain('assumed');
    const assumed = {
      ...settings,
      landmark: 'shoulders',
      height: 1,
      seated: false,
      soloist: false,
    } as const;
    expect(facts.scale).toBeCloseTo(studioBody(bytes, 'x.glb', assumed).body.scale, 5);
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

describe('pnpm studio-body with a seated body that also stands (design 4.4)', async () => {
  const source = 'lowpoly-studio/animals/rabbit/out/rabbit.glb';
  const bytes = withSeat(await readFile(join(import.meta.dirname, '..', source)));
  const rabbit = ANIMALS.get('rabbit');
  if (!rabbit) {
    throw new Error('The rabbit has no settings.');
  }
  const settings = onFloor(rabbit);
  const { body, sheetWeights } = studioBody(bytes, source, settings);
  const mesh = unpackStudioMesh(body.mesh);
  const facts = inspectStudioGlb(bytes, settings);

  it('drops the held violin and bow of the studio with their faces and bones', () => {
    expect(facts.joints.dropped).toEqual(['violin', 'bow']);
    expect(facts.joints.unknown).toEqual([]);
    const animal = facts.nodes.find((node) => node.kind === 'skinned mesh');
    const kept = ['fur', 'gloss'].reduce((sum, m) => sum + (animal?.faces.get(m) ?? 0), 0);
    // The export also drops the eyes of the studio (design 4.5).
    const welded = weldMesh(readGlb(bytes), []);
    const eyes = eyeVertices(welded);
    const eyeFaces = welded.faces.filter((face) =>
      face.corners.every((c) => eyes.L.has(c) || eyes.R.has(c)),
    ).length;
    expect(mesh.corners.length / 3).toBe(kept - eyeFaces);
  });

  it('rests the seated body on a chair that fits its legs and its seat', () => {
    const seat = body.seatHeight ?? 0;
    const depth = body.chairDepth ?? 0;
    // The chair keeps the back of the chair of design 4.5, and its front edge is further back.
    const back = CHAIR.seatDepth / 2;
    let low = Infinity;
    let lowOnSeat = Infinity;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const [x = 0, y = 0, z = 0] = [0, 1, 2].map((k) => mesh.positions[v * 3 + k] ?? 0);
      low = Math.min(low, y);
      if (Math.abs(x) <= CHAIR.seatWidth / 2 && z <= back && z >= back - depth) {
        lowOnSeat = Math.min(lowOnSeat, y);
      }
    }
    expect(low).toBeCloseTo(0, 3);
    expect(Math.abs(lowOnSeat - seat)).toBeLessThan(0.001);
    expect(seat).toBeGreaterThan(0.05);
    expect(body.heads.hips[1]).toBeGreaterThan(seat);
    // The seat is shorter than the chair of design 4.5, and the body sits on it, in front of the
    // back posts.
    expect(depth).toBeLessThan(CHAIR.seatDepth);
    expect(body.heads.hips[2]).toBeGreaterThan(back - depth);
    expect(body.heads.hips[2]).toBeLessThan(back - CHAIR_LEG);
  });

  it('keeps the leg corrective shapes and the standing pose of the sheet', () => {
    expect(facts.targets.every((target) => target.kept)).toBe(true);
    expect(mesh.correctives).toHaveLength(4);
    expect(sheetWeights).toEqual([1, 1, 1, 1]);
    const standing = body.standing;
    if (!standing) {
      throw new Error('The rabbit has no standing pose.');
    }
    // The body moves up by its seated drop and back over the origin.
    expect(standing.lift[1]).toBeGreaterThan(0);
    expect(standing.lift[2]).toBeCloseTo(-body.floor[2], 5);
    // Each thigh turns forward and down by more than 45° from the seat.
    const thigh = standing.turns.thigh_L;
    expect(2 * Math.acos(Math.min(1, Math.abs(thigh[3])))).toBeGreaterThan(Math.PI / 4);
    // The tail of one bone keeps the tail of its bind pose.
    expect(standing.tailTurns).toBeUndefined();
  });

  it('gives no standing pose to a body that keeps the stance of its role', async () => {
    const polar = withSeat(
      await readFile(
        join(import.meta.dirname, '..', 'lowpoly-studio/animals/polar-bear/out/polar-bear.glb'),
      ),
    );
    const polarSettings = ANIMALS.get('polar-bear');
    if (!polarSettings) {
      throw new Error('The polar bear has no settings.');
    }
    const polarBody = studioBody(polar, 'x.glb', polarSettings).body;
    expect(polarBody.standing).toBeNull();
    expect(unpackStudioMesh(polarBody.mesh).correctives).toHaveLength(2);
  });
});

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

/** The extras of the asset of a rig of `pnpm rig-mesh`, for {@link withExtras}. */
interface RigExtras {
  /** The head factor. */
  readonly headFactor?: number;
  /** The neck factor. */
  readonly neckFactor?: number;
  /** The move of the head center back to the head before the smoothing, in studio units. */
  readonly headShift?: readonly number[];
  /** The pose of the shape of a raised arm: the side, the turn, and the fade in degrees. */
  readonly raise?: {
    readonly side: string;
    readonly turn: readonly number[];
    readonly fade: readonly number[];
  };
  /** The seat of the rig. */
  readonly seat?: SeatExtras;
}

/** The parts of the JSON chunk of a GLB file that the tests change. */
interface GlbJson {
  /** The asset, with the extras of a rig. */
  asset: { extras?: RigExtras };
  /** The meshes, with the names of their morph targets and the targets of each primitive. */
  meshes: {
    extras?: { targetNames?: string[] };
    primitives: { targets?: Record<string, number>[] }[];
  }[];
}

/**
 * Writes a GLB file again with a change of its JSON chunk.
 *
 * @param bytes The GLB file.
 * @param edit Changes the JSON chunk.
 * @returns The new file.
 */
function withJson(bytes: Uint8Array, edit: (json: GlbJson) => void): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  // SAFETY: the JSON chunk of a GLB file holds one JSON object with an asset and the meshes.
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson;
  edit(json);
  let text = JSON.stringify(json);
  text += ' '.repeat((4 - (text.length % 4)) % 4);
  const chunk = new TextEncoder().encode(text);
  const bin = bytes.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + chunk.length + bin.length);
  const head = new DataView(out.buffer);
  head.setUint32(0, 0x46546c67, true);
  head.setUint32(4, 2, true);
  head.setUint32(8, out.length, true);
  head.setUint32(12, chunk.length, true);
  head.setUint32(16, 0x4e4f534a, true);
  out.set(chunk, 20);
  out.set(bin, 20 + chunk.length);
  return out;
}

/**
 * Writes a GLB file again with the facts of a rig of `pnpm rig-mesh` in the extras of its asset.
 *
 * @param bytes The GLB file.
 * @param extras The facts of the rig.
 * @returns The new file.
 */
function withExtras(bytes: Uint8Array, extras: RigExtras): Uint8Array {
  return withJson(bytes, (json) => {
    json.asset.extras = extras;
  });
}

/**
 * Writes a GLB file of the low-poly studio again with the seat of a rig of `pnpm rig-mesh` in the
 * extras of its asset: the box of its prop `bench` or `chair`, because the export reads the seat
 * only from the extras. A file with no such prop, such as the file of a standing body, stays.
 *
 * @param bytes The GLB file of the low-poly studio.
 * @returns The new file.
 */
function withSeat(bytes: Uint8Array): Uint8Array {
  const prop = inspectStudioGlb(bytes, null).props.find(
    (p) => p.name === 'bench' || p.name === 'chair',
  );
  if (!prop) {
    return bytes;
  }
  const { min, max } = prop.box;
  const seat = { prop: prop.name, top: max[1], front: max[2], back: min[2], halfWidth: max[0] };
  return withJson(bytes, (json) => {
    json.asset.extras = { ...json.asset.extras, seat };
  });
}

/**
 * Writes the GLB file of the studio bear again with a shape of a raised right arm: a copy of the
 * shape `arm_down_R`, first in the order of the morph targets, and its pose in the extras.
 *
 * @param bytes The GLB file of the studio bear.
 * @param raise The pose of the shape.
 * @returns The new file.
 */
function withRaise(bytes: Uint8Array, raise: NonNullable<RigExtras['raise']>): Uint8Array {
  return withJson(bytes, (json) => {
    json.asset.extras = { raise };
    for (const mesh of json.meshes) {
      if (mesh.extras?.targetNames) {
        mesh.extras.targetNames = ['arm_raise_R', 'arm_down_L', 'arm_down_R'];
        for (const primitive of mesh.primitives) {
          const [left, right] = primitive.targets ?? [];
          if (left && right) {
            primitive.targets = [right, left, right];
          }
        }
      }
    }
  });
}

describe('pnpm studio-body with a head that the rig grows (design 4.4)', async () => {
  const bytes = new Uint8Array(await readFile(join(import.meta.dirname, '..', SOURCE)));
  const settings = {
    landmark: 'shoulders',
    height: 1,
    seated: false,
    soloist: false,
    constant: 'STUDIO_BEAR',
    crease: 15,
  } as const;

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

  it('keeps the head height and the head center of the holds from the head before the factor', () => {
    const grown = withExtras(bytes, { headFactor: 1.5 });
    expect(headFactorOf(readGlb(bytes))).toBe(1);
    expect(headFactorOf(readGlb(grown))).toBe(1.5);
    // The head of the bear keeps its size, so the head before the factor is about 1.5 times
    // smaller. The vertices with a part of the head weight move back less.
    const plain = studioBody(bytes, SOURCE, settings).body;
    const shrunk = studioBody(grown, SOURCE, settings).body;
    expect(shrunk.headHeight).toBeLessThan(plain.headHeight / 1.4);
    expect(shrunk.headHeight).toBeGreaterThan(plain.headHeight / 1.6);
    expect(shrunk.headCenter[1]).toBeLessThan(plain.headCenter[1]);
    expect(shrunk.nose).toEqual(plain.nose);
  });

  it('sizes the pea eyes by the head that shows, after the factor (design 4.5)', () => {
    const grown = withExtras(bytes, { headFactor: 1.5 });
    const plain = studioBody(bytes, SOURCE, settings).body;
    const shrunk = studioBody(grown, SOURCE, settings).body;
    expect(shrunk.eyes.headHeight).toBe(plain.eyes.headHeight);
    expect(shrunk.eyes.headHeight).toBeGreaterThan(1.4 * shrunk.headHeight);
  });

  it('refuses a head factor that is not a positive number', () => {
    expect(() => headFactorOf(readGlb(withExtras(bytes, { headFactor: 0 })))).toThrow(/positive/);
  });

  it('moves the head center of the holds by the head shift of the rig', () => {
    expect(headShiftOf(readGlb(bytes)).length()).toBe(0);
    const plain = studioBody(bytes, SOURCE, settings).body;
    const shifted = studioBody(
      withExtras(bytes, { headShift: [0.01, 0.02, 0.03] }),
      SOURCE,
      settings,
    ).body;
    // The studio animal faces +z and the model faces -z. The center stays on the middle plane.
    expect(shifted.headCenter[0]).toBe(0);
    expect(shifted.headCenter[1] - plain.headCenter[1]).toBeCloseTo(0.02 * plain.scale, 5);
    expect(shifted.headCenter[2] - plain.headCenter[2]).toBeCloseTo(-0.03 * plain.scale, 5);
    expect(shifted.headHeight).toBe(plain.headHeight);
    expect(shifted.nose).toEqual(plain.nose);
  });

  it('refuses a head shift that is not three numbers', () => {
    expect(() => headShiftOf(readGlb(withExtras(bytes, { headShift: [0, 1] })))).toThrow(
      /three numbers/,
    );
  });

  it('reads the neck factor of the rig, 1 when the file has none', () => {
    expect(neckFactorOf(readGlb(bytes))).toBe(1);
    expect(neckFactorOf(readGlb(withExtras(bytes, { headFactor: 1.2, neckFactor: 0.65 })))).toBe(
      0.65,
    );
    expect(() => neckFactorOf(readGlb(withExtras(bytes, { neckFactor: -1 })))).toThrow(/positive/);
  });
});

describe('pnpm studio-body with the shape of a raised arm (design 4.4)', async () => {
  const bytes = new Uint8Array(await readFile(join(import.meta.dirname, '..', SOURCE)));
  const settings = {
    landmark: 'shoulders',
    height: 1,
    seated: false,
    soloist: false,
    constant: 'STUDIO_BEAR',
    crease: 15,
  } as const;
  const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 0.7);
  const raise = { side: 'R', turn: [turn.x, turn.y, turn.z, turn.w], fade: [10, 20] };

  it('keeps each shape by its name, with the shape of a raised arm after the arm-down shapes', () => {
    const plain = unpackStudioMesh(studioBody(bytes, SOURCE, settings).body.mesh).correctives;
    const raised = unpackStudioMesh(
      studioBody(withRaise(bytes, raise), SOURCE, settings).body.mesh,
    ).correctives;
    expect(plain).toHaveLength(2);
    expect(raised).toHaveLength(3);
    expect(raised[0]).toEqual(plain[0]);
    expect(raised[1]).toEqual(plain[1]);
    expect(raised[2]).toEqual(plain[1]);
    expect(keptCorrectives({ ...settings, soloist: true }, ['arm_raise_R'])).toEqual([
      'arm_down_L',
      'arm_down_R',
      'arm_raise_R',
      'legs_straight_L',
      'legs_straight_R',
    ]);
  });

  it('turns the pose of the raised arm into the model axes, with the fade in radians', () => {
    expect(studioBody(bytes, SOURCE, settings).body.raises).toBeUndefined();
    const body = studioBody(withRaise(bytes, raise), SOURCE, settings).body;
    // The studio animal faces +z and the model faces -z: a half circle around y.
    const model = new Quaternion(-turn.x, turn.y, -turn.z, turn.w);
    const [pose] = body.raises ?? [];
    expect(body.raises).toHaveLength(1);
    expect(pose?.side).toBe('R');
    expect(new Quaternion(...(pose?.turn ?? [0, 0, 0, 1])).angleTo(model)).toBeLessThan(1e-5);
    expect(pose?.fade[0]).toBeCloseTo((10 * Math.PI) / 180, 6);
    expect(pose?.fade[1]).toBeCloseTo((20 * Math.PI) / 180, 6);
  });

  it('refuses a pose of a raised arm with a wrong side, turn, or fade, or with no shape', () => {
    const glb = (changed: Partial<typeof raise>): Glb =>
      readGlb(withRaise(bytes, { ...raise, ...changed }));
    expect(() => raisesOf(glb({ side: 'X' }))).toThrow(/not L or R/);
    expect(() => raisesOf(glb({ turn: [0, 0, 0, 2] }))).toThrow(/unit quaternion/);
    expect(() => raisesOf(glb({ turn: [0, 0, 1] }))).toThrow(/unit quaternion/);
    expect(() => raisesOf(glb({ fade: [20, 10] }))).toThrow(/do not fade/);
    expect(() => raisesOf(glb({ fade: [10] }))).toThrow(/do not fade/);
    expect(() => raisesOf(glb({ side: 'L' }))).toThrow(/no morph target arm_raise_L/);
  });
});

describe('pnpm studio-body with a seat height in the settings (design 4.4)', async () => {
  const settings = ANIMALS.get('rabbit');
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
