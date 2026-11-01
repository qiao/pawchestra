import { Matrix4, Quaternion, Vector3 } from 'three';

import { CELLO_PLACE, celloAxes } from '../models/instruments/cello-fit.ts';
import { VIOLIN } from '../models/instruments/strings.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';

/** The place of a cello from the body, as the move and the turn of a hold (`BowedHold`). */
export interface CelloPlace {
  /** The move of the cello from its bind place, in head heights. */
  readonly playShift: Vec3;
  /** The turn of the cello around its end pin, from its bind place. */
  readonly playTurn: Quat;
}

/** The number of points on the middle line of the back that the contact tests. */
const BACK_POINTS = 16;

/**
 * The bones of the trunk and the thighs, whose front the back of the cello rests on. The arms
 * hang beside the trunk in the bind pose, so they do not count.
 */
const FRONT_BONES = new Set(
  (['hips', 'spine', 'chest', 'neck', 'thighL', 'thighR'] as const).map((bone) => boneIndex(bone)),
);

/**
 * Finds the front of the trunk on the line along z through a point: the front-most crossing of
 * the line with a triangle of the trunk or the thighs of the bind pose. The player faces -z.
 *
 * @param model The player model.
 * @param x The x of the line.
 * @param y The y of the line.
 * @returns The z of the front, or `null` when the line misses the body.
 */
export function trunkFront(model: PlayerModel, x: number, y: number): number | null {
  const { positions, bones, blendBones } = model.mesh;
  const corner = (v: number, k: number): number => positions[v * 3 + k] ?? 0;
  const onTrunk = (v: number): boolean =>
    FRONT_BONES.has(bones[v] ?? -1) || FRONT_BONES.has(blendBones[v] ?? -1);
  let front: number | null = null;
  for (let v = 0; v + 2 < bones.length; v += 3) {
    if (!onTrunk(v)) {
      continue;
    }
    // The barycentric weights of the point in the triangle, seen from the front.
    const [ax, ay, bx, by, cx, cy] = [
      corner(v, 0),
      corner(v, 1),
      corner(v + 1, 0),
      corner(v + 1, 1),
      corner(v + 2, 0),
      corner(v + 2, 1),
    ];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) {
      continue;
    }
    const wb = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / area;
    const wc = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / area;
    const wa = 1 - wb - wc;
    if (wa >= 0 && wb >= 0 && wc >= 0) {
      const z = wa * corner(v, 2) + wb * corner(v + 1, 2) + wc * corner(v + 2, 2);
      front = front === null ? z : Math.min(front, z);
    }
  }
  return front;
}

/**
 * Finds the place of a cello at the body of a seated player (design 5.3), with the rule of
 * `CELLO_PLACE`: the end pin stands on the floor right of the middle, the cello leans back and to
 * the left, and it moves back until the middle line of its back stands `gap` in front of the
 * trunk or the thighs, as the cello of a real player leans back onto the chest
 * (`docs/reference/string-technique.md`, section 2.7). The end pin of the model fits the chest
 * (`celloPinOf()`), so the top of the back stands at the height of the chest.
 *
 * @param model A player with a cello.
 * @param gap The room between the middle line of the back and the front of the body, in head
 *   heights. Below 0, the back presses the front.
 * @returns The move and the turn of the cello from its bind place.
 * @throws Error if the model has no cello piece or no cello targets.
 */
export function fitCelloPlace(model: PlayerModel, gap: number): CelloPlace {
  const piece = model.pieces.find((p) => p.piece.bone === 'instrument');
  const nut = model.instrument.targets.find((t) => t.kind === 'fingerboard');
  const contact = model.instrument.targets.find((t) => t.kind === 'bow-contact');
  if (model.instrument.id !== 'cello' || !piece || !nut || !contact) {
    throw new Error(`The ${model.instrument.id} is no cello with its targets.`);
  }

  // The size and the end pin of the model, from the targets in the axes of the piece.
  const size = (nut.from[1] - contact.from[1]) / (VIOLIN.nut - VIOLIN.bowContact);
  const pin = contact.from[1] - VIOLIN.bowContact * size;
  const half = (VIOLIN.bodyThickness / 2) * size;

  const { axis, top } = celloAxes();
  const along = new Vector3(...axis);
  const back = new Vector3(...top).negate();
  const turn = playRotation(along, back);

  const h = model.body.headHeight;
  const tip = new Vector3(model.body.floor[0] + CELLO_PLACE.side * h, 0, 0);
  // The back moves only along z with the end pin, so one pass finds the place.
  let deepest = -Infinity;
  const point = new Vector3();
  for (let k = 0; k <= BACK_POINTS; k++) {
    const y = pin + (k / BACK_POINTS) * VIOLIN.bodyLength * size;
    point.set(0, y, half).applyQuaternion(turn).add(tip);
    const front = trunkFront(model, point.x, point.y);
    if (front !== null) {
      deepest = Math.max(deepest, point.z - front);
    }
  }
  if (Number.isFinite(deepest)) {
    tip.z -= deepest + gap * h;
  }
  const bindTurn = new Quaternion(...piece.at.rotation);
  return {
    playShift: toVec3(tip.sub(new Vector3(...piece.at.position)).divideScalar(h)),
    playTurn: toQuat(turn.multiply(bindTurn.invert())),
  };
}

/**
 * Gives the turn of a cello piece in its place: the piece runs along +y to the scroll, and its top
 * plate faces -z (`uprightRotation()` of `models/instruments/strings.ts`).
 *
 * @param along The unit direction from the end pin to the scroll.
 * @param back The unit direction from the top plate to the back.
 * @returns The turn from the axes of the piece to the model axes.
 */
function playRotation(along: Vector3, back: Vector3): Quaternion {
  const side = new Vector3().crossVectors(along, back);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, along, back));
}
