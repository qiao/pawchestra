import { Quaternion, Vector3 } from 'three';
import { applyTransform, transform } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import type { MeshBuilder, Transform } from '../mesh.ts';
import { boneIndex } from '../rig.ts';
import type {
  HoldAnchor,
  InstrumentBone,
  InstrumentModel,
  InstrumentPiece,
  PiecePoint,
} from './types.ts';

/**
 * The points of a body that the holds need, in the axes of the player model (design 4.7): the
 * player faces -z, its left side is -x, and the floor is at y = 0.
 */
export interface HoldBody {
  /** The head height `H` of the species, in meters (design 4.5). */
  readonly headHeight: number;
  readonly headCenter: Vec3;
  /** The middle of the mouth, at the front of the lips or the beak (`BodyBones.mouth`). */
  readonly mouth: Vec3;
  /** The middle of each palm in the bind pose, with the arms down. */
  readonly palmL: Vec3;
  readonly palmR: Vec3;
  /**
   * The point on the floor under the middle of the body: under the seat point of a seated body.
   * A body that moves forward on its seat takes its floor instruments with it.
   */
  readonly floor: Vec3;
}

/** One piece at its place in the bind pose. */
export interface PlacedPiece {
  readonly piece: InstrumentPiece;
  /**
   * The placement from the piece axes to the model axes. Its position is the bind position of
   * the bone of the piece.
   */
  readonly at: Transform;
}

/**
 * The keys of a keyboard in the mesh of one player (design 4.6, 5.3): the corners of each key,
 * and the line that the keys turn around, in the model axes of the bind pose.
 */
export interface PianoKeys {
  /** The MIDI key of the first key: key `i` is the MIDI key `first + i`. */
  readonly first: number;
  /**
   * The first corner of each key in the mesh, in MIDI order, then the end of the last key. Key `i`
   * has the corners from `corners[i]` up to `corners[i + 1]`, the end excluded.
   */
  readonly corners: Uint32Array;
  /** A point on the line that the keys turn around: the balance rail under the keys. */
  readonly pivot: Vec3;
  /** The unit direction of the line. A turn by a positive angle moves the front of a key down. */
  readonly axis: Vec3;
  /**
   * The turn of a key at the key bottom, in radians: the front of a white key goes down by the key
   * dip.
   */
  readonly angle: number;
}

/** An instrument at its place in the bind pose of one player. */
interface PlacedInstrument {
  readonly pieces: readonly PlacedPiece[];
  /** The bind position of each bone that carries a piece. */
  readonly bones: ReadonlyMap<InstrumentBone, Vec3>;
  /** The keys of a keyboard, or `null` for an instrument with no key parts. */
  readonly keys: PianoKeys | null;
}

/** One key part in the mesh of a player. */
interface KeyCorners {
  /** The MIDI key. */
  readonly key: number;
  /** The first corner of the key in the mesh, and the end of its corners. */
  readonly start: number;
  readonly end: number;
  /** The placement of the piece of the key. */
  readonly at: Transform;
}

/**
 * Gives the body point of a hold anchor.
 *
 * @param anchor The anchor. `instrument` is not a body point.
 * @param body The points of the body.
 * @returns The point in the model axes.
 */
function bodyPoint(anchor: Exclude<HoldAnchor, 'instrument'>, body: HoldBody): Vec3 {
  switch (anchor) {
    case 'floor':
      return body.floor;
    case 'head':
      return body.headCenter;
    case 'mouth':
      return body.mouth;
    case 'palmL':
      return body.palmL;
    case 'palmR':
      return body.palmR;
    default: {
      const unhandled: never = anchor;
      throw new Error(`The hold anchor "${String(unhandled)}" is not known.`);
    }
  }
}

/**
 * Calculates the place of each piece of an instrument in the bind pose of a body (design 4.6).
 *
 * @param model The instrument.
 * @param body The points of the body.
 * @returns One placement for each piece, in the order of `model.pieces`.
 * @throws Error if the instrument piece follows itself, or if a piece follows a missing
 *   instrument piece.
 */
