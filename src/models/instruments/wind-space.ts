import { MathUtils, Quaternion, Vector3 } from 'three';
import { transform } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { box, cylinder, lathe } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import type { PieceBuilder } from './piece.ts';

// The space of each wind in the layout (`InstrumentPiece.footprint`, design 4.5, seat geometry):
// the simple model of tubes, boxes, and cones that places the seats. The layout reads it in place
// of the detailed model of `woodwinds.ts` and `brass.ts`, so that the detail does not move the
// seats. With the footprint of the detailed models, the seats of the demos moved up to 7.3 cm.

/** The faces around the axis of a tube of the space. */
const SEGMENTS = 6;

/** The faces around the axis of a bell of the space. */
const BELL_SEGMENTS = 12;

/**
 * Adds a tube through a list of points to the space of a piece.
 *
 * @param piece The piece.
 * @param points The points along the tube.
 * @param radius The radius of the tube.
 */
function pipe(piece: PieceBuilder, points: readonly Vec3[], radius: number): void {
  for (let i = 0; i + 1 < points.length; i++) {
    piece.footprintRod(points[i] ?? [0, 0, 0], points[i + 1] ?? [0, 0, 0], radius, SEGMENTS);
  }
}

/**
 * Adds a solid of revolution along an axis to the space of a piece.
 *
 * @param piece The piece.
 * @param from The point on the axis where the profile height is 0.
 * @param axis The direction of the axis.
 * @param profile The radius at each distance along the axis.
 * @param segments The number of faces around the axis.
 */
function turned(
  piece: PieceBuilder,
  from: Vec3,
  axis: Vec3,
  profile: readonly ProfilePoint[],
  segments: number,
): void {
  const turn = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3(...axis).normalize(),
  );
  piece.footprint(lathe(profile, segments), transform(from, toQuat(turn)));
}

/** The turn of a lathe along +y to a tube along +x. */
const ALONG_X = toQuat(
  new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
);

/**
 * Adds a tube along +x to the space of a piece.
 *
 * @param piece The piece.
 * @param profile The radius at each distance from the origin, as (radius, x).
 */
function tube(piece: PieceBuilder, profile: readonly ProfilePoint[]): void {
  piece.footprint(lathe(profile, SEGMENTS), transform([0, 0, 0], ALONG_X));
}

/**
 * Adds small key plates along the top of a tube to the space of a piece.
 *
 * @param piece The piece.
 * @param from The distance of the first key from the origin.
 * @param to The distance of the last key.
 * @param count The number of keys.
 * @param height The height of the plates above the axis.
 */
function keys(piece: PieceBuilder, from: number, to: number, count: number, height: number): void {
  for (let i = 0; i < count; i++) {
    const x = from + ((to - from) * i) / (count - 1);
    piece.footprint(box(0.018, 0.004, 0.012), transform([x, height, 0]));
  }
}

/**
 * Adds the space of the flute, in the axes of `fluteParts()` of `woodwinds.ts`.
 *
 * @param piece The piece.
 * @param length The length of the flute (`WOODWINDS.flute.length`).
 */
export function fluteSpace(piece: PieceBuilder, length: number): void {
  tube(piece, [
    [0.009, -0.05],
    [0.0095, length - 0.05],
    [0.0095, length - 0.05 + 0.001],
  ]);
  piece.footprint(box(0.03, 0.006, 0.02), transform([0, 0.008, 0]));
  piece.footprint(box(0.012, 0.022, 0.022), transform([-0.05, 0, 0]));
  keys(piece, 0.13, length - 0.09, 9, 0.01);
}

/**
 * Adds the space of the oboe, in the axes of `oboeParts()` of `woodwinds.ts`.
 *
 * @param piece The piece.
 * @param length The length of the oboe (`WOODWINDS.oboe.length`).
 */
