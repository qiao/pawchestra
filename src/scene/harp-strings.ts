import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, Vector3 } from 'three';
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three';

import type { HarpStrings } from '../models/instruments/hold.ts';

/** The look of the swing of the harp strings (design 4.5, 4.6). */
export const STRING_SWING = {
  /**
   * The factor of the swing of each string over the swing of a real pluck (`StringLine.swing`).
   * The harp of the deer is small, and a swing of a few millimeters shows only in a close shot,
   * so the band is wider than the real swing. The band of a loud bass pluck then spans about two
   * gaps of the strings, and it overlaps mostly the bands of the next strings.
   */
  strength: 1.5,
  /**
   * The factor of the coverage of each pixel of a band. 1 is the share of the time in which the
   * wire covers the pixel, as a camera with a long shutter sees it. A thin pale string on the
   * pale harp then almost disappears, so the band is denser than the real blur.
   */
  density: 1.5,
  /**
   * The largest opacity of a pixel of a band. The bass strings stand closer than the width of
   * their bands, so the bands of plucked neighbors overlap. Below 1, each band stays a
   * translucent swing of its string, and a group of plucked strings does not fill one solid area.
   */
  opacity: 0.4,
};

/**
 * The number of segments of the band of each string along the string. One segment border lies
 * at the pluck point, where the triangle of the pluck has its apex.
 */
const BAND_SEGMENTS = 8;

/** The height of the target of the scene pass, in pixels, which the bands read. */
const bandViewHeight = { value: 900 };

/** The factor of the coverage of the bands ({@link STRING_SWING.density}), set in each frame. */
const bandDensity = { value: 1 };

/** The largest opacity of the bands ({@link STRING_SWING.opacity}), set in each frame. */
const bandOpacity = { value: 1 };

/**
 * Sets the height of the target of the scene pass (design 4.6), so that each band is at least
 * one pixel wide.
 *
 * @param pixels The height of the drawing buffer, in pixels.
 */
export function setBandViewHeight(pixels: number): void {
  bandViewHeight.value = Math.max(pixels, 1);
}

/**
 * The GLSL of the band in the vertex shader, in place of the chunk `beginnormal_vertex`: the band
 * faces the camera, and its half width is the radius of the wire plus the part of the swing that
 * the camera sees across the string. The swing follows the triangle of the pluck, which rounds
 * off to the arc of the first mode. The vertex normal points to the camera.
 */
const BAND_VERTEX = /* glsl */ `
vec3 bandAlong = aBandWire.xyz;
float bandRadius = aBandWire.w;
float bandT = aBandPlace.y;
float bandPluck = aBandPlace.z;
float bandTriangle = bandT < bandPluck ? bandT / bandPluck : (1.0 - bandT) / (1.0 - bandPluck);
float bandForm = mix(bandTriangle, sin(PI * bandT), aBandSwing.y);
vec3 bandCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
vec3 bandSide = cross(bandAlong, bandCamera - position);
float bandSideLength = length(bandSide);
bandSide = bandSideLength > 1e-7 ? bandSide / bandSideLength : aBandAxis.xyz;
vec3 bandFront = cross(bandSide, bandAlong);
vec3 bandShort = cross(bandAlong, aBandAxis.xyz);
float bandSwing = aBandSwing.x * bandForm *
  length(vec2(dot(bandSide, aBandAxis.xyz), aBandAxis.w * dot(bandSide, bandShort)));
vec4 bandView = modelViewMatrix * vec4(position, 1.0);
float bandPixel = max(-bandView.z, 1e-4) * 2.0 / (projectionMatrix[1][1] * uBandViewHeight);
float bandHalf = max(bandRadius + bandSwing, 0.5 * bandPixel) + 0.75 * bandPixel;
bandHalf = aBandSwing.x > 0.0 ? bandHalf : 0.0;
vec3 bandPoint = position + bandSide * (bandHalf * aBandPlace.x);
vBandLateral = bandHalf * aBandPlace.x;
vBandHalfPixel = 0.5 * bandPixel;
vBandRadius = bandRadius;
vBandSwing = bandSwing;
vBandSide = mat3(modelViewMatrix) * bandSide;
vBandFront = mat3(modelViewMatrix) * bandFront;
vec3 objectNormal = bandFront;
`;

