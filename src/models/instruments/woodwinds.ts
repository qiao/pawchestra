import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import { toQuat } from '../tuples.ts';
import type { Quat, Vec3 } from '../tuples.ts';
import type { Finish, Rgb } from '../mesh.ts';
import { box, lathe } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize } from './piece.ts';
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

/** The faces around the axis of a tube. */
const TUBE_SEGMENTS = 6;

/** The turn of a lathe along +y to a tube along +x. */
const ALONG_X = toQuat(
  new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
);

/**
 * Adds a tube along +x.
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
  piece.add(lathe(profile, TUBE_SEGMENTS), color, transform([0, 0, 0], ALONG_X), finish);
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
 * Calculates the rotation of a tube that points along a direction, with the top of the tube (+y)
 * as near to a second direction as the first permits.
 *
 * @param along The direction of the tube from the mouth.
 * @param up The direction of the top of the tube.
 * @returns The rotation from the piece axes to the model axes.
 */
function pointing(along: Vec3, up: Vec3): Quat {
  const x = new Vector3(...along).normalize();
  const y = new Vector3(...up).projectOnPlane(x).normalize();
  const basis = new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
  return toQuat(new Quaternion().setFromRotationMatrix(basis));
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
 * Adds the parts of the flute: a silver tube with the lip plate, the head cap, and the keys. The
 * origin is at the hole of the lip plate, and the tube runs along +x to the foot. The hole faces
 * +y.
 *
 * @param piece The piece builder.
 */
function fluteParts(piece: PieceBuilder): void {
  const f = WOODWINDS.flute;
  const metal = INSTRUMENT_COLORS.silver;
  tube(
    piece,
    [
      [0.009, -0.05],
      [0.0095, f.length - 0.05],
      [0.0095, f.length - 0.05 + 0.001],
    ],
    metal,
    'metal',
  );
  // The lip plate around the hole, and the crown of the head cap.
  piece.add(box(0.03, 0.006, 0.02), metal, transform([0, 0.008, 0]), 'metal');
  piece.add(box(0.012, 0.022, 0.022), metal, transform([-0.05, 0, 0]), 'metal');
  keys(piece, 0.13, f.length - 0.09, 9, 0.01, metal);
}

/**
 * Adds the parts of the oboe: a thin dark tube with the reed, metal keys, and a small bell. The
 * origin is at the tip of the reed, and the tube runs along +x to the bell.
 *
 * @param piece The piece builder.
 */
function oboeParts(piece: PieceBuilder): void {
  const o = WOODWINDS.oboe;
  const wood = INSTRUMENT_COLORS.oboe;
  piece.add(box(0.03, 0.002, 0.007), wood, transform([0.015, 0, 0]));
  tube(
    piece,
    [
      [0.003, 0.03],
      [0.008, 0.04],
      [0.009, o.length - 0.07],
      [0.013, o.length - 0.04],
      [0.022, o.length],
    ],
    wood,
  );
  keys(piece, 0.1, o.length - 0.1, 10, 0.009, INSTRUMENT_COLORS.silver);
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