export function oboeSpace(piece: PieceBuilder, length: number): void {
  piece.footprint(box(0.03, 0.002, 0.007), transform([0.015, 0, 0]));
  tube(piece, [
    [0.003, 0.03],
    [0.008, 0.04],
    [0.009, length - 0.07],
    [0.013, length - 0.04],
    [0.022, length],
  ]);
  keys(piece, 0.1, length - 0.1, 10, 0.009);
}

/**
 * Adds the space of the clarinet, in the axes of `clarinetParts()` of `woodwinds.ts`.
 *
 * @param piece The piece.
 * @param length The length of the clarinet (`WOODWINDS.clarinet.length`).
 */
export function clarinetSpace(piece: PieceBuilder, length: number): void {
  tube(piece, [
    [0.004, 0],
    [0.011, 0.05],
    [0.011, 0.07],
  ]);
  tube(piece, [
    [0.012, 0.07],
    [0.012, length - 0.08],
    [0.018, length - 0.04],
    [0.032, length],
  ]);
  for (const x of [0.07, 0.13, 0.31, length - 0.08, length - 0.003]) {
    const r = x > length - 0.01 ? 0.033 : 0.014;
    tube(piece, [
      [r, x - 0.006],
      [r, x + 0.006],
    ]);
  }
  keys(piece, 0.16, length - 0.12, 8, 0.011);
}

/**
 * Adds the space of the bassoon, in the axes of `bassoonParts()` of `woodwinds.ts`.
 *
 * @param piece The piece.
 * @param length The length of the bassoon (`WOODWINDS.bassoon.length`).
 * @param reed The tip of the reed in the axes of the drawing (`BASSOON_REED`).
 */
export function bassoonSpace(piece: PieceBuilder, length: number, reed: Vec3): void {
  const at = (p: Vec3): Vec3 => [p[0] - reed[0], p[1] - reed[1], p[2] - reed[2]];
  piece.footprint(
    lathe(
      [
        [0.033, 0.06],
        [0.033, length - 0.08],
        [0.042, length],
      ],
      SEGMENTS,
    ),
    transform(at([0, 0, 0])),
  );
  piece.footprintRod(at([0, 0.06, 0.065]), at([0, 0.62, 0.065]), 0.022, SEGMENTS);
  piece.footprint(box(0.07, 0.12, 0.14), transform(at([0, 0.06, 0.035])));
  piece.footprintRod(at([0, 0.62, 0.065]), at([0.08, 0.74, 0.09]), 0.004, 4);
  piece.footprintRod(at([0.08, 0.74, 0.09]), at([0.16, 0.7, 0.125]), 0.004, 4);
  piece.footprint(box(0.006, 0.002, 0.03), transform(at([0.16, 0.7, 0.14])));
}

/**
 * Adds the space of a mouthpiece: a small cup at the origin that opens to -along.
 *
 * @param piece The piece.
 * @param along The direction from the mouthpiece into the instrument.
 * @param radius The radius of the cup.
 */
function mouthpiece(piece: PieceBuilder, along: Vec3, radius: number): void {
  turned(
    piece,
    [0, 0, 0],
    along,
    [
      [radius, 0],
      [radius * 0.4, radius * 2.5],
      [radius * 0.35, radius * 4],
    ],
    SEGMENTS,
  );
}

/**
 * Adds the space of a bell that opens along an axis.
 *
 * @param piece The piece.
 * @param mouth The middle of the opening of the bell.
 * @param axis The direction in which the bell opens.
 * @param radius The radius of the opening.
 * @param depth The length of the flare.
 */
function bell(piece: PieceBuilder, mouth: Vec3, axis: Vec3, radius: number, depth: number): void {
  const n = new Vector3(...axis).normalize();
  turned(
    piece,
    toVec3(new Vector3(...mouth).addScaledVector(n, -depth)),
    toVec3(n),
    [
      [radius * 0.18, 0],
      [radius * 0.35, depth * 0.6],
      [radius * 0.7, depth * 0.9],
      [radius, depth],
      [radius * 0.9, depth - radius * 0.06],
      [radius * 0.45, depth - radius * 0.6],
      [0, depth - radius * 0.8],
    ],
    BELL_SEGMENTS,
  );
}

