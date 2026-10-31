import { Group, HemisphereLight, MathUtils, SpotLight, Vector3 } from 'three';

import type { ConductorPlace } from '../models/layout.ts';
import type { Vec3 } from '../models/tuples.ts';
import { keyLightPlace, rimLightPlace, rimLightXs } from '../models/beam.ts';
import { createBeam, setBeamTier } from './beam.ts';
import { TIER_SETTINGS } from './quality.ts';
import type { QualityTier } from './quality.ts';

/**
 * The key light (design 4.5): the stage spotlight, and the only light that casts shadows on the
 * stage. It stands far in front of the stage, high over the audience and to the left
 * (`KEY_PLACE` of `models/beam.ts`), as the front light of a concert hall. It lights the faces,
 * and the shadows fall to the back right, parallel.
 */
export const KEY_LIGHT = {
  /** Warm orange. In `mockup.png`, the white rabbits show a hue of about 20. */
  color: '#ffca98',
  /**
   * The aim, as a part of the way from the stage center to the podium center. The front rows are
   * nearer to the light, so the aim is the stage center: the back row gets about 0.7 of the key
   * light of the first row, against 0.55 with the aim at 0.3 (`pnpm light-probe`).
   */
  aimToPodium: 0,
  /**
   * The half angle of the cone. three.js dims the cone from `angle × (1 - penumbra)` to `angle`.
   * With the full penumbra, the light falls off from the axis on. The light stands about 2.5 S
   * from its aim, and the angle keeps the dark stage edges of `mockup.png`: the middles of the
   * side edges get 0.6 to 0.8 of the light of the stage center, the front corners 0.15 to 0.25,
   * and the back corners 0.2 to 0.4.
   */
  angle: 19 * MathUtils.DEG2RAD,
  /** The full penumbra, for a soft pool of light. */
  penumbra: 1,
  /**
   * The illuminance at the aim point, on a face that looks at the light, in lux. The light from
   * behind gave 9, but a front light also lights the fronts that the camera sees. With 9 at 55°,
   * the white fur of the front left rabbit had a luma of 218 against 150 on the old setup and 163
   * in `orchestra-latest.png`. With 6.5 and a hot spot boost of 2.1 on the podium (`LIGHT_POOL`),
   * the light fur of the rabbit close shot clips a channel on 3.1% of its pixels, against 2.3%
   * with the light from behind: the bright floor also lights the players through the captured
   * environment.
   */
  illuminance: 5.8,
} as const;

/**
 * The side lights (design 4.5): two warm spotlights from the front corners of the hall, high at
 * the sides. Each one crosses the stage and lights the section on the other side, because the
 * players of a section face the conductor in the middle. They are weak cross lights beside the
 * key light from the front, so the section at the left also gets light on its fronts. The light
 * at the left is the mirror of the light at the right. The rim lights ({@link RIM_LIGHT}) draw
 * the rims.
 *
 * The cone is narrow and the light is high, so the section below the light stays outside the
 * cone. A wide, low cone of 28° lights that section from the camera side too, about as bright as
 * the far section, because it is nearer to the light. Then each body gets light from two sides,
 * and its shade side is gone. The back rows stay at the edge of the cone, so the back-row lights
 * ({@link BACK_ROW_LIGHT}) light them.
 *
 * The side lights cast no shadow on any tier (design 2.6), so only the key light casts the
 * shadows of the players.
 */
export const SIDE_LIGHT = {
  /**
   * The color, in sRGB: a warm white, so white and gray fur keep their colors. The orange
   * `#ffd2a0` gave the white fur a saturation of 0.47 against 0.30 in `orchestra-latest.png`, so
   * each species turned orange-brown (`pnpm look-lab`). The key light keeps its orange, because
   * it gives the amber of the floor.
   */
  color: '#ffe6d2',
  /** The position of the light at the right, in stage sides. */
  position: [1.1, 1.4, 0.7],
  /** The aim of the light at the right, in stage sides: the middle of the section at the left. */
  target: [-0.3, 0, 0.1],
  /**
   * The illuminance at the aim point, on a face that looks at the light, in lux. The key light
   * from the front gives most of the light on the fronts now, so 2.7 lux made the white fur too
   * bright. With 0.6, the white fur of the front left rabbit has a luma of 188.
   */
  illuminance: 0.5,
  /** The half angle of the cone. */
  angle: 14 * MathUtils.DEG2RAD,
  /** The penumbra of the cone. */
  penumbra: 0.5,
} as const;

