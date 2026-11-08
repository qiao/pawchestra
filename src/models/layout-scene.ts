import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';
import type { Score, Seat } from '../score/types.ts';
import { castScore, chamberFormOf, CONDUCTOR } from './cast.ts';
import type { ChamberForm, PlayerCast, PlayingSection } from './cast.ts';
import { centeredBox } from './bounds.ts';
import {
  boxCorners,
  footprintOf,
  obstacleOf,
  obstaclesTouch,
  placeFootprint,
  playerFootprint,
  reachOn,
  standFootprint,
} from './footprint.ts';
import type { Footprint, Obstacle, PlacedBox } from './footprint.ts';
import { FIRST_ROW_RADIUS, SEATED_ARC, STAND_DISTANCE, seatAt } from './layout.ts';
import type {
  ConductorPlace,
  PlayerPlace,
  RiserLevel,
  RowRiser,
  SceneLayout,
  StandPlace,
} from './layout.ts';
import type { Vec3 } from './tuples.ts';
import { ModelCache } from './model-cache.ts';
import type { PlayerModel } from './player.ts';
import { RISER, riserStepsDepth, standDeskHeight } from './props.ts';
import { boneIndex } from './rig.ts';
import { CONDUCTOR_STAND, PODIUM_FROM_FRONT, PODIUM_SIZE, keepsStageMargin } from './stage.ts';
import { pieceBounds } from './instruments/piece.ts';

/** The arc length of one singer on the risers (design 4.5, seat geometry). */
const SINGER_ARC = 0.6;

/**
 * The arc length of one vocal soloist (design 3.8, 4.5). The soloists stand on the lowest level
 * of the risers, in front of the choir, with space between them, so that they read as soloists.
 */
const VOCAL_SOLOIST_ARC = 1.2;

/** The smallest radius step from one row to the next (design 4.5, seat geometry). */
export const ROW_STEP = 1.2;

/** The largest angle of one side of a row: half of 160° (design 4.5, seat geometry). */
const HALF_SPAN = (80 * Math.PI) / 180;

/**
 * The smallest free space between the footprints of two items of the scene, in meters: two
 * players, a player and a stand, or two rows.
 */
export const FOOTPRINT_GAP = 0.05;

/**
 * The smallest free space between the footprint of a piano case and the footprint of a player in
 * a row behind it, in meters (design 4.5, seat geometry). A footprint is the bind pose, and a
 * player behind the case faces it and reaches toward it in play. With the gap of 0.05 m, the bow
 * arm of the hippo contrabass of `bach-bwv1050` touched the curved side of the case. With 0.15 m,
 * the nearest part keeps 14 cm through the whole song.
 */
const PIANO_REACH_GAP = 0.15;

/**
 * The risers of the instrumental rows (design 4.5, seat geometry). The eyes of the conductor are
 * only about 0.1 m above the tops of the heads of the seated strings, so a row behind the strings
 * sees the conductor only through a gap between two heads, or from a riser. The strings sit on
 * the stage top, as in a real orchestra.
 */
const ROW_RISER = {
  /** The first row that can stand on a riser: row 2, the first row behind the strings. */
  firstRow: 2,
  /** The step of the height of a riser, in meters. */
  step: 0.1,
  /** The largest height of a riser of rows 2 and 3, in meters. */
  highest: 1.2,
  /**
   * The largest height of a riser of the back row (row 4), in meters: a step above the winds,
   * because a real hall puts the percussion on its highest riser.
   */
  backHighest: 1.4,
  /** The edge of a riser in front of the stands of its row and at its ends, in meters. */
  lip: 0.05,
} as const;

/**
 * Gives the largest height of a riser of a row ({@link ROW_RISER}).
 *
 * @param row The index of the row in {@link ROWS}.
 * @returns The height, in meters.
 */
function riserTop(row: number): number {
  return row >= ROWS.length - 1 ? ROW_RISER.backHighest : ROW_RISER.highest;
}

/**
 * The points of the conductor that each player sees (design 4.5, seat geometry), relative to the
 * point on the podium top under the bear, in the axes of the bear, which faces the players (-z).
 * They cover the parts of the posed conductor that the `sight-lines` probe measures over the song:
 * the head from 1.1 m to 1.5 m above the podium top and 0.2 m to each side, with its front and
 * its back; the right paw with the baton at 0.3 m to 0.6 m to the right and 1.2 m to 1.4 m high,
 * with the baton to 0.6 m in front of the bear; and the left paw.
 */
const CONDUCTOR_SIGHT = {
  /** The grid of the head points: the x values, the heights, and the z values, in meters. */
  head: [
    [-0.2, 0, 0.2],
    [1.15, 1.45],
    [-0.3, 0.02],
  ],
  /** The points of the right paw and the baton: x, the height above the podium top, and z. */
  baton: [
    [0.34, 1.2, -0.22],
    [0.42, 1.2, -0.22],
    [0.5, 1.2, -0.22],
    [0.34, 1.3, -0.22],
    [0.42, 1.3, -0.22],
    [0.5, 1.3, -0.22],
    [0.4, 1.3, -0.45],
    [0.4, 1.4, -0.6],
  ],
  /** The points of the left paw. */
  cue: [
    [-0.5, 1.09, -0.3],
    [-0.34, 1.09, -0.3],
    [-0.5, 1.28, -0.3],
    [-0.34, 1.28, -0.3],
  ],
  /**
   * The largest move of a player along its row off its spread angle, in radians: 15°, about half
   * the angle between two players of the first row, so that a back desk can sit in the gaps.
   */
  nudge: (15 * Math.PI) / 180,
  /** The step of the move, in radians: 1°. */
  nudgeStep: Math.PI / 180,
} as const;

/** The step by which a row, a stand, or a seat arc grows until it is clear, in meters. */
const CLEAR_STEP = 0.02;

/** The room for the chair and the margin at the edge of the stage (design 4.5, stage origin). */
const CHAIR_ROOM = 0.5;
const EDGE_MARGIN = 0.3;

/** The smallest stage side (design 4.5, stage origin). */
const SMALLEST_STAGE = 5;

/**
 * The place of the piano case center from the podium center: 2.0 m to the left and 0.8 m to the
 * front (design 4.5, seat geometry).
 */
const PIANO_CENTER = [-2.0, 0.8] as const;

/** The facing of the pianist: +x, toward the conductor (design 4.5, seat geometry). */
const PIANIST_FACING = -Math.PI / 2;

/**
 * The turn of a keyboard of the orchestra from the facing of its row: a quarter turn to the
 * left, so that the pianist faces along the arc toward the middle of the stage, and the case
 * lies along the row (design 4.5, seat geometry). At 0°, the keyboard thus has the facing of the
 * piano of a concerto: the pianist faces +x, and the lid opens to the audience. Facing the
 * podium, the case of 2.3 m with the bench pushed its row 2 m back.
 */
const KEYBOARD_TURN = Math.PI / 2;

/**
 * The place of a soloist that does not play the piano, from the podium center: 1.75 m to the
 * left and 0.35 m to the front (design 4.5, seat geometry). It is the front left of the
 * conductor, as in a concerto. The default view and the wide views then see the heads, the arms,
 * and the violins of the first desk beside the soloist: the K. 315 flute hides at most 8.9% of
 * a first-desk player, and 4.4% of its head, arms, and violin. With the wider cute heads, the place
 * of 1.8 m and 0.3 m hid 10% of the first violin. At 0.05 m to the front, it hid 17% of a
 * first-desk player in the default view. At 1.4 m to the left, the body of the bear stood in the
 * frame of the solo shots of the flute.
 */
export const SOLOIST_PLACE = [-1.75, 0.35] as const;

/**
 * The facing of a soloist that does not play the piano: the audience, turned 40° to the
 * conductor (design 4.5, seat geometry). Thus the default view sees the face of the soloist, and
 * the soloist sees the conductor at the side. With a turn of 30° at this place, the middle of
 * the bear stood 1% of the half width outside the frame of a solo shot of the K. 315 flute.
 */
export const SOLOIST_FACING = Math.PI + (40 * Math.PI) / 180;

/**
 * The values of the layout of a chamber group (design 4.2, 4.5). A score with at most 5 players
 * has no conductor and no podium, and its players sit in a small arc at the stage center and face
 * each other a little.
 */
export const CHAMBER = {
  /**
   * The smallest radius of the arc, in meters: the radius of row 0 of an orchestra. Thus two
   * players turn about 12° to each other, and a string quartet about 50° at its ends.
   */
  radius: FIRST_ROW_RADIUS,
  /**
   * The largest angle of a player from the middle of the arc: 60°. A larger arc moves back. Thus
   * the players at the ends of a quintet still show three quarters of their faces to the front.
   */
  halfSpan: (60 * Math.PI) / 180,
  /**
   * The partner of a pianist in a recital stands this far from the middle of the case toward its
   * tail, in front of the curved side of the case: the crook of the piano.
   */
  crook: 0.45,
  /**
   * The turn of the partner of a pianist in a recital from the audience to the pianist: 25°. The
   * partner and the pianist then see each other, and the audience sees the face of the partner.
   */
  turn: (25 * Math.PI) / 180,
} as const;

/** The facing of a player alone at the stage center: the audience (+z). */
const AUDIENCE_FACING = Math.PI;

/** The largest angle of one box of a riser arc, for the overlap check. */
const RISER_BOX_ANGLE = (5 * Math.PI) / 180;

/** How the players of a section use music stands (design 4.5, seat geometry). */
type StandUse = 'shared' | 'own' | 'none';

/** The string sections that sit in desks: the first desk in row 0, the other desks in row 1. */
type DeskSection = 'violin-1' | 'violin-2' | 'viola' | 'cello';

/**
 * The groups of the rows: the sections, the first violin seat, the other violin seats, and the
 * desks after the first desk of a string seat (the suffix `-b`). The soloist of the score
 * (design 3.8) has no row. The vocal soloists stand on the lowest level of the risers.
 */
type RowGroup = PlayingSection | DeskSection | `${DeskSection}-b` | 'soloist' | 'vocal-soloists';

/**
 * The rows of the orchestra, from the front, with their sections from left to right (design
 * 4.5, seat geometry). It is the American seating with the contrabasses in a line at the back.
 * A keyboard of the orchestra (the celesta, the harpsichord, or a piano that is not the soloist)
 * sits at the left of the harp, behind the violins, as in a professional orchestra.
 */
const ROWS: readonly (readonly RowGroup[])[] = [
  ['violin-1', 'violin-2', 'viola', 'cello'],
  ['violin-1-b', 'violin-2-b', 'viola-b', 'cello-b'],
  ['piano', 'harp', 'flute', 'oboe'],
  ['horn', 'clarinet', 'bassoon', 'trumpet'],
  ['percussion', 'contrabass', 'timpani', 'trombone', 'tuba'],
];

/**
 * The order of the players in the arc of a chamber group, from left to right (design 4.5, seat
 * geometry). A keyboard sits at the left end and faces along the arc, as a keyboard of the
 * orchestra does. The other players follow the order of the rows, and the desks of a string seat
 * stay together. Thus a string quartet sits from the first violin on the left to the cello on the
 * right, as the classic quartet half circle.
 */
const CHAMBER_ORDER: readonly RowGroup[] = [
  'piano',
  'violin-1',
  'violin-1-b',
  'violin-2',
  'violin-2-b',
  'viola',
  'viola-b',
  'cello',
  'cello-b',
  'harp',
  'flute',
  'oboe',
  'horn',
  'clarinet',
  'bassoon',
  'trumpet',
  'percussion',
  'contrabass',
  'timpani',
  'trombone',
  'tuba',
  'choir',
];

/** Rows 0 and 1 put the violins to the left of 0° and the other strings to the right. */
const SPLIT_ROWS = 2;

/** The players of a desk: two players share one stand (design 4.5, seat geometry). */
const DESK_SIZE = 2;

/** The stands of each section: strings share one for two players, and winds have one each. */
const STAND_USE = {
  violin: 'shared',
  viola: 'shared',
  cello: 'shared',
  contrabass: 'shared',
  harp: 'none',
  piano: 'none',
  flute: 'own',
  oboe: 'own',
  clarinet: 'own',
  bassoon: 'own',
  horn: 'own',
  trumpet: 'own',
  trombone: 'own',
  tuba: 'own',
  timpani: 'none',
  percussion: 'none',
  choir: 'none',
} as const satisfies Readonly<Record<PlayingSection, StandUse>>;

/** One player that the layout places. */
interface Member {
  /** The index of the player in the cast and in `SceneLayout.players`. */
  readonly index: number;
  readonly cast: PlayerCast;
  /** The model of the player, from the model cache of the score. */
  readonly model: PlayerModel;
  /** The footprint in the axes of the row: the footprint of the model after {@link turn}. */
  readonly footprint: Footprint;
  /** The turn of the player from the facing of its row, in radians: 0, or a quarter turn. */
  readonly turn: number;
  /** The smallest arc of the player: 0.95 m, or 0.6 m for a singer. */
  readonly arc: number;
  readonly stand: StandUse;
  /**
   * The height of the lower eye of the model above the floor, in meters. The desk of each stand
   * that the player reads stays below it ({@link standDeskHeight}).
   */
  readonly eye: number;
  /**
   * The middle of the two eye bones in the model axes, in the bind pose. The sight lines to the
   * conductor start here (design 4.5, seat geometry).
   */
  readonly sight: Vec3;
  /** The distance of its own stand in front of the player, in meters. */
  readonly standDistance: number;
  /** True for a violinist. The first violins sit to the left of 0° in row 0. */
  readonly violin: boolean;
}

/** A player or a stand with its place, relative to the podium center. */
interface Placed<T> {
  readonly place: T;
  readonly obstacle: Obstacle;
}

/** A placed player, with its index in `SceneLayout.players`. */
type PlacedPlayer = Placed<PlayerPlace> & { readonly index: number };

/** A placed stand, with the player that has it as its own stand, or -1 for a shared stand. */
type PlacedStand = Placed<StandPlace> & { readonly owner: number };

/** The players and the stands of one row at one radius. */
interface RowPlacement {
  readonly players: readonly PlacedPlayer[];
  readonly stands: readonly PlacedStand[];
}

/** The podium center: the origin of a layout before the stage size moves it. */
const CENTER: Vec3 = [0, 0, 0];

/**
 * Makes the obstacle of a player with its instrument and its seat.
 *
 * @param cast The cast of the player, for the label.
 * @param footprint The footprint of the player.
 * @param position The place of the player.
 * @param facing The facing of the footprint.
 * @returns The obstacle.
 */
function playerObstacle(
  cast: PlayerCast,
  footprint: Footprint,
  position: Vec3,
  facing: number,
): Obstacle {
  const { species, instrument, seatIndex, player } = cast;
  return obstacleOf(
    `${species} ${instrument} (seat ${seatIndex}, player ${player})`,
    placeFootprint(footprint, position, facing),
  );
}

/**
 * Places a player at a point.
 *
 * @param member The player.
 * @param position The place of the player.
 * @param facing The facing of the player.
 * @param boxFacing The facing of the footprint, which {@link Member.turn} already turned.
 * @returns The place and the obstacle.
 */
function placeAt(member: Member, position: Vec3, facing: number, boxFacing = facing): PlacedPlayer {
  const obstacle = playerObstacle(member.cast, member.footprint, position, boxFacing);
  meshPlaces.set(obstacle, {
    model: member.model,
    position,
    cos: Math.cos(facing),
    sin: Math.sin(facing),
  });
  return {
    index: member.index,
    place: { position, facing, cast: member.cast },
    obstacle,
  };
}

/**
 * Places a player at an angle and a radius around the podium center.
 *
 * @param member The player.
 * @param angle The angle. 0 points to the back, and negative angles are on the left.
 * @param radius The radius.
 * @param height The height of the floor under the player.
 * @returns The place and the obstacle.
 */
function placePlayer(member: Member, angle: number, radius: number, height = 0): PlacedPlayer {
  const spot = seatAt(CENTER, angle, radius);
  const position: Vec3 = [spot.position[0], height, spot.position[2]];
  return placeAt(member, position, spot.facing + member.turn, spot.facing);
}

