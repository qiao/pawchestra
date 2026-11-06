import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { IDENTITY, toQuat, toVec3 } from '../tuples.ts';
import { transform } from '../mesh.ts';
import type { Vec3 } from '../tuples.ts';
import { cylinder, lathe } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, pointing } from './piece.ts';
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

const METAL = INSTRUMENT_COLORS.brass;

/** The faces around the axis of a tube. */
const TUBE_SEGMENTS = 6;

/** The faces around the axis of a bell. */
const BELL_SEGMENTS = 12;

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
    [radius * 0.9, depth - radius * 0.06],
    [radius * 0.45, depth - radius * 0.6],
    [0, depth - radius * 0.8],
  ];
}

/**
 * Adds a solid of revolution along an axis.
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
  piece.add(lathe(profile, segments), METAL, transform(from, toQuat(turn)), 'metal');
}

/**
 * Adds a tube through a list of points.
 *
 * @param piece The piece.
 * @param points The points along the tube.
 * @param radius The radius of the tube.
 */
function pipe(piece: PieceBuilder, points: readonly Vec3[], radius: number): void {
  for (let i = 0; i + 1 < points.length; i++) {
    piece.rod(
      points[i] ?? [0, 0, 0],
      points[i + 1] ?? [0, 0, 0],
      radius,
      TUBE_SEGMENTS,
      METAL,
      'metal',
    );
  }
}

/**
 * Adds the mouthpiece: a small cup at the origin that opens to -along.
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
    TUBE_SEGMENTS,
  );
}

/**
 * Adds a bell that opens along an axis.
 *
 * @param piece The piece.
 * @param mouth The middle of the opening of the bell.
 * @param axis The direction in which the bell opens.
 * @param radius The radius of the opening.
 * @param depth The length of the flare.
 * @returns The target at the middle of the opening.
 */
function bell(
  piece: PieceBuilder,
  mouth: Vec3,
  axis: Vec3,
  radius: number,
  depth: number,
): PlayTarget {
  const n = new Vector3(...axis).normalize();
  const normal = toVec3(n);
  turned(
    piece,
    toVec3(new Vector3(...mouth).addScaledVector(n, -depth)),
    normal,
    [
      [radius * 0.18, 0],
      [radius * 0.35, depth * 0.6],
      [radius * 0.7, depth * 0.9],
      [radius, depth],
      // The rim turns back into the bell, so that the opening shows the lit inside of the
      // flare, as the bells of the polished images.
      ...openBell(radius, depth),
    ],
    BELL_SEGMENTS,
  );
  return { kind: 'bell', bone: 'instrument', from: mouth, to: mouth, normal, keys: null };
}

/**
 * Adds valve casings: short upright cylinders in a row.
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
    piece.add(
      cylinder(radius, radius, height, TUBE_SEGMENTS),
      METAL,
      transform(toVec3(base), turn),
      'metal',
    );
  }
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
 * Builds the trumpet. The mouthpiece is at the origin, and the trumpet runs along +x to the bell.
 * The valves stand up (+y), and the player holds it horizontal and forward. A species with short
 * arms plays a smaller trumpet (`SpeciesParams.trumpetScale`), as a child plays a fractional
 * violin. The trumpet, its grips, and its bell target shrink toward the mouthpiece, so the
 * mouthpiece stays at the mouth.
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
  const piece = new PieceBuilder(scale);
  const scaled = (at: Vec3): Vec3 => [at[0] * scale, at[1] * scale, at[2] * scale];
  mouthpiece(piece, [1, 0, 0], 0.009);
  // The lead pipe, the valve block, the lower loop, and the bell.
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
      [t.length - 0.13, -0.05, 0],
    ],
    0.006,
  );
  const bellTarget = bell(piece, [t.length, -0.05, 0], [1, 0, 0], t.bellRadius, 0.13);
  const bellMouth = scaled(bellTarget.from);
  return {
    pieces: [
      piece.build(
        'instrument',
        hold('mouth', [0, 0, 0], pointing([0, -Math.sin(5 * MathUtils.DEG2RAD), -1], [0, 1, 0])),
      ),
    ],
    palmL: scaled([0.176, -0.07, -0.038]),
    palmR: scaled([0.176, 0.045, VALVES_TO_RIGHT_PALM]),
    tubes: {
      // The left fingers close around the upright middle casing.
      tubeL: {
        bone: 'instrument',
        from: scaled([0.176, -0.0625, 0]),
        to: scaled([0.176, 0.0125, 0]),
      },
      // The right palm faces down onto the line of the valve tops under it, so the line lies to
      // the right of the valves by the same distance as the palm.
      tubeR: {
        bone: 'instrument',
        from: scaled([0.15, 0.0125, VALVES_TO_RIGHT_PALM]),
        to: scaled([0.202, 0.0125, VALVES_TO_RIGHT_PALM]),
      },
    },
    targets: [{ ...bellTarget, from: bellMouth, to: bellMouth }],
  };
}

/**
 * Builds the trombone with its slide. The mouthpiece is at the origin, and the slide runs along
 * +x. The two slide tubes lie one above the other. The bell section lies at the left of the slide
 * (-z), and its tuning loop goes back over the left shoulder.
 *
 * The slide is a second piece on the `slide` bone. Its origin is the slide brace in the first
 * position, and it moves along +x by `travel` to the seventh position.
 *
 * @returns The parts and the play data.
 */
