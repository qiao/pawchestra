import { Color, ShaderChunk, Vector2 } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

import { FINISH_ORDER } from '../models/mesh.ts';
import { MAX_RIM_LIGHTS } from './rim-light.ts';

/**
 * The fur shading of a body with a color map (design 4.5): a sheen and the strand normals
 * of a normal map, only on the fur faces: the faces with texture points (`BodyTexture`) and the
 * finish `matte`. The eyeballs (the finish `eye`), the gloss faces, and the `plain` faces, such as
 * a whisker, keep the shading of the shared material.
 */
export const FUR_LOOK = {
  /**
   * The sheen of the fur: the "Charlie" sheen lobe of three.js (Estevez and Kulla 2017), as
   * velvet gives it. It is strong where the view grazes the surface, so each light gives a soft
   * light on the outline. The rim lights stand behind the orchestra, so they give a warm rim on
   * the outline of the head and the shoulders. It is weak where the surface faces the view.
   */
  sheen: {
    /** The color of the sheen, in sRGB: a warm cream, as the light through the fur tips. */
    color: '#ffe6cc',
    /** The factor of the color. 0 turns the sheen off. */
    strength: 1,
    /** The roughness of the sheen lobe: a larger value spreads the rim farther over the body. */
    roughness: 0.35,
    /**
     * The linear luma of the fur color at and above which the sheen has its full strength. Below
     * it, the sheen falls with the luma, so that dark fur, such as the socks of a fox, stays dark,
     * as dark fur tips pass less light. The cream fur of the rabbit (luma 0.53 and more) keeps the
     * full sheen.
     */
    fullLuma: 0.5,
  },
  /**
   * The factor of the tilts of the normal map, in the tilts of the source map: 1 gives the strand
   * relief of the Tripo bake, 0 turns the normal map off.
   */
  normal: 1.5,
} as const;

/**
 * The gain of the tilts in the web copy of a normal map (`<name>-normal.webp`): the x and y of
 * each normal of the source map, times this factor, then stored in 8 bits. The tilts of the
 * source are small (the median is about 0.01), so the gain keeps them above the step of 8 bits
 * and the loss of the WebP encoder. The shader divides by it. The web copy first limits each tilt
 * to 0.2: the larger tilts (0.2 % of the texels) are the baked eye rims and nose of the source
 * mesh, which the edited mesh does not have. The README of the model folder gives the steps.
 */
export const NORMAL_MAP_GAIN = 4;

/** The uniforms of the fur shading of one material. */
export interface FurUniforms {
  /** The uniform `bodyNormalOn`: 1 when the image of the normal map is on the GPU, 0 before. */
  readonly bodyNormalOn: { value: number };
  /** The linear color of the sheen, times its strength. */
  readonly sheenColor: { value: Color };
  /** The roughness of the sheen lobe. */
  readonly sheenRoughness: { value: number };
}

/**
 * Creates the uniforms of the fur shading from {@link FUR_LOOK}. It reads the look at each call,
 * so that the look override of the dev server reaches it.
 *
 * @param normalOn The uniform that turns the normal map on.
 * @returns The uniforms.
 */
export function createFurUniforms(normalOn: { value: number }): FurUniforms {
  const { color, strength, roughness } = FUR_LOOK.sheen;
  return {
    bodyNormalOn: normalOn,
    sheenColor: { value: new Color(color).multiplyScalar(strength) },
    sheenRoughness: { value: roughness },
  };
}

/**
 * Gives the factor of the tilts of a normal map for `normalScale` of a material, from
 * {@link FUR_LOOK}. The y factor is negative: the green of the map points to +v of OpenGL (up in
 * the image), and the texture points of a body have v from the top edge, as in glTF.
 *
 * @returns The factor.
 */
export function furNormalScale(): Vector2 {
  const scale = FUR_LOOK.normal / NORMAL_MAP_GAIN;
  return new Vector2(scale, -scale);
}

/** The index of the finish `matte` of the fur in the finish table (`createFinishTexture()`). */
const MATTE_FINISH = FINISH_ORDER.indexOf('matte');

/**
 * The GLSL of the fur mask of a pixel, at the start of the main function: 1 on a fur face (a
 * texture point with u >= 0 and the finish `matte`), else 0.
 *
 * @returns The GLSL.
 */
function furMask(): string {
  const count = FINISH_ORDER.length.toFixed(1);
  const lower = MATTE_FINISH.toFixed(1);
  const upper = (MATTE_FINISH + 1).toFixed(1);
  return /* glsl */ `
float furFace = vMapUv.x >= 0.0 && vRoughnessMapUv.x * ${count} > ${lower} && vRoughnessMapUv.x * ${count} < ${upper} ? 1.0 : 0.0;
`;
}

