import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Quat, Vec3 } from '../tuples.ts';
import { splitByFacing, transform } from '../mesh.ts';
import type { Finish, Rgb, Transform } from '../mesh.ts';
import { ball, box, cylinder, icosphere, lathe, sweep } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, placeCorners, pointing } from './piece.ts';
import type { PartSink } from './piece.ts';
import type { InstrumentId, InstrumentModel, InstrumentPiece, PlayTarget } from './types.ts';

/** The number of kettles of the timpani (design 4.6). */
export type KettleCount = 2 | 3 | 4;

/**
 * The angle of each mallet, stick, and beater of the badger below the level in the bind pose,
 * toward the fingers of the hanging paw, in radians: the shaft runs 60° from the fingers toward
 * the thumb, and the head leaves the front of the closed paw at the side of the thumb, as a real
 * player holds it (`docs/reference/percussion-technique.md` 1). The paw of the app has no side
 * bend on the forearm (`PercussionHold.flex`), so a forearm nearer to the shaft than this angle
 * bends the paw to the side. At 1.3 (the shaft 15° from the fingers), the shaft leaves the paw
 * along the claws.
 */
const PAW_TILT: number = 30 * MathUtils.DEG2RAD;

/**
 * The grip of a mallet in the closed paw, in head heights `H`, in the axes of the hanging paw of
 * the bind pose, from the middle of the palm: toward the palm, along the fingers, and toward the
 * thumb (design 4.6). The shaft lies on the palm side, under the curled fingers, so that they
 * close on it (`PercussionHold.curl`), and its butt end sticks out of the heel of the paw.
 */
type MalletSpot = readonly [palm: number, fingers: number, thumb: number];

/**
 * The grip of the mallets in the paws of the badger mesh ({@link MalletSpot}). The shaft runs 60°
 * from the fingers toward the thumb ({@link PAW_TILT}), about 2 cm toward the palm from the
 * middle of the palm, where the claws curled 90° close on it (`PercussionHold.curl`). With the
 * claws curled 120°, 11 to 20 faces at the knuckles turn over, and at 90°, at most 5.
 */
const PAW_SPOT: MalletSpot = [0.08, -0.04, 0.018];

/**
 * The timpani, in meters (design 4.6). The heads of the kettles have their real size (32, 29, 26,
 * and 23 inches), as the kettles of the reference images, which are about 1.4 head heights of the
 * elephant wide. They stand in an arc in front of the player, the largest at the left. Each
 * kettle plays a range of MIDI keys.
 */
export const TIMPANI = {
  /**
   * The radius of each kettle at the corners of its first bowl of 8 faces, from the largest. The
   * head of the bowl of 16 faces has the real radius ({@link kettleHeadRadius}).
   */
  radii: [0.431, 0.391, 0.35, 0.31],
  /** The MIDI keys of each kettle: D2 to A2, F2 to C3, B♭2 to F3, and D3 to A3. */
  keys: [
    [38, 45],
    [41, 48],
    [46, 53],
    [50, 57],
  ],
  /**
   * The height of the heads above the floor. The paws of the elephant rest above the near rims,
   * and its forearms point forward and down, as in the reference images.
   */
  headHeight: 0.76,
  /**
   * The distance of the kettle centers from the player. The near rims of the two front kettles
   * stand about 0.1 m in front of the belly of the elephant.
   */
  arc: 0.74,
  /**
   * The distance from the player of the centers of the kettles beyond the two kettles beside the
   * front gap, in meters, at least {@link TIMPANI.arc}. Their angles on the arc do not change.
   * At the arc, the third kettle of the real size cut into the side of the elephant.
   */
  side: 0.95,
  /**
   * The gap on the arc at the front of the player, in meters, between the kettles at its left and
   * at its right, so that a long nose that hangs from the head, as the trunk of the elephant,
   * stays between them. The larger half of the kettles stands at the left of the gap. With 0, the
   * arc of the kettles is centered on the front.
   */
  front: 0.12,
  /**
   * The angle of each mallet below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians: the shaft runs 30° from the thumb toward the fingers. A real timpanist holds
   * the shaft across the palm, with the head out of the front of the fist
   * (`docs/reference/percussion-technique.md` 1). The paw of the app has no side bend on the
   * forearm (`PercussionHold.strikeRoll`), so the forearm stands at least 60° from the shaft for a
   * straight paw. At the strikes of the elephant, the forearm stands 45° to 63° from the shaft, and
   * the shaft crosses the palm side of the stump. At 45°, the forearm stood 20° to 44° from the
   * shaft, and the shaft ran along the stump and left its end.
   */
  malletTilt: 30 * MathUtils.DEG2RAD,
  /**
   * The grip of the mallet in the left paw of the elephant (`MalletSpot`): 8.6 cm toward the palm,
   * 0.6 cm along the fingers, and 1.2 cm toward the thumb. The stump is a round column, about
   * 19 cm thick, with the palm point on its axis, and it has no fingers and no thumb. The palm of
   * the stump faces down at the kettles, so the shaft lies under the stump, at most 1 cm in its
   * skin, where the palm side meets the sole, and the head leaves the paw below the nails. The
   * end of the stump curls down toward the shaft (`PERCUSSION_HOLDS.timpani.curl`). With the grip
   * 4.2 cm toward the palm, the shaft went 14 cm through the stump and the wrist. With 8.9 cm, the
   * shaft lay on the outer side of the stump in the side views.
   */
  malletSpotL: [0.145, 0.01, 0.02],
  /** The grip of the mallet in the right paw, as in the left paw. */
  malletSpotR: [0.145, 0.01, 0.02],
  /**
   * The length of each shaft behind its grip, in meters ({@link MALLET_BUTT}). The butt end stays
   * in the skin of the palm side of the stump, so no view shows it. A real player holds 13 mm to
   * 25 mm behind the hand (`docs/reference/percussion-technique.md` 1). With 0.165 m, the butt end
   * came out of the lower side of the forearm, and with 0.07 m, its tip showed on the side of the
   * stump.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletButt: 0.04 as number,
} as const;

/**
 * The xylophone, in meters (design 4.6). It has 30 bars from C5 to F7: the natural bars in the
 * front row near the player, and the sharp bars in the back row, 0.02 m higher. The bars are
 * below the shoulders of the badger (0.64 m), so that the mallets slant down to them. At 0.72 m,
 * the mallets strike the bars from below. The bars are smaller than real bars, because the short
 * arms of the badger reach the bars only in a band about 0.12 m deep: nearer bars put the paws
 * into the belly, and the arms do not reach farther bars. With bars of a real size (0.30 m to
 * 0.17 m long), the sharp bars stand about 11 cm out of reach. The bars of 11 cm to 7 cm bring the
 * sharp bars nearer for the grip of the closed paw.
 */
export const XYLOPHONE = {
  keys: [72, 101],
  /**
   * The height of the bars: below the shoulder joints of the Tripo badger (0.64 m), so that the
   * mallets slant down to them. With 0.40 m, the mallets missed the far bars by up to 1.2 cm.
   */
  barHeight: 0.44,
  /** The width of a natural bar with its gap. */
  pitch: 0.03,
  /**
   * The lengths of the lowest and of the highest natural bar. With 12 cm to 8 cm and the mallet of
   * the closed paw, 88% of the right strikes of the test score land within 5 mm of their bars,
   * and with 11 cm to 7 cm, 93%.
   */
  longest: 0.11,
  shortest: 0.07,
  /**
   * The distance of the front edge of the natural bars in front of the player. At 0.40 m, the
   * left wrist of the badger bent 64° at the lowest bars, and the paws went 2.9 cm into the belly.
   */
  front: 0.42,
  /** The gap between the far end of a natural bar and the near end of the sharp bar behind it. */
  rowGap: 0.005,
  /** The radius of the head of each mallet: smaller than a real head, as the bars. */
  head: 0.012,
  /** The length of each mallet from the grip to the middle of its head. */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  mallet: 0.3 as number,
  /**
   * A mallet strikes a sharp bar this far from its near end, at the edge near the player, as a
   * real player strikes it (`docs/reference/percussion-technique.md` 9).
   */
  sharpStrike: 0.02,
  /**
   * The angle of each mallet below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians ({@link PAW_TILT}): the shaft crosses the palm under the curled claws and
   * leaves the fist at the side of the thumb, in the matched grip of the snare drum
   * (`docs/reference/percussion-technique.md` 9). At 1.05, the shaft ran 30° from the fingers and
   * left the paw along the claws, with the claw tips 2.9 cm off it.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletTilt: PAW_TILT,
  /** The grip of each mallet in the closed paw ({@link PAW_SPOT}). */
  malletSpot: PAW_SPOT,
} as const;

/**
 * The snare drum, in meters (design 4.6). The top head is below the shoulders of the badger, and
 * the drum stands far enough in front of it for the sticks of 0.30 m.
 */
export const SNARE_DRUM = {
  radius: 0.15,
  depth: 0.13,
  /**
   * The height of the top head: about the height of the wrists of the badger in the play, so that
   * the sticks are almost level, as a real player holds them
   * (`docs/reference/percussion-technique.md` 6).
   */
  top: 0.46,
  /**
   * The distance of the middle of the drum in front of the player. The stretched arms of the
   * Tripo badger reach each strike spot from here (`pnpm hold-fit snare-drummer`).
   */
  forward: 0.45,
  /**
   * The angle of each mallet below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians ({@link PAW_TILT}).
   */
  malletTilt: PAW_TILT,
  /** The grip of each mallet in the closed paw ({@link PAW_SPOT}). */
  malletSpot: PAW_SPOT,
  /**
   * The radius of the ball at the tip of each stick, in meters. The hold lifts each strike target
   * by it (`PercussionHold.offsetL`, `offsetR`), so that the ball touches the head and does not go
   * into it.
   */
  tip: 0.008,
  /** The length of each stick from the grip to the middle of the ball at its tip, in meters. */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  stick: 0.3 as number,
  /**
   * The length of each stick behind its grip, in meters ({@link MALLET_BUTT}): one third of the
   * whole stick, so that the paw holds the stick one third up from the butt, as a real player
   * holds it (`docs/reference/percussion-technique.md` 6). The length in front of the grip stays
   * {@link SNARE_DRUM.stick}: with the grip 0.24 m from the middle of the ball, the short arms of
   * the badger missed each strike by 3.5 cm. With the butt of 0.04 m of the other sticks, the
   * paw held the stick 12% up from the butt. The whole stick is 0.45 m, a little longer than a
   * real stick of 16 inches.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletButt: 0.15 as number,
} as const;

/**
 * The size of the badger against a person, for the bass drum and its beater: the head top of the
 * standing badger mesh (1.038 m) over the mean height of an adult, 1.683 m, the mean of the men
 * (175.3 cm) and the women (161.3 cm) of the US survey of 2015 to 2018 (CDC, Vital and Health
 * Statistics series 3, no. 46, tables 9 and 11). A real size times this scale gives the size for
 * the badger.
 */
const BADGER_SCALE = 1.038 / 1.683;

/**
 * The length of a concert bass drum beater for the orchestra, in meters, and the radius of its
 * head (Vic Firth BD3, `docs/reference/percussion-technique.md` 5).
 */
const BEATER = { length: 0.419, head: 0.0349 } as const;

/**
 * The bass drum on its stand, in meters (design 4.6): in front of the player, with its heads to
 * the left and to the right. The player stands behind the drum, and the beater in the right paw
 * strikes the right head, as a real player does (`docs/reference/percussion-technique.md` 5).
 */
export const BASS_DRUM = {
  /**
   * The middle of the drum, from the floor under the player. The right head stands 0.21 m to the
   * right of the middle of the player, so that the right paw holds the beater at its near rim, out
   * from the trunk, and the shell stands in front of the belly. With the head 0.23 m to the right,
   * the left forearm of the Tripo badger went 1.6 cm into the belly, and with 0.26 m, 2.7 cm. The
   * middle stands 0.45 m high, so that the top hoop stays below the snout of the leaning badger:
   * at 0.48 m with the larger drum of 36 inches, the snout touched the top hoop. A drum 4 cm
   * further forward put the beater 4.5 cm from its strike targets, because the arm reaches no
   * further (`pnpm hold-fit bass-drummer`).
   */
  center: [0.0847, 0.45, -0.49],
  /**
   * The radius of the heads: a concert bass drum of 32 by 16 inches at the {@link BADGER_SCALE},
   * the smallest of the real concert bass drums (32 to 40 inches wide).
   */
  radius: 0.4064 * BADGER_SCALE,
  /** The depth of the shell, from the same drum at the {@link BADGER_SCALE}. */
  depth: 0.4064 * BADGER_SCALE,
  /**
   * The turn of the axis of the drum around the vertical from the x axis, in degrees: 0 puts the
   * heads to the left and to the right of the player.
   */
  turn: 0,
  /**
   * The angle of the beater below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians ({@link PAW_TILT}): the shaft leaves the fist at the side of the thumb, in the
   * grip of the legato stroke of the snare drum (`docs/reference/percussion-technique.md` 5). The
   * curled claws close on it in each sample of `pnpm wind-grip bass-drummer`, and the paw twists
   * 3° on the forearm in the play. At 0.9, the shaft ran 52° from the fingers, the claw tips stood
   * 2.3 cm off it, and the paw twisted 31°.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletTilt: PAW_TILT,
  /** The grip of each mallet in the closed paw ({@link PAW_SPOT}). */
  malletSpot: PAW_SPOT,
  /**
   * The length of the shaft behind its grip, in meters ({@link MALLET_BUTT}). The butt end stays
   * in the wrist of the thick forearm, so no view shows it. With the 14 cm of a real grip one
   * third up from the butt (`docs/reference/percussion-technique.md` 5), the butt end came out of
   * the forearm in some strikes.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletButt: 0.095 as number,
  /**
   * The length of the beater from the grip to the middle of its head: 24.4 cm, the length of a
   * real beater from a grip one third up from its butt, with no scale, as the snare sticks
   * ({@link SNARE_DRUM.stick}). With the length at the {@link BADGER_SCALE} (14.2 cm), only 5 cm
   * of the shaft showed between the fist and the head, and the beater looked as a ball on the
   * fist.
   */
  mallet: (2 * BEATER.length) / 3 - BEATER.head,
  /** The radius of the head of the beater: the head of the real beater at the scale of the drum. */
  ball: BEATER.head * BADGER_SCALE,
} as const;

/** The tambourine, in meters (design 4.6). */
export const TAMBOURINE = {
  /**
   * The place of the middle of the old tambourine on its stand, from the floor under the player:
   * at the front right of the player. The footprint of the trap table keeps the form of that stand
   * ({@link TRAP_TABLE}), so that the seats do not move.
   */
  mount: [0.25, 0.45, -0.35],
  /**
   * The place of the tambourine in the closed left paw, in the axes of the piece of the left paw
   * ({@link TRIANGLE_PINCH}): the middle of the frame, from the pinch of the thumb and the fingers
   * on the frame. In the bind pose, the tambourine lies flat in front of the hanging paw with its
   * head up, as the triangle does.
   */
  grip: [0, -0.106, 0.0225],
} as const;

/**
 * The padded trap table of the small percussion player, in meters, in the axes of the player
 * model with the floor under the player at the origin (design 4.6). A real player lays the
 * instruments that it does not play on a padded trap table (`docs/reference/percussion-technique.md`
 * 8). The table stands in front of the belly of the badger, below the triangle, and in the reach of
 * the short arms.
 */
export const TRAP_TABLE = {
  /** The height of the top of the pad. */
  top: 0.42,
  /** The least x and z of the top. */
  min: [-0.36, -0.44],
  /** The largest x and z of the top. */
  max: [0.26, -0.2],
  /**
   * The hook of the triangle on its stand at the left of the player, in the axes of the player
   * model: the clip hangs there, beside the belly and in the reach of the short left arm.
   */
  hook: [-0.25, 0.63, -0.12],
  /**
   * The distance of the post of the stand out to the left of the hook. A short arm on the post
   * holds the clip. With 0.04 m, the empty post stood close beside the left arm while the left paw
   * held the triangle.
   */
  post: 0.12,
} as const;

/** The place of a switched piece on the trap table (design 4.6, 5.3). */
export interface TablePlace {
  /** The origin of the piece on the table, in the axes of the player model. */
  readonly at: Vec3;
  /**
   * The world rotation of the paw that puts the piece on the table, from the bind pose. The piece
   * keeps its place in the paw, so its axes on the table are this rotation times the rotation of
   * its hold.
   */
  readonly hand: Quat;
}

/**
 * The places of the switched pieces on the trap table (design 4.6, 5.3). The triangle hangs from
 * the hook of its stand with the turn of the left paw that holds it in the play
 * (`PERCUSSION_PLACES.triangleTurn` of `pose/percussion-rig.ts`), so that the paw does not turn to
 * hang it there. The tambourine lies flat with the turn of the paw that holds it in the play
 * (`TAMBOURINE_HOLD` of `pose/percussion-rig.ts`), with its head turned up: a turn of -54° around
 * the vertical from the bind pose. It lies in the middle of the table and toward its far edge, so
 * that the triangle in the raised left paw hangs beside it: at the left and near edge, the lower
 * corner of the triangle went into its head. The right paw lays the beater down with the palm down
 * and the fingers forward, so that the beater lies flat and points forward and in.
 */
export const TABLE_PLACES = {
  tambourine: {
    at: [0, TRAP_TABLE.top + 0.0225, -0.29],
    hand: toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -54 * MathUtils.DEG2RAD)),
  },
  triangle: {
    at: TRAP_TABLE.hook,
    hand: [-0.664463, 0.241845, 0.241845, 0.664463],
  },
  beater: {
    at: [0.2, TRAP_TABLE.top + 0.008, -0.2],
    // The bind x axis goes up, the bind y axis back, and the bind z axis to the right.
    hand: toQuat(
      new Quaternion().setFromRotationMatrix(
        new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)),
      ),
    ),
  },
} as const satisfies Readonly<Record<'tambourine' | 'triangle' | 'beater', TablePlace>>;

