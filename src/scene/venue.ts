import type { Group, Scene, Vector3 } from 'three';

import { SCENE_COLORS } from '../models/colors.ts';
import type { PropColors } from '../models/colors.ts';
import type { Steps } from '../score/steps.ts';
import { buildEnvironmentScene } from './environment.ts';
import { createHall, setHallCamera } from './hall.ts';
import { HALL_LIGHTS } from './lights.ts';
import type { VenueLight } from './lights.ts';
import { HALL_POST } from './post.ts';
import type { VenuePost } from './post.ts';
import { HALL_STAGE } from './stage.ts';
import type { VenueStage } from './stage.ts';

/** The place around the stage (design 4.1). The hash key `scene` names it (design 2.8). */
export type VenueId = 'hall' | 'forest';

/**
 * The values and the builders of one venue (design 4.1): the surroundings, the environment of the
 * reflections, the light, the stage finish, the prop colors, and the post effects. The cast, the
 * layout, the stage outline, the camera, and the shots are the same in each venue.
 */
export interface Venue {
  readonly id: VenueId;
  /**
   * Builds the surroundings of a stage in steps (design 7.2). They take no light and cast no
   * shadow, and the depth passes of the beam hide them.
   *
   * @param stageSide The stage side `S`, in meters.
   * @returns The steps, which return the group of the surroundings.
   */
  surroundingsSteps(stageSide: number): Steps<Group>;
  /**
   * Sets the surroundings for the camera of a frame or of the capture: the cutaway of the parts
   * between the camera and the stage, and the size of the glows.
   *
   * @param surroundings The group of {@link Venue.surroundingsSteps}.
   * @param stageSide The stage side `S`, in meters.
   * @param camera The camera position.
   * @param pixels The height of the drawing buffer, in pixels.
   */
  frameSurroundings(surroundings: Group, stageSide: number, camera: Vector3, pixels: number): void;
  /**
   * Builds the scene that the PMREM environment of the reflections captures one time for the
   * venue. The caller frees its geometries and materials.
   *
   * @returns The scene, with its center at the origin.
   */
  environmentScene(): Scene;
  /** The values of the key, side, back-row, rim, fill, and conductor lights, and the beam. */
  readonly light: VenueLight;
  /** The stage colors, the finish of the wood, and the baked light of the sides. */
  readonly stage: VenueStage;
  /** The colors of the chairs, the stools, and the music stands, as linear RGB. */
  readonly props: PropColors;
  /** The bloom, the vignette, the grain, the room haze, the grade, and the clear color. */
  readonly post: VenuePost;
}

/** The concert hall (design 4.1, 4.5): the default venue, in the first download. */
export const HALL_VENUE: Venue = {
  id: 'hall',
  *surroundingsSteps(stageSide) {
    const hall = createHall(stageSide);
    yield;
    return hall;
  },
  frameSurroundings: setHallCamera,
  environmentScene: buildEnvironmentScene,
  light: HALL_LIGHTS,
  stage: HALL_STAGE,
  props: SCENE_COLORS,
  post: HALL_POST,
};