/**
 * The GLSL of the strand normals, in place of the normal map chunk of three.js. The map turns
 * the normal only on a fur face after its load. The tangent frame comes from the screen
 * derivatives of the view position and of the texture points (`getTangentFrame()` of three.js),
 * so the skin needs no tangents. The web copy holds the tilts times {@link NORMAL_MAP_GAIN}, so
 * its blue channel is no z: the shader takes z = 1, as a small tilt has. A stored z of 0 gave a
 * zero normal and NaN pixels. The sample is outside the branch, because a pixel in a branch can
 * have no derivatives.
 */
const FUR_NORMAL = /* glsl */ `
vec2 furTilt = ( texture2D( normalMap, vNormalMapUv ).xy * 2.0 - 1.0 ) * normalScale;
if ( bodyNormalOn > 0.5 && furFace > 0.5 ) {
  normal = normalize( tbn * vec3( furTilt, 1.0 ) );
}
`;

/**
 * The GLSL that keeps the sheen to the fur faces, after the material setup of three.js, with the
 * strength of the luma of the fur color ({@link FUR_LOOK}).
 */
const FUR_SHEEN_MASK = /* glsl */ `
material.sheenColor *= furFace * saturate( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / ${FUR_LOOK.sheen.fullLuma.toFixed(3)} );
`;

/**
 * The GLSL of the sheen of the rim lights on the fur faces, after the lights of three.js. The rim
 * lights are no lights of three.js (`scene/rim-light.ts`), so the sheen code of three.js does not
 * see them. Their diffuse light comes from the vertices, but the sheen lobe is narrow at the
 * outline, so each fur pixel calculates it: the cone and the decay 2 of a spotlight, the pool of
 * the stage lights, and the normal of the strands.
 */
const RIM_SHEEN = /* glsl */ `
if (furFace > 0.5) {
  for (int i = 0; i < ${MAX_RIM_LIGHTS}; i++) {
    if (i >= uRimCount) {
      break;
    }
    vec3 rimSheenToLamp = uRimPosition[i] - lightPoolWorld;
    float rimSheenDistance2 = max(dot(rimSheenToLamp, rimSheenToLamp), 1e-4);
    vec3 rimSheenDirection = rimSheenToLamp * inversesqrt(rimSheenDistance2);
    float rimSheenCone = smoothstep(uRimCone[i].x, uRimCone[i].y, dot(-rimSheenDirection, uRimAxis[i]));
    vec3 rimSheenLight = normalize((viewMatrix * vec4(rimSheenDirection, 0.0)).xyz);
    float rimSheenFacing = saturate(dot(geometryNormal, rimSheenLight));
    vec3 rimSheenIrradiance = uRimColor[i] * (rimSheenFacing * rimSheenCone * lightPool / rimSheenDistance2);
    sheenSpecularDirect += rimSheenIrradiance * BRDF_Sheen(rimSheenLight, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness);
  }
}
`;

/**
 * Adds the fur shading to the shader of a standard material with a color map and a tangent-space
 * normal map on the channel of the texture points. It turns on the sheen code of three.js
 * (`USE_SHEEN`), which a standard material shares with the physical material: the sheen of each
 * direct light, with the pool of the stage lights, and of the environment. A shader with the rim
 * lights (`addRimLight()`) also gets their sheen ({@link RIM_SHEEN}). Call it in
 * `onBeforeCompile`, after the patches of the shared material and of the color map.
 *
 * @param shader The shader of the material.
 * @param uniforms The uniforms of the fur.
 * @throws Error if the shader has no chunk of three.js that the patch knows.
 */
export function addFurShading(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: FurUniforms,
): void {
  if (
    !shader.fragmentShader.includes('#include <normal_fragment_begin>') ||
    !shader.fragmentShader.includes('#include <normal_fragment_maps>') ||
    !shader.fragmentShader.includes('#include <lights_physical_fragment>') ||
    !shader.fragmentShader.includes('#ifdef USE_SHEEN') ||
    !ShaderChunk.normal_fragment_begin.includes('mat3 tbn = getTangentFrame(') ||
    !ShaderChunk.lights_physical_fragment.includes('material.sheenColor = sheenColor;')
  ) {
    throw new Error('The shader has no normal or sheen chunk of three.js. Update addFurShading().');
  }
  shader.uniforms['bodyNormalOn'] = uniforms.bodyNormalOn;
  shader.uniforms['sheenColor'] = uniforms.sheenColor;
  shader.uniforms['sheenRoughness'] = uniforms.sheenRoughness;
  const rim = shader.fragmentShader.includes('uniform vec3 uRimPosition[');
  if (rim && !shader.fragmentShader.includes('vec3 lightPoolWorld =')) {
    throw new Error('The rim lights need the pool of the stage lights. Update addFurShading().');
  }
  shader.fragmentShader = `#define USE_SHEEN\nuniform float bodyNormalOn;\n${shader.fragmentShader}`
    .replace('#include <normal_fragment_begin>', `${furMask()}#include <normal_fragment_begin>`)
    .replace('#include <normal_fragment_maps>', FUR_NORMAL)
    .replace(
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>\n${FUR_SHEEN_MASK}`,
    )
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\n${rim ? RIM_SHEEN : ''}`,
    );
}
