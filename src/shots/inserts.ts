import { CONDUCTOR } from '../models/cast.ts';
import { insideBeam } from '../models/beam.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PlayTarget } from '../models/instruments/types.ts';
import type { PlayerPlace, SceneLayout } from '../models/layout.ts';
import type { ModelCache } from '../models/model-cache.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import type { Vec3 } from '../models/tuples.ts';
import { lastAtOrBefore } from '../pose/blend.ts';
import { conductorBeatPoint } from '../pose/conductor.ts';
import type { PosePlan } from '../pose/plan.ts';
import { createScenePose, poseAt } from '../pose/pose-at.ts';
import type { ScenePoseBuffer } from '../pose/pose-at.ts';
import { mixHash, mulberry32 } from '../pose/random.ts';
import type { Transport } from '../pose/types.ts';
import { FOCUS_PULL, cameraAt, createCameraPose } from './camera-at.ts';
import { keyDistance, writeKeyPosition } from './camera-keys.ts';
import {
  CLEARANCE,
  CONDUCTOR_OWNER,
  bodyBoxes,
  segmentClear,
  targetLineClear,
} from './clearance.ts';
import type { Segment, StageClearance } from './clearance.ts';
import { ANIMAL_FLOOR, animalTooNear, foregroundHead, inFrame, lensScale } from './foreground.ts';
import type { StageBody, StageHead } from './foreground.ts';
import { FILM_GRAMMAR, keepsLine } from './grammar.ts';
import { INSERT_FRAME, cutsFace, insertCover, posePlayer, posedPoint } from './insert-frame.ts';
import type { InsertDetailPart, InsertView, PosedPlayer } from './insert-frame.ts';
import { entriesIn, musicIn } from './music.ts';
import type { ScoreMusic, WindowMusic } from './music.ts';
import { frontOf, onStage } from './subjects.ts';
import type { InsertDetail, Shot, ShotKey, ShotPlan } from './types.ts';
import { CINEMA_ASPECT } from './view.ts';

/** Degrees to radians. */
const DEG = Math.PI / 180;

/**
 * The rules of the detail inserts (design 5.6, `camera-technique.md`). A concert film cuts away
 * from its main shot to a short insert of a detail of the playing, and back to the main shot.
 */
export const INSERT_RULES = {
  /** The range of the seeded wanted length of an insert, in seconds. */
  wantedSec: [2.5, 3.5],
  /** The shortest and the longest insert, in seconds. Its end falls on a beat. */
  lengthSec: [2, 4.5],
  /**
   * The range of the seeded time from the start of an insert to the start of the next one, in
   * seconds: at most one insert in each 20 to 30 s.
   */
  gapSec: [20, 30],
  /**
   * The main shot shows at least this long before an insert, after its cut and its blend, and
   * after the focus pull of the cut, in seconds.
   */
  mainBeforeSec: 2.5,
  /** The main shot shows at least this long after an insert, in seconds. */
  mainAfterSec: 2,
  /** No seat enters from this long before an insert to its end, in seconds. */
  entryGuardSec: 1,
  /** The window before an insert whose lead the insert keeps, in seconds. */
  leadWindowSec: 4,
  /**
   * A detail that sounds with held notes, such as the bow or the keys, has notes over this part
   * of the insert or more.
   */
  coverage: 0.7,
  /** A struck detail, such as the sticks or the bars, has at least this many notes in the insert. */
  strokes: 2,
  /**
   * The loss of score of a detail that one of the two inserts before showed, for variety. A
   * detail of the lead gets 2 more, so a fresh detail of an active seat can win over a repeat.
   */
  repeatLoss: 1.5,
} as const;

/**
 * The smallest distance from the camera of a detail insert to each point of an animal body in its
 * frame, in meters (design 5.6). It is lower than `ANIMAL_FLOOR`, because the frame of an insert
 * holds the paws and the instrument, and the faces with their facets and seams stay out of it or
 * soft. Each head in the frame of an insert still keeps `ANIMAL_FLOOR`.
 */
export const INSERT_FLOOR = 0.9;

/**
 * The lens and the move of a detail insert (design 5.6). The remote cameras of a concert hall
 * stand on the railings, far from the players, and get their details with long lenses
 * (`camera-technique.md`). The long lens keeps the camera far from the animals and gives a
 * shallow depth of field.
 */
