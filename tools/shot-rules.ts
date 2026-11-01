/**
 * Checks the shots of the cinematic camera against the rules of film grammar (design 5.6,
 * `docs/reference/camera-technique.md`), over each demo, at the aspect of Cinematic mode. The
 * check reads only the camera of `cameraAt()` and the places of the players, so it also runs on a
 * commit from before the rules.
 *
 * - `line`: a camera turns more than {@link GRAMMAR.lineAzimuth} away from the audience axis, so
 *   the stage can swap its sides on the screen (the 180° rule).
 * - `look`: a player or a section looks to the other side of the screen than in the master shot
 *   (the 180° rule of the eyeline).
 * - `jump`: two shots in a row of the same subject differ by less than 30° in the direction of the
 *   camera, and by less than 1.5 times in the size of the frame (the 30° rule).
 * - `motion`: two moves in a row go in opposite directions across a cut.
 * - `room`: a close shot of a player or a section that looks to one side puts it in the middle of
 *   the frame, or on the side of its look (look room).
 * - `headroom`: the eyes of a close shot of a player or a section are far from the upper third line.
 * - `head`: the top of a head of a player of a solo or a section shot is above the top edge of the
 *   frame (a cut head). The head has the bones of `HEAD_BONES` of `src/shots/subjects.ts`, with no
 *   ears. A commit from before that list gets no count.
 *
 * The tool also gives the median and the largest elevation and height of the camera of each kind
 * of shot, from a sample each {@link SAMPLE_STEP}, and the median share of the frame width that
 * the footprints of the players of a solo or a section shot fill.
 *
 * For each shot, the tool also measures the nearest animal: the distance from the camera to the
 * nearest point of an animal body in the frame, and the largest part of the frame height that
 * one head fills. A head or a body of the dirty frame counts. The samples of a shot include the
 * end of its move, the closest moment of a push-in, and {@link BLEND_SAMPLES} samples of the
 * blend into it. The table gives the minimum, the 5th percentile, and the median distance of each
 * kind of shot, and the largest, the 95th percentile, and the median head part. Its row `blend`
 * gives the nearest animal of the blend samples alone, one value for each blend.
 *
 * Usage: pnpm shot-trace --rules [--demo <id>]... [--base <ref>] [--list] [--json <file>]
 */
import { writeFileSync } from 'node:fs';

import { patchedDemos } from './patch-demos.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { CONDUCTOR } from '../src/models/cast.ts';
import { layoutObstacles, layoutScene } from '../src/models/layout-scene.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { Transport } from '../src/pose/types.ts';
import { buildScore } from '../src/score/score.ts';
import { cameraAt, createCameraPose } from '../src/shots/camera-at.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import * as shotSubjects from '../src/shots/subjects.ts';
import type { StageSubjects } from '../src/shots/subjects.ts';
import type { Shot, ShotKind, ShotPlan } from '../src/shots/types.ts';
import { CINEMA_ASPECT, defaultView } from '../src/shots/view.ts';

/** Degrees to radians. */
const DEG = Math.PI / 180;

/**
 * The limits of the rules (design 5.6). The limits of the line, the look, the jump cut, and the
 * moves are the values of `FILM_GRAMMAR` of `src/shots/grammar.ts`, copied here so that the tool
 * also checks a commit from before it. The room and the eye limits are the tolerances of the check.
 */
export const GRAMMAR = {
  /** The largest angle of a camera from the audience axis, in radians. */
  lineAzimuth: 75 * DEG,
  /**
   * A subject that looks less than this angle from the camera axis, or from the axis away from the
   * camera, has no screen direction: it is neutral, as a head-on or a tail-away shot.
   */
  neutral: 20 * DEG,
  /** The smallest change of the direction of the camera between two shots of one subject. */
  jumpAngle: 30 * DEG,
  /** The smallest ratio of the frame sizes of two shots of one subject with a smaller turn. */
  jumpSize: 1.5,
  /** A move counts on an axis when it moves the camera this part of its distance to the subject. */
  moveShare: 0.02,
  /**
   * A subject that looks to one side stands at least this far from the middle of the frame, on the
   * other side, in parts of half the frame width. The third line is at 1/3.
   */
  roomShare: 0.2,
  /** The upper third line, in parts of half the frame height above the middle. */
  eyeLine: 1 / 3,
  /** The largest distance of the eyes from the upper third line, in parts of half the height. */
  eyeTolerance: 0.15,
} as const;

/** The step of the song time between two samples of the camera, in seconds. */
export const SAMPLE_STEP = 0.25;

/**
 * The number of parts of a blend between two samples of the nearest animal: 32, twice as many as
 * the samples of the floor test of the planner (`NEAR_SAMPLES` of `src/shots/prepare.ts`).
 */
const BLEND_SAMPLES = 32;

/** A rule of film grammar that the tool checks. */
export type GrammarRule = 'line' | 'look' | 'jump' | 'motion' | 'room' | 'headroom' | 'head';

/** The rules, in the order of the output. */
export const GRAMMAR_RULES: readonly GrammarRule[] = [
  'line',
  'look',
  'jump',
  'motion',
  'room',
  'headroom',
  'head',
];

/** One break of a rule. */
export interface RuleBreak {
  /** The rule. */
  readonly rule: GrammarRule;
  /** The demo. */
  readonly demo: string;
  /** The start of the shot, or the time of the cut, in song seconds. */
  readonly timeSec: number;
  /** The kind of the shot, or the kinds of the two shots of a cut, such as `solo > section`. */
  readonly kinds: string;
  /** The measure of the break, such as `azimuth -112.9°`. */
  readonly detail: string;
}

