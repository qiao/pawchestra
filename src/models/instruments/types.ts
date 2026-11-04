import type { Quat, Vec3 } from '../tuples.ts';
import type { Finish, Rgb } from '../mesh.ts';
import type { BoneName, InstrumentParent } from '../rig.ts';

/**
 * The instrument models of design 4.6. A player carries one model with all its pieces, for
 * example the violin and its bow, or the kettles of the timpani and two mallets.
 */
export type InstrumentId =
  | 'violin'
  | 'viola'
  | 'cello'
  | 'contrabass'
  | 'harp'
  | 'piano'
  | 'choir-folder'
  | 'flute'
  | 'oboe'
  | 'clarinet'
  | 'bassoon'
  | 'horn'
  | 'trumpet'
  | 'trombone'
  | 'tuba'
  | 'timpani'
  | 'bass-drum'
  | 'snare-drum'
  | 'cymbals'
  | 'small-percussion'
  | 'xylophone'
  | 'baton';

/**
 * The instruments that a species can play at a size of its own, as a child plays a fractional
 * violin (design 4.6). `instrumentScale()` of `models/species.ts` reads the scale of each one, and
 * `buildInstrument()` of `catalog.ts` gives it to the builder of each one. A new scale adds its
 * instrument here, and the typecheck then stops at each place that must read the scale.
 */
const SCALED_INSTRUMENTS = [
  'violin',
  'viola',
  'cello',
  'contrabass',
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'trumpet',
  'cymbals',
  'harp',
] as const satisfies readonly InstrumentId[];

/**
 * The form of the cymbals of a species (design 4.6). `hand`: a pair of crash cymbals, one in each
 * hand. `suspended`: one cymbal on a stand, struck with a yarn mallet in each hand.
 */
export type CymbalForm = 'hand' | 'suspended';

/** An instrument of {@link SCALED_INSTRUMENTS}. */
export type ScaledInstrument = (typeof SCALED_INSTRUMENTS)[number];

/**
 * Tells if an instrument is one of {@link SCALED_INSTRUMENTS}.
 *
 * @param id The instrument.
 * @returns True for an instrument with a scale of the species.
 */
export function isScaledInstrument(id: InstrumentId): id is ScaledInstrument {
  return SCALED_INSTRUMENTS.some((scaled) => scaled === id);
}

/** The bones that carry the pieces of an instrument (design 4.7). */
export type InstrumentBone = Extract<
  BoneName,
  'instrument' | 'slide' | 'bow' | 'malletL' | 'malletR' | 'baton'
>;

/** One solid of one color, as a corner list in the axes of its piece. */
export interface InstrumentPart {
  /** 9 numbers for each triangle, counterclockwise from outside, in meters. */
  readonly corners: readonly number[];
  readonly color: Rgb;
  readonly finish: Finish;
  /**
   * The MIDI key of a part that is one key of a keyboard (design 4.6). The key goes down when its
   * note plays (5.3). A part with no key does not move on its piece.
   */
  readonly key?: number;
}

/**
 * The line that the keys of a keyboard turn around when they go down, as a real key turns on its
 * balance rail (design 4.6, 5.3), and the turn of a key at the key bottom.
 */
export interface KeyTurn {
  /** A point on the line, in the axes of the piece of the keys. */
  readonly pivot: Vec3;
  /** The unit direction of the line. A turn by a positive angle moves the front of a key down. */
  readonly axis: Vec3;
  /** The turn of a key at the key bottom, in radians. */
  readonly angle: number;
}

/**
 * The body point that the origin of a piece goes to in the bind pose. `floor` is the floor under
 * the middle of the body: under its seat point, or under a standing player. `instrument` is the
 * origin of the `instrument` piece, for a piece that follows the instrument (the trombone slide).
 */
export type HoldAnchor = 'floor' | 'head' | 'mouth' | 'palmL' | 'palmR' | 'instrument';

/** The place of a piece in the bind pose (design 4.6, 4.7). */
export interface PieceHold {
  readonly anchor: HoldAnchor;
  /** The offset of the piece origin from the anchor, in head heights `H` of the player. */
  readonly offsetH: Vec3;
  /** A further offset in meters. It is in the axes of the instrument piece for `instrument`. */
  readonly offset: Vec3;
  /** The rotation of the piece axes in the model axes, or in the instrument piece axes. */
  readonly rotation: Quat;
}

/**
 * One rigid piece of an instrument. All its parts follow one bone (design 4.4). The origin of the
 * piece axes is the bind position of that bone.
 */
