import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { BATON_ALONG, BATON_TOP } from '../models/instruments/baton.ts';
import { placePoint } from '../models/instruments/hold.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { NO_TURN, X_AXIS, Y_AXIS, Z_AXIS } from './axes.ts';
import { mixPole, mixRotation } from './blend.ts';
import type { BatonState } from './conductor-notes.ts';
import type { CueState } from './cues.ts';
import type { LeftHandState } from './conductor-left.ts';
import { createFrame, setBoneRotation, setFromBasis } from './frames.ts';
import type { Frame, TorsoFrames } from './frames.ts';
import { hangingArm, hangingHand, hangingWrist } from './hang.ts';
import type { HangingArm } from './hang.ts';
import { armRig, handToward, limitReach, poseShoulder, writeArm, writeCurl } from './ik.ts';
import type { ArmRig } from './ik.ts';
import { plantedLegs } from './side-move.ts';
import type { PlantedLegs } from './side-move.ts';

/**
 * The hold of the baton and of the left hand of the conductor (design 5.4). The places are in
 * head heights `H` of the bear of the cast, the studio bear (0.313 m), in the model axes of the
 * bind pose: the bear faces -z, and its left is -x. The places of the left hand and the elbows
 * keep their values in `H`. The butt of the baton lies in the palm ({@link BATON_ALONG}), and
 * its point and pivot keep the direction of the hold of the mesh bear at 0.93 of its meters.
 * `CUE_MOTION` of `cues.ts` gives the directions of a cue.
 */