/** The elevations and the heights of the cameras of one kind of shot. */
export interface KindHeights {
  /** The elevation of each sample above the target of its shot, in degrees. */
  readonly elevations: number[];
  /** The height of each sample above the stage top, in meters. */
  readonly heights: number[];
  /**
   * The share of the frame width that the footprints of the players of each solo or section shot
   * fill, in the middle of its move.
   */
  readonly widths: number[];
  /** The nearest animal of each shot. */
  readonly near: ShotNear[];
  /** The nearest animal of the blend into each shot with a blend ({@link RulesOutput.blends}). */
  readonly blends: ShotNear[];
}

/** The nearest animal of one shot. */
export interface ShotNear {
  /** The demo. */
  readonly demo: string;
  /** The kind of the shot. */
  readonly kind: ShotKind;
  /** The start of the shot, in song seconds. */
  readonly startSec: number;
  /** The time of the sample with the nearest animal, in song seconds. */
  readonly timeSec: number;
  /** The distance from the camera to the nearest point of an animal body in the frame. */
  readonly distance: number;
  /** The largest part of the frame height that one head fills in the shot. */
  readonly head: number;
}

/** The result of the check of the demos. */
export interface RulesOutput {
  /** Each break, in the order of the demos and of the time. */
  readonly breaks: readonly RuleBreak[];
  /** The number of shots of each demo. */
  readonly shots: Readonly<Record<string, number>>;
  /** The median and the largest elevation and height of each kind, over all demos. */
  readonly kinds: Readonly<Record<string, KindSummary>>;
  /** True if the commit has the list of the bones of the head, so the tool counts cut heads. */
  readonly headChecked: boolean;
  /** The {@link CLOSEST_SHOTS} shots of each kind with the nearest animals, nearest first. */
  readonly closest: readonly ShotNear[];
  /**
   * The nearest animal of the blend into each shot with a blend, from its samples alone. The kind
   * is the kind of the shot after the blend.
   */
  readonly blends: readonly ShotNear[];
}

/** The number of shots of each kind with the nearest animals that `--list` gives. */
const CLOSEST_SHOTS = 3;

/** The median and the largest elevation and height of the cameras of one kind of shot. */
export interface KindSummary {
  /** The number of samples. */
  readonly samples: number;
  /** In degrees. */
  readonly medianElevation: number;
  readonly maxElevation: number;
  /** In meters above the stage top. */
  readonly medianHeight: number;
  readonly maxHeight: number;
  /** The median share of the frame width that the players fill, or 0 for no solo or section. */
  readonly medianWidth: number;
  /** The number of shots. */
  readonly shots: number;
  /** The distance from the camera to the nearest animal of a shot, in meters: the minimum. */
  readonly minDistance: number;
  /** The 5th percentile of that distance over the shots. */
  readonly lowDistance: number;
  /** The median of that distance over the shots. */
  readonly medianDistance: number;
  /** The largest part of the frame height that one head fills in a shot: the largest value. */
  readonly maxHead: number;
  /** The 95th percentile of that part over the shots. */
  readonly highHead: number;
  /** The median of that part over the shots. */
  readonly medianHead: number;
}

/** The transport of a play from the song start, as the camera probe uses it. */
const PLAYING: Transport = {
  playing: true,
  changedAtWall: 0,
  before: null,
  startSec: 0,
  holdSec: 3,
  leadSec: Infinity,
};

/** One camera of a frame, copied out of the buffer of `cameraAt()`. */
interface Frame {
  readonly position: Vec3;
  readonly look: Vec3;
  readonly fov: number;
}

