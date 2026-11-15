import { harpString } from '../models/instruments/harp.ts';
import { lastAtOrBefore } from './blend.ts';
import type { PlayerNote } from '../score/types.ts';
import type { HandNote } from './hand-notes.ts';
import { CHORD_SEC } from './note-groups.ts';
import { smoothstep } from '../math.ts';

/**
 * The rules of the harp fingering (design 5.3, `docs/reference/harp-technique.md` section 7). A
 * harpist plays with four fingers of each hand: 1 (the thumb) on the highest string of a
 * position, and 4 (the ring finger) on the lowest.
 */
export const HARP_FINGERING = {
  /** The most strings that one hand plays in one position (section 7.1). */
  fingers: 4,
  /**
   * The widest position of one hand, in strings from the lowest to the highest: a tenth, which one
   * hand reaches easily (section 7.4).
   */
  span: 9,
  /**
   * A note that starts at least this long after the note before starts a new group, in seconds:
   * the hand places anew after a long gap, as a harpist places a measure during an empty measure
   * (section 7.2).
   */
  groupGapSec: 1,
  /**
   * The largest gap between two groups of one run in one direction, in seconds. In such a run,
   * finger 4 passes under the thumb to go up, or the thumb crosses over finger 4 to go down
   * (section 7.4).
   */
  crossGapSec: 0.5,
  /**
   * The most strings between the last string of a group and the first string of the next group
   * for a crossing: the next group goes on from the place of the thumb or of finger 4.
   */
  crossStrings: 3,
  /**
   * The time between two plucks of a rolled chord, in seconds: fast and even, with the last note
   * on the beat (section 7.4). No source gives the time.
   */
  rollSec: 0.03,
  /** A chord rolls only from this number of strings of both hands at one start (section 7.4). */
  rollFrom: 3,
  /** A pluck of a finger takes this time: at most {@link HARP_FINGERING.pluckShare} of the gap. */
  pluckSec: 0.08,
  /** The largest share of the gap to the next note of the hand that a pluck takes. */
  pluckShare: 0.3,
  /**
   * The time in which a finger opens again for its next pluck, after the place of its group, in
   * seconds.
   */
  openSec: 0.12,
} as const;

/**
 * The fingering of one harp hand (design 5.3): a finger, a pluck time, and a close time for each
 * fingered note, and a group and a crossing flag for each note of the hand. A digit pose reads it:
 * finger 1 (the thumb) closes on its own, and fingers 2 to 4 close as one group
 * ({@link fingerClosesAt}).
 */
export interface HarpFingering {
  /**
   * The first fingered note of each note of the hand, then the end. Note `i` has the fingered
   * notes from `first[i]` up to `first[i + 1]`, the end excluded, from the lowest string.
   */
  readonly first: Uint32Array;
  /** The MIDI key of each fingered note. */
  readonly keys: Uint8Array;
  /** The string of each fingered note (`harpString()`), from 0 (the bass string). */
  readonly strings: Uint8Array;
  /** The finger of each fingered note: 1 (the thumb) to 4 (the ring finger). */
  readonly fingers: Uint8Array;
  /**
   * The pluck of each fingered note, in song seconds: the note start, or earlier in a rolled
   * chord, so that the last note of the roll falls on the note start.
   */
  readonly plucks: Float64Array;
  /** The time at which the finger of each fingered note is closed in the palm after its pluck. */
  readonly closes: Float64Array;
  /** The group of each note of the hand. The notes of one group share one place of the hand. */
  readonly groups: Uint32Array;
  /**
   * The first note of the hand in each group, then the number of notes. Group `g` has the notes
   * from `groupFirst[g]` up to `groupFirst[g + 1]`, the end excluded.
   */
  readonly groupFirst: Uint32Array;
  /**
   * The crossing of each note of the hand: +1 when finger 4 passes under the thumb to go on up,
   * -1 when the thumb crosses over finger 4 to go on down, and 0 for none. Only the first note of
   * a group crosses.
   */
  readonly crossings: Int8Array;
  /**
   * The time at which the hand starts to place each group, in song seconds: the end of the pluck
   * of the last note of the group before, as a harpist places at once after the pluck before
   * (section 7.2). The first group places a short move before its first pluck.
   */
  readonly places: Float64Array;
  /** The lowest and the highest MIDI key of the strings of each group. */
  readonly groupLow: Uint8Array;
  readonly groupHigh: Uint8Array;
}

