import { Color, ShaderChunk, Vector3 } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

import type { ShotLamp, ShotRig } from '../shots/shot-light.ts';

/**
 * The light of a close shot in the scene (design 4.5, 5.6), at the full weight of
 * `CameraPose.light`. The lamps light the players and the props only, cast no shadow, and give
 * diffuse light. The wide shots keep the light of the stage.
 */
export const SHOT_LOOK = {
  /** The color of the soft key, in sRGB: warm white. */
  keyColor: '#ffe2c4',
  /** The illuminance of the soft key at the target, in lux. */
  key: 1.5,
  /** The illuminance of the follow-spot at the target, as a factor of the key. */
  spot: 1.3,
  /** The color of the kicker, in sRGB: the color of the key light and the rim lights. */
  kickerColor: '#ffca98',
  /** The illuminance of the kicker at the target, in lux. */
  kicker: 2.5,
  /** The extra exposure of a close shot, in stops. */
  exposure: 0.15,
  /** The vignette of a close shot. The wide shots keep `POST_LOOK.vignette`. */
  vignette: 0.6,
} as const;

/**
 * The uniforms of the light of a shot in the shared material of the players and the props
 * (`createMaterials()`). Index 0 is the soft key, and index 1 the kicker.
 */
export interface ShotUniforms {
  /** 1 while a lamp has light, else 0, so the shader skips the lamps in a wide shot. */
  readonly uShotOn: { value: number };
  /**
   * The positions of the lamps, in world space, three numbers for each lamp. Each array uniform
   * is a flat array, so three.js uploads it with no copy at each change of material.
   */
  readonly uShotPosition: { value: Float32Array };
  /** The unit axes of the cones, from each lamp to its target. */
  readonly uShotAxis: { value: Float32Array };
  /** The cosine of the half angle of each cone. */
  readonly uShotCone: { value: Float32Array };
  /** The linear color times the intensity of each lamp, as for a spotlight with decay 2. */
  readonly uShotColor: { value: Float32Array };
}

/**
 * Creates the uniforms of the light of a shot, with no light.
 *
 * @returns The uniforms.
 */
export function createShotUniforms(): ShotUniforms {
  return {
    uShotOn: { value: 0 },
    uShotPosition: { value: new Float32Array(6) },
    uShotAxis: { value: Float32Array.of(0, -1, 0, 0, -1, 0) },
    uShotCone: { value: Float32Array.of(1, 1) },
    uShotColor: { value: new Float32Array(6) },
  };
}

/**
 * The linear color of a lamp. Each call of {@link writeLamp} writes it before it reads it, so it
 * holds no state.
 */
const lampColor = new Color();

/** The place of a lamp, written before each read. */
const lampPosition = new Vector3();

/** The axis of a lamp, written before each read. */
const lampAxis = new Vector3();

/** The light of a lamp, written before each read. */
const lampLight = new Vector3();

/**
 * Writes one lamp into the uniforms: its place, its cone, and an illuminance at its target. It
 * reads the color at each call, so that the look override of the dev server
 * (`src/app/look-override.ts`) reaches the colors of {@link SHOT_LOOK}.
 *
 * @param uniforms The uniforms.
 * @param i The lamp: 0 for the key, 1 for the kicker.
 * @param place The place, the aim, and the cone of the lamp.
 * @param illuminance The illuminance at the target, in lux.
 */
function writeLamp(uniforms: ShotUniforms, i: 0 | 1, place: ShotLamp, illuminance: number): void {
  const position = lampPosition.set(...place.position);
  const axis = lampAxis.set(...place.target).sub(position);
  const distanceSquared = axis.lengthSq();
  axis.normalize();
  position.toArray(uniforms.uShotPosition.value, i * 3);
  axis.toArray(uniforms.uShotAxis.value, i * 3);
  uniforms.uShotCone.value[i] = Math.cos(place.angle);
  const { r, g, b } = lampColor.set(i === 0 ? SHOT_LOOK.keyColor : SHOT_LOOK.kickerColor);
  const intensity = illuminance * distanceSquared;
  lampLight
    .set(r * intensity, g * intensity, b * intensity)
    .toArray(uniforms.uShotColor.value, i * 3);
}

/**
 * Sets the light of the shot of a frame (design 4.5, 5.6). The soft key takes the shade share of
 * the rig: the part of the subject that the camera sees in the shade of the stage key light.
 *
 * @param uniforms The uniforms of {@link createShotUniforms}.
 * @param rig The places of the lamps and the shade share, from `shotRig()`.
 * @param light The weight of the light of a close shot, from 0 to 1.
 * @param spot The weight of the follow-spot, from 0 to 1.
 */
export function setShotLight(
  uniforms: ShotUniforms,
  rig: ShotRig,
  light: number,
  spot: number,
): void {
  uniforms.uShotOn.value = light > 0 ? 1 : 0;
  const key = SHOT_LOOK.key * (1 + (SHOT_LOOK.spot - 1) * spot) * rig.shade;
  writeLamp(uniforms, 0, rig.key, key * light);
  writeLamp(uniforms, 1, rig.kicker, SHOT_LOOK.kicker * light);
}

/**
 * The GLSL of the lamps after the lights of three.js: the diffuse light of two spotlights with
 * the full penumbra and the decay 2, and the pool of the stage lights (`addLightPool()`), as a
 * `SpotLight` gave it. The lamps give no gloss.
 */
const SHOT_GLSL = /* glsl */ `
if (uShotOn > 0.5) {
  vec3 shotNormal = inverseTransformDirection(geometryNormal, viewMatrix);
  for (int i = 0; i < 2; i++) {
    vec3 toLamp = uShotPosition[i] - lightPoolWorld;
    float distanceSquared = max(dot(toLamp, toLamp), 1e-4);
    vec3 direction = toLamp * inversesqrt(distanceSquared);
    float cone = smoothstep(uShotCone[i], 1.0, dot(-direction, uShotAxis[i]));
    float facing = saturate(dot(shotNormal, direction));
    vec3 irradiance = uShotColor[i] * (facing * cone * lightPool / distanceSquared);
    reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseContribution);
  }
}
`;

/**
 * Adds the lamps of the light of a shot to the shader of a standard material, after
 * `addLightPool()`, which gives the world position and the pool factor of the pixel. Call it in
 * `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @param uniforms The uniforms of {@link createShotUniforms}.
 * @throws Error if the shader has no light chunk of three.js that the patch knows.
 */
export function addShotLight(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: ShotUniforms,
): void {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) {
    throw new Error('The shader has no light chunk of three.js. Update addShotLight().');
  }
  if (!ShaderChunk.lights_physical_fragment.includes('material.diffuseContribution')) {
    throw new Error('The physical material of three.js changed. Update addShotLight().');
  }
  shader.uniforms['uShotOn'] = uniforms.uShotOn;
  shader.uniforms['uShotPosition'] = uniforms.uShotPosition;
  shader.uniforms['uShotAxis'] = uniforms.uShotAxis;
  shader.uniforms['uShotCone'] = uniforms.uShotCone;
  shader.uniforms['uShotColor'] = uniforms.uShotColor;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform float uShotOn;\nuniform vec3 uShotPosition[2];\nuniform vec3 uShotAxis[2];\nuniform float uShotCone[2];\nuniform vec3 uShotColor[2];',
    )
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${SHOT_GLSL}`);
}
