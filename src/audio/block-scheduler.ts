import { sustainsAfterSeek } from '../score/program-map.ts';
import type { SynthEventTable } from './synth-events.ts';

/** The transport state of the processor between two blocks (design 6.4). */
export interface TransportState {
  readonly playing: boolean;
  /** Song seconds at the start of the next block. */
  readonly songSec: number;
  /** Playback rate, above 0. It stays the same while paused. */
  readonly rate: number;
  /** The index of the next event to send. */
  readonly cursor: number;
  /**
   * The song time of the first sound of a play, while the count-in before it runs (design 6.5).
   * The block that reaches it starts the held notes again. `null` when no start waits.
   */
  readonly startSec: number | null;
}

/** A transport command from the `Player`. */
export type TransportCommand =
  | {
      readonly type: 'play';
      /**
       * The count-in in song seconds (design 6.5): the song time starts this much before the
       * start point, and the sound starts at the start point.
       */
      readonly countInSec: number;
    }
  | { readonly type: 'pause' }
  | { readonly type: 'seek'; readonly songSec: number }
  | { readonly type: 'rate'; readonly rate: number };

/**
 * A seat audibility command from the `Player` (design 6.6). The app calculates the flag from the
 * mute and solo rules.
 */
export interface SeatCommand {
  readonly type: 'seat';
  readonly seatIndex: number;
  readonly audible: boolean;
}

/** The synth actions that one transport command needs. */
interface TransportActions {
  /** Release all notes. */
  readonly release: boolean;
  /** Reset the synth, then send the events of {@link chaseEvents} at the cursor. */
  readonly chase: boolean;
}

/** The result of one transport command. */
interface CommandResult {
  readonly state: TransportState;
  readonly actions: TransportActions;
  /** True if the command changed the transport, so the processor posts a clock anchor. */
  readonly changed: boolean;
}

/** The events of one block, and the transport state after it. */
export interface BlockPlan {
  readonly state: TransportState;
  /** The first event of the block. */
  readonly from: number;
  /** The index after the last event of the block. */
  readonly to: number;
  /** True if the song ended in this block. The processor then releases all notes and pauses. */
  readonly ended: boolean;
  /**
   * True if this block reaches the start point of a play. The processor then starts the held
   * notes of {@link restartNotes} at `from` again, before the events of the block.
   */
  readonly restartHeld: boolean;
}

/**
 * The synth messages that make the sounding notes agree with the seat audibility flags
 * (design 6.6).
 */
interface AudibilityPlan {
  /** Note ons to end with a note off, in the order of the synth for each key. */
  readonly ends: Int32Array;
  /** Note ons to send, in event order. */
  readonly starts: Int32Array;
  /**
   * The channels whose notes all belong to silent seats. The processor stops all notes of these
   * channels, so that a sustain pedal does not keep them.
   */
  readonly stopChannels: Int32Array;
  /**
   * The other channels with notes of a seat that became silent. A sustain pedal that is down can
   * still hold the ended notes of that seat, so the processor releases the held notes of these
   * channels.
   */
  readonly releaseChannels: Int32Array;
}

/** The transport state of a newly loaded score. */
export const INITIAL_TRANSPORT: TransportState = {
  playing: false,
  songSec: 0,
  rate: 1,
  cursor: 0,
  startSec: null,
};

const NOTE_OFF = 0x80;

const NOTE_ON = 0x90;

const CONTROL_CHANGE = 0xb0;

const PROGRAM_CHANGE = 0xc0;

const CHANNEL_PRESSURE = 0xd0;

const PITCH_BEND = 0xe0;

/** Controllers whose order matters, so a chase sends each one (bank, data entry, RPN, NRPN). */
const ORDERED_CONTROLLERS = new Set([0, 6, 32, 38, 96, 97, 98, 99, 100, 101, 121]);

/** Controllers that CC 121 (reset all controllers) resets, after RP-015. */
const RESET_BY_CC_121 = [1, 11, 64, 65, 66, 67];

const RESET_ALL_CONTROLLERS = 121;

