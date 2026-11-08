import type { Bounds } from './bounds.ts';
import type { Vec3 } from './tuples.ts';
import { placeCorners } from './instruments/piece.ts';
import type { PlayerModel } from './player.ts';
import { buildMusicStand, buildSupport } from './props.ts';
import { boneIndex } from './rig.ts';

/**
 * The space that one item takes on the stage: a list of boxes in the axes of the item. For a
 * player, the item faces -z, and the origin is the floor under the center of its seat.
 */
export interface Footprint {
  readonly boxes: readonly Bounds[];
  /** The box around all boxes. */
  readonly bounds: Bounds;
}

/** A box of a footprint at its place on the stage: turned around y and moved. */
export interface PlacedBox {
  /** The center of the box on the stage top, as x and z. */
  readonly x: number;
  readonly z: number;
  /** The unit axes of the box in the plane of the stage top: its x axis, then its z axis. */
  readonly cos: number;
  readonly sin: number;
  /** Half the size of the box along its x axis and along its z axis. */
  readonly halfX: number;
  readonly halfZ: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Calculates the box around a list of boxes.
 *
 * @param boxes The boxes. There is at least one.
 * @returns The box around them.
 */
function around(boxes: readonly Bounds[]): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k] ?? Infinity, box.min[k] ?? 0);
      max[k] = Math.max(max[k] ?? -Infinity, box.max[k] ?? 0);
    }
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

/**
 * Calculates one box for each group of the triangles of a corner list.
 *
 * @param p The corner list, 9 numbers for each triangle, such as the positions of a mesh.
 * @param groupOf Gives the group of a triangle.
 * @returns One box for each group that has triangles.
 */
