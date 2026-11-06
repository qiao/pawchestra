/**
 * The regions of the camera `default` of `pnpm look-lab`, from the layout of the default demo
 * (design 4.5): the front rows, the back rows, the floor behind the back rows, and the white fur
 * of the front rows and of the back rows. They replace hand-picked boxes.
 *
 * The camera is the default view of "Reset view" at the frame of `pnpm close-views play`, with the
 * drawer closed (`defaultView()` and `viewFrame()` of `src/shots/`). Each box of the footprint of
 * each player, music stand, riser level, and the podium projects to a rectangle of the frame. The
 * rectangles paint the frame from the farthest box to the nearest, so each pixel belongs to the
 * nearest item. A region takes the pixels of its players, and drops the pixels of nearer items.
 * The boxes hold the bind pose, so a moved arm or bow can leave its box.
 */
import { PerspectiveCamera, Vector3 } from 'three';

import { placeFootprint, playerFootprint } from '../src/models/footprint.ts';
import type { PlacedBox } from '../src/models/footprint.ts';
import { ROW_STEP, layoutObstacles } from '../src/models/layout-scene.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import type { ModelCache } from '../src/models/model-cache.ts';
import { STAGE_CORNER_CUT } from '../src/models/stage.ts';
import { viewFrame, viewOffset } from '../src/shots/frame.ts';
import { FIELD_OF_VIEW, NEAR, defaultView, farPlane } from '../src/shots/view.ts';
import type { PixelBox, PixelMask } from './look-lab.ts';

/**
 * The mask of the white fur: a saturation below 0.4, as `back-fur-crops.py`, and a luma above
 * 60, so that the black fur of the pandas, the dark stands, and the deep shade drop out. The
 * saturation of a pixel moves with the color of the light, so the pixel set of the mask changes
 * from one light to the next. Compare two frames with one pixel set (`--mask` of the regions).
 */
const WHITE_FUR: PixelMask = { hue: [-1, 361], saturation: [-1, 0.4], luma: [60, 256] };

/** The names of the regions of the camera `default`. */
type DefaultRegionName =
  | 'front rows'
  | 'back rows'
  | 'back floor'
  | 'white fur, front rows'
  | 'white fur, back rows';

/** A region of the camera `default`. */
export interface DefaultRegion {
  /** The name of the region. */
  readonly name: DefaultRegionName;
  /** The pixels of the region in a frame of the camera `default`, as `y × width + x`. */
  readonly pixels: Uint32Array;
  /** The pixels of the boxes of the region that nearer items cover. The region drops them. */
  readonly dropped: number;
  /**
   * The boxes of the same surfaces in `docs/reference/orchestra-latest.png`, from
   * `back_measures.py`, or `null` when the reference shows no such region.
   */
  readonly reference: readonly PixelBox[] | null;
  /** The mask of the colors of the region, or `null` for all pixels. */
  readonly mask: PixelMask | null;
}

/** The boxes of the reference of `back_measures.py`. */
const REFERENCE_BOXES = {
  frontRabbits: [
    [150, 650, 230, 790],
    [470, 740, 550, 860],
  ],
  backPandas: [
    [300, 390, 370, 520],
    [455, 380, 525, 510],
    [570, 370, 640, 500],
  ],
  backFloor: [
    [1200, 505, 1260, 545],
    [225, 455, 275, 490],
  ],
} as const satisfies Record<string, readonly PixelBox[]>;

/**
 * Makes the camera of the default view for a frame size, as the free camera of the app after
 * "Reset view" with the drawer closed.
 *
 * @param stageSide The stage side `S`, in meters.
 * @param width The width of the frame, in pixels.
 * @param height The height of the frame, in pixels.
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
  camera.lookAt(new Vector3(...view.target));
  camera.setViewOffset(
    ...viewOffset(width, height, viewFrame(width, height, { right: 0, lift: 0 })),
  );
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** A box on the frame: its rectangle, and the depth of the middle of the box. */
interface ProjectedBox {
  /** The rectangle, in whole pixels, clipped to the frame. */
  readonly box: PixelBox;
  /** The distance from the camera to the middle of the box, in meters. */
  readonly depth: number;
}

/** The pixels of a region, and the pixels of its boxes that nearer items cover. */
interface RegionPixels {
  /** The pixels, as `y × width + x`. */
  readonly pixels: Uint32Array;
  /** The count of the pixels that nearer items cover. */
  readonly dropped: number;
}

