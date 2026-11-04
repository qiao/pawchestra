import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { SpeciesId } from '../models/species.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PiecePoint } from '../models/instruments/types.ts';
import { IDENTITY, toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { mixDirection, mixRotation } from './blend.ts';
import type { InstrumentOf } from './family.ts';
import { NECK_SHARE, createFrame, posePoint, setBoneRotation, setFromBasis } from './frames.ts';
import type { Frame, TorsoFrames } from './frames.ts';
import { hangingArm, hangingHand, hangingWrist } from './hang.ts';
import type { HangAngles, HangingArm } from './hang.ts';
import { armRig, handToward, poseShoulder, writeArm, writeCurl } from './ik.ts';
import type { ArmRig } from './ik.ts';
import { lapHand } from './lap.ts';
import type { LapHand } from './lap.ts';
import { headBow } from './far-mouth.ts';
import { elbowOutTurn, keepBent, liftShoulder, shoulderLift, turnPoleOut } from './round-arms.ts';
import { BRASS_FUNDAMENTALS } from './wind-notes.ts';
import type { Fingering, WindState } from './wind-notes.ts';

/** The woodwinds and the brass of design 4.6. */
export type WindInstrument = InstrumentOf<'woodwind' | 'brass'>;

/**
 * The values of the hold of each wind instrument (design 5.3). The directions are in the model
 * axes of the bind pose: the player faces -z, and its left is -x.
 */
export interface WindHold {
  /**
   * The forward turn of the right shoulder bone around y, so that the right arm reaches a far
   * grip: the low hands of the oboe and the clarinet, and the trombone slide.
   */
  readonly reach: number;
  /**
   * The forward turn of the left shoulder bone around y, so that the left upper arm does not take
   * the whole turn to a grip far in front of the chest. 0 keeps the left shoulder square.
   */
  readonly reachL: number;
  /** The directions to which the elbows point. */
  readonly poleL: Vec3;
  readonly poleR: Vec3;
  /** The direction to which the left elbow points in the rest pose: out to the side. */
  readonly restPoleL: Vec3;
  /** The direction to which the right elbow points in the rest pose. */
  readonly restPoleR: Vec3;
  /**
   * The rule of the round free arms (design 5.3): the out swing that the arms of the body that the
   * hold fits need (`armOut()`), in radians. A rounder body turns each elbow out, at rest and in
   * the play (`elbowOutTurn()`). `null` keeps the elbows of the hold on each body, as an own hold
   * does.
   */
  readonly roundArms: number | null;
  /**
   * The rule of the far mouth (design 5.3): the mouth share of the body that the hold fits
   * (`mouthShare()`). A body with a mouth further in front of the shoulders bows the head in the
   * play, and the instrument turns down with the head (`headBow()`). `null` keeps the head of the
   * hold on each body, as an own hold does.
   */
  readonly farMouth: number | null;
  /**
   * The rotation of the `instrument` bone while the player plays, relative to the chest. The
   * instrument turns around the mouthpiece, so that the mouthpiece stays at the mouth.
   */
  readonly play: Quat;
  /**
   * The rotation of the `instrument` bone in the rest pose, relative to the chest. The
   * instrument turns down around the mouthpiece. A pose has no move of the instrument bone, so
   * the mouthpiece stays under the mouth, and the head lifts off it.
   */
  readonly rest: Quat;
  /**
   * The move of the `instrument` bone in the rest pose, in head heights, in the axes of the chest.
   * The instrument comes down from the mouth to the lap. With {@link WindHold.restArms}, the move
   * starts at the place from the hanging arms.
   */
  readonly restShift: Vec3;
  /**
   * The arms in the rest pose from the hanging arms of the body (`hangingArm()` of `pose/hang.ts`,
   * design 5.2): each upper arm swings forward by its angle and out until it clears the side of
   * the body, and each elbow bends forward by its angle. The instrument takes its rest turn, and
   * moves so that the paws that hold it at rest hold their rest grips at the hanging palms: the
   * right paw alone when the left paw leaves its grip ({@link WindHold.restFreeL}), else the middle
   * of both paws. A free left paw hangs with its own angles, also on a seat, with the roll of its
   * grip ({@link freeRoll}). The rest elbows point as the hanging elbows. Thus the rest elbows stay
   * near the sides on each body. The shoulder turns of the hold grow with the weight of the playing
   * pose ({@link turnShare}). `null` keeps the rest place of {@link WindHold.restShift} from the
   * mouth and the rest elbows of the hold.
   */
  readonly restArms: { readonly L: HangAngles; readonly R: HangAngles } | null;
  readonly fingering: Fingering;
  /** The fundamental of a brass tube, as a MIDI key. 0 for a woodwind. */
  readonly fundamental: number;
  /**
   * The turn of the head to the left while the player plays, in radians, as the look turns the
   * neck and the head (design 5.3). The mouthpiece follows the turned mouth. A real flutist turns
   * the head to the left, so that the flute lies square to the face and the right elbow stays in
   * line with the shoulder. 0 keeps the head square to the chest.
   */
  readonly headTurn: number;
  /**
   * The move of the mouthpiece from the mouth of the bind pose, in head heights, in the bind axes
   * of the head. A long muzzle reaches past the mouth, so a flute can sit further back under it.
   * (0, 0, 0) keeps the mouthpiece at the mouth.
   */
  readonly lipShift: Vec3;
  /**
   * The left paw in the rest pose when it leaves its grip (design 5.2, 5.3): the place of the palm
   * of a seated player from the top of its left thigh (on the thigh, or beside it with the arm
   * hanging, as for the tan fox), the side of the palm, and the direction of the fingers. The
   * left arm of a standing player hangs (`hangingArm()`). The lift and the lowering move the left
   * paw between its rest place and its grip by the weight of the playing pose, the weight that
   * also moves the instrument, with the arc of the paw. `null` keeps the left palm on its grip,
   * also in the rest pose.
   */
  readonly restFreeL: FreePaw | null;
  /**
   * The side of each paw that faces its tube, for the left paw and the right paw: each paw rolls
   * around the line from its shoulder to its grip until that side faces the tube
   * ({@link faceTube}).
   *
   * - `palm`: the palm faces the tube, so that the curled fingers close around its front, as the
   *   fingers of a real player curve over the tube with the thumb behind it
   *   (`docs/reference/wind-technique.md` 2.3).
   * - `back`: the back of the paw faces the tube, and the grip moves past the axis, so that the
   *   tube goes through the closed paw. The tan fox holds the flute so. With `palm`, its right
   *   paw turns 142° on its forearm and flips in the lowering.
   * - `none`: the paw keeps the roll of its shoulder, and a small paw can hang beside the tube
   *   with its palm to the side.
   */
  readonly faceTube: readonly [left: TubeFace, right: TubeFace];
  /**
   * The share, from 0 to 1, of the part along the tube that the aim of each paw on its grip loses
   * in the playing pose ({@link aimAcross}). With 0, the paw points along the line from its
   * shoulder to its grip. A tube far in front of the body then puts that line along the tube, and
   * the fingers point past the tube in place of around it. Only a paw that rolls to face its tube
   * ({@link WindHold.faceTube}) takes it.
   */
  readonly aimAcross: number;
  /**
   * The share, from 0 to 1, of the side direction across the tube in the aim of each paw on its
   * grip in the playing pose ({@link aimSide}), for the left paw and the right paw. With 0, the
   * paw points from its shoulder to the tube. A tube far in front of the body then makes the paw
   * point forward, and the fingers stick out in front of the tube. With a share, the paw turns
   * toward the other side of the body, so that it lies across the back of the tube and its curled
   * fingers wrap the front. With a grip behind the tube, a share of half turns the palm of a
   * woodwind paw to the audience and its thumb down the tube, so a woodwind paw takes a small
   * share and a grip at the side of its own shoulder.
   * A share below 0, from -1 to 0, turns the paw by its size toward the opposite side direction,
   * so that a paw below and behind its tube points up past the back of the tube and its curled
   * fingers come over the top, as the right hand of a flutist does. Only a paw that rolls to face
   * its tube ({@link WindHold.faceTube}) takes it.
   */
  readonly aimSide: readonly [left: number, right: number];
  /**
   * The sign of the side direction across the tube in the aim of each paw ({@link aimSide}), 1 or
   * -1, for the left paw and the right paw, or `null` for the sign that continues the way of the
   * paw from its shoulder across the body in the playing pose ({@link aimSignOf}). A shared hold
   * takes the signs of its accepted player: a paw that lies nearly in the plane of its shoulder
   * and its tube gets the other sign on another body, and its paw turns about 180°.
   */
  readonly aimSigns: readonly [left: number, right: number] | null;
  /**
   * The move of the grip of the left palm from the grip of the instrument, in head heights, in the
   * axes of the tube ({@link shiftGrip}): along the tube from the mouthpiece, toward the axis of
   * the tube and past it, and across the tube away from the shoulder of the paw. The grip of a
   * woodwind lies 2.5 cm off the axis, and the palm point lies in the middle of the paw, so a move
   * puts the tube under the fingers of the paw, and the fingers close around it. (0, 0, 0) keeps
   * the grip of the instrument.
   */
  readonly gripShiftL: Vec3;
  /** The move of the grip of the right palm, as {@link WindHold.gripShiftL}. */
  readonly gripShiftR: Vec3;
  /**
   * The move of the grip of the left palm in the rest pose, as {@link WindHold.gripShiftL}, or
   * `null` for the move of the playing pose. The lift and the lowering slide the paw along the
   * tube between the two grips, by the weight of the playing pose, so that a paw can hold the
   * upper end of an instrument that rests low, such as the barrel of a clarinet with its bell on
   * the seat.
   */
  readonly restGripShiftL: Vec3 | null;
  /** The move of the grip of the right palm in the rest pose, as {@link WindHold.restGripShiftL}. */
  readonly restGripShiftR: Vec3 | null;
  /**
   * The share, from 0 to 1, of the roll of the paw to the tube and of the aim across it
   * ({@link WindHold.faceTube}, {@link WindHold.aimAcross}, {@link WindHold.aimSide}) that a paw on
   * its grip keeps in the rest pose. With 0, the rest paw keeps the roll and the aim of its
   * shoulder, and the lift and the lowering turn it to the grip of the play. With 1, the paw holds
   * the tube at rest as it does in the play, so its fingers close around the tube, and the lift and
   * the lowering do not turn it around the tube.
   */
  readonly restAim: number;
  /**
   * The curl of the fingers of each paw that closes around its tube, in radians (left, right), at
   * rest and in the play. A paw that closes a key or a valve curls further by its share of the
   * closed keys or the pressed valves ({@link WIND_BODY.keyCurl}). A real player curves the
   * fingers over the front of the tube, with the thumb behind it
   * (`docs/reference/wind-technique.md` 2.3). `null` keeps the curls of {@link WIND_BODY}, which
   * open the fingers in the play.
   */
  readonly gripCurl: readonly [left: number, right: number] | null;
  /**
   * Whether the lift and the lowering move each grip around the axis of its tube, from its rest
   * place to its place in the play ({@link aroundTube}). A grip that slides on a straight line
   * crosses the axis when the two places lie on different sides of the tube, and the paw that faces
   * the tube then turns over in one frame. `false` slides each grip on a straight line.
   */
  readonly gripAround: boolean;
}

/** The side of a paw that faces its tube (`WindHold.faceTube`). */
export type TubeFace = 'palm' | 'back' | 'none';

/** The left paw of a wind hold that leaves its grip in the rest pose (`WindHold.restFreeL`). */
export interface FreePaw extends LapHand {
  /**
   * The move of the wrist away from the straight line from its rest place to its grip, at the
   * middle of the lift and the lowering, in head heights: out to the left, up, and forward. The
   * move grows and shrinks with `4 w (1 - w)` of the weight `w` of the playing pose, so that the
   * paw passes in front of a round belly.
   */
  readonly arc: Vec3;
  /**
   * The forward angles of the hanging arm of a standing player (`hangingArm()`). The angles of
   * `HANG` when they are missing.
   */
  readonly hang?: HangAngles;
}

/**
 * The elbows of a wind player point out and forward, level with the line of the arm, unless a
 * hold turns them down. The elbows down and out, (0.6, -1, 0.2), put the arms of the woodwinds and
 * the horn up to 0.3 H into the thighs and 0.2 H into the belly in the play.
 */
const POLE_L: Vec3 = [-1, 0, -1];
const POLE_R: Vec3 = [1, 0, -1];

/** A woodwind hold with no shoulder turn and no turn in the rest pose. */
const WOODWIND = {
  reach: 0,
  reachL: 0,
  poleL: POLE_L,
  poleR: POLE_R,
  restPoleL: POLE_L,
  restPoleR: POLE_R,
  roundArms: null,
  farMouth: null,
  play: IDENTITY,
  rest: IDENTITY,
  restShift: [0, 0, 0],
  restArms: null,
  fingering: 'holes',
  fundamental: 0,
  headTurn: 0,
  lipShift: [0, 0, 0],
  restFreeL: null,
  faceTube: ['none', 'none'],
  aimAcross: 0,
  aimSide: [0, 0],
  aimSigns: null,
  gripShiftL: [0, 0, 0],
  gripShiftR: [0, 0, 0],
  restGripShiftL: null,
  restGripShiftR: null,
  restAim: 0,
  gripCurl: null,
  gripAround: false,
} as const satisfies WindHold;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Gives a rotation of the `instrument` bone in the rest pose or the playing pose: a turn around x,
 * then around z, after a first turn. The hold tools take it as the value of a `--set`, such as
 * `bassoon@beaver.play=holdTurn(20,20)` (`tools/hold-sets.ts`).
 *
 * @param x The turn around x, in degrees. A positive turn moves the lower end forward.
 * @param z The turn around z, in degrees. A positive turn moves the lower end to the right.
 * @param first The first turn. None by default.
 * @returns The rotation.
 */
export function holdTurn(x: number, z: number, first: Quat = IDENTITY): Quat {
  return toQuat(
    new Quaternion()
      .setFromAxisAngle(X_AXIS, x * MathUtils.DEG2RAD)
      .multiply(new Quaternion().setFromAxisAngle(Z_AXIS, z * MathUtils.DEG2RAD))
      .multiply(new Quaternion(...first)),
  );
}

/**
 * Gives the grip curl of a hold (`WindHold.gripCurl`) from angles in degrees.
 *
 * @param left The curl of the fingers of the left paw, in degrees.
 * @param right The curl of the fingers of the right paw, in degrees.
 * @returns The curls, in radians.
 */
function curls(left: number, right: number): readonly [left: number, right: number] {
  return [left * MathUtils.DEG2RAD, right * MathUtils.DEG2RAD];
}

/**
 * The direction of the flute in the bind pose: from the lip plate to the right, 10° to the front
 * and 8° down, with the keys up (`woodwindRotation()` of `models/instruments/woodwinds.ts`).
 */
const FLUTE_BIND = { forward: 10, down: 8 } as const;

/**
 * Gives the rotation of a tube from the mouthpiece along +x, with its keys along +y: the tube
 * points to the right, the given angles to the front and down, and the keys are as near to a
 * direction as the tube permits.
 *
 * @param forward The angle of the tube to the front of the right side, in degrees.
 * @param down The angle of the tube below the level, in degrees.
 * @param keys The direction of the keys. Up by default.
 * @returns The rotation.
 */
function tubeAim(forward: number, down: number, keys: Vec3 = [0, 1, 0]): Quaternion {
  const f = forward * MathUtils.DEG2RAD;
  const d = down * MathUtils.DEG2RAD;
  const along = new Vector3(Math.cos(d) * Math.cos(f), -Math.sin(d), -Math.cos(d) * Math.sin(f));
  const up = new Vector3(...keys).projectOnPlane(along).normalize();
  return setFromBasis(new Quaternion(), along, up);
}

/**
 * Gives the turn of the `instrument` bone of the flute from its bind direction to another
 * direction (design 5.3).
 *
 * @param forward The angle of the flute to the front of the right side, in degrees.
 * @param down The angle of the flute below the level, in degrees.
 * @param keys The direction of the keys. Up by default.
 * @returns The turn, in the axes of the chest.
 */
function fluteTurn(forward: number, down: number, keys: Vec3 = [0, 1, 0]): Quat {
  return toQuat(
    tubeAim(forward, down, keys).multiply(tubeAim(FLUTE_BIND.forward, FLUTE_BIND.down).invert()),
  );
}

/** The turn of the head of the flutist fox to the left while it plays, in degrees. */
const FOX_HEAD_TURN = 30;

/**
 * The turn of the right end of the flute of the flutist fox back from square to the face, in
 * degrees. Square to the face, the arms reach the right grip with 0.8 cm to spare, and two faces
 * of the front of the right shoulder fold in each play sample. The turns from 7° to 11° back, with
 * the flute 8° to 10° down, fold 0.7% of the play samples, and 5° or 12° back, or 12° down, fold
 * each sample, so the hold takes the middle.
 */
export const FOX_FLUTE_BACK = 9;

/**
 * The forward swing of the upper arm and the forward bend of the elbow of the free left arm of the
 * standing tan fox, in degrees (`FreePaw.hang`). The `HANG` angles of 20° and 60° point the
 * forearm 80° forward, almost level, with the paw in the air in front of the slim body. With
 * 20° and 20°, the arm hangs down along the side with a soft bend, as a flutist keeps the arms
 * loose and the elbows down (`docs/reference/wind-technique.md` 2.4). The upper arm swings 19° out
 * to clear the side of the body, and the forearm 16°.
 */
const FOX_HANG = [20, 20] as const;

/**
 * The out swing of the arms of the body that each shared hold fits, in degrees
 * (`WindHold.roundArms`, design 5.3): the larger `armOut()` of the two arms of its accepted player. The flute fits the
 * tan fox (20° and 23°), the clarinet the wolf (12° and 11°), and the trumpet the monkey (15° and
 * 16°), so a rounder body turns its elbows out, and these bodies keep the elbows of the hold.
 */
const ROUND_ARMS_FIT = { flute: 23, clarinet: 12, trumpet: 16 } as const;

/**
 * The mouth share of the body that the shared trumpet hold fits (`WindHold.farMouth`, design
 * 5.3): the share of the monkey (0.90), so a body with a mouth further in front of the shoulders
 * bows the head. The flute has no rule: with the bow, the wolf and the beaver flutists failed the
 * grip turn of the left paw, and the forearms of the heavy bodies stayed in the turned head. A
 * lift of the head made them deeper.
 */
const FAR_MOUTH_FIT = 0.9;

/**
 * The holds of the winds. In the rest pose, each instrument moves off the mouth, to the side and
 * a little forward, and tilts, so that the arms that hold it stay out of the body (design 5.3).
 */
export const WIND_HOLDS = {
  // The flute hold of each seated body (design 4.6, 5.3): the arm values of the accepted tan fox
  // flutist (FOX_FLUTE), as directions and in H, with the lip plate at the mouth and the rest from
  // the hanging arms (restArms). The head turns 30° to the left, the flute lies 9° back from square
  // to the face and slopes 8° down to the right, and the left paw holds it near the lip plate from
  // its front, with the right paw behind it and a little below (docs/reference/wind-technique.md
  // 2.4). Each paw keeps the side sign of the fox (aimSigns): with the sign from the geometry, the
  // right paw of 7 recast bodies turned 151° to 179° from the accepted grip. The shoulders turn 20°
  // forward in the play, as the shoulder blade of a real player slides forward: with square
  // shoulders, the upper arms of the recast wolf, beaver, and pig went 2.8 cm to 5.1 cm into the
  // body, and their paws missed their grips by 1.2 cm to 2.8 cm. The left grip moves 0.02 H across
  // the tube toward the left shoulder, 0.06 H nearer than the fox: with the grip of the fox, the
  // left paw of the recast beaver, dog, and pig turned 172° to 179° on its forearm. At rest, the
  // left paw hangs from the shoulder with a soft bend and the roll of its grip, and the right paw
  // holds the flute nearly upright at its side, at the hanging palm with the forearm 40° forward
  // from the upper arm, as a real flutist rests the flute vertically on the right leg.
  flute: {
    ...WOODWIND,
    roundArms: ROUND_ARMS_FIT.flute * MathUtils.DEG2RAD,
    reach: 20 * MathUtils.DEG2RAD,
    reachL: 20 * MathUtils.DEG2RAD,
    headTurn: FOX_HEAD_TURN * MathUtils.DEG2RAD,
    lipShift: [0, -0.05, 0],
    play: fluteTurn(FOX_HEAD_TURN - FOX_FLUTE_BACK, 8),
    poleL: [-1, -0.5, -0.3],
    poleR: [1, -1.4, -0.3],
    rest: holdTurn(0, -15, fluteTurn(0, 80, [0, 0, -1])),
    restArms: {
      L: { forward: FOX_HANG[0] * MathUtils.DEG2RAD, bend: FOX_HANG[1] * MathUtils.DEG2RAD },
      R: { forward: 20 * MathUtils.DEG2RAD, bend: 40 * MathUtils.DEG2RAD },
    },
    restFreeL: {
      lap: { along: 0.45, offset: [-0.5, -0.55, -0.12] },
      palm: [0.85, -0.37, 0.38],
      fingers: [0, -1, -0.3],
      arc: [0.57, 0.04, 0.31],
    },
    faceTube: ['palm', 'palm'],
    aimAcross: 1,
    aimSide: [0.5, -0.5],
    aimSigns: [-1, -1],
    gripShiftL: [-0.04, 0, -0.02],
    gripShiftR: [0, 0, -0.14],
    restGripShiftR: [-0.45, -0.13, -0.08],
    gripCurl: curls(115, 106),
    gripAround: true,
  },
  // The oboe turns the arms by `reach`: with no turn, the right palm is at 1.04 of 97% of the
  // reach. The left elbow points down. At rest, it points a little further out: with (-1, -1, -1),
  // the left upper arm of the mouse goes 0.027 H into the trunk at the start of the lift.
  oboe: {
    ...WOODWIND,
    reach: 20 * MathUtils.DEG2RAD,
    poleL: [-1, -1, -1],
    restPoleL: [-1.5, -1, -1],
    restPoleR: [0.5, -1, -0.5],
    rest: holdTurn(9, 27),
    restShift: [-0.13, 0, -0.02],
  },
  // The clarinet hold of each seated body (design 4.6, 5.3): the arm values of the accepted wolf
  // clarinetist (WOLF_CLARINET), as directions and in H, with the mouthpiece at the mouth and the
  // rest from the hanging arms (restArms). The clarinet hangs 30° from the vertical, in the middle
  // of the body, and each paw holds it from the side of its own shoulder, with the palm on the tube
  // and the side signs of the wolf (docs/reference/wind-technique.md 3). The shoulders turn
  // forward in the play, the right 35° and the left 20°. The mouthpiece stays at the mouth: with
  // the 0.4 H of the wolf back under its long muzzle, the forearms of the recast cat, panda, pig,
  // and polar bear went 7.6 cm to 12.5 cm into the body in the play. At rest, the left paw
  // hangs from the shoulder with the roll of its grip, and the right paw holds the clarinet upright
  // at its side, at the hanging palm with the forearm 80° forward from the upper arm, as a seated
  // clarinetist rests it with the right thumb on the thumb rest. With both paws on their grips at
  // the middle of the hanging palms, the arms of each recast body went 3 cm to 16 cm into the body
  // at rest.
  clarinet: {
    ...WOODWIND,
    roundArms: ROUND_ARMS_FIT.clarinet * MathUtils.DEG2RAD,
    reach: 35 * MathUtils.DEG2RAD,
    reachL: 20 * MathUtils.DEG2RAD,
    play: holdTurn(5, 0),
    rest: holdTurn(-25, 0),
    poleL: [-0.3, -1, 0],
    poleR: [0.3, -1, 0],
    restArms: {
      L: { forward: 20 * MathUtils.DEG2RAD, bend: 80 * MathUtils.DEG2RAD },
      R: { forward: 20 * MathUtils.DEG2RAD, bend: 80 * MathUtils.DEG2RAD },
    },
    restFreeL: {
      lap: { along: 0.45, offset: [-0.5, -0.55, -0.12] },
      palm: [0.85, -0.37, 0.38],
      fingers: [0, -1, -0.3],
      arc: [0.3, 0.04, 0.31],
    },
    faceTube: ['palm', 'palm'],
    aimAcross: 1,
    aimSide: [0.25, 0.25],
    aimSigns: [-1, 1],
    gripShiftL: [0.15, 0.14, -0.11],
    gripShiftR: [0.05, 0.19, -0.11],
    restAim: 1,
    gripCurl: curls(115, 115),
  },
  // While it plays, the bassoon turns its lower end 20° forward and 20° to the right, and the
  // right elbow points down. With no turn, the right forearm goes 0.21 H into the right thigh.
  bassoon: {
    ...WOODWIND,
    play: holdTurn(20, 20),
    poleR: [0.5, -1, -0.5],
    restPoleL: [-1, 0, 0],
    restPoleR: [0.5, -1, -0.5],
    rest: holdTurn(-16, -1, holdTurn(30, 26)),
    restShift: [-0.17, -0.04, -0.02],
  },
  // In the rest pose, the horn comes up out of the right thigh, so that the bell sits on it. The
  // right elbow points down, also while the horn plays. It points a little further out than
  // (0.5, -1, -0.5): with that elbow on the low seats, the right upper arm of the pig goes 0.031 H
  // into the trunk in play (limit 0.02 H).
  horn: {
    ...WOODWIND,
    poleR: [0.6, -1, -0.5],
    restPoleL: [-0.5, -1, -0.5],
    restPoleR: [0.5, -1, 0],
    rest: holdTurn(23, -7),
    restShift: [-0.16, 0.29, -0.1],
    fingering: 'valves-left',
    fundamental: BRASS_FUNDAMENTALS.horn,
  },
  // Both shoulder bones turn forward, as the right shoulder of the monkey (MONKEY_TRUMPET) and
  // as the shoulder blades of a real player slide forward. With square shoulders, the paws of most recast
  // bodies miss the valves, also with the smallest trumpet of the size rule of the winds. A body
  // with a far mouth bows the head, and the trumpet turns down with it (farMouth): with the head
  // up, the paws of 11 recast bodies missed the valves by 9 mm to 229 mm.
  // The right palm faces the valve tops, and the right paw points 0.4 of the way across them
  // (faceTube, aimSide), so that the finger tips come down onto the valve caps, as the monkey
  // holds them (docs/reference/wind-technique.md 2.1). With the roll of the shoulder, the right
  // paw of each recast body stood up behind the valves, with its palm to the mouthpiece and its
  // finger tips up, 53° to 70° from the palm of the monkey. The side aim moves the wrist off the
  // line from the shoulder to the grip, so the right shoulder turns 37° (34° for the left), and
  // the short arms still reach the valves: with 34°, the right paw of the dog missed its grip by
  // 1.4 mm, and with 45°, the right arm of the deer folded. With 0.8 of the monkey, the right paw
  // of the dog missed its grip by 24 mm.
  trumpet: {
    ...WOODWIND,
    reach: 37 * MathUtils.DEG2RAD,
    reachL: 34 * MathUtils.DEG2RAD,
    roundArms: ROUND_ARMS_FIT.trumpet * MathUtils.DEG2RAD,
    farMouth: FAR_MOUTH_FIT,
    poleL: [-0.5, -1, -1],
    poleR: [1, -1, -1],
    restPoleL: [-1, -1, -1],
    restPoleR: [1, -1, -1],
    rest: holdTurn(-3, -20, holdTurn(-50, 0)),
    restShift: [0.19, 0.03, -0.03],
    faceTube: ['none', 'palm'],
    aimSide: [0, 0.4],
    fingering: 'valves-right',
    fundamental: BRASS_FUNDAMENTALS.trumpet,
  },
  // The slide needs the right arm far forward. Even so, the arm reaches only the first part of
  // the slide travel (design 5.3). The elbows point down, near the torso.
  trombone: {
    ...WOODWIND,
    reach: 45 * MathUtils.DEG2RAD,
    poleL: [-0.5, -1, -1],
    poleR: [0.5, -1, -0.5],
    restPoleL: [-0.5, -1, 0],
    restPoleR: [1, -1, -1],
    rest: holdTurn(-14, -2, holdTurn(-45, 0)),
    restShift: [-0.14, 0.05, -0.28],
    fingering: 'slide',
    fundamental: BRASS_FUNDAMENTALS.trombone,
  },
  tuba: {
    ...WOODWIND,
    poleL: [-1, -1, -1],
    poleR: [1, -1, -1],
    restPoleL: [-1, 0, -0.3],
    restPoleR: [1, -1, -1],
    rest: holdTurn(1, -13, holdTurn(-10, 30)),
    restShift: [-0.01, 0.02, -0.03],
    fingering: 'valves-right',
    fundamental: BRASS_FUNDAMENTALS.tuba,
  },
} as const satisfies Readonly<Record<WindInstrument, WindHold>>;

/**
 * The flute hold of the tan fox (design 5.3), the hold of a real flutist. The head turns 30° to
 * the left while the fox plays, as Debost writes, and the flute lies 9° back from square to the
 * face, 8° down to the right ({@link FOX_FLUTE_BACK}). The lip plate sits 0.05 H below the mouth,
 * under the long muzzle: at the mouth, the jaw touches the flute. The shoulders stay square and
 * low, with no forward turn of the right shoulder. The left elbow points down and out, and the
 * right elbow down, out, and a little forward, as a seated flutist lets the arms hang
 * (`docs/reference/wind-technique.md` 2.4).
 *
 * Each palm faces the flute, and the fingers curl over it (`faceTube`, `gripCurl`), as a real
 * flutist curves the fingers over the keys (`docs/reference/wind-technique.md` 2.4). The left paw
 * holds the flute near the lip plate from its front and a little below, with the back of the paw to
 * the audience: its grip moves from the grip of the instrument, 2.5 cm below the axis, to the front
 * of the tube (`gripShiftL`), and the paw points half up across the flute (`aimSide`), so that its
 * fingers come over the top onto the keys. It also faces the flute in the play, although it leaves
 * its grip at rest. The right paw holds the body of the flute as the right hand of a flutist: its
 * middle lies behind the flute and a little below, its palm faces the flute, and it points up past
 * the back of the flute (`aimSide` below 0), so that the curled fingers come over the top onto the
 * keys, and the thumb side lies under the flute (`gripShiftR`). With the paw below the flute and
 * the side aim to the front, the flute lies in the palm as in a left hand, and the paw turns 180°
 * on its forearm in the lift and the lowering. With the right elbow out to the side, the paw swing
 * reaches 45°, and with the elbow a little back, the right upper arm goes 1.5 cm into the body in
 * the moves.
 *
 * In the rest pose, the flute stands nearly upright at the right side with the foot joint down on
 * the top of the right thigh, as a real flutist rests it vertically on the right leg with the right
 * hand on the right-hand keys (George, `docs/reference/wind-technique.md` 2.4). The closed right
 * paw holds it 0.45 H nearer to the lip plate than in the play, about 0.2 m below the lip plate on
 * the upper body of the flute, with its fingers on the tube (`restGripShiftR`, `restAim` 0). The
 * lift moves the right grip around the flute (`gripAround`): on a straight line, the grip crosses
 * the axis of the tube, and the paw turns 180° in one frame. With the roll of the play at rest, the
 * paw passes through the tube at the end of the lift and turns 175°. The elbows point down and out
 * at rest. The left paw leaves its grip ({@link WindHold.restFreeL}), and the left arm hangs down
 * along the side. A standing fox hangs it with a small bend of the elbow ({@link FOX_HANG}).
 *
 * The top of the left thigh is out of reach of the left arm: the nearest place of the palm on it is
 * 0.582 m from the shoulder joint, and the arm is 0.545 m. So the left arm hangs near the side with
 * a soft bend, as a seated flutist lets the free arm hang. The paw hangs out from the outer side of
 * the haunch, with the palm toward the body. The lap place takes the top of the belly over the
 * thigh at 0.45 of the way to the knee, and the paw hangs 0.5 H out, 0.55 H down, and 0.12 H
 * forward from it. At 0.45 H out, the left upper arm goes 1.8 cm into the side of the body (limit
 * 1.5 cm). With the paw nearer to the haunch or the elbow more bent, the inner elbow goes further
 * into the side of the trunk.
 */
const FOX_FLUTE = {
  ...WOODWIND,
  headTurn: FOX_HEAD_TURN * MathUtils.DEG2RAD,
  lipShift: [0, -0.05, 0],
  play: fluteTurn(FOX_HEAD_TURN - FOX_FLUTE_BACK, 8),
  poleL: [-1, -1, -0.3],
  poleR: [1, -1.4, -0.3],
  rest: holdTurn(0, -15, fluteTurn(0, 80, [0, 0, -1])),
  restShift: [0.8, -0.958, 0.5],
  restPoleL: [-0.4, -1, 0.38],
  restPoleR: [0.8, -1, 0.6],
  restFreeL: {
    lap: { along: 0.45, offset: [-0.5, -0.55, -0.12] },
    palm: [0.85, -0.37, 0.38],
    fingers: [0, -1, -0.3],
    arc: [0.57, 0.04, 0.31],
    hang: {
      forward: FOX_HANG[0] * MathUtils.DEG2RAD,
      bend: FOX_HANG[1] * MathUtils.DEG2RAD,
    },
  },
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.5, -0.5],
  gripShiftL: [-0.04, 0, 0.04],
  gripShiftR: [0, 0, -0.14],
  restGripShiftR: [-0.45, -0.13, -0.08],
  gripCurl: curls(115, 106),
  gripAround: true,
} as const satisfies WindHold;

