import { describe, expect, it } from 'vitest';

import { MathUtils } from 'three';
import { note, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestFile } from '../midi/test-smf.ts';
import type { Vec3 } from '../models/tuples.ts';
import { perf60File } from '../models/test-perf-60.ts';
import { CONDUCTOR } from '../models/cast.ts';
import { buildPlayer } from '../models/player.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { boneRotation } from './frames.ts';
import { createIdleState, idleAt } from './idle.ts';
import { gestureSize, noteLoudness } from './loudness.ts';
import { activityAt } from './passages.ts';
import {
  PLAYER_OFFSETS,
  headOf,
  lookAngles,
  prepareConductor,
  preparePlayer,
  seatSeedOf,
} from './plan.ts';
import { mixHash } from './random.ts';
import { beatSway, createScenePose, playerWeight, poseAt } from './pose-at.ts';
import { countInAt } from './count-in.ts';
import {
  CONDUCTOR_MOTION,
  LIFT_FIT_SEC,
  LOWER_MAX_SEC,
  REST_MOTION,
  REST_TIMES,
  liftScale,
  transportHeight,
} from './rest.ts';
import { patchedDemos } from '../../tools/patch-demos.ts';
import { scoreOf } from '../score/test-score.ts';
import type { PlayerPlan } from './plan.ts';
import { turnOf } from './test-kinematics.ts';
import {
  NOT_STARTED,
  PLAYING,
  allAudible,
  demoSceneOf,
  ofConductor,
  sceneOf,
} from './test-scene.ts';
import type { TestScene } from './test-scene.ts';
import type { AnimalPose, SeatAudibility, Transport } from './types.ts';

/** Four bars at 120 BPM in 4/4: a violin, a cello, and the timpani, each on its own track. */
const FILE: TestFile = {
  tracks: [
    [tempo(0, 120), timeSignature(0, 4, 4)],
    track(
      [programChange(0, 0, 40)],
      ...[0, 480, 960, 1440, 1920].map((t) => note(t, 0, 67 + t / 480)),
    ),
    track([programChange(0, 1, 42)], note(0, 1, 48, 1920), note(1920, 1, 43, 3840)),
    track([programChange(0, 2, 47)], note(960, 2, 45, 1920), note(1920, 2, 50, 7680)),
  ],
};

/** The bones of the legs and of the trunk. No layer of the pose moves them (design 4.7). */
const STILL_BONES = [
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'trunk1',
  'trunk2',
  'trunk3',
] as const satisfies readonly BoneName[];

function isIdentity(pose: AnimalPose, bone: number): boolean {
  const { x, y, z, w } = boneRotation(pose.rotations, bone);
  return x === 0 && y === 0 && z === 0 && w === 1;
}

