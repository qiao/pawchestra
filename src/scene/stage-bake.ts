import {
  AddEquation,
  Color,
  CustomBlending,
  DataTexture,
  DepthTexture,
  DoubleSide,
  HalfFloatType,
  LessEqualDepth,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OrthographicCamera,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import type { Material, Texture, WebGLRenderer } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { Steps } from '../score/steps.ts';
import { SHADOW_TOP } from './lights.ts';
import { compileInto, gpuDoneSteps, programsReadySteps, setUniform } from './programs.ts';

/**
 * The values of the bake of the static props (design 4.5, light and render). The props and the
 * stage do not move during a song, and the key light keeps its place during a solo, so the light
 * that they let reach the stage top does not change. A bake can thus hold the soft shadow of a
 * large light and the contact occlusion, with no cost in each frame.
 */
export const STAGE_BAKE = {
  /** The texels of the bake on each side of the stage: about 1.1 cm on the default stage. */
  size: 1024,
  /** The width of the depth map of each sample, in texels. */
  mapSize: 2048,
  /**
   * The width of the area light of the key light, in meters. The soft shadows of
   * `orchestra-latest.png` need a light of about 2 m at the height of the key light.
   */
  lightSize: 2,
  /** The number of points of the area light. */
  keySamples: 64,
  /** The number of directions of the sky, by the cosine of their angle to the vertical. */
  skySamples: 64,
  /**
   * The farthest distance at which a prop hides the sky of a point of the stage, in meters. The
   * fill light comes from the hall around the stage, so only a near prop, such as a chair seat or
   * the side of the podium, takes it away.
   */
  skyReach: 0.6,
  /** The move of a point of the stage up along its normal before each test, in meters. */
  offset: 0.01,
  /** The distance at which a surface hides a point, in meters: below it, the point sees itself. */
  bias: 0.03,
} as const;

/** The golden angle, in radians. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Gives the points of the area light of the key light: a Vogel disc around its center, at right
 * angles to the axis from the light to the stage center. The points have the same weight.
 *
 * @param center The center of the light.
 * @param size The width of the light, in meters.
 * @param count The number of points.
 * @returns The points.
 */
function keyLightPoints(center: Vec3, size: number, count: number): Vec3[] {
  const axis = new Vector3(...center).negate().normalize();
  const side = new Vector3(0, 1, 0).cross(axis).normalize();
  const up = new Vector3().crossVectors(axis, side);
  const points: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt((i + 0.5) / count) * (size / 2);
    const angle = i * GOLDEN_ANGLE;
    const point = new Vector3(...center)
      .addScaledVector(side, r * Math.cos(angle))
      .addScaledVector(up, r * Math.sin(angle));
    points.push(point.toArray());
  }
  return points;
}

/**
 * Gives the directions of the sky over the stage: a Vogel disc lifted onto the upper half of the
 * sphere, so that the directions follow the cosine of their angle to the vertical. The directions
 * have the same weight.
 *
 * @param count The number of directions.
 * @returns The unit directions, with y above 0.
 */
function skyDirections(count: number): Vec3[] {
  const directions: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const r = Math.sqrt(u);
    const angle = i * GOLDEN_ANGLE;
    directions.push([r * Math.cos(angle), Math.sqrt(1 - u), r * Math.sin(angle)]);
  }
  return directions;
}

/**
 * Gives the corners of the box of the stage and its props: the stage top, from below the lip to
 * {@link SHADOW_TOP}.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The eight corners.
 */
function stageBox(stageSide: number): Vector3[] {
  const half = stageSide / 2;
  const corners: Vector3[] = [];
  for (const x of [-half, half]) {
    for (const y of [-0.1, SHADOW_TOP]) {
      for (const z of [-half, half]) {
        corners.push(new Vector3(x, y, z));
      }
    }
  }
  return corners;
}

/**
 * Makes the camera of the depth map of one point of the key light: it looks at the stage center,
 * and its view holds the box of the stage.
 *
 * @param point The point of the light.
 * @param stageSide The stage side `S`, in meters.
 * @returns The camera, with its matrices up to date.
 */