export const CONDUCTOR_HOLD = {
  /**
   * The point of the tip of the baton at beat 1 of each pattern, from the right shoulder joint.
   * With the pivot, it puts the wrist of beat 1 about 0.4 H below the shoulder joint, 0.6 H
   * forward, and 0.5 H out: in front of the lower chest, the ictus of a real conductor
   * (`conductor-technique.md`, section 1). The arcs and the loud passages then move the wrist up
   * to about the shoulder joint (median of the play), and the largest loud beats to about the
   * chin, 0.5 H above the shoulder joint. With the tip 0.71 H higher and 0.41 H further forward,
   * the wrist of beat 1 was 0.24 H above the shoulder joint, the median of the play was at the
   * chin, and from the stage camera the two paws stood at the height of the ears. That tip was
   * also 0.12 H further out, and the arm was straight at beat 1. The tip stays about 0.1 m above
   * the top edge of the desk of the conductor stand. The tip is in front of the shoulder, so that
   * the baton points in.
   */
  beatPoint: [0.23, -0.025, -2.02],
  /**
   * The baton points from this place to its tip, from the right shoulder joint: forward, up 18°,
   * and 12° inward at beat 1, as a conductor points it at the players. The forearm points a
   * little out of the baton, so that the baton is a longer line of the forearm, a little in
   * (`conductor-technique.md` 7a): 32° off the forearm (p50 of the play). With 20° inward, the
   * baton stood 53° off the forearm. With 3.5° inward (19° off the forearm), the baton touched
   * the desk of the stand when the arms came down after the final chord of `beethoven-8-4`. With
   * 25° up, the baton rises past the face in the views from the front. The pivot is about 1 m
   * from the tip, about twice as far as the wrist, so that the wrist follows about half of the
   * motion of the tip in the beat plane, and the arm beats with the baton.
   */
  batonPivot: [0.83, -0.93, 0.76],
  /**
   * The left elbow points down and out to the side, so that it hangs a little away from the body
   * below the shoulder, as the elbow of a real conductor. With the elbow more out than down
   * (-1, -0.45, -0.3), the upper arm stood out to the side, and the left upper arm twisted 30°
   * (p95 of `pnpm arm-check conductor`, the base 8°). With the low quiet place, the upper arm
   * presses up to about 3 cm into the arm root, as in the rest pose (`pnpm pose-depth
   * conductor`).
   */
  poleL: [-1, -1, 0],
  /**
   * The right elbow points down and out to the side, as the elbow of a conductor is a little away
   * from the body. Thus the forearm points forward and in to the paw, and the baton continues its
   * line (`conductor-technique.md` 7a). With the elbow more out than down (1, -0.4, -0.2), the
   * right upper arm twisted 36° in the count-in (the base 8°). With the elbow a little forward
   * (1, -1, -0.2) and half of the turn of the upper body in the beat plane, the right elbow went
   * 8.1 cm into the side of the belly in a turn to the left.
   */
  poleR: [1, -1, 0],
  /**
   * The curl of the fingers around the baton, in the play, in the rest pose, and in the bow. A
   * conductor keeps the baton in the closed hand also with the arms down. With no curl at rest,
   * the open paw of the Tripo bear showed the baton under the tips of its claws. From a curl of
   * about 57°, three thin faces of the knuckle crease of the Tripo bear (104, 105, 1769) fold in
   * each sample of the play and at rest (`pnpm hold-fit conductor`).
   */
  batonCurl: 50 * MathUtils.DEG2RAD,
  /**
   * In the lift and in the lowering of the arms (5.2), the baton turns toward this direction: out
   * to the right side and a little down, as a loose wrist lets it fall. Thus its tip leaves the desk
   * of the conductor stand at the side before it comes down. With a straight lowering, the tip
   * comes 0.006 m near the desk when the arms come down after the song end. With the baton 25° up
   * and the direction (0.8, -0.6, 0), the right paw turns 4,653°/s at the start of a lowering. The
   * turn keeps no twist of the paw on its forearm.
   */
  liftBaton: [1, -0.3, 0],
  /**
   * In the rest pose (5.2), the baton of the hanging right paw turns toward this direction, in the
   * model axes: down, in, and a little back. The turn keeps no twist of the paw on its forearm, so
   * the baton comes only near to it: it hangs down beside the leg, about 27° forward of the
   * vertical, as the baton hangs in the relaxed hand of a conductor with the arms down. With no
   * turn, the baton follows the fingers of the hanging paw, and it points out to the side and
   * forward, past the width of the belly. With the direction (-0.2, -1, -0.3), it pointed 41°
   * forward of the vertical. With (-0.35, -1, 0.4), it pointed 22° forward, and the right wrist
   * turned 2,794°/s at the start of a lift (`pnpm arm-check conductor`, move turn, limit 3,000).
   */
  restBaton: [-0.35, -1, 0.2],
  /**
   * The roll of the right paw around the baton from the top up, in radians, positive by the right
   * hand around the direction of the baton. The `palm` of the Tripo bear is the true palm of its
   * paw, so with no roll the back of the paw faces up, and the claws curl around the baton under
   * it, as a conductor holds the baton between the thumb and the fingers with the palm down. The
   * small roll tilts the palm in to the body, so that the palm faces 45° down and in. The roll of
   * 40° of the bear of main (its palm hint lay 48° from its true palm) turns the palm of the Tripo
   * bear to the side, and the right forearm then twists 66° to 109° from the bind.
   */
  batonRoll: 11.5 * MathUtils.DEG2RAD,
  /** The curl of the fingers of the open left hand of a cue. */
  cueCurl: 10 * MathUtils.DEG2RAD,
  /**
   * The curl of the fingers of the left hand in the ready gesture: a loose fist, as the paws of
   * `bear-views.png`. With the open hand of a cue, the claws point up. At 80°, the knuckle crease
   * of the left paw of the Tripo bear folded about 16 faces in each sample of the ready gesture,
   * as the right paw folds from a curl of about 57° (`batonCurl`).
   */
  readyCurl: 50 * MathUtils.DEG2RAD,
  /**
   * In the ready gesture of a count-in, the left hand points this far up, so that both paws are
   * up at the height of the chin, 0.63 H above the shoulder joints, as in `bear-views.png` (design
   * 5.4). At 21°, the left paw of the studio bear is 0.23 H lower than the right paw.
   */
  readyLift: 34 * MathUtils.DEG2RAD,
  /**
   * In the ready gesture, the left wrist is this part of the reach of the arm from the shoulder
   * joint. With 0.75, the bent elbow of the Tripo bear folded 5 faces more at its inner side, and
   * the ready gesture folded 28 faces of the left arm (`pnpm arm-check conductor`, lift, limit 8).
   */
  readyReach: 0.9,
  /**
   * In the ready gesture, the left hand points this far outward, to the left of the front, so
   * that the paw shows beside the head from behind, and the two paws are nearly at the same width,
   * as in `bear-views.png`. The right paw of the studio bear is still 0.3 H further out, because a
   * paw further in meets its muzzle. At 32°, the left paw is 0.16 H further in. At 10° inward, the
   * forearm comes 0.8 cm from the head.
   */
  readyOut: 44 * MathUtils.DEG2RAD,
  /**
   * In the ready gesture, the left paw turns this far around its fingers, by the right hand rule,
   * so that the palm faces in and down, as in the quiet place. With no turn, the palm faces the
   * players, and the left forearm of the Tripo bear twists 94° more from the ready gesture to the
   * quiet place than the arm gate permits (45° on each side of the bind).
   */
  readyRoll: -46 * MathUtils.DEG2RAD,
  /**
   * The forward swing of the upper arm and the forward bend of the elbow of the hanging arms of
   * the rest pose (design 5.2). The arms hang relaxed beside the round belly, and the forearms
   * follow its side to the front, so that the paws hang at the front of its sides. The search of
   * the swing out to the side starts at `minOut`, and each part then swings out by `extraOut`
   * more. With the angles of a standing player (20° and 60°), the forearms of the Tripo bear lie
   * on the top of its belly, and the paws point at the players. With 20° and 11.5°, and the
   * search from 22° with 3° more, the upper arms stand 31° and 34° out, as in the bind A-pose.
   * The upper arms of the Tripo bear keep the girth of its source, so with 4° the upper
   * arm goes 4.8 cm into the side of the chest at rest, past the limit of 4 cm (`pnpm
   * hold-fit conductor`). With 15°, it goes 4.1 cm into it, and with 20° 3.7 cm.
   */
  restArm: {
    forward: 30 * MathUtils.DEG2RAD,
    bend: 20 * MathUtils.DEG2RAD,
    minOut: 16 * MathUtils.DEG2RAD,
    extraOut: 20 * MathUtils.DEG2RAD,
  },
  /**
   * The left elbow of the rest pose points down and back. The elbow of the hanging arm is the
   * bend of a nearly straight arm, so a change of 1° of the swing out to the side turns the upper
   * arm by up to 60°.
   */
  restPoleL: [0, -1, 1],
  /** The right elbow of the rest pose, as the left elbow. */
  restPoleR: [0, -1, 1],
} as const;

