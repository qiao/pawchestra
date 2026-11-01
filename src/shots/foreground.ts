import type { Vec3 } from '../models/tuples.ts';
import { LENS, apertureAt, blurScale } from '../scene/focus.ts';
import { cameraAxes } from './camera-keys.ts';
import type { CameraAxes } from './camera-keys.ts';
import type { StageClearance } from './clearance.ts';

/** The head of a player or of the conductor on the stage, for the foreground test. */
export interface StageHead {
  /** The index of the player in `SceneLayout.players`, or `CONDUCTOR_OWNER`. */
  readonly owner: number;
  readonly center: Vec3;
  /** The radius of a sphere around the head, in meters. */
  readonly radius: number;
}

/** A part of a body: a group of near points, with a sphere that holds them. */
export interface BodyPart {
  /** The middle of the sphere. */
  readonly center: Vec3;
  /** The radius of the sphere, in meters. */
  readonly radius: number;
  /** The index of the first point of the part in {@link StageBody}.points, a third of its offset. */
  readonly start: number;
  /** The index of the point after the last point of the part. */
  readonly end: number;
}

/** The body of an animal on the stage in the bind pose, for the distance floor of a close shot. */
export interface StageBody {
  /**
   * The points of the body with no instrument and no repeats, as x, y, z in the stage axes, in
   * the order of the parts.
   */
  readonly points: Float64Array;
  /** The middle of a sphere that holds the points. */
  readonly center: Vec3;
  /** The radius of the sphere, in meters. */
  readonly radius: number;
  /**
   * The parts of the body. A camera near a body is far from most of its parts, so most points
   * need no test.
   */
  readonly parts: readonly BodyPart[];
}

/**
 * The smallest distance from a close camera to each point of an animal body in its frame, in
 * meters (design 5.6). The low-poly animals show their facets and the seams of their meshes from
 * near. The floor holds for each animal in the frame: the subject, a neighbor, and a blurred head
 * or body of a dirty frame. It is 1.25 times the distance of the nearest animal of the side views
 * of the demos at their 5th percentile (0.95 m), the closest kind of shot in
 * `pnpm shot-trace --rules`.
 */
export const ANIMAL_FLOOR = 1.2;

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
   * The middle of the subject in the frame, in the units of the view: half its width and half its
   * height around the target. The body and the instrument fill this part.
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
  /**
   * The dirty frame (`docs/reference/camera-technique.md`): a near head, or a near box of another
   * object, that the depth of field blurs can stand at one side edge of the frame, as the shoulder
   * of an over-the-shoulder shot. Its inner edge stays this far from its side edge, as a part of
   * the frame width: one third.
   */
  dirtyShare: 1 / 3,
  /**
   * A point counts as blurred when the lens of design 4.5 gives it a blur disc in front of the
   * focus of at least this part of the image height: the near limit of the lens.
   */
  dirtyBlur: LENS.maxNearBlur,
} as const;

/**
 * Calculates the blur scale of the lens of a close frame (design 4.5): the blur disc at a depth
 * `d` in front of the focus is `scale × (focus / d - 1)`, as a part of the image height.
 *
 * @param camera The camera.
 * @param look The point that the camera looks at, which is in focus.
 * @param fov The vertical field of view, in degrees.
 * @param stageSide The stage side `S`, in meters.
 * @returns The scale.
 */
export function lensScale(camera: Vec3, look: Vec3, fov: number, stageSide: number): number {
  const focus = Math.hypot(look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]);
  return blurScale(focus, fov, apertureAt(focus, stageSide));
}

/**
 * Tells if the depth of field blurs a point in front of the focus enough for a dirty frame.
 *
 * @param depth The view depth of the point, in meters.
 * @param focus The view depth of the focus, in meters.
 * @param lens The blur scale of {@link lensScale}, or 0 for no blur.
 * @returns True if the blur disc reaches {@link FOREGROUND}.dirtyBlur.
 */
function blurred(depth: number, focus: number, lens: number): boolean {
  return depth > 0 && lens * (focus / depth - 1) >= FOREGROUND.dirtyBlur;
}

