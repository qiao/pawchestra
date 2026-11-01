import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { SpeciesId } from '../models/species.ts';
import { placePoint } from '../models/instruments/hold.ts';
import { VIOLIN } from '../models/instruments/strings.ts';
import type { PlayTarget, PlayTargetKind } from '../models/instruments/types.ts';
import { IDENTITY, toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import {
  BOWED_HANDS,
  MIDDLE_FINGER,
  createBowPlaces,
  gripHand,
  heldBowAt,
  instrumentAt,
  restHandAt,
  rollToward,
  shoulderTurn,
  shoulderTurnL,
  stopHandAt,
  stringsAt,
} from './bowed.ts';
import { hangingArm } from './hang.ts';
import type { InstrumentOf } from './family.ts';
import { setFromBasis } from './frames.ts';
import type { TorsoFrames } from './frames.ts';
import { armRig, poseShoulder, solveArm } from './ik.ts';
import { fitCelloPlace } from './cello-place.ts';
import { lapPoint } from './lap.ts';
import type { LapPlace } from './lap.ts';
import type { ArmRig } from './ik.ts';
import type { BowRange } from './strokes.ts';

/** The bowed strings of design 4.6. */
export type BowedInstrument = InstrumentOf<'bowed'>;

/**
 * The values of the hold of each bowed string (design 4.6, 4.7). The directions are in the model
 * axes of the bind pose: the player faces -z, and its left is -x.
 */
export interface BowedHold {
  /** The bow tip points to this side of the strings, across them. */
  readonly tip: Vec3;
  /** The left fingers tilt over the neck to this side of the strings. */
  readonly fingers: Vec3;
  /**
   * The tilt of the left hand from the normal of the strings to the side of
   * {@link BowedHold.fingers}, in the playing pose and the rest pose. The fingers point up from
   * the strings, tilted over the neck, and the palm is below the neck, on the other side.
   */
  readonly tiltL: number;
  /**
   * The direction to which the left elbow points while the player plays, with the finger on the
   * highest string, below the fourth position.
   */
  readonly poleL: Vec3;
  /**
   * The direction toward which the left elbow turns for the lower strings and the high positions
   * (design 5.3): toward the body on the violin and the viola, and up on the cello and the
   * contrabass (`docs/reference/string-technique.md`, section 1.8).
   */
  readonly elbowToward: Vec3;
  /** The turn of the left elbow toward {@link BowedHold.elbowToward} for each lower string. */
  readonly elbowPerString: number;
  /**
   * The further turn of the left elbow toward {@link BowedHold.elbowToward} from the fourth
   * position to the sixth position (`docs/reference/string-technique.md`, section 1.5).
   */
  readonly highElbow: number;
  /**
   * The further tilt of the left hand over the neck, to the side of {@link BowedHold.fingers},
   * from the second position to the fifth position (`leftTilt()` of `pose/bowed.ts`): the hand
   * goes up and over the shoulder of the instrument, and the wrist comes up beside it
   * (`docs/reference/string-technique.md`, section 1.5). The finger block keeps its place on the
   * strings.
   */
  readonly highTilt: number;
  /** The direction to which the right elbow points while the bow plays at the frog. */
  readonly poleR: Vec3;
  /**
   * The direction to which the right elbow points while the bow plays at the tip. The direction
   * turns from {@link BowedHold.poleR} with the place of the contact point on the bow range.
   */
  readonly poleTipR: Vec3;
  /** The direction to which the right elbow points in pizzicato. */
  readonly polePizzicato: Vec3;
  /**
   * The share of the turn of the right elbow to the back of the hand in the middle of a change
   * between the bow and pizzicato. The share is 0 at the start and at the end of the change.
   */
  readonly followChange: number;
  /**
   * The far side of the stick for the roll of the right hand (`rollToward()` of `pose/bowed.ts`):
   * the angle of the elbow around the stick, from the back of the hand of the bind pose, at which
   * the roll changes from one end of its range to the other end, in radians. Near it, a small
   * move of the elbow turns the hand by about 200°, so no elbow of the hold comes near it. It is
   * π, the side of the stick opposite to the back of the hand, for a hold with no own value.
   */
  readonly farSideR: number;
  /**
   * The share of the bend of the bind paw that the right paw keeps on its forearm while it holds
   * the bow, from 0 to 1 (`pawKeepR` of `AnimalPose`, `poseStudioBones()` of
   * `models/studio-rig.ts`): 0 turns the paw onto the line of the forearm, as the retarget does
   * for each paw, and 1 keeps the paw on the forearm as in the bind pose, so that the skin of the
   * wrist keeps the form of the bind (design 4.4).
   */
  readonly pawKeepR: number;
  /**
   * The turn of the right hand around the grip on the stick, or `null` for no turn
   * (`turnOnStick()` of `pose/bowed.ts`). The hand turns in the plane of its palm around the
   * grip, so that the forearm keeps the angle `forearm` in that plane, in radians, with a turn of
   * at most `most` radians to each side. The retarget then turns the paw toward the forearm by one
   * angle (`PAW_TURN` of `models/studio-rig.ts`), so that the stick keeps its place in the paw.
   * The bow keeps its place on the strings and turns in the paw, as the fingers of a player let
   * the bow turn in the hand over a stroke (design 5.3).
   */
  readonly stickTurnR: { readonly forearm: number; readonly most: number } | null;
  /**
   * The move of the instrument while the player plays, in head heights, in the axes of the parent
   * of the `instrument` bone. It makes room for the arms between the instrument and the body.
   */
  readonly playShift: Vec3;
  /**
   * The turn of the instrument around its bone while the player plays, in the axes of the parent
   * of the `instrument` bone. The holds of the stage keep the turn of the bind pose. The views
   * page turns the violin to the shoulder of its model sheets (design 7.1).
   */
  readonly playTurn: Quat;

  /** The direction to which the right elbow points in the rest pose, in the axes of the root. */
  readonly restPoleR: Vec3;
  /** The direction to which the left elbow points in the rest pose, in the axes of the chest. */
  readonly restPoleL: Vec3;
  /** The bow tip points to this side in pizzicato, as the plucking hand holds it. */
  readonly pizzicatoTip: Vec3;
  /**
   * The turn of the bow around the strings from one string to the next: the angle between two
   * neighbor string planes. A positive turn moves the bow to the low strings on the bass side:
   * `top × axis`, the left of the strings for a viewer at the bridge who looks to the scroll with
   * the top plate up. Each hold takes the real angle of `docs/reference/string-technique.md`,
   * section 2.2, or the largest angle below it with which the bow arm still reaches the full hair
   * (`bowRangeOf()`).
   */
  readonly stringTurn: number;
  /**
   * The turn of the bow around its hair, so that the stick leans toward the fingerboard and the
   * hair touches the strings with its edge: about 30° on the violin, and less on the lower
   * instruments (`docs/reference/string-technique.md`, section 2.1).
   */
  readonly bowTilt: number;
  /**
   * The sounding point: the place of the bow on the strings, as a share of the string length from
   * the bridge, in piano (loudness 0) and in forte (loudness 1). A louder note moves the bow
   * toward the bridge (`docs/reference/string-technique.md`, section 2.4).
   */
  readonly soundingPoint: readonly [piano: number, forte: number];
  /**
   * The turn of the bow in the plane of the strings, from square across them. The frog comes
   * nearer to the right shoulder, so that the short arms of the animals reach the strings.
   */
  readonly slant: number;
  /** The forward turn of the right shoulder bone around y, so that the arm reaches further. */
  readonly reach: number;
  /**
   * The forward turn of the left shoulder bone around y, so that the left arm reaches the
   * fingerboard: of a floor instrument far in front of a round body, in the play and in the rest,
   * and of a violin or a viola turned toward the front, in the play only (`shoulderTurnL()` of
   * `pose/bowed.ts`). 0 keeps the shoulder of the bind pose.
   */
  readonly reachL: number;
  /**
   * The free part of the bow hair at each end, in meters. The reached part of the hair
   * (`BowedRig.bowRange`) starts at this distance from the frog and stops at this distance from
   * the tip, so the strokes come no nearer to the ends.
   */
  readonly freeHair: number;
  /**
   * The hair at the frog that the bow plays no part of, in meters, when it is longer than
   * {@link BowedHold.freeHair}. A short arm reaches the frog only nearly straight, and then the
   * forearm crosses the rim of a floor instrument. The reached part of the hair starts at this
   * distance from the frog. 0 keeps the free hair.
   */
  readonly frogHair: number;
  /** The forward lean of the spine. It brings the shoulders nearer to a floor instrument. */
  readonly lean: number;
  /**
   * The turn of the head down while the player plays, in radians, so that the jaw lies on the
   * chin rest, as a violinist rests the jaw on it (`docs/reference/string-technique.md`, section
   * 1.10). 0 keeps the head level, and a turn below 0 lifts the head, so that a long jaw lies on a
   * viola that sits near the neck.
   */
  readonly headDrop: number;
  /**
   * The place of the left fingers on the target `fingerboard` in the rest pose: 0 at the nut, 1
   * at the end of the fingerboard.
   */
  readonly restPlace: number;
  /**
   * The place of the pluck: 0 at the end of the fingerboard, 1 at the bow contact point. A value
   * below 0 lies over the fingerboard, toward the nut. The right palm is above it.
   */
  readonly pluckPlace: number;
  /**
   * The move of the plucking palm from the strings toward the frog side, in meters: a real
   * bassist brings the hand up from the side and rests the thumb on the edge of the fingerboard
   * (`docs/reference/string-technique.md`, section 2.8). 0 keeps the palm above the strings.
   */
  readonly pluckSide: number;
  /**
   * The end of the part of the fingerboard that the left hand stops, from 0 at the nut to 1 at
   * the end (`stopRangeOf()`). A thick arm that comes from behind the upper bout cannot reach the
   * fingerboard over the bout without going through it. 1 keeps the whole fingerboard.
   */
  readonly stopEnd: number;
  /**
   * The rest pose of the instrument: its axis, the side of its top plate, and the place of its
   * bone (the tail end) on the left thigh. `null` keeps the instrument in its playing place, with
   * {@link BowedHold.playShift} and {@link BowedHold.playTurn}, as the cello and the contrabass
   * stand on the floor.
   */
  readonly rest: {
    /** The direction from the tail end to the scroll. */
    readonly axis: Vec3;
    /** The side of the top plate. */
    readonly top: Vec3;
    /** The place of the tail end on the left thigh. */
    readonly lap: LapPlace;
  } | null;
  /**
   * The largest move of the left wrist in the middle of the lift and of the lowering, in head
   * heights, in the axes of the root: a via of the paw that carries a violin or a viola (design
   * 5.2). It keeps the instrument on its way between the lap and the jaw off the belly.
   * `[0, 0, 0]` moves the wrist on a straight line.
   */
  readonly liftReach: Vec3;
  /**
   * The curl of the left fingers around the neck in the rest grip of a violin or a viola, in
   * radians (`restHandAt()` of `pose/bowed.ts`, design 5.2), so that the fingers close around the
   * neck.
   */
  readonly restCurlL: number;
  /**
   * The turn of the left paw of a violin or a viola in the plane of its palm at rest, in radians,
   * in place of the turn of the retarget toward the forearm (`pawTurnL` of `AnimalPose`, design
   * 4.4, 5.2). The paw holds the neck in the playing grip (`restHandAt()` of `pose/bowed.ts`), and
   * this turn brings its grip near the grip that the viewer sees in the play, where the retarget
   * turns the paw toward a forearm along the neck. The paw then carries the instrument in the lift
   * and the lowering (`carryLift()`). `null` mixes the rest place and the playing place of the
   * instrument directly, and the paw takes the playing grip at the rest place with the turn of the
   * retarget, as the cello and the contrabass.
   */
  readonly restPawTurnL: number | null;
  /**
   * The turn of the rest grip of the left paw around the normal of the top plate, through the
   * middle of the neck, from the playing grip at the rest place, in radians (`restHandAt()` of
   * `pose/bowed.ts`, design 5.2). At rest, the normal points about along the forearm, so the turn
   * twists the paw on its forearm and sets the path of the twist in the moves. It also turns the
   * neck in the paw, so it adds to the change of the grip from the rest to the play. 0 keeps the
   * playing grip.
   */
  readonly restYawL: number;
  /**
   * The move of the paw of the rest grip from the neck, along the normal of its palm, in meters
   * (`restHandAt()` of `pose/bowed.ts`), so that the palm lies on the neck and does not go into
   * it. The playing grip puts the middle of the finger block on the strings, so the palm of a
   * thick paw goes into the neck.
   */
  readonly restGapL: number;
  /**
   * The direction to which the left elbow points in the middle of the lift and of the lowering, in
   * the axes of the chest (design 5.2). The elbow turns from the rest pole to this pole, then to
   * the playing pole. `null` mixes the rest pole and the playing pole directly.
   */
  readonly liftPoleL: Vec3 | null;
  /**
   * True when the left paw holds the instrument at the left side in the rest pose and the bow
   * hangs from the right paw, also on a seat, as for a soloist who stands (design 5.2). A body with
   * no lap, such as the rabbit, whose round belly covers its short thighs, rests so.
   */
  readonly restAtSide: boolean;
  /** The bow in the rest pose. */
  readonly restBow: {
    /** The place of the grip on the right thigh. */
    readonly lap: LapPlace;
    /**
     * The direction of the right forearm at rest, from the elbow of the bind pose, in the model
     * axes. When it is given, the grip lies at the end of the forearm and the paw in this
     * direction, in place of {@link BowedHold.restBow.lap}, so that the upper arm hangs as in the
     * bind pose on each body (`forearmGrip()`).
     */
    readonly forearm?: Vec3;
    /** The direction from the frog to the tip. */
    readonly tip: Vec3;
    /** The side of the hair, from the stick. */
    readonly hair: Vec3;
    /**
     * The bow in the middle of the lift and of the lowering, for a bow that rests upright: the
     * tip turns through this side, and the grip moves out of the way of the body. `null` mixes
     * the rest bow and the playing bow directly (design 5.2).
     */
    readonly via: BowVia | null;
  };
  /**
   * The bow in the rest pose of a soloist who stands, and of a player who rests at the side
   * ({@link BowedHold.restAtSide}), in the model axes of the bind pose (design 5.2). `null` keeps
   * the bow in the right hand as in the bind pose.
   */
  readonly standBow: {
    /** The direction from the frog to the tip. */
    readonly tip: Vec3;
    /** The side of the hair, from the stick. */
    readonly hair: Vec3;
    /**
     * The bow in the middle of the lift and of the lowering of the standing rest
     * ({@link BowedHold.restBow}). `null` mixes the hanging bow and the playing bow directly.
     */
    readonly via: BowVia | null;
  } | null;
  /**
   * The place of a cello from the body (`fitCelloPlace()` of `pose/cello-place.ts`, design 5.3),
   * in place of {@link BowedHold.playShift} and {@link BowedHold.playTurn}: the cello leans back
   * until the middle line of its back stands `gap` head heights in front of the body. `null` keeps
   * the fixed place of the hold.
   */
  readonly fit: { readonly gap: number } | null;
}

/**
 * The bow in the middle of the lift and of the lowering ({@link BowedHold}). The directions are
 * in the model axes of the bind pose.
 */
export interface BowVia {
  /** The direction from the frog to the tip. */
  readonly tip: Vec3;
  /** The side of the hair, from the stick. */
  readonly hair: Vec3;
  /** The largest move of the grip in the middle of the move, in head heights. */
  readonly reach: Vec3;
}

/** The free part of the bow hair at each end in the holds of the stage, in meters. */
const FREE_HAIR = 0.03;

/**
 * The violin and the viola share their hold under the chin. While the player plays, the right
 * elbow points out, forward, and down at the frog, and out and up at the tip. The left elbow
 * points down and forward, under the instrument and near the chest, as in the reference images.
 * With the left elbow out and down, the upper arm stands 45° out from the side. With the left
 * elbow straight down, the folded arm puts the elbow into the haunch. The instrument moves 0.15 H
 * forward and 0.05 H down, so that the frog of the bow on the lowest string keeps the hand off the
 * chin and the long muzzle of the fox, and the right shoulder turns 30°, so that the bow arm still
 * reaches the tip. With a move of 0.08 H to the left and the elbow forward and down at the frog,
 * the bow arm goes 0.065 H into the chest at the frog on the highest string.
 *
 * The string planes are 17° apart, the lower end of the 17° to 18° of a violinist in motion
 * capture (`docs/reference/string-technique.md`, section 2.2). The reference has no angle of the
 * viola, so the viola takes the angle of the violin. The stick leans 30° toward the fingerboard
 * (section 2.1). The bow plays at 1/8 of the string length from the bridge in piano and at 1/18
 * in forte, as two violinists of Askenfelt (section 2.4).
 *
 * In the rest pose, the instrument stands at 0.85 of the way to the knee, and the bow grip is
 * 0.18 H out from the knee and 0.08 H above it. The left elbow points down and a little back, so
 * that the upper arm hangs at the side. The right elbow points out and a little forward, so that
 * the forearm passes over the front of the thigh: nearer to the side, the arm goes into the
 * haunch and the thigh. The bow tip points 0.3 to the front, away from the scroll.
 */
const CHIN_HOLD = {
  tip: [0, 1, 0],
  fingers: [0, 1, 0],
  tiltL: 30 * MathUtils.DEG2RAD,
  poleL: [-0.5, -1, -1],
  elbowToward: [1, 0, 0],
  elbowPerString: 5 * MathUtils.DEG2RAD,
  highElbow: 4 * MathUtils.DEG2RAD,
  highTilt: 0,
  poleR: [1, -1, -1],
  poleTipR: [0.5, 1, -1],
  polePizzicato: [1, -0.5, -1],
  followChange: 0,
  farSideR: Math.PI,
  pawKeepR: 0,
  stickTurnR: null,
  playShift: [0, -0.05, -0.15],
  playTurn: IDENTITY,
  restPoleR: [1, -0.9, -0.5],
  restPoleL: [0, -1, 0.5],
  pizzicatoTip: [0.3, 1, 0.4],
  stringTurn: 17 * MathUtils.DEG2RAD,
  bowTilt: 30 * MathUtils.DEG2RAD,
  soundingPoint: [1 / 8, 1 / 18],
  slant: -20 * MathUtils.DEG2RAD,
  reach: 30 * MathUtils.DEG2RAD,
  reachL: 0,
  freeHair: FREE_HAIR,
  frogHair: 0,
  lean: 0,
  headDrop: 0,
  restPlace: 0.4,
  pluckPlace: 0.9,
  pluckSide: 0,
  stopEnd: 1,
  rest: {
    axis: [-0.17, 0.95, -0.26],
    top: [0, 0, -1],
    lap: { along: 0.85, offset: [0, 0.06, 0] },
  },
  liftReach: [0, 0, 0],
  restCurlL: 0,
  restPawTurnL: null,
  restYawL: 0,
  restGapL: 0,
  liftPoleL: null,
  restAtSide: false,
  restBow: {
    lap: { along: 1, offset: [0.18, 0.08, 0] },
    tip: [-1, 0, -0.3],
    hair: [0, -1, 0.2],
    via: null,
  },
  standBow: null,
  fit: null,
} as const satisfies BowedHold;

/**
 * The cello and the contrabass share their hold on the floor. While the player plays, the right
 * elbow points out and up, the bow tip points up and to the left in pizzicato, and the elbow turns
 * 0.3 of the way to the back of the hand in the middle of a change. The left elbow points down,
 * so that the arm hugs the instrument. In the rest pose, the left elbow points down and a little
 * in. The instrument moves a little forward and to the right, so that the bow hand at the tip of a
 * down-bow on the lowest string stays off the right thigh. With the elbow back, (0.5, 0, 1), and
 * the bow tip up and to the right in pizzicato, the bow arm goes up to 0.44 H into the torso.
 *
 * The string planes of the cello are 17° apart, the angle of the violin, because the reference
 * has no angle of the cello (`docs/reference/string-technique.md`, section 2.2). The contrabass
 * takes its own 25°. The stick leans 20° toward the fingerboard on the cello and 10° on the
 * contrabass, less than on the violin (section 2.1). The bow plays at 1/9 of the string length
 * from the bridge in piano and at 1/15 in forte: the mean sounding points of six cellists were
 * 1/9 and 1/12 of the string (section 2.4), and no source measures the contrabass.
 */
const FLOOR_HOLD = {
  tip: [-1, 0, 0],
  fingers: [1, 0, 0],
  tiltL: 30 * MathUtils.DEG2RAD,
  poleL: [-0.6, -1, -0.2],
  elbowToward: [0, 1, 0],
  elbowPerString: 10 * MathUtils.DEG2RAD,
  highElbow: 6 * MathUtils.DEG2RAD,
  highTilt: 0,
  poleR: [1, 1.4, -0.3],
  poleTipR: [1, 1.4, -0.3],
  polePizzicato: [1, 0, 0],
  followChange: 0.3,
  farSideR: Math.PI,
  pawKeepR: 0,
  stickTurnR: null,
  playShift: [0, 0, -0.05],
  playTurn: IDENTITY,
  restPoleR: [1, -0.6, -0.5],
  restPoleL: [0.3, -1, 0],
  pizzicatoTip: [-1, 1, 0],
  stringTurn: 17 * MathUtils.DEG2RAD,
  bowTilt: 20 * MathUtils.DEG2RAD,
  soundingPoint: [1 / 9, 1 / 15],
  slant: -20 * MathUtils.DEG2RAD,
  reach: 30 * MathUtils.DEG2RAD,
  reachL: 0,
  freeHair: FREE_HAIR,
  frogHair: 0,
  lean: 10 * MathUtils.DEG2RAD,
  headDrop: 0,
  restPlace: 0.4,
  pluckPlace: 0.3,
  pluckSide: 0,
  stopEnd: 1,
  rest: null,
  liftReach: [0, 0, 0],
  restCurlL: 0,
  restPawTurnL: null,
  restYawL: 0,
  restGapL: 0,
  liftPoleL: null,
  restAtSide: false,
  restBow: {
    lap: { along: 1, offset: [0.2, 0.08, 0] },
    tip: [-0.1, -0.1, -1],
    hair: [0, -1, 0.3],
    via: null,
  },
  standBow: null,
  fit: null,
} as const satisfies BowedHold;

/**
 * Makes the play turn of a violin on the shoulder: first a turn around the vertical axis, then a
 * tilt of the scroll. The violin of the chin hold points 70° to the left of the front, so a turn of
 * -20° gives 50° and a turn of -25° gives 45°, the angle of a real player
 * (`docs/reference/string-technique.md`, section 1.10).
 *
 * @param yawDeg The turn around the vertical axis, in degrees. A negative turn moves the scroll
 *   from the left toward the front.
 * @param tiltDeg The tilt of the scroll up, in degrees, after the turn. A negative tilt lowers it.
 * @returns The turn, in the axes of the chest.
 */
export function violinTurn(yawDeg: number, tiltDeg: number): Quat {
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawDeg * MathUtils.DEG2RAD);
  // The axis of the violin after the turn, and the level axis across it.
  const axis = new Vector3(-1, 0, 0)
    .applyAxisAngle(new Vector3(0, 1, 0), (yawDeg - 20) * MathUtils.DEG2RAD)
    .normalize();
  const across = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize();
  const tilt = new Quaternion().setFromAxisAngle(across, tiltDeg * MathUtils.DEG2RAD);
  return toQuat(tilt.multiply(yaw));
}

