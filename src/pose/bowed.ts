import { MathUtils, Quaternion, Vector3 } from 'three';

import { boneIndex } from '../models/rig.ts';
import { palmTurnAngle, studioPawTwist } from '../models/studio-rig.ts';
import { mixDirection, mixRotation } from './blend.ts';
import type { BowedHold, BowedRig, RigPoints } from './bowed-rig.ts';
import { createFrame, posePoint, setBoneRotation, setFromBasis } from './frames.ts';
import type { TorsoFrames } from './frames.ts';
import { HAND_FRAMES, handPlaceOf } from './fingering.ts';
import { createArmPose, poseShoulder, solveArm, writeArm, writeCurl } from './ik.ts';
import { smoothstep } from './rest.ts';
import type { BowState } from './strokes.ts';

/** The sizes of the hand motion of the bowed strings, in meters and radians (design 5.3). */
export const BOWED_HANDS = {
  /** The right palm is this high above the strings to pluck. */
  pluckHeight: 0.035,
  /** The plucking hand moves this far to each side of the strings, at a gesture size of 1. */
  pluck: 0.012,
  /** The curl of the left fingers, and the extra curl of a press at the note start. */
  curlL: 40 * MathUtils.DEG2RAD,
  pressL: 15 * MathUtils.DEG2RAD,
  /**
   * The turn of the left hand around the normal of the strings toward the finger of the note, at
   * a reach of 1 (`BowState.reach`). The four fingers are one block, so the hand turns in place
   * of a finger that reaches.
   */
  reachTurn: 8 * MathUtils.DEG2RAD,
  /**
   * The roll of the left hand around the neck for each string from the middle of the strings, to
   * the string of the finger (`BowState.stopString`). On the depth of the neck, it moves the
   * finger block across the strings of the violin model by 2.7 mm. The roll of the full space
   * puts the left forearm of the red fox 2.4 cm into the violin in the play, and this roll
   * 2.2 cm.
   */
  rollL: 2.5 * MathUtils.DEG2RAD,
  /**
   * The depth of the axis of the roll below the strings, as a part of the length of the target
   * `fingerboard`: the middle of the neck of the violin model is 30 mm below the strings, and the
   * target is 165 mm long.
   */
  neckDepth: 0.18,
  /** The curl of the right fingers around the bow stick (design 4.6). */
  curlR: 45 * MathUtils.DEG2RAD,
} as const;

const BONES = {
  chest: boneIndex('chest'),
  instrument: boneIndex('instrument'),
  bow: boneIndex('bow'),
} as const;

/** The instrument at its posed place. */
interface InstrumentPlace {
  /** The rotation of the `instrument` bone relative to its parent. */
  readonly local: Quaternion;
  /** The world rotation of the instrument. */
  readonly rotation: Quaternion;
  /** The posed place of the `instrument` bone. */
  readonly pivot: Vector3;
  /**
   * The move of the `instrument` bone from its bind place, in the axes of its parent: the
   * instrument offset of the pose (design 5.1).
   */
  readonly offset: Vector3;
}

/** The strings of an instrument at their posed place. */
interface StringsPlace {
  /** The point on the strings where the bow plays. */
  readonly contact: Vector3;
  readonly axis: Vector3;
  readonly top: Vector3;
  /** The direction across the strings to the side of the bow tip. */
  readonly across: Vector3;
}

/** The bow at its posed place: the bow bone at the grip, and its world rotation. */
interface BowPlace {
  /** The posed place of the `bow` bone: the grip on the stick. */
  readonly grip: Vector3;
  /** The world rotation of the `bow` bone. */
  readonly rotation: Quaternion;
}

/** The right hand that holds the bow. */
interface BowHand {
  /** The posed place of the `handR` bone. */
  readonly wrist: Vector3;
  /** The world rotation of the `handR` bone. */
  readonly rotation: Quaternion;
}

/** The rotation that changes nothing. Nothing writes it. */

const Y_AXIS = new Vector3(0, 1, 0);

const rest = new Quaternion();
const playTurn = new Quaternion();
const playShift = new Vector3();
const ORIGIN = [0, 0, 0] as const;
const restPivot = new Vector3();
const parentInverse = new Quaternion();
const pivotFromParent = new Vector3();
const pivotBind = new Vector3();
const liftReach = new Vector3();

/**
 * Places the instrument: the violin and the viola go down in the rest pose. While the player
 * plays, the instrument has the play shift and the play turn of its hold. A weight between 0 and 1
 * mixes the two places. In the lift and the lowering of a violin or a viola, the left paw carries
 * the instrument in place of this mix ({@link carryLift}).
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param weight The weight of the playing pose.
 * @param out The place to write.
 * @returns `out`, with the place of the instrument.
 */
export function instrumentAt(
  rig: RigPoints,
  frames: TorsoFrames,
  weight: number,
  out: InstrumentPlace,
): InstrumentPlace {
  const parent = rig.parent === BONES.chest ? frames.chest : frames.root;
  rest.fromArray(rig.restRotation);
  playTurn.fromArray(rig.hold.playTurn);
  mixRotation(rest, playTurn, weight, out.local);
  out.rotation.multiplyQuaternions(parent.rotation, out.local);
  posePoint(parent, rig.parentBind, rig.pivot, out.pivot);
  out.pivot.add(playShift.fromArray(rig.playShift).applyQuaternion(parent.rotation));

  // The lap does not move with the chest, so the rest place follows the root.
  posePoint(frames.root, ORIGIN, rig.restPivot, restPivot);
  out.pivot.lerpVectors(restPivot, out.pivot, weight);
  return placeOffset(rig, frames, out);
}

/**
 * Writes the instrument offset of a place from its pivot: the move of the `instrument` bone from
 * its bind place, in the axes of its parent.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param out The place. The function writes its offset.
 * @returns `out`.
 */
function placeOffset(rig: RigPoints, frames: TorsoFrames, out: InstrumentPlace): InstrumentPlace {
  const parent = rig.parent === BONES.chest ? frames.chest : frames.root;
  out.offset
    .copy(out.pivot)
    .sub(parent.position)
    .applyQuaternion(parentInverse.copy(parent.rotation).invert())
    .add(pivotFromParent.fromArray(rig.parentBind))
    .sub(pivotBind.fromArray(rig.pivot));
  return out;
}

/**
 * Gives the place of the left fingers on the target `fingerboard` at a weight of the playing pose
 * (design 5.2): the place of the rest at the rest, the place of the note at the play, and a mix
 * between them.
 *
 * @param hold The hold of the instrument.
 * @param note The place of the note.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @returns The place, from 0 at the nut to 1 at the end of the fingerboard.
 */
function stopAt(hold: BowedHold, note: number, weight: number): number {
  return hold.restPlace + (note - hold.restPlace) * weight;
}

/**
 * Makes an instrument place with no turn at the origin.
 *
 * @returns The place.
 */
function createPlace(): InstrumentPlace {
  return {
    local: new Quaternion(),
    rotation: new Quaternion(),
    pivot: new Vector3(),
    offset: new Vector3(),
  };
}

/**
 * Moves a bind point of the instrument to its posed place.
 *
 * @param rig The points of the player.
 * @param place The place of the instrument.
 * @param point The bind point. The function moves it in place.
 * @returns `point`, at its posed place.
 */
function onInstrument(rig: RigPoints, place: InstrumentPlace, point: Vector3): Vector3 {
  return point.sub(pivotBind.fromArray(rig.pivot)).applyQuaternion(place.rotation).add(place.pivot);
}

/**
 * Gives the strings at the place of the instrument.
 *
 * @param rig The points of the player.
 * @param place The place of the instrument.
 * @param out The strings to write.
 * @returns `out`, with the strings.
 */
export function stringsAt(rig: RigPoints, place: InstrumentPlace, out: StringsPlace): StringsPlace {
  onInstrument(rig, place, out.contact.fromArray(rig.contact));
  out.axis.fromArray(rig.axis).applyQuaternion(place.rotation);
  out.top.fromArray(rig.top).applyQuaternion(place.rotation);
  out.across.fromArray(rig.across).applyQuaternion(place.rotation);
  return out;
}

/**
 * Gives the forward turn of the right shoulder bone, so that the bow arm reaches the strings. In
 * the lift and the lowering, the turn stays whole down to the weight `BowedHold.reachFade` of the
 * playing pose, and fades to none at the rest pose below it, so that a bow arm that still crosses
 * the chest keeps its shoulder forward.
 *
 * @param rig The points of the player.
 * @param weight The weight of the playing pose.
 * @param out The quaternion to write.
 * @returns `out`, with the local rotation of the `shoulderR` bone.
 */
export function shoulderTurn(rig: RigPoints, weight: number, out: Quaternion): Quaternion {
  const share = Math.min(1, weight / rig.hold.reachFade);
  return out.setFromAxisAngle(Y_AXIS, rig.hold.reach * share);
}

