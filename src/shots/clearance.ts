import { CONDUCTOR_OBSTACLE, layoutObstacles } from '../models/layout-scene.ts';
import type { PlacedBox } from '../models/footprint.ts';
import type { SceneLayout } from '../models/layout.ts';
import type { ModelCache } from '../models/model-cache.ts';
import type { Vec3 } from '../models/tuples.ts';

/** The clearance rules of a camera (design 5.6). */
export const CLEARANCE = {
  /** The smallest distance from the camera to a box of a player, a stand, or the risers. */
  box: 0.6,
  /** The smallest distance from the camera to a box of the podium and the conductor. */
  conductor: 1.0,
  /** The lowest camera above the stage top. */
  height: 0.6,
  /** The boxes within this distance of the target are the body of the subject. */
  bodyReach: 0.4,
  /** The line of sight starts this far from the target, toward the camera. */
  sightStart: 0.3,
} as const;

/**
 * The lines of sight to the sight points of a subject (design 5.6). Close shots hid the face, the
 * hands, or the instrument behind heads, stands, and the piano case, because one line to the target
 * passed.
 */
const SIGHT = {
  /** A line of sight starts this far from its point, toward the camera. */
  start: 0.15,
  /** The boxes within this distance of a hand or an instrument point are a part of it. */
  reach: 0.25,
  /** At most this many lines of sight to the hands and the instrument can cross a box. */
  hiddenParts: 1,
} as const;

/** The owner of the obstacle of the podium and the conductor. */
export const CONDUCTOR_OWNER = -1;

/** The owner of an obstacle that is not a player: a music stand or the risers. */
const NO_OWNER = -2;

/** The number of steps of the search for the closest point of a segment to a box. */
const SEARCH_STEPS = 24;

/** The part of the search interval that each golden section step keeps. */
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** One box of an obstacle, with its sphere for the broad phase and its clearance. */
export interface ClearBox extends PlacedBox {
  /** Half of the diagonal of the box: a sphere of this radius around its center holds it. */
  readonly reach: number;
  /** The smallest distance from the camera to the box. */
  readonly clearance: number;
}

/** The kinds of obstacle on the stage. */
type ObstacleKind = 'conductor' | 'player' | 'stand' | 'risers';

/** One obstacle: its boxes and a circle around them in the stage plane. */
interface ClearObstacle {
  /**
   * The index of the player in `SceneLayout.players`, {@link CONDUCTOR_OWNER}, or a negative
   * value for a stand or the risers.
   */
  readonly owner: number;
  readonly kind: ObstacleKind;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** The lowest bottom of its boxes. */
  readonly minY: number;
  readonly maxY: number;
  readonly clearance: number;
  readonly boxes: readonly ClearBox[];
}

/** The obstacles of a layout for the camera tests (design 5.6). */
export interface StageClearance {
  readonly obstacles: readonly ClearObstacle[];
}

/**
 * Prepares the obstacles of a layout for the camera tests: the boxes of `layoutObstacles()`,
 * with the clearance, the owner, and the kind of each one. `layoutObstacles()` gives the
 * conductor first, if the layout has one, then the players in the order of the layout, then the
 * stands, then the risers.
 *
 * @param layout The layout.
 * @param models The player models of the score.
 * @returns The obstacles.
 */
export function prepareClearance(layout: SceneLayout, models: ModelCache): StageClearance {
  // A chamber group has no conductor, so its first obstacle is its first player (design 4.2).
  const first = layout.conductor ? 1 : 0;
  const obstacles = layoutObstacles(layout, models).map((obstacle, i): ClearObstacle => {
    const conductor = obstacle.label === CONDUCTOR_OBSTACLE;
    const clearance = conductor ? CLEARANCE.conductor : CLEARANCE.box;
    const player = i - first;
    let owner = NO_OWNER;
    let kind: ObstacleKind =
      player < layout.players.length + layout.stands.length ? 'stand' : 'risers';
    if (conductor) {
      owner = CONDUCTOR_OWNER;
      kind = 'conductor';
    } else if (player >= 0 && player < layout.players.length) {
      owner = player;
      kind = 'player';
    }
    const boxes = obstacle.boxes.map((b): ClearBox => ({
      x: b.x,
      z: b.z,
      cos: b.cos,
      sin: b.sin,
      halfX: b.halfX,
      halfZ: b.halfZ,
      minY: b.minY,
      maxY: b.maxY,
      reach: Math.hypot(b.halfX, b.halfZ, (b.maxY - b.minY) / 2),
      clearance,
    }));
    return {
      owner,
      kind,
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius,
      minY: Math.min(...boxes.map((b) => b.minY)),
      maxY: Math.max(...boxes.map((b) => b.maxY)),
      clearance,
      boxes,
    };
  });
  return { obstacles };
}

