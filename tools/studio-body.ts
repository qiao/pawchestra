import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { Box3, MathUtils, Matrix4, Quaternion, Ray, Triangle, Vector3 } from 'three';

import { SPECIES_COLORS } from '../src/models/colors.ts';
import type { SpeciesColors } from '../src/models/colors.ts';
import { EYE, addEye } from '../src/models/eyes.ts';
import type { EyeBend, SurfacePoint } from '../src/models/eyes.ts';
import { PIANO_BENCH } from '../src/models/instruments/piano.ts';
import { MeshBuilder } from '../src/models/mesh.ts';
import type { Finish } from '../src/models/mesh.ts';
import { CHAIR_BACK_CLEARANCE } from '../src/models/player.ts';
import { CHAIR, CHAIR_LEG } from '../src/models/props.ts';
import {
  COLOR_STEPS,
  OPTIONAL_STUDIO_BONES,
  STUDIO_ARM_BONES,
  STUDIO_BONES,
  STUDIO_LEG_BONES,
  STUDIO_RAISES,
  STUDIO_TAIL_BONES,
  STUDIO_TRUNK_BONES,
  packStudioMesh,
  packStudioPalette,
} from '../src/models/studio-format.ts';
import type {
  Side,
  StudioBody,
  StudioBone,
  StudioEyes,
  StudioHeads,
  StudioPalette,
  StudioRaise,
  StudioSitting,
  StudioStanding,
  StudioTriangle,
  StudioVertex,
} from '../src/models/studio-format.ts';
import type { Quat, Vec3 } from '../src/models/tuples.ts';
import { paletteMap } from './studio-palette.ts';
import type { PaletteMap } from './studio-palette.ts';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

/** The folder of the modules of the studio bodies (design 4.4). */
export const STUDIO_DIR = join(ROOT, 'src', 'models', 'studio');

/** The settings of one animal of the studio that the app shows. */
export interface AnimalSettings {
  /**
   * The landmark of the scale (design 4.4): the shoulder joints of the standing body
   * ({@link standingShoulder}).
   */
  readonly landmark: 'shoulders';
  /** The height of the landmark above the floor in the app, in meters. It sets the scale. */
  readonly height: number;
  /**
   * True for a body of a seated role. Its bind pose has the legs bent for the seat, with the hips
   * at their standing height, so the body drops until its soles are on the floor.
   */
  readonly seated: boolean;
  /**
   * True for a seated body that also stands, as the violinist rabbit as a soloist (design 4.5).
   * The export keeps the leg corrective shapes and the leg turns of the pose of the sheet.
   */
  readonly soloist: boolean;
  /**
   * The height of the seat top of a seated role above the floor, in meters (design 4.4, 4.5). The
   * export puts the seat top at this height, and the feet hang above the floor. With no value,
   * the body drops until its lowest point is on the floor, and the seat fits its legs.
   */
  readonly seat?: number;
  /**
   * The move of a seated body on a chair back toward the chair back, in meters (design 4.4, 4.5).
   * The front edge of the chair of the app then lies this far in front of the front edge of the
   * chair of the rig under the body. The chair grows forward when the move would put the trunk
   * nearer than {@link CHAIR_BACK_CLEARANCE} to the back posts, so the body moves back only to
   * that clearance. 0 when it is not given.
   */
  readonly seatBack?: number;
  /**
   * The room that a seated body on a chair keeps behind its back, beyond
   * {@link CHAIR_BACK_CLEARANCE}, in meters (design 4.4, 4.5). The chair grows back by it, and the
   * body keeps its place at the front edge of the seat, so that it sits further forward on a deeper
   * seat, as a seated string player sits on the front half of the chair. 0 when it is not given.
   */
  readonly backRoom?: number;
  /**
   * The width of the seat of the chair of the app under a seated body on a chair, in meters, when
   * its haunch is wider than the chair of design 4.5 (`StudioBody.chairWidth`). The seat height
   * of the body is the lowest point over this seat. With no value, the body sits on the chair of
   * design 4.5.
   */
  readonly seatWidth?: number;
  /** The name of the constant of the module. */
  readonly constant: string;
  /**
   * The crease angle of the smooth normals of the fur, in degrees (design 4.4, 4.5). Each body has
   * its own angle. The bears take a large angle, so that their fur looks smooth and round. The
   * reference rabbits have more facet contrast than each render of the app rabbit, so the angle of
   * the rabbit comes from the play frames.
   */
  readonly crease: number;
  /**
   * The largest difference of two face colors of the fur that blend at a vertex, in each sRGB
   * channel from 0 to 1 (`StudioBody.colorBlend`, design 4.5). The bears take it, so that the
   * steps of the paint and of the baked occlusion fade across the smooth fur.
   * With no value, each face keeps its color.
   */
  readonly colorBlend?: number;
  /**
   * The GLB file of the body, relative to the repository: the rig that `pnpm rig-mesh` writes from
   * a source mesh (`docs/agents/rigging.md`, "The asset chain"). Each animal of `ANIMALS` has one.
   * The scratch settings of a probe or of `--inspect` can have none.
   */
  readonly glb?: string;
  /**
   * The other palettes of the faces, by name, each with the map from the colors of the mesh
   * (`tools/studio-palette.ts`, design 4.4). A species selects one with its `palette`.
   */
  readonly palettes?: Readonly<Partial<Record<StudioPalette, PaletteMap>>>;
  /**
   * The lowest height of the head measures in the bind pose of the GLB file, in its units, for a
   * long nose that follows the head below the chin, as the trunk of the elephant (`noseFront` of
   * the rig config), or for a throat that bone heat gives to the head, as on the rhino. The head
   * height, the head center, the box of the pea eyes, and the tip of
   * the nose then leave out the vertices below it. With no value, each vertex of the head counts.
   */
  readonly headFloor?: number;
  /**
   * The highest height of the tip of the nose of a body with no gloss nose, in the bind pose of
   * the GLB file, in its units, for a horn that stands above the muzzle, as on the rhino. The
   * front of the muzzle below this height is then the tip of the nose, so that the mouth lies
   * under the muzzle and not under the tip of the horn. With no value, each vertex of the head
   * counts.
   */
  readonly noseTop?: number;
  /**
   * The highest height of the head measures in the bind pose of the GLB file, in its units, for
   * antlers or horns that rise from the skull top and follow the head, as the antlers of the deer.
   * The head height, the head center, the box of the pea eyes, and the tip of the nose then leave
   * out the vertices above it. With no value, each vertex of the head counts.
   */
  readonly headCeiling?: number;
  /**
   * True when each pea eye faces level: the direction of the eye keeps only its turn to the side
   * and forward, with no turn up or down. A large head box behind the eyes, such as the ruff of
   * the wolf, turns the eyes up, and the eyes then read as eyes that look up (design 4.5). With no
   * value, each eye faces out from the middle of the head that shows.
   */
  readonly eyeLevel?: boolean;
  /**
   * The share of the turn of each pea eye from its direction toward the mean normal of the head
   * faces within 0.09 H of its place, from 0 to 1. The bear takes 0.5: its eyes then face halfway
   * between their direction and its face, which faces about 29° up at the eyes. With no value,
   * each eye keeps its direction.
   */
  readonly eyeNormal?: number;
  /**
   * The move of the place of each pea eye from the middle of the old eye of the mesh, in `H` of
   * the eyes: out to the side, away from the middle plane, and up. The moved place then goes to
   * the nearest point of the head surface, as the old place does ({@link eyeOnHead}). A body
   * takes it when the face under the old eye is too curved for a clean oval. With no value, each
   * eye sits at the old eye.
   */
  readonly eyeShift?: readonly [out: number, up: number];
  /**
   * The factor of the size of each pea eye. A pea eye is a share of the head height that shows
   * (`EYE` of `models/eyes.ts`), so a large head, such as the head of the elephant with its ears,
   * gets large eyes. With no value, the factor is 1.
   */
  readonly eyeSize?: number;
  /**
   * The radius of the filled area around each old eye and the outer radius of the ring of its fit,
   * in `H` of the eyes ({@link fillEye}). A body takes it when the old eye of the mesh stands out
   * of the head as a ball in a groove, which shows as a light rim around the pea eye. With no
   * value, the head keeps the form of the old eye.
   */
  readonly eyeFill?: readonly [inner: number, outer: number];
}

/**
 * The colors of the texture of the fox mesh, from which the tan palette maps (design 4.5): the
 * colors of the red fox before the color shift of its rig (`colors.shift` of
 * `tools/mesh-rigs/fox.json`). The tan palette maps the face colors before the shift
 * (`COLOR_1`), so the tan fox keeps its colors when the shift of the red fox changes.
 */
const FOX_TEXTURE_COLORS: SpeciesColors = {
  fur: '#f0934c',
  belly: '#f6eee0',
  accent: '#4a3324',
};

/** The animals that the app shows, by their ids. */
export const ANIMALS: ReadonlyMap<string, AnimalSettings> = new Map([
  // The bear conductor: the T-pose mesh (design 4.4), with the size of the studio bear.
  [
    'bear',
    {
      landmark: 'shoulders',
      height: 1.0,
      seated: false,
      soloist: false,
      constant: 'STUDIO_BEAR',
      // The crease 40° with the blend 0.05 gives slightly faceted fur. The blend fades the steps
      // of the fur colors, and keeps the edge of the muzzle.
      crease: 40,
      colorBlend: 0.05,
      eyeNormal: 0.5,
      glb: 'assets/models/bear/bear-tpose.rig.glb',
      // The eyes of the T-pose mesh are 0.7 of the size 1.15 of the studio bear.
      eyeSize: 0.805,
    },
  ],
  // The polar bear pianist: the T-pose mesh (design 4.4). The landmark is its standing shoulder
  // joints (0.725 u at 1.5828 m for each unit). The height is small enough that the bear does not
  // look too tall, and the body keeps the legs of the mesh. The crease angle, the blend, and the
  // eye size are those of the bear.
  [
    'polar-bear',
    {
      landmark: 'shoulders',
      height: 1.14751,
      seated: true,
      soloist: false,
      constant: 'STUDIO_POLAR_BEAR',
      crease: 40,
      colorBlend: 0.05,
      glb: 'assets/models/polar-bear/polar-bear-tpose.rig.glb',
      eyeSize: 0.805,
    },
  ],
  // The violinist rabbit (design 4.4). The rabbit sits 4 cm further forward on a seat 4 cm deeper,
  // so that its back keeps off the chair back. The old eye of the T-pose mesh is a ball in a
  // groove, so the head fills it (`eyeFill`), and the pea eyes take the size of the eyes of the
  // A-pose rabbit (0.93) and face halfway toward the filled face (`eyeNormal`).
  [
    'rabbit',
    {
      landmark: 'shoulders',
      height: 0.8513179,
      seated: true,
      soloist: true,
      backRoom: 0.04,
      constant: 'STUDIO_RABBIT',
      crease: 35,
      eyeFill: [0.1, 0.16],
      eyeNormal: 0.5,
      eyeSize: 0.93,
      glb: 'assets/models/rabbit/rabbit.rig.glb',
    },
  ],
  // The red and the tan foxes (design 4.4). The wide haunch of the fox sits on a wider chair.
  [
    'fox',
    {
      landmark: 'shoulders',
      height: 1.108536,
      seated: true,
      soloist: true,
      seatWidth: 0.48,
      constant: 'STUDIO_FOX',
      crease: 35,
      glb: 'assets/models/fox/fox.rig.glb',
      palettes: { tan: { from: FOX_TEXTURE_COLORS, to: SPECIES_COLORS['fox-tan'] } },
    },
  ],
  // The viola cat: the T-pose mesh (design 4.4). The standing shoulder joints are 0.950065 m high
  // (the joints of the mesh, raised by the longer legs and lowered by the shorter trunk by the same
  // 0.132 u), so that the head height H stays the H of the cat of the A-pose mesh, 0.339 m (`app`
  // of the rig config). The cat
  // sits on the chair of the cat of the A-pose mesh: 0.46 m wide, and 0.343 m deep with the back
  // room. The haunch is 0.53 m wide, so it reaches a little past the sides of the seat. The tips of
  // the lower whiskers hang below the chin and follow the head (`noseFront` of the rig config), so
  // the head measures start at the chin, 0.695 u high after the rise of the legs, the drop of the
  // trunk, and the smaller head (`headFactor`). The pea eyes are 1.35 times the share of the smaller head (5.1 cm wide on
  // a head 0.44 m wide, old cat 4.4 cm on 0.43 m), because the eyes of the old cat sat in a light
  // face and looked larger. They lie 0.05 H of the eyes above the old eyes of the mesh, where the
  // face is flatter, so that the ovals stay round.
  [
    'cat',
    {
      landmark: 'shoulders',
      height: 0.950065,
      seated: true,
      soloist: true,
      seatWidth: 0.46,
      backRoom: 0.014,
      constant: 'STUDIO_CAT',
      crease: 35,
      glb: 'assets/models/cat/cat.rig.glb',
      headFloor: 0.695,
      eyeSize: 1.35,
      eyeShift: [0, 0.05],
    },
  ],
  // The cello dog (design 4.4).
  [
    'dog',
    {
      landmark: 'shoulders',
      height: 1.00078,
      seated: true,
      soloist: false,
      constant: 'STUDIO_DOG',
      crease: 35,
      glb: 'assets/models/dog/dog.rig.glb',
    },
  ],
  // The trombone panda (design 4.4). It stands as a soloist.
  [
    'panda',
    {
      landmark: 'shoulders',
      height: 0.9792,
      seated: true,
      soloist: true,
      constant: 'STUDIO_PANDA',
      crease: 35,
      glb: 'assets/models/panda/panda.rig.glb',
    },
  ],
  // The contrabass hippo (design 4.4). It stands at its contrabass, so the export keeps the
  // standing pose of the rig. The pea eyes are 0.8 of their size, because at the full size they
  // look too big.
  [
    'hippo',
    {
      landmark: 'shoulders',
      height: 1.008489,
      seated: true,
      soloist: true,
      constant: 'STUDIO_HIPPO',
      crease: 35,
      glb: 'assets/models/hippo/hippo.rig.glb',
      eyeSize: 0.8,
    },
  ],
  // The oboe mouse (design 4.4). It stands as a soloist.
  [
    'mouse',
    {
      landmark: 'shoulders',
      height: 0.507635,
      seated: true,
      soloist: true,
      constant: 'STUDIO_MOUSE',
      crease: 35,
      glb: 'assets/models/mouse/mouse.rig.glb',
    },
  ],
  // The timpani elephant (design 4.4). It stands at its timpani, so the
  // export keeps the standing pose of the rig. Its trunk follows the head below the chin. Its eyes
  // are 0.6 of the pea eyes of its head, because the large head with its ears made them large.
  [
    'elephant',
    {
      landmark: 'shoulders',
      height: 1.1616,
      seated: true,
      soloist: true,
      constant: 'STUDIO_ELEPHANT',
      crease: 35,
      glb: 'assets/models/elephant/elephant.rig.glb',
      headFloor: 0.69,
      eyeSize: 0.6,
    },
  ],
  // The bassoon beaver (design 4.4). A bassoon soloist keeps its seat,
  // but the standing views of the gallery stand it up.
  [
    'beaver',
    {
      landmark: 'shoulders',
      height: 0.632835,
      seated: true,
      soloist: true,
      constant: 'STUDIO_BEAVER',
      crease: 35,
      glb: 'assets/models/beaver/beaver.rig.glb',
    },
  ],
  // The horn pig (design 4.4). It stands as a soloist.
  [
    'pig',
    {
      landmark: 'shoulders',
      height: 0.671951,
      seated: true,
      soloist: true,
      constant: 'STUDIO_PIG',
      crease: 35,
      glb: 'assets/models/pig/pig.rig.glb',
    },
  ],
  // The clarinet wolf (design 4.4). It stands as a soloist.
  [
    'wolf',
    {
      landmark: 'shoulders',
      height: 0.973079,
      seated: true,
      soloist: true,
      constant: 'STUDIO_WOLF',
      crease: 35,
      eyeLevel: true,
      glb: 'assets/models/wolf/wolf.rig.glb',
    },
  ],
  // The test mannequin (design 4.4, "Test mannequin"): the animal preset of
  // tools/blender/mannequin.py, a test body of the rig chain that no section casts. It keeps the
  // 1.6 m of the preset.
  [
    'mannequin',
    {
      landmark: 'shoulders',
      height: 1.025662,
      seated: true,
      soloist: true,
      constant: 'STUDIO_MANNEQUIN',
      crease: 35,
      glb: 'assets/models/mannequin/mannequin.rig.glb',
    },
  ],
  // The percussion badger (design 4.4). It stands at each percussion
  // instrument, so the export keeps the standing pose of the rig.
  [
    'badger',
    {
      landmark: 'shoulders',
      height: 0.59685,
      seated: true,
      soloist: true,
      constant: 'STUDIO_BADGER',
      crease: 35,
      glb: 'assets/models/badger/badger.rig.glb',
    },
  ],
  // The trumpet monkey (design 4.4). It stands as a soloist.
  [
    'monkey',
    {
      landmark: 'shoulders',
      height: 0.691834,
      seated: true,
      soloist: true,
      constant: 'STUDIO_MONKEY',
      crease: 35,
      glb: 'assets/models/monkey/monkey.rig.glb',
    },
  ],
  // The tuba rhino (design 4.4). It stands to play the tuba, so the export keeps the standing pose
  // of the rig. The tip of its nose is the front of the muzzle under the horn. The head measures
  // start at the chin: bone heat gives the throat under the chin of the copy with the arm tubes a
  // head weight just above 0.5. The T-pose mesh has its head top at 1.462 m, its chin at 0.70, and
  // its horn from 0.83.
  [
    'rhino',
    {
      landmark: 'shoulders',
      height: 0.958199,
      seated: true,
      soloist: true,
      constant: 'STUDIO_RHINO',
      crease: 35,
      glb: 'assets/models/rhino/rhino.rig.glb',
      noseTop: 0.8,
      headFloor: 0.7,
    },
  ],
  // The harp deer (design 4.4). It sits on the stool of the harp, and the
  // harp soloist keeps the stool, so it does not stand. The antlers stay out of the head measures.
  // The haunch of the deer of 1.2 times the size is 0.39 m wide, so the stool is 0.44 m wide.
  [
    'deer',
    {
      landmark: 'shoulders',
      height: 0.897127,
      seated: true,
      soloist: false,
      constant: 'STUDIO_DEER',
      crease: 35,
      headCeiling: 0.87,
      seatWidth: 0.44,
      glb: 'assets/models/deer/deer.rig.glb',
    },
  ],
  // The choir penguin (design 4.4). It stands on its riser, so the
  // export keeps the standing pose of the rig.
  [
    'penguin',
    {
      landmark: 'shoulders',
      height: 0.6258,
      seated: true,
      soloist: true,
      constant: 'STUDIO_PENGUIN',
      // The penguin looks round. With the crease 35° and no blend, the sides show hard facets and
      // a sawtooth of white, tan, and black faces along the belly. The crease 60° smooths the
      // shading, and the blend 0.7 fades the face colors across the border. With 1.0, the beak
      // blurs into the head.
      crease: 60,
      colorBlend: 0.7,
      glb: 'assets/models/penguin/penguin.rig.glb',
    },
  ],
]);

