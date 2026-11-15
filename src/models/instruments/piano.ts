import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { MeshBuilder, transform } from '../mesh.ts';
import type { MeshData } from '../mesh.ts';
import { box, lathe, plate, prism, quad } from '../primitives.ts';
import type { OutlinePoint, ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, placeCorners } from './piece.ts';
import type { InstrumentModel, KeyTurn } from './types.ts';

/**
 * The lift of the case, the keys, the lid, the music desk, and the bar of the pedal lyre over the
 * floor, in meters before {@link PIANO_SCALE} (design 4.6). The legs and the posts of the lyre grow
 * by the lift, and the pedals and the box of the lyre stay on the floor. The polar bear pianist
 * sits tall on a bench that fits its legs, with its shoulders at about 1.33 m, so its keys stand
 * at 1.009 m, as a pianist sets the bench so that the forearms are level with the keys. With the
 * keys at 0.868 m (the scale 1.24 with no lift), the upright trunk of `HANDS_HOLDS.piano` slopes
 * the forearms 35° to 38° down to the keys, and with this lift 4° to 10° in the chord of the
 * close views (`pnpm pose-preview pianist`). A lift grows the piano up and leaves its width and
 * its depth, so the lid hides less of the players behind it than a larger scale with the same
 * keys.
 */
const PIANO_LIFT = 0.17;

/**
 * The sizes of the grand piano, in meters, before {@link PIANO_SCALE} (design 4.6), with the
 * heights of a real grand piano plus {@link PIANO_LIFT}. In the piano axes, the origin is on the
 * floor below the middle of the front edge of the keys. The player sits at +z, the case runs to -z,
 * and the keys run along x with the lowest key at -x.
 */
export const PIANO = {
  /** The width of the 52 white keys together. */
  keyboardWidth: 1.24,
  /** The height of the top of the white keys. */
  keyTop: 0.7 + PIANO_LIFT,
  /** The visible length of a white key and of a black key. */
  whiteKeyLength: 0.15,
  blackKeyLength: 0.09,
  /** The gap between two white keys. The key bed shows through it. */
  whiteKeyGap: 0.001,
  /**
   * The distance of the front of the white keys in front of the key bed under them. The key slip
   * in front of the keys then lies 2 cm in front of the key bed, so the front face of the key bed
   * behind it does not flash through it in the far views.
   */
  keyOverhang: 0.017,
  /** The key dip: the drop of the front of a white key at the key bottom. */
  keyDip: 0.01,
  /**
   * The distance of the balance rail behind the front edge of the white keys. A key turns around
   * the balance rail, at the height of the bottom of the white keys.
   */
  balanceRail: 0.25,
  /** The lowest and the highest key: A0 and C8. */
  keys: [21, 108],
  /** The width of the case. */
  caseWidth: 1.4,
  /** The bottom and the top of the rim of the case. */
  caseBottom: 0.62 + PIANO_LIFT,
  caseTop: 0.95 + PIANO_LIFT,
  /**
   * The angle of the open lid: the short prop stick of a grand piano. With the lift and the scale
   * 1.16, in the default view of `bach-bwv1050` at 20 s, the faces of both hippos behind the piano
   * show over the lid at 25°. At 35°, the long prop stick, the lid hides the face of the right
   * hippo up to its ears and the lower face of the left hippo.
   */
  lidAngle: 25 * MathUtils.DEG2RAD,
} as const;

/**
 * The scale of the whole piano around the origin of the piano axes: 1.16 times a real grand
 * piano, because the polar bear pianist is a large animal. {@link PIANO_LIFT} sets the height of
 * the keys. A larger piano hides the players behind it: in the default view of `bach-bwv1050` at
 * 20 s, with no lift and the lid at 35°, the faces of the hippos behind the piano show over the
 * lid at 1.24, the lid hides their eyes at 1.30, all but their ears at 1.36, and the whole hippos
 * at 1.508. The scale 1.24 with a lift of 0.13 puts the keys at the same height, and the far keys
 * 0.05 m further out at each end.
 */
export const PIANO_SCALE = 1.16;

/**
 * The distance of the front of the keys in front of the floor point of the body of the pianist,
 * in head heights `H`, before a further 0.05 m (design 4.6). The keys and the pedals stand near
 * the polar bear pianist, so that its short right leg reaches the damper pedal. At 1.0 H, the
 * thigh of the pedal leg pulls the haunch 2.3 cm into the bench, and 0.9 H keeps the haunch on the
 * pad but folds up to 3 more faces at the left shoulder. With the upright trunk of
 * `HANDS_HOLDS.piano`, keys at 1.05 H or 1.1 H bend the elbows less (114° at 1.1 H, 102° at
 * 1.0 H), but only 89% or 72% of the note targets of `bach-bwv1050` are within 5 mm (99% at 1.0 H,
 * `pnpm pose-depth pianist`).
 */
export const PIANO_FRONT_H = 1.0;

/**
 * The piano bench (design 4.5): a seat of 0.75 × 0.35 m at the height of a chair seat. Under a
 * body, the bench fits the legs and the haunch (`Body.benchDepth`), and it reaches
 * back to at least {@link PIANO_BENCH.bodyDepth} behind its front edge. The parts of the
 * bench of `polar-bear-views.png` are shares of the seat height: the padded seat (`pad`), the
 * apron under it (`apron`), and the brass foot of each leg (`foot`).
 */
export const PIANO_BENCH = {
  width: 0.75,
  depth: 0.35,
  /**
   * The least depth of the bench under a body, in meters. The fit of the polar bear holds
   * only the haunch from the seat top to 0.15 m above it, and its round haunch bulges further back
   * above that. A deeper bench grows back from its front edge, so the sloped thighs stay off it.
   * With the thighs 25° down, the fit is 0.244 m deep (0.195 m with the thighs 40° down), and the
   * bench of 0.32 m reaches 0.198 m behind the floor point, 0.076 m behind the back edge of the fit.
   */
  bodyDepth: 0.32,
  pad: 0.26,
  apron: 0.1,
  foot: 0.12,
  /** The width of a leg at its top. It tapers to 0.8 of it at the foot. */
  leg: 0.065,
  /** The inset of the apron and the legs from the edges of the seat. */
  inset: 0.015,
} as const;

/** A pedal of the grand piano, from the left of the player. */
type PianoPedal = 'soft' | 'sostenuto' | 'damper';

/**
 * The pedal lyre and the three pedals of the grand piano, in meters before {@link PIANO_SCALE}
 * (design 4.6). The sizes follow real grand pianos.
 * The lyre comes down from the case under the keys to a box just above the floor, and the pedals
 * come out of the front of the box toward the player.
 */