/**
 * Finds the boxes of the body of a subject: each box within 0.4 m of the target. A footprint has
 * one box for the parts of each bone in each band of 0.2 m, so the body of the subject and the
 * instrument at its chest are several boxes around the target. The line of sight skips them, and
 * a far part of a large instrument, such as the piano case, still counts (design 5.6).
 *
 * @param clearance The obstacles.
 * @param point The target.
 * @returns The boxes of the body.
 */
export function bodyBoxes(clearance: StageClearance, point: Vec3): Set<ClearBox> {
  const held = new Set<ClearBox>();
  const reach = CLEARANCE.bodyReach;
  for (const obstacle of clearance.obstacles) {
    if (Math.hypot(point[0] - obstacle.x, point[2] - obstacle.z) > obstacle.radius + reach) {
      continue;
    }
    for (const box of obstacle.boxes) {
      if (pointBoxDistance(box, point[0], point[1], point[2]) <= reach) {
        held.add(box);
      }
    }
  }
  return held;
}

/**
 * Calculates the distance from a point to a box.
 *
 * @param box The box.
 * @param x The x of the point.
 * @param y The y of the point.
 * @param z The z of the point.
 * @returns The distance, 0 inside the box.
 */
export function pointBoxDistance(box: PlacedBox, x: number, y: number, z: number): number {
  const dx = x - box.x;
  const dz = z - box.z;
  const lx = Math.abs(dx * box.cos - dz * box.sin) - box.halfX;
  const lz = Math.abs(dx * box.sin + dz * box.cos) - box.halfZ;
  const ly = Math.max(box.minY - y, y - box.maxY);
  return Math.hypot(Math.max(0, lx), Math.max(0, ly), Math.max(0, lz));
}

/** A segment in the stage axes: from a to b. */
export interface Segment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

/** The part of a segment inside the slabs of a box, from 0 at its start to 1 at its end. */
interface SlabRange {
  /** The part where the segment enters all slabs so far. */
  enter: number;
  /** The earliest part where the segment leaves a slab so far. */
  exit: number;
}

/** The scratch range of {@link segmentCrossesGrownBox}. Each call writes it before it reads it. */
const SLAB: SlabRange = { enter: 0, exit: 1 };

/**
 * Cuts the range of a segment to one slab of a box.
 *
 * @param range The range to cut.
 * @param a The coordinate of the start of the segment on the axis of the slab.
 * @param b The coordinate of the end of the segment on the axis of the slab.
 * @param min The low side of the slab.
 * @param max The high side of the slab.
 * @returns True if a part of the segment stays inside all slabs so far.
 */
function clipSlab(range: SlabRange, a: number, b: number, min: number, max: number): boolean {
  const d = b - a;
  if (Math.abs(d) < 1e-12) {
    return a >= min && a <= max;
  }
  const t0 = (min - a) / d;
  const t1 = (max - a) / d;
  range.enter = Math.max(range.enter, Math.min(t0, t1));
  range.exit = Math.min(range.exit, Math.max(t0, t1));
  return range.enter <= range.exit;
}

/**
 * Tells if a segment crosses a box that grows by a margin on each side (the slab test in the axes
 * of the box). A segment that misses the grown box keeps more than the margin from the box.
 *
 * @param box The box.
 * @param s The segment.
 * @param grow The margin, in meters.
 * @returns True if a point of the segment is inside the grown box.
 */