/** The finish of each material of the studio (design 4.5, materials). */
const FINISHES: ReadonlyMap<string, Finish> = new Map([
  ['fur', 'matte'],
  ['gloss', 'lacquer'],
]);

/**
 * The bones of the studio that the app drops: the hand props. The app has its own baton, violin,
 * and bow. The faces of a held prop are a material of their own, which the export drops too
 * ({@link FINISHES}).
 */
const DROPPED_BONES: ReadonlySet<string> = new Set(['baton', 'violin', 'bow']);

/**
 * The name of a digit bone of a paw with four digits, such as `finger3_L`. The app has one finger
 * bone on each hand, so the digits of a paw become the one `fingers` bone of its side, and they
 * curl together.
 */
const DIGIT = /^finger\d_([LR])$/;

/**
 * Gives the bone of a studio body that takes a bone of the studio: the `fingers` bone of its side
 * for a digit, and the bone itself for each other bone.
 *
 * @param name The name of the bone of the studio.
 * @returns The name of the bone of the studio body.
 */
export function ownBone(name: string): string {
  const digit = DIGIT.exec(name);
  return digit ? `fingers_${digit[1] ?? ''}` : name;
}

/**
 * Finds if a bone is a bone that a studio body can lack, such as the tip of a tail of two bones.
 *
 * @param bone The name of the bone.
 * @returns True for a bone of `OPTIONAL_STUDIO_BONES`.
 */
function isOptionalBone(bone: string): boolean {
  return OPTIONAL_STUDIO_BONES.some((own) => own === bone);
}

/** The bones of a tail, whose vertices hang behind the seat and the back of a chair. */
const TAIL_BONES: ReadonlySet<string> = new Set(STUDIO_TAIL_BONES);

/**
 * Finds if a vertex follows the tail most: a vertex of a tail that goes back over the seat and
 * through the open back of the chair (design 4.4, 4.5).
 *
 * @param vertex The vertex.
 * @returns True when the bones of the tail hold more than half of its weight.
 */
function onTail(vertex: SourceVertex): boolean {
  return vertex.skin.reduce((sum, [bone, w]) => sum + (TAIL_BONES.has(bone) ? w : 0), 0) > 0.5;
}

/**
 * The smallest distance of the middle of a gloss shell of the head from the middle plane, in the
 * units of the studio, for an eye. The nose lies on the middle plane.
 */
const EYE_SIDE = 0.02;

/**
 * The largest distance of the tip of the nose from the middle plane of the body, in meters. The
 * export takes the tip only from the vertices this near the plane, because the front-most vertex
 * of the head of the mouse is the tip of a whisker, 0.2 u from the plane, which moves the oboe
 * 0.33 m. The front of the muzzle of the hippo, a nostril, lies 2.8 cm from the plane, and it
 * stays the tip.
 */
export const NOSE_PLANE = 0.03;

/**
 * The distance of the tip of the nose and of the mouth below it from the middle plane, in meters,
 * above which `pnpm rig-mesh --check` and `pnpm mesh-options` warn (`noseWarning()` of
 * `tools/rig-mesh-check.ts`).
 */
export const NOSE_WARNING = 0.02;

/** The order of the corrective shapes in a studio body: the left arm, then the right arm. */
export const CORRECTIVE_NAMES = ['arm_down_L', 'arm_down_R'] as const;

/**
 * The leg corrective shapes of a seated body that also stands, after {@link CORRECTIVE_NAMES}: the
 * left leg, then the right leg. They have their full weight in the pose of the sheet.
 */
export const LEG_CORRECTIVE_NAMES = ['legs_straight_L', 'legs_straight_R'] as const;

/**
 * The sit corrective shapes of a standing body that also sits (`sitPose` of the config of
 * `pnpm rig-mesh`), after the other kept shapes: the left side, then the right side. They have
 * their full weight in the clip `sit` (`StudioBody.sitting`).
 */
export const SIT_CORRECTIVE_NAMES = ['sit_L', 'sit_R'] as const;

/** The name of the clip of the seated pose of a standing body that also sits. */
const SIT_CLIP = 'sit';

/**
 * The corrective shape of a raised arm or of a bent wrist of a rig of `pnpm rig-mesh` (`raise` of
 * its config) whose pose names no morph target, by the side of the arm: the one shape of a file
 * with one pose. A file with a list of poses names the target of each pose, such as `arm_raise_R2`
 * for the second shape of the right arm. These shapes follow {@link CORRECTIVE_NAMES} in the packed
 * mesh.
 */
export const RAISE_NAMES = { L: 'arm_raise_L', R: 'arm_raise_R' } as const;

/** The form of the name of the morph target of a shape of a raised arm or of a bent wrist. */
const RAISE_TARGET = /^arm_raise_[LR]\d*$/;

/**
 * Gives the corrective shapes that the export keeps for an animal: the arm-down shapes, the shapes
 * of a raised arm or of a bent wrist of the file, the leg shapes of a seated body that also
 * stands, and the sit shapes of a standing body that also sits.
 *
 * @param settings The settings of the animal.
 * @param raised The morph targets of the shapes of a raised arm or of a bent wrist, in the order of
 *   their poses ({@link raisesOf}).
 * @param sits True for a standing body that also sits ({@link sitsIn}).
 * @returns The names, in their order in the packed mesh.
 */
export function keptCorrectives(
  settings: AnimalSettings,
  raised: readonly string[],
  sits = false,
): readonly string[] {
  return [
    ...CORRECTIVE_NAMES,
    ...raised,
    ...(settings.soloist ? LEG_CORRECTIVE_NAMES : []),
    ...(sits ? SIT_CORRECTIVE_NAMES : []),
  ];
}

/**
 * Finds if the export gives an animal a seated pose (`StudioBody.sitting`): a standing body whose
 * rig has the clip of a sit pose (`sitPose` of the config of `pnpm rig-mesh`).
 *
 * @param glb The file.
 * @param settings The settings of the animal.
 * @returns True for a standing body with the clip.
 */
export function sitsIn(glb: Glb, settings: AnimalSettings): boolean {
  return !settings.seated && (glb.json.animations ?? []).some((a) => a.name === SIT_CLIP);
}

/**
 * Gives the names of the morph targets of the skinned mesh of a GLB file.
 *
 * @param glb The file.
 * @returns The names, in their order.
 */
function targetNamesOf(glb: Glb): readonly string[] {
  const node = glb.json.nodes.find((n) => n.mesh !== undefined && n.skin !== undefined);
  const mesh = node?.mesh === undefined ? undefined : glb.json.meshes[node.mesh];
  return mesh?.extras?.targetNames ?? [];
}

/** The seat of a rig, and the size of the seat of the app that takes its place. */
interface RigSeat extends SeatExtras {
  /** The width of the seat of the app, in meters. */
  readonly width: number;
  /** The depth of the seat of the app, in meters. */
  readonly depth: number;
}

/** The seats of the app by the `prop` of the seat of a rig: the width and the depth of each. */
const SEATS: ReadonlyMap<string, Pick<RigSeat, 'width' | 'depth'>> = new Map([
  ['bench', { width: PIANO_BENCH.width, depth: PIANO_BENCH.depth }],
  ['chair', { width: CHAIR.seatWidth, depth: CHAIR.seatDepth }],
]);

/** A node of a glTF file: the fields that the tool reads. */
interface GltfNode {
  readonly name?: string;
  readonly children?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly matrix?: readonly number[];
  readonly mesh?: number;
  readonly skin?: number;
}

/** A sparse part of an accessor. */
interface GltfSparse {
  readonly count: number;
  readonly indices: {
    readonly bufferView: number;
    readonly byteOffset?: number;
    readonly componentType: number;
  };
  readonly values: { readonly bufferView: number; readonly byteOffset?: number };
}

/** An accessor of a glTF file. */
interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly normalized?: boolean;
  readonly sparse?: GltfSparse;
}

/** A buffer view of a glTF file. */
interface GltfBufferView {
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
}

/** A primitive of a mesh. */
interface GltfPrimitive {
  readonly attributes: Readonly<Record<string, number>>;
  readonly indices: number;
  readonly material?: number;
  readonly targets?: readonly Readonly<Record<string, number>>[];
}

/** A channel of an animation. */
interface GltfChannel {
  readonly sampler: number;
  readonly target: { readonly node: number; readonly path: string };
}

/** An animation of a glTF file. */
interface GltfAnimation {
  readonly name?: string;
  readonly channels: readonly GltfChannel[];
  readonly samplers: readonly { readonly input: number; readonly output: number }[];
}

/** The parts of a glTF file that the tool reads. */
interface Gltf {
  readonly nodes: readonly GltfNode[];
  readonly meshes: readonly {
    readonly primitives: readonly GltfPrimitive[];
    readonly extras?: { readonly targetNames?: readonly string[] };
  }[];
  readonly skins: readonly {
    readonly joints: readonly number[];
    readonly inverseBindMatrices: number;
  }[];
  readonly accessors: readonly GltfAccessor[];
  readonly bufferViews: readonly GltfBufferView[];
  readonly animations?: readonly GltfAnimation[];
  readonly materials?: readonly { readonly name?: string }[];
  /** The asset of the file. */
  readonly asset?: {
    /** The facts of the rig of `pnpm rig-mesh` that the export reads. */
    readonly extras?: {
      /**
       * The factor by which the rig grows the head around the neck joint (`headFactor` of the
       * config of the mesh rig). The file has no factor when the head keeps its size.
       */
      readonly headFactor?: number;
      /**
       * The factor by which the rig shortens the neck between its joints (`neckFactor` of the
       * config of the mesh rig). The file has no factor when the neck keeps its length.
       */
      readonly neckFactor?: number;
      /**
       * The move of the head center of the holds back to the head before the smoothing of the rig
       * (`smooth` of the config of the mesh rig), in the units and the axes of the studio. The
       * file has no move when the rig smooths no part of the mesh.
       */
      readonly headShift?: readonly number[];
      /**
       * The turn of the pelvis by which the rig reclines the trunk of the seated bind pose, in
       * degrees (`studio.trunk` of the config of the mesh rig). The file has none when the trunk
       * keeps the form of the source.
       */
      readonly trunk?: number;
      /**
       * The pose of the corrective shape of a raised arm or of a bent wrist (`raise` of the config
       * of the mesh rig), or a list of such poses. The file has none with no such shape.
       */
      readonly raise?: RaiseExtras | readonly RaiseExtras[];
      /**
       * The caps of the arm of the cut that take the normals of the skin (`cut.skinNormals` of
       * the config of the mesh rig), as indices of the triangles of the primitive `fur`. With
       * `cut.bodyNormals`, they also hold the caps of the body and the two faces at the top of
       * each cut. The file has none with no such rule.
       */
      readonly caps?: readonly number[];
      /**
       * The skin faces around the caps of the body of the cut that take the normals of the skin
       * with no crease angle (`cut.bodyNormals` of the config of the mesh rig), as indices of the
       * triangles of the primitive `fur`. The file has none with no such rule.
       */
      readonly rim?: readonly number[];
      /**
       * The share of the roll of each upper arm that its twist bone takes (`upperTwist.share` of
       * the config of the mesh rig, `StudioBody.upperTwist`). The file has none with no such rule.
       */
      readonly upperTwist?: number;
      /**
       * The unit elbow axis of each arm in the bind pose of a rig with straight bind arms
       * (`studio.straightArms` of the config of the mesh rig, `StudioBody.hinges`), in the axes
       * of the file. The file has none with no such rule.
       */
      readonly hinges?: Readonly<Record<Side, readonly number[]>>;
      /**
       * The seat under the seated bind pose, or under the sit pose of a standing bind. A file of
       * another tool has none.
       */
      readonly seat?: SeatExtras;
    };
  };
}

/**
 * The pose of a corrective shape of a raised arm or of a bent wrist in the extras of a GLB file of
 * `pnpm rig-mesh` (`raise` of its config), in the axes of the studio.
 */
export interface RaiseExtras {
  /** The side of the arm: `L` or `R`. */
  readonly side?: string;
  /**
   * The bone of the turn: `forearm` for a bent elbow, `hand` for a bent wrist, or none for the
   * upper arm.
   */
  readonly bone?: string;
  /**
   * The turn at which the shape has its full weight, as x, y, z, w: the world turn of the upper
   * arm from the bind pose, with the bone `forearm` the turn of the forearm from the upper arm,
   * or with the bone `hand` the turn of the paw from the forearm.
   */
  readonly turn?: readonly number[];
  /**
   * The angles of the turn from {@link RaiseExtras.turn}, in degrees, at which the weight of the
   * shape starts to fall and reaches 0.
   */
  readonly fade?: readonly number[];
  /**
   * The morph target of the shape. A pose in a list names it, and the one pose of a file takes
   * the name of its side in {@link RAISE_NAMES}.
   */
  readonly target?: string;
}

/**
 * The seat of a rig in the extras of a GLB file of `pnpm rig-mesh` (`chair` of its config, or
 * `sitPose.chair` of a sit pose), in the axes and the units of the studio. The file holds no prop,
 * so that it holds only the animal (design 4.4).
 */
export interface SeatExtras {
  /** The seat of the app that takes its place: `chair`, or `bench` for the piano bench. */
  readonly prop: string;
  /** The height of the seat top: the lowest point of the body over the seat. */
  readonly top: number;
  /** The z of the front edge of the seat. */
  readonly front: number;
  /** The z of the back edge of the seat. */
  readonly back: number;
  /** The half width of the seat on x, around the middle plane. */
  readonly halfWidth: number;
}

/** A GLB file: its JSON part and its binary part. */
export interface Glb {
  readonly json: Gltf;
  readonly bin: Uint8Array;
}

/**
 * Gives the faces of the cut of the rig of a GLB file (`pnpm rig-mesh`) that take the normals of
 * the skin around them in the app (design 4.4): the caps, or the rim of the caps of the body.
 *
 * @param glb The file.
 * @param key The list of the extras: `caps` or `rim`.
 * @returns The indices of the triangles of the primitive `fur`, or none for a file with no list.
 * @throws Error if an index is not a whole number of at least 0.
 */
export function cutFacesOf(glb: Glb, key: 'caps' | 'rim'): ReadonlySet<number> {
  const faces = glb.json.asset?.extras?.[key] ?? [];
  if (faces.some((t) => !Number.isInteger(t) || t < 0)) {
    throw new Error(`The ${key} ${JSON.stringify(faces)} of the file are not triangle indices.`);
  }
  return new Set(faces);
}

/**
 * Gives the share of the roll of each upper arm that its twist bone takes in the rig of a GLB file
 * (`upperTwist.share` of the config of `pnpm rig-mesh`, design 4.4).
 *
 * @param glb The file.
 * @returns The share, or `null` for a file with no twist bone of the upper arm.
 * @throws Error if the share is not a number from 0 to 1.
 */
export function upperTwistOf(glb: Glb): number | null {
  const share = glb.json.asset?.extras?.upperTwist;
  if (share === undefined) {
    return null;
  }
  if (!(share >= 0 && share <= 1)) {
    throw new Error(`The upper twist ${share} of the file is not a share from 0 to 1.`);
  }
  return share;
}

/**
 * Gives the unit elbow axes of the bind arms in the rig of a GLB file with straight bind arms
 * (`studio.straightArms` of the config of `pnpm rig-mesh`, design 4.4), in the axes of the file.
 *
 * @param glb The file.
 * @returns The axis of each side, or `null` for a file with bent bind arms.
 * @throws Error if an axis is not a unit vector of three numbers.
 */
export function hingesOf(glb: Glb): Record<Side, Vector3> | null {
  const hinges = glb.json.asset?.extras?.hinges;
  if (hinges === undefined) {
    return null;
  }
  const axis = (side: Side): Vector3 => {
    const [x, y, z] = hinges[side];
    const out = new Vector3(x, y, z);
    if (hinges[side].length !== 3 || Math.abs(out.length() - 1) > 1e-3) {
      throw new Error(`The hinge ${side} of the file is not a unit vector of three numbers.`);
    }
    return out;
  };
  return { L: axis('L'), R: axis('R') };
}