/**
 * The turns of the trombone hold of the panda while it plays, in degrees (design 5.3). The slide
 * points 10° below the level and 45° to the right, forward and a little down, as the pandas of
 * `orchestra-latest.png` hold it and as a trombonist points it toward the audience
 * (`docs/reference/wind-technique.md` 1.1). The right arm reaches 0.120 m of the slide travel
 * (`pnpm hold-reach panda --instrument trombone`). On the body of the older mesh, with the right
 * grip near the mouthpiece side of the brace, it reached 0.17 m: straight ahead and 10° below the
 * level, the travel was 0.5 cm, 30° to the right 10 cm, 60° 26 cm, and 90° 45.5 cm, with the slide
 * further to the side. A turn of 40° to the right, or a slide 5° below the level, reached 0.055 m
 * or 0.080 m.
 */
const PANDA_PLAY = {
  /** The turn of the slide to the right of the panda, around the mouthpiece. */
  right: 45,
  /**
   * The turn of the slide down around the mouthpiece, after the turn right. The value below 0
   * turns it up from the 15° below the level of the bind pose.
   */
  down: -5,
  /** The forward turn of the left shoulder. */
  shoulderL: 35,
  /**
   * The turn of the slide down from the bind turn in the rest pose, around the chest x axis, so
   * that the trombone stands upright in front of the body, with the slide 16° from the vertical.
   */
  restDown: 59,
} as const;

