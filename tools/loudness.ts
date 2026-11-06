/**
 * Measures the loudness of each demo at the output of the app (design 6.8).
 *
 * Usage: `pnpm loudness [--mix <name>] [--demo <id>]... [--file <path>]... [--fit [--write]]
 * [--target <LUFS>]... [--json] [--check] [--wav <dir> [--seconds <s>]]`
 *
 * For each demo (all demos when the run has no `--demo` and no `--file`) and each file of
 * `--file`, it renders the synth output in Node with the `SynthEngine`, the SoundFont of design
 * 6.2, the room of the synth, and the stage mix of the layout, as the app and its worklet do.
 * Then the code of `src/audio/output-chain.ts` runs in an `OfflineAudioContext` of headless
 * Chromium, with the mix bus of the mix preset, its hall impulse response, the glue compressor,
 * the limiter, and their trims. The input gain is `SOUNDFONT_HEADROOM_DB` plus `pieceGainDb()`,
 * as in the `Player`. The render has the full song and 3 s of tail, at 48 kHz.
 *
 * Each row gives the integrated loudness and the loudness range (ITU-R BS.1770-4, EBU Tech 3342),
 * the true peak, the median short-term loudness of the first 10 s (`st10`) and of the first 30 s
 * (`st30`), the share of the song with a short-term loudness below -30 LUFS, the gain reduction of
 * the glue compressor (its 95th percentile and its highest value in a block of 50 ms), and the gain
 * reduction of the limiter (its highest value, and the share of the blocks above 1 dB and 3 dB).
 *
 * - `--mix <name>` selects the mix preset of `MIX_BUSES`: `hall` (the default) or `cinematic`.
 * - `--file <path>` measures a MIDI file that is not a demo, such as a new demo before its entry
 *   in `DEMO_IDS` and its checksum row in `demos/README.md`. The file gets the stage mix of its
 *   own score and the piece gain 0 dB of a file of the user. The row has the file name.
 *   `--check` refuses a file.
 * - `--fit` finds the piece gain that brings each demo within 0.05 LU of `TARGET_LOUDNESS`, in
 *   steps of 0.1 dB, and gives the value for `DEMO_LOUDNESS`: the target minus that gain.
 * - `--write` with `--fit` writes the value of each demo of the run into `DEMO_LOUDNESS` of
 *   `src/audio/demo-loudness.ts`, in the block of the mix preset, after the last demo. It changes
 *   only these rows, so the order of the keys and the format stay. It refuses a file of `--file`.
 * - `--target <LUFS>` fits to this target in place of `TARGET_LOUDNESS`. Each target gives one
 *   row for each demo, from one synth render.
 * - `--json` prints one JSON object for each demo, with the short-term loudness at each second.
 * - `--check` exits with 1 when a demo at the gain of `pieceGainDb()` is more than 0.5 LU from
 *   `TARGET_LOUDNESS`, or has a true peak above -1 dBTP. Run it for each mix preset after a
 *   change of a demo file, the SoundFont, the velocity curve, the mix, the mix bus, the hall, or
 *   the limiter.
 * - `--wav <dir>` writes the output of the chain of each demo at the gain of `pieceGainDb()` as a
 *   16-bit WAV file `<dir>/<demo>-<mix>.wav`, with no normalization. `--seconds <s>` keeps only the
 *   first `s` seconds.
 *
 * The page server listens on a free port that the system gives. A run of all demos takes about
 * 5 minutes. The renders are deterministic, so two runs give the same numbers.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { basename, extname, join } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { audioToWav } from 'spessasynth_core';

import { DEMO_IDS, isDemoId } from '../src/app/demos.ts';
import type { DemoId } from '../src/app/demos.ts';
import { DEFAULT_MIX, isMixName } from '../src/app/mix-query.ts';
import { TARGET_LOUDNESS, pieceGainDb } from '../src/audio/demo-loudness.ts';
import type { MixName } from '../src/audio/output-chain.ts';
import { SOUNDFONT_HEADROOM_DB } from '../src/audio/soundfont-info.ts';
import { packSynthEvents } from '../src/audio/synth-events.ts';
import { OfflineHarness, TEST_SAMPLE_RATE, testBanks } from '../src/audio/test-banks.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { buildScore } from '../src/score/score.ts';
import { channelGainsDb, mixSynthEvents, stageMix } from '../src/score/stage-mix.ts';
import {
  METER_RATE,
  QUIET_LUFS,
  gainReduction,
  measureLoudness,
  medianShortTerm,
  shareBelow,
} from './loudness-meter.ts';
import type { GainReduction, Loudness, Stereo } from './loudness-meter.ts';
import { patchedDemos } from './patch-demos.ts';
import { ROOT } from './ref-tree.ts';

/** The tail after the song end in seconds, for the release of the notes and the hall. */
const TAIL_SEC = 3;