/** The declarations of the band in the vertex shader. */
const BAND_VERTEX_HEAD = /* glsl */ `
attribute vec4 aBandWire;
attribute vec3 aBandPlace;
attribute vec4 aBandAxis;
attribute vec2 aBandSwing;
uniform float uBandViewHeight;
varying float vBandLateral;
varying float vBandHalfPixel;
varying float vBandRadius;
varying float vBandSwing;
varying vec3 vBandSide;
varying vec3 vBandFront;
`;

/**
 * The declarations of the band in the fragment shader, and the integral of the time share of the
 * swing: a wire center on a sine swing of the amplitude `a` passes the lateral place `y` in the
 * share `1 / (pi sqrt(a^2 - y^2))` of the time.
 */
const BAND_FRAGMENT_HEAD = /* glsl */ `
uniform float uBandDensity;
uniform float uBandOpacity;
varying float vBandLateral;
varying float vBandHalfPixel;
varying float vBandRadius;
varying float vBandSwing;
varying vec3 vBandSide;
varying vec3 vBandFront;
float bandIntegral(float y, float a) {
  return abs(y) >= a ? 0.5 * PI * abs(y) : y * asin(y / a) + sqrt(a * a - y * y);
}
`;

/**
 * The GLSL of the coverage of the band, after the chunk `color_fragment`: the share of the time
 * in which the swinging wire covers the pixel, as a mean over the width of the pixel. Thus the
 * band is brightest at its edges, where the wire turns, and it holds the light of the wire at
 * each width.
 */
const BAND_COVERAGE = /* glsl */ `
{
  float h = max(vBandHalfPixel, 1e-7);
  float a = max(vBandSwing, 1e-4 * vBandRadius);
  float r = vBandRadius;
  float y = vBandLateral;
  float c = ((bandIntegral(y + h + r, a) - bandIntegral(y - h + r, a))
    - (bandIntegral(y + h - r, a) - bandIntegral(y - h - r, a))) / (2.0 * PI * h);
  c = clamp(c, 0.0, 1.0);
  if (c < 0.003) {
    discard;
  }
  diffuseColor.a *= min(c * uBandDensity, uBandOpacity);
}
`;

/**
 * The GLSL of the normal of the band, after the chunk `normal_fragment_maps`: the normal of a
 * round wire across the band, so that the light runs along the string. A wide swing spreads the
 * normals toward the face of the band.
 */
const BAND_NORMAL = /* glsl */ `
{
  float width = vBandRadius + vBandSwing;
  float resolved = smoothstep(0.75, 2.5, width / max(vBandHalfPixel, 1e-7));
  float across = clamp(vBandLateral / width, -1.0, 1.0) * mix(1.0, 0.3, vBandSwing / width) * resolved;
  normal = normalize(normalize(vBandSide) * across + normalize(vBandFront) * sqrt(max(0.0, 1.0 - across * across)));
}
`;

/**
 * Adds the band of a swinging string to the shader of a standard material (design 4.6). Call it
 * in `onBeforeCompile`, after the patch of the shared material.
 *
 * @param shader The shader of the material.
 * @throws Error if the shader has no chunk of three.js that the patch knows.
 */
function addBand(shader: WebGLProgramParametersWithUniforms): void {
  const vertexChunks = [
    '#include <common>',
    '#include <beginnormal_vertex>',
    '#include <begin_vertex>',
  ];
  const fragmentChunks = [
    '#include <common>',
    '#include <color_fragment>',
    '#include <normal_fragment_maps>',
  ];
  if (
    !vertexChunks.every((chunk) => shader.vertexShader.includes(chunk)) ||
    !fragmentChunks.every((chunk) => shader.fragmentShader.includes(chunk))
  ) {
    throw new Error('The shader has no chunk of three.js that the band knows. Update addBand().');
  }
  shader.uniforms['uBandViewHeight'] = bandViewHeight;
  shader.uniforms['uBandDensity'] = bandDensity;
  shader.uniforms['uBandOpacity'] = bandOpacity;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${BAND_VERTEX_HEAD}`)
    .replace('#include <beginnormal_vertex>', BAND_VERTEX)
    .replace('#include <begin_vertex>', 'vec3 transformed = bandPoint;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${BAND_FRAGMENT_HEAD}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${BAND_COVERAGE}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BAND_NORMAL}`);
}

