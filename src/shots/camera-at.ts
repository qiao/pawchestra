import type { Vec3 } from '../models/tuples.ts';
import { lastAtOrBefore } from '../pose/blend.ts';
import { smoothstep } from '../pose/rest.ts';
import type { Transport } from '../pose/types.ts';
import { SHOT_BEAM_OPACITY } from './beam-opacity.ts';
import { keyDistance, writeKeyPosition } from './camera-keys.ts';
import { writeLookPoint } from './grammar.ts';
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
  };
}

/** The key of the frame, which `cameraAt()` writes before it reads it. */
interface ScratchKey {
  azimuth: number;
  elevation: number;
  zoom: number;
  fov: number;
}

const scratchKey: ScratchKey = { azimuth: 0, elevation: 0, zoom: 1, fov: FIELD_OF_VIEW };

const blendStart: [number, number, number] = [0, 0, 0];

const blendLook: [number, number, number] = [0, 0, 0];

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
 * @returns The vertical field of view, in degrees.
 */
function writeShotCamera(
  plan: ShotPlan,
  shot: Shot,
  u: number,
  aspect: number,
  out: [number, number, number],
  look: [number, number, number],
): number {
  const a: ShotKey = shot.from;
  const b: ShotKey = shot.to;
  const key = scratchKey;
  key.azimuth = a.azimuth + (b.azimuth - a.azimuth) * u;
  key.elevation = a.elevation + (b.elevation - a.elevation) * u;
  key.zoom = a.zoom + (b.zoom - a.zoom) * u;
  key.fov = a.fov + (b.fov - a.fov) * u;
  if (shot.kind === 'wide') {
    // The landscape and portrait rules (design 4.5). The larger zoom of the two keys is the zoom
    // of the variant.
    const wide = wideView(key.azimuth, key.elevation, key.zoom, Math.max(a.zoom, b.zoom), aspect);
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
 * Calculates the camera of one frame from the song time (design 5.6). Pure: the same plan, song
 * time, transport, and view give the same camera, so a seek, a pause, and a speed change are
 * always correct.
 *
 * 1. Before the first play, the camera is the default view of design 4.5.
 * 2. During play, the time is at least the start point, so the count-in holds the camera of the
 *    start point. While paused, the time is the song time.
 * 3. The shot of the time moves from its `from` key to its `to` key with a smoothstep. With
 *    `still`, it holds its `from` key. A wide shot follows the landscape rule and the portrait
 *    rule of design 4.5.
 * 4. In the blend time after its start, the shot blends from the end camera of the previous
 *    shot. With `still`, each cut is hard.
 * 5. The factor of the beam opacity comes from the kind of the shot, so it is constant in a
 *    shot. A blend blends it with the camera. The default view has the full beam.
 * 6. A close shot sets `close`, so that its full frame stands in the free area of the page. Its
 *    camera looks at the point of its composition, so that the subject stands on a third line.
 *    The camera turns around the target of the shot.
 * 7. The weights of the light of a close shot and of the follow-spot come from the kind of the
 *    shot, as the factor of the beam. The default view has the light of the stage.
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
    return out;
  }
  // The move of the first shot starts at the downbeat: its count-in holds the first camera.
  const moveStart = Math.max(current.startSec, 0);
  const span = current.moveEndSec - moveStart;
  const u = still || span <= 0 ? 0 : smoothstep((time - moveStart) / span);
  out.fov = writeShotCamera(plan, current, u, aspect, out.position, out.target);
  out.beam = SHOT_BEAM_OPACITY[current.kind];
  out.light = SHOT_LIGHT[current.kind];
  out.spot = SHOT_SPOT[current.kind];
  // A blend joins two close shots, so the kind of the current shot holds for the blend.
  out.close = isCloseShot(current.kind);
  const previous = plan.shots[i - 1];
  const sinceCut = time - current.startSec;
  if (still || !previous || current.blendSec <= 0 || sinceCut >= current.blendSec) {
    return out;
  }
  const w = smoothstep(sinceCut / current.blendSec);
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
  return out;
}