/**
 * The switched pieces of the small percussion player, in the order of their copies
 * (`PieceCopies` of `models/instruments/hold.ts`): copy `2 p` of piece `p` lies on the trap table,
 * and copy `2 p + 1` is in a paw.
 */
export const SWITCHED_PIECES = ['tambourine', 'triangle', 'beater'] as const;

/** The triangle and its beater, which the small percussion player holds (design 4.6). */
export const TRIANGLE = {
  /**
   * The angle of the beater below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians: the beater runs 56° from the fingers, under the curled claws, so that they
   * close on it (`pnpm wind-grip percussionist`: the paw grasps in 88% of the play and in each
   * lift and rest sample). At 1 (33° from the fingers), the claw tips stood 2.1 cm off the beater,
   * and the paw grasped in no sample. With {@link PAW_TILT}, the turn of the paw jumped up to 38°
   * in 0.01 s.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletTilt: 0.6 as number,
  /** The grip of each mallet in the closed paw ({@link PAW_SPOT}). */
  malletSpot: PAW_SPOT,
  /**
   * The length of the shaft behind its grip, in meters ({@link MALLET_BUTT}): the butt end
   * sticks out 2 cm behind the paw, as a real player holds 13 mm to 25 mm behind the hand
   * (`docs/reference/percussion-technique.md` 1). With 4 cm, it stays in the paw.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  malletButt: 0.07 as number,
  /** The length of each side of the triangle, from corner to corner. */
  side: 0.17,
  /**
   * The distance from each closed corner to the ends of its round bend, along each side. The bend
   * stays out of the middle of the right side, which the beater strikes.
   */
  bend: 0.012,
  /** The distance from the open corner to each end of the rod, along its side. */
  gap: 0.014,
  /** The radius of the rod of the triangle. */
  rod: 0.005,
  /** The radius of the metal rod of the beater. */
  beater: 0.0035,
} as const;

/**
 * The clip of the triangle and its loop of cord, in meters, in the axes of the piece of the
 * triangle: the triangle hangs in the plane x-y, along -y, with its top corner 0.05 m below the
 * origin. The left paw of the badger holds the upper end of the clip at the origin, between the
 * tip of the thumb and the curled fingers, as a real player holds it
 * (`docs/reference/percussion-technique.md` 8), and the clip hangs down from it.
 */
export const TRIANGLE_CLIP = {
  /** The upper end of the clip, between the thumb and the fingers. */
  clip: [0, 0.01, 0],
  /** The lower end of the clip, where the loop goes through it. */
  clipEnd: [0, -0.025, 0],
  /**
   * The points where the loop meets the two upper sides of the triangle, just below its top
   * corner: the distance to each side of the middle, and the height.
   */
  loop: [0.006, -0.06],
} as const satisfies Readonly<Record<'clip' | 'clipEnd', Vec3> & { loop: readonly number[] }>;

/**
 * The place of the triangle in the hanging left paw of the bind pose (design 4.6): the origin of
 * its piece at the tip of the thumb, where the thumb and the curled fingers meet
 * ({@link TRIANGLE_CLIP}), from the middle of the palm, in head heights `H`: toward the palm, down
 * along the fingers, and forward toward the thumb. The piece points forward, as a mallet does, so
 * that the triangle hangs down from the thumb when the paw takes its turn of the play, with the
 * thumb down (`PERCUSSION_PLACES.triangleTurn`).
 */
const TRIANGLE_PINCH = {
  at: [0.03, -0.06, -0.15],
  turn: toQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 90 * MathUtils.DEG2RAD)),
} satisfies { readonly at: Vec3; readonly turn: Quat };

/** The faces around the axis of a kettle. */
const KETTLE_SEGMENTS = 16;

/**
 * The scale of the radius of a kettle of {@link KETTLE_SEGMENTS} faces, so that its box is the
 * box of the first kettle of 8 faces: cos(π / 8) / cos(π / 16).
 */
const KETTLE_FIT = Math.cos(Math.PI / 8) / Math.cos(Math.PI / 16);

/**
 * Gives the radius of the head of a kettle of the timpani: the radius of its bowl of
 * {@link KETTLE_SEGMENTS} faces.
 *
 * @param index The index of the kettle, 0 for the largest.
 * @returns The radius, in meters.
 */
export function kettleHeadRadius(index: number): number {
  return (TIMPANI.radii[index] ?? 0) * KETTLE_FIT;
}

/**
 * The parts of a kettle of the timpani around its head, in meters, as a concert timpano with a
 * copper bowl in a frame of struts (design 4.6, `docs/reference/orchestra-latest.png`): the
 * counter hoop under the edge of the head, the tension rods down the bowl to a base ring, the
 * legs with casters, and the tuning pedal at the side of the player.
 */
const KETTLE = {
  /**
   * The counter hoop: its width out from the head, the height of its chrome top band, and the
   * height of its black band under it. The chrome band slopes down and out from the edge of the
   * head, so that a mallet at a strike near the rim does not touch it.
   */
  hoop: { width: 0.016, chrome: 0.014, band: 0.034 },
  /** The number of tension rods around a kettle. */
  rods: 8,
  /** The width of a tension rod around the bowl, and its depth out from the bowl. */
  rod: [0.013, 0.008],
  /** The width, the height, and the depth of the chrome lug of a rod on the counter hoop. */
  lug: [0.02, 0.03, 0.012],
  /**
   * The base ring: its height below the head, in kettle radii, its radius, in head radii, and the
   * height and the width of its section.
   */
  base: { below: 0.98, radius: 0.9, section: [0.022, 0.018] },
  /** The distance of each foot from the axis, in head radii, and the height of each caster. */
  foot: [0.98, 0.035],
  /**
   * The tuning pedal toward the player: the distances of its toe end and of its heel end from the
   * axis, in head radii, their heights, and the width of the foot plate. The toe end is high near
   * the drum, as on a balanced action pedal, and the heel end is near the floor.
   */
  pedal: { toe: [0.45, 0.15], heel: [0.92, 0.035], width: 0.09 },
} as const;

/** The faces around the axis of the base ring of a kettle. */
const BASE_SEGMENTS = 12;

/** The pitch classes of the sharp keys. */
const SHARPS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

/** The rotation that turns the piece +x to the front of the player (-z), with +y up. */
const FORWARD = toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));

/**
 * Gives the number of kettles for the timpani notes of a file: two kettles up to C3, three up to
 * F3, and four above (design 4.6).
 *
 * @param highestKey The highest MIDI key of the timpani notes.
 * @returns The number of kettles.
 */
export function kettleCount(highestKey: number): KettleCount {
  if (highestKey <= TIMPANI.keys[1][1]) {
    return 2;
  }
  return highestKey <= TIMPANI.keys[2][1] ? 3 : 4;
}

