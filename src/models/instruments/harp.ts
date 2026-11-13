import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import type { Finish, Rgb } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { box, lathe, plate, sweep } from '../primitives.ts';
import type { OutlinePoint, PlateLevel } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize } from './piece.ts';
import type { InstrumentModel, PedalTurn, StringLine } from './types.ts';

/** A point of the strings plane x = 0 of the harp, as (y, z) in meters. */
type PlanePoint = readonly [y: number, z: number];

/**
 * The sizes of the concert pedal harp, in meters (design 4.6). In the harp axes, the base stands
 * on the floor at the origin, and the player sits at +z. The column stands at the far side (-z).
 * The soundbox rises from the base to the player, and the neck joins the top of the column to the
 * top of the soundbox. The strings stand vertical in the plane x = 0, between the soundbox and the
 * neck.
 */
export const HARP = {
  /** The base on the floor: a bar along z at the height y, with its width on x and its height. */
  base: { z: [-0.42, 0.08], y: 0.04, width: 0.26, height: 0.08 },
  /**
   * The bottom and the top of the column, as (y, z). The muzzle of the Tripo fawn reaches over
   * the neck near the crown. With the crown at 1.3, the neck lay 2.8 cm below the muzzle. The
   * crown now stands at 1.25, and the neck falls by a share of the 0.05 that goes to 0 at the
   * soundbox, so the gap is 4.8 cm with the turn of {@link HARP_PLACE} (`pnpm pose-depth harpist
   * --gaps`).
   */
  column: [
    [0.08, -0.38],
    [1.25, -0.38],
  ],
  /**
   * The bottom and the top of the soundbox axis, as (y, z). The bottom stands near the foot of the
   * column, so that the long bass strings start near the base, as on a concert harp.
   */
  soundbox: [
    [0.08, -0.29],
    [0.98, 0.3],
  ],
  /**
   * The middle line of the neck from the top of the column to the top of the soundbox, as (y, z):
   * the S curve of a concert harp. It falls from the crown, rises in a hump over the middle
   * strings, and falls to the top of the soundbox. The last point is inside the top of the
   * soundbox, so the end of the neck sits on it.
   */
  neck: [
    [1.25, -0.38],
    [1.224, -0.3],
    [1.198, -0.215],
    [1.18, -0.125],
    [1.165, -0.035],
    [1.141, 0.05],
    [1.102, 0.135],
    [1.048, 0.215],
    [0.993, 0.285],
    [0.962, 0.315],
  ],
  /** The number of strings: C1 to G7, seven strings in each octave, as a concert harp. */
  strings: 47,
  /** The MIDI keys of the lowest and the highest string of a concert harp: C1 and G7. */
  keys: [24, 103],
} as const;

/**
 * The place of the harp at the player (design 4.6). As a harpist sits, the base stands on the
 * floor in front of the player, between the knees, with the pedals at the feet, and the soundbox
 * rests on the right shoulder, near the neck of the player (`docs/reference/harp-technique.md`,
 * sections 2 and 7.7). The deer is the only harp player, and its body sets the place. Its chest
 * stands 17 cm in front of its shoulder joints, so a soundbox on the shoulder put the strings out
 * of the reach of its arms. The top of the soundbox thus stands at the right side of the chest,
 * below the right shoulder, and the right arm hangs outside it. The base stands near the stool,
 * so that the arms of the Tripo fawn reach the strings, and to the right, so that the soundbox
 * stays off the chest. With this place, every 0.5 s of `boulanger-matin` and in the lift, the
 * rest, and the lowering (`scratch/dh/evalc.ts` of the round 2026-11-13), no arm goes through
 * the strings, each note target lies within 5 mm, and only the right hoof goes more than 1.3 cm
 * into a harp part, in a pedal move. `pnpm hold-fit --set` and the other probes change it as
 * `harpPlace`.
 */
export const HARP_PLACE = {
  /**
   * The move of the base to the right of the floor point under the seat, in head heights. At
   * 0.26 H, the left paw goes 1.7 cm into the body, against 0.7 cm.
   */
  side: 0.22,
  /** The move of the base up, in meters, at the scale 1 of the harp: 0, on the floor. */
  lift: 0,
  /**
   * The distance of the base in front of the floor point, in meters, at the scale 1. At 0.16 m,
   * the left paw goes 3.1 cm into the body in 11 % of the samples. At 0.22 m, the right arm goes
   * through the strings in 5 % of the samples, and the right paw misses 4 % of its note targets.
   */
  front: 0.19,
  /**
   * The tilt of the harp back to the player. A concert harp leans back onto the shoulder, but the
   * soundbox of the model already leans 33° toward the player. With a tilt of 3°, the left paw goes
   * 7.2 cm into the body in 55 % of the samples, and the right thigh 1.8 cm into the soundbox. So
   * the harp stands upright, as some smaller harps do (section 1).
   */
  tilt: 0,
  /**
   * The turn of the harp around the vertical, seen from above, so that the column goes to the
   * front left: the harp is diagonal to the player. The left hand plays the bass strings at the
   * front left, and the right hand the treble strings near the right shoulder. A larger turn
   * brings the bass strings nearer to the left paw, and the strings nearer to the chest. At 45°,
   * the right upper arm goes 1.4 cm into the neck of the harp in 1.3 % of the samples. At 51°, it
   * goes 1.4 cm into the soundbox in 3.2 %, and the left paw 2.3 cm into the body.
   */
  turn: 48 * MathUtils.DEG2RAD,
};

