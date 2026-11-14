import { MathUtils, Quaternion, Vector3 } from 'three';

import type { InstrumentId } from '../models/instruments/types.ts';
import { boneIndex } from '../models/rig.ts';
import { DIGITS } from '../models/studio-format.ts';
import { X_AXIS, Y_AXIS, Z_AXIS } from './axes.ts';
import { lastAtOrBefore } from './blend.ts';
import { poseBowed } from './bowed.ts';
import { END_BOW, TURN_STEPS, createEndMotion, stepsLegs, transportEndMotion } from './end-bow.ts';
import type { EndMotion } from './end-bow.ts';
import { createIdleState, idleAt } from './idle.ts';
import { poseConductor } from './conductor.ts';
import type { ConductorState } from './conductor.ts';
import { createLeftHandState, leftHandAt } from './conductor-left.ts';
import {
  EXPRESSION_MOTION,
  createExpressionState,
  expressBaton,
  expressionAt,
} from './conductor-expression.ts';
import type { ExpressionState } from './conductor-expression.ts';
import { batonAt, resumeLift } from './conductor-notes.ts';
import type { BatonState } from './conductor-notes.ts';
import { createCueState, cueStateAt } from './cues.ts';
import {
  NO_COUNT_IN,
  beatLengthAt,
  countInAt,
  leaderNodAt,
  noteLayerTime,
  readyAt,
} from './count-in.ts';
import type { CountIn } from './count-in.ts';
import { poseChoir } from './choir.ts';
import { CHOIR_MOTION, choirStateAt, createChoirState } from './choir-notes.ts';
import type { ChoirState } from './choir-notes.ts';
import { BIND_ROTATIONS, NECK_SHARE, chainFrames, createFrame, setBoneRotation } from './frames.ts';
import type { Frame, TorsoFrames } from './frames.ts';
import { createHandState, handStateAt } from './hand-notes.ts';
import { poseHands, sideLeanAt } from './hands.ts';
import type { HandsState } from './hands.ts';
import { gestureSize } from './loudness.ts';
import { longRestHeight } from './long-rests.ts';
import { plannedLookAt } from './looks.ts';
import type { PlannedLook } from './looks.ts';
import { activityAt } from './passages.ts';
import { pedalLevelAt, posePedalFoot } from './pedal.ts';
import { digitBendsAt } from './piano-digits.ts';
import { PIANO_KEY_COUNT, keyLevelsAt } from './piano-keys.ts';
import { HARP_STRING_COUNT, stringSwingsAt } from './harp-strings.ts';
import { poseHarpFeet } from './harp-feet.ts';
import { pedalNotchesAt } from './harp-pedals.ts';
import { HARP_PEDALS } from '../models/instruments/harp.ts';
import {
  createSmallState,
  cymbalSwingAt,
  posePercussion,
  setWeightAt,
  smallStateAt,
} from './percussion.ts';
import { TAMBOURINE_HOLD } from './percussion-rig.ts';
import { createSwitchState } from './percussion-switch.ts';
import type { PercussionState } from './percussion.ts';
import type { IdleState } from './idle.ts';
import type { NoteLayer, PlayerPlan, PosePlan } from './plan.ts';
import { clamp01, seatHeight, transportHeight } from './rest.ts';
import { hipsOffset, plantFeet, sideMoveAt, stanceOffset, stepFeet } from './side-move.ts';
import type { Stance } from './side-move.ts';
import { createStrikeState, strikeStateAt } from './strikes.ts';
import { createDampState, dampStateAt } from './damps.ts';
import { bowStateAt, createBowState } from './strokes.ts';
import type { BowState } from './strokes.ts';
import { createWindState, windStateAt } from './wind-notes.ts';
import type { WindState } from './wind-notes.ts';
import { WIND_BODY, poseWind } from './winds.ts';
import type { AnimalPose, ScenePose, SeatAudibility, Transport } from './types.ts';

/** An animal pose that `poseAt()` writes in place, so that a frame makes no new pose buffers. */
export interface WritablePose extends AnimalPose {
  readonly rotations: Float32Array;
  rootOffset: [number, number, number];
  slideOffset: [number, number, number];
  readonly instrumentOffset: [number, number, number];
  pawTurnL: number | null;
  pawTurnR: number | null;
  pawBendR: number;
  blink: number;
  readonly keys: Float32Array | null;
  readonly strings: Float32Array | null;
  readonly pedals: Float32Array | null;
  readonly digits: Float32Array | null;
  readonly held?: Float32Array | null;
}

/** The poses of a scene that `poseAt()` writes in place. */
export interface ScenePoseBuffer extends ScenePose {
  readonly players: readonly WritablePose[];
  readonly conductor: WritablePose | null;
}

/** The angles of the body layer (design 5.1). */
const BODY_MOTION = {
  /** The turn of the spine and of the chest at the top of a breath. */
  breathSpine: 0.6 * MathUtils.DEG2RAD,
  breathChest: 1 * MathUtils.DEG2RAD,
  /** The largest side sway of the spine with the beat, for a gesture size of 1. */
  sway: 2 * MathUtils.DEG2RAD,
  /**
   * The factor of the breath and the sway of a player. A player in the default view is about 110
   * pixels high, so the base angles move the head about 2 pixels. The instruments of
   * {@link BASE_BODY_INSTRUMENTS} keep the base angles.
   */
  scale: 1.5,
  /** The part of a look that the neck turns. The head turns the rest. */
  lookNeck: NECK_SHARE,
  /**
   * The largest turn of the head around y of a wind player in a planned look while it plays: a
   * small turn that keeps the mouthpiece on the lips.
   */
  peek: 4 * MathUtils.DEG2RAD,
  /** The turn of each ear at the top of a twitch. */
  ear: 12 * MathUtils.DEG2RAD,
  /** The turns of the two tail bones at the end of a sway. */
  tail1: 8 * MathUtils.DEG2RAD,
  tail2: 12 * MathUtils.DEG2RAD,
} as const;

