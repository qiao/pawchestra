import type { Vec3 } from '../models/tuples.ts';
import { CONDUCTOR_OWNER } from './clearance.ts';
import type { WindowMusic } from './music.ts';
import type { StageSubjects, Subject } from './subjects.ts';

/** The seat and the number in the seat of one player, by its index in `SceneLayout.players`. */
interface HeroSeat {
  /** The seat of the player. */
  readonly seat: number;
  /** The number of the player in its seat: 0 is the principal player. */
  readonly player: number;
  /** The middle of the head of the player on the stage. */
  readonly head: Vec3;
}

/** The seat of each player of a set of subjects, which {@link seatsOf} makes one time. */
const heroSeats = new WeakMap<StageSubjects, ReadonlyMap<number, HeroSeat>>();

/**
 * Gives the seat, the number in the seat, and the head of each player of the subjects.
 *
 * @param subjects The subjects of a layout.
 * @returns The seats, by the index of each player in `SceneLayout.players`.
 */
function seatsOf(subjects: StageSubjects): ReadonlyMap<number, HeroSeat> {
  const known = heroSeats.get(subjects);
  if (known) {
    return known;
  }

  const seats = new Map<number, HeroSeat>();
  for (const [seat, players] of subjects.seats.entries()) {
    for (const p of players?.players ?? []) {
      seats.set(p.sights.owner, { seat, player: p.player, head: p.sights.head });
    }
  }
  heroSeats.set(subjects, seats);
  return seats;
}

/**
 * Chooses the hero among some players (design 5.6): the player of the seat that carries the lead
 * with the most activity in the window, then of the seat with the most activity. In one seat, the
 * principal player wins, as the first chair leads its section. Then the player nearest to the
 * point wins.
 *
 * @param subjects The subjects of the layout.
 * @param window The music of the window after the cut.
 * @param owners The players, by their index in `SceneLayout.players`.
 * @param point The point that the camera looks at.
 * @returns The hero, or `null` with no player.
 */
function bestOf(
  subjects: StageSubjects,
  window: WindowMusic,
  owners: Iterable<number>,
  point: Vec3,
): number | null {
  const seats = seatsOf(subjects);
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const owner of owners) {
    const at = seats.get(owner);
    if (!at) {
      continue;
    }
    const lead = window.lead[at.seat] ? 1 : 0;
    const activity = window.activity[at.seat] ?? 0;
    const near = Math.hypot(at.head[0] - point[0], at.head[2] - point[2]);
    // The lead first, then the activity, then the principal, then the nearest head.
    const score = lead * 1e6 + Math.round(activity * 1e3) * 1e2 - at.player * 10 - near;
    if (score > bestScore) {
      bestScore = score;
      best = owner;
    }
  }
  return best;
}

/**
 * Chooses the hero of a close shot (design 5.6): the player whose nearer eye takes the focus, as a
 * focus puller keeps the face of the subject sharp.
 *
 * - A solo shot: its player.
 * - A section shot or a side view: the principal player of the seat with the lead, else of the
 *   seat with the most activity, among the subject players.
 * - The close view of the conductor from behind: the conductor. Its eyes face away, so the scene
 *   focuses on its head.
 * - The view over the shoulder of the conductor: the players face the camera, so the hero is the
 *   lead player in the sphere of the frame.
 *
 * @param subjects The subjects of the layout.
 * @param window The music of the window after the cut.
 * @param subject The subject of the shot.
 * @returns The index of the hero in `SceneLayout.players`, `CONDUCTOR_OWNER`, or `null`.
 */
export function subjectHero(
  subjects: StageSubjects,
  window: WindowMusic,
  subject: Subject,
): number | null {
  const { members, reach, target, tops } = subject;
  if (members.length === 1 && members[0] === CONDUCTOR_OWNER) {
    return CONDUCTOR_OWNER;
  }
  // The frame holds the heads of its tops. The view over the shoulder has no tops: it holds the
  // players in a sphere around the target.
  const seats = seatsOf(subjects);
  const framed = (head: Vec3): boolean =>
    tops.length > 0
      ? tops.some((top) => Math.hypot(top[0] - head[0], top[2] - head[2]) < 0.01)
      : reach <= 0 || Math.hypot(head[0] - target[0], head[2] - target[2]) <= reach;
  const inFrame = members.filter((owner) => {
    const head = seats.get(owner)?.head;
    return !!head && framed(head);
  });
  return bestOf(subjects, window, inFrame.length > 0 ? inFrame : members, target);
}

/**
 * Chooses the hero of a wide or a high shot (design 5.6): the lead player of the window. The
 * aperture of a wide view is closed, so the full stage stays sharp, and the hero only names the
 * player that the music follows.
 *
 * @param subjects The subjects of the layout.
 * @param window The music of the window after the cut.
 * @param target The point that the camera looks at.
 * @returns The index of the hero in `SceneLayout.players`, or `null` with no player.
 */
export function leadHero(
  subjects: StageSubjects,
  window: WindowMusic,
  target: Vec3,
): number | null {
  return bestOf(subjects, window, seatsOf(subjects).keys(), target);
}
