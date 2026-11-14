import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { IDENTITY, toQuat, toVec3 } from '../tuples.ts';
import { applyTransform, transform } from '../mesh.ts';
import type { Quat, Vec3 } from '../tuples.ts';
import type { Finish, Rgb, Transform } from '../mesh.ts';
import { box, cylinder, lathe, plate, prism, quad, sweep } from '../primitives.ts';
import type { OutlinePoint, PlateLevel, ProfilePoint } from '../primitives.ts';
import { DEFAULT_HEAD_HEIGHT } from '../species.ts';
import { PieceBuilder, hold, pieceSize, placeCorners } from './piece.ts';
import type { InstrumentModel, InstrumentPiece, PlayTarget } from './types.ts';

/**
 * The scale of the instrument models (design 4.6). The sizes of {@link VIOLIN} and {@link BOW} fit
 * a rabbit with a head height of 0.30 m, so the scale is the default head height divided by 0.30.
 * With H 0.38 m, it is 1.27. The hold of each instrument applies it.
 */
export const INSTRUMENT_SCALE = DEFAULT_HEAD_HEIGHT / 0.3;

/**
 * The sizes of the violin model, in meters before the {@link INSTRUMENT_SCALE}. The viola is this
 * model at 1.15 scale (4.6).
 */
export const VIOLIN = {
  length: 0.4,
  bodyLength: 0.24,
  bodyThickness: 0.04,
  /** The distance of the bridge from the tail end. */
  bridge: 0.095,
  /** The height of the strings above the bottom of the body at the bridge. */
  stringHeight: 0.068,
  /** The distance of the bow contact point from the tail end, between the bridge and the fingerboard. */
  bowContact: 0.11,
  /** The distance of the hand position on the neck from the tail end. */
  neckGrip: 0.27,
  /** The distances of the nut and of the end of the fingerboard from the tail end. */
  nut: 0.335,
  fingerboardEnd: 0.17,
  /**
   * The width of the four strings at the bridge, from the outer side of the first string to the
   * outer side of the fourth.
   */
  stringsWidth: 0.0232,
} as const;

/** The thickness of each string of the violin model, in meters before the scale. */
const STRING_SIZE = 0.0012;

/** The sizes of the bow model, in meters before the {@link INSTRUMENT_SCALE}. */
export const BOW = {
  length: 0.45,
  /** The distance of the hand from the frog end. */
  grip: 0.03,
  /** The distance from the stick to the hair. */
  hairGap: 0.012,
} as const;

/**
 * The scale of each bowed string, as a factor of the violin model (design 4.6). The viola
 * is the violin at 1.15 scale. The cello is 1.20 m from the tail end to the scroll, and the
 * contrabass is the cello at 1.6 scale.
 */
export const STRING_SCALES = {
  violin: INSTRUMENT_SCALE,
  viola: INSTRUMENT_SCALE * 1.15,
  cello: 1.2 / VIOLIN.length,
  contrabass: (1.6 * 1.2) / VIOLIN.length,
} as const;

/** The length of the end pin of the cello below the tail end, in meters (design 4.6). */
const CELLO_END_PIN = 0.2;

/**
 * The length of the end pin of the contrabass below the tail end, in meters, at each size (design
 * 4.6). A real end pin stands out about 0.15 m to 0.25 m, and a bassist sets it so that the nut
 * stands near the eyebrows (`docs/reference/string-technique.md`, section 2.8). The hippo has low
 * shoulders under a large head, so its end pin is short: the upper bout then stands below the left
 * shoulder, and the left arm passes over it to the neck. With 0.2 m, the left upper arm and
 * forearm went up to 7 cm into the upper bout in each sample of the play. The hold of the
 * contrabass moves it to the body of the player, so a smaller contrabass needs no longer end pin.
 * With the cello rule, the smaller contrabass of the hippo had an end pin of 0.55 m.
 */
const BASS_END_PIN = 0.05;

/**
 * Gives the length of the end pin of an upright bowed string below the tail end, in meters
 * (design 4.6), when the player gives no end pin. A smaller cello has a longer end pin, so that the
 * top of its body stays at the place of the top of the full size. A player builds its cello with
 * the end pin of its body (`celloPinOf()` of `cello-fit.ts`). The contrabass keeps
 * {@link BASS_END_PIN} at each size.
 *
 * @param id The upright bowed string.
 * @param scale The scale of the instrument, as a factor of its full size.
 * @returns The length.
 */
function endPinLength(id: 'cello' | 'contrabass', scale: number): number {
  if (id === 'contrabass') {
    return BASS_END_PIN;
  }
  const body = VIOLIN.bodyLength * STRING_SCALES.cello;
  return CELLO_END_PIN + body * (1 - scale);
}

/**
 * The scale of the bow of the cello and of the contrabass, as a factor of the bow model: 0.63 m.
 * The violin and the viola use the bow at the {@link INSTRUMENT_SCALE}: 0.57 m (design 4.6).
 */
const LOW_BOW_SCALE = INSTRUMENT_SCALE * 1.1;

/** The hold of the violin and the viola under the chin (design 4.6). */
const CHIN_HOLD = {
  /** The tail end of the violin from the head center, in head heights: left, down, and front. */
  offsetH: [-0.1, -0.6, -0.3],
  /** The turn of the violin to the left of the front. */
  yaw: 70 * MathUtils.DEG2RAD,
  /** The tilt of the scroll below the horizontal. */
  pitch: 8 * MathUtils.DEG2RAD,
  /** The turn of the top plate from up to the front. */
  roll: 50 * MathUtils.DEG2RAD,
} as const;

/**
 * The holds of the cello between the knees and of the contrabass at the left side of the player
 * (design 4.6). The end pin tip stands on the floor at the offset from the floor under the seat:
 * `offsetH` in head heights, then `offset` in meters. The instrument leans along `axis`, and its
 * top plate faces `front` as far as the axis permits.
 */
const UPRIGHT_HOLDS = {
  cello: {
    offsetH: [0, 0, -0.42],
    offset: [0.085, 0, -0.44],
    // Back 25° to the chest, then 25° to the left, so that the neck passes the left of the head.
    axis: [
      -Math.cos(25 * MathUtils.DEG2RAD) * Math.sin(25 * MathUtils.DEG2RAD),
      Math.cos(25 * MathUtils.DEG2RAD) ** 2,
      Math.sin(25 * MathUtils.DEG2RAD),
    ],
    front: [0.35, 0, -1],
  },
  contrabass: {
    offsetH: [-0.2, 0, -0.5],
    offset: [0.03, 0, -0.25],
    axis: [-0.265, 1, 0.225],
    front: [0.55, 0, -1],
  },
} as const satisfies Readonly<
  Record<'cello' | 'contrabass', Readonly<Record<'offsetH' | 'offset' | 'axis' | 'front', Vec3>>>
>;

/**
 * The control points of the outline of a body around its center, from the neck end (+x) along the
 * -z side to the tail end (-x), and the indices of its sharp points. A smooth curve goes through
 * the points from one sharp point to the next ({@link smoothHalf}).
 */
interface BodyOutline {
  readonly half: readonly OutlinePoint[];
  /**
   * The indices of the sharp points: the tip of each corner, and the point on the line from the
   * tip to the center where the C-bout starts. The segment between them stays straight.
   */
  readonly sharp: readonly number[];
}

/**
 * The outline of the violin body: the upper bout, the upper corner, the C-bout, the lower corner,
 * and the lower bout. Each corner is a tip and a point on the line from the tip to the center, so
 * that the outline stays star-shaped around the center for the fan caps. The waist is a little
 * narrower than the lower corners, as the deep C-bout of a real cello, where the waist is about
 * 0.53 of the lower bout. The points of the bouts lie a little inside the earlier outline of
 * straight segments, so that the smooth curve stays inside it, except at most 0.9 mm in the
 * segment at each end of the half. Thus no part of a player goes deeper into the body.
 */
const VIOLIN_OUTLINE: BodyOutline = {
  half: [
    [0.12, 0],
    [0.1138, -0.0216],
    [0.0958, -0.044],
    [0.066, -0.055],
    [0.0443, -0.0512],
    [0.032, -0.0475],
    [0.0278, -0.0413],
    [0.01, -0.0364],
    [-0.0135, -0.0434],
    [-0.016, -0.0515],
    [-0.0343, -0.0608],
    [-0.0606, -0.0664],
    [-0.0897, -0.0604],
    [-0.1077, -0.0384],
    [-0.12, 0],
  ],
  sharp: [5, 6, 8, 9],
};

/**
 * The number of points of the whole smooth outline of each form ({@link smoothHalf}). The cello and
 * the contrabass are large in the close shots, so their outline has more points.
 */
const OUTLINE_POINTS = { violin: 40, cello: 64, contrabass: 64 } as const satisfies Record<
  StringForm,
  number
>;

/**
 * Gives a point of a centripetal Catmull-Rom curve between `b` and `c`.
 *
 * @param a The point before `b`.
 * @param b The start of the segment.
 * @param c The end of the segment.
 * @param d The point after `c`.
 * @param t The part of the segment, from 0 to 1.
 * @returns The point.
 */
