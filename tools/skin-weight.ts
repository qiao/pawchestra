/**
 * Sums the skin weights of a vertex of a studio mesh on some bones, for the tools that measure the
 * skin of a body (`arm-check`, `arm-shape`, and `body-shape`).
 */
import type { StudioMesh } from '../src/models/studio-format.ts';

/**
 * Gives the weight of a vertex on some bones.
 *
 * @param mesh The skin.
 * @param v The vertex.
 * @param bones The indices of the bones.
 * @returns The sum of the weights of the vertex on the bones.
 */
export function weightOn(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  v: number,
  bones: ReadonlySet<number> | readonly number[],
): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const joint = mesh.joints[v * 4 + k] ?? -1;
    if ('has' in bones ? bones.has(joint) : bones.includes(joint)) {
      sum += mesh.weights[v * 4 + k] ?? 0;
    }
  }
  return sum;
}
