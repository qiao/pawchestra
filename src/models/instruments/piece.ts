import { Matrix4, Quaternion, Vector3 } from 'three';
import { IDENTITY, toQuat, toVec3 } from '../tuples.ts';
import { applyTransform, transform } from '../mesh.ts';
import type { Bounds } from '../bounds.ts';
import type { Quat, Vec3 } from '../tuples.ts';
import type { Finish, Rgb, Transform } from '../mesh.ts';
import { box, cylinder } from '../primitives.ts';
import type {
  HoldAnchor,
  InstrumentBone,
  InstrumentPart,
  InstrumentPiece,
  PieceHold,
} from './types.ts';

/**
 * Applies a transform to each corner of a corner list. A mirror scale turns the faces inside out,
 * so then the corner order of each triangle changes to keep the faces outside.
 *
 * @param corners The corner list, 9 numbers for each triangle.
 * @param at The transform.
 * @returns The new corner list.
 */
export function placeCorners(corners: readonly number[], at: Transform): number[] {
  const mirrored = at.scale[0] * at.scale[1] * at.scale[2] < 0;
  const order = mirrored ? [0, 2, 1] : [0, 1, 2];
  const out: number[] = [];
  for (let t = 0; t < corners.length / 9; t++) {
    for (const k of order) {
      const i = t * 9 + k * 3;
      out.push(...applyTransform(at, [corners[i] ?? 0, corners[i + 1] ?? 0, corners[i + 2] ?? 0]));
    }
  }
  return out;
}

/**
 * Gives the smallest rotation that turns the y axis to a direction.
 *
 * @param direction The direction. It must not be 0.
 * @returns The rotation.
 */
function turnYTo(direction: Vector3): Quat {
  return toQuat(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()),
  );
}

/**
 * Calculates the rotation that turns the piece +x to a direction, with the piece +y as near to
 * a second direction as the first permits. A tube of a wind instrument points +x from the mouth.
 *
 * @param along The new direction of +x.
 * @param up The direction for +y.
 * @returns The rotation from the piece axes to the model axes.
 */
export function pointing(along: Vec3, up: Vec3): Quat {
  const x = new Vector3(...along).normalize();
  const y = new Vector3(...up).projectOnPlane(x).normalize();
  const basis = new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
  return toQuat(new Quaternion().setFromRotationMatrix(basis));
}

/**
 * Makes a hold.
 *
 * @param anchor The body point of the hold.
 * @param offsetH The offset from the anchor in head heights.
 * @param rotation The rotation of the piece axes.
 * @param offset A further offset in meters.
 * @returns The hold.
 */
export function hold(
  anchor: HoldAnchor,
  offsetH: Vec3 = [0, 0, 0],
  rotation = IDENTITY,
  offset: Vec3 = [0, 0, 0],
): PieceHold {
  return { anchor, offsetH, offset, rotation };
}

/** Collects the parts of one piece in the axes of the piece. */
export class PieceBuilder {
  readonly #parts: InstrumentPart[] = [];
  /** The corners that the footprint counts in place of the parts ({@link InstrumentPiece.footprint}). */
  readonly #footprint: number[] = [];
  readonly #size: number;

  /**
   * Creates an empty piece.
   *
   * @param size A scale for all parts. It applies after the placement of each part.
   */
  constructor(size = 1) {
    this.#size = size;
  }

  /**
   * Adds one part.
   *
   * @param corners The corner list of the part in its own axes.
   * @param color The color.
   * @param at The placement of the part in the piece axes, before the size scale.
   * @param finish The finish.
   */
  add(
    corners: readonly number[],
    color: Rgb,
    at: Transform = transform(),
    finish: Finish = 'matte',
  ): void {
    this.#parts.push({ corners: this.#place(corners, at), color, finish });
  }

  /**
   * Adds corners that the footprint of the player counts in place of the parts
   * ({@link InstrumentPiece.footprint}).
   *
   * @param corners The corner list in its own axes.
   * @param at The placement in the piece axes, before the size scale.
   */
  footprint(corners: readonly number[], at: Transform = transform()): void {
    this.#footprint.push(...this.#place(corners, at));
  }

  /**
   * Adds one key of a keyboard as a part of its own (design 4.6), with the matte finish.
   *
   * @param key The MIDI key.
   * @param corners The corner list of the key in its own axes.
   * @param color The color.
   * @param at The placement of the key in the piece axes, before the size scale.
   */
  key(key: number, corners: readonly number[], color: Rgb, at: Transform): void {
    this.#parts.push({ corners: this.#place(corners, at), color, finish: 'matte', key });
  }

  /**
   * Adds one string of a harp as a part of its own (design 4.6), in the piece axes.
   *
   * @param index The index of the string, from 0 (the bass string).
   * @param corners The corner list of the string in the piece axes, before the size scale.
   * @param color The color.
   * @param finish The finish.
   */
  string(index: number, corners: readonly number[], color: Rgb, finish: Finish): void {
    this.#parts.push({ corners: this.#place(corners, transform()), color, finish, string: index });
  }