/** A box of an item on the frame: its rectangle, its depth, and its item. */
interface ScreenRect extends ProjectedBox {
  /** The index of the item. */
  readonly item: number;
}

/**
 * Projects a placed box to the rectangle around its eight corners.
 *
 * @param box The box on the stage.
 * @param camera The camera.
 * @param width The width of the frame, in pixels.
 * @param height The height of the frame, in pixels.
 * @returns The rectangle, clipped to the frame, and the depth of the middle of the box.
 */
function projectBox(
  box: PlacedBox,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): ProjectedBox {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  const corner = new Vector3();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [box.minY, box.maxY]) {
        // The x axis of the box is (cos, -sin), and its z axis (sin, cos) (`placeFootprint()`).
        const x = box.x + sx * box.halfX * box.cos + sz * box.halfZ * box.sin;
        const z = box.z - sx * box.halfX * box.sin + sz * box.halfZ * box.cos;
        corner.set(x, y, z).project(camera);
        const px = ((corner.x + 1) / 2) * width;
        const py = ((1 - corner.y) / 2) * height;
        [left, right] = [Math.min(left, px), Math.max(right, px)];
        [top, bottom] = [Math.min(top, py), Math.max(bottom, py)];
      }
    }
  }
  const middle = new Vector3(box.x, (box.minY + box.maxY) / 2, box.z);
  const clip = (v: number, size: number): number => Math.min(size, Math.max(0, Math.round(v)));
  return {
    box: [clip(left, width), clip(top, height), clip(right, width), clip(bottom, height)],
    depth: middle.distanceTo(camera.position),
  };
}

/** The distance of the floor region from the outline of the stage, in meters: the lip and a margin. */
const FLOOR_MARGIN = 0.2;

/**
 * Gives the pixels of the stage top around and behind the back row that no item covers: each
 * pixel whose ray meets the stage top at least half a row in front of the back row, inside the
 * outline of eight sides less {@link FLOOR_MARGIN}.
 *
 * @param layout The layout.
 * @param camera The camera.
 * @param owner The nearest item of each pixel, or -1 for none.
 * @param width The width of the frame, in pixels.
 * @param height The height of the frame, in pixels.
 * @returns The pixels, and the count of the pixels of the floor that items cover.
 */
function backFloor(
  layout: SceneLayout,
  camera: PerspectiveCamera,
  owner: Int32Array,
  width: number,
  height: number,
): RegionPixels {
  const [px, , pz] = layout.podium;
  const radius = (x: number, z: number): number => Math.hypot(x - px, z - pz);
  const seated = layout.players.filter((p) => p.cast.support !== 'riser');
  const lastRow = Math.max(
    ...seated.map((p) => Math.round(radius(p.position[0], p.position[2]) / ROW_STEP)),
  );
  const from = (lastRow - 0.5) * ROW_STEP;
  const half = layout.stageSide / 2 - FLOOR_MARGIN;
  const cut = (1 - STAGE_CORNER_CUT) * layout.stageSide - FLOOR_MARGIN * Math.SQRT2;
  const ray = new Vector3();
  const pixels: number[] = [];
  let dropped = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      ray.set(((x + 0.5) / width) * 2 - 1, 1 - ((y + 0.5) / height) * 2, 0.5).unproject(camera);
      ray.sub(camera.position);
      if (ray.y >= 0) {
        continue;
      }
      const t = -camera.position.y / ray.y;
      const fx = camera.position.x + t * ray.x;
      const fz = camera.position.z + t * ray.z;
      const onStage =
        Math.abs(fx) <= half && Math.abs(fz) <= half && Math.abs(fx) + Math.abs(fz) <= cut;
      if (onStage && radius(fx, fz) >= from) {
        if ((owner[y * width + x] ?? -1) < 0) {
          pixels.push(y * width + x);
        } else {
          dropped += 1;
        }
      }
    }
  }
  return { pixels: Uint32Array.from(pixels), dropped };
}

/**
 * Gives the rows of the players, by the distance to the podium center in steps of `ROW_STEP`, as
 * `pnpm light-probe` does. The front rows are the two nearest rows, and the back rows the two
 * farthest rows of seated players. The choir on the risers is in neither.
 *
 * @param layout The layout.
 * @returns For each player: `front`, `back`, or `null`.
 */
