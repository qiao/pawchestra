// oxlint-disable eslint/no-underscore-dangle -- the steps of the PMREM generator of three.js have
// names with an underscore, and this module is the one place that calls them.
import { Color, CubeCamera, PerspectiveCamera } from 'three';
import type {
  CubeTexture,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';

import type { Steps } from '../score/steps.ts';
import { compileInto, gpuDoneSteps, programsReadySteps } from './programs.ts';

declare module 'three' {
  /**
   * The private steps of `fromScene()` and `fromCubemap()` of three.js r187, which
   * {@link fromSceneSteps} and {@link fromCubemapSteps} run in separate tasks (design 7.2). The
   * types of three.js do not declare them.
   */
  interface PMREMGenerator {
    /** The blur material of `fromScene()`, after the first {@link PMREMGenerator._blur}. */
    readonly _blurMaterial: ShaderMaterial | null;
    /** The GGX material of the sharp mip levels, after the first `_applyPMREM()`. */
    readonly _ggxMaterial: ShaderMaterial | null;
    /** The material of the rough mip levels, after the first `_applyPMREM()`. */
    readonly _integrationMaterial: ShaderMaterial | null;
    /** The cube material of `fromCubemap()`, after `compileCubemapShader()`. */
    readonly _cubemapMaterial: ShaderMaterial | null;
    /** Sets the size of the cube faces: a power of two, 256 or more. */
    _setSize(cubeSize: number): void;
    /** Makes the output target, with its mip levels and no automatic mipmaps. */
    _allocateTarget(): WebGLCubeRenderTarget;
    /** Gives the source cube of the size, with automatic mipmaps. The generator keeps it. */
    _getSourceTarget(depthBuffer?: boolean): WebGLCubeRenderTarget;
    /** Compiles a material with the box mesh and the cube camera of the draws. */
    _compileMaterial(material: ShaderMaterial): void;
    /** Renders the box mesh with a material into the six faces of one mip level of a target. */
    _renderCube(target: WebGLCubeRenderTarget, lod: number, material: ShaderMaterial): void;
    /** Renders a cube texture into the source cube. */
    _textureToCubemap(texture: CubeTexture): void;
    /** Blurs the source cube in two passes, with level 0 of the output target between them. */
    _blur(target: WebGLCubeRenderTarget, sigma: number): void;
    /** Renders the mip levels of the output target from the source cube. */
    _applyPMREM(target: WebGLCubeRenderTarget): void;
  }
}

/**
 * Makes the blur, the GGX, and the integration materials of the generator. three.js makes them
 * only in the first draw, so the steps call the draw functions one time with no draw. The
 * generator keeps the materials.
 *
 * @param generator The PMREM generator, after `_getSourceTarget()`.
 * @param target The output target.
 */
function createMaterials(generator: PMREMGenerator, target: WebGLCubeRenderTarget): void {
  // An own property hides the draw of the prototype until the delete.
  Object.defineProperty(generator, '_renderCube', { value: () => {}, configurable: true });
  try {
    generator._blur(target, 0);
    generator._applyPMREM(target);
  } finally {
    Reflect.deleteProperty(generator, '_renderCube');
  }
}

/** The scene of {@link fromSceneSteps}, and the values of `fromScene()` of three.js. */
interface SceneSource {
  readonly scene: Scene;
  /** The size of each cube face, in pixels. */
  readonly size: number;
  /** The blur of the largest mip level, in radians. */
  readonly sigma: number;
}

/**
 * Renders the scene into the source cube from the origin, as `fromScene()` of three.js r187 does:
 * each face clears its color, its depth, and its stencil, and a scene with no background shows the
 * clear color.
 *
 * @param renderer The renderer.
 * @param scene The scene.
 * @param cube The source cube of the generator.
 */
function captureScene(renderer: WebGLRenderer, scene: Scene, cube: WebGLCubeRenderTarget): void {
  const { autoClear, autoClearColor, autoClearDepth, autoClearStencil } = renderer;
  const background = scene.background;
  renderer.autoClear = true;
  renderer.autoClearColor = true;
  renderer.autoClearDepth = true;
  renderer.autoClearStencil = true;
  scene.background ??= renderer.getClearColor(new Color());
  new CubeCamera(0.1, 100, cube).update(renderer, scene);
  renderer.autoClear = autoClear;
  renderer.autoClearColor = autoClearColor;
  renderer.autoClearDepth = autoClearDepth;
  renderer.autoClearStencil = autoClearStencil;
  scene.background = background;
}

/**
 * Makes the PMREM of a scene as `fromScene()` of three.js r187 does, with its near plane, its far
 * plane, and the origin, in steps (design 7.2). The programs of the scene and of the generator
 * compile in parallel first. Then the faces, the blur, and the mip levels render in separate
 * tasks. The generator keeps its materials, so a later {@link fromCubemapSteps} of the same size
 * compiles no program again.
 *
 * Each step sets the render target back at its end, because the frames of the page render between
 * the steps.
 *
 * @param renderer The renderer.
 * @param generator The PMREM generator.
 * @param compileTarget A render target for the compile: the passes render into targets.
 * @param source The scene, the size of the faces, and the blur.
 * @returns The steps, which return the target that holds the PMREM. The caller frees it.
 */
export function* fromSceneSteps(
  renderer: WebGLRenderer,
  generator: PMREMGenerator,
  compileTarget: WebGLRenderTarget,
  source: SceneSource,
): Steps<WebGLRenderTarget> {
  generator._setSize(source.size);
  const target = generator._allocateTarget();
  const cube = generator._getSourceTarget(true);
  createMaterials(generator, target);
  compileInto(renderer, compileTarget, () => {
    renderer.compile(source.scene, new PerspectiveCamera());
    // The call makes the cube material of the captures (design 4.5).
    generator.compileCubemapShader();
    const materials = [
      generator._blurMaterial,
      generator._ggxMaterial,
      generator._integrationMaterial,
    ];
    for (const material of materials) {
      if (material) {
        generator._compileMaterial(material);
      }
    }
  });
  let done = false;
  try {
    yield* programsReadySteps(renderer);
    const saved = renderer.getRenderTarget();
    // The blur makes the mipmaps of the source cube, so the capture makes none.
    cube.texture.mipmapsAutoUpdate = source.sigma <= 0;
    captureScene(renderer, source.scene, cube);
    cube.texture.mipmapsAutoUpdate = true;
    renderer.setRenderTarget(saved);
    yield;
    if (source.sigma > 0) {
      generator._blur(target, source.sigma);
      renderer.setRenderTarget(saved);
      yield;
    }
    generator._applyPMREM(target);
    renderer.setRenderTarget(saved);
    yield* gpuDoneSteps(renderer);
    done = true;
    return target;
  } finally {
    // A stopped run also frees the target (`runSliced()`).
    if (!done) {
      target.dispose();
    }
  }
}

/**
 * Makes the PMREM of a cube texture as `fromCubemap()` of three.js r187 does, in steps (design
 * 7.2): the faces and the mip levels render in separate tasks.
 *
 * @param renderer The renderer.
 * @param generator The PMREM generator, after a {@link fromSceneSteps} that compiled its
 *   programs.
 * @param texture The cube texture.
 * @param size The size of each face of the cube, in pixels.
 * @returns The steps, which return the target that holds the PMREM. The caller frees it.
 */
export function* fromCubemapSteps(
  renderer: WebGLRenderer,
  generator: PMREMGenerator,
  texture: CubeTexture,
  size: number,
): Steps<WebGLRenderTarget> {
  const saved = renderer.getRenderTarget();
  generator._setSize(size);
  const target = generator._allocateTarget();
  let done = false;
  try {
    generator._textureToCubemap(texture);
    renderer.setRenderTarget(saved);
    yield;
    generator._applyPMREM(target);
    renderer.setRenderTarget(saved);
    yield* gpuDoneSteps(renderer);
    done = true;
    return target;
  } finally {
    // A stopped run also frees the target (`runSliced()`).
    if (!done) {
      target.dispose();
    }
  }
}
