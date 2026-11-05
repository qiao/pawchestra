import type { EyeBend } from './eyes.ts';
import { FINISH_ORDER } from './mesh.ts';
import type { Finish } from './mesh.ts';
import { packCoordinate, PACKED_STEP } from './packed-mesh.ts';
import {
  byteReader,
  readByte,
  readVarint,
  toBase64,
  unzigzag,
  writeVarint,
  zigzag,
} from './packed-bytes.ts';
import type { ByteReader } from './packed-bytes.ts';
import type { Quat, Vec3 } from './tuples.ts';

/**
 * The number of deform segments of each upper arm and of each forearm of a body with arm segments
 * (`ARM_SEGMENTS` of `tools/blender/rig_mesh.py`).
 */
export const ARM_SEGMENTS = 4;

/**
 * The arm segments and the helpers of a mesh rig with `armSegments` (design 4.4, 4.7), the left
 * side first: for each side, {@link ARM_SEGMENTS} segments of the upper arm and of the forearm
 * from the shoulder out, then the elbow helper and the wrist helper. They hold the skin of the
 * arms, and the pose code turns them from the joints of the arm (`poseArm()` of
 * `models/studio-rig.ts`). The upper arm, the forearm, and the forearm twist bone of such a body
 * hold no vertex.
 */
export const ARM_SEGMENT_BONES = [
  'upper_arm_seg0_L',
  'upper_arm_seg1_L',
  'upper_arm_seg2_L',
  'upper_arm_seg3_L',
  'forearm_seg0_L',
  'forearm_seg1_L',
  'forearm_seg2_L',
  'forearm_seg3_L',
  'elbow_L',
  'wrist_L',
  'upper_arm_seg0_R',
  'upper_arm_seg1_R',
  'upper_arm_seg2_R',
  'upper_arm_seg3_R',
  'forearm_seg0_R',
  'forearm_seg1_R',
  'forearm_seg2_R',
  'forearm_seg3_R',
  'elbow_R',
  'wrist_R',
] as const;

/** An arm segment or a helper of a studio body. */
export type ArmSegmentBone = (typeof ARM_SEGMENT_BONES)[number];

/**
 * The bones of a studio body (design 4.4, 4.7): the 30 body bones of a rig of `pnpm rig-mesh`, in
 * parent order, the two eye bones that `pnpm studio-body` adds, so that the eyes blink (design
 * 5.1), and the optional bones ({@link OPTIONAL_STUDIO_BONES}): the tip of a tail of two bones,
 * the jaw of a beak, and the arm segments and helpers ({@link ARM_SEGMENT_BONES}). The optional
 * bones come last, so that the index of each other bone stays. The names keep the spelling of the
 * rig. The packed skin names each bone by its index in this list.
 */
export const STUDIO_BONES = [
  'root',
  'hips',
  'spine',
  'spine1',
  'chest',
  'neck',
  'head',
  'ear_L',
  'ear_R',
  'clavicle_L',
  'upper_arm_L',
  'forearm_L',
  'forearm_twist_L',
  'hand_L',
  'fingers_L',
  'clavicle_R',
  'upper_arm_R',
  'forearm_R',
  'forearm_twist_R',
  'hand_R',
  'fingers_R',
  'thigh_L',
  'shin_L',
  'foot_L',
  'toes_L',
  'thigh_R',
  'shin_R',
  'foot_R',
  'toes_R',
  'tail',
  'eye_L',
  'eye_R',
  'tail_tip',
  'jaw',
  ...ARM_SEGMENT_BONES,
] as const;

/** A bone of a studio body. */
export type StudioBone = (typeof STUDIO_BONES)[number];

/**
 * The bones that a studio body can lack: the tip of a tail of two bones, as the rig of the fox
 * mesh has, the jaw of a beak that opens, as the rig of the penguin mesh has, and the arm segments
 * and helpers, as the rig of the polar bear mesh has (design 4.4, 4.7). The `tail` bone then holds
 * the root of the tail, and the `jaw` bone the lower part of the beak, at the hinge of the beak. A
 * body with no tip, no jaw, or no arm segments, such as the bear or the rabbit, has no vertex on
 * them.
 */
export const OPTIONAL_STUDIO_BONES = ['tail_tip', 'jaw', ...ARM_SEGMENT_BONES] as const;

/** A bone that a studio body can lack. */
type OptionalStudioBone = (typeof OPTIONAL_STUDIO_BONES)[number];

/** A bone that each studio body has. */
export type RequiredStudioBone = Exclude<StudioBone, OptionalStudioBone>;

/** The head of each bone of a studio body: each bone except an optional bone has one. */
export type StudioHeads = Readonly<Record<RequiredStudioBone, Vec3>> &
  Readonly<Partial<Record<OptionalStudioBone, Vec3>>>;

