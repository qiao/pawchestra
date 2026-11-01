/**
 * Reads a Mixamo-rigged mesh, and writes the joints and the painted weights of a rig config
 * (design 4.4, 8.1). Usage: `pnpm mixamo-model <file.fbx|file.glb> --out <dir>`.
 *
 * The tool first converts the file as `pnpm mixamo-import` does (into `<dir>/import/`), then runs
 * `tools/blender/mixamo_model.py`, which writes into `<dir>`:
 *
 * - `<name>.glb`: the mesh alone in its rest pose, for `source` of `tools/mesh-rigs/<a>.json`;
 * - `<name>-joints.json`: the `joints` and the `palm` of the config, in the studio units and axes,
 *   with the joints that Mixamo does not have (the ears and the tail) under `missing`;
 * - `<name>-weights.json`: the file of `paintedWeights`, with the skin of Mixamo on the studio
 *   bones.
 *
 * `pnpm rig-mesh` then adds the eyes, the palms, the arm segments, and the seat to the body
 * ("Steps of a new body" of `docs/agents/rigging.md`). The output of the auto-rigger of Mixamo
 * stays out of git until the project author decides its rule (design 8.1), so the tool refuses an
 * output folder that git does not ignore.
 */

import { join, resolve } from 'node:path';

import { importMixamo, outsideGit, runBlenderScript } from './mixamo-import.ts';
import { optionValue } from './ref-tree.ts';

/** The Blender script that reads the skin. */
const SCRIPT = join(import.meta.dirname, 'blender', 'mixamo_model.py');

/** The usage line. */
const USAGE = 'Usage: pnpm mixamo-model <file.fbx|file.glb> --out <dir>';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = args[0];
  const outDir = optionValue(args, '--out');
  if (!input || input.startsWith('--') || !outDir) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const dir = resolve(outDir);
  if (!outsideGit(dir)) {
    console.error(
      `The folder ${dir} is in git. The output of the Mixamo auto-rigger stays out of git (design 8.1): give a folder in scratch/ or outside the repository.`,
    );
    process.exitCode = 1;
    return;
  }
  const glb = await importMixamo(resolve(input), join(dir, 'import'));
  await runBlenderScript(SCRIPT, [glb, dir]);
}

if (import.meta.main) {
  await main();
}
