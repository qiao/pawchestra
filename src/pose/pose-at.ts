import { MathUtils, Quaternion, Vector3 } from 'three';

import type { InstrumentId } from '../models/instruments/types.ts';
import { boneIndex } from '../models/rig.ts';
import { lastAtOrBefore } from './blend.ts';
import { poseBowed } from './bowed.ts';
import { createIdleState, idleAt } from './idle.ts';
import { poseConductor } from './conductor.ts';
import type { ConductorState } from './conductor.ts';
import { createLeftHandState, leftHandAt } from './conductor-left.ts';
import { batonAt, resumeLift } from './conductor-notes.ts';
import { createCueState, cueStateAt } from './cues.ts';
import { countInAt, leaderNodAt, noteLayerTime, readyAt } from './count-in.ts';
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
import { activityAt } from './passages.ts';
import { pedalLevelAt, posePedalFoot } from './pedal.ts';
import { PIANO_KEY_COUNT, keyLevelsAt } from './piano-keys.ts';
import { posePercussion } from './percussion.ts';
import type { PercussionState } from './percussion.ts';
import type { IdleState } from './idle.ts';
import type { NoteLayer, PlayerPlan, PosePlan } from './plan.ts';
import { END_BOW, endBowAt, seatHeight, smoothstep, transportHeight } from './rest.ts';
import { hipsOffset, plantFeet, sideMoveAt } from './side-move.ts';
import { createStrikeState, strikeStateAt } from './strikes.ts';
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
  pawBendR: number;
  blink: number;
  readonly keys: Float32Array | null;
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
  /** The part of a look that the neck turns. The head turns the rest. */
  lookNeck: NECK_SHARE,
  /** The turn of each ear at the top of a twitch. */
  ear: 12 * MathUtils.DEG2RAD,
  /** The turns of the two tail bones at the end of a sway. */
  tail1: 8 * MathUtils.DEG2RAD,
  tail2: 12 * MathUtils.DEG2RAD,
} as const;

const BONES = {
  spine: boneIndex('spine'),
  chest: boneIndex('chest'),
  neck: boneIndex('neck'),
  head: boneIndex('head'),
  earL: boneIndex('earL'),
  earR: boneIndex('earR'),
  tail1: boneIndex('tail1'),
  tail2: boneIndex('tail2'),
  jaw: boneIndex('jaw'),
} as const;

/**
 * Makes the pose of one animal in the bind pose.
 *
 * @param player The plan of the animal. A pianist gets the levels of its keys, all up.
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
    pawBendR: 0,
    blink: 0,
    keys: note.family === 'keyboard' && note.keys ? new Float32Array(PIANO_KEY_COUNT) : null,
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

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const turn = new Quaternion();
const second = new Quaternion();
const yawAxis = new Vector3();
const rollAxis = new Vector3();

/** The angles that the motion family of an animal adds to its body layer (design 5.1, 5.3). */
interface BodyAngles {
  /** The side sway of the spine with the beat, in radians. */
  sway: number;
  /** The forward lean of the spine, in radians. */
  lean: number;
  /**
   * The part of the idle look at the conductor that the head turns. A wind player does not turn
   * the head from the mouthpiece while it plays.
   */
  look: number;
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
   * the notes turns the head back by the side lean of the spine, so that the eyes stay level.
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
  turn.setFromAxisAngle(Y_AXIS, body.turn / 2);
  turn.multiply(second.setFromAxisAngle(Z_AXIS, body.sway));
  setBoneRotation(
    r,
    BONES.spine,
    turn.multiply(
      second.setFromAxisAngle(X_AXIS, -body.lean - body.nod - idle.breath * m.breathSpine),
    ),
  );
  turn.setFromAxisAngle(Y_AXIS, body.twist + body.turn / 2);
  setBoneRotation(
    r,
    BONES.chest,
    turn.multiply(second.setFromAxisAngle(X_AXIS, -idle.breath * m.breathChest)),
  );
  yawAxis.set(0, Math.cos(body.upright), Math.sin(body.upright));
  rollAxis.set(0, -Math.sin(body.upright), Math.cos(body.upright));
  const yaw = player.lookYaw * idle.look * body.look + body.headTurn;
  const pitch = player.lookPitch * idle.look * body.look + body.lift + body.nodHead;
  for (const [bone, part] of [
    [BONES.neck, m.lookNeck],
    [BONES.head, 1 - m.lookNeck],
  ] as const) {
    turn.setFromAxisAngle(rollAxis, body.roll * part);
    turn.multiply(second.setFromAxisAngle(yawAxis, yaw * part));
    setBoneRotation(r, bone, turn.multiply(second.setFromAxisAngle(X_AXIS, pitch * part)));
  }
  const ear = idle.ear * player.earTwitch * m.ear;
  setBoneRotation(r, BONES.earL, turn.setFromAxisAngle(Z_AXIS, ear));
  setBoneRotation(r, BONES.earR, turn.setFromAxisAngle(Z_AXIS, -ear));
  const tail = idle.tail * player.tailSway;
  setBoneRotation(r, BONES.tail1, turn.setFromAxisAngle(Y_AXIS, tail * m.tail1));
  setBoneRotation(r, BONES.tail2, turn.setFromAxisAngle(Y_AXIS, tail * m.tail2));
  pose.blink = idle.blink;
  chainFrames(player.skeleton, r, scratch.chain, pose.rootOffset);
}