function catmullRom(
  a: OutlinePoint,
  b: OutlinePoint,
  c: OutlinePoint,
  d: OutlinePoint,
  t: number,
): OutlinePoint {
  const knot = (p: OutlinePoint, q: OutlinePoint): number =>
    Math.max(1e-9, Math.hypot(q[0] - p[0], q[1] - p[1]) ** 0.5);
  const t1 = knot(a, b);
  const t2 = t1 + knot(b, c);
  const t3 = t2 + knot(c, d);
  const u = t1 + t * (t2 - t1);
  const mix = (p: OutlinePoint, q: OutlinePoint, from: number, to: number): OutlinePoint => {
    const w = (u - from) / (to - from);
    return [p[0] + w * (q[0] - p[0]), p[1] + w * (q[1] - p[1])];
  };
  const a1 = mix(a, b, 0, t1);
  const a2 = mix(b, c, t1, t2);
  const a3 = mix(c, d, t2, t3);
  const b1 = mix(a1, a2, 0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/**
 * Makes the smooth half of an outline: a Catmull-Rom curve through the control points from one
 * sharp point to the next. At the neck end and the tail end, the curve crosses the axis at a
 * right angle, so the two halves join smoothly. Each segment gets points by its length.
 *
 * @param outline The control points and the sharp points.
 * @param count The number of points of the whole outline.
 * @returns The half from +x to -x, with the two end points on the x axis.
 */
function smoothHalf(outline: BodyOutline, count: number): OutlinePoint[] {
  const { half, sharp } = outline;
  const last = half.length - 1;
  const point = (i: number): OutlinePoint => half[i] ?? [0, 0];
  const length = (i: number): number => {
    const [x0, z0] = point(i);
    const [x1, z1] = point(i + 1);
    return Math.hypot(x1 - x0, z1 - z0);
  };
  const breaks = [0, ...sharp, last];
  const straight = (i: number): boolean => sharp.includes(i) && sharp.includes(i + 1);
  let total = 0;
  for (let i = 0; i < last; i++) {
    total += straight(i) ? 0 : length(i);
  }
  // The half has count / 2 + 1 points. Each straight corner segment takes one step, and the curved
  // segments share the other steps by their lengths, rounded on the running sum.
  const corners = sharp.length / 2;
  const steps = count / 2 - corners;
  let done = 0;
  let share = 0;
  const partsOf = (i: number): number => {
    if (straight(i)) {
      return 1;
    }
    share += length(i);
    const parts = Math.max(1, Math.round((steps * share) / total) - done);
    done += parts;
    return parts;
  };
  const out: OutlinePoint[] = [point(0)];
  for (let k = 0; k + 1 < breaks.length; k++) {
    const from = breaks[k] ?? 0;
    const to = breaks[k + 1] ?? 0;
    // The point before and after the run: a mirror over the axis at an end of the outline, or
    // a straight extension at a sharp point.
    const before = (i: number): OutlinePoint => {
      if (i > from) {
        return point(i - 1);
      }
      const [x, z] = point(i + 1);
      const [px, pz] = point(i);
      return i === 0 ? [x, -z] : [2 * px - x, 2 * pz - z];
    };
    const after = (i: number): OutlinePoint => {
      if (i < to) {
        return point(i + 1);
      }
      const [x, z] = point(i - 1);
      const [px, pz] = point(i);
      return i === last ? [x, -z] : [2 * px - x, 2 * pz - z];
    };
    for (let i = from; i < to; i++) {
      const parts = partsOf(i);
      for (let s = 1; s <= parts; s++) {
        out.push(
          s === parts
            ? point(i + 1)
            : catmullRom(before(i), point(i), point(i + 1), after(i + 1), s / parts),
        );
      }
    }
  }
  return out;
}

/**
 * One level of the body: the outline at a scale around the center, at a part of the body
 * thickness.
 */
interface BodyLevel {
  /** The scale of the outline. */
  readonly scale: number;
  /** The height, as a part of the body thickness. */
  readonly y: number;
  /**
   * The color of the band from the level below to this level: the color of the top, or the
   * darker wood of the edges.
   */
  readonly band: 'top' | 'edge';
}

/**
 * The levels of the top of each body, from the top edge to the arch: the top edge that stands out
 * over the ribs, its bevel, and the arch, which rises in a smooth curve to a flat middle under the
 * bridge. The edges have the darker wood color, so that a dark band goes around the top and the
 * back, as in `orchestra-latest.png`. The arch stays at or below the earlier arch of three levels,
 * so that no part of a player goes deeper into it.
 */
const TOP_LEVELS: readonly BodyLevel[] = [
  { scale: 1, y: 0.8, band: 'edge' },
  { scale: 0.94, y: 0.843, band: 'edge' },
  { scale: 0.84, y: 0.893, band: 'top' },
  { scale: 0.72, y: 0.946, band: 'top' },
  { scale: 0.58, y: 0.976, band: 'top' },
  { scale: 0.42, y: 1, band: 'top' },
];

/**
 * The levels of the violin body from the back to the top: the arch of the back, the back edge
 * that stands out over the ribs, the ribs, and the levels of the top ({@link TOP_LEVELS}). The
 * arch of the back stays inside the earlier straight back from the scale 0.8 to the edge, so that
 * no part of a player goes deeper into it.
 */
const VIOLIN_LEVELS: readonly BodyLevel[] = [
  { scale: 0.6, y: 0, band: 'top' },
  { scale: 0.8, y: 0.03, band: 'top' },
  { scale: 0.92, y: 0.08, band: 'top' },
  { scale: 1, y: 0.13, band: 'top' },
  { scale: 0.965, y: 0.17, band: 'edge' },
  { scale: 0.965, y: 0.76, band: 'top' },
  ...TOP_LEVELS,
];

/**
 * The outline of the contrabass body, as {@link VIOLIN_OUTLINE}: the shoulders slope down from the
 * neck to the widest point of the upper bout, as on a real double bass, and the upper corners
 * stand out less. The smooth curve stays inside the earlier outline in the same way.
 */
const BASS_OUTLINE: BodyOutline = {
  half: [
    [0.12, 0],
    [0.1157, -0.0119],
    [0.0993, -0.0298],
    [0.079, -0.0455],
    [0.0558, -0.0534],
    [0.026, -0.049],
    [0.0227, -0.0428],
    [0.006, -0.0392],
    [-0.0138, -0.0443],
    [-0.016, -0.0515],
    [-0.0342, -0.0616],
    [-0.0605, -0.0674],
    [-0.0897, -0.0614],
    [-0.1077, -0.0385],
    [-0.12, 0],
  ],
  sharp: [5, 6, 8, 9],
};

/**
 * The levels of the contrabass body: a flat back with a round edge, the ribs, and the levels of
 * the top. The back of a double bass is flat, so the ribs start lower. The round edge stays inside
 * the earlier straight edge.
 */
const BASS_LEVELS: readonly BodyLevel[] = [
  { scale: 0.93, y: 0, band: 'top' },
  { scale: 0.968, y: 0.02, band: 'top' },
  { scale: 1, y: 0.05, band: 'top' },
  { scale: 0.965, y: 0.09, band: 'edge' },
  { scale: 0.965, y: 0.76, band: 'top' },
  ...TOP_LEVELS,
];

/** The height of the top of the ribs, as a part of the body thickness ({@link breakBack}). */
const RIB_TOP = 0.76;

/**
 * The break of the flat back of the contrabass: from this place along the body (from its
 * center), the back slopes toward the top by this rise for each meter, up to the neck. The ribs
 * keep their top edge. The break starts a little before the earlier start of 0.06, because a point
 * of the smooth outline just before 0.06 lay 1.3 mm under the earlier back, which was one straight
 * face across the start, and the left paw of the hippo went 1 mm deeper there in the lift.
 */
const BASS_BREAK = { from: 0.058, slope: 0.27 } as const;

/**
 * Gives the rise of the back of a body at a place along it.
 *
 * @param form The form of the body.
 * @param x The place along the body, from its center.
 * @returns The rise above the back plane.
 */
function backRise(form: StringForm, x: number): number {
  return form === 'contrabass' ? Math.max(0, x - BASS_BREAK.from) * BASS_BREAK.slope : 0;
}

/**
 * Moves the corners of the back of a body up by the rise of {@link backRise}. The rise gets
 * smaller toward the top of the ribs, so the top edge stays.
 *
 * @param corners The corner list of the body, with the center at the origin.
 * @param form The form of the body.
 * @param ribTop The height of the top of the ribs.
 * @returns The new corner list.
 */
function breakBack(corners: readonly number[], form: StringForm, ribTop: number): number[] {
  const out = [...corners];
  for (let i = 0; i + 2 < out.length; i += 3) {
    const x = out[i] ?? 0;
    const y = out[i + 1] ?? 0;
    if (y < ribTop) {
      out[i + 1] = y + backRise(form, x) * (1 - y / ribTop);
    }
  }
  return out;
}

/**
 * Makes a closed outline from its half on the -z side.
 *
 * @param half The half from +x to -x, with the two end points on the x axis.
 * @returns The outline, counterclockwise when seen from +y.
 */
function mirrorOutline(half: readonly OutlinePoint[]): OutlinePoint[] {
  return [
    ...half,
    ...half
      .slice(1, -1)
      .toReversed()
      .map(([x, z]): OutlinePoint => [x, -z]),
  ];
}

/** The faces of the body of a bowed string, by color. */
interface BodyBands {
  /** The faces with the color of the top. */
  readonly top: number[];
  /** The faces with the darker wood color of the edges. */
  readonly edge: number[];
}

/**
 * Makes the body of a bowed string: the outline at each level, with a fan cap at the back and at
 * the top.
 *
 * @param outline The outline, counterclockwise when seen from +y.
 * @param levels The levels from the back to the top.
 * @param thickness The thickness of the body.
 * @returns The faces by color.
 */
function bodyBands(
  outline: readonly OutlinePoint[],
  levels: readonly BodyLevel[],
  thickness: number,
): BodyBands {
  const top: number[] = [];
  const edge: number[] = [];
  const at = (level: BodyLevel, i: number): Vec3 => {
    const [x, z] = outline[i % outline.length] ?? [0, 0];
    return [x * level.scale, level.y * thickness, z * level.scale];
  };
  for (let j = 1; j < levels.length; j++) {
    const lower = levels[j - 1];
    const upper = levels[j];
    if (!lower || !upper) {
      continue;
    }
    const out = upper.band === 'top' ? top : edge;
    for (let i = 0; i < outline.length; i++) {
      out.push(...quad(at(lower, i), at(lower, i + 1), at(upper, i + 1), at(upper, i)));
    }
  }
  const back = levels[0];
  const arch = levels.at(-1);
  for (let i = 0; i < outline.length; i++) {
    if (back) {
      top.push(0, back.y * thickness, 0, ...at(back, i + 1), ...at(back, i));
    }
    if (arch) {
      top.push(0, arch.y * thickness, 0, ...at(arch, i), ...at(arch, i + 1));
    }
  }
  return { top, edge };
}

/**
 * The fingerboard of the violin model, in meters in the violin axes: a board that is thin at the
 * nut and thicker at the end over the body. The strings stay at `VIOLIN.stringHeight` over the
 * whole length, so the board keeps the height and the end thickness of the earlier box board. The
 * left paw of the hippo goes through the board in a high position, and a top 4 mm higher or a
 * thicker end put it 2.4 cm or 1.9 cm deep in place of 1.5 cm.
 */
export const FINGERBOARD = {
  /** The width at the nut. */
  nutWidth: 0.0165,
  /** The width at the end over the body. */
  endWidth: 0.0285,
  /** The height of the middle of the top at the nut. */
  nutTop: 0.0605,
  /** The height of the middle of the top at the end. */
  endTop: 0.06,
  /** The height of the underside at the nut. */
  nutUnder: 0.0555,
  /** The height of the underside at the end. */
  endUnder: 0.052,
  /** The drop of the edges below the middle of the top, as the curve of a real fingerboard. */
  crown: 0.0018,
  /** The length of the nut along the violin, after `VIOLIN.nut`. */
  nutLength: 0.0035,
} as const;

/**
 * The rings of the neck, from the heel inside the body to the nut: the place along the violin,
 * the half width, and the height of the bottom. The top of each ring is the underside of the
 * fingerboard. The first rings come down to the back as the round heel of the neck.
 */
const NECK_RINGS: readonly (readonly [x: number, halfWidth: number, bottom: number])[] = [
  [0.232, 0.0105, 0.003],
  [0.246, 0.0105, 0.009],
  [0.256, 0.01, 0.022],
  [0.268, 0.0095, 0.0285],
  [VIOLIN.nut, 0.008, 0.0305],
];

/**
 * Gives a value of the fingerboard at a place along the violin, between its value at the end
 * over the body and its value at the nut.
 *
 * @param x The place along the violin.
 * @param atEnd The value at the end.
 * @param atNut The value at the nut.
 * @returns The value.
 */
function alongBoard(x: number, atEnd: number, atNut: number): number {
  const share = (x - VIOLIN.fingerboardEnd) / (VIOLIN.nut - VIOLIN.fingerboardEnd);
  return atEnd + share * (atNut - atEnd);
}

/**
 * Makes the ring of the fingerboard at a place along the violin: a flat underside, sides that
 * slope out, and a top with a ridge in the middle.
 *
 * @param x The place along the violin.
 * @returns The corners, counterclockwise when seen from the nut.
 */
function boardRing(x: number): Vec3[] {
  const f = FINGERBOARD;
  const half = alongBoard(x, f.endWidth, f.nutWidth) / 2;
  const top = alongBoard(x, f.endTop, f.nutTop);
  const under = alongBoard(x, f.endUnder, f.nutUnder);
  return [
    [x, under, -0.72 * half],
    [x, top - f.crown, -half],
    [x, top, 0],
    [x, top - f.crown, half],
    [x, under, 0.72 * half],
  ];
}

/**
 * The open part of the neck under the first positions, in meters in the violin axes: from this
 * place along the violin to the nut, the top of the neck is at this height, below the fingerboard,
 * and two thin side walls close the space up to the board. The left wrist of the hippo passes
 * through the middle of the neck there, and a solid neck put it 1.7 cm deep in place of 1.5 cm.
 */
const NECK_OPEN = { from: 0.268, top: 0.048, wall: 0.0008 } as const;

/**
 * Gives the height of the top of the neck at a place along the violin.
 *
 * @param x The place along the violin.
 * @returns The height: under the fingerboard, or the top of the open part.
 */
function neckTop(x: number): number {
  const f = FINGERBOARD;
  return x >= NECK_OPEN.from ? NECK_OPEN.top : alongBoard(x, f.endUnder, f.nutUnder) + 0.0003;
}

/**
 * Makes the two side walls of the open part of the neck ({@link NECK_OPEN}), from the top of the
 * neck up to the underside of the fingerboard.
 *
 * @returns The corner list.
 */
function neckWalls(): number[] {
  const f = FINGERBOARD;
  const [, startHalf] = NECK_RINGS[3] ?? [0, 0, 0];
  const [, endHalf] = NECK_RINGS[4] ?? [0, 0, 0];
  const from = NECK_OPEN.from;
  const to = VIOLIN.nut;
  const bottom = NECK_OPEN.top - 0.0005;
  const out: number[] = [];
  for (const side of [-1, 1]) {
    const ring = (x: number, half: number): Vec3[] => {
      const outer = side * 0.85 * half;
      const inner = outer - side * NECK_OPEN.wall;
      const top = alongBoard(x, f.endUnder, f.nutUnder);
      return [
        [x, bottom, Math.min(outer, inner)],
        [x, top, Math.min(outer, inner)],
        [x, top, Math.max(outer, inner)],
        [x, bottom, Math.max(outer, inner)],
      ];
    };
    // The ends of a wall touch the neck and the nut, so they need no caps.
    out.push(...sweep([ring(from, startHalf), ring(to, endHalf)], false));
  }
  return out;
}

/**
 * Makes a ring of the neck: a flat top under the fingerboard, and a round back.
 *
 * @param ring The ring of {@link NECK_RINGS}.
 * @param form The form of the body.
 * @returns The corners, counterclockwise when seen from the nut.
 */
function neckRing([x, half, low]: (typeof NECK_RINGS)[number], form: StringForm): Vec3[] {
  // The heel stays on the back where the back of the contrabass rises toward the neck.
  const bottom = Math.max(low, backRise(form, x - VIOLIN.bodyLength / 2) + 0.002);
  const top = neckTop(x);
  const middle = bottom + 0.55 * (top - bottom);
  return [
    [x, bottom, -0.55 * half],
    [x, middle, -half],
    [x, top, -0.85 * half],
    [x, top, 0.85 * half],
    [x, middle, half],
    [x, bottom, 0.55 * half],
  ];
}

/**
 * The pegbox and the scroll of the violin model, in meters in the violin axes. The scroll is a
 * spiral in the plane along the violin. As on a real scroll, its outer turn starts at the back of
 * the pegbox, goes over the end and the front, and turns in to the eye. Each ring of the spiral
 * is a box section that gets smaller toward the eye.
 */
const SCROLL = {
  /** The end of the pegbox along the violin, at the throat of the scroll. */
  pegboxEnd: 0.375,
  /** The half width, the bottom, and the top of the pegbox at the nut. */
  nutRing: [0.0095, 0.032, 0.0595],
  /** The half width, the bottom, and the top of the pegbox at the throat. */
  throatRing: [0.0085, 0.033, 0.058],
  /** The center of the spiral: along the violin, and the height. */
  center: [0.386, 0.0466],
  /**
   * The angle of the first ring and of the last ring, in degrees from the end (+x) toward the
   * top (+y).
   */
  fromDeg: -135,
  toDeg: 405,
  /** The number of steps of the spiral, so that its turns read round in a close shot. */
  steps: 18,
  /** The radius of the spiral at the first ring, and its part that remains at the eye. */
  radius: 0.015,
  eyeShare: 0.28,
  /** The radial thickness of a turn, as a part of its radius. */
  thickness: 0.46,
  /** The half width of the spiral at the first ring and at the eye. */
  halfWidth: 0.0105,
  eyeHalfWidth: 0.006,
  /** The radius and the half width of the core disk that closes the groove between the turns. */
  coreRadius: 0.0105,
  coreHalfWidth: 0.0045,
} as const;

/** The places of the four pegs along the violin, and the side of the head of each (+z or -z). */
const PEGS: readonly (readonly [x: number, side: 1 | -1])[] = [
  [0.342, 1],
  [0.3495, -1],
  [0.357, 1],
  [0.3645, -1],
];

/**
 * The profile of a peg along its shaft, from the end that stands out of the far wall of the
 * pegbox to the tip of the head, as a real ebony peg: the shaft through the slot, a collar at the
 * outer face of the wall, a thin neck, and the round thumb piece. The head is flat (`PEG_FLAT`), so
 * that its wide faces show from the front and from the back.
 */
const PEG_PROFILE: readonly ProfilePoint[] = [
  [0.0012, 0],
  [0.0016, 0.0205],
  [0.0025, 0.0207],
  [0.0025, 0.022],
  [0.0018, 0.0225],
  [0.0036, 0.0243],
  [0.0048, 0.027],
  [0.0038, 0.0297],
  [0, 0.0315],
];

/** The number of faces around a peg and a key of a machine head. */
const PEG_SEGMENTS = 6;

/** The scale of the head of a peg across its wide faces. */
const PEG_FLAT = 0.45;

/**
 * The machine heads of the contrabass, in meters in the violin axes: a brass plate on each side
 * of the pegbox, and two keys on each plate that point to the back and out, as on a real double
 * bass. The shaft of each key turns a brass roller across the slot of the pegbox, and the strings
 * wind on the rollers. The keys of the two sides take turns along the pegbox, so that the four
 * rollers do not touch.
 */
const MACHINES = {
  /** The middle of each plate along the violin, and its length, height, and thickness. */
  plate: [0.354, 0.03, 0.016, 0.0012],
  /** The places of the keys along the violin on the -z side and on the +z side. */
  keys: [
    [0.343, 0.357],
    [0.35, 0.364],
  ],
  /** The direction of a key at the +z side: to the back (-y) and out. */
  keyDirection: [0, -0.8, 0.6],
  /** The profile of a key from the plate to the tip of its head: a shaft and an oval paddle. */
  profile: [
    [0.001, 0],
    [0.001, 0.0058],
    [0.0022, 0.0066],
    [0.0042, 0.0085],
    [0.0047, 0.0105],
    [0.0036, 0.0125],
    [0, 0.0135],
  ] satisfies readonly ProfilePoint[],
  /** The radius of a roller. */
  roller: 0.0016,
} as const;

/**
 * Makes the spiral of the scroll.
 *
 * @returns The corner list.
 */
function scrollSpiral(): number[] {
  const sc = SCROLL;
  const rings: Vec3[][] = [];
  for (let k = 0; k <= sc.steps; k++) {
    const t = k / sc.steps;
    const angle = (sc.fromDeg + t * (sc.toDeg - sc.fromDeg)) * MathUtils.DEG2RAD;
    const radius = sc.radius * sc.eyeShare ** t;
    const inner = radius * (1 - sc.thickness / 2);
    const outer = radius * (1 + sc.thickness / 2);
    const half = sc.halfWidth + t * (sc.eyeHalfWidth - sc.halfWidth);
    const at = (r: number, z: number): Vec3 => [
      sc.center[0] + r * Math.cos(angle),
      sc.center[1] + r * Math.sin(angle),
      z,
    ];
    rings.push([at(inner, -half), at(inner, half), at(outer, half), at(outer, -half)]);
  }
  return sweep(rings);
}

/**
 * The hollow of the pegbox, in meters in the violin axes, as on a real pegbox: two side walls and a
 * floor around a deep, open slot from the nut to the throat of the scroll. The pegs cross the
 * slot. The inside is dark, and its floor lies far below the top of the walls, so no dark face
 * lies close over a wood face that faces the same way.
 */
const PEGBOX = {
  /** The thickness of each side wall. */
  wall: 0.0022,
  /** The height of the floor of the slot above the bottom of the pegbox. */
  floor: 0.005,
  /** The length of the slope of the floor at the nut end and at the throat end. */
  ends: [0.0012, 0.002],
  /** The depth of the slot at its two ends, so that each ring keeps eight distinct corners. */
  endDepth: 0.0004,
} as const;

/**
 * Makes a ring of the hollow pegbox ({@link PEGBOX}): the outer side, the top of the wall, the
 * inner side, and the floor, around the U of the section.
 *
 * @param x The place along the violin.
 * @param ring The half width, the bottom, and the top of the outer box.
 * @param floor The height of the floor of the slot.
 * @returns Eight corners, counterclockwise when seen from the scroll.
 */
function pegboxRing(
  x: number,
  [half, bottom, top]: readonly [number, number, number],
  floor: number,
): Vec3[] {
  const inner = half - PEGBOX.wall;
  return [
    [x, bottom, -half],
    [x, top, -half],
    [x, top, -inner],
    [x, floor, -inner],
    [x, floor, inner],
    [x, top, inner],
    [x, top, half],
    [x, bottom, half],
  ];
}

/** The faces of the hollow pegbox ({@link pegbox}), by color. */
interface PegboxFaces {
  /** The outside, the tops of the walls, and the ends. */
  readonly wood: number[];
  /** The inside of the slot. */
  readonly dark: number[];
}

/**
 * Makes the hollow pegbox from the nut to the throat ({@link PEGBOX}), as one closed solid of a
 * wood part and a dark part with shared corners.
 *
 * @param from The place of the nut end along the violin.
 * @returns The faces by color.
 */
function pegbox(from: number): PegboxFaces {
  const sc = SCROLL;
  const to = sc.pegboxEnd;
  const at = (x: number): [number, number, number] => {
    const t = (x - from) / (to - from);
    const mix = (k: 0 | 1 | 2): number => sc.nutRing[k] + t * (sc.throatRing[k] - sc.nutRing[k]);
    return [mix(0), mix(1), mix(2)];
  };
  const [nutEnd, throatEnd] = PEGBOX.ends;
  const rings = [
    [from, true],
    [from + nutEnd, false],
    [to - throatEnd, false],
    [to, true],
  ].map(([x, closed]) => {
    const ring = at(Number(x));
    const floor = closed ? ring[2] - PEGBOX.endDepth : ring[1] + PEGBOX.floor;
    return pegboxRing(Number(x), ring, floor);
  });
  const wood: number[] = [];
  const dark: number[] = [];
  const corner = (ring: number, i: number): Vec3 => rings[ring]?.[i % 8] ?? [0, 0, 0];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < 8; i++) {
      const out = i >= 2 && i <= 4 ? dark : wood;
      out.push(...quad(corner(j, i), corner(j, i + 1), corner(j + 1, i + 1), corner(j + 1, i)));
    }
  }
  // The two ends: the U of the section as three quads, the side walls and the floor.
  const last = rings.length - 1;
  const ends: readonly (readonly [number, number, number, number])[] = [
    [0, 1, 2, 3],
    [0, 3, 4, 7],
    [7, 4, 5, 6],
  ];
  for (const [a, b, c, d] of ends) {
    wood.push(...quad(corner(0, d), corner(0, c), corner(0, b), corner(0, a)));
    wood.push(...quad(corner(last, a), corner(last, b), corner(last, c), corner(last, d)));
  }
  return { wood, dark };
}