/**
 * The violin upright on the left thigh in the rest pose of the rabbit and the red fox: the scroll
 * up and a little forward, the top plate to the front, as a seated violinist rests it.
 */
const LAP_VIOLIN = { axis: [0, 1, -0.15], top: CHIN_HOLD.rest.top } as const;

/**
 * The upright bow at the right side in the rest pose of the rabbit and the red fox, as the seated
 * violinist rests it: the tip up and a little out, the hair to the front. In the lift and the
 * lowering, the tip turns through the front, and the grip moves 0.4 H to the front (`BowVia`):
 * with a direct mix, the tip turns through the head, and the bow goes up to 14.8 cm into the body
 * of the red fox while the arms lower.
 */
const UPRIGHT_BOW = {
  tip: [0.1, 1, 0],
  hair: [0, 0, -1],
  via: { tip: [-0.3, 0.3, -1], hair: [0, -1, 0], reach: [0, 0, -0.4] },
} as const satisfies { readonly tip: Vec3; readonly hair: Vec3; readonly via: BowVia };

/**
 * The bow of the standing rest of a soloist who hangs it from the right paw with the tip down, a
 * little forward and out (design 5.2, {@link BowedHold.standBow}). With the bow of the bind pose
 * of the hand, the long forearms of the cat, the rabbit, and the red fox hold the bow up in front
 * of the face. In the lift and the lowering, the tip turns through the front, as the tip of the
 * upright bow, and the grip moves 0.3 H out and 0.6 H to the front: with a direct mix of the
 * hanging bow and the playing bow, the bow goes 4.1 cm (cat), 3.9 cm (rabbit), and 3.3 cm (red
 * fox) into the arms (`pnpm pose-depth <role> --soloist`).
 */
