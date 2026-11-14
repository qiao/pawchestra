import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import type { Rgb } from '../mesh.ts';
import { IDENTITY, toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { latheBand } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, pointing } from './piece.ts';
import { arc, rounded, tubeAlong, turned } from './tubing.ts';
import { hornSpace, tromboneSpace, trumpetSpace, tubaSpace } from './wind-space.ts';
import type { GripTube, InstrumentModel, InstrumentPiece, PlayTarget } from './types.ts';

/** The brass instruments of design 4.6. */
type BrassId = 'horn' | 'trumpet' | 'trombone' | 'tuba';

/**
 * The sizes of the brass instruments in meters (design 4.6). The horn, the trumpet, and the
 * trombone are 0.85 of their real size, as the violin. The tuba is 0.95 m tall, and it stands
 * against the body of the standing rhino with a longer lead pipe (`SpeciesParams.tubaPipe`).
 */
export const BRASS = {
  horn: { coilRadius: 0.13, bellRadius: 0.13 },
  trumpet: { length: 0.41, bellRadius: 0.052 },
  /** `travel` is the move of the slide from the first position to the seventh. */
  trombone: { length: 0.95, bellRadius: 0.09, travel: 0.55 },
  tuba: { height: 0.95, bellRadius: 0.21 },
} as const;

/**
 * The lean of the upper bell branch of the tuba out to the left. `bend` is the height of the bend
 * above the bottom bow, in meters, above the grip of the left paw, and `angle` is the lean from the
 * vertical, in degrees. A straight branch put the inner rim of the bell into the left cheek and the
 * left eye of the rhino. A turn of the whole tuba moved the left grip out of the reach of the left
 * arm.
 */
const TUBA_BELL_LEAN = { bend: 0.55, angle: 15 } as const;

/**
 * The length of the bell section of the trombone behind the mouthpiece, in meters: the tuning
 * slide ends beside the cheek. The big head of the panda puts its cheeks beside the mouthpiece, so
 * with the slide toward the audience, the tuning slide of a real trombone, 0.25 m back over the
 * left shoulder, went 11 cm to 14 cm into the head, and at rest it stood in front of the eye. The
 * space of the layout keeps the real length (`BRASS.trombone.length`), so that no seat moves.
 */
const TROMBONE_BACK = 0.08;

/**
 * The distance of the hand brace of the trombone from the rim of the mouthpiece, in meters: the
 * brace between the inner slide tubes and the brace from them to the bell section, which the left
 * hand holds. A real left hand holds the trombone at these braces, a hand width in front of the
 * mouth (`docs/reference/wind-technique.md` 1.1). At 0.08 m, the braces lay at the end of the
 * mouthpiece shank, and the left paw of the panda on them lay against the chin and hid the lips.
 */
const TROMBONE_HAND_BRACE = 0.15;

/**
 * The distance of the open ends of the outer slide of the trombone from the rim of the mouthpiece
 * in the first position, in meters. The ends stay in front of the hand brace
 * ({@link TROMBONE_HAND_BRACE}), as on a real trombone, so that the brace does not go through the
 * outer slide tubes.
 */
const TROMBONE_SLIDE_END = 0.18;

/**
 * The distance from the axis of the bow of the tuning slide of the trombone, at its back, to the
 * axis of the counterweight, in meters. The counterweight (radius 11 mm) covers the outer half of
 * the tube (radius 6.8 mm), so that its shaded lower side lies in the tube, and it reads as
 * attached from each side. With 14.8 mm, it touched the bow, but from 30° to 60° beside the
 * player its shaded side read as a gap. At 32 mm, at the height of the upper leg, it floated about
 * 2 cm off the bow.
 */
const COUNTERWEIGHT_OFF = 0.0095;

/** The lacquered brass of the tubes and the bells. */
const METAL = INSTRUMENT_COLORS.brass;

/**
 * The nickel silver of the trim: the mouthpieces, the ferrules, the valve caps, and the slide
 * tubes, as on a real instrument.
 */
const TRIM = INSTRUMENT_COLORS.silver;

/** The faces around the axis of a tube. A face angle of 60° shades as a round tube. */
const TUBE_SEGMENTS = 6;

/** The faces around the axis of a thin rod, such as a brace or a lever. */
const ROD_SEGMENTS = 4;

/** The faces around the axis of the bell of the horn. */
const BELL_SEGMENTS = 16;

/** The faces around the axis of the bell branch of the tuba, which is a long cone. */
const TUBA_SEGMENTS = 14;

/** The faces around the axis of a bell of the trumpet or the trombone. */
const SMALL_BELL_SEGMENTS = 12;

/**
 * Gives the inside of an open bell: the profile from the rim back into the throat, which a lathe
 * adds after the outside of the bell. Its faces point into the bell.
 *
 * @param radius The radius of the opening.
 * @param depth The height of the rim in the profile.
 * @returns The profile points after the rim.
 */
function openBell(radius: number, depth: number): ProfilePoint[] {
  return [
    [radius * 0.85, depth - radius * 0.1],
    [0, depth - radius * 0.8],
  ];
}

/**
 * Adds a mouthpiece of nickel silver: the rim at the origin, the cup, and the shank, which goes
 * into the receiver of the lead pipe along `along`.
 *
 * @param piece The piece.
 * @param along The direction from the mouthpiece into the instrument.
 * @param rim The outer radius of the rim.
 * @param length The length from the rim to the end of the shank.
 */
function mouthpiece(piece: PieceBuilder, along: Vec3, rim: number, length: number): void {
  turned(
    piece,
    [0, 0, 0],
    along,
    [
      [0, rim * 0.6],
      [rim * 0.75, 0],
      [rim, rim * 0.25],
      [rim * 0.5, rim * 1.6],
      [rim * 0.4, length * 0.6],
      [rim * 0.5, length],
    ],
    TUBE_SEGMENTS,
    TRIM,
  );
}

/**
 * One step of the flare of a bell: the share of the widening from the throat to the rim, and the
 * share of the length of the flare at which the bell has it.
 */
type BellStep = readonly [widening: number, length: number];

/**
 * The flare of the bell of the trumpet and the trombone ({@link bell}). The last tenth of the
 * flare keeps the width of the simple model.
 */
