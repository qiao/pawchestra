/**
 * Checks the shots of the automatic camera against the rules of film grammar (design 5.6,
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
 *
 * The tool also gives the median and the largest elevation and height of the camera of each kind
 * of shot, from a sample each {@link SAMPLE_STEP}.
 *
 * Usage: pnpm shot-trace --rules [--demo <id>]... [--base <ref>] [--list] [--json <file>]
 */
import { writeFileSync } from 'node:fs';

import { patchedDemos } from './patch-demos.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { Transport } from '../src/pose/types.ts';
import { buildScore } from '../src/score/score.ts';
import { cameraAt, createCameraPose } from '../src/shots/camera-at.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import { prepareSubjects } from '../src/shots/subjects.ts';
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

/** A rule of film grammar that the tool checks. */
export type GrammarRule = 'line' | 'look' | 'jump' | 'motion' | 'room' | 'headroom';

/** The rules, in the order of the output. */
export const GRAMMAR_RULES: readonly GrammarRule[] = [
  'line',
  'look',
  'jump',
  'motion',
  'room',
  'headroom',
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
}

/** The result of the check of the demos. */
export interface RulesOutput {
  /** Each break, in the order of the demos and of the time. */
  readonly breaks: readonly RuleBreak[];
  /** The number of shots of each demo. */
  readonly shots: Readonly<Record<string, number>>;
  /** The median and the largest elevation and height of each kind, over all demos. */
  readonly kinds: Readonly<Record<string, KindSummary>>;
}

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
  if (Math.abs(x) < Math.sin(GRAMMAR.neutral)) {
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
 * @returns The breaks.
 */
export function checkPlan(
  demo: string,
  plan: ShotPlan,
  layout: SceneLayout,
  subjects: StageSubjects,
  durationSec: number,
  kinds: Map<ShotKind, KindHeights>,
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
    const heights = kinds.get(shot.kind) ?? { elevations: [], heights: [] };
    kinds.set(shot.kind, heights);
    let worstLine = 0;
    let lookBreak: string | null = null;
    for (let t = start; t < end - 1e-9; t += SAMPLE_STEP) {
      const frame = frameAt(plan, t);
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
 * Gives the median of numbers.
 *
 * @param values The numbers.
 * @returns The median, or 0 with no numbers.
 */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  return n % 2 === 1
    ? (sorted[(n - 1) / 2] ?? 0)
    : ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2;
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
    const subjects = prepareSubjects(score, layout, models);
    shots[name] = plan.shots.length;
    breaks.push(...checkPlan(name, plan, layout, subjects, score.durationSec, kinds));
  }

  const summary: Record<string, KindSummary> = {};
  for (const [kind, values] of kinds) {
    summary[kind] = {
      samples: values.heights.length,
      medianElevation: median(values.elevations),
      maxElevation: Math.max(...values.elevations),
      medianHeight: median(values.heights),
      maxHeight: Math.max(...values.heights),
    };
  }
  return { breaks, shots, kinds: summary };
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
    const counts = outputs.map(([, o]) => o.breaks.filter((b) => b.rule === rule).length);
    lines.push(`| ${rule} | ${counts.join(' | ')} |`);
  }
  const shots = outputs.map(([, o]) => Object.values(o.shots).reduce((sum, n) => sum + n, 0));
  lines.push(`| shots | ${shots.join(' | ')} |`, '');

  const kinds: ShotKind[] = ['wide', 'high', 'conductor', 'side', 'section', 'solo'];
  lines.push(
    '| Kind | Tree | Median elevation | Max elevation | Median height m | Max height m |',
    '|---|---|---:|---:|---:|---:|',
  );
  for (const kind of kinds) {
    for (const [name, output] of outputs) {
      const k = output.kinds[kind];
      if (!k) {
        continue;
      }
      lines.push(
        `| ${kind} | ${name} | ${k.medianElevation.toFixed(1)}° | ${k.maxElevation.toFixed(1)}° | ${k.medianHeight.toFixed(2)} | ${k.maxHeight.toFixed(2)} |`,
      );
    }
  }

  if (list) {
    for (const [name, output] of outputs) {
      lines.push('', `Breaks of ${name}:`);
      for (const b of output.breaks) {
        lines.push(`  ${b.rule} ${b.demo} ${b.timeSec.toFixed(2)} s ${b.kinds}: ${b.detail}`);
      }
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
