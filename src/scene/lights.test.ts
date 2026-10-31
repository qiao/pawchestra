import {
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  Points,
  SRGBColorSpace,
  ShaderMaterial,
  SpotLight,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  FILL,
  KEY_LIGHT,
  SHADOW_MARGIN,
  SHADOW_TOP,
  SIDE_LIGHT,
  aimKeyLight,
  createLights,
  keyLightPosition,
  keyShadowFrustum,
  setLightsTier,
} from './lights.ts';
import { conductorOn } from '../models/layout-scene.ts';
import { TIER_SETTINGS } from './quality.ts';

/** The cone factor of a three.js spotlight at an angle from its axis (`getSpotAttenuation`). */
function coneFactor(spot: SpotLight, angle: number): number {
  const outer = Math.cos(spot.angle);
  const inner = Math.cos(spot.angle * (1 - spot.penumbra));
  const t = Math.min(1, Math.max(0, (Math.cos(angle) - outer) / (inner - outer)));
  return t * t * (3 - 2 * t);
}

/**
 * Finds the key light of a light group: the only light with a shadow.
 *
 * @param group The group of {@link createLights}.
 * @returns The key light.
 */
function keyOf(group: Group): SpotLight {
  const key = group.children.find((child) => child instanceof SpotLight && child.castShadow);
  if (!(key instanceof SpotLight)) {
    throw new Error('The light group has no key light.');
  }
  return key;
}

describe('createLights', () => {
  const side = 6.6;
  const lights = createLights(side, 'high', null);

  it('makes a pool of light on the orchestra that is darker at the stage edges (design 4.5)', () => {
    // A layout with the podium 1.0 m behind the front edge.
    const conductor = conductorOn([0, 0, side / 2 - 1]);
    const spot = keyOf(createLights(side, 'high', conductor));
    const axis = spot.target.position.clone().sub(spot.position);
    // The light that a point of the stage top gets: the cone, the distance, and the angle of the
    // light on the floor.
    const light = (x: number, z: number): number => {
      const to = new Vector3(x, 0, z).sub(spot.position);
      return (coneFactor(spot, to.angleTo(axis)) * -to.y) / to.length() ** 3;
    };
    const center = light(0, 0);
    const half = side / 2;

    // The middles of the side edges get less, and the corners much less: the dark edges of
    // mockup.png.
    expect(light(-half, 0)).toBeLessThan(0.85 * center);
    expect(light(half, 0)).toBeLessThan(0.85 * center);
    expect(light(-half, half)).toBeLessThan(0.3 * center);
    expect(light(half, half)).toBeLessThan(0.3 * center);
    expect(light(half, -half)).toBeLessThan(0.5 * center);
    expect(light(-half, -half)).toBeLessThan(0.5 * center);
    // The aim is on the line from the stage center to the conductor.
    expect(spot.target.position.z).toBeCloseTo(conductor.position[2] * KEY_LIGHT.aimToPodium, 9);
  });

  it('puts the key light far in front of the stage and to the left, so the shadows fall to the back right', () => {
    const spot = keyOf(lights);
    expect(spot.position.toArray()).toEqual(keyLightPosition(side));
    expect(spot.position.z).toBeGreaterThan(spot.target.position.z + 0.5 * side);
    expect(spot.position.x).toBeLessThan(0);
    expect(spot.position.y).toBeGreaterThan(2 * side);
  });

  it('keeps each point that the key light lights inside its shadow map (design 4.5)', () => {
    const spot = keyOf(createLights(11.19, 'high', conductorOn([0, 0, 4.6])));
    const camera = spot.shadow.camera;
    const axis = spot.target.position.clone().sub(spot.position).normalize();
    const half = 11.19 / 2;

    let lit = 0;
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        for (const y of [0, 2.5]) {
          const x = -half + (i / 10) * 2 * half;
          const z = -half + (j / 10) * 2 * half;
          const to = new Vector3(x, y, z).sub(spot.position);
          if (to.angleTo(axis) >= spot.angle) {
            continue;
          }
          lit++;
          expect(to.angleTo(axis)).toBeLessThan(spot.angle * spot.shadow.focus);
          expect(to.dot(axis)).toBeGreaterThan(camera.near);
          expect(to.dot(axis)).toBeLessThan(camera.far);
        }
      }
    }

    expect(lit).toBeGreaterThan(150);
  });

  it('gives the fill light a dim ground color, so the shadows stay deep (design 4.5)', () => {
    const fill = lights.children.find((child) => child instanceof HemisphereLight);
    expect(fill?.groundColor.getHexString(SRGBColorSpace)).toBe(FILL.ground.slice(1));
    expect(fill?.intensity).toBe(FILL.intensity);
  });

  it('crosses two side lights over the stage (design 4.5)', () => {
    const sides = lights.children.filter(
      (child): child is SpotLight => child instanceof SpotLight && child.name === 'side',
    );
    expect(sides).toHaveLength(2);
    const [right, left] = sides;
    if (!right || !left) {
      throw new Error('The light group has no side lights.');
    }

    // The light at the right lights the section at the left, and the other light is its mirror.
    expect(right.position.x).toBeGreaterThan(side / 2);
    expect(right.position.z).toBeGreaterThan(0);
    expect(right.target.position.x).toBeLessThan(0);
    expect(left.position.toArray()).toEqual([
      -right.position.x,
      right.position.y,
      right.position.z,
    ]);
    for (const light of sides) {
      expect(light.color.getHexString(SRGBColorSpace)).toBe(SIDE_LIGHT.color.slice(1));
      const lux = light.intensity / light.position.distanceToSquared(light.target.position);
      expect(lux).toBeCloseTo(SIDE_LIGHT.illuminance, 9);
    }
  });

  it('puts the visible beam in the light group (scene/beam.ts)', () => {
    const beam = lights.children.find((child) => child instanceof Group);
    const parts = beam?.children.flatMap((haze) => haze.children) ?? [];
    expect(parts.some((child) => child instanceof Mesh)).toBe(true);
  });

  it('leaves out the beam and its motes for the gallery (review of step 8, H3)', () => {
    const gallery = createLights(side, 'high', null, { beam: false });
    const names: string[] = [];
    gallery.traverse((object) => names.push(object.name));
    expect(names).not.toContain('beam');
    expect(names).not.toContain('motes');
    expect(gallery.children.some((child) => child instanceof Group)).toBe(false);
  });
});