/** The parent of each bone of a studio body: the hierarchy of a rig of `pnpm rig-mesh`. */
export const STUDIO_PARENTS = {
  root: null,
  hips: 'root',
  spine: 'hips',
  spine1: 'spine',
  chest: 'spine1',
  neck: 'chest',
  head: 'neck',
  ear_L: 'head',
  ear_R: 'head',
  clavicle_L: 'chest',
  upper_arm_L: 'clavicle_L',
  forearm_L: 'upper_arm_L',
  forearm_twist_L: 'forearm_L',
  hand_L: 'forearm_twist_L',
  fingers_L: 'hand_L',
  clavicle_R: 'chest',
  upper_arm_R: 'clavicle_R',
  forearm_R: 'upper_arm_R',
  forearm_twist_R: 'forearm_R',
  hand_R: 'forearm_twist_R',
  fingers_R: 'hand_R',
  thigh_L: 'hips',
  shin_L: 'thigh_L',
  foot_L: 'shin_L',
  toes_L: 'foot_L',
  thigh_R: 'hips',
  shin_R: 'thigh_R',
  foot_R: 'shin_R',
  toes_R: 'foot_R',
  tail: 'hips',
  eye_L: 'head',
  eye_R: 'head',
  tail_tip: 'tail',
  jaw: 'head',
  upper_arm_seg0_L: 'upper_arm_L',
  upper_arm_seg1_L: 'upper_arm_L',
  upper_arm_seg2_L: 'upper_arm_L',
  upper_arm_seg3_L: 'upper_arm_L',
  forearm_seg0_L: 'forearm_L',
  forearm_seg1_L: 'forearm_L',
  forearm_seg2_L: 'forearm_L',
  forearm_seg3_L: 'forearm_L',
  elbow_L: 'upper_arm_L',
  wrist_L: 'forearm_twist_L',
  upper_arm_seg0_R: 'upper_arm_R',
  upper_arm_seg1_R: 'upper_arm_R',
  upper_arm_seg2_R: 'upper_arm_R',
  upper_arm_seg3_R: 'upper_arm_R',
  forearm_seg0_R: 'forearm_R',
  forearm_seg1_R: 'forearm_R',
  forearm_seg2_R: 'forearm_R',
  forearm_seg3_R: 'forearm_R',
  elbow_R: 'upper_arm_R',
  wrist_R: 'forearm_twist_R',
} as const satisfies Readonly<Record<StudioBone, StudioBone | null>>;

/** A side of the body: the left side of the animal is at -x (design 4.4). */
export type Side = 'L' | 'R';

/** The leg bones of a studio body, which turn when a seated body stands (design 4.4). */
export const STUDIO_LEG_BONES = [
  'thigh_L',
  'shin_L',
  'foot_L',
  'toes_L',
  'thigh_R',
  'shin_R',
  'foot_R',
  'toes_R',
] as const;

/** A leg bone of a studio body. */
type StudioLegBone = (typeof STUDIO_LEG_BONES)[number];

/**
 * The bones of a tail of two bones, which turn when a seated body with such a tail stands (design
 * 4.4): the seated tail goes back through the open back of the chair, and the standing tail hangs.
 */
export const STUDIO_TAIL_BONES = ['tail', 'tail_tip'] as const;

/** A bone of a tail of two bones. */
type StudioTailBone = (typeof STUDIO_TAIL_BONES)[number];

/**
 * The trunk bones of a studio body, which turn when a seated body with a reclined trunk stands
 * (design 4.4): the rig of a mesh reclines the trunk on the seat (`studio.trunk` of
 * `pnpm rig-mesh`), and the standing trunk is upright again.
 */
export const STUDIO_TRUNK_BONES = ['hips', 'spine', 'spine1', 'chest', 'neck', 'head'] as const;

/** A trunk bone of a studio body. */
type StudioTrunkBone = (typeof STUDIO_TRUNK_BONES)[number];

/**
 * The arm bones of a studio body, from the clavicle out, the left side first. The standing pose of
 * a seated body with a reclined trunk keeps the turn of each one in the pose of the sheet
 * ({@link StudioStanding.armTurns}).
 */
export const STUDIO_ARM_BONES = [
  'clavicle_L',
  'upper_arm_L',
  'forearm_L',
  'forearm_twist_L',
  'hand_L',
  'fingers_L',
  'clavicle_R',
  'upper_arm_R',
  'forearm_R',
  'forearm_twist_R',
  'hand_R',
  'fingers_R',
] as const;

/** An arm bone of a studio body. */
export type StudioArmBone = (typeof STUDIO_ARM_BONES)[number];

/**
 * The standing pose of a seated studio body that also stands, such as the violinist rabbit as a
 * soloist (design 4.4): the legs of the pose of the sheet, with the leg corrective shapes of the
 * studio at their full weight.
 */