function segmentCrossesGrownBox(box: PlacedBox, s: Segment, grow: number): boolean {
  const ax = s.ax - box.x;
  const az = s.az - box.z;
  const bx = s.bx - box.x;
  const bz = s.bz - box.z;
  const halfX = box.halfX + grow;
  const halfZ = box.halfZ + grow;
  SLAB.enter = 0;
  SLAB.exit = 1;
  return (
    clipSlab(SLAB, ax * box.cos - az * box.sin, bx * box.cos - bz * box.sin, -halfX, halfX) &&
    clipSlab(SLAB, s.ay, s.by, box.minY - grow, box.maxY + grow) &&
    clipSlab(SLAB, ax * box.sin + az * box.cos, bx * box.sin + bz * box.cos, -halfZ, halfZ)
  );
}

/**
 * Tells if a segment crosses a box (the slab test in the axes of the box).
 *
 * @param box The box.
 * @param s The segment.
 * @returns True if a point of the segment is inside the box.
 */
export function segmentCrossesBox(box: PlacedBox, s: Segment): boolean {
  return segmentCrossesGrownBox(box, s, 0);
}

/**
 * Calculates the distance from a segment to a box. The distance from a point of the segment to
 * the box is convex along the segment, so a golden section search finds its least value.
 *
 * @param box The box.
 * @param s The segment.
 * @returns The distance, 0 if the segment crosses the box.
 */
export function segmentBoxDistance(box: PlacedBox, s: Segment): number {
  if (segmentCrossesBox(box, s)) {
    return 0;
  }
  const at = (t: number): number =>
    pointBoxDistance(
      box,
      s.ax + (s.bx - s.ax) * t,
      s.ay + (s.by - s.ay) * t,
      s.az + (s.bz - s.az) * t,
    );
  let low = 0;
  let high = 1;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const m1 = high - GOLDEN * (high - low);
    const m2 = low + GOLDEN * (high - low);
    if (at(m1) <= at(m2)) {
      high = m2;
    } else {
      low = m1;
    }
  }
  return Math.min(at(0), at(1), at((low + high) / 2));
}

/**
 * Calculates the square of the distance from a point to a segment in the stage plane. The broad
 * phase compares squares, because a square root costs more than a product.
 *
 * @param x The x of the point.
 * @param z The z of the point.
 * @param s The segment. Its y values do not count.
 * @returns The square of the distance in the plane.
 */
function flatDistanceSquared(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / length2)) : 0;
  const ex = s.ax + dx * t - x;
  const ez = s.az + dz * t - z;
  return ex * ex + ez * ez;
}

/**
 * Calculates the square of the distance from a point to a segment.
 *
 * @param x The x of the point.
 * @param y The y of the point.
 * @param z The z of the point.
 * @param s The segment.
 * @returns The square of the distance.
 */
function pointSegmentDistanceSquared(x: number, y: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const dz = s.bz - s.az;
  const length2 = dx * dx + dy * dy + dz * dz;
  const t =
    length2 > 0
      ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy + (z - s.az) * dz) / length2))
      : 0;
  const ex = s.ax + dx * t - x;
  const ey = s.ay + dy * t - y;
  const ez = s.az + dz * t - z;
  return ex * ex + ey * ey + ez * ez;
}

/**
 * Tells if a segment keeps a margin from the boxes. The broad phase skips each obstacle whose
 * square, circle, or top is far from the segment, then each box whose sphere is far from it.
 *
 * @param clearance The obstacles.
 * @param s The segment.
 * @param margin The margin for each box: its clearance (design 5.6), or 0 for a line of sight.
 * @param skip The boxes that the test skips: the body of the subject.
 * @returns True if no box comes closer than its margin.
 */