/**
 * Gives the forward turn of the left shoulder bone, so that the left arm reaches the fingerboard
 * (`BowedHold.reachL`). A violin or a viola on the lap in the rest pose turns it with the weight
 * of the playing pose, as a player brings the left shoulder forward under the instrument
 * (`docs/reference/string-technique.md`, section 1.10). A floor instrument keeps the turn in the
 * rest pose, because the left hand holds it at its playing place in the rest.
 *
 * @param rig The points of the player.
 * @param weight The weight of the playing pose.
 * @param out The quaternion to write.
 * @returns `out`, with the local rotation of the `shoulderL` bone.
 */
export function shoulderTurnL(rig: RigPoints, weight: number, out: Quaternion): Quaternion {
  const share = rig.hold.rest ? weight : 1;
  return out.setFromAxisAngle(Y_AXIS, -rig.hold.reachL * share);
}

const stringTurn = new Quaternion();
const slantTurn = new Quaternion();
const turnedAxis = new Vector3();
const slantAxis = new Vector3();
const turnedTop = new Vector3();
const down = new Vector3();
const along = new Vector3();
const bowAlign = new Quaternion();
const hairStart = new Vector3();
const tiltTurn = new Quaternion();
const tiltSide = new Vector3();

/**
 * Places the bow so that its hair lies on a string, with a place of the hair on the contact
 * point. The string turns the bow around the strings, and the slant turns it in the plane of the
 * strings. The bow then turns around its hair by `BowedHold.bowTilt`, so that the stick leans
 * toward the fingerboard and the hair stays on the contact point
 * (`docs/reference/string-technique.md`, section 2.1). The function also gives the bow that the
 * right hand holds: the bow with no tilt, at the grip of the tilted bow. The fingers turn the
 * stick around its line by the tilt (`BowedHold.bowTilt`), so the hand keeps the turn of the bow
 * with no tilt, and the skin of the bow arm does not take the turn of the tilt.
 *
 * @param rig The points of the player.
 * @param strings The strings at their posed place.
 * @param string The string, from 0 (the lowest) to 3.
 * @param bow The place of the contact point on the hair, in meters from the frog end.
 * @param lift The distance of the hair above the strings.
 * @param out The bow to write, with its tilt.
 * @param held The bow of the hand to write: the rotation with no tilt, at the grip of `out`.
 * @returns The turn of the bow in the hand around the stick (`BowedRig.stick`), in radians.
 */
export function heldBowAt(
  rig: RigPoints,
  strings: StringsPlace,
  string: number,
  bow: number,
  lift: number,
  out: BowPlace,
  held: BowPlace,
): number {
  const turn = placeBow(rig, strings, string, bow, lift, rig.hold.bowTilt, out);
  placeBow(rig, strings, string, bow, lift, 0, held);
  held.grip.copy(out.grip);
  return turn;
}

/**
 * Places the bow on a string with a tilt around its hair ({@link heldBowAt}).
 *
 * @param rig The points of the player.
 * @param strings The strings at their posed place.
 * @param string The string, from 0 (the lowest) to 3.
 * @param bow The place of the contact point on the hair, in meters from the frog end.
 * @param lift The distance of the hair above the strings.
 * @param tilt The tilt of the stick toward the fingerboard, in radians.
 * @param out The bow to write.
 * @returns The signed turn of the tilt around the hair: the turn of the bow around the stick
 *   from the bow with no tilt, in radians.
 */
function placeBow(
  rig: RigPoints,
  strings: StringsPlace,
  string: number,
  bow: number,
  lift: number,
  tilt: number,
  out: BowPlace,
): number {
  turnedAxis.copy(strings.axis).normalize();
  stringTurn.setFromAxisAngle(turnedAxis, (string - 1.5) * rig.hold.stringTurn);
  turnedTop.copy(strings.top).applyQuaternion(stringTurn);
  slantTurn.setFromAxisAngle(slantAxis.copy(turnedTop).normalize(), rig.hold.slant);
  along.copy(strings.across).applyQuaternion(stringTurn).applyQuaternion(slantTurn);
  setFromBasis(out.rotation, along, down.copy(turnedTop).negate()).multiply(
    bowAlign.fromArray(rig.bowAlign),
  );
  // A turn around the hair moves the stick, on the side `turnedTop` of the hair, to the side
  // `along × turnedTop`. The fingerboard is on the side of the axis, toward the scroll.
  const side = tiltSide.crossVectors(along, turnedTop).dot(strings.axis) < 0 ? -1 : 1;
  if (tilt !== 0) {
    out.rotation.premultiply(tiltTurn.setFromAxisAngle(along, side * tilt));
  }
  out.grip
    .copy(strings.contact)
    .addScaledVector(turnedTop, lift)
    .sub(hairStart.fromArray(rig.hairStart).applyQuaternion(out.rotation))
    .addScaledVector(along, -bow);
  return side * tilt;
}

const stick = new Vector3();
const roll = new Quaternion();
const gripOffset = new Vector3();
const handUp = new Vector3();
const aimUp = new Vector3();
const normal = new Vector3();

/**
 * The range of the roll of the right hand around the stick, from the hold of the bind pose, in
 * radians. Past it, the hair at the frog goes into the palm or the fingers.
 */
const ROLL_RANGE = [-120 * MathUtils.DEG2RAD, 100 * MathUtils.DEG2RAD] as const;

/** The width of the turns near the far side of the stick in which the roll fades, in radians. */
const FAR_SIDE = 25 * MathUtils.DEG2RAD;

/**
 * The share of a sideways aim that gives the full roll. An aim near the line of the stick gives
 * no clear side, so its roll fades to 0.
 */
const CLEAR_AIM = 0.5;

/**
 * Gives the roll of the right hand around the stick that turns the back of the hand to a point,
 * such as the elbow. The roll stays within its range, and it fades to 0 near the far side of the
 * stick (`BowedHold.farSideR`), where it changes from one end of the range to the other end. An
 * aim near the line of the stick has less roll. Thus the roll changes with no jump when the aim
 * moves.
 *
 * @param rig The points of the player.
 * @param bow The bow at its posed place.
 * @param aim The point, in the model axes.
 * @returns The roll from the hold of the bind pose, in radians.
 */
export function rollToward(rig: RigPoints, bow: BowPlace, aim: Vector3): number {
  // The bind hand hangs: from the wrist, the arm goes up (+y).
  stick.fromArray(rig.stick).applyQuaternion(bow.rotation);
  handUp.set(0, 1, 0).applyQuaternion(bow.rotation);
  handUp.addScaledVector(stick, -handUp.dot(stick)).normalize();

  aimUp.subVectors(aim, bow.grip);
  const distance = aimUp.length();
  aimUp.addScaledVector(stick, -aimUp.dot(stick));
  const side = aimUp.length();
  if (side < 1e-9) {
    return 0;
  }

  // The angle of the aim from the back of the hand, in the turn of 2π that ends at the far side.
  const farSide = rig.hold.farSideR;
  let angle = Math.atan2(stick.dot(normal.crossVectors(handUp, aimUp)), handUp.dot(aimUp));
  if (angle > farSide) {
    angle -= 2 * Math.PI;
  } else if (angle <= farSide - 2 * Math.PI) {
    angle += 2 * Math.PI;
  }
  const [low, high] = ROLL_RANGE;

  // Near the far side, a small move of the aim turns the roll from one end of the range to the
  // other end, so the roll fades to 0 there.
  const fromFar = angle >= farSide - Math.PI ? farSide - angle : angle - (farSide - 2 * Math.PI);
  const far = MathUtils.clamp(fromFar / FAR_SIDE, 0, 1);
  const limited = MathUtils.clamp(angle, low, high) * far;
  return limited * smoothstep(Math.min(1, side / distance / CLEAR_AIM));
}

/**
 * Places the right hand around a bow. The stick lies in the fingers (design 4.6), so the hand can
 * roll around the stick and keep its grip.
 *
 * @param rig The points of the player.
 * @param bow The bow at its posed place.
 * @param angle The roll of the hand around the stick from the hold of the bind pose, in radians.
 * @param out The hand to write.
 * @returns `out`, with the wrist and the rotation of the hand.
 */
export function gripHand(rig: RigPoints, bow: BowPlace, angle: number, out: BowHand): BowHand {
  stick.fromArray(rig.stick).applyQuaternion(bow.rotation);
  out.rotation.multiplyQuaternions(roll.setFromAxisAngle(stick, angle), bow.rotation);
  out.wrist.copy(bow.grip).sub(gripOffset.fromArray(rig.grip).applyQuaternion(out.rotation));
  return out;
}

/** The number of steps in which the right hand turns on the stick ({@link turnOnStick}). */
const STICK_PASSES = 3;