export const INSERT_LENS = {
  /** The vertical field of view, in degrees. */
  fov: 20,
  /** The zoom of the end of the move: a slow push-in. */
  pushIn: 0.94,
  /** The range of the seeded offset of the camera from the front of the player, in degrees. */
  offset: [10, 35],
  /** The range of the seeded elevation above the detail, in degrees. */
  elevation: [12, 24],
  /** The step to which the seeded azimuth snaps, in degrees. */
  turnStep: 12,
  /** The step to which the seeded elevation snaps, in degrees. */
  riseStep: 6,
  /**
   * The step of the grid to which the point of a detail in the play pose snaps, in meters. The
   * tests of the stage at one point then serve the inserts of a detail at its other times.
   */
  snap: 0.04,
  /**
   * The factors of the frame size of each detail (`INSERT_SIZES`) that the search tries in turn.
   * A frame of the paws of a flute at the first size cut the face of the player, and the second
   * size holds its eyes.
   */
  sizes: [1, 1.5],
  /** The steps of the search around the seeded azimuth, in degrees, to both sides. */
  azimuthSteps: [0, 12, 24, 36, 48, 60, 72],
  /** The steps of the search above the seeded elevation, in degrees. */
  elevationSteps: [0, 10, 20, 32],
  /**
   * The highest elevation of a camera above its detail, in degrees, plus the lift of the detail.
   * A camera of 51° over a small mouse showed mostly the floor around it.
   */
  maxElevation: 40,
  /** The largest azimuth of the camera from the front of the player, in degrees. */
  maxFromFront: 80,
  /** The smallest distance of a camera from the surface of the cone of the beam, in meters. */
  beamMargin: 0.3,
  /**
   * The view of the keys, in degrees: the turn of its front from the front of the pianist to its
   * right, and the added elevation. The case stands in front of the pianist, so the camera stands
   * at the side of the high keys and higher, as the camera of a piano shot.
   */
  keyboard: { turn: -88, lift: 20 },
} as const;

/** Half the height of the frame of each detail at its point, in meters (design 5.6). */
export const INSERT_SIZES = {
  keys: 0.3,
  bow: 0.24,
  fingers: 0.22,
  harp: 0.4,
  slide: 0.34,
  bell: 0.26,
  sticks: 0.36,
  bars: 0.36,
  baton: 0.36,
} as const satisfies Record<InsertDetail, number>;

/**
 * The details that sound with held notes. The others sound with strokes: the sticks, the bars,
 * and the plucks of the harp.
 */
const HELD_DETAILS: ReadonlySet<InsertDetail> = new Set([
  'keys',
  'bow',
  'fingers',
  'slide',
  'bell',
]);

/** One detail of a player on the stage, which an insert can show. */
interface DetailSpot {
  readonly detail: InsertDetail;
  /** The seat of the player, or `null` for the conductor. */
  readonly seat: number | null;
  /** The index of the player in `SceneLayout.players`, or `CONDUCTOR_OWNER`. */
  readonly owner: number;
  /** The azimuth of the front of the player: the camera stands near it. */
  readonly front: number;
  /** The elevation that the detail adds to the seeded elevation, in degrees. */
  readonly lift: number;
  /**
   * The point of the detail, or the low end of a line of keys or bars, in the model axes of the
   * bind pose.
   */
  readonly point: Vec3;
  /** The high end of a line of keys or bars, or `null` for a point. */
  readonly end: Vec3 | null;
  /** The MIDI keys at `point` and at `end`, or `null` for a point. */
  readonly keys: readonly [number, number] | null;
  /**
   * The bone of the player that the point follows, as an index in `BONE_NAMES`, or -1 for a
   * point that keeps its bind place on the stage: the beat point of the baton.
   */
  readonly bone: number;
  /** The player model. */
  readonly model: PlayerModel;
  /** The place of the player on the stage. */
  readonly place: Pick<PlayerPlace, 'position' | 'facing'>;
}

/** The camera of an insert at its detail, with no time. */
interface InsertCamera {
  readonly from: ShotKey;
  readonly to: ShotKey;
  /** The camera at the start of the move. */
  readonly camera: Vec3;
  /** Half the height of the frame at the detail, in meters. */
  readonly half: number;
}

/** The inputs of {@link planInserts}. */
export interface InsertInputs {
  readonly music: ScoreMusic;
  readonly layout: SceneLayout;
  readonly models: ModelCache;
  /** The pose plan of the score, for the play pose of each detail (design 5.6). */
  readonly poses: PosePlan;
  readonly clearance: StageClearance;
  readonly bodies: readonly StageBody[];
  readonly heads: readonly StageHead[];
  readonly stageSide: number;
  readonly seed: number;
}

/**
 * Gives the middle of two points.
 *
 * @param a A point.
 * @param b Another point.
 * @returns The middle.
 */