/** The length of the start that the column `st10` measures, in seconds. */
const SHORT_START_SEC = 10;

/** The length of the start that the column `st30` measures, in seconds. */
const LONG_START_SEC = 30;

/** The largest error of a fit in LU. */
const FIT_TOLERANCE = 0.05;

/** The most chain renders of one fit. */
const FIT_STEPS = 6;

/** The largest distance of a demo from the target in LU for `--check`. */
const CHECK_TOLERANCE = 0.5;

/** The highest true peak of a demo in dBTP for `--check` (EBU R 128). */
const CHECK_TRUE_PEAK = -1;

/** The file of `DEMO_LOUDNESS`, which `--write` changes. */
const TABLE_FILE = 'src/audio/demo-loudness.ts';

/** The synth output of one demo and its song length. */
interface SynthRender {
  /** The stereo output of the synth at 48 kHz, with the tail. */
  readonly audio: Stereo;
  /** The song length in seconds. */
  readonly durationSec: number;
}

/** The output of the chain: the output of the app, and the inputs of the limiter and the glue. */
interface ChainRender {
  /** The output of the volume gain. */
  readonly output: Stereo;
  /** The output of the glue compressor after its trim. */
  readonly limiterInput: Stereo;
  /** The output of the tone EQ. */
  readonly glueInput: Stereo;
  /** The time of `startRendering()` in ms. */
  readonly renderMs: number;
}

/** The measures of one demo or one file of `--file` at one piece gain. */
interface Row {
  /** The demo, or the file name of a file of `--file`. */
  readonly name: string;
  /** The target of a fit in LUFS, or `null` for the gain of `pieceGainDb()`. */
  readonly target: number | null;
  readonly gainDb: number;
  /** The value for `DEMO_LOUDNESS` at the target, or `null` with no fit. */
  readonly tableValue: number | null;
  readonly loudness: Loudness;
  /** The median short-term loudness of the first {@link SHORT_START_SEC} s in LUFS. */
  readonly start10: number;
  /** The median short-term loudness of the first {@link LONG_START_SEC} s in LUFS. */
  readonly start30: number;
  /** The share of the song with a short-term loudness below {@link QUIET_LUFS}. */
  readonly quiet: number;
  /** The gain reduction of the limiter. */
  readonly reduction: GainReduction;
  /** The gain reduction of the glue compressor. */
  readonly glue: GainReduction;
  /** The time of the chain render in ms. */
  readonly renderMs: number;
}

/**
 * Renders the synth output of a MIDI file as the worklet does, with the stage mix of design 6.1
 * and the section size "Auto".
 *
 * @param bytes The MIDI file. For a demo, the file after the changes of `demos/patches.json`.
 * @returns The stereo output of the synth, before the output chain, and the song length.
 * @throws Error if the file does not give a score.
 */
async function renderSynth(bytes: Uint8Array): Promise<SynthRender> {
  const result = buildScore(bytes, 'auto');
  if (!result.ok) {
    throw new Error(result.error);
  }
  const score = result.score;
  const mix = stageMix(score, layoutScene(score, new ModelCache()));
  const run = new OfflineHarness(
    packSynthEvents(mixSynthEvents(score.synthEvents, mix)),
    score.durationSec,
    await testBanks(score.presets),
    channelGainsDb(mix),
  );
  run.engine.enqueue({ type: 'play', countInSec: 0 });

  const block = 128;
  const frames = Math.ceil(((score.durationSec + TAIL_SEC) * TEST_SAMPLE_RATE) / block) * block;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const l = new Float32Array(block);
  const r = new Float32Array(block);
  for (let frame = 0; frame < frames; frame += block) {
    l.fill(0);
    r.fill(0);
    run.engine.render(frame / TEST_SAMPLE_RATE, l, r);
    left.set(l, frame);
    right.set(r, frame);
  }
  return { audio: { left, right }, durationSec: score.durationSec };
}

