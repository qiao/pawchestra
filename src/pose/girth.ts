import { Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';

/**
 * The share of the corners of a paw that lie within its girth ({@link pawGirth}), so that a
 * single far corner, such as the tip of a claw, does not count.
 */
const GIRTH_SHARE = 0.9;

/**
 * Gives a value of a list at a share of its sorted values.
 *
 * @param values The values.
 * @param share The share, from 0 to 1.
 * @returns The value, or 0 for an empty list.
 */
function shareOf(values: readonly number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

/**
 * Gives the girth of a paw in the bind pose (design 5.3, "Grip clearance from the girth"): the
 * distance of the corners of the paw and the claws from the line from the elbow to the wrist,
 * within which {@link GIRTH_SHARE} of these corners lie. A thick paw on a neck lies further into
 * the neck on each side.
 *
 * @param model The player model.
 * @param side The arm.
 * @returns The girth, in meters.
 */
export function pawGirth(model: PlayerModel, side: 'L' | 'R'): number {
  const at = (bone: 'forearm' | 'hand'): Vector3 =>
    new Vector3(...(model.skeleton.positions[boneIndex(`${bone}${side}`)] ?? [0, 0, 0]));
  const wrist = at('hand');
  const axis = wrist.clone().sub(at('forearm')).normalize();

  const paw = new Set([boneIndex(`hand${side}`), boneIndex(`fingers${side}`)]);
  const { positions, bones } = model.mesh;
  const point = new Vector3();
  const distances: number[] = [];
  for (let c = 0; c < bones.length; c++) {
    if (paw.has(bones[c] ?? -1)) {
      point.fromArray(positions, c * 3).sub(wrist);
      distances.push(point.addScaledVector(axis, -point.dot(axis)).length());
    }
  }
  return shareOf(distances, GIRTH_SHARE);
}

/**
 * The start of the wrist end of a forearm, as a share of the way from the elbow to the wrist
 * ({@link wristGirth}).
 */
const WRIST_END = 0.8;

/**
 * Gives the girth of the wrist end of a forearm in the bind pose (design 5.3, "Wrist clearance
 * from the girth"): the distance of the corners of the forearm from the line from the elbow to
 * the wrist, from {@link WRIST_END} of the way to the wrist, within which {@link GIRTH_SHARE} of
 * these corners lie. A thick wrist end lies further out from the line on each side.
 *
 * @param model The player model.
 * @param side The arm.
 * @returns The girth, in meters.
 */
export function wristGirth(model: PlayerModel, side: 'L' | 'R'): number {
  const at = (bone: 'forearm' | 'hand'): Vector3 =>
    new Vector3(...(model.skeleton.positions[boneIndex(`${bone}${side}`)] ?? [0, 0, 0]));
  const elbow = at('forearm');
  const axis = at('hand').sub(elbow);
  const length = axis.length();
  axis.normalize();

  const forearm = boneIndex(`forearm${side}`);
  const { positions, bones } = model.mesh;
  const point = new Vector3();
  const distances: number[] = [];
  for (let c = 0; c < bones.length; c++) {
    if (bones[c] === forearm) {
      point.fromArray(positions, c * 3).sub(elbow);
      const along = point.dot(axis);
      if (along >= WRIST_END * length) {
        distances.push(point.addScaledVector(axis, -along).length());
      }
    }
  }
  return shareOf(distances, GIRTH_SHARE);
}
