/** Loop points in sample frames. The end is the first frame after the loop. */
interface LoopPoints {
  readonly start: number;
  readonly end: number;
}

/** A sample after the cut, ready for the encoder. */
export interface CutSample {
  /** The mono samples. */
  readonly data: Float32Array;
  /** The loop, or undefined for a sample that plays one time. */
  readonly loop: LoopPoints | undefined;
  /**
   * The volume envelope of a decaying sample with a tail loop: the hold time until the tail starts,
   * and the decay rate after it. Undefined for a sample that keeps its level.
   */
  readonly tail: TailEnvelope | undefined;
}

/** The volume envelope that continues the natural decay of a sound after its tail loop starts. */
interface TailEnvelope {
  /** The time from the note start to the start of the decay, in seconds. */
  readonly holdSec: number;
  /** The decay rate in dB for each second. */
  readonly decayDbPerSec: number;
}

/** The settings of a cut that loops a sustained sound. */
interface SustainCutOptions {
  /** The length of the loop in seconds. */
  readonly loopSec: number;
  /** The length of the crossfade at the loop end in seconds. */
  readonly crossfadeSec: number;
  /** The level below the steady level at which the sample starts, in dB, such as -15. */
  readonly startDb: number;
}

/** The settings of a cut of a decaying sound, such as a piano note or a drum hit. */
interface DecayCutOptions {
  /** The level below the peak at which the sound ends, in dB, such as -50. */
  readonly floorDb: number;
  /** The longest sample in seconds. */
  readonly maxSec: number;
  /**
   * The length of a tail loop in seconds. With a tail loop, a sound that is longer than `maxSec`
   * loops its last part, and the volume envelope continues its decay. With 0, such a sound fades
   * out at `maxSec`.
   */
  readonly tailLoopSec: number;
}

/** The length of one window of the level envelope, in seconds. */
const ENVELOPE_SEC = 0.01;

/** The slowest decay of a tail loop, in dB for each second. */
const MIN_DECAY_DB_PER_SEC = 2;

/** The number of frames after the loop end that repeat the loop start, for the interpolation. */
const LOOP_GUARD_FRAMES = 8;

/**
 * Mixes the channels of a sound to one channel.
 *
 * @param channels The samples of each channel, all of the same length.
 * @returns The mean of the channels.
 */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) {
    throw new Error('The sound has no channel.');
  }
  const mono = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) {
      mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / channels.length;
    }
  }
  return mono;
}

/**
 * Removes the DC offset with a first-order high-pass filter at about 3 Hz.
 *
 * @param data The samples. The function changes them in place.
 * @param sampleRate The sample rate in Hz.
 */
export function removeDc(data: Float32Array, sampleRate: number): void {
  const pole = 1 - (2 * Math.PI * 3) / sampleRate;
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < data.length; i++) {
    const input = data[i] ?? 0;
    const output = input - previousIn + pole * previousOut;
    previousIn = input;
    previousOut = output;
    data[i] = output;
  }
}

/**
 * Calculates the RMS level of each window of {@link ENVELOPE_SEC}.
 *
 * @param data The samples.
 * @param sampleRate The sample rate in Hz.
 * @returns The RMS of each full or partial window.
 */
export function levelEnvelope(data: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(ENVELOPE_SEC * sampleRate));
  const envelope = new Float32Array(Math.ceil(data.length / hop));
  for (let window = 0; window < envelope.length; window++) {
    let sum = 0;
    const end = Math.min(data.length, (window + 1) * hop);
    for (let i = window * hop; i < end; i++) {
      sum += (data[i] ?? 0) ** 2;
    }
    envelope[window] = Math.sqrt(sum / (end - window * hop));
  }
  return envelope;
}

function decibels(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-9));
}

