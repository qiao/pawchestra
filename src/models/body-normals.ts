import type { Steps } from '../score/steps.ts';
import { FINISH_ORDER } from './mesh.ts';
import type { BodyMesh } from './body-format.ts';

/** The index of the `matte` finish, the only finish that a body smooths (design 4.5). */
const MATTE = FINISH_ORDER.indexOf('matte');

/**
 * Calculates the normal of each corner of a body mesh with a crease angle (design 4.4, 4.5). A
 * corner of a `matte` face gets the mean of the normals of the `matte` faces at its vertex whose
 * normals turn from the normal of its own face by at most the crease angle. Each face counts with
 * the angle of its corner at the vertex. Thus the small angles of the fur look smooth, and an
 * edge with a larger angle, such as an ear rim, stays sharp. A face of another finish, such as
 * the gloss of an eye, keeps its own normal at each corner, so it stays flat.
 *
 * The faces of `rim` are the faces of a fold of the bind that a hand rig marks, such as a seated
 * crotch. They turn more than the crease angle from the skin around them, and a pose shows them as
 * a dark crack. So a corner of a rim face gets the mean of the normals of all `matte` faces at its
 * vertex, with no crease angle.
 *
 * The faces of `eyeballs` are the `eye` faces of the mesh of a hand rig. A corner of such a
 * face gets the mean of the normals of the eyeball faces at its vertex, with no crease angle, so
 * that the highlight of the gloss moves smoothly over the ball.
 *
 * @param mesh The places of the welded vertices, the corners, and the finishes of the mesh.
 * @param crease The crease angle in degrees.
 * @param rim The `matte` triangles of the folds of the body (`Body.rim`).
 * @param eyeballs The triangles of the eyes of the mesh (`Body.eyeballs`).
 * @returns x, y, z of the unit normal of each corner, in the order of `mesh.corners`.
 */
export function bodyNormals(
  mesh: Pick<BodyMesh, 'positions' | 'corners' | 'finishes'>,
  crease: number,
  rim: readonly number[] = [],
  eyeballs: readonly number[] = [],
): Float32Array {
  const { corners, finishes } = mesh;
  const cornerCount = corners.length;
  const isRim = faceFlags(cornerCount / 3, rim);
  const isBall = faceFlags(cornerCount / 3, eyeballs);
  const { faces, angles, start, around } = meshFrame(mesh);

  const limit = Math.cos((crease * Math.PI) / 180) - 1e-6;
  const out = new Float32Array(cornerCount * 3);
  for (let c = 0; c < cornerCount; c++) {
    const own = Math.floor(c / 3);
    const ox = faces[own * 3] ?? 0;
    const oy = faces[own * 3 + 1] ?? 0;
    const oz = faces[own * 3 + 2] ?? 0;
    let sx = ox;
    let sy = oy;
    let sz = oz;
    const ball = isBall[own] === 1;
    if (finishes[own] === MATTE || ball) {
      sx = 0;
      sy = 0;
      sz = 0;
      // A rim face takes the skin at the vertex with no crease angle.
      const whole = isRim[own] === 1;
      const v = corners[c] ?? 0;
      for (let i = start[v] ?? 0; i < (start[v + 1] ?? 0); i++) {
        const other = around[i] ?? 0;
        const face = Math.floor(other / 3);
        const fx = faces[face * 3] ?? 0;
        const fy = faces[face * 3 + 1] ?? 0;
        const fz = faces[face * 3 + 2] ?? 0;
        const skin = finishes[face] === MATTE;
        let counts = whole ? skin : other === c || (skin && ox * fx + oy * fy + oz * fz >= limit);
        // An eyeball face takes the other faces of its ball at the vertex, with no crease angle.
        if (ball) {
          counts = isBall[face] === 1;
        }
        if (counts) {
          const weight = angles[other] ?? 0;
          sx += fx * weight;
          sy += fy * weight;
          sz += fz * weight;
        }
      }
    }
    let length = Math.hypot(sx, sy, sz);
    if (length === 0) {
      // A face with no area, or a cap with no skin at its vertex: it takes its own normal, or up.
      [sx, sy, sz] = ox !== 0 || oy !== 0 || oz !== 0 ? [ox, oy, oz] : [0, 1, 0];
      length = 1;
    }
    out[c * 3] = sx / length;
    out[c * 3 + 1] = sy / length;
    out[c * 3 + 2] = sz / length;
  }
  return out;
}

