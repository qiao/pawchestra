import { MathUtils, Quaternion, Vector3 } from 'three';
import { SCENE_COLORS } from './colors.ts';
import { PIANO_BENCH, buildPianoBench } from './instruments/piano.ts';
import { toQuat, toVec3 } from './tuples.ts';
import type { Vec3 } from './tuples.ts';
import { centeredBox } from './bounds.ts';
import type { Bounds } from './bounds.ts';
import type { RiserLevel, SceneLayout } from './layout.ts';
import { MeshBuilder, splitByFacing, srgb, transform } from './mesh.ts';
import type { MeshData, Rgb, Transform } from './mesh.ts';
import { box, quad } from './primitives.ts';
import { SPECIES } from './species.ts';
import type { SpeciesParams } from './species.ts';
import { bodyOf } from './body.ts';

/**
 * The colors of the stage, the steps, the podium, and the choir risers (design 4.5, scene
 * colors), in linear values. The stage is glossy walnut, as in `mockup.png` and `scene.png`.
 */
export const STAGE_COLORS = {
  /**
   * The mean color of a plank. Each plank has its own tone around it. The light of the lit floor
   * comes mostly from the diffuse light of the wood (`STAGE_FINISH` of `scene/stage.ts`). The
   * darker walnut `#3b2618` then gives a lit floor that is too dark and too pale. The side lights
   * are a warm white, so the wood holds the amber itself: `#5e351a` gives a lit floor with a
   * saturation of 0.44 against 0.54 in `orchestra-latest.png`, and shadows that are too dark.
   * `#844c16` reads as a bright, even amber, and the stage looks over-exposed. The plank is 0.85
   * of it in linear values, so the lit players stand out of the floor.
   */
  plank: srgb('#7a4614'),
  /**
   * The dark line between two planks, at 0.68 of the plank color in linear values. The stage
   * shader finds a seam by this color, so no plank has it.
   */
  seam: srgb('#663a0f'),
  /**
   * The raised lip around the stage top, with a round top that catches the light. The lip and the
   * risers follow the plank color, by the same factor of each linear channel.
   */
  nosing: srgb('#84551f'),
  /** The skirt: the front and the sides of the stage, and the step rises. */
  skirt: srgb('#3c2416'),
  /** The grooves of the skirt panels. */
  groove: srgb('#26160d'),
  /** The body of the podium, and the frames around the panels of its sides. */
  podium: srgb('#6c4429'),
  /** The boards of the treads of the choir risers, lighter than the stage, as in `orchestra-side.png`. */
  riserTread: srgb('#784d1b'),
  /** The lighter front edge of each tread of the choir risers. */
  riserNosing: srgb('#ab742e'),
  /** The panels of the sides of the podium, inside their frames. */
  podiumPanel: srgb('#58371f'),
  /** The top plate of the podium and the frame of its top, a little lighter, as in `mockup.png`. */
  podiumTop: srgb('#80532f'),
  /** The panel of the top of the podium, inside its frame and a dark groove. */
  podiumTopPanel: srgb('#73492a'),
} as const satisfies Readonly<Record<string, Rgb>>;

/**
 * The item that a player sits or stands on (design 5.1). `stand` is the floor or the podium, and
 * `riser` is a level of the choir risers.
 */
export type Support = 'chair' | 'stool' | 'bench' | 'stand' | 'riser';

/**
 * The chair (design 4.5, props). The player sits on it and faces -z. The seat of each chair fits
 * the legs of its species (`seatHeights()`).
 */
export const CHAIR = {
  seatWidth: 0.42,
  seatDepth: 0.4,
  /**
   * The height of the top of the back above the seat. A lower seat has a lower back. The top rail
   * starts above the tail of the red fox, which passes the back posts up to 0.34 m above the seat.
   */
  back: 0.45,
  /**
   * The height of the one wide top rail of the back. The rail ends at the back top, and the back
   * is open below it, as on the chairs of `animals.webp`.
   */
  rail: 0.1,
} as const;

/** The heights of a seat (design 4.5, props). */
export interface SeatHeights {
  /** The height of the top of the seat above the floor, in meters. */
  readonly seatHeight: number;
  /**
   * The depth of the seat of a chair or of the stool of the harp under a body, in meters
   * (`Body.chairDepth`). The seat keeps the back of the chair, and its front edge is further
   * back. The piano bench under a body takes its depth from the haunch and the thighs
   * (`Body.benchDepth`), at least `PIANO_BENCH.bodyDepth`. The other seats keep their own
   * depth.
   */
  readonly seatDepth?: number;
  /**
   * The reach of the front edge of the piano bench under a body in front of the floor
   * point, in meters: half the depth of its fit, so a deeper bench grows back. The other seats
   * stand around the floor point.
   */
  readonly seatFront?: number;
  /**
   * The width of the seat of a chair or of the stool of the harp under a body with a wide
   * haunch, in meters (`Body.chairWidth`). The legs and the back posts stay at the side edges
   * of the seat.
   */
  readonly seatWidth?: number;
  /**
   * True when the app builds no chair under the body (`SpeciesParams.noChair`). The body keeps its
   * seated pose at these heights.
   */
  readonly noChair?: true;
}

