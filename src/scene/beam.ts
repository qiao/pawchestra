import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Data3DTexture,
  DepthTexture,
  FrontSide,
  Group,
  LatheGeometry,
  LinearFilter,
  Mesh,
  Points,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { Camera, Material, Object3D, PerspectiveCamera, Scene } from 'three';

import { rimLightPlace, rimLightXs } from '../models/beam.ts';
import { plankHash } from '../models/stage.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { StagePair } from './light-pool.ts';
import { TIER_SETTINGS } from './quality.ts';
import type { QualityTier } from './quality.ts';

/**
 * The look of the visible beam (design 4.5, light and render). The beam is the cone of
 * `models/beam.ts`. Its shader adds the light that the haze in the cone scatters to the camera:
 * the length of the view ray in the cone, times a density that is highest on the axis and fades to
 * 0 at the outline, with a slow noise and dust motes.
 */
export const BEAM_LOOK = {
  /** The color of the scattered light, in sRGB. */
  color: '#ffcf9e',
  /**
   * The scattered light of a view ray of one stage side through the axis, in linear values. The
   * density scales with 1 / S, so that each stage size shows the same beam. The top of the beam
   * in `orchestra-latest.png` has a luma p90 of 161, and 4.0 gave 136 in the default view. The
   * exposure of 0.7 (`STAGE_TONE`) dims the beam too, and 5.6 keeps the beam the visible source of
   * the pool of light.
   */
  strength: 5.6,
  /** The density at the outline, as a part of the density on the axis. The edge stays soft. */
  edge: 0,
  /**
   * The part of the radius where the density starts to fade to the outline. The beam of
   * `orchestra-latest.png` is brightest near its axis and has soft edges. With 0.5, the wide fan
   * is a flat veil with hard edges.
   */
  core: 0.25,
  /**
   * The radius of the haze at the stage top, in stage sides. The haze fills a cone that narrows
   * from this radius to {@link BEAM_LOOK}.tipRadius at its tip (the haze cone), inside the cone
   * of `models/beam.ts`. The cone is 0.75 S wide at the stage, and a haze in the full cone veiled
   * the full orchestra in the frontal default view, before the haze left out the items on the
   * stage. With the tip of {@link BEAM_LOOK}.tip, 0.38 S opens the fan of `orchestra-latest.png`:
   * the beam spreads out where it meets the back of the stage. With 0.3 S and a tip of 1.0 S, the
   * beam does not spread out, and with 0.5 S its bottom is too wide.
   */
  column: 0.38,
  /**
   * The height of the tip of the haze cone, in stage sides. The tip lies on the line from the foot
   * of the beam to its rim light, so the beam points at the rim light. The rim light stands far
   * away, and a haze cone up to it showed only a long, almost parallel part in the default view.
   * A lower tip shows the narrow top of the cone in the frame, so the beam opens as a fan toward
   * the stage, as in `orchestra-latest.png`.
   */
  tip: 0.55,
  /**
   * The radius of the haze cone at its tip, in stage sides. With the tip of 0.02 S, the top of the
   * beam is too narrow. With 0.08 S, the beam is about 0.18 of the stage width
   * at the top of the default view.
   */
  tipRadius: 0.08,
  /**
   * The density in the haze at the stage. The density grows with the concentration of the light,
   * where the haze cone is narrow: (column / radius)^0.8, at most
   * {@link BEAM_LOOK}.maxConcentration times.
   */
  bottom: 0.35,
  /**
   * The largest growth of the density by the concentration of the light. With 6, a strong beam
   * is white near the light in the high views.
   */
  maxConcentration: 3,
  /**
   * The density at the stage top, as a part of the density at the light. Between the two heights
   * of {@link BEAM_LOOK}.rise, the density grows with a smoothstep to the full density. Thus the
   * beam is brightest at the top and fades toward the stage with no edge, as in `mockup.png`.
   */
  floor: 0.04,
  /**
   * The heights where the density starts to grow and where it is full, as parts of the light
   * height. The concentration of the light still makes the beam brighter above them. The default
   * view sees the beam up to 0.41 of the light height, and `mockup.png` shows a bright shaft at
   * the top of the image that fades out above the players. With a smoothstep from 0 to 1.0, the
   * default view saw at most 0.4 of the density, and the beam did not show (a value of 21 on a
   * hall of 17, against 101 in `mockup.png`). With the full density from 0.5, the haze low in
   * the beam veiled the back of the stage.
   */
  rise: [0.12, 0.45],
  /**
   * The length of the fade of the haze in front of a surface, in stage sides. A sample of the haze
   * at the gap `g` in front of the surface behind it counts `smoothstep(0, soft × S, g)`. Thus the
   * beam fades out softly where it meets the stage.
   */
  soft: 0.15,
  /**
   * The items on the stage: the players, the instruments, the stands, the chairs, and the risers.
   * The haze in front of an item does not show, so the beam veils no player. An item is a surface inside the stage square, with a fade over `margin` meters at
   * each edge, and higher than the stage top: a fade from `low` to `high` meters, and a fade out
   * from `top` to `topFade` meters. The highest head of the demos, with the ears, is 2.54 m.
   */
  items: { low: 0.03, high: 0.2, top: 3, topFade: 4, margin: 0.3 },
  /** The change of the density by the noise, from 0 to 1. */
  noise: 0.4,
  /** The size of one cell of the noise, in meters. */
  noiseScale: 2.4,
  /** The speed of the drift of the noise, in meters each second. */
  drift: 0.18,
  /** The size of a dust mote, in meters. */
  moteSize: 0.03,
  /** The light of a dust mote at the axis, in linear values. */
  moteStrength: 1.0,
} as const;