/** The turn of the trombone of the panda while it plays ({@link PANDA_PLAY}). */
const PANDA_PLAY_TURN = toQuat(
  new Quaternion()
    .setFromAxisAngle(Y_AXIS, -PANDA_PLAY.right * MathUtils.DEG2RAD)
    .multiply(new Quaternion().setFromAxisAngle(X_AXIS, -PANDA_PLAY.down * MathUtils.DEG2RAD)),
);

/**
 * The trombone hold of the panda (design 5.3), the hold of a real trombonist: the left paw holds
 * the trombone at its grip near the mouthpiece, and the right paw moves the slide. The big round
 * head puts the mouth of the panda 0.40 m in front of its shoulder joints, so with the slide of
 * {@link WIND_HOLDS} straight ahead and 15° down, the grip of the first position is 0.588 m from
 * the right shoulder joint, beyond the reach of the arm, and the slide reach is 0. While the panda
 * plays, the slide turns 45° to its right around the mouthpiece, toward the right shoulder, and
 * stays 10° below the level ({@link PANDA_PLAY}), so that the right arm reaches a part of the
 * travel. A real trombonist points the slide toward the audience, and never down to the floor
 * (`docs/reference/wind-technique.md` 1.1). For the same reach, a slide nearer to the level must
 * turn further to the right: the angle from the front stays about 45°.
 *
 * The left palm faces the inner slide tubes near the mouthpiece brace, and the right palm the
 * upright slide brace (`faceTube`, `InstrumentGrips.tubeL` of `models/instruments/brass.ts`), as
 * the left hand of a real trombonist wraps the slide tubes and the tips of the right thumb and the
 * first two fingers hold the brace (`docs/reference/wind-technique.md` 1.1). The left grip moves
 * 0.07 H toward its tubes, because the middle of the big paw is a few cm from them on the grip of
 * the instrument, and 0.04 H along the tubes toward the mouthpiece, so that the left elbow bends
 * more. Its fingers curl 90°. With 0.07 H toward the mouthpiece, the left forearm of the T-pose
 * body goes 1.1 cm into the chin in the play, the lift, and the lowering (`pnpm pose-depth
 * trombonist`). With 0.09 H toward the tubes, the left palm turns 55° from the tubes, and the left
 * paw does not grasp them at rest (`pnpm wind-grip trombonist`). The right paw holds the low part
 * of the brace from the right side of the panda, with its palm to the left and its thumb up the
 * brace, as a real trombonist puts the thumb on the top of the brace and the fingers below it, with
 * the wrist "sideways in relation to the face" (`docs/reference/wind-technique.md` 1.1). Its grip
 * moves 0.1 H down the brace and 0.03 H along the slide away from the mouthpiece (`gripShiftR`):
 * the slide points 45° to the right, so the right side of the panda is the far right side of the
 * brace. The paw points 0.8 of the way along the slide (`aimSide`), and the fingers curl 110°
 * around the brace. With the grip 0.08 H along the slide, the middle of the paw lies 5 cm from the
 * brace, and the paw does not grasp it. On the body of the older mesh, with the grip 0.08 H back
 * toward the mouthpiece, the right palm faced the audience and the right thumb pointed down the
 * brace. Both paws keep the aim and the roll of the play at rest (`restAim`): with the roll of the
 * shoulder, the right wrist turns 5,500° to 9,800° each second in the lowering.
 *
 * The elbows stay away from the sides of the body, as a brass player keeps space between the elbows
 * and the sides (`docs/reference/wind-technique.md` 1.8). The arms of the body are round tubes free
 * of the trunk, about 12 cm from the bone to the inner side, so the elbows of the joined arm, down
 * near the trunk, put the inner side of each upper arm 6 cm to 8 cm into the trunk. The left elbow
 * turns 22° out about the line from the shoulder joint to the grip, from the elbows down and
 * forward of {@link WIND_HOLDS}, and the right elbow points 0.8 out for each 1 down (`poleR`). The
 * smaller head (`headFactor` of the rig) puts the mouthpiece and the grips 3 cm further back, so
 * the right elbow bends more. With the right elbow 0.6 out for each 1 down, two faces of the inner
 * right elbow fold in 69% and 37% of the play samples, and the arm gate fails. A turn of the elbow
 * turns the frame of the forearm, and the grip turn of the arm gate counts from that frame: the
 * left elbow 48° out turns the left grip 41°, and the right elbow 31° out turns the right grip 28°.
 * The left grip near the mouthpiece bends the left elbow, so that each degree of the turn moves the
 * upper arm further from the trunk. The right grip 0.05 H higher on the brace lifts the right upper
 * arm off the belly, and costs 1 cm of the slide reach.
 *
 * The middle of the right paw lies at the far side of the brace, so the right arm reaches 0.155 m
 * of the slide travel of 0.55 m (`pnpm hold-reach panda --instrument trombone`). A real seventh
 * position is 0.57 m from the first position (`docs/reference/wind-technique.md` 1.2), so the slide
 * positions map into the reached travel. On the body of the older mesh, a forward turn of the right
 * shoulder of 55° reached 0.125 m, and flattened the right upper arm to 0.60 (limit 0.55). A
 * forward turn of the right shoulder at the sixth and the seventh positions, as a real player moves
 * the shoulder there, reached 0.195 m on the grip at the mouthpiece side of the brace, but bent the
 * right wrist 74° to 76° to the side.
 *
 * The left shoulder turns 35° forward, as the shoulder blade of a real player slides forward when
 * the arm reaches forward, so that the left arm root moves off the front of the chest. With 42°,
 * the left forearm goes 0.4 cm into the slide tubes in the lift and the lowering (0.2 cm with 35°).
 * On the body of the older mesh, with a square left shoulder, the left upper arm turned 68° from
 * its bind direction to the grip, and faces at the front of the left shoulder folded in each
 * sample. A turn of 45° or more folded 5 faces of the left shoulder in the play.
 *
 * In the rest pose, the trombone stands upright in front of the body, below the mouth, with the
 * slide down and 16° forward of the vertical (`rest`, {@link PANDA_PLAY}), as a seated player holds
 * the slide vertical in front of the knee (`docs/reference/wind-technique.md` 1.7). It moves 0.36 H
 * forward and 0.105 H down from the mouthpiece of the bind (`restShift`), so that the arms rest as
 * before the smaller head moved the mouthpiece back. With 0.3 H forward, two faces of the inner
 * right elbow fold at rest. With 0.12 H down, the paws go 0.4 cm into the trombone at rest (0.2 cm
 * with 0.105 H), and with 0.09 H down, the left paw leaves its tubes in one more sample of the lift
 * (`pnpm wind-grip trombonist`). Both paws keep the aim and the roll of the play on the instrument
 * (`restAim`), so that the lift and the lowering turn each hand with the trombone, and the right
 * paw does not turn past 180° on its forearm (move twist at most 93°). With a rest grip of its own
 * on the top of the brace, the right hand turned about 180° from the rest to the play, and each mix
 * of the move flipped the right paw. The left paw slides 0.115 H down its tubes at rest, 0.03 H
 * less far toward their axis than in the play, and 0.01 H toward the left shoulder
 * (`restGripShiftL`), because at the grip of the play its finger tips do not reach the tubes. The
 * narrower upper chest of the rig (`girthProfile`) moves the left shoulder joint 0.8 cm in: with
 * 0.11 H down and 0.06 H toward the axis, the left finger tips then stood 1.5 cm off the tubes at
 * rest, and with 0.04 H toward the axis and 0.02 H toward the shoulder, the left upper arm was
 * flat at rest (arm gate flat 0.81, base 0.87). In the middle of the lift and the lowering, the
 * left finger tips leave the tubes for 0.1 s to 0.5 s.
 * The elbows point out and down at rest (`restPoleL`, `restPoleR`). With the trombone 0.28 H lower
 * and the elbows further down, the right upper arm went 5.7 cm into the belly, and with the left
 * elbow less far out, the left forearm went 0.4 cm into the slide tubes in the lowering. A real
 * player never rests the trombone on the slide, and the slide end and the bell stay off the floor
 * (`docs/reference/wind-technique.md` 1.7).
 */
const PANDA_TROMBONE = {
  ...WIND_HOLDS.trombone,
  reachL: PANDA_PLAY.shoulderL * MathUtils.DEG2RAD,
  play: PANDA_PLAY_TURN,
  rest: holdTurn(-PANDA_PLAY.restDown, 0),
  restShift: [0, -0.105, -0.36],
  poleL: [-0.6, -0.4, -0.7],
  poleR: [0.8, -1, -0.25],
  restPoleL: [-1.4, -1, -0.3],
  restPoleR: [1, -1, 0],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.8, 0.8],
  gripShiftL: [-0.04, 0.07, 0],
  gripShiftR: [0.1, 0, 0.03],
  restGripShiftL: [0.075, 0.04, -0.01],
  restAim: 1,
  gripCurl: curls(90, 110),
} as const satisfies WindHold;

/**
 * The turn of the lower end of the oboe of the mouse forward while it plays, in degrees, from the
 * 30° of {@link WIND_HOLDS}. The value below 0 turns the lower end back toward the body.
 */
const MOUSE_OBOE_FORWARD = 10;