/**
 * The rings of the tailpiece, from the end at the edge of the body to the end near the bridge:
 * the place along the violin, the width, the height of the underside, and the thickness. The
 * tailpiece is narrow at the edge, with sides that curve in a little, wide near its round top
 * end, and follows the arch of the top a little above it.
 */
const TAILPIECE: readonly (readonly [x: number, width: number, under: number, thick: number])[] = [
  [0.001, 0.011, 0.0345, 0.004],
  [0.014, 0.014, 0.0366, 0.0042],
  [0.03, 0.0192, 0.0392, 0.0046],
  [0.05, 0.026, 0.0425, 0.005],
  [0.058, 0.0236, 0.0431, 0.0048],
  [0.063, 0.019, 0.0435, 0.0045],
];

/**
 * Makes a ring of the tailpiece: a flat underside, and a round top.
 *
 * @param ring The ring of {@link TAILPIECE}.
 * @returns The corners, counterclockwise when seen from the bridge.
 */
function tailRing([x, width, under, thick]: (typeof TAILPIECE)[number]): Vec3[] {
  const half = width / 2;
  return [
    [x, under, -half],
    [x, under + 0.55 * thick, -half],
    [x, under + 0.85 * thick, -0.75 * half],
    [x, under + thick, -0.35 * half],
    [x, under + thick, 0.35 * half],
    [x, under + 0.85 * thick, 0.75 * half],
    [x, under + 0.55 * thick, half],
    [x, under, half],
  ];
}