/** The band material of each shared material. */
const bandMaterials = new WeakMap<MeshStandardMaterial, MeshStandardMaterial>();

/**
 * Gives the material of the bands for a shared material: a copy with its values and its patch,
 * plus the band, with alpha blend and no depth write. Thus the depth passes and the shadow map
 * skip the bands, as they skip the light effects.
 *
 * @param shared The shared material of the players.
 * @returns The material, one for each shared material.
 */
function bandMaterial(shared: MeshStandardMaterial): MeshStandardMaterial {
  let material = bandMaterials.get(shared);
  if (!material) {
    const band = shared.clone();
    band.transparent = true;
    band.depthWrite = false;
    band.onBeforeCompile = (shader, renderer) => {
      shared.onBeforeCompile(shader, renderer);
      addBand(shader);
    };
    // The program key of the shared material, plus the band patch: with the default key, the
    // source of this arrow, the bands of two shared materials would share one program.
    band.customProgramCacheKey = () => `${shared.customProgramCacheKey()} band`;
    material = band;
    bandMaterials.set(shared, band);
  }
  return material;
}

/** The bands of the strings of one harp player, which {@link updateStringBands} moves. */
export interface StringBands {
  readonly strings: HarpStrings;
  /** The mesh of the bands, a child of the player mesh. It follows the bone of the strings. */
  readonly mesh: Mesh;
  /** The swing and the round share of each vertex. */
  readonly swing: BufferAttribute;
  /** The swing of each string in {@link StringBands.swing}, in meters, and its round share. */
  readonly shown: Float32Array;
}

/** The number of vertices of the band of one string. */
const BAND_VERTICES = 2 * (BAND_SEGMENTS + 1);

/**
 * Gives the places of the vertex rows of a band along its string, as shares of the length from
 * the bottom: an equal split below the pluck point and above it.
 *
 * @param pluck The share of the length at the pluck point.
 * @returns The share of each row, from 0 to 1.
 */
function bandRows(pluck: number): number[] {
  const below = BAND_SEGMENTS / 2;
  return Array.from({ length: BAND_SEGMENTS + 1 }, (_, k) =>
    k <= below ? (pluck * k) / below : pluck + ((1 - pluck) * (k - below)) / below,
  );
}

/**
 * Creates the bands of the strings of one harp player (design 4.6): for each string, a strip of
 * {@link BAND_SEGMENTS} segments along its line, which the vertex shader widens toward the camera.
 * Each band takes the color and the finish of the first corner of its string in the geometry of
 * the player, so that it has the color of the string with its baked light.
 *
 * @param strings The strings of the player model.
 * @param geometry The geometry of the player model, with the colors and the finish coordinates.
 * @param shared The shared material of the players.
 * @returns The bands. They draw nothing until a string swings.
 * @throws Error if the geometry has no colors or no finish coordinates.
 */
