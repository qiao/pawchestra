import type { Bounds } from '../models/bounds.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from '../models/cast.ts';
import type { MeshData } from '../models/mesh.ts';
import { INSTRUMENT_SUPPORTS } from '../models/player.ts';
import type { Support } from '../models/props.ts';
import type { PlayingSection } from '../models/cast.ts';
import { isSpeciesId } from '../models/species.ts';
import type { SpeciesId } from '../models/species.ts';
import { INSTRUMENT_IDS } from '../models/instruments/catalog.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { boneIndex } from '../models/rig.ts';
import { REST_TIMES, liftScale } from '../pose/rest.ts';
import type { RestMotion } from '../pose/rest.ts';
import type { Transport } from '../pose/types.ts';

/** One model of the gallery: a species with an instrument, or an instrument alone. */
export interface GalleryItem {
  /** The text under the model. A species item has two lines: the species and the instrument. */
  readonly label: string;
  readonly species: SpeciesId;
  readonly instrument: InstrumentId;
}

/** The size of an item on the floor, and its height, in meters. */
interface ItemSize {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** The sections in the order of design 4.3. */
const SECTIONS = Object.keys(SECTION_SPECIES).filter(
  (key): key is PlayingSection => key in SECTION_INSTRUMENTS,
);

/**
 * Lists each species with each instrument of its section (design 4.3, 4.6, 7.1), then the bear
 * with the baton. The two fox colors and the five instruments of the percussion each get a model.
 *
 * @returns The items, in the order of the sections.
 */
export function speciesItems(): GalleryItem[] {
  const items = SECTIONS.flatMap((section) =>
    SECTION_SPECIES[section].flatMap((species) =>
      SECTION_INSTRUMENTS[section].map((instrument): GalleryItem => ({
        label: `${species}\n${instrument}`,
        species,
        instrument,
      })),
    ),
  );
  items.push({ label: 'bear\nbaton (conductor)', ...CONDUCTOR });
  return items;
}

/**
 * Lists each instrument alone (design 4.6, 7.1). The instrument keeps the place that it has in the
 * hands of the first species of its section, so a held instrument floats at the height of the
 * hands.
 *
 * @returns One item for each instrument, in the order of the inventory.
 */
export function instrumentItems(): GalleryItem[] {
  return INSTRUMENT_IDS.map((instrument): GalleryItem => {
    const section = SECTIONS.find((s) =>
      SECTION_INSTRUMENTS[s].some((id: InstrumentId) => id === instrument),
    );
    const species = section ? SECTION_SPECIES[section][0] : CONDUCTOR.species;
    return { label: instrument, species, instrument };
  });
}

/**
 * Gives the item of a recast name `<instrument>@<species>`: the species with an instrument that
 * no section of the cast gives it, such as `violin@wolf` (design 7.1).
 *
 * @param name The name.
 * @returns The item, or `null` when the name is not a recast name.
 */
function recastItem(name: string): GalleryItem | null {
  const [instrument = '', species = '', ...extra] = name.split('@');
  const known = INSTRUMENT_IDS.find((id) => id === instrument);
  if (extra.length > 0 || !known || !isSpeciesId(species)) {
    return null;
  }
  return { label: `${species}\n${known}`, species, instrument: known };
}

/**
 * Selects the items of a list of names, so that a close view of the gallery shows only some
 * models (design 7.1). For example, `?only=dog,piano` shows the dog with the cello and the
 * polar bear with the piano. A recast name `<instrument>@<species>` adds the species with the
 * instrument, such as `?only=violin@wolf` for the recast role `violinist@wolf` of the role tools.
 *
 * @param items The items of a page.
 * @param only The names, separated by commas: a species, an instrument, or a recast name. `null`
 *   selects all items.
 * @returns The items whose species or instrument has one of the names, in their order, then the
 *   item of each recast name.
 */
export function selectItems(items: readonly GalleryItem[], only: string | null): GalleryItem[] {
  if (only === null) {
    return [...items];
  }
  const names = new Set(only.split(',').map((name) => name.trim()));
  return [
    ...items.filter((item) => names.has(item.species) || names.has(item.instrument)),
    ...[...names].flatMap((name) => recastItem(name) ?? []),
  ];
}

/** The angle of the camera of the gallery above the floor, in degrees, with no query. */
export const GALLERY_ELEVATION_DEG = 35;

/** The vertical field of view of the camera of the gallery, in degrees. */
export const GALLERY_FOV_DEG = 30;

/**
 * A close view of the gallery: a zoom of the camera, the height that it looks at, and the
 * direction of the camera.
 */
interface CloseView {
  /** The camera distance is the distance that shows all models, divided by the zoom. */
  readonly zoom: number;
  /** The height of the point that the camera looks at, in meters. */
  readonly target: number;
  /**
   * The turn of the camera around the vertical line through the target, in degrees. A positive
   * turn moves the camera to the right side of the animals, which face it.
   */
  readonly azimuth: number;
  /** The angle of the camera above the floor, in degrees, from 0 to 89. */
  readonly elevation: number;
  /**
   * The x of the vertical line through the camera target, in meters: the middle of the gallery
   * by default. The pianist sits at one end of its piano, so its close view moves the line to the
   * pianist.
   */
  readonly x: number;
  /** The z of the vertical line through the camera target, in meters: 0 by default. */
  readonly z: number;
  /**
   * True when the camera turns around the body of the first animal (the query `body`). Then the
   * azimuth starts at the front of the animal. The box of its body gives the line, the target,
   * and the distance at the zoom 1 ({@link aroundBody}).
   */
  readonly body: boolean;
  /**
   * True when a close view around the body looks at the head of the first animal (the query
   * `head` with `body`): the middle of the box of its head ({@link headBoundsOf}) is the line and
   * the target, and the box of the body still gives the distance at the zoom 1.
   */
  readonly head: boolean;
  /**
   * The distance of the camera from the target, in meters, or `null` for the distance that fits
   * the models. A fixed distance keeps the camera of two pages the same when their models differ
   * in size, as the lineup of `pnpm close-views` needs. The zoom does not change it.
   */
  readonly distance: number | null;
}

/**
 * Reads a close view from the query of the gallery (design 7.1): `zoom` (1 or more, default 1),
 * `target` (default 0.6 m), `azimuth` (default 0°), `elevation` (default
 * {@link GALLERY_ELEVATION_DEG}), `x` and `z` (default 0 m), `body` and `head` (flags), and
 * `distance` (above 0 m, default the distance that fits the models). For example,
 * `?only=dog&zoom=2.5&target=1.1` shows the head of the dog, and `&azimuth=45&elevation=20` shows
 * it from its right side and lower. A value that is not a number keeps its default.
 *
 * @param search The query of the page.
 * @returns The close view.
 */
export function closeView(search: URLSearchParams): CloseView {
  const read = (name: string, fallback: number): number => {
    const value = Number(search.get(name) ?? Number.NaN);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    zoom: Math.max(1, read('zoom', 1)),
    target: read('target', 0.6),
    azimuth: read('azimuth', 0),
    elevation: Math.min(89, Math.max(0, read('elevation', GALLERY_ELEVATION_DEG))),
    x: read('x', 0),
    z: read('z', 0),
    body: search.has('body'),
    head: search.has('head'),
    distance: read('distance', 0) > 0 ? read('distance', 0) : null,
  };
}

/** The first instrument bone in `BONE_NAMES`. Each bone before it is a bone of the body. */
const FIRST_INSTRUMENT_BONE = boneIndex('instrument');

/** The head bone in `BONE_NAMES`. */
const HEAD_BONE = boneIndex('head');

/**
 * Gives the box around the body of a player: the corners on the bones of the body, with no
 * instrument and no seat (design 7.1).
 *
 * @param mesh The mesh of the player.
 * @returns The box, in the axes of the model.
 * @throws Error if no corner is on a bone of the body.
 */
export function bodyBoundsOf(mesh: MeshData): Bounds {
  return boundsOn(mesh, (bone) => bone < FIRST_INSTRUMENT_BONE, 'the body');
}

/**
 * Gives the box around the head of a player: the corners on the head bone, with no ear and no eye
 * (design 7.1).
 *
 * @param mesh The mesh of the player.
 * @returns The box, in the axes of the model.
 * @throws Error if no corner is on the head bone.
 */
export function headBoundsOf(mesh: MeshData): Bounds {
  return boundsOn(mesh, (bone) => bone === HEAD_BONE, 'the head');
}

/**
 * Gives the box around the corners of a mesh on some bones.
 *
 * @param mesh The mesh.
 * @param keep Tells if a bone counts.
 * @param part The name of the part, for the error.
 * @returns The box, in the axes of the model.
 * @throws Error if no corner is on a bone that counts.
 */
function boundsOn(mesh: MeshData, keep: (bone: number) => boolean, part: string): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.bones.length; v++) {
    if (!keep(mesh.bones[v] ?? FIRST_INSTRUMENT_BONE)) {
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const value = mesh.positions[v * 3 + k] ?? 0;
      min[k] = Math.min(min[k] ?? Infinity, value);
      max[k] = Math.max(max[k] ?? -Infinity, value);
    }
  }
  if ((min[0] ?? 0) > (max[0] ?? 0)) {
    throw new Error(`The mesh has no corner on a bone of ${part}.`);
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}

