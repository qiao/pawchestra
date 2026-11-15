import { describe, expect, it } from 'vitest';

import { Vector3 } from 'three';

import { note, programChange, tempo, timeSignature, track } from '../midi/test-smf.ts';
import type { TestFile } from '../midi/test-smf.ts';
import { BOW } from '../models/instruments/strings.ts';
import type { PlayerModel } from '../models/player.ts';
import type { BoneName } from '../models/rig.ts';
import { createScenePose, poseAt } from './pose-at.ts';
import type { PosePlan } from './plan.ts';
import { posedPart, signedDistance } from './test-clearance.ts';
import type { PosedPart } from './test-clearance.ts';
import { posedPiecePoint, poseSkeleton } from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { PLAYING, demoSceneOf, sceneOf } from './test-scene.ts';
import type { TestScene } from './test-scene.ts';

/** Four quarter notes at 120 BPM for each bowed section. */
const STRINGS: TestFile = {
  tracks: [
    [tempo(0, 120), timeSignature(0, 4, 4)],
    ...[40, 41, 42, 43].map((program, channel) =>
      track(
        [programChange(0, channel, program)],
        ...[0, 1, 2, 3].map((i) =>
          note(i * 480, channel, 48 + 7 * i - 12 * Math.floor(channel / 2)),
        ),
      ),
    ),
  ],
};

/** The bowed strings of design 4.6. */
const BOWED = new Set(['violin', 'viola', 'cello', 'contrabass']);

/** The parts of the right arm that the bow must not enter. */
const ARM_PARTS = ['handR', 'fingersR', 'forearmR', 'upperArmR'] as const;

/** The number of points on each line of the bow. */
const LINE_POINTS = 60;

/** The stick and the hair of the bow, as lines in the axes of the bow piece. */
interface BowLines {
  readonly stick: readonly [Vector3, Vector3];
  readonly hair: readonly [Vector3, Vector3];
}

/**
 * Gives the stick and the hair of the bow of a player, from its target `bow-hair`. The hair lies
 * `BOW.hairGap` below the stick, at the scale of the bow (design 4.6).
 *
 * @param model The player model.
 * @returns The lines in the axes of the bow piece.
 */
function bowLines(model: PlayerModel): BowLines {
  const hair = model.instrument.targets.find((t) => t.kind === 'bow-hair');
  if (!hair) {
    throw new Error(`The ${model.instrument.id} has no bow hair.`);
  }
  const size = -hair.from[1] / BOW.hairGap;
  return {
    stick: [new Vector3(-BOW.grip * size, 0, 0), new Vector3((BOW.length - BOW.grip) * size, 0, 0)],
    hair: [new Vector3(...hair.from), new Vector3(...hair.to)],
  };
}

/** The deepest point of the bow in a part of the arm. */
interface Depth {
  /** The depth in the part, in head heights. 0 if the bow stays out. */
  readonly depth: number;
  readonly part: BoneName;
}

/**
 * Measures how deep the stick and the hair of a posed bow go into the right arm.
 *
 * @param posed The posed skeleton of a bowed string player.
 * @param lines The stick and the hair.
 * @param parts The posed parts of the arm, from {@link ARM_PARTS}.
 * @returns The deepest point.
 */
function bowDepth(
  posed: PosedSkeleton,
  lines: BowLines,
  parts: readonly (readonly [BoneName, PosedPart])[],
): Depth {
  let deepest: Depth = { depth: 0, part: 'handR' };
  const h = posed.model.body.headHeight;
  for (const [from, to] of [lines.stick, lines.hair]) {
    const a = new Vector3(...posedPiecePoint(posed, { bone: 'bow', at: [from.x, from.y, from.z] }));
    const b = new Vector3(...posedPiecePoint(posed, { bone: 'bow', at: [to.x, to.y, to.z] }));
    for (let k = 0; k <= LINE_POINTS; k++) {
      const point = a.clone().lerp(b, k / LINE_POINTS);
      for (const [bone, part] of parts) {
        if (!part.box.containsPoint(point)) {
          continue;
        }
        const depth = -signedDistance(part, point) / h;
        if (depth > deepest.depth) {
          deepest = { depth, part: bone };
        }
      }
    }
  }
  return deepest;
}

