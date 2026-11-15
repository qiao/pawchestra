import { describe, expect, it } from 'vitest';

import { Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from './colors.ts';
import { IDENTITY } from './tuples.ts';
import { seated } from './body-frame.ts';
import type { MeshData, Transform } from './mesh.ts';
import {
  CHAIR_BACK_CLEARANCE,
  INSTRUMENT_SUPPORTS,
  buildPlayer,
  chairForward,
  stanceOn,
  supportOf,
} from './player.ts';
import type { PlayerModel } from './player.ts';
import { chairBack } from './props.ts';
import { SPECIES, SPECIES_IDS } from './species.ts';
import { INSTRUMENT_IDS } from './instruments/catalog.ts';
import { boneIndex } from './rig.ts';
import type { BoneName } from './rig.ts';
import type { Vec3 } from './tuples.ts';
import { placePoint } from './instruments/hold.ts';
import { INSTRUMENT_SCALE, VIOLIN } from './instruments/strings.ts';

/** Measures the extent of the vertices of one bone along a unit direction. */
function extentAlong(
  positions: Float32Array,
  bones: Uint8Array,
  bone: number,
  axis: Vector3,
): number {
  let min = Infinity;
  let max = -Infinity;
  for (let v = 0; v < bones.length; v++) {
    if (bones[v] !== bone) {
      continue;
    }
    const p = new Vector3(
      positions[v * 3] ?? 0,
      positions[v * 3 + 1] ?? 0,
      positions[v * 3 + 2] ?? 0,
    );
    min = Math.min(min, p.dot(axis));
    max = Math.max(max, p.dot(axis));
  }
  return max - min;
}

describe('buildPlayer', () => {
  // The red fox holds the violin of the app. The rabbit holds a smaller violin (design 4.6).
  const player = buildPlayer('fox-red', 'violin');
  const placeOf = (bone: 'instrument' | 'bow'): Transform =>
    player.pieces.find((p) => p.piece.bone === bone)?.at ?? {
      position: [NaN, NaN, NaN],
      rotation: IDENTITY,
      scale: [1, 1, 1],
    };
  const violinRotation = new Quaternion(...placeOf('instrument').rotation);
  const violinAxis = new Vector3(1, 0, 0).applyQuaternion(violinRotation);
  const violinTop = new Vector3(0, 1, 0).applyQuaternion(violinRotation);
  const bowAxis = new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...placeOf('bow').rotation));
  const contactTarget = player.instrument.targets.find((t) => t.kind === 'bow-contact');
  const bowContact = placePoint(player.pieces, {
    bone: 'instrument',
    at: contactTarget?.from ?? [NaN, NaN, NaN],
  });

  it('hangs the violin on the chest and puts its bone at the tail end (design 4.7)', () => {
    const { parents, positions } = player.skeleton;
    expect(parents[boneIndex('instrument')]).toBe(boneIndex('chest'));
    const tail = positions[boneIndex('instrument')] ?? [0, 0, 0];
    expect(new Vector3(...bowContact).distanceTo(new Vector3(...tail))).toBeCloseTo(
      Math.hypot(VIOLIN.bowContact, VIOLIN.stringHeight) * INSTRUMENT_SCALE,
      3,
    );
  });

  it('holds the violin to the left, with the strings up (design 4.6)', () => {
    expect(violinAxis.x).toBeLessThan(-0.5);
    expect(violinTop.y).toBeGreaterThan(0);
    expect(violinAxis.dot(violinTop)).toBeCloseTo(0, 9);
  });

  it('scales the violin and the bow of a species by its violin scale (design 4.6)', () => {
    const rabbit = buildPlayer('rabbit', 'violin');
    const scale = SPECIES.rabbit.violinScale ?? 1;
    const pieceAxis = (bone: 'instrument' | 'bow'): Vector3 =>
      new Vector3(1, 0, 0).applyQuaternion(
        new Quaternion(
          ...(rabbit.pieces.find((p) => p.piece.bone === bone)?.at.rotation ?? IDENTITY),
        ),
      );
    const { positions, bones } = rabbit.mesh;
    const violin = extentAlong(positions, bones, boneIndex('instrument'), pieceAxis('instrument'));
    const bow = extentAlong(positions, bones, boneIndex('bow'), pieceAxis('bow'));
    expect(scale).toBeLessThan(1);
    expect(
      violin /
        extentAlong(player.mesh.positions, player.mesh.bones, boneIndex('instrument'), violinAxis),
    ).toBeCloseTo(scale, 2);
    expect(
      bow / extentAlong(player.mesh.positions, player.mesh.bones, boneIndex('bow'), bowAxis),
    ).toBeCloseTo(scale, 2);
  });

  it('makes the violin 0.51 m long and the bow 0.57 m long (design 4.6)', () => {
    const { positions, bones } = player.mesh;
    const violin = extentAlong(positions, bones, boneIndex('instrument'), violinAxis);
    expect(violin).toBeGreaterThan(0.5);
    expect(violin).toBeLessThan(0.52);
    const bow = extentAlong(positions, bones, boneIndex('bow'), bowAxis);
    expect(bow).toBeCloseTo(0.57, 2);
  });

  it('shows the strings as a thin dark strip (design 4.5, review of step 3)', () => {
    const { positions, colors } = player.mesh;
    const across = new Vector3().crossVectors(violinTop, violinAxis);
    const strings: Vec3[] = [];
    for (let v = 0; v < colors.length / 3; v++) {
      const color = [colors[v * 3], colors[v * 3 + 1], colors[v * 3 + 2]];
      if (color.every((c, i) => c === Math.fround(INSTRUMENT_COLORS.strings[i] ?? -1))) {
        strings.push([positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0]);
      }
    }
    expect(strings.length).toBeGreaterThan(0);
    const widths = strings.map((p) => across.dot(new Vector3(...p)));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(
      0.008 * INSTRUMENT_SCALE + 1e-6,
    );
    // The strings are darker than the bow hair.
    expect(Math.max(...INSTRUMENT_COLORS.strings)).toBeLessThan(
      Math.min(...INSTRUMENT_COLORS.bowHair),
    );
  });

  it('puts the bow in the right hand in the bind pose', () => {
    const grip = placeOf('bow').position;
    const hand = player.skeleton.positions[boneIndex('handR')] ?? [0, 0, 0];
    expect(new Vector3(...grip).distanceTo(new Vector3(...hand))).toBeLessThan(0.1);
    expect(player.skeleton.parents[boneIndex('bow')]).toBe(boneIndex('handR'));
  });
});