const stickGrip = new Vector3();
const stickStart = new Quaternion();
const stickTurn = new Quaternion();
const stickInverse = new Quaternion();
const stickFore = new Vector3();
const stickArm = createArmPose();

/**
 * Turns the right hand in the plane of its palm around the grip on the stick
 * (`BowedHold.stickTurnR`), so that the solved forearm keeps one angle in the plane of the palm,
 * with a turn of at most `most` to each side. The retarget turns the paw toward the forearm in
 * that plane (`PAW_TURN` of `models/studio-rig.ts`), so the paw then keeps one turn on the hand,
 * and the stick keeps its place in the paw. Each step solves the arm and turns the hand by the
 * angle that is left. The move of the wrist moves the forearm a little, so three steps leave less
 * than 0.3° (design 5.3).
 *
 * @param rig The points of the player.
 * @param keep The angle of the forearm in the plane of the palm, and the largest turn.
 * @param shoulder The posed right shoulder joint.
 * @param parent The world rotation of the shoulder bone.
 * @param pole The direction of the right elbow, in the model axes.
 * @param hand The right hand on the bow. The function turns it in place.
 * @returns The turn of the hand around the normal of its palm, in radians.
 */
function turnOnStick(
  rig: RigPoints,
  keep: { readonly forearm: number; readonly most: number },
  shoulder: Vector3,
  parent: Quaternion,
  pole: Vector3,
  hand: BowHand,
): number {
  stickGrip.fromArray(rig.grip).applyQuaternion(hand.rotation).add(hand.wrist);
  stickStart.copy(hand.rotation);
  let turn = 0;
  for (let pass = 0; pass < STICK_PASSES; pass++) {
    solveArm(rig.armR.bind, shoulder, parent, hand.wrist, pole, stickArm);
    stickFore
      .subVectors(stickArm.wrist, stickArm.elbow)
      .applyQuaternion(stickInverse.copy(hand.rotation).invert());
    // The forearm points from the elbow to the wrist, so the angle 0 puts it on the line of the
    // paw, which points down (-y) from the wrist.
    const angle = Math.atan2(-stickFore.z, -stickFore.y);
    turn = MathUtils.clamp(turn + angle - keep.forearm, -keep.most, keep.most);
    hand.rotation.copy(stickStart).multiply(stickTurn.setFromAxisAngle(X_AXIS, turn));
    hand.wrist.copy(stickGrip).sub(gripOffset.fromArray(rig.grip).applyQuaternion(hand.rotation));
  }
  return turn;
}

/** The left hand that presses the strings. */
interface StopHand {
  readonly wrist: Vector3;
  /** The world rotation of the `handL` bone. */
  readonly rotation: Quaternion;
}

/** The finger of the left hand on the strings: its reach and its string. */
interface StopFinger {
  /** The reach of the finger from the middle of the hand frame, from -1 to 1. */
  readonly reach: number;
  /** The string under the finger, from 0 to 3. 1.5 is the middle of the strings. */
  readonly stopString: number;
}

/** The finger in the middle of the hand frame and of the strings: no turn and no roll. */
export const MIDDLE_FINGER: StopFinger = { reach: 0, stopString: 1.5 };

const Z_AXIS = new Vector3(0, 0, 1);
const neck = new Vector3();
const fingers = new Vector3();
const fingersUp = new Vector3();
const palmSide = new Vector3();
const curl = new Quaternion();
const block = new Vector3();
const stopPoint = new Vector3();
const handTurn = new Quaternion();
const rollPivot = new Vector3();
const rollAxis = new Vector3();
const palmNormal = new Vector3();

/**
 * Places the left hand so that the middle of its finger block presses the strings at a place
 * on the fingerboard. The fingers point up from the strings, tilted over the neck by
 * `BowedHold.tiltL` and the further tilt of a high position, and the palm faces the neck from
 * below. The hand turns around the normal of the strings toward the finger of
 * the note, by `BOWED_HANDS.reachTurn` at a reach of 1, and it rolls around the neck to the
 * string of the finger, by `BOWED_HANDS.rollL` for each string from the middle of the strings.
 *
 * @param rig The points of the player.
 * @param place The place of the instrument.
 * @param strings The strings at their posed place.
 * @param stop The place on the target `fingerboard`: 0 at the nut, 1 at the end.
 * @param curlAngle The curl of the fingers, in radians.
 * @param tilt The further tilt of the hand over the neck, in radians ({@link leftTilt}).
 * @param finger The reach and the string of the finger. {@link MIDDLE_FINGER} gives no turn.
 * @param out The hand to write.
 * @returns `out`, with the wrist and the rotation of the hand.
 */
export function stopHandAt(
  rig: RigPoints,
  place: InstrumentPlace,
  strings: StringsPlace,
  stop: number,
  curlAngle: number,
  tilt: number,
  finger: StopFinger,
  out: StopHand,
): StopHand {
  const fullTilt = rig.hold.tiltL + tilt;
  onInstrument(
    rig,
    place,
    stopPoint.fromArray(rig.nut).addScaledVector(neck.fromArray(rig.neck), stop),
  );
  fingers.fromArray(rig.fingers).applyQuaternion(place.rotation);
  fingersUp
    .copy(strings.top)
    .multiplyScalar(Math.cos(fullTilt))
    .addScaledVector(fingers, Math.sin(fullTilt));
  palmSide
    .copy(fingers)
    .multiplyScalar(Math.cos(fullTilt))
    .addScaledVector(strings.top, -Math.sin(fullTilt));
  // The bind hand hangs: its fingers point to -y, and its palm faces +x.
  setFromBasis(out.rotation, palmSide, fingersUp.negate());
  // The turn toward the finger keeps the middle of the finger block on the stop.
  if (finger.reach !== 0) {
    out.rotation.premultiply(
      handTurn.setFromAxisAngle(
        rollAxis.copy(strings.top).normalize(),
        BOWED_HANDS.reachTurn * finger.reach,
      ),
    );
  }
  curl.setFromAxisAngle(Z_AXIS, curlAngle);
  block.fromArray(rig.fingerBlock).applyQuaternion(curl).add(neck.fromArray(rig.knuckles));
  out.wrist.copy(stopPoint).sub(block.applyQuaternion(out.rotation));

  // The roll around the middle of the neck, below the strings. A positive roll moves the
  // fingers to the high strings, away from the bass side (`top × axis`).
  const rollAngle = BOWED_HANDS.rollL * (finger.stopString - 1.5);
  if (rollAngle !== 0) {
    rollAxis.copy(strings.axis).normalize();
    handTurn.setFromAxisAngle(rollAxis, rollAngle);
    rollPivot
      .copy(strings.top)
      .normalize()
      .multiplyScalar(-BOWED_HANDS.neckDepth * neck.fromArray(rig.neck).length())
      .add(stopPoint);
    out.wrist.sub(rollPivot).applyQuaternion(handTurn).add(rollPivot);
    out.rotation.premultiply(handTurn);
  }
  return out;
}

/**
 * Places the left paw in its rest grip on the neck of a violin or a viola (design 5.2): the
 * playing grip of the middle finger in the first position, at the rest place
 * (`BowedHold.restPlace`), with the fingers closed around the neck by `BowedHold.restCurlL`, off
 * the neck by `BowedHold.restGapL`, and turned a little around the normal of the top plate through
 * the middle of the neck by `BowedHold.restYawL`. The paw that the viewer sees then turns at the
 * wrist in the plane of its palm by `BowedHold.restPawTurnL` in place of the turn of the retarget
 * (`carryLift()`, design 4.4), as the paw of the play turns toward a forearm along the neck. Thus
 * the paw holds the neck from the side of the high strings, near the grip of the play.
 *
 * @param rig The points of the player.
 * @param place The place of the instrument.
 * @param strings The strings at their posed place.
 * @param out The hand of the player to write.
 * @returns `out`, with the wrist and the rotation of the hand.
 */
export function restHandAt(
  rig: RigPoints,
  place: InstrumentPlace,
  strings: StringsPlace,
  out: StopHand,
): StopHand {
  const hold = rig.hold;
  stopHandAt(rig, place, strings, hold.restPlace, hold.restCurlL, 0, MIDDLE_FINGER, out);
  // The bind hand palm faces +x: the paw moves to the back of the hand, off the neck.
  palmNormal.set(1, 0, 0).applyQuaternion(out.rotation);
  out.wrist.addScaledVector(palmNormal, -hold.restGapL);
  if (hold.restYawL !== 0) {
    onInstrument(
      rig,
      place,
      stopPoint.fromArray(rig.nut).addScaledVector(neck.fromArray(rig.neck), hold.restPlace),
    );
    rollPivot
      .copy(strings.top)
      .normalize()
      .multiplyScalar(-BOWED_HANDS.neckDepth * neck.length())
      .add(stopPoint);
    handTurn.setFromAxisAngle(rollAxis.copy(strings.top).normalize(), hold.restYawL);
    out.wrist.sub(rollPivot).applyQuaternion(handTurn).add(rollPivot);
    out.rotation.premultiply(handTurn);
  }
  return out;
}