/** The axes of a camera with no roll. */
interface Axes {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

/** The players that a close shot shows, for the rules of the look. */
interface ShotSubject {
  /** The middle of the players in the stage plane, at the height of the target of the shot. */
  readonly center: Vec3;
  /** The azimuth of the mean front of the players. */
  readonly facing: number;
  /** The mean point of the middles of their heads. */
  readonly eyes: Vec3;
  /** The index of each player in `SceneLayout.players`. */
  readonly owners: readonly number[];
}

/** The top of the head and the footprint of one player, for the head rule and the width share. */
export interface PlayerExtent {
  /**
   * The top of the head over the middle of the head, or `null` for a commit with no list of the
   * bones of the head.
   */
  readonly top: Vec3 | null;
  /** The corners of the footprint boxes in the stage plane. */
  readonly corners: readonly Vec3[];
}

/**
 * The bones of the head that the frame holds: `HEAD_BONES` of `src/shots/subjects.ts`, or `null`
 * for a commit from before that list. The tool then counts no cut heads.
 */
const headBones: ReadonlySet<number> | null =
  'HEAD_BONES' in shotSubjects ? shotSubjects.HEAD_BONES : null;

/**
 * Gives the top of the head and the footprint of each player of a layout. The tool reads them
 * from the models and the obstacles, so it also runs on a commit from before the extent of the
 * subjects (design 5.6).
 *
 * @param layout The layout.
 * @param models The models of the score.
 * @param subjects The places of the subjects.
 * @returns The extent of each player, by its index in `SceneLayout.players`.
 */
export function playerExtents(
  layout: SceneLayout,
  models: ModelCache,
  subjects: StageSubjects,
): Map<number, PlayerExtent> {
  const heads = new Map<number, Vec3>();
  for (const seat of subjects.seats) {
    for (const p of seat?.players ?? []) {
      heads.set(p.sights.owner, p.sights.head);
    }
  }
  const obstacles = layoutObstacles(layout, models);
  const first = layout.conductor ? 1 : 0;
  const extents = new Map<number, PlayerExtent>();
  for (const [index, place] of layout.players.entries()) {
    const { species, instrument, kettles, support } = place.cast;
    const { positions, bones } = models.get(species, instrument, kettles, support).mesh;
    let top = -Infinity;
    for (let corner = 0; corner < bones.length; corner++) {
      if (headBones?.has(bones[corner] ?? -1)) {
        top = Math.max(top, positions[corner * 3 + 1] ?? top);
      }
    }
    const head = heads.get(index) ?? place.position;
    const corners: Vec3[] = [];
    for (const box of obstacles[first + index]?.boxes ?? []) {
      for (const [lx, lz] of [
        [-box.halfX, -box.halfZ],
        [box.halfX, -box.halfZ],
        [-box.halfX, box.halfZ],
        [box.halfX, box.halfZ],
      ] as const) {
        corners.push([box.x + lx * box.cos + lz * box.sin, 0, box.z - lx * box.sin + lz * box.cos]);
      }
    }
    extents.set(index, {
      top: headBones ? [head[0], Math.max(head[1], place.position[1] + top), head[2]] : null,
      corners,
    });
  }
  return extents;
}

/** The points of a model in its axes, for {@link animalBodies}. */
interface ModelPoints {
  /** The corners of the body with no instrument, with no repeats, as x, y, z. */
  readonly body: Float64Array;
  /** The corners of the head with no ears ({@link headBones}), with no repeats, as x, y, z. */
  readonly head: Float64Array;
}

/** The body of one animal on the stage in the bind pose, for the measure of the nearest animal. */
export interface AnimalBody {
  /** The corners of the body with no instrument, as x, y, z in the stage axes. */
  readonly points: Float64Array;
  /** The corners of the head with no ears, as x, y, z. Empty for a commit with no head list. */
  readonly head: Float64Array;
  /** The middle of a sphere that holds the points of the body. */
  readonly center: Vec3;
  /** The radius of that sphere, in meters. */
  readonly radius: number;
  /** The middle of a sphere that holds the points of the head. */
  readonly headCenter: Vec3;
  /** The radius of that sphere, in meters. */
  readonly headRadius: number;
}

/**
 * Gives the points of the body and of the head of a model, with no repeats. The corners of a bone
 * of the instrument, such as `instrument` or `bow`, are not a part of the body.
 *
 * @param model The model.
 * @returns The points in the axes of the model.
 */
function modelPoints(model: PlayerModel): ModelPoints {
  const { positions, bones } = model.mesh;
  const instrument = boneIndex('instrument');
  const body: number[] = [];
  const head: number[] = [];
  const seenBody = new Set<number>();
  const seenHead = new Set<number>();
  // Adds a point once: its key holds each axis in steps of 0.1 mm in 17 bits, up to ±6.5 m.
  const add = (out: number[], seen: Set<number>, x: number, y: number, z: number): void => {
    const key = [x, y, z].reduce((sum, v) => sum * 2 ** 17 + Math.round(v * 1e4) + 2 ** 16, 0);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(x, y, z);
    }
  };
  for (let corner = 0; corner < bones.length; corner++) {
    const bone = bones[corner] ?? 0;
    if (bone >= instrument) {
      continue;
    }
    const x = positions[corner * 3] ?? 0;
    const y = positions[corner * 3 + 1] ?? 0;
    const z = positions[corner * 3 + 2] ?? 0;
    add(body, seenBody, x, y, z);
    if (headBones?.has(bone)) {
      add(head, seenHead, x, y, z);
    }
  }
  return { body: Float64Array.from(body), head: Float64Array.from(head) };
}

/** The place of a player or of the conductor: a point on the stage and a turn around y. */
interface PlayerPlaceLike {
  /** The point under the middle of the model. */
  readonly position: Vec3;
  /** Radians around y. 0 faces -z. */
  readonly facing: number;
}

/** The points of a model at its place, with a sphere that holds them. */
interface PlacedPoints {
  /** The points in the stage axes, as x, y, z. */
  readonly points: Float64Array;
  /** The middle of the sphere. */
  readonly center: Vec3;
  /** The radius of the sphere, in meters. */
  readonly radius: number;
}

/**
 * Moves the points of a model to its place on the stage: a turn of `facing` around y, then the
 * position. Gives the sphere that holds them.
 *
 * @param points The points in the axes of the model, as x, y, z.
 * @param place The place of the model.
 * @returns The points on the stage, the middle of their sphere, and its radius.
 */
function placePoints(points: Float64Array, place: PlayerPlaceLike): PlacedPoints {
  const cos = Math.cos(place.facing);
  const sin = Math.sin(place.facing);
  const [px, py, pz] = place.position;
  const out = new Float64Array(points.length);
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    const z = points[i + 2] ?? 0;
    const p = [px + x * cos + z * sin, py + y, pz - x * sin + z * cos];
    for (let k = 0; k < 3; k++) {
      const v = p[k] ?? 0;
      out[i + k] = v;
      low[k] = Math.min(low[k] ?? v, v);
      high[k] = Math.max(high[k] ?? v, v);
    }
  }
  const middle = (k: number): number => ((low[k] ?? 0) + (high[k] ?? 0)) / 2;
  const center: Vec3 = [middle(0), middle(1), middle(2)];
  let radius = 0;
  for (let i = 0; i < out.length; i += 3) {
    radius = Math.max(
      radius,
      Math.hypot(
        (out[i] ?? 0) - center[0],
        (out[i + 1] ?? 0) - center[1],
        (out[i + 2] ?? 0) - center[2],
      ),
    );
  }
  return { points: out, center, radius };
}

/**
 * Gives the body of each animal of a layout: each player and the conductor, in the bind pose.
 *
 * @param layout The layout.
 * @param models The models of the score.
 * @returns The bodies.
 */