/**
 * The stool of the harp (design 4.5, props), with no back. Its seat fits the legs, and it has the
 * width and the depth of the seat of the chair of the body, as the chair does (`seatHeights()`).
 * A body with no chair depth keeps the seat size `seatSize`.
 */
const STOOL = {
  seatSize: 0.36,
} as const;

/**
 * The depth of each level of the choir risers, the height of the lowest level, and the rise of
 * each higher level (design 4.5). The lowest level stands 1.0 m high, so that a large animal of
 * the back row hides no head of a singer.
 */
export const RISER = {
  /** The depth of each level, in meters. The singers stand on its middle. */
  depth: 0.8,
  /** The height of the lowest level above the stage top, in meters. */
  base: 1.0,
  /** The height of each higher level above the level in front of it, in meters. */
  rise: 0.25,
  /** The most levels. */
  levels: 3,
  /**
   * The curved stair at each side end of the lowest level ({@link riserStair}). No singer stands
   * on it.
   */
  stairs: {
    /** The width of each stair from its front face to its back face, in meters. */
    width: 0.6,
    /**
     * The largest rise of one step, in meters: 8 in, the rise of a Wenger Signature choral riser
     * step and of a StageRight stage riser.
     */
    rise: 0.2,
    /**
     * The tread of one step along the arc, in meters at the middle of the stair: 11 in, the tread
     * of a Wenger stage stairway and the least tread of IBC 1011.5.2.
     */
    tread: 0.28,
  },
  /** The width of the lighter edge at the front of each tread, in meters. */
  nosing: 0.04,
  /**
   * The nosing lip of each level: the front edge of the tread passes the riser face below it, as
   * the nosing of a stair tread (IBC 1011.5.5 asks for 3/4 in to 1 1/4 in), in meters.
   */
  lip: { overhang: 0.025, height: 0.04 },
  /** The widest board of a tread, in meters. A dark line divides a deeper tread into boards. */
  board: 0.4,
  /**
   * The arc of the risers past the outermost singer on each side, in meters at the lowest level.
   * The risers of `orchestra-latest.png` and `orchestra-side.png` reach past the choir.
   */
  wing: 1.0,
} as const;

/** One step of a stair at a side end of the choir risers (design 4.5). */
export interface StairStep {
  /** The angle of the end near the risers, in radians from 0°, on the right side. */
  readonly from: number;
  /** The angle of the far end, in radians from 0°, on the right side. It is above `from`. */
  readonly to: number;
  /** The height of the tread above the stage top, in meters. */
  readonly top: number;
}

/**
 * The curved stair at each side end of the lowest level of the risers (design 4.5). The right
 * stair has the angles of its steps, and the left stair has the same angles below 0°.
 */
export interface RiserStair {
  /** The distance of the front face from the podium center, in meters. */
  readonly inner: number;
  /** The distance of the back face from the podium center, in meters. */
  readonly outer: number;
  /** The steps, from the highest step at the end of the level down to the lowest step. */
  readonly steps: readonly StairStep[];
}

/**
 * Gives the curved stair at each side end of the lowest level of the risers (design 4.5). The
 * stair continues the arc of the level past its end, at the front of the level. Each step is a
 * wedge of an annulus around the podium center, one rise lower than the step before it, down to
 * the stage top. The steps divide the height of the level evenly, with the fewest steps of at
 * most {@link RISER}.stairs.rise each.
 *
 * @param level The lowest level.
 * @returns The stair of the right end.
 */
export function riserStair(level: RiserLevel): RiserStair {
  const { width, rise, tread } = RISER.stairs;
  const inner = level.radius - RISER.depth / 2;
  const outer = inner + width;
  const middle = (inner + outer) / 2;
  const count = Math.max(1, Math.ceil(level.height / rise - 1e-9));
  const steps = Array.from({ length: count - 1 }, (_, i) => ({
    from: level.halfAngle + (i * tread) / middle,
    to: level.halfAngle + ((i + 1) * tread) / middle,
    top: (level.height * (count - 1 - i)) / count,
  }));
  return { inner, outer, steps };
}