function groupBoxes(p: ArrayLike<number>, groupOf: (triangle: number) => number): Bounds[] {
  const boxes = new Map<number, { min: number[]; max: number[] }>();
  for (let t = 0; t < p.length / 9; t++) {
    const group = groupOf(t);
    const box = boxes.get(group) ?? {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    for (let i = t * 9; i < t * 9 + 9; i++) {
      const k = i % 3;
      box.min[k] = Math.min(box.min[k] ?? Infinity, p[i] ?? 0);
      box.max[k] = Math.max(box.max[k] ?? -Infinity, p[i] ?? 0);
    }
    boxes.set(group, box);
  }
  return [...boxes.values()].map((box): Bounds => ({
    min: [box.min[0] ?? 0, box.min[1] ?? 0, box.min[2] ?? 0],
    max: [box.max[0] ?? 0, box.max[1] ?? 0, box.max[2] ?? 0],
  }));
}

/**
 * Makes a footprint from its boxes.
 *
 * @param boxes The boxes. There is at least one.
 * @returns The footprint.
 */
export function footprintOf(boxes: readonly Bounds[]): Footprint {
  return { boxes, bounds: around(boxes) };
}

/** The height of one band of the boxes of a player footprint, in meters. */
const BAND_HEIGHT = 0.2;

/** The footprint of each player model, so that each model calculates its footprint one time. */
const playerFootprints = new WeakMap<PlayerModel, Footprint>();

/**
 * Calculates the footprint of a player in its bind pose: one box for the parts of each bone in
 * each band of 0.2 m of height, and one box for its seat (`buildSupport()`). A piece with its own
 * footprint corners (`InstrumentPiece.footprint`) counts them in place of its parts. A body with no chair
 * (`SeatHeights.noChair`) has no box of a seat. The function keeps the result of each model.
 *
 * @param player The player model, for example from a `ModelCache`.
 * @returns The footprint in the axes of the player model.
 */
export function playerFootprint(player: PlayerModel): Footprint {
  const known = playerFootprints.get(player);
  if (known) {
    return known;
  }
  // The triangles of the mesh, each with its bone. A piece with its own footprint corners
  // (`InstrumentPiece.footprint`) counts these corners in place of its parts.
  const replaced = new Set(
    player.pieces.flatMap(({ piece }) => (piece.footprint ? [boneIndex(piece.bone)] : [])),
  );
  const positions: number[] = [];
  const bones: number[] = [];
  const mesh = player.mesh;
  for (let t = 0; t < mesh.positions.length / 9; t++) {
    const bone = mesh.bones[t * 3] ?? 0;
    if (!replaced.has(bone)) {
      positions.push(...mesh.positions.subarray(t * 9, t * 9 + 9));
      bones.push(bone);
    }
  }
  for (const { piece, at } of player.pieces) {
    if (!piece.footprint) {
      continue;
    }
    // The mesh keeps 32-bit positions, so the corners get the same rounding.
    const placed = placeCorners(piece.footprint, at).map((c) => Math.fround(c));
    positions.push(...placed);
    for (let t = 0; t < placed.length / 9; t++) {
      bones.push(boneIndex(piece.bone));
    }
  }
  // One box for the parts of each bone in each band of heights, so that a tilted instrument,
  // such as the cello, gets a tight footprint.
  const boxes = groupBoxes(positions, (t) => {
    const y =
      ((positions[t * 9 + 1] ?? 0) + (positions[t * 9 + 4] ?? 0) + (positions[t * 9 + 7] ?? 0)) / 3;
    return (bones[t] ?? 0) * 100 + Math.floor(y / BAND_HEIGHT);
  });
  const seat = buildSupport(player.support, player.seat);
  if (seat) {
    boxes.push(...groupBoxes(seat.positions, () => 0));
  }
  const footprint = footprintOf(boxes);
  playerFootprints.set(player, footprint);
  return footprint;
}

/** The footprint of the music stand of each desk height. */
const standFootprints = new Map<number, Footprint>();

/**
 * Gives the footprint of a music stand: one box for each leg of the tripod, the post, and the desk
 * with its sheet. The reader is at +z.
 *
 * @param deskHeight The height of the middle of the desk above the floor, in meters.
 * @returns The footprint.
 */
export function standFootprint(deskHeight: number): Footprint {
  const known = standFootprints.get(deskHeight);
  if (known) {
    return known;
  }
  // `buildMusicStand()` adds three legs, the post, and the desk as boxes of 12 triangles, then
  // the sheet.
  const parts = 4;
  const footprint = footprintOf(
    groupBoxes(buildMusicStand(deskHeight).positions, (t) => Math.min(Math.floor(t / 12), parts)),
  );
  standFootprints.set(deskHeight, footprint);
  return footprint;
}

/**
 * Places the boxes of a footprint on the stage.
 *
 * @param footprint The footprint.
 * @param position The place of the origin of the item.
 * @param facing The turn of the item around y, in radians. 0 faces -z.
 * @returns The boxes on the stage.
 */
export function placeFootprint(footprint: Footprint, position: Vec3, facing: number): PlacedBox[] {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return footprint.boxes.map((box) => {
    const cx = (box.min[0] + box.max[0]) / 2;
    const cz = (box.min[2] + box.max[2]) / 2;
    return {
      // A turn of `facing` around y moves (x, z) to (x cos + z sin, -x sin + z cos).
      x: position[0] + cx * cos + cz * sin,
      z: position[2] - cx * sin + cz * cos,
      cos,
      sin,
      halfX: (box.max[0] - box.min[0]) / 2,
      halfZ: (box.max[2] - box.min[2]) / 2,
      minY: position[1] + box.min[1],
      maxY: position[1] + box.max[1],
    };
  });
}

/**
 * Calculates half the length of the projection of a placed box on an axis of the plane.
 *
 * @param box The box.
 * @param nx The x part of the unit axis.
 * @param nz The z part of the unit axis.
 * @returns The half length, in meters.
 */
function reachOn(box: PlacedBox, nx: number, nz: number): number {
  return (
    box.halfX * Math.abs(box.cos * nx - box.sin * nz) +
    box.halfZ * Math.abs(box.sin * nx + box.cos * nz)
  );
}

/**
 * Finds if an axis of the plane separates two placed boxes by a gap.
 *
 * @param a A box.
 * @param b Another box.
 * @param dx The x distance from the center of `a` to the center of `b`.
 * @param dz The z distance from the center of `a` to the center of `b`.
 * @param nx The x part of the unit axis.
 * @param nz The z part of the unit axis.
 * @param gap The smallest free distance, in meters.
 * @returns True if the projections of the boxes on the axis are at least the gap apart.
 */
function axisSeparates(
  a: PlacedBox,
  b: PlacedBox,
  dx: number,
  dz: number,
  nx: number,
  nz: number,
  gap: number,
): boolean {
  return Math.abs(dx * nx + dz * nz) >= reachOn(a, nx, nz) + reachOn(b, nx, nz) + gap;
}

/**
 * Finds if two placed boxes come closer than a gap in the plane of the stage, and share heights.
 *
 * @param a A box.
 * @param b Another box.
 * @param gap The smallest free distance in the plane, in meters.
 * @returns True if the boxes overlap, or if they are closer than the gap.
 */
export function boxesTouch(a: PlacedBox, b: PlacedBox, gap: number): boolean {
  if (a.minY >= b.maxY - 1e-9 || b.minY >= a.maxY - 1e-9) {
    return false;
  }
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // The axes of a box: (cos, -sin) and (sin, cos). Two rectangles are apart when one of the four
  // axes separates them (the separating axis theorem). The layout calls this function millions
  // of times, so it makes no array of the axes.
  return !(
    axisSeparates(a, b, dx, dz, a.cos, -a.sin, gap) ||
    axisSeparates(a, b, dx, dz, a.sin, a.cos, gap) ||
    axisSeparates(a, b, dx, dz, b.cos, -b.sin, gap) ||
    axisSeparates(a, b, dx, dz, b.sin, b.cos, gap)
  );
}

/** An item on the stage for the overlap check: its placed boxes, and a circle around them. */
export interface Obstacle {
  /** What the item is, for the messages of the tests. */
  readonly label: string;
  readonly boxes: readonly PlacedBox[];
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Makes an obstacle from placed boxes.
 *
 * @param label What the item is.
 * @param boxes The boxes. There is at least one.
 * @returns The obstacle.
 */
export function obstacleOf(label: string, boxes: readonly PlacedBox[]): Obstacle {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.halfX - b.halfZ);
    maxX = Math.max(maxX, b.x + b.halfX + b.halfZ);
    minZ = Math.min(minZ, b.z - b.halfX - b.halfZ);
    maxZ = Math.max(maxZ, b.z + b.halfX + b.halfZ);
  }
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const radius = Math.hypot(maxX - x, maxZ - z);
  return { label, boxes, x, z, radius };
}