const HANGING_BOW = {
  tip: [0.15, -1, -0.3],
  hair: [0, 0, 1],
  via: { ...UPRIGHT_BOW.via, reach: [0.3, 0, -0.6] },
} as const satisfies NonNullable<BowedHold['standBow']>;

/**
 * The hold of the violin on the left shoulder, for the rabbit (design 4.6, 5.3), as a real
 * violinist holds it (violinonline.com, "How to hold the violin", and Simon Fischer, "Basics:
 * Holding the violin"): the tail end on the left collarbone against the left side of the neck,
 * under the jaw, the jaw on the violin, the violin about 38° to the left of the front, and the
 * scroll a little up, so that the strings are about level. The violin is 0.83 of the app violin, so
 * that the arms of the A-pose mesh stretch only a little (`violinScale`). The middle line of the
 * violin points 50° to the left of the front, near the 45° of a real player
 * (`docs/reference/string-technique.md`, section 1.10). The left shoulder bone turns 15.5° forward
 * in the play (`reachL`), so that the shoulder joint comes 2.9 cm forward, inside the forward move
 * of the shoulder of real violinists, and the left paw reaches the fingerboard from 0.01 of its
 * length (0.08 at 60° with no turn). At 45°, the bow paw at the frog goes 1.9 cm into the jaw
 * (1.2 cm at 50°). The violin sits 0.09 H below the tail end of the chin hold, and the head turns
 * 10° down while the rabbit plays (`headDrop`), so that the jaw lies on the chin rest on the side
 * of the G string, as a violinist rests the jaw on it: with 17°, the jaw goes 2.2 cm into the rim
 * of the chin rest, and with 10°, about 1.5 cm. The back stays straight. The bow lies nearly square
 * across the strings. The right arm has the shoulder turn of the chin hold. At the frog, the right
 * elbow points out and forward, and only a little down, (1.8, -0.3, -1), and the bow keeps 0.06 m
 * of free hair at each end. With the elbow (1.5, -1.5, -1), the broad side of the long upper arm
 * faces the front as a flat plank. With this elbow, the upper arm reads across the body. With the
 * A-pose mesh, 9 faces of the right arm fold in the arm gate (limit 8) at the elbow (1.8, -0.7, -1)
 * of the red fox, and 7 at this elbow. The bow plays no hair within 0.11 m of the frog
 * (`frogHair`): with the violin turned to 50°, the frog brings the bow paw to the jaw, and with
 * 0.09 m, the right forearm goes 1.7 cm into the body (1.2 cm with 0.11 m). In pizzicato, the paw
 * plucks over the end of the fingerboard (`pluckPlace` 0), with the bow tip up and back: with the
 * pluck of the chin hold, near the bow, the right forearm goes 3.5 cm into the body. The right
 * elbow points down at the tip too: up, as in the chin hold, the skin of the studio rabbit folds at
 * the right upper arm (`pnpm fold-probe violinist`). The left elbow points down, forward, and a
 * little out, (-0.5, -1, -0.5), so that it comes toward the middle of the body under the violin, as
 * the elbow of a real player (section 1.10): the upper arm turns 46° from the vertical to the side
 * (57° with the pole (-1, -1.4, -0.3)). With the elbow further in, the left paw twists 174° on its
 * forearm (limit 170).
 *
 * The string planes of the rabbit are 10° apart, below the 17° of the chin hold. A larger turn
 * folds the skin of the right arm and puts the bow paw into the violin at the frog on the E string:
 * the play folds in 2.5% of the samples at 10°, 3.9% at 11°, and 11.1% at 17°, and the paw goes
 * 1.7 cm into the violin at 10° and 2.0 cm at 11°.
 *
 * The rest pose and the lift follow the poses and the motion of the red fox: the violin stands
 * upright on the top of the left knee, at the knee joint, 0.1 H out and 0.1 H up, with the top
 * plate to the front. At 0.05 H down, the lower end sinks into the knee, and the left leg looks
 * cut from the left side. On the belly at 0.85 of the way, the scroll comes up to the chin, the
 * paw holds the neck at the mouth, and the violin goes 4.8 cm into the belly. The left paw holds
 * the neck at 0.4 of the fingerboard from the nut (`restPlace`), so that the paw closes around it:
 * at 0.1, the paw lies over the scroll and does not hold the violin. The left elbow points down, a
 * little out, and a little back, (-0.6, -1, 0.3).
 *
 * In the lift and the lowering, the violin hangs from the left paw, and the paw turns with it, so
 * that the violin turns in the same direction as the wrist and the arm (`carryLift()` of
 * `pose/bowed.ts`). The wrist moves on a line from its rest place to its playing place, and
 * 0.15 H out, 0.15 H up, and 0.15 H to the front in the middle (`liftReach`): with 0.35 H up and
 * 0.2 H to the front, the violin goes 2.8 cm into the body in a lowering, and with no move to the
 * front, the bow goes 3.6 cm into the body. At rest, the paw holds the neck in its rest grip
 * (`restHandAt()` of `pose/bowed.ts`): the playing grip at the rest place, with the fingers curled
 * 60° (`restCurlL`), 5 mm off the neck (`restGapL`), and turned -5° around the normal of the top
 * plate (`restYawL`), and the paw takes a turn of 20° in the plane of its palm (`restPawTurnL`),
 * near the turn of 34° of the play, so that the grip in the paw changes by 22° in a move (56° with
 * the turn of 30° around the normal), and the paw goes 0.2 cm into the violin. With no turn around
 * the normal, the wrist skin flattens in the lift (flat p5 0.70 against 0.76), and with a turn of
 * 25° in the plane of the palm, the violin goes 2.0 cm into the body in a lift (1.8 cm with 20°).
 * In the middle of the move, the elbow points out and a little down, as at rest (`liftPoleL`):
 * down and to the front, (0, -1, -0.5), the left upper arm goes 2.5 cm into the body in the lift.
 * The left rest elbow points down and a little out and back, (-0.6, -1, 0.3), so that the left arm
 * bends at the side: with the elbow out, (-1, -0.6, 0), the arm reaches up to the nut and looks
 * long and bent. In the middle of the move, the bow tip points forward and a little out and up,
 * (0.4, 0.3, -1), with the hair to the back, and the grip moves 0.3 H out, 0.1 H up, and 0.3 H to
 * the front: with the tip up, (0.2, 0.8, -0.6), the bow stands upright in front of the face, and
 * with the grip 0.2 H to the front only, the right elbow of the red fox goes 4.3 cm into the body
 * in a lowering. With the via of `UPRIGHT_BOW`, the right paw turns 5,188°/s in a lowering. With
 * 0.2 H to the front, the right forearm goes 2.2 cm into the body in a lowering. With no move up,
 * the right elbow opens to 163° (147° with this move). With 0.05 H out, the right paw twists 145°
 * on its forearm in a lowering. With 0.3 H to the front and the violin at the jaw, the right paw
 * twists 147° in a lowering.
 *
 * The right elbow hangs near the side, as the elbows of a seated violinist. The belly is widest
 * below the elbow, so the right arm hangs out around it, and the paw does not reach the top of the
 * right thigh. The grip rests at the front of the lap, 0.25 H out from the top of the knee, 0.7 H
 * above it, and 0.2 H to the front, and the elbow points down and back, (0.3, -1, 0.6), so that
 * the upper arm hangs 19° from the vertical with a straight wrist. Thus the bow arm and the wrist
 * are relaxed, and the bow paw rests low near the belly and the lap. With the grip 0.4 H out and
 * 0.85 H up, the paw stands 0.48 H out at the side. With a grip further in on the lap, the place
 * falls on the top of the belly. With the grip 0.5 H to the front, the arm reaches nearly straight
 * to the front and looks long. With the grip 0.65 H out and 0.45 H up, the arm hangs straight down
 * at the side. With the paw on the top of the thigh, the short right arm folds 13 to 22 faces at
 * rest. With the grip 0.55 H out and 0.45 H above the knee, face 372 of the right upper arm turns
 * over in each rest sample. With the grip on the belly over the right thigh, the paw is 25 cm from
 * the shoulder joint, so the bent arm puts the elbow 19 cm out from the side, the upper arm turns
 * 81° from the vertical, and 20 faces of the right arm turn over. Each grip nearer to the thigh
 * puts the forearm into the belly or turns more faces over.
 */
const SHOULDER_HOLD = {
  ...CHIN_HOLD,
  poleL: [-0.5, -1, -0.5],
  playShift: [-0.054, -0.09, 0.185],
  playTurn: violinTurn(-20, 5),
  reachL: 15.5 * MathUtils.DEG2RAD,
  poleR: [1.8, -0.3, -1],
  freeHair: 0.06,
  frogHair: 0.11,
  pluckPlace: 0,
  pizzicatoTip: [0.3, 0.5, 1],
  poleTipR: CHIN_HOLD.poleR,
  lean: 0,
  headDrop: 10 * MathUtils.DEG2RAD,
  slant: -5 * MathUtils.DEG2RAD,
  stringTurn: 10 * MathUtils.DEG2RAD,
  restPoleL: [-0.6, -1, 0.3],
  restPoleR: [0.3, -1, 0.6],
  restPlace: 0.4,
  rest: { ...LAP_VIOLIN, lap: { along: 1, offset: [-0.1, 0.1, 0] } },
  liftReach: [0.15, 0.15, -0.15],
  restCurlL: 60 * MathUtils.DEG2RAD,
  restPawTurnL: 20 * MathUtils.DEG2RAD,
  restYawL: -5 * MathUtils.DEG2RAD,
  restGapL: 0.005,
  liftPoleL: [-1, -0.6, 0],
  restBow: {
    lap: { along: 1, offset: [0.25, 0.7, -0.2] },
    tip: [0.2, 1, -0.1],
    hair: [0, 0, -1],
    via: { tip: [0.4, 0.3, -1], hair: [0, 0, -1], reach: [0.3, 0.1, -0.3] },
  },
  standBow: HANGING_BOW,
} as const satisfies BowedHold;