export function holdInstrument(model: InstrumentModel, body: HoldBody): PlacedPiece[] {
  const onBody = (piece: InstrumentPiece): Transform => {
    const h = piece.hold;
    if (h.anchor === 'instrument') {
      throw new Error(`The instrument piece of the ${model.id} cannot follow itself.`);
    }
    const origin = new Vector3(...bodyPoint(h.anchor, body))
      .addScaledVector(new Vector3(...h.offsetH), body.headHeight)
      .add(new Vector3(...h.offset));
    return transform(toVec3(origin), h.rotation);
  };
  const instrument = model.pieces.find((p) => p.bone === 'instrument');
  const instrumentAt = instrument ? onBody(instrument) : null;
  return model.pieces.map((piece) => {
    const h = piece.hold;
    if (h.anchor !== 'instrument') {
      return { piece, at: piece === instrument && instrumentAt ? instrumentAt : onBody(piece) };
    }
    if (!instrumentAt) {
      throw new Error(`The ${model.id} has a piece on the instrument, but no instrument piece.`);
    }
    return {
      piece,
      at: transform(
        applyTransform(instrumentAt, h.offset),
        toQuat(new Quaternion(...instrumentAt.rotation).multiply(new Quaternion(...h.rotation))),
      ),
    };
  });
}

/**
 * Adds an instrument to the mesh of a player at its place in the bind pose. Each piece follows
 * its bone (design 4.4).
 *
 * @param builder The mesh of the player.
 * @param model The instrument.
 * @param body The points of the body of the player.
 * @returns The placed pieces, and the bind position of each bone that carries a piece.
 */
export function attachInstrument(
  builder: MeshBuilder,
  model: InstrumentModel,
  body: HoldBody,
): PlacedInstrument {
  const pieces = holdInstrument(model, body);
  const bones = new Map<InstrumentBone, Vec3>();
  const keyed: KeyCorners[] = [];
  for (const { piece, at } of pieces) {
    const bone = boneIndex(piece.bone);
    for (const part of piece.parts) {
      const start = builder.triangleCount * 3;
      builder.add(part.corners, { color: part.color, finish: part.finish, bone, at });
      if (part.key !== undefined) {
        keyed.push({ key: part.key, start, end: builder.triangleCount * 3, at });
      }
    }
    bones.set(piece.bone, at.position);
  }
  return { pieces, bones, keys: keyed.length > 0 ? pianoKeys(model, keyed) : null };
}

/**
 * Collects the key parts of a keyboard in the mesh of a player (design 4.6). The keys must be
 * one run of parts in MIDI order on one piece, so that the corners of each key follow the
 * corners of the key below it.
 *
 * @param model The instrument.
 * @param keyed The key parts in the order of the mesh.
 * @returns The keys, with the line of {@link InstrumentModel.keyTurn} in the model axes.
 * @throws Error if the instrument has no key turn, or if the keys are not one run in MIDI order
 *   on one piece.
 */
function pianoKeys(model: InstrumentModel, keyed: readonly KeyCorners[]): PianoKeys {
  const turn = model.keyTurn;
  const first = keyed[0];
  if (!turn || !first) {
    throw new Error(`The ${model.id} has key parts, but no turn of its keys.`);
  }

  const corners = new Uint32Array(keyed.length + 1);
  for (const [i, part] of keyed.entries()) {
    const before = keyed[i - 1];
    if (
      part.key !== first.key + i ||
      part.at !== first.at ||
      (before && part.start !== before.end)
    ) {
      throw new Error(`The keys of the ${model.id} are not one run of parts in MIDI order.`);
    }
    corners[i] = part.start;
    corners[i + 1] = part.end;
  }
  const rotation = new Quaternion(...first.at.rotation);
  return {
    first: first.key,
    corners,
    pivot: applyTransform(first.at, turn.pivot),
    axis: toVec3(new Vector3(...turn.axis).applyQuaternion(rotation)),
    angle: turn.angle,
  };
}

/**
 * Calculates where a point of a piece is in the bind pose.
 *
 * @param pieces The placed pieces of the instrument.
 * @param point The point in the axes of its piece.
 * @returns The point in the model axes.
 * @throws Error if no placed piece follows the bone of the point.
 */
export function placePoint(pieces: readonly PlacedPiece[], point: PiecePoint): Vec3 {
  const placed = pieces.find((p) => p.piece.bone === point.bone);
  if (!placed) {
    throw new Error(`No piece of the instrument follows the bone "${point.bone}".`);
  }
  return applyTransform(placed.at, point.at);
}
