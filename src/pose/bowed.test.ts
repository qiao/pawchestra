import { describe, expect, it } from 'vitest';

import { note, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestFile } from '../midi/test-smf.ts';
import { MathUtils, Quaternion, Vector3 } from 'three';

import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { PlayerModel } from '../models/player.ts';
import { buildPlayer } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { createBowPlaces, instrumentAt, poseBowed } from './bowed.ts';
import { SECTION_SPECIES } from '../models/cast.ts';
import { placePoint } from '../models/instruments/hold.ts';
import { VIOLIN } from '../models/instruments/strings.ts';
import { SPECIES } from '../models/species.ts';
import type { SpeciesParams } from '../models/species.ts';
import { poseShoulder } from './ik.ts';
import { BOWED_HOLDS, bowedRig, holdOf, playingFrames } from './bowed-rig.ts';
import type { BowedHold, BowedInstrument } from './bowed-rig.ts';
import { BIND_ROTATIONS } from './frames.ts';
import type { PosePlan } from './plan.ts';
import { createScenePose, poseAt } from './pose-at.ts';
import {
  demoLooks,
  headClearance,
  posedNeck,
  posedPart,
  signedDistance,
} from './test-clearance.ts';
import { createBowState } from './strokes.ts';
import {
  armLengthErrors,
  instrumentTurn,
  posedAt,
  posedPiecePoint,
  posedPoint,
  poseSkeleton,
} from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { NOT_STARTED, PLAYING, demoSceneOf, firstPlayers, sceneOf } from './test-scene.ts';
import type { ScenePlayer, TestScene } from './test-scene.ts';
import type { Transport } from './types.ts';

/** The notes of one bowed section: quarter notes at 120 BPM, then pizzicato from 4 s. */
function section(channel: number, program: number, keys: readonly number[]) {
  return track(
    [programChange(0, channel, program)],
    ...keys.map((key, i) => note(i * 480, channel, key)),
    [programChange(3840, channel, 45)],
    ...keys.map((key, i) => note(3840 + i * 480, channel, key)),
  );
}

/**
 * The four bowed sections, each on its own track, with notes on each string, and the second
 * violins. The first violins are rabbits with the shoulder hold, and the second violins are red
 * foxes with the chin hold.
 */
const FILE: TestFile = {
  tracks: [
    [tempo(0, 120), timeSignature(0, 4, 4)],
    section(0, 40, [55, 62, 69, 76, 88, 60, 79, 57]),
    section(1, 41, [48, 55, 62, 69, 81, 52, 72, 50]),
    section(2, 42, [36, 43, 50, 57, 69, 40, 64, 38]),
    section(3, 43, [28, 33, 38, 43, 55, 31, 50, 29]),
    section(4, 40, [55, 62, 69, 76, 88, 60, 79, 57]),
  ],
};

/** A bowed string player of a test scene, with its model. */
type BowedPlayer = ScenePlayer<BowedInstrument>;

/**
 * Finds the first player of each bowed instrument in a scene, and the first red fox of the
 * violins, which has the chin hold.
 *
 * @param scene The scene.
 * @returns The violin, the viola, the cello, the contrabass, and the violin of a red fox when the
 *   scene has one.
 */
function bowedPlayers(scene: TestScene): BowedPlayer[] {
  const players = firstPlayers(scene, ['violin', 'viola', 'cello', 'contrabass'] as const);
  const fox = scene.layout.players.findIndex(
    (p) => p.cast.instrument === 'violin' && p.cast.species === 'fox-red',
  );
  const cast = scene.layout.players[fox]?.cast;
  if (cast) {
    const model = scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support);
    players.push({ index: fox, instrument: 'violin', model });
  }
  return players;
}

/** Gives the hold of a player: the hold of its species and its instrument. */
function holdOfPlayer(scene: TestScene, player: BowedPlayer): BowedHold {
  const species = scene.layout.players[player.index]?.cast.species;
  if (!species) {
    throw new Error('The player has no place.');
  }
  return holdOf(species, player.instrument);
}

