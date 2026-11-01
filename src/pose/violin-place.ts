import { MathUtils, Quaternion, Vector3 } from 'three';

import { placePoint } from '../models/instruments/hold.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { NECK_SHARE } from './frames.ts';

/**
 * The rule of the place of a violin or a viola under the jaw of a seated body (design 5.3,
 * `BowedHold.chinFit`): the place of the tail end from the landmarks of the body, in head heights
 * and as shares, so that it fits each body. The violinist places the instrument on the left
 * collarbone, beside the neck, and rests the left side of the jaw on the chin rest
 * (`docs/reference/string-technique.md`, section 1.10).
 */
export interface ChinFit {
  /**
   * The tail end from the middle line toward the left shoulder joint, as a share of the way: 0 is
   * the middle line, and 1 is the shoulder joint.
   */
  readonly side: number;
  /**
   * The tail end above the base of the neck, in head heights: the higher of the neck joint and the
   * left shoulder joint, the height of the collarbone.
   */
  readonly up: number;
  /**
   * The tail end behind the front of the upper chest ({@link chestFront}), in head heights: the
   * tail end lies against the side of the neck, behind the front of the chest.
   */
  readonly back: number;
  /** The depth of the jaw in the chin rest and the strings, in head heights ({@link jawGap}). */
  readonly press: number;
}

/** The place of a violin or a viola from the body ({@link fitViolinPlace}). */
export interface ViolinPlace {
  /** The move of the tail end from its bind place, in head heights, in the axes of the chest. */
  readonly playShift: Vec3;
  /** The turn of the head down while the player plays, in radians (`BowedHold.headDrop`). */
  readonly headDrop: number;
}

/** The bones of the upper chest, whose front the place of the tail end counts from. */
const CHEST_BONES = new Set(
  (['spine', 'chest', 'shoulderL', 'shoulderR'] as const).map((bone) => boneIndex(bone)),
);

/**
 * The band of the upper chest around the left shoulder joint, in head heights: the lower bout
 * hangs below the tail end, beside a round chest.
 */
const CHEST_BAND = 0.3;

/**
 * The range of the head turn that brings the jaw onto the chin rest, in radians: a turn below 0
 * lifts the head. A real player keeps the head straight (`docs/reference/string-technique.md`,
 * section 1.10), so the instrument moves up or down for the rest of the gap.
 */
const HEAD_DROP = [-15 * MathUtils.DEG2RAD, 15 * MathUtils.DEG2RAD] as const;

/** The step of the search of the head turn. */
const DROP_STEP = MathUtils.DEG2RAD;

/** The bones of the head, whose corners the jaw gap reads. */
const HEAD_BONES = new Set((['head', 'jaw'] as const).map((bone) => boneIndex(bone)));

/**
 * The radius around each point under the jaw ({@link jawGap}) inside which a corner of the head
 * counts, as a factor of the length of the instrument from the tail end to the nut.
 */
const JAW_RADIUS = 0.1;

/**
 * Finds the front of the upper chest on the left side: the front-most corner of the chest and the
 * shoulders of the bind pose within {@link CHEST_BAND} of the height of the left shoulder joint,
 * between the shoulder joint and the middle line. Thus a round chest moves the instrument forward.
 * A line along z through the tail end can miss the front of a short neck under a large head and
 * meet its back, so the front of a band takes its place.
 *
 * @param model The player model.
 * @param shoulder The left shoulder joint.
 * @returns The z of the front. The player faces -z.
 */
export function chestFront(model: PlayerModel, shoulder: Vector3): number {
  const { positions, bones } = model.mesh;
  const band = CHEST_BAND * model.body.headHeight;
  let front = shoulder.z;
  for (let v = 0; v < bones.length; v++) {
    const x = positions[v * 3] ?? 0;
    const y = positions[v * 3 + 1] ?? 0;
    if (
      CHEST_BONES.has(bones[v] ?? -1) &&
      x >= shoulder.x &&
      x <= 0 &&
      Math.abs(y - shoulder.y) <= band
    ) {
      front = Math.min(front, positions[v * 3 + 2] ?? 0);
    }
  }
  return front;
}

/** The corners of the head and the joints that a turn of the head moves. */
interface HeadCorners {
  readonly corners: readonly Vector3[];
  readonly neck: Vector3;
  readonly head: Vector3;
}

/**
 * Gives the gap from the jaw down to the points under it: for each point, the lowest corner of the
 * head within a radius of it in the horizontal plane, less the height of the point. The head turns
 * down by an angle as the pose turns it: a share of {@link NECK_SHARE} at the neck joint, and the
 * rest at the head joint. A gap below 0 puts the jaw into the instrument.
 *
 * @param head The corners of the head and its joints.
 * @param points The points under the jaw: the chin rest and the strings at the bow.
 * @param radius The radius in the horizontal plane.
 * @param drop The turn of the head down, in radians.
 * @returns The smallest gap, or `Infinity` when no corner is near a point.
 */