/** One bowed player of a scene of each species and instrument. */
interface BowedPlayer {
  readonly index: number;
  readonly label: string;
  readonly model: PlayerModel;
}

function bowedPlayers(scene: TestScene): BowedPlayer[] {
  const players = new Map<string, BowedPlayer>();
  for (const [index, { cast }] of scene.layout.players.entries()) {
    const label = `${cast.species} ${cast.instrument}`;
    if (BOWED.has(cast.instrument) && !players.has(label)) {
      const model = scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support);
      players.set(label, { index, label, model });
    }
  }
  return [...players.values()];
}

describe('the bow in the right hand (design 4.6, 5.3)', () => {
  it('keeps the stick and the hair out of the hand and the arm over a full demo', async () => {
    // With a grip in the palm ball, the frog end of the stick goes 0.13 H into the forearm of the
    // dog.
    const scene = await demoSceneOf('boulanger-matin.mid');
    const players = bowedPlayers(scene);
    expect(players.map((p) => p.label).toSorted()).toEqual([
      'cat viola',
      'dog cello',
      'fox-red violin',
      'hippo contrabass',
      'rabbit violin',
    ]);
    // The paw of the rabbit closes around its small bow, so the stick and the hair go
    // into the skin of the paw. The sweep of the violinist keeps the bow out of the body and the
    // violin (`pose/test-sweep-roles.ts`).
    for (const player of players.filter((p) => !p.model.bodyRig)) {
      const plan = scene.plan.players[player.index];
      if (!plan) {
        throw new Error('The player has no plan.');
      }
      const one: PosePlan = { ...scene.plan, players: [plan] };
      const buffer = createScenePose(one);
      const lines = bowLines(player.model);
      let deepest: Depth & { time: number } = { depth: 0, part: 'handR', time: 0 };
      // A step of 0.25 s keeps the file at about a third of the 32 s of a step of 0.1 s. The fault
      // of this test was a grip that put the frog into the forearm at each stroke.
      for (let time = 0; time < scene.score.durationSec; time += 0.25) {
        const pose = poseAt(one, time, 10, PLAYING, [], buffer).players[0];
        if (!pose) {
          throw new Error('The player has no pose.');
        }
        const posed = poseSkeleton(player.model, pose);
        const parts = ARM_PARTS.map((bone) => [bone, posedPart(posed, [bone])] as const);
        const depth = bowDepth(posed, lines, parts);
        if (depth.depth > deepest.depth) {
          deepest = { ...depth, time };
        }
      }
      expect(
        deepest.depth,
        `${player.label}: ${deepest.part} at ${deepest.time.toFixed(1)} s`,
      ).toBeLessThan(0.001);
    }
  });

  it('lays the stick in the fingers, against the palm and the finger block', () => {
    // A small file: each bowed section plays four quarter notes. The band of the gap fits the
    // mitten of the parametric biped and the stick of the bow of the app. The rabbit is not
    // here: its bow is smaller (`violinScale` of its species), and its paw has the skin of a
    // body.
    const scene = sceneOf(STRINGS);
    const parametric = bowedPlayers(scene).filter((player) => !player.model.bodyRig);
    expect(parametric.length).toBeGreaterThan(2);
    for (const player of parametric) {
      const pose = poseAt(scene.plan, 1.2, 10, PLAYING, []).players[player.index];
      if (!pose) {
        throw new Error('The player has no pose.');
      }
      const posed = poseSkeleton(player.model, pose);
      const grip = new Vector3(...posedPiecePoint(posed, { bone: 'bow', at: [0, 0, 0] }));
      const h = player.model.body.headHeight;
      for (const bone of ['handR', 'fingersR'] as const) {
        const gap = signedDistance(posedPart(posed, [bone]), grip) / h;
        // The stick is 0.012 H to 0.015 H thick from its middle line to a corner.
        expect(gap, `${player.label} ${bone}`).toBeGreaterThan(0.015);
        expect(gap, `${player.label} ${bone}`).toBeLessThan(0.03);
      }
    }
  });
});
