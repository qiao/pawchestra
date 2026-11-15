import type { PlayerPlace } from '../models/layout.ts';
import type { PlayerModel } from '../models/player.ts';
import { STUDIO_BONES } from '../models/studio-format.ts';
import { createStudioPose, poseStudioBones, studioOffsets } from '../models/studio-rig.ts';
import type { StudioPose } from '../models/studio-rig.ts';
import type { StudioMesh } from '../models/studio-format.ts';
import type { Vec3 } from '../models/tuples.ts';
import type { AnimalPose } from '../pose/types.ts';
import { blurAt, heroFocusDepth } from '../scene/focus.ts';
import { cameraAxes } from './camera-keys.ts';
import type { StageClearance } from './clearance.ts';
import { onStage } from './subjects.ts';

/**
 * The frame rules of a detail insert (design 5.6). Inserts of the bell of a trumpet showed the
 * music stand over the lower third of the frame and a cut through the eyes of the player. Inserts
 * of the keys showed the near shoulder and arm of the pianist as a soft wall of fur over about
 * half of the frame.
 */
export const INSERT_FRAME = {
  /**
   * The largest part of the frame that the objects in front of the detail cover together: the
   * body of each player, also the near arm and the shoulder of the player of the detail, and each
   * stand, desk, seat, or instrument that is not the detail. It is the share of the foreground
   * rule of a close shot.
   */
  coverShare: 0.15,
  /** The cells on each side of the grid of the frame that measures the cover. */
  cells: 20,
  /**
   * The cells of the grid around the middle of the frame, where the detail is, on each side of
   * the middle: an object in front of the detail must leave each of them free.
   */
  detailCells: 1,
  /**
   * A part of the player of the detail counts as the detail when its middle is nearer to the
   * detail than this part of the half height of the frame of the detail, such as the paws on the
   * keys or the bell of a trumpet.
   */
  detailReach: 1,
  /**
   * An object is in front of the detail when its middle is nearer to the camera than this part of
   * the depth of the detail. A stand that stands 0.2 m in front of a bell covers it, so the limit
   * is near 1.
   */
  near: 0.98,
  /**
   * The eyes of the player of the detail stay this part of the half frame inside each edge, when
   * a part of its head is in the frame. A frame edge through the eyes or the face looked like a
   * mistake.
   */
  eyeMargin: 0.15,
  /**
   * A part of the player of the detail is soft when the lens gives it a blur disc of at least
   * this part of the image height (`blurAt()` of `scene/focus.ts`): about 4 px at a height of
   * 900 px.
   */
  softBlur: 0.01,
  /**
   * The largest part of the frame that the soft parts of the player of the detail cover, in front
   * of the detail or behind it. The belly of a horn player behind the bell made a soft wall of fur
   * over about half of the frame.
   */
  softShare: 0.2,
  /**
   * The face rule does not hold for a head seen from behind: the cosine of the angle between the
   * face, from the middle of the head to the middle of the eyes, and the camera is below this
   * value.
   */
  backView: -0.3,
  /** The factor of the radius of a group of triangles in the bind pose, for the stretch of the skin. */
  reachMargin: 1.5,
} as const;

/** The depth of the near plane of the cover test, in meters. */
const NEAR_DEPTH = 0.1;

/** A player in the pose of one song time, for the tests of a detail insert (design 5.6). */
export interface PosedPlayer {
  /** The player model. */
  readonly model: PlayerModel;
  /** The pose of the bones of the studio body and of the player. */
  readonly pose: StudioPose;
  /** The middle of the head in the stage axes. */
  readonly head: Vec3;
  /** The middles of the two eyes in the stage axes. */
  readonly eyes: readonly [Vec3, Vec3];
  /** The place of the model on the stage. */
  readonly place: Pick<PlayerPlace, 'position' | 'facing'>;
}

/**
 * Moves a point of the model axes with the pose matrix of one bone.
 *
 * @param matrices The pose matrices, 16 numbers for each bone, column by column.
 * @param bone The index of the bone in the matrices.
 * @param point The point in the bind pose, in the model axes.
 * @returns The posed point, in the model axes.
 */