export const PIANO_PEDALS = {
  /** The x of the middle of each pedal: the soft pedal (una corda), the sostenuto, the damper. */
  x: { soft: -0.072, sostenuto: 0, damper: 0.072 },
  /** The z of the front tip of the pedals, behind the front edge of the keys. */
  tipZ: -0.05,
  /** The length of a pedal in front of the box. */
  length: 0.12,
  /** The foot plate at the front of a pedal: its width and its length. */
  plateWidth: 0.045,
  plateLength: 0.07,
  /** The width of the shank of a pedal, between the plate and the box. */
  shankWidth: 0.028,
  /** The height of the top of a pedal at rest, and the thickness of a pedal. */
  top: 0.06,
  thickness: 0.012,
  /** The drop of the damper pedal when the foot presses it down. */
  travel: 0.023,
  /** The box at the bottom of the lyre. */
  box: { width: 0.216, depth: 0.079, bottom: 0.015, top: 0.105 },
  /** The bar at the top of the lyre, under the case. */
  bar: { width: 0.305, height: 0.05, depth: 0.06 },
  /**
   * The flat posts of the lyre: the x of the middle of each post at the box and at the bar, the
   * width and the depth of a post, the radius of the pedal rod between them, and the gap of a post
   * over the box. The rods of the
   * soft pedal and the damper pedal run inside the posts, as on a real lyre, so they are not drawn.
   */
  post: { boxX: 0.085, barX: 0.12, width: 0.045, depth: 0.03, rodRadius: 0.005, lift: 0.002 },
  /** The braces from the back of the box to the case: their x, their reach back, their radius. */
  brace: { x: 0.06, back: 0.45, radius: 0.008 },
} as const;

/** The pitch classes of the black keys. */
const BLACK_KEYS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

/**
 * The plan of the case of a concert grand (design 4.6), in the piano axes: the front edge behind
 * the keys, a short straight treble side at +x, the bent side that swings in and out in an S
 * curve, the round tail, and the long straight bass side at -x. A smooth curve through the points
 * of the bent side and the tail gives the rim ({@link CASE_OUTLINE}). The plan keeps the box of
 * the case: 1.4 m wide and 2.0 m long from the front of the keys.
 */
const CASE_PLAN = {
  /** The z of the front edge of the case, behind the keys. */
  front: -0.17,
  /** The x of the bass side and of the straight treble side. */
  side: PIANO.caseWidth / 2,
  /** The z of the end of the straight part of the treble side, where the bent side starts. */
  trebleEnd: -0.42,
  /** The z of the end of the straight part of the bass side, where the tail starts. */
  bassEnd: -1.5,
  /** The points of the bent side and the tail, from the treble side to the bass side. */
  curve: [
    [0.7, -0.42],
    [0.66, -0.62],
    [0.55, -0.82],
    [0.42, -1.02],
    [0.33, -1.22],
    [0.27, -1.42],
    [0.22, -1.62],
    [0.15, -1.8],
    [0.02, -1.93],
    [-0.2, -2.0],
    [-0.44, -1.97],
    [-0.61, -1.85],
    [-0.69, -1.68],
    [-0.7, -1.5],
  ],
  /** The steps of the curve between two points of {@link CASE_PLAN.curve}. */
  steps: 3,
} as const;

/** The point of the piano axes around which the outlines of the case are star-shaped. */
const CASE_CENTER: OutlinePoint = [-0.1, -1.0];

/**
 * Calculates the points of a smooth curve through points (a uniform Catmull-Rom curve).
 *
 * @param points The points that the curve passes through, at least 2.
 * @param before The point before the first point, which sets the direction at the first point.
 * @param after The point after the last point, which sets the direction at the last point.
 * @param steps The steps between two points.
 * @returns The points of the curve, from the first point to the last point.
 */
