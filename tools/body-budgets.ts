import { gzipSync } from 'node:zlib';

/**
 * The most triangles of a body (design 4.4, 4.5). `src/models/budget.test.ts` reads it, and
 * `pnpm rig-mesh --check` stops above it.
 */
export const BODY_TRIANGLE_BUDGET = 6200;

/**
 * The largest gzip size of the packed mesh of one body, in bytes (design 7.2). The bodies
 * that the default demo casts are in the first download, so their meshes count against the limit
 * of 1 MB. The budget keeps room above the largest body, the rhino with a round shoulder and a
 * round tube for each arm.
 */
export const BODY_MESH_GZIP_BUDGET = 34_000;

/**
 * Gives the gzip size of a text, with the default level of Node zlib, as `pnpm size` measures the
 * first download (design 7.2).
 *
 * @param text The text, such as the packed mesh of a body.
 * @returns The size after gzip, in bytes.
 */
export function gzipSize(text: string): number {
  return gzipSync(text).byteLength;
}
