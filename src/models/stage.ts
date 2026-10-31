import { MathUtils, Quaternion, Vector3 } from 'three';
import { SCENE_COLORS } from './colors.ts';
import { toQuat, toVec3 } from './tuples.ts';
import type { Vec3 } from './tuples.ts';
import { MeshBuilder, transform } from './mesh.ts';
import type { MeshData, Rgb } from './mesh.ts';
import { box, cylinder, quad } from './primitives.ts';
import { STAGE_COLORS, addDesk } from './props.ts';

/** The thickness of the stage slab (design 4.5, props). The floor is at y = -STAGE_THICKNESS. */
export const STAGE_THICKNESS = 0.4;

/**
 * The width of one plank of the stage top. The planks run from the left to the right, as in
 * `mockup.png`, and each row has planks of several lengths with staggered joints. The boards of
 * `orchestra-latest.png` are about 0.1 m wide and 0.5 m long, against the podium top of 1.05 m,
 * so the planks are a step finer than the first planks of 0.22 m by 2.4 m to 4.8 m.
 */
export const PLANK_WIDTH = 0.14;

/** The width of the dark line between two planks. */
export const PLANK_LINE_WIDTH = 0.012;

/** The shortest plank and the length that a plank can add to it, in meters. */
export const PLANK_LENGTH = { min: 0.9, extra: 1.2 } as const;

/** The largest change of the tone of one plank from the mean plank color, as a factor. */
export const PLANK_TONE = 0.2;

/**
 * The cut of each of the four corners of the stage outline, as a part of the stage side (design
 * 4.5, props). The outline has eight sides, as the stage of `orchestra-latest.png`. Each cut takes
 * this part of the side from each of the two edges at its corner. The layout keeps each footprint
 * 0.3 m from the cut (`models/layout-scene.ts`). The footprints of the demos allow up to 0.115.
 */
export const STAGE_CORNER_CUT = 0.1;

/**
 * The raised lip around the top of the stage (design 4.5, props), as the edge of the stage of
 * `orchestra-latest.png`. Its profile goes from the top of the skirt up the outer face, over a
 * round top, and down an inner bevel to the planks. The distances are from the outline, in meters.
 */
export const STAGE_LIP = {
  /** The width of the lip, from the outline to the planks. */
  width: 0.1,
  /** The height of the top of the lip above the stage top. */
  height: 0.045,
  /** The depth below the stage top of the lower end of the outer face, at the top of the skirt. */
  drop: 0.06,
} as const;

/**
 * The profile of the lip ({@link STAGE_LIP}): each point is the distance in from the outline and
 * the height above the stage top, from the top of the skirt to the planks.
 */
const LIP_PROFILE: readonly (readonly [number, number])[] = [
  [0, -STAGE_LIP.drop],
  [0, STAGE_LIP.height - 0.02],
  [0.02, STAGE_LIP.height],
  [0.065, STAGE_LIP.height],
  [STAGE_LIP.width, 0],
];

/** A point on the stage top: x and z. */
type FloorPoint = readonly [number, number];

/**
 * Gives the eight corners of a square with cut corners around the origin, in the order of the
 * sides: the front, the right, the back, and the left side, each followed by its corner cut. Seen
 * from above, the corners go around counterclockwise in the axes of the stage.
 *
 * @param half Half the side of the square, in meters.
 * @param cut The length that each cut takes from each of the two edges at its corner, in meters.
 * @returns The corners, as x and z.
 */
function octagon(half: number, cut: number): FloorPoint[] {
  const h = half;
  const c = cut;
  return [
    [-h + c, h],
    [h - c, h],
    [h, h - c],
    [h, -h + c],
    [h - c, -h],
    [-h + c, -h],
    [-h, -h + c],
    [-h, h - c],
  ];
}

/**
 * Gives the outline of the stage at a distance in from the outline of the slab: the octagon of
 * {@link STAGE_CORNER_CUT}, with each side moved in by the distance.
 *
 * @param side The stage side `S`, in meters.
 * @param inset The distance in from the outline, in meters.
 * @returns The eight corners, as in {@link octagon}.
 */
