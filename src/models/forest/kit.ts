import type { Vec3 } from '../tuples.ts';
import { FOREST_KIT } from './kit-data.ts';
import { unpackForestPart } from './kit-format.ts';
import type { ForestKitData, ForestRopeEnd, KitReaders } from './kit-format.ts';

export { FOREST_FACE_KINDS } from './kit-format.ts';
export type { ForestFaceKind, KitReaders } from './kit-format.ts';

/** One part of the forest kit, as flat triangles in meters. */
export interface ForestPart {
  /** The name of the part, such as 'tree-1' or 'lantern-hanging'. */
  readonly name: string;
  /** Three numbers for each corner, three corners for each triangle. */
  readonly positions: Float32Array;
  /** The linear RGB of each corner. */
  readonly colors: Float32Array;
  /** The kind of each triangle, as an index into FOREST_FACE_KINDS. */
  readonly kinds: Uint8Array;
}

/** One placed copy of a part around a stage. */
export interface ForestPlacement {
  /** The name of the part. */
  readonly part: string;
  /** The origin of the part, in meters. The origin of most parts is on the ground. */
  readonly position: Vec3;
  /** The turn about the vertical axis, in radians. */
  readonly yaw: number;
  /** The scale of the part on each axis. */
  readonly scale: number;
}

/** One rope of the light string, with its lanterns. */
export interface ForestRope {
  /** The points of the rope from one end to the other, in meters, on a catenary. */
  readonly points: readonly Vec3[];
  /**
   * The trees of the two ends, as indices in {@link ForestLayout}.placements, or -1 for a tree
   * that the layout dropped.
   */
  readonly trees: readonly [number, number];
  /** The lanterns that hang from the rope, at equal steps between its ends. */
  readonly lanterns: readonly ForestPlacement[];
}

/** The forest around one stage: the placed parts and the ropes of the light string. */
export interface ForestLayout {
  /** Each placed copy of a part. */
  readonly placements: readonly ForestPlacement[];
  /** The ropes of the light string. */
  readonly ropes: readonly ForestRope[];
}

/**
 * The ropes of the light string: their radius in meters and their color, the same as `ROPE` of
 * `tools/forest-kit/build-kit.py`.
 */
export const FOREST_ROPE = {
  /** The radius of the rope, in meters. */
  radius: 0.014,
  /** The color of the rope, in sRGB. */
  color: '#6b5236',
} as const;

/**
 * The part that hangs from the ropes. Its origin is at the top of its ring, where the rope holds
 * it.
 */
export const ROPE_LANTERN = 'lantern-hanging';

/** The number of segments of each rope of {@link ForestRope.points}. */
const ROPE_SEGMENTS = 24;

/**
 * Decodes the parts of the kit.
 *
 * @param readers The functions of the first download that read the bytes (design 7.2).
 * @param kit The packed kit. The kit of `pnpm forest-kit` by default.
 * @returns Each part, in the order of the kit.
 * @throws Error if the packed data of a part is broken.
 */
export function forestParts(readers: KitReaders, kit: ForestKitData = FOREST_KIT): ForestPart[] {
  return kit.parts.map(({ name, packed }) => ({ name, ...unpackForestPart(packed, readers) }));
}

/**
 * Moves one coordinate of a place from the stage of the kit to another stage. A place beyond the
 * deck edge keeps its distance from the edge, and a place along the edge keeps its part of the
 * edge.
 *
 * @param value The x or the z of the place, in meters.
 * @param half Half the stage side of the kit.
 * @param newHalf Half the new stage side.
 * @returns The moved coordinate.
 */
function moveCoordinate(value: number, half: number, newHalf: number): number {
  const out = Math.abs(value) - half;
  return out > 0 ? Math.sign(value) * (newHalf + out) : (value * newHalf) / half;
}

/**
 * The distance beyond both edges at a corner, in meters, from which a place gets the full move of
 * {@link movePlace} that keeps its distance from the corner cut.
 */
const CORNER_BLEND = 1;

/**
 * Moves a place on the ground from the stage of the kit to another stage, so that a part keeps
 * its distance outside the deck edge. Beyond a corner, a smaller stage also moves the place out by
 * half the change of the corner cut, so that the distance from the cut does not shrink. The move
 * grows over {@link CORNER_BLEND}, so that two near places do not jump apart.
 *
 * @param x The x of the place, in meters.
 * @param z The z of the place, in meters.
 * @param sides The stage side of the kit and the new stage side.
 * @param cornerCut The corner cut of the stage, as a part of its side: `STAGE_CORNER_CUT`.
 * @returns The new x and z.
 */
function movePlace(
  x: number,
  z: number,
  sides: readonly [side: number, newSide: number],
  cornerCut: number,
): [number, number] {
  const [side, newSide] = sides;
  const half = side / 2;
  const newHalf = newSide / 2;
  const beyond = Math.min(Math.abs(x) - half, Math.abs(z) - half);
  const cut = Math.max(0, (cornerCut * (side - newSide)) / 2);
  const corner = cut * Math.min(1, Math.max(0, beyond / CORNER_BLEND));

  return [
    moveCoordinate(x, half, newHalf) + Math.sign(x) * corner,
    moveCoordinate(z, half, newHalf) + Math.sign(z) * corner,
  ];
}