/**
 * Gives the factor by which the rig of a GLB file grows the head (`pnpm rig-mesh`).
 *
 * @param glb The file.
 * @returns The factor, or 1 when the file has none.
 * @throws Error if the factor is not a positive number.
 */
export function headFactorOf(glb: Glb): number {
  const factor = glb.json.asset?.extras?.headFactor ?? 1;
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`The head factor ${factor} of the file is not a positive number.`);
  }
  return factor;
}

/**
 * Gives the factor by which the rig of a GLB file shortens the neck (`pnpm rig-mesh`).
 *
 * @param glb The file.
 * @returns The factor, or 1 when the file has none.
 * @throws Error if the factor is not a positive number.
 */
export function neckFactorOf(glb: Glb): number {
  const factor = glb.json.asset?.extras?.neckFactor ?? 1;
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`The neck factor ${factor} of the file is not a positive number.`);
  }
  return factor;
}

/**
 * Gives the move of the head center of the holds back to the head before the smoothing of the rig
 * of a GLB file (`pnpm rig-mesh`). The smoothing removes the fur spikes at the back of the head of
 * the fox mesh, which set the back of the box of the head, so the move keeps the holds in their
 * places (design 4.4).
 *
 * @param glb The file.
 * @returns The move, in the units and the axes of the studio, or no move when the file has none.
 * @throws Error if the move is not three finite numbers.
 */
export function headShiftOf(glb: Glb): Vector3 {
  const shift = glb.json.asset?.extras?.headShift ?? [0, 0, 0];
  if (!Array.isArray(shift) || shift.length !== 3 || !shift.every((x) => Number.isFinite(x))) {
    throw new Error(`The head shift ${JSON.stringify(shift)} of the file is not three numbers.`);
  }
  return new Vector3(...shift);
}

/** A corrective shape of a raised arm or of a bent wrist of a GLB file. */
export interface FileRaise {
  /** The pose of the shape in the model axes. */
  readonly pose: StudioRaise;
  /** The morph target of the shape. */
  readonly target: string;
}

/**
 * Gives the poses of the corrective shapes of a raised arm or of a bent wrist of the rig of a GLB
 * file (`pnpm rig-mesh`) in the model axes (design 4.4), in their order in the file: the turn turns
 * by a half circle around y, and the angles go to radians. The file holds one pose, or a list of
 * up to {@link STUDIO_RAISES} poses.
 *
 * @param glb The file.
 * @returns The shapes, or none when the file has no such shape.
 * @throws Error if the file has more than {@link STUDIO_RAISES} poses, if a side is not `L` or
 *   `R`, if a bone is given and is not `forearm` or `hand`, if a turn is not four finite numbers of length 1,
 *   if the angles are not two numbers with 0 <= first < second, if a target does not have the form
 *   `arm_raise_<side>`, if two poses name one target, or if the file has no morph target of a
 *   shape.
 */
export function raisesOf(glb: Glb): FileRaise[] {
  const extras = glb.json.asset?.extras?.raise;
  if (!extras) {
    return [];
  }
  const list: readonly RaiseExtras[] = Array.isArray(extras) ? extras : [extras];
  if (list.length > STUDIO_RAISES) {
    throw new Error(`The file has ${list.length} raised arms, more than ${STUDIO_RAISES}.`);
  }
  const targets = targetNamesOf(glb);
  const out: FileRaise[] = [];
  for (const raise of list) {
    const { side, bone, turn = [], fade = [] } = raise;
    if (side !== 'L' && side !== 'R') {
      throw new Error(`The side ${String(side)} of the raised arm is not L or R.`);
    }
    if (bone !== undefined && bone !== 'forearm' && bone !== 'hand') {
      throw new Error(`The bone ${bone} of the raised arm is not forearm or hand.`);
    }
    const [x = 0, y = 0, z = 0, w = 0] = turn;
    if (
      turn.length !== 4 ||
      !turn.every((v) => Number.isFinite(v)) ||
      Math.abs(Math.hypot(x, y, z, w) - 1) > 1e-4
    ) {
      throw new Error(
        `The turn ${JSON.stringify(turn)} of the raised arm is not a unit quaternion.`,
      );
    }
    const [full = NaN, none = NaN] = fade;
    if (fade.length !== 2 || !(full >= 0 && none > full)) {
      throw new Error(`The angles ${JSON.stringify(fade)} of the raised arm do not fade.`);
    }
    const target = raise.target ?? RAISE_NAMES[side];
    if (!RAISE_TARGET.test(target)) {
      throw new Error(`The target ${target} of the raised arm is not arm_raise_<side>.`);
    }
    if (out.some((other) => other.target === target)) {
      throw new Error(`Two raised arms have the morph target ${target}.`);
    }
    if (!targets.includes(target)) {
      throw new Error(`The file has no morph target ${target}.`);
    }
    // The turn of a half circle around y moves a rotation into the model axes: x and z change
    // sign.
    const model: Quat = [round(-x), round(y), round(-z), round(w)];
    const angles: [number, number] = [
      round(full * MathUtils.DEG2RAD),
      round(none * MathUtils.DEG2RAD),
    ];
    const pose: StudioRaise =
      bone === undefined
        ? { side, turn: model, fade: angles }
        : { side, bone, turn: model, fade: angles };
    out.push({ pose, target });
  }
  return out;
}

/**
 * The facts of a rig that grows the head and shortens the neck (`pnpm rig-mesh`), in the bind pose
 * of the file. The rig grows the head and the ears around the neck joint by the head factor, then
 * moves them by {@link HeadRig.drop}. The neck stretches by the neck factor between the neck joint
 * and the head joint of the source, so a point of the neck moves along the neck by the neck
 * factor less 1 times its place along the neck, and a point beyond the head joint by the whole
 * drop of the neck.
 */
export interface HeadRig {
  /** The neck joint. */
  readonly neck: Vector3;
  /** The unit direction of the neck, from the neck joint to the head joint. */
  readonly axis: Vector3;
  /** The length of the neck of the source, before the head factor and the neck factor. */
  readonly length: number;
  /** The head factor. */
  readonly headFactor: number;
  /** The neck factor. */
  readonly neckFactor: number;
  /** The move of the head and the ears along the neck after the growth, 0 for the factor 1. */
  readonly drop: Vector3;
}

/**
 * Gives the facts of the head and the neck of a rig from its joints in the bind pose of the file.
 * The neck of the file is the neck of the source times the head factor and the neck factor.
 *
 * @param neck The neck joint.
 * @param head The head joint.
 * @param headFactor The head factor of the rig.
 * @param neckFactor The neck factor of the rig.
 * @returns The facts.
 */
export function headRig(
  neck: Vector3,
  head: Vector3,
  headFactor: number,
  neckFactor: number,
): HeadRig {
  const span = head.clone().sub(neck);
  return {
    neck,
    axis: span.clone().normalize(),
    length: span.length() / (headFactor * neckFactor),
    headFactor,
    neckFactor,
    drop: span.clone().multiplyScalar((neckFactor - 1) / neckFactor),
  };
}

/**
 * Gives the place of a vertex of a grown head before the growth of the rig, on the short neck.
 * The rig moves each vertex by the moves of its bones, blended by its weights: `p' = p + head
 * ((factor - 1) (p - neck) + drop) + neck (neck factor - 1) along(p) axis`, with `along(p)` the
 * place of the source point along the neck, clamped from 0 at the neck joint to the length of the
 * neck. The drop lies along the neck, so the place along the neck of `p'` gives `along(p)` on
 * each of the three pieces of the clamp. The inverse then adds the whole drop, so the head before
 * the growth sits on the short neck. The inverse is exact for the vertices of the head, of the
 * neck, and of the bones that do not move.
 *
 * @param place The place of the vertex in the bind pose of the file.
 * @param shares The weight of the vertex on the head and the ears, and on the neck.
 * @param rig The facts of the head and the neck of the rig.
 * @returns The place before the growth, on the short neck.
 */
export function ungrown(
  place: Vector3,
  shares: { readonly head: number; readonly neck: number },
  rig: HeadRig,
): Vector3 {
  const { neck, axis, length, headFactor, neckFactor, drop } = rig;
  const grow = 1 + shares.head * (headFactor - 1);
  const stretch = shares.neck * (neckFactor - 1);
  const along = place.clone().sub(neck).dot(axis) - shares.head * drop.dot(axis);
  // The place along the neck of `p'` grows with the place of `p` on each piece, so the clamp of
  // the place of the middle piece gives the clamped place of `p`.
  const clamped = MathUtils.clamp(along / (grow + stretch), 0, length);
  return place
    .clone()
    .addScaledVector(axis, -stretch * clamped)
    .addScaledVector(drop, -shares.head)
    .sub(neck)
    .divideScalar(grow)
    .add(neck)
    .add(drop);
}

/**
 * Splits a GLB file into its JSON chunk and its binary chunk.
 *
 * @param bytes The file.
 * @returns The two chunks.
 * @throws Error if the file is not a GLB file of version 2.
 */
export function readGlb(bytes: Uint8Array): Glb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('The file is not a GLB file of version 2.');
  }

  const jsonLength = view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  const binAt = 20 + jsonLength;
  const binLength = view.getUint32(binAt, true);
  // SAFETY: the JSON chunk of a GLB file holds a glTF document, and the reads below check the
  // fields that they use.
  const json = JSON.parse(text) as Gltf;
  return { json, bin: bytes.subarray(binAt + 8, binAt + 8 + binLength) };
}

/** The number of components of each accessor type. */
const COMPONENTS: ReadonlyMap<string, number> = new Map([
  ['SCALAR', 1],
  ['VEC2', 2],
  ['VEC3', 3],
  ['VEC4', 4],
  ['MAT4', 16],
]);

/** The byte size and the largest value of each integer component type. */
const INTEGERS: ReadonlyMap<number, readonly [bytes: number, max: number]> = new Map([
  [5121, [1, 255]],
  [5123, [2, 65535]],
  [5125, [4, 4294967295]],
]);

/**
 * Reads one component.
 *
 * @param view The binary chunk.
 * @param at The byte offset.
 * @param type The component type.
 * @returns The value, as stored.
 */
function component(view: DataView, at: number, type: number): number {
  switch (type) {
    case 5126:
      return view.getFloat32(at, true);
    case 5121:
      return view.getUint8(at);
    case 5123:
      return view.getUint16(at, true);
    case 5125:
      return view.getUint32(at, true);
    default:
      throw new Error(`The component type ${type} is not read.`);
  }
}

/**
 * Reads an accessor, with its sparse part. A normalized integer becomes a number from 0 to 1.
 *
 * @param glb The file.
 * @param index The accessor.
 * @returns The values, `count × components` numbers.
 * @throws Error if the accessor does not exist.
 */
export function readAccessor(glb: Glb, index: number): Float64Array {
  const accessor = glb.json.accessors[index];
  if (!accessor) {
    throw new Error(`The accessor ${index} does not exist.`);
  }

  const n = COMPONENTS.get(accessor.type) ?? 1;
  const out = new Float64Array(accessor.count * n);
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const size = INTEGERS.get(accessor.componentType)?.[0] ?? 4;
  const max = accessor.normalized ? (INTEGERS.get(accessor.componentType)?.[1] ?? 1) : 1;
  const bufferView =
    accessor.bufferView === undefined ? undefined : glb.json.bufferViews[accessor.bufferView];
  if (bufferView) {
    const stride = bufferView.byteStride ?? size * n;
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let i = 0; i < accessor.count; i++) {
      for (let k = 0; k < n; k++) {
        out[i * n + k] =
          component(view, start + i * stride + k * size, accessor.componentType) / max;
      }
    }
  }
  const sparse = accessor.sparse;
  if (sparse) {
    const indexView = glb.json.bufferViews[sparse.indices.bufferView];
    const valueView = glb.json.bufferViews[sparse.values.bufferView];
    const indexSize = INTEGERS.get(sparse.indices.componentType)?.[0] ?? 4;
    for (let s = 0; s < sparse.count; s++) {
      const target = component(
        view,
        (indexView?.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0) + s * indexSize,
        sparse.indices.componentType,
      );
      for (let k = 0; k < n; k++) {
        const at = (valueView?.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0);
        out[target * n + k] =
          component(view, at + (s * n + k) * size, accessor.componentType) / max;
      }
    }
  }
  return out;
}

/**
 * Gives the local matrix of a node, with the animated values of a pose in place of its own.
 *
 * @param node The node.
 * @param pose The animated rotation, translation, and scale of the node, or none.
 * @returns The matrix.
 */
function localMatrix(node: GltfNode, pose: NodePose | undefined): Matrix4 {
  if (node.matrix) {
    return new Matrix4().fromArray(node.matrix);
  }
  const t = pose?.translation ?? node.translation ?? [0, 0, 0];
  const r = pose?.rotation ?? node.rotation ?? [0, 0, 0, 1];
  const s = pose?.scale ?? node.scale ?? [1, 1, 1];
  return new Matrix4().compose(
    new Vector3(t[0], t[1], t[2]),
    new Quaternion(r[0], r[1], r[2], r[3]),
    new Vector3(s[0], s[1], s[2]),
  );
}

/** The animated values of one node at one time. */
interface NodePose {
  translation?: readonly number[];
  rotation?: readonly number[];
  scale?: readonly number[];
}

/**
 * Calculates the world matrix of each node of the scene, from the roots down.
 *
 * @param gltf The document.
 * @param poses The animated values of the nodes of a pose.
 * @returns The world matrix of each node.
 */
export function worldMatrices(gltf: Gltf, poses: ReadonlyMap<number, NodePose>): Matrix4[] {
  const parents = new Map<number, number>();
  for (const [i, node] of gltf.nodes.entries()) {
    for (const child of node.children ?? []) {
      parents.set(child, i);
    }
  }
  const worlds: (Matrix4 | undefined)[] = [];
  const worldOf = (i: number): Matrix4 => {
    const known = worlds[i];
    if (known) {
      return known;
    }
    const node = gltf.nodes[i] ?? {};
    const local = localMatrix(node, poses.get(i));
    const parent = parents.get(i);
    const world = parent === undefined ? local : worldOf(parent).clone().multiply(local);
    worlds[i] = world;
    return world;
  };
  return gltf.nodes.map((_, i) => worldOf(i));
}

/** The animated values of the nodes at the first key of an animation. */
interface FirstKeys {
  /** The values of each animated node. */
  readonly nodes: Map<number, NodePose>;
  /** The weights of the morph targets of the skinned mesh, in their order. */
  readonly weights: readonly number[];
}

/**
 * Gives the animated values of the nodes at the first key of an animation.
 *
 * @param glb The file.
 * @param name The name of the animation.
 * @returns The values of each animated node, and the weights of the morph targets.
 * @throws Error if the file has no animation of the name.
 */
export function firstKeys(glb: Glb, name: string): FirstKeys {
  const animation = glb.json.animations?.find((a) => a.name === name);
  if (!animation) {
    throw new Error(`The file has no animation "${name}".`);
  }

  const nodes = new Map<number, NodePose>();
  let weights: readonly number[] = [];
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if (!sampler) {
      continue;
    }
    const output = readAccessor(glb, sampler.output);
    const pose = nodes.get(channel.target.node) ?? {};
    const path = channel.target.path;
    if (path === 'rotation') {
      pose.rotation = Array.from(output.subarray(0, 4));
    } else if (path === 'translation') {
      pose.translation = Array.from(output.subarray(0, 3));
    } else if (path === 'scale') {
      pose.scale = Array.from(output.subarray(0, 3));
    } else if (path === 'weights') {
      const keys = glb.json.accessors[sampler.input]?.count ?? 1;
      weights = Array.from(output.subarray(0, output.length / keys));
    }
    nodes.set(channel.target.node, pose);
  }
  return { nodes, weights };
}

/**
 * Moves a point of the studio into the model axes of the app: the studio animal faces +z with its
 * left side at +x, and the app animal faces -z with its left side at -x (design 4.4). The turn of
 * a half circle around y keeps the order of the corners of each face.
 *
 * @param p The point, in the units of the studio.
 * @param scale The meters for each unit.
 * @returns The point in meters, in the model axes.
 */
export function toModelAxes(p: Vector3, scale: number): Vec3 {
  return [round(-p.x * scale), round(p.y * scale), round(-p.z * scale)];
}

/**
 * Rounds a number to 6 decimals, so that the module stays short and the same on each run.
 *
 * @param value The number.
 * @returns The rounded number.
 */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6 + 0;
}

/** One welded vertex of the studio mesh, in the axes and the units of the studio. */
interface SourceVertex {
  readonly position: Vector3;
  /** The bones of the vertex, as names, and their weights. */
  skin: readonly (readonly [bone: string, weight: number])[];
  /** The move of each corrective shape. */
  readonly moves: Vector3[];
  /** The primitive of the vertex. */
  readonly material: string;
}

/** The welded mesh of the studio: the vertices and the faces. */
interface SourceMesh {
  readonly vertices: SourceVertex[];
  readonly faces: {
    readonly corners: [number, number, number];
    readonly color: Vec3;
    /**
     * The color of the face before the color shift of the rig (`COLOR_1`, `colors.shift` of
     * `tools/blender/rig_mesh.py`). It is the color when the file has no shift.
     */
    readonly base?: Vec3;
    readonly finish: Finish;
    /** True for a cap of the cut of the rig ({@link cutFacesOf}). */
    readonly cap?: boolean;
    /** True for a face of the rim of the caps of the body of the cut ({@link cutFacesOf}). */
    readonly rim?: boolean;
  }[];
}

