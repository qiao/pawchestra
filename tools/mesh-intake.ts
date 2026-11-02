/**
 * Checks a source mesh against the intake spec of a clean quad mesh (design 4.4, "Source meshes").
 * Usage: `pnpm mesh-intake <mesh.glb> --config <tools/mesh-rigs/<animal>.json> [--factor <f>]`.
 *
 * Headless Blender (`tools/blender/mesh_intake.py`) reads the mesh and the joints of the config,
 * and prints one line for each point of the spec with `PASS` or `FAIL` and the measure: the A-pose
 * of each arm, the shoulder line and the gap of each arm, the rings along each arm (the count,
 * the spacing, the tilt, and the vertices), the rings across the elbows, the wrists, and the
 * knees, the arm faces across a color edge, the triangles against `STUDIO_TRIANGLE_BUDGET`, and
 * the share of the quads. Then it prints the verdict: `keep faces`, so that
 * `tools/blender/arm_rebuild.py --keep-faces` rigs the faces of the mesh, or `needs rebuild`, with
 * the reasons. The exit code is 1 for `needs rebuild`.
 *
 * `--factor` is the arm factor of the joints of the config, as `arm_rebuild.py` takes it: a config
 * of rebuilt and longer arms gives the joints of the longer arms. `BLENDER` names another Blender
 * binary.
 */

import { join, resolve } from 'node:path';

import { runBlenderScript } from './mixamo-import.ts';
import { optionValue } from './ref-tree.ts';
import { STUDIO_TRIANGLE_BUDGET } from './studio-budgets.ts';

/** The Blender script of the check. */
const SCRIPT = join(import.meta.dirname, 'blender', 'mesh_intake.py');

/** The usage line. */
const USAGE =
  'Usage: pnpm mesh-intake <mesh.glb> --config <tools/mesh-rigs/<animal>.json> [--factor <f>]';

/** The start of each log line of the script. */
const PREFIX = 'mesh_intake: ';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mesh = args[0];
  const config = optionValue(args, '--config');
  const factor = optionValue(args, '--factor');
  if (!mesh || mesh.startsWith('--') || !config || factor === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const extra = factor === null ? [] : ['--factor', factor];
  let keep = false;
  await runBlenderScript(
    SCRIPT,
    [resolve(mesh), resolve(config), ...extra, '--budget', String(STUDIO_TRIANGLE_BUDGET)],
    (line) => {
      const text = line.slice(PREFIX.length);
      keep ||= text === 'verdict: keep faces';
      console.log(text);
    },
  );
  process.exitCode = keep ? 0 : 1;
}

if (import.meta.main) {
  await main();
}
