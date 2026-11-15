import type { DemoId } from '../app/demos.ts';
import type { SpeciesId } from '../models/species.ts';
import type { InstrumentId } from '../models/instruments/types.ts';

/** The three views of a model in `animals.webp`. */
export type ViewSide = 'front' | 'side' | 'back';

/**
 * One model of the views page, with its views (design 7.1). The model stands on its seat, on the
 * podium, or on the floor, with the props that `animals.webp` shows.
 */
export interface ViewGroup {
  readonly species: SpeciesId;
  readonly instrument: InstrumentId;
  /** True for a music stand in front of the player. */
  readonly stand: boolean;
  /** True for the conductor on the podium, with the conductor stand. */
  readonly podium: boolean;
  /** The center of each view on the page, in CSS pixels, in the order front, side, and back. */
  readonly centers: readonly [number, number, number];
}

/** One row of the views page: a title, the models, and the height of the models on the page. */
interface ViewRow {
  readonly title: string;
  /** The top of the title, in CSS pixels. */
  readonly titleTop: number;
  /** The floor under the models, in CSS pixels. */
  readonly floor: number;
  /** The top of the tallest part of each model, in CSS pixels. */
  readonly top: number;
  /** The top of the view labels, in CSS pixels. */
  readonly labelTop: number;
  readonly groups: readonly ViewGroup[];
}

/** The side of the square views page, in CSS pixels: the size of `animals.webp`. */
export const VIEWS_PAGE_SIZE = 1024;

/**
 * The body light of the views page (design 7.1). The intensities are three.js units, and the
 * page has the tone mapping of the stage (AgX) and the grade of its final pass, so that the
 * species colors read as on the stage. The values give the lit fur of the four model sheets within
 * 10% of their value (fox, rabbit, dog, and polar bear). A cool fill (`#c8d4ff`) made the shaded
 * white fur blue-gray, with a hue of 353 on the rabbit against 26 in its sheet, so the fill is warm.
 */
export const VIEW_LIGHT = {
  /** The exposure of the AgX tone mapping. */
  exposure: 1.15,
  /** The color of the key light from the left, above, and the front. */
  keyColor: '#ffd0a0',
  /** The intensity of the key light. */
  key: 2.6,
  /** The color of the fill light from above. */
  skyColor: '#fff4e8',
  /** The color of the fill light from below: the light from a warm floor. */
  groundColor: '#6a5a4a',
  /** The intensity of the fill light. */
  fill: 1.6,
  /** The color of the rim light from behind. */
  rimColor: '#ffffff',
  /** The intensity of the rim light. */
  rim: 1.5,
} as const;

/** The angle of the camera of the views page above the floor, as in `animals.webp`. */
export const VIEW_ELEVATION_DEG = 8;

/**
 * The rows of the views page (design 7.1). The places come from `animals.webp` (1024 × 1024 px),
 * so that a person can put the page beside the reference and compare each view. The wolf with the
 * clarinet and the dog with the cello, the cello player of the cast, take the places of the two
 * gray animals.
 */
export const VIEW_ROWS: readonly ViewRow[] = [
  {
    title: 'RABBITS',
    titleTop: 36,
    floor: 295,
    top: 76,
    labelTop: 312,
    groups: [
      {
        species: 'rabbit',
        instrument: 'violin',
        stand: false,
        podium: false,
        centers: [103, 273, 421],
      },
      {
        species: 'rabbit',
        instrument: 'clarinet',
        stand: false,
        podium: false,
        centers: [593, 742, 924],
      },
    ],
  },
  {
    title: 'FOXES',
    titleTop: 358,
    floor: 602,
    top: 399,
    labelTop: 626,
    groups: [
      {
        species: 'fox-red',
        instrument: 'violin',
        stand: false,
        podium: false,
        centers: [103, 273, 421],
      },
      {
        species: 'fox-red',
        instrument: 'clarinet',
        stand: true,
        podium: false,
        centers: [593, 742, 920],
      },
    ],
  },
  {
    title: 'OTHER ANIMALS',
    titleTop: 671,
    floor: 906,
    top: 722,
    labelTop: 929,
    groups: [
      {
        species: 'wolf',
        instrument: 'clarinet',
        stand: false,
        podium: false,
        centers: [75, 175, 275],
      },
      {
        species: 'bear',
        instrument: 'baton',
        stand: false,
        podium: true,
        centers: [403, 520, 634],
      },
      {
        species: 'dog',
        instrument: 'cello',
        stand: false,
        podium: false,
        centers: [752, 866, 970],
      },
    ],
  },
];

/**
 * The rows of the page of the bear family (`/views.html?page=bears`, design 7.1): the polar bear
 * at the piano, as `polar-bear-views.png`, and the bear on the podium and the panda with the
 * trombone, as `orchestra-latest.png`.
 */
export const BEAR_VIEW_ROWS: readonly ViewRow[] = [
  {
    title: 'POLAR BEAR',
    titleTop: 20,
    floor: 300,
    top: 60,
    labelTop: 312,
    groups: [
      {
        species: 'polar-bear',
        instrument: 'piano',
        stand: false,
        podium: false,
        centers: [150, 500, 860],
      },
    ],
  },
  {
    title: 'BEAR',
    titleTop: 345,
    floor: 620,
    top: 385,
    labelTop: 632,
    groups: [
      {
        species: 'bear',
        instrument: 'baton',
        stand: false,
        podium: true,
        centers: [200, 500, 800],
      },
    ],
  },
  {
    title: 'PANDA',
    titleTop: 665,
    floor: 940,
    top: 705,
    labelTop: 952,
    groups: [
      {
        species: 'panda',
        instrument: 'trombone',
        stand: false,
        podium: false,
        centers: [200, 500, 800],
      },
    ],
  },
];

/** A page of the views page: its rows, and the demo that gives the playing poses. */
interface ViewPage {
  readonly rows: readonly ViewRow[];
  /** The demo whose first notes give the playing poses of the players. */
  readonly poseDemo: DemoId;
}

/**
 * The pages of the views page (design 7.1). The page `animals` is the default. The demo of the
 * page of the bears has a piano and trombones.
 */
const VIEW_PAGES = {
  animals: { rows: VIEW_ROWS, poseDemo: 'beethoven-9' },
  bears: { rows: BEAR_VIEW_ROWS, poseDemo: 'boulanger-matin' },
} as const satisfies Readonly<Record<string, ViewPage>>;

/**
 * Gives the page of the views page that a URL query names (`?page=bears`), or the default page.
 *
 * @param query The query of the URL, such as `?page=bears`.
 * @returns The page.
 */
export function viewPageOf(query: string): ViewPage {
  const name = new URLSearchParams(query).get('page');
  return name === 'bears' ? VIEW_PAGES.bears : VIEW_PAGES.animals;
}

/**
 * Gives the turn of a model around y for a view. A model faces -z, and the camera looks along -z.
 * The side view shows the right side of the model, which faces the right edge of the page, as in
 * `animals.webp`.
 *
 * @param view The view.
 * @returns The turn, in radians.
 */
export function viewTurn(view: ViewSide): number {
  switch (view) {
    case 'front':
      return Math.PI;
    case 'side':
      return -Math.PI / 2;
    case 'back':
      return 0;
    default: {
      const unhandled: never = view;
      throw new Error(`The view "${String(unhandled)}" is not known.`);
    }
  }
}
