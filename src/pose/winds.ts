import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { SpeciesId } from '../models/species.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PiecePoint } from '../models/instruments/types.ts';
import { IDENTITY, ORIGIN, toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { NO_TURN, X_AXIS, Y_AXIS, Z_AXIS } from './axes.ts';
import { mixPole, mixRotation } from './blend.ts';
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
import {
  elbowOutTurn,
  keepBent,
  keepMoveBend,
  liftShoulder,
  shoulderLift,
  turnPoleOut,
} from './round-arms.ts';
import type { WindState } from './wind-notes.ts';

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
  /**
   * The turn of the head to the left while the player plays, in radians, as the look turns the
   * neck and the head (design 5.3). The mouthpiece follows the turned mouth. A real flutist turns
   * the head to the left, so that the flute lies square to the face and the right elbow stays in
   * line with the shoulder. 0 keeps the head square to the chest.
   */
  readonly headTurn: number;
  /**
   * The forward lean of the spine while the player plays, in radians, on top of the breath. A
   * negative lean turns the upper body back. The instrument and the arms move with the chest, so
   * the head bow of the far mouth ({@link WindHold.farMouth}) keeps the paws in reach while the
   * head stays upright. 0 keeps the spine of the body.
   */
  readonly lean: number;
  /**
   * The move of the mouthpiece from the mouth of the bind pose, in head heights, in the bind axes
   * of the head. A long muzzle reaches past the mouth, so a flute can sit further back under it.
   * (0, 0, 0) keeps the mouthpiece at the mouth.
   */
  readonly lipShift: Vec3;
  /**
   * The left paw in the rest pose when it leaves its grip (design 5.2, 5.3): the place of the palm
   * of a seated player from the top of its left thigh (on the thigh, or on the top of the haunch
   * near the hip, as for the tan fox), the side of the palm, and the direction of the fingers. The
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
   * the fingers point past the tube in place of around it. A share below 0 adds that part again,
   * so that the paw points more along the tube, as a paw in the bell of the horn. Only a paw that
   * rolls to face its tube ({@link WindHold.faceTube}) takes it.
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
type TubeFace = 'palm' | 'back' | 'none';

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
  /**
   * The turn of the hanging paw of a standing player around its long axis, in radians: a turn of
   * the hand of `hangingHand()`, which turns the bind paw down along the forearm by the shortest
   * turn. 0 when it is missing.
   */
  readonly hangRoll?: number;
  /**
   * The largest distance from the shoulder joint to the wrist in the middle of the lift and of the
   * lowering, as a share of the length of the arm (`keepMoveBend()` of `pose/round-arms.ts`,
   * design 5.2). No limit when it is missing. A short arm whose path leaves the reach takes it,
   * so that the elbow stays bent in the move.
   */
  readonly moveReach?: number;
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
  headTurn: 0,
  lean: 0,
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
 * 5.3), so a body with a mouth further in front of the shoulders bows the head. The Tripo monkey
 * has a share of 1.09 and an own fit ({@link MONKEY_TRUMPET}). The flute has no rule: with the
 * bow, the wolf and the beaver flutists failed the grip turn of the left paw, and the forearms of
 * the heavy bodies stayed in the turned head. A lift of the head made them deeper.
 */
const FAR_MOUTH_FIT = 0.9;

/**
 * The turn of the horn in the rest pose (design 5.2): its right side, with the bell, 15° back
 * around the vertical, and then its lower end 9° to the right. With the rest move of the hold, the
 * bell then hangs beside the right thigh, and the mouthpiece points up and to the left, away from
 * the face, as a real hornist rests the horn on the lap with the bell to the right
 * (`docs/reference/wind-technique.md` 2.2).
 */
const HORN_REST_TURN = toQuat(
  new Quaternion()
    .setFromAxisAngle(Y_AXIS, -15 * MathUtils.DEG2RAD)
    .multiply(new Quaternion().setFromAxisAngle(Z_AXIS, 9 * MathUtils.DEG2RAD)),
);

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
  // The horn hold of each body (design 5.3): the horn of the accepted pig hornist (PIG_HORN), with
  // the mouthpiece at the mouth. The coil stands in front of the right side of the chest, and the
  // bell opens back and to the right, beside the right side of the belly (HORN_PLANE of
  // models/instruments/brass.ts). The left paw lies on the valve levers. The right paw lies in the
  // bell: it points more along the axis of the bell than the line from its shoulder (aimAcross
  // below 0), and the back of the paw faces the axis (docs/reference/wind-technique.md 2.2). At
  // rest, the horn comes down in front of the belly with its bell beside the right thigh
  // (HORN_REST_TURN, restShift), and both paws keep their hold (restAim). The elbows point down.
  horn: {
    ...WOODWIND,
    poleR: [0.6, -1, -0.5],
    restPoleL: [-0.5, -1, -0.5],
    restPoleR: [0.5, -1, 0],
    rest: HORN_REST_TURN,
    restShift: [0.05, -0.45, -0.1],
    faceTube: ['none', 'back'],
    aimAcross: -1.5,
    restAim: 1,
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
  },
  tuba: {
    ...WOODWIND,
    poleL: [-1, -1, -1],
    poleR: [1, -1, -1],
    restPoleL: [-1, 0, -0.3],
    restPoleR: [1, -1, -1],
    rest: holdTurn(1, -13, holdTurn(-10, 30)),
    restShift: [-0.01, 0.02, -0.03],
  },
} as const satisfies Readonly<Record<WindInstrument, WindHold>>;

