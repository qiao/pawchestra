import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

import type { BodyBoneName } from './biped.ts';
import { BONE_NAMES, boneIndex } from './rig.ts';
import type { Skeleton } from './rig.ts';
import {
  ARM_SEGMENTS,
  STUDIO_ARM_BONES,
  STUDIO_BONES,
  STUDIO_LEG_BONES,
  STUDIO_PARENTS,
  STUDIO_RAISES,
  STUDIO_TAIL_BONES,
  unpackStudioMesh,
} from './studio-format.ts';
import type {
  Side,
  StudioArmBone,
  StudioBody,
  StudioBone,
  StudioHeads,
  StudioMesh,
  StudioRaise,
  StudioStanding,
} from './studio-format.ts';
import { toVec3 } from './tuples.ts';
import type { Quat, Vec3 } from './tuples.ts';

/**
 * The bone of the player that each bone of a studio body follows (design 4.4, 4.7). A bone of the
 * trunk, the head, the legs, or the tail moves as its bone of the player. The root of the tail
 * follows `tail1`, the tip of a tail of two bones follows `tail2`, and the jaw of a beak follows
 * `jaw`, which the choir pose opens (design 5.3). The arm bones of the studio take the joints and
 * the hand of the player, with the bend of the elbow of the studio and the twist split of the
 * forearm ({@link poseStudioBones}). The arm segments and the elbow helper follow the upper arm or
 * the forearm of their part, and the wrist helper the forearm. The readers of the bind mesh, such
 * as the footprints, read the bone of the player of the largest weight.
 */
export const STUDIO_FOLLOWS = {
  root: 'root',
  hips: 'hips',
  spine: 'spine',
  spine1: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  ear_L: 'earL',
  ear_R: 'earR',
  clavicle_L: 'shoulderL',
  upper_arm_L: 'upperArmL',
  forearm_L: 'forearmL',
  forearm_twist_L: 'forearmL',
  hand_L: 'handL',
  fingers_L: 'fingersL',
  clavicle_R: 'shoulderR',
  upper_arm_R: 'upperArmR',
  forearm_R: 'forearmR',
  forearm_twist_R: 'forearmR',
  hand_R: 'handR',
  fingers_R: 'fingersR',
  thigh_L: 'thighL',
  shin_L: 'shinL',
  foot_L: 'footL',
  toes_L: 'footL',
  thigh_R: 'thighR',
  shin_R: 'shinR',
  foot_R: 'footR',
  toes_R: 'footR',
  tail: 'tail1',
  eye_L: 'eyeL',
  eye_R: 'eyeR',
  tail_tip: 'tail2',
  jaw: 'jaw',
  upper_arm_seg0_L: 'upperArmL',
  upper_arm_seg1_L: 'upperArmL',
  upper_arm_seg2_L: 'upperArmL',
  upper_arm_seg3_L: 'upperArmL',
  forearm_seg0_L: 'forearmL',
  forearm_seg1_L: 'forearmL',
  forearm_seg2_L: 'forearmL',
  forearm_seg3_L: 'forearmL',
  elbow_L: 'upperArmL',
  wrist_L: 'forearmL',
  upper_arm_seg0_R: 'upperArmR',
  upper_arm_seg1_R: 'upperArmR',
  upper_arm_seg2_R: 'upperArmR',
  upper_arm_seg3_R: 'upperArmR',
  forearm_seg0_R: 'forearmR',
  forearm_seg1_R: 'forearmR',
  forearm_seg2_R: 'forearmR',
  forearm_seg3_R: 'forearmR',
  elbow_R: 'upperArmR',
  wrist_R: 'forearmR',
} as const satisfies Readonly<Record<StudioBone, BodyBoneName>>;

/**
 * The share of the twist of the paw that the forearm twist bone takes, as in the clips of the
 * studio (`lowpoly-studio/roles/conductor/clips.py`). Thus the skin of the forearm does not twist
 * as a candy wrapper.
 */
export const TWIST_SHARE = 0.5;

/**
 * The turn of a paw in the plane of its palm toward the forearm (design 4.4). The hand of the
 * player holds the baton across the palm and points the fingers along the places of the left
 * hand, so its fingers stand at 45° to 150° from the forearm in the conductor poses. The skin of
 * the studio bends well up to about 50° at the wrist (`lowpoly-studio/roles/conductor/`). The
 * turn in the plane of the palm keeps the palm, the baton across it, and the curl of the fingers,
 * and it brings the paw toward the line of the forearm. The right paw turns only by positive
 * angles: toward the baton, which runs forward from the fist. A turn away from the baton takes the
 * baton out of the paw.
 */
export const PAW_TURN = {
  /** The largest turn, in radians. The baton stays in the paw up to about 70°. */
  max: (70 * Math.PI) / 180,
  /**
   * The length of the part of the unit forearm in the plane of the palm, from 0 to 1, below which
   * the turn fades out: a forearm along the palm normal gives no direction in the plane.
   */
  fade: [0.2, 0.5],
  /**
   * The angle of the forearm in the plane of the palm, in radians, from which the turn fades out
   * toward the angle π: there, the angle jumps from π to -π, and with no fade, the turn jumps from
   * the largest turn to the other side in one frame.
   */
  back: (150 * Math.PI) / 180,
} as const;

/** The direction down: the bones of each arm of the player point down in the bind pose. */
const DOWN: Vec3 = [0, -1, 0];

/**
 * The palm of each hand of the player in the bind pose: inward, to the side to which the fingers
 * curl (`writeCurl()` of `pose/ik.ts`). The left side of the animal is -x.
 */
const PALMS: Readonly<Record<Side, Vec3>> = { L: [1, 0, 0], R: [-1, 0, 0] };

/** The constants of one arm of a studio body for {@link poseStudioBones}. */
interface StudioArm {
  readonly side: Side;
  /** The studio bones of the arm, as indices in `STUDIO_BONES`. */
  readonly bones: Readonly<
    Record<'clavicle' | 'upper' | 'fore' | 'twist' | 'hand' | 'fingers', number>
  >;
  /** The bones of the player that drive the arm, as indices in `BONE_NAMES`. */
  readonly drivers: Readonly<Record<'upper' | 'fore' | 'hand' | 'fingers', number>>;
  /** The unit direction of the upper arm in the bind pose of the studio: shoulder to elbow. */
  readonly upper: Vec3;
  /** The unit direction of the forearm in the bind pose of the studio: elbow to wrist. */
  readonly fore: Vec3;
  /**
   * The unit axis of the elbow in the bind pose of the studio: {@link StudioBody.hinges}, or
   * upper × fore for a bent bind arm.
   */
  readonly hinge: Vec3;
  /** The part of the way from the elbow to the wrist at the head of the twist bone. */
  readonly twistAt: number;
  /**
   * The rotation from the paw of the studio in its bind pose to the paw of the player in its bind
   * pose: the fingers down, and the palm inward.
   */
  readonly paw: Quat;
  /**
   * The bend of the paw of the bind pose off its forearm, in the plane of the palm, in radians:
   * the turn of the paw around the normal of its palm past the line of the forearm that gives the
   * paw its place on the forearm of the bind pose. The seated bind of the studio bends each paw
   * about 25° off the forearm, and the turn of {@link PAW_TURN} takes the bend away.
   */
  readonly bindBend: number;
  /**
   * The unit axis around which the fingers of the studio curl toward the palm, in the bind pose
   * of the studio: the paw axis × the palm normal.
   */
  readonly curl: Vec3;
  /** The direction of the upper arm in the axes of the chest in the pose of the sheet. */
  readonly sheet: Vec3;
  /** The arm segments and the helpers of a body with them, or `null` (design 4.4, 4.7). */
  readonly segments: StudioArmSegments | null;
}

/**
 * The arm segments and the helpers of one arm, as indices in `STUDIO_BONES`
 * (`ARM_SEGMENT_BONES` of `models/studio-format.ts`).
 */
interface StudioArmSegments {
  /** The segments of the upper arm, from the shoulder out. */
  readonly upper: readonly number[];
  /** The segments of the forearm, from the elbow out. */
  readonly fore: readonly number[];
  /** The elbow helper. */
  readonly elbow: number;
  /** The wrist helper. */
  readonly wrist: number;
}