/** One place of the left hand between its cues (design 5.4). */
interface LeftHandPlace {
  /** The wrist, from the left shoulder joint, in head heights `H`, in the model axes. */
  readonly wrist: Vec3;
  /** The direction of the fingers, in the model axes. */
  readonly fingers: Vec3;
  /** The curl of the fingers. */
  readonly curl: number;
  /**
   * The side to which the palm turns, or none for the palm of the hand direction alone. The paw
   * twists on its forearm toward the twist of the side ({@link PALM_TWIST}).
   */
  readonly palm?: keyof typeof PALM_TWIST;
}

/**
 * The places of the left hand between its cues (design 5.4). `conductor-left.ts` gives the weight
 * of each place from the score. The bear faces -z, and its left is -x.
 */
export const LEFT_HAND_PLACES = {
  /**
   * The quiet hand: raised and ready above the left shoulder, beside the head from behind, as in
   * `mockup.png` and `scene.png` (02, 05), and a little lower than the paw of the ready gesture.
   * A hand that hangs at the side moves too little. In front of the left of the chest, the hand
   * seems to hold the head.
   */
  quiet: { wrist: [-0.5, 0.28, -0.81], fingers: [0.2, -0.1, -1], curl: 25 * MathUtils.DEG2RAD },
  /** The mirror of the beat in a loud passage: the wrist at beat 1, above the shoulder. */
  mirror: { wrist: [-0.5, 0.41, -0.72], fingers: [0.1, 0, -1], curl: 15 * MathUtils.DEG2RAD },
  /** The raised hand of a crescendo, open, with the palm up. */
  swell: {
    wrist: [-0.44, 0.88, -0.78],
    fingers: [0, 0.6, -1],
    curl: 5 * MathUtils.DEG2RAD,
    palm: 'up',
  },
  /**
   * The lowered hand of a diminuendo and of a soft passage, open with the palm down, forward and
   * out at the left at the height of the shoulder. The fingers point forward and a little out and
   * down, near the line of the forearm. With the fingers 31° down and the wrist less forward
   * (-0.59, 0.06, -0.78), the paw bent 53° on the forearm, and the left forearm stretched 0.42 of
   * the upper arm (p95 of the arm gate, limit 0.35). With the wrist 0.06 H further in, the left
   * upper arm went 1.6 cm into the shoulder in a turn to the right (limit 1.5 cm).
   */
  fade: {
    wrist: [-0.56, 0, -0.84],
    fingers: [-0.3, -0.1, -1],
    curl: 5 * MathUtils.DEG2RAD,
    palm: 'down',
  },
  /** The held palm of a held chord, up and out to the players above the shoulder. */
  hold: {
    wrist: [-0.44, 0.53, -1.0],
    fingers: [0, 0.3, -1],
    curl: 5 * MathUtils.DEG2RAD,
    palm: 'up',
  },
  /**
   * The open arm of a climax: wide out to the left and high, above the shoulder and forward, with
   * the fingers open, out, and up, as the arms of a conductor open wide at a climax
   * (`conductor-technique.md`).
   */
  open: {
    wrist: [-1.1, 0.95, -0.45],
    fingers: [-0.5, 0.8, -0.5],
    curl: 5 * MathUtils.DEG2RAD,
    palm: 'up',
  },
} as const satisfies Readonly<Record<string, LeftHandPlace>>;

/**
 * The left hand moves this part of the motion of the tip of the baton when it mirrors the beat:
 * the part that the right wrist follows.
 */
const MIRROR_SCALE = 0.45;

/**
 * The mirror moves the left hand at most this far inward, in meters, so that the hand mirrors
 * outside of the torso (`conductor-technique.md`). The larger beat of a loud passage moved the
 * left upper arm 1.6 cm into the shoulder with no limit.
 */
const MIRROR_IN = 0.12;

/**
 * The largest twist of the left paw on its forearm, so that the wrist does not twist far from the
 * bind pose.
 */
const MAX_TWIST_L = 45 * MathUtils.DEG2RAD;