/**
 * The flute hold of the tan fox (design 5.3), the hold of a real flutist. The head turns 30° to the
 * left while the fox plays, as Debost writes, and the flute lies 9° back from square to the face,
 * 8° down to the right ({@link FOX_FLUTE_BACK}). The embouchure hole sits at the lower lip, 0.1 H
 * below the mouth of the body and 0.125 H back under the long muzzle (`lipShift`), and the lip
 * plate presses the lips and the chin about 0.5 cm, as a real flutist rests the lip plate against
 * the chin under the lower lip (`docs/reference/wind-technique.md` 2.4). Further back, the plate
 * goes deeper into the face before the hole reaches the lip. The shoulders stay low, with no
 * forward turn of the right shoulder. The left shoulder bone turns 20° forward (`reachL`), as the
 * shoulder blade of a real player slides forward when the left arm reaches across the body: with a
 * square left shoulder, the root of the left upper arm of the Tripo fox goes 2.4 cm into the
 * shoulder in each play sample, and with 10°, 1.6 cm. The left elbow points down and out, and the
 * right elbow down, out, and a little forward, as a seated flutist lets the arms hang
 * (`docs/reference/wind-technique.md` 2.4).
 *
 * Each palm faces the flute, and the fingers curl over it (`faceTube`, `gripCurl`), as a real
 * flutist curves the fingers over the keys (`docs/reference/wind-technique.md` 2.4). The left paw
 * holds the flute near the lip plate from its front and a little below, with the back of the paw to
 * the audience: its grip moves from the grip of the instrument, 2.5 cm below the axis, 0.08 H
 * across the tube to its front (`gripShiftL`), and its finger tips touch the flute in each play
 * sample (`pnpm wind-grip flutist`). With 0.12 H, the paw lay 0.8 cm off the flute and its finger
 * tips 1.5 cm off. With 0.04 H, the middle of the paw lies below the flute, 75° from its front,
 * and the finger tips stand 1.3 cm off. The paw points half up across
 * the flute (`aimSide`), so that its fingers come over the top onto the keys. It also faces the
 * flute in the play, although it leaves its grip at rest. The right paw holds the body of the flute
 * as the right hand of a flutist: its middle lies behind the flute and a little below, its palm
 * faces the flute and the audience, and it points up past the back of the flute (`aimSide` below
 * 0), so that the curled fingers come over the top onto the keys, and the thumb side lies under the
 * flute (`gripShiftR`). A real flutist turns the right palm away from the body
 * (`docs/reference/wind-technique.md` 2.4). Each paw has the side sign of the accepted grip
 * (`aimSigns`), as the shared hold has. The right paw of the fox lies nearly in the plane of its
 * shoulder and its tube, and the short arms of the Tripo fox turned the sign from the geometry of
 * the right paw from -1 to 1. With that sign, the side aim turned the right paw down to the front,
 * the palm faced up under the flute, and the back of the paw faced the floor. With the paw below
 * the flute and the side aim to the front, the flute lies in the palm as in a left hand, and the
 * paw turns 180° on its forearm in the lift and the lowering. With
 * the right elbow out to the side, the paw swing reaches 45°, and with the elbow a little back, the
 * right upper arm goes 1.5 cm into the body in the moves.
 *
 * In the rest pose, the flute stands nearly upright at the right side with the foot joint down on
 * the top of the right thigh, as a real flutist rests it vertically on the right leg with the right
 * hand on the right-hand keys (George, `docs/reference/wind-technique.md` 2.4). The foot touches
 * the skin of the thigh top, 0.8 cm deep at most (`pnpm hold-fit flutist`). With the rest move
 * (0.668, -0.758, 0.313), the foot hung beside the right thigh at the seat edge. The closed right
 * paw holds it 0.376 H nearer to the lip plate than in the play, about 0.2 m below the lip plate on
 * the upper body of the flute, with its fingers on the tube (`restGripShiftR`, `restAim` 0). The
 * lift moves the right grip around the flute (`gripAround`): on a straight line, the grip crosses
 * the axis of the tube, and the paw turns 180° in one frame. With the roll of the play at rest, the
 * paw passes through the tube at the end of the lift and turns 175°. The elbows point down, a
 * little out, and back at rest. The left paw leaves its grip ({@link WindHold.restFreeL}) and rests
 * on the top of the left haunch. A standing fox hangs the left arm with a small bend of the elbow
 * ({@link FOX_HANG}), and the hanging paw turns 150° around its long axis (`hangRoll`), so that
 * the palm faces the side of the leg. With no turn, the hanging left paw twisted 138° on its
 * forearm and the forearm 70° (`pnpm arm-check flutist`, p95 in the rest of the flute concerto),
 * and with 150°, 35° and 19°. With 90°, they twisted 53° and 27°.
 *
 * A real flutist can rest the free hand on the thigh, but the top of the left thigh of the fox is
 * out of reach of the left arm. The wrist reaches 0.338 m from the shoulder joint, and the top of the thigh lies
 * about 0.45 m below the joint. So the paw rests on the top of the haunch near the hip, as near to
 * the thigh as the arm reaches. The paw hangs in line with the forearm, with no bend at the wrist,
 * and turns 130° around its long axis from the forearm (`palm`, `fingers`), as a relaxed hand hangs
 * from a loose arm (`docs/reference/wind-technique.md` 2.4). The left paw turn of the fox chain
 * fits the violin, so at that turn the skin of the paw is nearest to its bind. With the palm toward
 * the body and the front and the fingers down, the paw bent down at the wrist and twisted 77° on
 * its forearm (`pnpm arm-check flutist`, p95 at rest), and the forearm 41°. In line with the
 * forearm, the paw twists 124° with no turn, 47° with 80°, 27° with 120° and 140°, and the
 * forearm 14° to 15°.
 * The palm lies 0.336 H above, 0.158 H out from, and 0.07 H behind the lap place, the top of the
 * thigh at 0.45 of the way to the knee. The palm then touches the skin (0.1 cm) at 0.905 of the
 * reach of the arm. At a rest place out of reach, the arm stays straight in the lift until the paw
 * comes into reach. The elbow then folds in a few frames, and the forearm turned 2219° each second.
 * Now each bone of the left arm turns at most 465° each second in the lift. The wrist passes in
 * front of the belly (`arc`). The path from the rest place to the lip plate still leaves the
 * reach in the middle of the move, so the elbow keeps a bend there (`moveReach`): with no limit,
 * the arm was straight over most of the lift, and the elbow folded 11° in one step of 0.01 s. The rest elbow points out and back, (-0.5, -1, 0.6): with (-0.3, -1,
 * 0.7), the left upper arm went 1.8 cm into the body at rest and 2.5 cm in the lift. With
 * (-0.6, -1, 0.4), the upper arm rolled 34° at rest, against 28°.
 *
 * The arms of the hand rig of the Tripo P2 fox (design 4.4, "Hand rig") take each turn of the paw
 * on two parts: the roll of the upper arm and the twist of the forearm. Each part takes 39°
 * or less in each moment of the flutist and the violinist, so that the skin does not twist into a
 * thin neck. The right paw points a part of the way up past the back of the flute (`aimSide`
 * -0.45, with the side sign -1 of `aimSigns`), and the right elbow points out and a little down in
 * the play, (1.2, -0.4, -0.3), as the right elbow of a flutist stays out from the side. The palm
 * then faces the audience behind the flute, the paw points up, and the digits curl over the top
 * onto the keys (`pnpm wind-grip flutist`: the palm 52° from the axis, a grasp in 74 % of the play
 * samples). The forearm twists 39°, and the paw twists 79° and bends 51° on its forearm (p95 of
 * `pnpm arm-check flutist`). With the side sign 1 and the share -0.3, the palm faced up, the
 * forearm twisted 50°, and the paw 100°. With the share -0.5, the paw bent 57°, and with -0.6, 70°,
 * the limit. With -0.4, the palm turned 58° from the axis. The elbow (1.2, -1.4, -0.3) twisted the
 * forearm 48°.
 * The fingers curl 90° and 85° around the flute (`gripCurl`):
 * with 115° and 106°, the short paws of the mesh fold 13 to 23 faces in each play sample. The right
 * rest elbow points back, (0.8, -1, 0.3), so
 * that the right upper arm takes about half of the turn at rest: with (0.8, -1, 0.6), the right
 * forearm twisted 55° on the first Tripo fox. The rest grip of the right
 * paw keeps the distance of the play grip from the axis of the tube (`restGripShiftR`). The right
 * palm then faces the flute at rest (9°), and the right paw turns at most 401° each second in the
 * lift. With the rest grip 0.1 H nearer to the axis, the paw turned 748° each second.
 *
 * The rest values in H (`restShift`, `restGripShiftR`, and the lap offset of `restFreeL`) keep the
 * rest of the arms in meters when the head of the body grows. They are the values of the head
 * height 0.323 m times 0.835, for the head height 0.387 m of the larger head. With the old values,
 * the rest moved the flute 20 % further out, and the right forearm twisted 47°.
 */
const FOX_FLUTE = {
  ...WOODWIND,
  headTurn: FOX_HEAD_TURN * MathUtils.DEG2RAD,
  reachL: 20 * MathUtils.DEG2RAD,
  lipShift: [0, -0.1, 0.125],
  play: fluteTurn(FOX_HEAD_TURN - FOX_FLUTE_BACK, 8),
  poleL: [-1, -1, -0.3],
  poleR: [1.2, -0.4, -0.3],
  rest: holdTurn(0, -15, fluteTurn(0, 80, [0, 0, -1])),
  restShift: [0.62, -0.5, 0.32],
  restPoleL: [-0.5, -1, 0.6],
  restPoleR: [0.8, -1, 0.3],
  restFreeL: {
    lap: { along: 0.45, offset: [-0.158, 0.336, 0.07] },
    palm: [-0.29, 0.37, -0.88],
    fingers: [-0.01, -0.92, -0.38],
    arc: [0.1, 0.1, 0.4],
    hang: {
      forward: FOX_HANG[0] * MathUtils.DEG2RAD,
      bend: FOX_HANG[1] * MathUtils.DEG2RAD,
    },
    hangRoll: 150 * MathUtils.DEG2RAD,
    moveReach: 0.9,
  },
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.5, -0.45],
  aimSigns: [-1, -1],
  gripShiftL: [-0.04, 0, 0.08],
  gripShiftR: [0, 0, -0.14],
  restGripShiftR: [-0.376, 0, -0.067],
  gripCurl: curls(90, 85),
  gripAround: true,
} as const satisfies WindHold;