const NO_ACTIONS: TransportActions = { release: false, chase: false };

/**
 * Finds the first event at or after a song time.
 *
 * @param timeSec The event times, in ascending order.
 * @param songSec The song time.
 * @returns The index of the first event with `timeSec >= songSec`, or the event count.
 */
export function eventIndexAt(timeSec: Float64Array, songSec: number): number {
  let low = 0;
  let high = timeSec.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((timeSec[middle] ?? Infinity) < songSec) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Applies one transport command (design 6.5).
 *
 * A play starts the song time one count-in before the start point: the pause point, or 0 at the
 * song end. The cursor stays at the start point, so no event before it sounds again. The block
 * that reaches the start point starts the held notes again ({@link planBlock}). A pause in the
 * count-in goes back to the start point. A seek during play starts the sound at the seek point,
 * with no count-in.
 *
 * @param state The state before the command.
 * @param command The command.
 * @param timeSec The event times, in ascending order.
 * @param durationSec The song length.
 * @returns The new state, the synth actions, and the change flag.
 */
export function applyCommand(
  state: TransportState,
  command: TransportCommand,
  timeSec: Float64Array,
  durationSec: number,
): CommandResult {
  switch (command.type) {
    case 'play': {
      if (state.playing) {
        return { state, actions: NO_ACTIONS, changed: false };
      }
      const countIn = command.countInSec > 0 ? command.countInSec : 0;
      if (state.songSec >= durationSec) {
        // Play at the end starts the song again from the start.
        return {
          state: { ...state, playing: true, songSec: -countIn, cursor: 0, startSec: 0 },
          actions: { release: true, chase: true },
          changed: true,
        };
      }
      return {
        state: {
          ...state,
          playing: true,
          songSec: state.songSec - countIn,
          startSec: state.songSec,
        },
        actions: NO_ACTIONS,
        changed: true,
      };
    }
    case 'pause': {
      if (!state.playing) {
        return { state, actions: NO_ACTIONS, changed: false };
      }
      const { startSec } = state;
      const songSec = startSec !== null && state.songSec < startSec ? startSec : state.songSec;
      return {
        state: { ...state, playing: false, songSec, startSec: null },
        actions: { release: true, chase: false },
        changed: true,
      };
    }
    case 'seek': {
      const songSec = Math.min(Math.max(command.songSec, 0), durationSec);
      return {
        state: {
          ...state,
          songSec,
          cursor: eventIndexAt(timeSec, songSec),
          startSec: state.playing ? songSec : null,
        },
        actions: { release: true, chase: true },
        changed: true,
      };
    }
    case 'rate': {
      if (!(command.rate > 0) || command.rate === state.rate) {
        return { state, actions: NO_ACTIONS, changed: false };
      }
      return { state: { ...state, rate: command.rate }, actions: NO_ACTIONS, changed: true };
    }
  }
}

/**
 * Selects the events of one block. An event is due when its time is before the song time at the
 * end of the block. Thus each event starts at the start of the block that holds its time, up to
 * one block early. The block that reaches the start point of a play also starts the held notes
 * again, so that they sound from the same block as the first events after the count-in. The
 * song ends in the block that reaches the song length, after the events at or before it. The
 * events after the song length do not sound.
 *
 * @param state The state at the block start.
 * @param timeSec The event times, in ascending order.
 * @param blockSec The block length in context seconds, such as 128 / 48000.
 * @param durationSec The song length.
 * @returns The event range and the state at the block end.
 */
export function planBlock(
  state: TransportState,
  timeSec: Float64Array,
  blockSec: number,
  durationSec: number,
): BlockPlan {
  const from = state.cursor;
  if (!state.playing) {
    return { state, from, to: from, ended: false, restartHeld: false };
  }
  const endSec = state.songSec + blockSec * state.rate;
  const restartHeld = state.startSec !== null && state.startSec < endSec;
  const startSec = restartHeld ? null : state.startSec;
  let to = from;
  while (to < timeSec.length && (timeSec[to] ?? Infinity) < endSec) {
    to += 1;
  }
  // The song ends at the last note off (design 6.5). A later event, such as a pedal up, does not
  // keep the transport in play, because the app pauses at the song length.
  if (endSec >= durationSec && (timeSec[to] ?? Infinity) > durationSec) {
    return {
      state: { ...state, playing: false, songSec: durationSec, cursor: to, startSec: null },
      from,
      to,
      ended: true,
      restartHeld,
    };
  }
  return {
    state: { ...state, songSec: endSec, cursor: to, startSec },
    from,
    to,
    ended: false,
    restartHeld,
  };
}

/**
 * Lists the events that restore the channel state at a cursor after a synth reset: the
 * programs, the controllers, the pitch bend, and the channel pressure (design 6.5).
 *
 * The program changes and the controllers of {@link ORDERED_CONTROLLERS} keep their order. For
 * each other controller, the pitch bend, and the channel pressure, only the last value of each
 * channel remains.
 *
 * @param table The events.
 * @param cursor The index of the first event after the seek point.
 * @returns Event indices, in event order.
 */
export function chaseEvents(table: SynthEventTable, cursor: number): Int32Array {
  const ordered: number[] = [];
  /** The last event index of each `channel:kind:controller` key. */
  const last = new Map<string, number>();
  for (let i = 0; i < cursor; i++) {
    const kind = table.kind[i];
    const channel = table.channel[i];
    const data1 = table.data1[i];
    if (kind === PROGRAM_CHANGE) {
      ordered.push(i);
    } else if (kind === CONTROL_CHANGE && data1 !== undefined) {
      if (ORDERED_CONTROLLERS.has(data1)) {
        ordered.push(i);
      } else {
        last.set(`${channel}:${kind}:${data1}`, i);
      }
      if (data1 === RESET_ALL_CONTROLLERS) {
        for (const controller of RESET_BY_CC_121) {
          last.delete(`${channel}:${CONTROL_CHANGE}:${controller}`);
        }
        last.delete(`${channel}:${PITCH_BEND}:0`);
        last.delete(`${channel}:${CHANNEL_PRESSURE}:0`);
      }
    } else if (kind === PITCH_BEND || kind === CHANNEL_PRESSURE) {
      last.set(`${channel}:${kind}:0`, i);
    }
  }
  return Int32Array.from([...ordered, ...last.values()].toSorted((a, b) => a - b));
}

/**
 * Tells if an event ends a note: a note off, or a note on with velocity 0.
 *
 * @param table The events.
 * @param index The event index.
 * @returns True for a note end.
 */
function isNoteEnd(table: SynthEventTable, index: number): boolean {
  const kind = table.kind[index];
  return kind === NOTE_OFF || (kind === NOTE_ON && table.data2[index] === 0);
}

/**
 * Gives the key of a note event in the per-key arrays: `channel * 128 + key`.
 *
 * @param table The events.
 * @param index The event index.
 * @returns The key index.
 */
function noteKey(table: SynthEventTable, index: number): number {
  return (table.channel[index] ?? 0) * 128 + (table.data1[index] ?? 0);
}

/**
 * Pairs each note end with its note on, first in, first out for each channel and key, as the
 * synth pairs them (design 3.3, 6.5).
 *
 * @param table The events.
 * @param channelCount The number of synth channels.
 * @returns For each event: the index of the note on that the event ends, or -1 for an event that
 *   is not a note end, and for a note end with no open note on.
 */
export function notePairs(table: SynthEventTable, channelCount: number): Int32Array {
  const count = table.timeSec.length;
  const pairs = new Int32Array(count).fill(-1);
  /** The next open note on of the same key, in a list for each key. */
  const next = new Int32Array(count).fill(-1);
  const first = new Int32Array(channelCount * 128).fill(-1);
  const last = new Int32Array(channelCount * 128).fill(-1);
  for (let i = 0; i < count; i++) {
    const key = noteKey(table, i);
    if (isNoteEnd(table, i)) {
      const on = first[key] ?? -1;
      pairs[i] = on;
      if (on >= 0) {
        first[key] = next[on] ?? -1;
      }
    } else if (table.kind[i] === NOTE_ON) {
      if ((first[key] ?? -1) < 0) {
        first[key] = i;
      } else {
        next[last[key] ?? 0] = i;
      }
      last[key] = i;
    }
  }
  return pairs;
}

/**
 * Finds the notes that start before a cursor and end after it. Note offs end note ons first in,
 * first out, as in the synth (design 3.3).
 *
 * @param table The events.
 * @param cursor The index of the first event after the seek point.
 * @returns Event indices of the held note ons, in event order.
 */
export function heldNotes(table: SynthEventTable, cursor: number): Int32Array {
  const open = new Map<number, number[]>();
  for (let i = 0; i < cursor; i++) {
    const key = noteKey(table, i);
    if (isNoteEnd(table, i)) {
      open.get(key)?.shift();
    } else if (table.kind[i] === NOTE_ON) {
      const notes = open.get(key);
      if (notes) {
        notes.push(i);
      } else {
        open.set(key, [i]);
      }
    }
  }
  return Int32Array.from([...open.values()].flat().toSorted((a, b) => a - b));
}

/**
 * Tells if a note event belongs to a silent seat.
 *
 * @param table The events.
 * @param index The event index.
 * @param silent 1 for each silent seat, by seat index.
 * @returns True for a note of a silent seat.
 */
function isSilent(table: SynthEventTable, index: number, silent: Uint8Array): boolean {
  return silent[table.seatIndex[index] ?? -1] === 1;
}

/**
 * Finds the held notes to start again at a cursor. A held note starts again if its seat is not
 * silent, its channel is not a rhythm channel, and the program of its channel has a long sound
 * (`sustainsAfterSeek()` of `score/`, design 6.5, 6.6).
 *
 * @param table The events.
 * @param cursor The index of the first event after the seek or pause point.
 * @param channelCount The number of synth channels.
 * @param silent 1 for each silent seat, by seat index.
 * @returns Event indices of the note ons to send again, in event order.
 */
export function restartNotes(
  table: SynthEventTable,
  cursor: number,
  channelCount: number,
  silent: Uint8Array,
): Int32Array {
  const programs = new Uint8Array(channelCount);
  for (let i = 0; i < cursor; i++) {
    if (table.kind[i] === PROGRAM_CHANGE) {
      programs[table.channel[i] ?? 0] = table.data1[i] ?? 0;
    }
  }
  return heldNotes(table, cursor).filter((index) => {
    const channel = table.channel[index] ?? 0;
    return (
      !isSilent(table, index, silent) &&
      channel % 16 !== 9 &&
      sustainsAfterSeek(programs[channel] ?? 0)
    );
  });
}

/**
 * Lists the seats that have notes on each channel (design 6.6). The engine makes the lists one
 * time for each score, so that a seat change does not walk all events to find the silent
 * channels.
 *
 * @param table The events.
 * @param channelCount The number of synth channels.
 * @returns For each channel, the seat indices of its note ons, in ascending order with no repeat.
 *   A note with no seat gives -1, which is never silent.
 */
export function channelSeats(table: SynthEventTable, channelCount: number): readonly Int16Array[] {
  const seats = Array.from({ length: channelCount }, () => new Set<number>());
  for (let i = 0; i < table.timeSec.length; i++) {
    if (table.kind[i] === NOTE_ON && !isNoteEnd(table, i)) {
      seats[table.channel[i] ?? 0]?.add(table.seatIndex[i] ?? -1);
    }
  }
  return seats.map((set) => Int16Array.from([...set].toSorted((a, b) => a - b)));
}

/**
 * Plans the synth messages after a change of the seat audibility flags while the song plays
 * (design 6.5, 6.6). A held note of a silent seat ends at once. A held note of an audible seat
 * that does not sound starts again by the rule of {@link restartNotes}.
 *
 * The synth ends the notes of a key oldest first, and a new note becomes the newest. When seats
 * share a key of a channel, the plan thus can end and start again a note of an audible seat, so
 * that the order of the synth stays the order of the events.
 *
 * @param table The events.
 * @param cursor The index of the next event to send.
 * @param seatsOfChannels The seats of each channel, from {@link channelSeats}. Its length is the
 *   number of synth channels.
 * @param sounding 1 for each note on that the synth plays now.
 * @param silent 1 for each silent seat, by seat index.
 * @param silenced The seats whose flag became silent since the last plan. A seat that is
 *   audible again has no effect.
 * @returns The note ons to end and to send, and the channels to stop and to release.
 */
export function audibilityPlan(
  table: SynthEventTable,
  cursor: number,
  seatsOfChannels: readonly Int16Array[],
  sounding: Uint8Array,
  silent: Uint8Array,
  silenced: readonly number[],
): AudibilityPlan {
  const channelCount = seatsOfChannels.length;
  const restart = new Set(restartNotes(table, cursor, channelCount, silent));
  const byKey = new Map<number, number[]>();
  for (const index of heldNotes(table, cursor)) {
    const key = noteKey(table, index);
    const notes = byKey.get(key);
    if (notes) {
      notes.push(index);
    } else {
      byKey.set(key, [index]);
    }
  }
  const stopChannels = silentChannels(seatsOfChannels, silent);
  const ends: number[] = [];
  const starts: number[] = [];
  for (const notes of byKey.values()) {
    const now = notes.filter((index) => sounding[index] === 1);
    const wanted = notes.filter(
      (index) => !isSilent(table, index, silent) && (sounding[index] === 1 || restart.has(index)),
    );
    // End the fewest oldest notes, so that the notes that stay are the first wanted notes.
    let ended = 0;
    while (now.slice(ended).some((index, i) => wanted[i] !== index)) {
      ended += 1;
    }
    ends.push(...now.slice(0, ended));
    starts.push(...wanted.slice(now.length - ended));
  }
  return {
    ends: Int32Array.from(ends),
    starts: Int32Array.from(starts.toSorted((a, b) => a - b)),
    stopChannels,
    releaseChannels: Int32Array.from(
      seatsOfChannels.flatMap((seats, channel) =>
        !stopChannels.includes(channel) &&
        silenced.some((seat) => silent[seat] === 1 && seats.includes(seat))
          ? [channel]
          : [],
      ),
    ),
  };
}

/**
 * Finds the channels that have notes, all of them of silent seats.
 *
 * @param seatsOfChannels The seats of each channel, from {@link channelSeats}.
 * @param silent 1 for each silent seat, by seat index.
 * @returns The channels, in ascending order.
 */
function silentChannels(seatsOfChannels: readonly Int16Array[], silent: Uint8Array): Int32Array {
  const channels: number[] = [];
  seatsOfChannels.forEach((seats, channel) => {
    if (seats.length > 0 && seats.every((seat) => silent[seat] === 1)) {
      channels.push(channel);
    }
  });
  return Int32Array.from(channels);
}

/**
 * Decides if the processor sends an event, and keeps the sounding flag of each note on. A note
 * on of a silent seat is not sent (design 6.6). A note end is sent only if its note on sounds.
 * Else it would end a later note on the same key, because the synth pairs note ends first in,
 * first out. The function changes `sounding` in place.
 *
 * @param table The events.
 * @param index The event index.
 * @param pairs The note on of each note end, from {@link notePairs}.
 * @param sounding 1 for each note on that the synth plays now.
 * @param silent 1 for each silent seat, by seat index.
 * @returns True if the processor sends the event.
 */
export function takeEvent(
  table: SynthEventTable,
  index: number,
  pairs: Int32Array,
  sounding: Uint8Array,
  silent: Uint8Array,
): boolean {
  if (isNoteEnd(table, index)) {
    const on = pairs[index] ?? -1;
    if (on < 0) {
      return true;
    }
    if (sounding[on] === 1) {
      sounding[on] = 0;
      return true;
    }
    return false;
  }
  if (table.kind[index] === NOTE_ON) {
    if (isSilent(table, index, silent)) {
      return false;
    }
    sounding[index] = 1;
  }
  return true;
}
