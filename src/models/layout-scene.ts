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
import type { ConductorPlace, PlayerPlace, RiserLevel, SceneLayout, StandPlace } from './layout.ts';
import type { Vec3 } from './tuples.ts';
import { ModelCache } from './model-cache.ts';
import type { PlayerModel } from './player.ts';
import { RISER, riserStair, standDeskHeight } from './props.ts';
import { boneIndex } from './rig.ts';
import { CONDUCTOR_STAND, PODIUM_FROM_FRONT, PODIUM_SIZE, keepsStageMargin } from './stage.ts';
import { pieceBounds } from './instruments/piece.ts';
import {
  AUDIENCE,
  CONDUCTOR_SIGHT,
  attachSightMesh,
  audienceShare,
  eyesOf,
  hidersOf,
  sightCost,
  sightNear,
  sightOf,
  sightTargets,
} from './sight.ts';
import type { SightBlockers, SightResult, SightTargets } from './sight.ts';

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
 * player behind the case faces it and reaches toward it in play.
 */
const PIANO_REACH_GAP = 0.15;

/**
 * The band of the back desks of the strings over the whole arc (design 4.5, seat geometry,
 * {@link backDeskBand}). The items of the other rows keep their gaps from it, so that the back
 * desks can move along the arc after the spread.
 */
const BACK_DESK_BAND = {
  /** The height of the band above the stage top, in meters. */
  height: 1.2,
  /** The edge of the band in front of the stands of the row and at its ends, in meters. */
  lip: 0.05,
} as const;

/** The step by which a row, a stand, or a seat arc grows until it is clear, in meters. */
const CLEAR_STEP = 0.02;

/** The room for the chair and the margin at the edge of the stage (design 4.5, stage origin). */
const CHAIR_ROOM = 0.5;
const EDGE_MARGIN = 0.3;

/** The smallest stage side (design 4.5, stage origin). */
export const SMALLEST_STAGE = 5;

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
 * piano of a concerto: the pianist faces +x, and the lid opens to the audience. A case that
 * faced the podium would push its row far back.
 */
const KEYBOARD_TURN = Math.PI / 2;

/**
 * The place of a soloist that does not play the piano, from the podium center: 1.75 m to the
 * left and 0.35 m to the front (design 4.5, seat geometry). It is the front left of the
 * conductor, as in a concerto. The default view and the wide views then see the heads, the arms,
 * and the violins of the first desk beside the soloist.
 */
export const SOLOIST_PLACE = [-1.75, 0.35] as const;

