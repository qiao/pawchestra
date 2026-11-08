import konzerthausFlacUrl from '../../assets/hall/detmold-konzerthaus-r2.flac?url';
import konzerthausWavUrl from '../../assets/hall/detmold-konzerthaus-r2.wav?url';
import stPaulsFlacUrl from '../../assets/hall/st-pauls-hall-c8m.flac?url';
import stPaulsWavUrl from '../../assets/hall/st-pauls-hall-c8m.wav?url';

/**
 * The files of one hall impulse response (design 6.8, `assets/hall/README.md`). The build copies
 * both files into `dist/assets/`. The `Player` fetches the file of its mix preset with the
 * presets, after the first frame.
 */
interface HallImpulse {
  /** The lossless FLAC file, about a third of the size of the WAV file. */
  readonly flacUrl: string;
  /** The same samples as WAV, for a browser whose `decodeAudioData()` refuses the FLAC file. */
  readonly wavUrl: string;
}

/** The impulse response of St Paul's Hall, Huddersfield: T30 about 2.1 s. */
const ST_PAULS_HALL: HallImpulse = { flacUrl: stPaulsFlacUrl, wavUrl: stPaulsWavUrl };

/**
 * The impulse response of the Konzerthaus of Detmold with its enhancement preset "Choir and
 * Orchestra": T30 about 2.7 s.
 */
const KONZERTHAUS: HallImpulse = { flacUrl: konzerthausFlacUrl, wavUrl: konzerthausWavUrl };

/** The settings of a `DynamicsCompressorNode` (design 6.8). */
interface Compressor {
  /** The threshold in dBFS. */
  readonly threshold: number;
  /** The knee in dB. */
  readonly knee: number;
  /** The ratio of the input change to the output change above the threshold. */
  readonly ratio: number;
  /** The time in seconds to reduce the gain by 10 dB. */
  readonly attack: number;
  /** The time in seconds to increase the gain by 10 dB. */
  readonly release: number;
}

/** The gains of the tone EQ on the sum in dB, at the frequencies of {@link TONE_EQ}. */
interface Tone {
  /** The low shelf. */
  readonly lowShelf: number;
  /** The peak in the low mids. */
  readonly lowMid: number;
  /** The peak in the presence band. */
  readonly presence: number;
  /** The high shelf. */
  readonly highShelf: number;
}

/** The settings of the mix bus of one mix preset (design 6.8). */
interface MixBus {
  /** The impulse response of the hall reverb. */
  readonly hall: HallImpulse;
  /** The delay before the convolver, in seconds. */
  readonly preDelay: number;
  /** The cutoffs of the high-pass and the low-pass filters of the reverb return, in Hz. */
  readonly returnBand: readonly [highPass: number, lowPass: number];
  /** The gain of the side signal of the reverb return: 1 keeps the width. */
  readonly returnWidth: number;
  /** The gain of the reverb return. */
  readonly wet: number;
  /** The tone EQ on the sum of the dry path and the reverb return. */
  readonly tone: Tone;
  /** The glue compressor before the limiter. Its knee is 0, so {@link makeupTrimDb} is exact. */
  readonly glue: Compressor;
}

/** The names of the mix presets (design 6.8). */
export type MixName = 'hall' | 'cinematic';

/**
 * The frequencies in Hz and the Q values of the tone EQ (design 6.8). The two mix presets share
 * them, and differ only in the gains.
 */
const TONE_EQ = {
  lowShelf: { frequency: 100 },
  lowMid: { frequency: 300, q: 1 },
  presence: { frequency: 3150, q: 1.4 },
  highShelf: { frequency: 12_000 },
} as const;

/** The mix bus of each mix preset (design 6.8). */
export const MIX_BUSES: Readonly<Record<MixName, MixBus>> = {
  hall: {
    hall: ST_PAULS_HALL,
    preDelay: 0.022,
    returnBand: [150, 8000],
    returnWidth: 1.15,
    wet: 0.07,
    tone: { lowShelf: 1.5, lowMid: -1, presence: -1, highShelf: 1.2 },
    glue: { threshold: -10.5, knee: 0, ratio: 1.5, attack: 0.03, release: 0.3 },
  },
  cinematic: {
    hall: KONZERTHAUS,
    preDelay: 0.03,
    returnBand: [120, 7500],
    returnWidth: 1.4,
    wet: 0.017,
    tone: { lowShelf: 2.5, lowMid: -1.5, presence: -1, highShelf: 1.5 },
    glue: { threshold: -9.5, knee: 0, ratio: 1.8, attack: 0.03, release: 0.3 },
  },
};

