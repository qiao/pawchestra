import { describe, expect, it } from 'vitest';

import { MathUtils, Vector3 } from 'three';
import { chord, note, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestFile } from '../midi/test-smf.ts';
import type { Vec3 } from '../models/tuples.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { ARM_REACH } from './ik.ts';
import { poseAt } from './pose-at.ts';
import {
  armLengthErrors,
  instrumentTurn,
  posedAt,
  posedPiecePoint,
  posedPoint,
  turnOf,
} from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { NOT_STARTED, PLAYING, allAudible, firstPlayers, sceneOf } from './test-scene.ts';
import type { ScenePlayer } from './test-scene.ts';
import type { Transport } from './types.ts';
import { WIND_BODY, WIND_HOLDS } from './winds.ts';
import type { WindInstrument } from './winds.ts';

/** The GM program of each wind instrument. */
const PROGRAMS = {
  flute: 73,
  oboe: 68,
  clarinet: 71,
  bassoon: 70,
  horn: 60,
  trumpet: 56,
  trombone: 57,
  tuba: 58,
} as const satisfies Readonly<Record<WindInstrument, number>>;

/** The keys of each section: a scale in its range, with leaps, then a chord. */
const KEYS = {
  flute: [72, 74, 76, 79, 84, 88, 91, 77],
  oboe: [62, 64, 67, 69, 72, 76, 79, 65],
  clarinet: [52, 55, 60, 64, 67, 72, 76, 58],
  bassoon: [36, 41, 43, 48, 53, 55, 60, 46],
  horn: [43, 48, 53, 55, 60, 65, 67, 50],
  trumpet: [55, 58, 60, 62, 65, 70, 72, 63],
  trombone: [40, 46, 52, 53, 57, 58, 62, 45],
  tuba: [29, 34, 36, 41, 43, 46, 48, 31],
} as const satisfies Readonly<Record<WindInstrument, readonly number[]>>;

const INSTRUMENTS = Object.keys(PROGRAMS).filter((id): id is WindInstrument => id in PROGRAMS);

/**
 * Each wind section on its own channel: eighth notes at 120 BPM, a rest, then a chord of two
 * notes. The tuba has one player (3.8), so that player gets both notes of the chord.
 */
const FILE: TestFile = {
  tracks: [
    [tempo(0, 120), timeSignature(0, 4, 4)],
    ...INSTRUMENTS.map((id, channel) =>
      track(
        [programChange(0, channel, PROGRAMS[id])],
        ...KEYS[id].map((key, i) => note(i * 240, channel, key, i * 240 + 220)),
        chord(2880, channel, [KEYS[id][0], KEYS[id][1]], 3840),
      ),
    ),
  ],
};

/** A wind player of a test scene, with its model. */
type WindPlayer = ScenePlayer<WindInstrument>;

/** The distances of the two palms from their grips, and of the mouth from the mouthpiece. */
interface GripGaps {
  readonly palmL: number;
  readonly palmR: number;
  readonly mouth: number;
}

function gaps(posed: PosedSkeleton): GripGaps {
  const { grips } = posed.model.instrument;
  const { body } = posed.model;
  if (!grips.palmL || !grips.palmR || !grips.mouth) {
    throw new Error('A wind instrument has grips of the palms and the mouth.');
  }
  const gap = (a: Vec3, b: Vec3): number => new Vector3(...a).distanceTo(new Vector3(...b));
  return {
    palmL: gap(posedPoint(posed, 'handL', body.palmL), posedPiecePoint(posed, grips.palmL)),
    palmR: gap(posedPoint(posed, 'handR', body.palmR), posedPiecePoint(posed, grips.palmR)),
    mouth: gap(posedPoint(posed, 'head', body.mouth), posedPiecePoint(posed, grips.mouth)),
  };
}

/**
 * The angle of the turn of the trumpet in the rest pose: 56°, down by 50° and to the side
 * (design 5.3).
 */
const TRUMPET_REST = 2 * Math.acos(Math.abs(WIND_HOLDS.trumpet.rest[3]));

