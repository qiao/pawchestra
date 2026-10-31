import { Group, Mesh, MeshPhysicalMaterial, ShaderChunk, Vector3 } from 'three';
import type { Texture } from 'three';

import { STAGE_COLORS } from '../models/props.ts';
import type { Vec3 } from '../models/tuples.ts';
import { STAGE_CORNER_CUT, STAGE_LIP, buildStage } from '../models/stage.ts';
import { createGeometry } from './geometry.ts';
import { shadowChunkWithSamples } from './shadow-chunk.ts';
import { addLightPool } from './light-pool.ts';
import type { PoolUniforms } from './light-pool.ts';
import { addRimLight } from './rim-light.ts';
import type { RimUniforms } from './rim-light.ts';
import { noBakeTexture } from './stage-bake.ts';

/**
 * The finish of the stage wood (design 4.5, materials): walnut with a soft sheen under a thin
 * lacquer. The diffuse light of the wood gives most of the light of the planks, so the lit floor
 * keeps the warm color of the wood, as in `orchestra-latest.png`. The pool of the stage lights
 * (`addLightPool()`) sets the width of the lit area.
 */
export const STAGE_FINISH = {
  /** The roughness of the wood below the lacquer, before the grain: a broad, soft sheen. */
  roughness: 0.6,
  /** The largest change of the wood color by the grain, as a factor. */
  grain: 0.16,
  /** The largest change of the roughness by the grain. */
  grainRoughness: 0.12,
  /**
   * The factor of the direct gloss of the lights on the wood below the lacquer. A gloss has the
   * color of the light, and the factor 2.0 of a broad gloss made the lit floor pale: a saturation
   * of 0.39 against 0.54 to 0.60 in `orchestra-latest.png` (`pnpm look-lab`). The side lights
   * are a warm white, so their gloss pales the floor more, and 0.5 gave 0.44.
   */
  specular: 0.35,
  /**
   * The largest change of the roughness from one plank to the next. Each plank has its own tone in
   * its vertex colors (`plankColor()` of `models/stage.ts`), but the gloss of the key light was the
   * same on each plank, and it hid the tones. A gloss of its own shows each plank.
   */
  plankRoughness: 0.2,
  /** The largest change of the direct gloss from one plank to the next, as a factor. */
  plankGloss: 0.6,
  /**
   * The part of the gloss that the dark line between two planks keeps. A seam is a groove, so it
   * reflects little light. With the full gloss, the seams did not show in the default view.
   */
  seamGloss: 0.35,
  /**
   * The strength of the lacquer layer above the wood, from 0 to 1. It gives the glare of the key
   * light on the floor in front of the podium. With 0.6, the podium top was almost white in the
   * default view, and 0.3 still paled the lit floor.
   */
  clearcoat: 0.18,
  /** The roughness of the lacquer layer: a soft glare of the key light. */
  clearcoatRoughness: 0.35,
} as const;

/**
 * The baked light of the sides of the stage (design 4.5, scene colors): the light of the lit floor
 * and of the hall on the skirt and on the raised lip of the edge. The key light reaches the skirt
 * only at a flat angle and at the dark edge of its pool. With no baked light and the key light
 * behind the orchestra, the skirt was black (a value of 4 against 33 in `mockup.png`), and the
 * edge had 40 against 74. The light is a part of the base color, and
 * it falls off from the middle of the stage to its corners.
 */
export const SIDE_GLOW = {
  /** The light of the skirt, as a part of its base color. */
  skirt: 0.8,
  /** The light of the lip of the edge, as a part of its base color. */
  edge: 0.25,
  /** The part of the light that the corners lose. */
  fade: 0.6,
} as const;

/**
 * The GLSL of the grain: a value noise, stretched along x, the direction of the planks. It needs
 * the varying `vWoodPosition`.
 */