describe('buildPlayer with each instrument', () => {
  it('builds a standing soloist with the instrument at the mouth or the chin (design 4.5)', () => {
    for (const id of [
      'violin',
      'viola',
      'flute',
      'oboe',
      'clarinet',
      'horn',
      'trumpet',
      'trombone',
    ] as const) {
      expect(supportOf(id, true), id).toBe('stand');
      expect(supportOf(id, false), id).toBe(INSTRUMENT_SUPPORTS[id]);
      const sitting = buildPlayer('fox-tan', id);
      const standing = buildPlayer('fox-tan', id, 4, 'stand');
      expect(standing.support, id).toBe('stand');
      const y = (model: PlayerModel, bone: BoneName): number =>
        model.skeleton.positions[boneIndex(bone)]?.[1] ?? NaN;
      // The standing body has its torso base 0.77 H above the floor, and the instrument moves
      // with the head.
      const { headHeight } = SPECIES['fox-tan'];
      expect(y(standing, 'hips'), id).toBeCloseTo((0.55 + 0.15) * headHeight, 9);
      expect(y(standing, 'instrument') - y(sitting, 'instrument'), id).toBeCloseTo(
        y(standing, 'head') - y(sitting, 'head'),
        2,
      );
    }
    for (const id of ['cello', 'contrabass', 'harp', 'piano', 'bassoon', 'tuba'] as const) {
      expect(supportOf(id, true), id).toBe(INSTRUMENT_SUPPORTS[id]);
    }
  });

  it('gives each support of 5.1 a stance at the heights of its seat', () => {
    const cat = SPECIES.cat;
    const legs = cat.seatHeight * cat.headHeight;
    expect(stanceOn('chair', cat)).toEqual(seated(legs, chairForward(cat)));
    expect(stanceOn('stool', cat)).toEqual(seated(legs));
    expect(stanceOn('bench', cat)).toEqual(seated(0.45));
    expect(stanceOn('stand', cat)).toEqual({ kind: 'standing' });
    expect(stanceOn('riser', cat)).toEqual({ kind: 'standing' });
  });

  it('puts the mouthpiece at the mouth and each piece on its bone', () => {
    for (const id of INSTRUMENT_IDS) {
      const player = buildPlayer('fox-tan', id);
      expect(player.support, id).toBe(INSTRUMENT_SUPPORTS[id]);
      expect(player.skeleton.parents[boneIndex('instrument')], id).toBe(
        boneIndex(player.instrument.parent),
      );
      const mouth = player.instrument.grips.mouth;
      if (mouth) {
        const at = new Vector3(...placePoint(player.pieces, mouth));
        expect(at.distanceTo(new Vector3(...player.body.mouth)), id).toBeLessThan(1e-9);
      }
      for (const { piece, at } of player.pieces) {
        expect(player.skeleton.positions[boneIndex(piece.bone)], id).toEqual(at.position);
      }
    }
  });

  it('puts the grips of the hand tools in the hanging hands', () => {
    for (const id of ['cymbals', 'small-percussion', 'timpani', 'snare-drum'] as const) {
      const player = buildPlayer('badger', id);
      for (const side of ['palmL', 'palmR'] as const) {
        const grip = player.instrument.grips[side];
        if (grip) {
          const at = new Vector3(...placePoint(player.pieces, grip));
          expect(at.distanceTo(new Vector3(...player.body[side])), id).toBeLessThan(
            0.07 * player.body.headHeight + 1e-9,
          );
        }
      }
    }
  });
});