/** Gives the angle of the turn of a violin in play: the play turn of its hold, in radians. */
function playAngle(scene: TestScene, player: BowedPlayer): number {
  const w = holdOfPlayer(scene, player).playTurn[3];
  return 2 * Math.acos(Math.min(1, Math.abs(w)));
}

function target(model: PlayerModel, kind: 'bow-contact' | 'fingerboard' | 'bow-hair') {
  const found = model.instrument.targets.find((t) => t.kind === kind);
  if (!found) {
    throw new Error(`The ${model.instrument.id} has no target "${kind}".`);
  }
  return found;
}

/**
 * Makes a vector from a point.
 *
 * @param p The point.
 * @returns A new vector.
 */
function v(p: Vec3): Vector3 {
  return new Vector3(...p);
}

/** The posed bow hair: its start at the frog and its unit direction to the tip. */
interface HairLine {
  readonly start: Vector3;
  readonly direction: Vector3;
}

function hairOf(posed: PosedSkeleton): HairLine {
  const hair = target(posed.model, 'bow-hair');
  const start = v(posedPiecePoint(posed, { bone: 'bow', at: hair.from }));
  const end = v(posedPiecePoint(posed, { bone: 'bow', at: hair.to }));
  return { start, direction: end.sub(start).normalize() };
}

/** A point on the strings of a posed bowed string, from the nut. */
interface StopPlace {
  /** The height above the plane of the strings, in meters. */
  readonly height: number;
  /** The distance to the side of the middle line of the strings, in meters. */
  readonly side: number;
  /** The place along the target `fingerboard`: 0 at the nut, 1 at the end. */
  readonly place: number;
  /** The length of the target `fingerboard`, in meters. */
  readonly neckLength: number;
}

/**
 * Measures a point against the posed strings of a player.
 *
 * @param posed The posed skeleton of a bowed string player.
 * @param point The posed point.
 * @returns The place of the point on the strings.
 */
function stopOf(posed: PosedSkeleton, point: Vector3): StopPlace {
  const board = target(posed.model, 'fingerboard');
  const nut = v(posedPiecePoint(posed, { bone: 'instrument', at: board.from }));
  const end = v(posedPiecePoint(posed, { bone: 'instrument', at: board.to }));
  const above = v(board.from).add(v(board.normal));
  const top = v(posedPiecePoint(posed, { bone: 'instrument', at: toVec3(above) }))
    .sub(nut)
    .normalize();
  const neck = end.sub(nut);
  const across = new Vector3().crossVectors(top, neck).normalize();
  const offset = point.clone().sub(nut);
  return {
    height: offset.dot(top),
    side: offset.dot(across),
    place: offset.dot(neck) / neck.dot(neck),
    neckLength: neck.length(),
  };
}

function positionOf(posed: PosedSkeleton, bone: BoneName): Vector3 {
  return posed.frames[boneIndex(bone)]?.position ?? new Vector3();
}

