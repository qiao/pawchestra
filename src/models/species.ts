import type { BowGrip } from './instruments/strings.ts';
import { isScaledInstrument } from './instruments/types.ts';
import type { CymbalForm, InstrumentId, ScaledInstrument } from './instruments/types.ts';
import type { StudioBodyName } from './studio-body.ts';
import type { StudioPalette } from './studio-format.ts';
import { STUDIO_BADGER } from './studio/badger.ts';
import { STUDIO_BEAR } from './studio/bear.ts';
import { STUDIO_BEAVER } from './studio/beaver.ts';
import { STUDIO_CAT } from './studio/cat.ts';
import { STUDIO_DEER } from './studio/deer.ts';
import { STUDIO_DOG } from './studio/dog.ts';
import { STUDIO_ELEPHANT } from './studio/elephant.ts';
import { STUDIO_FOX } from './studio/fox.ts';
import { STUDIO_HIPPO } from './studio/hippo.ts';
import { STUDIO_MONKEY } from './studio/monkey.ts';
import { STUDIO_MOUSE } from './studio/mouse.ts';
import { STUDIO_PANDA } from './studio/panda.ts';
import { STUDIO_PENGUIN } from './studio/penguin.ts';
import { STUDIO_PIG } from './studio/pig.ts';
import { STUDIO_POLAR_BEAR } from './studio/polar-bear.ts';
import { STUDIO_RABBIT } from './studio/rabbit.ts';
import { STUDIO_RHINO } from './studio/rhino.ts';
import { STUDIO_WOLF } from './studio/wolf.ts';
import { SPECIES_COLORS } from './colors.ts';
import type { SpeciesColors } from './colors.ts';

