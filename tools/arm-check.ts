/**
 * Checks the arms of the studio body of each role against one table of limits ({@link ARM_LIMITS},
 * design 4.4), so that a change of a hold, a rig, a pose, an instrument size, or a seat that twists
 * or deforms an arm stops before its merge. A change that meets one measure can move the fault to
 * a joint that no measure reads. So the gate reads the measures of `pnpm fold-probe`, `pnpm
 * arm-shape`, and `pnpm hold-fit` together, for each arm, over the rest, play, and lift samples of
 * `probeFolds()` of `tools/fold-probe.ts`:
 *
 * - `folds`: the folded faces of the arm ({@link armFaces}), as `pnpm fold-probe` finds them. The
 *   value is the 95th percentile of the count.
 * - `twist`: the largest roll step of the skin from the chest along the upper arm, over the rings
 *   of {@link ARM_RINGS}, as `measureArm()` of `tools/arm-shape.ts` gives it. `forearm twist`: the
 *   same step from the elbow ring to the wrist ring, which a turn of the paw makes larger.
 * - `flat`: the narrow axis of the flattest ring as a share of its bind value. The value is the 5th
 *   percentile.
 * - `paw twist` and `paw swing`: the turn of the paw on its forearm from the bind pose, split into
 *   the twist around the forearm and the swing, as `pawAngles()` of `tools/hold-fit.ts` gives them
 *   for the mean turn.
 * - `paw jumps`: the share of the play and lift samples whose paw twist changes by more than
 *   {@link JUMP_ANGLE} from the sample before, such as a flip of a bow paw.
 * - `stretch`: the largest growth of an edge of the faces of the forearm and the paw from the rest
 *   sample of the same body and demo, as a share of the length of the upper arm, such as a spike
 *   from the paw to the upper arm. A face that is long in the rest too does not count.
 * - `grip turn`: the turn of the paw in the play from the accepted grip of its arm
 *   ({@link ACCEPTED_GRIPS}). The grip is the twist of the paw in the frame of the posed forearm
 *   ({@link GripFrames}), which no bind moves. The value is the median, so a paw that holds its
 *   prop in another grip fails with no base. For a role with no entry, the tool prints a ready
 *   entry under the table ({@link gripLines}), and the role has no value `grip`.
 *
 * - `move twist` and `move turn`: the largest paw twist on the forearm, and the largest turn rate of
 *   the wrist in degrees per second, over the lifts and the lowerings of {@link probeMoves} at
 *   steps of 0.01 s (the set `move`). A paw twist past 180° makes the twist bone of the forearm
 *   jump by 180° in one step, and a mix of two turns near 180° apart jumps to the other side.
 *
 * The other values are the 95th percentiles of the samples. Each value has a p50, a p95 (a p5 for
 * the flat share), and its worst sample (the demo and the time) in each sample set. The value of
 * the gate comes from the worst sample set.
 *
 * With `--base <ref>`, the commit runs beside the working tree, each role in a child process
 * (`probeBeside()` of `tools/ref-tree.ts`), with the gate of the working tree in place of its own
 * ({@link GATE_SCRIPTS}), so that both trees have the same measures. The JSON of the commit goes
 * into the cache by tree.
 * Each value then has a verdict ({@link verdictOf}): `FAIL` when it is over its limit and the base
 * is not, or when it is worse than the base by more than its margin; `OPEN` when it is over its
 * limit and not worse than the base (a known open item); else `PASS`. With no `--base`, each value
 * over its limit fails. A role that the commit does not have has no base. The
 * exit code is 1 when a value fails.
 *
 * A body whose bind differs from the bind of the base ({@link bindKey}) is a rebind. Each value of
 * {@link BIND_MEASURES} of a rebind counts from another zero than its base, so it takes only its
 * limit: `FAIL` over the limit, and `REBIND` in place of a `FAIL` of the margin. The other values
 * keep the margin. The run then prints the narrow axes of the elbow ring and the wrist ring in
 * centimeters against the base ({@link rebindLines}), because the flat share no longer compares.
 *
 * The JSON of each role of the working tree goes into a cache by tree ({@link armCacheFile}), so a
 * second run on the same tree, such as the merge gate after the gate of the branch, reads it and
 * prints `tree: cached`. A change of a file of `src/`, `tools/`, or the demos gives a new key.
 *
 * The tool imports only the modules and the exports that the older trees of a probe have too,
 * because a probe of an older commit copies it into the tree of the commit (`withProbeTree()`). A
 * tree with no label of the fold visit gets the labels of its samples from the plan of the demo.
 *
 * `--views <dir>` renders the worst play sample of each arm that fails, or of each arm with
 * `--views-all`, a strike, and a rest of the player, with `pnpm close-views play --at <species>`,
 * and writes one image of each frame: a 2x crop of each arm in each view, the commit on the left
 * and the working tree on the right (`tools/arm-views.ts`).
 *
 * `--trace <demo>:<from>-<to>` prints the paws of one role at each step of a range of song times,
 * or of wall times of the lift with `lift<from>-<to>`, with no sweep ({@link traceLines}). The
 * step is {@link TRACE_STEP} with no `--step`. A trace of 0.4 s takes about 1 s.
 *
 * `--states <ref>,...` runs the gate of the working tree on the code of each commit, in the probe
 * tree of the commit with this script in place of its own ({@link measureStates}), and prints one
 * table with a column for each commit and one for the working tree ({@link stateLines}). The exit
 * code reads the working tree, as the gate with no base.
 *
 * `--explain <measure>` explains `stretch` or `flat` of one role in this tree, with no child and
 * no cache ({@link explainLines}): the value of each arm in each sample set against the rest
 * sample and against the bind, with the mark `MOVES` at a stretch that is larger from the rest
 * than from the bind, the part of the rest sample of each demo that shrinks most from the bind,
 * and the worst edges or rings of the worst sample of each arm, with the bone of each. With
 * `--glb <file>`, it explains the studio body of the file, in a copy of `src/`
 * (`tools/glb-swap.ts`), so that each try body of a rig gives its rings at the same samples.
 *
 * `--variant <name>` starts a variant of the holds, and each `--set` after it adds its changes to
 * the variant. Several `--variant` groups give several variants in one run ({@link checkVariants}).
 * Each variant of each role runs as one child, as a run with its `--set` options alone, with its
 * own cache by tree, and at most `--jobs` children run at the same time. One table gives a block
 * of rows for each variant. A variant with no `--set` is the working tree with no change. The
 * scene of one variant takes almost all the time of a child, and a change of a hold can change
 * the scene, so each child builds its own scenes.
 *
 * Usage: pnpm arm-check <role>... | --all [--base <ref>] [--set <changes>]...
 * [--variant <name> [--set <changes>]...]... [--glb <file>] [--views <dir> [--views-all]]
 * [--demo <id>]... [--midi <path>]... [--step <seconds>] [--jobs <n>] [--long], or
 * pnpm arm-check <role> --trace <demo>:[lift]<from>-<to> [--midi <path>] [--step <seconds>]
 * [--set <changes>]..., or pnpm arm-check <role> --explain <stretch | flat> [--demo <id>]...
 * [--midi <path>]... [--step <seconds>] [--set <changes>]... [--glb <file>]
 *
 * Each `--midi <path>` adds a MIDI file outside the repository to the demos as one more `--demo`
 * ({@link userFiles}), also on the commit of `--base` and `--states`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { Matrix4, Quaternion, Vector3 } from 'three';

import {
  FOLD_ROLES,
  SAMPLE_SETS,
  findRole,
  isRole,
  probeFolds,
  roleAnimal,
  roleBodies,
  roleScene,
} from './fold-probe.ts';
import type { RoleSource, SampleSet } from './fold-probe.ts';
import { runTool, takeGlb, withGlbBody } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import type { DemoFile } from './patch-demos.ts';
import { probeDemos } from './probe-demos.ts';
import {
  PROBE_NO_CACHE,
  ROOT,
  probeBeside,
  runChild,
  withProbeTree,
  withTempFolder,
} from './ref-tree.ts';
import { STUDIO_BONES } from '../src/models/studio-format.ts';
import { sideSegmentBones } from './arm-segments.ts';
import type { Side, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import {
  createStudioPose,
  poseStudioBones,
  skinStudioMesh,
  studioOffsets,
  twistAngle,
} from '../src/models/studio-rig.ts';
import * as studioRig from '../src/models/studio-rig.ts';
import type { StudioRig } from '../src/models/studio-rig.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { LIFT_FIT_SEC, LOWER_MAX_SEC } from '../src/pose/rest.ts';
import { PLAYING, allAudible } from '../src/pose/test-scene.ts';
import type { Transport } from '../src/pose/types.ts';

/** The sides of the arms. */
const SIDES = ['L', 'R'] as const;

/**
 * The unwind of the left forearm twist near 180° in the older trees with no supinated bind of the
 * left paws. A gate of such a base reads it, so that the base keeps its own measure.
 */
interface UnwindTree {
  /** Gives the twist that the twist bone and the segments of a forearm share (`skinTwist()`). */
  readonly skinTwist?: (twist: number, fade: number) => number;
}

/** The share of the unwind in a pose of such a tree (`twistFadeL` of `AnimalPose`). */
interface UnwindPose {
  /** The share of the unwind of the left forearm, from 0 to 1. */
  readonly twistFadeL?: number;
}

/**
 * Gives the twist that the twist bone and the segments of a forearm share: the twist itself, or
 * the twist with the unwind in the tree of a commit that has it ({@link UnwindTree}).
 */
// SAFETY: only the module of an older tree has `skinTwist`, so the field can be missing.
const sharedTwist = (studioRig as UnwindTree).skinTwist ?? ((twist: number) => twist);

/** The measures of the gate. */
export const MEASURES = [
  'folds',
  'twist',
  'foreTwist',
  'flat',
  'pawTwist',
  'pawSwing',
  'pawJump',
  'stretch',
  'grip',
  'moveTwist',
  'moveTurn',
] as const;

/** A measure of the gate. */
export type Measure = (typeof MEASURES)[number];

/** The measures of the moves: the lifts and the lowerings of {@link probeMoves}. */
export const MOVE_MEASURES = ['moveTwist', 'moveTurn'] as const satisfies readonly Measure[];

/**
 * The measures that count from the bind pose of the body: the twists and the swing of the paw on
 * its forearm from the bind paw, and the flat share against the bind ring. A new bind moves their
 * zero with the same pose of the bones, so a rebind judges them only by their limits (design 4.4,
 * "Arm gate").
 */
export const BIND_MEASURES = [
  'foreTwist',
  'flat',
  'pawTwist',
  'pawSwing',
  'moveTwist',
] as const satisfies readonly Measure[];

/** The arm bones whose bind heads, with the palm and the elbow axis, give the bind of an arm. */
const BIND_BONES = [
  'clavicle',
  'upper_arm',
  'forearm',
  'forearm_twist',
  'hand',
  'fingers',
] as const;

/** The rings whose narrow axes a rebind prints in place of the flat share ({@link ARM_RINGS}). */
export const REBIND_RINGS = ['elbow', 'wrist'] as const;

/** A ring of {@link REBIND_RINGS}. */
export type RebindRing = (typeof REBIND_RINGS)[number];

/**
 * The sample sets of the gate: the sets of `probeFolds()`, and `move`, the lifts and the
 * lowerings of {@link probeMoves} at steps of {@link MOVE_STEP}.
 */
export const GATE_SETS = [...SAMPLE_SETS, 'move'] as const;

/** A sample set of the gate. */
export type GateSet = (typeof GATE_SETS)[number];

/** The limit of one measure of the gate. */
export interface ArmLimit {
  /** The name of the measure in the tables. */
  readonly name: string;
  /**
   * The value of a sample set that the limit reads: a share of the samples, a percentile, or the
   * worst sample.
   */
  readonly stat: 'share' | 'p50' | 'p95' | 'p5' | 'worst';
  /** The limit of the value. */
  readonly limit: number;
  /** True when a larger value is worse, false when a smaller value is worse. */
  readonly up: boolean;
  /** The change from the base above which a value over its limit is worse than the base. */
  readonly margin: number;
  /** The number of digits of the value in the tables. */
  readonly digits: number;
  /** The source of the limit. */
  readonly source: string;
}

/**
 * The limits of the gate. Each limit comes from arms that look good (the rabbit and the red fox of
 * `pnpm arm-shape`, and the other roles with no open arm item), or from anatomy, with a margin
 * above the good arms. Each row names its source.
 */
export const ARM_LIMITS: Readonly<Record<Measure, ArmLimit>> = {
  folds: {
    name: 'folds p95',
    stat: 'p95',
    limit: 8,
    up: true,
    margin: 2,
    digits: 0,
    source: 'good arms: up to 6 faces (red fox) and 8 (tan fox); the hippo shoulder folded 12',
  },
  twist: {
    name: 'twist p95',
    stat: 'p95',
    limit: 55,
    up: true,
    margin: 10,
    digits: 0,
    source: 'good upper arms up to 51° (rabbit bow arm); the twist band of the hippo 60°',
  },
  foreTwist: {
    name: 'forearm twist p95',
    stat: 'p95',
    limit: 80,
    up: true,
    margin: 15,
    digits: 0,
    source: 'good forearms up to 77° (rabbit left arm in the lift)',
  },
  flat: {
    name: 'flat p5',
    stat: 'p5',
    limit: 0.55,
    up: false,
    margin: 0.05,
    digits: 2,
    source: 'good arms 0.56 and more (red fox, polar bear); the hippo band 0.53',
  },
  pawTwist: {
    name: 'paw twist p95',
    stat: 'p95',
    limit: 170,
    up: true,
    margin: 30,
    digits: 0,
    source: 'good paws up to 168° from the bind (red fox); the bind paw is no neutral wrist',
  },
  pawSwing: {
    name: 'paw swing p95',
    stat: 'p95',
    limit: 70,
    up: true,
    margin: 15,
    digits: 0,
    source: 'anatomy: a wrist bends about 70°; good paws up to 64° (bear conductor)',
  },
  pawJump: {
    name: 'paw jumps',
    stat: 'share',
    limit: 0.005,
    up: true,
    margin: 0.005,
    digits: 3,
    source: 'a twist change of more than 90° in one step is a flip; the play of good paws has none',
  },
  stretch: {
    name: 'stretch p95',
    stat: 'p95',
    limit: 0.35,
    up: true,
    margin: 0.05,
    digits: 2,
    source: 'good forearms and paws up to 0.34 of the upper arm from the rest (bear conductor)',
  },
  grip: {
    name: 'grip turn p50',
    stat: 'p50',
    limit: 45,
    up: true,
    margin: 15,
    digits: 0,
    source: 'the paw twist of the accepted grip (ACCEPTED_GRIPS); half the 90° of anatomy',
  },
  moveTwist: {
    name: 'move twist max',
    stat: 'worst',
    limit: 176,
    up: true,
    margin: 3,
    digits: 0,
    source:
      'the largest paw twist of the rest and the play of a good arm, 175° (hippo left arm); at 180° the twist bone takes -90° or 90°',
  },
  moveTurn: {
    name: 'move turn max',
    stat: 'worst',
    limit: 3000,
    up: true,
    margin: 500,
    digits: 0,
    source:
      'the play of good wrists turns up to 2,268°/s (elephant mallets); a flip turns 90° or more in one step of 0.01 s',
  },
};

/** The paw twist change between two samples above which the change is a jump, in degrees. */
export const JUMP_ANGLE = 90;

/**
 * The accepted grip of each arm of each role: the median grip of the arm in the play of accepted
 * arms ({@link GripFrames}), in degrees, with the sign of the right arm turned, so that a positive
 * grip turns each palm toward pronation. The grip counts from the posed forearm, so a new bind
 * keeps each entry, and the entry of a role holds for each body in the role.
 * The entries of the older frame of the bind moved into this frame by the shift of the median of
 * each arm on `27b9fc24`. The value `grip` is the turn of the paw from its accepted grip. A hold
 * change that changes a grip on purpose gives its new median here, with the accepted crops. A role
 * with no entry has no value `grip`.
 */
export const ACCEPTED_GRIPS: ReadonlyMap<string, Readonly<Record<Side, number>>> = new Map<
  string,
  Readonly<Record<Side, number>>
