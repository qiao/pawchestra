import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { STAGE_THICKNESS } from '../models/stage.ts';
import type { Vec3 } from '../models/tuples.ts';
import {
  NO_CLEAR,
  boxOnCanvas,
  clearFirstScreen,
  clearedFrame,
  viewFrame,
  viewOffset,
} from '../shots/frame.ts';
import type { FrameClear, FrameCover, ScreenBox, ViewFrame } from '../shots/frame.ts';
import type { CameraPose } from '../shots/types.ts';
import {
  CINEMA_ASPECT,
  ELEVATION_LIMITS,
  FIELD_OF_VIEW,
  MAX_DISTANCE_FACTOR,
  MIN_DISTANCE,
  NEAR,
  defaultView,
  farPlane,
  orbitMinDistance,
} from '../shots/view.ts';

import { letterbox, mixBox } from './letterbox.ts';
import type { FrameBox } from './letterbox.ts';
import { blendShare, mix, modeBlendWeight, startOrbitBlend, stepOrbitBlend } from './mode-blend.ts';
import type { OrbitBlend, OrbitView } from './mode-blend.ts';
import { clamp01, smoothstep } from '../math.ts';

/**
 * The move of the orbit target to the stage center after a change from a close shot to Free mode
 * (design 2.5). With no move, a drag in a close shot turns the view around a point 4 m away, and
 * the camera looks lost.
 */
const FREE_TARGET_GLIDE = {
  /** The time of the move, in milliseconds. */
  durationMs: 400,
  /** A target nearer than this distance to the stage center does not move, in meters. */
  minDistance: 1,
  /**
   * In the same move, the camera moves out from the stage center to at least this part of the
   * distance of the default view. With no move out, the camera stays 4 m from the stage center
   * after a drag in a close shot, among the stands.
   */
  outShare: 0.6,
} as const;

/**
 * The glide of the frame after a change of the parts of the page over the canvas (design 2.8):
 * the frame follows its new place with this time constant, in milliseconds. It reaches 98% of
 * the move in about 200 ms, as the drawer and the first screen do. With reduced motion, it moves
 * at once.
 */
const FRAME_GLIDE_MS = 50;

/**
 * The glide of the scale of the frame that keeps the stage clear of the play button of the first
 * screen (design 2.8): its time constant, in milliseconds. After the first play, the stage grows
 * to the default view in about 0.4 s, as a short push-in. With reduced motion, it changes at once.
 */
const CLEAR_GLIDE_MS = 120;

/**
 * Moves a value toward its target in a frame: the rest of the way shrinks by `exp(-dt / time)`.
 *
 * @param value The value of the last frame.
 * @param target The target.
 * @param dtMs The time since the last frame, in milliseconds.
 * @param timeMs The time constant, in milliseconds.
 * @param rest The value is the target when less than this remains.
 * @returns The new value.
 */
function glideTo(
  value: number,
  target: number,
  dtMs: number,
  timeMs: number,
  rest: number,
): number {
  const next = target + (value - target) * Math.exp(-dtMs / timeMs);
  return Math.abs(next - target) < rest ? target : next;
}

/** A point or a direction, which `#stageBox()` and `#nearLimit()` write before they read it. */
const scratchPoint = new Vector3();

/** The camera position and the view matrix of `#stageBox()`, which it writes before it reads. */
const scratchEye = new Vector3();
const scratchView = new Matrix4();

/** The scale of the view matrix of `#stageBox()`. */
const UNIT_SCALE = new Vector3(1, 1, 1);

/**
 * Gives the box of a frame of the aspect of the canvas.
 *
 * @param frame The frame.
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @returns The box of the image of the camera.
 */
function boxOfFrame(frame: ViewFrame, width: number, height: number): FrameBox {
  return { x: frame.x, y: frame.y, width: width * frame.scale, height: height * frame.scale };
}