const BELL_FLARE: readonly BellStep[] = [
  [0, 0],
  [0.15, 0.5],
  [0.35, 0.75],
  [0.66, 0.9],
  [1, 1],
];

/**
 * Adds a bell that opens along an axis: a flare that widens more and more toward the rim, as the
 * bell of a real brass instrument, with the lit inside of the flare.
 *
 * @param piece The piece.
 * @param mouth The middle of the opening of the bell.
 * @param axis The direction in which the bell opens.
 * @param radius The radius of the opening.
 * @param depth The length of the flare.
 * @param throat The radius at the start of the flare.
 * @param segments The number of faces around the axis.
 * @param flare The steps of the flare from the throat to the rim. {@link BELL_FLARE} by default.
 * @returns The target at the middle of the opening.
 */
function bell(
  piece: PieceBuilder,
  mouth: Vec3,
  axis: Vec3,
  radius: number,
  depth: number,
  throat: number,
  segments: number,
  flare: readonly BellStep[] = BELL_FLARE,
): PlayTarget {
  const n = new Vector3(...axis).normalize();
  const normal = toVec3(n);
  const spread = radius - throat;
  turned(
    piece,
    toVec3(new Vector3(...mouth).addScaledVector(n, -depth)),
    normal,
    [
      ...flare.map(([widening, length]): ProfilePoint => [
        throat + spread * widening,
        depth * length,
      ]),
      // The rim turns back into the bell, so that the opening shows the lit inside of the
      // flare, as the bells of the polished images.
      ...openBell(radius, depth),
    ],
    segments,
    METAL,
  );
  return { kind: 'bell', bone: 'instrument', from: mouth, to: mouth, normal, keys: null };
}

/**
 * Adds a piston valve that stands along y: the brass casing with its caps of nickel silver, the
 * stem, and the finger button with a pearl top, as on a trumpet or a tuba.
 *
 * @param piece The piece.
 * @param at The middle of the top of the casing.
 * @param radius The radius of the casing.
 * @param height The height of the casing.
 * @param stem The height of the button above the casing.
 */
function piston(piece: PieceBuilder, at: Vec3, radius: number, height: number, stem: number): void {
  const [x, y, z] = at;
  // The bottom cap and the top cap are nickel silver, and the casing between them is brass. The
  // bands share their rings, so the valve is one closed solid.
  const bands: readonly (readonly [readonly ProfilePoint[], Rgb])[] = [
    [
      [
        [0, -radius * 0.5],
        [radius * 0.6, -radius * 0.5],
        [radius, 0],
      ],
      TRIM,
    ],
    [
      [
        [radius, 0],
        [radius * 1.05, height],
      ],
      METAL,
    ],
    [
      [
        [radius * 1.05, height],
        [radius * 0.3, height],
        [0, height],
      ],
      TRIM,
    ],
  ];
  for (const [profile, color] of bands) {
    piece.add(latheBand(profile, TUBE_SEGMENTS), color, transform([x, y - height, z]), 'metal');
  }
  piece.rod([x, y, z], [x, y + stem * 0.6, z], radius * 0.22, ROD_SEGMENTS, TRIM, 'metal');
  turned(
    piece,
    [x, y + stem * 0.6, z],
    [0, 1, 0],
    [
      [radius * 0.7, 0],
      [radius * 0.7, stem * 0.32],
      [0, stem * 0.4],
    ],
    TUBE_SEGMENTS,
    INSTRUMENT_COLORS.pearl,
    'lacquer',
  );
}

/**
 * Adds a short band of nickel silver around a tube, as a ferrule at the end of a slide tube.
 *
 * @param piece The piece.
 * @param from The middle of the start of the band.
 * @param to The middle of the end of the band.
 * @param radius The radius of the band.
 */
function ferrule(piece: PieceBuilder, from: Vec3, to: Vec3, radius: number): void {
  piece.rod(from, to, radius, TUBE_SEGMENTS, TRIM, 'metal');
}

/** The parts and the play data of one brass instrument. */
interface BrassBuild {
  readonly pieces: readonly InstrumentPiece[];
  readonly palmL: Vec3;
  /** The right palm is on the slide for the trombone, and on the instrument for the others. */
  readonly palmR: Vec3;
  /** The tube that each palm closes around (`InstrumentGrips.tubeL`), or none. */
  readonly tubes: Readonly<Partial<Record<'tubeL' | 'tubeR', GripTube>>>;
  readonly targets: readonly PlayTarget[];
}

/**
 * The distance of the right palm of the trumpet to the right of the axes of the valves, in meters
 * at the size 1 ({@link trumpet}). With the palm straight above the valves, the paw of the monkey
 * reached 2.7 cm past them to the left, onto the left paw.
 */
const VALVES_TO_RIGHT_PALM = 0.045;

/**
 * The trumpet at the size 1, in meters, from the mouthpiece along +x (design 4.6), as a Bach
 * Stradivarius or a Yamaha YTR-8335 (`docs/reference/wind-technique.md` 6.1). The valves stand
 * at `valves` along x, and their tops are at `valveTop`. The lead pipe passes the valves at
 * their left (`leadSide`), and the bell pipe at their right (`bellSide`), at the height of the
 * valve tops (`bellHeight`). The main tuning slide turns down at `slideEnd` in front of the
 * valves, and the bell bow turns at `bowEnd` behind them. `low` is the height of the lower tubes.
 */
const TRUMPET = {
  valves: [0.15, 0.176, 0.202],
  valveRadius: 0.009,
  valveTop: 0.0125,
  valveBottom: -0.0625,
  leadSide: -0.0155,
  bellSide: 0.0145,
  bellHeight: 0.013,
  bellStart: 0.26,
  slideEnd: 0.32,
  bowEnd: 0.035,
  low: -0.047,
} as const;