/**
 * Gives a point in the axes of the beam (design 2.4, 4.5). The beam leans from the tip of the
 * haze ({@link hazeTip}), on the line to its rim light, to its foot on the stage top, which a solo
 * moves to the soloed players. Each height keeps its circle of the cone, and the center of the
 * circle moves on the line from the foot to the tip. In the axes of the beam, the cone stands straight around the y axis, so
 * the formulas of the haze hold there. The shaders of the beam use the same formula.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param point The point, in the stage axes.
 * @param foot The center of the foot of the beam on the stage top, as (x, z), in meters.
 * @param lightX The x of the rim light of the beam, in meters: 0 on the stage axis.
 * @returns The point in the axes of the beam.
 */
export function beamAxes(stageSide: number, point: Vec3, foot: StagePair, lightX = 0): Vec3 {
  const [x, y, z] = point;
  const [tipX, height, tipZ] = hazeTip(stageSide, foot, lightX);
  const t = y / height;
  return [x - foot[0] * (1 - t) - tipX * t, y, z - foot[1] * (1 - t) - tipZ * t];
}

/**
 * Gives the tip of the haze cone (design 4.5): the point at the height {@link BEAM_LOOK}.tip on
 * the line from the foot of the beam to its rim light (`rimLightPlace()`). The rim light
 * stands behind the stage at the x of the beam, so the beam leans only toward the back, and it
 * stands upright in the frontal default view, as the fan of `orchestra-latest.png`.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param foot The center of the foot of the beam on the stage top, as (x, z), in meters.
 * @param lightX The x of the rim light of the beam, in meters: 0 on the stage axis.
 * @returns The tip, in meters.
 */
export function hazeTip(stageSide: number, foot: StagePair, lightX = 0): Vec3 {
  const [, lightY, lightZ] = rimLightPlace(stageSide, lightX);
  const height = BEAM_LOOK.tip * stageSide;
  const t = height / lightY;
  return [foot[0] + (lightX - foot[0]) * t, height, foot[1] + (lightZ - foot[1]) * t];
}

/**
 * Gives the radius of the haze cone at a height (design 4.5): {@link BEAM_LOOK}.column at the
 * stage top, and the radius of the light cone at the light. The shader of the beam uses the same
 * formula.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param y The height above the stage top, in meters.
 * @returns The radius, in meters.
 */
export function hazeRadius(stageSide: number, y: number): number {
  const height = BEAM_LOOK.tip * stageSide;
  const bottom = BEAM_LOOK.column * stageSide;
  return bottom + (BEAM_LOOK.tipRadius * stageSide - bottom) * (y / height);
}

/** The size of the tiling noise texture of the beam, in texels on each side. */
export const NOISE_SIZE = 32;

/**
 * Makes a tiling value noise in a cube of texels: the noise of each texel is a smooth blend of
 * random values on a coarse grid of 8 cells on each side, and the grid wraps at the edges.
 *
 * @param size The texels on each side.
 * @returns The noise, from 0 to 255, x first, then y, then z.
 */