/**
 * Gives the place of a rope end in the axes of the app, from its tree.
 *
 * @param end The rope end.
 * @param trees The placed parts.
 * @returns The place, in meters.
 * @throws Error if the end names no placed part.
 */
function ropeEnd(end: ForestRopeEnd, trees: readonly ForestPlacement[]): Vec3 {
  const tree = trees[end.tree];
  if (!tree) {
    throw new Error(`A rope end names the part ${end.tree}, which is not placed.`);
  }

  const [ox, oy, oz] = end.offset;
  const cos = Math.cos(tree.yaw);
  const sin = Math.sin(tree.yaw);
  const [x, y, z] = tree.position;
  return [
    x + (ox * cos + oz * sin) * tree.scale,
    y + oy * tree.scale,
    z + (oz * cos - ox * sin) * tree.scale,
  ];
}

/**
 * Calculates points of a rope that hangs between two points: a catenary
 * `y = k cosh((s - s0) / k) + c` over the distance `s` along the ground, with a length of
 * `1 + slack` times the distance between the points. A bisection finds `k`, with the same steps
 * as `catenary()` of `tools/forest-kit/build-kit.py`.
 *
 * @param a The first end.
 * @param b The second end.
 * @param slack The extra length of the rope, as a part of the distance between its ends.
 * @param count The number of segments.
 * @returns `count + 1` points from `a` to `b`.
 */
export function catenary(a: Vec3, b: Vec3, slack: number, count: number): Vec3[] {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const span = Math.hypot(dx, dz);
  const rise = b[1] - a[1];
  const length = Math.hypot(span, rise) * (1 + slack);
  const target = Math.sqrt(length * length - rise * rise);

  let lo = span * 1e-3;
  let hi = span * 1e4;
  for (let i = 0; i < 80; i++) {
    const k = Math.sqrt(lo * hi);
    if (2 * k * Math.sinh(span / (2 * k)) > target) {
      lo = k;
    } else {
      hi = k;
    }
  }
  const k = Math.sqrt(lo * hi);
  const s0 = span / 2 - k * Math.asinh(rise / (2 * k * Math.sinh(span / (2 * k))));
  const c = a[1] - k * Math.cosh(-s0 / k);

  return Array.from({ length: count + 1 }, (_, i): Vec3 => {
    const t = i / count;
    return [a[0] + dx * t, k * Math.cosh((span * t - s0) / k) + c, a[2] + dz * t];
  });
}

/** The height above which a part is a tree, in meters. Two trees do not overlap. */
const TREE_HEIGHT = 3;

/**
 * Finds each tree whose footprint overlaps the footprint of a tree before it in the list. A
 * small stage moves the trees behind its edges closer together, so it keeps fewer trees.
 *
 * @param placements The placed parts, the most important first.
 * @param kit The kit, with the footprint and the height of each part.
 * @returns For each placed part, its index in the list of the kept parts, or -1 for a dropped
 *   tree.
 */
function thinTrees(placements: readonly ForestPlacement[], kit: ForestKitData): number[] {
  const parts = new Map(kit.parts.map((part) => [part.name, part]));
  const trees: { readonly x: number; readonly z: number; readonly radius: number }[] = [];
  let kept = 0;
  return placements.map((placement) => {
    const part = parts.get(placement.part);
    if (!part || part.height <= TREE_HEIGHT) {
      return kept++;
    }

    const [x, , z] = placement.position;
    const radius = part.footprint * placement.scale;
    if (trees.every((t) => Math.hypot(t.x - x, t.z - z) >= t.radius + radius)) {
      trees.push({ x, z, radius });
      return kept++;
    }
    return -1;
  });
}

/**
 * Places the kit around a stage with this side. A part keeps its distance outside the deck
 * edge, so that a small stage of a string quartet gets the trees closer. A tree that then
 * overlaps an earlier tree drops out. The ropes of the light string hang between their trees
 * after the move, and the lanterns of each rope hang at equal steps between its ends.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param cornerCut The corner cut of the stage, as a part of its side: `STAGE_CORNER_CUT` of
 *   `models/stage.ts`, as an argument (design 7.2).
 * @param kit The packed kit. The kit of `pnpm forest-kit` by default.
 * @returns The placed parts, and the ropes with their lanterns.
 */
export function placeForest(
  stageSide: number,
  cornerCut: number,
  kit: ForestKitData = FOREST_KIT,
): ForestLayout {
  const moved = kit.placements.map(([part, x, y, z, yaw, scale]): ForestPlacement => {
    const [nx, nz] = movePlace(x, z, [kit.stageSide, stageSide], cornerCut);
    return { part, position: [nx, y, nz], yaw, scale };
  });

  const kept = thinTrees(moved, kit);
  const ropes = kit.ropes.map((rope): ForestRope => {
    const a = ropeEnd(rope.ends[0], moved);
    const b = ropeEnd(rope.ends[1], moved);
    const lanterns = catenary(a, b, rope.slack, rope.lanterns + 1)
      .slice(1, -1)
      .map((position): ForestPlacement => ({ part: ROPE_LANTERN, position, yaw: 0, scale: 1 }));
    const trees: [number, number] = [kept[rope.ends[0].tree] ?? -1, kept[rope.ends[1].tree] ?? -1];
    return { points: catenary(a, b, rope.slack, ROPE_SEGMENTS), trees, lanterns };
  });

  return { placements: moved.filter((_, i) => (kept[i] ?? -1) >= 0), ropes };
}