/**
 * Gives the direction of the right elbow: to the back of the hand, so that the forearm comes to
 * the wrist from there. A back of the hand along the line from the shoulder to the wrist gives no
 * clear side, so the direction of the hold takes its place, with a smooth change between them.
 *
 * @param rig The points of the player.
 * @param shoulder The posed shoulder joint.
 * @param hand The right hand.
 * @param hold The direction of the hold, in the model axes.
 * @param follow The share of the turn to the back of the hand, from 0 to 1.
 * @param out The vector to write. It must not be `hold`.
 * @returns `out`, with the direction in the model axes.
 */
function elbowPole(
  rig: RigPoints,
  shoulder: Vector3,
  hand: BowHand,
  hold: Vector3,
  follow: number,
  out: Vector3,
): Vector3 {
  armLine.subVectors(hand.wrist, shoulder).normalize();
  out.copy(hold);
  out.addScaledVector(armLine, -out.dot(armLine)).normalize();

  // The point that the elbow takes with a straight wrist, seen from the line of the arm.
  backOfHand
    .set(0, 1, 0)
    .applyQuaternion(hand.rotation)
    .multiplyScalar(rig.forearm)
    .add(hand.wrist)
    .sub(shoulder)
    .normalize();
  backOfHand.addScaledVector(armLine, -backOfHand.dot(armLine));
  const side = backOfHand.length();
  if (side < 1e-9) {
    return out;
  }

  const share = smoothstep(Math.min(1, side / CLEAR_AIM)) * follow;
  return out.multiplyScalar(1 - share).addScaledVector(backOfHand, share / side);
}

/**
 * Moves the contact point of the bow along the strings to the sounding point of the loudness
 * (design 5.3): from `BowedHold.soundingPoint[0]` of the string length from the bridge in piano to
 * `BowedHold.soundingPoint[1]` in forte. A louder note plays nearer to the bridge
 * (`docs/reference/string-technique.md`, section 2.4).
 *
 * @param rig The points of the player.
 * @param loudness The loudness that the sounding point follows, from 0 to 1.
 * @param strings The strings at their posed place. The function moves the contact point in place.
 * @returns `strings`.
 */
function soundingPointAt(rig: RigPoints, loudness: number, strings: StringsPlace): StringsPlace {
  const [piano, forte] = rig.hold.soundingPoint;
  const share = piano + (forte - piano) * loudness;
  strings.contact.addScaledVector(strings.axis, (share - rig.contactShare) * rig.stringLength);
  return strings;
}

const meanTilted: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const meanBow: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const meanHand: BowHand = { wrist: new Vector3(), rotation: new Quaternion() };
const meanArm = createArmPose();

/**
 * Gives the direction of the right elbow in a fast run across two strings (design 5.3,
 * `docs/reference/string-technique.md`, section 2.3): the direction to the elbow of the bow on the
 * string of the arm (`BowState.crossMean`), the mean string of the run. With this direction, the
 * elbow stays as near to that elbow as the place of the wrist lets it, so the upper arm moves less
 * in a crossing, and the forearm and the wrist make the rest.
 *
 * @param rig The points of the player.
 * @param strings The strings at their posed place.
 * @param state The bow state.
 * @param shoulder The posed shoulder joint and the rotation of the `shoulder` bone.
 * @param hold The direction of the elbow of the hold, in the model axes.
 * @param out The direction to write, in the model axes. It must not be `hold`.
 * @returns `out`.
 */
function crossPole(
  rig: RigPoints,
  strings: StringsPlace,
  state: BowState,
  shoulder: { readonly position: Vector3; readonly rotation: Quaternion },
  hold: Vector3,
  out: Vector3,
): Vector3 {
  heldBowAt(rig, strings, state.crossMean, state.bow, state.lift, meanTilted, meanBow);
  gripHand(rig, meanBow, 0, meanHand);
  let elbow = solveArm(
    rig.armR.bind,
    shoulder.position,
    shoulder.rotation,
    meanHand.wrist,
    hold,
    meanArm,
  ).elbow;
  gripHand(rig, meanBow, rollToward(rig, meanBow, elbow), meanHand);
  elbow = solveArm(
    rig.armR.bind,
    shoulder.position,
    shoulder.rotation,
    meanHand.wrist,
    hold,
    meanArm,
  ).elbow;
  return out.subVectors(elbow, shoulder.position).normalize();
}

/** The places that the bow pose writes. */
interface BowPlaces {
  /** The instrument. */
  readonly place: InstrumentPlace;
  /** The strings of the instrument. */
  readonly strings: StringsPlace;
  /** The bow on the strings. */
  readonly bow: BowPlace;
  /** The right hand that holds the bow. */
  readonly hand: BowHand;
}

/**
 * Makes the places that the bow pose writes.
 *
 * @returns The place of the instrument, the strings, the bow, and the bow hand.
 */
export function createBowPlaces(): BowPlaces {
  return {
    place: {
      local: new Quaternion(),
      rotation: new Quaternion(),
      pivot: new Vector3(),
      offset: new Vector3(),
    },
    strings: {
      contact: new Vector3(),
      axis: new Vector3(),
      top: new Vector3(),
      across: new Vector3(),
    },
    bow: { grip: new Vector3(), rotation: new Quaternion() },
    hand: { wrist: new Vector3(), rotation: new Quaternion() },
  };
}

const places = createBowPlaces();
/** The instrument on its short path in a move, for the bow ({@link poseBowed}). */
const bowInstrument = createPlace();
const tilted: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const shoulderR = createFrame();
const shoulderL = createFrame();
const turn = new Quaternion();
const turnL = new Quaternion();
const tip = new Vector3();
const tipSide = new Vector3();
const pluckBow: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const pluckHand: BowHand = { wrist: new Vector3(), rotation: new Quaternion() };
const palmOffset = new Vector3();
const restBow: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const viaRotation = new Quaternion();
const viaReach = new Vector3();
const held: BowPlace = { grip: new Vector3(), rotation: new Quaternion() };
const stickBind = new Vector3();
const pluckPalm = new Vector3();
const bowLocal = new Quaternion();
const bowBack = new Quaternion();
const backOfHand = new Vector3();
const armLine = new Vector3();
const aim = new Vector3();
const wristR = new Vector3();
const solved = createArmPose();
const poleR = new Vector3();
const chestInverse = new Quaternion();
const poleTuple: [number, number, number] = [0, 0, 0];
/** The number of times that the hand rolls to the elbow and the elbow turns to the hand. */
const ROLL_PASSES = 3;

/**
 * The largest difference between the roll of the hand around a moving bow and the mix of the
 * rolls of the two holds, in radians.
 */
const ROLL_SPREAD = 30 * MathUtils.DEG2RAD;
const pole = new Vector3();
const holdPole = new Vector3();
const tipPole = new Vector3();
const poleL = new Vector3();
const restPole = new Vector3();
const handL: StopHand = { wrist: new Vector3(), rotation: new Quaternion() };

/**
 * Moves the rest bow of a hold with a via ({@link BowedRig}) for the lift and the lowering (design
 * 5.2): the pose mixes the moved rest bow and the playing bow by the weight of the playing pose.
 * The rest bow turns toward the via, all the way at the weight 0.5, so that the tip of an upright
 * bow turns through the side of the via and not through the head. The grip moves by
 * `4 × weight` times the reach of the via, so that the mixed grip moves by the reach at the weight
 * 0.5, and by 0 at the rest and at the play.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @param bow The rest bow, in the posed axes. The function changes it in place.
 */
function liftVia(rig: RigPoints, frames: TorsoFrames, weight: number, bow: BowPlace): void {
  const via = rig.restBow.via;
  if (!via || weight <= 0 || weight >= 1) {
    return;
  }
  const share = Math.sin(Math.min(Math.PI / 2, Math.PI * weight));
  viaRotation.fromArray(via.rotation).premultiply(frames.root.rotation);
  mixRotation(bow.rotation, viaRotation, share, bow.rotation);
  bow.grip.addScaledVector(
    viaReach.fromArray(via.reach).applyQuaternion(frames.root.rotation),
    4 * weight,
  );
}

/** The turn from the posed instrument to its place in the playing pose. Each pose writes it. */
const toPlay = new Quaternion();

/**
 * Turns a quaternion to the short turn: the quaternion with w ≥ 0.
 *
 * @param q The quaternion. The function changes it in place.
 * @returns `q`.
 */
function shortTurn(q: Quaternion): Quaternion {
  return q.w < 0 ? q.set(-q.x, -q.y, -q.z, -q.w) : q;
}