/**
 * Welds the primitives of the skinned mesh: each place with its skin is one vertex. The faces of
 * the studio are flat, with one color each, so a vertex needs no normal and no color.
 *
 * @param glb The file.
 * @param kept The corrective shapes that the export keeps: the first morph targets.
 * @returns The welded mesh. The primitive of a dropped bone, such as the baton, is not in it.
 * @throws Error if the file has no skinned mesh, if its first morph targets are not these shapes,
 *   or if a face has corners of different colors.
 */
export function weldMesh(glb: Glb, kept: readonly string[]): SourceMesh {
  const node = glb.json.nodes.find((n) => n.mesh !== undefined && n.skin !== undefined);
  const mesh = node?.mesh === undefined ? undefined : glb.json.meshes[node.mesh];
  const skin = node?.skin === undefined ? undefined : glb.json.skins[node.skin];
  if (!mesh || !skin) {
    throw new Error('The file has no skinned mesh.');
  }
  const names = mesh.extras?.targetNames ?? [];
  const targets = kept.map((name) => names.indexOf(name));
  if (targets.some((t) => t < 0)) {
    throw new Error(`The shapes are ${names.join(', ')}, with no ${kept.join(', ')}.`);
  }

  const jointNames = skin.joints.map((j) => ownBone(glb.json.nodes[j]?.name ?? ''));
  const caps = cutFacesOf(glb, 'caps');
  const rim = cutFacesOf(glb, 'rim');
  const vertices: SourceVertex[] = [];
  const faces: SourceMesh['faces'] = [];
  for (const primitive of mesh.primitives) {
    const material = glb.json.materials?.[primitive.material ?? -1]?.name ?? '';
    const finish = FINISHES.get(material);
    if (!finish) {
      continue;
    }
    const at = (name: string): Float64Array => readAccessor(glb, primitive.attributes[name] ?? -1);
    const positions = at('POSITION');
    const joints = at('JOINTS_0');
    const weights = at('WEIGHTS_0');
    const colors = at('COLOR_0');
    const bases = primitive.attributes['COLOR_1'] === undefined ? null : at('COLOR_1');
    const colorSize = colors.length / (positions.length / 3);
    const moves = targets.map((t) => readAccessor(glb, primitive.targets?.[t]?.['POSITION'] ?? -1));
    const indices = readAccessor(glb, primitive.indices);

    const welded = new Map<string, number>();
    const vertexOf = (v: number): number => {
      const key = [
        ...positions.subarray(v * 3, v * 3 + 3),
        ...joints.subarray(v * 4, v * 4 + 4),
      ].join(' ');
      const known = welded.get(key);
      if (known !== undefined) {
        return known;
      }
      // The digits of a paw are one bone, so their weights add up.
      const sums = new Map<string, number>();
      for (let k = 0; k < 4; k++) {
        const bone = jointNames[joints[v * 4 + k] ?? 0] ?? '';
        const w = weights[v * 4 + k] ?? 0;
        if (w > 0) {
          sums.set(bone, (sums.get(bone) ?? 0) + w);
        }
      }
      const skinOf = [...sums];
      if (skinOf.some(([bone]) => DROPPED_BONES.has(bone))) {
        throw new Error(`A vertex of the material "${material}" follows a dropped bone.`);
      }
      vertices.push({
        position: new Vector3().fromArray(positions, v * 3),
        skin: skinOf,
        moves: moves.map((m) => new Vector3().fromArray(m, v * 3)),
        material,
      });
      welded.set(key, vertices.length - 1);
      return vertices.length - 1;
    };

    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
      const color = Array.from(colors.subarray(a * colorSize, a * colorSize + 3));
      for (const other of [b, c]) {
        const second = colors.subarray(other * colorSize, other * colorSize + 3);
        if (color.some((value, k) => Math.abs(value - (second[k] ?? 0)) > 1e-6)) {
          throw new Error(`The face ${t / 3} of the material "${material}" has two colors.`);
        }
      }
      const base = bases?.subarray(a * colorSize, a * colorSize + 3) ?? color;
      faces.push({
        corners: [vertexOf(a), vertexOf(b), vertexOf(c)],
        color: [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0],
        base: [base[0] ?? 0, base[1] ?? 0, base[2] ?? 0],
        finish,
        cap: material === 'fur' && caps.has(t / 3),
        rim: material === 'fur' && rim.has(t / 3),
      });
    }
  }
  const capCount = faces.filter((face) => face.cap === true).length;
  if (capCount !== caps.size) {
    throw new Error(`The file names ${caps.size} caps, and the primitive fur has ${capCount}.`);
  }
  const rimCount = faces.filter((face) => face.rim === true).length;
  if (rimCount !== rim.size) {
    throw new Error(`The file names ${rim.size} rim faces, and the primitive fur has ${rimCount}.`);
  }
  return { vertices, faces };
}

/** The bind pose of the skeleton of the studio, in the axes and the units of the studio. */
interface SourceSkeleton {
  /** The world matrix of each joint in the bind pose, by name. */
  readonly binds: ReadonlyMap<string, Matrix4>;
  /** The joint node of each name. */
  readonly nodes: ReadonlyMap<string, number>;
}

/**
 * Reads the bind pose of the skeleton from the inverse bind matrices, and checks that the nodes
 * of the scene give the same pose.
 *
 * @param glb The file.
 * @returns The bind pose.
 * @throws Error if the joints are not the bones of the biped template, or if the nodes and the
 *   inverse bind matrices disagree.
 */
export function readSkeleton(glb: Glb): SourceSkeleton {
  const skin = glb.json.skins[0];
  if (!skin) {
    throw new Error('The file has no skin.');
  }
  const inverse = readAccessor(glb, skin.inverseBindMatrices);
  const worlds = worldMatrices(glb.json, new Map());
  const binds = new Map<string, Matrix4>();
  const nodes = new Map<string, number>();
  for (const [k, joint] of skin.joints.entries()) {
    const name = glb.json.nodes[joint]?.name ?? '';
    const bind = new Matrix4().fromArray(inverse, k * 16).invert();
    const world = worlds[joint] ?? new Matrix4();
    const error = Math.max(...bind.elements.map((e, i) => Math.abs(e - (world.elements[i] ?? 0))));
    if (error > 1e-4) {
      throw new Error(`The node of "${name}" is ${error} from its bind pose.`);
    }
    binds.set(name, bind);
    nodes.set(name, joint);
  }
  for (const side of ['L', 'R'] as const) {
    const digits = [...binds].filter(([name]) => ownBone(name) === `fingers_${side}`);
    if (!binds.has(`fingers_${side}`) && digits.length > 0) {
      binds.set(`fingers_${side}`, mergedBind(digits.map(([, bind]) => bind)));
    }
  }
  const body = STUDIO_BONES.filter((b) => !b.startsWith('eye_'));
  const missing = body.filter((b) => !binds.has(b) && !isOptionalBone(b));
  const extra = [...binds.keys()].filter(
    (b) => !DROPPED_BONES.has(b) && !DIGIT.test(b) && !body.some((own) => own === b),
  );
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`The joints lack ${missing.join(', ')} and add ${extra.join(', ')}.`);
  }
  return { binds, nodes };
}

/**
 * Makes the bind pose of the one finger bone of a paw from the bind poses of its digits: the
 * head at the middle of the heads of the digits, the y axis along the mean digit, and the z axis
 * (the side of the palm) along the mean z axis of the digits. The digits start on one line
 * across the paw, so a curl around this bone stays near the curl of each digit around its own
 * head.
 *
 * @param digits The bind pose of each digit.
 * @returns The bind pose of the finger bone.
 */
function mergedBind(digits: readonly Matrix4[]): Matrix4 {
  const head = new Vector3();
  const y = new Vector3();
  const z = new Vector3();
  const axes = [new Vector3(), new Vector3(), new Vector3()] as const;
  for (const digit of digits) {
    digit.extractBasis(axes[0], axes[1], axes[2]);
    head.add(new Vector3().setFromMatrixPosition(digit));
    y.add(axes[1].normalize());
    z.add(axes[2].normalize());
  }
  head.divideScalar(digits.length);
  y.normalize();
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new Vector3().crossVectors(y, z);
  return new Matrix4().makeBasis(x, y, z).setPosition(head);
}

/**
 * Gives the place of the head of a joint in the bind pose.
 *
 * @param skeleton The bind pose.
 * @param bone The joint.
 * @returns The place, in the axes and the units of the studio.
 */
function headOf(skeleton: SourceSkeleton, bone: string): Vector3 {
  return new Vector3().setFromMatrixPosition(skeleton.binds.get(bone) ?? new Matrix4());
}

/**
 * Gives an axis of the frame of a joint in the bind pose.
 *
 * @param skeleton The bind pose.
 * @param bone The joint.
 * @param axis 0 for x, 1 for y (along the bone), 2 for z.
 * @returns The unit axis, in the axes of the studio.
 */
function axisOf(skeleton: SourceSkeleton, bone: string, axis: number): Vector3 {
  const x = new Vector3();
  const y = new Vector3();
  const z = new Vector3();
  (skeleton.binds.get(bone) ?? new Matrix4()).extractBasis(x, y, z);
  return [x, y, z][axis]?.normalize() ?? new Vector3();
}

/**
 * Finds the parts of the eyes of the mesh: the shells of the gloss material on the head that are
 * out of the middle plane. Each eye of the studio is a few nested shells and a light, and each eye
 * of a rig of `pnpm rig-mesh` is one gloss fan over the dark faces of the eye. The export drops
 * them, and the app adds the pea eyes at their places (design 4.5).
 *
 * @param mesh The welded mesh.
 * @returns The vertices of the eye of each side.
 */
export function eyeVertices(mesh: SourceMesh): Readonly<Record<Side, ReadonlySet<number>>> {
  // The shells of the gloss faces on the head: the faces that share a vertex are one shell.
  const parent = mesh.vertices.map((_, v) => v);
  const rootOf = (v: number): number => {
    let r = v;
    while (parent[r] !== r) {
      r = parent[r] ?? r;
    }
    return r;
  };
  const onHead = mesh.faces.filter((face) =>
    face.corners.every((c) => {
      const v = mesh.vertices[c];
      return v?.material === 'gloss' && v.skin.length === 1 && v.skin[0]?.[0] === 'head';
    }),
  );
  for (const face of onHead) {
    const [a, b, c] = face.corners.map(rootOf);
    parent[b ?? 0] = a ?? 0;
    parent[rootOf(c ?? 0)] = a ?? 0;
  }
  const shells = new Map<number, number[]>();
  for (const face of onHead) {
    const root = rootOf(face.corners[0]);
    const shell = shells.get(root) ?? [];
    shell.push(...face.corners);
    shells.set(root, shell);
  }

  // A shell out of the middle plane is a part of an eye. The nose is on the middle plane.
  const out = { L: new Set<number>(), R: new Set<number>() };
  for (const shell of shells.values()) {
    const x = shell.reduce((sum, c) => sum + (mesh.vertices[c]?.position.x ?? 0), 0) / shell.length;
    if (Math.abs(x) > EYE_SIDE) {
      // The studio puts the left side of the animal at +x.
      for (const c of shell) {
        out[x > 0 ? 'L' : 'R'].add(c);
      }
    }
  }
  return out;
}

/**
 * Finds the place of a pea eye on the head (design 4.5): the nearest point of the fur faces of the
 * head to the middle of the old eye. A fur face of the head has each corner more than half on the
 * head bone.
 *
 * @param mesh The welded mesh.
 * @param middle The middle of the old eye, in the axes and the units of the studio.
 * @returns The point, in the axes and the units of the studio.
 * @throws Error if the head has no fur face.
 */
export function eyeOnHead(mesh: SourceMesh, middle: Vector3): Vector3 {
  const point = new Vector3();
  const near = new Vector3();
  const triangle = new Triangle();
  let best = Infinity;
  for (const face of mesh.faces) {
    const corners = face.corners.map((c) => mesh.vertices[c]);
    const onHead = corners.every(
      (v) => v?.material === 'fur' && (v.skin.find(([bone]) => bone === 'head')?.[1] ?? 0) > 0.5,
    );
    const [a, b, c] = corners;
    if (onHead && a && b && c) {
      triangle.set(a.position, b.position, c.position).closestPointToPoint(middle, near);
      if (near.distanceTo(middle) < best) {
        best = near.distanceTo(middle);
        point.copy(near);
      }
    }
  }
  if (best === Infinity) {
    throw new Error('The head has no fur face.');
  }
  return point;
}

/** The fill of one old eye ({@link fillEye}). */
interface EyeFill {
  /** The number of the moved vertices. */
  readonly count: number;
  /** The largest move. */
  readonly largest: number;
}

/** The least number of vertices of the ring of a fit of {@link fillEye}: more than its 6 terms. */
const FILL_LEAST_RING = 10;

/**
 * Fills the form of an old eye of the mesh that stands out of the head as a ball in a groove
 * (`eyeFill` of {@link AnimalSettings}, design 4.5): a least squares fit of the heights of the
 * head along the normal of the eye, over the ring of the fur vertices of the head between `inner`
 * and `outer` from the axis, gives a smooth surface, and each fur vertex of the head within
 * `inner` of the axis moves along the normal onto it. Thus the ball and the groove go, and the pea
 * eye lies on the head as on a smooth face. The vertices of the gloss fan stay.
 *
 * @param mesh The welded mesh with no eye faces. Its vertices move.
 * @param middle The middle of the old eye, in the axes and the units of the studio.
 * @param inner The radius of the filled area around the axis, in the units of the studio.
 * @param outer The outer radius of the ring of the fit, in the units of the studio.
 * @returns The number of the moved vertices and the largest move, in the units of the studio.
 * @throws Error if fewer than {@link FILL_LEAST_RING} vertices lie in the ring.
 */
export function fillEye(mesh: SourceMesh, middle: Vector3, inner: number, outer: number): EyeFill {
  const onHead = (v: SourceVertex | undefined): v is SourceVertex =>
    v?.material === 'fur' && (v.skin.find(([bone]) => bone === 'head')?.[1] ?? 0) > 0.5;
  const used = new Set<number>();
  const normal = new Vector3();
  const triangle = new Triangle();
  for (const face of mesh.faces) {
    const corners = face.corners.map((c) => mesh.vertices[c]);
    const [a, b, c] = corners;
    if (!onHead(a) || !onHead(b) || !onHead(c)) {
      continue;
    }
    for (const k of face.corners) {
      used.add(k);
    }
    triangle.set(a.position, b.position, c.position);
    if (triangle.getMidpoint(new Vector3()).distanceTo(middle) < outer) {
      normal.addScaledVector(triangle.getNormal(new Vector3()), triangle.getArea());
    }
  }
  const n = normal.normalize();
  const up = new Vector3(0, 1, 0).projectOnPlane(n).normalize();
  const across = new Vector3().crossVectors(up, n);
  const local = (p: Vector3) => {
    const rel = p.clone().sub(middle);
    const along = rel.dot(n);
    return { u: rel.dot(across), w: rel.dot(up), along };
  };
  const terms = (u: number, w: number) => [1, u, w, u * u, u * w, w * w];
  const sums = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0, 0]);
  let ring = 0;
  for (const k of used) {
    const { u, w, along } = local(mesh.vertices[k]?.position ?? new Vector3());
    const radius = Math.hypot(u, w);
    if (radius < inner || radius > outer || Math.abs(along) > outer) {
      continue;
    }
    const t = terms(u / outer, w / outer);
    for (const [r, row] of sums.entries()) {
      for (const [c, term] of t.entries()) {
        row[c] = (row[c] ?? 0) + (t[r] ?? 0) * term;
      }
      row[6] = (row[6] ?? 0) + (t[r] ?? 0) * along;
    }
    ring++;
  }
  if (ring < FILL_LEAST_RING) {
    throw new Error(`Only ${ring} vertices of the head lie in the ring of the eye fill.`);
  }
  const fit = solveLinear(sums);
  let count = 0;
  let largest = 0;
  for (const k of used) {
    const position = mesh.vertices[k]?.position;
    if (!position) {
      continue;
    }
    const { u, w, along } = local(position);
    if (Math.hypot(u, w) >= inner || Math.abs(along) > inner) {
      continue;
    }
    const surface = terms(u / outer, w / outer).reduce((s, t, c) => s + t * (fit[c] ?? 0), 0);
    position.addScaledVector(n, surface - along);
    count++;
    largest = Math.max(largest, Math.abs(surface - along));
  }
  return { count, largest };
}

/** The number of samples of the head surface on each half axis of a pea eye ({@link eyeBend}). */
const BEND_SAMPLES = 6;

/**
 * The size of the area of the samples of {@link eyeBend}, as a share of the size of the oval, so
 * that the fit also holds at the rim.
 */
const BEND_REACH = 1.1;

/** The least number of samples of a fit of {@link eyeBend}: more than its 5 terms. */
const BEND_LEAST_SAMPLES = 12;

/**
 * Gives the height of the head surface along the axis of an eye, at a place of the plane of the
 * eye: the crossing of the line along the axis with an outer face of the head, nearest to the
 * plane. An outer face faces along the axis.
 *
 * @param triangles The faces of the head near the eye, counterclockwise from outside.
 * @param base The place in the plane of the eye.
 * @param axis The unit axis of the eye.
 * @param reach The largest height of a crossing, in the units of the faces.
 * @returns The height, or `null` when the line meets no outer face within the reach.
 */