/**
 * The back-row lights (design 4.5): two warm spotlights high at the front corners of the hall, the
 * mirror of each other, as the side lights. Each one crosses the stage and lights the fronts of the
 * back rows of the section on the other side, and the choir risers. The narrow cones of the side
 * lights hold the front sections, so the back rows stay at the edge of the cones or outside them.
 * The lights have the color of the side lights and cast no shadow, so they cost little GPU time.
 */
export const BACK_ROW_LIGHT = {
  /**
   * The position of the light at the right, in stage sides. It is lower than the side lights, so
   * the light falls flatter on the floor behind the back row and more directly on the fronts of
   * the players. From 1.7 S, the floor behind the back row got about 1.8 times as much light.
   */
  position: [1.2, 1.0, 0.6],
  /**
   * The aim of the light at the right, in stage sides: the back edge of the section at the left,
   * at the height of the chests of the back row. The back row of each demo is 0.3 S to 0.45 S
   * behind the stage center, inside the cone.
   */
  target: [-0.35, 0.15, -0.5],
  /**
   * The illuminance at the aim point, on a face that looks at the light, in lux. The key light
   * from the front gives the back row about 0.7 of the light of the first row, so 1.5 lux in
   * place of 2.9 keeps the white fur of the back rows at 0.90 of the p90 of the front rows (0.98
   * in `orchestra-latest.png`).
   */
  illuminance: 1.5,
  /**
   * The half angle of the cone. The cone holds the back rows and the choir, and the front rows stay
   * outside it. A cone of 14° lit the second row from the back more than the first row.
   */
  angle: 10 * MathUtils.DEG2RAD,
  /** The penumbra of the cone. */
  penumbra: 0.5,
} as const;

/**
 * The rim lights (design 4.5): warm spotlights far behind the orchestra and high (`RIM_PLACE` of
 * `models/beam.ts`), as the back lights on a truss of a concert film. They light the heads and
 * the shoulders from behind, so the players stand out of the dark hall, and the haze shows the
 * beam of each one. They cast no shadow, so the key light stays the only light that casts shadows
 * on the stage. They give diffuse light only, in the materials (`scene/rim-light.ts`).
 */
export const RIM_LIGHT = {
  /** The color, in sRGB: the warm orange of the key light. */
  color: '#ffca98',
  /**
   * The illuminance at the aim point, on a face that looks at the light, in lux. The light also
   * gives the floor in the pool a part of its light, as the light from behind did. With 4.5 and
   * 6, the lit floor had a luma of 110 and 113 against 118 with the key light from behind.
   */
  illuminance: 5,
  /** The half angle of the cone. */
  angle: 16 * MathUtils.DEG2RAD,
  /** The full penumbra, for a soft pool of light. */
  penumbra: 1,
} as const;

/**
 * The fill light (design 4.5): low, so that the shadows stay deep. The sky is a neutral gray, so
 * the shade sides of white and gray fur stay gray, as in `orchestra-latest.png`. The ground
 * color is the warm light from the lit stage. The players and the props take the part `players` of
 * the fill light and of the diffuse light of the environment, so their shade sides stay dark.
 * The stage takes all of it, so its shadows keep their tone.
 *
 * The intensity of 3.5 gives the floor outside the pool little fill. The part 0.857 gives the
 * players a fill of 3.0 and a little more of the diffuse light of the environment.
 */
export const FILL = { sky: '#2c2c2e', ground: '#2c241e', intensity: 3.5, players: 0.857 } as const;

/**
 * The normal bias of the shadow, in texels of the shadow map at the stage, beyond the blur radius
 * of the tier (design 2.6, 4.5). The receiver moves along its normal past the blur disc, so a lit
 * face does not shadow itself. With a bias of 0.01 m, close shots show a cross-hatch pattern on
 * the faces.
 */
const SHADOW_BIAS_TEXELS = 2;

/** The highest item on the stage that casts a shadow, in meters above the stage top. */
export const SHADOW_TOP = 3;

/** The extra angle of the shadow map beyond the lit stage, for the blur of the edge. */
export const SHADOW_MARGIN = 3 * MathUtils.DEG2RAD;