/**
 * The overlap of the ears and the tail (design 5.1): a loose part lags behind the motion of the head
 * and the trunk. The drag is the change of the angle of the head, or of the side sway of the spine,
 * in the last `lagSec`, so the pose stays a function of the times.
 */
const OVERLAP = {
  /** The time over which the change of the angles is taken, in seconds. */
  lagSec: 0.08,
  /** The turn of each ear for each radian of change of the angles of the head. */
  ear: 1,
  /**
   * The largest drag of an ear around each axis. A hanging ear takes `hanging` of it, because the
   * hanging ear of the dog lies near the cello.
   */
  earMax: 10 * MathUtils.DEG2RAD,
  hanging: 0.5,
  /** The turn of the first tail bone for each radian of change of the side sway of the spine. */
  tail: 3,
  /** The largest drag of the first tail bone. The second bone turns in the ratio of the tail sway. */
  tailMax: 8 * MathUtils.DEG2RAD,
} as const;

const BONES = {
  root: boneIndex('root'),
  spine: boneIndex('spine'),
  chest: boneIndex('chest'),
  neck: boneIndex('neck'),
  head: boneIndex('head'),
  earL: boneIndex('earL'),
  earR: boneIndex('earR'),
  tail1: boneIndex('tail1'),
  tail2: boneIndex('tail2'),
  jaw: boneIndex('jaw'),
  slide: boneIndex('slide'),
} as const;

/**
 * Makes the pose of one animal in the bind pose.
 *
 * @param player The plan of the animal. A pianist gets the levels of its keys, all up, and a harp
 *   player the swings of its strings, all still.
 * @returns The pose.
 */
function createPose(player: PlayerPlan): WritablePose {
  const { note } = player;
  return {
    rotations: Float32Array.from(BIND_ROTATIONS),
    rootOffset: [0, 0, 0],
    slideOffset: [0, 0, 0],
    instrumentOffset: [0, 0, 0],
    pawTurnL: null,
    pawTurnR: null,
    pawBendR: 0,
    blink: 0,
    keys: note.family === 'keyboard' && note.keys ? new Float32Array(PIANO_KEY_COUNT) : null,
    strings:
      note.family === 'harp' && note.strings ? new Float32Array(2 * HARP_STRING_COUNT) : null,
    pedals:
      note.family === 'harp' && note.pedals ? new Float32Array(HARP_PEDALS.order.length) : null,
    digits:
      (note.family === 'keyboard' && note.digits) || note.family === 'harp'
        ? new Float32Array(2 * DIGITS)
        : null,
    held: note.family === 'percussion' && note.small ? Float32Array.from([0, 1, 1]) : null,
  };
}

/**
 * Makes the poses of a scene for {@link poseAt}, in the bind pose.
 *
 * @param plan The plan of the score.
 * @returns One pose for each player, and one for the conductor of a plan with a conductor.
 */
export function createScenePose(plan: PosePlan): ScenePoseBuffer {
  return {
    players: plan.players.map(createPose),
    conductor: plan.conductor ? createPose(plan.conductor) : null,
  };
}

/**
 * Gives the side sway of the beat layer at a song time (design 5.1). The sway goes to one side
 * on one beat and to the other side on the next beat, with no jump at a beat. It is 0 before the
 * first beat and after the last beat.
 *
 * @param beats The times of the beats, sorted.
 * @param time The song time.
 * @param beatsPerSide The number of beats of the sway to one side. A singer sways to each side
 *   in 2 beats (design 5.3).
 * @returns The sway, from -1 to 1.
 */
export function beatSway(beats: Float64Array, time: number, beatsPerSide = 1): number {
  const b = lastAtOrBefore(beats, time);
  const start = beats[b];
  const end = beats[b + 1];
  if (start === undefined || end === undefined || end <= start) {
    return 0;
  }
  return Math.sin((Math.PI * (b + (time - start) / (end - start))) / beatsPerSide);
}

/**
 * The bones of the look and the part of the look that each one turns (design 5.1). A module
 * constant, so that a frame makes no new list for each animal.
 */
const HEAD_SHARES = [
  [BONES.neck, BODY_MOTION.lookNeck],
  [BONES.head, 1 - BODY_MOTION.lookNeck],
] as const;

const turn = new Quaternion();
const second = new Quaternion();
/** The stance of the conductor in a turn with steps at the song end. Each frame writes it first. */
const stance: Stance = {
  turn: 0,
  footL: 0,
  footR: 0,
  liftL: 0,
  liftR: 0,
  weight: 0,
  shift: 0,
  drop: 0,
};
const yawAxis = new Vector3();
const rollAxis = new Vector3();