function median(values: Float32Array): number {
  const sorted = Float32Array.from(values).toSorted();
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Finds the onset of a sound: the first window within `thresholdDb` of the loudest window, less a
 * pre-roll of 2 ms.
 *
 * @param data The samples.
 * @param sampleRate The sample rate in Hz.
 * @param thresholdDb The level below the peak window, such as -45.
 * @returns The frame of the onset.
 */
export function onsetFrame(data: Float32Array, sampleRate: number, thresholdDb: number): number {
  const envelope = levelEnvelope(data, sampleRate);
  const limit = Math.max(...envelope) * 10 ** (thresholdDb / 20);
  const window = envelope.findIndex((value) => value >= limit);
  const hop = Math.round(ENVELOPE_SEC * sampleRate);
  // The level of the first window that reaches the limit can come from its last frames.
  const frameInWindow = data
    .subarray(window * hop, (window + 1) * hop)
    .findIndex((value) => Math.abs(value) >= limit);
  return Math.max(0, window * hop + Math.max(0, frameInWindow) - Math.round(0.002 * sampleRate));
}

/** Normalized cross-correlation of two windows of the same length. */
function correlation(data: Float32Array, a: number, b: number, length: number): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < length; i++) {
    const x = data[a + i] ?? 0;
    const y = data[b + i] ?? 0;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/**
 * Blends the frames before the loop end with the frames before the loop start, so that the
 * jump from the loop end to the loop start has no click. The gains keep the power of the blend
 * for any correlation of the two parts.
 */
function crossfade(data: Float32Array, loop: LoopPoints, length: number): void {
  const fadeStart = loop.end - length;
  const sourceStart = loop.start - length;
  const shared = Math.max(0, correlation(data, fadeStart, sourceStart, length));
  for (let i = 0; i < length; i++) {
    const fadeIn = (i + 0.5) / length;
    const fadeOut = 1 - fadeIn;
    const norm = Math.sqrt(fadeIn ** 2 + fadeOut ** 2 + 2 * shared * fadeIn * fadeOut);
    const out = data[fadeStart + i] ?? 0;
    const into = data[sourceStart + i] ?? 0;
    data[fadeStart + i] = (out * fadeOut + into * fadeIn) / norm;
  }
}

/**
 * Moves a loop end by up to one period, to the place where the waveform before it best matches
 * the waveform before the loop start.
 */
function alignLoopEnd(data: Float32Array, start: number, end: number, period: number): number {
  const window = Math.max(Math.round(2 * period), 64);
  const range = Math.max(1, Math.round(period));
  let best = end;
  let bestScore = -Infinity;
  for (let candidate = end - range; candidate <= end + range; candidate++) {
    if (candidate - window < 0 || candidate > data.length) {
      continue;
    }
    const score = correlation(data, candidate - window, start - window, window);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Returns the samples up to the loop end, plus a guard that repeats the loop start. */
function withGuard(data: Float32Array, loop: LoopPoints): Float32Array {
  const out = new Float32Array(loop.end + LOOP_GUARD_FRAMES);
  out.set(data.subarray(0, loop.end));
  for (let i = 0; i < LOOP_GUARD_FRAMES; i++) {
    out[loop.end + i] = data[loop.start + i] ?? 0;
  }
  return out;
}

/** Smooths an envelope with a centered mean of the power over `width` windows. */
function smoothEnvelope(envelope: Float32Array, width: number): Float32Array {
  const out = new Float32Array(envelope.length);
  const half = Math.floor(width / 2);
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(envelope.length - 1, i + half); j++) {
      sum += (envelope[j] ?? 0) ** 2;
      count++;
    }
    out[i] = Math.sqrt(sum / count);
  }
  return out;
}

/**
 * Cuts a sustained sound, such as a bowed or a blown note, to its attack and one loop.
 *
 * The steady level is the median of a 100 ms envelope. The sample starts where this envelope
 * first reaches `startDb` below the steady level, so that a slow swell does not delay the note.
 * The loop starts after the attack, when the level is within 4 dB of the steady level, and it
 * ends before the release, the first point 12 dB below the steady level. The end of the loop
 * moves by up to one period to match the waveform at the loop start, and a crossfade hides the
 * jump.
 *
 * @param data The samples from the onset. The function does not change them.
 * @param sampleRate The sample rate in Hz.
 * @param pitchHz The fundamental frequency of the note.
 * @param options The loop and crossfade lengths, and the start level.
 * @returns The cut sample with its loop.
 * @throws Error if the sound is too short for a loop of 0.2 s.
 */
export function cutSustain(
  data: Float32Array,
  sampleRate: number,
  pitchHz: number,
  options: SustainCutOptions,
): CutSample {
  const hop = Math.round(ENVELOPE_SEC * sampleRate);
  const smooth = smoothEnvelope(levelEnvelope(data, sampleRate), Math.round(0.1 / ENVELOPE_SEC));
  const from = Math.min(smooth.length - 1, Math.round(0.3 / ENVELOPE_SEC));
  const to = Math.max(from + 1, smooth.length - Math.round(0.5 / ENVELOPE_SEC));
  const steady = median(smooth.subarray(from, to));
  const level = (db: number): number => steady * 10 ** (db / 20);
  const startWindow = Math.max(
    0,
    smooth.findIndex((value) => value >= level(options.startDb)),
  );
  const attackEnd = Math.max(
    startWindow,
    smooth.findIndex((value) => value >= level(-4)),
  );
  const releaseWindow = smooth.findIndex((value, index) => index > attackEnd && value < level(-12));
  const head = Math.max(0, startWindow * hop - Math.round(0.01 * sampleRate));
  const releaseFrame = (releaseWindow < 0 ? data.length : releaseWindow * hop) - head;
  const copy = data.slice(head);
  const fadeIn = head > 0 ? Math.min(copy.length, Math.round(0.01 * sampleRate)) : 0;
  for (let i = 0; i < fadeIn; i++) {
    copy[i] = (copy[i] ?? 0) * (i / fadeIn);
  }
  const fade = Math.round(options.crossfadeSec * sampleRate);
  const start = attackEnd * hop - head + fade;
  const length = Math.min(Math.round(options.loopSec * sampleRate), releaseFrame - start - hop);
  if (length < 0.2 * sampleRate) {
    throw new Error(`The sound is too short for a loop: ${data.length / sampleRate} s.`);
  }
  const end = alignLoopEnd(copy, start, start + length, sampleRate / pitchHz);
  const loop = { start, end };
  crossfade(copy, loop, Math.min(fade, end - start));
  return { data: withGuard(copy, loop), loop, tail: undefined };
}

/** Fits a line to the level in dB of the windows of a range, and returns its slope in dB/s. */
function decaySlope(envelope: Float32Array, from: number, to: number): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = Math.max(0, from); i < Math.min(envelope.length, to); i++) {
    const x = i * ENVELOPE_SEC;
    const y = decibels(envelope[i] ?? 0);
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return Number.isFinite(slope) ? slope : 0;
}

