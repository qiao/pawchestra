import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { IDENTITY, toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
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
 * The distance from the back of the bow of the tuning slide of the trombone to the axis of its
 * counterweight, in meters: the radius of the tube (6.8 mm) and the largest radius of the
 * counterweight (11 mm), less 3 mm, so that the counterweight touches the bow. At 32 mm, at the
 * height of the upper leg, it floated about 2 cm off the bow.
 */
const COUNTERWEIGHT_OFF = 0.0148;

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
 * Adds a bell that opens along an axis: a flare that widens more and more toward the rim, as the
 * bell of a real brass instrument, with the lit inside of the flare. The last tenth of the flare
 * keeps the width of the simple model, because a narrower flare there put the right forearm of
 * the pig 0.2 cm deeper into the rim of the horn.
 *
 * @param piece The piece.
 * @param mouth The middle of the opening of the bell.
 * @param axis The direction in which the bell opens.
 * @param radius The radius of the opening.
 * @param depth The length of the flare.
 * @param throat The radius at the start of the flare.
 * @param segments The number of faces around the axis.
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
): PlayTarget {
  const n = new Vector3(...axis).normalize();
  const normal = toVec3(n);
  const spread = radius - throat;
  turned(
    piece,
    toVec3(new Vector3(...mouth).addScaledVector(n, -depth)),
    normal,
    [
      [throat, 0],
      [throat + spread * 0.15, depth * 0.5],
      [throat + spread * 0.35, depth * 0.75],
      [throat + spread * 0.66, depth * 0.9],
      [radius, depth],
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
 * Adds a piston valve that stands along y: the casing with its caps, the stem, and the finger
 * button with a pearl top, as on a trumpet or a tuba.
 *
 * @param piece The piece.
 * @param at The middle of the top of the casing.
 * @param radius The radius of the casing.
 * @param height The height of the casing.
 * @param stem The height of the button above the casing.
 */
function piston(piece: PieceBuilder, at: Vec3, radius: number, height: number, stem: number): void {
  const [x, y, z] = at;
  turned(
    piece,
    [x, y - height, z],
    [0, 1, 0],
    [
      [radius * 0.6, -radius * 0.5],
      [radius, 0],
      [radius * 1.05, height],
      [radius * 0.3, height],
    ],
    TUBE_SEGMENTS,
    METAL,
  );
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
 * mouthpiece stays at the mouth.
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
  const piece = new PieceBuilder(scale);
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
  main.rod([0.08, 0, 0], [0.08, low, 0], 0.0042, TUBE_SEGMENTS, TRIM, 'metal');
  main.rod([0.08, low / 2, 0], [0.08, low / 2, side], 0.0038, TUBE_SEGMENTS, TRIM, 'metal');
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
  // outer side there: its round side goes 3 mm into the tube, so it is attached to the bow.
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
      [local([0.14, 0, 0]), local([0.7, 0, 0]), local([0.7, low, 0]), local([0.14, low, 0])],
      0.035,
      4,
    ),
    [0.0088],
    TUBE_SEGMENTS,
    METAL,
  );
  for (const y of [0, low]) {
    ferrule(slide, local([0.14, y, 0]), local([0.165, y, 0]), 0.0102);
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
    palmL: scaled([0.08, low / 2, side / 2]),
    palmR: scaled([0, 0, 0.02]),
    // The left fingers wrap the inner slide tubes near the mouthpiece brace, and the right
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
 * The turn of the horn around the mouthpiece: its lower end 12° forward and 12° to the right.
 * With no turn, the coil and the bell went 0.17 H into the right thigh of the pig. With 10° and
 * 10°, the bell went 0.045 H into the right shin. A larger forward turn put the left upper arm of
 * a standing horn soloist into its torso in the rest pose.
 */
const HORN_TURN = toQuat(
  new Quaternion()
    .setFromAxisAngle(new Vector3(1, 0, 0), 12 * MathUtils.DEG2RAD)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 12 * MathUtils.DEG2RAD)),
);

/**
 * The depth of the middle of the right palm inside the opening of the horn bell, on its axis, in
 * meters. The right paw of the pig points along the line from the shoulder to the palm, about 86°
 * from the axis of the bell. At 6 cm, the wrist goes up to 2.3 cm through the wall of the bell in
 * each sample. At 2.5 cm, no point of the paw or of the forearm goes through the wall, and 92% of
 * the paw vertices are in the bell.
 */
const HORN_PALM_DEPTH = 0.025;

/**
 * Builds the horn, as a double horn such as a Conn 8D (`docs/reference/wind-technique.md` 6.1).
 * The mouthpiece is at the origin, and the horn has the axes of the player: the coil stands in
 * front of the right side of the chest, and the bell opens to the right and to the back, above
 * the right thigh. The hold turns it by {@link HORN_TURN}.
 *
 * The parts: the lead pipe from the mouthpiece to the valves, four rotary valves with their caps
 * and the levers of the left fingers, the two inner loops of the F side and the B♭ side, the
 * valve slides, and the outer hoop, which widens into the bell tail and the bell.
 *
 * @returns The parts and the play data.
 */
function horn(): BrassBuild {
  const h = BRASS.horn;
  const piece = new PieceBuilder();
  const into = new Vector3(0.25, -0.35, -1).normalize();
  mouthpiece(piece, toVec3(into), 0.009, 0.065);
  // The coil leans back 20° from the vertical, with its middle low, 0.08 m at the right of the
  // mouth, and 0.1 m in front of it. With the coil 0.24 m in front of the mouth, the left palm on
  // the valves is 1.16 times the reach of the arm.
  const center = new Vector3(0.08, -0.3, -0.1);
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -20 * MathUtils.DEG2RAD);
  const ring = (angle: number, r: number, out = 0): Vec3 =>
    toVec3(
      new Vector3(r * Math.cos(angle), r * Math.sin(angle), out).applyQuaternion(lean).add(center),
    );
  const normal = toVec3(new Vector3(0, 0, 1).applyQuaternion(lean));
  // The bell leaves the coil at its bottom right, and opens to the right and to the back.
  const bellAxis = new Vector3(0.75, -0.25, 0.6).normalize();
  const bellAngle = -Math.PI * 0.35;
  const bellStart = ring(bellAngle, h.coilRadius);
  // The outer hoop: one turn that widens from the valves into the bell tail.
  const hoop: Vec3[] = [];
  const radii: number[] = [];
  const turnSteps = 22;
  for (let i = 0; i <= turnSteps; i++) {
    const share = i / turnSteps;
    hoop.push(ring(bellAngle + 2 * Math.PI * (1 - share), h.coilRadius * (0.9 + 0.1 * share)));
    radii.push(0.0065 + 0.0075 * share * share);
  }
  tubeAlong(piece, hoop, radii, TUBE_SEGMENTS, METAL);
  // The four rotary valves in a row, each a short casing across the coil with a cap of nickel
  // silver, and the lever of a left finger, which reaches toward the lead pipe.
  const step = new Vector3(0.024, -0.012, 0).applyQuaternion(lean);
  const valve = (i: number): Vector3 =>
    new Vector3(...ring(Math.PI * 0.85, h.coilRadius * 0.55)).addScaledVector(step, i - 1);
  const across = new Vector3(...normal);
  const leverTip = new Vector3(...ring(Math.PI * 0.93, h.coilRadius * 0.86, 0.022));
  for (let i = 0; i < 4; i++) {
    const at = valve(i);
    piece.rod(
      toVec3(at.clone().addScaledVector(across, -0.02)),
      toVec3(at.clone().addScaledVector(across, 0.02)),
      0.0105,
      TUBE_SEGMENTS,
      METAL,
      'metal',
    );
    const cap = at.clone().addScaledVector(across, 0.02);
    piece.rod(
      toVec3(cap),
      toVec3(cap.clone().addScaledVector(across, 0.004)),
      0.0115,
      TUBE_SEGMENTS,
      TRIM,
      'metal',
    );
    const tip = leverTip.clone().addScaledVector(step, i * 0.45);
    piece.bar(toVec3(cap), toVec3(tip), 0.004, 0.0025, TRIM, 'metal');
  }
  // The two inner loops of the double horn, the F side and the B♭ side: each leaves one valve,
  // goes around inside the hoop, and comes back to another valve.
  const inPlane = (x: number): Vec3 => toVec3(new Vector3(x, 0, 0).applyQuaternion(lean));
  const coilU = inPlane(1);
  const coilV = toVec3(new Vector3(0, 1, 0).applyQuaternion(lean));
  for (const [r, from, to, first, last] of [
    [0.1, 0.35, -1.1, 3, 0],
    [0.076, 0.2, -1.0, 2, 1],
  ] as const) {
    tubeAlong(
      piece,
      [
        toVec3(valve(first)),
        ...arc(toVec3(center), coilU, coilV, r, from * Math.PI, to * Math.PI, 12),
        toVec3(valve(last)),
      ],
      [0.006],
      TUBE_SEGMENTS,
      METAL,
    );
  }
  // The lead pipe from the mouthpiece to the first valve, and the valve slides that rise from
  // the valves behind the loops.
  tubeAlong(
    piece,
    rounded(
      [
        toVec3(into.clone().multiplyScalar(0.06)),
        ring(Math.PI * 0.62, h.coilRadius * 0.95),
        ring(Math.PI * 0.8, h.coilRadius * 0.72),
        toVec3(valve(0)),
      ],
      0.04,
      2,
    ),
    [0.0042, 0.0046, 0.005, 0.0052, 0.0054, 0.0056, 0.0058, 0.006],
    TUBE_SEGMENTS,
    METAL,
  );
  const up = new Vector3(...coilV);
  const out = new Vector3(...coilU);
  for (let i = 1; i < 4; i++) {
    const at = valve(i).addScaledVector(across, -0.012);
    const reach = 0.035 + 0.012 * i;
    const point = (rise: number, side: number): Vec3 =>
      toVec3(at.clone().addScaledVector(up, rise).addScaledVector(out, side));
    tubeAlong(
      piece,
      rounded(
        [point(0, -0.006), point(reach, -0.006), point(reach, 0.012), point(0, 0.012)],
        0.008,
        1,
      ),
      [0.0045],
      TUBE_SEGMENTS,
      METAL,
    );
  }
  const bellTarget = bell(
    piece,
    toVec3(new Vector3(...bellStart).addScaledVector(bellAxis, 0.2)),
    toVec3(bellAxis),
    h.bellRadius,
    0.2,
    0.014,
    BELL_SEGMENTS,
  );
  hornSpace(piece, h.coilRadius, h.bellRadius);
  return {
    pieces: [piece.build('instrument', hold('mouth', [0, 0, 0], HORN_TURN))],
    // The left palm holds the coil at 0.9 of a half turn and 0.8 of its radius. At 0.8 and 0.6,
    // the palm is 0.98 of the arm length of the pig with the turn of the horn.
    palmL: ring(Math.PI * 0.9, h.coilRadius * 0.8),
    palmR: toVec3(new Vector3(...bellTarget.from).addScaledVector(bellAxis, -HORN_PALM_DEPTH)),
    tubes: {},
    targets: [bellTarget],
  };
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
 * The parts: the bell branch, the bottom bow, the valve branch, four piston valves with pearl
 * buttons, the valve slides at the right of the valves, and the main tuning slide over them.
 *
 * @param lead The lengths by which the lead pipe reaches back and to the left from the
 *   mouthpiece, in meters (`SpeciesParams.tubaPipe`).
 * @returns The parts and the play data.
 */
function tuba(lead: readonly [back: number, left: number]): BrassBuild {
  const [back, left] = lead;
  const t = BRASS.tuba;
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
  turned(
    piece,
    bend,
    toVec3(bellAxis),
    [
      [0.085, 0],
      [0.108, top - 0.28],
      [0.135, top - 0.15],
      [t.bellRadius * 0.82, top - 0.05],
      [t.bellRadius * 1.02, top],
      ...openBell(t.bellRadius, top),
    ],
    TUBA_SEGMENTS,
    METAL,
  );
  // The bottom bow joins the bell branch to the valve branch, and narrows toward the valves.
  tubeAlong(
    piece,
    [...arc(at([0.02, rise, 0]), [-1, 0, 0], [0, -1, 0], 0.08, 0, Math.PI, 6), at([0.1, 0.34, 0])],
    [0.068, 0.066, 0.061, 0.055, 0.049, 0.044, 0.04, 0.03],
    TUBE_SEGMENTS + 2,
    METAL,
  );
  // The four valves in a row from the front to the back, with the right fingers on their tops.
  const valveZ = [-0.06, -0.025, 0.01, 0.045];
  for (const z of valveZ) {
    piston(piece, at([0.1, 0.475, z]), 0.0125, 0.11, 0.026);
  }
  // The valve slides hang at the right of the valves.
  for (const [i, z] of valveZ.entries()) {
    const reach = 0.06 + 0.035 * i;
    tubeAlong(
      piece,
      rounded(
        [
          at([0.11, 0.43, z]),
          at([0.13 + 0.012 * i, 0.43, z]),
          at([0.13 + 0.012 * i, 0.43 - reach, z]),
          at([0.11, 0.43 - reach, z]),
        ],
        0.014,
        1,
      ),
      [0.0085],
      TUBE_SEGMENTS,
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
