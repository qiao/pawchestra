import type * as Three from 'three';
import type { Group, Scene, Vector3 } from 'three';

import type { PropColors } from '../models/colors.ts';
import type { KitReaders } from '../models/forest/kit.ts';
import { forestParts, placeForest } from '../models/forest/kit.ts';
import type { Rgb } from '../models/mesh.ts';
import type { StageColors } from '../models/props.ts';
import type { plankHash } from '../models/stage.ts';
import type { Vec3 } from '../models/tuples.ts';
import { buildForestSteps, sunDirection } from './forest-build.ts';
import type { CutGroup, ForestArrays, ForestBuild, ForestLamp, ForestSun } from './forest-build.ts';
import {
  FOREST_FRAGMENT,
  FOREST_VERTEX,
  GLOW_FRAGMENT,
  GLOW_VERTEX,
  cutPoints,
  keepGroups,
} from './forest-cut.ts';
import type { VenueLight } from './lights.ts';
import type { VenuePost } from './post.ts';
import type { StageFinish, SideGlow } from './stage.ts';
import type { Venue } from './venue.ts';

/**
 * The runtime parts of the first download that the forest uses (design 7.2). This chunk imports
 * no module of the first download, and `venue.ts` gives it the kit. A module that both import
 * went into a common chunk, which grew the first download by 4.2 kB after gzip, because the top-
 * level await of `gallery/views-main.ts` turns off the chunk merge of Rolldown.
 */
export interface ForestKit {
  /** The classes and the constants of three.js. */
  readonly three: Pick<
    typeof Three,
    | 'AdditiveBlending'
    | 'BackSide'
    | 'BoxGeometry'
    | 'BufferAttribute'
    | 'BufferGeometry'
    | 'Color'
    | 'DataTexture'
    | 'DoubleSide'
    | 'Group'
    | 'Mesh'
    | 'MeshBasicMaterial'
    | 'RedFormat'
    | 'Scene'
    | 'ShaderMaterial'
    | 'SphereGeometry'
  >;
  /** The byte readers of `models/packed-bytes.ts` and `srgb()` of `models/mesh.ts`. */
  readonly readers: KitReaders;
  /** `plankHash()` of `models/stage.ts`: the seeded numbers of the far trees. */
  readonly plankHash: typeof plankHash;
  /** The height of the floor around the stage, in meters: `-STAGE_THICKNESS`. */
  readonly floorY: number;
  /** The corner cut of the stage, as a part of its side: `STAGE_CORNER_CUT`. */
  readonly cornerCut: number;
}

/** The factor from degrees to radians. */
const DEGREES = Math.PI / 180;

/**
 * The surroundings of the forest (design 4.1): the kit of `assets/forest/` with baked light, the
 * far forest, the glows, and the cut. The lights and the colors are linear values. They give the
 * hue and the lightness of `docs/reference/forest.webp`, because the surroundings take no light.
 */
