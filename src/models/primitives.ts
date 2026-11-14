import type { Vec3 } from './tuples.ts';

// Low-poly solids as corner lists: 9 numbers (three x, y, z corners) for each triangle, with the
// corners counterclockwise when seen from outside. The facet counts follow design 4.5.

/** One point of a lathe profile: the radius and the height. */
export type ProfilePoint = readonly [radius: number, y: number];

/** One point of an outline in the x-z plane. */
export type OutlinePoint = readonly [x: number, z: number];

/**
 * Makes a flat quad of two triangles.
 *
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @param d The fourth corner. The corners go counterclockwise when seen from the front.
 * @returns 2 triangles.
 */
export function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number[] {
  return [...a, ...b, ...c, ...a, ...c, ...d];
}

function pushQuad(out: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  out.push(...quad(a, b, c, d));
}

/**
 * Makes a box with its center at the origin.
 *
 * @param width The size on x.
 * @param height The size on y.
 * @param depth The size on z.
 * @returns 12 triangles.
 */
export function box(width: number, height: number, depth: number): number[] {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const out: number[] = [];
  // +x, -x, +y, -y, +z, -z
  pushQuad(out, [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);
  pushQuad(out, [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
  pushQuad(out, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
  pushQuad(out, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
  pushQuad(out, [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
  pushQuad(out, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
  return out;
}

/**
 * Makes a solid of revolution around the y axis. A ring with a radius of 0 closes the solid at
 * its height. An end ring with a radius larger than 0 gets a flat cap.
 *
 * @param profile The profile from the bottom to the top.
 * @param segments The number of faces around the axis.
 * @returns 2 triangles for each segment of each profile step, less the triangles at a radius of
 *   0, plus `segments` triangles for each cap.
 */
export function lathe(profile: readonly ProfilePoint[], segments: number): number[] {
  // A half-segment turn puts a face at the front (-z) and at the sides.
  const ring = (r: number, y: number, i: number): number[] => {
    const angle = ((i + 0.5) / segments) * 2 * Math.PI;
    return [r * Math.sin(angle), y, r * Math.cos(angle)];
  };
  const out: number[] = [];
  for (let j = 0; j + 1 < profile.length; j++) {
    const [r0, y0] = profile[j] ?? [0, 0];
    const [r1, y1] = profile[j + 1] ?? [0, 0];
    for (let i = 0; i < segments; i++) {
      const a = ring(r0, y0, i);
      const b = ring(r0, y0, i + 1);
      const c = ring(r1, y1, i + 1);
      const d = ring(r1, y1, i);
      if (r0 > 0) {
        out.push(...a, ...b, ...c);
      }
      if (r1 > 0) {
        out.push(...a, ...c, ...d);
      }
    }
  }
  const [bottomR, bottomY] = profile[0] ?? [0, 0];
  const [topR, topY] = profile.at(-1) ?? [0, 0];
  for (let i = 0; i < segments; i++) {
    if (bottomR > 0) {
      out.push(0, bottomY, 0, ...ring(bottomR, bottomY, i + 1), ...ring(bottomR, bottomY, i));
    }
    if (topR > 0) {
      out.push(0, topY, 0, ...ring(topR, topY, i), ...ring(topR, topY, i + 1));
    }
  }
  return out;
}

/**
 * Makes a solid of revolution around the y axis with no flat caps at its end rings: a band, such
 * as a hoop, whose ends meet other parts. Bands that share their end rings make one closed solid,
 * each in its own color.
 *
 * @param profile The profile ({@link lathe}).
 * @param segments The number of faces around the axis.
 * @returns 2 triangles for each segment of each profile step, less the triangles at a radius of
 *   0.
 */
export function latheBand(profile: readonly ProfilePoint[], segments: number): number[] {
  const corners = lathe(profile, segments);
  const caps = [profile[0], profile.at(-1)].filter((p) => (p?.[0] ?? 0) > 0).length;
  return corners.slice(0, corners.length - caps * segments * 9);
}

/**
 * Makes a closed cylinder or cone on the y axis, from y = 0 to y = `height`.
 *
 * @param bottomRadius The radius at y = 0.
 * @param topRadius The radius at the top. 0 gives a cone.
 * @param height The length on y.
 * @param segments The number of side faces.
 * @returns `4 × segments` triangles, or `2 × segments` for a cone.
 */
export function cylinder(
  bottomRadius: number,
  topRadius: number,
  height: number,
  segments: number,
): number[] {
  return lathe(
    [
      [bottomRadius, 0],
      [topRadius, height],
    ],
    segments,
  );
}

/**
 * Makes a ball on the y axis with its center at the origin: a lathe of rings from the bottom
 * point to the top point. A scale on its axes makes a smooth oval, such as a cheek or an eye, with
 * fewer triangles than an icosphere of the same smoothness.
 *
 * @param radius The radius.
 * @param segments The number of faces around the axis.
 * @param rings The number of steps from the bottom point to the top point. At least 2.
 * @returns `segments × (2 × rings - 2)` triangles.
 */
export function ball(radius: number, segments: number, rings: number): number[] {
  const profile: ProfilePoint[] = [];
  for (let k = 0; k <= rings; k++) {
    const angle = (k / rings) * Math.PI;
    profile.push([
      k === 0 || k === rings ? 0 : radius * Math.sin(angle),
      -radius * Math.cos(angle),
    ]);
  }
  return lathe(profile, segments);
}

const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSAHEDRON_CORNERS: readonly (readonly [number, number, number])[] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];

const ICOSAHEDRON_FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

type Corner = readonly [number, number, number];

function onSphere(p: Corner, radius: number): Corner {
  const n = radius / Math.hypot(p[0], p[1], p[2]);
  return [p[0] * n, p[1] * n, p[2] * n];
}

/**
 * Makes an icosahedron with its center at the origin and its corners on a sphere.
 *
 * @param radius The radius of the sphere.
 * @returns 20 triangles.
 */
export function icosphere(radius: number): number[] {
  return ICOSAHEDRON_FACES.flatMap((face) =>
    face.flatMap((i) => onSphere(ICOSAHEDRON_CORNERS[i] ?? [0, 0, 0], radius)),
  );
}

/**
 * Makes a prism from an outline in the x-z plane, from y = `bottom` to y = `top`. The caps are
 * fans from the origin, so the outline must be star-shaped around the origin.
 *
 * @param outline The outline, counterclockwise when seen from +y.
 * @param bottom The height of the bottom face.
 * @param top The height of the top face.
 * @returns `4 × outline.length` triangles.
 */
export function prism(outline: readonly OutlinePoint[], bottom: number, top: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i] ?? [0, 0];
    const [x1, z1] = outline[(i + 1) % outline.length] ?? [0, 0];
    pushQuad(out, [x0, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x0, top, z0]);
    out.push(0, top, 0, x0, top, z0, x1, top, z1);
    out.push(0, bottom, 0, x1, bottom, z1, x0, bottom, z0);
  }
  return out;
}

/** One level of a {@link plate}: a scale of the outline at a height. */
export type PlateLevel = readonly [scale: number, y: number];

/**
 * Makes a plate from an outline in the x-z plane: the outline at each level, scaled around the
 * origin, from the bottom level to the top level. Smaller outlines at the bottom and at the top
 * round the edges and arch the faces, as the body of a violin. The caps are fans from the
 * origin, so the outline must be star-shaped around the origin.
 *
 * @param outline The outline, counterclockwise when seen from +y.
 * @param levels The levels from the bottom to the top. At least 2.
 * @returns `2 × outline.length` triangles for each step between two levels, plus
 *   `outline.length` triangles for each cap.
 */
export function plate(outline: readonly OutlinePoint[], levels: readonly PlateLevel[]): number[] {
  const out: number[] = [];
  const at = ([scale, y]: PlateLevel, i: number): Vec3 => {
    const [x, z] = outline[i % outline.length] ?? [0, 0];
    return [x * scale, y, z * scale];
  };
  for (let j = 0; j + 1 < levels.length; j++) {
    const lower = levels[j];
    const upper = levels[j + 1];
    if (!lower || !upper) {
      continue;
    }
    for (let i = 0; i < outline.length; i++) {
      pushQuad(out, at(lower, i), at(lower, i + 1), at(upper, i + 1), at(upper, i));
    }
  }
  const bottom = levels[0];
  const top = levels.at(-1);
  for (let i = 0; i < outline.length; i++) {
    if (bottom) {
      out.push(0, bottom[1], 0, ...at(bottom, i + 1), ...at(bottom, i));
    }
    if (top) {
      out.push(0, top[1], 0, ...at(top, i), ...at(top, i + 1));
    }
  }
  return out;
}

/**
 * Makes a closed solid through rings of corners, such as a neck or a fingerboard whose section
 * changes along its length. Corner i of each ring joins corner i of the next ring. Each end ring
 * gets a fan cap from the mean of its corners.
 *
 * @param rings The rings from the first end to the last end. Each ring has the same number of
 *   corners, counterclockwise when seen from the side of the last end, and its section is
 *   star-shaped around the mean of its corners.
 * @param caps Whether the end rings get caps. A part with hidden ends, such as a string, needs
 *   none.
 * @returns 2 triangles for each corner of each step between two rings, plus one triangle for
 *   each corner of each cap.
 */
export function sweep(rings: readonly (readonly Vec3[])[], caps = true): number[] {
  const out: number[] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    const lower = rings[j] ?? [];
    const upper = rings[j + 1] ?? [];
    for (let i = 0; i < lower.length; i++) {
      const k = (i + 1) % lower.length;
      pushQuad(
        out,
        lower[i] ?? [0, 0, 0],
        lower[k] ?? [0, 0, 0],
        upper[k] ?? [0, 0, 0],
        upper[i] ?? [0, 0, 0],
      );
    }
  }
  if (!caps) {
    return out;
  }
  const center = (ring: readonly Vec3[]): Vec3 => {
    const sum = ring.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length];
  };
  const first = rings[0] ?? [];
  const last = rings.at(-1) ?? [];
  const firstCenter = center(first);
  const lastCenter = center(last);
  for (let i = 0; i < first.length; i++) {
    const k = (i + 1) % first.length;
    out.push(...firstCenter, ...(first[k] ?? [0, 0, 0]), ...(first[i] ?? [0, 0, 0]));
  }
  for (let i = 0; i < last.length; i++) {
    const k = (i + 1) % last.length;
    out.push(...lastCenter, ...(last[i] ?? [0, 0, 0]), ...(last[k] ?? [0, 0, 0]));
  }
  return out;
}