function moveByBone(matrices: Float32Array, bone: number, point: Vec3): Vec3 {
  const b = bone * 16;
  const [x, y, z] = point;
  const m = (k: number): number => matrices[b + k] ?? 0;
  return [
    m(0) * x + m(4) * y + m(8) * z + m(12),
    m(1) * x + m(5) * y + m(9) * z + m(13),
    m(2) * x + m(6) * y + m(10) * z + m(14),
  ];
}

/**
 * Poses the bones of a player as the scene does (design 4.4, 5.1), and gives the middles of its
 * head and its eyes. The cover test poses its mesh on the first read (`posedMesh()`).
 *
 * @param model The player model.
 * @param pose The pose of the player at the song time.
 * @param place The place of the player on the stage.
 * @returns The posed player.
 */
export function posePlayer(
  model: PlayerModel,
  pose: AnimalPose,
  place: Pick<PlayerPlace, 'position' | 'facing'>,
): PosedPlayer {
  const { skeleton, studio } = model;
  const studioPose = poseStudioBones(
    studio,
    skeleton,
    pose.rotations,
    studioOffsets(pose),
    1,
    createStudioPose(),
  );
  const m = studioPose.matrices;
  const { heads, headCenter } = studio.body;
  const studioPoint = (name: (typeof STUDIO_BONES)[number], point: Vec3): Vec3 =>
    onStage(moveByBone(m, STUDIO_BONES.indexOf(name), point), place);
  return {
    model,
    pose: studioPose,
    head: studioPoint('head', headCenter),
    eyes: [studioPoint('eye_L', heads.eye_L), studioPoint('eye_R', heads.eye_R)],
    place,
  };
}

/**
 * Moves the vertices of a studio mesh to a pose, as `skinStudioMesh()` of `models/studio-rig.ts`
 * does, with index loops: an iterator for each vertex made most of the time of the cover test.
 *
 * @param mesh The studio mesh.
 * @param pose The pose of the bones.
 * @returns The posed places, three numbers for each vertex, in the model axes.
 */
function skinBody(mesh: StudioMesh, pose: StudioPose): Float32Array {
  const out = new Float32Array(mesh.positions.length);
  const m = pose.matrices;
  // The corrective moves with a weight, so that each vertex skips the others.
  const active = mesh.correctives.flatMap((moves, c) => {
    const w = pose.correctives[c] ?? 0;
    return w === 0 ? [] : [{ moves, w }];
  });
  const count = mesh.positions.length / 3;
  for (let v = 0; v < count; v++) {
    let x = mesh.positions[v * 3] ?? 0;
    let y = mesh.positions[v * 3 + 1] ?? 0;
    let z = mesh.positions[v * 3 + 2] ?? 0;
    for (let c = 0; c < active.length; c++) {
      const item = active[c];
      if (item) {
        x += item.w * (item.moves[v * 3] ?? 0);
        y += item.w * (item.moves[v * 3 + 1] ?? 0);
        z += item.w * (item.moves[v * 3 + 2] ?? 0);
      }
    }
    let px = 0;
    let py = 0;
    let pz = 0;
    for (let k = 0; k < 4; k++) {
      const w = mesh.weights[v * 4 + k] ?? 0;
      if (w === 0) {
        continue;
      }
      const b = (mesh.joints[v * 4 + k] ?? 0) * 16;
      px += w * ((m[b] ?? 0) * x + (m[b + 4] ?? 0) * y + (m[b + 8] ?? 0) * z + (m[b + 12] ?? 0));
      py +=
        w * ((m[b + 1] ?? 0) * x + (m[b + 5] ?? 0) * y + (m[b + 9] ?? 0) * z + (m[b + 13] ?? 0));
      pz +=
        w * ((m[b + 2] ?? 0) * x + (m[b + 6] ?? 0) * y + (m[b + 10] ?? 0) * z + (m[b + 14] ?? 0));
    }
    out[v * 3] = px;
    out[v * 3 + 1] = py;
    out[v * 3 + 2] = pz;
  }
  return out;
}