/**
 * Gives the side sway of the spine of a player (design 5.1, the beat layer). The player sways
 * with the felt pulse while it plays, and the gesture size follows the loudness of its passage
 * (5.3).
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
  return BODY_MOTION.sway * gesture * activity.weight * weight * beatSway(plan.pulses, noteTime);
}

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
  /** The body angles of the current animal. */
  readonly body: BodyAngles;
  readonly bow: BowState;
  readonly wind: WindState;
  readonly hands: HandsState;
  readonly choir: ChoirState;
  readonly strikes: PercussionState;
  readonly conductor: ConductorState;
  /** The audibility of the seats and the wall clock time, for the cues of the conductor. */
  readonly audibility: readonly (SeatAudibility | undefined)[];
  readonly wallTime: number;
  /** The count-in of the last play (design 5.2, 5.4). */
  readonly countIn: CountIn;
  /** The song time of the frame, for the preparatory beat of a count-in after a pause. */
  readonly songTime: number;
  /** The wall seconds since the pause at the song end, or `NaN` before the song end. */
  readonly endElapsed: number;
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
  pose.pawBendR = 0;
  const note = player.note;
  // The conductor does not sway with the beat (design 5.4).
  const body = scratch.body;
  body.sway = note.family === 'conductor' ? 0 : swayOf(plan, player, noteTime, weight);
  body.lean = 0;
  body.look = 1;
  body.lift = 0;
  body.twist = 0;
  body.turn = 0;
  body.headTurn = 0;
  const floor = FLOOR_INSTRUMENTS.has(player.instrument);
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
      // A violinist rests the jaw on the chin rest while it plays (`BowedHold.headDrop`).
      body.lift = -hold.headDrop * weight;
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
      // hold can turn the head to the left while the player plays, as a real flutist does, and
      // bow it toward a far mouthpiece (design 5.3).
      body.lean = -wind.breath * WIND_BODY.breath * player.amplitude * weight;
      body.look = 1 - weight;
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
      body.sway += sideLeanAt(note.rig, note.left, note.right, noteTime) * weight;
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
      break;
    }
    case 'choir': {
      const { choir } = scratch;
      choirStateAt(note.track, noteTime, choir);
      // The chest turns from side to side with the phrase, and neighbor voices turn to opposite
      // sides. The neck and the head lift with the opening of the jaw. The spine leans back with
      // the breath in before a phrase.
      body.twist =
        CHOIR_MOTION.sway *
        choir.sway *
        weight *
        (player.seatIndex % 2 === 0 ? 1 : -1) *
        beatSway(plan.beats, noteTime, CHOIR_MOTION.swayBeats);
      body.lift = (CHOIR_MOTION.headLift * choir.jaw * weight) / CHOIR_MOTION.jaw;
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
      for (const [track, state] of [
        [note.left, strikes.left],
        [note.right, strikes.right],
      ] as const) {
        if (track) {
          strikeStateAt(track, noteTime, state);
        }
      }
      // The spine leans over the instrument (`PercussionHold.lean`), also in the rest pose of a
      // player that stays ready at its instrument (`PercussionHold.ready`). The body moves to the
      // side behind the notes, and the instrument and the feet stay in place
      // (`PercussionHold.side`). A positive sway leans to the left, and a positive share moves to
      // the right. The neck and the head turn back by the side lean, so that the eyes stay level
      // over the bars.
      const { legs } = note.rig;
      body.lean = note.rig.hold.lean * (note.rig.hold.ready ? 1 : weight);
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
      posePercussion(note.rig, scratch.torso, strikes, weight, pose.rotations);
      if (note.side && legs) {
        plantFeet(legs, pose.rootOffset, pose.rotations);
      }
      break;
    }
    case 'conductor': {
      const { conductor } = scratch;
      conductor.ready = readyAt(scratch.countIn, noteTime);
      batonAt(note.baton, noteTime, conductor.baton, conductor.ready);
      conductor.baton.y += resumeLift(note.baton, scratch.countIn, scratch.songTime);
      // The head and the upper body turn to a cued section, only in the playing pose.
      const { cue } = conductor;
      cueStateAt(note.cues, noteTime, scratch.audibility, scratch.wallTime, cue);
      leftHandAt(note.left, noteTime, conductor.left);
      cue.torsoYaw *= weight;
      cue.headYaw *= weight;
      cue.headPitch *= weight;
      body.turn = cue.torsoYaw;
      body.headTurn = cue.headYaw;
      // The bow at the song end bends the spine and the head forward (design 5.4).
      const bend = endBowAt(scratch.endElapsed);
      body.lean = bend;
      // The left hand comes down to the side as the bow starts, and stays down.
      conductor.bow = Number.isNaN(scratch.endElapsed)
        ? 0
        : smoothstep((scratch.endElapsed - END_BOW.startSec) / END_BOW.downSec);
      body.lift = cue.headPitch - bend * END_BOW.head;
      writeBody(pose, player, scratch);
      poseConductor(note.rig, scratch.torso, conductor, weight, pose.rotations);
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
 * motion, for the transport and for the audibility of its seat.
 *
 * @param player The plan of the player.
 * @param transport The play state.
 * @param seat The audibility of the seat of the player, or `undefined` for a seat that sounds.
 * @param wallTime The wall clock time, in seconds.
 * @returns The weight, in [0, 1].
 */
export function playerWeight(
  player: PlayerPlan,
  transport: Transport,
  seat: SeatAudibility | undefined,
  wallTime: number,
): number {
  const { motion } = player;
  return transportHeight(motion, transport, wallTime) * seatHeight(motion, seat, wallTime);
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
 * @returns `out`, with the poses of the frame.
 */
export function poseAt(
  plan: PosePlan,
  songTime: number,
  wallTime: number,
  transport: Transport,
  audibility: readonly (SeatAudibility | undefined)[],
  out: ScenePoseBuffer = createScenePose(plan),
): ScenePose {
  const root = createFrame();
  const chest = createFrame();
  const scratch: FrameScratch = {
    chain: [root, createFrame(), createFrame(), chest],
    torso: { root, chest },
    idle: createIdleState(),
    body: {
      sway: 0,
      lean: 0,
      look: 1,
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
    strikes: { left: createStrikeState(), right: createStrikeState() },
    conductor: {
      baton: { x: 0, y: 0 },
      cue: createCueState(),
      ready: 0,
      left: createLeftHandState(),
      bow: 0,
    },
    audibility,
    wallTime,
    countIn: countInAt(plan.beats, transport.startSec),
    songTime,
    endElapsed:
      !transport.playing && transport.changedAtWall !== null && songTime >= plan.endSec - 1e-3
        ? wallTime - transport.changedAtWall
        : Number.NaN,
    leaderNod: 0,
  };
  // In the count-in after a pause, the note layers hold the pause point (design 5.2).
  const noteTime = noteLayerTime(scratch.countIn, songTime);
  for (const [i, player] of plan.players.entries()) {
    const pose = out.players[i];
    if (!pose) {
      continue;
    }
    idleAt(player.idle, wallTime, scratch.idle);
    const weight = playerWeight(player, transport, audibility[player.seatIndex], wallTime);
    // The leader of a chamber group gives the count-in with a breath and a nod (design 5.4).
    scratch.leaderNod = i === plan.leader ? leaderNodAt(scratch.countIn, songTime) * weight : 0;
    poseAnimal(plan, player, noteTime - player.timeOffset, weight, scratch, pose);
  }
  scratch.leaderNod = 0;
  const { conductor } = plan;
  if (conductor && out.conductor) {
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