/** The number of corners of one step of {@link bodyCornerColorsSteps}. */
const COLOR_CORNERS_PER_STEP = 4000;

/**
 * Calculates the color of each corner of a body mesh with a blend of the colors of the fur
 * (design 4.5). A corner of a `matte` face gets the mean of the colors of the `matte` faces at its
 * vertex whose normals turn from the normal of its own face by at most the crease angle, and
 * whose colors differ from the color of its own face by at most `blend` in each sRGB channel.
 * Each face counts with the angle of its corner at the vertex. Thus the small steps of the paint
 * and of the baked occlusion fade across the fur, and a large step, such as the edge of a muzzle
 * or of a brow, stays sharp. A corner of another finish, such as a claw, and a corner of a cap
 * keep the color of their face. The work runs in steps (design 7.2).
 *
 * @param mesh The places of the welded vertices, the corners, and the finishes of the mesh.
 * @param colors Linear r, g, b of each triangle.
 * @param crease The crease angle in degrees.
 * @param blend The largest difference of two face colors that blend, in each sRGB channel from
 *   0 to 1. With 0, each corner keeps the color of its face.
 * @returns The steps, which return linear r, g, b of each corner, in the order of
 *   `mesh.corners`.
 */
export function* bodyCornerColorsSteps(
  mesh: Pick<BodyMesh, 'positions' | 'corners' | 'finishes'>,
  colors: ArrayLike<number>,
  crease: number,
  blend: number,
): Steps<Float32Array> {
  const { corners, finishes } = mesh;
  const cornerCount = corners.length;
  const out = new Float32Array(cornerCount * 3);
  for (let c = 0; c < cornerCount; c++) {
    const t = Math.floor(c / 3);
    out[c * 3] = colors[t * 3] ?? 0;
    out[c * 3 + 1] = colors[t * 3 + 1] ?? 0;
    out[c * 3 + 2] = colors[t * 3 + 2] ?? 0;
  }
  if (blend <= 0) {
    return out;
  }
  const { faces, angles, start, around } = meshFrame(mesh);
  yield;
  const srgb = Float32Array.from({ length: colors.length }, (_, i) => toSrgb(colors[i] ?? 0));
  const limit = Math.cos((crease * Math.PI) / 180) - 1e-6;
  for (let c = 0; c < cornerCount; c++) {
    if (c % COLOR_CORNERS_PER_STEP === COLOR_CORNERS_PER_STEP - 1) {
      yield;
    }
    const own = Math.floor(c / 3);
    if (finishes[own] !== MATTE) {
      continue;
    }
    const ox = faces[own * 3] ?? 0;
    const oy = faces[own * 3 + 1] ?? 0;
    const oz = faces[own * 3 + 2] ?? 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    const v = corners[c] ?? 0;
    for (let i = start[v] ?? 0; i < (start[v + 1] ?? 0); i++) {
      const other = around[i] ?? 0;
      const face = Math.floor(other / 3);
      if (finishes[face] !== MATTE) {
        continue;
      }
      const turn =
        ox * (faces[face * 3] ?? 0) +
        oy * (faces[face * 3 + 1] ?? 0) +
        oz * (faces[face * 3 + 2] ?? 0);
      let step = 0;
      for (let k = 0; k < 3; k++) {
        step = Math.max(step, Math.abs((srgb[face * 3 + k] ?? 0) - (srgb[own * 3 + k] ?? 0)));
      }
      if (other === c || (turn >= limit && step <= blend)) {
        const weight = angles[other] ?? 0;
        r += (colors[face * 3] ?? 0) * weight;
        g += (colors[face * 3 + 1] ?? 0) * weight;
        b += (colors[face * 3 + 2] ?? 0) * weight;
        total += weight;
      }
    }
    if (total > 0) {
      out[c * 3] = r / total;
      out[c * 3 + 1] = g / total;
      out[c * 3 + 2] = b / total;
    }
  }
  return out;
}