/** The angles that the motion family of an animal adds to its body layer (design 5.1, 5.3). */
interface BodyAngles {
  /** The side sway of the spine with the beat, in radians. */
  sway: number;
  /** The change of {@link BodyAngles.sway} in the last `OVERLAP.lagSec`, for the drag of the tail. */
  swayStep: number;
  /** The forward lean of the spine, in radians. */
  lean: number;
  /**
   * The seeded slouch of the player, in radians, on top of {@link BodyAngles.lean}: 0 for an
   * instrument of {@link BASE_BODY_INSTRUMENTS}, because a lean brings the head to the neck of the
   * cello, and the right upper arm into the neck of the harp.
   */
  slouch: number;
  /**
   * The part of the look at the conductor that the head turns. A wind player does not turn the
   * head from the mouthpiece while it plays.
   */
  look: number;
  /**
   * The part of a planned look that a wind player turns as a small turn of the head, at most
   * `BODY_MOTION.peek`, while it plays: the weight of the playing pose, or 0.
   */
  peek: number;
  /** The upward turn of the neck and the head, in radians. */
  lift: number;
  /** The turn of the chest around y, in radians: the sway of a singer. */
  twist: number;
  /**
   * The turn of the upper body around y, in radians: the turn of the conductor to a cued
   * section. The spine and the chest each turn half of it.
   */
  turn: number;
  /** The turn of the neck and the head around y, in radians, on top of the idle look. */
  headTurn: number;
  /**
   * The lean of the count-in of the leader of a chamber group, in radians, on top of
   * {@link BodyAngles.lean} (design 5.4). It is 0 for the other animals.
   */
  nod: number;
  /** The upward turn of the head with the nod, on top of {@link BodyAngles.lift}. */
  nodHead: number;
  /**
   * The side turn of the neck and the head around z, in radians, on top of the side sway of the
   * spine: a positive roll turns the head to the left, as a positive sway does. A side move behind
   * the notes and the side lean of a pianist turn the head back by the side lean of the spine, so
   * that the eyes stay level.
   */
  roll: number;
  /**
   * The forward lean of the spine, in radians, that the turns of the neck and the head undo in
   * their axes: the look to the side turns the head around the vertical of the world, and the
   * roll around the forward direction of the world. Thus a look to the side keeps the eyes level
   * over a leaned spine. It is 0 for each family but the percussion.
   */
  upright: number;
}

/**
 * The motion families whose head is free while they play, so that the head of a leader nods with
 * the upper body (design 5.4). A bowed player holds the violin under the chin, and a wind player
 * holds the mouthpiece at the mouth, so their nod is in the upper body only.
 */
const FREE_HEADS: ReadonlySet<NoteLayer['family']> = new Set<NoteLayer['family']>([
  'keyboard',
  'harp',
  'percussion',
  'choir',
]);

/**
 * The instruments that stand on the floor in front of the player (design 5.4). The instrument
 * does not lean with the upper body, so a leader of these lifts the head with the breath and
 * drops it to level on the downbeat, with no lean. A lean of the upper body brought the head of
 * a cellist 0.025 m from the neck of the cello, and a nod of the head down 0.029 m.
 */
const FLOOR_INSTRUMENTS: ReadonlySet<InstrumentId> = new Set<InstrumentId>(['cello', 'contrabass']);

/**
 * Writes the body layer of one animal: the breath and the sway of the spine, the look at the
 * conductor, the ears, the tail, and the blink (design 5.1). The legs keep the bind pose (4.7),
 * except the right leg of a pianist on the damper pedal and the legs of a side move (5.3).
 * Then it calculates the frames of the torso with the root offset of the pose, from which the
 * note layer hangs the arms.
 *
 * @param pose The pose to write.
 * @param player The plan of the animal.
 * @param scratch The states of the frame, with the idle motion and the body angles of the animal.
 */
function writeBody(pose: WritablePose, player: PlayerPlan, scratch: FrameScratch): void {
  const m = BODY_MOTION;
  const r = pose.rotations;
  const { idle, body } = scratch;
  const breath = idle.breath * bodyScale(player);
  turn.setFromAxisAngle(Y_AXIS, body.turn / 2);
  turn.multiply(second.setFromAxisAngle(Z_AXIS, body.sway));
  setBoneRotation(
    r,
    BONES.spine,
    turn.multiply(
      second.setFromAxisAngle(X_AXIS, -body.lean - body.nod - body.slouch - breath * m.breathSpine),
    ),
  );
  turn.setFromAxisAngle(Y_AXIS, body.twist + body.turn / 2);
  setBoneRotation(
    r,
    BONES.chest,
    turn.multiply(second.setFromAxisAngle(X_AXIS, -breath * m.breathChest)),
  );
  yawAxis.set(0, Math.cos(body.upright), Math.sin(body.upright));
  rollAxis.set(0, -Math.sin(body.upright), Math.cos(body.upright));
  // A planned look comes before an idle look, and the idle look fills the rest of the turn.
  const { planned } = scratch;
  const look = planned.weight + idle.look * (1 - clamp01(planned.weight));
  const peek = MathUtils.clamp(player.lookYaw, -m.peek, m.peek) * planned.weight * body.peek;
  // The seeded turn and tilt of the head follow the share of the look, so that a wind player keeps
  // the mouthpiece on the lips.
  const { posture } = player;
  const yaw = (player.lookYaw * look + posture.turn) * body.look + peek + body.headTurn;
  const roll = body.roll + posture.tilt * body.look;
  const pitch = player.lookPitch * look * body.look + body.lift + body.nodHead;
  for (const [bone, part] of HEAD_SHARES) {
    turn.setFromAxisAngle(rollAxis, roll * part);
    turn.multiply(second.setFromAxisAngle(yawAxis, yaw * part));
    setBoneRotation(r, bone, turn.multiply(second.setFromAxisAngle(X_AXIS, pitch * part)));
  }
  // The ears lag behind the turn of the head and the sway, and the tail behind the sway.
  const { idleBefore, plannedBefore } = scratch;
  const lookBefore = plannedBefore.weight + idleBefore.look * (1 - clamp01(plannedBefore.weight));
  const peekBefore =
    MathUtils.clamp(player.lookYaw, -m.peek, m.peek) * plannedBefore.weight * body.peek;
  const o = OVERLAP;
  const earMax = player.earTwitch === 0 ? o.earMax * o.hanging : o.earMax;
  const drag = (change: number, factor: number, max: number): number =>
    MathUtils.clamp(-factor * change, -max, max);
  const dragYaw = drag(
    player.lookYaw * (look - lookBefore) * body.look + peek - peekBefore,
    o.ear,
    earMax,
  );
  const dragPitch = drag(player.lookPitch * (look - lookBefore) * body.look, o.ear, earMax);
  const dragRoll = drag(body.swayStep, o.ear, earMax);
  const ear =
    idle.ear * player.earTwitch * m.ear + posture.ear * (player.earTwitch === 0 ? o.hanging : 1);
  for (const [bone, twitch] of [
    [BONES.earL, ear],
    [BONES.earR, -ear],
  ] as const) {
    turn.setFromAxisAngle(Z_AXIS, twitch + dragRoll);
    turn.multiply(second.setFromAxisAngle(Y_AXIS, dragYaw));
    setBoneRotation(r, bone, turn.multiply(second.setFromAxisAngle(X_AXIS, dragPitch)));
  }
  const tail = idle.tail * player.tailSway;
  const tailDrag = drag(body.swayStep, o.tail, o.tailMax) * player.tailSway;
  setBoneRotation(r, BONES.tail1, turn.setFromAxisAngle(Y_AXIS, tail * m.tail1 + tailDrag));
  setBoneRotation(
    r,
    BONES.tail2,
    turn.setFromAxisAngle(Y_AXIS, (tail * m.tail1 + tailDrag) * (m.tail2 / m.tail1)),
  );
  pose.blink = Math.max(idle.blink, planned.blink);
  chainFrames(player.skeleton, r, scratch.chain, pose.rootOffset);
}