/**
 * The turns of the trombone hold of the panda while it plays, in degrees (design 5.3). The slide
 * points 10° to the right of straight ahead and 40° below the level, toward the audience
 * (`docs/reference/wind-technique.md` 1.1). The arms of the Tripo panda are short for its big round
 * head and belly: the mouth is 0.21 m in front of the right shoulder joint and 0.25 m above it. The
 * upper arms and the forearms of the mesh are 1.2 times those of the source
 * (`assets/models/panda/README.md`), so that the arm reaches 0.488 m in place of 0.417 m. On the
 * trombone of the app, the right arm then reaches 0.125 m of the slide travel with the slide 40°
 * below the level (`pnpm hold-reach panda --instrument trombone`), and 0.095 m at 35°. With the
 * arms of the source, it reached 0.03 m at 35°, with the paw beside the slide. With the slide 20°
 * to the right, the bell stood at the right knee.
 *
 * A chest that leans forward or turns in the far positions adds no reach: the head and the
 * mouthpiece follow the chest, so the shoulder and the slide move together.
 */
const PANDA_PLAY = {
  /** The turn of the slide to the right of the panda, around the mouthpiece. */
  right: 10,
  /**
   * The turn of the slide down around the mouthpiece, after the turn right, from the 15° below
   * the level of the bind pose.
   */
  down: 25,
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
 * head puts the mouth of the panda far in front of its shoulder joints, so with the slide straight
 * ahead, the right arm reaches none of the travel. While the panda plays, the slide turns to its
 * right around the mouthpiece and points down toward the audience ({@link PANDA_PLAY}), never down
 * to the floor (`docs/reference/wind-technique.md` 1.1). The short tuning slide (`TROMBONE_BACK` of
 * `models/instruments/brass.ts`) keeps the bell section out of the head. The right shoulder turns
 * 70° forward (`reach`), 25° more than in {@link WIND_HOLDS}. A turn of more than 70° adds no reach.
 *
 * The panda plays the trombone of the app, 0.83 m long, 0.49 of the height of the seated panda.
 * With the smaller trombone of 0.75, it read as a toy beside the clarinets and the flutes around it.
 *
 * The left palm faces the inner slide tubes at the hand brace, and the right palm the upright
 * slide brace (`faceTube`, `InstrumentGrips.tubeL` of `models/instruments/brass.ts`), as the left
 * hand of a real trombonist holds the braces a hand width in front of the mouth and the tips of the
 * right thumb and the first two fingers hold the slide brace
 * (`docs/reference/wind-technique.md` 1.1). The left grip lies on the hand brace
 * (`TROMBONE_HAND_BRACE`), 0.02 H toward the tubes, and its fingers curl 130° around the tubes and
 * the brace (`gripShiftL`, `gripCurl`). The mouthpiece and its receiver then show between the lips
 * and the paw, and the paw stays below the chin. With the grip 2.5 cm from the brace of the old
 * trombone, 10.5 cm from the rim, the paw lay against the chin and hid the lower lip. With
 * 0.07 H toward the tubes, the middle of the paw lay on the axis of the tubes and the finger tips
 * stood 3 cm off them. The right paw closes around the slide brace from the right side of the
 * panda, with its palm to the left and its thumb up the brace, as a real trombonist puts the thumb on the top of
 * the brace and the fingers below it, with two fingers beneath the lower slide tube
 * (`docs/reference/wind-technique.md` 1.1). Its grip moves 0.11 H down the brace, to 2 cm below
 * the lower slide tube, and 0.02 H away from the brace (`gripShiftR`), and the fingers curl 120°.
 * The brace and the two slide tubes then go through the closed paw, so that the paw holds the
 * slide at its brace in each position and at rest. With the grip 0.2 H down the brace and 0.05 H
 * away from it, the paw was a fist below and beside the slide, and the slide tubes passed in
 * front of its knuckles. In the first position, the right paw lies below and in front of the left
 * paw, and the two paws touch. Both paws grasp their tubes in each sample
 * (`pnpm wind-grip trombonist`). The paw points 0.8 of the way along the slide (`aimSide`). Both
 * paws keep the aim and the roll of the play at rest (`restAim`).
 *
 * The elbows stay away from the sides of the body, as a brass player keeps space between the elbows
 * and the sides (`docs/reference/wind-technique.md` 1.8). The left elbow turns out about the line
 * from the shoulder joint to the grip (`poleL`), and the right elbow points out to the side, 1.5
 * out for each 1 down (`poleR`), so that the right upper arm stays off the round belly: with 0.2
 * out, it went 2.6 cm into the body. The left shoulder turns 35° forward, as the shoulder blade of
 * a real player slides forward when the arm reaches forward, so that the left arm root moves off
 * the front of the chest.
 *
 * The middle of the right paw lies at the right side of the brace, so the right arm reaches a small
 * part of the slide travel of 0.55 m. A real seventh position is 0.57 m from the first position
 * (`docs/reference/wind-technique.md` 1.2), so the slide positions map into the reached travel
 * ({@link reachedShare}): the slide moves 3.8 cm in the second position, 9.4 cm in the fourth,
 * and 12.5 cm in the seventh.
 *
 * The mouthpiece rim rests on the lips, as the rim of a real trombonist
 * (`docs/reference/wind-technique.md` 1.1): it moves 0.057 H down and 0.065 H back from the mouth
 * of the body (`lipShift`).
 *
 * In the rest pose, the trombone stands upright in front of the body, below the mouth, with the
 * slide down and 16° forward of the vertical (`rest`, {@link PANDA_PLAY}), as a seated player holds
 * the slide vertical in front of the knee (`docs/reference/wind-technique.md` 1.7). It moves 0.22
 * H forward and 0.1 H down from the mouthpiece on the lips (`restShift`), so that the short arms
 * reach their grips: at 0.425 H forward, the left paw missed its grip by 6.4 cm. Both paws keep the
 * aim and the roll of the play on the instrument (`restAim`), so that the lift and the lowering
 * turn each hand with the trombone. At rest, the left grip stays on the hand brace and moves
 * 0.04 H toward the tubes (`restGripShiftL`), so that the finger tips stay on the tubes. With the left grip
 * 0.075 H along the tubes from the old brace, the left paw touched the right paw at rest. The
 * elbows point out and down at rest (`restPoleL`, `restPoleR`): the right
 * elbow 1.2 out for each 0.7 down, so that the right upper arm keeps near the belly and rolls at
 * most 44°. Further out, it rolled 47°. A real player never rests the trombone on the slide, and
 * the slide end and the bell stay off the floor (`docs/reference/wind-technique.md` 1.7).
 */
const PANDA_TROMBONE = {
  ...WIND_HOLDS.trombone,
  reachL: PANDA_PLAY.shoulderL * MathUtils.DEG2RAD,
  play: PANDA_PLAY_TURN,
  rest: holdTurn(-PANDA_PLAY.restDown, 0),
  restShift: [0, -0.1, -0.22],
  poleL: [-0.6, -0.4, -0.7],
  poleR: [1.5, -1, 0],
  restPoleL: [-1.4, -1, -0.3],
  restPoleR: [1.2, -0.7, 0],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.8, 0.8],
  gripShiftL: [0, 0.02, 0],
  gripShiftR: [0.11, -0.02, 0],
  reach: 70 * MathUtils.DEG2RAD,
  restGripShiftL: [0, 0.04, -0.01],
  restAim: 1,
  gripCurl: curls(130, 120),
  lipShift: [0, -0.057, 0.065],
} as const satisfies WindHold;

/**
 * The mouth share that the oboe hold of the mouse fits (`WindHold.farMouth`). The Tripo mouse has
 * a mouth share of 1.32, so the head bows 15° on the chest in the play (`headBow()` of
 * `pose/far-mouth.ts`), as a real oboist bows the head a little to the reed. The reed comes down
 * and back with the mouth, and the oboe turns with the head, so the paws hold it below the
 * shoulders, with the elbows bent and down. With the head up, the paws held the oboe at the height
 * of the shoulders, and the arms pointed straight forward. With the oboe then turned 15° or 27°
 * forward, to 33° or 45° from the vertical, the right paw missed its grip by 1.0 cm or 3.1 cm
 * (`pnpm hold-fit oboist`).
 */
const MOUSE_OBOE_FIT = 1.067;

