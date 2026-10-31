import './style.css';

import {
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import type { SkinnedMesh } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { Bounds } from '../models/bounds.ts';
import { CONDUCTOR } from '../models/cast.ts';
import { SCENE_COLORS } from '../models/colors.ts';
import { MeshBuilder } from '../models/mesh.ts';
import { buildPlayer } from '../models/player.ts';
import type { PlayerModel } from '../models/player.ts';
import { buildSupport } from '../models/props.ts';
import type { PosePlan } from '../pose/plan.ts';
import { createScenePose, poseAt } from '../pose/pose-at.ts';
import type { ScenePoseBuffer } from '../pose/pose-at.ts';
import type { RestMotion } from '../pose/rest.ts';
import type { AnimalPose, ScenePose } from '../pose/types.ts';
import { createMaterials } from '../scene/geometry.ts';
import { createLights } from '../scene/lights.ts';
import {
  applyScenePose,
  createPlayerGeometry,
  createPlayerMesh,
  createStaticMesh,
} from '../scene/player.ts';
import { createRenderer } from '../scene/renderer.ts';
import {
  GALLERY_ELEVATION_DEG,
  GALLERY_FOV_DEG,
  aroundBody,
  bodyBoundsOf,
  boundsOf,
  closeView,
  galleryMove,
  galleryProbe,
  gallerySupport,
  galleryTransport,
  gridPlaces,
  headBoundsOf,
  instrumentItems,
  moveTransport,
  selectItems,
  speciesItems,
} from './items.ts';
import type { GalleryItem } from './items.ts';
import { DEFAULT_TEST_NOTES, keyName, notesAt, parseTestNotes } from './notes.ts';
import type { TestNote } from './notes.ts';
import { galleryPlan } from './plan.ts';
import { applyProbe } from './probe.ts';
import type { GalleryAnimal } from './plan.ts';

/** The two pages of the gallery (design 7.1). */
type GalleryPage = 'species' | 'instruments';

/** The number of models in a row on each page. */
const COLUMNS = { species: 8, instruments: 6 } as const satisfies Readonly<
  Record<GalleryPage, number>
>;

/** The smallest free space between two models, in meters. */
const GAP = 0.8;

/**
 * The depth of floor in front of a row that its labels cover, in meters. With less depth, the
 * labels of two lines touch the heads of the next row.
 */
const LABEL_DEPTH = 0.5;

/**
 * The angle of the camera above the floor with no query, for the rows of the models. The camera
 * looks at the models from the front.
 */
const ELEVATION = GALLERY_ELEVATION_DEG * MathUtils.DEG2RAD;

/**
 * Gives the turn of a model around y. Each model faces the camera, except the pianist. It faces
 * +x, as on the stage, so that the camera sees it beside the piano and the open lid.
 */
function facingOf(item: GalleryItem): number {
  return item.instrument === 'piano' ? -Math.PI / 2 : Math.PI;
}

/** One model of the gallery in the scene. */
interface GalleryModel {
  readonly item: GalleryItem;
  /** The model in its own axes: it faces -z, and the floor is at y = 0. */
  readonly object: Group;
  readonly bounds: Bounds;
  /** The skinned mesh and the model of a player, or `null` for an instrument alone. */
  readonly player: { readonly mesh: SkinnedMesh; readonly model: PlayerModel } | null;
}

function element<T extends HTMLElement>(selector: string, type: new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) {
    throw new Error(`The gallery page has no element "${selector}".`);
  }
  return found;
}

/**
 * Builds a species with its instrument, on its seat, in the bind pose.
 *
 * @param item The species and the instrument.
 * @param materials The shared material.
 * @returns The model.
 */
function buildSpeciesModel(
  item: GalleryItem,
  materials: readonly MeshStandardMaterial[],
): GalleryModel {
  const model = buildPlayer(
    item.species,
    item.instrument,
    4,
    gallerySupport(search, item.instrument),
  );
  const seat = buildSupport(model.support, model.seat);
  const player = createPlayerMesh(model, createPlayerGeometry(model), materials);
  const object = new Group();
  object.add(player);
  if (seat) {
    object.add(createStaticMesh(seat, materials));
  }
  const bounds = boundsOf(seat ? [model.mesh, seat] : [model.mesh]);
  return { item, object, bounds, player: { mesh: player, model } };
}