/** One group of notes of one hand while the plan builds it. */
interface GroupDraft {
  /** The first note of the hand in the group. */
  readonly from: number;
  /** The strings of the group, sorted up, each one time. */
  strings: number[];
  /** The MIDI key of each string of the group. */
  readonly keyOf: Map<number, number>;
  /** The start of the last note of the group. */
  last: number;
}

/** The strings of one note of a hand. */
interface NoteStrings {
  /** The strings, sorted up, each one time. */
  readonly strings: number[];
  /** The MIDI key of each string. */
  readonly keyOf: Map<number, number>;
}

/**
 * Gives the strings that one note of a hand plays: the string of each key (`harpString()`), each
 * string one time, at most {@link HARP_FINGERING.fingers} of them. A chord with more strings keeps
 * its lowest and its highest string and the inner strings nearest to an even spread. The sound
 * keeps each note.
 *
 * @param keys The keys of the note, sorted up.
 * @returns The strings, sorted up, and the key of each string.
 */
function noteStrings(keys: readonly number[]): NoteStrings {
  const keyOf = new Map<number, number>();
  for (const key of keys) {
    const string = harpString(key);
    if (!keyOf.has(string)) {
      keyOf.set(string, key);
    }
  }
  let strings = [...keyOf.keys()].toSorted((a, b) => a - b);
  const most = HARP_FINGERING.fingers;
  if (strings.length > most) {
    const kept = Array.from(
      { length: most },
      (_, k) => strings[Math.round((k * (strings.length - 1)) / (most - 1))] ?? 0,
    );
    strings = [...new Set(kept)];
  }
  return { strings, keyOf };
}

/**
 * Gives the fingers of the strings of one position, from the lowest string (section 7.4): the
 * thumb on the highest string, and the next fingers down from it. With fewer than four strings,
 * a wide gap at the bottom takes a finger further from the thumb, as the hand opens: finger 4 for
 * a gap of a fifth or more under three strings, and finger 3 or 4 under two strings.
 *
 * @param strings The strings of the position, sorted up.
 * @returns The finger of each string.
 */
function positionFingers(strings: readonly number[]): number[] {
  const count = strings.length;
  const fingers = strings.map((_, i) => count - i);
  const gap = (strings[1] ?? 0) - (strings[0] ?? 0);
  if (count === 3 && gap >= 4) {
    fingers[0] = 4;
  }
  if (count === 2) {
    fingers[0] = gap >= 6 ? 4 : gap >= 4 ? 3 : 2;
  }
  return fingers;
}

/**
 * Tells if a note joins the group of the notes before it (section 7.4): the strings of the group
 * and of the note stay within {@link HARP_FINGERING.fingers} strings and the span of a tenth, and
 * the note starts less than {@link HARP_FINGERING.groupGapSec} after the last note of the group.
 * Thus a scale goes in groups of four: 4321 up and 1234 down.
 *
 * @param group The group.
 * @param strings The strings of the note.
 * @param start The start of the note.
 * @returns True if the note joins the group.
 */
function joins(group: GroupDraft, strings: readonly number[], start: number): boolean {
  const all = new Set([...group.strings, ...strings]);
  const low = Math.min(...all);
  const high = Math.max(...all);
  return (
    all.size <= HARP_FINGERING.fingers &&
    high - low <= HARP_FINGERING.span &&
    start - group.last < HARP_FINGERING.groupGapSec
  );
}

/**
 * Plans the fingering of one harp hand (design 5.3, `docs/reference/harp-technique.md` section 7):
 * the notes go into groups, one position of the hand each, and each string of a group gets the
 * finger of its place in the position ({@link positionFingers}). A pure function of the notes.
 *
 * @param notes The notes of the hand, sorted by start.
 * @returns The fingering, with each pluck at its note start. {@link planHarpFingerings} rolls the
 *   chords.
 */