/**
 * The parts at the tail end, in meters in the violin axes: the ebony saddle on the edge of the top,
 * and the tailgut of the cello and the contrabass from the end of the tailpiece over the saddle to
 * the end pin holder. The violin and the viola have no tailgut outside the body, because the tail
 * end lies at the neck of the player.
 */
const TAIL_END = {
  /** The ends of the saddle along the violin, its height above the edge, and its width. */
  saddle: [0.0005, 0.0035, 0.0016, 0.017],
  /** The height of the top edge at the tail end, as a part of the body thickness. */
  edge: 0.8,
  /** The half distance between the two strands of the tailgut, and the half size of a strand. */
  gut: [0.0028, 0.0007],
} as const;

/**
 * The fine tuners of the cello on the tailpiece, in meters in the violin axes: one for each
 * string, just behind the end of the string. Each is a barrel with a screw head on top.
 */
const FINE_TUNERS = {
  /** The place along the violin. */
  x: 0.0545,
  /** The profile from inside the tailpiece to the top of the screw head. */
  profile: [
    [0.0011, -0.0008],
    [0.0011, 0.0018],
    [0.0016, 0.002],
    [0.0016, 0.0031],
    [0.0009, 0.0035],
    [0, 0.0036],
  ] satisfies readonly ProfilePoint[],
} as const;

/**
 * The outline of the bridge across the violin, as (across, height above the feet) from the left
 * foot around to the left ear, clockwise when seen from the tail end: two feet with an arch between them, the waist, the ears, and an
 * arched top edge that holds the strings. The top of the middle is at the underside of the
 * strings.
 */
const BRIDGE_OUTLINE: readonly OutlinePoint[] = [
  [-0.0145, 0],
  [-0.0085, 0],
  [0, 0.0055],
  [0.0085, 0],
  [0.0145, 0],
  [0.0105, 0.0095],
  [0.0122, 0.0175],
  [0.0118, 0.0252],
  [0, 0.0268],
  [-0.0118, 0.0252],
  [-0.0122, 0.0175],
  [-0.0105, 0.0095],
];

/** The bridge: the height of its feet on the arch, its thickness, and the center of its outline. */
const BRIDGE = {
  feet: 0.04,
  thickness: 0.0025,
  center: 0.013,
} as const;

/**
 * The chin rest of the violin and the viola at the left of the tailpiece, in meters in the
 * violin axes: an oval cup with a rim. The rim is at the chin grip of {@link buildBowedString},
 * so the chin rests on it. The cup is on the side of the G string (-z), which is the high side
 * near the neck in the hold, because a violinist rests the left side of the jaw on it
 * (`docs/reference/string-technique.md`, section 1.10).
 */
const CHIN_REST = {
  /** The center of the oval: along the violin, and across (-z is the side of the G string). */
  center: [0.023, -0.028],
  /** The half length and the half width of the oval. */
  half: [0.019, 0.0145],
  /** The height of the bottom on the edge of the top. */
  bottom: 0.0335,
  /**
   * The levels from the bottom: the scale of the oval and the height above the bottom. The last
   * level is the floor of the cup, below the rim.
   */
  levels: [
    [0.85, 0],
    [1, 0.019],
    [0.6, 0.017],
  ] satisfies readonly PlateLevel[],
} as const;

/**
 * Makes the oval outline of the chin rest.
 *
 * @returns The outline, counterclockwise when seen from +y.
 */
function chinRestOutline(): OutlinePoint[] {
  const [a, b] = CHIN_REST.half;
  return Array.from({ length: 8 }, (_, k): OutlinePoint => {
    const angle = (-k / 8) * 2 * Math.PI;
    return [a * Math.cos(angle), b * Math.sin(angle)];
  });
}

/**
 * The shoulder rest of the violin and the viola under the back of the lower bout, in meters in
 * the violin axes: a bar across the back, with a foot at each end that holds the edge of the body.
 * A violinist holds the instrument between the chin rest and the shoulder rest
 * (`docs/reference/string-technique.md`, section 1.10). The high end is at +z, on the side of the
 * E string, because the left shoulder and the upper arm lie under that side in the hold. Under the
 * side of the G string, the body falls away.
 */
const SHOULDER_REST = {
  /** The place of the bar along the violin. */
  along: 0.07,
  /** The width of the bar along the violin. */
  width: 0.02,
  /** The depth of the bar from its flat face to its edge away from the violin. */
  depth: 0.007,
  /**
   * The line of the flat face, as points (across, height): the top and the bottom of the foot at
   * the low end, the middle of the bar, and the bottom and the top of the foot at the high end.
   * The flat face of each foot lies on the rib, inside the edge of the back.
   */
  line: [
    [-0.0645, 0.009],
    [-0.0645, -0.012],
    [0, -0.011],
    [0.0645, -0.018],
    [0.0645, 0.009],
  ],
} as const;

/**
 * Makes the shoulder rest ({@link SHOULDER_REST}): a bent bar with a triangle section, with its
 * flat face toward the violin and its edge away from it.
 *
 * @returns 26 triangles, as one closed surface.
 */
function shoulderRest(): number[] {
  const r = SHOULDER_REST;
  const line = r.line.map(([z, y]) => new Vector3(0, y, z));
  const inside = new Vector3(0, r.line[0][1], 0);
  // The normal of each segment of the line, toward the violin.
  const normals = line.slice(1).map((p, i) => {
    const step = p.clone().sub(line[i] ?? p);
    const normal = new Vector3(0, -step.z, step.y).normalize();
    return normal.dot(inside.clone().sub(p)) < 0 ? normal.negate() : normal;
  });
  const rings = line.map((p, i): Vec3[] => {
    const normal = (normals[i - 1] ?? new Vector3())
      .clone()
      .add(normals[i] ?? new Vector3())
      .normalize();
    const edge = p.clone().addScaledVector(normal, -r.depth);
    return [
      [r.along + r.width / 2, p.y, p.z],
      [r.along - r.width / 2, p.y, p.z],
      [r.along, edge.y, edge.z],
    ];
  });
  const [a0 = [0, 0, 0], b0 = [0, 0, 0], c0 = [0, 0, 0]] = rings[0] ?? [];
  const [a1 = [0, 0, 0], b1 = [0, 0, 0], c1 = [0, 0, 0]] = rings.at(-1) ?? [];
  return [...sweep(rings, false), ...a0, ...c0, ...b0, ...a1, ...b1, ...c1];
}

/**
 * The four strings of the violin model, in meters in the violin axes: the distance between the
 * middles of the outer strings at the end of the tailpiece and at the nut (at the bridge, the
 * distance is `VIOLIN.stringsWidth` less one string), the place of the end on the tailpiece, and
 * the drop of the outer and the inner strings below `VIOLIN.stringHeight` on the arched top of
 * the bridge and on the crowned fingerboard at the nut.
 */