export interface StudioStanding {
  /**
   * The move of the body from its seated place over the seat to its standing place. The app
   * takes its height from the standing skin: the lowest point, a sole, goes onto the floor.
   */
  readonly lift: Vec3;
  /** The world turn of each leg bone from the bind pose to the pose of the sheet. */
  readonly turns: Readonly<Record<StudioLegBone, Quat>>;
  /**
   * The world turn of each tail bone from the bind pose to the pose of the sheet, for a body with
   * a tail of two bones. A body with one tail bone keeps the tail of its bind pose.
   */
  readonly tailTurns?: Readonly<Record<StudioTailBone, Quat>>;
  /**
   * The world turn of each trunk bone from the bind pose to the pose of the sheet, for a body
   * whose rig reclines the trunk on the seat, and of the tail of a body with one tail bone. The
   * export adds the move of the hips to the {@link StudioStanding.lift}. Each bone with no turn of
   * its own, such as an arm or an ear, turns with its parent.
   */
  readonly trunkTurns?: Readonly<Partial<Record<StudioTrunkBone | 'tail', Quat>>>;
  /**
   * The world turn of each arm bone from the bind pose to the pose of the sheet, for a body whose
   * rig reclines the trunk on the seat. The standing body turns its trunk upright, and a pose then
   * turns its arms: two blends of the skin in a row, which miss the one blend of the clip of the
   * sheet at a vertex with the weights of an arm bone and of trunk bones with other turns. The
   * standing body solves its arm corrective shapes again with these turns
   * (`standingBody()` of `models/studio-rig.ts`), so that the arms of the sheet give the source.
   */
  readonly armTurns?: Readonly<Record<StudioArmBone, Quat>>;
}

/**
 * The seated pose of a standing studio body that also sits, such as the conductor bear in a
 * seated role (design 4.4): the legs of a seated bind, with the sit corrective shapes of the rig
 * at their full weight. It is the mirror of {@link StudioStanding}.
 */
export interface StudioSitting {
  /**
   * The move of the body from its standing place to its place over the seat: the soles on the
   * floor, and the front edge of the seat of the rig at the front edge of the seat of the app.
   */
  readonly drop: Vec3;
  /** The world turn of each leg bone from the bind pose to the seated pose. */
  readonly turns: Readonly<Record<StudioLegBone, Quat>>;
  /** The height of the seat top: {@link StudioBody.seatHeight} of the seated body. */
  readonly seatHeight: number;
  /** The depth of the chair: {@link StudioBody.chairDepth} of the seated body. */
  readonly chairDepth: number;
}

/**
 * The names of the other palettes of a studio body (design 4.4, 4.5): the tan palette of the fox
 * mesh, which the tan foxes of the flutes take. The red foxes keep the palette of the mesh.
 */
const STUDIO_PALETTES = ['tan'] as const;

/** The name of another palette of a studio body. */
export type StudioPalette = (typeof STUDIO_PALETTES)[number];

/**
 * The largest number of corrective shapes of a raised arm or of a bent wrist of one studio body
 * ({@link StudioBody.raises}, `RAISE_LIMIT` of `tools/blender/rig_mesh.py`).
 */
export const STUDIO_RAISES = 4;

/**
 * The pose of a corrective shape of a raised arm of a mesh rig (design 4.4, `raise` of the config
 * of `pnpm rig-mesh`). The shape relaxes the faces that the skin turns over near that pose, such as
 * the front of the right shoulder of the red fox, whose bow arm is out to the side and down. Its
 * weight comes from the turn of the upper arm alone (`raiseWeight()` of `models/studio-rig.ts`).
 * The shape of a bent elbow takes its weight from the turn of the forearm from the upper arm, as
 * the right elbow of the cat, which stays near one bend in the bow strokes. The shape of a bent
 * wrist takes its weight from the turn of the paw from the forearm, as the left wrist of the cat,
 * whose paw stays near one turn on the fingerboard. A body can have up to {@link STUDIO_RAISES}
 * such shapes, and each one takes its weight from its own turn.
 */
export interface StudioRaise {
  /** The arm of the shape. */
  readonly side: Side;
  /**
   * The bone whose turn gives the weight: `forearm` for the forearm, whose turn from the upper arm
   * gives the weight of the shape of a bent elbow, and `hand` for the paw, whose turn from the
   * forearm gives the weight of the shape of a bent wrist. The upper arm when it is not given.
   */
  readonly bone?: 'forearm' | 'hand';
  /**
   * The turn at which the shape has its full weight: the world turn of the upper arm from the bind
   * pose, in the axes of the chest. For the forearm, it is the world turn of the forearm from the
   * bind pose after the inverse of the world turn of the upper arm. For the paw, it is the world
   * turn of the paw from the bind pose after the inverse of the world turn of the forearm.
   */
  readonly turn: Quat;
  /**
   * The angles of the turn of the bone from {@link StudioRaise.turn}, in radians: the shape has
   * its full weight up to the first angle and no weight from the second angle.
   */
  readonly fade: readonly [full: number, none: number];
}

/**
 * The pea eyes of a studio body (design 4.4, 4.5): the eyes of the parametric bodies (`addEye()` of
 * `models/eyes.ts`), which replace the eyes of the mesh. Each eye lies at the bind place of its eye
 * bone and faces out from the middle of the head, as an eye on the round head of a parametric body
 * does. Each oval bends to the form of the head surface under it, so that its rim lies at the fur,
 * as the rim of an eye on a flat face of a parametric head does, and its bone lies on the head
 * surface. Each bone moves further out when the head still covers the front of the eye
 * (`eyePush()` of `tools/studio-body.ts`). A hand rig gives the place, the direction, and the size
 * of each eye with the eye objects of its `.blend` (`eyesOf()` of `tools/studio-body.ts`).
 */