/**
 * The twist of the left paw on its forearm for a palm up and a palm down (design 5.4). A negative
 * twist turns the palm up, as the forearm of a real conductor supinates. Each twist is the limit
 * {@link MAX_TWIST_L}: the turn of the palm all the way up asked for 95° to 165° of twist, and the
 * turn all the way down for 65° to 90° (`boulanger-matin`, `mozart-k525`, `beethoven-9`).
 */
const PALM_TWIST = { up: -MAX_TWIST_L, down: MAX_TWIST_L } as const;

/** The curl of the closed left hand of a cut-off. */
const CLOSE_CURL = 80 * MathUtils.DEG2RAD;

/**
 * The rotation of the baton in the bind pose: its tip down the hanging right hand, toward the thumb
 * and the palm, and its top out of the back of the hand (design 4.6, {@link BATON_ALONG}).
 */
const BATON_BIND = setFromBasis(
  new Quaternion(),
  new Vector3(...BATON_ALONG),
  new Vector3(...BATON_TOP),
);

/** The inverse of {@link BATON_BIND}. */
const BATON_INVERSE = BATON_BIND.clone().invert();

/** The points of the conductor in the bind pose that the pose needs. */
export interface ConductorRig {
  readonly chestBind: Vec3;
  /** The bind position of the `spine` bone: the upper body turns around the vertical through it. */
  readonly spineBind: Vec3;
  readonly left: ArmRig;
  readonly right: ArmRig;
  /** The left arm in the rest pose and in the bow at the song end (design 5.2). */
  readonly hangL: HangingArm;
  /** The right arm in the rest pose. */
  readonly hangR: HangingArm;
  /** The tip of the baton in the bind pose. */
  readonly tip: Vec3;
  /** The point of beat 1 of a pattern, and the pivot of the baton, in the model axes. */
  readonly beatPoint: Vec3;
  readonly pivot: Vec3;
  /**
   * The unit axis of the beat plane to the right, in the model axes: level. The plane is square to
   * the baton at beat 1, so that the tip moves around the pivot and the wrist follows a part of
   * its motion.
   */
  readonly beatRight: Vec3;
  /** The unit axis of the beat plane up, in the model axes: up and back, square to the baton. */
  readonly beatUp: Vec3;
  /** The head height `H` of the bear: the unit of the places of the hands. */
  readonly headHeight: number;
  /**
   * The unit direction of the baton in the middle of a lift or a lowering of the arms
   * ({@link CONDUCTOR_HOLD.liftBaton}).
   */
  readonly liftBaton: Vec3;
  /** The unit direction of the baton in the rest pose ({@link CONDUCTOR_HOLD.restBaton}). */
  readonly restBaton: Vec3;
  /** The unit direction of the left hand in the ready gesture: up and a little outward. */
  readonly readyDirection: Vec3;
  /** The legs, which bend so that the feet stay on the podium when the hips drop. */
  readonly legs: PlantedLegs;
}

/**
 * Calculates a place of the hold from the right shoulder joint, in the model axes.
 *
 * @param right The right arm of the bear.
 * @param h The head height `H` of the bear.
 * @param place The place, in `H`, from the shoulder joint.
 * @returns The point in the model axes.
 */
function fromRightShoulder(right: ArmRig, h: number, place: Vec3): Vec3 {
  return toVec3(new Vector3(...place).multiplyScalar(h).add(new Vector3(...right.bind.shoulder)));
}

/**
 * Finds the point of the tip of the baton at beat 1, in the model axes. The shots need only this
 * point of the rig, and the hanging arms of {@link conductorRig} cost more than the rest of it.
 *
 * @param model The bear with the baton.
 * @returns The point.
 */
export function conductorBeatPoint(model: PlayerModel): Vec3 {
  return fromRightShoulder(armRig(model, 'R'), model.body.headHeight, CONDUCTOR_HOLD.beatPoint);
}

/**
 * Finds the points of the conductor that the pose needs.
 *
 * @param model The bear with the baton.
 * @returns The rig.
 * @throws Error if the baton has no tip.
 */
