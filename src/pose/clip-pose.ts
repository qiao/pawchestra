import { Quaternion } from 'three';

import { BONE_NAMES } from '../models/rig.ts';
import { BIND_ROTATIONS } from './frames.ts';
import type { WritablePose } from './pose-at.ts';
import type { PlayerClip } from './retarget.ts';

/** The two frames of a blend. Each call writes them before it reads them. */
const frameA = new Quaternion();
const frameB = new Quaternion();

/**
 * Makes a pose for {@link clipPoseAt} to write.
 *
 * @returns A pose in the bind pose.
 */
export function createClipPose(): WritablePose {
  return {
    rotations: BIND_ROTATIONS.slice(),
    rootOffset: [0, 0, 0],
    slideOffset: [0, 0, 0],
    instrumentOffset: [0, 0, 0],
    pawTurnL: null,
    pawKeepR: 0,
    blink: 0,
    keys: null,
  };
}

/**
 * Gives the duration of a clip.
 *
 * @param clip The clip.
 * @returns The time of its last frame, in seconds.
 */
export function clipDuration(clip: PlayerClip): number {
  return (clip.frames - 1) / clip.rate;
}

/**
 * Calculates the pose of a player at a time of a clip (design 4.4, 5.1): a spherical blend of the
 * rotations and a linear blend of the root offset of the two frames around the time. The pose
 * depends only on the clip and the time, so a seek or a pause needs no state. A time before the
 * start or after the end gives the first or the last frame. The eyes stay open, and the
 * instrument and the slide stay at their bind places.
 *
 * @param clip The clip on the player.
 * @param time The time in the clip, in seconds.
 * @param out The pose to write, from {@link createClipPose}.
 * @returns `out`.
 */
export function clipPoseAt(clip: PlayerClip, time: number, out: WritablePose): WritablePose {
  const at = Math.min(Math.max(time * clip.rate, 0), clip.frames - 1);
  const a = Math.floor(at);
  const b = Math.min(a + 1, clip.frames - 1);
  const t = at - a;
  const count = BONE_NAMES.length;
  for (let i = 0; i < count; i++) {
    frameA.fromArray(clip.rotations, (a * count + i) * 4);
    frameB.fromArray(clip.rotations, (b * count + i) * 4);
    frameA.slerp(frameB, t).toArray(out.rotations, i * 4);
  }
  for (let k = 0; k < 3; k++) {
    const from = clip.rootOffsets[a * 3 + k] ?? 0;
    out.rootOffset[k] = from + ((clip.rootOffsets[b * 3 + k] ?? 0) - from) * t;
  }
  out.slideOffset.fill(0);
  out.instrumentOffset.fill(0);
  out.pawTurnL = null;
  out.pawKeepR = 0;
  out.blink = 0;
  return out;
}