describe('poseBowed (design 5.3, 4.7)', () => {
  const scene = sceneOf(FILE);
  const players = bowedPlayers(scene);

  it('keeps the bow across the strings, slanted by the hold', () => {
    for (const player of players) {
      const posed = posedAt(scene, player, 1.3);
      const fingerboard = target(player.model, 'fingerboard');
      const nut = v(posedPiecePoint(posed, { bone: 'instrument', at: fingerboard.from }));
      const end = v(posedPiecePoint(posed, { bone: 'instrument', at: fingerboard.to }));
      const strings = nut.sub(end).normalize();
      const { slant } = holdOfPlayer(scene, player);
      expect(Math.abs(hairOf(posed).direction.dot(strings))).toBeCloseTo(
        Math.abs(Math.sin(slant)),
        6,
      );
    }
  });

  it('holds the violin of a rabbit on the left shoulder about level, as a real violinist', () => {
    const rabbit = players[0];
    const fox = players[4];
    if (!rabbit || !fox) {
      throw new Error('The test file has the first and the second violins.');
    }
    /** Gives the side of the tail end from the head, in H, and the rise of the scroll. */
    const place = (player: BowedPlayer) => {
      const posed = posedAt(scene, player, 1.3);
      const h = player.model.body.headHeight;
      const fingerboard = target(player.model, 'fingerboard');
      const nut = v(posedPiecePoint(posed, { bone: 'instrument', at: fingerboard.from }));
      const end = v(posedPiecePoint(posed, { bone: 'instrument', at: fingerboard.to }));
      const tail = positionOf(posed, 'instrument');
      return {
        side: (tail.x - positionOf(posed, 'head').x) / h,
        rise: (nut.y - end.y) / nut.distanceTo(end),
      };
    };
    const shoulder = place(rabbit);
    const chin = place(fox);
    // The left side of the animal is -x. The scroll stays within 10° of the level line.
    expect(shoulder.side).toBeLessThan(chin.side - 0.15);
    expect(Math.abs(shoulder.rise)).toBeLessThan(Math.sin((10 * Math.PI) / 180));
  });

  it('sizes the violin of a species with a violin scale by the rule of real violins (design 4.6)', () => {
    // In the play position with the left arm extended, the scroll lies in the middle of the
    // palm: a violin shop sizes a violin so.
    const sized = players.filter((player) => {
      const species: SpeciesParams =
        SPECIES[scene.layout.players[player.index]?.cast.species ?? 'fox-red'];
      return player.instrument === 'violin' && species.violinScale !== undefined;
    });
    expect(sized.length).toBeGreaterThan(0);
    for (const player of sized) {
      const rig = bowedRig(player.model, 'violin', holdOfPlayer(scene, player));
      const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -rig.hold.lean);
      const spine = v(rig.spineBind);
      const frames = {
        root: { rotation: new Quaternion(), position: new Vector3() },
        chest: {
          rotation: lean,
          position: v(rig.chestBind).sub(spine).applyQuaternion(lean).add(spine),
        },
      };
      const { place } = createBowPlaces();
      instrumentAt(rig, frames, 1, place);
      // The scroll: the far end of the violin from the tail end, on the line of the strings.
      const length = VIOLIN.length / VIOLIN.nut;
      const nut = v(
        placePoint(player.model.pieces, {
          bone: 'instrument',
          at: target(player.model, 'fingerboard').from,
        }),
      );
      const tail = v(rig.pivot);
      const scroll = nut.sub(tail).multiplyScalar(length).add(tail);
      const posedScroll = scroll.sub(tail).applyQuaternion(place.rotation).add(place.pivot);
      const shoulder = poseShoulder(
        rig.armL,
        frames.chest,
        rig.chestBind,
        new Quaternion(),
      ).position;
      const at = (bone: BoneName): Vector3 =>
        v(player.model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0]);
      const arm =
        at('upperArmL').distanceTo(at('forearmL')) +
        at('forearmL').distanceTo(at('handL')) +
        at('handL').distanceTo(v(player.model.body.palmL));
      expect(Math.abs(posedScroll.distanceTo(shoulder) - arm)).toBeLessThan(0.01);
    }
  });

  it('puts the left fingers on the strings and the left palm under them', () => {
    // A palm 0.063 m below the strings at the violin model size (0.08 m on the violin) puts the
    // fingers beside the neck, and the hand does not touch the fingerboard. The distances across
    // the neck scale with the violin of the species (design 4.6).
    for (const player of players) {
      const species = scene.layout.players[player.index]?.cast.species ?? 'fox-red';
      const params: SpeciesParams = SPECIES[species];
      const scale = params.violinScale ?? 1;
      for (const t of [0.3, 1.3, 2.25, 2.75]) {
        const posed = posedAt(scene, player, t);
        const label = `${species} ${player.instrument} at ${t}`;
        // The finger block of the mitten reaches through the plane of the strings. The paw of a
        // body has one finger bone, and its finger block stays at the side of the neck,
        // under the plane of the strings.
        if (!player.model.bodyRig) {
          const heights = posedPart(posed, ['fingersL']).triangles.flatMap((triangle) =>
            [triangle.a, triangle.b, triangle.c].map((corner) => stopOf(posed, corner).height),
          );
          expect(Math.max(...heights), label).toBeGreaterThan(0.01 * scale);
          expect(Math.min(...heights), label).toBeLessThan(-0.01 * scale);
        }
        // The palm is below the strings, near the neck.
        const palm = stopOf(posed, v(posedPoint(posed, 'handL', player.model.body.palmL)));
        expect(palm.height, label).toBeLessThan(-0.005 * scale);
        expect(Math.hypot(palm.height, palm.side), label).toBeLessThan(
          0.25 * player.model.body.headHeight,
        );
      }
    }
  });

  /**
   * Poses one player with a bow state, from the bind torso with the lean of the hold, and gives
   * its posed skeleton.
   */
  function posedWith(player: BowedPlayer, string: number, fingerboard = 0): PosedSkeleton {
    const rig = bowedRig(player.model, player.instrument);
    const rotations = Float32Array.from(BIND_ROTATIONS);
    const instrumentOffset: [number, number, number] = [0, 0, 0];
    const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -rig.hold.lean);
    const spine = v(rig.spineBind);
    lean.toArray(rotations, boneIndex('spine') * 4);
    poseBowed(
      rig,
      {
        root: { rotation: new Quaternion(), position: new Vector3() },
        chest: {
          rotation: lean,
          position: v(rig.chestBind).sub(spine).applyQuaternion(lean).add(spine),
        },
      },
      { ...createBowState(), string, bow: 0.2, fingerboard },
      1,
      rotations,
      instrumentOffset,
    );
    // The play shift of the hold moves the instrument bone (design 5.3).
    return poseSkeleton(player.model, {
      rotations,
      rootOffset: [0, 0, 0],
      slideOffset: [0, 0, 0],
      instrumentOffset,
      blink: 0,
    });
  }

  it('turns the bow to the bass side of the strings for a low string', () => {
    for (const player of players) {
      const rig = bowedRig(player.model, player.instrument);
      const bass = new Vector3().crossVectors(v(rig.top), v(rig.axis)).normalize();
      const hair = target(player.model, 'bow-hair');
      const tip = v(hair.from).add(v(hair.normal));
      const hairNormal = (posed: PosedSkeleton): Vector3 =>
        v(posedPiecePoint(posed, { bone: 'bow', at: toVec3(tip) })).sub(
          v(posedPiecePoint(posed, { bone: 'bow', at: hair.from })),
        );
      // The hair faces the strings: its normal points away from the top plate. On the lowest
      // string, the top of the bow plane turns to the bass side, so the normal turns away.
      const low = hairNormal(posedWith(player, 0)).dot(bass);
      const high = hairNormal(posedWith(player, 3)).dot(bass);
      expect(low, player.instrument).toBeLessThan(high - 0.1);
    }
  });

  it('raises the bow hand of a violin for its lowest string', () => {
    const violin = players[0];
    if (!violin) {
      throw new Error('The test file has a violin.');
    }
    const height = (string: number): number => positionOf(posedWith(violin, string), 'handR').y;
    expect(height(0)).toBeGreaterThan(height(3) + 0.01);
  });

  it('keeps the bones of the arms at their bind lengths', () => {
    for (const player of players) {
      for (const t of [0.3, 2.1, 4.4]) {
        for (const error of armLengthErrors(posedAt(scene, player, t))) {
          expect(error, `${player.instrument} at ${t}`).toBeLessThan(5e-6);
        }
      }
    }
  });
});