/**
 * The section of the soundbox (design 4.6): a flat soundboard on the side of the strings and a
 * round back of five flat staves on the side of the player. The soundbox is wide and deep at the
 * base and narrow and shallow at the top, as the soundbox of a concert harp.
 */
const SOUNDBOX = {
  /** The distance of the soundboard from the axis, toward the strings. */
  board: 0.019,
  /**
   * The half width of the soundboard at the bottom and at the top of the axis. The top rests at
   * the right shoulder of the player. With the half width 0.05 and the depth 0.059 at the top, the
   * right side of the chest of the Tripo fawn went 1.4 cm into the soundbox in 91 % of the play
   * (`scratch/deerclip/depth.ts`), and with this top, it stays out.
   */
  width: [0.14, 0.03],
  /**
   * The exponent of the narrowing of the width and the depth along the axis. Above 1, the
   * soundbox narrows fast near the base and slowly near the top, as the pear outline of a
   * soundboard.
   */
  narrowing: 1.4,
  /**
   * The depth of the back below the soundboard at the bottom and at the top of the axis. The top
   * is shallow, so that the back stays off the chest of the player.
   */
  depth: [0.12, 0.035],
  /** The places of the rings of the soundbox along its axis, from 0 (bottom) to 1 (top). */
  rings: [0, 0.3, 0.65, 1],
  /** The height of the center strip above the soundboard. The strings start on its top. */
  strip: 0.006,
  /** The half width of the center strip. */
  stripWidth: 0.011,
  /**
   * The holes in the middle stave of the back: the place along the axis and the half length of
   * each hole. A harpist changes the strings through them.
   */
  holes: [
    [0.18, 0.045],
    [0.38, 0.04],
    [0.56, 0.033],
    [0.72, 0.026],
  ],
} as const;

/**
 * The section of the neck along its middle line (design 4.6): a flat bottom, in which the strings
 * end, and a round top. A brass plate covers the bottom of each side, as the plates of the action
 * of a pedal harp.
 */
const NECK = {
  /**
   * The height of the section at the column and at the top of the soundbox. The end at the
   * soundbox is slim, as on a concert harp, so that it fits on the narrow top of the soundbox and
   * stays off the right shoulder of the player. With the height 0.065 and the half thickness
   * 0.024 at the end, the right upper arm of the Tripo fawn went 1.8 cm into the neck in 93 % of
   * the play, and with this end, more than 1.0 cm in 0.2 %.
   */
  height: [0.1, 0.04],
  /** The half thickness of the neck on x, at the column and at the top of the soundbox. */
  thickness: [0.024, 0.012],
  /** The height of each brass plate above the bottom of the neck. */
  plate: 0.03,
} as const;

/**
 * The column (design 4.6): a fluted shaft between a gilded foot on the base and a gilded crown at
 * the top. Each profile is (radius, height) in meters.
 */
const COLUMN = {
  /** The foot on the base. */
  foot: [
    [0.045, 0.08],
    [0.045, 0.11],
    [0.031, 0.15],
  ],
  /** The radius of the ridges and of the flutes of the shaft. */
  shaft: [0.031, 0.026],
  /** The number of flutes of the shaft. */
  flutes: 5,
  /**
   * The crown on the top of the column, around the end of the neck. It is lower than the crown of
   * a concert harp: with its top at 1.395, the crown stood at the nose tip of the Tripo fawn in the
   * side views, and the fawn seemed to bite it. With the top at 1.272, it stands below the muzzle.
   */
  crown: [
    [0.031, 1.18],
    [0.045, 1.21],
    [0.054, 1.245],
    [0.042, 1.265],
    [0, 1.272],
  ],
  /** The number of faces of the foot and the crown around the column. */
  segments: 8,
} as const;

/**
 * The outline of the base around its middle, as (x, z), counterclockwise seen from above: a long
 * octagon of the width and the length of `HARP.base`.
 */
const BASE_OUTLINE: readonly OutlinePoint[] = [
  [0.09, 0.25],
  [0.13, 0.21],
  [0.13, -0.21],
  [0.09, -0.25],
  [-0.09, -0.25],
  [-0.13, -0.21],
  [-0.13, 0.21],
  [-0.09, 0.25],
];