/**
 * Writes {@link toPlay}: the turn that moves the instrument from its posed place in a lift or a
 * lowering to its place in the playing pose, in the model axes. The instrument takes the short
 * turn from the rest to the play, so the short turn gives the turn.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param place The posed place of the instrument.
 */
function turnToPlay(rig: RigPoints, frames: TorsoFrames, place: InstrumentPlace): void {
  const parent = rig.parent === BONES.chest ? frames.chest : frames.root;
  placeInverse.copy(place.rotation).invert();
  toPlay.copy(parent.rotation).multiply(playTurn.fromArray(rig.hold.playTurn));
  shortTurn(toPlay.multiply(placeInverse));
}

/**
 * Mixes the rest bow and the playing bow, or the hands on them, by the weight of the playing pose
 * (design 5.2). The bow on the strings of the moving instrument turns with it, and it comes near
 * 180° from the rest bow in the middle of the move. There, the short path of {@link mixRotation}
 * can jump to the other side and turn the bow paw by about 170° in one frame. So the side of the
 * path comes from the playing bow at its place in the playing pose ({@link toPlay}), which stays
 * far from 180°: the path is the same up to that point, and it keeps its side after it. At the
 * rest and at the play, the mix is the same.
 *
 * @param from The rest bow or hand, moved by {@link liftVia}.
 * @param play The playing bow or hand on the posed instrument.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @param out The quaternion to write. It can be `from` or `play`.
 * @returns `out`.
 */
function liftMix(from: Quaternion, play: Quaternion, weight: number, out: Quaternion): Quaternion {
  if (weight <= 0 || weight >= 1) {
    return mixRotation(from, play, weight, out);
  }
  const sign = from.dot(playBow.copy(play).premultiply(toPlay)) < 0 ? -1 : 1;
  return out
    .set(
      from.x + (sign * play.x - from.x) * weight,
      from.y + (sign * play.y - from.y) * weight,
      from.z + (sign * play.z - from.z) * weight,
      from.w + (sign * play.w - from.w) * weight,
    )
    .normalize();
}

/** The playing bow at its place in the playing pose, for {@link liftMix}. */
const playBow = new Quaternion();

/** The inverse of the turn of the posed instrument, for {@link turnToPlay}. */
const placeInverse = new Quaternion();

/** The finger of the left hand that the pose writes before each use. */
const finger = { reach: 0, stopString: 1.5 } satisfies StopFinger;

/**
 * The places of the hand frame of the violin in the fourth and in the sixth positions, on the
 * target `fingerboard`. Between them, the left elbow turns by `BowedHold.highElbow`: on the
 * violin and the viola, the hand goes over the shoulder of the instrument, and the elbow swings a
 * little toward the body (`docs/reference/string-technique.md`, section 1.5).
 */
const HIGH_ELBOW = [
  handPlaceOf(HAND_FRAMES.violin, 7),
  handPlaceOf(HAND_FRAMES.violin, 10),
] as const;

/**
 * The places of the hand frame of the violin in the second and in the fifth positions (the first
 * finger 3 and 8 semitones above the open string), on the target `fingerboard`. Between them, the
 * left hand tilts further over the neck by `BowedHold.highTilt`. A real hand goes up and over the
 * shoulder of the instrument from the third position to the sixth position
 * (`docs/reference/string-technique.md`, section 1.5). The tilt starts and ends one position
 * earlier, because the left forearm of the cat touches the upper bout of the viola from the third
 * position.
 */
const HIGH_HAND = [handPlaceOf(HAND_FRAMES.violin, 3), handPlaceOf(HAND_FRAMES.violin, 8)] as const;

/**
 * Gives the further tilt of the left hand over the neck while the player plays (design 5.3): 0
 * up to the second position, `BowedHold.highTilt` from the fifth position, and a smooth change
 * between them ({@link HIGH_HAND}). The wrist comes up beside the shoulder of the instrument,
 * and the finger block keeps its place on the strings.
 *
 * @param hold The hold of the instrument.
 * @param fingerboard The place of the hand frame on the target `fingerboard`: 0 at the nut, 1 at
 *   the end.
 * @returns The tilt, in radians.
 */
function leftTilt(hold: BowedHold, fingerboard: number): number {
  const [from, to] = HIGH_HAND;
  return hold.highTilt * smoothstep((fingerboard - from) / (to - from));
}

const turnAxis = new Vector3();
const elbowToward = new Vector3();

/**
 * Gives the direction of the left elbow while the player plays (design 5.3): the direction of
 * the hold, turned toward `BowedHold.elbowToward` by `BowedHold.elbowPerString` for each string
 * of the finger below the highest string, and by `BowedHold.highElbow` from the fourth position
 * to the sixth position. The violin and the viola bring the elbow toward the body for the low
 * strings, and the cello and the contrabass raise it (`docs/reference/string-technique.md`,
 * section 1.8).
 *
 * @param hold The hold of the instrument.
 * @param state The bow state: the string of the finger and the place of the hand.
 * @param out The direction to write, in the axes of the chest.
 * @returns `out`.
 */
function leftElbow(
  hold: BowedHold,
  state: Pick<BowState, 'stopString' | 'fingerboard'>,
  out: Vector3,
): Vector3 {
  out.fromArray(hold.poleL);
  const [from, to] = HIGH_ELBOW;
  const angle =
    hold.elbowPerString * (3 - state.stopString) +
    hold.highElbow * smoothstep((state.fingerboard - from) / (to - from));
  turnAxis.crossVectors(out, elbowToward.fromArray(hold.elbowToward));
  const length = turnAxis.length();
  if (angle === 0 || length < 1e-9) {
    return out;
  }
  return out.applyAxisAngle(turnAxis.multiplyScalar(1 / length), angle);
}

/** The left elbow in the middle of the move, for {@link leftPole}. */
const liftPole = new Vector3();

/**
 * Gives the direction of the left elbow at a weight of the playing pose (design 5.2): the rest
 * pole at the rest, the playing pole at the play, and a mix between them. With a pole of the
 * middle of the move (`BowedHold.liftPoleL`), the elbow turns from the rest pole to it, then to
 * the playing pole.
 *
 * @param rig The points of the player.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @param play The playing pole, in the axes of the chest. The function writes the result into it.
 * @returns `play`, with the pole in the axes of the chest.
 */
function leftPole(rig: RigPoints, weight: number, play: Vector3): Vector3 {
  holdPole.fromArray(rig.restPoleL);
  const midPole = rig.hold.liftPoleL;
  if (!midPole || weight <= 0 || weight >= 1) {
    return mixDirection(holdPole, play, weight, play);
  }
  liftPole.fromArray(midPole);
  return weight < 0.5
    ? mixDirection(holdPole, liftPole, 2 * weight, play)
    : mixDirection(liftPole, play, 2 * weight - 1, play);
}

/** The grip of the left paw on an instrument: the paw in the axes of the instrument. */
interface PawGrip {
  /** The turn of the paw that the viewer sees, from the turn of the instrument. */
  readonly turn: Quaternion;
  /** The wrist from the pivot of the instrument, in the axes of the instrument. */
  readonly wrist: Vector3;
}

/**
 * Makes a grip with no turn at the pivot.
 *
 * @returns The grip.
 */
function createGrip(): PawGrip {
  return { turn: new Quaternion(), wrist: new Vector3() };
}

const toInstrument = new Quaternion();

/**
 * Gives the grip of a paw on an instrument: the paw in the axes of the instrument.
 *
 * @param place The place of the instrument.
 * @param wrist The wrist of the paw.
 * @param seen The world rotation of the paw that the viewer sees ({@link turnedPaw}).
 * @param out The grip to write.
 * @returns `out`.
 */
function gripOf(place: InstrumentPlace, wrist: Vector3, seen: Quaternion, out: PawGrip): PawGrip {
  toInstrument.copy(place.rotation).invert();
  out.turn.multiplyQuaternions(toInstrument, seen);
  out.wrist.copy(wrist).sub(place.pivot).applyQuaternion(toInstrument);
  return out;
}

/** The scratch objects of {@link carryLift}. */
const liftRest = createPlace();
const liftPlay = createPlace();
const carryStrings = createBowPlaces().strings;
const restHand: StopHand = { wrist: new Vector3(), rotation: new Quaternion() };
const playHand: StopHand = { wrist: new Vector3(), rotation: new Quaternion() };
const carryShoulder = createFrame();
const carryTurn = new Quaternion();
const carryPole = new Vector3();
const carryArm = createArmPose();
const handInRest = new Quaternion();
const handInPlay = new Quaternion();
const handInMix = new Quaternion();
const gripRest = createGrip();
const gripPlay = createGrip();
const gripTurn = new Quaternion();
const gripWrist = new Vector3();
const carryPoint = new Vector3();
const carryRestPole = new Vector3();
const carryFore = new Vector3();
const playFinger = { reach: 0, stopString: MIDDLE_FINGER.stopString } satisfies StopFinger;
const playPoleL = new Vector3();