/** The depth in the legs, in head heights `H`, that the rest bow of a violinist may reach. */
const REST_BOW_LEG_DEPTH = 0.03;

/**
 * Gives points on the edges of the posed bow, at most 5 mm apart, so that a long thin triangle of
 * the stick or the hair that crosses a part shows a point inside it.
 *
 * @param posed The posed skeleton.
 * @returns The points.
 */
function bowEdgePoints(posed: PosedSkeleton): Vector3[] {
  const points: Vector3[] = [];
  for (const t of posedPart(posed, ['bow']).triangles) {
    for (const [from, to] of [
      [t.a, t.b],
      [t.b, t.c],
      [t.c, t.a],
    ] as const) {
      const steps = Math.max(1, Math.ceil(from.distanceTo(to) / 0.005));
      for (let i = 0; i < steps; i++) {
        points.push(new Vector3().lerpVectors(from, to, i / steps));
      }
    }
  }
  return points;
}

/**
 * Gives the largest depth of some points in the posed parts of some bones.
 *
 * @param posed The posed skeleton.
 * @param bones The bones of the parts.
 * @param points The points.
 * @returns The depth in meters, or 0 when each point is outside.
 */
function deepestIn(
  posed: PosedSkeleton,
  bones: readonly BoneName[],
  points: readonly Vector3[],
): number {
  const part = posedPart(posed, bones);
  let deepest = 0;
  for (const point of points) {
    if (part.box.containsPoint(point)) {
      deepest = Math.max(deepest, -signedDistance(part, point));
    }
  }
  return deepest;
}