/** The levels of the base: straight sides and a bevel at the top edge. */
const BASE_LEVELS: readonly PlateLevel[] = [
  [1, 0],
  [1, 0.064],
  [0.93, 0.08],
];

/** A pedal of the harp, by the name of its strings. */
export type HarpPedal = 'D' | 'C' | 'B' | 'E' | 'F' | 'G' | 'A';

/**
 * A notch of a harp pedal: the top notch makes its strings flat, the middle notch natural, and
 * the bottom notch sharp.
 */
type PedalNotch = 'flat' | 'natural' | 'sharp';

/**
 * The seven pedals of a concert harp (design 4.6), in meters at the scale 1. The pedals of D, C,
 * and B are at the left of the soundbox, and the pedals of E, F, G, and A at its right, from the
 * left to the right as the harpist sees them. Each pedal leaves the end of the base at the player
 * and points out to its side and toward the player, in a fan.
 */
export const HARP_PEDALS = {
  /** The pedals from the left to the right, in the order of their parts in the model. */
  order: ['D', 'C', 'B', 'E', 'F', 'G', 'A'],
  /** The root of each pedal on the outline of the base, as (x, z). */
  root: {
    D: [-0.13, 0],
    C: [-0.11, 0.06],
    B: [-0.06, 0.08],
    E: [0.03, 0.08],
    F: [0.075, 0.08],
    G: [0.11, 0.06],
    A: [0.13, 0],
  },
  /** The turn of each pedal from +z toward +x, seen from above, in degrees. */
  heading: { D: -70, C: -45, B: -20, E: 10, F: 25, G: 45, A: 70 },
  /** The height of the root of a pedal in the base. */
  y: 0.045,
  /** The length of a pedal out of the base, seen from above. The root goes 1 cm into the base. */
  length: 0.05,
  /**
   * The height of the end of a pedal in each notch, from the height of its root. No source gives
   * the travel of a pedal.
   */
  notch: { flat: 0.006, natural: -0.012, sharp: -0.03 },
  /** The share of the length of a pedal from its root to the point where the hoof presses it. */
  foot: 0.75,
  /** The width and the thickness of a pedal. */
  bar: [0.014, 0.012],
} as const;

/**
 * The strings (design 4.6). Each string is a thin prism of three sides with open ends, so that it
 * stays out of the frame that the clearance probes read.
 */
const STRINGS = {
  /**
   * The places of the bass string and of the treble string along z. The bass string starts near
   * the bottom of the soundboard and ends in the neck near the column, and the treble string ends
   * where the neck meets the soundbox, so the strings fill the frame.
   */
  ends: [-0.295, 0.24],
  /** The radius of the prism of the bass string and of the treble string. */
  radius: [0.0026, 0.0014],
  /** The extra radius of a wound wire string. */
  wire: 0.0004,
  /** The number of wound wire strings, from the bass. */
  wires: 12,
  /** The first nylon string, from the bass. The strings between the wires and it are gut. */
  nylon: 35,
  /**
   * The number of rings of each string, from the soundboard to the neck. Two rings make one
   * straight segment. The scene draws the swing of a plucked string as a band of its own (design
   * 4.6), so the part does not bend.
   */
  rings: 2,
  /**
   * The largest swing at the pluck point after a loudest pluck, of the bass string and of the
   * treble string, at the scale 1. The strings between take the geometric mean by their place. A
   * mezzo-forte pluck of a D♭2 string releases it at about 4 mm, and the largest measured release
   * is about 7 mm (`docs/reference/harp-technique.md`, section 5). No source gives the treble.
   */
  swing: [0.007, 0.0015],
  /**
   * The angle of the long axis of the ellipse of a swing out of the plane of the strings. A
   * measure gives 7° to 43°, so the string swings mostly in the plane, across the string.
   */
  swingTilt: 25 * MathUtils.DEG2RAD,
  /** The short axis of the ellipse of a swing, as a share of the long axis. No source gives it. */
  swingCross: 0.3,
} as const;

/**
 * The pluck point of each string (design 4.6): a share of the string from the top of the center
 * strip of the soundboard up to the bottom of the neck (`neckBottom()`). Harpists pluck at about
 * one third to two fifths of the string from the soundboard, and the fingers differ by less than
 * 1% of the length (`docs/reference/harp-technique.md`, section 7.3). The hold of the harp player
 * (`HANDS_HOLDS.harp`) fits these points.
 */
const PLUCK = {
  /** The share of the length from the soundboard. 0.5 is the middle. */
  share: 0.37,
} as const;

/** The diatonic step of each pitch class: a sharp plays on the string of the natural below it. */
const DIATONIC_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const;

/**
 * Calculates the height of a line at a point of the strings plane, between its points.
 *
 * @param line The points of the line, in the order of z.
 * @param z The position along z.
 * @returns The height. Outside the line, the first or the last segment continues.
 */
