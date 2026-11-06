import { Color, MathUtils, SpotLight, Vector2, Vector3, Vector4 } from 'three';
import type { Object3D, PerspectiveCamera } from 'three';

import type { UvRect } from './letterbox.ts';

/**
 * The lens flare of the stage lights (design 4.5, post effects): the stray light of a spotlight
 * that shines into the lens, as in a concert film. Each spotlight of the stage that faces the
 * camera gives a soft veil that lifts the blacks near it, a small warm glow at the light, and faint
 * ghosts of the aperture on the line from the light through the middle of the image. A light a
 * little outside the frame still gives a flare, as with a real lens and no hood. The final pass
 * draws it in linear light, before the tone mapping. The lamps of a close shot
 * (`scene/shot-light.ts`) give no flare: they stand just outside the frame of most close shots,
 * so their flare would show in most of the film, and a film crew flags such a lamp.
 */
export const LENS_FLARE = {
  /**
   * The factor of all parts of the flare. 0 turns the flare off. The values below give the middle
   * of a lineup of three strengths, in which the flare shows plainly in the default view and in
   * the close shots with the hall lamps.
   */
  strength: 1,
  /**
   * The facing of a light falls from the axis of its cone to 0 at this factor of the half angle
   * of the cone. The front lens of a stage spotlight also glows outside its beam, so the factor
   * is above 1. The default view stands about 38° off the axis of the rim light, and this factor
   * gives it about one half of the facing.
   */
  spill: 3.5,
  /**
   * The angle outside the edge of the frame at which the flare falls to 0, in radians. The stage
   * lights hang high, and the views see them only above the frame: the default view sees the rim
   * light about 41° above the top edge.
   */
  reach: 70 * MathUtils.DEG2RAD,
  /** The linear light of the veil at the light, for each lux of the light at the lens. */
  veil: 0.04,
  /** The distance from the light at which the veil falls to one half, in frame heights. */
  veilSize: 0.6,
  /** The linear light of the glow at the light, for each lux of the light at the lens. */
  glow: 0.14,
  /** The radius of the glow at the light, in frame heights. */
  glowSize: 0.06,
  /**
   * The ghosts of the aperture: the place on the line from the middle of the image (0) to the
   * light (1), the radius in frame heights, and the linear light for each lux at the lens. A
   * negative place is on the other side of the middle, as the reflections between the lens
   * elements put it. The places are near the middle, so the ghosts of a light far above the frame
   * fall into the frame.
   */
  ghosts: [
    [-0.15, 0.12, 0.12],
    [-0.45, 0.2, 0.06],
    [0.25, 0.07, 0.15],
  ],
  /** The color of each ghost, in sRGB: the coatings of the lens give each one its own tint. */
  ghostColors: ['#a9c6ff', '#ffc58a', '#bff0c6'],
  /**
   * The radius of the depth test around the light, in frame heights. A player or a set piece
   * in front of the light hides the part of the samples that it covers.
   */
  occluder: 0.015,
  /**
   * The light of the bloom chain above which a bright part of the image, such as a lamp of the
   * hall, gives a lamp flare, in linear values. The bloom chain also holds a small part of all
   * light (`POST_LOOK.diffusion`), and the threshold keeps the lit fur out of the flare.
   */
  lampThreshold: 0.1,
  /**
   * The ghosts of the bright parts: the scale of their image through the optical middle of the
   * image, and the light of the ghost for each unit of the light above the threshold. A negative
   * scale mirrors the image through the middle. The ghosts take the colors of
   * {@link LENS_FLARE}.ghostColors.
   */
  lampGhosts: [
    [-0.55, 0.2],
    [-1.25, 0.12],
    [0.45, 0.16],
  ],
  /**
   * The halo: a bright part near the middle of the image gives a soft ring of this radius around
   * it, in frame heights, and the light of the ring for each unit of light above the threshold.
   */
  lampHalo: [0.42, 0.03],
  /**
   * The starburst of the aperture blades around each bright part: the length of each of the six
   * rays, in frame heights, and the light of the rays for each unit of light above the threshold.
   */
  lampStar: [0.05, 0.15],
} as const;

/** The number of lights that give a flare in one frame: the strongest ones. */
export const FLARE_SOURCES = 2;

/** The number of samples of the depth test of each light (`FINAL_VERTEX` of `post-shaders.ts`). */
export const FLARE_TAPS = 12;

