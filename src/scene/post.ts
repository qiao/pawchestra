import {
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NoBlending,
  OrthographicCamera,
  RGBAFormat,
  RGBFormat,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedInt101111Type,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { Object3D, PerspectiveCamera, Scene, Texture, WebGLRenderer } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { Steps } from '../score/steps.ts';

import type { DepthDraw } from './beam.ts';
import { LENS } from './focus.ts';
import { gradeLut } from './grade.ts';
import { compileInto } from './programs.ts';
import type { Focus } from './focus.ts';
import {
  BLOOM_DOWN_FRAGMENT,
  BLOOM_UP_FRAGMENT,
  BLUR_GATHER_FRAGMENT,
  BLUR_PREPARE_FRAGMENT,
  FINAL_FRAGMENT,
  FULL_SCREEN_VERTEX,
} from './post-shaders.ts';
import { TIER_SETTINGS } from './quality.ts';
import type { QualityTier } from './quality.ts';

/** The values of the post effects (design 4.5, post effects). */
export const POST_LOOK = {
  /** The bloom starts at this linear brightness, with a soft knee below it. */
  bloomThreshold: 1.8,
  bloomKnee: 0.5,
  /** The part of the bloom that the final pass adds to the scene. */
  bloomStrength: 0.14,
  /**
   * The part of all the light that the bloom keeps below its threshold: a diffusion filter of a
   * film camera. With the bloom strength, about 3% of
   * the image comes back as a wide soft glow, as around the lit fur in `orchestra-latest.png`.
   */
  diffusion: 0.015,
  /** The factor of the bloom for each channel: the warm halation of film around a light. */
  halation: [1.15, 0.95, 0.8],
  /** The part of the light that the vignette takes from the corners. */
  vignette: 0.45,
  /** The size of the film grain, in display values. */
  grain: 0.035,
} as const;

/**
 * The room haze of the final pass (design 4.5, light and render): thin warm air that grows with
 * the distance behind the subject of the camera, so the back rows and the hall get an aerial
 * depth, and the beam stands in air, as in `orchestra-latest.png`. The stage in front of the
 * subject gets no haze, so the black point of the stage stays.
 */
export const ROOM_HAZE = {
  /** The density of the haze, for each stage side of distance. */
  density: 0.13,
  /**
   * The light of the haze in all directions, in linear values, before the phase. The glow of the
   * hall above the stage in `orchestra-latest.png` has a luma p90 of 49, and the first light of
   * `[0.03, 0.0175, 0.00875]` gave 22.
   */
  color: [0.045, 0.02625, 0.013125],
  /**
   * The g of the Henyey-Greenstein phase: the haze is brighter toward the rim light, which stands
   * behind the stage and shines toward the camera, as the haze of a real hall scatters most light
   * forward.
   */
  forward: 0.6,
} as const;

/** The room haze of one frame. */
export interface HazeFrame {
  /** The depth of the scene at full size, with no hall and no light effects (`BeamDepth`). */
  readonly depth: Texture;
  /** The distance from the camera at which the haze starts, in meters: the subject. */
  readonly start: number;
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** The position of the light that the haze scatters: the rim light on the stage axis. */
  readonly light: Vec3;
  /** The height of the hall floor, in meters. */
  readonly floorY: number;
}

/** The values of the final pass that change with each frame. */
interface PostFrame {
  /** The room haze, or `null` for no haze. */
  readonly haze: HazeFrame | null;
  /** The part of the light that the vignette takes from the corners. */
  readonly vignette: number;
}

/**
 * Makes the uniforms of the color grade, `GRADE_FUNCTION` of `post-shaders.ts`: the shared lookup
 * table of `scene/grade.ts`.
 *
 * @returns The uniforms, new for each call.
 */
export function gradeUniforms() {
  return { uGradeLut: { value: gradeLut() } };
}

/** The number of samples of the multisample target of the scene (design 2.6). */
const MSAA_SAMPLES = 4;

/** The number of changes of the film grain each second, as film at 24 frames each second. */
export const GRAIN_RATE = 24;

/**
 * Gives the seed of the film grain at a time (design 4.5). The seed changes {@link GRAIN_RATE}
 * times each second, at each frame rate of the display.
 *
 * @param timeSec The wall time of the frame, in seconds. A fixed time keeps the grain still.
 * @returns The seed, from 0 to 1024.
 */
export function grainSeed(timeSec: number): number {
  return (Math.floor(timeSec * GRAIN_RATE) * 17.31) % 1024;
}

/** The clear color behind the hall, in sRGB: the dark of the hall far from the light. */
export const CLEAR_COLOR = '#0b0807';

/**
 * The color format of the targets of the scene and of the bloom (design 2.6). `packed` holds three
 * small floats in 32 bits (R11F_G11F_B10F), and needs `EXT_color_buffer_float`. `half` holds four
 * half floats in 64 bits, and needs `EXT_color_buffer_half_float`. With `none`, the scene renders
 * to the canvas with no post effects. The packed format halved the time of the scene pass on the
 * development Mac: 1.9 ms against 3.4 ms at 2880 × 1800 with MSAA.
 */
export type TargetFormat = 'packed' | 'half' | 'none';

/**
 * Selects the color format of the targets from the extensions of the renderer.
 *
 * @param renderer The renderer.
 * @returns The best format that the GPU can render to.
 */
export function targetFormatOf(renderer: WebGLRenderer): TargetFormat {
  if (renderer.extensions.has('EXT_color_buffer_float')) {
    return 'packed';
  }
  if (renderer.extensions.has('EXT_color_buffer_half_float')) {
    return 'half';
  }
  return 'none';
}

/**
 * Calculates the sizes of the bloom levels: half the size of the canvas, then half of each level,
 * with at least one pixel.
 *
 * @param width The width of the drawing buffer, in pixels.
 * @param height The height of the drawing buffer, in pixels.
 * @param levels The number of levels.
 * @returns The width and the height of each level.
 */
export function bloomSizes(width: number, height: number, levels: number): [number, number][] {
  const sizes: [number, number][] = [];
  let w = width;
  let h = height;
  for (let i = 0; i < levels; i++) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    sizes.push([w, h]);
  }
  return sizes;
}

