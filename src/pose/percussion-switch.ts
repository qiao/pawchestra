import { lastAtOrBefore } from './blend.ts';
import type { NoteGroup } from './note-groups.ts';
import { smoothstep } from '../math.ts';
import { STRIKE_MOTION } from './strikes.ts';

/** The MIDI key of the tambourine (design 4.6). The other keys of the player strike the triangle. */
export const TAMBOURINE_KEY = 54;

/**
 * The timing of a switch of the small percussion player between the triangle and the held
 * tambourine (design 5.3). In a rest, the left paw puts its instrument on the trap table and takes
 * the other one, and the right paw puts down or takes the beater, as a real player lays the
 * instruments that it does not play on a padded trap table
 * (`docs/reference/percussion-technique.md` 8). The sources give no time for a change, but a
 * common mistake of an orchestrator is too little time for it (Hugill). Thus a switch takes the
 * time of its moves, and a rest of at least {@link switchRestSec}.
 */
export const SWITCH_MOTION = {
  /** The paws leave the play place this time after the end of the last note, in seconds. */
  afterSec: 0.2,
  /** The move of the paws from the play place to the table, and back, in seconds. */
  reachSec: 0.45,
  /** The time at the table, in which the paws put down one instrument and take the other. */
  stillSec: 0.6,
} as const;

/**
 * Gives the least rest for a switch: the time after the last note, the two moves, the time at the
 * table, and the lift before the next note (`STRIKE_MOTION.leadSec`).
 *
 * @returns The rest, in seconds.
 */
export function switchRestSec(): number {
  const m = SWITCH_MOTION;
  return m.afterSec + 2 * m.reachSec + m.stillSec + STRIKE_MOTION.leadSec;
}

/**
 * The switches of a small percussion player (design 5.3). In each switch, the left paw goes to the
 * table, puts its instrument down at the put, moves to the other instrument, and takes it at the
 * take. The right paw puts the beater down or takes it in the middle of the two.
 */
export interface SwitchTrack {
  /** The start of the move to the table of each switch, sorted. */
  readonly starts: Float64Array;
  /** 1 for a switch to the tambourine, 0 for a switch to the triangle. */
  readonly tambourine: Uint8Array;
  /** True when the left paw holds the tambourine before the first switch. */
  readonly first: boolean;
}

/**
 * Tells if a note group plays only the tambourine. A chord with the triangle strikes the
 * triangle, because the triangle sounds over the tambourine.
 *
 * @param group The note group.
 * @returns True for a group of the tambourine alone.
 */
export function onlyTambourine(group: NoteGroup): boolean {
  return group.low === TAMBOURINE_KEY && group.high === TAMBOURINE_KEY;
}

/** A run of note groups of one instrument of the small percussion player. */
export interface InstrumentRun {
  /** True for a run of the tambourine, false for the triangle. */
  readonly tambourine: boolean;
  /** The start of the first group and the latest end of the groups, in seconds. */
  readonly start: number;
  readonly end: number;
  /** True for a run of the tambourine that the left paw holds. */
  readonly held: boolean;
}

/**
 * Finds the runs of one instrument of a small percussion player (design 5.3). A run of tambourine
 * groups is held in the left paw when the rest before it and the rest after it are each at least
 * {@link switchRestSec}, or when no triangle group comes before or after it. Another tambourine run
 * plays on the trap table with the tip of the beater, and the left paw keeps the triangle.
 *
 * @param groups The note groups of the player, sorted by start.
 * @returns The runs, sorted by start.
 */
export function instrumentRuns(groups: readonly NoteGroup[]): InstrumentRun[] {
  const runs: { tambourine: boolean; start: number; end: number }[] = [];
  for (const g of groups) {
    const tambourine = onlyTambourine(g);
    const last = runs.at(-1);
    if (last && last.tambourine === tambourine) {
      last.end = Math.max(last.end, g.end);
    } else {
      runs.push({ tambourine, start: g.start, end: g.end });
    }
  }
  const least = switchRestSec();
  return runs.map((run, k) => {
    const before = runs[k - 1];
    const after = runs[k + 1];
    const fits =
      (!before || run.start - before.end >= least) && (!after || after.start - run.end >= least);
    return {
      tambourine: run.tambourine,
      start: run.start,
      end: run.end,
      held: run.tambourine && fits,
    };
  });
}

