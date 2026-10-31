import type { Rgb } from '../models/mesh.ts';
import { FOREST_FACE_KINDS, FOREST_ROPE } from '../models/forest/kit.ts';
import type { ForestLayout, ForestPart, ForestPlacement } from '../models/forest/kit.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { Steps } from '../score/steps.ts';

/** The index of the face kind `foliage` in the kinds of a part. */
const FOLIAGE = FOREST_FACE_KINDS.indexOf('foliage');

/** The index of the face kind `glow` in the kinds of a part. */
const GLOW = FOREST_FACE_KINDS.indexOf('glow');

/** The index of the face kind `water` in the kinds of a part. */
const WATER = FOREST_FACE_KINDS.indexOf('water');

/**
 * The baked light of the forest (design 4.1): the surroundings take no light in the app, so each
 * face gets the light of the low sun, the sky, the key, the lit deck, and the lanterns in its
 * color. The lights are linear factors of the albedo. The colors of the haze are linear values.
 */
export interface ForestBake {
  /** The light from above, on a face that looks up. */
  readonly sky: Rgb;
  /** The light from below, on a face that looks down. */
  readonly ground: Rgb;
  /** The direct light of the sun on a face that looks at it, in the open. */
  readonly sun: Rgb;
  /**
   * The share of the sun under the canopy: at the floor, and the height in meters from which a
   * face gets the full sun.
   */
  readonly sunShade: readonly [floor: number, height: number];
  /**
   * The shade of the canopy on a low face of wood, earth, or rock far from the clearing: the
   * distances beyond the deck
   * edge at which the shade starts and becomes full, in meters, the heights above the ground at
   * which it starts to fall off and ends, in meters, and the share of the sky and the sun that it
   * takes away.
   */
  readonly canopy: {
    readonly distance: readonly [number, number];
    readonly height: readonly [number, number];
    readonly shade: number;
  };
  /** The light of the sun through a leaf that looks away from it. */
  readonly leafGlow: Rgb;
  /** The soft warm key from the front: its light, and its direction to the light. */
  readonly key: { readonly light: Rgb; readonly direction: Vec3 };
  /** The warm light of the lit deck on the parts near it, and the distance at which it halves. */
  readonly deck: { readonly light: Rgb; readonly reach: number };
  /** The light of a lantern at its glass, and the distance at which it halves. */
  readonly lantern: { readonly light: Rgb; readonly reach: number };
  /**
   * The factor of the albedo of the lantern glass for each channel, above 1 so that the bloom
   * takes it. A lower green and blue keep the amber hue, which the tone curve turns toward white
   * at a high light.
   */
  readonly glass: Rgb;
  /** The light of the sky that the water and the foam reflect, as a factor of their albedo. */
  readonly water: Rgb;
  /**
   * The haze of the far forest: the distance beyond the deck edge at which it starts and the
   * distance over which it reaches 63 %, in meters, its color away from the sun and toward the
   * sun, and the power of the turn toward the sun.
   */
  readonly haze: {
    readonly start: number;
    readonly reach: number;
    readonly away: Rgb;
    readonly toward: Rgb;
    readonly power: number;
  };
}

/** The far forest of the app around the kit: rings of far trees and a backdrop. */
export interface FarForest {
  /** The rings of far trees: the distance range beyond the deck edge, the count, and the scale range. */
  readonly rings: readonly {
    readonly distance: readonly [number, number];
    readonly count: number;
    readonly scale: readonly [number, number];
  }[];
  /** The parts of the far trees, by turns. */
  readonly parts: readonly string[];
  /**
   * The backdrop ring of tree tops: its distance beyond the deck edge, its height range, and the
   * count of its segments, in meters.
   */
  readonly backdrop: {
    readonly distance: number;
    readonly height: readonly [number, number];
    readonly segments: number;
    /** The color of the backdrop before the haze, in linear values. */
    readonly color: Rgb;
  };
  /** The flat ring of ground outside the ground of the kit: its outer radius, in meters. */
  readonly groundRadius: number;
  /** The color of the far ground before the haze, in linear values. */
  readonly groundColor: Rgb;
}