function smoothCurve(
  points: readonly OutlinePoint[],
  before: OutlinePoint,
  after: OutlinePoint,
  steps: number,
): OutlinePoint[] {
  const all = [before, ...points, after];
  const out: OutlinePoint[] = [];
  for (let i = 1; i + 2 < all.length; i++) {
    const p0 = all[i - 1] ?? [0, 0];
    const p1 = all[i] ?? [0, 0];
    const p2 = all[i + 1] ?? [0, 0];
    const p3 = all[i + 2] ?? [0, 0];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const at = (k: 0 | 1): number =>
        0.5 *
        (2 * p1[k] +
          (p2[k] - p0[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
          (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
      out.push([at(0), at(1)]);
    }
  }
  const last = points.at(-1);
  if (last) {
    out.push(last);
  }
  return out;
}

/**
 * The outline of the rim around {@link CASE_CENTER}, counterclockwise from +y: the front corner
 * at the treble side, the straight treble side, the bent side, the tail, the straight bass side,
 * and the front corner at the bass side. The last edge is the front edge.
 */
const CASE_OUTLINE: readonly OutlinePoint[] = (() => {
  const plan = CASE_PLAN;
  // The points before and after the curve lie on the straight sides, a short step from its ends,
  // so the curve meets each side with no kink and with even steps.
  const curve = smoothCurve(
    plan.curve,
    [plan.side, plan.trebleEnd + 0.2],
    [-plan.side, plan.bassEnd + 0.2],
    plan.steps,
  );
  const points: OutlinePoint[] = [[plan.side, plan.front], ...curve, [-plan.side, plan.front]];
  return points.map(([x, z]): OutlinePoint => [x - CASE_CENTER[0], z - CASE_CENTER[1]]);
})();

/**
 * Moves each edge of a closed outline inward by a distance, and gives the outline of the new
 * edges.
 *
 * @param outline The outline, in the order of {@link CASE_OUTLINE}.
 * @param distance The distance of each edge but the last one.
 * @param lastDistance The distance of the last edge: the front edge of a case outline.
 * @returns The inner outline, with one point for each point of the outline.
 */
function insetOutline(
  outline: readonly OutlinePoint[],
  distance: number,
  lastDistance: number,
): OutlinePoint[] {
  const n = outline.length;
  const edge = (i: number) => {
    const [x0, z0] = outline[(i + n) % n] ?? [0, 0];
    const [x1, z1] = outline[(i + 1 + n) % n] ?? [0, 0];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const normal: OutlinePoint = [(z1 - z0) / length, -(x1 - x0) / length];
    return { normal, distance: (i + n) % n === n - 1 ? lastDistance : distance };
  };
  return outline.map(([x, z], i): OutlinePoint => {
    // The move of the point lies at the distance of each of its two edges from the edge.
    const a = edge(i - 1);
    const b = edge(i);
    const det = a.normal[0] * b.normal[1] - a.normal[1] * b.normal[0];
    if (Math.abs(det) < 1e-6) {
      return [x + a.normal[0] * a.distance, z + a.normal[1] * a.distance];
    }
    const dx = (a.distance * b.normal[1] - b.distance * a.normal[1]) / det;
    const dz = (a.normal[0] * b.distance - b.normal[0] * a.distance) / det;
    return [x + dx, z + dz];
  });
}

/**
 * The rim and the inside of the open case (design 4.5, 4.6), as a concert grand: a deep rim of
 * black lacquer, a spruce soundboard at the bottom of the well, a gold iron plate over it with a
 * row of round holes through it, the tuning pins on the front of the plate, the strings from the tuning pins
 * to the tail, and the row of dampers behind the music desk. The bass strings cross over the
 * other strings toward the tail, as the overstrung bass of a real grand. The depths are below the
 * top of the rim, and the sizes are in meters. Two faces that face the same way and cover each
 * other lie at least 2 cm apart, or the hidden one is not there: the depth buffer of the far hall
 * camera has steps of some millimeters, so nearer faces flash (design 4.6).
 */
export const PIANO_INSIDE = {
  /** The thickness of the rim wall. */
  rim: 0.05,
  /** The depth of the top of the soundboard. */
  soundboardDepth: 0.14,
  /** The depth of the top of the iron plate. */
  plateDepth: 0.09,
  /** The thickness of the iron plate. */
  plateThickness: 0.012,
  /** The band of the soundboard between the rim wall and the plate. */
  plateInset: 0.035,
  /** The z of each row of tuning pins, the pins in each row, and the size of a pin. */
  pins: { rows: [-0.205, -0.235], perRow: 40, width: 0.007, height: 0.018 },
  /** The depth of the strings. The bass strings lie higher, over the other strings. */
  stringDepth: 0.06,
  /** The z of the front end of the strings, behind the tuning pins. */
  stringFront: -0.26,
  /**
   * The strings: each one stands for a group of strings of the real piano. Each group has its x
   * at the front from `from` to `to`, its width, and its angle to -z toward +x at the first and
   * the last string, in degrees.
   */
  bass: { count: 20, from: -0.6, to: -0.38, width: 0.007, lift: 0.025, angle: [12, 16] },
  treble: { count: 48, from: -0.3, to: 0.6, width: 0.004, angle: [-3, -3] },
  /** The gap from the back end of a string to the edge of the plate: the hitch pins. */
  hitchGap: 0.04,
  /**
   * The dampers: a block on every second string, at `along` behind the front end of the string,
   * up to the front x of the highest damper. The highest keys of a real grand have no damper.
   */
  dampers: { along: 0.15, width: 0.018, height: 0.028, depth: 0.03, highestX: 0.36 },
  /**
   * The round holes through the plate: their x, their z, their radius, and the half width of the
   * square of plate around each hole.
   */
  holes: { x: [-0.44, -0.22, 0, 0.22], z: -0.58, radius: 0.035, half: 0.045 },
} as const;

/** The inner outline of the rim wall, around {@link CASE_CENTER}. It is open at the front. */
const RIM_INNER = insetOutline(CASE_OUTLINE, PIANO_INSIDE.rim, 0);

/** The outline of the iron plate, around {@link CASE_CENTER}. Its front is at the front edge. */
const PLATE_OUTLINE = insetOutline(RIM_INNER, PIANO_INSIDE.plateInset, 0);

/**
 * Tells whether a MIDI key is a black key.
 *
 * @param key The MIDI key.
 * @returns True for a black key.
 */
export function isBlack(key: number): boolean {
  return BLACK_KEYS.has(key % 12);
}

/**
 * Counts the white keys of the piano below a key.
 *
 * @param key The MIDI key.
 * @returns The number of white keys from A0 up to the key, the key excluded.
 */
function whiteKeysBelow(key: number): number {
  let count = 0;
  for (let k = PIANO.keys[0]; k < key; k++) {
    if (!isBlack(k)) {
      count++;
    }
  }
  return count;
}

/**
 * Gives the key of the piano that plays a MIDI key.
 *
 * @param key The MIDI key.
 * @returns The key, or the nearest key of the piano for a key outside it.
 */
function pianoKey(key: number): number {
  return Math.min(Math.max(Math.round(key), PIANO.keys[0]), PIANO.keys[1]);
}

/**
 * Calculates the place on a piano key where a finger plays it, in the piano axes.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point on the top of the key: near the front of a white key, and on the middle of a
 *   black key.
 */
export function pianoKeyPosition(key: number): Vec3 {
  const [x, y, z] = unscaledKeyPosition(key);
  return [x * PIANO_SCALE, y * PIANO_SCALE, z * PIANO_SCALE];
}

/**
 * Calculates the place on a piano key where a finger plays it, in the piano axes before
 * {@link PIANO_SCALE}.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point.
 */
function unscaledKeyPosition(key: number): Vec3 {
  const p = PIANO;
  const k = pianoKey(key);
  const width = p.keyboardWidth / 52;
  const left = -p.keyboardWidth / 2;
  if (isBlack(k)) {
    return [left + whiteKeysBelow(k) * width, p.keyTop + 0.012, -0.1];
  }
  return [left + (whiteKeysBelow(k) + 0.5) * width, p.keyTop, -0.04];
}

/**
 * Makes a prism with no top face, from an outline in the x-z plane. The case below the soundboard
 * has no top, because the soundboard and the rim wall cover it, and a hidden top so near the
 * soundboard flashed through it.
 *
 * @param outline The outline, counterclockwise when seen from +y, star-shaped around the origin.
 * @param bottom The height of the bottom face.
 * @param top The height of the top of the sides.
 * @returns `3 × outline.length` triangles.
 */
function openPrism(outline: readonly OutlinePoint[], bottom: number, top: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i] ?? [0, 0];
    const [x1, z1] = outline[(i + 1) % outline.length] ?? [0, 0];
    out.push(...quad([x0, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x0, top, z0]));
    out.push(0, bottom, 0, x1, bottom, z1, x0, bottom, z0);
  }
  return out;
}

/**
 * Makes the wall of the rim around the open inside, open at the front edge: the outer faces, the
 * inner faces, the top edge, and the end face of each arm at the front.
 *
 * @param outer The outline of the rim, in the order of {@link CASE_OUTLINE}.
 * @param inner The inner outline, with one point for each point of the outline.
 * @param bottom The height of the bottom of the wall.
 * @param top The height of the top of the wall.
 * @returns 6 triangles for each edge but the front edge, and 4 for the ends.
 */
function rimWall(
  outer: readonly OutlinePoint[],
  inner: readonly OutlinePoint[],
  bottom: number,
  top: number,
): number[] {
  const out: number[] = [];
  const corner = (points: readonly OutlinePoint[], i: number, y: number): Vec3 => {
    const [x, z] = points[i] ?? [0, 0];
    return [x, y, z];
  };
  const last = outer.length - 1;
  for (let i = 0; i < last; i++) {
    const [o0, o1, i0, i1] = [
      (y: number) => corner(outer, i, y),
      (y: number) => corner(outer, i + 1, y),
      (y: number) => corner(inner, i, y),
      (y: number) => corner(inner, i + 1, y),
    ];
    out.push(...quad(o0(bottom), o1(bottom), o1(top), o0(top)));
    out.push(...quad(i1(bottom), i0(bottom), i0(top), i1(top)));
    out.push(...quad(i0(top), o0(top), o1(top), i1(top)));
  }
  out.push(
    ...quad(
      corner(inner, 0, bottom),
      corner(outer, 0, bottom),
      corner(outer, 0, top),
      corner(inner, 0, top),
    ),
  );
  out.push(
    ...quad(
      corner(outer, last, bottom),
      corner(inner, last, bottom),
      corner(inner, last, top),
      corner(outer, last, top),
    ),
  );
  return out;
}

/**
 * Finds how far a ray goes inside an outline before it leaves it.
 *
 * @param outline The outline.
 * @param from The start of the ray, inside the outline.
 * @param direction The unit direction of the ray.
 * @returns The distance to the nearest edge of the outline along the ray, or 0 if no edge
 *   crosses the ray.
 */
function exitDistance(
  outline: readonly OutlinePoint[],
  from: OutlinePoint,
  direction: OutlinePoint,
): number {
  let nearest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i] ?? [0, 0];
    const [x1, z1] = outline[(i + 1) % outline.length] ?? [0, 0];
    const [ex, ez] = [x1 - x0, z1 - z0];
    const det = direction[0] * -ez + direction[1] * ex;
    if (Math.abs(det) < 1e-9) {
      continue;
    }
    const [rx, rz] = [x0 - from[0], z0 - from[1]];
    const t = (rx * -ez + rz * ex) / det;
    const s = (direction[0] * rz - direction[1] * rx) / det;
    if (t > 1e-6 && s >= 0 && s <= 1) {
      nearest = Math.min(nearest, t);
    }
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

/**
 * Makes a flat strip that faces up, from one point to another.
 *
 * @param from The start, in the x-z plane.
 * @param to The end, in the x-z plane.
 * @param width The width.
 * @param y The height.
 * @returns 2 triangles.
 */
function flatStrip(from: OutlinePoint, to: OutlinePoint, width: number, y: number): number[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const [sx, sz] = [
    (-(to[1] - from[1]) / length) * (width / 2),
    ((to[0] - from[0]) / length) * (width / 2),
  ];
  return quad(
    [from[0] - sx, y, from[1] - sz],
    [from[0] + sx, y, from[1] + sz],
    [to[0] + sx, y, to[1] + sz],
    [to[0] - sx, y, to[1] - sz],
  );
}

/**
 * Gives the corners of a quad in the order that makes its face point toward a direction.
 *
 * @param a The first corner.
 * @param b The second corner.
 * @param c The third corner.
 * @param d The fourth corner.
 * @param toward The direction that the face points to.
 * @returns 2 triangles.
 */
function quadToward(a: Vec3, b: Vec3, c: Vec3, d: Vec3, toward: Vec3): number[] {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
    (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
    (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
  ];
  const along =
    (normal[0] ?? 0) * toward[0] + (normal[1] ?? 0) * toward[1] + (normal[2] ?? 0) * toward[2];
  return along >= 0 ? quad(a, b, c, d) : quad(d, c, b, a);
}

/**
 * Keeps the part of an outline on one side of a line x = value or z = value.
 *
 * @param outline The outline.
 * @param axis 0 for a line x = value, 1 for a line z = value.
 * @param value The place of the line.
 * @param keep 1 to keep the side above the value, -1 to keep the side below it.
 * @returns The outline of the part, in the same order.
 */
function clipOutline(
  outline: readonly OutlinePoint[],
  axis: 0 | 1,
  value: number,
  keep: 1 | -1,
): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  const inside = (p: OutlinePoint): boolean => (p[axis] - value) * keep >= 0;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i] ?? [0, 0];
    const q = outline[(i + 1) % outline.length] ?? [0, 0];
    if (inside(p)) {
      out.push(p);
    }
    if (inside(p) !== inside(q)) {
      const t = (value - p[axis]) / (q[axis] - p[axis]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Makes a slab from an outline: a prism with its caps as fans from a point inside.
 *
 * @param outline The outline, star-shaped around the center.
 * @param bottom The height of the bottom.
 * @param top The height of the top.
 * @param center The center of the fans, or the mean of the points of the outline.
 * @returns The triangles.
 */
function slab(
  outline: readonly OutlinePoint[],
  bottom: number,
  top: number,
  center?: OutlinePoint,
): number[] {
  const [cx, cz] = center ?? [
    outline.reduce((sum, [x]) => sum + x, 0) / outline.length,
    outline.reduce((sum, [, z]) => sum + z, 0) / outline.length,
  ];
  return placeCorners(
    prism(
      outline.map(([x, z]): OutlinePoint => [x - cx, z - cz]),
      bottom,
      top,
    ),
    transform([cx, 0, cz]),
  );
}

/**
 * Makes the iron plate with a row of round holes through it ({@link PIANO_INSIDE}): a slab in
 * front of the row, a slab behind it, and between them a band with an octagon hole in a square
 * around each hole. The soundboard shows through each hole.
 *
 * @param bottom The height of the bottom of the plate.
 * @param top The height of the top of the plate.
 * @returns The triangles, in the axes of the outline of the plate.
 */
function plateWithHoles(bottom: number, top: number): number[] {
  const { holes } = PIANO_INSIDE;
  const [cx, cz] = CASE_CENTER;
  const z = holes.z - cz;
  const h = holes.half;
  const out: number[] = [];
  out.push(...slab(clipOutline(PLATE_OUTLINE, 1, z + h, 1), bottom, top));
  out.push(...slab(clipOutline(PLATE_OUTLINE, 1, z - h, -1), bottom, top, [0, 0]));
  const band = clipOutline(clipOutline(PLATE_OUTLINE, 1, z + h, -1), 1, z - h, 1);
  const xs = holes.x.map((x) => x - cx);
  let left = band;
  for (const x of xs) {
    out.push(...slab(clipOutline(left, 0, x - h, -1), bottom, top));
    left = clipOutline(left, 0, x + h, 1);
    // The top of the square around the hole, and the wall of the hole.
    const ring = (radius: number, k: number): Vec3 => {
      const angle = (k / 8) * 2 * Math.PI;
      const reach = radius / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const r = radius === h ? reach : radius;
      return [x + r * Math.cos(angle), top, z + r * Math.sin(angle)];
    };
    for (let k = 0; k < 8; k++) {
      const [a, b] = [ring(holes.radius, k), ring(holes.radius, k + 1)];
      out.push(...quadToward(a, b, ring(h, k + 1), ring(h, k), [0, 1, 0]));
      const inward: Vec3 = [x - (a[0] + b[0]) / 2, 0, z - (a[2] + b[2]) / 2];
      out.push(...quadToward(a, b, [b[0], bottom, b[2]], [a[0], bottom, a[2]], inward));
    }
  }
  out.push(...slab(left, bottom, top));
  return out;
}

/** One string of the piano in the piano axes: its front end, its back end, its width and height. */
interface PianoString {
  /** The front end, behind the tuning pins. */
  readonly front: OutlinePoint;
  /** The back end, at the hitch pins. */
  readonly back: OutlinePoint;
  /** The width of the strip. */
  readonly width: number;
  /** The height of the string. */
  readonly y: number;
  /** Whether the string is a wound bass string. */
  readonly bass: boolean;
}

/**
 * Calculates the strings of the piano ({@link PIANO_INSIDE}): the bass strings, which fan out to
 * the tail over the other strings, and the other strings, which run back to the edge of the plate.
 *
 * @returns The strings, from the lowest to the highest.
 */
function pianoStrings(): PianoString[] {
  const inside = PIANO_INSIDE;
  const [cx, cz] = CASE_CENTER;
  const edge = PLATE_OUTLINE.map(([x, z]): OutlinePoint => [x + cx, z + cz]);
  const stringY = PIANO.caseTop - inside.stringDepth;
  const out: PianoString[] = [];
  for (const group of [inside.bass, inside.treble]) {
    const bass = group === inside.bass;
    for (let i = 0; i < group.count; i++) {
      const share = i / (group.count - 1);
      const x = group.from + (group.to - group.from) * share;
      const angle =
        (group.angle[0] + (group.angle[1] - group.angle[0]) * share) * MathUtils.DEG2RAD;
      const direction: OutlinePoint = [Math.sin(angle), -Math.cos(angle)];
      const front: OutlinePoint = [x, inside.stringFront];
      const length = exitDistance(edge, front, direction) - inside.hitchGap;
      out.push({
        front,
        back: [x + direction[0] * length, inside.stringFront + direction[1] * length],
        width: group.width,
        y: stringY + (bass ? inside.bass.lift : 0),
        bass,
      });
    }
  }
  return out;
}

/**
 * Adds the inside of the open case ({@link PIANO_INSIDE}): the soundboard at the bottom of the
 * well, the front face of the pin block under the front of the plate, the iron plate with its
 * holes, the tuning pins, the strings, and the dampers.
 *
 * @param piece The piece of the piano.
 * @param boardY The height of the bottom of the well.
 */
function addInside(piece: PieceBuilder, boardY: number): void {
  const inside = PIANO_INSIDE;
  const [cx, cz] = CASE_CENTER;
  const rimAt = transform([cx, 0, cz]);
  const top = PIANO.caseTop;
  const plateY = top - inside.plateDepth;
  const inner = CASE_PLAN.side - inside.rim;

  const boardTop = boardY + 0.005;
  const plateBottom = plateY - inside.plateThickness;
  piece.add(prism(RIM_INNER, boardY, boardTop), INSTRUMENT_COLORS.soundboard, rimAt);
  // The front face of the pin block, between the soundboard and the plate over the fallboard. The
  // plate covers its top.
  const front = CASE_PLAN.front;
  piece.add(
    quad(
      [-inner, boardTop, front],
      [inner, boardTop, front],
      [inner, plateBottom, front],
      [-inner, plateBottom, front],
    ),
    INSTRUMENT_COLORS.pianoCase,
    transform(),
    'polish',
  );
  piece.add(plateWithHoles(plateBottom, plateY), INSTRUMENT_COLORS.pianoPlate, rimAt, 'metal');

  const pins: number[] = [];
  const { pins: pin } = inside;
  for (const [row, z] of pin.rows.entries()) {
    for (let i = 0; i < pin.perRow; i++) {
      const x = -inner + 0.04 + ((i + row / 2) / pin.perRow) * (2 * inner - 0.08);
      // A pin has no bottom face, because it stands on the plate.
      const half = pin.width / 2;
      const pinTop = plateY + pin.height;
      pins.push(
        ...placeCorners(postSides(plateY, pinTop, half, half), transform([x, 0, z])),
        ...quad(
          [x - half, pinTop, z + half],
          [x + half, pinTop, z + half],
          [x + half, pinTop, z - half],
          [x - half, pinTop, z - half],
        ),
      );
    }
  }
  piece.add(pins, INSTRUMENT_COLORS.pianoStrings, transform(), 'metal');

  const strings = pianoStrings();
  const bassWire: number[] = [];
  const steelWire: number[] = [];
  const dampers: number[] = [];
  const d = inside.dampers;
  for (const [i, string] of strings.entries()) {
    (string.bass ? bassWire : steelWire).push(
      ...flatStrip(string.front, string.back, string.width, string.y),
    );
    if (i % 2 === 1 || string.front[0] > d.highestX) {
      continue;
    }
    const [dx, dz] = [string.back[0] - string.front[0], string.back[1] - string.front[1]];
    const share = d.along / Math.hypot(dx, dz);
    dampers.push(
      ...placeCorners(
        box(d.width, d.height, d.depth),
        transform([
          string.front[0] + dx * share,
          string.y + 0.002 + d.height / 2,
          string.front[1] + dz * share,
        ]),
      ),
    );
  }
  piece.add(steelWire, INSTRUMENT_COLORS.pianoStrings, transform(), 'string');
  piece.add(bassWire, INSTRUMENT_COLORS.pianoBassStrings, transform(), 'string');
  piece.add(dampers, INSTRUMENT_COLORS.pianoCase, transform(), 'polish');
}

/**
 * Adds the pedal lyre ({@link PIANO_PEDALS}): the bar under the case, two flat posts, the thin
 * rod of the sostenuto pedal between them, the box just above the floor, and two braces from the
 * back of the box to the bottom of the case.
 *
 * @param piece The piece of the piano.
 */
function addLyre(piece: PieceBuilder): void {
  const { box: base, bar, post, brace } = PIANO_PEDALS;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const z = PIANO_PEDALS.tipZ - PIANO_PEDALS.length - base.depth / 2;
  const barBottom = PIANO.caseBottom - bar.height;
  piece.add(
    box(base.width, base.top - base.bottom, base.depth),
    dark,
    transform([0, (base.top + base.bottom) / 2, z]),
    'polish',
  );
  piece.add(
    box(bar.width, bar.height, bar.depth),
    dark,
    transform([0, barBottom + bar.height / 2, z]),
    'polish',
  );
  for (const side of [-1, 1]) {
    // The tilted post starts a little over the box, so that no corner of it goes into the box.
    piece.bar(
      [side * post.boxX, base.top + post.lift, z],
      [side * post.barX, barBottom, z],
      post.width,
      post.depth,
      dark,
      'polish',
    );
    piece.rod(
      [side * brace.x, base.top - brace.radius, z - base.depth / 2],
      [side * brace.x, PIANO.caseBottom, z - brace.back],
      brace.radius,
      6,
      dark,
      'polish',
    );
  }
  const rodX = PIANO_PEDALS.x.sostenuto;
  piece.rod([rodX, base.top, z], [rodX, barBottom, z], post.rodRadius, 4, dark, 'polish');
}

/**
 * Adds one pedal ({@link PIANO_PEDALS}): the shank out of the box of the lyre, and the wider foot
 * plate at the front, with the top at the height of a pedal at rest.
 *
 * @param piece The piece that carries the pedal.
 * @param pedal The pedal.
 */
function addPedal(piece: PieceBuilder, pedal: PianoPedal): void {
  const p = PIANO_PEDALS;
  const x = p.x[pedal];
  const y = p.top - p.thickness / 2;
  const color = INSTRUMENT_COLORS.brass;
  piece.add(
    box(p.plateWidth, p.thickness, p.plateLength),
    color,
    transform([x, y, p.tipZ - p.plateLength / 2]),
    'metal',
  );
  // The shank starts inside the box, so that no gap shows when the damper pedal goes down.
  const shankFront = p.tipZ - p.plateLength;
  const shankBack = p.tipZ - p.length - p.box.depth / 2;
  piece.add(
    box(p.shankWidth, p.thickness, shankFront - shankBack),
    color,
    transform([x, y, (shankFront + shankBack) / 2]),
    'metal',
  );
}

/**
 * Calculates the middle of the front edge of the top of a pedal at rest, in the piano axes.
 *
 * @param pedal The pedal.
 * @returns The point.
 */
export function pianoPedalTip(pedal: PianoPedal): Vec3 {
  const p = PIANO_PEDALS;
  return [p.x[pedal] * PIANO_SCALE, p.top * PIANO_SCALE, p.tipZ * PIANO_SCALE];
}

/**
 * How far the point of a black key ({@link pianoKeyFront}) stands behind the front edge of the
 * black key, in meters. The claws of the polar bear hang about 3 cm in front of the point,
 * so with no inset they stop over the white keys in front of the black key. A pianist also plays
 * a black key farther in than a white key.
 */
const BLACK_KEY_INSET = 0.05;

/**
 * Calculates the point of a piano key that the paw of a pianist aims at, at the height of the top
 * of the key, in the piano axes. For a white key, it is the middle of its front edge. The paw of
 * the polar bear is longer than a white key, so the palm stays in front of this point, and
 * the claws lie at the front of the key (design 5.3). A black key is shorter and higher, so its
 * point stands {@link BLACK_KEY_INSET} behind its own front edge, at its top. The claws then
 * reach over the white keys and lie on the black key.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point.
 */
export function pianoKeyFront(key: number): Vec3 {
  const p = PIANO;
  const [x, y] = pianoKeyPosition(key);
  if (!isBlack(pianoKey(key))) {
    return [x, y, 0];
  }
  return [x, y, -(p.whiteKeyLength - p.blackKeyLength) * PIANO_SCALE - BLACK_KEY_INSET];
}

/**
 * Adds the 88 keys from A0 to C8 in MIDI order, each as a part of its own (design 4.6), so that
 * each key can go down with its note (5.3). The white keys stand side by side with a narrow gap
 * ({@link PIANO.whiteKeyGap}), and each black key lies on the two white keys at its sides.
 *
 * @param piece The piece of the piano.
 */
function addKeys(piece: PieceBuilder): void {
  const p = PIANO;
  const width = p.keyboardWidth / 52;
  for (let k = p.keys[0]; k <= p.keys[1]; k++) {
    const [x] = unscaledKeyPosition(k);
    if (isBlack(k)) {
      piece.key(
        k,
        box(0.012, 0.012, p.blackKeyLength),
        INSTRUMENT_COLORS.blackKeys,
        transform([x, p.keyTop + 0.006, -p.whiteKeyLength + p.blackKeyLength / 2]),
      );
    } else {
      piece.key(
        k,
        box(width - p.whiteKeyGap, 0.02, p.whiteKeyLength),
        INSTRUMENT_COLORS.whiteKeys,
        transform([x, p.keyTop - 0.01, -p.whiteKeyLength / 2]),
      );
    }
  }
}

/**
 * The line that the piano keys turn around, and the turn of a key at the key bottom (design 4.6,
 * 5.3). The line lies along the keys under the balance rail, behind the fallboard, so the front of
 * a white key goes down by the key dip, and its back less. The turn is the same at each scale.
 */
const PIANO_KEY_TURN: KeyTurn = {
  pivot: [0, (PIANO.keyTop - 0.02) * PIANO_SCALE, -PIANO.balanceRail * PIANO_SCALE],
  axis: [1, 0, 0],
  angle: Math.atan(PIANO.keyDip / PIANO.balanceRail),
};

/**
 * The front of the case and the music desk of the grand piano (design 4.6), in meters before
 * {@link PIANO_SCALE}. The fallboard stands open behind the keys, the key slip runs in front of
 * them, and a cheek block closes each end of the keys. The music desk stands on a rail across the
 * front of the case, just behind the fallboard, and leans back, as the desk of a real grand.
 */
export const PIANO_FRONT = {
  /** The fallboard: its gap over the top of the keys, its height, and its thickness. */
  fallboard: { gap: 0.014, height: 0.105, thickness: 0.03 },
  /** The z of the front face of the fallboard. It reaches 1 cm over the back of the keys. */
  fallboardFront: -0.14,
  /** The key slip: its height, its thickness, and the drop of its top below the key top. */
  keySlip: { height: 0.04, thickness: 0.012, drop: 0.024 },
  /**
   * The key bed under the keys, between the cheek blocks: its height, and the drop of its top
   * below the key top.
   */
  keyBed: { height: 0.06, drop: 0.02 },
  /** A cheek block: its width, and its rise over the key top. It reaches down to the key bed bottom. */
  cheek: { width: 0.08, rise: 0.05 },
  /** The rail of the desk on the rim top: its z, its depth, and its height. */
  rail: { z: -0.27, depth: 0.05, height: 0.03 },
  /** The desk: its width, its height, its thickness, and its lean back from vertical. */
  desk: { width: 0.76, height: 0.27, thickness: 0.016, lean: 18 * MathUtils.DEG2RAD },
  /** The z of the bottom front edge of the desk. */
  deskFront: -0.255,
  /** The ledge at the bottom of the desk: its height and its depth. */
  ledge: { height: 0.018, depth: 0.035 },
  /** The sheet music on the desk: its width and its height. */
  sheet: { width: 0.44, height: 0.21 },
} as const;

/**
 * The lid, the prop stick, and the hinges of the grand piano (design 4.6), in meters
 * before {@link PIANO_SCALE}. The lid hinges on the straight bass side and opens toward the bent
 * side, and the prop stick stands on the rim of the bent side near the front, as on a real grand.
 */
export const PIANO_LID = {
  /** The thickness of the lid. */
  thickness: 0.025,
  /**
   * The z of the hinge of the front flap of the lid. The open lid has the flap folded back onto
   * it, so the music desk stands in front of the lid.
   */
  flapZ: -0.4,
  /** The z of the prop stick, at the end of the straight treble side. */
  propZ: -0.42,
  /** The distance of the top of the prop stick from the edge of the lid. */
  propInset: 0.06,
  /** The radius of the prop stick. */
  propRadius: 0.011,
  /** The z of each hinge on the bass side, and the length of a hinge. */
  hinges: [-0.35, -0.95, -1.55],
  /**
   * A hinge knuckle: its length, its radius, and the distance of its axis outside the rim and
   * below the rim top.
   */
  hinge: { length: 0.07, radius: 0.007, out: 0.009, down: 0.008 },
} as const;

/**
 * The x and the z of each leg of the grand piano, in meters before {@link PIANO_SCALE}: two under
 * the front corners of the case, and one under the tail (design 4.6).
 */
const PIANO_LEGS: readonly OutlinePoint[] = [
  [-0.62, -0.3],
  [0.62, -0.3],
  [-0.15, -1.8],
];

/**
 * Gives the profile of a leg of the grand piano: a wide foot on the floor, a shaft that tapers
 * down from a block under the case.
 *
 * @param height The height of the leg, to the bottom of the case.
 * @returns The profile, from the floor to the top.
 */
function legProfile(height: number): ProfilePoint[] {
  return [
    [0.05, 0],
    [0.05, 0.03],
    [0.034, 0.07],
    [0.046, height - 0.08],
    [0.062, height - 0.07],
    [0.062, height],
  ];
}

/**
 * Gives the turn of the music desk of the grand piano: it leans back around its bottom front
 * edge, which stands on the rail ({@link PIANO_FRONT}).
 *
 * @returns The turn.
 */
function deskLean(): Quaternion {
  return new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -PIANO_FRONT.desk.lean);
}

/**
 * Gives a point on the music desk of the grand piano, in the axes of the piano before
 * {@link PIANO_SCALE}.
 *
 * @param x The distance to the right of the middle of the desk.
 * @param up The distance up the desk from its bottom front edge.
 * @param out The distance out of the front face of the desk, toward the player.
 * @returns The point.
 */
function onDesk(x: number, up: number, out: number): Vec3 {
  const edge = new Vector3(0, PIANO.caseTop, PIANO_FRONT.deskFront);
  return toVec3(new Vector3(x, up, out).applyQuaternion(deskLean()).add(edge));
}

/**
 * Gives the corners of the sheet music on the desk of the grand piano, in the axes of the piano
 * before {@link PIANO_SCALE}: the lower left, the lower right, the upper right, and the upper left,
 * as the player sees them.
 *
 * @param out The distance out of the front face of the desk, toward the player.
 * @returns The four corners.
 */
function sheetCorners(out: number): [Vec3, Vec3, Vec3, Vec3] {
  const { ledge, sheet } = PIANO_FRONT;
  const [x0, x1] = [-sheet.width / 2, sheet.width / 2];
  const top = ledge.height + sheet.height;
  return [
    onDesk(x0, ledge.height, out),
    onDesk(x1, ledge.height, out),
    onDesk(x1, top, out),
    onDesk(x0, top, out),
  ];
}

/**
 * Gives the corners of the sheet music on the desk of the grand piano (design 4.5, 4.6), in the
 * axes of its piece, as {@link sheetCorners} gives them, with {@link PIANO_SCALE}. The scene
 * prints music on them (`buildSheets()` of `models/stage.ts`).
 *
 * @returns The four corners.
 */
export function pianoSheetCorners(): [Vec3, Vec3, Vec3, Vec3] {
  const scaled = (point: Vec3): Vec3 => [
    point[0] * PIANO_SCALE,
    point[1] * PIANO_SCALE,
    point[2] * PIANO_SCALE,
  ];
  const [a, b, c, d] = sheetCorners(0);
  return [scaled(a), scaled(b), scaled(c), scaled(d)];
}

/**
 * Adds the front of the case ({@link PIANO_FRONT}): the key bed, the key slip, the cheek blocks,
 * the fallboard, the rail of the desk, the desk with its ledge, and the sheet music.
 *
 * @param piece The piece of the piano.
 */
function addFront(piece: PieceBuilder): void {
  const p = PIANO;
  const f = PIANO_FRONT;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const front = CASE_PLAN.front;
  const half = p.keyboardWidth / 2;

  // The front of the key bed stands back from the front of the keys, so that the front face of a
  // pressed key does not lie on it.
  const bedFront = -p.keyOverhang;
  piece.add(
    box(p.keyboardWidth, f.keyBed.height, bedFront - front),
    dark,
    transform([0, p.keyTop - f.keyBed.drop - f.keyBed.height / 2, (front + bedFront) / 2]),
    'polish',
  );
  const slip = f.keySlip;
  piece.add(
    box(p.keyboardWidth, slip.height, slip.thickness),
    dark,
    transform([0, p.keyTop - slip.drop - slip.height / 2, slip.thickness / 2]),
    'polish',
  );
  const cheek = f.cheek;
  const cheekHeight = cheek.rise + f.keyBed.drop + f.keyBed.height;
  for (const side of [-1, 1]) {
    piece.add(
      box(cheek.width, cheekHeight, -front),
      dark,
      transform([
        side * (half + cheek.width / 2),
        p.keyTop + cheek.rise - cheekHeight / 2,
        front / 2,
      ]),
      'polish',
    );
  }
  const fall = f.fallboard;
  piece.add(
    box(p.keyboardWidth, fall.height, fall.thickness),
    dark,
    transform([0, p.keyTop + fall.gap + fall.height / 2, f.fallboardFront - fall.thickness / 2]),
    'polish',
  );

  const rail = f.rail;
  piece.add(
    box(2 * (CASE_PLAN.side - PIANO_INSIDE.rim), rail.height, rail.depth),
    dark,
    transform([0, p.caseTop - rail.height / 2, rail.z]),
    'polish',
  );
  const desk = f.desk;
  const lean = deskLean();
  // The sheet lies in the face of the desk, in a frame of the desk, so no face of the desk lies
  // under it. A sheet on the face of the desk flashed through it in the far views.
  const ledge = f.ledge;
  const sheet = f.sheet;
  const t = desk.thickness;
  const sheetTop = ledge.height + sheet.height;
  const side = (desk.width - sheet.width) / 2;
  const deskPart = (width: number, height: number, x: number, up: number): number[] =>
    placeCorners(box(width, height, t), transform(onDesk(x, up, -t / 2), toQuat(lean)));
  // The sheet is one face to the player, and the back of the desk behind it is one face to the
  // audience. The sides of the frame close the edges between them.
  const sheetFace = (out: number, toward: Vec3): number[] => {
    const [lowerLeft, lowerRight, upperRight, upperLeft] = sheetCorners(out);
    return quadToward(
      lowerLeft,
      lowerRight,
      upperRight,
      upperLeft,
      toVec3(new Vector3(...toward).applyQuaternion(lean)),
    );
  };
  piece.add(
    [
      ...deskPart(side, desk.height, -(sheet.width + side) / 2, desk.height / 2),
      ...deskPart(side, desk.height, (sheet.width + side) / 2, desk.height / 2),
      ...deskPart(sheet.width, ledge.height, 0, ledge.height / 2),
      ...deskPart(sheet.width, desk.height - sheetTop, 0, (sheetTop + desk.height) / 2),
      ...sheetFace(-t, [0, 0, -1]),
    ],
    dark,
    transform(),
    'polish',
  );
  piece.add(sheetFace(0, [0, 0, 1]), INSTRUMENT_COLORS.sheet);
  piece.add(
    box(desk.width, ledge.height, ledge.depth),
    dark,
    transform([0, p.caseTop + ledge.height / 2, f.deskFront + ledge.depth / 2]),
    'polish',
  );
}

/**
 * Adds the lid ({@link PIANO_LID}): the lid in the outline of the rim, open on its hinges at the
 * bass side with its front flap folded back, the hinges, and the prop stick on the rim of the bent
 * side under the edge of the lid.
 *
 * @param piece The piece of the piano.
 */
function addLid(piece: PieceBuilder): void {
  const p = PIANO;
  const l = PIANO_LID;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const hingeX = -CASE_PLAN.side;
  // The main lid behind the flap hinge, and the flap folded back onto it. The lid axes have the
  // hinge line on their z axis and their origin at the z of the center of the case.
  const flapZ = l.flapZ - CASE_CENTER[1];
  const main = CASE_OUTLINE.map(([x, z]): OutlinePoint => [x, Math.min(z, flapZ)]);
  const flapDepth = l.flapZ - CASE_PLAN.front;
  const lid = [
    ...placeCorners(prism(main, 0, l.thickness), transform([CASE_CENTER[0] - hingeX, 0, 0])),
    ...placeCorners(
      box(2 * CASE_PLAN.side, l.thickness, -flapDepth),
      transform([CASE_PLAN.side, 1.5 * l.thickness, flapZ + flapDepth / 2]),
    ),
  ];
  piece.add(
    lid,
    dark,
    transform(
      [hingeX, p.caseTop, CASE_CENTER[1]],
      toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), p.lidAngle)),
    ),
    'polish',
  );
  // Each hinge is a knuckle just outside the rim, under the hinge line, so that no flat face of
  // it lies on the rim.
  const knuckle = l.hinge;
  for (const z of l.hinges) {
    const at: Vec3 = [hingeX - knuckle.out, p.caseTop - knuckle.down, z];
    piece.rod(
      [at[0], at[1], z - knuckle.length / 2],
      [at[0], at[1], z + knuckle.length / 2],
      knuckle.radius,
      6,
      INSTRUMENT_COLORS.brass,
      'metal',
    );
  }

  // The prop stick stands in the middle of the rim top and holds the lid near its edge.
  const reach = 2 * CASE_PLAN.side - l.propInset;
  const foot: Vec3 = [CASE_PLAN.side - PIANO_INSIDE.rim / 2, p.caseTop, l.propZ];
  const head: Vec3 = [
    hingeX + reach * Math.cos(p.lidAngle),
    p.caseTop + reach * Math.sin(p.lidAngle),
    l.propZ,
  ];
  piece.rod(foot, head, l.propRadius, 6, dark, 'polish');
}