export const FOREST = {
  /**
   * The sun, seen from the stage center: the angle above the floor of the light of the bake, in
   * radians. The sun stands in the direction of the rim light ({@link forestSun}). Its glow
   * stands among the trees there, at a distance and a height in meters, with a radius in meters,
   * so that the default view shows it at its top right, as `forest.webp`. The glow shines
   * through the trees.
   */
  sun: {
    elevation: 25 * DEGREES,
    glowDistance: 12.5,
    glowHeight: 2.2,
    glow: 6.5,
  },
  /** The radius of the glow of a lantern, in meters. */
  lanternGlow: 0.5,
  /** The light of the middle of a glow, in linear values: a lantern and the sun. */
  glowLight: { lantern: [0.6, 0.24, 0.05], sun: [0.7, 0.45, 0.13] },
  /** The baked light of the faces (`ForestBake` of `forest-build.ts`). */
  bake: {
    sky: [0.32, 0.3, 0.14],
    ground: [0.14, 0.09, 0.04],
    sun: [2.2, 1.45, 0.55],
    sunShade: [0.5, 9],
    canopy: { distance: [1.5, 7], height: [2, 8], shade: 0.65 },
    leafGlow: [3, 3.2, 0.8],
    key: { light: [0.45, 0.32, 0.18], direction: [-0.3, 0.7, 1] },
    deck: { light: [0.7, 0.42, 0.18], reach: 2.5 },
    lantern: { light: [1.6, 0.8, 0.25], reach: 0.9 },
    glass: [3, 1.6, 0.8],
    water: [0.55, 0.55, 0.5],
    haze: {
      start: 10,
      reach: 22,
      away: [0.05, 0.05, 0.025],
      toward: [0.9, 0.62, 0.25],
      power: 3,
    },
  },
  /** The far forest around the kit (`FarForest` of `forest-build.ts`). */
  far: {
    rings: [
      { distance: [14, 20], count: 30, scale: [1, 1.35] },
      { distance: [21, 30], count: 40, scale: [1.2, 1.7] },
    ],
    parts: ['tree-far', 'conifer', 'tree-far'],
    backdrop: { distance: 36, height: [10, 24], segments: 64, color: [0.03, 0.035, 0.012] },
    groundRadius: 140,
    groundColor: [0.05, 0.035, 0.02],
  },
  /**
   * The cut of the parts between the camera and the stage (`CutRules` of `forest-build.ts`), and
   * the points of the stage that no part may hide (`CutSamples` of `forest-cut.ts`).
   */
  cut: {
    band: 1.5,
    cell: 2,
    low: 0.35,
    join: 0.6,
    wide: 8,
    samples: { share: 0.6, grid: 3, heights: [0.6, 1.6] },
  },
  /** The environment of the reflections: the sky, the horizon, and the earth in sRGB, and the sun. */
  environment: { sky: '#4a4220', horizon: '#2a2412', earth: '#1a1208', sun: [8, 5, 1.8] },
} as const;

/**
 * The light of the forest (design 4.1): a soft warm key from the front, a low golden sun at the
 * back right as the rim light and the beam, and a green-gold fill. The back-row lights and the
 * light on the conductor start at the values of the hall.
 *
 * The rim light stands lower than in the hall and turns to the right, so that the beam slants
 * from the top right toward the stage, as the light shafts of `forest.webp`. A lower or a more
 * turned place puts more cameras of the shot plans in the haze of the beam, because the shot plan
 * reads no rim place (design 5.6).
 */
