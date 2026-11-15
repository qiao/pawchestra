import { MathUtils } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import { lastAtOrBefore } from '../pose/blend.ts';
import { smoothstep } from '../math.ts';
import type { Transport } from '../pose/types.ts';
import { SHOT_BEAM_OPACITY } from './beam-opacity.ts';
import { keyDistance, writeKeyPosition } from './camera-keys.ts';
import { CAMERA_DRIFT, turnTarget, writeDrift } from './drift.ts';
import { writeLookPoint } from './grammar.ts';
import { writeShadowFit } from './shadow-fit.ts';
import { SHOT_LIGHT, SHOT_SPOT } from './shot-light.ts';
import { isCloseShot } from './types.ts';
import type { CameraPose, CameraPoseBuffer, CameraView, Shot, ShotKey, ShotPlan } from './types.ts';
import { FIELD_OF_VIEW, defaultView, wideView } from './view.ts';

/**
 * Makes a camera buffer for {@link cameraAt}.
 *
 * @returns A buffer at the origin.
 */
export function createCameraPose(): CameraPoseBuffer {
  return {
    position: [0, 0, 0],
    target: [0, 0, 0],
    fov: FIELD_OF_VIEW,
    beam: 1,
    close: false,
    light: 0,
    spot: 0,
    focusPull: 1,
    hero: null,
    heroFrom: null,
    heroShare: 1,
    detail: false,
    shadowFit: [0, 0, 0, 0],
  };
}

/**
 * The focus pull after a hard cut into a close shot (design 5.6): the focus starts behind the
 * subject and pulls onto it, as the focus puller of a film camera finds the subject after a cut.
 */
export const FOCUS_PULL = {
  /**
   * The focus distance at the cut, as a factor of the distance to the subject. The blur in front
   * of the focus has a limit (`LENS.maxNearBlur`), so the subject is only a little soft.
   */
  start: 1.3,
  /** The length of the pull, in song seconds. */
  seconds: 0.7,
} as const;

/**
 * The establishing move of the opening shot (design 5.6). The film starts from black (2.5), so the
 * first camera can stand higher and farther than the default view of the first screen. It then
 * cranes down and pushes in to the low wide view over the opening, a reveal of the whole
 * orchestra, as the first shot of a concert film. The end key of the opening does not change, so
 * the shots after it do not change. With reduced motion, the opening holds the default view.
 */
export const ESTABLISH_MOVE = {
  /** The rise of the first camera above the elevation of the default view, in degrees. */
  riseDeg: 8,
  /** The distance of the first camera, as a factor of the distance of the default view. */
  pullBack: 1.2,
} as const;

/** The key of the frame, which `cameraAt()` writes before it reads it. */
interface ScratchKey {
  azimuth: number;
  elevation: number;
  zoom: number;
  fov: number;
}

const scratchKey: ScratchKey = { azimuth: 0, elevation: 0, zoom: 1, fov: FIELD_OF_VIEW };

/** The first key of the establishing move, which `cameraAt()` writes before it reads it. */
const establishKey: ScratchKey = { azimuth: 0, elevation: 0, zoom: 1, fov: FIELD_OF_VIEW };

const blendStart: [number, number, number] = [0, 0, 0];

const blendLook: [number, number, number] = [0, 0, 0];

const driftTurn: [number, number] = [0, 0];

/**
 * Writes the camera of a shot at a part of its move, and the point that it looks at for the
 * composition of the shot (design 5.6). A wide shot follows the landscape rule and the portrait
 * rule of design 4.5.
 *
 * @param plan The plan.
 * @param shot The shot.
 * @param u The eased part of the move, from 0 to 1.
 * @param aspect The aspect of the view.
 * @param out The position to write.
 * @param look The point to write that the camera looks at.
 * @param from The key at the start of the move: the `from` key of the shot by default.
 * @returns The vertical field of view, in degrees.
 */
function writeShotCamera(
  plan: ShotPlan,
  shot: Shot,
  u: number,
  aspect: number,
  out: [number, number, number],
  look: [number, number, number],
  from: ShotKey = shot.from,
): number {
  const a: ShotKey = from;
  const b: ShotKey = shot.to;
  const key = scratchKey;
  key.azimuth = a.azimuth + (b.azimuth - a.azimuth) * u;
  key.elevation = a.elevation + (b.elevation - a.elevation) * u;
  key.zoom = a.zoom + (b.zoom - a.zoom) * u;
  key.fov = a.fov + (b.fov - a.fov) * u;
  if (shot.kind === 'wide') {
    // The landscape and portrait rules (design 4.5). The larger zoom of the two keys is the zoom
    // of the variant.
    const variant = Math.max(shot.from.zoom, b.zoom);
    const wide = wideView(key.azimuth, key.elevation, key.zoom, variant, aspect);
    key.azimuth = wide.azimuth;
    key.elevation = wide.elevation;
    key.zoom = wide.zoom;
  }
  const distance = keyDistance(plan.stageSide, shot.halfHeight, key, aspect);
  writeKeyPosition(shot.target, key.azimuth, key.elevation, distance, out);
  writeLookPoint(out, shot.target, shot.composition, key.fov, aspect, look);
  return key.fov;
}

