import { Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';

/**
 * The share of the corners of a part that lie within the girth of the part ({@link wristGirth},
 * {@link palmDepth}), so that a single far corner, such as the tip of a claw, does not count.
 */
const GIRTH_SHARE = 0.9;

/** The part of the forearm near the wrist that {@link wristGirth} measures, from the elbow. */
const WRIST_PART = 0.8;

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
 * Gives the girth of the wrist end of a forearm in the bind pose (design 5.3, "Grip clearance
 * from the girth"): the distance of the corners of the forearm from the line from the elbow to
 * the wrist, over the last part of the forearm, within which {@link GIRTH_SHARE} of the corners
 * lie. A round forearm of a rebuilt arm has a large girth, and a thin forearm a small one.
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
    if (bones[c] !== forearm) {
      continue;
    }
    point.fromArray(positions, c * 3).sub(elbow);
    const along = point.dot(axis);
    if (along >= WRIST_PART * length && along <= length) {
      distances.push(point.addScaledVector(axis, -along).length());
    }
  }
  return shareOf(distances, GIRTH_SHARE);
}

/**
 * Gives the depth of the palm of a paw in the bind pose (design 5.3, "Grip clearance from the
 * girth"): the distance of the corners of the paw and the claws on the side of the palm from the
 * wrist joint, along the normal of the palm, within which {@link GIRTH_SHARE} of these corners
 * lie. The palm of each bind hand faces the body: +x for the left hand, -x for the right hand.
 * The grip of a bowed string puts the finger block on the line of the wrist joint, so a deep palm
 * lies further into the neck.
 *
 * @param model The player model.
 * @param side The arm.
 * @returns The depth, in meters.
 */
export function palmDepth(model: PlayerModel, side: 'L' | 'R'): number {
  const toPalm = side === 'L' ? 1 : -1;
  const wrist = model.skeleton.positions[boneIndex(`hand${side}`)]?.[0] ?? 0;
  const paw = new Set([boneIndex(`hand${side}`), boneIndex(`fingers${side}`)]);
  const { positions, bones } = model.mesh;
  const depths: number[] = [];
  for (let c = 0; c < bones.length; c++) {
    const depth = toPalm * ((positions[c * 3] ?? 0) - wrist);
    if (paw.has(bones[c] ?? -1) && depth > 0) {
      depths.push(depth);
    }
  }
  return shareOf(depths, GIRTH_SHARE);
}