/**
 * The margin of the broad phase of {@link obstaclesTouch}, in meters. It is much larger than the
 * rounding errors, so the broad phase skips only the pairs that {@link boxesTouch} also finds
 * apart.
 */
const BROAD_MARGIN = 1e-9;

/**
 * The projections of a list of boxes on the two axes of a box: 4 numbers for each box, the low
 * end and the high end of its span on the first axis, then on the second axis. A box that the
 * broad phase must not skip has an infinite span on each axis.
 */
type Projections = Float64Array;

/**
 * Projects boxes on the two axes of a box, from a point.
 *
 * @param boxes The boxes.
 * @param axes The box that gives the axes.
 * @param x The x of the point.
 * @param z The z of the point.
 * @param pad The distance that each span grows on each side, in meters.
 * @param own True for the boxes of the obstacle of `axes`. A box with other axes then gets an
 *   infinite span, because the two axes are not axes of its separating axis test.
 * @returns The projections.
 */
function project(
  boxes: readonly PlacedBox[],
  axes: PlacedBox,
  x: number,
  z: number,
  pad: number,
  own: boolean,
): Projections {
  const out = new Float64Array(boxes.length * 4);
  boxes.forEach((box, i) => {
    if (own && (box.cos !== axes.cos || box.sin !== axes.sin)) {
      out[i * 4] = -Infinity;
      out[i * 4 + 1] = Infinity;
      out[i * 4 + 2] = -Infinity;
      out[i * 4 + 3] = Infinity;
      return;
    }
    const dx = box.x - x;
    const dz = box.z - z;
    // The axes of `axes`: (cos, -sin) and (sin, cos), as in `boxesTouch()`.
    const u = dx * axes.cos - dz * axes.sin;
    const v = dx * axes.sin + dz * axes.cos;
    const ru = reachOn(box, axes.cos, -axes.sin) + pad;
    const rv = reachOn(box, axes.sin, axes.cos) + pad;
    out[i * 4] = u - ru;
    out[i * 4 + 1] = u + ru;
    out[i * 4 + 2] = v - rv;
    out[i * 4 + 3] = v + rv;
  });
  return out;
}