/**
 * A studio body that is ready to pose: the unpacked mesh, the skeleton of the player, and the
 * constants of the arms (design 4.4).
 */
export interface StudioRig {
  readonly body: StudioBody;
  readonly mesh: StudioMesh;
  /**
   * The bind positions of the body bones of the player. The trunk, the head, and the legs have the
   * joints of the studio. Each arm hangs straight down from the shoulder joint of the studio, with
   * the lengths of the arm of the studio, as the pose code of section 5 needs.
   */
  readonly positions: Readonly<Record<BodyBoneName, Vec3>>;
  /**
   * The bone of the player that each skin joint follows, as indices in `BONE_NAMES`: each studio
   * bone, and the twist bone of each upper arm at its index of {@link UPPER_TWIST_BONES}, which
   * follows the upper arm. The readers of the bind mesh read the skin by this map.
   */
  readonly follows: Uint8Array;
  readonly arms: Readonly<Record<Side, StudioArm>>;
}

/**
 * The pose of the bones of a studio body for one frame: one matrix for each bone of the studio,
 * then one for each bone of the player, which moves the instrument.
 */
export interface StudioPose {
  /**
   * 16 numbers for each bone, column by column: the move of a point from the bind pose to the
   * pose, in the model axes. The studio bones come first, then the bones of `BONE_NAMES`.
   */
  readonly matrices: Float32Array;
  /**
   * The weight of each arm corrective shape, from 0 to 1, in the order of the shapes of a packed
   * studio mesh: the left arm down, the right arm down, and the shapes of
   * {@link StudioBody.raises} in their order. It holds {@link STUDIO_RAISES} weights after the two
   * arm-down shapes, and each weight past the shapes of the body is 0.
   */
  readonly correctives: Float32Array;
}

/**
 * The offsets of a pose of the player that move bones from their bind places (design 5.1): the
 * root offset, and the offsets of the instrument bone and of the slide bone. Two values of the
 * paws also come with them: the turn of the left paw, and the share of the bind bend that the
 * right paw keeps.
 */
interface BoneOffsets {
  /** The offset of the root bone, in the model axes. */
  readonly root: Vec3;
  /** The offset of the `instrument` bone, in the axes of its parent. */
  readonly instrument: Vec3;
  /** The offset of the `slide` bone, in the axes of its parent, the `instrument` bone. */
  readonly slide: Vec3;
  /**
   * The turn of the left paw in the plane of its palm, in radians, in place of the turn toward
   * the forearm ({@link PAW_TURN}), or `null` for that turn (`pawTurnL` of `AnimalPose`).
   */
  readonly pawTurnL: number | null;
  /**
   * The share of the bend of the bind paw ({@link StudioArm.bindBend}) that the right paw keeps on
   * its forearm, from 0 to 1, after the turn toward the forearm ({@link PAW_TURN}): 0 puts the paw
   * on the line of the forearm, and 1 keeps the paw of the bind pose on it (`pawKeepR` of
   * `AnimalPose`).
   */
  readonly pawKeepR: number;
}

/** The offsets of a pose that moves no bone from its bind place. */
export const NO_OFFSETS: BoneOffsets = {
  root: [0, 0, 0],
  instrument: [0, 0, 0],
  slide: [0, 0, 0],
  pawTurnL: null,
  pawKeepR: 0,
};

/** The offsets that a pose of a player holds (`AnimalPose` of `pose/types.ts`, design 5.1). */
interface PoseOffsets {
  /** The offset of the root bone. */
  readonly rootOffset: Vec3;
  /** The offset of the `instrument` bone, or none for no move. */
  readonly instrumentOffset?: Vec3;
  /** The offset of the `slide` bone. */
  readonly slideOffset: Vec3;
  /** The turn of the left paw in the plane of its palm, or none for the turn of the retarget. */
  readonly pawTurnL?: number | null;
  /** The share of the bind bend that the right paw keeps, or none for 0. */
  readonly pawKeepR?: number;
}

/**
 * Gives the bone offsets of a pose of a player.
 *
 * @param pose The pose.
 * @returns The offsets of the root, the instrument, and the slide.
 */
export function studioOffsets(pose: PoseOffsets): BoneOffsets {
  return {
    root: pose.rootOffset,
    instrument: pose.instrumentOffset ?? NO_OFFSETS.instrument,
    slide: pose.slideOffset,
    pawTurnL: pose.pawTurnL ?? null,
    pawKeepR: pose.pawKeepR ?? 0,
  };
}

/** The index of the `instrument` bone of the player. */
const INSTRUMENT = boneIndex('instrument');

/** The index of the `slide` bone of the player. */
const SLIDE = boneIndex('slide');

/**
 * The index of the matrix of the twist bone of each upper arm in a {@link StudioPose}, after the
 * bones of the player (`StudioBody.upperTwist`).
 */
export const UPPER_TWIST_BONES = {
  L: STUDIO_BONES.length + BONE_NAMES.length,
  R: STUDIO_BONES.length + BONE_NAMES.length + 1,
} as const satisfies Readonly<Record<Side, number>>;

/** The number of matrices of a {@link StudioPose}: with the twist bones of the upper arms. */
export const STUDIO_POSE_BONES = STUDIO_BONES.length + BONE_NAMES.length + 2;

/**
 * The places along the upper arm, from 0 at the shoulder joint to 1 at the elbow, between which
 * the weight of the upper arm moves from the twist bone to the upper arm bone
 * (`StudioBody.upperTwist`).
 */
const UPPER_TWIST_SPAN = [0.1, 0.9] as const;

/**
 * The index of the weight of the first shape of a raised arm or of a bent wrist in
 * {@link StudioPose.correctives}.
 */
const RAISED = 2;

/**
 * Makes a studio pose to write.
 *
 * @returns The pose of the bind pose.
 */
export function createStudioPose(): StudioPose {
  const matrices = new Float32Array(STUDIO_POSE_BONES * 16);
  for (let b = 0; b < STUDIO_POSE_BONES; b++) {
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], b * 16);
  }
  return { matrices, correctives: new Float32Array(RAISED + STUDIO_RAISES) };
}

/**
 * Gives the rotation that turns the frame (`aFrom`, `bFrom`) into the frame (`aTo`, `bTo`): `a`
 * goes to `a`, and the plane of `a` and `b` goes to the plane of the other `a` and `b`.
 *
 * @param aFrom The first axis of the first frame.
 * @param bFrom A second axis of the first frame, not along `aFrom`.
 * @param aTo The first axis of the second frame.
 * @param bTo A second axis of the second frame.
 * @param out The quaternion to write.
 * @returns `out`.
 */
function alignFrames(
  aFrom: Vector3,
  bFrom: Vector3,
  aTo: Vector3,
  bTo: Vector3,
  out: Quaternion,
): Quaternion {
  basisOf(aFrom, bFrom, fromBasis);
  basisOf(aTo, bTo, toBasis);
  return out.setFromRotationMatrix(toBasis.multiply(fromBasis.transpose()));
}

const fromBasis = new Matrix4();
const toBasis = new Matrix4();
const ax = new Vector3();
const bx = new Vector3();
const cx = new Vector3();

/**
 * Writes the orthonormal frame of two axes: `a`, `b` made normal to `a`, and `a × b`.
 *
 * @param a The first axis.
 * @param b The second axis.
 * @param out The matrix to write, with the three axes as its columns.
 */
function basisOf(a: Vector3, b: Vector3, out: Matrix4): void {
  ax.copy(a).normalize();
  bx.copy(b).addScaledVector(ax, -b.dot(ax)).normalize();
  cx.crossVectors(ax, bx);
  out.makeBasis(ax, bx, cx);
}

/**
 * Gives the angle of the twist of a rotation around an axis (the swing and twist split).
 *
 * @param q The rotation.
 * @param axis The unit axis.
 * @returns The angle, from -π to π.
 */
export function twistAngle(q: Quaternion, axis: Vector3): number {
  const angle = 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);
  return ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