export function stageOutline(side: number, inset = 0): FloorPoint[] {
  return insetOctagon(side / 2, STAGE_CORNER_CUT * side, inset);
}

/**
 * Gives an octagon of {@link octagon} with each side moved in by a distance. A side of a corner
 * cut moves in by the same distance as the other sides.
 *
 * @param half Half the side of the square, in meters.
 * @param cut The corner cut of the octagon, in meters.
 * @param inset The distance in, in meters.
 * @returns The eight corners, as in {@link octagon}.
 */
function insetOctagon(half: number, cut: number, inset: number): FloorPoint[] {
  return octagon(half - inset, cut - (2 - Math.SQRT2) * inset);
}

/**
 * Moves the corners of an outline on the stage top.
 *
 * @param points The corners.
 * @param x The move along x.
 * @param z The move along z.
 * @returns The moved corners.
 */
function moved(points: readonly FloorPoint[], x: number, z: number): FloorPoint[] {
  return points.map(([px, pz]) => [px + x, pz + z]);
}

/**
 * Finds if a point of the stage top keeps a margin from the outline of the stage: from the four
 * edges and from the four corner cuts (design 4.5, stage origin).
 *
 * @param x The x of the point, from the stage center.
 * @param z The z of the point, from the stage center.
 * @param side The stage side `S`, in meters.
 * @param margin The margin, in meters.
 * @returns True if the point keeps the margin.
 */
export function keepsStageMargin(x: number, z: number, side: number, margin: number): boolean {
  const half = side / 2;
  return (
    Math.abs(x) <= half - margin + 1e-9 &&
    Math.abs(z) <= half - margin + 1e-9 &&
    Math.abs(x) + Math.abs(z) <= 2 * half - STAGE_CORNER_CUT * side - margin * Math.SQRT2 + 1e-9
  );
}

/** The panels of the skirt (the sides of the stage): a panel width and a groove between panels. */
const SKIRT = { panel: 0.5, groove: 0.03 } as const;

/**
 * The front distance `F` from the front edge of the stage to the podium center, with no piano
 * (design 4.5, stage origin).
 */
export const PODIUM_FROM_FRONT = 1.0;

/** The podium box: width, height, and depth (design 4.5, props). */
export const PODIUM_SIZE: Vec3 = [1.05, 0.35, 1.05];

/** The thickness of the lighter top plate of the podium. */
const PODIUM_PLATE = 0.04;

/**
 * The cut corners and the frames of the podium (design 4.5, props), as the podium of
 * `orchestra-latest.png` and `orchestra-side.png`: a box with cut corners, a top plate that stands
 * out a little, a framed panel on the top, and a framed panel on each of the four main sides.
 */
export const PODIUM_TRIM = {
  /** The length that each corner cut of the top plate takes from each of its two edges. */
  cut: 0.1,
  /** How far the top plate stands out over the body on each side. */
  overhang: 0.02,
  /** The width of the frame around the panel of the top. */
  topFrame: 0.07,
  /** The width of the dark groove between the frame of the top and its panel. */
  groove: 0.012,
  /** The width of the frame around the panel of each main side of the body. */
  sideFrame: 0.05,
  /** How far a panel of a side stands out of the body. It stays inside the top plate. */
  panelOut: 0.003,
} as const;

/** The conductor stand on the podium (design 4.5, props). */
export const CONDUCTOR_STAND = {
  deskWidth: 0.6,
  deskDepth: 0.45,
  /**
   * The height of the desk center above the top of the podium: just below the chest of the bear,
   * so that the top edge of the desk is at its shoulders. With 1.10 m, the desk is above the
   * shoulders of the bear, and the beat must stay at the height of its head. The bear has the
   * short legs and the long trunk of `bear-views.png`, so its head stays out of the top of the
   * desk in the bow at the song end. With the shoulders 0.1 m lower, the head goes into the desk.
   */
  deskHeight: 0.8,
  /** The tilt of the desk toward the conductor, as for a music stand. */
  tilt: 30 * MathUtils.DEG2RAD,
  /**
   * The distance of the post in front of the podium center, toward the orchestra (-z). The stand
   * stands on the stage, just in front of the podium: its base keeps 8 cm from the front of the
   * podium. At 0.35 m on the podium, the lower edge of the desk is 0.24 m in front of the bear,
   * and the belly of the bear (0.36 m) goes through the desk and the score. At 0.6 m in front of
   * the podium of 1.05 m, the base stands 4.5 cm inside the podium. At 0.68 m, the eyes of the
   * studio bear, whose muzzle is long, touch the desk in the bow at the song end (3 cm from the
   * podium).
   */
  forward: 0.73,
  /** The radius of the round base of the post. */
  baseRadius: 0.12,
} as const;