const STRINGS = {
  tailSpan: 0.015,
  nutSpan: 0.0115,
  tailEnd: [0.058, 0.0478],
  bridgeDrop: [0.0014, 0.0005],
  nutDrop: [0.0006, 0.0002],
} as const;

/**
 * The corners of the section of a string rod, in half string sizes across the string and up: a
 * square, or a triangle with a flat top of the same width and the point down.
 */
const STRING_SECTIONS = {
  square: [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ],
  triangle: [
    [-1, 0.577],
    [1, 0.577],
    [0, -1.155],
  ],
} as const;

/**
 * The section of the strings of each form. The strings of the violin and the viola are
 * triangles, because they are about 1 mm thick on the stage. Thus the violin keeps 16 triangles
 * of its triangle budget for the shoulder rest (design 4.6).
 */
const STRING_SECTION = {
  violin: 'triangle',
  cello: 'square',
  contrabass: 'square',
} as const satisfies Record<StringForm, keyof typeof STRING_SECTIONS>;

/**
 * Makes one straight piece of a string: a thin rod with no end caps, because its ends are inside
 * the tailpiece, the bridge, or the nut.
 *
 * @param from The middle of the first end.
 * @param to The middle of the last end.
 * @param section The corners of the section of the rod ({@link STRING_SECTIONS}).
 * @returns 2 triangles for each corner of the section.
 */
function strand(from: Vec3, to: Vec3, section: readonly (readonly [number, number])[]): number[] {
  const along = new Vector3(...to).sub(new Vector3(...from)).normalize();
  const side = new Vector3().crossVectors(along, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, along);
  const half = STRING_SIZE / 2;
  const ring = (p: Vec3): Vec3[] =>
    section.map(([a, b]) =>
      toVec3(new Vector3(...p).addScaledVector(side, a * half).addScaledVector(up, b * half)),
    );
  return sweep([ring(from), ring(to)], false);
}

/**
 * The f-hole at the +z side of the bridge, in meters in the violin axes: the line of its S-shaped
 * stem from the upper eye to the lower eye, as (along, across, width), and the center and the
 * radius of each round eye. The notch of the stem is at the bridge. The f-hole at the -z side is
 * its mirror image.
 */
const F_HOLE = {
  stem: [
    [0.122, 0.0145, 0.0012],
    [0.115, 0.0152, 0.0022],
    [0.104, 0.0195, 0.0034],
    [0.092, 0.0262, 0.0034],
    [0.082, 0.0298, 0.0022],
    [0.076, 0.0302, 0.0012],
  ],
  upperEye: [0.1235, 0.0142, 0.0025],
  lowerEye: [0.0745, 0.0305, 0.0031],
  /** The number of steps of the smooth stem between two points of `stem`. */
  steps: 3,
  /** The number of faces around each eye. */
  eyeSegments: 10,
  /**
   * The two notches at the middle of the stem, at the bridge: the index of the point of the
   * smooth stem, and how far each notch stands out from the edge of the stem.
   */
  notch: [8, 0.0016],
  /**
   * The height of the f-hole above the arch: 2.7 mm on the cello of the app, so that the arch
   * does not flash through it in the far views (design 4.6).
   */
  lift: 0.0009,
} as const;

/**
 * Gives the height of the highest face of a corner list above a point, such as the arch of the top
 * above a point of an f-hole.
 *
 * @param corners The corner list.
 * @param x The point along x.
 * @param z The point along z.
 * @returns The height, or -Infinity when no face is above the point.
 */
function heightAt(corners: readonly number[], x: number, z: number): number {
  let best = -Infinity;
  for (let t = 0; t + 8 < corners.length; t += 9) {
    const [ax, ay, az] = [corners[t] ?? 0, corners[t + 1] ?? 0, corners[t + 2] ?? 0];
    const [bx, by, bz] = [corners[t + 3] ?? 0, corners[t + 4] ?? 0, corners[t + 5] ?? 0];
    const [cx, cy, cz] = [corners[t + 6] ?? 0, corners[t + 7] ?? 0, corners[t + 8] ?? 0];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) {
      continue;
    }
    const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    if (a < -1e-9 || b < -1e-9 || a + b > 1 + 1e-9) {
      continue;
    }
    best = Math.max(best, a * ay + b * by + (1 - a - b) * cy);
  }
  return best;
}

/**
 * Turns each triangle of a corner list to face up (+y).
 *
 * @param corners The corner list.
 * @returns The corner list with each triangle counterclockwise when seen from +y.
 */
function faceUp(corners: readonly number[]): number[] {
  const out: number[] = [];
  for (let t = 0; t + 8 < corners.length; t += 9) {
    const c = corners.slice(t, t + 9);
    const [ax = 0, , az = 0, bx = 0, , bz = 0, cx = 0, , cz = 0] = c;
    // The y part of the normal (b - a) x (c - a).
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    out.push(...(up >= 0 ? c : [...c.slice(0, 3), ...c.slice(6, 9), ...c.slice(3, 6)]));
  }
  return out;
}

/**
 * Makes the two f-holes on the arch of the top: an S-shaped stem with two notches and two round
 * eyes each.
 *
 * @param arch The faces of the body in the violin axes, which give the height of the arch.
 * @returns The corner list.
 */
function fHoles(arch: readonly number[]): number[] {
  const f = F_HOLE;
  const out: number[] = [];
  const on = (x: number, z: number): Vec3 => [x, heightAt(arch, x, z) + f.lift, z];
  // The smooth line of the stem through its points, with the width along it.
  const stem: [number, number, number][] = [];
  const point = (i: number): OutlinePoint => {
    const last = f.stem.length - 1;
    const [x, z] = f.stem[Math.max(0, Math.min(last, i))] ?? [0, 0];
    if (i >= 0 && i <= last) {
      return [x, z];
    }
    // A straight extension past each end.
    const [nx, nz] = f.stem[i < 0 ? 1 : last - 1] ?? [0, 0];
    return [2 * x - nx, 2 * z - nz];
  };
  for (let i = 0; i + 1 < f.stem.length; i++) {
    const w0 = f.stem[i]?.[2] ?? 0;
    const w1 = f.stem[i + 1]?.[2] ?? 0;
    for (let k = 0; k < f.steps; k++) {
      const t = k / f.steps;
      const [x, z] = catmullRom(point(i - 1), point(i), point(i + 1), point(i + 2), t);
      stem.push([x, z, w0 + t * (w1 - w0)]);
    }
  }
  const [endX = 0, endZ = 0, endW = 0] = f.stem.at(-1) ?? [];
  stem.push([endX, endZ, endW]);
  // The two edges of the stem, with the normal of each point between the lines of its two
  // neighbors, so that the quads of the stem share their corners.
  const normals: OutlinePoint[] = [];
  const edges = stem.map(([x, z, w], i): readonly [OutlinePoint, OutlinePoint] => {
    const [px = x, pz = z] = stem[i - 1] ?? [];
    const [qx = x, qz = z] = stem[i + 1] ?? [];
    const length = Math.hypot(qx - px, qz - pz);
    const nx = -(qz - pz) / length;
    const nz = (qx - px) / length;
    normals.push([nx, nz]);
    return [
      [x + (nx * w) / 2, z + (nz * w) / 2],
      [x - (nx * w) / 2, z - (nz * w) / 2],
    ];
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i + 1 < edges.length; i++) {
      const [[ax, az] = [0, 0], [bx, bz] = [0, 0]] = edges[i] ?? [];
      const [[cx, cz] = [0, 0], [dx, dz] = [0, 0]] = edges[i + 1] ?? [];
      out.push(...quad(on(ax, side * az), on(bx, side * bz), on(dx, side * dz), on(cx, side * cz)));
    }
    // The notches: a small triangle out of each edge of the stem.
    const [index, stickOut] = f.notch;
    const [x, z, w] = stem[index] ?? [0, 0, 0];
    const [nx, nz] = normals[index] ?? [0, 0];
    const [px, pz] = stem[index - 1] ?? [x, z];
    const [qx, qz] = stem[index + 1] ?? [x, z];
    for (const edge of [-1, 1]) {
      const reach = edge * (w / 2 + stickOut);
      const base = edge * (w / 2) * 0.5;
      out.push(
        ...on(x + nx * reach, side * (z + nz * reach)),
        ...on((x + px) / 2 + nx * base, side * ((z + pz) / 2 + nz * base)),
        ...on((x + qx) / 2 + nx * base, side * ((z + qz) / 2 + nz * base)),
      );
    }
    for (const [ex, ez, r] of [f.upperEye, f.lowerEye]) {
      for (let k = 0; k < f.eyeSegments; k++) {
        const a0 = (k / f.eyeSegments) * 2 * Math.PI;
        const a1 = ((k + 1) / f.eyeSegments) * 2 * Math.PI;
        out.push(
          ...on(ex, side * ez),
          ...on(ex + r * Math.cos(a0), side * (ez + r * Math.sin(a0))),
          ...on(ex + r * Math.cos(a1), side * (ez + r * Math.sin(a1))),
        );
      }
    }
  }
  return faceUp(out);
}

/**
 * The outline of the body of the simple model that gives the space of a bowed string in the
 * layout ({@link addLayoutSpace}), as the half of {@link VIOLIN_OUTLINE}.
 */
const SPACE_HALF: readonly OutlinePoint[] = [
  [0.12, 0],
  [0.11, -0.035],
  [0.085, -0.055],
  [0.055, -0.057],
  [0.03, -0.045],
  [0, -0.04],
  [-0.03, -0.045],
  [-0.06, -0.065],
  [-0.09, -0.068],
  [-0.11, -0.05],
  [-0.12, 0],
];

/** The levels of the body of the simple model of {@link addLayoutSpace}, as (scale, part of the thickness). */
const SPACE_LEVELS: readonly PlateLevel[] = [
  [0.93, 0],
  [1, 0.18],
  [1, 0.76],
  [0.96, 0.86],
  [0.8, 0.95],
  [0.45, 1],
];

/** The boxes of the simple model of {@link addLayoutSpace}: the size and the center of each. */
const SPACE_BOXES: readonly (readonly [size: Vec3, center: Vec3])[] = [
  // The neck, the pegbox, the two pegs, the fingerboard, the tailpiece, the bridge, and the
  // strings.
  [
    [0.1, 0.02, 0.022],
    [0.285, 0.038, 0],
  ],
  [
    [0.045, 0.025, 0.02],
    [0.355, 0.042, 0],
  ],
  [
    [0.006, 0.006, 0.03],
    [0.343, 0.044, 0],
  ],
  [
    [0.006, 0.006, 0.03],
    [0.365, 0.044, 0],
  ],
  [
    [0.17, 0.008, 0.026],
    [0.255, 0.056, 0],
  ],
  [
    [0.05, 0.006, 0.03],
    [0.04, 0.048, 0],
  ],
  [
    [0.004, 0.024, 0.032],
    [0.095, 0.052, 0],
  ],
  [
    [0.27, 0.002, 0.008],
    [0.2, 0.067, 0],
  ],
];