describe('poseAt (design 5.1)', () => {
  const scene = sceneOf(FILE);
  const audible = allAudible(scene.score);
  // The timpani player shows the idle layer and the beat layer.
  const timpani = scene.layout.players.findIndex((p) => p.cast.instrument === 'timpani');

  it('gives one pose for each player and one for the conductor, with unit rotations', () => {
    const pose = poseAt(scene.plan, 1.2, 5, PLAYING, audible);
    expect(pose.players).toHaveLength(scene.layout.players.length);
    for (const animal of [...pose.players, ofConductor(pose.conductor)]) {
      expect(animal.rotations).toHaveLength(BONE_NAMES.length * 4);
      for (let b = 0; b < BONE_NAMES.length; b++) {
        expect(boneRotation(animal.rotations, b).length()).toBeCloseTo(1, 5);
      }
      expect(animal.slideOffset).toEqual([0, 0, 0]);
    }
  });

  it('gives the same poses for the same inputs, whatever came before', () => {
    const first = structuredClone(poseAt(scene.plan, 2.3, 7.1, PLAYING, audible));
    poseAt(scene.plan, 0.4, 1, NOT_STARTED, audible);
    const again = poseAt(scene.plan, 2.3, 7.1, PLAYING, audible);
    expect(again).toEqual(first);
  });

  it('gives each player of each motion family the same pose alone and in the scene', () => {
    // The frame path writes scratch objects in place. Each player must write them before it
    // reads them, so that no player and no frame changes the pose of another. The states seek
    // back and forth, and cover the rest pose, a lowering after a pause, a lift, a silent seat,
    // pizzicato, tremolo, and a cue of the conductor.
    const articulations: TestFile = {
      tracks: [
        [tempo(0, 120), timeSignature(0, 4, 4)],
        track([programChange(0, 0, 45)], ...[0, 480, 960, 7680].map((t) => note(t, 0, 67))),
        track([programChange(0, 1, 44)], note(0, 1, 60, 1920), note(7680, 1, 62, 9600)),
        // The flute rests for more than two bars, so the conductor cues it at 8 s.
        track([programChange(0, 2, 73)], note(0, 2, 72), note(7680, 2, 74, 8640)),
      ],
    };
    const pause: Transport = {
      playing: false,
      changedAtWall: 6,
      before: PLAYING,
      startSec: 0,
      seekStart: false,
      endedAtSong: false,
      holdSec: 3,
      leadSec: Number.POSITIVE_INFINITY,
    };
    const lift: Transport = { ...PLAYING, changedAtWall: 11.9 };
    const states = [
      { time: 1.3, wall: 4, transport: PLAYING, muted: false },
      { time: 0.2, wall: 0.5, transport: NOT_STARTED, muted: false },
      { time: 7.8, wall: 9, transport: PLAYING, muted: false },
      // 3.2 s after the pause, the instruments go down.
      { time: 2.1, wall: 9.2, transport: pause, muted: false },
      { time: 0.6, wall: 12.5, transport: lift, muted: false },
      { time: 7.9, wall: 4, transport: PLAYING, muted: true },
      { time: 1.3, wall: 4.2, transport: PLAYING, muted: true },
    ] as const;
    for (const all of [sceneOf(perf60File(), 1, 'one-per-part'), sceneOf(articulations)]) {
      for (const [k, { time, wall, transport, muted }] of states.entries()) {
        // The first seat went silent at the wall time 3.9 s.
        const audibility = allAudible(all.score).map((a, seat) =>
          muted && seat === 0 ? { audible: false, changedAtWall: 3.9, before: null } : a,
        );
        const together = structuredClone(poseAt(all.plan, time, wall, transport, audibility));
        // The players go in the opposite order, so that each one follows other players than in
        // the scene.
        for (const [i, player] of [...all.plan.players.entries()].toReversed()) {
          const plan = { ...all.plan, players: [player] };
          const alone = poseAt(plan, time, wall, transport, audibility);
          expect(alone.players[0], `state ${k}, player ${i}`).toEqual(together.players[i]);
        }
        const conductor = poseAt({ ...all.plan, players: [] }, time, wall, transport, audibility);
        expect(conductor.conductor, `state ${k}, conductor`).toEqual(together.conductor);
      }
    }
  });

  it('writes the poses into a buffer that the caller gives', () => {
    const buffer = createScenePose(scene.plan);
    const poses = poseAt(scene.plan, 2, 2, PLAYING, audible, buffer);
    expect(poses).toBe(buffer);
    expect(poses).toEqual(poseAt(scene.plan, 2, 2, PLAYING, audible));
  });

  it('keeps the legs and the trunk of each animal in the bind pose (design 4.7)', () => {
    for (const [time, wall, transport] of [
      [2.25, 0, PLAYING],
      [3.1, 3.7, PLAYING],
      [1, 12.2, NOT_STARTED],
    ] as const) {
      const poses = poseAt(scene.plan, time, wall, transport, audible);
      for (const pose of [...poses.players, ofConductor(poses.conductor)]) {
        for (const name of STILL_BONES) {
          expect(isIdentity(pose, boneIndex(name)), name).toBe(true);
        }
      }
    }
  });

  it('blinks and breathes with the wall clock, also before the first play', () => {
    const blinks = new Set<number>();
    const chests = new Set<number>();
    for (let wall = 0; wall < 8; wall += 0.01) {
      const pose = ofConductor(poseAt(scene.plan, 0, wall, NOT_STARTED, audible).conductor);
      blinks.add(pose.blink);
      chests.add(boneRotation(pose.rotations, boneIndex('chest')).x);
    }
    expect(Math.max(...blinks)).toBeGreaterThan(0.5);
    expect(chests.size).toBeGreaterThan(100);
  });

  it('turns the head up to the conductor during a look', () => {
    const player = scene.plan.players[timpani];
    if (!player) {
      throw new Error('The test file has the timpani.');
    }
    const idle = createIdleState();
    let wall = 0;
    for (; wall < 200; wall += 0.05) {
      idleAt(player.idle, wall, idle);
      if (idle.look > 0.99) {
        break;
      }
    }
    expect(idle.look).toBeGreaterThan(0.99);
    const head = (time: number): number => {
      const pose = poseAt(scene.plan, 0, time, NOT_STARTED, audible).players[timpani];
      // The x part of the rotation: the turn up around x.
      return pose ? boneRotation(pose.rotations, boneIndex('head')).x : 0;
    };
    expect(head(wall)).toBeGreaterThan(0.5 * Math.sin((0.6 * player.lookPitch) / 2));
    // 5 s later, the look is over, and the head turns back.
    idleAt(player.idle, wall + 5, idle);
    expect(idle.look).toBe(0);
    expect(head(wall + 5)).toBe(0);
  });

  it('twitches the ears by 12° (design 5.1)', () => {
    const player = scene.plan.players[timpani];
    if (!player) {
      throw new Error('The test file has the timpani.');
    }
    const idle = createIdleState();
    let wall = 0;
    for (; wall < 300; wall += 0.01) {
      idleAt(player.idle, wall, idle);
      if (idle.ear > 0.99) {
        break;
      }
    }
    expect(idle.ear).toBeGreaterThan(0.99);
    const pose = poseAt(scene.plan, 0, wall, NOT_STARTED, audible).players[timpani];
    for (const bone of ['earL', 'earR'] as const) {
      const turn = turnOf(pose?.rotations ?? new Float32Array(0), boneIndex(bone));
      expect(Math.abs(turn - 12 * MathUtils.DEG2RAD), bone).toBeLessThan(1.2 * MathUtils.DEG2RAD);
    }
  });

  it('sways the spine by 2° on a beat at a gesture size of 1 (design 5.1)', () => {
    const player = scene.plan.players[timpani];
    if (!player) {
      throw new Error('The test file has the timpani.');
    }
    // The middle of a beat, inside the passage of the timpani from 1 s to 8 s.
    const pose = poseAt(scene.plan, 2.25 + player.timeOffset, 10, PLAYING, audible).players[
      timpani
    ];
    const { z, w } = boneRotation(pose?.rotations ?? new Float32Array(0), boneIndex('spine'));
    // The spine turns around z for the sway, then around x for the breath: z / w = tan(sway / 2).
    const sway = Math.abs(2 * Math.atan2(z, w));
    const gesture = gestureSize(activityAt(player.passages, 2.25).loudness, player.amplitude);
    expect(Math.abs(sway / gesture - 2 * MathUtils.DEG2RAD)).toBeLessThan(0.2 * MathUtils.DEG2RAD);
  });

  it('sways a playing player with the beat, and not in the rest pose', () => {
    const spine = boneIndex('spine');
    const roll = (transport: typeof PLAYING, time: number): number => {
      const pose = poseAt(scene.plan, time, 10, transport, audible).players[timpani];
      return pose ? boneRotation(pose.rotations, spine).z : 0;
    };
    // The beats are 0.5 s apart. The middles of two neighbor beats sway to opposite sides.
    const offset = scene.plan.players[timpani]?.timeOffset ?? 0;
    const a = roll(PLAYING, 2.25 + offset);
    const b = roll(PLAYING, 2.75 + offset);
    expect(Math.abs(a)).toBeGreaterThan(0.005);
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(roll(NOT_STARTED, 2.25 + offset)).toBe(0);
  });
});

