import { Color, ShaderChunk, Vector3 } from 'three';
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

import { FINISH_ORDER } from '../models/mesh.ts';
import type { StudioBody, StudioMesh } from '../models/studio-format.ts';

/**
 * The eye light of the players (design 4.5), as the eye light of a film set: a small lamp beside
 * the camera that only the wet eyeballs of a hand rig see (the finish `eye`). Its reflection on
 * each ball is a soft highlight. The normal and the view give its place, so it moves a little with
 * the view. The roughness gives its size and its soft edge. The key light of the stage comes from
 * the back, so the stage lamps give the eyes no clear highlight from the front or from the app
 * camera. The light follows the camera, so each camera mode gets it.
 */
export const EYE_LIGHT_LOOK = {
  /**
   * The direction from the eye to the lamp, in the axes of the camera: x to the right of the
   * view, y up, z toward the camera. The lamp stands about 43° up and to the left of the view
   * axis. The mirror direction turns by half that angle, and {@link EYE_LIGHT_LOOK.pull} by half
   * again, so the highlight sits a little up and to the left of the open middle of each eye, as on
   * the bead eyes.
   */
  direction: [-0.6, 0.7, 1],
  /** The color of the lamp, in sRGB: a warm white. */
  color: '#fff4e6',
  /** The linear light of the middle of the highlight, before the pool of the stage lights. */
  strength: 2.5,
  /**
   * The roughness of the lobe, with the GGX alpha of three.js (the square of the roughness). The
   * highlight falls to half its light where the normal turns about 0.64 alpha radians from the
   * middle of the highlight.
   */
  roughness: 0.25,
  /**
   * The share by which the middle of the highlight turns from the mirror direction (the half
   * vector of the lamp and the view) to the axis of the eye. The eyes of a rabbit face about 50° to
   * the side, so in a front view the mirror point of a lamp at the camera lies behind the rim of
   * the socket. With the share, the highlight stays in the open part of the eye and moves less
   * than a mirror point when the view turns.
   */
  pull: 0.5,
  /**
   * The angles in degrees between the normal of a pixel and the axis of its eye: the highlight has
   * its full light up to the first angle and no light from the second angle. The socket hides the
   * ball from about 40° to 60° from the axis, so the highlight fades before the rim cuts it.
   */
  fade: [35, 60],
} as const;

/** The index of the finish `eye` in the finish table (`createFinishTexture()`). */
const EYE_FINISH = FINISH_ORDER.indexOf('eye');

/** The uniforms of the eye light of one body. */
interface EyeUniforms {
  /**
   * The unit axis of each eye in the bind of the body: the eye on the +x side, then the eye on
   * the -x side. Each array uniform is a flat array, so three.js uploads it with no copy.
   */
  readonly uEyeAxis: { value: Float32Array };
  /** The middle of the sphere of each eye in the bind of the body, in the same order. */
  readonly uEyeMiddle: { value: Float32Array };
}

/** The eyeballs of a studio body in its bind ({@link eyeBallsOf}). */
interface EyeBalls {
  /** x, y, z of the unit axis of the eye on the +x side, then of the eye on the -x side. */
  readonly axes: Float32Array;
  /** x, y, z of the middle of the sphere of each eye, in meters, in the same order. */
  readonly middles: Float32Array;
}

/**
 * Solves a linear system of 4 equations by Gauss elimination with the largest pivot.
 *
 * @param m The 16 factors, row by row. The call changes them.
 * @param v The 4 right sides. The call changes them.
 * @returns The 4 unknowns.
 * @throws Error if the system has no single solution.
 */
function solve4(m: number[], v: number[]): number[] {
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(m[row * 4 + col] ?? 0) > Math.abs(m[pivot * 4 + col] ?? 0)) {
        pivot = row;
      }
    }
    const top = m[pivot * 4 + col] ?? 0;
    if (Math.abs(top) < 1e-12) {
      throw new Error('The eyeball vertices do not fit one sphere.');
    }
    for (let k = 0; k < 4; k++) {
      [m[col * 4 + k], m[pivot * 4 + k]] = [m[pivot * 4 + k] ?? 0, m[col * 4 + k] ?? 0];
    }
    [v[col], v[pivot]] = [v[pivot] ?? 0, v[col] ?? 0];
    for (let row = 0; row < 4; row++) {
      const factor = row === col ? 0 : (m[row * 4 + col] ?? 0) / top;
      for (let k = 0; k < 4; k++) {
        m[row * 4 + k] = (m[row * 4 + k] ?? 0) - factor * (m[col * 4 + k] ?? 0);
      }
      v[row] = (v[row] ?? 0) - factor * (v[col] ?? 0);
    }
  }
  return v.map((value, i) => value / (m[i * 4 + i] ?? 1));
}