describe('poseWind (design 5.3, 4.7)', () => {
  const scene = sceneOf(FILE);
  const players = firstPlayers(scene, INSTRUMENTS);
  const times = Array.from({ length: 80 }, (_, i) => 0.02 + i * 0.05);

  it('keeps the mouth on the mouthpiece while the player plays, also during a look', () => {
    for (const player of players) {
      for (const wall of [10, 23.7, 41.3, 77.9]) {
        for (const t of times) {
          const { mouth } = gaps(posedAt(scene, player, t, wall));
          expect(mouth, `${player.instrument} at ${t}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('puts the palms on their grips while the player plays and in the rest pose', () => {
    for (const player of players) {
      for (const [t, transport] of [
        ...times.map((time) => [time, PLAYING] as const),
        [1, NOT_STARTED] as const,
      ]) {
        const g = gaps(posedAt(scene, player, t, 10, transport));
        expect(g.palmL, `${player.instrument} at ${t}`).toBeLessThan(1e-4);
        expect(g.palmR, `${player.instrument} at ${t}`).toBeLessThan(1e-4);
      }
    }
  });

  it('keeps the bones of the arms at their bind lengths', () => {
    for (const player of players) {
      for (const error of armLengthErrors(posedAt(scene, player, 1.3))) {
        expect(error, player.instrument).toBeLessThan(5e-7);
      }
    }
  });

  it('reaches each palm grip with at most 97% of the arm length (design 5.3)', () => {
    for (const player of players) {
      for (const [t, transport] of [
        ...times.map((time) => [time, PLAYING] as const),
        [1, NOT_STARTED] as const,
      ]) {
        const posed = posedAt(scene, player, t, 10, transport);
        const bind = posed.model.skeleton.positions;
        const at = (bone: BoneName): Vector3 =>
          posed.frames[boneIndex(bone)]?.position ?? new Vector3();
        const bindAt = (bone: BoneName): Vector3 =>
          new Vector3(...(bind[boneIndex(bone)] ?? [0, 0, 0]));
        for (const side of ['L', 'R'] as const) {
          const [shoulder, elbow, wrist] = [
            `upperArm${side}`,
            `forearm${side}`,
            `hand${side}`,
          ] as const;
          const arm =
            bindAt(elbow).distanceTo(bindAt(shoulder)) + bindAt(wrist).distanceTo(bindAt(elbow));
          expect(
            at(wrist).distanceTo(at(shoulder)) / arm,
            `${player.instrument} ${side} at ${t}`,
          ).toBeLessThanOrEqual(ARM_REACH + 1e-9);
        }
      }
    }
  });

  it('lifts the head off the mouthpiece and lowers the trumpet in the rest pose', () => {
    for (const player of players) {
      const { mouth } = gaps(posedAt(scene, player, 1, 0, NOT_STARTED));
      expect(mouth, player.instrument).toBeGreaterThan(0.03);
    }
    const trumpet = players.find((p) => p.instrument === 'trumpet');
    const turn = (transport: Transport, wall: number): number =>
      instrumentTurn(scene, trumpet?.index ?? -1, wall, transport);
    expect(turn(NOT_STARTED, 0)).toBeCloseTo(TRUMPET_REST, 5);
    expect(turn(PLAYING, 10)).toBeCloseTo(0, 5);
    // 3 s after a pause, the instruments go down with the seeded lowering (design 5.2).
    const lower = scene.plan.players[trumpet?.index ?? -1]?.motion.lower;
    if (!lower) {
      throw new Error('The test file has a trumpet.');
    }
    const start = 23 + lower.delaySec;
    const pause: Transport = {
      playing: false,
      changedAtWall: 20,
      before: { ...PLAYING, changedAtWall: -100 },
      startSec: 0,
      seekStart: false,
      endedAtSong: false,
      holdSec: 3,
      leadSec: Number.POSITIVE_INFINITY,
    };
    expect(turn(pause, start)).toBeCloseTo(0, 5);
    const half = turn(pause, start + lower.durationSec / 2);
    expect(half).toBeGreaterThan(0.2 * TRUMPET_REST);
    expect(half).toBeLessThan(0.8 * TRUMPET_REST);
    expect(turn(pause, start + lower.durationSec)).toBeCloseTo(TRUMPET_REST, 5);
  });

  it('lowers the instruments of a silent seat with the seeded lowering (design 5.5)', () => {
    const trumpet = players.find((p) => p.instrument === 'trumpet');
    const lower = scene.plan.players[trumpet?.index ?? -1]?.motion.lower;
    if (!lower) {
      throw new Error('The test file has a trumpet.');
    }
    const turn = (wall: number): number =>
      instrumentTurn(scene, trumpet?.index ?? -1, wall, PLAYING, 20);
    const start = 20 + lower.delaySec;
    expect(turn(start)).toBeCloseTo(0, 5);
    expect(turn(start + lower.durationSec / 2)).toBeGreaterThan(0.2 * TRUMPET_REST);
    expect(turn(start + lower.durationSec)).toBeCloseTo(TRUMPET_REST, 5);
  });

  it('moves the trombone slide with the pitch, within the reach of the arm', () => {
    const trombone = players.find((p) => p.instrument === 'trombone');
    const plan = scene.plan.players[trombone?.index ?? -1];
    const rig = plan?.note.family === 'brass' ? plan.note.rig : null;
    if (!trombone || !plan || !rig) {
      throw new Error('The test file has a trombone.');
    }
    // The arm reaches the first part of the travel of 0.55 m: 0.165 m for the panda mesh, with
    // the slide of its hold turned toward the right shoulder (design 5.3).
    expect(rig.slideReach).toBeGreaterThan(0.15);
    expect(rig.slideReach).toBeLessThan(0.55);
    const slideAt = (t: number): Vector3 =>
      new Vector3(
        ...(poseAt(scene.plan, t + plan.timeOffset, 10, PLAYING, allAudible(scene.score)).players[
          trombone.index
        ]?.slideOffset ?? [0, 0, 0]),
      );
    const axis = new Vector3(...rig.slideAxis);
    // E2 7, B♭2 1, E3 2, F3 1, A3 2, B♭3 1, D4 1, A2 2: the positions of the keys.
    const positions = [7, 1, 2, 1, 2, 1, 1, 2];
    for (const [i, position] of positions.entries()) {
      const offset = slideAt(i * 0.25 + 0.15);
      const along = offset.dot(axis);
      expect(along, `note ${i}`).toBeCloseTo(((position - 1) / 6) * rig.slideReach, 6);
      expect(offset.length(), `note ${i}`).toBeCloseTo(Math.abs(along), 6);
    }
    // The chord ends with B♭2 in the first position.
    expect(slideAt(3.2).dot(axis)).toBeCloseTo(0, 6);
    // In the rest pose, the slide is closed.
    const rest = poseAt(scene.plan, 0.2, 0, NOT_STARTED, allAudible(scene.score)).players[
      trombone.index
    ];
    expect(new Vector3(...(rest?.slideOffset ?? [1, 0, 0])).length()).toBe(0);
  });

  it('closes the fingers for the pitch, and shows the highest note of a chord', () => {
    const curl = (player: WindPlayer, bone: BoneName, t: number): number => {
      const offset = scene.plan.players[player.index]?.timeOffset ?? 0;
      const pose = poseAt(scene.plan, t + offset, 10, PLAYING, allAudible(scene.score)).players[
        player.index
      ];
      return turnOf(pose?.rotations ?? new Float32Array(0), boneIndex(bone));
    };
    for (const player of players) {
      const bones = player.instrument === 'trombone' ? [] : (['fingersL', 'fingersR'] as const);
      const fingerings = new Set<string>();
      for (const [i] of KEYS[player.instrument].entries()) {
        fingerings.add(bones.map((b) => curl(player, b, i * 0.25 + 0.15).toFixed(4)).join(' '));
      }
      if (bones.length > 0) {
        expect(fingerings.size, player.instrument).toBeGreaterThan(2);
      }
      // A chord of the first and the second key shows the second key, the higher one.
      for (const bone of bones) {
        expect(curl(player, bone, 3.2), `${player.instrument} ${bone}`).toBeCloseTo(
          curl(player, bone, 0.25 + 0.15),
          6,
        );
      }
    }
    // The tuba player has both notes of the chord: B♭1 with no valve, and F1 with two.
    const tuba = players.find((p) => p.instrument === 'tuba');
    const cast = scene.layout.players[tuba?.index ?? -1]?.cast;
    const chordNotes = scene.score.notes.filter(
      (n) => n.seatIndex === cast?.seatIndex && n.player === cast.player && n.startSec === 3,
    );
    expect(chordNotes.map((n) => n.pitch).toSorted((a, b) => a - b)).toEqual([29, 34]);
    if (tuba) {
      expect(curl(tuba, 'fingersR', 3.2)).toBeCloseTo(WIND_BODY.curlOpen, 6);
    }
  });

  it('curls a closed finger 50° (design 5.3)', () => {
    const flute = players.find((p) => p.instrument === 'flute');
    if (!flute) {
      throw new Error('The test file has a flute.');
    }
    const offset = scene.plan.players[flute.index]?.timeOffset ?? 0;
    // The first note of the flute is C5. A C closes the holes of both hands.
    const pose = poseAt(scene.plan, 0.15 + offset, 10, PLAYING, allAudible(scene.score)).players[
      flute.index
    ];
    for (const bone of ['fingersL', 'fingersR'] as const) {
      const curl = turnOf(pose?.rotations ?? new Float32Array(0), boneIndex(bone));
      expect(Math.abs(curl - 50 * MathUtils.DEG2RAD), bone).toBeLessThan(5 * MathUtils.DEG2RAD);
    }
  });

  it('leans back to breathe in before a phrase', () => {
    for (const player of players) {
      const offset = scene.plan.players[player.index]?.timeOffset ?? 0;
      const chestZ = (t: number): number =>
        posedAt(scene, player, t + offset).frames[boneIndex('chest')]?.position.z ?? 0;
      // The second phrase starts at 2.88 s, after a rest of 0.98 s.
      expect(chestZ(2.88) - chestZ(2.4), player.instrument).toBeGreaterThan(0.001);
    }
  });
});