/**
 * The hold of the violin on the left shoulder, for the red fox (design 4.6, 5.3): the hold of the
 * rabbit, with the tail end against the left side of the short neck of the fox, under its long jaw.
 * On the collarbone, 0.087 H further forward and 0.035 H lower, the violin keeps 2.4 cm from the
 * neck. The violin sits 0.07 H further back and 0.016 H further left, so that the left paw reaches
 * the nut. Straight back by 0.06 H, the violin goes 1.3 cm into the neck. It sits 0.01 H higher,
 * and goes 1.0 cm into the trunk and the neck. The head lifts 5° (`headDrop`), because the long jaw
 * already lies on the violin: level, the jaw goes 2.4 cm into the rim of the chin rest, and lifted
 * 5°, 1.5 cm. The short neck brings the head and the violin 1.7 cm down, so the violin sits a
 * further 0.01 H higher: 0.01 H lower, it goes 2.4 cm into the body in the play. The middle line of
 * the violin points 45° to the left of the front, as a real player holds it
 * (`docs/reference/string-technique.md`, section 1.10), and the left shoulder bone turns 8° forward
 * in the play (`reachL`), so that the long left arm of the fox reaches the nut with 1.5 cm to
 * spare. The left elbow keeps the pole of the chin hold: further in, under the violin, the left paw
 * turns 9° to 15° further from its accepted grip. The bow slants 12° and the right shoulder turns
 * 15°, and the right elbow at the tip points less down: with the bow of the rabbit (5°, 30°), the
 * skin of the right shoulder of the fox mesh folds in 18% of the play samples
 * (`pnpm fold-probe fox-violinist`), and with the full violin, the turn of 15° folds fewer samples
 * than 25°. At the frog, the right elbow points out, forward, and a little down, (1.8, -0.7, -1),
 * and the bow keeps 0.12 m of free hair at each end: with 0.08 m and the violin further back, the
 * bow paw goes 3.7 cm into the body at the frog, with 0.1 m and the elbow (1.4, -0.7, -1) 3.0 cm,
 * and with this hold 2.4 cm, with the same share of folded play samples. The bow paw reaches
 * 0.265 m of the hair, more than half. In pizzicato, the bow tip points up, back, and a little out,
 * (0.3, 0.5, 1): with the tip of the chin hold, (0.3, 1, 0.4), the bent wrist of the plucking paw
 * moves the middle of the paw 2.1 cm from the stick, and with this tip 1.2 cm.
 *
 * The rest pose is the upright rest of the rabbit: the violin stands on the left thigh at 0.8 of
 * the way to the knee, 0.18 H down and 0.2 H forward. The thighs slope 25° down, so at 0.65 of the
 * way, 0.24 H down, and 0.3 H forward, the lower end stands 13.8 cm above the thigh. The left paw
 * holds the violin at 0.37 of the fingerboard (`restPlace`), so that it closes around the neck: at
 * 0.2, the paw lies over the scroll. The long right arm of the fox reaches the right thigh only
 * nearly straight, and its line from the shoulder to a paw on the top of the thigh passes through
 * the side of the belly: with the grip 0.15 H out at 0.65 of the way, the right upper arm goes
 * 6.2 cm into the body. The stick passes through the paw, so the hand sits about 4 cm further out
 * on the bow. The grip rests 0.25 H out at 0.75 of the way, 0.5 H up, and 0.25 H to the front, at
 * the front of the lap and near the body, and the right elbow points down, out, and back,
 * (0.5, -1, -0.2), so that the upper arm hangs 22° from the vertical with a straight wrist. Thus
 * the bow paw rests near the belly and the lap. With the elbow (0.4, -1, 0), the right upper arm
 * goes 3.0 cm into the body at rest, and with (0.4, -1, -0.3) and the grip 0.2 H out, the skin of
 * the right arm flattens (flat 0.73 against 0.78). The left rest elbow points down and a little
 * out and back, (-0.6, -1, 0.3), as on the rabbit: out, (-1, -0.6, 0), the arm looks long and
 * bent. The left paw holds the neck at rest in the rest grip of the rabbit, 5 mm toward the neck
 * (`restGapL`), with no turn around the normal of the top plate and a turn of 25° in the plane of
 * its palm (`restPawTurnL`), so that the grip in the paw changes by 27° in a move, and the paw
 * goes 0.5 cm into the violin. At 0.4 of the fingerboard with a turn of 35°, the forearm goes
 * 0.2 cm into the violin at rest. In the lift and the lowering, the violin hangs from the left
 * paw, as on the rabbit, and the wrist moves 0.1 H out and 0.15 H to the front in the middle
 * (`liftReach`), so that the violin near the jaw goes 1.9 cm into the body: with 0.1 H to the
 * front, it goes 2.1 cm in, and with 0.1 H up and 0.2 H to the front, 2.6 cm. The bow takes the
 * via of the rabbit: with the hair down, the right paw turns 17,038°/s in a lowering.
 *
 * The left elbow turns toward the body by 2° for each lower string of the finger: with the 5° of
 * the chin hold, the left forearm goes 2.4 cm into the violin in the middle of the lift and of the
 * lowering, and with 2°, 1.9 cm and 2.1 cm.
 *
 * The string planes of the red fox stay 9° apart, and the stick leans 15°. A larger turn or tilt
 * folds the skin of the right arm of the fox mesh: the play folds in 21.7% of the samples at 17°
 * and 30°, 7.0% at 9° and 30°, 6.1% at 9° and 15°, and 6.0% at 10° and no tilt.
 */
const FOX_HOLD = {
  ...SHOULDER_HOLD,
  poleL: CHIN_HOLD.poleL,
  playTurn: violinTurn(-25, 5),
  reachL: 8 * MathUtils.DEG2RAD,
  elbowPerString: 2 * MathUtils.DEG2RAD,
  poleR: [1.8, -0.7, -1],
  playShift: [-0.07, 0.05, 0.25],
  headDrop: -5 * MathUtils.DEG2RAD,
  slant: -12 * MathUtils.DEG2RAD,
  stringTurn: 9 * MathUtils.DEG2RAD,
  bowTilt: 15 * MathUtils.DEG2RAD,
  reach: 15 * MathUtils.DEG2RAD,
  poleTipR: [1, -0.85, -1],
  freeHair: 0.12,
  pizzicatoTip: [0.3, 0.5, 1],
  restPoleL: [-0.6, -1, 0.3],
  restPoleR: [0.5, -1, -0.2],
  restPlace: 0.37,
  rest: { ...LAP_VIOLIN, lap: { along: 0.8, offset: [0, -0.18, -0.2] } },
  liftReach: [-0.1, 0, -0.15],
  restCurlL: 60 * MathUtils.DEG2RAD,
  restPawTurnL: 25 * MathUtils.DEG2RAD,
  restYawL: 0,
  restGapL: -0.005,
  liftPoleL: null,
  restBow: {
    lap: { along: 0.75, offset: [0.25, 0.5, -0.25] },
    tip: [0.3, 1, -0.2],
    hair: [0, 0, -1],
    via: { tip: [0.4, 0.3, -1], hair: [0, 0, -1], reach: [0.3, 0.1, -0.3] },
  },
} as const satisfies BowedHold;

/**
 * The hold of the violin on the left shoulder for the wolf, as the recast role `violinist@wolf` of
 * the role tools (design 4.4): a test of the wolf body in a role that is not its own. No wolf
 * plays the violin in the app. The hold is the hold of the rabbit ({@link SHOULDER_HOLD}), whose
 * values are in H, with the violin of the rule of a violin shop for the arm of the wolf
 * (`violinScale`). The bow plays no hair within 0.18 m of the frog (`frogHair`): with the 0.11 m
 * of the rabbit, the bow paw goes 3.8 cm into the body at the frog, and with 0.14 m, 2.3 cm.
 */
const WOLF_VIOLIN_HOLD = {
  ...SHOULDER_HOLD,
  frogHair: 0.18,
} as const satisfies BowedHold;

/**
 * The bow of the dog cellist at rest (design 5.2): the right paw holds the bow over the right knee,
 * 0.25 H out and 0.5 H above the top of the thigh at 0.9 of the way to the knee, with the tip up
 * and leaned out and forward, away from the cello. The short arm of the dog then bends softly at
 * the elbow, and the wrist bends 22° with the palm toward the body. In the lift and the lowering,
 * the bow turns through the front, and the grip moves 0.3 H out, away from the cello.
 */
const LAP_CELLO_BOW = {
  lap: { along: 0.9, offset: [0.25, 0.5, 0] },
  tip: [0.6, 1, -0.6],
  hair: UPRIGHT_BOW.hair,
  via: { ...UPRIGHT_BOW.via, reach: [0.3, 0, -0.4] },
} as const satisfies BowedHold['restBow'];

/**
 * The hold of the cello between the knees for each seated body (design 4.6, 5.3), as a real
 * cellist holds it (`docs/reference/string-technique.md`, section 2.7). The place comes from the
 * body (`fit`, `fitCelloPlace()` of `pose/cello-place.ts`): the end pin on the floor right of the
 * middle, the cello leaned back 25.7° and 14° to the left (`CELLO_PLACE`), and moved back until
 * its back presses the front of the trunk by 1 cm, with the top of the back at the chest. The arm
 * values are the values of the accepted dog cellist, in head heights and as directions, so they
 * fit each body. With the bow arm of the floor hold (the elbow out and up), the bow paw of 12
 * recast bodies turned 134° to 172° from the accepted grip or flipped through 180°. With the
 * right elbow out and down, near the body, the paw keeps near the direction of no paw twist.
 *
 * The left paw tilts 55° over the neck (`tiltL`), and the left elbow points out to the left and
 * nearly level, because the leaned neck comes near the left shoulder, and turns up 2° for each
 * lower string. From the second position to the fifth position, the left paw tilts 20° further
 * over the neck (`highTilt`), so that the wrist comes up beside the upper bout, as the hand of a
 * real player goes over the shoulder of the instrument (`docs/reference/string-technique.md`,
 * section 1.5): with no further tilt, the left forearm of the recast deer goes 1.9 cm into the
 * upper bout in a high position of `mendelssohn-op61` (0.5 cm with this tilt). The right shoulder
 * turns 30°.
 *
 * The short arms reach the strings only nearly straight. The trunk leans 3° forward, so that the
 * shoulders come nearer to the strings, and the right elbow points out and down, near the body.
 * The bow plays no hair within 0.12 m of the frog (`frogHair`), and the string planes are 6°
 * apart, so that the paw at the frog and on the C string stays out of the right rim of the
 * cello. In pizzicato, the right paw comes up from the side, as a real player plucks with the hand
 * hanging from the wrist and the thumb near the edge of the fingerboard
 * (`docs/reference/string-technique.md`, section 2.8): it plucks 0.2 of the way from the end of the
 * fingerboard to the bow contact, 0.15 m right of the strings (`pluckSide`), with the elbow out and
 * down (`polePizzicato`). Over the fingerboard (`pluckPlace` -0.3), the paw of the dog lies flat
 * across the strings, the right upper arm turns 101° and goes 5.2 cm into the body, and the front
 * of the right shoulder folds in 87% of the pizzicato samples. With this pluck, the upper arm turns
 * 79° and goes 2.2 cm in, and 20% of the samples fold.
 *
 * In the rest pose, the right upper arm hangs as in the bind pose, and the forearm points forward,
 * a little out, and up, (0.3, 0.3, -1), from the bind elbow (`restBow.forearm`). The paw holds the
 * bow with the tip up and leaned out and forward, away from the cello ({@link LAP_CELLO_BOW}). With
 * the grip of the dog, 0.5 H above the thigh, the bow paw of the recast rabbit, panda, monkey, and
 * mouse twisted 136° to 179° at rest, folded 10 to 11 faces at the right arm, and flipped in the
 * lift. The left paw holds the cello at 0.6 of the fingerboard with the elbow down and out, near
 * the side.
 */
const CELLO_HOLD = {
  ...FLOOR_HOLD,
  lean: 3 * MathUtils.DEG2RAD,
  reach: 30 * MathUtils.DEG2RAD,
  stringTurn: 6 * MathUtils.DEG2RAD,
  frogHair: 0.12,
  tiltL: 55 * MathUtils.DEG2RAD,
  highTilt: 20 * MathUtils.DEG2RAD,
  poleL: [-1, -0.15, 0],
  elbowPerString: 2 * MathUtils.DEG2RAD,
  poleR: [1, -1.2, -0.3],
  poleTipR: [1, -0.5, -0.5],
  pluckPlace: 0.2,
  pluckSide: 0.15,
  polePizzicato: [1, -1, -0.3],
  restPlace: 0.6,
  restPoleL: [-0.5, -1, 0],
  restPoleR: [0.6, -1, 0.75],
  restBow: { ...LAP_CELLO_BOW, forearm: [0.3, 0.3, -1] },
  fit: { gap: 0.28 },
} as const satisfies BowedHold;

/** The holds of the bowed strings. */
export const BOWED_HOLDS = {
  violin: CHIN_HOLD,
  // The left arm reaches the nut of the viola only with a smaller forward move.
  viola: { ...CHIN_HOLD, reach: 30 * MathUtils.DEG2RAD, playShift: [0, -0.05, -0.04] },
  cello: CELLO_HOLD,
  // The base of the hold of the hippo (HIPPO_HOLD), which moves and turns the contrabass to its
  // body. The real string planes are 25° apart, and the stick leans 10°.
  contrabass: {
    ...FLOOR_HOLD,
    stringTurn: 25 * MathUtils.DEG2RAD,
    bowTilt: 10 * MathUtils.DEG2RAD,
    lean: 5 * MathUtils.DEG2RAD,
    poleR: [0.5, 1, 0.5],
    poleTipR: [0.5, 1, 0.5],
    playShift: [0, 0, 0],
  },
} as const satisfies Readonly<Record<BowedInstrument, BowedHold>>;

