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
  PedalTurn,
  PiecePoint,
  StringLine,
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

/**
 * The strings of a harp in the mesh of one player (design 4.6, 5.3): the corners of each string,
 * and the line of each string, in the model axes of the bind pose.
 */
export interface HarpStrings {
  /**
   * The first corner of each string in the mesh, from the bass string, then the end of the last
   * string. String `i` has the corners from `corners[i]` up to `corners[i + 1]`, the end excluded.
   */
  readonly corners: Uint32Array;
  /** The line of each string, in the model axes. */
  readonly lines: readonly StringLine[];
  /** The unit direction of the largest swing of a string, in the model axes. */
  readonly swing: Vec3;
  /** The short axis of the ellipse of a swing, as a share of the long axis. */
  readonly cross: number;
  /** The bone of the piece of the strings. */
  readonly bone: InstrumentBone;
}

/**
 * The pedals of a harp in the mesh of one player (design 4.6, 5.3): the corners of each pedal, and
 * the turn of each pedal into its notches, in the model axes of the bind pose.
 */
export interface HarpPedals {
  /**
   * The first corner of each pedal in the mesh, in the order of `HARP_PEDALS.order`, then the end
   * of the last pedal. Pedal `i` has the corners from `corners[i]` up to `corners[i + 1]`.
   */
  readonly corners: Uint32Array;
  /** The turn of each pedal, with its pivot and its axis in the model axes. */
  readonly turns: readonly PedalTurn[];
}

/** An instrument at its place in the bind pose of one player. */
interface PlacedInstrument {
  readonly pieces: readonly PlacedPiece[];
  /** The bind position of each bone that carries a piece. */
  readonly bones: ReadonlyMap<InstrumentBone, Vec3>;
  /** The keys of a keyboard, or `null` for an instrument with no key parts. */
  readonly keys: PianoKeys | null;
  /** The strings of a harp, or `null` for an instrument with no string parts. */
  readonly strings: HarpStrings | null;
  /** The pedals of a harp, or `null` for an instrument with no pedal parts. */
  readonly pedals: HarpPedals | null;
}

/** One string part in the mesh of a player. */
interface StringCorners {
  /** The index of the string. */
  readonly index: number;
  /** The first corner of the string in the mesh, and the end of its corners. */
  readonly start: number;
  readonly end: number;
  /** The placed piece of the string. */
  readonly placed: PlacedPiece;
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
  const strung: StringCorners[] = [];
  const pedaled: KeyCorners[] = [];
  for (const placed of pieces) {
    const { piece, at } = placed;
    const bone = boneIndex(piece.bone);
    for (const part of piece.parts) {
      const start = builder.triangleCount * 3;
      builder.add(part.corners, { color: part.color, finish: part.finish, bone, at });
      const end = builder.triangleCount * 3;
      if (part.key !== undefined) {
        keyed.push({ key: part.key, start, end, at });
      }
      if (part.string !== undefined) {
        strung.push({ index: part.string, start, end, placed });
      }
      if (part.pedal !== undefined) {
        pedaled.push({ key: part.pedal, start, end, at });
      }
    }
    bones.set(piece.bone, at.position);
  }
  return {
    pieces,
    bones,
    keys: keyed.length > 0 ? pianoKeys(model, keyed) : null,
    strings: strung.length > 0 ? harpStrings(model, strung) : null,
    pedals: pedaled.length > 0 ? harpPedals(model, pedaled) : null,
  };
}

/**
 * Collects the pedal parts of a harp in the mesh of a player (design 4.6). The pedals must be one
 * run of parts in the order of their index on one piece.
 *
 * @param model The instrument.
 * @param pedaled The pedal parts in the order of the mesh, each with its index as its key.
 * @returns The pedals, with the turns of {@link InstrumentModel.pedalTurns} in the model axes.
 * @throws Error if the instrument has no turn for each pedal, or if the pedals are not one run in
 *   the order of their index on one piece.
 */
function harpPedals(model: InstrumentModel, pedaled: readonly KeyCorners[]): HarpPedals {
  const turns = model.pedalTurns;
  const first = pedaled[0];
  if (!turns || !first || turns.length !== pedaled.length) {
    throw new Error(`The ${model.id} has pedal parts, but no turn for each pedal.`);
  }

  const corners = new Uint32Array(pedaled.length + 1);
  for (const [i, part] of pedaled.entries()) {
    const before = pedaled[i - 1];
    if (part.key !== i || part.at !== first.at || (before && part.start !== before.end)) {
      throw new Error(`The pedals of the ${model.id} are not one run of parts in order.`);
    }
    corners[i] = part.start;
    corners[i + 1] = part.end;
  }
  const rotation = new Quaternion(...first.at.rotation);
  return {
    corners,
    turns: turns.map((turn) => ({
      pivot: applyTransform(first.at, turn.pivot),
      axis: toVec3(new Vector3(...turn.axis).applyQuaternion(rotation)),
      sharp: turn.sharp,
      flat: turn.flat,
    })),
  };
}

/**
 * Collects the string parts of a harp in the mesh of a player (design 4.6). The strings must be
 * one run of parts in the order of their index on one piece, so that the corners of each string
 * follow the corners of the string before it.
 *
 * @param model The instrument.
 * @param strung The string parts in the order of the mesh.
 * @returns The strings, with the lines of {@link InstrumentModel.strings} in the model axes.
 * @throws Error if the instrument has no string lines, or if the strings are not one run in the
 *   order of their index on one piece.
 */
function harpStrings(model: InstrumentModel, strung: readonly StringCorners[]): HarpStrings {
  const strings = model.strings;
  const first = strung[0];
  if (!strings || !first || strings.lines.length !== strung.length) {
    throw new Error(`The ${model.id} has string parts, but no line for each string.`);
  }

  const corners = new Uint32Array(strung.length + 1);
  for (const [i, part] of strung.entries()) {
    const before = strung[i - 1];
    if (part.index !== i || part.placed !== first.placed || (before && part.start !== before.end)) {
      throw new Error(`The strings of the ${model.id} are not one run of parts in order.`);
    }
    corners[i] = part.start;
    corners[i + 1] = part.end;
  }
  const { at, piece } = first.placed;
  const rotation = new Quaternion(...at.rotation);
  return {
    corners,
    lines: strings.lines.map((line) => ({
      bottom: applyTransform(at, line.bottom),
      top: applyTransform(at, line.top),
      radius: line.radius,
      pluck: line.pluck,
      swing: line.swing,
    })),
    swing: toVec3(new Vector3(...strings.swing).applyQuaternion(rotation)),
    cross: strings.cross,
    bone: piece.bone,
  };
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
