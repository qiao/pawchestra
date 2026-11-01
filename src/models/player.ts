import { runAll } from '../score/steps.ts';
import type { Steps } from '../score/steps.ts';
import { buildBipedSteps } from './biped.ts';
import type { BodyBones } from './biped.ts';
import { seated } from './body-frame.ts';
import type { Stance } from './body-frame.ts';
import { backmostIn } from './bounds.ts';
import type { Vec3 } from './tuples.ts';
import { MeshBuilder } from './mesh.ts';
import type { MeshData } from './mesh.ts';
import { chairBack, seatHeights } from './props.ts';
import type { SeatHeights, Support } from './props.ts';
import { boneIndex, makeSkeleton } from './rig.ts';
import type { BoneName, Skeleton } from './rig.ts';
import { SPECIES, instrumentScale } from './species.ts';
import { celloPinOf } from './instruments/cello-fit.ts';
import { studioRigOf } from './studio-body.ts';
import type { StudioRig } from './studio-rig.ts';
import type { SpeciesId, SpeciesParams } from './species.ts';
import { buildInstrument } from './instruments/catalog.ts';
import { attachInstrument } from './instruments/hold.ts';
import type { PianoKeys, PlacedPiece } from './instruments/hold.ts';
import type { KettleCount } from './instruments/percussion.ts';
import type { InstrumentBone, InstrumentId, InstrumentModel } from './instruments/types.ts';

/** The support of the player of each instrument (design 4.6, the column "Seat"). */
export const INSTRUMENT_SUPPORTS = {
  violin: 'chair',
  viola: 'chair',
  cello: 'chair',
  contrabass: 'stand',
  harp: 'stool',
  piano: 'bench',
  'choir-folder': 'riser',
  flute: 'chair',
  oboe: 'chair',
  clarinet: 'chair',
  bassoon: 'chair',
  horn: 'chair',
  trumpet: 'chair',
  trombone: 'chair',
  tuba: 'stand',
  timpani: 'stand',
  'bass-drum': 'stand',
  'snare-drum': 'stand',
  cymbals: 'stand',
  'small-percussion': 'stand',
  xylophone: 'stand',
  baton: 'stand',
} as const satisfies Readonly<Record<InstrumentId, Support>>;

/**
 * The instruments whose soloist stands, as in a concerto (design 4.5, supports): the violin,
 * the viola, the flute, the oboe, the clarinet, the horn, the trumpet, and the trombone. The
 * soloist of another instrument keeps the support of {@link INSTRUMENT_SUPPORTS}: the cello and the
 * bassoon on a chair, the harp on its stool, and the piano on its bench. The contrabass player and
 * the tuba rhino stand in each seat (`INSTRUMENT_SUPPORTS`).
 */
const STANDING_SOLOISTS: ReadonlySet<InstrumentId> = new Set<InstrumentId>([
  'violin',
  'viola',
  'flute',
  'oboe',
  'clarinet',
  'horn',
  'trumpet',
  'trombone',
]);

/**
 * Gives the support of a player (design 4.5, 4.6).
 *
 * @param instrument The instrument of the player.
 * @param soloist True for the player of the soloist seat (design 3.8).
 * @returns The support of the instrument, or `stand` for a soloist who stands.
 */
export function supportOf(instrument: InstrumentId, soloist: boolean): Support {
  return soloist && STANDING_SOLOISTS.has(instrument) ? 'stand' : INSTRUMENT_SUPPORTS[instrument];
}

/** The space between the body and the chair back, in meters. */
export const CHAIR_BACK_CLEARANCE = 0.01;

/**
 * Calculates how far a body moves forward on a chair, so that it keeps
 * {@link CHAIR_BACK_CLEARANCE} in front of the posts and the top rail of the back. The torso
 * reaches through the back of a chair otherwise. The tail does not count, because it goes back
 * through the open back under the top rail (design 4.5).
 *
 * @param species The species.
 * @returns The distance, in meters. It is 0 when the body is clear of the back.
 * @throws Error if the chair has no seat heights, which cannot happen.
 */
export function chairForward(species: SpeciesParams): number {
  return runAll(chairForwardSteps(species));
}

/**
 * Calculates how far a body moves forward on a chair as {@link chairForward} does, in steps
 * (design 7.2).
 *
 * @param species The species.
 * @returns The steps, which return the distance in meters.
 * @throws Error if the chair has no seat heights, which cannot happen.
 */
function* chairForwardSteps(species: SpeciesParams): Steps<number> {
  const seat = seatHeights('chair', species);
  if (!seat) {
    throw new Error('The chair has no seat heights.');
  }

  const builder = new MeshBuilder();
  yield* buildBipedSteps(builder, species, seated(seat.seatHeight, seat.footHeight));
  const mesh = builder.build();
  const tail = new Set([boneIndex('tail1'), boneIndex('tail2')]);
  let forward = 0;
  for (const part of chairBack(seat.seatHeight)) {
    yield;
    const back = backmostIn(mesh, part, (bone) => !tail.has(bone));
    forward = Math.max(forward, back + CHAIR_BACK_CLEARANCE - part.min[2]);
  }
  return forward;
}

/**
 * Gives the stance of a body on a support. A body on a seat sits at the heights of its seat
 * (`seatHeights()`), and rests its feet on the floor or on the foot ring of the high stool. On a
 * chair, the body moves forward until the torso is clear of the back ({@link chairForward}).
 *
 * @param support The support.
 * @param species The species of the body.
 * @returns The stance.
 */