>([
  // The smooth studio bear with the baton along the index finger.
  ['conductor', { L: -46, R: 2 }],
  // The T-pose polar bear mesh.
  ['pianist', { L: 39, R: 30 }],
  ['harpist', { L: 22, R: -35 }],
  // The good left paws of the violins and the viola turn 148° to 175° toward supination.
  ['violinist', { L: -171, R: -29 }],
  ['fox-violinist', { L: -152, R: -33 }],
  // The cat violist with the right elbow down at the tip, which rolls the right forearm, from
  // accepted 2x paw crops.
  ['violist', { L: -175, R: -17 }],
  ['cellist', { L: -90, R: 72 }],
  // The hippo bow arm with the elbow out and a little up, so that the forearm slopes down to the
  // bow with a nearly straight wrist.
  ['bassist', { L: -98, R: 57 }],
  // The panda holds the low part of the slide brace from its right side, with the right palm to
  // the left and the thumb up the brace, from accepted 3x crops. A palm that faces out with the
  // thumb down is the fault.
  ['trombonist', { L: -50, R: -32 }],
  // The paws of the timpanist and of the badger close on their mallets, sticks, and beaters, so
  // that each paw holds its stick, from accepted 3x crops. Each timpani paw turns around the shaft
  // at the strike (strikeRoll), so that the shaft stays in the closed paw. This turns the left paw
  // 12° and the right paw 13° further.
  ['timpanist', { L: 75, R: 61 }],
  ['bassoonist', { L: -41, R: -2 }],
  ['hornist', { L: -92, R: -3 }],
  // The wolf and the mouse close their paws around the tube, with the palms toward its axis and
  // the grips moved around it, so that each paw holds the instrument, from accepted 2x crops.
  ['clarinetist', { L: -14, R: 4 }],
  // The recast role of the wolf with the shoulder hold of the rabbit (WOLF_VIOLIN_HOLD). The left
  // grip lies inside the grips of the good left paws of the violins.
  ['violinist@wolf', { L: -148, R: -55 }],
  // The mouse holds the 40° oboe from the side of each paw, with the left paw on the upper joint
  // and the thumbs up the tube, from accepted crops. A palm that faces out with the thumb down is
  // the fault. The left elbow points down, so that the left arm does not read as a raised wing.
  ['oboist', { L: -11, R: -18 }],
  // The paws of the woodwinds of the tan fox face its tube (faceTube of pose/winds.ts). The left
  // paw holds the flute from its front, with its fingers over the top, and faces it in the play,
  // from accepted 2x paw crops. It turns -10° on its forearm below the flute.
  ['flutist', { L: -122, R: 46 }],
  ['trumpeter', { L: -23, R: -40 }],
  // The rhino with the rebuilt arms, the bind elbow bent forward, and the tuba elbows down and out
  // (from accepted 2x paw crops).
  ['tubist', { L: -80, R: -29 }],
  ['singer', { L: -34, R: -34 }],
  // The hanging left arm of the badger, from accepted 2x crops: the arm hangs nearer to the body
  // since the side test of `pose/hang.ts` counts only the inner side of each part.
  ['bass-drummer', { L: -22, R: 74 }],
  // The wrist lifts the tip of the stick or the mallet over its spot between strikes, and the paws
  // close on their sticks and mallets, from accepted paw crops.
  ['snare-drummer', { L: 65, R: 66 }],
  ['cymbalist', { L: 67, R: 67 }],
  ['percussionist', { L: -7, R: 35 }],
  // The spine leans over the bars, and the wrist lifts the head of each mallet over its bar
  // between strikes, from accepted 2x paw crops.
  ['xylophonist', { L: 29, R: 46 }],
]);

/**
 * The smallest share of the weight of the three corners of a face on the bones of one arm, from
 * the clavicle to the fingers, that makes the face a face of that arm.
 */
export const ARM_FACE_SHARE = 0.5;

/** A ring of the arm skin: the bone of its axis and its place along the bone. */
export interface ArmRing {
  /** The name of the ring. */
  readonly name: 'shoulder' | 'upper' | 'elbow' | 'forearm' | 'wrist';
  /** The bone of the axis: the upper arm or the forearm. */
  readonly bone: 'upper' | 'fore';
  /** The place along the bone, from 0 at its head to 1 at the head of the next bone. */
  readonly at: number;
}

/**
 * The rings of each arm, from the shoulder out: the four rings of `ARM_RINGS` of
 * `tools/arm-shape.ts`, and a ring near the wrist, because a forearm can go flat with a round
 * upper arm.
 */
export const ARM_RINGS: readonly ArmRing[] = [
  { name: 'shoulder', bone: 'upper', at: 0.15 },
  { name: 'upper', bone: 'upper', at: 0.5 },
  { name: 'elbow', bone: 'upper', at: 0.85 },
  { name: 'forearm', bone: 'fore', at: 0.5 },
  { name: 'wrist', bone: 'fore', at: 0.85 },
];

/** The smallest weight of a crossing of a ring on the bones of its arm (`RING_WEIGHT`). */
const RING_WEIGHT = 0.25;

/** The largest distance of a crossing from the axis, as a factor of the median (`RING_REACH`). */
const RING_REACH = 2;

/** The earliest song time of a view, in seconds, after the seek lead of `pnpm close-views play`. */
const VIEW_FROM_SEC = 5;

/** The bind facts of one ring of one arm. */
interface RingBind {
  /** The ring. */
  readonly ring: ArmRing;
  /** The two vertices of each edge that crosses the plane of the ring. */
  readonly edges: Uint32Array;
  /** The place of each crossing along its edge, from 0 at its first vertex to 1. */
  readonly along: Float32Array;
  /** The bind vector of each crossing from the axis, normal to the axis. */
  readonly radial: Float32Array;
  /** The narrowest axis of the bind ring. */
  readonly narrow: number;
}

/** The bind facts of one arm. */
interface ArmBind {
  /** The indices of the chest and the arm bones in `STUDIO_BONES`. */
  readonly bones: Readonly<Record<'chest' | 'upper' | 'fore' | 'hand', number>>;
  /** The bind heads of the shoulder, the elbow, and the wrist. */
  readonly joints: Readonly<Record<'shoulder' | 'elbow' | 'wrist', Vector3>>;
  /** The rings of {@link ARM_RINGS}. */
  readonly rings: readonly RingBind[];
  /** The faces of the arm ({@link armFaces}). */
  readonly faces: ReadonlySet<number>;
  /** The three vertices of each face of the arm. */
  readonly corners: Uint32Array;
  /** The three vertices of each face of the forearm and the paw ({@link armFaces}). */
  readonly lower: Uint32Array;
  /** The index in the skin of each face of {@link ArmBind.lower}. */
  readonly lowerFaces: readonly number[];
  /** The bind length of the three edges of each face of {@link ArmBind.lower}. */
  readonly lengths: Float32Array;
  /** The bind length of the upper arm. */
  readonly upper: number;
  /** The frames of the grip ({@link GripFrames}). */
  readonly grip: GripFrames;
}

/**
 * The bind frames of the grip of one arm. The grip is the twist of the paw in the frame of the
 * posed forearm: the axis from the elbow to the wrist, and the elbow axis of the retarget
 * (`poseStudioBones()`). Both come from the posed skeleton of the player, and the palm of the paw
 * comes from the hand of the player, so a new bind of the same pose gives the same grip. The zero
 * is the hanging arm of the player in its bind pose: the palm inward, along the elbow axis. A
 * positive grip turns the palm of each arm toward pronation.
 */
export interface GripFrames {
  /**
   * The turn from the frame of the player to the bind forearm: the down axis to the axis from the
   * elbow to the wrist, and +x to the elbow axis (`StudioRig.arms`).
   */
  readonly fore: Quaternion;
  /**
   * The turn from the frame of the player to the bind paw: the down axis to the axis from the
   * wrist to the fingers, and the inward palm of the player to the palm of the studio
   * (`StudioBody.palms`).
   */
  readonly paw: Quaternion;
}

/** The values of one arm in one sample, by measure. */
export type ArmSample = Readonly<Record<Measure, number>> & {
  /** The signed twist of the paw on its forearm from the bind, in degrees, for the jumps. */
  readonly pawRoll: number;
  /**
   * The signed twist of the paw in the frame of the posed forearm, in degrees ({@link GripFrames}).
   */
  readonly gripRoll: number;
};

/**
 * Gives the skin joints of one arm: the studio bones from the upper arm to the fingers, the arm
 * segments and the helpers of a body with them (`sideSegmentBones()`), the clavicle when asked,
 * and each extra joint that follows the upper arm, such as the twist bone of the upper arm
 * (`StudioRig.follows`).
 *
 * @param rig The studio rig.
 * @param side The side.
 * @param clavicle True to add the clavicle.
 * @returns The indices of the skin joints.
 */
export function armJoints(rig: StudioRig, side: Side, clavicle: boolean): number[] {
  const names: StudioBone[] = [
    ...(clavicle ? [`clavicle_${side}` as const] : []),
    `upper_arm_${side}`,
    `forearm_${side}`,
    `forearm_twist_${side}`,
    `hand_${side}`,
    `fingers_${side}`,
    ...sideSegmentBones(side),
  ];
  const own = names.map((name) => STUDIO_BONES.indexOf(name));
  const upper = rig.follows[STUDIO_BONES.indexOf(`upper_arm_${side}`)];
  const extra = [...rig.follows.keys()].filter(
    (j) => j >= STUDIO_BONES.length && rig.follows[j] === upper,
  );
  return [...own, ...extra];
}

/**
 * Gives the weight of a vertex on some joints.
 *
 * @param mesh The skin.
 * @param v The vertex.
 * @param joints The joints.
 * @returns The sum of the weights.
 */
function weightOn(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  v: number,
  joints: readonly number[],
): number {
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    if (joints.includes(mesh.joints[v * 4 + k] ?? -1)) {
      sum += mesh.weights[v * 4 + k] ?? 0;
    }
  }
  return sum;
}

/**
 * Finds the faces of one arm: the faces whose corners hold {@link ARM_FACE_SHARE} of their weight
 * or more on the joints of the arm, from the clavicle to the fingers.
 *
 * @param mesh The skin.
 * @param joints The joints of the arm.
 * @returns The indices of the faces.
 */
export function armFaces(
  mesh: Pick<StudioMesh, 'joints' | 'weights' | 'corners'>,
  joints: readonly number[],
): Set<number> {
  const faces = new Set<number>();
  for (let f = 0; f < mesh.corners.length / 3; f++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      sum += weightOn(mesh, mesh.corners[f * 3 + k] ?? 0, joints);
    }
    if (sum >= 3 * ARM_FACE_SHARE) {
      faces.add(f);
    }
  }
  return faces;
}

/**
 * Gives the root of the smaller principal value of some vectors in the plane normal to an axis
 * (`narrowAxis()` of `tools/arm-shape.ts`).
 *
 * @param vectors The vectors, x, y, z of each one.
 * @param axis The unit axis.
 * @returns The root, in the units of the vectors.
 */
function narrowAxis(vectors: ArrayLike<number>, axis: Vector3): number {
  const e1 = new Vector3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) {
    e1.set(0, 1, 0);
  }
  e1.addScaledVector(axis, -e1.dot(axis)).normalize();
  const e2 = new Vector3().crossVectors(axis, e1);
  const count = vectors.length / 3;
  const p = new Vector3();
  let mx = 0;
  let my = 0;
  for (let i = 0; i < count; i++) {
    p.fromArray(vectors, i * 3);
    mx += p.dot(e1) / count;
    my += p.dot(e2) / count;
  }
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let i = 0; i < count; i++) {
    p.fromArray(vectors, i * 3);
    const a = p.dot(e1) - mx;
    const b = p.dot(e2) - my;
    xx += (a * a) / count;
    yy += (b * b) / count;
    xy += (a * b) / count;
  }
  const half = (xx + yy) / 2;
  const root = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  return Math.sqrt(Math.max(0, half - root));
}

/**
 * Finds the bind facts of one ring: the crossings of the mesh edges with the plane of the ring,
 * normal to the bone, as `ringBind()` of `tools/arm-shape.ts` finds them.
 *
 * @param mesh The skin.
 * @param edges The two vertices of each edge of the mesh.
 * @param ring The ring.
 * @param head The bind head of the bone.
 * @param tail The bind head of the next bone.
 * @param joints The joints of the arm, from the upper arm out.
 * @returns The facts.
 */
function ringBind(
  mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights'>,
  edges: Uint32Array,
  ring: ArmRing,
  head: Vector3,
  tail: Vector3,
  joints: readonly number[],
): RingBind {
  const axis = tail.clone().sub(head);
  const length = axis.length();
  axis.normalize();
  const center = head.clone().addScaledVector(axis, ring.at * length);
  const a = new Vector3();
  const b = new Vector3();
  const found: { i: number; j: number; t: number; r: Vector3; arm: number }[] = [];
  for (let e = 0; e < edges.length; e += 2) {
    const i = edges[e] ?? 0;
    const j = edges[e + 1] ?? 0;
    const si = a
      .fromArray(mesh.positions, i * 3)
      .sub(center)
      .dot(axis);
    const sj = b
      .fromArray(mesh.positions, j * 3)
      .sub(center)
      .dot(axis);
    if (si * sj >= 0) {
      continue;
    }
    const t = si / (si - sj);
    const q = a.fromArray(mesh.positions, i * 3).lerp(b.fromArray(mesh.positions, j * 3), t);
    q.sub(center);
    const arm = (1 - t) * weightOn(mesh, i, joints) + t * weightOn(mesh, j, joints);
    if (arm >= RING_WEIGHT) {
      found.push({ i, j, t, r: q.clone().addScaledVector(axis, -q.dot(axis)), arm });
    }
  }
  const core = found.filter((f) => f.arm >= 0.5);
  const sorted = (core.length > 0 ? core : found)
    .map((f) => f.r.length())
    .toSorted((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const kept = found.filter((f) => f.r.length() <= RING_REACH * median);
  const radial = new Float32Array(kept.length * 3);
  for (const [k, f] of kept.entries()) {
    f.r.toArray(radial, k * 3);
  }
  return {
    ring,
    edges: Uint32Array.from(kept.flatMap((f) => [f.i, f.j])),
    along: Float32Array.from(kept.map((f) => f.t)),
    radial,
    narrow: narrowAxis(radial, axis),
  };
}

/**
 * Gives each edge of some faces one time.
 *
 * @param corners The three vertices of each triangle.
 * @param faces The faces, or `null` for all.
 * @returns The two vertices of each edge, the smaller index first.
 */
function faceEdges(corners: Uint32Array, faces: ReadonlySet<number> | null): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let f = 0; f < corners.length / 3; f++) {
    if (faces && !faces.has(f)) {
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const a = corners[f * 3 + k] ?? 0;
      const b = corners[f * 3 + ((k + 1) % 3)] ?? 0;
      const key = Math.min(a, b) * 0x10000 + Math.max(a, b);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(Math.min(a, b), Math.max(a, b));
      }
    }
  }
  return Uint32Array.from(out);
}

/**
 * Finds the bind facts of one arm.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @returns The facts.
 */
function armBind(rig: StudioRig, side: Side): ArmBind {
  const { mesh } = rig;
  const h = rig.body.heads;
  const joints = {
    shoulder: new Vector3(...h[`upper_arm_${side}`]),
    elbow: new Vector3(...h[`forearm_${side}`]),
    wrist: new Vector3(...h[`hand_${side}`]),
  };
  const bones = {
    chest: STUDIO_BONES.indexOf('chest'),
    upper: STUDIO_BONES.indexOf(`upper_arm_${side}`),
    fore: STUDIO_BONES.indexOf(`forearm_${side}`),
    hand: STUDIO_BONES.indexOf(`hand_${side}`),
  };
  const arm = armJoints(rig, side, false);
  const all = faceEdges(mesh.corners, null);
  const rings = ARM_RINGS.map((ring) =>
    ringBind(
      mesh,
      all,
      ring,
      ring.bone === 'upper' ? joints.shoulder : joints.elbow,
      ring.bone === 'upper' ? joints.elbow : joints.wrist,
      arm,
    ),
  );
  const faces = armFaces(mesh, armJoints(rig, side, true));
  const cornersOf = (set: ReadonlySet<number>): Uint32Array =>
    Uint32Array.from([...set].flatMap((f) => [0, 1, 2].map((k) => mesh.corners[f * 3 + k] ?? 0)));
  const corners = cornersOf(faces);
  const lowerJoints = [
    ...(['forearm', 'forearm_twist', 'hand', 'fingers'] as const).map(
      (bone): StudioBone => `${bone}_${side}`,
    ),
    ...sideSegmentBones(side, 'fore'),
  ].map((bone) => STUDIO_BONES.indexOf(bone));
  const lowerSet = armFaces(mesh, lowerJoints);
  const lower = cornersOf(lowerSet);
  return {
    bones,
    joints,
    rings,
    faces,
    corners,
    lower,
    lowerFaces: [...lowerSet],
    lengths: edgeLengths(mesh.positions, lower),
    upper: joints.elbow.distanceTo(joints.shoulder),
    grip: gripFrames(rig, side, joints),
  };
}

