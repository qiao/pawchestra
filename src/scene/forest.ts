import type * as Three from 'three';
import type { Group, Mesh, Scene, Vector3 } from 'three';

import type { PropColors } from '../models/colors.ts';
import type { Rgb, srgb } from '../models/mesh.ts';
import type { StageColors } from '../models/props.ts';
import type { plankHash } from '../models/stage.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { VenueLight } from './lights.ts';
import type { VenuePost } from './post.ts';
import type { StageFinish, SideGlow } from './stage.ts';
import type {
  Lamp,
  TriangleList,
  addLamp,
  bakedGeometry,
  createGlows,
  cutawayMaterial,
  ringCutaway,
  setCutaway,
} from './surroundings.ts';
import type { Venue } from './venue.ts';

/**
 * The runtime parts of the first download that the forest uses (design 7.2). This chunk imports
 * no module of the first download, and `venue.ts` gives it the kit. A module that both import
 * went into a common chunk, which grew the first download by 4.2 kB after gzip, because the top-
 * level await of `gallery/views-main.ts` turns off the chunk merge of Rolldown.
 */
export interface ForestKit {
  /** The classes of three.js. */
  readonly three: Pick<
    typeof Three,
    | 'BackSide'
    | 'BoxGeometry'
    | 'BufferAttribute'
    | 'BufferGeometry'
    | 'Color'
    | 'Group'
    | 'Mesh'
    | 'MeshBasicMaterial'
    | 'Scene'
    | 'SphereGeometry'
  >;
  /** `srgb()` of `models/mesh.ts`. */
  readonly srgb: typeof srgb;
  /** `plankHash()` of `models/stage.ts`: the seeded numbers of the trees. */
  readonly plankHash: typeof plankHash;
  /** The height of the floor around the stage, in meters: `-STAGE_THICKNESS`. */
  readonly floorY: number;
  /** `TriangleList` of `surroundings.ts`. */
  readonly TriangleList: typeof TriangleList;
  /** `addLamp()` of `surroundings.ts`. */
  readonly addLamp: typeof addLamp;
  /** `bakedGeometry()` of `surroundings.ts`. */
  readonly bakedGeometry: typeof bakedGeometry;
  /** `createGlows()` of `surroundings.ts`. */
  readonly createGlows: typeof createGlows;
  /** `cutawayMaterial()` of `surroundings.ts`. */
  readonly cutawayMaterial: typeof cutawayMaterial;
  /** `ringCutaway()` of `surroundings.ts`. */
  readonly ringCutaway: typeof ringCutaway;
  /** `setCutaway()` of `surroundings.ts`. */
  readonly setCutaway: typeof setCutaway;
}

/** The factor from degrees to radians. */
const DEGREES = Math.PI / 180;

/**
 * The surroundings of the forest (design 4.1): a stub that a later round replaces with the kit of
 * `assets/forest/`. The sizes are parts of the forest unit `u`, the stage side with a minimum, as
 * the hall unit. The colors are in sRGB, but the lights in linear values. They give the hue and
 * the lightness of the frame of `docs/reference/forest.webp`, because the surroundings take no
 * light.
 */