/**
 * Gives the bind positions of the body bones of the player for a studio body. The arms hang
 * straight down, because the pose code reads the hanging arm of the bind pose (design 4.7, 5.2).
 *
 * @param body The studio body.
 * @returns The positions.
 */
function playerPositions(body: StudioBody): Record<BodyBoneName, Vec3> {
  const h = body.heads;
  const below = (from: Vec3, length: number): Vec3 => [from[0], from[1] - length, from[2]];
  const length = (a: Vec3, b: Vec3): number => new Vector3(...a).distanceTo(new Vector3(...b));
  const arm = (side: Side) => {
    const shoulder = h[`upper_arm_${side}`];
    const elbow = below(shoulder, length(shoulder, h[`forearm_${side}`]));
    const wrist = below(elbow, length(h[`forearm_${side}`], h[`hand_${side}`]));
    const knuckle = below(wrist, length(h[`hand_${side}`], h[`fingers_${side}`]));
    return { clavicle: h[`clavicle_${side}`], shoulder, elbow, wrist, knuckle };
  };
  const left = arm('L');
  const right = arm('R');
  return {
    root: [0, 0, 0],
    hips: h.hips,
    spine: h.spine,
    chest: h.chest,
    neck: h.neck,
    head: h.head,
    jaw: h.jaw ?? body.nose,
    eyeL: h.eye_L,
    eyeR: h.eye_R,
    earL: h.ear_L,
    earR: h.ear_R,
    tail1: h.tail,
    tail2: h.tail_tip ?? h.tail,
    trunk1: h.head,
    trunk2: h.head,
    trunk3: h.head,
    shoulderL: left.clavicle,
    upperArmL: left.shoulder,
    forearmL: left.elbow,
    handL: left.wrist,
    fingersL: left.knuckle,
    shoulderR: right.clavicle,
    upperArmR: right.shoulder,
    forearmR: right.elbow,
    handR: right.wrist,
    fingersR: right.knuckle,
    thighL: h.thigh_L,
    shinL: h.shin_L,
    footL: h.foot_L,
    thighR: h.thigh_R,
    shinR: h.shin_R,
    footR: h.foot_R,
  };
}

/**
 * Gives the turns of the standing pose of a seated studio body: each leg bone, each bone of a tail
 * of two bones, and each bone of a reclined trunk.
 *
 * @param standing The standing pose.
 * @returns The world turn from the bind pose of each bone that has a turn of its own.
 */
function standingTurns(standing: StudioStanding): Map<StudioBone, Quat> {
  const turns = new Map<StudioBone, Quat>(
    STUDIO_LEG_BONES.map((bone) => [bone, standing.turns[bone]] as const),
  );
  const tail = standing.tailTurns;
  if (tail) {
    for (const bone of STUDIO_TAIL_BONES) {
      turns.set(bone, tail[bone]);
    }
  }
  for (const [bone, turn] of Object.entries(standing.trunkTurns ?? {})) {
    if (turn && isStudioBone(bone)) {
      turns.set(bone, turn);
    }
  }
  return turns;
}

/**
 * Finds if a text names a bone of a studio body.
 *
 * @param name The text.
 * @returns True for a bone of `STUDIO_BONES`.
 */
function isStudioBone(name: string): name is StudioBone {
  return STUDIO_BONES.some((bone) => bone === name);
}

/** A studio body with its unpacked mesh, in the stance of a player. */
interface PosedStudioBody {
  /** The body, with the bind places of its bones in the stance. */
  readonly body: StudioBody;
  /** The mesh, with its bind places in the stance and the arm corrective shapes only. */
  readonly mesh: StudioMesh;
}

/**
 * Gives the number of the arm corrective shapes of a studio body, the first shapes of its packed
 * mesh: the two arm-down shapes, and the shapes of a raised arm or of a bent wrist of the body.
 *
 * @param body The studio body.
 * @returns The number.
 */
function armCorrectives(body: StudioBody): number {
  return RAISED + (body.raises?.length ?? 0);
}

/** The bones of a studio body in a pose of world turns from the bind pose. */
interface ChainPose {
  /** The matrix of each bone, in the order of `STUDIO_BONES`. */
  readonly matrices: Float32Array;
  /** The posed head of each bone that has a head. */
  readonly heads: Partial<Record<StudioBone, Vec3>>;
  /** The world turn of each turned bone from the bind pose. */
  readonly turns: ReadonlyMap<StudioBone, Quaternion>;
}

/**
 * Poses the bones of a studio body by world turns from the bind pose: each bone with a turn of its
 * own turns around its head, each other bone turns with its parent, and the heads follow their
 * parents from the root out. A bone with no turn of its own and no turned parent keeps its place.
 *
 * @param body The studio body.
 * @param own The world turn of each bone that has a turn of its own.
 * @returns The pose.
 */
function chainPose(body: StudioBody, own: ReadonlyMap<StudioBone, Quat>): ChainPose {
  const pose = createStudioPose();
  const heads: Partial<Record<StudioBone, Vec3>> = { ...body.heads };
  const turns = new Map<StudioBone, Quaternion>();
  for (const bone of STUDIO_BONES) {
    const parent = STUDIO_PARENTS[bone];
    const parentTurn = parent ? turns.get(parent) : undefined;
    const quat = own.get(bone);
    const turn = quat ? new Quaternion(...quat) : parentTurn?.clone();
    const place = body.heads[bone];
    if (!turn || !place) {
      continue;
    }
    const from = new Vector3(...place);
    const to =
      parent && parentTurn
        ? from
            .clone()
            .sub(new Vector3(...(body.heads[parent] ?? [0, 0, 0])))
            .applyQuaternion(parentTurn)
            .add(new Vector3(...(heads[parent] ?? [0, 0, 0])))
        : from.clone();
    turns.set(bone, turn);
    heads[bone] = toVec3(to);
    writeMatrix(pose.matrices, STUDIO_BONES.indexOf(bone), turn, from, to);
  }
  return { matrices: pose.matrices.slice(0, STUDIO_BONES.length * 16), heads, turns };
}

/**
 * Solves the arm corrective shapes of a standing body again (`StudioStanding.armTurns`): the move
 * of each vertex of an arm shape in the standing bind pose that the arms of the pose of the sheet
 * take to the one blend of the clip of the sheet. That blend is the seated bind with all corrective
 * shapes, except the shapes of a raised arm or of a bent wrist, and the world turns of the standing
 * pose and of the arms of the sheet. The vertex blends the moves of its bones from the standing
 * bind to the sheet, and the solve inverts that blend, as `correctives()` of
 * `tools/blender/rig_mesh.py` does for the seated bind. Each move splits into the left and the
 * right shape as the shapes of the export split it. Each shape of a raised arm or of a bent wrist
 * turns with the blend of the standing turns of its vertex.
 *
 * @param body The seated studio body.
 * @param mesh The unpacked mesh of the body.
 * @param own The world turn of each bone with a turn of its own in the standing pose.
 * @param stand The standing pose.
 * @param standing The skin of the standing pose with the leg shapes, before its lift.
 * @param arms The world turn of each arm bone in the pose of the sheet.
 * @returns The arm corrective shapes of the standing body.
 */