/**
 * Gives a number from 0 to 1 for two whole numbers, with no state, so that the planks of a stage
 * are the same on each build.
 *
 * @param a The first number.
 * @param b The second number.
 * @returns The number.
 */
export function plankHash(a: number, b: number): number {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Gives the color of one plank: the mean plank color, lighter or darker by up to
 * {@link PLANK_TONE}.
 *
 * @param row The row of the plank, from the back.
 * @param index The plank in its row, from the left.
 * @returns The linear color.
 */
export function plankColor(row: number, index: number): Rgb {
  const tone = 1 + PLANK_TONE * (2 * plankHash(row, index) - 1);
  const [r, g, b] = STAGE_COLORS.plank;
  return [r * tone, g * tone, b * tone];
}

/**
 * Clips a convex polygon of the stage top to the half plane `nx × x + nz × z <= limit`.
 *
 * @param points The corners of the polygon.
 * @param nx The x of the normal of the boundary.
 * @param nz The z of the normal of the boundary.
 * @param limit The limit.
 * @returns The corners of the clipped polygon, in the same order.
 */
function clipHalfPlane(
  points: readonly FloorPoint[],
  nx: number,
  nz: number,
  limit: number,
): FloorPoint[] {
  const out: FloorPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] ?? [0, 0];
    const b = points[(i + 1) % points.length] ?? [0, 0];
    const da = nx * a[0] + nz * a[1] - limit;
    const db = nx * b[0] + nz * b[1] - limit;
    if (da <= 0) {
      out.push(a);
    }
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** The area of the planks: a square with cut corners around the stage center. */
interface PlankArea {
  /** Half the side of the square, in meters. */
  readonly half: number;
  /** The largest `|x| + |z|`: the line of the corner cuts. */
  readonly diagonal: number;
}

/**
 * Adds a rectangle of the stage top at y = 0, clipped to the area of the planks, as a fan of
 * triangles that face up. A rectangle outside the area adds nothing.
 *
 * @param builder The builder.
 * @param rect The smallest and the largest x, then the smallest and the largest z.
 * @param area The area of the planks.
 * @param color The color.
 */
function addTopPiece(
  builder: MeshBuilder,
  rect: readonly [number, number, number, number],
  area: PlankArea,
  color: Rgb,
): void {
  const [x0, x1, z0, z1] = rect;
  let points: FloorPoint[] = [
    [x0, z0],
    [x0, z1],
    [x1, z1],
    [x1, z0],
  ];
  for (const [nx, nz, limit] of [
    [1, 0, area.half],
    [-1, 0, area.half],
    [0, 1, area.half],
    [0, -1, area.half],
    [1, 1, area.diagonal],
    [1, -1, area.diagonal],
    [-1, 1, area.diagonal],
    [-1, -1, area.diagonal],
  ] as const) {
    points = clipHalfPlane(points, nx, nz, limit);
  }

  const first = points[0];
  let doubleArea = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i] ?? [0, 0];
    const [bx, bz] = points[(i + 1) % points.length] ?? [0, 0];
    doubleArea += ax * bz - bx * az;
  }
  if (!first || points.length < 3 || Math.abs(doubleArea) < 1e-12) {
    return;
  }
  const corners: number[] = [];
  for (let i = 1; i + 1 < points.length; i++) {
    const b = points[i] ?? first;
    const c = points[i + 1] ?? first;
    corners.push(first[0], 0, first[1], b[0], 0, b[1], c[0], 0, c[1]);
  }
  builder.add(corners, { color });
}