function heightOn(line: readonly PlanePoint[], z: number): number {
  for (let i = 0; i + 1 < line.length; i++) {
    const [y0, z0] = line[i] ?? [0, 0];
    const [y1, z1] = line[i + 1] ?? [0, 0];
    if (z <= z1 || i + 2 === line.length) {
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
  }
  return line[0]?.[0] ?? 0;
}

/** Gives the unit direction of the soundbox axis from its bottom to its top, as (y, z). */
function soundboxAxis(): PlanePoint {
  const [[y0, z0], [y1, z1]] = HARP.soundbox;
  const length = Math.hypot(y1 - y0, z1 - z0);
  return [(y1 - y0) / length, (z1 - z0) / length];
}

/**
 * Gives the normal of the soundboard: the unit direction from the soundbox axis to the strings,
 * up and toward the column, as (y, z).
 */
function boardNormal(): PlanePoint {
  const [ay, az] = soundboxAxis();
  return [az, -ay];
}

/**
 * Calculates the height of the top of the center strip of the soundboard below a point of the
 * strings plane: the point where the string starts.
 *
 * @param z The position along z.
 * @returns The height.
 */
function boardHeight(z: number): number {
  const [[y0, z0], [y1, z1]] = HARP.soundbox;
  const [ny, nz] = boardNormal();
  const offset = SOUNDBOX.board + SOUNDBOX.strip;
  const t = (z - z0 - offset * nz) / (z1 - z0);
  return y0 + t * (y1 - y0) + offset * ny;
}

/**
 * Gives the unit direction of the neck at each point of its middle line, as (y, z), from the
 * point before it to the point after it.
 *
 * @returns One direction for each point of `HARP.neck`.
 */
function neckTangents(): PlanePoint[] {
  const points = HARP.neck;
  return points.map((_, i) => {
    const [y0, z0] = points[Math.max(i - 1, 0)] ?? [0, 0];
    const [y1, z1] = points[Math.min(i + 1, points.length - 1)] ?? [0, 0];
    const length = Math.hypot(y1 - y0, z1 - z0);
    return [(y1 - y0) / length, (z1 - z0) / length];
  });
}

/**
 * Gives the height of the neck section at each point of its middle line.
 *
 * @returns One height for each point of `HARP.neck`.
 */
function neckHeights(): number[] {
  return neckRamp(NECK.height);
}

/**
 * Gives a size of the neck section at each point of its middle line, in equal steps from the
 * column to the top of the soundbox.
 *
 * @param ends The size at the column and at the top of the soundbox.
 * @returns One size for each point of `HARP.neck`.
 */
function neckRamp(ends: readonly [first: number, last: number]): number[] {
  const [first, last] = ends;
  const count = HARP.neck.length;
  return HARP.neck.map((_, i) => first + ((last - first) * i) / (count - 1));
}

/**
 * Gives the line of the bottom of the neck, where the strings end, as (y, z).
 *
 * @returns One point for each point of `HARP.neck`.
 */
function neckBottom(): PlanePoint[] {
  const tangents = neckTangents();
  const heights = neckHeights();
  return HARP.neck.map(([y, z], i) => {
    const [ty, tz] = tangents[i] ?? [0, 1];
    const half = (heights[i] ?? 0) / 2;
    // The up side of the section is the tangent turned toward +y: (tz, -ty).
    return [y - tz * half, z + ty * half];
  });
}

/**
 * Gives the place of one string along z.
 *
 * @param index The string, from 0 (the bass string) to `HARP.strings - 1`.
 * @returns The position along z.
 */
function stringZ(index: number): number {
  const [first, last] = STRINGS.ends;
  return first + ((last - first) * index) / (HARP.strings - 1);
}

/**
 * Calculates the pluck point of one string, in the harp axes.
 *
 * @param index The string, from 0 (the bass string) to `HARP.strings - 1`.
 * @returns The point on the string near its middle.
 */
function pluckPoint(index: number): Vec3 {
  const z = stringZ(index);
  const bottom = boardHeight(z);
  return [0, bottom + PLUCK.share * (heightOn(neckBottom(), z) - bottom), z];
}

/**
 * Finds the string that plays a MIDI key (design 4.6). A concert harp has a string for each
 * natural note from C1 to G7, and a pedal raises a string by a semitone. Thus a sharp plays on the
 * string of the natural below it.
 *
 * @param key The MIDI key. A key outside the harp plays the nearest string.
 * @returns The index of the string, from 0 (the bass string) to `HARP.strings - 1`.
 */
export function harpString(key: number): number {
  const k = Math.round(key);
  const step = (n: number): number => Math.floor(n / 12) * 7 + (DIATONIC_STEPS[n % 12] ?? 0);
  return Math.min(Math.max(step(k) - step(HARP.keys[0]), 0), HARP.strings - 1);
}

/**
 * Calculates the place on the strings where a hand plucks a MIDI key, in the harp axes.
 *
 * @param key The MIDI key. A key outside the harp plays the nearest string.
 * @param scale The scale of the harp of the species (`SpeciesParams.harpScale`): the harp
 *   shrinks toward its base on the floor.
 * @returns The pluck point of the string of the key, at `PLUCK.share` of the string.
 */
export function harpStringPosition(key: number, scale = 1): Vec3 {
  const [x, y, z] = pluckPoint(harpString(key));
  return [x * scale, y * scale, z * scale];
}

/**
 * Turns the corner order of each triangle of a list so that each face points to one side.
 *
 * @param corners The corner list, 9 numbers for each triangle.
 * @param outward The direction to which each face must point.
 * @returns The new corner list.
 */
function facing(corners: readonly number[], outward: Vec3): number[] {
  const out: number[] = [];
  const side = new Vector3(...outward);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t + 8 < corners.length; t += 9) {
    a.fromArray(corners, t);
    b.fromArray(corners, t + 3);
    c.fromArray(corners, t + 6);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const order = normal.dot(side) < 0 ? [0, 6, 3] : [0, 3, 6];
    for (const k of order) {
      out.push(...corners.slice(t + k, t + k + 3));
    }
  }
  return out;
}

