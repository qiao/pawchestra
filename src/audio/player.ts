import { channelGainsDb, mixSynthEvents } from '../score/stage-mix.ts';
import type { ChannelMix } from '../score/stage-mix.ts';
import type { Score } from '../score/types.ts';
import {
  addScoreAnchor,
  chooseHeardTime,
  heardTimeFromLatency,
  heardTimeFromTimestamp,
  songTimeAt,
} from './clock.ts';
import type { ClockAnchor } from './clock.ts';
import type { DecodeReply, DecodeRequest } from './decode-messages.ts';
import type { EngineBank } from './engine.ts';
import { fetchOk } from './fetch-ok.ts';
import { MIX_BUSES, createOutputChain, gainOfDb, setOutputVolume } from './output-chain.ts';
import type { MixName, OutputChain } from './output-chain.ts';
import { INDEX_FILE, resolvePresetFiles } from './preset-index.ts';
import type { PresetFileEntry } from './preset-index.ts';
import { PROCESSOR_NAME } from './processor-messages.ts';
import type { ProcessorCommand, ProcessorReply } from './processor-messages.ts';
import processorUrl from './processor.ts?worker&url';
import { packSynthEvents, tableBuffers } from './synth-events.ts';
import { SOUNDFONT_HEADROOM_DB } from './soundfont-info.ts';

/** The fields of the `Score` that the audio needs, and the mix of the piece (design 3.2, 6.8). */
export interface PlayerScore extends Pick<Score, 'durationSec' | 'synthEvents' | 'presets'> {
  /**
   * The pan, the reverb send, and the gain of each synth channel, from `stageMix()` with the
   * layout of the score (design 6.1). They replace the pan and the reverb send of the file.
   */
  readonly mix: readonly ChannelMix[];
  /**
   * The gain of the piece in dB, from `pieceGainDb()`: it brings a demo to the loudness of the
   * others, and it is 0 for a file of the user (design 6.8).
   */
  readonly gainDb: number;
}

/** The progress of the load of the presets of a score (design 2.8, 6.3). */
export interface LoadProgress {
  /** The preset files that are ready. */
  readonly done: number;
  /** The preset files that the load fetches: only the presets that the synth does not have. */
  readonly total: number;
  /** The bytes of these files that arrived. */
  readonly bytes: number;
  /** The sum of the sizes of these files, from `sf/index.json`. */
  readonly totalBytes: number;
}

/** The function that gets the progress of a load. */
type ProgressListener = (progress: LoadProgress) => void;

/**
 * The audio interface of the app (design 6.8).
 *
 * The player keeps the last rate, and sends it with each score. The volume is a gain node of the
 * output chain, so it stays the same over loads and failures. After the decode, a load posts its
 * score and its banks in one task. A play, a pause, a seek, or a seat flag before this task acts
 * on the old score, and the new score resets the transport and the flags. At the first load, it
 * has no effect. Such a command after this task acts on the new score, also before `load()`
 * resolves. Each new score starts with all seats audible (design 6.6, 6.8).
 */
export interface Player {
  /**
   * Loads the engine on the first call, then the presets of the score. After a failure, the next
   * call starts a new engine. A later call replaces a pending call, and the promise of the earlier
   * call rejects with a {@link LoadReplacedError}. The progress starts at 0 when the list of the
   * preset files is known, and follows the bytes that arrive.
   */
  load(score: PlayerScore, onProgress: ProgressListener): Promise<void>;
  /**
   * Plays from the start point: the pause point, or 0 at the song end (design 6.5). The song time
   * starts one count-in before the start point, and the first sound comes at the start point.
   *
   * @param countInSec The count-in in song seconds, 0 or more.
   */
  play(countInSec: number): void;
  pause(): void;
  seek(songSec: number): void;
  setRate(rate: number): void;
  /**
   * Sets the volume gain at the end of the output chain, with a short curve (design 6.6, 6.8).
   *
   * @param gain The gain, 0 for a mute and 1 for the full level.
   */
  setVolume(gain: number): void;
  /**
   * Sets if a seat sounds. The app calculates this value from the mute and solo rules (6.6).
   *
   * @param seatIndex The index of the seat in `Score.seats`.
   * @param audible False to silence the seat.
   */
  setSeatAudible(seatIndex: number, audible: boolean): void;
  /** Gives the song seconds of the sound that the listener hears now (6.7), smooth between blocks. */
  now(): number;
}

