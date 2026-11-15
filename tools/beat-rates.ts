/**
 * Prints the rate of each beat-driven and note-driven motion of the body over a whole song
 * (design 5.1, 5.4): the notated beat, the conducted beat, the sway of the spine, the sway of a
 * singer, the preparatory beat of the count-in (the nod of a leader), the turns of the cues, and
 * the bow changes. The sway rates come from the poses of `poseAt()` at each `--step`, so the tool
 * measures what the viewer sees, on each tree. A side of a sway is the time between two zero
 * crossings of its angle, and its tempo is 60 divided by that time.
 *
 * A row with a limit gives the song time over the limit: the sum of the events faster than the
 * limit (with {@link LIMIT_SLACK}), for the player with the most. The sway and the singer sway take `--limit`, and the
 * conducted beat takes {@link CONDUCTED_LIMIT}. The verdict is `FAIL` when a row has more than
 * {@link MAX_OVER_SEC} over its limit, and the tool then exits with 1. With `--base <ref>`, the
 * commit and the working tree run at the same time, each in a child process (`probeBeside()`),
 * and the tool prints one table for each file with the values of both.
 *
 * `--trace <from>-<to>` prints the side sway of the spine of one player of one file at steps of
 * {@link TRACE_STEP} ({@link traceLines}): the player of `--player`, or the player with the largest
 * sway in the range. With `--base`, the commit runs this script of the working tree, so that both
 * trees give the same measure, and each line gives the angle of both.
 *
 * Usage: pnpm beat-rates [--midi <path>]... [--demo <id>]... [--limit <bpm>] [--step <s>]
 *        [--base <ref>] [--json <file>], or
 *        pnpm beat-rates --midi <path> | --demo <id> --trace <from>-<to> [--player <n>]
 *        [--base <ref>]
 * With no `--midi` and no `--demo`, it probes each demo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { Quaternion, Vector3 } from 'three';

import { patchedDemos } from './patch-demos.ts';
import { probeBeside, shortHash, withoutOptions } from './ref-tree.ts';
import { boneIndex } from '../src/models/rig.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { midiPath } from './probe-demos.ts';
import { PLAYING, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { buildTimeline } from '../src/score/timeline.ts';

/** The usage text of `pnpm beat-rates`. */
const USAGE =
  'Usage: pnpm beat-rates [--midi <path>]... [--demo <id>]... [--limit <bpm>] [--step <s>] [--base <ref>] [--json <file>], or pnpm beat-rates --midi <path> | --demo <id> --trace <from>-<to> [--player <n>] [--base <ref>]';

/** The format version of the JSON text of `--json` (`formatVersion()` of `tools/ref-tree.ts`). */
const RATES_FORMAT = 1;

/**
 * The default limit of the sway tempo, in sides for each minute: the limit of the felt pulse
 * (`PULSE_TEMPO` of `src/score/beats.ts`).
 */
const DEFAULT_LIMIT = 120;

/**
 * The limit of the conducted beat, in beats for each minute: the beat tempo from which a bar gets
 * fewer conducted beats (`ONE_BEAT_TEMPO` of `src/score/beats.ts`). The tool keeps its own copy,
 * because a commit of `--base` can lack the export.
 */
const CONDUCTED_LIMIT = 168;

/**
 * The share above a limit that an event can have and still count as within it. The seeded timing
 * offsets of up to 20 ms (`PLAYER_OFFSETS` of `src/pose/plan.ts`) and the sample step move a
 * measured sway side by a few percent, so a pulse of exactly the limit measures up to about 1%
 * above it.
 */
const LIMIT_SLACK = 0.03;

/** The most song time over a limit that passes, in seconds: a short bar, such as a pickup. */
const MAX_OVER_SEC = 2;

/** The default step of the pose samples, in song seconds. */
const DEFAULT_STEP = 0.02;

/** The step of the samples of `--trace`, in song seconds. */
const TRACE_STEP = 0.01;

/** The most samples of `--trace`: 20 s at {@link TRACE_STEP}. */
const TRACE_SAMPLES = 2001;