function trombone(): BrassBuild {
  const t = BRASS.trombone;
  const main = new PieceBuilder();
  mouthpiece(main, [1, 0, 0], 0.01);
  const low = -0.07;
  const side = -0.11;
  // The inner slide tubes, and the brace near the mouthpiece that the left hand holds.
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
  // The bell section, its tuning loop over the shoulder, and the bell.
  const back = t.length - 0.7;
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
  const bellTarget = bell(main, [0.7, low / 2, side], [1, 0, 0], t.bellRadius, 0.16);

  // The outer slide: two tubes over the inner tubes, the bow at the end, and the brace.
  const brace: Vec3 = [0.3, low / 2, 0];
  const slide = new PieceBuilder();
  const local = (p: Vec3): Vec3 => [p[0] - brace[0], p[1] - brace[1], p[2] - brace[2]];
  pipe(slide, [local([0.14, 0, 0]), local([0.68, 0, 0])], 0.009);
  pipe(slide, [local([0.14, low, 0]), local([0.68, low, 0])], 0.009);
  pipe(slide, [local([0.68, 0, 0]), local([0.7, low / 2, 0]), local([0.68, low, 0])], 0.009);
  pipe(slide, [local([0.3, 0, 0]), local([0.3, low, 0])], 0.005);

  const rotation = pointing(
    [0, -Math.sin(15 * MathUtils.DEG2RAD), -Math.cos(15 * MathUtils.DEG2RAD)],
    [0, 1, 0],
  );
  return {
    pieces: [
      main.build('instrument', hold('mouth', [0, 0, 0], rotation)),
      slide.build('slide', hold('instrument', [0, 0, 0], IDENTITY, brace)),
    ],
    palmL: [0.08, low / 2, side / 2],
    palmR: [0, 0, 0.02],
    // The left fingers wrap the inner slide tubes near the mouthpiece brace, and the right
    // fingertips hold the upright slide brace (`docs/reference/wind-technique.md` 1.1).
    tubes: {
      tubeL: { bone: 'instrument', from: [0.04, low / 2, 0], to: [0.3, low / 2, 0] },
      tubeR: { bone: 'slide', from: [0, -low / 2, 0], to: [0, low / 2, 0] },
    },
    targets: [
      bellTarget,
      {
        kind: 'slide',
        bone: 'slide',
        from: [0, 0, 0.02],
        to: [t.travel, 0, 0.02],
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
 * Builds the horn. The mouthpiece is at the origin, and the horn has the axes of the player: the
 * coil stands in front of the right side of the chest, and the bell opens to the right and to
 * the back, above the right thigh. The hold turns it by {@link HORN_TURN}.
 *
 * @returns The parts and the play data.
 */
function horn(): BrassBuild {
  const h = BRASS.horn;
  const piece = new PieceBuilder();
  const into = new Vector3(0.25, -0.35, -1).normalize();
  mouthpiece(piece, toVec3(into), 0.009);
  // The coil leans back 20° from the vertical, with its middle low, 0.08 m at the right of the
  // mouth, and 0.1 m in front of it. With the coil 0.24 m in front of the mouth, the left palm on
  // the valves is 1.16 times the reach of the arm.
  const center = new Vector3(0.08, -0.3, -0.1);
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -20 * MathUtils.DEG2RAD);
  const ring = (angle: number, r: number): Vec3 =>
    toVec3(
      new Vector3(r * Math.cos(angle), r * Math.sin(angle), 0).applyQuaternion(lean).add(center),
    );
  const coil: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    coil.push(ring((i / 12) * 2 * Math.PI, h.coilRadius));
  }
  pipe(piece, coil, 0.011);
  // The lead pipe from the mouthpiece to the top of the coil, and the valves at its front left.
  pipe(
    piece,
    [toVec3(into.clone().multiplyScalar(0.04)), ring(Math.PI * 0.6, h.coilRadius)],
    0.005,
  );
  valves(
    piece,
    ring(Math.PI * 0.85, h.coilRadius * 0.55),
    toVec3(new Vector3(0.024, -0.012, 0).applyQuaternion(lean)),
    3,
    0.009,
    0.06,
    toVec3(new Vector3(0, 0, 1).applyQuaternion(lean)),
  );
  // The bell leaves the coil at its bottom right, and opens to the right and to the back.
  const bellAxis = new Vector3(0.75, -0.25, 0.6).normalize();
  const bellStart = ring(-Math.PI * 0.35, h.coilRadius);
  const bellTarget = bell(
    piece,
    toVec3(new Vector3(...bellStart).addScaledVector(bellAxis, 0.2)),
    toVec3(bellAxis),
    h.bellRadius,
    0.2,
  );
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
 * Builds the tuba. The mouthpiece is at the origin, and the tuba has the axes of the player: the
 * body stands in front of the player, and the bell opens up at the left of the head. A longer
 * lead pipe moves the body back toward the player and to the left, and the pipe goes down from
 * the mouthpiece before it goes back to the valves, so that it passes under the chin.
 *
 * @param lead The lengths by which the lead pipe reaches back and to the left from the
 *   mouthpiece, in meters (`SpeciesParams.tubaPipe`).
 * @returns The parts and the play data.
 */
function tuba(lead: readonly [back: number, left: number]): BrassBuild {
  const [back, left] = lead;
  const t = BRASS.tuba;
  const piece = new PieceBuilder();
  mouthpiece(piece, [0, 0, -1], 0.012);
  // The axes of the drawing: the bottom bow is at y = 0. The mouthpiece is 0.72 m above it, and
  // 0.2 m behind it with no longer lead pipe.
  const bottom = new Vector3(-0.06 - left, -0.72, back - 0.2);
  const at = (p: Vec3): Vec3 => toVec3(new Vector3(...p).add(bottom));
  // The main branch rises from the bottom bow to the bell.
  turned(
    piece,
    at([-0.06, 0, 0]),
    [0, 1, 0],
    [
      [0, 0],
      [0.07, 0.03],
      [0.08, 0.45],
      [0.11, t.height - 0.25],
      [t.bellRadius * 0.7, t.height - 0.06],
      [t.bellRadius, t.height],
      ...openBell(t.bellRadius, t.height),
    ],
    BELL_SEGMENTS,
  );
  // The second branch with the valves, the bottom bow, and the lead pipe to the mouthpiece.
  pipe(piece, [at([0.1, 0.06, 0]), at([0.1, 0.5, 0])], 0.04);
  pipe(piece, [at([-0.06, 0.06, 0]), at([0.1, 0.06, 0])], 0.05);
  valves(piece, at([0.1, 0.42, -0.06]), [0, 0, 0.035], 4, 0.012, 0.11, [0, 1, 0]);
  pipe(
    piece,
    [at([0.1, 0.5, 0]), at([0.1, 0.65 - back / 4, 0.08 - back / 2]), [0, 0, 0.05]],
    0.012,
  );
  const bellTarget: PlayTarget = {
    kind: 'bell',
    bone: 'instrument',
    from: at([-0.06, t.height, 0]),
    to: at([-0.06, t.height, 0]),
    normal: [0, 1, 0],
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
 * @param scale The scale of the trumpet (`SpeciesParams.trumpetScale`). The other brass
 *   instruments ignore it.
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
          ? trombone()
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
