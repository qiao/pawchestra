/**
 * Probes a hash of the camera of `cameraAt()` over each demo (design 5.6). For each demo after
 * the changes of `demos/patches.json`, the probe builds the score, the layout, and the shot plan
 * as the app does. Then it samples the camera each {@link CAMERA_STEP} from 0 to the end of the
 * song, for each view of {@link CAMERA_VIEWS}. The hash holds the position, the target, the field
 * of view, the beam, the close flag, the light, and the spot of each sample as Float64 values.
 * Two runs on two commits show if a change moved the camera: the JSON of the same code is the
 * same, byte for byte. `--out` writes the JSON. With no `--out`, the tool prints the hash of each
 * demo and the total hash.
 *
 * Usage: pnpm camera-probe [--out <file>]
 *        pnpm camera-probe --compare <base.json> <new.json>
 *        pnpm camera-probe --base <ref>
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { Transport } from '../src/pose/types.ts';
import { buildScore } from '../src/score/score.ts';
import { cameraAt, createCameraPose } from '../src/shots/camera-at.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import type { CameraView } from '../src/shots/types.ts';
import { CINEMA_ASPECT } from '../src/shots/view.ts';
import { patchedDemos } from './patch-demos.ts';
import { checkFormat, formatVersion, runChild, withProbeTree } from './ref-tree.ts';

/** The step of the song time between two samples, in seconds. */
export const CAMERA_STEP = 0.25;

/**
 * The views of the probe: the aspect of the frame of Cinematic mode (design 2.5), with and
 * without motion. Each window shows that frame.
 */
export const CAMERA_VIEWS: readonly CameraView[] = [
  { aspect: CINEMA_ASPECT, still: false },
  { aspect: CINEMA_ASPECT, still: true },
];

/** The transport of a play from the song start, with no limit of the lift time. */
const PLAYING: Transport = {
  playing: true,
  changedAtWall: 0,
  before: null,
  startSec: 0,
  holdSec: 3,
  leadSec: Infinity,
};

/** The probe of the camera of one demo. */
export interface DemoCamera {
  /** The number of samples of each view. */
  readonly samples: number;
  /** The hash of the cameras of all samples of all views, as 16 hex digits. */
  readonly hash: string;
  /** The hash of the cameras of each view, by its aspect and its motion, such as `2.33 still`. */
  readonly views: Readonly<Record<string, string>>;
}

/** The output of the probe. */
export interface CameraProbe {
  /** The camera of each demo, by the name of the demo file with no `.mid`. */
  readonly demos: Readonly<Record<string, DemoCamera>>;
  /** The hash of the hashes of all demos, in the order of their names, as 16 hex digits. */
  readonly total: string;
}

/** The comparison of two probes. */
export interface CameraComparison {
  /** The count of the equal demos. */
  readonly counts: readonly string[];
  /** One line for each difference. */
  readonly differences: readonly string[];
}

/**
 * Gives the name of a view in the probe.
 *
 * @param view The view.
 * @returns The name, such as `2.33 moving` or `2.33 still`.
 */
function viewName(view: CameraView): string {
  return `${view.aspect.toFixed(2)} ${view.still ? 'still' : 'moving'}`;
}

/**
 * Probes the camera of one demo: the score, the layout, and the shot plan as the app makes them,
 * then the camera at each sample of each view.
 *
 * @param bytes The bytes of the demo file, after its patch.
 * @returns The probe of the demo.
 * @throws Error if `buildScore()` refuses the file.
 */
export function probeDemoCamera(bytes: Uint8Array): DemoCamera {
  const result = buildScore(bytes, 'auto');
  if (!result.ok) {
    throw new Error(`buildScore() refused the demo: ${result.error}.`);
  }
  const score = result.score;
  const models = new ModelCache();
  const layout = layoutScene(score, models);
  const plan = prepareShots(score, layout, SHOT_SEED, models);
  const count = Math.floor(score.durationSec / CAMERA_STEP) + 1;
  const buffer = createCameraPose();
  const values = new Float64Array(10);
  const all = createHash('sha256');
  const views: Record<string, string> = {};
  for (const view of CAMERA_VIEWS) {
    const hash = createHash('sha256');
    for (let i = 0; i < count; i++) {
      const camera = cameraAt(plan, i * CAMERA_STEP, PLAYING, view, buffer);
      values.set(camera.position, 0);
      values.set(camera.target, 3);
      values[6] = camera.fov;
      values[7] = camera.beam;
      values[8] = camera.light;
      values[9] = camera.spot;
      hash.update(values);
      hash.update(camera.close ? 'c' : 'o');
    }
    const digest = hash.digest('hex').slice(0, 16);
    views[viewName(view)] = digest;
    all.update(digest);
  }
  return { samples: count, hash: all.digest('hex').slice(0, 16), views };
}

/**
 * Probes the camera of each demo (design 8.2), after the changes of `demos/patches.json`.
 *
 * @returns The probe.
 */
export async function runProbe(): Promise<CameraProbe> {
  const demos: Record<string, DemoCamera> = {};
  const total = createHash('sha256');
  for (const demo of await patchedDemos()) {
    const name = demo.file.replace(/\.mid$/, '');
    const camera = probeDemoCamera(demo.bytes);
    demos[name] = camera;
    total.update(`${name}:${camera.hash};`);
  }
  return { demos, total: total.digest('hex').slice(0, 16) };
}