export function animalBodies(layout: SceneLayout, models: ModelCache): AnimalBody[] {
  const known = new Map<PlayerModel, ModelPoints>();
  const bodyOf = (model: PlayerModel, place: PlayerPlaceLike): AnimalBody => {
    const local = known.get(model) ?? modelPoints(model);
    known.set(model, local);
    const body = placePoints(local.body, place);
    const head = placePoints(local.head, place);
    return {
      points: body.points,
      head: head.points,
      center: body.center,
      radius: body.radius,
      headCenter: head.center,
      headRadius: head.radius,
    };
  };
  const bodies = layout.players.map((place) => {
    const { species, instrument, kettles, support } = place.cast;
    return bodyOf(models.get(species, instrument, kettles, support), place);
  });
  if (layout.conductor) {
    bodies.push(bodyOf(models.get(CONDUCTOR.species, CONDUCTOR.instrument), layout.conductor));
  }
  return bodies;
}

/**
 * Gives the distance from a camera to the nearest point of an animal body in its frame, at the
 * aspect of Cinematic mode.
 *
 * @param frame The camera.
 * @param bodies The bodies of the animals.
 * @returns The distance in meters, or `Infinity` with no body in the frame.
 */
function nearestAnimal(frame: Frame, bodies: readonly AnimalBody[]): number {
  const a = axesOf(frame);
  const tanV = Math.tan((frame.fov / 2) * DEG);
  const tanH = tanV * CINEMA_ASPECT;
  const [cx, cy, cz] = frame.position;
  const order = bodies
    .map((body) => ({
      body,
      bound:
        Math.hypot(body.center[0] - cx, body.center[1] - cy, body.center[2] - cz) - body.radius,
    }))
    .toSorted((x, y) => x.bound - y.bound);
  // The squares of the distances, because a square root in the loop of the points costs more.
  let best2 = Infinity;
  for (const { body, bound } of order) {
    if (bound > 0 && bound * bound >= best2) {
      break;
    }
    const p = body.points;
    for (let i = 0; i < p.length; i += 3) {
      const dx = (p[i] ?? 0) - cx;
      const dy = (p[i + 1] ?? 0) - cy;
      const dz = (p[i + 2] ?? 0) - cz;
      const distance2 = dx * dx + dy * dy + dz * dz;
      const depth = dx * a.forward[0] + dy * a.forward[1] + dz * a.forward[2];
      if (distance2 >= best2 || depth <= 0) {
        continue;
      }
      const x = (dx * a.right[0] + dz * a.right[2]) / (depth * tanH);
      const y = (dx * a.up[0] + dy * a.up[1] + dz * a.up[2]) / (depth * tanV);
      if (Math.abs(x) <= 1 && Math.abs(y) <= 1) {
        best2 = distance2;
      }
    }
  }
  return Math.sqrt(best2);
}

/**
 * Gives the largest part of the frame height that one head fills, at the aspect of Cinematic
 * mode. The part of a head at an edge counts only inside the frame.
 *
 * @param frame The camera.
 * @param bodies The bodies of the animals.
 * @returns The part, from 0 to 1.
 */
function largestHead(frame: Frame, bodies: readonly AnimalBody[]): number {
  const a = axesOf(frame);
  const tanV = Math.tan((frame.fov / 2) * DEG);
  const tanH = tanV * CINEMA_ASPECT;
  const [cx, cy, cz] = frame.position;
  // The sphere of each head in front of the camera fills at most its bound of the height, so the
  // largest bounds come first.
  const order = bodies
    .map((body) => {
      const [hx, hy, hz] = body.headCenter;
      const depth = (hx - cx) * a.forward[0] + (hy - cy) * a.forward[1] + (hz - cz) * a.forward[2];
      const bound = body.headRadius / (Math.max(depth - body.headRadius, 1e-3) * tanV);
      return { body, bound: depth + body.headRadius > 0 ? bound : 0 };
    })
    .toSorted((x, y) => y.bound - x.bound);
  let best = 0;
  for (const { body, bound } of order) {
    if (bound <= best) {
      break;
    }
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const p = body.head;
    for (let i = 0; i < p.length; i += 3) {
      const dx = (p[i] ?? 0) - cx;
      const dy = (p[i + 1] ?? 0) - cy;
      const dz = (p[i + 2] ?? 0) - cz;
      const d = dx * a.forward[0] + dy * a.forward[1] + dz * a.forward[2];
      if (d <= 1e-3) {
        continue;
      }
      const x = (dx * a.right[0] + dz * a.right[2]) / (d * tanH);
      const y = (dx * a.up[0] + dy * a.up[1] + dz * a.up[2]) / (d * tanV);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 >= -1 && x0 <= 1 && y1 >= -1 && y0 <= 1) {
      best = Math.max(best, (Math.min(y1, 1) - Math.max(y0, -1)) / 2);
    }
  }
  return best;
}

/**
 * Gives the camera of a plan at a song time, at the aspect of Cinematic mode.
 *
 * @param plan The plan.
 * @param time The song time, in seconds.
 * @returns The camera.
 */
function frameAt(plan: ShotPlan, time: number): Frame {
  const pose = cameraAt(
    plan,
    time,
    PLAYING,
    { aspect: CINEMA_ASPECT, still: false },
    createCameraPose(),
  );
  return { position: [...pose.position], look: [...pose.target], fov: pose.fov };
}

/**
 * Subtracts two points.
 *
 * @param a A point.
 * @param b Another point.
 * @returns `a - b`.
 */