/** The mesh of a posed player in the stage axes. */
interface PosedMesh {
  /** x, y, z of each vertex of the studio body. */
  readonly body: Float32Array;
  /**
   * x, y, z of each corner of the mesh of the model after the corners of the body: the
   * instrument and the seat, three corners for each triangle.
   */
  readonly extra: Float32Array;
}

/** The posed mesh of each posed player, made on the first read. */
const meshCache = new WeakMap<PosedPlayer, PosedMesh>();

/**
 * Poses the mesh of a player as the scene draws it (design 4.4): the body with the skin of the
 * studio, and the instrument and the seat on the bones of the player.
 *
 * @param posed The posed player.
 * @returns The posed mesh in the stage axes.
 */
function posedMesh(posed: PosedPlayer): PosedMesh {
  const known = meshCache.get(posed);
  if (known) {
    return known;
  }

  const { mesh, studio } = posed.model;
  const m = posed.pose.matrices;
  const body = skinBody(studio.mesh, posed.pose);
  const cos = Math.cos(posed.place.facing);
  const sin = Math.sin(posed.place.facing);
  const [px, py, pz] = posed.place.position;
  for (let v = 0; v < body.length; v += 3) {
    const x = body[v] ?? 0;
    const z = body[v + 2] ?? 0;
    body[v] = px + x * cos + z * sin;
    body[v + 1] = py + (body[v + 1] ?? 0);
    body[v + 2] = pz - x * sin + z * cos;
  }

  // The other corners follow one or two bones of the player, as the GPU skin does.
  const bodyCorners = studio.mesh.corners.length;
  const extra = new Float32Array(mesh.positions.length - bodyCorners * 3);
  const studioCount = STUDIO_BONES.length;
  const { positions, bones, blendBones, blendWeights } = mesh;
  for (let c = bodyCorners; c < bones.length; c++) {
    const lx = positions[c * 3] ?? 0;
    const ly = positions[c * 3 + 1] ?? 0;
    const lz = positions[c * 3 + 2] ?? 0;
    const bone = bones[c] ?? 0;
    const blend = blendBones[c] ?? bone;
    const w = blend === bone ? 0 : (blendWeights[c] ?? 0);
    const i = (studioCount + bone) * 16;
    let x = (m[i] ?? 0) * lx + (m[i + 4] ?? 0) * ly + (m[i + 8] ?? 0) * lz + (m[i + 12] ?? 0);
    let y = (m[i + 1] ?? 0) * lx + (m[i + 5] ?? 0) * ly + (m[i + 9] ?? 0) * lz + (m[i + 13] ?? 0);
    let z = (m[i + 2] ?? 0) * lx + (m[i + 6] ?? 0) * ly + (m[i + 10] ?? 0) * lz + (m[i + 14] ?? 0);
    if (w !== 0) {
      const j = (studioCount + blend) * 16;
      const bx = (m[j] ?? 0) * lx + (m[j + 4] ?? 0) * ly + (m[j + 8] ?? 0) * lz + (m[j + 12] ?? 0);
      const by =
        (m[j + 1] ?? 0) * lx + (m[j + 5] ?? 0) * ly + (m[j + 9] ?? 0) * lz + (m[j + 13] ?? 0);
      const bz =
        (m[j + 2] ?? 0) * lx + (m[j + 6] ?? 0) * ly + (m[j + 10] ?? 0) * lz + (m[j + 14] ?? 0);
      x += (bx - x) * w;
      y += (by - y) * w;
      z += (bz - z) * w;
    }
    const e = (c - bodyCorners) * 3;
    extra[e] = px + x * cos + z * sin;
    extra[e + 1] = py + y;
    extra[e + 2] = pz - x * sin + z * cos;
  }
  const posedMeshValue = { body, extra };
  meshCache.set(posed, posedMeshValue);
  return posedMeshValue;
}

/**
 * Gives the place of a point of the instrument of a posed player on the stage.
 *
 * @param posed The posed player.
 * @param bone The bone of the player that the point follows, as an index in `BONE_NAMES`.
 * @param point The point in the bind pose, in the model axes.
 * @returns The posed point on the stage.
 */