function keyCamera(point: Vec3, stageSide: number): PerspectiveCamera {
  const from = new Vector3(...point);
  const axis = from.clone().negate().normalize();
  let near = Infinity;
  let far = 0;
  let widest = 0;
  for (const corner of stageBox(stageSide)) {
    const to = corner.sub(from);
    near = Math.min(near, to.dot(axis));
    far = Math.max(far, to.dot(axis));
    widest = Math.max(widest, to.angleTo(axis));
  }
  const fov = (2 * (widest + 0.02) * 180) / Math.PI;
  const camera = new PerspectiveCamera(fov, 1, Math.max(0.1, near - 0.5), far + 0.5);
  camera.position.copy(from);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Makes the camera of the depth map of one direction of the sky: a parallel view down the
 * direction, which holds the box of the stage.
 *
 * @param direction The unit direction to the sky.
 * @param stageSide The stage side `S`, in meters.
 * @returns The camera, with its matrices up to date.
 */
function skyCamera(direction: Vec3, stageSide: number): OrthographicCamera {
  const dir = new Vector3(...direction);
  const camera = new OrthographicCamera();
  camera.up.set(0, Math.abs(dir.y) > 0.9 ? 0 : 1, Math.abs(dir.y) > 0.9 ? -1 : 0);
  camera.position.copy(dir).multiplyScalar(2 * stageSide);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse;
  let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
  let [near, far] = [Infinity, -Infinity];
  for (const corner of stageBox(stageSide)) {
    const p = corner.applyMatrix4(view);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    bottom = Math.min(bottom, p.y);
    top = Math.max(top, p.y);
    near = Math.min(near, -p.z);
    far = Math.max(far, -p.z);
  }
  camera.left = left;
  camera.right = right;
  camera.bottom = bottom;
  camera.top = top;
  camera.near = near - 0.5;
  camera.far = far + 0.5;
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * The vertex shader of the passes over the stage top: a view from above, in which the stage
 * square fills the target. The bake texel of a world point is `(x, z) / S + 0.5`.
 */
const RECEIVER_VERTEX = /* glsl */ `
uniform float uInvHalfSide;
varying vec3 vWorld;
varying vec3 vNormalWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  // The highest surface wins the depth test.
  gl_Position = vec4(world.xz * uInvHalfSide, 0.5 - world.y * 0.05, 1.0);
}
`;

/**
 * The fragment shader of one sample: it tests the point of the stage against the depth map of
 * the sample, and adds the weight of the sample to R for a point of the key light, or to G for a
 * direction of the sky.
 */
const RECEIVER_FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D uDepth;
uniform mat4 uLightMatrix;
uniform float uNear;
uniform float uFar;
uniform float uWeight;
varying vec3 vWorld;
varying vec3 vNormalWorld;

void main() {
  vec3 p = vWorld + normalize(vNormalWorld) * ${STAGE_BAKE.offset.toFixed(4)};
  vec4 clip = uLightMatrix * vec4(p, 1.0);
  vec3 q = clip.xyz / clip.w * 0.5 + 0.5;
  float open = 1.0;
  if (all(greaterThan(q.xy, vec2(0.0))) && all(lessThan(q.xy, vec2(1.0)))) {
    float d = texture2D(uDepth, q.xy).x;
#ifdef SKY
    // The distance from the surface that hides the point to the point, along the direction.
    float gap = (q.z - d) * (uFar - uNear);
    // A surface nearer than half the reach hides the direction, and the effect fades out at the
    // reach.
    open = gap < ${STAGE_BAKE.bias.toFixed(4)} ? 1.0 : smoothstep(${(STAGE_BAKE.skyReach / 2).toFixed(4)}, ${STAGE_BAKE.skyReach.toFixed(4)}, gap);
    gl_FragColor = vec4(0.0, open * uWeight, 0.0, 1.0);
#else
    float occluder = -perspectiveDepthToViewZ(d, uNear, uFar);
    float point = -perspectiveDepthToViewZ(q.z, uNear, uFar);
    open = occluder + ${STAGE_BAKE.bias.toFixed(4)} < point ? 0.0 : 1.0;
    gl_FragColor = vec4(open * uWeight, 0.0, 0.0, 1.0);
#endif
  } else {
#ifdef SKY
    gl_FragColor = vec4(0.0, uWeight, 0.0, 1.0);
#else
    gl_FragColor = vec4(uWeight, 0.0, 0.0, 1.0);
#endif
  }
}
`;

/**
 * The fragment shader of the pass that writes the height of the highest surface to B. The stage
 * shader takes a texel of the bake only for a point of the same surface.
 */
const HEIGHT_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalWorld;
void main() {
  gl_FragColor = vec4(0.0, 0.0, vWorld.y, 0.0);
}
`;

/**
 * Makes the material of the samples of one kind.
 *
 * @param sky True for the directions of the sky (G), false for the points of the key light (R),
 *   or `height` for the height of the surface (B).
 * @param stageSide The stage side `S`, in meters.
 * @returns The material. It adds its output to the target, with no depth write.
 */
function sampleMaterial(sky: boolean | 'height', stageSide: number): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader: RECEIVER_VERTEX,
    fragmentShader: sky === 'height' ? HEIGHT_FRAGMENT : RECEIVER_FRAGMENT,
    uniforms: {
      uInvHalfSide: { value: 2 / stageSide },
      uDepth: { value: null },
      uLightMatrix: { value: null },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uWeight: { value: 0 },
    },
    defines: sky === true ? { SKY: 1 } : {},
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendEquation: AddEquation,
    depthTest: true,
    depthFunc: LessEqualDepth,
    depthWrite: false,
    side: DoubleSide,
  });
  return material;
}