/**
 * Creates a target with linear values in floats and a linear filter.
 *
 * @param width The width, in pixels.
 * @param height The height, in pixels.
 * @param format The color format. `packed` has no alpha channel.
 * @param samples The samples of the multisampling, or 0.
 * @returns The target.
 */
function floatTarget(
  width: number,
  height: number,
  format: TargetFormat,
  samples = 0,
): WebGLRenderTarget {
  const packed = format === 'packed';
  return new WebGLRenderTarget(width, height, {
    type: packed ? UnsignedInt101111Type : HalfFloatType,
    format: packed ? RGBFormat : RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    samples,
    depthBuffer: samples > 0,
  });
}

/** A value of a uniform of a pass. */
type UniformValue = Texture | number | Vector2 | Vector3 | Vector4 | Matrix4 | null;

/** The uniforms of a pass by name. */
type PassUniforms = Record<string, { value: UniformValue }>;

/**
 * Creates the material of a full-screen pass.
 *
 * @param fragmentShader The fragment shader.
 * @param uniforms The uniforms.
 * @param defines The defines of the shader.
 * @returns The material. It reads no depth and writes no depth.
 */
function passMaterial(
  fragmentShader: string,
  uniforms: PassUniforms,
  defines: Record<string, string | number> = {},
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: FULL_SCREEN_VERTEX,
    fragmentShader,
    uniforms,
    defines,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    // The passes into a target take no tone mapping. The final pass to the canvas takes it.
    toneMapped: false,
  });
}

/**
 * Gives the uniforms of the focus (scene/focus.ts) of a pass that reads the depth.
 *
 * @returns New uniforms.
 */
function focusUniforms() {
  return {
    uDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uFocus: { value: 10 },
    uBlurScale: { value: 0 },
    uMaxBlur: { value: LENS.maxBlur },
    uMaxNearBlur: { value: LENS.maxNearBlur },
    uPixelsPerBlur: { value: 1 },
  };
}

/**
 * Sets the value of a uniform of a material, if the material has it.
 *
 * @param material The material.
 * @param name The name of the uniform.
 * @param value The value.
 */