/**
 * Turns a close view around the body of an animal (design 7.1). The vertical line goes through
 * the middle of the box of the body, and the target is at its middle height. The azimuth goes
 * into the axes of the gallery. An animal faces -z in its own axes. Thus the front of an animal
 * with the turn `facing` is at the azimuth 180° minus the facing.
 *
 * @param view The close view of the query. Its azimuth starts at the front of the animal, and a
 *   positive turn moves the camera to the right side of the animal.
 * @param box The box of the body, in the axes of the gallery.
 * @param facing The turn of the animal around y, in radians.
 * @returns The close view in the axes of the gallery.
 */
export function aroundBody(view: CloseView, box: Bounds, facing: number): CloseView {
  const azimuth = view.azimuth + 180 - (facing * 180) / Math.PI;
  return {
    ...view,
    x: (box.min[0] + box.max[0]) / 2,
    z: (box.min[2] + box.max[2]) / 2,
    target: (box.min[1] + box.max[1]) / 2,
    // The azimuth from -180° to 180°.
    azimuth: azimuth - 360 * Math.round(azimuth / 360) + 0,
  };
}

/** A transport that plays since long before the first frame, so the instruments stay up. */
const PLAYING: Transport = {
  playing: true,
  changedAtWall: -100,
  before: null,
  startSec: 0,
  holdSec: 3,
  leadSec: Number.POSITIVE_INFINITY,
};