/** The music stand (design 4.5, props). The reader is at +z and faces -z. */
export const MUSIC_STAND = {
  deskWidth: 0.5,
  deskDepth: 0.35,
  /**
   * The highest height of the middle of the desk above the floor, in meters. The desk of each
   * stand comes down from it for its readers ({@link standDeskHeight}).
   */
  deskHeight: 1.05,
  /**
   * The gap from the lowest eye of the readers of a stand down to the top edge of its desk, in
   * meters: the gap of the seated red fox to the highest desk.
   */
  eyeGap: 0.123,
  /**
   * The lowest height of the middle of the desk above the floor, in meters. The desk of the mouse
   * thus stays below its eyes, so that it does not hide the conductor (design 4.5, seat
   * geometry).
   */
  lowestDesk: 0.4,
  /** The tilt of the desk toward the reader. */
  tilt: 30 * MathUtils.DEG2RAD,
  /** The length of each leg of the tripod base. */
  legLength: 0.24,
} as const;

/**
 * Gives the height of the desk of a music stand from the eyes of its readers (design 4.5, props):
 * the top edge of the desk lies {@link MUSIC_STAND} `eyeGap` below the lowest eye, so that the
 * desk never hides the eyes of its players. The middle of the desk stays from `lowestDesk` to
 * `deskHeight`.
 *
 * @param eyes The heights of the eyes of the readers above the floor, in meters.
 * @returns The height of the middle of the desk above the floor, in meters.
 */
export function standDeskHeight(eyes: readonly number[]): number {
  const s = MUSIC_STAND;
  const top = Math.min(...eyes) - s.eyeGap;
  const middle = top - (s.deskDepth / 2) * Math.cos(s.tilt);
  return Math.min(s.deskHeight, Math.max(s.lowestDesk, middle));
}

/** The width of the legs and of the back posts of the chair. */
export const CHAIR_LEG = 0.035;

/**
 * Gives the heights of the chair or of the stool of the harp under a body (design 4.5, props): the
 * seat at the legs of the species, as deep as the chair of the body (design 4.4,
 * `Body.chairDepth`), and wider under a wide body (`chairWidth`).
 *
 * @param species The species of the body.
 * @param legs The height of the seat above the floor, in meters.
 * @returns The heights.
 */
function chairHeights(species: SpeciesParams, legs: number): SeatHeights {
  const animalBody = bodyOf(species.body);
  const depth = animalBody.chairDepth;
  if (depth === null) {
    return { seatHeight: legs };
  }
  const seat = { seatHeight: legs, seatDepth: depth };
  return animalBody.chairWidth === undefined ? seat : { ...seat, seatWidth: animalBody.chairWidth };
}

/**
 * Gives the heights of the piano bench under a body (design 4.5, props): the seat at the legs of
 * the species, and the depth that fits the haunch and the thighs of the body
 * (`Body.benchDepth`), with the front edge of the fit and at least
 * `PIANO_BENCH.bodyDepth` of depth behind it, so the whole haunch sits on the bench.
 *
 * @param species The species of the body.
 * @param legs The height of the seat above the floor, in meters.
 * @returns The heights.
 */
function benchHeights(species: SpeciesParams, legs: number): SeatHeights {
  const animalBody = bodyOf(species.body);
  const seat = { seatHeight: legs };
  if (animalBody.benchDepth === undefined) {
    return seat;
  }
  const depth = Math.max(animalBody.benchDepth, PIANO_BENCH.bodyDepth);
  return { ...seat, seatDepth: depth, seatFront: animalBody.benchDepth / 2 };
}

/**
 * Gives the heights of the seat of a body on a support (design 4.5, props). Each seat fits the
 * legs of the species: its top is the `seatHeight` of the skeleton above the floor, as for the
 * polar bear on its bench (design 4.4). A species with no chair (`SpeciesParams.noChair`) keeps
 * these heights, and the app builds no chair.
 *
 * @param support The support.
 * @param species The species of the body.
 * @returns The heights, or `null` for a standing body.
 */
export function seatHeights(support: Support, species: SpeciesParams): SeatHeights | null {
  const legs = species.seatHeight * species.headHeight;
  switch (support) {
    case 'chair': {
      const seat = chairHeights(species, legs);
      return species.noChair ? { ...seat, noChair: true } : seat;
    }
    case 'stool':
      return chairHeights(species, legs);
    case 'bench':
      return benchHeights(species, legs);
    case 'stand':
    case 'riser':
      return null;
    default: {
      const unhandled: never = support;
      throw new Error(`The support "${String(unhandled)}" is not known.`);
    }
  }
}