export const FOREST = {
  /** The smallest forest unit, in meters, so that a small stage still stands in a wide clearing. */
  minUnit: 9,
  /** The radius of the disc of forest earth around the stage. */
  groundRadius: 1.6,
  /**
   * The distance from the stage edge at which the light of the stage on the earth halves, in
   * stage sides.
   */
  groundReach: 0.25,
  /** The number of trees in the ring. */
  trees: 16,
  /** The smallest and the largest distance of a tree from the stage center. */
  ring: [0.95, 1.4],
  /** The smallest and the largest height of a tree. */
  height: [0.6, 0.95],
  /** The radius of a trunk at the ground, as a part of the height of its tree. */
  trunk: 0.045,
  /**
   * The canopy shapes of a tree: the height of the middle and the radius of each, as parts of the
   * height of the tree.
   */
  canopy: [
    [0.55, 0.3],
    [0.72, 0.24],
    [0.86, 0.17],
  ],
  /**
   * The gap in front of the default camera: no tree stands within this angle of the front (+z),
   * seen from the stage center, in radians.
   */
  frontGap: 55 * DEGREES,
  /** The cutaway angle: a camera outside the ring sees no tree within it of its own direction. */
  cutawayAngle: 55 * DEGREES,
  /** The ring of the far forest behind the trees: its radius and its height. */
  wall: { radius: 1.6, height: 1.1 },
  /**
   * The sun, seen from the stage center: the turn from the front (+z) toward the right (+x) and
   * the angle above the floor of its light, in radians. Its glow stands at the back right, low,
   * so that the default view shows it between the trees: its angle above the floor, and its
   * distance and its radius, in units. A glow wider than about 130 px did not draw on the
   * development Mac, so the radius stays small.
   */
  sun: {
    azimuth: 145 * DEGREES,
    elevation: 25 * DEGREES,
    glowElevation: 2 * DEGREES,
    distance: 1.5,
    glow: 0.1,
  },
  /** The lanterns on every second tree: the height above the floor and the size, in meters. */
  lantern: { height: 2.6, size: 0.14, glow: 0.55 },
  /** The colors, in sRGB, but the light of the sun and of a lantern in linear values. */
  colors: {
    groundNear: '#8a5428',
    groundFar: '#2a1e10',
    trunkShade: '#3e2010',
    trunkLit: '#7a4a24',
    canopyShade: '#363412',
    canopyLit: '#666022',
    canopyTop: '#a0a438',
    wallLow: '#1e1c0c',
    wallHigh: '#4a4a20',
    sun: [2.5, 1.7, 0.6],
    sunGlow: [2.4, 1.5, 0.5],
    lantern: [9, 5.2, 2.4],
    glow: [0.45, 0.2, 0.075],
  },
  /** The environment of the reflections: the sky, the horizon, and the earth in sRGB, and the sun. */
  environment: { sky: '#4a4220', horizon: '#2a2412', earth: '#1a1208', sun: [8, 5, 1.8] },
} as const;

/**
 * The light of the forest (design 4.1): a soft warm key from the front, a low golden sun behind
 * the stage as the rim light and the beam, and a green-gold fill. The back-row lights and the
 * light on the conductor start at the values of the hall.
 */
export const FOREST_LIGHT = {
  key: { color: '#ffcf98', aimToPodium: 0, angle: 19 * DEGREES, penumbra: 1, illuminance: 4.2 },
  side: {
    color: '#ffe0b4',
    position: [1.1, 1.4, 0.7],
    target: [-0.3, 0, 0.1],
    illuminance: 0.6,
    angle: 14 * DEGREES,
    penumbra: 0.5,
  },
  backRow: {
    position: [1.2, 1.0, 0.6],
    target: [-0.35, 0.15, -0.5],
    illuminance: 1.5,
    angle: 10 * DEGREES,
    penumbra: 0.5,
  },
  rim: { color: '#ffb866', illuminance: 6.5, angle: 16 * DEGREES, penumbra: 1 },
  beam: { color: '#ffc47a', strength: 6.2, moteStrength: 1 },
  fill: { sky: '#3a3a1c', ground: '#3a2814', intensity: 4.2 },
  conductor: {
    aimHeight: 1.2,
    forward: 3.2,
    up: 2.4,
    illuminance: 3,
    angle: 16 * DEGREES,
    penumbra: 0.6,
  },
} satisfies VenueLight;

/** The stage colors of a venue in sRGB, as the look override takes them. */
type StageHex = Readonly<Record<keyof StageColors, string>>;

/** The prop colors of a venue in sRGB, as the look override takes them. */
type PropHex = Readonly<Record<keyof PropColors, string>>;

/** The stage of the forest (design 4.1): a lighter, warmer, and matte wood, in sRGB. */
export const FOREST_STAGE = {
  colors: {
    plank: '#84461a',
    seam: '#6a3610',
    nosing: '#925424',
    skirt: '#4e2c14',
    groove: '#30190b',
    podium: '#7a4626',
    riserTread: '#94592a',
    riserNosing: '#b8783a',
    podiumPanel: '#663a1e',
    podiumTop: '#8e5630',
    podiumTopPanel: '#804c2a',
  },
  finish: {
    roughness: 0.78,
    grain: 0.2,
    grainRoughness: 0.1,
    specular: 0.2,
    plankRoughness: 0.15,
    plankGloss: 0.4,
    seamGloss: 0.35,
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
  },
  sideGlow: { skirt: 0.8, edge: 0.3, fade: 0.6 },
} satisfies { colors: StageHex; finish: StageFinish; sideGlow: SideGlow };

