import type { BoneName } from '../models/rig.ts';
import type { CameraMode } from './camera-mode.ts';
import type { InstrumentId } from '../models/instruments/types.ts';

/**
 * The values of the page that the smoke test reads (`tools/smoke.ts`, design 9.3). Only the dev
 * server gives `window.pawchestra`, so the build does not hold it.
 */
export interface DevHook {
  /** The song time of the last frame, in seconds: `Player.now()` after the load, else 0. */
  readonly songTime: number;
  /** True while the transport plays. */
  readonly playing: boolean;
  /** Cinematic or Free (design 2.5). */
  readonly cameraMode: CameraMode;
  /** The position of the camera of the last frame, or an empty list with no scene. */
  readonly cameraPosition: readonly number[];
  /** The instrument of each player of the current demo, in the order of `ScenePose.players`. */
  readonly instruments: readonly InstrumentId[];
  /**
   * Gives the rotation of a bone of a player in the last frame.
   *
   * @param player The index of the player in `ScenePose.players`.
   * @param bone The bone.
   * @returns The quaternion (x, y, z, w), or an empty list with no such player.
   */
  rotation(player: number, bone: BoneName): number[];
}

/**
 * The selector that matches when the samples of the current piece are ready. `App` sets the
 * attribute `data-samples` of the body to the `SampleState` of the piece. The smoke test, the
 * frame measure, and the screenshot script wait for it.
 */
export const SAMPLES_READY = 'body[data-samples="ready"]';

/** The selector of the play button of the first screen (design 2.2, 2.8). */
export const FIRST_PLAY = '.first-screen .play';

declare global {
  interface Window {
    /** The values of the page for the smoke test. Only the dev server sets it. */
    pawchestra?: DevHook;
  }
}