/** The uniforms of the lens flare in the final pass (`FINAL_FRAGMENT` of `post-shaders.ts`). */
export interface FlareUniforms {
  /** 1 while a light gives a flare, else 0, so the final pass skips the flare. */
  readonly uFlareOn: { value: number };
  /**
   * The place of each light on the canvas, four numbers for each light: the texture coordinates,
   * the value of the depth texture at the light, and 0. A coordinate can be outside 0 to 1.
   */
  readonly uFlareSource: { value: Float32Array };
  /** The linear light of each flare: the color of the light times its weight, three numbers each. */
  readonly uFlareLight: { value: Float32Array };
  /** The optical middle of the image, in texture coordinates of the canvas. */
  readonly uFlareCenter: { value: Vector2 };
  /** The veil, the size of the veil, the glow, and the size of the glow ({@link LENS_FLARE}). */
  readonly uFlareGlare: { value: Float32Array };
  /** The place, the radius, and the light of each ghost, three numbers each. */
  readonly uFlareGhost: { value: Float32Array };
  /** The linear color of each ghost, three numbers each. */
  readonly uFlareGhostColor: { value: Float32Array };
  /** 1 when the depth texture of the frame is ready for the depth test, else 0. */
  readonly uFlareDepthOn: { value: number };
  /** The radius of the depth test, in frame heights. */
  readonly uFlareOccluder: { value: number };
}

/**
 * Creates the uniforms of the lens flare, with no flare.
 *
 * @returns The uniforms.
 */
export function createFlareUniforms(): FlareUniforms {
  const ghosts = Math.max(1, LENS_FLARE.ghosts.length);
  return {
    uFlareOn: { value: 0 },
    uFlareSource: { value: new Float32Array(4 * FLARE_SOURCES) },
    uFlareLight: { value: new Float32Array(3 * FLARE_SOURCES) },
    uFlareCenter: { value: new Vector2(0.5, 0.5) },
    uFlareGlare: { value: new Float32Array(4) },
    uFlareGhost: { value: new Float32Array(3 * ghosts) },
    uFlareGhostColor: { value: new Float32Array(3 * ghosts) },
    uFlareDepthOn: { value: 0 },
    uFlareOccluder: { value: LENS_FLARE.occluder },
  };
}

/** The flare of one light in one frame. */
interface FlareLight {
  /** The weight of the flare: the light at the lens, in lux, times the reach and the strength. */
  weight: number;
  /** The texture coordinates of the light on the canvas. */
  readonly uv: Vector2;
  /** The value of the depth texture at the light. */
  depth: number;
  /** The linear color of the light. */
  readonly color: Color;
}

/**
 * Creates an empty flare.
 *
 * @returns The flare, with no weight.
 */
function emptyFlare(): FlareLight {
  return { weight: 0, uv: new Vector2(), depth: 1, color: new Color() };
}

/** The two strongest flares of a frame. Each call of {@link writeFlare} writes them first. */
const flares: readonly FlareLight[] = Array.from({ length: FLARE_SOURCES }, emptyFlare);

/** The flare of the light of now, written before each read. */
const candidate = emptyFlare();

/** The light in the axes of the camera, written before each read. */
const inView = new Vector3();

/** The axis of the cone of a light, written before each read. */
const axis = new Vector3();

/** The way from a light to the camera, written before each read. */
const toCamera = new Vector3();

/** A ghost color, written before each read. */
const ghostColor = new Color();

/**
 * Gives the angle by which a tangent of a view ray is outside a range of tangents.
 *
 * @param tangent The tangent of the ray: the ratio of the side and the depth in the camera axes.
 * @param low The tangent of the low edge of the frame.
 * @param high The tangent of the high edge of the frame.
 * @returns The angle outside the range, in radians, or 0 inside it.
 */
function outsideAngle(tangent: number, low: number, high: number): number {
  if (tangent > high) {
    return Math.atan(tangent) - Math.atan(high);
  }
  if (tangent < low) {
    return Math.atan(low) - Math.atan(tangent);
  }
  return 0;
}

/**
 * Calculates the flare of one spotlight into {@link candidate}: the light at the lens, by the cone
 * of the light with the spill of {@link LENS_FLARE} and the decay 2, times the fall with the angle
 * outside the frame. The camera has the matrices of the frame.
 *
 * @param spot The spotlight. It stands in world space.
 * @param camera The camera of the frame.
 * @param rect The part of the canvas that shows the scene, or `null` for the full canvas.
 */
