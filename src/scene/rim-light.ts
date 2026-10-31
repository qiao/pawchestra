import { ShaderChunk, SpotLight, Vector2, Vector3 } from 'three';
import type { Group, WebGLProgramParametersWithUniforms } from 'three';

import { LIGHT_NAMES } from './lights.ts';

/** The most rim lights that the shaders take (`RIM_PLACE.count` of `models/beam.ts`). */
const MAX_RIM_LIGHTS = 3;

/**
 * The uniforms of the rim lights in the materials of the players, the props, and the stage
 * (design 4.5). The rim lights of `createLights()` are invisible spotlights, so three.js does not
 * render them: the materials add their diffuse light, as a spotlight with the decay 2 gives it.
 * A spotlight of three.js, and the same term for each pixel, cost about 0.3 ms of GPU time in each
 * frame of `perf-60.mid`, so the vertex shader calculates the light.
 */
export interface RimUniforms {
  /** The number of rim lights, at most {@link MAX_RIM_LIGHTS}. */
  readonly uRimCount: { value: number };
  /**
   * The position of each rim light, in world space, three numbers for each light. Each array
   * uniform is a flat array, so three.js uploads it with no copy at each change of material.
   */
  readonly uRimPosition: { value: Float32Array };
  /** The unit axis of the cone of each rim light, from the light to its target. */
  readonly uRimAxis: { value: Float32Array };
  /** The cosine of the outer and of the inner angle of the cone of each rim light. */
  readonly uRimCone: { value: Float32Array };
  /** The linear color times the intensity of each rim light. */
  readonly uRimColor: { value: Float32Array };
}

/**
 * Creates the uniforms of the rim lights, with no light.
 *
 * @returns The uniforms.
 */
export function createRimUniforms(): RimUniforms {
  const list = (...item: readonly number[]): Float32Array =>
    Float32Array.from(
      { length: MAX_RIM_LIGHTS * item.length },
      (_, i) => item[i % item.length] ?? 0,
    );
  return {
    uRimCount: { value: 0 },
    uRimPosition: { value: list(0, 0, 0) },
    uRimAxis: { value: list(0, -1, 0) },
    uRimCone: { value: list(1, 1) },
    uRimColor: { value: list(0, 0, 0) },
  };
}

/** The axis of a rim light. Each call of {@link setRimLights} writes it before it reads it. */
const rimAxis = new Vector3();

/** The cone of a rim light, written before each read. */
const rimCone = new Vector2();

/** The light of a rim light, written before each read. */
const rimColor = new Vector3();

/**
 * Writes the rim lights of a light group into the uniforms: the place, the aim, the cone, and the
 * light of each one. Call it after each change of the aim of the rim lights (`aimRimLights()`).
 *
 * @param uniforms The uniforms of {@link createRimUniforms}.
 * @param lights The group of `createLights()`. Its rim lights stand in world space.
 */
export function setRimLights(uniforms: RimUniforms, lights: Group): void {
  const rims = lights.children
    .filter((child): child is SpotLight => child instanceof SpotLight)
    .filter((light) => light.name === LIGHT_NAMES.rim)
    .slice(0, MAX_RIM_LIGHTS);
  uniforms.uRimCount.value = rims.length;
  for (const [i, rim] of rims.entries()) {
    rim.position.toArray(uniforms.uRimPosition.value, i * 3);
    rimAxis.subVectors(rim.target.position, rim.position).normalize();
    rimAxis.toArray(uniforms.uRimAxis.value, i * 3);
    rimCone.set(Math.cos(rim.angle), Math.cos(rim.angle * (1 - rim.penumbra)));
    rimCone.toArray(uniforms.uRimCone.value, i * 2);
    const { r, g, b } = rim.color;
    rimColor.set(r * rim.intensity, g * rim.intensity, b * rim.intensity);
    rimColor.toArray(uniforms.uRimColor.value, i * 3);
  }
}

/**
 * The surface of a material with the rim lights: the stage takes their light where the props
 * leave the sky open (`stageBake.g` of `scene/stage.ts`), as it takes the other lights with no
 * shadow.
 */
type RimSurface = 'stage' | 'players';

/** The declarations of the uniforms and of the varying of the rim lights. */
const RIM_UNIFORMS = /* glsl */ `
uniform int uRimCount;
uniform vec3 uRimPosition[${MAX_RIM_LIGHTS}];
uniform vec3 uRimAxis[${MAX_RIM_LIGHTS}];
uniform vec2 uRimCone[${MAX_RIM_LIGHTS}];
uniform vec3 uRimColor[${MAX_RIM_LIGHTS}];
varying vec3 vRimLight;
`;

/**
 * The GLSL of the rim lights in the vertex shader, after the skin and the normal of the vertex:
 * the light of each rim light on a face that looks at it, with the smooth step of the cone of
 * three.js r186, the decay 2, and the cosine of the face. The light falls off slowly over a face,
 * so the vertices give it.
 */
const RIM_VERTEX = /* glsl */ `
vec3 rimPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec3 rimNormal = inverseTransformDirection(transformedNormal, viewMatrix);
vRimLight = vec3(0.0);
for (int i = 0; i < ${MAX_RIM_LIGHTS}; i++) {
  if (i >= uRimCount) {
    break;
  }
  vec3 toLamp = uRimPosition[i] - rimPosition;
  float distanceSquared = max(dot(toLamp, toLamp), 1e-4);
  vec3 direction = toLamp * inversesqrt(distanceSquared);
  float cone = smoothstep(uRimCone[i].x, uRimCone[i].y, dot(-direction, uRimAxis[i]));
  float facing = saturate(dot(rimNormal, direction));
  vRimLight += uRimColor[i] * (facing * cone / distanceSquared);
}
`;

/**
 * The GLSL of the rim lights in the fragment shader, after the lights of three.js: the light of
 * the vertices times the pool of the stage lights (`addLightPool()`) and `RIM_SKY`, the factor of
 * the open sky. The lights give diffuse light only.
 */
const RIM_FRAGMENT = /* glsl */ `
reflectedLight.directDiffuse += vRimLight * (lightPool * RIM_SKY) * BRDF_Lambert(material.diffuseContribution);
`;

/**
 * Adds the rim lights to the shader of a standard or physical material, after `addLightPool()`,
 * which gives the pool factor of the pixel. Call it in `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @param uniforms The uniforms of {@link createRimUniforms}.
 * @param surface The surface of the material.
 * @throws Error if the shader has no light chunk of three.js that the patch knows.
 */
export function addRimLight(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: RimUniforms,
  surface: RimSurface,
): void {
  if (
    !shader.fragmentShader.includes('#include <lights_fragment_end>') ||
    !shader.vertexShader.includes('#include <worldpos_vertex>')
  ) {
    throw new Error('The shader has no light chunk of three.js. Update addRimLight().');
  }
  if (!ShaderChunk.lights_physical_fragment.includes('material.diffuseContribution')) {
    throw new Error('The physical material of three.js changed. Update addRimLight().');
  }
  shader.uniforms['uRimCount'] = uniforms.uRimCount;
  shader.uniforms['uRimPosition'] = uniforms.uRimPosition;
  shader.uniforms['uRimAxis'] = uniforms.uRimAxis;
  shader.uniforms['uRimCone'] = uniforms.uRimCone;
  shader.uniforms['uRimColor'] = uniforms.uRimColor;
  const fragment = RIM_FRAGMENT.replace('RIM_SKY', surface === 'stage' ? 'stageBake.g' : '1.0');
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${RIM_UNIFORMS}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${RIM_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${RIM_UNIFORMS}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${fragment}`);
}
