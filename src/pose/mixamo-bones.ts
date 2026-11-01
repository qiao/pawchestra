import type { BoneName } from '../models/rig.ts';

/**
 * The bone of the player that each bone of a Mixamo skeleton drives, or `null` for a bone that
 * drives none (design 4.4, 4.7). The names have no `mixamorig:` prefix. The left side of Mixamo
 * is the left side of the character, as the `L` bones of the player.
 *
 * - **Trunk.** The player has fewer trunk bones. `Spine` and `Spine1` drive `spine`, and `Spine2`
 *   drives `chest`. Of several bones that drive one bone, the last bone of the chain gives the
 *   world turn ({@link mixamoDrivers}), so `spine` takes the turn of `Spine1`, which holds the
 *   bend of `Spine`, and `chest` carries the arms and the neck as `Spine2` does.
 * - **Forearm roll.** Mixamo has no twist bone, and the hand turns with the roll of the forearm.
 *   The player hand takes the world turn of the hand, so the roll reaches the twist bone of the
 *   studio (`TWIST_SHARE` of `models/studio-rig.ts`).
 * - **Fingers.** The bones of the four long fingers give one curl of the `fingers` block. The
 *   thumb and the end bones (`*4`, `*_End`) drive no bone.
 * - **Feet.** `ToeBase` drives no bone: the foot of the player is one block.
 */
export const MIXAMO_BONES = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'spine',
  Spine2: 'chest',
  Neck: 'neck',
  Head: 'head',
  HeadTop_End: null,
  LeftShoulder: 'shoulderL',
  LeftArm: 'upperArmL',
  LeftForeArm: 'forearmL',
  LeftHand: 'handL',
  LeftHandThumb1: null,
  LeftHandThumb2: null,
  LeftHandThumb3: null,
  LeftHandThumb4: null,
  LeftHandIndex1: 'fingersL',
  LeftHandIndex2: 'fingersL',
  LeftHandIndex3: 'fingersL',
  LeftHandIndex4: null,
  LeftHandMiddle1: 'fingersL',
  LeftHandMiddle2: 'fingersL',
  LeftHandMiddle3: 'fingersL',
  LeftHandMiddle4: null,
  LeftHandRing1: 'fingersL',
  LeftHandRing2: 'fingersL',
  LeftHandRing3: 'fingersL',
  LeftHandRing4: null,
  LeftHandPinky1: 'fingersL',
  LeftHandPinky2: 'fingersL',
  LeftHandPinky3: 'fingersL',
  LeftHandPinky4: null,
  RightShoulder: 'shoulderR',
  RightArm: 'upperArmR',
  RightForeArm: 'forearmR',
  RightHand: 'handR',
  RightHandThumb1: null,
  RightHandThumb2: null,
  RightHandThumb3: null,
  RightHandThumb4: null,
  RightHandIndex1: 'fingersR',
  RightHandIndex2: 'fingersR',
  RightHandIndex3: 'fingersR',
  RightHandIndex4: null,
  RightHandMiddle1: 'fingersR',
  RightHandMiddle2: 'fingersR',
  RightHandMiddle3: 'fingersR',
  RightHandMiddle4: null,
  RightHandRing1: 'fingersR',
  RightHandRing2: 'fingersR',
  RightHandRing3: 'fingersR',
  RightHandRing4: null,
  RightHandPinky1: 'fingersR',
  RightHandPinky2: 'fingersR',
  RightHandPinky3: 'fingersR',
  RightHandPinky4: null,
  LeftUpLeg: 'thighL',
  LeftLeg: 'shinL',
  LeftFoot: 'footL',
  LeftToeBase: null,
  LeftToe_End: null,
  RightUpLeg: 'thighR',
  RightLeg: 'shinR',
  RightFoot: 'footR',
  RightToeBase: null,
  RightToe_End: null,
} as const satisfies Readonly<Record<string, BoneName | null>>;

/** The name of a bone of a Mixamo skeleton, with no prefix. */
export type MixamoBone = keyof typeof MIXAMO_BONES;

/**
 * Tells whether a name is the name of a Mixamo bone.
 *
 * @param name The name, with no prefix.
 * @returns True for a bone of {@link MIXAMO_BONES}.
 */
export function isMixamoBone(name: string): name is MixamoBone {
  return Object.hasOwn(MIXAMO_BONES, name);
}

/**
 * Gives the bone of a source skeleton that gives the world turn of each bone of the player: the
 * last bone in the order of the skeleton, with its parents first, that maps to it in
 * {@link MIXAMO_BONES}. The fingers take a curl in place of a turn, so they get no driver.
 *
 * @param names The names of the bones of the source skeleton, each parent before its children.
 * @returns The index of the source bone for each bone of the player that has one.
 */
export function mixamoDrivers(names: readonly string[]): Map<BoneName, number> {
  const drivers = new Map<BoneName, number>();
  for (const [i, name] of names.entries()) {
    const bone = isMixamoBone(name) ? MIXAMO_BONES[name] : null;
    if (bone && bone !== 'fingersL' && bone !== 'fingersR') {
      drivers.set(bone, i);
    }
  }
  return drivers;
}
