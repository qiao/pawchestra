import type { Bounds } from './bounds.ts';
import { cornerBounds } from './footprint.ts';
import type { Obstacle, PlacedBox } from './footprint.ts';
import type { PlayerPlace } from './layout.ts';
import type { PlayerModel } from './player.ts';
import { boneIndex } from './rig.ts';
import { PODIUM_SIZE } from './stage.ts';
import type { Vec3 } from './tuples.ts';
import { clamp01 } from '../math.ts';

/** The podium center: the origin of the points of {@link sightTargets}. */
const PODIUM_CENTER: Vec3 = [0, 0, 0];

/**
 * The points of the conductor that each player sees (design 4.5, seat geometry), relative to the
 * point on the podium top under the bear, in the axes of the bear, which faces the players (-z).
 * They cover the parts of the posed conductor that the `sight-lines` probe measures over the song:
 * the head from 1.1 m to 1.5 m above the podium top and 0.2 m to each side, with its front and
 * its back; the right paw with the baton at 0.3 m to 0.6 m to the right and 1.2 m to 1.4 m high,
 * with the baton to 0.6 m in front of the bear; and the left paw.
 */
export const CONDUCTOR_SIGHT = {
  /** The grid of the head points: the x values, the heights, and the z values, in meters. */
  head: [
    [-0.2, 0, 0.2],
    [1.15, 1.45],
    [-0.3, 0.02],
  ],
  /** The points of the right paw and the baton: x, the height above the podium top, and z. */
  baton: [
    [0.34, 1.2, -0.22],
    [0.42, 1.2, -0.22],
    [0.5, 1.2, -0.22],
    [0.34, 1.3, -0.22],
    [0.42, 1.3, -0.22],
    [0.5, 1.3, -0.22],
    [0.4, 1.3, -0.45],
    [0.4, 1.4, -0.6],
  ],
  /** The points of the left paw. */
  cue: [
    [-0.5, 1.09, -0.3],
    [-0.34, 1.09, -0.3],
    [-0.5, 1.28, -0.3],
    [-0.34, 1.28, -0.3],
  ],
  /**
   * The largest move of a player along its row off its spread angle, in radians: 15°, about half
   * the angle between two players of the first row, so that a back desk can sit in the gaps.
   */
  nudge: (15 * Math.PI) / 180,
  /** The step of the move, in radians: 1°. */
  nudgeStep: Math.PI / 180,
} as const;

/**
 * Moves a point of a model into the stage axes.
 *
 * @param p The point in the model axes.
 * @param position The place of the model origin.
 * @param facing The turn of the model around y, in radians.
 * @returns The point on the stage.
 */
export function pointOnStage(p: Vec3, position: Vec3, facing: number): Vec3 {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return [position[0] + p[0] * c + p[2] * s, position[1] + p[1], position[2] - p[0] * s + p[2] * c];
}

/**
 * Gives the middle of the two eye bones of a model, in the model axes, in the bind pose.
 *
 * @param model The model.
 * @returns The point.
 */
export function eyesOf(model: PlayerModel): Vec3 {
  const [l, r] = (['eyeL', 'eyeR'] as const).map(
    (bone): Vec3 => model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0],
  );
  return [
    ((l?.[0] ?? 0) + (r?.[0] ?? 0)) / 2,
    ((l?.[1] ?? 0) + (r?.[1] ?? 0)) / 2,
    ((l?.[2] ?? 0) + (r?.[2] ?? 0)) / 2,
  ];
}

/** The points of the conductor that the players see, relative to the podium center. */
export interface SightTargets {
  /** The points of the head. A music stand can hide them. */
  readonly head: readonly Vec3[];
  /** The points of the right paw and the baton. A music stand does not hide them. */
  readonly baton: readonly Vec3[];
  /** The points of the left paw. A music stand does not hide them. */
  readonly cue: readonly Vec3[];
}

/**
 * Gives the points of the conductor that the players see ({@link CONDUCTOR_SIGHT}).
 *
 * @returns The points, relative to the podium center.
 */
export function sightTargets(): SightTargets {
  const top = PODIUM_SIZE[1];
  const lift = (points: readonly (readonly number[])[]): Vec3[] =>
    points.map(([x = 0, y = 0, z = 0]): Vec3 => [x, top + y, z]);
  const [xs, ys, zs] = CONDUCTOR_SIGHT.head;
  return {
    head: lift(zs.flatMap((z) => xs.flatMap((x) => ys.map((y) => [x, y, z])))),
    baton: lift(CONDUCTOR_SIGHT.baton),
    cue: lift(CONDUCTOR_SIGHT.cue),
  };
}