/**
 * The facing of a soloist that does not play the piano: the audience, turned 40° to the
 * conductor (design 4.5, seat geometry). Thus the default view sees the face of the soloist, and
 * the soloist sees the conductor at the side.
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

/** The largest angle of one box of an arc of the choir risers or a band, for the overlap test. */
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
  attachSightMesh(obstacle, member.model, position, facing);
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
 * @param height The height of the floor under the stand: a level of the choir risers, or 0.
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
 * @param heights The height of the floor under each player: a level of the choir risers, or 0.
 *   A stand stands at the height of its first reader.
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
   * The band of the back desks of the strings ({@link backDeskBand}), or `null` for the other
   * rows. The other items keep their gaps from it, so the back desks can move after the spread.
   */
  readonly band: ArcBlock | null;
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
    // The band of the back desks lets them move along the arc after the spread.
    const band = row === BACK_DESK_ROW ? backDeskBand(placement) : null;
    if (
      rowClear(placement, clearance) &&
      (!band || !touchesAny([arcBlockObstacle(band, CENTER)], clearance.placed))
    ) {
      return { members, row, split, radius, angles, placement, band };
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
 * Gives the band of the back desks of the strings (design 4.5, seat geometry): from
 * {@link BACK_DESK_BAND}.lip in front of the stands of the row to the back of its chairs, over the
 * largest arc of a spread row. The spread and the sight pass move the items of the row only along
 * its arc, so they stay in this band.
 *
 * @param row The places of the packed row.
 * @returns The band.
 */
function backDeskBand(row: RowPlacement): ArcBlock {
  const { inner, outer } = rowExtent(row);
  // A seat at 90° reaches past 90° by half a chair and the lip.
  const end = SPREAD_LIMITS.maxAngle + (CHAIR_ROOM + BACK_DESK_BAND.lip) / inner;
  return {
    inner: inner - BACK_DESK_BAND.lip,
    outer,
    height: BACK_DESK_BAND.height,
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
 * Makes the obstacle of one riser level: one box for each part of at most 5° of its arc. The
 * lowest level also holds the curved stair at each side end, with one arc block for each step
 * ({@link riserStair}).
 *
 * @param level The level.
 * @param podium The podium center.
 * @returns The obstacle.
 */
function riserObstacle(level: RiserLevel, podium: Vec3): Obstacle {
  const parts = Math.max(1, Math.ceil((2 * level.halfAngle) / RISER_BOX_ANGLE));
  const step = (2 * level.halfAngle) / parts;
  const outer = level.radius + RISER.depth / 2;
  const size: Vec3 = [
    2 * outer * Math.sin(step / 2),
    level.height,
    RISER.depth + outer * (1 - Math.cos(step / 2)),
  ];
  const box = footprintOf([centeredBox([0, level.height / 2, 0], size)]);
  const boxes = Array.from({ length: parts }, (_, i) => {
    const spot = seatAt(podium, -level.halfAngle + (i + 0.5) * step, level.radius);
    return placeFootprint(box, spot.position, spot.facing);
  }).flat();
  const name = `riser level ${level.level}`;
  if (level.level > 0) {
    return obstacleOf(name, boxes);
  }

  const stair = riserStair(level);
  const band = { inner: stair.inner, outer: stair.outer };
  const stairs = stair.steps
    .flatMap(({ from, to, top }): ArcBlock[] => [
      { ...band, height: top, from, to },
      { ...band, height: top, from: -to, to: -from },
    ])
    .flatMap((block) => arcBlockObstacle(block, podium).boxes);
  return obstacleOf(name, [...boxes, ...stairs]);
}

/** An arc block around the podium center, from the stage top to its height. */
interface ArcBlock {
  /** The distance of the front face from the podium center, in meters. */
  readonly inner: number;
  /** The distance of the back face from the podium center, in meters. */
  readonly outer: number;
  /** The height of the top above the stage top, in meters. */
  readonly height: number;
  /** The angle of the left end, in radians. 0 points to the back, and the left is negative. */
  readonly from: number;
  /** The angle of the right end, in radians. */
  readonly to: number;
}

/**
 * Makes the obstacle of an arc block: one box for each part of at most 5° of its arc, from the
 * stage top to its height.
 *
 * @param block The block.
 * @param podium The podium center.
 * @returns The obstacle.
 */
function arcBlockObstacle(block: ArcBlock, podium: Vec3): Obstacle {
  const parts = Math.max(1, Math.ceil((block.to - block.from) / RISER_BOX_ANGLE));
  const step = (block.to - block.from) / parts;
  const front = block.inner * Math.cos(step / 2);
  const size: Vec3 = [2 * block.outer * Math.sin(step / 2), block.height, block.outer - front];
  const box = footprintOf([centeredBox([0, block.height / 2, 0], size)]);
  const boxes = Array.from({ length: parts }, (_, i) => {
    const spot = seatAt(podium, block.from + (i + 0.5) * step, (front + block.outer) / 2);
    return placeFootprint(box, spot.position, spot.facing);
  }).flat();
  return obstacleOf('arc block', boxes);
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
 * player with its instrument and its seat, each music stand, and each level of the choir risers.
 * The overlap test and the layout use the same footprints.
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
  const risers = layout.risers.map((level) => riserObstacle(level, layout.podium));
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
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const add = (x: number, z: number, rx: number, rz: number): void => {
    x0 = Math.min(x0, x - rx);
    z0 = Math.min(z0, z - rz);
    x1 = Math.max(x1, x + rx);
    z1 = Math.max(z1, z + rz);
  };
  const seat = CHAIR_ROOM + EDGE_MARGIN;
  for (const p of players) {
    add(p.place.position[0], p.place.position[2], seat, seat);
  }
  for (const b of [...players, ...stands].flatMap((p) => p.obstacle.boxes)) {
    add(b.x, b.z, reachOn(b, 1, 0) + EDGE_MARGIN, reachOn(b, 0, 1) + EDGE_MARGIN);
  }
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
 * @returns True if each corner of the box keeps the margin of 0.3 m.
 */
export function boxOnStage(b: PlacedBox, stage: StageSize): boolean {
  // The z of the stage center, relative to the podium center.
  const center = stage.front - stage.side / 2;
  return boxCorners(b).every(([x, z]) => keepsStageMargin(x, z - center, stage.side, EDGE_MARGIN));
}

/**
 * Finds if each angle of a row stays within ±90° ({@link SPREAD_LIMITS}).
 *
 * @param angles The angle of each player.
 * @returns True if each angle is inside.
 */
function withinSpread(angles: readonly number[]): boolean {
  return !angles.some((a) => Math.abs(a) > SPREAD_LIMITS.maxAngle + 1e-9);
}

/**
 * Finds if each box of a row keeps the edge margin from the outline of the stage, and if the row
 * keeps its gaps from the other items ({@link rowClear}).
 *
 * @param row The places of the row, relative to the podium center.
 * @param clearance The other items on the stage.
 * @param stage The stage side and the front distance.
 * @returns True if the row fits.
 */
function rowFits(row: RowPlacement, clearance: RowClearance, stage: StageSize): boolean {
  return (
    obstaclesOfRow(row).every((obstacle) => obstacle.boxes.every((b) => boxOnStage(b, stage))) &&
    rowClear(row, clearance)
  );
}

/**
 * Places a row at the first angles of a list that keep each seat within ±90°, each box 0.3 m from
 * the edges, and each footprint its gaps from the other items ({@link rowFits}), in steps.
 *
 * @param row The row.
 * @param tries The angles of the players to try, in order.
 * @param clearance The other items on the stage.
 * @param stage The stage side and the front distance.
 * @returns The steps, which return the row at the first angles that fit, or the same row.
 */
function* firstFitSteps(
  row: FittedRow,
  tries: readonly (readonly number[])[],
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  for (const angles of tries) {
    yield;
    if (!withinSpread(angles)) {
      continue;
    }
    const placement = placeRow(row.members, angles, row.radius);
    if (rowFits(placement, clearance, stage)) {
      return { ...row, angles, placement };
    }
  }
  return row;
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
function spreadSideSteps(
  row: FittedRow,
  side: -1 | 1,
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  const tries: number[][] = [];
  for (let k = SPREAD_LIMITS.maxArc / SEATED_ARC; k > 1 + 1e-9; k -= SPREAD_STEP) {
    tries.push(spreadAngles(row, side, k));
  }
  return firstFitSteps(row, tries, clearance, stage);
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
function wedgeSideSteps(
  spread: FittedRow,
  packed: FittedRow,
  front: FittedRow,
  side: -1 | 1,
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  const target = wedgeAngles(packed, front, side);
  const steps = Math.round(1 / WEDGE_STEP);
  const tries = Array.from({ length: steps }, (_, j) => {
    const blend = (steps - j) / steps;
    return spread.angles.map((angle, i) =>
      side * (packed.angles[i] ?? 0) > 0 ? angle + blend * ((target[i] ?? angle) - angle) : angle,
    );
  });
  return firstFitSteps(spread, tries, clearance, stage);
}

/**
 * The gaps of the conductor in row 0 that the layout tries (design 4.5, seat geometry): the angle
 * from 0° to which the inner first desk of each side moves out, in radians: 28° and 40°. The rows
 * behind the strings stand on the stage floor, and the heads of the seated strings are about as
 * high as the eyes of the conductor. Thus the winds, the brass, and the percussion see the
 * conductor through this gap. The layout keeps the gap with the fewest blocked players.
 */
const CONDUCTOR_GAPS = [(28 * Math.PI) / 180, (40 * Math.PI) / 180] as const;

/**
 * Calculates the angles of one side of a row with its inner player at an angle from 0° or farther
 * out. Each next player to the outside keeps its angle, or moves out to keep its packed arc
 * ({@link packedArcs}) from its inner neighbor.
 *
 * @param row The row.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @param gap The smallest angle of the inner player from 0°, in radians.
 * @returns The angle of each player. The players of the other side keep their angles.
 */
function gapAngles(row: FittedRow, side: -1 | 1, gap: number): number[] {
  const arcs = packedArcs(row);
  const order = row.angles
    .map((angle, i) => ({ out: side * angle, i }))
    .filter((p) => p.out > 0)
    .toSorted((a, b) => a.out - b.out);
  const next = [...row.angles];
  let inner = -1;
  for (const { out, i } of order) {
    const from = side * (next[inner] ?? 0);
    const at =
      inner < 0 ? Math.max(out, gap) : Math.max(out, from + (arcs[side > 0 ? inner : i] ?? 0));
    next[i] = side * at;
    inner = i;
  }
  return next;
}

/**
 * Widens the gap of the conductor on one side of row 0 (design 4.5, seat geometry), in steps. The
 * inner first desk moves out to an angle of {@link CONDUCTOR_GAPS}, or to the largest angle in
 * steps of 1° below it that keeps each seat within ±90°, each box 0.3 m from the edges, and each
 * footprint its gaps from the other items ({@link rowFits}). Its outer neighbors move out with it
 * ({@link gapAngles}).
 *
 * @param row Row 0 after the spread.
 * @param side -1 for the players left of 0°, 1 for the players right of 0°.
 * @param widest The angle of the gap, in radians.
 * @param clearance The other items on the stage.
 * @param stage The stage side and the front distance.
 * @returns The row with the new angles, or the same row if no wider gap fits.
 */
function widenGapSteps(
  row: FittedRow,
  side: -1 | 1,
  widest: number,
  clearance: RowClearance,
  stage: StageSize,
): Steps<FittedRow> {
  const inner = Math.min(...row.angles.filter((a) => side * a > 0).map((a) => side * a));
  const tries: number[][] = [];
  for (let gap = widest; gap > inner + 1e-9; gap -= CONDUCTOR_SIGHT.nudgeStep) {
    tries.push(gapAngles(row, side, gap));
  }
  return firstFitSteps(row, tries, clearance, stage);
}

/**
 * Spreads each instrumental row inside the stage, from the front (design 4.5, seat geometry), so
 * that the rows fill the front corners of the stage. The left side and the right side of a row
 * each get their own factor. Rows 0 and 1 keep the violins left of
 * 0° and the other strings right of it. After its spread, row 0 widens the gap of the conductor
 * ({@link widenGapSteps}), and row 1 moves its back desks toward their first desks
 * ({@link wedgeSideSteps}). The stage side does not change.
 *
 * @param rows The packed rows, from the front.
 * @param fixed The obstacles that do not move: the podium with the conductor, the soloist, the
 *   choir risers, and the singers.
 * @param soloPianos The obstacles of the piano soloists, which are also in `fixed`.
 * @param stage The stage side and the front distance.
 * @param gap The angle of the gap of the conductor in row 0, in radians.
 * @returns The rows after the spread.
 */
function* spreadRowsSteps(
  rows: readonly FittedRow[],
  fixed: readonly Obstacle[],
  soloPianos: readonly Obstacle[],
  stage: StageSize,
  gap: number,
): Steps<FittedRow[]> {
  const done: FittedRow[] = [];
  for (const [n, row] of rows.entries()) {
    const clearance = clearanceOf(fixed, soloPianos, done, rows.slice(n + 1));
    const left = yield* spreadSideSteps(row, -1, clearance, stage);
    let next = yield* spreadSideSteps(left, 1, clearance, stage);
    const front = done.find((r) => r.row === 0);
    if (row.row === 0) {
      next = yield* widenGapSteps(next, -1, gap, clearance, stage);
      next = yield* widenGapSteps(next, 1, gap, clearance, stage);
    }
    if (row.row === BACK_DESK_ROW && front) {
      next = yield* wedgeSideSteps(next, row, front, -1, clearance, stage);
      next = yield* wedgeSideSteps(next, row, front, 1, clearance, stage);
    }
    done.push(next);
  }
  return done;
}

/**
 * Gives the obstacles of a fitted row: its players and its stands, and its band.
 *
 * @param row The row.
 * @returns The obstacles.
 */
function rowObstacles(row: FittedRow): Obstacle[] {
  const own = obstaclesOfRow(row.placement);
  return row.band ? [...own, arcBlockObstacle(row.band, CENTER)] : own;
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

/** The known sights of the players of a row at their angles, for the moves of the row in front. */
interface SightMemo {
  readonly get: (i: number, angle: number) => SightResult | undefined;
  readonly set: (i: number, angle: number, result: SightResult) => void;
}

/**
 * Moves the players of a row along its arc so that each player sees the conductor through the
 * gaps of the rows in front (design 4.5, seat geometry). Each player can move up to
 * {@link CONDUCTOR_SIGHT}.nudge off its spread angle, in steps of `nudgeStep`. A search over each
 * side of the row, from its inner player to its outer player, picks the angles with the fewest
 * blocked players, then the fewest players with no sight of the left paw, then the smallest
 * moves. Neighbors keep their packed arcs, two neighbors of one seat stay together
 * ({@link seatBonds}), the strings keep the gap of the conductor, and the outer player does not
 * pass its spread angle, because the spread took the room to the stage edge. The inner player of a split row stays at its spread angle or farther out, or with
 * `inner` at that angle from 0° or farther out. With `view`, a hidden head costs as much as a
 * hidden conductor.
 *
 * @param search The row and the items around it.
 * @param fit True to skip each angle at which a player does not fit ({@link fitsAt}).
 * @returns The steps, which return the angle of each player.
 */
function* sightSweepSteps(search: RowSearch, fit = false): Steps<number[]> {
  const { row, arcs, bonds, blockers, view, inner: innerLimit, memo } = search;
  const { targets } = search.pass;
  const { members, radius, angles } = row;
  const next = [...angles];
  const sight = (i: number, angle: number): SightResult => {
    const known = memo?.get(i, angle);
    if (known) {
      return known;
    }
    const member = members[i];
    if (!member) {
      return { sight: 0, hidden: 0 };
    }
    const result = sightAt(member, angle, radius, targets, blockers, view);
    memo?.set(i, angle, result);
    return result;
  };
  const steps = Math.round(CONDUCTOR_SIGHT.nudge / CONDUCTOR_SIGHT.nudgeStep);
  const right = angles.flatMap((a, i) => (a >= 0 ? [i] : []));
  const left = angles.flatMap((a, i) => (a < 0 ? [i] : [])).toReversed();
  const between = left[0] !== undefined ? (arcs[left[0]] ?? 0) : 0;
  const bond = left[0] !== undefined ? (bonds[left[0]] ?? Infinity) : Infinity;
  // The right side goes first. A centered row keeps the packed arc between its two inner
  // players, and the strings keep the gap of the conductor. Two inner players of one seat also
  // keep their bond: the right player from the spread angle of the left player, and then the
  // left player from the right player.
  for (const side of [1, -1] as const) {
    const order = side > 0 ? right : left;
    const other = (side > 0 ? left : right)[0];
    let limit = angles[order[0] ?? 0] ?? 0;
    let farthest = side * Infinity;
    if (row.split && innerLimit !== null) {
      limit = side * Math.min(side * limit, innerLimit);
    } else if (!row.split && other !== undefined) {
      limit = (next[other] ?? 0) + side * between;
      farthest = (next[other] ?? 0) + side * bond;
    }
    // The candidates of each player, from the inner player out: the angle and its cost.
    const options: SweepOption[][] = [];
    for (const [k, i] of order.entries()) {
      yield;
      const base = angles[i] ?? 0;
      const own: SweepOption[] = [];
      for (let n = -steps; n <= steps; n++) {
        const angle = base + side * n * CONDUCTOR_SIGHT.nudgeStep;
        const out = side * angle;
        if (
          out < side * limit - 1e-12 ||
          (k === 0 && out > side * farthest + 1e-9) ||
          Math.abs(angle) > SPREAD_LIMITS.maxAngle + 1e-9 ||
          (k === order.length - 1 && out > side * base + 1e-12) ||
          (fit && !fitsAt(members[i], angle, search))
        ) {
          continue;
        }
        own.push({ angle, cost: sightCost(sight(i, angle)) + Math.abs(n) });
      }
      options.push(own);
    }
    // The packed arc and the largest arc from each player to its inner neighbor.
    const pair = (k: number): number | undefined => {
      const inner = order[k - 1];
      return inner === undefined ? undefined : side > 0 ? inner : order[k];
    };
    const gaps = order.map((_, k) => arcs[pair(k) ?? -1] ?? 0);
    const widest = order.map((_, k) => bonds[pair(k) ?? -1] ?? Infinity);
    // With no path, the side keeps its spread angles.
    cheapestPath(options, gaps, widest, side).forEach((at, k) => {
      const i = order[k];
      const option = options[k]?.[at];
      if (i !== undefined && option) {
        next[i] = option.angle;
      }
    });
  }
  return next;
}

/**
 * Finds if a player of a row keeps its gaps at an angle (design 4.5, seat geometry): the player
 * and its own stand keep 0.05 m from the items around the row and 0.3 m from the edges, and a
 * player keeps {@link PIANO_REACH_GAP} from a piano case in front of it or behind it. The sight
 * sweep skips the other angles, so that one player does not make the whole row keep its spread
 * angles. A shared stand depends on two players, so the check of the row ({@link rowFits}) stays.
 *
 * @param member The player.
 * @param angle The angle of the player.
 * @param search The row and the items around it.
 * @returns True if the player fits at the angle.
 */
function fitsAt(member: Member | undefined, angle: number, search: RowSearch): boolean {
  if (!member) {
    return false;
  }
  const { clearance } = search;
  const { radius } = search.row;
  const player = placePlayer(member, angle, radius).obstacle;
  const items = [player];
  if (member.stand === 'own') {
    items.push(placeStand(angle, radius - member.standDistance, member.index, [member]).obstacle);
  }
  const piano = member.cast.instrument === 'piano';
  return (
    items.every((o) => o.boxes.every((b) => boxOnStage(b, search.pass.stage))) &&
    !touchesAny(items, clearance.placed) &&
    !clearance.pianosInFront.some((b) => obstaclesTouch(player, b, PIANO_REACH_GAP)) &&
    !(piano && clearance.playersBehind.some((b) => obstaclesTouch(player, b, PIANO_REACH_GAP)))
  );
}

/** A candidate angle of a player in the sight sweep, with its cost. */
interface SweepOption {
  /** The angle, in radians. */
  readonly angle: number;
  /** The cost of the sight at the angle ({@link sightCost}) plus the steps of the move. */
  readonly cost: number;
}

/**
 * Finds the path of the lowest total cost through the candidates of the players of one side of a
 * row, from the inner player out. Two neighbors on a path keep their packed arc, and two
 * neighbors of one seat keep their bond ({@link seatBonds}).
 *
 * @param options The candidates of each player, from the inner player out.
 * @param gaps The packed arc from each player to its inner neighbor, in radians: 0 for the inner
 *   player.
 * @param widest The largest arc from each player to its inner neighbor, in radians: `Infinity`
 *   for no limit.
 * @param side 1 for the right side, -1 for the left side.
 * @returns The index of the chosen candidate of each player, from the inner player out, or -1
 *   for each player with no path.
 */
function cheapestPath(
  options: readonly (readonly SweepOption[])[],
  gaps: readonly number[],
  widest: readonly number[],
  side: 1 | -1,
): number[] {
  // The best total cost of each candidate with the players inside it, and the candidate of the
  // inner neighbor on that path.
  const totals: number[][] = [];
  const links: number[][] = [];
  for (const [k, own] of options.entries()) {
    const before = options[k - 1];
    const arc = gaps[k] ?? 0;
    const most = widest[k] ?? Infinity;
    totals.push([]);
    links.push([]);
    for (const option of own) {
      let best = before ? Infinity : 0;
      let link = -1;
      before?.forEach((previous, j) => {
        const total = totals[k - 1]?.[j] ?? Infinity;
        const apart = side * (option.angle - previous.angle);
        if (apart >= arc - 1e-9 && apart <= most + 1e-9 && total < best) {
          best = total;
          link = j;
        }
      });
      totals[k]?.push(best + option.cost);
      links[k]?.push(link);
    }
  }
  const path = options.map(() => -1);
  const last = totals.at(-1) ?? [];
  const lowest = Math.min(...last);
  let at = Number.isFinite(lowest) ? last.indexOf(lowest) : -1;
  for (let k = options.length - 1; k >= 0 && at >= 0; k--) {
    path[k] = at;
    at = links[k]?.[at] ?? -1;
  }
  return path;
}

/**
 * Finds the sight of a player of a row at an angle, with its own stand in front of its face.
 *
 * @param member The player.
 * @param angle The angle of the player.
 * @param radius The radius of the row.
 * @param targets The points of the conductor.
 * @param blockers The items in front of the row.
 * @param view The stage side when the row keeps the view of the audience, or `null`. The hidden
 *   share of the head then adds to the hidden share of the conductor.
 * @returns The sight.
 */
function sightAt(
  member: Member,
  angle: number,
  radius: number,
  targets: SightTargets,
  blockers: SightBlockers,
  view: number | null,
): SightResult {
  const own =
    member.stand === 'own'
      ? [placeStand(angle, radius - member.standDistance, member.index, [member]).obstacle]
      : [];
  const place = placePlayer(member, angle, radius).place;
  const seen = sightOf(member.sight, place, targets, {
    ...blockers,
    stands: [...blockers.stands, ...own],
  });
  return view === null
    ? seen
    : { ...seen, hidden: seen.hidden + audienceShare(member.sight, place, blockers.solid, view) };
}

/**
 * Gives the items that can hide the conductor from a player behind the rows.
 *
 * @param soloists The obstacles of the soloists.
 * @param rows The rows in front of the player, after the sight pass.
 * @returns The players and the stands of the rows, with the soloists.
 */
function blockersOf(soloists: readonly Obstacle[], rows: readonly FittedRow[]): SightBlockers {
  return {
    solid: [...soloists, ...rows.flatMap((r) => r.placement.players.map((p) => p.obstacle))],
    stands: rows.flatMap((r) => r.placement.stands.map((p) => p.obstacle)),
  };
}

/** A row after its sight pass, with the cost, the blocked players, and the worst sight. */
interface RowSight extends Pick<SightTry, 'cost' | 'blind' | 'worst'> {
  /** The row at the places of the pass. */
  readonly seen: FittedRow;
}

/** The moves of row 0 for the sight of the back desks ({@link moveFrontSteps}). */
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

/** One try of the places of a row in its sight pass. */
interface SightTry {
  /** The sum of the costs of the sights of the players ({@link sightCost}). */
  readonly cost: number;
  /** The indices of the blocked players. */
  readonly blind: readonly number[];
  /** The largest hidden share of the head and the baton paw of a player ({@link SightResult}). */
  readonly worst: number;
  readonly angles: readonly number[];
  readonly placement: RowPlacement;
}

/**
 * Calculates the packed arc from each player of a row to its right neighbor ({@link spacingSteps}).
 *
 * @param row The row.
 * @returns The arcs, in radians, with 0 for the rightmost player.
 */
function packedArcs(row: FittedRow): number[] {
  return row.members.map((m, i) => {
    const right = row.members[i + 1];
    return right ? runAll(spacingSteps(m, right, row.radius)) / row.radius : 0;
  });
}

/**
 * Calculates the largest arc from each player of a row to its right neighbor in the sight pass
 * (design 4.5, seat geometry). Two neighbors of one seat sit together as a section: their arc
 * stays at most {@link SPREAD_LIMITS}.maxArc, or their packed arc or their arc in the row when
 * one of these is longer. Without this limit, the pass moved one of two horns 2.9 m from its
 * partner. Other neighbors have no limit.
 *
 * @param row The row.
 * @param arcs The packed arc from each player to its right neighbor, in radians.
 * @returns The largest arcs, in radians, with `Infinity` for no limit.
 */
function seatBonds(row: FittedRow, arcs: readonly number[]): number[] {
  return row.members.map((member, i) => {
    const right = row.members[i + 1];
    if (right?.cast.seatIndex !== member.cast.seatIndex) {
      return Infinity;
    }
    const arc = (row.angles[i + 1] ?? 0) - (row.angles[i] ?? 0);
    return Math.max(SPREAD_LIMITS.maxArc / row.radius, arcs[i] ?? 0, arc);
  });
}

/** The inputs of the sight pass that stay the same for each row ({@link sightRowsSteps}). */
interface SightPass {
  /** The rows after the spread, from the front. */
  readonly rows: readonly FittedRow[];
  /** The rows before the spread. Row 0 keeps the packed gap of the conductor. */
  readonly packed: readonly FittedRow[];
  /**
   * The obstacles that do not move: the podium with the conductor, the soloist, the choir risers,
   * and the singers.
   */
  readonly fixed: readonly Obstacle[];
  /** The obstacles of the soloists. They are also in `fixed`. */
  readonly soloists: readonly Obstacle[];
  /** The obstacles of the piano soloists. They are also in `fixed`. */
  readonly soloPianos: readonly Obstacle[];
  /** The stage side and the front distance. */
  readonly stage: StageSize;
  /** The points of the conductor. */
  readonly targets: SightTargets;
}

/** One row in its sight pass, with the items around it ({@link rowSearchOf}). */
interface RowSearch {
  /** The inputs of the pass. */
  readonly pass: SightPass;
  /** The row after the spread. */
  readonly row: FittedRow;
  /** The items that the row keeps clear of. */
  readonly clearance: RowClearance;
  /** The items in front of the row that can hide the conductor. */
  readonly blockers: SightBlockers;
  /** The packed arc from each player to its right neighbor, in radians ({@link packedArcs}). */
  readonly arcs: readonly number[];
  /** The largest arc from each player to its right neighbor, in radians ({@link seatBonds}). */
  readonly bonds: readonly number[];
  /** The stage side when the row keeps the view of the audience ({@link AUDIENCE}), or `null`. */
  readonly view: number | null;
  /**
   * The smallest angle of a back desk player from 0°, or `null` for the other rows: the angle of
   * the inner first desks, so that a desk fits into the gap between two players of row 0.
   */
  readonly inner: number | null;
  /** The known sights of the players of the row, or `null`. */
  readonly memo: SightMemo | null;
}

/**
 * Gives a row in its sight pass with the items around it.
 *
 * @param pass The inputs of the pass.
 * @param row The row after the spread.
 * @param n The index of the row in `pass.rows`.
 * @param done The rows in front, after their sight pass.
 * @param memo The known sights of the players of the row, or `null`.
 * @returns The search of the row.
 */
function rowSearchOf(
  pass: SightPass,
  row: FittedRow,
  n: number,
  done: readonly FittedRow[],
  memo: SightMemo | null,
): RowSearch {
  const front = done.find((d) => d.row === 0);
  const arcs = packedArcs(row);
  return {
    pass,
    row,
    clearance: clearanceOf(pass.fixed, pass.soloPianos, done, pass.rows.slice(n + 1)),
    blockers: blockersOf(pass.soloists, done),
    arcs,
    bonds: seatBonds(row, arcs),
    view: row.row >= AUDIENCE.firstRow ? pass.stage.side : null,
    inner:
      row.row === BACK_DESK_ROW && front ? Math.min(...front.angles.map((a) => Math.abs(a))) : null,
    memo,
  };
}

/**
 * Finds the sight of each player of a row at its place, past the rows in front and the other
 * players of the row.
 *
 * @param search The row and the items around it.
 * @param placement The places of the row.
 * @returns The sum of the costs ({@link sightCost}), the largest hidden share of the head and the
 *   baton paw of a player, and true for each blocked player.
 */
function rowSightOf(
  search: RowSearch,
  placement: RowPlacement,
): Pick<SightTry, 'cost' | 'worst'> & { readonly blind: readonly boolean[] } {
  const { row, blockers } = search;
  const bodies = placement.players.map((p) => p.obstacle);
  const stands = [...blockers.stands, ...placement.stands.map((p) => p.obstacle)];
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
    const seen = sightOf(member.sight, place, search.pass.targets, others);
    cost += sightCost(seen);
    worst = Math.max(worst, seen.hidden);
    return seen.sight === 2;
  });
  return { cost, worst, blind };
}

/**
 * Places a row for the sight lines, in steps. {@link sightSweepSteps} moves the players along the
 * row. A sweep that leaves the limits of the spread, the stage, or the gaps keeps the spread
 * angles.
 *
 * @param search The row and the items around it.
 * @param gap True if the back desks can also pass 0° into the gap of the conductor. The view of
 *   the audience then counts in the cost of the sweep.
 * @returns The steps, which return the try.
 */
function* trySteps(search: RowSearch, gap = false): Steps<SightTry> {
  const { row } = search;
  const { stage } = search.pass;
  const sweep = gap
    ? { ...search, row: { ...row, split: false }, view: stage.side, inner: null, memo: null }
    : search;
  const fits = (a: readonly number[], p: RowPlacement): boolean =>
    withinSpread(a) && rowFits(p, search.clearance, stage);
  let angles = yield* sightSweepSteps(sweep);
  let placement = placeRow(row.members, angles, row.radius);
  // Only a sweep that does not fit checks the fit of each player, because the check is slow.
  if (!fits(angles, placement)) {
    angles = yield* sightSweepSteps(sweep, true);
    placement = placeRow(row.members, angles, row.radius);
  }
  if (!fits(angles, placement)) {
    angles = [...row.angles];
    placement = placeRow(row.members, angles, row.radius);
  }
  const { cost, worst, blind } = rowSightOf(search, placement);
  return {
    cost,
    blind: blind.flatMap((b, i) => (b ? [i] : [])),
    worst,
    angles,
    placement,
  };
}

/**
 * Places one row behind the rows that are done, in steps (design 4.5, seat geometry). The row
 * stands on the stage floor, and its players move along the arc ({@link trySteps}).
 *
 * @param pass The inputs of the pass.
 * @param row The row after the spread.
 * @param n The index of the row in `pass.rows`.
 * @param done The rows in front, after their sight pass.
 * @param memo The known sights of the players of the row, or `null`.
 * @param open True if a row that stays blocked can also try the gap of the conductor.
 * @returns The steps, which return the row, its cost, and its blocked players.
 */
function* seeRowSteps(
  pass: SightPass,
  row: FittedRow,
  n: number,
  done: readonly FittedRow[],
  memo: SightMemo | null,
  open = false,
): Steps<RowSight> {
  const search = rowSearchOf(pass, row, n, done, memo);
  let pick = yield* trySteps(search);
  // A side of the back desks with no free arc can use the gap of the conductor.
  if (open && pick.blind.length > 0) {
    const wide = yield* trySteps(search, true);
    if (wide.blind.length < pick.blind.length) {
      pick = wide;
    }
  }
  return {
    seen: { ...row, angles: pick.angles, placement: pick.placement },
    cost: pick.cost,
    blind: pick.blind,
    worst: pick.worst,
  };
}

/**
 * Counts the blocked players of row 0 at its places, past the soloists and the other players of
 * the row.
 *
 * @param pass The inputs of the pass.
 * @param front Row 0.
 * @param placement The places of row 0.
 * @returns The number of blocked players.
 */
function frontBlind(pass: SightPass, front: FittedRow, placement: RowPlacement): number {
  const bodies = placement.players.map((p) => p.obstacle);
  const stands = placement.stands.map((p) => p.obstacle);
  return front.members.filter((member, i) => {
    const place = placement.players[i]?.place;
    const solid = [...pass.soloists, ...bodies.filter((_, j) => j !== i)];
    return (
      place !== undefined &&
      sightOf(member.sight, place, pass.targets, { solid, stands }).sight === 2
    );
  }).length;
}

/**
 * Lists the runs of row 0 players that can move for the blocked back desk players
 * ({@link moveFrontSteps}). For each of the two players of row 0 nearest to a blocked player,
 * the runs are the player alone, the player with one neighbor, and the player with all players
 * to the inside or to the outside on its side.
 *
 * @param blind The angles of the blocked back desk players.
 * @param angles The angles of row 0.
 * @returns The runs, as indices of row 0.
 */
function frontRuns(blind: readonly number[], angles: readonly number[]): number[][] {
  const runs: number[][] = [];
  const span = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, q) => from + q);
  for (const a of blind) {
    const nearest = angles
      .map((b, j) => ({ d: Math.abs(b - a), j }))
      .toSorted((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const { j } of nearest) {
      const same = (k: number): boolean => Math.sign(angles[k] ?? 0) === Math.sign(angles[j] ?? 0);
      let inside = j;
      let outside = j;
      while (inside > 0 && same(inside - 1)) {
        inside--;
      }
      while (outside < angles.length - 1 && same(outside + 1)) {
        outside++;
      }
      runs.push([j], span(inside, j), span(j, outside));
      if (j > inside) {
        runs.push([j - 1, j]);
      }
      if (j < outside) {
        runs.push([j, j + 1]);
      }
    }
  }
  return runs;
}

/**
 * Makes the memo of the sights of row 1 for one move of row 0. A front player hides no target of
 * a back player more than {@link FRONT_MOVES}.reach away in angle, so the key holds only the
 * moves of the front players near the angle.
 *
 * @param known The sights of row 1 over all moves, by key.
 * @param next The angles of row 0 after the move.
 * @param steps The move of each player of row 0 from its angle after its sight pass, in steps of
 *   {@link CONDUCTOR_SIGHT}.nudgeStep.
 * @returns The memo.
 */
function frontMemo(
  known: Map<string, SightResult>,
  next: readonly number[],
  steps: readonly number[],
): SightMemo {
  const key = (i: number, angle: number): string => {
    let text = `${i}:${Math.round(angle * 1e4)}`;
    next.forEach((b, j) => {
      if (Math.abs(b - angle) < FRONT_MOVES.reach) {
        text += `:${j}=${steps[j]}`;
      }
    });
    return text;
  };
  return {
    get: (i, angle) => known.get(key(i, angle)),
    set: (i, angle, result) => {
      known.set(key(i, angle), result);
    },
  };
}

/**
 * Moves the players of row 0 so that the back desks of row 1 see the conductor, in steps (design
 * 4.5, seat geometry). The spread gives each gap of row 0 the same arc, but a desk of two partners
 * fits into a gap only when the gap is a little larger. A greedy search tries the runs of
 * {@link frontRuns}. Each run moves by 1° steps up to {@link FRONT_MOVES}.shift, and the move with
 * the lowest cost of row 1 wins, for up to {@link FRONT_MOVES}.rounds rounds. A move keeps the
 * packed arcs, the arcs of the seats ({@link seatBonds}), the packed gap of the conductor, the
 * stage, the gaps to the other items, and the sight of row 0 past the soloists.
 *
 * @param pass The inputs of the pass.
 * @param front Row 0 after its sight pass.
 * @param at The index of row 0 in `pass.rows`.
 * @param back Row 1 after the spread.
 * @param n The index of row 1 in `pass.rows`.
 * @param first Row 1 behind the spread row 0.
 * @returns The steps, which return row 0 and row 1.
 */
function* moveFrontSteps(
  pass: SightPass,
  front: FittedRow,
  at: number,
  back: FittedRow,
  n: number,
  first: RowSight,
): Steps<{ front: FittedRow; back: RowSight }> {
  const packedFront = pass.packed.find((r) => r.row === front.row);
  const arcs = packedArcs(front);
  const bonds = seatBonds(front, arcs);
  const clearance = clearanceOf(pass.fixed, pass.soloPianos, [], pass.rows.slice(at + 1));
  const blindBefore = frontBlind(pass, front, front.placement);
  // The inner first desks keep the gap of the conductor of the spread row on each side.
  const gapOf = (side: -1 | 1): number =>
    Math.min(...front.angles.filter((b) => side * b > 0).map((b) => side * b));
  const gaps = { left: gapOf(-1), right: gapOf(1) };
  const known = new Map<string, SightResult>();
  let best = first;
  let angles = [...front.angles];
  for (let round = 0; round < FRONT_MOVES.rounds && best.blind.length > 0; round++) {
    const runs = frontRuns(
      best.blind.map((i) => best.seen.angles[i] ?? 0),
      angles,
    );
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
            Math.abs(a) >= (a < 0 ? gaps.left : gaps.right) - 1e-9 &&
            (i === next.length - 1 ||
              ((next[i + 1] ?? 0) - a >= (arcs[i] ?? 0) - 1e-9 &&
                (next[i + 1] ?? 0) - a <= (bonds[i] ?? Infinity) + 1e-9)),
        );
        if (!valid) {
          continue;
        }
        const placement = placeRow(front.members, next, front.radius);
        if (
          !rowFits(placement, clearance, pass.stage) ||
          frontBlind(pass, front, placement) > blindBefore
        ) {
          continue;
        }
        const steps = next.map((b, i) =>
          Math.round((b - (front.angles[i] ?? 0)) / CONDUCTOR_SIGHT.nudgeStep),
        );
        const moved: FittedRow = { ...front, angles: next, placement };
        const result = yield* seeRowSteps(pass, back, n, [moved], frontMemo(known, next, steps));
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
}

/**
 * Places each row so that each player sees the head and the baton paw of the conductor (design
 * 4.5, seat geometry), from the front row to the back row ({@link seeRowSteps}). All rows stand
 * on the stage floor. After row 1, the players of row 0 move for the back desks
 * ({@link moveFrontSteps}). When a back desk stays blocked and loses at least
 * {@link OPEN_GAP_HIDDEN} of the conductor, row 1 tries again with the gap of the conductor open:
 * its inner players can pass 0°, and the view of the audience counts in the cost. The row keeps
 * this try only when it has fewer blocked players.
 *
 * The count of blocked players is a report. A seat fix adds no riser under an instrument row,
 * opens no empty center, and keeps the stage size and the podium height.
 *
 * @param pass The inputs of the pass.
 * @returns The steps, which return the rows and the number of blocked players.
 */
function* sightRowsSteps(pass: SightPass): Steps<{ rows: FittedRow[]; blind: number }> {
  const done: FittedRow[] = [];
  const blind: number[] = [];
  for (const [n, row] of pass.rows.entries()) {
    let result = yield* seeRowSteps(pass, row, n, done, null);
    const at = done.findIndex((d) => d.row === 0);
    const front = done[at];
    if (row.row === BACK_DESK_ROW && result.blind.length > 0 && front) {
      const moved = yield* moveFrontSteps(pass, front, at, row, n, result);
      done[at] = moved.front;
      result = moved.back;
      if (result.worst >= OPEN_GAP_HIDDEN) {
        result = yield* seeRowSteps(pass, row, n, done, null, true);
      }
    }
    done.push(result.seen);
    blind.push(result.blind.length);
  }
  return { rows: done, blind: blind.reduce((a, b) => a + b, 0) };
}

/** The joint search of the lanes to the conductor ({@link laneSearchSteps}). */
const LANES = {
  /** The first row whose blocked players start a search: row 1, the back desks of the strings. */
  firstRow: 1,
  /** The largest number of passes over the blocked players. */
  passes: 2,
  /** The largest move of a run of players in one try, in steps of 1°. */
  reach: 20,
} as const;

/** The cost of the sight of one player in the lane search, and if the player is blocked. */
interface LaneSight {
  readonly blind: boolean;
  readonly cost: number;
}

/**
 * Finds the sight of a player in the lane search, past the soloists, the rows in front, and the
 * other players of its row ({@link rowSightOf}). From row 2, the view of the audience counts in
 * the cost, as in the sight sweep. Each step of 1° off the angle after the sight pass adds 1.
 *
 * @param pass The inputs of the pass.
 * @param rows The rows, from the front.
 * @param n The index of the row of the player in `rows`.
 * @param k The index of the player in its row.
 * @param start The angles of each row after the sight pass.
 * @param bound A cost from which the exact cost does not matter: the function then can give a
 *   lower cost that is still at least the bound. No bound by default.
 * @returns The sight.
 */
function laneSightOf(
  pass: SightPass,
  rows: readonly FittedRow[],
  n: number,
  k: number,
  start: readonly (readonly number[])[],
  bound = Infinity,
): LaneSight {
  const row = rows[n];
  const member = row?.members[k];
  const place = row?.placement.players[k]?.place;
  if (!row || !member || !place) {
    return { blind: false, cost: 0 };
  }
  const front = rows.slice(0, n);
  const solidFront = [
    ...pass.soloists,
    ...front.flatMap((r) => r.placement.players.map((p) => p.obstacle)),
  ];
  const solid = [
    ...solidFront,
    ...row.placement.players.filter((_, j) => j !== k).map((p) => p.obstacle),
  ];
  const stands = [...front, row].flatMap((r) => r.placement.stands.map((s) => s.obstacle));
  const seen = sightOf(member.sight, place, pass.targets, { solid, stands });
  const moved = Math.abs((row.angles[k] ?? 0) - (start[n]?.[k] ?? 0)) / CONDUCTOR_SIGHT.nudgeStep;
  const least = sightCost(seen) + moved;
  // The view of the audience only adds to the cost, so a cost above the bound needs no view.
  if (row.row < AUDIENCE.firstRow || least >= bound) {
    return { blind: seen.sight === 2, cost: least };
  }
  const view = audienceShare(member.sight, place, solidFront, pass.stage.side);
  return {
    blind: seen.sight === 2,
    cost: sightCost({ sight: seen.sight, hidden: seen.hidden + view }) + moved,
  };
}

/** The limits of the moves of one row in the lane search. */
interface LaneLimits {
  /** The packed arc from each player to its right neighbor, in radians. */
  readonly arcs: readonly number[];
  /** The largest arc from each player to its right neighbor, in radians. */
  readonly widest: readonly number[];
  /** The smallest angle of each player from 0°, in radians. */
  readonly least: readonly number[];
  /** The largest angle of each player from 0°, in radians. */
  readonly most: readonly number[];
}

/**
 * Gives the limits of the moves of a row in the lane search (design 4.5, seat geometry, lanes).
 * Neighbors keep their packed arcs, and an arc grows to at most 1.6 m, or its arc after the sight
 * pass. Each seat stays within ±90°, and the outer player of each side does not pass its spread
 * angle. In rows 0 and 1, each player stays on its side of 0°. Row 0 keeps the gap of the
 * conductor, does not pass its packed angles to the inside, and its inner players do not pass the
 * back desks of row 1 to the outside. A back desk of row 1 outside the gap stays outside it.
 *
 * @param row The row after the sight pass.
 * @param spread The angles of the row after the spread.
 * @param packed The angles of the row before the spread.
 * @param gap The smallest angle of a first desk player from 0°, for row 1.
 * @param back The smallest angle from 0° of a back desk outside the gap on each side, for row 0.
 * @returns The limits.
 */
function laneLimitsOf(
  row: FittedRow,
  spread: readonly number[],
  packed: readonly number[],
  gap: number,
  back: (side: number) => number,
): LaneLimits {
  const arcs = packedArcs(row);
  const { angles } = row;
  const lastLeft = angles.findLastIndex((a) => a < 0);
  const ends = new Set([angles.findIndex((a) => a < 0), angles.length - 1]);
  const widest = angles.map((a, i) => {
    const next = angles[i + 1];
    if (next === undefined || (row.split && i === lastLeft)) {
      // The pair at 0° of rows 0 and 1 has no arc limit: it is the gap of the conductor.
      return Infinity;
    }
    return Math.max(SPREAD_LIMITS.maxArc / row.radius, next - a);
  });
  const sideGap = (side: number): number =>
    Math.min(...angles.filter((a) => side * a > 0).map((a) => side * a));
  const least = angles.map((a, i) => {
    if (row.row === 0) {
      return Math.max(Math.abs(packed[i] ?? 0), sideGap(Math.sign(a)));
    }
    return row.row === BACK_DESK_ROW && Math.abs(a) >= gap - 1e-9 ? gap : 0;
  });
  const most = angles.map((a, i) => {
    const edge = ends.has(i) ? Math.abs(spread[i] ?? a) : SPREAD_LIMITS.maxAngle;
    const inner = row.row === 0 && Math.abs(a) <= sideGap(Math.sign(a)) + 1e-9;
    return inner ? Math.min(edge, back(Math.sign(a))) : edge;
  });
  return { arcs, widest, least, most };
}

/**
 * Finds if the angles of a row keep the limits of the lane search ({@link laneLimitsOf}).
 *
 * @param row The row.
 * @param angles The new angles.
 * @param limits The limits of the row.
 * @returns True if each angle keeps the limits.
 */
function keepsLaneLimits(row: FittedRow, angles: readonly number[], limits: LaneLimits): boolean {
  return angles.every((a, i) => {
    const before = row.angles[i] ?? 0;
    const next = angles[i + 1];
    const arc = next === undefined ? 0 : next - a;
    return (
      (!row.split || Math.sign(a) === Math.sign(before) || a === before) &&
      Math.abs(a) >= (limits.least[i] ?? 0) - 1e-9 &&
      Math.abs(a) <= (limits.most[i] ?? 0) + 1e-9 &&
      (next === undefined ||
        (arc >= (limits.arcs[i] ?? 0) - 1e-9 && arc <= (limits.widest[i] ?? 0) + 1e-9))
    );
  });
}

/**
 * Lists the runs of players that can move for a blocked player in the lane search: each item that
 * hides the conductor from it, and the blocked player itself. A run is the player alone, the
 * player with one neighbor, or the player with all players to the inside or to the outside on its
 * side of 0°.
 *
 * @param rows The rows.
 * @param movers The row and the index of each player that can move.
 * @returns The runs: the row, then the indices of the players.
 */
function laneRuns(
  rows: readonly FittedRow[],
  movers: readonly (readonly [n: number, k: number])[],
): (readonly [n: number, run: readonly number[]])[] {
  const runs: (readonly [n: number, run: readonly number[]])[] = [];
  const seen = new Set<string>();
  for (const [n, k] of movers) {
    const size = rows[n]?.members.length ?? 0;
    const row = rows[n];
    const side = (j: number): number => (row?.split ? Math.sign(row.angles[j] ?? 0) : 1);
    let inside = k;
    let outside = k;
    while (inside > 0 && side(inside - 1) === side(k)) {
      inside--;
    }
    while (outside < size - 1 && side(outside + 1) === side(k)) {
      outside++;
    }
    const span = (from: number, to: number): number[] =>
      Array.from({ length: to - from + 1 }, (_, q) => from + q);
    for (const run of [[k], [k - 1, k], [k, k + 1], span(inside, k), span(k, outside)]) {
      const key = `${n}:${run.join(',')}`;
      if (run.every((j) => j >= 0 && j < size) && !seen.has(key)) {
        seen.add(key);
        runs.push([n, run]);
      }
    }
  }
  return runs;
}

/**
 * Finds the row and the player of each item of the rows that can hide the conductor: a player,
 * or a music stand, which goes to its owner or to the nearest reader.
 *
 * @param rows The rows.
 * @returns The row and the index of the player of each item.
 */
function laneOwners(rows: readonly FittedRow[]): Map<Obstacle, readonly [n: number, k: number]> {
  const owners = new Map<Obstacle, readonly [n: number, k: number]>();
  rows.forEach((row, n) => {
    row.placement.players.forEach((p, k) => owners.set(p.obstacle, [n, k]));
    for (const stand of row.placement.stands) {
      const own = row.members.findIndex((m) => m.index === stand.owner);
      const [x, , z] = stand.place.position;
      const angle = Math.atan2(x, -z);
      const nearest = row.angles.reduce(
        (best, a, k) =>
          Math.abs(a - angle) < Math.abs((row.angles[best] ?? 0) - angle) ? k : best,
        0,
      );
      owners.set(stand.obstacle, [n, own >= 0 ? own : nearest]);
    }
  });
  return owners;
}

/**
 * Moves the players of all rows together so that the players behind the strings see the
 * conductor through lanes in the rows in front (design 4.5, seat geometry, lanes), in steps. The
 * sight pass places one row at a time, so it cannot keep a lane open for a row behind. For each
 * blocked player from row 1, from the front, the search tries runs of the items that hide the
 * conductor from it, and of the player itself ({@link laneRuns}). Each run moves by 1° steps up
 * to {@link LANES}.reach, and keeps the limits of {@link laneLimitsOf}, the stage, and the gaps to
 * the other items. The move with the lowest total cost of all players wins, if it lowers the cost
 * of the blocked player and the total cost. The search stops after {@link LANES}.passes passes, or
 * after a pass with no move.
 *
 * @param pass The inputs of the pass.
 * @param seen The rows after the sight pass, from the front.
 * @returns The steps, which return the rows and the number of blocked players.
 */
function* laneSearchSteps(
  pass: SightPass,
  seen: readonly FittedRow[],
): Steps<{ rows: FittedRow[]; blind: number }> {
  const rows = [...seen];
  const start = rows.map((r) => [...r.angles]);
  const front = rows.find((r) => r.row === 0);
  const gap = front ? Math.min(...front.angles.map((a) => Math.abs(a))) : 0;
  const backDesks = rows.find((r) => r.row === BACK_DESK_ROW)?.angles ?? [];
  const back = (side: number): number =>
    Math.min(
      SPREAD_LIMITS.maxAngle,
      ...backDesks.filter((a) => side * a >= gap - 1e-9).map((a) => side * a),
    );
  const limits = rows.map((row, n) =>
    laneLimitsOf(
      row,
      pass.rows[n]?.angles ?? row.angles,
      pass.packed.find((r) => r.row === row.row)?.angles ?? row.angles,
      gap,
      back,
    ),
  );
  const sights = rows.map((row, n) =>
    row.members.map((_, k) => laneSightOf(pass, rows, n, k, start)),
  );
  const blindCount = (): number => sights.flat().filter((s) => s.blind).length;
  for (let p = 0; p < LANES.passes; p++) {
    let moved = false;
    for (const [n, row] of rows.entries()) {
      if (row.row < LANES.firstRow) {
        continue;
      }
      for (const k of row.members.keys()) {
        if (!sights[n]?.[k]?.blind) {
          continue;
        }
        yield;
        const member = row.members[k];
        const place = rows[n]?.placement.players[k]?.place;
        if (!member || !place) {
          continue;
        }
        const ahead = rows.slice(0, n);
        const own = rows[n];
        const blockers: SightBlockers = {
          solid: [
            ...ahead.flatMap((r) => r.placement.players.map((q) => q.obstacle)),
            ...(own?.placement.players.filter((_, j) => j !== k).map((q) => q.obstacle) ?? []),
          ],
          stands: [...ahead, ...(own ? [own] : [])].flatMap((r) =>
            r.placement.stands.map((s) => s.obstacle),
          ),
        };
        const owners = laneOwners(rows);
        const movers = hidersOf(member.sight, place, pass.targets, blockers).flatMap((o) => {
          const owner = owners.get(o);
          return owner ? [owner] : [];
        });
        const best = yield* bestLaneMoveSteps(pass, rows, limits, sights, start, n, k, [
          ...movers,
          [n, k],
        ]);
        if (best) {
          rows[best.n] = best.row;
          for (const [m, j, s] of best.sights) {
            const known = sights[m];
            if (known) {
              known[j] = s;
            }
          }
          moved = true;
        }
      }
    }
    if (!moved) {
      break;
    }
  }
  return { rows, blind: blindCount() };
}

/** The best move of the lane search for one blocked player. */
interface LaneMove {
  /** The index of the moved row. */
  readonly n: number;
  readonly row: FittedRow;
  /** The new sights: the row, the player, and the sight. */
  readonly sights: readonly (readonly [m: number, j: number, sight: LaneSight])[];
}

/**
 * Finds the move of the lane search with the lowest total cost for one blocked player, in steps
 * ({@link laneSearchSteps}).
 *
 * @param pass The inputs of the pass.
 * @param rows The rows.
 * @param limits The limits of each row.
 * @param sights The sight of each player at its place.
 * @param start The angles of each row after the sight pass.
 * @param n The row of the blocked player.
 * @param k The index of the blocked player in its row.
 * @param movers The players that can move.
 * @returns The steps, which return the move, or `null` if no move lowers the cost.
 */
function* bestLaneMoveSteps(
  pass: SightPass,
  rows: readonly FittedRow[],
  limits: readonly LaneLimits[],
  sights: readonly (readonly LaneSight[])[],
  start: readonly (readonly number[])[],
  n: number,
  k: number,
  movers: readonly (readonly [n: number, k: number])[],
): Steps<LaneMove | null> {
  const target = sights[n]?.[k]?.cost ?? 0;
  let best: LaneMove | null = null;
  let bestDelta = -1e-6;
  for (const [m, run] of laneRuns(rows, movers)) {
    const row = rows[m];
    const limit = limits[m];
    if (!row || !limit) {
      continue;
    }
    const clearance = clearanceOf(pass.fixed, pass.soloPianos, rows.slice(0, m), rows.slice(m + 1));
    for (let s = -LANES.reach; s <= LANES.reach; s++) {
      if (s === 0) {
        continue;
      }
      yield;
      const angles = row.angles.map((a, i) =>
        run.includes(i) ? a + s * CONDUCTOR_SIGHT.nudgeStep : a,
      );
      if (!keepsLaneLimits(row, angles, limit)) {
        continue;
      }
      const placement = placeRow(row.members, angles, row.radius);
      const next: FittedRow = { ...row, angles, placement };
      const tried = rows.map((r, i) => (i === m ? next : r));
      const own = laneSightOf(pass, tried, n, k, start, target - 1e-6);
      if (own.cost >= target - 1e-6 || !rowFits(placement, clearance, pass.stage)) {
        continue;
      }
      // The items that moved: the old and the new places of the players and the stands.
      const changed = [
        ...run.flatMap((i) => [row.placement.players[i], placement.players[i]]),
        ...placement.stands.flatMap((stand, i) => {
          const old = row.placement.stands[i];
          const same =
            old?.place.position[0] === stand.place.position[0] &&
            old.place.position[2] === stand.place.position[2];
          return same ? [] : [old, stand];
        }),
      ].flatMap((p) => (p ? [p.obstacle] : []));
      let delta = 0;
      const fresh: [number, number, LaneSight][] = [];
      tried.forEach((r, q) => {
        if (q < m) {
          return;
        }
        const view = r.row >= AUDIENCE.firstRow ? pass.stage.side : null;
        r.members.forEach((member, j) => {
          const at = r.placement.players[j]?.place;
          if (!at) {
            return;
          }
          const near =
            (q === m && run.includes(j)) ||
            changed.some((o) => sightNear(member.sight, at, o, view));
          if (!near) {
            return;
          }
          const sight = q === n && j === k ? own : laneSightOf(pass, tried, q, j, start);
          delta += sight.cost - (sights[q]?.[j]?.cost ?? 0);
          fresh.push([q, j, sight]);
        });
      });
      if (delta < bestDelta) {
        bestDelta = delta;
        best = { n: m, row: next, sights: fresh };
      }
    }
  }
  return best;
}

/** The lift of the choir risers for the sight of the singers (design 4.5, seat geometry). */
const CHOIR_LIFT = {
  /** The largest lift, in meters. */
  highest: 1.0,
  /** The step of the lift, in meters. */
  step: 0.1,
} as const;

/**
 * Finds the lift of the choir risers (design 4.5, seat geometry): the lowest lift in steps of
 * {@link CHOIR_LIFT}.step, up to {@link CHOIR_LIFT}.highest, at which each singer sees the head
 * and the baton paw of the conductor over the rows, or else the lowest lift with the fewest
 * blocked singers. A lift moves only up, so the risers keep their gaps.
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
  rows: readonly FittedRow[],
  soloists: readonly Obstacle[],
  targets: SightTargets,
): number {
  const blockers = blockersOf(soloists, rows);
  let best = { lift: 0, blocked: Infinity };
  for (let k = 0; k * CHOIR_LIFT.step <= CHOIR_LIFT.highest + 1e-9; k++) {
    const lift = Math.round(k * CHOIR_LIFT.step * 1000) / 1000;
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
 * Calculates the positions of the stage, the players, the music stands, and the choir risers for a
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
 * of `orchestra-latest.png`.
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
  // The stage holds the items of the rows. The band of the back desks is wider than the row.
  const obstacles = [...fixed, ...rows.flatMap((r) => obstaclesOfRow(r.placement))];
  const bands = rows.flatMap((r) => (r.band ? [arcBlockObstacle(r.band, CENTER)] : []));

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
      [...obstacles, ...bands],
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
  // The rows spread inside the stage, and the stage side stays (design 4.5, stage origin). The
  // gap of the conductor with the fewest blocked players wins, and the first gap wins a tie.
  let seen: { pass: SightPass; rows: FittedRow[]; blind: number } | null = null;
  for (const gap of CONDUCTOR_GAPS) {
    const spread = yield* spreadRowsSteps(rows, still, soloPianos, stage, gap);
    yield;
    const pass: SightPass = {
      rows: spread,
      packed: rows,
      fixed: still,
      soloists,
      soloPianos,
      stage,
      targets,
    };
    const next = yield* sightRowsSteps(pass);
    if (!seen || next.blind < seen.blind) {
      seen = { ...next, pass };
    }
    if (seen.blind === 0) {
      break;
    }
  }
  // The joint search of the lanes then opens lanes for the rows behind the strings.
  const lanes = seen && seen.blind > 0 ? yield* laneSearchSteps(seen.pass, seen.rows) : seen;
  const final = lanes?.rows ?? [];
  const lift = choirLift(choir, members, final, soloists, targets);
  const places = withRows(final);
  for (const s of choir.singers) {
    const [x, y, z] = s.place.position;
    places[s.index] = { ...s.place, position: [x, y + lift, z] };
  }
  const others = [...fixed, ...final.flatMap((r) => obstaclesOfRow(r.placement))];
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
  };
}