/**
 * The oboe hold of the mouse (design 5.3), the hold of a real oboist
 * (`docs/reference/wind-technique.md` 2.3). The mouth point of the body lies under the tip of the
 * nose, about 1.8 cm in front of the lips, so the reed tip sits 0.13 H further back and 0.005 H
 * lower than that point (`lipShift`): the reed goes about 1 cm between the lips at the front of the
 * muzzle, on the middle line, as a real oboist puts the reed at the middle of the lips. With the
 * reed tip 0.23 H back, the reed went into the underside of the muzzle 5.1 cm behind the mouth
 * point, and from the front left it stood at the corner of the mouth. The oboe hangs 30° from
 * the vertical, as in {@link WIND_HOLDS}, a little nearer to the body than the 40° to 45° of a real
 * oboist. The reed at the front of the long muzzle stands 11 cm in front of the right shoulder
 * joint, so at 40° the right paw grasped the oboe in 14% of the play samples, and at 35° it reached
 * its grip with 0.3 cm to spare, with a straight arm (`pnpm hold-fit oboist`). The small mouse
 * plays a smaller oboe (`SpeciesParams.oboeScale`), so that its short arms reach the grips. As on
 * a real oboe, the left paw holds the upper joint at its tone holes, and the right paw holds the
 * lower joint at its tone holes, above the bell, with a gap between the paws: the right grip
 * moves 0.08 H and the left grip 0.02 H up the tube from the grip of {@link WIND_HOLDS}
 * (`gripShiftL`, `gripShiftR`). With 0.08 H, the middle of the left paw lay 6.5 cm from the reed
 * tip, on the holes from 6 cm to 9 cm. The middle of the right paw lies 15.6 cm from it, on the
 * holes from 13.5 cm to 16.5 cm (`pnpm wind-grip oboist`). With the right grip 0.05 H down the
 * tube, the right paw lay 1.8 cm below its lowest hole, at the top of the bell. With the left grip
 * 0.06 H up the tube, the paws came within 0.3 cm of each other. Each grip also moves 0.06 H
 * toward the axis and 0.05 H across it toward the shoulder of its paw, so that each paw holds the
 * tube from its own side. The arms of
 * the Tripo mouse reach 0.18 m from the shoulder joint to the wrist, so each shoulder bone turns
 * forward (`reach` 70° on the right, `reachL` 45° on the left), as the shoulder blades of a real
 * player slide forward. With the 20° and 0° of {@link WIND_HOLDS} and the right grip 0.15 H down,
 * the left paw missed its grip by 2.7 cm and the right paw by 5.2 cm in the play
 * (`pnpm hold-fit oboist`), and the left upper arm went 2.3 cm into the shoulder. Each paw aims
 * across the tube (`aimAcross`) with no side aim (`aimSide`), each palm faces the tube
 * (`faceTube`), and the fingers curl 120° (left) and 100° (right) over its front
 * (`gripCurl`). The thumbs then point up the oboe to the reed, as an oboist curves the fingers over
 * the keys with the thumb behind the tube (`docs/reference/wind-technique.md` 2.3). Both paws grasp
 * the oboe in each sample of the play, the lift, and the rest (`pnpm wind-grip oboist`). With a
 * left curl of 110°, the tips of the short left digits of the Tripo mouse stood 0.9 cm off the
 * tube at rest, and the left paw grasped it in no rest sample. With a right curl of 90°, the right
 * paw grasped it in no rest sample. With 130° and 110°, the digits folded 4 more faces of the left
 * paw and 2 more of the right paw at rest (`pnpm hold-fit oboist`). With the grips behind the tube
 * and a side aim of half, each paw lies behind the tube with its palm to the audience and its thumb
 * down the oboe.
 * With the left grip on the axis (0.04 H toward it), the roll to the tube has no direction, and the
 * paw turns over. With 70° on the right, the right arm folds 15 faces at p95 of the play, and the
 * left arm 18 (`pnpm arm-check oboist`, limit 8): the curled digits and thin faces at the arm root.
 *
 * In the rest, the oboe stands upright in front of the belly, 0.29 H below the mouth point, as a
 * real oboist holds it vertical in a short rest. The rest place moves by the opposite step of the
 * reed (`restShift`), so the rest pose stays when the reed moves. Both paws stay on their grips of
 * the play, the left paw on the upper joint and the right paw on the lower joint, with a clear gap
 * between them, so that the lift and the lowering move the oboe with the paws, and no paw slides
 * along the tube.
 * With the grips of the play, the oboe 0.45 H below the mouth puts an arm 1.3 cm to 1.9 cm into
 * the body. Both paws keep the aim and the roll of the play (`restAim`): with the roll of the
 * shoulder, the left paw turns 177° on its forearm at rest and flips in the lowering. The left
 * elbow points out, down, and forward, and the right elbow out, down, and a little back
 * (`restPoleL`, `restPoleR`), so that the left paw turns 134° on its forearm at rest and the right
 * paw 121°. With the left elbow further down or forward, the left palm turns more than 60° from
 * the tube, and the paw does not grasp it (`pnpm wind-grip oboist`). With the right elbow further
 * down, the right upper arm goes 0.8 cm into the body (0.6 cm with this elbow).
 *
 * The big head puts the mouth about 0.11 m above the shoulder joints, so the grips are near the
 * height of the shoulders. While the mouse plays, the right elbow points down, out, and forward,
 * as an oboist drops the wrists and keeps the arms a little away from the sides. With the elbow of
 * the right arm of {@link WIND_HOLDS} out and level, the right upper arm turns 83° from its bind
 * direction and the paw 160° from the forearm, and the upper arms show as flat twisted bands.
 * The left elbow points down and a little out (`poleL`), as a real oboist lets the arms hang
 * loosely from low shoulders with the elbows a little free from the body
 * (`docs/reference/wind-technique.md` 2.3): the left upper arm hangs about 33° below the level,
 * and the left paw keeps its grip on the upper joint. With the elbow out and a little down, as at
 * rest, the left upper arm stands 3.5° below the level, and from ±35° and from the back the left
 * arm looks like a raised wing.
 *
 * The head bows 15° in the play ({@link MOUSE_OBOE_FIT}). The left grip moves only 0.02 H up the
 * tube (`gripShiftL`), so that the reed and the top of the upper joint show between the lips and
 * the left paw: with 0.08 H, the left thumb lay at the lips over the reed. At rest, the left elbow
 * points down and a little out and forward (`restPoleL`, (-0.8, -1, -0.7)): with (-1, -0.75, -1),
 * the elbow stood out to the side as a cone from the back left. With (-0.5, -1, -0.3) or
 * (-0.7, -1, -0.5), the left paw grasped the oboe in no rest sample (`pnpm wind-grip oboist`).
 * The oboe of 0.6 put the right paw 0.5 cm out of reach (`pnpm hold-fit oboist`), so the mouse
 * keeps the oboe of 0.5.
 */
const MOUSE_OBOE = {
  ...WIND_HOLDS.oboe,
  reach: 70 * MathUtils.DEG2RAD,
  reachL: 45 * MathUtils.DEG2RAD,
  farMouth: MOUSE_OBOE_FIT,
  lipShift: [0, -0.005, 0.13],
  rest: holdTurn(-30, 0),
  restShift: [0.1, -0.285, 0.05],
  restPoleL: [-0.8, -1, -0.7],
  restPoleR: [1.5, -0.75, 0.25],
  poleL: [-0.5, -1, 0],
  poleR: [0.5, -1, -0.5],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  gripShiftL: [-0.02, 0.06, -0.05],
  gripShiftR: [-0.08, 0.06, -0.05],
  restAim: 1,
  gripCurl: curls(120, 100),
} as const satisfies WindHold;

/** The forward turns of the shoulder bones of the bassoon beaver while it plays, in degrees. */
const BEAVER_SHOULDER_TURN = {
  /**
   * The left shoulder. With 30°, the left paw missed its grip on the wing joint by 0.6 cm in the
   * play. The turn of {@link BEAVER_PLAY_TURN} moves the wing joint forward: with 35°, the left
   * paw then grasped the wing joint in no play sample, and with 40°, it grasps it in each sample.
   * With 45°, the left paw grasped the wing joint in no rest sample.
   */
  left: 40,
  /**
   * The right shoulder. The short arms of the Tripo beaver reach the boot joint only when the
   * shoulder slides forward: with 20°, the right paw misses its grip by 6.5 cm on a bassoon of
   * 0.6, with 35° by 3.1 cm. On the bassoon of 0.7, with 40°, it misses its grip by 1.2 cm.
   */
  right: 55,
} as const;