/** The format version of the JSON text of `--trace` with `--json`. */
const TRACE_FORMAT = 1;

/** The smallest peak of a sway side that counts, in radians. A smaller side is noise of a fade. */
const MIN_PEAK = 0.05 * (Math.PI / 180);

/** The largest angle that counts as no sway, in radians: the rounding of a rotation. */
const ZERO_ANGLE = 1e-5;

/** The options of `pnpm beat-rates`. */
interface RatesOptions {
  /** The MIDI files to probe, by path. */
  readonly midi: readonly string[];
  /** The demos to probe, with no `.mid`. All demos when both lists are empty. */
  readonly demos: readonly string[];
  /** The limit of the sway tempo. */
  readonly limit: number;
  /** The step of the pose samples, in seconds. */
  readonly step: number;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** The file into which the tool writes its rows as JSON, or `null` for none. */
  readonly json: string | null;
  /** The range of song times of `--trace`, or `null` for the rates. */
  readonly trace: TraceRange | null;
  /** The player of `--player`, by its index in the layout, or `null` for the player of the trace. */
  readonly player: number | null;
}

/** The range of song times of `--trace`, in seconds. */
interface TraceRange {
  /** The first song time. */
  readonly from: number;
  /** The last song time. */
  readonly to: number;
}

/** The sway of each player of one file over the range of `--trace`, as the JSON of a child. */
interface SwayTrace {
  /** The format version ({@link TRACE_FORMAT}). */
  readonly version: number;
  /** The name of the file. */
  readonly file: string;
  /** The name of each player, such as `rabbit violin (seat 0)`, by its index in the layout. */
  readonly players: readonly string[];
  /** The song time of each sample, in seconds. */
  readonly times: readonly number[];
  /** The side sway of the spine of each player at each sample, in degrees. */
  readonly angles: readonly (readonly number[])[];
}

/** One event of a motion: the tempo from it to the next event. */
interface TempoEvent {
  /** The tempo, in events for each minute. */
  readonly tempo: number;
  /** The song time of the event, in seconds. */
  readonly at: number;
  /** The player of the event, for the time over the limit. 0 for a motion of the whole stage. */
  readonly group: number;
}

/** The rate of one motion over a song. */
interface MotionRate {
  /** The name of the motion. */
  readonly motion: string;
  /** The median tempo, in events for each minute, or `null` with no event. */
  readonly p50: number | null;
  /** The largest tempo, or `null` with no event. */
  readonly max: number | null;
  /** The song time of the largest tempo, in seconds. */
  readonly atSec: number | null;
  /** The number of events. */
  readonly count: number;
  /** A note, such as the conducted patterns. */
  readonly note: string;
  /** The limit of the tempo, or `null` for a motion with no limit. */
  readonly limit: number | null;
  /** The song time over the limit, in seconds, for the player with the most. */
  readonly overSec: number;
}

/** The rates of one file. */
interface FileRates {
  /** The name of the file. */
  readonly file: string;
  /** The rows of the motions. */
  readonly rates: readonly MotionRate[];
}

/**
 * Reads the options of the command line.
 *
 * @param args The arguments after the script.
 * @returns The options.
 * @throws Error if an option is not known, has no value, or has a value that is not a number.
 */