/**
 * Converts a linear color channel to sRGB.
 *
 * @param value The linear value from 0 to 1.
 * @returns The sRGB value from 0 to 1.
 */
function toSrgb(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/**
 * Marks a list of triangles.
 *
 * @param count The number of triangles.
 * @param list The indices of the marked triangles.
 * @returns 1 for each marked triangle, else 0.
 */
function faceFlags(count: number, list: readonly number[]): Uint8Array {
  const flags = new Uint8Array(count);
  for (const t of list) {
    flags[t] = 1;
  }
  return flags;
}

/** The face normals, the corner angles, and the corners around each vertex of a mesh. */
interface MeshFrame {
  /** The unit normal of each triangle: x, y, z, or 0 for a triangle with no area. */
  readonly faces: Float32Array;
  /** The angle of each corner, between the edges to the two other corners of its triangle. */
  readonly angles: Float32Array;
  /** The first place of the corners of each vertex in {@link MeshFrame.around}, and the end. */
  readonly start: Uint32Array;
  /** The corners of each vertex, one vertex after the other. */
  readonly around: Uint32Array;
}

/**
 * Calculates the face normals, the corner angles, and the corners around each vertex of a mesh.
 *
 * @param mesh The places of the welded vertices and the corners of the mesh.
 * @returns The frame of the mesh.
 */
function meshFrame(mesh: Pick<BodyMesh, 'positions' | 'corners'>): MeshFrame {
  const { positions: p, corners } = mesh;
  const cornerCount = corners.length;
  const faces = new Float32Array(cornerCount);
  const angles = new Float32Array(cornerCount);
  for (let t = 0; t < cornerCount / 3; t++) {
    const a = (corners[t * 3] ?? 0) * 3;
    const b = (corners[t * 3 + 1] ?? 0) * 3;
    const c = (corners[t * 3 + 2] ?? 0) * 3;
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const wx = (p[c] ?? 0) - (p[a] ?? 0);
    const wy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const wz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      faces[t * 3] = nx / length;
      faces[t * 3 + 1] = ny / length;
      faces[t * 3 + 2] = nz / length;
    }
    // The angle at each corner, between the edges to the two other corners.
    const ends = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const o = ends[k] ?? 0;
      const e = ends[(k + 1) % 3] ?? 0;
      const f = ends[(k + 2) % 3] ?? 0;
      const ex = (p[e] ?? 0) - (p[o] ?? 0);
      const ey = (p[e + 1] ?? 0) - (p[o + 1] ?? 0);
      const ez = (p[e + 2] ?? 0) - (p[o + 2] ?? 0);
      const fx = (p[f] ?? 0) - (p[o] ?? 0);
      const fy = (p[f + 1] ?? 0) - (p[o + 1] ?? 0);
      const fz = (p[f + 2] ?? 0) - (p[o + 2] ?? 0);
      const lengths = Math.hypot(ex, ey, ez) * Math.hypot(fx, fy, fz);
      angles[t * 3 + k] =
        lengths > 0
          ? Math.acos(Math.min(1, Math.max(-1, (ex * fx + ey * fy + ez * fz) / lengths)))
          : 0;
    }
  }

  // The corners of each vertex, as a list for each vertex.
  const vertexCount = p.length / 3;
  const start = new Uint32Array(vertexCount + 1);
  for (const v of corners) {
    start[v + 1] = (start[v + 1] ?? 0) + 1;
  }
  for (let v = 0; v < vertexCount; v++) {
    start[v + 1] = (start[v + 1] ?? 0) + (start[v] ?? 0);
  }
  const fill = start.slice(0, vertexCount);
  const around = new Uint32Array(cornerCount);
  for (let c = 0; c < cornerCount; c++) {
    const v = corners[c] ?? 0;
    around[fill[v] ?? 0] = c;
    fill[v] = (fill[v] ?? 0) + 1;
  }

  return { faces, angles, start, around };
}