/**
 * The turn of the bassoon of the beaver while it plays, relative to the chest, in degrees: the
 * lower end 18° forward and 10° to the right from the bind pose of `woodwindRotation()` of
 * `models/instruments/woodwinds.ts`, which leans the tube 35° to the left, then the left side 25°
 * forward around the vertical. The boot joint comes forward of the round belly: with the lower end
 * 18° further back, the boot of a bassoon of 0.8 went 8 cm into the belly.
 *
 * At the height of the left eye, the long joint passes 11.3 cm to the left of the eye and 25.5 cm
 * in front of it (`scratch/rfix-wind/bassoon-eye.ts`), as the bell of a real bassoonist rises at
 * the left of the line of sight (`docs/reference/wind-technique.md` 3). From the front left (the
 * check view of the app, 40° to the left of the front), the tube then crosses the muzzle in front
 * of the eye, and from the left side it stands clear in front of the snout. With no turn around
 * the vertical and the lower end not turned to the right, the tube passed 11.6 cm to the left and
 * 12.8 cm in front of the eye, on the line of sight through the eye from the front left. It then
 * crossed the cheek next to the eye, and from the left side it stood in front of the snout. A turn
 * to the right alone moves the tube further to the left (15.7 cm with 10°), but from the front
 * left it then crosses the cheek behind the eye. With 20° forward around the vertical and 5° to
 * the right, the bell top crossed the eye from the front left. The bell top stands 7.9 cm below
 * the top of the head, above the eyes. The turn forward around the vertical also moves the boot
 * joint nearer to the right shoulder.
 */
const BEAVER_PLAY_TURN = {
  /** The turn of the lower end forward, around x. */
  forward: 18,
  /** The turn of the lower end to the right, around z, after `forward`. */
  right: 10,
  /** The turn of the left side forward around the vertical, after the other turns. */
  leftForward: 25,
} as const;

/** The turn of the bassoon of the beaver while it plays ({@link BEAVER_PLAY_TURN}). */
const BEAVER_PLAY = toQuat(
  new Quaternion()
    .setFromAxisAngle(Y_AXIS, -BEAVER_PLAY_TURN.leftForward * MathUtils.DEG2RAD)
    .multiply(new Quaternion(...holdTurn(BEAVER_PLAY_TURN.forward, BEAVER_PLAY_TURN.right))),
);

/**
 * The turn of the bassoon of the beaver at rest, relative to the chest: the lower end 20° to the
 * right from the bind pose of `woodwindRotation()`, so that the bassoon lies 56° from the vertical
 * across the belly, flatter than in the play ({@link BEAVER_PLAY}).
 */
const BEAVER_REST = holdTurn(0, 20);

/**
 * The bassoon hold of the beaver (design 5.3), the hold of a real bassoonist
 * (`docs/reference/wind-technique.md` 3): the bassoon lies diagonal in front of the body, the left
 * paw above the right paw, and the bocal brings the reed to the mouth at a nearly level angle. The
 * bassoon crosses the body from the right hip up past the left shoulder, with the bell above the
 * head ({@link BEAVER_PLAY}). The reed lies near the tube (`BASSOON_REED` of
 * `models/instruments/woodwinds.ts`), so that the long joint passes beside the head in place of in
 * front of the eye, and the left side of the bassoon turns forward ({@link BEAVER_PLAY_TURN}), so
 * that from the front left, the long joint crosses the muzzle in front of the eye.
 *
 * The Tripo beaver stands on short legs with no chair, and its arms are short: 0.20 m from the
 * shoulder joint to the wrist joint. So it plays a small bassoon (`SpeciesParams.bassoonScale`),
 * and each shoulder bone turns forward ({@link BEAVER_SHOULDER_TURN}), as the shoulder blade of a
 * real player slides forward when the arm reaches forward. The bell top stands 7.9 cm below the
 * top of the head: a larger bassoon puts the boot joint out of the reach of the right arm or into
 * the belly. The arms are round tubes free of the
 * trunk, as a real bassoonist keeps the elbows a little away from the body: the left elbow points
 * out, down, and a little back, and the right elbow out, down, and forward. At rest, the left elbow
 * points further out, and the right elbow out and a little down. With the left elbow less far out,
 * the left paw twists 23° on its forearm in the play, against 8° now.
 *
 * At rest, the bassoon moves 0.3 H to the left, 0.2 H forward, and 0.1 H lower (`restShift`),
 * and it turns flatter across the belly ({@link BEAVER_REST}), so that the reed leaves the mouth
 * by 0.37 H, to the left below the chin, and both paws keep their grips. A real bassoonist takes
 * the bocal out of the mouth and lowers the bassoon (`docs/reference/wind-technique.md` 3). The
 * short arms do not reach a rest lower than 0.15 H below the mouth with the bassoon in front of
 * the belly. With the right paw alone on the bassoon upright at its side and the left arm
 * hanging, the bassoon went through the head in the lift and 13.6 cm into the right thigh in the
 * lowering. The left paw holds the wing joint high, and the right grip moves 0.3 H up the boot
 * joint (`gripShiftR`): with 0.15 H, the right arm did not reach the boot of the bassoon of
 * 0.7. At rest, the left grip moves 0.02 H further across the tube toward the left shoulder
 * (`restGripShiftL`): with the grip of the play, the left finger tips stood 0.6 cm off the wing
 * joint at rest, and the left paw grasped it in no rest sample. Each grip moves toward the axis and to the side of its own shoulder, the left
 * grip 0.1 H toward the axis and 0.1 H across it toward the left shoulder, and the right grip
 * 0.15 H toward the axis and 0.14 H across it toward the right shoulder. The boot joint holds
 * both bores, so it is wider than the wing joint: with the right grip 0.25 H up and 0.08 H
 * across, the right claws went 1.5 cm to 1.6 cm into the boot at rest, in the lift, and in the
 * lowering, and now they go 1.1 cm (`pnpm pose-depth bassoonist`). Each palm then faces the
 * tube from its own side (`faceTube`), each paw aims a quarter toward the side across the tube
 * (`aimSide`), the fingers curl over its front (`gripCurl`), and the thumbs point up the bassoon,
 * so that both paws grasp it in each sample (`pnpm wind-grip bassoonist`).
 *
 * The big front teeth hang in front of the lower lip, so the reed tip sits 0.2 H lower, 0.15 H
 * further back, and 0.06 H further left than the mouth of the bind pose (`lipShift`): at the
 * height of the tooth roots, between the lips at the left of the left tooth, as the reed of a
 * real bassoonist goes straight into the mouth (`docs/reference/wind-technique.md` 3). The end of
 * the bocal comes from the front left (`BOCAL_END` of `models/instruments/woodwinds.ts`), so it
 * stays beside the teeth, and the thread of the reed shows at the lips. The reed of the drawing
 * moves by the opposite step (`BASSOON_REED`), so the tube and the grips keep their place in the
 * play. With the reed tip 0.28 H back on the middle line, the reed lay behind the teeth, and the
 * bocal read as a short vertical wire that ended at the front tooth.
 *
 * The right fingers curl 120° around the boot joint, and the left fingers 110° around the wing
 * joint. With 100°, the left paw grasped in no rest sample.
 */
const BEAVER_BASSOON = {
  ...WIND_HOLDS.bassoon,
  reach: BEAVER_SHOULDER_TURN.right * MathUtils.DEG2RAD,
  reachL: BEAVER_SHOULDER_TURN.left * MathUtils.DEG2RAD,
  lipShift: [-0.06, -0.2, 0.15],
  play: BEAVER_PLAY,
  rest: BEAVER_REST,
  restShift: [-0.3, -0.1, -0.2],
  poleL: [-1.2, -1, 0.2],
  poleR: [1, -1, -0.5],
  restPoleL: [-1.6, -1, 0],
  restPoleR: [1, -0.5, 0],
  faceTube: ['palm', 'palm'],
  aimAcross: 1,
  aimSide: [0.25, 0.25],
  gripShiftL: [0, 0.1, -0.1],
  restGripShiftL: [0, 0.1, -0.12],
  gripShiftR: [0.3, 0.15, -0.14],
  restAim: 1,
  gripCurl: curls(110, 120),
} as const satisfies WindHold;