/**
 * The hold of the viola under the chin, for the cat mesh (design 4.6, 5.3). The arms of the cat
 * are 1.10 H long, and its jaw lies in front of its chest under the long muzzle, so the tail end
 * of the viola lies about 0.14 m in front of the left shoulder joint. Thus the cat plays a viola
 * of about 10 inches, 0.74 of the viola of the app (`SpeciesParams.violaScale`), as a violin shop
 * sizes a viola for the arm less the muzzle, and holds it nearer to the body than the viola hold
 * of {@link BOWED_HOLDS}: 0.05 H further right, 0.14 H higher, and 0.23 H further back
 * (`playShift`), turned 10° further to the left than 45°, near the angle of a real player
 * (`docs/reference/string-technique.md`, section 1.10), and tilted 11° forward, so that it falls
 * 10° to the scroll (`playTurn`). The left paw then reaches the fingerboard from the nut to its
 * end, and the bow paw the hair from the frog to the end of the free hair at the tip
 * (`pnpm hold-reach cat --instrument viola`). The head lifts 15° in the play (`headDrop` below
 * 0), so that the jaw lies on the chin rest of the higher viola: with the head level, the jaw goes
 * 2.0 cm into the viola. The left shoulder bone turns 20° forward in the play (`reachL`), near the
 * forward move of the shoulder of real violinists: with 35° and the viola tilted 5°, the back of
 * the left arm root sinks into pits of 14.5 cm³ in the play (4.8 cm³ with this hold), and with 20°
 * and that tilt, the paw reaches the fingerboard only from 0.03. With the 1/2 viola (0.87) at the
 * place for longer arms, the arm reaches the fingerboard from 0.69, and the bow 0.26 m of 0.44 m.
 * With the viola 4 cm back, the bow reaches the tip, but the viola goes 2.7 cm into the jaw and
 * the chest (1.2 cm with this hold, limit 2.0). The bow lies square across the strings (`slant`
 * 0), as a real bow: with the slant of -20° of the viola hold, the right paw swings 76° on the
 * wrist in the lift (limit 70).
 *
 * The deep chest of the cat takes the room of the left elbow: with the left elbow pole of the
 * chin hold, the left upper arm goes 5.5 cm into the body in the play. The left elbow points down
 * and forward, and a little less out, so that it comes toward the middle under the viola: the
 * upper arm turns 38° from the vertical to the side. With the elbow (-0.5, -1, -0.75), the left
 * upper arm goes 2.4 cm into the body in the play (1.2 cm with this elbow). The stick of the bow
 * passes through the middle of the paw (`SpeciesParams.bowGrip`), and the hand sits about 4 cm
 * further out on the bow, so the right elbow of the play points a little further out than the
 * elbow of the chin hold. The right elbow of the play points out to the side, a little down, and
 * forward, (2, -0.3, -0.7), so that it comes near the height of the hand, as the elbow of a real
 * violist at the frog, and the arm does not bend in an unnatural way. With the elbow level,
 * (2, 0, -0.5), the paw twist of the bow arm passes the margin of the arm gate. With
 * (1.2, -0.5, -1), the upper arm hangs down the side of the body, and the forearm folds up to the
 * chin. With (1.1, -1, -1), the back of the upper arm goes 3.8 cm into the body. At the tip, the
 * right elbow points down, out, and forward, (1.5, -1, -1), further out than the elbow of the
 * rabbit, because the shorter arm reaches the tip nearly straight across the round belly: with
 * (1, -1, -1), the right upper arm goes 2.7 cm into the belly at the tip (2.1 cm with this elbow).
 * With the elbow up of the chin hold, (0.5, 1, -1), a dark wedge fold opens under the right armpit
 * at the tip, the right paw turns 116° on its forearm (90° with this elbow), and the narrowest ring
 * of the right arm keeps 0.14 of its axis (0.49 with this elbow). The right shoulder bone turns 36°
 * forward (`reach`, 30° in the viola hold), so that the nearly straight bow arm passes in front of
 * the even oval belly: with 30°, the right upper arm goes 2.9 cm into the belly in the play, and
 * with 40°, new faces at the back of the right shoulder fold in each play sample. The front of the
 * upper belly is a little flatter, most at the middle line, where the upper arm lies (`flat` of
 * `tools/blender/cat_arms.py`). In pizzicato, the right elbow points out, a little down, and
 * forward, (1.2, -0.5, -1), a little further out than the chin hold, and the right palm plucks
 * 0.1 m from the strings toward the frog side (`pluckSide`), as the hand of a real player comes up
 * from the side: with the palm over the strings, the middle of the upper arm goes 2.1 cm into the
 * top of the chest under the chin in a pizzicato and in the lowering after it (1.3 cm in the
 * lowering with this side). With 0.05 m, it goes 1.9 cm in, and with the elbow (1.3, -0.35, -1)
 * or (1.5, -0.5, -1), the move twist of the arm gate passes its margin.
 *
 * The rest pose is the upright rest of the rabbit and the red fox, as a seated violinist rests:
 * the viola stands upright on the top of the left thigh, 0.6 of the way from the hip to the knee,
 * and 0.12 H in from it, 0.05 H up, and 0.06 H to the front, in the reach of the short arms, and
 * the bow rests in the right paw at the front of the lap. The left paw holds the viola at 0.55 of
 * the fingerboard from the nut (`restPlace`), and the left elbow points down, out, and a little
 * forward, (-1.6, -1, -0.2), so that the left elbow bends near the side of the round belly, as a
 * seated violist holds the resting instrument with the elbow bent. With the viola 0.8 of the way
 * and the elbow (-1.2, -1, 0.1), the left upper arm goes 2.3 cm into the belly at rest, and its
 * middle goes flat. With 0.95 of the way and 0.03 H back, on the front of the knee, the elbow
 * opens to 131°, and the arm reaches far forward and looks long. With the viola 0.03 H back at
 * 0.8 of the way, the elbow bends to 105°, but the viola goes 2.1 cm into the body near the end of
 * a lowering. With the viola 0.1 H up and 0.1 H forward and the grip at 0.4, the left arm reaches
 * out nearly straight, and with the elbow further down, the left upper arm goes 2.2 cm to 3.7 cm
 * into the belly (limit 1.5). With 0.2 H in, the viola goes 2.6 cm into the body. The left paw
 * closes around the neck in the rest grip, as a seated violist holds the neck with the left hand
 * (`docs/reference/string-technique.md`, section 2.9): the playing grip at the rest place, curled
 * 115°, with the palm on the neck (`restGapL` 0), and turned 10° around the normal of the top
 * plate, and the paw takes a turn of 42° in the plane of its palm (`restPawTurnL`), so that the
 * grip in the paw changes by 29° in a move. The neck then runs through the closed paw, and the
 * paw goes 0.4 cm into the viola. Curled 90° and 11 mm off the neck, the paw closes beside the
 * neck as a fist and does not hold the viola. With a turn of 12° around the normal, the wrist skin
 * flattens in the lift (flat p5 0.70 against 0.75).
 *
 * The grip of the bow rests at the front of the lap, 0.4 H out, 0.6 H up, and 0.05 H to the front
 * at 0.6 of the way to the knee, with the tip a little forward, (0.15, 1, -0.45): 0.4 H up, the
 * shorter right forearm goes 1.2 cm into the belly at rest. The right elbow hangs down, out, and a
 * little back, (0.9, -1, 0.2): the elbow bends near the side of the round belly with a straight
 * wrist, and the paw rests low near the hip. With (0.8, -1, 0.3), the right upper arm goes 1.4 cm
 * into the belly at rest (0.8 cm with this elbow), and with (0.7, -1, 0.3), 1.7 cm. With the paw
 * high at the chest, the elbow bends to 76° as a wing. The round belly keeps the upper arm 35°
 * from the vertical: with the elbow further down and in, (0.3, -1, 0.1), the right upper arm goes
 * 4.1 cm and the forearm 3.1 cm into the belly. A place of the lap between 0.5 and 0.6 of the way
 * lies on the top of the belly. The arm of the cat, with the reach of the red fox, reaches the top
 * of the thigh only nearly straight: a grip at 0.7 of the way puts the elbow at 180°. A level bow
 * runs forward past the knees, and a real violist rests as a violinist.
 *
 * In the lift and the lowering, the viola hangs from the left paw, and the paw turns with it, as
 * on the rabbit (`carryLift()` of `pose/bowed.ts`). The wrist moves 0.14 H out, 0.29 H up, and
 * 0.19 H to the front in the middle (`liftReach`), so that the viola near the jaw goes at most
 * 2.0 cm into the body in a lowering: with 0.25 H up and 0.2 H to the front, it goes 2.1 cm in.
 * With 0.2 H to the front, the right claws go deeper into the viola, and with 0.23 H, 2.4 cm. In
 * the middle of the moves, the left elbow points out and a little down, as at rest (`liftPoleL`).
 * With (-0.45, -1, -0.6), the left upper arm goes 1.7 cm into the body in the lift. In the middle,
 * the bow points forward and a little out and up, (0.4, 0.3, -1), and the grip moves 0.5 H out,
 * 0.45 H up, and 0.15 H to the front, so that the bow arm passes outside the round belly and the
 * viola. With 0.45 H out, 0.35 H up, and 0.1 H to the front, the right claws go 2.1 cm into the
 * carried viola at the start of a lowering, and with 0.45 H out, 0.5 H up, and 0.2 H to the
 * front, the right upper arm goes flat in the lift. With 0.05 H to the front, the bow goes 0.7 cm
 * into the viola in a lowering of `beethoven-9`. With 0.3 H out and 0.15 H to the front, the right
 * upper arm goes 7.2 cm into the belly in a lowering of `brahms-2`, and with 0.4 H to the front,
 * the arm goes straight (180°). With the tip up, (0, 1, -0.6), the bow stands upright in front of
 * the face. With the via of `UPRIGHT_BOW` (the tip forward, the grip 0.3 H out and 0.1 H up), the
 * bow lies across the belly and goes 1.3 cm into the viola and 2.7 cm into the arms. With a move
 * of 0.4 H up, the left paw rises to the top of the head.
 *
 * A cat soloist who stands hangs the bow from the right paw with the tip down, a little forward and
 * out, and turns it through the front in the lift and the lowering (`HANGING_BOW`).
 *
 * The string planes of the cat are 7° apart, below the 17° of the chin hold: with the shorter arm
 * and the stick leaned 30°, the bow arm reaches the end of the hair with 7°, and only to 2 cm
 * short of the end with 11°.
 *
 * The left elbow turns toward the body by 2° for each lower string of the finger: with the 5° of
 * the chin hold, the left upper arm goes 1.5 cm into the deep chest in the play, and with 2°,
 * 0.0 cm.
 *
 * From the second position to the fifth position, the left paw tilts 20° further over the neck, so
 * that the wrist comes up toward the upper bout (`highTilt`, `leftTilt()` of `pose/bowed.ts`). The
 * viola sits back toward the neck, so the left forearm runs from the wrist back under the viola,
 * and with no tilt it goes 2.7 cm into the upper bout near the wrist in the fifth position at the
 * end of `mozart-k191`, also while the arms lower. A turn of the left elbow does not change it,
 * because the forearm leaves the wrist toward the shoulder. With 45°, the forearm goes 0.4 cm into
 * the viola, but the paw lies flat across the fingerboard, and the wrist bends 75°: a broken wrist.
 * With 20°, the fingers still point down to the strings, and the wrist bends 48°. The remaining
 * depth of the forearm at the upper bout is accepted.
 *
 * The left paw tilts 45° over the neck (`tiltL`, 30° in the chin hold), so that it curls around
 * the neck and the fingers come down on the strings from above, as a real violist holds the neck
 * (`docs/reference/string-technique.md`, section 1.9). With 30°, the paw turns 157° on its
 * forearm from the bind, and the skin of the wrist under the neck pinches into a twisted band of
 * thin faces: the wrist ring keeps 0.58 of its narrow axis in the bind. With 45°, the paw turns
 * 147°, the wrist ring keeps 0.66, the left forearm goes 1.5 cm into the viola in the play (2.5 cm
 * with 30°), and the wrist bends 30° from the line of the forearm (15° with 30°). With 40°, the
 * wrist keeps a crease, and with 50°, the wrist bends 34°. In the fifth position, the paw tilts 65°
 * with `highTilt`.
 *
 * In the rest pose, the top plate of the viola faces the front and 30° to the left, toward the
 * audience, as the bridge of a resting violin faces out (`docs/reference/string-technique.md`,
 * section 2.9). Thus the back of the viola does not face the audience.
 */