/**
 * The length of the shaft of a mallet, a stick, or a beater behind its grip, in meters: the butt
 * end, which sticks out behind the hand of a real player (`docs/reference/percussion-technique.md`
 * 1).
 */
const MALLET_BUTT = 0.04;

/**
 * Gives the length of the shaft behind the grip of the mallets of an instrument, in meters: the
 * own butt of the timpani, the bass drum, the snare drum, and the triangle beater, and
 * {@link MALLET_BUTT} for the other mallets.
 *
 * @param id The instrument.
 * @returns The butt length.
 */
export function malletButt(id: InstrumentId): number {
  switch (id) {
    case 'timpani':
      return TIMPANI.malletButt;
    case 'bass-drum':
      return BASS_DRUM.malletButt;
    case 'small-percussion':
      return TRIANGLE.malletButt;
    case 'snare-drum':
      return SNARE_DRUM.malletButt;
    default:
      return MALLET_BUTT;
  }
}

/**
 * Gives the offset of a grip from the palm point, in head heights, in the model axes of the bind
 * pose: the palm of the left paw faces +x, the fingers point down, and the thumb points forward,
 * along -z.
 *
 * @param spot The grip.
 * @param bone The bone of the mallet: `malletL` in the left paw.
 * @returns The offset.
 */
function spotOffset(spot: MalletSpot, bone: 'malletL' | 'malletR'): Vec3 {
  const [palm, fingers, thumb] = spot;
  return [bone === 'malletL' ? palm : -palm, -fingers, -thumb];
}

/** A mallet, a stick, or a beater, and its target. */
interface HandTool {
  readonly piece: InstrumentPiece;
  readonly target: PlayTarget;
}

/**
 * The look of a mallet, a stick, or a beater: the parts along +x from the grip at the origin, in
 * the axes of the piece.
 */
type MalletLook = (piece: PieceBuilder, length: number, butt: number) => void;

/** The faces of a box of `box()` of `primitives.ts`, in the order of its corner list. */
type BoxFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** The faces of a box in the order of the corner list of `box()`, two triangles each. */
const BOX_FACES: readonly BoxFace[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

/**
 * Makes a box with its center at the origin, with only some of its faces: a face that the
 * instrument always hides needs no triangles.
 *
 * @param width The size on x.
 * @param height The size on y.
 * @param depth The size on z.
 * @param faces The faces to keep.
 * @returns 2 triangles for each face.
 */
function openBox(
  width: number,
  height: number,
  depth: number,
  faces: readonly BoxFace[],
): number[] {
  const all = box(width, height, depth);
  return BOX_FACES.flatMap((face, i) =>
    faces.includes(face) ? all.slice(i * 18, i * 18 + 18) : [],
  );
}

/**
 * Makes a solid of revolution around the y axis with no flat caps at its end rings: a band, such
 * as a hoop, whose ends meet other parts.
 *
 * @param profile The profile ({@link lathe}).
 * @param segments The number of faces around the axis.
 * @returns 2 triangles for each segment of each profile step, less the triangles at a radius of
 *   0.
 */
function band(profile: readonly ProfilePoint[], segments: number): number[] {
  const corners = lathe(profile, segments);
  const caps = [profile[0], profile.at(-1)].filter((p) => (p?.[0] ?? 0) > 0).length;
  return corners.slice(0, corners.length - caps * segments * 9);
}

/**
 * Adds a flat strut from one point to another: a box with its outer face and its two sides, and
 * no ends and no inner face, which the parts at its ends and behind it hide.
 *
 * @param piece The piece.
 * @param from The middle of the first end.
 * @param to The middle of the second end.
 * @param size The width of the strut across, and its depth toward `outward`.
 * @param outward The direction of the outer face.
 * @param color The color.
 * @param finish The finish.
 */
function strut(
  piece: PieceBuilder,
  from: Vec3,
  to: Vec3,
  size: readonly [width: number, depth: number],
  outward: Vec3,
  color: Rgb,
  finish: Finish,
): void {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const corners = openBox(a.distanceTo(b), size[1], size[0], ['+y', '+z', '-z']);
  const middle = toVec3(a.clone().add(b).multiplyScalar(0.5));
  piece.add(corners, color, transform(middle, pointing(toVec3(b.sub(a)), outward)), finish);
}

/** The rotation that turns the y axis of a lathe onto the x axis of a mallet. */
const ALONG_X = toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2));

/** The radius of the shaft of a mallet, in meters. */
const SHAFT = 0.0055;

/**
 * Gives the look of a mallet with a round head: a shaft of 6 faces and a ball, such as the felt
 * mallet of the timpani or the yarn mallet of the suspended cymbal.
 *
 * @param head The radius of the head.
 * @param headColor The color of the head.
 * @param segments The faces around the axis of the head. The head has half as many rings, at
 *   least 4.
 * @returns The look.
 */
function roundMallet(head: number, headColor: Rgb, segments = 6): MalletLook {
  return (piece, length, butt) => {
    piece.rod(
      [-butt, 0, 0],
      [length - 0.5 * head, 0, 0],
      SHAFT,
      6,
      INSTRUMENT_COLORS.stick,
      'varnish',
    );
    piece.add(
      ball(head, segments, Math.max(4, segments / 2)),
      headColor,
      transform([length, 0, 0], ALONG_X),
    );
  };
}

/**
 * The look of a snare drum stick: a hickory stick with a round butt, a long taper toward the tip,
 * a thin neck, and an oval bead (design 4.6). The bead has the radius of `SNARE_DRUM.tip`, and its
 * middle is at the length of the stick.
 */
const SNARE_STICK: MalletLook = (piece, length, butt) => {
  const tip = SNARE_DRUM.tip;
  const profile: readonly ProfilePoint[] = [
    [0, -butt],
    [SHAFT, 0.004 - butt],
    [SHAFT, length - 0.1],
    [0.45 * SHAFT, length - 0.013],
    [0.8 * tip, length - 0.006],
    [tip, length],
    [0.7 * tip, length + 0.6 * tip],
    [0, length + tip],
  ];
  piece.add(lathe(profile, 6), INSTRUMENT_COLORS.stick, transform([0, 0, 0], ALONG_X), 'varnish');
};

/**
 * The look of the steel beater of the triangle: a rod with a black grip sleeve at the paw, and no
 * head.
 */
const TRIANGLE_BEATER: MalletLook = (piece, length, butt) => {
  const metal = INSTRUMENT_COLORS.silver;
  piece.rod([0.03, 0, 0], [length, 0, 0], TRIANGLE.beater, 6, metal, 'metal');
  piece.rod([-butt, 0, 0], [0.03, 0, 0], 0.006, 6, INSTRUMENT_COLORS.hardware);
};

/** The place and the look of one mallet, stick, or beater in a paw. */
interface MalletHold {
  /** The length from the grip to the middle of the head. */
  readonly length: number;
  /** The angle of the mallet below the level in the bind pose, in radians. */
  readonly tilt: number;
  /** The grip in the closed paw ({@link MalletSpot}). */
  readonly spot: MalletSpot;
  /** The length of the shaft behind the grip ({@link MALLET_BUTT}). */
  readonly butt: number;
  /** The parts of the mallet. */
  readonly look: MalletLook;
  /**
   * The radius of the ball of the layout form of the mallet, or 0 for no ball. The layout form is
   * a shaft of 4 faces with an icosphere at its end, so that a change of the look does not move
   * the seats (`InstrumentPiece.footprint`).
   */
  readonly space: number;
}

/**
 * Builds a mallet: a stick along +x from the grip at the origin, with its head at the length. In
 * the bind pose, it lies in the hanging hand and points forward.
 *
 * @param bone The bone of the mallet.
 * @param m The place and the look of the mallet.
 * @returns The piece and the target at the middle of the head.
 */
function mallet(bone: 'malletL' | 'malletR', m: MalletHold): HandTool {
  const piece = new PieceBuilder();
  m.look(piece, m.length, m.butt);
  piece.footprintRod([-m.butt, 0, 0], [m.length, 0, 0], SHAFT, 4);
  if (m.space > 0) {
    piece.footprint(icosphere(m.space), transform([m.length, 0, 0]));
  }
  const palm = bone === 'malletL' ? 'palmL' : 'palmR';
  // The tilt turns the forward mallet down around the x axis of the player.
  const turn =
    m.tilt === 0
      ? FORWARD
      : toQuat(
          new Quaternion()
            .setFromAxisAngle(new Vector3(1, 0, 0), -m.tilt)
            .multiply(new Quaternion(...FORWARD)),
        );
  return {
    piece: piece.build(bone, hold(palm, spotOffset(m.spot, bone), turn)),
    target: {
      kind: 'mallet-head',
      bone,
      from: [m.length, 0, 0],
      to: [m.length, 0, 0],
      normal: [0, -1, 0],
      keys: null,
    },
  };
}

/**
 * Builds a pair of mallets, one in each paw.
 *
 * @param m The place and the look of each mallet.
 * @param right The place of the right mallet, when it differs.
 * @returns The left and the right mallet.
 */
function malletPair(m: MalletHold, right: MalletHold = m): readonly [HandTool, HandTool] {
  return [mallet('malletL', m), mallet('malletR', right)];
}

/** The faces around the axis of a drum, its hoops, and the tambourine. */
const DRUM_SEGMENTS = 16;

/** The look of a drum around its shell and its heads, in meters (design 4.6). */
interface DrumLook {
  /** The color of the shell. */
  readonly shell: Rgb;
  /** The finish of the shell. */
  readonly shellFinish: Finish;
  /**
   * The hoop at each head: its width out from the shell, its height down the shell from the head,
   * its rise above the head, its color, and its finish. The rise keeps the hoop low, so that a
   * stick or a beater near the head does not touch it.
   */
  readonly hoop: {
    readonly width: number;
    readonly down: number;
    readonly rise: number;
    readonly color: Rgb;
    readonly finish: Finish;
  };
  /**
   * The lugs on the middle of the shell: their number, and the width, the length along the axis,
   * and the depth of each lug. A chrome tension rod runs from hoop to hoop under each lug.
   */
  readonly lugs: { readonly count: number; readonly size: readonly [number, number, number] };
}

/**
 * Adds a drum: a shell with a head at each end along an axis, a hoop at each head, and the lugs
 * and the tension rods on the shell (design 4.6).
 *
 * @param piece The piece.
 * @param center The middle of the drum.
 * @param axis The unit direction from the back head to the front head.
 * @param radius The radius of the heads.
 * @param depth The depth of the shell.
 * @param look The look of the drum.
 */
function addDrum(
  piece: PieceBuilder,
  center: Vec3,
  axis: Vec3,
  radius: number,
  depth: number,
  look: DrumLook,
): void {
  const turn = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3(...axis).normalize(),
  );
  const at = transform(center, toQuat(turn));
  const end = depth / 2;
  // One profile from the middle of the bottom head, over the bottom hoop, up the shell, over the
  // top hoop, and in over the top head: one closed solid, because the clearance probes read only
  // closed solids (design 9.3). Each hoop has its underside on the shell, its outer wall, its rim
  // beyond the head, and its inner lip down to the head.
  const { hoop, lugs } = look;
  const out = radius + hoop.width;
  const inside = radius - 0.003;
  const rim = end + hoop.rise;
  const steps: readonly (readonly [readonly ProfilePoint[], Rgb, Finish])[] = [
    [
      [
        [0, -end],
        [inside, -end],
      ],
      INSTRUMENT_COLORS.drumHead,
      'matte',
    ],
    [
      [
        [inside, -end],
        [inside, -rim],
        [out, -rim],
        [out, hoop.down - end],
        [radius, hoop.down - end],
      ],
      hoop.color,
      hoop.finish,
    ],
    [
      [
        [radius, hoop.down - end],
        [radius, end - hoop.down],
      ],
      look.shell,
      look.shellFinish,
    ],
    [
      [
        [radius, end - hoop.down],
        [out, end - hoop.down],
        [out, rim],
        [inside, rim],
        [inside, end],
      ],
      hoop.color,
      hoop.finish,
    ],
    [
      [
        [inside, end],
        [0, end],
      ],
      INSTRUMENT_COLORS.drumHead,
      'matte',
    ],
  ];
  for (const [profile, color, finish] of steps) {
    piece.add(band(profile, DRUM_SEGMENTS), color, at, finish);
  }
  const [lugWidth, lugLength, lugDepth] = lugs.size;
  const rodLength = depth - 2 * hoop.down;
  const parts: number[] = [];
  const rods: number[] = [];
  for (let i = 0; i < lugs.count; i++) {
    const a = ((i + 0.5) / lugs.count) * 2 * Math.PI;
    const spin = toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a));
    const place = (lift: number): Transform =>
      transform([(radius + lift) * Math.sin(a), 0, (radius + lift) * Math.cos(a)], spin);
    parts.push(
      ...placeCorners(
        openBox(lugWidth, lugLength, lugDepth, ['+x', '-x', '+y', '-y', '+z']),
        place(lugDepth / 2),
      ),
    );
    rods.push(...placeCorners(openBox(0.004, rodLength, 0.004, ['+x', '-x', '+z']), place(0.004)));
  }
  piece.add(rods, INSTRUMENT_COLORS.silver, at, 'metal');
  piece.add(parts, INSTRUMENT_COLORS.silver, at, 'metal');
}