const armForearm = new Vector3();
const armUpper = new Vector3();
const armHinge = new Vector3();
const armBindTurn = new Quaternion();

/**
 * Gives the frame of the left arm from its joints: the turn that moves the forearm and the elbow
 * axis of the bind pose to the posed forearm and the posed elbow axis (`upper × forearm`). The
 * twist of the paw in this frame is the twist that the studio retarget gives the forearm (design
 * 4.4), and it does not depend on the path of the arm. The bind arm hangs, so its elbow axis is
 * +x, normal to the forearm.
 *
 * @param rig The points of the player.
 * @param shoulder The posed shoulder joint.
 * @param elbow The posed elbow joint.
 * @param wrist The posed wrist joint.
 * @param out The quaternion to write.
 * @returns `out`.
 */
function armFrame(
  rig: RigPoints,
  shoulder: Vector3,
  elbow: Vector3,
  wrist: Vector3,
  out: Quaternion,
): Quaternion {
  const bind = rig.armL.bind;
  armForearm.fromArray(bind.wrist).sub(carryPoint.fromArray(bind.elbow)).normalize();
  armHinge.set(1, 0, 0).addScaledVector(armForearm, -armForearm.x).normalize();
  setFromBasis(armBindTurn, armHinge, armForearm).invert();
  armForearm.subVectors(wrist, elbow).normalize();
  armUpper.subVectors(elbow, shoulder).normalize();
  armHinge.crossVectors(armUpper, armForearm);
  if (armHinge.lengthSq() < 1e-8) {
    // A straight arm has no plane: the elbow axis of the bind pose turns with the forearm.
    armHinge.set(1, 0, 0).addScaledVector(armForearm, -armForearm.x);
  }
  setFromBasis(out, armHinge.normalize(), armForearm);
  return out.multiply(armBindTurn);
}

/**
 * Gives the turn of the left paw in the frame of its arm ({@link armFrame}), with the arm solved to
 * the wrist of the paw. It leaves the solved arm in the module value `carryArm`.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param weight The weight of the playing pose, for the turn of the left shoulder bone.
 * @param poleIn The direction of the left elbow, in the axes of the chest.
 * @param hand The paw.
 * @param out The quaternion to write.
 * @returns `out`.
 */
function handInArm(
  rig: RigPoints,
  frames: TorsoFrames,
  weight: number,
  poleIn: Vector3,
  hand: StopHand,
  out: Quaternion,
): Quaternion {
  const chest = frames.chest;
  shoulderTurnL(rig, weight, carryTurn);
  const shoulder = poseShoulder(rig.armL, chest, rig.chestBind, carryTurn, carryShoulder);
  carryPole.copy(poleIn).applyQuaternion(chest.rotation);
  solveArm(rig.armL.bind, shoulder.position, shoulder.rotation, hand.wrist, carryPole, carryArm);
  armFrame(rig, shoulder.position, carryArm.elbow, carryArm.wrist, out);
  return out.invert().multiply(hand.rotation);
}

/**
 * Gives the turn of the left paw toward its forearm that the studio retarget gives the paw of the
 * arm in the module value `carryArm` (`palmTurnAngle()` of `models/studio-rig.ts`, design 4.4).
 *
 * @param hand The world rotation of the hand of the player.
 * @returns The turn, in radians.
 */
function retargetTurn(hand: Quaternion): number {
  carryFore.subVectors(carryArm.wrist, carryArm.elbow).normalize();
  return palmTurnAngle('L', hand, carryFore);
}

const pawTurn = new Quaternion();
const X_AXIS = new Vector3(1, 0, 0);

/**
 * Gives the left paw that the viewer sees: the hand of the player turned in the plane of its palm,
 * as the studio retarget turns it (design 4.4). The instrument hangs from this paw.
 *
 * @param hand The world rotation of the hand of the player.
 * @param angle The turn of the paw in the plane of its palm, in radians.
 * @param out The quaternion to write.
 * @returns `out`.
 */
function turnedPaw(hand: Quaternion, angle: number, out: Quaternion): Quaternion {
  return out.copy(hand).multiply(pawTurn.setFromAxisAngle(X_AXIS, angle));
}

const seenRest = new Quaternion();
const seenPlay = new Quaternion();
const seenMix = new Quaternion();

/**
 * Lets the left paw of a violin or a viola hold the neck at rest in the playing grip
 * ({@link restHandAt}) and carry the instrument from the lap to the jaw and back (design 5.2), as
 * a player lifts the instrument by its neck. The paw leads, and the instrument hangs from the paw
 * that the viewer sees ({@link turnedPaw}): it turns with the paw, in the same direction, as one
 * rigid object in a hand. At rest, the paw takes its own turn in the plane of its palm
 * (`BowedHold.restPawTurnL`) in place of the turn of the retarget toward the forearm, near the
 * turn of the play, so that the grip in the paw changes little. In the move, the paw takes the turn
 * of the retarget plus the rest difference times `(1 - weight)²`: with the difference times
 * `1 - weight`, the claws of the cat go 2.4 cm into the viola in a lowering. The grip in the paw
 * goes on the short path from the rest grip to the playing grip of the note. The wrist moves on a
 * line from its rest place to its playing place, plus `4 × weight × (1 - weight)` times
 * `BowedHold.liftReach`. The twist of the paw on its forearm goes from the rest to the play with a
 * supination ({@link mixTwist}), as a real forearm turns. The bind of the left paw of these bodies
 * is supinated (design 4.4), so the twist of the studio paw stays on one side of 180° on the way.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the torso.
 * @param state The bow state.
 * @param weight The eased weight of the playing pose: 0 is the rest pose.
 * @param note The place of the hand frame on the fingerboard at the play.
 * @param elbow The left elbow at this weight, in the axes of the chest.
 * @param place The place of the instrument to write.
 * @param out The left hand to write.
 * @returns The turn of the left paw in the plane of its palm (`pawTurnL` of `AnimalPose`), or
 *   `null` for an instrument that the paw does not carry and at the play.
 */
function carryLift(
  rig: RigPoints,
  frames: TorsoFrames,
  state: BowState,
  weight: number,
  note: number,
  elbow: Vector3,
  place: InstrumentPlace,
  out: StopHand,
): number | null {
  const hold = rig.hold;
  const restTurn = hold.restPawTurnL;
  if (restTurn === null || !hold.rest || weight >= 1) {
    return null;
  }

  // The rest: the instrument on the lap, and the paw in the playing grip with its own turn.
  instrumentAt(rig, frames, 0, liftRest);
  stringsAt(rig, liftRest, carryStrings);
  restHandAt(rig, liftRest, carryStrings, restHand);
  if (weight <= 0) {
    copyPlace(liftRest, place);
    out.wrist.copy(restHand.wrist);
    out.rotation.copy(restHand.rotation);
    return restTurn;
  }

  // The play: the instrument under the jaw, and the paw in the playing grip of the note.
  instrumentAt(rig, frames, 1, liftPlay);
  stringsAt(rig, liftPlay, carryStrings);
  playFinger.reach = state.reach;
  playFinger.stopString = state.stopString;
  stopHandAt(
    rig,
    liftPlay,
    carryStrings,
    note,
    BOWED_HANDS.curlL,
    leftTilt(hold, state.fingerboard),
    playFinger,
    playHand,
  );

  // The paw at this weight: the wrist on its path, and the twist and the turn mixed.
  handInArm(rig, frames, 0, carryRestPole.fromArray(rig.restPoleL), restHand, handInRest);
  // The rest turn of the paw differs from the turn of the retarget at rest by this angle.
  const restOffset = restTurn - retargetTurn(restHand.rotation);
  turnedPaw(restHand.rotation, restTurn, seenRest);
  const restTwist = studioTwist(rig, restHand.rotation, restTurn);
  handInArm(rig, frames, 1, leftElbow(hold, state, playPoleL), playHand, handInPlay);
  const playAngle = retargetTurn(playHand.rotation);
  turnedPaw(playHand.rotation, playAngle, seenPlay);
  const playTwist = studioTwist(rig, playHand.rotation, playAngle);
  mixTwist(rig, handInRest, handInPlay, playTwist - restTwist, weight, handInMix);
  out.wrist
    .lerpVectors(restHand.wrist, playHand.wrist, weight)
    .addScaledVector(
      liftReach.fromArray(rig.liftReach).applyQuaternion(frames.root.rotation),
      4 * weight * (1 - weight),
    );
  shoulderTurnL(rig, weight, carryTurn);
  const shoulder = poseShoulder(rig.armL, frames.chest, rig.chestBind, carryTurn, carryShoulder);
  carryPole.copy(elbow).applyQuaternion(frames.chest.rotation);
  solveArm(rig.armL.bind, shoulder.position, shoulder.rotation, out.wrist, carryPole, carryArm);
  out.wrist.copy(carryArm.wrist);
  armFrame(rig, shoulder.position, carryArm.elbow, carryArm.wrist, out.rotation).multiply(
    handInMix,
  );
  const angle = retargetTurn(out.rotation) + restOffset * (1 - weight) ** 2;
  turnedPaw(out.rotation, angle, seenMix);

  // The instrument hangs from the paw that the viewer sees, with the grip mixed from the rest grip
  // to the playing grip of the note.
  gripOf(liftRest, restHand.wrist, seenRest, gripRest);
  gripOf(liftPlay, playHand.wrist, seenPlay, gripPlay);
  mixRotation(gripRest.turn, gripPlay.turn, weight, gripTurn);
  gripWrist.lerpVectors(gripRest.wrist, gripPlay.wrist, weight);
  place.rotation.copy(seenMix).multiply(gripTurn.invert());
  place.pivot.copy(out.wrist).sub(gripWrist.applyQuaternion(place.rotation));
  const parent = rig.parent === BONES.chest ? frames.chest : frames.root;
  place.local.copy(parent.rotation).invert().multiply(place.rotation);
  placeOffset(rig, frames, place);
  return angle;
}

