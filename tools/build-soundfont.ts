import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { parseArgs } from 'node:util';

import {
  BasicInstrument,
  BasicPreset,
  BasicSample,
  BasicSoundBank,
  GeneratorTypes,
  SampleTypes,
  SoundBankLoader,
  SpessaLog,
  SpessaSynthProcessor,
} from 'spessasynth_core';
import type { BasicPresetZone, BasicZone } from 'spessasynth_core';
import { createOggEncoder } from 'wasm-media-encoders';

import { sf3ToPcmSf2 } from '../src/audio/decode.ts';
import {
  cutDecay,
  cutSustain,
  estimatePitch,
  mixToMono,
  onsetFrame,
  removeDc,
} from './sample-cut.ts';
import type { CutSample } from './sample-cut.ts';
import { parseSfz } from './sfz.ts';
import type { SfzRegion } from './sfz.ts';
import { BASE_SOUNDFONT, PRESET_ALIASES, PRESET_RECIPES, SOURCES } from './soundfont-recipes.ts';
import type { PartRecipe, PresetRecipe, SourceId } from './soundfont-recipes.ts';
import { SOUNDFONT_PATH, presetTarget, splitPreset } from './split-soundfont.ts';
import { decodeWav } from './wav.ts';

/** The path of the checksums of all source files. */
export const LOCK_PATH = join(import.meta.dirname, 'soundfont-lock.json');

/** The quality of the Ogg Vorbis encoder, from 0 to 10 (libvorbis `-q`). */
const VORBIS_QUALITY = 5;

/** The date in the INFO chunk, so that two builds write the same bytes. */
const CREATION_DATE = new Date('2026-10-05T00:00:00Z');

/** The velocity of the notes of the level calibration. */
const CALIBRATION_VELOCITY = 100;

/** The sample rate of the level calibration. */
const CALIBRATION_RATE = 48_000;

/** The level step between two velocity layers of one key, in dB. */
const LAYER_STEP_DB = 4;

/** The full scale of the volume envelope of spessasynth_core, in dB. */
const ENVELOPE_RANGE_DB = 96;

/** spessasynth_core multiplies the initial attenuation by 0.4, as the EMU synths did. */
const ATTENUATION_FACTOR = 0.4;

/** The checksum and the size of one source file. */
export interface LockEntry {
  readonly sha256: string;
  readonly bytes: number;
}

/** The checksums of the source files, by `<source>/<path in the repository>`. */
export type SourceLock = Readonly<Record<string, LockEntry>>;

/** One zone of a new instrument, before the encode. */
interface ZonePlan {
  readonly region: SfzRegion;
  /** The key range of the zone. */
  readonly keys: readonly [number, number];
  /** The velocity range of the zone. */
  readonly velocities: readonly [number, number];
  /** The root key of the zone when it differs from the root of the region (a mapped drum key). */
  readonly rootKey: number | undefined;
}

/** A sample after the cut, with the region that it comes from. */
interface PreparedSample {
  readonly name: string;
  readonly region: SfzRegion;
  readonly sampleRate: number;
  readonly cut: CutSample;
  /** The pitch change that tunes the sample, in cents. */
  readonly tuneCents: number;
}

/**
 * Converts a time to SF2 timecents.
 *
 * @param seconds The time in seconds.
 * @returns The timecents, at least -12000 (1 ms).
 */
export function timecents(seconds: number): number {
  return seconds <= 0.001 ? -12_000 : Math.round(1200 * Math.log2(seconds));
}

/**
 * Converts an attenuation in dB to the value of the SF2 initial attenuation generator of
 * spessasynth_core, which multiplies the value by 0.4.
 *
 * @param db The attenuation in dB, 0 or more.
 * @returns The generator value in centibels before the factor, at most 1440.
 */
export function attenuationGenerator(db: number): number {
  return Math.min(1440, Math.max(0, Math.round((db * 10) / ATTENUATION_FACTOR)));
}

/**
 * Writes the sentence of the INFO comment that gives the headroom (design 6.2). The engine reads
 * the same value from `SOUNDFONT_HEADROOM_DB` of `src/audio/soundfont-info.ts`, and a test
 * compares the two.
 *
 * @param db The headroom in dB.
 * @returns The sentence, such as "Headroom: 6.5 dB below GeneralUser GS 2.0.3."
 */
export function headroomComment(db: number): string {
  return `Headroom: ${db.toFixed(1)} dB below ${BASE_SOUNDFONT.name}.`;
}

/**
 * Interpolates the longest sample length of a decay cut at a key.
 *
 * @param maxSec The lengths at key 24 and at key 96.
 * @param key The root key of the sample.
 * @returns The length in seconds. Keys outside 24 to 96 take the nearest end value.
 */
export function maxSecAt(maxSec: readonly [number, number], key: number): number {
  const t = Math.min(1, Math.max(0, (key - 24) / 72));
  return maxSec[0] + t * (maxSec[1] - maxSec[0]);
}