function planHand(notes: readonly HandNote[]): HarpFingering {
  const f = HARP_FINGERING;
  const parts = notes.map((note) => noteStrings(note.keys));
  const drafts: GroupDraft[] = [];
  const groups = new Uint32Array(notes.length);
  for (const [i, note] of notes.entries()) {
    const { strings, keyOf } = parts[i] ?? { strings: [], keyOf: new Map<number, number>() };
    const group = drafts.at(-1);
    if (group && (strings.length === 0 || joins(group, strings, note.start))) {
      group.strings = [...new Set([...group.strings, ...strings])].toSorted((a, b) => a - b);
      for (const [string, key] of keyOf) {
        if (!group.keyOf.has(string)) {
          group.keyOf.set(string, key);
        }
      }
      group.last = strings.length > 0 ? note.start : group.last;
    } else {
      drafts.push({ from: i, strings: [...strings], keyOf: new Map(keyOf), last: note.start });
    }
    groups[i] = drafts.length - 1;
  }

  const first = new Uint32Array(notes.length + 1);
  let count = 0;
  for (const [i, part] of parts.entries()) {
    first[i] = count;
    count += part.strings.length;
  }
  first[notes.length] = count;
  const keys = new Uint8Array(count);
  const strings = new Uint8Array(count);
  const fingers = new Uint8Array(count);
  const plucks = new Float64Array(count);
  const closes = new Float64Array(count);
  for (const [i, note] of notes.entries()) {
    const draft = drafts[groups[i] ?? 0];
    const position = draft?.strings ?? [];
    const own = positionFingers(position);
    const part = parts[i];
    const gap = (notes[i + 1]?.start ?? Infinity) - note.start;
    const pluck = Math.min(f.pluckSec, f.pluckShare * gap);
    for (const [k, string] of (part?.strings ?? []).entries()) {
      const j = (first[i] ?? 0) + k;
      keys[j] = part?.keyOf.get(string) ?? 0;
      strings[j] = string;
      fingers[j] = own[position.indexOf(string)] ?? 1;
      plucks[j] = note.start;
      closes[j] = note.start + pluck;
    }
  }

  const crossings = new Int8Array(notes.length);
  const places = new Float64Array(drafts.length);
  const groupFirst = new Uint32Array(drafts.length + 1);
  groupFirst[drafts.length] = notes.length;
  const groupLow = new Uint8Array(drafts.length);
  const groupHigh = new Uint8Array(drafts.length);
  for (const [g, draft] of drafts.entries()) {
    const low = draft.strings[0];
    const high = draft.strings.at(-1);
    groupLow[g] = low === undefined ? 60 : (draft.keyOf.get(low) ?? 60);
    groupHigh[g] = high === undefined ? 60 : (draft.keyOf.get(high) ?? 60);
    groupFirst[g] = draft.from;
    const before = drafts[g - 1];
    if (before && low !== undefined && high !== undefined) {
      crossings[draft.from] = crossingOf(notes, parts, draft.from, before.strings);
    }
  }
  return {
    first,
    keys,
    strings,
    fingers,
    plucks,
    closes,
    groups,
    groupFirst,
    crossings,
    places,
    groupLow,
    groupHigh,
  };
}

/**
 * Finds the crossing at the first note of a group (section 7.4): a run that goes on up past the
 * thumb passes finger 4 under it, and a run that goes on down past finger 4 crosses the thumb over
 * it. The run goes on when the first note of the group is near the last note before it in time
 * and in strings, in the direction of the last two notes.
 *
 * @param notes The notes of the hand.
 * @param parts The strings of each note.
 * @param i The first note of the group.
 * @param before The strings of the group before, sorted up.
 * @returns +1 up, -1 down, or 0.
 */
function crossingOf(
  notes: readonly HandNote[],
  parts: readonly { readonly strings: readonly number[] }[],
  i: number,
  before: readonly number[],
): number {
  const f = HARP_FINGERING;
  const now = parts[i]?.strings ?? [];
  const last = parts[i - 1]?.strings ?? [];
  const lastButOne = parts[i - 2]?.strings ?? [];
  const gap = (notes[i]?.start ?? 0) - (notes[i - 1]?.start ?? 0);
  if (now.length !== 1 || last.length !== 1 || gap > f.crossGapSec) {
    return 0;
  }
  const string = now[0] ?? 0;
  const from = last[0] ?? 0;
  const trend = lastButOne.length === 1 ? from - (lastButOne[0] ?? from) : string - from;
  const top = before.at(-1) ?? 0;
  const bottom = before[0] ?? 0;
  if (string > top && string - top <= f.crossStrings && trend > 0) {
    return 1;
  }
  if (string < bottom && bottom - string <= f.crossStrings && trend < 0) {
    return -1;
  }
  return 0;
}