/** The view of the shadow camera of a spotlight. */
interface ShadowFrustum {
  /** The near plane, in meters along the axis of the light. */
  readonly near: number;
  /** The far plane, in meters along the axis of the light. */
  readonly far: number;
  /** The half angle that the shadow map covers, in radians. */
  readonly halfAngle: number;
}

/**
 * Calculates the view of the shadow camera of a spotlight, such as the key light (design 4.5).
 * The view holds each
 * point of the stage that the cone lights, from the stage top up to {@link SHADOW_TOP}: the half
 * angle is the angle of the farthest corner of the stage, at most the cone angle, plus
 * {@link SHADOW_MARGIN}. The near and the far planes hold the corners with a margin of 0.5 m.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param position The position of the light.
 * @param target The aim point of the light.
 * @param angle The half angle of the cone of the light.
 * @returns The near plane, the far plane, and the half angle.
 */
export function keyShadowFrustum(
  stageSide: number,
  position: Vec3,
  target: Vec3,
  angle: number,
): ShadowFrustum {
  const from = new Vector3(...position);
  const axis = new Vector3(...target).sub(from).normalize();
  const half = stageSide / 2;

  let near = Infinity;
  let far = 0;
  let widest = 0;
  const point = new Vector3();
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      for (const y of [0, SHADOW_TOP]) {
        point.set(x, y, z).sub(from);
        const depth = point.dot(axis);
        near = Math.min(near, depth);
        far = Math.max(far, depth);
        widest = Math.max(widest, point.angleTo(axis));
      }
    }
  }

  return {
    near: Math.max(0.1, near - 0.5),
    far: far + 0.5,
    halfAngle: Math.min(widest, angle) + SHADOW_MARGIN,
  };
}

/**
 * Calculates the normal bias of the shadow of a spotlight (design 4.5): the size of one texel of
 * the shadow map at the aim point, times the blur radius plus {@link SHADOW_BIAS_TEXELS}.
 *
 * @param distance The distance from the light to its aim point on the stage, in meters.
 * @param halfAngle The half angle that the shadow map covers, in radians.
 * @param mapSize The width of the shadow map, in texels.
 * @param radius The blur radius of the tier, in texels.
 * @returns The normal bias, in meters.
 */
function shadowNormalBias(
  distance: number,
  halfAngle: number,
  mapSize: number,
  radius: number,
): number {
  const texel = (2 * distance * Math.tan(halfAngle)) / mapSize;
  return texel * (radius + SHADOW_BIAS_TEXELS);
}

/**
 * The light on the face of the conductor (design 4.5): a weak spotlight from the orchestra side.
 * With no such light, the face is dark brown on dark gray in the conductor shot. This light casts
 * no shadow.
 */
export const CONDUCTOR_LIGHT = {
  /** The aim point is this high above the podium top: the face of the bear. */
  aimHeight: 1.2,
  /** The light stands this far in front of the aim point, toward the orchestra, in meters. */
  forward: 3.2,
  /** The light stands this far above the aim point, in meters. */
  up: 2.4,
  /**
   * The illuminance at the aim point, in lux. The fur of the bear is dark brown, and with 1.2 lux
   * its face stayed darker than the players.
   */
  illuminance: 3,
  /** The half angle of the cone. It holds the bear and its arms. */
  angle: 16 * MathUtils.DEG2RAD,
  /** The penumbra of the cone. */
  penumbra: 0.6,
} as const;

/**
 * Creates the light on the face of the conductor (design 4.5). The bear faces the orchestra, so
 * the light stands in front of it and above it, and aims at its face.
 *
 * @param conductor The place of the conductor.
 * @returns The light. Its target is a child of the light group with it.
 */
function createConductorLight(conductor: ConductorPlace): SpotLight {
  const c = CONDUCTOR_LIGHT;
  const [x, y, z] = conductor.position;
  const aimY = y + c.aimHeight;
  // The front of the bear is (-sin f, 0, -cos f).
  const frontX = -Math.sin(conductor.facing);
  const frontZ = -Math.cos(conductor.facing);
  const distanceSquared = c.forward * c.forward + c.up * c.up;

  const light = new SpotLight(KEY_LIGHT.color, c.illuminance * distanceSquared);
  light.position.set(x + frontX * c.forward, aimY + c.up, z + frontZ * c.forward);
  light.target.position.set(x, aimY, z);
  light.angle = c.angle;
  light.penumbra = c.penumbra;
  light.decay = 2;
  light.castShadow = false;
  return light;
}

