import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import { toQuat } from '../tuples.ts';
import type { Quat, Vec3 } from '../tuples.ts';
import type { Finish, Rgb } from '../mesh.ts';
import { box, lathe, plate } from '../primitives.ts';
import type { OutlinePoint, ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, pointing } from './piece.ts';
import { turned } from './tubing.ts';
import { bassoonSpace, clarinetSpace, fluteSpace, oboeSpace } from './wind-space.ts';
import type { GripTube, InstrumentModel } from './types.ts';

/** The woodwinds of design 4.6. */
export type WoodwindId = 'flute' | 'oboe' | 'clarinet' | 'bassoon';

/**
 * The lengths of the woodwinds in meters, and the places of the palms along the tube (design
 * 4.6). The flute, the oboe, and the clarinet are 0.85 of their real length, as the violin.
 */
export const WOODWINDS = {
  flute: { length: 0.57, palmL: 0.16, palmR: 0.34 },
  oboe: { length: 0.55, palmL: 0.17, palmR: 0.34 },
  clarinet: { length: 0.57, palmL: 0.18, palmR: 0.37 },
  bassoon: { length: 1.15, palmL: 0.55, palmR: 0.22 },
} as const satisfies Readonly<
  Record<WoodwindId, Readonly<Record<'length' | 'palmL' | 'palmR', number>>>
>;

/**
 * The tip of the bassoon reed in the axes of its drawing: the bottom of the boot is at the origin,
 * and the tube runs along +y.
 */
const BASSOON_REED: Vec3 = [0.16, 0.7, 0.155];

/** The faces around the axis of a tube. A face angle of 60° shades as a round tube. */
const TUBE_SEGMENTS = 6;

/** The faces around the axis of a key cup or a thin rod. */
const KEY_SEGMENTS = 5;

/** The faces around the axis of a key rod. */
const ROD_SEGMENTS = 4;

/**
 * Adds a solid of revolution along +x.
 *
 * @param piece The piece.
 * @param profile The radius at each distance from the origin, as (radius, x).
 * @param color The color.
 * @param finish The finish.
 */
function tube(
  piece: PieceBuilder,
  profile: readonly ProfilePoint[],
  color: Rgb,
  finish: Finish = 'matte',
): void {
  turned(piece, [0, 0, 0], [1, 0, 0], profile, TUBE_SEGMENTS, color, finish);
}

/**
 * Adds a band of silver around a tube along +x, as the ring of a tenon or of a bell.
 *
 * @param piece The piece.
 * @param from The distance of the start of the band from the origin.
 * @param to The distance of the end of the band.
 * @param radius The radius of the band.
 */
function band(piece: PieceBuilder, from: number, to: number, radius: number): void {
  tube(
    piece,
    [
      [radius, from],
      [radius, to],
    ],
    INSTRUMENT_COLORS.silver,
    'metal',
  );
}

/**
 * Adds the silver key work along a tube along +x: a cup over each tone hole, and a rod beside
 * the cups, as the axle of the keys of a real woodwind.
 *
 * @param piece The piece.
 * @param cups The distance of each cup from the origin.
 * @param side The unit direction from the axis of the tube to the cups, normal to x.
 * @param radius The radius of the tube under the cups.
 * @param cup The radius of a cup.
 * @param rods The start and the end of each rod along x.
 */
function keyWork(
  piece: PieceBuilder,
  cups: readonly number[],
  side: readonly [y: number, z: number],
  radius: number,
  cup: number,
  rods: readonly (readonly [number, number])[],
): void {
  const [y, z] = side;
  const metal = INSTRUMENT_COLORS.silver;
  for (const x of cups) {
    turned(
      piece,
      [x, y * radius * 0.92, z * radius * 0.92],
      [0, y, z],
      [
        [cup, 0],
        [cup, cup * 0.45],
        [0, cup * 0.6],
      ],
      KEY_SEGMENTS,
      metal,
    );
  }
  // The rod lies beside the cups, turned 55° around the tube from the cups.
  const turn = 55 * MathUtils.DEG2RAD;
  const ry = y * Math.cos(turn) + z * Math.sin(turn);
  const rz = z * Math.cos(turn) - y * Math.sin(turn);
  const out = radius + cup * 0.25;
  for (const [from, to] of rods) {
    piece.rod(
      [from, ry * out, rz * out],
      [to, ry * out, rz * out],
      cup * 0.22,
      ROD_SEGMENTS,
      metal,
      'metal',
    );
  }
}