export function conductorRig(model: PlayerModel): ConductorRig {
  const tip = model.instrument.targets.find((t) => t.kind === 'tip');
  if (!tip) {
    throw new Error('The baton has no tip.');
  }
  const right = armRig(model, 'R');
  const left = armRig(model, 'L');
  const h = model.body.headHeight;
  const beatPoint = fromRightShoulder(right, h, CONDUCTOR_HOLD.beatPoint);
  const pivot = fromRightShoulder(right, h, CONDUCTOR_HOLD.batonPivot);

  const baton = new Vector3(...beatPoint).sub(new Vector3(...pivot)).normalize();
  const beatRight = new Vector3().crossVectors(baton, Y_AXIS).normalize();
  const beatUp = new Vector3().crossVectors(beatRight, baton);

  return {
    chestBind: model.skeleton.positions[boneIndex('chest')] ?? [0, 0, 0],
    spineBind: model.skeleton.positions[boneIndex('spine')] ?? [0, 0, 0],
    left,
    right,
    hangL: hangingArm(model, left, CONDUCTOR_HOLD.restArm),
    hangR: hangingArm(model, right, CONDUCTOR_HOLD.restArm),
    tip: placePoint(model.pieces, { bone: tip.bone, at: tip.from }),
    beatPoint,
    pivot,
    beatRight: toVec3(beatRight),
    beatUp: toVec3(beatUp),
    headHeight: h,
    liftBaton: toVec3(new Vector3(...CONDUCTOR_HOLD.liftBaton).normalize()),
    restBaton: toVec3(new Vector3(...CONDUCTOR_HOLD.restBaton).normalize()),
    readyDirection: [
      -Math.sin(CONDUCTOR_HOLD.readyOut) * Math.cos(CONDUCTOR_HOLD.readyLift),
      Math.sin(CONDUCTOR_HOLD.readyLift),
      -Math.cos(CONDUCTOR_HOLD.readyOut) * Math.cos(CONDUCTOR_HOLD.readyLift),
    ],
    legs: plantedLegs(model),
  };
}

/** The motion of the conductor at one time. */
export interface ConductorState {
  /** The point of the tip of the baton in the beat plane. */
  readonly baton: BatonState;
  /**
   * The cue motion, with the turns already scaled by the weight of the playing pose. The beat
   * plane turns with the upper body.
   */
  readonly cue: CueState;
  /** The weight of the ready gesture of the left hand in a count-in, from 0 to 1. */
  ready: number;
  /** The weights of the places of the left hand between its cues. */
  readonly left: LeftHandState;
  /**
   * The lean of the expression (design 5.4), in radians: the forward lean of the spine, scaled by
   * the playing pose. The places of the hands lean with it.
   */
  lean: number;
  /** The side sway of the expression, in radians, scaled by the playing pose. */
  sway: number;
  /** The drop of the hips of the expression, in meters, scaled by the playing pose. */
  drop: number;
  /** The weight of the open arms of a climax, from 0 to 1. */
  climax: number;
  /** The rise of the shoulders of the expression: the turn of each clavicle, in radians. */
  shrug: number;
  /** The move of the hips along +x of the expression, in meters. */
  shift: number;
}

const right = createFrame();
const left = createFrame();
/**
 * The frame of a hanging arm: the posed shoulder joint with the rotation of the root. A hanging
 * arm hangs from its shoulder with no turn of the upper body, so that in the bow at the song end
 * the paws hang beside the body and do not swing into the belly.
 */
const hangFrame = createFrame();

/**
 * The part of the turn of the upper body that a hanging arm follows. In the bow at the song end,
 * arms that follow the whole bend swing the paws into the belly of the studio bear (2.8 cm at a
 * bend of 32°).
 */
const HANG_FOLLOW = 0.5;
const tip = new Vector3();
const lifted: BatonState = { x: 0, y: 0 };
const along = new Vector3();
const top = new Vector3();
const offset = new Vector3();
const wristBind = new Vector3();
const wrist = new Vector3();
const hand = new Quaternion();
const liftTurn = new Quaternion();
const liftTwist = new Quaternion();
const handInverse = new Quaternion();
const hanging = new Vector3();
const restHand = new Quaternion();
const direction = new Vector3();
const toCue = new Vector3();
const readyTurn = new Quaternion();
const pivot = new Vector3();
const place = new Vector3();
const fingers = new Vector3();
const toPlace = new Vector3();

/** The direction of the baton in the middle of a lift or a lowering. Each call writes it first. */
const liftBaton = new Vector3();
/** The direction of the baton in the rest pose. Each call writes it first. */
const restBaton = new Vector3();
const bodyTurn = new Quaternion();
/** The turn of a clavicle in the rise of the shoulders. Each call writes it first. */
const shrugTurn = new Quaternion();
const bodySway = new Quaternion();

/**
 * Moves a point of the model axes with the expression of the body (design 5.4): the sway and the
 * lean of the spine around the `spine` bone, and the move and the drop of the hips. Thus the hands
 * keep their places to the head and the chest.
 *
 * @param rig The points of the conductor.
 * @param point The point to move in place.
 * @param state The motion at the song time.
 * @returns `point`.
 */
function followBody(rig: ConductorRig, point: Vector3, state: ConductorState): Vector3 {
  if (state.lean === 0 && state.sway === 0 && state.drop === 0 && state.shift === 0) {
    return point;
  }
  const [x, y, z] = rig.spineBind;
  bodyTurn.setFromAxisAngle(Z_AXIS, state.sway);
  bodyTurn.multiply(bodySway.setFromAxisAngle(X_AXIS, -state.lean));
  point.x -= x;
  point.y -= y;
  point.z -= z;
  point.applyQuaternion(bodyTurn);
  point.x += x + state.shift;
  point.y += y - state.drop;
  point.z += z;
  return point;
}