/**
 * Calculates the axis and the middle of each eyeball of a studio body in its bind. The axis is the
 * vector area of the eyeball triangles of each side, which points along the middle of the ball
 * part. The middle is the middle of the sphere that fits the eyeball vertices of the side best
 * (least squares), as the export fits the eye bone (`own_eyes_of()` of
 * `tools/blender/export_rig.py`).
 *
 * @param body The body. Its `eyeballs` name the triangles.
 * @param mesh The unpacked mesh of the body.
 * @returns The axes and the middles.
 * @throws Error if a side has no eyeball triangles, or if its vertices fit no single sphere.
 */
function eyeBallsOf(body: StudioBody, mesh: StudioMesh): EyeBalls {
  const { positions, corners } = mesh;
  const sums = [new Vector3(), new Vector3()];
  const vertices = [new Set<number>(), new Set<number>()];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (const t of body.eyeballs ?? []) {
    const ids = [corners[t * 3] ?? 0, corners[t * 3 + 1] ?? 0, corners[t * 3 + 2] ?? 0] as const;
    a.fromArray(positions, ids[0] * 3);
    b.fromArray(positions, ids[1] * 3);
    c.fromArray(positions, ids[2] * 3);
    const side = a.x + b.x + c.x >= 0 ? 0 : 1;
    b.sub(a);
    c.sub(a);
    sums[side]?.add(b.cross(c));
    for (const id of ids) {
      vertices[side]?.add(id);
    }
  }
  if (vertices.some((list) => list.size === 0)) {
    throw new Error('The body has no eyeball triangles on one side.');
  }

  const axes = new Float32Array(6);
  const middles = new Float32Array(6);
  for (const [i, sum] of sums.entries()) {
    sum.normalize().toArray(axes, i * 3);
    // The sphere |p - m|^2 = r^2 is linear in m and d = r^2 - |m|^2: 2 p.m + d = |p|^2.
    const m = Array.from({ length: 16 }, () => 0);
    const v = [0, 0, 0, 0];
    for (const id of vertices[i] ?? []) {
      const p = [positions[id * 3] ?? 0, positions[id * 3 + 1] ?? 0, positions[id * 3 + 2] ?? 0];
      const row = [2 * (p[0] ?? 0), 2 * (p[1] ?? 0), 2 * (p[2] ?? 0), 1];
      const right = p.reduce((total, x) => total + x * x, 0);
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          m[j * 4 + k] = (m[j * 4 + k] ?? 0) + (row[j] ?? 0) * (row[k] ?? 0);
        }
        v[j] = (v[j] ?? 0) + (row[j] ?? 0) * right;
      }
    }
    middles.set(solve4(m, v).slice(0, 3), i * 3);
  }
  return { axes, middles };
}

/**
 * Gives the GLSL of the eye light in the fragment shader, after the lights of three.js. It reads
 * {@link EYE_LIGHT_LOOK} at each compile, so that the look override of the dev server reaches it.
 * The lobe is the GGX distribution of three.js, scaled to 1 at its middle, so the strength gives
 * the light of the highlight and the roughness gives only its size. The lobe and the fade read the
 * normal of the true sphere of the eye at the pixel, so the highlight stays round on the few faces
 * of a low-poly ball, also at the pole of its faces on the axis.
 *
 * @param pool The name of the pool factor of the pixel (`addLightPool()`), or `1.0` for a shader
 *   with no pool.
 * @returns The GLSL.
 */
function eyeFragment(pool: string): string {
  const { direction, color, strength, roughness, pull, fade } = EYE_LIGHT_LOOK;
  const [x, y, z] = direction.map((value) => value.toFixed(4));
  const { r, g, b } = new Color(color);
  const alpha2 = roughness ** 4;
  const cosine = (deg: number): string => Math.cos((deg * Math.PI) / 180).toFixed(4);
  const count = FINISH_ORDER.length.toFixed(1);
  return /* glsl */ `
if (abs(vRoughnessMapUv.x * ${count} - ${(EYE_FINISH + 0.5).toFixed(1)}) < 0.25) {
  vec3 eyeAxis = normalize(vEyeAxis);
  vec3 eyeNormal = normalize(-vViewPosition - vEyeMiddle);
  vec3 eyeMirror = normalize(normalize(vec3(${x}, ${y}, ${z})) + geometryViewDir);
  vec3 eyeHalf = normalize(mix(eyeMirror, eyeAxis, ${pull.toFixed(4)}));
  float eyeTurn = saturate(dot(eyeNormal, eyeHalf));
  float eyeLobe = ${alpha2.toFixed(6)} / (eyeTurn * eyeTurn * (${alpha2.toFixed(6)} - 1.0) + 1.0);
  float eyeFade = smoothstep(${cosine(fade[1])}, ${cosine(fade[0])}, dot(eyeNormal, eyeAxis));
  float eyeLight = ${strength.toFixed(4)} * eyeLobe * eyeLobe * eyeFade * ${pool};
  reflectedLight.directSpecular += vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}) * eyeLight;
}
`;
}