/** The transport before the first play: the players keep the rest pose (design 5.2). */
const REST: Transport = {
  playing: false,
  changedAtWall: null,
  before: null,
  startSec: 0,
  holdSec: 3,
  leadSec: 0,
};

/**
 * Reads the support of a species item from the query of the gallery (design 7.1). The query
 * `stand` shows each player standing, as a soloist who stands (design 4.5). With no `stand`, each
 * player has the support of its instrument.
 *
 * @param search The query of the page.
 * @param instrument The instrument of the item.
 * @returns The support.
 */
export function gallerySupport(search: URLSearchParams, instrument: InstrumentId): Support {
  return search.has('stand') ? 'stand' : INSTRUMENT_SUPPORTS[instrument];
}

/**
 * Reads the transport of the players from the query of the gallery (design 7.1). The query
 * `rest` shows the rest pose of design 5.2. With no `rest`, the players play.
 *
 * @param search The query of the page.
 * @returns The transport.
 */
export function galleryTransport(search: URLSearchParams): Transport {
  return search.has('rest') ? REST : PLAYING;
}

/**
 * A move of the instruments of the gallery between the rest pose and the playing pose (design
 * 5.2, 7.1): a point of the lift or of the lowering.
 */
export interface GalleryMove {
  /** The lift before the first note, or the lowering after a pause. */
  readonly kind: 'lift' | 'lower';
  /**
   * The share of the time of the move, from 0 at its start to 1 at its end. The seeded delay of
   * the move comes before its start, so the share 0 is the last instant before the move.
   */
  readonly share: number;
}

/**
 * Reads a move of the instruments from the query of the gallery (design 7.1): `lift=<share>`
 * shows each animal at that share of its lift, and `lower=<share>` at that share of its lowering.
 * A share below 0 or above 1 goes to the nearest end. The query `lift` comes before `lower`, and
 * both come before `rest`. A value that is not a number gives no move.
 *
 * @param search The query of the page.
 * @returns The move, or `null` when the query has none.
 */
export function galleryMove(search: URLSearchParams): GalleryMove | null {
  for (const kind of ['lift', 'lower'] as const) {
    const text = search.get(kind)?.trim() ?? '';
    const share = Number(text);
    if (text !== '' && Number.isFinite(share)) {
      return { kind, share: Math.min(1, Math.max(0, share)) };
    }
  }
  return null;
}

/**
 * The probes of the query `probe` of the gallery (design 7.1): the body with its face colors and
 * no light, with its normals as colors, or with no shadow on it.
 */
export const GALLERY_PROBES = ['colors', 'normals', 'noshadow'] as const;

/** A probe of the query `probe` of the gallery. */
export type GalleryProbe = (typeof GALLERY_PROBES)[number];