/** True for a region that plays at the note-on of the first round robin with no pedal. */
function isMainRegion(region: SfzRegion): boolean {
  return (
    region.trigger === 'attack' &&
    region.seqPosition === 1 &&
    region.lorand === 0 &&
    region.locc64 === 0
  );
}

/**
 * Plans the zones of one part: the main regions, one layer for each velocity of the recipe, the
 * key window, the key extension at both ends, and the drum key mapping.
 *
 * @param regions The regions of the SFZ file.
 * @param part The part recipe.
 * @returns The zones, ordered by key, then by velocity.
 */
export function planZones(regions: readonly SfzRegion[], part: PartRecipe): ZonePlan[] {
  const main = regions.filter(isMainRegion);
  if (part.keys) {
    return part.keys.flatMap((mapping) => {
      const sources = main.filter((r) => r.lokey <= mapping.from && mapping.from <= r.hikey);
      return layerZones(sources, part.velocities).map((zone): ZonePlan => ({
        region: zone.region,
        velocities: zone.velocities,
        keys: [mapping.key, mapping.key],
        rootKey: mapping.key - (mapping.from - zone.region.pitchKeycenter),
      }));
    });
  }
  const [low, high] = part.window;
  const inWindow = main.filter((r) => r.hikey >= low && r.lokey <= high);
  const groups = new Map<string, SfzRegion[]>();
  for (const region of inWindow) {
    const id = `${region.lokey}:${region.hikey}`;
    groups.set(id, [...(groups.get(id) ?? []), region]);
  }
  const lowest = Math.min(...inWindow.map((r) => r.lokey));
  const highest = Math.max(...inWindow.map((r) => r.hikey));
  const zones = [...groups.values()].flatMap((group) => layerZones(group, part.velocities));
  return zones
    .map((zone): ZonePlan => {
      let [from, to] = zone.keys;
      if (from === lowest) {
        from -= part.extend[0];
      }
      if (to === highest) {
        to += part.extend[1];
      }
      return {
        region: zone.region,
        velocities: zone.velocities,
        keys: [Math.max(low, from), Math.min(high, to)],
        rootKey: undefined,
      };
    })
    .toSorted((a, b) => a.keys[0] - b.keys[0] || a.velocities[0] - b.velocities[0]);
}

/**
 * Keeps one region of a key group for each velocity, and gives the kept regions contiguous
 * velocity ranges from 0 to 127.
 */
function layerZones(group: readonly SfzRegion[], velocities: readonly number[]): ZonePlan[] {
  const chosen: SfzRegion[] = [];
  for (const velocity of velocities) {
    const region =
      group.find((r) => r.lovel <= velocity && velocity <= r.hivel) ??
      group.toSorted(
        (a, b) =>
          Math.abs((a.lovel + a.hivel) / 2 - velocity) -
          Math.abs((b.lovel + b.hivel) / 2 - velocity),
      )[0];
    if (region && !chosen.includes(region)) {
      chosen.push(region);
    }
  }
  const sorted = chosen.toSorted((a, b) => a.hivel - b.hivel);
  return sorted.map((region, index) => ({
    region,
    keys: [region.lokey, region.hikey] as const,
    velocities: [
      index === 0 ? 0 : (sorted[index - 1]?.hivel ?? 0) + 1,
      index === sorted.length - 1 ? 127 : region.hivel,
    ] as const,
    rootKey: undefined,
  }));
}

/**
 * Finds the key ranges that no zone covers.
 *
 * @param covered The key ranges of the zones.
 * @returns The gaps between 0 and 127, in order.
 */