/**
 * The GLSL of the eye light in the vertex shader, after the skin of the normal: the axis and the
 * middle of the eye of the side of the vertex, in the axes and the space of the camera. Each
 * eyeball vertex follows the head alone, so the skin moves the axis and the middle with the head.
 */
const EYE_VERTEX = /* glsl */ `
vec3 eyeAxisObject = position.x >= 0.0 ? uEyeAxis[0] : uEyeAxis[1];
vec3 eyeMiddleObject = position.x >= 0.0 ? uEyeMiddle[0] : uEyeMiddle[1];
#ifdef USE_SKINNING
  eyeAxisObject = (skinMatrix * vec4(eyeAxisObject, 0.0)).xyz;
  eyeMiddleObject = (skinMatrix * vec4(eyeMiddleObject, 1.0)).xyz;
#endif
vEyeAxis = normalMatrix * eyeAxisObject;
vEyeMiddle = (modelViewMatrix * vec4(eyeMiddleObject, 1.0)).xyz;
`;

/** The varyings of the eye light: the axis and the middle of the eye, in view space. */
const EYE_VARYINGS = 'varying vec3 vEyeAxis;\nvarying vec3 vEyeMiddle;';

/**
 * Adds the eye light to the shader of a standard material, after the patch of the shared material.
 * A shader with the pool of the stage lights (`addLightPool()`) scales the light by the pool
 * factor, so the eyes of a player outside the pool or outside a solo get less light. Call it in
 * `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @param uniforms The uniforms of the body.
 * @throws Error if the shader has no chunk of three.js that the patch knows.
 */
function addEyeLight(shader: WebGLProgramParametersWithUniforms, uniforms: EyeUniforms): void {
  if (
    !shader.fragmentShader.includes('#include <lights_fragment_end>') ||
    !shader.vertexShader.includes('#include <skinnormal_vertex>') ||
    !ShaderChunk.lights_fragment_begin.includes('vec3 geometryViewDir') ||
    !ShaderChunk.lights_fragment_begin.includes('vec3 geometryNormal')
  ) {
    throw new Error('The shader has no light or skin chunk of three.js. Update addEyeLight().');
  }
  shader.uniforms['uEyeAxis'] = uniforms.uEyeAxis;
  shader.uniforms['uEyeMiddle'] = uniforms.uEyeMiddle;
  const pool = shader.fragmentShader.includes('float lightPool ') ? 'lightPool' : '1.0';
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uEyeAxis[2];\nuniform vec3 uEyeMiddle[2];\n' + EYE_VARYINGS,
    )
    .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>\n${EYE_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${EYE_VARYINGS}`)
    .replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\n${eyeFragment(pool)}`,
    );
}

/** The material with the eye light of each base material and body. */
const materials = new WeakMap<MeshStandardMaterial, WeakMap<StudioBody, MeshStandardMaterial>>();

/**
 * Gives the material of a player whose studio body has eyeballs (`StudioBody.eyeballs`, design
 * 4.5): a copy of its material with the eye light, made once for each material and body. The copy
 * keeps the shader patch, the program key, and the draw hook of the material, and adds
 * {@link addEyeLight}.
 *
 * @param base The material of the player: the shared material, or its copy with the color map.
 * @param body The body.
 * @param mesh The unpacked mesh of the body.
 * @returns The material.
 */
export function eyeLightMaterial(
  base: MeshStandardMaterial,
  body: StudioBody,
  mesh: StudioMesh,
): MeshStandardMaterial {
  let byBody = materials.get(base);
  if (!byBody) {
    byBody = new WeakMap();
    materials.set(base, byBody);
  }
  let material = byBody.get(body);
  if (!material) {
    const { axes, middles } = eyeBallsOf(body, mesh);
    const uniforms: EyeUniforms = { uEyeAxis: { value: axes }, uEyeMiddle: { value: middles } };
    const copy = base.clone();
    copy.onBeforeCompile = (shader, renderer) => {
      base.onBeforeCompile(shader, renderer);
      addEyeLight(shader, uniforms);
    };
    copy.customProgramCacheKey = () => `${base.customProgramCacheKey()} eyeLight`;
    // oxlint-disable-next-line typescript/unbound-method -- the hook of a map copy reads no `this`.
    copy.onBeforeRender = base.onBeforeRender;
    byBody.set(body, copy);
    material = copy;
  }
  return material;
}