/**
 * Tells if a head of another player stands in the foreground of a close camera (design 5.6):
 *
 * - a head nearer to the camera than 0.75 times the distance of the focus of the subject, with
 *   more than a thin cap of it in the frame,
 * - a head nearer than 0.95 times that distance, with a part of it over the subject, around the
 *   place of the target in the frame,
 * - a head nearer than 0.95 times that distance, with a radius on the screen larger than 0.24 of
 *   half the height of the frame (of the geometric mean of the half sides of a portrait frame),
 *   with more than a thin cap of it in the frame.
 *
 * A head under the singers of a choir shot stands in front of the choir, and it covers no face
 * and no music folder: only the third rule applies to it. Its top on the screen is lower than
 * the chest of each singer of the subject (design 5.6).
 *
 * A near or a large head that the depth of field blurs makes a dirty frame, as the shoulder of an
 * over-the-shoulder shot, and it does not count. It stays at one side edge, with its inner edge
 * in the outer third of the width, and all such heads stay at the same side. A head over the
 * subject always counts.
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
 * @param middle The place of the target of the subject in the frame, in the units of the view:
 *   the middle of the frame, or a third line of a composition (design 5.6).
 * @param lens The blur scale of the frame ({@link lensScale}), or 0 for a frame with no blur.
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
  middle: readonly [number, number] = [0, 0],
  lens = 0,
): boolean {
  const a = cameraAxes(camera, target);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const floor = chests.length > 0 ? lowestOnScreen(chests, camera, a, tanV) : -Infinity;

  // The unit of the size of a head on the screen, at a depth of 1 m.
  const sizeTan = tanV * Math.min(1, Math.sqrt(aspect));
  const fx = focus[0] - camera[0];
  const fy = focus[1] - camera[1];
  const fz = focus[2] - camera[2];
  const subjectDistance2 = fx * fx + fy * fy + fz * fz;
  // The squares of the distances, so that a head behind the limit costs no square root.
  const cover2 = FOREGROUND.coverShare * FOREGROUND.coverShare * subjectDistance2;
  const near2 = FOREGROUND.nearShare * FOREGROUND.nearShare * subjectDistance2;
  const [middleX, middleY] = FOREGROUND.middle;
  const outside = FOREGROUND.edgeOutside;
  const focusDepth = Math.hypot(
    target[0] - camera[0],
    target[1] - camera[1],
    target[2] - camera[2],
  );
  const edge = 1 - 2 * FOREGROUND.dirtyShare;
  let dirtySide = 0;
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
    const right = (dx * a.rx + dz * a.rz) / (depth * tanH);
    const x = Math.abs(right);
    const up = (dx * a.ux + dy * a.uy + dz * a.uz) / (depth * tanV);
    const y = Math.abs(up);
    const radiusX = head.radius / (depth * tanH);
    const radiusY = head.radius / (depth * tanV);
    const under = up + radiusY < floor;
    const overX = Math.abs(right - middle[0]) - radiusX < middleX;
    if (!under && overX && Math.abs(up - middle[1]) - radiusY < middleY) {
      return true;
    }
    const near = !under && distance2 < near2;
    const large = head.radius / (depth * sizeTan) > FOREGROUND.edgeRadius;
    if ((!near && !large) || x - outside * radiusX >= 1 || y - outside * radiusY >= 1) {
      continue;
    }
    // A blurred head in the outer third of one side edge makes a dirty frame.
    const side = Math.sign(right);
    if (blurred(depth, focusDepth, lens) && x - radiusX >= edge && dirtySide !== -side) {
      dirtySide = side;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Finds the lowest point on the screen of a camera.
 *
 * @param points The points, in front of the camera.
 * @param camera The camera.
 * @param a The axes of the camera.
 * @param tanV Half the height of the frame at a depth of 1 m.
 * @returns The lowest y of the points, in the units of the view.
 */
function lowestOnScreen(
  points: readonly Vec3[],
  camera: Vec3,
  a: CameraAxes,
  tanV: number,
): number {
  let lowest = Infinity;
  for (const [px, py, pz] of points) {
    const dx = px - camera[0];
    const dy = py - camera[1];
    const dz = pz - camera[2];
    const depth = Math.max(dx * a.fx + dy * a.fy + dz * a.fz, 1e-6);
    lowest = Math.min(lowest, (dx * a.ux + dy * a.uy + dz * a.uz) / (depth * tanV));
  }

  return lowest;
}

/** The cells of the grid of the frame: the number of the last object that covers each one. */
const cellStamps = new Int32Array(FOREGROUND.cells * FOREGROUND.cells);