/** The down axis: each bone of each arm of the player points down in its bind pose. */
const DOWN = new Vector3(0, -1, 0);

/** The elbow axis of each arm of the player in its bind pose (`poseStudioBones()`). */
const PLAYER_HINGE = new Vector3(1, 0, 0);

/**
 * The palm of each hand of the player in its bind pose: inward, as `PALMS` of
 * `models/studio-rig.ts` gives it.
 */
const PLAYER_PALMS: Readonly<Record<Side, Vector3>> = {
  L: new Vector3(1, 0, 0),
  R: new Vector3(-1, 0, 0),
};

/** The arm constants of a rig that an older tree of a probe can give with no elbow axis. */
interface ArmHinge {
  /** The unit elbow axis of the bind pose of the studio. */
  readonly hinge?: Vec3;
}

/**
 * Gives the bind frames of the grip of one arm ({@link GripFrames}). A rig with no elbow axis
 * takes the axis of its bind arm: the upper arm × the forearm.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @param joints The bind heads of the shoulder, the elbow, and the wrist.
 * @returns The frames.
 */
function gripFrames(
  rig: StudioRig,
  side: Side,
  joints: Readonly<Record<'shoulder' | 'elbow' | 'wrist', Vector3>>,
): GripFrames {
  const fore = joints.wrist.clone().sub(joints.elbow);
  const given: ArmHinge = rig.arms[side];
  const hinge = given.hinge
    ? new Vector3(...given.hinge)
    : new Vector3().crossVectors(joints.elbow.clone().sub(joints.shoulder), fore);
  const h = rig.body.heads;
  const fingers = new Vector3(...h[`fingers_${side}`]).sub(new Vector3(...h[`hand_${side}`]));
  return {
    fore: frameTurn([DOWN, PLAYER_HINGE], [fore, hinge]),
    paw: frameTurn([DOWN, PLAYER_PALMS[side]], [fingers, new Vector3(...rig.body.palms[side])]),
  };
}

/**
 * Gives the turn from one frame of two axes to another: the first axis onto the first axis, and
 * the second axis, made normal to the first, onto the second.
 *
 * @param from The two axes of the first frame.
 * @param to The two axes of the second frame.
 * @returns The turn.
 */
function frameTurn(from: readonly [Vector3, Vector3], to: readonly [Vector3, Vector3]): Quaternion {
  const basis = ([a, b]: readonly [Vector3, Vector3]): Matrix4 => {
    const x = a.clone().normalize();
    const y = b.clone().addScaledVector(x, -b.dot(x)).normalize();
    return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
  };
  return new Quaternion().setFromRotationMatrix(basis(to).multiply(basis(from).transpose()));
}

/**
 * Gives the length of the three edges of each triangle, from each corner to the next.
 *
 * @param positions The places of the vertices.
 * @param corners The three vertices of each triangle.
 * @returns The lengths.
 */
function edgeLengths(positions: ArrayLike<number>, corners: Uint32Array): Float32Array {
  const lengths = new Float32Array(corners.length);
  const a = new Vector3();
  const b = new Vector3();
  for (let f = 0; f < corners.length / 3; f++) {
    for (let k = 0; k < 3; k++) {
      a.fromArray(positions, (corners[f * 3 + k] ?? 0) * 3);
      b.fromArray(positions, (corners[f * 3 + ((k + 1) % 3)] ?? 0) * 3);
      lengths[f * 3 + k] = a.distanceTo(b);
    }
  }
  return lengths;
}

/** The bind facts of the arms of each rig. */
const binds = new WeakMap<StudioRig, Readonly<Record<Side, ArmBind>>>();

/**
 * Gives the bind facts of both arms of a rig, made one time for each rig.
 *
 * @param rig The rig.
 * @returns The facts of each side.
 */
export function armBinds(rig: StudioRig): Readonly<Record<Side, ArmBind>> {
  let found = binds.get(rig);
  if (!found) {
    found = { L: armBind(rig, 'L'), R: armBind(rig, 'R') };
    binds.set(rig, found);
  }
  return found;
}

/**
 * Gives the vertices of the faces of one arm ({@link armFaces}), such as for the box of the arm in
 * a view.
 *
 * @param rig The studio rig.
 * @param side The side.
 * @returns The indices of the vertices.
 */
export function armVertices(rig: StudioRig, side: Side): number[] {
  return [...new Set(armBinds(rig)[side].corners)];
}

/**
 * Gives the turn of a bone from the skin matrices of a pose.
 *
 * @param matrices The skin matrices.
 * @param bone The index of the bone.
 * @returns The turn.
 */
function turnOf(matrices: ArrayLike<number>, bone: number): Quaternion {
  return new Quaternion().setFromRotationMatrix(matrixOf(matrices, bone));
}

/**
 * Gives the skin matrix of a bone.
 *
 * @param matrices The skin matrices.
 * @param bone The index of the bone.
 * @returns The matrix.
 */
function matrixOf(matrices: ArrayLike<number>, bone: number): Matrix4 {
  return new Matrix4().fromArray(
    Array.from({ length: 16 }, (...[, k]) => matrices[bone * 16 + k] ?? 0),
  );
}

/**
 * Wraps an angle into -180° to 180°.
 *
 * @param degrees The angle.
 * @returns The wrapped angle.
 */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/**
 * Gives the edge lengths of the faces of the forearm and the paw of one arm in a pose.
 *
 * @param arm The bind facts of the arm.
 * @param posed The posed places of the vertices.
 * @returns The length of the three edges of each face of {@link ArmBind.lower}.
 */
function lowerLengths(arm: ArmBind, posed: ArrayLike<number>): Float32Array {
  return edgeLengths(posed, arm.lower);
}

/** The posed joints and bone axes of one arm. */
interface ArmAxes {
  /** The posed shoulder joint. */
  readonly shoulder: Vector3;
  /** The posed elbow joint. */
  readonly elbow: Vector3;
  /** The unit axis from the shoulder to the elbow. */
  readonly upperAxis: Vector3;
  /** The unit axis from the elbow to the wrist. */
  readonly foreAxis: Vector3;
}

/**
 * Gives the posed joints and bone axes of one arm.
 *
 * @param arm The bind facts of the arm.
 * @param matrices The skin matrices of the pose.
 * @returns The joints and the axes.
 */
function armAxes(arm: ArmBind, matrices: ArrayLike<number>): ArmAxes {
  const place = (joint: Vector3, bone: number): Vector3 =>
    joint.clone().applyMatrix4(matrixOf(matrices, bone));
  const shoulder = place(arm.joints.shoulder, arm.bones.upper);
  const elbow = place(arm.joints.elbow, arm.bones.fore);
  const wrist = place(arm.joints.wrist, arm.bones.hand);
  return {
    shoulder,
    elbow,
    upperAxis: elbow.clone().sub(shoulder).normalize(),
    foreAxis: wrist.clone().sub(elbow).normalize(),
  };
}

/**
 * Gives the posed crossings of one ring, each as its part normal to the axis of its bone.
 *
 * @param ring The bind facts of the ring.
 * @param posed The posed places of the vertices.
 * @param origin The posed joint at the head of the bone of the ring.
 * @param axis The posed unit axis of the bone.
 * @returns The x, y, z of each crossing.
 */
function ringRadials(
  ring: RingBind,
  posed: ArrayLike<number>,
  origin: Vector3,
  axis: Vector3,
): Float64Array {
  const p = new Vector3();
  const q = new Vector3();
  const count = ring.along.length;
  const radials = new Float64Array(count * 3);
  for (let k = 0; k < count; k++) {
    p.fromArray(posed, (ring.edges[k * 2] ?? 0) * 3)
      .lerp(q.fromArray(posed, (ring.edges[k * 2 + 1] ?? 0) * 3), ring.along[k] ?? 0)
      .sub(origin);
    p.addScaledVector(axis, -p.dot(axis)).toArray(radials, k * 3);
  }
  return radials;
}

/**
 * Measures one arm of a posed body. The rolls of the rings of the upper arm are turns around the
 * posed axis against the chest swung onto the upper arm, and the rolls of the rings of the forearm
 * against the upper arm swung onto the forearm, as in `measureArm()` of `tools/arm-shape.ts`. The
 * twist is the largest step from the chest to the shoulder ring, between the rings of the upper
 * arm, from the elbow ring to the forearm ring (both against the upper arm bone), and between the
 * rings of the forearm.
 *
 * @param arm The bind facts of the arm.
 * @param matrices The skin matrices of the pose.
 * @param posed The posed places of the vertices.
 * @param folded The folded faces of the body.
 * @param rest The edge lengths of the faces of the forearm and the paw in the rest sample of the
 *   same body ({@link lowerLengths}), from which the stretch counts, or `null` for the bind.
 * @returns The values.
 */
export function measureArm(
  arm: ArmBind,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
  folded: readonly number[],
  rest: Float32Array | null,
): ArmSample {
  const chest = turnOf(matrices, arm.bones.chest);
  const upperTurn = turnOf(matrices, arm.bones.upper);
  const foreTurn = turnOf(matrices, arm.bones.fore);
  const { shoulder, elbow, upperAxis, foreAxis } = armAxes(arm, matrices);
  const upperBind = arm.joints.elbow.clone().sub(arm.joints.shoulder).normalize();
  const foreBind = arm.joints.wrist.clone().sub(arm.joints.elbow).normalize();
  const upperFrame = new Quaternion()
    .setFromUnitVectors(upperBind.clone().applyQuaternion(chest), upperAxis)
    .multiply(chest);
  const foreFrame = new Quaternion()
    .setFromUnitVectors(foreBind.clone().applyQuaternion(upperTurn), foreAxis)
    .multiply(upperTurn);
  const boneRoll =
    (twistAngle(upperFrame.clone().invert().multiply(upperTurn), upperBind) * 180) / Math.PI;

  const rolls: number[] = [];
  let flat = Infinity;
  const r = new Vector3();
  const ref = new Vector3();
  const cross = new Vector3();
  for (const ring of arm.rings) {
    const upper = ring.ring.bone === 'upper';
    const frame = upper ? upperFrame : foreFrame;
    const axis = upper ? upperAxis : foreAxis;
    const radials = ringRadials(ring, posed, upper ? shoulder : elbow, axis);
    const count = ring.along.length;
    let sin = 0;
    let cos = 0;
    for (let k = 0; k < count; k++) {
      r.fromArray(radials, k * 3);
      ref.fromArray(ring.radial, k * 3).applyQuaternion(frame);
      const angle = Math.atan2(cross.crossVectors(ref, r).dot(axis), ref.dot(r));
      sin += ref.length() * Math.sin(angle);
      cos += ref.length() * Math.cos(angle);
    }
    rolls.push(count > 0 ? (Math.atan2(sin, cos) * 180) / Math.PI : 0);
    if (ring.narrow > 0 && count > 2) {
      flat = Math.min(flat, narrowAxis(Float32Array.from(radials), axis) / ring.narrow);
    }
  }
  const [shoulderRoll = 0, upperRoll = 0, elbowRoll = 0, foreRoll = 0, wristRoll = 0] = rolls;
  const step = (from: number, to: number): number => Math.abs(wrap(to - from));
  const twist = Math.max(
    step(0, shoulderRoll),
    step(shoulderRoll, upperRoll),
    step(upperRoll, elbowRoll),
  );
  const foreTwist = Math.max(step(elbowRoll - boneRoll, foreRoll), step(foreRoll, wristRoll));

  const paw = foreTurn.clone().invert().multiply(turnOf(matrices, arm.bones.hand));
  const pawTwist = twistAngle(paw, foreBind);
  const swing = paw.clone().multiply(new Quaternion().setFromAxisAngle(foreBind, -pawTwist));
  const pawSwing = (2 * Math.acos(Math.min(1, Math.abs(swing.w))) * 180) / Math.PI;
  // The paw in the frame of the posed forearm: the frame of the player on both sides.
  const grip = arm.grip.fore.clone().invert().multiply(paw).multiply(arm.grip.paw);

  const posedLengths = lowerLengths(arm, posed);
  const reference = rest ?? arm.lengths;
  let stretch = 0;
  for (let k = 0; k < arm.lengths.length; k++) {
    stretch = Math.max(stretch, (posedLengths[k] ?? 0) - (reference[k] ?? 0));
  }
  return {
    folds: folded.filter((face) => arm.faces.has(face)).length,
    twist,
    foreTwist,
    flat: Number.isFinite(flat) ? flat : 1,
    pawTwist: Math.abs((pawTwist * 180) / Math.PI),
    pawSwing,
    pawJump: 0,
    grip: 0,
    stretch: stretch / arm.upper,
    moveTwist: 0,
    moveTurn: 0,
    pawRoll: (pawTwist * 180) / Math.PI,
    gripRoll: (twistAngle(grip, DOWN) * 180) / Math.PI,
  };
}

/** The summary of the values of one measure of one arm in one sample set. */
export interface SetStats {
  /** The number of samples. */
  readonly samples: number;
  /** The median. */
  readonly p50: number;
  /** The 95th percentile. */
  readonly p95: number;
  /** The 5th percentile. */
  readonly p5: number;
  /** The share of the samples with a value above 0, for a count of faces. */
  readonly share: number;
  /** The worst value: the largest, or the smallest for a measure whose smaller values are worse. */
  readonly worst: number;
  /** The demo and the time of the worst value. */
  readonly at: string;
  /**
   * The demo and the time of the worst play sample at or after {@link VIEW_FROM_SEC}, for
   * `--views`, or empty when the play has no such sample.
   */
  readonly view: string;
}

/**
 * Gives a quantile of some values.
 *
 * @param sorted The values, sorted up.
 * @param share The share, from 0 to 1.
 * @returns The value at the share, or `NaN` with no value.
 */
function quantile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? Number.NaN;
}

/**
 * Gives the median of some angles, measured from their circular mean, so that a paw near 180° does
 * not split into two ends of the range.
 *
 * @param angles The angles, in degrees.
 * @returns The median in -180° to 180°, or `null` with no angle.
 */
export function angleMedian(angles: readonly number[]): number | null {
  if (angles.length === 0) {
    return null;
  }

  let x = 0;
  let y = 0;
  for (const angle of angles) {
    x += Math.cos((angle * Math.PI) / 180);
    y += Math.sin((angle * Math.PI) / 180);
  }
  const mean = (Math.atan2(y, x) * 180) / Math.PI;
  const offsets = angles.map((angle) => wrap(angle - mean)).toSorted((p, q) => p - q);

  return wrap(mean + quantile(offsets, 0.5));
}

/**
 * Gives the song time of a play label, such as `beethoven-9.mid 12.25 s`.
 *
 * @param label The label of a sample.
 * @returns The song time, in seconds, or `null` for a label of the rest or the lift.
 */
export function labelTime(label: string): number | null {
  const found = /^\S+\.mid (-?\d+(?:\.\d+)?) s$/.exec(label);
  return found ? Number(found[1]) : null;
}

/**
 * Sums up the values of one measure in one sample set.
 *
 * @param values The value of each sample.
 * @param labels The label of each sample.
 * @param up True when a larger value is worse.
 * @returns The summary.
 */
export function setStats(
  values: readonly number[],
  labels: readonly string[],
  up: boolean,
): SetStats {
  const sorted = values.toSorted((x, y) => x - y);
  let worstAt = -1;
  let viewAt = -1;
  for (const [i, value] of values.entries()) {
    const better = (k: number): boolean =>
      k < 0 || (up ? value > (values[k] ?? 0) : value < (values[k] ?? 0));
    if (better(worstAt)) {
      worstAt = i;
    }
    const time = labelTime(labels[i] ?? '');
    if (time !== null && time >= VIEW_FROM_SEC && better(viewAt)) {
      viewAt = i;
    }
  }
  return {
    samples: values.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p5: quantile(sorted, 0.05),
    share: values.filter((value) => value > 0).length / Math.max(1, values.length),
    worst: values[worstAt] ?? Number.NaN,
    at: labels[worstAt] ?? '',
    view: labels[viewAt] ?? '',
  };
}