/** The number of samples of the bake in one step of {@link bakeStageSteps}. */
const BAKE_PASSES_PER_STEP = 16;

/** The inputs of {@link bakeStageSteps}. */
interface StageBakeOptions {
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** The center of the area light of the key light. */
  readonly keyPosition: Vec3;
  /** The meshes that cast the baked shadows: the stage (the podium and the lip) and the props. */
  readonly casters: readonly Mesh[];
  /** The mesh that receives the bake: the stage. */
  readonly receiver: Mesh;
}

/**
 * Bakes the light of the static props on the stage top (design 4.5, light and render). R holds
 * the part of the area light of the key light ({@link STAGE_BAKE}) that reaches each point, G
 * the part of the sky, and B the height of the surface of the texel, in meters. The stage shader multiplies the key light by R and the other lights by
 * G. The bake renders the depth of the casters from each sample, then adds the result of each
 * sample over the stage top.
 *
 * ```text
 * for each point of the key light, then each direction of the sky:
 *   [depth of the casters] --> [pass over the stage from above] --(add)--> R or G
 * ```
 *
 * The bake runs in steps (design 7.2): the programs compile first, and then each step renders
 * {@link BAKE_PASSES_PER_STEP} samples.
 *
 * @param renderer The renderer. It needs a target of half floats with blending.
 * @param options The stage, the light, the casters, and the receiver. Their world matrices must
 *   be up to date.
 * @returns The steps, which return the target that holds the bake. The caller frees it.
 */
