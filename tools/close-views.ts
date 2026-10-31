import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { build as viteBuild, preview } from 'vite';
import type { Plugin } from 'vite';

import { DEFAULT_DEMO, DEMOS, DEMO_IDS } from '../src/app/demos.ts';
import type { DemoId } from '../src/app/demos.ts';
import { BAR_HIDE_SEC } from '../src/app/bar-rules.ts';
import { FIRST_PLAY, SAMPLES_READY } from '../src/app/dev-hook.ts';
import {
  GALLERY_FOV_DEG,
  GALLERY_PROBES,
  bodyBoundsOf,
  speciesItems,
} from '../src/gallery/items.ts';
import type { GalleryMove, GalleryProbe } from '../src/gallery/items.ts';
import type { Bounds } from '../src/models/bounds.ts';
import type { PlayerPlace, SceneLayout } from '../src/models/layout.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { SPECIES, SPECIES_IDS, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { buildScore } from '../src/score/score.ts';
import { INSTRUMENT_IDS } from '../src/models/instruments/catalog.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import type { Score } from '../src/score/types.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import type { CameraPose, Shot } from '../src/shots/types.ts';
import { FIELD_OF_VIEW } from '../src/shots/view.ts';
import { LOWER_MAX_SEC, REST_TIMES } from '../src/pose/rest.ts';
import { chromiumArgs } from './chromium-args.ts';
import { startCinematic } from './cinematic-mode.ts';
import { glbModule, speciesAnimal } from './glb-swap.ts';
import { setHolds } from './hold-sets.ts';
import { patchedDemo } from './patch-demos.ts';
import { midiPath } from './probe-demos.ts';
import {
  PROBE_NO_CACHE,
  ROOT,
  optionValue,
  probeCacheDir,
  shortHash,
  withRefBuild,
} from './ref-tree.ts';
import { MAX_WEBP_BYTES, openDrawer, openShot, startSite, toWebp } from './screenshots.ts';
import type { Site } from './screenshots.ts';

/** One view of a close view: the turn of the gallery camera around the animal. */
interface CloseViewAngle {
  /** The name of the view in the file names and the labels, such as `front` or `keys`. */
  readonly name: string;
  /**
   * The turn of the camera to the right side of the animal, in degrees. Around a body, 0 is the
   * front of the animal. Around a line, 0 is the +z side of the gallery.
   */
  readonly azimuth: number;
  /** The angle of the camera above the floor, in degrees, in place of the angle of the role. */
  readonly elevation?: number;
}

/**
 * One moment of a close view: a time of the gallery time slider in the test notes of the role,
 * the rest pose of design 5.2, or a point of the lift or of the lowering between them.
 */
interface CloseMoment {
  /** The name of the moment in the file names and the labels. */
  readonly name: string;
  /** The time of the slider, in seconds. The rest pose ignores it. */
  readonly time: number;
  /** True for the rest pose: the arms hang, or the paws rest on the knees. */
  readonly rest: boolean;
  /** True for a player who stands as a soloist (the gallery query `stand`, design 4.5). */
  readonly stand?: boolean;
  /**
   * A point of the lift or of the lowering of the instruments at the time of the slider (the
   * gallery query `lift` or `lower`, design 7.1), or none for the playing pose or the rest pose.
   */
  readonly move?: GalleryMove;
}

/**
 * Gives the moments of the lift and of the lowering of a role (design 5.2), halfway through each
 * move: `lift50` and `lower50`. The slider stays at the time of the first moment of the role, so
 * that the lift goes from the rest pose to that moment, and the lowering goes back.
 *
 * @param time The time of the first moment of the role, in seconds.
 * @returns The two moments.
 */
function halfMoves(time: number): CloseMoment[] {
  return [
    { name: 'lift50', time, rest: false, move: { kind: 'lift', share: 0.5 } },
    { name: 'lower50', time, rest: false, move: { kind: 'lower', share: 0.5 } },
  ];
}

/**
 * The camera of a close view around the body of the animal (the query `body`). The box of the
 * body gives the vertical line, the target, and the distance at the zoom 1. A new role needs no
 * other value.
 */
interface BodyCamera {
  /** The kind of the camera. */
  readonly kind: 'body';
  /** The zoom of the camera, 1 or more: 1 shows the whole body. */
  readonly zoom: number;
  /** The angle of the camera above the floor, in degrees. */
  readonly elevation: number;
  /**
   * True to look at the middle of the head (the gallery query `head`). The box of the body still
   * gives the distance at the zoom 1.
   */
  readonly head?: true;
}

/** The camera of a close view around a fixed vertical line of the gallery (`closeView()`). */
interface LineCamera {
  /** The kind of the camera. */
  readonly kind: 'line';
  /** The zoom of the camera, 1 or more. */
  readonly zoom: number;
  /** The height of the point that the camera looks at, in meters. */
  readonly target: number;
  /** The angle of the camera above the floor, in degrees. */
  readonly elevation: number;
  /** The x of the vertical line around which the camera turns, in meters. */
  readonly x: number;
  /** The z of the vertical line around which the camera turns, in meters. */
  readonly z: number;
}

/** The point at which a line camera looks (`--aim`), in meters. */
interface LineAim {
  /** The x of the vertical line around which the camera turns. */
  readonly x: number;
  /** The z of the vertical line around which the camera turns. */
  readonly z: number;
  /** The height of the point that the camera looks at. */
  readonly target: number;
}

/** The close view of one role of the gallery. */
interface RoleViews {
  /** The species of the role, which the query `only` selects. */
  readonly species: SpeciesId;
  /**
   * The instrument of the role, which the query `only` selects in place of the species, for a
   * species that plays several instruments, as the badger of the percussion. The gallery then
   * shows one animal.
   */
  readonly instrument?: InstrumentId;
  /** The views, one column of the grid each. */
  readonly views: readonly CloseViewAngle[];
  /** The moments, one row of the grid each. */
  readonly moments: readonly CloseMoment[];
  /** The camera of the close views. */
  readonly camera: BodyCamera | LineCamera;
  /** The test notes of the gallery for the moments, or none for the default test notes. */
  readonly notes: string | null;
}

/**
 * A role with a close view: the bear conductor, the polar bear pianist, the deer harpist, the
 * rabbit violinist, the red fox violinist, the cat violist, the dog cellist, the hippo bassist,
 * the tan fox flutist, the panda trombonist, the mouse oboist, the elephant timpanist, the beaver
 * bassoonist, the pig hornist, the wolf clarinetist, the monkey trumpeter, the rhino tubist, the
 * penguin singer, or the badger bass drummer, snare drummer, cymbalist, percussionist, or
 * xylophonist.
 */
type CloseRole =
  | 'conductor'
  | 'pianist'
  | 'harpist'
  | 'violinist'
  | 'fox-violinist'
  | 'violist'
  | 'cellist'
  | 'bassist'
  | 'flutist'
  | 'trombonist'
  | 'oboist'
  | 'timpanist'
  | 'bassoonist'
  | 'hornist'
  | 'clarinetist'
  | 'trumpeter'
  | 'tubist'
  | 'singer'
  | 'bass-drummer'
  | 'snare-drummer'
  | 'cymbalist'
  | 'percussionist'
  | 'xylophonist';

/** The roles with a close view, in the order of the usage text. */
const CLOSE_ROLES: readonly CloseRole[] = [
  'conductor',
  'pianist',
  'harpist',
  'violinist',
  'fox-violinist',
  'violist',
  'cellist',
  'bassist',
  'flutist',
  'trombonist',
  'oboist',
  'timpanist',
  'bassoonist',
  'hornist',
  'clarinetist',
  'trumpeter',
  'tubist',
  'singer',
  'bass-drummer',
  'snare-drummer',
  'cymbalist',
  'percussionist',
  'xylophonist',
];

/**
 * The close views of the roles (design 7.1):
 *
 * - The conductor: the front, the right side, and the back, which the default view of the stage
 *   shows (design 2.5), at the four beats of the first bar of the default test notes (4/4 at 120
 *   BPM), between two beats, and in the rest pose. The conductor keeps its fixed line.
 * - The pianist: the front, both sides, the back, and the left paw on the keys. The moments are
 *   a chord of three keys in each hand, a time between two chords, the lowest keys, the highest
 *   keys, and the rest pose. The camera turns around the body. It looks down 35°, over the case
 *   of the piano in the front view. The view of the keys is low from the left, 15° to the front.
 * - The deer harpist on its stool: the front, both sides, the back, and the left hand at the
 *   strings from the front left. The moments are a chord of two strings in each hand just before
 *   the pluck, the time after the pluck, the rest pose, and halfway through the lift and the
 *   lowering at the chord. The side views, the back view, and a low view from the back right also
 *   show the haunch on the seat of the stool and the puff tail.
 * - The violinist: the front, both sides, and the back. The moments are the frog and the tip of a
 *   whole bow on the A string, a string crossing from the G string to the E string, the rest
 *   pose, halfway through the lift and the lowering at the frog ({@link halfMoves}), and the
 *   standing soloist at the frog.
 * - The red fox violinist of the second violins: the views and the moments of the violinist. The
 *   side views and the back view also show the tail, which goes back over the seat and through
 *   the open back of the chair.
 * - The cat violist of the violas: the views and the moments of the violinist, with a whole
 *   down-bow on the A string and a string crossing from the C string to the A string.
 * - The dog cellist of the cellos: the front, both sides, and the back. The moments are the frog
 *   and the tip of a whole down-bow on the A string, a string crossing from the C string to the A
 *   string, the rest pose, and halfway through the lift and the lowering at the frog. A cellist
 *   does not stand.
 * - The hippo bassist of the contrabasses, who stands: the views and the moments of the cellist,
 *   with a whole down-bow on the G string and a string crossing from the E string to the G
 *   string.
 * - The tan fox flutist: the front, both sides, and the back. The moments are a long note, a time
 *   between two phrases, the rest pose, halfway through the lift and the lowering at the note,
 *   and the standing soloist at the note.
 * - The panda trombonist: the front, both sides, and the back. The moments are a note in the
 *   first position, a note in the seventh position at the end of the reach of the slide, the rest
 *   pose, halfway through the lift and the lowering at the first note, and the standing soloist.
 * - The mouse oboist: the views and the moments of the flutist. The side views and the back view
 *   also show the long tail, which goes back from the haunch and lies on the floor behind the
 *   mouse, which has no chair.
 * - The elephant timpanist, who stands: the front, both sides, and the back. The moments are a
 *   strike of the left mallet on the front kettle at the left of the trunk, a strike of the right
 *   mallet on the front kettle at its right, a time between two strikes, the top of the lift
 *   of the right mallet before its strike, the rest pose, and halfway through the lift and the
 *   lowering at the first strike. The camera looks down 30°, as a seat of the hall looks at the
 *   back row.
 * - The beaver bassoonist: the views and the moments of the flutist. The side views and the back
 *   view also show the broad tail, which goes back from the haunch and lies on the floor behind
 *   the beaver, which has no chair.
 * - The pig hornist: the views and the moments of the flutist. The left paw presses the valves
 *   in the phrase, and the right paw stays in the bell.
 * - The wolf clarinetist: the views and the moments of the flutist. The side views and the back
 *   view also show the bushy tail, which goes back over the seat and hangs down behind it.
 * - The monkey trumpeter: the views and the moments of the flutist. The right paw presses the
 *   valves in the phrase. The side views and the back view also show the long tail, which goes
 *   back and down to its curl on the floor behind the monkey, which has no chair.
 * - The rhino tubist, who stands: the views and the moments of the flutist, with no standing
 *   soloist, because each tubist stands. The right paw presses the valves in the phrase. The side
 *   views and the back view also show the thin tail, which hangs down behind the haunch.
 * - The penguin singer of the choir, who stands on its riser: the front, both sides, and the back.
 *   The moments are an open beak in a note, a closed beak between two notes, and the rest pose,
 *   with the default test notes. The flippers hold the folder in each moment.
 * - The badger of the percussion, who stands: one role for each instrument, with the front, both
 *   sides, and the back. The moments are a strike of each hand or a crash, a time between two
 *   strikes, the rest pose, and halfway through the lift and the lowering at the first strike.
 *   The bass drummer strikes with the beater in the right paw, the snare drummer and the
 *   xylophonist alternate their paws, the percussionist strikes the triangle in its left paw and
 *   then the tambourine, and the xylophonist strikes the lowest and the highest bars.
 *
 * A new role gives its species, its views, its moments, and its test notes, with the camera
 * `{ kind: 'body', zoom: 1, elevation }`.
 */
export const ROLE_VIEWS: Readonly<Record<CloseRole, RoleViews>> = {
  conductor: {
    species: 'bear',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'side', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'beat-1', time: 0, rest: false },
      { name: 'between', time: 0.25, rest: false },
      { name: 'beat-2', time: 0.5, rest: false },
      { name: 'beat-3', time: 1, rest: false },
      { name: 'beat-4', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
    ],
    camera: { kind: 'line', zoom: 1.4, target: 0.9, elevation: 8, x: 0, z: 0 },
    notes: null,
  },
  pianist: {
    species: 'polar-bear',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
      // The lid of the piano hides the paws in the front view. From above, the muzzle hides them.
      // This low view from the left, 15° to the front, shows the left paw on the keys.
      { name: 'keys', azimuth: -75, elevation: 25 },
    ],
    moments: [
      { name: 'chord', time: 0.6, rest: false },
      { name: 'between', time: 1.45, rest: false },
      { name: 'far-left', time: 2.6, rest: false },
      { name: 'far-right', time: 3.6, rest: false },
      { name: 'rest', time: 0, rest: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 35 },
    // A wide chord splits into C3 E3 G3 for the left paw and C5 E5 G5 for the right paw, then
    // A2 C3 E3 and A4 C5 E5 (design 5.3). Then the left paw plays the lowest keys, A0 C1 E1, and
    // the right paw the highest keys, E7 G7 C8, while the left paw plays C3 E3.
    notes: [
      '0.5 0.8 C3',
      '0.5 0.8 E3',
      '0.5 0.8 G3',
      '0.5 0.8 C5',
      '0.5 0.8 E5',
      '0.5 0.8 G5',
      '1.5 0.8 A2',
      '1.5 0.8 C3',
      '1.5 0.8 E3',
      '1.5 0.8 A4',
      '1.5 0.8 C5',
      '1.5 0.8 E5',
      '2.5 0.8 A0',
      '2.5 0.8 C1',
      '2.5 0.8 E1',
      '3.5 0.8 C3',
      '3.5 0.8 E3',
      '3.5 0.8 E7',
      '3.5 0.8 G7',
      '3.5 0.8 C8',
    ].join('\n'),
  },
  harpist: {
    species: 'deer',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
      // The column and the strings hide the left hand in the front view. This view from the front
      // left shows it at the strings.
      { name: 'strings', azimuth: -45 },
      // This low view from the back right shows the haunch and the puff tail on the seat.
      { name: 'seat', azimuth: 135, elevation: 10 },
    ],
    moments: [
      { name: 'chord', time: 0.49, rest: false },
      { name: 'pluck', time: 0.6, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.49),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A chord of C3 and G3 in the left hand and C5 and E5 in the right hand, then A2 and E3 with A4
    // and C5 (design 5.3).
    notes: [
      '0.5 0.8 C3',
      '0.5 0.8 G3',
      '0.5 0.8 C5',
      '0.5 0.8 E5',
      '1.5 0.8 A2',
      '1.5 0.8 E3',
      '1.5 0.8 A4',
      '1.5 0.8 C5',
    ].join('\n'),
  },
  violinist: {
    species: 'rabbit',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'frog', time: 0.55, rest: false },
      { name: 'tip', time: 2.4, rest: false },
      { name: 'crossing', time: 3.25, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.55),
      { name: 'stand', time: 0.55, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A whole down-bow on A4, then a string crossing from G3 to E5.
    notes: ['0.5 2 A4', '3 0.25 G3', '3.25 0.25 E5', '3.5 0.25 G3'].join('\n'),
  },
  'fox-violinist': {
    species: 'fox-red',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'frog', time: 0.55, rest: false },
      { name: 'tip', time: 2.4, rest: false },
      { name: 'crossing', time: 3.25, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.55),
      { name: 'stand', time: 0.55, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // The test notes of the violinist.
    notes: ['0.5 2 A4', '3 0.25 G3', '3.25 0.25 E5', '3.5 0.25 G3'].join('\n'),
  },
  violist: {
    species: 'cat',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'frog', time: 0.55, rest: false },
      { name: 'tip', time: 2.4, rest: false },
      { name: 'crossing', time: 3.25, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.55),
      { name: 'stand', time: 0.55, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A whole down-bow on A4, then a string crossing from C3 to A4.
    notes: ['0.5 2 A4', '3 0.25 C3', '3.25 0.25 A4', '3.5 0.25 C3'].join('\n'),
  },
  cellist: {
    species: 'dog',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'frog', time: 0.55, rest: false },
      { name: 'tip', time: 2.4, rest: false },
      { name: 'crossing', time: 3.25, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.55),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A whole down-bow on A3, then a string crossing from C2 to A3.
    notes: ['0.5 2 A3', '3 0.25 C2', '3.25 0.25 A3', '3.5 0.25 C2'].join('\n'),
  },
  bassist: {
    species: 'hippo',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'frog', time: 0.55, rest: false },
      { name: 'tip', time: 2.4, rest: false },
      { name: 'crossing', time: 3.25, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.55),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A whole down-bow on G2, then a string crossing from E1 to G2.
    notes: ['0.5 2 G2', '3 0.25 E1', '3.25 0.25 G2', '3.5 0.25 E1'].join('\n'),
  },
  flutist: {
    species: 'fox-tan',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long A5, a rest, then a short phrase with the right paw fingers closed (C5) and open (C6).
    notes: ['0.5 1 A5', '2 0.25 C5', '2.25 0.25 C6', '2.5 0.25 E5'].join('\n'),
  },
  trombonist: {
    species: 'panda',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'first', time: 0.6, rest: false },
      { name: 'seventh', time: 1.9, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // B♭2 in the first position, then E2 in the seventh, the end of the reach of the slide.
    notes: ['0.5 1 Bb2', '1.5 1 E2'].join('\n'),
  },
  oboist: {
    species: 'mouse',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long A4, a rest, then a short phrase with the right paw fingers closed (D4) and open (C6).
    notes: ['0.5 1 A4', '2 0.25 D4', '2.25 0.25 C6', '2.5 0.25 E5'].join('\n'),
  },
  timpanist: {
    species: 'elephant',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'left', time: 0.5, rest: false },
      { name: 'between', time: 1, rest: false },
      // The top of the lift of the right mallet, 0.125 s before its strike (`STRIKE_MOTION`).
      { name: 'up', time: 1.375, rest: false },
      { name: 'right', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 30 },
    // A2 on the second kettle, at the left of the trunk, then C3 on the third kettle, at its
    // right: each note takes the hand on its side (design 5.3). The gallery shows four kettles.
    notes: ['0.5 0.5 A2', '1.5 0.5 C3', '2.5 0.5 A2', '3.5 0.5 C3'].join('\n'),
  },
  bassoonist: {
    species: 'beaver',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long B♭2, a rest, then a short phrase with the right paw fingers closed (D3) and open (F4).
    notes: ['0.5 1 Bb2', '2 0.25 D3', '2.25 0.25 F4', '2.5 0.25 C3'].join('\n'),
  },
  hornist: {
    species: 'pig',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long open F3 (the written C4), a rest, then a short phrase: G3 with the first valve, an
    // open C4, and E4 with the second valve (design 5.3).
    notes: ['0.5 1 F3', '2 0.25 G3', '2.25 0.25 C4', '2.5 0.25 E4'].join('\n'),
  },
  clarinetist: {
    species: 'wolf',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long G4, a rest, then a short phrase with the right paw fingers closed (D4) and open (C6).
    notes: ['0.5 1 G4', '2 0.25 D4', '2.25 0.25 C6', '2.5 0.25 E5'].join('\n'),
  },
  trumpeter: {
    species: 'monkey',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
      { name: 'stand', time: 0.6, rest: false, stand: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long open B♭3 (the written C4), a rest, then a short phrase: E♭4 with the first valve, an
    // open F4, and G4 with the first and the second valve (design 5.3).
    notes: ['0.5 1 Bb3', '2 0.25 Eb4', '2.25 0.25 F4', '2.5 0.25 G4'].join('\n'),
  },
  tubist: {
    species: 'rhino',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'note', time: 0.6, rest: false },
      { name: 'between', time: 1.75, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.6),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // A long open B♭1, a rest, then a short phrase: E♭2 with the first valve, an open F2, and G2
    // with the first and the second valve (design 5.3).
    notes: ['0.5 1 Bb1', '2 0.25 Eb2', '2.25 0.25 F2', '2.5 0.25 G2'].join('\n'),
  },
  singer: {
    species: 'penguin',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    // The default test notes sound from 0 s to 2.5 s and from 3 s to 4 s, so the beak is open at
    // 1.75 s and closed at 2.75 s (`CHOIR_VIEWS` of `tools/choir-check.ts`).
    moments: [
      { name: 'note', time: 1.75, rest: false },
      { name: 'between', time: 2.75, rest: false },
      { name: 'rest', time: 0, rest: true },
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    notes: null,
  },
  'bass-drummer': {
    species: 'badger',
    instrument: 'bass-drum',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'strike', time: 0.5, rest: false },
      { name: 'between', time: 1, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // Three strikes of the bass drum (key 36) with the beater in the right paw.
    notes: ['0.5 0.5 36', '1.5 0.5 36', '2.5 0.5 36'].join('\n'),
  },
  'snare-drummer': {
    species: 'badger',
    instrument: 'snare-drum',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'right', time: 0.5, rest: false },
      { name: 'left', time: 0.75, rest: false },
      { name: 'between', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // Four strikes of the snare drum (key 38) with the paws in turn, then one more.
    notes: ['0.5 0.25 38', '0.75 0.25 38', '1 0.25 38', '1.25 0.25 38', '2 0.5 38'].join('\n'),
  },
  cymbalist: {
    species: 'badger',
    instrument: 'cymbals',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'crash', time: 0.5, rest: false },
      { name: 'open', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // Two crashes of the cymbals (key 49).
    notes: ['0.5 1 49', '2.5 1 49'].join('\n'),
  },
  percussionist: {
    species: 'badger',
    instrument: 'small-percussion',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'triangle', time: 0.5, rest: false },
      { name: 'between', time: 1, rest: false },
      { name: 'tambourine', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // The triangle (key 81) in the left paw, then the tambourine (key 54) on its stand.
    notes: ['0.5 0.5 81', '1.5 0.5 54', '2.5 0.5 81'].join('\n'),
  },
  xylophonist: {
    species: 'badger',
    instrument: 'xylophone',
    views: [
      { name: 'front', azimuth: 0 },
      { name: 'left', azimuth: -90 },
      { name: 'right', azimuth: 90 },
      { name: 'back', azimuth: 180 },
    ],
    moments: [
      { name: 'lowest', time: 0.5, rest: false },
      { name: 'highest', time: 0.75, rest: false },
      { name: 'between', time: 1.5, rest: false },
      { name: 'rest', time: 0, rest: true },
      ...halfMoves(0.5),
    ],
    camera: { kind: 'body', zoom: 1, elevation: 20 },
    // The lowest bar (C5), the highest bar (F7), and the lowest and the highest sharp bar.
    notes: ['0.5 0.25 C5', '0.75 0.25 F7', '1 0.25 C#5', '1.25 0.25 D#7'].join('\n'),
  },
};

/**
 * The first port of the servers of the tool. Vite takes the next free port above it, so a server
 * never takes 4182, the port of the end-to-end tests of the merge script.
 */
export const SERVER_PORT = 4300;

/** The zoom of the face crops of `--target head`, from the distance that shows the whole body. */
const HEAD_ZOOM = 3;

/** The angle of the camera of the face crops above the floor, in degrees. */
const HEAD_ELEVATION = 10;

/** The views of the face crops of `--target head`: the front, 60° to the right, and the side. */
const HEAD_VIEWS: readonly CloseViewAngle[] = [
  { name: 'front', azimuth: 0 },
  { name: 'front-60', azimuth: 60 },
  { name: 'side', azimuth: 90 },
];