/**
 * Builds the trumpet. The mouthpiece is at the origin, and the trumpet runs along +x to the bell.
 * The valves stand up (+y), and the player holds it horizontal and forward. A species with short
 * arms plays a smaller trumpet (`SpeciesParams.trumpetScale`), as a child plays a fractional
 * violin. The trumpet, its grips, and its bell target shrink toward the mouthpiece, so the
 * mouthpiece stays at the mouth. The space of the layout keeps the size of the trumpet of the app.
 *
 * The parts follow a real trumpet ({@link TRUMPET}): the lead pipe from the mouthpiece to the
 * main tuning slide in front of the valves, the return into the third valve, the bell bow
 * behind the valves, and the bell pipe over the lead pipe to the bell. The first valve slide has
 * a saddle for the left thumb, and the third valve slide a ring for the left ring finger.
 *
 * The left palm holds the valve casings from the left, below the middle of their height, and its
 * fingers close around the upright casings, as the left hand of a real player wraps the casings
 * and holds the weight (`docs/reference/wind-technique.md` 2.1). The right palm lies above the
 * valve tops and 3.6 cm to their right at the size 0.8, and faces down, so that the right fingers
 * reach to the left over the valves and arch down onto them. With both palms at the sides of the
 * casings, the two paws of the monkey press together in front of the mouth like praying hands.
 *
 * @param scale The scale of the trumpet, as a factor of its size in {@link BRASS}.
 * @returns The parts and the play data.
 */
function trumpet(scale: number): BrassBuild {
  const t = BRASS.trumpet;
  const v = TRUMPET;
  // The footprint keeps the size of the trumpet of the app, so that no seat moves.
  const piece = new PieceBuilder(scale, 1);
  const scaled = (at: Vec3): Vec3 => [at[0] * scale, at[1] * scale, at[2] * scale];
  const [first, middle, third] = v.valves;
  mouthpiece(piece, [1, 0, 0], 0.0095, 0.07);
  // The lead pipe, the main tuning slide in front of the valves, and the return into the third
  // valve, as one bent tube.
  tubeAlong(
    piece,
    rounded(
      [
        [0.06, 0, 0],
        [0.1, 0, 0],
        [0.135, 0, v.leadSide],
        [v.slideEnd, 0, v.leadSide],
        [v.slideEnd, v.low, v.leadSide / 2],
        [third, v.low, 0],
      ],
      0.02,
      2,
    ),
    [0.0045, 0.0048, 0.005, 0.0052, 0.0054, 0.0055, 0.0055, 0.0056],
    TUBE_SEGMENTS,
    METAL,
  );
  // The bell section: from the first valve back to the bell bow, up, and forward over the lead
  // pipe to the bell.
  tubeAlong(
    piece,
    rounded(
      [
        [first, v.low, 0],
        [first - 0.03, v.low, v.bellSide],
        [v.bowEnd, v.low, v.bellSide],
        [v.bowEnd, v.bellHeight, v.bellSide],
        [third + 0.02, v.bellHeight, v.bellSide],
        [v.bellStart, v.bellHeight, 0],
      ],
      0.028,
      2,
    ),
    [0.0052],
    TUBE_SEGMENTS,
    METAL,
  );
  const bellTarget = bell(
    piece,
    [t.length, v.bellHeight, 0],
    [1, 0, 0],
    t.bellRadius,
    t.length - v.bellStart,
    0.0056,
    SMALL_BELL_SEGMENTS,
  );
  for (const x of v.valves) {
    piston(piece, [x, v.valveTop, 0], v.valveRadius, v.valveTop - v.valveBottom, 0.016);
  }
  // The first valve slide goes back with the saddle of the left thumb on its bend, and the third
  // valve slide goes forward with the ring of the left ring finger.
  const slide = -0.028;
  tubeAlong(
    piece,
    rounded(
      [
        [first, slide, -0.004],
        [first - 0.045, slide, -0.004],
        [first - 0.045, slide - 0.012, -0.004],
        [first, slide - 0.012, -0.004],
      ],
      0.006,
      1,
    ),
    [0.0042],
    TUBE_SEGMENTS,
    METAL,
  );
  piece.bar(
    [first - 0.042, slide - 0.018, -0.004],
    [first - 0.042, slide - 0.03, -0.004],
    0.004,
    0.003,
    TRIM,
    'metal',
  );
  tubeAlong(
    piece,
    rounded(
      [
        [third, slide, -0.004],
        [third + 0.055, slide, -0.004],
        [third + 0.055, slide - 0.012, -0.004],
        [third, slide - 0.012, -0.004],
      ],
      0.006,
      1,
    ),
    [0.0042],
    TUBE_SEGMENTS,
    METAL,
  );
  tubeAlong(
    piece,
    arc([third + 0.04, slide + 0.004, -0.012], [1, 0, 0], [0, 1, 0], 0.006, 0, 2 * Math.PI, 5),
    [0.0012],
    ROD_SEGMENTS,
    TRIM,
  );
  // A brace from the lead pipe to the bell pipe in front of the valves.
  piece.rod(
    [0.235, 0, v.leadSide],
    [0.235, v.bellHeight, v.bellSide / 2],
    0.0018,
    ROD_SEGMENTS,
    METAL,
    'metal',
  );
  trumpetSpace(piece, t.length, t.bellRadius);
  const bellMouth = scaled(bellTarget.from);
  return {
    pieces: [
      piece.build(
        'instrument',
        hold('mouth', [0, 0, 0], pointing([0, -Math.sin(5 * MathUtils.DEG2RAD), -1], [0, 1, 0])),
      ),
    ],
    palmL: scaled([middle, -0.07, -0.038]),
    palmR: scaled([middle, 0.045, VALVES_TO_RIGHT_PALM]),
    tubes: {
      // The left fingers close around the upright middle casing.
      tubeL: {
        bone: 'instrument',
        from: scaled([middle, v.valveBottom, 0]),
        to: scaled([middle, v.valveTop, 0]),
      },
      // The right palm faces down onto the line of the valve tops under it, so the line lies to
      // the right of the valves by the same distance as the palm.
      tubeR: {
        bone: 'instrument',
        from: scaled([first, v.valveTop, VALVES_TO_RIGHT_PALM]),
        to: scaled([third, v.valveTop, VALVES_TO_RIGHT_PALM]),
      },
    },
    targets: [{ ...bellTarget, from: bellMouth, to: bellMouth }],
  };
}