/**
 * Reads the probe of the bodies from the query of the gallery (design 7.1), such as
 * `probe=normals`.
 *
 * @param search The query of the page.
 * @returns The probe, or `null` when the query has no probe or an unknown probe.
 */
export function galleryProbe(search: URLSearchParams): GalleryProbe | null {
  const text = search.get('probe');
  return GALLERY_PROBES.find((probe) => probe === text) ?? null;
}

/**
 * Gives the transport that puts an animal at the share of a move at a wall time (design 5.2), so
 * that `poseAt()` gives the pose of the app at that point of the move. The lift starts from the
 * rest pose, as the first play does. The transport plays from a change before the wall time by
 * the delay of the lift and the share of its duration. It has no count-in limit, so the lift keeps
 * its own times. The lowering ends a play that lifted each animal. The transport pauses at a
 * change before the wall time by the hold of the pause, the delay of the lowering, and the share
 * of its duration.
 *
 * @param move The move and its share.
 * @param motion The seeded rest motion of the animal (`PlayerPlan.motion`).
 * @param wallTime The wall clock time of the pose, in seconds.
 * @returns The transport.
 */
export function moveTransport(move: GalleryMove, motion: RestMotion, wallTime: number): Transport {
  if (move.kind === 'lift') {
    const leadSec = Number.POSITIVE_INFINITY;
    const { delaySec, durationSec } = motion.lift;
    const elapsed = (delaySec + move.share * durationSec) * liftScale(motion, leadSec);
    return {
      playing: true,
      changedAtWall: wallTime - elapsed,
      before: null,
      startSec: 0,
      holdSec: REST_TIMES.hold,
      leadSec,
    };
  }

  const { delaySec, durationSec } = motion.lower;
  const elapsed = REST_TIMES.hold + delaySec + move.share * durationSec;
  return {
    playing: false,
    changedAtWall: wallTime - elapsed,
    before: PLAYING,
    startSec: 0,
    holdSec: REST_TIMES.hold,
    leadSec: Number.POSITIVE_INFINITY,
  };
}

/**
 * Places items in rows on the floor. Each row holds `columns` items with a gap between them, and
 * is centered on x = 0. Row 0 is at the back (-z), so the first items are at the top of the view.
 * A camera that looks down at the rows sees the floor behind an item only beyond a distance of
 * its height times `hide`. Thus the gap in front of a row is at least the height of the tallest
 * item of the next row times `hide`, so that no item hides the base of an item behind it. The
 * labels of a row lie on the floor in front of it, so the gap also holds `label` in front of that
 * floor.
 *
 * @param sizes The size of each item.
 * @param columns The number of items in a row.
 * @param gap The smallest free space between two items, in meters.
 * @param hide The floor that an item hides behind it for each meter of its height: 1 / tan of
 *   the elevation of the camera.
 * @param label The depth of floor that the labels of a row cover in front of it, in meters.
 * @returns The center of each item on the floor, as (x, z).
 */
export function gridPlaces(
  sizes: readonly ItemSize[],
  columns: number,
  gap: number,
  hide: number,
  label = 0,
): [number, number][] {
  const rows: ItemSize[][] = [];
  for (let i = 0; i < sizes.length; i += columns) {
    rows.push(sizes.slice(i, i + columns));
  }
  const depths = rows.map((row) => Math.max(...row.map((size) => size.depth)));
  const heights = rows.map((row) => Math.max(...row.map((size) => size.height)));
  const gaps = rows.slice(1).map((_, r) => Math.max(gap, (heights[r + 1] ?? 0) * hide + label));
  const total =
    depths.reduce((sum, depth) => sum + depth, 0) + gaps.reduce((sum, next) => sum + next, 0);
  const places: [number, number][] = [];
  let z = -total / 2;
  rows.forEach((row, r) => {
    const depth = depths[r] ?? 0;
    const width = row.reduce((sum, size) => sum + size.width, 0) + gap * (row.length - 1);
    let x = -width / 2;
    for (const size of row) {
      places.push([x + size.width / 2, z + depth / 2]);
      x += size.width + gap;
    }
    z += depth + (gaps[r] ?? 0);
  });
  return places;
}

/**
 * Calculates the box around the vertices of meshes in the same axes.
 *
 * @param meshes The meshes, for example a player and its seat. There is at least one vertex.
 * @returns The box.
 */
export function boundsOf(meshes: readonly MeshData[]): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of meshes) {
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      const value = positions[i] ?? 0;
      min[axis] = Math.min(min[axis] ?? Infinity, value);
      max[axis] = Math.max(max[axis] ?? -Infinity, value);
    }
  }
  return {
    min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0],
    max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0],
  };
}