export function posedPoint(posed: PosedPlayer, bone: number, point: Vec3): Vec3 {
  return onStage(moveByBone(posed.pose.matrices, STUDIO_BONES.length + bone, point), posed.place);
}

/**
 * Gives the middle of two points.
 *
 * @param a A point.
 * @param b Another point.
 * @returns The middle.
 */
export function middleOf(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/** The view of an insert camera for its frame tests. */
export interface InsertView {
  readonly camera: Vec3;
  /** The point that the camera looks at: the detail, in the middle of the frame. */
  readonly target: Vec3;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
  /** The width of the frame divided by its height. */
  readonly aspect: number;
  /** The blur scale of the lens of the frame (`lensScale()` of `foreground.ts`). */
  readonly lens: number;
}

/** The detail of an insert: a point, or a line of keys or bars, with its reach. */
export interface InsertDetailPart {
  /** One end of the detail line, or the point. */
  readonly from: Vec3;
  /** The other end, or the point. */
  readonly to: Vec3;
  /** The distance from the line within which a part of the player is the detail, in meters. */
  readonly reach: number;
}

/** The cover of the frame of an insert by the objects in front of its detail. */
export interface InsertCover {
  /** The part of the cells of the frame that the objects cover, from 0 to 1. */
  readonly share: number;
  /** True if an object covers a cell around the middle of the frame, where the detail is. */
  readonly detail: boolean;
  /**
   * The part of the cells of the frame that the blurred parts of the player of the detail cover,
   * in front of the detail or behind it, from 0 to 1.
   */
  readonly soft: number;
}

/** The studio bones of the paws: a part on them near the detail is the detail. */
const PAW_BONES: ReadonlySet<number> = new Set(
  STUDIO_BONES.flatMap((name, i) => (/^(hand|fingers|digit|thumb)/.test(name) ? [i] : [])),
);

/** The paw flag of each vertex of each studio mesh, made on the first read. */
const pawCache = new WeakMap<StudioMesh, Uint8Array>();

/**
 * Gives a flag for each vertex of a studio mesh: 1 when its bone with the largest weight is a
 * bone of a paw.
 *
 * @param mesh The studio mesh.
 * @returns The flags.
 */
function pawVerticesOf(mesh: StudioMesh): Uint8Array {
  const known = pawCache.get(mesh);
  if (known) {
    return known;
  }

  const count = mesh.positions.length / 3;
  const out = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) {
      if ((mesh.weights[v * 4 + k] ?? 0) > (mesh.weights[v * 4 + best] ?? 0)) {
        best = k;
      }
    }
    out[v] = PAW_BONES.has(mesh.joints[v * 4 + best] ?? 0) ? 1 : 0;
  }
  pawCache.set(mesh, out);
  return out;
}

/** A group of near triangles of a mesh, which the cover test skips together. */
interface TriangleGroup {
  /**
   * The corner whose posed place is the middle of the sphere of the group: a vertex of the
   * studio body, or a corner after the body corners as `-1 - index` of the extra corners.
   */
  readonly anchor: number;
  /** The radius of the sphere around the anchor, in meters, with `INSERT_FRAME.reachMargin`. */
  readonly radius: number;
  /** The triangles of the group, by their index in the mesh of the model. */
  readonly triangles: Uint32Array;
}

/** The size of the cells of the grid that groups the triangles, in meters. */
const GROUP_CELL = 0.2;

/** The triangle groups of each model, made on the first read. */
const groupCache = new WeakMap<PlayerModel, readonly TriangleGroup[]>();

/**
 * Groups the triangles of the mesh of a model by the cell of a grid of their middles in the bind
 * pose: the body and the other parts apart. The cover test skips a group whose sphere is outside
 * the narrow frame of an insert, and most groups are outside it.
 *
 * @param model The player model.
 * @returns The groups.
 */