export function uncoveredRanges(
  covered: readonly (readonly [number, number])[],
): [number, number][] {
  const keys = new Uint8Array(128);
  for (const [from, to] of covered) {
    keys.fill(1, Math.max(0, from), Math.min(127, to) + 1);
  }
  const gaps: [number, number][] = [];
  let start = -1;
  for (let key = 0; key <= 128; key++) {
    if (key < 128 && keys[key] === 0) {
      if (start < 0) {
        start = key;
      }
    } else if (start >= 0) {
      gaps.push([start, key - 1]);
      start = -1;
    }
  }
  return gaps;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceUrl(source: SourceId, path: string): string {
  const repo = SOURCES[source];
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repo.repository}/${repo.commit}/${encoded}`;
}

async function download(url: string): Promise<Uint8Array<ArrayBuffer>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 4) {
        throw new Error(`The download of ${url} failed: ${String(error)}.`, { cause: error });
      }
    }
  }
}

/** Reads and writes the source files in a cache folder, and checks each one with the lock. */
class SourceFiles {
  readonly #cache: string;
  readonly #lock: Map<string, LockEntry>;
  /** The exact path of each lock key, by its key in lower case. */
  readonly #exact = new Map<string, string>();
  readonly #updateLock: boolean;
  /** The files of each repository, from the GitHub tree API. Only the lock update reads it. */
  readonly #trees = new Map<SourceId, Promise<Map<string, string>>>();

  constructor(cache: string, lock: SourceLock, updateLock: boolean) {
    this.#cache = cache;
    this.#lock = new Map(Object.entries(lock));
    for (const key of this.#lock.keys()) {
      this.#exact.set(key.toLowerCase(), key);
    }
    this.#updateLock = updateLock;
  }

  /** The lock keys of the files that this build read. */
  readonly #used = new Set<string>();

  /** The lock with the entries that this build used, sorted by key. */
  get usedLock(): SourceLock {
    return Object.fromEntries([...this.#used].toSorted().map((key) => [key, this.#entry(key)]));
  }

  #entry(key: string): LockEntry {
    const entry = this.#lock.get(key);
    if (!entry) {
      throw new Error(`The lock has no entry for ${key}.`);
    }
    return entry;
  }

  async #tree(source: SourceId): Promise<Map<string, string>> {
    let tree = this.#trees.get(source);
    if (!tree) {
      const repo = SOURCES[source];
      const url = `https://api.github.com/repos/${repo.repository}/git/trees/${repo.commit}?recursive=1`;
      tree = download(url).then((bytes) => {
        // SAFETY: the GitHub tree API returns an object with a `tree` array of entries.
        const body = JSON.parse(new TextDecoder().decode(bytes)) as {
          readonly tree: readonly { readonly path: string; readonly type: string }[];
        };
        return new Map(
          body.tree
            .filter((entry) => entry.type === 'blob')
            .map((entry) => [entry.path.toLowerCase(), entry.path]),
        );
      });
      this.#trees.set(source, tree);
    }
    return tree;
  }

  /**
   * Finds the lock key of a file. The SFZ files were made on Windows, so the case of a path can
   * differ from the repository.
   */
  async #key(source: SourceId, path: string): Promise<string> {
    const wanted = `${source}/${path}`;
    const known = this.#exact.get(wanted.toLowerCase());
    if (known) {
      return known;
    }
    if (!this.#updateLock) {
      throw new Error(`The lock has no entry for ${wanted}. Run the build with --update-lock.`);
    }
    const exact = (await this.#tree(source)).get(path.toLowerCase());
    if (!exact) {
      throw new Error(`The repository ${SOURCES[source].repository} has no file ${path}.`);
    }
    return `${source}/${exact}`;
  }

  /**
   * Reads a source file from the cache, or downloads it, and checks its checksum.
   *
   * @param source The library.
   * @param path The path in the repository, in any case.
   * @returns The bytes.
   * @throws Error if the checksum differs from the lock.
   */
  async read(source: SourceId, path: string): Promise<Uint8Array> {
    const key = await this.#key(source, path);
    const exactPath = key.slice(source.length + 1);
    const file = join(this.#cache, key);
    const entry = this.#lock.get(key);
    let bytes: Uint8Array | undefined;
    if (existsSync(file)) {
      bytes = new Uint8Array(await readFile(file));
      if (entry && sha256(bytes) !== entry.sha256) {
        bytes = undefined;
      }
    }
    if (!bytes) {
      bytes = await download(sourceUrl(source, exactPath));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    const hash = sha256(bytes);
    if (entry && entry.sha256 !== hash) {
      throw new Error(`The checksum of ${key} is ${hash}, but the lock has ${entry.sha256}.`);
    }
    if (!entry) {
      this.#lock.set(key, { sha256: hash, bytes: bytes.byteLength });
      this.#exact.set(key.toLowerCase(), key);
    }
    this.#used.add(key);
    return bytes;
  }

  /**
   * Reads the base SoundFont from the cache, or downloads it, and checks its checksum.
   *
   * @returns The bytes.
   * @throws Error if the checksum differs from {@link BASE_SOUNDFONT}.
   */
  async base(): Promise<Uint8Array> {
    const file = join(this.#cache, 'GeneralUserGS.sf3');
    let bytes = existsSync(file) ? new Uint8Array(await readFile(file)) : undefined;
    if (!bytes || sha256(bytes) !== BASE_SOUNDFONT.sha256) {
      bytes = await download(BASE_SOUNDFONT.url);
      await mkdir(this.#cache, { recursive: true });
      await writeFile(file, bytes);
    }
    if (sha256(bytes) !== BASE_SOUNDFONT.sha256) {
      throw new Error(`The checksum of ${BASE_SOUNDFONT.url} differs from BASE_SOUNDFONT.`);
    }
    return bytes;
  }
}

function pitchHz(region: SfzRegion): number {
  return 440 * 2 ** ((region.pitchKeycenter - 69 + region.tune / 100) / 12);
}

/** The largest pitch correction that the build trusts, in cents. */
const MAX_TUNE_CENTS = 60;

/**
 * Finds the pitch change that tunes a looped sample to its root key, from the pitch of its loop.
 * A sample with no loop, or with an unclear pitch, keeps the tune of its SFZ region.
 */
function tuneOf(cut: CutSample, sampleRate: number, region: SfzRegion): number {
  if (!cut.loop || cut.tail) {
    return region.tune;
  }
  const nominal = 440 * 2 ** ((region.pitchKeycenter - 69) / 12);
  const end = Math.min(cut.loop.end, cut.loop.start + Math.round(0.5 * sampleRate));
  const estimate = estimatePitch(cut.data, sampleRate, nominal, cut.loop.start, end);
  if (estimate.confidence < 0.9 || Math.abs(estimate.cents) > MAX_TUNE_CENTS) {
    return region.tune;
  }
  return -Math.round(estimate.cents);
}

/** Decodes, trims, and cuts the sample of one region. */
function prepareSample(
  bytes: Uint8Array,
  region: SfzRegion,
  part: PartRecipe,
): Omit<PreparedSample, 'name'> {
  const wav = decodeWav(bytes);
  const mono = mixToMono(wav.channels);
  removeDc(mono, wav.sampleRate);
  const fromOffset = mono.subarray(Math.min(region.offset, mono.length - 1));
  const onset = onsetFrame(fromOffset, wav.sampleRate, -45);
  const data = fromOffset.slice(onset);
  const cut =
    part.cut.mode === 'sustain'
      ? cutSustain(data, wav.sampleRate, pitchHz(region), part.cut)
      : cutDecay(data, wav.sampleRate, part.keys ? 0 : pitchHz(region), {
          floorDb: part.cut.floorDb,
          maxSec: maxSecAt(part.cut.maxSec, region.pitchKeycenter),
          tailLoopSec: part.cut.tailLoopSec,
        });
  return {
    region,
    sampleRate: wav.sampleRate,
    cut,
    tuneCents: tuneOf(cut, wav.sampleRate, region),
  };
}

async function encodeVorbis(data: Float32Array, sampleRate: number): Promise<Uint8Array> {
  const encoder = await createOggEncoder();
  // A fixed serial number makes the output the same on each build.
  encoder.configure({ channels: 1, sampleRate, vbrQuality: VORBIS_QUALITY, oggSerialNo: 1 });
  const body = encoder.encode([data]).slice();
  const end = encoder.finalize().slice();
  const out = new Uint8Array(body.length + end.length);
  out.set(body);
  out.set(end, body.length);
  return out;
}

/**
 * Measures the loudness of a cut sample in dB: the RMS of the loop of a sustained sound, or of
 * the first 0.4 s of a decaying sound.
 *
 * @param cut The cut sample.
 * @param sampleRate The sample rate in Hz.
 * @returns The RMS level in dB.
 */
export function sampleLoudness(cut: CutSample, sampleRate: number): number {
  const [from, to] =
    cut.loop && !cut.tail
      ? [cut.loop.start, cut.loop.end]
      : [0, Math.min(cut.data.length, Math.round(0.4 * sampleRate))];
  let sum = 0;
  for (let i = from; i < to; i++) {
    sum += (cut.data[i] ?? 0) ** 2;
  }
  return 10 * Math.log10(Math.max(sum / Math.max(1, to - from), 1e-20));
}

/**
 * Sets the level of each sample of one part. All samples of a layer get the same loudness, and
 * each softer layer is {@link LAYER_STEP_DB} quieter than the layer above it. The SFZ volumes of
 * the sources do not keep the layers in order, so the build does not use them. Then the part
 * scales so that its loudest peak is 0.95.
 */
function levelPart(
  samples: readonly PreparedSample[],
  ranks: ReadonlyMap<SfzRegion, number>,
  drumKit: boolean,
): void {
  for (const sample of samples) {
    const target = -LAYER_STEP_DB * (ranks.get(sample.region) ?? 0);
    scale(sample.cut.data, 10 ** ((target - sampleLoudness(sample.cut, sample.sampleRate)) / 20));
  }
  // The keys of a drum kit are different instruments, and each one gets its own calibration. So
  // the samples of each source key scale to full level, which leaves the most headroom.
  const groups = new Map<number, PreparedSample[]>();
  for (const sample of samples) {
    const id = drumKit ? sample.region.lokey : 0;
    groups.set(id, [...(groups.get(id) ?? []), sample]);
  }
  for (const group of groups.values()) {
    const peak = Math.max(
      ...group.map((sample) => sample.cut.data.reduce((max, v) => Math.max(max, Math.abs(v)), 0)),
    );
    for (const sample of group) {
      scale(sample.cut.data, peak > 0 ? 0.95 / peak : 1);
    }
  }
}

function scale(data: Float32Array, gain: number): void {
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] ?? 0) * gain;
  }
}