/**
 * Writes the first key of the establishing move ({@link ESTABLISH_MOVE}): the `from` key of the
 * opening shot, higher and farther.
 *
 * @param from The `from` key of the opening shot: the default view.
 * @returns The key.
 */
function establishFrom(from: ShotKey): ShotKey {
  const key = establishKey;
  key.azimuth = from.azimuth;
  key.elevation = from.elevation + ESTABLISH_MOVE.riseDeg * MathUtils.DEG2RAD;
  key.zoom = from.zoom * ESTABLISH_MOVE.pullBack;
  key.fov = from.fov;
  return key;
}

/**
 * Copies a point into a writable tuple.
 *
 * @param from The point.
 * @param out The tuple to write.
 */
function copyPoint(from: Vec3, out: [number, number, number]): void {
  out[0] = from[0];
  out[1] = from[1];
  out[2] = from[2];
}

/**
 * Gives the factor of the focus distance of the focus pull after a hard cut into a close shot
 * ({@link FOCUS_PULL}).
 *
 * @param sinceCut The song time since the cut, in seconds.
 * @returns The factor: {@link FOCUS_PULL}.start at the cut, 1 at the end of the pull.
 */
function pullAt(sinceCut: number): number {
  if (sinceCut >= FOCUS_PULL.seconds) {
    return 1;
  }
  const pulled = smoothstep(Math.max(0, sinceCut) / FOCUS_PULL.seconds);
  return FOCUS_PULL.start + (1 - FOCUS_PULL.start) * pulled;
}

/**
 * Writes the camera of a detail insert (design 5.6): a hard cut into the insert, its slow
 * push-in, and the focus pull onto the detail. The main shot moves on under the insert, so the
 * cut back shows the main shot at its time, with no focus pull, as the camera of the main shot
 * kept its focus. With `still`, the insert holds its `from` key and its focus.
 *
 * @param plan The plan.
 * @param insert The insert of the time.
 * @param time The time of the frame, in song seconds.
 * @param view The aspect and the motion preference.
 * @param out The camera to write.
 * @returns `out`.
 */
function writeInsert(
  plan: ShotPlan,
  insert: Shot,
  time: number,
  view: CameraView,
  out: CameraPoseBuffer,
): CameraPose {
  const { aspect, still } = view;
  const span = insert.moveEndSec - insert.startSec;
  const sinceCut = time - insert.startSec;
  const u = still || span <= 0 ? 0 : smoothstep(sinceCut / span);
  out.fov = writeShotCamera(plan, insert, u, aspect, out.position, out.target);
  out.beam = SHOT_BEAM_OPACITY.insert;
  out.light = SHOT_LIGHT.insert;
  out.spot = SHOT_SPOT.insert;
  out.close = true;
  out.focusPull = still ? 1 : pullAt(sinceCut);
  out.hero = insert.hero;
  out.heroFrom = insert.hero;
  out.heroShare = 1;
  out.detail = true;
  writeShadowFit(insert, null, out.shadowFit);
  if (!still) {
    writeDrift(time, CAMERA_DRIFT.shares.insert, driftTurn);
    turnTarget(out.position, out.target, driftTurn);
  }
  return out;
}

/**
 * Calculates the camera of one frame from the song time (design 5.6). Pure: the same plan, song
 * time, transport, and view give the same camera, so a seek, a pause, and a speed change are
 * always correct.
 *
 * 1. Before the first play, the camera is the default view of design 4.5.
 * 2. During play, the time is at least the start point, so the count-in holds the camera of the
 *    start point. While paused, the time is the song time.
 * 3. The shot of the time moves from its `from` key to its `to` key with a smoothstep. With
 *    `still`, it holds its `from` key. A wide shot follows the landscape rule and the portrait
 *    rule of design 4.5. With no `still`, the opening shot starts higher and farther
 *    ({@link ESTABLISH_MOVE}).
 * 4. In the blend time after its start, the shot blends from the end camera of the previous
 *    shot. With `still`, each cut is hard.
 * 5. The factor of the beam opacity comes from the kind of the shot, so it is constant in a
 *    shot. A blend blends it with the camera. The default view has the full beam.
 * 6. A close shot sets `close`, so that its full frame stands in the free area of the page. Its
 *    camera looks at the point of its composition, so that the subject stands on a third line.
 *    The camera turns around the target of the shot.
 * 7. The weights of the light of a close shot and of the follow-spot come from the kind of the
 *    shot, as the factor of the beam. The default view has the light of the stage.
 * 8. The view drifts a little around the camera position ({@link CAMERA_DRIFT}), with the size of
 *    the kind of the shot, blended as the beam. With `still`, it does not drift.
 * 9. The pose names the hero of the shot, whose nearer eye the scene finds and focuses on. A
 *    blend moves the focus from the eye of the hero of the previous shot. After a hard cut into a
 *    close shot, the focus pulls onto the eye ({@link FOCUS_PULL}). With `still`, the focus is
 *    on the eye.
 * 10. A shot from the front of players fits the shadow map of the key light to a sphere around
 *    its target (`writeShadowFit()`). A blend holds the spheres of both shots.
 * 11. In the time of a detail insert, the insert takes the frame, with a hard cut in and out
 *    (`writeInsert()`). The main shot of the time moves on under it.
 *
 * @param plan The plan from `prepareShots()`.
 * @param songTime The song time, in seconds.
 * @param transport The play state.
 * @param view The aspect and the motion preference.
 * @param out The camera to write. A new buffer by default.
 * @returns `out`, with the camera of the frame.
 */