/**
 * The number of the object of the last cover test. Each test of an object takes a new number, so a
 * cell with an older number is free. The grid starts again before the number passes the range of
 * the grid, so a result never depends on the earlier tests.
 */
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
 * screen rectangle of each box covers, and counts the cells of each object. A box that the depth
 * of field blurs, with its screen rectangle in the outer third of one side edge, makes a dirty
 * frame and does not count, as a head of {@link foregroundHead}.
 *
 * @param clearance The obstacles of the stage.
 * @param members The owners of the subject players. Their boxes do not count.
 * @param focus The point of the subject that sets the depth.
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @param lens The blur scale of the frame ({@link lensScale}), or 0 for a frame with no blur.
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
  lens = 0,
): boolean {
  const a = cameraAxes(camera, target);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const [cx, cy, cz] = camera;
  const limit =
    FOREGROUND.objectNear *
    ((focus[0] - cx) * a.fx + (focus[1] - cy) * a.fy + (focus[2] - cz) * a.fz);
  const n = FOREGROUND.cells;
  const most = FOREGROUND.objectShare * n * n;
  const focusDepth = Math.hypot(target[0] - cx, target[1] - cy, target[2] - cz);
  const edge = 1 - 2 * FOREGROUND.dirtyShare;
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
    if (side - reach > far * tanH || up - reach > far * tanV) {
      continue;
    }
    if (stamp === 2 ** 31 - 1) {
      cellStamps.fill(0);
      stamp = 0;
    }
    stamp++;
    let covered = 0;
    for (const box of obstacle.boxes) {
      const bx = box.x - cx;
      const by = (box.minY + box.maxY) / 2 - cy;
      const bz = box.z - cz;
      const boxDepth = bx * a.fx + by * a.fy + bz * a.fz;
      if (boxDepth > limit) {
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
        corners[2 * c] = (px * a.rx + pz * a.rz) / (dd * tanH);
        corners[2 * c + 1] = (px * a.ux + py * a.uy + pz * a.uz) / (dd * tanV);
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
      if ((x1 <= -edge || x0 >= edge) && blurred(boxDepth, focusDepth, lens)) {
        continue;
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
 * Tells if a point of an animal body in the frame of a camera is nearer to the camera than
 * {@link ANIMAL_FLOOR} (design 5.6). A body or a part whose sphere is farther than the floor needs
 * no test of its points.
 *
 * @param bodies The bodies of the players and of the conductor.
 * @param camera The camera.
 * @param target The point that the camera looks at.
 * @param fov The vertical field of view, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @returns True if an animal in the frame is too near.
 */
export function animalTooNear(
  bodies: readonly StageBody[],
  camera: Vec3,
  target: Vec3,
  fov: number,
  aspect: number,
): boolean {
  const [cx, cy, cz] = camera;
  const floor2 = ANIMAL_FLOOR * ANIMAL_FLOOR;
  let a: CameraAxes | null = null;
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  for (const body of bodies) {
    const reach = ANIMAL_FLOOR + body.radius;
    const bx = body.center[0] - cx;
    const by = body.center[1] - cy;
    const bz = body.center[2] - cz;
    if (bx * bx + by * by + bz * bz >= reach * reach) {
      continue;
    }
    const p = body.points;
    for (const part of body.parts) {
      const r = part.radius;
      const px = part.center[0] - cx;
      const py = part.center[1] - cy;
      const pz = part.center[2] - cz;
      if (px * px + py * py + pz * pz >= (ANIMAL_FLOOR + r) ** 2) {
        continue;
      }
      a ??= cameraAxes(camera, target);
      // The sphere of the part is behind the camera, or outside a side plane of the frame: the
      // distance to the plane through the camera is (offset - depth × tan) / √(1 + tan²).
      const partDepth = px * a.fx + py * a.fy + pz * a.fz;
      const side = Math.abs(px * a.rx + pz * a.rz) - partDepth * tanH;
      const up = Math.abs(px * a.ux + py * a.uy + pz * a.uz) - partDepth * tanV;
      if (
        partDepth <= -r ||
        side > r * Math.sqrt(1 + tanH * tanH) ||
        up > r * Math.sqrt(1 + tanV * tanV)
      ) {
        continue;
      }
      for (let i = part.start * 3; i < part.end * 3; i += 3) {
        const dx = (p[i] ?? 0) - cx;
        const dy = (p[i + 1] ?? 0) - cy;
        const dz = (p[i + 2] ?? 0) - cz;
        if (dx * dx + dy * dy + dz * dz >= floor2) {
          continue;
        }
        const depth = dx * a.fx + dy * a.fy + dz * a.fz;
        if (
          depth > 0 &&
          Math.abs(dx * a.rx + dz * a.rz) <= depth * tanH &&
          Math.abs(dx * a.ux + dy * a.uy + dz * a.uz) <= depth * tanV
        ) {
          return true;
        }
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
  const a = cameraAxes(camera, target);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const dx = point[0] - camera[0];
  const dy = point[1] - camera[1];
  const dz = point[2] - camera[2];
  const depth = dx * a.fx + dy * a.fy + dz * a.fz;
  if (depth <= 0) {
    return false;
  }
  const x = Math.abs(dx * a.rx + dz * a.rz) / (depth * tanH);
  const y = Math.abs(dx * a.ux + dy * a.uy + dz * a.uz) / (depth * tanV);
  return x <= 1 && y <= 1;
}
