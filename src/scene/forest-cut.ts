import type { Vec3 } from '../models/tuples.ts';
import type { CutBand, CutGroup } from './forest-build.ts';

/**
 * The points of the stage that no part of the forest may hide (design 4.1): a grid over the deck
 * at the heights of the players.
 */
export interface CutSamples {
  /** The grid covers this part of the stage side around the center. */
  readonly share: number;
  /** The count of the points on each side of the grid. */
  readonly grid: number;
  /** The heights of the points above the stage top, in meters. */
  readonly heights: readonly number[];
}

/**
 * Gives the points of the stage that no part of the forest may hide.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param samples The grid.
 * @returns The points.
 */
export function cutPoints(stageSide: number, samples: CutSamples): Vec3[] {
  const points: Vec3[] = [];
  const half = (stageSide / 2) * samples.share;
  for (const height of samples.heights) {
    for (let i = 0; i < samples.grid; i++) {
      for (let j = 0; j < samples.grid; j++) {
        const u = samples.grid > 1 ? i / (samples.grid - 1) : 0.5;
        const v = samples.grid > 1 ? j / (samples.grid - 1) : 0.5;
        points.push([-half + 2 * half * u, height, -half + 2 * half * v]);
      }
    }
  }
  return points;
}

/**
 * Tells if the line from the camera to a point of the stage passes through a band of a group: an
 * upright cylinder. A camera inside the cylinder counts as a hit.
 *
 * @param camera The camera.
 * @param point The point of the stage.
 * @param band The band.
 * @returns True if the line passes through the band.
 */
function hitsBand(camera: Vec3, point: Vec3, band: CutBand): boolean {
  const [bottom, top, x, z, radius] = band;
  const dx = point[0] - camera[0];
  const dz = point[2] - camera[2];
  const fx = camera[0] - x;
  const fz = camera[2] - z;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  if (a < 1e-9) {
    return c <= 0 && camera[1] >= bottom && camera[1] <= top;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return false;
  }

  const root = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - root) / (2 * a));
  const t1 = Math.min(1, (-b + root) / (2 * a));
  if (t0 > t1) {
    return false;
  }
  const y0 = camera[1] + (point[1] - camera[1]) * t0;
  const y1 = camera[1] + (point[1] - camera[1]) * t1;
  return Math.max(y0, y1) >= bottom && Math.min(y0, y1) <= top;
}

/** The region of the lines from the camera to the points of the stage, for the first test. */
interface SightRegion {
  /** The camera. */
  readonly camera: Vec3;
  /** The plan distance from the stage center within which the points lie. */
  readonly reach: number;
  /** The least and the largest height of the lines. */
  readonly heights: readonly [number, number];
}

/**
 * Tells if a cylinder can meet a line from the camera to a point of the stage: its plan circle
 * comes near the segment from the camera to the stage center, and its heights meet the heights
 * of the lines.
 *
 * @param region The region of the lines.
 * @param bounds The cylinder.
 * @returns False if no line can pass through the cylinder.
 */
function nearSight(region: SightRegion, bounds: CutBand): boolean {
  const [bottom, top, x, z, radius] = bounds;
  if (bottom > region.heights[1] || top < region.heights[0]) {
    return false;
  }
  const [cx, , cz] = region.camera;
  const length2 = cx * cx + cz * cz;
  const t = length2 > 0 ? Math.min(1, Math.max(0, ((x - cx) * -cx + (z - cz) * -cz) / length2)) : 0;
  const px = cx - cx * t;
  const pz = cz - cz * t;
  return Math.hypot(x - px, z - pz) <= radius + region.reach;
}

/**
 * Calculates which cut groups of the forest the camera sees (design 4.1). A group drops when the
 * line from the camera to a point of the stage passes through one of its bands, or when the
 * camera stands inside it. A rope drops with either of its trees. Group 0 always stays.
 *
 * @param groups The cut groups.
 * @param camera The camera position.
 * @param points The points of the stage ({@link cutPoints}).
 * @param out One byte for each group: 255 to keep, 0 to drop. The call writes it.
 * @returns True if a byte changed.
 */
export function keepGroups(
  groups: readonly CutGroup[],
  camera: Vec3,
  points: readonly Vec3[],
  out: Uint8Array,
): boolean {
  let changed = false;
  const set = (g: number, keep: boolean): void => {
    const value = keep ? 255 : 0;
    if (out[g] !== value) {
      out[g] = value;
      changed = true;
    }
  };
  let reach = 0;
  let low = camera[1];
  let high = camera[1];
  for (const point of points) {
    reach = Math.max(reach, Math.hypot(point[0], point[2]));
    low = Math.min(low, point[1]);
    high = Math.max(high, point[1]);
  }
  const region: SightRegion = { camera, reach, heights: [low, high] };
  for (const [g, group] of groups.entries()) {
    if (group.ends) {
      continue;
    }
    const hit =
      group.bounds !== null &&
      nearSight(region, group.bounds) &&
      group.bands.some(
        (band) =>
          band[0] <= high &&
          band[1] >= low &&
          points.some((point) => hitsBand(camera, point, band)),
      );
    set(g, g === 0 || !hit);
  }
  for (const [g, group] of groups.entries()) {
    if (group.ends) {
      const [a, b] = group.ends;
      set(g, out[a] === 255 && out[b] === 255);
    }
  }
  return changed;
}

/**
 * The vertex shader of the baked meshes of the forest: the colors of the vertices, and the cut
 * of each group from the texture `uKeep`. A dropped vertex leaves the view, so the GPU drops its
 * triangle, as the cutaway of the hall does (`scene/surroundings.ts`).
 */
export const FOREST_VERTEX = /* glsl */ `
attribute float cut;
uniform sampler2D uKeep;
varying vec3 vColor;
void main() {
  vColor = color;
  if (texelFetch(uKeep, ivec2(int(cut + 0.5), 0), 0).r < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

/** The fragment shader of the baked meshes of the forest. */
export const FOREST_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * The vertex shader of the glows of the forest: a square that faces the camera at each lamp, with
 * the cut of its group. A square has no size limit, unlike a point. The square moves toward the
 * camera by `uLift` times its radius along the view ray and keeps its size in the image, so that
 * the wood behind a lamp does not cut its glow.
 */
export const GLOW_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute float glow;
attribute float cut;
uniform sampler2D uKeep;
uniform float uLift;
varying vec2 vCorner;
void main() {
  vCorner = corner;
  if (texelFetch(uKeep, ivec2(int(cut + 0.5), 0), 0).r < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 view = viewMatrix * modelMatrix * vec4(position, 1.0);
  float distance = length(view.xyz);
  float near = 1.0 - min(glow * uLift, distance - 0.2) / distance;
  view.xyz *= near;
  view.xy += corner * glow * near;
  gl_Position = projectionMatrix * view;
}
`;

/** The fragment shader of the glows of the forest: the soft disc of `createGlows()`. */
export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vCorner;
void main() {
  float d = length(vCorner);
  float light = exp(-6.0 * d * d) * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(uColor * light, 1.0);
  #include <colorspace_fragment>
}
`;