/**
 * The oboe hold of the mouse (design 5.3), the hold of a real oboist
 * (`docs/reference/wind-technique.md` 2.3). The long muzzle puts the tip of the nose far in front
 * of the mouth, so the reed sits 0.23 H further back and 0.04 H lower than the mouth of the bind
 * pose, in the mouth under the nose, with about half of the reed in the mouth. The oboe hangs 40°
 * from the vertical, 10° further forward than in {@link WIND_HOLDS} ({@link MOUSE_OBOE_FORWARD}),
 * as a real oboist holds it about 40° from the body. The small mouse plays a smaller oboe
 * (`SpeciesParams.oboeScale`), so that the grips stay near the chest and the elbows bend near the
 * body: 0.45 of the oboe of the app, with the arms 1.25 times the arms of the mesh. On an oboe of
 * 0.62, the arms reach forward straight at 35° and 40°, and the oboe hangs 15° from the vertical.
 * As on a real oboe, the left paw holds the upper joint near the reed, and the right paw holds the
 * lower joint above the bell, with a clear gap between the paws: the left grip moves 0.05 H down
 * the tube and the right grip 0.15 H down (`gripShiftL`, `gripShiftR`). With the left grip 0.3 H
 * down, both paws lie together on the lower half. Each grip also moves 0.06 H toward the axis and
 * 0.05 H across it toward the shoulder of its paw, so that each paw holds the tube from its own
 * side. Each paw aims across the tube (`aimAcross`) with no side aim (`aimSide`), each palm faces
 * the tube (`faceTube`), and the fingers curl 100° (left) and 110° (right) over its front
 * (`gripCurl`). The thumbs then point up the oboe to the reed, as an oboist curves the fingers over
 * the keys with the thumb behind the tube (`docs/reference/wind-technique.md` 2.3). Both paws grasp
 * the oboe in each sample (`pnpm wind-grip oboist`). With the grips behind the tube and a side aim
 * of half, each paw lies behind the tube with its palm to the audience and its thumb down the oboe.
 * With the left grip on the axis (0.04 H toward it), the roll to the tube has no direction, and the
 * paw turns over. With 60° on the right, the right arm folds 9 faces at rest (limit 8).
 *
 * In the rest, the oboe stands upright in front of the belly, 0.25 H below the mouth, as a real
 * oboist holds it vertical in a short rest. Both paws stay on their grips of the play, the left paw
 * on the upper joint and the right paw on the lower joint, with a gap of 5.7 cm between them, so
 * that the lift and the lowering move the oboe with the paws, and no paw slides along the tube.
 * With the grips of the play, the oboe 0.45 H below the mouth puts an arm 1.3 cm to 1.9 cm into
 * the body. Both paws keep the aim and the roll of the play (`restAim`): with the roll of the
 * shoulder, the left paw turns 177° on its forearm at rest and flips in the lowering. The left
 * elbow points out, down, and forward, and the right elbow out, down, and a little back
 * (`restPoleL`, `restPoleR`), so that the left paw turns 134° on its forearm at rest and the right
 * paw 121°. With the left elbow further down or forward, the left palm turns more than 60° from
 * the tube, and the paw does not grasp it (`pnpm wind-grip oboist`). With the right elbow further
 * down, the right upper arm goes 0.8 cm into the body (0.6 cm with this elbow).
 *
 * The big head puts the mouth about 0.13 m above the shoulder joints, so the grips are near the
 * height of the shoulders. While the mouse plays, the right elbow points down, out, and forward,
 * as an oboist drops the wrists and keeps the arms a little away from the sides. With the elbow of
 * the right arm of {@link WIND_HOLDS} out and level, the right upper arm turns 83° from its bind
 * direction and the paw 160° from the forearm, and the upper arms show as flat twisted bands.
 * The left elbow points down and a little out (`poleL`), as a real oboist lets the arms hang
 * loosely from low shoulders with the elbows a little free from the body
 * (`docs/reference/wind-technique.md` 2.3): the left upper arm hangs about 33° below the level,
 * and the left paw keeps its grip on the upper joint. With the elbow out and a little down, as at
 * rest, the left upper arm stands 3.5° below the level, and from ±35° and from the back the left
 * arm looks like a raised wing. The shoulder turns are those of {@link WIND_HOLDS}.
 */
const MOUSE_OBOE = {
  ...WIND_HOLDS.oboe,
  lipShift: [0, -0.04, 0.23],
  rest: holdTurn(-30, 0),
  restShift: [0.1, -0.25, -0.05],
  restPoleL: [-1, -0.75, -1],
  restPoleR: [1.5, -0.75, 0.25],
  play: holdTurn(MOUSE_OBOE_FORWARD, 0),
  poleL: [-0.5, -1, 0],
  poleR: [0.5, -1, -0.5],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0, 0],
  gripShiftL: [0.05, 0.06, -0.05],
  gripShiftR: [0.15, 0.06, -0.05],
  restAim: 1,
  gripCurl: curls(100, 110),
} as const satisfies WindHold;

/** The forward turns of the shoulder bones of the bassoon beaver while it plays, in degrees. */
const BEAVER_SHOULDER_TURN = {
  /**
   * The left shoulder. With 15°, the left upper arm turns 84° from its bind direction, and the
   * faces at the front of the left shoulder fold in each play sample.
   */
  left: 20,
  /**
   * The right shoulder. With 15°, the round free right upper arm goes 1.1 cm into the belly in
   * the play, against 0.5 cm with 20°.
   */
  right: 20,
} as const;

/**
 * The turn of the bassoon of the beaver, relative to the chest: the lower end 10° forward and 5°
 * to the left from the bind pose of `woodwindRotation()` of `models/instruments/woodwinds.ts`,
 * which leans the tube 35° to the left. The tube lies 30° from the vertical, and its top 1° back.
 */
const BEAVER_PLAY = holdTurn(10, -5);

/**
 * The turn of the bassoon of the beaver at rest, relative to the chest: the bind pose of
 * `woodwindRotation()`, the lower end 10° back toward the body and 5° to the right of
 * {@link BEAVER_PLAY}.
 */
const BEAVER_REST = holdTurn(0, 0);

/**
 * The bassoon hold of the beaver (design 5.3), the hold of a real bassoonist
 * (`docs/reference/wind-technique.md` 3): the bassoon lies diagonal
 * in front of the body, the left paw above the right paw, and the bocal brings the reed to the
 * mouth at a nearly level angle. The bassoon crosses the body from the right hip up past the left
 * shoulder, 30° from the vertical in the front view, with the bell above the head
 * ({@link BEAVER_PLAY}). With the play turn of {@link WIND_HOLDS}, it lies 54° from the vertical,
 * near level from the side, with its top at the shoulder. At rest,
 * the bassoon moves 0.15 H forward and 0.05 H lower, off the mouth, and takes its bind turn
 * ({@link BEAVER_REST}), so that the boot joint comes back toward the right thigh and both paws
 * keep their grips. A real bassoonist carries the boot at the right thigh with the boot joint in
 * the right palm, and no source gives the rest (`docs/reference/wind-technique.md` 3). With the
 * diagonal of the play 0.2 H forward, the right grip is 5.2 cm out of the reach of the right arm,
 * and the right paw stands about 10 cm from the boot joint. With the rest 0.2 H lower, the right
 * upper arm goes 2.7 cm into the body. The left paw holds the wing joint high, and the right grip
 * moves 0.15 H up the boot joint (`gripShiftR`): at its grip of the instrument, the right paw
 * misses by 1.4 cm.
 * Each grip moves toward the axis and to the side of its own shoulder, the left grip 0.1 H toward
 * the axis and 0.1 H across it toward the left shoulder, and the right grip 0.2 H toward the axis
 * and 0.14 H across it toward the right shoulder. Each palm then faces the tube from its own side
 * (`faceTube`), each paw aims a quarter toward the side across the tube (`aimSide`), the fingers
 * curl 100° over its front
 * (`gripCurl`), and the thumbs point up the bassoon, so that both paws grasp it
 * (`pnpm wind-grip bassoonist`). With the grips behind the tube and a side aim of half, each paw
 * lies behind the tube with its palm to the audience and its thumb down the bassoon.
 *
 * The long muzzle and the front teeth put the tip of the nose far in front of the mouth, so the
 * reed sits 0.33 H lower and 0.25 H further back than the mouth of the bind pose, under the front
 * teeth. The beaver keeps its arms, so it plays a smaller bassoon
 * (`SpeciesParams.bassoonScale`), and each shoulder bone turns forward
 * ({@link BEAVER_SHOULDER_TURN}), as the shoulder blade of a real player slides forward when the
 * arm reaches forward: with square shoulders, the right paw reaches its grip with 3 cm to spare
 * only on a bassoon of 0.75. The arms are round tubes free of the trunk, as a real bassoonist
 * keeps the elbows a little away from the body. So each elbow points further out than the elbow
 * of the old arm that the mesh joined to the trunk: the left elbow out, down, and a little back,
 * and the right elbow out, down, and forward. At rest, the right elbow points higher, and the left
 * elbow does not point back. With the old elbows, the left upper arm went 2.8 cm and the right
 * upper arm 2.5 cm into the belly. With the left elbow further out, the left paw swings more than
 * 70° on its forearm in the play. With the right elbow higher in the play, the right paw turns
 * more than 25° from its accepted grip.
 *
 * The right fingers curl 120° around the boot joint, against 100° on the left: with 100°, the
 * right claws go 1.8 cm into the bassoon, against 1.0 cm with 120°.
 */
const BEAVER_BASSOON = {
  ...WIND_HOLDS.bassoon,
  reach: BEAVER_SHOULDER_TURN.right * MathUtils.DEG2RAD,
  reachL: BEAVER_SHOULDER_TURN.left * MathUtils.DEG2RAD,
  lipShift: [0, -0.33, 0.25],
  play: BEAVER_PLAY,
  rest: BEAVER_REST,
  restShift: [0, -0.05, -0.15],
  poleL: [-0.75, -1, 0.1],
  poleR: [1, -1, -0.5],
  restPoleL: [-0.75, -1, 0],
  restPoleR: [1, -0.5, -0.5],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.25, 0.25],
  gripShiftL: [0, 0.1, -0.1],
  gripShiftR: [0.15, 0.2, -0.14],
  restAim: 1,
  gripCurl: curls(100, 120),
} as const satisfies WindHold;

/** The turns of the horn of the pig around the mouthpiece, relative to the chest (design 5.3). */
interface HornTurns {
  /** The turn of the right side, with the bell, forward around the vertical, in degrees. */
  readonly right: number;
  /** The turn of the lower end back toward the body, after `right`, in degrees. */
  readonly back: number;
  /** The turn of the lower end to the left, after `back`, in degrees. */
  readonly left: number;
}

/** The turns of the horn of the pig in the playing pose and in the rest pose. */
const PIG_TURNS = {
  /** The playing pose: the bell at the right of the torso and in front of it. */
  play: { right: 20, back: 40, left: 0 },
  /** The rest pose: the horn lower and further forward, on the belly over the lap. */
  rest: { right: 20, back: 40, left: 15 },
} as const satisfies Readonly<Record<'play' | 'rest', HornTurns>>;

/**
 * Gives the rotation of the `instrument` bone of the horn of the pig from its turns.
 *
 * @param turns The turns of {@link PIG_TURNS}.
 * @returns The rotation, relative to the chest.
 */
function pigTurn(turns: HornTurns): Quat {
  return toQuat(
    new Quaternion()
      .setFromAxisAngle(Y_AXIS, turns.right * MathUtils.DEG2RAD)
      .multiply(new Quaternion(...holdTurn(-turns.back, -turns.left))),
  );
}

/**
 * The horn hold of the pig (design 5.3), the hold of a real hornist
 * (`docs/reference/wind-technique.md` 2.2): the left paw on the valves at
 * the middle of the body, the right paw in the bell, and the horn across the body from the mouth to
 * the bell at the right of the torso and in front of it. The long snout puts the mouthpiece
 * 0.29 m in front of the shoulder joints, so with the hold of {@link WIND_HOLDS} the left grip
 * is 0.507 m from the left shoulder joint, beyond the arm of 0.385 m. The horn turns its lower end
 * 40° back toward the body and its right side 20° forward ({@link PIG_TURNS}). The left shoulder
 * turns 36° forward, as the shoulder blade of a real player slides forward. The left paw then has
 * 10.6 cm to spare, and the right paw 7.4 cm (`pnpm hold-reach pig --instrument horn`).
 *
 * The left elbow points out and a little forward, and the right elbow out and down. The arms of
 * the body are round tubes free of the trunk, so the left elbow stays away from the side, as a horn
 * player keeps both arms away from the rib cage (`docs/reference/wind-technique.md` 2.2). The left
 * elbow turns out about the line from the shoulder joint to the valves, from (-1, -0.5, -1) to
 * (-1, 0.05, -0.5), and the left shoulder turns 36° forward in place of 26°: with the old elbow,
 * the left forearm went 2.7 cm and the left upper arm 2.7 cm into the belly. The rest elbow points
 * a little higher, (-1, 0.2, -0.7), because the left upper arm then lies on the side of the chest
 * (1.9 cm into it with the elbow of the play). The grip turn of the arm gate counts from the posed
 * forearm, and the two turns move it in opposite directions: the shoulder alone at 40° turns the
 * left grip 19°, the elbow alone 21°, and both 5°. On the rig with the raise shapes of the old
 * hold, a forward turn of the shoulder of 40° or more folds 7 to 9 faces of the left arm, so the
 * shoulder turns 36°. The left paw holds the valves at the grip of the horn, and the left forearm
 * then goes 1.3 cm into the belly near the wrist. A move of the left grip of 0.03 H toward the
 * mouthpiece and 0.03 H away from the left shoulder keeps the forearm off the belly, but puts the
 * left palm 1.7 cm off the valves.
 *
 * At rest, the horn comes down 0.2 H and 0.2 H forward onto the round belly, which covers the short
 * thighs, with the bell at the right of the belly beside the right haunch. A lower rest puts the
 * right forearm 2.3 cm to 5.4 cm into the belly. At rest, the left grip moves 0.015 H toward the
 * mouthpiece and 0.015 H away from the left shoulder (`restGripShiftL`), so that the left wrist
 * goes at most 0.3 cm in place of 0.9 cm into the horn. The right elbow points out, down, and
 * forward (`restPoleR`), so that the round right forearm lies 0.4 cm in place of 0.6 cm in the
 * rim of the bell, with the bind supination of the right paw that this elbow gives.
 */
const PIG_HORN = {
  ...WIND_HOLDS.horn,
  reachL: 36 * MathUtils.DEG2RAD,
  play: pigTurn(PIG_TURNS.play),
  poleL: [-1, 0.05, -0.5],
  poleR: [1, -1, 0],
  rest: pigTurn(PIG_TURNS.rest),
  restShift: [0.05, -0.2, -0.2],
  restPoleL: [-1, 0.2, -0.7],
  restPoleR: [1, -0.5, -0.6],
  restGripShiftL: [-0.015, 0, 0.015],
} as const satisfies WindHold;

/**
 * The turn of the lower end of the clarinet of the wolf forward while it plays, in degrees, from
 * the 25° of {@link WIND_HOLDS}. The value below 0 turns the lower end back toward the body.
 */
const WOLF_CLARINET_FORWARD = 5;