function jawGap(
  head: HeadCorners,
  points: readonly Vector3[],
  radius: number,
  drop: number,
): number {
  const x = new Vector3(1, 0, 0);
  const neckTurn = new Quaternion().setFromAxisAngle(x, -drop * NECK_SHARE);
  const headTurn = new Quaternion().setFromAxisAngle(x, -drop * (1 - NECK_SHARE));
  const joint = head.head.clone().sub(head.neck).applyQuaternion(neckTurn).add(head.neck);
  const turned = new Vector3();
  let gap = Infinity;
  for (const corner of head.corners) {
    turned.copy(corner).sub(head.neck).applyQuaternion(neckTurn).add(head.neck);
    turned.sub(joint).applyQuaternion(headTurn).add(joint);
    for (const point of points) {
      if (Math.hypot(turned.x - point.x, turned.z - point.z) <= radius) {
        gap = Math.min(gap, turned.y - point.y);
      }
    }
  }
  return gap;
}

/**
 * Finds the place of a violin or a viola under the jaw of a body (design 5.3) with the rule of a
 * {@link ChinFit}. The tail end, the origin of the instrument piece, goes onto the left collarbone:
 * a share of the way to the left shoulder joint, above the base of the neck, and behind the front
 * of the upper chest. The instrument keeps the turn of the hold (`BowedHold.playTurn`), because it
 * is a direction that fits each body. Then the head turns down or up in {@link HEAD_DROP}, so that
 * the jaw presses the chin rest and the strings at the bow by `press`, and the instrument moves
 * up or down for the rest of the gap.
 *
 * @param model A player with a violin or a viola.
 * @param fit The rule of the place.
 * @param playTurn The turn of the instrument around its bone while the player plays.
 * @returns The play shift and the head turn.
 * @throws Error if the model has no instrument piece, no chin grip, or no bow contact.
 */
export function fitViolinPlace(model: PlayerModel, fit: ChinFit, playTurn: Quat): ViolinPlace {
  const piece = model.pieces.find((p) => p.piece.bone === 'instrument');
  const chin = model.instrument.grips.chin;
  const contact = model.instrument.targets.find((t) => t.kind === 'bow-contact');
  const nut = model.instrument.targets.find((t) => t.kind === 'fingerboard');
  if (!piece || !chin || !contact || !nut) {
    throw new Error(`The ${model.instrument.id} has no piece, no chin grip, or no targets.`);
  }
  const at = (bone: 'neck' | 'head' | 'upperArmL'): Vector3 =>
    new Vector3(...(model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0]));
  const h = model.body.headHeight;
  const shoulder = at('upperArmL');
  const pivot = new Vector3(...piece.at.position);
  const tail = new Vector3(
    shoulder.x * fit.side,
    Math.max(at('neck').y, shoulder.y) + fit.up * h,
    chestFront(model, shoulder) + fit.back * h,
  );

  // The points under the jaw in the play: the chin rest and the strings at the bow.
  const turn = new Quaternion(...playTurn);
  const played = (point: Vec3): Vector3 =>
    new Vector3(...point).sub(pivot).applyQuaternion(turn).add(tail);
  const points = [
    played(placePoint(model.pieces, chin)),
    played(placePoint(model.pieces, { bone: 'instrument', at: contact.from })),
  ];
  const { positions, bones } = model.mesh;
  const corners: Vector3[] = [];
  for (let v = 0; v < bones.length; v++) {
    if (HEAD_BONES.has(bones[v] ?? -1)) {
      corners.push(new Vector3().fromArray(positions, v * 3));
    }
  }
  const head = { corners, neck: at('neck'), head: at('head') };
  const radius =
    JAW_RADIUS *
    pivot.distanceTo(
      new Vector3(...placePoint(model.pieces, { bone: 'instrument', at: nut.from })),
    );

  // The smallest turn down at which the jaw reaches the press, and a move of the rest.
  const target = -fit.press * h;
  const [low, high] = HEAD_DROP;
  let drop = high;
  for (let angle = low; angle <= high + 1e-9; angle += DROP_STEP) {
    if (jawGap(head, points, radius, angle) <= target) {
      drop = angle;
      break;
    }
  }
  const gap = jawGap(head, points, radius, drop);
  if (Number.isFinite(gap)) {
    tail.y += gap - target;
  }
  return {
    playShift: toVec3(tail.sub(pivot).divideScalar(h)),
    headDrop: Number.isFinite(gap) ? drop : 0,
  };
}