function standingArmCorrectives(
  body: StudioBody,
  mesh: StudioMesh,
  own: ReadonlyMap<StudioBone, Quat>,
  stand: ChainPose,
  standing: Float32Array,
  arms: Readonly<Record<StudioArmBone, Quat>>,
): Float32Array[] {
  const sheetTurns = new Map(own);
  for (const bone of STUDIO_ARM_BONES) {
    sheetTurns.set(bone, arms[bone]);
  }
  const sheet = chainPose(body, sheetTurns);
  const all = new Float32Array(mesh.correctives.length).fill(1);
  all.fill(0, RAISED, armCorrectives(body));
  const target = skinStudioMesh(mesh, { matrices: sheet.matrices, correctives: all });

  // The move of each bone from the standing bind to the sheet, and the turn of each bone from the
  // seated bind to the standing bind.
  const second = STUDIO_BONES.map((_, b) =>
    new Matrix4()
      .fromArray(sheet.matrices, b * 16)
      .multiply(new Matrix4().fromArray(stand.matrices, b * 16).invert()),
  );
  const first = STUDIO_BONES.map((_, b) => new Matrix4().fromArray(stand.matrices, b * 16));

  const moves = mesh.correctives.slice(0, armCorrectives(body)).map((part) => part.slice());
  const [left, right, ...raised] = moves;
  if (!left || !right) {
    return moves;
  }
  const blend = new Matrix4();
  const part = new Matrix4();
  const move = new Vector3();
  const total = new Vector3();
  const leftMove = new Vector3();
  const raise = new Vector3();
  for (let v = 0; v < standing.length / 3; v++) {
    const at = v * 3;
    total.set(
      (left[at] ?? 0) + (right[at] ?? 0),
      (left[at + 1] ?? 0) + (right[at + 1] ?? 0),
      (left[at + 2] ?? 0) + (right[at + 2] ?? 0),
    );
    let turn: Matrix3 | null = null;
    for (const extra of raised) {
      raise.fromArray(extra, at);
      if (raise.lengthSq() > 0) {
        turn ??= new Matrix3().setFromMatrix4(blended(mesh, v, first, blend, part));
        raise.applyMatrix3(turn).toArray(extra, at);
      }
    }
    if (total.lengthSq() === 0) {
      continue;
    }
    // d = A⁻¹ (target − b) − p, with the blend A p + b of the moves of the bones of the vertex.
    blended(mesh, v, second, blend, part);
    move
      .fromArray(target, at)
      .sub(new Vector3().setFromMatrixPosition(blend))
      .applyMatrix3(new Matrix3().setFromMatrix4(blend).invert())
      .sub(new Vector3().fromArray(standing, at));
    const share = Math.min(
      1,
      Math.max(0, leftMove.fromArray(left, at).dot(total) / total.lengthSq()),
    );
    move.clone().multiplyScalar(share).toArray(left, at);
    move.multiplyScalar(1 - share).toArray(right, at);
  }
  return moves;
}

/**
 * Writes the blend of the matrices of the bones of a vertex by its weights.
 *
 * @param mesh The skin of the mesh.
 * @param v The index of the vertex.
 * @param matrices The matrix of each bone, in the order of `STUDIO_BONES`.
 * @param out The matrix to write.
 * @param part A scratch matrix.
 * @returns `out`.
 */
function blended(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  v: number,
  matrices: readonly Matrix4[],
  out: Matrix4,
  part: Matrix4,
): Matrix4 {
  out.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = mesh.weights[v * 4 + k] ?? 0;
    const m = matrices[mesh.joints[v * 4 + k] ?? 0];
    if (w > 0 && m) {
      part.copy(m).multiplyScalar(w);
      for (let e = 0; e < 16; e++) {
        out.elements[e] = (out.elements[e] ?? 0) + (part.elements[e] ?? 0);
      }
    }
  }
  return out;
}

/**
 * Makes the standing body of a seated studio body that also stands, such as the violinist rabbit
 * as a soloist (design 4.4). The legs take the turns of the pose of the sheet, with the leg
 * corrective shapes of the studio at their full weight, and the body moves from its seat to stand
 * over the origin. A body with a reclined trunk also turns its trunk upright, and solves its arm
 * corrective shapes again ({@link StudioStanding.armTurns}). The bind places of the mesh, of the
 * bones, and of the points of the holds become the standing places, so that the rig poses the
 * standing body as it poses a body that the studio built standing.
 *
 * @param body The seated studio body, with its standing pose.
 * @param mesh The unpacked mesh of the body, with the leg corrective shapes after the arm shapes.
 * @returns The standing body and its mesh, with the arm corrective shapes only.
 * @throws Error if the body has no standing pose.
 */
export function standingBody(body: StudioBody, mesh: StudioMesh): PosedStudioBody {
  const standing = body.standing;
  if (!standing) {
    throw new Error('The studio body has no standing pose.');
  }

  const own = standingTurns(standing);
  const stand = chainPose(body, own);
  const weights = new Float32Array(mesh.correctives.length).fill(1, armCorrectives(body));
  const positions = skinStudioMesh(mesh, { matrices: stand.matrices, correctives: weights });
  const correctives = standing.armTurns
    ? standingArmCorrectives(body, mesh, own, stand, positions, standing.armTurns)
    : mesh.correctives.slice(0, armCorrectives(body));

  // The body stands with its lowest point, a sole, on the floor. The straight legs of the sheet
  // can put a heel a little below the seated soles, which the lift of the export puts on the floor.
  let low = Infinity;
  for (let v = 1; v < positions.length; v += 3) {
    low = Math.min(low, positions[v] ?? 0);
  }
  const lift = new Vector3(...standing.lift);
  lift.y = -low;
  moveAll(positions, lift);
  return {
    body: {
      ...body,
      ...stancePlaces(body, stand, lift),
      floor: [0, 0, 0],
      seatHeight: null,
      standing: null,
    },
    mesh: { ...mesh, positions, correctives },
  };
}

/**
 * Moves each point of a list of x, y, z by one move, in place.
 *
 * @param positions The points.
 * @param move The move.
 */
function moveAll(positions: Float32Array, move: Vector3): void {
  for (let v = 0; v < positions.length; v += 3) {
    positions[v] = (positions[v] ?? 0) + move.x;
    positions[v + 1] = (positions[v + 1] ?? 0) + move.y;
    positions[v + 2] = (positions[v + 2] ?? 0) + move.z;
  }
}

/**
 * Gives the places of a studio body in a new stance: the head of each bone in a chain pose, and the
 * points of the holds, which move with their bones: the head center and the nose with the head,
 * and each finger tip and palm with its fingers. Each place then takes one more move.
 *
 * @param body The studio body in its bind pose.
 * @param pose The chain pose of the stance.
 * @param lift The move of the body after the pose.
 * @returns The places of the stance.
 */
function stancePlaces(
  body: StudioBody,
  pose: ChainPose,
  lift: Vector3,
): Pick<StudioBody, 'heads' | 'palms' | 'fingerTips' | 'headCenter' | 'nose' | 'eyes'> {
  const lifted = (p: Vec3): Vec3 => toVec3(new Vector3(...p).add(lift));
  const moved = (bone: StudioBone, p: Vec3): Vec3 =>
    lifted(toVec3(new Vector3(...p).applyMatrix4(boneMatrix(pose, bone))));
  const turned = (bone: StudioBone, d: Vec3): Vec3 =>
    toVec3(new Vector3(...d).applyQuaternion(pose.turns.get(bone) ?? new Quaternion()));
  return {
    // SAFETY: the entries hold each bone of the body one time: each bone of STUDIO_BONES with a
    // head.
    heads: Object.fromEntries(
      STUDIO_BONES.flatMap((bone) => {
        const place = pose.heads[bone];
        return place ? [[bone, lifted(place)]] : [];
      }),
    ) as StudioHeads,
    palms: { L: turned('fingers_L', body.palms.L), R: turned('fingers_R', body.palms.R) },
    fingerTips: {
      L: moved('fingers_L', body.fingerTips.L),
      R: moved('fingers_R', body.fingerTips.R),
    },
    headCenter: moved('head', body.headCenter),
    nose: moved('head', body.nose),
    eyes: {
      ...body.eyes,
      directions: {
        L: turned('eye_L', body.eyes.directions.L),
        R: turned('eye_R', body.eyes.directions.R),
      },
    },
  };
}

/**
 * Gives the matrix of a bone of a chain pose.
 *
 * @param pose The pose.
 * @param bone The bone.
 * @returns The matrix.
 */
function boneMatrix(pose: ChainPose, bone: StudioBone): Matrix4 {
  return new Matrix4().fromArray(pose.matrices, STUDIO_BONES.indexOf(bone) * 16);
}

/**
 * Prepares a studio body to pose (design 4.4): unpacks its mesh, and finds the skeleton of the
 * player and the constants of the arms. A seated body that also stands gets its standing body
 * ({@link standingBody}) for a player that stands. Each other body keeps the stance of its role.
 *
 * @param seated The studio body, as the export wrote it.
 * @param stands True for a player that stands.
 * @returns The rig.
 */