/**
 * Gives the face crops of a role (`--target head`): the views of {@link HEAD_VIEWS}, at the rest
 * pose and at the first moment of a note (no lift, no lowering, and seated), with the camera
 * around the body at the zoom {@link HEAD_ZOOM}, aimed at the middle of the head.
 *
 * @param role The close view of the role.
 * @returns The close view of the face crops.
 */
function headViews(role: RoleViews): RoleViews {
  const rest = role.moments.find((moment) => moment.rest);
  const note = role.moments.find((moment) => !moment.rest && !moment.move && !moment.stand);
  return {
    ...role,
    views: HEAD_VIEWS,
    moments: [...(rest ? [rest] : []), ...(note ? [note] : [])],
    camera: { kind: 'body', zoom: HEAD_ZOOM, elevation: HEAD_ELEVATION, head: true },
  };
}

/** The size of one cell of the close view, in CSS pixels. */
const CELL = { width: 360, height: 450 } as const;

/**
 * The illuminance of the light from the camera of each close view (the gallery query `fill`), in
 * lux: about a third of the key light (`KEY_LIGHT.illuminance` 5.8), so that the side of a body
 * away from the key light shows its form. Each check screenshot has a fill light. A commit with no
 * query `fill` renders with no fill.
 */
const CLOSE_FILL_LUX = 2;

/**
 * Gives the path of the gallery page of a view and a moment: the animal of a role alone with its
 * instrument, close, at the camera of the view.
 *
 * @param role The role.
 * @param view The view.
 * @param moment The moment.
 * @param probe The probe of the body (the gallery query `probe`), or `null` for none.
 * @returns The path and the query, from the root of the site.
 */
export function closeViewPath(
  role: RoleViews,
  view: CloseViewAngle,
  moment: CloseMoment,
  probe: GalleryProbe | null = null,
): string {
  const camera = role.camera;
  const query = new URLSearchParams({
    page: 'species',
    only: role.instrument ?? role.species,
    zoom: String(camera.zoom),
    azimuth: String(view.azimuth),
    elevation: String(view.elevation ?? camera.elevation),
  });
  if (camera.kind === 'body') {
    query.set('body', '');
    if (camera.head) {
      query.set('head', '');
    }
  } else {
    query.set('target', String(camera.target));
    query.set('x', String(camera.x));
    query.set('z', String(camera.z));
  }
  if (moment.rest) {
    query.set('rest', '');
  }
  if (moment.stand) {
    query.set('stand', '');
  }
  if (moment.move) {
    query.set(moment.move.kind, String(moment.move.share));
  }
  if (probe) {
    query.set('probe', probe);
  }
  query.set('fill', String(CLOSE_FILL_LUX));
  return `/gallery.html?${query.toString()}`;
}

/**
 * Renders one cell: the gallery page of a view at the time of a moment, with no panel and no
 * labels.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param role The role.
 * @param view The view.
 * @param moment The moment.
 * @param size The size of the cell, in CSS pixels.
 * @param probe The probe of the body, or `null` for none.
 * @returns The PNG image.
 */
async function render(
  browser: Browser,
  base: string,
  role: RoleViews,
  view: CloseViewAngle,
  moment: CloseMoment,
  size: CellSize = CELL,
  probe: GalleryProbe | null = null,
): Promise<Buffer> {
  const path = closeViewPath(role, view, moment, probe);
  const page = await openShot(browser, new URL(path.slice(1), base).href, {
    file: '',
    path,
    ...size,
    ready: 'canvas[data-ready="species"]',
  });
  try {
    await page.addStyleTag({ content: '#controls, #labels { display: none; }' });
    await page.evaluate(
      ({ time, notes }) => {
        const input = document.querySelector('#notes');
        if (notes !== null && input instanceof HTMLTextAreaElement) {
          input.value = notes;
          input.dispatchEvent(new Event('input'));
        }
        const slider = document.querySelector('#time');
        if (slider instanceof HTMLInputElement) {
          slider.value = String(time);
          slider.dispatchEvent(new Event('input'));
        }
      },
      { time: moment.time, notes: role.notes },
    );
    // The idle motion needs a few frames at the new time.
    await page.waitForTimeout(300);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * Puts the cells in a grid: one row for each moment, one column for each view, with the name of
 * the moment and of the view in each cell, in white on a dark box.
 *
 * @param browser The browser.
 * @param cells The image of each cell, row by row.
 * @param labels The label of each cell.
 * @param columns The number of columns.
 * @param cellSize The size of one cell, in CSS pixels.
 * @returns The PNG image.
 */
async function grid(
  browser: Browser,
  cells: readonly Buffer[],
  labels: readonly string[],
  columns: number,
  cellSize: { readonly width: number; readonly height: number } = CELL,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const dataUrl = await page.evaluate(
      async ({ images, names, size, across }) => {
        const loaded = await Promise.all(
          images.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            return image;
          }),
        );
        const canvas = document.createElement('canvas');
        canvas.width = size.width * across;
        canvas.height = size.height * Math.ceil(images.length / across);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        context.font = '16px sans-serif';
        for (const [i, image] of loaded.entries()) {
          const x = (i % across) * size.width;
          const y = Math.floor(i / across) * size.height;
          context.drawImage(image, x, y, size.width, size.height);
          // A dark box keeps the label legible over a light scene or the text of the app.
          const name = names[i] ?? '';
          context.fillStyle = 'rgba(0, 0, 0, 0.65)';
          context.fillRect(x, y, context.measureText(name).width + 20, 34);
          context.fillStyle = '#ffffff';
          context.fillText(name, x + 10, y + 24);
        }
        return canvas.toDataURL('image/png');
      },
      {
        images: cells.map((cell) => `data:image/png;base64,${cell.toString('base64')}`),
        names: [...labels],
        size: cellSize,
        across: columns,
      },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await page.close();
  }
}

/**
 * Gives the role of a name of the command line.
 *
 * @param name The name.
 * @returns The role, or `null` for a name that is not a role.
 */
export function roleOf(name: string | undefined): CloseRole | null {
  return CLOSE_ROLES.find((role) => role === name) ?? null;
}

/** The command line of the close views. */
interface CloseViewsArgs {
  /** The role. */
  readonly role: CloseRole;
  /** The output directory. */
  readonly out: string;
  /** The URL of a running site of the working tree, or `null` for the built site. */
  readonly url: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** The zoom of the camera of `--zoom`, 1 or more, or `null` for the zoom of the role. */
  readonly zoom: number | null;
  /**
   * The angle of the camera above the floor of all views (`--elevation`), in degrees, or `null`
   * for the elevation of each view of the role.
   */
  readonly elevation: number | null;
  /**
   * The point of `--aim` at which a line camera looks ({@link aimOf}), or `null` for the point of
   * the role.
   */
  readonly aim: LineAim | null;
  /** The factor of the size of each cell (`--scale`): 1 gives {@link CELL}. */
  readonly scale: number;
  /**
   * The cells of `--pairs`, as `<moment>-<view>`, whose base and tree pair the tool writes, or
   * `null` for none ({@link pairCells}).
   */
  readonly pairs: readonly string[] | null;
  /** The box of `--crop` of each pair, or `null` for the whole cell ({@link cropOf}). */
  readonly crop: CropBox | null;
  /**
   * The GLB file of `--glb`, as an absolute path: the species of the role takes the studio body
   * that the export makes from the file (`tools/glb-swap.ts`). `null` keeps the body of the tree.
   */
  readonly glb: string | null;
  /** The hold changes of `--set` (`setHolds()` of `tools/hold-sets.ts`), or `null` for none. */
  readonly holds: string | null;
  /**
   * The probes of `--probe` ({@link probesOf}), one grid each, or `null` for the grid with no
   * probe.
   */
  readonly probes: readonly GalleryProbe[] | null;
  /** The target of `--target`: `head` for the face crops ({@link headViews}), or `null`. */
  readonly target: 'head' | null;
  /** The views of `--views` ({@link viewList}), or `null` for the views of the role. */
  readonly views: readonly CloseViewAngle[] | null;
  /** The names of the moments of `--moments`, or `null` for the moments of the role. */
  readonly moments: readonly string[] | null;
  /**
   * The lineup of `--lineup` ({@link lineupImage}), or `null` for none: the rows of the commit, the
   * working tree, and each role of `--with`, one image for each moment.
   */
  readonly lineup: RoleLineup | null;
  /**
   * The box of each cell of `--sheet` ({@link cropOf}), {@link WHOLE_CELL} with no `--box`, or
   * `null` for no sheet. A sheet is one image for each view, with the commit of `--base` above
   * the working tree at each moment ({@link writeSheets}).
   */
  readonly sheet: CropBox | null;
}

/** The lineup of the close views of a role (`--lineup`). */
interface RoleLineup {
  /** The other roles of `--with`, one row each, from the working tree. */
  readonly roles: readonly CloseRole[];
  /** The factor of `--crop <n>`: 1 for the whole cells, or 2 or 3 for crops of the box at n times. */
  readonly crop: number;
  /** The box of the crops of `--box`, as shares of the cell ({@link cropOf}). */
  readonly box: CropBox;
  /**
   * The path of one sheet of the crops of all moments, with no extension (the mode `audit`), or
   * `null` for none. The sheet needs a crop factor above 1.
   */
  readonly sheet?: string | null;
}

/** The views of the lineup with no `--views`: the front, the back, and each side. */
const LINEUP_VIEWS: readonly string[] = ['front', 'back', 'left', 'right'];

/** The box of the crops of the lineup with no `--box`: the arms and the upper body at zoom 1.5. */
const LINEUP_BOX: CropBox = { x: 0.1, y: 0.25, width: 0.8, height: 0.5 };

/** The box of the whole cell: a cell of `--sheet` with no `--box`, or a pair with no `--crop`. */
const WHOLE_CELL: CropBox = { x: 0, y: 0, width: 1, height: 1 };

/** The views that each role has by name in `--views`, with their turns of the camera. */
const NAMED_VIEWS: readonly CloseViewAngle[] = [
  { name: 'front', azimuth: 0 },
  { name: 'back', azimuth: 180 },
  { name: 'left', azimuth: -90 },
  { name: 'right', azimuth: 90 },
];

/**
 * Reads the views of `--views <view,...>`: a view of the role or of {@link NAMED_VIEWS} by its
 * name, or a turn of the camera in degrees, such as `35` or `-35`, which takes the name `az35`.
 *
 * @param role The views of the role.
 * @param value The text of the option.
 * @returns The views, in their order.
 * @throws Error for an unknown name or a view that comes two times.
 */
function viewList(role: RoleViews, value: string): CloseViewAngle[] {
  const views = value.split(',').map((name): CloseViewAngle => {
    const own = [...role.views, ...NAMED_VIEWS].find((view) => view.name === name);
    if (own) {
      return own;
    }
    const azimuth = Number(name);
    if (name.trim() === '' || !Number.isInteger(azimuth) || Math.abs(azimuth) > 180) {
      throw new Error(
        `The option --views takes the views ${[...new Set([...role.views, ...NAMED_VIEWS].map((view) => view.name))].join(', ')} or a whole turn in degrees from -180 to 180, such as 35, and not "${name}".`,
      );
    }
    return { name: `az${azimuth}`, azimuth };
  });
  const names = views.map((view) => view.name);
  const twice = names.find((name, i) => names.indexOf(name) !== i);
  if (twice !== undefined) {
    throw new Error(`The view "${twice}" comes two times in --views.`);
  }
  return views;
}

/**
 * Gives the moments of the lineup with no `--moments`: the first moment of the role and its rest.
 *
 * @param role The close view of the role.
 * @returns The names of the moments.
 */
function lineupMoments(role: RoleViews): string[] {
  const [first] = role.moments;
  const rest = role.moments.find((moment) => moment.rest);
  return [first, rest].flatMap((moment, i, all) =>
    moment && all.indexOf(moment) === i ? [moment.name] : [],
  );
}

/**
 * Gives the moment of another role of the lineup for a moment of the role: the moment of the same
 * name, else the rest for a rest and the first moment for each other moment.
 *
 * @param role The other role.
 * @param moment The moment of the role.
 * @returns The moment of the other role.
 */
function partnerMoment(role: RoleViews, moment: CloseMoment): CloseMoment {
  const same = role.moments.find((own) => own.name === moment.name);
  const rest = role.moments.find((own) => own.rest);
  const [first] = role.moments;
  const found = same ?? (moment.rest ? rest : first) ?? first;
  if (!found) {
    throw new Error('The role has no moment.');
  }
  return found;
}

/**
 * Reads the probes of `--probe <probe,...>`, such as `colors,normals`: each a probe of the
 * gallery query `probe` (design 7.1), one time each.
 *
 * @param value The text of the option.
 * @returns The probes, in their order.
 * @throws Error that lists the probes, for an unknown probe or a probe that comes two times.
 */
function probesOf(value: string): GalleryProbe[] {
  const probes = value
    .split(',')
    .flatMap((name) => GALLERY_PROBES.filter((probe) => probe === name));
  if (probes.length !== value.split(',').length || new Set(probes).size !== probes.length) {
    throw new Error(
      `The option --probe takes the probes ${GALLERY_PROBES.join(', ')}, each one time, separated by commas, and not "${value}".`,
    );
  }
  return probes;
}

/**
 * A box of a cell, as shares of the width and the height of the cell, from its top left corner:
 * the same box at each `--scale`.
 */
interface CropBox {
  /** The left side, from 0 to 1. */
  readonly x: number;
  /** The top side, from 0 to 1. */
  readonly y: number;
  /** The width, above 0. The box ends at 1 or before. */
  readonly width: number;
  /** The height, above 0. The box ends at 1 or before. */
  readonly height: number;
}

/**
 * Reads the box of `--crop <x>,<y>,<w>,<h>`: shares of the cell from its top left corner, such as
 * `0.25,0.2,0.5,0.45`.
 *
 * @param value The text of the option.
 * @returns The box.
 * @throws Error if the text has not four numbers, or if the box is not inside the cell.
 */
function cropOf(value: string): CropBox {
  const parts = value.split(',').map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  const [x = Number.NaN, y = Number.NaN, width = Number.NaN, height = Number.NaN] = parts;
  const inside =
    parts.length === 4 &&
    parts.every((part) => Number.isFinite(part)) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1;
  if (!inside) {
    throw new Error(
      `The option --crop takes <x>,<y>,<w>,<h> as shares of the cell inside 0 to 1, such as 0.25,0.2,0.5,0.45, and not "${value}".`,
    );
  }
  return { x, y, width, height };
}

/**
 * Chooses the cells of `--pairs` of a role: a name of a view (`front`) takes the cell of the view
 * at each moment, and a name `<moment>-<view>` takes one cell.
 *
 * @param role The views and the moments of the role.
 * @param names The names of `--pairs`.
 * @returns The cells, as `<moment>-<view>`, in the order of the grid.
 * @throws Error if a name names no view and no cell of the role.
 */
function pairCells(role: RoleViews, names: readonly string[]): string[] {
  const cells = role.moments.flatMap((moment) =>
    role.views.map((view) => ({ cell: `${moment.name}-${view.name}`, view: view.name })),
  );
  const unknown = names.filter(
    (name) => !cells.some(({ cell, view }) => name === cell || name === view),
  );
  if (unknown.length > 0) {
    throw new Error(
      `The option --pairs names no view or cell of the role: ${unknown.join(', ')}. The views are ${role.views.map((view) => view.name).join(', ')}, and a cell is <moment>-<view>, such as ${cells[0]?.cell ?? 'play-front'}.`,
    );
  }
  return cells
    .filter(({ cell, view }) => names.includes(cell) || names.includes(view))
    .map(({ cell }) => cell);
}

/** The largest factor of the cell size of `--scale`: the grid of a role stays below 16,384 px. */
const MAX_SCALE = 3;

/**
 * Reads the factor of the cell size of `--scale`.
 *
 * @param value The text of the option, or `null` with no option.
 * @returns The factor: 1 with no option.
 * @throws Error if the factor is not a number above 0 and at most {@link MAX_SCALE}.
 */
function scaleOf(value: string | null): number {
  if (value === null) {
    return 1;
  }
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > MAX_SCALE) {
    throw new Error(
      `The option --scale takes a number above 0 and at most ${MAX_SCALE}, such as 2, and not "${value}".`,
    );
  }
  return scale;
}

/**
 * Reads the command line of the close views: `<role> <dir> [--target head] [--views <view|deg,...>]
 * [--moments <moment,...>] [--zoom <n>] [--elevation <deg>] [--aim <x>,<z>,<height>] [--scale <n>]
 * [--probe <probe,...>] [--url <url>] [--glb <file>] [--set <changes>] [--lineup [--with
 * <role,...>] [--crop <n>] [--box <x>,<y>,<w>,<h>]] [--base <ref> [--pairs <view|cell,...> [--crop
 * <x>,<y>,<w>,<h>]] [--sheet [--box <x>,<y>,<w>,<h>]]]`. `--aim` points a line camera at a part,
 * such as a wrist of the conductor ({@link aimOf}). With `--lineup`, the views are
 * {@link LINEUP_VIEWS} and the moments {@link lineupMoments} unless `--views` and `--moments`
 * give others. `--sheet` gives one sheet for each view ({@link writeSheets}), with the cells of
 * `--scale` cut to the box of `--box`. A moment `lift<n>` or `lower<n>` gives the share n / 100 of
 * that move ({@link roleMoment}), such as `lift30`.
 *
 * @param args The arguments after the script.
 * @returns The command line, or `null` when it is not correct.
 * @throws Error if a target, a zoom, an elevation, a scale, a probe, a pair, a view, a moment, a
 *   role of `--with`, or a crop does not fit, if `--pairs` or `--sheet` comes with no `--base`,
 *   `--crop` with no `--pairs` or `--lineup`, `--with` or a factor of `--crop` with no
 *   `--lineup`, or `--box` with no `--lineup` or `--sheet`, if `--lineup` comes with `--probe`,
 *   `--target`, `--pairs`, or `--sheet`, if `--set` comes more than one time, or if `--glb` or
 *   `--set` comes with `--url`.
 */
export function closeViewsArgs(args: readonly string[]): CloseViewsArgs | null {
  const role = roleOf(args[0]);
  const out = args[1];
  const url = optionValue(args, '--url');
  const base = optionValue(args, '--base');
  const zoom = optionValue(args, '--zoom');
  const elevation = optionValue(args, '--elevation');
  const aim = optionValue(args, '--aim');
  const scale = optionValue(args, '--scale');
  const pairs = optionValue(args, '--pairs');
  const crop = optionValue(args, '--crop');
  const glb = optionValue(args, '--glb');
  const holds = optionValue(args, '--set');
  const probe = optionValue(args, '--probe');
  const target = optionValue(args, '--target');
  const views = optionValue(args, '--views');
  const moments = optionValue(args, '--moments');
  const withRoles = optionValue(args, '--with');
  const box = optionValue(args, '--box');
  const lineup = args.includes('--lineup');
  const sheet = args.includes('--sheet');
  const given = [url, base, zoom, elevation, scale, pairs, crop, glb, holds, probe, target];
  if (
    !role ||
    !out ||
    out.startsWith('--') ||
    [...given, views, moments, withRoles, box].includes(undefined)
  ) {
    return null;
  }
  const factor = crop !== null && crop !== undefined && /^\d$/.test(crop) ? Number(crop) : null;
  if (!lineup && (withRoles || factor !== null)) {
    throw new Error('The options --with and --crop <n> need --lineup.');
  }
  if (!lineup && !sheet && box) {
    throw new Error('The option --box needs --lineup or --sheet.');
  }
  if (lineup && (probe || target || pairs || sheet)) {
    throw new Error('The option --lineup takes no --probe, --target, --pairs, or --sheet.');
  }
  if (sheet && !base) {
    throw new Error(
      'The option --sheet needs --base, because the top row of each sheet is the base.',
    );
  }
  if (factor !== null && (factor < 1 || factor > MAX_SCALE)) {
    throw new Error(`The option --crop of --lineup takes 1 to ${MAX_SCALE}, and not "${crop}".`);
  }
  if (lineup && crop !== null && factor === null) {
    throw new Error(`The option --crop of --lineup takes a factor, such as 2, and not "${crop}".`);
  }
  const ownViews = ROLE_VIEWS[role];
  const momentNames = moments
    ? moments.split(',').map((name) => roleMoment(ownViews, name).name)
    : null;
  const partners = (withRoles?.split(',') ?? []).map((name) => {
    const other = roleOf(name);
    if (!other) {
      throw new Error(
        `The option --with takes the roles ${CLOSE_ROLES.join(', ')}, and not "${name}".`,
      );
    }
    return other;
  });
  if (target !== null && target !== 'head') {
    throw new Error(`The option --target takes head, and not "${target}".`);
  }
  if (args.filter((arg) => arg === '--set').length > 1) {
    throw new Error('The option --set comes more than one time. The close views show one variant.');
  }
  if ((glb || holds) && url) {
    throw new Error('The options --glb and --set build a site of their own, so --url does not go.');
  }
  if (pairs && !base) {
    throw new Error('The option --pairs needs --base, because each pair holds the base cell.');
  }
  if (crop && !pairs && !lineup) {
    throw new Error('The option --crop needs --pairs or --lineup.');
  }
  return {
    role,
    out,
    url: url ?? null,
    base: base ?? null,
    zoom: zoom ? zoomOf(zoom) : null,
    elevation: elevationOf(elevation ?? undefined),
    aim: aimOf(aim ?? undefined),
    scale: scaleOf(scale ?? null),
    pairs: pairs
      ? pairCells(target ? headViews(ROLE_VIEWS[role]) : ROLE_VIEWS[role], pairs.split(','))
      : null,
    crop: crop && !lineup ? cropOf(crop) : null,
    glb: glb ? resolve(glb) : null,
    holds: holds ?? null,
    probes: probe ? probesOf(probe) : null,
    target: target ?? null,
    views: views
      ? viewList(ownViews, views)
      : lineup
        ? viewList(ownViews, LINEUP_VIEWS.join(','))
        : null,
    moments: momentNames ?? (lineup ? lineupMoments(ownViews) : null),
    lineup: lineup
      ? { roles: partners, crop: factor ?? 1, box: box ? cropOf(box) : LINEUP_BOX }
      : null,
    sheet: sheet ? (box ? cropOf(box) : WHOLE_CELL) : null,
  };
}

/**
 * A variant of the site of the working tree for the close views of a role (`--glb`, `--set`), or
 * for the play frames (`--set`).
 */
interface SiteVariant {
  /** The module of the studio body of the GLB file: its path and its text, or `null`. */
  readonly body: { readonly path: string; readonly text: string } | null;
  /**
   * The hold changes of each `--set`, or `null` for none. With more than one, the page applies
   * the changes of the query `holds`, an index in the list ({@link HOLDS_QUERY}).
   */
  readonly holds: readonly string[] | null;
  /** The entry module of the page that applies the hold changes first. */
  readonly entry: string;
}

/** The query of the page that chooses a variant of a build of more than one `--set` of `play`. */
const HOLDS_QUERY = 'holds';

/** The id of the module that applies the hold changes of a variant in its build. */
const HOLDS_MODULE = 'virtual:close-views-holds';

/** The entry module of the gallery page, which the close views of a role render. */
const GALLERY_ENTRY = join(ROOT, 'src', 'gallery', 'main.ts');

/** The entry module of the app page, which the play frames render. */
const APP_ENTRY = join(ROOT, 'src', 'main.ts');

/**
 * Checks the variant of `--glb` and `--set` of the close views of a role, and makes it: the
 * module of the studio body of the GLB file, as `pnpm fold-probe --glb` makes it.
 *
 * @param args The command line.
 * @param check True to only check the variant, with no export of the GLB file.
 * @returns The variant, or `null` with neither option or with `check`.
 * @throws Error if a hold change does not fit, if the species of the role has no studio body, or
 *   if the GLB file does not exist.
 */
