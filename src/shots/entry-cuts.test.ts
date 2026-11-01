import { describe, expect, it } from 'vitest';

import type { Score } from '../score/types.ts';
import { demoShotScenes } from './test-shots.ts';
import type { ShotScene } from './test-shots.ts';

const SCENES = await demoShotScenes();

/**
 * The rules of the measure of the entries (design 5.6). The test reads the notes of the score
 * with its own code, so that a change of the entry rule of the planner does not change the
 * measure.
 */
const MEASURE = {
  /** The shortest rest before an entry, in full bars. */
  restBars: 2,
  /** The shortest rest before an entry, in seconds. */
  restSec: 4,
  /** The time after an entry in which the seat plays its passage, in seconds. */
  passageSec: 8,
  /** The notes of the passage cover this part of that time, or more. */
  passageShare: 0.3,
  /** A cut from this part of a bar before an entry is a cut at the entry. */
  beforeBars: 0.25,
  /** A cut until this part of a bar after an entry is a cut at the entry. */
  afterBars: 1,
} as const;

/** The seats that enter together: within a quarter of a bar of the first one. */
interface EntryEvent {
  /** The first note of the first seat, in song seconds. */
  readonly start: number;
  /** The length of the bar at the start, in seconds. */
  readonly bar: number;
  /** The entering seats. */
  readonly seats: readonly number[];
}

/** The first note of a seat after its rest. */
interface SeatEntry {
  /** The start of the note, in song seconds. */
  readonly start: number;
  /** The seat. */
  readonly seat: number;
}

/** The entries of one demo and the cuts at them. */
interface EntryCuts {
  /** The name of the demo file. */
  readonly file: string;
  /** The number of entry events before the last shot. */
  readonly events: number;
  /** The number of entry events with a cut to an entering seat within the reach. */
  readonly cut: number;
}

/**
 * Counts the full bars in a rest: the downbeats in it, less the bar of its end.
 *
 * @param downbeats The times of the downbeats, sorted.
 * @param from The start of the rest.
 * @param to The end of the rest.
 * @returns The number of full bars.
 */
function fullBars(downbeats: readonly number[], from: number, to: number): number {
  const before = (time: number): number => downbeats.filter((d) => d <= time).length;
  return before(to) - before(from - 1e-9) - 1;
}

/**
 * Gives the length of the bar at a time.
 *
 * @param downbeats The times of the downbeats, sorted.
 * @param time The time, in song seconds.
 * @returns The bar length, in seconds.
 */
function barAt(downbeats: readonly number[], time: number): number {
  const i = Math.max(
    0,
    Math.min(downbeats.filter((d) => d <= time).length - 1, downbeats.length - 2),
  );
  return (downbeats[i + 1] ?? 0) - (downbeats[i] ?? 0);
}

/**
 * Gives the part of a time range that the notes of a seat cover.
 *
 * @param score The score.
 * @param seat The seat.
 * @param from The start of the range.
 * @param to The end of the range.
 * @returns The covered part, from 0 to 1.
 */
function coveredPart(score: Score, seat: number, from: number, to: number): number {
  const spans = score.notes
    .filter((n) => n.seatIndex === seat && n.endSec > from && n.startSec < to)
    .map((n) => [Math.max(from, n.startSec), Math.min(to, n.endSec)] as const)
    .toSorted((a, b) => a[0] - b[0]);
  let covered = 0;
  let end = from;
  for (const [start, stop] of spans) {
    covered += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return covered / (to - from);
}

/**
 * Finds the entry events of a score: the first note of a seat with players after a rest of at
 * least two full bars and 4 s, when the seat then plays a passage. The song start counts as the
 * end of a rest.
 *
 * @param score The score.
 * @returns The events, sorted by start.
 */
function entryEvents(score: Score): EntryEvent[] {
  const m = MEASURE;
  const downbeats = score.beats.filter((b) => b.indexInBar === 0).map((b) => b.timeSec);
  const lastEnd = new Map<number, number>();
  const entries: SeatEntry[] = [];
  for (const note of score.notes) {
    const seat = note.seatIndex;
    if ((score.seats[seat]?.playerCount ?? 0) === 0) {
      continue;
    }
    const end = lastEnd.get(seat) ?? 0;
    const rested =
      note.startSec - end >= m.restSec - 1e-9 &&
      fullBars(downbeats, end, note.startSec) >= m.restBars;
    if (
      rested &&
      coveredPart(score, seat, note.startSec, note.startSec + m.passageSec) >= m.passageShare
    ) {
      entries.push({ start: note.startSec, seat });
    }
    lastEnd.set(seat, Math.max(end, note.endSec));
  }

  const events: EntryEvent[] = [];
  for (const entry of entries.toSorted((a, b) => a.start - b.start || a.seat - b.seat)) {
    const event = events.at(-1);
    if (event && entry.start - event.start <= m.beforeBars * event.bar + 1e-9) {
      events[events.length - 1] = { ...event, seats: [...event.seats, entry.seat] };
    } else {
      events.push({ start: entry.start, bar: barAt(downbeats, entry.start), seats: [entry.seat] });
    }
  }
  return events;
}

/**
 * Counts the entry events of a demo before its last shot, and the events with a cut to an
 * entering seat: the first cut from a quarter of a bar before the event goes to a shot of an
 * entering seat, at most one bar after the event.
 *
 * @param scene The scene and the plan of the demo.
 * @returns The counts.
 */
function entryCutsOf(scene: ShotScene): EntryCuts {
  const m = MEASURE;
  const { shots } = scene.plan;
  const lastStart = shots.at(-1)?.startSec ?? Infinity;
  const events = entryEvents(scene.score).filter(
    (event) => event.start < lastStart - m.beforeBars * event.bar,
  );
  const cut = events.filter((event) => {
    const shot = shots.find((s) => s.startSec >= event.start - m.beforeBars * event.bar - 1e-6);
    return (
      shot !== undefined &&
      shot.startSec <= event.start + m.afterBars * event.bar + 1e-6 &&
      shot.seats.some((seat) => event.seats.includes(seat))
    );
  }).length;
  return { file: scene.file, events: events.length, cut };
}

describe('the cuts at the entries of the demos (design 5.6)', () => {
  it('cuts to a seat that enters, within one bar, at half of the entries or more', () => {
    // The cinematic camera films the player who just started to play. The numbers of each demo
    // are in design 5.6.
    const counts = SCENES.map(entryCutsOf);
    const events = counts.reduce((sum, c) => sum + c.events, 0);
    const cut = counts.reduce((sum, c) => sum + c.cut, 0);
    const text = counts.map((c) => `${c.file} ${c.cut}/${c.events}`).join(', ');
    expect(events, text).toBeGreaterThan(80);
    expect(cut / events, text).toBeGreaterThanOrEqual(0.5);
  });
});