/**
 * Places a music stand in front of a row. Its readers face the podium, and so does the stand. Its
 * desk stays below the eyes of its readers ({@link standDeskHeight}).
 *
 * @param angle The angle of the stand.
 * @param distance The radius of the stand.
 * @param owner The index of the player that has it as its own stand, or -1.
 * @param readers The players who read from the stand.
 * @param height The height of the floor under the stand: the riser of its row, or 0.
 * @returns The place and the obstacle.
 */
function placeStand(
  angle: number,
  distance: number,
  owner: number,
  readers: readonly Member[],
  height = 0,
): PlacedStand {
  const spot = seatAt(CENTER, angle, distance);
  const position: Vec3 = [spot.position[0], height, spot.position[2]];
  const deskHeight = standDeskHeight(readers.map((reader) => reader.eye));
  return {
    owner,
    place: { position, facing: spot.facing, deskHeight },
    obstacle: obstacleOf(
      `stand at ${((angle * 180) / Math.PI).toFixed(1)}°`,
      placeFootprint(standFootprint(deskHeight), position, spot.facing),
    ),
  };
}

/**
 * Calculates the distance of the own stand of a wind player: 0.65 m in front of the player, or
 * further until the stand keeps the gap to the player and its instrument.
 *
 * @param footprint The footprint of the player.
 * @param deskHeight The height of the middle of the desk of the stand, in meters.
 * @returns The distance, in meters.
 */
function ownStandDistance(footprint: Footprint, deskHeight: number): number {
  const player = obstacleOf('player', placeFootprint(footprint, CENTER, 0));
  const desk = standFootprint(deskHeight);
  let distance = STAND_DISTANCE;
  for (;;) {
    // In the model axes, the player faces -z, and the stand faces the player.
    const stand = obstacleOf('stand', placeFootprint(desk, [0, 0, -distance], 0));
    if (!obstaclesTouch(player, stand, FOOTPRINT_GAP)) {
      return distance;
    }
    distance += CLEAR_STEP;
  }
}

/**
 * Finds if the next player in a row shares the stand of a string player. The players of a
 * string seat share one stand for each two: the players 0 and 1, then 2 and 3.
 */
function sharesWith(member: Member, next: Member | undefined): boolean {
  return (
    member.stand === 'shared' &&
    member.cast.player % 2 === 0 &&
    next?.cast.seatIndex === member.cast.seatIndex
  );
}

/**
 * Finds if a string player has no partner for its stand: the last player of a seat with an odd
 * count.
 */
function standsAlone(member: Member, next: Member | undefined): boolean {
  return member.stand === 'shared' && member.cast.player % 2 === 0 && !sharesWith(member, next);
}

/**
 * Calculates the arc from the seat center of one player to the next in a row. It is at least the
 * mean of their two smallest arcs. It grows until the two players, their own stands, and the
 * stand between them keep the gap (design 4.5). The stands also keep the gap from each other,
 * with the stand of the right player that it shares with its partner, or that stands where a
 * partner would share it.
 *
 * @param left The player on the left, as the audience sees it.
 * @param right The player on the right.
 * @param radius The radius of the row.
 * @returns The arc, in meters.
 */
function* spacingSteps(left: Member, right: Member, radius: number): Steps<number> {
  // The players face the podium, so the left neighbor is on the right side (+x) of a player.
  let arc = Math.max(
    (left.arc + right.arc) / 2,
    -left.footprint.bounds.min[0] + right.footprint.bounds.max[0] + FOOTPRINT_GAP,
  );
  for (;;) {
    const angle = arc / radius;
    const a = placePlayer(left, 0, radius);
    const b = placePlayer(right, angle, radius);
    const stands: PlacedStand[] = [];
    if (left.stand === 'own') {
      stands.push(placeStand(0, radius - left.standDistance, left.index, [left]));
    }
    if (right.stand === 'own') {
      stands.push(placeStand(angle, radius - right.standDistance, right.index, [right]));
    }
    if (sharesWith(left, right)) {
      stands.push(placeStand(angle / 2, radius - STAND_DISTANCE, -1, [left, right]));
    } else if (standsAlone(left, right)) {
      const alone = (yield* aloneStandArcSteps(left, radius)) / radius;
      stands.push(placeStand(alone, radius - STAND_DISTANCE, left.index, [left]));
    }
    // The right player starts a desk: its stand stands to its right, at half the arc to a
    // partner of its seat. Else the stands of the second violin and the viola of the string
    // quartet go into each other.
    const next =
      right.stand === 'shared' && right.cast.player % 2 === 0 && !sharesWith(left, right)
        ? [
            placeStand(
              angle + (yield* aloneStandArcSteps(right, radius)) / radius,
              radius - STAND_DISTANCE,
              -1,
              [right],
            ),
          ]
        : [];
    const clear =
      !obstaclesTouch(a.obstacle, b.obstacle, FOOTPRINT_GAP) &&
      stands.every(
        (stand) =>
          (stand.owner === left.index ||
            !obstaclesTouch(stand.obstacle, a.obstacle, FOOTPRINT_GAP)) &&
          (stand.owner === right.index ||
            !obstaclesTouch(stand.obstacle, b.obstacle, FOOTPRINT_GAP)),
      ) &&
      stands.every((stand, i) =>
        [...stands.slice(i + 1), ...next].every(
          (other) => !obstaclesTouch(stand.obstacle, other.obstacle, FOOTPRINT_GAP),
        ),
      );
    if (clear) {
      return arc;
    }
    arc += CLEAR_STEP;
    yield;
  }
}

/**
 * The arcs of {@link aloneStandArcSteps} for each player and radius. The spread of a row places
 * the row many times at one radius, so the layout calculates each arc one time.
 */
const aloneStandArcs = new WeakMap<Member, Map<number, number>>();

/**
 * Calculates the arc from a string player with no partner to its stand, in steps (design 7.2).
 * The stand stands where a partner of the same seat would share it: half the arc to such a
 * partner, to the right.
 *
 * @param member The player.
 * @param radius The radius of the row.
 * @returns The steps, which return the arc in meters.
 */
function* aloneStandArcSteps(member: Member, radius: number): Steps<number> {
  const known = aloneStandArcs.get(member)?.get(radius);
  if (known !== undefined) {
    return known;
  }
  const partner: Member = {
    ...member,
    cast: { ...member.cast, player: member.cast.player + 1 },
  };
  const arc = (yield* spacingSteps(member, partner, radius)) / 2;
  const arcs = aloneStandArcs.get(member) ?? new Map<number, number>();
  arcs.set(radius, arc);
  aloneStandArcs.set(member, arcs);
  return arc;
}

/** The arc from the seat center of the leftmost player to the left end of its row. */
function leftEnd(member: Member): number {
  return Math.max(member.arc / 2, member.footprint.bounds.max[0] + FOOTPRINT_GAP / 2);
}

/** The arc from the seat center of the rightmost player to the right end of its row. */
function rightEnd(member: Member): number {
  return Math.max(member.arc / 2, -member.footprint.bounds.min[0] + FOOTPRINT_GAP / 2);
}

/** The arc positions of the players of a row, and the place of 0° on the arc. */
interface Arrangement {
  /** The arc position of each player. */
  readonly at: readonly number[];
  /** The arc position of 0°. */
  readonly zero: number;
  /** The smallest radius that keeps the row within 160°. */
  readonly radius: number;
}

/**
 * Places the players of a row on its arc, in steps (design 4.5 seat geometry, design 7.2). In a
 * split row, 0° is between the violins and the other sections, and each side spans at most 80°.
 * Else the row is centered on 0°, and it spans at most 160°.
 *
 * @param members The players from left to right. There is at least one.
 * @param split True for rows 0 and 1.
 * @param radius The radius at which the spacing is measured.
 * @param halfSpan The largest angle of one side: 80°, or 60° for the arc of a chamber group.
 * @returns The steps, which return the arrangement.
 */
function* arrangeSteps(
  members: readonly Member[],
  split: boolean,
  radius: number,
  halfSpan = HALF_SPAN,
): Steps<Arrangement> {
  const at: number[] = [];
  for (const [i, member] of members.entries()) {
    const previous = members[i - 1];
    at.push(previous ? (at[i - 1] ?? 0) + (yield* spacingSteps(previous, member, radius)) : 0);
  }
  const first = members[0];
  const last = members.at(-1);
  const from = first ? -leftEnd(first) : 0;
  const to = last ? (at.at(-1) ?? 0) + rightEnd(last) : 0;
  if (!split) {
    return { at, zero: (from + to) / 2, radius: (to - from) / (2 * halfSpan) };
  }
  const lastViolin = members.findLastIndex((m) => m.violin);
  let zero = from;
  if (lastViolin === members.length - 1) {
    zero = to;
  } else if (lastViolin >= 0) {
    zero = ((at[lastViolin] ?? 0) + (at[lastViolin + 1] ?? 0)) / 2;
  }
  return { at, zero, radius: Math.max(zero - from, to - zero) / halfSpan };
}

/**
 * Calculates the angle of each player of a row from its arrangement.
 *
 * @param arrangement The arc positions of the players.
 * @param radius The radius of the row.
 * @returns The angles, in radians. 0 points to the back, and negative angles are on the left.
 */
function rowAngles(arrangement: Arrangement, radius: number): number[] {
  return arrangement.at.map((s) => (s - arrangement.zero) / radius);
}

/**
 * Places the players and the stands of a row at a radius around the podium center.
 *
 * @param members The players from left to right.
 * @param angles The angle of each player.
 * @param radius The radius of the row.
 * @param heights The height of the floor under each player: a riser, or 0 when absent. A stand
 *   stands at the height of its first reader.
 * @returns The places, with their obstacles.
 */
function placeRow(
  members: readonly Member[],
  angles: readonly number[],
  radius: number,
  heights: readonly number[] = [],
): RowPlacement {
  const players = members.map((member, i) =>
    placePlayer(member, angles[i] ?? 0, radius, heights[i] ?? 0),
  );
  const stands: PlacedStand[] = [];
  members.forEach((member, i) => {
    const angle = angles[i] ?? 0;
    const next = members[i + 1];
    const height = heights[i] ?? 0;
    if (member.stand === 'own') {
      stands.push(placeStand(angle, radius - member.standDistance, member.index, [member], height));
    } else if (next && sharesWith(member, next)) {
      const middle = (angle + (angles[i + 1] ?? angle)) / 2;
      stands.push(placeStand(middle, radius - STAND_DISTANCE, -1, [member, next], height));
    } else if (standsAlone(member, next)) {
      const arc = runAll(aloneStandArcSteps(member, radius));
      stands.push(
        placeStand(angle + arc / radius, radius - STAND_DISTANCE, member.index, [member], height),
      );
    }
  });
  return { players, stands };
}

/** An instrumental row with its radius, the angle of each player, and its places. */
interface FittedRow {
  /** The players from left to right. */
  readonly members: readonly Member[];
  /** The index of the row in {@link ROWS}. */
  readonly row: number;
  /** True for rows 0 and 1, which have the violins left of 0° and the other strings right of it. */
  readonly split: boolean;
  readonly radius: number;
  readonly angles: readonly number[];
  readonly placement: RowPlacement;
  /**
   * The space of the riser of a row from row 2 ({@link riserReserve}), or `null` for the rows of
   * the strings. The other items keep their gaps from it, so the row can rise after the spread.
   */
  readonly reserve: RowRiser | null;
}

/**
 * Lists the obstacles of the players and the stands of a row.
 *
 * @param row The places of the row.
 * @returns The obstacles: the players, then the stands.
 */
function obstaclesOfRow(row: RowPlacement): Obstacle[] {
  return [...row.players, ...row.stands].map((p) => p.obstacle);
}

/**
 * Finds if new obstacles come closer than the gap to the obstacles already on the stage.
 *
 * @param fresh The new obstacles.
 * @param placed The obstacles on the stage.
 * @returns True if one pair touches.
 */
function touchesAny(fresh: readonly Obstacle[], placed: readonly Obstacle[]): boolean {
  return fresh.some((a) => placed.some((b) => obstaclesTouch(a, b, FOOTPRINT_GAP)));
}

/** The items that a row keeps clear of (design 4.5, seat geometry). */
interface RowClearance {
  /** The obstacles of the other items on the stage. Each item of the row keeps 0.05 m. */
  readonly placed: readonly Obstacle[];
  /** The piano cases in front of the row. Each player of the row keeps {@link PIANO_REACH_GAP}. */
  readonly pianosInFront: readonly Obstacle[];
  /** The players of the rows behind. Each piano case of the row keeps {@link PIANO_REACH_GAP}. */
  readonly playersBehind: readonly Obstacle[];
}

/**
 * Gives the obstacles of the piano cases of a row: the pianists with their pianos.
 *
 * @param row The places of the row.
 * @returns The obstacles of the pianists.
 */
function pianosOfRow(row: RowPlacement): Obstacle[] {
  return row.players.filter((p) => p.place.cast.instrument === 'piano').map((p) => p.obstacle);
}

/**
 * Finds if a row keeps its gaps: 0.05 m from each item, and {@link PIANO_REACH_GAP} between a
 * piano case and a player of a row behind it.
 *
 * @param row The places of the row.
 * @param clearance The items around the row.
 * @returns True if the row is clear.
 */
function rowClear(row: RowPlacement, clearance: RowClearance): boolean {
  const players = row.players.map((p) => p.obstacle);
  return (
    !touchesAny(obstaclesOfRow(row), clearance.placed) &&
    !players.some((a) =>
      clearance.pianosInFront.some((b) => obstaclesTouch(a, b, PIANO_REACH_GAP)),
    ) &&
    !pianosOfRow(row).some((a) =>
      clearance.playersBehind.some((b) => obstaclesTouch(a, b, PIANO_REACH_GAP)),
    )
  );
}

/**
 * Places a row at the smallest radius that keeps it within its span and clear of the items in
 * front (design 4.5, seat geometry).
 *
 * @param members The players of the row from left to right.
 * @param row The index of the row in {@link ROWS}.
 * @param smallest The radius of the previous row plus 1.2 m.
 * @param clearance The items on the stage, all in front of the row.
 * @returns The row with its radius, its angles, and its places.
 */
function* fitRowSteps(
  members: readonly Member[],
  row: number,
  smallest: number,
  clearance: RowClearance,
): Steps<FittedRow> {
  const split = row < SPLIT_ROWS;
  let radius = smallest;
  for (;;) {
    yield;
    const arrangement = yield* arrangeSteps(members, split, radius);
    if (arrangement.radius > radius) {
      radius = Math.max(arrangement.radius, radius + CLEAR_STEP);
      continue;
    }
    const angles = rowAngles(arrangement, radius);
    const placement = placeRow(members, angles, radius);
    // The band of each row behind the first row lets its players move along the arc after the
    // spread, and lets a seat group from row 2 rise.
    const reserve = row > 0 ? riserReserve(placement, row) : null;
    if (
      rowClear(placement, clearance) &&
      (!reserve || !touchesAny([rowRiserObstacle(reserve, CENTER)], clearance.placed))
    ) {
      return { members, row, split, radius, angles, placement, reserve };
    }
    radius += CLEAR_STEP;
  }
}

/** The extent of the items of a row around the podium center. */
interface RowExtent {
  /** The smallest distance of a box corner from the podium center, in meters. */
  readonly inner: number;
  /** The largest distance of a box corner from the podium center, in meters. */
  readonly outer: number;
  /** The smallest angle of a box corner, in radians. */
  readonly from: number;
  /** The largest angle of a box corner, in radians. */
  readonly to: number;
}

/**
 * Calculates the extent of the players and the stands of a row around the podium center.
 *
 * @param row The places of the row.
 * @returns The extent of the corners of all boxes.
 */
function rowExtent(row: RowPlacement): RowExtent {
  let inner = Infinity;
  let outer = 0;
  let from = Infinity;
  let to = -Infinity;
  for (const b of obstaclesOfRow(row).flatMap((o) => o.boxes)) {
    for (const [x, z] of boxCorners(b)) {
      const r = Math.hypot(x, z);
      const angle = Math.atan2(x, -z);
      inner = Math.min(inner, r);
      outer = Math.max(outer, r);
      from = Math.min(from, angle);
      to = Math.max(to, angle);
    }
  }
  return { inner, outer, from, to };
}