function minus(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Gives the dot product of two vectors.
 *
 * @param a A vector.
 * @param b Another vector.
 * @returns The product.
 */
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Gives a vector with the length 1.
 *
 * @param v The vector.
 * @returns The unit vector.
 */
function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Gives the axes of a camera that looks at a point with no roll.
 *
 * @param frame The camera.
 * @returns The axes.
 */
function axesOf(frame: Frame): Axes {
  const forward = unit(minus(frame.look, frame.position));
  const right = unit([-forward[2], 0, forward[0]]);
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

/**
 * Projects a point into the frame of a camera, at the aspect of Cinematic mode.
 *
 * @param frame The camera.
 * @param point The point.
 * @returns The x and the y of the point, from -1 to 1 at the frame edges.
 */
function project(frame: Frame, point: Vec3): [number, number] {
  const a = axesOf(frame);
  const p = minus(point, frame.position);
  const depth = Math.max(1e-6, dot(p, a.forward));
  const tanV = Math.tan((frame.fov / 2) * DEG);
  return [dot(p, a.right) / (depth * tanV * CINEMA_ASPECT), dot(p, a.up) / (depth * tanV)];
}

/**
 * Gives the screen direction of a look: the side of the frame to which a subject that faces an
 * azimuth looks, for a camera at an azimuth from the subject.
 *
 * @param facing The azimuth of the front of the subject, in radians.
 * @param azimuth The azimuth of the camera seen from the subject, in radians.
 * @returns 1 for the right, -1 for the left, 0 for a neutral look ({@link GRAMMAR.neutral}).
 */
export function lookSide(facing: number, azimuth: number): -1 | 0 | 1 {
  const x = Math.sin(facing - azimuth);
  // A look on the limit is neutral, as in the planner.
  if (Math.abs(x) < Math.sin(GRAMMAR.neutral) + 1e-9) {
    return 0;
  }
  return x > 0 ? 1 : -1;
}

/**
 * Gives the azimuth of a camera seen from a point.
 *
 * @param camera The camera.
 * @param point The point.
 * @returns The azimuth, in radians from +z to +x.
 */
function azimuthFrom(camera: Vec3, point: Vec3): number {
  return Math.atan2(camera[0] - point[0], camera[2] - point[2]);
}

/**
 * Finds the players of a solo, section, or side shot.
 *
 * @param subjects The places of the subjects.
 * @param shot The shot.
 * @returns The players, or `null` for another kind of shot or for no players.
 */
function shotSubject(subjects: StageSubjects, shot: Shot): ShotSubject | null {
  if (shot.kind !== 'solo' && shot.kind !== 'section' && shot.kind !== 'side') {
    return null;
  }
  const players = shot.seats.flatMap((seat) => {
    const all = subjects.seats[seat]?.players ?? [];
    if (shot.kind === 'solo') {
      return all.slice(0, 1);
    }
    const part = shot.part;
    return part ? all.filter((p) => part.includes(p.player)) : all;
  });
  if (players.length === 0) {
    return null;
  }

  let [x, z, fx, fz, ex, ey, ez] = [0, 0, 0, 0, 0, 0, 0];
  for (const p of players) {
    x += p.position[0];
    z += p.position[2];
    fx += Math.sin(p.front);
    fz += Math.cos(p.front);
    ex += p.sights.head[0];
    ey += p.sights.head[1];
    ez += p.sights.head[2];
  }
  const n = players.length;
  return {
    center: [x / n, shot.target[1], z / n],
    facing: Math.atan2(fx, fz),
    eyes: [ex / n, ey / n, ez / n],
    owners: players.map((p) => p.sights.owner),
  };
}

/**
 * Gives the subject of a shot for the 30° rule: its seats, or `all` for a wide or a high shot, or
 * `conductor`.
 *
 * @param shot The shot.
 * @returns The subject.
 */
function subjectSet(shot: Shot): ReadonlySet<number> | 'all' | 'conductor' {
  if (shot.kind === 'wide' || shot.kind === 'high') {
    return 'all';
  }
  return shot.kind === 'conductor' ? 'conductor' : new Set(shot.seats);
}

/**
 * Tells if two shots show the same subject, or a part of it.
 *
 * @param a A shot.
 * @param b The next shot.
 * @returns True if the subjects overlap.
 */
function sameSubject(a: Shot, b: Shot): boolean {
  const sa = subjectSet(a);
  const sb = subjectSet(b);
  if (sa === 'all' || sb === 'all') {
    return true;
  }
  if (sa === 'conductor' || sb === 'conductor') {
    return sa === sb;
  }
  return [...sa].some((seat) => sb.has(seat));
}

/**
 * Gives the times of the move of a shot on the screen: from the end of the blend into it, or from
 * the start of its move, to its end. During a blend, the camera comes from the previous shot.
 *
 * @param shot The shot.
 * @returns The start and the end, in song seconds.
 */
function moveTimes(shot: Shot): [number, number] {
  const start = Math.max(0, shot.startSec + shot.blendSec);
  return [start, Math.max(start, shot.moveEndSec)];
}

/**
 * Gives the move of the camera of a shot, as parts of the distance to the target: to the right,
 * up, and forward. The axes are those of the camera in the middle of the move when it looks at the
 * target of the shot, so a frame that puts the subject on a third line does not change them.
 *
 * @param plan The plan.
 * @param shot The shot.
 * @returns The move.
 */
function moveOf(plan: ShotPlan, shot: Shot): Vec3 {
  const [start, end] = moveTimes(shot);
  const a = frameAt(plan, start + 1e-6);
  const b = frameAt(plan, end - 1e-6);
  const middle = frameAt(plan, (start + end) / 2);
  const axes = axesOf({ ...middle, look: shot.target });
  const distance = Math.hypot(...minus(shot.target, middle.position)) || 1;
  const move = minus(b.position, a.position);
  return [
    dot(move, axes.right) / distance,
    dot(move, axes.up) / distance,
    dot(move, axes.forward) / distance,
  ];
}

/**
 * Gives the names of the axes on which two moves go in opposite directions.
 *
 * @param a The move of a shot.
 * @param b The move of the next shot.
 * @returns The names, such as `right`, or none.
 */
function oppositeAxes(a: Vec3, b: Vec3): string[] {
  const names = ['right', 'up', 'forward'];
  const min = GRAMMAR.moveShare;
  return names.filter((...[, k]) => {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    return Math.abs(x) >= min && Math.abs(y) >= min && Math.sign(x) !== Math.sign(y);
  });
}

/**
 * Formats an angle in degrees.
 *
 * @param radians The angle.
 * @returns The text, such as `-112.9°`.
 */
function degrees(radians: number): string {
  return `${(radians / DEG).toFixed(1)}°`;
}

/**
 * Checks the shots of one plan, and adds the elevations and the heights of its cameras.
 *
 * @param demo The name of the demo.
 * @param plan The plan.
 * @param layout The layout of the score.
 * @param subjects The places of the subjects.
 * @param durationSec The song length.
 * @param kinds The elevations and the heights of each kind, which the function adds to.
 * @param extents The top of the head and the footprint of each player ({@link playerExtents}).
 * @param bodies The body of each animal ({@link animalBodies}).
 * @returns The breaks.
 */
export function checkPlan(
  demo: string,
  plan: ShotPlan,
  layout: SceneLayout,
  subjects: StageSubjects,
  durationSec: number,
  kinds: Map<ShotKind, KindHeights>,
  extents: ReadonlyMap<number, PlayerExtent>,
  bodies: readonly AnimalBody[],
): RuleBreak[] {
  const breaks: RuleBreak[] = [];
  const master = defaultView(layout.stageSide, CINEMA_ASPECT, 1).position;
  const { shots } = plan;
  const add = (rule: GrammarRule, timeSec: number, kind: string, detail: string): void => {
    breaks.push({ rule, demo, timeSec, kinds: kind, detail });
  };

  for (const shot of shots) {
    const start = Math.max(0, shot.startSec);
    const end = Number.isFinite(shot.endSec) ? Math.min(shot.endSec, durationSec) : shot.moveEndSec;
    const subject = shotSubject(subjects, shot);
    const heights = kinds.get(shot.kind) ?? {
      elevations: [],
      heights: [],
      widths: [],
      near: [],
      blends: [],
    };
    kinds.set(shot.kind, heights);
    let worstLine = 0;
    let lookBreak: string | null = null;
    let near: ShotNear = {
      demo,
      kind: shot.kind,
      startSec: start,
      timeSec: start,
      distance: Infinity,
      head: 0,
    };
    // Adds the nearest animal of one sample to a measure.
    const nearer = (into: ShotNear, time: number, frame: Frame): ShotNear => {
      const distance = nearestAnimal(frame, bodies);
      const head = Math.max(into.head, largestHead(frame, bodies));
      return distance < into.distance
        ? { ...into, timeSec: time, distance, head }
        : { ...into, head };
    };
    const measure = (time: number, frame: Frame): void => {
      near = nearer(near, time, frame);
    };
    // The end of the move is the closest moment of a push-in.
    const closestAt = Math.min(moveTimes(shot)[1], end) - 1e-6;
    measure(closestAt, frameAt(plan, closestAt));
    if (shot.blendSec > 0) {
      // The camera of the blend moves from the end of the previous shot, so it can pass nearer
      // to an animal than both shots.
      let blend: ShotNear = { ...near, timeSec: start, distance: Infinity, head: 0 };
      for (let k = 0; k <= BLEND_SAMPLES; k++) {
        const t = shot.startSec + (shot.blendSec * k) / BLEND_SAMPLES;
        blend = nearer(blend, t, frameAt(plan, Math.min(t, end - 1e-6)));
      }
      heights.blends.push(blend);
      near =
        blend.distance < near.distance
          ? { ...blend, head: Math.max(near.head, blend.head) }
          : { ...near, head: Math.max(near.head, blend.head) };
    }
    for (let t = start; t < end - 1e-9; t += SAMPLE_STEP) {
      const frame = frameAt(plan, t);
      measure(t, frame);
      const toCamera = minus(frame.position, shot.target);
      heights.elevations.push(Math.asin(toCamera[1] / Math.hypot(...toCamera)) / DEG);
      heights.heights.push(frame.position[1]);
      const forward = axesOf(frame).forward;
      const turn = Math.abs(Math.atan2(-forward[0], -forward[2]));
      worstLine = Math.max(worstLine, turn);
      if (subject && lookBreak === null) {
        const side = lookSide(subject.facing, azimuthFrom(frame.position, subject.center));
        const wide = lookSide(subject.facing, azimuthFrom(master, subject.center));
        if (side !== 0 && wide !== 0 && side !== wide) {
          lookBreak = `front ${degrees(subject.facing)}, camera ${degrees(azimuthFrom(frame.position, subject.center))} at ${t.toFixed(2)} s`;
        }
      }
    }
    heights.near.push(near);
    if (worstLine > GRAMMAR.lineAzimuth) {
      add('line', start, shot.kind, `turn ${degrees(worstLine)}`);
    }
    if (lookBreak !== null) {
      add('look', start, shot.kind, lookBreak);
    }
    if (subject) {
      const [moveStart, moveEnd] = moveTimes(shot);
      const frame = frameAt(plan, (moveStart + moveEnd) / 2);
      const side = lookSide(subject.facing, azimuthFrom(frame.position, subject.center));
      const [x] = project(frame, shot.target);
      const [, y] = project(frame, subject.eyes);
      if (side !== 0 && x * side > -GRAMMAR.roomShare) {
        add(
          'room',
          start,
          shot.kind,
          `look ${side > 0 ? 'right' : 'left'}, subject at x ${x.toFixed(2)}`,
        );
      }
      if (Math.abs(y - GRAMMAR.eyeLine) > GRAMMAR.eyeTolerance) {
        add('headroom', start, shot.kind, `eyes at y ${y.toFixed(2)}`);
      }
      if (shot.kind !== 'side') {
        const players = subject.owners.flatMap((owner) => extents.get(owner) ?? []);
        const xs = players.flatMap((p) => p.corners.map((c) => project(frame, c)[0]));
        heights.widths.push((Math.max(...xs) - Math.min(...xs)) / 2);
        // The top of each head in the frame stays below the top edge for the full move.
        let top = -Infinity;
        for (const t of [moveStart, (moveStart + moveEnd) / 2, moveEnd]) {
          const sample = frameAt(plan, Math.min(t, end - 1e-6));
          for (const p of players) {
            if (!p.top) {
              continue;
            }
            const [hx, hy] = project(sample, p.top);
            top = Math.abs(hx) <= 1 ? Math.max(top, hy) : top;
          }
        }
        if (top > 1) {
          add('head', start, shot.kind, `top of a head at y ${top.toFixed(2)}`);
        }
      }
    }
  }

  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1];
    const b = shots[i];
    if (!a || !b || b.blendSec > 0) {
      continue;
    }
    const cut = b.startSec;
    const kinds2 = `${a.kind} > ${b.kind}`;
    if (sameSubject(a, b)) {
      const fa = frameAt(plan, cut - 1e-6);
      const fb = frameAt(plan, cut + 1e-6);
      const da = minus(fa.position, a.target);
      const db = minus(fb.position, b.target);
      const angle = Math.acos(Math.min(1, Math.max(-1, dot(unit(da), unit(db)))));
      const size = (d: Vec3, fov: number): number => Math.hypot(...d) * Math.tan((fov / 2) * DEG);
      const sa = size(da, fa.fov);
      const sb = size(db, fb.fov);
      const ratio = Math.max(sa, sb) / Math.max(1e-6, Math.min(sa, sb));
      if (angle < GRAMMAR.jumpAngle && ratio < GRAMMAR.jumpSize) {
        add('jump', cut, kinds2, `turn ${degrees(angle)}, size ratio ${ratio.toFixed(2)}`);
      }
    }
    const opposite = oppositeAxes(moveOf(plan, a), moveOf(plan, b));
    if (opposite.length > 0) {
      add('motion', cut, kinds2, `opposite on ${opposite.join(', ')}`);
    }
  }

  return breaks;
}