function flareOf(spot: SpotLight, camera: PerspectiveCamera, rect: UvRect | null): void {
  candidate.weight = 0;
  const look = LENS_FLARE;
  inView.copy(spot.position).applyMatrix4(camera.matrixWorldInverse);
  const depth = -inView.z;
  if (depth <= camera.near) {
    return;
  }
  // The projection with a view offset: x of the canvas = p0 × x / depth - p8, and so for y.
  const p = camera.projectionMatrix.elements;
  const p0 = p[0] ?? 1;
  const p5 = p[5] ?? 1;
  const p8 = p[8] ?? 0;
  const p9 = p[9] ?? 0;
  const p10 = p[10] ?? -1;
  const p14 = p[14] ?? 0;
  const tanX = inView.x / depth;
  const tanY = inView.y / depth;
  const left = (rect?.left ?? 0) * 2 - 1;
  const right = (rect?.right ?? 1) * 2 - 1;
  const bottom = (rect?.bottom ?? 0) * 2 - 1;
  const top = (rect?.top ?? 1) * 2 - 1;
  const outside = Math.max(
    outsideAngle(tanX, (left + p8) / p0, (right + p8) / p0),
    outsideAngle(tanY, (bottom + p9) / p5, (top + p9) / p5),
  );
  const reach = 1 - MathUtils.smoothstep(outside, 0, look.reach);
  if (reach <= 0) {
    return;
  }
  axis.subVectors(spot.target.position, spot.position).normalize();
  toCamera.subVectors(camera.position, spot.position);
  const distanceSquared = Math.max(toCamera.lengthSq(), 1e-4);
  const cosine = axis.dot(toCamera) / Math.sqrt(distanceSquared);
  const outer = Math.cos(Math.min(spot.angle * look.spill, Math.PI / 2));
  const inner = Math.cos(spot.angle * (1 - spot.penumbra));
  const facing = MathUtils.smoothstep(cosine, outer, Math.max(inner, outer + 1e-4));
  candidate.weight = ((spot.intensity * facing) / distanceSquared) * reach * look.strength;
  candidate.uv.set((p0 * tanX - p8 + 1) / 2, (p5 * tanY - p9 + 1) / 2);
  candidate.depth = ((p10 * -depth + p14) / depth + 1) / 2;
  candidate.color.copy(spot.color);
}

/**
 * Keeps {@link candidate} if it is stronger than one of the flares of {@link flares}. The flares
 * stay sorted from the strongest.
 */
function keepCandidate(): void {
  const index = flares.findIndex((flare) => candidate.weight > flare.weight);
  if (index < 0) {
    return;
  }
  for (let i = flares.length - 1; i > index; i--) {
    copyFlare(flares[i - 1], flares[i]);
  }
  copyFlare(candidate, flares[index]);
}

/**
 * Copies one flare into another.
 *
 * @param from The flare to copy.
 * @param to The flare to write, or `undefined` for none.
 */
function copyFlare(from: FlareLight | undefined, to: FlareLight | undefined): void {
  if (!from || !to) {
    return;
  }
  to.weight = from.weight;
  to.uv.copy(from.uv);
  to.depth = from.depth;
  to.color.copy(from.color);
}

/**
 * Writes the lens flare of a frame into the uniforms (design 4.5, post effects): the two
 * strongest flares of the spotlights of the light group ({@link FLARE_SOURCES}), and the shape of
 * {@link LENS_FLARE}. It reads the look values at each call, so that the look override of the dev
 * server (`src/app/look-override.ts`) reaches them. Call it after the render of the scene, which
 * updates the matrices of the camera.
 *
 * @param uniforms The uniforms of {@link createFlareUniforms}.
 * @param lights The group of `createLights()`, or `null` for no flare.
 * @param camera The camera of the frame.
 * @param rect The part of the canvas that shows the scene, or `null` for the full canvas.
 * @param depth True when the depth texture of the frame is ready for the depth test.
 */
export function writeFlare(
  uniforms: FlareUniforms,
  lights: Object3D | null,
  camera: PerspectiveCamera,
  rect: UvRect | null,
  depth: boolean,
): void {
  for (const flare of flares) {
    flare.weight = 0;
  }
  for (const child of lights?.children ?? []) {
    if (child instanceof SpotLight) {
      flareOf(child, camera, rect);
      keepCandidate();
    }
  }
  uniforms.uFlareOn.value = (flares[0]?.weight ?? 0) > 0 ? 1 : 0;
  const source = uniforms.uFlareSource.value;
  const light = uniforms.uFlareLight.value;
  for (const [i, flare] of flares.entries()) {
    source[i * 4] = flare.uv.x;
    source[i * 4 + 1] = flare.uv.y;
    source[i * 4 + 2] = flare.depth;
    flare.color.multiplyScalar(flare.weight).toArray(light, i * 3);
  }

  const p = camera.projectionMatrix.elements;
  uniforms.uFlareCenter.value.set((1 - (p[8] ?? 0)) / 2, (1 - (p[9] ?? 0)) / 2);
  const look = LENS_FLARE;
  const glare = uniforms.uFlareGlare.value;
  glare[0] = look.veil;
  glare[1] = look.veilSize;
  glare[2] = look.glow;
  glare[3] = look.glowSize;
  const ghosts = uniforms.uFlareGhost.value;
  const colors = uniforms.uFlareGhostColor.value;
  for (let i = 0; i < ghosts.length / 3; i++) {
    const [place = 0, radius = 0, strength = 0] = look.ghosts[i] ?? [];
    ghosts[i * 3] = place;
    ghosts[i * 3 + 1] = radius;
    ghosts[i * 3 + 2] = strength;
    ghostColor.set(look.ghostColors[i] ?? '#ffffff').toArray(colors, i * 3);
  }
  uniforms.uFlareDepthOn.value = depth ? 1 : 0;
  uniforms.uFlareOccluder.value = look.occluder;
}

