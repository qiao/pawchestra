import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

import type { Rgb } from '../models/mesh.ts';
import type { Vec3 } from '../models/tuples.ts';

/**
 * The geometry of one part of the surroundings of a venue (design 4.1), with no index: three
 * vertices for each triangle, and baked light in the colors.
 */
export interface BakedMesh {
  /** x, y, z of each vertex, in meters. */
  readonly positions: Float32Array;
  /** Linear r, g, b of each vertex. */
  readonly colors: Float32Array;
  /**
   * The anchor of the part of each vertex on the floor: x and z of the center of its quad, its
   * lamp, or its tree. The cutaway keeps or drops each part as a whole.
   */
  readonly anchors: Float32Array;
}

/** One lamp of the surroundings: its center and the radius of its glow, in meters. */
export interface Lamp {
  /** The center of the lamp. */
  readonly center: Vec3;
  /** The radius of the soft glow around the lamp. */
  readonly glow: number;
}

/** Collects triangles with a color for each vertex. */
export class TriangleList {
  /** x, y, z of each vertex. */
  readonly positions: number[] = [];
  /** Linear r, g, b of each vertex. */
  readonly colors: number[] = [];
  /** The anchor of each vertex on the floor: x and z. */
  readonly anchors: number[] = [];

  /**
   * Adds a triangle. The corners go counterclockwise, seen from the side that shows.
   *
   * @param corners The corners.
   * @param colors The color of each corner.
   * @param anchor The anchor of the part on the floor (x, z).
   */
  add(
    corners: readonly [Vec3, Vec3, Vec3],
    colors: readonly [Rgb, Rgb, Rgb],
    anchor: readonly [number, number],
  ): void {
    for (const [i, p] of corners.entries()) {
      this.positions.push(p[0], p[1], p[2]);
      const color = colors[i] ?? colors[0];
      this.colors.push(color[0], color[1], color[2]);
      this.anchors.push(anchor[0], anchor[1]);
    }
  }

  /**
   * Makes the typed arrays of the triangles.
   *
   * @returns The mesh.
   */
  build(): BakedMesh {
    return {
      positions: new Float32Array(this.positions),
      colors: new Float32Array(this.colors),
      anchors: new Float32Array(this.anchors),
    };
  }
}

/**
 * Adds a lamp: an octahedron, so that it shows from each side.
 *
 * @param list The triangles of the lamps.
 * @param center The center.
 * @param radius The radius.
 * @param color The linear color.
 */
export function addLamp(list: TriangleList, center: Vec3, radius: number, color: Rgb): void {
  const [x, y, z] = center;
  const top: Vec3 = [x, y + radius, z];
  const bottom: Vec3 = [x, y - radius, z];
  const ring: Vec3[] = [
    [x + radius, y, z],
    [x, y, z + radius],
    [x - radius, y, z],
    [x, y, z - radius],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i] ?? top;
    const b = ring[(i + 1) % 4] ?? top;
    list.add([a, top, b], [color, color, color], [x, z]);
    list.add([a, b, bottom], [color, color, color], [x, z]);
  }
}

// The cutaway drops each cut part in the vertex shader: its three corners leave the view, so the
// GPU drops the triangle. A discard in the fragment shader cost the hidden surface removal of the
// tile GPUs of Apple.
const CUTAWAY_VERTEX = /* glsl */ `
attribute vec2 anchor;
uniform vec2 uCenter;
uniform vec2 uCameraDirection;
uniform float uCutaway;
varying vec3 vColor;
void main() {
  vColor = color;
  if (dot(normalize(anchor - uCenter), uCameraDirection) > uCutaway) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const BAKED_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}
`;