describe('chairForward', () => {
  /**
   * Finds how far the body reaches behind the front of the chair back, at sample points.
   *
   * @param mesh The mesh of the player.
   * @param seatHeight The height of the seat of its chair, in meters.
   * @returns The largest reach, in meters. It is negative when the body is clear of the back.
   */
  function backOverlap(mesh: MeshData, seatHeight: number): number {
    const skip = new Set(
      (['tail1', 'tail2', 'instrument', 'bow'] as const).map((bone) => boneIndex(bone)),
    );
    const n = 8;
    let worst = -Infinity;
    const p = mesh.positions;
    for (let t = 0; t < mesh.bones.length / 3; t++) {
      if (skip.has(mesh.bones[t * 3] ?? 0)) {
        continue;
      }
      const corner = (k: number): Vec3 => [
        p[t * 9 + k * 3] ?? 0,
        p[t * 9 + k * 3 + 1] ?? 0,
        p[t * 9 + k * 3 + 2] ?? 0,
      ];
      const [a, b, c] = [corner(0), corner(1), corner(2)];
      for (let i = 0; i <= n; i++) {
        for (let j = 0; i + j <= n; j++) {
          const q = [0, 1, 2].map(
            (k) =>
              (a[k] ?? 0) + (((b[k] ?? 0) - (a[k] ?? 0)) * i + ((c[k] ?? 0) - (a[k] ?? 0)) * j) / n,
          );
          for (const part of chairBack(seatHeight)) {
            const [x = 0, y = 0, z = 0] = q;
            if (x >= part.min[0] && x <= part.max[0] && y >= part.min[1] && y <= part.max[1]) {
              worst = Math.max(worst, z - part.min[2]);
            }
          }
        }
      }
    }
    return worst;
  }

  it('keeps the body of each species in front of the chair back (design 4.5)', () => {
    // A body stands on each support, and the cast gives the bear only the stand of the
    // conductor (design 4.4).
    for (const id of SPECIES_IDS.filter((species) => !buildPlayer(species, 'violin').bodyRig)) {
      const { mesh, seat } = buildPlayer(id, 'violin');
      expect(backOverlap(mesh, seat?.seatHeight ?? NaN), id).toBeLessThanOrEqual(
        -CHAIR_BACK_CLEARANCE + 1e-6,
      );
    }
  });

  it('moves a floor instrument with the body', () => {
    const forward = chairForward(SPECIES.elephant);
    const cello = buildPlayer('elephant', 'cello');
    expect(cello.body.floor).toEqual([0, 0, -forward]);
    // The end pin stands 0.42 H + 0.44 m in front of the seat point of the body (design 4.6).
    const pin = cello.pieces[0]?.at.position[2] ?? NaN;
    const { headHeight } = SPECIES.elephant;
    expect(pin).toBeCloseTo(-forward - 0.42 * headHeight - 0.44, 9);
  });
});