/**
 * Finds if a segment crosses a placed box.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param b The box.
 * @returns True if a part of the segment is inside the box.
 */
function segmentHitsBox(from: Vec3, to: Vec3, b: PlacedBox): boolean {
  // A point goes into the axes of the box by the turn back of `placeFootprint()`.
  const fx = from[0] - b.x;
  const fz = from[2] - b.z;
  const tx = to[0] - b.x;
  const tz = to[2] - b.z;
  const ax = fx * b.cos - fz * b.sin;
  const az = fx * b.sin + fz * b.cos;
  const ex = tx * b.cos - tz * b.sin;
  const ez = tx * b.sin + tz * b.cos;
  // The slabs of the three axes: the start, the move, and the two faces. The sight sweep calls
  // this function millions of times, so it makes no arrays.
  const span: Span = { t0: 0, t1: 1 };
  return (
    slabHit(ax, ex - ax, -b.halfX, b.halfX, span) &&
    slabHit(from[1], to[1] - from[1], b.minY, b.maxY, span) &&
    slabHit(az, ez - az, -b.halfZ, b.halfZ, span)
  );
}

/** The part of a segment that is inside the slabs so far, as fractions of the segment. */
interface Span {
  /** The fraction at which the segment goes into all slabs. */
  t0: number;
  /** The fraction at which the segment comes out of a slab first. */
  t1: number;
}

/**
 * Clips the span of a segment by one slab: the space between two parallel faces of a box.
 *
 * @param start The start of the segment on the axis of the slab.
 * @param d The move of the segment on the axis.
 * @param low The lower face.
 * @param high The upper face.
 * @param span The span so far. The function makes it smaller.
 * @returns False if no part of the segment is inside all slabs so far.
 */
function slabHit(start: number, d: number, low: number, high: number, span: Span): boolean {
  if (Math.abs(d) < 1e-12) {
    return !(start < low || start > high);
  }
  const ta = (low - start) / d;
  const tb = (high - start) / d;
  span.t0 = Math.max(span.t0, Math.min(ta, tb));
  span.t1 = Math.min(span.t1, Math.max(ta, tb));
  return !(span.t0 > span.t1);
}

/** A node of the box tree of a sight mesh, in the model axes. */
interface SightNode extends Bounds {
  /** The two children, or `null` for a leaf. */
  readonly kids: readonly [SightNode, SightNode] | null;
  /** 9 numbers for each triangle of a leaf. */
  readonly corners: Float32Array;
}

/** The triangles of a player model for the sight lines, in a box tree, in the model axes. */
interface SightMesh {
  /** The largest distance of a box corner from the model origin in the plane of the stage. */
  readonly reach: number;
  readonly root: SightNode;
}

/** The model of a placed player, for the sight lines on its mesh. */
interface MeshPlace {
  readonly model: PlayerModel;
  readonly position: Vec3;
  /** The cosine and the sine of the facing of the model. */
  readonly cos: number;
  readonly sin: number;
}

/** The largest number of triangles in a leaf of a sight mesh. */
const SIGHT_LEAF = 8;

/**
 * The sight mesh of each model. Like a footprint, a model gets its mesh one time, at the first
 * sight line that passes near it.
 */
const sightMeshes = new WeakMap<PlayerModel, SightMesh>();

/**
 * The model of each player obstacle ({@link attachSightMesh}). The sight lines test the triangles
 * of the player, because the boxes of a footprint are much larger than the ears and the paws.
 */
const meshPlaces = new WeakMap<Obstacle, MeshPlace>();

/**
 * Links the obstacle of a player to its model, so that the sight lines test the triangles of the
 * model in place of the boxes of the obstacle.
 *
 * @param obstacle The obstacle of the player.
 * @param model The model of the player.
 * @param position The place of the model origin.
 * @param facing The facing of the model.
 */
export function attachSightMesh(
  obstacle: Obstacle,
  model: PlayerModel,
  position: Vec3,
  facing: number,
): void {
  meshPlaces.set(obstacle, { model, position, cos: Math.cos(facing), sin: Math.sin(facing) });
}