function surfaceHeight(
  triangles: readonly Triangle[],
  base: Vector3,
  axis: Vector3,
  reach: number,
): number | null {
  const ray = new Ray(base.clone().addScaledVector(axis, -reach), axis);
  const hit = new Vector3();
  const normal = new Vector3();
  let best: number | null = null;
  for (const triangle of triangles) {
    if (
      triangle.getNormal(normal).dot(axis) > 0 &&
      ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)
    ) {
      const height = hit.sub(base).dot(axis);
      if (Math.abs(height) <= reach && (best === null || Math.abs(height) < Math.abs(best))) {
        best = height;
      }
    }
  }
  return best;
}

/**
 * Solves a small linear system by Gauss elimination with the largest pivot.
 *
 * @param a The rows of the matrix, each with the right side as its last entry. The rows change.
 * @returns The solution.
 * @throws Error if the matrix is singular.
 */
function solveLinear(a: number[][]): number[] {
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(a[r]?.[c] ?? 0) > Math.abs(a[pivot]?.[c] ?? 0)) {
        pivot = r;
      }
    }
    const top = a[pivot] ?? [];
    a[pivot] = a[c] ?? [];
    a[c] = top;
    const lead = top[c] ?? 0;
    if (Math.abs(lead) < 1e-12) {
      throw new Error('The linear system is singular.');
    }
    for (let r = 0; r < n; r++) {
      const row = a[r] ?? [];
      const f = r === c ? 0 : (row[c] ?? 0) / lead;
      for (let k = c; k <= n; k++) {
        row[k] = (row[k] ?? 0) - f * (top[k] ?? 0);
      }
    }
  }
  return a.map((row, r) => (row[n] ?? 0) / (row[r] ?? 1));
}

/**
 * Finds the bend of a pea eye (design 4.5): a least squares fit of the heights of the head surface
 * along the axis of the eye, from the plane through the surface point under the middle, over the
 * oval and a margin around it ({@link BEND_REACH}). Each corner of the bent oval then keeps its
 * depth from the head surface, as on a flat face of a parametric head: the rim lies at the fur,
 * and the front stands out of it. The direction of the eye can differ from the normal of the
 * surface, and the bend takes that slope.
 *
 * @param triangles The faces of the head near the eye, counterclockwise from outside.
 * @param surface The point of the head surface under the middle of the eye.
 * @param axis The unit direction in which the eye faces.
 * @param h The head height that sizes the eye.
 * @returns The bend, in `H`.
 * @throws Error if fewer than {@link BEND_LEAST_SAMPLES} samples meet the head.
 */
export function eyeBend(
  triangles: readonly Triangle[],
  surface: Vec3,
  axis: Vec3,
  h: number,
): EyeBend {
  const n = new Vector3(...axis);
  const up = new Vector3(0, 1, 0).projectOnPlane(n).normalize();
  const across = new Vector3().crossVectors(up, n);
  const sums = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0, 0]);
  let count = 0;
  for (let i = -BEND_SAMPLES; i <= BEND_SAMPLES; i++) {
    for (let j = -BEND_SAMPLES; j <= BEND_SAMPLES; j++) {
      const a = i / BEND_SAMPLES;
      const b = j / BEND_SAMPLES;
      if (a * a + b * b > 1) {
        continue;
      }
      const u = 0.5 * EYE[0] * BEND_REACH * a;
      const v = 0.5 * EYE[1] * BEND_REACH * b;
      const base = new Vector3(...surface)
        .addScaledVector(across, u * h)
        .addScaledVector(up, v * h);
      const height = surfaceHeight(triangles, base, n, 0.3 * h);
      if (height === null) {
        continue;
      }
      const terms = [u, v, u * u, u * v, v * v];
      for (const [r, row] of sums.entries()) {
        for (const [c, term] of terms.entries()) {
          row[c] = (row[c] ?? 0) + (terms[r] ?? 0) * term;
        }
        row[5] = (row[5] ?? 0) + (terms[r] ?? 0) * (height / h);
      }
      count++;
    }
  }
  if (count < BEND_LEAST_SAMPLES) {
    throw new Error(`Only ${count} samples of the head surface lie under the pea eye.`);
  }
  const [k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0] = solveLinear(sums).map(round);
  return [k0, k1, k2, k3, k4];
}

/** The step of the move of a pea eye out of the head, in `H` of the eyes ({@link eyePush}). */
const EYE_PUSH_STEP = 0.001;

/** The largest move of a pea eye out of the head, in `H` of the eyes ({@link eyePush}). */
const EYE_PUSH_LIMIT = 0.1;

/**
 * Finds how far a pea eye moves out along its direction, so that its front face shows (design
 * 4.5): the smallest move, in steps of {@link EYE_PUSH_STEP}, that puts each corner of the oval
 * more than a quarter of its depth in front of its middle outside the head. A corner is outside
 * when it lies on the outer side of the nearest face of the head. The rim of the oval stays in the
 * head, as the rim of an eye of a parametric body does. A bent eye ({@link eyeBend}) follows the
 * head surface, so it needs a move only where the fit of the bend misses a face.
 *
 * @param triangles The faces of the head near the eye, counterclockwise from outside.
 * @param eye The middle of the eye and the direction in which it faces.
 * @param h The head height that sizes the eye.
 * @param bend The bend of the oval, or none for a flat oval.
 * @returns The move, in the units of `h`.
 * @throws Error if no move up to {@link EYE_PUSH_LIMIT} puts the front face outside the head.
 */
export function eyePush(
  triangles: readonly Triangle[],
  eye: SurfacePoint,
  h: number,
  bend?: EyeBend,
): number {
  const builder = new MeshBuilder();
  addEye(builder, { eye: [0, 0, 0], eyeLight: [1, 1, 1] }, eye, h, 0, bend);
  const oval = builder.build();
  const middle = new Vector3(...eye.point);
  const facing = new Vector3(...eye.normal);
  const front: Vector3[] = [];
  const flat = new MeshBuilder();
  addEye(flat, { eye: [0, 0, 0], eyeLight: [1, 1, 1] }, eye, h, 0);
  const unbent = flat.build();
  for (let c = 0; c < oval.bones.length; c++) {
    const p = new Vector3().fromArray(oval.positions, c * 3);
    // A corner of the front face has its depth in front of the middle before the bend.
    const depth = new Vector3()
      .fromArray(unbent.positions, c * 3)
      .sub(middle)
      .dot(facing);
    if (oval.colors[c * 3] === 0 && depth > 0.25 * EYE[2] * h) {
      front.push(p);
    }
  }

  const near = new Vector3();
  const normal = new Vector3();
  const outside = (p: Vector3): boolean => {
    let best = Infinity;
    let side = 1;
    for (const triangle of triangles) {
      triangle.closestPointToPoint(p, near);
      if (near.distanceTo(p) < best) {
        best = near.distanceTo(p);
        side = p.clone().sub(near).dot(triangle.getNormal(normal));
      }
    }
    return side >= 0;
  };
  for (let step = 0; step * EYE_PUSH_STEP <= EYE_PUSH_LIMIT + 1e-12; step++) {
    const push = step * EYE_PUSH_STEP * h;
    if (front.every((p) => outside(p.clone().addScaledVector(facing, push)))) {
      return push;
    }
  }
  throw new Error(`No move up to ${EYE_PUSH_LIMIT} H puts the front of the eye out of the head.`);
}

/** The arms of the pose of the sheet. */
interface SheetPose {
  /** The direction of each upper arm in the axes of the chest, in the axes of the studio. */
  readonly arms: Readonly<Record<Side, Vector3>>;
  /** The weights of the corrective shapes in the first key of the clip `reference`. */
  readonly weights: readonly number[];
}

/**
 * Finds the corrective weights of the pose of the sheet, and the direction of each upper arm in
 * the axes of the chest in that pose (`correctives()` of `tools/blender/rig_mesh.py`).
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @returns The direction of each upper arm, in the axes of the studio, and the weights of the
 *   shapes in the first key of the clip `reference`.
 */
export function sheetArms(glb: Glb, skeleton: SourceSkeleton): SheetPose {
  const keys = firstKeys(glb, 'reference');
  const posed = worldMatrices(glb.json, keys.nodes);
  const turn = (bone: string): Quaternion => {
    const node = skeleton.nodes.get(bone) ?? -1;
    const world = new Quaternion().setFromRotationMatrix(posed[node] ?? new Matrix4());
    const bind = new Quaternion().setFromRotationMatrix(skeleton.binds.get(bone) ?? new Matrix4());
    return world.multiply(bind.invert());
  };
  const chest = turn('chest').invert();
  const arm = (side: Side): Vector3 => {
    const rest = headOf(skeleton, `forearm_${side}`).sub(headOf(skeleton, `upper_arm_${side}`));
    return rest
      .normalize()
      .applyQuaternion(turn(`upper_arm_${side}`))
      .applyQuaternion(chest);
  };
  return { arms: { L: arm('L'), R: arm('R') }, weights: keys.weights };
}

/**
 * Gives the index of a bone of a studio body.
 *
 * @param bone The name of the bone.
 * @returns The index in `STUDIO_BONES`.
 * @throws Error if the name is not a bone of a studio body.
 */
function boneIndexOf(bone: string): number {
  const index = STUDIO_BONES.findIndex((own) => own === bone);
  if (index < 0) {
    throw new Error(`"${bone}" is not a bone of a studio body.`);
  }
  return index;
}

/** A welded mesh with its vertices in the order of their first use. */
interface OrderedMesh {
  readonly vertices: readonly SourceVertex[];
  /** The faces, with the new indices of their corners. */
  readonly faces: readonly StudioTriangle[];
}

/**
 * Puts the vertices in the order of their first use by the faces, so that the packed corners and
 * the differences of the places are small numbers.
 *
 * @param mesh The welded mesh.
 * @returns The vertices in the new order, and the faces with the new indices.
 */
export function orderByFirstUse(mesh: SourceMesh): OrderedMesh {
  const index = new Map<number, number>();
  const vertices: SourceVertex[] = [];
  const faces = mesh.faces.map((face): StudioTriangle => {
    const corners = face.corners.map((c) => {
      let known = index.get(c);
      if (known === undefined) {
        known = vertices.length;
        index.set(c, known);
        const vertex = mesh.vertices[c];
        if (!vertex) {
          throw new Error(`A face names the vertex ${c}, which does not exist.`);
        }
        vertices.push(vertex);
      }
      return known;
    });
    return {
      corners: [corners[0] ?? 0, corners[1] ?? 0, corners[2] ?? 0],
      color: face.color,
      finish: face.finish,
    };
  });
  return { vertices, faces };
}

/** The place of the studio animal in the app: its scale and its move. */
interface SceneFrame {
  /** The meters for each unit of the studio. */
  readonly scale: number;
  /** The move of each point of the studio, in the axes and the units of the studio. */
  readonly offset: Vector3;
  /** The depth of the chair of the app under a body on a chair, in meters, or `null`. */
  readonly chairDepth: number | null;
  /**
   * The width of the chair of the app under a body on a chair, in meters, or `null` for the width
   * of the chair of design 4.5 (`AnimalSettings.seatWidth`).
   */
  readonly chairWidth: number | null;
  /** The reach of the piano bench under a body on a bench ({@link benchFitOf}), or `null`. */
  readonly bench: BenchFit | null;
}

/**
 * Reads the seat of a rig (a bench or a chair) from the extras of its asset, and gives the size of
 * the seat of the app that takes its place.
 *
 * @param glb The file.
 * @returns The seat of the rig, and the width and the depth of the seat of the app, in meters.
 * @throws Error if the file has no seat, or a seat of no seat of the app.
 */
function seatOf(glb: Glb): RigSeat {
  const seat = glb.json.asset?.extras?.seat;
  if (!seat) {
    throw new Error('The file has no seat in the extras of its asset. Rig it with pnpm rig-mesh.');
  }
  const size = SEATS.get(seat.prop);
  if (!size) {
    throw new Error(
      `The seat ${seat.prop} of the file is no seat of the app: ${[...SEATS.keys()].join(' or ')}.`,
    );
  }
  return { ...seat, ...size };
}

/**
 * Gives the height of the left shoulder joint of the standing body, the landmark of the scale of
 * an animal on its shoulders (design 4.4): the head of the joint in the bind pose, or in the clip
 * `reference` when a rig reclines the trunk of the seated bind pose (`studio.trunk` of
 * `pnpm rig-mesh`, {@link reclines}), so that the recline does not change the scale.
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @returns The height, in the units of the studio.
 */
function standingShoulder(glb: Glb, skeleton: SourceSkeleton): number {
  if (!reclines(glb)) {
    return headOf(skeleton, 'upper_arm_L').y;
  }
  const posed = worldMatrices(glb.json, firstKeys(glb, 'reference').nodes);
  return new Vector3().setFromMatrixPosition(
    posed[skeleton.nodes.get('upper_arm_L') ?? -1] ?? new Matrix4(),
  ).y;
}

/**
 * Finds if the rig of a GLB file reclines the trunk of its seated bind pose (`studio.trunk` of
 * the config of the mesh rig): the clip `reference` then turns the trunk upright.
 *
 * @param glb The file.
 * @returns True for a reclined trunk.
 */
function reclines(glb: Glb): boolean {
  return (glb.json.asset?.extras?.trunk ?? 0) !== 0;
}

/**
 * Finds the scale and the move of the studio animal in the app (design 4.4). A standing body keeps
 * its place: the soles of the studio are on the floor. A seated body drops until the lowest point
 * of its mesh, a sole, is on the floor, and moves forward so that the front edge of the seat of
 * the rig (a bench or a chair, {@link SeatExtras}) is at the front edge of the seat of the app.
 * A seated role with a seat height in its settings then rises until its seat is at that height,
 * and its feet hang above the floor.
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @param mesh The welded mesh.
 * @param settings The settings of the animal.
 * @returns The scale and the move.
 */
function sceneFrame(
  glb: Glb,
  skeleton: SourceSkeleton,
  mesh: SourceMesh,
  settings: AnimalSettings,
): SceneFrame {
  const scale = settings.height / standingShoulder(glb, skeleton);
  if (!settings.seated) {
    return { scale, offset: new Vector3(), chairDepth: null, chairWidth: null, bench: null };
  }

  const drop = Math.min(...mesh.vertices.map((v) => v.position.y));
  const seat = seatOf(glb);
  const back = seat.prop === 'chair' ? (settings.seatBack ?? 0) : 0;
  const bench = seat.prop === 'bench' ? benchFitOf(mesh, seat, scale) : null;
  const depth =
    seat.prop === 'chair'
      ? chairDepthOf(mesh, seat, scale, back, settings.backRoom ?? 0)
      : bench
        ? round(bench.ahead + bench.behind)
        : seat.depth;
  // The front edge of the seat of the rig in the app, in the axes of the studio: a chair keeps
  // its back at the back of the chair of design 4.5, and a shorter seat ends further back. The
  // body lies the move back behind it. The bench stands around the floor point, and the body sits
  // with the front edge of the seat of the rig the reach under the thighs behind its front edge.
  const appFront =
    seat.prop === 'chair' ? depth - CHAIR.seatDepth / 2 : depth / 2 - (bench?.ahead ?? 0);
  const frame = {
    scale,
    offset: new Vector3(0, -drop, (appFront - back) / scale - seat.front),
    chairDepth: seat.prop === 'chair' ? round(depth) : null,
    chairWidth: seat.prop === 'chair' ? (settings.seatWidth ?? null) : null,
    bench,
  };
  if (settings.seat === undefined) {
    return frame;
  }
  // The body rises from the floor until the lowest point over the seat is at the seat height.
  const low = seatHeightOf(glb, mesh, frame);
  frame.offset.y += (settings.seat - low) / scale;
  return frame;
}

/** The room behind the haunch to the back edge of the piano bench, in meters. */
const BENCH_BACK_ROOM = 0.02;

/** The height of the haunch above the seat top that sets the back edge of the bench, in meters. */
const BENCH_HAUNCH = 0.15;

/** The step of the search for the front edge of the bench under the thighs, in meters. */
const BENCH_STEP = 0.01;

/**
 * The depth below the seat top at which the underside of the thighs leaves the bench, in meters.
 * The thighs press at most this far into the padded seat.
 */
const BENCH_SINK = 0.01;

/** The reach of a piano bench under a seated studio body ({@link benchFitOf}), in meters. */
interface BenchFit {
  /** The reach of the front edge in front of the front edge of the seat of the rig. */
  readonly ahead: number;
  /** The reach of the back edge behind the front edge of the seat of the rig. */
  readonly behind: number;
}

/**
 * Finds the reach of the piano bench of the app under a body on a bench (design 4.4, 4.5), as the
 * bench of `polar-bear-views.png` holds the whole haunch and a part of the level thighs. The seat
 * top is the lowest point of the body over the seat of the rig. The back edge is
 * {@link BENCH_BACK_ROOM} behind the last point of the haunch, from the seat top up to
 * {@link BENCH_HAUNCH} above it. The front edge goes forward from the front edge of the seat of the
 * rig, in steps of {@link BENCH_STEP}, while the underside of the thighs stays above
 * {@link BENCH_SINK} below the seat top: further forward, a level thigh is thicker, and it would
 * go deep into the seat. The haunch sets the seat top ({@link seatHeightOf}), so the thighs press
 * a little into the pad. The tail does not count.
 *
 * @param mesh The welded mesh.
 * @param seat The seat of the rig, in the axes and the units of the studio.
 * @param scale The meters for each unit.
 * @returns The reach, in meters.
 */