/** The gain of the dry path (design 6.8). */
export const DRY_GAIN = 1;

/** The longest pre-delay of a mix bus, in seconds. */
const MAX_PRE_DELAY = 0.1;

/**
 * The settings of the `DynamicsCompressorNode` that limits the peaks (design 6.8): a hard knee at
 * -3 dBFS with the ratio 20, a short attack, and a release of 150 ms. The compressor lets a
 * short peak pass above its threshold. At -3 dBFS, each demo at -16 LUFS keeps its true peak at
 * or below -1 dBTP (`pnpm loudness`).
 */
export const LIMITER: Compressor = {
  threshold: -3,
  knee: 0,
  ratio: 20,
  attack: 0.002,
  release: 0.15,
};

/**
 * Calculates the gain after a compressor with a hard knee, in dB (design 6.8). Web Audio adds a
 * fixed makeup gain of `(1 / g)^0.6` in the compressor, where `g` is the gain of its curve at
 * 0 dBFS. This gain removes it, so the compressor does not change the level below its threshold.
 *
 * @param compressor The settings of the compressor, with the knee 0.
 * @returns The gain in dB: -1.71 dB for {@link LIMITER}.
 */
export function makeupTrimDb(compressor: Compressor): number {
  return 0.6 * compressor.threshold * (1 - 1 / compressor.ratio);
}

/** The gain after the limiter, in dB (design 6.8): {@link makeupTrimDb} of {@link LIMITER}. */
export const LIMITER_TRIM_DB = makeupTrimDb(LIMITER);

/**
 * The time constant of a volume change in seconds (design 6.6, 6.8). A mute falls by 20 dB in
 * 69 ms and by 60 dB in 0.21 s, and an unmute rises with the same curve, with no click.
 */
export const VOLUME_TIME_CONSTANT = 0.03;

/** The Web Audio nodes after the synth (design 6.8). */
export interface OutputChain {
  /** The settings of the chain. */
  readonly bus: MixBus;
  /** The input of the chain. Its gain is the gain of the piece. */
  readonly input: GainNode;
  /** The hall reverb. It is silent until it gets the impulse response. */
  readonly convolver: ConvolverNode;
  /** The gain of the dry path, {@link DRY_GAIN}. */
  readonly dry: GainNode;
  /** The gain of the reverb return, at the end of the return. */
  readonly wet: GainNode;
  /** The last filter of the tone EQ, the input of the glue compressor. */
  readonly tone: BiquadFilterNode;
  /** The glue compressor. */
  readonly glue: DynamicsCompressorNode;
  /** The gain of {@link makeupTrimDb} of the glue, the input of the limiter. */
  readonly glueTrim: GainNode;
  /** The limiter. */
  readonly limiter: DynamicsCompressorNode;
  /** The gain of {@link LIMITER_TRIM_DB}. */
  readonly trim: GainNode;
  /**
   * The gain of the volume slider and the mute button, at the end of the chain. Thus a mute also
   * stops the tail of the hall and of the room of the synth.
   */
  readonly volume: GainNode;
}

/**
 * Makes a filter.
 *
 * @param context The audio context.
 * @param type The type of the filter.
 * @param frequency The frequency in Hz.
 * @param gainDb The gain in dB of a shelf or a peak.
 * @param q The Q value.
 * @returns The filter.
 */
function makeFilter(
  context: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  gainDb = 0,
  q = Math.SQRT1_2,
): BiquadFilterNode {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.gain.value = gainDb;
  node.Q.value = q;
  return node;
}

/**
 * Makes a compressor.
 *
 * @param context The audio context.
 * @param settings The settings.
 * @returns The compressor.
 */
function makeCompressor(context: BaseAudioContext, settings: Compressor): DynamicsCompressorNode {
  const node = context.createDynamicsCompressor();
  node.threshold.value = settings.threshold;
  node.knee.value = settings.knee;
  node.ratio.value = settings.ratio;
  node.attack.value = settings.attack;
  node.release.value = settings.release;
  return node;
}

/**
 * Makes a gain node.
 *
 * @param context The audio context.
 * @param value The gain.
 * @returns The node.
 */
function makeGain(context: BaseAudioContext, value: number): GainNode {
  const node = context.createGain();
  node.gain.value = value;
  return node;
}

/** The mid-side width stage of the reverb return. */
interface WidthStage {
  /** The splitter of the two input channels. */
  readonly input: ChannelSplitterNode;
  /** The merger of the two output channels. */
  readonly output: ChannelMergerNode;
}

