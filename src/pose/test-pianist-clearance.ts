import { expect } from 'vitest';

import { Box3, Triangle, Vector3 } from 'three';
import type { PlayerModel } from '../models/player.ts';
import { buildSupport } from '../models/props.ts';
import type { BoneName } from '../models/rig.ts';
import { partDistance, posedPart } from './test-clearance.ts';
import type { PosedPart } from './test-clearance.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { describeRoleClearance } from './test-role-clearance.ts';
import type { RoleChecks } from './test-role-clearance.ts';
import { PIANIST_SWEEP, pianoCase } from './test-sweep-roles.ts';
import type { SweepSample } from './test-sweep.ts';

/** The smallest gap from the trunk, the head, and the legs to the case of the piano, in meters. */
const PIANIST_GAP = 0.01;

/** The trunk, the head, and the legs, which must not come near the case. */
const BODY = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'jaw',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
] as const satisfies readonly BoneName[];

/** The paws with their claws, which must not touch the bench. */
const PAWS = ['handL', 'fingersL', 'handR', 'fingersR'] as const satisfies readonly BoneName[];

/**
 * Gives the triangles of the bench of a pianist in its model axes.
 *
 * @param model The model of the pianist.
 * @returns The bench.
 * @throws Error if the pianist has no seat.
 */
function benchOf(model: PlayerModel): PosedPart {
  const mesh = buildSupport(model.support, model.seat);
  if (!mesh) {
    throw new Error('The pianist has no bench.');
  }
  const triangles: Triangle[] = [];
  const box = new Box3();
  for (let v = 0; v < mesh.positions.length / 3; v += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromArray(mesh.positions, (v + k) * 3));
    if (a && b && c) {
      triangles.push(new Triangle(a, b, c));
      box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
  }
  return { triangles, box };
}

/** The worst sample of one measure, with its label. */
interface Worst {
  /** The value, in meters. */
  readonly value: number;
  /** The song time and the wall time of the sample. */
  readonly label: string;
}

/**
 * Gives the checks of the pianist beside the sweep (design 5.3): the paws stay off the bench,
 * and the trunk, the head, and the legs keep {@link PIANIST_GAP} from the case of the piano.
 *
 * @param model The model of the pianist.
 * @param set The name of the set of samples.
 * @returns The checks.
 */
function pianistChecks(model: PlayerModel, set: string): RoleChecks {
  const benchPart = benchOf(model);
  let toBench: Worst = { value: PIANIST_GAP, label: 'none' };
  let bodyToCase: Worst = { value: PIANIST_GAP, label: 'none' };
  return {
    visit: (posed: PosedSkeleton, [song, wall]: SweepSample) => {
      const label = `song ${song.toFixed(2)} s, wall ${wall.toFixed(2)} s`;
      const bench = partDistance(posedPart(posed, PAWS), benchPart, PIANIST_GAP);
      if (bench < toBench.value) {
        toBench = { value: bench, label };
      }
      const body = posedPart(posed, BODY);
      const gap = Math.min(
        PIANIST_GAP,
        ...pianoCase(posed).shells.map((shell) => partDistance(body, shell, PIANIST_GAP)),
      );
      if (gap < bodyToCase.value) {
        bodyToCase = { value: gap, label };
      }
    },
    check: () => {
      expect.soft(toBench.value, `${set}: paws at the bench, ${toBench.label}`).toBeGreaterThan(0);
      expect
        .soft(bodyToCase.value, `${set}: body at the case, ${bodyToCase.label}`)
        .toBeGreaterThanOrEqual(PIANIST_GAP);
    },
  };
}

/**
 * The number of shard files of the test of the pianist clearance
 * (`pianist-clearance-<shard>.test.ts`, design 9.3). The skin of the polar bear takes
 * about 10 s for each demo, so each shard holds one of the two demos with a piano.
 */
export const PIANIST_CLEARANCE_SHARDS = 2;

/**
 * Registers the tests of the clearance of the pianist in the demos of one shard (design 4.4,
 * 5.3): the sweep of {@link PIANIST_SWEEP} in a full play, the lift of the paws, and the rest
 * pose, with the checks of the bench and the case. The shard takes its demos from the patched
 * demos with a piano seat.
 *
 * @param shard The shard, from 1 to {@link PIANIST_CLEARANCE_SHARDS}.
 */
export function describePianistClearanceShard(shard: number): void {
  describeRoleClearance(PIANIST_SWEEP, shard, PIANIST_CLEARANCE_SHARDS, (_, player, set) =>
    pianistChecks(player.model, set),
  );
}
