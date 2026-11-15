import { ShaderChunk, Vector2, Vector4 } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

import type { Vec3 } from '../models/tuples.ts';

/**
 * The pool of the stage lights (design 4.5). Each spotlight gives a place of the stage a part of
 * its light: the pool factor. The pool is bright on the conductor and the middle of the
 * orchestra, and it falls off to the sides, the front corners, and the back of the stage, as in
 * `mockup.png`. On the players and the props, it reaches farther toward the back (`reachBack`),
 * because the back rows of `orchestra-latest.png`, the newest target, are almost as bright as the
 * front rows. The key light also has a hot spot around the podium, which is narrower on the
 * players. The fill light and the reflections do not change. Without the pool, the side lights lit the players at the sides as
 * brightly as the players in the middle.
 */
export const LIGHT_POOL = {
  /** The center of the pool, as a part of the way from the stage center to the podium. */
  centerToPodium: 0.5,
  /**
   * The radius of the pool across the stage (x), in stage sides. With 0.6, the pool covers almost
   * the full width of the stage, and the floor is an even bright amber. With 0.45, the floor at the
   * edges keeps 0.36 of the light of the pool, against 0.34 in `orchestra-latest.png`.
   */
  radiusX: 0.45,
  /** The radius of the pool along the stage (z), in stage sides. */
  radiusZ: 0.36,
  /**
   * The radius of the pool on the players and the props behind its center (toward the back), in
   * stage sides. It is longer than `radiusZ`, so the back rows keep most of the light, as in
   * `orchestra-latest.png`. The stage keeps `radiusZ`, so the floor at the back stays dark.
   */
  reachBack: 1.2,
  /** The part of the light that a place far from the pool keeps. It was 0.4 before the 0.45 pool. */
  floor: 0.28,
  /**
   * The extra light of the key light at the podium center, as a part of its light: a special on
   * the conductor and on the floor around the podium. With 0.85, the key light from the front gives
   * the lit floor beside the podium a luma of 110 and 106 and the back of the conductor 36, against
   * 191, 158, and 52 in `orchestra-latest.png`. A solo
   * has a boost of its own (`SOLO_LIGHT` of `scene/solo-light.ts`).
   */
  spotBoost: 2.5,
  /**
   * The radius of the hot spot of the key light across the stage (x), in stage sides. The pool
   * of `orchestra-latest.png` reaches from the piano to the cellos. The first hot spot had a
   * radius of 2 m on each axis, and lit only the stage near the podium.
   */
  spotRadiusX: 0.4,
  /** The radius of the hot spot of the key light along the stage (z), in stage sides. */
  spotRadiusZ: 0.2,
  /**
   * The radii of the hot spot on the players and the props, as a part of its radii on the stage:
   * a special on the conductor. The key light from the front lights the fronts of the players,
   * and the full hot spot made the white fur of the front rows clip in close shots (15% of its
   * pixels). With no hot spot, the back of the conductor had a luma of 24 against 52 in
   * `orchestra-latest.png`.
   */
  playerSpot: 0.3,
} as const;

/** A place or a size on the stage top, as (x, z), in meters. */
export type StagePair = readonly [x: number, z: number];

/**
 * The aim of the stage lights (design 4.5): the pool, the hot spot and the aim of the key light,
 * and the foot of the visible beam. All values are in meters.
 */
export interface LightAim {
  /** The center of the pool, and the aim point of the key light on the stage top. */
  readonly center: StagePair;
  /** The radii of the pool across (x) and along (z) the stage. */
  readonly radius: StagePair;
  /**
   * The radius of the pool on the players and the props behind its center (toward -z). The stage
   * takes the z radius of `radius` on both sides of the center.
   */
  readonly reachBack: number;
  /** The center of the hot spot of the key light. */
  readonly spot: StagePair;
  /** The radii of the hot spot across (x) and along (z) the stage. */
  readonly spotRadius: StagePair;
  /** The extra light of the key light at the center of the hot spot. 0 gives no hot spot. */
  readonly boost: number;
  /** The part of the light that a place far from the pool keeps. */
  readonly floor: number;
  /** The center of the foot of the visible beam on the stage top. */
  readonly beam: StagePair;
}