export interface StudioEyes {
  /**
   * The head height that sizes the eyes, in meters: the head that shows, from the chin to the top
   * of the skull, times the eye size of the animal (`eyeSize` of `ANIMALS` in
   * `tools/studio-body.ts`), or the size of the eye objects of a hand rig. It is larger than
   * {@link StudioBody.headHeight} when the rig grows the head (`headFactor` of `pnpm rig-mesh`), so
   * that the eyes fit the larger head.
   */
  readonly headHeight: number;
  /**
   * The unit direction in which each eye faces, in the bind pose: from the middle of the box of the
   * head that shows through the eye, or the Z axis of the eye object of a hand rig. The head
   * surface under the eye of the bear faces 29° up, so an eye along the normal of the surface shows
   * less of its front in the front view.
   */
  readonly directions: Readonly<Record<Side, Vec3>>;
  /**
   * The bend of each oval along its direction: a fit of the heights of the head surface over the
   * oval, from the plane of the eye (`eyeBend()` of `tools/studio-body.ts`). Thus a direction that
   * differs from the normal of the surface, or a curved cheek, moves no edge of the oval out of the
   * fur. A body with no bends keeps flat ovals with the light of a parametric eye.
   */
  readonly bends?: Readonly<Record<Side, EyeBend>>;
}

/**
 * A studio body (design 4.4): the mesh of a rig of `pnpm rig-mesh` in its bind pose, with its own
 * skeleton, its skin of up to four bones for each vertex, and its corrective shapes.
 * `pnpm studio-body <animal>` writes the module of an animal. The axes are the axes of the model:
 * the animal faces -z, its left side is -x, the soles are on y = 0, and the middle plane is
 * x = 0. The units are meters. A seated body has the bind pose of its seated role, with the legs
 * bent for the seat and the soles on the floor.
 */