function triangleGroups(model: PlayerModel): readonly TriangleGroup[] {
  const known = groupCache.get(model);
  if (known) {
    return known;
  }

  const { mesh, studio } = model;
  const bodyCorners = studio.mesh.corners.length;
  const cornerOf = (c: number): [source: Float32Array, index: number] =>
    c < bodyCorners ? [studio.mesh.positions, studio.mesh.corners[c] ?? 0] : [mesh.positions, c];
  const cells = new Map<string, number[]>();
  for (let tri = 0; tri < mesh.bones.length / 3; tri++) {
    const middle = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const [source, index] = cornerOf(tri * 3 + k);
      for (let a = 0; a < 3; a++) {
        middle[a] = (middle[a] ?? 0) + (source[index * 3 + a] ?? 0) / 3;
      }
    }
    const key = `${tri * 3 < bodyCorners ? 'b' : 'e'} ${middle.map((v) => Math.floor(v / GROUP_CELL)).join(' ')}`;
    const list = cells.get(key) ?? [];
    list.push(tri);
    cells.set(key, list);
  }
  const groups = [...cells.values()].map((triangles): TriangleGroup => {
    const first = (triangles[0] ?? 0) * 3;
    const [source, index] = cornerOf(first);
    let radius = 0;
    for (const tri of triangles) {
      for (let k = 0; k < 3; k++) {
        const [s, i] = cornerOf(tri * 3 + k);
        radius = Math.max(
          radius,
          Math.hypot(
            (s[i * 3] ?? 0) - (source[index * 3] ?? 0),
            (s[i * 3 + 1] ?? 0) - (source[index * 3 + 1] ?? 0),
            (s[i * 3 + 2] ?? 0) - (source[index * 3 + 2] ?? 0),
          ),
        );
      }
    }
    return {
      anchor: first < bodyCorners ? index : -1 - (first - bodyCorners),
      radius: radius * INSERT_FRAME.reachMargin,
      triangles: Uint32Array.from(triangles),
    };
  });
  groupCache.set(model, groups);
  return groups;
}

/** The x, y, z of the three corners of the triangle of the cover test. */
const triangle = new Float64Array(9);

/** The cells of the grid of the frame: 1 for a cell that an object covers. */
const cellCover = new Uint8Array(INSERT_FRAME.cells * INSERT_FRAME.cells);

/** The cells of the grid of the frame: 1 for a cell that a blurred part of the player covers. */
const softCover = new Uint8Array(INSERT_FRAME.cells * INSERT_FRAME.cells);

/** The x and the y of the 8 corners of a box on the screen. */
const boxCorners = new Float64Array(16);

/**
 * Gives the distance from a point to a line segment.
 *
 * @param x The x of the point.
 * @param y The y of the point.
 * @param z The z of the point.
 * @param a One end of the segment.
 * @param b The other end.
 * @returns The distance, in meters.
 */
function segmentDistance(x: number, y: number, z: number, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length2 = dx * dx + dy * dy + dz * dz;
  const t =
    length2 > 0
      ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / length2))
      : 0;
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t);
}

/**
 * Marks the cells of the grid whose middles are inside a triangle on the screen.
 *
 * @param ax The x of the first corner, in the units of the view.
 * @param ay The y of the first corner.
 * @param bx The x of the second corner.
 * @param by The y of the second corner.
 * @param cx The x of the third corner.
 * @param cy The y of the third corner.
 * @param grid The grid to mark.
 * @returns The number of cells that the call marks for the first time.
 */
function markTriangle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  grid: Uint8Array = cellCover,
): number {
  const n = INSERT_FRAME.cells;
  const i0 = Math.max(0, Math.ceil(((Math.min(ax, bx, cx) + 1) * n) / 2 - 0.5));
  const i1 = Math.min(n - 1, Math.floor(((Math.max(ax, bx, cx) + 1) * n) / 2 - 0.5));
  const j0 = Math.max(0, Math.ceil(((Math.min(ay, by, cy) + 1) * n) / 2 - 0.5));
  const j1 = Math.min(n - 1, Math.floor(((Math.max(ay, by, cy) + 1) * n) / 2 - 0.5));
  if (i0 > i1 || j0 > j1) {
    return 0;
  }
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) {
    return 0;
  }
  let marked = 0;
  for (let i = i0; i <= i1; i++) {
    const x = -1 + (2 * i + 1) / n;
    for (let j = j0; j <= j1; j++) {
      const y = -1 + (2 * j + 1) / n;
      // The middle of the cell is inside when the three edge functions have the sign of the area.
      const e0 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * area;
      const e1 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) * area;
      const e2 = ((ax - cx) * (y - cy) - (ay - cy) * (x - cx)) * area;
      if (e0 >= 0 && e1 >= 0 && e2 >= 0 && grid[i * n + j] === 0) {
        grid[i * n + j] = 1;
        marked++;
      }
    }
  }
  return marked;
}