/** The name of the key light in the group of {@link createLights}. */
const KEY_NAME = 'key';

/** The name of each side light in the group of {@link createLights}. */
const SIDE_NAME = 'side';

/** The name of each back-row light in the group of {@link createLights}. */
const BACK_ROW_NAME = 'back-row';

/** The name of each rim light in the group of {@link createLights}. */
const RIM_NAME = 'rim';

/**
 * The names of the spotlights in the group of {@link createLights}, for the probes of the light
 * (`pnpm light-probe`). The names stay module constants, because exported constants grew the
 * first download by 5 B after gzip.
 */
export const LIGHT_NAMES = {
  key: KEY_NAME,
  side: SIDE_NAME,
  backRow: BACK_ROW_NAME,
  rim: RIM_NAME,
} as const;

/**
 * Sets the shadow map size and the shadow blur of a spotlight (design 2.6). The renderer makes a
 * new shadow map of the new size at the next render.
 *
 * @param spot The spotlight.
 * @param mapSize The width and the height of the shadow map, in texels.
 * @param radius The blur radius, in texels.
 */
function setShadowMap(spot: SpotLight, mapSize: number, radius: number): void {
  if (spot.shadow.mapSize.x !== mapSize) {
    spot.shadow.mapSize.set(mapSize, mapSize);
    spot.shadow.map?.dispose();
    spot.shadow.map = null;
  }
  spot.shadow.radius = radius;
  spot.shadow.normalBias = spotNormalBias(spot);
}

/**
 * Sets the shadow of the key light for a quality tier (design 2.6).
 *
 * @param spot The key light.
 * @param tier The quality tier.
 */
function setKeyTier(spot: SpotLight, tier: QualityTier): void {
  const settings = TIER_SETTINGS[tier];
  setShadowMap(spot, settings.shadowMapSize, settings.shadowRadius);
}

/**
 * Sets the shadow of a side light for a quality tier (design 2.6). A tier with no shadow map of
 * the side lights turns their shadow off.
 *
 * @param spot The side light.
 * @param tier The quality tier.
 */
function setSideTier(spot: SpotLight, tier: QualityTier): void {
  const settings = TIER_SETTINGS[tier];
  spot.castShadow = settings.sideShadowMapSize > 0;
  if (spot.castShadow) {
    setShadowMap(spot, settings.sideShadowMapSize, settings.shadowRadius);
  }
}

/**
 * Calculates the normal bias of the shadow of a spotlight for its aim, its shadow map, and its
 * blur ({@link shadowNormalBias}).
 *
 * @param spot The spotlight.
 * @returns The normal bias, in meters.
 */
function spotNormalBias(spot: SpotLight): number {
  return shadowNormalBias(
    spot.position.distanceTo(spot.target.position),
    spot.angle * spot.shadow.focus,
    spot.shadow.mapSize.x,
    spot.shadow.radius,
  );
}

/**
 * Fits the shadow camera of a spotlight to its aim ({@link keyShadowFrustum}): the angle, the near
 * and the far plane, and the normal bias.
 *
 * @param spot The spotlight.
 * @param stageSide The stage side `S`, in meters.
 */
function fitShadow(spot: SpotLight, stageSide: number): void {
  const frustum = keyShadowFrustum(
    stageSide,
    spot.position.toArray(),
    spot.target.position.toArray(),
    spot.angle,
  );
  spot.shadow.focus = frustum.halfAngle / spot.angle;
  spot.shadow.camera.near = frustum.near;
  spot.shadow.camera.far = frustum.far;
  // three.js updates the projection for a new angle or far plane, but not for a new near plane.
  spot.shadow.camera.updateProjectionMatrix();
  spot.shadow.normalBias = spotNormalBias(spot);
}

/**
 * Aims the key light at a point of the stage top (design 2.4, 4.5): the center of the light aim,
 * which a solo moves to the soloed players. The light keeps its place and its intensity, as a
 * spotlight that turns, and its shadow camera follows the aim.
 *
 * @param lights The group of {@link createLights}.
 * @param stageSide The stage side `S`, in meters.
 * @param x The x of the aim point, in meters.
 * @param z The z of the aim point, in meters.
 */
export function aimKeyLight(lights: Group, stageSide: number, x: number, z: number): void {
  for (const child of lights.children) {
    if (child instanceof SpotLight && child.name === KEY_NAME) {
      child.target.position.set(x, 0, z);
      fitShadow(child, stageSide);
    }
  }
}