/**
 * Adds one side of the skirt: panels with grooves between them, from the floor to the lip. The
 * side runs from `from` to `to` on the floor, and its face points out of the stage.
 *
 * @param builder The builder.
 * @param from The start of the side, as x and z.
 * @param to The end of the side, as x and z.
 */
function addSkirt(builder: MeshBuilder, from: FloorPoint, to: FloorPoint): void {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const at = (d: number, y: number): Vec3 => [
    from[0] + ((to[0] - from[0]) * d) / length,
    y,
    from[1] + ((to[1] - from[1]) * d) / length,
  ];
  const bottom = -STAGE_THICKNESS;
  const top = -STAGE_LIP.drop;
  const step = SKIRT.panel + SKIRT.groove;
  for (let d = 0; d < length - 1e-9; d += step) {
    const panelEnd = Math.min(d + SKIRT.panel, length);
    builder.add(quad(at(d, bottom), at(panelEnd, bottom), at(panelEnd, top), at(d, top)), {
      color: STAGE_COLORS.skirt,
    });
    const grooveEnd = Math.min(d + step, length);
    if (grooveEnd > panelEnd) {
      builder.add(
        quad(at(panelEnd, bottom), at(grooveEnd, bottom), at(grooveEnd, top), at(panelEnd, top)),
        { color: STAGE_COLORS.groove },
      );
    }
  }
}

/** One closed outline at one height, for a band of {@link addBand}. */
interface Ring {
  /** The corners, in the order of {@link octagon}. */
  readonly points: readonly FloorPoint[];
  /** The height of the outline. */
  readonly y: number;
}

/**
 * Adds a band between two closed outlines of the same count of corners: one quad for each side.
 * The faces point out of the outline and up, when the second outline is higher or further in.
 *
 * @param builder The builder.
 * @param from The first outline.
 * @param to The second outline.
 * @param color The color.
 */
function addBand(builder: MeshBuilder, from: Ring, to: Ring, color: Rgb): void {
  const count = from.points.length;
  const corners: number[] = [];
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const a = from.points[i] ?? [0, 0];
    const b = from.points[j] ?? [0, 0];
    const c = to.points[j] ?? [0, 0];
    const d = to.points[i] ?? [0, 0];
    corners.push(
      ...quad([a[0], from.y, a[1]], [b[0], from.y, b[1]], [c[0], to.y, c[1]], [d[0], to.y, d[1]]),
    );
  }
  builder.add(corners, { color });
}

/**
 * Adds a flat polygon at one height as a fan of triangles.
 *
 * @param builder The builder.
 * @param points The corners, in the order of {@link octagon}.
 * @param y The height.
 * @param up True for faces that point up, false for faces that point down.
 * @param color The color.
 */
function addCap(
  builder: MeshBuilder,
  points: readonly FloorPoint[],
  y: number,
  up: boolean,
  color: Rgb,
): void {
  const [ax, az] = points[0] ?? [0, 0];
  const corners: number[] = [];
  for (let i = 1; i + 1 < points.length; i++) {
    const [bx, bz] = points[up ? i : i + 1] ?? [0, 0];
    const [cx, cz] = points[up ? i + 1 : i] ?? [0, 0];
    corners.push(ax, y, az, bx, y, bz, cx, y, cz);
  }
  builder.add(corners, { color });
}

/**
 * Adds the slab of the stage: the skirt on the eight sides, the bottom, and the raised lip around
 * the top.
 *
 * @param builder The builder.
 * @param side The stage side `S`, in meters.
 */
