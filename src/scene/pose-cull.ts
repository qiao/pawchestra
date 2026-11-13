import { Sphere } from 'three';
import type { Frustum, SkinnedMesh } from 'three';

import { bindSphere } from './bounds.ts';
import type { BoneSpheres } from './bounds.ts';

/**
 * The cull of the poses (design 9.7): the stage poses only the players that a frame can draw. A
 * player outside the view of the camera and outside the view of the key shadow draws no pixel
 * and casts no shadow on a pixel, so the frame skips its pose and its bone matrices.
 */
export const POSE_CULL = {
  /**
   * The margin of the sphere of a player over its bind sphere, in meters. Over each demo and
   * `perf-60.mid`, in play, rest, lift, lowering, and the end bow, the fitted pose sphere went at
   * most 0.39 m past the bind sphere (the bow of the conductor), and 0.23 m for a player. The
   * margin is about two times that value.
   */
  margin: 0.8,
} as const;

/** The spheres of the players of a layout, and the players that the current frame needs. */
export interface PoseCull {
  /**
   * The sphere of each player mesh, in world axes, which holds the player in each pose, or `null`
   * for a mesh with no bone spheres, which the cull always keeps.
   */
  readonly spheres: readonly (Sphere | null)[];
  /** One flag for each player mesh: 1 when the frame needs its pose, else 0. */
  readonly needed: Uint8Array;
}

/**
 * Creates the cull of the poses of the players of a layout. Each sphere is the bind sphere of the
 * mesh (`bindSphere()`) plus {@link POSE_CULL}.margin, at the place of the mesh on the stage.
 *
 * @param meshes The player meshes, at their places, with their world matrices.
 * @param culled The bone spheres of each mesh that has them.
 * @returns The cull, with all players needed.
 */
export function createPoseCull(
  meshes: readonly SkinnedMesh[],
  culled: ReadonlyMap<SkinnedMesh, BoneSpheres>,
): PoseCull {
  const spheres = meshes.map((mesh) => {
    const bones = culled.get(mesh);
    if (!bones) {
      return null;
    }
    const sphere = bindSphere(bones, new Sphere()).applyMatrix4(mesh.matrixWorld);
    sphere.radius += POSE_CULL.margin;
    return sphere;
  });
  return { spheres, needed: new Uint8Array(meshes.length).fill(1) };
}

/**
 * Marks the players that a frame needs: each player whose sphere meets one of the views.
 *
 * @param cull The cull. Its flags change.
 * @param views The view of the camera, and the view of the key shadow when it casts a shadow.
 */
export function markNeeded(cull: PoseCull, views: readonly Frustum[]): void {
  const { spheres, needed } = cull;
  for (let i = 0; i < needed.length; i++) {
    const sphere = spheres[i];
    needed[i] = !sphere || views.some((view) => view.intersectsSphere(sphere)) ? 1 : 0;
  }
}