/** The props of the forest (design 4.1): chairs of a dark wood and black music stands, in sRGB. */
export const FOREST_PROPS = {
  chair: '#5a2a0e',
  stand: '#1e1a16',
  standDesk: '#544840',
  standEdge: '#a08b7a',
  sheet: '#ece6d6',
} satisfies PropHex;

/** The post effects of the forest (design 4.1): a warm, golden grade with dark corners. */
export const FOREST_POST = {
  look: {
    bloomThreshold: 1.6,
    bloomKnee: 0.5,
    bloomStrength: 0.18,
    diffusion: 0.025,
    halation: [1.2, 1.0, 0.7],
    vignette: 0.6,
    grain: 0.035,
  },
  haze: { density: 0.18, color: [0.06, 0.04, 0.015], forward: 0.65 },
  grade: {
    curve: [
      [0, 0],
      [31, 25],
      [62, 57],
      [110, 104],
      [139, 145],
      [172, 195],
      [210, 232],
      [255, 252],
    ],
    saturation: 1.08,
    vibrance: 0.4,
    shadowSaturation: 0.9,
    shadowTint: [0.008, 0.004, -0.01],
    highlightTint: [0.02, 0.008, -0.025],
  },
  clearColor: '#14100a',
} satisfies VenuePost;

/** The golden ratio, for the corners of an icosahedron. */
const PHI = (1 + Math.sqrt(5)) / 2;

/** The 12 corners of an icosahedron, before the scale to the unit sphere. */
const ICOSAHEDRON_CORNERS: readonly Vec3[] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];

