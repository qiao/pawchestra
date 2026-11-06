import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

import { FINISHES, FINISH_ORDER } from '../models/mesh.ts';
import type { MeshData } from '../models/mesh.ts';
import { shadeMesh } from '../models/shading.ts';
import { addLightPool } from './light-pool.ts';
import { FILL } from './lights.ts';
import type { PoolUniforms } from './light-pool.ts';
import { addShotLight } from './shot-light.ts';
import { addRimLight } from './rim-light.ts';
import type { RimUniforms } from './rim-light.ts';
import type { ShotUniforms } from './shot-light.ts';

/**
 * Makes the finish table of design 4.5: one texel for each finish, with the roughness in the
 * green channel and the metalness in the blue channel, as three.js reads them from a roughness map
 * and a metalness map. The red channel holds a quarter of the factor of the reflection
 * ({@link addFinishReflection}).
 *
 * @returns The texture, one texel high.
 */
function createFinishTexture(): DataTexture {
  const texels = new Uint8Array(FINISH_ORDER.length * 4);
  for (const [i, finish] of FINISH_ORDER.entries()) {
    texels[i * 4] = Math.round(Math.min(FINISHES[finish].reflection / 4, 1) * 255);
    texels[i * 4 + 1] = Math.round(FINISHES[finish].roughness * 255);
    texels[i * 4 + 2] = Math.round(FINISHES[finish].metalness * 255);
    texels[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(texels, FINISH_ORDER.length, 1, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Scales the fill light and the diffuse light of the environment of a material by `FILL.players`
 * (design 4.5). Call it in `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @throws Error if the shader has no light chunk of three.js that the patch knows.
 */
function addPlayerFill(shader: WebGLProgramParametersWithUniforms): void {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) {
    throw new Error('The shader has no light chunk of three.js. Update addPlayerFill().');
  }
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= ${FILL.players.toFixed(3)};`,
  );
}

/**
 * Scales the reflection of the environment of a material by the factor of the finish of each
 * pixel: the red channel of the finish table (design 4.5, materials). Call it in
 * `onBeforeCompile`.
 *
 * @param shader The shader of the material.
 * @throws Error if the shader has no light chunk of three.js that the patch knows.
 */
function addFinishReflection(shader: WebGLProgramParametersWithUniforms): void {
  if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) {
    throw new Error('The shader has no light chunk of three.js. Update addFinishReflection().');
  }
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= texture2D(roughnessMap, vRoughnessMapUv).r * 4.0;',
  );
}

/**
 * Creates the material of design 4.5. It uses the crease normals and the vertex colors of
 * {@link createGeometry}. The `uv` of each vertex points at the texel of its finish, so one
 * material and one draw call give each triangle its own roughness and metalness.
 *
 * @param pool The uniforms of the pool of the stage lights (design 4.5), or `null` for a page with
 *   no pool, such as the gallery.
 * @param shot The uniforms of the light of a close shot (design 4.5, 5.6), or `null` for a page
 *   with no shots. It needs the pool.
 * @param rim The uniforms of the rim lights (design 4.5), or `null` for a page with no rim
 *   lights. It needs the pool.
 * @returns The material, in an array for the one geometry group of {@link createGeometry}.
 */
export function createMaterials(
  pool: PoolUniforms | null = null,
  shot: ShotUniforms | null = null,
  rim: RimUniforms | null = null,
): [MeshStandardMaterial] {
  const finishes = createFinishTexture();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    roughnessMap: finishes,
    metalnessMap: finishes,
  });
  if (pool) {
    material.onBeforeCompile = (shader) => {
      addLightPool(shader, pool, 'players');
      addPlayerFill(shader);
      addFinishReflection(shader);
      if (shot) {
        addShotLight(shader, shot);
      }
      if (rim) {
        addRimLight(shader, rim, 'players');
      }
    };
  }
  return [material];
}

/**
 * Creates a geometry from mesh data, with one group for the material of
 * {@link createMaterials}. The `uv` of each vertex points at the middle of the texel of the
 * finish of its triangle.
 *
 * @param data The mesh data of `models/`.
 * @param parents The parent of each bone of a player, for the baked occlusion of design 4.5, or
 *   `null` for a static mesh with no occlusion.
 * @returns The geometry, with positions, colors, finish coordinates, and the crease normals of
 *   design 4.5. The colors hold the occlusion.
 */
export function createGeometry(
  data: MeshData,
  parents: readonly number[] | null = null,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  const { normals, light } = shadeMesh(data, parents);
  const colors = light
    ? data.colors.map((value, i) => value * (light[Math.floor(i / 3)] ?? 1))
    : data.colors;
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const vertexCount = data.positions.length / 3;
  const uv = new Float32Array(vertexCount * 2);
  for (let v = 0; v < vertexCount; v++) {
    uv[v * 2] = ((data.finishes[Math.floor(v / 3)] ?? 0) + 0.5) / FINISH_ORDER.length;
    uv[v * 2 + 1] = 0.5;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.addGroup(0, vertexCount, 0);
  return geometry;
}
