import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseMidi } from '../src/midi/parse.ts';
import { sha256 } from './ref-tree.ts';

/** The program changes of one demo file (design 8.3). */
interface DemoPatch {
  /** File name in demos/src/. */
  readonly file: string;
  /** Sets the program of all program changes in one track. The index starts at 0. */
  readonly setProgram: readonly { readonly track: number; readonly program: number }[];
}

/** One demo file, after the changes of `demos/patches.json`. */
export interface DemoFile {
  /** File name in demos/src/, such as `beethoven-9.mid`. */
  readonly file: string;
  /** The id of the demo: the file name with no `.mid`, such as `beethoven-9`. */
  readonly id: string;
  /** The bytes after the changes. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** The bytes of the file in demos/src/, before the changes. */
  readonly source: Uint8Array<ArrayBuffer>;
}

/** The folder of the demo inputs and of `patches.json`. */
export const DEMOS_DIR = join(import.meta.dirname, '..', 'demos');

/**
 * Finds the program change data bytes of one track of a Standard MIDI File, with the parser of
 * `midi/`.
 *
 * @param bytes The bytes of the file.
 * @param track The index of the track chunk (MTrk), from 0. Other chunks do not count.
 * @returns The byte offset of the program of each program change, in file order.
 * @throws Error if the parser refuses the file, or if the file has no such track.
 */
export function programOffsets(bytes: Uint8Array, track: number): number[] {
  const result = parseMidi(bytes);
  if (!result.ok) {
    throw new Error(`The parser refuses the file: ${result.error}.`);
  }
  const events = result.file.tracks[track]?.events;
  if (!events) {
    throw new Error(`The file has no track ${track}.`);
  }
  return events.flatMap((event) =>
    event.type === 'channel' && event.kind === 0xc0 ? [event.dataOffset] : [],
  );
}

/**
 * Applies the program changes of one patch (design 8.3). The file keeps its length, because a
 * program is one data byte.
 *
 * @param bytes The bytes of the input file.
 * @param patch The changes of the file.
 * @returns A changed copy of the bytes.
 * @throws Error if a track of the patch does not exist or has no program change, or if a
 *   program is not 0 to 127.
 */
export function applyPatch(bytes: Uint8Array, patch: DemoPatch): Uint8Array<ArrayBuffer> {
  const out = Uint8Array.from(bytes);
  for (const { track, program } of patch.setProgram) {
    if (!Number.isInteger(program) || program < 0 || program > 127) {
      throw new Error(`${patch.file}: program ${program} is not 0 to 127.`);
    }
    const offsets = programOffsets(bytes, track);
    if (offsets.length === 0) {
      throw new Error(`${patch.file}: track ${track} has no program change.`);
    }
    for (const offset of offsets) {
      out[offset] = program;
    }
  }
  return out;
}

/**
 * Reads the SHA-256 table of `demos/README.md`: each row with a file in `src/` and a checksum.
 *
 * @param readme The text of the README.
 * @returns The checksum in lower-case hex for each file name in demos/src/.
 */