/**
 * Gives the box of the stage on the canvas from its box in the units of the view (from -1 to 1, y
 * up), for an image box of any aspect.
 *
 * @param box The box of the stage in the units of the view: left, bottom, right, and top.
 * @param image The box of the image of the camera, in CSS pixels.
 * @returns The box of the stage on the canvas.
 */
function stageOnCanvas(box: ScreenBox, image: FrameBox): ScreenBox {
  const halfWidth = image.width / 2;
  const halfHeight = image.height / 2;
  return {
    left: image.x + box.left * halfWidth,
    right: image.x + box.right * halfWidth,
    top: image.y - box.top * halfHeight,
    bottom: image.y - box.bottom * halfHeight,
  };
}

/**
 * Applies a clear of the first screen to an image box: it scales the box by the factor around the
 * fixed point, as `clearedFrame()` does for a frame.
 *
 * @param box The box.
 * @param clear The clear.
 * @returns The box with the clear.
 */
function clearedBox(box: FrameBox, clear: FrameClear): FrameBox {
  const { factor, x, y } = clear;
  return {
    x: x + (box.x - x) * factor,
    y: y + (box.y - y) * factor,
    width: box.width * factor,
    height: box.height * factor,
  };
}

/** The move of the orbit target that runs: its start point and its start time. */
interface TargetGlide {
  readonly from: Vector3;
  readonly startMs: number;
  /** The camera at the start of the move. */
  readonly position: Vector3;
  /** The distance of the camera from the stage center at the end of the move. */
  readonly outDistance: number;
}

/** The blend of the camera after a change of the mode with the toggle (design 2.5). */
interface CameraBlend {
  /** The time of the change, in milliseconds. */
  readonly startMs: number;
  /** True for a blend into Cinematic mode, false for a blend into Free mode. */
  readonly toCinematic: boolean;
  /** The blend of the camera of the last frame, or `null` before the first frame. */
  orbit: OrbitBlend | null;
}

/** The camera of one frame of a blend, and the share of the rest of the way of the frame. */
interface BlendFrame {
  readonly view: OrbitView;
  /** The share of `blendShare()`: 1 in the last frame. */
  readonly share: number;
}

/**
 * The camera and the orbit controls of the stage (design 2.5, 4.5). In Cinematic mode, the shots
 * of design 5.6 move the camera with {@link StageCamera.follow}. In Free mode, the orbit controls
 * move it with {@link StageCamera.update}, from the camera of the last frame.
 */
export class StageCamera {
  readonly camera: PerspectiveCamera;
  readonly #controls: OrbitControls;
  readonly #stageSide: number;
  #width = 1;
  #height = 1;
  /** True after the user or a shot moves the view. Then a resize keeps the view. */
  #moved = false;
  /** True when the last frame came from a shot. */
  #following = false;
  readonly #reducedMotion: boolean;
  #glide: TargetGlide | null = null;
  /** The parts of the page over the canvas in the last frame, as the frame shows them now. */
  #cover: FrameCover = { right: 0, lift: 0 };
  /** The time of the last call of {@link StageCamera.frameTo}, or `null` before the first. */
  #frameMs: number | null = null;
  #frame: ViewFrame = { scale: 1, x: 0.5, y: 0.5 };
  /**
   * The share of the fit of a close shot (design 5.6): 1 in a close shot, 0 in a wide shot. After
   * a close shot, Free mode takes it to 0 in the move of the orbit target.
   */
  #fit = 0;
  /** The share of the fit at the start of the move to Free mode, and its start time. */
  #fitGlide: { readonly from: number; readonly startMs: number } | null = null;
  /** The scale of the frame that keeps the stage clear of the play button of the first screen. */
  #clear: FrameClear = NO_CLEAR;
  /**
   * The share of the letterbox of Cinematic mode (design 2.5): 0 in Free mode, 1 in the frame of
   * the aspect `CINEMA_ASPECT`, and between them while the bars move.
   */
  #cinema = 0;
  /** The highest point of the players above the stage top, in meters. */
  readonly #stageTop: number;
  /** The blend after a change of the mode, or `null` (design 2.5). */
  #blend: CameraBlend | null = null;
  /**
   * The camera of Free mode at the last blend into Cinematic mode. A blend back into Free mode
   * ends at it.
   */
  #freeView: OrbitView | null = null;
  /** True after a drag, a pinch, or a wheel on the controls, until the next frame. */
  #input = false;

