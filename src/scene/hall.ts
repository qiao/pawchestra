import { CircleGeometry, Color, Group, Mesh, ShaderMaterial, Vector3 } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import { srgb } from '../models/mesh.ts';
import type { Rgb } from '../models/mesh.ts';
import { RIM_PLACE, rimLightPlace } from '../models/beam.ts';
import { STAGE_THICKNESS } from '../models/stage.ts';
import { RIM_LIGHT } from './lights.ts';
import {
  TriangleList,
  addLamp,
  bakedGeometry,
  createGlows,
  cutawayMaterial,
  ringCutaway,
  setCutaway,
} from './surroundings.ts';
import type { BakedMesh, Cutaway, Lamp } from './surroundings.ts';

/**
 * The concert hall around the stage (design 4.5, hall). The values are parts of the hall unit
 * `h`, the stage side with a minimum (see {@link hallUnit}). The hall is a ring of walls with two
 * balcony tiers and rows of small warm lamps, as in `scene.png`. All its faces point into the
 * hall, so a camera outside the ring sees through the near side to the far side.
 */
export const HALL = {
  /** The smallest hall unit, in meters, so that a small stage still stands in a large hall. */
  minUnit: 9,
  /** The radius of the wall ring. */
  wallRadius: 1.45,
  /**
   * The center of the ring is this far in front of the stage center (+z), so that the back wall
   * stands closer behind the stage than the side walls.
   */
  centerZ: 0.25,
  /** The height of the walls above the floor. */
  wallHeight: 1.5,
  /** The number of flat faces of the ring. */
  segments: 36,
  /** The balcony tiers: the height of the balcony floor, and its depth from the wall. */
  tiers: [
    { height: 0.3, depth: 0.12 },
    { height: 0.56, depth: 0.1 },
  ],
  /** The height of the rail at the front of a balcony. */
  railHeight: 0.05,
  /** The lamps on a rail stand this far apart, in meters. */
  lampSpacing: 2.6,
  /** The size of a lamp, in meters. */
  lampSize: 0.14,
  /**
   * The low lamps on the wall: their height above the floor, in hall units, their size, and their
   * spacing, in meters. The default view sees the wall behind the stage only up to about 1.2 m
   * above the floor, below the balconies, so with no low lamps it showed no lamp of the hall. In
   * `mockup.png`, warm lamps glow at the edges of the image.
   */
  wallLamps: {
    height: 0.06,
    size: 0.12,
    spacing: 3.4,
    /**
     * The row has no lamp within this angle of the back (-z), seen from the ring center. The hall
     * is 13 m behind a stage of 11 m, so the default view showed the low lamps behind the stage
     * 120 to 170 px above its back edge, in the dark, as lights that float above the orchestra.
     * `mockup.png` and `orchestra-latest.png` have no lamp there. With 40°, the higher default
     * view of `orchestra-latest.png` put the lamps 42° and 54° from the back behind the composer
     * line and at the edge of the play button of the first screen. The lamps at the sides stay
     * at the edges of the image.
     */
    backGap: (60 * Math.PI) / 180,
  },
  /**
   * The radius of the soft glow around a lamp, in meters: on a rail and on the wall. The glow is a
   * disc that faces the camera, as the soft lamps of `mockup.png` and the out of focus lamps of
   * `scene.png`. The bloom alone gave a lamp of 0.14 m a halo of 1 to 2 pixels in the wide views.
   */
  glow: { rail: 0.45, wall: 0.7 },
  /**
   * The cutaway: a camera outside the ring sees no part of the hall within this angle of its own
   * direction from the ring center, so that the near balconies do not stand in front of the
   * stage. The side lamps stay, as at the edges of `mockup.png`.
   */
  cutawayAngle: (75 * Math.PI) / 180,
} as const;

/** The colors of the hall, as sRGB (design 4.5, scene colors). */
export const HALL_COLORS = {
  wall: '#30241c',
  /** Every second wall face, as a wood panel. */
  panel: '#281e17',
  balconyFront: '#3c2c21',
  /** The gilded edge at the top of a rail. */
  trim: '#8c6c4a',
  underside: '#120d0a',
  /** The light of a lamp, in linear values above 1, so that the bloom takes it. */
  lamp: [9, 5.2, 2.4],
} as const;