/**
 * Rolls the chords of both hands of a harp player (section 7.4): at each start with at least
 * {@link HARP_FINGERING.rollFrom} strings of both hands, the fingers pluck from the lowest string
 * to the highest, with the last pluck on the start. A chord of two strings, such as an octave,
 * does not roll. The roll ends no earlier than the end of the pluck before in either hand, so that
 * it stays short in a fast passage. The sound keeps one start.
 *
 * @param hands The fingering of the left and of the right hand. The call moves their plucks and
 *   closes.
 */
function rollChords(hands: readonly HarpFingering[]): void {
  const f = HARP_FINGERING;
  const atStart = new Map<number, { hand: HarpFingering; index: number }[]>();
  for (const hand of hands) {
    for (const [index, pluck] of hand.plucks.entries()) {
      const list = atStart.get(pluck) ?? [];
      list.push({ hand, index });
      atStart.set(pluck, list);
    }
  }
  const allPlucks = hands.flatMap((hand) => [...hand.closes]).toSorted((a, b) => a - b);
  for (const [start, list] of atStart) {
    if (list.length < f.rollFrom) {
      continue;
    }
    const sorted = list.toSorted(
      (a, b) => (a.hand.strings[a.index] ?? 0) - (b.hand.strings[b.index] ?? 0),
    );
    // The latest end of a pluck before the start, of either hand.
    let free = -Infinity;
    for (const close of allPlucks) {
      if (close < start - 1e-9 && close > free) {
        free = close;
      }
    }
    const step = Math.max(0, Math.min(f.rollSec, (start - free) / sorted.length));
    for (const [k, { hand, index }] of sorted.entries()) {
      const pluck = start - (sorted.length - 1 - k) * step;
      const length = (hand.closes[index] ?? start) - start;
      hand.plucks[index] = pluck;
      hand.closes[index] = pluck + length;
    }
  }
}

/**
 * Plans the fingering of both hands of a harp player (design 5.3,
 * `docs/reference/harp-technique.md` section 7): the groups and the fingers of each hand, the
 * crossings of the runs, the place times of the groups, and the rolls of the chords. A pure
 * function of the notes of the hands.
 *
 * @param left The notes of the left hand, sorted by start.
 * @param right The notes of the right hand, sorted by start.
 * @returns The fingering of the left and of the right hand.
 */
export function planHarpFingerings(
  left: readonly HandNote[],
  right: readonly HandNote[],
): readonly [left: HarpFingering, right: HarpFingering] {
  const hands = [planHand(left), planHand(right)] as const;
  rollChords(hands);
  placeGroups(hands[0], left);
  placeGroups(hands[1], right);
  return hands;
}

/**
 * Gives the place time of each group of a hand (section 7.2): the end of the pluck of the last
 * fingered note of the group before, as a harpist places at once after the pluck before, and at
 * the latest the first pluck of the group. The first group places
 * {@link HARP_FINGERING.openSec} before its first pluck. The times do not go down.
 *
 * @param fingering The fingering of the hand. The call writes its place times.
 * @param notes The notes of the hand.
 */
function placeGroups(fingering: HarpFingering, notes: readonly HandNote[]): void {
  const { first, groupFirst, places, plucks, closes } = fingering;
  let lastClose = -Infinity;
  let lastPlace = -Infinity;
  for (let g = 0; g < places.length; g++) {
    const from = groupFirst[g] ?? 0;
    const to = groupFirst[g + 1] ?? from;
    let firstPluck = notes[from]?.start ?? 0;
    for (let j = first[from] ?? 0; j < (first[to] ?? 0); j++) {
      firstPluck = Math.min(firstPluck, plucks[j] ?? firstPluck);
    }
    const place = Number.isFinite(lastClose)
      ? Math.min(lastClose, firstPluck)
      : firstPluck - HARP_FINGERING.openSec;
    places[g] = Math.max(place, lastPlace);
    lastPlace = places[g] ?? place;
    for (let j = first[from] ?? 0; j < (first[to] ?? 0); j++) {
      lastClose = Math.max(lastClose, closes[j] ?? lastClose);
    }
  }
}

/** The close of the fingers of one harp hand at one time, from 0 (open) to 1 (closed). */
export interface FingerCloses {
  /** The close of the thumb (finger 1). */
  thumb: number;
  /** The close of fingers 2 to 4, which close as one group. */
  fingers: number;
}