/** The parameters of one species (design 4.3, 4.4, 4.5): each species has a studio body. */
export interface SpeciesParams {
  /** The colors of the species (design 4.5, species colors). */
  readonly colors: SpeciesColors;
  /** The head height `H` of the body, in meters (design 4.5). */
  readonly headHeight: number;
  /**
   * The height of the seat of the chair above the floor, in H (design 4.5): the length of the
   * seated legs. The chair, the stool, and the bench fit it (`seatHeights()` of `props.ts`).
   */
  readonly seatHeight: number;
  /**
   * The scale of the violin and its bow for the species, as a factor of the violin of the app
   * (design 4.6). It is 1 when it is not given. A species can play a smaller violin, as a child
   * plays a fractional size. The rule of a violin shop sizes a violin for the arms: with the violin
   * under the chin and the left arm extended, the scroll lies in the middle of the palm. The rabbit
   * and the red fox keep a size that is larger than the rule gives for their arms.
   */
  readonly violinScale?: number;
  /**
   * The scale of the viola and its bow for the species, as a factor of the viola of the app
   * (design 4.6). It is 1 when it is not given. Violas have no fixed size: a shop sizes a viola by
   * the body length for the arm of the player, from junior violas of 12 inches to large violas of
   * 17 inches (`docs/reference/string-technique.md`, section 1.10).
   */
  readonly violaScale?: number;
  /**
   * The scale of the cello and its bow for the species, as a factor of the cello of the app
   * (design 4.6). It is 1 when it is not given. A species with short arms plays a smaller cello,
   * as a child plays a fractional size: a 1/2 cello is 0.87 of the length of a 4/4 cello. The
   * end pin grows, so that the top of the body of the cello stays at the chest of the player.
   */
  readonly celloScale?: number;
  /**
   * The scale of the contrabass and its bow for the species, as a factor of the contrabass of the
   * app (design 4.6). It is 1 when it is not given. A species with short arms plays a smaller
   * contrabass, as a child plays a fractional size. The end pin grows, so that the top of the body
   * of the contrabass stays at its place.
   */
  readonly bassScale?: number;
  /**
   * The scale of the oboe for the species, as a factor of the oboe of the app (design 4.6). It is
   * 1 when it is not given. A species with short arms plays a smaller oboe, as a child plays a
   * fractional violin. The oboe shrinks toward the tip of the reed, so the reed stays in the
   * mouth, and the grips of the palms come nearer to the mouth.
   */
  readonly oboeScale?: number;
  /**
   * The scale of the bassoon for the species, as a factor of the bassoon of the app (design 4.6).
   * It is 1 when it is not given. A species with short arms plays a smaller bassoon, as a child
   * plays a fractional violin. The bassoon shrinks toward the reed, so the reed stays in the
   * mouth, and the grips of the palms come nearer to the mouth.
   */
  readonly bassoonScale?: number;
  /**
   * The scale of the trumpet for the species, as a factor of the trumpet of the app (design 4.6).
   * It is 1 when it is not given. A species with short arms plays a smaller trumpet, as a child
   * plays a fractional violin. The trumpet shrinks toward the mouthpiece, so the mouthpiece stays
   * at the mouth, and the grips of the palms come nearer to the mouth.
   */
  readonly trumpetScale?: number;
  /**
   * The scale of the pair of crash cymbals for the species, as a factor of the cymbals of the app
   * (design 4.6). It is 1 when it is not given. A species with short arms in front of a deep body
   * plays smaller hand cymbals. Each cymbal shrinks toward the palm, so the palm keeps its place
   * on the strap side.
   */
  readonly cymbalScale?: number;
  /**
   * The scale of the harp for the species, as a factor of the concert harp of the app (design
   * 4.6). It is 1 when it is not given. A species with short arms plays a smaller harp, as a child
   * plays a smaller lever harp. The harp shrinks toward its base on the floor, so the strings come
   * down to the chest of a small seated player, and the harp stands nearer to it.
   */
  readonly harpScale?: number;
  /**
   * The form of the cymbals of the species (design 4.6): `hand` when it is not given. A species
   * whose short arms cannot hold hand cymbals out of a deep body plays a suspended cymbal on a
   * stand with two yarn mallets.
   */
  readonly cymbalForm?: CymbalForm;
  /**
   * The lengths by which the lead pipe of the tuba reaches back and to the left from the
   * mouthpiece, in meters (design 4.6): the body of the tuba stands this far nearer to the player
   * and this far further to the left than the tuba of the app. Both are 0 when it is not given. A
   * long muzzle puts the mouthpiece far in front of the chest, so the body of the tuba stands
   * under the muzzle in front of the chest, the paws reach its grips, and the bell stands at the
   * left of the horn and the head.
   */
  readonly tubaPipe?: readonly [back: number, left: number];
  /**
   * True for a species that sits with no chair (design 4.5, props). The body keeps its seated
   * pose, its seat height, and its feet on the floor, and the app builds no chair under it
   * (`seatHeights()` and `buildSupport()` of `props.ts`). The species sits on a chair when it is
   * not given.
   */
  readonly noChair?: true;
  /**
   * The grip of the bow in the right paw of the species (design 4.6): the place of the stick and
   * its turn in the palm. The grip of the bind pose of the bow (`BOW_GRIP`) when it is not given.
   */
  readonly bowGrip?: BowGrip;
  /** The studio body of the species (`models/studio-body.ts`, design 4.4). */
  readonly body: StudioBodyName;
  /**
   * Another palette of the faces of a studio body (`StudioBody.palettes`), such as the tan palette
   * of the fox mesh. The colors of the mesh when it is not given.
   */
  readonly palette?: StudioPalette;
  /**
   * The seated tail of a studio body: `curl` when it lies curled on the seat
   * (`studio.tailCurl` of the rig config), so that it does not sway in the idle motion on a seat
   * (design 5.1). A tail that hangs behind the chair sways when it is not given.
   */
  readonly seatedTail?: 'curl';
  /**
   * True for a studio body whose ears hang beside the head and the neck (`earFlap` of the rig
   * config), so that they do not twitch to the side in the idle motion (design 5.1). A real
   * hanging ear does not twitch to the side, and the twitch of standing ears pushes the tips of
   * the hanging ears of the dog into its cheeks. The ears twitch when it is not given.
   */
  readonly hangingEars?: true;
}