export function* bakeStageSteps(
  renderer: WebGLRenderer,
  options: StageBakeOptions,
): Steps<WebGLRenderTarget> {
  const { stageSide, keyPosition, casters, receiver } = options;
  const bake = STAGE_BAKE;
  const target = new WebGLRenderTarget(bake.size, bake.size, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
  });
  const depth = new WebGLRenderTarget(bake.mapSize, bake.mapSize, { type: UnsignedByteType });
  depth.depthTexture = new DepthTexture(bake.mapSize, bake.mapSize, UnsignedIntType);

  const depthMaterial = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide });
  const casterScene = new Scene();
  for (const caster of casters) {
    casterScene.add(placedCopy(caster, depthMaterial));
  }
  const prepass = new ShaderMaterial({
    vertexShader: RECEIVER_VERTEX,
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    uniforms: { uInvHalfSide: { value: 2 / stageSide } },
    colorWrite: false,
    side: DoubleSide,
    // The samples then pass the depth test only on the highest surface.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const key = sampleMaterial(false, stageSide);
  const sky = sampleMaterial(true, stageSide);
  const height = sampleMaterial('height', stageSide);
  const surface = placedCopy(receiver, prepass);
  const receiverScene = new Scene().add(surface);
  // The passes over the stage place each vertex in their own vertex shader, so this camera only
  // starts the render.
  const flat = new OrthographicCamera();
  let baked = false;
  try {
    const passes = [
      ...keyLightPoints(keyPosition, bake.lightSize, bake.keySamples).map((point) => ({
        material: key,
        camera: keyCamera(point, stageSide),
        weight: 1 / bake.keySamples,
      })),
      ...skyDirections(bake.skySamples).map((direction) => ({
        material: sky,
        camera: skyCamera(direction, stageSide),
        weight: 1 / bake.skySamples,
      })),
    ];

    // The programs compile in parallel before the first pass, so no pass waits for the GPU
    // (design 7.2). The bake renders with no shadow map.
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    compileInto(renderer, depth, () => {
      renderer.compile(casterScene, flat);
    });
    for (const material of [prepass, height, key, sky]) {
      surface.material = material;
      compileInto(renderer, target, () => {
        renderer.compile(receiverScene, flat);
      });
    }
    renderer.shadowMap.enabled = shadows;
    yield* programsReadySteps(renderer);

    // Each step sets the state of the renderer for the bake, and gives the state back at its end,
    // because the frames of the page render between the steps.
    const run = (draw: () => void): void => {
      const saved = {
        target: renderer.getRenderTarget(),
        color: renderer.getClearColor(new Color()),
        alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear,
        shadows: renderer.shadowMap.enabled,
      };
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      try {
        draw();
      } finally {
        renderer.setRenderTarget(saved.target);
        renderer.setClearColor(saved.color, saved.alpha);
        renderer.autoClear = saved.autoClear;
        renderer.shadowMap.enabled = saved.shadows;
      }
    };
    run(() => {
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      surface.material = prepass;
      renderer.render(receiverScene, flat);
      surface.material = height;
      renderer.render(receiverScene, flat);
    });

    for (const [i, { material, camera, weight }] of passes.entries()) {
      if (i % BAKE_PASSES_PER_STEP === 0) {
        yield;
      }
      run(() => {
        renderer.setRenderTarget(depth);
        renderer.clear(false, true, false);
        renderer.render(casterScene, camera);
        const uniforms = material.uniforms;
        setUniform(uniforms, 'uDepth', depth.depthTexture);
        setUniform(
          uniforms,
          'uLightMatrix',
          camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse),
        );
        setUniform(uniforms, 'uNear', camera.near);
        setUniform(uniforms, 'uFar', camera.far);
        setUniform(uniforms, 'uWeight', weight);
        surface.material = material;
        renderer.setRenderTarget(target);
        renderer.render(receiverScene, flat);
      });
    }

    // The GPU ends the bake before the next step, so that no upload of the page waits for it.
    yield* gpuDoneSteps(renderer);
    baked = true;
    return target;
  } finally {
    // A stopped bake also frees its targets and materials (`runSliced()`).
    depth.depthTexture.dispose();
    depth.dispose();
    for (const material of [depthMaterial, prepass, height, key, sky]) {
      material.dispose();
    }
    if (!baked) {
      target.dispose();
    }
  }
}

/**
 * Makes a copy of a mesh at its place in the world, with its geometry and another material. The
 * copy is never culled, because the passes over the stage place their vertices themselves.
 *
 * @param mesh The mesh. Its world matrix must be up to date.
 * @param material The material of the copy.
 * @returns The copy.
 */
function placedCopy(mesh: Mesh, material: Material): Mesh {
  const copy = new Mesh(mesh.geometry, material);
  copy.matrixAutoUpdate = false;
  copy.matrix.copy(mesh.matrixWorld);
  copy.matrixWorld.copy(mesh.matrixWorld);
  copy.frustumCulled = false;
  return copy;
}

/** The texture of a stage with no bake: all light reaches each point. */
let noBake: DataTexture | null = null;

/**
 * Gives the texture of a stage with no bake, for a GPU that cannot render to half floats. R and
 * G are 1 at each point.
 *
 * @returns A white texture of one texel, which all stages share.
 */
export function noBakeTexture(): Texture {
  if (!noBake) {
    noBake = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
    noBake.needsUpdate = true;
  }
  return noBake;
}
