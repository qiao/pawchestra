import { Quaternion, Vector3 } from 'three';
import { IDENTITY, toVec3 } from './tuples.ts';
import type { Quat, Vec3 } from './tuples.ts';

/** A color as linear (r, g, b), each 0 to 1. three.js reads vertex colors in this space. */
export type Rgb = readonly [number, number, number];

/**
 * The surface finish of a triangle (design 4.5, materials): how rough and how metallic its
 * surface is under the light.
 *
 * - `matte`: cloth, raw wood, and the bodies. Each face stays flat, so the animals keep the
 *   facets of the low-poly look.
 * - `varnish`: the varnished wood of the bowed strings, with a soft highlight.
 * - `lacquer`: the black lacquer of the piano and a clarinet, and the bead eyes, with a
 *   sharp highlight.
 * - `metal`: brass, copper, and silver. The vertex color gives the metal its tint.
 * - `eye`: the wet eyeballs of a hand rig, with a sharp highlight. The eye light of the
 *   players shines only on this finish (design 4.5).
 * - `polish`: the black polish of the grand piano, with a mirror highlight and a weaker
 *   reflection of the hall, so the case reads black (design 4.5).
 * - `string`: the strings in the open piano, as `metal`. The shader fades a string to the color
 *   of the plate below it when the string is thinner than a pixel, so the strings make no moiré
 *   (design 4.5).
 * - `felt`: the felt and the yarn of the mallet heads, with no gloss, as `matte`. The normals
 *   are smooth, so a round head shades as a ball and shows no facets (design 4.5).
 */
export type Finish =
  | 'matte'
  | 'varnish'
  | 'lacquer'
  | 'metal'
  | 'eye'
  | 'polish'
  | 'string'
  | 'felt';

/**
 * The shading values of a finish: the roughness and the metalness, each 0 to 1 (the values of
 * three.js), the factor of its reflection, and the crease angle of its normals.
 */
interface FinishValues {
  readonly roughness: number;
  readonly metalness: number;
  /**
   * The factor of the reflection of the environment, from 0 to 4 (design 4.5, materials). The
   * hall is dark, so a polished finish needs more than the physical reflection to show the warm
   * lamps and the lit stage.
   */
  readonly reflection: number;
  /**
   * The crease angle in degrees (design 4.5, materials). The shading smooths the normals across
   * an edge with a smaller angle between its two faces, and keeps a larger angle as a hard edge.
   * 0 keeps each face flat.
   */
  readonly crease: number;
}

/**
 * The values of each finish (design 4.5, materials). The order of the keys gives the index of a
 * finish in {@link MeshData.finishes}.
 */
export const FINISHES = {
  matte: { roughness: 0.85, metalness: 0, reflection: 1, crease: 0 },
  varnish: { roughness: 0.3, metalness: 0, reflection: 1.8, crease: 60 },
  lacquer: { roughness: 0.16, metalness: 0, reflection: 2.2, crease: 60 },
  metal: { roughness: 0.26, metalness: 0.6, reflection: 2.4, crease: 60 },
  eye: { roughness: 0.16, metalness: 0, reflection: 2.2, crease: 60 },
  polish: { roughness: 0.08, metalness: 0, reflection: 1.1, crease: 60 },
  string: { roughness: 0.26, metalness: 0.6, reflection: 2.4, crease: 60 },
  felt: { roughness: 0.9, metalness: 0, reflection: 1, crease: 60 },
} as const satisfies Readonly<Record<Finish, FinishValues>>;

/**
 * The finishes in the order of their indices in {@link MeshData.finishes}: the key order of
 * {@link FINISHES}.
 */
export const FINISH_ORDER: readonly Finish[] = Object.keys(FINISHES).filter(
  (key): key is Finish => key in FINISHES,
);

/**
 * The geometry data of one mesh. The arrays hold no index: each triangle has its own three
 * corners, so that each corner can have its own normal at a hard edge (design 4.5, materials).
 */
export interface MeshData {
  /**
   * x, y, z of each corner, in meters. Three corners for each triangle, counterclockwise from
   * outside.
   */
  readonly positions: Float32Array;
  /** Linear r, g, b of each corner. */
  readonly colors: Float32Array;
  /**
   * The main bone of each corner: the bone with the larger weight (design 4.4). 0 for a static
   * mesh.
   */
  readonly bones: Uint8Array;
  /** The second bone of each corner. It is equal to {@link MeshData.bones} for a rigid corner. */
  readonly blendBones: Uint8Array;
  /**
   * The weight of the second bone of each corner, from 0 to 0.5. The main bone has 1 minus this
   * weight.
   */
  readonly blendWeights: Float32Array;
  /** The finish of each triangle, as an index in {@link FINISH_ORDER}. */
  readonly finishes: Uint8Array;
}