function benchFitOf(mesh: SourceMesh, seat: SeatExtras, scale: number): BenchFit {
  const half = seat.halfWidth;
  const body = mesh.vertices.filter((v) => !onTail(v) && Math.abs(v.position.x) <= half);
  let top = Infinity;
  for (const { position: p } of body) {
    if (p.z >= seat.back && p.z <= seat.front) {
      top = Math.min(top, p.y);
    }
  }
  let last = Infinity;
  let first = -Infinity;
  for (const { position: p } of body) {
    if (p.y >= top && p.y <= top + BENCH_HAUNCH / scale) {
      last = Math.min(last, p.z);
    }
    first = Math.max(first, p.z);
  }
  const step = BENCH_STEP / scale;
  let ahead = 0;
  for (let z = seat.front; z < first; z += step) {
    const low = body.reduce(
      (least, { position: p }) => (p.z >= z && p.z < z + step ? Math.min(least, p.y) : least),
      Infinity,
    );
    if (low < top - BENCH_SINK / scale) {
      break;
    }
    ahead = (z + step - seat.front) * scale;
  }
  return { ahead, behind: (seat.front - last) * scale + BENCH_BACK_ROOM };
}

/**
 * Finds the depth of the chair of the app under a body on a chair (design 4.4, 4.5): the depth of
 * the chair of the rig, so that the body sits on the whole seat, as in the rig. The chair
 * grows back until its back posts keep {@link CHAIR_BACK_CLEARANCE} behind the trunk, as the
 * chair of the parametric biped does (`chairForward()` of `models/player.ts`), and then by the
 * room behind the back and the move of the body back on it. The body lies the move behind the
 * front edge of the chair of the rig, so it moves back up to that clearance, and the chair
 * grows forward under it by the rest of the move. The tail goes back through the open back under
 * the top rail, so it does not count.
 *
 * @param mesh The welded mesh.
 * @param chair The seat of the rig, in the axes and the units of the studio.
 * @param scale The meters for each unit.
 * @param move The move of the body back on the chair, in meters (`AnimalSettings.seatBack`).
 * @param room The room behind the back beyond the clearance, in meters
 *   (`AnimalSettings.backRoom`).
 * @returns The depth, in meters.
 */
function chairDepthOf(
  mesh: SourceMesh,
  chair: SeatExtras,
  scale: number,
  move: number,
  room: number,
): number {
  // The back of the chair of the app reaches its height above the seat: the lowest point of the
  // body over the chair of the rig. The tail goes back over the seat, so it does not count.
  let seat = Infinity;
  for (const vertex of mesh.vertices) {
    const p = vertex.position;
    if (
      !onTail(vertex) &&
      Math.abs(p.x) <= chair.halfWidth &&
      p.z >= chair.back &&
      p.z <= chair.front
    ) {
      seat = Math.min(seat, p.y);
    }
  }
  const top = seat + CHAIR.back / scale;
  let back = Infinity;
  for (const vertex of mesh.vertices) {
    const p = vertex.position;
    if (!onTail(vertex) && p.y <= top && Math.abs(p.x) <= chair.halfWidth) {
      back = Math.min(back, p.z);
    }
  }
  const studio = (chair.front - chair.back) * scale;
  return Math.max(
    studio,
    (chair.front - back) * scale + CHAIR_LEG + CHAIR_BACK_CLEARANCE + room + move,
  );
}

/**
 * Finds the height of a flat seat under a seated studio body (design 4.4, 4.5): the lowest point
 * of the mesh over the seat of the app (the piano bench or the chair), so that the body rests on
 * the seat and no part of it goes into the seat. A tail goes back over the seat and through the
 * open back of the chair, so it does not count: the seat is under the haunch.
 *
 * @param glb The file.
 * @param mesh The welded mesh.
 * @param frame The place of the animal in the app.
 * @returns The height of the top of the seat, in meters.
 */
function seatHeightOf(glb: Glb, mesh: SourceMesh, frame: SceneFrame): number {
  const seat = seatOf(glb);
  const halfX = (frame.chairWidth ?? seat.width) / 2 / frame.scale;
  // The seat in the axes of the studio: a chair from its back at the back of the chair of design
  // 4.5 to its front edge, and the bench around the origin. Under a body that fits it, the haunch
  // sets the bench top: the part of the bench behind the front edge of the seat of the rig.
  const fit = frame.bench;
  const bench = fit ? fit.ahead + fit.behind : seat.depth;
  const back = frame.chairDepth === null ? -bench / 2 : -CHAIR.seatDepth / 2;
  const depth = frame.chairDepth ?? (fit ? fit.behind : bench);
  let low = Infinity;
  for (const vertex of mesh.vertices) {
    const p = vertex.position.clone().add(frame.offset);
    const z = p.z * frame.scale;
    if (!onTail(vertex) && Math.abs(p.x) <= halfX && z >= back && z <= back + depth) {
      low = Math.min(low, p.y);
    }
  }
  return round(low * frame.scale);
}

/**
 * Finds the standing pose of a seated body that also stands (design 4.4): the turns of the leg
 * bones in the first key of the clip `reference`, the pose of the sheet, in which the leg
 * corrective shapes have their full weight. The trunk keeps its bind pose in that key, so the
 * hips stay, and the body moves back from its seat to stand over the origin.
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @param frame The place of the seated animal in the app.
 * @returns The standing pose, in the model axes.
 * @throws Error if the hips move or turn in the pose of the sheet.
 */
function standingOf(glb: Glb, skeleton: SourceSkeleton, frame: SceneFrame): StudioStanding {
  const posed = worldMatrices(glb.json, firstKeys(glb, 'reference').nodes);
  const turn = (bone: string): Quaternion => {
    const node = skeleton.nodes.get(bone) ?? -1;
    const world = new Quaternion().setFromRotationMatrix(posed[node] ?? new Matrix4());
    const bind = new Quaternion().setFromRotationMatrix(skeleton.binds.get(bone) ?? new Matrix4());
    return world.multiply(bind.invert());
  };
  const hips = new Vector3().setFromMatrixPosition(
    posed[skeleton.nodes.get('hips') ?? -1] ?? new Matrix4(),
  );
  const reclined = reclines(glb);
  if (
    !reclined &&
    (hips.distanceTo(headOf(skeleton, 'hips')) > 1e-4 ||
      turn('hips').angleTo(new Quaternion()) > 1e-3)
  ) {
    throw new Error('The hips move in the pose of the sheet, so the legs alone do not make it.');
  }
  // The turn of a half circle around y moves a rotation into the model axes: x and z change sign.
  const model = (q: Quaternion): Quat => [round(-q.x), round(q.y), round(-q.z), round(q.w)];
  const turns = <T extends string>(bones: readonly T[]): Record<T, Quat> =>
    // SAFETY: the entries hold each bone of the list one time.
    Object.fromEntries(bones.map((bone) => [bone, model(turn(bone))])) as Record<T, Quat>;
  const two = skeleton.binds.has('tail_tip');
  const standing: StudioStanding = {
    lift: toModelAxes(frame.offset.clone().negate(), frame.scale),
    turns: turns(STUDIO_LEG_BONES),
  };
  // A rig with a reclined trunk (`studio.trunk` of `pnpm rig-mesh`) turns the trunk upright
  // around the head of the hips, and the arms of the sheet solve the arm shapes of the standing
  // body again (`StudioStanding.armTurns`).
  const upright: StudioStanding = reclined
    ? {
        ...standing,
        trunkTurns: turns([...STUDIO_TRUNK_BONES, ...(two ? [] : (['tail'] as const))]),
        armTurns: turns(STUDIO_ARM_BONES),
      }
    : standing;
  if (!two) {
    return upright;
  }
  // A tail of two bones goes back through the chair in the bind pose, and it hangs in the pose of
  // the sheet.
  return { ...upright, tailTurns: turns(STUDIO_TAIL_BONES) };
}

/**
 * Finds the seated pose of a standing body that also sits (design 4.4, `StudioBody.sitting`): the
 * turns of the leg bones in the clip `sit`, in which the sit corrective shapes have their full
 * weight. The export skins the mesh in that clip, and fits the seat to the seated skin as it fits
 * the seat of a seated body ({@link sceneFrame}): the soles go onto the floor, the front edge of
 * the chair of the rig goes to the front edge of the chair of the app, and the seat top is the
 * lowest point of the body over the seat. The scale stays the scale of the standing body.
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @param mesh The welded mesh, with the moves of the kept shapes.
 * @param settings The settings of the animal.
 * @param kept The kept shapes, in the order of the moves of each vertex.
 * @returns The seated pose, in the model axes.
 * @throws Error if the hips move or turn in the clip, or if the rig has no chair.
 */
function sittingOf(
  glb: Glb,
  skeleton: SourceSkeleton,
  mesh: SourceMesh,
  settings: AnimalSettings,
  kept: readonly string[],
): StudioSitting {
  const posed = worldMatrices(glb.json, firstKeys(glb, SIT_CLIP).nodes);
  const skins = new Map(
    [...skeleton.binds].map(([bone, bind]) => {
      const world = posed[skeleton.nodes.get(bone) ?? -1];
      return [bone, world ? world.clone().multiply(bind.clone().invert()) : new Matrix4()] as const;
    }),
  );
  const turn = (bone: string): Quaternion =>
    new Quaternion().setFromRotationMatrix(skins.get(bone) ?? new Matrix4());
  if (
    new Vector3()
      .setFromMatrixPosition(posed[skeleton.nodes.get('hips') ?? -1] ?? new Matrix4())
      .distanceTo(headOf(skeleton, 'hips')) > 1e-4 ||
    turn('hips').angleTo(new Quaternion()) > 1e-3
  ) {
    throw new Error('The hips move in the clip sit, so the legs alone do not make it.');
  }
  const sitMoves = kept.flatMap((name, s) =>
    SIT_CORRECTIVE_NAMES.some((sit) => sit === name) ? [s] : [],
  );
  const seated: SourceMesh = {
    vertices: mesh.vertices.map((vertex) => {
      const rest = vertex.position.clone();
      for (const s of sitMoves) {
        rest.add(vertex.moves[s] ?? new Vector3());
      }
      const position = new Vector3();
      for (const [bone, w] of vertex.skin) {
        position.addScaledVector(rest.clone().applyMatrix4(skins.get(bone) ?? new Matrix4()), w);
      }
      return { ...vertex, position };
    }),
    faces: mesh.faces,
  };
  const frame = sceneFrame(glb, skeleton, seated, { ...settings, seated: true });
  if (frame.chairDepth === null) {
    throw new Error('The rig of a sit pose has no chair.');
  }
  // The turn of a half circle around y moves a rotation into the model axes: x and z change sign.
  const model = (q: Quaternion): Quat => [round(-q.x), round(q.y), round(-q.z), round(q.w)];
  const turns = <T extends string>(bones: readonly T[]): Record<T, Quat> =>
    // SAFETY: the entries hold each bone of the list one time.
    Object.fromEntries(bones.map((bone) => [bone, model(turn(bone))])) as Record<T, Quat>;
  return {
    drop: toModelAxes(frame.offset, frame.scale),
    turns: turns(STUDIO_LEG_BONES),
    seatHeight: seatHeightOf(glb, seated, frame),
    chairDepth: frame.chairDepth,
  };
}

/** The head of a mesh in the clip `reference`, for the measures of the head. */
interface ClipHead {
  /** The place of each vertex in the clip, in the units and the axes of the studio. */
  readonly places: readonly Vector3[];
  /** The neck joint in the clip. */
  readonly neck: Vector3;
  /** The head joint in the clip. */
  readonly head: Vector3;
  /** The move of a point of the head from the clip back to the bind pose. */
  readonly back: Matrix4;
}

/**
 * Gives the head of a mesh in the clip `reference`, the form of the source: the place of each
 * vertex with each corrective shape at its full weight except the shapes of a raised arm or of a
 * bent wrist, the neck
 * and the head joints, and the move of the head bone from the clip back to the bind pose.
 *
 * @param glb The file.
 * @param skeleton The bind pose.
 * @param mesh The welded mesh, with the moves of the corrective shapes of `kept`.
 * @param kept The names of the corrective shapes of the mesh, in their order.
 * @returns The head in the clip.
 */
function clipHead(
  glb: Glb,
  skeleton: SourceSkeleton,
  mesh: SourceMesh,
  kept: readonly string[],
): ClipHead {
  const posed = worldMatrices(glb.json, firstKeys(glb, 'reference').nodes);
  const worldOf = (bone: string): Matrix4 => posed[skeleton.nodes.get(bone) ?? -1] ?? new Matrix4();
  const moves = new Map<string, Matrix4>();
  for (const [bone, bind] of skeleton.binds) {
    moves.set(bone, worldOf(bone).clone().multiply(bind.clone().invert()));
  }
  const shares = kept.map((name) => (name.startsWith('arm_raise') ? 0 : 1));
  const places = mesh.vertices.map((vertex) => {
    const p = vertex.position.clone();
    for (const [s, move] of vertex.moves.entries()) {
      p.addScaledVector(move, shares[s] ?? 0);
    }
    const out = new Vector3();
    for (const [bone, w] of vertex.skin) {
      out.addScaledVector(p.clone().applyMatrix4(moves.get(bone) ?? new Matrix4()), w);
    }
    return out;
  });
  return {
    places,
    neck: new Vector3().setFromMatrixPosition(worldOf('neck')),
    head: new Vector3().setFromMatrixPosition(worldOf('head')),
    back: (moves.get('head') ?? new Matrix4()).clone().invert(),
  };
}

/** The output of the export of a studio body. */
interface Export {
  readonly body: StudioBody;
  /** The weights of the corrective shapes in the pose of the sheet, for the report. */
  readonly sheetWeights: readonly number[];
  /**
   * The distance of each pea eye bone from the middle of the old eye, in `H` of the eyes, for the
   * report.
   */
  readonly eyeShifts: Readonly<Record<Side, number>>;
  /** The move of each pea eye out of the head ({@link eyePush}), in `H` of the eyes. */
  readonly eyePushes: Readonly<Record<Side, number>>;
  /**
   * The fill of each old eye ({@link fillEye}): the number of moved vertices and the largest move,
   * in `H` of the eyes, or `null` with no `eyeFill`.
   */
  readonly eyeFills: Readonly<Record<Side, EyeFill>> | null;
}

/**
 * Makes the studio body of an animal from its GLB file (design 4.4): the mesh in the model axes
 * and in meters, the skin with the eye bones, the corrective shapes, and the points that the app
 * reads.
 *
 * @param bytes The GLB file.
 * @param source The GLB file, relative to the repository.
 * @param settings The settings of the animal.
 * @returns The body, and the corrective weights of the pose of the sheet for the report.
 */
