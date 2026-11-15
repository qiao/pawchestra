import './views.css';

import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  MeshBasicMaterial,
  AgXToneMapping,
  OrthographicCamera,
  Scene,
} from 'three';
import type { MeshStandardMaterial } from 'three';

import { buildPlayer } from '../models/player.ts';
import type { PlayerModel } from '../models/player.ts';
import { buildMusicStand, buildSupport } from '../models/props.ts';
import { PODIUM_SIZE, buildPodium } from '../models/stage.ts';
import type { AnimalPose } from '../pose/types.ts';
import { bodyMapsSettled } from '../scene/body-texture.ts';
import { createMaterials } from '../scene/geometry.ts';
import {
  applyPose,
  createPlayerGeometry,
  createPlayerMesh,
  hideBone,
  createStaticMesh,
} from '../scene/player.ts';
import { createRenderer } from '../scene/renderer.ts';
import { gradeUniforms } from '../scene/post.ts';
import { GRADE_FUNCTION } from '../scene/post-shaders.ts';
import { loadBodies } from '../app/body-loads.ts';
import { demoUrl } from '../app/demos.ts';
import { fetchPlainBytes } from '../audio/plain-bytes.ts';
import { layoutScene } from '../models/layout-scene.ts';
import { buildScore } from '../score/score.ts';
import { sheetPose } from './sheet-poses.ts';
import { matteOf, sheetOf, sheetTurn } from './sheets.ts';
import type { ViewSheet } from './sheets.ts';
import { conductorPose, gripPose, playingPoses } from './view-poses.ts';
import { VIEWS_PAGE_SIZE, VIEW_ELEVATION_DEG, VIEW_LIGHT, viewPageOf, viewTurn } from './views.ts';
import type { ViewGroup, ViewSide } from './views.ts';

/**
 * The music stand of a wind player on the views page: its distance in front of the seat, and the
 * scale of its height. In `animals.webp`, the desk is low, under the instrument, so that it does
 * not hide the face, and the front view shows it in front of the belly. At 0.45 of its height, the
 * desk was at the knees.
 */
const LOW_STAND = { distance: 0.7, height: 0.6 } as const;

/**
 * The move of the podium to the left of the conductor on the views page, in meters. The podium
 * turns so that its stand is at the left side of the bear, as in `animals.webp`. The stage keeps
 * the stand of design 4.5 in front of the bear.
 */
const PODIUM_SHIFT = 0.25;

/** The podium of a view: its turn around y, its move to the left, and the conductor stand. */
interface PodiumView {
  /** The turn of the podium around y, in radians. */
  readonly turn: number;
  /** The move of the podium to the left of the conductor, in meters. */
  readonly shift: number;
  /** True for the conductor stand on the podium. */
  readonly stand: boolean;
}

/** The podium of the conductor in the rows of `animals.webp`, with its stand at the left. */
const ROW_PODIUM: PodiumView = { turn: Math.PI / 2, shift: PODIUM_SHIFT, stand: true };

/** The podium of `bear-views.png`: square under the bear, with no conductor stand. */
const SHEET_PODIUM: PodiumView = { turn: 0, shift: 0, stand: false };

/** The page of the URL: its rows, and the demo of the playing poses. */
const PAGE = viewPageOf(window.location.search);

/** The model sheet of the URL query (`?sheet=fox`), or `null` for the rows of `animals.webp`. */
const SHEET = sheetOf(window.location.search);

/**
 * True for the silhouette of a sheet page (`?sheet=fox&matte`): the body in white on black, with
 * no instrument, no seat, and no light (design 7.1).
 */
const MATTE = SHEET !== null && matteOf(window.location.search);

/** The views of each group, in the order of {@link ViewGroup.centers}. */
const VIEWS: readonly ViewSide[] = ['front', 'side', 'back'];

function element<T extends HTMLElement>(selector: string, type: new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) {
    throw new Error(`The views page has no element "${selector}".`);
  }
  return found;
}

/**
 * Builds one view of a group: the player in its static pose, with its seat and its props.
 *
 * @param group The model and its props.
 * @param podium The podium under the player, or `null` for no podium.
 * @param model The player model.
 * @param pose The pose of the player, or `null` for the bind pose.
 * @param materials The shared material.
 * @param showInstrument False to hide the instrument: its bone scales to 0.
 * @returns The view in the axes of the model, in meters.
 */
