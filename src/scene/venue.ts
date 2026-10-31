import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RedFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { Texture, Vector3 } from 'three';

import { SCENE_COLORS } from '../models/colors.ts';
import type { PropColors } from '../models/colors.ts';
import { srgb } from '../models/mesh.ts';
import { byteReader, readByte, readVarint, unzigzag } from '../models/packed-bytes.ts';
import { STAGE_CORNER_CUT, STAGE_THICKNESS, plankHash } from '../models/stage.ts';
import type { Steps } from '../score/steps.ts';
import { buildEnvironmentScene } from './environment.ts';
import type { ForestKit } from './forest.ts';
import { createHall, setHallCamera } from './hall.ts';
import { HALL_LIGHTS } from './lights.ts';
import type { VenueLight } from './lights.ts';
import { HALL_POST } from './post.ts';
import type { VenuePost } from './post.ts';
import { HALL_STAGE } from './stage.ts';
import type { VenueStage } from './stage.ts';
import type { VenueId } from './venue-id.ts';

/** The depth of the stage items of a frame, which the surroundings can read (design 4.1). */
export interface FrameDepth {
  /** The depth texture of the frame with no surroundings and no light effects. */
  readonly texture: Texture;
  /** The width and the height of the drawing buffer, in pixels. */
  readonly size: readonly [number, number];
  /** The near plane of the camera, in meters. */
  readonly near: number;
  /** The far plane of the camera, in meters. */
  readonly far: number;
}

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
   * @param depth The depth of the stage items of the frame, or null with no depth pass, such as
   *   for the capture of the environment.
   */
  frameSurroundings(
    surroundings: Group,
    stageSide: number,
    camera: Vector3,
    pixels: number,
    depth: FrameDepth | null,
  ): void;
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

/**
 * Gives the venue of an id (design 4.1, 7.2). The hall is in the first download, and the forest
 * loads as a chunk of its own at its first use.
 *
 * @param id The venue.
 * @returns A promise of the venue.
 * @throws Error if the chunk of the forest does not load. The app then stays in the hall.
 */
export async function loadVenue(id: VenueId): Promise<Venue> {
  if (id === 'hall') {
    return HALL_VENUE;
  }
  const { forestVenue } = await import('./forest.ts');
  return forestVenue(FOREST_KIT);
}

/** The runtime parts of the first download that the chunk of the forest uses (design 7.2). */
const FOREST_KIT: ForestKit = {
  three: {
    AdditiveBlending,
    BackSide,
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    Color,
    DataTexture,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    RedFormat,
    Scene,
    ShaderMaterial,
    SphereGeometry,
  },
  readers: { byteReader, readByte, readVarint, unzigzag, srgb },
  plankHash,
  floorY: -STAGE_THICKNESS,
  cornerCut: STAGE_CORNER_CUT,
};