/**
 * Gives the aim of the stage lights with no solo ({@link LIGHT_POOL}): the pool between the
 * stage center and the podium, the hot spot on the podium, and the beam above the stage center.
 * With no podium, the pool is around the stage center, with no hot spot.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param podium The podium center, or `null` with no podium.
 * @returns The aim.
 */
export function defaultAim(stageSide: number, podium: Vec3 | null): LightAim {
  const pool = LIGHT_POOL;
  const k = pool.centerToPodium;
  const [x, , z] = podium ?? [0, 0, 0];

  return {
    center: [x * k, z * k],
    radius: [pool.radiusX * stageSide, pool.radiusZ * stageSide],
    reachBack: pool.reachBack * stageSide,
    spot: [x, z],
    spotRadius: [pool.spotRadiusX * stageSide, pool.spotRadiusZ * stageSide],
    boost: podium ? pool.spotBoost : 0,
    floor: pool.floor,
    beam: [0, 0],
  };
}

/** The uniforms of the pool in a shader. Materials that share them share one pool. */
export interface PoolUniforms {
  /** The center (x, z) and the inverse radii (1 / x radius, 1 / z radius), in meters. */
  readonly uLightPool: { value: Vector4 };
  /** The center (x, z) and the inverse radii of the hot spot (1 / x radius, 1 / z radius). */
  readonly uLightPoolSpot: { value: Vector4 };
  /** The part of the light that a place far from the pool keeps, and the boost of the hot spot. */
  readonly uLightPoolLevels: { value: Vector2 };
  /** The inverse radius of the pool on the players and the props behind its center. */
  readonly uLightPoolBack: { value: number };
}

/**
 * Creates the uniforms of a pool with no effect: each place gets the factor 1. The aim of a stage
 * replaces them ({@link setPoolAim}).
 *
 * @returns The uniforms.
 */
export function createPoolUniforms(): PoolUniforms {
  return {
    uLightPool: { value: new Vector4(0, 0, 0, 0) },
    uLightPoolSpot: { value: new Vector4(0, 0, 0, 0) },
    uLightPoolLevels: { value: new Vector2(1, 0) },
    uLightPoolBack: { value: 0 },
  };
}

/**
 * Sets the uniforms of a pool to an aim of the stage lights.
 *
 * @param uniforms The uniforms of {@link createPoolUniforms}.
 * @param aim The aim.
 */
export function setPoolAim(uniforms: PoolUniforms, aim: LightAim): void {
  const [cx, cz] = aim.center;
  const [rx, rz] = aim.radius;
  const [sx, sz] = aim.spot;
  const [srx, srz] = aim.spotRadius;

  uniforms.uLightPool.value.set(cx, cz, 1 / rx, 1 / rz);
  uniforms.uLightPoolSpot.value.set(sx, sz, 1 / srx, 1 / srz);
  uniforms.uLightPoolLevels.value.set(aim.floor, aim.boost);
  uniforms.uLightPoolBack.value = 1 / aim.reachBack;
}

/** The call of three.js r186 that gives the light of one spotlight. */
const SPOT_INFO = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';

/**
 * The surface of a material that takes the pool: the stage, or the players and the props, which
 * take the long reach of the pool toward the back ({@link LightAim}).
 */
type PoolSurface = 'stage' | 'players';

/**
 * The GLSL of the pool factor and the hot spot, before the lights. `vViewPosition` holds the
 * position of the pixel in view space, so the rotation of the view matrix and the camera position
 * give its world position. `REACH_BACK` marks the line of the long reach of the players, and
 * `PLAYER_SPOT` the line of their narrow hot spot.
 */
const POOL_GLSL = /* glsl */ `
vec3 lightPoolWorld = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
vec2 lightPoolStep = lightPoolWorld.xz - uLightPool.xy;
vec2 lightPoolD = lightPoolStep * uLightPool.zw;
REACH_BACK
vec2 lightPoolS = ( lightPoolWorld.xz - uLightPoolSpot.xy ) * uLightPoolSpot.zw;
PLAYER_SPOT
float lightPool = uLightPoolLevels.x + ( 1.0 - uLightPoolLevels.x ) * exp( -dot( lightPoolD, lightPoolD ) );
float lightPoolHot = 1.0 + uLightPoolLevels.y * exp( -dot( lightPoolS, lightPoolS ) );
`;

/**
 * The GLSL after the light of one spotlight. three.js puts the spotlights with a shadow first, so
 * the hot spot goes to the key light, and on the high and medium tiers also to the side lights,
 * which cast shadows there.
 */