export const FOREST_LIGHT = {
  key: { color: '#ffcf98', aimToPodium: 0, angle: 19 * DEGREES, penumbra: 1, illuminance: 4.8 },
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
  rimPlace: { distance: 2.45, elevation: 45 * DEGREES, turn: 35 * DEGREES, count: 1, spread: 0.3 },
  beam: { color: '#ffc47a', strength: 4.5, moteStrength: 1 },
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

/**
 * Gives the sun of the forest (design 4.1): the direction of the rim light ({@link FOREST_LIGHT}),
 * and the angle of the light of the bake ({@link FOREST}.sun). Thus the glow, the bake, and the
 * beam come from one side. It reads the values at the call, after the look override.
 *
 * @returns The sun.
 */
export function forestSun(): ForestSun {
  return { azimuth: Math.PI - FOREST_LIGHT.rimPlace.turn, elevation: FOREST.sun.elevation };
}

/** The stage colors of a venue in sRGB, as the look override takes them. */
type StageHex = Readonly<Record<keyof StageColors, string>>;

/** The prop colors of a venue in sRGB, as the look override takes them. */
type PropHex = Readonly<Record<keyof PropColors, string>>;

/** The stage of the forest (design 4.1): a lighter, warmer, and matte wood, in sRGB. */
export const FOREST_STAGE = {
  colors: {
    plank: '#9c5a16',
    seam: '#6a3610',
    nosing: '#925424',
    skirt: '#4e2c14',
    groove: '#30190b',
    podium: '#8a5028',
    riserTread: '#94592a',
    riserNosing: '#b8783a',
    podiumPanel: '#663a1e',
    podiumTop: '#9a6034',
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
  chair: '#7a3e16',
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
    vignette: 0.75,
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
    saturation: 1.2,
    vibrance: 0.4,
    shadowSaturation: 0.9,
    shadowTint: [0.008, 0.004, -0.01],
    highlightTint: [0.02, 0.008, -0.025],
  },
  clearColor: '#14100a',
} satisfies VenuePost;

/** The cut of the forest of one stage: the groups, the points of the stage, and the texture. */
interface ForestCut {
  /** The camera of the last test, so that a camera at rest costs no test. */
  readonly camera: Vec3;
  /** The cut groups of the build. */
  readonly groups: readonly CutGroup[];
  /** The points of the stage that no part may hide. */
  readonly points: readonly Vec3[];
  /** One byte for each group: 255 to keep, 0 to drop. */
  readonly bytes: Uint8Array;
  /** The texture of the bytes, which the shaders read. */
  readonly texture: Three.DataTexture;
}

/**
 * Creates a mesh of the forest: the baked colors of its vertices, with the cut.
 *
 * @param kit The runtime parts of the first download.
 * @param arrays The triangles.
 * @param cut The cut of the forest.
 * @param twoSided True for the leaves, which show from both sides.
 * @returns The mesh. It takes no light.
 */
function forestMesh(
  kit: ForestKit,
  arrays: ForestArrays,
  cut: ForestCut,
  twoSided: boolean,
): Three.Mesh {
  const { three } = kit;
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('color', new three.BufferAttribute(arrays.colors, 3));
  geometry.setAttribute('cut', new three.BufferAttribute(arrays.cut, 1));
  const material = new three.ShaderMaterial({
    vertexShader: FOREST_VERTEX,
    fragmentShader: FOREST_FRAGMENT,
    vertexColors: true,
    uniforms: { uKeep: { value: cut.texture } },
  });
  if (twoSided) {
    material.side = three.DoubleSide;
  }
  // The depth pass of the post effects keeps this material, so that it also drops the cut parts,
  // as `cutawayMaterial()` of `surroundings.ts` does.
  material.allowOverride = false;
  return new three.Mesh(geometry, material);
}

/**
 * Creates the glows of the forest: a square that faces the camera at each lamp, with additive
 * light and the cut. They write no depth, so the depth passes hide them as light effects.
 *
 * @param kit The runtime parts of the first download.
 * @param lamps The centers, the radii in meters, and the cut groups.
 * @param light The light of the middle of a glow, in linear values.
 * @param options The texture of the cut, and the share of the radius by which a square moves
 *   toward the camera.
 * @returns The mesh.
 */
function glowMesh(
  kit: ForestKit,
  lamps: readonly Glow[],
  light: Rgb,
  options: { readonly cut: ForestCut; readonly lift: number },
): Three.Mesh {
  const { three } = kit;
  const corners: readonly (readonly [number, number])[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ];
  const count = lamps.length * corners.length;
  const positions = new Float32Array(count * 3);
  const offsets = new Float32Array(count * 2);
  const glows = new Float32Array(count);
  const cuts = new Float32Array(count);
  let v = 0;
  for (const lamp of lamps) {
    for (const corner of corners) {
      positions.set(lamp.center, v * 3);
      offsets.set(corner, v * 2);
      glows[v] = lamp.glow;
      cuts[v] = lamp.cut;
      v++;
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setAttribute('corner', new three.BufferAttribute(offsets, 2));
  geometry.setAttribute('glow', new three.BufferAttribute(glows, 1));
  geometry.setAttribute('cut', new three.BufferAttribute(cuts, 1));
  const material = new three.ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uKeep: { value: options.cut.texture },
      uLift: { value: options.lift },
      uColor: { value: new three.Color().setRGB(...light) },
    },
    transparent: true,
    blending: three.AdditiveBlending,
    depthWrite: false,
  });
  material.allowOverride = false;
  const mesh = new three.Mesh(geometry, material);
  // A glow has no fixed bounds, because it faces the camera.
  mesh.frustumCulled = false;
  return mesh;
}

/** One glow of the forest: its center and its radius in meters, and its cut group. */
interface Glow {
  /** The center, in meters. */
  readonly center: Vec3;
  /** The radius, in meters. */
  readonly glow: number;
  /** The cut group. */
  readonly cut: number;
}