describe('the rest pose of the bowed strings (design 5.2, 5.5)', () => {
  const scene = sceneOf(FILE);
  const players = bowedPlayers(scene);

  it('lowers the violin and the viola before the first play, and keeps the cello up', () => {
    const [violin, viola, cello, contrabass] = players;
    if (!violin || !viola || !cello || !contrabass) {
      throw new Error('The test file has four bowed sections.');
    }
    expect(instrumentTurn(scene, violin.index, 0, NOT_STARTED)).toBeGreaterThan(1);
    expect(instrumentTurn(scene, viola.index, 0, NOT_STARTED)).toBeGreaterThan(1);
    expect(instrumentTurn(scene, cello.index, 0, NOT_STARTED)).toBe(0);
    expect(instrumentTurn(scene, contrabass.index, 0, NOT_STARTED)).toBe(0);
    expect(instrumentTurn(scene, violin.index, 10)).toBeCloseTo(playAngle(scene, violin), 6);
  });

  it('lifts the instruments with the seeded lift of the player when play starts (design 5.2)', () => {
    const violin = players[0];
    const lift = scene.plan.players[violin?.index ?? -1]?.motion.lift;
    if (!violin || !lift) {
      throw new Error('The test file has a violin.');
    }
    const down = instrumentTurn(scene, violin.index, 0, NOT_STARTED);
    const start = 5 + lift.delaySec;
    const play: Transport = {
      playing: true,
      changedAtWall: 5,
      before: null,
      startSec: 0,
      seekStart: false,
      endedAtSong: false,
      holdSec: 3,
      leadSec: Number.POSITIVE_INFINITY,
    };
    expect(instrumentTurn(scene, violin.index, start, play)).toBeCloseTo(down, 5);
    const half = instrumentTurn(scene, violin.index, start + lift.durationSec / 2, play);
    expect(half).toBeLessThan(0.8 * down);
    expect(half).toBeGreaterThan(0.2 * down);
    expect(instrumentTurn(scene, violin.index, start + lift.durationSec, play)).toBeCloseTo(
      playAngle(scene, violin),
      5,
    );
  });

  it('rests the violin and the viola upright on the left thigh (user report of 2026-10-06)', () => {
    for (const player of players.slice(0, 2)) {
      const posed = posedAt(scene, player, 1, 0, NOT_STARTED);
      const h = player.model.body.headHeight;
      // The tail end stands on the top of the thigh, and the scroll points up.
      const tail = positionOf(posed, 'instrument');
      const thigh = posedPart(posed, ['thighL']);
      const gap = signedDistance(thigh, tail) / h;
      expect(gap, player.instrument).toBeGreaterThan(0);
      expect(gap, player.instrument).toBeLessThan(0.15);
      const board = target(player.model, 'fingerboard');
      const nut = v(posedPiecePoint(posed, { bone: 'instrument', at: board.from }));
      expect(nut.sub(tail).normalize().y, player.instrument).toBeGreaterThan(0.85);
    }
  });

  it('keeps the rest bow of each violinist out of the trunk and the arms, and nearly out of the legs', () => {
    // The paw holds the frog on the lap, so the frog may press 0.03 H into the thighs and the
    // shins.
    const violins = players.filter((p) => p.instrument === 'violin');
    expect(violins).toHaveLength(2);
    for (const player of violins) {
      const h = player.model.body.headHeight;
      for (const wall of [0, 4]) {
        const posed = posedAt(scene, player, 1, wall, NOT_STARTED);
        const points = bowEdgePoints(posed);
        const species = scene.layout.players[player.index]?.cast.species ?? '?';
        const label = `${species} at ${wall} s`;
        const trunk = deepestIn(posed, ['hips', 'spine', 'chest', 'neck', 'head'], points);
        expect(trunk, label).toBe(0);
        const arms = ['upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR'] as const;
        expect(deepestIn(posed, arms, points), label).toBe(0);
        const legs = ['thighL', 'thighR', 'shinL', 'shinR'] as const;
        expect(deepestIn(posed, legs, points) / h, label).toBeLessThanOrEqual(REST_BOW_LEG_DEPTH);
      }
    }
  });

  it('lowers the instruments of a silent seat with the seeded lowering, after the change', () => {
    const violin = players[0];
    const lower = scene.plan.players[violin?.index ?? -1]?.motion.lower;
    if (!violin || !lower) {
      throw new Error('The test file has a violin.');
    }
    const rest = instrumentTurn(scene, violin.index, 0, NOT_STARTED);
    const start = 20 + lower.delaySec;
    expect(instrumentTurn(scene, violin.index, start, PLAYING, 20)).toBeCloseTo(
      playAngle(scene, violin),
      6,
    );
    const half = instrumentTurn(scene, violin.index, start + lower.durationSec / 2, PLAYING, 20);
    expect(half).toBeGreaterThan(0.2 * rest);
    expect(half).toBeLessThan(0.8 * rest);
    const end = start + lower.durationSec;
    expect(instrumentTurn(scene, violin.index, end, PLAYING, 20)).toBeCloseTo(rest, 4);
  });
});