/**
 * Adds small key plates along the top of a tube.
 *
 * @param piece The piece.
 * @param from The distance of the first key from the origin.
 * @param to The distance of the last key.
 * @param count The number of keys.
 * @param height The height of the plates above the axis.
 * @param color The color of the keys.
 */
function keys(
  piece: PieceBuilder,
  from: number,
  to: number,
  count: number,
  height: number,
  color: Rgb,
): void {
  for (let i = 0; i < count; i++) {
    const x = from + ((to - from) * i) / (count - 1);
    piece.add(box(0.018, 0.004, 0.012), color, transform([x, height, 0]), 'metal');
  }
}

/**
 * Calculates the rotation of a tube that hangs from the mouth to the front: the tube points down
 * and the given angle forward from the vertical. The top of the tube faces the player.
 *
 * @param angle The angle between the tube and the vertical.
 * @returns The rotation.
 */
function hanging(angle: number): Quat {
  return pointing([0, -Math.cos(angle), -Math.sin(angle)], [0, 0, 1]);
}

/**
 * Adds the parts of the flute, as a Boehm flute of silver (`docs/reference/wind-technique.md`
 * 6.2): the head joint with the crown and the lip plate around the embouchure hole, the body
 * joint and the foot joint with a ring at each tenon, and the key cups on their rods. The origin
 * is at the embouchure hole, and the tube runs along +x to the foot. The hole faces +y.
 *
 * @param piece The piece builder.
 */
function fluteParts(piece: PieceBuilder): void {
  const f = WOODWINDS.flute;
  const metal = INSTRUMENT_COLORS.silver;
  const end = f.length - 0.05;
  tube(
    piece,
    [
      [0.0088, -0.045],
      [0.0092, 0.112],
      [0.0104, 0.116],
      [0.0104, 0.128],
      [0.0095, 0.132],
      [0.0095, 0.405],
      [0.0104, 0.409],
      [0.0104, 0.42],
      [0.0095, 0.424],
      [0.0095, end],
    ],
    metal,
    'metal',
  );
  // The crown that closes the head joint, with its round top.
  tube(
    piece,
    [
      [0, -0.064],
      [0.0055, -0.0625],
      [0.0098, -0.058],
      [0.0098, -0.045],
    ],
    metal,
    'metal',
  );
  // The lip plate: a curved oval plate around the embouchure hole, and the dark hole in it.
  piece.add(
    plate(LIP_PLATE, [
      [0.85, 0],
      [1, 0.0012],
      [0.9, 0.0022],
    ]),
    metal,
    transform([0, 0.0082, 0]),
    'metal',
  );
  piece.add(
    plate(EMBOUCHURE_HOLE, [
      [1, 0],
      [0.75, 0.0004],
    ]),
    INSTRUMENT_COLORS.windBore,
    transform([0, 0.0103, 0]),
  );
  keyWork(piece, [0.15, 0.178, 0.205, 0.232, 0.29, 0.318, 0.346], [1, 0], 0.0095, 0.0062, [
    [0.135, 0.4],
  ]);
  keyWork(piece, [0.47], [1, 0], 0.0095, 0.0062, [[0.43, end - 0.005]]);
}

/** The outline of the lip plate of the flute, in the x-z plane: an oval, longer along the tube. */
const LIP_PLATE: readonly OutlinePoint[] = ellipse(0.0135, 0.0105, 8);