/**
 * Gives the glow of the sun among the trees at the back right ({@link FOREST}.sun).
 *
 * @param kit The runtime parts of the first download.
 * @returns The center, the radius, and the cut group 0.
 */
function sunGlow(kit: ForestKit): Glow {
  const { glowDistance, glowHeight, glow } = FOREST.sun;
  const { azimuth } = forestSun();
  const center: Vec3 = [
    glowDistance * Math.sin(azimuth),
    kit.floorY + glowHeight,
    glowDistance * Math.cos(azimuth),
  ];
  return { center, glow, cut: 0 };
}

/**
 * Creates the cut of a build: the texture of the groups, with each group kept.
 *
 * @param kit The runtime parts of the first download.
 * @param build The forest of the stage.
 * @param stageSide The stage side `S`, in meters.
 * @returns The cut.
 */
function createCut(kit: ForestKit, build: ForestBuild, stageSide: number): ForestCut {
  const bytes = new Uint8Array(build.groups.length).fill(255);
  const texture = new kit.three.DataTexture(bytes, bytes.length, 1, kit.three.RedFormat);
  texture.needsUpdate = true;
  return {
    camera: [Number.NaN, Number.NaN, Number.NaN],
    groups: build.groups,
    points: cutPoints(stageSide, FOREST.cut.samples),
    bytes,
    texture,
  };
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
  const srgb = kit.readers.srgb;
  const sphere = new three.SphereGeometry(20, 16, 8);
  const sky = srgb(e.sky);
  const horizon = srgb(e.horizon);
  const earth = srgb(e.earth);
  const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
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
  const [x, y, z] = sunDirection(forestSun());
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
  const entries = Object.entries<string>(colors).map(([key, hex]) => [key, kit.readers.srgb(hex)]);
  // SAFETY: the entries have the keys of `colors`.
  return Object.fromEntries(entries) as Record<K, Rgb>;
}

/**
 * Makes the forest clearing (design 4.1): the surroundings from the kit, the light, the stage
 * finish, the prop colors, and the grade. It reads the values of {@link FOREST},
 * {@link FOREST_STAGE}, and {@link FOREST_PROPS} at the call, after the look override of the dev
 * server.
 *
 * @param kit The runtime parts of the first download.
 * @returns The venue.
 */
export function forestVenue(kit: ForestKit): Venue {
  const cuts = new WeakMap<Group, ForestCut>();
  let parts: ReturnType<typeof forestParts> | null = null;
  return {
    id: 'forest',
    *surroundingsSteps(stageSide) {
      parts ??= forestParts(kit.readers);
      yield;
      const build = yield* buildForestSteps({
        parts,
        layout: placeForest(stageSide, kit.cornerCut),
        stageSide,
        floorY: kit.floorY,
        sun: forestSun(),
        bake: FOREST.bake,
        far: FOREST.far,
        cut: FOREST.cut,
        hash: kit.plankHash,
        srgb: kit.readers.srgb,
      });
      const cut = createCut(kit, build, stageSide);
      const lamps = build.lamps.map((lamp: ForestLamp) => ({ ...lamp, glow: FOREST.lanternGlow }));
      const sun = glowMesh(kit, [sunGlow(kit)], FOREST.glowLight.sun, { cut, lift: 0 });
      // The glow of the sun shines through the canopy, so no tree hides it.
      if (!Array.isArray(sun.material)) {
        sun.material.depthTest = false;
      }
      const group = new kit.three.Group().add(
        forestMesh(kit, build.solid, cut, false),
        forestMesh(kit, build.foliage, cut, true),
        glowMesh(kit, lamps, FOREST.glowLight.lantern, { cut, lift: 1 }),
        sun,
      );
      cuts.set(group, cut);
      return group;
    },
    frameSurroundings(surroundings: Group, _stageSide: number, camera: Vector3) {
      const cut = cuts.get(surroundings);
      if (
        !cut ||
        camera.distanceToSquared({ x: cut.camera[0], y: cut.camera[1], z: cut.camera[2] }) < 1e-8
      ) {
        return;
      }
      camera.toArray(cut.camera);
      if (keepGroups(cut.groups, cut.camera, cut.points, cut.bytes)) {
        cut.texture.needsUpdate = true;
      }
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