/**
 * Gives the side sway of the spine of a player (design 5.1, the beat layer). The player sways
 * with the felt pulse while it plays, and the gesture size follows the loudness of its passage
 * (5.3). The seeded sway of the player gives the side, the lag behind the pulse, and the pulse
 * level (`PlayerPlan.sway`).
 *
 * @param plan The plan of the score.
 * @param player The plan of the player.
 * @param noteTime The song time of the note layer.
 * @param weight The eased weight of the playing pose.
 * @returns The sway angle, in radians.
 */
function swayOf(plan: PosePlan, player: PlayerPlan, noteTime: number, weight: number): number {
  const activity = activityAt(player.passages, noteTime);
  if (activity.weight === 0 || weight === 0) {
    return 0;
  }
  const gesture = gestureSize(activity.loudness, player.amplitude);
  const { sign, lag, pulsesPerSide } = player.sway;
  const late = noteTime - lag * beatLengthAt(plan.pulses, noteTime);
  return (
    BODY_MOTION.sway *
    bodyScale(player) *
    sign *
    gesture *
    activity.weight *
    weight *
    beatSway(plan.pulses, late, pulsesPerSide)
  );
}

/**
 * Gives the factor of the breath and the sway of an animal (`BODY_MOTION.scale`).
 *
 * @param player The plan of the animal.
 * @returns 1 for the conductor and a player of {@link BASE_BODY_INSTRUMENTS}, else
 *   `BODY_MOTION.scale`.
 */
function bodyScale(player: PlayerPlan): number {
  return player.seatIndex < 0 || BASE_BODY_INSTRUMENTS.has(player.instrument)
    ? 1
    : BODY_MOTION.scale;
}

/**
 * The instruments whose players keep the base angles of the breath and the sway (design 5.1). A
 * floor instrument does not lean with the body, and a larger sway put the right upper arm of the
 * harpist 0.1 cm deeper into the neck of the harp, in 4% of the samples of the play. These players
 * also take no seeded slouch: with it, the upper arm of the harpist went into the neck of the harp
 * in the lift and in the rest.
 */
const BASE_BODY_INSTRUMENTS: ReadonlySet<InstrumentId> = new Set<InstrumentId>([
  'cello',
  'contrabass',
  'harp',
]);

/**
 * The states that `poseAt()` writes for each player. Each call of `poseAt()` makes them one time,
 * so that the players share them.
 */
interface FrameScratch {
  /** The frames of the root, the hips, the spine, and the chest of the current animal. */
  readonly chain: readonly Frame[];
  /** The root and the chest of {@link FrameScratch.chain}. */
  readonly torso: TorsoFrames;
  /** The idle motion of the current animal at the wall clock time. */
  readonly idle: IdleState;
  /** The planned look of the current animal at the song time. */
  readonly planned: PlannedLook;
  /** The idle motion and the planned look of the current animal `OVERLAP.lagSec` earlier. */
  readonly idleBefore: IdleState;
  readonly plannedBefore: PlannedLook;
  /** The body angles of the current animal. */
  readonly body: BodyAngles;
  readonly bow: BowState;
  readonly wind: WindState;
  readonly hands: HandsState;
  readonly choir: ChoirState;
  readonly strikes: PercussionState;
  readonly conductor: ConductorState;
  /** The expression of the conductor at the song time (design 5.4). */
  readonly expression: ExpressionState;
  /** The point of the baton at the start of the final chord (design 5.4). */
  readonly chordPoint: BatonState;
  /** The audibility of the seats and the wall clock time, for the cues of the conductor. */
  readonly audibility: readonly (SeatAudibility | undefined)[];
  readonly wallTime: number;
  /** The count-in of the last play, or `NO_COUNT_IN` after a seek during play (5.2, 5.4). */
  readonly countIn: CountIn;
  /** The song time of the frame, for the preparatory beat of a count-in after a pause. */
  readonly songTime: number;
  /** The play state, for the motion of the conductor at the song end. */
  readonly transport: Transport;
  /** The motion of the conductor at the song end (design 5.4). */
  readonly end: EndMotion;
  /**
   * The nod of the current animal in the count-in, in radians: the nod of the leader of a chamber
   * group, scaled by its playing pose, or 0 (design 5.4).
   */
  leaderNod: number;
}

