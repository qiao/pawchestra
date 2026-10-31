/**
 * Probes the cut of the forest (design 4.1) for cameras, with no render: the groups that each
 * camera drops, and for each group the band and the point of the stage that drop it.
 *
 * Usage: `pnpm forest-cut [--side <m>] [<x>,<y>,<z>]...`
 *
 * - `--side <m>` gives the stage side, in meters. By default it is the stage side of the places
 *   of the kit, the stage of the default demo.
 * - Each `<x>,<y>,<z>` is a camera position, in meters. With no position, the tool takes the
 *   default view at 1600 x 1000 and at 390 x 844, the default distance at the left, the right,
 *   and the back, and the largest distance at the lowest elevation from the front and from 45°.
 *
 * It builds the forest of the stage with `buildForestSteps()` and the values of `FOREST`, and
 * tests each camera with `keepGroups()`. Each camera prints one line, and each dropped group one
 * more line, at most {@link MAX_GROUPS}. About 1 s.
 */
import { FOREST_KIT } from '../src/models/forest/kit-data.ts';
import { forestParts, placeForest } from '../src/models/forest/kit.ts';
import { srgb } from '../src/models/mesh.ts';
import { byteReader, readByte, readVarint, unzigzag } from '../src/models/packed-bytes.ts';
import { STAGE_CORNER_CUT, STAGE_THICKNESS, plankHash } from '../src/models/stage.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { buildForestSteps } from '../src/scene/forest-build.ts';
import type { CutBand, CutGroup } from '../src/scene/forest-build.ts';
import { cutPoints, keepGroups } from '../src/scene/forest-cut.ts';
import { FOREST } from '../src/scene/forest.ts';
import { runAll } from '../src/score/steps.ts';
import {
  DEFAULT_ELEVATION,
  DEFAULT_TARGET,
  ELEVATION_LIMITS,
  MAX_DISTANCE_FACTOR,
  defaultView,
} from '../src/shots/view.ts';
import { optionValue } from './ref-tree.ts';

/** The most dropped groups that one camera prints. */
const MAX_GROUPS = 8;

/** One camera of the probe. */
interface ProbeCamera {
  /** The name of the camera in the output. */
  readonly name: string;
  /** The position, in meters. */
  readonly position: Vec3;
}

/**
 * Gives a camera on the sphere around the default target.
 *
 * @param name The name of the camera.
 * @param distance The distance from the target, in meters.
 * @param angles The azimuth from the front (+z) toward +x and the elevation, in degrees.
 * @returns The camera.
 */
function orbitCamera(
  name: string,
  distance: number,
  angles: readonly [azimuth: number, elevation: number],
): ProbeCamera {
  const azimuth = (angles[0] * Math.PI) / 180;
  const elevation = (angles[1] * Math.PI) / 180;
  const [x, y, z] = DEFAULT_TARGET;
  const flat = Math.cos(elevation) * distance;
  return {
    name,
    position: [
      x + Math.sin(azimuth) * flat,
      y + Math.sin(elevation) * distance,
      z + Math.cos(azimuth) * flat,
    ],
  };
}

/**
 * Gives the cameras of the probe with no position on the command line.
 *
 * @param stageSide The stage side `S`, in meters.
 * @returns The cameras.
 */
function defaultCameras(stageSide: number): ProbeCamera[] {
  const wide = defaultView(stageSide, 1600, 1000);
  const phone = defaultView(stageSide, 390, 844);
  const elevation = (DEFAULT_ELEVATION * 180) / Math.PI;
  const far = wide.distance * MAX_DISTANCE_FACTOR;
  const low = (ELEVATION_LIMITS[0] * 180) / Math.PI;
  return [
    { name: 'default 1600x1000', position: wide.position },
    { name: 'default 390x844', position: phone.position },
    orbitCamera('left', wide.distance, [-90, elevation]),
    orbitCamera('right', wide.distance, [90, elevation]),
    orbitCamera('back', wide.distance, [180, elevation]),
    orbitCamera('far front', far, [0, low]),
    orbitCamera('far 45°', far, [45, low]),
  ];
}

