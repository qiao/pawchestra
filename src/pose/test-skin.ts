import { Vector3 } from 'three';

import { BODY_BONES } from '../models/body-format.ts';
import {
  CLOSED_EYE_SCALE,
  createBodyPose,
  poseBodyBones,
  skinBodyMesh,
  bodyOffsets,
} from '../models/body-rig.ts';
import type { BodyRig } from '../models/body-rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { posePoint } from './frames.ts';
import type { PosedSkeleton } from './test-kinematics.ts';

/** The place of a corner on its main bone. Each call writes it before it reads it. */
const onMain = new Vector3();

/** The place of a corner on its second bone. Each call writes it before it reads it. */
const onBlend = new Vector3();

/** The posed corners of each posed skeleton of a body, made on the first read. */
const bodyCorners = new WeakMap<PosedSkeleton, Float32Array>();

/**
 * Poses all corners of the mesh of a player with a body as the GPU does (design 4.4): the
 * body with the skin of the body, and the instrument on the bones of the player.
 *
 * @param posed The posed skeleton.
 * @param rig The rig of the body of its model.
 * @returns x, y, z of each corner of the mesh data, in the model axes.
 */
function posedBodyCorners(posed: PosedSkeleton, rig: BodyRig): Float32Array {
  const known = bodyCorners.get(posed);
  if (known) {
    return known;
  }

  const { mesh, skeleton } = posed.model;
  const pose = poseBodyBones(
    rig,
    skeleton,
    posed.pose.rotations,
    bodyOffsets(posed.pose),
    Math.max(CLOSED_EYE_SCALE, 1 - posed.pose.blink),
    createBodyPose(),
  );
  const vertices = skinBodyMesh(rig.mesh, pose);
  const out = new Float32Array(mesh.positions.length);
  const m = pose.matrices;
  for (let c = 0; c < mesh.bones.length; c++) {
    if (c < rig.mesh.corners.length) {
      const v = rig.mesh.corners[c] ?? 0;
      out.set(vertices.subarray(v * 3, v * 3 + 3), c * 3);
      continue;
    }
    const w = mesh.blendWeights[c] ?? 0;
    const [x = 0, y = 0, z = 0] = mesh.positions.subarray(c * 3, c * 3 + 3);
    for (const [bone, weight] of [
      [mesh.bones[c] ?? 0, 1 - w],
      [mesh.blendBones[c] ?? 0, w],
    ] as const) {
      const b = (BODY_BONES.length + bone) * 16;
      for (let k = 0; k < 3; k++) {
        out[c * 3 + k] =
          (out[c * 3 + k] ?? 0) +
          weight *
            ((m[b + k] ?? 0) * x +
              (m[b + 4 + k] ?? 0) * y +
              (m[b + 8 + k] ?? 0) * z +
              (m[b + 12 + k] ?? 0));
      }
    }
  }
  bodyCorners.set(posed, out);
  return out;
}

/**
 * Moves a corner of the mesh of a posed player to its posed place with its two bones, as the
 * GPU skin does (design 4.4, 4.7): `(1 - w) × M(bone) p + w × M(blendBone) p`. The frames hold no
 * scale, so the helper ignores the blink of the eyes. A body takes the skin of the body
 * of up to four bones (`skinBodyMesh()`), with the blink. Only tests use this function, so it
 * does not enter the first download.
 *
 * @param posed The posed skeleton. Its model gives the mesh.
 * @param corner The index of the corner in the mesh data.
 * @returns The posed corner, in the model axes.
 * @throws Error if a bone of the corner has no frame.
 */
export function posedCorner(posed: PosedSkeleton, corner: number): Vec3 {
  const { mesh, skeleton, bodyRig } = posed.model;
  if (bodyRig) {
    const corners = posedBodyCorners(posed, bodyRig);
    return [corners[corner * 3] ?? 0, corners[corner * 3 + 1] ?? 0, corners[corner * 3 + 2] ?? 0];
  }
  const point: Vec3 = [
    mesh.positions[corner * 3] ?? 0,
    mesh.positions[corner * 3 + 1] ?? 0,
    mesh.positions[corner * 3 + 2] ?? 0,
  ];
  const bone = mesh.bones[corner] ?? 0;
  const blendBone = mesh.blendBones[corner] ?? bone;
  const weight = mesh.blendWeights[corner] ?? 0;
  const frame = posed.frames[bone];
  const blendFrame = posed.frames[blendBone];
  if (!frame || !blendFrame) {
    throw new Error(`The corner ${corner} follows a bone with no frame.`);
  }

  posePoint(frame, skeleton.positions[bone] ?? [0, 0, 0], point, onMain);
  posePoint(blendFrame, skeleton.positions[blendBone] ?? [0, 0, 0], point, onBlend);
  return toVec3(onMain.multiplyScalar(1 - weight).addScaledVector(onBlend, weight));
}
