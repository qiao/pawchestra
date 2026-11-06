import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeSmf } from '../src/midi/test-smf.ts';
import { perf60File } from '../src/models/test-perf-60.ts';

/** The length of `perf-60.mid` in chords: one chord each second, 60 s of notes (design 9.5). */
const PERF_60_CHORDS = 60;

/**
 * The folder of `perf-60.mid`. Only the Vite dev server serves it, at `/perf/perf-60.mid`. The
 * build does not copy it into `dist/` (design 9.5).
 */
const PERF_60_DIR = join(import.meta.dirname, '..', 'perf');

/**
 * Writes the bytes of `perf-60.mid` from the seats of `perf60File()`, so that the tests and the
 * file have one source (design 9.5).
 *
 * @returns The bytes of the Standard MIDI File.
 */
export function perf60Bytes(): Uint8Array<ArrayBuffer> {
  return writeSmf(perf60File(PERF_60_CHORDS));
}

async function main(): Promise<void> {
  await mkdir(PERF_60_DIR, { recursive: true });
  const bytes = perf60Bytes();
  await writeFile(join(PERF_60_DIR, 'perf-60.mid'), bytes);
  console.log(`perf/perf-60.mid: ${bytes.byteLength} B`);
}

if (import.meta.main) {
  await main();
}