const GRAIN_GLSL = /* glsl */ `
varying vec3 vWoodPosition;
varying vec3 vWoodNormal;
uniform float uGrain;
uniform float uGrainRoughness;
uniform float uHalfSide;
uniform float uCornerCut;
uniform vec3 uSideGlow;
uniform float uSpecular;
uniform vec3 uSeamColor;
uniform vec3 uPlank;
uniform sampler2D uStageBake;
uniform float uStageBlur;

float woodHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float woodNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = woodHash(i);
  float b = woodHash(i + vec2(1.0, 0.0));
  float c = woodHash(i + vec2(0.0, 1.0));
  float d = woodHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// The value of one octave of the grain, faded to its mean 0.5 when one cell of the noise covers
// less than about 4 pixels. The finer cells shimmered as streaks in a moving camera.
float woodOctave(vec2 q) {
  vec2 w = fwidth(q);
  return mix(woodNoise(q), 0.5, smoothstep(0.12, 0.3, max(w.x, w.y)));
}

// A number from 0 to 1 for each plank. Each plank has its own tone in the vertex colors, and the
// tone is the same at each point of the plank.
float plankNumber(vec3 color) {
  return fract(sin(dot(color, vec3(1271.1, 3117.7, 7451.3))) * 43758.5453);
}

// 1 on the dark line between two planks, which has the color STAGE_COLORS.seam, else 0.
float seamOf(vec3 color) {
  vec3 d = abs(color - uSeamColor);
  return 1.0 - step(1e-4, max(d.r, max(d.g, d.b)));
}

// The bake of the static props at a point of the stage (scene/stage-bake.ts): a bilinear mean of
// the four nearest texels that hold the surface of the point. A texel holds the highest surface
// at its place, so at the edge of the podium, the floor must not read the lit podium top. A point
// with no texel of its surface is under an overhang, such as the floor below the edge of the
// podium top, or on a side. One texel is the texture of a stage with no bake.
vec2 stageBakeAt(vec3 p, vec3 n) {
  ivec2 texels = textureSize(uStageBake, 0);
  if (texels.x == 1) {
    return vec2(1.0);
  }
  vec2 size = vec2(texels);
  vec2 st = (p.xz / (2.0 * uHalfSide) + 0.5) * size - 0.5;
  vec2 base = floor(st);
  vec2 f = st - base;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 at = clamp(base + vec2(float(i), float(j)), vec2(0.0), size - 1.0);
      vec4 texel = texelFetch(uStageBake, ivec2(at), 0);
      float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      w *= step(abs(texel.b - p.y), 0.005);
      sum += vec3(texel.rg * w, w);
    }
  }
  if (sum.z > 1e-4) {
    return sum.xy / sum.z;
  }
  // Under an overhang, the key light does not reach the point, and half the sky does.
  if (abs(n.y) > 0.5) {
    return vec2(0.0, 0.5);
  }
  // A side reads the bake 4 cm in front of it, past the overhang of the podium top.
  return texture2D(uStageBake, (p.xz + normalize(n.xz) * 0.04) / (2.0 * uHalfSide) + 0.5).rg;
}

// The grain from -1 to 1: long streaks along x, with a finer noise on them.
float woodGrain(vec3 p) {
  float streaks = woodOctave(vec2(p.x * 0.7, p.z * 26.0 + p.y * 26.0));
  float fine = woodOctave(vec2(p.x * 3.0, p.z * 90.0 + p.y * 90.0));
  return (streaks * 0.7 + fine * 0.3) * 2.0 - 1.0;
}
`;

/**
 * The GLSL of the baked light of the skirt and the lip ({@link SIDE_GLOW}), after the emissive
 * light of the standard shader. The skirt lies below the stage top at y = 0, and the lip stands
 * within its width of the outline: the four edges and the four corner cuts. The planks and the
 * podium get no baked light. The light fades from the middle of each side to the corners.
 */
const SIDE_GLOW_GLSL = /* glsl */ `
vec2 sideAbs = abs(vWoodPosition.xz);
float sideEdge = min(
  uHalfSide - max(sideAbs.x, sideAbs.y),
  (2.0 * uHalfSide - uCornerCut - sideAbs.x - sideAbs.y) * 0.70710678
);
float onLip = step(0.001, vWoodPosition.y) * step(sideEdge, ${(STAGE_LIP.width + 0.001).toFixed(4)});
float onSide = max(step(vWoodPosition.y, -0.001), onLip);
float sideFade = 1.0 - uSideGlow.z * smoothstep(0.2 * uHalfSide, uHalfSide, abs(vWoodPosition.x));
float sideGlow = vWoodPosition.y < -${STAGE_LIP.drop.toFixed(4)} ? uSideGlow.x : uSideGlow.y;
totalEmissiveRadiance += diffuseColor.rgb * sideGlow * sideFade * onSide;
`;

/**
 * The GLSL after the lights: the sky of the bake on the fill light and the reflections
 * (`scene/stage-bake.ts`), and the gloss of the wood ({@link STAGE_FINISH}): the factor of the
 * direct gloss, the gloss of each plank, and the small gloss of the seams.
 */
const GLOSS_GLSL = /* glsl */ `
reflectedLight.indirectDiffuse *= stageBake.g;
reflectedLight.indirectSpecular *= stageBake.g;
float seamGloss = mix(1.0, uPlank.z, stageSeam);
reflectedLight.directSpecular *= uSpecular * (1.0 + uPlank.y * (stagePlank - 0.5)) * seamGloss;
reflectedLight.indirectSpecular *= seamGloss;
#ifdef USE_CLEARCOAT
clearcoatSpecularDirect *= seamGloss;
clearcoatSpecularIndirect *= seamGloss;
#endif
`;

