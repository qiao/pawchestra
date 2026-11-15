import type { Score, SynthEvent } from '../score/types.ts';
import { clamp01 } from '../math.ts';

/** The controllers that set the loudness of a gesture (design 5.3). */
const VOLUME = 7;
const EXPRESSION = 11;
/** "Reset all controllers" sets the expression back to 127. The volume stays. */
const RESET_ALL = 121;

/** The values of a channel before its first control change, as in General MIDI. */
const DEFAULT_VOLUME = 100;
const DEFAULT_EXPRESSION = 127;

/** The changes of one controller on one synth channel, sorted by time. */
interface ControllerTrack {
  readonly times: number[];
  readonly values: number[];
}

/**
 * Finds the value of a controller at a time.
 *
 * @param track The changes of the controller.
 * @param time The song time, in seconds.
 * @param fallback The value before the first change.
 * @returns The value of the last change at or before the time.
 */
function valueAt(track: ControllerTrack | undefined, time: number, fallback: number): number {
  if (!track) {
    return fallback;
  }
  let low = 0;
  let high = track.times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((track.times[mid] ?? 0) <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low === 0 ? fallback : (track.values[low - 1] ?? fallback);
}

/**
 * Adds a change to the track of a channel.
 *
 * @param tracks The tracks, by synth channel.
 * @param event The control change.
 * @param value The new value.
 */
function push(tracks: Map<number, ControllerTrack>, event: SynthEvent, value: number): void {
  let track = tracks.get(event.channel);
  if (!track) {
    track = { times: [], values: [] };
    tracks.set(event.channel, track);
  }
  track.times.push(event.timeSec);
  track.values.push(value);
}

/**
 * Calculates the loudness of one note: the velocity, multiplied by CC 7 (volume) and CC 11
 * (expression), each as a part of 127 (design 5.3).
 *
 * @param velocity The velocity of the note, 1 to 127.
 * @param volume The value of CC 7 at the note start. 100 by default, as in General MIDI.
 * @param expression The value of CC 11 at the note start. 127 by default.
 * @returns The loudness, from 0 to 1.
 */
export function loudnessOf(
  velocity: number,
  volume = DEFAULT_VOLUME,
  expression = DEFAULT_EXPRESSION,
): number {
  return (velocity / 127) * (volume / 127) * (expression / 127);
}

/**
 * Calculates the loudness of each player note: the velocity, multiplied by CC 7 (volume) and
 * CC 11 (expression), each as a part of 127 (design 5.3). The size of a gesture follows it. The
 * controllers have their values at the start of the note on the synth channel of the note.
 *
 * @param score The score.
 * @returns One value in [0, 1] for each entry of `score.notes`.
 */
export function noteLoudness(score: Score): Float32Array {
  const volume = new Map<number, ControllerTrack>();
  const expression = new Map<number, ControllerTrack>();
  for (const event of score.synthEvents) {
    if (event.kind !== 0xb0) {
      continue;
    }
    if (event.data1 === VOLUME) {
      push(volume, event, event.data2);
    } else if (event.data1 === EXPRESSION) {
      push(expression, event, event.data2);
    } else if (event.data1 === RESET_ALL) {
      push(expression, event, DEFAULT_EXPRESSION);
    }
  }

  const out = new Float32Array(score.notes.length);
  for (const [i, note] of score.notes.entries()) {
    const channel = note.synthChannel;
    const cc7 = valueAt(volume.get(channel), note.startSec, DEFAULT_VOLUME);
    const cc11 = valueAt(expression.get(channel), note.startSec, DEFAULT_EXPRESSION);
    out[i] = loudnessOf(note.velocity, cc7, cc11);
  }
  return out;
}

/**
 * Calculates the size of a gesture: `(0.6 + 0.6 × loudness) × amplitude` (design 5.1, 5.3). A
 * soft note gives a small gesture, and a loud note a large one.
 *
 * @param loudness The loudness of the note or the passage, from 0 to 1.
 * @param amplitude The seeded amplitude of the player, near 1.
 * @returns The gesture size, 1 for a loudness of 2/3 and an amplitude of 1.
 */
export function gestureSize(loudness: number, amplitude: number): number {
  return (0.6 + 0.6 * clamp01(loudness)) * amplitude;
}