/**
 * Builds the trombone with its slide, as a Bach 42 or a Yamaha YSL-891Z
 * (`docs/reference/wind-technique.md` 6.1). The mouthpiece is at the origin, and the slide runs
 * along +x. The two slide tubes lie one above the other. The bell section lies at the left of the
 * slide (-z), and its short tuning slide ends beside the cheek ({@link TROMBONE_BACK}), with a
 * counterweight on its bow.
 *
 * The slide is a second piece on the `slide` bone. Its origin is the slide brace in the first
 * position, and it moves along +x by `travel` to the seventh position.
 *
 * A species with short arms plays a smaller trombone (`SpeciesParams.tromboneScale`). The
 * trombone, its grips, and its slide travel shrink toward the mouthpiece, so the mouthpiece stays
 * at the mouth, and the slide brace comes nearer to the right shoulder.
 *
 * @param scale The scale of the trombone, as a factor of its size in {@link BRASS}.
 * @returns The parts and the play data.
 */
function trombone(scale: number): BrassBuild {
  const t = BRASS.trombone;
  // The footprint keeps the size of the trombone of the app, so that no seat moves.
  const main = new PieceBuilder(scale, 1);
  const scaled = (at: Vec3): Vec3 => [at[0] * scale, at[1] * scale, at[2] * scale];
  mouthpiece(main, [1, 0, 0], 0.0115, 0.085);
  const low = -0.07;
  const side = -0.11;
  // The inner slide tubes of nickel silver, with the stockings at their ends, and the brace near
  // the mouthpiece that the left hand holds.
  for (const y of [0, low]) {
    main.rod([0.04, y, 0], [0.62, y, 0], 0.0058, TUBE_SEGMENTS, TRIM, 'metal');
    ferrule(main, [0.04, y, 0], [0.12, y, 0], 0.0072);
  }
  main.rod(
    [TROMBONE_HAND_BRACE, 0, 0],
    [TROMBONE_HAND_BRACE, low, 0],
    0.0042,
    TUBE_SEGMENTS,
    TRIM,
    'metal',
  );
  main.rod(
    [TROMBONE_HAND_BRACE, low / 2, 0],
    [TROMBONE_HAND_BRACE, low / 2, side],
    0.0038,
    TUBE_SEGMENTS,
    TRIM,
    'metal',
  );
  // The bell section: the bell pipe from the bell back to the tuning slide beside the cheek,
  // and the return to the lower inner slide tube. The bell pipe widens toward the bell.
  const back = TROMBONE_BACK;
  const bellStart = 0.42;
  tubeAlong(
    main,
    rounded(
      [
        [bellStart, low / 2, side],
        [-back, low / 2, side],
        [-back, low - 0.006, side],
        [0.04, low - 0.006, side],
        [0.04, low, 0],
      ],
      0.022,
      3,
    ),
    [0.0105, 0.0075, 0.0068, 0.0068, 0.0068, 0.0068, 0.0068, 0.0068, 0.0068, 0.0068, 0.0068],
    TUBE_SEGMENTS,
    METAL,
  );
  // The tuning slide: two ferrules on its legs and the counterweight on its bow. The bow is
  // farthest back at the middle between its legs, at x = -back, and the counterweight lies on its
  // outer side there, over the outer half of the tube.
  for (const y of [low / 2, low - 0.006]) {
    ferrule(main, [0.03 - back, y, side], [0.08 - back, y, side], 0.0085);
  }
  turned(
    main,
    [-back - COUNTERWEIGHT_OFF, (low / 2 + low - 0.006) / 2, side],
    [0, 0, -1],
    [
      [0.009, -0.015],
      [0.011, -0.012],
      [0.011, 0.012],
      [0.009, 0.015],
    ],
    TUBE_SEGMENTS,
    TRIM,
  );
  // A brace between the bell pipe and the return, and one to the slide in front of the brace.
  main.rod([0.2, low / 2, side], [0.2, low - 0.006, side], 0.0025, ROD_SEGMENTS, TRIM, 'metal');
  const bellTarget = bell(
    main,
    [0.7, low / 2, side],
    [1, 0, 0],
    t.bellRadius,
    0.7 - bellStart,
    0.0105,
    SMALL_BELL_SEGMENTS,
  );

  // The outer slide: the two tubes and the bow at the end as one bent tube, a ferrule at the
  // open end of each tube, the brace, and the rubber bumper on the bow.
  const brace: Vec3 = [0.3, low / 2, 0];
  const slide = new PieceBuilder(scale, 1);
  const local = (p: Vec3): Vec3 => [p[0] - brace[0], p[1] - brace[1], p[2] - brace[2]];
  tubeAlong(
    slide,
    rounded(
      [
        local([TROMBONE_SLIDE_END, 0, 0]),
        local([0.7, 0, 0]),
        local([0.7, low, 0]),
        local([TROMBONE_SLIDE_END, low, 0]),
      ],
      0.035,
      4,
    ),
    [0.0088],
    TUBE_SEGMENTS,
    METAL,
  );
  for (const y of [0, low]) {
    ferrule(
      slide,
      local([TROMBONE_SLIDE_END, y, 0]),
      local([TROMBONE_SLIDE_END + 0.025, y, 0]),
      0.0102,
    );
  }
  slide.rod(local([0.3, 0, 0]), local([0.3, low, 0]), 0.0045, TUBE_SEGMENTS, TRIM, 'metal');
  slide.rod(
    local([0.7, low / 2, 0]),
    local([0.718, low / 2, 0]),
    0.006,
    TUBE_SEGMENTS,
    INSTRUMENT_COLORS.hardware,
  );

  tromboneSpace(main, slide, t.length, t.bellRadius, brace);

  const rotation = pointing(
    [0, -Math.sin(15 * MathUtils.DEG2RAD), -Math.cos(15 * MathUtils.DEG2RAD)],
    [0, 1, 0],
  );
  return {
    pieces: [
      main.build('instrument', hold('mouth', [0, 0, 0], rotation)),
      slide.build('slide', hold('instrument', [0, 0, 0], IDENTITY, scaled(brace))),
    ],
    palmL: scaled([TROMBONE_HAND_BRACE, low / 2, side / 2]),
    palmR: scaled([0, 0, 0.02]),
    // The left fingers wrap the inner slide tubes at the hand brace, and the right
    // fingertips hold the upright slide brace (`docs/reference/wind-technique.md` 1.1).
    tubes: {
      tubeL: {
        bone: 'instrument',
        from: scaled([0.04, low / 2, 0]),
        to: scaled([0.3, low / 2, 0]),
      },
      tubeR: { bone: 'slide', from: scaled([0, -low / 2, 0]), to: scaled([0, low / 2, 0]) },
    },
    targets: [
      { ...bellTarget, from: scaled(bellTarget.from), to: scaled(bellTarget.to) },
      {
        kind: 'slide',
        bone: 'slide',
        from: scaled([0, 0, 0.02]),
        to: scaled([t.travel, 0, 0.02]),
        normal: [0, 0, 1],
        keys: null,
      },
    ],
  };
}