async function siteVariant(args: CloseViewsArgs, check: boolean): Promise<SiteVariant | null> {
  if (!args.glb && args.holds === null) {
    return null;
  }
  const changes = args.holds === null ? null : setHolds(args.holds);
  changes?.undo();
  const { species } = ROLE_VIEWS[args.role];
  const animal = speciesAnimal(species);
  if (args.glb && !animal) {
    throw new Error(`The ${species} of the role ${args.role} has no studio body for --glb.`);
  }
  if (args.glb && !existsSync(args.glb)) {
    throw new Error(`The GLB file ${args.glb} does not exist.`);
  }
  if (check) {
    return null;
  }

  if (changes) {
    console.log(`The working tree takes the hold changes ${changes.text}.`);
  }
  if (!args.glb || !animal) {
    return { body: null, holds: args.holds === null ? null : [args.holds], entry: GALLERY_ENTRY };
  }
  const { text } = glbModule(animal, args.glb, new Uint8Array(await readFile(args.glb)));
  console.log(`The ${species} of the working tree takes the studio body of ${args.glb}.`);
  return {
    body: { path: join(ROOT, 'src', 'models', 'studio', `${animal}.ts`), text },
    holds: args.holds === null ? null : [args.holds],
    entry: GALLERY_ENTRY,
  };
}

/**
 * Gives the plugin of the build of a variant: the module of the studio body of the GLB file in
 * place of the module of the tree, and a first import of the entry of the page that applies the
 * hold changes with `setHolds()` before the other modules of the page run, as the hold tools
 * change the holds in memory. A build of more than one variant of `--set` applies the changes
 * that the query {@link HOLDS_QUERY} of the page chooses, so one build renders each variant.
 *
 * @param variant The variant.
 * @returns The plugin.
 */
function variantPlugin(variant: SiteVariant): Plugin {
  const resolved = `\0${HOLDS_MODULE}`;
  const holdSets = join(ROOT, 'tools', 'hold-sets.ts');
  const holds = variant.holds ?? [];
  const apply =
    holds.length > 1
      ? `const holds = ${JSON.stringify(holds)};\nsetHolds(holds[Number(new URLSearchParams(location.search).get(${JSON.stringify(HOLDS_QUERY)}) ?? 0)] ?? holds[0]);\n`
      : `setHolds(${JSON.stringify(holds[0] ?? '')});\n`;
  return {
    name: 'zoophony:close-views-variant',
    apply: 'build',
    resolveId(id) {
      return id === HOLDS_MODULE ? resolved : null;
    },
    load(id) {
      if (id === resolved) {
        return `import { setHolds } from ${JSON.stringify(holdSets)};\n${apply}`;
      }
      return variant.body && id === variant.body.path ? variant.body.text : null;
    },
    transform(code, id) {
      return variant.holds !== null && id === variant.entry
        ? `import ${JSON.stringify(HOLDS_MODULE)};\n${code}`
        : null;
    },
  };
}

/**
 * Builds the site of the working tree with the plugins of a variant ({@link variantPlugin}) and of
 * `--at` ({@link aimPlugin}) into a temporary folder, and serves it ({@link startSite}). The
 * folder goes away when the site closes. `pnpm share-image` also builds its site with it.
 *
 * @param plugins The plugins.
 * @returns The site.
 * @throws Error if the build fails.
 */
export async function startVariantSite(plugins: readonly Plugin[]): Promise<Site> {
  const dir = await mkdtemp(join(tmpdir(), 'close-views-variant-'));
  const remove = (): Promise<void> => rm(dir, { recursive: true, force: true });
  try {
    await viteBuild({
      root: ROOT,
      logLevel: 'warn',
      build: { outDir: dir, emptyOutDir: true },
      plugins: [...plugins],
    });
    const site = await startSite(ROOT, SERVER_PORT, dir);
    return {
      ...site,
      close: async () => {
        await site.close();
        await remove();
      },
    };
  } catch (error) {
    await remove();
    throw error;
  }
}

/**
 * Puts the crop of a cell of the base beside the same crop of the cell of the working tree, with
 * the name of each tree in white on a dark box above its crop.
 *
 * @param browser The browser.
 * @param cells The PNG image of the cell of the base and of the working tree.
 * @param labels The label of each crop.
 * @param crop The box of the crop, or `null` for the whole cell.
 * @returns The PNG image.
 */
async function pairImage(
  browser: Browser,
  cells: readonly [Buffer, Buffer],
  labels: readonly [string, string],
  crop: CropBox | null,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    const dataUrl = await page.evaluate(
      async ({ images, names, box }) => {
        const loaded = await Promise.all(
          images.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            return image;
          }),
        );
        const [first] = loaded;
        if (!first) {
          throw new Error('The pair has no image.');
        }
        const sx = Math.round(box.x * first.naturalWidth);
        const sy = Math.round(box.y * first.naturalHeight);
        const width = Math.round(box.width * first.naturalWidth);
        const height = Math.round(box.height * first.naturalHeight);
        const band = 34;
        const gap = 8;
        const canvas = document.createElement('canvas');
        canvas.width = width * loaded.length + gap * (loaded.length - 1);
        canvas.height = height + band;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        context.fillStyle = '#1b1b1f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = '16px sans-serif';
        for (const [i, image] of loaded.entries()) {
          const x = i * (width + gap);
          context.drawImage(image, sx, sy, width, height, x, band, width, height);
          context.fillStyle = '#ffffff';
          context.fillText(names[i] ?? '', x + 10, 24);
        }
        return canvas.toDataURL('image/png');
      },
      {
        images: cells.map((cell) => `data:image/png;base64,${cell.toString('base64')}`),
        names: [...labels],
        box: crop ?? WHOLE_CELL,
      },
    );
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await page.close();
  }
}

/**
 * Gives the close view of a role with the camera of the command line: the face crops of
 * `--target head` ({@link headViews}), the views of `--views` and the moments of `--moments`,
 * then the zoom of `--zoom` and the elevation of `--elevation` for each view, in place of the
 * values of the role. A line camera then looks at the point of `--aim`.
 *
 * @param role The close view of the role.
 * @param args The zoom, the elevation, the target, the views, the moments, and the point of the
 *   command line.
 * @returns The close view.
 * @throws Error if `--aim` comes with a role whose camera is not a line camera.
 */
function roleCamera(
  role: RoleViews,
  args: Pick<CloseViewsArgs, 'zoom' | 'elevation' | 'target'> &
    Partial<Pick<CloseViewsArgs, 'views' | 'moments' | 'aim'>>,
): RoleViews {
  const { zoom, elevation } = args;
  const aim = args.aim ?? null;
  const aimed = args.target === 'head' ? headViews(role) : role;
  const views = args.views ?? aimed.views;
  const names = args.moments;
  return {
    ...aimed,
    views:
      elevation === null
        ? views
        : views.map((view): CloseViewAngle => ({
            name: view.name,
            azimuth: view.azimuth,
            elevation,
          })),
    moments: names ? names.map((name) => roleMoment(aimed, name)) : aimed.moments,
    camera: aimCamera(zoom === null ? aimed.camera : { ...aimed.camera, zoom }, aim),
  };
}

/**
 * Gives a camera that looks at the point of `--aim`.
 *
 * @param camera The camera of the role.
 * @param aim The point, or `null` to keep the camera.
 * @returns The camera.
 * @throws Error if the camera is not a line camera and a point comes.
 */
function aimCamera(camera: BodyCamera | LineCamera, aim: LineAim | null): BodyCamera | LineCamera {
  if (aim === null) {
    return camera;
  }
  if (camera.kind !== 'line') {
    throw new Error('The option --aim needs a role with a line camera, such as the conductor.');
  }
  return { ...camera, ...aim };
}

/**
 * Gives the size of one cell of the close view of a role.
 *
 * @param scale The factor of `--scale`.
 * @returns The size, in CSS pixels: {@link CELL} at the factor 1.
 */
function roleCell(scale: number): CellSize {
  return { width: Math.round(CELL.width * scale), height: Math.round(CELL.height * scale) };
}

/**
 * Gives the labels of the grid of a commit above the grid of the working tree: each label of a
 * cell starts with the name of its tree.
 *
 * @param labels The labels of the cells of one grid.
 * @param base The name of the commit, such as `main (cc83899c)`.
 * @returns The labels of the cells of the commit, then of the working tree.
 */
export function baseGridLabels(labels: readonly string[], base: string): string[] {
  return [
    ...labels.map((label) => `${base}: ${label}`),
    ...labels.map((label) => `working tree: ${label}`),
  ];
}

/**
 * Builds a commit in a temporary folder (`withRefBuild()`), serves its site with `vite preview`
 * from {@link SERVER_PORT} up, and gives the URL of the site to a function. The server stops at
 * the end, also after a failure of the function.
 *
 * @param ref The commit, the branch, or the tag.
 * @param label The name of the commit in the messages, such as `main (cc83899c)`.
 * @param use The function that reads the site.
 * @param overlay The paths of the working tree that replace the paths of the commit, such as
 *   `src/gallery`.
 * @param plugins The plugins of the mode `play` ({@link playPlugins}). With one or more, the tool
 *   serves a second build of the commit with them, in `dist-tool/`.
 * @returns The result of the function.
 * @throws Error if the build fails, the server has no URL, or the function fails.
 */
function withRefSite<T>(
  ref: string,
  label: string,
  use: (site: string) => Promise<T>,
  overlay: readonly string[] = [],
  plugins: readonly PlayPlugin[] = [],
): Promise<T> {
  return withRefBuild(
    ref,
    async (dir) => {
      const outDir = join(dir, plugins.length > 0 ? 'dist-tool' : 'dist');
      if (plugins.length > 0) {
        await viteBuild({
          root: dir,
          logLevel: 'warn',
          build: { outDir, emptyOutDir: true },
          plugins: playPlugins(dir, plugins),
        });
      }
      const server = await preview({
        root: dir,
        build: { outDir },
        preview: { port: SERVER_PORT, strictPort: false, open: false },
      });
      try {
        const site = server.resolvedUrls?.local[0];
        if (!site) {
          throw new Error(`The preview server of ${label} has no URL.`);
        }
        return await use(site);
      } finally {
        await server.close();
      }
    },
    undefined,
    overlay,
  );
}

/** The cells of the close view of a role, row by row, with their labels. */
interface RenderedViews {
  /** The PNG image of each cell. */
  readonly cells: readonly Buffer[];
  /** The label of each cell: the moment and the view. */
  readonly labels: readonly string[];
}

/**
 * Renders each cell of the close view of a role, and writes each cell as a PNG file.
 *
 * @param browser The browser.
 * @param base The URL of the site.
 * @param role The views, the moments, and the camera of the role.
 * @param out The output directory.
 * @param prefix The start of the file names, such as `violinist-`.
 * @param size The size of one cell, in CSS pixels.
 * @param probe The probe of the body, or `null` for none. A probe ends each label.
 * @returns The cells and their labels.
 */
async function renderViews(
  browser: Browser,
  base: string,
  role: RoleViews,
  out: string,
  prefix: string,
  size: CellSize = CELL,
  probe: GalleryProbe | null = null,
): Promise<RenderedViews> {
  const cells: Buffer[] = [];
  const labels: string[] = [];
  for (const moment of role.moments) {
    for (const view of role.views) {
      const cell = await render(browser, base, role, view, moment, size, probe);
      await writeFile(join(out, `${prefix}${moment.name}-${view.name}.png`), cell);
      cells.push(cell);
      labels.push(`${moment.name}, ${view.name}${probe ? `, ${probe}` : ''}`);
    }
  }
  return { cells, labels };
}

/** The site of the working tree, with the browser of the tool. */
interface TreeSite {
  /** The URL of the site. */
  readonly base: string;
  /** The browser. */
  readonly browser: Browser;
}

/**
 * The renders of a mode on the site of a commit, after the renders of the working tree. It gets
 * the URL of the site of the commit and the name of the commit, such as `main (cc83899c)`, and
 * writes the images of the commit and the grids of both trees.
 */
type CommitRender = (site: string, label: string) => Promise<void>;

/** The renders of one mode of the tool: first on the working tree, then on a commit. */
interface ModeRender {
  /**
   * The paths of the working tree that the build of the commit takes in place of the paths of the
   * commit, such as `src/gallery` (`withRefBuild()`).
   */
  readonly overlay: readonly string[];
  /** The plugins of the mode `play` that the build of the commit takes ({@link playPlugins}). */
  readonly plugins: readonly PlayPlugin[];
  /**
   * Renders the mode on the site of the working tree, and writes its images.
   *
   * @param site The site of the working tree.
   * @returns The renders of the commit, or `null` when the commit needs no build, such as a strip
   *   of `--base` from its cache. The tool calls them only with `--base`.
   */
  readonly tree: (site: TreeSite) => Promise<CommitRender | null>;
}

/**
 * Renders the close view of a role into `<dir>` ({@link probeViews}): one time with no `--probe`,
 * or one time for each probe of `--probe`, all on one site.
 *
 * @param args The command line.
 * @param site The site of the working tree.
 * @returns The renders of the commit.
 */
async function roleViews(args: CloseViewsArgs, site: TreeSite): Promise<CommitRender> {
  const renders: CommitRender[] = [];
  for (const probe of args.probes ?? [null]) {
    renders.push(await probeViews(args, site, probe));
  }
  return async (other, label) => {
    for (const commitRender of renders) {
      await commitRender(other, label);
    }
  };
}

/** One row of a lineup: the name of its tree or role, and its cells, moment by moment. */
interface LineupRow {
  /** The name of the row, such as `working tree`. */
  readonly label: string;
  /** The cells, row by row of the role: the views of each moment. */
  readonly cells: readonly Buffer[];
}

/**
 * Cuts a box out of each cell, at the pixels of the cell.
 *
 * @param browser The browser.
 * @param cells The PNG image of each cell.
 * @param box The box, as shares of the cell.
 * @returns The PNG image of each crop.
 */