/** The 20 faces of an icosahedron, counterclockwise from outside, as the corners of three.js. */
const ICOSAHEDRON_FACES: readonly Vec3[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/**
 * Gives the forest unit: the stage side, but at least {@link FOREST}.minUnit.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The unit `u`, in meters.
 */
function forestUnit(stageSide: number): number {
  return Math.max(stageSide, FOREST.minUnit);
}

/**
 * Gives the direction of the sun ({@link FOREST}.sun): a unit vector from the stage center.
 *
 * @returns The direction.
 */
function sunDirection(): Vec3 {
  const { azimuth, elevation } = FOREST.sun;
  return [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ];
}

/**
 * Gives the glow of the sun behind the trees: a large lamp glow in the direction of the sun.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The lamp of the glow.
 */
function sunGlow(stageSide: number): Lamp {
  const { azimuth, glowElevation, distance, glow } = FOREST.sun;
  const unit = forestUnit(stageSide);
  const flat = distance * unit * Math.cos(glowElevation);
  const center: Vec3 = [
    flat * Math.sin(azimuth),
    distance * unit * Math.sin(glowElevation),
    flat * Math.cos(azimuth),
  ];
  return { center, glow: glow * unit };
}

/**
 * Mixes two linear colors.
 *
 * @param a The color at 0.
 * @param b The color at 1.
 * @param t The share of `b`, from 0 to 1.
 * @returns The mix.
 */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Gives the unit normal of a triangle with its corners counterclockwise from its front.
 *
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @returns The normal.
 */
function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

/**
 * Gives the share of the sun on a face: 0 in the shade, 1 on a face that looks at the sun.
 *
 * @param normal The unit normal of the face.
 * @returns The share.
 */
function sunShare(normal: Vec3): number {
  const [x, y, z] = sunDirection();
  return Math.max(0, normal[0] * x + normal[1] * y + normal[2] * z);
}

/**
 * Adds the trunk of a tree: a prism with six sides that narrows to its top. The sides that look
 * at the sun get the lit color.
 *
 * @param kit The runtime parts of the first download.
 * @param list The triangles.
 * @param foot The foot of the trunk on the floor.
 * @param size The radius at the foot and the height, in meters.
 */
function addTrunk(
  kit: ForestKit,
  list: TriangleList,
  foot: Vec3,
  size: readonly [radius: number, height: number],
): void {
  const shade = kit.srgb(FOREST.colors.trunkShade);
  const lit = kit.srgb(FOREST.colors.trunkLit);
  const [radius, height] = size;
  const [x, y, z] = foot;
  const corner = (i: number, top: boolean): Vec3 => {
    const angle = (i / 6) * Math.PI * 2;
    const r = top ? radius * 0.6 : radius;
    return [x + r * Math.sin(angle), y + (top ? height : 0), z + r * Math.cos(angle)];
  };
  for (let i = 0; i < 6; i++) {
    const a = corner(i, false);
    const b = corner(i + 1, false);
    const d = corner(i, true);
    const e = corner(i + 1, true);
    const color = mix(shade, lit, sunShare(normalOf(a, b, e)));
    list.add([a, b, e], [color, color, color], [x, z]);
    list.add([a, e, d], [color, color, color], [x, z]);
  }
}

/**
 * Adds one canopy shape of a tree: a faceted icosahedron, a little flat. The faces that look at
 * the sun get the lit color, and the lit faces that look up get the yellow-green of the lit tops.
 *
 * @param kit The runtime parts of the first download.
 * @param list The triangles.
 * @param center The middle of the shape.
 * @param radius The radius, in meters.
 * @param anchor The anchor of the tree on the floor.
 */
function addCanopy(
  kit: ForestKit,
  list: TriangleList,
  center: Vec3,
  radius: number,
  anchor: readonly [number, number],
): void {
  const c = FOREST.colors;
  const shade = kit.srgb(c.canopyShade);
  const lit = kit.srgb(c.canopyLit);
  const top = kit.srgb(c.canopyTop);
  const scale = radius / Math.hypot(1, PHI);
  const corner = (i: number): Vec3 => {
    const [x, y, z] = ICOSAHEDRON_CORNERS[i] ?? [0, 0, 0];
    return [center[0] + x * scale, center[1] + y * scale * 0.85, center[2] + z * scale];
  };
  for (const [i, j, k] of ICOSAHEDRON_FACES) {
    const a = corner(i);
    const b = corner(j);
    const d = corner(k);
    const normal = normalOf(a, b, d);
    const sun = sunShare(normal);
    const color = mix(mix(shade, lit, sun), top, sun * Math.max(0, normal[1]));
    list.add([a, b, d], [color, color, color], anchor);
  }
}

/** The trees, the lanterns, and the far forest of a stage. */
interface ForestData {
  /** The trunks and the canopies. */
  readonly trees: TriangleList;
  /** The ring of the far forest. */
  readonly wall: TriangleList;
  /** The small bright bodies of the lanterns. */
  readonly lanterns: TriangleList;
  /** Each lantern, for its glow. */
  readonly lamps: readonly Lamp[];
}

/**
 * Builds the trees and the lanterns around a stage (design 4.1): a ring of trees with a gap in
 * front of the default camera, and a lantern on every second tree, on the side of the stage.
 *
 * @param kit The runtime parts of the first download.
 * @param stageSide The stage side `S`, in meters.
 * @returns The triangles and the lamps.
 */
function buildForest(kit: ForestKit, stageSide: number): ForestData {
  const unit = forestUnit(stageSide);
  const trees = new kit.TriangleList();
  const lanterns = new kit.TriangleList();
  const lamps: Lamp[] = [];
  const f = FOREST;
  const span = 2 * Math.PI - 2 * f.frontGap;
  for (let i = 0; i < f.trees; i++) {
    const angle = f.frontGap + ((i + 0.2 + 0.6 * kit.plankHash(i, 401)) / f.trees) * span;
    const radius = (f.ring[0] + (f.ring[1] - f.ring[0]) * kit.plankHash(i, 402)) * unit;
    const height = (f.height[0] + (f.height[1] - f.height[0]) * kit.plankHash(i, 403)) * unit;
    const foot: Vec3 = [radius * Math.sin(angle), kit.floorY, radius * Math.cos(angle)];
    const anchor: [number, number] = [foot[0], foot[2]];
    addTrunk(kit, trees, foot, [f.trunk * height, f.canopy[0][0] * height]);
    for (const [k, [middle, size]] of f.canopy.entries()) {
      const shift = (kit.plankHash(i, 410 + k) - 0.5) * size * height * 0.5;
      const center: Vec3 = [foot[0] + shift, kit.floorY + middle * height, foot[2] - shift];
      addCanopy(kit, trees, center, size * height, anchor);
    }
    if (i % 2 === 0) {
      const inward = 1 - (f.trunk * height + f.lantern.size * 2) / radius;
      const center: Vec3 = [foot[0] * inward, kit.floorY + f.lantern.height, foot[2] * inward];
      lamps.push({ center, glow: f.lantern.glow });
      kit.addLamp(lanterns, center, f.lantern.size / 2, f.colors.lantern);
    }
  }
  return { trees, wall: buildWall(kit, unit), lanterns, lamps };
}

/**
 * Builds the ring of the far forest: faces that point to the stage, dark at the floor and lighter
 * at the top, with the glow of the sun at the back right.
 *
 * @param kit The runtime parts of the first download.
 * @param unit The forest unit `u`, in meters.
 * @returns The triangles.
 */
function buildWall(kit: ForestKit, unit: number): TriangleList {
  const f = FOREST;
  const wall = new kit.TriangleList();
  const radius = f.wall.radius * unit;
  const top = f.wall.height * unit;
  const low = kit.srgb(f.colors.wallLow);
  const high = kit.srgb(f.colors.wallHigh);
  const segments = 36;
  const point = (i: number, share: number): Vec3 => {
    const angle = (i / segments) * Math.PI * 2;
    return [radius * Math.sin(angle), kit.floorY + share * top, radius * Math.cos(angle)];
  };
  const color = (i: number, share: number): Rgb => {
    const angle = (i / segments) * Math.PI * 2;
    const sun = Math.max(0, Math.cos(angle - f.sun.azimuth)) ** 4 * share;
    const base = mix(low, high, share);
    return [
      base[0] + f.colors.sun[0] * sun,
      base[1] + f.colors.sun[1] * sun,
      base[2] + f.colors.sun[2] * sun,
    ];
  };
  const bands = [0, 0.35, 0.7, 1];
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k + 1 < bands.length; k++) {
      const s0 = bands[k] ?? 0;
      const s1 = bands[k + 1] ?? 1;
      // The face points to the ring center: counterclockwise seen from inside.
      const a = point(i + 1, s0);
      const b = point(i, s0);
      const c = point(i, s1);
      const d = point(i + 1, s1);
      const anchor: [number, number] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
      const [ca, cb, cc, cd] = [color(i + 1, s0), color(i, s0), color(i, s1), color(i + 1, s1)];
      wall.add([a, b, c], [ca, cb, cc], anchor);
      wall.add([a, c, d], [ca, cc, cd], anchor);
    }
  }
  return wall;
}