function setUniform(material: ShaderMaterial, name: string, value: UniformValue): void {
  const uniform = material.uniforms[name];
  if (uniform) {
    uniform.value = value;
  }
}

/**
 * Sets the size of one texel of the source of a pass.
 *
 * @param material The material of the pass. It has the uniform `uTexel`.
 * @param source The source of the pass.
 */
function setTexel(material: ShaderMaterial, source: WebGLRenderTarget): void {
  const texel = material.uniforms['uTexel']?.value;
  if (texel instanceof Vector2) {
    texel.set(1 / source.width, 1 / source.height);
  }
}

/** The targets of one size of the canvas and one tier. */
interface Targets {
  /** The scene, with MSAA. */
  readonly scene: WebGLRenderTarget;
  /** The downsample levels of the bloom, from half size down. */
  readonly bloomDown: readonly WebGLRenderTarget[];
  /** The upsample levels of the bloom, one for each level except the smallest. */
  readonly bloomUp: readonly WebGLRenderTarget[];
  /** The depth of the scene at half size, for the depth of field. */
  readonly depth: WebGLRenderTarget | null;
  /** The color and the blur of each pixel at half size. */
  readonly blurPrepare: WebGLRenderTarget | null;
  /** The soft image at half size. */
  readonly blurGather: WebGLRenderTarget | null;
}

/**
 * The post effects of the stage (design 2.6, 4.5). The scene renders with MSAA into a target of
 * floats, then the bloom, the depth of field, and one final pass make the image of the canvas.
 *
 * ```text
 * scene ──> [scene target, MSAA] ──┬──> bloom down 1/2 ... ──> bloom up ──────────┐
 *                                  └──> blur prepare 1/2 ──> blur gather 1/2 ──┐  │
 * scene ──> [depth 1/2] ──────────────────────^ (only with a shallow focus)    v  v
 *           [scene target] ───────────────────────────────────────────────> final pass ──> canvas
 * ```
 */
export class PostPipeline {
  readonly #renderer: WebGLRenderer;
  readonly #format: TargetFormat;
  #tier: QualityTier;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #quad: Mesh;
  #targets: Targets | null = null;
  readonly #bloomPrefilter: ShaderMaterial;
  readonly #bloomDown: ShaderMaterial;
  readonly #bloomUp: ShaderMaterial;
  readonly #blurPrepare: ShaderMaterial;
  #blurGather: ShaderMaterial;
  #final: ShaderMaterial;
  /**
   * The draw of the depth pass of the depth of field with the depth materials of the meshes. The
   * resolve of the depth of the multisample target cost 2.1 ms on the development Mac, and a
   * separate pass at half size costs less.
   */
  readonly #depth: DepthDraw;
  #width = 0;
  #height = 0;