function addSlab(builder: MeshBuilder, side: number): void {
  const outline = stageOutline(side);
  for (let i = 0; i < outline.length; i++) {
    addSkirt(builder, outline[i] ?? [0, 0], outline[(i + 1) % outline.length] ?? [0, 0]);
  }
  addCap(builder, outline, -STAGE_THICKNESS, false, STAGE_COLORS.skirt);

  for (let k = 0; k + 1 < LIP_PROFILE.length; k++) {
    const [d0, y0] = LIP_PROFILE[k] ?? [0, 0];
    const [d1, y1] = LIP_PROFILE[k + 1] ?? [0, 0];
    addBand(
      builder,
      { points: stageOutline(side, d0), y: y0 },
      { points: stageOutline(side, d1), y: y1 },
      STAGE_COLORS.nosing,
    );
  }
}

/**
 * Adds the planks of the stage top inside the lip: rows from the back to the front, and in each
 * row planks of several lengths from the left to the right, with dark lines between them. The
 * planks at the corners end at the corner cuts.
 *
 * @param builder The builder.
 * @param side The stage side `S`, in meters.
 */
function addPlanks(builder: MeshBuilder, side: number): void {
  const inner = side / 2 - STAGE_LIP.width;
  const [corner] = stageOutline(side, STAGE_LIP.width);
  const area: PlankArea = {
    half: inner,
    diagonal: Math.abs(corner?.[0] ?? 0) + Math.abs(corner?.[1] ?? 0),
  };
  const half = PLANK_LINE_WIDTH / 2;
  const rows = Math.ceil((2 * inner) / PLANK_WIDTH - 1e-9);
  for (let row = 0; row < rows; row++) {
    const z0 = -inner + row * PLANK_WIDTH;
    const z1 = Math.min(z0 + PLANK_WIDTH, inner);
    const isLast = row === rows - 1;
    const plankZ0 = row === 0 ? z0 : z0 + half;
    const plankZ1 = isLast ? z1 : z1 - half;
    if (!isLast) {
      addTopPiece(builder, [-inner, inner, plankZ1, z1 + half], area, STAGE_COLORS.seam);
    }
    // The first plank of a row starts at a staggered place, before the left edge.
    let x0 = -inner - plankHash(row, -1) * (PLANK_LENGTH.min + PLANK_LENGTH.extra);
    for (let index = 0; x0 < inner - 1e-9; index++) {
      const x1 = x0 + PLANK_LENGTH.min + PLANK_LENGTH.extra * plankHash(row, index);
      const left = Math.max(x0, -inner);
      const right = Math.min(x1, inner);
      const plankLeft = x0 <= -inner ? left : left + half;
      const plankRight = x1 >= inner ? right : right - half;
      if (plankRight > plankLeft) {
        const rect = [plankLeft, plankRight, plankZ0, plankZ1] as const;
        addTopPiece(builder, rect, area, plankColor(row, index));
      }
      if (x1 < inner) {
        const rect = [plankRight, x1 + half, plankZ0, plankZ1] as const;
        addTopPiece(builder, rect, area, STAGE_COLORS.seam);
      }
      x0 = x1;
    }
  }
}