/**
 * Finds the first band and point of the stage that drop a group for a camera.
 *
 * @param group The group.
 * @param camera The camera position.
 * @param points The points of the stage.
 * @returns The band and the point, or null when no band drops the group.
 */
function dropCause(
  group: CutGroup,
  camera: Vec3,
  points: readonly Vec3[],
): { band: CutBand; point: Vec3 } | null {
  const bytes = new Uint8Array(2);
  for (const band of group.bands) {
    for (const point of points) {
      // Group 0 always stays, so the band goes into group 1 of its own list.
      const groups: CutGroup[] = [
        { bands: [], bounds: null, ends: null },
        { bands: [band], bounds: band, ends: null },
      ];
      bytes.fill(255);
      keepGroups(groups, camera, [point], bytes);
      if (bytes[1] === 0) {
        return { band, point };
      }
    }
  }
  return null;
}

/**
 * Gives one text of numbers with one decimal.
 *
 * @param values The numbers.
 * @returns The text, such as `(1.0, 2.5, -3.0)`.
 */
function vec(values: readonly number[]): string {
  return `(${values.map((v) => v.toFixed(1)).join(', ')})`;
}

/** Builds the forest of the stage and prints the cut of each camera. */
function main(): void {
  const args = process.argv.slice(2);
  const sideText = optionValue(args, '--side');
  const stageSide = sideText === null ? FOREST_KIT.stageSide : Number(sideText);
  if (!(stageSide > 0)) {
    throw new Error(`The option --side takes a stage side in meters, not "${sideText}".`);
  }
  const positions = args.filter((arg, i) => arg !== '--side' && args[i - 1] !== '--side');
  const cameras = positions.map((text): ProbeCamera => {
    const values = text.split(',').map(Number);
    if (values.length !== 3 || !values.every(Number.isFinite)) {
      throw new Error(`The camera "${text}" is not a position <x>,<y>,<z> in meters.`);
    }
    const [x = 0, y = 0, z = 0] = values;
    return { name: text, position: [x, y, z] };
  });

  const parts = forestParts({ byteReader, readByte, readVarint, unzigzag, srgb });
  const build = runAll(
    buildForestSteps({
      parts,
      layout: placeForest(stageSide, STAGE_CORNER_CUT),
      stageSide,
      floorY: -STAGE_THICKNESS,
      sun: FOREST.sun,
      bake: FOREST.bake,
      far: FOREST.far,
      cut: FOREST.cut,
      hash: plankHash,
      srgb,
    }),
  );
  const points = cutPoints(stageSide, FOREST.cut.samples);
  console.log(
    `stage side ${stageSide} m: ${build.triangles} triangles, ${build.groups.length} groups, ${points.length} points`,
  );

  const bytes = new Uint8Array(build.groups.length);
  for (const camera of cameras.length > 0 ? cameras : defaultCameras(stageSide)) {
    bytes.fill(255);
    const start = performance.now();
    keepGroups(build.groups, camera.position, points, bytes);
    const ms = performance.now() - start;
    const dropped = build.groups.flatMap((group, g) => (bytes[g] === 0 ? [{ group, g }] : []));
    console.log(
      `${camera.name} ${vec(camera.position)}: ${ms.toFixed(2)} ms, drops ${dropped.length}`,
    );
    for (const { group, g } of dropped.slice(0, MAX_GROUPS)) {
      if (group.ends) {
        console.log(`  group ${g}: a rope, with its tree group ${group.ends.join(' or ')}`);
        continue;
      }
      const cause = dropCause(group, camera.position, points);
      const where = group.bounds ? vec([group.bounds[2], group.bounds[3]]) : '';
      const why = cause
        ? `band ${cause.band[0].toFixed(1)} to ${cause.band[1].toFixed(1)} m at ${vec([cause.band[2], cause.band[3]])} radius ${cause.band[4].toFixed(1)}, point ${vec(cause.point)}`
        : 'no single band';
      console.log(`  group ${g} at ${where}: ${why}`);
    }
    if (dropped.length > MAX_GROUPS) {
      console.log(`  and ${dropped.length - MAX_GROUPS} more`);
    }
  }
}

if (import.meta.main) {
  main();
}