/**
 * Gives the space that the riser of a row can take (design 4.5, seat geometry): from
 * {@link ROW_RISER}.lip in front of the stands of the row to the back of its chairs, over the
 * largest arc of a spread row. The spread moves the items of a row only along its arc, so the
 * riser of the spread row stays in this space.
 *
 * @param row The places of the packed row.
 * @param n The index of the row in {@link ROWS}.
 * @returns The space, with the largest height of a riser.
 */
function riserReserve(row: RowPlacement, n: number): RowRiser {
  const { inner, outer } = rowExtent(row);
  // A seat at 90° reaches past 90° by half a chair and the lip.
  const end = SPREAD_LIMITS.maxAngle + (CHAIR_ROOM + ROW_RISER.lip) / inner;
  return {
    inner: inner - ROW_RISER.lip,
    outer,
    height: riserTop(n),
    from: -end,
    to: end,
  };
}

/**
 * Divides the singers evenly across the levels of the risers. The lower levels get the extra
 * singers.
 *
 * @param count The number of singers.
 * @param levels The number of levels.
 * @returns The number of singers on each level.
 */
export function divideSingers(count: number, levels: number): number[] {
  return Array.from(
    { length: levels },
    (_, k) => Math.floor(count / levels) + (k < count % levels ? 1 : 0),
  );
}

/**
 * Makes the obstacle of one riser level: one box for each part of at most 5° of its arc.
 *
 * @param level The level.
 * @param podium The podium center.
 * @returns The obstacle.
 */
function riserObstacle(level: RiserLevel, podium: Vec3): Obstacle {
  const parts = Math.max(1, Math.ceil((2 * level.halfAngle) / RISER_BOX_ANGLE));
  const step = (2 * level.halfAngle) / parts;
  const outer = level.radius + RISER.depth / 2;
  // The lowest level holds the steps in front of it, toward the podium (-z of a seat).
  const front = level.level === 0 ? riserStepsDepth() : 0;
  const size: Vec3 = [
    2 * outer * Math.sin(step / 2),
    level.height,
    RISER.depth + front + outer * (1 - Math.cos(step / 2)),
  ];
  const box = footprintOf([centeredBox([0, level.height / 2, -front / 2], size)]);
  const boxes = Array.from({ length: parts }, (_, i) => {
    const spot = seatAt(podium, -level.halfAngle + (i + 0.5) * step, level.radius);
    return placeFootprint(box, spot.position, spot.facing);
  }).flat();
  return obstacleOf(`riser level ${level.level}`, boxes);
}

/**
 * Makes the obstacle of the riser of a row: one box for each part of at most 5° of its arc, from
 * the stage top to its height.
 *
 * @param riser The riser.
 * @param podium The podium center.
 * @returns The obstacle.
 */
function rowRiserObstacle(riser: RowRiser, podium: Vec3): Obstacle {
  const parts = Math.max(1, Math.ceil((riser.to - riser.from) / RISER_BOX_ANGLE));
  const step = (riser.to - riser.from) / parts;
  const front = riser.inner * Math.cos(step / 2);
  const size: Vec3 = [2 * riser.outer * Math.sin(step / 2), riser.height, riser.outer - front];
  const box = footprintOf([centeredBox([0, riser.height / 2, 0], size)]);
  const boxes = Array.from({ length: parts }, (_, i) => {
    const spot = seatAt(podium, riser.from + (i + 0.5) * step, (front + riser.outer) / 2);
    return placeFootprint(box, spot.position, spot.facing);
  }).flat();
  return obstacleOf('row riser', boxes);
}

/** The singers and the risers for one count of levels. */
interface ChoirPlacement {
  readonly singers: readonly PlacedPlayer[];
  readonly risers: readonly RiserLevel[];
  readonly obstacles: readonly Obstacle[];
}

/**
 * Places the singers on the risers behind the orchestra (design 4.5, seat geometry). The singers
 * fill the levels evenly. Level `k` has the radius `r + 0.8 k` and the height `1.0 + 0.25 k`. If a
 * level needs more than 160°, or if the risers touch the orchestra, all levels move back. The
 * vocal soloists (design 3.8) stand alone on the lowest level, in front of the choir.
 *
 * @param members The singers of the choir, in the order of the seats.
 * @param levels The number of levels of the choir.
 * @param smallest The radius of the last row plus 1.2 m.
 * @param placed The obstacles on the stage.
 * @param soloists The vocal soloists, or none.
 * @returns The singers and the risers.
 */
function fitChoir(
  members: readonly Member[],
  levels: number,
  smallest: number,
  placed: readonly Obstacle[],
  soloists: readonly Member[],
): ChoirPlacement {
  const groups: Member[][] = soloists.length > 0 ? [[...soloists]] : [];
  let next = 0;
  for (const count of divideSingers(members.length, levels)) {
    groups.push(members.slice(next, next + count));
    next += count;
  }
  let radius = smallest;
  for (;;) {
    const levelRadius = (k: number): number => radius + RISER.depth * k;
    const arrangements = groups.map((group, k) =>
      runAll(arrangeSteps(group, false, levelRadius(k))),
    );
    if (arrangements.some((a, k) => a.radius > levelRadius(k))) {
      radius += CLEAR_STEP;
      continue;
    }
    // All levels span the angle of the widest level of singers.
    const halfAngle = Math.max(
      ...arrangements.map((a, k) => (a.radius * HALF_SPAN) / levelRadius(k)),
    );
    const risers = groups.map((_, k): RiserLevel => ({
      level: k,
      radius: levelRadius(k),
      height: RISER.base + RISER.rise * k,
      halfAngle,
    }));
    const singers = groups.flatMap(
      (group, k) =>
        placeRow(
          group,
          rowAngles(arrangements[k] ?? runAll(arrangeSteps(group, false, 1)), levelRadius(k)),
          levelRadius(k),
          group.map(() => RISER.base + RISER.rise * k),
        ).players,
    );
    const obstacles = [
      ...risers.map((level) => riserObstacle(level, CENTER)),
      ...singers.map((s) => s.obstacle),
    ];
    if (!touchesAny(obstacles, placed)) {
      return { singers, risers, obstacles };
    }
    radius += CLEAR_STEP;
  }
}

/** The step of the wing of the risers, in meters of arc at the lowest level. */
const WING_STEP = 0.02;

/**
 * Widens the risers after the stage size (design 4.5, seat geometry): each level reaches past
 * the outermost singer by the same wing on each side, up to {@link RISER}.wing, as the risers of
 * `orchestra-latest.png`. The wing is the largest that keeps each box 0.3 m from the outline of
 * the stage and 0.05 m from the other items. The stage side does not change.
 *
 * @param risers The levels of the risers, with the angle of the singers.
 * @param others The obstacles of the other items, relative to the podium center.
 * @param stage The stage side and the front distance.
 * @returns The levels with the wing.
 */
export function widenRisers(
  risers: readonly RiserLevel[],
  others: readonly Obstacle[],
  stage: StageSize,
): RiserLevel[] {
  const [first] = risers;
  if (!first) {
    return [];
  }
  for (let wing = RISER.wing; wing > 1e-9; wing -= WING_STEP) {
    const wide = risers.map((level) => ({
      ...level,
      halfAngle: level.halfAngle + wing / first.radius,
    }));
    const obstacles = wide.map((level) => riserObstacle(level, CENTER));
    const inside = obstacles.every((o) => o.boxes.every((b) => boxOnStage(b, stage)));
    if (inside && !touchesAny(obstacles, others)) {
      return wide;
    }
  }
  return [...risers];
}

/**
 * Places the conductor on the podium top, facing the orchestra (design 4.5).
 *
 * @param podium The podium center.
 * @returns The place of the conductor.
 */
export function conductorOn(podium: Vec3): ConductorPlace {
  return {
    position: [podium[0], podium[1] + PODIUM_SIZE[1], podium[2]],
    facing: 0,
  };
}

/** The label of the obstacle of the podium, the conductor stand, and the conductor. */
export const CONDUCTOR_OBSTACLE = 'podium and conductor';

/**
 * Makes the obstacle of the podium, the conductor stand, and the conductor.
 *
 * @param podium The podium center.
 * @param models The player models of the score.
 * @returns The obstacle.
 */
function conductorObstacle(podium: Vec3, models: ModelCache): Obstacle {
  const [width, height, depth] = PODIUM_SIZE;
  const stand = CONDUCTOR_STAND;
  const deskZ = -stand.forward;
  const boxes = footprintOf([
    centeredBox([0, height / 2, 0], [width, height, depth]),
    centeredBox(
      [0, (height + stand.deskHeight) / 2, deskZ],
      [2 * stand.baseRadius, height + stand.deskHeight, 2 * stand.baseRadius],
    ),
    centeredBox(
      [0, height + stand.deskHeight, deskZ],
      [
        stand.deskWidth,
        stand.deskDepth * Math.cos(stand.tilt) + 0.03,
        stand.deskDepth * Math.sin(stand.tilt) + 0.03,
      ],
    ),
  ]);
  const bear = playerFootprint(models.get(CONDUCTOR.species, CONDUCTOR.instrument));
  const conductor = conductorOn(podium);
  return obstacleOf(CONDUCTOR_OBSTACLE, [
    ...placeFootprint(boxes, podium, 0),
    ...placeFootprint(bear, conductor.position, conductor.facing),
  ]);
}

/**
 * Makes the obstacles of a layout: the podium with the conductor (when the layout has one), each
 * player with its instrument and its seat, each music stand, and the risers: each riser level
 * and the riser of each row. The overlap test and the layout use the same footprints.
 *
 * @param layout The layout.
 * @param models The player models of the score. A new cache by default.
 * @returns The obstacles, in the stage axes.
 */
export function layoutObstacles(layout: SceneLayout, models = new ModelCache()): Obstacle[] {
  const players = layout.players.map((place) => {
    const { species, instrument, kettles, support } = place.cast;
    const footprint = playerFootprint(models.get(species, instrument, kettles, support));
    return playerObstacle(place.cast, footprint, place.position, place.facing);
  });
  const stands = layout.stands.map((stand, i) =>
    obstacleOf(
      `stand ${i}`,
      placeFootprint(standFootprint(stand.deskHeight), stand.position, stand.facing),
    ),
  );
  const risers = [
    ...layout.risers.map((level) => riserObstacle(level, layout.podium)),
    ...layout.rowRisers.map((riser) => rowRiserObstacle(riser, layout.podium)),
  ];
  // The levels of the risers stand against each other, so they form one obstacle.
  const riserBlock =
    risers.length > 0
      ? [
          obstacleOf(
            'risers',
            risers.flatMap((r) => r.boxes),
          ),
        ]
      : [];
  const conductor = layout.conductor ? [conductorObstacle(layout.podium, models)] : [];
  return [...conductor, ...players, ...stands, ...riserBlock];
}

/**
 * Turns a footprint by a quarter turn to the left around y, as a facing of +π/2 turns a model.
 * A point (x, z) goes to (z, -x), so each box stays a box.
 *
 * @param footprint The footprint.
 * @returns The turned footprint.
 */
function quarterTurn(footprint: Footprint): Footprint {
  return footprintOf(
    footprint.boxes.map((b) => ({
      min: [b.min[2], b.min[1], -b.max[0]],
      max: [b.max[2], b.max[1], -b.min[0]],
    })),
  );
}

/**
 * Makes the member of the layout for one player.
 *
 * @param cast The cast of the player.
 * @param index The index of the player in the cast.
 * @param section The section of its seat.
 * @param models The player models of the score.
 * @param group The row group of the player. A keyboard of the orchestra (`piano`) turns by
 *   {@link KEYBOARD_TURN}, and a vocal soloist uses {@link VOCAL_SOLOIST_ARC}.
 * @returns The member.
 */
function memberOf(
  cast: PlayerCast,
  index: number,
  section: PlayingSection,
  models: ModelCache,
  group: RowGroup,
): Member {
  const turned = group === 'piano';
  const model = models.get(cast.species, cast.instrument, cast.kettles, cast.support);
  const footprint = turned ? quarterTurn(playerFootprint(model)) : playerFootprint(model);
  const stand = STAND_USE[section];
  const eye = Math.min(
    ...(['eyeL', 'eyeR'] as const).map(
      (bone) => model.skeleton.positions[boneIndex(bone)]?.[1] ?? Infinity,
    ),
  );
  const sight = eyesOf(model);
  return {
    index,
    cast,
    model,
    footprint,
    turn: turned ? KEYBOARD_TURN : 0,
    arc:
      group === 'vocal-soloists'
        ? VOCAL_SOLOIST_ARC
        : section === 'choir'
          ? SINGER_ARC
          : SEATED_ARC,
    stand,
    eye,
    sight,
    standDistance:
      stand === 'own' ? ownStandDistance(footprint, standDeskHeight([eye])) : STAND_DISTANCE,
    violin: section === 'violin',
  };
}

/**
 * Finds the row group of a player.
 *
 * @param seat The seat of the player.
 * @param player The index of the player in its seat.
 * @returns The group: the section, the first violin seat, or the other violin seats. A violin,
 *   viola, or cello player after the first desk gets the group with the suffix `-b`.
 */
function groupOf(seat: Seat, player: number): RowGroup {
  if (seat.section === 'sound-only') {
    return 'choir';
  }
  let desk: DeskSection;
  if (seat.section === 'violin') {
    desk = seat.indexInSection === 0 ? 'violin-1' : 'violin-2';
  } else if (seat.section === 'viola' || seat.section === 'cello') {
    desk = seat.section;
  } else {
    return seat.section;
  }
  return player < DESK_SIZE ? desk : `${desk}-b`;
}

/** The items of a layout with the podium center at the origin. */
interface Draft {
  readonly players: readonly (PlayerPlace | undefined)[];
  readonly risers: readonly RiserLevel[];
  readonly obstacles: readonly Obstacle[];
  /** The largest z of the soloist, with its instrument, or -Infinity with no soloist. */
  readonly soloistFront: number;
}

/** The stage side `S` and the front distance `F` (design 4.5, stage origin), in meters. */
interface StageSize {
  /** The stage side `S`, in meters. */
  readonly side: number;
  /** The front distance `F` from the front edge to the podium center, in meters. */
  readonly front: number;
}

/**
 * Calculates the stage side and the front distance of a draft (design 4.5, stage origin). The
 * half width `L` is the largest `|x|` of a seat plus 0.5 m for the chair and 0.3 m of margin, or
 * of a footprint box plus 0.3 m. The depth `D` follows the same rule behind the podium.
 *
 * @param draft The draft, with the podium center at the origin.
 * @returns The stage side `S` and the front distance `F`.
 */
function stageOf(draft: Draft): StageSize {
  const seats = draft.players.filter((p): p is PlayerPlace => p !== undefined);
  const boxes = draft.obstacles.flatMap((o) => o.boxes);
  const halfWidth = Math.max(
    ...seats.map((p) => Math.abs(p.position[0]) + CHAIR_ROOM + EDGE_MARGIN),
    ...boxes.map((b) => Math.abs(b.x) + reachOn(b, 1, 0) + EDGE_MARGIN),
  );
  const front = Math.max(PODIUM_FROM_FRONT, draft.soloistFront + EDGE_MARGIN);
  const behind = Math.max(
    0,
    ...seats.map((p) => -p.position[2] + CHAIR_ROOM + EDGE_MARGIN),
    ...boxes.map((b) => -b.z + reachOn(b, 0, 1) + EDGE_MARGIN),
  );
  return {
    side: Math.max(SMALLEST_STAGE, 2 * halfWidth, front + behind),
    front,
  };
}

/**
 * Places the pianist with the piano and the bench, with the long axis of the case along x and the
 * keys at the left end. The pianist faces +x (design 4.5, seat geometry). The case center of a
 * soloist is 2.0 m to the left of the podium center and 0.8 m to the front, and the pianist faces
 * the conductor.
 *
 * @param member The pianist.
 * @param center The x and the z of the case center, relative to the podium center.
 * @returns The place of the pianist, its obstacle, and the largest z of the piano.
 */