export function studioBody(bytes: Uint8Array, source: string, settings: AnimalSettings): Export {
  const glb = readGlb(bytes);
  const skeleton = readSkeleton(glb);
  const raises = raisesOf(glb);
  const sits = sitsIn(glb, settings);
  const kept = keptCorrectives(
    settings,
    raises.map((raise) => raise.target),
    sits,
  );
  const mesh = weldMesh(glb, kept);
  const frame = sceneFrame(glb, skeleton, mesh, settings);
  const scale = frame.scale;
  const model = (p: Vector3): Vec3 => toModelAxes(p.clone().add(frame.offset), scale);
  const direction = (d: Vector3): Vec3 => toModelAxes(d.clone().normalize(), 1);

  // The old eyes of the mesh go away, and the app adds the pea eyes at the eye bones (design
  // 4.5). The faces under the gloss fan of a rig of `pnpm rig-mesh` have the color of the fur
  // around the eye.
  const eyes = eyeVertices(mesh);
  const eyeCenter = (side: Side): Vector3 => {
    const center = new Vector3();
    for (const v of eyes[side]) {
      center.add(mesh.vertices[v]?.position ?? new Vector3());
    }
    return center.divideScalar(Math.max(1, eyes[side].size));
  };
  const inEye = (v: number): boolean => eyes.L.has(v) || eyes.R.has(v);
  const withoutEyes: SourceMesh = {
    vertices: mesh.vertices,
    faces: mesh.faces.filter((face) => !face.corners.every(inEye)),
  };

  const heads = Object.fromEntries(
    STUDIO_BONES.flatMap((bone): [StudioBone, Vec3][] => {
      if (bone === 'eye_L' || bone === 'eye_R') {
        // The pea eyes give the eye bones their places below.
        return [];
      }
      if (!skeleton.binds.has(bone)) {
        // An optional bone, such as the tip of a tail of two bones.
        return [];
      }
      return [[bone, model(headOf(skeleton, bone))]];
    }),
  );

  // The end of each finger block: the farthest claw tip along the `fingers` bone.
  const fingerTip = (side: Side): Vec3 => {
    const head = headOf(skeleton, `fingers_${side}`);
    const along = axisOf(skeleton, `fingers_${side}`, 1);
    let far = 0;
    for (const vertex of mesh.vertices) {
      if (vertex.skin.some(([bone, w]) => bone === `fingers_${side}` && w > 0.5)) {
        far = Math.max(far, vertex.position.clone().sub(head).dot(along));
      }
    }
    return model(head.addScaledVector(along, far));
  };

  // The head: the faces of the fur that follow the head bone most. The ears follow ear bones. The
  // holds are in head heights and start at the head center, so a head that the rig grows keeps
  // the head height and the center of the head before its factor, and the holds keep their places
  // (design 4.4). A head that the rig smooths keeps the center of the head before the smoothing.
  // A rig with a reclined trunk turns the neck and the head by different shares in the seated
  // bind pose, and the vertices of the chin with a part of the neck weight move against the head.
  // The head then takes its measures in the clip `reference`, the form of the source
  // (`clipHead()`), and the head center and the middle of the pea eyes move back onto the head
  // bone of the bind pose, so that the head height and the pea eyes keep their sizes.
  const clip = reclines(glb) ? clipHead(glb, skeleton, mesh, kept) : null;
  const rig = headRig(
    clip?.neck ?? headOf(skeleton, 'neck'),
    clip?.head ?? headOf(skeleton, 'head'),
    headFactorOf(glb),
    neckFactorOf(glb),
  );
  const toBind = (p: Vector3): Vector3 => (clip ? p.applyMatrix4(clip.back) : p);
  let top = -Infinity;
  let chin = Infinity;
  // The box of the head that shows, after the growth, which sizes and turns the pea eyes.
  const shown = new Box3();
  const box = {
    min: new Vector3(Infinity, Infinity, Infinity),
    max: new Vector3(-Infinity, -Infinity, -Infinity),
  };
  // The tip of the nose: the front of the gloss nose, or the front of the muzzle of a body with
  // no gloss nose, such as the hippo with its two nostrils. Only the vertices within NOSE_PLANE
  // of the middle plane count, so that the tip of a whisker does not become the tip of the nose.
  // With no such vertex, the tip comes from all vertices.
  let nose = new Vector3(0, 0, -Infinity);
  let snout = new Vector3(0, 0, -Infinity);
  let farNose = new Vector3(0, 0, -Infinity);
  let farSnout = new Vector3(0, 0, -Infinity);
  const floor = settings.headFloor ?? -Infinity;
  const noseTop = settings.noseTop ?? Infinity;
  const ceiling = settings.headCeiling ?? Infinity;
  for (const [v, vertex] of mesh.vertices.entries()) {
    const head = vertex.skin.find(([bone]) => bone === 'head')?.[1] ?? 0;
    if (vertex.position.y < floor || vertex.position.y > ceiling) {
      continue;
    }
    if (vertex.material === 'fur' && head > 0.5) {
      const share = vertex.skin
        .filter(([bone]) => bone === 'head' || bone === 'ear_L' || bone === 'ear_R')
        .reduce((sum, [, w]) => sum + w, 0);
      const neckShare = vertex.skin.find(([bone]) => bone === 'neck')?.[1] ?? 0;
      const position = clip?.places[v] ?? vertex.position;
      const place = ungrown(position, { head: share, neck: neckShare }, rig);
      top = Math.max(top, place.y);
      chin = Math.min(chin, place.y);
      shown.expandByPoint(position);
      box.min.min(place);
      box.max.max(place);
    }
    const near = Math.abs(model(vertex.position)[0]) <= NOSE_PLANE;
    if (vertex.material === 'gloss' && head === 1 && !inEye(v)) {
      if (near && vertex.position.z > nose.z) {
        nose = vertex.position;
      }
      if (vertex.position.z > farNose.z) {
        farNose = vertex.position;
      }
    }
    if (vertex.material === 'fur' && head === 1 && vertex.position.y <= noseTop) {
      if (near && vertex.position.z > snout.z) {
        snout = vertex.position;
      }
      if (vertex.position.z > farSnout.z) {
        farSnout = vertex.position;
      }
    }
  }
  for (const next of [snout, farNose, farSnout]) {
    if (nose.z === -Infinity) {
      nose = next;
    }
  }
  const center = toBind(box.min.clone().add(box.max).multiplyScalar(0.5))
    .add(headShiftOf(glb))
    .setX(0);

  // Each pea eye bone lies on the head surface under the middle of the old eye, or under that
  // middle moved by `eyeShift`. Each eye faces out from the middle of the head that shows, as an
  // eye on the round head of a parametric body does, or level with `eyeLevel`, and it can turn
  // toward the normal of the head surface (`eyeNormal`). Its oval bends to the head surface
  // (`eyeBend()`), so that the rim lies at the fur. Then it moves out along its direction until
  // its front face shows (`eyePush()`).
  const eyeHeight = (shown.max.y - shown.min.y) * scale;
  const eyeSize = eyeHeight * (settings.eyeSize ?? 1);
  const middle = toBind(shown.getCenter(new Vector3()));
  // An old eye that stands out of the head as a ball in a groove goes first (`eyeFill`), so that
  // the pea eye lies on a smooth face.
  const fill = (side: Side) => {
    const [inner, outer] = settings.eyeFill ?? [0, 0];
    const units = eyeSize / scale;
    const { count, largest } = fillEye(withoutEyes, eyeCenter(side), inner * units, outer * units);
    return { count, largest: largest / units };
  };
  const eyeFills = settings.eyeFill ? { L: fill('L'), R: fill('R') } : null;
  const eyeAt = (side: Side) => {
    const old = eyeCenter(side);
    // The studio puts the left side of the animal at +x, and `shown` is in the units of the
    // studio.
    const [shiftOut, shiftUp] = settings.eyeShift ?? [0, 0];
    const place = old
      .clone()
      .add(
        new Vector3((side === 'L' ? 1 : -1) * shiftOut, shiftUp, 0).multiplyScalar(
          shown.max.y - shown.min.y,
        ),
      );
    const point = eyeOnHead(withoutEyes, place);
    const out = point.clone().sub(middle);
    const at = new Vector3(...model(point));
    const near = withoutEyes.faces.flatMap((face) => {
      const [a, b, c] = face.corners.map((k) => mesh.vertices[k]?.position ?? new Vector3());
      const triangle = new Triangle(
        new Vector3(...model(a ?? new Vector3())),
        new Vector3(...model(b ?? new Vector3())),
        new Vector3(...model(c ?? new Vector3())),
      );
      const reach = triangle.closestPointToPoint(at, new Vector3());
      return reach.distanceTo(at) < 0.3 * eyeHeight ? [triangle] : [];
    });
    const look = direction(settings.eyeLevel === true ? out.setY(0) : out);
    // The eye turns toward the mean normal of the head surface under it by `eyeNormal`.
    const normal = new Vector3();
    for (const triangle of near) {
      if (triangle.closestPointToPoint(at, new Vector3()).distanceTo(at) <= 0.09 * eyeHeight) {
        normal.addScaledVector(triangle.getNormal(new Vector3()), triangle.getArea());
      }
    }
    const toNormal = settings.eyeNormal ?? 0;
    const turned = new Vector3(...look).lerp(normal.normalize(), toNormal).normalize();
    const facing: Vec3 =
      toNormal === 0 ? look : [round(turned.x), round(turned.y), round(turned.z)];
    // A bent eye has its middle on the head surface, so that its rim lies at the fur and the
    // facets of the head between the corners of the oval cover little of its front.
    const eye = { point: model(point), normal: facing };
    const bend = eyeBend(near, model(point), facing, eyeSize);
    const push = eyePush(near, eye, eyeSize, bend);
    const moved = new Vector3(...eye.point).addScaledVector(new Vector3(...facing), push);
    const shift = moved.distanceTo(new Vector3(...model(old))) / eyeHeight;
    const head: Vec3 = [round(moved.x), round(moved.y), round(moved.z)];
    return { head, facing, bend, shift, push: push / eyeHeight };
  };
  const eyeL = eyeAt('L');
  const eyeR = eyeAt('R');
  heads['eye_L'] = eyeL.head;
  heads['eye_R'] = eyeR.head;
  const peaEyes: StudioEyes = {
    headHeight: round(eyeSize),
    directions: { L: eyeL.facing, R: eyeR.facing },
    bends: { L: eyeL.bend, R: eyeR.bend },
  };

  // The studio animal faces +z, so its moves turn as its points do.
  const ordered = orderByFirstUse(withoutEyes);
  const vertices: StudioVertex[] = ordered.vertices.map((v) => ({
    position: model(v.position),
    skin: v.skin.map(([bone, w]) => [boneIndexOf(bone), w] as const),
  }));
  const correctives = kept.map((_, s) =>
    ordered.vertices.map((v) => toModelAxes(v.moves[s] ?? new Vector3(), scale)),
  );
  const sheet = sheetArms(glb, skeleton);

  let body: StudioBody = {
    source,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scale: round(scale),
    // SAFETY: the entries hold each bone of STUDIO_BONES one time, and readSkeleton() checks
    // that the skeleton lacks only optional bones.
    heads: heads as StudioHeads,
    palms: {
      L: direction(axisOf(skeleton, 'hand_L', 2)),
      R: direction(axisOf(skeleton, 'hand_R', 2)),
    },
    fingerTips: { L: fingerTip('L'), R: fingerTip('R') },
    sheetArms: { L: direction(sheet.arms.L), R: direction(sheet.arms.R) },
    headHeight: round((top - chin) * scale),
    headCenter: model(center),
    nose: model(nose),
    eyes: peaEyes,
    floor: toModelAxes(new Vector3(0, 0, frame.offset.z), scale),
    seatHeight: settings.seated ? seatHeightOf(glb, mesh, frame) : null,
    chairDepth: frame.chairDepth,
    standing: settings.seated && settings.soloist ? standingOf(glb, skeleton, frame) : null,
    crease: settings.crease,
    mesh: packStudioMesh(vertices, ordered.faces, correctives),
  };
  if (sits) {
    body = { ...body, sitting: sittingOf(glb, skeleton, mesh, settings, kept) };
  }
  if (raises.length > 0) {
    body = { ...body, raises: raises.map((raise) => raise.pose) };
  }
  if (settings.colorBlend !== undefined) {
    body = { ...body, colorBlend: settings.colorBlend };
  }
  const caps = withoutEyes.faces.flatMap((face, t) => (face.cap === true ? [t] : []));
  if (caps.length > 0) {
    body = { ...body, caps };
  }
  const rim = withoutEyes.faces.flatMap((face, t) => (face.rim === true ? [t] : []));
  if (rim.length > 0) {
    body = { ...body, rim };
  }
  const upperTwist = upperTwistOf(glb);
  if (upperTwist !== null) {
    body = { ...body, upperTwist };
  }
  const hinges = hingesOf(glb);
  if (hinges !== null) {
    body = { ...body, hinges: { L: direction(hinges.L), R: direction(hinges.R) } };
  }
  if (frame.chairWidth !== null) {
    body = { ...body, chairWidth: frame.chairWidth };
  }
  if (frame.bench !== null) {
    body = { ...body, benchDepth: round(frame.bench.ahead + frame.bench.behind) };
  }
  if (settings.palettes) {
    const bases = baseTriangles(ordered.faces, withoutEyes.faces);
    const palettes = Object.entries(settings.palettes).map(
      ([name, map]) => [name, packStudioPalette(bases, paletteMap(map))] as const,
    );
    body = { ...body, palettes: Object.fromEntries(palettes) };
  }
  return {
    body,
    sheetWeights: sheet.weights,
    eyeShifts: { L: eyeL.shift, R: eyeR.shift },
    eyePushes: { L: eyeL.push, R: eyeR.push },
    eyeFills,
  };
}

/**
 * Gives the triangles with the colors before the color shift of the rig (`COLOR_1`, design 4.4),
 * the colors from which the other palettes map, such as the tan palette of the fox. The palette
 * of the shifted triangles and the palette of these triangles must have the same order, because
 * a packed palette gives one color for each color of the mesh, in their order.
 *
 * @param triangles The triangles of the packed mesh.
 * @param faces The source face of each triangle, in the same order.
 * @returns The triangles with the base colors.
 * @throws Error if one color of the mesh has two base colors, or two colors have one base color.
 */
function baseTriangles(
  triangles: readonly StudioTriangle[],
  faces: SourceMesh['faces'],
): StudioTriangle[] {
  const keyOf = (color: Vec3, finish: Finish): string =>
    `${color.map((c) => Math.round(Math.min(1, Math.max(0, c)) * COLOR_STEPS)).join(' ')} ${finish}`;
  const bases = new Map<string, string>();
  const out = triangles.map((triangle, k) => {
    const base = faces[k]?.base ?? triangle.color;
    const key = keyOf(triangle.color, triangle.finish);
    const baseKey = keyOf(base, triangle.finish);
    if ((bases.get(key) ?? baseKey) !== baseKey) {
      throw new Error(`The color ${key} of the mesh has two base colors.`);
    }
    bases.set(key, baseKey);
    return { ...triangle, color: base };
  });
  if (new Set(bases.values()).size !== bases.size) {
    throw new Error('Two colors of the mesh have one base color, so the palettes cannot map them.');
  }
  return out;
}

/** A box in the axes and the units of the studio. */
export interface UnitBox {
  /** The lowest corner. */
  readonly min: Vec3;
  /** The highest corner. */
  readonly max: Vec3;
}

/** One node of the scene of a GLB file, in the order of a walk from the roots down. */
export interface InspectedNode {
  /** The name of the node. */
  readonly name: string;
  /** The number of parents of the node. */
  readonly depth: number;
  /** The skinned mesh of the animal, a prop with a mesh, a joint of the skin, or another node. */
  readonly kind: 'skinned mesh' | 'prop' | 'joint' | 'node';
  /** The number of faces of each material of the mesh of the node, by material name. */
  readonly faces: ReadonlyMap<string, number>;
  /** The number of joints in the tree of a root joint of the skin, or 0 for another node. */
  readonly joints: number;
  /** The names of the nodes in the tree of a root joint that are no joints, such as a prop tip. */
  readonly inside: readonly string[];
}

/** The joints of the skin of a GLB file, by what the export does with them. */
export interface InspectedJoints {
  /** All joints, in the order of the skin. */
  readonly all: readonly string[];
  /** The digits of each paw, which become the one `fingers` bone of their side. */
  readonly digits: Readonly<Record<Side, readonly string[]>>;
  /** The joints that the export drops, such as the baton. */
  readonly dropped: readonly string[];
  /** The body bones of a studio body that the skin does not have. The export stops on them. */
  readonly missing: readonly string[];
  /** The joints that are no bone of a studio body. The export stops on them. */
  readonly unknown: readonly string[];
}

/** One animation clip of a GLB file. */
export interface InspectedClip {
  /** The name of the clip. */
  readonly name: string;
  /** The time of the last key, in seconds. */
  readonly seconds: number;
  /** The number of channels. */
  readonly channels: number;
  /** The height of the hips joint at the first key, in units of the studio. */
  readonly hips: number;
}

/** One prop: a scene node with a mesh and no skin. */
export interface InspectedProp {
  /** The name of the node. */
  readonly name: string;
  /** The box of the mesh of the node. */
  readonly box: UnitBox;
}

/** One morph target of the skinned mesh. */
export interface InspectedTarget {
  /** The name of the target, such as `arm_down_L`. */
  readonly name: string;
  /** True when the export keeps the target as a corrective shape. */
  readonly kept: boolean;
}

/**
 * The facts of a GLB file of the studio that a new studio body needs (design 4.4). The values
 * are in the axes and the units of the studio. The animal faces +z with its left side at +x.
 */
export interface StudioInspection {
  /** The meters for each unit of the studio. */
  readonly scale: number;
  /** The source of the scale: the settings of `ANIMALS`, or the assumed settings. */
  readonly scaleFrom: string;
  /** The nodes of the scene, from the roots down. */
  readonly nodes: readonly InspectedNode[];
  /** The joints of the skin. */
  readonly joints: InspectedJoints;
  /** The morph targets of the skinned mesh, and if the export keeps each one. */
  readonly targets: readonly InspectedTarget[];
  /** The animation clips. */
  readonly clips: readonly InspectedClip[];
  /**
   * The length of each arm along its joints in the bind pose: from the shoulder joint over the
   * elbow and the wrist to the middle of the palm, the midpoint of the hand joint and the finger
   * joint, as the palm of a studio body in the app. The finger joint of a paw with digits is the
   * middle of the heads of its digits. The rule of a violin shop measures this extended arm. It
   * is `null` when the skin lacks a joint of the arm.
   */
  readonly arms: Readonly<Record<Side, number | null>>;
  /** The height of the hips joint in the bind pose. */
  readonly bindHips: number;
  /**
   * True for a seated role: the setting of `ANIMALS`, or a bench (a prop `bench`, or a seat of the
   * rig on the bench) for an animal that is not in `ANIMALS`.
   */
  readonly seated: boolean;
  /**
   * The lowest point of the skin in the bind pose. A seated body drops by its height in the app,
   * so that the soles are on the floor.
   */
  readonly lowest: Vec3;
  /** The props: the scene nodes with a mesh and no skin. */
  readonly props: readonly InspectedProp[];
  /** The seat of a rig of `pnpm rig-mesh` in the extras of the asset, or `null` with none. */
  readonly seat: SeatExtras | null;
  /** The height of the top of the prop `bench`, or `null` with no bench. */
  readonly benchTop: number | null;
}

/**
 * Gives a box as two points.
 *
 * @param box The box.
 * @returns The box.
 */