/**
 * The turn of the horn around the mouthpiece: its lower end 12° forward and 12° to the right. The
 * space of the horn in the layout (`hornSpace()` of `wind-space.ts`) has this turn, so that no
 * seat moves.
 */
const HORN_TURN = toQuat(
  new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), 12 * MathUtils.DEG2RAD)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 12 * MathUtils.DEG2RAD)),
);

/**
 * The form of the horn in the axes of its coil, in meters and degrees ({@link horn}). The coil
 * lies in the plane z = 0 around the origin. In the hold, +x points to the right of the player,
 * +y up, and +z to the player. An angle on the coil starts at +x and grows toward +y, and the
 * tube goes from the mouthpiece to the bell in this direction.
 */
const HORN = {
  /**
   * The middle of the rim of the mouthpiece. The mouthpiece and the lead pipe lie on the tangent
   * from this point to the hoop, and the lead pipe then follows the hoop. The rim is 0.17 m from
   * the hoop. With the coil 0.3 m below the mouth, the straight lead pipe looked like a drinking
   * straw.
   */
  mouth: [-0.043, 0.207],
  /** The angle at which the lead pipe leaves the hoop and goes to the first valve. */
  leadEnd: 300,
  /** The distance of the lead pipe from the plane of the coil, on the side of the player. */
  leadOut: 0.016,
  /** The angle at which the bell tail leaves the coil. The bell opens along its tangent. */
  exit: 283,
  /**
   * The distance of the bell tail from the middle of the coil at the exit. The tail widens the
   * last part of the outer hoop, as the bell branch of a real horn lies outside its coil.
   */
  tail: 0.19,
  /** The middle of the row of the four valves. */
  valves: [0.04, 0.05],
  /** The step from one valve to the next. */
  valveStep: [0.02, -0.014],
  /** The move from the middle of the valves to the middle of the lever tips, with its z. */
  lever: [0.028, 0.03, 0.03],
  /** The distance of the left palm from the plane of the coil, on the levers. */
  palmOut: 0.05,
  /**
   * The move from the middle of the opening of the bell to the right palm: 1.2 cm into the bell,
   * and 2 cm from its axis toward the wall that is next to the right shoulder of the player. The
   * hoof of the pig is 11.5 cm long and thick, so it fits the bell only near its axis. With the
   * palm 4 cm in the bell, the hoof went 0.8 cm through the wall, and with the palm 3.5 cm from
   * the axis, 0.7 cm.
   */
  palm: [-0.015, 0.012, 0.013],
} as const;

/**
 * The turn of the coil of the horn from its axes ({@link HORN}) to the axes of the player, less the
 * turn of the hold ({@link HORN_TURN}). The coil stands in front of the right side of the chest,
 * across the body: its side with the levers faces the player, back, to the left, and down. The
 * bell then opens back, to the right, and a little up, beside the right side of the belly. The
 * place fits the pig hornist, whose mouth lies 0.31 m in front of its shoulder joints
 * (`PIG_HORN` of `pose/winds.ts`).
 */
const HORN_PLANE = pointing([0.733, -0.008, 0.681], [-0.111, 0.985, 0.131]);

/**
 * The flare of the bell of the horn ({@link bell}): a wider throat than the bells of the trumpet
 * and the trombone, as the throat of a real horn takes the right hand. The radius is 7.3 cm at
 * 5 cm from the rim, and 5.4 cm at 10 cm.
 */
const HORN_FLARE: readonly BellStep[] = [
  [0, 0],
  [0.25, 0.5],
  [0.44, 0.75],
  [0.68, 0.9],
  [1, 1],
];

/** The radius of the throat of the bell of the horn, at the start of its flare, in meters. */
const HORN_THROAT = 0.028;

/**
 * Builds the horn, as a double horn such as a Conn 8D (`docs/reference/wind-technique.md` 6.1).
 * The mouthpiece is at the origin. The parts lie in the axes of the coil ({@link HORN}), and
 * {@link HORN_PLANE} turns them into the axes of the piece. The hold turns the piece by
 * {@link HORN_TURN}.
 *
 * The parts: the mouthpiece and the lead pipe, which goes along the tangent to the hoop and then
 * around the hoop to the valves, four rotary valves with their caps and the levers of the left
 * fingers, the two inner loops of the F side and the B♭ side, the valve slides, and the outer
 * hoop, which widens into the bell tail and the bell.
 *
 * The left palm lies on the levers, on the side of the coil that faces the player, and the line of
 * the lever tips is the tube of the left paw (`InstrumentGrips.tubeL`). The right palm lies in the
 * bell near its axis, and the axis of the bell is the tube of the right paw, so that the paw can
 * lie along the bell with one side to its wall, as the right hand of a real player
 * (`docs/reference/wind-technique.md` 2.2).
 *
 * @returns The parts and the play data.
 */
