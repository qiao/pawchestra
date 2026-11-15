/**
 * Lists the arm segments and the helpers of one side for the tools that count the skin of an arm
 * (`ARM_SEGMENT_BONES` of `src/models/body-format.ts`, design 4.4, 4.7). A body with arm
 * segments holds the arm skin on them, and its upper arm, forearm, and forearm twist bones hold
 * none. A body with no arm segments has no vertex on them, so a tool can always add them to the
 * arm bones.
 */
import { ARM_SEGMENT_BONES } from '../src/models/body-format.ts';
import type { ArmSegmentBone, Side } from '../src/models/body-format.ts';

/**
 * Gives the arm segments and the helpers of one side. With `part`, it gives only the segments of
 * the upper arm and the elbow helper (`upper`), or the segments of the forearm and the wrist
 * helper (`fore`).
 *
 * @param side The side.
 * @param part The part of the arm, or none for both parts.
 * @returns The bones, from the shoulder out.
 */
export function sideSegmentBones(side: Side, part?: 'upper' | 'fore'): ArmSegmentBone[] {
  const ofPart = (bone: ArmSegmentBone): boolean =>
    part === undefined ||
    (part === 'upper'
      ? bone.startsWith('upper_arm_seg') || bone.startsWith('elbow_')
      : bone.startsWith('forearm_seg') || bone.startsWith('wrist_'));
  return ARM_SEGMENT_BONES.filter((bone) => bone.endsWith(`_${side}`) && ofPart(bone));
}