function parseOptions(args: readonly string[]): RatesOptions {
  const midi: string[] = [];
  const demos: string[] = [];
  let limit = DEFAULT_LIMIT;
  let step = DEFAULT_STEP;
  let base: string | null = null;
  let json: string | null = null;
  let trace: TraceRange | null = null;
  let player: number | null = null;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] ?? '';
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option "${flag}" has no value.\n${USAGE}`);
    }
    switch (flag) {
      case '--midi':
        // The path is absolute, so that the child on the commit of --base reads the same file.
        midi.push(midiPath(value));
        break;
      case '--demo':
        demos.push(value.replace(/\.mid$/, ''));
        break;
      case '--limit':
        limit = numberOf(flag, value);
        break;
      case '--step':
        step = numberOf(flag, value);
        break;
      case '--base':
        base = value;
        break;
      case '--json':
        json = value;
        break;
      case '--trace':
        trace = traceRange(value);
        break;
      case '--player':
        player = Number(value);
        if (!Number.isInteger(player) || player < 0) {
          throw new Error(`The player "${value}" is not a whole number of 0 or more.`);
        }
        break;
      default:
        throw new Error(`The option "${flag}" is not known.\n${USAGE}`);
    }
  }
  if (player !== null && trace === null) {
    throw new Error(`The option --player needs --trace.\n${USAGE}`);
  }
  if (trace !== null && midi.length + demos.length !== 1) {
    throw new Error(`The option --trace takes one file: one --midi or one --demo.\n${USAGE}`);
  }
  return { midi, demos, limit, step, base, json, trace, player };
}

/**
 * Reads the range of `--trace`, such as `12-13.5`.
 *
 * @param text The value of the option.
 * @returns The range.
 * @throws Error for a text of another form, a range whose end is not after its start, or a range
 *   of more than {@link TRACE_SAMPLES} samples.
 */
function traceRange(text: string): TraceRange {
  const found = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(text);
  const from = Number(found?.[1]);
  const to = Number(found?.[2]);
  if (!found || !(to > from)) {
    throw new Error(
      `The range "${text}" of --trace is not <from>-<to> in song seconds, such as 12-13.5.`,
    );
  }
  if (Math.round((to - from) / TRACE_STEP) + 1 > TRACE_SAMPLES) {
    throw new Error(
      `The range "${text}" of --trace has more than ${TRACE_SAMPLES} samples. Give at most ${((TRACE_SAMPLES - 1) * TRACE_STEP).toFixed(0)} s.`,
    );
  }
  return { from, to };
}

/**
 * Reads a positive number of the command line.
 *
 * @param flag The option, for the message.
 * @param text The text of the number.
 * @returns The number.
 * @throws Error if the text is not a positive number.
 */
function numberOf(flag: string, text: string): number {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`The value "${text}" of ${flag} is not a positive number.`);
  }
  return value;
}

/**
 * Gives the rate of a list of event times: the tempo of each gap between two events.
 *
 * @param motion The name of the motion.
 * @param times The event times, sorted.
 * @param note The note of the row.
 * @param limit The limit of the tempo, or `null`.
 * @returns The rate.
 */
function rateOf(
  motion: string,
  times: readonly number[],
  note: string,
  limit: number | null = null,
): MotionRate {
  return rateRow(motion, eventsOf(times, 0), note, limit);
}

/**
 * Gives the events of a list of event times: the tempo of each gap between two events.
 *
 * @param times The event times, sorted.
 * @param group The player of the events.
 * @returns The events.
 */
function eventsOf(times: readonly number[], group: number): TempoEvent[] {
  const events: TempoEvent[] = [];
  for (let k = 1; k < times.length; k++) {
    const gap = (times[k] ?? 0) - (times[k - 1] ?? 0);
    if (gap > 1e-6) {
      events.push({ tempo: 60 / gap, at: times[k - 1] ?? 0, group });
    }
  }
  return events;
}

/**
 * Makes the row of a motion from its events.
 *
 * @param motion The name of the motion.
 * @param events The events.
 * @param note The note of the row.
 * @param limit The limit of the tempo, or `null`.
 * @returns The row.
 */
function rateRow(
  motion: string,
  events: readonly TempoEvent[],
  note: string,
  limit: number | null = null,
): MotionRate {
  if (events.length === 0) {
    return { motion, p50: null, max: null, atSec: null, count: 0, note, limit, overSec: 0 };
  }

  const sorted = events.map((e) => e.tempo).toSorted((a, b) => a - b);
  const top = events.reduce((a, b) => (b.tempo > a.tempo ? b : a));
  const over = new Map<number, number>();
  for (const e of events) {
    if (limit !== null && e.tempo > limit * (1 + LIMIT_SLACK)) {
      over.set(e.group, (over.get(e.group) ?? 0) + 60 / e.tempo);
    }
  }
  return {
    motion,
    p50: sorted[Math.floor(sorted.length / 2)] ?? null,
    max: top.tempo,
    atSec: top.at,
    count: events.length,
    note,
    limit,
    overSec: Math.max(0, ...over.values()),
  };
}

/**
 * Gives the notated beat of each bar: the tempo of the beat unit (the denominator of the time
 * signature) at the downbeat, as the table of design 5.4 reads it.
 *
 * @param bytes The bytes of the file.
 * @returns The row of the notated beat.
 */
function notatedRate(bytes: Uint8Array): MotionRate {
  const result = buildTimeline(bytes);
  if (!result.ok) {
    return rateRow('notated beat', [], result.error);
  }
  const { tempoMap, timeSignatures, ticksPerQuarter, durationSec } = result.timeline;
  const events: TempoEvent[] = [];
  for (const [s, signature] of timeSignatures.entries()) {
    const endTick = timeSignatures[s + 1]?.tick ?? Infinity;
    const barTicks = (signature.numerator * 4 * ticksPerQuarter) / signature.denominator;
    for (let bar = signature.tick; bar < endTick; bar += barTicks) {
      const at = tempoMap.toSeconds(bar);
      if (at >= durationSec) {
        break;
      }
      const quarterTempo = 60_000_000 / tempoMap.tempoAt(bar);
      events.push({ tempo: (quarterTempo * signature.denominator) / 4, at, group: 0 });
    }
  }
  const signatures = [...new Set(timeSignatures.map((t) => `${t.numerator}/${t.denominator}`))];
  return rateRow('notated beat', events, signatures.join(' '));
}

/** The x axis, for the sway of a spine. */
const X_AXIS = new Vector3(1, 0, 0);

/** The z axis, for the twist of a chest. */
const Z_AXIS = new Vector3(0, 0, 1);

/** The turned axis of an angle. Each call writes it before it reads it. */
const axis = new Vector3();

/** The rotation of a bone. Each call writes it before it reads it. */
const rotation = new Quaternion();

/**
 * Gives the side sway of a spine: the turn around z of its local rotation, read from the turned
 * x axis (`writeBody()` of `pose/pose-at.ts` turns the spine by y, then z, then x).
 *
 * @param rotations The local rotations of a pose.
 * @param bone The bone.
 * @returns The angle in radians.
 */
function swayAngle(rotations: Float32Array, bone: number): number {
  rotation.fromArray(rotations, bone * 4);
  axis.copy(X_AXIS).applyQuaternion(rotation);
  return Math.asin(Math.max(-1, Math.min(1, axis.y)));
}

/**
 * Gives the turn of a chest around y, read from the turned z axis (the chest turns by y, then x).
 *
 * @param rotations The local rotations of a pose.
 * @param bone The bone.
 * @returns The angle in radians.
 */
function twistAngle(rotations: Float32Array, bone: number): number {
  rotation.fromArray(rotations, bone * 4);
  axis.copy(Z_AXIS).applyQuaternion(rotation);
  return Math.atan2(axis.x, axis.z);
}

/**
 * Finds the sides of a sway in a series of angles: each run between two zero crossings whose peak
 * is at least {@link MIN_PEAK}. A crossing time comes from a linear step between two samples.
 *
 * @param times The sample times.
 * @param angles The angle at each sample.
 * @param group The player.
 * @returns The sides.
 */
function sidesOf(times: Float64Array, angles: Float64Array, group: number): TempoEvent[] {
  const sides: TempoEvent[] = [];
  let start: number | null = null;
  let peak = 0;
  let last = -1;
  for (let i = 0; i < angles.length; i++) {
    const b = angles[i] ?? 0;
    if (Math.abs(b) < ZERO_ANGLE) {
      continue;
    }
    const a = angles[last] ?? 0;
    if (last < 0 || i - last > 2) {
      // The first sway, or a sway after a stop: no side ends here.
      start = null;
      peak = Math.abs(b);
    } else if (Math.sign(a) !== Math.sign(b)) {
      const t0 = times[last] ?? 0;
      const t1 = times[i] ?? 0;
      const crossing = t0 + ((t1 - t0) * a) / (a - b);
      if (start !== null && peak >= MIN_PEAK) {
        sides.push({ tempo: 60 / (crossing - start), at: start, group });
      }
      start = crossing;
      peak = Math.abs(b);
    } else {
      peak = Math.max(peak, Math.abs(b));
    }
    last = i;
  }
  return sides;
}

/** The sides of the sways of the players of a song. */
interface SwaySides {
  /** The sides of the spine sway of each player. */
  readonly sway: readonly TempoEvent[];
  /** The sides of the chest twist of each singer. */
  readonly singer: readonly TempoEvent[];
}

/**
 * Samples the poses of a scene over the whole song and gives the sides of the spine sway of each
 * player and of the chest twist of each singer.
 *
 * @param scene The scene.
 * @param step The step of the samples, in seconds.
 * @returns The sides of the sways and of the singer sways.
 */
function swaySides(scene: TestScene, step: number): SwaySides {
  const { plan, score, layout } = scene;
  const audible = allAudible(score);
  const buffer = createScenePose(plan);
  const count = Math.floor(score.durationSec / step) + 1;
  const times = Float64Array.from({ length: count }, (_, i) => i * step);
  const spine = boneIndex('spine');
  const chest = boneIndex('chest');
  const sways = layout.players.map(() => new Float64Array(count));
  const twists = layout.players.map(() => new Float64Array(count));
  for (const [i, time] of times.entries()) {
    const pose = poseAt(plan, time, 10 + time, PLAYING, audible, buffer);
    for (const [p, player] of pose.players.entries()) {
      (sways[p] ?? new Float64Array(count))[i] = swayAngle(player.rotations, spine);
      (twists[p] ?? new Float64Array(count))[i] = twistAngle(player.rotations, chest);
    }
  }
  const sway: TempoEvent[] = [];
  const singer: TempoEvent[] = [];
  for (const p of layout.players.keys()) {
    sway.push(...sidesOf(times, sways[p] ?? new Float64Array(count), p));
    if (plan.players[p]?.note.family === 'choir') {
      singer.push(...sidesOf(times, twists[p] ?? new Float64Array(count), p));
    }
  }
  return { sway, singer };
}

/**
 * Samples the side sway of the spine of each player of a file at each step of a range, as
 * {@link swaySides} samples it.
 *
 * @param file The name of the file.
 * @param bytes The bytes of the file.
 * @param range The range of song times.
 * @returns The trace.
 */
function swayTrace(file: string, bytes: Uint8Array, range: TraceRange): SwayTrace {
  const { plan, score, layout } = sceneOf(bytes);
  const audible = allAudible(score);
  const buffer = createScenePose(plan);
  const spine = boneIndex('spine');
  const count = Math.round((range.to - range.from) / TRACE_STEP) + 1;
  const times = Array.from({ length: count }, (_, i) => range.from + i * TRACE_STEP);
  const angles = layout.players.map(() => Array.from({ length: count }, () => 0));
  for (const [i, time] of times.entries()) {
    const pose = poseAt(plan, time, 10 + time, PLAYING, audible, buffer);
    for (const [p, player] of pose.players.entries()) {
      const row = angles[p];
      if (row) {
        row[i] = (swayAngle(player.rotations, spine) * 180) / Math.PI;
      }
    }
  }
  const players = layout.players.map(
    ({ cast }) => `${cast.species} ${cast.instrument} (seat ${cast.seatIndex})`,
  );
  return { version: TRACE_FORMAT, file, players, times, angles };
}

/**
 * Chooses the player of a trace: the player of `--player`, or the player with the largest sway
 * in the range of the working tree.
 *
 * @param trace The trace of the working tree.
 * @param asked The player of `--player`, or `null`.
 * @returns The index of the player.
 * @throws Error for a player that the file does not have.
 */
function tracePlayer(trace: SwayTrace, asked: number | null): number {
  if (asked !== null) {
    if (asked >= trace.players.length) {
      throw new Error(
        `The file ${trace.file} has ${trace.players.length} players, from 0 to ${trace.players.length - 1}.`,
      );
    }
    return asked;
  }
  const peaks = trace.angles.map((row) => Math.max(0, ...row.map(Math.abs)));
  return peaks.reduce((best, peak, p) => (peak > (peaks[best] ?? 0) ? p : best), 0);
}

/**
 * Writes the lines of `--trace`: the side sway of the spine of one player at each sample, in
 * degrees, with the angle of the commit before the angle of the working tree. The mark `side`
 * shows a zero crossing between a sample and the sample before.
 *
 * @param tree The trace of the working tree.
 * @param base The trace of the commit and its label, or `null`.
 * @param asked The player of `--player`, or `null`.
 * @returns The lines: a title and a table.
 */
function traceLines(
  tree: SwayTrace,
  base: { readonly trace: SwayTrace; readonly label: string } | null,
  asked: number | null,
): string[] {
  const player = tracePlayer(tree, asked);
  const own = tree.angles[player] ?? [];
  const old = base?.trace.angles[player] ?? null;
  const how = asked === null ? 'the player with the largest sway in the range' : '--player';
  const crossed = (row: readonly number[], i: number): boolean =>
    i > 0 && Math.sign(row[i] ?? 0) * Math.sign(row[i - 1] ?? 0) < 0;
  const lines = [
    `Sway trace of the player ${player}, ${tree.players[player] ?? '?'} (${how}), in ${tree.file}, at steps of ${TRACE_STEP} s. The side sway of the spine in degrees (swayAngle()). The mark side shows a zero crossing since the line before.`,
    '',
    base
      ? `| Song s | ${base.label} | side | working tree | side | change |`
      : '| Song s | working tree | side |',
    base ? '|---|---|---|---|---|---|' : '|---|---|---|',
  ];
  if (base && base.trace.players[player] !== tree.players[player]) {
    lines.splice(
      1,
      0,
      `The player ${player} of ${base.label} is ${base.trace.players[player] ?? 'missing'}.`,
    );
  }
  for (const [i, time] of tree.times.entries()) {
    const angle = own[i] ?? 0;
    const side = crossed(own, i) ? 'side' : '';
    if (!old) {
      lines.push(`| ${time.toFixed(2)} | ${angle.toFixed(3)} | ${side} |`);
      continue;
    }
    const before = old[i] ?? 0;
    const oldSide = crossed(old, i) ? 'side' : '';
    lines.push(
      `| ${time.toFixed(2)} | ${before.toFixed(3)} | ${oldSide} | ${angle.toFixed(3)} | ${side} | ${(angle - before).toFixed(3)} |`,
    );
  }
  return lines;
}

/**
 * Runs `--trace`: the trace of the working tree, and with `--base` the trace of the commit with this
 * script of the working tree in place of its own (`probeBeside()`). With `--json`, it writes the
 * trace of all players.
 *
 * @param options The options, with a trace.
 * @param trace The range of the trace.
 */
async function runTrace(options: RatesOptions, trace: TraceRange): Promise<void> {
  if (options.base !== null) {
    const args = withoutOptions(process.argv.slice(2), ['--base', '--midi']);
    args.push(...options.midi.flatMap((path) => ['--midi', path]));
    const texts = await probeBeside(
      options.base,
      'beat-rates.ts',
      { base: args, tree: args },
      { prefix: 'beat-rates-', scripts: ['beat-rates.ts'] },
    );
    const label = `${options.base} (${shortHash(options.base)})`;
    // SAFETY: each text comes from the --json output of this script in a child process.
    const tree = JSON.parse(texts.tree) as SwayTrace;
    // SAFETY: as above.
    const base = JSON.parse(texts.base) as SwayTrace;
    console.log(traceLines(tree, { trace: base, label }, options.player).join('\n'));
    return;
  }

  const [file] = await filesOf(options);
  if (!file) {
    throw new Error(`The option --trace takes one file.\n${USAGE}`);
  }
  const result = swayTrace(file.file, file.bytes, trace);
  if (options.json !== null) {
    writeFileSync(options.json, JSON.stringify(result));
    return;
  }
  console.log(traceLines(result, null, options.player).join('\n'));
}

/**
 * Gives the rate of the bow changes of all bowed players: the start of each new bow.
 *
 * @param scene The scene.
 * @returns The rate of the bow changes.
 */
function bowRate(scene: TestScene): MotionRate {
  const events: TempoEvent[] = [];
  for (const [p, player] of scene.plan.players.entries()) {
    if (player.note.family !== 'bowed') {
      continue;
    }
    const { strokes } = player.note;
    const starts = strokes
      .filter((stroke, k) => k === 0 || stroke.slur !== strokes[k - 1]?.slur)
      .map((stroke) => stroke.start);
    events.push(...eventsOf(starts, p));
  }
  return rateRow('bow change', events, 'note-driven');
}

/**
 * Probes one file: the rows of each motion.
 *
 * @param file The name of the file.
 * @param bytes The bytes of the file.
 * @param step The step of the pose samples.
 * @param limit The limit of the sway tempo.
 * @returns The rates of the file.
 */
function probeFile(file: string, bytes: Uint8Array, step: number, limit: number): FileRates {
  const scene = sceneOf(bytes);
  const { score, plan } = scene;
  const beats = score.beats.map((b) => b.timeSec);
  const patterns = [...new Set(score.beats.map((b) => String(b.pattern)))].join(' ');
  const countIn = countInAt(plan.beats, 0).beatSec;
  const conductor = plan.conductor?.note;
  const cues = conductor?.family === 'conductor' ? [...conductor.cues.lands] : [];
  const { sway, singer } = swaySides(scene, step);
  return {
    file,
    rates: [
      notatedRate(bytes),
      rateOf('conducted beat', beats, `patterns ${patterns}`, CONDUCTED_LIMIT),
      rateRow('sway side', sway, 'all players', limit),
      rateRow('singer sway side', singer, 'choir', limit),
      rateRow(
        'count-in beat',
        [{ tempo: 60 / countIn, at: 0, group: 0 }],
        'conductor or leader nod',
      ),
      rateOf('cue turn', cues, 'entries'),
      bowRate(scene),
    ],
  };
}

/**
 * Gives the verdict of a file: `FAIL` when a row has more than {@link MAX_OVER_SEC} over its
 * limit.
 *
 * @param rates The rates of the file.
 * @returns `PASS` or `FAIL`.
 */
function verdictOf(rates: FileRates): 'PASS' | 'FAIL' {
  return rates.rates.some((r) => r.overSec > MAX_OVER_SEC) ? 'FAIL' : 'PASS';
}

/**
 * Writes a number with one decimal, or `-`.
 *
 * @param value The number, or `null`.
 * @returns The text.
 */
function fixed(value: number | null): string {
  return value === null ? '-' : value.toFixed(1);
}

/**
 * Gives the lines of the table of one file. With the rates of a commit, each row gives the values
 * of the commit, then the values of the working tree.
 *
 * @param rates The rates of the working tree.
 * @param base The rates of the commit and its label, or `null`.
 * @returns The lines.
 */
function tableLines(rates: FileRates, base: { rates: FileRates; label: string } | null): string[] {
  const verdict = verdictOf(rates);
  if (!base) {
    const lines = [
      `${rates.file}: ${verdict}`,
      '| Motion | p50 /min | max /min | shortest (s) | at (s) | count | limit /min | over (s) | note |',
      '|---|---|---|---|---|---|---|---|---|',
    ];
    for (const r of rates.rates) {
      const shortest = r.max === null ? '-' : (60 / r.max).toFixed(3);
      const at = r.atSec === null ? '-' : r.atSec.toFixed(2);
      lines.push(
        `| ${r.motion} | ${fixed(r.p50)} | ${fixed(r.max)} | ${shortest} | ${at} | ${r.count} | ${fixed(r.limit)} | ${fixed(r.overSec)} | ${r.note} |`,
      );
    }
    return lines;
  }

  const lines = [
    `${rates.file}: ${base.label} ${verdictOf(base.rates)}, working tree ${verdict}`,
    '| Motion | base p50 | base max | base over (s) | tree p50 | tree max | tree over (s) | limit /min | tree note |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rates.rates) {
    const b = base.rates.rates.find((row) => row.motion === r.motion);
    lines.push(
      `| ${r.motion} | ${fixed(b?.p50 ?? null)} | ${fixed(b?.max ?? null)} | ${fixed(b?.overSec ?? null)} | ${fixed(r.p50)} | ${fixed(r.max)} | ${fixed(r.overSec)} | ${fixed(r.limit)} | ${r.note} |`,
    );
  }
  return lines;
}

/**
 * Reads the files of the options: each `--midi` path and each `--demo`, or each demo.
 *
 * @param options The options.
 * @returns The name and the bytes of each file.
 * @throws Error if a demo is not known.
 */
async function filesOf(options: RatesOptions): Promise<{ file: string; bytes: Uint8Array }[]> {
  const files = options.midi.map((path) => ({
    file: basename(path),
    bytes: new Uint8Array(readFileSync(path)),
  }));
  if (options.midi.length > 0 && options.demos.length === 0) {
    return files;
  }

  const demos = await patchedDemos();
  const wanted = options.demos.length > 0 ? options.demos : demos.map((d) => d.file);
  for (const id of wanted) {
    const demo = demos.find((d) => d.file === id || d.file === `${id}.mid`);
    if (!demo) {
      throw new Error(`The demo "${id}" is not known.`);
    }
    files.push({ file: demo.file, bytes: demo.bytes });
  }
  return files;
}

/**
 * Probes the commit of `--base` and the working tree at the same time, each in a child process
 * (`probeBeside()`), and prints one table for each file.
 *
 * @param ref The commit, the branch, or the tag.
 * @param options The options, with the absolute paths of `--midi`.
 * @returns True when a file of the working tree fails.
 */
async function compareRates(ref: string, options: RatesOptions): Promise<boolean> {
  const args = withoutOptions(process.argv.slice(2), ['--base', '--midi']);
  args.push(...options.midi.flatMap((path) => ['--midi', path]));
  const texts = await probeBeside(
    ref,
    'beat-rates.ts',
    { base: args, tree: args },
    { prefix: 'beat-rates-' },
  );
  // SAFETY: each text comes from the --json output of this script in a child process.
  const base = (JSON.parse(texts.base) as { files: FileRates[] }).files;
  // SAFETY: as above.
  const tree = (JSON.parse(texts.tree) as { files: FileRates[] }).files;
  const label = `${ref} (${shortHash(ref)})`;
  for (const [i, rates] of tree.entries()) {
    const before = base[i];
    console.log([...tableLines(rates, before ? { rates: before, label } : null), ''].join('\n'));
  }
  return tree.some((rates) => verdictOf(rates) === 'FAIL');
}

/** Runs the tool: `node tools/beat-rates.ts [options]`. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.trace !== null) {
    await runTrace(options, options.trace);
    return;
  }
  if (options.base !== null) {
    process.exitCode = (await compareRates(options.base, options)) ? 1 : 0;
    return;
  }

  const results: FileRates[] = [];
  for (const { file, bytes } of await filesOf(options)) {
    results.push(probeFile(file, bytes, options.step, options.limit));
  }
  if (options.json !== null) {
    writeFileSync(options.json, JSON.stringify({ version: RATES_FORMAT, files: results }));
    return;
  }
  console.log(
    `Sway limit ${options.limit} sides for each minute, conducted limit ${CONDUCTED_LIMIT}.`,
  );
  for (const rates of results) {
    console.log([...tableLines(rates, null), ''].join('\n'));
  }
  process.exitCode = results.some((r) => verdictOf(r) === 'FAIL') ? 1 : 0;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