function unitBox(box: Box3): UnitBox {
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/**
 * Gives the box of the meshes of some scene nodes of a GLB file.
 *
 * @param glb The file.
 * @param worlds The world matrix of each node.
 * @param nodes The nodes.
 * @returns The box, in the axes and the units of the studio.
 */
function meshBox(glb: Glb, worlds: readonly Matrix4[], nodes: readonly number[]): Box3 {
  const box = new Box3();
  for (const i of nodes) {
    const node = glb.json.nodes[i];
    const mesh = node?.mesh === undefined ? undefined : glb.json.meshes[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const positions = readAccessor(glb, primitive.attributes['POSITION'] ?? -1);
      for (let v = 0; v < positions.length; v += 3) {
        box.expandByPoint(
          new Vector3().fromArray(positions, v).applyMatrix4(worlds[i] ?? new Matrix4()),
        );
      }
    }
  }
  return box;
}

/**
 * Reads the facts of a GLB file of the studio that a new studio body needs (design 4.4). These
 * are the nodes, the joints, the morph targets, and the clips. They also hold the heights of the
 * hips, the length of each arm to the middle of the palm, the lowest point of the skin, the boxes
 * of the props, and the seat of a rig. The function reads the file as it is. It does not stop on a
 * part that the export refuses: it lists that part.
 *
 * @param bytes The GLB file.
 * @param settings The settings of the animal, or `null` for an animal that is not in `ANIMALS`.
 *   Then the scale puts the shoulder joints 1.0 m above the floor.
 * @returns The facts, in the axes and the units of the studio.
 * @throws Error if the file has no skin.
 */
export function inspectStudioGlb(
  bytes: Uint8Array,
  settings: AnimalSettings | null,
): StudioInspection {
  const glb = readGlb(bytes);
  const gltf = glb.json;
  const skin = gltf.skins[0];
  if (!skin) {
    throw new Error('The file has no skin.');
  }
  const worlds = worldMatrices(gltf, new Map());
  const nodeOf = (name: string): number => gltf.nodes.findIndex((n) => n.name === name);
  const heightOf = (node: number, matrices: readonly Matrix4[]): number =>
    new Vector3().setFromMatrixPosition(matrices[node] ?? new Matrix4()).y;

  // The props: each node with a mesh and no skin.
  const props = [...gltf.nodes.keys()]
    .filter((i) => gltf.nodes[i]?.mesh !== undefined && gltf.nodes[i]?.skin === undefined)
    .map((i) => ({ name: gltf.nodes[i]?.name ?? '', box: meshBox(glb, worlds, [i]) }));
  const bench = props.find((prop) => prop.name === 'bench');
  const seat = gltf.asset?.extras?.seat ?? null;

  // The scale of the settings, as the export finds it.
  const used = settings ?? {
    landmark: 'shoulders',
    height: 1,
    seated: false,
    soloist: false,
    constant: '',
    crease: 0,
  };
  // The export takes the shoulders of the standing body, as the clip `reference` gives them for a
  // rig with a reclined trunk (`standingShoulder()`).
  const landmark = standingShoulder(glb, readSkeleton(glb));
  const scaleFrom = settings
    ? `ANIMALS: the ${used.landmark} at ${used.height} m`
    : 'assumed: the shoulders at 1 m, because the animal is not in ANIMALS';

  // The joints, by what the export does with them.
  const all = skin.joints.map((j) => gltf.nodes[j]?.name ?? '');
  const body = STUDIO_BONES.filter((b) => !b.startsWith('eye_'));
  const digits = {
    L: all.filter((name) => DIGIT.exec(name)?.[1] === 'L'),
    R: all.filter((name) => DIGIT.exec(name)?.[1] === 'R'),
  };
  const joints: InspectedJoints = {
    all,
    digits,
    dropped: all.filter((name) => DROPPED_BONES.has(name)),
    // The digits of a paw give the `fingers` bone of its side.
    missing: body.filter(
      (bone) => !isOptionalBone(bone) && !all.some((name) => ownBone(name) === bone),
    ),
    unknown: all.filter(
      (name) => !DROPPED_BONES.has(name) && !DIGIT.test(name) && !body.some((b) => b === name),
    ),
  };

  // The arms along their joints, with the finger joint that the export makes for a paw.
  const headAt = (name: string): Vector3 | null => {
    const node = nodeOf(name);
    return node < 0 ? null : new Vector3().setFromMatrixPosition(worlds[node] ?? new Matrix4());
  };
  const armOf = (side: Side): number | null => {
    const fingerHeads =
      nodeOf(`fingers_${side}`) >= 0 ? [headAt(`fingers_${side}`)] : digits[side].map(headAt);
    const shoulder = headAt(`upper_arm_${side}`);
    const elbow = headAt(`forearm_${side}`);
    const wrist = headAt(`hand_${side}`);
    if (!shoulder || !elbow || !wrist || fingerHeads.length === 0) {
      return null;
    }

    const fingers = new Vector3();
    for (const head of fingerHeads) {
      if (!head) {
        return null;
      }
      fingers.add(head);
    }
    fingers.divideScalar(fingerHeads.length);

    const palm = wrist.clone().add(fingers).multiplyScalar(0.5);
    return shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) + wrist.distanceTo(palm);
  };
  const arms = { L: armOf('L'), R: armOf('R') };

  // The nodes, from the roots down. The tree of a root joint is one node.
  const jointSet = new Set(skin.joints);
  const children = new Set(gltf.nodes.flatMap((n) => n.children ?? []));
  const nodes: InspectedNode[] = [];
  const subtree = (i: number): number[] => [
    i,
    ...(gltf.nodes[i]?.children ?? []).flatMap((c) => subtree(c)),
  ];
  const walk = (i: number, depth: number): void => {
    const node = gltf.nodes[i] ?? {};
    const faces = new Map<string, number>();
    const mesh = node.mesh === undefined ? undefined : gltf.meshes[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const material = gltf.materials?.[primitive.material ?? -1]?.name ?? '';
      const count = (gltf.accessors[primitive.indices]?.count ?? 0) / 3;
      faces.set(material, (faces.get(material) ?? 0) + count);
    }
    const kind =
      node.skin !== undefined ? 'skinned mesh' : mesh ? 'prop' : jointSet.has(i) ? 'joint' : 'node';
    if (kind === 'joint') {
      const tree = subtree(i);
      const inside = tree.filter((t) => !jointSet.has(t)).map((t) => gltf.nodes[t]?.name ?? '');
      const count = tree.length - inside.length;
      nodes.push({ name: node.name ?? '', depth, kind, faces, joints: count, inside });
      return;
    }
    nodes.push({ name: node.name ?? '', depth, kind, faces, joints: 0, inside: [] });
    for (const child of node.children ?? []) {
      walk(child, depth + 1);
    }
  };
  for (const i of gltf.nodes.keys()) {
    if (!children.has(i)) {
      walk(i, 0);
    }
  }

  // The skinned mesh: its morph targets and the lowest point of the faces that the export keeps.
  const skinned = gltf.nodes.find((n) => n.skin !== undefined && n.mesh !== undefined);
  const animal = skinned?.mesh === undefined ? undefined : gltf.meshes[skinned.mesh];
  const targets = (animal?.extras?.targetNames ?? []).map((name) => ({
    name,
    kept: keptCorrectives(
      used,
      raisesOf(glb).map((raise) => raise.target),
      sitsIn(glb, used),
    ).includes(name),
  }));
  const lowest = new Vector3(0, Infinity, 0);
  for (const primitive of animal?.primitives ?? []) {
    if (!FINISHES.has(gltf.materials?.[primitive.material ?? -1]?.name ?? '')) {
      continue;
    }
    const positions = readAccessor(glb, primitive.attributes['POSITION'] ?? -1);
    for (let v = 0; v < positions.length; v += 3) {
      if ((positions[v + 1] ?? 0) < lowest.y) {
        lowest.fromArray(positions, v);
      }
    }
  }

  // The clips: the time of the last key, and the hips at the first key.
  const hips = nodeOf('hips');
  const clips = (gltf.animations ?? []).map((animation): InspectedClip => {
    let seconds = 0;
    for (const sampler of animation.samplers) {
      const times = readAccessor(glb, sampler.input);
      seconds = Math.max(seconds, times.at(-1) ?? 0);
    }
    const posed = worldMatrices(gltf, firstKeys(glb, animation.name ?? '').nodes);
    return {
      name: animation.name ?? '',
      seconds,
      channels: animation.channels.length,
      hips: heightOf(hips, posed),
    };
  });

  return {
    scale: used.height / landmark,
    scaleFrom,
    nodes,
    joints,
    targets,
    clips,
    arms,
    bindHips: heightOf(hips, worlds),
    seated: settings ? settings.seated : bench !== undefined || seat?.prop === 'bench',
    lowest: lowest.toArray(),
    props: props.map((prop) => ({ name: prop.name, box: unitBox(prop.box) })),
    seat,
    benchTop: bench ? bench.box.max.y : null,
  };
}

/**
 * Writes the facts of a GLB file as the lines of the report of `--inspect`. Each length is in the
 * units of the studio, and in meters at the scale of the facts.
 *
 * @param facts The facts.
 * @returns The lines.
 */
export function inspectionLines(facts: StudioInspection): string[] {
  const units = (value: number): string =>
    `${value.toFixed(3)} u (${(value * facts.scale).toFixed(3)} m)`;
  const list = (names: readonly string[]): string => (names.length > 0 ? names.join(' ') : 'none');
  const point = (p: Vec3): string => `[${p.map((v) => v.toFixed(3)).join(', ')}] u`;
  const arm = (value: number | null): string =>
    value === null ? 'none (the skin lacks a joint of the arm)' : units(value);
  const lines = [
    `Scale: ${facts.scale.toFixed(4)} m for each unit (${facts.scaleFrom}).`,
    'The studio animal faces +z, with its left side at +x.',
    '',
    `Scene nodes (the export keeps the faces of the skinned mesh in ${[...FINISHES.keys()].join(' and ')}):`,
  ];
  for (const node of facts.nodes) {
    const faces = [...node.faces].map(([material, n]) => `${material} ${n}`).join(', ');
    const what =
      node.kind === 'joint'
        ? `root joint of the skin, ${node.joints} joints, other nodes in its tree: ${list(node.inside)}`
        : node.kind === 'node'
          ? 'node'
          : `${node.kind}, faces: ${faces}`;
    lines.push(`  ${'  '.repeat(node.depth)}${node.name}: ${what}`);
  }

  const { joints } = facts;
  lines.push(
    '',
    `Joints of the skin (${joints.all.length}): ${joints.all.join(' ')}`,
    `  Digits of the left paw: ${list(joints.digits.L)}`,
    `  Digits of the right paw: ${list(joints.digits.R)}`,
    `  Dropped by the export: ${list(joints.dropped)}`,
    `  Missing body bones (the export stops): ${list(joints.missing)}`,
    `  Unknown joints (the export stops): ${list(joints.unknown)}`,
    '',
    `Morph targets: ${facts.targets.map((t) => `${t.name} (${t.kept ? 'kept' : 'dropped'})`).join(', ') || 'none'}`,
    '',
    'Clips (the time of the last key, the channels, the hips at the first key):',
    ...facts.clips.map(
      (clip) =>
        `  ${clip.name}: ${clip.seconds.toFixed(3)} s, ${clip.channels} channels, hips ${units(clip.hips)}`,
    ),
    '',
    `Arm from the shoulder joint to the middle of the palm, along the joints: ${(['L', 'R'] as const).map((side) => `${side} ${arm(facts.arms[side])}`).join(', ')}`,
    `Hips in the bind pose: ${units(facts.bindHips)}`,
    `Lowest point of the skin: ${point(facts.lowest)}, height ${units(facts.lowest[1])}`,
    facts.seated
      ? '  Seated: the body drops by this height in the app, so that its soles are on the floor.'
      : '  Standing: no drop.',
    '',
    'Props (the box in units: min, max):',
    ...facts.props.map((prop) => `  ${prop.name}: ${point(prop.box.min)}, ${point(prop.box.max)}`),
  );
  if (facts.props.length === 0) {
    lines.push('  none');
  }
  if (facts.seat) {
    const { prop, top, front, back, halfWidth } = facts.seat;
    lines.push(
      `Seat of the rig (${prop}): top ${units(top)}, front edge z ${units(front)}, back edge z ${units(back)}, half width ${units(halfWidth)}`,
    );
  }
  if (facts.benchTop !== null) {
    lines.push(`Bench top: ${units(facts.benchTop)}`);
  }
  return lines;
}

/**
 * Writes the TypeScript module of a studio body.
 *
 * @param animal The id of the animal.
 * @param constant The name of the constant.
 * @param body The body.
 * @returns The source text.
 */
export function studioModule(animal: string, constant: string, body: StudioBody): string {
  // Each point goes on one line.
  const fields = JSON.stringify(body, null, 2).replaceAll(
    /\[\s*(-?[\d.e-]+),\s*(-?[\d.e-]+),\s*(-?[\d.e-]+)\s*\]/g,
    '[$1, $2, $3]',
  );
  return [
    '// SPDX-License-Identifier: CC-BY-NC-4.0',
    '',
    `import type { StudioBody } from '../studio-format.ts';`,
    '',
    '/**',
    ` * The studio body of the animal \`${animal}\` (design 4.4), from \`${body.source}\`. The`,
    ` * command \`pnpm studio-body ${animal}\` writes this file. Do not change it by hand.`,
    ' */',
    `export const ${constant} = ${fields} satisfies StudioBody;`,
    '',
  ].join('\n');
}

/**
 * Writes the module of a studio body, in the form of the formatter of the repository (design 9.5).
 *
 * @param out The path of the module.
 * @param animal The id of the animal.
 * @param constant The name of the constant.
 * @param body The body.
 * @throws Error if the formatter fails.
 */
export async function writeStudioModule(
  out: string,
  animal: string,
  constant: string,
  body: StudioBody,
): Promise<void> {
  await writeFile(out, studioModule(animal, constant, body));
  const format = spawnSync(join(ROOT, 'node_modules', '.bin', 'oxfmt'), [out], {
    stdio: 'inherit',
  });
  if (format.status !== 0) {
    throw new Error(`oxfmt failed with the status ${String(format.status)}.`);
  }
}

/**
 * Gives the GLB file of an animal: the file of its settings.
 *
 * @param animal The id of the animal.
 * @param settings The settings of the animal, or none for an animal that is not in `ANIMALS`.
 * @returns The absolute path of the file.
 * @throws Error if the settings name no GLB file.
 */
export function studioGlbPath(animal: string, settings?: AnimalSettings): string {
  if (!settings?.glb) {
    throw new Error(
      `The animal ${animal} has no GLB file in ANIMALS of tools/studio-body.ts. Give one with --inspect --glb <file>.`,
    );
  }
  return join(ROOT, settings.glb);
}

/**
 * Reads the GLB file of an animal.
 *
 * @param file The absolute path of the file ({@link studioGlbPath}).
 * @param animal The id of the animal.
 * @returns The file.
 * @throws Error if the file does not exist.
 */
async function readStudioGlb(file: string, animal: string): Promise<Buffer> {
  if (!existsSync(file)) {
    throw new Error(
      `The GLB file ${relative(ROOT, file)} does not exist. Build it with: pnpm rig-mesh ${animal}`,
    );
  }
  return readFile(file);
}

/**
 * Writes the module of a studio body from its GLB file: `node tools/studio-body.ts <animal>`
 * (design 4.4). The GLB file is `glb` of the settings of the animal. With `--inspect`, it writes
 * no file, and it prints the facts of the GLB file that a new studio body needs.
 * `--inspect --glb <file>` inspects another file with the settings of the animal. An animal that
 * is not in `ANIMALS` needs `--glb`, and gets an assumed scale.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inspect = args.includes('--inspect');
  const glbAt = args.indexOf('--glb');
  const glb = glbAt >= 0 ? args[glbAt + 1] : undefined;
  const animal =
    args.find((arg, i) => !arg.startsWith('--') && (glbAt < 0 || i !== glbAt + 1)) ?? '';
  const settings = ANIMALS.get(animal);
  if (glbAt >= 0 && (!inspect || glb === undefined || glb.startsWith('--'))) {
    throw new Error(
      'The option --glb <file> works only with --inspect. The probes take it too: pnpm hold-reach and pnpm fold-probe.',
    );
  }
  if (inspect && animal) {
    const file = glb === undefined ? studioGlbPath(animal, settings) : resolve(glb);
    const bytes = await readStudioGlb(file, animal);
    console.log(relative(ROOT, file));
    console.log(inspectionLines(inspectStudioGlb(bytes, settings ?? null)).join('\n'));
    return;
  }
  if (!settings) {
    throw new Error(
      `Usage: node tools/studio-body.ts <animal> [--inspect [--glb <file>]], with an animal of: ${[...ANIMALS.keys()].join(', ')}. --inspect --glb <file> also takes another animal.`,
    );
  }

  const file = studioGlbPath(animal, settings);
  const source = relative(ROOT, file);
  const { body, sheetWeights, eyeShifts, eyePushes, eyeFills } = studioBody(
    await readStudioGlb(file, animal),
    source,
    settings,
  );
  await mkdir(STUDIO_DIR, { recursive: true });
  const out = join(STUDIO_DIR, `${animal}.ts`);
  await writeStudioModule(out, animal, settings.constant, body);
  console.log(`Wrote ${relative(ROOT, out)} from ${source} (sha256 ${body.sha256.slice(0, 12)}).`);
  console.log(`Scale ${body.scale} m for each unit, head height ${body.headHeight} m.`);
  console.log(`Corrective weights of the sheet pose: ${sheetWeights.join(', ')}.`);
  console.log(
    `Pea eyes: head height ${body.eyes.headHeight} m. Each eye moves ${eyePushes.L.toFixed(3)} H (left) and ${eyePushes.R.toFixed(3)} H (right) out of the head, and its bone lies ${eyeShifts.L.toFixed(3)} H (left) and ${eyeShifts.R.toFixed(3)} H (right) from the middle of the old eye.`,
  );
  if (eyeFills) {
    console.log(
      `Eye fill: ${eyeFills.L.count} vertices (left) and ${eyeFills.R.count} vertices (right) move onto the head surface, at most ${eyeFills.L.largest.toFixed(3)} H (left) and ${eyeFills.R.largest.toFixed(3)} H (right).`,
    );
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