  /**
   * Creates the camera and its orbit controls.
   *
   * @param canvas The element that gets the pointer events, or `null` with no events until
   *   {@link StageCamera.connect}.
   * @param stageSide The stage side `S`, in meters.
   * @param reducedMotion True if the user prefers reduced motion. Then the controls have no
   *   inertia (design 2.5).
   * @param stageTop The highest point of the players above the stage top, in meters: the top of
   *   the stage in the first screen (design 2.8). 0 for no players.
   */
  constructor(canvas: HTMLElement | null, stageSide: number, reducedMotion: boolean, stageTop = 0) {
    this.#stageSide = stageSide;
    this.#stageTop = stageTop;
    this.#reducedMotion = reducedMotion;
    this.camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR, farPlane(1, stageSide));
    const controls = new OrbitControls(this.camera, canvas);
    // Design 2.5: the controls rotate and zoom around the target of the last shot.
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion;
    // The polar angle of three.js counts from the vertical, so it is 90° less the elevation.
    controls.minPolarAngle = Math.PI / 2 - ELEVATION_LIMITS[1];
    controls.maxPolarAngle = Math.PI / 2 - ELEVATION_LIMITS[0];
    controls.minDistance = MIN_DISTANCE;
    controls.addEventListener('start', () => {
      this.#moved = true;
      this.#input = true;
    });
    this.#controls = controls;
  }

  /**
   * Sets the size of the viewport. Before the view moves, the camera takes the default view of
   * the new size.
   *
   * @param width The width of the canvas, in CSS pixels.
   * @param height The height of the canvas, in CSS pixels.
   */
  resize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    this.camera.aspect = width / height;
    this.#applyFrame();
    const { distance } = defaultView(this.#stageSide, width, height);
    this.#controls.maxDistance = MAX_DISTANCE_FACTOR * distance;
    if (this.#moved) {
      this.camera.updateProjectionMatrix();
    } else {
      this.reset();
    }
  }

  /**
   * Moves the frame to the free area of the page (design 2.8, 4.5): above the bar, left of the
   * open drawer of a wide window, and above the sheet of a phone. The canvas fills the window,
   * and the camera also renders the area under the bar and the drawer. The frame glides to a new
   * place in about 200 ms, at once with reduced motion and at the first call. While the play
   * button of the first screen shows in Free mode, the frame shrinks until the stage is clear of
   * it (design 2.2, 2.8). After the first play, it grows back to the default view in about 0.4 s.
   * Cinematic mode does not shrink the frame, so its film starts with no zoom.
   *
   * In Cinematic mode, the frame is the letterbox of the aspect `CINEMA_ASPECT` (design 2.5). The
   * parts of the page over the canvas do not move it. While the bars move, the frame moves from the
   * frame of Free mode to the letterbox by the share.
   *
   * @param cover The parts of the page over the canvas.
   * @param ring The box of the load ring of the play button of the first screen, in CSS pixels,
   *   or `null` while it does not show.
   * @param nowMs The time of the frame, in milliseconds.
   * @param cinema The share of the letterbox, from 0 (Free mode) to 1 (Cinematic mode).
   */
  frameTo(cover: FrameCover, ring: ScreenBox | null, nowMs: number, cinema = 0): void {
    const dtMs = this.#frameMs === null || this.#reducedMotion ? Infinity : nowMs - this.#frameMs;
    this.#frameMs = nowMs;
    this.#cover = {
      right: glideTo(this.#cover.right, cover.right, dtMs, FRAME_GLIDE_MS, 0.01),
      lift: glideTo(this.#cover.lift, cover.lift, dtMs, FRAME_GLIDE_MS, 0.01),
    };
    this.#cinema = cinema;
    let factor = 1;
    const stage = ring ? this.#stageBox() : null;
    if (ring && stage) {
      const base = viewFrame(this.#width, this.#height, this.#cover, this.#fit);
      const onCanvas =
        cinema > 0
          ? stageOnCanvas(stage, this.#imageBox(base))
          : boxOnCanvas(stage, this.#width, this.#height, base);
      const clear = clearFirstScreen(onCanvas, ring);
      // Cinematic mode keeps the full letterbox frame: the play button shows over the film for a
      // moment, and the film starts at full size, with no zoom at the first play. While the bars
      // move, the shrink follows the share of Free mode.
      factor = 1 + (clear.factor - 1) * (1 - cinema);
      this.#clear = { ...clear, factor };
    }
    this.#clear = {
      ...this.#clear,
      factor: glideTo(this.#clear.factor, factor, dtMs, CLEAR_GLIDE_MS, 1e-4),
    };
    this.#applyFrame();
    this.camera.updateProjectionMatrix();
  }

  /**
   * Gives the box of the stage and the players in the units of the full view (from -1 to 1, y
   * up), with no frame: the 8 corners of the stage slab, up to the highest head. The box is the
   * view of a camera in the current direction at the default distance from the orbit target.
   * Thus a zoom does not change the box, and the clear of the first screen keeps the zoom (design
   * 2.5). A turn of the view changes the box.
   *
   * @returns The box, or `null` when a corner stands behind the camera.
   */
  #stageBox(): ScreenBox | null {
    const camera = this.camera;
    const target = this.#controls.target;
    // The default distance follows the aspect of the image: the letterbox in Cinematic mode.
    const { distance } = defaultView(this.#stageSide, camera.aspect, 1);
    scratchEye.subVectors(camera.position, target).setLength(distance).add(target);
    scratchView.compose(scratchEye, camera.quaternion, UNIT_SCALE).invert();
    const tanV = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    const tanH = tanV * camera.aspect;
    const half = this.#stageSide / 2;
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    for (let c = 0; c < 8; c++) {
      scratchPoint
        .set(c & 1 ? half : -half, c & 2 ? this.#stageTop : -STAGE_THICKNESS, c & 4 ? half : -half)
        .applyMatrix4(scratchView);
      const depth = -scratchPoint.z;
      if (depth <= camera.near) {
        return null;
      }
      const x = scratchPoint.x / depth / tanH;
      const y = scratchPoint.y / depth / tanV;
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
    }
    return { left, right, bottom, top };
  }

  /**
   * The frame of the camera on the canvas, in CSS pixels. In Cinematic mode, its scale is the
   * height of the image of the camera divided by the height of the canvas.
   */
  get frame(): ViewFrame {
    return this.#frame;
  }

  /** The width of the view divided by its height. */
  get aspect(): number {
    return this.#width / this.#height;
  }

  /** The point that the camera looks at, and that the orbit controls turn around. */
  get target(): Vec3 {
    const { x, y, z } = this.#controls.target;
    return [x, y, z];
  }

  /** Returns to the default view with the field of view of 4.5 ("Reset view", design 2.5). */
  reset(): void {
    const view = defaultView(this.#stageSide, this.#width, this.#height);
    this.camera.position.set(...view.position);
    this.camera.fov = FIELD_OF_VIEW;
    this.#controls.target.set(...view.target);
    this.#controls.update();
    this.#moved = false;
    this.#following = false;
    this.#glide = null;
    this.#fit = 0;
    this.#fitGlide = null;
    this.#blend = null;
    this.#applyFrame();
    this.#updateFar();
  }

  /**
   * Starts the blend of a change of the mode with the toggle (design 2.5): from the camera on the
   * screen to the camera of the new mode, in `MODE_BLEND` of `mode-blend.ts`. A blend into
   * Cinematic mode goes to the live camera of the shots, and a blend into Free mode goes back to
   * the camera of Free mode at the last change into Cinematic mode. A change during a blend
   * starts a new blend from the camera on the screen. With reduced motion, the change is a hard
   * cut.
   *
   * @param nowMs The time of the frame of the change, in milliseconds.
   * @param toCinematic True for a change into Cinematic mode.
   */
  startBlend(nowMs: number, toCinematic: boolean): void {
    if (this.#reducedMotion) {
      this.#blend = null;
      return;
    }

    // A blend into Free mode that a toggle stops keeps its end, so the next one comes back to it.
    if (toCinematic && this.#blend?.toCinematic !== false) {
      this.#freeView = this.#shownView();
    }
    this.#blend = { startMs: nowMs, toCinematic, orbit: null };
  }

  /**
   * Stops the blend of a change of the mode, at the camera on the screen: a drag, a pinch, a
   * wheel, or "Reset view" changes the mode with no blend (design 2.5).
   */
  stopBlend(): void {
    this.#blend = null;
  }

  /**
   * Shows the camera of a shot (Cinematic mode, design 5.6). It also moves the target of the
   * orbit controls, so that a change to Free mode continues from this camera with no jump. In
   * the blend of a change into Cinematic mode, the camera on the screen goes from the camera of
   * the change to the camera of the shot, which moves too. Each frame moves the camera a part of
   * the rest of the way toward the camera of the shot (`stepOrbitBlend()` of `mode-blend.ts`), so
   * a cut in the blend does not jump.
   *
   * @param pose The camera from `cameraAt()`.
   * @param nowMs The time of the frame, in milliseconds.
   */
  follow(pose: CameraPose, nowMs = performance.now()): void {
    // Each frame of Cinematic mode clears the input, because a press in it changes no camera.
    this.#input = false;
    // A blend into Free mode ends in Cinematic mode.
    const blend = this.#blend?.toCinematic ? this.#blend : null;
    const { view, share } = blend ? this.#stepBlend(blend, pose, nowMs) : { view: pose, share: 1 };
    if (share >= 1) {
      this.#blend = null;
    }
    this.camera.position.set(...view.position);
    this.#controls.target.set(...view.target);
    this.camera.lookAt(this.#controls.target);
    this.camera.fov = view.fov;
    this.#moved = true;
    this.#following = true;
    this.#glide = null;
    // A cut changes the fit at once, and a blend joins two close shots.
    const fit = pose.close ? 1 : 0;
    this.#fit = mix(this.#fit, fit, share);
    this.#fitGlide = null;
    this.#applyFrame();
    this.#updateFar();
  }

  /**
   * Shows the frame of the blend of a change into Free mode (design 2.5): the camera goes from
   * the camera of the change to the last camera of Free mode, or to the default view, and the fit
   * of a close shot goes to 0.
   *
   * @param blend The blend.
   * @param nowMs The time of the frame, in milliseconds.
   * @returns True at the end of the blend.
   */
  #blendToFree(blend: CameraBlend, nowMs: number): boolean {
    const { view, share } = this.#stepBlend(blend, this.#freeView ?? this.#defaultOrbit(), nowMs);
    this.camera.position.set(...view.position);
    this.#controls.target.set(...view.target);
    this.camera.lookAt(this.#controls.target);
    this.camera.fov = view.fov;
    this.#moved = true;
    this.#following = false;
    this.#glide = null;
    this.#fit = mix(this.#fit, 0, share);
    this.#fitGlide = null;
    this.#applyFrame();
    return share >= 1;
  }

  /**
   * Moves a blend of a change of the mode to a frame (`stepOrbitBlend()`). The first frame starts
   * the blend from the camera on the screen.
   *
   * @param blend The blend.
   * @param live The live camera of the new mode.
   * @param nowMs The time of the frame, in milliseconds.
   * @returns The camera on the screen, and the share of the frame for the other values.
   */
  #stepBlend(blend: CameraBlend, live: OrbitView, nowMs: number): BlendFrame {
    const w = modeBlendWeight(nowMs - blend.startMs);
    const orbit = blend.orbit ?? startOrbitBlend(this.#shownView(), live);
    const share = blendShare(orbit.weight, w);
    const step = stepOrbitBlend(orbit, live, w);
    blend.orbit = step.blend;
    return { view: step.view, share };
  }

  /**
   * Gives the camera on the screen.
   *
   * @returns The position, the point that the camera looks at, and the field of view.
   */
  #shownView(): OrbitView {
    const { x, y, z } = this.camera.position;
    return { position: [x, y, z], target: this.target, fov: this.camera.fov };
  }

  /**
   * Gives the default view of the stage at the current size of the canvas, with the field of
   * view of design 4.5.
   *
   * @returns The camera.
   */
  #defaultOrbit(): OrbitView {
    const view = defaultView(this.#stageSide, this.#width, this.#height);
    return { position: view.position, target: view.target, fov: FIELD_OF_VIEW };
  }

  /**
   * Applies the inertia of the controls (Free mode), and keeps the far plane behind the stage.
   * At the first frame after a close shot, the orbit target starts to move to the stage center
   * in 0.4 s, at once with reduced motion. The camera turns to the new target, and moves out
   * from the stage center to at least 0.6 of the default distance and out of the box of the
   * stage and the players, so a drag turns the view around the stage (design 2.5). After the
   * move, a zoom stops at the near limit of {@link orbitMinDistance}.
   *
   * In the blend of a change into Free mode, the blend moves the camera in place of the
   * controls. A drag, a pinch, or a wheel stops the blend, and the controls continue from the
   * camera on the screen.
   *
   * @param nowMs The time of the frame, in milliseconds.
   */
  update(nowMs = performance.now()): void {
    const blend = this.#blend;
    if (blend && (blend.toCinematic || this.#input)) {
      this.#blend = null;
    } else if (blend && !this.#blendToFree(blend, nowMs)) {
      this.#updateFar();
      return;
    } else if (blend) {
      this.#blend = null;
    }
    this.#input = false;

    const target = this.#controls.target;
    if (this.#following) {
      this.#following = false;
      const center = new Vector3(...defaultView(this.#stageSide, 1, 1).target);
      const position = this.camera.position;
      const inside = position.distanceTo(center) < this.#nearLimit(center, position);
      if (inside || target.distanceTo(center) >= FREE_TARGET_GLIDE.minDistance) {
        const { distance } = defaultView(this.#stageSide, this.#width, this.#height);
        this.#glide = {
          from: target.clone(),
          startMs: nowMs,
          position: position.clone(),
          outDistance: Math.max(
            position.distanceTo(center),
            FREE_TARGET_GLIDE.outShare * distance,
            this.#nearLimit(center, position),
          ),
        };
      }
    }
    if (this.#glide) {
      const center = defaultView(this.#stageSide, 1, 1).target;
      const t = this.#reducedMotion
        ? 1
        : clamp01((nowMs - this.#glide.startMs) / FREE_TARGET_GLIDE.durationMs);
      const u = smoothstep(t);
      const { from, position, outDistance } = this.#glide;
      target.set(
        from.x + (center[0] - from.x) * u,
        from.y + (center[1] - from.y) * u,
        from.z + (center[2] - from.z) * u,
      );
      // The camera moves out on the ray from the stage center through its start point.
      const ray = position.clone().sub(new Vector3(...center));
      const start = ray.length();
      ray.multiplyScalar((start + (outDistance - start) * u) / start);
      this.camera.position.set(center[0] + ray.x, center[1] + ray.y, center[2] + ray.z);
      if (t >= 1) {
        this.#glide = null;
      }
    }

    this.#glideFit(nowMs);
    // The move of the target sets the camera itself, so only the lowest limit applies in it.
    this.#controls.minDistance = this.#glide
      ? MIN_DISTANCE
      : this.#nearLimit(target, this.camera.position);
    this.#controls.update();
    this.#updateFar();
  }

  /**
   * Gives the near orbit limit in the direction from a target to a camera position (design 2.5).
   *
   * @param target The orbit target.
   * @param position The camera position.
   * @returns The distance from the target, in meters.
   */
  #nearLimit(target: Vector3, position: Vector3): number {
    const direction = scratchPoint.subVectors(position, target).normalize();
    return orbitMinDistance(target.toArray(), direction.toArray(), this.#stageSide, this.#stageTop);
  }

  /**
   * Takes the fit of a close shot to 0 in Free mode, with the move of the orbit target: in 0.4 s
   * with a smoothstep, at once with reduced motion. Thus the change to Free mode does not jump.
   *
   * @param nowMs The time of the frame, in milliseconds.
   */
  #glideFit(nowMs: number): void {
    if (this.#fit <= 0) {
      return;
    }
    this.#fitGlide ??= { from: this.#fit, startMs: nowMs };
    const { from, startMs } = this.#fitGlide;
    const t = this.#reducedMotion ? 1 : clamp01((nowMs - startMs) / FREE_TARGET_GLIDE.durationMs);
    this.#fit = from * (1 - smoothstep(t));
    if (t >= 1) {
      this.#fit = 0;
      this.#fitGlide = null;
    }
    this.#applyFrame();
  }

  /**
   * Connects the orbit controls to the element that gets the pointer events. A camera that comes
   * with no element gets the events only after this call.
   *
   * @param element The canvas of the page.
   */
  connect(element: HTMLElement): void {
    this.#controls.connect(element);
  }

  /** Removes the event listeners of the orbit controls from the canvas. */
  dispose(): void {
    if (this.#controls.domElement) {
      this.#controls.dispose();
    }
  }

  /**
   * Gives the box of the image of the camera before the clear of the first screen: the frame of
   * Free mode mixed with the letterbox by the share of Cinematic mode.
   *
   * @param frame The frame of Free mode.
   * @returns The box, in CSS pixels.
   */
  #imageBox(frame: ViewFrame): FrameBox {
    const free = boxOfFrame(frame, this.#width, this.#height);
    return mixBox(free, letterbox(this.#width, this.#height), this.#cinema);
  }

  /**
   * Sets the aspect and the view offset of the frame. The caller updates the projection matrix.
   * In Free mode, the image has the aspect of the canvas. In Cinematic mode, it has the aspect
   * `CINEMA_ASPECT`, and the canvas shows the image and the scene around it (design 2.5).
   */
  #applyFrame(): void {
    const frame = viewFrame(this.#width, this.#height, this.#cover, this.#fit);
    if (this.#cinema <= 0) {
      this.#frame = clearedFrame(frame, this.#clear);
      this.camera.aspect = this.#width / this.#height;
      this.camera.setViewOffset(...viewOffset(this.#width, this.#height, this.#frame));
      return;
    }

    const box = clearedBox(this.#imageBox(frame), this.#clear);
    this.#frame = { x: box.x, y: box.y, scale: box.height / this.#height };
    this.camera.aspect = this.#cinema >= 1 ? CINEMA_ASPECT : box.width / box.height;
    this.camera.setViewOffset(
      box.width,
      box.height,
      box.width / 2 - box.x,
      box.height / 2 - box.y,
      this.#width,
      this.#height,
    );
  }

  #updateFar(): void {
    const distance = this.camera.position.distanceTo(this.#controls.target);
    this.camera.far = farPlane(distance, this.#stageSide);
    this.camera.updateProjectionMatrix();
  }
}