/**
 * Builds the grand piano (design 4.6). It stands on the floor in front of the player, with the
 * lid open to the right of the player, toward the bent side. The celesta and the organs use it
 * too.
 *
 * @returns The model.
 */
export function buildPiano(): InstrumentModel {
  const p = PIANO;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const piece = new PieceBuilder(PIANO_SCALE);

  // The rim: the case below the soundboard, and the wall around the open inside. The open lid
  // shows the inside, as the piano of `mockup.png`.
  const rimAt = transform([CASE_CENTER[0], 0, CASE_CENTER[1]]);
  const boardY = p.caseTop - PIANO_INSIDE.soundboardDepth;
  piece.add(openPrism(CASE_OUTLINE, p.caseBottom, boardY), dark, rimAt, 'polish');
  piece.add(rimWall(CASE_OUTLINE, RIM_INNER, boardY, p.caseTop), dark, rimAt, 'polish');
  addInside(piece, boardY);
  addLid(piece);
  addFront(piece);
  addKeys(piece);

  // Three legs, and the lyre with the pedals.
  for (const [x, z] of PIANO_LEGS) {
    piece.add(lathe(legProfile(p.caseBottom), 8), dark, transform([x, 0, z]), 'polish');
  }
  addLyre(piece);
  addPedal(piece, 'soft');
  addPedal(piece, 'sostenuto');
  // The damper pedal follows the `slide` bone, so that the foot of the pianist can press it.
  const damper = new PieceBuilder(PIANO_SCALE);
  addPedal(damper, 'damper');

  // The round belly of the polar bear reaches 0.45 m in front of the floor point, so keys
  // at 0.55 H + 0.05 m (0.26 m) go 15 cm into it. With an upright trunk, keys at 1.37 H stretch
  // the elbows to 117° with the upper arms 28° forward. With the claws on the key tops
  // (`HANDS_HOLDS.piano`) and the upright trunk, the keys at `PIANO_FRONT_H` bend the elbows 97° to
  // 103°, and the forearms go at most 6.3 cm into the belly, under the limit of 9 cm.
  const instrument = piece.build(
    'instrument',
    hold('floor', [0, 0, -PIANO_FRONT_H], undefined, [0, 0, -0.05]),
  );
  const lowHand = pianoKeyPosition(48);
  const highHand = pianoKeyPosition(72);
  const s = PIANO_SCALE;
  return {
    id: 'piano',
    parent: 'root',
    pieces: [instrument, damper.build('slide', hold('instrument'))],
    grips: {
      palmL: { bone: 'instrument', at: [lowHand[0], (p.keyTop + 0.04) * s, -0.06 * s] },
      palmR: { bone: 'instrument', at: [highHand[0], (p.keyTop + 0.04) * s, -0.06 * s] },
      mouth: null,
      chin: null,
    },
    targets: [
      {
        kind: 'keyboard',
        bone: 'instrument',
        from: pianoKeyPosition(p.keys[0]),
        to: pianoKeyPosition(p.keys[1]),
        normal: [0, 1, 0],
        keys: p.keys,
      },
    ],
    size: pieceSize(instrument),
    keyTurn: PIANO_KEY_TURN,
  };
}

