import type { SpeciesId } from '../models/species.ts';

/** The model sheets of `docs/reference/` that the views page can copy (design 7.1). */
export type SheetId = 'fox' | 'rabbit' | 'dog' | 'polar-bear' | 'bear';

/** The instruments of the model sheets (design 7.1). */
export type SheetInstrument = 'violin' | 'cello' | 'piano' | 'baton';

/** One view of a model sheet: the turn of the model and the place of its seat on the page. */
interface SheetView {
  /**
   * The turn of the model from the front view, in degrees. 0 shows the front, 90 the right side,
   * and 180 the back. A value between them shows the front and the right side together.
   */
  readonly turnDeg: number;
  /** The page column of the model origin (the middle of the seat), in CSS pixels. */
  readonly x: number;
  /** The page row of the floor under the model, in CSS pixels. */
  readonly floor: number;
  /**
   * False to hide the instrument. The open lid of the piano hides the head of the polar bear in
   * the front view, and the sheet shows the head over the lid.
   */
  readonly showInstrument: boolean;
}

/**
 * The page of one model sheet (design 7.1): the size and the background of the sheet, its scale,
 * its camera, and the place of each view. A person or a script can put the page under the sheet
 * and compare them pixel for pixel.
 */
export interface ViewSheet {
  /** The file of the sheet in `docs/reference/`. */
  readonly file: string;
  /** The species of the sheet. */
  readonly species: SpeciesId;
  /** The instrument of the sheet. */
  readonly instrument: SheetInstrument;
  /** The width of the page, in CSS pixels. */
  readonly width: number;
  /** The height of the page, in CSS pixels. */
  readonly height: number;
  /**
   * The number of device pixels for each CSS pixel that gives the size of the sheet image. The
   * fox sheet is 2494 × 1354 px, so its page is half of that size.
   */
  readonly sheetScale: number;
  /** The background color of the sheet, in sRGB. */
  readonly background: string;
  /** The scale of the sheet, in CSS pixels for each meter. */
  readonly pixelsPerMeter: number;
  /** The angle of the camera above the floor, in degrees. */
  readonly elevationDeg: number;
  /**
   * True when the key light casts shadows, as in most sheets. `bear-views.png` has a soft body
   * light with no cast shadow on the bear, and the shadow of the raised right arm made a dark band
   * across the chest of the page.
   */
  readonly shadows: boolean;
  /**
   * The factors of the key light and of the fill light of the views page (`VIEW_LIGHT`), for the
   * light of the sheet. `bear-views.png` has a soft frontal light: with the light of the other
   * sheets, the shaded side of the face of the bear was nearly black.
   */
  readonly light: { readonly key: number; readonly fill: number };
  /** The front, the side, and the back view, in this order. */
  readonly views: readonly [SheetView, SheetView, SheetView];
}

/**
 * The pages of the model sheets (design 7.1). The places and the scales come from the sheet
 * images, in CSS pixels of the page:
 *
 * - `fox-views.png`: the chair seat is 258 px of the sheet above the floor. With a chair of
 *   0.35 m, the sheet has 737 px for each meter, and the page has half of that. The chairs of the
 *   app fit the legs of each species, and the scales keep these values.
 * - `rabbit-views.png`: the chair seat is 110 px above the floor, so 314 px for each meter.
 * - `dog-views.png`: the line of 1.8 m is 560 px above the line of 0 m, so 311 px for each meter.
 * - `polar-bear-views.png`: the height mark of 1.8 m is 333 px, so 185 px for each meter.
 * - `bear-views.png` has no scale in meters. The bear is 572 px high from the soles to the tops
 *   of the ears, and the conductor of the stage is 1.6 m high, so the page has 360 px for each
 *   meter. The soles are on the top of the podium at row 731, and the podium of the stage is
 *   0.35 m high, so the floor is at row 857, on the floor line of the sheet.
 *
 * The turns come from the chairs of the sheets: the front view of the rabbit shows a little of
 * its right side (20°), and the side views of the fox (65°), the rabbit (70°), and the dog (80°)
 * show a part of the front. The camera is orthographic, and the sheets have a small perspective.
 */