export interface StudioBody {
  /** The GLB file, relative to the repository. */
  readonly source: string;
  /** The SHA-256 of the GLB file, as hex. */
  readonly sha256: string;
  /** The meters for each unit of the studio, which is the height of the animal. */
  readonly scale: number;
  /** The head of each bone in the bind pose of the mesh. */
  readonly heads: StudioHeads;
  /**
   * The unit normal of each palm in the bind pose: the side to which the fingers curl. It is the
   * z axis of the `hand` bone of the studio.
   */
  readonly palms: Readonly<Record<Side, Vec3>>;
  /** The end of each finger block: the farthest claw tip from the `fingers` bone. */
  readonly fingerTips: Readonly<Record<Side, Vec3>>;
  /**
   * The direction of each upper arm in the pose of the sheet, in the axes of the chest. The
   * corrective shape of each arm has its full weight in this pose, and the weight 0 in the bind
   * pose (`correctives()` of `tools/blender/rig_mesh.py`).
   */
  readonly sheetArms: Readonly<Record<Side, Vec3>>;
  /**
   * The head height `H` of the holds: from the chin to the top of the skull. When the rig grows
   * the head (`headFactor` of `pnpm rig-mesh`), `H` is the head height before the factor, so that
   * the holds in head heights keep their places.
   */
  readonly headHeight: number;
  /** The middle of the head. */
  readonly headCenter: Vec3;
  /** The tip of the nose. */
  readonly nose: Vec3;
  /** The pea eyes, at the eye bones `eye_L` and `eye_R` of {@link StudioBody.heads}. */
  readonly eyes: StudioEyes;
  /**
   * The point on the floor under the middle of the body: the origin of the studio. A seated body
   * sits in front of the center of its seat, so that the seat of the studio (a bench or a chair)
   * and the seat of the app have one front edge, and the floor instruments go with it.
   */
  readonly floor: Vec3;
  /**
   * The height of the top of a flat seat under a seated body: the lowest point of the body over
   * the seat of the app (the piano bench or the chair). It is `null` for a body that stands.
   */
  readonly seatHeight: number | null;
  /**
   * The depth of the chair under a body that sits on a chair: the depth of the chair of the
   * studio, so that the body sits on the whole seat. The back of the chair keeps a gap behind the
   * trunk. It is `null` for a body that stands or sits on a bench.
   */
  readonly chairDepth: number | null;
  /**
   * The width of the seat of the chair under a body that sits on a chair, in meters, when the
   * chair of design 4.5 is too narrow for its haunch (`seatWidth` of `ANIMALS` of
   * `tools/studio-body.ts`, or of the armature of a hand rig). A body with no width sits on the
   * chair of design 4.5.
   */
  readonly chairWidth?: number;
  /**
   * The depth of the piano bench under a body that sits on a bench, in meters: the bench reaches
   * from just behind the haunch to where the underside of the thighs leaves the seat top
   * (`benchFitOf()` of `tools/studio-body.ts`). A body with no depth sits on the bench of
   * `PIANO_BENCH`.
   */
  readonly benchDepth?: number;
  /**
   * The standing pose of a seated body that also stands. The packed mesh then holds the leg
   * corrective shapes after the arm corrective shapes. It is `null` for a body that keeps the
   * stance of its role.
   */
  readonly standing: StudioStanding | null;
  /**
   * The seated pose of a standing body that also sits. The packed mesh then holds the sit
   * corrective shapes after the arm corrective shapes. A body with no seated pose has none.
   */
  readonly sitting?: StudioSitting;
  /**
   * The poses of the corrective shapes of a raised arm or of a bent wrist, at most
   * {@link STUDIO_RAISES}. The packed mesh holds these shapes in this order after the two arm-down
   * shapes, before the leg shapes. A body with no such shape has none.
   */
  readonly raises?: readonly StudioRaise[];
  /**
   * The crease angle of the smooth normals of the fur, in degrees (design 4.5), from the settings
   * of the animal.
   */
  readonly crease: number;
  /**
   * The largest difference of two face colors of the fur that blend at a vertex, in each sRGB
   * channel from 0 to 1 (`studioCornerColors()`, design 4.5), from the settings of the animal. A
   * body with no value keeps one color for each face.
   */
  readonly colorBlend?: number;
  /**
   * The caps of the arms that the cut of a mesh rig makes (design 4.4), as indices of the
   * triangles of the packed mesh. With `cut.bodyNormals` of the config of the rig, they also hold
   * the caps of the body and the two faces at the top of each cut. Each corner of a cap takes the
   * normal of the skin at its vertex (`studioNormals()`). A body with no such rule has none.
   */
  readonly caps?: readonly number[];
  /**
   * The skin faces around the caps of the body of the cut of a mesh rig (`cut.bodyNormals` of the
   * config of the rig, design 4.4), as indices of the triangles of the packed mesh. Each corner
   * of a rim face takes the normal of the skin at its vertex with no crease angle
   * (`studioNormals()`). A body with no such rule has none.
   */
  readonly rim?: readonly number[];
  /** The packed mesh ({@link packStudioMesh}). */
  readonly mesh: string;
  /**
   * The other palettes of the faces of the mesh, by name ({@link packStudioPalette}). A species
   * selects one with its `palette` (`models/species.ts`). A body with one palette has none.
   */
  readonly palettes?: Readonly<Partial<Record<StudioPalette, string>>>;
  /**
   * The share of the roll of each upper arm that the skin at the shoulder takes (design 4.4): a
   * twist bone of the upper arm takes this share of the roll from the chest, and the weight of
   * the upper arm moves to the twist bone near the shoulder. Thus the roll spreads along the upper
   * arm, and the skin does not twist at the shoulder. A body with no share has no twist bone.
   */
  readonly upperTwist?: number;
  /**
   * The unit elbow axis of each arm in the bind pose of a body with straight bind arms (design
   * 4.4): the axis about which the app bends the elbow (`poseArm()` of `models/studio-rig.ts`). A
   * straight arm has no plane of its own. A body with no axes takes the axis of its bent bind arm:
   * the upper arm × the forearm.
   */
  readonly hinges?: Readonly<Record<Side, Vec3>>;
}

/** The largest number of bones of a vertex of a studio body. */
export const STUDIO_INFLUENCES = 4;

/** The steps of a packed weight from 0 to 1: one byte. */
const STUDIO_WEIGHT_STEPS = 255;

/** The step of a packed move of a corrective shape, in meters. */
export const CORRECTIVE_STEP = 1e-4;

/** The number of steps of a packed color channel from 0 to 1. */
export const COLOR_STEPS = 65535;

/** One vertex of a studio mesh for {@link packStudioMesh}. */
export interface StudioVertex {
  /** The place, in meters. */
  readonly position: Vec3;
  /** The bones, as indices in {@link STUDIO_BONES}, and their weights, which add up to 1. */
  readonly skin: readonly (readonly [bone: number, weight: number])[];
}

/** One triangle of a studio mesh for {@link packStudioMesh}. */
export interface StudioTriangle {
  /** The three vertices, counterclockwise from outside. */
  readonly corners: readonly [number, number, number];
  /** The linear color of the face. */
  readonly color: Vec3;
  readonly finish: Finish;
}

/** A studio mesh read back by {@link unpackStudioMesh}. */
export interface StudioMesh {
  /** x, y, z of each vertex, in meters. */
  readonly positions: Float32Array;
  /** The four bones of each vertex. A bone with the weight 0 is bone 0. */
  readonly joints: Uint8Array;
  /** The four weights of each vertex, which add up to 1. */
  readonly weights: Float32Array;
  /** The three vertices of each triangle. */
  readonly corners: Uint32Array;
  /** Linear r, g, b of each triangle. */
  readonly colors: Float32Array;
  /** The finish of each triangle, as an index in `FINISH_ORDER`. */
  readonly finishes: Uint8Array;
  /** The move of each vertex for each corrective shape: x, y, z in meters. */
  readonly correctives: readonly Float32Array[];
}