function addPodium(builder: MeshBuilder, podium: Vec3, stand = true): void {
  const [px, , pz] = podium;
  const [w, h] = PODIUM_SIZE;
  const trim = PODIUM_TRIM;
  const plate = PODIUM_PLATE;
  const body = h - plate;

  // The body: a box with cut corners under the top plate.
  const bodyOutline = moved(insetOctagon(w / 2, trim.cut, trim.overhang), px, pz);
  addBand(
    builder,
    { points: bodyOutline, y: 0 },
    { points: bodyOutline, y: body },
    STAGE_COLORS.podium,
  );

  // A darker panel on each of the four main sides, inside a frame of the body color.
  for (let i = 0; i < bodyOutline.length; i += 2) {
    const [ax, az] = bodyOutline[i] ?? [0, 0];
    const [bx, bz] = bodyOutline[i + 1] ?? [0, 0];
    const length = Math.hypot(bx - ax, bz - az);
    const [ux, uz] = [(bx - ax) / length, (bz - az) / length];
    const at = (along: number, y: number): Vec3 => [
      ax + ux * along - uz * trim.panelOut,
      y,
      az + uz * along + ux * trim.panelOut,
    ];
    const [from, to] = [trim.sideFrame, length - trim.sideFrame];
    const [low, high] = [trim.sideFrame, body - trim.sideFrame];
    builder.add(quad(at(from, low), at(to, low), at(to, high), at(from, high)), {
      color: STAGE_COLORS.podiumPanel,
    });
  }

  // The top plate: its sides, its lower face where it stands out, and a framed panel on the top.
  const plateOutline = moved(octagon(w / 2, trim.cut), px, pz);
  addBand(
    builder,
    { points: plateOutline, y: body },
    { points: plateOutline, y: h },
    STAGE_COLORS.podiumTop,
  );
  addCap(builder, plateOutline, body, false, STAGE_COLORS.podiumTop);
  const frameInner = moved(insetOctagon(w / 2, trim.cut, trim.topFrame), px, pz);
  const panel = moved(insetOctagon(w / 2, trim.cut, trim.topFrame + trim.groove), px, pz);
  addBand(
    builder,
    { points: plateOutline, y: h },
    { points: frameInner, y: h },
    STAGE_COLORS.podiumTop,
  );
  addBand(builder, { points: frameInner, y: h }, { points: panel, y: h }, STAGE_COLORS.seam);
  addCap(builder, panel, h, true, STAGE_COLORS.podiumTopPanel);

  if (!stand) {
    return;
  }

  // The stand stands on the stage in front of the podium, and its desk is below the chest of the bear.
  const desk = CONDUCTOR_STAND;
  const top = h;
  const z = pz - desk.forward;
  const color = SCENE_COLORS.stand;
  const post = top + desk.deskHeight;
  builder.add(cylinder(desk.baseRadius, desk.baseRadius, 0.02, 6), {
    color,
    at: transform([px, 0, z]),
  });
  builder.add(box(0.025, post, 0.025), { color, at: transform([px, post / 2, z]) });
  // The desk is a vertical plate that leans back by the tilt, so its face points to the conductor.
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -desk.tilt);
  const deskCenter = new Vector3(px, top + desk.deskHeight, z);
  addDesk(
    builder,
    box(desk.deskWidth, desk.deskDepth, 0.015),
    transform(toVec3(deskCenter), toQuat(tilt)),
  );
  // The open score: two pages with a small gap, on the front face of the desk.
  const lift = new Vector3(0, 0, 0.0095).applyQuaternion(tilt);
  for (const sign of [-1, 1]) {
    const page = box(desk.deskWidth / 2 - 0.03, desk.deskDepth - 0.06, 0.004);
    const center = new Vector3((sign * desk.deskWidth) / 4, 0, 0).add(lift).add(deskCenter);
    builder.add(page, {
      color: SCENE_COLORS.sheet,
      at: transform(toVec3(center), toQuat(tilt)),
    });
  }
}

/**
 * Builds the static mesh of the stage: the skirt, the raised lip, the planks, the podium, and
 * the conductor stand (design 4.4, 4.5). The outline has eight sides: the corners are cut, as in
 * `orchestra-latest.png`. The stage has no steps, as in `mockup.png` and
 * `scene.png`. The world origin is the stage center on the top of the
 * stage, and +z points to the audience.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param podium The podium center of the layout, or `null` for a chamber group, which has no
 *   podium (design 4.2). The podium is 1.0 m behind the front edge, or further with a soloist
 *   (design 4.5, stage origin).
 * @returns The mesh data. All vertices follow bone 0.
 */
export function buildStage(stageSide: number, podium: Vec3 | null): MeshData {
  const builder = new MeshBuilder();
  addSlab(builder, stageSide);
  addPlanks(builder, stageSide);
  if (podium) {
    addPodium(builder, podium);
  }
  return builder.build();
}

/**
 * Builds the podium with the conductor stand on it (design 4.5, props), for a view of the
 * conductor alone. The podium center is on the origin, and its bottom is at y = 0.
 *
 * @param stand False for the podium alone, as in `bear-views.png`.
 * @returns The mesh data. All vertices follow bone 0.
 */
export function buildPodium(stand = true): MeshData {
  const builder = new MeshBuilder();
  addPodium(builder, [0, 0, 0], stand);
  return builder.build();
}