/**
 * Creates the disc of forest earth around a stage: the light of the stage on the earth near its
 * edge, and the dark earth far from it, baked into the colors of the vertices.
 *
 * @param kit The runtime parts of the first download.
 * @param stageSide The stage side `S`, in meters.
 * @returns The mesh. It takes no light, and no cutaway.
 */
function createGround(kit: ForestKit, stageSide: number): Mesh {
  const f = FOREST;
  const { BufferAttribute: Attribute, BufferGeometry: Geometry } = kit.three;
  const radius = f.groundRadius * forestUnit(stageSide);
  const near = kit.srgb(f.colors.groundNear);
  const far = kit.srgb(f.colors.groundFar);
  const rings = 24;
  const segments = 48;
  const positions: number[] = [];
  const colors: number[] = [];
  const vertex = (ring: number, i: number): void => {
    const r = (ring / rings) * radius;
    const angle = (i / segments) * Math.PI * 2;
    const x = r * Math.sin(angle);
    const z = r * Math.cos(angle);
    const outside = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - stageSide / 2);
    const d = outside / (f.groundReach * stageSide);
    positions.push(x, kit.floorY, z);
    colors.push(...mix(far, near, 1 / (1 + d * d)));
  };
  for (let ring = 0; ring < rings; ring++) {
    for (let i = 0; i < segments; i++) {
      // Two triangles that face up: counterclockwise seen from above.
      vertex(ring, i);
      vertex(ring + 1, i);
      vertex(ring + 1, i + 1);
      vertex(ring, i);
      vertex(ring + 1, i + 1);
      vertex(ring, i + 1);
    }
  }
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new Attribute(new Float32Array(colors), 3));
  return new kit.three.Mesh(geometry, new kit.three.MeshBasicMaterial({ vertexColors: true }));
}

