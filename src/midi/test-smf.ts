import { parseMidi } from './parse.ts';
import type { MidiFile } from './types.ts';

/**
 * One event of a test track: the tick from the start of the track, and the bytes of the event
 * with no delta time. A channel message with no status byte uses running status.
 */
export interface TestEvent {
  readonly tick: number;
  readonly bytes: readonly number[];
}

/** A Standard MIDI File that a test describes as events. */
export interface TestFile {
  /** The default is 0 for one track and 1 for more tracks. */
  readonly format?: number;
  /** The default is 480. */
  readonly ticksPerQuarter?: number;
  /** Events in the order of the file. The ticks must not decrease. */
  readonly tracks: readonly (readonly TestEvent[])[];
  /**
   * Leaves out the status byte of a channel message that has the status of the message before
   * it. A meta event or a SysEx event clears the running status, as the SMF specification
   * says.
   */
  readonly runningStatus?: boolean;
}

const TEXT = new TextEncoder();

/**
 * Parses a test file with the real parser.
 *
 * @param file The file as events.
 * @returns The parsed file.
 * @throws Error if `parseMidi()` refuses the file.
 */
export function parseTestFile(file: TestFile): MidiFile {
  const result = parseMidi(writeSmf(file));
  if (!result.ok) {
    throw new Error(`The test file was refused: ${result.error}.`);
  }
  return result.file;
}

/**
 * Writes the bytes of a Standard MIDI File. Only the tests and the test page (design 7.1) use this
 * function, so it does not enter the first download. Each track gets an end of track event at its
 * last tick, unless its last event is one.
 *
 * @param file The file as events.
 * @returns The bytes of the file.
 * @throws Error if the ticks of a track decrease.
 */