/**
 * Gives the four sides of a square post that tapers along y, with no caps: the caps of the legs
 * of the bench lie under the apron and on the floor.
 *
 * @param bottom The height of the bottom.
 * @param top The height of the top.
 * @param lower The half width at the bottom.
 * @param upper The half width at the top.
 * @returns 8 triangles.
 */
function postSides(bottom: number, top: number, lower: number, upper: number): number[] {
  const ring = (half: number, y: number): Vec3[] => [
    [half, y, half],
    [half, y, -half],
    [-half, y, -half],
    [-half, y, half],
  ];
  const low = ring(lower, bottom);
  const high = ring(upper, top);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.push(
      ...quad(low[i] ?? [0, 0, 0], low[j] ?? [0, 0, 0], high[j] ?? [0, 0, 0], high[i] ?? [0, 0, 0]),
    );
  }
  return out;
}

/**
 * Builds the piano bench (design 4.5, 4.6), as the bench of `polar-bear-views.png`: a padded
 * seat with round top edges, an apron under it, and four square legs that taper down to brass
 * feet, in 100 triangles. The seat center is above the origin, and the player sits on it and
 * faces -z.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param depth The depth of the seat, in meters.
 * @param front The reach of the front edge of the seat in front of the origin, in meters: half the
 *   depth for a seat around the origin.
 * @returns The mesh data, with all vertices on bone 0.
 */