export function stanceOn(support: Support, species: SpeciesParams): Stance {
  return runAll(stanceOnSteps(support, species));
}

/**
 * Gives the stance of a body on a support as {@link stanceOn} does, in steps (design 7.2).
 *
 * @param support The support.
 * @param species The species of the body.
 * @returns The steps, which return the stance.
 */
function* stanceOnSteps(support: Support, species: SpeciesParams): Steps<Stance> {
  const seat = seatHeights(support, species);
  if (!seat) {
    return { kind: 'standing' };
  }

  const forward = support === 'chair' ? yield* chairForwardSteps(species) : 0;
  return seated(seat.seatHeight, seat.footHeight, forward);
}

/** One player: an animal and its instrument as one skinned mesh (design 4.4). */
export interface PlayerModel {
  /** The support of the player. The origin of the model is the floor under its center. */
  readonly support: Support;
  /** The heights of the seat that the body sits on, or `null` for a standing player. */
  readonly seat: SeatHeights | null;
  readonly mesh: MeshData;
  readonly skeleton: Skeleton;
  readonly body: BodyBones;
  /** The instrument data, with the grips and the targets in the axes of its pieces. */
  readonly instrument: InstrumentModel;
  /** The pieces of the instrument at their places in the bind pose. */
  readonly pieces: readonly PlacedPiece[];
  /**
   * The keys of a keyboard in {@link PlayerModel.mesh}, which go down with their notes (design
   * 4.6, 5.3), or `null` for each other instrument.
   */
  readonly keys: PianoKeys | null;
  /**
   * The rig of the studio body (design 4.4). The scene draws the body with the skin of the
   * studio, and `mesh` holds the body in the bind pose of the player.
   */
  readonly studio: StudioRig;
}

/**
 * Gives the bind positions of the instrument bones that carry no piece. A bone with no part moves
 * nothing, but each skeleton has all bones (design 4.7).
 *
 * @param body The body of the player.
 * @param placed The bind positions of the bones that carry a piece.
 * @returns The bind position of each instrument bone.
 */
function instrumentBones(body: BodyBones, placed: ReadonlyMap<InstrumentBone, Vec3>) {
  const instrument = placed.get('instrument') ?? body.positions.chest;
  return {
    instrument,
    slide: placed.get('slide') ?? instrument,
    bow: placed.get('bow') ?? body.palmR,
    malletL: placed.get('malletL') ?? body.palmL,
    malletR: placed.get('malletR') ?? body.palmR,
    baton: placed.get('baton') ?? body.palmR,
  } satisfies Readonly<Record<InstrumentBone, Vec3>>;
}

/**
 * Builds one player as one skinned mesh: the body of its species and its instrument with all its
 * pieces (design 4.4, 4.6, 4.7). The mesh is in its bind pose. The player faces -z. The origin
 * is on the floor, under the center of the seat or under a standing player. The support sets the
 * stance of the body.
 *
 * @param species The species of the player.
 * @param instrument The instrument of the player.
 * @param kettles The number of kettles of the timpani (design 4.6). The other instruments ignore
 *   it.
 * @param support The support of the player: the support of the instrument
 *   ({@link INSTRUMENT_SUPPORTS}) by default, or `stand` for a soloist who stands.
 * @returns The mesh data, the skeleton, and the placed instrument that the pose needs.
 */
export function buildPlayer(
  species: SpeciesId,
  instrument: InstrumentId,
  kettles: KettleCount = 4,
  support: Support = INSTRUMENT_SUPPORTS[instrument],
): PlayerModel {
  return runAll(buildPlayerSteps(species, instrument, kettles, support));
}

/**
 * Builds one player as {@link buildPlayer} does, in steps (design 7.2).
 *
 * @param species The species of the player.
 * @param instrument The instrument of the player.
 * @param kettles The number of kettles of the timpani. The other instruments ignore it.
 * @param support The support of the player.
 * @returns The steps, which return the mesh data, the skeleton, and the placed instrument.
 */
export function* buildPlayerSteps(
  species: SpeciesId,
  instrument: InstrumentId,
  kettles: KettleCount,
  support: Support,
): Steps<PlayerModel> {
  const builder = new MeshBuilder();
  const params: SpeciesParams = SPECIES[species];
  const stance = yield* stanceOnSteps(support, params);
  yield;
  const body = yield* buildBipedSteps(builder, params, stance);
  yield;
  const scale = instrumentScale(params, instrument);
  const model = buildInstrument(
    instrument,
    kettles,
    scale,
    params.bowGrip,
    params.cymbalForm,
    params.tubaPipe,
    instrument === 'cello' ? celloPinOf(body, scale) : undefined,
  );
  yield;
  const placed = attachInstrument(builder, model, body);
  yield;
  const positions = {
    ...body.positions,
    ...instrumentBones(body, placed.bones),
  } satisfies Readonly<Record<BoneName, Vec3>>;
  return {
    support,
    seat: seatHeights(support, SPECIES[species]),
    mesh: builder.build(),
    skeleton: makeSkeleton(positions, model.parent),
    body,
    instrument: model,
    pieces: placed.pieces,
    keys: placed.keys,
    studio: studioRigOf(params.body, stance.kind === 'standing'),
  };
}