describe('aimKeyLight (design 2.4, 4.5)', () => {
  it('turns the key light to a soloed seat, and fits its shadow camera to the new aim', () => {
    const side = 11.19;
    const lights = createLights(side, 'high', conductorOn([0, 0, 4.6]));
    const spot = keyOf(lights);
    const place = spot.position.clone();
    const intensity = spot.intensity;
    const projection = spot.shadow.camera.projectionMatrix.clone();

    aimKeyLight(lights, side, 3.9, 3.2);

    expect(spot.target.position.toArray()).toEqual([3.9, 0, 3.2]);
    // The light turns in its place, with the same intensity.
    expect(spot.position.toArray()).toEqual(place.toArray());
    expect(spot.intensity).toBe(intensity);
    // The shadow camera holds the stage for the new aim, and its projection follows.
    const frustum = keyShadowFrustum(side, place.toArray(), [3.9, 0, 3.2], spot.angle);
    expect(spot.shadow.focus).toBeCloseTo(frustum.halfAngle / spot.angle, 9);
    expect(spot.shadow.camera.near).toBeCloseTo(frustum.near, 9);
    expect(spot.shadow.camera.far).toBeCloseTo(frustum.far, 9);
    expect(spot.shadow.camera.projectionMatrix.equals(projection)).toBe(false);
    const distance = place.distanceTo(new Vector3(3.9, 0, 3.2));
    const texel = (2 * distance * Math.tan(spot.angle * spot.shadow.focus)) / 2048;
    // The blur radius of the high tier, plus two texels.
    expect(spot.shadow.normalBias).toBeCloseTo((TIER_SETTINGS.high.shadowRadius + 2) * texel, 9);
  });
});

describe('keyShadowFrustum (design 4.5)', () => {
  it('holds the stage corners from the stage top up to the highest item', () => {
    const frustum = keyShadowFrustum(10, [0, 12, 0], [0, 0, 0], MathUtils.degToRad(60));
    // The corners at the height of the highest item are 38.2° from the axis, so the map covers
    // them with the margin.
    const corner = Math.atan(Math.hypot(5, 5) / (12 - SHADOW_TOP));
    expect(frustum.halfAngle).toBeCloseTo(corner + SHADOW_MARGIN, 9);
    // The top of the highest item is 9 m from the light, and the stage top is 12 m.
    expect(frustum.near).toBeCloseTo(12 - SHADOW_TOP - 0.5, 9);
    expect(frustum.far).toBeCloseTo(12.5, 9);
  });

  it('covers at most the cone of the light', () => {
    const frustum = keyShadowFrustum(10, [0, 12, 0], [0, 0, 0], MathUtils.degToRad(20));
    expect(frustum.halfAngle).toBeCloseTo(MathUtils.degToRad(20) + SHADOW_MARGIN, 9);
  });
});