/** The baked light of the hall: the glow of the lit stage, and the dark far from it. */
export const HALL_LIGHT = {
  /** The light everywhere, as a part of the base color. */
  ambient: 0.18,
  /** The light from the stage, as a part of the base color, at the stage. */
  glow: 2.2,
  /** The distance at which the glow halves, in hall units. */
  glowReach: 0.7,
  /** The light at the top of the walls, as a part of the light at the floor. */
  top: 0.35,
} as const;

/** The hall: the shell with baked light, and the lamps. */
interface HallData {
  /** The walls and the balconies. */
  readonly shell: BakedMesh;
  /** The small bright bodies of the lamps. */
  readonly lamps: BakedMesh;
  /** Each lamp, for its glow. */
  readonly lampList: readonly Lamp[];
}

/**
 * Gives the hall unit: the stage side, but at least {@link HALL}.minUnit.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The hall unit `h`, in meters.
 */
export function hallUnit(stageSide: number): number {
  return Math.max(stageSide, HALL.minUnit);
}

/**
 * Calculates the baked light of a point of the hall: the ambient light, plus the glow of the lit
 * stage, which falls off with the distance and with the height.
 *
 * @param point The point.
 * @param normal The normal of its face, of length 1.
 * @param unit The hall unit `h`.
 * @returns The factor of the base color.
 */
export function hallLight(point: Vec3, normal: Vec3, unit: number): number {
  const light = HALL_LIGHT;
  const [x, y, z] = point;
  // The glow comes from a point above the stage center.
  const to: Vec3 = [-x, 0.25 * unit - y, -z];
  const distance = Math.hypot(...to);
  const facing = Math.max(
    0,
    (normal[0] * to[0] + normal[1] * to[1] + normal[2] * to[2]) / distance,
  );
  const reach = light.glowReach * unit;
  const glow = light.glow / (1 + (distance / reach) ** 2);
  const height = Math.min(1, Math.max(0, (y + STAGE_THICKNESS) / (HALL.wallHeight * unit)));
  const fade = 1 + (light.top - 1) * height;
  return (light.ambient + glow * (0.3 + 0.7 * facing)) * fade;
}

/**
 * Bakes the light of a triangle into the colors of its corners.
 *
 * @param corners The corners.
 * @param base The linear base color.
 * @param unit The hall unit.
 * @returns The color of each corner.
 */
function bake(corners: readonly [Vec3, Vec3, Vec3], base: Rgb, unit: number): [Rgb, Rgb, Rgb] {
  const [a, b, c] = corners;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  const normal: Vec3 = [n[0] / length, n[1] / length, n[2] / length];
  const shade = (p: Vec3): Rgb => {
    const k = hallLight(p, normal, unit);
    return [base[0] * k, base[1] * k, base[2] * k];
  };
  return [shade(a), shade(b), shade(c)];
}

/** Adds a quad with baked light: two triangles, corners counterclockwise from the side that shows. */
function addQuad(
  list: TriangleList,
  corners: readonly [Vec3, Vec3, Vec3, Vec3],
  base: Rgb,
  unit: number,
): void {
  const [a, b, c, d] = corners;
  const anchor: [number, number] = [
    (a[0] + b[0] + c[0] + d[0]) / 4,
    (a[2] + b[2] + c[2] + d[2]) / 4,
  ];
  list.add([a, b, c], bake([a, b, c], base, unit), anchor);
  list.add([a, c, d], bake([a, c, d], base, unit), anchor);
}

/**
 * Builds the hall around a stage (design 4.5, hall): the wall ring, two balcony tiers with a rail
 * and a gilded edge, the lamps on the rails, and a row of low lamps on the wall. The floor is a
 * separate mesh.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The shell and the lamps.
 */