const CAT_HOLD = {
  ...BOWED_HOLDS.viola,
  stringTurn: 7 * MathUtils.DEG2RAD,
  playShift: [0.05, 0.0869, 0.1937],
  playTurn: [-0.0934, -0.1295, 0.0199, 0.987],
  reachL: 20 * MathUtils.DEG2RAD,
  headDrop: -15 * MathUtils.DEG2RAD,
  slant: 0,
  tiltL: 45 * MathUtils.DEG2RAD,
  poleL: [-1, -1, -0.75],
  elbowPerString: 2 * MathUtils.DEG2RAD,
  highTilt: 20 * MathUtils.DEG2RAD,
  poleR: [2, -0.3, -0.7],
  poleTipR: [1.5, -1, -1],
  polePizzicato: [1.2, -0.5, -1],
  pluckSide: 0.1,
  reach: 36 * MathUtils.DEG2RAD,
  restPoleR: [0.9, -1, 0.2],
  restPoleL: [-1.6, -1, -0.2],
  restPlace: 0.55,
  rest: {
    axis: LAP_VIOLIN.axis,
    top: [-0.5, 0, -0.87],
    lap: { along: 0.6, offset: [0.12, 0.05, -0.06] },
  },
  liftReach: [-0.14, 0.29, -0.19],
  restCurlL: 115 * MathUtils.DEG2RAD,
  restPawTurnL: 42 * MathUtils.DEG2RAD,
  restYawL: 10 * MathUtils.DEG2RAD,
  restGapL: 0,
  liftPoleL: [-1.2, -0.6, 0],
  restBow: {
    lap: { along: 0.6, offset: [0.4, 0.6, -0.05] },
    tip: [0.15, 1, -0.45],
    hair: [0, 0, -1],
    via: { tip: [0.4, 0.3, -1], hair: [0, 0, -1], reach: [0.5, 0.45, -0.15] },
  },
  standBow: HANGING_BOW,
} as const satisfies BowedHold;

/**
 * The hold of the cello between the knees, for the dog mesh (design 4.6, 5.3): the arm values of
 * {@link CELLO_HOLD} with a fixed place. The cello leans back 25° from the vertical, with the back
 * of the upper bout at the chest, the neck at the left of the head, and the endpin on the floor
 * 0.06 m right of the middle and 0.66 m in front of the floor point of the seat. It leans 14° to
 * the left, and its top plate turns 6° to the right. It keeps this place in the rest pose
 * (`BowedHold.rest` null). The short thighs end far behind the lower bout, so the knees do not
 * touch the cello. The left paw keeps the tilt of the low positions in the high positions.
 */
const DOG_HOLD = {
  ...CELLO_HOLD,
  playShift: [-0.076, 0, -0.34],
  playTurn: [-0.0371, 0.1049, -0.0435, 0.9928],
  highTilt: 0,
  restBow: LAP_CELLO_BOW,
  fit: null,
} as const satisfies BowedHold;

/**
 * The hold of the contrabass of the hippo mesh, which stands (design 4.6, 5.3). A real bassist
 * leans the contrabass on the body, and the contrabass does not go in
 * (`docs/reference/string-technique.md`, section 2.8). The round belly of the hippo reaches 0.35 m
 * in front of its shoulder joints, the back of its smaller contrabass (`bassScale`) lies 0.26 m
 * behind the strings, and its arms are only 0.51 m long. Thus the back of the contrabass touches
 * the front of the belly, and the arms reach the strings with the help of the shoulders. The end
 * pin of 0.2 m (`BASS_END_PIN`) stands on the floor 0.48 m right of the place of
 * `UPRIGHT_HOLDS` and 8 cm forward (`playShift`), and the contrabass turns around it
 * (`playTurn`): it leans 33° from the vertical, to the left and 6° back, and its top plate faces
 * forward. The strings run from the contact point 0.28 m in front of the belly up to the nut beside
 * the head. With a lean 5° further back and the contact point 11 cm further back, the back of the
 * contrabass goes 14.8 cm into the belly and the chest. The trunk leans 12° forward. The right
 * shoulder turns 50° forward, and the left shoulder 25° (`reachL`), also in the rest: with no left
 * turn, the left paw reaches one place of the fingerboard only, and the left forearm goes 3.7 cm
 * into the neck. With a right turn of 55°, the skin of the chest under the chin folds.
 *
 * The string planes are 6° apart, below the 25° of a real contrabass, as on the cello of the dog:
 * with 12°, the bow arm reaches 4 cm of the hair at this place, and the right arm goes 5.1 cm into
 * the contrabass. The bow plays no hair within 0.25 m of the frog (`frogHair`): the short bow arm
 * reaches the frog only straight, and then the right upper arm goes 5.2 cm into the right rim of
 * the upper bout. The right elbow points out, a little up, and forward, and less up at the tip, so
 * that the forearm slopes down to the bow and the wrist stays nearly straight, as on a real
 * bassist. With the elbow forward, out, and a little down, the forearm lies level across the
 * belly, the paw bends down onto the bow like a hook, the arm looks bent in an unnatural way, and
 * the right upper arm goes 4.1 cm into the body. With the elbow level at the tip and the grip in
 * the middle of the paw, it goes 3.0 cm into the body (2.8 cm with this elbow). With the elbow of
 * the frog at the tip, face 443 of the right forearm folds in 0.3% of the play. The left elbow
 * points out to the left, a little down, and forward. Both elbows are low, with the twist bone of
 * the upper arm: with the level elbow, the right upper arm rolls 86° on the median of the play,
 * and the shoulder skin twists into a flat band. With the left elbow up and back, the left upper
 * arm turns 80°. The left elbow turns up 2° for each lower string, as on the cello of the dog:
 * with 10°, the thick left upper arm goes 7.0 cm into the contrabass (6.4 cm with 2°). The left
 * paw tilts 55° over the neck, as the paw of the dog: with the 30° of the floor hold, the left arm
 * goes 6.9 cm into the body (5.6 cm with 55°).
 *
 * In pizzicato, the right paw comes up from the side, 0.18 m right of the strings (`pluckSide`),
 * as a real bassist rests the thumb on the edge of the fingerboard
 * (`docs/reference/string-technique.md`, section 2.8). The right shoulder lies 0.16 m behind the
 * back of the contrabass, so the arm reaches the strings nearly straight: with the palm above the
 * strings, the arm goes through the right rim of the upper bout, 7.7 cm deep. The elbow points out
 * to the right, up, and forward: with the elbow out and level, the forearm goes 1.7 cm into the
 * rim in 3% of the samples of `boulanger-matin`, and with the elbow of the bow, the paw twists
 * 153° in the lowering after a pizzicato (the arm gate). The bow tip points up, square to the
 * strings, so that the forearm comes to the hand at about 45° in the plane of the palm, as in the
 * play: with the tip up, left, and forward, it comes at 100° to 109°, past the limit of
 * `PAW_TURN` of `models/studio-rig.ts`, and the paw swings up to 41° off the forearm. With the tip
 * up, forward, and a little out and the elbow a little up, the straight paw twists 159° on its
 * forearm in the lowering after a pizzicato (140° with this tip, the arm gate).
 *
 * The left paw stops the strings only up to 0.7 of the fingerboard from the nut (`stopEnd`): the
 * left shoulder lies behind the upper bout, so a paw over the bout puts the thick left forearm
 * 7.0 cm into it, and with 0.73 already 2.4 cm. A real bassist raises the elbow so that the wrist
 * comes over the shoulder of the instrument, but the short arm of the hippo does not reach so far.
 *
 * The right elbow lies near the backward line of the stick, and on the E and the A strings it lies
 * near the far side of the stick for the roll of the hand. With the far side at 180°, a change of
 * the string turns the paw by about 200° (847 jumps above 90° in 0.25 s over the demos). The far
 * side lies at 30°, in the middle of the angles that no elbow of the play takes (-40° to 110°), so
 * the roll stays at one end of its range: 20 jumps, and the dog cellist has 25. On the low
 * strings, the paw then goes more than 1.5 cm into the belly in 4.6% of the play samples (0% with
 * 180°).
 *
 * In the rest pose, the contrabass stays at its playing place, and the left paw holds the neck
 * with the elbow out to the left and a little down: with the elbow further down, the left forearm
 * goes 2.2 cm into the neck in the lift and the lowering, and with a level elbow, the left paw
 * twists 178° on its forearm in the lowering (limit 176°). The right paw hangs beside the belly
 * with the bow tip down (`HANGING_BOW`), and the elbow points down and a little out, as the arms of
 * the mesh hang: at the knee of the floor hold, under the belly, the right forearm goes 13.8 cm
 * into the body. With the elbow further out, the arm segments roll the hanging upper arm so far
 * that the skin twists 41° along it (29° with this elbow, the arm gate). With the elbow further
 * in or forward, the right forearm goes 1.6 cm to 4.8 cm into the belly. The grip in the middle
 * of the paw holds the paw 2.5 cm nearer to the frog, so the rest grip lies 0.1 H further out:
 * 0.1 H further in, two faces of the inner right elbow fold in each rest sample, and with the grip
 * 0.1 H lower, the right upper arm goes 6.2 cm into the body at rest (5.7 cm at this place). In
 * the lift and the lowering, the tip turns through the front, as the upright bow of the
 * violinists, with the grip 0.3 H out, 0.3 H up, and 0.6 H to the front: with no move up, the bow
 * paw turns 2,959°/s at the most in the lowering.
 *
 * The bow paw keeps the bend of its bind pose on the forearm (`pawKeepR` 1), as a bassist holds
 * the French bow "as if the hand is resting by the side" (`docs/reference/string-technique.md`,
 * section 2.1). The bind bends the short paw 25° off the thick forearm, and the turn of the
 * retarget onto the line of the forearm bends the skin of the wrist 25° off that form: the edges
 * of the wrist stretch up to 1.9 times, and the heel of the paw shows as a lump under the bow paw
 * from the right. With the bend, they stretch up to 1.3 times.
 *
 * The bow hand turns in the plane of its palm around the grip on the stick, so that the forearm
 * keeps 45° in that plane (`stickTurnR`), and the paw keeps one turn on the hand. The grip lies in
 * the middle of the closed paw (`SpeciesParams.bowGrip`), so the stick stays within 0.4 cm of it
 * in the play, the lift, the rest, and the lowering. The bow turns in the paw over a stroke. With
 * the paw turned toward the forearm by the retarget alone, the forearm turns about 45° against the
 * bow over a stroke, and the paw slides up to 2.4 cm off the stick. The turn goes up to 90°,
 * because the lowering after a pizzicato turns the forearm up to 79° past 45°.
 */
const HIPPO_HOLD = {
  ...BOWED_HOLDS.contrabass,
  lean: 12 * MathUtils.DEG2RAD,
  reach: 50 * MathUtils.DEG2RAD,
  reachL: 25 * MathUtils.DEG2RAD,
  playShift: [0.9489, 0, -0.1588],
  playTurn: [-0.1075, 0.2477, 0.2044, 0.9409],
  stringTurn: 6 * MathUtils.DEG2RAD,
  frogHair: 0.25,
  tiltL: 55 * MathUtils.DEG2RAD,
  poleL: [-1, -0.3, -0.7],
  elbowPerString: 2 * MathUtils.DEG2RAD,
  poleR: [2, 0.3, -1],
  poleTipR: [2, 0.15, -1],
  polePizzicato: [3, 0.9, -1],
  pizzicatoTip: [0, 1, 0],
  pluckSide: 0.18,
  stopEnd: 0.7,
  farSideR: 30 * MathUtils.DEG2RAD,
  pawKeepR: 1,
  stickTurnR: { forearm: 45 * MathUtils.DEG2RAD, most: 90 * MathUtils.DEG2RAD },
  restPoleR: [0.6, -1, 0],
  restPoleL: [-1, -0.3, 0],
  restBow: {
    lap: { along: 1, offset: [0.8, 1, -0.4] },
    tip: HANGING_BOW.tip,
    hair: HANGING_BOW.hair,
    via: { ...UPRIGHT_BOW.via, reach: [0.3, 0.3, -0.6] },
  },
} as const satisfies BowedHold;