/**
 * Gives the boxes of the chair back: the two back legs, which go on up to the top of the back, and
 * the wide top rail (design 4.5). The back keeps its height above the seat. The seat center is
 * above the origin, and the back is at +z.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param seatWidth The width of the seat, in meters (`SeatHeights.seatWidth`).
 * @returns The boxes.
 */
export function chairBack(seatHeight: number, seatWidth: number = CHAIR.seatWidth): Bounds[] {
  const c = CHAIR;
  const top = seatHeight + c.back;
  const x = seatWidth / 2 - CHAIR_LEG / 2;
  const z = c.seatDepth / 2 - CHAIR_LEG / 2;
  return [
    ...[-x, x].map((px) => centeredBox([px, top / 2, z], [CHAIR_LEG, top, CHAIR_LEG])),
    centeredBox([0, top - c.rail / 2, z], [seatWidth - 2 * CHAIR_LEG, c.rail, 0.025]),
  ];
}

/**
 * Gives the box of the chair seat: 0.04 m thick, with its top at the seat height (design 4.5). A
 * shorter seat keeps its back edge, so its front edge is further back.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param seatDepth The depth of the seat, in meters.
 * @param seatWidth The width of the seat, in meters.
 * @returns The box.
 */
export function chairSeat(seatHeight: number, seatDepth: number, seatWidth: number): Bounds {
  const center = (CHAIR.seatDepth - seatDepth) / 2;
  return centeredBox([0, seatHeight - 0.02, center], [seatWidth, 0.04, seatDepth]);
}

/**
 * Adds a box part to a mesh.
 *
 * @param builder The mesh.
 * @param part The box.
 * @param color The color.
 */
function addBox(builder: MeshBuilder, part: Bounds, color: Rgb): void {
  const { min, max } = part;
  builder.add(box(max[0] - min[0], max[1] - min[1], max[2] - min[2]), {
    color,
    at: transform([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
  });
}

/**
 * Builds a chair: a seat, four legs, two back posts, and a wide top rail (design 4.5). The seat
 * center of the chair of design 4.5 is above the origin, and the back is at +z. A shorter seat
 * keeps the back, and its front edge is further back (`Body.chairDepth`). A wider seat keeps
 * its legs and its back posts at its side edges (`Body.chairWidth`).
 *
 * @param seatHeight The height of the seat, in meters.
 * @param seatDepth The depth of the seat, in meters.
 * @param seatWidth The width of the seat, in meters.
 * @returns The mesh data, with all vertices on bone 0.
 */
export function buildChair(
  seatHeight: number,
  seatDepth: number = CHAIR.seatDepth,
  seatWidth: number = CHAIR.seatWidth,
): MeshData {
  const c = { ...CHAIR, seatHeight, seatWidth };
  const builder = new MeshBuilder();
  const color = SCENE_COLORS.chair;
  const x = c.seatWidth / 2 - CHAIR_LEG / 2;
  const center = (c.seatDepth - seatDepth) / 2;
  const z = seatDepth / 2 - CHAIR_LEG / 2 - center;
  addBox(builder, chairSeat(seatHeight, seatDepth, seatWidth), color);
  for (const side of [-1, 1]) {
    // A front leg up to the seat. The back legs are the posts of the back.
    const legHeight = c.seatHeight - 0.04;
    addBox(
      builder,
      centeredBox([side * x, legHeight / 2, -z], [CHAIR_LEG, legHeight, CHAIR_LEG]),
      color,
    );
  }
  for (const part of chairBack(seatHeight, seatWidth)) {
    addBox(builder, part, color);
  }
  return builder.build();
}

/**
 * Builds a music stand: a tripod base, a post, a tilted desk, and a white sheet (design 4.5).
 * The post stands on the origin. The reader is at +z, so the desk faces +z.
 *
 * @param deskHeight The height of the middle of the desk above the floor, in meters
 *   ({@link standDeskHeight}).
 * @returns The mesh data, with all vertices on bone 0.
 */
export function buildMusicStand(deskHeight: number = MUSIC_STAND.deskHeight): MeshData {
  const s = { ...MUSIC_STAND, deskHeight };
  const builder = new MeshBuilder();
  const color = SCENE_COLORS.stand;
  for (let i = 0; i < 3; i++) {
    const turn = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      (i * 120 + 60) * MathUtils.DEG2RAD,
    );
    const center = new Vector3(0, 0, s.legLength / 2)
      .applyQuaternion(turn)
      .add(new Vector3(0, 0.05, 0));
    // Each leg leans 20° down from the post to the floor.
    const leanAxis = new Vector3(1, 0, 0).applyQuaternion(turn).normalize();
    const lean = new Quaternion().setFromAxisAngle(leanAxis, 20 * MathUtils.DEG2RAD);
    builder.add(box(0.015, 0.015, s.legLength), {
      color,
      at: transform(toVec3(center), toQuat(lean.multiply(turn))),
    });
  }
  builder.add(box(0.02, s.deskHeight, 0.02), { color, at: transform([0, s.deskHeight / 2, 0]) });
  // The desk is a vertical plate that leans back by the tilt, so that its face points to the reader.
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -s.tilt);
  const deskCenter = new Vector3(0, s.deskHeight, 0);
  addDesk(
    builder,
    box(s.deskWidth, s.deskDepth, 0.012),
    transform(toVec3(deskCenter), toQuat(tilt)),
  );
  // The sheet is one quad a little in front of the desk.
  const [a, b, c, d] = standSheetCorners(s.deskHeight);
  builder.add(quad(a, b, c, d), { color: SCENE_COLORS.sheet });
  return builder.build();
}