/**
 * The ids of the species that the generator builds (design 4.3), in the order of {@link SPECIES}.
 * The fox has two color variants: `fox-red` for the second violins and `fox-tan` for the flutes.
 */
export const SPECIES_IDS = [
  'rabbit',
  'fox-red',
  'fox-tan',
  'wolf',
  'elephant',
  'bear',
  'cat',
  'hippo',
  'deer',
  'panda',
  'mouse',
  'beaver',
  'dog',
  'monkey',
  'pig',
  'rhino',
  'badger',
  'penguin',
  'polar-bear',
  'mannequin',
] as const;

/** A species that the generator builds: one of {@link SPECIES_IDS}. */
export type SpeciesId = (typeof SPECIES_IDS)[number];

/**
 * Finds if a text is the id of a species.
 *
 * @param value The text.
 * @returns True for one of {@link SPECIES_IDS}.
 */
export function isSpeciesId(value: string): value is SpeciesId {
  return SPECIES_IDS.some((id) => id === value);
}

/**
 * The parameter of the scale of each instrument of `SCALED_INSTRUMENTS` (design 4.6). A new
 * instrument of that list stops the typecheck until it has its parameter here.
 */
export const SCALE_PARAMS = {
  violin: 'violinScale',
  viola: 'violaScale',
  cello: 'celloScale',
  contrabass: 'bassScale',
  oboe: 'oboeScale',
  bassoon: 'bassoonScale',
  trumpet: 'trumpetScale',
  cymbals: 'cymbalScale',
  harp: 'harpScale',
} as const satisfies Readonly<Record<ScaledInstrument, keyof SpeciesParams>>;

/**
 * Gives the scale of the instrument and its bow of a species (design 4.6): the parameter of
 * {@link SCALE_PARAMS} for an instrument of `SCALED_INSTRUMENTS`, and 1 for each other instrument.
 *
 * @param params The parameters of the species.
 * @param instrument The instrument.
 * @returns The scale, as a factor of the instrument of the app.
 */
export function instrumentScale(params: SpeciesParams, instrument: InstrumentId): number {
  return isScaledInstrument(instrument) ? (params[SCALE_PARAMS[instrument]] ?? 1) : 1;
}