/**
 * Counts, for each region, the kept layers above it at its keys: 0 for the loudest layer.
 *
 * @param plans The zones of one part.
 * @returns The rank of each region.
 */
export function layerRanks(plans: readonly ZonePlan[]): Map<SfzRegion, number> {
  const ranks = new Map<SfzRegion, number>();
  for (const plan of plans) {
    const above = plans.filter(
      (other) =>
        other.keys[0] === plan.keys[0] &&
        other.keys[1] === plan.keys[1] &&
        other.velocities[0] > plan.velocities[0],
    ).length;
    ranks.set(plan.region, Math.max(ranks.get(plan.region) ?? 0, above));
  }
  return ranks;
}

/** Sets the coarse and the fine tune of a zone to a pitch change in cents. */
function setTune(zone: BasicZone, cents: number): void {
  const coarse = Math.trunc(cents / 100);
  zone.setGenerator(GeneratorTypes.coarseTune, coarse === 0 ? null : coarse);
  const fine = Math.round(cents - coarse * 100);
  zone.setGenerator(GeneratorTypes.fineTune, fine === 0 ? null : fine);
}

function setZoneGenerators(
  zone: BasicZone,
  plan: ZonePlan,
  part: PartRecipe,
  sample: PreparedSample,
): void {
  const cut = sample.cut;
  zone.keyRange = { min: plan.keys[0], max: plan.keys[1] };
  zone.velRange = { min: plan.velocities[0], max: plan.velocities[1] };
  setTune(zone, sample.tuneCents);
  if (plan.rootKey !== undefined) {
    zone.setGenerator(GeneratorTypes.overridingRootKey, plan.rootKey);
  }
  zone.setGenerator(GeneratorTypes.sampleModes, cut.loop ? 1 : 0);
  zone.setGenerator(
    GeneratorTypes.attackVolEnv,
    timecents(part.attackSec ?? Math.max(plan.region.ampegAttack, 0.002)),
  );
  zone.setGenerator(
    GeneratorTypes.releaseVolEnv,
    timecents(part.releaseSec ?? Math.max(plan.region.ampegRelease, 0.05)),
  );
  if (cut.tail) {
    zone.setGenerator(GeneratorTypes.holdVolEnv, timecents(cut.tail.holdSec));
    zone.setGenerator(
      GeneratorTypes.decayVolEnv,
      timecents(ENVELOPE_RANGE_DB / cut.tail.decayDbPerSec),
    );
    zone.setGenerator(GeneratorTypes.sustainVolEnv, 1000);
  }
}

