import { NoColorSpace, SRGBColorSpace, Texture } from 'three';
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

import { addFurShading, createFurUniforms, furNormalScale } from './fur.ts';

/**
 * The anisotropic filter of a color map or a normal map of a studio body: the fur of a seated
 * player slopes away from the stage camera.
 */
const BODY_MAP_ANISOTROPY = 4;

/**
 * The texture channel of the color map and of the normal map: the attribute `uv1`. The finish
 * table reads `uv`.
 */
const BODY_MAP_CHANNEL = 1;

/**
 * The kind of an image of a studio body: the color map (`StudioTexture`), or the normal map of
 * the fur (`<name>-normal.webp` beside `<name>-color.webp`, design 4.5).
 */
type BodyMapKind = 'color' | 'normal';

/** A color map or a normal map of a studio body (design 4.5) and the state of its load. */
interface BodyMap {
  /** The texture. It has no image until the load ends. */
  readonly texture: Texture;
  /**
   * The uniform of the shader that turns the map on (`bodyMapOn` or `bodyNormalOn`): 1 when the
   * image is on the GPU, 0 before.
   */
  readonly on: { value: number };
  /** True for a map that a body can lack: the normal map. Its missing file is no fault. */
  readonly optional: boolean;
  /** True after the load starts. */
  started: boolean;
  /** True after the load ends, also after a failed load. */
  settled: boolean;
}

/** The map of each image file, made on its first use. */
const maps = new Map<string, BodyMap>();

/** The material with the color map of each shared material and image file. */
const materials = new WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>>();

/**
 * Gives a loader of the URL of each color map and normal map of a studio body, by its path
 * relative to this module. Each image is an asset of a lazy chunk of Vite, so the first download
 * holds none of them (design 7.2). The call runs only in the browser: Node has no
 * `import.meta.glob`.
 *
 * @returns The loaders.
 */
function mapUrls(): Record<string, () => Promise<string>> {
  return import.meta.glob<string>(
    ['../../assets/models/**/*-color.webp', '../../assets/models/**/*-normal.webp'],
    { query: '?url', import: 'default' },
  );
}

/**
 * Gives the file of the normal map of the fur beside a color map: `<name>-normal.webp` for
 * `<name>-color.webp`.
 *
 * @param file The color map, relative to the repository.
 * @returns The normal map, relative to the repository. The file can be missing.
 */
function normalFileOf(file: string): string {
  return file.replace(/-color\.webp$/, '-normal.webp');
}

/**
 * Gives the map of an image file, made on its first use.
 *
 * @param file The image, relative to the repository.
 * @param kind The kind of the image. A normal map holds directions, so it has no color space.
 * @returns The map.
 */
function bodyMapOf(file: string, kind: BodyMapKind): BodyMap {
  let map = maps.get(file);
  if (!map) {
    const texture = new Texture();
    texture.name = file;
    texture.colorSpace = kind === 'color' ? SRGBColorSpace : NoColorSpace;
    texture.channel = BODY_MAP_CHANNEL;
    // The texture points have v from the top edge, as in glTF, and an image bitmap keeps its rows.
    texture.flipY = false;
    texture.anisotropy = BODY_MAP_ANISOTROPY;
    map = {
      texture,
      on: { value: 0 },
      optional: kind === 'normal',
      started: false,
      settled: false,
    };
    maps.set(file, map);
  }
  return map;
}

/**
 * Loads the image of a map in the next animation frame, decodes it off the main thread, and
 * turns the map on. A failed load leaves the colors of the faces, or the normals of the mesh. An
 * optional map with no file of the build ends the load with no message.
 *
 * @param file The image, relative to the repository.
 * @param map The map.
 */