export function studioRig(seated: StudioBody, stands = false): StudioRig {
  const unpacked = unpackStudioMesh(seated.mesh);
  const { body, mesh }: PosedStudioBody =
    stands && seated.standing
      ? standingBody(seated, unpacked)
      : {
          body: seated,
          mesh: { ...unpacked, correctives: unpacked.correctives.slice(0, armCorrectives(seated)) },
        };
  const twisted = body.upperTwist === undefined ? mesh : withUpperTwist(body, mesh);
  const h = body.heads;
  const unit = (from: Vec3, to: Vec3): Vector3 =>
    new Vector3(...to).sub(new Vector3(...from)).normalize();
  const arm = (side: Side): StudioArm => {
    const upper = unit(h[`upper_arm_${side}`], h[`forearm_${side}`]);
    const fore = unit(h[`forearm_${side}`], h[`hand_${side}`]);
    const twistAt =
      new Vector3(...h[`forearm_twist_${side}`]).distanceTo(new Vector3(...h[`forearm_${side}`])) /
      new Vector3(...h[`hand_${side}`]).distanceTo(new Vector3(...h[`forearm_${side}`]));
    const paw = alignFrames(
      unit(h[`hand_${side}`], h[`fingers_${side}`]),
      new Vector3(...body.palms[side]),
      new Vector3(...DOWN),
      new Vector3(...PALMS[side]),
      new Quaternion(),
    );
    // The bind forearm in the axes of the paw of the player: the angle of the turn of the paw
    // toward it, as `palmTurnAngle()` gives it, with the sign turned.
    const bindFore = fore.clone().applyQuaternion(paw);
    return {
      side,
      bones: {
        clavicle: STUDIO_BONES.indexOf(`clavicle_${side}`),
        upper: STUDIO_BONES.indexOf(`upper_arm_${side}`),
        fore: STUDIO_BONES.indexOf(`forearm_${side}`),
        twist: STUDIO_BONES.indexOf(`forearm_twist_${side}`),
        hand: STUDIO_BONES.indexOf(`hand_${side}`),
        fingers: STUDIO_BONES.indexOf(`fingers_${side}`),
      },
      drivers: {
        upper: boneIndex(`upperArm${side}`),
        fore: boneIndex(`forearm${side}`),
        hand: boneIndex(`hand${side}`),
        fingers: boneIndex(`fingers${side}`),
      },
      upper: toVec3(upper),
      fore: toVec3(fore),
      hinge: body.hinges?.[side] ?? toVec3(new Vector3().crossVectors(upper, fore).normalize()),
      twistAt,
      paw: [paw.x, paw.y, paw.z, paw.w],
      bindBend: -Math.atan2(-bindFore.z, -bindFore.y),
      curl: toVec3(
        new Vector3()
          .crossVectors(
            unit(h[`hand_${side}`], h[`fingers_${side}`]),
            new Vector3(...body.palms[side]),
          )
          .normalize(),
      ),
      sheet: body.sheetArms[side],
      segments: h[`elbow_${side}`]
        ? {
            upper: segmentIndices('upper_arm', side),
            fore: segmentIndices('forearm', side),
            elbow: STUDIO_BONES.indexOf(`elbow_${side}`),
            wrist: STUDIO_BONES.indexOf(`wrist_${side}`),
          }
        : null,
    };
  };
  return {
    body,
    mesh: twisted,
    positions: playerPositions(body),
    follows: skinFollows(),
    arms: { L: arm('L'), R: arm('R') },
  };
}

/**
 * Gives the indices of the segments of one arm part in `STUDIO_BONES`, from the joint at its start
 * out.
 *
 * @param part The arm part.
 * @param side The side of the arm.
 * @returns The indices.
 */
function segmentIndices(part: 'upper_arm' | 'forearm', side: Side): number[] {
  return Array.from({ length: ARM_SEGMENTS }, (_, k) => {
    const name = `${part}_seg${String(k)}_${side}`;
    return STUDIO_BONES.findIndex((bone) => bone === name);
  });
}

/**
 * Gives the share of the twist that the segment k of an arm part takes: the middle of the segment,
 * from 0 at the joint at the start of the part to 1 at the joint at its end (`segment_share()` of
 * `tools/blender/rig_mesh.py`).
 *
 * @param k The index of the segment from the start of the part.
 * @returns The share, from 0 to 1.
 */
function segmentShare(k: number): number {
  return (k + 0.5) / ARM_SEGMENTS;
}

/**
 * Gives the bone of the player that each skin joint of a studio body follows
 * ({@link StudioRig.follows}): the bone of {@link STUDIO_FOLLOWS} for each studio bone, and the
 * upper arm for the twist bone of each upper arm. Thus a vertex of the upper arm stays on the upper
 * arm for the readers of the bind mesh, such as the parts of the clearance sweep.
 *
 * @returns The bone of the player for each index of a skin joint, up to {@link STUDIO_POSE_BONES}.
 */
function skinFollows(): Uint8Array {
  const follows = new Uint8Array(STUDIO_POSE_BONES);
  for (const [k, bone] of STUDIO_BONES.entries()) {
    follows[k] = boneIndex(STUDIO_FOLLOWS[bone]);
  }
  follows[UPPER_TWIST_BONES.L] = boneIndex('upperArmL');
  follows[UPPER_TWIST_BONES.R] = boneIndex('upperArmR');
  return follows;
}

/**
 * Moves the weight of each upper arm near the shoulder to the twist bone of the upper arm
 * (`StudioBody.upperTwist`): the share of the twist bone falls from 1 to 0 over
 * {@link UPPER_TWIST_SPAN}. A vertex with four bones keeps its four largest weights.
 *
 * @param body The studio body.
 * @param mesh The unpacked mesh.
 * @returns The mesh with the new joints and weights.
 */
function withUpperTwist(body: StudioBody, mesh: StudioMesh): StudioMesh {
  const joints = mesh.joints.slice();
  const weights = mesh.weights.slice();
  const [from, to] = UPPER_TWIST_SPAN;
  const p = new Vector3();
  for (const side of ['L', 'R'] as const) {
    const upperBone = STUDIO_BONES.indexOf(`upper_arm_${side}`);
    const shoulderAt = new Vector3(...body.heads[`upper_arm_${side}`]);
    const axis = new Vector3(...body.heads[`forearm_${side}`]).sub(shoulderAt);
    const length = axis.length();
    axis.normalize();
    for (let v = 0; v < joints.length / 4; v++) {
      const k = [0, 1, 2, 3].find(
        (i) => joints[v * 4 + i] === upperBone && (weights[v * 4 + i] ?? 0) > 0,
      );
      if (k === undefined) {
        continue;
      }
      const along =
        p
          .fromArray(mesh.positions, v * 3)
          .sub(shoulderAt)
          .dot(axis) / length;
      const share = Math.min(1, Math.max(0, (to - along) / (to - from)));
      const w = weights[v * 4 + k] ?? 0;
      const skin: [number, number][] = [0, 1, 2, 3]
        .filter((i) => i !== k && (weights[v * 4 + i] ?? 0) > 0)
        .map((i) => [joints[v * 4 + i] ?? 0, weights[v * 4 + i] ?? 0]);
      skin.push([upperBone, w * (1 - share)], [UPPER_TWIST_BONES[side], w * share]);
      const kept = skin
        .filter(([, weight]) => weight > 0)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 4);
      const total = kept.reduce((sum, [, weight]) => sum + weight, 0);
      for (let i = 0; i < 4; i++) {
        const [bone = 0, weight = 0] = kept[i] ?? [];
        joints[v * 4 + i] = bone;
        weights[v * 4 + i] = weight / total;
      }
    }
  }
  return { ...mesh, joints, weights };
}

/** The world rotation of each bone of the player. Each call writes them before it reads them. */
const rotations = BONE_NAMES.map(() => new Quaternion());

/** The posed position of each bone of the player. Each call writes them before it reads them. */
const places = BONE_NAMES.map(() => new Vector3());