/**
 * Adds the layout form of a drum to a footprint: a shell of 12 faces with a head at each end,
 * along an axis.
 *
 * @param piece The footprint ({@link PieceBuilder.space}).
 * @param center The middle of the drum.
 * @param axis The unit direction from the back head to the front head.
 * @param radius The radius of the heads.
 * @param depth The depth of the shell.
 */
function drumSpace(piece: PartSink, center: Vec3, axis: Vec3, radius: number, depth: number): void {
  const corners = lathe(
    [
      [radius, -depth / 2],
      [radius, depth / 2],
    ],
    12,
  );
  const [top, rest] = splitByFacing(corners, [0, 1, 0], 0.99);
  const [bottom, wall] = splitByFacing(rest, [0, -1, 0], 0.99);
  const turn = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3(...axis).normalize(),
  );
  const at = transform(center, toQuat(turn));
  piece.add(wall, INSTRUMENT_COLORS.drumShell, at);
  piece.add([...top, ...bottom], INSTRUMENT_COLORS.drumHead, at);
}

/**
 * Adds one kettle of the timpani ({@link KETTLE}): the head, the copper bowl, the counter hoop,
 * the tension rods with their lugs, the base ring, three legs with casters, and the tuning pedal.
 *
 * @param piece The piece.
 * @param center The point on the floor under the axis of the kettle.
 * @param r The radius of the kettle ({@link TIMPANI.radii}).
 */
function addKettle(piece: PieceBuilder, center: Vec3, r: number): void {
  const y = TIMPANI.headHeight;
  const { hoop, base, foot, pedal } = KETTLE;
  const colors = INSTRUMENT_COLORS;
  const at = transform(center);
  // The head of the bowl of 16 faces has the real radius, and the bowl keeps the box of the
  // first bowl of 8 faces (KETTLE_FIT).
  const head = KETTLE_FIT * r;
  const chrome = y - hoop.chrome;
  const under = chrome - hoop.band;
  // One profile from the bottom of the bowl up to the rolled lip, over the hoop, and in over the
  // head: one closed solid, because the clearance probes read only closed solids (design 9.3).
  // The bowl is a deep round parabola.
  const out = head + hoop.width;
  const steps: readonly (readonly [readonly ProfilePoint[], Rgb, Finish])[] = [
    [
      [
        [0, y - 1.05 * r],
        [0.4 * head, y - 1 * r],
        [0.68 * head, y - 0.89 * r],
        [0.87 * head, y - 0.7 * r],
        [0.97 * head, y - 0.45 * r],
        [head, y - 0.2 * r],
        [head, under],
      ],
      colors.kettle,
      'metal',
    ],
    [
      [
        [head, under],
        [out, under],
        [out, chrome],
      ],
      colors.timpaniBlack,
      'lacquer',
    ],
    [
      [
        [out, chrome],
        [head, y],
      ],
      colors.silver,
      'metal',
    ],
    [
      [
        [head, y],
        [0, y],
      ],
      colors.drumHead,
      'matte',
    ],
  ];
  for (const [profile, color, finish] of steps) {
    piece.add(band(profile, KETTLE_SEGMENTS), color, at, finish);
  }
  // The tension rods run from the counter hoop down outside the bowl to the base ring. Each rod
  // stands at the middle of a face of the bowl, where the bowl is nearest to the axis.
  const low = y - base.below * r;
  const [lugWidth, lugHeight, lugDepth] = KETTLE.lug;
  const around = (radius: number, height: number, turn: number): Vec3 => [
    center[0] + radius * Math.sin(turn),
    height,
    center[2] + radius * Math.cos(turn),
  ];
  for (let i = 0; i < KETTLE.rods; i++) {
    const turn = (i / KETTLE.rods) * 2 * Math.PI;
    const outward: Vec3 = [Math.sin(turn), 0, Math.cos(turn)];
    strut(
      piece,
      around(out, under + 0.002, turn),
      around(base.radius * head + base.section[1] / 2, low, turn),
      KETTLE.rod,
      outward,
      colors.timpaniBlack,
      'lacquer',
    );
    piece.add(
      openBox(lugWidth, lugHeight, lugDepth, ['+x', '-x', '+y', '+z']),
      colors.silver,
      transform(
        around(out + lugDepth / 2 - 0.004, under + lugHeight / 2, turn),
        toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn)),
      ),
      'metal',
    );
  }
  const [ringHeight, ringWidth] = base.section;
  const inner = base.radius * head;
  // The base ring shows its outer wall and its top. Only a camera on the floor sees its bottom.
  piece.add(
    band(
      [
        [inner + ringWidth, low - ringHeight / 2],
        [inner + ringWidth, low + ringHeight / 2],
        [inner, low + ringHeight / 2],
      ],
      BASE_SEGMENTS,
    ),
    colors.timpaniBlack,
    at,
    'lacquer',
  );
  // The pedal points to the player at the origin, and the legs stand away from it.
  const toPlayer = Math.atan2(-center[0], -center[2]);
  const [reach, caster] = foot;
  for (let leg = 0; leg < 3; leg++) {
    const turn = toPlayer + ((leg + 0.5) / 3) * 2 * Math.PI;
    const outward: Vec3 = [Math.sin(turn), 0, Math.cos(turn)];
    const end = around(reach * head, caster, turn);
    strut(
      piece,
      around(inner + ringWidth / 2, low, turn),
      end,
      [0.02, 0.014],
      outward,
      colors.timpaniBlack,
      'lacquer',
    );
    piece.add(
      openBox(0.03, caster, 0.03, ['+x', '-x', '+y', '+z', '-z']),
      colors.hardware,
      transform([end[0], caster / 2, end[2]]),
    );
  }
  const toe = around(pedal.toe[0] * head, pedal.toe[1], toPlayer);
  const heel = around(pedal.heel[0] * head, pedal.heel[1], toPlayer);
  const step = new Vector3(...heel).sub(new Vector3(...toe));
  piece.add(
    box(step.length(), 0.014, pedal.width),
    colors.timpaniBlack,
    transform(
      toVec3(new Vector3(...toe).addScaledVector(step, 0.5)),
      pointing(toVec3(step), [0, 1, 0]),
    ),
    'metal',
  );
  strut(
    piece,
    toe,
    around(pedal.toe[0] * head, y - 0.96 * r, toPlayer),
    [0.016, 0.016],
    [Math.sin(toPlayer), 0, Math.cos(toPlayer)],
    colors.timpaniBlack,
    'lacquer',
  );
}

/**
 * Adds the layout form of one kettle to the footprint of the piece (`InstrumentPiece.footprint`):
 * a bowl of 16 faces from the head down to its bottom, on three legs. Thus the parts of the
 * kettle do not move the seats (design 4.6).
 *
 * @param piece The piece.
 * @param center The point on the floor under the axis of the kettle.
 * @param r The radius of the kettle ({@link TIMPANI.radii}).
 */
function addKettleSpace(piece: PieceBuilder, center: Vec3, r: number): void {
  const y = TIMPANI.headHeight;
  const head = KETTLE_FIT * r;
  const profile: readonly ProfilePoint[] = [
    [0, y - 1.05 * r],
    [0.45 * head, y - 0.98 * r],
    [0.75 * head, y - 0.8 * r],
    [0.93 * head, y - 0.5 * r],
    [head, y - 0.2 * r],
    [head, y - 0.035],
    [head, y],
  ];
  piece.footprint(lathe(profile, KETTLE_SEGMENTS), transform(center));
  for (let leg = 0; leg < 3; leg++) {
    const turn = ((leg + 0.5) / 3) * 2 * Math.PI + Math.PI / 2;
    const top = new Vector3(
      0.55 * head * Math.sin(turn),
      y - 0.9 * r,
      0.55 * head * Math.cos(turn),
    );
    const foot = new Vector3(0.85 * head * Math.sin(turn), 0.01, 0.85 * head * Math.cos(turn));
    piece.footprintRod(
      toVec3(top.add(new Vector3(...center))),
      toVec3(foot.add(new Vector3(...center))),
      0.012,
      4,
    );
  }
}

/**
 * Builds the timpani: two to four kettles with their heads, and two mallets (design 4.6). The
 * kettles stand on the floor around the player, and the player stands.
 *
 * @param kettles The number of kettles: the largest kettles of {@link TIMPANI}.
 * @returns The model.
 */
export function buildTimpani(kettles: KettleCount): InstrumentModel {
  const t = TIMPANI;
  const piece = new PieceBuilder();
  const radii = t.radii.slice(0, kettles);
  // Each kettle takes the angle of its outer radius (the corners of its 8 faces) and a gap of
  // 0.06 m on the arc. The arc is centered on the front, or the front gap is.
  const widths = radii.map((r) => 2 * Math.asin((r / Math.cos(Math.PI / 8) + 0.03) / t.arc));
  const split = Math.ceil(radii.length / 2);
  const front = 2 * Math.asin(t.front / 2 / t.arc);
  const leftWidth = widths.slice(0, split).reduce((sum, w) => sum + w, 0);
  const total = widths.reduce((sum, w) => sum + w, 0);
  let angle = t.front > 0 ? -(leftWidth + front / 2) : -total / 2;
  const targets: PlayTarget[] = [];
  for (const [i, r] of radii.entries()) {
    if (i === split) {
      angle += front;
    }
    const w = widths[i] ?? 0;
    const a = angle + w / 2;
    angle += w;
    const distance = i === split - 1 || i === split ? t.arc : Math.max(t.arc, t.side);
    const center: Vec3 = [distance * Math.sin(a), 0, -distance * Math.cos(a)];
    const y = t.headHeight;
    addKettle(piece, center, r);
    addKettleSpace(piece, center, r);
    const keys = t.keys[i] ?? t.keys[0];
    const point = toVec3(new Vector3(...center).add(new Vector3(0, y, 0)));
    targets.push({
      kind: 'head',
      bone: 'instrument',
      from: point,
      to: point,
      normal: [0, 1, 0],
      keys,
    });
  }
  const tilt = t.malletTilt;
  const timpaniMallet: MalletHold = {
    length: 0.3,
    tilt,
    spot: t.malletSpotL,
    butt: t.malletButt,
    look: roundMallet(0.025, INSTRUMENT_COLORS.felt, 8),
    space: 0.025,
  };
  const [left, right] = malletPair(timpaniMallet, { ...timpaniMallet, spot: t.malletSpotR });
  const instrument = piece.build('instrument', hold('floor'));
  return {
    id: 'timpani',
    parent: 'root',
    pieces: [instrument, left.piece, right.piece],
    grips: handGrips(),
    targets: [...targets, left.target, right.target],
    size: pieceSize(instrument),
  };
}

/**
 * Gives the grips of a player with a mallet in each hand: each palm holds its mallet at the grip.
 *
 * @returns The grips.
 */
function handGrips(): InstrumentModel['grips'] {
  return {
    palmL: { bone: 'malletL', at: [0, 0, 0] },
    palmR: { bone: 'malletR', at: [0, 0, 0] },
    mouth: null,
    chin: null,
  };
}

/**
 * Adds the layout form of a stand to a footprint: a post and three legs on the floor.
 *
 * @param piece The footprint ({@link PieceBuilder.space}).
 * @param base The point on the floor under the post.
 * @param top The top of the post.
 * @param spread The distance of the feet from the post.
 */
