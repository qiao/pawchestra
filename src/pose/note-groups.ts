import type { PlayerNote } from '../score/types.ts';
import { lastAtOrBefore } from './blend.ts';
import { smoothstep } from '../math.ts';

/**
 * A note that starts at most this long after the first note of a group joins the group, as a
 * chord joins in design 3.8. A bowed string bows the group as a double stop, and a wind player
 * shows its highest note (design 5.3).
 */
export const CHORD_SEC = 0.05;

/**
 * A rest of at least this length ends a phrase (design 5.3). The next bow stroke is a down-bow at
 * the frog, and a wind player breathes in before the next phrase.
 */
export const PHRASE_GAP_SEC = 0.5;

/** A span of song time, in seconds. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** The notes of one player that start within {@link CHORD_SEC} of the first of them. */
export interface NoteGroup extends Span {
  /** The start of the first note, in song seconds. */
  readonly start: number;
  /** The latest end of the notes of the group. */
  readonly end: number;
  /** The lowest and the highest pitch of the notes of the group. */
  readonly low: number;
  readonly high: number;
  /** The highest loudness of the notes of the group. */
  readonly loudness: number;
  /** The index of the first note of the group in the notes of the player. */
  readonly first: number;
  /** The number of notes of the group. */
  readonly count: number;
}

/**
 * Groups the notes of one player that start together (design 5.3, as a chord of 3.8).
 *
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`. A missing value is 0.
 * @returns The groups, sorted by start. Each note is in one group.
 */
export function groupChords(
  notes: readonly PlayerNote[],
  loudness: readonly number[] = [],
): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (let i = 0; i < notes.length;) {
    const first = notes[i];
    if (!first) {
      break;
    }
    let end = first.endSec;
    let low = first.pitch;
    let high = first.pitch;
    let loud = loudness[i] ?? 0;
    let j = i + 1;
    for (; j < notes.length; j++) {
      const next = notes[j];
      if (!next || next.startSec - first.startSec > CHORD_SEC) {
        break;
      }
      end = Math.max(end, next.endSec);
      low = Math.min(low, next.pitch);
      high = Math.max(high, next.pitch);
      loud = Math.max(loud, loudness[j] ?? 0);
    }
    groups.push({ start: first.startSec, end, low, high, loudness: loud, first: i, count: j - i });
    i = j;
  }
  return groups;
}

/** Spans that rests shorter than a gap join into one span. */
interface JoinedSpan extends Span {
  /** The index of the first joined span in the input, and the number of joined spans. */
  readonly first: number;
  readonly count: number;
}

/**
 * Joins spans with rests shorter than a gap: the notes of a passage or of a phrase (design 5.1,
 * 5.3). A rest of at least the gap starts a new span.
 *
 * @param spans The spans, sorted by start.
 * @param gapSec The shortest rest between two joined spans.
 * @returns The joined spans, sorted by start. Each one ends at the latest end of its spans.
 */
export function joinSpans(spans: readonly Span[], gapSec: number): JoinedSpan[] {
  const out: JoinedSpan[] = [];
  for (const [i, span] of spans.entries()) {
    const last = out.at(-1);
    if (last && span.start - last.end < gapSec) {
      out[out.length - 1] = { ...last, end: Math.max(last.end, span.end), count: last.count + 1 };
    } else {
      out.push({ start: span.start, end: span.end, first: i, count: 1 });
    }
  }
  return out;
}

/**
 * The weight of a span from its start on. A function that does not read the start can omit the
 * last parameter.
 *
 * @param time The song time, at or after the start.
 * @param end The end of the span.
 * @param start The start of the span.
 * @returns The weight, from 0 to 1.
 */
type SpanFall = (time: number, end: number, start: number) => number;

/** The span with the largest envelope at one time, and the envelope. */
interface SpanWeight {
  /** The index of the span, or -1 before the rise of the first span. */
  readonly index: number;
  /** The envelope, from 0 to 1. */
  readonly weight: number;
}

/**
 * Gives the envelope of one span at a time.
 *
 * @param starts The starts of the spans.
 * @param ends The ends of the spans.
 * @param i The index of the span.
 * @param time The song time.
 * @param riseSec The time of the rise before the start.
 * @param fall The weight from the start on.
 * @returns The envelope, or 0 for an index with no span.
 */
function envelopeOf(
  starts: Float64Array,
  ends: Float64Array,
  i: number,
  time: number,
  riseSec: number,
  fall: SpanFall,
): number {
  const start = starts[i];
  const end = ends[i];
  if (start === undefined || end === undefined) {
    return 0;
  }
  return time < start ? smoothstep((time - start + riseSec) / riseSec) : fall(time, end, start);
}

/**
 * Gives the envelope of sorted spans at a time: the sway of a passage, or the breath of a phrase
 * (design 5.1, 5.3). Each span rises in `riseSec` before its start, then follows `fall`. The
 * envelope is the larger of the current span and the span before it, so a span that fades out
 * gives way to the rise of the next span with no jump.
 *
 * @param starts The starts of the spans, sorted.
 * @param ends The ends of the spans.
 * @param time The song time.
 * @param riseSec The time of the rise before the start of a span.
 * @param fall The weight of a span from its start on.
 * @returns The span with the larger envelope, and the envelope.
 */
export function spanEnvelope(
  starts: Float64Array,
  ends: Float64Array,
  time: number,
  riseSec: number,
  fall: SpanFall,
): SpanWeight {
  const i = lastAtOrBefore(starts, time + riseSec);
  const current = envelopeOf(starts, ends, i, time, riseSec, fall);
  const previous = envelopeOf(starts, ends, i - 1, time, riseSec, fall);
  return current >= previous ? { index: i, weight: current } : { index: i - 1, weight: previous };
}