/** One input of a run: a demo, or a MIDI file of `--file`. */
interface Piece {
  /** The demo, or the file name of a file of `--file`. */
  readonly name: string;
  /** The demo, or `null` for a file of `--file`. */
  readonly demo: DemoId | null;
  /** The MIDI file. For a demo, the file after the changes of `demos/patches.json`. */
  readonly bytes: Uint8Array;
}

/**
 * Reads the MIDI file of each demo and of each path, one time before the first render. Thus a
 * change of `demos/` during the run, such as a new checksum row, cannot stop the run. A file of a
 * path needs no entry in `DEMO_IDS` and no checksum row.
 *
 * @param demos The demos.
 * @param paths The paths of `--file`.
 * @returns The demos, then the files, each in the order of the arguments.
 * @throws Error if a demo file does not exist or has a wrong checksum, or if a path has no file.
 */
async function readPieces(demos: readonly DemoId[], paths: readonly string[]): Promise<Piece[]> {
  const files = demos.length ? await patchedDemos() : [];
  const pieces = demos.map((demo): Piece => {
    const file = files.find((item) => item.file === `${demo}.mid`);
    if (!file) {
      throw new Error(`The demo file ${demo}.mid does not exist.`);
    }
    return { name: demo, demo, bytes: file.bytes };
  });
  for (const path of paths) {
    pieces.push({ name: basename(path), demo: null, bytes: new Uint8Array(readFileSync(path)) });
  }
  return pieces;
}

/**
 * Gives the JavaScript of `src/audio/output-chain.ts` for the page: the types removed, and each
 * URL import of Vite replaced by the route of its file in `assets/hall/`.
 *
 * @returns The module text.
 */
function chainModule(): string {
  const source = readFileSync(join(ROOT, 'src/audio/output-chain.ts'), 'utf8').replaceAll(
    /^import (\w+Url) from '\.\.\/\.\.\/assets\/hall\/([\w.-]+)\?url';$/gm,
    `const $1 = '/hall/$2';`,
  );
  return stripTypeScriptTypes(source);
}

/**
 * Reads the body of a request.
 *
 * @param request The request.
 * @returns The bytes.
 */
async function bodyOf(request: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of request) {
    // SAFETY: a request with no encoding gives Buffer chunks.
    parts.push(part as Buffer);
  }
  return Buffer.concat(parts);
}

/** The headless browser of the chain, for all demos of a run. */
let browser: Browser | undefined;

/**
 * Sends a synth output through the output chain of the app in an `OfflineAudioContext`. The
 * page gets the six channels of the destination: the output of the volume gain, the input of the
 * limiter, and the input of the glue compressor.
 *
 * @param input The synth output at 48 kHz.
 * @param inputDb The gain of the input node in dB.
 * @param mix The mix preset.
 * @returns The output of the chain and the inputs of the limiter and the glue.
 */