function tripodSpace(piece: PartSink, base: Vec3, top: Vec3, spread: number): void {
  const color = INSTRUMENT_COLORS.hardware;
  piece.rod(base, top, 0.01, 4, color);
  const knee = toVec3(new Vector3(...base).add(new Vector3(0, 0.12, 0)));
  // Each foot is one leg radius above the floor, so that the slanted end of the leg stays above
  // it.
  const leg = 0.007;
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 + 60) * MathUtils.DEG2RAD;
    const foot = new Vector3(...base).add(
      new Vector3(spread * Math.sin(a), leg, spread * Math.cos(a)),
    );
    piece.rod(knee, toVec3(foot), leg, 4, color);
  }
}

/**
 * The look of the bass drum (design 4.6), as a Yamaha CB-7036 concert bass drum: a lacquered
 * shell, wood hoops, and 12 chrome lugs.
 */
const BASS_DRUM_LOOK: DrumLook = {
  shell: INSTRUMENT_COLORS.drumShell,
  shellFinish: 'varnish',
  hoop: {
    width: 0.014,
    down: 0.03,
    rise: 0.006,
    color: INSTRUMENT_COLORS.drumHoop,
    finish: 'varnish',
  },
  lugs: { count: 12, size: [0.022, 0.07, 0.012] },
};

/**
 * Adds the stand of the bass drum: two black A frames under the shell, each with a rubber pad on
 * which the shell lies, a cross bar between them, and a caster under each foot.
 *
 * @param piece The piece.
 * @param axis The unit axis of the drum.
 * @param across The unit direction along the floor across the axis.
 */
function addBassDrumStand(piece: PieceBuilder, axis: Vector3, across: Vector3): void {
  const { center, radius } = BASS_DRUM;
  const black = INSTRUMENT_COLORS.timpaniBlack;
  const floor = new Vector3(center[0], 0, center[2]);
  const caster = 0.03;
  // Each pad lies under the shell at the side of a frame.
  const side = 0.57 * radius;
  const pad = center[1] - Math.sqrt(radius * radius - side * side) - 0.012;
  for (const s of [-1, 1]) {
    const top = floor
      .clone()
      .addScaledVector(across, s * side)
      .setY(pad);
    for (const t of [-1, 1]) {
      const foot = floor
        .clone()
        .addScaledVector(across, s * 0.62 * radius)
        .addScaledVector(axis, t * 0.55 * radius)
        .setY(caster);
      strut(
        piece,
        toVec3(top.clone().addScaledVector(axis, t * 0.03)),
        toVec3(foot),
        [0.02, 0.016],
        toVec3(across.clone().multiplyScalar(s)),
        black,
        'lacquer',
      );
      piece.add(
        openBox(0.03, caster, 0.03, ['+x', '-x', '+y', '+z', '-z']),
        INSTRUMENT_COLORS.hardware,
        transform([foot.x, caster / 2, foot.z]),
      );
    }
    piece.add(
      box(0.12, 0.024, 0.045),
      INSTRUMENT_COLORS.hardware,
      transform(toVec3(top.clone().setY(pad + 0.004)), pointing(toVec3(axis), [0, 1, 0])),
    );
  }
  piece.bar(
    toVec3(
      floor
        .clone()
        .addScaledVector(across, -0.62 * radius)
        .setY(0.08),
    ),
    toVec3(
      floor
        .clone()
        .addScaledVector(across, 0.62 * radius)
        .setY(0.08),
    ),
    0.02,
    0.02,
    black,
    'lacquer',
  );
}

/**
 * Builds the bass drum on its stand, and one beater (design 4.6). The drum stands in front of the
 * player, with its heads to the left and to the right.
 *
 * @returns The model.
 */
export function buildBassDrum(): InstrumentModel {
  const piece = new PieceBuilder();
  const { radius, depth, center } = BASS_DRUM;
  const axis = new Vector3(1, 0, 0).applyQuaternion(
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), BASS_DRUM.turn * MathUtils.DEG2RAD),
  );
  const normal = toVec3(axis);
  addDrum(piece, center, normal, radius, depth, BASS_DRUM_LOOK);
  const across = new Vector3(axis.z, 0, -axis.x).normalize();
  addBassDrumStand(piece, axis, across);
  // The layout form: the shell, two posts, and a cross bar.
  const space = piece.space();
  drumSpace(space, center, normal, radius, depth);
  // The stand: a frame under the drum, from the floor to the shell. Its legs and its cross bar
  // scale with the heads.
  for (const side of [-1, 1]) {
    const foot = new Vector3(center[0], 0, center[2]).addScaledVector(across, side * 0.57 * radius);
    space.rod(
      toVec3(foot),
      toVec3(foot.clone().add(new Vector3(0, center[1] - radius + 0.02, 0))),
      0.012,
      4,
      INSTRUMENT_COLORS.hardware,
    );
  }
  // The cross bar turns with the drum, so its corners reach 0.022 m from its middle.
  const barMiddle = new Vector3(center[0], 0.025, center[2]);
  space.bar(
    toVec3(barMiddle.clone().addScaledVector(across, -0.71 * radius)),
    toVec3(barMiddle.clone().addScaledVector(across, 0.71 * radius)),
    0.03,
    0.03,
    INSTRUMENT_COLORS.hardware,
  );
  const beater = mallet('malletR', {
    length: BASS_DRUM.mallet,
    tilt: BASS_DRUM.malletTilt,
    spot: BASS_DRUM.malletSpot,
    butt: BASS_DRUM.malletButt,
    look: roundMallet(BASS_DRUM.ball, INSTRUMENT_COLORS.felt, 8),
    space: BASS_DRUM.ball,
  });
  const instrument = piece.build('instrument', hold('floor'));
  const head = toVec3(new Vector3(...center).addScaledVector(axis, depth / 2));
  return {
    id: 'bass-drum',
    parent: 'root',
    pieces: [instrument, beater.piece],
    grips: { palmL: null, palmR: { bone: 'malletR', at: [0, 0, 0] }, mouth: null, chin: null },
    targets: [
      { kind: 'head', bone: 'instrument', from: head, to: head, normal, keys: null },
      beater.target,
    ],
    size: pieceSize(instrument),
  };
}

/**
 * The look of the snare drum (design 4.6), as a concert snare drum of 14 by 6.5 inches (Ludwig
 * Supraphonic LM402): a shell with triple flanged chrome hoops and 10 chrome lugs. The shell has
 * the lacquer of the bass drum, as a matched concert set.
 */
const SNARE_DRUM_LOOK: DrumLook = {
  shell: INSTRUMENT_COLORS.drumShell,
  shellFinish: 'varnish',
  hoop: {
    width: 0.008,
    down: 0.018,
    rise: 0.005,
    color: INSTRUMENT_COLORS.silver,
    finish: 'metal',
  },
  lugs: { count: 10, size: [0.016, 0.05, 0.012] },
};

/**
 * Adds the snares of the snare drum: the strainer on the side of the shell, at the right of the
 * player, and the band of snare wires across the bottom head.
 *
 * @param piece The piece.
 * @param center The middle of the drum.
 */
function addSnares(piece: PieceBuilder, center: Vec3): void {
  const { radius, depth } = SNARE_DRUM;
  const metal = INSTRUMENT_COLORS.silver;
  piece.add(
    openBox(0.012, 0.045, 0.026, ['+x', '+y', '-y', '+z', '-z']),
    metal,
    transform([center[0] + radius + 0.006, center[1], center[2]]),
    'metal',
  );
  piece.add(
    openBox(2 * radius - 0.02, 0.003, 0.07, ['-y', '+z', '-z']),
    metal,
    transform([center[0], center[1] - depth / 2 - 0.0015, center[2]]),
    'metal',
  );
}

/**
 * Adds a stand on the floor: a chrome post with a black clamp, on three black legs with braces
 * from the low end of the post and rubber feet, as the stand of a snare drum or a suspended cymbal.
 *
 * @param piece The piece.
 * @param base The point on the floor under the post.
 * @param top The top of the post.
 * @param spread The distance of the feet from the post.
 */
function addStand(piece: PieceBuilder, base: Vec3, top: Vec3, spread: number): void {
  const black = INSTRUMENT_COLORS.timpaniBlack;
  const at = (height: number): Vector3 => new Vector3(base[0], height, base[2]);
  piece.rod(toVec3(at(0.05)), top, 0.009, 6, INSTRUMENT_COLORS.silver, 'metal');
  const clamp = Math.min(top[1] - 0.06, 0.32);
  piece.add(box(0.03, 0.04, 0.03), black, transform(toVec3(at(clamp))));
  const hub = 0.16;
  piece.add(box(0.032, 0.03, 0.032), black, transform(toVec3(at(hub))));
  const foot = 0.012;
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 + 60) * MathUtils.DEG2RAD;
    const out = new Vector3(Math.sin(a), 0, Math.cos(a));
    const end = at(foot).addScaledVector(out, spread);
    strut(piece, toVec3(at(hub)), toVec3(end), [0.014, 0.01], [0, 1, 0], black, 'lacquer');
    const middle = at(hub).lerp(end, 0.55);
    strut(piece, toVec3(at(0.06)), toVec3(middle), [0.008, 0.006], [0, 1, 0], black, 'lacquer');
    piece.add(
      openBox(0.03, 2 * foot, 0.022, ['+x', '-x', '+y', '+z', '-z']),
      INSTRUMENT_COLORS.hardware,
      transform([end.x, foot, end.z], pointing(toVec3(out), [0, 1, 0])),
    );
  }
}

/**
 * Adds the basket of a snare drum stand: three chrome arms from the top of the post out to the
 * bottom hoop, each with a rubber tip that holds the hoop.
 *
 * @param piece The piece.
 * @param hub The top of the post.
 * @param hoop The height of the lower edge of the bottom hoop.
 */
function addBasket(piece: PieceBuilder, hub: Vec3, hoop: number): void {
  const reach = SNARE_DRUM.radius + 0.004;
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 + 60) * MathUtils.DEG2RAD;
    const tip: Vec3 = [hub[0] + reach * Math.sin(a), hoop - 0.008, hub[2] + reach * Math.cos(a)];
    strut(piece, hub, tip, [0.01, 0.008], [0, 1, 0], INSTRUMENT_COLORS.silver, 'metal');
    piece.add(
      openBox(0.018, 0.026, 0.018, ['+x', '-x', '+y', '+z', '-z']),
      INSTRUMENT_COLORS.hardware,
      transform([tip[0], hoop - 0.002, tip[2]]),
    );
  }
}

/**
 * Builds the snare drum on its stand, and two sticks (design 4.6). The drum stands in front of
 * the player at the height of the hips, with its heads up and down.
 *
 * @returns The model.
 */
export function buildSnareDrum(): InstrumentModel {
  const piece = new PieceBuilder();
  const { radius, depth, top } = SNARE_DRUM;
  const center: Vec3 = [0, top - depth / 2, -SNARE_DRUM.forward];
  addDrum(piece, center, [0, 1, 0], radius, depth, SNARE_DRUM_LOOK);
  addSnares(piece, center);
  const hub: Vec3 = [center[0], top - depth - 0.05, center[2]];
  addStand(piece, [center[0], 0, center[2]], hub, 0.24);
  addBasket(piece, hub, top - depth - SNARE_DRUM_LOOK.hoop.down);
  // The layout form: the shell on a tripod.
  const space = piece.space();
  drumSpace(space, center, [0, 1, 0], radius, depth);
  tripodSpace(space, [center[0], 0, center[2]], [center[0], top - depth, center[2]], 0.24);
  const tilt = SNARE_DRUM.malletTilt;
  const spot = SNARE_DRUM.malletSpot;
  const [left, right] = malletPair({
    length: SNARE_DRUM.stick,
    tilt,
    spot,
    butt: SNARE_DRUM.malletButt,
    look: SNARE_STICK,
    space: SNARE_DRUM.tip,
  });
  const instrument = piece.build('instrument', hold('floor'));
  const head: Vec3 = [center[0], top, center[2]];
  return {
    id: 'snare-drum',
    parent: 'root',
    pieces: [instrument, left.piece, right.piece],
    grips: handGrips(),
    targets: [
      { kind: 'head', bone: 'instrument', from: head, to: head, normal: [0, 1, 0], keys: null },
      left.target,
      right.target,
    ],
    size: pieceSize(instrument),
  };
}

/**
 * The height of the strap of a cymbal above the palm in the bind pose, in meters (design 4.6).
 * The hanging hand holds the cymbal below its middle, so that the rim (0.2 m from the strap)
 * stays above the floor. With the strap at the palm, the rim of a small player with the palm
 * 0.105 m above the floor cuts 0.08 m into the floor.
 */