function placePiano(
  member: Member,
  center: readonly [x: number, z: number] = PIANO_CENTER,
): PlacedPlayer & { readonly front: number } {
  const piano = member.model.pieces.find((p) => p.piece.bone === 'instrument');
  const bounds = piano ? pieceBounds(piano.piece) : { min: CENTER, max: CENTER };
  const offset = piano?.at.position ?? CENTER;
  const cx = offset[0] + (bounds.min[0] + bounds.max[0]) / 2;
  const cz = offset[2] + (bounds.min[2] + bounds.max[2]) / 2;
  // Facing +x moves a point (x, z) of the model to (-z, x).
  const position: Vec3 = [center[0] + cz, 0, center[1] - cx];
  return {
    index: member.index,
    place: {
      position,
      facing: PIANIST_FACING,
      cast: member.cast,
    },
    obstacle: obstacleOf(
      `${member.cast.species} piano`,
      placeFootprint(member.footprint, position, PIANIST_FACING),
    ),
    front: position[2] + offset[0] + bounds.max[0],
  };
}

/**
 * Places the soloist of the score at the front left of the conductor (design 4.2, 4.5). The
 * pianist sits at the piano ({@link placePiano}). Another soloist stands or sits at
 * {@link SOLOIST_PLACE}, faces the audience, and turns 40° to the conductor. It has no music
 * stand, because a soloist plays from memory.
 *
 * @param member The soloist.
 * @returns The place of the soloist, its obstacle, and the largest z of its footprint.
 */
function placeSoloist(member: Member): PlacedPlayer & { readonly front: number } {
  if (member.cast.instrument === 'piano') {
    return placePiano(member);
  }
  const soloist = placeAt(member, [SOLOIST_PLACE[0], 0, SOLOIST_PLACE[1]], SOLOIST_FACING);
  const front = Math.max(...soloist.obstacle.boxes.map((b) => b.z + reachOn(b, 0, 1)));
  return { ...soloist, front };
}

/**
 * Places the players of a chamber group in one arc around the podium center, centered on 0°
 * (design 4.5, seat geometry). The arc has a radius of at least 2.4 m, and it moves back until
 * each player is within 60° of its middle. The players face the podium center, so they face each
 * other a little.
 *
 * @param members The players from left to right.
 * @returns The places of the players and of their stands.
 */
function fitArc(members: readonly Member[]): RowPlacement {
  let radius: number = CHAMBER.radius;
  for (;;) {
    const arrangement = runAll(arrangeSteps(members, false, radius, CHAMBER.halfSpan));
    if (arrangement.radius <= radius) {
      return placeRow(members, rowAngles(arrangement, radius), radius);
    }
    radius = Math.max(arrangement.radius, radius + CLEAR_STEP);
  }
}

/**
 * Places the partner of a pianist in a recital: in front of the curved side of the case, 0.45 m
 * from its middle toward the tail, as in the crook of the piano. The partner faces the audience
 * and turns 25° to the pianist. It moves toward the audience until it keeps the gap from the
 * piano. It has no music stand, as the soloist of design 4.5.
 *
 * @param member The partner.
 * @param middle The x and the z of the case center.
 * @param piano The pianist with the piano.
 * @returns The place of the partner and its obstacle.
 */
function placeInCrook(
  member: Member,
  middle: readonly [x: number, z: number],
  piano: PlacedPlayer,
): PlacedPlayer {
  const facing = AUDIENCE_FACING - CHAMBER.turn;
  for (let z = middle[1]; ; z += CLEAR_STEP) {
    const partner = placeAt(member, [middle[0] + CHAMBER.crook, 0, z], facing);
    if (!obstaclesTouch(partner.obstacle, piano.obstacle, FOOTPRINT_GAP)) {
      return partner;
    }
  }
}

/**
 * Places a player alone at a point, facing the audience, with no music stand (design 4.5). A
 * pianist sits at the piano, with the case center at the point.
 *
 * @param member The player.
 * @param middle The x and the z of the point.
 * @returns The place of the player and its obstacle.
 */
function placeAlone(member: Member, middle: readonly [x: number, z: number]): PlacedPlayer {
  if (member.cast.instrument === 'piano') {
    return placePiano(member, middle);
  }
  return placeAt(member, [middle[0], 0, middle[1]], AUDIENCE_FACING);
}

/** The stage of a chamber group, and the move of its items onto the stage. */
interface ChamberStage {
  /** The stage side `S`, in meters. */
  readonly side: number;
  /** The move that puts the middle of the group at the stage center. */
  readonly shift: Vec3;
}

/**
 * Calculates the stage of a chamber group (design 4.5, stage origin). The rule of the orchestra
 * applies from the middle of the group in place of the podium center: each seat needs 0.5 m for
 * the chair and 0.3 m of margin, and each footprint box 0.3 m of margin, on each side. The stage
 * side is at least 5 m, and the middle of the group goes to the stage center.
 *
 * @param players The places of the players, relative to the podium center.
 * @param stands The places of the stands.
 * @returns The stage side, and the move that puts the middle of the group at the origin.
 */
function chamberStage(
  players: readonly PlacedPlayer[],
  stands: readonly PlacedStand[],
): ChamberStage {
  const low = [Infinity, Infinity];
  const high = [-Infinity, -Infinity];
  const add = (x: number, z: number, rx: number, rz: number): void => {
    low[0] = Math.min(low[0] ?? 0, x - rx);
    low[1] = Math.min(low[1] ?? 0, z - rz);
    high[0] = Math.max(high[0] ?? 0, x + rx);
    high[1] = Math.max(high[1] ?? 0, z + rz);
  };
  const seat = CHAIR_ROOM + EDGE_MARGIN;
  for (const p of players) {
    add(p.place.position[0], p.place.position[2], seat, seat);
  }
  for (const b of [...players, ...stands].flatMap((p) => p.obstacle.boxes)) {
    add(b.x, b.z, reachOn(b, 1, 0) + EDGE_MARGIN, reachOn(b, 0, 1) + EDGE_MARGIN);
  }
  const [x0 = 0, z0 = 0] = low;
  const [x1 = 0, z1 = 0] = high;
  return {
    side: Math.max(SMALLEST_STAGE, x1 - x0, z1 - z0),
    shift: [-(x0 + x1) / 2, 0, -(z0 + z1) / 2],
  };
}

/**
 * Calculates the layout of a chamber group: a score with at most 5 players (design 4.2, 4.5).
 * It has no conductor and no podium. One player sits or stands at the stage center and faces
 * the audience. The partner of a pianist stands in the crook of the piano. Other groups sit in a
 * small arc ({@link fitArc}). The soloist rule of design 3.8 does not move a player.
 *
 * @param form The form of the group.
 * @param members The players, in the order of the cast.
 * @param cast The cast, for the check of {@link placesOfCast}.
 * @param groups The row group of each player.
 * @returns The layout.
 */
function layoutChamber(
  form: ChamberForm,
  members: readonly Member[],
  cast: readonly PlayerCast[],
  groups: readonly RowGroup[],
): SceneLayout {
  // The group stands where the first row of an orchestra sits: 2.4 m behind the podium center.
  const middle = [0, -CHAMBER.radius] as const;
  let placed: PlacedPlayer[] = [];
  let stands: readonly PlacedStand[] = [];
  if (form === 'arc') {
    const order = CHAMBER_ORDER.flatMap((group) =>
      members.filter((m) => groups[m.index] === group),
    );
    const arc = fitArc(order);
    placed = [...arc.players];
    stands = arc.stands;
  } else {
    const piano = members.find((m) => m.cast.instrument === 'piano');
    const pianist = piano ? placeAlone(piano, middle) : null;
    placed = members.map((m) => {
      if (pianist && m === piano) {
        return pianist;
      }
      return pianist ? placeInCrook(m, middle, pianist) : placeAlone(m, middle);
    });
  }
  const stage = chamberStage(placed, stands);
  const [dx, , dz] = stage.shift;
  const move = (p: Vec3): Vec3 => [p[0] + dx, p[1], p[2] + dz];
  const places: (PlayerPlace | undefined)[] = members.map(() => undefined);
  for (const p of placed) {
    places[p.index] = p.place;
  }
  return {
    stageSide: stage.side,
    podium: move(CENTER),
    conductor: null,
    ...onStage(places, cast, stands, move),
    risers: [],
    rowRisers: [],
  };
}

/** The limits of the spread of a row (design 4.5, seat geometry). */
interface SpreadLimits {
  /** The largest angle of a seat from 0°, in radians: 90°. */
  readonly maxAngle: number;
  /** The largest arc between two neighbors of a row, in meters: 1.6. */
  readonly maxArc: number;
}

/**
 * The limits of the spread (design 4.5, seat geometry). In the reference image, the seats reach
 * ±90°, and two neighbors are 1.1 to 1.7 m apart.
 */
export const SPREAD_LIMITS: SpreadLimits = {
  maxAngle: (90 * Math.PI) / 180,
  maxArc: 1.6,
};

/** The step of the spread factor of one side of a row. */
const SPREAD_STEP = 0.02;

/**
 * Finds if a box keeps the edge margin from the outline of the stage: from the side edges, the
 * front edge, the back edge, and the corner cuts (design 4.5, seat geometry).
 *
 * @param b The box, relative to the podium center.
 * @param stage The stage side and the front distance.
 * @param margin The margin, in meters: 0.3 m, or {@link RISER_EDGE} for a riser.
 * @returns True if each corner of the box keeps the margin.
 */
export function boxOnStage(b: PlacedBox, stage: StageSize, margin = EDGE_MARGIN): boolean {
  // The z of the stage center, relative to the podium center.
  const center = stage.front - stage.side / 2;
  return boxCorners(b).every(([x, z]) => keepsStageMargin(x, z - center, stage.side, margin));
}

/**
 * Finds if each box of a row keeps the edge margin from the outline of the stage.
 *
 * @param row The places of the row, relative to the podium center.
 * @param stage The stage side and the front distance.
 * @returns True if each box is inside.
 */
function rowOnStage(row: RowPlacement, stage: StageSize): boolean {
  return obstaclesOfRow(row).every((obstacle) => obstacle.boxes.every((b) => boxOnStage(b, stage)));
}

/**
 * Calculates the angles of a row after the spread of one side. Each arc between two neighbors
 * on that side, and the arc from 0° to the innermost player, grows by a factor up to 1.6 m. An
 * arc that is already longer stays. With no player at 0°, the innermost arc of a centered row
 * grows up to half of 1.6 m, because the innermost player of the other side shares it. The
 * innermost arc of rows 0 and 1 is the gap of the conductor, and it grows with no limit.
 *
 * @param row The row.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @param factor The factor of the arcs, at least 1.
 * @returns The angle of each player.
 */
function spreadAngles(row: FittedRow, side: -1 | 1, factor: number): number[] {
  const { radius, angles } = row;
  const { maxArc } = SPREAD_LIMITS;
  const order = angles
    .map((angle, i) => ({ arc: angle * side * radius, i }))
    .filter((p) => p.arc > 1e-9)
    .toSorted((a, b) => a.arc - b.arc);
  const middle = angles.some((a) => Math.abs(a) <= 1e-9);
  let innerLimit = maxArc / 2;
  if (middle) {
    innerLimit = maxArc;
  } else if (row.split) {
    innerLimit = Infinity;
  }
  const grow = (arc: number, limit: number): number =>
    arc >= limit ? arc : Math.min(limit, arc * factor);
  const next = [...angles];
  let previous = 0;
  let at = 0;
  order.forEach((p, k) => {
    at += grow(p.arc - previous, k === 0 ? innerLimit : maxArc);
    previous = p.arc;
    next[p.i] = (side * at) / radius;
  });
  return next;
}

/**
 * Spreads the players of one side of a row with the largest factor, in steps of 0.02 down from
 * 1.6 / 0.95, that keeps the limits (design 4.5, seat geometry). Each seat stays within ±90°,
 * each box keeps 0.3 m from the edges, and each footprint keeps its gaps from the other items
 * ({@link rowClear}). {@link spreadAngles} keeps the arcs at most 1.6 m. The spread only makes the
 * arcs of a row longer, so the items of the row stay apart. The overlap test of the layouts checks
 * all pairs.
 *
 * @param row The row.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @param clearance The other items on the stage.
 * @param stage The stage side and the front distance.
 * @returns The row with the new angles, or the same row if no factor above 1 fits.
 */
function* spreadSideSteps(
  row: FittedRow,
  side: -1 | 1,
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  const { maxAngle, maxArc } = SPREAD_LIMITS;
  for (let k = maxArc / SEATED_ARC; k > 1 + 1e-9; k -= SPREAD_STEP) {
    yield;
    const next = spreadAngles(row, side, k);
    if (next.some((a) => Math.abs(a) > maxAngle + 1e-9)) {
      continue;
    }
    const placement = placeRow(row.members, next, row.radius);
    if (rowOnStage(placement, stage) && rowClear(placement, clearance)) {
      return { ...row, angles: next, placement };
    }
  }
  return row;
}

/** The row of the desks after the first desk of each string seat. */
const BACK_DESK_ROW = 1;

/** The step of the blend of the back desks toward their wedges. */
const WEDGE_STEP = 0.1;

/**
 * Calculates the angles that put the back desks of one side of row 1 behind the first desks of
 * their seats in row 0. The players of one seat keep their packed arcs around the middle angle
 * of the first desk. Then a pass from 0° to the outside keeps each packed arc between two
 * neighbors, and the packed arc from 0° to the innermost player, as a minimum.
 *
 * @param packed Row 1 before the spread.
 * @param front Row 0 after the spread.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @returns The angle of each player. The players of the other side keep their packed angles.
 */
function wedgeAngles(packed: FittedRow, front: FittedRow, side: -1 | 1): number[] {
  const middle = (angles: readonly number[], at: (i: number) => boolean, seat: number): number => {
    const own = angles.filter((_, i) => at(i) && packed.members[i]?.cast.seatIndex === seat);
    return own.reduce((sum, a) => sum + a, 0) / own.length;
  };
  const frontDesk = (seat: number): number => {
    const own = front.angles.filter((_, i) => {
      const cast = front.members[i]?.cast;
      return cast?.seatIndex === seat && cast.player < DESK_SIZE;
    });
    return own.reduce((sum, a) => sum + a, 0) / own.length;
  };
  const onSide = (i: number): boolean => side * (packed.angles[i] ?? 0) > 0;
  const next = packed.angles.map((angle, i) => {
    if (!onSide(i)) {
      return angle;
    }
    const seat = packed.members[i]?.cast.seatIndex ?? -1;
    const target = frontDesk(seat);
    return Number.isFinite(target) ? target + angle - middle(packed.angles, onSide, seat) : angle;
  });
  const order = packed.angles
    .map((angle, i) => ({ out: side * angle, i }))
    .filter((p) => p.out > 0)
    .toSorted((a, b) => a.out - b.out);
  let inner = 0;
  let innerPacked = 0;
  for (const { out, i } of order) {
    const at = Math.max(side * (next[i] ?? 0), inner + out - innerPacked);
    next[i] = side * at;
    inner = at;
    innerPacked = out;
  }
  return next;
}

/**
 * Moves the back desks of one side of row 1 toward the first desks of their seats in row 0, as
 * the wedges of the strings of a professional orchestra (design 4.5, seat geometry). The row
 * takes the largest blend, in steps of 0.1, between the spread angles and the angles of
 * {@link wedgeAngles} that keeps each seat within ±90°, each box 0.3 m from the edges, and each
 * footprint its gaps from the other items ({@link rowClear}).
 *
 * @param spread Row 1 after the spread.
 * @param packed Row 1 before the spread.
 * @param front Row 0 after the spread.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @param clearance The other items on the stage.
 * @param stage The stage side and the front distance.
 * @returns The row with the new angles, or the spread row if no blend fits.
 */
