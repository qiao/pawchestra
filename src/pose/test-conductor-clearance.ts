import { expect } from 'vitest';

import { Box3, Triangle, Vector3 } from 'three';
import { conductorOn } from '../models/layout-scene.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import { buildPodium } from '../models/stage.ts';
import { partDistance } from './test-clearance.ts';
import type { PosedPart } from './test-clearance.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { describeRoleClearance } from './test-role-clearance.ts';
import type { RoleChecks } from './test-role-clearance.ts';
import { posedCorner } from './test-skin.ts';
import { CONDUCTOR_SWEEP } from './test-sweep-roles.ts';
import type { SweepSample } from './test-sweep.ts';

/** The smallest gap from the bear to the conductor stand, in meters. */
const GAP = 0.02;

/**
 * Gives the conductor stand in the model axes of the bear: the triangles of the podium mesh above
 * the podium top, which are the post, the desk, and the open score. The bear stands on the podium
 * top at the podium center, and faces the orchestra with no turn (design 4.5).
 *
 * @returns The stand.
 */
function standOf(): PosedPart {
  const place = conductorOn([0, 0, 0]);
  expect(place.facing).toBe(0);
  const from = new Vector3(...place.position);
  const mesh = buildPodium();
  const triangles: Triangle[] = [];
  const box = new Box3();
  for (let v = 0; v < mesh.positions.length / 3; v += 3) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new Vector3().fromArray(mesh.positions, (v + k) * 3).sub(from),
    );
    if (!a || !b || !c || Math.max(a.y, b.y, c.y) < 0.05) {
      continue;
    }
    triangles.push(new Triangle(a, b, c));
    box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  return { triangles, box };
}

/** The nearest sample of a gap, up to {@link GAP}. */
interface Nearest {
  /** The gap, in meters. */
  readonly gap: number;
  /** The song time and the wall time of the sample. */
  readonly label: string;
}

/** The left forearm and hand, which move between the cues (design 5.4). */
const LEFT_HAND = ['forearmL', 'handL', 'fingersL'] as const satisfies readonly BoneName[];

/**
 * The parts that the left hand must not come near when the arms lift and lower: the head and the
 * right forearm, hand, and baton. The hanging arm of the rest pose (5.2) touches the side of the
 * round body, and the sweep measures its depth in the body.
 */
const MOVING_AVOID = [
  'head',
  'jaw',
  'neck',
  'forearmR',
  'handR',
  'fingersR',
  'baton',
] as const satisfies readonly BoneName[];

/**
 * Gives the posed triangles of some groups of bones in one pass over the mesh. Each triangle
 * belongs to the bone of its first corner (design 4.4), as in `posedPart()` of
 * `test-clearance.ts`, and each corner takes the skin of the GPU (`posedCorner()`): two bones of
 * the player, or the skin of the body for a body.
 *
 * @param posed The posed skeleton.
 * @param groups The groups of bones.
 * @returns One part for each group.
 */
function posedParts(posed: PosedSkeleton, groups: readonly (readonly BoneName[])[]): PosedPart[] {
  const sets = groups.map((bones) => new Set(bones.map(boneIndex)));
  const parts = groups.map(() => ({ triangles: new Array<Triangle>(), box: new Box3() }));
  const { bones } = posed.model.mesh;
  for (let v = 0; v < bones.length; v += 3) {
    const bone = bones[v] ?? 0;
    const owners = parts.filter((_, g) => sets[g]?.has(bone));
    if (owners.length === 0) {
      continue;
    }
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3(...posedCorner(posed, v + k)));
    if (!a || !b || !c) {
      continue;
    }
    const triangle = new Triangle(a, b, c);
    for (const part of owners) {
      part.triangles.push(triangle);
      part.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
  }
  return parts;
}

/**
 * Gives the checks of the conductor beside the sweep (design 4.5, 5.4): in each set, the bear
 * keeps {@link GAP} from its stand. When the arms lift and lower, the left hand also keeps
 * {@link GAP} from the head and from the right forearm, hand, and baton. The check of the left
 * hand against the head in a play stays out, because a rigged bear fails it.
 *
 * @param stand The stand.
 * @param set The name of the set of samples.
 * @returns The checks.
 */
function conductorChecks(stand: PosedPart, set: string): RoleChecks {
  const moving = set === 'arms';
  let toStand: Nearest = { gap: GAP, label: 'none' };
  let leftHand: Nearest = { gap: GAP, label: 'none' };
  return {
    visit: (posed: PosedSkeleton, [song, wall]: SweepSample) => {
      const label = `song ${song.toFixed(2)} s, wall ${wall.toFixed(2)} s`;
      // Each bone to avoid is its own part, so that its tight box skips most triangles.
      const [all, hand, ...others] = posedParts(posed, [
        BONE_NAMES,
        LEFT_HAND,
        ...(moving ? MOVING_AVOID.map((bone) => [bone]) : []),
      ]);
      if (!all || !hand) {
        throw new Error('The bear has its parts.');
      }
      const gap = partDistance(all, stand, GAP);
      if (gap < toStand.gap) {
        toStand = { gap, label };
      }
      const free = Math.min(GAP, ...others.map((other) => partDistance(hand, other, GAP)));
      if (free < leftHand.gap) {
        leftHand = { gap: free, label };
      }
    },
    check: () => {
      expect.soft(toStand.gap, `${set}: stand, ${toStand.label}`).toBeGreaterThanOrEqual(GAP);
      expect.soft(leftHand.gap, `${set}: left hand, ${leftHand.label}`).toBeGreaterThanOrEqual(GAP);
    },
  };
}

/**
 * The number of shard files of the test of the conductor clearance
 * (`conductor-clearance-<shard>.test.ts`, design 9.3). The skin of the bear takes more
 * time than the rigid parts, so each shard holds one demo, and no file takes more than about 10 s.
 */
export const CONDUCTOR_CLEARANCE_SHARDS = 6;

/**
 * Registers the tests of the clearance of the conductor in the demos of one shard (design 4.5,
 * 5.4): the sweep of {@link CONDUCTOR_SWEEP} in a full play and in the lift, the bow, and the
 * lowering of the arms, with the checks of the stand and the left hand. A demo with no conductor
 * has no test.
 *
 * @param shard The shard, from 1 to {@link CONDUCTOR_CLEARANCE_SHARDS}.
 */
export function describeConductorClearanceShard(shard: number): void {
  let stand: PosedPart | null = null;
  describeRoleClearance(CONDUCTOR_SWEEP, shard, CONDUCTOR_CLEARANCE_SHARDS, (_, __, set) => {
    stand ??= standOf();
    return conductorChecks(stand, set);
  });
}