const CYMBAL_LIFT = 0.12;

/** The faces around the axis of a cymbal. */
const CYMBAL_SEGMENTS = 16;

/**
 * The layout form of a cymbal of the scale 1 around its axis (+y), in meters: from the inner face
 * at the axis out to the rim, then back over the dome to the bell, with 12 faces around the axis.
 */
const CYMBAL_SPACE: readonly ProfilePoint[] = [
  [0, -0.023],
  [0.06, -0.041],
  [0.2 / Math.cos(15 * MathUtils.DEG2RAD), -0.045],
  [0.065, -0.033],
  [0.045, -0.017],
  [0, -0.01],
];

/**
 * The rings of a cymbal of the scale 1 around its axis (+y), in meters, as an orchestral cymbal
 * (design 4.6): from the inner face at the axis out to the rim, then back over the bow to the
 * bell. Each ring is a profile and a color. The bow has lathe grooves, so its rings alternate a
 * polished bronze and a darker groove bronze. The 16 faces around the axis make the cymbal 0.40 m
 * wide between two opposite faces, and the bow stays within 1 mm of the straight bow of
 * {@link CYMBAL_SPACE}, so that a mallet at the edge strikes it at the same height.
 */
const CYMBAL_RINGS: readonly (readonly [readonly ProfilePoint[], Rgb])[] = (() => {
  const rim = 0.2 / Math.cos(Math.PI / CYMBAL_SEGMENTS);
  const bronze = INSTRUMENT_COLORS.brass;
  const groove = INSTRUMENT_COLORS.cymbalGroove;
  // The bow ends exactly at the foot of the bell, so that the rings make one closed solid for the
  // clearance probes (design 9.3).
  const bow: ProfilePoint[] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    if (i === 6) {
      return [0.065, -0.033];
    }
    const r = rim - 0.004 - (i / 6) * (rim - 0.004 - 0.065);
    // A straight line from the bell to the rim, with a slight dome of up to 0.7 mm.
    const share = (r - 0.065) / (rim - 0.065);
    return [r, -0.033 - 0.012 * share + 0.003 * share * (1 - share)];
  });
  return [
    [
      [
        [0, -0.023],
        [0.05, -0.034],
        [0.064, -0.041],
        [0.14, -0.0438],
        [rim, -0.045],
        bow[0] ?? [rim, -0.045],
      ],
      bronze,
    ],
    ...bow
      .slice(0, -1)
      .map((p, i): readonly [readonly ProfilePoint[], Rgb] => [
        [p, bow[i + 1] ?? p],
        i % 2 === 1 ? groove : bronze,
      ]),
    [
      [
        [0.065, -0.033],
        [0.058, -0.025],
        [0.046, -0.016],
        [0, -0.01],
      ],
      bronze,
    ],
  ];
})();

/** The height of the rim of a cymbal of the scale 1 on its axis, from the strap at the bell. */
const CYMBAL_RIM = -0.045;

/** The height of the inner face of a cymbal of the scale 1 at its axis, from the strap. */
const CYMBAL_INNER = -0.023;

/** A cymbal: its piece, its target, and the point of the piece at the palm. */
interface Cymbal extends HandTool {
  readonly grip: Vec3;
}

/**
 * Adds the plate of a cymbal ({@link CYMBAL_RINGS}) with its strap point at a place, bell up.
 *
 * @param piece The piece.
 * @param at The strap point at the top of the bell.
 * @param scale The scale of the cymbal.
 */
function addCymbalPlate(piece: PieceBuilder, at: Vec3, scale: number): void {
  for (const [profile, color] of CYMBAL_RINGS) {
    const scaled = profile.map(([r, y]): ProfilePoint => [r * scale, y * scale]);
    piece.add(band(scaled, CYMBAL_SEGMENTS), color, transform(at), 'metal');
  }
}

/**
 * Adds the leather strap of a hand cymbal: a knot on the bell, and a loop above it, which the
 * thumb and the forefinger hold near the bell (`docs/reference/percussion-technique.md` 7).
 *
 * @param piece The piece of the cymbal.
 */
function addStrap(piece: PieceBuilder): void {
  const leather = INSTRUMENT_COLORS.leather;
  piece.add(box(0.03, 0.012, 0.012), leather, transform([0, -0.004, 0]));
  const loop: readonly Vec3[] = [
    [-0.012, 0, 0],
    [-0.016, 0.022, 0],
    [0, 0.032, 0],
    [0.016, 0.022, 0],
    [0.012, 0, 0],
  ];
  for (let i = 0; i + 1 < loop.length; i++) {
    piece.bar(loop[i] ?? [0, 0, 0], loop[i + 1] ?? [0, 0, 0], 0.003, 0.016, leather);
  }
}

/**
 * Adds the top of the stand of a suspended cymbal: a felt washer under and over the bell, and a
 * wing nut on the rod above them.
 *
 * @param piece The piece.
 * @param center The strap point at the top of the bell.
 * @param scale The scale of the cymbal.
 */
function addCymbalNut(piece: PieceBuilder, center: Vec3, scale: number): void {
  const felt = INSTRUMENT_COLORS.felt;
  const at = (dy: number): Vec3 => [center[0], center[1] + dy, center[2]];
  piece.add(cylinder(0.022, 0.022, 0.008, 8), felt, transform(at(CYMBAL_INNER * scale - 0.008)));
  piece.add(cylinder(0.022, 0.022, 0.008, 8), felt, transform(at(-0.0105 * scale)));
  piece.add(box(0.03, 0.01, 0.008), INSTRUMENT_COLORS.silver, transform(at(0.01)), 'metal');
}

/**
 * Builds one crash cymbal: a flat cone with a dome, 0.40 m wide at the scale 1. The strap is at
 * the origin on the outer side, and the inner face looks along -y. In the bind pose, the strap is
 * {@link CYMBAL_LIFT} above the palm. The scale shrinks the cymbal and the lift toward the palm.
 *
 * @param bone The bone of the cymbal.
 * @param scale The scale of the cymbal (`SpeciesParams.cymbalScale`).
 * @returns The piece, the target at the middle of the plane of the rim on the inner side, and the
 *   grip of the palm.
 */
function cymbal(bone: 'malletL' | 'malletR', scale: number): Cymbal {
  const piece = new PieceBuilder(scale);
  const lift = CYMBAL_LIFT * scale;
  addCymbalPlate(piece, [0, 0, 0], 1);
  addStrap(piece);
  const space = piece.space();
  space.add(lathe(CYMBAL_SPACE, 12), INSTRUMENT_COLORS.brass);
  space.add(box(0.03, 0.012, 0.012), INSTRUMENT_COLORS.hardware, transform([0, -0.004, 0]));
  // The inner face of the left cymbal looks to the right (+x), and the right cymbal to the left.
  const inward: Vec3 = bone === 'malletL' ? [1, 0, 0] : [-1, 0, 0];
  const palm = bone === 'malletL' ? 'palmL' : 'palmR';
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, -1, 0),
    new Vector3(...inward),
  );
  return {
    piece: piece.build(bone, hold(palm, [0, 0, 0], toQuat(rotation), [0, lift, 0])),
    grip: toVec3(new Vector3(0, -lift, 0).applyQuaternion(rotation.clone().invert())),
    // The rims of two plates meet first, so the target is the plane of the rim, and `to` is a
    // corner of the rim.
    target: {
      kind: 'plate',
      bone,
      from: [0, CYMBAL_RIM * scale, 0],
      to: [(0.2 / Math.cos(Math.PI / CYMBAL_SEGMENTS)) * scale, CYMBAL_RIM * scale, 0],
      normal: [0, -1, 0],
      keys: null,
    },
  };
}

/**
 * Builds the pair of crash cymbals (design 4.6). The player holds one cymbal in each hand, below
 * its strap. The model has no instrument piece.
 *
 * @param scale The scale of the cymbals for the species of the player
 *   (`SpeciesParams.cymbalScale`): 1 gives cymbals 0.40 m wide.
 * @returns The model.
 */
export function buildCymbals(scale = 1): InstrumentModel {
  const left = cymbal('malletL', scale);
  const right = cymbal('malletR', scale);
  return {
    id: 'cymbals',
    parent: 'chest',
    pieces: [left.piece, right.piece],
    grips: {
      palmL: { bone: 'malletL', at: left.grip },
      palmR: { bone: 'malletR', at: right.grip },
      mouth: null,
      chin: null,
    },
    targets: [left.target, right.target],
    size: pieceSize(left.piece),
  };
}

/**
 * The suspended cymbal on its stand, in meters (design 4.6): one cymbal of the size of a hand
 * cymbal of the app, level on a stand in front of the player, which strikes it with a yarn
 * mallet in each hand (`SpeciesParams.cymbalForm`). A real player rolls with the two mallets
 * near the edge, about opposite each other, and plays single notes at the edge
 * (`docs/reference/percussion-technique.md` 7).
 */
export const SUSPENDED_CYMBAL = {
  /** The height of the rim above the floor. */
  height: 0.5,
  /**
   * The distance of the middle of the cymbal in front of the player. The stretched arms of the
   * Tripo badger reach each strike spot from here (`pnpm hold-fit cymbalist`).
   */
  forward: 0.42,
  /** The radius of the yarn ball of each mallet. */
  ball: 0.02,
  /**
   * The angle of each mallet below the level in the bind pose, toward the fingers of the hanging
   * paw, in radians ({@link PAW_TILT}): a real player holds the mallets in the matched grip of
   * the snare drum.
   */
  malletTilt: PAW_TILT,
  /** The grip of each mallet in the closed paw ({@link PAW_SPOT}). */
  malletSpot: PAW_SPOT,
} as const;

/**
 * Builds a suspended cymbal on its stand, and two yarn mallets (design 4.6). The cymbal stands
 * level in front of the player, with its bell up. The target is the middle of the cymbal at the
 * height of a mallet ball on the rim, and the offset of each hand moves it to the playing spot
 * near the edge on its side (`PercussionHold.offsetL`).
 *
 * @param scale The scale of the cymbal (`SpeciesParams.cymbalScale`): 1 gives a cymbal 0.40 m
 *   wide.
 * @returns The model.
 */
export function buildSuspendedCymbal(scale: number): InstrumentModel {
  const c = SUSPENDED_CYMBAL;
  const piece = new PieceBuilder();
  // The bell is up, so the rim hangs below the strap. The plate is a piece of its own on the
  // `slide` bone, with its pivot at the middle of the bell, so that it can swing after a strike.
  const center: Vec3 = [0, c.height - CYMBAL_RIM * scale, -c.forward];
  const plate = new PieceBuilder();
  addCymbalPlate(plate, [0, 0, 0], scale);
  const under = center[1] + CYMBAL_INNER * scale;
  addStand(piece, [center[0], 0, center[2]], [center[0], center[1] + 0.035, center[2]], 0.24);
  addCymbalNut(piece, center, scale);
  // The layout form: the cymbal of 12 faces on a tripod up to its inner face.
  const space = piece.space();
  const profile = CYMBAL_SPACE.map(([r, y]): ProfilePoint => [r * scale, y * scale]);
  space.add(lathe(profile, 12), INSTRUMENT_COLORS.brass, transform(center));
  tripodSpace(space, [center[0], 0, center[2]], [center[0], under, center[2]], 0.24);
  const [left, right] = malletPair({
    length: 0.3,
    tilt: c.malletTilt,
    spot: c.malletSpot,
    butt: MALLET_BUTT,
    look: roundMallet(c.ball, INSTRUMENT_COLORS.yarn),
    space: c.ball,
  });
  const instrument = piece.build('instrument', hold('floor'));
  const spot: Vec3 = [center[0], c.height + c.ball, center[2]];
  return {
    id: 'cymbals',
    parent: 'root',
    pieces: [
      instrument,
      plate.build('slide', hold('instrument', [0, 0, 0], undefined, center)),
      left.piece,
      right.piece,
    ],
    grips: handGrips(),
    targets: [
      { kind: 'head', bone: 'instrument', from: spot, to: spot, normal: [0, 1, 0], keys: null },
      left.target,
      right.target,
    ],
    size: pieceSize(instrument),
  };
}

/**
 * Adds the tambourine with its head up at y = 0.045 m in its own axes: a varnished wood frame of
 * 0.22 m, a head on its top, and five pairs of jingles in slots of the frame.
 *
 * @param piece The piece.
 * @param at The place of the tambourine.
 */