/**
 * The horn hold of the pig (design 5.3), the hold of a real hornist
 * (`docs/reference/wind-technique.md` 2.2): the left hoof on the valve levers at the middle of the
 * body, below the face, the right hoof in the bell, and the horn across the body from the mouth to
 * the bell at the right of the torso. The mouthpiece rests on the lips under the snout disc
 * (`StudioBody.mouth`). The snout puts the mouth 0.31 m in front of the shoulder joints and 0.2 m
 * above them, and the arms of the Tripo pig are 0.3 m long. So the horn is the horn of
 * {@link WIND_HOLDS}, whose form fits these arms (`HORN`, `HORN_PLANE` of
 * `models/instruments/brass.ts`): the top of the coil is 7 cm below the mouth, at the height of the
 * chin, and the bell opens back, to the right, and a little up at the height of the chest. A bell
 * at the right thigh is out of the reach of the right arm.
 *
 * The left shoulder turns 46° forward and the right shoulder 20° (`reachL`, `reach`), as the
 * shoulder blades of a real player slide forward. The left hoof then reaches the levers with 7 cm
 * to spare, and the right hoof the bell with 9 cm (`pnpm hold-fit hornist`). The left elbow points
 * out and a little forward, and the right elbow out, back, and a little down, as a horn player
 * keeps both arms away from the rib cage (`docs/reference/wind-technique.md` 2.2). The right
 * forearm then goes into the bell at 30° from its axis.
 *
 * The left grip moves 0.05 H across the lever tips, away from the left shoulder, and 0.02 H toward
 * them (`gripShiftL`), so that the hoof lies beside the valve casings and its toes rest on the
 * levers, as the left fingers of a real hornist lie on the valve levers
 * (`docs/reference/wind-technique.md` 2.2). The hoof then grasps the lever line in each play
 * sample (`pnpm wind-grip hornist`). On the grip of the instrument, the two toes went into the
 * loops of the valve slides, one slide tube lay in the cleft, and the hoof grasped the lever line
 * in 27% of the play samples.
 *
 * The right hoof lies in the bell near its axis, with its tip about 8 cm in the bell, and 95% of
 * its skin is in the bell (`HORN.palm`). It points 1.5 times more along the axis of the bell than
 * the line from the shoulder (`aimAcross`): with that line, the hoof went 0.6 cm through the wall
 * of the bell. The back of the hoof faces the axis (`faceTube`), so the hoof twists 16° on its
 * forearm. With the palm to the axis, it twisted 166°.
 *
 * At rest, the horn comes down 0.45 H in front of the round belly, 0.1 H forward and 0.05 H to the
 * right, with the turn of {@link HORN_REST_TURN}. The bell then hangs beside the right thigh, and
 * the mouthpiece is below the chin. Both hooves keep their hold. The left rest elbow points out
 * and up, (-1, 0.6, -0.7), so that the left upper arm lies on the side of the belly: with a lower
 * elbow, the upper arm went 1.7 cm into the shoulder (limit 1.5 cm).
 */
const PIG_HORN = {
  ...WIND_HOLDS.horn,
  reach: 20 * MathUtils.DEG2RAD,
  reachL: 46 * MathUtils.DEG2RAD,
  poleL: [-1, 0.05, -0.5],
  poleR: [1, -0.3, 0.4],
  restPoleL: [-1, 0.6, -0.7],
  restPoleR: [1, -0.3, 0.4],
  gripShiftL: [0, 0.02, 0.05],
} as const satisfies WindHold;

/**
 * The turn of the lower end of the clarinet of the wolf forward while it plays, in degrees, from
 * the 25° of {@link WIND_HOLDS}. The value below 0 turns the lower end back toward the body.
 */
const WOLF_CLARINET_FORWARD = 10;

/**
 * The clarinet hold of the wolf (design 5.3), the hold of a real clarinetist
 * (`docs/reference/wind-technique.md` 3): the clarinet at the middle of the body, from the mouth to
 * between the knees. The clarinet turns its lower end {@link WOLF_CLARINET_FORWARD}° forward from
 * {@link WIND_HOLDS}, to 35° from the vertical, so that the bell comes forward over the knees. A
 * real clarinetist holds it at about 45°, but the long muzzle already puts the mouthpiece far in
 * front of the chest: at 45°, the bell is far in front of the knees, and the arms do not reach the
 * grips. The wolf of `orchestra-latest.png` and `orchestra-side.png` holds it at 24° and 28° in the
 * image, and a render of the app from the camera of the images shows 30° as 25°.
 *
 * Each paw closes around the body of the clarinet from the side of its own shoulder, as a
 * clarinetist curves the fingers over the tube with the thumb behind it: the left paw on the upper
 * joint and the right paw on the lower joint, below the thumb rest. Each palm faces the tube
 * (`faceTube`), the left fingers curl 115° and the right fingers 105° over its front (`gripCurl`),
 * and each paw aims across the tube (`aimAcross`) and half toward the side across it (`aimSide`).
 * With the smaller paws of the Tripo wolf (`assets/models/wolf/README.md`, "Paw size") and a curl
 * of 115°, the right finger tips stood 0.8 cm off the tube in the notes that open the right keys,
 * so the right paw grasped the tube in 79% of the play samples (`pnpm wind-grip clarinetist`). With
 * 105°, it grasps in each sample, and with 125° and more, the tips curl past the tube. Each grip
 * moves toward the axis and to the side of its own shoulder (`gripShiftL`, `gripShiftR`): the left
 * grip 0.06 H toward the axis and 0.11 H across it, the right grip 0.11 H toward the axis and 0.11
 * H across it. On the Tripo wolf, the grips 0.14 H and 0.19 H toward the axis and a side aim of a
 * quarter put each paw half behind the tube, 45° from the palm to the tube, with the finger tips
 * 2.2 cm to 2.6 cm off it, so no paw grasps the tube. The left grip moves 0.15 H down the tube,
 * because 8.5 cm above the shoulder joint, the forearm rises steeply and the retarget turns the paw
 * up along the tube (`PAW_TURN` of `models/studio-rig.ts`).
 *
 * The muzzle puts the tip of the nose in front of the mouth, so the mouthpiece sits 0.1 H lower and
 * 0.21 H further back than the mouth of the bind pose (`lipShift`), at the dark lips under the
 * muzzle, and goes 0.6 cm into the mouth, as a real clarinetist takes the mouthpiece between the
 * lips (`docs/reference/wind-technique.md` 3). The body keeps the mouth of the rule of the nose
 * drop, because a mouth point at the lips (`mouthHeight`) moves the clarinet of the bind pose and
 * the seats of the stage. Each shoulder bone turns forward in the play, the right 45° and the left
 * 30° (`reach`, `reachL`), as the shoulder blades of a real player slide forward: with the 35° and
 * 20° of {@link WIND_HOLDS}, the right paw missed its grip by 2.0 cm. Both elbows point down and
 * out (`poleL`, `poleR`), further out than in {@link WIND_HOLDS}, so that the elbows stay a little
 * away from the body, as the elbows of a real player stay away from the sides
 * (`docs/reference/wind-technique.md` 1.8).
 *
 * At rest, the bell stands on the front of the right knee, as a seated clarinetist puts the bell
 * on the knee (`docs/reference/wind-technique.md` 3). The right paw holds the upper joint, 0.4 H
 * along the tube toward the mouthpiece from the grip of the play (`restGripShiftR`), at the
 * hanging right palm with the upper arm 25° forward and the elbow bent 45° (`restArms`). The
 * clarinet turns its lower end 5° back of the vertical and 10° to the left (`rest`), so that the
 * bell comes in over the knee and the top leans out to the right. It moves 0.17 H down and 0.05 H
 * back (`restShift`), so that the bell presses the skin of the knee 0.5 cm. With the clarinet
 * upright at the side, the bell stood 26 cm above the thigh. With the upper arm straight down
 * and the elbow bent 70°, the bell stood on the top of the thigh, but the right forearm went
 * 3.8 cm into the belly at the start of the lift (1.0 cm with these values, limit 1.5 cm). The
 * left paw leaves its grip and hangs beside the left haunch with the upper arm 5° forward and
 * the elbow bent 15° (`restFreeL`), as the free hand of a seated clarinetist lies beside or on the
 * thigh. With 20° and 30°, the paw stood in the air in front of the left hip. The round belly of the Tripo wolf reaches the seat front, so
 * a clarinet in front of the belly between the knees with both paws on it put the left forearm
 * 10.6 cm and the right upper arm 9.9 cm into the belly. A left paw on the top of the left thigh
 * goes 14 cm into the belly.
 */