/**
 * Calculates the pose of one animal.
 *
 * @param plan The plan of the score.
 * @param player The plan of the animal.
 * @param noteTime The song time of the note layer: the song time minus the seeded offset.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (design 5.2, 5.5).
 * @param scratch The states of the frame, with the idle motion of the animal.
 * @param pose The pose to write.
 */
function poseAnimal(
  plan: PosePlan,
  player: PlayerPlan,
  noteTime: number,
  weight: number,
  scratch: FrameScratch,
  pose: WritablePose,
): void {
  pose.rotations.set(BIND_ROTATIONS);
  pose.rootOffset.fill(0);
  pose.instrumentOffset.fill(0);
  pose.pawTurnL = null;
  pose.pawTurnR = null;
  pose.pawBendR = 0;
  const note = player.note;
  // The conductor does not sway with the beat. It sways with the phrase (design 5.4).
  const body = scratch.body;
  const lagged = noteTime - OVERLAP.lagSec;
  body.sway = note.family === 'conductor' ? 0 : swayOf(plan, player, noteTime, weight);
  body.swayStep =
    note.family === 'conductor' ? 0 : body.sway - swayOf(plan, player, lagged, weight);
  body.lean = 0;
  body.slouch = 0;
  body.look = 1;
  body.peek = 0;
  plannedLookAt(player.looks, noteTime, scratch.planned);
  plannedLookAt(player.looks, lagged, scratch.plannedBefore);
  idleAt(player.idle, scratch.wallTime - OVERLAP.lagSec, scratch.idleBefore);
  body.lift = 0;
  body.twist = 0;
  body.turn = 0;
  body.headTurn = 0;
  const floor = FLOOR_INSTRUMENTS.has(player.instrument);
  body.slouch = BASE_BODY_INSTRUMENTS.has(player.instrument) ? 0 : player.posture.slouch;
  body.nod = floor ? 0 : scratch.leaderNod;
  body.nodHead = 0;
  body.roll = 0;
  body.upright = 0;
  if (floor) {
    body.nodHead = Math.max(0, -scratch.leaderNod);
  } else if (FREE_HEADS.has(note.family)) {
    body.nodHead = -scratch.leaderNod;
  }
  switch (note.family) {
    case 'bowed': {
      const { bow } = scratch;
      const { hold } = note.rig;
      body.lean = hold.lean * weight;
      // A violinist rests the jaw on the chin rest while it plays (`BowedHold.headDrop`). A hold
      // can lift the head at rest (`BowedHold.restHeadLift`).
      body.lift = -hold.headDrop * weight + (hold.restHeadLift ?? 0) * (1 - weight);
      body.headTurn = hold.headTurn * weight;
      writeBody(pose, player, scratch);
      bowStateAt(note.strokes, note.starts, noteTime, bow);
      pose.pawBendR = hold.pawBendR;
      pose.pawTurnL = poseBowed(
        note.rig,
        scratch.torso,
        bow,
        weight,
        pose.rotations,
        pose.instrumentOffset,
      );
      break;
    }
    case 'woodwind':
    case 'brass': {
      const { wind } = scratch;
      windStateAt(note.track, noteTime, wind);
      // The head lifts off the mouthpiece in the rest pose, and keeps still while it plays. A
      // hold can turn the head to the left while the player plays, as a real flutist does, bow
      // it toward a far mouthpiece, and turn the spine back (design 5.3).
      body.lean = (note.rig.hold.lean - wind.breath * WIND_BODY.breath * player.amplitude) * weight;
      body.look = 1 - weight;
      body.peek = weight;
      body.lift = WIND_BODY.headLift * (1 - weight) - note.rig.headBow * weight;
      body.headTurn = note.rig.hold.headTurn * weight;
      writeBody(pose, player, scratch);
      poseWind(note.rig, scratch.torso, wind, weight, pose);
      break;
    }
    case 'keyboard':
    case 'harp': {
      const { hands } = scratch;
      handStateAt(note.left, noteTime, hands.left);
      handStateAt(note.right, noteTime, hands.right);
      const { lean, restLean, restHeadLift } = note.rig.hold;
      body.lean = restLean + (lean - restLean) * weight;
      body.lift = restHeadLift * (1 - weight);
      // The head turns back by the side lean toward the far keys, so that the eyes stay level and
      // the muzzle stays over the chest. With the head on the leaned spine, the muzzle of the
      // polar bear came down onto the left forearm at the lowest keys.
      const side = sideLeanAt(note.rig, note.left, note.right, noteTime) * weight;
      body.sway += side;
      body.roll = -side;
      writeBody(pose, player, scratch);
      poseHands(note.rig, scratch.torso, hands, weight, pose.rotations);
      // The damper pedal follows the `slide` bone down, under the right foot of a pianist.
      pose.slideOffset.fill(0);
      if (note.rig.foot) {
        const level = pedalLevelAt(note.pedal, noteTime);
        pose.slideOffset[1] = -posePedalFoot(note.rig.foot, level, weight, pose.rotations);
      }
      // The keys go down at the note times of the paws, and all keys are up in the rest pose.
      if (note.keys && pose.keys) {
        keyLevelsAt(note.keys, noteTime, pose.keys);
        for (let k = 0; k < pose.keys.length; k++) {
          pose.keys[k] = (pose.keys[k] ?? 0) * weight;
        }
      }
      // A plucked string swings and decays. The strings of a resting harpist are damped, and a
      // muted harpist plays no string.
      if (note.strings && pose.strings) {
        stringSwingsAt(note.strings, noteTime, pose.strings);
        for (let k = 0; k < pose.strings.length; k += 2) {
          pose.strings[k] = (pose.strings[k] ?? 0) * weight;
        }
      }
      // The claw of each key presses it, and the claw of the next key lifts before its strike.
      if (note.digits && pose.digits) {
        digitBendsAt(note.digits.left, noteTime, weight, pose.digits, 0);
        digitBendsAt(note.digits.right, noteTime, weight, pose.digits, DIGITS);
      }
      // The thumb of a harp hand closes on its own after its pluck (digit 1 of each paw).
      if (note.family === 'harp' && pose.digits) {
        const { thumbClosed } = note.rig.hold;
        pose.digits[0] = hands.left.thumb * thumbClosed * weight;
        pose.digits[DIGITS] = hands.right.thumb * thumbClosed * weight;
      }
      // The pedals of a harp go into the notches of the score, and the feet move them.
      if (note.family === 'harp' && note.pedals && pose.pedals) {
        pedalNotchesAt(note.pedals, noteTime, pose.pedals);
        if (note.rig.feet) {
          poseHarpFeet(note.rig.feet, note.pedals, pose.pedals, noteTime, weight, pose.rotations);
        }
      }
      break;
    }
    case 'choir': {
      const { choir } = scratch;
      choirStateAt(note.track, noteTime, choir);
      // The chest turns from side to side with the phrase, and neighbor voices turn to opposite
      // sides. The neck and the head lift a little in each phrase and keep still on each note. The
      // spine leans back with the breath in before a phrase.
      body.twist =
        CHOIR_MOTION.sway *
        choir.sway *
        weight *
        (player.seatIndex % 2 === 0 ? 1 : -1) *
        beatSway(plan.beats, noteTime, CHOIR_MOTION.swayBeats);
      body.lift = CHOIR_MOTION.headLift * choir.lift * weight;
      body.lean = -choir.breath * CHOIR_MOTION.breath * player.amplitude * weight;
      writeBody(pose, player, scratch);
      setBoneRotation(
        pose.rotations,
        BONES.jaw,
        turn.setFromAxisAngle(X_AXIS, -choir.jaw * weight),
      );
      poseChoir(note.rig, scratch.torso, pose.rotations);
      break;
    }
    case 'percussion': {
      const { strikes } = scratch;
      if (note.left) {
        strikeStateAt(note.left, noteTime, strikes.left);
      }
      if (note.right) {
        strikeStateAt(note.right, noteTime, strikes.right);
      }
      dampStateAt(note.damp, noteTime, strikes.damp);
      dampStateAt(note.ring, noteTime, strikes.ring);
      // The switch between the triangle and the held tambourine (`SmallTracks`).
      smallStateAt(note.small, note.right, noteTime, strikes.swap, strikes.small);
      if (note.small && pose.held) {
        pose.held.set(strikes.swap.held);
      }
      // The spine leans over the instrument (`PercussionHold.lean`), also in the rest pose of a
      // player that stays ready at its instrument (`PercussionHold.ready`). The body moves to the
      // side behind the notes, and the instrument and the feet stay in place
      // (`PercussionHold.side`). A positive sway leans to the left, and a positive share moves to
      // the right. The neck and the head turn back by the side lean, so that the eyes stay level
      // over the bars.
      const { legs } = note.rig;
      const ready = note.rig.hold.ready ? 1 : weight;
      body.lean = note.rig.hold.lean * ready;
      // The neck and the head turn back up by a share of the lean (`PercussionHold.headUp`).
      body.lift = note.rig.hold.headUp * body.lean;
      // At a damp of the bass drum, the upper body turns the left shoulder toward the far head, and
      // the head turns back (`PalmDamp.turn`).
      const damp = note.rig.hold.damp;
      if (damp?.kind === 'palm') {
        body.turn = -damp.turn * strikes.damp.weight * ready;
        body.headTurn = -body.turn;
      }
      // At a damp of the suspended cymbal, the spine leans further over the cymbal (`EdgeDamp`),
      // and at a muffle of the timpani over the kettle (`FingersDamp`), also at rest.
      if (damp?.kind === 'edge') {
        body.lean += damp.lean * strikes.damp.weight * weight;
      }
      if (damp?.kind === 'fingers') {
        body.lean += damp.lean * strikes.damp.weight * ready;
        // The shoulder of the paw of the damp comes forward: the right shoulder at key 1.
        body.turn = (strikes.damp.key === 1 ? 1 : -1) * damp.turn * strikes.damp.weight * ready;
        body.headTurn = -body.turn;
      }
      // At the trap table, the spine leans over the table (`TAMBOURINE_HOLD.tableLean`).
      if (note.small) {
        body.lean += TAMBOURINE_HOLD.tableLean * strikes.swap.table * ready;
      }
      body.upright = body.lean;
      if (note.side && legs) {
        const share = sideMoveAt(note.side, noteTime) * weight;
        body.sway -= share * note.side.move.spine;
        body.roll = share * note.side.move.spine;
        hipsOffset(legs, share * note.side.move.hips, pose.rootOffset);
        const [x, y, z] = pose.rootOffset;
        pose.instrumentOffset[0] = -x;
        pose.instrumentOffset[1] = -y;
        pose.instrumentOffset[2] = -z;
      }
      // A drum that takes its place from the body moves there (`PercussionRig.place`).
      const [px, py, pz] = note.rig.place;
      pose.instrumentOffset[0] += px;
      pose.instrumentOffset[1] += py;
      pose.instrumentOffset[2] += pz;
      writeBody(pose, player, scratch);
      // In a long rest of the music, the sticks go to their set position (`setRests()`).
      const set = note.rests ? setWeightAt(note.rests, noteTime) : 1;
      posePercussion(note.rig, scratch.torso, strikes, weight * set, pose.rotations, pose);
      if (note.side && legs) {
        plantFeet(legs, pose.rootOffset, pose.rotations);
      }
      // The plate of a suspended cymbal swings after each strike, and the paw of a damp stops it.
      if (note.swing) {
        const tilt = cymbalSwingAt(note.swing, noteTime) * (1 - strikes.damp.weight);
        setBoneRotation(pose.rotations, BONES.slide, turn.setFromAxisAngle(X_AXIS, tilt));
      }
      break;
    }
    case 'conductor': {
      const { conductor, expression, chordPoint, end } = scratch;
      // At the song end, the arms come down, and the bear turns to the audience and bows. A play
      // during the bow turns the bear back from where it is.
      transportEndMotion(scratch.transport, scratch.wallTime, note.audienceTurn, end);
      const arms = weight * end.arms;
      conductor.ready = readyAt(scratch.countIn, noteTime);
      batonAt(note.baton, noteTime, conductor.baton, conductor.ready);
      // The expression changes the beat at a climax and on the final chord (design 5.4).
      expressionAt(note.expression, noteTime, expression);
      const { final } = note.expression;
      if (final) {
        batonAt(note.baton, final.startSec, chordPoint);
      }
      expressBaton(
        note.expression,
        expression,
        noteTime,
        final ? chordPoint : null,
        conductor.baton,
      );
      conductor.baton.y += resumeLift(note.baton, scratch.countIn, scratch.songTime);
      // The head and the upper body turn to a cued section, only in the playing pose.
      const { cue } = conductor;
      cueStateAt(note.cues, noteTime, scratch.audibility, scratch.wallTime, cue);
      leftHandAt(note.left, noteTime, conductor.left);
      // The left palm keeps a soft passage down, holds the final chord up, and closes at the
      // cut-off.
      conductor.left.fade = Math.max(
        conductor.left.fade,
        EXPRESSION_MOTION.softPalm * expression.soft,
      );
      conductor.left.hold = Math.max(conductor.left.hold, expression.hold);
      conductor.left.close = Math.max(conductor.left.close, expression.close * expression.final);
      cue.torsoYaw *= arms;
      cue.headYaw *= arms;
      cue.headPitch *= arms;
      body.turn = cue.torsoYaw;
      // In a turn with steps at the song end, the head turns ahead of the hips.
      body.headTurn = cue.headYaw + end.headLead;
      // The body comes up from a forward lean for a cue of the left hand.
      const upright = 1 - EXPRESSION_MOTION.cueUpright * cue.hand;
      conductor.lean = expression.lean * arms * (expression.lean > 0 ? upright : 1);
      conductor.sway = expression.sway * arms;
      conductor.climax = expression.climax * arms;
      conductor.shrug = expression.shrug * arms;
      // The upper body twists further toward a cued section, and the head keeps its aim.
      body.twist = EXPRESSION_MOTION.cueTwist * cue.torsoYaw;
      body.headTurn -= body.twist;
      cue.handYaw += body.twist;
      // The hips move against the side lean of the sway and drop with the knees. The feet stay,
      // except in the steps of a turn at the song end.
      const stepping = stepsLegs(end);
      if (stepping) {
        const height = note.rig.headHeight;
        stance.turn = end.turn;
        stance.footL = end.footL;
        stance.footR = end.footR;
        stance.liftL = end.stepL * TURN_STEPS.lift * height;
        stance.liftR = end.stepR * TURN_STEPS.lift * height;
        stance.weight = end.weight * TURN_STEPS.weight;
        stance.shift = expression.shift * arms;
        stance.drop = end.knees * TURN_STEPS.knees * height + expression.drop * arms;
        stanceOffset(note.rig.legs, stance, pose.rootOffset);
      } else {
        hipsOffset(note.rig.legs, expression.shift * arms, pose.rootOffset);
        pose.rootOffset[1] -= expression.drop * arms;
      }
      conductor.shift = pose.rootOffset[0];
      conductor.drop = -pose.rootOffset[1];
      // The bow at the song end bends the spine and the head forward, and the body turns around
      // the root over the feet (design 5.4).
      body.lean = end.bend + conductor.lean;
      body.sway = conductor.sway;
      body.lift = cue.headPitch - end.bend * END_BOW.head + expression.head * arms;
      setBoneRotation(pose.rotations, BONES.root, turn.setFromAxisAngle(Y_AXIS, end.turn));
      writeBody(pose, player, scratch);
      if (stepping) {
        stepFeet(note.rig.legs, stance, pose.rootOffset, pose.rotations);
      } else if (conductor.drop > 0 || conductor.shift !== 0) {
        plantFeet(note.rig.legs, pose.rootOffset, pose.rotations);
      }
      poseConductor(note.rig, scratch.torso, conductor, arms, pose.rotations);
      break;
    }
    default: {
      const unhandled: never = note;
      throw new Error(`The note layer ${JSON.stringify(unhandled)} has no known motion family.`);
    }
  }
}