/**
 * Finds the switches of a small percussion player from its runs (design 5.3). Each switch lies in
 * the middle of the free part of its rest: from the end of the last note plus `afterSec` to the
 * lift of the next note.
 *
 * @param runs The runs of the player ({@link instrumentRuns}).
 * @returns The switches.
 */
export function buildSwitchTrack(runs: readonly InstrumentRun[]): SwitchTrack {
  const m = SWITCH_MOTION;
  const length = 2 * m.reachSec + m.stillSec;
  const rows: [number, number][] = [];
  const add = (end: number, start: number, tambourine: boolean): void => {
    const middle = (end + m.afterSec + start - STRIKE_MOTION.leadSec) / 2;
    rows.push([middle - length / 2, tambourine ? 1 : 0]);
  };
  for (const [k, run] of runs.entries()) {
    if (!run.held) {
      continue;
    }
    const before = runs[k - 1];
    const after = runs[k + 1];
    if (before) {
      add(before.end, run.start, true);
    }
    if (after) {
      add(run.end, after.start, false);
    }
  }
  return {
    starts: Float64Array.from(rows, (r) => r[0]),
    tambourine: Uint8Array.from(rows, (r) => r[1]),
    first: runs[0]?.held ?? false,
  };
}

/** The state of the switches at one time. */
export interface SwitchState {
  /** The weight of the place at the table, from 0 at the play place to 1 at the table. */
  table: number;
  /**
   * The share of the move of the left paw at the table from the place of the instrument that it
   * puts down to the place of the instrument that it takes, from 0 to 1.
   */
  across: number;
  /** True for a switch to the tambourine. */
  toTambourine: boolean;
  /** The place of the tambourine, the triangle, and the beater: 1 in the paw, 0 on the table. */
  readonly held: Float32Array;
}

/**
 * Makes a state with no switch: the triangle and the beater in the paws.
 *
 * @returns The state.
 */
export function createSwitchState(): SwitchState {
  return { table: 0, across: 0, toTambourine: false, held: Float32Array.from([0, 1, 1]) };
}

/**
 * Calculates the switch state at a song time (design 5.3). The weight of the table rises smoothly
 * in `reachSec`, stays 1 for `stillSec`, and falls in `reachSec`. The put is at the start of the
 * time at the table, the take at its end, and the beater changes its place in the middle.
 *
 * @param track The switches.
 * @param time The song time of the note layer.
 * @param out The state to write.
 */
export function switchStateAt(track: SwitchTrack, time: number, out: SwitchState): void {
  const { reachSec, stillSec } = SWITCH_MOTION;
  const i = lastAtOrBefore(track.starts, time);
  const start = track.starts[i];
  // The instrument of the left paw after the last take, and before the next switch.
  const tambourineAfter = (k: number): boolean => (k < 0 ? track.first : track.tambourine[k] === 1);
  out.table = 0;
  out.across = 0;
  out.toTambourine = start !== undefined && track.tambourine[i] === 1;
  let tambourine = tambourineAfter(i - 1);
  let triangle = !tambourine;
  if (start !== undefined) {
    const put = start + reachSec;
    const take = put + stillSec;
    const end = take + reachSec;
    if (time < put) {
      out.table = smoothstep((time - start) / reachSec);
    } else if (time < take) {
      out.table = 1;
      out.across = smoothstep((time - put) / stillSec);
      // Between the put and the take, both instruments lie on the table.
      tambourine = false;
      triangle = false;
    } else if (time < end) {
      out.table = smoothstep((end - time) / reachSec);
      tambourine = tambourineAfter(i);
      triangle = !tambourine;
    } else {
      tambourine = tambourineAfter(i);
      triangle = !tambourine;
    }
    if (time >= take) {
      out.across = 1;
    }
  }
  // The right paw holds the beater while the left paw holds no tambourine, and changes its place
  // in the middle of the time at the table.
  let beater = !tambourineAfter(i - 1);
  if (start !== undefined && time >= start + reachSec + stillSec / 2) {
    beater = !tambourineAfter(i);
  }
  out.held[0] = tambourine ? 1 : 0;
  out.held[1] = triangle ? 1 : 0;
  out.held[2] = beater ? 1 : 0;
}
