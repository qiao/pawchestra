import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { BasicSoundBank, SoundBankLoader } from 'spessasynth_core';
import type { BasicPreset } from 'spessasynth_core';

import { INDEX_FILE } from '../src/audio/preset-index.ts';
import type { PresetFileEntry } from '../src/audio/preset-index.ts';
import { DRUM_KIT_BANK } from '../src/score/synth.ts';
import type { ScorePreset } from '../src/score/types.ts';

/** The path of the source SoundFont, which `tools/build-soundfont.ts` writes (design 6.2). */
export const SOUNDFONT_PATH = join(
  import.meta.dirname,
  '..',
  'assets',
  'soundfont',
  'Pawchestra.sf3',
);

/** The fields of a preset that select its output file. */
export type PresetPatch = Pick<BasicPreset, 'bankMSB' | 'program' | 'isGMGSDrum' | 'isDrum'>;

/**
 * Finds the output file of a preset.
 *
 * A GM or GS drum kit goes to bank 128. A melodic preset keeps its bank MSB. The XG and GM2
 * copies of the drum kits (bank MSB 120 in GeneralUser GS) get no file. The score asks for each
 * drum kit in bank 128 (design 3.2).
 *
 * @param preset The preset of the source bank.
 * @returns The target, or undefined for a drum kit that is not a GM or GS kit.
 */
export function presetTarget(preset: PresetPatch): ScorePreset | undefined {
  if (preset.isGMGSDrum) {
    return { bank: DRUM_KIT_BANK, program: preset.program, drumKit: true };
  }
  if (preset.isDrum) {
    return undefined;
  }
  return { bank: preset.bankMSB, program: preset.program, drumKit: false };
}

/**
 * Calculates the site path of the file of a preset.
 *
 * @param target The bank and program of the preset.
 * @returns The path, such as `sf/0/40.sf3`.
 */
export function presetFilePath(target: ScorePreset): string {
  return `sf/${target.bank}/${target.program}.sf3`;
}

/**
 * Calculates the site path of the file of a preset with a hash of its bytes in the name, such as
 * `sf/0/40.3f2a9c1b7e.sf3`. A new SoundFont thus gives new names, and a host can keep each preset
 * file in the cache with no new check (design 6.2).
 *
 * @param target The bank and program of the preset.
 * @param data The bytes of the file.
 * @returns The path.
 */
export function hashedPresetFilePath(target: ScorePreset, data: ArrayBuffer): string {
  const hash = createHash('sha256').update(new Uint8Array(data)).digest('hex').slice(0, 10);
  return presetFilePath(target).replace(/\.sf3$/u, `.${hash}.sf3`);
}

/**
 * Sorts the index entries by bank, then by program.
 *
 * @param entries The entries in any order.
 * @returns A new sorted array.
 * @throws Error if two entries have the same bank and program.
 */
export function sortIndex(entries: readonly PresetFileEntry[]): PresetFileEntry[] {
  const sorted = entries.toSorted((a, b) => a.bank - b.bank || a.program - b.program);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous && current && previous.bank === current.bank) {
      if (previous.program === current.program) {
        throw new Error(`Two presets use bank ${current.bank}, program ${current.program}.`);
      }
    }
  }
  return sorted;
}

/**
 * Writes one preset of a sound bank as a new SF3 file. The file keeps the Ogg data and the loop
 * points of the samples, with no new encode.
 *
 * @param source The parsed source bank.
 * @param preset A preset of the source bank.
 * @returns The bytes of the new file.
 */
export function splitPreset(source: BasicSoundBank, preset: BasicPreset): ArrayBuffer {
  const bank = new BasicSoundBank();
  bank.soundBankInfo = { ...source.soundBankInfo, name: preset.name };
  bank.clonePreset(preset);
  bank.flush();
  return bank.writeSF2();
}

/**
 * Parses an SF3 file.
 *
 * @param path The path of the file.
 * @returns The parsed bank.
 */
export async function loadSoundBank(path: string): Promise<BasicSoundBank> {
  await BasicSoundBank.isSF3DecoderReady;
  const data = await readFile(path);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return SoundBankLoader.fromArrayBuffer(buffer);
}

async function main(): Promise<void> {
  const root = join(import.meta.dirname, '..');
  const site = join(root, 'public');
  const source = await loadSoundBank(SOUNDFONT_PATH);
  await rm(join(site, 'sf'), { recursive: true, force: true });
  const entries: PresetFileEntry[] = [];
  for (const preset of source.presets) {
    const target = presetTarget(preset);
    if (!target) {
      continue;
    }
    const data = splitPreset(source, preset);
    const file = hashedPresetFilePath(target, data);
    await mkdir(dirname(join(site, file)), { recursive: true });
    await writeFile(join(site, file), new Uint8Array(data));
    entries.push({ ...target, file, size: data.byteLength });
  }
  const index = sortIndex(entries);
  await writeFile(join(site, INDEX_FILE), `${JSON.stringify(index)}\n`);
  const total = index.reduce((sum, entry) => sum + entry.size, 0);
  console.log(
    `Wrote ${index.length} preset files (${total.toLocaleString('en-US')} B) and sf/index.json.`,
  );
}

if (import.meta.main) {
  await main();
}