/**
 * Gives the corners of a sheet on a tilted desk (design 4.5): at the lower left, the lower right,
 * the upper right, and the upper left, as the reader at +z sees the sheet. The scene draws the
 * staff lines of a sheet in these axes.
 *
 * @param deskCenter The middle of the desk.
 * @param tilt The tilt of the desk toward the reader.
 * @param sheet The middle of the sheet in the axes of the desk, and its half width and half height.
 * @returns The four corners.
 */
export function deskSheetCorners(
  deskCenter: Vec3,
  tilt: number,
  sheet: { readonly middle: Vec3; readonly halfWidth: number; readonly halfHeight: number },
): [Vec3, Vec3, Vec3, Vec3] {
  const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt);
  const [mx, my, mz] = sheet.middle;
  const w = sheet.halfWidth;
  const h = sheet.halfHeight;
  const corner = (x: number, y: number): Vec3 =>
    toVec3(new Vector3(mx + x, my + y, mz).applyQuaternion(turn).add(new Vector3(...deskCenter)));
  return [corner(-w, -h), corner(w, -h), corner(w, h), corner(-w, h)];
}

/**
 * Gives the corners of the sheet of a music stand in the axes of the stand: a quad 7.5 mm in
 * front of the desk ({@link deskSheetCorners}).
 *
 * @param deskHeight The height of the middle of the desk above the floor, in meters.
 * @returns The four corners.
 */
export function standSheetCorners(deskHeight: number): [Vec3, Vec3, Vec3, Vec3] {
  const s = MUSIC_STAND;
  return deskSheetCorners([0, deskHeight, 0], s.tilt, {
    middle: [0, 0, 0.0075],
    halfWidth: s.deskWidth / 2 - 0.04,
    halfHeight: s.deskDepth / 2 - 0.04,
  });
}

/**
 * Adds the desk of a stand (design 4.5): its two large faces in a dark warm gray, and its four
 * narrow faces in a lighter color, so that the desk reads as an object with an edge.
 *
 * @param builder The builder.
 * @param plate The corner list of the desk plate, with its large faces along z.
 * @param at The place of the desk.
 */
export function addDesk(builder: MeshBuilder, plate: readonly number[], at: Transform): void {
  const [front, rest] = splitByFacing(plate, [0, 0, 1], 0.99);
  const [back, edges] = splitByFacing(rest, [0, 0, -1], 0.99);
  builder.add([...front, ...back], { color: SCENE_COLORS.standDesk, at });
  builder.add(edges, { color: SCENE_COLORS.standEdge, at });
}

/**
 * Builds the stool of the harp: four legs and no back (design 4.5). The seat center is above the
 * origin. Under a body, the seat has the width and the depth of the seat of the chair of
 * the body (`SeatHeights.seatWidth`, `seatDepth`), with its back at the back of the chair and its
 * legs at its corners, so that the knees, the shins, and the hooves stay out of it.
 *
 * @param seat The heights of the seat.
 * @returns The mesh data, with all vertices on bone 0.
 */