/**
 * Makes a flat fan from a center point to a closed loop of corners.
 *
 * @param center The center.
 * @param loop The corners around the center.
 * @returns One triangle for each corner, in any order.
 */
function fan(center: Vec3, loop: readonly Vec3[]): number[] {
  return loop.flatMap((corner, i) => [
    ...center,
    ...corner,
    ...(loop[(i + 1) % loop.length] ?? corner),
  ]);
}

/**
 * Gives a point of the soundbox from its axis coordinates.
 *
 * @param t The place along the axis, from 0 (bottom) to 1 (top).
 * @param x The position across the soundboard.
 * @param v The distance from the axis toward the strings.
 * @returns The point in the harp axes.
 */
function soundboxPoint(t: number, x: number, v: number): Vec3 {
  const [[y0, z0], [y1, z1]] = HARP.soundbox;
  const [ny, nz] = boardNormal();
  return [x, y0 + t * (y1 - y0) + v * ny, z0 + t * (z1 - z0) + v * nz];
}

/**
 * Gives the half width and the back depth of the soundbox at a place along its axis.
 *
 * @param t The place along the axis, from 0 (bottom) to 1 (top).
 * @returns The half width and the depth of the back below the soundboard.
 */
function soundboxSection(t: number): readonly [width: number, depth: number] {
  const [bottomWidth, topWidth] = SOUNDBOX.width;
  const [bottomDepth, topDepth] = SOUNDBOX.depth;
  const share = (1 - t) ** SOUNDBOX.narrowing;
  return [topWidth + (bottomWidth - topWidth) * share, topDepth + (bottomDepth - topDepth) * share];
}

/**
 * Gives one ring of the soundbox: the two edges of the soundboard and the five staves of the
 * back, counterclockwise seen from the top of the axis.
 *
 * @param t The place along the axis, from 0 (bottom) to 1 (top).
 * @returns The corners.
 */
function soundboxRing(t: number): Vec3[] {
  const [width, depth] = soundboxSection(t);
  const ring: Vec3[] = [];
  for (let k = 5; k >= 0; k--) {
    const angle = (k / 5) * Math.PI;
    ring.push(soundboxPoint(t, width * Math.cos(angle), SOUNDBOX.board - depth * Math.sin(angle)));
  }
  return ring;
}

/**
 * Adds the soundbox (design 4.6): the round back, the spruce soundboard, the center strip in which
 * the strings start, and the holes in the back.
 *
 * @param piece The harp.
 */
