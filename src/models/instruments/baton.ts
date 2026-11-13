import { INSTRUMENT_COLORS } from '../colors.ts';
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { transform } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { icosphere } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize } from './piece.ts';
import type { InstrumentModel } from './types.ts';

/**
 * The distance of the tip of the baton from the grip, in meters. With the handle, the baton is
 * 0.51 m long (design 4.6). A baton of 0.40 m looks short.
 */
export const BATON_TIP = 0.49;

/**
 * The radii of the stick of the baton at the grip and at the tip, in meters. The baton of
 * `bear-views.png` is a thick stick, about 2 cm at the paw. A stick of 3 mm is a thin line in the
 * sheet page and on the stage.
 */
const BATON_RADII = [0.008, 0.0045] as const;

/**
 * The turn of the stick of the baton from the line of the fingers toward the thumb, in the plane
 * of the palm. The stick leaves the fist on the side of the thumb and the first fingers, which
 * hold it (`conductor-technique.md`, section 7a).
 */
const STICK_TO_THUMB = 30 * MathUtils.DEG2RAD;

/**
 * The turn of the stick of the baton from the line of the fingers toward the palm. The butt lies
 * in the heel of the palm, and the stick leaves the paw through the palm, under the curled
 * claws, so that the closed paw grips it. With the stick in the plane of the palm, it ran through
 * the middle of the thick paw of the Tripo bear and came out at the tips of the claws. The turn
 * also brings the paw near the line of the forearm in the beat: the paw bent 41° to 59° toward
 * the palm from the forearm with the stick in the plane of the palm, and 12° to 29° with it.
 */
const STICK_TO_PALM = 30 * MathUtils.DEG2RAD;

/**
 * The direction of the stick of the baton in the bind pose, from the grip to the tip, in the
 * model axes: in the hanging right hand, along the fingers (down), turned toward the thumb (to
 * the front, {@link STICK_TO_THUMB}) and toward the palm (in, {@link STICK_TO_PALM}). A conductor
 * holds the baton with the thumb and the first fingers, with its butt against the palm, so that
 * the stick extends the line of the forearm (design 4.6). A stick across the fist points 90°
 * from the fingers.
 */
export const BATON_ALONG: Vec3 = [
  -Math.sin(STICK_TO_PALM),
  -Math.cos(STICK_TO_PALM) * Math.cos(STICK_TO_THUMB),
  -Math.cos(STICK_TO_PALM) * Math.sin(STICK_TO_THUMB),
];

/**
 * The top of the baton in the bind pose, in the model axes, square to {@link BATON_ALONG}: the
 * back of the hanging right hand (+x, out) turned 30° toward the thumb (to the front). The pose
 * turns this axis up, so that the palm faces the floor and a little inward, as a conductor holds
 * it in the beat (`batonHand()` of `pose/conductor.ts`).
 */
export const BATON_TOP: Vec3 = topOf(BATON_ALONG, 30);

/**
 * Finds the top of the baton: the back of the hanging right hand turned toward the thumb, made
 * square to the stick.
 *
 * @param along The unit direction of the stick.
 * @param degrees The turn of the back of the hand toward the thumb.
 * @returns The unit top.
 */
function topOf(along: Vec3, degrees: number): Vec3 {
  const stick = new Vector3(...along);
  const angle = MathUtils.DEG2RAD * degrees;
  const top = new Vector3(Math.cos(angle), 0, -Math.sin(angle));
  return toVec3(top.addScaledVector(stick, -top.dot(stick)).normalize());
}

/**
 * The grip of the baton from the middle of the palm, in head heights, in the model axes: up
 * toward the heel of the palm, in toward the palm, and a little back from the line of the index
 * finger. The butt of the stick then lies in the heel of the palm, inside the paw, and the stick
 * leaves the paw through the palm. The grip of the stick in the middle of the paw (-0.03, 0.05,
 * -0.04) put the butt in the middle of the thick paw of the Tripo bear.
 */
const BATON_GRIP: Vec3 = [-0.08, 0.09, 0.02];

/**
 * Builds the baton of the conductor (design 4.6): a straight white stick that tapers to the tip,
 * with a round handle. The grip is at the origin, and the stick runs along +x to the tip. In the
 * bind pose, its butt lies in the heel of the palm of the hanging right hand, and the stick
 * leaves the paw through the palm toward the thumb ({@link BATON_ALONG}).
 *
 * @returns The model.
 */
export function buildBaton(): InstrumentModel {
  const color = INSTRUMENT_COLORS.baton;
  const piece = new PieceBuilder();
  piece.add(icosphere(0.016), color, transform([0, 0, 0], undefined, [1.6, 1, 1]));
  piece.taper([0.02, 0, 0], [BATON_TIP, 0, 0], BATON_RADII[0], BATON_RADII[1], 6, color);
  // The x axis of the baton turns along the fingers, and its y axis to the top.
  const xAxis = new Vector3(...BATON_ALONG);
  const yAxis = new Vector3(...BATON_TOP);
  const turn = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(xAxis, yAxis, new Vector3().crossVectors(xAxis, yAxis)),
  );
  const baton = piece.build('baton', hold('palmR', BATON_GRIP, toQuat(turn)));
  const tip = [BATON_TIP, 0, 0] as const;
  return {
    id: 'baton',
    parent: 'chest',
    pieces: [baton],
    grips: { palmL: null, palmR: { bone: 'baton', at: [0, 0, 0] }, mouth: null, chin: null },
    targets: [{ kind: 'tip', bone: 'baton', from: tip, to: tip, normal: [1, 0, 0], keys: null }],
    size: pieceSize(baton),
  };
}