/**
 * The GLSL of the bake, the grain, and the number of each plank, after the vertex colors. The
 * grain of each plank starts at its own place, so the grain does not run on across a joint.
 */
const PLANK_GLSL = /* glsl */ `
vec2 stageBake = stageBakeAt(vWoodPosition, normalize(vWoodNormal));
float stagePlank = plankNumber(vColor.rgb);
float stageSeam = seamOf(vColor.rgb);
float grain = woodGrain(vWoodPosition + vec3(stagePlank * 41.0, 0.0, stagePlank * 0.37));
diffuseColor.rgb *= 1.0 + uGrain * grain;
`;

/** The shadow of the key light in the light chunk of three.js r186. */
const KEY_SHADOW =
  /(directLight\.color \*= \( directLight\.visible && receiveShadow \) \? )(getShadow\( spotShadowMap\[ i \][^;]*\)) : 1\.0;/;

/**
 * Adds the bake of the static props (`scene/stage-bake.ts`) to the lights of the stage shader,
 * after {@link addLightPool}: the key light takes the smaller of its shadow map (the players) and
 * R (the props), and the other spotlights take G, the open sky of the props. The stage takes no
 * shadow map of the side lights, so the floor keeps the shadows of the key light alone. three.js
 * puts the spotlights with a shadow first, in the order of the scene, so the key light, the first
 * light of `createLights()`, is spotlight 0.
 *
 * @param fragmentShader The fragment shader with the light chunk of the pool.
 * @returns The fragment shader.
 * @throws Error if the light chunk has no shadow of a spotlight that the patch knows, for example
 *   after an update of three.js.
 */
function addBakeToLights(fragmentShader: string): string {
  if (!KEY_SHADOW.test(fragmentShader)) {
    throw new Error('The light chunk of three.js changed. Update addBakeToLights().');
  }
  return fragmentShader
    .replace(KEY_SHADOW, (_, head: string, shadow: string) => {
      const wide = shadow.replace(
        'spotLightShadow.shadowRadius',
        'spotLightShadow.shadowRadius * uStageBlur',
      );
      return `#if ( UNROLLED_LOOP_INDEX == 0 )\n\t\t${head}min( ${wide}, stageBake.r ) : stageBake.r;\n\t\t#endif`;
    })
    .replace(
      'directLight.color *= lightPool;',
      'directLight.color *= lightPool;\n\t\t#if ( UNROLLED_LOOP_INDEX > 0 )\n\t\tdirectLight.color *= stageBake.g;\n\t\t#endif',
    );
}

/** The uniforms of the bake of a stage, which `StageScene` sets after the bake. */
export interface StageBakeUniforms {
  /** The texture of `bakeStageSteps()`, or one white texel with no bake. */
  readonly uStageBake: { value: Texture };
  /**
   * The part of the normal bias of the key shadow that the stage takes: 1 with no bake, 0 with
   * the bake. The bias moves each point 6.5 cm up on the high tier before the shadow test, so
   * that a caster does not shadow itself. The baked stage casts no shadow in the map, and the
   * bias made a bright gap between the feet of the bear and their shadow on the podium.
   */
  readonly uShadowLift: { value: number };
  /** The factor of the blur radius of the key shadow on the stage: 1, or `STAGE_SHADOW.radius`. */
  readonly uStageBlur: { value: number };
}

/**
 * Creates the uniforms of a stage with no bake.
 *
 * @returns New uniforms.
 */
export function noBakeUniforms(): StageBakeUniforms {
  return {
    uStageBake: { value: noBakeTexture() },
    uShadowLift: { value: 1 },
    uStageBlur: { value: 1 },
  };
}

/**
 * The soft edge of the shadows of the players on a baked stage (design 4.5): the blur radius of
 * the tier times `radius`, with `samples` samples. The edge of the bake of the props is about
 * 7 cm to 20 cm wide, and the edge of the tier alone was 7.8 cm on the high tier. The stage casts
 * no shadow in the map, so a wider blur gives it no self-shadow. The shadows of the players in
 * `orchestra-latest.png` are soft, and the radius 2 gives harder edges. The radius 5 of the high
 * tier makes the edge on the floor wider, and the feet keep their contact shadow,
 * because the baked stage takes no normal bias. 12 samples, as on the players, in place of 20:
 * the stage top fills a large part of the screen, so 20 cost about 0.9 ms of GPU time in each
 * frame of `perf-60.mid`, with no visible change of the edge.
 */
export const STAGE_SHADOW = { radius: 3, samples: 12 } as const;

/** The normal bias of the spot shadows in the vertex chunk of three.js r186. */
const SPOT_NORMAL_BIAS =
  'shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;';