/**
 * Adds the space of a bowed string in the layout to a piece (`InstrumentPiece.footprint`): the
 * simple box model that places the seats. The layout reads it in place of the detailed model, so
 * that the detail does not move the seats. With the footprint of the detailed model, row 0 of
 * `boulanger-matin.mid` moves, and the right arm of the conductor folds more in the lift.
 *
 * @param piece The piece that gets the space.
 * @param frame The placement of the violin axes in the piece axes, before the piece scale.
 * @param upright Whether the model is a cello or a contrabass, with no chin rest.
 */
function addLayoutSpace(piece: PieceBuilder, frame: Transform, upright: boolean): void {
  const v = VIOLIN;
  const space = (corners: number[], at: Vec3, rotation?: Quat): void => {
    piece.footprint(corners, inFrame(frame, transform(at, rotation)));
  };
  space(
    plate(
      mirrorOutline(SPACE_HALF),
      SPACE_LEVELS.map(([scale, y]): PlateLevel => [scale, y * v.bodyThickness]),
    ),
    [v.bodyLength / 2, 0, 0],
  );
  for (const side of [-1, 1]) {
    space(
      box(0.036, 0.003, 0.004),
      [v.bridge + 0.004, v.bodyThickness - 0.0016, side * 0.026],
      toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), side * 0.25)),
    );
  }
  space(
    cylinder(0.016, 0.016, 0.022, 8),
    [0.385, v.bodyThickness + 0.008, -0.011],
    toQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)),
  );
  for (const [size, center] of SPACE_BOXES) {
    space(box(...size), center);
  }
  if (!upright) {
    // A box on the side of the E string (+z). It keeps the footprint of the layout, so that the
    // seats of the demos do not move. The chin rest itself is on the side of the G string.
    space(box(0.04, 0.012, 0.05), [0.018, v.bodyThickness + 0.006, 0.03]);
  }
}

/**
 * Adds the space of the bow in the layout to a piece, as {@link addLayoutSpace}: the stick, the
 * hair, the frog, and the tip as boxes.
 *
 * @param piece The piece that gets the space.
 * @param frame The placement of the bow axes in the piece axes, before the piece scale.
 */
function addBowSpace(piece: PieceBuilder, frame: Transform): void {
  const b = BOW;
  const space = (corners: number[], at: Vec3): void => {
    piece.footprint(corners, inFrame(frame, transform(at)));
  };
  space(box(b.length, 0.006, 0.006), [b.length / 2, 0, 0]);
  space(box(b.length - 0.05, 0.002, 0.008), [b.length / 2, -b.hairGap, 0]);
  space(box(0.035, 0.016, 0.01), [0.02, -0.007, 0]);
  space(box(0.012, 0.014, 0.007), [b.length - 0.006, -0.006, 0]);
}

/**
 * Places a part in a frame. The frame has no scale.
 *
 * @param frame The frame.
 * @param local The placement of the part in the frame.
 * @returns The placement in the axes of the frame parent.
 */
function inFrame(frame: Transform, local: Transform): Transform {
  return transform(
    applyTransform(frame, local.position),
    toQuat(new Quaternion(...frame.rotation).multiply(new Quaternion(...local.rotation))),
    local.scale,
  );
}

/**
 * Adds the saddle, the tailgut, and the fine tuners of the cello ({@link TAIL_END},
 * {@link FINE_TUNERS}).
 *
 * @param piece The piece that gets the parts.
 * @param frame The placement of the violin axes in the piece axes, before the piece scale.
 * @param form The form of the body.
 */
function addTailEnd(piece: PieceBuilder, frame: Transform, form: StringForm): void {
  const t = TAIL_END;
  const dark = INSTRUMENT_COLORS.fingerboard;
  const v = VIOLIN;
  const place = (p: Vec3): Vec3 => applyTransform(frame, p);
  const [from, to, height, width] = t.saddle;
  const edge = t.edge * v.bodyThickness;
  piece.add(
    box(to - from, height + 0.001, width),
    dark,
    inFrame(frame, transform([(from + to) / 2, edge + (height - 0.001) / 2, 0])),
    'varnish',
  );
  if (form === 'violin') {
    return;
  }
  // The tailgut: two strands from the end of the tailpiece over the saddle and down the tail end
  // to the middle of the ribs, where the end pin holder stands out.
  const [first] = TAILPIECE;
  const [tailX = 0, , tailUnder = 0, tailThick = 0] = first ?? [];
  const middle = v.bodyThickness / 2;
  const [apart, size] = t.gut;
  for (const side of [-1, 1]) {
    const z = side * apart;
    const points: Vec3[] = [
      [tailX + 0.003, tailUnder + tailThick / 2, z],
      [from + 0.0005, edge + height + size, z],
      [-0.0012, edge, z],
      [-0.0012, middle, z],
    ];
    for (let i = 0; i + 1 < points.length; i++) {
      piece.rod(
        place(points[i] ?? [0, 0, 0]),
        place(points[i + 1] ?? [0, 0, 0]),
        size,
        4,
        dark,
        'varnish',
      );
    }
  }
  if (form === 'cello') {
    const st = STRINGS;
    for (let i = 0; i < 4; i++) {
      const z = (i / 3 - 0.5) * st.tailSpan;
      const [, , under = 0, thick = 0] = TAILPIECE[4] ?? [];
      piece.add(
        lathe(FINE_TUNERS.profile, 6),
        INSTRUMENT_COLORS.silver,
        inFrame(frame, transform([FINE_TUNERS.x, under + thick, z])),
        'metal',
      );
    }
  }
}

/**
 * The end pin of the cello and the contrabass, in meters before the scale of the instrument, as a
 * real end pin: a thin steel rod that ends in a round rubber tip, and the ebony end pin holder with
 * a silver ring where the rod leaves the tail end. The tip touches the floor at the origin of the
 * piece. At each ring of the tip, the height is at least 0.65 of the radius, so that no point of
 * the tip goes below the floor at a lean of up to 33° from the vertical. The cello leans about 28°.
 */
const END_PIN = {
  /** The radius of the rod: 4.5 mm on the cello of the app. */
  rod: 0.0015,
  /** The radius of the rubber tip: a ball of about 2.4 cm on the cello of the app. */
  tip: 0.004,
  /**
   * The profile of the rubber tip along the rod, as (radius, height) in tip radii, from the point
   * on the floor to the top of the tip.
   */
  tipProfile: [
    [0, 0],
    [0.5, 0.33],
    [0.85, 0.62],
    [1, 0.95],
    [1, 1.3],
    [0.72, 1.5],
  ] satisfies readonly ProfilePoint[],
  /** The radius of the holder at the ring and at the tail end, and its length outside the body. */
  holder: [0.0036, 0.0052, 0.008],
  /** The part of the end pin that the holder takes at most, for a short end pin. */
  holderShare: 0.3,
  /** The height of the silver ring at the bottom of the holder, and how far it stands out. */
  ring: [0.0009, 0.0003],
  /** The length of the holder inside the body, so that it has no gap to the tail end. */
  inside: 0.004,
} as const;

/**
 * Adds the end pin of a cello or a contrabass to a piece ({@link END_PIN}). The end pin runs along
 * +y from its tip on the floor at the origin to the tail end. Each part has its own height band,
 * so no two faces lie close together and face the same way.
 *
 * @param piece The piece that gets the parts.
 * @param length The length of the end pin below the tail end, before the scale of the piece.
 */
function addEndPin(piece: PieceBuilder, length: number): void {
  const e = END_PIN;
  const tip = e.tipProfile.map(([r, y]): ProfilePoint => [r * e.tip, y * e.tip]);
  const tipTop = tip.at(-1)?.[1] ?? 0;
  const [ringRadius, bodyRadius, longest] = e.holder;
  const holder = Math.min(longest, e.holderShare * length);
  const [ringHeight, ringOut] = e.ring;
  const ringBottom = length - holder;
  const ringTop = ringBottom + ringHeight;
  piece.add(lathe(tip, 8), INSTRUMENT_COLORS.endPinRubber, transform(), 'varnish');
  piece.add(
    cylinder(e.rod, e.rod, ringBottom + 0.001 - tipTop * 0.8, 6),
    INSTRUMENT_COLORS.silver,
    transform([0, tipTop * 0.8, 0]),
    'metal',
  );
  piece.add(
    cylinder(ringRadius + ringOut, ringRadius + ringOut, ringHeight, 8),
    INSTRUMENT_COLORS.silver,
    transform([0, ringBottom, 0]),
    'metal',
  );
  piece.add(
    lathe(
      [
        [ringRadius, ringTop],
        [bodyRadius, length],
        [bodyRadius, length + e.inside],
      ],
      8,
    ),
    INSTRUMENT_COLORS.fingerboard,
    transform(),
    'varnish',
  );
}

/**
 * Adds the machine heads of the contrabass to a piece: a brass plate on each side of the pegbox,
 * with two keys.
 *
 * @param piece The piece that gets the parts.
 * @param frame The placement of the violin axes in the piece axes, before the piece scale.
 * @param y The height of the middle of the pegbox.
 */
function addMachines(piece: PieceBuilder, frame: Transform, y: number): void {
  const m = MACHINES;
  const [plateX, length, height, thick] = m.plate;
  const wall = SCROLL.nutRing[0] + thick / 2;
  for (const side of [-1, 1]) {
    piece.add(
      box(length, height, thick),
      INSTRUMENT_COLORS.brass,
      inFrame(frame, transform([plateX, y, side * wall])),
      'metal',
    );
    const [dx, dy, dz] = m.keyDirection;
    const turn = toQuat(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(dx, dy, side * dz).normalize(),
      ),
    );
    for (const x of m.keys[side < 0 ? 0 : 1]) {
      piece.add(
        lathe(m.profile, PEG_SEGMENTS),
        INSTRUMENT_COLORS.brass,
        inFrame(frame, transform([x, y, side * (wall + thick / 2)], turn, [1, 1, PEG_FLAT])),
        'metal',
      );
      // The roller across the slot, with its ends in the middle of the two walls.
      const across = 2 * (SCROLL.nutRing[0] - PEGBOX.wall / 2);
      piece.add(
        cylinder(m.roller, m.roller, across, PEG_SEGMENTS),
        INSTRUMENT_COLORS.brass,
        inFrame(
          frame,
          transform(
            [x, y, -across / 2],
            toQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)),
          ),
        ),
        'metal',
      );
    }
  }
}