export function writeSmf(file: TestFile): Uint8Array<ArrayBuffer> {
  const ticksPerQuarter = file.ticksPerQuarter ?? 480;
  const format = file.format ?? (file.tracks.length > 1 ? 1 : 0);
  const out = [
    ...TEXT.encode('MThd'),
    ...uint32(6),
    ...uint16(format),
    ...uint16(file.tracks.length),
    ...uint16(ticksPerQuarter),
  ];
  for (const events of file.tracks) {
    const data = trackData(events, file.runningStatus ?? false);
    // A loop, because a spread of a large track exceeds the argument limit of push().
    for (const byte of [...TEXT.encode('MTrk'), ...uint32(data.length), ...data]) {
      out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

function trackData(events: readonly TestEvent[], runningStatus: boolean): number[] {
  const last = events.at(-1);
  const ended = last?.bytes[0] === 0xff && last.bytes[1] === 0x2f;
  const all = ended ? events : [...events, endOfTrack(last?.tick ?? 0)];
  const out: number[] = [];
  let tick = 0;
  let status = -1;
  for (const event of all) {
    if (event.tick < tick) {
      throw new Error(`Test event at tick ${event.tick} comes after tick ${tick}.`);
    }
    out.push(...variableLength(event.tick - tick));
    tick = event.tick;
    const first = event.bytes[0] ?? 0;
    if (first >= 0xf0) {
      status = -1;
    }
    const repeated = runningStatus && first === status;
    out.push(...(repeated ? event.bytes.slice(1) : event.bytes));
    if (first >= 0x80 && first < 0xf0) {
      status = first;
    }
  }
  return out;
}

/**
 * Encodes a number as a variable-length quantity of the SMF specification.
 *
 * @param value 0 to 0x0fffffff.
 * @returns 1 to 4 bytes, with the high bit set on each byte except the last.
 */
export function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function meta(tick: number, type: number, data: readonly number[]): TestEvent {
  return { tick, bytes: [0xff, type, ...variableLength(data.length), ...data] };
}

/**
 * Makes a note on.
 *
 * @param tick The tick.
 * @param channel 0 to 15.
 * @param pitch The key, 0 to 127.
 * @param velocity 0 to 127. 0 is a note off (design 3.3).
 * @returns The event.
 */
export function noteOn(tick: number, channel: number, pitch: number, velocity = 100): TestEvent {
  return { tick, bytes: [0x90 | channel, pitch, velocity] };
}

/**
 * Makes a note off.
 *
 * @param tick The tick.
 * @param channel 0 to 15.
 * @param pitch The key, 0 to 127.
 * @returns The event, with the release velocity 64.
 */
export function noteOff(tick: number, channel: number, pitch: number): TestEvent {
  return { tick, bytes: [0x80 | channel, pitch, 64] };
}

/**
 * Makes one note: a note on and its note off.
 *
 * @param tick The tick of the note on.
 * @param channel 0 to 15.
 * @param pitch The key, 0 to 127.
 * @param end The tick of the note off. The default is one quarter note (480 ticks) later.
 * @returns The two events.
 */
export function note(tick: number, channel: number, pitch: number, end = tick + 480): TestEvent[] {
  return [noteOn(tick, channel, pitch), noteOff(end, channel, pitch)];
}

/**
 * Makes a chord: the note ons of all keys, then their note offs.
 *
 * @param tick The tick of the note ons.
 * @param channel 0 to 15.
 * @param keys The keys, 0 to 127.
 * @param end The tick of the note offs. The default is one quarter note (480 ticks) later.
 * @returns The events.
 */
export function chord(
  tick: number,
  channel: number,
  keys: readonly number[],
  end = tick + 480,
): TestEvent[] {
  return [
    ...keys.map((key) => noteOn(tick, channel, key)),
    ...keys.map((key) => noteOff(end, channel, key)),
  ];
}

/**
 * Joins lists of events into one track, sorted by tick with a stable sort.
 *
 * @param lists The lists of events.
 * @returns The events of the track.
 */
export function track(...lists: readonly (readonly TestEvent[])[]): TestEvent[] {
  return lists.flat().toSorted((a, b) => a.tick - b.tick);
}

/**
 * Makes a program change.
 *
 * @param tick The tick.
 * @param channel 0 to 15.
 * @param program 0 to 127. On a rhythm channel, the drum kit.
 * @returns The event.
 */
export function programChange(tick: number, channel: number, program: number): TestEvent {
  return { tick, bytes: [0xc0 | channel, program] };
}

/**
 * Makes a control change.
 *
 * @param tick The tick.
 * @param channel 0 to 15.
 * @param controller 0 to 127. 0 is bank select.
 * @param value 0 to 127.
 * @returns The event.
 */
export function controlChange(
  tick: number,
  channel: number,
  controller: number,
  value: number,
): TestEvent {
  return { tick, bytes: [0xb0 | channel, controller, value] };
}

/**
 * Makes a tempo event (FF 51).
 *
 * @param tick The tick.
 * @param bpm Quarter notes for each minute.
 * @returns The event.
 */
export function tempo(tick: number, bpm: number): TestEvent {
  const micros = Math.round(60_000_000 / bpm);
  return meta(tick, 0x51, [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]);
}

/**
 * Makes a time signature event (FF 58).
 *
 * @param tick The tick.
 * @param numerator The beats in a bar.
 * @param denominator The beat unit, a power of 2.
 * @returns The event, with 24 MIDI clocks for each click and 8 32nd notes for each quarter.
 */
export function timeSignature(tick: number, numerator: number, denominator: number): TestEvent {
  return meta(tick, 0x58, [numerator, Math.log2(denominator), 24, 8]);
}

/**
 * Makes a track name event (FF 03) at tick 0.
 *
 * @param name The name, as UTF-8.
 * @returns The event.
 */
export function trackName(name: string): TestEvent {
  return meta(0, 0x03, [...TEXT.encode(name)]);
}

/**
 * Makes a port event (FF 21) at tick 0.
 *
 * @param value The port number, 0 to 127.
 * @returns The event.
 */
export function port(value: number): TestEvent {
  return meta(0, 0x21, [value]);
}

/**
 * Makes a SysEx event (F0). The data gets the closing F7 byte.
 *
 * @param tick The tick.
 * @param data The bytes after F0, with no F7.
 * @returns The event.
 */
export function sysEx(tick: number, data: readonly number[]): TestEvent {
  return { tick, bytes: [0xf0, ...variableLength(data.length + 1), ...data, 0xf7] };
}

/**
 * Makes an end of track event (FF 2F).
 *
 * @param tick The tick.
 * @returns The event.
 */
export function endOfTrack(tick: number): TestEvent {
  return meta(tick, 0x2f, []);
}