// The glow of a lamp: a disc that faces the camera, with the cutaway. Its size is in meters, so a
// near lamp is a large soft disc.
const GLOW_VERTEX = /* glsl */ `
attribute vec2 anchor;
attribute float glow;
uniform vec2 uCenter;
uniform vec2 uCameraDirection;
uniform float uCutaway;
uniform float uPixels;
void main() {
  if (dot(normalize(anchor - uCenter), uCameraDirection) > uCutaway) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 view = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(2.0 * glow * projectionMatrix[1][1] * uPixels * 0.5 / -view.z, 1.0, 256.0);
  // The disc moves toward the camera by its radius along the view ray, so the wall behind the lamp
  // does not cut it, and the disc keeps its place in the image.
  float distance = length(view.xyz);
  view.xyz *= 1.0 - min(glow, distance - 0.2) / distance;
  gl_Position = projectionMatrix * view;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float light = exp(-6.0 * d * d) * (1.0 - smoothstep(0.8, 1.0, d));
  gl_FragColor = vec4(uColor * light, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Creates the glows of the lamps: points that face the camera, with additive light and the
 * cutaway. They write no depth, so the depth passes of the beam and of the depth of field hide
 * them as light effects.
 *
 * @param lamps The lamps.
 * @param centerZ The z of the center of the cutaway, in meters.
 * @param light The light of the middle of a glow, in linear values.
 * @returns The points.
 */
export function createGlows(lamps: readonly Lamp[], centerZ: number, light: Rgb): Points {
  const positions = new Float32Array(lamps.length * 3);
  const anchors = new Float32Array(lamps.length * 2);
  const glows = new Float32Array(lamps.length);
  for (const [i, lamp] of lamps.entries()) {
    positions.set(lamp.center, i * 3);
    anchors.set([lamp.center[0], lamp.center[2]], i * 2);
    glows[i] = lamp.glow;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('anchor', new BufferAttribute(anchors, 2));
  geometry.setAttribute('glow', new BufferAttribute(glows, 1));
  const material = new ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uCenter: { value: new Vector2(0, centerZ) },
      uCameraDirection: { value: new Vector2(0, 1) },
      uCutaway: { value: 2 },
      uPixels: { value: 900 },
      uColor: { value: new Vector3(...light) },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.name = 'lamp-glows';
  return points;
}

/**
 * Creates the material of a baked mesh: the colors of its vertices, with the cutaway.
 *
 * @param centerZ The z of the center of the cutaway, in meters.
 * @returns The material. It takes no light.
 */
export function cutawayMaterial(centerZ: number): ShaderMaterial {
  const material = new ShaderMaterial({
    vertexShader: CUTAWAY_VERTEX,
    fragmentShader: BAKED_FRAGMENT,
    vertexColors: true,
    uniforms: {
      uCenter: { value: new Vector2(0, centerZ) },
      uCameraDirection: { value: new Vector2(0, 1) },
      uCutaway: { value: 2 },
    },
  });
  // The depth pass of the post effects keeps this material, so that it also drops the cut parts.
  // The override material of the pass has no cutaway, and writes the depth of a cut part. The
  // color that it writes into the depth target is not read.
  material.allowOverride = false;
  return material;
}

/**
 * Makes a geometry of a baked mesh.
 *
 * @param mesh The positions, the colors, and the anchors.
 * @returns The geometry.
 */
export function bakedGeometry(mesh: BakedMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3));
  geometry.setAttribute('anchor', new BufferAttribute(mesh.anchors, 2));
  return geometry;
}

/** The cutaway of the surroundings for one camera. */
export interface Cutaway {
  /** The direction from the ring center to the camera on the floor: x and z, of length 1. */
  readonly direction: readonly [number, number];
  /**
   * The cosine limit of the cut: a point whose direction from the ring center has a larger dot
   * product with `direction` is cut. 2 cuts nothing.
   */
  readonly limit: number;
}

/**
 * Calculates the cutaway of a ring of surroundings for a camera (design 4.5, hall). A camera
 * outside the ring sees no part within the cutaway angle of its own direction. Inside the ring,
 * as in a close shot, the camera sees the full ring. Between 0.85 and 1.0 of the radius, the cut
 * opens from the back of the camera, so that a move of the camera has no jump.
 *
 * @param camera The camera position.
 * @param centerZ The z of the ring center, in meters. Its x is 0.
 * @param radius The radius of the ring, in meters.
 * @param angle The cutaway angle, in radians.
 * @returns The cutaway.
 */
export function ringCutaway(camera: Vec3, centerZ: number, radius: number, angle: number): Cutaway {
  const dx = camera[0];
  const dz = camera[2] - centerZ;
  const distance = Math.hypot(dx, dz);
  const t = Math.min(1, Math.max(0, (distance / radius - 0.85) / 0.15));
  const open = t * t * (3 - 2 * t);
  // From 2 (no cut) down to the cosine of the cutaway angle.
  const limit = 2 + (Math.cos(angle) - 2) * open;
  return { direction: distance > 0 ? [dx / distance, dz / distance] : [0, 1], limit };
}

/**
 * Sets the cutaway and the glow size of each child of a group of surroundings for the camera of
 * a frame.
 *
 * @param group The group.
 * @param cutaway The cutaway of the camera.
 * @param pixels The height of the drawing buffer, in pixels, for the size of the lamp glows.
 */
export function setCutaway(group: Group, cutaway: Cutaway, pixels: number): void {
  for (const child of group.children) {
    if (
      (child instanceof Mesh || child instanceof Points) &&
      child.material instanceof ShaderMaterial
    ) {
      const uniforms = child.material.uniforms;
      const value = uniforms['uCameraDirection']?.value;
      if (value instanceof Vector2) {
        value.set(...cutaway.direction);
      }
      const limit = uniforms['uCutaway'];
      if (limit) {
        limit.value = cutaway.limit;
      }
      const height = uniforms['uPixels'];
      if (height) {
        height.value = pixels;
      }
    }
  }
}