/**
 * Builds the scene of the environment of the forest: a sphere with the sky, the horizon, and the
 * earth, seen from inside, and the sun at the back right.
 *
 * @param kit The runtime parts of the first download.
 * @returns The scene.
 */
function forestEnvironment(kit: ForestKit): Scene {
  const e = FOREST.environment;
  const { three } = kit;
  const sphere = new three.SphereGeometry(20, 16, 8);
  const sky = kit.srgb(e.sky);
  const horizon = kit.srgb(e.horizon);
  const earth = kit.srgb(e.earth);
  const position = sphere.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const up = position.getY(i) / 20;
    colors.set(up > 0 ? mix(horizon, sky, up) : mix(horizon, earth, -up), i * 3);
  }
  sphere.setAttribute('color', new three.BufferAttribute(colors, 3));
  const scene = new three.Scene();
  const material = new three.MeshBasicMaterial({ vertexColors: true, side: three.BackSide });
  scene.add(new three.Mesh(sphere, material));
  const sun = new three.Mesh(
    new three.BoxGeometry(4, 4, 4),
    new three.MeshBasicMaterial({ color: new three.Color().setRGB(...e.sun) }),
  );
  const [x, y, z] = sunDirection();
  sun.position.set(16 * x, 16 * y, 16 * z);
  scene.add(sun);
  return scene;
}

/**
 * Gives the linear values of colors in sRGB.
 *
 * @param kit The runtime parts of the first download.
 * @param colors The colors, as CSS hex colors.
 * @returns The linear colors with the same keys.
 */
function linearColors<K extends string>(
  kit: ForestKit,
  colors: Readonly<Record<K, string>>,
): Record<K, Rgb> {
  const entries = Object.entries<string>(colors).map(([key, hex]) => [key, kit.srgb(hex)]);
  // SAFETY: the entries have the keys of `colors`.
  return Object.fromEntries(entries) as Record<K, Rgb>;
}

/**
 * Makes the forest clearing (design 4.1): a stub of the surroundings, the light, the stage finish,
 * the prop colors, and the grade. It reads the values of {@link FOREST_STAGE} and
 * {@link FOREST_PROPS} at the call, after the look override of the dev server.
 *
 * @param kit The runtime parts of the first download.
 * @returns The venue.
 */
export function forestVenue(kit: ForestKit): Venue {
  return {
    id: 'forest',
    *surroundingsSteps(stageSide) {
      const ground = createGround(kit, stageSide);
      yield;
      const data = buildForest(kit, stageSide);
      yield;
      const group = new kit.three.Group().add(ground);
      for (const list of [data.wall, data.trees, data.lanterns]) {
        group.add(new kit.three.Mesh(kit.bakedGeometry(list.build()), kit.cutawayMaterial(0)));
      }
      group.add(kit.createGlows(data.lamps, 0, FOREST.colors.glow));
      const sun = kit.createGlows([sunGlow(stageSide)], 0, FOREST.colors.sunGlow);
      // The glow of the sun shines through the canopy, so no tree hides it.
      if (!Array.isArray(sun.material)) {
        sun.material.depthTest = false;
      }
      group.add(sun);
      return group;
    },
    frameSurroundings(surroundings: Group, stageSide: number, camera: Vector3, pixels: number) {
      const radius = FOREST.ring[1] * forestUnit(stageSide);
      const cutaway = kit.ringCutaway(camera.toArray(), 0, radius, FOREST.cutawayAngle);
      kit.setCutaway(surroundings, cutaway, pixels);
    },
    environmentScene: () => forestEnvironment(kit),
    light: FOREST_LIGHT,
    stage: {
      colors: linearColors(kit, FOREST_STAGE.colors),
      finish: FOREST_STAGE.finish,
      sideGlow: FOREST_STAGE.sideGlow,
    },
    props: linearColors(kit, FOREST_PROPS),
    post: FOREST_POST,
  };
}