const WOLF_CLARINET = {
  ...WIND_HOLDS.clarinet,
  roundArms: null,
  reach: 45 * MathUtils.DEG2RAD,
  reachL: 30 * MathUtils.DEG2RAD,
  poleL: [-0.6, -1, 0],
  poleR: [0.6, -1, 0],
  rest: holdTurn(-30, -10),
  restArms: {
    L: { forward: 5 * MathUtils.DEG2RAD, bend: 15 * MathUtils.DEG2RAD },
    R: { forward: 25 * MathUtils.DEG2RAD, bend: 45 * MathUtils.DEG2RAD },
  },
  restShift: [0, -0.17, 0.05],
  aimSigns: null,
  aimSide: [0.5, 0.5],
  gripShiftL: [0.15, 0.06, -0.11],
  gripShiftR: [0.05, 0.11, -0.11],
  restGripShiftR: [-0.4, 0.11, -0.11],
  lipShift: [0, -0.1, 0.21],
  gripCurl: curls(115, 105),
  play: holdTurn(WOLF_CLARINET_FORWARD, 0),
} as const satisfies WindHold;

/**
 * The trumpet hold of the monkey (design 5.3), the hold of a real trumpet player
 * (`docs/reference/wind-technique.md` 2.1): the left paw wraps the valve casings and holds the
 * weight, the right fingers arch down onto the valves, and the trumpet points forward and a little
 * down. The line from the mouthpiece to the bell points 9.5° below the level, and the head stays
 * 1° from the vertical.
 *
 * The big head of the Tripo monkey puts the mouth 1.09 arm lengths from the shoulder joints
 * (`mouthShare()` of `pose/far-mouth.ts`), so the arms reach the valves of a nearly level trumpet
 * only with these changes. The monkey plays a trumpet of 0.75 of the trumpet of the app
 * (`SpeciesParams.trumpetScale`), 0.31 m long, as a child plays a smaller trumpet: the valves come
 * 4.4 cm nearer to the mouth. Both shoulder bones turn 70° forward (`reach`, `reachL`), as the
 * shoulder blades of a real player slide forward. The head bows 10.4° on the chest by the rule of
 * the far mouth (`farMouth` 0.92), and the trumpet turns down with the head and 5° more (`play`).
 * The spine turns 5° back in the play (`lean`), as a real player stands erect. The paws then reach
 * their grips with 4.6 cm (left) and 1.7 cm (right) to spare. With the trumpet of the app at this
 * angle, the right paw missed its grip by 2.4 cm. With a size of 0.8, the right paw reached its
 * grip with 0.9 cm to spare, with a nearly straight arm. With the trumpet 25° further down and
 * the spine 12° back, the paws reached the trumpet of the app, but the line to the bell pointed
 * 27° below the level, and the bell went behind the music stand.
 *
 * The left palm faces the upright casings from the left, below the middle of their height
 * (`InstrumentGrips.tubeL` of `models/instruments/brass.ts`), the left paw points up along its
 * forearm with the thumb up and back toward the first valve slide, and its fingers curl 130°
 * around the thin casings of the trumpet (`gripCurl`): with 109°, the finger tips stand
 * 1.1 cm off. The right palm lies above the valves at their right and faces down, and the right
 * paw points up along its forearm and a part of the way to the left across the valve tops: 0.35
 * of its aim is the side direction across the valves (`aimSide`), and its fingers curl 92° down
 * onto the valves. The wrist then stays nearly straight, as the wrists of a real player
 * (`docs/reference/wind-technique.md` 2.1): the right paw bends 20° on its forearm (p95 of the
 * play, `pnpm hold-fit trumpeter`). With 0.7, the forearm came up from below, the paw lay level
 * across the valves, and it bent 37°. The right grip moves 0.06 H
 * along the valves toward the mouthpiece and 0.05 H toward the right shoulder (`gripShiftR`). The
 * right paw then grasps the valves in each sample, with its palm 42° from the valve tops
 * (`pnpm wind-grip trumpeter`). With no move toward the shoulder, the palm turned 76° from the
 * valves, and the paw grasped them in 21% of the play samples. With 0.04 H, the two paws went
 * 1.6 cm into each other (`pnpm clip-probe`). With flatter fingers, the finger tips stood
 * 1.3 cm off the valves. The top of the right paw is 6.1 cm above the mouthpiece, so in
 * the view from the front, the paw covers the mouth, as the right hand of a real player on the
 * valve buttons. The left paw takes no side aim: the retarget turns the paw back to its forearm in
 * the plane of its palm (`PAW_TURN` of `models/studio-rig.ts`).
 *
 * At rest, the arms hang from square shoulders (`restArms`), and the trumpet hangs from the
 * right paw in front of the right thigh with its bell down, as a player holds the trumpet in one
 * hand in front of the body between two entrances. The right upper arm hangs 30° forward with the
 * elbow down and bent 25°, and the left paw leaves the valves and hangs beside the body with a
 * soft bend of the elbow (`restFreeL`). The right paw keeps the roll and the aim of the play at
 * rest (`restAim`), so it holds the valves, and it lies nearly in line with its forearm. With the
 * trumpet 0.5 H below the mouth in both paws and the rest elbows of the shared hold, the upper
 * arms stood out to the side, almost level, and the forearms crossed the chest. With both paws on
 * the trumpet at the hanging arms, the elbows went 5.7 cm into the belly. With the right elbow
 * bent 60°, the right forearm lay level and the right paw stood up at the wrist. With the right
 * upper arm 20° forward, its root went 1.7 cm into the body.
 *
 * Both elbows point down and out, as a real player lets the elbows hang. The mouthpiece rim rests
 * on the lips, as the rim of a real trumpet player (`docs/reference/wind-technique.md` 2.1): it
 * moves 0.012 H back from the mouth of the body (`lipShift`), so that it presses the lips 0.2 cm.
 */
const MONKEY_TRUMPET = {
  ...WIND_HOLDS.trumpet,
  roundArms: null,
  farMouth: 0.92,
  reach: 70 * MathUtils.DEG2RAD,
  reachL: 70 * MathUtils.DEG2RAD,
  play: holdTurn(-5, 0),
  lean: -5 * MathUtils.DEG2RAD,
  poleL: [-1, -1, 0],
  poleR: [1, -1, 0],
  faceTube: ['palm', 'palm'],
  aimSide: [0, 0.35],
  gripShiftR: [-0.06, 0, -0.05],
  restShift: [0, 0, 0],
  restArms: {
    L: { forward: 15 * MathUtils.DEG2RAD, bend: 20 * MathUtils.DEG2RAD },
    R: { forward: 30 * MathUtils.DEG2RAD, bend: 25 * MathUtils.DEG2RAD },
  },
  restFreeL: {
    lap: { along: 0.45, offset: [-0.5, -0.55, -0.12] },
    palm: [0.85, -0.37, 0.38],
    fingers: [0, -1, -0.3],
    arc: [0.3, 0.04, 0.31],
  },
  restAim: 1,
  gripCurl: curls(130, 92),
  lipShift: [0, 0, 0.012],
} as const satisfies WindHold;

