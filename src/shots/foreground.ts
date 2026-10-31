import type { Vec3 } from '../models/tuples.ts';
import type { StageClearance } from './clearance.ts';

/** The head of a player or of the conductor on the stage, for the foreground test. */
export interface StageHead {
  /** The index of the player in `SceneLayout.players`, or `CONDUCTOR_OWNER`. */
  readonly owner: number;
  readonly center: Vec3;
  /** The radius of a sphere around the head, in meters. */
  readonly radius: number;
}

/**
 * The foreground rule of a close shot (design 5.6). Close shots showed large heads of other players
 * at the bottom edge and over the subject, and the piano case or a head of another player over a
 * large part of the frame (N1 to N3).
 */
export const FOREGROUND = {
  /**
   * A head of another player is in the foreground when it is nearer to the camera than this part
   * of the distance of the focus of the subject. Then it shows at least 1.3 times larger.
   */
  nearShare: 0.75,
  /**
   * A head of another player that is nearer than this part of the distance of the focus must
   * also stay out of the middle of the frame, where the subject is.
   */
  coverShare: 0.95,
  /**
   * The middle of the frame, in the units of the view: half its width and half its height. The
   * camera looks at the target of the subject, so the body and the instrument fill this part.
   */
  middle: [0.4, 0.6],
  /**
   * A head nearer than `coverShare` with a larger radius on the screen must stay out of the frame.
   * The unit is half the height of a landscape frame, and the geometric mean of the half sides of
   * a portrait frame, because the area of the frame sets how large a head looks. A solo shot
   * shows the head of its player with a radius of about 0.22.
   */
  edgeRadius: 0.24,
  /**
   * Such a head is out of the frame when its middle is more than this part of its radius outside
   * the frame edge. Then only a thin cap of it shows.
   */
  edgeOutside: 0.5,
  /**
   * The boxes of another object count as foreground when their middle is nearer to the camera
   * than this part of the depth of the focus. A neighbor of the subject stands at about the same
   * depth, and it does not count.
   */
  objectNear: 0.9,
  /**
   * The largest part of the frame that the foreground boxes of one other object cover: a player
   * with its instrument, the conductor with the podium, or a stand. The piano case covered 30% to
   * 45% of the shots of the first violins.
   */
  objectShare: 0.15,
  /** The cells on each side of the grid of the frame that measures the cover. */
  cells: 20,
} as const;

/** The axes of a camera, and the half sizes of its frame at a depth of 1 m. */
interface FrameAxes {
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  /** Half the height of the frame at a depth of 1 m. */
  tanV: number;
  /** Half the width of the frame at a depth of 1 m. */
  tanH: number;
}

const axes: FrameAxes = {
  fx: 0,
  fy: 0,
  fz: 1,
  rx: 1,
  rz: 0,
  ux: 0,
  uy: 1,
  uz: 0,
  tanV: 1,
  tanH: 1,
};

/**
 * Writes the axes of a camera that looks at a target, with no roll.
 *
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @returns The axes. The function writes them into one shared object.
 */