  /**
   * Adds one pedal of a harp as a part of its own (design 4.6), with the metal finish.
   *
   * @param index The index of the pedal, in the order of `HARP_PEDALS.order`.
   * @param corners The corner list of the pedal in its own axes.
   * @param color The color.
   * @param at The placement of the pedal in the piece axes, before the size scale.
   */
  pedal(index: number, corners: readonly number[], color: Rgb, at: Transform): void {
    this.#parts.push({ corners: this.#place(corners, at), color, finish: 'metal', pedal: index });
  }

  /**
   * Places the corners of a part in the piece axes, and applies the size scale.
   *
   * @param corners The corner list of the part in its own axes.
   * @param at The placement of the part in the piece axes, before the size scale.
   * @returns The new corner list.
   */
  #place(corners: readonly number[], at: Transform): number[] {
    const s = this.#size;
    const placed = placeCorners(corners, at);
    return s === 1 ? placed : placed.map((c) => c * s);
  }

  /**
   * Adds a closed cylinder from one point to another.
   *
   * @param from The center of the first end.
   * @param to The center of the second end.
   * @param radius The radius.
   * @param segments The number of side faces.
   * @param color The color.
   * @param finish The finish.
   */
  rod(
    from: Vec3,
    to: Vec3,
    radius: number,
    segments: number,
    color: Rgb,
    finish: Finish = 'matte',
  ): void {
    const axis = new Vector3(...to).sub(new Vector3(...from));
    this.add(
      cylinder(radius, radius, axis.length(), segments),
      color,
      transform(from, turnYTo(axis)),
      finish,
    );
  }

  /**
   * Adds a closed rod that tapers from one point to another.
   *
   * @param from The center of the first end.
   * @param to The center of the second end.
   * @param fromRadius The radius at the first end.
   * @param toRadius The radius at the second end.
   * @param segments The number of side faces.
   * @param color The color.
   */
  taper(
    from: Vec3,
    to: Vec3,
    fromRadius: number,
    toRadius: number,
    segments: number,
    color: Rgb,
  ): void {
    const axis = new Vector3(...to).sub(new Vector3(...from));
    this.add(
      cylinder(fromRadius, toRadius, axis.length(), segments),
      color,
      transform(from, turnYTo(axis)),
    );
  }

  /**
   * Adds a box from one point to another. The box keeps its x axis when the segment lies in the
   * y-z plane.
   *
   * @param from The center of the first end.
   * @param to The center of the second end.
   * @param width The size on x.
   * @param depth The size normal to x and to the segment.
   * @param color The color.
   * @param finish The finish.
   */
  bar(
    from: Vec3,
    to: Vec3,
    width: number,
    depth: number,
    color: Rgb,
    finish: Finish = 'matte',
  ): void {
    const axis = new Vector3(...to).sub(new Vector3(...from));
    this.add(
      box(width, axis.length(), depth),
      color,
      transform(toVec3(new Vector3(...from).addScaledVector(axis, 0.5)), turnYTo(axis)),
      finish,
    );
  }

  /**
   * Makes the piece of all parts so far.
   *
   * @param bone The bone that carries the piece.
   * @param pieceHold The place of the piece in the bind pose.
   * @returns The piece.
   */
  build(bone: InstrumentBone, pieceHold: PieceHold): InstrumentPiece {
    const piece: InstrumentPiece = { bone, parts: [...this.#parts], hold: pieceHold };
    if (this.#footprint.length > 0) {
      return { ...piece, footprint: [...this.#footprint] };
    }
    return piece;
  }
}

/**
 * Calculates the box around all corners of a piece.
 *
 * @param piece The piece.
 * @returns The box in the axes of the piece.
 */
export function pieceBounds(piece: InstrumentPiece): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of piece.parts) {
    for (let i = 0; i < part.corners.length; i++) {
      const c = part.corners[i] ?? 0;
      const axis = i % 3;
      min[axis] = Math.min(min[axis] ?? Infinity, c);
      max[axis] = Math.max(max[axis] ?? -Infinity, c);
    }
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

/**
 * Calculates the size of the box around a piece.
 *
 * @param piece The piece.
 * @returns The extent on each axis of the piece, in meters.
 */
export function pieceSize(piece: InstrumentPiece): Vec3 {
  const { min, max } = pieceBounds(piece);
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

/**
 * Counts the triangles of all pieces.
 *
 * @param pieces The pieces.
 * @returns The number of triangles.
 */
export function triangleCount(pieces: readonly InstrumentPiece[]): number {
  let count = 0;
  for (const piece of pieces) {
    for (const part of piece.parts) {
      count += part.corners.length / 9;
    }
  }
  return count;
}