/**
 * Gives the sight mesh of a model: its triangles in a box tree. Each node splits its triangles
 * at the middle of its longest side, down to {@link SIGHT_LEAF} triangles.
 *
 * @param model The model.
 * @returns The mesh.
 */
function sightMeshOf(model: PlayerModel): SightMesh {
  const known = sightMeshes.get(model);
  if (known) {
    return known;
  }
  const p = model.mesh.positions;
  const middle = (t: number, a: number): number =>
    (p[t * 9 + a] ?? 0) + (p[t * 9 + 3 + a] ?? 0) + (p[t * 9 + 6 + a] ?? 0);
  const build = (ids: readonly number[]): SightNode => {
    const corners = new Float32Array(ids.length * 9);
    ids.forEach((t, k) => {
      corners.set(p.subarray(t * 9, t * 9 + 9), k * 9);
    });
    const box = cornerBounds(corners);
    if (ids.length <= SIGHT_LEAF) {
      return { ...box, kids: null, corners };
    }
    const size = [0, 1, 2].map((a) => (box.max[a] ?? 0) - (box.min[a] ?? 0));
    const axis = size.indexOf(Math.max(...size));
    const sorted = ids.toSorted((a, b) => middle(a, axis) - middle(b, axis));
    const half = Math.floor(sorted.length / 2);
    return {
      ...box,
      kids: [build(sorted.slice(0, half)), build(sorted.slice(half))],
      corners: new Float32Array(0),
    };
  };
  const root = build(Array.from({ length: p.length / 9 }, (_, t) => t));
  const reach = Math.max(
    ...[root.min[0], root.max[0]].flatMap((x) =>
      [root.min[2], root.max[2]].map((z) => Math.hypot(x, z)),
    ),
  );
  const mesh: SightMesh = { reach, root };
  sightMeshes.set(model, mesh);
  return mesh;
}

/**
 * Finds if a segment crosses a box that is parallel to the axes.
 *
 * @param o The start.
 * @param d The vector from the start to the end.
 * @param min The low corner.
 * @param max The high corner.
 * @returns True if a part of the segment is inside the box.
 */
export function rayHitsBox(o: Vec3, d: Vec3, min: Vec3, max: Vec3): boolean {
  const span: Span = { t0: 0, t1: 1 };
  return (
    slabHit(o[0], d[0], min[0], max[0], span) &&
    slabHit(o[1], d[1], min[1], max[1], span) &&
    slabHit(o[2], d[2], min[2], max[2], span)
  );
}

/**
 * Finds if a segment crosses a triangle (Moller and Trumbore), away from its ends, as the
 * `sight-lines` probe does.
 *
 * @param o The start.
 * @param d The vector from the start to the end.
 * @param c The corners of the triangles.
 * @param i The index of the first number of the triangle.
 * @returns True on a hit.
 */
export function rayHitsTriangle(
  o: Vec3,
  d: Vec3,
  c: Float32Array | Float64Array,
  i: number,
): boolean {
  const ax = c[i] ?? 0;
  const ay = c[i + 1] ?? 0;
  const az = c[i + 2] ?? 0;
  const e1x = (c[i + 3] ?? 0) - ax;
  const e1y = (c[i + 4] ?? 0) - ay;
  const e1z = (c[i + 5] ?? 0) - az;
  const e2x = (c[i + 6] ?? 0) - ax;
  const e2y = (c[i + 7] ?? 0) - ay;
  const e2z = (c[i + 8] ?? 0) - az;
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) {
    return false;
  }
  const inv = 1 / det;
  const tx = o[0] - ax;
  const ty = o[1] - ay;
  const tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) {
    return false;
  }
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) {
    return false;
  }
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 && t < 0.999;
}

/**
 * Finds if a segment crosses a triangle of a placed player model. The segment goes into the axes
 * of the model by the turn back of its facing.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param placed The model at its place.
 * @returns True on a hit.
 */
