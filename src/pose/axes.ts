import { Quaternion, Vector3 } from 'three';

/** The x axis of the model axes: the left of the player is -x. Nothing writes it. */
export const X_AXIS = new Vector3(1, 0, 0);

/** The y axis of the model axes: up. Nothing writes it. */
export const Y_AXIS = new Vector3(0, 1, 0);

/** The z axis of the model axes: the player faces -z. Nothing writes it. */
export const Z_AXIS = new Vector3(0, 0, 1);

/** The rotation that changes nothing. Nothing writes it. */
export const NO_TURN = new Quaternion();