/**
 * Cuts a decaying sound, such as a piano note, a harp string, or a drum hit. A sound that reaches
 * `floorDb` below its peak before `maxSec` ends there, with a short fade. A longer sound either
 * fades out at `maxSec`, or, with a tail loop, loops its last part at a flat level while the
 * volume envelope continues the decay. The decay rate comes from a line fit to the level of the
 * second half of the kept sound, and it is at least {@link MIN_DECAY_DB_PER_SEC}.
 *
 * @param data The samples from the onset. The function does not change them.
 * @param sampleRate The sample rate in Hz.
 * @param pitchHz The fundamental frequency, or 0 for a sound with no clear pitch.
 * @param options The floor, the longest length, and the tail loop length.
 * @returns The cut sample.
 */
export function cutDecay(
  data: Float32Array,
  sampleRate: number,
  pitchHz: number,
  options: DecayCutOptions,
): CutSample {
  const envelope = levelEnvelope(data, sampleRate);
  const hop = Math.round(ENVELOPE_SEC * sampleRate);
  const peak = Math.max(...envelope);
  const limit = peak * 10 ** (options.floorDb / 20);
  let last = envelope.length - 1;
  while (last > 0 && (envelope[last] ?? 0) < limit) {
    last--;
  }
  const floorFrame = Math.min(data.length, (last + 1) * hop);
  const maxFrame = Math.round(options.maxSec * sampleRate);
  if (floorFrame <= maxFrame || options.tailLoopSec <= 0) {
    const length = Math.min(floorFrame, maxFrame, data.length);
    const out = data.slice(0, length);
    const fadeLength = Math.min(length, Math.max(Math.round(0.05 * sampleRate), length * 0.25));
    for (let i = 0; i < fadeLength; i++) {
      out[length - 1 - i] =
        (out[length - 1 - i] ?? 0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / fadeLength));
    }
    return { data: out, loop: undefined, tail: undefined };
  }
  // The tail: measure the decay, flatten the level from the start of the crossfade source, and
  // loop the end.
  const loopLength = Math.round(options.tailLoopSec * sampleRate);
  const fade = Math.round(loopLength / 2);
  const flatStart = maxFrame - loopLength - fade;
  // The fit covers the second half of the kept sound, so that the beats of a piano string do not
  // hide the decay. A decay of at least 2 dB/s ends each note in less than 50 s.
  const fitted = decaySlope(envelope, Math.round(maxFrame / 2 / hop), Math.round(maxFrame / hop));
  const slope = Math.min(-MIN_DECAY_DB_PER_SEC, fitted);
  const copy = data.slice(0, maxFrame);
  for (let i = flatStart; i < maxFrame; i++) {
    copy[i] = (copy[i] ?? 0) * 10 ** ((-slope * (i - flatStart)) / sampleRate / 20);
  }
  const start = maxFrame - loopLength;
  const end = pitchHz > 0 ? alignLoopEnd(copy, start, maxFrame, sampleRate / pitchHz) : maxFrame;
  const loop = { start, end: Math.min(end, maxFrame) };
  crossfade(copy, loop, Math.min(fade, loop.end - loop.start));
  return {
    data: withGuard(copy, loop),
    loop,
    tail: { holdSec: flatStart / sampleRate, decayDbPerSec: -slope },
  };
}