/**
 * The holds of the species that hold a bowed string in their own way, in place of
 * {@link BOWED_HOLDS}: the rabbits and the red foxes hold the violin on the left shoulder, as in
 * `rabbit-views.png`, the cat holds the viola with its own hold, and the dog holds the cello
 * between its knees.
 * The tools change them in memory with `--set '<instrument>@<species>.<path>=<value>'`
 * (`tools/hold-sets.ts`).
 */
export const SPECIES_HOLDS: Partial<
  Record<SpeciesId, Partial<Record<BowedInstrument, BowedHold>>>
> = {
  rabbit: { violin: SHOULDER_HOLD },
  'fox-red': { violin: FOX_HOLD },
  cat: { viola: CAT_HOLD },
  dog: { cello: DOG_HOLD },
  hippo: { contrabass: HIPPO_HOLD },
  wolf: { violin: WOLF_VIOLIN_HOLD },
};

/**
 * Gives the hold of a bowed string for a species: its own hold, or the hold of
 * {@link BOWED_HOLDS}.
 *
 * @param species The species of the player.
 * @param instrument The instrument.
 * @returns The hold.
 */
export function holdOf(species: SpeciesId, instrument: BowedInstrument): BowedHold {
  return SPECIES_HOLDS[species]?.[instrument] ?? BOWED_HOLDS[instrument];
}

/**
 * The rest pose of the violin and the viola of a soloist who stands (design 5.2): the left hand
 * holds the instrument at the left side, with the scroll forward and a little up, and the top plate
 * out. The bow hangs from the right hand. With the scroll up, the body of the instrument hangs
 * below the hanging hand, and it goes 0.05 m (violin) to 0.12 m (viola) into the floor.
 */
const STANDING_REST = { axis: [0, 0.15, -1], top: [-1, 0, 0] } as const satisfies {
  readonly axis: Vec3;
  readonly top: Vec3;
};

/** The step of the search for the reached part of the bow hair, in meters. */
const BOW_STEP = 0.005;

const BONES = {
  spine: boneIndex('spine'),
  chest: boneIndex('chest'),
  instrument: boneIndex('instrument'),
  handL: boneIndex('handL'),
  fingersL: boneIndex('fingersL'),
  handR: boneIndex('handR'),
  bow: boneIndex('bow'),
} as const;

/**
 * The points of a bowed string player in the bind pose, in the model axes, that the pose needs
 * at each frame.
 */
export interface BowedRig {
  readonly hold: BowedHold;
  /** The bind position of the `instrument` bone, and the index and bind position of its parent. */
  readonly pivot: Vec3;
  readonly parent: number;
  readonly parentBind: Vec3;
  /** The bind positions of the `spine` and the `chest` bones. */
  readonly spineBind: Vec3;
  readonly chestBind: Vec3;
  /** The point on the strings where the bow plays in the model. */
  readonly contact: Vec3;
  /** The length of the strings from the bridge to the nut. */
  readonly stringLength: number;
  /** The place of {@link BowedRig.contact} as a share of the string length from the bridge. */
  readonly contactShare: number;
  /** The unit direction from the tail end to the scroll. */
  readonly axis: Vec3;
  /** The unit normal of the top plate, to the strings. */
  readonly top: Vec3;
  /** The unit direction across the strings to the side of the bow tip. */
  readonly across: Vec3;
  /** The unit direction across the strings to which the left fingers tilt. */
  readonly fingers: Vec3;
  /** The start of the target `fingerboard`: the nut, on the strings. */
  readonly nut: Vec3;
  /** The vector of the target `fingerboard`, from the nut to the end of the fingerboard. */
  readonly neck: Vec3;
  /** The `fingersL` bone, from the `handL` bone. */
  readonly knuckles: Vec3;
  /** The middle of the left finger block, from the `fingersL` bone. */
  readonly fingerBlock: Vec3;
  /** The point on the strings above which the right hand plucks. */
  readonly pluck: Vec3;
  /** The start of the bow hair at the frog, from the `bow` bone at the grip. */
  readonly hairStart: Vec3;
  /** The `bow` bone at the grip, from the `handR` bone. */
  readonly grip: Vec3;
  /** The unit direction of the stick from the frog to the tip, in the bind pose. */
  readonly stick: Vec3;
  /** The length of the right forearm, from the elbow to the wrist. */
  readonly forearm: number;
  readonly hairLength: number;
  /** The rotation that turns the bow axes (along the hair, to the strings) to the bind pose. */
  readonly bowAlign: Quat;
  readonly armL: ArmRig;
  readonly armR: ArmRig;
  /** The rotation of the `instrument` bone in the rest pose, relative to its parent. */
  readonly restRotation: Quat;
  /** The move of the instrument while the player plays, in meters (`BowedHold.playShift`). */
  readonly playShift: Vec3;
  /** The place of the `instrument` bone in the rest pose, in the model axes. */
  readonly restPivot: Vec3;
  /**
   * The move of the instrument in the middle of the lift and of the lowering, in meters, in the
   * axes of the root (`BowedHold.liftReach`).
   */
  readonly liftReach: Vec3;
  /** The direction to which the right elbow points in the rest pose, in the axes of the root. */
  readonly restPoleR: Vec3;
  /** The direction to which the left elbow points in the rest pose, in the axes of the chest. */
  readonly restPoleL: Vec3;
  /** The bow in the rest pose: the place of the `bow` bone and its rotation, in the model axes. */
  readonly restBow: {
    /** The place of the `bow` bone: the grip on the stick. */
    readonly grip: Vec3;
    /** The rotation of the `bow` bone from the bind pose. */
    readonly rotation: Quat;
    /**
     * The bow in the middle of the lift and of the lowering ({@link BowVia}): the rotation of the
     * `bow` bone from the bind pose, and the move of the grip in meters, in the model axes.
     * `null` mixes the rest bow and the playing bow directly.
     */
    readonly via: { readonly rotation: Quat; readonly reach: Vec3 } | null;
  };
  /** The part of the bow hair that the bow arm reaches on all strings (design 5.3). */
  readonly bowRange: BowRange;
  /**
   * The part of the target `fingerboard` that the left arm reaches, from 0 at the nut to 1 at the
   * end (design 5.3). The places of the notes map into it.
   */
  readonly stopRange: readonly [low: number, high: number];
}

/** The points of a rig before its ranges. */
export type RigPoints = Omit<BowedRig, 'bowRange' | 'stopRange'>;

/**
 * Finds a target of an instrument.
 *
 * @param model The player model.
 * @param kind The kind of the target.
 * @returns The target.
 * @throws Error if the instrument has no target of the kind.
 */
function targetOf(model: PlayerModel, kind: PlayTargetKind): PlayTarget {
  const target = model.instrument.targets.find((t) => t.kind === kind);
  if (!target) {
    throw new Error(`The ${model.instrument.id} has no target "${kind}".`);
  }
  return target;
}

/**
 * Gives a unit vector normal to an axis, on the side of a preferred direction.
 *
 * @param v A vector normal to the axis.
 * @param prefer The preferred side.
 * @returns `v` or `-v`, as a unit vector.
 */
function toSide(v: Vector3, prefer: Vec3): Vec3 {
  const unit = v.clone().normalize();
  return toVec3(unit.dot(new Vector3(...prefer)) < 0 ? unit.negate() : unit);
}

/**
 * Makes the frames of the torso in the playing pose with no idle motion: the bind pose with the
 * lean of the hold. The reach searches of the rig and `pnpm hold-reach` use them.
 *
 * @param rig The points of the player.
 * @returns The frames.
 */
export function playingFrames(rig: RigPoints): TorsoFrames {
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -rig.hold.lean);
  const spine = new Vector3(...rig.spineBind);
  return {
    root: { rotation: new Quaternion(), position: new Vector3() },
    chest: {
      rotation: lean,
      position: new Vector3(...rig.chestBind).sub(spine).applyQuaternion(lean).add(spine),
    },
  };
}

/**
 * Finds the part of the bow hair that the bow arm reaches on all strings in the playing pose, from
 * the frog hair of the hold (`BowedHold.frogHair`) on. A small player cannot reach the tip of a
 * long bow.
 *
 * @param rig The points of the player.
 * @returns The longest reached part of the hair, in meters from the frog end. If the arm reaches
 *   no part, the 0.04 m around the nearest place.
 */
function bowRangeOf(rig: RigPoints): BowRange {
  const frames = playingFrames(rig);
  const { place, strings, bow: placed, hand } = createBowPlaces();
  const tilted = { grip: new Vector3(), rotation: new Quaternion() };
  stringsAt(rig, instrumentAt(rig, frames, 1, place), strings);
  const pole = new Vector3(...rig.hold.poleR).applyQuaternion(frames.chest.rotation);
  const shoulder = poseShoulder(
    rig.armR,
    frames.chest,
    rig.chestBind,
    shoulderTurn(rig, 1, new Quaternion()),
  );
  // The hand rolls so that its back points to the elbow of the hold, as in the pose.
  const wristAt = (string: number, at: number): Vector3 => {
    heldBowAt(rig, strings, string, at, 0, tilted, placed);
    const wrist = gripHand(rig, placed, 0, hand).wrist;
    const { elbow } = solveArm(rig.armR.bind, shoulder.position, shoulder.rotation, wrist, pole);
    return gripHand(rig, placed, rollToward(rig, placed, elbow), hand).wrist;
  };
  const reach = rig.armR.reach;
  const free = rig.hold.freeHair;
  const frog = Math.max(free, rig.hold.frogHair);
  const end = rig.hairLength - free;
  // The places of the search: each step from the frog, and the end of the hair last, so that the
  // search also tests the tip. With the steps alone, the hair of the cat ends 4.9 mm after the
  // last step, and its bow stops there although the arm reaches the end.
  const places: number[] = [];
  for (let bow = frog; bow < end - 1e-9; bow += BOW_STEP) {
    places.push(bow);
  }
  places.push(end);
  let best: [number, number] | null = null;
  let start = -1;
  let nearest = frog;
  let nearestDistance = Infinity;
  let previous = frog;
  for (const [k, bow] of places.entries()) {
    const distance = Math.max(
      wristAt(0, bow).distanceTo(shoulder.position),
      wristAt(3, bow).distanceTo(shoulder.position),
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = bow;
    }
    const reached = distance <= reach;
    if (reached && start < 0) {
      start = bow;
    }
    if (start >= 0 && (!reached || k === places.length - 1)) {
      const stop = reached ? bow : previous;
      if (!best || stop - start > best[1] - best[0]) {
        best = [start, stop];
      }
      start = -1;
    }
    previous = bow;
  }
  return best ?? [Math.max(0, nearest - 0.02), nearest + 0.02];
}

/** The step of the search for the reached part of the fingerboard. */
const STOP_STEP = 0.01;

/**
 * Finds the part of the fingerboard that the left arm reaches in the playing pose, up to the end of
 * the hold (`BowedHold.stopEnd`). The neck of a contrabass goes high above the shoulder, so a small
 * player cannot reach the nut.
 *
 * @param rig The points of the player.
 * @returns The longest reached part, from 0 at the nut to 1 at the end. If the arm reaches no
 *   place, the place nearest to the shoulder.
 */