/**
 * Turns a point of the model axes around the vertical through the `spine` bone.
 *
 * @param rig The points of the conductor.
 * @param point The point to turn in place.
 * @param yaw The turn around +y, positive to the left.
 * @returns `point`.
 */
function turnWithTorso(rig: ConductorRig, point: Vector3, yaw: number): Vector3 {
  const [x, , z] = rig.spineBind;
  point.x -= x;
  point.z -= z;
  point.applyAxisAngle(Y_AXIS, yaw);
  point.x += x;
  point.z += z;
  return point;
}

/**
 * Writes the point of the tip of the baton in the model axes (design 5.4): the point of beat 1
 * plus the point `lifted` in the beat plane. The beat plane moves with the expression of the body
 * ({@link followBody}) and turns with the upper body toward a cued section, so that the paw
 * beats in front of the turned chest. With half of a turn to the left, the low right paw reached
 * out to the side of the turned chest, and the right upper arm twisted 64° (`pnpm arm-check
 * conductor`, the count-in of `bach-bwv1047`, limit 55°).
 *
 * @param rig The points of the conductor.
 * @param state The motion at the song time.
 * @param out The vector to write.
 * @returns `out`.
 */
function batonPoint(rig: ConductorRig, state: ConductorState, out: Vector3): Vector3 {
  out
    .fromArray(rig.beatPoint)
    .addScaledVector(offset.fromArray(rig.beatRight), lifted.x)
    .addScaledVector(offset.fromArray(rig.beatUp), lifted.y);
  return turnWithTorso(rig, followBody(rig, out, state), state.cue.torsoYaw);
}

/**
 * Writes the wrist and the world rotation of the right hand with the tip of the baton at a point.
 * The baton points from the pivot to the tip, with its top up. The function writes the module
 * vectors `wrist` and `hand`.
 *
 * @param rig The points of the conductor.
 * @param point The point of the tip.
 * @param from The pivot of the baton.
 */
function batonHand(rig: ConductorRig, point: Vector3, from: Vector3): void {
  along.copy(point).sub(from).normalize();
  top.set(0, 1, 0).addScaledVector(along, -along.y);
  if (top.length() > 1e-6) {
    top.normalize();
  } else {
    top.set(0, 0, 1);
  }
  top.applyAxisAngle(along, CONDUCTOR_HOLD.batonRoll);
  setFromBasis(hand, along, top).multiply(BATON_INVERSE);
  offset.fromArray(rig.tip).sub(wristBind.fromArray(rig.right.bind.wrist)).applyQuaternion(hand);
  wrist.copy(point).sub(offset);
}

/**
 * Writes a direction from a turn around +y and an angle up.
 *
 * @param yaw The turn, positive to the left.
 * @param lift The angle up.
 * @param out The vector to write.
 * @returns `out`, with the unit direction.
 */
function directionOf(yaw: number, lift: number, out: Vector3): Vector3 {
  const level = Math.cos(lift);
  return out.set(-Math.sin(yaw) * level, Math.sin(lift), -Math.cos(yaw) * level);
}

/**
 * Writes the arms and the fingers of the conductor (design 5.4, 4.7). The right hand moves the tip
 * of the baton to its point in the beat plane, and the two-bone IK places the arm. The beat plane
 * turns with the upper body. The left hand shows the dynamics and the held chords between its
 * cues, points to a cued section, and points up in the ready gesture of a count-in
 * ({@link poseLeftHand}). In the rest pose, the arms hang a little out to the sides, clear of the
 * body (design 5.2).
 *
 * @param rig The points of the conductor.
 * @param frames The posed frames of the root and of the chest.
 * @param state The motion at the song time.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2).
 * @param rotations The rotations of the pose to write.
 */