function* wedgeSideSteps(
  spread: FittedRow,
  packed: FittedRow,
  front: FittedRow,
  side: -1 | 1,
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  const target = wedgeAngles(packed, front, side);
  const steps = Math.round(1 / WEDGE_STEP);
  for (let k = steps; k > 0; k--) {
    yield;
    const blend = k / steps;
    const next = spread.angles.map((angle, i) =>
      side * (packed.angles[i] ?? 0) > 0 ? angle + blend * ((target[i] ?? angle) - angle) : angle,
    );
    if (next.some((a) => Math.abs(a) > SPREAD_LIMITS.maxAngle + 1e-9)) {
      continue;
    }
    const placement = placeRow(spread.members, next, spread.radius);
    if (rowOnStage(placement, stage) && rowClear(placement, clearance)) {
      return { ...spread, angles: next, placement };
    }
  }
  return spread;
}

/**
 * Spreads each instrumental row inside the stage, from the front (design 4.5, seat geometry). The
 * packed rows end at ±43° to ±74°, so the front corners of the stage stayed empty. The left side
 * and the right side of a row each get their own factor. Rows 0 and 1 keep the violins left of
 * 0° and the other strings right of it. After its spread, row 1 moves its back desks toward their
 * first desks ({@link wedgeSideSteps}). The stage side does not change.
 *
 * @param rows The packed rows, from the front.
 * @param fixed The obstacles that do not move: the podium with the conductor, the soloist, the
 *   risers, and the singers.
 * @param soloPianos The obstacles of the piano soloists, which are also in `fixed`.
 * @param stage The stage side and the front distance.
 * @returns The rows after the spread.
 */
function* spreadRowsSteps(
  rows: readonly FittedRow[],
  fixed: readonly Obstacle[],
  soloPianos: readonly Obstacle[],
  stage: StageSize,
): Steps<FittedRow[]> {
  const done: FittedRow[] = [];
  for (const [n, row] of rows.entries()) {
    const clearance = clearanceOf(fixed, soloPianos, done, rows.slice(n + 1));
    const left = yield* spreadSideSteps(row, -1, clearance, stage);
    let next = yield* spreadSideSteps(left, 1, clearance, stage);
    const front = done.find((r) => r.row === 0);
    if (row.row === BACK_DESK_ROW && front) {
      next = yield* wedgeSideSteps(next, row, front, -1, clearance, stage);
      next = yield* wedgeSideSteps(next, row, front, 1, clearance, stage);
    }
    done.push(next);
  }
  return done;
}

/**
 * Gives the obstacles of a fitted row: its players and its stands, and the space of its riser.
 *
 * @param row The row.
 * @returns The obstacles.
 */
function rowObstacles(row: FittedRow): Obstacle[] {
  const own = obstaclesOfRow(row.placement);
  return row.reserve ? [...own, rowRiserObstacle(row.reserve, CENTER)] : own;
}

/**
 * Gives the items that a row keeps clear of, with the rows in front and behind it.
 *
 * @param fixed The obstacles that do not move.
 * @param soloPianos The obstacles of the piano soloists, which are also in `fixed`.
 * @param front The rows in front of the row.
 * @param behind The rows behind the row.
 * @returns The clearance of the row.
 */
function clearanceOf(
  fixed: readonly Obstacle[],
  soloPianos: readonly Obstacle[],
  front: readonly FittedRow[],
  behind: readonly FittedRow[],
): RowClearance {
  return {
    placed: [...fixed, ...front.flatMap(rowObstacles), ...behind.flatMap(rowObstacles)],
    pianosInFront: [...soloPianos, ...front.flatMap((r) => pianosOfRow(r.placement))],
    playersBehind: behind.flatMap((r) => r.placement.players.map((p) => p.obstacle)),
  };
}

/**
 * Moves a point of a model into the stage axes.
 *
 * @param p The point in the model axes.
 * @param position The place of the model origin.
 * @param facing The turn of the model around y, in radians.
 * @returns The point on the stage.
 */
function pointOnStage(p: Vec3, position: Vec3, facing: number): Vec3 {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return [position[0] + p[0] * c + p[2] * s, position[1] + p[1], position[2] - p[0] * s + p[2] * c];
}

/**
 * Gives the middle of the two eye bones of a model, in the model axes, in the bind pose.
 *
 * @param model The model.
 * @returns The point.
 */
function eyesOf(model: PlayerModel): Vec3 {
  const [l, r] = (['eyeL', 'eyeR'] as const).map(
    (bone): Vec3 => model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0],
  );
  return [
    ((l?.[0] ?? 0) + (r?.[0] ?? 0)) / 2,
    ((l?.[1] ?? 0) + (r?.[1] ?? 0)) / 2,
    ((l?.[2] ?? 0) + (r?.[2] ?? 0)) / 2,
  ];
}

/** The points of the conductor that the players see, relative to the podium center. */
interface SightTargets {
  /** The points of the head. A music stand can hide them. */
  readonly head: readonly Vec3[];
  /** The points of the right paw and the baton. A music stand does not hide them. */
  readonly baton: readonly Vec3[];
  /** The points of the left paw. A music stand does not hide them. */
  readonly cue: readonly Vec3[];
}

/**
 * Gives the points of the conductor that the players see ({@link CONDUCTOR_SIGHT}).
 *
 * @returns The points, relative to the podium center.
 */
function sightTargets(): SightTargets {
  const top = PODIUM_SIZE[1];
  const lift = (points: readonly (readonly number[])[]): Vec3[] =>
    points.map(([x = 0, y = 0, z = 0]): Vec3 => [x, top + y, z]);
  const [xs, ys, zs] = CONDUCTOR_SIGHT.head;
  return {
    head: lift(zs.flatMap((z) => xs.flatMap((x) => ys.map((y) => [x, y, z])))),
    baton: lift(CONDUCTOR_SIGHT.baton),
    cue: lift(CONDUCTOR_SIGHT.cue),
  };
}

/**
 * Finds if a segment crosses a placed box.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param b The box.
 * @returns True if a part of the segment is inside the box.
 */
function segmentHitsBox(from: Vec3, to: Vec3, b: PlacedBox): boolean {
  // A point goes into the axes of the box by the turn back of `placeFootprint()`.
  const fx = from[0] - b.x;
  const fz = from[2] - b.z;
  const tx = to[0] - b.x;
  const tz = to[2] - b.z;
  const ax = fx * b.cos - fz * b.sin;
  const az = fx * b.sin + fz * b.cos;
  const ex = tx * b.cos - tz * b.sin;
  const ez = tx * b.sin + tz * b.cos;
  // The slabs of the three axes: the start, the move, and the two faces. The sight sweep calls
  // this function millions of times, so it makes no arrays.
  const span: Span = { t0: 0, t1: 1 };
  return (
    slabHit(ax, ex - ax, -b.halfX, b.halfX, span) &&
    slabHit(from[1], to[1] - from[1], b.minY, b.maxY, span) &&
    slabHit(az, ez - az, -b.halfZ, b.halfZ, span)
  );
}

/** The part of a segment that is inside the slabs so far, as fractions of the segment. */
interface Span {
  /** The fraction at which the segment goes into all slabs. */
  t0: number;
  /** The fraction at which the segment comes out of a slab first. */
  t1: number;
}

/**
 * Clips the span of a segment by one slab: the space between two parallel faces of a box.
 *
 * @param start The start of the segment on the axis of the slab.
 * @param d The move of the segment on the axis.
 * @param low The lower face.
 * @param high The upper face.
 * @param span The span so far. The function makes it smaller.
 * @returns False if no part of the segment is inside all slabs so far.
 */
function slabHit(start: number, d: number, low: number, high: number, span: Span): boolean {
  if (Math.abs(d) < 1e-12) {
    return !(start < low || start > high);
  }
  const ta = (low - start) / d;
  const tb = (high - start) / d;
  span.t0 = Math.max(span.t0, Math.min(ta, tb));
  span.t1 = Math.min(span.t1, Math.max(ta, tb));
  return !(span.t0 > span.t1);
}

/** A box that is parallel to the axes. */
interface AxisBox {
  /** The low corner. */
  readonly min: Vec3;
  /** The high corner. */
  readonly max: Vec3;
}

/** A node of the box tree of a sight mesh, in the model axes. */
interface SightNode extends AxisBox {
  /** The two children, or `null` for a leaf. */
  readonly kids: readonly [SightNode, SightNode] | null;
  /** 9 numbers for each triangle of a leaf. */
  readonly corners: Float32Array;
}

/** The triangles of a player model for the sight lines, in a box tree, in the model axes. */
interface SightMesh {
  /** The largest distance of a box corner from the model origin in the plane of the stage. */
  readonly reach: number;
  readonly root: SightNode;
}

/** The model of a placed player, for the sight lines on its mesh. */
interface MeshPlace {
  readonly model: PlayerModel;
  readonly position: Vec3;
  /** The cosine and the sine of the facing of the model. */
  readonly cos: number;
  readonly sin: number;
}

/** The largest number of triangles in a leaf of a sight mesh. */
const SIGHT_LEAF = 8;

/**
 * The sight mesh of each model. Like a footprint, a model gets its mesh one time, at the first
 * sight line that passes near it.
 */
const sightMeshes = new WeakMap<PlayerModel, SightMesh>();

/**
 * The model of each player obstacle ({@link placeAt}). The sight lines test the triangles of the
 * player, because the boxes of a footprint are much larger than the ears and the paws.
 */
const meshPlaces = new WeakMap<Obstacle, MeshPlace>();

/**
 * Gives the box around a list of corners.
 *
 * @param corners 3 numbers for each corner.
 * @returns The low corner and the high corner.
 */
function cornerBox(corners: ArrayLike<number>): AxisBox {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < corners.length; i++) {
    const a = i % 3;
    const v = corners[i] ?? 0;
    min[a] = Math.min(min[a] ?? Infinity, v);
    max[a] = Math.max(max[a] ?? -Infinity, v);
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

/**
 * Gives the sight mesh of a model: its triangles in a box tree. Each node splits its triangles
 * at the middle of its longest side, down to {@link SIGHT_LEAF} triangles.
 *
 * @param model The model.
 * @returns The mesh.
 */
function sightMeshOf(model: PlayerModel): SightMesh {
  const known = sightMeshes.get(model);
  if (known) {
    return known;
  }
  const p = model.mesh.positions;
  const middle = (t: number, a: number): number =>
    (p[t * 9 + a] ?? 0) + (p[t * 9 + 3 + a] ?? 0) + (p[t * 9 + 6 + a] ?? 0);
  const build = (ids: readonly number[]): SightNode => {
    const corners = new Float32Array(ids.length * 9);
    ids.forEach((t, k) => {
      corners.set(p.subarray(t * 9, t * 9 + 9), k * 9);
    });
    const box = cornerBox(corners);
    if (ids.length <= SIGHT_LEAF) {
      return { ...box, kids: null, corners };
    }
    const size = [0, 1, 2].map((a) => (box.max[a] ?? 0) - (box.min[a] ?? 0));
    const axis = size.indexOf(Math.max(...size));
    const sorted = ids.toSorted((a, b) => middle(a, axis) - middle(b, axis));
    const half = Math.floor(sorted.length / 2);
    return {
      ...box,
      kids: [build(sorted.slice(0, half)), build(sorted.slice(half))],
      corners: new Float32Array(0),
    };
  };
  const root = build(Array.from({ length: p.length / 9 }, (_, t) => t));
  const reach = Math.max(
    ...[root.min[0], root.max[0]].flatMap((x) =>
      [root.min[2], root.max[2]].map((z) => Math.hypot(x, z)),
    ),
  );
  const mesh: SightMesh = { reach, root };
  sightMeshes.set(model, mesh);
  return mesh;
}

/**
 * Finds if a segment crosses a box that is parallel to the axes.
 *
 * @param o The start.
 * @param d The vector from the start to the end.
 * @param min The low corner.
 * @param max The high corner.
 * @returns True if a part of the segment is inside the box.
 */
function rayHitsBox(o: Vec3, d: Vec3, min: Vec3, max: Vec3): boolean {
  const span: Span = { t0: 0, t1: 1 };
  return (
    slabHit(o[0], d[0], min[0], max[0], span) &&
    slabHit(o[1], d[1], min[1], max[1], span) &&
    slabHit(o[2], d[2], min[2], max[2], span)
  );
}

/**
 * Finds if a segment crosses a triangle (Moller and Trumbore), away from its ends, as the
 * `sight-lines` probe does.
 *
 * @param o The start.
 * @param d The vector from the start to the end.
 * @param c The corners of the triangles.
 * @param i The index of the first number of the triangle.
 * @returns True on a hit.
 */
function rayHitsTriangle(o: Vec3, d: Vec3, c: Float32Array, i: number): boolean {
  const ax = c[i] ?? 0;
  const ay = c[i + 1] ?? 0;
  const az = c[i + 2] ?? 0;
  const e1x = (c[i + 3] ?? 0) - ax;
  const e1y = (c[i + 4] ?? 0) - ay;
  const e1z = (c[i + 5] ?? 0) - az;
  const e2x = (c[i + 6] ?? 0) - ax;
  const e2y = (c[i + 7] ?? 0) - ay;
  const e2z = (c[i + 8] ?? 0) - az;
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) {
    return false;
  }
  const inv = 1 / det;
  const tx = o[0] - ax;
  const ty = o[1] - ay;
  const tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) {
    return false;
  }
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) {
    return false;
  }
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 && t < 0.999;
}

/**
 * Finds if a segment crosses a triangle of a placed player model. The segment goes into the axes
 * of the model by the turn back of its facing.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param placed The model at its place.
 * @returns True on a hit.
 */