export function segmentClear(
  clearance: StageClearance,
  s: Segment,
  margin: 'clearance' | 'none',
  skip: ReadonlySet<ClearBox>,
): boolean {
  const lowY = Math.min(s.ay, s.by);
  const highY = Math.max(s.ay, s.by);
  const minX = Math.min(s.ax, s.bx);
  const maxX = Math.max(s.ax, s.bx);
  const minZ = Math.min(s.az, s.bz);
  const maxZ = Math.max(s.az, s.bz);
  for (const obstacle of clearance.obstacles) {
    const gap = margin === 'clearance' ? obstacle.clearance : 0;
    if (lowY >= obstacle.maxY + gap) {
      continue;
    }
    // The square around the circle of the obstacle misses the box around the segment.
    const reach = obstacle.radius + gap;
    if (
      obstacle.x + reach < minX ||
      obstacle.x - reach > maxX ||
      obstacle.z + reach < minZ ||
      obstacle.z - reach > maxZ
    ) {
      continue;
    }
    if (flatDistanceSquared(obstacle.x, obstacle.z, s) >= reach * reach) {
      continue;
    }
    for (const box of obstacle.boxes) {
      if (box.maxY + gap < lowY || box.minY - gap > highY) {
        continue;
      }
      const centerY = (box.minY + box.maxY) / 2;
      const boxReach = box.reach + gap;
      if (pointSegmentDistanceSquared(box.x, centerY, box.z, s) >= boxReach * boxReach) {
        continue;
      }
      // A segment that misses the box grown by the margin keeps more than the margin from it, so
      // only the other segments need the search of the distance.
      if (!segmentCrossesGrownBox(box, s, gap) || skip.has(box)) {
        continue;
      }
      if (gap === 0 || segmentBoxDistance(box, s) < gap) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Gives the obstacles that can come near a segment between two of some points, such as the
 * cameras, the target, and the sight points of one camera move (design 5.6). An obstacle whose top
 * with its clearance is below each point, or whose square with its clearance misses the box around
 * the points, also passes the broad phase of {@link segmentClear} for each such segment. Thus the
 * tests of these segments give the same results with the near obstacles alone, and each test
 * reads fewer obstacles.
 *
 * @param clearance The obstacles.
 * @param points The points. There is at least one.
 * @returns The near obstacles, in their order.
 */
export function nearClearance(clearance: StageClearance, points: readonly Vec3[]): StageClearance {
  let lowY = Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of points) {
    lowY = Math.min(lowY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const obstacles = clearance.obstacles.filter((obstacle) => {
    // The largest margin of the two kinds of test: the clearance, or 0 for a line of sight.
    const gap = Math.max(obstacle.clearance, 0);
    if (lowY >= obstacle.maxY + gap) {
      return false;
    }
    const reach = obstacle.radius + gap;
    return !(
      obstacle.x + reach < minX ||
      obstacle.x - reach > maxX ||
      obstacle.z + reach < minZ ||
      obstacle.z - reach > maxZ
    );
  });
  return { obstacles };
}

/**
 * Writes a segment.
 *
 * @param out The segment to write.
 * @param a The start.
 * @param b The end.
 * @returns `out`.
 */
function setSegment(out: Segment, a: Vec3, b: Vec3): Segment {
  out.ax = a[0];
  out.ay = a[1];
  out.az = a[2];
  out.bx = b[0];
  out.by = b[1];
  out.bz = b[2];
  return out;
}

/**
 * Tells if a camera sees its target and keeps its distances (design 5.6). The camera of a
 * narrower view stands farther out on the same ray, so one test covers a range of views.
 *
 * - The camera is at least 0.6 m above the stage top.
 * - The line of sight from 0.3 m outside the target to the farthest camera crosses no box, except
 *   the boxes of the body of the subject.
 * - Each camera from the nearest to the farthest keeps 0.6 m from each box, and 1.0 m from each
 *   box of the podium and the conductor.
 *
 * @param clearance The obstacles.
 * @param target The target.
 * @param near The camera of the widest view.
 * @param far The camera of the narrowest view, on the ray from the target through `near`.
 * @param skip The boxes of the body of the subject.
 * @returns True if the camera is clear.
 */
export function cameraClear(
  clearance: StageClearance,
  target: Vec3,
  near: Vec3,
  far: Vec3,
  skip: ReadonlySet<ClearBox>,
): boolean {
  if (Math.min(near[1], far[1]) < CLEARANCE.height) {
    return false;
  }
  if (!targetLineClear(clearance, target, far, skip)) {
    return false;
  }
  const segment: Segment = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  return segmentClear(clearance, setSegment(segment, near, far), 'clearance', skip);
}

/**
 * Tells if the line of sight from 0.3 m outside the target to a camera crosses no box, except
 * the boxes of the body of the subject (design 5.6).
 *
 * @param clearance The obstacles.
 * @param target The target.
 * @param camera The camera.
 * @param skip The boxes of the body of the subject.
 * @returns True if the line is clear.
 */
export function targetLineClear(
  clearance: StageClearance,
  target: Vec3,
  camera: Vec3,
  skip: ReadonlySet<ClearBox>,
): boolean {
  const length = Math.hypot(camera[0] - target[0], camera[1] - target[1], camera[2] - target[2]);
  const k = length > 0 ? CLEARANCE.sightStart / length : 0;
  const segment: Segment = {
    ax: target[0] + (camera[0] - target[0]) * k,
    ay: target[1] + (camera[1] - target[1]) * k,
    az: target[2] + (camera[2] - target[2]) * k,
    bx: camera[0],
    by: camera[1],
    bz: camera[2],
  };
  return segmentClear(clearance, segment, 'none', skip);
}

/** The sight points of a subject: the owner of the points, the head, and the other points. */
export interface SightPoints {
  /** The owner of the points, as in the obstacles. Its boxes do not hide its head. */
  readonly owner: number;
  readonly head: Vec3;
  readonly parts: readonly Vec3[];
}

/** One line of sight of a subject: its point and the boxes that it skips. */
interface SightLine {
  readonly point: Vec3;
  readonly skip: ReadonlySet<ClearBox>;
}

/** The lines of sight of a subject, for {@link sightsClear}. */
export interface SubjectSightLines {
  readonly head: SightLine;
  readonly parts: readonly SightLine[];
}

/**
 * Prepares the lines of sight of a subject (design 5.6). Each line skips the body of the
 * subject. The line to the head also skips all boxes of its owner, because a footprint box of
 * the head band holds the head. A line to a hand or to the instrument also skips each box within
 * 0.25 m of its point. A far part of a large instrument, such as the piano case, still counts.
 *
 * @param clearance The obstacles.
 * @param sights The sight points.
 * @param body The boxes of the body of the subject.
 * @returns The lines of sight.
 */
export function prepareSightLines(
  clearance: StageClearance,
  sights: SightPoints,
  body: ReadonlySet<ClearBox>,
): SubjectSightLines {
  const own = clearance.obstacles.find((o) => o.owner === sights.owner);
  const headSkip = new Set([...body, ...(own?.boxes ?? [])]);
  const parts = sights.parts.map((point): SightLine => {
    const skip = new Set(body);
    for (const obstacle of clearance.obstacles) {
      if (
        Math.hypot(point[0] - obstacle.x, point[2] - obstacle.z) >
        obstacle.radius + SIGHT.reach
      ) {
        continue;
      }
      for (const box of obstacle.boxes) {
        if (pointBoxDistance(box, point[0], point[1], point[2]) <= SIGHT.reach) {
          skip.add(box);
        }
      }
    }
    return { point, skip };
  });
  return { head: { point: sights.head, skip: headSkip }, parts };
}

/**
 * Tells if one line of sight from its point to a camera crosses no box. The line starts 0.15 m
 * from its point, toward the camera.
 *
 * @param clearance The obstacles.
 * @param line The line of sight.
 * @param camera The camera.
 * @param out The segment to write.
 * @returns True if the line is clear.
 */
function sightClear(
  clearance: StageClearance,
  line: SightLine,
  camera: Vec3,
  out: Segment,
): boolean {
  const [x, y, z] = line.point;
  const length = Math.hypot(camera[0] - x, camera[1] - y, camera[2] - z);
  const k = length > 0 ? SIGHT.start / length : 0;
  out.ax = x + (camera[0] - x) * k;
  out.ay = y + (camera[1] - y) * k;
  out.az = z + (camera[2] - z) * k;
  out.bx = camera[0];
  out.by = camera[1];
  out.bz = camera[2];
  return segmentClear(clearance, out, 'none', line.skip);
}

/**
 * Tells if a camera sees the sight points of a subject (design 5.6): the line of sight to the
 * head crosses no box, and at most one line to a hand or to the instrument crosses a box.
 *
 * @param clearance The obstacles.
 * @param lines The lines of sight of the subject.
 * @param camera The camera.
 * @returns True if the camera sees the subject.
 */
export function sightsClear(
  clearance: StageClearance,
  lines: SubjectSightLines,
  camera: Vec3,
): boolean {
  const segment: Segment = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  if (!sightClear(clearance, lines.head, camera, segment)) {
    return false;
  }
  let hidden = 0;
  for (const line of lines.parts) {
    if (!sightClear(clearance, line, camera, segment)) {
      hidden++;
      if (hidden > SIGHT.hiddenParts) {
        return false;
      }
    }
  }
  return true;
}
