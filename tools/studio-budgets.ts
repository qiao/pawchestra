import { gzipSync } from 'node:zlib';

/**
 * The most triangles of a studio body (design 4.4, 4.5), the value of `STUDIO_BODY_BUDGET` in
 * `src/models/budget.test.ts`. `pnpm rig-mesh --check` stops above it.
 */
export const STUDIO_TRIANGLE_BUDGET = 6200;

/**
 * The largest gzip size of the packed mesh of one studio body, in bytes (design 7.2). Each studio
 * body of `STUDIO_BODIES` is in the first download, so its mesh counts against the limit of 1 MB.
 * The budget keeps room above the largest body, the rhino with a round shoulder and a round tube
 * for each arm.
 */
export const STUDIO_MESH_GZIP_BUDGET = 34_000;

/**
 * Gives the gzip size of a text, with the default level of Node zlib, as `pnpm size` measures the
 * first download (design 7.2).
 *
 * @param text The text, such as the packed mesh of a studio body.
 * @returns The size after gzip, in bytes.
 */
export function gzipSize(text: string): number {
  return gzipSync(text).byteLength;
}