/**
 * Builds an instrument alone. Its pieces keep the places that they have in the hands of the
 * player, and the instrument rests on the floor.
 *
 * @param item The instrument and the species that holds it.
 * @param materials The shared material.
 * @returns The model.
 */
function buildInstrumentModel(
  item: GalleryItem,
  materials: readonly MeshStandardMaterial[],
): GalleryModel {
  const builder = new MeshBuilder();
  for (const { piece, at } of buildPlayer(item.species, item.instrument).pieces) {
    for (const part of piece.parts) {
      builder.add(part.corners, { color: part.color, finish: part.finish, at });
    }
  }
  const data = builder.build();
  const bounds = boundsOf([data]);
  const mesh = createStaticMesh(data, materials);
  mesh.position.y = -bounds.min[1];
  const object = new Group();
  object.add(mesh);
  return { item, object, bounds, player: null };
}

const canvas = element('#gallery', HTMLCanvasElement);
const labels = element('#labels', HTMLDivElement);
const time = element('#time', HTMLInputElement);
const timeValue = element('#time-value', HTMLOutputElement);
const notesInput = element('#notes', HTMLTextAreaElement);
const status = element('#status', HTMLParagraphElement);

const search = new URLSearchParams(window.location.search);
const page: GalleryPage = search.get('page') === 'instruments' ? 'instruments' : 'species';
element(`#page-${page}`, HTMLAnchorElement).setAttribute('aria-current', 'page');

const renderer = createRenderer(canvas, 'high', window.devicePixelRatio);
const scene = new Scene();
const materials = createMaterials();
const items = selectItems(
  page === 'species' ? speciesItems() : instrumentItems(),
  search.get('only'),
);
const models = items.map((item) =>
  page === 'species' ? buildSpeciesModel(item, materials) : buildInstrumentModel(item, materials),
);
const probe = galleryProbe(search);
for (const { player } of models) {
  if (probe && player) {
    applyProbe(player.mesh, player.model, probe);
  }
}

const sizes = models.map(({ item, bounds }) => {
  const across = bounds.max[0] - bounds.min[0];
  const along = bounds.max[2] - bounds.min[2];
  // A turn of 90° swaps the width and the depth of the box.
  const turned = Math.abs(Math.sin(facingOf(item))) > 0.5;
  return {
    width: turned ? along : across,
    depth: turned ? across : along,
    height: bounds.max[1] - bounds.min[1],
  };
});
const places = gridPlaces(sizes, COLUMNS[page], GAP, 1 / Math.tan(ELEVATION), LABEL_DEPTH);
const labelAnchors: Vector3[] = [];
for (const [i, model] of models.entries()) {
  const [x, z] = places[i] ?? [0, 0];
  const { min, max } = model.bounds;
  const facing = facingOf(model.item);
  // The turn around y moves the center (cx, cz) of the box to
  // (cx cos + cz sin, -cx sin + cz cos). The model moves back by that amount.
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  model.object.position.set(x - (cx * cos + cz * sin), 0, z - (-cx * sin + cz * cos));
  model.object.rotation.y = facing;
  scene.add(model.object);
  labelAnchors.push(new Vector3(x, 0, z + (sizes[i]?.depth ?? 0) / 2 + 0.15));
  const label = document.createElement('span');
  label.textContent = model.item.label;
  labels.append(label);
}

const extentX = Math.max(...places.map(([x], i) => Math.abs(x) + (sizes[i]?.width ?? 0) / 2));
const extentZ = Math.max(...places.map(([, z], i) => Math.abs(z) + (sizes[i]?.depth ?? 0) / 2));
const floorSide = 2 * Math.max(extentX, extentZ) + 2;
// The box of the models on the floor, for a camera that `pnpm close-views lineup` sets: the half
// width, the half depth, and the height of the tallest model, in meters.
canvas.dataset['row'] = [extentX, extentZ, Math.max(...sizes.map((size) => size.height))]
  .map((value) => value.toFixed(3))
  .join(' ');