/**
 * The clarinet hold of the wolf (design 5.3), the hold of a real clarinetist
 * (`docs/reference/wind-technique.md` 3): the clarinet at the middle of
 * the body, from the mouth to between the knees. The clarinet turns its lower end
 * {@link WOLF_CLARINET_FORWARD}° forward from {@link WIND_HOLDS}, to 30° from the vertical, the
 * angle of the wolf in `orchestra-latest.png` and `orchestra-side.png`: a render of the app from
 * the camera of the images shows the clarinet at 30° as 25° in the image, and the images show it
 * at 24° and 28°. A real clarinetist holds it at about 45°, and the long muzzle already puts the
 * mouthpiece far in front of the chest: at 45°, the bell is
 * far in front of the knees. With the mouthpiece 0.18 H below the mouth, the mouthpiece does not
 * go into the jaw. Each paw aims across the tube (`aimAcross`) and a quarter toward the side
 * across it (`aimSide`), and its grip moves around the tube (`gripShiftL`, `gripShiftR`). Each
 * palm faces the tube (`faceTube`), and the fingers curl 115° over its front (`gripCurl`), as a
 * clarinetist curves the fingers over the tube with the thumb behind it. Each grip moves toward
 * the axis and to the side of its own shoulder, so that each paw holds the tube from its own side,
 * the palm faces the tube, and the thumb points up the clarinet to the mouthpiece. The left grip
 * moves 0.14 H toward the axis and 0.11 H across it toward the left shoulder, and the right grip
 * 0.19 H toward the axis and 0.11 H across it toward the right shoulder. With the grips behind the
 * tube and a side aim of half, each paw lies behind the tube with its palm to the audience and its
 * thumb down the clarinet. The left grip moves 0.15 H down the tube, because 8.5 cm above the
 * shoulder joint, the forearm rises steeply and the retarget turns the paw up along the tube
 * (`PAW_TURN` of `models/studio-rig.ts`). On the grips of the instrument, 2.5 cm in front of the
 * tube, the paws lie in front of it and point away from it, with the finger tips 7.6 cm and 8.3 cm
 * from the tube.
 *
 * The long muzzle puts the tip of the nose far in front of the mouth, so the mouthpiece sits 0.4 H
 * further back than the mouth of the bind pose, in the mouth under the muzzle, and each shoulder
 * bone turns forward, the right 35° and the left 20°. At 45°, the grips move further forward, out
 * of the reach of the arms. The paws reach their grips with 6.3 cm (left) and 0.9 cm (right) to
 * spare, and the mouthpiece goes 1.2 cm into the head.
 *
 * Both elbows point down and a little out, as a seated clarinetist lets the arms hang near the
 * body, in the play. Of 4 elbow directions, this one gives the smallest paw turns on the forearms:
 * with the elbows of {@link WIND_HOLDS}, the right paw turns 141° and the left paw 123°, and with
 * these elbows 71° and 89°.
 *
 * At rest, the clarinet stands upright, in front of the belly between the knees, with the bell at
 * the height of the knee tops, 4 cm to the right of the middle and 22 cm in front of the seat. Both
 * paws stay on their grips of the play, as a seated clarinetist holds the clarinet upright with the
 * hands on the keys (`docs/reference/wind-technique.md` 3). Thus the lift and the lowering move the
 * clarinet with the paws, and no paw slides along the tube. The paws keep the aim and the roll of
 * the play (`restAim`), so that the fingers close around the tube at rest too. The bell rests on
 * nothing: the round belly reaches the seat front 9 cm to 12 cm above the seat, so an upright
 * clarinet has no room on the seat, and on the top of the right knee, the left forearm goes 7 cm to
 * 12 cm into the belly with each left elbow. Nearer to the belly, the left forearm goes 1.8 cm to
 * 3.6 cm into it.
 *
 * At rest, the left elbow points out and down, and the right elbow points down, a little out, and a
 * little forward. With the right elbow down and a little out, the right forearm goes 1.7 cm into
 * the belly in the lift on the rig with the bind elbow forward.
 */
const WOLF_CLARINET = {
  ...WIND_HOLDS.clarinet,
  roundArms: null,
  restArms: null,
  restFreeL: null,
  aimSigns: null,
  reach: 35 * MathUtils.DEG2RAD,
  reachL: 20 * MathUtils.DEG2RAD,
  lipShift: [0, -0.18, 0.4],
  play: holdTurn(WOLF_CLARINET_FORWARD, 0),
  rest: holdTurn(-25, 0),
  restShift: [0.11, -0.56, -0.086],
  poleL: [-0.3, -1, 0],
  poleR: [0.3, -1, 0],
  restPoleL: [-1.5, -1.4, 0],
  restPoleR: [0.5, -1, -0.1],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.25, 0.25],
  gripShiftL: [0.15, 0.14, -0.11],
  gripShiftR: [0.05, 0.19, -0.11],
  restAim: 1,
  gripCurl: curls(115, 115),
} as const satisfies WindHold;

/**
 * The trumpet hold of the monkey (design 5.3), the hold of a real trumpet player
 * (`docs/reference/wind-technique.md` 2.1): the left paw wraps the valve casings and holds the
 * weight, the right fingers arch down onto the valves, and the trumpet points forward, angled
 * slightly down. The arms are 1.2 times the arms of the mesh, so the monkey plays a trumpet of
 * 0.65 (`SpeciesParams.trumpetScale`), and the right shoulder bone turns 34° forward (`reach`), as
 * the shoulder blade of a real player slides forward. The left shoulder stays square (`reachL`).
 * With square shoulders, the right paw misses the valves by 3.4 cm.
 *
 * While the monkey plays, the bell turns 10° further down, to 15° below the level, as a real
 * player angles the trumpet "slightly down". With the bell 5° below the level, the paws cover the
 * mouth in the front view, and 20° below the level is more than slightly down.
 *
 * The left palm faces the upright casings from the left, below the middle of their height
 * (`InstrumentGrips.tubeL` of `models/instruments/brass.ts`), the left paw points up along its
 * forearm with the thumb up and back toward the first valve slide, and its fingers curl 130°
 * around the thin casings of the smaller trumpet (`gripCurl`): with 109°, the finger tips stand
 * 1.1 cm off. The right palm lies above the valves at their right and faces
 * down, and the right paw points to the left across the valve tops: 0.8 of its aim is the side
 * direction across the valves (`aimSide`), and its fingers curl 92° down onto the valves. The left
 * paw takes no side aim: the retarget turns the paw back to its forearm in the plane of its palm
 * (`PAW_TURN` of `models/studio-rig.ts`), and with the side aim of the right paw, the left paw
 * leaves its grip by 4.2 cm. Both paws keep the hold of the play at rest (`restAim`), so that the
 * right fingers stay on the valves: with the roll of the shoulder at rest, the right finger tips
 * stand 3.3 cm off. At rest, the left grip moves 0.04 H along the casings toward the bell
 * (`restGripShiftL`), so that the left finger tips stay on the casings of the upright trumpet: on
 * the grip of the play, they stand 1.1 cm off.
 *
 * The big head puts the mouthpiece 0.23 m above the shoulder joints, so the grips are 0.17 m to
 * 0.18 m above the shoulders at the size 1.1, and the forearms rise steeply. Both elbows point
 * down and out, as a real player lets the elbows hang. With the elbows out and level, the forearms
 * are flatter, but the right upper arm goes flat (0.51, limit 0.55) and the right wrist bends 71°
 * (limit 70°).
 */
const MONKEY_TRUMPET = {
  ...WIND_HOLDS.trumpet,
  roundArms: null,
  farMouth: null,
  reach: 34 * MathUtils.DEG2RAD,
  reachL: 0,
  play: holdTurn(-10, 0),
  poleL: [-1, -1, 0],
  poleR: [1, -1, 0],
  faceTube: ['palm', 'palm'],
  aimSide: [0, 0.8],
  restGripShiftL: [0, 0, 0.04],
  restAim: 1,
  gripCurl: curls(130, 92),
} as const satisfies WindHold;

/**
 * The tuba hold of the rhino (design 5.3), the hold of a real tubist who stands with the tuba on a
 * strap (`docs/reference/wind-technique.md` 3): the tuba stands against the body, the bell at the
 * left of the head, the left paw on the main branch, and the right paw on the valves. The long
 * muzzle puts the mouthpiece 0.51 m in front of the shoulder joints, so the lead pipe of the tuba
 * is longer (`SpeciesParams.tubaPipe`), the right shoulder turns 45° forward, and the left
 * shoulder 40°, as the shoulder blades of a real player slide forward. The lower end of the tuba
 * turns 25° to the right, so that the bell stands at the left of the horn on the muzzle. The
 * elbows point down and out, a little more down than out (`poleL`, `poleR`, `restPoleL`,
 * `restPoleR`), as the arms of a real player stay away from the rib cage
 * (`docs/reference/wind-technique.md` 1.8) and each forearm stays in its range of turn. With the
 * palms on their tubes, the elbows out turn the left forearm 84° and the right forearm 57° from
 * neutral, near the end of the turn of a real forearm, and the skin of each forearm twists. With
 * these elbows, the left forearm turns 67° and the right forearm 15°. With the elbows straight
 * down, the thick upper arms go into the round belly. At rest, the tuba moves off the mouth and its
 * lower end turns 5° forward.
 *
 * The right palm faces the valve tops, and the left palm faces the main branch (`faceTube`,
 * `InstrumentGrips.tubeL` of `models/instruments/brass.ts`), as the left hand of a real tubist
 * grips the tubing at the side of a rotary tuba, with the knuckles to the left, while the right
 * hand works the valves (`docs/reference/wind-technique.md` 3). The left grip moves 0.145 H toward
 * the main branch, 0.05 H around it away from the shoulder, and 0.07 H up (`gripShiftL`), so that
 * the left paw lies on the left side of the branch: its palm faces the branch, the back of the paw
 * faces out to the left, and the fingers point forward and down around the front of the branch.
 * The left fingers curl 92° (`gripCurl`). With the lower left elbow, the grip of 0.16 H puts the
 * left paw 2.3 cm into the branch, and the grips of 0.13 H and less open its finger tips off the
 * branch. At rest, the left grip moves 0.14 H toward the branch (`restGripShiftL`): on the grip of
 * the play, the left forearm goes into the tuba at rest. Both paws keep the aim and the roll of the
 * play at rest (`restAim`): with the roll of the shoulder at rest, the left paw flips in the
 * lowering (the wrist turns 17960° each second). The right fingers curl 80°. The right grip moves
 * 0.15 H along the row of the valves toward the front and 0.1 H toward the right shoulder
 * (`gripShiftR`), so that the right paw lies on the valve tops at the front right of the valve
 * branch, where it shows from the front and from the right front. On the grip of the instrument,
 * the valve branch hides it from both views. A grip further forward is out of the reach of the arm.
 * The mesh has a round belly, so the mouthpiece moves 0.05 H from the mouth along -z of the head
 * under the long muzzle (`lipShift`): with no shift, the tuba goes 4.6 cm into the belly, and with
 * the shift 2.7 cm.
 */
const RHINO_TUBA = {
  ...WIND_HOLDS.tuba,
  reach: 45 * MathUtils.DEG2RAD,
  reachL: 40 * MathUtils.DEG2RAD,
  play: holdTurn(0, 25),
  poleL: [-0.75, -1, 0],
  poleR: [0.75, -1, 0],
  rest: holdTurn(5, 20),
  restPoleL: [-0.75, -1, 0],
  restPoleR: [0.75, -1, 0],
  faceTube: ['palm', 'palm'],
  gripShiftL: [0.07, 0.145, 0.05],
  gripShiftR: [-0.15, 0, -0.1],
  restGripShiftL: [0.07, 0.14, 0.05],
  restAim: 1,
  gripCurl: curls(92, 80),
  lipShift: [0, 0, -0.05],
} as const satisfies WindHold;

/**
 * The holds of the species that hold a wind instrument in their own way, in place of
 * {@link WIND_HOLDS} (design 5.3). The tools change them in memory with
 * `--set '<instrument>@<species>.<path>=<value>'` (`tools/hold-sets.ts`).
 */
export const SPECIES_WIND_HOLDS: Partial<
  Record<SpeciesId, Partial<Record<WindInstrument, WindHold>>>
> = {
  'fox-tan': { flute: FOX_FLUTE },
  panda: { trombone: PANDA_TROMBONE },
  mouse: { oboe: MOUSE_OBOE },
  beaver: { bassoon: BEAVER_BASSOON },
  pig: { horn: PIG_HORN },
  wolf: { clarinet: WOLF_CLARINET },
  monkey: { trumpet: MONKEY_TRUMPET },
  rhino: { tuba: RHINO_TUBA },
};

/**
 * Gives the hold of a wind instrument for a species: its own hold, or the hold of
 * {@link WIND_HOLDS}.
 *
 * @param species The species of the player.
 * @param instrument The instrument.
 * @returns The hold.
 */
export function windHoldOf(species: SpeciesId, instrument: WindInstrument): WindHold {
  return SPECIES_WIND_HOLDS[species]?.[instrument] ?? WIND_HOLDS[instrument];
}

/** The sizes of the body and the hand motion of the winds, in radians (design 5.3). */
export const WIND_BODY = {
  /** The spine leans back by this angle at the top of a breath in, at an amplitude of 1. */
  breath: 3 * MathUtils.DEG2RAD,
  /** The head lifts by this angle off the mouthpiece in the rest pose. */
  headLift: 12 * MathUtils.DEG2RAD,
  /** The curl of open fingers, and the extra curl of closed fingers. */
  curlOpen: 15 * MathUtils.DEG2RAD,
  curlClosed: 50 * MathUtils.DEG2RAD,
  /** The curl of a hand that only holds the instrument. */
  curlHold: 35 * MathUtils.DEG2RAD,
  /**
   * The extra curl of the fingers of a paw with a grip curl (`WindHold.gripCurl`) when all its
   * keys close or all its valves go down.
   */
  keyCurl: 20 * MathUtils.DEG2RAD,
} as const;

const BONES = {
  chest: boneIndex('chest'),
  neck: boneIndex('neck'),
  head: boneIndex('head'),
  instrument: boneIndex('instrument'),
} as const;

/** The left paw of a wind player in the rest pose, off its grip (`WindHold.restFreeL`). */
type FreeRest = (
  | {
      /** A paw on the left thigh of a seated player. */
      readonly kind: 'lap';
      /** The place of the `hand` bone, in the model axes. */
      readonly wrist: Vec3;
      /** The world rotation of the `hand` bone, with the root in its bind pose. */
      readonly rotation: Quat;
    }
  | {
      /** The hanging arm of a standing player. */
      readonly kind: 'hang';
      /** The wrist, the hand, and the elbow of the hanging arm. */
      readonly hang: HangingArm;
      /**
       * The turn of the hanging paw around its long axis, in the axes of the paw, so that it takes
       * the roll of its grip in the play ({@link freeRoll}), or `null` for the hanging paw alone.
       */
      readonly roll: Quat | null;
    }
) & {
  /**
   * The move of the wrist away from the straight line to its grip at the middle of the change, in
   * meters in the model axes, with the root in its bind pose ({@link FreePaw.arc}).
   */
  readonly arc: Vec3;
};