/** The parameters of each species (design 4.3, 4.5). */
export const SPECIES = {
  /**
   * Rabbit, the first violins (reference image). It has the studio body of the A-pose mesh
   * `assets/models/rabbit/rabbit-apose.glb`, which `pnpm rig-mesh rabbit` rigs with no split
   * (design 4.4), seated with the bind pose of the studio rabbit, and standing as a soloist. Its
   * head height is the head of the studio body, and its chair fits its legs: the seat height is the
   * seat of the studio body, in H. The rabbit has short arms that bend less to play, so the arms
   * reach 0.36 m, and the violin is 0.83 of the violin of the app. With the full violin of 0.958,
   * the arms must stretch 1.62 times, and their long faces fold.
   *
   * The stick of the bow passes through the middle of the closed right paw, as for the cat. The
   * stick lies 40° from square toward the wrist, near the line of the middles of the turned paw, so
   * that the paw keeps the stick in each turn. The paw holds the stick 2.3 cm nearer to the tip
   * than the grip of `BOW_GRIP`: at the place of that grip along the stick, the skin of the right
   * upper arm folds in 2.3% of the play samples, and at this place in 1.3%. With the grip of
   * `BOW_GRIP`, the stick lies 3.7 cm to 5.3 cm out from the middle of the paw on the palm side,
   * under the paw.
   */
  rabbit: {
    body: 'studio-rabbit',
    colors: SPECIES_COLORS.rabbit,
    violinScale: 0.83,
    bowGrip: { at: [-0.0084, -0.04, 0.0553], turn: 40 * (Math.PI / 180) },
    headHeight: STUDIO_RABBIT.headHeight,
    seatHeight: STUDIO_RABBIT.seatHeight / STUDIO_RABBIT.headHeight,
  },
  /**
   * Red-orange fox with a white face, the second violins (reference image). It has the studio body
   * of the mesh `assets/models/fox/fox.glb`, which `pnpm rig-mesh fox` rigs (design 4.4), seated
   * with its long thighs on the seat and its tail back through the chair, and standing as a
   * soloist. The rig moves the orange fur of the texture to the red-orange of the reference foxes
   * (`colors.shift` of `tools/mesh-rigs/fox.json`, design 4.5). Its head height is the head of the
   * studio body, and its chair fits its legs: the seat height is the seat of the studio body, in H.
   * Its violin is almost the violin of the app.
   *
   * The stick of the bow passes through the closed right paw, 50° from square toward the wrist,
   * along the line nearest to the middles of the turned paw. The skin of the long wrist of the fox
   * moves the middle of the paw by up to 3.8 cm on its bone (2.1 cm with this grip), so one line
   * keeps the seated paw within 1.2 cm and the hanging paw of a soloist within 2.2 cm. A turn of
   * 60° folds face 184 of the right arm in 43% of the play samples. With the grip of `BOW_GRIP`,
   * the stick lies 4.0 cm to 5.3 cm out from the middle of the paw, under the paw.
   */
  'fox-red': {
    body: 'studio-fox',
    colors: SPECIES_COLORS['fox-red'],
    violinScale: 0.998,
    bowGrip: { at: [-0.0045, -0.0298, -0.1025], turn: 50 * (Math.PI / 180) },
    headHeight: STUDIO_FOX.headHeight,
    seatHeight: STUDIO_FOX.seatHeight / STUDIO_FOX.headHeight,
  },
  /**
   * Light tan fox, the flutes (reference image). It has the studio body of the red fox with the tan
   * palette of the faces (design 4.4, 4.5): the colors of the texture of the mesh, before the color
   * shift of the red fox, moved to the colors of the tan fox. It sits with its tail back through
   * the chair, and stands as a soloist. Its head height is the head of the studio body, and its
   * chair fits its legs.
   */
  'fox-tan': {
    body: 'studio-fox',
    palette: 'tan',
    colors: SPECIES_COLORS['fox-tan'],
    headHeight: STUDIO_FOX.headHeight,
    seatHeight: STUDIO_FOX.seatHeight / STUDIO_FOX.headHeight,
  },
  /**
   * Wolf, the clarinets: a gray wolf with a cream chest, belly, and muzzle, dark lower legs, and a
   * bushy tail with a cream tip. It has the studio body of the mesh `assets/models/wolf/wolf.glb`,
   * which `pnpm rig-mesh wolf` rigs (design 4.4), with the size of the reference images, then 0.9
   * of the height and 1.2 of the width. It sits on a chair that fits its legs, with the tail back
   * over the seat and down behind it, and stands as a soloist. Its head height is the head of the
   * studio body, and the seat height is the seat of the studio body, in H. The violin size is for
   * the recast role `violinist@wolf` of the role tools only: no wolf plays the violin in the app.
   * It is the rule of a violin shop for the arm of the wolf with the violin on the shoulder (0.732),
   * rounded up to 0.75 (`pnpm hold-reach wolf --instrument violin`).
   */
  wolf: {
    body: 'studio-wolf',
    colors: SPECIES_COLORS.wolf,
    headHeight: STUDIO_WOLF.headHeight,
    seatHeight: STUDIO_WOLF.seatHeight / STUDIO_WOLF.headHeight,
    violinScale: 0.75,
  },
  /**
   * Elephant, the timpani: a gray elephant with large ears, a long trunk, and cream tusks. It has
   * the studio body of the mesh `assets/models/elephant/elephant-apose.glb`, which `pnpm rig-mesh
   * elephant` rigs (design 4.4), with the size of the reference images and the arms of the mesh. It
   * stands at its timpani, as the elephant of `orchestra-latest.png`. The trunk, the tusks, and the
   * ears follow the head. Its head height is the head of the studio body without the trunk, and the
   * seat height is the seat of the studio body, in H.
   */
  elephant: {
    body: 'studio-elephant',
    colors: SPECIES_COLORS.elephant,
    headHeight: STUDIO_ELEPHANT.headHeight,
    seatHeight: STUDIO_ELEPHANT.seatHeight / STUDIO_ELEPHANT.headHeight,
  },
  /**
   * Bear, the conductor (reference image). It has the studio body of the T-pose mesh
   * `assets/models/bear/bear-tpose.glb`, which `pnpm rig-mesh bear` rigs with its own faces (design
   * 4.4). Its head height is the head of the studio body.
   */
  bear: {
    body: 'studio-bear',
    colors: SPECIES_COLORS.bear,
    headHeight: STUDIO_BEAR.headHeight,
    seatHeight: 0.75,
  },
  /**
   * Gray cat with a cream belly, the violas (`cat-views.png`). It has the studio body of the mesh
   * `assets/models/cat/cat.glb`, which `pnpm rig-mesh cat` rigs (design 4.4), with the size, the
   * reach, and the leg factor of the red fox. It sits with its tail curled on the seat around the
   * left side of the haunch, and stands as a soloist. Its head height is the head of the studio
   * body, and its chair fits its legs: the seat height is the seat of the studio body, in H. It
   * plays a viola of about 10 inches, with a body of 259 mm, 0.74 of the viola of the app
   * (`violaScale`), as a violin shop sizes a viola for its arm, so that its left paw reaches the
   * nut and its bow paw the tip of the hair.
   *
   * The stick of the bow passes through the middle of the closed right paw. The paw of the studio
   * turns in the plane of its palm toward the forearm by 0° to 70° (`PAW_TURN` of `studio-rig.ts`),
   * and its middle moves on an arc around the wrist. The stick lies along the line nearest to that
   * arc, 50° from square toward the wrist, so that the paw slides along the stick and keeps it in
   * each turn. With the grip of `BOW_GRIP`, the stick lies 4.3 cm out from the middle of the paw on
   * the palm side, under the paw.
   */
  cat: {
    body: 'studio-cat',
    colors: SPECIES_COLORS.cat,
    seatedTail: 'curl',
    violaScale: 0.74,
    bowGrip: { at: [-0.002, 0.007, -0.079], turn: 50 * (Math.PI / 180) },
    headHeight: STUDIO_CAT.headHeight,
    seatHeight: STUDIO_CAT.seatHeight / STUDIO_CAT.headHeight,
  },
  /**
   * Hippo, the contrabasses: a round mauve-gray hippo with a pale belly and muzzle. It has the
   * studio body of the mesh `assets/models/hippo/hippo.glb`, which `pnpm rig-mesh hippo` rigs
   * (design 4.4), with the head height of the red fox and longer arms. It stands at its contrabass,
   * as the hippos of `orchestra-latest.png`. Its legs are so short that it stands about as high as
   * it sits on a chair that fits them. Its head height is the head of the studio body, and the seat
   * height is the seat of the studio body, in H.
   *
   * The stick of the bow passes through the middle of the closed right paw, 23° from square toward
   * the wrist. With the grip of `BOW_GRIP`, the stick passes under the paw, and the claws point
   * down past it. The bow hand turns around the grip on the stick (`stickTurnR` of the hold), so
   * the paw keeps one turn on the hand, and the stick stays within 0.4 cm of the middle of the paw
   * in the play, the lift, the rest, and the lowering. With the grip on the stick 2.5 cm from the
   * middle of the paw toward the frog, on the line nearest to the middles of the paw that the
   * retarget turns, the stick runs up to 2.4 cm from the middle.
   */
  hippo: {
    body: 'studio-hippo',
    bassScale: 0.8,
    bowGrip: { at: [0.0139, 0.0037, -0.0894], turn: 23 * (Math.PI / 180) },
    colors: SPECIES_COLORS.hippo,
    headHeight: STUDIO_HIPPO.headHeight,
    seatHeight: STUDIO_HIPPO.seatHeight / STUDIO_HIPPO.headHeight,
  },
  /**
   * Deer, the harp: a brown deer with a cream chest, belly, and muzzle, large ears, dark brown
   * antlers, dark hooves, and a puff tail with a white underside. It has the studio body of the
   * mesh `assets/models/deer/deer.glb`, which `pnpm rig-mesh deer` rigs (design 4.4), with 1.2
   * times the head top of the parametric deer. It sits fully on the stool of the harp, which fits
   * its legs, with no chair back, and the harp soloist keeps the stool. Its head height is the head
   * of the studio body without the antlers, and the seat height is the seat of the studio body, in
   * H. It plays a harp of 0.84 m, near a lever harp of 26 strings, leaned back on its right
   * shoulder (`docs/reference/harp-technique.md`).
   */
  deer: {
    body: 'studio-deer',
    harpScale: 0.6,
    colors: SPECIES_COLORS.deer,
    headHeight: STUDIO_DEER.headHeight,
    seatHeight: STUDIO_DEER.seatHeight / STUDIO_DEER.headHeight,
  },
  /**
   * Panda, the trombones: a giant panda with black ears, eye patches, shoulders, arms, and legs. It
   * has the studio body of the mesh `assets/models/panda/panda.glb`, which `pnpm rig-mesh panda`
   * rigs (design 4.4), with the head height of the red fox, longer arms, and longer legs. Its round
   * haunch sits on the seat behind the short thighs, and its round tail stands out through the
   * chair back. The pea eyes sit in the black patches. Its head height is the head of the studio
   * body, and its chair fits its legs: the seat height is the seat of the studio body, in H.
   */
  panda: {
    body: 'studio-panda',
    colors: SPECIES_COLORS.panda,
    headHeight: STUDIO_PANDA.headHeight,
    seatHeight: STUDIO_PANDA.seatHeight / STUDIO_PANDA.headHeight,
  },
  /**
   * Mouse, the oboes: a gray-brown mouse with a cream belly, large round ears, and a long pink
   * tail. It has the studio body of the mesh `assets/models/mouse/mouse.glb`, which `pnpm rig-mesh
   * mouse` rigs (design 4.4), with the size of the parametric mouse and arms 1.25 times the arms of
   * the mesh. It plays a smaller oboe, 0.45 of the oboe of the app, in place of longer arms. It has
   * no chair: the round belly hides the short thighs, so it stands on its hind legs with bent
   * knees, in the seated pose at the seat height of its legs. Its long tail goes back and lies on
   * the floor behind it, and it stands upright as a soloist. Its head height is the head of the
   * studio body, and the seat height is the seat of the studio body, in H.
   */
  mouse: {
    body: 'studio-mouse',
    colors: SPECIES_COLORS.mouse,
    oboeScale: 0.45,
    noChair: true,
    headHeight: STUDIO_MOUSE.headHeight,
    seatHeight: STUDIO_MOUSE.seatHeight / STUDIO_MOUSE.headHeight,
  },
  /**
   * Beaver, the bassoons: an orange-brown beaver with a cream belly and muzzle, two white front
   * teeth, and a broad flat tail. It has the studio body of the mesh
   * `assets/models/beaver/beaver.glb`, which `pnpm rig-mesh beaver` rigs (design 4.4), with the
   * size of the parametric beaver and longer arms. It plays a smaller bassoon, the largest at which
   * each paw reaches its grip with 3 cm to spare. It has no chair: the round belly hides the short
   * thighs, so it stands on its hind legs with bent knees, in the seated pose at the seat height of
   * its legs. Its broad tail goes back and lies on the floor behind it. A bassoon soloist keeps its
   * seat (`supportOf()` of `player.ts`). Its head height is the head of the studio body, and the
   * seat height is the seat of the studio body, in H.
   */
  beaver: {
    body: 'studio-beaver',
    colors: SPECIES_COLORS.beaver,
    bassoonScale: 0.82,
    noChair: true,
    headHeight: STUDIO_BEAVER.headHeight,
    seatHeight: STUDIO_BEAVER.seatHeight / STUDIO_BEAVER.headHeight,
  },
  /**
   * Dog, the cellos: a beagle with brown ears and a brown back. It has the studio body of the mesh
   * `assets/models/dog/dog.glb`, which `pnpm rig-mesh dog` rigs (design 4.4), with the head height
   * of the red fox and longer legs. It sits with the knees apart around the lower bout of the
   * cello, and its thin tail hangs down behind the seat between the back posts of the chair. Its
   * ears hang, so they do not twitch. Its head height is the head of the studio body, and its chair
   * fits its legs: the seat height is the seat of the studio body, in H. It plays a 1/2 cello.
   */
  dog: {
    body: 'studio-dog',
    celloScale: 0.86,
    colors: SPECIES_COLORS.dog,
    hangingEars: true,
    headHeight: STUDIO_DOG.headHeight,
    seatHeight: STUDIO_DOG.seatHeight / STUDIO_DOG.headHeight,
  },
  /**
   * Monkey, the trumpets: a brown monkey with a cream face, belly, and ears, dark brown hands and
   * feet, a small tuft of hair, and a long tail that ends in a curl. It has the studio body of the
   * mesh `assets/models/monkey/monkey.glb`, which `pnpm rig-mesh monkey` rigs (design 4.4), with
   * 1.1 times the size of the parametric monkey and arms 1.2 times the arms of the mesh. It plays a
   * smaller trumpet, 0.65 of the trumpet of the app. It has no chair, so it stands on its hind legs
   * with bent knees, in the seated pose at the seat height of its legs. Its feet stand under its
   * hips, and its trunk leans forward with the head level, so that its center of mass is over the
   * middle of its soles. Its long tail goes back and down, and its curl stands on the floor behind
   * it. It stands upright as a soloist. Its head height is the head of the studio body, and the
   * seat height is the seat of the studio body, in H.
   */
  monkey: {
    body: 'studio-monkey',
    colors: SPECIES_COLORS.monkey,
    trumpetScale: 0.65,
    noChair: true,
    headHeight: STUDIO_MONKEY.headHeight,
    seatHeight: STUDIO_MONKEY.seatHeight / STUDIO_MONKEY.headHeight,
  },
  /**
   * Pig, the horns: a pink pig with a paler belly, a pink snout disc, dark hooves, and a small
   * curled tail. It has the studio body of the mesh `assets/models/pig/pig.glb`, which `pnpm
   * rig-mesh pig` rigs (design 4.4), with the size of the parametric pig and longer arms. It sits
   * on a chair that fits its short legs, and stands as a soloist. Its head height is the head of
   * the studio body, and the seat height is the seat of the studio body, in H.
   */
  pig: {
    body: 'studio-pig',
    colors: SPECIES_COLORS.pig,
    headHeight: STUDIO_PIG.headHeight,
    seatHeight: STUDIO_PIG.seatHeight / STUDIO_PIG.headHeight,
  },
  /**
   * Rhino, the tuba: a gray rhino with a pale belly, a large pale horn on the muzzle and a small
   * one behind it, tall ears, light claws, and a thin tail with a dark tuft. It has the studio body
   * of the mesh with rebuilt arms, `assets/models/rhino/rhino-tpose-arms.glb`, which `pnpm rig-mesh
   * rhino` rigs (design 4.4), with the size of the parametric rhino. It stands to play the tuba.
   * Its long muzzle puts the mouthpiece far in front of the chest, so the lead pipe of its tuba is
   * 0.25 m longer back and 0.1 m to the left: the tuba stands under the muzzle in front of the
   * chest, and the bell at the left of the horn and the head. Its head height is the head of the
   * studio body, and the seat height is the seat of the studio body, in H.
   */
  rhino: {
    body: 'studio-rhino',
    colors: SPECIES_COLORS.rhino,
    tubaPipe: [0.25, 0.1],
    headHeight: STUDIO_RHINO.headHeight,
    seatHeight: STUDIO_RHINO.seatHeight / STUDIO_RHINO.headHeight,
  },
  /**
   * Badger, the percussion: a badger with a dark gray front, arms, and legs, a gray back and tail,
   * and a white head with a black stripe over each eye, round ears with white rims, and light
   * claws. It has the studio body of the mesh `assets/models/badger/badger.glb`, which `pnpm
   * rig-mesh badger` rigs (design 4.4), with the size of the parametric badger. It stands at each
   * percussion instrument. Its head height is the head of the studio body, and the seat height is
   * the seat of the studio body, in H. Its short arms cannot hold hand cymbals of a real size out
   * of its round body, so it plays a suspended cymbal.
   */
  badger: {
    body: 'studio-badger',
    cymbalForm: 'suspended',
    colors: SPECIES_COLORS.badger,
    headHeight: STUDIO_BADGER.headHeight,
    seatHeight: STUDIO_BADGER.seatHeight / STUDIO_BADGER.headHeight,
  },
  /**
   * Penguin, the choir: a penguin with a black back, head, and flippers, a white belly, a pale
   * yellow throat, an orange beak, and orange feet. It has the studio body of the mesh
   * `assets/models/penguin/penguin.glb`, which `pnpm rig-mesh penguin` rigs (design 4.4). It stands
   * on its riser. Its head height is the head of the studio body, and the seat height is the seat
   * of the studio body, in H.
   */
  penguin: {
    body: 'studio-penguin',
    colors: SPECIES_COLORS.penguin,
    headHeight: STUDIO_PENGUIN.headHeight,
    seatHeight: STUDIO_PENGUIN.seatHeight / STUDIO_PENGUIN.headHeight,
  },
  /**
   * Polar bear, the piano and the other keyboards. It has the studio body of the T-pose mesh
   * `assets/models/polar-bear/polar-bear-tpose.glb`, which `pnpm rig-mesh polar-bear` rigs with its
   * own faces (design 4.4), with longer legs. It sits on the bench of the rig, and its soles touch
   * the floor. Its head height is the head of the studio body, and the seat height is the seat of
   * the studio body, in H.
   */
  'polar-bear': {
    body: 'studio-polar-bear',
    colors: SPECIES_COLORS['polar-bear'],
    headHeight: STUDIO_POLAR_BEAR.headHeight,
    seatHeight: STUDIO_POLAR_BEAR.seatHeight / STUDIO_POLAR_BEAR.headHeight,
  },
  /**
   * Mannequin, a test body (design 4.4, "Test mannequin"): the animal preset of
   * `tools/blender/mannequin.py`, with the markers of the twist and of the side, which `pnpm
   * rig-mesh mannequin` rigs. No section casts it. The role tools test the rig chain with the
   * recast roles `violinist@mannequin` and `clarinetist@mannequin`. The app does not load its
   * body (`loadTestBodies()` of `studio-body.ts`), so the head height and the seat height are the
   * values of `src/models/studio/mannequin.ts`, which `pnpm studio-body mannequin` writes. The
   * violin size is the rule of a violin shop for the arm of the mannequin with the violin on the
   * shoulder (0.704), rounded to 0.7 (`pnpm hold-reach mannequin --instrument violin`).
   */
  mannequin: {
    body: 'studio-mannequin',
    colors: SPECIES_COLORS.mannequin,
    headHeight: 0.453483,
    seatHeight: 0.239596 / 0.453483,
    violinScale: 0.7,
  },
} as const satisfies Readonly<Record<SpeciesId, SpeciesParams>>;

/** The color of the eyes of all species (design 4.5). */
export const EYE_COLOR = '#15110e';

/** The color of the small light on each eye (design 4.5). */
export const EYE_LIGHT_COLOR = '#f6f2ea';

/**
 * The head height `H` of the size 1, in meters: the base of the scale of the instrument models
 * (`INSTRUMENT_SCALE` of `instruments/strings.ts`, design 4.6).
 */
export const DEFAULT_HEAD_HEIGHT = 0.38;
