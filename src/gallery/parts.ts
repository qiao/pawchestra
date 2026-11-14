import type { Bounds } from '../models/bounds.ts';
import type { MeshData } from '../models/mesh.ts';
import { BONE_NAMES, boneIndex } from '../models/rig.ts';
import type { BoneName } from '../models/rig.ts';
import type { Vec3 } from '../models/tuples.ts';

/**
 * A part view of the gallery (the query `part`, design 7.1): the camera looks at the middle of a
 * body part of the first animal in its pose, and the frame holds the mesh on the bones of the
 * part with a margin. Thus a close view of an arm, a paw, the haunch, or an ankle needs no point
 * for a role or a moment, and the part fills the frame on each species.
 */
export interface PartView {
  /** The bones of the part, such as `handL` and `fingersL` for the left paw. */
  readonly bones: readonly BoneName[];
  /** The margin around the part, as a share of the radius of its ball ({@link partFrame}). */
  readonly margin: number;
  /**
   * The turn of the camera around the part, in degrees. 0 is the front of the animal, and a
   * positive turn moves the camera to the right side of the animal.
   */
  readonly azimuth: number;
  /**
   * The angle of the camera above the part, in degrees, from {@link MIN_PART_ELEVATION} to
   * {@link MAX_PART_ELEVATION}. A negative angle looks at the part from below, as at a palm that
   * faces down.
   */
  readonly elevation: number;
  /**
   * True to cut away all that is nearer to the camera than the ball of the part (the query
   * `cut`), such as the trunk between the camera and a paw in front of the chest. The near plane
   * of the camera touches the ball.
   */
  readonly cut: boolean;
}

/** The lowest elevation of a part view, in degrees. */
export const MIN_PART_ELEVATION = -89;

/** The highest elevation of a part view, in degrees. */
export const MAX_PART_ELEVATION = 89;

/** The margin of a part view with no query `margin`. */
const DEFAULT_PART_MARGIN = 0.25;

/**
 * Reads a part view from the query of the gallery (design 7.1): `part=<bone,...>` with the bones
 * of the player, `margin` (0 or more, default {@link DEFAULT_PART_MARGIN}), `azimuth` (default
 * 0°, the front of the animal), `elevation` (default 20°), and `cut` (a flag). For example,
 * `?only=rabbit&part=upperArmL,forearmL&azimuth=-90` shows the left arm of the rabbit from its
 * outer side. A value that is not a number keeps its default.
 *
 * @param search The query of the page.
 * @returns The part view, or `null` with no query `part` or with a name that is no bone.
 */
export function partView(search: URLSearchParams): PartView | null {
  const names = (search.get('part') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const bones = names.flatMap((name) => BONE_NAMES.find((bone) => bone === name) ?? []);
  if (bones.length === 0 || bones.length !== names.length) {
    return null;
  }
  const read = (name: string, fallback: number): number => {
    const value = Number(search.get(name) ?? Number.NaN);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    bones,
    margin: Math.max(0, read('margin', DEFAULT_PART_MARGIN)),
    azimuth: read('azimuth', 0),
    elevation: Math.min(MAX_PART_ELEVATION, Math.max(MIN_PART_ELEVATION, read('elevation', 20))),
    cut: search.has('cut'),
  };
}

/** The points of one bone of a part in the bind pose, which the pose matrix of the bone moves. */
export interface PartBone {
  /** The index of the bone in `BONE_NAMES`. */
  readonly bone: number;
  /** The bind position of the bone: the joint at its start. */
  readonly head: Vec3;
  /**
   * The head, and the eight corners of the box around the corners of the mesh on the bone, or only
   * the head for a bone with no such corner. All points are in the axes of the model.
   */
  readonly corners: readonly Vec3[];
}

/**
 * Gives the points of each bone of a part in the bind pose: its head, and the corners of the box
 * around the corners of the mesh on it. A paw of the elephant is much wider than the distance
 * between its joints, so the box of the mesh gives the size of the part, and the joints do not.
 * A corner of the mesh counts when its main bone and its second bone are bones of the part. Thus
 * the skin of the chest that blends into an upper arm does not make the box of the arm wider.
 *
 * @param mesh The mesh of the player in its bind pose, with the bone of each corner.
 * @param heads The bind position of each bone, in the order of `BONE_NAMES`.
 * @param bones The bones of the part.
 * @returns The points of each bone, in the order of the bones.
 */
export function partBones(
  mesh: MeshData,
  heads: readonly Vec3[],
  bones: readonly BoneName[],
): PartBone[] {
  const indices = bones.map(boneIndex);
  const boxes = new Map<number, { min: [number, number, number]; max: [number, number, number] }>();
  for (const bone of indices) {
    boxes.set(bone, {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    });
  }
  for (let v = 0; v < mesh.bones.length; v++) {
    const box = boxes.get(mesh.bones[v] ?? -1);
    if (!box || !boxes.has(mesh.blendBones[v] ?? -1)) {
      continue;
    }
    for (const axis of [0, 1, 2] as const) {
      const value = mesh.positions[v * 3 + axis] ?? 0;
      box.min[axis] = Math.min(box.min[axis], value);
      box.max[axis] = Math.max(box.max[axis], value);
    }
  }

  return indices.map((bone): PartBone => {
    const head = heads[bone] ?? [0, 0, 0];
    const box = boxes.get(bone);
    return {
      bone,
      head,
      corners: box && box.min[0] <= box.max[0] ? [head, ...boxCorners(box)] : [head],
    };
  });
}

/**
 * Gives the eight corners of a box.
 *
 * @param box The box.
 * @returns The corners.
 */
function boxCorners(box: Bounds): Vec3[] {
  return [box.min[0], box.max[0]].flatMap((x) =>
    [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z): Vec3 => [x, y, z])),
  );
}