/**
 * Splits weights that add up to 1 into whole steps of {@link STUDIO_WEIGHT_STEPS} that add up
 * to the whole: each weight is rounded down, and the largest remainders get one more step.
 *
 * @param weights The weights.
 * @returns The steps.
 */
export function weightSteps(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const exact = weights.map((w) => (w / total) * STUDIO_WEIGHT_STEPS);
  const steps = exact.map(Math.floor);
  const order = exact
    .map((value, i) => [value - Math.floor(value), i] as const)
    .toSorted((a, b) => b[0] - a[0] || a[1] - b[1]);
  let missing = STUDIO_WEIGHT_STEPS - steps.reduce((sum, s) => sum + s, 0);
  for (const [, i] of order) {
    if (missing <= 0) {
      break;
    }
    steps[i] = (steps[i] ?? 0) + 1;
    missing -= 1;
  }
  return steps;
}

/** The palette of a studio mesh: its colors in the order of their first use. */
interface Palette {
  /** Each color: r, g, b in steps of {@link COLOR_STEPS}, and the finish. */
  readonly colors: readonly (readonly [Vec3, Finish])[];
  /** The color of each triangle, as an index in {@link Palette.colors}. */
  readonly triangleColors: readonly number[];
}

/**
 * Gives the palette of the triangles of a studio mesh: each pair of a color in whole steps and a
 * finish one time, in the order of the first triangle that has it.
 *
 * @param triangles The triangles.
 * @returns The palette.
 */
function paletteOf(triangles: readonly StudioTriangle[]): Palette {
  const keys = new Map<string, number>();
  const colors: (readonly [Vec3, Finish])[] = [];
  const triangleColors = triangles.map((t) => {
    const steps = t.color.map((c) => Math.round(Math.min(1, Math.max(0, c)) * COLOR_STEPS));
    const key = `${steps.join(' ')} ${t.finish}`;
    let index = keys.get(key);
    if (index === undefined) {
      index = colors.length;
      keys.set(key, index);
      colors.push([[steps[0] ?? 0, steps[1] ?? 0, steps[2] ?? 0], t.finish]);
    }
    return index;
  });
  return { colors, triangleColors };
}

/**
 * Packs another palette of the faces of a studio mesh as base64 text: the color count, then r, g,
 * b of each color of the palette of {@link packStudioMesh} after the map, in steps of
 * {@link COLOR_STEPS}, in the same order. The finishes stay. {@link unpackStudioMesh} reads it
 * with the packed mesh of the same triangles.
 *
 * @param triangles The triangles of the packed mesh.
 * @param map Gives the new linear color of a color of the palette and its finish.
 * @returns The packed palette as base64.
 */
export function packStudioPalette(
  triangles: readonly StudioTriangle[],
  map: (color: Vec3, finish: Finish) => Vec3,
): string {
  const out: number[] = [];
  const { colors } = paletteOf(triangles);
  writeVarint(out, colors.length);
  for (const [steps, finish] of colors) {
    const linear: Vec3 = [steps[0] / COLOR_STEPS, steps[1] / COLOR_STEPS, steps[2] / COLOR_STEPS];
    for (const c of map(linear, finish)) {
      writeVarint(out, Math.round(Math.min(1, Math.max(0, c)) * COLOR_STEPS));
    }
  }
  return toBase64(out);
}

/**
 * The number of recent vertices that the packed triangles name by their place in the list
 * ({@link packCorners}).
 */
const RECENT_CORNERS = 8;

/**
 * The largest number in a stream of two byte planes ({@link writePlanes}).
 */
const PLANE_LIMIT = 0x10000;

/**
 * Adds numbers as two byte planes: the low byte of each number, then the high byte of each number.
 * Gzip finds more repeats in the planes than in LEB128 numbers, also in base64 text.
 *
 * @param out The bytes.
 * @param values The numbers, each an integer from 0 to 65535.
 * @throws Error if a number is out of this range.
 */
function writePlanes(out: number[], values: readonly number[]): void {
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value >= PLANE_LIMIT) {
      throw new Error(`The number ${value} does not fit in two bytes.`);
    }
    out.push(value & 0xff);
  }
  for (const value of values) {
    out.push(value >> 8);
  }
}

/**
 * Reads numbers of {@link writePlanes}.
 *
 * @param reader The cursor. The read moves it.
 * @param count The count of the numbers.
 * @returns The numbers.
 * @throws Error if the bytes end.
 */
function readPlanes(reader: ByteReader, count: number): Uint16Array {
  const values = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = readByte(reader);
  }
  for (let i = 0; i < count; i++) {
    values[i] = (values[i] ?? 0) | (readByte(reader) << 8);
  }
  return values;
}

/**
 * The state of the code of the corners of the triangles, the same in the pack and the read: the
 * recent vertices, the most recent first, the highest vertex so far, and the vertex before.
 */
interface CornerState {
  /** The recent vertices, the most recent first, at most {@link RECENT_CORNERS}. */
  readonly recent: number[];
  /** The highest vertex so far, or -1. */
  high: number;
  /** The vertex of the corner before, or 0. */
  previous: number;
}