/**
 * Calculates the weight of the playing pose of one player (design 5.2, 5.5): 0 is the rest pose,
 * and 1 is the playing pose. The player lifts and lowers its instruments with its seeded rest
 * motion, for the transport, for the audibility of its seat, and for its long rests in the music.
 *
 * @param player The plan of the player.
 * @param transport The play state.
 * @param seat The audibility of the seat of the player, or `undefined` for a seat that sounds.
 * @param wallTime The wall clock time, in seconds.
 * @param noteTime The song time of the note layer of the player, for its long rests.
 * @returns The weight, in [0, 1].
 */
export function playerWeight(
  player: PlayerPlan,
  transport: Transport,
  seat: SeatAudibility | undefined,
  wallTime: number,
  noteTime: number,
): number {
  const { motion } = player;
  return (
    transportHeight(motion, transport, wallTime) *
    seatHeight(motion, seat, wallTime) *
    longRestHeight(player.longRests, motion, noteTime)
  );
}

/**
 * Calculates the poses of all players and of the conductor for one frame (design 5.1). The
 * pose is a pure function of the plan of the score, the song time, the wall clock time, the
 * transport, and the audibility of the seats. Thus seek, pause, speed, mute, and solo changes
 * are always correct.
 *
 * The pose has three layers. The note layer and the beat layer follow the song time, with the
 * seeded offset of each player. The idle layer follows the wall clock time. The transport and
 * the audibility of the seat lift or lower the instruments, with the seeded rest motion of each
 * player (5.2, 5.5).
 *
 * @param plan The plan of the score, from `preparePoses()`.
 * @param songTime The song time, in seconds.
 * @param wallTime The wall clock time, in seconds.
 * @param transport The play state.
 * @param audibility One entry for each seat of the score. A missing or `undefined` entry sounds:
 *   the seat has no mute or solo change.
 * @param out The poses to write, from {@link createScenePose}. A new buffer by default.
 * @param needed A flag for each player, then one for the conductor, or `null` for all. A pose
 *   with the flag 0 keeps its old values (design 9.7). The pose of each other player does not
 *   change, because no player reads the pose of another player.
 * @returns `out`, with the poses of the frame.
 */