async function cropCells(
  browser: Browser,
  cells: readonly Buffer[],
  box: CropBox,
): Promise<Buffer[]> {
  const page = await browser.newPage();
  try {
    const urls = await page.evaluate(
      async ({ images, crop }) =>
        Promise.all(
          images.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const sx = Math.round(crop.x * image.naturalWidth);
            const sy = Math.round(crop.y * image.naturalHeight);
            const width = Math.round(crop.width * image.naturalWidth);
            const height = Math.round(crop.height * image.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d')?.drawImage(image, sx, sy, width, height, 0, 0, width, height);
            return canvas.toDataURL('image/png');
          }),
        ),
      {
        images: cells.map((cell) => `data:image/png;base64,${cell.toString('base64')}`),
        crop: box,
      },
    );
    return urls.map((url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  } finally {
    await page.close();
  }
}

/**
 * Writes the lineup of a role (`--lineup`): for each moment, one image with a row for each tree
 * or role and a column for each view, as `<prefix>-<moment>.png` and `.webp` with the cells of
 * {@link CELL}. With `--crop <n>` above 1, the cells of the factor n also give
 * `<prefix>-<moment>-crop<n>.png` and `.webp`: the box of `--box` of each cell at its pixels,
 * which is n times the box at the factor 1.
 *
 * @param browser The browser.
 * @param role The views and the moments of the role.
 * @param rows The rows, each with the cells of all moments of the role.
 * @param lineup The lineup of the command line.
 * @param size The size of the cells of the rows, in CSS pixels.
 * @param prefix The start of the file paths, such as `out/violinist-lineup`.
 */
async function writeLineups(
  browser: Browser,
  role: RoleViews,
  rows: readonly LineupRow[],
  lineup: RoleLineup,
  size: CellSize,
  prefix: string,
): Promise<void> {
  const columns = role.views.length;
  const sheetCells: Buffer[] = [];
  const sheetLabels: string[] = [];
  const cropSize = {
    width: Math.round(lineup.box.width * size.width),
    height: Math.round(lineup.box.height * size.height),
  };
  for (const [m, moment] of role.moments.entries()) {
    const cells = rows.flatMap((row) => row.cells.slice(m * columns, (m + 1) * columns));
    const labels = rows.flatMap((row) =>
      role.views.map((view) => `${row.label}: ${moment.name}, ${view.name}`),
    );
    const sheet = await grid(browser, cells, labels, columns, size);
    await writeFile(`${prefix}-${moment.name}.png`, sheet);
    await writeFile(
      `${prefix}-${moment.name}.webp`,
      await toWebp(browser, await grid(browser, cells, labels, columns)),
    );
    console.log(`${prefix}-${moment.name}.png`);
    if (lineup.crop > 1) {
      const crops = await cropCells(browser, cells, lineup.box);
      const cropLabels = labels.map((text) => `${text}, ${lineup.crop}x`);
      const cropSheet = await grid(browser, crops, cropLabels, columns, cropSize);
      const file = `${prefix}-${moment.name}-crop${lineup.crop}`;
      await writeFile(`${file}.png`, cropSheet);
      await writeFile(`${file}.webp`, await toWebp(browser, cropSheet));
      console.log(`${file}.png`);
      sheetCells.push(...crops);
      sheetLabels.push(...cropLabels);
    }
  }
  if (lineup.sheet && sheetCells.length > 0) {
    const sheet = await grid(browser, sheetCells, sheetLabels, columns, cropSize);
    await writeFile(`${lineup.sheet}.png`, sheet);
    console.log(`${lineup.sheet}.png`);
  }
}

/**
 * Writes the contact sheets of `--sheet`: one image for each view, as `<prefix>-<view>.png` and
 * `.webp`. The columns are the moments in their order. The top row is the commit of `--base`, and
 * the bottom row is the working tree. Each cell shows the box of `--sheet` at the pixels of the
 * cell, with a label of its row (`base` or `round`), its moment, and its view.
 *
 * @param browser The browser.
 * @param role The views and the moments of the role.
 * @param rows The cells of the commit and of the working tree, each in the order of the grid: the
 *   views of each moment.
 * @param box The box of each cell, as shares of the cell.
 * @param size The size of the cells, in CSS pixels.
 * @param prefix The start of the file paths, such as `out/violist-sheet`.
 * @throws Error if a row has fewer cells than the grid.
 */
async function writeSheets(
  browser: Browser,
  role: RoleViews,
  rows: readonly [base: readonly Buffer[], round: readonly Buffer[]],
  box: CropBox,
  size: CellSize,
  prefix: string,
): Promise<void> {
  const across = role.views.length;
  const cropSize = {
    width: Math.round(box.width * size.width),
    height: Math.round(box.height * size.height),
  };
  const named = [
    ['base', rows[0]],
    ['round', rows[1]],
  ] as const;
  for (const [v, view] of role.views.entries()) {
    const cells: Buffer[] = [];
    const labels: string[] = [];
    for (const [name, own] of named) {
      for (const [m, moment] of role.moments.entries()) {
        const cell = own[m * across + v];
        if (!cell) {
          throw new Error(`The ${name} row has no cell ${moment.name}-${view.name}.`);
        }
        cells.push(cell);
        labels.push(`${name}: ${moment.name}, ${view.name}`);
      }
    }
    const crops = box === WHOLE_CELL ? cells : await cropCells(browser, cells, box);
    const sheet = await grid(browser, crops, labels, role.moments.length, cropSize);
    await writeImage(browser, sheet, `${prefix}-${view.name}`);
  }
}

/**
 * Renders the close view of a role into `<dir>`: each cell as `<role>-<moment>-<view>.png`, and
 * the grid of all cells as `<role>-views.png` and `.webp`. The renders of the commit write each
 * cell of the commit as `<role>-base-<moment>-<view>.png`, and the grid of the commit above the
 * grid of the working tree as `<role>-base-views.png` and `.webp`. Both trees take the camera of
 * `--zoom` and `--elevation` ({@link roleCamera}) and the cell size of `--scale`
 * ({@link roleCell}). Each WebP grid has the cells of {@link CELL}, so that it keeps its byte
 * limit at each scale. Each cell of `--pairs` then gets `<role>-pair-<moment>-<view>.webp`: the
 * crop of `--crop` of the cell of the commit beside the same crop of the working tree
 * ({@link pairImage}). `--sheet` then gives `<role>-sheet-<view>.png` and `.webp` for each view
 * ({@link writeSheets}). A probe of `--probe` renders the cells with the gallery query `probe`,
 * and puts the probe after the role in each file name, such as `timpanist-normals-views.png`. The
 * face crops of `--target head` ({@link headViews}) put `head` after the role, such as
 * `clarinetist-head-views.png`.
 *
 * @param args The command line.
 * @param site The site of the working tree.
 * @param probe The probe of the body, or `null` for none.
 * @returns The renders of the commit.
 */
async function probeViews(
  args: CloseViewsArgs,
  site: TreeSite,
  probe: GalleryProbe | null,
): Promise<CommitRender> {
  const { browser } = site;
  const { out } = args;
  const target = args.target ? `${args.role}-${args.target}` : args.role;
  const name = probe ? `${target}-${probe}` : target;
  const role = roleCamera(ROLE_VIEWS[args.role], args);
  const scale = args.lineup ? Math.max(args.scale, args.lineup.crop) : args.scale;
  const size = roleCell(scale);
  if (args.zoom !== null || args.elevation !== null || scale !== 1) {
    console.log(
      `Camera: zoom ${role.camera.zoom}, ${args.elevation === null ? 'the elevation of each view' : `${args.elevation}°`}, cells of ${size.width} × ${size.height} px.`,
    );
  }
  // The WebP grid keeps the cell size of the factor 1, so that it stays within its byte limit.
  const webp = async (
    png: Buffer,
    cells: readonly Buffer[],
    labels: readonly string[],
  ): Promise<Buffer> =>
    toWebp(browser, scale === 1 ? png : await grid(browser, cells, labels, role.views.length));
  const views = await renderViews(browser, site.base, role, out, `${name}-`, size, probe);
  const sheet = await grid(browser, views.cells, views.labels, role.views.length, size);
  await writeFile(join(out, `${name}-views.png`), sheet);
  await writeFile(join(out, `${name}-views.webp`), await webp(sheet, views.cells, views.labels));
  console.log(join(out, `${name}-views.png`));

  const lineup = args.lineup;
  const rows: LineupRow[] = [{ label: 'working tree', cells: views.cells }];
  for (const other of lineup?.roles ?? []) {
    const own = roleCamera(ROLE_VIEWS[other], { ...args, target: null, moments: null, aim: null });
    const partner = { ...own, moments: role.moments.map((m) => partnerMoment(own, m)) };
    const cells = await renderViews(browser, site.base, partner, out, `${other}-`, size);
    rows.push({ label: `${other}, working tree`, cells: cells.cells });
  }
  if (lineup && args.base === null) {
    await writeLineups(browser, role, rows, lineup, size, join(out, `${name}-lineup`));
  }

  return async (other, label) => {
    const before = await renderViews(browser, other, role, out, `${name}-base-`, size, probe);
    if (args.sheet) {
      const sheetRows = [before.cells, views.cells] as const;
      await writeSheets(browser, role, sheetRows, args.sheet, size, join(out, `${name}-sheet`));
    }
    if (lineup) {
      const all = [{ label, cells: before.cells }, ...rows];
      await writeLineups(browser, role, all, lineup, size, join(out, `${name}-lineup`));
    }
    const cells = [...before.cells, ...views.cells];
    const labels = baseGridLabels(views.labels, label);
    const both = await grid(browser, cells, labels, role.views.length, size);
    await writeFile(join(out, `${name}-base-views.png`), both);
    await writeFile(join(out, `${name}-base-views.webp`), await webp(both, cells, labels));
    console.log(join(out, `${name}-base-views.png`));

    const names = role.moments.flatMap((moment) =>
      role.views.map((view) => `${moment.name}-${view.name}`),
    );
    for (const cell of args.pairs ?? []) {
      const at = names.indexOf(cell);
      const pair = [before.cells[at], views.cells[at]] as const;
      if (!pair[0] || !pair[1]) {
        continue;
      }
      const image = await pairImage(
        browser,
        [pair[0], pair[1]],
        [`${label}: ${cell}`, `working tree: ${cell}`],
        args.crop,
      );
      const file = join(out, `${name}-pair-${cell}.webp`);
      await writeFile(file, await toWebp(browser, image));
      console.log(file);
    }
  };
}

/** The size of the lineup image of one tree, in CSS pixels. */
export const LINEUP = { width: 1440, height: 720 } as const;

/** The angle of the camera of a lineup above the floor, in degrees: low, so the heights compare. */
export const LINEUP_ELEVATION = 4;

/** The floor in front of the models that the camera of a lineup shows for the labels, in meters. */
const LABEL_FLOOR = 0.3;

/** The box of the models of a gallery page on the floor: the attribute `data-row` of its canvas. */
export interface RowBox {
  /** The half width of the models, in meters. */
  readonly halfWidth: number;
  /** The half depth of the models, in meters. */
  readonly halfDepth: number;
  /** The height of the tallest model, in meters. */
  readonly height: number;
}

/** The camera of a lineup, from the front at {@link LINEUP_ELEVATION}. */
interface LineupCamera {
  /** The height of the point that the camera looks at, in meters. */
  readonly target: number;
  /** The distance of the camera from that point, in meters. */
  readonly distance: number;
}

/**
 * Chooses one camera for the lineups of some trees, so that their images compare. The camera
 * shows the tallest model of all trees whole, with 5% of its height above it and the labels on
 * the floor in front of the models. It also shows the widest row whole, with a margin of 5%. It
 * looks at the middle of that height. The front of the row is nearer to the camera than the
 * target, so the distance grows by the half depth of the row.
 *
 * @param boxes The box of the models of each tree, at least one.
 * @param aspect The width of the image divided by its height.
 * @returns The camera, with the distance rounded up to centimeters.
 */
export function lineupCamera(boxes: readonly RowBox[], aspect: number): LineupCamera {
  const height = Math.max(...boxes.map((box) => box.height));
  const halfWidth = Math.max(...boxes.map((box) => box.halfWidth));
  const halfDepth = Math.max(...boxes.map((box) => box.halfDepth));
  const top = height * 1.05;
  const bottom = -LABEL_FLOOR;
  const tan = Math.tan((GALLERY_FOV_DEG * Math.PI) / 360);
  const tall = (top - bottom) / 2 / tan + halfDepth;
  const wide = (halfWidth * 1.05) / (tan * aspect) + halfDepth;
  return {
    target: Math.round(((top + bottom) / 2) * 1000) / 1000,
    distance: Math.ceil(Math.max(tall, wide) * 100) / 100,
  };
}

/**
 * Gives the path of the gallery page of a lineup: the species standing side by side in the rest
 * pose, low from the front.
 *
 * @param species The species, in any order. The page keeps the order of its sections.
 * @param camera The camera, or `null` for the camera that fits the models.
 * @returns The path and the query, from the root of the site.
 */
export function lineupPath(species: readonly SpeciesId[], camera: LineupCamera | null): string {
  const query = new URLSearchParams({
    page: 'species',
    only: species.join(','),
    stand: '',
    rest: '',
    elevation: String(LINEUP_ELEVATION),
  });
  if (camera) {
    query.set('target', String(camera.target));
    query.set('distance', String(camera.distance));
  }
  return `/gallery.html?${query.toString()}`;
}

/** The command line of a lineup. */
interface LineupArgs {
  /** The species of the lineup. */
  readonly species: readonly SpeciesId[];
  /** The output directory. */
  readonly out: string;
  /** The URL of a running site of the working tree, or `null` for the built site. */
  readonly url: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
}

/**
 * Tells if a name is a species.
 *
 * @param name The name.
 * @returns True for a species.
 */
function isSpecies(name: string): name is SpeciesId {
  return Object.keys(SPECIES).includes(name);
}

/**
 * Reads the command line of a lineup: `lineup <species,...> <dir> [--url <url>] [--base <ref>]`.
 *
 * @param args The arguments after the script.
 * @returns The command line, or `null` when it is not a correct lineup.
 */
export function lineupArgs(args: readonly string[]): LineupArgs | null {
  const names = args[1]?.split(',') ?? [];
  const species = names.filter(isSpecies);
  const out = args[2];
  const url = optionValue(args, '--url');
  const base = optionValue(args, '--base');
  if (
    args[0] !== 'lineup' ||
    species.length === 0 ||
    species.length !== names.length ||
    !out ||
    out.startsWith('--') ||
    url === undefined ||
    base === undefined
  ) {
    return null;
  }
  return { species, out, url, base };
}

/**
 * Reads the box of the models of the lineup page of a site, with the camera that fits them.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param species The species.
 * @returns The box.
 * @throws Error if the page writes no box, as a gallery before the query `distance`.
 */
async function rowBox(
  browser: Browser,
  site: string,
  species: readonly SpeciesId[],
): Promise<RowBox> {
  const path = lineupPath(species, null);
  const page = await openShot(browser, new URL(path.slice(1), site).href, {
    file: '',
    path,
    ...LINEUP,
    ready: 'canvas[data-ready="species"]',
  });
  try {
    const row = await page.evaluate(() => {
      const canvas = document.querySelector('#gallery');
      return canvas instanceof HTMLElement ? (canvas.dataset['row'] ?? '') : '';
    });
    const [halfWidth = 0, halfDepth = 0, height = 0] = row.split(' ').map(Number);
    if (!(height > 0)) {
      throw new Error(`The gallery of ${site} writes no box of its models (data-row).`);
    }
    return { halfWidth, halfDepth, height };
  } finally {
    await page.close();
  }
}

/**
 * Renders the lineup page of a site at a camera, with no panel.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param species The species.
 * @param camera The camera.
 * @returns The PNG image.
 */
async function renderLineup(
  browser: Browser,
  site: string,
  species: readonly SpeciesId[],
  camera: LineupCamera,
): Promise<Buffer> {
  const path = lineupPath(species, camera);
  const page = await openShot(browser, new URL(path.slice(1), site).href, {
    file: '',
    path,
    ...LINEUP,
    ready: 'canvas[data-ready="species"]',
  });
  try {
    await page.addStyleTag({ content: '#controls { display: none; }' });
    // The idle motion needs a few frames.
    await page.waitForTimeout(300);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * Writes a PNG image and its WebP image, and warns when the WebP image is larger than
 * {@link MAX_WEBP_BYTES} at the lowest quality of `toWebp()`.
 *
 * @param browser The browser that encodes the WebP image.
 * @param image The PNG image.
 * @param file The path with no extension.
 */
async function writeImage(browser: Browser, image: Buffer, file: string): Promise<void> {
  await writeFile(`${file}.png`, image);
  const webp = await toWebp(browser, image);
  await writeFile(`${file}.webp`, webp);
  console.log(`${file}.png`);
  if (webp.byteLength > MAX_WEBP_BYTES) {
    console.warn(
      `${file}.webp has ${webp.byteLength} B, more than ${MAX_WEBP_BYTES} B at the lowest quality.`,
    );
  }
}

/**
 * Renders a lineup of species of the working tree into `<dir>/lineup.png` and `.webp`. With
 * `--base`, the working tree only gives the box of its models, and the renders of the commit
 * write both lineups. The build of the commit takes the gallery of the working tree when the two
 * galleries differ (the overlay `src/gallery` of {@link modeRender}). The renders of the commit read the box of the models of
 * the commit. One camera ({@link lineupCamera}) then shows the tallest model of both whole. They
 * write the lineup of the working tree, the lineup of the commit as `lineup-base.png`, and the
 * lineup of the commit above the lineup of the working tree as `lineup-base-views.png` and
 * `.webp`.
 *
 * @param args The command line.
 * @param site The site of the working tree.
 * @returns The renders of the commit.
 */
async function lineupViews(args: LineupArgs, site: TreeSite): Promise<CommitRender> {
  const { browser } = site;
  const aspect = LINEUP.width / LINEUP.height;
  const tree = await rowBox(browser, site.base, args.species);
  const say = (camera: LineupCamera): void => {
    console.log(
      `Lineup camera: target ${camera.target} m, distance ${camera.distance} m, elevation ${LINEUP_ELEVATION} degrees.`,
    );
  };
  if (args.base === null) {
    const camera = lineupCamera([tree], aspect);
    say(camera);
    const image = await renderLineup(browser, site.base, args.species, camera);
    await writeImage(browser, image, join(args.out, 'lineup'));
  }

  return async (other, label) => {
    const camera = lineupCamera([tree, await rowBox(browser, other, args.species)], aspect);
    say(camera);
    const after = await renderLineup(browser, site.base, args.species, camera);
    const before = await renderLineup(browser, other, args.species, camera);
    await writeImage(browser, after, join(args.out, 'lineup'));
    await writeFile(join(args.out, 'lineup-base.png'), before);
    const labels = baseGridLabels(['lineup'], label);
    const sheet = await grid(browser, [before, after], labels, 1, LINEUP);
    await writeImage(browser, sheet, join(args.out, 'lineup-base-views'));
  };
}

/** The command line of a mode after its name: its words and the values of its options. */
interface ModeLine {
  /** The arguments that are not options or values of options, in their order. */
  readonly words: readonly string[];
  /** The values of each option that the command line gives, in their order. */
  readonly options: ReadonlyMap<string, readonly string[]>;
  /** The options with no value that the command line gives. */
  readonly flags: ReadonlySet<string>;
}

/**
 * Splits the command line of a mode into its words and its options. Each option takes one value,
 * and a flag takes none. A value can start with one `-`, such as the drag `-120,40,3`, but not
 * with `--`.
 *
 * @param args The arguments after the name of the mode.
 * @param known The options of the mode with a value, such as `--url`.
 * @param repeated The options of the mode that can come more than one time.
 * @param flags The options of the mode with no value, such as `--lineup`.
 * @returns The words, the options, and the flags.
 * @throws Error for an option that the mode does not know, an option with no value, or an option
 *   or a flag that comes two times and cannot repeat.
 */
function modeLine(
  args: readonly string[],
  known: readonly string[],
  repeated: readonly string[] = [],
  flags: readonly string[] = [],
): ModeLine {
  const words: string[] = [];
  const options = new Map<string, string[]>();
  const given = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('--')) {
      words.push(arg);
      continue;
    }

    if (flags.includes(arg)) {
      if (given.has(arg)) {
        throw new Error(`The option ${arg} comes two times.`);
      }
      given.add(arg);
      continue;
    }
    if (!known.includes(arg)) {
      const names = [...known, ...flags].join(', ');
      throw new Error(`The option ${arg} is not known. The options are: ${names}.`);
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option ${arg} has no value.`);
    }
    const values = options.get(arg) ?? [];
    if (values.length > 0 && !repeated.includes(arg)) {
      throw new Error(`The option ${arg} comes two times.`);
    }
    values.push(value);
    options.set(arg, values);
    i++;
  }
  return { words, options, flags: given };
}

/**
 * Finds a moment of a role by its name. A name `lift<n>` or `lower<n>` that the role does not have,
 * with `<n>` from 0 to 100, gives the share n / 100 of that move at the time of the moves of the
 * role ({@link halfMoves}), so that `--moments` shows a whole move in steps.
 *
 * @param role The close view of the role.
 * @param name The name of the moment.
 * @returns The moment.
 * @throws Error if the role has no moment of the name and the name is no share of a move of the
 *   role.
 */
function roleMoment(role: RoleViews, name: string): CloseMoment {
  const own = role.moments.find((moment) => moment.name === name);
  const found = /^(lift|lower)(\d{1,3})$/.exec(name);
  const moves = role.moments.find((moment) => moment.move);
  const share = Number(found?.[2]);
  if (own || !found || !moves || share > 100) {
    return own ?? namedItem(name, role.moments, 'moment');
  }
  const kind = found[1] === 'lift' ? 'lift' : 'lower';
  return { name, time: moves.time, rest: false, move: { kind, share: share / 100 } };
}

/**
 * Gives the item of a list that has a name.
 *
 * @param name The name from the command line.
 * @param items The items, each with its name.
 * @param kind The kind of the items in the message, such as `view`.
 * @returns The item.
 * @throws Error that lists the names of the items, for a name that no item has.
 */
function namedItem<T extends { readonly name: string }>(
  name: string,
  items: readonly T[],
  kind: string,
): T {
  const item = items.find((candidate) => candidate.name === name);
  if (!item) {
    const names = items.map((candidate) => candidate.name).join(', ');
    throw new Error(`The ${kind} "${name}" is not known. The correct names are: ${names}.`);
  }
  return item;
}

/**
 * The views of the mode `species`, around the body of the animal (the gallery query `body`). The
 * azimuth turns the camera to the right side of the animal, from its front at 0°. The views from
 * the sides are low (3°), so that the knees, the seat, and the soles show from the side. The views
 * from the front and the back are a little higher (10°), so that the lap shows. `side` and
 * `front35` look from the right side and from 35° to the right of the front. `front60` is the view
 * of the check of the face of a mesh from the front and at 60° (`docs/agents/rigging.md`, "Head and
 * colors"). `above35` looks down 35° from the front, as the default view of the stage looks down at
 * the players that face it. `back150` and `back-150` look from behind and 30° to each side, as the
 * camera of the stage looks at the players from behind and above (`docs/agents/workflow.md`,
 * "Images of a mesh").
 */
const SPECIES_VIEWS: readonly CloseViewAngle[] = [
  { name: 'front', azimuth: 0, elevation: 10 },
  { name: 'front35', azimuth: 35, elevation: 10 },
  { name: 'front60', azimuth: 60, elevation: 10 },
  { name: 'left', azimuth: -90, elevation: 3 },
  { name: 'side', azimuth: 90, elevation: 3 },
  { name: 'back', azimuth: 180, elevation: 10 },
  { name: 'back150', azimuth: 150, elevation: 10 },
  { name: 'back-150', azimuth: -150, elevation: 10 },
  { name: 'above35', azimuth: 0, elevation: 35 },
];

/** The views of the mode `species` with no `--views`. */
const DEFAULT_SPECIES_VIEWS: readonly string[] = ['side', 'front35'];

/**
 * The moments of the mode `species`: `play`, the playing pose at the time 0 of the default test
 * notes of the gallery, and `rest`, the rest pose of design 5.2 (the gallery query `rest`).
 */
const SPECIES_MOMENTS: readonly CloseMoment[] = [
  { name: 'play', time: 0, rest: false },
  { name: 'rest', time: 0, rest: true },
];

/** The names of the moves of the mode `species` with a share in percent, such as `lift50`. */
const MOVE_MOMENT = /^(lift|lower)(0|[1-9]\d?|100)$/;

/**
 * Reads a moment of the mode `species`: a name of {@link SPECIES_MOMENTS}, or a point of a move
 * of the instruments at the time 0 of the default test notes (design 5.2). `lift<p>` is the lift
 * from the rest pose to the playing pose at the whole percent `p` of its time, from 0 to 100, and
 * `lower<p>` is the lowering back. Thus `lift0` and `lower100` show the rest pose, and `lift100`
 * and `lower0` the playing pose.
 *
 * @param name The name of the moment, such as `play` or `lift33`.
 * @returns The moment.
 * @throws Error that lists the correct names, for a name that is not a moment.
 */
function speciesMoment(name: string): CloseMoment {
  const named = SPECIES_MOMENTS.find((moment) => moment.name === name);
  if (named) {
    return named;
  }
  const match = MOVE_MOMENT.exec(name);
  if (match?.[1] === 'lift' || match?.[1] === 'lower') {
    const share = Number(match[2]) / 100;
    return { name, time: 0, rest: false, move: { kind: match[1], share } };
  }
  const names = SPECIES_MOMENTS.map((moment) => moment.name).join(', ');
  throw new Error(
    `The moment "${name}" is not known. The correct names are: ${names}, lift<p>, and lower<p>, with a whole percent p from 0 to 100, such as lift50.`,
  );
}

/**
 * The camera of the mode `species` with no `--zoom`: around the body of the animal, which shows
 * whole. Each view gives its own elevation.
 */
const SPECIES_CAMERA: BodyCamera = { kind: 'body', zoom: 1, elevation: 10 };

/**
 * The largest elevation of `--elevation`, in degrees: the gallery limits the elevation of a close
 * view to 0° to 89° (`closeView()` of `src/gallery/items.ts`).
 */
const MAX_ELEVATION = 89;

/** The command line of the mode `species`. */
interface SpeciesArgs {
  /** The species, one row of the grid each. */
  readonly species: readonly SpeciesId[];
  /** The views, one column of the grid each. */
  readonly views: readonly CloseViewAngle[];
  /** The moment of all cells. */
  readonly moment: CloseMoment;
  /**
   * The zoom of the camera around the body (`--zoom`), 1 or more: 1 shows the whole body, and 3
   * shows the middle third of its box, such as the armpits and the lap of a seated player.
   */
  readonly zoom: number;
  /**
   * The angle of the camera above the floor of all views (`--elevation`), in degrees, or `null`
   * for the elevation of each view of {@link SPECIES_VIEWS}.
   */
  readonly elevation: number | null;
  /** The output directory. */
  readonly out: string;
  /** The URL of a running site of the working tree, or `null` for the built site. */
  readonly url: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
}

/**
 * Reads the zoom of `--zoom`.
 *
 * @param value The text of the option, or `undefined` with no option.
 * @returns The zoom: 1 with no option.
 * @throws Error if the zoom is not a number of 1 or more.
 */
function zoomOf(value: string | undefined): number {
  if (value === undefined) {
    return 1;
  }
  const zoom = Number(value);
  if (!Number.isFinite(zoom) || zoom < 1) {
    throw new Error(
      `The option --zoom takes a number of 1 or more, such as 3, and not "${value}".`,
    );
  }
  return zoom;
}

/**
 * Reads the point of `--aim`: the x and the z of the vertical line of a line camera, and the
 * height of the point that it looks at, in meters, such as `0.36,-0.1,1.2` for the left wrist of
 * the conductor.
 *
 * @param value The text of the option, or `undefined` with no option.
 * @returns The point, or `null` with no option.
 * @throws Error if the text is not three numbers.
 */
function aimOf(value: string | undefined): LineAim | null {
  if (value === undefined) {
    return null;
  }
  const numbers = value.split(',').map(Number);
  const [x, z, target] = numbers;
  if (
    numbers.length !== 3 ||
    x === undefined ||
    z === undefined ||
    target === undefined ||
    !numbers.every(Number.isFinite)
  ) {
    throw new Error(
      `The option --aim takes the x, the z, and the height in meters, such as 0.36,-0.1,1.2, and not "${value}".`,
    );
  }
  return { x, z, target };
}

/**
 * Reads the elevation of `--elevation`.
 *
 * @param value The text of the option, or `undefined` with no option.
 * @returns The elevation in degrees, or `null` with no option.
 * @throws Error if the elevation is not a number from 0 to {@link MAX_ELEVATION}.
 */
function elevationOf(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const elevation = Number(value);
  if (!Number.isFinite(elevation) || elevation < 0 || elevation > MAX_ELEVATION) {
    throw new Error(
      `The option --elevation takes a number of degrees from 0 to ${MAX_ELEVATION}, and not "${value}".`,
    );
  }
  return elevation;
}

/**
 * Gives the species of the species page of the gallery, in the order of the page.
 *
 * @returns The species, each one time.
 */
function gallerySpecies(): SpeciesId[] {
  return [...new Set(speciesItems().map((item) => item.species))];
}

/**
 * Reads the command line of the mode `species`:
 * `species <species,...> <dir> [--views <view,...>] [--moment <play|rest|lift<p>|lower<p>>] [--zoom <n>] [--elevation <deg>] [--url <url>] [--base <ref>]`.
 *
 * @param args The arguments after the script.
 * @returns The command line, or `null` when the first argument is not `species`.
 * @throws Error that lists the correct names, for an unknown species, view, or moment, and an
 *   error for a wrong option, a zoom or an elevation that does not fit, or a missing word.
 */
function speciesArgs(args: readonly string[]): SpeciesArgs | null {
  if (args[0] !== 'species') {
    return null;
  }
  const line = modeLine(args.slice(1), [
    '--views',
    '--moment',
    '--zoom',
    '--elevation',
    '--url',
    '--base',
  ]);
  const [names, out, ...extra] = line.words;
  if (!names || !out || extra.length > 0) {
    throw new Error(
      'The mode species takes a list of species and an output directory, such as: species fox-red,rabbit scratch/views',
    );
  }

  const known = gallerySpecies().map((name) => ({ name }));
  const species = names.split(',').map((name) => namedItem(name, known, 'species').name);
  const viewNames = line.options.get('--views')?.[0]?.split(',') ?? DEFAULT_SPECIES_VIEWS;
  const views = viewNames.map((name) => namedItem(name, SPECIES_VIEWS, 'view'));
  const moment = speciesMoment(line.options.get('--moment')?.[0] ?? 'play');
  const zoom = zoomOf(line.options.get('--zoom')?.[0]);
  const elevation = elevationOf(line.options.get('--elevation')?.[0]);
  const url = line.options.get('--url')?.[0] ?? null;
  const base = line.options.get('--base')?.[0] ?? null;
  return { species, views, moment, zoom, elevation, out, url, base };
}

/**
 * Gives the close view of one species of the mode `species`: the species on the support of its
 * instrument, alone, at the views and the moment of the command line, with the default test notes
 * of the gallery. The camera turns around the middle of the box of the body. `--zoom` takes it
 * nearer to that middle, and `--elevation` gives each view one angle above the floor. A species
 * with several instruments, as the badger of the percussion, shows with the first of them.
 *
 * @param species The species.
 * @param args The command line.
 * @returns The views, the moment, and the camera.
 */
function speciesRole(species: SpeciesId, args: SpeciesArgs): RoleViews {
  const { elevation } = args;
  const items = speciesItems().filter((item) => item.species === species);
  const role: RoleViews = {
    species,
    views: elevation === null ? args.views : args.views.map((view) => ({ ...view, elevation })),
    moments: [args.moment],
    camera: { ...SPECIES_CAMERA, zoom: args.zoom },
    notes: null,
  };
  const [first] = items;
  return items.length > 1 && first ? { ...role, instrument: first.instrument } : role;
}

/**
 * Writes the camera of the mode `species` for the labels, when the command line changes it.
 *
 * @param args The command line.
 * @returns The text, such as `, zoom 3, 20°`, or empty with no `--zoom` and no `--elevation`.
 */
function speciesCameraText(args: Pick<SpeciesArgs, 'zoom' | 'elevation'>): string {
  const zoom = args.zoom === 1 ? '' : `, zoom ${args.zoom}`;
  const elevation = args.elevation === null ? '' : `, ${args.elevation}°`;
  return `${zoom}${elevation}`;
}

/**
 * Puts the rows of a grid of a commit and of a grid of the working tree in turns: each row of the
 * commit comes directly above the same row of the working tree.
 *
 * @param before The cells of the commit, row by row.
 * @param after The cells of the working tree, row by row, as many as `before`.
 * @param columns The number of columns.
 * @returns The cells of both grids, row by row.
 */
function rowsInTurns<T>(before: readonly T[], after: readonly T[], columns: number): T[] {
  const cells: T[] = [];
  for (let start = 0; start < after.length; start += columns) {
    cells.push(...before.slice(start, start + columns), ...after.slice(start, start + columns));
  }
  return cells;
}

/**
 * Renders the cells of the mode `species` on one site: one row for each species, one column for
 * each view. It writes each cell as `<prefix><species>-<moment>-<view>.png`.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param args The command line.
 * @param prefix The start of the file names, such as `species-`.
 * @returns The cells and their labels, row by row.
 */
async function renderSpecies(
  browser: Browser,
  site: string,
  args: SpeciesArgs,
  prefix: string,
): Promise<RenderedViews> {
  const cells: Buffer[] = [];
  const labels: string[] = [];
  for (const species of args.species) {
    const views = await renderViews(
      browser,
      site,
      speciesRole(species, args),
      args.out,
      `${prefix}${species}-`,
    );
    cells.push(...views.cells);
    labels.push(...views.labels.map((label) => `${species}, ${label}${speciesCameraText(args)}`));
  }
  return { cells, labels };
}

/**
 * Renders the mode `species` into `<dir>`: each species of the gallery alone on its support, at
 * each view, as `species-views.png` and `.webp`. The renders of the commit write each cell of the
 * commit as `species-base-<species>-<moment>-<view>.png`. The grid `species-base-views.png` and
 * `.webp` then puts the row of the commit above the row of the working tree for each species.
 *
 * @param args The command line.
 * @param site The site of the working tree.
 * @returns The renders of the commit.
 */
async function speciesViews(args: SpeciesArgs, site: TreeSite): Promise<CommitRender> {
  const { browser } = site;
  const columns = args.views.length;
  const after = await renderSpecies(browser, site.base, args, 'species-');
  const sheet = await grid(browser, after.cells, after.labels, columns);
  await writeImage(browser, sheet, join(args.out, 'species-views'));

  return async (other, label) => {
    const before = await renderSpecies(browser, other, args, 'species-base-');
    const labels = baseGridLabels(after.labels, label);
    const cells = rowsInTurns(before.cells, after.cells, columns);
    const turns = rowsInTurns(
      labels.slice(0, after.labels.length),
      labels.slice(after.labels.length),
      columns,
    );
    const both = await grid(browser, cells, turns, columns);
    await writeImage(browser, both, join(args.out, 'species-base-views'));
  };
}

/**
 * A camera of the mode `play`: a drag across the stage and wheel steps of the orbit controls
 * after "Reset view" (design 2.5), as a person moves it with the pointer and the wheel. A drag of
 * the height of the canvas turns the camera 360° (the rotate speed 1 of the orbit controls).
 */
interface PlayCamera {
  /**
   * The name of the camera in the file names and the labels: a label of `--camera-file`, or a name
   * from the camera.
   */
  readonly name: string;
  /** The drag to the right, in CSS pixels. A drag to the right moves the camera to the left. */
  readonly dx: number;
  /** The drag down, in CSS pixels. A drag up moves the camera lower. */
  readonly dy: number;
  /** The wheel steps of -100 pixels, each a zoom in. A negative count zooms out. */
  readonly wheel: number;
  /** The view of the camera at one player of `--at` ({@link aimPose}), or none. */
  readonly aim?: AimView;
  /** The fixed camera of a camera in JSON ({@link jsonCamera}), or none. */
  readonly pose?: CameraPose;
}

/** The view of a camera of `--at` at one player of the demo. */
interface AimView {
  /**
   * The turn of the camera to the right side of the player, in degrees. 0 is the front of the
   * player, as in a close view of the gallery.
   */
  readonly azimuth: number;
  /** The angle of the camera above the floor, in degrees. */
  readonly elevation: number;
  /** The zoom, above 0: 1 shows the whole body, and 0.5 also the players around it. */
  readonly zoom: number;
}

/**
 * The elevation of `--at` with no `--elevation`, in degrees. At 10°, as in the mode `species`, the
 * players in front of the elephant timpanist hid most of its body.
 */
export const AIM_ELEVATION = 20;

/**
 * Gives the camera of `--at` at one player: it looks at the middle of the box of the body from
 * the azimuth and the elevation of the view. At the zoom 1, the sphere around the box fills the
 * height of the field of view of the stage (`FIELD_OF_VIEW` of `src/shots/view.ts`). The player
 * faces -z in the axes of its model, and turns by its facing around y on the stage.
 *
 * @param place The position and the facing of the player on the stage.
 * @param box The box of the body, in the axes of the model (`bodyBoundsOf()`).
 * @param view The view.
 * @returns The camera, as `follow()` of `StageCamera` takes it. The scene sets the beam and the
 *   light of a free camera itself, so these values do nothing.
 */
export function aimPose(
  place: Pick<PlayerPlace, 'position' | 'facing'>,
  box: Bounds,
  view: AimView,
): CameraPose {
  const middle = (k: 0 | 1 | 2): number => (box.min[k] + box.max[k]) / 2;
  const cos = Math.cos(place.facing);
  const sin = Math.sin(place.facing);
  const target: Vec3 = [
    place.position[0] + middle(0) * cos + middle(2) * sin,
    place.position[1] + middle(1),
    place.position[2] - middle(0) * sin + middle(2) * cos,
  ];

  const size = [0, 1, 2].map((k) => (box.max[k] ?? 0) - (box.min[k] ?? 0));
  const radius = Math.hypot(...size) / 2;
  const distance = radius / Math.sin((FIELD_OF_VIEW * Math.PI) / 360) / view.zoom;
  const azimuth = (view.azimuth * Math.PI) / 180 - place.facing;
  const elevation = (view.elevation * Math.PI) / 180;
  const flat = distance * Math.cos(elevation);
  const position: Vec3 = [
    target[0] + flat * Math.sin(azimuth),
    target[1] + distance * Math.sin(elevation),
    target[2] - flat * Math.cos(azimuth),
  ];
  return { position, target, fov: FIELD_OF_VIEW, beam: 1, close: false, light: 0, spot: 0 };
}

/**
 * The named cameras of the mode `play`:
 *
 * - `default`: the default view of "Reset view", as the play frame of `pnpm snapshot`.
 * - `violins`: low from the front left, close to the first and the second violins, with the back
 *   of the conductor on the right. The drag up of 60 px puts the camera at the lowest elevation
 *   of the orbit limits (10°).
 * - `orchestra`: the default view, a little lower and closer, so that the stage fills the frame
 *   as in `orchestra-latest.png`. `pnpm look-lab` measures its regions against that image.
 */
const PLAY_CAMERAS: readonly PlayCamera[] = [
  { name: 'default', dx: 0, dy: 0, wheel: 0 },
  { name: 'violins', dx: 45, dy: -60, wheel: 12 },
  { name: 'orchestra', dx: 0, dy: -15, wheel: 5 },
];

/** The song time of the play frame with no `--time`, in seconds, as `pnpm screenshots --play`. */
const PLAY_TIME_SEC = 6;

/**
 * The size of a play frame with no `--size`, in CSS pixels: the size of the reference images of
 * the scene.
 */
export const PLAY_FRAME = { width: 1440, height: 900 } as const;

/** The smallest and the largest side of a play frame of `--size`, in CSS pixels. */
const PLAY_SIZE_RANGE = [320, 4096] as const;

/**
 * Reads the size of the play frames of `--size`, such as `2022x1076`, to render the window of a
 * given screenshot. The landscape rule and the portrait rule of the camera follow the aspect
 * (design 4.5), and a short side below 600 px gives the low tier (design 2.6).
 *
 * @param text The size: the width, `x`, and the height, in CSS pixels.
 * @returns The size.
 * @throws Error for a text that is not a size, or a side outside {@link PLAY_SIZE_RANGE}.
 */
function playSize(text: string): CellSize {
  const match = /^(\d+)x(\d+)$/.exec(text);
  const [low, high] = PLAY_SIZE_RANGE;
  const sides = match ? [Number(match[1]), Number(match[2])] : [];
  const [width = 0, height = 0] = sides;
  if (!match || sides.some((side) => side < low || side > high)) {
    throw new Error(
      `The size "${text}" is not a frame size, such as 2022x1076. Each side is from ${low} to ${high} px.`,
    );
  }
  return { width, height };
}

/** The size of one cell of a grid, in CSS pixels. */
interface CellSize {
  /** The width. */
  readonly width: number;
  /** The height. */
  readonly height: number;
}

/**
 * Gives the size of a play frame in the grid of the mode `play`: two thirds of the frame for one
 * or two cameras, and smaller for more cameras, so that the grid is at most 1920 px wide. A grid
 * of two cameras with `--base` then gives a WebP file of about 260 kB, below
 * {@link MAX_WEBP_BYTES}.
 *
 * @param columns The number of cameras.
 * @param frame The size of a play frame, in CSS pixels.
 * @returns The size of one cell, in CSS pixels.
 */
function playCell(columns: number, frame: CellSize = PLAY_FRAME): CellSize {
  const scale = Math.min(2 / 3, 4 / 3 / Math.max(1, columns));
  return {
    width: Math.round(frame.width * scale),
    height: Math.round(frame.height * scale),
  };
}

/** The point where the drag of a camera starts, in CSS pixels: on the stage. */
const DRAG_START = { x: 720, y: 400 } as const;

/**
 * The time of play from the seek to the play frame, in seconds. It is longer than the time after
 * which the bar hides (design 2.3), so the frame shows the scene only.
 */
const SEEK_LEAD_SEC = BAR_HIDE_SEC + 1;

/**
 * The camera of `--cinematic`: the camera of the shot plan of the app at the song time (Cinematic
 * mode, design 2.5, 5.6), with no "Reset view", no drag, and no wheel.
 */
const CINEMATIC_CAMERA: PlayCamera = { name: 'cinematic', dx: 0, dy: 0, wheel: 0 };

/**
 * The subject of `--shot` and `--at`: a seat of the score, or each seat of a species, or of a
 * species with one instrument.
 */
type ShotSubject =
  | {
      /** A seat. */
      readonly kind: 'seat';
      /** The index of the seat in `Score.seats`. */
      readonly seat: number;
    }
  | {
      /** Each seat whose players are of a species. */
      readonly kind: 'species';
      /** The species. */
      readonly species: SpeciesId;
      /**
       * The instrument of the players, or `null` for each instrument. The badger plays five
       * percussion instruments in one seat, so `badger:cymbals` selects one of its players.
       */
      readonly instrument: InstrumentId | null;
    };

/**
 * Gives the name of a subject in the names of the cameras and the files, such as `seat4`,
 * `hippo`, or `badger-cymbals`.
 *
 * @param subject The subject.
 * @returns The name.
 */
export function subjectName(subject: ShotSubject): string {
  if (subject.kind === 'seat') {
    return `seat${subject.seat}`;
  }
  return subject.instrument === null ? subject.species : `${subject.species}-${subject.instrument}`;
}

/**
 * Tells if a player is a player of a subject.
 *
 * @param subject The subject.
 * @param cast The cast of the player.
 * @returns True for a player of the seat, or of the species with the instrument of the subject.
 */
function isSubjectPlayer(subject: ShotSubject, cast: PlayerPlace['cast']): boolean {
  if (subject.kind === 'seat') {
    return cast.seatIndex === subject.seat;
  }
  return (
    cast.species === subject.species &&
    (subject.instrument === null || cast.instrument === subject.instrument)
  );
}

/** The time of the frames of the mode `play`. */
type PlayTime =
  | {
      /** A song time of `--time`, or {@link PLAY_TIME_SEC}. */
      readonly kind: 'song';
      /**
       * The song time, in seconds: at least {@link SEEK_LEAD_SEC}, and before the end of the
       * demo.
       */
      readonly sec: number;
    }
  | {
      /** The frame of the first solo or section shot of a subject (`--shot`). */
      readonly kind: 'shot';
      /** The subject. */
      readonly subject: ShotSubject;
    };

/** The command line of the mode `play`. */
interface PlayArgs {
  /** The demo, or the default demo with `--midi`. */
  readonly demo: DemoId;
  /**
   * The absolute path of the MIDI file of the user of `--midi`, or `null` for the demo. The page
   * opens the file with its file input, as a user does, so the file stays outside the repository.
   */
  readonly midi: string | null;
  /** The time of the frames. */
  readonly time: PlayTime;
  /**
   * The song times of the other `--time` values, in seconds, in their order. With more than one
   * time, each time renders into a folder of its own ({@link playTimeDir}) on the same builds
   * ({@link playParts}).
   */
  readonly otherTimes: readonly number[];
  /** The cameras, one frame each. In Cinematic mode, one camera with no drag and no wheel. */
  readonly cameras: readonly PlayCamera[];
  /** The size of the frames, in CSS pixels: the size of `--size`, or {@link PLAY_FRAME}. */
  readonly frame: CellSize;
  /**
   * True in Cinematic mode (`--cinematic` or `--shot`): the shots of the app move the camera, and
   * the tool clicks no "Reset view".
   */
  readonly cinematic: boolean;
  /** The output directory. */
  readonly out: string;
  /** The URL of a running site of the working tree, or `null` for the built site. */
  readonly url: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
  /** The player of `--at`, whose cameras have an {@link AimView}, or `null`. */
  readonly at: ShotSubject | null;
  /**
   * The hold changes of each `--set` (`setHolds()` of `tools/hold-sets.ts`) for the working tree,
   * or none. The changes also move the player of `--at`, such as larger kettles.
   */
  readonly holds: readonly string[];
  /**
   * The index in {@link PlayArgs.holds} of the variant of this part, when one build renders more
   * than one `--set` ({@link playParts}), or `null`.
   */
  readonly holdsIndex: number | null;
  /**
   * The song times of the frames of `--strip`, in seconds, in their order, or `null` for the
   * frames of a seek. A strip freezes the song time of the page ({@link freezePlugin}).
   */
  readonly strip: readonly number[] | null;
  /**
   * True for `--pause`: the tool pauses the play at the time of the frame, and waits for the hold
   * and the slowest lowering, so that the frame shows the rest pose in the stage light (design
   * 5.2) ({@link pauseFrame}).
   */
  readonly pause: boolean;
}

/** The fields of a camera in JSON of the command line ({@link jsonCamera}), before the checks. */
interface CameraJson {
  /** The position of the camera, in meters. */
  readonly position?: readonly number[];
  /** The point that the camera looks at, in meters. */
  readonly target?: readonly number[];
  /** The vertical field of view, in degrees. */
  readonly fov?: number;
}

/**
 * Reads a camera in JSON: `{"position":[x,y,z],"target":[x,y,z],"fov":<deg>}` in the axes of the
 * stage, in meters, with no `fov` for the field of view of the stage (`FIELD_OF_VIEW`). The stage
 * camera of the build follows it in each frame, as the camera of `--at` ({@link aimPlugin}). The
 * name of the camera is `pose-` and the first 6 hex digits of the SHA-256 of the text. A camera of
 * `--camera-file` takes its label in place of that name ({@link cameraFile}).
 *
 * @param text The JSON text.
 * @returns The camera.
 * @throws Error for a text that is not such an object.
 */
function jsonCamera(text: string): PlayCamera {
  let parsed: CameraJson | null = null;
  try {
    // SAFETY: the text comes from the command line, and the checks below read each field.
    parsed = JSON.parse(text) as CameraJson | null;
  } catch {
    parsed = null;
  }
  const point = (found: readonly number[] | undefined): Vec3 | null => {
    if (!Array.isArray(found) || found.length !== 3 || !found.every(Number.isFinite)) {
      return null;
    }
    const [x = 0, y = 0, z = 0] = found;
    return [x, y, z];
  };
  const position = point(parsed?.position);
  const target = point(parsed?.target);
  const fov = parsed?.fov ?? FIELD_OF_VIEW;
  if (!position || !target || !Number.isFinite(fov) || !(fov > 1 && fov < 170)) {
    throw new Error(
      `The camera "${text}" is not a camera in JSON, such as {"position":[0,3,9],"target":[0,1,0],"fov":40}: a position and a target of 3 numbers each in meters, and a field of view from 1° to 170°.`,
    );
  }
  const name = `pose-${createHash('sha256').update(text).digest('hex').slice(0, 6)}`;
  const pose = { position, target, fov, beam: 1, close: false, light: 0, spot: 0 };
  return { name, dx: 0, dy: 0, wheel: 0, pose };
}

/**
 * Clicks "Reset view" (design 2.5). A phone layout keeps the button in the group "Playback" of the
 * tab "Settings" of the drawer (design 2.8), so the click opens the drawer there first, and
 * closes it after.
 *
 * @param page The page, during play.
 */
async function resetView(page: Page): Promise<void> {
  const reset = page.getByRole('button', { name: 'Reset view' });
  if (await reset.isVisible()) {
    await reset.click();
    return;
  }
  await openDrawer(page);
  await page.click('#tab-settings');
  await reset.click();
  await page.click('.close-drawer');
}

/**
 * Reads a camera of the command line: a name of {@link PLAY_CAMERAS}, `<dx>,<dy>,<wheel>` with
 * the drag in CSS pixels and a whole number of wheel steps, or a camera in JSON
 * ({@link jsonCamera}). The name of a drag camera is `drag<dx>_<dy>_<wheel>`.
 *
 * @param text The camera.
 * @returns The camera.
 * @throws Error that lists the names of the cameras, for a text that is not a camera.
 */
function playCamera(text: string): PlayCamera {
  if (text.trimStart().startsWith('{')) {
    return jsonCamera(text);
  }
  const drag = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+)$/.exec(text);
  if (drag) {
    const [dx, dy, wheel] = [Number(drag[1]), Number(drag[2]), Number(drag[3])];
    return { name: `drag${dx}_${dy}_${wheel}`, dx, dy, wheel };
  }
  const named = PLAY_CAMERAS.find((camera) => camera.name === text);
  if (named) {
    return named;
  }
  const names = PLAY_CAMERAS.map((camera) => camera.name).join(', ');
  throw new Error(
    `The camera "${text}" is not known. The correct names are: ${names}. A camera can also be <dx>,<dy>,<wheel>, such as 45,-60,12, or JSON, such as {"position":[0,3,9],"target":[0,1,0]}.`,
  );
}

/** The form of a label of `--camera-file`: a part of a file name. */
const CAMERA_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Reads the cameras of `--camera-file <json>`: a JSON object that maps a label to a camera of
 * `--camera` ({@link playCamera}). A camera is a text, such as `violins` or `45,-60,12`, or an
 * object of a camera in JSON ({@link jsonCamera}). Each camera takes its label as its name, so the
 * file of each frame and the label of each cell name it, such as `play-knee-R-az60.png`.
 *
 * @param path The path of the file.
 * @returns The cameras, in the order of the file.
 * @throws Error that names the file, if it cannot be read, holds no object with a camera, has a
 *   label that is not a part of a file name, or has a camera that {@link playCamera} refuses.
 */
function cameraFile(path: string): PlayCamera[] {
  let parsed: Readonly<Record<string, string | CameraJson>> | null = null;
  try {
    // SAFETY: the file comes from the command line, and the checks below read each entry.
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Readonly<
      Record<string, string | CameraJson>
    > | null;
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`The camera file ${path} cannot be read as JSON: ${cause}`, { cause: error });
  }
  const entries = parsed instanceof Object && !Array.isArray(parsed) ? Object.entries(parsed) : [];
  if (entries.length === 0) {
    throw new Error(
      `The camera file ${path} holds no JSON object of labels and cameras, such as {"knee-R-az60":{"position":[-2.7,0.1,1.6],"target":[-3.7,0.3,1.5],"fov":30},"wide":"orchestra"}.`,
    );
  }

  const cameras: PlayCamera[] = [];
  for (const [label, value] of entries) {
    if (!CAMERA_LABEL.test(label)) {
      throw new Error(
        `The label "${label}" of the camera file ${path} is not a part of a file name. A label has letters, digits, ".", "_", and "-", and starts with a letter or a digit.`,
      );
    }
    const text = value instanceof Object ? JSON.stringify(value) : String(value);
    let camera: PlayCamera;
    try {
      camera = playCamera(text);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(`The camera "${label}" of the camera file ${path} is wrong. ${cause}`, {
        cause: error,
      });
    }
    cameras.push({ ...camera, name: label });
  }
  return cameras;
}

/**
 * Names the piece of the mode `play` in the messages: `demo <id>`, or `file <name>` for the file
 * of `--midi`.
 *
 * @param demo The demo.
 * @param midi The path of the file of `--midi`, or `null`.
 * @returns The text, such as `demo beethoven-9`.
 */
function pieceText(demo: DemoId, midi: string | null): string {
  return midi === null ? `demo ${demo}` : `file ${basename(midi)}`;
}

/**
 * Names the piece of the mode `play` in the labels of the grids: the demo, or the name of the file
 * of `--midi`.
 *
 * @param args The demo and the file.
 * @returns The name, such as `beethoven-9`.
 */
function pieceName(args: Pick<PlayArgs, 'demo' | 'midi'>): string {
  return args.midi === null ? args.demo : basename(args.midi);
}

/**
 * Gives the length of the piece of the mode `play`: the length of the demo, or of the score of the
 * file of `--midi` as the app reads it.
 *
 * @param demo The demo.
 * @param midi The path of the file of `--midi`, or `null`.
 * @returns The length, in seconds.
 * @throws Error when the file is not a valid MIDI file.
 */
function pieceLength(demo: DemoId, midi: string | null): number {
  if (midi === null) {
    return DEMOS[demo].lengthSec;
  }
  const result = buildScore(new Uint8Array(readFileSync(midi)), 'auto');
  if (!result.ok) {
    throw new Error(`The file ${midi} of --midi is not valid: ${result.error}.`);
  }
  return result.score.durationSec;
}

/**
 * Checks that a song time is a time of a play frame of a demo.
 *
 * @param time The song time, in seconds.
 * @param demo The demo.
 * @param midi The path of the file of `--midi`, which replaces the demo, or `null`.
 * @returns The time.
 * @throws Error for a time below {@link SEEK_LEAD_SEC}, or a time at or after the end of the demo.
 */
function frameTime(time: number, demo: DemoId, midi: string | null = null): number {
  // Below the seek lead, the seek goes to 0 s, and the frame comes when the bar hides, at about
  // 3.3 s.
  if (time < SEEK_LEAD_SEC) {
    throw new Error(
      `The time ${time} s is below ${SEEK_LEAD_SEC} s, the smallest time of the mode play. The tool seeks to ${SEEK_LEAD_SEC} s before the time, so that the bar hides before the frame.`,
    );
  }
  // The seek bar does not pass the end, and the bar shows when the music stops.
  const lengthSec = pieceLength(demo, midi);
  if (time >= lengthSec) {
    throw new Error(
      `The time ${time} s is not before the end of the ${pieceText(demo, midi)} (${lengthSec} s).`,
    );
  }
  return time;
}

/**
 * Reads the subject of `--shot`: a whole number is a seat, and each other text is a species, or a
 * species and an instrument after a colon, such as `badger:cymbals`.
 *
 * @param text The subject, such as `4` or `hippo`.
 * @returns The subject.
 * @throws Error that lists the species, for a text that is not a seat or a species.
 */
export function shotSubject(text: string): ShotSubject {
  if (/^\d+$/.test(text)) {
    return { kind: 'seat', seat: Number(text) };
  }
  const [species = '', instrument] = text.split(':');
  if (isSpeciesId(species) && instrument === undefined) {
    return { kind: 'species', species, instrument: null };
  }
  const known = INSTRUMENT_IDS.find((id) => id === instrument);
  if (isSpeciesId(species) && known !== undefined) {
    return { kind: 'species', species, instrument: known };
  }
  throw new Error(
    `The subject "${text}" of --shot is not a seat or a species. A seat is a whole number, such as 4. A species can take an instrument after a colon, such as badger:cymbals. The species are: ${SPECIES_IDS.join(', ')}.`,
  );
}

/**
 * Gives the folder of the frames of one time of a run of the mode `play` with more than one
 * `--time`, such as `<dir>/time-12.25`.
 *
 * @param out The output directory of the run.
 * @param sec The song time, in seconds.
 * @returns The folder.
 */
export function playTimeDir(out: string, sec: number): string {
  return join(out, `time-${sec.toFixed(2)}`);
}

/**
 * Gives the folder of the frames of one variant of a run of the mode `play` with more than one
 * `--set`, such as `<dir>/set-2` for the second `--set`.
 *
 * @param out The output directory of the run.
 * @param index The index of the variant, from 0.
 * @returns The folder.
 */
function playSetDir(out: string, index: number): string {
  return join(out, `set-${index + 1}`);
}

/**
 * Splits a command line of the mode `play` into one command line for each variant and each time:
 * with more than one `--set`, each variant renders into its own folder ({@link playSetDir}), and
 * with more than one `--time`, each time renders into its own folder ({@link playTimeDir}) in the
 * folder of its variant. The parts share the site of the working tree, which applies the variant
 * of its query ({@link variantPlugin}), and one build of the commit (`renderModes()`).
 *
 * @param args The command line.
 * @returns The command line of each part, by variant, then in the order of the times.
 */
function playParts(args: PlayArgs): PlayArgs[] {
  const variants: PlayArgs[] = [];
  if (args.holds.length > 1) {
    for (const index of args.holds.keys()) {
      variants.push({ ...args, holdsIndex: index, out: playSetDir(args.out, index) });
    }
  } else {
    variants.push(args);
  }
  const parts: PlayArgs[] = [];
  for (const variant of variants) {
    if (variant.otherTimes.length === 0 || variant.time.kind !== 'song') {
      parts.push(variant);
      continue;
    }
    for (const sec of [variant.time.sec, ...variant.otherTimes]) {
      parts.push({
        ...variant,
        time: { kind: 'song', sec },
        otherTimes: [],
        out: playTimeDir(variant.out, sec),
      });
    }
  }
  return parts;
}

/**
 * Reads the command line of the mode `play`:
 * `play <dir> [--demo <id> | --midi <path>] [--time <s>... | --strip <from>:<step>:<count>] [--camera <name>|<dx>,<dy>,<wheel>|<JSON>]... [--camera-file <json>] [--cinematic] [--shot <seat|species>] [--at <seat|species> [--azimuth <deg>]... [--zoom <z>] [--elevation <deg>]] [--url <url>] [--base <ref>] [--set <changes>]... [--size <w>x<h>] [--pause]`.
 * `--pause` pauses the play at the time of the frame, so that the frame shows the rest pose
 * ({@link pauseFrame}).
 * With no `--camera`, the camera is `default`. `--camera-file` gives labelled cameras in place of
 * `--camera` ({@link cameraFile}). `--midi` renders a MIDI file of the user in place
 * of a demo ({@link openMidi}). `--strip` renders frames at exact song times from one page each
 * ({@link stripTimes}, {@link stripViews}). `--size` sets the size of the frames
 * ({@link playSize}). `--cinematic` renders the camera of the shot plan
 * of the app ({@link CINEMATIC_CAMERA}). `--shot` also gives the time: the frame of the first solo
 * or section shot of its subject ({@link chooseShot}). `--at` aims the stage camera at one player
 * ({@link aimCamerasOf}, {@link aimPose}). `--set` renders a variant of the holds of the working
 * tree from a build of its own ({@link startVariantSite}). More than one `--set` renders each
 * variant into its own folder ({@link playSetDir}) from that one build. More than one `--time` renders each
 * time into its own folder ({@link playTimeDir}) from one build of each tree ({@link playParts}).
 *
 * @param args The arguments after the script.
 * @returns The command line, or `null` when the first argument is not `play`.
 * @throws Error that lists the correct names, for an unknown demo, camera, or species, and an
 *   error for a wrong time, a time below {@link SEEK_LEAD_SEC}, a time at or after the end of the
 *   demo, a file of `--midi` that does not exist or comes with `--demo`, two times with one
 *   folder, `--camera` or `--camera-file` with `--cinematic` or `--shot`, `--camera-file` with
 *   `--camera`, a wrong camera file, `--time` with `--shot`, `--at` with `--camera`,
 *   `--camera-file`, `--cinematic`, `--shot`, or `--url`, `--set` with `--url` or `--base`, an
 *   option of `--at` with no `--at`, `--pause` with `--strip` or `--shot`, a wrong option, or a
 *   missing word.
 */
function playArgs(args: readonly string[]): PlayArgs | null {
  if (args[0] !== 'play') {
    return null;
  }
  const line = modeLine(
    args.slice(1),
    [
      '--demo',
      '--midi',
      '--time',
      '--camera',
      '--camera-file',
      '--shot',
      '--at',
      '--azimuth',
      '--zoom',
      '--elevation',
      '--url',
      '--base',
      '--set',
      '--size',
      '--strip',
    ],
    ['--camera', '--azimuth', '--time', '--set'],
    ['--cinematic', '--pause'],
  );
  const [out, ...extra] = line.words;
  if (!out || extra.length > 0) {
    throw new Error('The mode play takes one output directory, such as: play scratch/play');
  }

  const demos = DEMO_IDS.map((name) => ({ name }));
  const demo = namedItem(line.options.get('--demo')?.[0] ?? DEFAULT_DEMO, demos, 'demo').name;
  const midiText = line.options.get('--midi')?.[0] ?? null;
  if (midiText !== null && line.options.has('--demo')) {
    throw new Error('The option --midi gives the piece, so it takes no --demo.');
  }
  const midi = midiText === null ? null : midiPath(midiText);
  const shotText = line.options.get('--shot')?.[0] ?? null;
  const cinematic = line.flags.has('--cinematic') || shotText !== null;
  const cameraTexts = line.options.get('--camera');
  const cameraPath = line.options.get('--camera-file')?.[0] ?? null;
  if (cinematic && (cameraTexts || cameraPath !== null)) {
    throw new Error(
      'The options --cinematic and --shot take no --camera or --camera-file, because a drag or a wheel turns the camera to Free (design 2.5).',
    );
  }
  if (cameraTexts && cameraPath !== null) {
    throw new Error('The option --camera-file gives the cameras, so it takes no --camera.');
  }
  const timeTexts = line.options.get('--time') ?? [];
  if (shotText !== null && timeTexts.length > 0) {
    throw new Error('The option --shot gives the time of the frame, so it takes no --time.');
  }
  const url = line.options.get('--url')?.[0] ?? null;
  const base = line.options.get('--base')?.[0] ?? null;
  const sizeText = line.options.get('--size')?.[0] ?? null;
  const frame = sizeText === null ? PLAY_FRAME : playSize(sizeText);
  const atText = line.options.get('--at')?.[0] ?? null;
  const aimCameras = atText === null ? null : aimCamerasOf(atText, line.options);
  if (atText === null && ['--azimuth', '--zoom', '--elevation'].some((o) => line.options.has(o))) {
    throw new Error('The options --azimuth, --zoom, and --elevation need --at.');
  }
  if (aimCameras && (cinematic || cameraTexts || cameraPath !== null)) {
    throw new Error(
      'The option --at gives the camera, so it takes no --camera, --camera-file, --cinematic, or --shot.',
    );
  }
  if (aimCameras && url !== null) {
    throw new Error('The option --at builds a site of its own, so --url does not go.');
  }
  const holds = onceEach(line.options.get('--set') ?? [], 'set');
  const stripText = line.options.get('--strip')?.[0] ?? null;
  if (stripText !== null && (shotText !== null || timeTexts.length > 0)) {
    throw new Error(
      'The option --strip gives the times of the frames, so it takes no --time or --shot.',
    );
  }
  if (stripText !== null && url !== null) {
    throw new Error('The option --strip builds a site of its own, so --url does not go.');
  }
  const strip = stripText === null ? null : stripTimes(stripText, pieceLength(demo, midi));
  const pause = line.flags.has('--pause');
  if (pause && (stripText !== null || shotText !== null)) {
    throw new Error(
      'The option --pause renders the rest pose after a seek, so it takes no --strip or --shot.',
    );
  }
  if (holds.length > 0 && (url !== null || base !== null)) {
    throw new Error(
      'The option --set builds a site of its own and moves the player of --at, so --url and --base do not go.',
    );
  }

  if (shotText !== null) {
    const subject = shotSubject(shotText);
    const camera = { ...CINEMATIC_CAMERA, name: `shot-${subjectName(subject)}` };
    const time: PlayTime = { kind: 'shot', subject };
    return {
      demo,
      midi,
      time,
      otherTimes: [],
      cameras: [camera],
      frame,
      cinematic,
      out,
      url,
      base,
      at: null,
      holds,
      holdsIndex: null,
      strip: null,
      pause,
    };
  }
  const [first = PLAY_TIME_SEC, ...others] = (
    strip ? [String(strip[0] ?? 0)] : timeTexts.length > 0 ? timeTexts : [String(PLAY_TIME_SEC)]
  ).map((text) => {
    const sec = Number(text);
    if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(sec)) {
      throw new Error(`The time "${text}" is not a song time in seconds, such as 6 or 30.5.`);
    }
    // A strip freezes the song time, so it needs no seek lead.
    return strip ? sec : frameTime(sec, demo, midi);
  });
  // Two times with one folder would write the same files.
  onceEach(
    [first, ...others].map((sec) => playTimeDir(out, sec)),
    'time folder',
  );
  const time: PlayTime = { kind: 'song', sec: first };
  const fileCameras = cameraPath === null ? null : cameraFile(cameraPath);
  const cameras =
    aimCameras?.cameras ??
    fileCameras ??
    (cinematic ? [CINEMATIC_CAMERA] : (cameraTexts ?? ['default']).map(playCamera));
  return {
    demo,
    midi,
    time,
    otherTimes: others,
    cameras,
    frame,
    cinematic,
    out,
    url,
    base,
    at: aimCameras?.subject ?? null,
    holds,
    holdsIndex: null,
    strip,
    pause,
  };
}

/** The most frames of `--strip`. */
const STRIP_LIMIT = 120;

/**
 * Reads the times of `--strip <from>:<step>:<count>`: `<count>` song times from `<from>` at steps
 * of `<step>` seconds, such as `30:0.05:40` for 2 s from 30 s.
 *
 * @param text The value of the option.
 * @param lengthSec The length of the piece, in seconds.
 * @returns The song times, in seconds.
 * @throws Error for a text of another form, a step that is not above 0, a count that is not a
 *   whole number from 1 to {@link STRIP_LIMIT}, or a last time at or after the end of the piece.
 */
function stripTimes(text: string, lengthSec: number): number[] {
  const found = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?):(\d+)$/.exec(text);
  const [from, step, count] = [Number(found?.[1]), Number(found?.[2]), Number(found?.[3])];
  if (!found || !(step > 0) || count < 1 || count > STRIP_LIMIT) {
    throw new Error(
      `The strip "${text}" is not <from>:<step>:<count>, such as 30:0.05:40, with a step above 0 and a count from 1 to ${STRIP_LIMIT}.`,
    );
  }
  const times = Array.from({ length: count }, (_, i) => Number((from + i * step).toFixed(6)));
  const last = times.at(-1) ?? from;
  if (last >= lengthSec) {
    throw new Error(`The last time ${last} s of the strip is not before the end (${lengthSec} s).`);
  }
  return times;
}

/** The player and the cameras of `--at`. */
interface AimCameras {
  /** The seat or the species of the player. */
  readonly subject: ShotSubject;
  /** The cameras, one for each azimuth. */
  readonly cameras: readonly PlayCamera[];
}

/**
 * Reads the cameras of `--at <seat|species>`: one camera for each `--azimuth` (0 by default), at
 * the `--zoom` (1 by default) and the `--elevation` ({@link AIM_ELEVATION} by default) of all.
 * The name of a camera is `at-<subject>-az<azimuth>`, such as `at-elephant-az90`.
 *
 * @param text The subject of `--at`.
 * @param options The options of the mode `play`.
 * @returns The player and the cameras.
 * @throws Error for a subject that is not a seat or a species, an azimuth that is not a number or
 *   that comes two times, a zoom that is not above 0, or a wrong elevation.
 */
function aimCamerasOf(text: string, options: ReadonlyMap<string, readonly string[]>): AimCameras {
  const subject = shotSubject(text);
  const zoomText = options.get('--zoom')?.[0] ?? '1';
  const zoom = Number(zoomText);
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error(
      `The option --zoom of --at takes a number above 0, such as 2, and not "${zoomText}".`,
    );
  }
  const elevation = elevationOf(options.get('--elevation')?.[0]) ?? AIM_ELEVATION;
  const azimuths = onceEach(options.get('--azimuth') ?? ['0'], 'azimuth').map((value) => {
    const azimuth = Number(value);
    if (value.trim() === '' || !Number.isFinite(azimuth)) {
      throw new Error(
        `The option --azimuth takes a number of degrees, such as 90, and not "${value}".`,
      );
    }
    return azimuth;
  });
  const name = subjectName(subject);
  const cameras = azimuths.map((azimuth) => ({
    name: `at-${name}-az${azimuth}`,
    dx: 0,
    dy: 0,
    wheel: 0,
    aim: { azimuth, elevation, zoom },
  }));
  return { subject, cameras };
}

/** The share of a shot at the frame of `--shot`: the middle, after the blend from the shot before. */
const SHOT_FRAME_SHARE = 0.5;

/** The shot of `--shot` in the shot plan of a demo. */
interface ChosenShot {
  /** The shot, from `prepareShots()` with the seed of the app. */
  readonly shot: Shot;
  /** The species of the players of each seat of the shot, in the order of the seats. */
  readonly species: readonly SpeciesId[];
  /**
   * The song time of the frame, in seconds, at {@link SHOT_FRAME_SHARE} of the shot, to 0.1 s.
   * The first shot starts at the song start, and the last shot ends at the end of the demo.
   */
  readonly frameSec: number;
}

/**
 * Finds the first solo or section shot of a subject in a shot plan: the first shot in time whose
 * seats hold the seat of the subject, or a seat of its species.
 *
 * @param shots The shots of the plan, sorted by their start.
 * @param players The players of the layout of the score.
 * @param subject The subject.
 * @returns The shot, or `undefined` when no solo or section shot has the subject.
 */
function firstShotOf(
  shots: readonly Shot[],
  players: readonly PlayerPlace[],
  subject: ShotSubject,
): Shot | undefined {
  const seats = new Set(
    subject.kind === 'seat'
      ? [subject.seat]
      : players
          .filter((player) => isSubjectPlayer(subject, player.cast))
          .map((player) => player.cast.seatIndex),
  );
  return shots.find(
    (shot) =>
      (shot.kind === 'solo' || shot.kind === 'section') && shot.seats.some((s) => seats.has(s)),
  );
}

/**
 * Writes the seats of the solo and section shots of a plan with their species, for the message
 * of a subject with no shot.
 *
 * @param shots The shots of the plan.
 * @param players The players of the layout of the score.
 * @returns The text, such as `rabbit (seat 0), hippo (seat 4)`.
 */
function shotSubjectsText(shots: readonly Shot[], players: readonly PlayerPlace[]): string {
  const seats = new Set(
    shots
      .filter((shot) => shot.kind === 'solo' || shot.kind === 'section')
      .flatMap((shot) => shot.seats),
  );
  return [...seats]
    .toSorted((a, b) => a - b)
    .map((seat) => `${speciesOfSeat(players, seat)} (seat ${seat})`)
    .join(', ');
}

/**
 * Gives the species of the players of a seat.
 *
 * @param players The players of the layout of the score.
 * @param seat The index of the seat.
 * @returns The species of its first player.
 * @throws Error when the layout has no player of the seat.
 */
function speciesOfSeat(players: readonly PlayerPlace[], seat: number): SpeciesId {
  const player = players.find((place) => place.cast.seatIndex === seat);
  if (!player) {
    throw new Error(`The layout has no player of the seat ${seat}.`);
  }
  return player.cast.species;
}

/** The score of a demo as the app plays it, with its layout and its player models. */
interface DemoLayout {
  /** The score. */
  readonly score: Score;
  /** The layout of the score. */
  readonly layout: SceneLayout;
  /** The player models of the layout. */
  readonly models: ModelCache;
}

/**
 * Gives the score and the layout of a demo as the app plans them: the demo after
 * `demos/patches.json`, or the file of `--midi` with no patch, the section size "Auto", and the
 * layout of `planScene()` of `src/app/app.ts`.
 *
 * @param demo The demo.
 * @param midi The path of the file of `--midi`, which replaces the demo, or `null`.
 * @returns The score, its layout, and its player models.
 * @throws Error when the demo is not valid.
 */
async function demoLayout(demo: DemoId, midi: string | null): Promise<DemoLayout> {
  const bytes =
    midi === null ? (await patchedDemo(`${demo}.mid`)).bytes : new Uint8Array(await readFile(midi));
  const result = buildScore(bytes, 'auto');
  if (!result.ok) {
    throw new Error(`The ${pieceText(demo, midi)} is not valid: ${result.error}.`);
  }
  const models = new ModelCache();
  return { score: result.score, layout: layoutScene(result.score, models), models };
}

/**
 * Chooses the shot of `--shot` as the app plans it: the layout of the demo ({@link demoLayout}),
 * the shots of `planScene()` of `src/app/app.ts`, and the seed of the app.
 *
 * @param demo The demo.
 * @param subject The subject.
 * @param midi The path of the file of `--midi`, which replaces the demo, or `null`.
 * @returns The shot, its species, and the time of its frame.
 * @throws Error when the demo is not valid, when no solo or section shot has the subject, or when
 *   the time of the frame is not a time of a play frame ({@link frameTime}).
 */
async function chooseShot(
  demo: DemoId,
  subject: ShotSubject,
  midi: string | null = null,
): Promise<ChosenShot> {
  const { score, layout, models } = await demoLayout(demo, midi);
  const { shots } = prepareShots(score, layout, SHOT_SEED, models);

  const shot = firstShotOf(shots, layout.players, subject);
  if (!shot) {
    const name = subject.kind === 'seat' ? `the seat ${subject.seat}` : subjectName(subject);
    throw new Error(
      `The ${pieceText(demo, midi)} has no solo or section shot of ${name}. Its solo and section shots show: ${shotSubjectsText(shots, layout.players)}.`,
    );
  }
  const start = Math.max(0, shot.startSec);
  const end = Math.min(pieceLength(demo, midi), shot.endSec);
  const frameSec = Math.round((start + (end - start) * SHOT_FRAME_SHARE) * 10) / 10;
  const species = shot.seats.map((seat) => speciesOfSeat(layout.players, seat));
  return { shot, species, frameSec: frameTime(frameSec, demo, midi) };
}

/**
 * Writes a chosen shot for the output of the tool.
 *
 * @param demo The demo, or the name of the file of `--midi`.
 * @param chosen The shot.
 * @returns The text, such as `solo of the seat 4 (hippo), 232.03 s to 237.03 s`.
 */
function chosenShotText(demo: string, chosen: ChosenShot): string {
  const { shot } = chosen;
  const seats = shot.seats.map((seat, i) => `${seat} (${chosen.species[i] ?? '?'})`).join(', ');
  const noun = shot.seats.length === 1 ? 'the seat' : 'the seats';
  const end = Number.isFinite(shot.endSec) ? `${shot.endSec.toFixed(2)} s` : 'the end';
  return `The shot of ${demo}: ${shot.kind} of ${noun} ${seats}, ${Math.max(0, shot.startSec).toFixed(2)} s to ${end}. The frame is at ${chosen.frameSec} s.`;
}

/** The player of `--at` on the stage of a demo. */
interface AimTarget {
  /** The place of the player. */
  readonly place: PlayerPlace;
  /** The box of its body, in the axes of its model (`bodyBoundsOf()`). */
  readonly box: Bounds;
}

/**
 * Finds the player of `--at` in the layout of a demo ({@link demoLayout}): the player of the seat,
 * or the first player of the species in the order of the layout.
 *
 * @param demo The demo.
 * @param subject The seat or the species.
 * @param midi The path of the file of `--midi`, which replaces the demo, or `null`.
 * @returns The player and the box of its body.
 * @throws Error that lists the players of the demo, when no player matches.
 */
export async function aimTarget(
  demo: DemoId,
  subject: ShotSubject,
  midi: string | null = null,
): Promise<AimTarget> {
  const { layout, models } = await demoLayout(demo, midi);
  const place = layout.players.find((player) => isSubjectPlayer(subject, player.cast));
  if (!place) {
    const name = subject.kind === 'seat' ? `the seat ${subject.seat}` : subjectName(subject);
    const seats = [
      ...new Set(layout.players.map((p) => `${p.cast.species} (seat ${p.cast.seatIndex})`)),
    ];
    throw new Error(
      `The ${pieceText(demo, midi)} has no player of ${name}. Its players are: ${seats.join(', ')}.`,
    );
  }
  const { cast } = place;
  const model = models.get(cast.species, cast.instrument, cast.kettles, cast.support);
  return { place, box: bodyBoundsOf(model.mesh) };
}

/**
 * Writes the player of `--at` for the output of the tool.
 *
 * @param demo The demo, or the name of the file of `--midi`.
 * @param target The player.
 * @returns The text, such as `The camera of --at aims at the elephant of the seat 12 (timpani).`
 */
function aimTargetText(demo: string, target: AimTarget): string {
  const { cast } = target.place;
  return `The camera of --at aims at the ${cast.species} of the seat ${cast.seatIndex} (${cast.instrument}) of ${demo}.`;
}

/**
 * A plugin of a build of the mode `play`: `aim` for the camera of `--at` ({@link aimPlugin}), and
 * `freeze` for the frozen song time of `--strip` ({@link freezePlugin}).
 */
type PlayPlugin = 'aim' | 'freeze';

/**
 * Gives the plugins of the builds of a command line of the mode `play`.
 *
 * @param args The command line.
 * @returns The plugins: `aim` with `--at` or a camera in JSON, and `freeze` with `--strip`.
 */
function playPluginKinds(args: PlayArgs): PlayPlugin[] {
  const aim = args.at !== null || args.cameras.some((camera) => camera.pose);
  return [...(aim ? ['aim' as const] : []), ...(args.strip ? ['freeze' as const] : [])];
}

/**
 * Makes the plugins of a build of the mode `play`.
 *
 * @param root The root of the tree to build.
 * @param kinds The plugins.
 * @returns The plugins of Vite.
 */
function playPlugins(root: string, kinds: readonly PlayPlugin[]): Plugin[] {
  return [
    ...(kinds.includes('aim') ? [aimPlugin(root)] : []),
    ...(kinds.includes('freeze') ? [freezePlugin(root)] : []),
  ];
}

/** The property of `window` that freezes the song time of a build of {@link freezePlugin}. */
const FREEZE_KEY = '__closeViewsFreeze';

/**
 * The wall time of the poses of a strip frame at the song time 0, in seconds. It is long after
 * each lift of the page, so the instruments are up, and the idle motion of each tree is the same
 * at the same song time.
 */
const FREEZE_WALL = 1000;

/**
 * The code of `frame()` of `src/app/app.ts` that {@link freezePlugin} changes: the read of the
 * song time from the `Player`, and the call of `poseAt()`. A tree with no such code stops the
 * build.
 */
const FREEZE_ANCHORS = {
  song: "this.#songTime = audio && piece.samples !== 'loading' ? audio.player.now() : 0;",
  pose: 'poseAt(plan, this.#songTime, wallTime, transport, audibility, poses)',
} as const;

/**
 * Gives the plugin of a build of the app whose song time and pose wall time follow the property
 * {@link FREEZE_KEY} of `window`: `{ song, wall }` in seconds. The plugin changes the source of
 * `src/app/app.ts` before the compile: each frame then takes the song time of the property in
 * place of the time of the `Player`, and poses the players at its wall time. The audio, the UI,
 * and the camera keep the real clock. A page with no property is the page of the app.
 *
 * @param root The root of the tree to build.
 * @returns The plugin.
 * @throws Error in the build, when the app of the tree has no anchor of {@link FREEZE_ANCHORS}.
 */
function freezePlugin(root: string): Plugin {
  const app = join(realpathSync(root), 'src', 'app', 'app.ts');
  const freeze = `globalThis.${FREEZE_KEY}`;
  return {
    name: 'zoophony:close-views-freeze',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (id !== app) {
        return null;
      }
      const missing = Object.values(FREEZE_ANCHORS).filter((anchor) => !code.includes(anchor));
      if (missing.length > 0) {
        throw new Error(
          `The app ${app} has no code "${missing.join('" and no "')}", so --strip cannot freeze its song time.`,
        );
      }
      const pose = FREEZE_ANCHORS.pose.replace('wallTime', `(${freeze}?.wall ?? wallTime)`);
      return code
        .replace(
          FREEZE_ANCHORS.song,
          `${FREEZE_ANCHORS.song}\n      this.#songTime = ${freeze}?.song ?? this.#songTime;`,
        )
        .replace(FREEZE_ANCHORS.pose, pose);
    },
  };
}