/**
 * Records a corner in the state of the corner code.
 *
 * @param state The state. The call changes it.
 * @param corner The vertex of the corner.
 * @param place The place of the vertex in the recent vertices, or -1.
 */
function noteCorner(state: CornerState, corner: number, place: number): void {
  if (place >= 0) {
    state.recent.splice(place, 1);
  }
  state.recent.unshift(corner);
  if (state.recent.length > RECENT_CORNERS) {
    state.recent.pop();
  }
  state.high = Math.max(state.high, corner);
  state.previous = corner;
}

/**
 * Gives the code of each corner of the triangles: the place of the vertex in the recent vertices,
 * or {@link RECENT_CORNERS} for the vertex after the highest vertex so far, or else
 * {@link RECENT_CORNERS} + 1 + the zigzag number of the difference from the vertex before.
 *
 * @param corners The vertex of each corner, in order.
 * @returns The code of each corner.
 */
function packCorners(corners: readonly number[]): number[] {
  const state: CornerState = { recent: [], high: -1, previous: 0 };
  return corners.map((corner) => {
    const place = state.recent.indexOf(corner);
    let code: number;
    if (place >= 0) {
      code = place;
    } else if (corner === state.high + 1) {
      code = RECENT_CORNERS;
    } else {
      code = RECENT_CORNERS + 1 + zigzag(corner - state.previous);
    }
    noteCorner(state, corner, place);
    return code;
  });
}

/**
 * Packs a studio mesh as base64 text. Each stream holds one kind of number, so that gzip finds
 * the repeats.
 *
 * The packed bytes, each count and each number of the LEB128 kind unless the list says else:
 *
 * 1. The vertex count, the triangle count, the color count, and the count of corrective shapes.
 * 2. The place of each vertex, one axis after the other: the difference from the vertex before,
 *    in steps of `PACKED_STEP`, as a zigzag number in two byte planes ({@link writePlanes}).
 * 3. The skin: the bone count of each vertex as one byte, then each bone of each vertex as one
 *    byte, then each weight of each vertex except its last weight, in steps of
 *    {@link STUDIO_WEIGHT_STEPS}, as one byte. The steps of a vertex add up to the whole, so the
 *    read gives the last weight from the others.
 * 4. The code of each corner of the triangles ({@link packCorners}).
 * 5. The colors: r, g, b in steps of {@link COLOR_STEPS} and the finish index as one byte.
 * 6. The color of each triangle, as an index in the colors.
 * 7. The corrective shapes: the count of the vertices that each shape moves, then the difference
 *    of each vertex from the vertex before in its shape in two byte planes, then the moves on x
 *    of all shapes, on y, and on z, in steps of {@link CORRECTIVE_STEP} as zigzag numbers.
 *
 * @param vertices The vertices.
 * @param triangles The triangles.
 * @param correctives The move of each vertex for each corrective shape.
 * @returns The packed mesh as base64.
 * @throws Error if a vertex has more than {@link STUDIO_INFLUENCES} bones, a triangle names a
 *   vertex that does not exist, or a difference does not fit in two bytes.
 */
export function packStudioMesh(
  vertices: readonly StudioVertex[],
  triangles: readonly StudioTriangle[],
  correctives: readonly (readonly Vec3[])[],
): string {
  const out: number[] = [];
  const { colors, triangleColors } = paletteOf(triangles);

  writeVarint(out, vertices.length);
  writeVarint(out, triangles.length);
  writeVarint(out, colors.length);
  writeVarint(out, correctives.length);
  for (let axis = 0; axis < 3; axis++) {
    let last = 0;
    writePlanes(
      out,
      vertices.map((vertex) => {
        const steps = packCoordinate(vertex.position[axis] ?? 0);
        const delta = zigzag(steps - last);
        last = steps;
        return delta;
      }),
    );
  }
  const bones: number[] = [];
  const steps: number[] = [];
  for (const [v, vertex] of vertices.entries()) {
    if (vertex.skin.length === 0 || vertex.skin.length > STUDIO_INFLUENCES) {
      throw new Error(`The vertex ${v} has ${vertex.skin.length} bones.`);
    }
    out.push(vertex.skin.length);
    bones.push(...vertex.skin.map(([bone]) => bone));
    steps.push(...weightSteps(vertex.skin.map(([, w]) => w)).slice(0, -1));
  }
  out.push(...bones, ...steps);
  const corners = triangles.flatMap((triangle) => [...triangle.corners]);
  for (const corner of corners) {
    if (!vertices[corner]) {
      throw new Error(`A triangle names the vertex ${corner}, which does not exist.`);
    }
  }
  for (const code of packCorners(corners)) {
    writeVarint(out, code);
  }
  for (const [colorSteps, finish] of colors) {
    for (const step of colorSteps) {
      writeVarint(out, step);
    }
    out.push(FINISH_ORDER.indexOf(finish));
  }
  for (const index of triangleColors) {
    writeVarint(out, index);
  }
  const moved = correctives.map((corrective) =>
    corrective.flatMap((move, v) =>
      move.some((d) => Math.round(d / CORRECTIVE_STEP) !== 0) ? [v] : [],
    ),
  );
  for (const list of moved) {
    writeVarint(out, list.length);
  }
  writePlanes(
    out,
    moved.flatMap((list) => list.map((v, k) => v - (list[k - 1] ?? 0))),
  );
  for (let axis = 0; axis < 3; axis++) {
    for (const [s, list] of moved.entries()) {
      for (const v of list) {
        writeVarint(out, zigzag(Math.round((correctives[s]?.[v]?.[axis] ?? 0) / CORRECTIVE_STEP)));
      }
    }
  }
  return toBase64(out);
}

