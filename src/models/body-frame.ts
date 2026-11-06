/**
 * How a body rests in its bind pose (design 4.5, 4.7). A seated body sits on a seat, with the
 * thighs forward and the shins down to its feet. A standing body has straight legs, and its feet
 * are on the floor.
 */
export type Stance =
  | {
      /** The kind of the stance: on a seat. */
      readonly kind: 'seated';
      /** The height of the top of the seat above the floor, in meters. */
      readonly seatHeight: number;
      /** The height of the rest under the feet, in meters: 0 for the floor. */
      readonly footHeight: number;
      /**
       * The distance of the body in front of the seat center (-z), in meters, so that the torso
       * keeps clear of a chair back.
       */
      readonly forward: number;
    }
  | {
      /** The kind of the stance: on the floor, with no seat. */
      readonly kind: 'standing';
    };

/**
 * Makes the stance of a body on a seat.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param footHeight The height of the rest under the feet, in meters. Default: the floor.
 * @param forward The distance of the body in front of the seat center, in meters. Default: 0.
 * @returns The stance.
 */
export function seated(seatHeight: number, footHeight = 0, forward = 0): Stance {
  return { kind: 'seated', seatHeight, footHeight, forward };
}