export function cameraAt(
  plan: ShotPlan,
  songTime: number,
  transport: Transport,
  view: CameraView,
  out: CameraPoseBuffer = createCameraPose(),
): CameraPose {
  const { aspect, still } = view;
  const time = transport.playing ? Math.max(songTime, transport.startSec) : songTime;
  const i = Math.max(0, lastAtOrBefore(plan.starts, time));
  const current = plan.shots[i];
  if (transport.changedAtWall === null || !current) {
    const first = defaultView(plan.stageSide, aspect, 1);
    copyPoint(first.position, out.position);
    copyPoint(first.target, out.target);
    out.fov = FIELD_OF_VIEW;
    out.beam = 1;
    out.close = false;
    out.light = 0;
    out.spot = 0;
    out.focusPull = 1;
    out.hero = null;
    out.heroFrom = null;
    out.heroShare = 1;
    out.detail = false;
    out.shadowFit[3] = 0;
    return out;
  }
  const insert = plan.inserts[lastAtOrBefore(plan.insertStarts, time)];
  if (insert && time < insert.endSec) {
    return writeInsert(plan, insert, time, view, out);
  }
  // The move of the first shot starts at the downbeat: its count-in holds the first camera.
  const moveStart = Math.max(current.startSec, 0);
  const span = current.moveEndSec - moveStart;
  const u = still || span <= 0 ? 0 : smoothstep((time - moveStart) / span);
  // The opening shot is the first shot, from `-Infinity` (design 5.6).
  const from = i === 0 && !still ? establishFrom(current.from) : current.from;
  out.fov = writeShotCamera(plan, current, u, aspect, out.position, out.target, from);
  out.beam = SHOT_BEAM_OPACITY[current.kind];
  out.light = SHOT_LIGHT[current.kind];
  out.spot = SHOT_SPOT[current.kind];
  // A blend joins two close shots, so the kind of the current shot holds for the blend.
  out.close = isCloseShot(current.kind);
  out.focusPull = 1;
  out.hero = current.hero;
  out.heroFrom = current.hero;
  out.heroShare = 1;
  out.detail = false;
  const previous = plan.shots[i - 1];
  const sinceCut = time - current.startSec;
  const share = CAMERA_DRIFT.shares[current.kind];
  if (still || !previous || current.blendSec <= 0 || sinceCut >= current.blendSec) {
    writeShadowFit(current, null, out.shadowFit);
    if (!still && previous && current.blendSec <= 0 && out.close) {
      out.focusPull = pullAt(sinceCut);
    }
    if (!still) {
      writeDrift(time, share, driftTurn);
      turnTarget(out.position, out.target, driftTurn);
    }
    return out;
  }
  writeShadowFit(current, previous, out.shadowFit);
  const w = smoothstep(sinceCut / current.blendSec);
  out.heroFrom = previous.hero;
  out.heroShare = w;
  const fov = writeShotCamera(plan, previous, 1, aspect, blendStart, blendLook);
  for (let k = 0; k < 3; k++) {
    const p = blendStart[k] ?? 0;
    const t = blendLook[k] ?? 0;
    out.position[k] = p + ((out.position[k] ?? 0) - p) * w;
    out.target[k] = t + ((out.target[k] ?? 0) - t) * w;
  }
  out.fov = fov + (out.fov - fov) * w;
  const beam = SHOT_BEAM_OPACITY[previous.kind];
  out.beam = beam + (out.beam - beam) * w;
  const light = SHOT_LIGHT[previous.kind];
  out.light = light + (out.light - light) * w;
  const spot = SHOT_SPOT[previous.kind];
  out.spot = spot + (out.spot - spot) * w;
  const before = CAMERA_DRIFT.shares[previous.kind];
  writeDrift(time, before + (share - before) * w, driftTurn);
  turnTarget(out.position, out.target, driftTurn);
  return out;
}