describe('preparePoses (design 5.1, 5.3)', () => {
  it('gives each player a seeded timing offset of at most 20 ms and a seeded amplitude', () => {
    const a = sceneOf(FILE, 1).plan.players;
    const b = sceneOf(FILE, 1).plan.players;
    const c = sceneOf(FILE, 2).plan.players;
    for (const player of a) {
      expect(Math.abs(player.timeOffset)).toBeLessThanOrEqual(PLAYER_OFFSETS.timeSec);
      expect(Math.abs(player.amplitude - 1)).toBeLessThanOrEqual(PLAYER_OFFSETS.amplitude);
    }
    expect(a.map((p) => p.timeOffset)).toEqual(b.map((p) => p.timeOffset));
    expect(a.map((p) => p.timeOffset)).not.toEqual(c.map((p) => p.timeOffset));
    expect(new Set(a.map((p) => p.timeOffset)).size).toBe(a.length);
    // Players in unison do not move as copies.
    const offsets = a.map((p) => p.timeOffset);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(0.005);
  });

  it('spreads the timing offsets from -20 ms to 20 ms (design 5.3)', () => {
    const offsets = [1, 2, 3, 4].flatMap((seed) =>
      sceneOf(FILE, seed).plan.players.map((p) => p.timeOffset),
    );
    expect(Math.min(...offsets)).toBeLessThan(-0.01);
    expect(Math.max(...offsets)).toBeGreaterThan(0.01);
  });

  it('takes the player models from the cache of the score (audit 2026-10-05, finding 8)', () => {
    const { plan, layout, models } = sceneOf(FILE);
    for (const [i, player] of plan.players.entries()) {
      const cast = layout.players[i]?.cast;
      expect(cast).toBeDefined();
      if (cast) {
        expect(player.skeleton).toBe(
          models.get(cast.species, cast.instrument, cast.kettles, cast.support).skeleton,
        );
      }
    }
    expect(ofConductor(plan.conductor).skeleton).toBe(
      models.get(CONDUCTOR.species, CONDUCTOR.instrument).skeleton,
    );
  });

  it('turns the heads of the seated players to the conductor, up and nearly straight', () => {
    const { plan, layout } = sceneOf(FILE);
    const seated = plan.players.filter((_, i) => layout.players[i]?.cast.support === 'chair');
    // The timpani make the file orchestral: 4 violins and 3 cellos (design 3.8).
    expect(seated).toHaveLength(7);
    for (const player of seated) {
      expect(Math.abs(player.lookYaw)).toBeLessThan(0.2);
      expect(player.lookPitch).toBeGreaterThan(0);
    }
  });
});