/** The outline of the embouchure hole in the lip plate of the flute. */
const EMBOUCHURE_HOLE: readonly OutlinePoint[] = ellipse(0.0052, 0.0042, 6);

/**
 * Gives the corners of an ellipse in the x-z plane, counterclockwise when seen from +y.
 *
 * @param x The half axis on x.
 * @param z The half axis on z.
 * @param count The number of corners.
 * @returns The corners.
 */
function ellipse(x: number, z: number, count: number): OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    out.push([x * Math.cos(angle), -z * Math.sin(angle)]);
  }
  return out;
}

/**
 * Adds the parts of the oboe, as a conservatory oboe of grenadilla
 * (`docs/reference/wind-technique.md` 6.2): the double reed with its thread, the silver ring at
 * the top, the upper and the lower joint with a ring at each tenon, the bell with its rim, and
 * the silver key work on the front. The origin is at the tip of the reed, and the tube runs along
 * +x to the bell.
 *
 * @param piece The piece builder.
 */
function oboeParts(piece: PieceBuilder): void {
  const o = WOODWINDS.oboe;
  const wood = INSTRUMENT_COLORS.oboe;
  // The two blades of cane, and the thread that binds them to the staple. The reed, the thread,
  // and the top ring stay inside the form of the simple model, because a thread that started
  // 0.4 cm nearer the tip put the oboe 0.3 cm deeper into the mouth of the mouse.
  piece.add(box(0.03, 0.0018, 0.0068), INSTRUMENT_COLORS.reed, transform([0.015, 0, 0]));
  tube(
    piece,
    [
      [0.0026, 0.03],
      [0.0032, 0.032],
      [0.0036, 0.04],
    ],
    INSTRUMENT_COLORS.reedThread,
  );
  band(piece, 0.04, 0.046, 0.0068);
  tube(
    piece,
    [
      [0.0064, 0.046],
      [0.0085, 0.2],
      [0.0094, 0.205],
      [0.0094, 0.215],
      [0.0092, 0.22],
      [0.0102, 0.431],
      [0.0112, 0.437],
      [0.0112, 0.447],
      [0.0145, 0.5],
      [0.0185, 0.536],
      [0.021, 0.548],
      [0.0205, o.length],
      [0.012, o.length - 0.02],
    ],
    wood,
    'lacquer',
  );
  band(piece, 0.204, 0.212, 0.0098);
  band(piece, 0.436, 0.443, 0.0116);
  keyWork(piece, [0.12, 0.15, 0.18, 0.27, 0.3, 0.33], [-1, 0], 0.009, 0.0055, [
    [0.08, 0.2],
    [0.23, 0.42],
  ]);
}

/**
 * Adds the parts of the clarinet: a black tube with the black mouthpiece, silver rings at the
 * joints, silver keys, and a bell, as the clarinet of `mockup.png`. The origin is at the tip of
 * the mouthpiece, and the tube runs along +x to the bell.
 *
 * @param piece The piece builder.
 */
function clarinetParts(piece: PieceBuilder): void {
  const c = WOODWINDS.clarinet;
  const body = INSTRUMENT_COLORS.clarinet;
  const metal = INSTRUMENT_COLORS.silver;
  tube(
    piece,
    [
      [0.004, 0],
      [0.011, 0.05],
      [0.011, 0.07],
    ],
    body,
    'lacquer',
  );
  tube(
    piece,
    [
      [0.012, 0.07],
      [0.012, c.length - 0.08],
      [0.018, c.length - 0.04],
      [0.032, c.length],
    ],
    body,
    'lacquer',
  );
  // Silver rings at the barrel, the middle tenon, and the bell.
  for (const x of [0.07, 0.13, 0.31, c.length - 0.08, c.length - 0.003]) {
    const r = x > c.length - 0.01 ? 0.033 : 0.014;
    tube(
      piece,
      [
        [r, x - 0.006],
        [r, x + 0.006],
      ],
      metal,
      'metal',
    );
  }
  keys(piece, 0.16, c.length - 0.12, 8, 0.011, metal);
}