function middle(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * Gives the point of a target of the instrument in the model axes, or `null` for a target on a
 * piece that hangs in the bind pose, such as a mallet or the bow.
 *
 * @param model The player model.
 * @param target The target.
 * @param at The part of the line from `from` to `to`.
 * @returns The point, or `null`.
 */
function targetPoint(model: PlayerModel, target: PlayTarget, at: number): Vec3 | null {
  if (target.bone !== 'instrument' && target.bone !== 'slide') {
    return null;
  }
  const { from, to } = target;
  const point: Vec3 = [
    from[0] + (to[0] - from[0]) * at,
    from[1] + (to[1] - from[1]) * at,
    from[2] + (to[2] - from[2]) * at,
  ];
  return placePoint(model.pieces, { bone: target.bone, at: point });
}

/** One detail of a player model, in the model axes of the bind pose. */
interface ModelDetail {
  readonly detail: InsertDetail;
  readonly point: Vec3;
  readonly end: Vec3 | null;
  readonly keys: readonly [number, number] | null;
  /** The bone of the player that the point follows, as an index in `BONE_NAMES`. */
  readonly bone: number;
}

/**
 * Finds the details of one player in the model axes: the keys of a piano, the bow and the left
 * paw of a string player, the strings of a harp, the paws of a woodwind, the slide of a trombone,
 * the bell of the other brass, the heads of the drums, and the bars of a xylophone.
 *
 * @param model The player model.
 * @returns The details, each with a point, or a line with its keys.
 */
function modelDetails(model: PlayerModel): ModelDetail[] {
  const { targets, grips, id } = model.instrument;
  const of = (kind: PlayTarget['kind']): PlayTarget[] => targets.filter((t) => t.kind === kind);
  const instrument = boneIndex('instrument');
  const palm = (side: 'palmL' | 'palmR'): Vec3 | null => {
    const grip = grips[side];
    return grip?.bone === 'instrument' ? placePoint(model.pieces, grip) : null;
  };
  const out: ModelDetail[] = [];
  const line = (detail: InsertDetail, target: PlayTarget | undefined): void => {
    const a = target ? targetPoint(model, target, 0) : null;
    const b = target ? targetPoint(model, target, 1) : null;
    if (target && a && b) {
      out.push({ detail, point: a, end: b, keys: target.keys, bone: boneIndex(target.bone) });
    }
  };
  const point = (detail: InsertDetail, at: Vec3 | null, bone = instrument): void => {
    if (at) {
      out.push({ detail, point: at, end: null, keys: null, bone });
    }
  };
  const [contact] = of('bow-contact');
  const [strings] = of('strings');
  const [bell] = of('bell');
  const [slide] = of('slide');
  const heads = of('head')
    .map((t) => targetPoint(model, t, 0))
    .filter((p): p is Vec3 => p !== null);
  switch (id) {
    case 'piano':
      line('keys', of('keyboard')[0]);
      break;
    case 'xylophone':
      line('bars', of('bars')[0]);
      break;
    case 'violin':
    case 'viola':
      point('bow', contact ? targetPoint(model, contact, 0) : null);
      point('fingers', palm('palmL'));
      break;
    case 'cello':
    case 'contrabass':
      // The left paw travels along the long neck, away from its grip of the bind pose, so a
      // frame at the grip missed it. The bow stays on its contact point.
      point('bow', contact ? targetPoint(model, contact, 0) : null);
      break;
    case 'harp':
      point('harp', strings ? targetPoint(model, strings, 0.5) : null);
      break;
    case 'flute':
    case 'oboe':
    case 'clarinet':
    case 'bassoon': {
      const left = palm('palmL');
      const right = palm('palmR');
      point('fingers', left && right ? middle(left, right) : null);
      break;
    }
    case 'trombone':
      point(
        'slide',
        slide ? targetPoint(model, slide, 0.5) : null,
        boneIndex(slide?.bone ?? 'slide'),
      );
      break;
    case 'horn':
    case 'trumpet':
    case 'tuba':
      point(
        'bell',
        bell ? targetPoint(model, bell, 0) : null,
        boneIndex(bell?.bone ?? 'instrument'),
      );
      break;
    case 'timpani':
    case 'snare-drum':
    case 'bass-drum':
      if (heads.length > 0) {
        const sum = heads.reduce(
          (s, p): Vec3 => [s[0] + p[0], s[1] + p[1], s[2] + p[2]],
          [0, 0, 0],
        );
        point('sticks', [sum[0] / heads.length, sum[1] / heads.length, sum[2] / heads.length]);
      }
      break;
    default:
      break;
  }
  return out;
}

/**
 * Finds the details of the principal player of each seat and of the conductor on the stage.
 *
 * @param layout The layout of the score.
 * @param models The player models of the score.
 * @returns The details.
 */
function stageDetails(layout: SceneLayout, models: ModelCache): DetailSpot[] {
  const spots: DetailSpot[] = [];
  const principals = new Map<number, { place: PlayerPlace; index: number }>();
  for (const [index, place] of layout.players.entries()) {
    // The principal player of a seat, or else its first player.
    const seat = place.cast.seatIndex;
    if (!principals.has(seat) || place.cast.player === 0) {
      principals.set(seat, { place, index });
    }
  }
  for (const [seat, { place, index }] of principals) {
    const { species, instrument, kettles, support } = place.cast;
    const model = models.get(species, instrument, kettles, support);
    for (const d of modelDetails(model)) {
      const keys = d.detail === 'keys' ? INSERT_LENS.keyboard : null;
      spots.push({
        ...d,
        seat,
        owner: index,
        front: frontOf(place.facing) + (keys?.turn ?? 0) * DEG,
        lift: keys?.lift ?? 0,
        model,
        place,
      });
    }
  }
  if (layout.conductor) {
    const bear = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
    spots.push({
      detail: 'baton',
      seat: null,
      owner: CONDUCTOR_OWNER,
      // The bear faces the orchestra, so the camera of its baton stands on the audience side.
      front: 0,
      lift: 0,
      point: conductorBeatPoint(bear),
      end: null,
      keys: null,
      bone: -1,
      model: bear,
      place: layout.conductor,
    });
  }
  return spots;
}

/**
 * Gives the notes of a seat that start in a time range: their count and their mean MIDI key.
 *
 * @param music The music of the score.
 * @param seat The seat.
 * @param from The start of the range, in song seconds.
 * @param to The end of the range.
 * @returns The count and the mean key, or 0 for no note.
 */
function notesIn(music: ScoreMusic, seat: number, from: number, to: number): [number, number] {
  const notes = music.seats[seat];
  if (!notes) {
    return [0, 0];
  }
  let count = 0;
  let sum = 0;
  for (
    let i = Math.max(0, lastAtOrBefore(notes.starts, from - 1e-9) + 1);
    i < notes.starts.length;
    i++
  ) {
    if ((notes.starts[i] ?? Infinity) >= to) {
      break;
    }
    count++;
    sum += notes.pitches[i] ?? 0;
  }
  return [count, count > 0 ? sum / count : 0];
}

/** The detail of an insert in the play pose: the point that the camera looks at, and its part. */
interface PosedDetail {
  /** The point of the detail on the stage: the middle of the frame. */
  readonly target: Vec3;
  /** The point or the line of the detail with its reach, for the cover test. */
  readonly part: InsertDetailPart;
}

/**
 * Gives the point of a detail in the play pose of the middle of the insert (design 5.6): the
 * point, or the place of the mean key of the notes of the insert on a line of keys or bars, where
 * the paws or the mallets play. The bell of a played trumpet hangs lower than in the bind pose, so
 * a frame at the bind point cut the head of the player through the eyes.
 *
 * @param spot The detail.
 * @param posed The player of the detail in the pose of the middle of the insert.
 * @param meanKey The mean MIDI key of the notes of the insert, or 0 for none.
 * @returns The posed point and the part of the detail.
 */
function detailAt(spot: DetailSpot, posed: PosedPlayer, meanKey: number): PosedDetail {
  const { point, end, keys, bone } = spot;
  const place = (p: Vec3): Vec3 => (bone < 0 ? onStage(p, spot.place) : posedPoint(posed, bone, p));
  const reach = INSERT_FRAME.detailReach * INSERT_SIZES[spot.detail];
  const from = place(point);
  if (!end) {
    return { target: from, part: { from, to: from, reach } };
  }
  const to = place(end);
  const t =
    keys && meanKey > 0
      ? Math.min(1, Math.max(0, (meanKey - keys[0]) / Math.max(1, keys[1] - keys[0])))
      : 0.5;
  const target: Vec3 = [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
  return { target, part: { from, to, reach } };
}

/** The camera of a main shot at a cut of an insert. */
interface MainCamera {
  /** The camera position. */
  readonly camera: Vec3;
  /** The point that the camera looks at. */
  readonly look: Vec3;
  /** Half the height of the frame at the point that the camera looks at, in meters. */
  readonly half: number;
}

/** The transport of the samples of the main shots: after the first play, at the song time. */
const SAMPLE_TRANSPORT: Transport = {
  playing: false,
  changedAtWall: 0,
  before: null,
  startSec: 0,
  seekStart: false,
  endedAtSong: false,
  holdSec: 0,
  leadSec: Infinity,
};

/**
 * The transport of the play pose of a detail: a play from the song start, with the instruments
 * up.
 */
const PLAYING: Transport = {
  playing: true,
  changedAtWall: 0,
  before: null,
  startSec: 0,
  seekStart: false,
  endedAtSong: false,
  holdSec: 3,
  leadSec: Infinity,
};

/**
 * Gives the camera of a main shot at a time, and half the height of its frame at the point that
 * it looks at.
 *
 * @param plan The plan of the main shots.
 * @param time The song time.
 * @returns The camera, the point, and the half height.
 */
function mainCamera(plan: ShotPlan, time: number): MainCamera {
  const pose = cameraAt(
    plan,
    time,
    SAMPLE_TRANSPORT,
    { aspect: CINEMA_ASPECT, still: true },
    createCameraPose(),
  );
  const [cx, cy, cz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const distance = Math.hypot(tx - cx, ty - cy, tz - cz);
  return {
    camera: [cx, cy, cz],
    look: [tx, ty, tz],
    half: distance * Math.tan((pose.fov / 2) * DEG),
  };
}

/**
 * Tells if a cut between a main camera and an insert camera keeps the 30° rule (design 5.6): the
 * size of the frame changes by `FILM_GRAMMAR.jumpSize`, or the view turns by `jumpAngle`.
 *
 * @param main The main camera at the cut.
 * @param camera The insert camera.
 * @param target The point of the insert.
 * @param half Half the height of the frame of the insert.
 * @returns True if the cut is no jump cut.
 */
function cutKeepsGrammar(main: MainCamera, camera: Vec3, target: Vec3, half: number): boolean {
  const ratio = Math.max(main.half / half, half / main.half);
  if (ratio >= FILM_GRAMMAR.jumpSize) {
    return true;
  }
  const a = [
    main.look[0] - main.camera[0],
    main.look[1] - main.camera[1],
    main.look[2] - main.camera[2],
  ];
  const b = [target[0] - camera[0], target[1] - camera[1], target[2] - camera[2]];
  const dot = (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  const angle = Math.acos(
    Math.min(1, Math.max(-1, dot / (Math.hypot(...a) * Math.hypot(...b) || 1))),
  );
  return angle >= FILM_GRAMMAR.jumpAngle;
}

/** A detail of an insert in the play pose of the middle of the insert. */
interface DetailView {
  readonly spot: DetailSpot;
  /** The posed point and the part of the detail. */
  readonly detail: PosedDetail;
  /** The player of the detail in the pose of the middle of the insert. */
  readonly posed: PosedPlayer;
  /** The radius of a sphere around the head of the player, with the snout, in meters. */
  readonly headRadius: number;
}

/** The test that refuses a camera of an insert. */
type InsertRefusal =
  | 'line'
  | 'beam'
  | 'sight'
  | 'floor'
  | 'head-floor'
  | 'head'
  | 'cover'
  | 'soft'
  | 'detail'
  | 'face';

/**
 * Finds the first test of the stage that refuses a camera of an insert (design 5.6). These tests
 * read only the point of the detail, so the planner keeps their results for each point. A clear
 * camera keeps the line of the stage, stays on one side of the beam, sees its detail, keeps
 * {@link INSERT_FLOOR} from each body and `ANIMAL_FLOOR` from each head in its frame, and has no
 * head of another player in its foreground. The line of sight skips the boxes of the player of
 * the detail, because they hold its arms in the bind pose: the cover test reads its posed body.
 *
 * @param inputs The inputs of the plan.
 * @param spot The detail.
 * @param target The point of the detail.
 * @param near The camera at the end of the push-in.
 * @param far The camera at the start of the move.
 * @returns The refusal, or `null` for a clear camera.
 */
function stageRefusal(
  inputs: InsertInputs,
  spot: DetailSpot,
  target: Vec3,
  near: Vec3,
  far: Vec3,
): InsertRefusal | null {
  const { fov, beamMargin } = INSERT_LENS;
  const aspect = CINEMA_ASPECT;
  const S = inputs.stageSide;
  const { clearance } = inputs;
  for (const camera of [near, far]) {
    if (!keepsLine(camera, target)) {
      return 'line';
    }
  }
  const sides = [near, far].map((c) =>
    insideBeam(S, c, beamMargin) ? 1 : insideBeam(S, c, -beamMargin) ? 0 : -1,
  );
  if (sides.includes(0) || sides[0] !== sides[1]) {
    return 'beam';
  }
  const held = bodyBoxes(clearance, target);
  const seen = new Set(held);
  for (const obstacle of clearance.obstacles) {
    if (obstacle.owner === spot.owner) {
      for (const box of obstacle.boxes) {
        seen.add(box);
      }
    }
  }
  const path: Segment = {
    ax: near[0],
    ay: near[1],
    az: near[2],
    bx: far[0],
    by: far[1],
    bz: far[2],
  };
  if (
    Math.min(near[1], far[1]) < CLEARANCE.height ||
    !targetLineClear(clearance, target, far, seen) ||
    !segmentClear(clearance, path, 'clearance', held)
  ) {
    return 'sight';
  }
  for (const camera of [near, far]) {
    if (animalTooNear(inputs.bodies, camera, target, fov, aspect, INSERT_FLOOR)) {
      return 'floor';
    }
    for (const head of inputs.heads) {
      const d = Math.hypot(
        head.center[0] - camera[0],
        head.center[1] - camera[1],
        head.center[2] - camera[2],
      );
      if (d - head.radius < ANIMAL_FLOOR && inFrame(head.center, camera, target, fov, aspect)) {
        return 'head-floor';
      }
    }
    if (foregroundHead(inputs.heads, [spot.owner], target, camera, target, fov, aspect)) {
      return 'head';
    }
  }
  return null;
}

/**
 * Finds the first test of the play pose that refuses a camera of an insert (design 5.6). The
 * objects in front of the detail, also the posed body of its player, cover at most
 * `INSERT_FRAME.coverShare` of the frame and leave the detail free. The frame shows both eyes of
 * the player of the detail, or no part of its head.
 *
 * @param inputs The inputs of the plan.
 * @param view The detail in the play pose.
 * @param near The camera at the end of the push-in.
 * @param far The camera at the start of the move.
 * @returns The refusal, or `null` for a clear camera.
 */
function poseRefusal(
  inputs: InsertInputs,
  view: DetailView,
  near: Vec3,
  far: Vec3,
): InsertRefusal | null {
  const { spot, detail, posed } = view;
  for (const camera of [near, far]) {
    const frame: InsertView = {
      camera,
      target: detail.target,
      fov: INSERT_LENS.fov,
      aspect: CINEMA_ASPECT,
      lens: lensScale(camera, detail.target, INSERT_LENS.fov, inputs.stageSide),
    };
    const cover = insertCover(frame, posed, spot.owner, detail.part, inputs.clearance);
    if (cover.share > INSERT_FRAME.coverShare) {
      return 'cover';
    }
    if (cover.soft > INSERT_FRAME.softShare) {
      return 'soft';
    }
    if (cover.detail) {
      return 'detail';
    }
    if (cutsFace(frame, posed, view.headRadius)) {
      return 'face';
    }
  }
  return null;
}

/**
 * Finds the first clear camera of an insert at its detail that the cuts accept, in the order of
 * the search: the seeded azimuth and elevation, then the steps around them (design 5.6). The
 * seeded values snap to the steps of the search, so the results of the tests of the stage at one
 * point serve each insert of the detail.
 *
 * @param inputs The inputs of the plan.
 * @param view The detail in the play pose.
 * @param random The seeded generator of the insert.
 * @param accept The test of the cuts into and out of the insert.
 * @param known The results of the tests of the stage at the point of the detail, by the turn
 *   and the elevation of the camera. The call adds its new results.
 * @param refused The refusals of the tests of the play pose of the detail at its earlier
 *   inserts, by the turn and the elevation of the camera. The call adds its new refusals.
 * @returns The camera, or `null`.
 */
function insertCamera(
  inputs: InsertInputs,
  view: DetailView,
  random: () => number,
  accept: (camera: InsertCamera) => boolean,
  known: Map<number, InsertRefusal | null>,
  refused: Map<number, InsertRefusal>,
): InsertCamera | null {
  const k = INSERT_LENS;
  const { spot } = view;
  const { target } = view.detail;
  const S = inputs.stageSide;
  const side = random() < 0.5 ? -1 : 1;
  const snap = (value: number, step: number): number => Math.round(value / step) * step;
  const offset = snap((k.offset[0] + (k.offset[1] - k.offset[0]) * random()) * side, k.turnStep);
  const elevation = snap(
    k.elevation[0] + (k.elevation[1] - k.elevation[0]) * random() + spot.lift,
    k.riseStep,
  );
  for (const [index, size] of k.sizes.entries()) {
    const half = INSERT_SIZES[spot.detail] * size;
    for (const rise of k.elevationSteps) {
      for (const step of k.azimuthSteps) {
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const turn = offset + sign * step;
          const up = elevation + rise;
          if (Math.abs(turn) > k.maxFromFront || up > k.maxElevation + spot.lift) {
            continue;
          }
          const from: ShotKey = {
            azimuth: spot.front + turn * DEG,
            elevation: up * DEG,
            zoom: 1,
            fov: k.fov,
          };
          const to: ShotKey = { ...from, zoom: k.pushIn };
          const far: [number, number, number] = [0, 0, 0];
          const near: [number, number, number] = [0, 0, 0];
          writeKeyPosition(
            target,
            from.azimuth,
            from.elevation,
            keyDistance(S, half, from, CINEMA_ASPECT),
            far,
          );
          writeKeyPosition(
            target,
            to.azimuth,
            to.elevation,
            keyDistance(S, half, to, CINEMA_ASPECT),
            near,
          );
          const camera: InsertCamera = { from, to, camera: far, half };
          if (!accept(camera)) {
            continue;
          }
          const id = (index * 1000 + Math.round(turn) + 500) * 1000 + Math.round(up);
          let refusal = known.get(id);
          if (refusal === undefined) {
            refusal = stageRefusal(inputs, spot, target, near, far);
            known.set(id, refusal);
          }
          refusal ??= refused.get(id) ?? null;
          if (refusal === null) {
            refusal = poseRefusal(inputs, view, near, far);
            if (refusal !== null) {
              refused.set(id, refusal);
            }
          }
          if (refusal === null) {
            return camera;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Snaps a point to the grid of {@link INSERT_LENS}.snap, so that the tests of the stage at the
 * point serve each insert whose detail comes near it.
 *
 * @param point The point.
 * @returns The snapped point.
 */
function snapPoint(point: Vec3): Vec3 {
  const step = INSERT_LENS.snap;
  return [
    Math.round(point[0] / step) * step,
    Math.round(point[1] / step) * step,
    Math.round(point[2] / step) * step,
  ];
}

/**
 * Poses the player of a detail at a song time, and gives its detail in that pose (design 5.6).
 *
 * @param inputs The inputs of the plan.
 * @param spot The detail.
 * @param poses The pose buffer of the scene, which the call writes.
 * @param time The song time: the middle of the insert.
 * @param meanKey The mean MIDI key of the notes of the insert, or 0 for none.
 * @returns The detail in the play pose.
 */
function detailView(
  inputs: InsertInputs,
  spot: DetailSpot,
  poses: ScenePoseBuffer,
  time: number,
  meanKey: number,
): DetailView {
  const { players } = inputs.poses;
  const needed = new Uint8Array(players.length + 1);
  needed[spot.owner === CONDUCTOR_OWNER ? players.length : spot.owner] = 1;
  const scene = poseAt(inputs.poses, time, time, PLAYING, [], poses, needed);
  const pose = spot.owner === CONDUCTOR_OWNER ? scene.conductor : scene.players[spot.owner];
  if (!pose) {
    throw new Error(`The pose plan has no pose of the player ${spot.owner}.`);
  }
  const posed = posePlayer(spot.model, pose, spot.place);
  const head = inputs.heads.find((h) => h.owner === spot.owner);
  const detail = detailAt(spot, posed, meanKey);
  return {
    spot,
    detail: { ...detail, target: snapPoint(detail.target) },
    posed,
    headRadius: head?.radius ?? 0,
  };
}

/**
 * Makes the seeded generator of one insert.
 *
 * @param seed The seed of the plan.
 * @param time The start of the insert, in song seconds.
 * @param name The name of the decision.
 * @returns The generator.
 */
function insertRandom(seed: number, time: number, name: string): () => number {
  let hash = mixHash(seed, Math.round(time * 1000));
  for (let i = 0; i < name.length; i++) {
    hash = mixHash(hash, name.charCodeAt(i));
  }
  return mulberry32(hash);
}

/**
 * Gives the seats that carry the lead in a window, as one key.
 *
 * @param window The music of the window.
 * @returns The seats with the lead, joined by commas.
 */
function leadKey(window: WindowMusic): string {
  return window.lead.flatMap((lead, seat) => (lead ? [seat] : [])).join(',');
}

/**
 * Tells if a detail moves with the music of an insert (design 5.6): a held detail, such as the
 * bow, has notes over most of the insert, and a struck detail has a few strokes. The baton moves
 * in each window in which the orchestra plays.
 *
 * @param spot The detail.
 * @param window The music of the insert.
 * @param strokes The number of notes of the seat that start in the insert.
 * @returns True if the detail moves.
 */
function moves(spot: DetailSpot, window: WindowMusic, strokes: number): boolean {
  if (spot.seat === null) {
    return window.tutti;
  }
  if (HELD_DETAILS.has(spot.detail)) {
    return (window.coverage[spot.seat] ?? 0) >= INSERT_RULES.coverage;
  }
  return strokes >= INSERT_RULES.strokes;
}

/**
 * Lists the times of the cuts of a main shot at which an insert can start: its downbeats and the
 * middle beats of its bars (design 5.6).
 *
 * @param music The music of the score.
 * @param from The earliest start, in song seconds.
 * @param to The latest start.
 * @returns The times, sorted.
 */
function cutTimes(music: ScoreMusic, from: number, to: number): number[] {
  const out: number[] = [];
  const { downbeats, beats } = music;
  for (let bar = Math.max(0, lastAtOrBefore(downbeats, from)); bar < downbeats.length; bar++) {
    const start = downbeats[bar] ?? Infinity;
    if (start > to) {
      break;
    }
    if (start >= from) {
      out.push(start);
    }
    const next = downbeats[bar + 1];
    if (next !== undefined) {
      const mid = (start + next) / 2;
      const beat = beats[lastAtOrBefore(beats, mid + 1e-6)];
      if (beat !== undefined && Math.abs(beat - mid) < 1e-3 && mid >= from && mid <= to) {
        out.push(mid);
      }
    }
  }
  return out;
}

/**
 * Gives the end of an insert: the beat nearest to its wanted end, within the lengths of
 * {@link INSERT_RULES}.
 *
 * @param music The music of the score.
 * @param start The start of the insert.
 * @param wanted The wanted length.
 * @param latest The latest end.
 * @returns The end, or `null` with no beat in reach.
 */
function insertEnd(
  music: ScoreMusic,
  start: number,
  wanted: number,
  latest: number,
): number | null {
  const [shortest, longest] = INSERT_RULES.lengthSec;
  const { beats } = music;
  let best: number | null = null;
  for (let i = Math.max(0, lastAtOrBefore(beats, start + shortest)); i < beats.length; i++) {
    const beat = beats[i] ?? Infinity;
    if (beat > start + longest || beat > latest) {
      break;
    }
    if (beat - start < shortest - 1e-9) {
      continue;
    }
    if (best === null || Math.abs(beat - start - wanted) < Math.abs(best - start - wanted)) {
      best = beat;
    }
  }
  return best;
}

/**
 * Plans the detail inserts of a score after its main shots (design 5.6). Pure: the same inputs
 * give the same inserts.
 *
 * - An insert cuts away from a main shot and back to it, inside the main shot. The first and the
 *   last shot get none.
 * - It starts on a downbeat or a middle beat, at least `mainBeforeSec` after the cut, the blend,
 *   and the focus pull of the main shot, and it ends on a beat at least `mainAfterSec` before the
 *   end of the main shot. It lasts 2 to 4.5 s.
 * - At most one insert in each seeded gap of 20 to 30 s, and one in each main shot.
 * - The music keeps its lead: no seat enters from 1 s before the insert to its end, and the
 *   window of the insert has the lead of the window before it, or both windows are a tutti.
 * - The detail moves with the music ({@link moves}). A detail of the lead wins, then the most
 *   activity, with a seeded jitter. The insert does not show the detail or the player of the
 *   insert before it, and a detail of the two inserts before it loses score.
 * - The player of the detail takes its play pose at the middle of the insert, and the camera
 *   frames the posed detail. The camera passes the tests of the stage ({@link stageRefusal}) and
 *   of the play pose ({@link poseRefusal}), and each of its two cuts keeps the 30° rule. A detail
 *   with no such camera gives no insert.
 *
 * @param inputs The inputs of the plan.
 * @param shots The main shots, sorted.
 * @returns The inserts, sorted.
 */
export function planInserts(inputs: InsertInputs, shots: readonly Shot[]): Shot[] {
  const { music, seed } = inputs;
  const spots = stageDetails(inputs.layout, inputs.models);
  if (spots.length === 0) {
    return [];
  }
  const main: ShotPlan = {
    stageSide: inputs.stageSide,
    shots,
    starts: Float64Array.from(shots, (s) => s.startSec),
    inserts: [],
    insertStarts: new Float64Array(0),
  };
  const poses = createScenePose(inputs.poses);
  const stageResults = new Map<string, Map<number, InsertRefusal | null>>();
  const poseRefusals = new Map<string, Map<number, InsertRefusal>>();
  const inserts: Shot[] = [];
  let nextFrom = -Infinity;
  let last: DetailSpot | null = null;
  const recent: InsertDetail[] = [];
  const R = INSERT_RULES;
  for (let i = 1; i < shots.length - 1; i++) {
    const shot = shots[i];
    if (!shot) {
      continue;
    }
    const earliest = Math.max(
      shot.startSec + Math.max(shot.blendSec, FOCUS_PULL.seconds) + R.mainBeforeSec,
      nextFrom,
    );
    const latestEnd = shot.endSec - R.mainAfterSec;
    let placed = false;
    for (const start of cutTimes(music, earliest, latestEnd - R.lengthSec[0])) {
      const random = insertRandom(seed, start, 'insert');
      const wanted = R.wantedSec[0] + (R.wantedSec[1] - R.wantedSec[0]) * random();
      const end = insertEnd(music, start, wanted, latestEnd);
      if (end === null) {
        continue;
      }
      if (entriesIn(music, start - R.entryGuardSec, end).length > 0) {
        continue;
      }
      const window = musicIn(music, start, end);
      const before = musicIn(music, start - R.leadWindowSec, start);
      const lead = leadKey(window);
      const keepsLead = lead === leadKey(before) && (lead !== '' || (window.tutti && before.tutti));
      if (!keepsLead) {
        continue;
      }
      const ranked = spots
        .map((spot) => {
          const [strokes, meanKey] =
            spot.seat === null ? [0, 0] : notesIn(music, spot.seat, start, end);
          const seat = spot.seat;
          const score =
            (seat === null
              ? 1
              : (window.lead[seat] ? 2 : 0) + (window.activity[seat] ?? 0) + 0.5 * random()) -
            (recent.includes(spot.detail) ? R.repeatLoss : 0);
          return { spot, strokes, meanKey, score };
        })
        .filter(
          ({ spot, strokes }) =>
            moves(spot, window, strokes) &&
            spot.detail !== last?.detail &&
            spot.owner !== last?.owner,
        )
        .toSorted((a, b) => b.score - a.score);
      for (const { spot, meanKey } of ranked) {
        const view = detailView(inputs, spot, poses, (start + end) / 2, meanKey);
        const { target } = view.detail;
        const into = mainCamera(main, start);
        const back = mainCamera(main, end);
        const point = `${spot.owner} ${spot.detail} ${target.map((v) => v.toFixed(2)).join(',')}`;
        let known = stageResults.get(point);
        if (!known) {
          known = new Map();
          stageResults.set(point, known);
        }
        const spotKey = `${spot.owner} ${spot.detail}`;
        let refusedBySpot = poseRefusals.get(spotKey);
        if (!refusedBySpot) {
          refusedBySpot = new Map();
          poseRefusals.set(spotKey, refusedBySpot);
        }
        const camera = insertCamera(
          inputs,
          view,
          insertRandom(seed, start, `${spot.owner} ${spot.detail}`),
          (c) =>
            cutKeepsGrammar(into, c.camera, target, c.half) &&
            cutKeepsGrammar(back, c.camera, target, c.half),
          known,
          refusedBySpot,
        );
        if (!camera) {
          continue;
        }
        inserts.push({
          kind: 'insert',
          startSec: start,
          endSec: end,
          moveEndSec: end,
          seats: spot.seat === null ? [] : [spot.seat],
          part: null,
          target,
          halfHeight: camera.half,
          composition: null,
          from: camera.from,
          to: camera.to,
          blendSec: 0,
          hero: spot.owner,
          detail: spot.detail,
        });
        const gap = R.gapSec[0] + (R.gapSec[1] - R.gapSec[0]) * random();
        nextFrom = start + gap;
        last = spot;
        recent.unshift(spot.detail);
        recent.length = Math.min(recent.length, 2);
        placed = true;
        break;
      }
      if (placed) {
        break;
      }
    }
  }
  return inserts;
}