describe('preparePlayer and prepareConductor (design 5.1, 5.4)', () => {
  it('give the plans of preparePoses() from the notes and the places of one animal', () => {
    const { score, layout, plan, models } = sceneOf(FILE);
    const bear = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
    const loudness = noteLoudness(score);
    for (const [i, place] of layout.players.entries()) {
      const { cast } = place;
      const own = score.notes.flatMap((n, k) =>
        n.seatIndex === cast.seatIndex && n.player === cast.player
          ? [{ note: n, loudness: loudness[k] ?? 0 }]
          : [],
      );
      const player = preparePlayer(
        {
          model: models.get(cast.species, cast.instrument, cast.kettles, cast.support),
          place,
          notes: own.map((o) => o.note),
          loudness: own.map((o) => o.loudness),
          beats: Float64Array.from(score.beats, (b) => b.timeSec),
          lookTarget: headOf(bear, ofConductor(layout.conductor)),
          seatSeed: seatSeedOf(1, cast.seatIndex),
        },
        mixHash(1, i),
      );
      expect(player).toEqual(plan.players[i]);
    }
    const conductor = prepareConductor(
      {
        model: bear,
        place: ofConductor(layout.conductor),
        beats: score.beats,
        notes: score.notes,
        loudness,
        seatCount: score.seats.length,
        players: layout.players,
      },
      mixHash(1, -1),
    );
    expect(conductor).toEqual(plan.conductor);
  });

  it('gives no cue to a seat with no player', () => {
    // The cello enters after two full bars of rest, so the conductor cues it (design 5.4).
    const entry: TestFile = {
      tracks: [
        [tempo(0, 120), timeSignature(0, 4, 4)],
        track(
          [programChange(0, 0, 40)],
          ...[0, 1, 2, 3, 4, 5].map((bar) => note(bar * 1920, 0, 67, (bar + 1) * 1920)),
        ),
        track([programChange(0, 1, 42)], note(3840, 1, 48, 5760)),
      ],
    };
    // The full sections make the group larger than a chamber group, which has no conductor.
    const { score, layout, models } = sceneOf(entry, 1, 'full');
    const inputs = {
      model: models.get(CONDUCTOR.species, CONDUCTOR.instrument),
      place: ofConductor(layout.conductor),
      beats: score.beats,
      notes: score.notes,
      loudness: noteLoudness(score),
      seatCount: score.seats.length,
    };
    const cued = prepareConductor({ ...inputs, players: layout.players }, 1).note;
    const none = prepareConductor({ ...inputs, players: [] }, 1).note;
    expect(cued.family === 'conductor' && cued.cues.cues.length).toBeGreaterThan(0);
    expect(none.family === 'conductor' && none.cues.cues.length).toBe(0);
  });
});

describe('lookAngles (design 5.1)', () => {
  const { skeleton } = buildPlayer('rabbit', 'violin', 4);
  const head = skeleton.positions[boneIndex('head')] ?? [0, 0, 0];
  /** Gives the look at a point above the head and in front of it. */
  const lookAt = (up: number, ahead: number): readonly [number, number] => {
    const target: Vec3 = [head[0], head[1] + up, head[2] - ahead];
    return lookAngles(skeleton, [0, 0, 0], 0, target);
  };

  it('turns the head up or down by at most 0.5 rad', () => {
    expect(lookAt(0.3, 1)[1]).toBeCloseTo(Math.atan2(0.3, 1), 9);
    expect(lookAt(1, 1)[1]).toBeCloseTo(0.5, 9);
    expect(lookAt(-1, 1)[1]).toBeCloseTo(-0.5, 9);
  });
});