/**
 * Gives a percentile of numbers, with a linear blend between the two nearest ranks.
 *
 * @param values The numbers.
 * @param share The percentile, from 0 to 1: 0.5 for the median.
 * @returns The percentile, or 0 with no numbers.
 */
function percentile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const at = share * (sorted.length - 1);
  const low = sorted[Math.floor(at)] ?? 0;
  const high = sorted[Math.ceil(at)] ?? 0;
  return low + (high - low) * (at - Math.floor(at));
}

/**
 * Gives the median of numbers.
 *
 * @param values The numbers.
 * @returns The median, or 0 with no numbers.
 */
function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/**
 * Checks each demo, or the demos of a list.
 *
 * @param only The names of the demos to check, with no `.mid`, or none for all demos.
 * @returns The output.
 */
export async function checkDemos(only: readonly string[]): Promise<RulesOutput> {
  const breaks: RuleBreak[] = [];
  const shots: Record<string, number> = {};
  const kinds = new Map<ShotKind, KindHeights>();
  for (const demo of await patchedDemos()) {
    const name = demo.file.replace(/\.mid$/, '');
    if (only.length > 0 && !only.includes(name)) {
      continue;
    }
    const result = buildScore(demo.bytes, 'auto');
    if (!result.ok) {
      throw new Error(`buildScore() refused the demo ${name}: ${result.error}.`);
    }
    const { score } = result;
    const models = new ModelCache();
    const layout = layoutScene(score, models);
    const plan = prepareShots(score, layout, SHOT_SEED, models);
    const subjects = shotSubjects.prepareSubjects(score, layout, models);
    shots[name] = plan.shots.length;
    const extents = playerExtents(layout, models, subjects);
    const bodies = animalBodies(layout, models);
    breaks.push(
      ...checkPlan(name, plan, layout, subjects, score.durationSec, kinds, extents, bodies),
    );
  }

  const summary: Record<string, KindSummary> = {};
  const closest: ShotNear[] = [];
  const blends = [...kinds.values()]
    .flatMap((values) => values.blends)
    .toSorted((a, b) => a.distance - b.distance);
  for (const [kind, values] of kinds) {
    const distances = values.near.map((n) => n.distance);
    const heads = values.near.map((n) => n.head);
    summary[kind] = {
      samples: values.heights.length,
      medianElevation: median(values.elevations),
      maxElevation: Math.max(...values.elevations),
      medianHeight: median(values.heights),
      maxHeight: Math.max(...values.heights),
      medianWidth: median(values.widths),
      shots: values.near.length,
      minDistance: Math.min(...distances),
      lowDistance: percentile(distances, 0.05),
      medianDistance: median(distances),
      maxHead: Math.max(...heads),
      highHead: percentile(heads, 0.95),
      medianHead: median(heads),
    };
    closest.push(
      ...values.near.toSorted((a, b) => a.distance - b.distance).slice(0, CLOSEST_SHOTS),
    );
  }
  return { breaks, shots, kinds: summary, headChecked: headBones !== null, closest, blends };
}