function startLoad(file: string, map: BodyMap): void {
  map.started = true;
  const load = async (): Promise<void> => {
    const url = mapUrls()[`../../${file}`];
    if (!url) {
      if (map.optional) {
        return;
      }
      throw new Error(`The map ${file} is not an asset of the build.`);
    }
    const response = await fetch(await url());
    if (!response.ok) {
      throw new Error(`The map ${file} gave the status ${response.status}.`);
    }
    const bitmap = await createImageBitmap(await response.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    map.texture.image = bitmap;
    map.texture.needsUpdate = true;
    map.on.value = 1;
  };
  requestAnimationFrame(() => {
    load()
      .catch((error: Error) => {
        console.warn(error.message);
      })
      .finally(() => {
        map.settled = true;
      });
  });
}

/**
 * Tells if each map whose load started has loaded or failed. The image tools wait for this
 * before a screenshot (`gallery/main.ts`).
 *
 * @returns True when no load runs.
 */
export function bodyMapsSettled(): boolean {
  return [...maps.values()].every((map) => !map.started || map.settled);
}

/**
 * Adds the color map to the shader of a material: each corner with a texture point (u >= 0)
 * takes the color of the map in place of its vertex color, after the load. The light, the
 * finish, and the grade do not change. Call it in `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @param on The uniform that turns the map on.
 * @throws Error if the shader has no color chunk of three.js that the patch knows.
 */
function addBodyMap(shader: WebGLProgramParametersWithUniforms, on: { value: number }): void {
  if (
    !shader.fragmentShader.includes('#include <map_fragment>') ||
    !shader.fragmentShader.includes('#include <color_fragment>')
  ) {
    throw new Error('The shader has no map or color chunk of three.js. Update addBodyMap().');
  }
  shader.uniforms['bodyMapOn'] = on;
  shader.fragmentShader = `uniform float bodyMapOn;\n${shader.fragmentShader}`
    .replace('#include <map_fragment>', '')
    .replace(
      '#include <color_fragment>',
      [
        '#if defined( USE_MAP ) && ( defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) )',
        '\tvec3 bodyTexel = texture2D( map, vMapUv ).rgb;',
        '\tbool bodyMapped = vMapUv.x >= 0.0 && bodyMapOn > 0.5;',
        '\tdiffuseColor.rgb *= bodyMapped ? bodyTexel : vColor.rgb;',
        '\t#ifdef USE_COLOR_ALPHA',
        '\t\tdiffuseColor.a *= vColor.a;',
        '\t#endif',
        '#else',
        '\t#include <color_fragment>',
        '#endif',
      ].join('\n'),
    );
}

/**
 * Gives the material of a player whose studio body has a color map (design 4.5): a copy of the
 * shared material with the map, made once for each shared material and image. The copy keeps the
 * shader patch of the shared material, and adds {@link addBodyMap} and the fur shading
 * (`addFurShading()`): the sheen, and the normal map beside the color map ({@link normalFileOf}),
 * when the build has it. Its first draw starts the load of each image, so the body shows the
 * colors of its faces and the normals of its mesh in the first frame and until the load ends.
 *
 * @param shared The shared material (`createMaterials()`).
 * @param file The image, relative to the repository (`StudioTexture.file`).
 * @returns The material.
 */
export function bodyMapMaterial(shared: MeshStandardMaterial, file: string): MeshStandardMaterial {
  let byFile = materials.get(shared);
  if (!byFile) {
    byFile = new Map();
    materials.set(shared, byFile);
  }
  let material = byFile.get(file);
  if (!material) {
    const map = bodyMapOf(file, 'color');
    const normalFile = normalFileOf(file);
    const normalMap = bodyMapOf(normalFile, 'normal');
    const fur = createFurUniforms(normalMap.on);
    const copy = shared.clone();
    copy.map = map.texture;
    copy.normalMap = normalMap.texture;
    copy.normalScale = furNormalScale();
    copy.onBeforeCompile = (shader, renderer) => {
      shared.onBeforeCompile(shader, renderer);
      addBodyMap(shader, map.on);
      addFurShading(shader, fur);
    };
    copy.customProgramCacheKey = () => `${shared.customProgramCacheKey()} bodyMap fur`;
    copy.onBeforeRender = () => {
      if (!map.started) {
        startLoad(file, map);
      }
      if (!normalMap.started) {
        startLoad(normalFile, normalMap);
      }
    };
    byFile.set(file, copy);
    material = copy;
  }
  return material;
}