/** The rules of the cut of a part between the camera and the stage. */
export interface CutRules {
  /** The height of one band of the cut test, in meters. */
  readonly band: number;
  /** The side of one plan cell of a band, in meters: a band has one cylinder for each cell. */
  readonly cell: number;
  /** The highest top of a part, in meters above the ground, that the cut keeps in each view. */
  readonly low: number;
  /** The distance in meters within which a part joins the cut group of a tall part before it. */
  readonly join: number;
  /** The smallest footprint radius of a part that the cut keeps in each view, such as the ground. */
  readonly wide: number;
}

/** The sun of the forest: its turn from the front (+z) toward +x and its angle above the floor. */
export interface ForestSun {
  /** The turn from the front toward the right, in radians. */
  readonly azimuth: number;
  /** The angle above the floor, in radians. */
  readonly elevation: number;
}

/** The inputs of {@link buildForestSteps}. */
export interface ForestInputs {
  /** The decoded parts of the kit. */
  readonly parts: readonly ForestPart[];
  /** The places of the kit around the stage. */
  readonly layout: ForestLayout;
  /** The stage side `S`, in meters. */
  readonly stageSide: number;
  /** The height of the ground, in meters. */
  readonly floorY: number;
  /** The sun. */
  readonly sun: ForestSun;
  /** The baked light. */
  readonly bake: ForestBake;
  /** The far forest. */
  readonly far: FarForest;
  /** The rules of the cut. */
  readonly cut: CutRules;
  /** The seeded numbers from 0 to 1: `plankHash()` of `models/stage.ts`. */
  readonly hash: (index: number, salt: number) => number;
  /** `srgb()` of `models/mesh.ts`. */
  readonly srgb: (hex: string) => Rgb;
}

/** The triangles of one mesh of the forest, with no index. */
export interface ForestArrays {
  /** x, y, z of each vertex, in meters. */
  readonly positions: Float32Array;
  /** The baked linear r, g, b of each vertex. */
  readonly colors: Float32Array;
  /** The cut group of each vertex ({@link CutGroup}). */
  readonly cut: Float32Array;
}

/** One lantern glow: the center of its glass, its cut group, and its kind. */
export interface ForestLamp {
  /** The center of the glass, in meters. */
  readonly center: Vec3;
  /** The cut group of the lantern. */
  readonly cut: number;
}

/**
 * One band of a cut group: an upright cylinder around the points of the group in one height band,
 * in meters. Its axis stands at the middle of the points, so that a bough that reaches to one side
 * gets a cylinder on that side.
 */
export type CutBand = readonly [bottom: number, top: number, x: number, z: number, radius: number];

/**
 * One cut group: the parts that the cut keeps or drops together, such as a stump and its
 * lantern. Group 0 holds the parts that the cut keeps in each view.
 */
export interface CutGroup {
  /** The bands of the group from the ground up. */
  readonly bands: readonly CutBand[];
  /** One upright cylinder around all bands, for a fast first test. */
  readonly bounds: CutBand | null;
  /** For a rope: the groups of its two trees, so that it drops with either tree. */
  readonly ends: readonly [number, number] | null;
}

/** The forest of one stage: two meshes, the lamps, and the cut groups. */
export interface ForestBuild {
  /** The faces that show from the front only: wood, rock, earth, water, and lantern glass. */
  readonly solid: ForestArrays;
  /** The leaves and the fronds, which show from both sides. */
  readonly foliage: ForestArrays;
  /** The lanterns, for their glows. */
  readonly lamps: readonly ForestLamp[];
  /** The cut groups. */
  readonly groups: readonly CutGroup[];
  /** The count of the triangles. */
  readonly triangles: number;
}

/** One placed copy of a part for the build. */
interface Copy {
  /** The part. */
  readonly part: ForestPart;
  /** The place of the origin of the part. */
  readonly position: Vec3;
  /** The turn about +y, in radians. */
  readonly yaw: number;
  /** The scale. */
  readonly scale: number;
  /** The cut group. */
  group: number;
}

/** Collects triangles with a color and a cut group for each vertex. */
class ArrayBuilder {
  /** x, y, z of each vertex. */
  readonly positions: number[] = [];
  /** The linear r, g, b of each vertex. */
  readonly colors: number[] = [];
  /** The cut group of each vertex. */
  readonly cut: number[] = [];

