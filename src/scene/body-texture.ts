import { SRGBColorSpace, Texture } from 'three';
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

/**
 * The anisotropic filter of a color map of a studio body: the fur of a seated player slopes away
 * from the stage camera.
 */
const BODY_MAP_ANISOTROPY = 4;

/** The texture channel of the color map: the attribute `uv1`. The finish table reads `uv`. */
const BODY_MAP_CHANNEL = 1;

/** A color map of a studio body (`StudioTexture`, design 4.5) and the state of its load. */
interface BodyMap {
  /** The texture. It has no image until the load ends. */
  readonly texture: Texture;
  /** The uniform `bodyMapOn` of the shader: 1 when the image is on the GPU, 0 before. */
  readonly on: { value: number };
  /** True after the load starts. */
  started: boolean;
  /** True after the load ends, also after a failed load. */
  settled: boolean;
}

/** The color map of each image file, made on its first use. */
const maps = new Map<string, BodyMap>();

/** The material with the color map of each shared material and image file. */
const materials = new WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>>();

/**
 * Gives a loader of the URL of each color map of a studio body, by its path relative to this
 * module. Each image is an asset of a lazy chunk of Vite, so the first download holds none of
 * them (design 7.2). The call runs only in the browser: Node has no `import.meta.glob`.
 *
 * @returns The loaders.
 */
function mapUrls(): Record<string, () => Promise<string>> {
  return import.meta.glob<string>('../../assets/models/**/*-color.webp', {
    query: '?url',
    import: 'default',
  });
}

/**
 * Gives the color map of an image file, made on its first use.
 *
 * @param file The image, relative to the repository (`StudioTexture.file`).
 * @returns The map.
 */
function bodyMapOf(file: string): BodyMap {
  let map = maps.get(file);
  if (!map) {
    const texture = new Texture();
    texture.name = file;
    texture.colorSpace = SRGBColorSpace;
    texture.channel = BODY_MAP_CHANNEL;
    // The texture points have v from the top edge, as in glTF, and an image bitmap keeps its rows.
    texture.flipY = false;
    texture.anisotropy = BODY_MAP_ANISOTROPY;
    map = { texture, on: { value: 0 }, started: false, settled: false };
    maps.set(file, map);
  }
  return map;
}

/**
 * Loads the image of a color map in the next animation frame, decodes it off the main thread,
 * and turns the map on. A failed load leaves the colors of the faces.
 *
 * @param file The image, relative to the repository.
 * @param map The map.
 */
function startLoad(file: string, map: BodyMap): void {
  map.started = true;
  const load = async (): Promise<void> => {
    const url = mapUrls()[`../../${file}`];
    if (!url) {
      throw new Error(`The color map ${file} is not an asset of the build.`);
    }
    const response = await fetch(await url());
    if (!response.ok) {
      throw new Error(`The color map ${file} gave the status ${response.status}.`);
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
 * Tells if each color map whose load started has loaded or failed. The image tools wait for this
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
        '#if defined( USE_COLOR ) && defined( USE_MAP )',
        '\tvec3 bodyTexel = texture2D( map, vMapUv ).rgb;',
        '\tdiffuseColor.rgb *= vMapUv.x >= 0.0 && bodyMapOn > 0.5 ? bodyTexel : vColor;',
        '#else',
        '\t#include <color_fragment>',
        '#endif',
      ].join('\n'),
    );
}

/**
 * Gives the material of a player whose studio body has a color map (design 4.5): a copy of the
 * shared material with the map, made once for each shared material and image. The copy keeps the
 * shader patch of the shared material, and adds {@link addBodyMap}. Its first draw starts the load
 * of the image, so the body shows the colors of its faces in the first frame and until the load
 * ends.
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
    const map = bodyMapOf(file);
    const copy = shared.clone();
    copy.map = map.texture;
    copy.onBeforeCompile = (shader, renderer) => {
      shared.onBeforeCompile(shader, renderer);
      addBodyMap(shader, map.on);
    };
    copy.customProgramCacheKey = () => `${shared.customProgramCacheKey()} bodyMap`;
    copy.onBeforeRender = () => {
      if (!map.started) {
        startLoad(file, map);
      }
    };
    byFile.set(file, copy);
    material = copy;
  }
  return material;
}