/**
 * Adds the parts of the violin model to a piece. In the violin axes, the violin runs along +x
 * from the tail end at the origin to the scroll. The top plate faces +y, and the bottom of the
 * body is at y = 0.
 *
 * @param piece The piece that gets the parts.
 * @param frame The placement of the violin axes in the piece axes, before the piece scale.
 * @param form The form of the body. The cello and the contrabass have the cello wood and no chin
 *   rest (design 4.5, instrument colors).
 */
function addViolinParts(piece: PieceBuilder, frame: Transform, form: StringForm): void {
  const v = VIOLIN;
  const upright = form !== 'violin';
  const top = upright ? INSTRUMENT_COLORS.celloTop : INSTRUMENT_COLORS.violinTop;
  const wood = upright ? INSTRUMENT_COLORS.celloWood : INSTRUMENT_COLORS.violinWood;
  const dark = INSTRUMENT_COLORS.fingerboard;
  const part = (
    corners: number[],
    color: readonly [number, number, number],
    at: Vec3,
    rotation?: Quat,
  ): void => {
    piece.add(corners, color, inFrame(frame, transform(at, rotation)), 'varnish');
  };

  // The body: the outline with its corners at each level, with the darker edges (design 4.5,
  // instrument colors).
  // The contrabass has its own outline and a flat back with a break.
  const bass = form === 'contrabass';
  const levels = bass ? BASS_LEVELS : VIOLIN_LEVELS;
  const outline = smoothHalf(bass ? BASS_OUTLINE : VIOLIN_OUTLINE, OUTLINE_POINTS[form]);
  const bands = bodyBands(mirrorOutline(outline), levels, v.bodyThickness);
  const ribTop = RIB_TOP * v.bodyThickness;
  const body = {
    top: breakBack(bands.top, form, ribTop),
    edge: breakBack(bands.edge, form, ribTop),
  };
  part(body.top, top, [v.bodyLength / 2, 0, 0]);
  part(body.edge, wood, [v.bodyLength / 2, 0, 0]);
  // The f-holes: dark S-shaped stems with round eyes, a little above the arch.
  const arch = placeCorners(body.top, transform([v.bodyLength / 2, 0, 0]));
  part(fHoles(arch), dark, [0, 0, 0]);
  // The neck with its round heel, the fingerboard as a tapered board, and the nut.
  part(sweep(NECK_RINGS.map((ring) => neckRing(ring, form))), wood, [0, 0, 0]);
  part(neckWalls(), wood, [0, 0, 0]);
  part(sweep([boardRing(v.fingerboardEnd), boardRing(v.nut)]), dark, [0, 0, 0]);
  const nutWidth = FINGERBOARD.nutWidth + 0.001;
  const nutTop = v.stringHeight - STRING_SIZE;
  part(box(FINGERBOARD.nutLength, nutTop - FINGERBOARD.nutUnder, nutWidth), dark, [
    v.nut + FINGERBOARD.nutLength / 2,
    (nutTop + FINGERBOARD.nutUnder) / 2,
    0,
  ]);
  // The hollow pegbox with its dark slot, the scroll, and the four pegs across the slot.
  const sc = SCROLL;
  const hollow = pegbox(v.nut + FINGERBOARD.nutLength);
  part(hollow.wood, wood, [0, 0, 0]);
  part(hollow.dark, dark, [0, 0, 0]);
  part(scrollSpiral(), top, [0, 0, 0]);
  part(
    cylinder(sc.coreRadius, sc.coreRadius, 2 * sc.coreHalfWidth, 6),
    wood,
    [sc.center[0], sc.center[1], -sc.coreHalfWidth],
    toQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)),
  );
  const pegY = (sc.nutRing[1] + sc.nutRing[2]) / 2;
  if (bass) {
    addMachines(piece, frame, pegY);
  }
  for (const [x, side] of bass ? [] : PEGS) {
    const turn = toQuat(
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (side * Math.PI) / 2),
    );
    piece.add(
      lathe(PEG_PROFILE, PEG_SEGMENTS),
      dark,
      inFrame(frame, transform([x, pegY, -side * (sc.nutRing[0] + 0.001)], turn, [1, 1, PEG_FLAT])),
      'varnish',
    );
  }
  // The tailpiece, which tapers from its top end to the edge of the body, the saddle, the
  // tailgut and the fine tuners of the upright forms, the chin rest, and the shoulder rest.
  part(sweep(TAILPIECE.map(tailRing)), dark, [0, 0, 0]);
  addTailEnd(piece, frame, form);
  if (!upright) {
    part(plate(chinRestOutline(), CHIN_REST.levels), dark, [
      CHIN_REST.center[0],
      CHIN_REST.bottom,
      CHIN_REST.center[1],
    ]);
    part(shoulderRest(), dark, [0, 0, 0]);
  }
  // The bridge: a thin plate across the violin, with its feet on the arch.
  const across = new Vector3(0, 0, 1);
  const along = new Vector3(1, 0, 0);
  const bridgeTurn = toQuat(
    new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(across, along, new Vector3().crossVectors(across, along)),
    ),
  );
  part(
    prism(
      BRIDGE_OUTLINE.map(([z, y]): OutlinePoint => [z, y - BRIDGE.center]).toReversed(),
      -BRIDGE.thickness / 2,
      BRIDGE.thickness / 2,
    ),
    INSTRUMENT_COLORS.bridge,
    [v.bridge, BRIDGE.feet + BRIDGE.center, 0],
    bridgeTurn,
  );
  // The four strings, from the end of the tailpiece over the bridge to the nut (design 4.5,
  // instrument colors). The strings of the cello and the contrabass are light metal windings.
  const st = STRINGS;
  const section = STRING_SECTIONS[STRING_SECTION[form]];
  const strings: number[] = [];
  const middle = v.stringHeight - STRING_SIZE / 2;
  for (let i = 0; i < 4; i++) {
    const share = i / 3 - 0.5;
    const outer = i === 0 || i === 3 ? 0 : 1;
    const tail: Vec3 = [st.tailEnd[0], st.tailEnd[1] + STRING_SIZE / 2, share * st.tailSpan];
    const bridge: Vec3 = [
      v.bridge,
      middle - st.bridgeDrop[outer],
      share * (v.stringsWidth - STRING_SIZE),
    ];
    const nut: Vec3 = [v.nut, middle - st.nutDrop[outer], share * st.nutSpan];
    strings.push(...strand(tail, bridge, section), ...strand(bridge, nut, section));
  }
  if (upright) {
    piece.add(strings, INSTRUMENT_COLORS.silver, inFrame(frame, transform()), 'metal');
  } else {
    piece.add(strings, INSTRUMENT_COLORS.strings, inFrame(frame, transform()));
  }
}

/**
 * The parts of the bow model, in meters in the bow axes: the bow runs along +x from the end of
 * the screw button to the tip, and the hair is below the stick (-y). The stick tapers to the
 * tip and bends a little toward the hair in its middle, as the camber of a real bow.
 */
const BOW_PARTS = {
  /** The rings of the stick: the place along the bow, the radius, and the camber toward the hair. */
  stick: [
    [0.006, 0.0034, 0],
    [0.15, 0.0031, 0.0015],
    [0.3, 0.0026, 0.0015],
    [0.435, 0.0021, 0],
  ],
  /** The screw button at the end: its length, and its radius at the end and at the stick. */
  button: [0.0075, 0.0028, 0.003],
  /** The side outline of the frog under the stick, as (along, height). */
  frog: [
    [0.007, -0.0028],
    [0.039, -0.0028],
    [0.0405, -0.0125],
    [0.031, -0.0165],
    [0.013, -0.017],
    [0.0065, -0.0135],
  ],
  /** The width of the frog. */
  frogWidth: 0.0085,
  /** The center of the metal ferrule at the front of the frog, where the hair comes out. */
  ferrule: [0.0385, -0.012],
  /** The center of the pale eye on each side of the frog, and its half size. */
  eye: [0.022, -0.0095, 0.0013],
  /** The side outline of the head at the tip, as (along, height). */
  head: [
    [0.432, 0.0022],
    [0.446, 0.0026],
    [0.4525, 0],
    [0.4515, -0.009],
    [0.447, -0.0135],
    [0.438, -0.0135],
    [0.4345, -0.004],
  ],
  /** The width of the head. */
  headWidth: 0.0048,
  /** The ends of the hair along the bow: the ferrule of the frog and the head. */
  hair: [0.04, 0.437],
} as const;

/**
 * Makes a flat part of the bow from its side outline, such as the frog or the head.
 *
 * @param outline The side outline as (along, height), clockwise when seen from +z, and
 *   star-shaped around the mean of its points.
 * @param width The width across the bow.
 * @returns The corner list in the bow axes.
 */
function bowSide(outline: readonly OutlinePoint[], width: number): number[] {
  const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length;
  const cy = outline.reduce((sum, [, y]) => sum + y, 0) / outline.length;
  // The prism takes the outline in its x-z plane: its x along the bow and its z down (-y).
  const corners = prism(
    outline.map(([x, y]): OutlinePoint => [x - cx, -(y - cy)]).toReversed(),
    -width / 2,
    width / 2,
  );
  const along = new Vector3(1, 0, 0);
  const across = new Vector3(0, 0, 1);
  const turn = toQuat(
    new Quaternion().setFromRotationMatrix(
      new Matrix4().makeBasis(along, across, new Vector3().crossVectors(along, across)),
    ),
  );
  return placeCorners(corners, transform([cx, cy, 0], turn));
}

/**
 * Adds the parts of the bow model to a piece. In the bow axes, the bow runs along +x from the frog
 * at the origin to the tip, and the hair is below the stick (-y).
 *
 * @param piece The piece that gets the parts.
 * @param frame The placement of the bow axes in the piece axes, before the piece scale.
 */