function buildView(
  group: Pick<ViewGroup, 'stand'>,
  podium: PodiumView | null,
  model: PlayerModel,
  pose: AnimalPose | null,
  materials: readonly MeshStandardMaterial[],
  showInstrument = true,
): Group {
  const view = new Group();
  const player = createPlayerMesh(model, createPlayerGeometry(model), materials);
  if (pose) {
    applyPose(player, pose);
  }
  if (!showInstrument || MATTE) {
    hideBone(player, 'instrument');
  }
  if (MATTE) {
    // The silhouette shows only the body: the bow, the baton, and the seat hide no part of it.
    hideBone(player, 'bow');
    hideBone(player, 'baton');
    player.material = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  }
  view.add(player);
  const seat = MATTE ? null : buildSupport(model.support, model.seat);
  if (seat) {
    view.add(createStaticMesh(seat, materials));
  }
  if (group.stand) {
    const stand = createStaticMesh(buildMusicStand(), materials);
    stand.position.z = -LOW_STAND.distance;
    stand.scale.y = LOW_STAND.height;
    view.add(stand);
  }
  if (podium) {
    // The silhouette lifts the player onto the podium, and it shows no podium.
    if (!MATTE) {
      const mesh = createStaticMesh(buildPodium(podium.stand), materials);
      mesh.rotation.y = podium.turn;
      mesh.position.x = -podium.shift;
      view.add(mesh);
    }
    player.position.y = PODIUM_SIZE[1];
  }
  return view;
}

const canvas = element('#views', HTMLCanvasElement);
const labels = element('#labels', HTMLDivElement);
const pageWidth = SHEET?.width ?? VIEWS_PAGE_SIZE;
const pageHeight = SHEET?.height ?? VIEWS_PAGE_SIZE;
canvas.style.width = `${pageWidth}px`;
canvas.style.height = `${pageHeight}px`;
if (SHEET) {
  document.body.style.background = MATTE ? '#000000' : SHEET.background;
}

const renderer = createRenderer(canvas, 'high', window.devicePixelRatio);
renderer.setSize(pageWidth, pageHeight, false);
// The tone mapping of the stage, AgX, and the grade of its final pass, so that the colors read as
// on the stage (design 4.5, 7.1).
renderer.toneMapping = AgXToneMapping;
renderer.toneMappingExposure = VIEW_LIGHT.exposure;
const scene = new Scene();
if (MATTE) {
  scene.background = new Color(0x000000);
}
const materials = createMaterials();
for (const material of materials) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gradeUniforms());
    shader.fragmentShader = `${GRADE_FUNCTION}\n${shader.fragmentShader.replace(
      '#include <colorspace_fragment>',
      '#include <colorspace_fragment>\n  gl_FragColor.rgb = grade(gl_FragColor.rgb);',
    )}`;
  };
}

/**
 * Gives the pose of a player on the views page: the playing pose of the pose demo for a species
 * and an instrument that play in it, the raised baton for the conductor, and the grips of the
 * hands for a wind player that does not play in it.
 *
 * @param group The species and the instrument.
 * @param model The player model.
 * @param played The playing poses of the demo.
 * @returns The pose, or `null` for the bind pose.
 */
function viewPose(
  group: ViewGroup,
  model: PlayerModel,
  played: ReadonlyMap<string, AnimalPose>,
): AnimalPose | null {
  if (group.instrument === 'baton') {
    return conductorPose(model);
  }
  return played.get(`${group.species} ${group.instrument}`) ?? gripPose(model);
}

// The page shows each species (design 7.2).
await loadBodies();
const demo = await fetchPlainBytes(demoUrl(PAGE.poseDemo, import.meta.env.BASE_URL));
const result = buildScore(demo, 'auto');
if (!result.ok) {
  throw new Error(`The demo "${PAGE.poseDemo}" is not valid: ${result.error}.`);
}
const played = playingPoses(result.score, layoutScene(result.score));