/**
 * Aims the rim lights at the feet of their beams (design 2.4, 4.5): each light turns to the point
 * of the foot of the frame plus its own x, which a solo moves to the soloed players. The lights
 * keep their places and their intensity, as the beams do.
 *
 * @param lights The group of {@link createLights}.
 * @param stageSide The stage side `S`, in meters.
 * @param x The x of the foot of the beam of a rim light on the stage axis, in meters.
 * @param z The z of the foot, in meters.
 */
export function aimRimLights(lights: Group, stageSide: number, x: number, z: number): void {
  const xs = rimLightXs(stageSide);
  const rims = lights.children.filter(
    (child): child is SpotLight => child instanceof SpotLight && child.name === RIM_NAME,
  );
  for (const [i, rim] of rims.entries()) {
    rim.target.position.set(x + (xs[i] ?? 0), 0, z);
  }
}

/**
 * Sets the lights of the stage for a new quality tier (design 2.6): the shadows of the key light
 * and of the side lights, and the haze samples and the dust motes of the visible beam.
 *
 * @param lights The group of {@link createLights}.
 * @param tier The quality tier.
 */
export function setLightsTier(lights: Group, tier: QualityTier): void {
  for (const child of lights.children) {
    if (child instanceof SpotLight && child.name === KEY_NAME) {
      setKeyTier(child, tier);
    } else if (child instanceof SpotLight && child.name === SIDE_NAME) {
      setSideTier(child, tier);
    } else if (child instanceof Group) {
      setBeamTier(child, tier);
    }
  }
}

/**
 * Creates a spotlight that gives an illuminance at its aim point.
 *
 * @param color The color, in sRGB.
 * @param position The position.
 * @param target The aim point.
 * @param illuminance The illuminance at the aim point, on a face that looks at the light, in lux.
 * @returns The light, with no shadow. Its target is at the aim point.
 */
function spotlight(color: string, position: Vec3, target: Vec3, illuminance: number): SpotLight {
  const light = new SpotLight(color);
  light.position.set(...position);
  light.target.position.set(...target);
  light.intensity = illuminance * light.position.distanceToSquared(light.target.position);
  light.decay = 2;
  light.castShadow = false;
  return light;
}

/**
 * Calculates the direct light of a spotlight on a face, as the light chunk of three.js r186 gives
 * it: the smooth step of the cone from `angle` to `angle × (1 - penumbra)`, the decay 2 of
 * {@link spotlight}, and the cosine of the face. It leaves out the color, the pool, and the
 * shadow. `pnpm light-probe` calls it with the lights of {@link createLights}, so that the probe
 * cannot drift from the scene.
 *
 * @param spot The spotlight.
 * @param point The point of the face, in meters.
 * @param normal The unit normal of the face.
 * @returns The illuminance, in lux.
 */
export function spotIlluminance(spot: SpotLight, point: Vec3, normal: Vec3): number {
  const axis = new Vector3().subVectors(spot.target.position, spot.position);
  const to = new Vector3(...point).sub(spot.position);
  const distanceSquared = to.lengthSq();
  const angleCos = to.clone().normalize().dot(axis.normalize());
  const outer = Math.cos(spot.angle);
  const inner = Math.cos(spot.angle * (1 - spot.penumbra));
  const t = Math.min(1, Math.max(0, (angleCos - outer) / (inner - outer)));
  const cone = t * t * (3 - 2 * t);
  const facing = Math.max(0, -to.normalize().dot(new Vector3(...normal)));
  return (spot.intensity * cone * facing) / distanceSquared;
}

/** The place, the aim, the light, and the cone of a pair of cross lights, in stage sides. */
interface CrossPair {
  /** The position of the light at the right. */
  readonly position: Vec3;
  /** The aim of the light at the right. */
  readonly target: Vec3;
  /** The illuminance at the aim point, on a face that looks at the light, in lux. */
  readonly illuminance: number;
  /** The half angle of the cone. */
  readonly angle: number;
  /** The penumbra of the cone. */
  readonly penumbra: number;
}

/**
 * Creates a pair of cross lights in the color of the side lights: the light at the right, and its
 * mirror at the left.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param pair The place, the aim, the light, and the cone of the light at the right.
 * @param name The name of each light.
 * @returns The light at the right and the light at the left, with no shadow.
 */