function addSoundbox(piece: PieceBuilder): void {
  const colors = INSTRUMENT_COLORS;
  piece.add(sweep(SOUNDBOX.rings.map(soundboxRing)), colors.harpFrame, transform(), 'varnish');

  // The soundboard lies a little above the board face of the box, inside its edges.
  const [ny, nz] = boardNormal();
  const up: Vec3 = [0, ny, nz];
  const board: number[] = [];
  const strip: Vec3[][] = [];
  for (let j = 0; j + 1 < SOUNDBOX.rings.length; j++) {
    const t0 = SOUNDBOX.rings[j] ?? 0;
    const t1 = SOUNDBOX.rings[j + 1] ?? 1;
    const w0 = soundboxSection(t0)[0] * 0.92;
    const w1 = soundboxSection(t1)[0] * 0.92;
    const v = SOUNDBOX.board + 0.0015;
    board.push(
      ...soundboxPoint(t0, -w0, v),
      ...soundboxPoint(t0, w0, v),
      ...soundboxPoint(t1, w1, v),
      ...soundboxPoint(t0, -w0, v),
      ...soundboxPoint(t1, w1, v),
      ...soundboxPoint(t1, -w1, v),
    );
  }
  piece.add(facing(board, up), colors.harpBoard, transform(), 'varnish');

  // The center strip runs along the middle of the soundboard, from the base to the top.
  const w = SOUNDBOX.stripWidth;
  const low = SOUNDBOX.board;
  const high = SOUNDBOX.board + SOUNDBOX.strip;
  for (const t of [0, 1]) {
    strip.push([
      soundboxPoint(t, w, low),
      soundboxPoint(t, w * 0.7, high),
      soundboxPoint(t, -w * 0.7, high),
      soundboxPoint(t, -w, low),
    ]);
  }
  piece.add(sweep(strip, false), colors.harpStrip, transform(), 'varnish');

  // The holes lie on the middle stave of the back, a little out of it.
  const back: Vec3 = [0, -ny, -nz];
  const [[y0, z0], [y1, z1]] = HARP.soundbox;
  const length = Math.hypot(y1 - y0, z1 - z0);
  for (const [t, half] of SOUNDBOX.holes) {
    const [width, depth] = soundboxSection(t);
    // The middle stave lies between the corners at 0.4 π and 0.6 π of the ring.
    const v = SOUNDBOX.board - depth * Math.sin(0.4 * Math.PI) - 0.002;
    const across = width * Math.cos(0.4 * Math.PI) * 0.55;
    const loop: Vec3[] = [];
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * 2 * Math.PI;
      loop.push(soundboxPoint(t + (half * Math.cos(angle)) / length, across * Math.sin(angle), v));
    }
    piece.add(facing(fan(soundboxPoint(t, 0, v), loop), back), colors.harpHole);
  }
}

/**
 * Adds the column (design 4.6): the gilded foot, the fluted shaft, and the gilded crown.
 *
 * @param piece The harp.
 */
function addColumn(piece: PieceBuilder): void {
  const [[bottom, z], [top]] = HARP.column;
  const gold = INSTRUMENT_COLORS.brass;
  const at = transform([0, 0, z]);
  piece.add(lathe(COLUMN.foot, COLUMN.segments), gold, at, 'metal');
  piece.add(lathe(COLUMN.crown, COLUMN.segments), gold, at, 'metal');

  const from = COLUMN.foot.at(-1)?.[1] ?? bottom;
  const to = COLUMN.crown[0]?.[1] ?? top;
  const [ridge, flute] = COLUMN.shaft;
  const ring = (y: number): Vec3[] =>
    Array.from({ length: COLUMN.flutes * 2 }, (_, i): Vec3 => {
      const angle = (i / (COLUMN.flutes * 2)) * 2 * Math.PI;
      const r = i % 2 === 0 ? ridge : flute;
      return [r * Math.sin(angle), y, z + r * Math.cos(angle)];
    });
  piece.add(sweep([ring(from), ring(to)]), INSTRUMENT_COLORS.harpFrame, transform(), 'varnish');
}

/**
 * Adds the neck (design 4.6): the S curve from the crown to the top of the soundbox, with a brass
 * plate on the bottom of each side over the strings.
 *
 * @param piece The harp.
 */