/** The ball that a part view shows: the frame of the camera holds it from each direction. */
export interface PartFrame {
  /** The middle of the part: the point that the camera looks at. */
  readonly center: Vec3;
  /** The radius of the ball, in meters. */
  readonly radius: number;
}

/**
 * Gives the ball around the posed points of a part. Its middle is the middle of the box of the
 * points. Its radius reaches the farthest point, plus the margin as a share of that reach.
 *
 * @param points The posed points of the part. There is at least one.
 * @param margin The margin, as a share of the radius of the ball with no margin.
 * @returns The ball.
 */
export function partFrame(points: readonly Vec3[], margin: number): PartFrame {
  const middle = ([0, 1, 2] as const).map((axis) => {
    const values = points.map((point) => point[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  });
  const center: Vec3 = [middle[0] ?? 0, middle[1] ?? 0, middle[2] ?? 0];
  const reach = Math.max(
    ...points.map((point) =>
      Math.hypot(point[0] - center[0], point[1] - center[1], point[2] - center[2]),
    ),
  );
  return { center, radius: reach * (1 + margin) };
}

/** The camera of a part view. */
export interface PartCamera {
  /** The place of the camera, in the axes of the gallery. */
  readonly position: Vec3;
  /** The point that the camera looks at. */
  readonly target: Vec3;
  /** The distance from the camera to the target, in meters. */
  readonly distance: number;
}

/**
 * Places the camera of a part view at the distance from which the ball of the part fills the
 * shorter side of the frame, in the direction of the view. An animal faces -z in its own axes, so
 * the front of an animal with the turn `facing` is at the azimuth 180° minus the facing
 * (`aroundBody()` of `items.ts`).
 *
 * @param frame The ball of the part, in the axes of the gallery.
 * @param view The part view.
 * @param facing The turn of the animal around y, in radians.
 * @param fovDeg The vertical field of view of the camera, in degrees.
 * @param aspect The width of the frame divided by its height.
 * @returns The camera.
 */
export function partCamera(
  frame: PartFrame,
  view: Pick<PartView, 'azimuth' | 'elevation'>,
  facing: number,
  fovDeg: number,
  aspect: number,
): PartCamera {
  const vertical = (fovDeg * Math.PI) / 360;
  const half = Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
  const distance = frame.radius / Math.sin(half);
  const azimuth = ((view.azimuth + 180) * Math.PI) / 180 - facing;
  const elevation = (view.elevation * Math.PI) / 180;
  const across = distance * Math.cos(elevation);
  const [x, y, z] = frame.center;
  return {
    position: [
      x - across * Math.sin(azimuth),
      y + distance * Math.sin(elevation),
      z + across * Math.cos(azimuth),
    ],
    target: frame.center,
    distance,
  };
}