/**
 * Adds the parts of the bassoon: a tall wooden tube with the boot, the wing joint, and the metal
 * bocal (design 4.6). The origin is at the tip of the reed. The tube runs along +y from the boot
 * to the bell. The bocal comes from the wing joint on the side of the player (+z) to the reed at
 * the right (+x) of the tube, so that the tube passes the left side of the head.
 *
 * @param piece The piece builder.
 */
function bassoonParts(piece: PieceBuilder): void {
  const b = WOODWINDS.bassoon;
  const wood = INSTRUMENT_COLORS.bassoon;
  const metal = INSTRUMENT_COLORS.silver;
  // The axes of the drawing: the bottom of the boot is at y = 0, and the reed at `BASSOON_REED`.
  const reed = BASSOON_REED;
  const at = (p: Vec3): Vec3 => [p[0] - reed[0], p[1] - reed[1], p[2] - reed[2]];
  piece.add(
    lathe(
      [
        [0.033, 0.06],
        [0.033, b.length - 0.08],
        [0.042, b.length],
      ],
      TUBE_SEGMENTS,
    ),
    wood,
    transform(at([0, 0, 0])),
  );
  piece.rod(at([0, 0.06, 0.065]), at([0, 0.62, 0.065]), 0.022, TUBE_SEGMENTS, wood);
  piece.add(box(0.07, 0.12, 0.14), wood, transform(at([0, 0.06, 0.035])));
  // The bocal rises from the wing joint to its top, then comes down to the reed. The tube of a
  // player leans, so the end of the bocal brings the reed to the mouth at a nearly level angle,
  // as on a real bassoon (`docs/reference/wind-technique.md` 3): 1.7° above the level with the
  // turn of the beaver (`BEAVER_PLAY` of `pose/winds.ts`). With the top at 0.78, the end pointed
  // 15.7° down into the mouth.
  piece.rod(at([0, 0.62, 0.065]), at([0.08, 0.74, 0.09]), 0.004, 4, metal, 'metal');
  piece.rod(at([0.08, 0.74, 0.09]), at([0.16, 0.7, 0.125]), 0.004, 4, metal, 'metal');
  piece.add(box(0.006, 0.002, 0.03), wood, transform(at([0.16, 0.7, 0.14])));
}

/**
 * Gives the tube that each palm of the bassoon closes around (`InstrumentGrips.tubeL`): the wing
 * joint and the long joint together, along the bassoon, at the middle between their axes. The reed
 * is far off this line at the end of the bocal, so the line of a woodwind through the mouthpiece
 * does not fit the bassoon.
 *
 * @param scale The scale of the bassoon.
 * @returns The tubes of the left and the right palm, from the boot toward the bell.
 */
function bassoonTubes(scale: number): Record<'tubeL' | 'tubeR', GripTube> {
  const reed = BASSOON_REED;
  const at = (y: number): Vec3 => [
    -reed[0] * scale,
    (y - reed[1]) * scale,
    (0.035 - reed[2]) * scale,
  ];
  const line: GripTube = { bone: 'instrument', from: at(0.1), to: at(0.9) };
  return { tubeL: line, tubeR: line };
}

/**
 * The rotation of each woodwind in the bind pose (design 4.6). The flute points to the right,
 * 10° to the front and 8° down. The oboe and the clarinet hang from the mouth to the front: the
 * angle of design 4.6 is the angle from the vertical, as on the clarinets of the reference image.
 * The bassoon leans 35° to the left across the body, with the boot at the right hip.
 *
 * @param id The woodwind.
 * @returns The rotation from the piece axes to the model axes.
 */