/**
 * Measures the cover of the frame of an insert by the objects in front of its detail (design
 * 5.6): the posed body, instrument, and seat of the player of the detail, except the parts within
 * the reach of the detail, and the boxes of each other player, the conductor, and each stand. A
 * part or a box counts when its middle is nearer to the camera than `INSERT_FRAME.near` of the
 * depth of the detail. The test marks the cells of a grid of 20 × 20 over the frame. It stops
 * when the cover passes `INSERT_FRAME.coverShare`, so the share is then a part of the cover.
 *
 * @param view The view of the camera.
 * @param posed The player of the detail in the pose of the middle of the insert.
 * @param owner The owner of the player of the detail in the obstacles.
 * @param detail The detail.
 * @param clearance The obstacles of the stage.
 * @returns The cover.
 */
export function insertCover(
  view: InsertView,
  posed: PosedPlayer,
  owner: number,
  detail: InsertDetailPart,
  clearance: StageClearance,
): InsertCover {
  const { camera, target, fov, aspect } = view;
  const { fx, fy, fz, rx, rz, ux, uy, uz } = cameraAxes(camera, target);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const [cx, cy, cz] = camera;
  const limit =
    INSERT_FRAME.near * ((target[0] - cx) * fx + (target[1] - cy) * fy + (target[2] - cz) * fz);
  cellCover.fill(0);

  const n = INSERT_FRAME.cells;
  const most = INSERT_FRAME.coverShare * n * n;
  let covered = 0;
  for (const obstacle of clearance.obstacles) {
    if (obstacle.kind === 'risers' || obstacle.owner === owner) {
      continue;
    }
    // The sphere around the obstacle: a part of it must be in front of the depth limit and in the
    // frame.
    const ox = obstacle.x - cx;
    const oy = (obstacle.minY + obstacle.maxY) / 2 - cy;
    const oz = obstacle.z - cz;
    const reach = Math.hypot(obstacle.radius, (obstacle.maxY - obstacle.minY) / 2);
    const depth = ox * fx + oy * fy + oz * fz;
    if (
      depth - reach > limit ||
      depth + reach <= 0 ||
      Math.abs(ox * rx + oz * rz) - reach > Math.max(depth + reach, 0) * tanH ||
      Math.abs(ox * ux + oy * uy + oz * uz) - reach > Math.max(depth + reach, 0) * tanV
    ) {
      continue;
    }
    for (const box of obstacle.boxes) {
      const bx = box.x - cx;
      const by = (box.minY + box.maxY) / 2 - cy;
      const bz = box.z - cz;
      const boxDepth = bx * fx + by * fy + bz * fz;
      if (boxDepth > limit || boxDepth + box.reach <= 0) {
        continue;
      }
      for (let c = 0; c < 8; c++) {
        const lx = c & 1 ? box.halfX : -box.halfX;
        const lz = c & 2 ? box.halfZ : -box.halfZ;
        const qx = bx + lx * box.cos + lz * box.sin;
        const qy = (c & 4 ? box.maxY : box.minY) - cy;
        const qz = bz - lx * box.sin + lz * box.cos;
        const d = Math.max(qx * fx + qy * fy + qz * fz, NEAR_DEPTH);
        boxCorners[2 * c] = (qx * rx + qz * rz) / (d * tanH);
        boxCorners[2 * c + 1] = (qx * ux + qy * uy + qz * uz) / (d * tanV);
      }
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let c = 0; c < 16; c += 2) {
        x0 = Math.min(x0, boxCorners[c] ?? 0);
        x1 = Math.max(x1, boxCorners[c] ?? 0);
        y0 = Math.min(y0, boxCorners[c + 1] ?? 0);
        y1 = Math.max(y1, boxCorners[c + 1] ?? 0);
      }
      covered += markTriangle(x0, y0, x1, y0, x1, y1);
      covered += markTriangle(x0, y0, x1, y1, x0, y1);
    }
  }

  const { body, extra } = posedMesh(posed);
  const { studio } = posed.model;
  const corners = studio.mesh.corners;
  const bodyCorners = corners.length;
  const paws = pawVerticesOf(studio.mesh);
  const groups = triangleGroups(posed.model);
  // The focus of the scene: the nearer eye in the frame, else the detail (design 4.5, 5.6).
  const focus =
    heroFocusDepth(
      { position: camera, target, fov, aspect },
      { eyeL: posed.eyes[0], eyeR: posed.eyes[1], head: posed.head },
      true,
    ) ?? Math.hypot(target[0] - cx, target[1] - cy, target[2] - cz);
  softCover.fill(0);
  let soft = 0;
  for (const group of groups) {
    const g = group.anchor >= 0 ? body : extra;
    const gi = (group.anchor >= 0 ? group.anchor : -1 - group.anchor) * 3;
    const gx = (g[gi] ?? 0) - cx;
    const gy = (g[gi + 1] ?? 0) - cy;
    const gz = (g[gi + 2] ?? 0) - cz;
    const gr = group.radius;
    const groupDepth = gx * fx + gy * fy + gz * fz;
    if (
      groupDepth <= -gr ||
      Math.abs(gx * rx + gz * rz) - gr > Math.max(groupDepth + gr, 0) * tanH ||
      Math.abs(gx * ux + gy * uy + gz * uz) - gr > Math.max(groupDepth + gr, 0) * tanV
    ) {
      continue;
    }
    for (const tri of group.triangles) {
      const c = tri * 3;
      let paw = c < bodyCorners;
      for (let k = 0; k < 3; k++) {
        if (c < bodyCorners) {
          const v = corners[c + k] ?? 0;
          paw &&= paws[v] === 1;
          triangle[k * 3] = body[v * 3] ?? 0;
          triangle[k * 3 + 1] = body[v * 3 + 1] ?? 0;
          triangle[k * 3 + 2] = body[v * 3 + 2] ?? 0;
        } else {
          const e = (c + k - bodyCorners) * 3;
          triangle[k * 3] = extra[e] ?? 0;
          triangle[k * 3 + 1] = extra[e + 1] ?? 0;
          triangle[k * 3 + 2] = extra[e + 2] ?? 0;
        }
      }
      const wx = ((triangle[0] ?? 0) + (triangle[3] ?? 0) + (triangle[6] ?? 0)) / 3;
      const wy = ((triangle[1] ?? 0) + (triangle[4] ?? 0) + (triangle[7] ?? 0)) / 3;
      const wz = ((triangle[2] ?? 0) + (triangle[5] ?? 0) + (triangle[8] ?? 0)) / 3;
      const mx = wx - cx;
      const my = wy - cy;
      const mz = wz - cz;
      const depth = mx * fx + my * fy + mz * fz;
      if (depth <= 0) {
        continue;
      }
      // A part of the instrument or a paw near the detail is the detail. Each other part of the
      // body counts, such as the belly behind the bell of a horn.
      if (
        (paw || c >= bodyCorners) &&
        segmentDistance(wx, wy, wz, detail.from, detail.to) < detail.reach
      ) {
        continue;
      }
      const front = depth < limit;
      const blurred = Math.abs(blurAt(depth, focus, view.lens)) >= INSERT_FRAME.softBlur;
      if (!front && !blurred) {
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const dx = (triangle[3 * k] ?? 0) - cx;
        const dy = (triangle[3 * k + 1] ?? 0) - cy;
        const dz = (triangle[3 * k + 2] ?? 0) - cz;
        const d = Math.max(dx * fx + dy * fy + dz * fz, NEAR_DEPTH);
        boxCorners[2 * k] = (dx * rx + dz * rz) / (d * tanH);
        boxCorners[2 * k + 1] = (dx * ux + dy * uy + dz * uz) / (d * tanV);
      }
      const ax = boxCorners[0] ?? 0;
      const ay = boxCorners[1] ?? 0;
      const bx = boxCorners[2] ?? 0;
      const by = boxCorners[3] ?? 0;
      const qx = boxCorners[4] ?? 0;
      const qy = boxCorners[5] ?? 0;
      if (blurred) {
        soft += markTriangle(ax, ay, bx, by, qx, qy, softCover);
      }
      if (front) {
        covered += markTriangle(ax, ay, bx, by, qx, qy);
        if (covered > most) {
          return { share: covered / (n * n), detail: false, soft: soft / (n * n) };
        }
      }
    }
  }

  let middle = false;
  const k = INSERT_FRAME.detailCells;
  for (let i = n / 2 - k; i < n / 2 + k; i++) {
    for (let j = n / 2 - k; j < n / 2 + k; j++) {
      middle ||= cellCover[i * n + j] === 1;
    }
  }
  return { share: covered / (n * n), detail: middle, soft: soft / (n * n) };
}