export function poseConductor(
  rig: ConductorRig,
  frames: TorsoFrames,
  state: ConductorState,
  weight: number,
  rotations: Float32Array,
): void {
  const hold = CONDUCTOR_HOLD;
  const chest = frames.chest;
  const { cue } = state;

  shrugTurn.setFromAxisAngle(Z_AXIS, state.shrug);
  poseShoulder(rig.right, chest, rig.chestBind, shrugTurn, right);
  setBoneRotation(rotations, rig.right.bones.shoulder, shrugTurn);
  lifted.x = state.baton.x;
  lifted.y = state.baton.y + cue.batonLift;
  batonPoint(rig, state, tip);
  turnWithTorso(rig, followBody(rig, pivot.fromArray(rig.pivot), state), cue.torsoYaw);
  batonHand(rig, tip, pivot);
  levelOf(right, frames.root);
  hangingWrist(rig.hangR, hangFrame, hanging);
  limitReach(rig.right, right.position, wrist);
  hangingHand(rig.hangR, hangFrame, restHand);
  if (weight < 1) {
    // The baton of the hanging paw points down and a little forward and in.
    along.fromArray(BATON_ALONG).applyQuaternion(restHand);
    restBaton.fromArray(rig.restBaton).applyQuaternion(hangFrame.rotation);
    restHand.multiply(swingOf(restHand, along, restBaton));
  }
  mixRotation(restHand, hand, weight, hand);
  if (weight > 0 && weight < 1) {
    // The turn is at its full size in the middle of the motion. The tip leaves the width of the
    // desk early, while the hand is still high.
    along.set(0, 0, -1).applyQuaternion(hand);
    swingOf(hand, along, liftBaton.fromArray(rig.liftBaton));
    hand.multiply(mixRotation(NO_TURN, liftTurn, Math.sin(Math.PI * weight), liftTurn));
  }
  writeArm(
    {
      arm: rig.right,
      shoulder: right,
      wrist: wrist.lerpVectors(hanging, wrist, weight),
      hand,
      pole: mixPole(hold.restPoleR, hold.poleR, weight),
    },
    chest.rotation,
    rotations,
  );
  // The fingers stay closed around the baton in each pose, also with the arms down.
  writeCurl(rig.right, hold.batonCurl, rotations);

  poseLeftHand(rig, frames, state, weight, rotations);
}

/**
 * Writes the module rotation `liftTurn`: the turn of a paw that turns a direction of the paw
 * toward another direction, in the axes of the paw, with no twist around the line of the forearm
 * (+y). A full twist of about 130° turns the paw past 180° on its forearm, and its twist bone
 * jumps by 180°. Thus the direction comes only near to the target.
 *
 * @param paw The world rotation of the paw.
 * @param from The unit direction of the paw to turn, in the model axes.
 * @param to The unit target direction, in the model axes.
 * @returns `liftTurn`, to multiply onto the rotation of the paw.
 */
function swingOf(paw: Quaternion, from: Vector3, to: Vector3): Quaternion {
  liftTurn.setFromUnitVectors(from, to);
  liftTurn.premultiply(handInverse.copy(paw).invert()).multiply(paw);
  liftTwist.set(0, liftTurn.y, 0, liftTurn.w).normalize();
  if (liftTwist.w < 0) {
    liftTwist.set(0, -liftTwist.y, 0, -liftTwist.w);
  }
  return liftTurn.multiply(liftTwist.invert());
}

/**
 * Mixes the wrist of the hanging arm and the wrist of the playing pose, and keeps the distance of
 * the mix from the shoulder at least at the mix of the two distances (design 5.4). A straight mix
 * of the left wrist passes near the shoulder in the lift, so the elbow bends more than at both
 * ends, and the inner elbow of the Tripo bear folded 9 faces at 0.2 s of the lift.
 *
 * @param shoulder The posed shoulder joint.
 * @param from The wrist of the hanging arm.
 * @param to The wrist of the playing pose. The function writes the mix into it.
 * @param weight The weight of the playing pose, from 0 to 1.
 * @returns `to`, with the mix.
 */
function mixWrist(shoulder: Vector3, from: Vector3, to: Vector3, weight: number): Vector3 {
  const reach = MathUtils.lerp(from.distanceTo(shoulder), to.distanceTo(shoulder), weight);
  to.lerpVectors(from, to, weight);
  const distance = to.distanceTo(shoulder);
  if (distance < reach && distance > 1e-6) {
    to.sub(shoulder)
      .multiplyScalar(reach / distance)
      .add(shoulder);
  }
  return to;
}

/**
 * Writes the module frame `hangFrame`: the posed shoulder joint with the rotation of the root.
 *
 * @param shoulder The posed `shoulder` bone, from `poseShoulder()`.
 * @param root The posed frame of the root.
 */
function levelOf(shoulder: Frame, root: Frame): void {
  hangFrame.position.copy(shoulder.position);
  hangFrame.rotation.slerpQuaternions(root.rotation, shoulder.rotation, HANG_FOLLOW);
}

/**
 * Writes the wrist and the fingers of a place of the left hand: the module vectors `place` and
 * `fingers`, in the model axes.
 *
 * @param rig The points of the conductor.
 * @param of The place.
 * @param state The motion at the song time, for the expression of the body.
 * @param torsoYaw The turn of the place around the `spine` bone, positive to the left.
 * @param baton The motion of the baton to mirror, in meters, or `null` for no motion.
 */
function placeOf(
  rig: ConductorRig,
  of: LeftHandPlace,
  state: ConductorState,
  torsoYaw: number,
  baton: BatonState | null,
): void {
  place.fromArray(of.wrist).multiplyScalar(rig.headHeight);
  if (baton) {
    // A move to +x is a move inward, toward the middle of the body.
    place.x += Math.min(MIRROR_IN, -MIRROR_SCALE * baton.x);
    place.y += MIRROR_SCALE * baton.y;
  }
  place.add(toPlace.fromArray(rig.left.bind.shoulder));
  turnWithTorso(rig, followBody(rig, place, state), torsoYaw);
  fingers.fromArray(of.fingers).normalize().applyAxisAngle(Y_AXIS, torsoYaw);
}