function addNeck(piece: PieceBuilder): void {
  const tangents = neckTangents();
  const heights = neckHeights();
  const thickness = neckRamp(NECK.thickness);
  const rings = HARP.neck.map(([y, z], i): Vec3[] => {
    const [ty, tz] = tangents[i] ?? [0, 1];
    const h = heights[i] ?? 0;
    const tx = thickness[i] ?? 0;
    const at = (x: number, v: number): Vec3 => [x, y + tz * v, z - ty * v];
    return [
      at(tx, -h / 2),
      at(tx, h * 0.2),
      at(tx * 0.55, h / 2),
      at(-tx * 0.55, h / 2),
      at(-tx, h * 0.2),
      at(-tx, -h / 2),
    ];
  });
  piece.add(sweep(rings), INSTRUMENT_COLORS.harpFrame, transform(), 'varnish');

  // The plates cover the points of the neck over the strings.
  const [first, last] = STRINGS.ends;
  const over = HARP.neck.flatMap(([, z], i) => (z > first - 0.05 && z < last + 0.06 ? [i] : []));
  for (const side of [-1, 1]) {
    const edge = (i: number, v: number): Vec3 => {
      const x = side * ((thickness[i] ?? 0) + 0.0015);
      const [y, z] = HARP.neck[i] ?? [0, 0];
      const [ty, tz] = tangents[i] ?? [0, 1];
      const lowest = -(heights[i] ?? 0) / 2 + v;
      return [x, y + tz * lowest, z - ty * lowest];
    };
    const corners: number[] = [];
    for (let k = 0; k + 1 < over.length; k++) {
      const i = over[k] ?? 0;
      const j = over[k + 1] ?? 0;
      const a = edge(i, 0.004);
      const b = edge(j, 0.004);
      const c = edge(j, NECK.plate);
      const d = edge(i, NECK.plate);
      corners.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    piece.add(facing(corners, [side, 0, 0]), INSTRUMENT_COLORS.brass, transform(), 'metal');
  }
}

/**
 * Gives the root and the end of the middle line of a pedal in a notch, in the harp axes. The root
 * is inside the base, and the end moves up or down with the notch.
 *
 * @param pedal The pedal.
 * @param notch The notch. The model shows each pedal in the natural notch.
 * @param scale The scale of the harp of the species (`SpeciesParams.harpScale`).
 * @returns The root and the end.
 */
function harpPedalEnds(
  pedal: HarpPedal,
  notch: PedalNotch = 'natural',
  scale = 1,
): readonly [root: Vec3, end: Vec3] {
  const p = HARP_PEDALS;
  const [x, z] = p.root[pedal];
  const angle = p.heading[pedal] * MathUtils.DEG2RAD;
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  const inset = 0.01;
  return [
    [(x - dx * inset) * scale, p.y * scale, (z - dz * inset) * scale],
    [(x + dx * p.length) * scale, (p.y + p.notch[notch]) * scale, (z + dz * p.length) * scale],
  ];
}

/**
 * Gives the point of a pedal where the hoof of the harpist presses it: on the top of the pedal,
 * near its end, in the harp axes.
 *
 * @param pedal The pedal.
 * @param notch The notch.
 * @param scale The scale of the harp of the species (`SpeciesParams.harpScale`).
 * @returns The point.
 */
export function harpPedalFoot(pedal: HarpPedal, notch: PedalNotch, scale: number): Vec3 {
  const [root, end] = harpPedalEnds(pedal, notch);
  const share = HARP_PEDALS.foot;
  const top = HARP_PEDALS.bar[1] / 2;
  return [
    (root[0] + (end[0] - root[0]) * share) * scale,
    (root[1] + (end[1] - root[1]) * share + top) * scale,
    (root[2] + (end[2] - root[2]) * share) * scale,
  ];
}

/**
 * Adds the base (design 4.6): the bevelled pedestal and the seven brass pedals.
 *
 * @param piece The harp.
 */
function addBase(piece: PieceBuilder): void {
  const { base } = HARP;
  const middle = (base.z[0] + base.z[1]) / 2;
  piece.add(
    plate(BASE_OUTLINE, BASE_LEVELS),
    INSTRUMENT_COLORS.harpFrame,
    transform([0, base.y - base.height / 2, middle]),
    'varnish',
  );

  // Each pedal is one part, in the order of `HARP_PEDALS.order`. A pedal is a bar with no face at
  // its root, which is inside the base: the triangles 6 and 7 of a box are its -y face.
  const [width, depth] = HARP_PEDALS.bar;
  for (const [index, pedal] of HARP_PEDALS.order.entries()) {
    const [root, end] = harpPedalEnds(pedal);
    const along = new Vector3(...end).sub(new Vector3(...root));
    const bar = box(width, along.length(), depth);
    piece.pedal(
      index,
      [...bar.slice(0, 6 * 9), ...bar.slice(8 * 9)],
      INSTRUMENT_COLORS.brass,
      transform(
        toVec3(new Vector3(...root).addScaledVector(along, 0.5)),
        toQuat(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), along.normalize())),
      ),
    );
  }
}

/**
 * Gives the turn of each pedal around its root from the natural notch into the sharp and the flat
 * notch (design 4.6), in the order of `HARP_PEDALS.order`.
 *
 * @param scale The scale of the harp.
 * @returns The turn of each pedal, in the harp axes after the scale.
 */
function pedalTurns(scale: number): PedalTurn[] {
  return HARP_PEDALS.order.map((pedal): PedalTurn => {
    const [root, natural] = harpPedalEnds(pedal, 'natural', scale);
    const along = new Vector3(...natural).sub(new Vector3(...root));
    const toward = (notch: PedalNotch): Vector3 =>
      new Vector3(...harpPedalEnds(pedal, notch, scale)[1]).sub(new Vector3(...root));
    // A turn around the axis along x up moves the end down: the axis is along x up.
    const axis = new Vector3(0, 1, 0).cross(along).normalize();
    const signed = (to: Vector3): number =>
      Math.sign(new Vector3().crossVectors(along, to).dot(axis)) * along.angleTo(to);
    return {
      pivot: root,
      axis: toVec3(axis),
      sharp: signed(toward('sharp')),
      flat: signed(toward('flat')),
    };
  });
}

/**
 * Gives the color and the finish of one string: the red C strings, the dark blue F strings, the
 * wound wire strings of the bass, the gut strings of the middle, and the lighter nylon strings
 * of the treble.
 *
 * @param index The string, from 0 (the bass string) to `HARP.strings - 1`.
 * @returns The color and the finish.
 */
