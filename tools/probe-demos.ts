import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  note,
  programChange,
  tempo,
  timeSignature,
  track,
  trackName,
} from '../src/midi/test-smf.ts';
import { writeSmf } from '../src/midi/test-smf.ts';
import type { TestEvent, TestFile } from '../src/midi/test-smf.ts';
import { RHYTHM_CHANNEL } from '../src/score/drum-map.ts';
import { patchedDemos } from './patch-demos.ts';
import type { DemoFile } from './patch-demos.ts';

/** The ticks of one quarter note. */
const Q = 480;

/** The bars of the percussion test score, in 4/4 at 100 BPM: 38.4 s. */
const BARS = 16;

/** The GM1 keys of the rhythm channel that the percussion test score plays (design 3.6). */
const DRUM_KEYS = {
  bass: 36,
  snare: 38,
  crash: 49,
  triangle: 81,
  tambourine: 54,
} as const;

/** The lowest and the highest key of the xylophone of the app (`XYLOPHONE.keys`). */
const XYLOPHONE_KEYS = [72, 101] as const;

/**
 * Makes one drum note of the rhythm channel.
 *
 * @param beat The start, in quarter notes from the start of the score.
 * @param key The GM1 key.
 * @returns The events of the note, a sixteenth note long.
 */
function hit(beat: number, key: number): TestEvent[] {
  const tick = Math.round(beat * Q);
  return note(tick, RHYTHM_CHANNEL, key, tick + Q / 4 - 10);
}

/**
 * Makes the notes of one bar of the drum part: the bass drum on beats 1 and 3, the snare drum on
 * beats 2 and 4 with a roll of sixteenth notes in each fourth bar, the crash cymbals at the start
 * of each second bar, the triangle on beat 2 of the odd bars, and the tambourine on beat 4 of the
 * even bars.
 *
 * @param bar The bar, from 0.
 * @returns The events of the bar.
 */
function drumBar(bar: number): TestEvent[][] {
  const at = bar * 4;
  const notes = [hit(at, DRUM_KEYS.bass), hit(at + 2, DRUM_KEYS.bass)];
  const snare = bar % 4 === 3 ? [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] : [1, 3];
  notes.push(...snare.map((beat) => hit(at + beat, DRUM_KEYS.snare)));
  if (bar % 2 === 0) {
    notes.push(hit(at, DRUM_KEYS.crash));
  }
  notes.push(bar % 2 === 1 ? hit(at + 1, DRUM_KEYS.triangle) : hit(at + 3, DRUM_KEYS.tambourine));
  return notes;
}

/**
 * Makes the notes of the xylophone: eighth notes that go up and down over each key of the
 * xylophone, the sharps too, so that each bar of both rows gets strikes.
 *
 * @param channel The channel.
 * @returns The events.
 */
function xylophoneNotes(channel: number): TestEvent[][] {
  const [low, high] = XYLOPHONE_KEYS;
  const span = high - low;
  return Array.from({ length: BARS * 8 }, (_, i) => {
    const phase = i % (2 * span);
    const key = phase <= span ? low + phase : high - (phase - span);
    const tick = i * (Q / 2);
    return note(tick, channel, key, tick + Q / 2 - 10);
  });
}

/**
 * Builds the percussion test score of the probe tools:
 * a drum part with each player of a percussion seat (the bass drum, the snare drum, the cymbals,
 * and the small percussion), and two xylophone parts on two channels, so that the score has 6
 * players and keeps the layout of an orchestra (design 4.2). No demo has a snare drum or a
 * xylophone, so the probes measure their holds on this score. It is no demo, and the app does not
 * load it.
 *
 * @returns The test file.
 */
function percussionTestFile(): TestFile {
  return {
    tracks: [
      [trackName('Percussion Test'), tempo(0, 100), timeSignature(0, 4, 4)],
      track(
        [trackName('Drums'), programChange(0, RHYTHM_CHANNEL, 0)],
        ...Array.from({ length: BARS }, (_, bar) => drumBar(bar)).flat(),
      ),
      track([trackName('Xylophone I'), programChange(0, 0, 13)], ...xylophoneNotes(0)),
      track([trackName('Xylophone II'), programChange(0, 1, 13)], ...xylophoneNotes(1)),
    ],
  };
}