/**
 * Writes the left arm and its fingers (design 5.4). Between its cues, the hand rests at the quiet
 * place, mirrors the beat in a loud passage, rises in a crescendo, comes down in a diminuendo or
 * a soft passage, holds the palm out on a held chord, and opens wide and high at a climax, by the
 * weights from the score. The places move with the expression of the body. A cue and the ready
 * gesture of a count-in win over these places by their weights. In the rest pose and in the bow
 * at the song end, the arm hangs.
 *
 * @param rig The points of the conductor.
 * @param frames The posed frames of the root and of the chest.
 * @param state The motion at the song time.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2).
 * @param rotations The rotations of the pose to write.
 */
function poseLeftHand(
  rig: ConductorRig,
  frames: TorsoFrames,
  state: ConductorState,
  weight: number,
  rotations: Float32Array,
): void {
  const { cue, left: weights } = state;
  const { chest } = frames;
  const places = LEFT_HAND_PLACES;
  shrugTurn.setFromAxisAngle(Z_AXIS, -state.shrug);
  poseShoulder(rig.left, chest, rig.chestBind, shrugTurn, left);
  setBoneRotation(rotations, rig.left.bones.shoulder, shrugTurn);
  // The places turn with the upper body to each side. When the places stayed in a turn to the
  // right, the left arm reached back across the turned chest: the left forearm stretched 0.58 of
  // the upper arm, and the left upper arm went 2.4 cm into the shoulder at a climax.
  const turn = cue.torsoYaw;
  placeOf(rig, places.quiet, state, turn, null);
  wrist.copy(place);
  direction.copy(fingers);
  let curl: number = places.quiet.curl;
  let palmTwist = 0;
  let palmWeight = 0;
  const steps: readonly (readonly [LeftHandPlace, number])[] = [
    [places.mirror, weights.mirror],
    [places.swell, weights.swell],
    [places.fade, weights.fade],
    [places.hold, weights.hold],
    [places.open, state.climax],
  ];
  for (const [of, w] of steps) {
    if (w > 0) {
      placeOf(rig, of, state, turn, of === places.mirror ? state.baton : null);
      wrist.lerp(place, w);
      direction.lerp(fingers, w);
      curl += (of.curl - curl) * w;
      if (of.palm) {
        // The twist is the mean of the twists of the places by their weights, so a place that
        // starts with a small weight changes it only a little.
        const kept = palmWeight * (1 - w);
        palmTwist = (palmTwist * kept + PALM_TWIST[of.palm] * w) / (kept + w);
        palmWeight = kept + w;
      } else {
        palmWeight *= 1 - w;
      }
    }
  }
  curl += (CLOSE_CURL - curl) * weights.close;

  // The cue and the ready gesture point the arm from the shoulder joint.
  const ready = state.ready * (1 - cue.hand);
  const lift = Math.max(cue.hand, state.ready);
  if (lift > 0) {
    toCue.fromArray(rig.readyDirection).applyAxisAngle(Y_AXIS, turn).multiplyScalar(ready);
    if (cue.hand > 0) {
      toCue.addScaledVector(directionOf(cue.handYaw, cue.handLift, fingers), cue.hand);
    }
    toCue.normalize();
    const reach =
      (ready * CONDUCTOR_HOLD.readyReach + cue.hand * cue.handReach) / (ready + cue.hand);
    place.copy(left.position).addScaledVector(toCue, reach * rig.left.reach);
    wrist.lerp(place, lift);
    direction.lerp(toCue, lift);
    const liftCurl =
      (ready * CONDUCTOR_HOLD.readyCurl + cue.hand * CONDUCTOR_HOLD.cueCurl) / (ready + cue.hand);
    curl += (liftCurl - curl) * lift;
    palmWeight *= 1 - lift;
  }
  limitReach(rig.left, left.position, wrist);
  handToward(left, place.copy(left.position).add(direction.normalize()), hand);
  if (ready > 0) {
    hand.premultiply(readyTurn.setFromAxisAngle(direction, CONDUCTOR_HOLD.readyRoll * ready));
  }
  levelOf(left, frames.root);
  hangingWrist(rig.hangL, hangFrame, hanging);
  writeArm(
    {
      arm: rig.left,
      shoulder: left,
      wrist: mixWrist(left.position, hanging, wrist, weight),
      hand: mixRotation(hangingHand(rig.hangL, hangFrame, restHand), hand, weight, hand),
      pole: mixPole(CONDUCTOR_HOLD.restPoleL, CONDUCTOR_HOLD.poleL, weight),
      maxTwist: MAX_TWIST_L,
      twist: palmTwist,
      twistWeight: palmWeight * weight,
    },
    chest.rotation,
    rotations,
  );
  writeCurl(rig.left, curl * weight, rotations);
}