describe('the head and the neck of a floor instrument (review of step 5, F2)', () => {
  /** The smallest distance from the head to the neck of the instrument, in meters. */
  const MARGIN = 0.03;

  /** Notes on the lowest and the highest string of the cello and of the contrabass. */
  const FLOOR_FILE: TestFile = {
    tracks: [
      [tempo(0, 120), timeSignature(0, 4, 4)],
      track([programChange(0, 2, 42)], note(0, 2, 36, 900), note(960, 2, 81, 1860)),
      track([programChange(0, 3, 43)], note(0, 3, 28, 900), note(960, 3, 67, 1860)),
    ],
  };

  // The test poses each cellist and each bassist 240 times and measures the distance of two meshes
  // each time. It takes 1.9 s on an idle Mac, so a high load can pass the default limit of 5 s.
  it('keeps the head 0.03 m from the neck while the player plays, with each look', async () => {
    const scene = sceneOf(FLOOR_FILE);
    const looks = await demoLooks(['cello', 'contrabass']);
    for (const instrument of ['cello', 'contrabass'] as const) {
      const players = scene.layout.players.flatMap((place, index) =>
        place.cast.instrument === instrument ? [{ index, cast: place.cast }] : [],
      );
      // Each species of the section plays in the test file.
      expect(new Set(players.map((p) => p.cast.species))).toEqual(
        new Set(SECTION_SPECIES[instrument]),
      );
      for (const { index, cast } of players) {
        // The low string, then the high string, at the ends of the sway.
        const nearest = headClearance(
          scene,
          index,
          looks,
          [0.25, 0.75, 1.25, 1.75],
          posedNeck,
          MARGIN,
        );
        expect(nearest, `${cast.species} with the ${instrument}`).toBeGreaterThanOrEqual(MARGIN);
      }
    }
  });
});

/**
 * Gives the angle between the rotations of one bone in two poses.
 *
 * @param a The rotations of the first pose.
 * @param b The rotations of the second pose.
 * @param bone The bone index.
 * @returns The angle, in degrees.
 */
