import { MeshBasicMaterial, MeshNormalMaterial } from 'three';
import type { SkinnedMesh } from 'three';

import type { PlayerModel } from '../models/player.ts';
import type { GalleryProbe } from './items.ts';

/**
 * Applies a probe of the query `probe` to the body of a player (design 7.1). The probe `colors`
 * draws the body with its face colors and no light, and `normals` draws its normals as colors.
 * Both keep the instrument as it is: the triangles of a body come first in the mesh
 * (`bodyRenderMesh()`), so a group of these triangles takes the probe material. A body with no
 * body rig takes the probe material on its whole mesh. The probe `noshadow` lets no shadow fall
 * on the mesh. Thus a dark area of a close view shows its cause: a dark face color, a turned
 * normal, or a shadow.
 *
 * @param mesh The mesh of the player, with its own geometry.
 * @param model The model of the player.
 * @param probe The probe.
 */
export function applyProbe(mesh: SkinnedMesh, model: PlayerModel, probe: GalleryProbe): void {
  if (probe === 'noshadow') {
    mesh.receiveShadow = false;
    return;
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material =
    probe === 'colors'
      ? new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      : new MeshNormalMaterial();
  const { geometry } = mesh;
  const corners = geometry.index?.count ?? geometry.getAttribute('position').count;
  const body = Math.min(corners, model.bodyRig.mesh.corners.length);
  geometry.clearGroups();
  geometry.addGroup(0, body, materials.length);
  if (body < corners) {
    geometry.addGroup(body, corners - body, 0);
  }
  mesh.material = [...materials, material];
}