/**
 * The function that gets an audio failure that no pending `load()` reports, for example a render
 * error of the processor during play (design 6.8).
 */
type ErrorListener = (error: Error) => void;

/** The error of a `load()` that a later `load()` replaced (design 6.8). */
export class LoadReplacedError extends Error {
  /** Creates the error. */
  constructor() {
    super('A later load replaced this load.');
    this.name = 'LoadReplacedError';
  }
}

/** The largest number of decode Workers of an engine. */
const MAX_DECODE_WORKERS = 4;

/**
 * Gives the number of decode Workers: one for each logical processor after the first, which the
 * page and the audio thread share, and at most {@link MAX_DECODE_WORKERS} (design 6.3).
 *
 * @param processors The logical processors, `navigator.hardwareConcurrency`. 0 if not known.
 * @returns The count, at least 1.
 */
function decodeWorkerCount(processors: number): number {
  return Math.min(MAX_DECODE_WORKERS, Math.max(1, Math.floor(processors || 0) - 1));
}

/**
 * Splits the preset files over the decode Workers: each file, the largest first, goes to the
 * Worker with the fewest bytes so far. Thus the Workers end at about the same time.
 *
 * @param sizes The size of each file, in bytes.
 * @param workers The number of Workers.
 * @returns The indices of the files of each Worker, in the order of the files. A Worker can get no
 *   file.
 */
