import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DEMO_IDS } from '../src/app/demos.ts';
import {
  controlChange,
  noteOff,
  noteOn,
  programChange,
  sysEx,
  trackName,
  writeSmf,
} from '../src/midi/test-smf.ts';
import {
  applyPatch,
  checkDemo,
  DEMOS_DIR,
  parsePatches,
  patchedDemos,
  programOffsets,
  readChecksums,
} from './patch-demos.ts';
import type { DemoFile } from './patch-demos.ts';
import { sha256 } from './ref-tree.ts';

/** Lists the programs of the program changes of each track, at the offsets of `programOffsets()`. */
function trackPrograms(bytes: Uint8Array): number[][] {
  // Bytes 10 and 11 of the MThd chunk give the number of tracks.
  const tracks = ((bytes[10] ?? 0) << 8) | (bytes[11] ?? 0);
  return Array.from({ length: tracks }, (...[, track]) =>
    programOffsets(bytes, track).map((offset) => bytes[offset] ?? -1),
  );
}

describe('applyPatch', () => {
  const file = writeSmf({
    runningStatus: true,
    tracks: [
      [trackName('control track')],
      [programChange(0, 0, 68), noteOn(0, 0, 60), noteOff(480, 0, 60)],
      [
        programChange(0, 1, 70),
        // Running status: the second program change has no status byte.
        programChange(0, 1, 71),
        sysEx(10, [0x41, 0x10]),
        controlChange(20, 1, 7, 100),
        programChange(30, 1, 69),
        noteOn(30, 1, 50),
        noteOff(500, 1, 50),
      ],
    ],
  });

  it('sets the program of all program changes in one track (design 8.3)', () => {
    const result = applyPatch(file, { file: 'test.mid', setProgram: [{ track: 2, program: 52 }] });

    expect(trackPrograms(result)).toEqual([[], [68], [52, 52, 52]]);
    expect(result).toHaveLength(file.length);
  });

  it('finds the program bytes after running status, SysEx, and a control change', () => {
    const offsets = programOffsets(file, 2);

    expect(offsets).toHaveLength(3);
    expect(offsets.map((offset) => file[offset])).toEqual([70, 71, 69]);
  });

  it('does not change the input bytes', () => {
    const copy = Uint8Array.from(file);
    applyPatch(file, { file: 'test.mid', setProgram: [{ track: 1, program: 60 }] });

    expect(file).toEqual(copy);
  });

  it.each<readonly [string, number, number, string]>([
    ['a track that does not exist', 3, 52, 'no track 3'],
    ['a track with no program change', 0, 52, 'track 0 has no program change'],
    ['a program above 127', 1, 128, 'program 128'],
  ])('refuses %s', (...[, track, program, message]) => {
    expect(() => applyPatch(file, { file: 'test.mid', setProgram: [{ track, program }] })).toThrow(
      message,
    );
  });
});

describe('the checksums of demos/README.md', () => {
  it('gives a SHA-256 for each demo input', async () => {
    const checksums = readChecksums(await readFile(join(DEMOS_DIR, 'README.md'), 'utf8'));

    const files = (await patchedDemos()).map((demo) => demo.file);

    expect([...checksums.keys()].toSorted()).toEqual(files);
  });

  it('refuses a file with a different SHA-256', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksums = new Map([['a.mid', sha256(new Uint8Array([1, 2, 4]))]]);

    expect(() => checkDemo('a.mid', bytes, checksums)).toThrow('demos/README.md gives');
    expect(() => checkDemo('b.mid', bytes, checksums)).toThrow('has no SHA-256');
    expect(() => checkDemo('a.mid', new Uint8Array([1, 2, 4]), checksums)).not.toThrow();
  });
});

describe('parsePatches', () => {
  it('refuses an entry with no integer track', () => {
    const text = JSON.stringify([{ file: 'a.mid', setProgram: [{ track: '5', program: 60 }] }]);

    expect(() => parsePatches(text)).toThrow('not valid');
  });

  it.each<readonly [string, unknown]>([
    ['no file name', { setProgram: [] }],
    ['a file name that is not text', { file: 5, setProgram: [] }],
    ['no object', null],
    ['a change that is not an object', { file: 'a.mid', setProgram: [null] }],
  ])('refuses an entry with %s', (...[, entry]) => {
    expect(() => parsePatches(JSON.stringify([entry]))).toThrow('has an entry that is not valid');
  });
});

describe('the demo files after demos/patches.json (design 8.3)', () => {
  let demos: DemoFile[];

  beforeAll(async () => {
    demos = await patchedDemos();
  });

  /**
   * The tracks and the new program of each change of demos/README.md. No demo file needs a
   * change (design 8.2, 8.3).
   */
  const CHANGES = new Map<string, ReadonlyMap<number, number>>([
    [
      'bach-bwv1047.mid',
      new Map([
        [8, 42],
        [9, 6],
      ]),
    ],
  ]);

  it('gives all demo files, sorted by name', () => {
    expect(demos.map((demo) => demo.file)).toEqual(DEMO_IDS.map((id) => `${id}.mid`).toSorted());
  });

  it('gives the new programs to the changed tracks, and keeps all other programs', () => {
    for (const demo of demos) {
      const before = trackPrograms(demo.source);
      const changes = CHANGES.get(demo.file) ?? new Map<number, number>();
      const expected = before.map((programs, track) => {
        const program = changes.get(track);
        return program === undefined ? programs : programs.map(() => program);
      });

      expect(trackPrograms(demo.bytes), demo.file).toEqual(expected);
    }
  });

  it('changes only the program bytes', () => {
    for (const demo of demos) {
      const source = demo.source;
      const changed = [...demo.bytes.keys()].filter((i) => demo.bytes[i] !== source[i]);
      const changes = CHANGES.get(demo.file) ?? new Map<number, number>();
      const allowed = new Set(
        [...changes.keys()].flatMap((track) => programOffsets(source, track)),
      );

      expect(demo.bytes, demo.file).toHaveLength(source.length);
      expect(
        changed.every((i) => allowed.has(i)),
        demo.file,
      ).toBe(true);
    }
  });
});