  /**
   * Adds a triangle with one color.
   *
   * @param corners Nine numbers: the three corners.
   * @param color The color.
   * @param group The cut group.
   */
  add(corners: readonly number[], color: Rgb, group: number): void {
    for (let k = 0; k < 3; k++) {
      this.positions.push(corners[k * 3] ?? 0, corners[k * 3 + 1] ?? 0, corners[k * 3 + 2] ?? 0);
      this.colors.push(color[0], color[1], color[2]);
      this.cut.push(group);
    }
  }

  /**
   * Adds a triangle with a color for each corner.
   *
   * @param corners The three corners.
   * @param colors The color of each corner.
   * @param group The cut group.
   */
  addShaded(corners: readonly [Vec3, Vec3, Vec3], colors: readonly [Rgb, Rgb, Rgb], group: number) {
    for (const [k, corner] of corners.entries()) {
      const color = colors[k] ?? colors[0];
      this.positions.push(...corner);
      this.colors.push(...color);
      this.cut.push(group);
    }
  }

  /**
   * Makes the typed arrays.
   *
   * @returns The arrays.
   */
  build(): ForestArrays {
    return {
      positions: new Float32Array(this.positions),
      colors: new Float32Array(this.colors),
      cut: new Float32Array(this.cut),
    };
  }
}

/**
 * Gives the unit vector toward the sun.
 *
 * @param sun The sun.
 * @returns The direction.
 */
export function sunDirection(sun: ForestSun): Vec3 {
  const flat = Math.cos(sun.elevation);
  return [Math.sin(sun.azimuth) * flat, Math.sin(sun.elevation), Math.cos(sun.azimuth) * flat];
}

/**
 * Gives the distance of a point outside the deck edge in plan, or 0 on the deck.
 *
 * @param x The x of the point.
 * @param z The z of the point.
 * @param half Half the stage side.
 * @returns The distance, in meters.
 */
function outsideDeck(x: number, z: number, half: number): number {
  return Math.hypot(Math.max(0, Math.abs(x) - half), Math.max(0, Math.abs(z) - half));
}

/**
 * Gives the smooth step of a value between two edges: 0 below the first, 1 above the second.
 *
 * @param edges The two edges.
 * @param value The value.
 * @returns The step, from 0 to 1.
 */
function smoothstep(edges: readonly [number, number], value: number): number {
  const t = Math.min(1, Math.max(0, (value - edges[0]) / (edges[1] - edges[0])));
  return t * t * (3 - 2 * t);
}

/**
 * Calculates the baked color of a face from its albedo (design 4.1).
 *
 * @param input The inputs of the build.
 * @param albedo The linear albedo.
 * @param face The center and the unit normal of the face, and its kind.
 * @param lamps The centers of the lantern glass.
 * @returns The baked linear color.
 */
