/**
 * Projects points of the stage axes into the default view of the app, and finds the point under a
 * pixel, with no render (design 4.5, camera). The camera is the camera of "Reset view": the
 * position of `defaultView()`, the field of view, and the frame above the bar (`viewFrame()`).
 *
 * Usage: `pnpm view-point [--side <m>] [--size <w>x<h>] [<x>,<y>,<z>]... [--pixel <u>,<v>,<y>]...`
 *
 * - `<x>,<y>,<z>`: a point in meters. The tool prints its pixel and its depth from the camera.
 * - `--pixel <u>,<v>,<y>`: a pixel and a height in meters. The tool prints the point at that
 *   height under the pixel, such as `--pixel 1250,250,0`.
 * - `--side <m>`: the stage side in meters. By default, the stage side of the default demo.
 * - `--size <w>x<h>`: the canvas in CSS pixels, 1600x1000 by default, as `close-views play`.
 *
 * The frame has no open drawer and no sheet of a phone. The y axis of the pixels points down.
 * About 1 s.
 */
import { PerspectiveCamera, Vector3 } from 'three';

import { DEFAULT_DEMO } from '../src/app/demos.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { scoreOf } from '../src/score/test-score.ts';
import { viewFrame, viewOffset } from '../src/shots/frame.ts';
import { DEFAULT_TARGET, FIELD_OF_VIEW, NEAR, defaultView, farPlane } from '../src/shots/view.ts';
import { patchedDemo } from './patch-demos.ts';
import { optionValue } from './ref-tree.ts';

/** The canvas of the default view with no `--size`, in CSS pixels. */
const DEFAULT_SIZE = [1600, 1000] as const;

/**
 * Reads a list of three numbers, such as `1,2.5,-3`.
 *
 * @param text The text.
 * @param what The name of the list in the error, such as `a point <x>,<y>,<z>`.
 * @returns The numbers.
 * @throws Error if the text does not hold three finite numbers.
 */
function triple(text: string, what: string): Vec3 {
  const values = text.split(',').map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`The value "${text}" is not ${what}.`);
  }
  const [a = 0, b = 0, c = 0] = values;
  return [a, b, c];
}

/**
 * Creates the camera of the default view for a canvas, with the frame above the bar.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param width The width of the canvas, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 * @returns The camera, with its matrices up to date.
 */
function defaultCamera(stageSide: number, width: number, height: number): PerspectiveCamera {
  const view = defaultView(stageSide, width, height);
  const camera = new PerspectiveCamera(
    FIELD_OF_VIEW,
    width / height,
    NEAR,
    farPlane(view.distance, stageSide),
  );
  camera.position.set(...view.position);
  camera.lookAt(...DEFAULT_TARGET);
  camera.setViewOffset(
    ...viewOffset(width, height, viewFrame(width, height, { right: 0, lift: 0 })),
  );
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Gives the text of numbers with a fixed count of decimals.
 *
 * @param values The numbers.
 * @param digits The count of decimals.
 * @returns The text, such as `(1.00, 2.50)`.
 */
function numbers(values: readonly number[], digits: number): string {
  return `(${values.map((v) => v.toFixed(digits)).join(', ')})`;
}

/** Reads the arguments and prints the pixel of each point and the point under each pixel. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sizeText = optionValue(args, '--size');
  const size = sizeText ? sizeText.split('x').map(Number) : [...DEFAULT_SIZE];
  const [width = 0, height = 0] = size;
  if (size.length !== 2 || !(width > 0 && height > 0)) {
    throw new Error(`The option --size takes <w>x<h> in CSS pixels, not "${sizeText}".`);
  }
  const sideText = optionValue(args, '--side');
  const stageSide = sideText
    ? Number(sideText)
    : layoutScene(scoreOf((await patchedDemo(`${DEFAULT_DEMO}.mid`)).bytes), new ModelCache())
        .stageSide;
  if (!(stageSide > 0)) {
    throw new Error(`The option --side takes a stage side in meters, not "${sideText}".`);
  }

  const camera = defaultCamera(stageSide, width, height);
  const forward = camera.getWorldDirection(new Vector3());
  console.log(
    `stage side ${stageSide.toFixed(3)} m, ${width}x${height}, camera ${numbers(camera.position.toArray(), 3)}`,
  );
  for (const [i, arg] of args.entries()) {
    const previous = args[i - 1];
    if (arg.startsWith('--') || previous === '--size' || previous === '--side') {
      continue;
    }
    if (previous === '--pixel') {
      const [u, v, y] = triple(arg, 'a pixel and a height <u>,<v>,<y>');
      const ray = new Vector3((2 * u) / width - 1, 1 - (2 * v) / height, 0.5)
        .unproject(camera)
        .sub(camera.position);
      const t = (y - camera.position.y) / ray.y;
      if (!(t > 0)) {
        console.log(`pixel ${numbers([u, v], 0)} at the height ${y} m: no point in front`);
        continue;
      }
      const point = camera.position.clone().addScaledVector(ray, t);
      console.log(
        `pixel ${numbers([u, v], 0)} at the height ${y} m -> ${numbers(point.toArray(), 2)}`,
      );
      continue;
    }
    const point = new Vector3(...triple(arg, 'a point <x>,<y>,<z> in meters'));
    const depth = point.clone().sub(camera.position).dot(forward);
    const ndc = point.clone().project(camera);
    const pixel = [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
    console.log(
      `point ${numbers(point.toArray(), 2)} -> pixel ${numbers(pixel, 0)}, depth ${depth.toFixed(2)} m`,
    );
  }
}

if (import.meta.main) {
  await main();
}