export function poseAt(
  plan: PosePlan,
  songTime: number,
  wallTime: number,
  transport: Transport,
  audibility: readonly (SeatAudibility | undefined)[],
  out: ScenePoseBuffer = createScenePose(plan),
  needed: Uint8Array | null = null,
): ScenePose {
  const root = createFrame();
  const chest = createFrame();
  const scratch: FrameScratch = {
    chain: [root, createFrame(), createFrame(), chest],
    torso: { root, chest },
    idle: createIdleState(),
    planned: { weight: 0, blink: 0 },
    idleBefore: createIdleState(),
    plannedBefore: { weight: 0, blink: 0 },
    body: {
      sway: 0,
      swayStep: 0,
      lean: 0,
      slouch: 0,
      look: 1,
      peek: 0,
      lift: 0,
      twist: 0,
      turn: 0,
      headTurn: 0,
      nod: 0,
      nodHead: 0,
      roll: 0,
      upright: 0,
    },
    bow: createBowState(),
    wind: createWindState(),
    hands: { left: createHandState(), right: createHandState() },
    choir: createChoirState(),
    strikes: {
      left: createStrikeState(),
      right: createStrikeState(),
      damp: createDampState(),
      ring: createDampState(),
      swap: createSwitchState(),
      small: createSmallState(),
    },
    conductor: {
      baton: { x: 0, y: 0 },
      cue: createCueState(),
      ready: 0,
      left: createLeftHandState(),
      lean: 0,
      sway: 0,
      drop: 0,
      climax: 0,
      shrug: 0,
      shift: 0,
    },
    expression: createExpressionState(),
    chordPoint: { x: 0, y: 0 },
    audibility,
    wallTime,
    countIn: transport.seekStart ? NO_COUNT_IN : countInAt(plan.beats, transport.startSec),
    songTime,
    transport,
    end: createEndMotion(),
    leaderNod: 0,
  };
  // In the count-in after a pause, the note layers hold the pause point (design 5.2).
  const noteTime = noteLayerTime(scratch.countIn, songTime);
  for (let i = 0; i < plan.players.length; i++) {
    const player = plan.players[i];
    const pose = out.players[i];
    if (!player || !pose || needed?.[i] === 0) {
      continue;
    }
    idleAt(player.idle, wallTime, scratch.idle);
    const own = noteTime - player.timeOffset;
    const weight = playerWeight(player, transport, audibility[player.seatIndex], wallTime, own);
    // The leader of a chamber group gives the count-in with a breath and a nod (design 5.4).
    scratch.leaderNod = i === plan.leader ? leaderNodAt(scratch.countIn, songTime) * weight : 0;
    poseAnimal(plan, player, own, weight, scratch, pose);
  }
  scratch.leaderNod = 0;
  const { conductor } = plan;
  if (conductor && out.conductor && needed?.[plan.players.length] !== 0) {
    idleAt(conductor.idle, wallTime, scratch.idle);
    poseAnimal(
      plan,
      conductor,
      noteTime,
      transportHeight(conductor.motion, transport, wallTime),
      scratch,
      out.conductor,
    );
  }
  return out;
}