/**
 * Adds the space of valve casings: short upright cylinders in a row.
 *
 * @param piece The piece.
 * @param first The middle of the first casing.
 * @param step The offset from one casing to the next.
 * @param count The number of casings.
 * @param radius The radius of a casing.
 * @param height The height of a casing.
 * @param up The direction of the casings.
 */
function valves(
  piece: PieceBuilder,
  first: Vec3,
  step: Vec3,
  count: number,
  radius: number,
  height: number,
  up: Vec3 = [0, 1, 0],
): void {
  const n = new Vector3(...up).normalize();
  const turn = toQuat(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n));
  for (let i = 0; i < count; i++) {
    const base = new Vector3(...first)
      .addScaledVector(new Vector3(...step), i)
      .addScaledVector(n, -height / 2);
    piece.footprint(cylinder(radius, radius, height, SEGMENTS), transform(toVec3(base), turn));
  }
}

/**
 * Adds the space of the trumpet, in the axes of `trumpet()` of `brass.ts`.
 *
 * @param piece The piece.
 * @param length The length of the trumpet (`BRASS.trumpet.length`).
 * @param bellRadius The radius of its bell.
 */
export function trumpetSpace(piece: PieceBuilder, length: number, bellRadius: number): void {
  mouthpiece(piece, [1, 0, 0], 0.009);
  pipe(
    piece,
    [
      [0.035, 0, 0],
      [0.2, 0, 0],
    ],
    0.006,
  );
  valves(piece, [0.15, -0.025, 0], [0.026, 0, 0], 3, 0.009, 0.075);
  pipe(
    piece,
    [
      [0.12, -0.05, 0],
      [0.06, -0.05, 0],
      [0.06, -0.025, 0],
      [0.12, -0.025, 0],
    ],
    0.005,
  );
  pipe(
    piece,
    [
      [0.2, -0.05, 0],
      [length - 0.13, -0.05, 0],
    ],
    0.006,
  );
  bell(piece, [length, -0.05, 0], [1, 0, 0], bellRadius, 0.13);
}

/**
 * Adds the space of the trombone, in the axes of `trombone()` of `brass.ts`: the main piece and
 * the slide piece.
 *
 * @param main The piece of the bell section.
 * @param slide The piece of the slide.
 * @param length The length of the trombone (`BRASS.trombone.length`).
 * @param bellRadius The radius of its bell.
 * @param brace The slide brace in the first position, in the axes of the main piece.
 */
export function tromboneSpace(
  main: PieceBuilder,
  slide: PieceBuilder,
  length: number,
  bellRadius: number,
  brace: Vec3,
): void {
  mouthpiece(main, [1, 0, 0], 0.01);
  const low = -0.07;
  const side = -0.11;
  pipe(
    main,
    [
      [0.04, 0, 0],
      [0.62, 0, 0],
    ],
    0.006,
  );
  pipe(
    main,
    [
      [0.04, low, 0],
      [0.62, low, 0],
    ],
    0.006,
  );
  pipe(
    main,
    [
      [0.08, 0, 0],
      [0.08, low, 0],
      [0.08, low, side],
    ],
    0.005,
  );
  const back = length - 0.7;
  pipe(
    main,
    [
      [0.54, low / 2, side],
      [0.03 - back, low / 2, side],
      [-back, low * 0.75, side],
      [0.03 - back, low, side],
      [0.04, low, side],
      [0.04, low, 0],
    ],
    0.007,
  );
  bell(main, [0.7, low / 2, side], [1, 0, 0], bellRadius, 0.16);
  const local = (p: Vec3): Vec3 => [p[0] - brace[0], p[1] - brace[1], p[2] - brace[2]];
  pipe(slide, [local([0.14, 0, 0]), local([0.68, 0, 0])], 0.009);
  pipe(slide, [local([0.14, low, 0]), local([0.68, low, 0])], 0.009);
  pipe(slide, [local([0.68, 0, 0]), local([0.7, low / 2, 0]), local([0.68, low, 0])], 0.009);
  pipe(slide, [local([0.3, 0, 0]), local([0.3, low, 0])], 0.005);
}