function horn(): BrassBuild {
  const h = BRASS.horn;
  const f = HORN;
  const piece = new PieceBuilder();
  const plane = new Quaternion(...HORN_PLANE);
  const mouth = new Vector3(f.mouth[0], f.mouth[1], 0);
  // A point and a direction of the coil in the axes of the piece.
  const at = (x: number, y: number, z = 0): Vec3 =>
    toVec3(new Vector3(x, y, z).sub(mouth).applyQuaternion(plane));
  const along = (x: number, y: number, z = 0): Vector3 =>
    new Vector3(x, y, z).applyQuaternion(plane).normalize();
  const ring = (angle: number, r: number, out = 0): Vec3 =>
    at(r * Math.cos(angle), r * Math.sin(angle), out);
  // The lead pipe meets the hoop where the tangent from the mouth touches it.
  const join = Math.atan2(mouth.y, mouth.x) + Math.acos(h.coilRadius / mouth.length());
  const into = new Vector3(-Math.sin(join), Math.cos(join), 0);
  mouthpiece(piece, toVec3(along(into.x, into.y)), 0.009, 0.065);
  // The four rotary valves in a row, each a short casing across the coil with a cap of nickel
  // silver on the side of the player, and the lever of a left finger.
  const valve = (i: number, z = 0): Vec3 =>
    at(f.valves[0] + f.valveStep[0] * (i - 1.5), f.valves[1] + f.valveStep[1] * (i - 1.5), z);
  const leverTip = (i: number): Vec3 =>
    at(
      f.valves[0] + f.lever[0] + f.valveStep[0] * (i - 1.5) * 0.6,
      f.valves[1] + f.lever[1] + f.valveStep[1] * (i - 1.5) * 0.6,
      f.lever[2],
    );
  for (let i = 0; i < 4; i++) {
    piece.rod(valve(i, -0.02), valve(i, 0.02), 0.0105, TUBE_SEGMENTS, METAL, 'metal');
    piece.rod(valve(i, 0.02), valve(i, 0.024), 0.0115, TUBE_SEGMENTS, TRIM, 'metal');
    piece.bar(valve(i, 0.024), leverTip(i), 0.004, 0.0025, TRIM, 'metal');
  }
  // The lead pipe: from the mouthpiece along the tangent to the hoop, around the hoop beside the
  // outer hoop, and in to the first valve. It widens from the mouthpiece to the valve.
  const leadEnd = f.leadEnd * MathUtils.DEG2RAD;
  const leadSteps = 14;
  const lead: Vec3[] = [at(mouth.x + into.x * 0.06, mouth.y + into.y * 0.06)];
  for (let i = 0; i <= leadSteps; i++) {
    lead.push(ring(join + ((leadEnd - join) * i) / leadSteps, h.coilRadius, f.leadOut));
  }
  lead.push(ring(leadEnd + 0.3, h.coilRadius * 0.86, f.leadOut), valve(0, f.leadOut));
  tubeAlong(
    piece,
    lead,
    lead.map((_, i) => 0.0055 + (0.0025 * i) / (lead.length - 1)),
    TUBE_SEGMENTS,
    METAL,
  );
  // The two inner loops of the double horn, the F side and the B♭ side: each leaves one valve,
  // goes around inside the hoop, and comes back to another valve.
  const center = at(0, 0);
  const coilU = toVec3(along(1, 0));
  const coilV = toVec3(along(0, 1));
  for (const [r, from, to, first, last] of [
    [0.1, 100, 380, 0, 3],
    [0.076, 115, 365, 1, 2],
  ] as const) {
    tubeAlong(
      piece,
      [
        valve(first),
        ...arc(center, coilU, coilV, r, from * MathUtils.DEG2RAD, to * MathUtils.DEG2RAD, 14),
        valve(last),
      ],
      [0.006],
      TUBE_SEGMENTS,
      METAL,
    );
  }
  // The valve slides rise from the valves on the far side of the loops.
  for (let i = 1; i < 4; i++) {
    const x = f.valves[0] + f.valveStep[0] * (i - 1.5);
    const y = f.valves[1] + f.valveStep[1] * (i - 1.5);
    const reach = 0.035 + 0.012 * i;
    tubeAlong(
      piece,
      rounded(
        [
          at(x - 0.006, y, -0.012),
          at(x - 0.006, y + reach, -0.012),
          at(x + 0.012, y + reach, -0.012),
          at(x + 0.012, y, -0.012),
        ],
        0.008,
        1,
      ),
      [0.0045],
      TUBE_SEGMENTS,
      METAL,
    );
  }
  // The outer hoop: one turn that widens into the bell tail, which leaves the coil at the exit.
  const exit = f.exit * MathUtils.DEG2RAD;
  const hoop: Vec3[] = [];
  const radii: number[] = [];
  const turnSteps = 26;
  for (let i = 0; i <= turnSteps; i++) {
    const share = i / turnSteps;
    const out = MathUtils.smoothstep(share, 0.55, 1);
    hoop.push(
      ring(
        exit - 2 * Math.PI * (1 - share),
        h.coilRadius * (0.9 + 0.1 * Math.min(1, share / 0.55)) + (f.tail - h.coilRadius) * out,
      ),
    );
    radii.push(0.0065 + (HORN_THROAT - 0.0065) * share * share);
  }
  tubeAlong(piece, hoop, radii, TUBE_SEGMENTS, METAL);
  const bellAxis = along(-Math.sin(exit), Math.cos(exit));
  const bellTarget = bell(
    piece,
    toVec3(new Vector3(...ring(exit, f.tail)).addScaledVector(bellAxis, 0.2)),
    toVec3(bellAxis),
    h.bellRadius,
    0.2,
    HORN_THROAT,
    BELL_SEGMENTS,
    HORN_FLARE,
  );
  hornSpace(piece, h.coilRadius, h.bellRadius);
  return {
    pieces: [piece.build('instrument', hold('mouth', [0, 0, 0], HORN_TURN))],
    palmL: at(f.valves[0] + f.lever[0], f.valves[1] + f.lever[1], f.palmOut),
    palmR: toVec3(
      new Vector3(...f.palm).applyQuaternion(plane).add(new Vector3(...bellTarget.from)),
    ),
    tubes: {
      // The left fingers lie on the tips of the levers of the first three valves.
      tubeL: { bone: 'instrument', from: leverTip(0), to: leverTip(2) },
      // The right paw lies in the bell, along its axis.
      tubeR: { bone: 'instrument', from: ring(exit, f.tail), to: bellTarget.from },
    },
    targets: [bellTarget],
  };
}

/**
 * The flare of the bell of the tuba above the bend of the bell branch, as the radius at each
 * distance below the rim, in meters. The bell widens slowly up the branch and fast in its last
 * 10 cm, as the bell of a real tuba, and the rim rolls over to a bead. With a straight cone up to
 * 5 cm below the rim, the bell read as a funnel. The radius of the rim is `BRASS.tuba.bellRadius`.
 */
