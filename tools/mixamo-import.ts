/**
 * Converts a Mixamo file into a GLB file in meters, and prints its bones, its rest pose, and its
 * clips (design 4.4, 8.1). Usage: `pnpm mixamo-import <file.fbx|file.glb> --out <dir>`.
 *
 * Headless Blender (`tools/blender/mixamo_import.py`) removes the prefix `mixamorig:` from each
 * bone, bakes the turn and the scale of the armature object, and writes `<dir>/<name>.glb` with
 * one animation for each take. The tool then reads the file with the reader of the app
 * (`readSourceFile()`), so that the printed facts are the facts that the gallery reads:
 *
 * - each bone with its parent, its rest place in meters, and its bone of the player
 *   (`MIXAMO_BONES`);
 * - the rest pose: the height, the facing, and the angle of each upper arm below the horizontal
 *   (0° for a T-pose);
 * - each clip with its duration and its tracks;
 * - the bones of the map that the file does not have, and the bones that the map does not know.
 *
 * A Mixamo file stays out of git (design 8.1), so the tool refuses an output folder inside the
 * repository that git does not ignore. `BLENDER` names another Blender binary.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import { Matrix4, Quaternion, Vector3 } from 'three';

import { readSourceFile } from '../src/models/source-clips.ts';
import type { SourceFile } from '../src/models/source-clips.ts';
import { MIXAMO_BONES, isMixamoBone } from '../src/pose/mixamo-bones.ts';
import { optionValue } from './ref-tree.ts';
import { trackChild } from './stop-cleanup.ts';

/** The root of the repository. */
const ROOT = join(import.meta.dirname, '..');

/** The Blender script of the conversion. */
const SCRIPT = join(ROOT, 'tools', 'blender', 'mixamo_import.py');

/** The usage line. */
const USAGE = 'Usage: pnpm mixamo-import <file.fbx|file.glb> --out <dir>';

/**
 * Tells whether git keeps a path out of the repository: a path outside the repository, or a path
 * that `.gitignore` ignores.
 *
 * @param path The absolute path.
 * @returns True when git ignores the path.
 */
export function outsideGit(path: string): boolean {
  const inside = relative(ROOT, path);
  if (inside.startsWith('..') || resolve(ROOT, inside) !== path) {
    return true;
  }
  const result = spawnSync('git', ['check-ignore', '-q', inside], { cwd: ROOT });
  return result.status === 0;
}

/**
 * Runs a Blender script of `tools/blender/` with headless Blender, and prints its log lines: the
 * lines that start with the name of the script and a colon.
 *
 * @param script The path of the script.
 * @param args The arguments of the script.
 * @returns A promise that ends when Blender ends.
 */
export function runBlenderScript(script: string, args: readonly string[]): Promise<void> {
  const blender = process.env['BLENDER'] ?? 'blender';
  const head = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', script, '--'];
  const prefix = `${basename(script, '.py')}:`;
  return new Promise((done, fail) => {
    const child = trackChild(
      spawn(blender, [...head, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
    let errors = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (text: string) => {
      for (const line of text.split('\n')) {
        if (line.startsWith(prefix)) {
          console.log(line);
        }
      }
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (text: string) => {
      errors += text;
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (code === 0) {
        done();
        return;
      }
      const cause = errors.trim().split('\n').at(-1) ?? '';
      fail(new Error(`${blender} failed with the status ${String(code)}: ${cause}`));
    });
  });
}

/**
 * Calculates the rest place of each bone of a file, in meters.
 *
 * @param file The file.
 * @returns The world place of each bone.
 */
function restPlaces(file: SourceFile): Vector3[] {
  const { skeleton } = file;
  const worlds: Matrix4[] = [];
  return skeleton.names.map((_, i) => {
    const local = new Matrix4().compose(
      new Vector3(...(skeleton.translations[i] ?? [0, 0, 0])),
      new Quaternion(...(skeleton.rotations[i] ?? [0, 0, 0, 1])),
      new Vector3(1, 1, 1),
    );
    const parent = worlds[skeleton.parents[i] ?? -1] ?? new Matrix4().fromArray(skeleton.base);
    const world = parent.clone().multiply(local);
    worlds.push(world);
    return new Vector3().setFromMatrixPosition(world);
  });
}

/**
 * Prints the facts of a converted file.
 *
 * @param file The file.
 */
function printFacts(file: SourceFile): void {
  const { names, parents } = file.skeleton;
  const places = restPlaces(file);
  const at = (name: string): Vector3 | undefined => places[names.indexOf(name)];
  const text = (v: Vector3): string => [v.x, v.y, v.z].map((x) => x.toFixed(3)).join(', ');

  console.log(`bones: ${names.length}`);
  for (const [i, name] of names.entries()) {
    const target = isMixamoBone(name) ? (MIXAMO_BONES[name] ?? '-') : '?';
    const parent = names[parents[i] ?? -1] ?? '-';
    console.log(
      `  ${name.padEnd(18)} parent ${parent.padEnd(18)} at ${text(places[i] ?? new Vector3())}  -> ${target}`,
    );
  }

  const heights = places.map((p) => p.y);
  console.log(
    `rest: height ${(Math.max(...heights) - Math.min(...heights)).toFixed(3)} m, ` +
      `from y ${Math.min(...heights).toFixed(3)} to ${Math.max(...heights).toFixed(3)}`,
  );
  const toes = at('LeftToeBase');
  const foot = at('LeftFoot');
  if (toes && foot) {
    console.log(`rest: the feet point to ${text(toes.clone().sub(foot).setY(0).normalize())}`);
  }
  for (const side of ['Left', 'Right'] as const) {
    const arm = at(`${side}Arm`);
    const fore = at(`${side}ForeArm`);
    if (arm && fore) {
      const d = fore.clone().sub(arm).normalize();
      const below = (Math.asin(-d.y) * 180) / Math.PI;
      console.log(`rest: ${side} upper arm ${below.toFixed(1)}° below the horizontal`);
    }
  }

  for (const clip of file.clips) {
    const keys = Math.max(0, ...clip.tracks.map((t) => t.times.length));
    console.log(
      `clip: ${clip.name}, ${clip.duration.toFixed(3)} s, ${keys} keys, ${clip.tracks.length} tracks`,
    );
  }
  const missing = Object.keys(MIXAMO_BONES).filter((name) => !names.includes(name));
  const unknown = names.filter((name) => !isMixamoBone(name));
  console.log(`map: missing ${missing.length > 0 ? missing.join(', ') : 'none'}`);
  console.log(`map: unknown ${unknown.length > 0 ? unknown.join(', ') : 'none'}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = args[0];
  const outDir = optionValue(args, '--out');
  if (!input || input.startsWith('--') || !outDir) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const source = resolve(input);
  const dir = resolve(outDir);
  if (!outsideGit(dir)) {
    console.error(
      `The folder ${dir} is in git. A Mixamo file stays out of git (design 8.1): give a folder in scratch/ or outside the repository.`,
    );
    process.exitCode = 1;
    return;
  }
  printFacts(readSourceFile(new Uint8Array(readFileSync(await importMixamo(source, dir)))));
}

/**
 * Converts a Mixamo file into a GLB file in meters (`tools/blender/mixamo_import.py`).
 *
 * @param source The FBX, GLB, or glTF file.
 * @param dir The output folder, which git must ignore.
 * @returns The path of `<dir>/<name>.glb`.
 */
export async function importMixamo(source: string, dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${basename(source, extname(source))}.glb`);
  await runBlenderScript(SCRIPT, [source, out]);
  return out;
}

if (import.meta.main) {
  await main();
}
