import {
  BackSide,
  BoxGeometry,
  Color,
  CubeCamera,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  WebGLCubeRenderTarget,
} from 'three';
import type { Object3D, PMREMGenerator, WebGLRenderTarget, WebGLRenderer } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { Steps } from '../score/steps.ts';
import { fromCubemapSteps, fromSceneSteps } from './pmrem-steps.ts';

/**
 * The environment of the reflections (design 4.5, light and render): a dark room with warm lamps
 * around the horizon and a warm light above, as the hall of `scene.png`. The brass, the copper,
 * and the polished wood reflect it. With no environment, metal looked dim.
 */
export const ENVIRONMENT = {
  /** The dark room, in sRGB. */
  room: '#0b0807',
  /** The light of a lamp, in linear values. */
  lamp: [6, 3.4, 1.6],
  /** The number of lamps around the horizon. */
  lamps: 10,
  /** The light above, in linear values: the spotlight and its beam. */
  top: [3, 2, 1.2],
  /** The factor of the environment light on each material of the scene. */
  intensity: 0.6,
} as const;

/**
 * Builds the scene of the environment: a sphere of the room color seen from inside, warm boxes at
 * the horizon, and a warm box above. It holds no light, so the boxes show only their colors.
 *
 * @returns The scene, with its center at the origin.
 */
export function buildEnvironmentScene(): Scene {
  const scene = new Scene();
  scene.add(
    new Mesh(
      new SphereGeometry(20, 16, 8),
      new MeshBasicMaterial({ color: new Color(ENVIRONMENT.room), side: BackSide }),
    ),
  );
  const lamp = new MeshBasicMaterial({ color: new Color().setRGB(...ENVIRONMENT.lamp) });
  const lampBox = new BoxGeometry(1.2, 0.6, 1.2);
  for (let i = 0; i < ENVIRONMENT.lamps; i++) {
    const angle = ((i + 0.5) / ENVIRONMENT.lamps) * Math.PI * 2;
    const box = new Mesh(lampBox, lamp);
    // Two rows of lamps, as the two balcony tiers.
    box.position.set(15 * Math.sin(angle), i % 2 === 0 ? 2 : 5, 15 * Math.cos(angle));
    scene.add(box);
  }
  const top = new Mesh(
    new BoxGeometry(6, 0.5, 6),
    new MeshBasicMaterial({ color: new Color().setRGB(...ENVIRONMENT.top) }),
  );
  top.position.set(0, 16, 0);
  scene.add(top);
  return scene;
}

/** The size of each face of the cube of the environment of the reflections, in pixels. */
const ENVIRONMENT_SIZE = 256;

/** The blur of the environment of the reflections, in radians: the `sigma` of `fromScene()`. */
const ENVIRONMENT_BLUR = 0.04;

/**
 * Creates the environment texture of the reflections in steps (design 4.5, 7.2): a PMREM of
 * {@link buildEnvironmentScene}, as `fromScene()` of three.js makes it with a blur of
 * {@link ENVIRONMENT_BLUR}. The renderer makes it one time, and each layout uses it. The steps
 * compile the programs first, and then render the faces, the blur, and the mip levels in separate
 * tasks.
 *
 * @param renderer The renderer.
 * @param generator The PMREM generator of the renderer. It keeps its materials, so the captures
 *   of the layouts compile no program again.
 * @param compileTarget A render target for the compile. A program of a target differs from a
 *   program of the canvas.
 * @returns The steps, which return the target that holds the texture. The caller frees it.
 */
export function* createEnvironmentSteps(
  renderer: WebGLRenderer,
  generator: PMREMGenerator,
  compileTarget: WebGLRenderTarget,
): Steps<WebGLRenderTarget> {
  const scene = buildEnvironmentScene();
  const target = yield* fromSceneSteps(renderer, generator, compileTarget, {
    scene,
    size: ENVIRONMENT_SIZE,
    sigma: ENVIRONMENT_BLUR,
  });
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      if (object.material instanceof MeshBasicMaterial) {
        object.material.dispose();
      }
    }
  });
  return target;
}

/**
 * The values of the captured environment (design 4.5, light and render). Each layout renders its
 * own hall and lit stage into a cube, so the brass and the lacquer reflect the real lamps and the
 * real pool of light, and the diffuse light of the map holds the warm floor below the players.
 */
export const CAPTURE = {
  /** The width of each face of the cube, in pixels. */
  size: 256,
  /** The height of the point of the capture above the stage top, in meters: about a seated head. */
  height: 1.2,
  /** The factor of the captured environment light on each material: 1 is the physical light. */
  intensity: 1,
} as const;

/** The inputs of {@link captureEnvironmentSteps}. */
export interface CaptureOptions {
  /** The point of the capture. */
  readonly position: Vec3;
  /** The objects that the capture hides: the players, the props, and the visible beam. */
  readonly hidden: readonly Object3D[];
}

/**
 * Captures the environment of a layout in steps (design 4.5, light and render, 7.2): it renders
 * the scene into a cube of half floats from one point, with some objects hidden, and makes a PMREM
 * of the cube, as `fromCubemap()` of three.js makes it. The renderer gives no tone mapping to a
 * render target, so the cube holds the linear light.
 *
 * @param renderer The renderer. It needs a target of half floats.
 * @param generator The PMREM generator of the renderer, after {@link createEnvironmentSteps}.
 * @param scene The scene of the layout, with the environment that its reflections use during the
 *   capture.
 * @param options The point of the capture and the hidden objects.
 * @returns The steps, which return the target that holds the environment texture. The caller
 *   frees it.
 */
export function* captureEnvironmentSteps(
  renderer: WebGLRenderer,
  generator: PMREMGenerator,
  scene: Scene,
  options: CaptureOptions,
): Steps<WebGLRenderTarget> {
  const cube = new WebGLCubeRenderTarget(CAPTURE.size, { type: HalfFloatType });
  const camera = new CubeCamera(0.05, 500, cube);
  camera.position.set(...options.position);
  camera.updateMatrixWorld();

  const shown = options.hidden.map((object) => object.visible);
  for (const object of options.hidden) {
    object.visible = false;
  }
  const saved = renderer.getRenderTarget();
  camera.update(renderer, scene);
  renderer.setRenderTarget(saved);
  for (const [i, object] of options.hidden.entries()) {
    object.visible = shown[i] ?? true;
  }
  yield;

  const target = yield* fromCubemapSteps(renderer, generator, cube.texture, CAPTURE.size);
  cube.dispose();
  return target;
}