const floor = new Mesh(
  new PlaneGeometry(floorSide, floorSide),
  new MeshStandardMaterial({
    color: new Color().setRGB(...SCENE_COLORS.stageTop),
    roughness: 0.85,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// The gallery shows the models, so it has no visible beam and no back-row lights. The shadows
// keep the blur radius of the high tier, so the role views show the shadows of the stage.
const lights = createLights(floorSide, 'high', null, { beam: false, backRows: false });
scene.add(lights);

const camera = new PerspectiveCamera(GALLERY_FOV_DEG, 1, 0.1, 10 * floorSide);
// The query `fill` (an illuminance in lux) adds a light from the camera along its view, so that
// the close views of `pnpm close-views` show the side of a body that the key light leaves dark.
const fill = Number(search.get('fill') ?? 0);
if (fill > 0) {
  const light = new DirectionalLight(0xffffff, fill);
  light.target.position.set(0, 0, -1);
  camera.add(light, light.target);
  scene.add(camera);
}
const controls = new OrbitControls(camera, canvas);
const transport = galleryTransport(search);
const move = galleryMove(search);

/**
 * Gives a box of the first animal in the axes of the gallery, for a close view around the body
 * (design 7.1).
 *
 * @param partBounds The box of a part of the mesh in the axes of the model, such as
 *   {@link bodyBoundsOf}.
 * @returns The box, or `null` when the page shows no animal.
 */
function firstBox(partBounds: (mesh: PlayerModel['mesh']) => Bounds): Bounds | null {
  const subject = models.find((model) => model.player);
  if (!subject?.player) {
    return null;
  }
  subject.object.updateMatrixWorld();
  const local = partBounds(subject.player.model.mesh);
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [local.min[0], local.max[0]]) {
    for (const y of [local.min[1], local.max[1]]) {
      for (const z of [local.min[2], local.max[2]]) {
        const corner = subject.object.localToWorld(new Vector3(x, y, z));
        min.min(corner);
        max.max(corner);
      }
    }
  }
  return { min: min.toArray(), max: max.toArray() };
}

const query = closeView(search);
const bodyBox = query.body ? firstBox(bodyBoundsOf) : null;
const headBox = query.body && query.head ? firstBox(headBoundsOf) : null;
const subjectItem = models.find((model) => model.player)?.item;
const around = bodyBox && subjectItem ? aroundBody(query, bodyBox, facingOf(subjectItem)) : query;
const close = headBox
  ? {
      ...around,
      x: (headBox.min[0] + headBox.max[0]) / 2,
      z: (headBox.min[2] + headBox.max[2]) / 2,
      target: (headBox.min[1] + headBox.max[1]) / 2,
    }
  : around;
controls.target.set(close.x, close.target, close.z);

/**
 * The corners of the box that the camera fit shows. A close view around the body shows the body
 * of the first animal. Each other view shows all models.
 */
const corners = bodyBox
  ? [bodyBox.min[0], bodyBox.max[0]].flatMap((x) =>
      [bodyBox.min[1], bodyBox.max[1]].flatMap((y) =>
        [bodyBox.min[2], bodyBox.max[2]].map((z) => new Vector3(x, y, z)),
      ),
    )
  : [-1, 1].flatMap((sx) =>
      [0, 2].flatMap((y) => [-1, 1].map((sz) => new Vector3(sx * extentX, y, sz * extentZ))),
    );

/**
 * Places the camera at a distance from the vertical line through the camera target, in the
 * direction of the close view (its azimuth and its elevation).
 *
 * @param distance The distance from the point at `height` on the line, in meters.
 * @param height The height of that point, in meters.
 */
function placeCamera(distance: number, height: number): void {
  const elevation = close.elevation * MathUtils.DEG2RAD;
  const azimuth = close.azimuth * MathUtils.DEG2RAD;
  const across = distance * Math.cos(elevation);
  camera.position.set(
    close.x - across * Math.sin(azimuth),
    height + distance * Math.sin(elevation),
    close.z + across * Math.cos(azimuth),
  );
}

/**
 * Places the camera in front of the models, at the smallest distance that shows the box around
 * all of them with a margin. A close view divides that distance by its zoom. A close view around
 * a body fits the box of the body around the target. The query `distance` places the camera at
 * that distance from the target, with no fit.
 */
function frameModels(): void {
  if (close.distance !== null) {
    placeCamera(close.distance, close.target);
    controls.update();
    return;
  }
  const height = bodyBox ? close.target : 0.6;
  const fits = (distance: number): boolean => {
    placeCamera(distance, height);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    return corners.every((corner) => {
      const p = corner.clone().project(camera);
      return Math.abs(p.x) <= 0.95 && Math.abs(p.y) <= 0.9;
    });
  };
  let distance = 1;
  while (!fits(distance)) {
    distance += 0.1;
  }
  if (close.zoom > 1 || bodyBox) {
    placeCamera(distance / close.zoom, close.target);
  }
  controls.update();
}

function resize(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  frameModels();
}

/** The animals of the gallery that play: the players, the conductor, and their meshes. */
interface GalleryCast {
  /** The players, each in its own seat, in the order of `ScenePose.players`. */
  readonly players: readonly GalleryAnimal[];
  /** The bear with the baton, or `null` when the query `only` keeps no bear. */
  readonly conductor: GalleryAnimal | null;
  /** The meshes of the players, then of the conductor. */
  readonly meshes: readonly SkinnedMesh[];
}

/**
 * Gives the animals of the gallery at their places. Each player gets its own seat.
 *
 * @returns The cast, or `null` for the instruments page, which has no animal.
 */
function galleryCast(): GalleryCast | null {
  const posed = models.flatMap(({ item, object, player }) =>
    player
      ? [
          {
            mesh: player.mesh,
            model: player.model,
            place: {
              position: [object.position.x, 0, object.position.z] as const,
              facing: object.rotation.y,
              support: player.model.support,
              species: item.species,
              instrument: item.instrument,
            },
          },
        ]
      : [],
  );
  if (posed.length === 0) {
    return null;
  }
  const conductor = posed.find((p) => p.place.instrument === CONDUCTOR.instrument);
  const players = posed.filter((p) => p !== conductor);
  const animal = (p: (typeof posed)[number], seatIndex: number): GalleryAnimal => {
    const { species, instrument, support, ...place } = p.place;
    return {
      model: p.model,
      place: {
        ...place,
        cast: { seatIndex, player: 0, species, instrument, kettles: 4, support },
      },
    };
  };
  return {
    players: players.map(animal),
    conductor: conductor ? animal(conductor, players.length) : null,
    meshes: [...players, ...(conductor ? [conductor] : [])].map((p) => p.mesh),
  };
}

/** The plan of one animal alone, for a move of the query `lift` or `lower`. */
interface AnimalAlone {
  /** The plan of the gallery with only this animal. */
  readonly plan: PosePlan;
  /** The seeded rest motion of the animal, which gives the times of its move. */
  readonly motion: RestMotion;
  /** The poses that each frame writes. */
  readonly buffer: ScenePoseBuffer;
}

/** The pose plan of the test notes, with the poses that each frame writes. */
interface GalleryPoses {
  /** The plan of all animals. */
  readonly plan: PosePlan;
  /** The poses of all animals that each frame writes. */
  readonly buffer: ScenePoseBuffer;
  /**
   * The plan of each animal alone: each player, then the conductor. Each animal of a move has a
   * transport of its own, so that each animal shows the same share of its own move.
   */
  readonly alone: readonly AnimalAlone[];
}

/**
 * Splits the plan of the gallery into one plan for each animal. Each part keeps the beats and
 * the note layer of its animal, so `poseAt()` gives the same pose of the animal for the same
 * transport.
 *
 * @param plan The plan of all animals.
 * @returns The plan of each player alone, then of the conductor alone.
 */
function aloneOf(plan: PosePlan): AnimalAlone[] {
  const parts: Omit<AnimalAlone, 'buffer'>[] = plan.players.map((player) => ({
    plan: { ...plan, players: [player], conductor: null },
    motion: player.motion,
  }));
  if (plan.conductor) {
    parts.push({
      plan: { ...plan, players: [], conductor: plan.conductor },
      motion: plan.conductor.motion,
    });
  }
  return parts.map(({ plan: one, motion }) => ({
    plan: one,
    motion,
    buffer: createScenePose(one),
  }));
}

/**
 * Calculates the poses of the gallery. With no move, one transport of the query poses all
 * animals. With the query `lift` or `lower`, each animal gets the transport that puts it at the
 * share of its own move ({@link moveTransport}).
 *
 * @param state The plan and the poses to write.
 * @param songTime The song time of the slider, in seconds.
 * @param wallTime The wall clock time, in seconds.
 * @returns The poses of the players and of the conductor.
 */
function galleryPose(state: GalleryPoses, songTime: number, wallTime: number): ScenePose {
  if (!move) {
    return poseAt(state.plan, songTime, wallTime, transport, [], state.buffer);
  }
  const players: AnimalPose[] = [];
  let conductor: AnimalPose | null = null;
  for (const one of state.alone) {
    const at = moveTransport(move, one.motion, wallTime);
    const pose = poseAt(one.plan, songTime, wallTime, at, [], one.buffer);
    players.push(...pose.players);
    conductor = pose.conductor ?? conductor;
  }
  return { players, conductor };
}

const cast = galleryCast();
/** The pose plan of the test notes, and the poses that each frame writes. */
let poses: GalleryPoses | null = null;

/** Shows the time and the notes that sound at it. */
function updateTime(notes: readonly TestNote[]): void {
  const at = Number(time.value);
  timeValue.textContent = `${at.toFixed(2)} s`;
  const sounding = notesAt(notes, at);
  status.textContent =
    sounding.length > 0
      ? `Sounding: ${sounding.map((note) => keyName(note.key)).join(', ')}`
      : 'No note sounds.';
}

/**
 * Reads the test notes, and makes the pose plan in which each player plays them and the bear
 * conducts them (design 7.1).
 */
function updateNotes(): void {
  const result = parseTestNotes(notesInput.value);
  if (!result.ok) {
    status.textContent = `Line ${result.line} is not valid.`;
    return;
  }
  const end = Math.max(0, ...result.notes.map((note) => note.start + note.length));
  time.max = String(Math.max(4, Math.ceil(end + 1)));
  notes = result.notes;
  if (cast) {
    const plan = galleryPlan(cast.players, cast.conductor, notes);
    poses = { plan, buffer: createScenePose(plan), alone: move ? aloneOf(plan) : [] };
  }
  updateTime(notes);
}

let notes: readonly TestNote[] = [];
notesInput.value = DEFAULT_TEST_NOTES;
time.addEventListener('input', () => {
  updateTime(notes);
});
notesInput.addEventListener('input', updateNotes);
window.addEventListener('resize', resize);
resize();
updateNotes();

const projected = new Vector3();

/**
 * Poses the players at the time of the slider, with the idle motion of the wall clock time
 * (design 5.1), at the move of the query `lift` or `lower` when it has one, and renders the
 * gallery.
 */
function frame(): void {
  if (poses) {
    applyScenePose(
      cast?.meshes ?? [],
      galleryPose(poses, Number(time.value), performance.now() / 1000),
    );
  }
  controls.update();
  renderer.render(scene, camera);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  for (const [i, label] of [...labels.children].entries()) {
    const anchor = labelAnchors[i];
    if (!(label instanceof HTMLElement) || !anchor) {
      continue;
    }
    projected.copy(anchor).project(camera);
    const x = ((projected.x + 1) / 2) * width;
    const y = ((1 - projected.y) / 2) * height;
    label.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
  }
  // The screenshot script (tools/screenshots.ts) waits for this attribute.
  canvas.dataset['ready'] = page;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