async function renderChain(input: Stereo, inputDb: number, mix: MixName): Promise<ChainRender> {
  const frames = input.left.length;
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[2 * i] = input.left[i] ?? 0;
    interleaved[2 * i + 1] = input.right[i] ?? 0;
  }
  const rendered = new Float32Array(frames * 6);
  const module = chainModule();

  const serve = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html');
      response.end('<!doctype html><title>loudness</title>');
    } else if (url.pathname === '/chain.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(module);
    } else if (url.pathname === '/in.f32') {
      response.end(Buffer.from(interleaved.buffer));
    } else if (/^\/hall\/[\w-]+\.(wav|flac)$/.test(url.pathname)) {
      response.end(readFileSync(join(ROOT, 'assets', url.pathname)));
    } else if (url.pathname === '/out') {
      const body = await bodyOf(request);
      const values = new Float32Array(new Uint8Array(body).buffer);
      rendered.set(values, Number(url.searchParams.get('offset')));
      response.end('ok');
    } else {
      response.statusCode = 404;
      response.end();
    }
  };
  const server = createServer((request, response) => void serve(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = address instanceof Object ? address.port : 0;

  browser ??= await chromium.launch();
  const page = await browser.newPage();
  let renderMs = 0;
  try {
    page.on('console', (message) => console.error(message.text()));
    await page.goto(`http://127.0.0.1:${port}/`);
    renderMs = await page.evaluate(
      async ([gainDb, mixName]) => {
        const chainUrl = '/chain.js';
        const chainCode = await import(chainUrl);
        const raw = new Float32Array(await (await fetch('/in.f32')).arrayBuffer());
        const length = raw.length / 2;
        const context = new OfflineAudioContext(6, length, 48_000);
        const buffer = context.createBuffer(2, length, 48_000);
        const l = buffer.getChannelData(0);
        const r = buffer.getChannelData(1);
        for (let i = 0; i < length; i++) {
          l[i] = raw[2 * i] ?? 0;
          r[i] = raw[2 * i + 1] ?? 0;
        }
        const chain = chainCode.createOutputChain(context, chainCode.MIX_BUSES[mixName]);
        chain.convolver.buffer = await context.decodeAudioData(
          await (await fetch(chain.bus.hall.wavUrl)).arrayBuffer(),
        );
        chain.input.gain.value = chainCode.gainOfDb(gainDb);

        // The six channels: the output of the app, the input of the limiter, and the input of the
        // glue compressor.
        chain.volume.disconnect();
        const merger = context.createChannelMerger(6);
        [chain.volume, chain.glueTrim, chain.tone].forEach((node, index) => {
          const split = context.createChannelSplitter(2);
          node.connect(split);
          split.connect(merger, 0, 2 * index);
          split.connect(merger, 1, 2 * index + 1);
        });
        context.destination.channelInterpretation = 'discrete';
        merger.connect(context.destination);

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(chain.input);
        source.start();
        const started = performance.now();
        const result = await context.startRendering();
        const elapsed = performance.now() - started;
        const channels = [0, 1, 2, 3, 4, 5].map((index) => result.getChannelData(index));
        const part = 48_000 * 20;
        for (let start = 0; start < length; start += part) {
          const end = Math.min(length, start + part);
          const chunk = new Float32Array((end - start) * 6);
          for (let i = start; i < end; i++) {
            for (let c = 0; c < 6; c++) {
              chunk[6 * (i - start) + c] = channels[c]?.[i] ?? 0;
            }
          }
          await fetch(`/out?offset=${6 * start}`, { method: 'POST', body: chunk });
        }
        return elapsed;
      },
      [inputDb, mix] as const,
    );
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const channel = (index: number): Float32Array => {
    const values = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      values[i] = rendered[6 * i + index] ?? 0;
    }
    return values;
  };
  return {
    output: { left: channel(0), right: channel(1) },
    limiterInput: { left: channel(2), right: channel(3) },
    glueInput: { left: channel(4), right: channel(5) },
    renderMs,
  };
}

/** A WAV file of the output of the chain, for `--wav`. */
interface WavRequest {
  /** The path of the file. */
  readonly path: string;
  /** The length of the file in seconds, at most the length of the render. */
  readonly seconds: number;
}

/**
 * Writes the start of a stereo signal as a 16-bit WAV file at 48 kHz, with no normalization.
 *
 * @param audio The signal at 48 kHz.
 * @param request The path and the length.
 */
function writeWav(audio: Stereo, request: WavRequest): void {
  const frames = Math.min(audio.left.length, Math.round(request.seconds * TEST_SAMPLE_RATE));
  const data = audioToWav(
    [audio.left.subarray(0, frames), audio.right.subarray(0, frames)],
    TEST_SAMPLE_RATE,
    { normalizeAudio: false },
  );
  writeFileSync(request.path, new Uint8Array(data));
}

/**
 * Measures one demo or one file at one piece gain.
 *
 * @param name The demo, or the file name of a file of `--file`.
 * @param synth The synth output of the demo or the file.
 * @param gainDb The piece gain in dB.
 * @param target The target of a fit, or `null`.
 * @param mix The mix preset.
 * @param wav The WAV file of the output, if any.
 * @returns The row.
 */
async function measureAt(
  name: string,
  synth: SynthRender,
  gainDb: number,
  target: number | null,
  mix: MixName,
  wav?: WavRequest,
): Promise<Row> {
  const chain = await renderChain(synth.audio, SOUNDFONT_HEADROOM_DB + gainDb, mix);
  if (wav) {
    writeWav(chain.output, wav);
  }
  const loudness = measureLoudness(chain.output);
  return {
    name,
    target,
    gainDb,
    tableValue: target === null ? null : Math.round((target - gainDb) * 10) / 10,
    loudness,
    start10: medianShortTerm(loudness.shortTerm, 3, SHORT_START_SEC),
    start30: medianShortTerm(loudness.shortTerm, 3, LONG_START_SEC),
    quiet: shareBelow(loudness.shortTerm, synth.durationSec, QUIET_LUFS),
    reduction: gainReduction(chain.limiterInput, chain.output),
    glue: gainReduction(chain.glueInput, chain.limiterInput),
    renderMs: chain.renderMs,
  };
}

/**
 * Finds the piece gain that brings a demo or a file to a target, in steps of 0.1 dB.
 *
 * @param name The demo, or the file name of a file of `--file`.
 * @param synth The synth output of the demo or the file.
 * @param target The target in LUFS.
 * @param first The measures at the gain of `pieceGainDb()`.
 * @param mix The mix preset.
 * @returns The row at the fitted gain.
 */
async function fit(
  name: string,
  synth: SynthRender,
  target: number,
  first: Row,
  mix: MixName,
): Promise<Row> {
  let row: Row = { ...first, target, tableValue: Math.round((target - first.gainDb) * 10) / 10 };
  const tried = new Set<number>([row.gainDb]);
  for (let step = 0; step < FIT_STEPS; step++) {
    const error = target - row.loudness.integrated;
    if (Math.abs(error) <= FIT_TOLERANCE) {
      break;
    }
    const gainDb = Math.round((row.gainDb + error) * 10) / 10;
    if (tried.has(gainDb)) {
      break;
    }
    tried.add(gainDb);
    row = await measureAt(name, synth, gainDb, target, mix);
  }
  return row;
}

/**
 * Formats a number with a fixed count of decimals and a width.
 *
 * @param value The number.
 * @param digits The decimals.
 * @param width The width.
 * @returns The text, padded at the start.
 */
function cell(value: number, digits: number, width: number): string {
  return value.toFixed(digits).padStart(width);
}

/**
 * Formats one row of the text table.
 *
 * @param row The measures.
 * @returns The line.
 */
function line(row: Row): string {
  const { loudness, reduction, glue } = row;
  return [
    row.name.padEnd(17),
    row.target === null ? '     app' : cell(row.target, 1, 8),
    cell(row.gainDb, 1, 6),
    row.tableValue === null ? '     -' : cell(row.tableValue, 1, 6),
    cell(loudness.integrated, 2, 7),
    cell(loudness.range, 1, 5),
    cell(loudness.truePeak, 2, 6),
    cell(row.start10, 1, 6),
    cell(row.start30, 1, 6),
    cell(row.quiet * 100, 0, 5),
    cell(glue.p95, 1, 5),
    cell(glue.max, 1, 5),
    cell(reduction.max, 1, 5),
    cell(reduction.over1 * 100, 1, 6),
    cell(reduction.over3 * 100, 1, 6),
  ].join(' ');
}

/** The head of the text table. */
const HEAD = [
  'demo              target   gain  table    LUFS   LRA  dBTP  st10   st30 quiet glue95 glue  GRmax  GR>1  GR>3',
  '                  LUFS     dB    LUFS                       LUFS   LUFS    %     dB    dB     dB     %     %',
].join('\n');

/** The JSON object of one row of `--json`. The levels are in LUFS, dB, or dBTP. */
interface RowJson {
  /** The demo, or the file name of a file of `--file`. */
  readonly demo: string;
  readonly target: number | null;
  readonly gainDb: number;
  readonly tableValue: number | null;
  readonly integrated: number;
  readonly range: number;
  readonly maxShortTerm: number;
  readonly samplePeak: number;
  readonly truePeak: number;
  /** The median short-term loudness of the first 10 s. */
  readonly start10: number;
  /** The median short-term loudness of the first 30 s. */
  readonly start30: number;
  /** The share of the song below -30 LUFS short-term, from 0 to 1. */
  readonly quiet: number;
  readonly reductionMax: number;
  /** The share of the blocks of 50 ms with more than 1 dB of gain reduction. */
  readonly reductionOver1: number;
  /** The share of the blocks of 50 ms with more than 3 dB of gain reduction. */
  readonly reductionOver3: number;
  /** The delay of the limiter in samples. */
  readonly limiterDelay: number;
  /** The 95th percentile of the gain reduction of the glue compressor in a block of 50 ms. */
  readonly glueP95: number;
  /** The highest gain reduction of the glue compressor in a block of 50 ms. */
  readonly glueMax: number;
  /** The time of the chain render in ms. */
  readonly renderMs: number;
  /** The short-term loudness at the end of each second, at least -99 LUFS. */
  readonly shortTerm: readonly number[];
}

/**
 * Gives the JSON object of a row, with the short-term loudness at each second.
 *
 * @param row The measures.
 * @returns The object.
 */
function jsonOf(row: Row): RowJson {
  const round = (value: number, digits: number): number => Number(value.toFixed(digits));
  const perSecond: number[] = [];
  for (let i = 9; i < row.loudness.shortTerm.length; i += 10) {
    perSecond.push(round(Math.max(-99, row.loudness.shortTerm[i] ?? -99), 1));
  }
  return {
    demo: row.name,
    target: row.target,
    gainDb: row.gainDb,
    tableValue: row.tableValue,
    integrated: round(row.loudness.integrated, 2),
    range: round(row.loudness.range, 2),
    maxShortTerm: round(row.loudness.maxShortTerm, 2),
    samplePeak: round(row.loudness.samplePeak, 2),
    truePeak: round(row.loudness.truePeak, 2),
    start10: round(row.start10, 2),
    start30: round(row.start30, 2),
    quiet: round(row.quiet, 4),
    reductionMax: round(row.reduction.max, 2),
    reductionOver1: round(row.reduction.over1, 4),
    reductionOver3: round(row.reduction.over3, 4),
    limiterDelay: row.reduction.delay,
    glueP95: round(row.glue.p95, 2),
    glueMax: round(row.glue.max, 2),
    renderMs: Math.round(row.renderMs),
    shortTerm: perSecond,
  };
}

/**
 * Gives the failures of the check of one demo at the gain of `pieceGainDb()`.
 *
 * @param row The measures.
 * @returns One text for each failed limit.
 */
function checkFailures(row: Row): string[] {
  const failures: string[] = [];
  const error = row.loudness.integrated - TARGET_LOUDNESS;
  if (Math.abs(error) > CHECK_TOLERANCE) {
    failures.push(`${row.name}: ${error.toFixed(2)} LU from the target`);
  }
  if (row.loudness.truePeak > CHECK_TRUE_PEAK) {
    failures.push(`${row.name}: true peak ${row.loudness.truePeak.toFixed(2)} dBTP`);
  }
  return failures;
}

/**
 * Writes fitted values into `DEMO_LOUDNESS` of {@link TABLE_FILE}. It replaces only the value of
 * each given demo in the block of the mix preset, so the order of the keys and the format stay.
 *
 * @param mix The mix preset.
 * @param values The value of each demo in LUFS, rounded to 0.1.
 * @throws Error if the file has no block of the mix, or the block has no row of a demo.
 */
function writeTable(mix: MixName, values: ReadonlyMap<DemoId, number>): void {
  const path = join(ROOT, TABLE_FILE);
  const text = readFileSync(path, 'utf8');
  const table = text.indexOf('export const DEMO_LOUDNESS');
  const start = table === -1 ? -1 : text.indexOf(`\n  ${mix}: {\n`, table);
  const end = start === -1 ? -1 : text.indexOf('\n  },', start);
  if (end === -1) {
    throw new Error(`${TABLE_FILE} has no block ${mix} in DEMO_LOUDNESS.`);
  }

  let block = text.slice(start, end);
  for (const [demo, value] of values) {
    const row = new RegExp(`^    '${demo}': -?\\d+\\.\\d,$`, 'mu');
    if (!row.test(block)) {
      throw new Error(`The block ${mix} of ${TABLE_FILE} has no row of ${demo}.`);
    }
    block = block.replace(row, `    '${demo}': ${value.toFixed(1)},`);
  }
  writeFileSync(path, `${text.slice(0, start)}${block}${text.slice(end)}`);
}

/**
 * Reads the values of an option that can repeat.
 *
 * @param args The arguments.
 * @param name The option, such as `--demo`.
 * @returns The values, in order.
 * @throws Error if the option has no value.
 */
function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  args.forEach((arg, index) => {
    if (arg === name) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`The option ${name} needs a value.`);
      }
      values.push(value);
    }
  });
  return values;
}

