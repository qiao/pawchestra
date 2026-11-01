import { MathUtils, Vector3 } from 'three';

import type { BodyBones } from '../biped.ts';
import { toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { STRING_SCALES, VIOLIN } from './strings.ts';

/**
 * The rule of the place of a cello at a seated body (design 4.6, 5.3), as a real cellist holds it
 * (`docs/reference/string-technique.md`, section 2.7): the end pin stands on the floor between the
 * feet, the cello leans back onto the chest, the top of its back rests on the chest, and the neck
 * passes the left side of the head. The values come from the accepted hold of the dog cellist
 * (`DOG_HOLD` of `pose/bowed-rig.ts`), so that the rule gives its place back.
 */
export const CELLO_PLACE = {
  /**
   * The height of the top of the back of the body: the share of the way from the hip joints up to
   * the shoulder joints. The top of the body rests on the chest below the shoulders.
   */
  chest: 0.8,
  /** The lean of the axis back toward the chest, from the vertical, in radians. */
  back: 25.7 * MathUtils.DEG2RAD,
  /** The lean of the axis to the left, from the vertical, so that the neck passes the head. */
  left: 14 * MathUtils.DEG2RAD,
  /** The turn of the top plate to the right of the front, around the vertical, in radians. */
  turn: 6 * MathUtils.DEG2RAD,
  /** The place of the end pin to the right of the middle of the body, in head heights. */
  side: 0.18,
  /** The shortest end pin, in meters. A cello that is too long for the chest stands on it. */
  minPin: 0.05,
} as const;

/** The axes of a cello in its place (design 4.6), in the model axes. */
export interface CelloAxes {
  /** The unit direction from the end pin to the scroll. */
  readonly axis: Vec3;
  /** The unit normal of the top plate, to the strings. */
  readonly top: Vec3;
}

/**
 * Gives the axes of a cello at the place of {@link CELLO_PLACE}.
 *
 * @returns The axis and the normal of the top plate.
 */
export function celloAxes(): CelloAxes {
  const { back, left, turn } = CELLO_PLACE;
  const axis = new Vector3(-Math.tan(left), 1, Math.tan(back)).normalize();
  const front = new Vector3(Math.sin(turn), 0, -Math.cos(turn));
  const top = front.addScaledVector(axis, -front.dot(axis)).normalize();
  return { axis: toVec3(axis), top: toVec3(top) };
}

/**
 * Gives the height of the top of the back of a cello at a body: the chest of
 * {@link CELLO_PLACE}.
 *
 * @param body The body in its bind pose.
 * @returns The height, in meters.
 */
export function celloChestHeight(body: BodyBones): number {
  const hips = body.positions.hips[1];
  const shoulders = (body.positions.upperArmL[1] + body.positions.upperArmR[1]) / 2;
  return hips + CELLO_PLACE.chest * (shoulders - hips);
}

/**
 * Gives the length of the end pin of a cello below the tail end for a body (design 4.6), as a
 * cellist sets the end pin: with the lean of {@link CELLO_PLACE}, the top of the back of the body
 * rests at the height of the chest ({@link celloChestHeight}). A cello that is too long for the
 * chest takes the shortest end pin, and its top stands higher.
 *
 * @param body The body in its bind pose.
 * @param scale The scale of the cello, as a factor of the cello of the app.
 * @returns The length, in meters.
 */
export function celloPinOf(body: BodyBones, scale: number): number {
  const size = STRING_SCALES.cello * scale;
  const { axis, top } = celloAxes();
  // The back of the body lies half the depth of the ribs behind the axis of the end pin.
  const backY = (-top[1] * VIOLIN.bodyThickness * size) / 2;
  const pin = (celloChestHeight(body) - backY) / axis[1] - VIOLIN.bodyLength * size;
  return Math.max(CELLO_PLACE.minPin, pin);
}