export function buildPianoBench(
  seatHeight: number,
  depth: number = PIANO_BENCH.depth,
  front: number = depth / 2,
): MeshData {
  const b = PIANO_BENCH;
  const builder = new MeshBuilder();
  const color = INSTRUMENT_COLORS.pianoCase;
  const pad = b.pad * seatHeight;
  const apron = b.apron * seatHeight;
  const padBottom = seatHeight - pad;
  const halfX = b.width / 2;
  const halfZ = depth / 2;
  // The middle of the seat: behind the origin when the seat reaches further back than forward.
  const middle = halfZ - front;
  const seat: OutlinePoint[] = [
    [halfX, halfZ],
    [halfX, -halfZ],
    [-halfX, -halfZ],
    [-halfX, halfZ],
  ];
  builder.add(
    plate(seat, [
      [1, padBottom],
      [1, padBottom + 0.7 * pad],
      [0.96, seatHeight],
    ]),
    { color, at: transform([0, 0, middle]), finish: 'lacquer' },
  );
  builder.add(box(b.width - 2 * b.inset, apron, depth - 2 * b.inset), {
    color,
    at: transform([0, padBottom - apron / 2, middle]),
    finish: 'lacquer',
  });
  const legTop = padBottom - apron;
  const foot = b.foot * seatHeight;
  const half = b.leg / 2;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const at = transform([
        (x * (b.width - 2 * b.inset - b.leg)) / 2,
        0,
        middle + (z * (depth - 2 * b.inset - b.leg)) / 2,
      ]);
      builder.add(postSides(foot, legTop, 0.8 * half, half), { color, at, finish: 'lacquer' });
      builder.add(postSides(0, foot, 0.72 * half, 0.8 * half), {
        color: INSTRUMENT_COLORS.brass,
        at,
        finish: 'metal',
      });
    }
  }
  return builder.build();
}