/**
 * Calculates the close of the thumb and of fingers 2 to 4 of a harp hand at a song time (design
 * 5.3): a pure function of the fingering and the time. A finger closes into the palm from its
 * pluck to its close time, and opens again in {@link HARP_FINGERING.openSec} when the next group
 * places. Fingers 2 to 4 close as one group: the group follows the last pluck of those fingers in
 * the group of the hand, so it stays open until the last of them has plucked.
 *
 * @param fingering The fingering of the hand.
 * @param time The song time of the note layer.
 * @param out The closes to write.
 */
export function fingerClosesAt(fingering: HarpFingering, time: number, out: FingerCloses): void {
  const group = lastAtOrBefore(fingering.places, time);
  if (group < 0) {
    out.thumb = 0;
    out.fingers = 0;
    return;
  }
  // The closes of the group before fade out as this group places.
  const opening = 1 - smoothstep((time - (fingering.places[group] ?? 0)) / HARP_FINGERING.openSec);
  const before = group > 0 ? opening : 0;
  out.thumb = Math.max(
    groupClose(fingering, group, true, time),
    before * groupClose(fingering, group - 1, true, time),
  );
  out.fingers = Math.max(
    groupClose(fingering, group, false, time),
    before * groupClose(fingering, group - 1, false, time),
  );
}

/**
 * Calculates the close of the thumb, or of fingers 2 to 4, in one group of a hand at a song time.
 * The thumb follows its last pluck. Fingers 2 to 4 close only at the last pluck of any of them in
 * the group.
 *
 * @param fingering The fingering of the hand.
 * @param group The group.
 * @param thumb True for the thumb, false for fingers 2 to 4.
 * @param time The song time.
 * @returns The close, from 0 (open) to 1 (closed).
 */
function groupClose(fingering: HarpFingering, group: number, thumb: boolean, time: number): number {
  const { first, groupFirst, plucks, closes, fingers } = fingering;
  const from = first[groupFirst[group] ?? 0] ?? 0;
  const to = first[groupFirst[group + 1] ?? 0] ?? from;
  // The last pluck of the part in the group, and the last pluck of the part up to the time.
  let last = -1;
  let played = -1;
  for (let j = from; j < to; j++) {
    if ((fingers[j] === 1) !== thumb) {
      continue;
    }
    const pluck = plucks[j] ?? 0;
    if (last < 0 || pluck >= (plucks[last] ?? 0)) {
      last = j;
    }
    if (pluck <= time && (played < 0 || pluck >= (plucks[played] ?? 0))) {
      played = j;
    }
  }
  const at = thumb ? played : played >= 0 && played === last ? last : -1;
  if (at < 0) {
    return 0;
  }
  const pluck = plucks[at] ?? 0;
  return smoothstep((time - pluck) / Math.max(1e-6, (closes[at] ?? pluck) - pluck));
}

/** The note data of one harp hand that {@link notePlucks} reads. */
interface PluckedHand {
  /** The start of each note of the hand, sorted. */
  readonly starts: Float64Array;
  /** The fingering of the hand, or `null` for none. */
  readonly fingering: HarpFingering | null;
}

/**
 * Gives the pluck time of each note of a harp player (design 5.3): the note start, or the earlier
 * pluck of its finger in a rolled chord. The string of the note swings from this time, so the
 * strings of a rolled chord start to swing from the lowest to the highest. The sound keeps the
 * note start.
 *
 * @param notes The notes of the player, sorted by start.
 * @param hands The note data of the two hands.
 * @returns The pluck time of each note, in song seconds.
 */
export function notePlucks(
  notes: readonly PlayerNote[],
  hands: readonly PluckedHand[],
): Float64Array {
  return Float64Array.from(notes, (note) => {
    for (const { starts, fingering } of hands) {
      const i = lastAtOrBefore(starts, note.startSec + 1e-9);
      const start = starts[i];
      if (!fingering || start === undefined || note.startSec - start > CHORD_SEC) {
        continue;
      }
      for (let j = fingering.first[i] ?? 0; j < (fingering.first[i + 1] ?? 0); j++) {
        if (fingering.keys[j] === note.pitch) {
          return note.startSec + (fingering.plucks[j] ?? start) - start;
        }
      }
    }
    return note.startSec;
  });
}