/**
 * Reads a mesh of {@link packStudioMesh} back, with its own palette or with another palette of
 * {@link packStudioPalette}.
 *
 * @param packed The packed mesh as base64.
 * @param palette Another packed palette of the same triangles. The colors of the mesh by default.
 * @returns The vertices, their skins, the triangles, their colors, and the corrective shapes.
 * @throws Error if the bytes end early, if a triangle names a vertex that does not exist, or if
 *   the other palette has another number of colors.
 */
export function unpackStudioMesh(packed: string, palette?: string): StudioMesh {
  const reader = byteReader(packed);
  const vertexCount = readVarint(reader);
  const triangleCount = readVarint(reader);
  const colorCount = readVarint(reader);
  const correctiveCount = readVarint(reader);

  const positions = new Float32Array(vertexCount * 3);
  for (let axis = 0; axis < 3; axis++) {
    const deltas = readPlanes(reader, vertexCount);
    let last = 0;
    for (let v = 0; v < vertexCount; v++) {
      last += unzigzag(deltas[v] ?? 0);
      positions[v * 3 + axis] = last * PACKED_STEP;
    }
  }

  const joints = new Uint8Array(vertexCount * STUDIO_INFLUENCES);
  const weights = new Float32Array(vertexCount * STUDIO_INFLUENCES);
  const counts = Array.from({ length: vertexCount }, () => readByte(reader));
  for (const [v, count] of counts.entries()) {
    for (let k = 0; k < count; k++) {
      joints[v * STUDIO_INFLUENCES + k] = readByte(reader);
    }
  }
  for (const [v, count] of counts.entries()) {
    let rest = STUDIO_WEIGHT_STEPS;
    for (let k = 0; k < count; k++) {
      const step = k < count - 1 ? readByte(reader) : rest;
      rest -= step;
      weights[v * STUDIO_INFLUENCES + k] = step / STUDIO_WEIGHT_STEPS;
    }
  }

  const corners = new Uint32Array(triangleCount * 3);
  const state: CornerState = { recent: [], high: -1, previous: 0 };
  for (let c = 0; c < corners.length; c++) {
    const code = readVarint(reader);
    const place = code < RECENT_CORNERS ? code : -1;
    let corner: number;
    if (place >= 0) {
      corner = state.recent[place] ?? -1;
    } else if (code === RECENT_CORNERS) {
      corner = state.high + 1;
    } else {
      corner = state.previous + unzigzag(code - RECENT_CORNERS - 1);
    }
    if (corner < 0 || corner >= vertexCount) {
      throw new Error(`The corner ${c} names the vertex ${corner}, which does not exist.`);
    }
    corners[c] = corner;
    noteCorner(state, corner, place);
  }

  const entries = Array.from({ length: colorCount }, () => {
    const rgb = [0, 1, 2].map(() => readVarint(reader) / COLOR_STEPS);
    return { rgb, finish: readByte(reader) };
  });
  if (palette !== undefined) {
    const other = byteReader(palette);
    const count = readVarint(other);
    if (count !== colorCount) {
      throw new Error(`The palette has ${count} colors, and the mesh has ${colorCount}.`);
    }
    for (const entry of entries) {
      entry.rgb = [0, 1, 2].map(() => readVarint(other) / COLOR_STEPS);
    }
  }
  const colors = new Float32Array(triangleCount * 3);
  const finishes = new Uint8Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const entry = entries[readVarint(reader)];
    colors.set(entry?.rgb ?? [1, 1, 1], t * 3);
    finishes[t] = entry?.finish ?? 0;
  }

  const moved = Array.from({ length: correctiveCount }, () => readVarint(reader));
  const steps = readPlanes(
    reader,
    moved.reduce((sum, count) => sum + count, 0),
  );
  let at = 0;
  const lists = moved.map((count) => {
    const list = new Uint32Array(count);
    let v = 0;
    for (let k = 0; k < count; k++) {
      v += steps[at] ?? 0;
      at += 1;
      list[k] = v;
    }
    return list;
  });
  const correctives = lists.map(() => new Float32Array(vertexCount * 3));
  for (let axis = 0; axis < 3; axis++) {
    for (const [s, list] of lists.entries()) {
      const corrective = correctives[s];
      for (const v of list) {
        const move = unzigzag(readVarint(reader)) * CORRECTIVE_STEP;
        if (corrective) {
          corrective[v * 3 + axis] = move;
        }
      }
    }
  }
  return { positions, joints, weights, corners, colors, finishes, correctives };
}