export function tilingNoise(size: number): Uint8Array {
  const cells = 8;
  const lattice = (x: number, y: number, z: number): number =>
    plankHash(
      ((x % cells) + cells) % cells,
      (((y % cells) + cells) % cells) * cells + (((z % cells) + cells) % cells),
    );
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size * size);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = (x / size) * cells;
        const py = (y / size) * cells;
        const pz = (z / size) * cells;
        const [ix, iy, iz] = [Math.floor(px), Math.floor(py), Math.floor(pz)];
        const [fx, fy, fz] = [smooth(px - ix), smooth(py - iy), smooth(pz - iz)];
        let value = 0;
        for (let corner = 0; corner < 8; corner++) {
          const dx = corner & 1;
          const dy = (corner >> 1) & 1;
          const dz = (corner >> 2) & 1;
          const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          value += weight * lattice(ix + dx, iy + dy, iz + dz);
        }
        data[x + size * (y + size * z)] = Math.round(value * 255);
      }
    }
  }
  return data;
}

/**
 * The GLSL of the fades of the haze (design 4.5), for the haze and for the motes:
 *
 * - `heightFade()`: {@link BEAM_LOOK}.floor up to the first height of {@link BEAM_LOOK}.rise, then
 *   a smoothstep to 1 at its second height.
 * - `depthFade()`: 0 at a surface, and a smoothstep to 1 at the gap {@link BEAM_LOOK}.soft × S in
 *   front of it.
 * - `surfaceFade()`: 0 in front of an item on the stage ({@link BEAM_LOOK}.items), and 1 in front
 *   of the stage top, the hall, and the air.
 * - `sceneDistance()`: the distance from the camera to the scene behind a fragment.
 */
const FADES = /* glsl */ `
#include <packing>
uniform float uFloor;
uniform vec2 uRise;
uniform float uSoft;
uniform vec4 uItems;
uniform vec2 uStageEdge;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;

float heightFade(float y) {
  return mix(uFloor, 1.0, smoothstep(uRise.x, uRise.y, y));
}

float depthFade(float gap) {
  return smoothstep(0.0, uSoft, gap);
}

float surfaceFade(vec3 p) {
  float edge = max(abs(p.x), abs(p.z)) - uStageEdge.x;
  float onStage = 1.0 - smoothstep(-uStageEdge.y, uStageEdge.y, edge);
  float item = smoothstep(uItems.x, uItems.y, p.y) * (1.0 - smoothstep(uItems.z, uItems.w, p.y));
  return 1.0 - onStage * item;
}

// The distance from the camera to the scene behind this fragment, along the view ray. viewZ is
// the view depth of the point on the ray at the distance hit.
float sceneDistance(float hit, float viewZ) {
  float depth = texture(uDepth, gl_FragCoord.xy / uResolution).x;
  return hit * perspectiveDepthToViewZ(depth, uNear, uFar) / viewZ;
}
`;

const BEAM_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying float vViewZ;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vViewZ = view.z;
  gl_Position = projectionMatrix * view;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uHeight;
uniform float uTopRadius;
uniform float uInside;
uniform float uCore;
uniform float uColumn;
uniform float uBottom;
uniform float uNoise;
uniform float uNoiseScale;
uniform vec3 uDrift;
uniform sampler3D uNoiseTexture;
uniform vec2 uFoot;
uniform vec2 uApex;
varying vec3 vWorld;
varying float vViewZ;
${FADES}
// A point in the axes of the beam, which leans from the light to its foot (beamAxes() in
// TypeScript).
vec3 beamAxes(vec3 p) {
  vec2 axis = mix(uFoot, uApex, p.y / uHeight);
  return p - vec3(axis.x, 0.0, axis.y);
}

// The radius of the haze cone (hazeRadius() in TypeScript).
float radiusAt(float y) {
  return mix(uColumn, uTopRadius, y / uHeight);
}

// The density of the haze at a point, with the noise. The haze fills a cone of the radius uColumn
// at the stage inside the light cone, so that it does not veil the full orchestra.
float density(vec3 p) {
  float radius = max(radiusAt(p.y), 1e-3);
  float r = length(p.xz) / radius;
  float radial = 1.0 - smoothstep(uCore, 1.0, r);
  float height = clamp(p.y / uHeight, 0.0, 1.0);
  // The light is more concentrated where the cone is narrow, so the haze is brighter there.
  float concentration = min(pow(uColumn / radius, 0.8), ${BEAM_LOOK.maxConcentration.toFixed(1)});
  float vertical = uBottom * concentration * smoothstep(1.0, 0.9, height) * heightFade(p.y);
  vec3 q = p / uNoiseScale + uDrift;
  float n = texture(uNoiseTexture, q).r * 0.65 + texture(uNoiseTexture, q * 2.3 + 0.37).r * 0.35;
  return radial * vertical * (1.0 - uNoise + uNoise * 2.0 * n);
}