describe('the light on the face of the conductor (design 4.5, UX audit FI1)', () => {
  const podium = [0, 0, 3.79] as const;
  const conductor = conductorOn([...podium]);
  const spots = createLights(11.19, 'high', conductor).children.filter(
    (child) => child instanceof SpotLight,
  );
  const face = conductor.position[1] + 1.2;

  it('aims a weak spotlight with no shadow at the face of the bear, from the orchestra side', () => {
    // The key light, the two side lights, the two back-row lights, the rim light, and the light of
    // the conductor.
    expect(spots).toHaveLength(7);
    // The other spotlights have names (`LIGHT_NAMES`).
    const light = spots.find((spot) => !spot.castShadow && spot.name === '');
    if (!light) {
      throw new Error('No light for the conductor.');
    }
    expect(light.target.position.toArray()).toEqual([0, face, 3.79]);
    // The bear faces -z, to the orchestra. The light stands in front of it and above it.
    const dx = light.position.x - light.target.position.x;
    const dy = light.position.y - light.target.position.y;
    const dz = light.position.z - light.target.position.z;
    expect(dz).toBeLessThan(-2);
    expect(Math.abs(dx)).toBeLessThan(1e-9);
    const elevation = Math.atan2(dy, Math.hypot(dx, dz)) * (180 / Math.PI);
    expect(elevation).toBeGreaterThan(25);
    expect(elevation).toBeLessThan(45);
    // The face of the dark brown bear gets 3 lux from the front, so it reads as well as the light
    // fur of the players.
    const lux = light.intensity / (dx * dx + dy * dy + dz * dz);
    expect(lux).toBeCloseTo(3, 9);
  });

  it('has no light for the conductor in a view with no conductor', () => {
    const lights = createLights(11.19, 'high', null);
    expect(lights.children.filter((child) => child instanceof SpotLight)).toHaveLength(6);
  });
});

describe('setLightsTier (design 2.6)', () => {
  it('gives the spotlight the shadow map and the blur of the new tier', () => {
    const lights = createLights(6.6, 'high', null);
    const spot = lights.children.find((child) => child instanceof SpotLight);
    expect(spot?.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(spot?.shadow.radius).toBe(TIER_SETTINGS.high.shadowRadius);
    setLightsTier(lights, 'low');
    expect(spot?.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(spot?.shadow.radius).toBe(1);
    setLightsTier(lights, 'medium');
    expect(spot?.shadow.mapSize.toArray()).toEqual([1024, 1024]);
  });

  it('gives the beam the haze samples and the dust motes of the new tier', () => {
    const changed = createLights(6.6, 'high', null);
    setLightsTier(changed, 'low');
    const beam = changed.children.find((child) => child instanceof Group);
    const parts = beam?.children.flatMap((haze) => haze.children) ?? [];
    const cone = parts.find((child) => child instanceof Mesh);
    const side = cone instanceof Mesh && Array.isArray(cone.material) ? cone.material[0] : null;
    if (!(side instanceof ShaderMaterial)) {
      throw new Error('The beam has no cone.');
    }
    expect(side.defines['SAMPLES']).toBe(TIER_SETTINGS.low.beamSamples);
    expect(parts.find((child) => child instanceof Points)?.visible).toBe(false);
  });
});

describe('the shadow bias (design 2.6, 4.5, UX audit 2026-10-05, SC5)', () => {
  it('moves each receiver past the blur disc of its tier, so a lit face does not shadow itself', () => {
    const lights = createLights(11.19, 'high', null);
    const spot = keyOf(lights);
    // A texel of the map at the aim point, on the high tier.
    const distance = spot.position.distanceTo(spot.target.position);
    const texel = (2 * distance * Math.tan(spot.angle * spot.shadow.focus)) / 2048;

    // The blur radius of the high tier, plus two texels.
    expect(spot.shadow.normalBias).toBeCloseTo((TIER_SETTINGS.high.shadowRadius + 2) * texel, 9);
    expect(spot.shadow.normalBias).toBeGreaterThan(0.04);
    // The medium tier: a texel of 2 times the size and a radius of 1. The low tier: 4 times.
    setLightsTier(lights, 'medium');
    expect(spot.shadow.normalBias).toBeCloseTo(3 * 2 * texel, 9);
    setLightsTier(lights, 'low');
    expect(spot.shadow.normalBias).toBeCloseTo(3 * 4 * texel, 9);
  });
});