function stringLook(index: number): readonly [Rgb, Finish] {
  const colors = INSTRUMENT_COLORS;
  if (index < STRINGS.wires) {
    return [colors.harpWire, 'metal'];
  }
  if (index % 7 === 0) {
    return [colors.harpC, 'matte'];
  }
  if (index % 7 === 3) {
    return [colors.harpF, 'matte'];
  }
  return [index < STRINGS.nylon ? colors.harpGut : colors.harpNylon, 'matte'];
}

/**
 * Adds the strings (design 4.6), from the bass string near the column to the treble string near
 * the player. Each string is one part, in the order of the strings: a prism of three sides around
 * the vertical line x = 0 at its place along z, from the center strip of the soundboard up into
 * the neck, with {@link STRINGS.rings} rings and open ends. The bass strings are thicker.
 *
 * @param piece The harp.
 * @param scale The scale of the harp.
 * @returns The line of each string, in the harp axes after the scale.
 */
function addStrings(piece: PieceBuilder, scale: number): StringLine[] {
  const bottomLine = neckBottom();
  const [thick, thin] = STRINGS.radius;
  const lines: StringLine[] = [];
  for (let i = 0; i < HARP.strings; i++) {
    const z = stringZ(i);
    const from = boardHeight(z);
    const to = heightOn(bottomLine, z) + 0.004;
    const share = i / (HARP.strings - 1);
    const radius = thick + (thin - thick) * share + (i < STRINGS.wires ? STRINGS.wire : 0);
    const rings = Array.from({ length: STRINGS.rings }, (_, k): Vec3[] => {
      const y = from + ((to - from) * k) / (STRINGS.rings - 1);
      return [0, 1, 2].map((corner): Vec3 => {
        const angle = (corner / 3) * 2 * Math.PI;
        return [radius * Math.sin(angle), y, z + radius * Math.cos(angle)];
      });
    });
    const [color, finish] = stringLook(i);
    piece.string(i, sweep(rings, false), color, finish);
    const [bassSwing, trebleSwing] = STRINGS.swing;
    lines.push({
      bottom: [0, from * scale, z * scale],
      top: [0, to * scale, z * scale],
      radius: radius * scale,
      pluck: ((pluckPoint(i)[1] ?? from) - from) / (to - from),
      swing: bassSwing * (trebleSwing / bassSwing) ** share * scale,
    });
  }
  return lines;
}

/**
 * Builds the concert pedal harp (design 4.6). It stands in front of the player and rests on the
 * right shoulder, at its place of {@link HARP_PLACE}, with its base on the floor. Both hands
 * play the strings, the left hand from the left side of the strings and the right hand from the
 * right side. A species with short arms plays a smaller harp (`SpeciesParams.harpScale`), as a
 * child plays a smaller lever harp: the harp, its strings, and its distance in front of the player
 * shrink toward its base on the floor.
 *
 * @param scale The scale of the harp, as a factor of the sizes of {@link HARP}.
 * @returns The model.
 */
export function buildHarp(scale = 1): InstrumentModel {
  const piece = new PieceBuilder(scale);
  const scaled = (at: Vec3): Vec3 => [at[0] * scale, at[1] * scale, at[2] * scale];

  addBase(piece);
  addColumn(piece);
  addNeck(piece);
  addSoundbox(piece);
  const lines = addStrings(piece, scale);

  const instrument = piece.build(
    'instrument',
    hold(
      'floor',
      [HARP_PLACE.side, 0, 0],
      toQuat(
        new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), HARP_PLACE.turn)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HARP_PLACE.tilt)),
      ),
      scaled([0, HARP_PLACE.lift, -HARP_PLACE.front]),
    ),
  );
  // The bind palms lie at the E3 string for the left hand and at the B5 string for the right hand.
  const bassHand = harpStringPosition(52, scale);
  const trebleHand = harpStringPosition(83, scale);
  return {
    id: 'harp',
    parent: 'root',
    pieces: [instrument],
    grips: {
      palmL: {
        bone: 'instrument',
        at: toVec3(new Vector3(...bassHand).add(new Vector3(-0.03, 0, 0))),
      },
      palmR: {
        bone: 'instrument',
        at: toVec3(new Vector3(...trebleHand).add(new Vector3(0.03, 0, 0))),
      },
      mouth: null,
      chin: null,
    },
    targets: [
      {
        kind: 'strings',
        bone: 'instrument',
        from: harpStringPosition(HARP.keys[0], scale),
        to: harpStringPosition(HARP.keys[1], scale),
        normal: [1, 0, 0],
        keys: HARP.keys,
      },
    ],
    size: pieceSize(instrument),
    strings: {
      lines,
      swing: [Math.sin(STRINGS.swingTilt), 0, Math.cos(STRINGS.swingTilt)],
      cross: STRINGS.swingCross,
    },
    pedalTurns: pedalTurns(scale),
  };
}