/** Zones that share one level calibration, with the keys of the calibration notes. */
interface LevelGroup {
  readonly keys: readonly number[];
  readonly zones: readonly BasicZone[];
}

/** The zones of one part in the new preset, for the level calibration. */
interface BuiltPart {
  readonly part: PartRecipe;
  /** One group for a melodic part, one group for each key of a drum kit part. */
  readonly groups: readonly LevelGroup[];
}

/** The time window of a level measure, in seconds after the note-on. */
type LevelWindow = readonly [number, number];

/** The level window of a sustained part: after the attack. */
const SUSTAIN_WINDOW: LevelWindow = [0.3, 1.5];

/** The level window of a decaying part: the attack and the start of the decay. */
const DECAY_WINDOW: LevelWindow = [0.02, 0.8];

/** The level in dB of one note of a preset bank, in a time window after the note-on. */
function noteLevel(
  pcmBank: ArrayBuffer,
  drum: boolean,
  program: number,
  key: number,
  window: LevelWindow,
): number {
  const synth = new SpessaSynthProcessor(CALIBRATION_RATE, {
    effectsEnabled: false,
    eventsEnabled: false,
  });
  synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(pcmBank), 'calibration');
  const channel = drum ? 9 : 0;
  synth.processMessage(new Uint8Array([0xc0 | channel, program]));
  synth.processMessage(new Uint8Array([0x90 | channel, key, CALIBRATION_VELOCITY]));
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  let sum = 0;
  let count = 0;
  for (let frame = 0; frame < window[1] * CALIBRATION_RATE; frame += 128) {
    left.fill(0);
    right.fill(0);
    synth.process(left, right);
    if (frame >= window[0] * CALIBRATION_RATE) {
      for (let i = 0; i < 128; i++) {
        sum += (((left[i] ?? 0) + (right[i] ?? 0)) / 2) ** 2;
        count++;
      }
    }
  }
  synth.destroySynthProcessor();
  return 10 * Math.log10(Math.max(sum / count, 1e-20));
}

/** Writes one preset of a bank as a PCM SF2 file, as the decode Worker does. */
async function presetPcm(bank: BasicSoundBank, preset: BasicPreset): Promise<ArrayBuffer> {
  return sf3ToPcmSf2(splitPreset(bank, preset));
}

/** One preset that the build made. */
interface BuiltPreset {
  readonly preset: BasicPreset;
  readonly parts: readonly BuiltPart[];
  /** The zones of the base preset for the keys that the parts do not cover. */
  readonly fallback: readonly BasicPresetZone[];
}

/** Picks up to six keys, spread over a sorted list. */
function spreadKeys(keys: readonly number[]): number[] {
  const sorted = [...new Set(keys)].toSorted((a, b) => a - b);
  if (sorted.length <= 6) {
    return sorted;
  }
  return Array.from(
    { length: 6 },
    (_, i) => sorted[Math.round((i * (sorted.length - 1)) / 5)] ?? 0,
  );
}