export function buildStool(seat: SeatHeights): MeshData {
  const { seatHeight } = seat;
  const width = seat.seatWidth ?? STOOL.seatSize;
  const depth = seat.seatDepth ?? STOOL.seatSize;
  // A seat as deep as the seat of a body keeps the back of the chair, as the chair does
  // (`chairSeat()`): its front edge ends where the thighs leave it, behind the knees and the shins.
  const center = seat.seatDepth === undefined ? 0 : (CHAIR.seatDepth - depth) / 2;
  const builder = new MeshBuilder();
  const color = SCENE_COLORS.chair;
  addBox(builder, centeredBox([0, seatHeight - 0.02, center], [width, 0.04, depth]), color);
  const legHeight = seatHeight - 0.04;
  const atX = width / 2 - CHAIR_LEG / 2;
  const atZ = depth / 2 - CHAIR_LEG / 2;
  for (const x of [-atX, atX]) {
    for (const z of [center - atZ, center + atZ]) {
      addBox(builder, centeredBox([x, legHeight / 2, z], [CHAIR_LEG, legHeight, CHAIR_LEG]), color);
    }
  }
  return builder.build();
}

/**
 * Builds the seat of a player: the chair, the stool, or the piano bench. The seat
 * center is above the origin, and the player sits on it and faces -z. A species with no chair
 * (`SeatHeights.noChair`) gets no chair.
 *
 * @param support The support of the player.
 * @param seat The heights of the seat ({@link seatHeights}), or `null` for a standing player.
 * @returns The mesh data, or `null` for a standing player or a body with no chair.
 */
export function buildSupport(support: Support, seat: SeatHeights | null): MeshData | null {
  if (!seat) {
    return null;
  }

  switch (support) {
    case 'chair':
      return seat.noChair ? null : buildChair(seat.seatHeight, seat.seatDepth, seat.seatWidth);
    case 'stool':
      return buildStool(seat);
    case 'bench':
      return buildPianoBench(seat.seatHeight, seat.seatDepth, seat.seatFront);
    case 'stand':
    case 'riser':
      return null;
    default: {
      const unhandled: never = support;
      throw new Error(`The support "${String(unhandled)}" is not known.`);
    }
  }
}

/** The largest angle of one face of a riser arc. */
const RISER_FACET = 5 * MathUtils.DEG2RAD;

/** The width of the dark line between two boards of a tread, as between two planks of the stage. */
const PLANK_LINE = 0.012;

/**
 * The width of the groove at each joint of the arc faces of a skirt face of the risers, as the
 * grooves between the panels of the stage skirt.
 */
const RISER_GROOVE = 0.03;

/**
 * Gives a point at a distance and an angle from the podium center, on the arcs of the risers.
 *
 * @param podium The podium center, the center of the arcs.
 * @param r The distance from the podium center, in meters.
 * @param angle The angle, in radians. 0 points to the back, and the left is negative.
 * @param y The height above the stage top, in meters.
 * @returns The point.
 */
function arcPoint(podium: Vec3, r: number, angle: number, y: number): Vec3 {
  return [podium[0] + r * Math.sin(angle), podium[1] + y, podium[2] - r * Math.cos(angle)];
}

/**
 * Adds one flat face of four corners. The front of the face points away from a point in its
 * solid, so the order of the corners does not matter.
 *
 * @param builder The builder.
 * @param corners The corners, in order around the face.
 * @param inside A point in the solid of the face.
 * @param color The color.
 */
function addFace(
  builder: MeshBuilder,
  corners: readonly [Vec3, Vec3, Vec3, Vec3],
  inside: Vec3,
  color: Rgb,
): void {
  const [a, b, c, d] = corners;
  const start = new Vector3(...a);
  const normal = new Vector3(...b).sub(start).cross(new Vector3(...c).sub(start));
  const out = start
    .add(new Vector3(...c))
    .multiplyScalar(0.5)
    .sub(new Vector3(...inside));
  builder.add(normal.dot(out) >= 0 ? quad(a, b, c, d) : quad(d, c, b, a), { color });
}

/**
 * Adds one level of the choir risers (design 4.5): the tread with its boards, the nosing lip at
 * its front, the face under the lip, and the two end panels. The face under the lip of a higher
 * level is a riser face of wood from the tread in front of it. The lowest level has a dark skirt
 * face of panels from the stage top, and only the top level has a back face of panels, because
 * each other back face stands against the next level.
 *
 * @param builder The builder.
 * @param level The level.
 * @param below The height of the level in front of it, or 0 for the lowest level.
 * @param top True for the top level.
 * @param stair The stair at the side ends of the lowest level, or `null` for the other levels.
 * @param podium The podium center, the center of the arcs.
 */