/** The tube that one paw closes around, in the bind pose (`InstrumentGrips.tubeL`). */
interface SideTube {
  /** A point on the axis of the tube. */
  readonly point: Vec3;
  /** The unit direction of the axis. */
  readonly axis: Vec3;
  /** Whether the tube is on the trombone slide, so that it moves with the slide. */
  readonly onSlide: boolean;
}

/** One side of the body of a wind player in the bind pose. */
interface WindSide {
  readonly arm: ArmRig;
  /** The grip of the palm on the instrument in the playing pose, in the bind pose. */
  readonly grip: Vec3;
  /** The grip of the palm on the instrument in the rest pose, in the bind pose. */
  readonly restGrip: Vec3;
  /** Whether the grip is on the trombone slide. */
  readonly onSlide: boolean;
  /**
   * The tube that the paw closes around: the tube of the instrument for the grip
   * (`InstrumentGrips.tubeL`), or the line from the left grip to the right grip of the instrument
   * through the mouthpiece, before the moves of {@link WindHold.gripShiftL}.
   */
  readonly tube: SideTube;
  /**
   * The sign of the side direction across the tube in the aim of the paw ({@link aimSide}): 1 or
   * -1 times the cross product of the axis of the tube and the direction from the grip to the
   * tube: the sign of the hold ({@link WindHold.aimSigns}), or the sign of the playing pose. It is
   * set once, so that a lift or a lowering that turns the tube does not flip the side direction,
   * and the paw with it.
   */
  readonly aimSign: number;
  /**
   * The lift of the shoulder bone up and out in each pose, in radians, by the rule of the round
   * free arms (`shoulderLift()`, design 5.3): 0 for a hold with no rule and for a thin body.
   */
  readonly lift: number;
}

/**
 * The points of a wind player in the bind pose, in the model axes, that the pose needs at each
 * frame.
 */
export interface WindRig {
  readonly hold: WindHold;
  /** The bind position of the `instrument` bone: the mouthpiece at the mouth. */
  readonly pivot: Vec3;
  /** The move of the `instrument` bone in the rest pose, in meters, in the axes of the chest. */
  readonly restOffset: Vec3;
  /**
   * The directions to which the elbows point in the rest pose: the rest elbows of the hold, or the
   * elbows of the hanging arms ({@link WindHold.restArms}).
   */
  readonly restPoleL: Vec3;
  readonly restPoleR: Vec3;
  readonly chestBind: Vec3;
  /** The bind positions of the `neck` and the `head` bones, around which the head turns. */
  readonly neckBind: Vec3;
  readonly headBind: Vec3;
  /** The move of the mouthpiece from the mouth, in meters (`WindHold.lipShift`). */
  readonly lip: Vec3;
  /**
   * The bow of the head in the play, in radians, by the rule of the far mouth (`headBow()`,
   * design 5.3): 0 for a hold with no rule and for a body with a near mouth. The play turn of
   * {@link WindRig.hold} has the turn of the instrument with the head.
   */
  readonly headBow: number;
  readonly left: WindSide;
  readonly right: WindSide;
  /** The left paw in the rest pose, or `null` when it stays on its grip. */
  readonly freeL: FreeRest | null;
  /** The unit direction of the trombone slide from the first position, or (0, 0, 0). */
  readonly slideAxis: Vec3;
  /**
   * The part of the slide travel that the right arm reaches, in meters. The seventh position is
   * out of reach of any probable arm, so the slide positions map into this travel (design 5.3).
   */
  readonly slideReach: number;
}

/**
 * Finds the bind point of a grip of a palm.
 *
 * @param model The player model.
 * @param grip The grip.
 * @returns The point.
 * @throws Error if the instrument has no grip of the palm.
 */
function gripPoint(model: PlayerModel, grip: PiecePoint | null): Vec3 {
  if (!grip) {
    throw new Error(`The ${model.instrument.id} has no grip of a palm.`);
  }
  return placePoint(model.pieces, grip);
}

/**
 * Finds the left paw of a wind player in the rest pose, off its grip: on the left thigh of a
 * seated player, or at the end of the hanging arm of a standing player.
 *
 * @param model The player model.
 * @param arm The left arm.
 * @param rest The free paw of the hold.
 * @param angles The angles of the hanging left arm of {@link WindHold.restArms}, which hangs also
 *   on a seat, or `null`.
 * @returns The paw.
 */
function freeRestOf(
  model: PlayerModel,
  arm: ArmRig,
  rest: FreePaw,
  angles: HangAngles | null,
): FreeRest {
  const h = model.body.headHeight;
  const [out, up, forward] = rest.arc;
  const arc: Vec3 = [-out * h, up * h, -forward * h];
  if (angles) {
    return { kind: 'hang', hang: hangingArm(model, arm, angles), roll: null, arc };
  }
  if (model.support === 'stand') {
    return { kind: 'hang', hang: hangingArm(model, arm, rest.hang), roll: null, arc };
  }
  return { kind: 'lap', ...lapHand(model, arm, rest), arc };
}

/**
 * Gives the share of the shoulder turns of a hold at a weight of the playing pose: the weight for a
 * hold with rest arms ({@link WindHold.restArms}), so that the arms hang from square shoulders at
 * rest, as the shoulder blade of a real player slides forward only when the arm reaches forward.
 * Else 1, so that the shoulders keep their turn at rest.
 *
 * @param hold The hold.
 * @param weight The weight of the playing pose: 0 is the rest pose.
 * @returns The share, from 0 to 1.
 */
function turnShare(hold: WindHold, weight: number): number {
  return hold.restArms ? weight : 1;
}

/**
 * Gives the turn of the right shoulder bone of a hold: the forward turn, and the lift of the side
 * ({@link WindSide.lift}) in each pose.
 *
 * @param hold The hold.
 * @param side The right side of the body.
 * @param out The quaternion to write.
 * @param share The share of the forward turn ({@link turnShare}). The whole turn by default.
 * @returns `out`, with the local rotation of `shoulderR`.
 */
function rightShoulderTurn(hold: WindHold, side: WindSide, out: Quaternion, share = 1): Quaternion {
  // A positive turn around y moves the right shoulder forward.
  return liftShoulder(out.setFromAxisAngle(Y_AXIS, hold.reach * share), side.lift, 'R');
}

/**
 * Gives the turn of the left shoulder bone of a hold: the forward turn, and the lift of the side
 * ({@link WindSide.lift}) in each pose.
 *
 * @param hold The hold.
 * @param side The left side of the body.
 * @param out The quaternion to write.
 * @param share The share of the forward turn ({@link turnShare}). The whole turn by default.
 * @returns `out`, with the local rotation of `shoulderL`.
 */
function leftShoulderTurn(hold: WindHold, side: WindSide, out: Quaternion, share = 1): Quaternion {
  // A negative turn around y moves the left shoulder forward. The subtraction from 0 keeps a turn
  // of 0 at +0, so that a hold with no turn writes the same rotation as no turn.
  return liftShoulder(out.setFromAxisAngle(Y_AXIS, 0 - hold.reachL * share), side.lift, 'L');
}

/**
 * Finds the length of the slide travel that the right arm reaches in the playing pose, in steps
 * of 5 mm, with the chest in its bind pose. The slide turns with the playing rotation of the hold
 * around the mouthpiece, and the mouthpiece follows the mouth of a turned head ({@link placeWind}).
 *
 * @param rig The points of the player.
 * @param travel The full travel of the slide, in meters.
 * @returns The reached travel, in meters.
 */
function slideReachOf(rig: Omit<WindRig, 'slideReach'>, travel: number): number {
  if (!rig.right.onSlide || travel <= 0) {
    return 0;
  }
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  const arm = rig.right.arm;
  const turn = rightShoulderTurn(rig.hold, rig.right, new Quaternion());
  const joint = poseShoulder(arm, chest, rig.chestBind, turn).position;
  const reach = arm.reach + new Vector3(...arm.palm).length();
  placeWind(rig, chest, 1);
  const grip = new Vector3();
  const axis = new Vector3(...rig.slideAxis);
  const bind = new Vector3(...rig.pivot);
  let reached = 0;
  for (let s = 0; s <= travel + 1e-9; s += 0.005) {
    grip.fromArray(rig.right.grip).addScaledVector(axis, s).sub(bind);
    if (grip.applyQuaternion(rotation).add(pivot).distanceTo(joint) > reach) {
      break;
    }
    reached = s;
  }
  return reached;
}

/**
 * Finds the sign of the side direction across the tube in the aim of a paw
 * ({@link WindSide.aimSign}): the sign that continues the way of the paw from its shoulder across
 * the body in the playing pose, with the chest in its bind pose. When {@link aimSide} takes the
 * sign in each frame, the side direction flips in the lowering of the trombone, when the slide
 * turns down and the brace lies across the aim of the paw.
 *
 * @param rig The points of the player.
 * @param side The side of the body.
 * @returns 1 or -1.
 */
function aimSignOf(rig: Omit<WindRig, 'slideReach'>, side: WindSide): number {
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  placeWind(rig, chest, 1);
  const turn =
    side.arm.side === 'L'
      ? leftShoulderTurn(rig.hold, side, new Quaternion())
      : rightShoulderTurn(rig.hold, side, new Quaternion());
  const from = poseShoulder(side.arm, chest, rig.chestBind, turn);
  const bind = new Vector3(...rig.pivot);
  const target = new Vector3(...side.grip).sub(bind).applyQuaternion(rotation).add(pivot);
  const axis = new Vector3(...side.tube.axis).applyQuaternion(rotation);
  const front = new Vector3(...side.tube.point)
    .sub(bind)
    .applyQuaternion(rotation)
    .add(pivot)
    .sub(target)
    .projectOnPlane(axis)
    .normalize();
  const aim = aimAcross(from, target, axis, rig.hold.aimAcross, new Vector3()).sub(from.position);
  return new Vector3().crossVectors(axis, front).dot(aim) < 0 ? -1 : 1;
}

/**
 * Moves the grip of one palm in the bind pose, in the axes of its tube
 * ({@link WindHold.gripShiftL}): along the tube, from the grip toward the axis of the tube, and
 * across both, away from the shoulder joint of the paw.
 *
 * @param raw The grip of the instrument in the bind pose.
 * @param tube The tube of the paw.
 * @param arm The arm of the paw.
 * @param shift The move, in head heights.
 * @param h The head height, in meters.
 * @returns The moved grip.
 */
function shiftGrip(raw: Vec3, tube: SideTube, arm: ArmRig, shift: Vec3, h: number): Vec3 {
  const grip = new Vector3(...raw);
  const along = new Vector3(...tube.axis);
  const toward = new Vector3(...tube.point).sub(grip).projectOnPlane(along).normalize();
  const across = new Vector3().crossVectors(along, toward);
  if (across.dot(grip.clone().sub(new Vector3(...arm.bind.shoulder))) < 0) {
    across.negate();
  }
  const [a, t, c] = shift;
  return toVec3(
    grip
      .addScaledVector(along, a * h)
      .addScaledVector(toward, t * h)
      .addScaledVector(across, c * h),
  );
}

/**
 * Finds the points of a wind player that the pose needs.
 *
 * @param model A player with a woodwind or a brass instrument.
 * @param instrument The instrument of the model.
 * @param hold The hold of the instrument (`windHoldOf()`). The hold of {@link WIND_HOLDS} by
 *   default.
 * @returns The rig.
 * @throws Error if the instrument has no grip of a palm, or if it does not hang on the chest.
 */
export function windRig(
  model: PlayerModel,
  instrument: WindInstrument,
  hold: WindHold = WIND_HOLDS[instrument],
): WindRig {
  const { positions, parents } = model.skeleton;
  if (parents[BONES.instrument] !== BONES.chest) {
    throw new Error(`The ${instrument} does not hang on the chest.`);
  }
  const at = (bone: number): Vec3 => positions[bone] ?? [0, 0, 0];
  const { grips: all } = model.instrument;
  const grips = { L: all.palmL, R: all.palmR };
  const raw = { L: gripPoint(model, grips.L), R: gripPoint(model, grips.R) };
  const tubeAxis = toVec3(new Vector3(...raw.R).sub(new Vector3(...raw.L)).normalize());
  const tubeOf = (s: 'L' | 'R'): SideTube => {
    const own = s === 'L' ? all.tubeL : all.tubeR;
    if (!own) {
      return { point: at(BONES.instrument), axis: tubeAxis, onSlide: false };
    }
    const from = new Vector3(...placePoint(model.pieces, { bone: own.bone, at: own.from }));
    const to = new Vector3(...placePoint(model.pieces, { bone: own.bone, at: own.to }));
    return {
      point: toVec3(from),
      axis: toVec3(to.sub(from).normalize()),
      onSlide: own.bone === 'slide',
    };
  };
  const side = (s: 'L' | 'R'): WindSide => {
    const arm = armRig(model, s);
    const tube = tubeOf(s);
    const shifted = (shift: Vec3): Vec3 =>
      shift.some((v) => v !== 0)
        ? shiftGrip(raw[s], tube, arm, shift, model.body.headHeight)
        : raw[s];
    const play = s === 'L' ? hold.gripShiftL : hold.gripShiftR;
    const rest = (s === 'L' ? hold.restGripShiftL : hold.restGripShiftR) ?? play;
    return {
      arm,
      grip: shifted(play),
      restGrip: shifted(rest),
      onSlide: grips[s]?.bone === 'slide',
      tube,
      aimSign: 1,
      lift: shoulderLift(model, arm, hold.roundArms),
    };
  };
  const slide = model.instrument.targets.find((t) => t.kind === 'slide');
  const slideAt = (point: Vec3): Vector3 =>
    new Vector3(...placePoint(model.pieces, { bone: 'slide', at: point }));
  const travelVector = slide ? slideAt(slide.to).sub(slideAt(slide.from)) : new Vector3();
  const left = side('L');
  const bow = headBow(model, hold.farMouth);
  const placed = {
    hold: bow === 0 ? hold : { ...hold, play: bowedPlay(hold, bow) },
    headBow: bow,
    pivot: at(BONES.instrument),
    restOffset: toVec3(new Vector3(...hold.restShift).multiplyScalar(model.body.headHeight)),
    restPoleL: hold.restPoleL,
    restPoleR: hold.restPoleR,
    chestBind: at(BONES.chest),
    neckBind: at(BONES.neck),
    headBind: at(BONES.head),
    lip: toVec3(new Vector3(...hold.lipShift).multiplyScalar(model.body.headHeight)),
    left,
    right: side('R'),
    freeL: hold.restFreeL
      ? freeRestOf(model, left.arm, hold.restFreeL, hold.restArms?.L ?? null)
      : null,
    slideAxis: toVec3(travelVector.clone().normalize()),
  };
  const rig = hold.restArms ? armRest(model, placed, hold.restArms) : placed;
  const signed = {
    ...rig,
    left: { ...rig.left, aimSign: hold.aimSigns?.[0] ?? aimSignOf(rig, rig.left) },
    right: { ...rig.right, aimSign: hold.aimSigns?.[1] ?? aimSignOf(rig, rig.right) },
  };
  // A free paw that hangs from the rest arms takes the roll of its grip.
  const freeL =
    hold.restArms && signed.freeL?.kind === 'hang'
      ? { ...signed.freeL, roll: freeRoll(signed, signed.freeL.hang) }
      : signed.freeL;
  const rolled = roundElbows(model, { ...signed, freeL });
  return { ...rolled, slideReach: slideReachOf(rolled, travelVector.length()) };
}