/** An encoded sample in the output bank, with the cut that made it. */
interface StoredSample {
  readonly sample: BasicSample;
  readonly prepared: PreparedSample;
}

/**
 * Makes and keeps the encoded samples of each SFZ file and cut. Presets that use the same SFZ
 * file with the same layers and cut share the samples, so the SoundFont holds one copy. For
 * example, the ensemble strings (48, 49) use the samples of the section presets (40 to 43).
 */
class SampleStore {
  readonly #out: BasicSoundBank;
  readonly #files: SourceFiles;
  readonly #log: (line: string) => void;
  readonly #regions = new Map<string, Promise<SfzRegion[]>>();
  readonly #samples = new Map<string, Promise<Map<SfzRegion, StoredSample>>>();

  constructor(out: BasicSoundBank, files: SourceFiles, log: (line: string) => void) {
    this.#out = out;
    this.#files = files;
    this.#log = log;
  }

  /**
   * Parses an SFZ file one time.
   *
   * @param part The part that names the file.
   * @returns The regions. The same objects come back for each part with the same file.
   */
  regions(part: PartRecipe): Promise<SfzRegion[]> {
    const id = `${part.source}/${part.sfz}`;
    let regions = this.#regions.get(id);
    if (!regions) {
      regions = this.#files
        .read(part.source, part.sfz)
        .then((bytes) => parseSfz(new TextDecoder('latin1').decode(bytes)));
      this.#regions.set(id, regions);
    }
    return regions;
  }

  /**
   * Gives the samples of a part. The first part with a file and a cut makes the samples of all
   * keys of the file, so that a part with a smaller key window can share them.
   *
   * @param part The part.
   * @returns The sample of each kept region.
   */
  samples(part: PartRecipe): Promise<Map<SfzRegion, StoredSample>> {
    const id = JSON.stringify([part.source, part.sfz, part.velocities, part.cut, part.keys ?? []]);
    let samples = this.#samples.get(id);
    if (!samples) {
      samples = this.#make(part, `z${this.#samples.size}`);
      this.#samples.set(id, samples);
    }
    return samples;
  }

  async #make(part: PartRecipe, code: string): Promise<Map<SfzRegion, StoredSample>> {
    const full: PartRecipe = { ...part, window: [0, 127] };
    const plans = planZones(await this.regions(part), full);
    const unique = [...new Set(plans.map((plan) => plan.region))];
    const prepared: PreparedSample[] = [];
    for (const [index, region] of unique.entries()) {
      const path = posix.join(posix.dirname(part.sfz), region.sample);
      const sample = prepareSample(await this.#files.read(part.source, path), region, part);
      prepared.push({ ...sample, name: `${code}_${region.pitchKeycenter}_${index}` });
    }
    levelPart(prepared, layerRanks(plans), part.keys !== undefined);
    const stored = new Map<SfzRegion, StoredSample>();
    let seconds = 0;
    for (const item of prepared) {
      const loop = item.cut.loop;
      const sample = new BasicSample(
        item.name,
        item.sampleRate,
        item.region.pitchKeycenter,
        0,
        SampleTypes.monoSample,
        loop?.start ?? 0,
        loop?.end ?? item.cut.data.length - 1,
      );
      sample.setCompressedData(await encodeVorbis(item.cut.data, item.sampleRate));
      this.#out.addSamples(sample);
      stored.set(item.region, { sample, prepared: item });
      seconds += item.cut.data.length / item.sampleRate;
    }
    this.#log(`  ${part.sfz}: ${unique.length} new samples, ${seconds.toFixed(1)} s of audio`);
    return stored;
  }
}

/** Builds one preset into the output bank, and returns its parts for the calibration. */
async function buildPreset(
  out: BasicSoundBank,
  recipe: PresetRecipe,
  store: SampleStore,
): Promise<BuiltPreset> {
  const preset = new BasicPreset(out);
  preset.name = recipe.name;
  preset.program = recipe.program;
  preset.bankMSB = 0;
  preset.isGMGSDrum = recipe.bank === 128;
  out.addPresets(preset);
  const covered: [number, number][] = [];
  const parts: BuiltPart[] = [];
  for (const [partIndex, part] of recipe.parts.entries()) {
    const plans = planZones(await store.regions(part), part);
    const samples = await store.samples(part);
    const instrument = new BasicInstrument();
    instrument.name = `${recipe.name} ${partIndex + 1}`.slice(0, 20);
    out.addInstruments(instrument);
    const zones: { readonly key: number; readonly zone: BasicZone }[] = [];
    for (const plan of plans) {
      const stored = samples.get(plan.region);
      if (!stored) {
        throw new Error(`${recipe.name}: a zone has no sample.`);
      }
      const zone = instrument.createZone(stored.sample);
      setZoneGenerators(zone, plan, part, stored.prepared);
      zones.push({ key: plan.keys[0], zone });
      covered.push([plan.keys[0], plan.keys[1]]);
    }
    preset.createZone(instrument);
    const groups: LevelGroup[] = part.keys
      ? part.keys.map((mapping) => ({
          keys: [mapping.key],
          zones: zones.filter((item) => item.key === mapping.key).map((item) => item.zone),
        }))
      : [
          {
            keys: spreadKeys(plans.map((plan) => plan.region.pitchKeycenter)),
            zones: zones.map((item) => item.zone),
          },
        ];
    parts.push({ part, groups });
  }
  const fallback = addFallbackZones(out, preset, recipe, covered);
  return { preset, parts, fallback };
}