/**
 * Runs the tool: `node tools/loudness.ts [--mix <name>] [--demo <id>]... [--file <path>]...
 * [--fit [--write]] [--target <LUFS>]... [--json] [--check] [--wav <dir> [--seconds <s>]]`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: pnpm loudness [--mix <name>] [--demo <id>]... [--file <path>]... [--fit [--write]] [--target <LUFS>]... [--json] [--check] [--wav <dir> [--seconds <s>]]',
    );
    return;
  }
  const [mix = DEFAULT_MIX, ...extraMixes] = optionValues(args, '--mix');
  if (extraMixes.length || !isMixName(mix)) {
    throw new Error('Give one --mix: hall or cinematic.');
  }
  const names = optionValues(args, '--demo');
  const unknown = names.filter((name) => !isDemoId(name));
  if (unknown.length) {
    throw new Error(`No demo ${unknown.join(', ')}. The demos: ${DEMO_IDS.join(', ')}.`);
  }
  const paths = optionValues(args, '--file');
  const demos = names.length || paths.length ? names.filter(isDemoId) : [...DEMO_IDS];
  const targets = optionValues(args, '--target').map(Number);
  if (targets.some((target) => !Number.isFinite(target))) {
    throw new Error('A target is a number in LUFS, such as -16.');
  }
  if (args.includes('--fit') && !targets.length) {
    targets.push(TARGET_LOUDNESS);
  }
  const json = args.includes('--json');
  const check = args.includes('--check');
  if (check && paths.length) {
    throw new Error('--check measures only demos. A file of --file has no piece gain.');
  }
  const write = args.includes('--write');
  if (write && (!targets.includes(TARGET_LOUDNESS) || paths.length)) {
    throw new Error('--write needs --fit, and a file of --file has no row in DEMO_LOUDNESS.');
  }
  const [wavDir, ...extraWavs] = optionValues(args, '--wav');
  const [secondsText, ...extraSeconds] = optionValues(args, '--seconds');
  const seconds = secondsText === undefined ? Infinity : Number(secondsText);
  if (extraWavs.length || extraSeconds.length || !(seconds > 0)) {
    throw new Error('Give at most one --wav <dir>, and at most one --seconds above 0.');
  }
  if (wavDir !== undefined) {
    mkdirSync(wavDir, { recursive: true });
  }
  if (METER_RATE !== TEST_SAMPLE_RATE) {
    throw new Error('The meter and the render need the same sample rate.');
  }
  const pieces = await readPieces(demos, paths);

  if (!json) {
    console.log(
      `Output of the chain with the mix ${mix}, after the limiter. TARGET_LOUDNESS ${TARGET_LOUDNESS} LUFS.`,
    );
    console.log(HEAD);
  }
  const failures: string[] = [];
  const fitted = new Map<DemoId, number>();
  try {
    for (const piece of pieces) {
      const synth = await renderSynth(piece.bytes);
      const stem = basename(piece.name, extname(piece.name));
      const wav =
        wavDir === undefined ? undefined : { path: join(wavDir, `${stem}-${mix}.wav`), seconds };
      const gainDb = pieceGainDb(piece.demo, mix);
      const first = await measureAt(piece.name, synth, gainDb, null, mix, wav);
      failures.push(...checkFailures(first));
      const rows = [first];
      for (const target of targets) {
        rows.push(await fit(piece.name, synth, target, first, mix));
      }
      for (const row of rows) {
        console.log(json ? JSON.stringify(jsonOf(row)) : line(row));
      }
      const value = rows.find((row) => row.target === TARGET_LOUDNESS)?.tableValue;
      if (piece.demo && value !== undefined && value !== null) {
        fitted.set(piece.demo, value);
      }
    }
  } finally {
    await browser?.close();
  }

  if (write) {
    writeTable(mix, fitted);
    console.error(
      `Wrote DEMO_LOUDNESS.${mix} of ${[...fitted.keys()].join(', ')} to ${TABLE_FILE}.`,
    );
  }

  if (check) {
    for (const failure of failures) {
      console.error(`FAIL ${failure}`);
    }
    console.error(failures.length ? `${failures.length} failures.` : 'check: pass');
    process.exitCode = failures.length ? 1 : 0;
  }
}

if (import.meta.main) {
  await main();
}