/**
 * Gives the vertex chunk of the shadows with a scale of the normal bias of the spot shadows
 * ({@link StageBakeUniforms}).
 *
 * @returns The chunk.
 * @throws Error if the chunk of three.js has no normal bias that the patch knows, for example
 *   after an update of three.js.
 */
function liftedShadowVertex(): string {
  const chunk = ShaderChunk.shadowmap_vertex;
  if (!chunk.includes(SPOT_NORMAL_BIAS)) {
    throw new Error('The shadow chunk of three.js changed. Update liftedShadowVertex().');
  }
  return chunk.replace(SPOT_NORMAL_BIAS, SPOT_NORMAL_BIAS.replace(';', ' * uShadowLift;'));
}

/**
 * Creates the material of the stage: the vertex colors of the planks with flat shading, a
 * wood finish under a thin lacquer, a grain that the fragment shader adds, the baked light of the skirt and the
 * edge, and the pool of the stage lights (design 4.5, materials).
 *
 * @param stageSide The stage side `S`, in meters, for the fade of the baked light.
 * @param pool The uniforms of the pool of the stage lights (design 4.5).
 * @param bake The uniforms of the bake of the static props. With no bake, all light reaches each
 *   point.
 * @param rim The uniforms of the rim lights (design 4.5), or `null` for no rim lights.
 * @returns The material.
 */
export function createStageMaterial(
  stageSide: number,
  pool: PoolUniforms,
  bake: StageBakeUniforms = noBakeUniforms(),
  rim: RimUniforms | null = null,
): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: STAGE_FINISH.roughness,
    metalness: 0,
    clearcoat: STAGE_FINISH.clearcoat,
    clearcoatRoughness: STAGE_FINISH.clearcoatRoughness,
  });
  material.onBeforeCompile = (shader) => {
    addLightPool(shader, pool, 'stage');
    if (rim) {
      addRimLight(shader, rim, 'stage');
    }
    shader.uniforms['uGrain'] = { value: STAGE_FINISH.grain };
    shader.uniforms['uGrainRoughness'] = { value: STAGE_FINISH.grainRoughness };
    shader.uniforms['uHalfSide'] = { value: stageSide / 2 };
    shader.uniforms['uCornerCut'] = { value: STAGE_CORNER_CUT * stageSide };
    shader.uniforms['uSpecular'] = { value: STAGE_FINISH.specular };
    shader.uniforms['uSeamColor'] = { value: new Vector3(...STAGE_COLORS.seam) };
    shader.uniforms['uPlank'] = {
      value: new Vector3(
        STAGE_FINISH.plankRoughness,
        STAGE_FINISH.plankGloss,
        STAGE_FINISH.seamGloss,
      ),
    };
    shader.uniforms['uStageBake'] = bake.uStageBake;
    shader.uniforms['uShadowLift'] = bake.uShadowLift;
    shader.uniforms['uStageBlur'] = bake.uStageBlur;
    shader.uniforms['uSideGlow'] = {
      value: new Vector3(SIDE_GLOW.skirt, SIDE_GLOW.edge, SIDE_GLOW.fade),
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWoodPosition;\nvarying vec3 vWoodNormal;\nuniform float uShadowLift;',
      )
      .replace('#include <shadowmap_vertex>', liftedShadowVertex())
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWoodPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWoodNormal = mat3(modelMatrix) * objectNormal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRAIN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PLANK_GLSL}`)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor - uGrainRoughness * grain + uPlank.x * (stagePlank - 0.5), 0.05, 1.0);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${SIDE_GLOW_GLSL}`,
      )
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLOSS_GLSL}`);
    shader.fragmentShader = addBakeToLights(shader.fragmentShader).replace(
      '#include <shadowmap_pars_fragment>',
      shadowChunkWithSamples(STAGE_SHADOW.samples),
    );
  };
  material.customProgramCacheKey = () => 'stage-wood';
  return material;
}

/**
 * Creates the stage (design 4.5). The floor of the hall around it is part of the hall
 * (scene/hall.ts).
 *
 * @param stageSide The stage side `S`, in meters.
 * @param podium The podium center of the layout, or `null` for a layout with no podium.
 * @param pool The uniforms of the pool of the stage lights (design 4.5).
 * @param bake The uniforms of the bake of the static props.
 * @param rim The uniforms of the rim lights (design 4.5), or `null` for no rim lights.
 * @returns A group with the stage mesh. The mesh has its own material.
 */
export function createStage(
  stageSide: number,
  podium: Vec3 | null,
  pool: PoolUniforms,
  bake: StageBakeUniforms = noBakeUniforms(),
  rim: RimUniforms | null = null,
): Group {
  const stage = new Mesh(
    createGeometry(buildStage(stageSide, podium)),
    createStageMaterial(stageSide, pool, bake, rim),
  );
  stage.castShadow = true;
  stage.receiveShadow = true;
  return new Group().add(stage);
}