function addRiserLevel(
  builder: MeshBuilder,
  level: RiserLevel,
  below: number,
  top: boolean,
  stair: RiserStair | null,
  podium: Vec3,
): void {
  const { radius, height, halfAngle } = level;
  const inner = radius - RISER.depth / 2;
  const outer = radius + RISER.depth / 2;
  const front = inner - RISER.lip.overhang;
  const under = height - RISER.lip.height;
  const at = (r: number, angle: number, y: number): Vec3 => arcPoint(podium, r, angle, y);
  const segments = Math.max(1, Math.ceil((2 * halfAngle) / RISER_FACET));
  for (let i = 0; i < segments; i++) {
    const a0 = -halfAngle + (2 * halfAngle * i) / segments;
    const a1 = -halfAngle + (2 * halfAngle * (i + 1)) / segments;
    const body = at(radius, (a0 + a1) / 2, height / 2);
    const lip = at((front + inner) / 2, (a0 + a1) / 2, height - RISER.lip.height / 2);
    for (const [near, far, color] of treadBands(front, outer)) {
      const tread = [
        at(near, a0, height),
        at(near, a1, height),
        at(far, a1, height),
        at(far, a0, height),
      ] as const;
      addFace(builder, tread, body, color);
    }
    const lipFront = [at(front, a0, under), at(front, a1, under), at(front, a1, height)] as const;
    addFace(builder, [...lipFront, at(front, a0, height)], lip, STAGE_COLORS.riserNosing);
    const lipUnder = [at(front, a0, under), at(inner, a0, under), at(inner, a1, under)] as const;
    addFace(builder, [...lipUnder, at(front, a1, under)], lip, STAGE_COLORS.riserNosing);
    // A skirt face of the lowest level or of the back has a groove at the end of each panel.
    const skirt = (r: number, y: number): void => {
      const cut = i < segments - 1 ? a1 - RISER_GROOVE / r : a1;
      const panel = [at(r, a0, 0), at(r, cut, 0), at(r, cut, y)] as const;
      addFace(builder, [...panel, at(r, a0, y)], body, STAGE_COLORS.skirt);
      if (cut < a1) {
        const groove = [at(r, cut, 0), at(r, a1, 0), at(r, a1, y)] as const;
        addFace(builder, [...groove, at(r, cut, y)], body, STAGE_COLORS.groove);
      }
    };
    if (below > 0) {
      const face = [at(inner, a0, below), at(inner, a1, below), at(inner, a1, under)] as const;
      addFace(builder, [...face, at(inner, a0, under)], body, STAGE_COLORS.podiumPanel);
    } else {
      skirt(inner, under);
    }
    if (top) {
      skirt(outer, height);
    }
  }
  // A point at the angle 0 is on the inner side of each end.
  const body = at(radius, 0, height / 2);
  // Over the highest step of a stair, the end is a riser face, as the face between two steps.
  const step = stair?.steps[0];
  const split = stair && step ? stair.outer : inner;
  for (const end of [-halfAngle, halfAngle]) {
    const endFace = (r0: number, r1: number, y0: number, y1: number) =>
      [at(r0, end, y0), at(r1, end, y0), at(r1, end, y1), at(r0, end, y1)] as const;
    if (step) {
      addFace(builder, endFace(inner, split, step.top, under), body, STAGE_COLORS.podiumPanel);
      addFace(builder, endFace(inner, split, under, height), body, STAGE_COLORS.riserNosing);
    }
    addFace(builder, endFace(split, outer, 0, height), body, STAGE_COLORS.skirt);
    const lipEnd = [at(front, end, under), at(inner, end, under), at(inner, end, height)] as const;
    addFace(builder, [...lipEnd, at(front, end, height)], body, STAGE_COLORS.riserNosing);
  }
}

/**
 * Gives the bands of the top of a tread from its front to its back: the lighter edge, then boards
 * of at most {@link RISER}.board with a dark line between two boards.
 *
 * @param inner The distance of the front of the tread from the podium center.
 * @param outer The distance of the back of the tread from the podium center.
 * @returns The bands: the start, the end, and the color.
 */
function treadBands(inner: number, outer: number): [number, number, Rgb][] {
  const line = PLANK_LINE / 2;
  const bands: [number, number, Rgb][] = [[inner, inner + RISER.nosing, STAGE_COLORS.riserNosing]];
  const start = inner + RISER.nosing;
  const boards = Math.ceil((outer - start) / RISER.board - 1e-9);
  const width = (outer - start) / boards;
  for (let i = 0; i < boards; i++) {
    const from = start + i * width + (i > 0 ? line : 0);
    const to = start + (i + 1) * width - (i < boards - 1 ? line : 0);
    bands.push([from, to, STAGE_COLORS.riserTread]);
    if (i < boards - 1) {
      bands.push([to, to + 2 * line, STAGE_COLORS.seam]);
    }
  }
  return bands;
}