  /**
   * Creates the passes. The targets follow {@link PostPipeline.setSize}.
   *
   * @param renderer The renderer of the canvas.
   * @param format The color format of the targets. It is not `none`.
   * @param tier The quality tier. It sets the bloom levels and the samples of the blur.
   * @param depth Draws the depth pass of the depth of field with a depth material that writes no
   *   color in place of the material of each mesh (`VariantMaterials.renderDepth()`).
   */
  constructor(renderer: WebGLRenderer, format: TargetFormat, tier: QualityTier, depth: DepthDraw) {
    this.#renderer = renderer;
    this.#format = format;
    this.#tier = tier;
    this.#depth = depth;
    const geometry = new BufferGeometry();
    // One triangle that covers the view.
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.#quad = new Mesh(geometry);
    this.#quad.frustumCulled = false;

    const down = () => ({
      uSource: { value: null },
      uTexel: { value: new Vector2() },
      uThreshold: { value: POST_LOOK.bloomThreshold },
      uKnee: { value: POST_LOOK.bloomKnee },
      uDiffusion: { value: POST_LOOK.diffusion },
    });
    this.#bloomPrefilter = passMaterial(BLOOM_DOWN_FRAGMENT, down(), { PREFILTER: 1 });
    this.#bloomDown = passMaterial(BLOOM_DOWN_FRAGMENT, down());
    this.#bloomUp = passMaterial(BLOOM_UP_FRAGMENT, {
      uSource: { value: null },
      uBase: { value: null },
      uTexel: { value: new Vector2() },
    });
    this.#blurPrepare = passMaterial(BLUR_PREPARE_FRAGMENT, {
      uColor: { value: null },
      ...focusUniforms(),
    });
    this.#blurGather = this.#createBlurGather();
    this.#final = this.#createFinal();
  }

  /**
   * Sets the size of the targets to the drawing buffer of the canvas.
   *
   * @param width The width of the drawing buffer, in pixels.
   * @param height The height of the drawing buffer, in pixels.
   */
  setSize(width: number, height: number): void {
    if (width === this.#width && height === this.#height && this.#targets) {
      return;
    }
    this.#width = width;
    this.#height = height;
    this.#disposeTargets();
    this.#targets = this.#createTargets();
  }

  /**
   * Changes the quality tier: the bloom levels and the samples of the blur.
   *
   * @param tier The new tier.
   */
  setTier(tier: QualityTier): void {
    if (tier === this.#tier) {
      return;
    }
    this.#tier = tier;
    this.#blurGather.dispose();
    this.#final.dispose();
    this.#blurGather = this.#createBlurGather();
    this.#final = this.#createFinal();
    this.#disposeTargets();
    this.#targets = this.#createTargets();
  }

  /**
   * Renders a frame of a scene with the post effects to the canvas.
   *
   * @param scene The scene.
   * @param camera The camera.
   * @param focus The focus of the frame (scene/focus.ts).
   * @param effects The light effects that write no depth, such as the visible beam. The depth pass
   *   hides them.
   * @param timeSec The time of the effects, in seconds, for the film grain ({@link grainSeed}).
   * @param frame The room haze and the vignette of the frame.
   */
  render(
    scene: Scene,
    camera: PerspectiveCamera,
    focus: Focus,
    effects: readonly Object3D[],
    timeSec: number,
    frame: PostFrame,
  ): void {
    const targets = this.#targets;
    if (!targets) {
      return;
    }
    const renderer = this.#renderer;
    renderer.setRenderTarget(targets.scene);
    renderer.render(scene, camera);

    const bloom = this.#renderBloom(targets);
    const blur = focus.active ? this.#renderBlur(targets, scene, camera, focus, effects) : null;

    const final = this.#final;
    setUniform(final, 'uScene', targets.scene.texture);
    setUniform(final, 'uBloom', bloom);
    setUniform(final, 'uBlur', blur);
    setUniform(final, 'uBlurOn', blur ? 1 : 0);
    this.#setFocus(final, camera, focus, this.#height / 2);
    setUniform(final, 'uAspect', this.#width / this.#height);
    this.#setHaze(final, camera, frame.haze);
    setUniform(final, 'uVignette', frame.vignette);
    setUniform(final, 'uSeed', grainSeed(timeSec));
    this.#pass(final, null);
  }

  /**
   * Compiles the programs of the passes in steps (design 7.2), so that no frame waits for the GPU
   * to link them. Each pass but the final pass renders into a target, and three.js gives a pass
   * into a target other programs than a pass to the canvas.
   *
   * @param target A render target for the compile of the passes into a target.
   * @returns The steps.
   */
  *compileSteps(target: WebGLRenderTarget): Steps<undefined> {
    const renderer = this.#renderer;
    const passes: readonly (readonly [ShaderMaterial, WebGLRenderTarget | null])[] = [
      [this.#bloomPrefilter, target],
      [this.#bloomDown, target],
      [this.#bloomUp, target],
      [this.#blurPrepare, target],
      [this.#blurGather, target],
      [this.#final, null],
    ];
    for (const [material, into] of passes) {
      this.#quad.material = material;
      compileInto(renderer, into, () => {
        renderer.compile(this.#quad, this.#camera);
      });
      yield;
    }
    return undefined;
  }

  /** Frees the targets, the materials, and the geometry. */
  dispose(): void {
    this.#disposeTargets();
    for (const material of [
      this.#bloomPrefilter,
      this.#bloomDown,
      this.#bloomUp,
      this.#blurPrepare,
      this.#blurGather,
      this.#final,
    ]) {
      material.dispose();
    }
    this.#quad.geometry.dispose();
  }

  #createTargets(): Targets {
    const width = this.#width;
    const height = this.#height;
    const format = this.#format;
    const settings = TIER_SETTINGS[this.#tier];
    const sizes = bloomSizes(width, height, settings.bloomLevels);
    const blur = settings.blurSamples > 0;
    const [halfWidth, halfHeight] = bloomSizes(width, height, 1)[0] ?? [1, 1];
    let depth: WebGLRenderTarget | null = null;
    if (blur) {
      depth = new WebGLRenderTarget(halfWidth, halfHeight, { type: UnsignedByteType });
      depth.depthTexture = new DepthTexture(halfWidth, halfHeight, UnsignedIntType);
    }
    const scene = floatTarget(width, height, format, MSAA_SAMPLES);
    // No pass reads the depth of the scene target, so the resolve of its samples copies only the
    // color. The depth of field and the haze render their own depth.
    scene.resolveDepthBuffer = false;
    return {
      scene,
      bloomDown: sizes.map(([w, h]) => floatTarget(w, h, format)),
      bloomUp: sizes.slice(0, -1).map(([w, h]) => floatTarget(w, h, format)),
      depth,
      // The blur of each pixel needs the alpha channel.
      blurPrepare: blur ? floatTarget(halfWidth, halfHeight, 'half') : null,
      blurGather: blur ? floatTarget(halfWidth, halfHeight, format) : null,
    };
  }

  #renderBloom(targets: Targets): Texture | null {
    const levels = targets.bloomDown;
    let source = targets.scene;
    for (const [i, level] of levels.entries()) {
      const material = i === 0 ? this.#bloomPrefilter : this.#bloomDown;
      setUniform(material, 'uSource', source.texture);
      setTexel(material, source);
      this.#pass(material, level);
      source = level;
    }
    // Each level of the upsample has its own target, so that no pass writes a target that the
    // frame already wrote. The second write of a target cost 0.4 ms for each level on the
    // development Mac.
    for (let i = levels.length - 2; i >= 0; i--) {
      const base = levels[i];
      const to = targets.bloomUp[i];
      if (base && to) {
        setUniform(this.#bloomUp, 'uSource', source.texture);
        setUniform(this.#bloomUp, 'uBase', base.texture);
        setTexel(this.#bloomUp, source);
        this.#pass(this.#bloomUp, to);
        source = to;
      }
    }
    return levels.length > 0 ? source.texture : null;
  }

  #renderBlur(
    targets: Targets,
    scene: Scene,
    camera: PerspectiveCamera,
    focus: Focus,
    effects: readonly Object3D[],
  ): Texture | null {
    const { depth, blurPrepare, blurGather } = targets;
    if (!depth || !blurPrepare || !blurGather) {
      return null;
    }
    this.#renderDepth(depth, scene, camera, effects);
    const prepare = this.#blurPrepare;
    setUniform(prepare, 'uColor', targets.scene.texture);
    this.#setFocus(prepare, camera, focus, blurPrepare.height / 2);
    this.#pass(prepare, blurPrepare);
    const gather = this.#blurGather;
    setUniform(gather, 'uSource', blurPrepare.texture);
    setTexel(gather, blurPrepare);
    setUniform(gather, 'uPixelsPerBlur', blurPrepare.height / 2);
    this.#pass(gather, blurGather);
    return blurGather.texture;
  }

  #renderDepth(
    depth: WebGLRenderTarget,
    scene: Scene,
    camera: PerspectiveCamera,
    effects: readonly Object3D[],
  ): void {
    const renderer = this.#renderer;
    // The shadow map of the frame is ready, so the depth pass needs no new one.
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    for (const effect of effects) {
      effect.visible = false;
    }
    renderer.setRenderTarget(depth);
    this.#depth.renderDepth(() => {
      renderer.render(scene, camera);
    });
    for (const effect of effects) {
      effect.visible = true;
    }
    renderer.shadowMap.autoUpdate = shadows;
  }

  /**
   * Sets the uniforms of the room haze of a frame ({@link ROOM_HAZE}).
   *
   * @param material The final pass.
   * @param camera The camera of the frame.
   * @param haze The haze of the frame, or `null` for no haze.
   */
  #setHaze(material: ShaderMaterial, camera: PerspectiveCamera, haze: HazeFrame | null): void {
    setUniform(material, 'uHazeOn', haze ? 1 : 0);
    setUniform(material, 'uSceneDepth', haze?.depth ?? null);
    if (!haze) {
      return;
    }
    const uniforms = material.uniforms;
    const inverse = uniforms['uHazeInverse']?.value;
    if (inverse instanceof Matrix4) {
      inverse.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    }
    const from = uniforms['uHazeCamera']?.value;
    if (from instanceof Vector3) {
      from.copy(camera.position);
    }
    const light = uniforms['uHazeLight']?.value;
    if (light instanceof Vector3) {
      light
        .set(...haze.light)
        .sub(camera.position)
        .normalize();
    }
    const values = uniforms['uHaze']?.value;
    if (values instanceof Vector4) {
      values.set(haze.start, ROOM_HAZE.density / haze.stageSide, ROOM_HAZE.forward, haze.floorY);
    }
  }

  #setFocus(
    material: ShaderMaterial,
    camera: PerspectiveCamera,
    focus: Focus,
    pixelsPerBlur: number,
  ): void {
    setUniform(material, 'uDepth', this.#targets?.depth?.depthTexture ?? null);
    setUniform(material, 'uNear', camera.near);
    setUniform(material, 'uFar', camera.far);
    setUniform(material, 'uFocus', focus.distance);
    setUniform(material, 'uBlurScale', focus.scale);
    setUniform(material, 'uPixelsPerBlur', pixelsPerBlur);
  }

  #pass(material: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.#quad.material = material;
    const renderer = this.#renderer;
    renderer.setRenderTarget(target);
    // Each pass writes each pixel of its target, so it clears nothing.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.#quad, this.#camera);
    renderer.autoClear = autoClear;
  }

  #createBlurGather(): ShaderMaterial {
    return passMaterial(
      BLUR_GATHER_FRAGMENT,
      {
        uSource: { value: null },
        uTexel: { value: new Vector2() },
        uPixelsPerBlur: { value: 1 },
      },
      { SAMPLES: Math.max(1, TIER_SETTINGS[this.#tier].blurSamples) },
    );
  }

  #createFinal(): ShaderMaterial {
    const settings = TIER_SETTINGS[this.#tier];
    const defines: Record<string, number> = {};
    if (settings.bloomLevels > 0) {
      defines['BLOOM'] = 1;
    }
    if (settings.blurSamples > 0) {
      defines['DEPTH_OF_FIELD'] = 1;
    }
    const look = POST_LOOK;
    const material = passMaterial(
      FINAL_FRAGMENT,
      {
        uScene: { value: null },
        uBloom: { value: null },
        uBlur: { value: null },
        uBlurOn: { value: 0 },
        uBloomStrength: { value: look.bloomStrength },
        uHalation: { value: new Vector3(...look.halation) },
        uSceneDepth: { value: null },
        uHazeOn: { value: 0 },
        uHazeInverse: { value: new Matrix4() },
        uHazeCamera: { value: new Vector3() },
        uHazeLight: { value: new Vector3(0, 1, 0) },
        uHazeColor: { value: new Vector3(...ROOM_HAZE.color) },
        uHaze: { value: new Vector4() },
        ...gradeUniforms(),
        uVignette: { value: look.vignette },
        uAspect: { value: 1 },
        uGrain: { value: look.grain },
        uSeed: { value: 0 },
        ...focusUniforms(),
      },
      defines,
    );
    // The final pass draws to the canvas, so it takes the tone mapping of the renderer.
    material.toneMapped = true;
    return material;
  }

  #disposeTargets(): void {
    const targets = this.#targets;
    if (!targets) {
      return;
    }
    targets.depth?.depthTexture?.dispose();
    for (const target of [
      targets.scene,
      ...targets.bloomDown,
      ...targets.bloomUp,
      targets.depth,
      targets.blurPrepare,
      targets.blurGather,
    ]) {
      target?.dispose();
    }
    this.#targets = null;
  }
}