describe('beatSway', () => {
  it('sways to one side on one beat and to the other side on the next beat', () => {
    const beats = Float64Array.from([1, 1.5, 2, 2.5]);
    expect(beatSway(beats, 0.5)).toBe(0);
    expect(beatSway(beats, 1.25)).toBeCloseTo(1, 9);
    expect(beatSway(beats, 1.75)).toBeCloseTo(-1, 9);
    expect(beatSway(beats, 2.25)).toBeCloseTo(1, 9);
    expect(beatSway(beats, 1.5)).toBeCloseTo(0, 9);
    expect(beatSway(beats, 3)).toBe(0);
  });

  it('sways to each side in 2 beats for a singer (design 5.3)', () => {
    const beats = Float64Array.from([1, 1.5, 2, 2.5, 3]);
    expect(beatSway(beats, 1, 2)).toBeCloseTo(0, 9);
    expect(beatSway(beats, 1.5, 2)).toBeCloseTo(1, 9);
    expect(beatSway(beats, 2, 2)).toBeCloseTo(0, 9);
    expect(beatSway(beats, 2.5, 2)).toBeCloseTo(-1, 9);
  });
});

describe('poseAt in a count-in (design 5.2)', () => {
  const scene = sceneOf(FILE);
  const audible = allAudible(scene.score);
  const violin = scene.layout.players.findIndex((p) => p.cast.instrument === 'violin');

  it('holds the players at the pause point in the count-in after a pause', () => {
    // A play at 1.25 s, between two notes of the violin. The beat is 0.5 s at 120 BPM in 4/4.
    const resume: Transport = { ...PLAYING, startSec: 1.25 };
    const held = structuredClone(poseAt(scene.plan, 1.25, 8, resume, audible).players);
    for (const time of [0.75, 1, 1.2]) {
      expect(poseAt(scene.plan, time, 8, resume, audible).players, `${time}`).toEqual(held);
    }
    // After the pause point, the bow moves on.
    const later = poseAt(scene.plan, 1.35, 8, resume, audible).players[violin];
    expect(later?.rotations).not.toEqual(held[violin]?.rotations);
  });

  it('lets the players prepare for the first notes in the count-in from the song start', () => {
    // The violin lands the bow on the string before its first note at 0 s (design 5.3).
    const before = structuredClone(poseAt(scene.plan, -0.3, 8, PLAYING, audible).players);
    const atStart = poseAt(scene.plan, 0, 8, PLAYING, audible).players;
    expect(before[violin]?.rotations).not.toEqual(atStart[violin]?.rotations);
  });

  it('has the instruments up before the downbeat after a play from the song start', () => {
    // The count-in of the file is 1.2 s and one beat of 0.5 s. The slowest lift ends after
    // LIFT_FIT_SEC (5.2). A play at the wall time 10 s reaches the song time -0.01 s at 11.69 s.
    // The poses equal the poses of a play long before.
    const wall = 10 + 1.7 - 0.01;
    const play: Transport = { ...PLAYING, changedAtWall: 10 };
    const up = structuredClone(poseAt(scene.plan, -0.01, wall, PLAYING, audible).players);
    expect(poseAt(scene.plan, -0.01, wall, play, audible).players).toEqual(up);
    expect(poseAt(scene.plan, -0.01, 10.2, play, audible).players).not.toEqual(
      poseAt(scene.plan, -0.01, 10.2, PLAYING, audible).players,
    );
  });
});

/** The fastest speed of the speed menu (design 2.4, 2.8). */
const FASTEST = 1.5;

/**
 * Gives the transport after a play or a pause, with the rule of `changeTransport()` of `app/`:
 * the transport before the change, and no hold after a pause in the count-in (design 5.2). A
 * pause keeps the lead time of its play.
 */
function changed(
  before: Transport,
  playing: boolean,
  wall: number,
  startSec: number,
  holdSec: number = REST_TIMES.hold,
  leadSec = Number.POSITIVE_INFINITY,
): Transport {
  return {
    playing,
    changedAtWall: wall,
    before,
    startSec,
    seekStart: false,
    endedAtSong: false,
    holdSec,
    leadSec: playing ? leadSec : before.leadSec,
  };
}