function addTambourine(piece: PieceBuilder, at: Transform): void {
  const r = 0.11;
  const top = 0.045;
  const wall = 0.008;
  // The head is a thin closed disc, with a face on each side, because the frame is open below it.
  const head = lathe(
    [
      [r - wall, top - 0.001],
      [r - wall, top],
    ],
    DRUM_SEGMENTS,
  );
  piece.add(placeCorners(head, at), INSTRUMENT_COLORS.drumHead);
  const frame = band(
    [
      [r, 0],
      [r, top],
      [r - wall, top],
      [r - wall, 0],
      [r, 0],
    ],
    DRUM_SEGMENTS,
  );
  piece.add(placeCorners(frame, at), INSTRUMENT_COLORS.stick, transform(), 'varnish');
  // Each pair of jingles sits in a slot through the frame, flat in the plane of the head, and
  // shows on both sides of the frame.
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 + 36) * MathUtils.DEG2RAD;
    const jingles = placeCorners(
      cylinder(0.015, 0.015, 0.01, 6),
      transform([(r - wall / 2) * Math.sin(a), 0.0175, (r - wall / 2) * Math.cos(a)]),
    );
    piece.add(placeCorners(jingles, at), INSTRUMENT_COLORS.silver, transform(), 'metal');
  }
}

/**
 * Adds the layout form of the tambourine to a footprint: a ring of 12 faces with five boxes for
 * the jingles, on a tripod.
 *
 * @param sink The footprint ({@link PieceBuilder.space}).
 * @param tilt The lean of the tambourine.
 */
function tambourineSpace(sink: PartSink, tilt: Quaternion): void {
  const metal = INSTRUMENT_COLORS.silver;
  const { mount } = TAMBOURINE;
  const mountAt = new Vector3(...mount);
  tripodSpace(
    sink,
    [mount[0], 0, mount[2]],
    toVec3(mountAt.clone().add(new Vector3(0, -0.04, 0))),
    0.2,
  );
  const ring = lathe(
    [
      [0.11, 0],
      [0.11, 0.045],
    ],
    12,
  );
  const [head, shell] = splitByFacing(ring, [0, 1, 0], 0.99);
  const ringAt: Transform = transform(mount, toQuat(tilt));
  sink.add(shell, INSTRUMENT_COLORS.drumShell, ringAt);
  sink.add(head, INSTRUMENT_COLORS.drumHead, ringAt);
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 + 36) * MathUtils.DEG2RAD;
    const at = new Vector3(0.11 * Math.sin(a), 0.022, 0.11 * Math.cos(a))
      .applyQuaternion(tilt)
      .add(mountAt);
    const turn = tilt.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a));
    sink.add(box(0.03, 0.02, 0.012), metal, transform(toVec3(at), toQuat(turn)), 'metal');
  }
}

/**
 * Makes a round tube along a path in the plane x-y, with a ring of corners at each point of the
 * path, square to the path.
 *
 * @param path The points of the path.
 * @param radius The radius of the tube.
 * @param sides The corners of each ring.
 * @returns The corner list, with a cap at each end.
 */
function tube(path: readonly Vec3[], radius: number, sides: number): number[] {
  const z = new Vector3(0, 0, 1);
  const rings = path.map((p, i) => {
    const before = new Vector3(...(path[Math.max(i - 1, 0)] ?? p));
    const after = new Vector3(...(path[Math.min(i + 1, path.length - 1)] ?? p));
    const along = after.sub(before).normalize();
    const across = new Vector3().crossVectors(along, z);
    return Array.from({ length: sides }, (_, k): Vec3 => {
      const angle = (k / sides) * 2 * Math.PI;
      return toVec3(
        new Vector3(...p)
          .addScaledVector(z, radius * Math.cos(angle))
          .addScaledVector(across, radius * Math.sin(angle)),
      );
    });
  });
  return sweep(rings);
}

/**
 * Adds the triangle in the axes of its piece (design 4.6): a steel rod bent into a triangle with
 * round corners and one open corner at the lower left, and the clip with its loop of cord. The
 * right side, which the beater strikes, keeps its line.
 *
 * @param piece The piece of the triangle.
 */
function addTriangle(piece: PieceBuilder): void {
  const metal = INSTRUMENT_COLORS.silver;
  const { side, bend, gap } = TRIANGLE;
  const top = new Vector3(0, -0.05, 0);
  const low = -0.05 - side * Math.sin(60 * MathUtils.DEG2RAD);
  const right = new Vector3(side / 2, low, 0);
  const left = new Vector3(-side / 2, low, 0);
  const toward = (from: Vector3, to: Vector3, d: number): Vec3 =>
    toVec3(from.clone().add(to.clone().sub(from).setLength(d)));
  // The path starts at the open end on the bottom side, and goes around the right corner and the
  // top corner down to the open end on the left side.
  const path: Vec3[] = [
    toward(left, right, gap),
    toward(right, left, bend),
    toward(right, top, bend),
    toward(top, right, bend),
    toward(top, left, bend),
    toward(left, top, gap),
  ];
  piece.add(tube(path, TRIANGLE.rod, 6), metal, transform(), 'metal');
  // A real player holds the triangle by a clip in the left hand, and the triangle hangs in a loop
  // of cord through the clip (`docs/reference/percussion-technique.md` 8). The clip lies in the
  // palm of the closed left paw and leaves its heel, and the loop goes around the top corner.
  const { clip, clipEnd, loop } = TRIANGLE_CLIP;
  piece.bar(clip, clipEnd, 0.012, 0.006, metal, 'metal');
  for (const sideX of [-1, 1]) {
    const onSide: Vec3 = [sideX * loop[0], loop[1], 0];
    piece.rod(clipEnd, onSide, 0.0018, 4, INSTRUMENT_COLORS.bowHair);
  }
}

/**
 * Adds the layout form of the triangle to a footprint: three straight rods, the clip, and the
 * loop.
 *
 * @param sink The footprint ({@link PieceBuilder.space}).
 */
function triangleSpace(sink: PartSink): void {
  const metal = INSTRUMENT_COLORS.silver;
  const side = TRIANGLE.side;
  const topCorner: Vec3 = [0, -0.05, 0];
  const low = -0.05 - side * Math.sin(60 * MathUtils.DEG2RAD);
  const corners: Vec3[] = [topCorner, [side / 2, low, 0], [-side / 2, low, 0], topCorner];
  for (let i = 0; i + 1 < corners.length; i++) {
    sink.rod(corners[i] ?? topCorner, corners[i + 1] ?? topCorner, 0.005, 4, metal, 'metal');
  }
  const { clip, clipEnd, loop } = TRIANGLE_CLIP;
  sink.bar(clip, clipEnd, 0.012, 0.006, metal, 'metal');
  for (const sideX of [-1, 1]) {
    const onSide: Vec3 = [sideX * loop[0], loop[1], 0];
    sink.rod(clipEnd, onSide, 0.0018, 4, INSTRUMENT_COLORS.bowHair);
  }
}

/**
 * Adds the padded trap table ({@link TRAP_TABLE}): a black pad on a board, on four legs.
 *
 * @param piece The piece of the table.
 */
function addTrapTable(piece: PieceBuilder): void {
  const { top, min, max } = TRAP_TABLE;
  const width = max[0] - min[0];
  const depth = max[1] - min[1];
  const middle = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2] as const;
  piece.add(
    box(width, 0.006, depth),
    INSTRUMENT_COLORS.timpaniBlack,
    transform([middle[0], top - 0.003, middle[1]]),
  );
  piece.add(
    box(width, 0.02, depth),
    INSTRUMENT_COLORS.xylophoneFrame,
    transform([middle[0], top - 0.016, middle[1]]),
    'varnish',
  );
  for (const x of [min[0] + 0.03, max[0] - 0.03]) {
    for (const z of [min[1] + 0.03, max[1] - 0.03]) {
      piece.rod([x, 0, z], [x, top - 0.026, z], 0.01, 6, INSTRUMENT_COLORS.timpaniBlack, 'metal');
    }
  }
  // The stand of the triangle: a post out from the clip on a round foot, and a short arm to the
  // clip.
  const [hx, hy, hz] = TRAP_TABLE.hook;
  const px = hx - TRAP_TABLE.post;
  const post: Vec3 = [px, hy + 0.02, hz];
  piece.add(
    cylinder(0.06, 0.06, 0.012, 12),
    INSTRUMENT_COLORS.timpaniBlack,
    transform([px, 0, hz]),
    'metal',
  );
  piece.rod([px, 0.012, hz], post, 0.006, 6, INSTRUMENT_COLORS.timpaniBlack, 'metal');
  piece.rod(post, [hx, hy + 0.02, hz], 0.003, 6, INSTRUMENT_COLORS.timpaniBlack, 'metal');
}

/**
 * Makes the copy of a switched piece on the trap table (design 4.6): the parts of the piece at its
 * place on the table ({@link TablePlace}), on the `instrument` bone, with no footprint, because
 * the table keeps the footprint of the old stand.
 *
 * @param piece The piece in its paw.
 * @param place The place on the table.
 * @param copy The index of the copy.
 * @returns The copy.
 */
function tableCopy(piece: InstrumentPiece, place: TablePlace, copy: number): InstrumentPiece {
  const turn = new Quaternion(...place.hand).multiply(new Quaternion(...piece.hold.rotation));
  const at = transform(place.at, toQuat(turn));
  return {
    bone: 'instrument',
    parts: piece.parts.map((part) => ({ ...part, corners: placeCorners(part.corners, at), copy })),
    hold: hold('floor'),
    footprint: [],
  };
}

/**
 * Marks each part of a piece in a paw as a copy of a switched piece (design 4.6).
 *
 * @param piece The piece in its paw.
 * @param copy The index of the copy.
 * @returns The piece with the copy index on each part.
 */
function pawCopy(piece: InstrumentPiece, copy: number): InstrumentPiece {
  return { ...piece, parts: piece.parts.map((part) => ({ ...part, copy })) };
}

/**
 * Builds the instruments of the small percussion player (design 4.6): the triangle in the left
 * hand, its metal beater in the right hand, and the tambourine on a padded trap table in front of
 * the player. Each of the three pieces has one copy on the table and one copy in its paw
 * ({@link SWITCHED_PIECES}), and the pose shows one of the two (design 5.3). The right hand strikes
 * the tambourine for key 54: in the left paw, or on the table with the beater.
 *
 * @returns The model.
 */
export function buildSmallPercussion(): InstrumentModel {
  const table = new PieceBuilder();
  addTrapTable(table);
  // The footprint keeps the old tambourine, which leaned 30° to the player on its stand.
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 30 * MathUtils.DEG2RAD);
  tambourineSpace(table.space(), tilt);
  const tablePiece = table.build('instrument', hold('floor'));
  // The tambourine in the left paw lies in the axes of the piece of the triangle, with its head
  // along -z of the piece: up in the bind pose.
  const held = new PieceBuilder();
  const headTurn = toQuat(
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -90 * MathUtils.DEG2RAD),
  );
  addTambourine(held, transform(TAMBOURINE.grip, headTurn));
  const tambourine = held.build('malletL', hold('palmL', TRIANGLE_PINCH.at, TRIANGLE_PINCH.turn));
  const headInPaw = toVec3(
    new Vector3(0, 0.045, 0)
      .applyQuaternion(new Quaternion(...headTurn))
      .add(new Vector3(...TAMBOURINE.grip)),
  );
  const normalInPaw = toVec3(new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...headTurn)));
  const onTable = TABLE_PLACES.tambourine;
  const tableTurn = new Quaternion(...onTable.hand).multiply(
    new Quaternion(...tambourine.hold.rotation),
  );
  const headOnTable = toVec3(
    new Vector3(...headInPaw).applyQuaternion(tableTurn).add(new Vector3(...onTable.at)),
  );

  // The triangle hangs 0.05 m below the origin of its piece, in the plane x-y. In the bind pose,
  // it points forward from the hanging hand, as a mallet does, so that it stays above the floor.
  // Else it hangs 0.2 m down and cuts 0.08 m into the floor.
  const triangle = new PieceBuilder();
  addTriangle(triangle);
  triangleSpace(triangle.space());
  const side = TRIANGLE.side;
  const barMiddle: Vec3 = [side / 4, -0.05 - (side * Math.sin(60 * MathUtils.DEG2RAD)) / 2, 0];
  const beater = mallet('malletR', {
    length: 0.15,
    tilt: TRIANGLE.malletTilt,
    spot: TRIANGLE.malletSpot,
    butt: TRIANGLE.malletButt,
    look: TRIANGLE_BEATER,
    space: 0,
  });
  const trianglePiece = triangle.build(
    'malletL',
    hold('palmL', TRIANGLE_PINCH.at, TRIANGLE_PINCH.turn),
  );
  return {
    id: 'small-percussion',
    parent: 'root',
    pieces: [
      tablePiece,
      tableCopy(tambourine, TABLE_PLACES.tambourine, 0),
      tableCopy(trianglePiece, TABLE_PLACES.triangle, 2),
      tableCopy(beater.piece, TABLE_PLACES.beater, 4),
      pawCopy(tambourine, 1),
      pawCopy(trianglePiece, 3),
      pawCopy(beater.piece, 5),
    ],
    grips: handGrips(),
    targets: [
      {
        kind: 'head',
        bone: 'instrument',
        from: headOnTable,
        to: headOnTable,
        normal: toVec3(new Vector3(...normalInPaw).applyQuaternion(tableTurn)),
        keys: [54, 54],
      },
      {
        kind: 'head',
        bone: 'malletL',
        from: headInPaw,
        to: headInPaw,
        normal: normalInPaw,
        keys: [54, 54],
      },
      {
        kind: 'bar',
        bone: 'malletL',
        from: barMiddle,
        to: barMiddle,
        normal: toVec3(
          new Vector3(
            Math.sin(60 * MathUtils.DEG2RAD),
            Math.cos(60 * MathUtils.DEG2RAD),
            0,
          ).normalize(),
        ),
        keys: null,
      },
      beater.target,
    ],
    size: pieceSize(tablePiece),
  };
}