function bakeFace(
  input: ForestInputs,
  albedo: Rgb,
  face: { readonly center: Vec3; readonly normal: Vec3; readonly kind: number },
  lamps: readonly Vec3[],
): Rgb {
  const b = input.bake;
  const { center, normal, kind } = face;
  if (kind === GLOW) {
    return [albedo[0] * b.glass[0], albedo[1] * b.glass[1], albedo[2] * b.glass[2]];
  }

  const sun = sunDirection(input.sun);
  const up = 0.5 + 0.5 * normal[1];
  const light: [number, number, number] = [0, 0, 0];
  const add = (color: Rgb, share: number): void => {
    light[0] += color[0] * share;
    light[1] += color[1] * share;
    light[2] += color[2] * share;
  };
  const height = center[1] - input.floorY;
  const half = input.stageSide / 2;
  const c = b.canopy;
  // The leaves keep their light under the canopy, because the low sun shines through them.
  const far =
    kind === FOLIAGE ? 0 : smoothstep(c.distance, outsideDeck(center[0], center[2], half));
  const cover = 1 - c.shade * far * (1 - smoothstep(c.height, height));
  add(b.sky, up * cover);
  add(b.ground, 1 - up);

  const [floor, full] = b.sunShade;
  const open = (floor + (1 - floor) * Math.min(1, Math.max(0, height / full))) * cover;
  const facing = normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2];
  add(b.sun, open * Math.max(0, facing));
  if (kind === FOLIAGE) {
    add(b.leafGlow, open * Math.max(0, -facing));
  }

  const k = b.key.direction;
  const keyLength = Math.hypot(...k) || 1;
  add(
    b.key.light,
    Math.max(0, (normal[0] * k[0] + normal[1] * k[1] + normal[2] * k[2]) / keyLength),
  );

  const edge = outsideDeck(center[0], center[2], half) / b.deck.reach;
  const toStage = Math.hypot(center[0], center[2]) || 1;
  const deckFacing = 0.5 + 0.5 * (-(normal[0] * center[0] + normal[2] * center[2]) / toStage);
  add(b.deck.light, deckFacing / (1 + edge * edge));

  for (const lamp of lamps) {
    const dx = lamp[0] - center[0];
    const dy = lamp[1] - center[1];
    const dz = lamp[2] - center[2];
    const distance = Math.hypot(dx, dy, dz) || 1;
    const d = distance / b.lantern.reach;
    const facingLamp = (normal[0] * dx + normal[1] * dy + normal[2] * dz) / distance;
    add(b.lantern.light, (0.4 + 0.6 * Math.max(0, facingLamp)) / (1 + d * d));
  }

  const color: Rgb = [albedo[0] * light[0], albedo[1] * light[1], albedo[2] * light[2]];
  if (kind === WATER) {
    return [
      color[0] + albedo[0] * b.water[0],
      color[1] + albedo[1] * b.water[1],
      color[2] + albedo[2] * b.water[2],
    ];
  }
  return color;
}

/**
 * Mixes a baked color toward the haze of the far forest, which glows toward the sun.
 *
 * @param input The inputs of the build.
 * @param color The baked color.
 * @param center A point of the face.
 * @returns The color with the haze.
 */
function addHaze(input: ForestInputs, color: Rgb, center: Vec3): Rgb {
  const h = input.bake.haze;
  const beyond = outsideDeck(center[0], center[2], input.stageSide / 2) - h.start;
  if (beyond <= 0) {
    return color;
  }

  const amount = 1 - Math.exp(-beyond / h.reach);
  const angle = Math.atan2(center[0], center[2]);
  const toward = Math.max(0, Math.cos(angle - input.sun.azimuth)) ** h.power;
  const haze: Rgb = [
    h.away[0] + (h.toward[0] - h.away[0]) * toward,
    h.away[1] + (h.toward[1] - h.away[1]) * toward,
    h.away[2] + (h.toward[2] - h.away[2]) * toward,
  ];
  return [
    color[0] + (haze[0] - color[0]) * amount,
    color[1] + (haze[1] - color[1]) * amount,
    color[2] + (haze[2] - color[2]) * amount,
  ];
}

/**
 * Turns the corners of one triangle of a part to its place.
 *
 * @param copy The placed copy.
 * @param t The triangle.
 * @param out Nine numbers: the three corners in meters.
 */
function placeTriangle(copy: Copy, t: number, out: number[]): void {
  const cos = Math.cos(copy.yaw);
  const sin = Math.sin(copy.yaw);
  const p = copy.part.positions;
  const [x, y, z] = copy.position;
  for (let k = 0; k < 3; k++) {
    const i = t * 9 + k * 3;
    const px = (p[i] ?? 0) * copy.scale;
    const py = (p[i + 1] ?? 0) * copy.scale;
    const pz = (p[i + 2] ?? 0) * copy.scale;
    out[k * 3] = x + px * cos + pz * sin;
    out[k * 3 + 1] = y + py;
    out[k * 3 + 2] = z + pz * cos - px * sin;
  }
}

/** The center and the unit normal of a triangle. */
interface Face {
  /** The center, in meters. */
  readonly center: Vec3;
  /** The unit normal, on the side from which the corners go counterclockwise. */
  readonly normal: Vec3;
}