/** The bones of one corner of a skinned part, and their weights (design 4.4, 4.7). */
export interface CornerSkin {
  /** The main bone: the bone with the larger weight. */
  readonly bone: number;
  /** The second bone, or `bone` for a rigid corner. */
  readonly blendBone: number;
  /** The weight of `blendBone`, from 0 to 0.5. The main bone has 1 minus this weight. */
  readonly blendWeight: number;
}

/** A placement of a part: scale first, then rotation, then translation. */
export interface Transform {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}

/**
 * Makes a transform. The arguments that are left out change nothing.
 *
 * @param position The translation.
 * @param rotation The rotation.
 * @param scaleBy The scale on each axis.
 * @returns The transform.
 */
export function transform(
  position: Vec3 = [0, 0, 0],
  rotation: Quat = IDENTITY,
  scaleBy: Vec3 = [1, 1, 1],
): Transform {
  return { position, rotation, scale: scaleBy };
}

/** Scratch objects of {@link applyTransform}, which runs for each vertex of each mesh. */
const scratchPoint = new Vector3();
const scratchScale = new Vector3();
const scratchRotation = new Quaternion();
const scratchPosition = new Vector3();

/**
 * Applies a transform to a point.
 *
 * @param t The transform.
 * @param p The point.
 * @returns The point after the scale, the rotation, and the translation.
 */
export function applyTransform(t: Transform, p: Vec3): Vec3 {
  return toVec3(
    scratchPoint
      .set(...p)
      .multiply(scratchScale.set(...t.scale))
      .applyQuaternion(scratchRotation.set(...t.rotation))
      .add(scratchPosition.set(...t.position)),
  );
}

/** The placement and the look of one part of a mesh. */
interface PartOptions {
  /** The linear color of each corner of the part. */
  readonly color: Rgb;
  /** The index of the bone that a rigid part follows. Default 0. */
  readonly bone?: number;
  /** The placement of the part. Default: no change. */
  readonly at?: Transform;
  /** Default `matte`. */
  readonly finish?: Finish;
}

/**
 * Converts a CSS hex color in sRGB to linear r, g, b.
 *
 * @param hex A color such as `#a8a090`.
 * @returns The linear color.
 */
export function srgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (byte: number): number => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 0xff), channel((value >> 8) & 0xff), channel(value & 0xff)];
}

/**
 * Calculates the normal of a triangle of a flat corner list.
 *
 * @param corners The corner list, 9 numbers for each triangle.
 * @param triangle The index of the triangle.
 * @returns The normal, not normalized. Its length is two times the area.
 */
export function triangleNormal(corners: readonly number[], triangle: number): Vec3 {
  const at = (k: number): Vector3 => {
    const i = triangle * 9 + k * 3;
    return new Vector3(corners[i] ?? 0, corners[i + 1] ?? 0, corners[i + 2] ?? 0);
  };
  const a = at(0);
  return toVec3(new Vector3().crossVectors(at(1).sub(a), at(2).sub(a)));
}

/**
 * Splits the triangles of a corner list by the direction of their faces.
 *
 * @param corners The corner list, 9 numbers for each triangle.
 * @param direction A unit direction.
 * @param minDot The smallest cosine between the face normal and `direction` that matches.
 * @returns The matching triangles, then the other triangles.
 */
export function splitByFacing(
  corners: readonly number[],
  direction: Vec3,
  minDot: number,
): [number[], number[]] {
  const matching: number[] = [];
  const others: number[] = [];
  const unit = new Vector3(...direction);
  for (let t = 0; t < corners.length / 9; t++) {
    const n = new Vector3(...triangleNormal(corners, t));
    const cosine = n.dot(unit) / n.length();
    (cosine >= minDot ? matching : others).push(...corners.slice(t * 9, t * 9 + 9));
  }
  return [matching, others];
}

/** Collects the parts of one mesh, and makes its {@link MeshData}. */
export class MeshBuilder {
  /** x, y, z of each corner. */
  readonly #positions: number[] = [];
  /** Linear r, g, b of each corner. */
  readonly #colors: number[] = [];
  /** The main bone of each corner. */
  readonly #bones: number[] = [];
  /** The second bone of each corner. */
  readonly #blendBones: number[] = [];
  /** The weight of the second bone of each corner. */
  readonly #blendWeights: number[] = [];
  /** The finish index of each triangle. */
  readonly #finishes: number[] = [];