export function buildHall(stageSide: number): HallData {
  const unit = hallUnit(stageSide);
  const shell = new TriangleList();
  const floorY = -STAGE_THICKNESS;
  const centerZ = HALL.centerZ * unit;
  const segments = HALL.segments;
  const ring = (radius: number, i: number, y: number): Vec3 => {
    const angle = (i / segments) * Math.PI * 2;
    return [radius * Math.sin(angle), y, centerZ + radius * Math.cos(angle)];
  };
  const wallRadius = HALL.wallRadius * unit;
  const top = floorY + HALL.wallHeight * unit;
  // The wall faces go in three bands, so that the baked light can fade with the height.
  const bands = [floorY, floorY + 0.25 * (top - floorY), floorY + 0.6 * (top - floorY), top];
  for (let i = 0; i < segments; i++) {
    const color = srgb(i % 2 === 0 ? HALL_COLORS.wall : HALL_COLORS.panel);
    for (let k = 0; k + 1 < bands.length; k++) {
      const y0 = bands[k] ?? floorY;
      const y1 = bands[k + 1] ?? top;
      // The face points to the ring center: counterclockwise seen from inside.
      addQuad(
        shell,
        [
          ring(wallRadius, i + 1, y0),
          ring(wallRadius, i, y0),
          ring(wallRadius, i, y1),
          ring(wallRadius, i + 1, y1),
        ],
        color,
        unit,
      );
    }
  }

  const lamps = new TriangleList();
  const lampList: Lamp[] = [];
  const lampColor: Rgb = [...HALL_COLORS.lamp];
  for (const tier of HALL.tiers) {
    const y = floorY + tier.height * unit;
    const railTop = y + HALL.railHeight * unit;
    const inner = wallRadius - tier.depth * unit;
    for (let i = 0; i < segments; i++) {
      // The balcony floor, seen from above.
      addQuad(
        shell,
        [
          ring(inner, i, railTop),
          ring(wallRadius, i, railTop),
          ring(wallRadius, i + 1, railTop),
          ring(inner, i + 1, railTop),
        ],
        srgb(HALL_COLORS.balconyFront),
        unit,
      );
      // The underside, seen from below.
      addQuad(
        shell,
        [
          ring(inner, i, y),
          ring(inner, i + 1, y),
          ring(wallRadius, i + 1, y),
          ring(wallRadius, i, y),
        ],
        srgb(HALL_COLORS.underside),
        unit,
      );
      // The rail front, which points to the ring center, and the gilded edge on its top.
      const trimY = railTop - 0.2 * (railTop - y);
      addQuad(
        shell,
        [
          ring(inner, i + 1, y),
          ring(inner, i, y),
          ring(inner, i, trimY),
          ring(inner, i + 1, trimY),
        ],
        srgb(HALL_COLORS.balconyFront),
        unit,
      );
      addQuad(
        shell,
        [
          ring(inner, i + 1, trimY),
          ring(inner, i, trimY),
          ring(inner, i, railTop),
          ring(inner, i + 1, railTop),
        ],
        srgb(HALL_COLORS.trim),
        unit,
      );
    }
    const count = Math.round((2 * Math.PI * inner) / HALL.lampSpacing);
    for (let j = 0; j < count; j++) {
      const angle = ((j + 0.5) / count) * Math.PI * 2;
      // The lamp stands a little in front of the rail, at its gilded edge.
      const radius = inner - HALL.lampSize;
      const center: Vec3 = [
        radius * Math.sin(angle),
        railTop + HALL.lampSize,
        centerZ + radius * Math.cos(angle),
      ];
      lampList.push({ center, glow: HALL.glow.rail });
      addLamp(lamps, center, HALL.lampSize / 2, lampColor);
    }
  }

  const low = HALL.wallLamps;
  const lowRadius = wallRadius - low.size;
  const lowCount = Math.round((2 * Math.PI * lowRadius) / low.spacing);
  for (let j = 0; j < lowCount; j++) {
    const angle = ((j + 0.5) / lowCount) * Math.PI * 2;
    // The angle π points to the back of the hall, behind the stage.
    if (Math.abs(angle - Math.PI) < low.backGap) {
      continue;
    }
    const center: Vec3 = [
      lowRadius * Math.sin(angle),
      floorY + low.height * unit,
      centerZ + lowRadius * Math.cos(angle),
    ];
    lampList.push({ center, glow: HALL.glow.wall });
    addLamp(lamps, center, low.size / 2, lampColor);
  }
  return { shell: shell.build(), lamps: lamps.build(), lampList };
}

/**
 * The floor of the hall (design 4.5, hall): dark wood with the baked spill of the stage light. It
 * takes no light, because the lights cost 0.7 ms on the large floor at 2880 × 1800 on the
 * development Mac. The spill fades with the distance from the stage edge.
 */
export const HALL_FLOOR = {
  /** The floor far from the stage, in sRGB. In `mockup.png`, the dark floor has a value of 17. */
  far: '#100b08',
  /** The floor at the stage edge, in sRGB. In `mockup.png`, the floor below the lip has 36. */
  edge: '#3a2416',
  /** The distance from the stage edge where the spill halves, in stage sides. */
  reach: 0.12,
  /**
   * The gloss of the polished floor: the reflection of the rim light on the stage axis
   * (`RIM_LIGHT` of scene/lights.ts), as a Blinn-Phong highlight with this exponent. In
   * `mockup.png`, the floor in front of the podium shows a warm smear of light from the stage.
   * The light stands behind the stage, so the default view sees its reflection in front of the
   * stage.
   */
  shine: 60,
  /** The light of the middle of the gloss, as a part of the color of the rim light. */
  gloss: 0.015,
} as const;