/**
 * The tuba hold of the rhino (design 5.3), the hold of a real tubist who stands with the tuba on a
 * strap (`docs/reference/wind-technique.md` 3): the tuba stands against the body, the bell at the
 * left of the head, the left paw on the main branch, and the right paw on the valves. The long
 * muzzle puts the mouthpiece 0.56 m in front of the shoulder joints, so the lead pipe of the tuba
 * is longer (`SpeciesParams.tubaPipe`), the right shoulder turns 45° forward, and the left shoulder
 * 40°, as the shoulder blades of a real player slide forward. The lower end of the tuba turns 25°
 * to the right, so that the bell stands at the left of the horn on the muzzle. The tuba stands
 * upright in front of the round belly (`play`). With its lower end turned 7° forward, the bottom
 * bow stood farther from the belly, and the left paw reached its grip with 1.7 cm to spare in place
 * of 6.2 cm (`pnpm hold-fit tubist`). The elbows point down and out, a little more down than out
 * (`poleL`, `poleR`, `restPoleL`, `restPoleR`), as the arms of a real player stay away from the rib
 * cage (`docs/reference/wind-technique.md` 1.8). The thick upper arms of the Tripo rhino still lie
 * against its round belly, and the left arm goes about 5.5 cm into it at the elbow in each sample.
 * Elbows further out (-1.2, -1, 0) changed this depth by 0.5 cm or less. The left paw of the body
 * turns five ring steps in its rig (`assets/models/rhino/README.md`), so the left forearm twists
 * at most 7° from the bind, and the right forearm at most 26°. At rest, the tuba stays on the
 * body, as the tuba of a real player on a strap. Its top turns 8° forward about its bottom bow
 * (`rest`), so that the mouthpiece leaves the lips, to the front and below the mouth, as a real
 * player takes the tuba off the mouth between two entrances. The tuba also moves 0.1 H back and
 * 0.04 H down (`restShift`), so that each paw reaches its grip at rest with 6.5 cm (left) and 3.7
 * cm (right) to spare. With 0.26 H back, the right paw missed its grip by 3.9 cm, and the left
 * claws went 4.7 cm into the tuba. With the small move of {@link WIND_HOLDS}, the mouthpiece
 * stayed on the lips, and the rest looked the same as the play.
 *
 * The right palm faces the valve tops, and the left palm faces the main branch (`faceTube`,
 * `InstrumentGrips.tubeL` of `models/instruments/brass.ts`), as the left hand of a real tubist
 * grips the tubing at the side of a rotary tuba, with the knuckles to the left, while the right
 * hand works the valves (`docs/reference/wind-technique.md` 3). The left grip moves 0.135 H toward
 * the main branch, 0.06 H around it toward the shoulder, and 0.07 H up (`gripShiftL`), and the
 * left paw aims half toward the side across the branch (`aimSide`), so that the left paw lies at
 * the back left of the branch: its palm faces the branch, the back of the paw faces out to the
 * left, and the fingers curl around the left side of the branch. The left fingers curl 92°
 * (`gripCurl`). The finger tips then touch the branch in each play sample (`pnpm wind-grip
 * tubist`), and the left paw goes at most 1.5 cm into the branch (`pnpm body-clip tubist`). With
 * the grip 0.03 H around the branch away from the shoulder and no side aim, the paw lay flat on
 * the near side of the branch, the finger tips stood 1.9 cm off it, and the paw went 2.1 cm into
 * it. With 0.03 H toward the shoulder or 0.09 H, the tips stood 0.7 cm off the branch. The branch
 * is about 15 cm wide at the grip, so no paw closes around it. The left paw keeps the grip of the
 * play at rest, so that its finger tips touch the branch in the lift and the rest. Both paws keep
 * the aim and the roll of the play at rest (`restAim`): with the roll of the shoulder at rest, the
 * left paw flips in the lowering (the wrist turns 17960° each second). The right fingers curl 80°.
 * The right grip moves 0.15 H along the row of the valves toward the front and 0.1 H toward the
 * right shoulder (`gripShiftR`), so that the right paw lies on the valve tops at the front right
 * of the valve branch, where it shows from the front and from the right front. On the grip of the
 * instrument, the valve branch hides it from both views. The mouthpiece rim rests on the lips, as
 * the rim of a real tubist
 * (`docs/reference/wind-technique.md` 3): it moves 0.013 H up and 0.022 H back from the mouth of
 * the body (`lipShift`), so that its top lies on the upper lip and the rim presses the lips 0.2 cm.
 */
const RHINO_TUBA = {
  ...WIND_HOLDS.tuba,
  reach: 45 * MathUtils.DEG2RAD,
  reachL: 40 * MathUtils.DEG2RAD,
  play: holdTurn(0, 25),
  poleL: [-0.75, -1, 0],
  poleR: [0.75, -1, 0],
  rest: holdTurn(-8, 25),
  restShift: [0, -0.04, -0.1],
  restPoleL: [-0.75, -1, 0],
  restPoleR: [0.75, -1, 0],
  faceTube: ['palm', 'palm'],
  aimSide: [0.5, 0],
  gripShiftL: [0.07, 0.135, -0.06],
  gripShiftR: [-0.15, 0, -0.1],
  restAim: 1,
  gripCurl: curls(92, 80),
  lipShift: [0, 0.013, 0.022],
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
  /** The reach of the wrist in the middle of the move ({@link FreePaw.moveReach}), or `null`. */
  readonly moveReach: number | null;
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
   * out of reach of any probable arm, so the slide positions map into this travel by a curve
   * that spreads the near positions ({@link reachedShare}, design 5.3).
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
  const moveReach = rest.moveReach ?? null;
  if (angles) {
    return { kind: 'hang', hang: hangingArm(model, arm, angles), roll: null, arc, moveReach };
  }
  if (model.support === 'stand') {
    const roll = rest.hangRoll
      ? toQuat(new Quaternion().setFromAxisAngle(Y_AXIS, rest.hangRoll))
      : null;
    return { kind: 'hang', hang: hangingArm(model, arm, rest.hang), roll, arc, moveReach };
  }
  return { kind: 'lap', ...lapHand(model, arm, rest), arc, moveReach };
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

/**
 * Gives the curl of the fingers of a paw that leaves its grip in the rest pose
 * (`WindHold.restFreeL`). At rest, the empty paw is relaxed and half open
 * ({@link WIND_BODY.curlOpen}), as the free hand of a real player lies open on the thigh or hangs
 * beside it (`docs/reference/wind-technique.md` 3). The paw closes to the curl of its grip by the
 * square of the weight, so that it stays open in the air and closes when it comes to the tube.
 * With the grip curl at each weight, the empty paw was a fist with no tube in it.
 *
 * @param play The curl of the paw on its grip in the playing pose ({@link curlOf} at the weight 1).
 * @param weight The weight of the playing pose.
 * @returns The curl angle.
 */
function freeCurlOf(play: number, weight: number): number {
  const open = WIND_BODY.curlOpen;
  return open + (play - open) * weight * weight;
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
  out.premultiply(palmRoll.slerp(NO_TURN, 1 - weight));
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
    if (free.moveReach !== null) {
      keepMoveBend(side.arm, shoulder.position, free.moveReach, weight, wrist);
    }
    if (rig.hold.roundArms !== null) {
      keepBent(side.arm, shoulder.position, weight, wrist);
    }
    mixRotation(restHand, hand, weight, hand);
  }

  writeArm({ arm: side.arm, shoulder, wrist, hand, pole }, chest.rotation, rotations);
  setBoneRotation(rotations, side.arm.bones.shoulder, turn);
  writeCurl(side.arm, curl, rotations);
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

/**
 * Gives the share of the reached slide travel ({@link WindRig.slideReach}) for a share of the
 * full slide travel (design 5.3): `x (2 - x)`. The right arm reaches only a part of the travel, so
 * with the share itself, the second position of the panda moved the slide 1.4 cm of 10 cm, and the
 * slide did not show the notes. The curve keeps the first and the seventh positions and the order
 * of all positions, and it doubles the move of the near positions: the second position then moves
 * the slide 2.7 cm, the fourth 7.0 cm, and the fifth 8.6 cm.
 *
 * @param share The share of the full travel: 0 at the first position, 1 at the seventh.
 * @returns The share of the reached travel, from 0 to 1.
 */
function reachedShare(share: number): number {
  return share * (2 - share);
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
  slide
    .fromArray(rig.slideAxis)
    .multiplyScalar(reachedShare(state.slide) * rig.slideReach * weight);
  const { hold } = rig;
  const { freeL } = rig;
  const gripL = hold.gripCurl?.[0] ?? null;
  const left = freeL
    ? freeCurlOf(curlOf(state.fingersL, 1, gripL), weight)
    : curlOf(state.fingersL, weight, gripL);
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