export const VIEW_SHEETS = {
  fox: {
    file: 'fox-views.png',
    species: 'fox-red',
    instrument: 'violin',
    width: 1247,
    height: 677,
    sheetScale: 2,
    background: '#0f0f0f',
    pixelsPerMeter: 368.5,
    elevationDeg: 8,
    shadows: true,
    light: { key: 1, fill: 1 },
    views: [
      { turnDeg: 0, x: 192.5, floor: 558.5, showInstrument: true },
      { turnDeg: 65, x: 550, floor: 559, showInstrument: true },
      { turnDeg: 180, x: 1040, floor: 560, showInstrument: true },
    ],
  },
  rabbit: {
    file: 'rabbit-views.png',
    species: 'rabbit',
    instrument: 'violin',
    width: 1280,
    height: 720,
    sheetScale: 1,
    background: '#141313',
    pixelsPerMeter: 314,
    elevationDeg: 10,
    shadows: true,
    light: { key: 1, fill: 1.5 },
    views: [
      { turnDeg: 20, x: 207, floor: 547, showInstrument: true },
      { turnDeg: 70, x: 555, floor: 550, showInstrument: true },
      { turnDeg: 180, x: 1062, floor: 555, showInstrument: true },
    ],
  },
  dog: {
    file: 'dog-views.png',
    species: 'dog',
    instrument: 'cello',
    width: 1280,
    height: 720,
    sheetScale: 1,
    background: '#d5d6d8',
    pixelsPerMeter: 311,
    elevationDeg: 5,
    shadows: true,
    light: { key: 1, fill: 1 },
    views: [
      { turnDeg: 0, x: 232, floor: 618, showInstrument: true },
      { turnDeg: 80, x: 555, floor: 620, showInstrument: true },
      { turnDeg: 180, x: 1060, floor: 620, showInstrument: true },
    ],
  },
  'polar-bear': {
    file: 'polar-bear-views.png',
    species: 'polar-bear',
    instrument: 'piano',
    width: 1280,
    height: 720,
    sheetScale: 1,
    background: '#c7c6c8',
    pixelsPerMeter: 185,
    elevationDeg: 2,
    shadows: true,
    light: { key: 1, fill: 1 },
    views: [
      { turnDeg: 0, x: 192, floor: 396, showInstrument: false },
      { turnDeg: 90, x: 470, floor: 396, showInstrument: true },
      { turnDeg: 180, x: 1052, floor: 396, showInstrument: true },
    ],
  },
  bear: {
    file: 'bear-views.png',
    species: 'bear',
    instrument: 'baton',
    width: 1536,
    height: 1024,
    sheetScale: 1,
    background: '#d7d7d9',
    pixelsPerMeter: 360,
    elevationDeg: 3,
    shadows: false,
    light: { key: 0.55, fill: 1.55 },
    views: [
      { turnDeg: 0, x: 279, floor: 857, showInstrument: true },
      { turnDeg: 90, x: 718, floor: 857, showInstrument: true },
      { turnDeg: 180, x: 1259, floor: 857, showInstrument: true },
    ],
  },
} as const satisfies Readonly<Record<SheetId, ViewSheet>>;

/**
 * Gives the model sheet that a URL query names (`?sheet=fox`).
 *
 * @param query The query of the URL, such as `?sheet=fox`.
 * @returns The sheet, or `null` if the query names no sheet.
 */
export function sheetOf(query: string): ViewSheet | null {
  const name = new URLSearchParams(query).get('sheet');
  return isSheetId(name) ? VIEW_SHEETS[name] : null;
}

/**
 * Finds if a text names a model sheet, such as the key `sheet` of a URL query or an argument of a
 * tool.
 *
 * @param name The text, or `null` or `undefined` for no text.
 * @returns True for a key of {@link VIEW_SHEETS}.
 */
export function isSheetId(name: string | null | undefined): name is SheetId {
  return !!name && Object.hasOwn(VIEW_SHEETS, name);
}

/**
 * Gives whether a URL query asks for the silhouette of a sheet page (`?sheet=fox&matte`): the body
 * of the model in white on black, with no instrument, no seat, and no light. A script compares
 * this silhouette with the matte of the sheet (design 7.1).
 *
 * @param query The query of the URL, such as `?sheet=fox&matte`.
 * @returns True if the query has the key `matte`.
 */
export function matteOf(query: string): boolean {
  return new URLSearchParams(query).has('matte');
}

/**
 * Gives the turn of a model around y for a view of a sheet. A model faces -z, and the camera looks
 * along -z, so the turn of 180° shows the front.
 *
 * @param view The view.
 * @returns The turn, in radians.
 */
export function sheetTurn(view: SheetView): number {
  return ((view.turnDeg - 180) * Math.PI) / 180;
}