/**
 * Finds if two spans of projections overlap on both axes.
 *
 * @param p The projections of one list.
 * @param i The index of a box in `p`.
 * @param q The projections of another list.
 * @param j The index of a box in `q`.
 * @returns False if an axis separates the two spans.
 */
function spansOverlap(p: Projections, i: number, q: Projections, j: number): boolean {
  return (
    (p[i * 4] ?? 0) < (q[j * 4 + 1] ?? 0) &&
    (q[j * 4] ?? 0) < (p[i * 4 + 1] ?? 0) &&
    (p[i * 4 + 2] ?? 0) < (q[j * 4 + 3] ?? 0) &&
    (q[j * 4 + 2] ?? 0) < (p[i * 4 + 3] ?? 0)
  );
}

/**
 * Finds if two obstacles come closer than a gap. A player has 30 to 50 boxes, so a near pair of
 * players has more than 1,000 pairs of boxes. A broad phase skips most pairs before the full test:
 * the heights, then the projections on the two axes of the first box of `a`. These axes are axes
 * of the separating axis test of each box of `a` with the same axes. The broad phase skips a pair
 * only when such an axis separates it by more than {@link BROAD_MARGIN}, so the result does not
 * change.
 *
 * @param a An obstacle.
 * @param b Another obstacle.
 * @param gap The smallest free distance, in meters.
 * @returns True if a box of one comes closer than the gap to a box of the other.
 */
export function obstaclesTouch(a: Obstacle, b: Obstacle, gap: number): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius + gap) {
    return false;
  }
  const axes = a.boxes[0];
  if (!axes) {
    return false;
  }
  const own = project(a.boxes, axes, a.x, a.z, gap + BROAD_MARGIN, true);
  const other = project(b.boxes, axes, a.x, a.z, 0, false);

  // The boxes of `b` that come into the spans of all boxes of `a`.
  const all = new Float64Array([Infinity, -Infinity, Infinity, -Infinity]);
  for (let i = 0; i < a.boxes.length; i++) {
    all[0] = Math.min(all[0] ?? 0, own[i * 4] ?? 0);
    all[1] = Math.max(all[1] ?? 0, own[i * 4 + 1] ?? 0);
    all[2] = Math.min(all[2] ?? 0, own[i * 4 + 2] ?? 0);
    all[3] = Math.max(all[3] ?? 0, own[i * 4 + 3] ?? 0);
  }
  const near: number[] = [];
  for (let j = 0; j < b.boxes.length; j++) {
    if (spansOverlap(all, 0, other, j)) {
      near.push(j);
    }
  }

  for (const [i, p] of a.boxes.entries()) {
    for (const j of near) {
      const q = b.boxes[j];
      if (
        q &&
        !(p.minY >= q.maxY - 1e-9 || q.minY >= p.maxY - 1e-9) &&
        spansOverlap(own, i, other, j) &&
        boxesTouch(p, q, gap)
      ) {
        return true;
      }
    }
  }
  return false;
}