/** Adds the zones of the base preset for the keys that the new parts do not cover. */
function addFallbackZones(
  out: BasicSoundBank,
  preset: BasicPreset,
  recipe: PresetRecipe,
  covered: readonly (readonly [number, number])[],
): BasicPresetZone[] {
  const base = out.presets.find((item) => {
    const target = presetTarget(item);
    return item !== preset && target?.bank === recipe.bank && target.program === recipe.program;
  });
  if (!base) {
    return [];
  }
  const added: BasicPresetZone[] = [];
  for (const [from, to] of uncoveredRanges(covered)) {
    for (const zone of base.zones) {
      const min = Math.max(from, zone.keyRange.min < 0 ? 0 : zone.keyRange.min);
      const max = Math.min(to, zone.keyRange.max < 0 ? 127 : zone.keyRange.max);
      if (min > max) {
        continue;
      }
      // The new preset has no global zone, so the copy takes the global generators first.
      const copy = preset.createZone(zone.instrument);
      copy.copyFrom(base.globalZone);
      for (const generator of zone.generators) {
        copy.setGenerator(generator.type, generator.value);
      }
      copy.addModulators(...zone.modulators);
      copy.velRange = { ...zone.velRange };
      copy.keyRange = { min, max };
      added.push(copy);
    }
  }
  out.deletePreset(base);
  return added;
}

/**
 * Measures the level of each part against the base preset at the same keys, at velocity 100.
 *
 * @returns The level difference of each level group in dB (new minus base), in the order of the
 *   parts and their groups, or undefined for a preset that the base does not have.
 */
async function measureParts(
  out: BasicSoundBank,
  reference: BasicSoundBank,
  recipe: PresetRecipe,
  built: BuiltPreset,
): Promise<number[] | undefined> {
  const base = reference.presets.find((item) => {
    const target = presetTarget(item);
    return target?.bank === recipe.bank && target.program === recipe.program;
  });
  if (!base) {
    return undefined;
  }
  const basePcm = await presetPcm(reference, base);
  const newPcm = await presetPcm(out, built.preset);
  const drum = recipe.bank === 128;
  return built.parts.flatMap((part) => {
    const window = part.part.cut.mode === 'sustain' ? SUSTAIN_WINDOW : DECAY_WINDOW;
    return part.groups.map((group) => {
      const differences = group.keys
        .map(
          (key) =>
            noteLevel(newPcm, drum, recipe.program, key, window) -
            noteLevel(basePcm, drum, recipe.program, key, window),
        )
        .filter(Number.isFinite)
        .toSorted((a, b) => a - b);
      return differences[Math.floor(differences.length / 2)] ?? 0;
    });
  });
}

/**
 * Adds an attenuation to each zone of a preset. A zone with no attenuation of its own takes the
 * value of the global zone first, because a zone value replaces the global value.
 */
function addPresetAttenuation(preset: BasicPreset, zones: readonly BasicZone[], db: number): void {
  const global = preset.globalZone.getGenerator(GeneratorTypes.initialAttenuation, 0);
  for (const zone of zones) {
    const value = zone.getGenerator(GeneratorTypes.initialAttenuation, global);
    zone.setGenerator(GeneratorTypes.initialAttenuation, value + attenuationGenerator(db));
  }
}