/**
 * Gives the center and the unit normal of a triangle, counterclockwise from its front.
 *
 * @param c Nine numbers: the three corners.
 * @returns The center and the normal.
 */
function faceOf(c: readonly number[]): Face {
  const [ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cx = 0, cy = 0, cz = 0] = c;
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return {
    center: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
    normal: [nx / length, ny / length, nz / length],
  };
}

/**
 * Places the far trees in rings around the stage, with seeded places, turns, and sizes.
 *
 * @param input The inputs of the build.
 * @param parts The parts by name.
 * @returns The copies.
 */
function farCopies(input: ForestInputs, parts: ReadonlyMap<string, ForestPart>): Copy[] {
  const copies: Copy[] = [];
  const half = input.stageSide / 2;
  for (const [r, ring] of input.far.rings.entries()) {
    for (let i = 0; i < ring.count; i++) {
      const salt = 900 + r * 10;
      const name = input.far.parts[(i + r) % input.far.parts.length] ?? '';
      const part = parts.get(name);
      if (!part) {
        continue;
      }
      const angle = ((i + 0.15 + 0.7 * input.hash(i, salt)) / ring.count) * 2 * Math.PI;
      const [near, far] = ring.distance;
      const distance = half + near + (far - near) * input.hash(i, salt + 1);
      // A square stage: the ring follows the deck edge plus the distance, with round corners.
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const [low, high] = ring.scale;
      copies.push({
        part,
        position: [x, input.floorY, z],
        yaw: input.hash(i, salt + 2) * 2 * Math.PI,
        scale: low + (high - low) * input.hash(i, salt + 3),
        group: 0,
      });
    }
  }
  return copies;
}

/**
 * Gives each copy its cut group (design 4.1): a low or a wide part keeps group 0, and a part
 * near the anchor of a tall part before it joins its group.
 *
 * @param copies The copies. The call sets their groups.
 * @param input The inputs of the build.
 * @returns The anchor of each group, from group 1.
 */
function groupCopies(copies: readonly Copy[], input: ForestInputs): [number, number][] {
  const anchors: [number, number][] = [[0, 0]];
  for (const copy of copies) {
    const { positions } = copy.part;
    let top = -Infinity;
    let reach = 0;
    for (let i = 0; i < positions.length; i += 3) {
      top = Math.max(top, positions[i + 1] ?? 0);
      reach = Math.max(reach, Math.hypot(positions[i] ?? 0, positions[i + 2] ?? 0));
    }
    const height = copy.position[1] + top * copy.scale - input.floorY;
    if (height <= input.cut.low || reach * copy.scale >= input.cut.wide) {
      copy.group = 0;
      continue;
    }

    const [x, , z] = copy.position;
    const near = anchors.findIndex(
      ([ax, az], g) => g > 0 && Math.hypot(ax - x, az - z) <= input.cut.join,
    );
    if (near > 0) {
      copy.group = near;
    } else {
      copy.group = anchors.length;
      anchors.push([x, z]);
    }
  }
  return anchors;
}

/** The plan box of the points of one band of a group, and then the radius around its middle. */
interface BandBox {
  /** The least x. */
  minX: number;
  /** The largest x. */
  maxX: number;
  /** The least z. */
  minZ: number;
  /** The largest z. */
  maxZ: number;
  /** The least height. */
  minY: number;
  /** The largest height. */
  maxY: number;
  /** The largest distance of a point from the middle of the box, after the second pass. */
  radius: number;
}

/**
 * Adds the corners of a triangle to the bands of its part: the first pass grows the box of each
 * cell of a band, and the second pass grows the radius around the middle of the box.
 *
 * @param bands The boxes of the cells of the bands of the part, by a key of the band and the
 *   cell. The call adds to them.
 * @param corners Nine numbers: the three corners.
 * @param rule The height of a band, the side of a cell, and the floor.
 * @param second False for the first pass, true for the second.
 */