const local = new Quaternion();
const offset = new Vector3();
const bind = new Vector3();
const shoulder = new Vector3();
const elbow = new Vector3();
const wrist = new Vector3();
const upper = new Vector3();
const fore = new Vector3();
const hinge = new Vector3();
const upperBind = new Vector3();
const foreBind = new Vector3();
const hingeBind = new Vector3();
const upperTurn = new Quaternion();
const foreTurn = new Quaternion();
const handTurn = new Quaternion();
const fingersTurn = new Quaternion();
const palmTurn = new Quaternion();
const curlTurn = new Quaternion();
const curlAxis = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);
const twistTurn = new Quaternion();
const segmentTurn = new Quaternion();
const rollFrame = new Quaternion();
const rollTurn = new Quaternion();
const rollAxis = new Vector3();
const rollEnd = new Vector3();
const relative = new Quaternion();
const paw = new Quaternion();
const chestInverse = new Quaternion();
const head = new Vector3();
const matrix = new Matrix4();
const scaleY = new Matrix4();
const span = new Vector3();
const current = new Vector3();

/** The turn of an arm bone for {@link raiseWeight}. Each call writes it before it reads it. */
const raiseTurn: [number, number, number, number] = [0, 0, 0, 0];

/** The index of the `chest` bone of the player. */
const CHEST = boneIndex('chest');

/** The indices of the eye bones of the studio, and of the bones of the player that they follow. */
const EYE_BONES = [STUDIO_BONES.indexOf('eye_L'), STUDIO_BONES.indexOf('eye_R')] as const;

/** The names of the heads of the arm bones of each side in {@link StudioHeads}. */
const ARM_HEADS = {
  L: {
    upper: 'upper_arm_L',
    fore: 'forearm_L',
    twist: 'forearm_twist_L',
    hand: 'hand_L',
    fingers: 'fingers_L',
  },
  R: {
    upper: 'upper_arm_R',
    fore: 'forearm_R',
    twist: 'forearm_twist_R',
    hand: 'hand_R',
    fingers: 'fingers_R',
  },
} as const satisfies Record<Side, Record<string, keyof StudioHeads>>;

/**
 * Writes the matrix that moves a point from the bind pose to the pose: `T(head) R T(-bind)`.
 *
 * @param out The matrices.
 * @param index The bone index in the matrices.
 * @param turn The world rotation from the bind pose.
 * @param from The bind position of the bone.
 * @param to The posed position of the bone.
 */
function writeMatrix(
  out: Float32Array,
  index: number,
  turn: Quaternion,
  from: Vector3,
  to: Vector3,
): void {
  matrix.makeRotationFromQuaternion(turn);
  offset.copy(from).applyQuaternion(turn);
  matrix.setPosition(to.x - offset.x, to.y - offset.y, to.z - offset.z);
  matrix.toArray(out, index * 16);
}

/**
 * Gives the turn of the twist bone of an upper arm (`StudioBody.upperTwist`): the turn of the upper
 * arm, less the rest of its roll from the chest. The frame with no roll is the chest swung onto the
 * upper arm.
 *
 * @param armTurn The world turn of the upper arm from the bind pose.
 * @param chestTurn The world turn of the chest from the bind pose.
 * @param armBind The unit direction of the upper arm in the bind pose.
 * @param share The share of the roll that the twist bone takes, from 0 to 1.
 * @param out The quaternion to write.
 * @returns `out`.
 */
export function upperTwistTurn(
  armTurn: Quaternion,
  chestTurn: Quaternion,
  armBind: Vector3,
  share: number,
  out: Quaternion,
): Quaternion {
  const roll = upperRoll(armTurn, chestTurn, armBind);
  return out.setFromAxisAngle(armBind, (share - 1) * roll).premultiply(armTurn);
}

/**
 * Gives the roll of an upper arm from the chest: the twist of the turn of the upper arm around its
 * bind axis, from the frame with no roll, which is the chest swung onto the upper arm.
 *
 * @param armTurn The world turn of the upper arm from the bind pose.
 * @param chestTurn The world turn of the chest from the bind pose.
 * @param armBind The unit direction of the upper arm in the bind pose.
 * @returns The roll, in radians, from -π to π.
 */
function upperRoll(armTurn: Quaternion, chestTurn: Quaternion, armBind: Vector3): number {
  rollAxis.copy(armBind).applyQuaternion(chestTurn);
  rollFrame.setFromUnitVectors(rollAxis, rollEnd.copy(armBind).applyQuaternion(armTurn));
  rollFrame.multiply(chestTurn).invert().multiply(armTurn);
  return twistAngle(rollFrame, armBind);
}

/**
 * Calculates the bones of a studio body from a pose of the player (design 4.4, 5.1): the
 * retarget. Each bone of the trunk, the head, the legs, and the tail moves as its bone of the
 * player. Each arm of the studio takes the posed shoulder, elbow, and wrist of the player: the
 * upper arm and the forearm turn with the elbow axis of the studio onto the plane of the arm, so
 * that the elbow bends as the studio built it. The paw takes the rotation of the hand of the
 * player, turned in the plane of its palm toward the forearm by up to {@link PAW_TURN} (the right
 * paw only toward the baton, and then past it by the share of its bind bend that the pose keeps,
 * `pawKeepR`), or by the turn of the pose for the left paw (`pawTurnL`), and the
 * forearm twist bone takes {@link TWIST_SHARE} of the twist
 * from the forearm to the paw. The fingers of the studio curl around their own axis by the curl
 * of the fingers of the player. The arm-down shape of each arm takes its weight from the
 * direction of the upper arm between the bind pose of the studio and the pose of the sheet, as in
 * the studio. Each shape of a raised arm takes its weight from the turn of its upper arm, each
 * shape of a bent elbow from the turn of its forearm from the upper arm, and each shape of a bent
 * wrist from the turn of its paw from the forearm ({@link raiseWeight}). The eyes
 * scale on y for a blink. The bones of the player follow, for the instrument, with the offsets of
 * the instrument and of the slide, as the scene moves them (design 5.1).
 *
 * @param rig The studio rig.
 * @param skeleton The skeleton of the player, with the positions of {@link StudioRig.positions}.
 * @param pose The local rotations of the bones of the player, four numbers for each bone.
 * @param offsets The offsets of the root, the instrument, and the slide.
 * @param eyeScale The scale of the eyes on y: 1 is open.
 * @param out The pose to write.
 * @returns `out`.
 */