function splitDecodes(sizes: readonly number[], workers: number): number[][] {
  const lists: number[][] = Array.from({ length: workers }, () => []);
  const loads = lists.map(() => 0);
  const order = sizes
    .map((size, i) => [size, i] as const)
    .toSorted((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [size, i] of order) {
    const least = loads.indexOf(Math.min(...loads));
    lists[least]?.push(i);
    loads[least] = (loads[least] ?? 0) + size;
  }
  return lists.map((list) => list.toSorted((a, b) => a - b));
}

/** The engine parts that the first `load()` makes. */
interface Engine {
  readonly node: AudioWorkletNode;
  /** The decode Workers. */
  readonly workers: readonly Worker[];
  /** The number of scores that the player sent to the engine. The engine counts the same. */
  loads: number;
}

/**
 * The start of an engine (design 6.3). The Worker and the preset index are ready before the
 * worklet and the hall impulse response, so that the presets load and decode while these load.
 */
interface EngineStart {
  /** The decode Workers. Each one gets requests before its script runs, and keeps them in order. */
  readonly workers: readonly Worker[];
  /** The entries of `sf/index.json`. */
  readonly index: Promise<readonly PresetFileEntry[]>;
  /** The whole engine, after the worklet module and the hall impulse response load. */
  readonly engine: Promise<Engine>;
}

/** A preset file that a load decodes. */
interface BankFile {
  /** The absolute URL of the SF3 file. It is also the id of its bank. */
  readonly url: string;
  /** The size of the file, from `sf/index.json`, in bytes. */
  readonly size: number;
}

/** The resolve and reject functions of a pending promise. */
interface Pending<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

/** The {@link Player} with spessasynth_core in an AudioWorklet (design 6). */
export class WorkletPlayer implements Player {
  readonly #context: AudioContext;
  readonly #baseUrl: URL;
  readonly #onError: ErrorListener;
  /** The nodes after the synth: the gain of the piece, the hall reverb, the mix bus, and the limiter. */
  readonly #output: OutputChain;
  /** The start of the engine, while it runs or after it succeeds. */
  #engine: EngineStart | undefined;
  /** The engine that gets the commands, after its start. */
  #live: Engine | undefined;
  #anchors: readonly ClockAnchor[] = [];
  #durationSec = 0;
  #pcmBytes = 0;
  #rate: number | undefined;
  #requestId = 0;
  /** The URLs of the banks that the synth of the live engine holds for the session (6.3). */
  readonly #loadedBanks = new Set<string>();
  /**
   * The decode of each bank that a load started and that no load sent to the synth yet, by the URL
   * of its file. A later load waits for the same decode (6.3). A failed decode leaves the map, so
   * that the next load tries the file again.
   */
  readonly #bankDecodes = new Map<string, Promise<EngineBank>>();
  readonly #decodes = new Map<number, Pending<readonly EngineBank[]>>();
  readonly #progress = new Map<number, (done: number, bytes: number) => void>();
  /** One entry for each `banks` message. The processor answers each one with `ready`, in order. */
  readonly #readyQueue: Pending<void>[] = [];
  /** The function that rejects the pending load, or undefined with no pending load. */
  #replaceLoad: (() => void) | undefined;

  /**
   * Creates the player with a new AudioContext and its output chain (design 6.8). Before a user
   * gesture, the context starts in the suspended state (design 2.4).
   *
   * @param baseUrl The URL of the site root, which holds `sf/`.
   * @param onError The function that gets an audio failure that no pending `load()` reports.
   * @param mix The mix preset of the output chain, for the session.
   */
  constructor(baseUrl: URL, onError: ErrorListener, mix: MixName) {
    this.#context = new AudioContext({ latencyHint: 'interactive' });
    this.#baseUrl = baseUrl;
    this.#onError = onError;
    this.#output = createOutputChain(this.#context, MIX_BUSES[mix]);
  }

  /** The AudioContext of the player, which the app resumes after a user gesture. */
  get context(): AudioContext {
    return this.#context;
  }

  /** The clock anchors that `now()` uses, the last one at the end. */
  get anchors(): readonly ClockAnchor[] {
    return this.#anchors;
  }

  /** The PCM SF2 size of all banks that the synth holds, in bytes (design 6.3, 9.7). */
  get pcmBytes(): number {
    return this.#pcmBytes;
  }

  async load(score: PlayerScore, onProgress: ProgressListener): Promise<void> {
    this.#replaceLoad?.();
    let replace = (): void => undefined;
    const replaced = new Promise<never>((...[, reject]) => {
      replace = () => {
        reject(new LoadReplacedError());
      };
    });
    this.#replaceLoad = replace;
    try {
      await this.#runLoad(score, onProgress, replaced);
    } finally {
      if (this.#replaceLoad === replace) {
        this.#replaceLoad = undefined;
      }
    }
  }

  /**
   * Does the work of {@link load}. Each wait also ends when a later load replaces this one.
   *
   * @param score The score.
   * @param onProgress The progress function of the load.
   * @param replaced A promise that rejects when a later load replaces this one.
   */
  async #runLoad(
    score: PlayerScore,
    onProgress: ProgressListener,
    replaced: Promise<never>,
  ): Promise<void> {
    const replace = this.#replaceLoad;
    const start = this.#startEngine();
    const index = await Promise.race([start.index, replaced]);
    // The synth keeps each bank for the session, so the Worker decodes only the new presets.
    const files = resolvePresetFiles(index, score.presets)
      .map((file): BankFile => ({ url: new URL(file.file, this.#baseUrl).href, size: file.size }))
      .filter((file) => !this.#loadedBanks.has(file.url));
    const total = files.length;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const report = (done: number, bytes: number): void => {
      if (this.#replaceLoad === replace) {
        onProgress({ done, total, bytes: Math.min(bytes, totalBytes), totalBytes });
      }
    };
    report(0, 0);
    // The decode runs while the worklet module and the hall impulse response load (design 6.3).
    const decoding = this.#decodeBanks(start.workers, files, report);
    const [engine, banks] = await Promise.race([Promise.all([start.engine, decoding]), replaced]);
    const table = packSynthEvents(mixSynthEvents(score.synthEvents, score.mix));
    this.#durationSec = score.durationSec;
    // An anchor of the old score can still arrive. Its load number tells it apart (6.7).
    this.#anchors = [];
    engine.loads += 1;
    // The new score stops the old piece, so its gain changes with the score. The headroom of
    // the SoundFont comes back here, for each piece (6.2, 6.8).
    this.#output.input.gain.value = gainOfDb(SOUNDFONT_HEADROOM_DB + score.gainDb);
    this.#send(
      engine.node,
      {
        type: 'score',
        table,
        durationSec: score.durationSec,
        channelGainsDb: channelGainsDb(score.mix),
      },
      tableBuffers(table),
    );
    // The score resets the transport and keeps the rate of the synth, so the rate comes after it.
    if (this.#rate !== undefined) {
      this.#send(engine.node, { type: 'rate', rate: this.#rate }, []);
    }
    // The transfer to the worklet detaches the buffers, so the sizes are read before it.
    const pcmBytes = banks.reduce((sum, bank) => sum + bank.data.byteLength, 0);
    const ready = new Promise<void>((resolve, reject) => {
      this.#readyQueue.push({ resolve, reject });
    });
    this.#send(
      engine.node,
      { type: 'banks', banks },
      banks.map((bank) => bank.data),
    );
    // The processor adds the banks also when a later load replaces this one.
    for (const bank of banks) {
      this.#loadedBanks.add(bank.id);
      this.#bankDecodes.delete(bank.id);
    }
    this.#pcmBytes += pcmBytes;
    await Promise.race([ready, replaced]);
  }

  play(countInSec: number): void {
    // The first click resumes the suspended context (design 2.4). Safari and iOS can reject the
    // resume outside a user gesture.
    void this.#context.resume().catch((error: Error) => {
      this.#onError(new Error(`The audio context did not start: ${String(error)}`));
    });
    this.#command({ type: 'play', countInSec });
  }

  pause(): void {
    this.#command({ type: 'pause' });
  }

  seek(songSec: number): void {
    this.#command({ type: 'seek', songSec });
  }

  setRate(rate: number): void {
    this.#rate = rate;
    this.#command({ type: 'rate', rate });
  }

  setVolume(gain: number): void {
    setOutputVolume(this.#output, gain);
  }

  setSeatAudible(seatIndex: number, audible: boolean): void {
    this.#command({ type: 'seat', seatIndex, audible });
  }

  now(): number {
    const context = this.#context;
    // Safari before 18.4 has no outputLatency.
    const outputLatency = Number(context.outputLatency) || 0;
    const fromLatency = heardTimeFromLatency(
      context.currentTime,
      outputLatency,
      context.baseLatency,
    );
    // Before the context runs, the timestamp is 0, so the latency method applies (design 6.7).
    const stamp = context.getOutputTimestamp();
    const fromTimestamp =
      stamp.contextTime && stamp.performanceTime
        ? heardTimeFromTimestamp(
            { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime },
            performance.now(),
          )
        : fromLatency;
    const heard = chooseHeardTime(fromTimestamp, fromLatency, outputLatency);
    return songTimeAt(this.#anchors, heard, this.#durationSec);
  }

  #command(command: ProcessorCommand): void {
    if (this.#live) {
      this.#send(this.#live.node, command, []);
    }
  }

  #send(node: AudioWorkletNode, command: ProcessorCommand, transfer: Transferable[]): void {
    node.port.postMessage(command, transfer);
  }

  #startEngine(): EngineStart {
    if (!this.#engine) {
      const start = this.#makeEngine();
      this.#engine = start;
      // A failed start does not stay: the next load starts the engine again.
      void start.engine.catch(() => {
        if (this.#engine === start) {
          this.#engine = undefined;
        }
      });
    }
    return this.#engine;
  }

  /**
   * Starts an engine: the Worker, the fetch of `sf/index.json`, the worklet module, and the hall
   * impulse response all start at once (design 6.3). A failure of the Worker before the engine
   * is live fails the start, and a failed start ends its Worker.
   *
   * @returns The start of the engine.
   */
  #makeEngine(): EngineStart {
    const workers = Array.from(
      { length: decodeWorkerCount(navigator.hardwareConcurrency) },
      () => new Worker(new URL('./decode-worker.ts', import.meta.url), { type: 'module' }),
    );
    let failStart: (error: Error) => void = () => undefined;
    const failed = new Promise<never>((...[, reject]) => {
      failStart = reject;
    });
    const failWorker = (error: Error): void => {
      if (this.#live?.workers === workers) {
        this.#fail(this.#live, error);
      } else {
        failStart(error);
      }
    };
    for (const worker of workers) {
      worker.addEventListener('message', (event: MessageEvent<DecodeReply>) => {
        this.#receiveDecode(event.data);
      });
      // A Worker script that does not load (for example a 404) gives an error event.
      worker.addEventListener('error', (event: ErrorEvent) => {
        const detail = event.message ? `: ${event.message}` : '.';
        failWorker(new Error(`The decode Worker failed${detail}`));
      });
      worker.addEventListener('messageerror', () => {
        failWorker(new Error('The decode Worker sent a message that cannot be read.'));
      });
    }
    const index = fetchOk(new URL(INDEX_FILE, this.#baseUrl)).then(
      async (response): Promise<readonly PresetFileEntry[]> => {
        // SAFETY: tools/split-soundfont.ts writes this file as an array of PresetFileEntry.
        return (await response.json()) as PresetFileEntry[];
      },
    );
    const engine = this.#makeNode(workers, index, failed);
    void engine.catch((error: Error) => {
      for (const worker of workers) {
        worker.terminate();
      }
      // The decodes of the failed start get no reply from the ended Worker.
      const rejects = [...this.#decodes.values()].map((pending) => pending.reject);
      this.#decodes.clear();
      this.#progress.clear();
      for (const reject of rejects) {
        reject(error);
      }
    });
    return { workers, index, engine };
  }

  /**
   * Makes the worklet node of an engine after the preset index, the worklet module, and the hall
   * impulse response load, and makes the engine live.
   *
   * @param workers The decode Workers of the engine.
   * @param index The entries of `sf/index.json`.
   * @param failed A promise that rejects when the Worker fails before the engine is live.
   * @returns The engine.
   */
  async #makeNode(
    workers: readonly Worker[],
    index: Promise<readonly PresetFileEntry[]>,
    failed: Promise<never>,
  ): Promise<Engine> {
    await Promise.race([
      Promise.all([index, this.#context.audioWorklet.addModule(processorUrl), this.#loadHall()]),
      failed,
    ]);
    const node = new AudioWorkletNode(this.#context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.connect(this.#output.input);
    const engine: Engine = { node, workers, loads: 0 };
    node.port.addEventListener('message', (event: MessageEvent<ProcessorReply>) => {
      this.#receive(engine, event.data);
    });
    node.port.start();
    node.addEventListener('processorerror', () => {
      this.#fail(engine, new Error('The audio processor stopped.'));
    });
    this.#live = engine;
    return engine;
  }

  /**
   * Fetches and decodes the hall impulse response of the mix preset, one time for the player
   * (design 6.8). When `decodeAudioData()` refuses the FLAC file, the player decodes the WAV file
   * with the same samples. A failure is a failed start of the engine, so the next load tries
   * again.
   */
  async #loadHall(): Promise<void> {
    const convolver = this.#output.convolver;
    if (convolver.buffer) {
      return;
    }
    const hall = this.#output.bus.hall;
    const response = await fetchOk(new URL(hall.flacUrl, this.#baseUrl));
    const flac = await response.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await this.#context.decodeAudioData(flac);
    } catch {
      // A browser that cannot decode FLAC gets the same samples from the WAV file (design 6.8).
      const wav = await fetchOk(new URL(hall.wavUrl, this.#baseUrl));
      buffer = await this.#context.decodeAudioData(await wav.arrayBuffer());
    }
    convolver.buffer = buffer;
  }

  /**
   * Gives the banks of the preset files in the order of the files, so that the synth gets the
   * banks in the same order. A file with a decode of an earlier load waits for that decode, and
   * the Workers decode only the other files (design 6.3). The progress counts a file of an earlier
   * decode, with its full size, when its bank is ready.
   *
   * @param workers The decode Workers.
   * @param files The preset files that the synth does not have.
   * @param onProgress Gets the files that are ready and the bytes that arrived.
   * @returns The banks.
   */
  #decodeBanks(
    workers: readonly Worker[],
    files: readonly BankFile[],
    onProgress: (done: number, bytes: number) => void,
  ): Promise<readonly EngineBank[]> {
    const earlier = files.filter((file) => this.#bankDecodes.has(file.url));
    let earlierDone = 0;
    let earlierBytes = 0;
    let newDone = 0;
    let newBytes = 0;
    const report = (): void => {
      onProgress(earlierDone + newDone, earlierBytes + newBytes);
    };
    for (const file of earlier) {
      void this.#bankDecodes.get(file.url)?.then(
        () => {
          earlierDone += 1;
          earlierBytes += file.size;
          report();
        },
        () => undefined,
      );
    }
    this.#decodeAll(
      workers,
      files.filter((file) => !earlier.includes(file)),
      (done, bytes) => {
        newDone = done;
        newBytes = bytes;
        report();
      },
    );
    return Promise.all(
      files.map(
        (file) =>
          this.#bankDecodes.get(file.url) ??
          Promise.reject(new Error(`No decode of ${file.url} started.`)),
      ),
    );
  }

  /**
   * Starts the decode of the preset files on the decode Workers ({@link splitDecodes}), and adds
   * the decode of each bank to `#bankDecodes`. A failed decode leaves the map.
   *
   * @param workers The decode Workers.
   * @param files The preset files that no decode has.
   * @param onProgress Gets the files that are ready and the bytes that arrived, on all Workers.
   */
  #decodeAll(
    workers: readonly Worker[],
    files: readonly BankFile[],
    onProgress: (done: number, bytes: number) => void,
  ): void {
    const sizes = files.map((file) => file.size);
    const lists = splitDecodes(sizes, workers.length).filter((list) => list.length > 0);
    const done = lists.map(() => 0);
    const bytes = lists.map(() => 0);
    for (const [part, list] of lists.entries()) {
      const urls = list.map((i) => files[i]?.url ?? '');
      const request = this.#decode(
        // Each list has a Worker of its own: there are at most as many lists as Workers.
        workers[part] ?? workers[0]!,
        urls,
        (partDone, partBytes) => {
          done[part] = partDone;
          bytes[part] = partBytes;
          onProgress(
            done.reduce((sum, d) => sum + d, 0),
            bytes.reduce((sum, b) => sum + b, 0),
          );
        },
      );
      for (const [k, url] of urls.entries()) {
        const bank = request.then(
          (banks) =>
            banks[k] ?? Promise.reject(new Error(`The decode Worker sent no bank for ${url}.`)),
        );
        this.#bankDecodes.set(url, bank);
        void bank.catch(() => {
          if (this.#bankDecodes.get(url) === bank) {
            this.#bankDecodes.delete(url);
          }
        });
      }
    }
  }

  #decode(
    worker: Worker,
    urls: readonly string[],
    onProgress: (done: number, bytes: number) => void,
  ): Promise<readonly EngineBank[]> {
    this.#requestId += 1;
    const id = this.#requestId;
    const request: DecodeRequest = { type: 'decode', id, urls };
    return new Promise<readonly EngineBank[]>((resolve, reject) => {
      this.#decodes.set(id, { resolve, reject });
      this.#progress.set(id, onProgress);
      // A Worker has no target origin. The second argument is the empty transfer list.
      worker.postMessage(request, []);
    });
  }

  #receiveDecode(reply: DecodeReply): void {
    if (reply.type === 'progress') {
      this.#progress.get(reply.id)?.(reply.done, reply.bytes);
      return;
    }
    const pending = this.#decodes.get(reply.id);
    this.#decodes.delete(reply.id);
    this.#progress.delete(reply.id);
    if (reply.type === 'decoded') {
      pending?.resolve(reply.banks);
    } else {
      pending?.reject(new Error(reply.message));
    }
  }

  #receive(engine: Engine, reply: ProcessorReply): void {
    switch (reply.type) {
      case 'anchor':
        this.#anchors = addScoreAnchor(this.#anchors, reply.anchor, engine.loads);
        break;
      case 'ready':
        this.#readyQueue.shift()?.resolve();
        break;
      case 'error':
        this.#fail(engine, new Error(`The audio processor failed: ${reply.message}`));
        break;
    }
  }

  /**
   * Ends an engine after a failure (design 6.8). The clock stops at its song time, and the next
   * load starts a new engine. A pending load gets the error. Else the error listener gets it.
   */
  #fail(engine: Engine, error: Error): void {
    if (this.#live !== engine) {
      return;
    }
    this.#anchors = [{ contextTime: 0, songTime: this.now(), rate: 0, load: engine.loads }];
    this.#live = undefined;
    this.#engine = undefined;
    this.#loadedBanks.clear();
    this.#bankDecodes.clear();
    this.#pcmBytes = 0;
    engine.node.disconnect();
    for (const worker of engine.workers) {
      worker.terminate();
    }
    // A pending load waits for a decode or a ready reply, so these rejections reach it.
    const rejects = [...this.#decodes.values(), ...this.#readyQueue].map(
      (pending) => pending.reject,
    );
    this.#decodes.clear();
    this.#progress.clear();
    this.#readyQueue.length = 0;
    for (const reject of rejects) {
      reject(error);
    }
    if (!this.#replaceLoad) {
      this.#onError(error);
    }
  }
}