/** A pitch estimate. */
interface PitchEstimate {
  /** The deviation from the expected pitch in cents. */
  readonly cents: number;
  /** The normalized autocorrelation at the found period, from -1 to 1. */
  readonly confidence: number;
}

/**
 * Estimates the pitch of a window of a sound near an expected frequency, with the normalized
 * autocorrelation over periods within 100 cents of the expected period, and a parabolic
 * refinement of the best period.
 *
 * @param data The samples.
 * @param sampleRate The sample rate in Hz.
 * @param expectedHz The expected fundamental frequency.
 * @param from The first frame of the window.
 * @param to The end of the window. The window must leave one period after it.
 * @returns The deviation and the confidence.
 */
export function estimatePitch(
  data: Float32Array,
  sampleRate: number,
  expectedHz: number,
  from: number,
  to: number,
): PitchEstimate {
  const shortest = Math.floor(sampleRate / (expectedHz * 2 ** (100 / 1200)));
  const longest = Math.ceil(sampleRate / (expectedHz * 2 ** (-100 / 1200)));
  const length = Math.min(to, data.length - longest - 1) - from;
  if (length <= 0) {
    return { cents: 0, confidence: 0 };
  }
  const score = (lag: number): number => correlation(data, from, from + lag, length);
  let bestLag = shortest;
  let best = -Infinity;
  for (let lag = shortest; lag <= longest; lag++) {
    const value = score(lag);
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }
  const before = score(bestLag - 1);
  const after = score(bestLag + 1);
  const curve = before - 2 * best + after;
  const shift = curve < 0 ? (before - after) / (2 * curve) : 0;
  const hz = sampleRate / (bestLag + shift);
  return { cents: 1200 * Math.log2(hz / expectedHz), confidence: best };
}