function turnBetween(a: Float32Array, b: Float32Array, bone: number): number {
  let dot = 0;
  for (let k = 0; k < 4; k++) {
    dot += (a[bone * 4 + k] ?? 0) * (b[bone * 4 + k] ?? 0);
  }
  return 2 * Math.acos(Math.min(1, Math.abs(dot))) * MathUtils.RAD2DEG;
}

describe('the bow hand in the lift (design 5.2, 5.3)', () => {
  it('turns the bow hand and the bow at most 1000° a second', async () => {
    // While the elbow turns to the back of the hand, the roll of the hand can snap near the line
    // of the stick: a snap can turn the hand of a violin 103,000° a second in the lift, and the
    // cello hand 7.5° in 2 ms. The limit finds such a snap, and also the turns of 1,333° to
    // 2,467° a second of a bad rest grip.
    const scene = await demoSceneOf('boulanger-matin.mid');
    const bones = [boneIndex('handR'), boneIndex('bow')];
    const step = 0.001;

    const fast: string[] = [];
    const seen = new Set<string>();
    for (const [index, { cast }] of scene.layout.players.entries()) {
      const player = scene.plan.players[index];
      const label = `${cast.species} ${cast.instrument} ${cast.seatIndex}`;
      if (!player || !(cast.instrument in BOWED_HOLDS) || seen.has(label)) {
        continue;
      }
      seen.add(label);
      const one: PosePlan = { ...scene.plan, players: [player] };
      let last = createScenePose(one);
      let next = createScenePose(one);
      poseAt(one, 0, 0, PLAYING, [], last);
      let worst = 0;
      for (let wall = step; wall < 2.5; wall += step) {
        poseAt(one, 0, wall, PLAYING, [], next);
        const a = last.players[0]?.rotations ?? new Float32Array(0);
        const b = next.players[0]?.rotations ?? new Float32Array(0);
        for (const bone of bones) {
          worst = Math.max(worst, turnBetween(a, b, bone) / step);
        }
        [last, next] = [next, last];
      }
      if (worst > 1000) {
        fast.push(`${label}: ${worst.toFixed(0)}° a second`);
      }
    }

    expect(seen.size).toBe(5);
    expect(fast).toEqual([]);
  });
});

describe('instrumentAt with a play turn (design 7.1)', () => {
  it('turns the instrument by the play turn of the hold, and keeps the stage hold', () => {
    const model = buildPlayer('fox-red', 'violin');
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -25 * MathUtils.DEG2RAD);
    const frames = {
      root: { rotation: new Quaternion(), position: new Vector3() },
      chest: {
        rotation: new Quaternion(),
        position: new Vector3(...(model.skeleton.positions[boneIndex('chest')] ?? [0, 0, 0])),
      },
    };
    const turned = bowedRig(model, 'violin', {
      ...BOWED_HOLDS.violin,
      playTurn: [turn.x, turn.y, turn.z, turn.w],
    });
    const { place } = createBowPlaces();
    expect(instrumentAt(turned, frames, 1, place).local.angleTo(turn)).toBeLessThan(1e-6);

    const stage = bowedRig(model, 'violin');
    expect(instrumentAt(stage, frames, 1, place).local.angleTo(new Quaternion())).toBeLessThan(
      1e-6,
    );
  });
});

describe('playingFrames (design 5.3)', () => {
  it('leans the chest forward around the spine joint by the lean of the hold', () => {
    const model = buildPlayer('fox-red', 'violin');
    const lean = 10 * MathUtils.DEG2RAD;
    const rig = bowedRig(model, 'violin', { ...BOWED_HOLDS.violin, lean });
    const { root, chest } = playingFrames(rig);
    const spine = new Vector3(...rig.spineBind);
    const bind = new Vector3(...rig.chestBind);

    expect(root.rotation.angleTo(new Quaternion())).toBeLessThan(1e-9);
    expect(chest.rotation.angleTo(new Quaternion())).toBeCloseTo(lean, 9);
    expect(chest.position.distanceTo(spine)).toBeCloseTo(bind.distanceTo(spine), 9);
    // The player faces -z, so a forward lean moves the chest joint to -z.
    expect(chest.position.z).toBeLessThan(bind.z - 0.01);
  });
});
