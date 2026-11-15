import type { PlacedBox } from '../models/footprint.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { StageClearance } from '../shots/clearance.ts';

/**
 * The largest pointer motion of a click on the stage, in CSS pixels. A longer motion is a drag of
 * the orbit controls (design 2.5).
 */
export const CLICK_SLOP_PX = 4;

/** A pointer position on the canvas, in CSS pixels. */
export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Tells if a press and a release of the pointer are a click, and not a drag of the view.
 *
 * @param down The position of the press.
 * @param up The position of the release.
 * @returns True if the pointer moved at most {@link CLICK_SLOP_PX}.
 */
export function isClick(down: PointerPoint, up: PointerPoint): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}

/** A ray in the stage axes: a start point and a direction. */
export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

/**
 * Calculates where a ray enters a box (design 2.3). The box turns about the vertical axis, so the
 * test moves the ray into the axes of the box first, then clips it with the three slabs.
 *
 * @param box The box.
 * @param ray The ray.
 * @returns The distance along the ray, in units of its direction, or `null` for a miss.
 */
function rayBoxDistance(box: PlacedBox, ray: Ray): number | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const rx = ox - box.x;
  const rz = oz - box.z;
  const midY = (box.minY + box.maxY) / 2;
  const origin = [rx * box.cos - rz * box.sin, oy - midY, rx * box.sin + rz * box.cos] as const;
  const direction = [dx * box.cos - dz * box.sin, dy, dx * box.sin + dz * box.cos] as const;
  const halves = [box.halfX, (box.maxY - box.minY) / 2, box.halfZ] as const;
  let enter = 0;
  let exit = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis] ?? 0;
    const d = direction[axis] ?? 0;
    const half = halves[axis] ?? 0;
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > half) {
        return null;
      }
      continue;
    }
    const a = (-half - o) / d;
    const b = (half - o) / d;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) {
      return null;
    }
  }
  return enter;
}

/**
 * Finds the player under a click on the stage (design 2.3): the nearest player or conductor of the
 * clearance boxes (`prepareClearance()` of `shots/clearance.ts`) that the ray enters. The ray goes
 * through the stands and the risers, because the box of a thin stand covers the player behind
 * it.
 *
 * @param clearance The obstacles of the layout.
 * @param ray The ray of the click.
 * @returns The index of the player in the layout, `null` for the floor or the empty space, or
 *   `undefined` for the conductor.
 */
export function pickPlayer(clearance: StageClearance, ray: Ray): number | null | undefined {
  let nearest = Number.POSITIVE_INFINITY;
  let hit: number | null | undefined = null;
  for (const obstacle of clearance.obstacles) {
    if (obstacle.kind !== 'player' && obstacle.kind !== 'conductor') {
      continue;
    }
    for (const box of obstacle.boxes) {
      const distance = rayBoxDistance(box, ray);
      if (distance !== null && distance < nearest) {
        nearest = distance;
        hit = obstacle.kind === 'player' ? obstacle.owner : undefined;
      }
    }
  }
  return hit;
}