/**
 * The uniforms of the pass of the lamp flare (`LAMP_FLARE_FRAGMENT` of `post-shaders.ts`): the
 * flare of the bright parts of the image, such as the lamps of the hall.
 */
export interface LampFlareUniforms {
  /** The frame on the canvas: left, bottom, right, top, in texture coordinates. */
  readonly uFrame: { value: Vector4 };
  /** The optical middle of the image, in texture coordinates of the canvas. */
  readonly uCenter: { value: Vector2 };
  /** The width of the canvas divided by its height. */
  readonly uAspect: { value: number };
  /** The threshold of the bright parts ({@link LENS_FLARE}.lampThreshold). */
  readonly uThreshold: { value: number };
  /** The scale and the light of each ghost, times the strength, two numbers each. */
  readonly uGhost: { value: Float32Array };
  /** The linear color of each ghost, three numbers each. */
  readonly uGhostColor: { value: Float32Array };
  /** The radius and the light of the halo, times the strength. */
  readonly uHalo: { value: Vector2 };
  /** The length and the light of the starburst, times the strength. */
  readonly uStar: { value: Vector2 };
}

/**
 * Gives the number of ghosts of the lamp flare, for the arrays of its shader.
 *
 * @returns The number of ghosts of {@link LENS_FLARE}, at least 1.
 */
export function lampGhostCount(): number {
  return Math.max(1, LENS_FLARE.lampGhosts.length);
}

/**
 * Creates the uniforms of the pass of the lamp flare, with no light.
 *
 * @returns The uniforms.
 */
export function createLampFlareUniforms(): LampFlareUniforms {
  const ghosts = lampGhostCount();
  return {
    uFrame: { value: new Vector4(0, 0, 1, 1) },
    uCenter: { value: new Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
    uThreshold: { value: LENS_FLARE.lampThreshold },
    uGhost: { value: new Float32Array(2 * ghosts) },
    uGhostColor: { value: new Float32Array(3 * ghosts) },
    uHalo: { value: new Vector2() },
    uStar: { value: new Vector2() },
  };
}

/**
 * Writes the lamp flare of a frame into the uniforms of its pass (design 4.5, post effects). It
 * reads the look values at each call, so that the look override of the dev server reaches them.
 *
 * @param uniforms The uniforms of {@link createLampFlareUniforms}.
 * @param camera The camera of the frame, with the projection of the frame.
 * @param rect The part of the canvas that shows the scene, or `null` for the full canvas.
 * @param aspect The width of the canvas divided by its height.
 */
export function writeLampFlare(
  uniforms: LampFlareUniforms,
  camera: PerspectiveCamera,
  rect: UvRect | null,
  aspect: number,
): void {
  const look = LENS_FLARE;
  const strength = look.strength;
  uniforms.uFrame.value.set(rect?.left ?? 0, rect?.bottom ?? 0, rect?.right ?? 1, rect?.top ?? 1);
  const p = camera.projectionMatrix.elements;
  uniforms.uCenter.value.set((1 - (p[8] ?? 0)) / 2, (1 - (p[9] ?? 0)) / 2);
  uniforms.uAspect.value = aspect;
  uniforms.uThreshold.value = look.lampThreshold;
  const ghosts = uniforms.uGhost.value;
  const colors = uniforms.uGhostColor.value;
  for (let i = 0; i < ghosts.length / 2; i++) {
    const [scale = 1, light = 0] = look.lampGhosts[i] ?? [];
    ghosts[i * 2] = scale;
    ghosts[i * 2 + 1] = light * strength;
    ghostColor.set(look.ghostColors[i] ?? '#ffffff').toArray(colors, i * 3);
  }
  uniforms.uHalo.value.set(look.lampHalo[0], look.lampHalo[1] * strength);
  uniforms.uStar.value.set(look.lampStar[0], look.lampStar[1] * strength);
}