function segmentHitsMesh(from: Vec3, to: Vec3, placed: MeshPlace): boolean {
  const { position, cos, sin } = placed;
  const local = (p: Vec3): Vec3 => {
    const dx = p[0] - position[0];
    const dz = p[2] - position[2];
    return [dx * cos - dz * sin, p[1] - position[1], dx * sin + dz * cos];
  };
  const o = local(from);
  const e = local(to);
  const d: Vec3 = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const stack: SightNode[] = [sightMeshOf(placed.model).root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (!rayHitsBox(o, d, node.min, node.max)) {
      continue;
    }
    if (node.kids) {
      stack.push(node.kids[0], node.kids[1]);
      continue;
    }
    for (let i = 0; i < node.corners.length; i += 9) {
      if (rayHitsTriangle(o, d, node.corners, i)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds if an obstacle comes within a distance of a segment in the plane of the stage: its circle,
 * or the circle of its mesh, grown by the distance.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param o The obstacle.
 * @param margin The distance, in meters.
 * @returns True if the obstacle is near.
 */
function nearSegment(from: Vec3, to: Vec3, o: Obstacle, margin: number): boolean {
  const placed = meshPlaces.get(o);
  const cx = placed ? placed.position[0] : o.x;
  const cz = placed ? placed.position[2] : o.z;
  const reach = Math.max(placed ? sightMeshOf(placed.model).reach : 0, o.radius) + margin;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = dx * dx + dz * dz;
  const t =
    length > 0 ? Math.min(1, Math.max(0, ((cx - from[0]) * dx + (cz - from[2]) * dz) / length)) : 0;
  const ex = from[0] + t * dx - cx;
  const ez = from[2] + t * dz - cz;
  return ex * ex + ez * ez <= reach * reach;
}

/**
 * Finds if a segment crosses an obstacle: the triangles of a player, or the boxes of another item.
 * The circle of the obstacle in the plane of the stage skips most obstacles.
 *
 * @param from The start of the segment.
 * @param to The end of the segment.
 * @param o The obstacle.
 * @returns True if a part of the segment is inside the obstacle.
 */
function segmentHitsObstacle(from: Vec3, to: Vec3, o: Obstacle): boolean {
  if (!nearSegment(from, to, o, 0)) {
    return false;
  }
  const placed = meshPlaces.get(o);
  return placed
    ? segmentHitsMesh(from, to, placed)
    : o.boxes.some((b) => segmentHitsBox(from, to, b));
}

/** The items that can hide the conductor from the players of a row. */
interface SightBlockers {
  /** The players with their instruments and seats, and the risers. They hide each point. */
  readonly solid: readonly Obstacle[];
  /** The music stands. They hide only the head. */
  readonly stands: readonly Obstacle[];
}

/**
 * The sight of a player to the conductor (design 4.5, seat geometry): 0 if it sees each point, 1
 * if it sees the head and the baton paw but not the whole left paw, and 2 if an item hides a point
 * of the head or of the baton paw.
 */
type Sight = 0 | 1 | 2;

/** The sight of a player, with the hidden share of its head and its baton paw. */
interface SightResult {
  readonly sight: Sight;
  /** The hidden share of the head points plus the hidden share of the baton points: 0 to 2. */
  readonly hidden: number;
}

/**
 * The largest distance of a target from the podium center in the plane of the stage, in meters.
 * An item farther from the line from the eyes to the podium center hides no target.
 */
const SIGHT_REACH = 0.9;

/**
 * Finds how much of the conductor a player sees (design 4.5, seat geometry). The lines go from
 * the eyes of the player to the points of {@link CONDUCTOR_SIGHT}, and the triangles of the
 * players and the boxes of the other items can hide them.
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param targets The points of the conductor.
 * @param blockers The items that can hide the points.
 * @returns The sight.
 */
function sightOf(
  eyes: Vec3,
  place: PlayerPlace,
  targets: SightTargets,
  blockers: SightBlockers,
): SightResult {
  const eye = pointOnStage(eyes, place.position, place.facing);
  const near = (items: readonly Obstacle[]): Obstacle[] =>
    items.filter((o) => nearSegment(eye, CENTER, o, SIGHT_REACH));
  const solid = near(blockers.solid);
  const stands = near(blockers.stands);
  const hides = (point: Vec3, items: readonly Obstacle[]): boolean =>
    items.some((o) => segmentHitsObstacle(eye, point, o));
  const share = (points: readonly Vec3[], items: readonly Obstacle[]): number =>
    points.filter((p) => hides(p, items)).length / points.length;
  const head = share(targets.head, [...solid, ...stands]);
  const baton = share(targets.baton, solid);
  let sight: Sight = 0;
  if (head > 0 || baton > 0) {
    sight = 2;
  } else if (share(targets.cue, solid) > 0) {
    sight = 1;
  }
  return { sight, hidden: head + baton };
}

/**
 * The view of the audience on the raised rows (design 4.5, seat geometry). A row on a riser sits
 * behind the strings, and a small animal there can hide behind them in the low wide shots of
 * Cinematic. The points stand for those shots and the default view, as multiples of the stage
 * side, relative to the podium center: the low and the middle camera at the front, and the two
 * side cameras.
 */
const AUDIENCE = {
  /** The first row that keeps its view: row 2, the first row on risers. */
  firstRow: 2,
  cameras: [
    [0, 0.36, 1.3],
    [0, 0.6, 1.25],
    [-0.9, 0.5, 1.4],
    [0.9, 0.5, 1.4],
  ],
  /** The points of the head around the eyes: the side move and the height, in meters. */
  head: [
    [0, 0],
    [-0.1, 0.05],
    [0.1, 0.05],
    [0, 0.15],
  ],
  /** The hidden share of the head from which a player of a raised row counts as hidden. */
  hidden: 0.2,
} as const;

/**
 * Finds the share of the head of a player that the items in front hide from the audience
 * ({@link AUDIENCE}).
 *
 * @param eyes The middle of the eyes of the player in its model axes ({@link eyesOf}).
 * @param place The place of the player.
 * @param solid The items that can hide the head.
 * @param side The stage side, in meters.
 * @returns The share, from 0 to 1.
 */
function audienceShare(
  eyes: Vec3,
  place: PlayerPlace,
  solid: readonly Obstacle[],
  side: number,
): number {
  const [x, y, z] = eyes;
  const points = AUDIENCE.head.map(([dx, dy]): Vec3 => {
    const p = pointOnStage([x + dx, y, z], place.position, place.facing);
    return [p[0], p[1] + dy, p[2]];
  });
  let hidden = 0;
  for (const [cx, cy, cz] of AUDIENCE.cameras) {
    const camera: Vec3 = [cx * side, cy * side, cz * side];
    const items = solid.filter((o) => nearSegment(camera, points[0] ?? camera, o, 0.3));
    hidden += points.filter((p) => items.some((o) => segmentHitsObstacle(camera, p, o))).length;
  }
  return hidden / (AUDIENCE.cameras.length * points.length);
}

/** The known sights of the players of a row at their angles, for the moves of the row in front. */
interface SightMemo {
  readonly get: (i: number, angle: number) => SightResult | undefined;
  readonly set: (i: number, angle: number, result: SightResult) => void;
}

/**
 * Gives the cost of a sight in the searches of the layout. A blocked player outweighs all partial
 * sights, and a partial sight outweighs all moves of 1° steps. Among the blocked places, a place
 * with less of the head and the baton paw hidden costs less, so that the search keeps the player
 * near a gap.
 *
 * @param result The sight.
 * @returns The cost.
 */
function sightCost(result: SightResult): number {
  return ([0, 1000, 1_000_000][result.sight] ?? 0) + 300 * result.hidden;
}

/**
 * Moves the players of a row along its arc so that each player sees the conductor through the
 * gaps of the rows in front (design 4.5, seat geometry). Each player can move up to
 * {@link CONDUCTOR_SIGHT}.nudge off its spread angle, in steps of `nudgeStep`. A search over each
 * side of the row, from its inner player to its outer player, picks the angles with the fewest
 * blocked players, then the fewest players with no sight of the left paw, then the smallest
 * moves. Neighbors keep their packed arcs, the strings keep the gap of the conductor, and the
 * outer player does not pass its spread angle, because the spread took the room to the stage
 * edge. The inner player of a split row stays at its spread angle or farther out, or with
 * `innerLimit` at that angle from 0° or farther out.
 *
 * @param row The row after the spread.
 * @param heights The height of the floor under each player.
 * @param arcs The packed arc from each player to its right neighbor, in radians.
 * @param targets The points of the conductor.
 * @param blockers The items in front of the row.
 * @param view The stage side when the row keeps the view of the audience ({@link AUDIENCE}), or
 *   `null`. A hidden head then costs as much as a hidden conductor.
 * @param innerLimit The smallest angle of a player of a split row from 0°, in radians, or `null`.
 * @param memo The known sights of the players at their angles, or `null`.
 * @returns The steps, which return the angle of each player.
 */
function* sightSweepSteps(
  row: FittedRow,
  heights: readonly number[],
  arcs: readonly number[],
  targets: SightTargets,
  blockers: SightBlockers,
  view: number | null,
  innerLimit: number | null = null,
  memo: SightMemo | null = null,
): Steps<number[]> {
  const { members, radius, angles } = row;
  const next = [...angles];
  const sight = (i: number, angle: number): SightResult => {
    const known = memo?.get(i, angle);
    if (known) {
      return known;
    }
    const result = freshSight(i, angle);
    memo?.set(i, angle, result);
    return result;
  };
  const freshSight = (i: number, angle: number): SightResult => {
    const member = members[i];
    if (!member) {
      return { sight: 0, hidden: 0 };
    }
    // The own stand of a wind player stands in front of its face.
    const height = heights[i] ?? 0;
    const own =
      member.stand === 'own'
        ? [placeStand(angle, radius - member.standDistance, i, [member], height).obstacle]
        : [];
    const place = placePlayer(member, angle, radius, height).place;
    const seen = sightOf(member.sight, place, targets, {
      ...blockers,
      stands: [...blockers.stands, ...own],
    });
    return view === null
      ? seen
      : {
          ...seen,
          hidden: seen.hidden + audienceShare(member.sight, place, blockers.solid, view),
        };
  };
  const steps = Math.round(CONDUCTOR_SIGHT.nudge / CONDUCTOR_SIGHT.nudgeStep);
  const right = angles.flatMap((a, i) => (a >= 0 ? [i] : []));
  const left = angles.flatMap((a, i) => (a < 0 ? [i] : [])).toReversed();
  const innerRight = right[0];
  const innerLeft = left[0];
  const between = innerLeft !== undefined ? (arcs[innerLeft] ?? 0) : 0;
  // The right side goes first. A centered row keeps the packed arc between its two inner
  // players, and the strings keep the gap of the conductor.
  const sides = [
    {
      side: 1,
      order: right,
      bound: (): number => {
        if (row.split && innerLimit !== null) {
          return Math.min(angles[innerRight ?? 0] ?? 0, innerLimit);
        }
        return row.split || innerLeft === undefined
          ? (angles[innerRight ?? 0] ?? 0)
          : (angles[innerLeft] ?? 0) + between;
      },
    },
    {
      side: -1,
      order: left,
      bound: (): number => {
        if (row.split && innerLimit !== null) {
          return Math.max(angles[innerLeft ?? 0] ?? 0, -innerLimit);
        }
        return row.split || innerRight === undefined
          ? (angles[innerLeft ?? 0] ?? 0)
          : (next[innerRight] ?? 0) - between;
      },
    },
  ] as const;
  for (const { side, order, bound } of sides) {
    const limit = bound();
    // The candidates of each player, from the inner player out: the angle and its cost.
    const options: { readonly angle: number; readonly cost: number }[][] = [];
    for (const [k, i] of order.entries()) {
      yield;
      const base = angles[i] ?? 0;
      const own: { angle: number; cost: number }[] = [];
      for (let n = -steps; n <= steps; n++) {
        const angle = base + side * n * CONDUCTOR_SIGHT.nudgeStep;
        const out = side * angle;
        if (
          out < side * limit - 1e-12 ||
          Math.abs(angle) > SPREAD_LIMITS.maxAngle + 1e-9 ||
          (k === order.length - 1 && out > side * base + 1e-12)
        ) {
          continue;
        }
        own.push({ angle, cost: sightCost(sight(i, angle)) + Math.abs(n) });
      }
      options.push(own);
    }
    // The best total cost of each candidate with the players inside it, and the candidate of the
    // inner neighbor on that path.
    const totals: number[][] = [];
    const links: number[][] = [];
    for (const [k, own] of options.entries()) {
      const before = options[k - 1];
      const inner = order[k - 1];
      const arc = inner === undefined ? 0 : (arcs[side > 0 ? inner : (order[k] ?? 0)] ?? 0);
      totals.push([]);
      links.push([]);
      for (const option of own) {
        let best = before ? Infinity : 0;
        let link = -1;
        before?.forEach((previous, j) => {
          const total = totals[k - 1]?.[j] ?? Infinity;
          if (side * (option.angle - previous.angle) >= arc - 1e-9 && total < best) {
            best = total;
            link = j;
          }
        });
        totals[k]?.push(best + option.cost);
        links[k]?.push(link);
      }
    }
    const last = totals.at(-1) ?? [];
    const lowest = Math.min(...last);
    // With no path, the side keeps its spread angles.
    let at = Number.isFinite(lowest) ? last.indexOf(lowest) : -1;
    for (let k = order.length - 1; k >= 0 && at >= 0; k--) {
      const i = order[k];
      const option = options[k]?.[at];
      if (i !== undefined && option) {
        next[i] = option.angle;
      }
      at = links[k]?.[at] ?? -1;
    }
  }
  return next;
}

/** A row after the sight pass, with the risers under it. */
interface SeenRow {
  readonly row: FittedRow;
  /** The risers of the seat groups of the row that stand higher than the stage top. */
  readonly risers: readonly RowRiser[];
}

/**
 * Gives the items that can hide the conductor from a player behind the rows.
 *
 * @param soloists The obstacles of the soloists.
 * @param rows The rows in front of the player, after the sight pass.
 * @returns The players, the risers, and the stands of the rows, with the soloists.
 */
function blockersOf(soloists: readonly Obstacle[], rows: readonly SeenRow[]): SightBlockers {
  return {
    solid: [
      ...soloists,
      ...rows.flatMap((r) => r.row.placement.players.map((p) => p.obstacle)),
      ...rows.flatMap((r) => r.risers.map((riser) => rowRiserObstacle(riser, CENTER))),
    ],
    stands: rows.flatMap((r) => r.row.placement.stands.map((p) => p.obstacle)),
  };
}

/**
 * Splits the players of a row into its seat groups: the runs of neighbors of one seat. Each seat
 * group stands on its own riser, as the modular risers of a real orchestra.
 *
 * @param members The players of the row from left to right.
 * @returns The indices of the players of each group, from left to right.
 */
function seatGroups(members: readonly Member[]): number[][] {
  const groups: number[][] = [];
  members.forEach((member, i) => {
    const last = groups.at(-1);
    if (last && members[i - 1]?.cast.seatIndex === member.cast.seatIndex) {
      last.push(i);
    } else {
      groups.push([i]);
    }
  });
  return groups;
}

/**
 * Finds the seat group of each stand of a row: the group of its own reader, or the group of the
 * nearest player for a shared stand.
 *
 * @param members The players of the row.
 * @param placement The places of the row.
 * @param groups The seat groups.
 * @returns The index of the group of each stand.
 */
function standGroups(
  members: readonly Member[],
  placement: RowPlacement,
  groups: readonly (readonly number[])[],
): number[] {
  const angleOf = (p: Vec3): number => Math.atan2(p[0], -p[2]);
  return placement.stands.map((stand) => {
    const reader = members.findIndex((m) => m.index === stand.owner);
    if (reader >= 0) {
      return groups.findIndex((g) => g.includes(reader));
    }
    const angle = angleOf(stand.place.position);
    const distance = (g: readonly number[]): number =>
      Math.min(
        ...g.map((i) => Math.abs(angleOf(placement.players[i]?.place.position ?? CENTER) - angle)),
      );
    const near = groups.map(distance);
    return near.indexOf(Math.min(...near));
  });
}

/**
 * Gives the extent of each seat group of a row: its players and their stands.
 *
 * @param members The players of the row.
 * @param placement The places of the row.
 * @param groups The seat groups.
 * @returns The extent of each group.
 */
function groupExtents(
  members: readonly Member[],
  placement: RowPlacement,
  groups: readonly (readonly number[])[],
): RowExtent[] {
  const owner = standGroups(members, placement, groups);
  return groups.map((g, k) =>
    rowExtent({
      players: g.flatMap((i) => placement.players[i] ?? []),
      stands: placement.stands.filter((_, j) => owner[j] === k),
    }),
  );
}

/** The smallest depth of a riser behind the seat centers of its row, in meters. */
const RISER_BACK = 0.3;

/**
 * The margin of a riser from the outline of the stage, in meters. A riser can reach nearer to
 * the edge than a player, because nobody stands on its edge.
 */
const RISER_EDGE = 0.05;

/**
 * Gives the riser of a seat group at a height (design 4.5, seat geometry): the reserved space of
 * the row ({@link riserReserve}) over the arc of the group, with {@link ROW_RISER}.lip at each
 * end, up to the middle of the gap to each neighbor group. The riser reaches at least
 * {@link RISER_BACK} behind the seat centers, also when the chairs of the row end in front of that
 * line. Near the back edge and the corner cuts of the stage, the ends lose their lip and the back
 * face comes forward in steps of 0.02 m, down to {@link RISER_BACK} behind the seat centers, until
 * each box keeps {@link RISER_EDGE} from the outline of the stage.
 *
 * @param row The row.
 * @param extents The extent of each seat group.
 * @param k The index of the group.
 * @param height The height.
 * @param stage The stage side and the front distance.
 * @returns The riser, or `null` if no riser of the group stays on the stage.
 */
function groupRiser(
  row: FittedRow,
  extents: readonly RowExtent[],
  k: number,
  height: number,
  stage: StageSize,
): RowRiser | null {
  const reserve = row.reserve;
  const own = extents[k];
  if (!reserve || !own) {
    return null;
  }
  const left = extents[k - 1];
  const right = extents[k + 1];
  // A shallow reserve, such as the back row of a small stage, still holds the smallest riser.
  const deepest = Math.max(reserve.outer, row.radius + RISER_BACK);
  for (const lip of [ROW_RISER.lip, 0]) {
    for (let outer = deepest; outer >= row.radius + RISER_BACK - 1e-9; outer -= CLEAR_STEP) {
      const riser: RowRiser = {
        inner: reserve.inner,
        outer,
        height,
        from: Math.max(
          reserve.from,
          own.from - lip / reserve.inner,
          left ? (left.to + own.from) / 2 : -Infinity,
        ),
        to: Math.min(
          reserve.to,
          own.to + lip / reserve.inner,
          right ? (own.to + right.from) / 2 : Infinity,
        ),
      };
      if (rowRiserObstacle(riser, CENTER).boxes.every((b) => boxOnStage(b, stage, RISER_EDGE))) {
        return riser;
      }
    }
  }
  return null;
}

/**
 * Joins the risers of neighbor seat groups of one height into one riser.
 *
 * @param risers The riser of each group, or `null` for a group on the stage top.
 * @returns The risers.
 */
function joinRisers(risers: readonly (RowRiser | null)[]): RowRiser[] {
  const joined: RowRiser[] = [];
  let previous: RowRiser | null = null;
  for (const riser of risers) {
    const last = joined.at(-1);
    if (riser && previous && last && Math.abs(riser.height - last.height) < 1e-9) {
      joined[joined.length - 1] = {
        ...last,
        outer: Math.min(last.outer, riser.outer),
        to: riser.to,
      };
    } else if (riser) {
      joined.push(riser);
    }
    previous = riser;
  }
  return joined;
}

/**
 * Finds where the risers of the seat groups of a row go into an item. A riser that goes into an
 * item of a lower group lifts that group to the height of the riser. A raised group with no riser
 * on the stage counts as a contact, because its players have no floor.
 *
 * @param risers The riser of each group, or `null` for a group on the stage top.
 * @param items The players and the stands of the row, with the index of their group.
 * @param count The number of groups.
 * @param around The items around the row that a riser must not go into.
 * @param levels The height of each group.
 * @returns The height to which each group must rise, and true if a riser goes into an item.
 */
function riserContact(
  risers: readonly (RowRiser | null)[],
  items: readonly { readonly obstacle: Obstacle; readonly group: number }[],
  count: number,
  around: readonly Obstacle[],
  levels: readonly number[],
): Pick<SightTry, 'lifts' | 'contact'> {
  const lifts = Array.from({ length: count }, () => 0);
  let contact = levels.some((h, k) => h > 0 && !risers[k]);
  for (const riser of risers) {
    if (!riser) {
      continue;
    }
    const box = rowRiserObstacle(riser, CENTER);
    for (const item of items) {
      if (obstaclesTouch(box, item.obstacle, 0)) {
        contact = true;
        lifts[item.group] = Math.max(lifts[item.group] ?? 0, riser.height);
      }
    }
    contact ||= around.some((o) => obstaclesTouch(box, o, 0));
  }
  return { lifts, contact };
}

/** A row after its sight pass, with its cost and its blocked players. */
interface RowSight {
  readonly seen: SeenRow;
  /** The sum of the costs of the sights of the players ({@link sightCost}). */
  readonly cost: number;
  /** The indices of the blocked players. */
  readonly blind: readonly number[];
  /** The largest hidden share of the head and the baton paw of a player ({@link SightResult}). */
  readonly worst: number;
}

/**
 * The moves of row 0 for the sight of the back desks ({@link sightRowsSteps}).
 */
const FRONT_MOVES = {
  /** The largest number of rounds of the greedy search. */
  rounds: 4,
  /** The largest move of a run of players in one try, in steps of 1°. */
  shift: 6,
  /**
   * The largest angle between a front player and a back player at which the front player can
   * hide a target of the back player, in radians: 0.45, about 26°.
   */
  reach: 0.45,
} as const;

/**
 * The hidden share of the head and the baton paw of a back desk player ({@link SightResult}) from
 * which row 1 tries the gap of the conductor ({@link sightRowsSteps}). A player that sees most of
 * the conductor keeps its desk, so that a small fault does not move the desks into the gap.
 */
const OPEN_GAP_HIDDEN = 0.5;

/** One try of the heights of the seat groups of a row. */
interface SightTry {
  /** The sum of the costs of the sights of the players ({@link sightCost}). */
  readonly cost: number;
  /** The indices of the blocked players. */
  readonly blind: readonly number[];
  /** The largest hidden share of the head and the baton paw of a player ({@link SightResult}). */
  readonly worst: number;
  /** The height of the floor under each player. */
  readonly heights: readonly number[];
  readonly angles: readonly number[];
  readonly placement: RowPlacement;
  /** The risers of the raised groups. */
  readonly risers: readonly RowRiser[];
  /** The number of blocked players of each seat group. */
  readonly blocked: readonly number[];
  /**
   * The height to which each seat group must rise, because a riser of a neighbor group goes into
   * one of its items, or 0.
   */
  readonly lifts: readonly number[];
  /**
   * True if a riser goes into an item of the row or of the stage, or if a raised group has no
   * riser.
   */
  readonly contact: boolean;
}

/**
 * Gives each seat group the lowest height with its fewest blocked players over the tries.
 *
 * @param tries The tries of the row.
 * @param groups The seat groups of the row.
 * @returns The height of each group.
 */
function chosenHeights(
  tries: readonly SightTry[],
  groups: readonly (readonly number[])[],
): number[] {
  return groups.map((group, k) => {
    let best = { blocked: Infinity, height: 0 };
    for (const t of tries) {
      const count = t.blocked[k] ?? 0;
      const height = t.heights[group[0] ?? 0] ?? 0;
      if (count < best.blocked || (count === best.blocked && height < best.height)) {
        best = { blocked: count, height };
      }
    }
    return best.height;
  });
}

/**
 * Places each row so that each player sees the head and the baton paw of the conductor (design
 * 4.5, seat geometry), from the front row to the back row. {@link sightSweepSteps} moves the
 * players along the row. From row 2, each seat group with a blocked player then rises by
 * {@link ROW_RISER}.step, up to its largest height, and the players move again. Each group takes
 * the lowest height with its fewest blocked players. A try with a riser that does not fit on the
 * stage is not valid. The strings sit on the stage top. After row 1, the players of row 0 move
 * for the back desks ({@link FRONT_MOVES}). The moves keep the gaps, the stage, and the limits of
 * the spread. When a back desk stays blocked and loses at least {@link OPEN_GAP_HIDDEN} of the
 * conductor, row 1 tries again with the gap of the conductor open: its inner players can pass 0°,
 * and the view of the audience counts in the cost. The row keeps this try only when it has fewer
 * blocked players.
 *
 * @param rows The rows after the spread, from the front.
 * @param fixed The obstacles that do not move: the podium with the conductor, the soloist, the
 *   risers, and the singers.
 * @param soloists The obstacles of the soloists. They are also in `fixed`.
 * @param soloPianos The obstacles of the piano soloists. They are also in `fixed`.
 * @param stage The stage side and the front distance.
 * @param targets The points of the conductor.
 * @param packed The rows before the spread. Row 0 keeps the packed gap of the conductor.
 * @returns The steps, which return the rows with their risers.
 */
function* sightRowsSteps(
  rows: readonly FittedRow[],
  fixed: readonly Obstacle[],
  soloists: readonly Obstacle[],
  soloPianos: readonly Obstacle[],
  stage: StageSize,
  targets: SightTargets,
  packed: readonly FittedRow[],
): Steps<SeenRow[]> {
  /**
   * Places one row behind the rows that are done.
   *
   * @param row The row after the spread.
   * @param n The index of the row in `rows`.
   * @param done The rows in front, after their sight pass.
   * @param memo The known sights of the players of the row, or `null`.
   * @param open True if a row that stays blocked can also try the gap of the conductor.
   * @returns The steps, which return the row with its risers, its cost, and its blocked players.
   */
  const seeRow = function* (
    row: FittedRow,
    n: number,
    done: readonly SeenRow[],
    memo: SightMemo | null,
    open = false,
  ): Steps<RowSight> {
    const behind = rows.slice(n + 1);
    const placedRows = done.map((d) => d.row.placement);
    const doneRisers = done.flatMap((d) => d.risers.map((r) => rowRiserObstacle(r, CENTER)));
    const clearance = clearanceOf(
      fixed,
      soloPianos,
      done.map((d) => d.row),
      behind,
    );
    const blockers = blockersOf(soloists, done);
    const arcs = row.members.map((m, i) => {
      const right = row.members[i + 1];
      return right ? runAll(spacingSteps(m, right, row.radius)) / row.radius : 0;
    });
    // The items around the row that a riser must not go into: the fixed items, the items and
    // the risers of the rows in front, and the items of the rows behind.
    const around = [
      ...fixed,
      ...placedRows.flatMap(obstaclesOfRow),
      ...doneRisers,
      ...behind.flatMap((r) => obstaclesOfRow(r.placement)),
    ];
    const groups = seatGroups(row.members);
    const groupIndex = row.members.map((_, i) => groups.findIndex((g) => g.includes(i)));
    const extents = groupExtents(row.members, row.placement, groups);
    const view = row.row >= AUDIENCE.firstRow ? stage.side : null;
    // The back desks can move into the gap of the conductor up to the inner first desks, so
    // that a desk fits into the gap between two players of the first row.
    const front = done.find((d) => d.row.row === 0)?.row;
    const inner =
      row.row === BACK_DESK_ROW && front ? Math.min(...front.angles.map((a) => Math.abs(a))) : null;
    // Each group from row 2 can rise. A try in which the riser of a raised group does not fit at
    // the new places of its players is not valid.
    const rises = groups.map(() => row.row >= ROW_RISER.firstRow);

    // With `gap`, the back desks can also pass 0° into the gap of the conductor.
    const attempt = function* (levels: readonly number[], gap = false): Steps<SightTry> {
      const heights = groupIndex.map((k) => levels[k] ?? 0);
      let angles = gap
        ? yield* sightSweepSteps(
            { ...row, split: false },
            heights,
            arcs,
            targets,
            blockers,
            stage.side,
          )
        : yield* sightSweepSteps(row, heights, arcs, targets, blockers, view, inner, memo);
      let placement = placeRow(row.members, angles, row.radius, heights);
      if (
        angles.some((a) => Math.abs(a) > SPREAD_LIMITS.maxAngle + 1e-9) ||
        !rowOnStage(placement, stage) ||
        !rowClear(placement, clearance)
      ) {
        angles = [...row.angles];
        placement = placeRow(row.members, angles, row.radius, heights);
      }
      const bodies = placement.players.map((p) => p.obstacle);
      const stands = [...blockers.stands, ...placement.stands.map((p) => p.obstacle)];
      // A player of a raised row that the audience does not see counts as blocked, so that its
      // group rises.
      let cost = 0;
      let worst = 0;
      const blind = row.members.map((member, i) => {
        const place = placement.players[i]?.place;
        if (place === undefined) {
          return false;
        }
        const others = {
          solid: [...blockers.solid, ...bodies.filter((_, j) => j !== i)],
          stands,
        };
        const seen = sightOf(member.sight, place, targets, others);
        const hidden = view === null ? 0 : audienceShare(member.sight, place, others.solid, view);
        cost += sightCost(seen) + 300 * hidden;
        worst = Math.max(worst, seen.hidden);
        return seen.sight === 2 || hidden >= AUDIENCE.hidden;
      });
      // A row with no raised group has no riser to check.
      const raised = levels.some((h) => h > 0);
      const placed = raised ? groupExtents(row.members, placement, groups) : [];
      const own = levels.map((h, k) => (h > 0 ? groupRiser(row, placed, k, h, stage) : null));
      const owners = raised ? standGroups(row.members, placement, groups) : [];
      const items = raised
        ? [
            ...placement.players.map((p, i) => ({
              obstacle: p.obstacle,
              group: groupIndex[i] ?? -1,
            })),
            ...placement.stands.map((p, j) => ({
              obstacle: p.obstacle,
              group: owners[j] ?? -1,
            })),
          ]
        : [];
      return {
        cost,
        blind: blind.flatMap((b, i) => (b ? [i] : [])),
        worst,
        heights,
        angles,
        placement,
        risers: joinRisers(own),
        blocked: groups.map((g) => g.filter((i) => blind[i]).length),
        ...riserContact(own, items, groups.length, around, levels),
      };
    };

    // The rows rise toward the back: a group starts at the height of the risers in front of it.
    const fronts = done.flatMap((d) => d.risers);
    const levels = extents.map((extent, k) =>
      rises[k]
        ? Math.max(
            0,
            ...fronts.filter((r) => r.from < extent.to && r.to > extent.from).map((r) => r.height),
          )
        : 0,
    );
    const tries: SightTry[] = [];
    for (;;) {
      const next = yield* attempt(levels);
      tries.push(next);
      let raised = false;
      next.blocked.forEach((count, k) => {
        const level = levels[k] ?? 0;
        const lift = next.lifts[k] ?? 0;
        if (rises[k] && lift > level + 1e-9) {
          levels[k] = lift;
          raised = true;
        } else if (count > 0 && rises[k] && level + ROW_RISER.step <= riserTop(row.row) + 1e-9) {
          levels[k] = Math.round((level + ROW_RISER.step) * 1000) / 1000;
          raised = true;
        }
      });
      if (!raised) {
        break;
      }
    }
    const chosen = chosenHeights(tries, groups);
    // A try with the chosen heights gives the same try again.
    const same = tries.find((t) =>
      groups.every((g, k) => Math.abs((t.heights[g[0] ?? 0] ?? 0) - (chosen[k] ?? 0)) < 1e-9),
    );
    const last = same ?? (yield* attempt(chosen));
    const total = (t: SightTry): number => t.blocked.reduce((a, b) => a + b, 0);
    const lift = (t: SightTry): number => t.heights.reduce((a, b) => a + b, 0);
    const valid = [last, ...tries].filter((t) => !t.contact);
    // The row on the stage top has no riser, so it is the try of last resort.
    let pick =
      valid.length > 0
        ? valid.reduce((a, b) =>
            total(b) < total(a) || (total(b) === total(a) && lift(b) < lift(a)) ? b : a,
          )
        : yield* attempt(groups.map(() => 0));
    // A side of the back desks with no free arc can use the gap of the conductor.
    if (open && pick.blind.length > 0) {
      const wide = yield* attempt(
        groups.map(() => 0),
        true,
      );
      if (!wide.contact && wide.blind.length < pick.blind.length) {
        pick = wide;
      }
    }
    return {
      seen: {
        row: { ...row, angles: pick.angles, placement: pick.placement },
        risers: pick.risers,
      },
      cost: pick.cost,
      blind: pick.blind,
      worst: pick.worst,
    };
  };

  /**
   * Moves the players of row 0 so that the back desks of row 1 see the conductor (design 4.5,
   * seat geometry). The spread gives each gap of row 0 the same arc, but a desk of two partners
   * fits into a gap only when the gap is a little larger. A greedy search tries runs of neighbors
   * of one side next to each blocked back desk player: the player alone, the player with one
   * neighbor, and the player with all players to the inside or to the outside. Each run moves by
   * 1° steps up to {@link FRONT_MOVES}.shift, and the move with the lowest cost of row 1 wins, for
   * up to {@link FRONT_MOVES}.rounds rounds. A move keeps the packed arcs, the packed gap of the
   * conductor, the stage, the gaps to the other items, and the sight of row 0 past the soloists.
   *
   * @param front Row 0 after its sight pass.
   * @param at The index of row 0 in `rows`.
   * @param back Row 1 after the spread.
   * @param n The index of row 1 in `rows`.
   * @param first Row 1 behind the spread row 0.
   * @returns The steps, which return row 0 and row 1.
   */
  const moveFrontSteps = function* (
    front: FittedRow,
    at: number,
    back: FittedRow,
    n: number,
    first: RowSight,
  ): Steps<{ front: FittedRow; back: RowSight }> {
    const packedFront = packed.find((r) => r.row === front.row);
    const arcs = front.members.map((m, i) => {
      const right = front.members[i + 1];
      return right ? runAll(spacingSteps(m, right, front.radius)) / front.radius : 0;
    });
    const clearance = clearanceOf(fixed, soloPianos, [], rows.slice(at + 1));
    const frontBlind = (placement: RowPlacement): number => {
      const bodies = placement.players.map((p) => p.obstacle);
      const stands = placement.stands.map((p) => p.obstacle);
      return front.members.filter((member, i) => {
        const place = placement.players[i]?.place;
        const solid = [...soloists, ...bodies.filter((_, j) => j !== i)];
        return (
          place !== undefined &&
          sightOf(member.sight, place, targets, { solid, stands }).sight === 2
        );
      }).length;
    };
    const blindBefore = frontBlind(front.placement);
    // The sights of the back row for each move of the front row. A front player hides no target
    // of a back player more than {@link FRONT_MOVES}.reach away in angle, so the key holds only
    // the moves of the front players near the angle.
    const known = new Map<string, SightResult>();
    let best = first;
    let angles = [...front.angles];
    for (let round = 0; round < FRONT_MOVES.rounds && best.blind.length > 0; round++) {
      const runs: number[][] = [];
      for (const i of best.blind) {
        const a = best.seen.row.angles[i] ?? 0;
        const nearest = angles
          .map((b, j) => ({ d: Math.abs(b - a), j }))
          .toSorted((x, y) => x.d - y.d)
          .slice(0, 2);
        for (const { j } of nearest) {
          const same = (k: number): boolean =>
            Math.sign(angles[k] ?? 0) === Math.sign(angles[j] ?? 0);
          let inside = j;
          let outside = j;
          while (inside > 0 && same(inside - 1)) {
            inside--;
          }
          while (outside < angles.length - 1 && same(outside + 1)) {
            outside++;
          }
          const span = (from: number, to: number): number[] =>
            Array.from({ length: to - from + 1 }, (_, q) => from + q);
          runs.push([j], span(inside, j), span(j, outside));
          if (j > inside) {
            runs.push([j - 1, j]);
          }
          if (j < outside) {
            runs.push([j, j + 1]);
          }
        }
      }
      let chosen: { angles: number[]; back: RowSight } | null = null;
      for (const run of runs) {
        for (let k = -FRONT_MOVES.shift; k <= FRONT_MOVES.shift; k++) {
          if (k === 0) {
            continue;
          }
          yield;
          const next = angles.map((b, i) =>
            run.includes(i) ? b + k * CONDUCTOR_SIGHT.nudgeStep : b,
          );
          const valid = next.every(
            (a, i) =>
              Math.abs(a) <= SPREAD_LIMITS.maxAngle + 1e-9 &&
              Math.sign(a) === Math.sign(angles[i] ?? 0) &&
              Math.abs(a) >= Math.abs(packedFront?.angles[i] ?? 0) - 1e-9 &&
              (i === next.length - 1 || (next[i + 1] ?? 0) - a >= (arcs[i] ?? 0) - 1e-9),
          );
          if (!valid) {
            continue;
          }
          const placement = placeRow(front.members, next, front.radius);
          if (
            !rowOnStage(placement, stage) ||
            !rowClear(placement, clearance) ||
            frontBlind(placement) > blindBefore
          ) {
            continue;
          }
          const steps = next.map((b, i) =>
            Math.round((b - (front.angles[i] ?? 0)) / CONDUCTOR_SIGHT.nudgeStep),
          );
          const key = (i: number, angle: number): string => {
            let text = `${i}:${Math.round(angle * 1e4)}`;
            next.forEach((b, j) => {
              if (Math.abs(b - angle) < FRONT_MOVES.reach) {
                text += `:${j}=${steps[j]}`;
              }
            });
            return text;
          };
          const memo: SightMemo = {
            get: (i, angle) => known.get(key(i, angle)),
            set: (i, angle, result) => {
              known.set(key(i, angle), result);
            },
          };
          const moved: SeenRow = { row: { ...front, angles: next, placement }, risers: [] };
          const result = yield* seeRow(back, n, [moved], memo);
          if (result.cost < (chosen?.back.cost ?? best.cost) - 1e-6) {
            chosen = { angles: next, back: result };
          }
        }
      }
      if (!chosen) {
        break;
      }
      angles = chosen.angles;
      best = chosen.back;
    }
    const placement = placeRow(front.members, angles, front.radius);
    return { front: { ...front, angles, placement }, back: best };
  };

  const done: SeenRow[] = [];
  for (const [n, row] of rows.entries()) {
    let result = yield* seeRow(row, n, done, null);
    const at = done.findIndex((d) => d.row.row === 0);
    const front = done[at];
    if (row.row === BACK_DESK_ROW && result.blind.length > 0 && front) {
      const moved = yield* moveFrontSteps(front.row, at, row, n, result);
      done[at] = { row: moved.front, risers: [] };
      result = moved.back;
      if (result.worst >= OPEN_GAP_HIDDEN) {
        result = yield* seeRow(row, n, done, null, true);
      }
    }
    done.push(result.seen);
  }
  return done;
}

/** The largest lift of the choir risers for the sight of the singers, in meters. */
const CHOIR_LIFT = 1.0;

/**
 * Finds the lift of the choir risers (design 4.5, seat geometry): the lowest lift in steps of
 * {@link ROW_RISER}.step, up to {@link CHOIR_LIFT}, at which each singer sees the head and the
 * baton paw of the conductor over the rows and their risers, or else the lowest lift with the
 * fewest blocked singers. A lift moves only up, so the risers keep their gaps.
 *
 * @param choir The singers and the risers.
 * @param members The players of the score, by their index.
 * @param rows The rows after the sight pass.
 * @param soloists The obstacles of the soloists.
 * @param targets The points of the conductor.
 * @returns The lift, in meters.
 */
function choirLift(
  choir: ChoirPlacement,
  members: readonly Member[],
  rows: readonly SeenRow[],
  soloists: readonly Obstacle[],
  targets: SightTargets,
): number {
  const blockers = blockersOf(soloists, rows);
  let best = { lift: 0, blocked: Infinity };
  for (let k = 0; k * ROW_RISER.step <= CHOIR_LIFT + 1e-9; k++) {
    const lift = Math.round(k * ROW_RISER.step * 1000) / 1000;
    const blocked = choir.singers.filter((singer) => {
      const member = members[singer.index];
      const [x, y, z] = singer.place.position;
      const place = { ...singer.place, position: [x, y + lift, z] as const };
      return member !== undefined && sightOf(member.sight, place, targets, blockers).sight === 2;
    }).length;
    if (blocked < best.blocked) {
      best = { lift, blocked };
    }
    if (blocked === 0) {
      break;
    }
  }
  return best.lift;
}

/**
 * Checks that each player of the cast has a place, and gives the places in the order of the cast
 * (design 5.1).
 *
 * @param places The place of each player in the order of the cast, or `undefined` for a player
 *   that no row placed.
 * @param cast The cast, for the message of the error.
 * @returns The places.
 * @throws {Error} If a player has no place, because then `SceneLayout.players` no longer
 *   follows the order of the cast.
 */
export function placesOfCast(
  places: readonly (PlayerPlace | undefined)[],
  cast: readonly PlayerCast[],
): PlayerPlace[] {
  return places.map((place, i) => {
    if (!place) {
      const c = cast[i];
      throw new Error(
        `The layout has no place for player ${i} (${c?.species} ${c?.instrument}, seat ${c?.seatIndex}).`,
      );
    }
    return place;
  });
}

/**
 * Moves the players and the stands of a layout from the podium center onto the stage.
 *
 * @param places The place of each player in the order of the cast.
 * @param cast The cast, for the check of {@link placesOfCast}.
 * @param stands The placed stands.
 * @param move The move onto the stage.
 * @returns The players and the stands of the layout.
 * @throws {Error} If a player has no place.
 */
function onStage(
  places: readonly (PlayerPlace | undefined)[],
  cast: readonly PlayerCast[],
  stands: readonly PlacedStand[],
  move: (p: Vec3) => Vec3,
): Pick<SceneLayout, 'players' | 'stands'> {
  return {
    players: placesOfCast(places, cast).map((p): PlayerPlace => ({
      position: move(p.position),
      facing: p.facing,
      cast: p.cast,
    })),
    stands: stands.map((stand): StandPlace => ({
      position: move(stand.place.position),
      facing: stand.place.facing,
      deskHeight: stand.place.deskHeight,
    })),
  };
}

/**
 * Calculates the positions of the stage, the players, the music stands, and the risers for a
 * score (design 4.5, 5.1). The sections sit in rows around the podium. The footprints of the
 * players, their instruments, their seats, and the stands keep 0.05 m from each other: a seat
 * arc grows for a wide footprint, and a row moves back until it is clear of the items in front.
 * A player behind a piano case keeps {@link PIANO_REACH_GAP} from it.
 *
 * @param score The score.
 * @param models The player models of the score. The pose plan and the scene can share this cache,
 *   so that each kind of player builds its model one time. A new cache by default.
 * @returns The layout, with the players in the order of `castScore()`.
 * @throws {Error} If a player has no place.
 */
export function layoutScene(score: Score, models = new ModelCache()): SceneLayout {
  return runAll(layoutSceneSteps(score, models));
}

/**
 * Finds if a keyboard of the orchestra takes the place of the piano soloist (design 4.2): the
 * first keyboard of a score with no soloist. At the front left of the conductor, its case and its
 * open lid stand in front of the rows, so they hide the conductor from no player, as the piano
 * of `orchestra-latest.png`. In row 2, the case hid the conductor from the players behind it.
 *
 * @param score The score.
 * @param seat The seat of the player.
 * @param groups The row groups of the players before it.
 * @returns True if the player sits at the place of the piano soloist.
 */
function takesSoloPlace(
  score: Score,
  seat: Seat | undefined,
  groups: readonly RowGroup[],
): boolean {
  return score.soloist === null && seat?.section === 'piano' && !groups.includes('soloist');
}

/**
 * Calculates the layout of a score as {@link layoutScene} does, in steps (design 7.2). The steps
 * build each player model that the layout needs.
 *
 * @param score The score.
 * @param models The player models of the score.
 * @returns The steps, which return the layout.
 * @throws {Error} If a player has no place.
 */
export function* layoutSceneSteps(score: Score, models: ModelCache): Steps<SceneLayout> {
  const cast = castScore(score);
  const form = chamberFormOf(score.seats);
  const groups: RowGroup[] = [];
  const members: Member[] = [];
  for (const [index, c] of cast.entries()) {
    yield* models.getSteps(c.species, c.instrument, c.kettles, c.support);
    yield;
    const seat = score.seats[c.seatIndex];
    if (form === 'solo' || form === 'recital') {
      // A player alone or in a recital has the place of a soloist, with no turn and no stand.
      groups.push('soloist');
    } else if (form === 'arc' && seat?.section === 'piano') {
      groups.push('piano');
    } else if (form === 'arc') {
      groups.push(seat ? groupOf(seat, c.player) : 'choir');
    } else if (c.seatIndex === score.soloist || takesSoloPlace(score, seat, groups)) {
      groups.push('soloist');
    } else if (c.seatIndex === score.vocalSoloists) {
      groups.push('vocal-soloists');
    } else {
      groups.push(seat ? groupOf(seat, c.player) : 'choir');
    }
    const section = !seat || seat.section === 'sound-only' ? 'choir' : seat.section;
    members.push(memberOf(c, index, section, models, groups.at(-1) ?? 'choir'));
  }
  yield* models.getSteps(CONDUCTOR.species, CONDUCTOR.instrument);
  yield;
  if (form) {
    return layoutChamber(form, members, cast, groups);
  }
  const inGroup = (group: RowGroup): Member[] => members.filter((m) => groups[m.index] === group);
  const players: (PlayerPlace | undefined)[] = members.map(() => undefined);
  const fixed: Obstacle[] = [conductorObstacle(CENTER, models)];

  let soloistFront = -Infinity;
  const soloPianos: Obstacle[] = [];
  const soloists: Obstacle[] = [];
  for (const member of inGroup('soloist')) {
    const soloist = placeSoloist(member);
    players[member.index] = soloist.place;
    fixed.push(soloist.obstacle);
    soloists.push(soloist.obstacle);
    if (member.cast.instrument === 'piano') {
      soloPianos.push(soloist.obstacle);
    }
    soloistFront = Math.max(soloistFront, soloist.front);
  }

  const rows: FittedRow[] = [];
  let radius = FIRST_ROW_RADIUS - ROW_STEP;
  for (const [n, rowGroups] of ROWS.entries()) {
    const row = rowGroups.flatMap(inGroup);
    if (row.length === 0) {
      continue;
    }
    const fit = yield* fitRowSteps(
      row,
      n,
      radius + ROW_STEP,
      clearanceOf(fixed, soloPianos, rows, []),
    );
    radius = fit.radius;
    rows.push(fit);
  }
  const withRows = (fitted: readonly FittedRow[]): (PlayerPlace | undefined)[] => {
    const places = [...players];
    for (const p of fitted.flatMap((r) => r.placement.players)) {
      places[p.index] = p.place;
    }
    return places;
  };
  // The stage holds the items of the rows. The space of a riser is wider than its riser.
  const obstacles = [...fixed, ...rows.flatMap((r) => obstaclesOfRow(r.placement))];
  const reserves = rows.flatMap((r) => (r.reserve ? [rowRiserObstacle(r.reserve, CENTER)] : []));

  const empty: ChoirPlacement = { singers: [], risers: [], obstacles: [] };
  let choir = empty;
  let draft: Draft = {
    players: withRows(rows),
    risers: [],
    obstacles,
    soloistFront,
  };
  const singers = inGroup('choir');
  const soloSingers = inGroup('vocal-soloists');
  const choirLevels = RISER.levels - (soloSingers.length > 0 ? 1 : 0);
  // The count of levels that gives the smallest stage wins, and fewer levels win a tie.
  let best = Infinity;
  for (let levels = 1; levels <= Math.min(choirLevels, singers.length); levels++) {
    yield;
    const candidateChoir = fitChoir(
      singers,
      levels,
      radius + ROW_STEP,
      [...obstacles, ...reserves],
      soloSingers,
    );
    const withChoir = withRows(rows);
    for (const s of candidateChoir.singers) {
      withChoir[s.index] = s.place;
    }
    const candidate: Draft = {
      players: withChoir,
      risers: candidateChoir.risers,
      obstacles: [...obstacles, ...candidateChoir.obstacles],
      soloistFront,
    };
    const { side } = stageOf(candidate);
    if (side < best - 1e-9) {
      best = side;
      draft = candidate;
      choir = candidateChoir;
    }
  }

  const stage = stageOf(draft);
  const still = [...fixed, ...choir.obstacles];
  const targets = sightTargets();
  // The rows spread inside the stage, and the stage side stays (design 4.5, stage origin).
  const spread = yield* spreadRowsSteps(rows, still, soloPianos, stage);
  yield;
  const seen = yield* sightRowsSteps(spread, still, soloists, soloPianos, stage, targets, rows);
  const final = seen.map((r) => r.row);
  const rowRisers = seen.flatMap((r) => r.risers);
  const lift = choirLift(choir, members, seen, soloists, targets);
  const places = withRows(final);
  for (const s of choir.singers) {
    const [x, y, z] = s.place.position;
    places[s.index] = { ...s.place, position: [x, y + lift, z] };
  }
  const others = [
    ...fixed,
    ...final.flatMap((r) => obstaclesOfRow(r.placement)),
    ...rowRisers.map((r) => rowRiserObstacle(r, CENTER)),
  ];
  const lifted = draft.risers.map((level): RiserLevel => ({
    level: level.level,
    radius: level.radius,
    height: level.height + lift,
    halfAngle: level.halfAngle,
  }));
  const risers = widenRisers(lifted, others, stage);
  const podium: Vec3 = [0, 0, stage.side / 2 - stage.front];
  const move = (p: Vec3): Vec3 => [p[0] + podium[0], p[1] + podium[1], p[2] + podium[2]];
  return {
    stageSide: stage.side,
    podium,
    conductor: conductorOn(podium),
    ...onStage(
      places,
      cast,
      final.flatMap((r) => r.placement.stands),
      move,
    ),
    risers,
    rowRisers,
  };
}
