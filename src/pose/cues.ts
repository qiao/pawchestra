import { MathUtils } from 'three';

import type { Vec3 } from '../models/tuples.ts';
import type { Beat, PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import type { BatonTrack } from './conductor-notes.ts';
import { beatLengthAt } from './count-in.ts';
import type { MotionFamily } from './family.ts';
import { smoothstep } from '../math.ts';
import { CONDUCTOR_MOTION, seatHeight } from './rest.ts';
import type { SeatAudibility } from './types.ts';

/** The rules that select the entries that the conductor cues (design 5.4). */
export const CUE_RULES = {
  /**
   * The shortest rest before an entry that gets a cue is one bar, but at least this time. Thus a
   * fast bar of one beat needs about two beats of rest.
   */
  minRestSec: 1.2,
  /** The shortest rest is at most this time, so that a slow bar of 4.8 s needs only 3 s. */
  maxRestSec: 3,
  /**
   * After a general rest of at least this part of a conducted beat, in which no seat sounds, each
   * seat that starts again enters.
   */
  generalRestBeats: 0.75,
  /** Entries that start within this time of the first entry of a moment start together. */
  togetherSec: 0.1,
  /** An entry within this time of a beat is on the beat, so that the baton can cue it. */
  onBeatSec: 0.005,
  /** The least time between the landings of two cues. */
  gapSec: 1.5,
  /** The window before an entry, in bars, that tells if the music is dense. */
  denseBars: 2,
  /** A seat that sounds in this part of the window is busy. */
  busyCover: 0.8,
  /** When this part of the other seats is busy, the conductor keeps the pattern and gives no cue. */
  denseShare: 0.75,
  /** A moment is a tutti when at least this part of the seats, and this many seats, enter. */
  tuttiShare: 0.5,
  tuttiSeats: 3,
  /** An entry with at least this loudness is strong, and the baton cues it on a beat. */
  loud: 0.6,
  /** The priority of a group adds these values for a first entry and for a tutti. */
  firstBonus: 0.25,
  tuttiBonus: 0.5,
  /** A section more than this angle to the right gets the baton when it enters on a beat. */
  batonRight: 45 * MathUtils.DEG2RAD,
} as const;

/** The motion of a cue (design 5.4). Angles are in radians, times in song seconds. */
export const CUE_MOTION = {
  /** The head and the upper body turn to the section in this time, before the preparation. */
  turnSec: 0.6,
  /** The preparation is the conducted beat before the landing, within these limits. */
  prepMinSec: 0.3,
  prepMaxSec: 0.8,
  /** The left hand rises in this time before the preparation. */
  handRiseSec: 0.5,
  /** The left hand stays at the cue point for this time after the landing, then comes down. */
  handHoldSec: 0.3,
  handFallSec: 0.6,
  /** The eyes stay on the section for this time after the landing, then turn back. */
  lookHoldSec: 0.6,
  lookBackSec: 0.6,
  /** The largest turn to a section: the upper body and the head together. */
  maxTurn: 80 * MathUtils.DEG2RAD,
  /** The upper body turns this part of the turn, at most `torsoMax`. The head turns the rest. */
  torsoPart: 0.4,
  torsoMax: 30 * MathUtils.DEG2RAD,
  headMax: 50 * MathUtils.DEG2RAD,
  /** The head turns at most this far down and up to the section. */
  pitchDown: 25 * MathUtils.DEG2RAD,
  pitchUp: 15 * MathUtils.DEG2RAD,
  /** The eyes of the players are this far above their place, in meters. */
  eyeHeight: 1.1,
  /**
   * The left hand points at least this far to the left of the front of the bear, so that it shows
   * beside the head from behind. At the front of the upper body, a cue to a section in the middle
   * or at the right puts the hand behind the head in the view from behind.
   */
  handLeft: 25 * MathUtils.DEG2RAD,
  /**
   * At the cue point, the left hand points this far up, at this part of the reach of the arm: a
   * nearly straight arm, as a conductor extends the arm to the section. At 0.85, the bent elbow of
   * the Tripo bear folded about 9 faces at its inner side in each cue (`pnpm fold-probe`).
   */
  cueLift: 30 * MathUtils.DEG2RAD,
  cueReach: 0.93,
  /** In the preparation, the hand is this much higher and this much nearer to the shoulder. */
  prepLift: 15 * MathUtils.DEG2RAD,
  prepPull: 0.1,
  /** A baton cue makes the arc into its beat this part higher. */
  batonBoost: 0.6,
} as const;

/** The hand of a cue: the left hand, or the baton for a strong entry. */
type CueKind = 'hand' | 'baton';

/** The first note of a seat after a rest, or the first note of a seat. */
interface Entry {
  /** The start of the note, in song seconds. */
  readonly start: number;
  readonly seatIndex: number;
  /** The rest before the note, in seconds: `Infinity` for the first note of the seat. */
  readonly restSec: number;
  /** The loudness of the note, from 0 to 1 (design 5.3). */
  readonly loudness: number;
}

/** A seat with players, as the cues see it. */
export interface CueSeat {
  /** The motion family of the instrument of the seat. One cue can go to a family. */
  readonly family: MotionFamily;
  readonly players: number;
  /** The middle of the eyes of the players, in the model axes of the conductor. */
  readonly center: Vec3;
}

/** The limits of a cue that a body gives (`StudioBody.cueHeadLeft` and the others), in radians. */
export interface CueFacts {
  /**
   * The largest turn of the head to the left and to the right in a cue. With no value, the head
   * turns at most `headMax` to that side.
   */
  headLeft?: number;
  headRight?: number;
  /** The angle up of the left hand at the cue point. With no value, the hand points `cueLift` up. */
  cueLift?: number;
}

/** The inputs of {@link findCues}. */
interface CueInputs extends CueFacts {
  /** The conducted beats, sorted by time. */
  readonly beats: readonly Beat[];
  /** All notes, sorted by start. */
  readonly notes: readonly PlayerNote[];
  /** The loudness of each note, in the order of `notes`. */
  readonly loudness: ArrayLike<number>;
  /** One entry for each seat: `null` for a seat with no players. */
  readonly seats: readonly (CueSeat | null)[];
  /** The eyes and the left shoulder joint of the conductor, in its model axes. */
  readonly eyes: Vec3;
  readonly shoulder: Vec3;
  /** The baton data, for the arc of a baton cue. */
  readonly baton: BatonTrack;
}

/** One cue of the conductor. Turns are around +y: a positive turn turns to the left. */
export interface Cue {
  /** The start of the first note of the cued entry, in song seconds. */
  readonly entrySec: number;
  /**
   * The time at which the gesture lands: the entry, or the downbeat of the count-in for the
   * entries at the song start.
   */
  readonly landSec: number;
  /** The conducted beat before the landing, in seconds. */
  readonly beatSec: number;
  readonly kind: CueKind;
  /** The seats that enter in the cue, sorted. */
  readonly seats: readonly number[];
  readonly torsoYaw: number;
  readonly headYaw: number;
  readonly headPitch: number;
  /** The turn of the left hand to the section. */
  readonly handYaw: number;
  /** The extra height of the arc of the baton into the landing, in meters. */
  readonly batonLift: number;
}

/** The cues of a score that the pose looks up at each frame. */
export interface CueTrack {
  /** The landing of each cue, sorted. */
  readonly lands: Float64Array;
  readonly cues: readonly Cue[];
  /** The angle up of the left hand at the cue point, in radians, in place of `cueLift`. */
  readonly cueLift?: number;
}

/** The cue motion at one time (design 5.4). Turns are around +y, positive to the left. */
export interface CueState {
  torsoYaw: number;
  headYaw: number;
  headPitch: number;
  /** The weight of the left hand, from 0 to 1. */
  hand: number;
  /** The direction of the left hand: its turn and its angle up. */
  handYaw: number;
  handLift: number;
  /** The distance of the wrist from the shoulder, as a part of the reach of the arm. */
  handReach: number;
  /** The lift of the tip of the baton, in meters. */
  batonLift: number;
}

/**
 * Makes a cue state with no cue.
 *
 * @returns The state.
 */
export function createCueState(): CueState {
  return {
    torsoYaw: 0,
    headYaw: 0,
    headPitch: 0,
    hand: 0,
    handYaw: 0,
    handLift: CUE_MOTION.cueLift,
    handReach: CUE_MOTION.cueReach,
    batonLift: 0,
  };
}

/**
 * Gives the length of the bar at a song time: the conducted beat times the beats of its bar.
 *
 * @param beats The conducted beats.
 * @param times The times of the beats.
 * @param time The song time.
 * @returns The length in seconds.
 */
function barLengthAt(beats: readonly Beat[], times: Float64Array, time: number): number {
  const beat = beats[Math.max(0, lastAtOrBefore(times, time))];
  return beatLengthAt(times, time) * (beat?.beatsInBar ?? 4);
}

/**
 * Gives the shortest rest before an entry that gets a cue (design 5.4): one bar, from 1.2 s to
 * 3 s.
 *
 * @param beats The conducted beats.
 * @param times The times of the beats.
 * @param time The start of the entry.
 * @returns The rest in seconds.
 */
function shortestCuedRest(beats: readonly Beat[], times: Float64Array, time: number): number {
  const r = CUE_RULES;
  return Math.min(r.maxRestSec, Math.max(r.minRestSec, barLengthAt(beats, times, time)));
}

/**
 * Finds each entry of a seat (design 5.4): the first note of the seat, each note after a rest of
 * at least {@link shortestCuedRest}, and each note after a general rest of at least 0.75 of a
 * conducted beat. The rest of a seat is the time from the end of all its earlier notes. A general
 * rest is a time in which no seat sounds.
 *
 * @param beats The conducted beats, sorted by time.
 * @param notes The notes, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param hasPlayers Tells whether a seat has players. The sound-only seat has none.
 * @returns The entries, sorted by start, then by seat.
 */
export function findEntries(
  beats: readonly Beat[],
  notes: readonly PlayerNote[],
  loudness: ArrayLike<number>,
  hasPlayers: (seatIndex: number) => boolean,
): Entry[] {
  const times = Float64Array.from(beats, (b) => b.timeSec);
  const lastEnd = new Map<number, number>();
  const entries: Entry[] = [];
  // `allEnd` is the last end of all notes so far. `endBefore` is the last end of the notes that
  // start before `start`, the start of the current note.
  let allEnd = -Infinity;
  let endBefore = -Infinity;
  let start = -Infinity;
  for (const [i, note] of notes.entries()) {
    if (note.startSec > start) {
      start = note.startSec;
      endBefore = allEnd;
    }
    allEnd = Math.max(allEnd, note.endSec);
    const seat = note.seatIndex;
    if (!hasPlayers(seat)) {
      continue;
    }
    const end = lastEnd.get(seat);
    const restSec = end === undefined ? Infinity : note.startSec - end;
    const general =
      note.startSec - endBefore >= CUE_RULES.generalRestBeats * beatLengthAt(times, start);
    if (restSec > 0 && (general || restSec >= shortestCuedRest(beats, times, note.startSec))) {
      entries.push({ start: note.startSec, seatIndex: seat, restSec, loudness: loudness[i] ?? 0 });
    }
    lastEnd.set(seat, Math.max(end ?? -Infinity, note.endSec));
  }
  return entries.toSorted((a, b) => a.start - b.start || a.seatIndex - b.seatIndex);
}

/** The merged spans of the notes of one seat, sorted. */
interface Spans {
  readonly starts: Float64Array;
  readonly ends: Float64Array;
}

/**
 * Merges the notes of each seat into spans in which the seat sounds.
 *
 * @param notes The notes, sorted by start.
 * @param seats The number of seats.
 * @returns The spans of each seat.
 */
function seatSpans(notes: readonly PlayerNote[], seats: number): Spans[] {
  const starts: number[][] = Array.from({ length: seats }, () => []);
  const ends: number[][] = Array.from({ length: seats }, () => []);
  for (const note of notes) {
    const from = starts[note.seatIndex];
    const to = ends[note.seatIndex];
    if (!from || !to) {
      continue;
    }
    const end = to.at(-1);
    if (end !== undefined && note.startSec <= end) {
      to[to.length - 1] = Math.max(end, note.endSec);
    } else {
      from.push(note.startSec);
      to.push(note.endSec);
    }
  }
  return starts.map((from, s) => ({
    starts: Float64Array.from(from),
    ends: Float64Array.from(ends[s] ?? []),
  }));
}

/**
 * Gives the part of a window in which a seat sounds.
 *
 * @param spans The merged spans of the seat.
 * @param from The start of the window.
 * @param to The end of the window, after `from`.
 * @returns The part, from 0 to 1.
 */
function coverage(spans: Spans, from: number, to: number): number {
  let covered = 0;
  for (let k = Math.max(0, lastAtOrBefore(spans.starts, from)); k < spans.starts.length; k++) {
    const start = spans.starts[k] ?? 0;
    if (start >= to) {
      break;
    }
    covered += Math.max(0, Math.min(spans.ends[k] ?? 0, to) - Math.max(start, from));
  }
  return covered / (to - from);
}

/** The spans of a seat with no notes. */
const NO_SPANS: Spans = { starts: new Float64Array(0), ends: new Float64Array(0) };

/** The turns of a cue to its section. */
interface Turns {
  readonly torsoYaw: number;
  readonly headYaw: number;
  readonly headPitch: number;
  readonly handYaw: number;
  /** The turn to the section, positive to the left, before the limits. */
  readonly toSection: number;
}

/**
 * Calculates the turns of a cue to a point (design 5.4): the upper body turns 40% of the turn,
 * at most 30°, and the head turns the rest, at most 50°. The left hand points to the point, no
 * further right than the front of the upper body, and at least 25° to the left of the front of
 * the bear.
 *
 * @param inputs The eyes and the shoulder of the conductor.
 * @param target The point, in the model axes of the conductor.
 * @returns The turns.
 */
function turnsTo(inputs: CueInputs, target: Vec3): Turns {
  const m = CUE_MOTION;
  const clampTo = (value: number, limit: number): number =>
    Math.min(limit, Math.max(-limit, value));
  const dx = target[0] - inputs.eyes[0];
  const dz = target[2] - inputs.eyes[2];
  const toSection = Math.atan2(-dx, -dz);
  const total = clampTo(toSection, m.maxTurn);
  const torsoYaw = clampTo(m.torsoPart * total, m.torsoMax);
  // A positive turn turns to the left, so the limit of a turn to the right is a lower bound.
  const headYaw = Math.min(
    inputs.headLeft ?? m.headMax,
    Math.max(-(inputs.headRight ?? m.headMax), total - torsoYaw),
  );
  const pitch = Math.atan2(target[1] - inputs.eyes[1], Math.hypot(dx, dz));
  const fromShoulder = Math.atan2(inputs.shoulder[0] - target[0], inputs.shoulder[2] - target[2]);
  return {
    torsoYaw,
    headYaw,
    headPitch: Math.min(m.pitchUp, Math.max(-m.pitchDown, pitch)),
    // The left hand points no further right than the front of the upper body. A hand 20° to the
    // right of it crosses in front of the head, and the forearm goes through the muzzle.
    handYaw: Math.min(m.maxTurn, Math.max(torsoYaw, m.handLeft, fromShoulder)),
    toSection,
  };
}

/** A group of entries of one moment that can get one cue. */
interface Group {
  readonly seats: number[];
  loudness: number;
  first: boolean;
}

/** A cue that waits for the gap rule, with its priority. */
interface Candidate {
  readonly cue: Cue;
  readonly priority: number;
}

/**
 * Finds the cues of the conductor (design 5.4). Entries that start together form a moment. A
 * moment in dense music gets no cue. Else the entries of one motion family form a group, or all
 * entries of a tutti form one group. The group with the highest priority (loudness, exposure,
 * first entry, tutti) gets the cue, toward the middle of its players. Of two cues less than 1.5 s
 * apart, the one with the higher priority stays. The entries at the song start get the downbeat
 * of the count-in. A strong entry on a beat, or an entry on a beat far to the right, gets the
 * baton. The other entries get the left hand.
 *
 * @param inputs The beats, the notes, the seats, and the places of the conductor.
 * @returns The cues, sorted by landing.
 */
export function findCues(inputs: CueInputs): CueTrack {
  const r = CUE_RULES;
  const { beats, seats } = inputs;
  const times = Float64Array.from(beats, (b) => b.timeSec);
  const hasPlayers = (s: number): boolean => Boolean(seats[s]);
  const entries = findEntries(beats, inputs.notes, inputs.loudness, hasPlayers);
  const spans = seatSpans(inputs.notes, seats.length);
  const playing = seats.filter(Boolean).length;
  const candidates: Candidate[] = [];
  let moments = 0;
  for (let i = 0; i < entries.length; moments++) {
    const start = entries[i]?.start ?? 0;
    const moment: Entry[] = [];
    while (i < entries.length && (entries[i]?.start ?? 0) < start + r.togetherSec) {
      const entry = entries[i];
      if (entry) {
        moment.push(entry);
      }
      i++;
    }
    const entering = new Set(moment.map((e) => e.seatIndex));
    const window = r.denseBars * barLengthAt(beats, times, start);
    let others = 0;
    let busy = 0;
    for (const [s, seat] of seats.entries()) {
      if (!seat || entering.has(s)) {
        continue;
      }
      others++;
      if (coverage(spans[s] ?? NO_SPANS, start - window, start) >= r.busyCover) {
        busy++;
      }
    }
    const busyShare = others > 0 ? busy / others : 0;
    if (others >= r.tuttiSeats && busyShare >= r.denseShare) {
      continue;
    }
    const tutti = entering.size >= r.tuttiSeats && entering.size >= r.tuttiShare * playing;
    const groups = new Map<string, Group>();
    for (const entry of moment) {
      const key = tutti ? 'tutti' : (seats[entry.seatIndex]?.family ?? 'none');
      const group = groups.get(key) ?? { seats: [], loudness: 0, first: false };
      group.seats.push(entry.seatIndex);
      group.loudness = Math.max(group.loudness, entry.loudness);
      group.first ||= entry.restSec === Infinity;
      groups.set(key, group);
    }
    let best: Group | undefined;
    let priority = -Infinity;
    for (const group of groups.values()) {
      const value =
        group.loudness +
        (1 - busyShare) +
        (group.first ? r.firstBonus : 0) +
        (tutti ? r.tuttiBonus : 0);
      if (value > priority) {
        best = group;
        priority = value;
      }
    }
    if (best) {
      candidates.push({
        cue: cueOf(inputs, times, best, start, tutti, moments === 0),
        priority,
      });
    }
  }
  const kept: Cue[] = [];
  for (const { cue } of candidates.toSorted(
    (a, b) => b.priority - a.priority || a.cue.landSec - b.cue.landSec,
  )) {
    if (kept.every((c) => Math.abs(c.landSec - cue.landSec) >= r.gapSec)) {
      kept.push(cue);
    }
  }
  const cues = kept.toSorted((a, b) => a.landSec - b.landSec);
  const lands = Float64Array.from(cues, (c) => c.landSec);
  return inputs.cueLift === undefined ? { lands, cues } : { lands, cues, cueLift: inputs.cueLift };
}

/**
 * Makes the cue of a group: its landing, its hand, and its turns.
 *
 * @param inputs The inputs of the cues.
 * @param times The times of the beats.
 * @param group The group.
 * @param entrySec The start of the moment.
 * @param tutti Whether the moment is a tutti.
 * @param opening Whether the moment is the first one of the song.
 * @returns The cue.
 */
function cueOf(
  inputs: CueInputs,
  times: Float64Array,
  group: Group,
  entrySec: number,
  tutti: boolean,
  opening: boolean,
): Cue {
  const r = CUE_RULES;
  const center = [0, 0, 0];
  let players = 0;
  for (const s of group.seats) {
    const seat = inputs.seats[s];
    if (seat) {
      for (let a = 0; a < 3; a++) {
        center[a] = (center[a] ?? 0) + (seat.center[a] ?? 0) * seat.players;
      }
      players += seat.players;
    }
  }
  const target: Vec3 = [
    (center[0] ?? 0) / players,
    (center[1] ?? 0) / players,
    (center[2] ?? 0) / players,
  ];
  const turns = turnsTo(inputs, target);
  const k = lastAtOrBefore(times, entrySec + r.onBeatSec);
  const beat = times[k];
  const onBeat = beat !== undefined && entrySec - beat <= r.onBeatSec;
  const second = times[1] ?? Infinity;
  const strong = tutti || group.loudness >= r.loud;
  let kind: CueKind = 'hand';
  let landSec = entrySec;
  let batonLift = 0;
  if (opening && entrySec < second && times[0] !== undefined) {
    // The preparatory beat of the count-in cues the entries at the song start.
    kind = 'baton';
    landSec = times[0];
  } else if (onBeat && (strong || -turns.toSection > r.batonRight)) {
    kind = 'baton';
    landSec = beat;
    batonLift = CUE_MOTION.batonBoost * (inputs.baton.arcs[k] ?? 0);
  }
  return {
    entrySec,
    landSec,
    beatSec: beatLengthAt(times, landSec - 1e-6),
    kind,
    seats: group.seats.toSorted((a, b) => a - b),
    torsoYaw: turns.torsoYaw,
    headYaw: turns.headYaw,
    headPitch: turns.headPitch,
    handYaw: turns.handYaw,
    batonLift,
  };
}

/**
 * Gives the preparation of a cue: the beat before the landing, from 0.3 s to 0.8 s.
 *
 * @param cue The cue.
 * @returns The time in seconds.
 */
export function prepOf(cue: Cue): number {
  return Math.min(CUE_MOTION.prepMaxSec, Math.max(CUE_MOTION.prepMinSec, cue.beatSec));
}

/**
 * Gives the weight of the turn of the head and the upper body of a cue (design 5.4). The turn
 * ends one preparation before the landing, and turns back after the eye contact.
 *
 * @param cue The cue.
 * @param time The song time.
 * @returns The weight, from 0 to 1.
 */
export function lookWeight(cue: Cue, time: number): number {
  const m = CUE_MOTION;
  const turned = cue.landSec - prepOf(cue);
  if (time < turned) {
    return smoothstep(1 - (turned - time) / m.turnSec);
  }
  return 1 - smoothstep((time - cue.landSec - m.lookHoldSec) / m.lookBackSec);
}

/**
 * Gives the weight of the left hand of a cue (design 5.4). The hand rises before the
 * preparation, stays at the cue point after the landing, and comes down.
 *
 * @param cue The cue.
 * @param time The song time.
 * @returns The weight, from 0 to 1. A baton cue gives 0.
 */
export function handWeight(cue: Cue, time: number): number {
  const m = CUE_MOTION;
  if (cue.kind !== 'hand') {
    return 0;
  }
  const prepared = cue.landSec - prepOf(cue);
  if (time < prepared) {
    return smoothstep(1 - (prepared - time) / m.handRiseSec);
  }
  return 1 - smoothstep((time - cue.landSec - m.handHoldSec) / m.handFallSec);
}

/**
 * Gives the bend of the preparation of a cue: 1 before the preparation, 0 at the landing. The
 * bend falls along a quarter cosine, so that the hand lands at its full speed.
 *
 * @param cue The cue.
 * @param time The song time.
 * @returns The bend, from 0 to 1.
 */
function bendOf(cue: Cue, time: number): number {
  const prep = prepOf(cue);
  const progress = Math.min(1, Math.max(0, 1 - (cue.landSec - time) / prep));
  return Math.cos((Math.PI / 2) * progress);
}

/**
 * Gives the audible weight of a cue: the highest weight of its seats (design 5.5), with the lift
 * and the lowering of the conductor. A cue to silent seats has the weight 0.
 *
 * @param cue The cue.
 * @param audibility The audibility of the seats. A missing entry sounds.
 * @param wallTime The wall clock time.
 * @returns The weight, from 0 to 1.
 */
function audibleWeight(
  cue: Cue,
  audibility: readonly (SeatAudibility | undefined)[],
  wallTime: number,
): number {
  let weight = 0;
  for (const s of cue.seats) {
    const seat = audibility[s];
    weight = Math.max(weight, seatHeight(CONDUCTOR_MOTION, seat, wallTime));
  }
  return weight;
}

/** The longest time from the start of a cue to its landing. */
const LEAD_SEC = CUE_MOTION.prepMaxSec + Math.max(CUE_MOTION.turnSec, CUE_MOTION.handRiseSec);

/** The longest time from the landing of a cue to its end. */
const TAIL_SEC = Math.max(
  CUE_MOTION.lookHoldSec + CUE_MOTION.lookBackSec,
  CUE_MOTION.handHoldSec + CUE_MOTION.handFallSec,
);

/**
 * Writes the cue motion at a song time (design 5.4). Cues can overlap: the turns and the
 * direction of the hand are the means of the cues by their weights, so that the motion goes from
 * one cue to the next with no jump.
 *
 * @param track The cues.
 * @param time The song time.
 * @param audibility The audibility of the seats. A missing entry sounds.
 * @param wallTime The wall clock time, for the audibility.
 * @param out The state to write.
 */
export function cueStateAt(
  track: CueTrack,
  time: number,
  audibility: readonly (SeatAudibility | undefined)[],
  wallTime: number,
  out: CueState,
): void {
  const m = CUE_MOTION;
  let look = 0;
  let torso = 0;
  let headYaw = 0;
  let headPitch = 0;
  let hands = 0;
  let hand = 0;
  let handYaw = 0;
  let bend = 0;
  let baton = 0;
  for (let k = lastAtOrBefore(track.lands, time + LEAD_SEC); k >= 0; k--) {
    const cue = track.cues[k];
    if (!cue || cue.landSec + TAIL_SEC < time) {
      break;
    }
    const audible = audibleWeight(cue, audibility, wallTime);
    if (audible === 0) {
      continue;
    }
    const lw = lookWeight(cue, time) * audible;
    look += lw;
    torso += lw * cue.torsoYaw;
    headYaw += lw * cue.headYaw;
    headPitch += lw * cue.headPitch;
    const hw = handWeight(cue, time) * audible;
    if (hw > 0) {
      hands += hw;
      hand = Math.max(hand, hw);
      handYaw += hw * cue.handYaw;
      bend += hw * bendOf(cue, time);
    }
    const beat = cue.beatSec;
    if (cue.batonLift > 0 && time < cue.landSec && time > cue.landSec - beat) {
      baton += audible * cue.batonLift * Math.sin((Math.PI * (cue.landSec - time)) / beat);
    }
  }
  const lookScale = 1 / Math.max(1, look);
  out.torsoYaw = torso * lookScale;
  out.headYaw = headYaw * lookScale;
  out.headPitch = headPitch * lookScale;
  out.hand = hand;
  out.handYaw = hands > 0 ? handYaw / hands : 0;
  const prep = hands > 0 ? bend / hands : 0;
  out.handLift = (track.cueLift ?? m.cueLift) + m.prepLift * prep;
  out.handReach = m.cueReach - m.prepPull * prep;
  out.batonLift = baton;
}