export function createStringBands(
  strings: HarpStrings,
  geometry: BufferGeometry,
  shared: MeshStandardMaterial,
): StringBands {
  const colors = geometry.getAttribute('color');
  const uvs = geometry.getAttribute('uv');
  if (!colors || !uvs) {
    throw new Error('The geometry of a harp player has no colors or no finish coordinates.');
  }

  const count = strings.lines.length * BAND_VERTICES;
  const position = new Float32Array(count * 3);
  const wire = new Float32Array(count * 4);
  const place = new Float32Array(count * 3);
  const axis = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const index: number[] = [];
  const along = new Vector3();
  const [ax, ay, az] = strings.swing;
  for (const [i, line] of strings.lines.entries()) {
    const corner = strings.corners[i] ?? 0;
    const bottom = new Vector3(...line.bottom);
    along.set(...line.top).sub(bottom);
    const length = along.length();
    along.divideScalar(length);
    for (const [k, t] of bandRows(line.pluck).entries()) {
      for (const side of [-1, 1]) {
        const v = i * BAND_VERTICES + 2 * k + (side > 0 ? 1 : 0);
        position.set(
          [
            ...bottom
              .clone()
              .addScaledVector(along, t * length)
              .toArray(),
          ],
          v * 3,
        );
        wire.set([along.x, along.y, along.z, line.radius], v * 4);
        place.set([side, t, line.pluck], v * 3);
        axis.set([ax, ay, az, strings.cross], v * 4);
        color.set([colors.getX(corner), colors.getY(corner), colors.getZ(corner)], v * 3);
        uv.set([uvs.getX(corner), uvs.getY(corner)], v * 2);
      }
      if (k > 0) {
        const a = i * BAND_VERTICES + 2 * (k - 1);
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }

  const bands = new BufferGeometry();
  bands.setAttribute('position', new BufferAttribute(position, 3));
  bands.setAttribute('aBandWire', new BufferAttribute(wire, 4));
  bands.setAttribute('aBandPlace', new BufferAttribute(place, 3));
  bands.setAttribute('aBandAxis', new BufferAttribute(axis, 4));
  bands.setAttribute('color', new BufferAttribute(color, 3));
  bands.setAttribute('uv', new BufferAttribute(uv, 2));
  const swing = new BufferAttribute(new Float32Array(count * 2), 2);
  swing.setUsage(DynamicDrawUsage);
  bands.setAttribute('aBandSwing', swing);
  bands.setIndex(index);

  const mesh = new Mesh(bands, bandMaterial(shared));
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  bands.setDrawRange(0, 0);
  return { strings, mesh, swing, shown: new Float32Array(strings.lines.length * 2) };
}

/**
 * Moves the bands of a harp player to the swings of a pose (design 4.6): the swing of each string
 * in meters, its round share, and the move of the bone of the strings. Only the strings whose
 * swing changed go to the GPU. With no swinging string, the draw range is empty, so a still harp
 * draws no band. The visibility of the mesh stays on, because the depth pass of the post effects
 * hides the light effects and the bands, and then shows them again.
 *
 * @param bands The bands of the player.
 * @param swings The swings of the pose (`AnimalPose.strings`). With none, all strings are still.
 * @param matrices The bone moves of the pose, 16 numbers for each bone.
 * @param offset The first number of the move of the bone of the strings in `matrices`.
 * @returns The swing of each string in meters, from {@link StringBands.shown}.
 */
export function updateStringBands(
  bands: StringBands,
  swings: Float32Array | null | undefined,
  matrices: Float32Array,
  offset: number,
): Float32Array {
  const { strings, mesh, swing, shown } = bands;
  bandDensity.value = STRING_SWING.density;
  bandOpacity.value = STRING_SWING.opacity;
  const out = swing.array;
  if (!(out instanceof Float32Array)) {
    return shown;
  }
  let from = Infinity;
  let to = -Infinity;
  let swinging = false;
  for (const [i, line] of strings.lines.entries()) {
    const size = (swings?.[2 * i] ?? 0) * line.swing * STRING_SWING.strength;
    const round = swings?.[2 * i + 1] ?? 1;
    swinging ||= size > 0;
    if (size === shown[2 * i] && round === shown[2 * i + 1]) {
      continue;
    }
    shown[2 * i] = size;
    shown[2 * i + 1] = round;
    for (let v = i * BAND_VERTICES; v < (i + 1) * BAND_VERTICES; v++) {
      out[2 * v] = size;
      out[2 * v + 1] = round;
    }
    from = Math.min(from, i * BAND_VERTICES);
    to = Math.max(to, (i + 1) * BAND_VERTICES);
  }
  mesh.geometry.setDrawRange(0, swinging ? Infinity : 0);
  if (swinging) {
    mesh.matrix.fromArray(matrices, offset);
    mesh.matrixWorldNeedsUpdate = true;
  }
  if (from < to) {
    // A range that the renderer did not upload, for example of a hidden mesh, joins the new range.
    const pending = swing.updateRanges[0];
    if (pending) {
      from = Math.min(from, pending.start / 2);
      to = Math.max(to, (pending.start + pending.count) / 2);
      swing.clearUpdateRanges();
    }
    swing.addUpdateRange(from * 2, (to - from) * 2);
    swing.needsUpdate = true;
  }
  return shown;
}