function stopRangeOf(rig: RigPoints): readonly [low: number, high: number] {
  const frames = playingFrames(rig);
  const { place, strings } = createBowPlaces();
  instrumentAt(rig, frames, 1, place);
  stringsAt(rig, place, strings);
  const shoulder = poseShoulder(
    rig.armL,
    frames.chest,
    rig.chestBind,
    shoulderTurnL(rig, 1, new Quaternion()),
  ).position;
  const hand = { wrist: new Vector3(), rotation: new Quaternion() };
  let best: [number, number] | null = null;
  let start = -1;
  let nearest = 0;
  let nearestDistance = Infinity;
  const steps = Math.round(rig.hold.stopEnd / STOP_STEP);
  for (let k = 0; k <= steps; k++) {
    const stop = k * STOP_STEP;
    const distance = stopHandAt(
      rig,
      place,
      strings,
      stop,
      BOWED_HANDS.curlL,
      0,
      MIDDLE_FINGER,
      hand,
    ).wrist.distanceTo(shoulder);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = stop;
    }
    const reached = distance <= rig.armL.reach;
    if (reached && start < 0) {
      start = stop;
    }
    if (start >= 0 && (!reached || k === steps)) {
      const end = reached ? stop : stop - STOP_STEP;
      if (!best || end - start > best[1] - best[0]) {
        best = [start, end];
      }
      start = -1;
    }
  }
  return best ?? [nearest, nearest];
}

/**
 * Gives the place of the `instrument` bone in the rest pose (design 5.2), in the model axes.
 *
 * @param model The player model.
 * @param hold The hold of the instrument.
 * @param atSide True when the left hand holds the instrument at the side in the rest pose.
 * @param pivot The bind position of the `instrument` bone.
 * @param playShift The move of the instrument while the player plays, in meters.
 * @returns The place on the left thigh, the bind place for an instrument at the side (the rest
 *   at the side moves it later), or the playing place for an instrument on the floor.
 */
function restPivotOf(
  model: PlayerModel,
  hold: BowedHold,
  atSide: boolean,
  pivot: Vec3,
  playShift: Vector3,
): Vec3 {
  if (!hold.rest) {
    return toVec3(new Vector3(...pivot).add(playShift));
  }
  return atSide ? pivot : lapPoint(model, 'L', hold.rest.lap);
}

/**
 * Finds the points of a bowed string player that the pose needs.
 *
 * @param model A player with a violin, a viola, a cello, or a contrabass.
 * @param instrument The instrument of the model.
 * @param given The hold of the instrument. The stage uses the hold of {@link BOWED_HOLDS}. A hold
 *   with a fit takes the place of the cello from the body (`BowedHold.fit`).
 * @returns The rig.
 * @throws Error if the instrument has no bow or no target of a bowed string.
 */
export function bowedRig(
  model: PlayerModel,
  instrument: BowedInstrument,
  given: BowedHold = BOWED_HOLDS[instrument],
): BowedRig {
  const hold = given.fit ? { ...given, ...fitCelloPlace(model, given.fit.gap) } : given;
  const { positions, parents } = model.skeleton;
  const at = (bone: number): Vec3 => positions[bone] ?? [0, 0, 0];
  const pieceRotation = (bone: 'instrument' | 'bow'): Quaternion => {
    const placed = model.pieces.find((p) => p.piece.bone === bone);
    if (!placed) {
      throw new Error(`The ${instrument} has no piece on the bone "${bone}".`);
    }
    return new Quaternion(...placed.at.rotation);
  };
  const placed = (bone: 'instrument' | 'bow', point: Vec3): Vector3 =>
    new Vector3(...placePoint(model.pieces, { bone, at: point }));
  const contactTarget = targetOf(model, 'bow-contact');
  const board = targetOf(model, 'fingerboard');
  const hair = targetOf(model, 'bow-hair');

  const contact = placed('instrument', contactTarget.from);
  // The model of each bowed string is the violin model at its scale.
  const contactShare = (VIOLIN.bowContact - VIOLIN.bridge) / (VIOLIN.nut - VIOLIN.bridge);
  const top = new Vector3(...contactTarget.normal)
    .applyQuaternion(pieceRotation('instrument'))
    .normalize();
  const nut = placed('instrument', board.from);
  const neckEnd = placed('instrument', board.to);
  const neck = neckEnd.clone().sub(nut);
  const axis = neck.clone().negate().normalize();
  const hairFrom = placed('bow', hair.from);
  const hairTo = placed('bow', hair.to);
  const hairAxis = hairTo.clone().sub(hairFrom).normalize();
  const hairNormal = new Vector3(...hair.normal).applyQuaternion(pieceRotation('bow')).normalize();

  const parent = parents[BONES.instrument] ?? 0;
  const atSide = (model.support === 'stand' || hold.restAtSide) && hold.rest !== null;
  const lapRest = atSide ? STANDING_REST : hold.rest;
  const restRotation = new Quaternion();
  const bindTurn = setFromBasis(new Quaternion(), axis, top).invert();
  const turnTo = (
    turn: { readonly axis: Vec3; readonly top: Vec3 },
    out: Quaternion,
  ): Quaternion => {
    const toAxis = new Vector3(...turn.axis).normalize();
    const toTop = new Vector3(...turn.top);
    toTop.addScaledVector(toAxis, -toTop.dot(toAxis)).normalize();
    return setFromBasis(out, toAxis, toTop).multiply(bindTurn);
  };
  if (lapRest) {
    turnTo(lapRest, restRotation);
  } else {
    // An instrument on the floor rests at its playing place.
    restRotation.fromArray(hold.playTurn);
  }
  const restBow = hold.restBow;
  const bowBind = setFromBasis(new Quaternion(), hairAxis, hairNormal).invert();
  const bowRotation = (tip: Vec3, side: Vec3): Quat => {
    const t = new Vector3(...tip).normalize();
    const n = new Vector3(...side);
    n.addScaledVector(t, -n.dot(t)).normalize();
    return toQuat(setFromBasis(new Quaternion(), t, n).multiply(bowBind));
  };
  const via = restBow.via;
  const strings = new Vector3().crossVectors(top, axis);
  const playShift = new Vector3(...hold.playShift).multiplyScalar(model.body.headHeight);
  const pivot = at(BONES.instrument);
  const rig: RigPoints = {
    hold,
    pivot,
    parent,
    parentBind: at(parent),
    spineBind: at(BONES.spine),
    chestBind: at(BONES.chest),
    contact: toVec3(contact),
    stringLength: contact.distanceTo(nut) / (1 - contactShare),
    contactShare,
    axis: toVec3(axis),
    top: toVec3(top),
    across: toSide(strings, hold.tip),
    fingers: toSide(strings, hold.fingers),
    nut: toVec3(nut),
    neck: toVec3(neck),
    knuckles: toVec3(new Vector3(...at(BONES.fingersL)).sub(new Vector3(...at(BONES.handL)))),
    fingerBlock: toVec3(
      new Vector3(...model.body.fingerBlockL).sub(new Vector3(...at(BONES.fingersL))),
    ),
    pluck: toVec3(contact.clone().sub(neckEnd).multiplyScalar(hold.pluckPlace).add(neckEnd)),
    hairStart: toVec3(hairFrom.clone().sub(new Vector3(...at(BONES.bow)))),
    grip: toVec3(new Vector3(...at(BONES.bow)).sub(new Vector3(...at(BONES.handR)))),
    stick: toVec3(hairAxis),
    forearm: new Vector3(...at(BONES.handR)).distanceTo(new Vector3(...at(boneIndex('forearmR')))),
    hairLength: hairTo.distanceTo(hairFrom),
    bowAlign: toQuat(setFromBasis(new Quaternion(), hairAxis, hairNormal).invert()),
    armL: armRig(model, 'L'),
    armR: armRig(model, 'R'),
    restRotation: toQuat(restRotation),
    playShift: toVec3(playShift),
    restPivot: restPivotOf(model, hold, atSide, pivot, playShift),
    liftReach: toVec3(new Vector3(...hold.liftReach).multiplyScalar(model.body.headHeight)),
    restPoleR: hold.restPoleR,
    restPoleL: hold.restPoleL,
    restBow: {
      grip: restBow.forearm
        ? forearmGrip(model, restBow.forearm)
        : lapPoint(model, 'R', restBow.lap),
      rotation: bowRotation(restBow.tip, restBow.hair),
      via: via
        ? {
            rotation: bowRotation(via.tip, via.hair),
            reach: toVec3(new Vector3(...via.reach).multiplyScalar(model.body.headHeight)),
          }
        : null,
    },
  };
  const standBow = hold.standBow ? bowRotation(hold.standBow.tip, hold.standBow.hair) : null;
  const standVia = hold.standBow?.via;
  const rest = atSide
    ? standingRest(
        model,
        rig,
        standBow,
        standVia
          ? {
              rotation: bowRotation(standVia.tip, standVia.hair),
              reach: toVec3(new Vector3(...standVia.reach).multiplyScalar(model.body.headHeight)),
            }
          : null,
      )
    : rig;
  return { ...rest, bowRange: bowRangeOf(rest), stopRange: stopRangeOf(rest) };
}

/**
 * Gives the grip of a bow at rest at the end of the right forearm: from the elbow of the bind
 * pose, along a direction, by the length of the forearm and of the paw to the middle of the palm.
 * The upper arm then hangs as in the bind pose, so its twist and its folds stay near the bind on
 * each body, and the rest elbow stays near the play elbow (design 5.2, 5.3).
 *
 * @param model The player model.
 * @param direction The direction of the forearm, in the model axes.
 * @returns The grip, in the model axes.
 */
function forearmGrip(model: PlayerModel, direction: Vec3): Vec3 {
  const at = (bone: 'forearmR' | 'handR'): Vector3 =>
    new Vector3(...(model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0]));
  const elbow = at('forearmR');
  const wrist = at('handR');
  const length = elbow.distanceTo(wrist) + wrist.distanceTo(new Vector3(...model.body.palmR));
  return toVec3(elbow.addScaledVector(new Vector3(...direction).normalize(), length));
}

/**
 * Gives the frames of the torso in the bind pose.
 *
 * @param rig The points of the player.
 * @returns The frames of the root and of the chest, with no turn.
 */
function bindFrames(rig: RigPoints): TorsoFrames {
  return {
    root: { rotation: new Quaternion(), position: new Vector3() },
    chest: { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) },
  };
}

/**
 * Gives the rest pose of a soloist who stands (design 5.2): the arms hang a little out to the
 * sides, the left hand holds the instrument at the rest place of the fingers, and the right hand
 * holds the bow at the hanging wrist, as in the bind pose or with the turn of
 * {@link BowedHold.standBow}.
 *
 * @param model The player model.
 * @param rig The points of the player, with the instrument turned for the rest pose.
 * @param standBow The turn of the bow of {@link BowedHold.standBow} in the model axes, or `null`
 *   for the turn of the hanging hand.
 * @param via The bow in the middle of the lift and of the lowering, in the model axes, or `null`
 *   for a direct mix of the hanging bow and the playing bow.
 * @returns The points, with the rest place of the instrument and the bow.
 */
function standingRest(
  model: PlayerModel,
  rig: RigPoints,
  standBow: Quat | null,
  via: BowedRig['restBow']['via'],
): RigPoints {
  const hangL = hangingArm(model, rig.armL);
  const hangR = hangingArm(model, rig.armR);

  // The left hand holds the instrument at the hanging wrist.
  const frames = bindFrames(rig);
  const { place, strings } = createBowPlaces();
  instrumentAt(rig, frames, 0, place);
  stringsAt(rig, place, strings);
  const hand = { wrist: new Vector3(), rotation: new Quaternion() };
  if (rig.hold.restPawTurnL !== null) {
    restHandAt(rig, place, strings, hand);
  } else {
    stopHandAt(rig, place, strings, rig.hold.restPlace, 0, 0, MIDDLE_FINGER, hand);
  }
  const wristL = new Vector3(...rig.armL.bind.shoulder).add(new Vector3(...hangL.wrist));

  // The right hand holds the bow at the hanging wrist, as in the bind pose or with its own turn.
  const bowHand = standBow ? new Quaternion(...standBow) : new Quaternion(...hangR.hand);
  const wristR = new Vector3(...rig.armR.bind.shoulder).add(new Vector3(...hangR.wrist));

  return {
    ...rig,
    restPivot: toVec3(new Vector3(...rig.restPivot).add(wristL.sub(hand.wrist))),
    restPoleR: hangR.pole,
    restPoleL: hangL.pole,
    restBow: {
      grip: toVec3(new Vector3(...rig.grip).applyQuaternion(bowHand).add(wristR)),
      rotation: toQuat(bowHand),
      via,
    },
  };
}