function addToBands(
  bands: Map<number, BandBox>,
  corners: readonly number[],
  rule: { readonly band: number; readonly cell: number; readonly floorY: number },
  second: boolean,
): void {
  for (let k = 0; k < 3; k++) {
    const x = corners[k * 3] ?? 0;
    const y = corners[k * 3 + 1] ?? 0;
    const z = corners[k * 3 + 2] ?? 0;
    const band = Math.max(0, Math.floor((y - rule.floorY) / rule.band));
    const cx = Math.floor(x / rule.cell) + 500;
    const cz = Math.floor(z / rule.cell) + 500;
    const index = (band * 1000 + cx) * 1000 + cz;
    let box = bands.get(index);
    if (!box) {
      box = { minX: x, maxX: x, minZ: z, maxZ: z, minY: y, maxY: y, radius: 0 };
      bands.set(index, box);
    }
    if (second) {
      const mx = (box.minX + box.maxX) / 2;
      const mz = (box.minZ + box.maxZ) / 2;
      box.radius = Math.max(box.radius, Math.hypot(x - mx, z - mz));
    } else {
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minZ = Math.min(box.minZ, z);
      box.maxZ = Math.max(box.maxZ, z);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
  }
}

/**
 * Makes the bands of the band boxes of a placed part.
 *
 * @param boxes The boxes of the bands, by the band index.
 * @returns The bands, from the ground up, each from its lowest to its highest point.
 */
function bandsOf(boxes: ReadonlyMap<number, BandBox>): CutBand[] {
  return [...boxes.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([, box]): CutBand => {
      const x = (box.minX + box.maxX) / 2;
      const z = (box.minZ + box.maxZ) / 2;
      return [box.minY, box.maxY, x, z, box.radius];
    });
}

/**
 * Gives one upright cylinder around bands.
 *
 * @param bands The bands.
 * @returns The cylinder, or null for no band.
 */
function boundsOf(bands: readonly CutBand[]): CutBand | null {
  if (bands.length === 0) {
    return null;
  }
  const minX = Math.min(...bands.map((b) => b[2] - b[4]));
  const maxX = Math.max(...bands.map((b) => b[2] + b[4]));
  const minZ = Math.min(...bands.map((b) => b[3] - b[4]));
  const maxZ = Math.max(...bands.map((b) => b[3] + b[4]));
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const radius = Math.max(...bands.map((b) => Math.hypot(b[2] - x, b[3] - z) + b[4]));
  const bottom = Math.min(...bands.map((b) => b[0]));
  const top = Math.max(...bands.map((b) => b[1]));
  return [bottom, top, x, z, radius];
}

/**
 * Adds a rope of the light string: a thin tube with three sides along its points.
 *
 * @param out The triangles.
 * @param points The points of the rope.
 * @param color The baked color.
 * @param group The cut group of the rope.
 */
function addRope(out: ArrayBuilder, points: readonly Vec3[], color: Rgb, group: number): void {
  const r = FOREST_ROPE.radius;
  const sides = 3;
  const ring = (p: Vec3, i: number): Vec3 => {
    const angle = (i / sides) * 2 * Math.PI;
    return [p[0], p[1] + r * Math.cos(angle), p[2] + r * Math.sin(angle)];
  };
  for (let s = 0; s + 1 < points.length; s++) {
    const a = points[s];
    const b = points[s + 1];
    if (!a || !b) {
      continue;
    }
    for (let i = 0; i < sides; i++) {
      const corners = [...ring(a, i), ...ring(b, i), ...ring(b, i + 1)];
      out.add(corners, color, group);
      out.add([...ring(a, i), ...ring(b, i + 1), ...ring(a, i + 1)], color, group);
    }
  }
}

/**
 * Adds the backdrop: a ring of tree tops far behind the far trees, with faces that point to the
 * stage, so that no view sees the edge of the ground. Each segment is a cut group.
 *
 * @param out The triangles.
 * @param input The inputs of the build.
 * @param groups The cut groups. The call adds one group for each segment.
 */
function addBackdrop(out: ArrayBuilder, input: ForestInputs, groups: CutGroup[]): void {
  const b = input.far.backdrop;
  const radius = input.stageSide / 2 + b.distance;
  const y0 = input.floorY;
  const [low, high] = b.height;
  const point = (angle: number, y: number): Vec3 => [
    radius * Math.sin(angle),
    y,
    radius * Math.cos(angle),
  ];
  const shaded = (p: Vec3): Rgb => {
    const share = Math.min(1, Math.max(0, (p[1] - y0) / high));
    const base: Rgb = [b.color[0] * share, b.color[1] * share, b.color[2] * share];
    return addHaze(input, base, p);
  };
  for (let i = 0; i < b.segments; i++) {
    const a0 = (i / b.segments) * 2 * Math.PI;
    const a1 = ((i + 1) / b.segments) * 2 * Math.PI;
    const mid = (a0 + a1) / 2;
    const shoulder = low + (high - low) * 0.4 * input.hash(i, 950);
    const tip = low + (high - low) * (0.5 + 0.5 * input.hash(i, 951));
    const group = groups.length;
    const width = radius * (a1 - a0);
    const [ax, , az] = point(mid, 0);
    const band: CutBand = [y0, y0 + tip, ax, az, width];
    groups.push({ bands: [band], bounds: band, ends: null });
    // The faces point to the ring center: counterclockwise seen from inside.
    const c0 = point(a1, y0);
    const c1 = point(a0, y0);
    const c2 = point(a0, y0 + shoulder);
    const c3 = point(a1, y0 + shoulder);
    out.addShaded([c0, c1, c2], [shaded(c0), shaded(c1), shaded(c2)], group);
    out.addShaded([c0, c2, c3], [shaded(c0), shaded(c2), shaded(c3)], group);
    const top = point(mid, y0 + tip);
    out.addShaded([c3, c2, top], [shaded(c3), shaded(c2), shaded(top)], group);
  }
}

/**
 * Adds the flat ground outside the ground of the kit, out to the far radius, in the color of
 * the haze.
 *
 * @param out The triangles.
 * @param input The inputs of the build.
 * @param inner The radius of the ground of the kit, in meters.
 */
function addFarGround(out: ArrayBuilder, input: ForestInputs, inner: number): void {
  const segments = 48;
  const rings = [inner - 1, inner + 10, inner + 30, input.far.groundRadius];
  const y = input.floorY + 0.02;
  const color = (p: Vec3): Rgb => addHaze(input, input.far.groundColor, p);
  for (let r = 0; r + 1 < rings.length; r++) {
    const r0 = rings[r] ?? 0;
    const r1 = rings[r + 1] ?? 0;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * 2 * Math.PI;
      const a1 = ((i + 1) / segments) * 2 * Math.PI;
      const p = (radius: number, angle: number): Vec3 => [
        radius * Math.sin(angle),
        y,
        radius * Math.cos(angle),
      ];
      // Faces that look up: counterclockwise seen from above.
      const [a, b, c, d] = [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)];
      out.addShaded([a, b, c], [color(a), color(b), color(c)], 0);
      out.addShaded([a, c, d], [color(a), color(c), color(d)], 0);
    }
  }
}