/** The summaries of one arm: by measure, then by sample set. */
export type ArmStats = Readonly<Record<Measure, Partial<Record<GateSet, SetStats>>>>;

/** The report of one role. */
export interface RoleReport {
  /** The demos with the role. */
  readonly demos: readonly string[];
  /** The summaries of each arm. */
  readonly arms: Readonly<Record<Side, ArmStats>>;
  /**
   * The median grip of each arm in the play ({@link angleMedian}, {@link GripFrames}), in whole
   * degrees, with the sign of the right arm turned, as an entry of {@link ACCEPTED_GRIPS} gives it.
   * A role with no play sample and a JSON text before format 3 have none.
   */
  readonly grips?: Readonly<Record<Side, number>>;
  /**
   * The key of the bind of the bodies of the role ({@link bindKey}). A JSON text before format 5
   * has none.
   */
  readonly bind?: string;
  /**
   * The narrow axis of each ring of {@link REBIND_RINGS} of each arm, in meters: the 5th
   * percentile of the worst sample set of the rest, the play, and the lift. A JSON text before
   * format 5 has none.
   */
  readonly rings?: Readonly<Record<Side, Readonly<Record<RebindRing, number>>>>;
}

/** The JSON text of a run of the tool for one tree (`--json`). */
export interface ArmJson {
  /** The format version (`probeFormat()` of `tools/ref-tree.ts`). */
  readonly version: number;
  /** The oldest version that this version only adds fields to. */
  readonly since: number;
  /** The report of each role. */
  readonly roles: Readonly<Partial<Record<string, RoleReport>>>;
  /** The roles that the tree does not have. */
  readonly missing: readonly string[];
}

/**
 * The format version of {@link ArmJson}. Version 4 gives the grips in the frame of the posed
 * forearm ({@link GripFrames}), so it changes the grips of the older versions. Version 5 adds the
 * key of the bind and the ring widths of each role ({@link RoleReport.bind}).
 */
export const ARM_FORMAT = 5;

/** The oldest format version that {@link ARM_FORMAT} only adds fields to. */
const ARM_SINCE = 4;

/** The values and the labels of the samples of one role, by sample set. */
interface Samples {
  /** The label of each sample. */
  readonly labels: string[];
  /** The values of each arm, one list for each measure. */
  readonly values: Readonly<Record<Side, Readonly<Record<Measure, number[]>>>>;
}

/**
 * Makes the store of the samples of one sample set.
 *
 * @returns The empty store.
 */
function emptySamples(): Samples {
  const lists = (): Readonly<Record<Measure, number[]>> => ({
    folds: [],
    twist: [],
    foreTwist: [],
    flat: [],
    pawTwist: [],
    pawSwing: [],
    pawJump: [],
    grip: [],
    stretch: [],
    moveTwist: [],
    moveTurn: [],
  });
  return { labels: [], values: { L: lists(), R: lists() } };
}

/**
 * Gives the labels of the samples of `probeFolds()` for a tree whose fold visit gives no label:
 * the rest, each play time from the count-in at the step, and the lift times of 0.1 s.
 *
 * @param role The role.
 * @param demo The demo.
 * @param step The step of the play, in seconds.
 * @returns A function that gives the label of the visit of a sample set, by its index.
 */
function planLabels(
  role: RoleSource,
  demo: DemoFile,
  step: number,
): (set: SampleSet, index: number) => string {
  const scene = roleScene(role, demo.bytes);
  const bodies = Math.max(1, roleBodies(role, scene).length);
  const start = -countInAt(scene.plan.beats, 0).lengthSec;
  return (set, index) => {
    const k = Math.floor(index / bodies);
    if (set === 'rest') {
      return `${demo.file} rest`;
    }
    return set === 'play'
      ? `${demo.file} ${(start + k * step).toFixed(2)} s`
      : `${demo.file} wall ${(k * 0.1).toFixed(1)} s`;
  };
}

/**
 * Tells if a measure is a measure of the moves ({@link MOVE_MEASURES}).
 *
 * @param measure The measure.
 * @returns True for a measure of the moves.
 */
function isMoveMeasure(measure: Measure): boolean {
  return MOVE_MEASURES.some((m) => m === measure);
}

/** The step of the wall time of the samples of the moves, in seconds. */
export const MOVE_STEP = 0.01;

/** The number of pause points of each demo with a lowering and a lift in the moves. */
export const MOVE_PAUSES = 2;

/** One move of {@link probeMoves}: a lift or a lowering at a song time. */
interface Move {
  /** The kind of the move. */
  readonly kind: 'lift' | 'lower';
  /** The song time of the pause point: 0 for the lift at the song start. */
  readonly at: number;
}

/**
 * Gives the moves of a demo: the lift at the song start, a lowering and a lift at each of
 * {@link MOVE_PAUSES} pause points, and the lowering at the song end.
 *
 * @param duration The song length, in seconds.
 * @returns The moves.
 */
export function demoMoves(duration: number): Move[] {
  const points = Array.from(
    { length: MOVE_PAUSES },
    (...[, k]) => ((k + 1) * duration) / (MOVE_PAUSES + 1),
  );
  return [
    { kind: 'lift', at: 0 },
    ...points.flatMap((at): Move[] => [
      { kind: 'lower', at },
      { kind: 'lift', at },
    ]),
    { kind: 'lower', at: duration },
  ];
}

/**
 * Samples the lifts and the lowerings of the studio body of a role at steps of {@link MOVE_STEP}
 * ({@link demoMoves}). A lift starts from the rest pose and takes the time of its seeded motion,
 * with no count-in limit, as the set `lift` of `probeFolds()`: a short count-in only makes it
 * faster. A lowering starts from the play pose at its pause point, after the hold. Each sample of
 * each arm gives two values: `moveTwist`, the size of the paw twist on the forearm that the twist
 * bone and the segments of the forearm share ({@link sharedTwist}), and
 * `moveTurn`, the turn rate of the wrist from the sample before, in degrees per second: the
 * larger turn of the twist bone of the forearm on the forearm and of the paw on the twist bone. A
 * shared twist past 180° makes the twist bone, which takes half of it, jump by 180°.
 *
 * @param role The role.
 * @param demos The demos. A demo with no body of the role adds nothing.
 * @returns The samples of the set `move`.
 */
export function probeMoves(role: RoleSource, demos: readonly DemoFile[]): Samples {
  const store = emptySamples();
  const studio = createStudioPose();
  for (const demo of demos) {
    const scene = roleScene(role, demo.bytes);
    const bodies = roleBodies(role, scene);
    if (bodies.length === 0) {
      continue;
    }
    const audible = allAudible(scene.score);
    const buffer = createScenePose(scene.plan);
    for (const move of demoMoves(scene.score.durationSec)) {
      const lead = countInAt(scene.plan.beats, move.at).lengthSec;
      const transport: Transport =
        move.kind === 'lift'
          ? { ...PLAYING, changedAtWall: 10, startSec: move.at }
          : { ...PLAYING, playing: false, changedAtWall: 10, before: PLAYING };
      const span = move.kind === 'lift' ? LIFT_FIT_SEC : transport.holdSec + LOWER_MAX_SEC;
      const from = move.kind === 'lift' ? 0 : transport.holdSec;
      const count = Math.round((span - from) / MOVE_STEP) + 1;
      const last = new Map<string, readonly Quaternion[]>();
      for (let k = 0; k < count; k++) {
        const wall = from + k * MOVE_STEP;
        const song = move.kind === 'lift' ? Math.min(move.at, move.at - lead + wall) : move.at;
        const frame = poseAt(scene.plan, song, 10 + wall, transport, audible, buffer);
        for (const { index, model } of bodies) {
          const pose = index === null ? frame.conductor : frame.players[index];
          if (!pose) {
            continue;
          }
          const rig = model.studio;
          poseStudioBones(rig, model.skeleton, pose.rotations, studioOffsets(pose), 1, studio);
          const who = bodies.length > 1 ? ` player ${index ?? ''}` : '';
          store.labels.push(
            `${demo.file}${who} ${move.kind} ${move.at.toFixed(2)} s, wall ${(wall - from).toFixed(2)} s`,
          );
          const arms = armBinds(rig);
          for (const side of SIDES) {
            const arm = arms[side];
            const fore = turnOf(studio.matrices, arm.bones.fore);
            const twist = turnOf(studio.matrices, STUDIO_BONES.indexOf(`forearm_twist_${side}`));
            const hand = turnOf(studio.matrices, arm.bones.hand);
            const foreBind = arm.joints.wrist.clone().sub(arm.joints.elbow).normalize();
            const paw = fore.clone().invert().multiply(hand);
            const turns = [
              fore.clone().invert().multiply(twist),
              twist.clone().invert().multiply(hand),
            ];
            const key = `${index ?? ''} ${side}`;
            const before = last.get(key);
            last.set(key, turns);
            const rate = before
              ? Math.max(...turns.map((turn, j) => turnDegrees(turn, before[j] ?? turn))) /
                MOVE_STEP
              : 0;
            const values = store.values[side];
            // The twist that the twist bone and the segments of the forearm share.
            // SAFETY: only the pose of an older tree has `twistFadeL`, so the field can be missing.
            const fade = side === 'L' ? ((pose as UnwindPose).twistFadeL ?? 0) : 0;
            const shared = sharedTwist(twistAngle(paw, foreBind), fade);
            values.moveTwist.push(Math.abs((shared * 180) / Math.PI));
            values.moveTurn.push(rate);
          }
        }
      }
    }
  }
  return store;
}

/**
 * Gives the angle between two turns, in degrees. A quaternion and its negative give one turn.
 *
 * @param a The first turn.
 * @param b The second turn.
 * @returns The angle, from 0° to 180°.
 */