/**
 * Tells if the frame of an insert cuts the face of the player of its detail (design 5.6). The
 * head is fully out of the frame, or both eyes are in the frame with `INSERT_FRAME.eyeMargin`.
 * Each other frame cuts through the eyes or the face.
 *
 * @param view The view of the camera.
 * @param posed The player of the detail in the pose of the middle of the insert.
 * @param headRadius The radius of a sphere around the head, with the snout, in meters.
 * @returns True if the frame cuts the face.
 */
export function cutsFace(view: InsertView, posed: PosedPlayer, headRadius: number): boolean {
  const { camera, target, fov, aspect } = view;
  const { fx, fy, fz, rx, rz, ux, uy, uz } = cameraAxes(camera, target);
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  const screen = (point: Vec3): [x: number, y: number, depth: number] => {
    const dx = point[0] - camera[0];
    const dy = point[1] - camera[1];
    const dz = point[2] - camera[2];
    const depth = dx * fx + dy * fy + dz * fz;
    const d = Math.max(depth, 1e-6);
    return [(dx * rx + dz * rz) / (d * tanH), (dx * ux + dy * uy + dz * uz) / (d * tanV), depth];
  };

  // The sphere of the head is outside a plane of the frame: the distance to the plane through the
  // camera is (offset - depth × tan) / √(1 + tan²).
  const [hx, hy, depth] = screen(posed.head);
  const d = Math.max(depth, 0);
  const sideOut = (Math.abs(hx) * d * tanH - d * tanH) / Math.sqrt(1 + tanH * tanH);
  const upOut = (Math.abs(hy) * d * tanV - d * tanV) / Math.sqrt(1 + tanV * tanV);
  if (depth <= -headRadius || sideOut >= headRadius || upOut >= headRadius) {
    return false;
  }

  // A head seen from behind shows no eyes and no face, and the cover test reads it as a part of
  // the body. A head seen from the side shows its snout, so the rule holds for it.
  const [ex, ey, ez] = middleOf(posed.eyes[0], posed.eyes[1]);
  const [cx, cy, cz] = posed.head;
  const face = Math.hypot(ex - cx, ey - cy, ez - cz) || 1;
  const reach = Math.hypot(camera[0] - cx, camera[1] - cy, camera[2] - cz) || 1;
  const toward =
    ((ex - cx) * (camera[0] - cx) + (ey - cy) * (camera[1] - cy) + (ez - cz) * (camera[2] - cz)) /
    (face * reach);
  if (toward < INSERT_FRAME.backView) {
    return false;
  }

  const inside = 1 - INSERT_FRAME.eyeMargin;
  for (const eye of posed.eyes) {
    const [x, y, eyeDepth] = screen(eye);
    if (eyeDepth <= 0 || Math.abs(x) > inside || Math.abs(y) > inside) {
      return true;
    }
  }
  return false;
}