export function poseStudioBones(
  rig: StudioRig,
  skeleton: Skeleton,
  pose: Float32Array,
  offsets: BoneOffsets,
  eyeScale: number,
  out: StudioPose,
): StudioPose {
  const studioCount = STUDIO_BONES.length;
  for (let i = 0; i < places.length; i++) {
    const place = places[i] ?? offset;
    const rotation = rotations[i] ?? local;
    local.fromArray(pose, i * 4);
    place.fromArray(skeleton.positions[i] ?? [0, 0, 0]);
    const parentIndex = skeleton.parents[i] ?? -1;
    const parent = rotations[parentIndex];
    const parentPlace = places[parentIndex];
    if (!parent || !parentPlace || parentIndex >= i) {
      rotation.copy(local);
      place.add(offset.fromArray(offsets.root));
    } else {
      place.sub(offset.fromArray(skeleton.positions[parentIndex] ?? [0, 0, 0]));
      if (i === INSTRUMENT || i === SLIDE) {
        place.add(offset.fromArray(i === INSTRUMENT ? offsets.instrument : offsets.slide));
      }
      place.applyQuaternion(parent).add(parentPlace);
      rotation.multiplyQuaternions(parent, local);
    }
    writeMatrix(
      out.matrices,
      studioCount + i,
      rotation,
      bind.fromArray(skeleton.positions[i] ?? [0, 0, 0]),
      place,
    );
  }

  // The rigid bones of the studio move as their bones of the player.
  for (let s = 0; s < studioCount; s++) {
    out.matrices.copyWithin(
      s * 16,
      (studioCount + (rig.follows[s] ?? 0)) * 16,
      (studioCount + (rig.follows[s] ?? 0) + 1) * 16,
    );
  }
  for (const s of EYE_BONES) {
    const a = rig.follows[s] ?? 0;
    // T(place) R S T(-bind): the eye scales on y around its bone.
    scaleY.makeScale(1, eyeScale, 1);
    matrix.makeRotationFromQuaternion(rotations[a] ?? new Quaternion()).multiply(scaleY);
    bind.fromArray(skeleton.positions[a] ?? [0, 0, 0]).applyMatrix4(matrix);
    const p = places[a] ?? new Vector3();
    matrix.setPosition(p.x - bind.x, p.y - bind.y, p.z - bind.z);
    matrix.toArray(out.matrices, s * 16);
  }

  chestInverse.copy(rotations[CHEST] ?? local).invert();
  const raises = rig.body.raises ?? [];
  out.correctives.fill(0, RAISED);
  for (let side = 0; side < 2; side++) {
    const arm = side === 0 ? rig.arms.L : rig.arms.R;
    poseArm(rig, arm, pose, offsets, out);
    // The corrective weight: the place of the upper arm on the way from the bind pose of the
    // studio to the pose of the sheet, in the axes of the chest.
    current.copy(upper).applyQuaternion(chestInverse);
    span.fromArray(arm.sheet).sub(upperBind.fromArray(arm.upper));
    const weight = current.sub(upperBind).dot(span) / span.lengthSq();
    out.correctives[arm.side === 'L' ? 0 : 1] = Math.min(1, Math.max(0, weight));
    for (let k = 0; k < raises.length; k++) {
      const raise = raises[k];
      if (!raise || raise.side !== arm.side) {
        continue;
      }
      // The shape of a bent wrist reads the turn of the paw from the forearm, the shape of a bent
      // elbow the turn of the forearm from the upper arm, and the shape of a raised arm the turn
      // of the upper arm in the axes of the chest.
      if (raise.bone === 'hand') {
        relative.copy(foreTurn).invert().multiply(handTurn);
      } else if (raise.bone === 'forearm') {
        relative.copy(upperTurn).invert().multiply(foreTurn);
      } else {
        relative.copy(chestInverse).multiply(upperTurn);
      }
      raiseTurn[0] = relative.x;
      raiseTurn[1] = relative.y;
      raiseTurn[2] = relative.z;
      raiseTurn[3] = relative.w;
      out.correctives[RAISED + k] = raiseWeight(raise, raiseTurn);
    }
  }
  return out;
}

/**
 * Gives the weight of the corrective shape of a raised arm from the turn of its upper arm (design
 * 4.4): 1 while the turn is at most the first angle of the fade from the turn of the shape, 0
 * from the second angle, and a smooth step between them. The angle of a turn is the angle of the
 * rotation from one turn to the other, so a quaternion and its negative give one weight.
 *
 * @param raise The pose of the shape.
 * @param turn The world turn of the upper arm from the bind pose, in the axes of the chest.
 * @returns The weight, from 0 to 1.
 */
export function raiseWeight(raise: StudioRaise, turn: Quat): number {
  const [x, y, z, w] = raise.turn;
  const dot = Math.abs(x * turn[0] + y * turn[1] + z * turn[2] + w * turn[3]);
  const angle = 2 * Math.acos(Math.min(1, dot));
  const [full, none] = raise.fade;
  const t = Math.min(1, Math.max(0, (none - angle) / (none - full)));
  return t * t * (3 - 2 * t);
}

const palmFore = new Vector3();
const palmHand = new Quaternion();

/**
 * Gives the turn of a paw in the plane of its palm toward the forearm ({@link PAW_TURN}, design
 * 4.4): the angle of the forearm in the plane of the palm, faded where the forearm comes near the
 * palm normal and near the back of the palm, and limited to `PAW_TURN.max`. The right paw turns
 * only toward the baton. The pose of a carried violin uses it too, so that the instrument hangs
 * from the paw that the viewer sees (`carryLift()` of `pose/bowed.ts`).
 *
 * @param side The side of the arm.
 * @param hand The world rotation of the hand of the player. Its x axis is the normal of its palm.
 * @param forearm The unit direction of the forearm, from the elbow to the wrist.
 * @returns The angle of the turn around the x axis of the hand, in radians.
 */
export function palmTurnAngle(side: Side, hand: Quaternion, forearm: Vector3): number {
  palmFore.copy(forearm).applyQuaternion(palmHand.copy(hand).invert());
  const inPlane = Math.hypot(palmFore.y, palmFore.z);
  const [low, high] = PAW_TURN.fade;
  const fade = Math.min(1, Math.max(0, (inPlane - low) / (high - low)));
  const planeAngle = Math.atan2(-palmFore.z, -palmFore.y);
  // Near π, the angle jumps to the other side, so the turn fades out there.
  const back = Math.min(
    1,
    Math.max(0, (Math.PI - Math.abs(planeAngle)) / (Math.PI - PAW_TURN.back)),
  );
  const angle = planeAngle * fade * fade * (3 - 2 * fade);
  const limited =
    Math.min(PAW_TURN.max, Math.max(-PAW_TURN.max, angle)) * back * back * (3 - 2 * back);
  return side === 'R' ? Math.max(0, limited) : limited;
}

/** The bind of the paw of one studio arm that the twist of the paw counts from. */
export type PawBind = Pick<StudioArm, 'fore' | 'hinge' | 'paw'>;

const twistUpper = new Vector3();
const twistFore = new Vector3();
const twistHinge = new Vector3();
const twistForeBind = new Vector3();
const twistHingeBind = new Vector3();
const twistFrame = new Quaternion();
const twistHand = new Quaternion();
const twistPaw = new Quaternion();

/**
 * Gives the twist of a paw of a studio arm on its forearm from the bind of the studio, as the
 * twist bone of the arm takes it (design 4.4, 5.2). A pose that moves a paw through a large turn
 * reads it, so that the twist stays between -π and π on the way and the twist bone does not turn
 * over.
 *
 * @param pawBind The bind of the paw of the arm ({@link StudioRig.arms}).
 * @param shoulderAt The posed shoulder joint.
 * @param elbowAt The posed elbow joint.
 * @param wristAt The posed wrist joint.
 * @param hand The world rotation of the hand of the player.
 * @param turn The turn of the paw in the plane of its palm, in radians ({@link palmTurnAngle}).
 * @returns The twist, from -π to π.
 */
export function studioPawTwist(
  pawBind: PawBind,
  shoulderAt: Vector3,
  elbowAt: Vector3,
  wristAt: Vector3,
  hand: Quaternion,
  turn: number,
): number {
  twistUpper.subVectors(elbowAt, shoulderAt).normalize();
  twistFore.subVectors(wristAt, elbowAt).normalize();
  twistHinge.crossVectors(twistUpper, twistFore);
  if (twistHinge.lengthSq() < 1e-8) {
    twistHinge.set(1, 0, 0);
  }
  twistForeBind.fromArray(pawBind.fore);
  alignFrames(
    twistForeBind,
    twistHingeBind.fromArray(pawBind.hinge),
    twistFore,
    twistHinge,
    twistFrame,
  );
  twistHand
    .copy(hand)
    .multiply(twistPaw.setFromAxisAngle(X_AXIS, turn))
    .multiply(twistPaw.fromArray(pawBind.paw));
  return twistAngle(twistFrame.invert().multiply(twistHand), twistForeBind);
}

/**
 * Writes the bones of one arm of a studio body: the upper arm, the forearm, the twist bone, the
 * paw, and the fingers. It leaves the module vector `upper` at the posed direction of the upper
 * arm.
 *
 * @param rig The studio rig.
 * @param arm The arm.
 * @param pose The local rotations of the bones of the player.
 * @param offsets The offsets of the pose: the turn of the left paw in the plane of its palm, and
 *   the share of its bind bend that the right paw keeps.
 * @param out The pose to write.
 */