function turnDegrees(a: Quaternion, b: Quaternion): number {
  return (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;
}

/** The key of the bind of each studio rig that {@link bindKey} gave. */
const bindKeys = new WeakMap<StudioRig, string>();

/**
 * Gives the key of the bind of the arms of a studio body: a hash of the bind heads of the arm
 * bones ({@link BIND_BONES}) from the clavicle, the palms, and the elbow axes
 * (`StudioBody.hinges`), each rounded to 1e-5. Two bodies with one key bind their arms in one
 * pose, so the values of {@link BIND_MEASURES} count from one zero. A move of the whole body, such
 * as a new seat, keeps the key.
 *
 * @param rig The studio rig.
 * @returns The first 12 hex digits of the SHA-256 of the bind data.
 */
export function bindKey(rig: StudioRig): string {
  const found = bindKeys.get(rig);
  if (found !== undefined) {
    return found;
  }
  const body = rig.body;
  const round = (value: number): number => Math.round(value * 1e5) / 1e5;
  const arms = SIDES.map((side) => {
    const root = body.heads[`clavicle_${side}`];
    const heads = BIND_BONES.map((bone) =>
      body.heads[`${bone}_${side}`].map((value, i) => round(value - (root[i] ?? 0))),
    );
    const hinge = body.hinges?.[side].map(round) ?? null;
    return { heads, palm: body.palms[side].map(round), hinge };
  });
  const key = createHash('sha256').update(JSON.stringify(arms)).digest('hex').slice(0, 12);
  bindKeys.set(rig, key);
  return key;
}

/**
 * Tells if the bodies of a role bind their arms in another pose than the bodies of the base: both
 * reports have a key of the bind ({@link bindKey}), and the keys differ.
 *
 * @param tree The report of the working tree.
 * @param base The report of the base, or `null` with no base.
 * @returns True for a rebind.
 */
export function isRebind(tree: RoleReport, base: RoleReport | null): boolean {
  return (
    base !== null && tree.bind !== undefined && base.bind !== undefined && tree.bind !== base.bind
  );
}

/**
 * Measures the arms of the studio body of a role over demos.
 *
 * @param role The role.
 * @param demos The demos. A demo with no body of the role adds nothing.
 * @param step The step of the song time of the play, in seconds.
 * @param grips The accepted grip of each arm ({@link ACCEPTED_GRIPS}), or `null` for none.
 * @returns The report.
 */
export function probeRole(
  role: RoleSource,
  demos: readonly DemoFile[],
  step: number,
  grips: Readonly<Record<Side, number>> | null,
): RoleReport {
  const sets: Record<SampleSet, Samples> = {
    rest: emptySamples(),
    play: emptySamples(),
    lift: emptySamples(),
  };
  const found: string[] = [];
  const rolls: Record<Side, number[]> = { L: [], R: [] };
  const keys = new Set<string>();
  const ringAt = REBIND_RINGS.map((name) => ARM_RINGS.findIndex((ring) => ring.name === name));
  const widths = (): Record<Side, number[][]> => ({
    L: REBIND_RINGS.map(() => []),
    R: REBIND_RINGS.map(() => []),
  });
  const narrows: Record<SampleSet, Record<Side, number[][]>> = {
    rest: widths(),
    play: widths(),
    lift: widths(),
  };
  for (const demo of demos) {
    const counts: Record<SampleSet, number> = { rest: 0, play: 0, lift: 0 };
    const none = (): Record<Side, number | null> => ({ L: null, R: null });
    const last: Record<SampleSet, Record<Side, number | null>> = {
      rest: none(),
      play: none(),
      lift: none(),
    };
    const rests: Record<Side, Float32Array | null> = { L: null, R: null };
    let plan: ((set: SampleSet, index: number) => string) | null = null;
    const report = probeFolds(role, [demo], step, (...visit) => {
      const [rig, studio, posed, folded, set] = visit;
      // A tree before the label of the visit passes five arguments.
      const given: string | undefined = visit[5];
      plan ??= given === undefined ? planLabels(role, demo, step) : null;
      const label = given ?? plan?.(set, counts[set]) ?? '';
      counts[set] += 1;
      const arms = armBinds(rig);
      keys.add(bindKey(rig));
      const store = sets[set];
      store.labels.push(label);
      for (const side of SIDES) {
        // The rest sample of a demo comes first, and the stretch counts from it.
        if (set === 'rest') {
          rests[side] = lowerLengths(arms[side], posed);
        }
        const ringWidths = ringNarrows(arms[side], studio.matrices, posed);
        for (const [k, at] of ringAt.entries()) {
          const width = ringWidths[at] ?? Number.NaN;
          if (Number.isFinite(width)) {
            narrows[set][side][k]?.push(width);
          }
        }
        const sample = measureArm(arms[side], studio.matrices, posed, folded, rests[side]);
        const values = store.values[side];
        for (const measure of MEASURES) {
          if (measure !== 'pawJump' && measure !== 'grip' && !isMoveMeasure(measure)) {
            values[measure].push(sample[measure]);
          }
        }
        const before = set === 'rest' ? null : last[set][side];
        const jump = before === null ? 0 : Math.abs(wrap(sample.pawRoll - before));
        values.pawJump.push(jump > JUMP_ANGLE ? jump : 0);
        last[set][side] = sample.pawRoll;
        const signed = side === 'R' ? -sample.gripRoll : sample.gripRoll;
        if (set === 'play') {
          rolls[side].push(signed);
        }
        const grip = grips?.[side];
        if (grip !== undefined && set === 'play') {
          values.grip.push(Math.abs(wrap(signed - grip)));
        }
      }
    });
    found.push(...report.demos);
  }
  const all: Record<GateSet, Samples> = { ...sets, move: probeMoves(role, demos) };
  const armStats = (side: Side): ArmStats => {
    const of = (measure: Measure): Partial<Record<GateSet, SetStats>> =>
      Object.fromEntries(
        GATE_SETS.filter((set) => all[set].labels.length > 0).map((set) => [
          set,
          setStats(all[set].values[side][measure], all[set].labels, ARM_LIMITS[measure].up),
        ]),
      );
    return {
      folds: of('folds'),
      twist: of('twist'),
      foreTwist: of('foreTwist'),
      flat: of('flat'),
      pawTwist: of('pawTwist'),
      pawSwing: of('pawSwing'),
      pawJump: of('pawJump'),
      stretch: of('stretch'),
      grip: of('grip'),
      moveTwist: of('moveTwist'),
      moveTurn: of('moveTurn'),
    };
  };
  // The narrowest ring of each arm: the 5th percentile of the worst sample set.
  const ringWidth = (side: Side, k: number): number =>
    Math.min(
      ...SAMPLE_SETS.map((set) => {
        const sorted = (narrows[set][side][k] ?? []).toSorted((a, b) => a - b);
        return sorted.length > 0 ? quantile(sorted, 0.05) : Infinity;
      }),
    );
  const ringsOf = (side: Side): Readonly<Record<RebindRing, number>> => ({
    elbow: ringWidth(side, REBIND_RINGS.indexOf('elbow')),
    wrist: ringWidth(side, REBIND_RINGS.indexOf('wrist')),
  });
  const report: RoleReport = {
    demos: found,
    arms: { L: armStats('L'), R: armStats('R') },
    bind: [...keys].toSorted().join(' '),
    rings: { L: ringsOf('L'), R: ringsOf('R') },
  };
  const medians = { L: angleMedian(rolls.L), R: angleMedian(rolls.R) };
  if (medians.L === null || medians.R === null) {
    return report;
  }
  return { ...report, grips: { L: Math.round(medians.L), R: Math.round(medians.R) } };
}

/**
 * Gives a ready entry of {@link ACCEPTED_GRIPS} for each role that has none: the median grip of
 * each arm in the play ({@link GripFrames}), as the line of the map.
 *
 * @param reports The report of each role.
 * @returns The lines, empty when each role has an entry or no play sample.
 */
export function gripLines(
  reports: readonly { readonly role: string; readonly tree: RoleReport | null }[],
): string[] {
  const lines = reports.flatMap(({ role, tree }) =>
    tree?.grips && !ACCEPTED_GRIPS.has(role)
      ? [`  ['${role}', { L: ${tree.grips.L}, R: ${tree.grips.R} }],`]
      : [],
  );
  if (lines.length === 0) {
    return [];
  }
  return [
    'The roles below have no entry in ACCEPTED_GRIPS. A ready entry from the median grip of each arm in the play, in the frame of the posed forearm:',
    '',
    ...lines,
  ];
}

/**
 * Gives the value of the gate of one measure of one arm: the value of {@link ArmLimit.stat} of
 * the worst sample set, with the set.
 *
 * @param stats The summaries of the measure by sample set.
 * @param limit The limit of the measure.
 * @returns The value and the set, or `null` with no sample.
 */
export function gateValue(
  stats: Partial<Record<GateSet, SetStats>>,
  limit: ArmLimit,
): { readonly value: number; readonly set: GateSet } | null {
  let found: { readonly value: number; readonly set: GateSet } | null = null;
  for (const set of GATE_SETS) {
    const of = stats[set];
    if (!of || of.samples === 0) {
      continue;
    }
    const value = of[limit.stat];
    if (!found || (limit.up ? value > found.value : value < found.value)) {
      found = { value, set };
    }
  }
  return found;
}

/** The verdict of one value of the gate. */
export type Verdict = 'PASS' | 'OPEN' | 'REBIND' | 'FAIL';

/**
 * Gives the verdict of one value against its limit and the base. A value that is worse than the
 * base by more than the margin fails, also within its limit, because a goal on one measure can
 * move a twist to a joint that no goal measures. A value over its limit fails when the base has no
 * value or is within the limit, and else it is open: a known item that the change does not make
 * worse. Each other value passes. A value that counts from another bind than its base
 * (`rebind`) takes only its limit: it fails over the limit, and is `REBIND` when the margin alone
 * would fail it.
 *
 * @param value The value of the working tree.
 * @param base The value of the base, or `null` with no base.
 * @param limit The limit.
 * @param rebind True for a value of {@link BIND_MEASURES} of a rebind ({@link isRebind}).
 * @returns The verdict.
 */
export function verdictOf(
  value: number,
  base: number | null,
  limit: ArmLimit,
  rebind = false,
): Verdict {
  const over = (v: number): boolean => (limit.up ? v > limit.limit : v < limit.limit);
  const worse = base !== null && (limit.up ? value - base : base - value) > limit.margin;
  if (rebind) {
    if (over(value)) {
      return 'FAIL';
    }
    return worse ? 'REBIND' : 'PASS';
  }
  if (worse || (over(value) && (base === null || !over(base)))) {
    return 'FAIL';
  }
  return over(value) ? 'OPEN' : 'PASS';
}

/** One value of the gate: one measure of one arm of one role. */
export interface GateRow {
  /** The role. */
  readonly role: string;
  /** The arm. */
  readonly side: Side;
  /** The measure. */
  readonly measure: Measure;
  /** The worst sample set. */
  readonly set: GateSet;
  /** The summary of the worst sample set. */
  readonly stats: SetStats;
  /** The value of the gate. */
  readonly value: number;
  /** The value of the gate of the base, or `null` with no base. */
  readonly base: number | null;
  /** The verdict. */
  readonly verdict: Verdict;
}

/**
 * Gives the values of the gate of one role.
 *
 * @param role The role.
 * @param tree The report of the working tree.
 * @param base The report of the base, or `null` with no base or when the base has no such role.
 * @returns The values, by arm and measure.
 */
export function gateRows(role: string, tree: RoleReport, base: RoleReport | null): GateRow[] {
  const rebind = isRebind(tree, base);
  const fromBind = (measure: Measure): boolean => BIND_MEASURES.some((m) => m === measure);
  return SIDES.flatMap((side) =>
    MEASURES.flatMap((measure): GateRow[] => {
      const limit = ARM_LIMITS[measure];
      const stats = tree.arms[side][measure];
      const found = gateValue(stats, limit);
      const of = found ? stats[found.set] : undefined;
      if (!found || !of) {
        return [];
      }
      // A JSON text of a tool before a measure has no stats of it.
      const baseStats: ArmStats[Measure] | undefined = base?.arms[side][measure];
      const before = baseStats ? gateValue(baseStats, limit) : null;
      const value = found.value;
      const baseValue = before?.value ?? null;
      const verdict = verdictOf(value, baseValue, limit, rebind && fromBind(measure));
      return [{ role, side, measure, set: found.set, stats: of, value, base: baseValue, verdict }];
    }),
  );
}

/**
 * Writes a number of a measure.
 *
 * @param value The value.
 * @param measure The measure.
 * @returns The text: a share as a percent for a count measure, else the digits of the limit.
 */
function show(value: number | null, measure: Measure): string {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  const limit = ARM_LIMITS[measure];
  return limit.stat === 'share' ? `${(100 * value).toFixed(1)}%` : value.toFixed(limit.digits);
}

/**
 * Writes the table of the gate: one row for each arm of each role, with the value of each
 * measure, its base in parentheses, and the mark of a value that does not pass.
 *
 * @param rows The values of the gate.
 * @param base True when the run has a base.
 * @returns The lines of the table.
 */
export function summaryLines(rows: readonly GateRow[], base: boolean): string[] {
  const head = MEASURES.map((m) => `${ARM_LIMITS[m].name} (${show(ARM_LIMITS[m].limit, m)})`);
  const lines = [
    `| Role | Arm | ${head.join(' | ')} | Verdict |`,
    `|---|---|${MEASURES.map(() => '---').join('|')}|---|`,
  ];
  const keys = [...new Set(rows.map((row) => `${row.role} ${row.side}`))];
  for (const key of keys) {
    const own = rows.filter((row) => `${row.role} ${row.side}` === key);
    const cells = MEASURES.map((measure) => {
      const row = own.find((r) => r.measure === measure);
      if (!row) {
        return '-';
      }
      const was = base ? ` (${show(row.base, measure)})` : '';
      const mark = row.verdict === 'PASS' ? '' : ` ${row.verdict}`;
      return `${show(row.value, measure)}${was}${mark}`;
    });
    const worst =
      (['FAIL', 'OPEN', 'REBIND'] as const).find((v) => own.some((r) => r.verdict === v)) ?? 'PASS';
    const [role = '', side = ''] = key.split(' ');
    lines.push(`| ${role} | ${side} | ${cells.join(' | ')} | ${worst} |`);
  }
  return lines;
}

/**
 * Writes the lines of the roles whose bodies bind their arms in another pose than the base
 * ({@link isRebind}): the keys of the binds, and the narrow axis of the elbow ring and the wrist
 * ring of each arm in centimeters, with the base in parentheses. The flat share of a rebind
 * counts from another bind ring, so these widths compare the skin in place of it.
 *
 * @param reports The reports of each role.
 * @returns The lines, empty with no rebind.
 */
export function rebindLines(
  reports: readonly {
    readonly role: string;
    readonly tree: RoleReport | null;
    readonly base: RoleReport | null;
  }[],
): string[] {
  // A width with no sample is Infinity, which the JSON text of a child holds as null.
  const inCm = (value: number | undefined): string =>
    Number.isFinite(value) ? (100 * (value ?? 0)).toFixed(2) : '-';
  const rows = reports.flatMap(({ role, tree, base }) =>
    tree && isRebind(tree, base)
      ? SIDES.map((side) => {
          const cells = REBIND_RINGS.map(
            (ring) => `${inCm(tree.rings?.[side][ring])} (${inCm(base?.rings?.[side][ring])})`,
          );
          return `| ${role} | ${side} | ${tree.bind ?? '-'} (${base?.bind ?? '-'}) | ${cells.join(' | ')} |`;
        })
      : [],
  );
  if (rows.length === 0) {
    return [];
  }
  return [
    `The bodies of the roles below bind their arms in another pose than the base. Each value of ${BIND_MEASURES.map((m) => ARM_LIMITS[m].name).join(', ')} takes only its limit, and REBIND marks a value that the margin alone fails. The narrow axis p5 of the elbow ring and the wrist ring, in cm with the base in parentheses, compares the skin in place of the flat share:`,
    '',
    `| Role | Arm | Bind (base) | ${REBIND_RINGS.map((ring) => `${ring} cm`).join(' | ')} |`,
    `|---|---|---|${REBIND_RINGS.map(() => '---:').join('|')}|`,
    ...rows,
  ];
}

/**
 * Writes the table of the gate of several variants ({@link summaryLines}), with a column of the
 * name of the variant: one block of rows for each variant, in the order of the variants.
 *
 * @param blocks The name and the values of the gate of each variant.
 * @param base True when the run has a base.
 * @returns The lines of the table.
 */
export function variantLines(
  blocks: readonly { readonly name: string; readonly rows: readonly GateRow[] }[],
  base: boolean,
): string[] {
  const [head = '', rule = ''] = summaryLines([], base);
  return [
    `| Variant ${head}`,
    `|---${rule}`,
    ...blocks.flatMap(({ name, rows }) =>
      summaryLines(rows, base)
        .slice(2)
        .map((line) => `| ${name} ${line}`),
    ),
  ];
}

/**
 * Writes the table of the details: the set, p50, p95 (p5 for the flat share), the worst sample,
 * the limit, the base, and the verdict of each value.
 *
 * @param rows The values to write.
 * @returns The lines of the table.
 */
export function detailLines(rows: readonly GateRow[]): string[] {
  const lines = [
    '| Role | Arm | Measure | Set | Samples | p50 | p95 or p5 | Share > 0 | Worst (demo, time) | Value | Limit | Base | Verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const limit = ARM_LIMITS[row.measure];
    const raw = (value: number): string =>
      Number.isFinite(value) ? value.toFixed(limit.stat === 'share' ? 0 : limit.digits) : '-';
    const tail = limit.up ? row.stats.p95 : row.stats.p5;
    lines.push(
      `| ${row.role} | ${row.side} | ${limit.name} | ${row.set} | ${row.stats.samples} | ${raw(row.stats.p50)} | ${raw(tail)} | ${(100 * row.stats.share).toFixed(1)}% | ${raw(row.stats.worst)} at ${row.stats.at || '-'} | ${show(row.value, row.measure)} | ${show(limit.limit, row.measure)} | ${show(row.base, row.measure)} | ${row.verdict} |`,
    );
  }
  return lines;
}

/** The command line of the tool. */
export interface CheckArgs {
  /** The roles. */
  readonly roles: readonly string[];
  /** The commit, the branch, or the tag of the base, or `null`. */
  readonly base: string | null;
  /** The options that both trees take: `--demo`, `--midi`, and `--step`. */
  readonly shared: readonly string[];
  /** The absolute paths of the MIDI files of the user of `--midi`. */
  readonly midi: readonly string[];
  /** The options that only the working tree takes: `--set` and `--glb`. */
  readonly own: readonly string[];
  /** The variants of `--variant`, or empty for a run with one variant ({@link variantGroups}). */
  readonly variants: readonly ArmVariant[];
  /** The folder of `--views`, or `null`. */
  readonly views: string | null;
  /** True to render each arm with `--views`, also an arm that passes. */
  readonly viewsAll: boolean;
  /** The number of roles that run at the same time. */
  readonly jobs: number;
  /** True to write the details of each value, also of a value that passes. */
  readonly long: boolean;
  /** The range of `--trace`, or `null` for the gate. */
  readonly trace: TraceRange | null;
  /** The step of `--step`, in seconds, or `null` for the default step of the run. */
  readonly step: number | null;
  /** The commits of `--states`, each a column of one table, or empty for the gate. */
  readonly states: readonly string[];
  /** The measure of `--explain`, or `null` for the gate. */
  readonly explain: Explained | null;
}

/** The usage text. */
const USAGE =
  'Usage: pnpm arm-check <role>... | --all [--base <ref>] [--set <changes>]... [--variant <name> [--set <changes>]...]... [--glb <file>] [--views <dir> [--views-all]] [--demo <id>]... [--midi <path>]... [--step <seconds>] [--jobs <n>] [--long] [--states <ref>,...], or pnpm arm-check <role> --trace <demo>:[lift]<from>-<to> [--midi <path>] [--step <seconds>] [--set <changes>]..., or pnpm arm-check <role> --explain <stretch | flat> [--demo <id>]... [--midi <path>]... [--step <seconds>] [--set <changes>]... [--glb <file>]';

/** One variant of `--variant`: a name and the changes of the holds of its `--set` options. */
export interface ArmVariant {
  /** The name of the variant, which the table gives. */
  readonly name: string;
  /** The value of each `--set` option of the variant, in their order. */
  readonly sets: readonly string[];
}

/**
 * Reads the variants of the command line: each `--variant <name>` starts a variant, and each
 * `--set` after it adds to that variant.
 *
 * @param args The arguments.
 * @returns The variants in their order, or none when no `--variant` comes.
 * @throws Error if a `--set` comes before the first `--variant`, if a name comes more than one
 *   time, or if `--variant` has no name.
 */
export function variantGroups(args: readonly string[]): ArmVariant[] {
  if (!args.includes('--variant')) {
    return [];
  }
  const variants: { readonly name: string; readonly sets: string[] }[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg !== '--variant' && arg !== '--set') {
      continue;
    }
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option ${arg} takes a value.\n${USAGE}`);
    }
    i++;
    if (arg === '--variant') {
      if (variants.some((variant) => variant.name === value)) {
        throw new Error(`The variant ${value} comes more than one time.`);
      }
      variants.push({ name: value, sets: [] });
      continue;
    }
    const current = variants.at(-1);
    if (!current) {
      throw new Error(
        `With --variant, each --set goes after a --variant, and "--set ${value}" comes before the first one.\n${USAGE}`,
      );
    }
    current.sets.push(value);
  }
  return variants;
}

/**
 * Reads the command line of the tool.
 *
 * @param args The arguments.
 * @returns The command line.
 * @throws Error for an unknown role or option, or a missing value.
 */
export function checkArgs(args: readonly string[]): CheckArgs {
  const valued = new Set([
    '--base',
    '--set',
    '--variant',
    '--glb',
    '--views',
    '--demo',
    '--midi',
    '--step',
    '--jobs',
    '--trace',
    '--states',
    '--explain',
  ]);
  const flags = new Set(['--all', '--views-all', '--long']);
  const roles: string[] = [];
  const values = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (valued.has(arg)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`The option ${arg} takes a value.\n${USAGE}`);
      }
      values.set(arg, [...(values.get(arg) ?? []), value]);
      i++;
    } else if (flags.has(arg)) {
      seen.add(arg);
    } else if (arg.startsWith('--')) {
      throw new Error(`The option ${arg} is not known.\n${USAGE}`);
    } else {
      roles.push(arg);
    }
  }
  const all = seen.has('--all');
  if (all === roles.length > 0) {
    throw new Error(`Give roles or --all, not both and not none.\n${USAGE}`);
  }
  const unknown = roles.filter((role) => !isRole(role));
  if (unknown.length > 0) {
    throw new Error(
      `No role has the name ${unknown.join(', ')}. The roles are: ${[...FOLD_ROLES.keys()].join(', ')}, and the recast roles <role>@<species>.`,
    );
  }
  const glb = values.get('--glb')?.[0] ?? null;
  const chosen = all ? [...FOLD_ROLES.keys()] : roles;
  if (glb !== null && chosen.length !== 1) {
    throw new Error('The option --glb takes one role, the role of the animal of the file.');
  }
  const jobs = Number(values.get('--jobs')?.[0] ?? 4);
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new Error('The option --jobs takes a whole number above 0.');
  }
  const views = values.get('--views')?.[0] ?? null;
  if (views !== null && (glb !== null || values.has('--set'))) {
    throw new Error('The option --views renders the working tree, so --set and --glb do not go.');
  }
  if (views !== null && values.has('--midi')) {
    throw new Error('The option --views renders the demos of the app, so --midi does not go.');
  }
  if (views !== null && chosen.some((role) => findRole(role) !== FOLD_ROLES.get(role))) {
    throw new Error(
      'The option --views renders the cast of the app, so it takes no recast role. Render a recast role with pnpm close-views <role>@<species>.',
    );
  }
  const midi = (values.get('--midi') ?? []).map((path) => resolve(path));
  const lost = midi.filter((path) => !existsSync(path));
  if (lost.length > 0) {
    throw new Error(`The MIDI file ${lost.join(', ')} of --midi does not exist.`);
  }
  const stepText = values.get('--step')?.[0] ?? null;
  const step = stepText === null ? null : Number(stepText);
  if (step !== null && !(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const traceText = values.get('--trace')?.[0] ?? null;
  const trace = traceText === null ? null : traceRange(traceText);
  const gateOnly = ['--base', '--glb', '--views', '--demo', '--jobs'].filter((o) => values.has(o));
  if (trace && (chosen.length !== 1 || all || gateOnly.length > 0 || seen.has('--long'))) {
    throw new Error(
      `The option --trace takes one role, --step, and --set, and no --all, --long, or ${gateOnly.join(', ') || 'option of the gate'}.\n${USAGE}`,
    );
  }
  const states = (values.get('--states')?.[0] ?? '').split(',').filter((ref) => ref !== '');
  const stateless = ['--base', '--glb', '--views', '--set', '--trace'].filter((o) => values.has(o));
  if (values.has('--states') && (states.length === 0 || stateless.length > 0)) {
    throw new Error(
      `The option --states takes commits separated by commas, and no ${stateless.join(', ') || 'empty list'}.\n${USAGE}`,
    );
  }
  const explainText = values.get('--explain')?.[0] ?? null;
  const explain = EXPLAINED.find((measure) => measure === explainText) ?? null;
  if (explainText !== null && explain === null) {
    throw new Error(`The option --explain takes ${EXPLAINED.join(' or ')}.\n${USAGE}`);
  }
  const unexplained = ['--base', '--views', '--jobs', '--trace', '--states'].filter((o) =>
    values.has(o),
  );
  if (explain && (chosen.length !== 1 || all || unexplained.length > 0 || seen.has('--long'))) {
    throw new Error(
      `The option --explain takes one role, --demo, --step, --set, and --glb, and no --all, --long, or ${unexplained.join(', ') || 'option of the gate'}.\n${USAGE}`,
    );
  }
  const variants = variantGroups(args);
  const single = ['--trace', '--explain', '--states', '--views'].filter((o) => values.has(o));
  if (variants.length > 0 && single.length > 0) {
    throw new Error(`The option --variant goes with none of ${single.join(', ')}.\n${USAGE}`);
  }
  // Each change must fit before the first child, so that a typing fault stops the run at once.
  for (const variant of variants) {
    setHolds(variant.sets.join(';')).undo();
  }
  const pairs = (name: string): string[] => (values.get(name) ?? []).flatMap((v) => [name, v]);
  return {
    roles: chosen,
    base: values.get('--base')?.[0] ?? null,
    shared: [...pairs('--demo'), ...midi.flatMap((path) => ['--midi', path]), ...pairs('--step')],
    midi,
    own: [
      ...(variants.length > 0 ? [] : pairs('--set')),
      ...(glb === null ? [] : ['--glb', resolve(glb)]),
    ],
    variants,
    views,
    viewsAll: seen.has('--views-all'),
    jobs,
    long: seen.has('--long'),
    trace,
    step,
    states,
    explain,
  };
}

/** The range of `--trace`: a demo and a range of song times, or of wall times of the lift. */
export interface TraceRange {
  /** The file of the demo, such as `beethoven-1.mid`. */
  readonly demo: string;
  /**
   * True for wall times from the press of play, as the sample set `lift` of `probeFolds()` takes
   * them, and false for song times of the play.
   */
  readonly lift: boolean;
  /** The first time, in seconds. */
  readonly from: number;
  /** The last time, in seconds. */
  readonly to: number;
}

/**
 * Reads the range of `--trace`: `<demo>:<from>-<to>` in song times, such as `beethoven-1:12-13`
 * or `beethoven-1:-1.5-0.5` in the count-in, or `<demo>:lift<from>-<to>` in wall times from the
 * press of play, such as `beethoven-1:lift0-0.4`.
 *
 * @param text The value of the option.
 * @returns The range.
 * @throws Error for a text of another form, or a range whose end is not after its start.
 */
export function traceRange(text: string): TraceRange {
  const found = /^([^:]+):(lift)?(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/.exec(text);
  const [, name = '', lift, from = '', to = ''] = found ?? [];
  if (!found || !(Number(to) > Number(from)) || (lift !== undefined && Number(from) < 0)) {
    throw new Error(
      `The option --trace takes <demo>:<from>-<to> in song seconds or <demo>:lift<from>-<to> in wall seconds of the lift from 0, with the end after the start, such as beethoven-1:12-13 or beethoven-1:lift0-0.4, and not "${text}".`,
    );
  }
  return {
    demo: name.endsWith('.mid') ? name : `${name}.mid`,
    lift: lift !== undefined,
    from: Number(from),
    to: Number(to),
  };
}

/**
 * Writes an angle in whole degrees, with no sign on 0.
 *
 * @param angle The angle, in degrees.
 * @returns The text.
 */
function wholeDegrees(angle: number): string {
  return String(Math.round(angle) + 0);
}

/** The default step of `--trace`, in seconds. */
export const TRACE_STEP = 0.01;

/** The most lines of a trace, so that a wrong range does not print for minutes. */
const TRACE_LINES = 5000;

/**
 * Reads the MIDI files of `--midi`, by the names that `userDemoFile()` of
 * `tools/probe-demos.ts` gives them: the base name with one `.mid`. The gate keeps its own reader,
 * because it runs in the probe tree of an older commit too ({@link GATE_SCRIPTS}), whose
 * `probeDemos()` does not read these files.
 *
 * @param paths The absolute paths of the files.
 * @returns The files.
 */
function userFiles(paths: readonly string[]): DemoFile[] {
  return paths.map((path) => {
    const bytes = new Uint8Array(readFileSync(path));
    return { file: `${basename(path).replace(/(\.midi?)+$/i, '')}.mid`, bytes, source: bytes };
  });
}

/**
 * Gives the demos of a run: the demos of `--demo` and the files of `--midi` ({@link userFiles}),
 * or each demo and tool score of `probeDemos()` with neither option.
 *
 * @param asked The demos of `--demo`, with or with no `.mid`.
 * @param midi The absolute paths of the files of `--midi`.
 * @param strict True to stop on a demo of `--demo` that does not exist. A child on the tree of a
 *   commit skips it, because the commit can lack a new demo.
 * @returns The demos.
 * @throws Error for a demo of `--demo` that does not exist, when strict.
 */
async function gateDemos(
  asked: readonly string[],
  midi: readonly string[],
  strict: boolean,
): Promise<DemoFile[]> {
  const users = userFiles(midi);
  const all = [...(await probeDemos()), ...users];
  const chosen = [
    ...asked.map((id) => (id.endsWith('.mid') ? id : `${id}.mid`)),
    ...users.map((user) => user.file),
  ];
  const unknown = chosen.filter((file) => !all.some((demo) => demo.file === file));
  if (strict && unknown.length > 0) {
    throw new Error(`No demo has the name ${unknown.join(', ')}.`);
  }
  return chosen.length > 0 ? all.filter((demo) => chosen.includes(demo.file)) : all;
}

/**
 * Traces the paws of the first body of a role at each step of a range, with no sweep: for each
 * arm, the signed paw twist on the forearm from the bind, its change from the line before, the paw
 * swing, the signed turn of the grip ({@link GripFrames}) from the accepted grip
 * ({@link ACCEPTED_GRIPS}, with the sign of the right arm turned), and the forearm twist ({@link measureArm}). A play sample poses the song time
 * as `probeFolds()` does, and a lift sample the wall time from the press of play. The modules of
 * the pose load only here, so the gate imports no more exports of an old tree.
 *
 * @param role The role.
 * @param range The demo and the range.
 * @param step The step, in seconds.
 * @param midi The absolute paths of the files of `--midi`, whose demos the range can name.
 * @returns The lines: a title and a table.
 * @throws Error for a demo with no body of the role, or a range of more than {@link TRACE_LINES}
 *   steps.
 */
export async function traceLines(
  role: string,
  range: TraceRange,
  step: number,
  midi: readonly string[] = [],
): Promise<string[]> {
  const source = findRole(role);
  const all = [...(await probeDemos()), ...userFiles(midi)];
  const demo = all.find((d) => d.file === range.demo);
  const scene = demo && source ? roleScene(source, demo.bytes) : null;
  const [body] = source && scene ? roleBodies(source, scene) : [];
  if (!source || !scene || !body) {
    const withRole = source
      ? all
          .filter((d) => roleBodies(source, roleScene(source, d.bytes)).length > 0)
          .map((d) => d.file)
      : [];
    throw new Error(
      `The demo ${range.demo} has no studio body of the ${role}. The demos with the role are: ${withRole.join(', ') || 'none'}.`,
    );
  }
  const rig = body.model.studio;
  const count = Math.floor((range.to - range.from) / step + 1e-6) + 1;
  if (count > TRACE_LINES) {
    throw new Error(
      `The trace has ${count} steps, above ${TRACE_LINES}. Give a shorter range or a larger --step.`,
    );
  }
  const start = -countInAt(scene.plan.beats, 0).lengthSec;
  const audible = allAudible(scene.score);
  const buffer = createScenePose(scene.plan);
  const lift = { ...PLAYING, changedAtWall: 10 };
  const grips = ACCEPTED_GRIPS.get(role) ?? null;
  const arms = armBinds(rig);
  const player = body.index === null ? 'the conductor' : `the player ${body.index}`;
  const kind = range.lift ? 'wall times of the lift' : 'song times';
  const lines = [
    `Paw trace of the ${role} (${player}) in ${range.demo}, ${kind} ${range.from} s to ${range.to} s at steps of ${step} s. In degrees: the signed paw twist on the forearm from the bind, its change from the line before (JUMP above ${JUMP_ANGLE}°), the paw swing, the signed turn of the grip in the frame of the posed forearm from the accepted grip (the right arm with its sign turned), and the forearm twist.`,
    '',
    `| ${range.lift ? 'Wall' : 'Song'} s | ${SIDES.map((s) => `${s} twist | ${s} change | ${s} swing | ${s} grip | ${s} forearm`).join(' | ')} |`,
    `|---|${SIDES.map(() => '---|---|---|---|---').join('|')}|`,
  ];
  const last: Record<Side, number | null> = { L: null, R: null };
  for (let k = 0; k < count; k++) {
    const time = range.from + k * step;
    const song = range.lift ? Math.min(0, start + time) : time;
    const wall = range.lift ? 10 + time : 10 + time - start;
    const frame = poseAt(scene.plan, song, wall, range.lift ? lift : PLAYING, audible, buffer);
    const pose = body.index === null ? frame.conductor : frame.players[body.index];
    if (!pose) {
      continue;
    }
    const studio = poseStudioBones(
      rig,
      body.model.skeleton,
      pose.rotations,
      studioOffsets(pose),
      1,
      createStudioPose(),
    );
    const posed = skinStudioMesh(rig.mesh, studio);
    const cells = SIDES.map((side) => {
      const sample = measureArm(arms[side], studio.matrices, posed, [], null);
      const before = last[side];
      const change = before === null ? 0 : wrap(sample.pawRoll - before);
      last[side] = sample.pawRoll;
      const signed = side === 'R' ? -sample.gripRoll : sample.gripRoll;
      const grip = grips ? wholeDegrees(wrap(signed - grips[side])) : '-';
      const jump = Math.abs(change) > JUMP_ANGLE ? ' JUMP' : '';
      return `${wholeDegrees(sample.pawRoll)} | ${wholeDegrees(change)}${jump} | ${wholeDegrees(sample.pawSwing)} | ${grip} | ${wholeDegrees(sample.foreTwist)}`;
    });
    lines.push(`| ${time.toFixed(2)} | ${cells.join(' | ')} |`);
  }
  return lines;
}

/** The step of the song time of the play samples of the gate with no `--step`, in seconds. */
export const GATE_STEP = 0.25;

/** The measures that `--explain` takes. */
export const EXPLAINED = ['stretch', 'flat'] as const;

/** A measure of `--explain`. */
export type Explained = (typeof EXPLAINED)[number];

/** The number of edges of the worst sample that `--explain stretch` lists for each arm. */
export const EXPLAIN_EDGES = 8;

/** The parts of one posed arm that `--explain` reads. */
interface ArmParts {
  /** The length of each edge of the faces of the forearm and the paw ({@link lowerLengths}). */
  readonly lengths: Float32Array;
  /** The narrow axis of each ring of {@link ArmBind.rings}, or `NaN` for a ring with no value. */
  readonly narrows: readonly number[];
}

/** One sample of one arm for `--explain`. */
interface ExplainSample {
  /** The demo and the time. */
  readonly label: string;
  /** The sample set. */
  readonly set: SampleSet;
  /** The value of the measure against the rest sample of the same demo. */
  readonly rest: number;
  /** The value of the measure against the bind pose. */
  readonly bind: number;
}

/** One sample of one arm with its parts, for the tables of `--explain`. */
interface PartSample {
  /** The values. */
  readonly sample: ExplainSample;
  /** The parts of the sample. */
  readonly parts: ArmParts;
  /** The parts of the rest sample of the same demo, or `null` before the rest sample. */
  readonly rest: ArmParts | null;
  /** The bind facts of the arm. */
  readonly arm: ArmBind;
  /** The skin, for the bone of an edge. */
  readonly mesh: Pick<StudioMesh, 'joints' | 'weights'>;
}

/**
 * Gives the narrow axis of each ring of one posed arm, as {@link measureArm} reads it for the flat
 * share.
 *
 * @param arm The bind facts of the arm.
 * @param matrices The skin matrices of the pose.
 * @param posed The posed places of the vertices.
 * @returns The narrow axis of each ring, in meters, or `NaN` for a ring that the flat share skips.
 */
function ringNarrows(
  arm: ArmBind,
  matrices: ArrayLike<number>,
  posed: ArrayLike<number>,
): number[] {
  const { shoulder, elbow, upperAxis, foreAxis } = armAxes(arm, matrices);
  return arm.rings.map((ring) => {
    if (!(ring.narrow > 0) || ring.along.length <= 2) {
      return Number.NaN;
    }
    const upper = ring.ring.bone === 'upper';
    const axis = upper ? upperAxis : foreAxis;
    const radials = ringRadials(ring, posed, upper ? shoulder : elbow, axis);
    return narrowAxis(Float32Array.from(radials), axis);
  });
}

/**
 * Gives the value of a measure of `--explain` for one posed arm, as {@link measureArm} gives it
 * against a reference: the stretch from the edge lengths of the reference, or the flat share
 * against the narrow axes of the reference.
 *
 * @param measure The measure.
 * @param arm The bind facts of the arm.
 * @param parts The parts of the sample.
 * @param reference The parts of the reference sample, or `null` for the bind pose.
 * @returns The value.
 */
function partValue(
  measure: Explained,
  arm: ArmBind,
  parts: ArmParts,
  reference: ArmParts | null,
): number {
  if (measure === 'stretch') {
    const from = reference?.lengths ?? arm.lengths;
    let most = 0;
    for (let k = 0; k < arm.lengths.length; k++) {
      most = Math.max(most, (parts.lengths[k] ?? 0) - (from[k] ?? 0));
    }
    return most / arm.upper;
  }
  let least = Infinity;
  for (const [i, ring] of arm.rings.entries()) {
    const from = reference ? (reference.narrows[i] ?? Number.NaN) : ring.narrow;
    const share = (parts.narrows[i] ?? Number.NaN) / from;
    if (Number.isFinite(share)) {
      least = Math.min(least, share);
    }
  }
  return Number.isFinite(least) ? least : 1;
}

/**
 * Names the joint with the most weight on the two vertices of an edge.
 *
 * @param mesh The skin.
 * @param a The first vertex.
 * @param b The second vertex.
 * @returns The name of the studio bone, or `joint <index>` for an extra joint.
 */
function edgeBone(mesh: Pick<StudioMesh, 'joints' | 'weights'>, a: number, b: number): string {
  const sums = new Map<number, number>();
  for (const v of [a, b]) {
    for (let k = 0; k < 4; k++) {
      const joint = mesh.joints[v * 4 + k] ?? -1;
      sums.set(joint, (sums.get(joint) ?? 0) + (mesh.weights[v * 4 + k] ?? 0));
    }
  }
  const [joint = -1] = [...sums].toSorted((x, y) => y[1] - x[1])[0] ?? [];
  return STUDIO_BONES[joint] ?? `joint ${joint}`;
}

/**
 * Gives the two vertices of an edge of the faces of the forearm and the paw.
 *
 * @param arm The bind facts of the arm.
 * @param k The index of the edge in {@link ArmBind.lengths}: three for each face.
 * @returns The vertex at the start of the edge and the vertex at its end.
 */
function edgeEnds(arm: ArmBind, k: number): [number, number] {
  const face = Math.floor(k / 3);
  return [arm.lower[k] ?? 0, arm.lower[face * 3 + ((k + 1) % 3)] ?? 0];
}

/**
 * Writes a length in cm.
 *
 * @param meters The length, in meters.
 * @returns The text, such as `1.25`.
 */
function cm(meters: number | undefined): string {
  return meters === undefined || !Number.isFinite(meters) ? '-' : (meters * 100).toFixed(2);
}

/**
 * Writes the tables of the worst edges of the stretch of one arm in its worst sample: the edges
 * that grow most from the reference of the gate, the rest sample.
 *
 * @param worst The worst sample.
 * @returns The lines of the table.
 */
function stretchRows(worst: PartSample): string[] {
  const { arm, parts, rest, mesh } = worst;
  const from = rest?.lengths ?? arm.lengths;
  const share = (meters: number): string => (meters / arm.upper).toFixed(3);
  const order = Array.from(arm.lengths, (...[, k]) => k).toSorted(
    (x, y) => (parts.lengths[y] ?? 0) - (from[y] ?? 0) - ((parts.lengths[x] ?? 0) - (from[x] ?? 0)),
  );
  // Two faces share an edge, so each edge gets one row with the faces of each of its sides.
  const edges = new Map<string, { readonly k: number; readonly faces: number[] }>();
  for (const k of order) {
    const [a, b] = edgeEnds(arm, k);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const face = arm.lowerFaces[Math.floor(k / 3)] ?? -1;
    const found = edges.get(key);
    if (found) {
      found.faces.push(face);
    } else if (edges.size < EXPLAIN_EDGES) {
      edges.set(key, { k, faces: [face] });
    }
  }
  const lines = [
    '| Faces | Edge | Bone | Sample cm | Rest cm | Bind cm | From the rest | From the bind | Rest from the bind |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [key, { k, faces }] of edges) {
    const [a, b] = edgeEnds(arm, k);
    const sample = parts.lengths[k] ?? 0;
    const bind = arm.lengths[k] ?? 0;
    const restLength = rest?.lengths[k];
    const cells = [
      faces.join(', '),
      key,
      edgeBone(mesh, a, b),
      cm(sample),
      cm(restLength),
      cm(bind),
      restLength === undefined ? '-' : share(sample - restLength),
      share(sample - bind),
      restLength === undefined ? '-' : share(restLength - bind),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/**
 * Writes the table of the rings of the flat share of one arm in its worst sample, the flattest
 * ring against the bind first.
 *
 * @param worst The worst sample.
 * @param side The side of the arm.
 * @returns The lines of the table.
 */
function flatRows(worst: PartSample, side: Side): string[] {
  const { arm, parts, rest } = worst;
  const ratio = (value: number | undefined, from: number | undefined): string => {
    const share = (value ?? Number.NaN) / (from ?? Number.NaN);
    return Number.isFinite(share) ? share.toFixed(3) : '-';
  };
  const rings = [...arm.rings.entries()].toSorted(
    ([x, a], [y, b]) =>
      ((parts.narrows[x] ?? Number.NaN) / a.narrow || Infinity) -
      ((parts.narrows[y] ?? Number.NaN) / b.narrow || Infinity),
  );
  const lines = [
    '| Ring | Bone | Sample cm | Rest cm | Bind cm | From the rest | From the bind | Rest from the bind |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [i, ring] of rings) {
    const cells = [
      ring.ring.name,
      ring.ring.bone === 'upper' ? `upper_arm_${side}` : `forearm_${side}`,
      cm(parts.narrows[i]),
      cm(rest?.narrows[i]),
      cm(ring.narrow),
      ratio(parts.narrows[i], rest?.narrows[i]),
      ratio(parts.narrows[i], ring.narrow),
      ratio(rest?.narrows[i], ring.narrow),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

/** The part of a rest sample that shrinks most from the bind ({@link restShrink}). */
interface RestShrink {
  /** The edge or the ring, with its bone. */
  readonly part: string;
  /** The change of the edge as a signed share of the upper arm, or the share of the ring. */
  readonly value: number;
  /** The shrink: the edge shorter than in the bind, or the ring narrower, 0 for none. */
  readonly shrink: number;
}

/**
 * Gives the part of a rest sample that shrinks most from the bind: the edge whose length falls
 * most, as a share of the upper arm, or the ring whose narrow axis falls most, as a share of the
 * bind. A short edge in the rest makes each stretch from the rest larger, and a narrow ring makes
 * each flat share from the rest larger.
 *
 * @param measure The measure.
 * @param entry The rest sample.
 * @param side The side of the arm.
 * @returns The part, its change, and the shrink.
 */
function restShrink(measure: Explained, entry: PartSample, side: Side): RestShrink {
  const { arm, parts, mesh } = entry;
  if (measure === 'stretch') {
    let best = 0;
    for (let k = 1; k < arm.lengths.length; k++) {
      const change = (parts.lengths[k] ?? 0) - (arm.lengths[k] ?? 0);
      if (change < (parts.lengths[best] ?? 0) - (arm.lengths[best] ?? 0)) {
        best = k;
      }
    }
    const [a, b] = edgeEnds(arm, best);
    const value = ((parts.lengths[best] ?? 0) - (arm.lengths[best] ?? 0)) / arm.upper;
    return {
      part: `face ${arm.lowerFaces[Math.floor(best / 3)] ?? '-'}, edge ${Math.min(a, b)}-${Math.max(a, b)}, ${edgeBone(mesh, a, b)}`,
      value,
      shrink: Math.max(0, -value),
    };
  }
  let best: RestShrink = { part: '-', value: 1, shrink: 0 };
  for (const [i, ring] of arm.rings.entries()) {
    const value = (parts.narrows[i] ?? Number.NaN) / ring.narrow;
    if (Number.isFinite(value) && 1 - value > best.shrink) {
      const bone = ring.ring.bone === 'upper' ? `upper_arm_${side}` : `forearm_${side}`;
      best = { part: `ring ${ring.ring.name}, ${bone}`, value, shrink: 1 - value };
    }
  }
  return best;
}

/**
 * Explains one measure of the gate for one role (`--explain`): the value of each arm in each
 * sample set against the rest sample and against the bind, with the mark `MOVES` when the stretch
 * from the rest is larger than from the bind (the rest sample moves the reference of the gate),
 * the part of the rest sample of each demo that shrinks most from the bind ({@link restShrink}),
 * and the worst edges or rings of the worst sample of each arm.
 *
 * @param role The name of the role.
 * @param source The role.
 * @param demos The demos.
 * @param step The step of the play, in seconds.
 * @param measure The measure.
 * @returns The lines.
 */
export function explainLines(
  role: string,
  source: RoleSource,
  demos: readonly DemoFile[],
  step: number,
  measure: Explained,
): string[] {
  const limit = ARM_LIMITS[measure];
  const fromRest = measure === 'stretch';
  const gate = (sample: ExplainSample): number => (fromRest ? sample.rest : sample.bind);
  const samples: Record<Side, ExplainSample[]> = { L: [], R: [] };
  const rests: Record<Side, PartSample[]> = { L: [], R: [] };
  const worst: Record<Side, PartSample | null> = { L: null, R: null };
  const found: string[] = [];
  for (const demo of demos) {
    const restOf: Record<Side, ArmParts | null> = { L: null, R: null };
    const report = probeFolds(source, [demo], step, (...[rig, studio, posed, , set, label]) => {
      const arms = armBinds(rig);
      for (const side of SIDES) {
        const arm = arms[side];
        const parts: ArmParts = {
          lengths: lowerLengths(arm, posed),
          narrows: ringNarrows(arm, studio.matrices, posed),
        };
        // The rest sample of a demo comes first, and the stretch of the gate counts from it.
        if (set === 'rest') {
          restOf[side] = parts;
        }
        const rest = restOf[side];
        const sample: ExplainSample = {
          label,
          set,
          rest: partValue(measure, arm, parts, rest),
          bind: partValue(measure, arm, parts, null),
        };
        samples[side].push(sample);
        const entry: PartSample = { sample, parts, rest, arm, mesh: rig.mesh };
        if (set === 'rest') {
          rests[side].push(entry);
        }
        const before = worst[side];
        const value = gate(sample);
        if (!before || (limit.up ? value > gate(before.sample) : value < gate(before.sample))) {
          worst[side] = entry;
        }
      }
    });
    found.push(...report.demos);
  }

  const digits = limit.digits + 1;
  const uppers = SIDES.map((side) => {
    const upper = worst[side]?.arm.upper;
    return `${side} ${upper === undefined ? '-' : upper.toFixed(3)} m`;
  });
  const table = [
    `| Arm | Set | Samples | ${limit.stat} from the rest${fromRest ? ' (gate)' : ''} | ${limit.stat} from the bind${fromRest ? '' : ' (gate)'} | Worst from the rest | Worst from the bind |${fromRest ? ' Mark |' : ''}`,
    `|---|---|---:|---:|---:|---|---|${fromRest ? '---|' : ''}`,
  ];
  const moved: string[] = [];
  for (const side of SIDES) {
    for (const set of SAMPLE_SETS) {
      const own = samples[side].filter((s) => s.set === set);
      if (own.length === 0) {
        continue;
      }
      const labels = own.map((s) => s.label);
      const rest = setStats(
        own.map((s) => s.rest),
        labels,
        limit.up,
      );
      const bind = setStats(
        own.map((s) => s.bind),
        labels,
        limit.up,
      );
      const value = (stats: SetStats): number => (limit.stat === 'p5' ? stats.p5 : stats.p95);
      // The stretch from the rest is larger than from the bind only when the rest sample
      // shrinks edges that the samples of the set stretch.
      const moves = fromRest && value(rest) > value(bind);
      if (moves) {
        moved.push(`${side} ${set}`);
      }
      table.push(
        `| ${side} | ${set} | ${own.length} | ${value(rest).toFixed(digits)} | ${value(bind).toFixed(digits)} | ${rest.worst.toFixed(digits)}, ${rest.at} | ${bind.worst.toFixed(digits)}, ${bind.at} |${fromRest ? ` ${moves ? 'MOVES' : ''} |` : ''}`,
      );
    }
  }

  const lines = [
    `Explain of ${limit.name} of the ${role} over ${found.length} demos at a step of ${step} s: ${found.join(', ') || 'none'}.`,
    fromRest
      ? `The stretch is the largest growth of an edge of the faces of the forearm and the paw, as a share of the upper arm (${uppers.join(', ')}). The gate counts it from the rest sample of the same demo, and "from the bind" counts it from the bind pose.`
      : 'The flat share is the narrow axis of the flattest ring as a share of its narrow axis in the bind pose, as the gate counts it. "From the rest" divides by the narrow axis of the ring in the rest sample of the same demo.',
  ];
  if (fromRest) {
    lines.push(
      moved.length > 0
        ? `MOVES: ${moved.join(', ')}. The stretch from the rest is larger than from the bind, because the rest sample shrinks the edges that these samples stretch. The gate counts that move of the rest as stretch.`
        : 'No set has the mark MOVES: in each set, the stretch from the rest is not larger than from the bind.',
    );
  }
  lines.push(
    '',
    ...table,
    '',
    `The part of the rest sample of each demo that shrinks most from the bind. ${fromRest ? 'A short edge in the rest makes each stretch from the rest larger.' : 'The gate reads the bind, so a rest that moves changes only the values "from the rest".'}`,
    '',
    '| Arm | Rest sample | Part | Rest from the bind |',
    '|---|---|---|---:|',
  );
  for (const side of SIDES) {
    for (const entry of rests[side]) {
      const change = restShrink(measure, entry, side);
      lines.push(
        `| ${side} | ${entry.sample.label} | ${change.part} | ${change.value.toFixed(3)} |`,
      );
    }
  }

  for (const side of SIDES) {
    const own = worst[side];
    if (!own) {
      continue;
    }
    const { sample } = own;
    lines.push(
      '',
      `The worst sample of the ${side} arm for the gate: ${sample.label} (${sample.set}), ${sample.rest.toFixed(3)} from the rest, ${sample.bind.toFixed(3)} from the bind.`,
      '',
      ...(fromRest ? stretchRows(own) : flatRows(own, side)),
    );
  }
  return lines;
}

/**
 * Explains a measure for one role of the command line in this tree (`--explain`), over the demos
 * of `--demo` or all demos, at the step of `--step` or {@link GATE_STEP}.
 *
 * @param role The role.
 * @param measure The measure.
 * @param options The command line.
 * @returns The lines of {@link explainLines}.
 * @throws Error for a demo of `--demo` that does not exist.
 */
async function explainRole(
  role: string,
  measure: Explained,
  options: CheckArgs,
): Promise<string[]> {
  const source = findRole(role);
  if (!source) {
    throw new Error(`No role has the name ${role}.`);
  }
  const asked = options.shared.filter((...[, i]) => options.shared[i - 1] === '--demo');
  const demos = await gateDemos(asked, options.midi, true);
  return explainLines(role, source, demos, options.step ?? GATE_STEP, measure);
}

/**
 * Runs the tool as a child: it measures the roles of the command line in this tree, and writes
 * {@link ArmJson} into the file of `--json`. A role that the tree does not have goes into
 * `missing`. With `--glb <file>`, the tool runs again in a copy of `src/` with the studio body of
 * the file (`tools/glb-swap.ts`).
 *
 * @param args The arguments, with `--json <file>`.
 * @returns The exit code.
 */
async function childMain(args: readonly string[]): Promise<number> {
  const { glb, rest } = takeGlb(args);
  const roles = rest.filter((arg, i) => !arg.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  if (glb) {
    const source = findRole(roles[0] ?? '');
    if (!source) {
      throw new Error(`The option --glb needs a role of this tree, and not ${roles.join(', ')}.`);
    }
    return withGlbBody(roleAnimal(source), glb, (dir) => runTool(dir, 'arm-check.ts', rest));
  }
  const option = (name: string): string[] =>
    rest.flatMap((arg, i) => (rest[i - 1] === name ? [arg] : []));
  const step = Number(option('--step')[0] ?? GATE_STEP);
  if (!(step > 0)) {
    throw new Error('The step must be a number of seconds above 0.');
  }
  const demos = await gateDemos(option('--demo'), option('--midi'), false);
  const changes = await setRunHolds(roles, option('--set').join(';'));
  const reports: Record<string, RoleReport> = {};
  try {
    for (const role of roles) {
      const source = isRole(role) ? findRole(role) : undefined;
      if (source) {
        reports[role] = probeRole(source, demos, step, ACCEPTED_GRIPS.get(role) ?? null);
      }
    }
  } finally {
    changes?.undo();
  }
  const json: ArmJson = {
    version: ARM_FORMAT,
    since: ARM_SINCE,
    roles: reports,
    missing: roles.filter((role) => !isRole(role)),
  };
  await writeFile(option('--json')[0] ?? '', `${JSON.stringify(json)}\n`);
  return 0;
}

/**
 * Sets the hold changes of a run in memory, with the scale of the size rule of each recast role,
 * as the cast matrix gives it (`setRecastHolds()` of `tools/recast-scale.ts`). The module of the
 * rule loads only for a recast role, because the probe tree of an older commit can lack it.
 *
 * @param roles The roles of the run.
 * @param holds The hold changes of `--set`, or `''`.
 * @returns The changes with a function that puts the old values back, or `null` for no change.
 */
async function setRunHolds(
  roles: readonly string[],
  holds: string,
): Promise<ReturnType<typeof setHolds> | null> {
  if (!roles.some((role) => role.includes('@'))) {
    return holds ? setHolds(holds) : null;
  }
  const { setRecastHolds } = await import('./recast-scale.ts');
  return setRecastHolds(roles, holds);
}

/**
 * Reads the JSON text of a child.
 *
 * @param text The text.
 * @returns The JSON.
 */
function readArmJson(text: string): ArmJson {
  // SAFETY: the text comes from childMain() of this tool, and probeFormat() checked its version.
  return JSON.parse(text) as ArmJson;
}

/**
 * Gives the cache file of the JSON text of a role of the working tree (`treeCacheFile()` of
 * `tools/ref-tree.ts`). The key holds the tree of `src/`, `tools/`, and the demos of the working
 * tree, which holds the code of the gate, {@link ARM_FORMAT}, and the arguments of the role. A run
 * with `--glb`, whose file is outside the tree, or with `PROBE_NO_CACHE=1` has no cache. The
 * function of the key loads only here, because an older tree does not export it, and a probe of
 * such a commit copies the gate into its tree.
 *
 * @param args The arguments of the role on the working tree, with no `--json`.
 * @returns The file, or `null`.
 */
async function armCacheFile(args: readonly string[]): Promise<string | null> {
  if (args.includes('--glb') || process.env[PROBE_NO_CACHE] === '1') {
    return null;
  }
  const { treeCacheFile } = await import('./ref-tree.ts');
  return treeCacheFile('arm-check.ts', [`format ${ARM_FORMAT}`, ...args]);
}

/**
 * Measures one role in a child process: the working tree, and the base beside it. The text of the
 * working tree comes from its cache when the key is the same ({@link armCacheFile}), and the run
 * then prints `tree: cached`.
 *
 * @param role The role.
 * @param options The command line.
 * @returns The reports of the working tree and of the base, or `null` for no base.
 */
async function measureRole(
  role: string,
  options: CheckArgs,
): Promise<{ readonly tree: RoleReport | null; readonly base: RoleReport | null }> {
  const tree = [role, ...options.shared, ...options.own];
  const treeCache = await armCacheFile(tree);
  if (options.base !== null) {
    const texts = await probeBeside(
      options.base,
      'arm-check.ts',
      { base: [role, ...options.shared], tree },
      { prefix: 'arm-check-', cache: true, treeCache, scripts: GATE_SCRIPTS },
    );
    return {
      tree: readArmJson(texts.tree).roles[role] ?? null,
      base: readArmJson(texts.base).roles[role] ?? null,
    };
  }
  if (treeCache && existsSync(treeCache)) {
    console.log(`tree: cached (${role}, ${basename(treeCache, '.json').slice(5, 17)})`);
    return { tree: readArmJson(await readFile(treeCache, 'utf8')).roles[role] ?? null, base: null };
  }
  const text = await withTempFolder(
    async (dir) => {
      const file = join(dir, 'tree.json');
      await runChild(
        process.execPath,
        [join('tools', 'arm-check.ts'), ...tree, '--json', file],
        ROOT,
      );
      return readFile(file, 'utf8');
    },
    { prefix: 'arm-check-' },
  );
  if (treeCache) {
    const { storeBase } = await import('./ref-tree.ts');
    storeBase(treeCache, text);
  }
  return { tree: readArmJson(text).roles[role] ?? null, base: null };
}

/**
 * Runs a function on each item, with at most a number of calls at the same time.
 *
 * @param items The items.
 * @param jobs The largest number of calls at the same time.
 * @param work The function.
 * @returns The results, in the order of the items.
 */
async function eachLimited<T, R>(
  items: readonly T[],
  jobs: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await work(item);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane));
  return results;
}

/**
 * The scripts of the gate that `--base` and `--states` copy into the tree of each commit. The size
 * rule of a recast role ({@link setRunHolds}) goes with the gate, so that both trees measure the
 * recast pair at the size of their own rule.
 */
const GATE_SCRIPTS: readonly string[] = ['arm-check.ts', 'recast-scale.ts'];

/**
 * Opens the probe tree of each commit (`withProbeTree()` of `tools/ref-tree.ts`), with the gate of
 * the working tree in place of the gate of the commit, and gives the folders to a function. Each
 * folder goes away at the end, also after a failure or a stop.
 *
 * @param refs The commits.
 * @param use The function that reads the folders, in the order of the commits.
 * @param dirs The folders that are open already.
 * @returns The result of the function.
 */
function withStateTrees<T>(
  refs: readonly string[],
  use: (dirs: readonly string[]) => Promise<T>,
  dirs: readonly string[] = [],
): Promise<T> {
  const [ref, ...rest] = refs;
  if (ref === undefined) {
    return use(dirs);
  }
  return withProbeTree(ref, (dir) => withStateTrees(rest, use, [...dirs, dir]), {
    prefix: 'arm-state-',
    scripts: GATE_SCRIPTS,
  });
}

/** The reports of the roles on one state of `--states`, or on the working tree. */
export interface StateRun {
  /** The name of the column: the commit as the command line gives it, or `tree`. */
  readonly name: string;
  /** The report of each role, or `null` for a role that the state does not have. */
  readonly reports: ReadonlyMap<string, RoleReport | null>;
}

/**
 * Runs the gate of the working tree on the code of each commit of `--states`, each role in a child
 * process in the tree of the commit, and on the working tree ({@link measureRole}, with its
 * cache). At most `--jobs` children run at the same time.
 *
 * @param options The command line.
 * @returns The runs: one for each commit, then the working tree.
 */
async function measureStates(options: CheckArgs): Promise<StateRun[]> {
  return withStateTrees(options.states, async (dirs) => {
    const work = [
      ...dirs.flatMap((dir) => options.roles.map((role) => ({ dir, role }))),
      ...options.roles.map((role) => ({ dir: null, role })),
    ];
    const found = await eachLimited(work, options.jobs, async ({ dir, role }) => {
      if (dir === null) {
        return (await measureRole(role, { ...options, base: null })).tree;
      }
      const file = join(dir, `${role}.json`);
      await runChild(
        process.execPath,
        [join('tools', 'arm-check.ts'), role, ...options.shared, '--json', file],
        dir,
      );
      return readArmJson(await readFile(file, 'utf8')).roles[role] ?? null;
    });
    return [...options.states, 'tree'].map((name, k) => ({
      name,
      reports: new Map(
        options.roles.map((role, i) => [role, found[k * options.roles.length + i] ?? null]),
      ),
    }));
  });
}

/**
 * Writes the table of `--states`: one row for each measure of each arm of each role, and one column
 * for each run, with the value of the gate and the mark `FAIL` of a value over its limit, as the
 * gate with no base gives it.
 *
 * @param roles The roles.
 * @param runs The runs, one column each.
 * @returns The lines of the table.
 */
export function stateLines(roles: readonly string[], runs: readonly StateRun[]): string[] {
  const lines = [
    `| Role | Arm | Measure (limit) | ${runs.map((run) => run.name).join(' | ')} |`,
    `|---|---|---|${runs.map(() => '---').join('|')}|`,
  ];
  for (const role of roles) {
    for (const side of SIDES) {
      for (const measure of MEASURES) {
        const limit = ARM_LIMITS[measure];
        const cells = runs.map((run) => {
          const report = run.reports.get(role);
          const found = report ? gateValue(report.arms[side][measure], limit) : null;
          if (!report || !found) {
            return report ? '-' : 'no role';
          }
          const mark = verdictOf(found.value, null, limit) === 'FAIL' ? ' FAIL' : '';
          return `${show(found.value, measure)}${mark}`;
        });
        lines.push(
          `| ${role} | ${side} | ${limit.name} (${show(limit.limit, measure)}) | ${cells.join(' | ')} |`,
        );
      }
    }
  }
  return lines;
}

/**
 * Runs the gate on each variant of `--variant`: one child for each variant of each role
 * ({@link measureRole}), with the `--set` options of the variant alone, so that each result is
 * the result of a run with these options and has its cache by tree. At most `--jobs` children
 * run at the same time. With `--base`, the first variant of each role runs first, so that the
 * other variants read the base from its cache. The tool writes one table with a block of rows for
 * each variant ({@link variantLines}), and the details of each value that does not pass, or of
 * each value with `--long`.
 *
 * @param options The command line, with variants.
 * @returns The exit code: 1 when a value of a variant fails.
 */
async function checkVariants(options: CheckArgs): Promise<number> {
  const started = performance.now();
  const runs = options.roles.flatMap((role) =>
    options.variants.map((variant) => ({ role, variant })),
  );
  const measure = (run: (typeof runs)[number]): ReturnType<typeof measureRole> =>
    measureRole(run.role, {
      ...options,
      own: [...run.variant.sets.flatMap((set) => ['--set', set]), ...options.own],
    });
  const first =
    options.base === null ? [] : runs.filter((run) => run.variant === options.variants[0]);
  const later = runs.filter((run) => !first.includes(run));
  const done = new Map<(typeof runs)[number], Awaited<ReturnType<typeof measureRole>>>();
  for (const phase of [first, later]) {
    const results = await eachLimited(phase, options.jobs, measure);
    phase.forEach((run, i) => {
      const result = results[i];
      if (result) {
        done.set(run, result);
      }
    });
  }
  const blocks = options.variants.map((variant) => {
    const reports = runs
      .filter((run) => run.variant === variant)
      .map((run) => {
        const result = done.get(run);
        return { role: run.role, tree: result?.tree ?? null, base: result?.base ?? null };
      });
    const rows = reports.flatMap(({ role, tree, base }) =>
      tree ? gateRows(role, tree, base) : [],
    );
    return { variant, reports, rows };
  });
  const seconds = (performance.now() - started) / 1000;
  console.log(
    `Arm gate of ${options.roles.length} roles in ${options.variants.length} variants${options.base === null ? '' : ` against ${options.base}`}: ${runs.length} children, at most ${options.jobs} at the same time, in ${seconds.toFixed(0)} s. A cell gives the value${options.base === null ? '' : ', the base in parentheses,'} and the verdict of a value that does not pass.`,
  );
  console.log(
    ['', ...options.variants.map((v) => `- ${v.name}: ${v.sets.join(';') || 'no change'}`)].join(
      '\n',
    ),
  );
  console.log(
    [
      '',
      ...variantLines(
        blocks.map(({ variant, rows }) => ({ name: variant.name, rows })),
        options.base !== null,
      ),
    ].join('\n'),
  );
  for (const { variant, reports, rows } of blocks) {
    const grips = gripLines(reports);
    const rebinds = rebindLines(reports);
    const shown = options.long ? rows : rows.filter((row) => row.verdict !== 'PASS');
    if (grips.length > 0 || shown.length > 0 || rebinds.length > 0) {
      console.log(`\nVariant ${variant.name}:`);
    }
    if (rebinds.length > 0) {
      console.log(['', ...rebinds].join('\n'));
    }
    if (grips.length > 0) {
      console.log(['', ...grips].join('\n'));
    }
    if (shown.length > 0) {
      console.log(['', ...detailLines(shown)].join('\n'));
    }
  }
  return blocks.some(({ rows }) => rows.some((row) => row.verdict === 'FAIL')) ? 1 : 0;
}

/**
 * Runs the tool from the command line.
 *
 * @returns The exit code: 1 when a value fails.
 */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    return childMain(args);
  }
  const options = checkArgs(args);
  const { glb, rest } = takeGlb(args);
  if (options.explain && glb) {
    // The explain runs again in a copy of `src/` with the studio body of the file.
    const source = findRole(options.roles[0] ?? '');
    if (!source) {
      throw new Error(`No role has the name ${options.roles.join(', ')}.`);
    }
    return withGlbBody(roleAnimal(source), glb, (dir) => runTool(dir, 'arm-check.ts', rest));
  }
  if (options.trace || options.explain) {
    const holds = options.own.filter((...[, i]) => options.own[i - 1] === '--set').join(';');
    const changes = await setRunHolds(options.roles, holds);
    try {
      if (changes?.text) {
        console.log(`The working tree takes the hold changes ${changes.text}.`);
      }
      const role = options.roles[0] ?? '';
      if (options.trace) {
        const step = options.step ?? TRACE_STEP;
        console.log((await traceLines(role, options.trace, step, options.midi)).join('\n'));
      } else if (options.explain) {
        console.log((await explainRole(role, options.explain, options)).join('\n'));
      }
    } finally {
      changes?.undo();
    }
    return 0;
  }
  if (options.states.length > 0) {
    const from = performance.now();
    const runs = await measureStates(options);
    const seconds = ((performance.now() - from) / 1000).toFixed(0);
    console.log(
      `Arm gate of the working tree on ${options.states.join(', ')} and on the working tree, ${options.roles.length} roles in ${seconds} s. A cell gives the value of the gate, and FAIL for a value over its limit.`,
    );
    console.log(['', ...stateLines(options.roles, runs)].join('\n'));
    const tree = runs.at(-1)?.reports;
    const fails = options.roles.some((role) => {
      const report = tree?.get(role);
      return report ? gateRows(role, report, null).some((row) => row.verdict === 'FAIL') : false;
    });
    return fails ? 1 : 0;
  }
  if (options.variants.length > 0) {
    return checkVariants(options);
  }
  const started = performance.now();
  const reports = await eachLimited(options.roles, options.jobs, async (role) => ({
    role,
    ...(await measureRole(role, options)),
  }));
  const rows = reports.flatMap(({ role, tree, base }) => (tree ? gateRows(role, tree, base) : []));
  const empty = reports.filter(({ tree }) => !tree || tree.demos.length === 0);
  const noBase = options.base === null ? [] : reports.filter(({ tree, base }) => tree && !base);
  const seconds = (performance.now() - started) / 1000;
  console.log(
    `Arm gate of ${options.roles.length} roles${options.base === null ? '' : ` against ${options.base}`} in ${seconds.toFixed(0)} s. A cell gives the value${options.base === null ? '' : ', the base in parentheses,'} and the verdict of a value that does not pass.`,
  );
  if (empty.length > 0) {
    console.log(`No demo has the roles: ${empty.map(({ role }) => role).join(', ')}.`);
  }
  if (noBase.length > 0) {
    console.log(
      `The base has no role ${noBase.map(({ role }) => role).join(', ')}, so each value over its limit fails.`,
    );
  }
  console.log(['', ...summaryLines(rows, options.base !== null)].join('\n'));
  const rebinds = rebindLines(reports);
  if (rebinds.length > 0) {
    console.log(['', ...rebinds].join('\n'));
  }
  const grips = gripLines(reports);
  if (grips.length > 0) {
    console.log(['', ...grips].join('\n'));
  }
  const shown =
    options.long || options.roles.length === 1 ? rows : rows.filter((r) => r.verdict !== 'PASS');
  if (shown.length > 0) {
    console.log(['', ...detailLines(shown)].join('\n'));
  }
  if (options.views !== null) {
    const { renderViews } = await import('./arm-views.ts');
    await renderViews(reports, rows, options, { limits: ARM_LIMITS, armVertices, labelTime });
  }
  return rows.some((row) => row.verdict === 'FAIL') ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