  /**
   * Adds the triangles of one part.
   *
   * @param corners The corner list of the part in its own axes, 9 numbers for each triangle.
   * @param options The color, the bones, the placement, and the finish.
   */
  add(corners: readonly number[], options: PartOptions): void {
    const at = options.at ?? transform();
    const bone = options.bone ?? 0;
    const finish = FINISH_ORDER.indexOf(options.finish ?? 'matte');
    // A mirror scale turns the faces inside out. Then the corner order changes to keep them outside.
    const mirrored = at.scale[0] * at.scale[1] * at.scale[2] < 0;
    const order = mirrored ? [0, 2, 1] : [0, 1, 2];

    for (let t = 0; t < corners.length / 9; t++) {
      for (const k of order) {
        const i = t * 9 + k * 3;
        const p = applyTransform(at, [corners[i] ?? 0, corners[i + 1] ?? 0, corners[i + 2] ?? 0]);
        this.#positions.push(p[0], p[1], p[2]);
        this.#colors.push(options.color[0], options.color[1], options.color[2]);
        this.#pushSkin({ bone, blendBone: bone, blendWeight: 0 });
      }
      this.#finishes.push(finish);
    }
  }

  /**
   * Adds triangles that each have their own finish, and corners that each have their own color
   * and skin, such as the faces of a studio body (design 4.4).
   *
   * @param positions x, y, z of each corner, 9 numbers for each triangle, counterclockwise from
   *   outside.
   * @param colors Linear r, g, b of each corner, 9 numbers for each triangle.
   * @param finishes The finish of each triangle, as an index in {@link FINISH_ORDER}.
   * @param skin Gives the skin of a corner from its index.
   * @throws Error if the skin of a corner has a weight that is not from 0 to 0.5.
   */
  addFaces(
    positions: ArrayLike<number>,
    colors: ArrayLike<number>,
    finishes: ArrayLike<number>,
    skin: (corner: number) => CornerSkin,
  ): void {
    for (let c = 0; c < positions.length / 3; c++) {
      const t = Math.floor(c / 3);
      this.#positions.push(
        positions[c * 3] ?? 0,
        positions[c * 3 + 1] ?? 0,
        positions[c * 3 + 2] ?? 0,
      );
      this.#colors.push(colors[c * 3] ?? 0, colors[c * 3 + 1] ?? 0, colors[c * 3 + 2] ?? 0);
      this.#pushSkin(skin(c));
      if (c % 3 === 2) {
        this.#finishes.push(finishes[t] ?? 0);
      }
    }
  }

  /**
   * Adds the bones of one corner. A corner with the weight 0 keeps its main bone as its second
   * bone, as a rigid corner does.
   *
   * @param skin The skin of the corner.
   * @throws Error if the weight is not from 0 to 0.5.
   */
  #pushSkin(skin: CornerSkin): void {
    if (!(skin.blendWeight >= 0 && skin.blendWeight <= 0.5)) {
      throw new Error(`The weight of the second bone (${skin.blendWeight}) is not from 0 to 0.5.`);
    }

    this.#bones.push(skin.bone);
    this.#blendBones.push(skin.blendWeight > 0 ? skin.blendBone : skin.bone);
    this.#blendWeights.push(skin.blendWeight);
  }

  /**
   * Adds all triangles of a built mesh at a placement. Each corner keeps its color and its bones,
   * and each triangle keeps its finish. Thus many static props merge into one mesh (design 4.4).
   *
   * @param data The mesh data.
   * @param at The placement. It has no mirror scale.
   */
  addMesh(data: MeshData, at: Transform): void {
    for (let v = 0; v < data.bones.length; v++) {
      const i = v * 3;
      const p = applyTransform(at, [
        data.positions[i] ?? 0,
        data.positions[i + 1] ?? 0,
        data.positions[i + 2] ?? 0,
      ]);
      this.#positions.push(p[0], p[1], p[2]);
      this.#colors.push(data.colors[i] ?? 0, data.colors[i + 1] ?? 0, data.colors[i + 2] ?? 0);
      this.#bones.push(data.bones[v] ?? 0);
      this.#blendBones.push(data.blendBones[v] ?? 0);
      this.#blendWeights.push(data.blendWeights[v] ?? 0);
    }
    for (const finish of data.finishes) {
      this.#finishes.push(finish);
    }
  }

  /** The number of triangles added so far. */
  get triangleCount(): number {
    return this.#finishes.length;
  }

  /**
   * Makes the mesh data of all parts.
   *
   * @returns The data, with the triangles in the order of their parts.
   */
  build(): MeshData {
    return {
      positions: new Float32Array(this.#positions),
      colors: new Float32Array(this.#colors),
      bones: new Uint8Array(this.#bones),
      blendBones: new Uint8Array(this.#blendBones),
      blendWeights: new Float32Array(this.#blendWeights),
      finishes: new Uint8Array(this.#finishes),
    };
  }
}