function woodwindRotation(id: WoodwindId): Quat {
  switch (id) {
    case 'flute':
      return pointing(
        [
          Math.cos(8 * MathUtils.DEG2RAD) * Math.cos(10 * MathUtils.DEG2RAD),
          -Math.sin(8 * MathUtils.DEG2RAD),
          -Math.sin(10 * MathUtils.DEG2RAD),
        ],
        [0, 1, 0],
      );
    case 'oboe':
      return hanging(30 * MathUtils.DEG2RAD);
    case 'clarinet':
      return hanging(25 * MathUtils.DEG2RAD);
    case 'bassoon':
      return toQuat(
        new Quaternion()
          .setFromAxisAngle(new Vector3(0, 0, 1), 35 * MathUtils.DEG2RAD)
          .multiply(
            new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -8 * MathUtils.DEG2RAD),
          ),
      );
    default: {
      const unhandled: never = id;
      throw new Error(`The woodwind "${String(unhandled)}" is not known.`);
    }
  }
}

/** The function that adds the parts of each woodwind. */
const WOODWIND_PARTS = {
  flute: fluteParts,
  oboe: oboeParts,
  clarinet: clarinetParts,
  bassoon: bassoonParts,
} as const satisfies Readonly<Record<WoodwindId, (piece: PieceBuilder) => void>>;

/**
 * The function that adds the space of each woodwind in the layout (`InstrumentPiece.footprint`):
 * the simple model of `wind-space.ts`, so that the detail of the model does not move the seats.
 */
const WOODWIND_SPACE = {
  flute: (piece) => fluteSpace(piece, WOODWINDS.flute.length),
  oboe: (piece) => oboeSpace(piece, WOODWINDS.oboe.length),
  clarinet: (piece) => clarinetSpace(piece, WOODWINDS.clarinet.length),
  bassoon: (piece) => bassoonSpace(piece, WOODWINDS.bassoon.length, BASSOON_REED),
} as const satisfies Readonly<Record<WoodwindId, (piece: PieceBuilder) => void>>;

/**
 * Builds a woodwind (design 4.6). The origin of the piece is the point at the mouth, and the
 * instrument bone hangs on the chest (4.7). A species with short arms plays a smaller woodwind
 * (`SpeciesParams.fluteScale`, `oboeScale`, `clarinetScale`, `bassoonScale`), as a child plays a
 * fractional violin.
 * The instrument and its grips shrink toward the mouthpiece, so the mouthpiece stays at the mouth.
 *
 * @param id The woodwind.
 * @param scale The scale of the instrument, as a factor of its size in {@link WOODWINDS}.
 * @returns The model.
 */
export function buildWoodwind(id: WoodwindId, scale = 1): InstrumentModel {
  const w = WOODWINDS[id];
  const piece = new PieceBuilder(scale);
  WOODWIND_PARTS[id](piece);
  WOODWIND_SPACE[id](piece);
  const instrument = piece.build('instrument', hold('mouth', [0, 0, 0], woodwindRotation(id)));
  // The palms hold the tube from below, on the side away from the keys. The bassoon tube runs
  // along +y, and the palms hold its wing joint from the side of the player.
  const palm = (along: number): Vec3 => {
    const at: Vec3 =
      id === 'bassoon'
        ? [-BASSOON_REED[0], along - BASSOON_REED[1], 0.065 + 0.03 - BASSOON_REED[2]]
        : [along, -0.025, 0];
    return [at[0] * scale, at[1] * scale, at[2] * scale];
  };
  const grips = {
    palmL: { bone: 'instrument', at: palm(w.palmL) },
    palmR: { bone: 'instrument', at: palm(w.palmR) },
    mouth: { bone: 'instrument', at: [0, 0, 0] },
    chin: null,
  } as const;
  return {
    id,
    parent: 'chest',
    pieces: [instrument],
    grips: id === 'bassoon' ? { ...grips, ...bassoonTubes(scale) } : grips,
    targets: [],
    size: pieceSize(instrument),
  };
}