/**
 * Makes the mid-side width stage of the reverb return (design 6.8): the side signal gets the
 * gain `width`, and the mid signal does not change. Each output channel is a sum of the two
 * input channels, so four gains and no extra filter do the work.
 *
 * @param context The audio context.
 * @param width The gain of the side signal.
 * @returns The input and the output of the stage.
 */
function widthStage(context: BaseAudioContext, width: number): WidthStage {
  const input = context.createChannelSplitter(2);
  const output = context.createChannelMerger(2);
  // L' = M + w S = L (1 + w) / 2 + R (1 - w) / 2, and R' is the same with L and R swapped.
  const same = (1 + width) / 2;
  const cross = (1 - width) / 2;
  for (const [from, to, value] of [
    [0, 0, same],
    [1, 0, cross],
    [1, 1, same],
    [0, 1, cross],
  ] as const) {
    const gain = makeGain(context, value);
    input.connect(gain, from);
    gain.connect(output, 0, to);
  }
  return { input, output };
}

/**
 * Makes the output chain of the synth (design 6.8). The input gain goes to a dry path and to the
 * hall reverb. The reverb return has a pre-delay, a band filter, and a width stage. The sum of
 * both goes through the tone EQ, the glue compressor and its trim, the limiter and its trim, and
 * the volume gain to the destination.
 *
 * @param context The audio context.
 * @param bus The settings of the mix bus.
 * @returns The nodes of the chain, connected.
 */
export function createOutputChain(context: BaseAudioContext, bus: MixBus): OutputChain {
  const input = context.createGain();
  const dry = makeGain(context, DRY_GAIN);
  const preDelay = context.createDelay(MAX_PRE_DELAY);
  preDelay.delayTime.value = bus.preDelay;
  const convolver = context.createConvolver();
  // The wet gain sets the level, so the browser does not scale the impulse response.
  convolver.normalize = false;
  const [highPass, lowPass] = bus.returnBand;
  const returnHighPass = makeFilter(context, 'highpass', highPass);
  const returnLowPass = makeFilter(context, 'lowpass', lowPass);
  const width = widthStage(context, bus.returnWidth);
  const wet = makeGain(context, bus.wet);
  const sum = context.createGain();
  const toneFilters = [
    makeFilter(context, 'lowshelf', TONE_EQ.lowShelf.frequency, bus.tone.lowShelf),
    makeFilter(context, 'peaking', TONE_EQ.lowMid.frequency, bus.tone.lowMid, TONE_EQ.lowMid.q),
    makeFilter(
      context,
      'peaking',
      TONE_EQ.presence.frequency,
      bus.tone.presence,
      TONE_EQ.presence.q,
    ),
    makeFilter(context, 'highshelf', TONE_EQ.highShelf.frequency, bus.tone.highShelf),
  ] as const;
  const glue = makeCompressor(context, bus.glue);
  const glueTrim = makeGain(context, gainOfDb(makeupTrimDb(bus.glue)));
  const limiter = makeCompressor(context, LIMITER);
  const trim = makeGain(context, gainOfDb(LIMITER_TRIM_DB));
  const volume = context.createGain();

  input.connect(dry);
  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(returnHighPass);
  returnHighPass.connect(returnLowPass);
  returnLowPass.connect(width.input);
  width.output.connect(wet);
  dry.connect(sum);
  wet.connect(sum);
  let last: AudioNode = sum;
  for (const node of toneFilters) {
    last.connect(node);
    last = node;
  }
  const tone = toneFilters[3];
  tone.connect(glue);
  glue.connect(glueTrim);
  glueTrim.connect(limiter);
  limiter.connect(trim);
  trim.connect(volume);
  volume.connect(context.destination);
  return { bus, input, convolver, dry, wet, tone, glue, glueTrim, limiter, trim, volume };
}

/**
 * Moves the volume gain of the chain to a new value, with the time constant
 * {@link VOLUME_TIME_CONSTANT} from the current context time (design 6.6, 6.8).
 *
 * @param chain The output chain.
 * @param gain The new gain, 0 for a mute.
 */
export function setOutputVolume(chain: OutputChain, gain: number): void {
  chain.volume.gain.setTargetAtTime(gain, chain.volume.context.currentTime, VOLUME_TIME_CONSTANT);
}

/**
 * Converts a level in decibels to a gain.
 *
 * @param db The level in dB.
 * @returns The gain: 1 for 0 dB.
 */
export function gainOfDb(db: number): number {
  return 10 ** (db / 20);
}