const TUBA_FLARE: readonly (readonly [radius: number, below: number])[] = [
  [0.118, 0.19],
  [0.14, 0.135],
  [0.162, 0.1],
  [0.188, 0.065],
  [0.207, 0.035],
];

/**
 * The steps of {@link TUBA_FLARE} between which a band of nickel silver goes around the bell, as
 * the garland of a concert tuba: from 10 cm to 6.5 cm below the rim.
 */
const TUBA_GARLAND = [2, 3] as const;

/**
 * Adds the bell of the tuba above the bend of the bell branch ({@link TUBA_FLARE}): the flare
 * with its garland of nickel silver ({@link TUBA_GARLAND}), the bead of the rim, and the lit
 * inside of the flare. The bands share their rings, so the bell is one closed solid.
 *
 * @param piece The piece.
 * @param bend The middle of the bell branch at the bend.
 * @param axis The axis of the bell, from the bend to the rim.
 * @param top The distance of the rim from the bend along the axis.
 * @param radius The radius of the rim.
 */
function tubaBell(piece: PieceBuilder, bend: Vec3, axis: Vec3, top: number, radius: number): void {
  const flare = TUBA_FLARE.map(([r, below]): ProfilePoint => [r, top - below]);
  const [from, to] = TUBA_GARLAND;
  const garlandStart = flare[from] ?? [0, 0];
  const garlandEnd = flare[to] ?? [0, 0];
  const at = transform(
    bend,
    toQuat(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...axis))),
  );
  const bands: readonly (readonly [readonly ProfilePoint[], Rgb])[] = [
    [[[0, 0], [0.085, 0], ...flare.slice(0, from + 1)], METAL],
    [[garlandStart, garlandEnd], TRIM],
    [
      [
        ...flare.slice(to),
        [radius * 1.02, top - 0.01],
        [radius, top],
        // The rim turns back into the bell, so that the opening shows the lit inside of the flare.
        ...openBell(radius, top),
      ],
      METAL,
    ],
  ];
  for (const [profile, color] of bands) {
    piece.add(latheBand(profile, TUBA_SEGMENTS), color, at, 'metal');
  }
}

/**
 * The four piston valves of the tuba, in meters in the axes of the drawing of {@link tuba}: the x
 * of their axes, the height of the tops and of the bottoms of the casings, the radius of a
 * casing, and the z of each valve from the front to the back. Each tube that goes into a valve
 * ends inside its casing.
 */
const TUBA_VALVES = {
  x: 0.1,
  top: 0.475,
  bottom: 0.365,
  radius: 0.0125,
  z: [-0.06, -0.025, 0.01, 0.045],
} as const;

/**
 * The long slide of the first valve of the tuba, in meters in the axes of the drawing of
 * {@link tuba}: the height of its upper leg and of its lower leg, its distance in front of the
 * bell branch, and the end of its bow at the left. The loop crosses the front of the tuba below the
 * grip of the left paw, as the long slide loops of a concert tuba, so that the audience sees
 * tubing between the bell branch and the valves. With only the short slides at the right of the
 * valves, the tuba read as a cone and a bow, as a large saxophone.
 */
const TUBA_LONG_SLIDE = { upper: 0.33, lower: 0.26, front: -0.12, left: -0.11 } as const;

/**
 * Adds the long slide of the first valve of the tuba ({@link TUBA_LONG_SLIDE}): from the front of
 * the first valve casing down and to the left, in front of the bell branch, around a round bow,
 * and back to the bottom of the casing.
 *
 * @param piece The piece.
 * @param at The function that gives a point of the drawing of {@link tuba} in the axes of the
 *   piece.
 */
function tubaLongSlide(piece: PieceBuilder, at: (p: Vec3) => Vec3): void {
  const s = TUBA_LONG_SLIDE;
  const bow = (s.upper - s.lower) / 2;
  const upper = rounded(
    [at([0.1, 0.43, -0.065]), at([0.06, s.upper, s.front]), at([s.left, s.upper, s.front])],
    0.03,
    1,
  );
  const around = arc(
    at([s.left, s.lower + bow, s.front]),
    [0, 1, 0],
    [-1, 0, 0],
    bow,
    0,
    Math.PI,
    4,
  );
  const lower = rounded(
    [at([s.left, s.lower, s.front]), at([0.1, s.lower, s.front]), at([0.1, 0.362, -0.06])],
    0.03,
    1,
  );
  tubeAlong(piece, [...upper, ...around.slice(1, -1), ...lower], [0.0095], TUBE_SEGMENTS, METAL);
}

/**
 * Builds the tuba, as a top-action piston tuba such as a Yamaha YFB-822
 * (`docs/reference/wind-technique.md` 6.1). The mouthpiece is at the origin, and the tuba has the
 * axes of the player: the body stands in front of the player, and the bell opens up at the left
 * of the head. A longer lead pipe moves the body back toward the player and to the left. The lead
 * pipe starts at the end of the mouthpiece shank, in front of the lips, and goes down in front of
 * the chin before it goes back to the valves. With its end behind the rim, the pipe went 2.6 cm
 * into the chin of the rhino.
 *
 * The parts: the bell branch with its garland, the bottom bow, the valve branch, four piston valves
 * with pearl buttons, the long slide of the first valve across the front, the slides of the other
 * valves at the right of the valves, and the lead pipe.
 *
 * @param lead The lengths by which the lead pipe reaches back and to the left from the
 *   mouthpiece, in meters (`SpeciesParams.tubaPipe`).
 * @returns The parts and the play data.
 */