/** Reads all source files of the recipes, eight at a time, so that the downloads overlap. */
async function prefetch(files: SourceFiles): Promise<void> {
  const paths = new Map<string, readonly [SourceId, string]>();
  for (const recipe of PRESET_RECIPES) {
    for (const part of recipe.parts) {
      const regions = parseSfz(
        new TextDecoder('latin1').decode(await files.read(part.source, part.sfz)),
      );
      for (const plan of planZones(regions, { ...part, window: [0, 127] })) {
        const path = posix.join(posix.dirname(part.sfz), plan.region.sample);
        paths.set(`${part.source}/${path}`, [part.source, path]);
      }
    }
  }
  const queue = [...paths.values()];
  const worker = async (): Promise<void> => {
    for (let next = queue.pop(); next; next = queue.pop()) {
      await files.read(next[0], next[1]);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

/** Adds the presets of {@link PRESET_ALIASES}: new programs with the zones of a built preset. */
function addAliases(out: BasicSoundBank, built: ReadonlyMap<number, BasicPreset>): void {
  for (const alias of PRESET_ALIASES) {
    const source = built.get(alias.of);
    if (!source) {
      throw new Error(`The alias ${alias.name} copies program ${alias.of}, which no recipe makes.`);
    }
    const base = out.presets.find((item) => {
      const target = presetTarget(item);
      return target?.bank === 0 && target.program === alias.program;
    });
    const preset = new BasicPreset(out);
    preset.name = alias.name;
    preset.program = alias.program;
    out.addPresets(preset);
    for (const zone of source.zones) {
      preset.createZone(zone.instrument).copyFrom(zone);
    }
    if (base) {
      out.deletePreset(base);
    }
  }
}

/** The command line options of the build. */
interface BuildOptions {
  readonly cache: string;
  readonly out: string;
  readonly updateLock: boolean;
  /** Stop after the downloads. */
  readonly fetchOnly: boolean;
}

async function build(options: BuildOptions): Promise<void> {
  SpessaLog.setLogLevel(false, false, false);
  await BasicSoundBank.isSF3DecoderReady;
  const log = (line: string): void => console.log(line);
  // SAFETY: the lock file is an object of LockEntry values, written by this script.
  const lock = existsSync(LOCK_PATH)
    ? (JSON.parse(await readFile(LOCK_PATH, 'utf8')) as SourceLock)
    : {};
  const files = new SourceFiles(options.cache, lock, options.updateLock);
  const baseBytes = await files.base();
  const copy = (): ArrayBuffer => Uint8Array.from(baseBytes).buffer;
  const out = SoundBankLoader.fromArrayBuffer(copy());
  const reference = SoundBankLoader.fromArrayBuffer(copy());
  await prefetch(files);
  if (options.updateLock) {
    await writeFile(LOCK_PATH, `${JSON.stringify(files.usedLock, undefined, 2)}\n`);
  }
  if (options.fetchOnly) {
    log('Fetched all source files.');
    return;
  }
  const store = new SampleStore(out, files, log);
  const melodic = new Map<number, BasicPreset>();
  const levels: { readonly built: BuiltPreset; readonly differences: readonly number[] }[] = [];
  for (const recipe of PRESET_RECIPES) {
    log(`${recipe.bank}:${recipe.program} ${recipe.name}`);
    const built = await buildPreset(out, recipe, store);
    const differences = await measureParts(out, reference, recipe, built);
    if (differences) {
      log(`  level against the base: ${differences.map((d) => `${d.toFixed(1)} dB`).join(', ')}`);
      levels.push({ built, differences });
    }
    if (recipe.bank === 0) {
      melodic.set(recipe.program, built.preset);
    }
  }
  // The quietest new part sets the headroom: each other preset gets this much attenuation, so
  // that the new parts can match the levels of the base with no gain above 0 dB.
  const headroom =
    Math.ceil(2 * Math.max(0, ...levels.flatMap((item) => item.differences.map((d) => -d)))) / 2;
  log(`Headroom: ${headroom.toFixed(1)} dB below the base SoundFont.`);
  const builtPresets = new Set(levels.map((item) => item.built.preset));
  for (const { built, differences } of levels) {
    built.parts
      .flatMap((part) => part.groups)
      .forEach((group, index) => {
        for (const zone of group.zones) {
          zone.setGenerator(
            GeneratorTypes.initialAttenuation,
            attenuationGenerator((differences[index] ?? 0) + headroom),
          );
        }
      });
    addPresetAttenuation(built.preset, built.fallback, headroom);
  }
  for (const preset of out.presets) {
    if (!builtPresets.has(preset)) {
      addPresetAttenuation(preset, preset.zones, headroom);
    }
  }
  addAliases(out, melodic);
  out.removeUnusedElements();
  // The names in the file keep the first name of the app, so that a build still writes the bytes
  // of the committed SoundFont. Change them with the next change of the recipes.
  out.soundBankInfo = {
    ...out.soundBankInfo,
    name: 'Zoophony Orchestra',
    creationDate: CREATION_DATE,
    engineer: 'Zoophony build (tools/build-soundfont.ts)',
    copyright:
      'GeneralUser GS 2.0.3 by S. Christian Collins (GeneralUser GS License v2.0). Samples of VSCO 2 CE and VCSL by Versilian Studios (CC0 1.0).',
    comment: `${headroomComment(headroom)} See assets/soundfont/README.md of the Zoophony repository.`,
  };
  out.flush();
  const bytes = new Uint8Array(out.writeSF2({ software: 'Zoophony' }));
  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, bytes);
  if (options.updateLock) {
    await writeFile(LOCK_PATH, `${JSON.stringify(files.usedLock, undefined, 2)}\n`);
  }
  log(
    `Wrote ${options.out}: ${bytes.byteLength.toLocaleString('en-US')} B, SHA-256 ${sha256(bytes)}.`,
  );
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      cache: { type: 'string', default: join(tmpdir(), 'pawchestra-soundfont') },
      out: { type: 'string', default: SOUNDFONT_PATH },
      'update-lock': { type: 'boolean', default: false },
      'fetch-only': { type: 'boolean', default: false },
    },
  });
  await build({
    cache: values.cache,
    out: values.out,
    updateLock: values['update-lock'],
    fetchOnly: values['fetch-only'],
  });
}