/**
 * Turns the elbows of a round body out by the rule of the round free arms
 * ({@link WindHold.roundArms}, design 5.3): the elbows of the play, of the rest, and of a free
 * hanging left arm. The paws keep their grips, so only the elbows move.
 *
 * @param model The player model.
 * @param rig The points of the player.
 * @returns The points, with the turned elbows, or `rig` for a hold with no rule.
 */
function roundElbows(
  model: PlayerModel,
  rig: Omit<WindRig, 'slideReach'>,
): Omit<WindRig, 'slideReach'> {
  const { hold } = rig;
  if (hold.roundArms === null) {
    return rig;
  }
  const turnL = elbowOutTurn(model, rig.left.arm, hold.roundArms);
  const turnR = elbowOutTurn(model, rig.right.arm, hold.roundArms);
  const freeL =
    rig.freeL?.kind === 'hang'
      ? {
          ...rig.freeL,
          hang: { ...rig.freeL.hang, pole: turnPoleOut(rig.freeL.hang.pole, turnL, 'L') },
        }
      : rig.freeL;
  return {
    ...rig,
    hold: {
      ...hold,
      poleL: turnPoleOut(hold.poleL, turnL, 'L'),
      poleR: turnPoleOut(hold.poleR, turnR, 'R'),
    },
    restPoleL: turnPoleOut(rig.restPoleL, turnL, 'L'),
    restPoleR: turnPoleOut(rig.restPoleR, turnR, 'R'),
    freeL,
  };
}

/**
 * Gives the turn of the hanging left paw around its long axis that gives it the roll of its grip
 * in the play, with the chest in its bind pose ({@link WindHold.restArms}): the twist around the
 * long axis of the paw of the turn from the hanging paw to the paw on its grip. The lift and the
 * lowering then turn the paw mostly across its long axis. A paw that keeps the roll of the
 * hanging arm turns up to 220° around its forearm in the lift, as the bind paws of the bodies
 * differ by about 100°, and the twist bone of the forearm flips.
 *
 * @param rig The points of the player.
 * @param hang The hanging left arm.
 * @returns The turn, in the axes of the hanging paw.
 */
function freeRoll(rig: Omit<WindRig, 'slideReach'>, hang: HangingArm): Quat {
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  placeWind(rig, chest, 1);
  const side = rig.left;
  const at = new Vector3(...side.grip).sub(new Vector3(...rig.pivot)).applyQuaternion(rotation);
  at.add(pivot);
  const turn = leftShoulderTurn(rig.hold, side, new Quaternion());
  const play = handOnGrip(
    rig,
    side,
    poseShoulder(side.arm, chest, rig.chestBind, turn),
    at,
    1,
    new Quaternion(),
  );
  const square = poseShoulder(side.arm, chest, rig.chestBind, new Quaternion());
  const relative = hangingHand(hang, square, new Quaternion()).invert().multiply(play);
  return toQuat(new Quaternion(0, relative.y, 0, relative.w).normalize());
}

/**
 * Gives the rest place of a wind instrument from the hanging arms of the body (design 5.2,
 * {@link WindHold.restArms}), with the chest in its bind pose: each arm hangs out to the side
 * until it clears the body, with its own forward swing and elbow bend (`hangingArm()`), from a
 * square shoulder ({@link turnShare}). The instrument takes its rest turn, and moves so that
 * the rest grip of the right palm lies at the hanging right palm when the left paw leaves its grip,
 * else so that the middle of both rest grips lies at the middle of both hanging palms. The move of
 * the hold ({@link WindHold.restShift}) then adds to that place. The rest elbows point as the
 * hanging elbows.
 *
 * @param model The player model.
 * @param rig The points of the player, with the rest move of the hold alone.
 * @param arms The angles of each arm.
 * @returns The points, with the rest move and the rest elbows from the hanging arms.
 */
function armRest(
  model: PlayerModel,
  rig: Omit<WindRig, 'slideReach'>,
  arms: NonNullable<WindHold['restArms']>,
): Omit<WindRig, 'slideReach'> {
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  const restTurn = new Quaternion(...rig.hold.rest);
  const pivotAt = new Vector3(...rig.pivot);
  // The place of the rest pivot at which the rest grip of one side lies at its hanging palm.
  const pivotFor = (side: WindSide, angles: HangAngles) => {
    const hang = hangingArm(model, side.arm, angles);
    // The shoulders are square at rest (`turnShare()`).
    const shoulderAt = poseShoulder(side.arm, chest, rig.chestBind, new Quaternion());
    const palmAt = hangingWrist(hang, shoulderAt, new Vector3()).add(
      new Vector3(...side.arm.palm).applyQuaternion(
        hangingHand(hang, shoulderAt, new Quaternion()),
      ),
    );
    const grip = new Vector3(...side.restGrip).sub(pivotAt).applyQuaternion(restTurn);
    return { pivot: palmAt.sub(grip), pole: hang.pole };
  };
  const right = pivotFor(rig.right, arms.R);
  const left = pivotFor(rig.left, arms.L);
  const restPivot = rig.freeL
    ? right.pivot
    : left.pivot.clone().add(right.pivot).multiplyScalar(0.5);
  // The rest pivot is the mouth with the move of the hold (`placeWind()`).
  const move = restPivot
    .sub(pivotAt)
    .sub(new Vector3(...rig.lip))
    .add(new Vector3(...rig.restOffset));
  return {
    ...rig,
    restOffset: toVec3(move),
    restPoleL: left.pole,
    restPoleR: right.pole,
  };
}

/** The pose of a wind player that is not in the rotations of its bones. */
export interface WindPoseOut {
  /** The rotations of the pose to write. */
  readonly rotations: Float32Array;
  /** The move of the `slide` bone, in the axes of the `instrument` bone. */
  slideOffset: [number, number, number];
  /** The move of the `instrument` bone, in the axes of the chest. */
  instrumentOffset: [number, number, number];
}

/**
 * Gives the curl of the fingers of one hand.
 *
 * @param closed The close of the fingers, from 0 to 1, or -1 for a hand that only holds.
 * @param weight The weight of the playing pose.
 * @param grip The grip curl of the hand (`WindHold.gripCurl`), or `null` for the curls of
 *   {@link WIND_BODY}.
 * @returns The curl angle.
 */
function curlOf(closed: number, weight: number, grip: number | null): number {
  const b = WIND_BODY;
  if (grip !== null) {
    return grip + (closed < 0 ? 0 : b.keyCurl * closed * weight);
  }
  const playing = closed < 0 ? b.curlHold : b.curlOpen + (b.curlClosed - b.curlOpen) * closed;
  return b.curlHold + (playing - b.curlHold) * weight;
}

const local = new Quaternion();
const playTurn = new Quaternion();
const rotation = new Quaternion();
const pivot = new Vector3();
const shift = new Vector3();
const turned = new Vector3();
const pivotBind = new Vector3();
const slide = new Vector3();
const rightTurn = new Quaternion();
const leftTurn = new Quaternion();
const shoulder = createFrame();
const hangFrom = createFrame();
const grip = new Vector3();
const restGrip = new Vector3();
const playGrip = new Vector3();
const hand = new Quaternion();
const palm = new Vector3();
const restWrist = new Vector3();
const restHand = new Quaternion();
const rollTurn = new Quaternion();
const arcMove = new Vector3();
const ORIGIN = [0, 0, 0] as const;

const tubeSide = new Vector3();
const tubeAxis = new Vector3();
const tubePoint = new Vector3();
const aimFrom = new Vector3();
const aimPoint = new Vector3();
const handAxis = new Vector3();
const palmNow = new Vector3();
const palmGoal = new Vector3();
const palmRoll = new Quaternion();
const rollCross = new Vector3();
const NO_ROLL = new Quaternion();

/**
 * The angle between the side of a paw and its tube above which the roll of {@link faceTube} turns
 * around the long axis of the hand. Near 180°, the cross product of the two directions vanishes,
 * and `Quaternion.setFromUnitVectors()` takes any axis square to them, so the paw of the wolf can
 * flip in the lift (the wrist turns 9978° each second).
 */
const OPPOSITE = Math.cos(170 * MathUtils.DEG2RAD);

const aroundAxis = new Vector3();
const aroundFrom = new Vector3();
const aroundTo = new Vector3();
const aroundTurn = new Quaternion();

/**
 * Moves a grip around the axis of its tube, from its rest place to its place in the play
 * ({@link WindHold.gripAround}): the place along the axis and the distance from the axis change on
 * straight lines, and the direction from the axis turns around it by the shorter way.
 *
 * @param rest The grip in the rest pose, in the bind pose.
 * @param play The grip in the playing pose, in the bind pose.
 * @param tube The tube of the paw, in the bind pose.
 * @param weight The weight of the playing pose.
 * @param out The grip to write.
 * @returns `out`.
 */
function aroundTube(
  rest: Vector3,
  play: Vector3,
  tube: SideTube,
  weight: number,
  out: Vector3,
): Vector3 {
  aroundAxis.fromArray(tube.axis);
  const point = tubePoint.fromArray(tube.point);
  aroundFrom.subVectors(rest, point);
  aroundTo.subVectors(play, point);
  const along = MathUtils.lerp(aroundFrom.dot(aroundAxis), aroundTo.dot(aroundAxis), weight);
  aroundFrom.projectOnPlane(aroundAxis);
  aroundTo.projectOnPlane(aroundAxis);
  const radius = MathUtils.lerp(aroundFrom.length(), aroundTo.length(), weight);
  const angle = Math.atan2(
    aroundAxis.dot(rollCross.crossVectors(aroundFrom, aroundTo)),
    aroundFrom.dot(aroundTo),
  );
  aroundTurn.setFromAxisAngle(aroundAxis, angle * weight);
  return out
    .copy(aroundFrom)
    .applyQuaternion(aroundTurn)
    .setLength(radius)
    .addScaledVector(aroundAxis, along)
    .add(point);
}

/**
 * Rolls a hand around its own long axis, the line from its shoulder to its grip, until one side
 * of the paw faces the tube: the direction from the grip to the axis of the tube, square to the
 * tube ({@link WindHold.faceTube}). The palm faces +x of the hand of the player on the left hand
 * and -x on the right hand: a curl of the fingers (`writeCurl()` of `pose/ik.ts`) moves the
 * finger tips of the skin to that side, and `PALMS` of `models/studio-rig.ts` gives the same
 * sides. The back faces the other way.
 *
 * The roll grows with the given share, the weight of the playing pose by default
 * ({@link WindHold.restAim}), so that the rest pose can keep the paw of the shoulder, and the lift
 * and the lowering do not turn the paw through the far side of its forearm.
 *
 * @param out The world rotation of the hand, which the function changes.
 * @param toTube The unit direction from the grip to the axis of the tube.
 * @param side The side of the hand.
 * @param face The side of the paw that faces the tube.
 * @param weight The share of the roll: the eased weight of the playing pose, or more with
 *   {@link WindHold.restAim}.
 */
function faceTube(
  out: Quaternion,
  toTube: Vector3,
  side: 'L' | 'R',
  face: 'palm' | 'back',
  weight: number,
): void {
  handAxis.set(0, 1, 0).applyQuaternion(out);
  const palmX = side === 'L' ? 1 : -1;
  palmNow
    .set(face === 'palm' ? palmX : -palmX, 0, 0)
    .applyQuaternion(out)
    .projectOnPlane(handAxis);
  palmGoal.copy(toTube).projectOnPlane(handAxis);
  if (palmNow.lengthSq() < 1e-8 || palmGoal.lengthSq() < 1e-8) {
    return;
  }
  palmNow.normalize();
  palmGoal.normalize();
  if (palmNow.dot(palmGoal) > OPPOSITE) {
    palmRoll.setFromUnitVectors(palmNow, palmGoal);
  } else {
    // Both directions are square to the axis of the hand, so the roll turns around it.
    const angle = Math.atan2(
      handAxis.dot(rollCross.crossVectors(palmNow, palmGoal)),
      palmNow.dot(palmGoal),
    );
    palmRoll.setFromAxisAngle(handAxis.normalize(), angle);
  }
  out.premultiply(palmRoll.slerp(NO_ROLL, 1 - weight));
}

/**
 * Gives the point at which a paw on its grip aims ({@link handToward}): the grip, moved along the
 * tube toward the line across the tube through the shoulder by the share `across` of the playing
 * pose. The paw then points across the tube, so that its fingers wrap the tube as a real hand
 * does, and not along the tube past it.
 *
 * @param from The posed `shoulder` bone.
 * @param target The posed grip of the palm.
 * @param axis The unit direction of the tube.
 * @param across The share of the part of the aim along the tube that goes.
 * @param out The point to write.
 * @returns `out`.
 */
function aimAcross(
  from: Frame,
  target: Vector3,
  axis: Vector3,
  across: number,
  out: Vector3,
): Vector3 {
  aimFrom.subVectors(from.position, target);
  return out
    .copy(axis)
    .multiplyScalar(aimFrom.dot(axis) * across)
    .add(target);
}

const sideAim = new Vector3();
const sideAcross = new Vector3();

/**
 * Turns the aim point of a paw on its grip ({@link aimAcross}) toward the side direction across
 * the tube: the direction square to the tube and to its front, away from the side of the paw. The
 * paw then lies across the back of the tube, and its curled fingers wrap the front.
 *
 * @param from The posed `shoulder` bone.
 * @param axis The unit direction of the tube.
 * @param front The unit direction from the grip to the tube.
 * @param sign The sign of the side direction ({@link WindSide.aimSign}), which continues the way
 *   of the paw from its shoulder across the body in the playing pose.
 * @param share The share of the side direction in the aim, from -1 to 1. A share below 0 takes
 *   the opposite side direction.
 * @param out The aim point, which the function moves.
 * @returns `out`.
 */
function aimSide(
  from: Frame,
  axis: Vector3,
  front: Vector3,
  sign: number,
  share: number,
  out: Vector3,
): Vector3 {
  sideAim.subVectors(out, from.position).normalize();
  sideAcross.crossVectors(axis, front).normalize().multiplyScalar(sign);
  sideAim.multiplyScalar(1 - Math.abs(share)).addScaledVector(sideAcross, share);
  return out.copy(from.position).add(sideAim);
}

