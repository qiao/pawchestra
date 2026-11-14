import type { BowGrip } from './instruments/strings.ts';
import { isScaledInstrument } from './instruments/types.ts';
import type { CymbalForm, InstrumentId, ScaledInstrument } from './instruments/types.ts';
import type { StudioBodyName } from './studio-body.ts';
import type { StudioPalette } from './studio-format.ts';
import { STUDIO_HEIGHTS } from './studio-heights.ts';
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
   * The scale of the flute for the species, as a factor of the flute of the app (design 4.6). It is
   * 1 when it is not given. A species with short arms plays a smaller flute, as a child plays a
   * fractional violin. The flute shrinks toward the lip plate, so the lip plate stays at the mouth,
   * and the grips of the palms come nearer to the mouth.
   */
  readonly fluteScale?: number;
  /**
   * The scale of the oboe for the species, as a factor of the oboe of the app (design 4.6). It is
   * 1 when it is not given. A species with short arms plays a smaller oboe, as a child plays a
   * fractional violin. The oboe shrinks toward the tip of the reed, so the reed stays in the
   * mouth, and the grips of the palms come nearer to the mouth.
   */
  readonly oboeScale?: number;
  /**
   * The scale of the clarinet for the species, as a factor of the clarinet of the app (design
   * 4.6). It is 1 when it is not given. A species with short arms plays a smaller clarinet, as a
   * child plays a fractional violin. The clarinet shrinks toward the mouthpiece, so the mouthpiece
   * stays in the mouth, and the grips of the palms come nearer to the mouth.
   */
  readonly clarinetScale?: number;
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
   * The scale of the trombone for the species, as a factor of the trombone of the app (design
   * 4.6). It is 1 when it is not given. A species with short arms plays a smaller trombone, as a
   * child plays a fractional violin. The trombone shrinks toward the mouthpiece, so the mouthpiece
   * stays at the mouth, and the slide brace comes nearer to the right shoulder.
   */
  readonly tromboneScale?: number;
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
   * The seated tail of a studio body: `curl` when its bind lays it on the seat or behind the chair
   * (`studio.tailCurl` or `studio.tailBind` of the rig config, or the key `bind_tail` of a hand
   * rig), so that it does not sway in the idle motion on a seat into the haunch, the seat, or the
   * back posts of the chair (design 5.1). Another tail that hangs behind the chair sways when it is
   * not given.
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
  flute: 'fluteScale',
  oboe: 'oboeScale',
  clarinet: 'clarinetScale',
  bassoon: 'bassoonScale',
  trumpet: 'trumpetScale',
  trombone: 'tromboneScale',
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
   * Rabbit, the first violins (reference image). It has the studio body of the hand rig of the
   * fourth Tripo P2 rabbit (`assets/models/rabbit/tripo-hand/rabbit.blend`, design 4.4), seated
   * with the bind pose of that rig, and standing as a soloist. Its seated eyes are at the height of
   * the eyes of the third Tripo rabbit (`metersPerUnit` of its chain), because the seat search
   * reads the eye height (design 4.2). Its head height is the head of the studio body, and its
   * chair fits its legs: the seat height is the seat of the studio body, in H. The hand rig keeps
   * the arms and the paws of the mesh with no stretch, so the arms reach 0.299 m from the shoulder
   * joint to the middle of the palm. The violin is 0.9 of the violin of the app (0.456 m), near a
   * real 1/8 violin, so that it reads at its size beside the body. The arms do not grow, so the
   * hold uses the reach of the arms: the left paw stops the strings from 0.64 of the fingerboard
   * from the nut, as a player in a high position, and the scroll stands
   * out past the paw. The bow paw reaches 0.14 m of the hair, from 0.11 m to 0.25 m from the frog
   * (`pnpm hold-reach rabbit --instrument violin`). With 0.75 (0.380 m), the violin of the second
   * Tripo rabbit, the violin read small. With 0.95, the left paw reaches only 0.75 of the
   * fingerboard and the bow paw 0.12 m of the hair.
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
    violinScale: 0.9,
    bowGrip: { at: [-0.0084, -0.04, 0.0553], turn: 40 * (Math.PI / 180) },
    headHeight: STUDIO_HEIGHTS['studio-rabbit'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-rabbit'].seatHeight / STUDIO_HEIGHTS['studio-rabbit'].headHeight,
  },
  /**
   * Red-orange fox with a white face, the second violins (reference image). It has the studio body
   * of the hand rig of the Tripo P2 fox (`assets/models/fox/tripo-hand/fox.blend`, design 4.4), at
   * the eye height of the fox before, seated with its thighs on the seat and its tail back through
   * the chair, and standing as a soloist. Its color map keeps the hue of the source (`assets/models/fox/README.md`, "Color
   * map"). Its head height is the head of the studio body, and its chair fits its legs: the seat
   * height is the seat of the studio body, in H. Its violin is 0.83 of the violin of the app, near
   * a 3/4 violin. With 0.998, its short arm stopped the strings only from 0.63 of the fingerboard,
   * over the upper bout, and the thick left paw went 2.4 cm into the violin in 45% of the play
   * (limit 1.6 cm, `pnpm body-clip fox-red:violin`). No gap, tilt, elbow, shoulder turn, or stop
   * range moved it. With 0.83, the paw stops from 0.31 and keeps within the limit, and with 0.85 it
   * went 1.9 cm in in 3% of the play.
   *
   * The stick of the bow passes through the closed right paw, 50° from square toward the wrist,
   * within 0.4 cm of the middle of the seated paw in the play, the lift, the rest, and the
   * lowering. The fore paw of the chain is 0.42 H long and lies at its wrist joint, so the grip of
   * the shorter paw put the stick 1.2 cm from the middle, past the 1 cm of a fist. A turn of 60°
   * folds face 184 of the right arm in 43% of the play samples. With the grip of `BOW_GRIP`, the
   * stick lies 4.0 cm to 5.3 cm out from the middle of the paw, under the paw.
   */
  'fox-red': {
    body: 'studio-fox',
    colors: SPECIES_COLORS['fox-red'],
    violinScale: 0.83,
    bowGrip: { at: [-0.0145, -0.0148, -0.0875], turn: 50 * (Math.PI / 180) },
    headHeight: STUDIO_HEIGHTS['studio-fox'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-fox'].seatHeight / STUDIO_HEIGHTS['studio-fox'].headHeight,
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
    headHeight: STUDIO_HEIGHTS['studio-fox'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-fox'].seatHeight / STUDIO_HEIGHTS['studio-fox'].headHeight,
  },
  /**
   * Wolf, the clarinets: a gray wolf with a cream chest, belly, and muzzle, dark lower legs, and a
   * bushy tail with a cream tip. It has the studio body of the hand rig of the Tripo P2 wolf
   * (`assets/models/wolf/tripo-hand/wolf.blend`, design 4.4), at the height of the older wolf. It
   * sits on a chair that fits its legs, with the tail back over the seat and down behind it, and
   * stands as a soloist. Its head height is the head of the studio body, and the seat height is the
   * seat of the studio body, in H. The violin size is for the recast role `violinist@wolf` of the
   * role tools only: no wolf plays the violin in the app. It is the rule of a violin shop for the
   * arm of the wolf with the violin on the shoulder (0.732), rounded up to 0.75 (`pnpm hold-reach
   * wolf --instrument violin`).
   */
  wolf: {
    body: 'studio-wolf',
    colors: SPECIES_COLORS.wolf,
    headHeight: STUDIO_HEIGHTS['studio-wolf'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-wolf'].seatHeight / STUDIO_HEIGHTS['studio-wolf'].headHeight,
    violinScale: 0.75,
  },
  /**
   * Elephant, the timpani: a gray elephant with large ears, a long trunk, and cream tusks. It has
   * the studio body of the hand rig of the Tripo P2 elephant
   * (`assets/models/elephant/tripo-hand/elephant.blend`, design 4.4), with the arms of the mesh. It
   * stands at its timpani, as the elephant of `orchestra-latest.png`. The trunk, the tusks, and the
   * ears follow the head. Its head height is the head of the studio body without the trunk, and the
   * seat height is the seat of the studio body, in H.
   */
  elephant: {
    body: 'studio-elephant',
    colors: SPECIES_COLORS.elephant,
    headHeight: STUDIO_HEIGHTS['studio-elephant'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-elephant'].seatHeight / STUDIO_HEIGHTS['studio-elephant'].headHeight,
  },
  /**
   * Bear, the conductor (reference image). It has the studio body of the hand rig of the Tripo P2
   * bear (`assets/models/bear/tripo-hand/bear.blend`, design 4.4), at the eye height of the older
   * Tripo bear, with smaller paws and the colors of its source. Its head height is the head of the
   * studio body. It binds standing, so its seat has a fixed height.
   */
  bear: {
    body: 'studio-bear',
    colors: SPECIES_COLORS.bear,
    headHeight: STUDIO_HEIGHTS['studio-bear'].headHeight,
    seatHeight: 0.75,
  },
  /**
   * Gray cat with a cream belly, the violas (`cat-views.png`). It has the studio body of the hand
   * rig of the Tripo P2 cat (`assets/models/cat/tripo-hand/cat.blend`, design 4.4). It sits with
   * its tail curled on the seat around the left side of the haunch, and stands as a soloist. Its
   * head height is the head of the studio body, and its chair fits its legs: the seat height is the
   * seat of the studio body, in H. It plays a viola of about 12 inches, with a body of 298 mm,
   * 0.85 of the viola of the app (`violaScale`), so that the viola reads at its size beside the
   * body. The arms do not grow, so the hold uses the reach of the arms: the left paw stops the
   * strings from 0.20 of the fingerboard from the nut, and the bow paw reaches 0.29 m of the hair
   * (`pnpm hold-reach cat --instrument viola`). With 0.925, the paw reached the strings only from
   * 0.51 of the fingerboard, at the upper bout, and the left forearm went through the upper bout
   * in each sample of the play (`CAT_HOLD` of `pose/bowed-rig.ts`). With 0.74, the size that a
   * violin shop gives for the arm, the viola read as a toy under the paws.
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
    violaScale: 0.85,
    bowGrip: { at: [-0.002, 0.007, -0.079], turn: 50 * (Math.PI / 180) },
    headHeight: STUDIO_HEIGHTS['studio-cat'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-cat'].seatHeight / STUDIO_HEIGHTS['studio-cat'].headHeight,
  },
  /**
   * Hippo, the contrabasses: a round gray-pink hippo with small ears, two small teeth, pale toes,
   * and a short tail. It has the studio body of the hand rig of the Tripo P2 mesh
   * `assets/models/hippo/tripo-p2/hippo.fbx` (design 4.4), with the head height of the hippo of the
   * T-pose mesh and arms 1.2 times longer than the arms of the source. It stands at its
   * contrabass, as the hippos of `orchestra-latest.png`. Its head height is the head of the studio
   * body, and the seat height is the seat of the studio body, in H. It plays a contrabass of 0.7,
   * with a string length of 0.81 m, on a short end pin (`BASS_END_PIN` of
   * `instruments/strings.ts`): the upper bout stands below the left shoulder, the nut about
   * 0.17 m above the left shoulder joint along the strings, and the scroll beside its head
   * (`HIPPO_HOLD` of `pose/bowed-rig.ts`). With 0.8 and an end pin of 0.2 m, the upper bout stood
   * 13 cm above the shoulder joint, and the left arm went up to 7 cm through it to the neck.
   *
   * The bow grip (`bowGrip`) puts the stick through the middle of the closed right paw of the hand
   * rig, 23° from square toward the wrist: the middle of the paw lies at most 0.2 cm from the
   * stick in the play, the rest, and the moves (`pnpm wind-grip bassist`). With the grip of the
   * old hippo, it lay 1.2 cm to 1.3 cm from the stick, more than the 1 cm of a fist. The bow hand
   * turns around the grip on the stick (`stickTurnR` of the hold), so the paw keeps one turn on
   * the hand.
   */
  hippo: {
    body: 'studio-hippo',
    bassScale: 0.7,
    bowGrip: { at: [-0.0061, 0.0257, -0.0894], turn: 23 * (Math.PI / 180) },
    colors: SPECIES_COLORS.hippo,
    headHeight: STUDIO_HEIGHTS['studio-hippo'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-hippo'].seatHeight / STUDIO_HEIGHTS['studio-hippo'].headHeight,
  },
  /**
   * Deer, the harp: a slim spotted fawn with a cream chest, belly, and muzzle, large ears, a long
   * neck, dark hooves, and a short white tail. It has the studio body of the hand rig of the Tripo
   * P2 fawn `assets/models/deer/tripo-hand/deer.blend` (design 4.4). It sits fully on the stool of
   * the harp, which fits its legs, with no chair back, and the harp soloist keeps the stool. Its
   * head height is the head of the studio body, and the seat height is the seat of the studio
   * body, in H. It plays a harp of 0.975 of the concert harp of the app, 1.27 m high, with its
   * base on the floor in front of the chest, as a harpist holds it. The top of the soundbox rests
   * against the chest, in front of and below the right shoulder
   * (`docs/reference/harp-technique.md`, section 6). On the harp of 0.85 (1.11 m) at the right of
   * the chest, the harp read as a harp of a child. A larger harp at that place put its treble
   * strings through the right shoulder: from the scale 0.875, the right upper arm went 6.5 cm
   * through the plane of the strings in 90 % of the samples (`scratch/dh/evalc.ts` of the round
   * 2026-11-13).
   */
  deer: {
    body: 'studio-deer',
    harpScale: 0.975,
    colors: SPECIES_COLORS.deer,
    headHeight: STUDIO_HEIGHTS['studio-deer'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-deer'].seatHeight / STUDIO_HEIGHTS['studio-deer'].headHeight,
  },
  /**
   * Panda, the trombones: a round plush panda with cream fur and dark ears, eye patches, shoulders,
   * arms, and legs. It has the studio body of the hand rig of the Tripo P2 mesh
   * (`assets/models/panda/tripo-hand/panda.rig.glb`, design 4.4), with the head height of the panda
   * of the old mesh, and the arms, the legs, and the eyes of the source. Its round haunch sits on a
   * low, wide chair behind the short thighs, and its round tail lies in front of the chair back. Its
   * head height is the head of the studio body, and its chair fits its legs: the seat height is the
   * seat of the studio body, in H. Its arms are short for its big head: the mouth is 0.21 m in front
   * of the right shoulder joint. So the upper arms and the forearms of the mesh are 1.2 times those
   * of the source, and the arm reaches 0.488 m in place of 0.417 m. It plays the trombone of the
   * app, 0.49 of its seated height, at which the right arm reaches 0.135 m of the slide travel
   * (`pnpm hold-reach panda --instrument trombone`). With a smaller trombone of 0.75, the trombone
   * read as a toy.
   */
  panda: {
    body: 'studio-panda',
    colors: SPECIES_COLORS.panda,
    headHeight: STUDIO_HEIGHTS['studio-panda'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-panda'].seatHeight / STUDIO_HEIGHTS['studio-panda'].headHeight,
  },
  /**
   * Mouse, the oboes: a gray-taupe mouse with a cream belly, large round pink ears, whiskers, pink
   * paws, and a long thin pink tail. It has the studio body of the hand rig of the Tripo P2 mouse
   * (`assets/models/mouse/tripo-hand/`, design 4.4), with the form, the colors, and the eyes of
   * its source, and the eye height of the mouse of the old mesh (`metersPerUnit` of its chain).
   * Reason: at the head height of the old mouse, its eyes stood 0.84 m high (old 0.69 m) and its
   * ears 1.03 m, and the seat search moved players of 14 of 18 demos. Its arms keep the length of
   * the source: each arm reaches 0.18 m from the shoulder joint to the wrist, less than the 0.27 m
   * of the old mouse. So it plays a smaller oboe, 0.5 of the oboe of the app. The scale of an
   * instrument is a factor of the instrument of the app, so the oboe keeps its size in meters when
   * the body changes its size. With the reed between the lips at the front of the muzzle and the
   * paws on the tone holes, the right paw reaches its grip with 1.1 cm to spare at 0.5, and with
   * 0.2 cm at 0.55 (`pnpm hold-fit oboist`). The oboe of 0.5 moves no seat of a demo. It has no chair: it stands upright on its legs in the pose of the
   * source, at the seat height of its legs (the crotch). Its long tail goes back and down and lies on the floor behind it, and it stands as a
   * soloist. Its head height is the head of the studio body, and the seat height is the seat of
   * the studio body, in H.
   */
  mouse: {
    body: 'studio-mouse',
    colors: SPECIES_COLORS.mouse,
    oboeScale: 0.5,
    noChair: true,
    headHeight: STUDIO_HEIGHTS['studio-mouse'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-mouse'].seatHeight / STUDIO_HEIGHTS['studio-mouse'].headHeight,
  },
  /**
   * Beaver, the bassoons: a round, furry, orange-brown beaver with a light muzzle, two big front
   * teeth, whiskers, and a large flat scaly tail. It has the studio body of the hand rig of the
   * Tripo P2 beaver (`assets/models/beaver/tripo-hand/`, design 4.4), with the form and the colors
   * of its source and short arms. It plays a small bassoon of 0.7, at which each paw reaches its
   * grip with the forward turns of the shoulders of its hold, and the boot joint stays in front of
   * the round belly. With 0.8 and the boot further back, where the paws reach it, the boot went
   * 8 cm into the belly. It has no chair: the round belly
   * hides the short thighs, so it stands on its short legs in the pose of the source, at the seat
   * height of its legs. Its flat tail goes back and lies on the floor behind it. A bassoon soloist
   * keeps its seat (`supportOf()` of `player.ts`). Its head height is the head of the studio
   * body, and the seat height is the seat of the studio body, in H.
   */
  beaver: {
    body: 'studio-beaver',
    colors: SPECIES_COLORS.beaver,
    bassoonScale: 0.7,
    noChair: true,
    headHeight: STUDIO_HEIGHTS['studio-beaver'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-beaver'].seatHeight / STUDIO_HEIGHTS['studio-beaver'].headHeight,
  },
  /**
   * Dog, the cellos: a beagle with brown ears and a brown back. It has the studio body of the hand
   * rig of the Tripo P2 beagle (`assets/models/dog/tripo-hand/dog.blend`, design 4.4). It sits with
   * the knees apart around the lower bout of the cello, and its thin tail hangs down behind the
   * seat between the back posts of the chair. Its ears hang, so they do not twitch. Its head height
   * is the head of the studio body, and its chair fits its legs: the seat height is the seat of the
   * studio body, in H. It plays a 1/2 cello (a back of 23 in to 26 in, 0.77 to 0.87 of a 4/4). The
   * reach limit of the cello rule fails at each size for its short arms, so the rule gives the
   * clamp of a 1/10 (`pnpm cello-size dog`). A 1/10 fits the body at the H of the dog of main, and
   * the cello keeps that share of the body at the larger H of the Tripo beagle: 0.65 times 1.27, to
   * two places.
   *
   * The bow grip (`bowGrip`) puts the stick across the fingers under the curled finger tips of
   * the right paw, at the frog end: 0.7 of the way from the middle of the closed paw to the mean
   * of the finger tips, in the axes of the hand. The tips touch the stick, and the paw holds the
   * bow in each play sample, with a median tip gap of 0.1 cm (`pnpm wind-grip cellist`). With
   * the grip of `BOW_GRIP`, the stick lay under the palm of the smaller paw, and the tips stayed
   * 5.2 cm from it. A grip through the middle of the paw needs a curl of 105°, which folds the
   * knuckles (`DOG_HOLD.curlR` of `pose/bowed-rig.ts`).
   */
  dog: {
    body: 'studio-dog',
    celloScale: 0.83,
    bowGrip: { at: [-0.0858, -0.0999, -0.0953], turn: 0 },
    colors: SPECIES_COLORS.dog,
    hangingEars: true,
    headHeight: STUDIO_HEIGHTS['studio-dog'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-dog'].seatHeight / STUDIO_HEIGHTS['studio-dog'].headHeight,
  },
  /**
   * Monkey, the trumpets: a brown macaque with a pink face, pink ears, hands, and feet, a cream
   * chest and belly, a small tuft of hair, and a long tail that curls up behind the back. It has
   * the studio body of the hand rig of the Tripo P2 monkey
   * (`assets/models/monkey/tripo-hand/monkey.blend`, design 4.4), with the arms of its source. It
   * plays a trumpet of 0.75 of the trumpet of the app, so that its arms reach the valves of a
   * nearly level trumpet with the head upright, with 4.6 cm (left) and 1.7 cm (right) to spare
   * (`MONKEY_TRUMPET` of `pose/winds.ts`). It has no chair,
   * so it stands on its hind legs, in the seated pose at the seat height of its legs. Its
   * hips stand over its feet, its knees bend a little, and its shoulders stay over its hips, so
   * that its center of mass is over the middle of its soles. It keeps this stance as a soloist.
   * Its head height is the head of the studio body, and the seat height is the seat of the studio
   * body, in H.
   */
  monkey: {
    body: 'studio-monkey',
    colors: SPECIES_COLORS.monkey,
    noChair: true,
    trumpetScale: 0.75,
    headHeight: STUDIO_HEIGHTS['studio-monkey'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-monkey'].seatHeight / STUDIO_HEIGHTS['studio-monkey'].headHeight,
  },
  /**
   * Pig, the horns: a round pink pig with floppy ears, a pink snout disc, dark hooves, and a
   * curly tail. It has the studio body of the hand rig of the Tripo P2 pig
   * (`assets/models/pig/tripo-hand/pig.blend`, design 4.4), with the arms of its source. It sits
   * on a chair that fits its short legs, and stands as a soloist. Its head height is the head of
   * the studio body, and the seat height is the seat of the studio body, in H.
   */
  pig: {
    body: 'studio-pig',
    colors: SPECIES_COLORS.pig,
    headHeight: STUDIO_HEIGHTS['studio-pig'].headHeight,
    seatHeight: STUDIO_HEIGHTS['studio-pig'].seatHeight / STUDIO_HEIGHTS['studio-pig'].headHeight,
  },
  /**
   * Rhino, the tuba: a gray rhino with a pale belly, a large pale horn on the muzzle and a small
   * one behind it, tall ears, light claws, and a thin tail with a dark tuft. It has the studio body
   * of the mesh with rebuilt arms, `assets/models/rhino/rhino-tpose-arms.glb`, which `pnpm rig-mesh
   * rhino` rigs (design 4.4). It stands to play the tuba. Its long muzzle puts the mouthpiece far
   * in front of the chest, so the lead pipe of its tuba is 0.25 m longer back and 0.1 m to the
   * left: the tuba stands under the muzzle in front of the chest, and the bell at the left of the
   * horn and the head. Its head height is the head of the studio body, and the seat height is the
   * seat of the studio body, in H.
   */
  rhino: {
    body: 'studio-rhino',
    colors: SPECIES_COLORS.rhino,
    tubaPipe: [0.25, 0.1],
    headHeight: STUDIO_HEIGHTS['studio-rhino'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-rhino'].seatHeight / STUDIO_HEIGHTS['studio-rhino'].headHeight,
  },
  /**
   * Badger, the percussion: a dark brown badger with a cream face, a dark brown stripe over each
   * eye, round ears with cream rims, a cream throat, and a cream tail. It has the studio body of
   * the hand rig of the Tripo P2 badger (`assets/models/badger/tripo-hand/`, design 4.4), with the
   * form and the colors of its source, the crown of the older badger, and arms 1.2 times longer
   * than in the source. It stands at each percussion instrument on its legs in the pose of the
   * source. Its head height is the head of the studio body, and the seat height is the seat of the
   * studio body between its legs, in H. Its arms cannot hold hand cymbals of a real size out of
   * its round body, so it plays a suspended cymbal.
   */
  badger: {
    body: 'studio-badger',
    cymbalForm: 'suspended',
    colors: SPECIES_COLORS.badger,
    headHeight: STUDIO_HEIGHTS['studio-badger'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-badger'].seatHeight / STUDIO_HEIGHTS['studio-badger'].headHeight,
  },
  /**
   * Penguin, the choir: a penguin with a black back, head, and flippers, a white belly, a pale
   * yellow throat, an orange beak, and orange feet. It has the studio body of the hand rig of the
   * Tripo P2 penguin (`assets/models/penguin/tripo-hand/penguin.blend`, design 4.4). It stands on
   * its riser. Its head height is the head of the studio body, and the seat height is the seat of
   * the studio body, in H.
   */
  penguin: {
    body: 'studio-penguin',
    colors: SPECIES_COLORS.penguin,
    headHeight: STUDIO_HEIGHTS['studio-penguin'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-penguin'].seatHeight / STUDIO_HEIGHTS['studio-penguin'].headHeight,
  },
  /**
   * Polar bear, the piano and the other keyboards. It has the studio body of the hand rig of the
   * Tripo P2 polar bear (`assets/models/polar-bear/tripo-hand/polar-bear.blend`, design 4.4, "Hand
   * rig"), with the legs of its mesh. It sits on the bench of the rig with the thighs 25° down, and
   * its soles touch the floor. Its head height is the head of the studio body, and the seat height
   * is the seat of the studio body, in H.
   */
  'polar-bear': {
    body: 'studio-polar-bear',
    colors: SPECIES_COLORS['polar-bear'],
    headHeight: STUDIO_HEIGHTS['studio-polar-bear'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-polar-bear'].seatHeight /
      STUDIO_HEIGHTS['studio-polar-bear'].headHeight,
  },
  /**
   * Mannequin, a test body (design 4.4, "Test mannequin"): the animal preset of
   * `tools/blender/mannequin.py`, with the markers of the twist and of the side, which `pnpm
   * rig-mesh mannequin` rigs. No section casts it. The role tools test the rig chain with the
   * recast roles `violinist@mannequin` and `clarinetist@mannequin`. The app does not load its
   * body. The violin size is the rule of a violin shop for the arm of the mannequin with the violin on the
   * shoulder (0.704), rounded to 0.7 (`pnpm hold-reach mannequin --instrument violin`).
   */
  mannequin: {
    body: 'studio-mannequin',
    colors: SPECIES_COLORS.mannequin,
    headHeight: STUDIO_HEIGHTS['studio-mannequin'].headHeight,
    seatHeight:
      STUDIO_HEIGHTS['studio-mannequin'].seatHeight / STUDIO_HEIGHTS['studio-mannequin'].headHeight,
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