/**
 * Compares two probes, and gives the count of the equal demos and a line for each demo that
 * differs, with the views that differ.
 *
 * @param base The probe of the base.
 * @param next The probe to check.
 * @returns The count and the differences.
 */
export function compareProbes(base: CameraProbe, next: CameraProbe): CameraComparison {
  const lines: string[] = [];
  let equal = 0;
  const names = [...new Set([...Object.keys(base.demos), ...Object.keys(next.demos)])];
  for (const name of names) {
    const a = base.demos[name];
    const b = next.demos[name];
    if (!a || !b) {
      lines.push(`demo ${name}: missing in the ${a ? 'new probe' : 'base'}`);
      continue;
    }
    if (a.hash === b.hash && a.samples === b.samples) {
      equal += 1;
      continue;
    }
    const views = Object.keys(a.views).filter((view) => a.views[view] !== b.views[view]);
    const samples = a.samples === b.samples ? '' : `, samples ${a.samples} to ${b.samples}`;
    lines.push(`demo ${name}: views differ (${views.join(', ') || 'none'})${samples}`);
  }
  return { counts: [`demos equal: ${equal} of ${names.length}`], differences: lines };
}

/**
 * The format version of the JSON of `--out` (`formatVersion()` of `tools/ref-tree.ts`). A change
 * of the format takes the next version, so that a compare stops on two formats.
 */
export const PROBE_FORMAT = 1;

/**
 * Writes a probe as the JSON of `--out`, with the format version {@link PROBE_FORMAT}.
 *
 * @param probe The probe.
 * @returns The text, with a line end at the end.
 */
export function probeText(probe: CameraProbe): string {
  return `${JSON.stringify({ version: PROBE_FORMAT, ...probe }, null, 1)}\n`;
}

/** A probe file and the format version of its JSON. */
interface ProbeFile {
  /** The probe. */
  readonly probe: CameraProbe;
  /** The format version of the JSON. */
  readonly version: number;
}

/**
 * Reads a probe file that this tool wrote.
 *
 * @param file The path of the file.
 * @returns The probe and the format version of its JSON.
 */
async function readProbe(file: string): Promise<ProbeFile> {
  const text = await readFile(file, 'utf8');
  // SAFETY: the file is the output of this tool, which writes a CameraProbe as JSON.
  return { probe: JSON.parse(text) as CameraProbe, version: formatVersion(text) };
}

/**
 * Probes the camera of a commit. The folder of `withProbeTree()` holds the code, the demos, and
 * the tools of the commit. A commit with no `tools/camera-probe.ts` gets the script of the working
 * tree. The probe runs in a child process, so that the caller can probe the working tree at the
 * same time.
 *
 * @param ref The commit, a branch, or a tag.
 * @returns The probe of the commit.
 * @throws Error if git does not know the ref, if the probe fails on the code of the commit, or if
 *   its JSON has another format version than {@link PROBE_FORMAT}.
 */
export function probeRef(ref: string): Promise<CameraProbe> {
  return withProbeTree(
    ref,
    async (dir) => {
      const out = join(dir, 'camera-probe.json');
      await runChild(process.execPath, [join('tools', 'camera-probe.ts'), '--out', out], dir);
      const { probe, version } = await readProbe(out);
      checkFormat('camera-probe.ts', ref, version, PROBE_FORMAT);
      return probe;
    },
    { parent: tmpdir(), prefix: 'camera-probe-' },
  );
}

/**
 * Prints a comparison, and ends the process: with 1 when there is a difference.
 *
 * @param title The first line, or `null` for none.
 * @param comparison The comparison.
 */
function printComparison(title: string | null, comparison: CameraComparison): never {
  const lines = [...comparison.counts, ...comparison.differences];
  console.log((title ? [title, ...lines] : lines).join('\n'));
  process.exit(comparison.differences.length > 0 ? 1 : 0);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf('--base');
  if (baseAt >= 0) {
    const ref = args[baseAt + 1];
    if (!ref || ref.startsWith('--')) {
      throw new Error('Usage: pnpm camera-probe --base <ref>');
    }
    // Both probes end before a failure stops the process, so the temporary folder goes away.
    const [base, next] = await Promise.allSettled([probeRef(ref), runProbe()]);
    if (base.status === 'rejected') {
      throw base.reason;
    }
    if (next.status === 'rejected') {
      throw next.reason;
    }
    printComparison(`base ${ref}, new: the working tree`, compareProbes(base.value, next.value));
  }
  const compare = args.indexOf('--compare');
  if (compare >= 0) {
    const [baseFile, nextFile] = [args[compare + 1], args[compare + 2]];
    if (!baseFile || !nextFile) {
      throw new Error('Usage: pnpm camera-probe --compare <base.json> <new.json>');
    }
    const [base, next] = [await readProbe(baseFile), await readProbe(nextFile)];
    if (base.version !== next.version) {
      throw new Error(
        `The probe file ${baseFile} has the format version ${base.version}, and ${nextFile} has the format version ${next.version}. A compare of two formats gives false differences.`,
      );
    }
    printComparison(null, compareProbes(base.probe, next.probe));
  }
  const probe = await runProbe();
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  if (out) {
    await writeFile(out, probeText(probe));
  }
  const lines = Object.entries(probe.demos).map(
    ([name, demo]) => `${name}: ${demo.hash} (${demo.samples} samples)`,
  );
  const next = out ? `Wrote ${out}.` : 'Write the JSON with --out <file>.';
  console.log([...lines, `total: ${probe.total}`, next].join('\n'));
}