/**
 * Gives the world rotation of a paw on its grip: the paw aims from its shoulder at its grip, and a
 * paw that faces its tube ({@link WindHold.faceTube}) aims across the tube ({@link aimAcross},
 * {@link aimSide}) and rolls to face it, by a share of the playing pose. It reads the module
 * scratch objects `rotation`, `pivot`, and `slide` of the placed instrument
 * ({@link placeWind}).
 *
 * @param rig The points of the player.
 * @param side The side of the body.
 * @param from The posed `shoulder` bone.
 * @param at The posed grip of the palm.
 * @param aim The share of the aim and the roll of the play.
 * @param out The quaternion to write.
 * @returns `out`.
 */
function handOnGrip(
  rig: Omit<WindRig, 'slideReach'>,
  side: WindSide,
  from: Frame,
  at: Vector3,
  aim: number,
  out: Quaternion,
): Quaternion {
  const face = rig.hold.faceTube[side.arm.side === 'L' ? 0 : 1];
  if (face === 'none') {
    return handToward(from, at, out);
  }
  tubeAxis.fromArray(side.tube.axis).applyQuaternion(rotation);
  // The palm faces from its grip to the axis of its tube. The axis of a woodwind passes through
  // the mouthpiece. The up axis of the bone is no such direction: the oboe and the clarinet hang
  // with their keys toward the body, so with it, the palms faced up.
  tubePoint.fromArray(side.tube.point);
  if (side.tube.onSlide) {
    tubePoint.add(slide);
  }
  tubePoint.sub(pivotBind.fromArray(rig.pivot)).applyQuaternion(rotation).add(pivot);
  tubeSide.subVectors(tubePoint, at).projectOnPlane(tubeAxis).normalize();
  aimAcross(from, at, tubeAxis, rig.hold.aimAcross * aim, aimPoint);
  const sideShare = rig.hold.aimSide[side.arm.side === 'L' ? 0 : 1];
  if (sideShare !== 0) {
    aimSide(from, tubeAxis, tubeSide, side.aimSign, sideShare * aim, aimPoint);
  }
  handToward(from, aimPoint, out);
  faceTube(out, tubeSide, side.arm.side, face, aim);
  return out;
}

/**
 * Writes one arm and its fingers on the grip of the instrument. A paw that is free in the rest pose
 * moves from its rest place to its grip by the weight of the playing pose.
 *
 * @param rig The points of the player.
 * @param side The side of the body.
 * @param frames The posed frames of the root and of the chest.
 * @param turn The local rotation of the `shoulder` bone.
 * @param pole The direction to which the elbow points.
 * @param curl The curl of the fingers.
 * @param free The paw in the rest pose off its grip, or `null` for a palm that stays on its grip.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @param rotations The rotations of the pose to write.
 */
function poseSide(
  rig: WindRig,
  side: WindSide,
  frames: TorsoFrames,
  turn: Quaternion,
  pole: Vec3,
  curl: number,
  free: FreeRest | null,
  weight: number,
  rotations: Float32Array,
): void {
  const { chest, root } = frames;
  restGrip.fromArray(side.restGrip);
  playGrip.fromArray(side.grip);
  if (rig.hold.gripAround) {
    aroundTube(restGrip, playGrip, side.tube, weight, grip);
  } else {
    grip.lerpVectors(restGrip, playGrip, weight);
  }
  if (side.onSlide) {
    grip.add(slide);
  }
  grip.sub(pivotBind.fromArray(rig.pivot)).applyQuaternion(rotation).add(pivot);
  poseShoulder(side.arm, chest, rig.chestBind, turn, shoulder);
  // A paw that leaves its grip at rest takes the aim and the roll of its grip by the weight of
  // the playing pose alone, so that it faces its tube in the play and keeps the aim and the roll
  // of its shoulder at rest: with the roll of the grip at rest, the mix from its rest paw flips to
  // the other side of its forearm in the middle of the move. With no roll in the play, the left
  // flute paw of the tan fox points at the flute from below and misses it.
  // The share of the aim and the roll of the play: a hold can keep them in the rest pose.
  const aim = free ? weight : rig.hold.restAim + (1 - rig.hold.restAim) * weight;
  handOnGrip(rig, side, shoulder, grip, aim, hand);
  const wrist = grip.sub(palm.fromArray(side.arm.palm).applyQuaternion(hand));

  // In the playing pose, the paw is on its grip with no mix, so that the pose is the pose of the
  // grip with no free paw.
  if (free && weight < 1) {
    // A paw on the thigh follows the root, and a hanging arm follows its shoulder.
    if (free.kind === 'lap') {
      posePoint(root, ORIGIN, free.wrist, restWrist);
      restHand.fromArray(free.rotation).premultiply(root.rotation);
    } else {
      // The arm hangs from the lifted joint in the turn of the shoulder with no lift
      // (`WindSide.lift`), so that the lift moves the joint and not the direction of the arm.
      hangFrom.position.copy(shoulder.position);
      liftShoulder(hangFrom.rotation.copy(shoulder.rotation), -side.lift, side.arm.side);
      hangingWrist(free.hang, hangFrom, restWrist);
      hangingHand(free.hang, hangFrom, restHand);
      if (free.roll) {
        restHand.multiply(rollTurn.fromArray(free.roll));
      }
    }
    wrist.lerpVectors(restWrist, wrist, weight);
    wrist.add(
      arcMove
        .fromArray(free.arc)
        .applyQuaternion(root.rotation)
        .multiplyScalar(4 * weight * (1 - weight)),
    );
    if (rig.hold.roundArms !== null) {
      keepBent(side.arm, shoulder.position, weight, wrist);
    }
    mixRotation(restHand, hand, weight, hand);
  }

  writeArm({ arm: side.arm, shoulder, wrist, hand, pole }, chest.rotation, rotations);
  setBoneRotation(rotations, side.arm.bones.shoulder, turn);
  writeCurl(side.arm, curl, rotations);
}

const poleMix = new Vector3();
const polePlay = new Vector3();
const poleTuple: [number, number, number] = [0, 0, 0];

/**
 * Mixes the direction of an elbow in the rest pose with its direction while the player plays.
 *
 * @param rest The direction in the rest pose.
 * @param play The direction while the player plays.
 * @param weight The weight of the playing pose.
 * @returns The mixed unit direction, in a module tuple that the next call writes again.
 */
function mixPole(rest: Vec3, play: Vec3, weight: number): Vec3 {
  mixDirection(poleMix.fromArray(rest), polePlay.fromArray(play), weight, poleMix);
  return poleMix.toArray(poleTuple);
}

/**
 * Places the instrument of a wind player: the local rotation of the `instrument` bone, its world
 * rotation, its move in the axes of the chest, and the posed place of the mouthpiece. The
 * instrument turns from its rest rotation to its playing rotation around the mouthpiece. In the
 * rest pose, it comes down from the mouth by the rest move. While the player plays, it moves with
 * the mouth of a head that the hold turns. It writes the module scratch objects `local`,
 * `rotation`, `shift`, and `pivot`.
 *
 * @param rig The points of the player.
 * @param chest The posed frame of the chest.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 */
function placeWind(rig: Omit<WindRig, 'slideReach'>, chest: Frame, weight: number): void {
  mixRotation(local.fromArray(rig.hold.rest), playTurn.fromArray(rig.hold.play), weight, local);
  rotation.multiplyQuaternions(chest.rotation, local);
  // In the rest pose, the instrument comes down from the mouth to the lap. While the player
  // plays, the mouthpiece follows the mouth of a turned head.
  shift
    .fromArray(turnedMouth(rig, rig.hold.headTurn * weight, rig.headBow * weight))
    .sub(turned.fromArray(rig.pivot));
  shift.addScaledVector(turned.fromArray(rig.restOffset), 1 - weight);
  posePoint(chest, rig.chestBind, rig.pivot, pivot).add(
    turned.copy(shift).applyQuaternion(chest.rotation),
  );
}

const neckTurn = new Quaternion();
const headTurn = new Quaternion();
const partTurn = new Quaternion();
const neckBind = new Vector3();
const mouth = new Vector3();
const mouthTuple: [number, number, number] = [0, 0, 0];

/**
 * Writes the turns of the neck and of the head of a wind player around y and then x, in the bind
 * axes of the chest, as the look of the body layer turns them (`writeBody()` of `pose-at.ts`):
 * the neck takes {@link NECK_SHARE} of each angle, and the head the rest. It writes the module
 * scratch objects `neckTurn` and `headTurn`: the turn of the neck, and the whole turn of the head.
 *
 * @param yaw The turn of the head to the left, in radians.
 * @param bow The turn of the head down, in radians.
 */
function turnHead(yaw: number, bow: number): void {
  neckTurn
    .setFromAxisAngle(Y_AXIS, yaw * NECK_SHARE)
    .multiply(partTurn.setFromAxisAngle(X_AXIS, -bow * NECK_SHARE));
  headTurn
    .copy(neckTurn)
    .multiply(partTurn.setFromAxisAngle(Y_AXIS, yaw * (1 - NECK_SHARE)))
    .multiply(partTurn.setFromAxisAngle(X_AXIS, -bow * (1 - NECK_SHARE)));
}

/**
 * Gives the play turn of a hold with the head bowed by the rule of the far mouth (design 5.3):
 * the instrument turns with the head from the head of the hold, so that it keeps its angle to the
 * face.
 *
 * @param hold The hold.
 * @param bow The bow of the head, in radians.
 * @returns The turn, in the axes of the chest.
 */
function bowedPlay(hold: WindHold, bow: number): Quat {
  turnHead(hold.headTurn, 0);
  const square = headTurn.clone().invert();
  turnHead(hold.headTurn, bow);
  return toQuat(
    headTurn
      .clone()
      .multiply(square)
      .multiply(new Quaternion(...hold.play)),
  );
}

/**
 * Gives the place of the mouthpiece at the mouth after a turn of the head around y and a bow
 * around x, in the bind axes of the chest, with the move of the hold from the mouth
 * (`WindRig.lip`): the neck turns around its joint, and the head around its joint
 * ({@link turnHead}). The mouth of the bind pose is the bind place of the mouthpiece.
 *
 * @param rig The points of the player.
 * @param yaw The turn of the head to the left, in radians.
 * @param bow The turn of the head down, in radians.
 * @returns The place, in a module tuple that the next call writes again.
 */
function turnedMouth(rig: Omit<WindRig, 'slideReach'>, yaw: number, bow: number): Vec3 {
  turnHead(yaw, bow);
  neckBind.fromArray(rig.neckBind);
  mouth
    .fromArray(rig.pivot)
    .add(turned.fromArray(rig.lip))
    .sub(turned.fromArray(rig.headBind))
    .applyQuaternion(headTurn);
  turned.fromArray(rig.headBind).sub(neckBind).applyQuaternion(neckTurn).add(neckBind);
  return mouth.add(turned).toArray(mouthTuple);
}

/** The posed place of each grip of a wind instrument and of the shoulder joint that reaches it. */
interface WindGrip {
  /** The shoulder joint, at the start of the upper arm. */
  readonly joint: Vec3;
  /** The grip of the palm on the instrument. */
  readonly grip: Vec3;
}

/**
 * Gives the posed grips of a wind player and the shoulder joints that reach them, with the chest
 * in its bind pose (design 4.6, 5.3). The arm reaches a grip when the distance from the joint to
 * the grip is at most the length of the arm. The grip of each palm mixes its rest grip and its grip
 * of the play by the weight ({@link WindHold.restGripShiftL}). `pnpm hold-reach --instrument flute`
 * reads it.
 *
 * @param rig The points of the player.
 * @param weight The weight of the playing pose: 0 is the rest pose, 1 the playing pose.
 * @returns The grip and the joint of each side.
 */
export function windGrips(rig: WindRig, weight: number): Readonly<Record<'L' | 'R', WindGrip>> {
  const chest = { rotation: new Quaternion(), position: new Vector3(...rig.chestBind) };
  placeWind(rig, chest, weight);
  const side = (s: WindSide, turn: Quaternion): WindGrip => {
    const at = new Vector3()
      .lerpVectors(new Vector3(...s.restGrip), new Vector3(...s.grip), weight)
      .sub(new Vector3(...rig.pivot))
      .applyQuaternion(rotation)
      .add(pivot);
    const joint = poseShoulder(s.arm, chest, rig.chestBind, turn).position;
    return { joint: toVec3(joint), grip: toVec3(at) };
  };
  return {
    L: side(
      rig.left,
      leftShoulderTurn(rig.hold, rig.left, new Quaternion(), turnShare(rig.hold, weight)),
    ),
    R: side(
      rig.right,
      rightShoulderTurn(rig.hold, rig.right, new Quaternion(), turnShare(rig.hold, weight)),
    ),
  };
}

/**
 * Writes the arms, the fingers, the instrument, and the slide of a wind player (design 5.3,
 * 4.7). The mouthpiece stays at the mouth, because the head and the instrument both follow the
 * chest. The palms stay on their grips, also in the rest pose, and the two-bone IK places each
 * arm. A hold can free the left paw in the rest pose (`WindHold.restFreeL`). The fingers close
 * for the pitch. The trombone slide moves along its axis.
 *
 * The caller writes the breath into the spine, and the head lift of the rest pose into the neck
 * and the head, before it calculates the frames.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the root and of the chest.
 * @param state The fingers, the slide, and the breath at the song time of the note layer.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2, 5.5).
 * @param out The pose to write.
 */
export function poseWind(
  rig: WindRig,
  frames: TorsoFrames,
  state: WindState,
  weight: number,
  out: WindPoseOut,
): void {
  const chest = frames.chest;
  placeWind(rig, chest, weight);
  slide.fromArray(rig.slideAxis).multiplyScalar(state.slide * rig.slideReach * weight);
  const { hold } = rig;
  const { freeL } = rig;
  const left = curlOf(state.fingersL, weight, hold.gripCurl?.[0] ?? null);
  const restPoleL = freeL?.kind === 'hang' ? freeL.hang.pole : rig.restPoleL;
  const poleL = mixPole(restPoleL, hold.poleL, weight);
  leftShoulderTurn(hold, rig.left, leftTurn, turnShare(hold, weight));
  poseSide(rig, rig.left, frames, leftTurn, poleL, left, freeL, weight, out.rotations);
  const right = curlOf(state.fingersR, weight, hold.gripCurl?.[1] ?? null);
  rightShoulderTurn(hold, rig.right, rightTurn, turnShare(hold, weight));
  const poleR = mixPole(rig.restPoleR, hold.poleR, weight);
  poseSide(rig, rig.right, frames, rightTurn, poleR, right, null, weight, out.rotations);
  setBoneRotation(out.rotations, BONES.instrument, local);
  slide.toArray(out.slideOffset);
  shift.toArray(out.instrumentOffset);
}
