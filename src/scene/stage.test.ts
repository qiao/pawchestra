import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial } from 'three';

import { createPoolUniforms } from './light-pool.ts';
import { STAGE_FINISH, createStage, createStageMaterial } from './stage.ts';

describe('createStage', () => {
  it('makes one stage mesh that casts and takes the shadows of the spotlight', () => {
    const meshes = createStage(8, [0, 0, 3], createPoolUniforms()).children;
    expect(meshes).toHaveLength(1);
    const [stage] = meshes;
    expect(stage).toBeInstanceOf(Mesh);
    expect(stage?.castShadow).toBe(true);
    expect(stage?.receiveShadow).toBe(true);
  });
});

describe('createStageMaterial (design 4.5, materials)', () => {
  it('gives the wood a polished finish, glossier than the matte group of the players', () => {
    const material = createStageMaterial(8, createPoolUniforms());
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect(material.roughness).toBe(STAGE_FINISH.roughness);
    expect(material.roughness).toBeLessThan(0.85);
    expect(material.metalness).toBe(0);
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(true);
  });

  it('adds the grain, the baked light of the sides, and the pool to the standard shader', () => {
    const material = createStageMaterial(8, createPoolUniforms());
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader:
        '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>',
    };
    // SAFETY: onBeforeCompile reads and writes only these three fields of the shader.
    material.onBeforeCompile(
      shader as Parameters<typeof material.onBeforeCompile>[0],
      undefined as never,
    );
    expect(shader.vertexShader).toContain('vWoodPosition = (modelMatrix');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= 1.0 + uGrain * grain;');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp(');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * sideGlow');
    expect(shader.fragmentShader).toContain('directLight.color *= lightPool;');
    expect(Object.keys(shader.uniforms)).toEqual([
      'uLightPool',
      'uLightPoolSpot',
      'uLightPoolLevels',
      'uGrain',
      'uGrainRoughness',
      'uHalfSide',
      'uCornerCut',
      'uSpecular',
      'uSeamColor',
      'uPlank',
      'uStageBake',
      'uShadowLift',
      'uStageBlur',
      'uSideGlow',
    ]);
    expect(shader.fragmentShader).toContain('reflectedLight.directSpecular *= uSpecular *');
    expect(shader.fragmentShader).toContain('float stagePlank = plankNumber(vColor.rgb);');
    expect(shader.uniforms).toMatchObject({
      uHalfSide: { value: 4 },
      uCornerCut: { value: 0.8 },
    });
    // The lip gets the baked light within its width of the edges and of the corner cuts.
    expect(shader.fragmentShader).toContain('uCornerCut - sideAbs.x - sideAbs.y');
  });
});