function poseArm(
  rig: StudioRig,
  arm: StudioArm,
  pose: Float32Array,
  offsets: BoneOffsets,
  out: StudioPose,
): void {
  const h = rig.body.heads;
  shoulder.copy(places[arm.drivers.upper] ?? shoulder);
  elbow.copy(places[arm.drivers.fore] ?? elbow);
  wrist.copy(places[arm.drivers.hand] ?? wrist);
  upper.subVectors(elbow, shoulder).normalize();
  fore.subVectors(wrist, elbow).normalize();
  hinge.crossVectors(upper, fore);
  if (hinge.lengthSq() < 1e-8) {
    // A straight arm has no plane: the elbow axis of the player, +x in its bind pose, turns
    // with the upper arm of the player.
    hinge.set(1, 0, 0).applyQuaternion(rotations[arm.drivers.upper] ?? local);
  }
  upperBind.fromArray(arm.upper);
  foreBind.fromArray(arm.fore);
  hingeBind.fromArray(arm.hinge);
  alignFrames(upperBind, hingeBind, upper, hinge, upperTurn);
  alignFrames(foreBind, hingeBind, fore, hinge, foreTurn);

  // The paw turns in the plane of its palm toward the forearm, or by the turn of the pose. The
  // right paw keeps the share of the pose of its bind bend.
  const hand = rotations[arm.drivers.hand] ?? local;
  const ownTurn = arm.side === 'L' ? offsets.pawTurnL : null;
  const kept = arm.side === 'R' ? offsets.pawKeepR * arm.bindBend : 0;
  palmTurn.setFromAxisAngle(X_AXIS, ownTurn ?? palmTurnAngle(arm.side, hand, fore) + kept);
  paw.fromArray(arm.paw);
  handTurn.copy(hand).multiply(palmTurn).multiply(paw);

  // The fingers of the player curl around the z axis of the hand. The fingers of the studio take
  // the same angle around their own axis.
  const curlLocal = relative.fromArray(pose, arm.drivers.fingers * 4);
  const curl = 2 * Math.atan2(curlLocal.z, curlLocal.w) * (arm.side === 'L' ? 1 : -1);
  curlTurn.setFromAxisAngle(curlAxis.fromArray(arm.curl), curl);
  fingersTurn.copy(handTurn).multiply(curlTurn);
  relative.copy(foreTurn).invert().multiply(handTurn);
  const twist = twistAngle(relative, foreBind);
  twistTurn.setFromAxisAngle(foreBind, TWIST_SHARE * twist).premultiply(foreTurn);

  const side = arm.side;
  const keys = ARM_HEADS[side];
  writeMatrix(out.matrices, arm.bones.upper, upperTurn, bind.fromArray(h[keys.upper]), shoulder);
  const share = rig.body.upperTwist;
  if (share !== undefined) {
    upperTwistTurn(upperTurn, rotations[CHEST] ?? local, upperBind, share, rollTurn);
    writeMatrix(
      out.matrices,
      UPPER_TWIST_BONES[side],
      rollTurn,
      bind.fromArray(h[keys.upper]),
      shoulder,
    );
  }
  writeMatrix(out.matrices, arm.bones.fore, foreTurn, bind.fromArray(h[keys.fore]), elbow);
  head.copy(elbow).lerp(wrist, arm.twistAt);
  writeMatrix(out.matrices, arm.bones.twist, twistTurn, bind.fromArray(h[keys.twist]), head);
  writeMatrix(out.matrices, arm.bones.hand, handTurn, bind.fromArray(h[keys.hand]), wrist);
  // The fingers start at the knuckle of the turned paw.
  head
    .fromArray(h[keys.fingers])
    .sub(bind.fromArray(h[keys.hand]))
    .applyQuaternion(handTurn)
    .add(wrist);
  writeMatrix(out.matrices, arm.bones.fingers, fingersTurn, bind.fromArray(h[keys.fingers]), head);
  if (arm.segments) {
    poseSegments(rig, arm.segments, side, twist, out);
  }
}

/**
 * Writes the arm segments and the helpers of one arm (design 4.4, 4.7) from the turns of the arm
 * that {@link poseArm} leaves in the module values. Each segment of the upper arm takes its share
 * ({@link segmentShare}) of the roll of the upper arm from the chest, and each segment of the
 * forearm its share of the twist from the forearm to the paw. The elbow helper turns halfway from
 * the upper arm to the forearm, and the wrist helper halfway from the forearm with all of the
 * twist to the paw, as the helpers of the Rigify rabbit (`driven_turns()` of
 * `tools/blender/rig_mesh.py`). Each bone turns around the joint at its start.
 *
 * @param rig The studio rig.
 * @param segments The bones of the arm.
 * @param side The side of the arm.
 * @param twist The twist from the forearm to the paw around the bind axis of the forearm.
 * @param out The pose to write.
 */
function poseSegments(
  rig: StudioRig,
  segments: StudioArmSegments,
  side: Side,
  twist: number,
  out: StudioPose,
): void {
  const h = rig.body.heads;
  const keys = ARM_HEADS[side];
  const roll = upperRoll(upperTurn, rotations[CHEST] ?? local, upperBind);
  for (let k = 0; k < ARM_SEGMENTS; k++) {
    const share = segmentShare(k);
    segmentTurn.setFromAxisAngle(upperBind, (share - 1) * roll).premultiply(upperTurn);
    writeMatrix(
      out.matrices,
      segments.upper[k] ?? 0,
      segmentTurn,
      bind.fromArray(h[keys.upper]),
      shoulder,
    );
    segmentTurn.setFromAxisAngle(foreBind, share * twist).premultiply(foreTurn);
    writeMatrix(
      out.matrices,
      segments.fore[k] ?? 0,
      segmentTurn,
      bind.fromArray(h[keys.fore]),
      elbow,
    );
  }
  segmentTurn.copy(upperTurn).slerp(foreTurn, 0.5);
  writeMatrix(out.matrices, segments.elbow, segmentTurn, bind.fromArray(h[keys.fore]), elbow);
  segmentTurn.setFromAxisAngle(foreBind, twist).premultiply(foreTurn).slerp(handTurn, 0.5);
  writeMatrix(out.matrices, segments.wrist, segmentTurn, bind.fromArray(h[keys.hand]), wrist);
}

/**
 * Moves the vertices of a studio mesh to a pose, as the GPU does (design 4.4): the corrective
 * shapes by their weights in the bind pose, then the blend of up to four bones.
 *
 * @param mesh The studio mesh.
 * @param pose The pose of the bones.
 * @param out The posed places, three numbers for each vertex. A new array by default.
 * @returns `out`.
 */
export function skinStudioMesh(
  mesh: StudioMesh,
  pose: StudioPose,
  out: Float32Array = new Float32Array(mesh.positions.length),
): Float32Array {
  const m = pose.matrices;
  const count = mesh.positions.length / 3;
  for (let v = 0; v < count; v++) {
    let x = mesh.positions[v * 3] ?? 0;
    let y = mesh.positions[v * 3 + 1] ?? 0;
    let z = mesh.positions[v * 3 + 2] ?? 0;
    for (const [c, corrective] of mesh.correctives.entries()) {
      const w = pose.correctives[c] ?? 0;
      x += w * (corrective[v * 3] ?? 0);
      y += w * (corrective[v * 3 + 1] ?? 0);
      z += w * (corrective[v * 3 + 2] ?? 0);
    }
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[v * 4 + k] ?? 0;
      if (w === 0) {
        continue;
      }
      const b = (mesh.joints[v * 4 + k] ?? 0) * 16;
      px += w * ((m[b] ?? 0) * x + (m[b + 4] ?? 0) * y + (m[b + 8] ?? 0) * z + (m[b + 12] ?? 0));
      py +=
        w * ((m[b + 1] ?? 0) * x + (m[b + 5] ?? 0) * y + (m[b + 9] ?? 0) * z + (m[b + 13] ?? 0));
      pz +=
        w * ((m[b + 2] ?? 0) * x + (m[b + 6] ?? 0) * y + (m[b + 10] ?? 0) * z + (m[b + 14] ?? 0));
    }
    out[v * 3] = px;
    out[v * 3 + 1] = py;
    out[v * 3 + 2] = pz;
  }
  return out;
}