/** Gives the weight of each player of a plan at a wall time, with all seats audible. */
function weightsAt(
  players: readonly PlayerPlan[],
  transport: Transport,
  wall: number,
  seats: readonly (SeatAudibility | undefined)[] = [],
): number[] {
  return players.map((p) => playerWeight(p, transport, seats[p.seatIndex], wall, 0));
}

/** The scene of the Boulanger demo, the default demo, built one time for the tests. */
let boulangerScene: TestScene | undefined;

/** Gives the scene of the Boulanger demo, the default demo. */
async function boulanger(): Promise<TestScene> {
  if (!boulangerScene) {
    boulangerScene = await demoSceneOf('boulanger-matin.mid');
  }
  return boulangerScene;
}

describe('the seeded rest motions (design 5.2, 5.5)', () => {
  it('gives each player a slow lift and lowering, with starts spread over the orchestra', async () => {
    const { players } = (await boulanger()).plan;
    const m = REST_MOTION;
    for (const { motion } of players) {
      expect(motion.lift.durationSec).toBeGreaterThanOrEqual(m.liftSec.others.min);
      expect(motion.lift.durationSec).toBeLessThanOrEqual(m.liftSec.carried.max);
      expect(motion.lower.durationSec).toBeGreaterThanOrEqual(m.lowerSec.min);
      expect(motion.lower.durationSec).toBeLessThanOrEqual(m.lowerSec.max);
      expect(motion.lift.delaySec + motion.lift.durationSec).toBeLessThanOrEqual(LIFT_FIT_SEC);
    }
    // The starts of the players spread over 0.5 s to 0.8 s, for the lift and the lowering.
    for (const move of ['lift', 'lower'] as const) {
      const delays = players.map((p) => p.motion[move].delaySec);
      const spread = Math.max(...delays) - Math.min(...delays);
      expect(spread, move).toBeGreaterThan(0.5);
      expect(spread, move).toBeLessThan(0.8);
    }
    // No two players have the same lift.
    expect(new Set(players.map((p) => p.motion.lift.durationSec)).size).toBe(players.length);
  });

  it('gives each seat a ripple: the principal moves first, and the later players follow', () => {
    // The timpani make the file orchestral: 4 violins and 3 cellos (design 3.8).
    const { plan, layout } = sceneOf(FILE);
    const seats = new Map<number, { player: number; lift: number; lower: number }[]>();
    for (const [i, place] of layout.players.entries()) {
      const motion = plan.players[i]?.motion;
      if (motion) {
        const list = seats.get(place.cast.seatIndex) ?? [];
        list.push({
          player: place.cast.player,
          lift: motion.lift.delaySec,
          lower: motion.lower.delaySec,
        });
        seats.set(place.cast.seatIndex, list);
      }
    }
    const sizes = [...seats.values()].map((list) => list.length);
    expect(sizes.toSorted((a, b) => a - b)).toEqual([1, 3, 4]);
    for (const list of seats.values()) {
      const ordered = list.toSorted((a, b) => a.player - b.player);
      for (let k = 1; k < ordered.length; k++) {
        expect(ordered[k]?.lift).toBeGreaterThan(ordered[k - 1]?.lift ?? Infinity);
        expect(ordered[k]?.lower).toBeGreaterThan(ordered[k - 1]?.lower ?? Infinity);
      }
    }
    // The same seed gives the same motions, and another seed gives other motions.
    expect(sceneOf(FILE).plan.players.map((p) => p.motion)).toEqual(
      plan.players.map((p) => p.motion),
    );
    expect(sceneOf(FILE, 2).plan.players.map((p) => p.motion)).not.toEqual(
      plan.players.map((p) => p.motion),
    );
    // Each player has its own durations, and the conductor does not vary (design 5.4).
    const durations = plan.players.map((p) => p.motion.lift.durationSec);
    expect(new Set(durations).size).toBe(plan.players.length);
    expect(ofConductor(plan.conductor).motion).toEqual(CONDUCTOR_MOTION);
  });

  it('lifts the players at different times when play starts', async () => {
    const { players } = (await boulanger()).plan;
    const play = changed(NOT_STARTED, true, 10, 0);
    const lifting = weightsAt(players, play, 10.6);
    expect(Math.min(...lifting)).toBeLessThan(0.2);
    expect(Math.max(...lifting)).toBeGreaterThan(0.6);
    // No player is up 0.55 s after the play, and all players are up after LIFT_FIT_SEC.
    expect(Math.max(...weightsAt(players, play, 10.55))).toBeLessThan(1);
    expect(weightsAt(players, play, 10 + LIFT_FIT_SEC)).toEqual(players.map(() => 1));
  });

  it('lowers the players at different times after a pause and in a silent seat', async () => {
    const scene = await boulanger();
    const { players } = scene.plan;
    const pause = changed(PLAYING, false, 20, 0);
    const lowering = weightsAt(players, pause, 23.9);
    expect(Math.min(...lowering)).toBeLessThan(0.6);
    expect(Math.max(...lowering)).toBeGreaterThan(0.9);
    expect(weightsAt(players, pause, 23 + LOWER_MAX_SEC)).toEqual(players.map(() => 0));
    // All seats go silent at the wall time 30 s.
    const silent = allAudible(scene.score).map((): SeatAudibility => ({
      audible: false,
      changedAtWall: 30,
      before: null,
    }));
    const muted = weightsAt(players, PLAYING, 30.9, silent);
    expect(Math.min(...muted)).toBeLessThan(0.6);
    expect(Math.max(...muted)).toBeGreaterThan(0.9);
    expect(weightsAt(players, PLAYING, 30 + LOWER_MAX_SEC, silent)).toEqual(players.map(() => 0));
  });

  it('has the instruments of all players up before the downbeat, at each tempo and speed', async () => {
    // The Bach demo has the shortest count-in of the demos: 1.5 s.
    const demos = await patchedDemos();
    const counts = demos.map((demo) => {
      const beats = Float64Array.from(scoreOf(demo.bytes).beats, (b) => b.timeSec);
      return { demo, lengthSec: countInAt(beats, 0).lengthSec };
    });
    const fastest = counts.reduce((a, b) => (b.lengthSec < a.lengthSec ? b : a));
    expect(fastest.demo.file).toBe('bach-bwv1048.mid');
    const fastestScene = sceneOf(fastest.demo.bytes);
    // A file of 5/4 at 600 BPM has a conducted beat of 0.1 s, so its count-in is 1.3 s. A bar of
    // 4/4 at this tempo gets one beat (design 5.4).
    const short: TestFile = {
      tracks: [[tempo(0, 600), timeSignature(0, 5, 4)], track([], note(0, 0, 60, 2400))],
    };
    for (const all of [fastestScene, sceneOf(short)]) {
      const count = countInAt(all.plan.beats, 0);
      expect(count.lengthSec).toBeLessThan(1.51);
      for (const speed of [0.5, 1, FASTEST]) {
        // The downbeat comes T / speed of wall time after the play.
        const lead = count.lengthSec / speed;
        const play = changed(NOT_STARTED, true, 10, 0, REST_TIMES.hold, lead);
        const wall = 10 + lead - 0.001;
        expect(weightsAt(all.plan.players, play, wall), `speed ${speed}`).toEqual(
          all.plan.players.map(() => 1),
        );
        // The poses equal the poses of a play long before.
        const audible = allAudible(all.score);
        const up = structuredClone(poseAt(all.plan, -0.001, wall, PLAYING, audible));
        expect(poseAt(all.plan, -0.001, wall, play, audible)).toEqual(up);
      }
    }
    // At the speed 1, the count-in of the Boulanger demo (1.617 s) holds the slowest lift, so no
    // lift is faster than its seeded time. The count-in of the Bach demo scales the slowest
    // lifts by 0.935 (design 5.2).
    const defaultScene = await boulanger();
    const boulangerCount = countInAt(defaultScene.plan.beats, 0).lengthSec;
    for (const player of defaultScene.plan.players) {
      expect(liftScale(player.motion, boulangerCount)).toBe(1);
    }
    const scales = fastestScene.plan.players.map((p) => liftScale(p.motion, fastest.lengthSec));
    expect(Math.min(...scales)).toBeCloseTo(0.935, 3);
  });

  it('has the instruments up before the pause point on a resume, at each speed', async () => {
    // A pause long ago, then a play at the pause point 20 s of the Boulanger demo. Its beats are
    // the shortest beats of the demos: 0.417 s.
    const all = await boulanger();
    const pause = changed(PLAYING, false, 5, 20);
    const beat = countInAt(all.plan.beats, 20).beatSec;
    for (const speed of [0.5, 1, 1.25, FASTEST]) {
      const lead = beat / speed;
      const resume = changed(pause, true, 50, 20, REST_TIMES.hold, lead);
      const atPausePoint = weightsAt(all.plan.players, resume, 50 + lead - 0.001);
      expect(atPausePoint, `speed ${speed}`).toEqual(all.plan.players.map(() => 1));
      expect(
        transportHeight(ofConductor(all.plan.conductor).motion, resume, 50 + lead - 0.001),
      ).toBe(1);
    }
  });

  it('keeps the weight and the pose of each player continuous at each change', async () => {
    const { players } = (await boulanger()).plan;
    // A play, a pause in the count-in, a play, a pause in the lift, a play in the hold, a pause,
    // a play in the lowering, a pause in the count-in, and a play. Each change keeps the
    // transport before it, as `changeTransport()` does (F8).
    const changes: { wall: number; playing: boolean; startSec: number; holdSec?: number }[] = [
      { wall: 1, playing: true, startSec: 0 },
      { wall: 1.1, playing: false, startSec: 0, holdSec: 0 },
      { wall: 1.2, playing: true, startSec: 0 },
      { wall: 1.9, playing: false, startSec: 0.5 },
      { wall: 2.5, playing: true, startSec: 0.5 },
      { wall: 5, playing: false, startSec: 3 },
      { wall: 8.6, playing: true, startSec: 3 },
      { wall: 8.7, playing: false, startSec: 3, holdSec: 0 },
      { wall: 9.3, playing: true, startSec: 3 },
    ];
    // Each play has a lead time of 1 s, so its lifts take 1 / LIFT_FIT_SEC of their time.
    const lead = 1;
    const transports: Transport[] = [];
    let current = NOT_STARTED;
    for (const c of changes) {
      current = changed(current, c.playing, c.wall, c.startSec, c.holdSec, lead);
      transports.push(current);
    }
    // The first seat goes silent at 1.5 s in the lift, sounds again at 1.8 s, and goes silent
    // at 2.3 s.
    const seats = (wall: number): SeatAudibility[] => {
      let seat: SeatAudibility | null = null;
      for (const [at, audible] of [
        [1.5, false],
        [1.8, true],
        [2.3, false],
      ] as const) {
        if (wall >= at) {
          seat = { audible, changedAtWall: at, before: seat };
        }
      }
      return seat ? [seat] : [];
    };
    const transportAt = (wall: number): Transport =>
      transports.findLast((t) => (t.changedAtWall ?? 0) <= wall) ?? NOT_STARTED;
    // The fastest move is the shortest lift with the scale of the lead time. The eased curve has
    // a slope of less than 2.5 times its mean, and a weight is a product of two heights.
    const fastestSec = REST_MOTION.liftSec.others.min * Math.min(1, lead / LIFT_FIT_SEC);
    const step = 0.001;
    const largest = (2 * 2.5 * step) / fastestSec;
    // One `expect()` for each sample of each player takes most of the time of the test, so the
    // loop keeps only the largest step and its place.
    let before = weightsAt(players, NOT_STARTED, 0, seats(0));
    let worst = { step: 0, at: '' };
    for (let wall = step; wall < 14; wall += step) {
      const now = weightsAt(players, transportAt(wall), wall, seats(wall));
      for (const [i, w] of now.entries()) {
        const change = Math.abs(w - (before[i] ?? 0));
        if (change > worst.step) {
          worst = { step: change, at: `player ${i} at ${wall.toFixed(3)} s` };
        }
      }
      before = now;
    }
    expect(worst.step, worst.at).toBeLessThan(largest);
    // The poses of a smaller scene also move with no jump: each part of each rotation changes by
    // less than 0.06 in 2 ms. The song time stays, so only the weights and the idle layer move. A
    // rotation has two quaternions, q and -q, and the blends take the nearer one (`blend.ts`). The
    // left hand of the side rest of the rabbit changes from one to the other in the lift (at the
    // wall time 3.79 s) with no move, so the test compares each rotation with the nearer one.
    const small = sceneOf(FILE).plan;
    let last = createScenePose(small);
    let next = createScenePose(small);
    poseAt(small, 30, 0, NOT_STARTED, seats(0), last);
    let jump = 0;
    for (let wall = 0.002; wall < 14; wall += 0.002) {
      poseAt(small, 30, wall, transportAt(wall), seats(wall), next);
      for (const [i, pose] of next.players.entries()) {
        const old = last.players[i]?.rotations ?? pose.rotations;
        for (let b = 0; b < pose.rotations.length; b += 4) {
          let same = 0;
          let opposite = 0;
          for (let k = b; k < b + 4; k++) {
            const value = pose.rotations[k] ?? 0;
            same = Math.max(same, Math.abs(value - (old[k] ?? value)));
            opposite = Math.max(opposite, Math.abs(value + (old[k] ?? -value)));
          }
          jump = Math.max(jump, Math.min(same, opposite));
        }
      }
      [last, next] = [next, last];
    }
    expect(jump).toBeLessThan(0.06);
  });
});