// One world unit is one CSS pixel of the page, and y points up, so a page row is at y = -top. A
// sheet page has no rows.
for (const row of SHEET ? [] : PAGE.rows) {
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = row.title;
  title.style.transform = `translate(25px, ${row.titleTop}px)`;
  labels.append(title);
  for (const group of row.groups) {
    const model = buildPlayer(group.species, group.instrument);
    const pose = viewPose(group, model, played);
    let pixelsPerMeter = 0;
    for (const [i, view] of VIEWS.entries()) {
      const object = buildView(group, group.podium ? ROW_PODIUM : null, model, pose, materials);
      object.rotation.y = viewTurn(view);
      object.updateMatrixWorld(true);
      const box = new Box3().setFromObject(object, true);
      if (i === 0) {
        // Each group fills the height of its row, as in the reference image.
        pixelsPerMeter = (row.floor - row.top) / (box.max.y - box.min.y);
      }
      const center = group.centers[i] ?? 0;
      object.scale.setScalar(pixelsPerMeter);
      object.position.set(
        center - pixelsPerMeter * (box.min.x + box.max.x) * 0.5,
        -row.floor - pixelsPerMeter * box.min.y,
        0,
      );
      scene.add(object);
      const label = document.createElement('span');
      label.textContent = view[0]?.toUpperCase() + view.slice(1);
      label.style.transform = `translate(${center}px, ${row.labelTop}px) translate(-50%, 0)`;
      labels.append(label);
    }
  }
}

/**
 * Adds the three views of a model sheet to the scene, at the scale and the places of the sheet
 * (design 7.1). The page shows no labels, so that it can lie under the sheet.
 *
 * @param sheet The model sheet.
 */
function addSheet(sheet: ViewSheet): void {
  const group = { stand: false } as const satisfies Pick<ViewGroup, 'stand'>;
  const model = buildPlayer(sheet.species, sheet.instrument);
  const pose = sheetPose(model, sheet);

  for (const view of sheet.views) {
    const podium = sheet.instrument === 'baton' ? SHEET_PODIUM : null;
    const object = buildView(group, podium, model, pose, materials, view.showInstrument);
    object.rotation.y = sheetTurn(view);
    object.scale.setScalar(sheet.pixelsPerMeter);
    object.position.set(view.x, -view.floor, 0);
    scene.add(object);
  }
}

if (SHEET) {
  addSheet(SHEET);
}

// The body light of the model sheets: a warm key light from the left, above, and the front, a
// soft warm fill light, and a rim light from behind. The stage keeps its own light.
const key = new DirectionalLight(VIEW_LIGHT.keyColor, VIEW_LIGHT.key * (SHEET?.light.key ?? 1));
key.position.set(pageWidth / 2 - 1100, -pageHeight / 2 + 1300, 1000);
key.target.position.set(pageWidth / 2, -pageHeight / 2, 0);
key.castShadow = SHEET?.shadows ?? true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.radius = 1;
key.shadow.camera.left = -800;
key.shadow.camera.right = 800;
key.shadow.camera.top = 800;
key.shadow.camera.bottom = -800;
key.shadow.camera.near = 100;
key.shadow.camera.far = 4000;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 1;
scene.add(key, key.target);
scene.add(
  new HemisphereLight(
    VIEW_LIGHT.skyColor,
    VIEW_LIGHT.groundColor,
    VIEW_LIGHT.fill * (SHEET?.light.fill ?? 1),
  ),
);
const rim = new DirectionalLight(VIEW_LIGHT.rimColor, VIEW_LIGHT.rim);
rim.position.set(pageWidth / 2 + 800, -pageHeight / 2 + 900, -1500);
rim.target.position.set(pageWidth / 2, -pageHeight / 2, 0);
scene.add(rim, rim.target);

// An orthographic camera that looks down at the elevation of the reference image. The frustum
// height is the page height times the cosine of the elevation, so that a point at z = 0 keeps its
// place on the page.
const elevation = (SHEET?.elevationDeg ?? VIEW_ELEVATION_DEG) * MathUtils.DEG2RAD;
const halfWidth = pageWidth / 2;
const halfHeight = pageHeight / 2;
const camera = new OrthographicCamera(
  -halfWidth,
  halfWidth,
  halfHeight * Math.cos(elevation),
  -halfHeight * Math.cos(elevation),
  1,
  10_000,
);
camera.position.set(
  halfWidth,
  -halfHeight + 3000 * Math.sin(elevation),
  3000 * Math.cos(elevation),
);
camera.lookAt(halfWidth, -halfHeight, 0);

function frame(): void {
  renderer.render(scene, camera);
  // The screenshot script (tools/screenshots.ts) waits for this attribute, and thus for the
  // color map of each body whose load the render started (design 4.5).
  if (bodyMapsSettled()) {
    canvas.dataset['ready'] = 'views';
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