const SPOT_POOL_GLSL = /* glsl */ `
		directLight.color *= lightPool;
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		directLight.color *= lightPoolHot;
		#endif
`;

/** The GLSL of the long reach of the pool toward the back, on the players and the props. */
const REACH_BACK_GLSL =
  'lightPoolD.y = lightPoolStep.y < 0.0 ? lightPoolStep.y * uLightPoolBack : lightPoolD.y;';

/**
 * Calculates the pool factor of a place of the stage top, as {@link POOL_GLSL} does in the
 * shader. `pnpm light-probe` calls it, so that the probe cannot drift from the shader.
 *
 * @param aim The aim of the stage lights.
 * @param x The x of the place, in meters.
 * @param z The z of the place, in meters.
 * @param surface The surface: the players and the props take the long reach toward the back.
 * @returns The factor, from the floor value of the aim to 1.
 */
export function poolFactor(aim: LightAim, x: number, z: number, surface: PoolSurface): number {
  const dx = (x - aim.center[0]) / aim.radius[0];
  const step = z - aim.center[1];
  const dz = step / (surface === 'players' && step < 0 ? aim.reachBack : aim.radius[1]);
  return aim.floor + (1 - aim.floor) * Math.exp(-(dx * dx + dz * dz));
}

/**
 * Calculates the factor of the hot spot of a place of the stage top, as {@link POOL_GLSL} does.
 * The shader multiplies each spotlight with a shadow map by it ({@link SPOT_POOL_GLSL}).
 *
 * @param aim The aim of the stage lights.
 * @param x The x of the place, in meters.
 * @param z The z of the place, in meters.
 * @param surface The surface: the players and the props take the narrow hot spot of
 *   {@link LIGHT_POOL}.playerSpot.
 * @returns The factor, from 1 to 1 + the boost of the aim.
 */
export function hotSpotFactor(
  aim: LightAim,
  x: number,
  z: number,
  surface: PoolSurface = 'stage',
): number {
  const scale = surface === 'players' ? LIGHT_POOL.playerSpot : 1;
  const dx = (x - aim.spot[0]) / (aim.spotRadius[0] * scale);
  const dz = (z - aim.spot[1]) / (aim.spotRadius[1] * scale);
  return 1 + aim.boost * Math.exp(-(dx * dx + dz * dz));
}

/**
 * Adds the pool to the shader of a standard material: the shader multiplies the light of each
 * spotlight by the pool factor at the world position of the pixel, and the light of the key light
 * also by the hot spot ({@link LIGHT_POOL}). The pool factor is 1 at the pool center, with a
 * Gaussian fall-off to the floor value. On the players and the props, the fall-off behind the
 * center has the radius `reachBack` of {@link LightAim}, and the hot spot is narrower. The factor
 * of the hot spot is 1 + the boost at its center, with a Gaussian fall-off to 1. Call it in
 * `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @param uniforms The uniforms of the pool.
 * @param surface The surface of the material.
 * @throws Error if the light chunk of three.js has no spotlight call that the patch knows, for
 *   example after an update of three.js.
 */
export function addLightPool(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: PoolUniforms,
  surface: PoolSurface,
): void {
  const chunk = ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(SPOT_INFO)) {
    throw new Error('The light chunk of three.js changed. Update addLightPool().');
  }

  shader.uniforms['uLightPool'] = uniforms.uLightPool;
  shader.uniforms['uLightPoolSpot'] = uniforms.uLightPoolSpot;
  shader.uniforms['uLightPoolLevels'] = uniforms.uLightPoolLevels;
  shader.uniforms['uLightPoolBack'] = uniforms.uLightPoolBack;
  const players = surface === 'players';
  const pool = POOL_GLSL.replace('REACH_BACK', players ? REACH_BACK_GLSL : '').replace(
    'PLAYER_SPOT',
    players ? `lightPoolS /= ${LIGHT_POOL.playerSpot.toFixed(4)};` : '',
  );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec4 uLightPool;\nuniform vec4 uLightPoolSpot;\nuniform vec2 uLightPoolLevels;\nuniform float uLightPoolBack;',
    )
    .replace(
      '#include <lights_fragment_begin>',
      pool + chunk.replace(SPOT_INFO, SPOT_INFO + SPOT_POOL_GLSL),
    );
}