export function readChecksums(readme: string): Map<string, string> {
  const checksums = new Map<string, string>();
  for (const match of readme.matchAll(/^\| `src\/([^`]+)` \| `([0-9a-f]{64})` \|$/gm)) {
    const [, file, hash] = match;
    if (file && hash) {
      checksums.set(file, hash);
    }
  }
  return checksums;
}

/**
 * Checks the SHA-256 of a demo input against `demos/README.md`.
 *
 * @param file The file name in demos/src/.
 * @param bytes The bytes of the file.
 * @param checksums The table of {@link readChecksums}.
 * @throws Error if the README has no checksum for the file, or if the checksum differs.
 */
export function checkDemo(
  file: string,
  bytes: Uint8Array,
  checksums: ReadonlyMap<string, string>,
): void {
  const expected = checksums.get(file);
  if (!expected) {
    throw new Error(`demos/README.md has no SHA-256 for src/${file}.`);
  }
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(
      `src/${file} has the SHA-256 ${actual}, but demos/README.md gives ${expected}.`,
    );
  }
}

/**
 * Reads the patch list of `demos/patches.json`.
 *
 * @param text The text of the JSON file.
 * @returns The patches.
 * @throws Error if the file is not a list, if an entry has no file name, or if a change has no
 *   integer track and program.
 */
export function parsePatches(text: string): DemoPatch[] {
  // SAFETY: the loop below checks each field of each entry, also an entry that is not an object.
  const list = JSON.parse(text) as readonly (Partial<DemoPatch> | null)[];
  if (!Array.isArray(list)) {
    throw new Error('demos/patches.json is not a list.');
  }
  const patches: DemoPatch[] = [];
  for (const entry of list) {
    const file = entry?.file;
    const setProgram = entry?.setProgram;
    if (
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the JSON file is an I/O boundary.
      typeof file !== 'string' ||
      !file.endsWith('.mid') ||
      !Array.isArray(setProgram) ||
      !setProgram.every(
        (change) =>
          change instanceof Object &&
          Number.isInteger(change.track) &&
          Number.isInteger(change.program),
      )
    ) {
      throw new Error(
        `demos/patches.json has an entry that is not valid: ${JSON.stringify(entry)}.`,
      );
    }
    patches.push({ file, setProgram });
  }
  return patches;
}

/**
 * The demos of {@link patchedDemos} by their folder. A tool reads, checks, and patches each folder
 * one time in its process, also when a sweep asks for the demos once for each demo and variant.
 */
const DEMO_CACHE = new Map<string, Promise<DemoFile[]>>();

/**
 * Reads each demo input of demos/src/, checks its SHA-256, and applies `demos/patches.json`
 * (design 8.3). The first call for a folder reads it, and each later call gets the same files
 * ({@link DEMO_CACHE}) in a new list.
 *
 * @param dir The demos folder.
 * @returns The changed files, and the files with no patch as they are, sorted by name.
 * @throws Error if a checksum differs, or if a patch names a file that does not exist.
 */
export async function patchedDemos(dir = DEMOS_DIR): Promise<DemoFile[]> {
  let demos = DEMO_CACHE.get(dir);
  if (!demos) {
    demos = readPatchedDemos(dir);
    DEMO_CACHE.set(dir, demos);
  }
  return [...(await demos)];
}

/**
 * Reads each demo input of a folder, checks its SHA-256, and applies its `patches.json` (design
 * 8.3), for {@link patchedDemos}.
 *
 * @param dir The demos folder.
 * @returns The changed files, and the files with no patch as they are, sorted by name.
 * @throws Error if a checksum differs, or if a patch names a file that does not exist.
 */
async function readPatchedDemos(dir: string): Promise<DemoFile[]> {
  const checksums = readChecksums(await readFile(join(dir, 'README.md'), 'utf8'));
  const patches = parsePatches(await readFile(join(dir, 'patches.json'), 'utf8'));
  const files = (await readdir(join(dir, 'src')))
    .filter((file) => file.endsWith('.mid'))
    .toSorted();
  for (const patch of patches) {
    if (!files.includes(patch.file)) {
      throw new Error(`demos/patches.json names ${patch.file}, which is not in demos/src/.`);
    }
  }
  const demos: DemoFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(join(dir, 'src', file)));
    checkDemo(file, bytes, checksums);
    const patch = patches.find((item) => item.file === file);
    demos.push({
      file,
      id: file.replace(/\.mid$/, ''),
      bytes: patch ? applyPatch(bytes, patch) : bytes,
      source: bytes,
    });
  }
  return demos;
}

/**
 * Finds one demo of {@link patchedDemos} by its file name.
 *
 * @param file The file name in demos/src/, such as `boulanger-matin.mid`.
 * @returns The demo, after the changes of `demos/patches.json`.
 * @throws Error if demos/src/ has no such file, or for the reasons of {@link patchedDemos}.
 */
export async function patchedDemo(file: string): Promise<DemoFile> {
  const demo = (await patchedDemos()).find((d) => d.file === file);
  if (!demo) {
    throw new Error(`demos/src/ has no demo ${file}.`);
  }
  return demo;
}

async function main(): Promise<void> {
  const out = join(import.meta.dirname, '..', 'public', 'demos');
  const demos = await patchedDemos();
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const demo of demos) {
    await writeFile(join(out, demo.file), demo.bytes);
  }
  console.log(`Wrote ${demos.length} demo files to public/demos/.`);
}

if (import.meta.main) {
  await main();
}