function rowGroups(layout: SceneLayout): ('front' | 'back' | null)[] {
  const [px, , pz] = layout.podium;
  const rows = layout.players.map((p) =>
    Math.round(Math.hypot(p.position[0] - px, p.position[2] - pz) / ROW_STEP),
  );
  const seated = layout.players.flatMap((p, i) =>
    p.cast.support === 'riser' ? [] : [rows[i] ?? 0],
  );
  const sorted = [...new Set(seated)].toSorted((a, b) => a - b);
  const front = new Set(sorted.slice(0, 2));
  const back = new Set(sorted.slice(-2));
  return layout.players.map((p, i) => {
    const row = rows[i] ?? 0;
    if (p.cast.support === 'riser') {
      return null;
    }
    if (front.has(row)) {
      return 'front';
    }
    return back.has(row) ? 'back' : null;
  });
}

/**
 * Calculates the regions of the camera `default` from a layout.
 *
 * @param layout The layout of the default demo.
 * @param models The player models of the score.
 * @param width The width of the frame, in pixels.
 * @param height The height of the frame, in pixels.
 * @returns The regions, in the order of {@link DefaultRegionName}.
 * @throws Error if the obstacles of the layout are not in the order of `layoutObstacles()`.
 */
export function defaultRegions(
  layout: SceneLayout,
  models: ModelCache,
  width: number,
  height: number,
): DefaultRegion[] {
  const camera = defaultCamera(layout.stageSide, width, height);
  const obstacles = layoutObstacles(layout, models);
  const first = layout.conductor ? 1 : 0;
  const players = layout.players.map((place) => {
    const { species, instrument, kettles, support } = place.cast;
    return placeFootprint(
      playerFootprint(models.get(species, instrument, kettles, support)),
      place.position,
      place.facing,
    );
  });
  // The players of `layoutObstacles()` come after the conductor, in the order of the layout.
  if (obstacles[first]?.boxes.length !== players[0]?.length) {
    throw new Error('The obstacles of the layout are not in the order of layoutObstacles().');
  }

  // Item i < players.length is player i, and the other items are the other obstacles.
  const others = obstacles.filter((_, i) => i < first || i >= first + layout.players.length);
  const items = [...players, ...others.map((o) => o.boxes)];
  const rects: ScreenRect[] = items.flatMap((boxes, item) =>
    boxes.map((b) => ({ ...projectBox(b, camera, width, height), item })),
  );
  const owner = new Int32Array(width * height).fill(-1);
  for (const { box, item } of rects.toSorted((a, b) => b.depth - a.depth)) {
    const [left, top, right, bottom] = box;
    for (let y = top; y < bottom; y++) {
      owner.fill(item, y * width + left, y * width + right);
    }
  }

  const groups = rowGroups(layout);
  const rowRegion = (group: 'front' | 'back'): RegionPixels => {
    const inBoxes = new Uint8Array(width * height);
    for (const { box, item } of rects) {
      if (groups[item] === group) {
        const [left, top, right, bottom] = box;
        for (let y = top; y < bottom; y++) {
          inBoxes.fill(1, y * width + left, y * width + right);
        }
      }
    }
    const pixels: number[] = [];
    let boxed = 0;
    for (const [i, flag] of inBoxes.entries()) {
      if (flag) {
        boxed += 1;
        const item = owner[i] ?? -1;
        if (item >= 0 && item < players.length && groups[item] === group) {
          pixels.push(i);
        }
      }
    }
    return { pixels: Uint32Array.from(pixels), dropped: boxed - pixels.length };
  };

  // The floor of the back row: the stage top from half a row in front of the back row to the
  // edges, inside the lip, where the ray of the pixel meets no item.
  const floor = backFloor(layout, camera, owner, width, height);

  const front = rowRegion('front');
  const back = rowRegion('back');
  return [
    { name: 'front rows', ...front, reference: null, mask: null },
    { name: 'back rows', ...back, reference: null, mask: null },
    { name: 'back floor', ...floor, reference: REFERENCE_BOXES.backFloor, mask: null },
    {
      name: 'white fur, front rows',
      ...front,
      reference: REFERENCE_BOXES.frontRabbits,
      mask: WHITE_FUR,
    },
    {
      name: 'white fur, back rows',
      ...back,
      reference: REFERENCE_BOXES.backPandas,
      mask: WHITE_FUR,
    },
  ];
}