/**
 * Builds the forest of one stage in steps (design 4.1, 7.2): each placed part of the kit and
 * each far tree with its baked light, the ropes, the backdrop, the far ground, the lamps, and
 * the cut groups.
 *
 * @param input The inputs of the build.
 * @returns The steps, which return the forest.
 */
export function* buildForestSteps(input: ForestInputs): Steps<ForestBuild> {
  const byName = new Map(input.parts.map((part) => [part.name, part]));
  const copyOf = (placement: ForestPlacement): Copy | null => {
    const part = byName.get(placement.part);
    return part ? { ...placement, part, group: 0 } : null;
  };
  const kitCopies = input.layout.placements.map(copyOf);
  const copies = [...kitCopies, ...farCopies(input, byName)].filter((c): c is Copy => c !== null);
  const anchors = groupCopies(copies, input);

  // The ropes and their lanterns drop with either tree of the rope. Their groups follow the
  // groups of the anchors.
  const ropeEnds = input.layout.ropes.map((rope): [number, number] => {
    const [a = 0, b = 0] = rope.trees.map((tree) => kitCopies[tree]?.group ?? 0);
    return [a, b];
  });
  const ropeCopies: Copy[] = [];
  for (const [r, rope] of input.layout.ropes.entries()) {
    const ropeGroup = anchors.length + r;
    for (const lantern of rope.lanterns) {
      const copy = copyOf(lantern);
      if (copy) {
        copy.group = ropeGroup;
        ropeCopies.push(copy);
      }
    }
  }
  yield;

  // The glass of each lantern is the light of the bake and the place of a glow.
  const lamps: ForestLamp[] = [];
  const corners: number[] = Array.from({ length: 9 }, () => 0);
  for (const copy of [...copies, ...ropeCopies]) {
    const sum: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let t = 0; t < copy.part.kinds.length; t++) {
      if (copy.part.kinds[t] === GLOW) {
        placeTriangle(copy, t, corners);
        const { center } = faceOf(corners);
        sum[0] += center[0];
        sum[1] += center[1];
        sum[2] += center[2];
        count++;
      }
    }
    if (count > 0) {
      lamps.push({ center: [sum[0] / count, sum[1] / count, sum[2] / count], cut: copy.group });
    }
  }
  const lampCenters = lamps.map((lamp) => lamp.center);

  const solid = new ArrayBuilder();
  const foliage = new ArrayBuilder();
  // Each placed part has its own bands, so that the bands of a bough or a lantern on a branch
  // stand at the bough and not around the trunk.
  const bands = copies.map(() => new Map<number, BandBox>());
  const rule = { band: input.cut.band, cell: input.cut.cell, floorY: input.floorY };
  let triangles = 0;
  let work = 0;
  for (const [c, copy] of [...copies, ...ropeCopies].entries()) {
    const { part } = copy;
    const groupBands = copy.group > 0 && c < copies.length ? bands[c] : undefined;
    for (let t = 0; t < part.kinds.length; t++) {
      placeTriangle(copy, t, corners);
      const kind = part.kinds[t] ?? 0;
      const face = faceOf(corners);
      const i = t * 9;
      const albedo: Rgb = [part.colors[i] ?? 0, part.colors[i + 1] ?? 0, part.colors[i + 2] ?? 0];
      const color = addHaze(
        input,
        bakeFace(input, albedo, { ...face, kind }, lampCenters),
        face.center,
      );
      (kind === FOLIAGE ? foliage : solid).add(corners, color, copy.group);
      if (groupBands) {
        addToBands(groupBands, corners, rule, false);
      }
    }
    triangles += part.kinds.length;
    work += part.kinds.length;
    if (work > 3000) {
      work = 0;
      yield;
    }
  }

  // The second pass of the bands: the radius around the middle of each box.
  const groupBands = anchors.map((): CutBand[] => []);
  for (const [c, copy] of copies.entries()) {
    const boxes = bands[c];
    if (copy.group === 0 || !boxes) {
      continue;
    }
    for (let t = 0; t < copy.part.kinds.length; t++) {
      placeTriangle(copy, t, corners);
      addToBands(boxes, corners, rule, true);
    }
    groupBands[copy.group]?.push(...bandsOf(boxes));
    work += copy.part.kinds.length;
    if (work > 6000) {
      work = 0;
      yield;
    }
  }
  yield;

  const groups: CutGroup[] = groupBands.map((list) => ({
    bands: list,
    bounds: boundsOf(list),
    ends: null,
  }));
  const ropeColor = bakeFace(
    input,
    input.srgb(FOREST_ROPE.color),
    { center: [0, 4, 0], normal: [0, 1, 0], kind: 0 },
    [],
  );
  for (const [r, rope] of input.layout.ropes.entries()) {
    groups.push({ bands: [], bounds: null, ends: ropeEnds[r] ?? [0, 0] });
    addRope(solid, rope.points, ropeColor, groups.length - 1);
  }
  yield;

  addBackdrop(solid, input, groups);
  const groundPositions = byName.get('ground')?.positions ?? new Float32Array();
  let groundRadius = 0;
  for (let i = 0; i < groundPositions.length; i += 3) {
    groundRadius = Math.max(
      groundRadius,
      Math.hypot(groundPositions[i] ?? 0, groundPositions[i + 2] ?? 0),
    );
  }
  addFarGround(solid, input, groundRadius);
  triangles += input.far.backdrop.segments * 3 + 48 * 6;
  return { solid: solid.build(), foliage: foliage.build(), lamps, groups, triangles };
}