/** The options of `pnpm shot-trace --rules`. */
export interface RulesOptions {
  /** The demos to check, or none for all. */
  readonly demos: readonly string[];
  /** The commit to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** True to list each break. */
  readonly list: boolean;
  /** The file for the JSON output, or `null`. */
  readonly json: string | null;
}

/** The usage text of the rules check. */
const USAGE =
  'Usage: pnpm shot-trace --rules [--demo <id>]... [--base <ref>] [--list] [--json <file>]';

/**
 * Reads the options of the rules check.
 *
 * @param args The arguments after the script, with `--rules`.
 * @returns The options.
 * @throws Error for an unknown option or a missing value.
 */
export function parseRulesOptions(args: readonly string[]): RulesOptions {
  const demos: string[] = [];
  let base: string | null = null;
  let json: string | null = null;
  let list = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i] ?? '';
    if (flag === '--rules') {
      continue;
    }
    if (flag === '--list') {
      list = true;
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option "${flag}" has no value.\n${USAGE}`);
    }
    i++;
    if (flag === '--demo') {
      demos.push(value.replace(/\.mid$/, ''));
    } else if (flag === '--base') {
      base = value;
    } else if (flag === '--json') {
      json = value;
    } else {
      throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  return { demos, base, list, json };
}

/**
 * Writes the counts of the breaks of each rule, the table of the elevations and the heights, and
 * each break with `--list`.
 *
 * @param outputs The output of each tree, with its name: the base first, if any.
 * @param list True to list each break.
 * @returns The lines.
 */
export function rulesLines(
  outputs: readonly (readonly [string, RulesOutput])[],
  list: boolean,
): string[] {
  const names = outputs.map(([name]) => name);
  const lines = [`| Rule | ${names.join(' | ')} |`, `|---|${names.map(() => '---:').join('|')}|`];
  for (const rule of GRAMMAR_RULES) {
    const counts = outputs.map(([, o]) =>
      rule === 'head' && !o.headChecked ? '-' : o.breaks.filter((b) => b.rule === rule).length,
    );
    lines.push(`| ${rule} | ${counts.join(' | ')} |`);
  }
  const shots = outputs.map(([, o]) => Object.values(o.shots).reduce((sum, n) => sum + n, 0));
  lines.push(`| shots | ${shots.join(' | ')} |`, '');

  const kinds: ShotKind[] = ['wide', 'high', 'conductor', 'side', 'section', 'solo'];
  lines.push(
    '| Kind | Tree | Median elevation | Max elevation | Median height m | Max height m | Median width |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const kind of kinds) {
    for (const [name, output] of outputs) {
      const k = output.kinds[kind];
      if (!k) {
        continue;
      }
      lines.push(
        `| ${kind} | ${name} | ${k.medianElevation.toFixed(1)}° | ${k.maxElevation.toFixed(1)}° | ${k.medianHeight.toFixed(2)} | ${k.maxHeight.toFixed(2)} | ${k.medianWidth > 0 ? k.medianWidth.toFixed(2) : '-'} |`,
      );
    }
  }

  lines.push(
    '',
    '| Kind | Tree | Shots | Min distance m | 5% distance m | Median distance m | Max head | 95% head | Median head |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const kind of kinds) {
    for (const [name, output] of outputs) {
      const k = output.kinds[kind];
      if (!k) {
        continue;
      }
      lines.push(
        `| ${kind} | ${name} | ${k.shots} | ${k.minDistance.toFixed(2)} | ${k.lowDistance.toFixed(2)} | ${k.medianDistance.toFixed(2)} | ${k.maxHead.toFixed(2)} | ${k.highHead.toFixed(2)} | ${k.medianHead.toFixed(2)} |`,
      );
    }
  }
  for (const [name, output] of outputs) {
    const distances = output.blends.map((n) => n.distance);
    const heads = output.blends.map((n) => n.head);
    if (distances.length === 0) {
      continue;
    }
    lines.push(
      `| blend | ${name} | ${distances.length} | ${Math.min(...distances).toFixed(2)} | ${percentile(distances, 0.05).toFixed(2)} | ${median(distances).toFixed(2)} | ${Math.max(...heads).toFixed(2)} | ${percentile(heads, 0.95).toFixed(2)} | ${median(heads).toFixed(2)} |`,
    );
  }

  if (list) {
    for (const [name, output] of outputs) {
      lines.push('', `Breaks of ${name}:`);
      for (const b of output.breaks) {
        lines.push(`  ${b.rule} ${b.demo} ${b.timeSec.toFixed(2)} s ${b.kinds}: ${b.detail}`);
      }
      lines.push('', `Shots of ${name} with the nearest animals, ${CLOSEST_SHOTS} of each kind:`);
      const nearLine = (n: ShotNear): string =>
        `  ${n.kind} ${n.demo} ${n.startSec.toFixed(2)} s: ${n.distance.toFixed(2)} m at ${n.timeSec.toFixed(2)} s, head ${n.head.toFixed(2)}`;
      lines.push(...output.closest.map(nearLine));
      lines.push('', `Blends of ${name} with the nearest animals:`);
      lines.push(...output.blends.slice(0, CLOSEST_SHOTS).map(nearLine));
    }
  }
  return lines;
}

/**
 * Runs the rules check: on the working tree, or on the commit of `--base` and the working tree at
 * the same time, each in a child process.
 *
 * @param args The arguments after the script.
 */
export async function rulesMain(args: readonly string[]): Promise<void> {
  const options = parseRulesOptions(args);
  if (options.base !== null) {
    const ref = options.base;
    const childArgs = withoutOptions(args, ['--base'], ['--list', '--rules']);
    const texts = await probeBeside(
      ref,
      'shot-rules.ts',
      { base: childArgs, tree: childArgs },
      { prefix: 'shot-rules-', scripts: ['shot-rules.ts'] },
    );
    // SAFETY: each text comes from the --json output of this script in a child process.
    const base = JSON.parse(texts.base) as RulesOutput;
    // SAFETY: as above.
    const tree = JSON.parse(texts.tree) as RulesOutput;
    const label = `${ref} (${shortHash(ref)})`;
    console.log(
      rulesLines(
        [
          [label, base],
          ['tree', tree],
        ],
        options.list,
      ).join('\n'),
    );
    return;
  }

  const started = performance.now();
  const output = await checkDemos(options.demos);
  if (options.json !== null) {
    writeFileSync(options.json, JSON.stringify(output));
    return;
  }
  console.log(rulesLines([['tree', output]], options.list).join('\n'));
  console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s.`);
}

if (import.meta.main) {
  try {
    await rulesMain(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