function frameAxes(camera: Vec3, target: Vec3, fov: number, aspect: number): FrameAxes {
  let fx = target[0] - camera[0];
  let fy = target[1] - camera[1];
  let fz = target[2] - camera[2];
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward × (0, 1, 0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl;
  rz /= rl;
  // up = right × forward
  axes.ux = -rz * fy;
  axes.uy = rz * fx - rx * fz;
  axes.uz = rx * fy;
  axes.fx = fx;
  axes.fy = fy;
  axes.fz = fz;
  axes.rx = rx;
  axes.rz = rz;
  axes.tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  axes.tanH = axes.tanV * aspect;
  return axes;
}

/**
 * Tells if a head of another player stands in the foreground of a close camera (design 5.6):
 *
 * - a head nearer to the camera than 0.75 times the distance of the focus of the subject, with
 *   more than a thin cap of it in the frame,
 * - a head nearer than 0.95 times that distance, with a part of it in the middle of the frame,
 *   over the subject,
 * - a head nearer than 0.95 times that distance, with a radius on the screen larger than 0.24 of
 *   half the height of the frame (of the geometric mean of the half sides of a portrait frame),
 *   with more than a thin cap of it in the frame.
 *
 * A head under the singers of a choir shot stands in front of the choir, and it covers no face
 * and no music folder: only the third rule applies to it. Its top on the screen is lower than
 * the chest of each singer of the subject (design 5.6).
 *
 * @param heads The heads of the players and of the conductor.
 * @param members The owners of the heads of the subject. Their heads do not count.
 * @param focus The point of the subject that sets the distance: the middle of the head of a
 *   solo player or of the conductor, or the target of a section.
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @param chests The chests of the singers of a choir shot, or none for the other subjects.
 * @returns True if a head stands in the foreground.
 */
export function foregroundHead(
  heads: readonly StageHead[],
  members: readonly number[],
  focus: Vec3,
  camera: Vec3,
  target: Vec3,
  fov: number,
  aspect: number,
  chests: readonly Vec3[] = [],
): boolean {
  const a = frameAxes(camera, target, fov, aspect);
  const floor = chests.length > 0 ? lowestOnScreen(chests, camera, a) : -Infinity;

  // The unit of the size of a head on the screen, at a depth of 1 m.
  const sizeTan = a.tanV * Math.min(1, Math.sqrt(aspect));
  const fx = focus[0] - camera[0];
  const fy = focus[1] - camera[1];
  const fz = focus[2] - camera[2];
  const subjectDistance2 = fx * fx + fy * fy + fz * fz;
  // The squares of the distances, so that a head behind the limit costs no square root.
  const cover2 = FOREGROUND.coverShare * FOREGROUND.coverShare * subjectDistance2;
  const near2 = FOREGROUND.nearShare * FOREGROUND.nearShare * subjectDistance2;
  const [middleX, middleY] = FOREGROUND.middle;
  const outside = FOREGROUND.edgeOutside;
  for (const head of heads) {
    const dx = head.center[0] - camera[0];
    const dy = head.center[1] - camera[1];
    const dz = head.center[2] - camera[2];
    const distance2 = dx * dx + dy * dy + dz * dz;
    if (distance2 >= cover2) {
      continue;
    }
    const depth = dx * a.fx + dy * a.fy + dz * a.fz;
    if (depth <= 0 || members.includes(head.owner)) {
      continue;
    }
    // The middle of the head in the units of the view, and the radius of the head.
    const x = Math.abs(dx * a.rx + dz * a.rz) / (depth * a.tanH);
    const up = (dx * a.ux + dy * a.uy + dz * a.uz) / (depth * a.tanV);
    const y = Math.abs(up);
    const radiusX = head.radius / (depth * a.tanH);
    const radiusY = head.radius / (depth * a.tanV);
    const under = up + radiusY < floor;
    if (!under && distance2 < near2 && x - outside * radiusX < 1 && y - outside * radiusY < 1) {
      return true;
    }
    if (!under && x - radiusX < middleX && y - radiusY < middleY) {
      return true;
    }
    const large = head.radius / (depth * sizeTan) > FOREGROUND.edgeRadius;
    if (large && x - outside * radiusX < 1 && y - outside * radiusY < 1) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the lowest point on the screen of a camera.
 *
 * @param points The points, in front of the camera.
 * @param camera The camera.
 * @param a The axes of the camera.
 * @returns The lowest y of the points, in the units of the view.
 */
function lowestOnScreen(points: readonly Vec3[], camera: Vec3, a: FrameAxes): number {
  let lowest = Infinity;
  for (const [px, py, pz] of points) {
    const dx = px - camera[0];
    const dy = py - camera[1];
    const dz = pz - camera[2];
    const depth = Math.max(dx * a.fx + dy * a.fy + dz * a.fz, 1e-6);
    lowest = Math.min(lowest, (dx * a.ux + dy * a.uy + dz * a.uz) / (depth * a.tanV));
  }

  return lowest;
}

/** The cells of the grid of the frame: the number of the last object that covers each one. */
const cellStamps = new Int32Array(FOREGROUND.cells * FOREGROUND.cells);

/** The number of the object of the last cover test. Each test of an object takes a new number. */
let stamp = 0;

/** The x and the y of the 8 corners of a box on the screen. */
const corners = new Float64Array(16);

/** The depth of the near plane of the cover test, in meters. */
const NEAR_DEPTH = 0.1;

/**
 * Tells if one other object covers more than 15% of the frame of a close camera with its
 * foreground boxes (design 5.6). The objects are the players
 * with their instruments, the conductor with the podium, and the stands. The subject players and
 * the risers do not count. A box counts when its middle is nearer to the camera than 0.9 of the
 * depth of the focus. The test marks the cells of a grid of 20 × 20 over the frame that the
 * screen rectangle of each box covers, and counts the cells of each object.
 *
 * @param clearance The obstacles of the stage.
 * @param members The owners of the subject players. Their boxes do not count.
 * @param focus The point of the subject that sets the depth.
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @returns True if an object covers too much of the frame.
 */
export function foregroundObject(
  clearance: StageClearance,
  members: readonly number[],
  focus: Vec3,
  camera: Vec3,
  target: Vec3,
  fov: number,
  aspect: number,
): boolean {
  const a = frameAxes(camera, target, fov, aspect);
  const [cx, cy, cz] = camera;
  const limit =
    FOREGROUND.objectNear *
    ((focus[0] - cx) * a.fx + (focus[1] - cy) * a.fy + (focus[2] - cz) * a.fz);
  const n = FOREGROUND.cells;
  const most = FOREGROUND.objectShare * n * n;
  for (const obstacle of clearance.obstacles) {
    if (obstacle.kind === 'risers' || members.includes(obstacle.owner)) {
      continue;
    }
    // The sphere around the obstacle: a part of it must be in front of the depth limit and in
    // the frame.
    const midY = (obstacle.minY + obstacle.maxY) / 2;
    const reach = Math.hypot(obstacle.radius, (obstacle.maxY - obstacle.minY) / 2);
    const ox = obstacle.x - cx;
    const oy = midY - cy;
    const oz = obstacle.z - cz;
    const depth = ox * a.fx + oy * a.fy + oz * a.fz;
    if (depth - reach > limit || depth + reach <= 0) {
      continue;
    }
    const side = Math.abs(ox * a.rx + oz * a.rz);
    const up = Math.abs(ox * a.ux + oy * a.uy + oz * a.uz);
    const far = Math.max(depth, 0) + reach;
    if (side - reach > far * a.tanH || up - reach > far * a.tanV) {
      continue;
    }
    stamp++;
    let covered = 0;
    for (const box of obstacle.boxes) {
      const bx = box.x - cx;
      const by = (box.minY + box.maxY) / 2 - cy;
      const bz = box.z - cz;
      if (bx * a.fx + by * a.fy + bz * a.fz > limit) {
        continue;
      }
      let ahead = false;
      for (let c = 0; c < 8; c++) {
        const lx = c & 1 ? box.halfX : -box.halfX;
        const lz = c & 2 ? box.halfZ : -box.halfZ;
        const px = bx + lx * box.cos + lz * box.sin;
        const py = (c & 4 ? box.maxY : box.minY) - cy;
        const pz = bz - lx * box.sin + lz * box.cos;
        const d = px * a.fx + py * a.fy + pz * a.fz;
        ahead ||= d > 0;
        // A corner behind the camera counts at the near plane, so the box covers more.
        const dd = Math.max(d, NEAR_DEPTH);
        corners[2 * c] = (px * a.rx + pz * a.rz) / (dd * a.tanH);
        corners[2 * c + 1] = (px * a.ux + py * a.uy + pz * a.uz) / (dd * a.tanV);
      }
      if (!ahead) {
        continue;
      }
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let c = 0; c < 16; c += 2) {
        const x = corners[c] ?? 0;
        const y = corners[c + 1] ?? 0;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      // The cells with the middle in the rectangle: the middle of cell i is -1 + (2i + 1) / n.
      const i0 = Math.max(0, Math.ceil(((x0 + 1) * n) / 2 - 0.5));
      const i1 = Math.min(n - 1, Math.floor(((x1 + 1) * n) / 2 - 0.5));
      const j0 = Math.max(0, Math.ceil(((y0 + 1) * n) / 2 - 0.5));
      const j1 = Math.min(n - 1, Math.floor(((y1 + 1) * n) / 2 - 0.5));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const cell = i * n + j;
          if (cellStamps[cell] !== stamp) {
            cellStamps[cell] = stamp;
            covered++;
          }
        }
      }
      if (covered > most) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Tells if a point is in the frame of a camera.
 *
 * @param point The point.
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @returns True if the point is in front of the camera and inside the frame.
 */
export function inFrame(
  point: Vec3,
  camera: Vec3,
  target: Vec3,
  fov: number,
  aspect: number,
): boolean {
  const a = frameAxes(camera, target, fov, aspect);
  const dx = point[0] - camera[0];
  const dy = point[1] - camera[1];
  const dz = point[2] - camera[2];
  const depth = dx * a.fx + dy * a.fy + dz * a.fz;
  if (depth <= 0) {
    return false;
  }
  const x = Math.abs(dx * a.rx + dz * a.rz) / (depth * a.tanH);
  const y = Math.abs(dx * a.ux + dy * a.uy + dz * a.uz) / (depth * a.tanV);
  return x <= 1 && y <= 1;
}