function crossPair(stageSide: number, pair: CrossPair, name: string): SpotLight[] {
  const [px, py, pz] = pair.position;
  const [tx, ty, tz] = pair.target;
  return [1, -1].map((sign) => {
    const light = spotlight(
      SIDE_LIGHT.color,
      [sign * px * stageSide, py * stageSide, pz * stageSide],
      [sign * tx * stageSide, ty * stageSide, tz * stageSide],
      pair.illuminance,
    );
    light.name = name;
    light.angle = pair.angle;
    light.penumbra = pair.penumbra;
    return light;
  });
}

/**
 * Gives the position of the key light of a stage (`KEY_PLACE` of `models/beam.ts`).
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The position, in meters.
 */
export function keyLightPosition(stageSide: number): Vec3 {
  return keyLightPlace(stageSide);
}

/**
 * Creates the key light of a stage (design 4.5), with its shadow camera.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param tier The quality tier.
 * @param conductor The place of the conductor, or `null` with no conductor. With no conductor,
 *   the light aims at the stage center.
 * @returns The light. Its target is at the aim point.
 */
function createKeyLight(
  stageSide: number,
  tier: QualityTier,
  conductor: ConductorPlace | null,
): SpotLight {
  const key = KEY_LIGHT;
  const position = keyLightPosition(stageSide);
  const target: Vec3 = conductor
    ? [conductor.position[0] * key.aimToPodium, 0, conductor.position[2] * key.aimToPodium]
    : [0, 0, 0];

  const spot = spotlight(key.color, position, target, key.illuminance);
  spot.name = KEY_NAME;
  spot.angle = key.angle;
  spot.penumbra = key.penumbra;
  spot.castShadow = true;

  spot.shadow.bias = -0.0005;
  setKeyTier(spot, tier);
  fitShadow(spot, stageSide);
  return spot;
}

/** The options of {@link createLights}. */
interface LightOptions {
  /**
   * True to add the visible beam (the default). The gallery pages show the models, so they have
   * no beam.
   */
  readonly beam?: boolean;
  /**
   * True to add the back-row lights (the default). The gallery pages show the models in one row,
   * so they have no back-row lights.
   */
  readonly backRows?: boolean;
}

/**
 * Creates the lights of the stage: the key light, the fill light, the two side lights, the two
 * back-row lights, the rim lights, the visible beams, and the light on the face of the conductor
 * (design 4.5). The lights scale with the stage.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param tier The quality tier. It sets the shadow map sizes and the shadow blur.
 * @param conductor The place of the conductor, or `null` for a view with no conductor, such as
 *   the gallery.
 * @param options The options.
 * @returns A group with the lights, the targets of the spotlights, and the beam group of
 *   {@link createBeam}.
 */
export function createLights(
  stageSide: number,
  tier: QualityTier,
  conductor: ConductorPlace | null,
  options: LightOptions = {},
): Group {
  const group = new Group();

  const key = createKeyLight(stageSide, tier, conductor);
  group.add(key, key.target);

  group.add(new HemisphereLight(FILL.sky, FILL.ground, FILL.intensity));

  for (const light of crossPair(stageSide, SIDE_LIGHT, SIDE_NAME)) {
    light.shadow.bias = -0.0005;
    setSideTier(light, tier);
    fitShadow(light, stageSide);
    group.add(light, light.target);
  }
  if (options.backRows ?? true) {
    for (const light of crossPair(stageSide, BACK_ROW_LIGHT, BACK_ROW_NAME)) {
      group.add(light, light.target);
    }
  }
  for (const x of rimLightXs(stageSide)) {
    const rim = RIM_LIGHT;
    const light = spotlight(rim.color, rimLightPlace(stageSide, x), [x, 0, 0], rim.illuminance);
    light.name = RIM_NAME;
    light.angle = rim.angle;
    light.penumbra = rim.penumbra;
    // three.js does not render an invisible light. The materials add its diffuse light
    // (`scene/rim-light.ts`), because a spotlight of three.js cost 0.3 ms of GPU time.
    light.visible = false;
    group.add(light, light.target);
  }

  if (options.beam ?? true) {
    group.add(createBeam(stageSide, tier));
  }
  if (conductor) {
    const light = createConductorLight(conductor);
    group.add(light, light.target);
  }
  return group;
}