/** The id of the module that aims the stage camera of a build at the camera of the query `aim`. */
const AIM_MODULE = 'virtual:close-views-aim';

/**
 * Gives the plugin of a build of the app whose stage camera follows the camera of the query `aim`:
 * JSON of a `CameraPose` ({@link aimPose}). The last import of `src/main.ts` replaces `follow()`
 * and `update()` of `StageCamera` with a call of the original `follow()` with that camera. Thus
 * each frame takes that camera, in Free mode and in Cinematic mode. A page with no query `aim` is
 * the page of the app. `pnpm share-image` sets the camera of the share image with it.
 *
 * @param root The root of the tree to build.
 * @returns The plugin.
 */
export function aimPlugin(root: string): Plugin {
  // Vite gives the real path of each module, and a temporary folder can sit under a link.
  const top = realpathSync(root);
  const entry = join(top, 'src', 'main.ts');
  const camera = join(top, 'src', 'scene', 'camera.ts');
  const resolved = `\0${AIM_MODULE}`;
  const code = [
    `import { StageCamera } from ${JSON.stringify(camera)};`,
    "const text = new URLSearchParams(location.search).get('aim');",
    'if (text) {',
    '  const pose = JSON.parse(text);',
    '  const follow = StageCamera.prototype.follow;',
    '  StageCamera.prototype.follow = function () { follow.call(this, pose); };',
    '  StageCamera.prototype.update = function () { follow.call(this, pose); };',
    '}',
  ].join('\n');
  return {
    name: 'zoophony:close-views-aim',
    apply: 'build',
    resolveId(id) {
      return id === AIM_MODULE ? resolved : null;
    },
    load(id) {
      return id === resolved ? code : null;
    },
    transform(text, id) {
      return id === entry ? `${text}\nimport ${JSON.stringify(AIM_MODULE)};\n` : null;
    },
  };
}