void main() {
  // A camera outside the haze cone draws the front faces, and a camera inside the back faces.
  bool front = gl_FrontFacing;
  if (front == (uInside > 0.5)) {
    discard;
  }
  vec3 origin = cameraPosition;
  vec3 toFragment = vWorld - origin;
  float hit = length(toFragment);
  vec3 dir = toFragment / hit;
  float near = front ? hit : 0.0;
  float far = hit;
  // The view ray in the axes of the beam. A distance along it is the distance along the view ray.
  vec3 beamOrigin = beamAxes(origin);
  vec2 lean = (uApex - uFoot) / uHeight;
  vec3 beamDir = dir - vec3(lean.x, 0.0, lean.y) * dir.y;
  if (front) {
    // The haze cone: x² + z² = (b + k y)², with the radius b at the stage and the slope k. The
    // ray leaves it at the first root after the entry and below the light. The equation also
    // holds a mirror cone above the apex. A ray that is steeper than the wall has its other root
    // on the mirror cone, so the stage top ends it.
    float k = (uTopRadius - uColumn) / uHeight;
    float rb = uColumn + k * beamOrigin.y;
    float a = beamDir.x * beamDir.x + beamDir.z * beamDir.z - k * k * beamDir.y * beamDir.y;
    float b = 2.0 * (beamOrigin.x * beamDir.x + beamOrigin.z * beamDir.z - k * beamDir.y * rb);
    float c = beamOrigin.x * beamOrigin.x + beamOrigin.z * beamOrigin.z - rb * rb;
    float s = sqrt(max(b * b - 4.0 * a * c, 0.0));
    far = 1e6;
    if (abs(a) > 1e-6) {
      float r0 = (-b - s) / (2.0 * a);
      float r1 = (-b + s) / (2.0 * a);
      if (r0 > near + 1e-3 && origin.y + dir.y * r0 < uHeight) {
        far = min(far, r0);
      }
      if (r1 > near + 1e-3 && origin.y + dir.y * r1 < uHeight) {
        far = min(far, r1);
      }
    }
  }
  // The stage top and the light close the haze cone. Near the rim, the plane can lie a little
  // before the entry point, and the ray then has no length.
  if (dir.y < -1e-4) {
    far = min(far, max(-origin.y / dir.y, near));
  } else if (dir.y > 1e-4) {
    far = min(far, max((uHeight - origin.y) / dir.y, near));
  }
  // The ray also ends on the scene: a player, a stand, or a riser.
  float scene = sceneDistance(hit, vViewZ);
  far = min(far, scene);
  float span = far - near;
  if (span <= 0.0) {
    discard;
  }
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = near + span * (float(i) + 0.5) / float(SAMPLES);
    sum += density(beamOrigin + beamDir * t) * depthFade(scene - t);
  }
  float light = uStrength * sum * span / float(SAMPLES) * surfaceFade(origin + dir * scene);
  gl_FragColor = vec4(uColor * light, 1.0);
  #include <colorspace_fragment>
}
`;

const MOTE_VERTEX = /* glsl */ `
attribute vec4 seed;
uniform float uHeight;
uniform float uTopRadius;
uniform float uTime;
uniform float uSize;
uniform float uPixels;
uniform float uCore;
uniform float uColumn;
uniform float uFloor;
uniform vec2 uRise;
uniform vec2 uFoot;
uniform vec2 uApex;
varying float vLight;
varying vec3 vWorld;
varying float vViewZ;
void main() {
  // Each mote rises and falls slowly on its own path through the haze cone, and its height wraps.
  float height = fract(seed.z + 0.012 * uTime * (seed.w - 0.5));
  float y = uHeight * 0.9 * height;
  float radius = mix(uColumn, uTopRadius, y / uHeight);
  float angle = seed.x * 6.2832 + 0.05 * uTime * (seed.w - 0.4);
  float r = sqrt(seed.y) * radius * 0.9;
  vec3 p = vec3(r * cos(angle), y, r * sin(angle));
  p += 0.15 * vec3(sin(uTime * 0.31 + seed.w * 40.0), sin(uTime * 0.23 + seed.x * 30.0), cos(uTime * 0.27 + seed.y * 20.0));
  // The beam leans from the light to its foot (beamAxes() in TypeScript).
  p.xz += mix(uFoot, uApex, p.y / uHeight);
  vec4 view = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(uSize * projectionMatrix[1][1] * uPixels * 0.5 / -view.z, 1.0, 6.0);
  float radial = 1.0 - smoothstep(uCore, 1.0, r / max(radius, 1e-3));
  float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + seed.w * 1.6) + seed.x * 50.0);
  // A mote smaller than one pixel spreads its light over the pixel.
  float size = uSize * projectionMatrix[1][1] * uPixels * 0.5 / -view.z;
  // The motes fade toward the stage more than the haze, so that few show low in the beam.
  float fade = mix(uFloor, 1.0, smoothstep(uRise.x, uRise.y, p.y));
  vLight = radial * twinkle * min(1.0, size * size) * fade * fade;
  vWorld = p;
  vViewZ = view.z;
}
`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vLight;
varying vec3 vWorld;
varying float vViewZ;
${FADES}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = 1.0 - smoothstep(0.0, 0.5, d);
  // A mote fades in front of a surface and in front of an item, as the haze does.
  float distance = length(vWorld - cameraPosition);
  float scene = sceneDistance(distance, vViewZ);
  float surface = surfaceFade(cameraPosition + (vWorld - cameraPosition) * (scene / distance));
  float light = uStrength * vLight * alpha * depthFade(scene - distance) * surface;
  gl_FragColor = vec4(uColor * light, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Gives the outline of the haze (design 4.5): the haze cone, from a little below the stage top up
 * to the light, with a flat bottom. The stage top hides the bottom. The mesh of the beam has this
 * outline, so the shader runs only where the haze is. On the full light cone, the beam cost about
 * 1 ms more on the development Mac.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The radius and the height of each point of the outline, from the axis at the bottom up.
 */
export function hazeProfile(stageSide: number): [number, number][] {
  const height = BEAM_LOOK.tip * stageSide;
  return [
    [0, HAZE_BASE],
    [hazeRadius(stageSide, HAZE_BASE), HAZE_BASE],
    [BEAM_LOOK.tipRadius * stageSide, height],
  ];
}

/** The height of the bottom of the beam mesh, in meters: a little below the stage top. */
const HAZE_BASE = -0.05;

/**
 * Tells if a point is inside the haze cone (see {@link hazeProfile}).
 *
 * @param stageSide The stage side `S`, in meters.
 * @param point The point, in the stage axes.
 * @param foot The center of the foot of the beam on the stage top ({@link beamAxes}).
 * @param lightX The x of the rim light of the beam, in meters: 0 on the stage axis.
 * @returns True inside the haze cone, from the stage top up to the light.
 */
export function insideHaze(
  stageSide: number,
  point: Vec3,
  foot: StagePair = [0, 0],
  lightX = 0,
): boolean {
  const [x, y, z] = beamAxes(stageSide, point, foot, lightX);
  if (y < 0 || y >= BEAM_LOOK.tip * stageSide) {
    return false;
  }
  return Math.hypot(x, z) < hazeRadius(stageSide, y);
}

/** The uniforms of the cone, the fades, and the depth that the beam and the motes share. */
function coneUniforms(stageSide: number) {
  const { low, high, top, topFade, margin } = BEAM_LOOK.items;
  return {
    uColor: { value: new Color(BEAM_LOOK.color) },
    uHeight: { value: BEAM_LOOK.tip * stageSide },
    uTopRadius: { value: BEAM_LOOK.tipRadius * stageSide },
    uCore: { value: BEAM_LOOK.core },
    uColumn: { value: BEAM_LOOK.column * stageSide },
    uFloor: { value: BEAM_LOOK.floor },
    uRise: {
      value: new Vector2(...BEAM_LOOK.rise).multiplyScalar(BEAM_LOOK.tip * stageSide),
    },
    uSoft: { value: BEAM_LOOK.soft * stageSide },
    uItems: { value: new Vector4(low, high, top, topFade) },
    uStageEdge: { value: new Vector2(stageSide / 2, margin) },
    uDepth: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uFoot: { value: new Vector2(0, 0) },
    uApex: { value: new Vector2(hazeTip(stageSide, [0, 0])[0], hazeTip(stageSide, [0, 0])[2]) },
  };
}

/**
 * Creates the noise texture of the beam (see {@link tilingNoise}).
 *
 * @returns The texture, with a linear filter and repeat on each axis.
 */
function noiseTexture(): Data3DTexture {
  const texture = new Data3DTexture(tilingNoise(NOISE_SIZE), NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  texture.format = RedFormat;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates the dust motes of the beam: points that drift slowly through the haze cone (design 4.5).
 *
 * @param stageSide The stage side `S`, in meters.
 * @param count The number of motes.
 * @returns The points.
 */
function createMotes(stageSide: number, count: number): Points {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) {
    seeds[i] = plankHash(i, 9173);
  }
  const geometry = new BufferGeometry();
  // The vertex shader places each mote from its seed, so the positions are only a placeholder.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 4));
  const material = new ShaderMaterial({
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    uniforms: {
      ...coneUniforms(stageSide),
      uTime: { value: 0 },
      uSize: { value: BEAM_LOOK.moteSize },
      uPixels: { value: 900 },
      uStrength: { value: BEAM_LOOK.moteStrength },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const motes = new Points(geometry, material);
  motes.frustumCulled = false;
  motes.name = 'motes';
  return motes;
}

/**
 * Creates the visible beams (design 4.5): one haze of {@link createHaze} for each rim light
 * (`rimLightXs()` of `models/beam.ts`), in the order of the lights.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param tier The quality tier. It sets the noise samples and the number of motes
 *   ({@link setBeamTier}).
 * @returns A group with a group of the cone and the motes for each rim light. With no rim light,
 *   the group is empty, and the depth pass of the frame still gives the room haze its depth.
 */
export function createBeam(stageSide: number, tier: QualityTier): Group {
  const group = new Group();
  for (const _ of rimLightXs(stageSide)) {
    group.add(createHaze(stageSide, tier));
  }
  return group;
}

/**
 * Creates the haze of one beam: the cone of `models/beam.ts` with the haze shader, and the dust
 * motes of the tier.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param tier The quality tier.
 * @returns A group with the cone and the motes.
 */
function createHaze(stageSide: number, tier: QualityTier): Group {
  const geometry = new LatheGeometry(
    hazeProfile(stageSide).map(([radius, y]) => new Vector2(radius, y)),
    48,
  );
  const uniforms = {
    ...coneUniforms(stageSide),
    uStrength: { value: BEAM_LOOK.strength / stageSide },
    uInside: { value: 0 },
    uBottom: { value: BEAM_LOOK.bottom },
    uNoise: { value: BEAM_LOOK.noise },
    uNoiseScale: { value: BEAM_LOOK.noiseScale },
    uDrift: { value: new Vector3() },
    uNoiseTexture: { value: noiseTexture() },
  };
  // The cone shows both sides. three.js draws a transparent material with both sides in two
  // draws, the back faces first, and changes the side of the material for each draw, so it looked
  // up the program of the material two times in each frame. One material for each side, with one
  // group each over all faces, gives the same two draws in the same order. The two materials
  // share the uniforms.
  const sides = [BackSide, FrontSide].map(
    (side) =>
      new ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms,
        defines: { SAMPLES: TIER_SETTINGS[tier].beamSamples },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side,
      }),
  );
  const count = geometry.index?.count ?? geometry.getAttribute('position').count;
  for (const i of sides.keys()) {
    geometry.addGroup(0, count, i);
  }
  const cone = new Mesh(geometry, sides);
  cone.name = 'beam';
  cone.renderOrder = 1;
  // The motes of the highest tier. A lower tier draws only a part of them.
  const most = Math.max(...Object.values(TIER_SETTINGS).map((settings) => settings.motes));
  const group = new Group().add(cone, createMotes(stageSide, most));
  setHazeTier(group, tier);
  return group;
}

/**
 * Sets the beams for a new quality tier (design 2.6): the samples of the haze along each view ray
 * and the number of dust motes. A tier with no motes hides them.
 *
 * @param beam The group of {@link createBeam}.
 * @param tier The quality tier.
 */
export function setBeamTier(beam: Group, tier: QualityTier): void {
  for (const haze of beam.children) {
    setHazeTier(haze, tier);
  }
}

/**
 * Sets the haze of one beam for a new quality tier ({@link setBeamTier}).
 *
 * @param haze The group of {@link createHaze}.
 * @param tier The quality tier.
 */
function setHazeTier(haze: Object3D, tier: QualityTier): void {
  const settings = TIER_SETTINGS[tier];
  for (const child of haze.children) {
    if (child instanceof Mesh) {
      for (const material of shaderMaterials(child)) {
        if (material.defines['SAMPLES'] !== settings.beamSamples) {
          material.defines['SAMPLES'] = settings.beamSamples;
          material.needsUpdate = true;
        }
      }
    } else if (child instanceof Points) {
      child.geometry.setDrawRange(0, settings.motes);
      child.visible = settings.motes > 0;
    }
  }
}

/** The draw of a depth pass with a depth material for each mesh (`VariantMaterials`). */
export interface DepthDraw {
  /**
   * Draws with the depth materials in place of the materials of the meshes.
   *
   * @param draw Renders the scene.
   */
  renderDepth(draw: () => void): void;
}

/** The parts of the renderer that the depth pass of the beam uses. A `WebGLRenderer` has them. */
export interface DepthRenderer {
  getRenderTarget(): WebGLRenderTarget | null;
  setRenderTarget(target: WebGLRenderTarget | null): void;
  render(scene: Object3D, camera: Camera): void;
}

/**
 * The depth of the scene with no light effects and no hall, at the size of the drawing buffer
 * (design 4.5). The haze and the motes read it: a view ray ends on the scene, the haze fades in
 * front of a surface, and an item on the stage gets no haze. It renders before the scene, because
 * the scene target cannot give its depth to its own pass. A depth at half size gave a jagged edge
 * of haze around each player.
 */
export class BeamDepth {
  readonly #target: WebGLRenderTarget;
  readonly #texture: DepthTexture;
  #width = 1;
  #height = 1;

  constructor() {
    this.#texture = new DepthTexture(1, 1, UnsignedIntType);
    this.#target = new WebGLRenderTarget(1, 1, { type: UnsignedByteType });
    this.#target.depthTexture = this.#texture;
  }

  /** The depth texture of the last {@link BeamDepth.render}. */
  get texture(): DepthTexture {
    return this.#texture;
  }

  /** The width and the height of the drawing buffer, in pixels. */
  get size(): readonly [number, number] {
    return [this.#width, this.#height];
  }

  /**
   * Sets the size of the drawing buffer.
   *
   * @param width The width of the drawing buffer, in pixels.
   * @param height The height of the drawing buffer, in pixels.
   */
  setSize(width: number, height: number): void {
    if (width === this.#width && height === this.#height) {
      return;
    }
    this.#width = width;
    this.#height = height;
    this.#target.setSize(width, height);
  }

  /**
   * Renders the depth of a scene with some objects hidden: the light effects, which write no
   * depth, and the hall. The haze in front of the hall shows in full, so the hall needs no depth.
   * The pass also renders the shadow map of the frame, and the scene pass keeps it
   * (`StageScene.render()`). No hidden object casts a shadow, so the shadow map does not change.
   *
   * Each bone texture uploads one time in a frame: the stage computes the bone matrices before
   * this pass and keeps them for each render of the frame (`holdSkeletons()` of
   * `scene/player.ts`). A second upload of a texture that the GPU uses split the shadow pass into
   * small passes with a copy before each one, 0.3 ms of GPU time on the development Mac.
   *
   * @param renderer The renderer.
   * @param scene The scene.
   * @param camera The camera.
   * @param hidden The objects to hide.
   * @param depth Draws with a depth material that writes no color in place of the material of
   *   each mesh (`VariantMaterials.renderDepth()`).
   */
  render(
    renderer: DepthRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    hidden: readonly Object3D[],
    depth: DepthDraw,
  ): void {
    const visible = hidden.map((object) => object.visible);
    for (const object of hidden) {
      object.visible = false;
    }
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.#target);
    depth.renderDepth(() => {
      renderer.render(scene, camera);
    });
    renderer.setRenderTarget(target);
    for (const [i, object] of hidden.entries()) {
      object.visible = visible[i] ?? true;
    }
  }

  /** Frees the target and the depth texture. */
  dispose(): void {
    this.#texture.dispose();
    this.#target.dispose();
  }
}

/** The state of the beam in one frame. */
interface BeamFrame {
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** The factor of the camera (design 4.5, 5.6), from 0 to 1. */
  readonly factor: number;
  /** The camera of the frame. */
  readonly camera: PerspectiveCamera;
  /** The wall time, in seconds, for the drift of the noise and of the motes. */
  readonly timeSec: number;
  /** The depth of the scene of the frame. Its size is the size of the drawing buffer. */
  readonly depth: BeamDepth;
  /**
   * The center of the feet of the beams on the stage top ({@link beamAxes}): the foot of a beam of
   * a rim light on the stage axis. Each beam adds the x of its rim light.
   */
  readonly foot: StagePair;
}

/**
 * Sets the beams for the camera of a frame (design 2.4, 4.5, 5.6): the factor of the camera, the
 * foot of each beam, the side of the cone that the camera sees, the depth of the scene, and the
 * drift. Each beam keeps the x of its rim light from the foot of the frame.
 *
 * @param beam The group of {@link createBeam}.
 * @param frame The state of the frame.
 */
export function setBeamFrame(beam: Group, frame: BeamFrame): void {
  const xs = rimLightXs(frame.stageSide);
  for (const [i, haze] of beam.children.entries()) {
    const lightX = xs[i] ?? 0;
    setHazeFrame(haze, frame, [frame.foot[0] + lightX, frame.foot[1]], lightX);
  }
}

/**
 * Sets the haze of one beam for the camera of a frame ({@link setBeamFrame}).
 *
 * @param haze The group of {@link createHaze}.
 * @param frame The state of the frame.
 * @param foot The center of the foot of this beam on the stage top.
 * @param lightX The x of the rim light of this beam, in meters.
 */
function setHazeFrame(haze: Object3D, frame: BeamFrame, foot: StagePair, lightX: number): void {
  const { stageSide, factor, camera, timeSec, depth } = frame;
  const [width, height] = depth.size;
  const inside = insideHaze(stageSide, camera.position.toArray(), foot, lightX);
  for (const child of haze.children) {
    const materials = shaderMaterials(child);
    const first = materials[0];
    if (!first) {
      continue;
    }
    // The two sides of the cone share their uniforms.
    const u = first.uniforms;
    setValue(u, 'uNear', camera.near);
    setValue(u, 'uFar', camera.far);
    const texture = u['uDepth'];
    if (texture) {
      texture.value = depth.texture;
    }
    const resolution = u['uResolution']?.value;
    if (resolution instanceof Vector2) {
      resolution.set(width, height);
    }
    const footUniform = u['uFoot']?.value;
    if (footUniform instanceof Vector2) {
      footUniform.set(foot[0], foot[1]);
    }
    const apex = u['uApex']?.value;
    if (apex instanceof Vector2) {
      const [tipX, , tipZ] = hazeTip(stageSide, foot, lightX);
      apex.set(tipX, tipZ);
    }
    if (child instanceof Mesh) {
      leanCone(child, stageSide, foot, lightX);
      setValue(u, 'uStrength', (BEAM_LOOK.strength / stageSide) * factor);
      setValue(u, 'uInside', inside ? 1 : 0);
      // A camera in the haze cone sees the back faces. The depth of the scene ends each view ray,
      // so a player in front of a back face does not hide the haze before the player.
      for (const material of materials) {
        material.depthTest = !inside;
      }
      const drift = u['uDrift']?.value;
      if (drift instanceof Vector3) {
        const d = (BEAM_LOOK.drift * timeSec) / BEAM_LOOK.noiseScale;
        drift.set(d * 0.3, d, d * 0.2);
      }
    } else {
      setValue(u, 'uStrength', BEAM_LOOK.moteStrength * factor);
      setValue(u, 'uTime', timeSec);
      setValue(u, 'uPixels', height);
    }
  }
}

/**
 * Leans the mesh of the haze cone from its tip to the foot of the beam ({@link beamAxes}):
 * a shear of the straight cone of {@link hazeProfile}, which stands on the stage center. The depth
 * pass of the frame already updated the world matrices, so the cone updates its own.
 *
 * @param cone The mesh of the haze cone.
 * @param stageSide The stage side `S`, in meters.
 * @param foot The center of the foot of the beam on the stage top.
 * @param lightX The x of the rim light of the beam, in meters.
 */
function leanCone(cone: Mesh, stageSide: number, foot: StagePair, lightX: number): void {
  const [fx, fz] = foot;
  const [tipX, height, tipZ] = hazeTip(stageSide, foot, lightX);
  const leanX = (tipX - fx) / height;
  const leanZ = (tipZ - fz) / height;
  cone.matrixAutoUpdate = false;
  cone.matrix.set(1, leanX, 0, fx, 0, 1, 0, 0, 0, leanZ, 1, fz, 0, 0, 0, 1);
  cone.updateMatrixWorld(true);
}

/**
 * Gives the shader materials of a child of the beam: the two sides of the cone, or the material of
 * the motes.
 *
 * @param child The child.
 * @returns The materials, or none for another object.
 */
function shaderMaterials(child: Object3D): ShaderMaterial[] {
  if (!(child instanceof Mesh || child instanceof Points)) {
    return [];
  }
  const own: readonly Material[] = Array.isArray(child.material)
    ? child.material
    : [child.material];
  return own.filter((material) => material instanceof ShaderMaterial);
}

/** Sets a number uniform, if the material has it. */
function setValue(uniforms: ShaderMaterial['uniforms'], name: string, value: number): void {
  const uniform = uniforms[name];
  if (uniform) {
    uniform.value = value;
  }
}