/**
 * Copies the place of an instrument.
 *
 * @param from The place to copy.
 * @param out The place to write.
 */
function copyPlace(from: InstrumentPlace, out: InstrumentPlace): void {
  out.local.copy(from.local);
  out.rotation.copy(from.rotation);
  out.pivot.copy(from.pivot);
  out.offset.copy(from.offset);
}

const twistAxis = new Vector3();
const twistRest = new Quaternion();
const twistPlay = new Quaternion();
const swingRest = new Quaternion();
const swingPlay = new Quaternion();

/**
 * Gives the angle of the twist of a turn around an axis: the twist part of the swing and twist
 * split, with the turn as the swing after the twist.
 *
 * @param q The turn.
 * @param axis The unit axis.
 * @returns The angle, from -π to π.
 */
function twistOf(q: Quaternion, axis: Vector3): number {
  const angle = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Gives the twist of the left paw on its forearm from the bind of the studio body, for the arm in
 * the module values `carryShoulder` and `carryArm` (`studioPawTwist()` of `models/studio-rig.ts`).
 *
 * @param rig The points of the player.
 * @param hand The world rotation of the hand of the player.
 * @param palmTurn The turn of the paw in the plane of its palm, in radians.
 * @returns The twist, from -π to π.
 */
function studioTwist(rig: RigPoints, hand: Quaternion, palmTurn: number): number {
  const { position } = carryShoulder;
  return studioPawTwist(rig.pawBindL, position, carryArm.elbow, carryArm.wrist, hand, palmTurn);
}

/**
 * Mixes two turns of the left paw in the frame of its arm ({@link armFrame}, design 5.2): the
 * twist around the forearm goes on a straight line from its first angle to its second angle, and
 * the rest of the turn, the bend of the wrist, mixes on its own. The twist takes the way on which
 * the twist of the studio paw from its bind stays between -π and π (`studio`), so that the twist
 * bone of the forearm does not turn over in the move. On a supinated bind paw, this way is a
 * supination, as a real forearm turns from the rest grip to the playing grip of a violin. On a
 * pronated bind paw, the playing grip lies past π in the supination, so the paw turns the other way,
 * through the direction of no paw twist. A mix of the whole turns can bend the wrist far past both
 * ends in the middle.
 *
 * @param rig The points of the player.
 * @param from The turn at the weight 0.
 * @param to The turn at the weight 1.
 * @param studio The change of the twist of the studio paw from the rest to the play, from -2π to
 *   2π, with both ends between -π and π.
 * @param weight The weight.
 * @param out The quaternion to write. It must not be `from` or `to`.
 * @returns `out`.
 */
function mixTwist(
  rig: RigPoints,
  from: Quaternion,
  to: Quaternion,
  studio: number,
  weight: number,
  out: Quaternion,
): Quaternion {
  const bind = rig.armL.bind;
  twistAxis.fromArray(bind.wrist).sub(carryPoint.fromArray(bind.elbow)).normalize();
  const a = twistOf(from, twistAxis);
  const b = twistOf(to, twistAxis);
  const change = b - a + 2 * Math.PI * Math.round((studio - (b - a)) / (2 * Math.PI));
  swingRest.copy(from).multiply(twistRest.setFromAxisAngle(twistAxis, -a));
  swingPlay.copy(to).multiply(twistPlay.setFromAxisAngle(twistAxis, -b));
  mixRotation(swingRest, swingPlay, weight, out);
  return out.multiply(twistRest.setFromAxisAngle(twistAxis, a + change * weight));
}

/**
 * Gives the curl of the left fingers at rest: the curl of the rest grip of a violin or a viola
 * ({@link restHandAt}), and none for a hold with no rest grip.
 *
 * @param hold The hold of the instrument.
 * @returns The curl, in radians.
 */
function restCurlOf(hold: BowedHold): number {
  return hold.restPawTurnL === null ? 0 : hold.restCurlL;
}

/**
 * Writes the arms and the instrument of a bowed string player (design 5.3, 4.7). The bow plays
 * on the strings at the place of the bow state, on the string of the stroke, and lifts in a rest.
 * Pizzicato moves the right hand over the strings near the end of the fingerboard to pluck. The
 * middle of the left finger block presses the strings at the middle of the hand frame of the
 * position on the fingerboard, and the hand moves only in a shift and in the vibrato. The block
 * turns toward the finger of the note and rolls to its string, the hand tilts further over the
 * neck in a high position, and the left elbow follows the string. The two-bone IK places each arm. In the rest pose (design 5.2), the violin and
 * the viola stand on the left thigh, and the left fingers keep the strings. The right hand holds
 * the bow on the right thigh.
 *
 * The right elbow points to the directions of the hold, so that the arms stay out of the body.
 * The right hand rolls around the stick so that the back of the hand points to the elbow. In the
 * middle of a change between the bow and pizzicato, the elbow turns a part of the way to the back
 * of the hand. The `bow` bone turns back by the roll, so that the hair stays on the strings.
 *
 * The caller writes the lean of the hold into the spine before it calculates the frames.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the root and of the chest.
 * @param state The bow state at the song time of the note layer.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2, 5.5).
 * @param rotations The rotations of the pose to write.
 * @param offset The instrument offset of the pose to write: the move of the violin and the viola
 *   to the lap.
 * @returns The turn of the left paw in the plane of its palm that the retarget takes in place of
 *   its own turn (`pawTurnL` of `AnimalPose`): the turn of the playing grip of a carried violin or
 *   viola at rest and in the lift and the lowering ({@link carryLift}), else `null`.
 */
export function poseBowed(
  rig: BowedRig,
  frames: TorsoFrames,
  state: BowState,
  weight: number,
  rotations: Float32Array,
  offset: [number, number, number],
): number | null {
  const h = BOWED_HANDS;
  const chest = frames.chest;
  const { place, strings, bow, hand: heldHand } = places;
  instrumentAt(rig, frames, weight, place);
  // The place of the left hand on the fingerboard: the place of its hand frame at the play, in the
  // part of the fingerboard that the arm reaches, with the vibrato, and the place of the rest.
  const [low, high] = rig.stopRange;
  const note = low + (state.fingerboard + state.vibrato) * (high - low);
  const stop = stopAt(rig.hold, note, weight);
  leftElbow(rig.hold, state, poleL);
  leftPole(rig, weight, poleL);
  const pawTurnL = carryLift(rig, frames, state, weight, note, poleL, place, handL);
  const carried = pawTurnL !== null;
  // In a move, the bow goes to the strings of the instrument on its short path from the rest to
  // the play: on the strings of the carried instrument, the bow arm goes 6.3 cm into the body of
  // the cat in a lowering. The two paths meet at the play.
  const bowPlace = carried ? instrumentAt(rig, frames, weight, bowInstrument) : place;
  turnToPlay(rig, frames, bowPlace);
  soundingPointAt(rig, state.loudness, stringsAt(rig, bowPlace, strings));
  // The hand holds the bow with no tilt, and the fingers turn the stick by the tilt.
  const tilt = heldBowAt(rig, strings, state.string, state.bow, state.lift, tilted, bow);

  // Pizzicato: the right palm above the strings, with the bow tip up.
  tip.fromArray(rig.hold.pizzicatoTip).applyQuaternion(chest.rotation);
  tip.addScaledVector(strings.axis, -tip.dot(strings.axis)).normalize();
  setFromBasis(
    pluckBow.rotation,
    tip,
    tipSide.crossVectors(tip, strings.axis).normalize(),
  ).multiply(bowAlign.fromArray(rig.bowAlign));
  onInstrument(rig, bowPlace, pluckPalm.fromArray(rig.pluck))
    .addScaledVector(strings.top, h.pluckHeight)
    .addScaledVector(strings.across, state.pluck * h.pluck * state.gesture - rig.hold.pluckSide);
  pluckBow.grip.copy(pluckPalm);

  // The right shoulder turns forward while the player plays.
  const pizzicato = smoothstep(state.pizzicato);
  shoulderTurn(rig, weight, turn);
  const shoulder = poseShoulder(rig.armR, chest, rig.chestBind, turn, shoulderR);

  // In the rest pose, the hand holds the bow on the right thigh.
  restBow.rotation.fromArray(rig.restBow.rotation).premultiply(frames.root.rotation);
  posePoint(frames.root, ORIGIN, rig.restBow.grip, restBow.grip);
  liftVia(rig, frames, weight, restBow);

  // First the hand keeps the hold of the bind pose, and the elbow the direction of the hold.
  liftMix(restBow.rotation, bow.rotation, weight, held.rotation);
  held.grip.lerpVectors(restBow.grip, bow.grip, weight);
  gripHand(rig, held, 0, heldHand);
  wristR.lerpVectors(heldHand.wrist, pluckPalm, pizzicato * weight);
  // The right elbow points out to the side in the rest pose. While the player plays, it turns
  // from the direction of the frog to the direction of the tip with the place of the bow, and to
  // the direction of pizzicato in a change.
  // Each mix runs only when it changes the direction, to keep the time of a frame.
  const [bowLow, bowHigh] = rig.bowRange;
  const tipShare = MathUtils.clamp((state.bow - bowLow) / (bowHigh - bowLow), 0, 1);
  restPole.fromArray(rig.hold.poleR);
  if (tipShare > 0) {
    mixDirection(restPole, tipPole.fromArray(rig.hold.poleTipR), tipShare, restPole);
  }
  restPole.applyQuaternion(chest.rotation);
  if (weight < 1) {
    mixDirection(
      holdPole.fromArray(rig.restPoleR).applyQuaternion(frames.root.rotation),
      restPole,
      weight,
      holdPole,
    );
  } else {
    holdPole.copy(restPole);
  }
  if (pizzicato * weight > 0) {
    mixDirection(
      holdPole,
      tipPole.fromArray(rig.hold.polePizzicato).applyQuaternion(chest.rotation),
      pizzicato * weight,
      holdPole,
    );
  }
  // In a fast run across two strings, the elbow keeps the mean string of the run. In the lift and
  // the lowering, the rule fades in over the second half of the move, because the arm then comes
  // from the rest pose and not from the bow of the mean string.
  const crossShare = smoothstep(2 * weight - 1) * (1 - pizzicato);
  if (state.crossMean !== state.string && crossShare > 0) {
    mixDirection(
      holdPole,
      crossPole(rig, strings, state, shoulder, holdPole, tipPole),
      crossShare,
      holdPole,
    );
  }
  pole.copy(holdPole);
  aim.copy(
    solveArm(rig.armR.bind, shoulder.position, shoulder.rotation, wristR, pole, solved).elbow,
  );

  // Then the hand rolls so that its back points to the elbow, three times. In the middle of a
  // change, the elbow also turns a part of the way to the back of the hand. Each hold of the bow has its own roll. A change moves the bow, and the
  // roll of the hand stays near the mix of the rolls of the two holds: the roll of the moving bow
  // alone can pass the far side of the stick. The plucking palm is above the strings: the grip of
  // the plucking bow follows the palm.
  let angle = 0;
  const steady = weight === 1 && pizzicato === 0;
  const follow = weight * rig.hold.followChange * Math.sin(Math.PI * pizzicato);
  for (let pass = 0; pass < ROLL_PASSES; pass++) {
    const bowRoll = rollToward(rig, bow, aim);
    if (steady) {
      // The bow plays: the hand holds it with its own roll.
      angle = bowRoll;
      gripHand(rig, bow, angle, heldHand);
    } else {
      let pluckRoll = 0;
      if (pizzicato > 0) {
        pluckRoll = rollToward(rig, pluckBow, aim);
        gripHand(rig, pluckBow, pluckRoll, pluckHand);
        pluckHand.wrist
          .copy(pluckPalm)
          .sub(palmOffset.fromArray(rig.armR.palm).applyQuaternion(pluckHand.rotation));
        pluckBow.grip.fromArray(rig.grip).applyQuaternion(pluckHand.rotation).add(pluckHand.wrist);
      }
      const playRoll = bowRoll + (pluckRoll - bowRoll) * pizzicato;

      // A change to pizzicato turns the hand in its own axes, and the bow turns in the hand.
      gripHand(rig, bow, bowRoll, heldHand);
      if (pizzicato > 0) {
        mixRotation(heldHand.rotation, pluckHand.rotation, pizzicato, heldHand.rotation);
        heldHand.wrist.lerpVectors(heldHand.wrist, pluckHand.wrist, pizzicato);
      }
      held.rotation
        .copy(heldHand.rotation)
        .multiply(bowLocal.setFromAxisAngle(stickBind.fromArray(rig.stick), -playRoll));
      held.grip.fromArray(rig.grip).applyQuaternion(heldHand.rotation).add(heldHand.wrist);
      const restRoll = weight < 1 ? rollToward(rig, restBow, aim) : 0;
      liftMix(restBow.rotation, held.rotation, weight, held.rotation);
      held.grip.lerpVectors(restBow.grip, held.grip, weight);
      const mixed = restRoll + (playRoll - restRoll) * weight;
      const own = rollToward(rig, held, aim);
      angle = MathUtils.clamp(own, mixed - ROLL_SPREAD, mixed + ROLL_SPREAD);
      gripHand(rig, held, angle, heldHand);
    }
    if (follow > 0) {
      elbowPole(rig, shoulder.position, heldHand, holdPole, follow, pole);
    }
    aim.copy(
      solveArm(rig.armR.bind, shoulder.position, shoulder.rotation, heldHand.wrist, pole, solved)
        .elbow,
    );
  }

  // The hand turns on the stick, so that the paw keeps its place on the stick.
  const keep = rig.hold.stickTurnR;
  const onStick =
    keep === null
      ? 0
      : turnOnStick(rig, keep, shoulder.position, shoulder.rotation, pole, heldHand);

  poleR.copy(pole).applyQuaternion(chestInverse.copy(chest.rotation).invert()).toArray(poleTuple);
  writeArm(
    { arm: rig.armR, shoulder, wrist: heldHand.wrist, hand: heldHand.rotation, pole: poleTuple },
    chest.rotation,
    rotations,
  );

  // The bow turns back in the hand by the roll, so that its hair keeps its side, and the fingers
  // turn it by the tilt while the bow plays. It also turns back by the turn of the hand on the
  // stick, so that it keeps its place.
  bowLocal.setFromAxisAngle(
    stickBind.fromArray(rig.stick),
    tilt * weight * (1 - pizzicato) - angle,
  );
  if (onStick !== 0) {
    bowLocal.premultiply(bowBack.setFromAxisAngle(X_AXIS, -onStick));
  }
  setBoneRotation(rotations, BONES.bow, bowLocal);

  // The left hand keeps the place of its hand frame on the fingerboard, in the part of the
  // fingerboard that the arm reaches, and moves with the vibrato. It turns toward the finger of
  // the note and rolls to its string, and in a high position it tilts further over the neck. In
  // the rest pose, it keeps the place of the rest. The press of a note curls the fingers more, but
  // it does not move the hand.
  finger.reach = state.reach * weight;
  finger.stopString = MIDDLE_FINGER.stopString + (state.stopString - 1.5) * weight;
  const handTilt = leftTilt(rig.hold, state.fingerboard) * weight;
  if (!carried) {
    stopHandAt(rig, place, strings, stop, h.curlL * weight, handTilt, finger, handL);
  }
  shoulderTurnL(rig, weight, turnL);
  const shoulderFrameL = poseShoulder(rig.armL, chest, rig.chestBind, turnL, shoulderL);
  writeArm(
    {
      arm: rig.armL,
      shoulder: shoulderFrameL,
      wrist: handL.wrist,
      hand: handL.rotation,
      pole: poleL.toArray(poleTuple),
    },
    chest.rotation,
    rotations,
  );

  setBoneRotation(rotations, rig.armR.bones.shoulder, turn);
  setBoneRotation(rotations, rig.armL.bones.shoulder, turnL);
  setBoneRotation(rotations, BONES.instrument, place.local);
  place.offset.toArray(offset);
  // The fingers close around the neck in the rest grip of a violin or a viola.
  const restCurl = restCurlOf(rig.hold);
  const playCurl = h.curlL + h.pressL * state.press * state.gesture;
  writeCurl(rig.armL, restCurl + (playCurl - restCurl) * weight, rotations);
  writeCurl(rig.armR, h.curlR, rotations);
  return pawTurnL;
}