function addBowParts(piece: PieceBuilder, frame: Transform): void {
  const b = BOW;
  const p = BOW_PARTS;
  const add = (corners: number[], color: Rgb, finish: Finish = 'matte'): void => {
    piece.add(corners, color, inFrame(frame, transform()), finish);
  };
  const alongX = toQuat(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
  );

  // The stick: six faces that taper to the tip, with the camber toward the hair.
  const stick = p.stick.map(([x, r, camber]): Vec3[] =>
    Array.from({ length: 6 }, (_, k): Vec3 => {
      const angle = ((k + 0.5) / 6) * 2 * Math.PI;
      return [x, r * Math.cos(angle) - camber, r * Math.sin(angle)];
    }),
  );
  add(sweep(stick), INSTRUMENT_COLORS.bowStick, 'varnish');
  add(bowSide(p.head, p.headWidth), INSTRUMENT_COLORS.bowStick, 'varnish');

  // The frog with its metal ferrule and its eye, and the screw button.
  add(bowSide(p.frog, p.frogWidth), INSTRUMENT_COLORS.fingerboard, 'lacquer');
  const [eyeX, eyeY, eyeHalf] = p.eye;
  add(
    placeCorners(box(2 * eyeHalf, 2 * eyeHalf, p.frogWidth + 0.0004), transform([eyeX, eyeY, 0])),
    INSTRUMENT_COLORS.bowHair,
  );
  add(
    placeCorners(box(0.003, 0.0045, p.frogWidth + 0.0007), transform([...p.ferrule, 0])),
    INSTRUMENT_COLORS.silver,
    'metal',
  );
  const [buttonLength, buttonEnd, buttonStick] = p.button;
  add(
    placeCorners(cylinder(buttonEnd, buttonStick, buttonLength, 6), transform([0, 0, 0], alongX)),
    INSTRUMENT_COLORS.silver,
    'metal',
  );

  // The hair: a flat ribbon from the ferrule to the head.
  const [hairFrom, hairTo] = p.hair;
  add(
    placeCorners(
      box(hairTo - hairFrom, 0.0015, 0.008),
      transform([(hairFrom + hairTo) / 2, -b.hairGap, 0]),
    ),
    INSTRUMENT_COLORS.bowHair,
  );
}

/**
 * Calculates the rotation of the violin axes under the chin (design 4.6).
 *
 * @returns The rotation from the violin axes to the model axes.
 */
function chinRotation(): Quat {
  const h = CHIN_HOLD;
  const axis = new Vector3(
    -Math.sin(h.yaw) * Math.cos(h.pitch),
    -Math.sin(h.pitch),
    -Math.cos(h.yaw) * Math.cos(h.pitch),
  );
  const up = new Vector3(0, 1, 0).projectOnPlane(axis).normalize();
  // `front` is normal to the axis and to up, on the side of the audience.
  const front = new Vector3().crossVectors(axis, up).normalize();
  const top = up
    .clone()
    .multiplyScalar(Math.cos(h.roll))
    .addScaledVector(front, Math.sin(h.roll))
    .normalize();
  const basis = new Matrix4().makeBasis(axis, top, new Vector3().crossVectors(axis, top));
  return toQuat(new Quaternion().setFromRotationMatrix(basis));
}

/** The bow piece of a bowed string, and its targets. */
interface BowPiece {
  readonly piece: InstrumentPiece;
  readonly targets: readonly PlayTarget[];
}

/**
 * Calculates the rotation of an upright instrument from its hold.
 *
 * @param id The cello or the contrabass.
 * @returns The rotation that turns the piece +y to the axis of the hold, and the piece -z (the
 *   top plate) to its front.
 */
function uprightRotation(id: keyof typeof UPRIGHT_HOLDS): Quat {
  const { axis, front } = UPRIGHT_HOLDS[id];
  const up = new Vector3(...axis).normalize();
  const top = new Vector3(...front).projectOnPlane(up).normalize();
  const side = new Vector3().crossVectors(up, top.negate());
  const basis = new Matrix4().makeBasis(side, up, new Vector3().crossVectors(side, up));
  return toQuat(new Quaternion().setFromRotationMatrix(basis));
}

/**
 * The form of a bowed string model: the violin form of the violin, the viola, and the cello, or
 * the contrabass form with sloped shoulders, a flat back, and machine heads.
 */
type StringForm = 'violin' | 'cello' | 'contrabass';

/** The bowed strings of design 4.6. */
type BowedStringId = 'violin' | 'viola' | 'cello' | 'contrabass';

/**
 * The place of the bow stick at the grip, from the middle of the right palm, in head heights
 * (design 4.6). The stick lies in the fingers: on the palm side (-x) of the hanging mitten, in the
 * crease between the palm ball and the finger ball, 0.02 H from each (with the fingers curled
 * 45°). With a grip 0.07 H in front of the palm, inside the palm ball, the stick goes through the
 * hand.
 */
export const BOW_GRIP = [-0.127, 0.005, 0] as const satisfies Vec3;

/**
 * The grip of the bow in the right paw of a species (`SpeciesParams.bowGrip`, design 4.6), in the
 * axes of the hanging right paw of the bind pose: the palm faces -x, and the fingers point down.
 */
export interface BowGrip {
  /** The place of the stick at the grip, from the middle of the right palm, in head heights. */
  readonly at: Vec3;
  /**
   * The turn of the stick around the normal of the palm, in radians. A positive turn moves the tip
   * from the side of the thumb (-z) toward the wrist (+y).
   */
  readonly turn: number;
}

/** The grip of the bow of each species with no grip of its own: {@link BOW_GRIP}, square. */
const SQUARE_GRIP: BowGrip = { at: BOW_GRIP, turn: 0 };

/**
 * Builds the bow piece. In the piece axes, the grip is at the origin, the bow runs along +x to
 * the tip, and the hair is below the stick (-y). In the bind pose, the stick lies across the
 * fingers of the hanging right hand at the place of the grip: the tip points to the side of the
 * thumb (-z), turned toward the fingers by the turn of the grip, and the hair faces away from the
 * palm (-x).
 *
 * @param size The scale of the bow model.
 * @param grip The grip of the bow in the right paw.
 * @returns The piece and its targets.
 */
function buildBow(size: number, grip: BowGrip): BowPiece {
  const b = BOW;
  const piece = new PieceBuilder(size);
  addBowParts(piece, transform([-b.grip, 0, 0]));
  addBowSpace(piece, transform([-b.grip, 0, 0]));
  const hairY = -b.hairGap * size;
  // The bow points to the front (-z), and the hair faces the inner side (-x).
  const xAxis = new Vector3(0, 0, -1);
  const yAxis = new Vector3(1, 0, 0);
  const basis = new Matrix4().makeBasis(xAxis, yAxis, new Vector3().crossVectors(xAxis, yAxis));
  const rotation = toQuat(
    new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), grip.turn)
      .multiply(new Quaternion().setFromRotationMatrix(basis)),
  );
  return {
    piece: piece.build('bow', hold('palmR', grip.at, rotation)),
    targets: [
      {
        kind: 'bow-hair',
        bone: 'bow',
        from: [(0.025 - b.grip) * size, hairY, 0],
        to: [(b.length - 0.025 - b.grip) * size, hairY, 0],
        normal: [0, -1, 0],
        keys: null,
      },
    ],
  };
}

/**
 * Builds a bowed string instrument and its bow (design 4.6). A species with short arms plays a
 * smaller violin, cello, or contrabass and bow (`SpeciesParams.violinScale`,
 * `SpeciesParams.celloScale`, `SpeciesParams.bassScale`), as a child plays a fractional size. A
 * smaller cello or contrabass has a longer end pin ({@link endPinLength}).
 *
 * The violin and the viola use the violin axes: the tail end is at the origin, the violin runs
 * along +x to the scroll, and the top plate faces +y. The player holds them under the chin.
 *
 * The cello and the contrabass stand on the end pin: its tip is at the origin, the instrument
 * runs along +y to the scroll, and the top plate faces -z (the front of the player). The cello
 * stands between the knees, and the contrabass at the left side of the player.
 *
 * @param id The instrument.
 * @param scale The scale of the instrument and its bow, as a factor of {@link STRING_SCALES}.
 * @param grip The grip of the bow in the right paw of the species.
 * @param endPin The length of the end pin of a cello below the tail end, in meters, for the body of
 *   the player (`celloPinOf()` of `cello-fit.ts`), or `undefined` for {@link endPinLength}. The
 *   other instruments ignore it.
 * @returns The model.
 */
export function buildBowedString(
  id: BowedStringId,
  scale = 1,
  grip: BowGrip = SQUARE_GRIP,
  endPin?: number,
): InstrumentModel {
  const v = VIOLIN;
  const s = STRING_SCALES[id] * scale;
  const upright = id === 'cello' || id === 'contrabass';
  const pin = upright ? ((id === 'cello' ? endPin : undefined) ?? endPinLength(id, scale)) : 0;
  // The violin axes in the piece axes, before the scale: upright, the length is +y, the top is
  // -z, and the middle of the body depth is on the axis of the end pin.
  const lengthAxis = new Vector3(0, 1, 0);
  const topAxis = new Vector3(0, 0, -1);
  const uprightBasis = new Matrix4().makeBasis(
    lengthAxis,
    topAxis,
    new Vector3().crossVectors(lengthAxis, topAxis),
  );
  const frame = upright
    ? transform(
        [0, pin / s, v.bodyThickness / 2],
        toQuat(new Quaternion().setFromRotationMatrix(uprightBasis)),
      )
    : transform([0, 0, 0], IDENTITY);
  const piece = new PieceBuilder(s);
  addViolinParts(piece, frame, id === 'viola' ? 'violin' : id);
  addLayoutSpace(piece, frame, upright);
  if (upright) {
    addEndPin(piece, pin / s);
    piece.footprint(cylinder(0, 0.003, pin / s, 5), transform([0, 0, 0]));
  }
  const at = (p: Vec3): Vec3 => toVec3(new Vector3(...applyTransform(frame, p)).multiplyScalar(s));
  const top = toVec3(new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...frame.rotation)));
  const instrumentHold =
    id === 'cello' || id === 'contrabass'
      ? hold('floor', UPRIGHT_HOLDS[id].offsetH, uprightRotation(id), UPRIGHT_HOLDS[id].offset)
      : hold('head', CHIN_HOLD.offsetH, chinRotation());
  const instrument = piece.build('instrument', instrumentHold);
  const bow = buildBow((upright ? LOW_BOW_SCALE : INSTRUMENT_SCALE) * scale, grip);
  const stringsY = v.stringHeight;
  return {
    id,
    parent: upright ? 'root' : 'chest',
    pieces: [instrument, bow.piece],
    grips: {
      palmL: { bone: 'instrument', at: at([v.neckGrip, v.bodyThickness - 0.035, 0]) },
      palmR: { bone: 'bow', at: [0, 0, 0] },
      mouth: null,
      chin: upright
        ? null
        : { bone: 'instrument', at: at([0.018, v.bodyThickness + 0.012, -0.03]) },
    },
    targets: [
      {
        kind: 'bow-contact',
        bone: 'instrument',
        from: at([v.bowContact, stringsY, 0]),
        to: at([v.bowContact, stringsY, 0]),
        normal: top,
        keys: null,
      },
      {
        kind: 'fingerboard',
        bone: 'instrument',
        from: at([v.nut, stringsY, 0]),
        to: at([v.fingerboardEnd, stringsY, 0]),
        normal: top,
        keys: null,
      },
      ...bow.targets,
    ],
    size: pieceSize(instrument),
  };
}