/**
 * Adds the space of the horn, in the axes of `horn()` of `brass.ts`.
 *
 * @param piece The piece.
 * @param coilRadius The radius of the coil (`BRASS.horn.coilRadius`).
 * @param bellRadius The radius of the bell.
 */
export function hornSpace(piece: PieceBuilder, coilRadius: number, bellRadius: number): void {
  const into = new Vector3(0.25, -0.35, -1).normalize();
  mouthpiece(piece, toVec3(into), 0.009);
  const center = new Vector3(0.08, -0.3, -0.1);
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -20 * MathUtils.DEG2RAD);
  const ring = (angle: number, r: number): Vec3 =>
    toVec3(
      new Vector3(r * Math.cos(angle), r * Math.sin(angle), 0).applyQuaternion(lean).add(center),
    );
  const coil: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    coil.push(ring((i / 12) * 2 * Math.PI, coilRadius));
  }
  pipe(piece, coil, 0.011);
  pipe(piece, [toVec3(into.clone().multiplyScalar(0.04)), ring(Math.PI * 0.6, coilRadius)], 0.005);
  valves(
    piece,
    ring(Math.PI * 0.85, coilRadius * 0.55),
    toVec3(new Vector3(0.024, -0.012, 0).applyQuaternion(lean)),
    3,
    0.009,
    0.06,
    toVec3(new Vector3(0, 0, 1).applyQuaternion(lean)),
  );
  const bellAxis = new Vector3(0.75, -0.25, 0.6).normalize();
  const bellStart = ring(-Math.PI * 0.35, coilRadius);
  bell(
    piece,
    toVec3(new Vector3(...bellStart).addScaledVector(bellAxis, 0.2)),
    toVec3(bellAxis),
    bellRadius,
    0.2,
  );
}

/**
 * Adds the space of the tuba, in the axes of `tuba()` of `brass.ts`.
 *
 * @param piece The piece.
 * @param at Gives a point of the drawing of the tuba in the axes of the piece.
 * @param lead The back part of the longer lead pipe (`SpeciesParams.tubaPipe`), in meters.
 * @param height The height of the tuba (`BRASS.tuba.height`).
 * @param bellRadius The radius of its bell.
 */
export function tubaSpace(
  piece: PieceBuilder,
  at: (p: Vec3) => Vec3,
  lead: number,
  height: number,
  bellRadius: number,
): void {
  mouthpiece(piece, [0, 0, -1], 0.012);
  turned(
    piece,
    at([-0.06, 0, 0]),
    [0, 1, 0],
    [
      [0, 0],
      [0.07, 0.03],
      [0.08, 0.45],
      [0.11, height - 0.25],
      [bellRadius * 0.7, height - 0.06],
      [bellRadius, height],
      [bellRadius * 0.9, height - bellRadius * 0.06],
      [bellRadius * 0.45, height - bellRadius * 0.6],
      [0, height - bellRadius * 0.8],
    ],
    BELL_SEGMENTS,
  );
  pipe(piece, [at([0.1, 0.06, 0]), at([0.1, 0.5, 0])], 0.04);
  pipe(piece, [at([-0.06, 0.06, 0]), at([0.1, 0.06, 0])], 0.05);
  valves(piece, at([0.1, 0.42, -0.06]), [0, 0, 0.035], 4, 0.012, 0.11, [0, 1, 0]);
  pipe(piece, [at([0.1, 0.5, 0]), at([0.1, 0.65 - lead / 4, 0.07 - lead]), [0, 0, -0.09]], 0.012);
}