function tuba(lead: readonly [back: number, left: number]): BrassBuild {
  const [back, left] = lead;
  const t = BRASS.tuba;
  const v = TUBA_VALVES;
  const piece = new PieceBuilder();
  mouthpiece(piece, [0, 0, -1], 0.014, 0.09);
  // The axes of the drawing: the bottom bow is at y = 0. The mouthpiece is 0.72 m above it, and
  // 0.2 m behind it with no longer lead pipe.
  const bottom = new Vector3(-0.06 - left, -0.72, back - 0.2);
  const at = (p: Vec3): Vec3 => toVec3(new Vector3(...p).add(bottom));
  // The bell branch rises from the bottom bow to the bell, and widens more and more toward it.
  // Above the grip of the left paw, it leans out to the left (TUBA_BELL_LEAN).
  const rise = 0.13;
  turned(
    piece,
    at([-0.06, rise, 0]),
    [0, 1, 0],
    [
      [0.068, 0],
      [0.085, TUBA_BELL_LEAN.bend - rise],
    ],
    TUBA_SEGMENTS,
    METAL,
  );
  const lean = TUBA_BELL_LEAN.angle * MathUtils.DEG2RAD;
  const bellAxis = new Vector3(-Math.sin(lean), Math.cos(lean), 0);
  const bend = at([-0.06, TUBA_BELL_LEAN.bend, 0]);
  const top = t.height - TUBA_BELL_LEAN.bend;
  tubaBell(piece, bend, toVec3(bellAxis), top, t.bellRadius);
  // The bottom bow joins the bell branch to the valve branch, and narrows toward the valves. The
  // valve branch ends 0.7 cm above the bottom of the valve casings, so that the middle casings
  // stand in it. It ended 1.9 cm below them.
  tubeAlong(
    piece,
    [
      ...arc(at([0.02, rise, 0]), [-1, 0, 0], [0, -1, 0], 0.08, 0, Math.PI, 6),
      at([v.x, v.bottom + 0.007, 0]),
    ],
    [0.068, 0.066, 0.061, 0.055, 0.049, 0.044, 0.04, 0.03],
    TUBE_SEGMENTS + 2,
    METAL,
  );
  // The four valves in a row from the front to the back, with the right fingers on their tops.
  const valveZ = v.z;
  for (const z of valveZ) {
    piston(piece, at([v.x, v.top, z]), v.radius, v.top - v.bottom, 0.026);
  }
  tubaLongSlide(piece, at);
  // The slides of the other valves hang at the right of the valves. Each leaves its casing, goes
  // down at the right, and comes back under the valve up into the bottom of its own casing, so
  // that no slide ends in the air. Each has 5 faces around its axis, so that the long slide fits
  // in the triangle budget.
  for (const [i, z] of valveZ.entries()) {
    if (i === 0) {
      continue;
    }
    const reach = 0.06 + 0.035 * i;
    tubeAlong(
      piece,
      rounded(
        [
          at([v.x, 0.43, z]),
          at([0.13 + 0.012 * i, 0.43, z]),
          at([0.13 + 0.012 * i, 0.43 - reach, z]),
          at([v.x, 0.43 - reach, z]),
          at([v.x, v.bottom + 0.012, z]),
        ],
        0.014,
        1,
      ),
      [0.0085],
      TUBE_SEGMENTS - 1,
      METAL,
    );
  }
  // The lead pipe from the last valve over the main tuning slide to the end of the mouthpiece
  // shank. Its bend stays 0.13 m in front of the rim, so that the pipe passes in front of the chin.
  tubeAlong(
    piece,
    rounded(
      [at([0.1, 0.5, 0.045]), at([0.1, 0.65 - back / 4, 0.07 - back]), [0, 0, -0.09]],
      0.08,
      4,
    ),
    [0.013, 0.012, 0.011, 0.01, 0.0095, 0.009, 0.0085, 0.008],
    TUBE_SEGMENTS,
    METAL,
  );
  tubaSpace(piece, at, back, t.height, t.bellRadius);
  const bellMouth = toVec3(new Vector3(...bend).addScaledVector(bellAxis, top));
  const bellTarget: PlayTarget = {
    kind: 'bell',
    bone: 'instrument',
    from: bellMouth,
    to: bellMouth,
    normal: toVec3(bellAxis),
    keys: null,
  };
  return {
    pieces: [piece.build('instrument', hold('mouth', [0, 0, 0], IDENTITY))],
    // The middle of the left palm is 0.17 m from the axis of the main branch, at its back left,
    // so that the thick paw of the rhino closes on the tube. At 0.09 m, the paw goes 6.4 cm into
    // the tube.
    palmL: at([-0.22, 0.4, 0.06]),
    palmR: at([0.1, 0.47, 0.05]),
    // The left palm closes around the upright main branch, and the right fingers come down onto
    // the tops of the valves, a row from the front to the back.
    tubes: {
      tubeL: { bone: 'instrument', from: at([-0.06, 0.3, 0]), to: at([-0.06, 0.5, 0]) },
      tubeR: { bone: 'instrument', from: at([0.1, 0.475, -0.06]), to: at([0.1, 0.475, 0.045]) },
    },
    targets: [bellTarget],
  };
}

/**
 * Builds a brass instrument (design 4.6). The origin of the instrument piece is the mouthpiece,
 * and the instrument bone hangs on the chest (4.7).
 *
 * @param id The brass instrument.
 * @param scale The scale of the trumpet or the trombone (`SpeciesParams.trumpetScale`,
 *   `SpeciesParams.tromboneScale`). The other brass instruments ignore it.
 * @param lead The lengths by which the lead pipe of the tuba reaches back and to the left from the
 *   mouthpiece, in meters (`SpeciesParams.tubaPipe`). The other brass instruments ignore it.
 * @returns The model.
 */
export function buildBrass(
  id: BrassId,
  scale = 1,
  lead: readonly [back: number, left: number] = [0, 0],
): InstrumentModel {
  const built =
    id === 'horn'
      ? horn()
      : id === 'trumpet'
        ? trumpet(scale)
        : id === 'trombone'
          ? trombone(scale)
          : tuba(lead);
  const main = built.pieces[0];
  if (!main) {
    throw new Error(`The ${id} has no piece.`);
  }
  return {
    id,
    parent: 'chest',
    pieces: built.pieces,
    grips: {
      palmL: { bone: 'instrument', at: built.palmL },
      palmR: { bone: id === 'trombone' ? 'slide' : 'instrument', at: built.palmR },
      mouth: { bone: 'instrument', at: [0, 0, 0] },
      chin: null,
      ...built.tubes,
    },
    targets: built.targets,
    size: pieceSize(main),
  };
}