function segmentHitsMesh(from: Vec3, to: Vec3, placed: MeshPlace): boolean {
  const { position, cos, sin } = placed;
  const local = (p: Vec3): Vec3 => {
    const dx = p[0] - position[0];
    const dz = p[2] - position[2];
    return [dx * cos - dz * sin, p[1] - position[1], dx * sin + dz * cos];
  };
  const o = local(from);
  const e = local(to);
  const d: Vec3 = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const stack: SightNode[] = [sightMeshOf(placed.model).root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (!rayHitsBox(o, d, node.min, node.max)) {
      continue;
    }
    if (node.kids) {
      stack.push(node.kids[0], node.kids[1]);
      continue;
    }
    for (let i = 0; i < node.corners.length; i += 9) {
      if (rayHitsTriangle(o, d, node.corners, i)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds if an obstacle comes within a distance of a segment in the plane of the stage: its circle,
 * or the circle of its mesh, grown by the distance.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param o The obstacle.
 * @param margin The distance, in meters.
 * @returns True if the obstacle is near.
 */
function nearSegment(from: Vec3, to: Vec3, o: Obstacle, margin: number): boolean {
  const placed = meshPlaces.get(o);
  const cx = placed ? placed.position[0] : o.x;
  const cz = placed ? placed.position[2] : o.z;
  const reach = Math.max(placed ? sightMeshOf(placed.model).reach : 0, o.radius) + margin;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = dx * dx + dz * dz;
  const t = length > 0 ? clamp01(((cx - from[0]) * dx + (cz - from[2]) * dz) / length) : 0;
  const ex = from[0] + t * dx - cx;
  const ez = from[2] + t * dz - cz;
  return ex * ex + ez * ez <= reach * reach;
}

/**
 * Finds if a segment crosses an obstacle: the triangles of a player, or the boxes of another item.
 * The circle of the obstacle in the plane of the stage skips most obstacles.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param o The obstacle.
 * @returns True if a part of the segment is inside the obstacle.
 */
function segmentHitsObstacle(from: Vec3, to: Vec3, o: Obstacle): boolean {
  if (!nearSegment(from, to, o, 0)) {
    return false;
  }
  const placed = meshPlaces.get(o);
  return placed
    ? segmentHitsMesh(from, to, placed)
    : o.boxes.some((b) => segmentHitsBox(from, to, b));
}

/** The items that can hide the conductor from the players of a row. */
export interface SightBlockers {
  /** The players with their instruments and seats. They hide each point. */
  readonly solid: readonly Obstacle[];
  /** The music stands. They hide only the head. */
  readonly stands: readonly Obstacle[];
}

/**
 * The sight of a player to the conductor (design 4.5, seat geometry): 0 if it sees each point, 1
 * if it sees the head and the baton paw but not the whole left paw, and 2 if an item hides a point
 * of the head or of the baton paw.
 */
type Sight = 0 | 1 | 2;

/** The sight of a player, with the hidden share of its head and its baton paw. */
export interface SightResult {
  readonly sight: Sight;
  /** The hidden share of the head points plus the hidden share of the baton points: 0 to 2. */
  readonly hidden: number;
}

/**
 * The largest distance of a target from the podium center in the plane of the stage, in meters.
 * An item farther from the line from the eyes to the podium center hides no target.
 */
const SIGHT_REACH = 0.9;

/**
 * Finds how much of the conductor a player sees (design 4.5, seat geometry). The lines go from
 * the eyes of the player to the points of {@link CONDUCTOR_SIGHT}, and the triangles of the
 * players and the boxes of the other items can hide them.
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param targets The points of the conductor.
 * @param blockers The items that can hide the points.
 * @returns The sight.
 */
export function sightOf(
  eyes: Vec3,
  place: PlayerPlace,
  targets: SightTargets,
  blockers: SightBlockers,
): SightResult {
  const eye = pointOnStage(eyes, place.position, place.facing);
  const near = (items: readonly Obstacle[]): Obstacle[] =>
    items.filter((o) => nearSegment(eye, PODIUM_CENTER, o, SIGHT_REACH));
  const solid = near(blockers.solid);
  const stands = near(blockers.stands);
  const hides = (point: Vec3, items: readonly Obstacle[]): boolean =>
    items.some((o) => segmentHitsObstacle(eye, point, o));
  const share = (points: readonly Vec3[], items: readonly Obstacle[]): number =>
    points.filter((p) => hides(p, items)).length / points.length;
  const head = share(targets.head, [...solid, ...stands]);
  const baton = share(targets.baton, solid);
  let sight: Sight = 0;
  if (head > 0 || baton > 0) {
    sight = 2;
  } else if (targets.cue.some((p) => hides(p, solid))) {
    sight = 1;
  }
  return { sight, hidden: head + baton };
}

/**
 * Lists the items that hide a point of the head or of the baton paw of the conductor from a
 * player, as {@link sightOf} counts them. A music stand can hide only the head.
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param targets The points of the conductor.
 * @param blockers The items that can hide the points.
 * @returns The items that hide at least one point.
 */
export function hidersOf(
  eyes: Vec3,
  place: PlayerPlace,
  targets: SightTargets,
  blockers: SightBlockers,
): Obstacle[] {
  const eye = pointOnStage(eyes, place.position, place.facing);
  const near = (items: readonly Obstacle[]): Obstacle[] =>
    items.filter((o) => nearSegment(eye, PODIUM_CENTER, o, SIGHT_REACH));
  const hides = (o: Obstacle, points: readonly Vec3[]): boolean =>
    points.some((p) => segmentHitsObstacle(eye, p, o));
  return [
    ...near(blockers.solid).filter((o) => hides(o, targets.head) || hides(o, targets.baton)),
    ...near(blockers.stands).filter((o) => hides(o, targets.head)),
  ];
}

/**
 * The view of the audience on the rows behind the strings (design 4.5, seat geometry). A small
 * animal there can hide behind the strings in the low wide shots of Cinematic. The points stand
 * for those shots and the default view, as multiples of the stage side, relative to the podium
 * center: the low and the middle camera at the front, and the two side cameras.
 */
export const AUDIENCE = {
  /** The first row that keeps its view: row 2, the first row behind the strings. */
  firstRow: 2,
  cameras: [
    [0, 0.36, 1.3],
    [0, 0.6, 1.25],
    [-0.9, 0.5, 1.4],
    [0.9, 0.5, 1.4],
  ],
  /** The points of the head around the eyes: the side move and the height, in meters. */
  head: [
    [0, 0],
    [-0.1, 0.05],
    [0.1, 0.05],
    [0, 0.15],
  ],
} as const;

/**
 * The distance from a line of the view of the audience in the plane of the stage beyond which an
 * item hides no point of the head, in meters. It holds the side moves of {@link AUDIENCE}.head.
 */
const VIEW_MARGIN = 0.3;

/**
 * Finds the share of the head of a player that the items in front hide from the audience
 * ({@link AUDIENCE}).
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param solid The items that can hide the head.
 * @param side The stage side, in meters.
 * @returns The share, from 0 to 1.
 */
export function audienceShare(
  eyes: Vec3,
  place: PlayerPlace,
  solid: readonly Obstacle[],
  side: number,
): number {
  const [x, y, z] = eyes;
  const points = AUDIENCE.head.map(([dx, dy]): Vec3 => {
    const p = pointOnStage([x + dx, y, z], place.position, place.facing);
    return [p[0], p[1] + dy, p[2]];
  });
  let hidden = 0;
  for (const [cx, cy, cz] of AUDIENCE.cameras) {
    const camera: Vec3 = [cx * side, cy * side, cz * side];
    const items = solid.filter((o) => nearSegment(camera, points[0] ?? camera, o, VIEW_MARGIN));
    hidden += points.filter((p) => items.some((o) => segmentHitsObstacle(camera, p, o))).length;
  }
  return hidden / (AUDIENCE.cameras.length * points.length);
}

/**
 * Finds if an item can change the sight of a player ({@link sightOf}) or the view of the
 * audience on it ({@link audienceShare}). An item that is not near changes neither, because both
 * functions skip it.
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param o The item.
 * @param side The stage side when the view of the audience counts, or `null`.
 * @returns True if the item is near a line of the sight or of the view.
 */
export function sightNear(
  eyes: Vec3,
  place: PlayerPlace,
  o: Obstacle,
  side: number | null,
): boolean {
  const eye = pointOnStage(eyes, place.position, place.facing);
  if (nearSegment(eye, PODIUM_CENTER, o, SIGHT_REACH)) {
    return true;
  }
  if (side === null) {
    return false;
  }
  return AUDIENCE.cameras.some(([cx, cy, cz]) =>
    nearSegment([cx * side, cy * side, cz * side], eye, o, VIEW_MARGIN),
  );
}

/**
 * Gives the cost of a sight in the searches of the layout. A blocked player outweighs all partial
 * sights, and a partial sight outweighs all moves of 1° steps. Among the blocked places, a place
 * with less of the head and the baton paw hidden costs less, so that the search keeps the player
 * near a gap.
 *
 * @param result The sight.
 * @returns The cost.
 */
export function sightCost(result: SightResult): number {
  return ([0, 1000, 1_000_000][result.sight] ?? 0) + 300 * result.hidden;
}
