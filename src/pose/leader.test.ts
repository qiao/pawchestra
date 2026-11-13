import { describe, expect, it } from 'vitest';

import { Quaternion } from 'three';
import { note, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import {
  stringQuartetFile,
  stringSextetFile,
  violinPianoDuoFile,
  windQuintetFile,
} from '../models/test-chamber.ts';
import { pianoSoloFile } from '../score/test-audit-files.ts';
import { LEADER_NOD, countInAt } from './count-in.ts';
import { boneRotation } from './frames.ts';
import { headOf, lookAngles } from './plan.ts';
import type { PosePlan } from './plan.ts';
import { createScenePose, playerWeight, poseAt } from './pose-at.ts';
import { NOT_STARTED, allAudible, sceneOf } from './test-scene.ts';
import type { TestScene } from './test-scene.ts';
import type { AnimalPose, Transport } from './types.ts';

const QUARTET = sceneOf(stringQuartetFile());
const DUO = sceneOf(violinPianoDuoFile());
const SOLO = sceneOf(pianoSoloFile());

/** Gives the instrument and the seat of the leader of a scene, or `null`. */
function leaderName(scene: TestScene): string | null {
  const place = scene.plan.leader === null ? null : scene.layout.players[scene.plan.leader];
  return place ? `${place.cast.instrument} ${place.cast.seatIndex}` : null;
}

/** Gives the model of a player of a scene. */
function modelOf(scene: TestScene, index: number) {
  const place = scene.layout.players[index];
  if (!place) {
    throw new Error(`No player ${index}.`);
  }
  const { species, instrument, kettles, support } = place.cast;
  return { place, model: scene.models.get(species, instrument, kettles, support) };
}

/** A transport that played from the song start at the wall time 0. */
const FROM_START: Transport = {
  playing: true,
  changedAtWall: 0,
  before: null,
  startSec: 0,
  seekStart: false,
  holdSec: 3,
  leadSec: Infinity,
};

/**
 * Gives the turn of a bone of the leader from its turn with no nod: the pose of the same plan with
 * no leader.
 *
 * @param scene The scene.
 * @param bone The bone.
 * @param songTime The song time. The wall time runs from the play at the start of the count-in.
 * @param transport The transport.
 * @returns The angle of the turn, in radians, with the sign of a turn around x.
 */
function nodTurn(
  scene: TestScene,
  bone: BoneName,
  songTime: number,
  transport = FROM_START,
): number {
  const leader = scene.plan.leader ?? -1;
  const count = countInAt(scene.plan.beats, 0);
  const wall = songTime + count.lengthSec;
  const audible = allAudible(scene.score);
  const rotation = (plan: PosePlan): Quaternion => {
    const pose: AnimalPose | undefined = poseAt(plan, songTime, wall, transport, audible).players[
      leader
    ];
    return boneRotation(pose?.rotations ?? new Float32Array(0), boneIndex(bone));
  };
  const turn = rotation(scene.plan).multiply(rotation({ ...scene.plan, leader: null }).invert());
  return 2 * Math.atan2(turn.x, turn.w);
}

describe('a chamber group in the pose (design 4.2, 5.4)', () => {
  it('has no conductor, and a leader: the first violin, the pianist, or the flute', () => {
    expect(QUARTET.plan.conductor).toBeNull();
    expect(createScenePose(QUARTET.plan).conductor).toBeNull();
    expect(poseAt(QUARTET.plan, 1, 1, FROM_START, []).conductor).toBeNull();
    expect(leaderName(QUARTET)).toBe('violin 0');
    expect(leaderName(DUO)).toBe('violin 0');
    expect(leaderName(SOLO)).toBe('piano 0');
    expect(leaderName(sceneOf(windQuintetFile()))).toBe('flute 0');
    const sextet = sceneOf(stringSextetFile());
    expect(sextet.plan.conductor).not.toBeNull();
    expect(sextet.plan.leader).toBeNull();
  });

  it('turns the looks of the players to the leader, and of the leader to the others', () => {
    const leader = QUARTET.plan.leader ?? -1;
    const lead = modelOf(QUARTET, leader);
    const leaderHead = headOf(lead.model, lead.place);
    const heads = QUARTET.layout.players.map((_, i) => {
      const { model, place } = modelOf(QUARTET, i);
      return headOf(model, place);
    });
    const others = heads.filter((_, i) => i !== leader);
    const middle = [0, 1, 2].map(
      (k) => others.reduce((sum, h) => sum + (h[k] ?? 0), 0) / others.length,
    );
    for (const [i, plan] of QUARTET.plan.players.entries()) {
      const { model, place } = modelOf(QUARTET, i);
      const target = i === leader ? [middle[0] ?? 0, middle[1] ?? 0, middle[2] ?? 0] : leaderHead;
      const [yaw, pitch] = lookAngles(model.skeleton, place.position, place.facing, [
        target[0] ?? 0,
        target[1] ?? 0,
        target[2] ?? 0,
      ]);
      expect(plan.lookYaw, `player ${i}`).toBeCloseTo(yaw, 12);
      expect(plan.lookPitch, `player ${i}`).toBeCloseTo(pitch, 12);
    }
    // The cello at the right end turns its head far, to the first violin at the left end.
    expect(Math.abs(QUARTET.plan.players[3]?.lookYaw ?? 0)).toBeGreaterThan(0.3);
    // A pianist alone looks ahead, to the audience.
    expect(SOLO.plan.players[0]?.lookYaw).toBeCloseTo(0, 9);
    expect(SOLO.plan.players[0]?.lookPitch).toBeCloseTo(0, 9);
  });

  it('breathes in on the preparatory beat and nods on the downbeat, with the upper body', () => {
    const count = countInAt(QUARTET.plan.beats, 0);
    const leader = QUARTET.plan.players[QUARTET.plan.leader ?? -1];
    if (!leader) {
      throw new Error('The quartet has a leader.');
    }
    // The rest rules of 5.2 still hold: the instruments are down before the first play, and up
    // at the downbeat.
    expect(playerWeight(leader, NOT_STARTED, undefined, 5, 0)).toBe(0);
    const weight = playerWeight(leader, FROM_START, undefined, count.lengthSec, 0);
    expect(weight).toBeGreaterThan(0.9);
    // A forward lean is a negative turn around x.
    expect(nodTurn(QUARTET, 'spine', 0)).toBeCloseTo(-LEADER_NOD.nod * weight, 2);
    expect(nodTurn(QUARTET, 'spine', -count.beatSec / 2)).toBeGreaterThan(0.6 * LEADER_NOD.breath);
    // A violinist holds the violin under the chin, so its head does not nod.
    expect(nodTurn(QUARTET, 'head', 0)).toBeCloseTo(0, 9);
    // No nod in the ready pause before the preparatory beat, and none after the settle.
    expect(nodTurn(QUARTET, 'spine', -count.beatSec - 0.3)).toBeCloseTo(0, 9);
    expect(nodTurn(QUARTET, 'spine', LEADER_NOD.settleSec + 0.1)).toBeCloseTo(0, 9);
  });

  it('nods the head of a pianist with the upper body', () => {
    // The neck and the head share the nod of the head (0.4 and 0.6), as a look (design 5.1).
    expect(nodTurn(SOLO, 'spine', 0)).toBeLessThan(-0.5 * LEADER_NOD.nod);
    expect(nodTurn(SOLO, 'head', 0)).toBeLessThan(-0.25 * LEADER_NOD.nod);
  });

  it('lifts and drops the head of a cellist, with no lean, so it keeps off the neck', () => {
    const cello = sceneOf({
      tracks: [
        [tempo(0, 120), timeSignature(0, 4, 4)],
        track([programChange(0, 0, 42)], note(0, 0, 48, 1900)),
      ],
    });
    const beat = countInAt(cello.plan.beats, 0).beatSec;
    expect(leaderName(cello)).toBe('cello 0');
    expect(nodTurn(cello, 'spine', 0)).toBeCloseTo(0, 9);
    expect(nodTurn(cello, 'spine', -beat / 2)).toBeCloseTo(0, 9);
    // A turn up is a positive turn around x.
    expect(nodTurn(cello, 'head', -beat / 2)).toBeGreaterThan(0.3 * LEADER_NOD.breath);
    expect(nodTurn(cello, 'head', 0)).toBeCloseTo(0, 9);
    expect(nodTurn(cello, 'head', 0.2)).toBeCloseTo(0, 9);
  });

  it('gives the nod only to the leader, and no nod before the first play', () => {
    const count = countInAt(DUO.plan.beats, 0);
    const audible = allAudible(DUO.score);
    const pianist = DUO.layout.players.findIndex((p) => p.cast.instrument === 'piano');
    const withNod = poseAt(DUO.plan, 0, count.lengthSec, FROM_START, audible).players[pianist];
    const without = poseAt({ ...DUO.plan, leader: null }, 0, count.lengthSec, FROM_START, audible)
      .players[pianist];
    expect(withNod?.rotations).toEqual(without?.rotations);
    expect(nodTurn(DUO, 'spine', 0, NOT_STARTED)).toBeCloseTo(0, 9);
  });
});