const FLOOR_VERTEX = /* glsl */ `
varying vec2 vFloor;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFloor = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FLOOR_FRAGMENT = /* glsl */ `
uniform vec3 uFar;
uniform vec3 uEdge;
uniform float uHalfSide;
uniform float uReach;
uniform vec3 uGlossLight;
uniform vec3 uGlossColor;
uniform float uShine;
uniform float uFloorY;
varying vec2 vFloor;
void main() {
  vec2 outside = max(abs(vFloor) - uHalfSide, 0.0);
  float d = length(outside) / uReach;
  vec3 color = mix(uFar, uEdge, 1.0 / (1.0 + d * d));
  // The gloss: the reflection of the rim light on the polished floor, outside the stage.
  vec3 p = vec3(vFloor.x, uFloorY, vFloor.y);
  vec3 h = normalize(normalize(uGlossLight - p) + normalize(cameraPosition - p));
  float onFloor = step(0.0, max(outside.x, outside.y) - 1e-3);
  color += uGlossColor * pow(max(h.y, 0.0), uShine) * onFloor;
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** The light of the middle of a lamp glow, in linear values. */
export const GLOW_LIGHT: Rgb = [0.45, 0.2, 0.075];

/**
 * Calculates the cutaway of the hall for a camera (design 4.5, hall). A camera outside the ring
 * sees no part of the hall within {@link HALL}.cutawayAngle of its own direction. Inside the
 * ring, as in a close shot, the camera sees the full hall. Between 0.85 and 1.0 of the radius,
 * the cut opens from the back of the camera, so that a move of the camera has no jump.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param camera The camera position.
 * @returns The cutaway.
 */
export function hallCutaway(stageSide: number, camera: Vec3): Cutaway {
  const unit = hallUnit(stageSide);
  return ringCutaway(camera, HALL.centerZ * unit, HALL.wallRadius * unit, HALL.cutawayAngle);
}

/**
 * Sets the cutaway of the hall for the camera of a frame (design 4.5, hall).
 *
 * @param hall The group of {@link createHall}.
 * @param stageSide The stage side `S`, in meters.
 * @param camera The camera position.
 * @param pixels The height of the drawing buffer, in pixels, for the size of the lamp glows.
 */
export function setHallCamera(
  hall: Group,
  stageSide: number,
  camera: Vector3,
  pixels: number,
): void {
  setCutaway(hall, hallCutaway(stageSide, [camera.x, camera.y, camera.z]), pixels);
}

/**
 * Creates the hall around a stage (design 4.5, hall): the floor, the shell with its baked light,
 * the lamps, and their glows. They take no light and cast no shadow, so they cost one draw call each and no
 * light math.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns A group with the floor, the shell, and the lamps.
 */
export function createHall(stageSide: number): Group {
  const data = buildHall(stageSide);
  const unit = hallUnit(stageSide);
  const centerZ = HALL.centerZ * unit;
  const shell = new Mesh(bakedGeometry(data.shell), cutawayMaterial(centerZ));
  const lamps = new Mesh(bakedGeometry(data.lamps), cutawayMaterial(centerZ));
  const floor = new Mesh(
    new CircleGeometry(HALL.wallRadius * unit, HALL.segments),
    new ShaderMaterial({
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
      uniforms: {
        uFar: { value: new Color(HALL_FLOOR.far) },
        uEdge: { value: new Color(HALL_FLOOR.edge) },
        uHalfSide: { value: stageSide / 2 },
        uReach: { value: HALL_FLOOR.reach * stageSide },
        uGlossLight: { value: new Vector3(...rimLightPlace(stageSide, RIM_PLACE)) },
        uGlossColor: {
          value: new Color(RIM_LIGHT.color).multiplyScalar(HALL_FLOOR.gloss),
        },
        uShine: { value: HALL_FLOOR.shine },
        uFloorY: { value: -STAGE_THICKNESS },
      },
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -STAGE_THICKNESS, HALL.centerZ * unit);
  return new Group().add(floor, shell, lamps, createGlows(data.lampList, centerZ, GLOW_LIGHT));
}