/**
 * Adds the curved stair at each side end of the lowest level of the risers ({@link riserStair},
 * design 4.5). Each step has a tread with a lighter nosing at its far end, a riser face of wood
 * with a lighter top edge, and dark skirt faces at the front and the back, as the level.
 *
 * @param builder The builder.
 * @param stair The stair of the right end.
 * @param podium The podium center, the center of the arcs.
 */
function addRiserStairs(builder: MeshBuilder, stair: RiserStair, podium: Vec3): void {
  const { inner, outer, steps } = stair;
  const nosing = RISER.nosing / ((inner + outer) / 2);
  for (const side of [-1, 1]) {
    const at = (r: number, angle: number, y: number): Vec3 => arcPoint(podium, r, side * angle, y);
    steps.forEach(({ from, to, top }, i) => {
      const below = steps[i + 1]?.top ?? 0;
      const under = top - RISER.lip.height;
      const edge = to - nosing;
      const body = at((inner + outer) / 2, (from + to) / 2, top / 2);
      const across = (a0: number, a1: number, y: number) =>
        [at(inner, a0, y), at(outer, a0, y), at(outer, a1, y), at(inner, a1, y)] as const;
      const up = (angle: number, y0: number, y1: number) =>
        [
          at(inner, angle, y0),
          at(outer, angle, y0),
          at(outer, angle, y1),
          at(inner, angle, y1),
        ] as const;
      const along = (r: number) =>
        [at(r, from, 0), at(r, to, 0), at(r, to, top), at(r, from, top)] as const;
      addFace(builder, across(from, edge, top), body, STAGE_COLORS.riserTread);
      addFace(builder, across(edge, to, top), body, STAGE_COLORS.riserNosing);
      addFace(builder, up(to, below, under), body, STAGE_COLORS.podiumPanel);
      addFace(builder, up(to, under, top), body, STAGE_COLORS.riserNosing);
      addFace(builder, along(inner), body, STAGE_COLORS.skirt);
      addFace(builder, along(outer), body, STAGE_COLORS.skirt);
    });
  }
}

/**
 * Builds the choir risers: one arc block for each level, from the stage top to the height of the
 * level, and a curved stair at each side end of the lowest level (design 4.5). Each tread has a
 * lighter nosing lip at its front and boards of a wood a little lighter than the stage top. A riser face of a
 * darker wood joins two levels, and the faces down to the stage top have the color of the stage
 * sides, as the wooden risers of `orchestra-latest.png` and `orchestra-side.png`.
 *
 * @param levels The levels of the layout, from the lowest level.
 * @param podium The podium center, the center of the arcs.
 * @returns The mesh data in the stage axes, with all vertices on bone 0.
 */
export function buildRisers(levels: readonly RiserLevel[], podium: Vec3): MeshData {
  const builder = new MeshBuilder();
  const [lowest] = levels;
  const stair = lowest ? riserStair(lowest) : null;
  levels.forEach((riser, k) => {
    const below = levels[k - 1]?.height ?? 0;
    addRiserLevel(builder, riser, below, k === levels.length - 1, k === 0 ? stair : null, podium);
  });
  if (stair) {
    addRiserStairs(builder, stair, podium);
  }
  return builder.build();
}

/**
 * Builds the static props of a layout as one mesh: the seat of each player, each music stand,
 * and the choir risers (design 4.4). Each kind of seat at each height and depth and each stand at
 * each desk height is built one time.
 *
 * @param layout The layout of a score.
 * @returns The mesh data in the stage axes, with all vertices on bone 0.
 */
export function buildSceneProps(layout: SceneLayout): MeshData {
  const builder = new MeshBuilder();
  const seats = new Map<string, MeshData | null>();
  const place = (position: Vec3, facing: number): Transform =>
    transform(position, toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), facing)));
  for (const player of layout.players) {
    const { support, species } = player.cast;
    const heights = seatHeights(support, SPECIES[species]);
    const key = [
      support,
      heights?.seatHeight,
      heights?.seatDepth,
      heights?.seatFront,
      heights?.seatWidth,
      heights?.noChair,
    ].join(' ');
    if (!seats.has(key)) {
      seats.set(key, buildSupport(support, heights));
    }
    const seat = seats.get(key);
    if (seat) {
      builder.addMesh(seat, place(player.position, player.facing));
    }
  }
  const stands = new Map<number, MeshData>();
  for (const at of layout.stands) {
    const stand = stands.get(at.deskHeight) ?? buildMusicStand(at.deskHeight);
    stands.set(at.deskHeight, stand);
    builder.addMesh(stand, place(at.position, at.facing));
  }
  if (layout.risers.length > 0) {
    builder.addMesh(buildRisers(layout.risers, layout.podium), transform());
  }
  return builder.build();
}