/**
 * Gives the song time of the frames of the mode `play`. For `--shot`, it chooses the shot
 * ({@link chooseShot}) and prints it.
 *
 * @param args The command line.
 * @returns The song time, in seconds.
 */
async function playTimeSec(args: PlayArgs): Promise<number> {
  if (args.time.kind === 'song') {
    return args.time.sec;
  }
  const chosen = await chooseShot(args.demo, args.time.subject, args.midi);
  console.log(chosenShotText(pieceName(args), chosen));
  return chosen.frameSec;
}

/**
 * Moves the seek bar of the app to a song time, as a drag of its thumb does.
 *
 * @param page The page of the app.
 * @param sec The song time, in seconds.
 */
async function seekTo(page: Page, sec: number): Promise<void> {
  await page.$eval(
    '.seek',
    (element, value) => {
      if (element instanceof HTMLInputElement) {
        element.value = String(value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    sec,
  );
}

/** The longest wait for the seek bar to reach the time of a play frame, in milliseconds. */
const SEEK_WAIT_MS = 60_000;

/** The longest wait for the bar to hide before a play frame, in milliseconds. */
const BAR_WAIT_MS = 10_000;

/**
 * Runs one wait of a play frame. A failure of the wait, such as a timeout of Playwright, then
 * names the frame: the tree, the camera, the demo, and the time.
 *
 * @param what The event of the wait, such as `the bar to hide in 10 s`.
 * @param frame The name of the frame.
 * @param wait The wait.
 * @returns The result of the wait.
 * @throws Error that names the wait and the frame, with the failure of the wait as its cause.
 */
async function playWait<T>(what: string, frame: string, wait: () => Promise<T>): Promise<T> {
  try {
    return await wait();
  } catch (cause) {
    throw new Error(`The wait for ${what} failed on the frame of ${frame}.`, { cause });
  }
}

/** The longest wait for the file of `--midi` to load and to play, in milliseconds. */
const MIDI_WAIT_MS = 60_000;

/**
 * Opens the file of `--midi` with the file input of the page, as a user selects a file, and waits
 * until the file plays: the canvas names a file of the user, the samples are ready, and the seek
 * bar shows at least 1 s. Then a motion of the pointer shows the bar.
 *
 * @param page The page of the app.
 * @param midi The path of the file.
 * @param frame The name of the frame, for the message of a failed wait.
 * @throws Error that names the frame, when the file does not play in {@link MIDI_WAIT_MS}.
 */
async function openMidi(page: Page, midi: string, frame: string): Promise<void> {
  await page.setInputFiles('input[type=file]', midi);
  await playWait(`the file to play in ${MIDI_WAIT_MS / 1000} s`, frame, async () => {
    await page.waitForSelector('#stage[data-demo="file"]', {
      state: 'attached',
      timeout: MIDI_WAIT_MS,
    });
    // The attribute of the samples and the seek bar change in the next frame of the new piece.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
    );
    await page.waitForFunction(
      () => {
        const seek = document.querySelector('.seek');
        return (
          document.body.dataset['samples'] === 'ready' &&
          seek instanceof HTMLInputElement &&
          Number(seek.value) >= 1
        );
      },
      undefined,
      { polling: 50, timeout: MIDI_WAIT_MS },
    );
  });
  // The bar hides while the file loads. A motion of the pointer shows it again, so that the tool
  // can click "Reset view".
  const size = page.viewportSize();
  await page.mouse.move((size?.width ?? 0) / 2, (size?.height ?? 0) / 3);
  await page.waitForSelector('.bar:not(.is-hidden)', { timeout: BAR_WAIT_MS });
}

/**
 * Opens the page of a play frame of a site, and sets its camera: it plays the demo, and closes the
 * drawer. With `--midi`, it then opens the file ({@link openMidi}). Out of Cinematic mode, it
 * moves the camera to the default view with "Reset view", and drags and turns the wheel of the
 * camera. In Cinematic mode, it turns on the automatic camera before the play
 * ({@link startCinematic}), and then it does not touch the camera, so the shot plan of the app
 * moves it.
 * Then it moves the pointer onto the stage, so that the bar hides {@link BAR_HIDE_SEC} later.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param args The command line.
 * @param camera The camera.
 * @param target The player of `--at`, or `null`. A camera with an {@link AimView} then puts its
 *   camera ({@link aimPose}) into the query `aim` of the page, for a build of {@link aimPlugin}.
 * @param frame The name of the frame, for the message of a failed wait.
 * @returns The page. The caller closes it.
 */
async function openPlay(
  browser: Browser,
  site: string,
  args: PlayArgs,
  camera: PlayCamera,
  target: AimTarget | null,
  frame: string,
): Promise<Page> {
  const aim =
    camera.pose ?? (camera.aim && target ? aimPose(target.place, target.box, camera.aim) : null);
  const params = [
    ...(aim ? [`aim=${encodeURIComponent(JSON.stringify(aim))}`] : []),
    ...(args.holdsIndex === null ? [] : [`${HOLDS_QUERY}=${args.holdsIndex}`]),
  ];
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  // The page of a file of --midi opens the default demo, and then the file replaces it.
  const path = args.midi === null ? `/${query}#demo=${args.demo}` : `/${query}`;
  const page = await openShot(browser, new URL(path.slice(1), site).href, {
    file: '',
    path,
    ...args.frame,
    ready: SAMPLES_READY,
  });
  try {
    if (args.cinematic) {
      await startCinematic(page);
    }
    await page.click(FIRST_PLAY);
    await page.waitForTimeout(1500);
    // The open drawer keeps the bar and covers the right side of the stage (design 2.8). A phone
    // layout starts with the drawer closed, so its button does not show.
    await page.click('.close-drawer', { timeout: 2000 }).catch(() => undefined);
    if (args.midi !== null) {
      await openMidi(page, args.midi, frame);
    }
    if (!args.cinematic) {
      await resetView(page);
      if (camera.dx !== 0 || camera.dy !== 0) {
        await page.mouse.move(DRAG_START.x, DRAG_START.y);
        await page.mouse.down();
        await page.mouse.move(DRAG_START.x + camera.dx, DRAG_START.y + camera.dy, {
          steps: 20,
        });
        await page.mouse.up();
      }
      // The wheel steps go to the element under the pointer, and the pointer is still on the
      // button "Reset view" when the camera has no drag.
      await page.mouse.move(DRAG_START.x, DRAG_START.y);
      for (let i = 0; i < Math.abs(camera.wheel); i++) {
        await page.mouse.wheel(0, camera.wheel > 0 ? -100 : 100);
        await page.waitForTimeout(30);
      }
    }
    // The pointer leaves the bar, so that the bar hides before the frame. A motion with no press
    // keeps the camera mode.
    await page.mouse.move(args.frame.width / 2, args.frame.height / 2);
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

/**
 * Renders one play frame of a site: it opens the page and sets the camera ({@link openPlay}). A
 * seek keeps the free camera of "Reset view" (design 2.5). Then it seeks to
 * {@link SEEK_LEAD_SEC} before the time, waits until the seek bar reaches the time, and waits
 * until the bar hides. The bar hides {@link BAR_HIDE_SEC} after the last motion of the pointer,
 * so the motion before the seek makes it hide before the frame.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param args The command line.
 * @param camera The camera.
 * @param time The song time of the frame, in seconds.
 * @param tree The name of the tree of the site, such as `the working tree` or `main (cc83899c)`.
 * @param target The player of `--at`, or `null`. A camera with an {@link AimView} then puts its
 *   camera ({@link aimPose}) into the query `aim` of the page, for a build of {@link aimPlugin}.
 * @returns The PNG image, and the song time of the bar at the frame, such as `0:06`.
 * @throws Error that names the tree, the camera, the demo, and the time, when the seek bar does
 *   not reach the time in {@link SEEK_WAIT_MS}, when the bar does not hide in {@link BAR_WAIT_MS},
 *   or when the camera of a Cinematic frame is not in Cinematic mode.
 */
async function playFrame(
  browser: Browser,
  site: string,
  args: PlayArgs,
  camera: PlayCamera,
  time: number,
  tree: string,
  target: AimTarget | null,
): Promise<{ readonly image: Buffer; readonly clock: string }> {
  const frame = `${tree}, camera ${camera.name}, ${pieceText(args.demo, args.midi)}, time ${time} s`;
  const page = await openPlay(browser, site, args, camera, target, frame);
  try {
    const whole = Math.floor(time);
    await playWait(
      `the seek bar to reach ${whole} s in ${SEEK_WAIT_MS / 1000} s`,
      frame,
      async () => {
        await seekTo(page, Math.max(0, whole - SEEK_LEAD_SEC));
        // The seek bar shows the whole seconds of the song time.
        await page.waitForFunction(
          (sec) => {
            const seek = document.querySelector('.seek');
            return seek instanceof HTMLInputElement && Number(seek.value) >= sec;
          },
          whole,
          { polling: 20, timeout: SEEK_WAIT_MS },
        );
      },
    );
    await page.waitForTimeout((time - whole) * 1000);
    await playWait(`the bar to hide in ${BAR_WAIT_MS / 1000} s`, frame, () =>
      page.waitForSelector('.bar.is-hidden', { state: 'attached', timeout: BAR_WAIT_MS }),
    );
    // The bar fades out in 0.2 s.
    await page.waitForTimeout(300);
    if (args.pause) {
      await pauseFrame(page);
    }
    const image = await page.screenshot({ type: 'png' });
    const clock = await page.$eval('.bar .time', (element) => element.textContent ?? '');
    // The toggle "Automatic camera" is on in Cinematic mode (design 2.5).
    const automatic = await page.$eval('button.camera', (element) =>
      element.getAttribute('aria-pressed'),
    );
    if (args.cinematic && automatic !== 'true') {
      throw new Error(`The camera of the frame of ${frame} is not in Cinematic mode.`);
    }
    return { image, clock };
  } finally {
    await page.close();
  }
}

/**
 * Pauses the play of a page and waits until each player is in the rest pose (design 5.2): the
 * hold of {@link REST_TIMES} and the slowest lowering ({@link LOWER_MAX_SEC}). Then it hides the
 * bar, which shows while the play pauses, so that the frame shows the stage alone.
 *
 * @param page The page of the app, which plays.
 */
async function pauseFrame(page: Page): Promise<void> {
  // The hidden bar takes no pointer, so the click goes to the button itself.
  await page.$eval('.bar .play', (button) => {
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });
  await page.waitForTimeout((REST_TIMES.hold + LOWER_MAX_SEC) * 1000 + 500);
  await page.addStyleTag({ content: '.bar { visibility: hidden !important; }' });
  await page.waitForTimeout(100);
}

/**
 * Renders the play frame of each camera on one site, and writes each frame as
 * `<prefix><camera>.png`.
 *
 * @param browser The browser.
 * @param site The URL of the site.
 * @param args The command line.
 * @param time The song time of the frames, in seconds.
 * @param prefix The start of the file names, such as `play-`.
 * @param tree The name of the tree of the site, for the message of a failed wait.
 * @param target The player of `--at`, or `null`.
 * @returns The frames and their labels, one for each camera.
 */
async function renderPlay(
  browser: Browser,
  site: string,
  args: PlayArgs,
  time: number,
  prefix: string,
  tree: string,
  target: AimTarget | null,
): Promise<RenderedViews> {
  const cells: Buffer[] = [];
  const labels: string[] = [];
  for (const camera of args.cameras) {
    const frame = await playFrame(browser, site, args, camera, time, tree, target);
    const file = join(args.out, `${prefix}${camera.name}.png`);
    await writeFile(file, frame.image);
    console.log(`${file}: song time ${frame.clock}`);
    cells.push(frame.image);
    labels.push(`${camera.name}, ${pieceName(args)} at ${time} s`);
  }
  return { cells, labels };
}

/**
 * Finds the player of `--at` of a part of the mode `play` ({@link aimTarget}), and prints it. A
 * part of one of several variants aims at the player with the hold changes of its variant.
 *
 * @param args The command line of the part.
 * @returns The player, or `null` with no `--at`.
 */
async function partTarget(args: PlayArgs): Promise<AimTarget | null> {
  const changes = args.holdsIndex === null ? null : setHolds(args.holds[args.holdsIndex] ?? '');
  let target: AimTarget | null = null;
  try {
    target = args.at ? await aimTarget(args.demo, args.at, args.midi) : null;
  } finally {
    changes?.undo();
  }
  if (changes) {
    console.log(`${args.out}: the hold changes ${changes.text}.`);
  }
  if (target) {
    console.log(aimTargetText(pieceName(args), target));
  }
  return target;
}

/** The frames of a strip in each row of its sheets: 4 pairs of the commit and the working tree. */
const STRIP_COLUMNS = 8;

/** The width of a frame in the sheets of a strip, in CSS pixels. */
const STRIP_CELL_WIDTH = 300;

/**
 * Renders the frames of `--strip` of one camera on one site: one page, whose song time each frame
 * freezes at its time ({@link freezePlugin}), with the wall time of the poses at
 * {@link FREEZE_WALL} after it.
 *
 * @param browser The browser.
 * @param site The URL of the site, a build with {@link freezePlugin}.
 * @param args The command line, with a strip.
 * @param camera The camera.
 * @param tree The name of the tree of the site, for the message of a failed wait.
 * @param target The player of `--at`, or `null`.
 * @returns The PNG image of each time of the strip.
 * @throws Error that names the frame, when the bar does not hide in {@link BAR_WAIT_MS}, or when
 *   the camera of a Cinematic strip is not in Cinematic mode.
 */
async function stripFrames(
  browser: Browser,
  site: string,
  args: PlayArgs,
  camera: PlayCamera,
  tree: string,
  target: AimTarget | null,
): Promise<Buffer[]> {
  const times = args.strip ?? [];
  const frame = `${tree}, camera ${camera.name}, ${pieceText(args.demo, args.midi)}, strip`;
  const page = await openPlay(browser, site, args, camera, target, frame);
  try {
    const images: Buffer[] = [];
    for (const [i, song] of times.entries()) {
      await page.evaluate(
        ({ key, frozen }) => {
          Reflect.set(window, key, frozen);
          return new Promise<void>((done) => {
            requestAnimationFrame(() => requestAnimationFrame(() => done()));
          });
        },
        { key: FREEZE_KEY, frozen: { song, wall: FREEZE_WALL + song } },
      );
      if (i === 0) {
        await playWait(`the bar to hide in ${BAR_WAIT_MS / 1000} s`, frame, () =>
          page.waitForSelector('.bar.is-hidden', { state: 'attached', timeout: BAR_WAIT_MS }),
        );
        // The bar fades out in 0.2 s.
        await page.waitForTimeout(300);
      }
      images.push(await page.screenshot({ type: 'png' }));
    }
    const automatic = await page.$eval('button.camera', (element) =>
      element.getAttribute('aria-pressed'),
    );
    if (args.cinematic && automatic !== 'true') {
      throw new Error(`The camera of the frames of ${frame} is not in Cinematic mode.`);
    }
    return images;
  } finally {
    await page.close();
  }
}

/**
 * Gives the size of one frame in the sheets of a strip: {@link STRIP_CELL_WIDTH} wide, with the
 * aspect of the frame.
 *
 * @param frame The size of a play frame, in CSS pixels.
 * @returns The size of one cell, in CSS pixels.
 */
function stripCell(frame: CellSize): CellSize {
  return {
    width: STRIP_CELL_WIDTH,
    height: Math.round((STRIP_CELL_WIDTH * frame.height) / frame.width),
  };
}

/**
 * Writes the frames of a strip of one camera of one tree as `<prefix><camera>-<nn>.png`.
 *
 * @param args The command line, with a strip.
 * @param camera The camera.
 * @param prefix The start of the file names, such as `strip-` or `strip-base-`.
 * @param images The frames.
 */
async function writeStrip(
  args: PlayArgs,
  camera: PlayCamera,
  prefix: string,
  images: readonly Buffer[],
): Promise<void> {
  for (const [i, image] of images.entries()) {
    await writeFile(
      join(args.out, `${prefix}${camera.name}-${String(i).padStart(2, '0')}.png`),
      image,
    );
  }
}

/**
 * Gives the SHA-256 of a text or of the bytes of a file.
 *
 * @param data The text or the bytes.
 * @returns The hash, in hex.
 */
function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Gives the folder of the cache of the frames of a strip of one camera on a commit:
 * `probe-cache/strip-<key>/` in the common folder of git. The key holds the tree of the commit,
 * this tool and `tools/screenshots.ts`, the lockfile of `node_modules`, the piece (the bytes of
 * the file of `--midi`, or the demo), the camera with the camera of `--at`, the size of the frames,
 * Cinematic mode, and the times of the strip. A frozen song time makes the frames of one key the
 * same, so a second run reads them.
 *
 * @param args The command line, with a strip and a base.
 * @param camera The camera.
 * @param target The player of `--at`, or `null`.
 * @returns The folder, or `null` with {@link PROBE_NO_CACHE} set to `1`.
 * @throws Error if git does not know the commit.
 */
function stripCacheDir(
  args: PlayArgs,
  camera: PlayCamera,
  target: AimTarget | null,
): string | null {
  if (process.env[PROBE_NO_CACHE] === '1' || args.base === null) {
    return null;
  }
  const tree = spawnSync('git', ['rev-parse', '--verify', `${args.base}^{tree}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (tree.status !== 0) {
    throw new Error(`git does not know the commit "${args.base}".`);
  }
  const file = (path: string): string => (existsSync(path) ? sha256(readFileSync(path)) : 'none');
  const aim = camera.aim && target ? aimPose(target.place, target.box, camera.aim) : null;
  const fields = [
    'close-views strip 1',
    tree.stdout.trim(),
    file(join(ROOT, 'tools', 'close-views.ts')),
    file(join(ROOT, 'tools', 'screenshots.ts')),
    file(join(ROOT, 'node_modules', '.pnpm', 'lock.yaml')),
    args.midi === null ? `demo ${args.demo}` : `midi ${file(args.midi)}`,
    camera,
    aim,
    args.frame,
    args.cinematic,
    args.strip,
  ];
  return join(probeCacheDir(), `strip-${sha256(JSON.stringify(fields))}`);
}

/**
 * Reads the frames of a strip from its cache folder ({@link stripCacheDir}).
 *
 * @param dir The folder, or `null`.
 * @param count The number of frames of the strip.
 * @returns The frames, or `null` when the folder does not hold each frame.
 */
async function cachedStrip(dir: string | null, count: number): Promise<Buffer[] | null> {
  if (dir === null || !existsSync(dir) || readdirSync(dir).length !== count) {
    return null;
  }
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      readFile(join(dir, `${String(i).padStart(2, '0')}.png`)),
    ),
  );
}

/**
 * Writes the frames of a strip into its cache folder. The frames go into a part folder first, so
 * that a stop or a second run at the same time leaves no half folder.
 *
 * @param dir The folder, or `null` for no cache.
 * @param images The frames.
 */
async function storeStrip(dir: string | null, images: readonly Buffer[]): Promise<void> {
  if (dir === null) {
    return;
  }
  const part = `${dir}.${process.pid}.part`;
  await mkdir(part, { recursive: true });
  for (const [i, image] of images.entries()) {
    await writeFile(join(part, `${String(i).padStart(2, '0')}.png`), image);
  }
  await rm(dir, { recursive: true, force: true });
  await rename(part, dir);
}

/**
 * Writes the frames of the commit of a strip of one camera, and the sheet of pairs: each frame of
 * the commit on the left of the frame of the working tree at the same song time, 4 pairs in each
 * row, as `strip-pairs-<camera>.png` and `.webp`.
 *
 * @param browser The browser that draws the sheet.
 * @param args The command line, with a strip.
 * @param camera The camera.
 * @param before The frames of the commit.
 * @param after The frames of the working tree.
 * @param label The name of the commit, such as `main (cc83899c)`.
 */
async function writePairs(
  browser: Browser,
  args: PlayArgs,
  camera: PlayCamera,
  before: readonly Buffer[],
  after: readonly Buffer[],
  label: string,
): Promise<void> {
  await writeStrip(args, camera, 'strip-base-', before);
  const name = label.split(' ')[0] ?? label;
  const cells = before.flatMap((image, i) => [image, after[i] ?? image]);
  const labels = (args.strip ?? []).flatMap((song) => [
    `${song.toFixed(2)} s ${name}`,
    `${song.toFixed(2)} s tree`,
  ]);
  const sheet = await grid(browser, cells, labels, STRIP_COLUMNS, stripCell(args.frame));
  await writeImage(browser, sheet, join(args.out, `strip-pairs-${camera.name}`));
}

/**
 * Renders the mode `play` with `--strip` into `<dir>`: for each camera, the frames of the working
 * tree as `strip-<camera>-<nn>.png`, and a sheet of them with the song time of each frame as
 * `strip-<camera>.png` and `.webp`. With `--base`, the frames of the commit come from their cache
 * ({@link stripCacheDir}), or the renders of the commit make them and fill the cache. Then the
 * tool writes them as `strip-base-<camera>-<nn>.png`, with the sheet of pairs
 * ({@link writePairs}). The player of `--at` comes from the working tree, so the cameras of the
 * commit stay the same.
 *
 * @param args The command line, with a strip.
 * @param site The site of the working tree.
 * @returns The renders of the commit, or `null` with no `--base` or with each frame of the commit
 *   in the cache.
 */
async function stripViews(args: PlayArgs, site: TreeSite): Promise<CommitRender | null> {
  const { browser } = site;
  const times = args.strip ?? [];
  const target = await partTarget(args);
  const after = new Map<PlayCamera, Buffer[]>();
  for (const camera of args.cameras) {
    const images = await stripFrames(browser, site.base, args, camera, 'the working tree', target);
    after.set(camera, images);
    await writeStrip(args, camera, 'strip-', images);
    const labels = times.map((song) => `${song.toFixed(2)} s`);
    const sheet = await grid(browser, images, labels, STRIP_COLUMNS, stripCell(args.frame));
    await writeImage(browser, sheet, join(args.out, `strip-${camera.name}`));
  }
  if (args.base === null) {
    return null;
  }

  const dirs = new Map(args.cameras.map((camera) => [camera, stripCacheDir(args, camera, target)]));
  const cached = await Promise.all(
    args.cameras.map((camera) => cachedStrip(dirs.get(camera) ?? null, times.length)),
  );
  if (cached.every((images) => images !== null)) {
    const label = `${args.base} (${shortHash(args.base)})`;
    for (const [i, camera] of args.cameras.entries()) {
      const dir = dirs.get(camera) ?? '';
      console.log(`base: cached (${label}, ${camera.name}, ${dir.slice(-64, -52)})`);
      await writePairs(browser, args, camera, cached[i] ?? [], after.get(camera) ?? [], label);
    }
    return null;
  }
  return async (other, label) => {
    for (const camera of args.cameras) {
      const before = await stripFrames(browser, other, args, camera, label, target);
      await storeStrip(dirs.get(camera) ?? null, before);
      await writePairs(browser, args, camera, before, after.get(camera) ?? [], label);
    }
  };
}

/**
 * Renders the mode `play` into `<dir>`: the play frame of a demo at each camera, and the grid of
 * the frames with one column for each camera, as `play-views.png` and `.webp`. The renders of the
 * commit write each frame of the commit as `play-base-<camera>.png`, and put the row of the commit
 * above the row of the working tree in `play-base-views.png` and `.webp`. The shot of `--shot`
 * comes from the working tree, and the commit renders the same song time. The player of `--at`
 * also comes from the working tree, so the cameras of the commit stay the same.
 *
 * @param args The command line.
 * @param site The site of the working tree.
 * @returns The renders of the commit.
 */
async function playViews(args: PlayArgs, site: TreeSite): Promise<CommitRender> {
  const { browser } = site;
  const columns = args.cameras.length;
  const time = await playTimeSec(args);
  const target = await partTarget(args);
  const after = await renderPlay(
    browser,
    site.base,
    args,
    time,
    'play-',
    'the working tree',
    target,
  );
  const sheet = await grid(
    browser,
    after.cells,
    after.labels,
    columns,
    playCell(columns, args.frame),
  );
  await writeImage(browser, sheet, join(args.out, 'play-views'));

  return async (other, label) => {
    if (args.time.kind === 'shot') {
      console.log(
        `${label} renders the same song time, ${time} s. Its shot plan can give another shot there.`,
      );
    }
    const before = await renderPlay(browser, other, args, time, 'play-base-', label, target);
    const labels = baseGridLabels(after.labels, label);
    const cells = [...before.cells, ...after.cells];
    const both = await grid(browser, cells, labels, columns, playCell(columns, args.frame));
    await writeImage(browser, both, join(args.out, 'play-base-views'));
  };
}

/** The first argument that only checks the command line: the tool then builds and renders nothing. */
const CHECK_FLAG = '--check';

/** The command line of one mode of the tool that renders images: a role, a lineup, or a view. */
type SingleMode =
  | {
      /** The close view of a role. */
      readonly kind: 'role';
      /** The command line of the role. */
      readonly args: CloseViewsArgs;
    }
  | {
      /** A lineup of species. */
      readonly kind: 'lineup';
      /** The command line of the lineup. */
      readonly args: LineupArgs;
    }
  | {
      /** Species alone on their supports, at named views. */
      readonly kind: 'species';
      /** The command line of the mode. */
      readonly args: SpeciesArgs;
    }
  | {
      /** Play frames of a demo at named cameras. */
      readonly kind: 'play';
      /** The command line of the mode. */
      readonly args: PlayArgs;
    };

/** The command line of the mode `batch`: single modes that share one build of each tree. */
interface BatchArgs {
  /** The single modes, in their order, each with its own folder under the output directory. */
  readonly parts: readonly SingleMode[];
  /** The output directory. */
  readonly out: string;
  /** The URL of a running site of the working tree, or `null` for the built site. */
  readonly url: string | null;
  /** The commit, the branch, or the tag to compare with the working tree, or `null`. */
  readonly base: string | null;
}

/** The command line of the tool: one single mode, or a batch of single modes. */
type CloseMode =
  | SingleMode
  | {
      /** Single modes that share one build of each tree. */
      readonly kind: 'batch';
      /** The command line of the batch. */
      readonly args: BatchArgs;
    };

/** The moments of the species of a batch with no `--moments`: the playing pose and the rest pose. */
const DEFAULT_BATCH_MOMENTS: readonly string[] = ['play', 'rest'];

/**
 * Checks that each name of a list comes one time, because two parts with one name write the same
 * files.
 *
 * @param names The names.
 * @param kind The kind of the names in the message, such as `moment`.
 * @returns The names.
 * @throws Error for a name that comes two times.
 */
function onceEach(names: readonly string[], kind: string): readonly string[] {
  const twice = names.find((name, i) => names.indexOf(name) !== i);
  if (twice !== undefined) {
    throw new Error(`The ${kind} "${twice}" comes two times.`);
  }
  return names;
}

/**
 * Reads the command line of one part of a batch with the reader of its single mode.
 *
 * @param args The command line of the single mode, such as `species cat dir/species-play`.
 * @returns The single mode.
 * @throws Error that lists the correct names, from the reader of the mode, and an error when no
 *   single mode matches.
 */
function partMode(args: readonly string[]): SingleMode {
  const mode = closeModeArgs(args);
  if (!mode || mode.kind === 'batch') {
    throw new Error(`The part "${args.join(' ')}" of the batch is not a command line of a mode.`);
  }
  return mode;
}

/**
 * Reads the command line of the mode `batch`:
 * `batch <dir> [--species <species,...>] [--moments <moment,...>] [--views <view,...>] [--zoom <n>]... [--elevation <deg>] [--role <role>]... [--lineup] [--camera <camera>]... [--demo <id>] [--time <s>] [--url <url>] [--base <ref>]`.
 * Each part is the command line of a single mode with the folder of the part in `<dir>`, and
 * the reader of that mode reads it:
 *
 * - `--species`: the mode `species` at each zoom of `--zoom` (1 by default) and at each moment of
 *   `--moments` ({@link DEFAULT_BATCH_MOMENTS} by default), at the views of `--views`, and with
 *   `--elevation`, into `species-<moment>/` at the zoom 1 and `species-<moment>-zoom<n>/` at
 *   another zoom.
 * - `--role`: the close view of each role, into `<role>/`.
 * - `--lineup`: the lineup of the species of `--species`, into `lineup/`.
 * - `--camera`: the mode `play` at each camera, with `--demo` and `--time`, into `play/`.
 *
 * `--url` and `--base` go to each part.
 *
 * @param args The arguments after the script.
 * @returns The command line, or `null` when the first argument is not `batch`.
 * @throws Error that lists the correct names, for an unknown species, view, moment, role, demo,
 *   or camera, and an error for a wrong option, a name or a zoom that comes two times, an option
 *   with no part, a batch with no part, or a missing word.
 */
function batchArgs(args: readonly string[]): BatchArgs | null {
  if (args[0] !== 'batch') {
    return null;
  }
  const line = modeLine(
    args.slice(1),
    [
      '--species',
      '--moments',
      '--views',
      '--zoom',
      '--elevation',
      '--role',
      '--camera',
      '--demo',
      '--time',
      '--url',
      '--base',
    ],
    ['--role', '--camera', '--zoom'],
    ['--lineup'],
  );
  const [out, ...extra] = line.words;
  if (!out || extra.length > 0) {
    throw new Error(
      'The mode batch takes one output directory, such as: batch scratch/views --species cat,rabbit --base main',
    );
  }
  const one = (name: string): string | null => line.options.get(name)?.[0] ?? null;
  const url = one('--url');
  const base = one('--base');
  const shared = [
    ...(url === null ? [] : ['--url', url]),
    ...(base === null ? [] : ['--base', base]),
  ];

  const parts: SingleMode[] = [];
  const species = one('--species');
  const views = one('--views');
  const moments = one('--moments');
  const zooms = line.options.get('--zoom') ?? [];
  const elevation = one('--elevation');
  const speciesOnly = [views, moments, elevation].some((value) => value !== null);
  if (species === null && (speciesOnly || zooms.length > 0 || line.flags.has('--lineup'))) {
    throw new Error(
      'The options --moments, --views, --zoom, --elevation, and --lineup need --species.',
    );
  }
  if (species !== null) {
    const cameraOptions = [
      ...(views === null ? [] : ['--views', views]),
      ...(elevation === null ? [] : ['--elevation', elevation]),
    ];
    const zoomNames = onceEach(
      (zooms.length > 0 ? zooms : ['1']).map((text) => String(zoomOf(text))),
      'zoom',
    );
    const momentNames = onceEach(moments?.split(',') ?? DEFAULT_BATCH_MOMENTS, 'moment');
    for (const zoom of zoomNames) {
      for (const moment of momentNames) {
        const dir = join(out, `species-${moment}${zoom === '1' ? '' : `-zoom${zoom}`}`);
        const options = ['--moment', moment, '--zoom', zoom, ...cameraOptions, ...shared];
        parts.push(partMode(['species', species, dir, ...options]));
      }
    }
  }

  const roles = CLOSE_ROLES.map((name) => ({ name }));
  for (const name of onceEach(line.options.get('--role') ?? [], 'role')) {
    const role = namedItem(name, roles, 'role').name;
    parts.push(partMode([role, join(out, role), ...shared]));
  }

  if (species !== null && line.flags.has('--lineup')) {
    parts.push(partMode(['lineup', species, join(out, 'lineup'), ...shared]));
  }

  const cameras = line.options.get('--camera') ?? [];
  const demo = one('--demo');
  const time = one('--time');
  if (cameras.length === 0 && (demo !== null || time !== null)) {
    throw new Error('The options --demo and --time need --camera.');
  }
  if (cameras.length > 0) {
    const cameraOptions = cameras.flatMap((camera) => ['--camera', camera]);
    const demoOption = demo === null ? [] : ['--demo', demo];
    const timeOption = time === null ? [] : ['--time', time];
    const dir = join(out, 'play');
    parts.push(partMode(['play', dir, ...cameraOptions, ...demoOption, ...timeOption, ...shared]));
  }

  if (parts.length === 0) {
    throw new Error('The mode batch takes at least one of --species, --role, and --camera.');
  }
  return { parts, out, url, base };
}

/** The views of the mode `audit`: the back and 30° to each side of it first, then the four sides. */
const AUDIT_VIEWS: readonly string[] = ['back', '150', '-150', 'front', 'left', 'right'];

/**
 * The camera heights of the mode `audit`, in degrees above the floor: a dent at the root of the
 * arm shows best from above.
 */
const AUDIT_ELEVATIONS: readonly number[] = [20, 40];

/** The box of the crops of the mode `audit`: the arms, the shoulders, and the upper trunk. */
const AUDIT_BOX = '0.05,0.2,0.9,0.55';

/** The crop factor of the mode `audit`. */
const AUDIT_CROP = 2;

/**
 * Reads the command line of the mode `audit`: `audit <dir> [--roles <role,...>] [--url <url>]
 * [--base <ref>]`. It is a batch of the lineups of the roles (all roles with no `--roles`): each
 * moment of each role, from each view of {@link AUDIT_VIEWS}, at each height of
 * {@link AUDIT_ELEVATIONS}, as crops of {@link AUDIT_BOX} at {@link AUDIT_CROP} times, the commit
 * of `--base` above the working tree. Each role and height writes its cells into
 * `<dir>/<role>/e<height>/` and one sheet of all its moments as `<dir>/<role>-e<height>.png`.
 * Both trees build one time for all roles.
 *
 * @param args The arguments after the script.
 * @returns The batch, or `null` when the first argument is not `audit`.
 * @throws Error that lists the roles, for an unknown role, and an error for a wrong option or a
 *   missing word.
 */
function auditArgs(args: readonly string[]): BatchArgs | null {
  if (args[0] !== 'audit') {
    return null;
  }
  const line = modeLine(args.slice(1), ['--roles', '--url', '--base']);
  const [out, ...extra] = line.words;
  if (!out || extra.length > 0) {
    throw new Error(
      'The mode audit takes one output directory, such as: audit scratch/audit --roles conductor,harpist --base main',
    );
  }
  const one = (name: string): string | null => line.options.get(name)?.[0] ?? null;
  const url = one('--url');
  const base = one('--base');
  const shared = [
    ...(url === null ? [] : ['--url', url]),
    ...(base === null ? [] : ['--base', base]),
  ];
  const roleItems = CLOSE_ROLES.map((name) => ({ name }));
  const roles = onceEach(one('--roles')?.split(',') ?? CLOSE_ROLES, 'role').map(
    (name) => namedItem(name, roleItems, 'role').name,
  );

  const parts = roles.flatMap((role) =>
    AUDIT_ELEVATIONS.map((height): SingleMode => {
      const moments = ROLE_VIEWS[role].moments.map((moment) => moment.name).join(',');
      const mode = partMode([
        role,
        join(out, role, `e${height}`),
        '--lineup',
        '--moments',
        moments,
        '--views',
        AUDIT_VIEWS.join(','),
        '--elevation',
        String(height),
        '--crop',
        String(AUDIT_CROP),
        '--box',
        AUDIT_BOX,
        ...shared,
      ]);
      if (mode.kind !== 'role' || !mode.args.lineup) {
        throw new Error(`The audit part of ${role} is no lineup.`);
      }
      const lineup = { ...mode.args.lineup, sheet: join(out, `${role}-e${height}`) };
      return { kind: 'role', args: { ...mode.args, lineup } };
    }),
  );
  return { parts, out, url, base };
}

/**
 * Reads the command line of one mode of the tool, or of a batch of modes.
 *
 * @param args The arguments after the script, with no {@link CHECK_FLAG}.
 * @returns The mode, or `null` when no mode matches.
 * @throws Error that lists the correct names, for a wrong value of the mode `species`, `play`, or
 *   `batch`.
 */
function closeModeArgs(args: readonly string[]): CloseMode | null {
  const batch = batchArgs(args) ?? auditArgs(args);
  if (batch) {
    return { kind: 'batch', args: batch };
  }
  const species = speciesArgs(args);
  if (species) {
    return { kind: 'species', args: species };
  }
  const play = playArgs(args);
  if (play) {
    return { kind: 'play', args: play };
  }
  const lineup = lineupArgs(args);
  if (lineup) {
    return { kind: 'lineup', args: lineup };
  }
  const role = closeViewsArgs(args);
  return role ? { kind: 'role', args: role } : null;
}

/**
 * Gives the renders of a mode. The lineup takes the gallery of the working tree into the build of
 * the commit, so that an older gallery gets the camera code of the query `distance`. A role with
 * `--probe` takes it for the query `probe`.
 *
 * @param mode The command line of the mode.
 * @returns The renders of the mode.
 */
function modeRender(mode: SingleMode): ModeRender {
  switch (mode.kind) {
    case 'role':
      return {
        overlay: mode.args.probes ? ['src/gallery'] : [],
        plugins: [],
        tree: (site) => roleViews(mode.args, site),
      };
    case 'lineup':
      return {
        overlay: ['src/gallery'],
        plugins: [],
        tree: (site) => lineupViews(mode.args, site),
      };
    case 'species':
      return { overlay: [], plugins: [], tree: (site) => speciesViews(mode.args, site) };
    case 'play':
      return {
        overlay: [],
        plugins: playPluginKinds(mode.args),
        tree: (site) =>
          mode.args.strip ? stripViews(mode.args, site) : playViews(mode.args, site),
      };
  }
}

/** The renders of the modes that one build of a commit serves. */
interface CommitBuild<T> {
  /** The paths of the working tree that the build takes in place of the paths of the commit. */
  readonly overlay: readonly string[];
  /** The renders, in the order of the modes. */
  readonly renders: readonly T[];
}

/**
 * Groups the renders of the modes by the build of the commit that they need: one build for each
 * list of overlay paths, in the order of the first mode of each list. An overlay path that is the
 * same in the working tree and in the commit changes no file of the build, so it does not count.
 * Thus the modes of a branch that does not change `src/gallery` share one build of the commit,
 * also with a lineup.
 *
 * @param modes The overlay paths and the renders of the commit of each mode.
 * @param same Tells if a path is the same in the working tree and in the commit.
 * @returns The builds, each with its renders and the overlay paths that differ.
 */
function commitBuilds<T>(
  modes: readonly { readonly overlay: readonly string[]; readonly render: T }[],
  same: (path: string) => boolean,
): CommitBuild<T>[] {
  const builds = new Map<string, { overlay: readonly string[]; renders: T[] }>();
  for (const mode of modes) {
    const overlay = mode.overlay.filter((path) => !same(path));
    const key = overlay.join('\n');
    const build = builds.get(key) ?? { overlay, renders: [] };
    build.renders.push(mode.render);
    builds.set(key, build);
  }
  return [...builds.values()];
}

/**
 * Tells if a path is the same in the working tree and in a commit: git finds no change of a
 * tracked file against the commit, and no file that git does not track, ignored files included.
 * A failed git command counts as a change, so that the tool then builds with the overlay.
 *
 * @param ref The commit, the branch, or the tag.
 * @param path The path, relative to the root of the repository, such as `src/gallery`.
 * @returns True when the overlay of the path changes no file of the build of the commit.
 */
function sameInCommit(ref: string, path: string): boolean {
  const diff = spawnSync('git', ['diff', '--quiet', ref, '--', path], { cwd: ROOT });
  const others = spawnSync('git', ['ls-files', '--others', '--', path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return diff.status === 0 && others.status === 0 && others.stdout.trim() === '';
}

/**
 * Renders modes on the site of the working tree, in their order. With a commit, it then builds
 * the commit one time for each list of overlay paths that differ ({@link commitBuilds}), serves it
 * ({@link withRefSite}), and runs the renders of the commit of each mode there. The site of the
 * working tree stays open, because the lineup renders the working tree again at its common
 * camera.
 *
 * @param modes The renders of each mode.
 * @param site The site of the working tree.
 * @param ref The commit, the branch, or the tag of `--base`, or `null`.
 */
async function renderModes(
  modes: readonly ModeRender[],
  site: TreeSite,
  ref: string | null,
): Promise<void> {
  const commits: { readonly overlay: readonly string[]; readonly render: CommitRender }[] = [];
  for (const mode of modes) {
    const commitRender = await mode.tree(site);
    if (commitRender) {
      commits.push({ overlay: mode.overlay, render: commitRender });
    }
  }
  if (ref === null || commits.length === 0) {
    return;
  }

  const label = `${ref} (${shortHash(ref)})`;
  const plugins = [...new Set(modes.flatMap((mode) => mode.plugins))];
  const builds = commitBuilds(commits, (path) => sameInCommit(ref, path));
  for (const build of builds) {
    if (build.overlay.length > 0) {
      console.log(
        `The build of ${label} takes ${build.overlay.join(', ')} of the working tree, because the paths differ.`,
      );
    }
    await withRefSite(
      ref,
      label,
      async (other) => {
        for (const commitRender of build.renders) {
          await commitRender(other, label);
        }
      },
      build.overlay,
      plugins,
    );
  }
}

/** The usage text of the tool. */
const USAGE = [
  `Usage: pnpm close-views <${CLOSE_ROLES.join('|')}> <output directory> [--target head] [--views <view|deg,...>] [--moments <moment,...>] [--zoom <n>] [--elevation <deg>] [--aim <x>,<z>,<height>] [--scale <n>] [--probe <${GALLERY_PROBES.join('|')},...>] [--url <url>] [--glb <file>] [--set <changes>] [--lineup [--with <role,...>] [--crop <n>] [--box <x>,<y>,<w>,<h>]] [--base <ref> [--pairs <view|cell,...> [--crop <x>,<y>,<w>,<h>]] [--sheet [--box <x>,<y>,<w>,<h>]]]`,
  '       pnpm close-views lineup <species,...> <output directory> [--url <url>] [--base <ref>]',
  `       pnpm close-views species <species,...> <output directory> [--views <${SPECIES_VIEWS.map((view) => view.name).join('|')},...>] [--moment <play|rest|lift<p>|lower<p>>] [--zoom <n>] [--elevation <deg>] [--url <url>] [--base <ref>]`,
  `       pnpm close-views play <output directory> [--demo <id> | --midi <path>] [--time <s>]... [--strip <from>:<step>:<count>] [--camera <${PLAY_CAMERAS.map((camera) => camera.name).join('|')}|<dx>,<dy>,<wheel>|<JSON>>]... [--camera-file <json>] [--cinematic] [--shot <seat|species>] [--at <seat|species> [--azimuth <deg>]... [--zoom <z>] [--elevation <deg>]] [--url <url>] [--base <ref>] [--set <changes>]... [--size <w>x<h>]`,
  '       pnpm close-views batch <output directory> [--species <species,...> [--moments <play|rest|lift<p>|lower<p>,...>] [--views <view,...>] [--zoom <n>]... [--elevation <deg>] [--lineup]] [--role <role>]... [--camera <camera>]... [--demo <id>] [--time <s>] [--url <url>] [--base <ref>]',
  '       pnpm close-views audit <output directory> [--roles <role,...>] [--url <url>] [--base <ref>]',
].join('\n');

/**
 * Renders the close view of a role: `node tools/close-views.ts <role> <dir> [--zoom <n>]
 * [--elevation <deg>] [--scale <n>] [--url <url>] [--base <ref>]` (design 7.1), a lineup of
 * species: `node tools/close-views.ts lineup <species,...> <dir>` ({@link lineupViews}), or
 * species at named views: `node tools/close-views.ts species <species,...> <dir>`
 * ({@link speciesViews}), or play frames of a demo: `node tools/close-views.ts play <dir>`
 * ({@link playViews}), or a batch of these modes: `node tools/close-views.ts batch <dir>`
 * ({@link batchArgs}), which builds and serves each tree one time for all its parts. It writes
 * the animal of the role at each moment from each view into `<dir>`, and the grid of all cells as
 * `<role>-views.png` and `<role>-views.webp`. `--zoom` and `--elevation` change the camera of the
 * role for each view, `--scale` the size of each cell, and `--probe` renders one grid for each
 * probe of the body ({@link probeViews}). With `--url`, it uses a running site,
 * such as the dev server, in place of the built site. With `--glb <file>` or `--set <changes>`, a
 * role renders a variant of the working tree from a build of its own ({@link startVariantSite}),
 * with no commit and no edit of a file. The play frames take `--set` in the same way. With `--base`, it also builds the commit in
 * a temporary folder, and writes the grid of the commit above the grid of the working tree. With
 * {@link CHECK_FLAG} first, it only checks the command line and the commit, so that the script of
 * `package.json` stops before the build on a wrong command line.
 */
async function main(): Promise<void> {
  const all = process.argv.slice(2);
  const check = all[0] === CHECK_FLAG;
  let mode: CloseMode | null = null;
  try {
    mode = closeModeArgs(check ? all.slice(1) : all);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (!mode) {
    console.error(USAGE);
    process.exit(1);
  }
  if (mode.args.base !== null) {
    // An unknown commit stops the tool before the first render.
    try {
      shortHash(mode.args.base);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  let variant: SiteVariant | null = null;
  if (mode.kind === 'role') {
    // A wrong variant stops the tool before the build.
    try {
      variant = await siteVariant(mode.args, check);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  if (mode.kind === 'play') {
    // A subject with no shot or no player, or a wrong hold change, stops the tool before the
    // build. The hold changes stay in memory, so that the player of --at is the player of the
    // variant.
    const { demo, midi, time, at, holds } = mode.args;
    try {
      const [only] = holds;
      if (holds.length === 1 && only !== undefined) {
        console.log(`The working tree takes the hold changes ${setHolds(only).text}.`);
      } else if (holds.length > 1) {
        // Each variant must fit before the build. The parts apply their own changes in turn.
        for (const [index, changes] of holds.entries()) {
          const applied = setHolds(changes);
          applied.undo();
          console.log(`${playSetDir(mode.args.out, index)}: the hold changes ${applied.text}.`);
        }
      }
      if (holds.length > 0) {
        variant = { body: null, holds, entry: APP_ENTRY };
      }
      if (time.kind === 'shot') {
        await chooseShot(demo, time.subject, midi);
      }
      if (at) {
        await aimTarget(demo, at, midi);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  if (check) {
    return;
  }

  const { url } = mode.args;
  const modes: readonly SingleMode[] =
    mode.kind === 'batch'
      ? mode.args.parts
      : mode.kind === 'play'
        ? playParts(mode.args).map((args) => ({ kind: 'play', args }))
        : [mode];
  for (const part of modes) {
    await mkdir(part.args.out, { recursive: true });
  }
  const plugins = [
    ...new Set(modes.flatMap((part) => (part.kind === 'play' ? playPluginKinds(part.args) : []))),
  ];
  const site = url
    ? {
        base: url,
        browser: await chromium.launch({ args: chromiumArgs(process.platform) }),
        close: async (): Promise<void> => undefined,
      }
    : variant || plugins.length > 0
      ? await startVariantSite([
          ...(variant ? [variantPlugin(variant)] : []),
          ...playPlugins(ROOT, plugins),
        ])
      : await startSite(ROOT, SERVER_PORT);
  try {
    await renderModes(modes.map(modeRender), site, mode.args.base);
  } finally {
    if (url) {
      await site.browser.close();
    }
    await site.close();
  }
}

if (import.meta.main) {
  await main();
}