/**
 * The scores of the probe tools that are no demo, by their file name: scores with the parts that
 * no demo plays.
 */
const TOOL_SCORES: ReadonlyMap<string, () => TestFile> = new Map([
  ['percussion-test.mid', percussionTestFile],
]);

/**
 * Gives the name of a MIDI file of the user in the list of the probe tools: its base name with one
 * `.mid` at the end, such as `Disney_Themes_-_Whole_New_World.mid`. A tool selects the file by this
 * name with `--demo`, with or with no `.mid`.
 *
 * @param path The path of the file.
 * @returns The name.
 */
export function userDemoFile(path: string): string {
  return `${basename(path).replace(/(\.midi?)+$/i, '')}.mid`;
}

/**
 * Reads the path of a `--midi` option: a MIDI file of the user outside the repository. The path
 * becomes absolute, so that a child process in the tree of a commit (`--base`) reads the same file.
 *
 * @param value The value of the option.
 * @returns The absolute path.
 * @throws Error if the file does not exist.
 */
export function midiPath(value: string): string {
  const path = resolve(value);
  if (!existsSync(path)) {
    throw new Error(`The MIDI file ${path} of --midi does not exist.`);
  }
  return path;
}

/**
 * Makes the path of each `--midi` option of a command line absolute ({@link midiPath}), for the
 * command line of a child process in another folder.
 *
 * @param args The arguments.
 * @returns The arguments with absolute paths.
 */
export function absoluteMidi(args: readonly string[]): string[] {
  return args.map((arg, i) => (args[i - 1] === '--midi' ? resolve(arg) : arg));
}

/**
 * Reads the MIDI files of the user of `--midi`. The tools read each file from its path, and copy
 * no file into the repository. The app plays a file of the user with no patch, so the bytes are
 * the bytes of the file.
 *
 * @param paths The paths of the files.
 * @param known The names of the other files of the list, such as the demos.
 * @returns The files, by the names of {@link userDemoFile}.
 * @throws Error if two files have one name, or a file has the name of a known file.
 */
function userDemos(paths: readonly string[], known: readonly string[] = []): DemoFile[] {
  const names: string[] = [...known];
  return paths.map((path) => {
    const file = userDemoFile(path);
    if (names.includes(file)) {
      throw new Error(`The MIDI file ${path} has the name ${file}, which another file has.`);
    }
    names.push(file);
    const bytes = new Uint8Array(readFileSync(path));
    return { file, id: file.replace(/\.mid$/, ''), bytes, source: bytes };
  });
}

/**
 * Gives the scores of the probe tools of the poses and the bodies (`pnpm pose-depth`, `pnpm
 * hold-fit`, `pnpm fold-probe`, `pnpm arm-check`, `pnpm hold-reach`, and `pnpm mesh-options`):
 * each demo of {@link patchedDemos}, then each score of {@link TOOL_SCORES}, then each MIDI file of
 * the user of `--midi` ({@link userDemos}). A role with no player in a tool score keeps the demos
 * of the app.
 *
 * @param midi The paths of the MIDI files of the user, or none.
 * @returns The demos, the tool scores, and the files of the user.
 * @throws Error if a file of the user has the name of another file.
 */
export async function probeDemos(midi: readonly string[] = []): Promise<DemoFile[]> {
  const tools = [...TOOL_SCORES].map(([file, build]): DemoFile => {
    const bytes = writeSmf(build());
    return { file, id: file.replace(/\.mid$/, ''), bytes, source: bytes };
  });
  const listed = [...(await patchedDemos()), ...tools];
  return [
    ...listed,
    ...userDemos(
      midi,
      listed.map((demo) => demo.file),
    ),
  ];
}