export interface InstrumentPiece {
  readonly bone: InstrumentBone;
  readonly parts: readonly InstrumentPart[];
  readonly hold: PieceHold;
  /**
   * Corners in the axes of the piece, 9 numbers for each triangle, that the footprint of the
   * player counts in place of the parts of the piece (design 4.5, seat geometry). The mesh does
   * not draw them. A detailed model keeps the space of a simpler model, so that the seats stay.
   */
  readonly footprint?: readonly number[];
}

/** A point on one piece, in the axes of that piece. */
export interface PiecePoint {
  readonly bone: InstrumentBone;
  readonly at: Vec3;
}

/**
 * The axis of the tube or the bar that a palm closes around, as a line on one piece (design 5.3):
 * the valve casings of a trumpet, or the brace of a trombone slide.
 */
export interface GripTube {
  readonly bone: InstrumentBone;
  /** A point on the axis, in the axes of the piece. */
  readonly from: Vec3;
  /** A second point on the axis. The line from `from` to `to` gives the direction along it. */
  readonly to: Vec3;
}

/**
 * The points where the player touches the instrument in the playing pose. `null` means that the
 * body part does not touch it.
 */
interface InstrumentGrips {
  /** The middle of the left palm. */
  readonly palmL: PiecePoint | null;
  /** The middle of the right palm. */
  readonly palmR: PiecePoint | null;
  /**
   * The tube that the left palm closes around. With none, a palm closes around the line from the
   * left grip to the right grip through the mouth, the tube of a woodwind.
   */
  readonly tubeL?: GripTube;
  /** The tube that the right palm closes around, as {@link InstrumentGrips.tubeL}. */
  readonly tubeR?: GripTube;
  /** The point at the mouth: the lip plate, the reed, or the mouthpiece. */
  readonly mouth: PiecePoint | null;
  /** The point under the chin: the chin rest of the violin and the viola. */
  readonly chin: PiecePoint | null;
}

/**
 * The kind of a place that the pose of step 5 aims at (design 4.7, 5.3).
 *
 * - `bow-contact`: the point on the strings where the bow plays.
 * - `fingerboard`: the line on the strings from the nut to the end of the fingerboard.
 * - `bow-hair`: the line of the bow hair from the frog to the tip.
 * - `strings`: the line across the harp strings at their middle, from the lowest string.
 * - `keyboard`: the line over the piano keys, from the lowest key to the highest.
 * - `slide`: the line of the trombone slide brace from the first position to the seventh.
 * - `bell`: the middle of the opening of a bell.
 * - `head`: the middle of a drum head, a kettle head, the tambourine head, or a suspended cymbal.
 * - `bars`: the line over the xylophone bars, from the lowest bar to the highest.
 * - `mallet-head`: the part of a mallet, a stick, or a beater that strikes.
 * - `plate`: the middle of the inner face of a cymbal.
 * - `bar`: the side of the triangle that the beater strikes.
 * - `tip`: the tip of the baton.
 */
export type PlayTargetKind =
  | 'bow-contact'
  | 'fingerboard'
  | 'bow-hair'
  | 'strings'
  | 'keyboard'
  | 'slide'
  | 'bell'
  | 'head'
  | 'bars'
  | 'mallet-head'
  | 'plate'
  | 'bar'
  | 'tip';

/** A point or a line on a piece that the pose of step 5 aims at. */
export interface PlayTarget {
  readonly kind: PlayTargetKind;
  readonly bone: InstrumentBone;
  /** The point, or the start of the line, in the axes of the piece. */
  readonly from: Vec3;
  /** The end of the line. It is equal to `from` for a point. */
  readonly to: Vec3;
  /** The unit direction out of the surface, toward the hand, the bow, or the mallet. */
  readonly normal: Vec3;
  /** The MIDI keys at `from` and at `to`, for a line that follows the pitch. */
  readonly keys: readonly [low: number, high: number] | null;
}

/** The geometry and the play data of one instrument, with no Three.js object. */
export interface InstrumentModel {
  readonly id: InstrumentId;
  /** The parent of the `instrument` bone (design 4.7). */
  readonly parent: InstrumentParent;
  /** The main piece is first: the `instrument` piece, or the only hand piece. */
  readonly pieces: readonly InstrumentPiece[];
  readonly grips: InstrumentGrips;
  readonly targets: readonly PlayTarget[];
  /** The size of the box around the main piece, in its own axes, in meters. */
  readonly size: Vec3;
  /** The turn of the keys of a keyboard, on the piece of its key parts. Only a keyboard has it. */
  readonly keyTurn?: KeyTurn;
}