/**
 * Counts the natural keys of the xylophone below a key.
 *
 * @param key The MIDI key.
 * @returns The number of natural keys from C5 up to the key, the key excluded.
 */
function naturalsBelow(key: number): number {
  let count = 0;
  for (let k = XYLOPHONE.keys[0]; k < key; k++) {
    if (!SHARPS.has(k % 12)) {
      count++;
    }
  }
  return count;
}

/** The number of natural bars of the xylophone. */
const NATURALS = naturalsBelow(XYLOPHONE.keys[1] + 1);

/**
 * Calculates the length of a bar: the bars get shorter from the lowest to the highest.
 *
 * @param position The place of the bar from 0 (lowest) to 1 (highest).
 * @returns The length of the bar.
 */
function barLength(position: number): number {
  return XYLOPHONE.longest + (XYLOPHONE.shortest - XYLOPHONE.longest) * position;
}

/**
 * Calculates the middle of the top of a xylophone bar, in the xylophone axes.
 *
 * @param key The MIDI key of a bar.
 * @returns The point, and the length of the bar.
 */
function barTop(key: number): readonly [top: Vec3, length: number] {
  const x = XYLOPHONE;
  const left = (-NATURALS * x.pitch) / 2;
  const index = naturalsBelow(key);
  const length = barLength(index / (NATURALS - 1));
  if (SHARPS.has(key % 12)) {
    const near = x.front + length + x.rowGap;
    return [[left + index * x.pitch, x.barHeight + 0.02, -(near + length / 2)], length];
  }
  return [[left + (index + 0.5) * x.pitch, x.barHeight, -(x.front + length / 2)], length];
}

/**
 * Calculates the place on a xylophone bar where a mallet strikes it, in the xylophone axes. A
 * mallet strikes a natural bar at its middle, and a sharp bar near its near end.
 *
 * @param key The MIDI key. A key outside the xylophone plays the nearest bar.
 * @returns The point on the top of the bar.
 */
export function xylophoneBarPosition(key: number): Vec3 {
  const x = XYLOPHONE;
  const k = Math.min(Math.max(Math.round(key), x.keys[0]), x.keys[1]);
  const [top, length] = barTop(k);
  if (SHARPS.has(k % 12)) {
    return [top[0], top[1], top[2] + length / 2 - x.sharpStrike];
  }
  return top;
}

/**
 * The resonator tubes and the frame of the xylophone, in meters (design 4.6), as a concert
 * xylophone with rosewood bars (Musser M50): an aluminum tube under each bar, and a dark frame on
 * casters.
 */
const XYLOPHONE_FRAME = {
  /** The radius of each resonator tube, within the width of its bar. */
  tube: 0.011,
  /** The gap from the bottom of a bar down to the open top of its tube. */
  gap: 0.012,
  /** The speed of sound in the air at 20 °C, in meters per second, for the tube lengths. */
  sound: 343,
  /**
   * The share of the length of a bar from each end to the node line, where the rail holds the
   * bar: a free bar vibrates with its nodes at 0.224 of its length from each end.
   */
  node: 0.224,
  /** The height and the width of each rail under a node line. */
  rail: [0.03, 0.02],
  /** The height of each caster. */
  caster: 0.035,
} as const;

/**
 * Adds the resonator tube under a bar of the xylophone: an aluminum tube with no end faces. The
 * bar hides its open top, and only a camera on the floor sees its bottom. Its length is a quarter
 * of the wavelength of the note of the bar, as a tube with a closed end resonates at that length.
 *
 * @param piece The piece.
 * @param key The MIDI key of the bar.
 * @param top The middle of the top of the bar.
 */
function addResonator(piece: PieceBuilder, key: number, top: Vec3): void {
  const f = XYLOPHONE_FRAME;
  const pitch = 440 * 2 ** ((key - 69) / 12);
  const length = f.sound / (4 * pitch);
  const mouth = top[1] - 0.02 - f.gap;
  piece.add(
    band(
      [
        [f.tube, mouth - length],
        [f.tube, mouth],
      ],
      6,
    ),
    INSTRUMENT_COLORS.silver,
    transform([top[0], 0, top[2]]),
    'metal',
  );
}

/**
 * Adds a beam from one point to another: a box with its length along the segment and its height
 * up.
 *
 * @param piece The piece.
 * @param from The middle of the first end.
 * @param to The middle of the second end.
 * @param size The height and the width of the beam.
 * @param color The color.
 * @param finish The finish.
 */
function beam(
  piece: PieceBuilder,
  from: Vec3,
  to: Vec3,
  size: readonly [height: number, width: number],
  color: Rgb,
  finish: Finish,
): void {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  piece.add(
    box(a.distanceTo(b), size[0], size[1]),
    color,
    transform(toVec3(a.clone().add(b).multiplyScalar(0.5)), pointing(toVec3(b.sub(a)), [0, 1, 0])),
    finish,
  );
}

/**
 * Adds the frame of the xylophone: a rail under each node line of each row, an end frame at each
 * end with two legs, a foot, and two casters, and a low stretcher between the end frames.
 *
 * @param piece The piece.
 */
function addXylophoneFrame(piece: PieceBuilder): void {
  const x = XYLOPHONE;
  const f = XYLOPHONE_FRAME;
  const color = INSTRUMENT_COLORS.xylophoneFrame;
  const half = (NATURALS * x.pitch) / 2 + 0.03;
  const [railHeight, railWidth] = f.rail;
  // Each node line is straight, because the bar lengths fall linearly from the lowest bar.
  const nodeLines: readonly (readonly [near: number, share: number, top: number])[] = [
    [0, f.node, x.barHeight - 0.02],
    [0, 1 - f.node, x.barHeight - 0.02],
    [1, f.node, x.barHeight],
    [1, 1 - f.node, x.barHeight],
  ];
  const nodeZ = (row: number, share: number, length: number): number =>
    -(x.front + row * (length + x.rowGap) + share * length);
  const ends: number[] = [];
  for (const [row, share, top] of nodeLines) {
    const y = top - railHeight / 2;
    const left = nodeZ(row, share, x.longest);
    const right = nodeZ(row, share, x.shortest);
    beam(piece, [-half, y, left], [half, y, right], f.rail, color, 'varnish');
    ends.push(left, right);
  }
  const low = f.caster;
  for (const side of [-1, 1]) {
    const zs = ends.filter((_, i) => i % 2 === (side < 0 ? 0 : 1));
    const near = Math.max(...zs);
    const far = Math.min(...zs);
    const topY = x.barHeight - 0.02 - railHeight;
    const sx = side * (half + railWidth / 2);
    beam(piece, [sx, topY, near + 0.02], [sx, topY, far - 0.02], [0.03, 0.024], color, 'varnish');
    for (const z of [near, far]) {
      strut(
        piece,
        [sx, topY, z],
        [sx, low + 0.02, z],
        [0.026, 0.02],
        [side, 0, 0],
        color,
        'varnish',
      );
      piece.add(
        openBox(0.03, low, 0.03, ['+x', '-x', '+y', '+z', '-z']),
        INSTRUMENT_COLORS.hardware,
        transform([sx, low / 2, z]),
      );
    }
    beam(
      piece,
      [sx, low + 0.02, near + 0.02],
      [sx, low + 0.02, far - 0.02],
      [0.03, 0.03],
      color,
      'varnish',
    );
  }
  const middle = -(x.front + x.longest);
  beam(piece, [-half, 0.12, middle], [half, 0.12, middle], [0.025, 0.02], color, 'varnish');
}

/**
 * Adds the layout form of the xylophone to a footprint: each bar as a box, two straight rails,
 * and four legs.
 *
 * @param sink The footprint ({@link PieceBuilder.space}).
 */
function xylophoneSpace(sink: PartSink): void {
  const x = XYLOPHONE;
  const bar = (length: number): number[] => {
    const corners = box(x.pitch - 0.005, 0.02, length);
    return [...corners.slice(0, 54), ...corners.slice(72)];
  };
  for (let k = x.keys[0]; k <= x.keys[1]; k++) {
    const [top, length] = barTop(k);
    sink.add(
      bar(length),
      INSTRUMENT_COLORS.xylophoneBars,
      transform([top[0], top[1] - 0.01, top[2]]),
    );
  }
  const half = (NATURALS * x.pitch) / 2 + 0.03;
  const frame = INSTRUMENT_COLORS.xylophoneFrame;
  for (const z of [-(x.front + 0.05), -(x.front + 2 * x.longest)]) {
    sink.bar([-half, x.barHeight - 0.04, z], [half, x.barHeight - 0.04, z], 0.04, 0.03, frame);
  }
  for (const side of [-1, 1]) {
    for (const z of [-(x.front + 0.05), -(x.front + 2 * x.longest)]) {
      sink.rod(
        [side * (half - 0.02), 0, z],
        [side * (half - 0.02), x.barHeight - 0.04, z],
        0.015,
        4,
        frame,
      );
    }
  }
}

/**
 * Builds the xylophone on its frame, and two mallets (design 4.6). It stands in front of the
 * player, with the lowest bar at the left.
 *
 * @returns The model.
 */
export function buildXylophone(): InstrumentModel {
  const x = XYLOPHONE;
  const piece = new PieceBuilder();
  // A bar has no bottom face, which the resonators hide.
  const bar = (length: number): number[] =>
    openBox(x.pitch - 0.005, 0.02, length, ['+x', '-x', '+y', '+z', '-z']);
  for (let k = x.keys[0]; k <= x.keys[1]; k++) {
    const [top, length] = barTop(k);
    piece.add(
      bar(length),
      INSTRUMENT_COLORS.rosewood,
      transform([top[0], top[1] - 0.01, top[2]]),
      'varnish',
    );
    addResonator(piece, k, top);
  }
  addXylophoneFrame(piece);
  xylophoneSpace(piece.space());
  const tilt = x.malletTilt;
  const [left, right] = malletPair({
    length: x.mallet,
    tilt,
    spot: x.malletSpot,
    butt: MALLET_BUTT,
    look: roundMallet(x.head, INSTRUMENT_COLORS.malletRubber),
    space: x.head,
  });
  const instrument = piece.build('instrument', hold('floor'));
  return {
    id: 'xylophone',
    parent: 'root',
    pieces: [instrument, left.piece, right.piece],
    grips: handGrips(),
    targets: [
      {
        kind: 'bars',
        bone: 'instrument',
        from: xylophoneBarPosition(x.keys[0]),
        to: xylophoneBarPosition(x.keys[1]),
        normal: [0, 1, 0],
        keys: x.keys,
      },
      left.target,
      right.target,
    ],
    size: pieceSize(instrument),
  };
}
