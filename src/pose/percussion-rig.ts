import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { placePoint } from '../models/instruments/hold.ts';
import {
  BASS_DRUM,
  SNARE_DRUM,
  TIMPANI,
  TRIANGLE,
  XYLOPHONE,
  kettleHeadRadius,
  xylophoneBarPosition,
} from '../models/instruments/percussion.ts';
import type { PlayTarget } from '../models/instruments/types.ts';
import { IDENTITY, toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import type { InstrumentOf } from './family.ts';
import { hangingArm } from './hang.ts';
import type { HangingArm } from './hang.ts';
import { trunkFront } from './cello-place.ts';
import { armRig } from './ik.ts';
import type { ArmRig } from './ik.ts';
import { plantedLegs } from './side-move.ts';
import type { PlantedLegs, SideMove } from './side-move.ts';
import type { StrikeSizes, StrikeTarget } from './strikes.ts';

/** The timpani, the drums, the cymbals, the small percussion, and the xylophone (design 4.6). */
export type PercussionInstrument = InstrumentOf<'percussion'>;

/**
 * How a percussion player shares its strikes between its hands (design 5.3).
 *
 * - `alternate`: two mallets or sticks. See `alternateHands()`.
 * - `sides`: two mallets, and each hand strikes the targets on its side of the middle of the
 *   player, so that a roll on one kettle stays in one hand. A player with short arms and a long
 *   nose between two kettles cannot reach across to the far kettle.
 * - `right`: the right hand strikes each note. The bass drum has one beater, and the small
 *   percussion player holds the triangle in its left hand.
 * - `pair`: the two cymbals strike each other.
 */
export type HandsRule = 'alternate' | 'sides' | 'right' | 'pair';

/**
 * The turn of a mallet around its own axis in the paw (design 5.3). A round mallet looks the same
 * at each turn, so the turn only sets the paw on the forearm.
 *
 * - `up`: the top of the grip points up, as in the bind pose, where the arm hangs and the mallet
 *   points forward from the fist.
 * - `shoulder`: the top of the grip points toward the shoulder joint of its side, so that the paw
 *   stays near the line of the arm. A mallet that slants down in front of a short arm with the
 *   top up turns the paw almost upside down on the forearm.
 */
export type MalletTop = 'up' | 'shoulder';

/**
 * The mallet of a percussion hold across the forearm between strikes (design 5.3). A real player
 * holds a mallet so that it leaves the side of the fist at about 90° to the forearm, as the bind
 * pose does, where the arm hangs and the mallet points forward. At a strike, the mallet points
 * from its home to the target, and the grip stays at that place. As the head goes up to its rest
 * height, the paw turns around the grip until the mallet lies across the forearm, at an angle in
 * the frame of the elbow, and the top of the grip points along the forearm toward the elbow.
 */
export interface MalletAcross {
  /**
   * The direction of the mallet at the rest height, across the forearm: the angle from the
   * direction of no twist of the paw on the forearm ({@link acrossAxes}) toward the out side of
   * the hand, in radians.
   */
  readonly rest: number;
  /**
   * The turn of the mallet up from that direction at the rest height, in radians, as a real
   * player lifts the head with the wrist between strikes. The paw bends on the forearm and does
   * not twist.
   */
  readonly lift: number;
  /**
   * The turn of the mallet up from its strike direction at the rest height, in radians, or
   * `null`. With a value, the paw keeps the turn of the strike between strikes, and the wrist
   * lifts the head around the level axis normal to the forearm, with no twist. Thus the tip stays
   * above its playing spot, as a real player's tip does. `rest` and `lift` then set only the paw
   * at a strike. With `null`, the paw turns to the rest direction across the forearm.
   */
  readonly pitch: number | null;
  /**
   * The largest share of the pitch in the lift before a strike. The share is the height of the
   * strike state over the rest height of the hold (`StrikeSizes.rest`), so a share above 1 lifts
   * the head higher than between strikes, as a real timpanist lifts the mallet before the stroke
   * (`docs/reference/percussion-technique.md` 4). 1: the head lifts no higher than between
   * strikes. With no pitch, a share above 1 turns the mallet past its rest direction, away from
   * the strike direction.
   */
  readonly peak: number;
}

/**
 * The set position of the sticks or the mallets of a hold at rest (design 5.2). Between
 * entrances, a real snare drummer holds the sticks level across the body in front of the waist,
 * about one inch above the rim nearest to the body (`docs/reference/percussion-technique.md` 6).
 * The upper arms hang, the forearms point forward, and each paw turns its palm down on the
 * forearm, so that its stick points in across the body. The lift turns the sticks from there to
 * the play.
 */
export interface MalletSet {
  /** The move of each wrist up from its place on the hanging arm, in meters. */
  readonly raise: number;
  /**
   * The turn of the left and of the right stick around the forearm, up from the level direction
   * in across the body, in radians. The two sticks cross in front of the body, so they take two
   * turns and cross at two heights.
   */
  readonly rise: readonly [left: number, right: number];
}

/**
 * The damp of the sound of an instrument after a note (design 5.3), as a real player stops the
 * ring of a drum or a cymbal at a rest or after a short note
 * (`docs/reference/percussion-technique.md` 5, 7). A note is damped at its end when the silence
 * from its end to the next note of the player is at least `restSec`.
 *
 * - `palm`: the free paw lays its palm on the other head of the bass drum.
 * - `chest`: the hand cymbals go against the chest.
 */
export type DampRule =
  | {
      readonly kind: 'palm';
      readonly restSec: number;
      /** The longest contact, in seconds. */
      readonly hold: number;
      /**
       * The wrist at the damp, from the middle of the left head of the drum, in meters in the
       * model axes. The paw keeps the turn of the hanging arm, with the palm in toward the head.
       */
      readonly wrist: Vec3;
    }
  | {
      readonly kind: 'chest';
      readonly restSec: number;
      /** The longest contact, in seconds. */
      readonly hold: number;
      /** The drop of the crash point at the damp, in head heights. */
      readonly drop: number;
      /** The room between the near rim of the cymbals and the front of the trunk, in meters. */
      readonly room: number;
    };

/**
 * The values of the hold of each percussion instrument (design 5.3). The directions are in the
 * model axes of the bind pose: the player faces -z, and its left is -x.
 */
interface PercussionHold {
  readonly hands: HandsRule;
  readonly sizes: StrikeSizes;
  /** The move of the target of each hand from the middle of a head, in meters. */
  readonly offsetL: Vec3;
  readonly offsetR: Vec3;
  /** The directions to which the elbows point. */
  readonly poleL: Vec3;
  readonly poleR: Vec3;
  /**
   * The distance of the playing spot of each kettle from the rim of its head nearest to the
   * player, in meters on the floor plane. A real timpanist strikes about 3 inches in from the
   * rim, directly in front of the player (`docs/reference/percussion-technique.md` 4). The
   * elephant strikes further in, so that its paws rest above the near rims. 0 keeps the target at
   * the middle of the head, as for the other instruments.
   */
  readonly rim: number;
  /**
   * The place from which a mallet points to its target, from the shoulder joint of its side, in
   * head heights `H`. Thus the wrist stays in front of the body and below the shoulder, and the
   * mallet slants down. The x points to the out side of each hand: -x for the left hand.
   */
  readonly home: Vec3;
  /** The turn of each mallet around its own axis in the paw. */
  readonly top: MalletTop;
  /**
   * The mallet across the forearm between strikes, or `null`: then the head lifts along the
   * normal of its target, and the mallet points from the home to the head. It takes the place
   * of `top`.
   */
  readonly across: MalletAcross | null;
  /**
   * The share of the pitch between strikes (`MalletAcross.pitch`) that the right mallet takes, so
   * that the two heads keep two heights between strikes and pass each other in a run. 1: both
   * heads at one height.
   */
  readonly pitchR: number;
  /**
   * True: the player holds its mallets over the instrument also in the rest pose, and the arms do
   * not hang (design 5.2). The spine then keeps its lean over the instrument ({@link lean}) at
   * rest too. The hanging paws of a player with short arms can reach into large kettles in front
   * of it.
   */
  readonly ready: boolean;
  /**
   * The set position of the sticks or the mallets at rest, or `null`: then each closed paw of the
   * hanging arm keeps its mallet as in the bind pose, and with `ready` the paws do not rest.
   */
  readonly set: MalletSet | null;
  /**
   * True: each timpani note plays on one of the two kettles beside the front gap
   * ({@link frontKettles}), and the other kettles stand beyond the reach of short arms. A note
   * below the middle of the lowest and the highest key of the part plays on the left kettle, and
   * the other notes on the right kettle. False: a note plays on the kettle of its key range
   * ({@link kettleOf}).
   */
  readonly pair: boolean;
  /**
   * The least distance along x from a strike of a hand to the last target of the other hand, in
   * meters (`alternateHands()`): a nearer target stays with the other hand. 0 lets a hand strike
   * up to the target of the other hand, as two mallets in turn on one timpani head.
   */
  readonly gap: number;
  /**
   * The farthest distance along x by which a fast strike of a hand can pass the last target of the
   * other hand, in meters (`alternateHands()`). A target farther past takes the hand before it
   * again, as a double stroke. 0: a fast strike does not pass the other hand.
   */
  readonly pass: number;
  /**
   * The farthest distance on the floor plane from the shoulder joint of a hand to its target, in
   * meters (`alternateHands()`). A farther target goes to the other hand when that hand is
   * nearer. `Infinity`: no limit.
   */
  readonly reach: number;
  /** The forward lean of the spine over the instrument while the player plays, in radians. */
  readonly lean: number;
  /**
   * The curl of the fingers around a mallet, a stick, a beater, or the strap of a cymbal, in
   * radians, so that the claws close on the shaft.
   */
  readonly curl: number;
  /**
   * True: each paw with a mallet turns around the shaft until it has no side bend on the forearm
   * at the strike, and keeps that roll through the stroke (`gripRoll()` of `pose/percussion.ts`).
   * False: the forearm lies in the plane of the palm, and the paw bends only to the side. That
   * side bend is small when the forearm stands near the angle of the shaft from the fingers.
   */
  readonly strikeRoll: boolean;
  /**
   * The side move of the body behind the notes, with the feet on the floor, or `null`: the body
   * keeps its place.
   */
  readonly side: SideMove | null;
  /**
   * The place of a drum on a stand from the body ({@link fitDrumPlace}), or `null`: the drum
   * keeps its bind place.
   */
  readonly fit: DrumFit | null;
  /** The damp of the sound after a note, or `null`: the instrument rings. */
  readonly damp: DampRule | null;
}

/**
 * The place of a drum on a stand from the body of the player (design 5.3). A real snare drummer
 * sets the head below the elbows of the hanging upper arms, so that the forearms are near level,
 * and holds the sticks in front of the body (`docs/reference/percussion-technique.md` 6). The
 * drum only goes up and forward from its bind place, so a body that it fits keeps that place.
 * The values fit the accepted badger: it keeps its place.
 */
export interface DrumFit {
  /** The least drop of the head below the elbows of the hanging upper arms, in head heights. */
  readonly drop: number;
  /**
   * The least room between the front of the trunk and the near rim of the head, in head heights,
   * at the heights from the head up to the shoulder joints. It is also the move forward at which
   * the head goes up by the full raise.
   */
  readonly gap: number;
}

/**
 * The elbows of a percussion player point down and out. A hold turns them nearer to the body
 * where the arms permit (design 5.3).
 */
const POLE_L: Vec3 = [-1, -1, 0.3];
const POLE_R: Vec3 = [1, -1, 0.3];

/** The forward axis of the model, around which the hand cymbals tilt. Nothing writes it. */
const Z_AXIS = new Vector3(0, 0, 1);

/** The place from which a mallet points to its target in most holds (`PercussionHold.home`). */
const MALLET_HOME: Vec3 = [0, -0.2, -0.75];

/**
 * The curl of the fingers of the badger around a mallet, a stick, a beater, or the strap of a
 * cymbal. The claws close on a shaft on the palm side of the paw (`PAW_SPOT` of
 * `models/instruments/percussion.ts`). At 60°, the claws stay open beside the shaft, and above
 * 90°, more faces at the knuckles turn over.
 */
export const GRIP_CURL = 90 * MathUtils.DEG2RAD;

/** The holds of the percussion instruments. */
export const PERCUSSION_HOLDS = {
  // The elephant mesh has short arms behind a deep belly, and its trunk hangs between the two
  // front kettles: each hand strikes the front kettle of its side, and the outer kettles stand
  // beyond its reach (pair). The paw rests above the near rim, and the mallet strikes 0.25 m in
  // from the rim, for the look of the reference images. As a real timpanist,
  // the paw holds the head out of the front of the fist (TIMPANI.malletTilt), and each mallet
  // points forward and in. The homes stand out from the shoulders, so that the mallets point
  // forward and 24° to 32° in at a strike, a V of about 55° as in the American grip. Between
  // strikes and at rest, each mallet keeps its strike direction, and the wrist lifts the head
  // 2 cm to 7 cm above the playing spot (across.pitch), as the set position of a real timpanist.
  // Before a strike, the wrist lifts the head 10 cm to 15 cm higher (sizes.lift, across.peak) and
  // brings it down at the note start, as the full stroke of a real player. A turn of the mallet
  // across the forearm between strikes lays the right mallet level across the belly, and a
  // larger pitch moves the shaft out of the closed paw. The elbows point down and a little out
  // from the body, so that the upper arms roll less, the skin does not twist at the shoulder, no
  // gap shows between each upper arm and the trunk from the back, and the thick upper arms of the
  // quad tubes go less far into the round belly near the elbows. The homes stand 0.25 H below the
  // shoulders and 0.2 H forward, so that each mallet slopes down along the line of its forearm and
  // the paw, as a real timpanist holds it. With the homes 0.37 H down, the forearm hangs down, the
  // mallet leaves the bottom of the paw nearly at a right angle, and the wrists twist in an
  // unnatural way at a strike. Homes higher than 0.25 H, or elbows that point back, fold more
  // faces of the paws and turn the paws faster in the lowering. The mallets stay over the kettles
  // in the rest pose, because the hanging paws reach into the large kettles (ready).
  timpani: {
    hands: 'sides',
    sizes: { lift: 0.2, rest: 0.03 },
    // The left mallet strikes 8 cm toward the middle, so that it points in as far as the right
    // mallet: with no offset, the left mallet points 17° in and the right mallet 22°.
    offsetL: [0.08, 0, 0],
    offsetR: [-0.05, 0, 0],
    poleL: [-0.8, -1, 0.2],
    poleR: [0.8, -1, 0.2],
    rim: 0.25,
    home: [0.48, -0.25, -0.2],
    top: 'shoulder',
    across: { rest: -1.2, lift: 0.65, pitch: 0.1, peak: 8 },
    pitchR: 1,
    ready: true,
    set: null,
    pair: true,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    side: null,
    fit: null,
    // No damp: in each tried place, the short arms held the lowest point of the paw 2 cm to 10 cm
    // over the head plane, and outside the head (design 5.3).
    damp: null,
    // The end of the round paw of the elephant closes on the shaft (TIMPANI.malletSpotL and malletSpotR).
    curl: 100 * MathUtils.DEG2RAD,
    // Each paw turns around the shaft until it has no side bend at the strike, and keeps that roll
    // between strikes, so that the shaft stays in the closed paw. Each hand strikes one kettle in
    // one direction, so the roll stays near one value. With no roll, the shafts leave the paws
    // 80° from the thumb side between strikes, and no paw grasps its mallet.
    strikeRoll: true,
  },
  // The badger stands behind the drum, and the right paw holds the beater at the near rim of the
  // right head, with the beater along the head, 10° down from the level, as a real player holds it
  // parallel to the head (docs/reference/percussion-technique.md 5). The beater strikes 18 cm from
  // the middle of the head, 3 cm below it and toward the player, about one third in from the rim.
  // The beater points from its home, near the elbow, so the head of the beater leaves the drum head
  // along its normal, and the paw and the forearm turn with it, as the stroke of the wrist and the
  // forearm of a real player. The head rests 5 cm off the drum head between strikes, and lifts up
  // to about 13 cm before a strike (sizes). The paw keeps the roll of the strike around the shaft,
  // so that the shaft leaves the fist at the side of the thumb (strikeRoll). The upper arm hangs
  // near the side, with the elbow down and back: with the elbow out, the forearm comes within 26°
  // of the shaft, and the shaft leaves the fist along the claws. The rebuilt round arm is free of
  // the trunk, and with the elbow a little in, it went 3.4 cm into the belly. The spine leans
  // 7° over the drum, so that the elbow can bend: with no lean, the wrist reaches 0.97 of the arm,
  // and the paw grasps the shaft in 10% of the play. With 9°, the elbow skin stretches 0.13 of the
  // upper arm from the rest. The paw holds the beater at the drum and the spine keeps its lean
  // also at rest (ready). The left arm hangs, because a single note often needs no muffling.
  'bass-drum': {
    hands: 'right',
    sizes: { lift: 0.13, rest: 0.05 },
    offsetL: [0, 0, 0],
    // The middle of the head of the beater one radius of its head off the drum head, so that it
    // touches the head at the note start.
    offsetR: [0.0215, -0.03, 0.18],
    poleL: POLE_L,
    poleR: [0, -0.5, 0.4],
    rim: 0,
    home: [0.56, -0.389, -0.146],
    top: 'up',
    across: null,
    pitchR: 1,
    ready: true,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0.12,
    side: null,
    fit: null,
    damp: { kind: 'palm', restSec: 0.5, hold: 0.5, wrist: [0.12, 0.05, -0.06] },
    curl: GRIP_CURL,
    strikeRoll: true,
  },
  // The sticks leave the front of the fists (SNARE_DRUM.malletTilt) and point from homes out
  // from the shoulders, so that they make a V of about 66° at a strike and slant down 9°, as the
  // matched grip of a real player. Between strikes, each stick keeps its strike direction, and
  // the wrist lifts the tip over the head (across.pitch), as a real player's stroke from the
  // wrist. With the rest direction across the forearm, the tips swing out over the rim. The pitch
  // of 0.15 rad holds each tip about 4 cm above the head between strikes, with the stick almost
  // level, as the ready position of a real player (1 to 2 inches, percussion 6). Before a
  // strike, the wrist lifts the tip higher by the loudness (sizes.lift, across.peak): about 11 cm
  // above the head at a velocity of 40, 14 cm at 100, and 15 cm at 127, below the 8 inches of a
  // full stroke, and about 10 cm in a roll. The ball at the tip touches the head at a strike
  // (offsetL, offsetR). With a pitch of 0.9 rad and a peak of 1, each tip stood 21 cm above the
  // head between strikes, the stick 35° up, and the stroke did not grow with the loudness. The
  // elbows point out, so that the rebuilt round upper arms stay out of the belly (design 5.3):
  // with the elbows nearer to the body, they went 2.4 cm into it. The drum takes its place from
  // the body (fit): at the bind place, the forearms or the paws of the recast elephant, bear, hippo,
  // and panda went 6.4 cm to 7.8 cm into the belly. With a room of 0.3 H, the paws of the recast
  // hippo and panda missed their targets by 4.7 cm to 5.8 cm more, and with the full raise for
  // each body, the sticks of the recast wolf and deer went into the raised drum.
  'snare-drum': {
    hands: 'alternate',
    sizes: { lift: 0.11, rest: 0.03 },
    // The middle of each ball one radius above the head, so that the ball touches the head at the
    // note start. With no lift, the ball went 8 mm into the head.
    offsetL: [-0.04, SNARE_DRUM.tip, 0],
    offsetR: [0.04, SNARE_DRUM.tip, 0],
    poleL: POLE_L,
    poleR: POLE_R,
    rim: 0,
    home: [0.5, -0.3, -0.5],
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 5 },
    pitchR: 1,
    ready: false,
    set: { raise: 0.01, rise: [0.1, 0.22] },
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    side: null,
    fit: { drop: 0.07, gap: 0.15 },
    damp: null,
    curl: GRIP_CURL,
    strikeRoll: true,
  },
  // The lift is the half of the gap between the inner faces of the two cymbals. The elbows point
  // down and a little out, so that fewer faces of the left shoulder of the badger mesh fold in the
  // lift.
  cymbals: {
    hands: 'pair',
    sizes: { lift: 0.15, rest: 0.06 },
    offsetL: [0, 0, 0],
    offsetR: [0, 0, 0],
    poleL: [-0.5, -1, 0.3],
    poleR: [0.5, -1, 0.3],
    rim: 0,
    home: MALLET_HOME,
    top: 'up',
    across: null,
    pitchR: 1,
    ready: false,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    side: null,
    fit: null,
    damp: { kind: 'chest', restSec: 0.5, hold: 0.8, drop: 0.3, room: 0.01 },
    curl: GRIP_CURL,
    strikeRoll: true,
  },
  // The left hand holds the triangle up, and its elbow points out to the left. The beater leaves
  // the front of the right fist (TRIANGLE.malletTilt) and keeps the angle of no twist of the paw
  // between strikes (across). The badger holds the triangle up also at rest (ready), because the
  // turn of the left paw from the hanging arm swings the paw far in the lift.
  'small-percussion': {
    hands: 'right',
    sizes: { lift: 0.05, rest: 0.02, roll: 0.01 },
    offsetL: [0, 0, 0],
    offsetR: [0, 0, 0],
    poleL: [-1, -0.5, 0.3],
    poleR: POLE_R,
    rim: 0,
    home: MALLET_HOME,
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: null, peak: 3 },
    pitchR: 1,
    ready: true,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    side: null,
    fit: null,
    damp: null,
    // The left paw closes on the clip of the triangle and the right paw on the short beater with
    // less curl: at 90°, the left paw folds 10 faces at the knuckles.
    curl: 75 * MathUtils.DEG2RAD,
    // A beater near the line of the forearm turns the paw fast with a roll that removes the
    // side bend, so the forearm lies in the plane of the palm.
    strikeRoll: false,
  },
  // The mallets leave the front of the fists (XYLOPHONE.malletTilt), as the sticks of the snare
  // drum, because a real player holds them in the matched grip of the snare drum. Between
  // strikes, each mallet keeps its strike direction, and the wrist holds the head about 4 cm over
  // its bar (across.pitch), as the low ready height of a real player. Before a strike, the wrist
  // lifts the head higher by the loudness (sizes.lift, across.peak), about 12 cm in the test
  // score, as a real player sets the stick height by the dynamic. With a pitch of 0.5 rad and a
  // peak of 1, the heads stood 13 cm (left) and 27 cm (right) over the bars, and the stroke did
  // not grow with the loudness. The short arms do not reach the bars from an
  // upright body, so the spine leans over them (lean), and the body moves from side to side
  // behind the notes with the feet in place (side). A run alternates the paws where the paws do
  // not cross, and else takes a double stroke, as a real player puts in a double stroke where
  // alternate strokes would cross the hands (pass). The paws keep to their sides of the bars
  // (gap), and a bar out of the reach of one paw goes to the other paw (reach).
  xylophone: {
    hands: 'alternate',
    sizes: { lift: 0.09, rest: 0.03 },
    // The left mallet strikes 2 cm nearer to the player than the middle of the bar, and the right
    // mallet 2 cm farther, so that the heads keep apart on near bars. On the smaller bars, 3 cm
    // bends the left wrist 53° at the lowest bars, and 2 cm 49°.
    offsetL: [0, 0, 0.02],
    offsetR: [0, 0, -0.02],
    poleL: [-0.8, -1, 0.3],
    // The rebuilt round arms of the badger are free of the trunk (design 5.3, "Free round arms").
    // The right elbow points further out, and each mallet points from a place out from the
    // shoulder, so that the paws stay out from the leaning belly. With the hold of the old arms,
    // the right upper arm went 3.1 cm into the belly. With the home 0.3 H out, the mallets miss
    // the bars by up to 4 cm.
    poleR: [2, -1, 0.3],
    rim: 0,
    home: [0.15, -0.2, -0.75],
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 6 },
    // Both heads keep one height between strikes, because the paws do not pass each other.
    pitchR: 1,
    ready: false,
    set: null,
    pair: false,
    // A later strike on one bar or a near bar stays in one hand, so that a mallet does not strike
    // under the head of the other mallet, which rests over its bar. With 1 cm, the mallets touch
    // where a run goes over from one paw to the other.
    gap: 0.02,
    // A fast strike does not pass the last bar of the other paw: it takes a double stroke. With
    // low heads, a pass of one bar put one shaft on the head of the other mallet for 2.8 s of
    // the test score, and a lift of the passing head over the other head did not clear it.
    pass: 0,
    reach: 0.53,
    lean: 0.2,
    // The short legs tilt far with a small move of the hips, and the foot skin then sinks into
    // the floor, so the hips keep their place, and the spine takes the whole move. A lean of 12°
    // moves the shoulders 5.5 cm toward the notes, so that both paws reach more bars of a run. At
    // 14°, the left paw bends 70° on the forearm, the limit of the arm gate.
    side: { span: 0.25, hips: 0, spine: 12 * MathUtils.DEG2RAD, moveSec: 0.6 },
    fit: null,
    damp: null,
    curl: GRIP_CURL,
    // A roll that removes the side bend at each strike turns the paws fast between the bars, so
    // the forearm lies in the plane of the palm.
    strikeRoll: false,
  },
} as const satisfies Readonly<Record<PercussionInstrument, PercussionHold>>;

/**
 * The hold of a suspended cymbal (`SpeciesParams.cymbalForm`), in place of
 * `PERCUSSION_HOLDS.cymbals` (design 5.3). The yarn mallets leave the front of the fists
 * (`SUSPENDED_CYMBAL.malletTilt`), as the sticks of the snare drum, and the two hands strike in
 * turn near the edge, opposite each other: the left hand at the left and the right hand at the
 * right (`docs/reference/percussion-technique.md` 7). The offsets move the target, the middle of a
 * cymbal of the scale 1, to these spots, 1.3 cm in from the rim. The homes stand further out than
 * for the snare drum, so that the mallets point in to the spots, and the upper arms of the badger
 * mesh fold less and stay within their accepted depth. Between strikes, each mallet keeps its
 * strike direction, and the wrist holds the ball about 3.5 cm over its spot (`across.pitch`), as
 * the ready position of the snare drum. Before a strike, the wrist lifts the ball higher by the
 * loudness (`sizes.lift`, `across.peak`): about 6 cm for a soft note and 13 cm for a loud note.
 * With a pitch of 0.7 rad and a peak of 1, each ball stood 15 cm above the plate between strikes,
 * the shaft 29° up, and the stroke did not grow with the loudness. With the rest direction across
 * the forearm, the heads swing out past the rim.
 */
export const SUSPENDED_CYMBAL_HOLD: PercussionHold = {
  hands: 'alternate',
  sizes: { lift: 0.1, rest: 0.03 },
  offsetL: [-0.187, 0, 0],
  offsetR: [0.187, 0, 0],
  poleL: [-0.6, -1, 0.3],
  poleR: [0.6, -1, 0.3],
  rim: 0,
  home: [0.6, -0.3, -0.5],
  top: 'up',
  across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 5 },
  pitchR: 1,
  ready: false,
  set: { raise: 0.06, rise: [0, 0.15] },
  pair: false,
  gap: 0,
  pass: 0,
  reach: Infinity,
  lean: 0,
  side: null,
  fit: null,
  damp: null,
  curl: GRIP_CURL,
  strikeRoll: true,
};

/**
 * The motion of the hand cymbals (design 5.3), as a real crash (`docs/reference/percussion-technique.md`
 * 7). The plates tilt from vertical, so that the right plate comes down onto the left plate. They
 * meet a little offset, as a glancing blow, and slide on past each other: the right plate down and
 * the left plate up (`StrikeState.slide`). After a crash, the plates part, turn their inner faces
 * out to the front and up, and rise, so that the sound rings to the hall. At the end of a note
 * before a rest, they go against the chest (`DampRule` `chest`). A louder crash meets higher. The
 * lengths are in head heights `H`.
 */
export const CRASH_MOTION = {
  /** The tilt of both plates from vertical around the forward axis, in radians. */
  tilt: 30 * MathUtils.DEG2RAD,
  /** The full slide of the right plate along its face, from the top of the lift to the rebound. */
  slide: 0.1,
  /** The share of the slide of the right plate that the left plate makes the other way. */
  leftShare: 0.5,
  /** The rise of the crash point from the softest to the loudest crash (`gestureSize()`). */
  raise: 0.15,
  /**
   * The turn of each inner face out to the front after a crash, in radians. Each plate turns
   * around its back rim, as a door on its hinge, so that the back rims do not meet.
   */
  ringTurn: 45 * MathUtils.DEG2RAD,
  /** The turn of each inner face up after a crash, in radians. */
  ringUp: 20 * MathUtils.DEG2RAD,
  /** The move of each plate away from the other plate after a crash, more than the rest height. */
  ringOpen: 0.06,
  /** The rise of the plates after a crash. */
  ringLift: 0.08,
  /** The turn out takes this time after the crash, in seconds. */
  ringInSec: 0.35,
  /** The plates turn back in this time, in seconds. */
  ringOutSec: 0.3,
  /** The share of the follow move after the softest crash. It grows to 1 at the loudest crash. */
  ringSoft: 0.25,
} as const;

/** The places of the hands of a percussion player, in head heights `H` (design 5.3). */
export const PERCUSSION_PLACES = {
  /** The place from which a mallet points to its target in most holds (`PercussionHold.home`). */
  malletHome: MALLET_HOME,
  /**
   * The cymbals meet here at a soft crash, from the middle of the two shoulder joints. A louder
   * crash meets higher (`CRASH_MOTION.raise`).
   */
  crash: [0, -0.09, -1.1],
  /**
   * The clip of the triangle in the left hand, from the left shoulder joint: at the height of the
   * mouth of the badger, as near to the eye level of a real player as its short arm reaches.
   */
  triangleClip: [0.3, 0.5, -0.9],
  /**
   * The world rotation of the left hand that holds the triangle up, from the bind pose: the
   * clip, which is in front of the palm in the bind pose, comes under the hand, and the triangle
   * hangs in the plane x-y. Thus the side of the triangle that the beater strikes faces the right
   * hand.
   */
  // holdTurn(-90, 40) of pose/winds.ts: the paw turns 40° around z, so that it bends less on the
  // forearm of the raised arm.
  triangleHand: [-0.664463, 0.241845, 0.241845, 0.664463],
} as const;

/**
 * The roll of the triangle (design 5.3): the beater moves fast between the two sides of the closed
 * lower corner, inside the corner, as a real player rolls in a closed corner
 * (`docs/reference/percussion-technique.md` 8).
 */
export const TRIANGLE_ROLL = {
  /** The keys of the targets on the bottom side and on the right side, near the corner. */
  keys: [2, 3],
  /** The distance of each target from the corner, along its side, in meters. */
  fromCorner: 0.035,
  /**
   * The radius of the rod and of the beater: each target is this far in from the middle line of
   * its side, so that the beater touches the rod and does not go into it.
   */
  touch: TRIANGLE.rod + TRIANGLE.beater,
  /** The part of the lift toward the player, against the part toward the inside of the corner. */
  front: 1,
  /**
   * A note on the triangle within this time of the note before it is a part of a roll, in
   * seconds: faster than eight notes each second.
   */
  rollSec: 0.125,
} as const;

/**
 * Gives the two roll targets of the triangle in the axes of its piece ({@link TRIANGLE_ROLL}):
 * the key, the point on the inner face of the side, and the unit normal into the corner.
 *
 * @returns The target on the bottom side and the target on the right side.
 */
function triangleCorner(): readonly (readonly [number, Vec3, Vec3])[] {
  const { side } = TRIANGLE;
  const low = -0.05 - side * Math.sin(60 * MathUtils.DEG2RAD);
  const corner = new Vector3(side / 2, low, 0);
  const top = new Vector3(0, -0.05, 0);
  const leftCorner = new Vector3(-side / 2, low, 0);
  const { keys, fromCorner, touch } = TRIANGLE_ROLL;
  const point = (to: Vector3, inward: Vector3): Vec3 =>
    toVec3(
      corner
        .clone()
        .add(to.clone().sub(corner).setLength(fromCorner))
        .addScaledVector(inward, touch),
    );
  const up = new Vector3(0, 1, 0);
  const intoRight = new Vector3(-Math.sin(60 * MathUtils.DEG2RAD), -0.5, 0);
  return [
    [keys[0], point(leftCorner, up), toVec3(up)],
    [keys[1], point(top, intoRight), toVec3(intoRight)],
  ];
}

/** The MIDI key of the tambourine (design 4.6). The other keys of the player strike the triangle. */
const TAMBOURINE_KEY = 54;

/**
 * One hand of a percussion player.
 *
 * - `mallet`: the hand strikes with the head of a mallet, a stick, or a beater.
 * - `plate`: the hand holds a cymbal. Its inner face moves along the normal of the crash.
 * - `hold`: the hand keeps one place: the left hand with the triangle.
 * - `free`: the arm hangs, as the left arm of the bass drum player.
 */
export type PercussionSide =
  | {
      readonly kind: 'mallet';
      readonly arm: ArmRig;
      /** The head of the mallet in the bind pose. */
      readonly head: Vec3;
      /** The place from which the mallet points to its target (`PercussionHold.home`). */
      readonly home: Vec3;
      /** The turn of the mallet around its own axis in the paw (`PercussionHold.top`). */
      readonly top: MalletTop;
      /** The mallet across the forearm between strikes (`PercussionHold.across`). */
      readonly across: MalletAcross | null;
      /**
       * The angle of the mallet in the bind pose from the plane normal to the forearm toward the
       * wrist, in radians: 0 for a mallet at 90° to the forearm (`TIMPANI.malletTilt`).
       */
      readonly tilt: number;
      /** The distance from the grip to the middle of the head of the mallet, in meters. */
      readonly length: number;
      /** The inverse of the rotation of the mallet in the bind pose. */
      readonly inverse: Quat;
      /** The roll of the mallet at the strike (`PercussionHold.strikeRoll`). */
      readonly strikeRoll: boolean;
    }
  | {
      readonly kind: 'plate';
      readonly arm: ArmRig;
      /** The middle of the plane of the rim on the inner side of the cymbal in the bind pose. */
      readonly face: Vec3;
      /** -1 for the left cymbal and 1 for the right cymbal: the side of the crash point. */
      readonly sign: -1 | 1;
      /** The world rotation of the hand from the bind pose: the tilt of `CRASH_MOTION`. */
      readonly turn: Quat;
      /** The distance from the middle of the plane of the rim to a corner of the rim, in meters. */
      readonly radius: number;
    }
  | {
      readonly kind: 'hold';
      readonly arm: ArmRig;
      readonly wrist: Vec3;
      /** The world rotation of the hand. */
      readonly hand: Quat;
    }
  | { readonly kind: 'free'; readonly arm: ArmRig };

/** The points of a percussion player in the bind pose that the pose needs. */
export interface PercussionRig {
  readonly instrument: PercussionInstrument;
  readonly hold: PercussionHold;
  /** The head height `H` of the body, in meters. */
  readonly headHeight: number;
  readonly chestBind: Vec3;
  readonly left: PercussionSide;
  readonly right: PercussionSide;
  /** The targets of the instrument, by a key of each target (see `targetKeyOf()`). */
  readonly targets: ReadonlyMap<number, StrikeTarget>;
  /** The target of each hand before its first strike. */
  readonly restL: StrikeTarget;
  readonly restR: StrikeTarget;
  /** The left arm in the rest pose, and the left arm that does not play (design 5.2, 5.3). */
  readonly hangL: HangingArm;
  /** The right arm in the rest pose. */
  readonly hangR: HangingArm;
  /** The legs whose feet stay on the floor in a side move (`PercussionHold.side`), or `null`. */
  readonly legs: PlantedLegs | null;
  /**
   * The height of the shoulder joints above the spine joint in the bind pose, in meters: the arm of
   * the side lean of the spine (`SideMove.spine`).
   */
  readonly lever: number;
  /**
   * The move of the instrument from its bind place, in meters, in the model axes: the place of a
   * drum from the body (`PercussionHold.fit`), or (0, 0, 0).
   */
  readonly place: Vec3;
  /**
   * The place of a damp with no mallet (`PercussionHold.damp`), in the model axes: the wrist of the
   * free paw on the left head of the bass drum, or the crash point of the hand cymbals at the
   * chest. `null` for another hold.
   */
  readonly dampPlace: Vec3 | null;
}

/**
 * Finds a play target of the instrument of a player.
 *
 * @param model The player model.
 * @param test Tells whether a target is the one to find.
 * @returns The target.
 * @throws Error if the instrument has no such target.
 */
function findTarget(model: PlayerModel, test: (t: PlayTarget) => boolean): PlayTarget {
  const target = model.instrument.targets.find(test);
  if (!target) {
    throw new Error(`The ${model.instrument.id} has no target for the pose.`);
  }
  return target;
}

/**
 * Gives a target of a piece in the model axes of the bind pose.
 *
 * @param model The player model.
 * @param target The play target.
 * @param at The point on the piece. The point of the target by default.
 * @returns The point and the unit normal.
 */
function bindTarget(model: PlayerModel, target: PlayTarget, at: Vec3 = target.from): StrikeTarget {
  const placed = model.pieces.find((p) => p.piece.bone === target.bone);
  const turn = new Quaternion(...(placed?.at.rotation ?? IDENTITY));
  return {
    point: placePoint(model.pieces, { bone: target.bone, at }),
    normal: toVec3(new Vector3(...target.normal).applyQuaternion(turn).normalize()),
  };
}

/**
 * Gives the octave shift of a xylophone part (design 5.3): the multiple of 12 semitones that puts
 * the highest key of the part in the highest octave of the bars, as a player plays a part below or
 * above the instrument in another octave. A part within the bars keeps its keys. The short bars of
 * the high keys stand nearest to the player, so the short arms of the badger reach them best. With
 * no shift, a steel drum part with the keys 53 to 62 strikes the lowest bar with each note, out of
 * the reach of the arms. Shifted to the middle of the bars, 0% of its strikes are within 5 mm of
 * their bars, and shifted to the top, 51%.
 *
 * @param lowest The lowest MIDI key of the part.
 * @param highest The highest MIDI key of the part.
 * @returns The shift, in semitones.
 */
export function xylophoneShift(lowest: number, highest: number): number {
  const [low, high] = XYLOPHONE.keys;
  if (lowest >= low && highest <= high) {
    return 0;
  }
  return 12 * Math.floor((high - highest) / 12);
}

/**
 * Gives the bar of a key of a xylophone part: the key after the octave shift of the part, moved by
 * octaves into the bars when the part is wider than the bars.
 *
 * @param pitch The MIDI key of the note.
 * @param shift The octave shift of the part ({@link xylophoneShift}), in semitones.
 * @returns The MIDI key of the bar.
 */
function xylophoneBar(pitch: number, shift: number): number {
  const [low, high] = XYLOPHONE.keys;
  let key = pitch + shift;
  while (key < low) {
    key += 12;
  }
  while (key > high) {
    key -= 12;
  }
  return key;
}

/**
 * Gives the key of the target of a note: the index of the kettle of the timpani, the MIDI key of
 * the bar of the xylophone, 1 for the tambourine and 0 for the triangle, and 0 for a drum or the
 * cymbals.
 *
 * @param instrument The instrument.
 * @param pitch The MIDI key of the note.
 * @param kettles The number of kettles of the timpani.
 * @param shift The octave shift of a xylophone part ({@link xylophoneShift}), in semitones.
 * @returns The key of the target.
 */
export function targetKeyOf(
  instrument: PercussionInstrument,
  pitch: number,
  kettles = 4,
  shift = 0,
): number {
  switch (instrument) {
    case 'timpani':
      return kettleOf(pitch, kettles);
    case 'xylophone':
      return xylophoneBar(pitch, shift);
    case 'small-percussion':
      return pitch === TAMBOURINE_KEY ? 1 : 0;
    case 'bass-drum':
    case 'snare-drum':
    case 'cymbals':
      return 0;
    default: {
      const unhandled: never = instrument;
      throw new Error(`The instrument "${String(unhandled)}" is not percussion.`);
    }
  }
}

/**
 * Gives the two kettles beside the front gap of the timpani (design 4.6): the last kettle at the
 * left of the gap and the first kettle at its right (`buildTimpani()`).
 *
 * @param kettles The number of kettles.
 * @returns The index of the left kettle and of the right kettle, 0 for the largest.
 */
export function frontKettles(kettles: number): readonly [number, number] {
  const split = Math.ceil(kettles / 2);
  return [split - 1, split];
}

/**
 * Selects the kettle of a timpani note (design 5.3): the kettle whose key range has its middle
 * nearest to the key. Of two kettles at the same distance, the larger kettle plays the note.
 *
 * @param pitch The MIDI key.
 * @param kettles The number of kettles.
 * @returns The index of the kettle, 0 for the largest.
 */
export function kettleOf(pitch: number, kettles: number): number {
  let best = 0;
  let distance = Infinity;
  for (const [i, [low, high]] of TIMPANI.keys.slice(0, kettles).entries()) {
    const d = Math.abs(pitch - (low + high) / 2);
    if (d < distance) {
      best = i;
      distance = d;
    }
  }
  return best;
}

/** The two hands of a pair of hand cymbals, and the crash point of the damp at the chest. */
interface PlatePair {
  readonly sides: readonly [PercussionSide, PercussionSide];
  /** The crash point of the damp against the chest, or `null` with no damp. */
  readonly chest: Vec3 | null;
}

/**
 * Gives the two hands of a pair of hand cymbals, and sets the crash target (design 5.3): the rims
 * meet at the crash point, along the crash normal of the tilt of `CRASH_MOTION`. It also gives the
 * crash point of the damp against the chest (`DampRule` `chest`): lower by the drop, and as far
 * forward as the room between the rims and the front of the trunk needs.
 *
 * @param model The player with the hand cymbals.
 * @param left The left arm.
 * @param right The right arm.
 * @param inH Gives a vector in head heights in meters.
 * @param targets Gets the crash target as key 0.
 * @returns The left and the right hand, and the crash point of the damp, or `null` with no damp.
 * @throws Error if a cymbal has no target of its plane of the rim.
 */
function pairOfPlates(
  model: PlayerModel,
  left: ArmRig,
  right: ArmRig,
  inH: (v: Vec3) => Vector3,
  targets: Map<number, StrikeTarget>,
): PlatePair {
  const middle = new Vector3(...left.bind.shoulder)
    .add(new Vector3(...right.bind.shoulder))
    .multiplyScalar(0.5);
  const crash = inH(PERCUSSION_PLACES.crash).add(middle);
  const plateTurn = toQuat(new Quaternion().setFromAxisAngle(Z_AXIS, CRASH_MOTION.tilt));
  const normal = new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...plateTurn));
  targets.set(0, { point: toVec3(crash), normal: toVec3(normal) });
  const rim = (bone: 'malletL' | 'malletR'): StrikeTarget & { radius: number } => {
    const target = findTarget(model, (t) => t.kind === 'plate' && t.bone === bone);
    const from = bindTarget(model, target).point;
    const to = bindTarget(model, target, target.to).point;
    return {
      ...bindTarget(model, target),
      radius: new Vector3(...from).distanceTo(new Vector3(...to)),
    };
  };
  const [rimL, rimR] = [rim('malletL'), rim('malletR')];
  const plate = (arm: ArmRig, at: typeof rimL, sign: -1 | 1): PercussionSide => ({
    kind: 'plate',
    arm,
    face: at.point,
    sign,
    turn: plateTurn,
    radius: at.radius,
  });
  const hold = PERCUSSION_HOLDS.cymbals.damp;
  let chest: Vec3 | null = null;
  if (hold.kind === 'chest') {
    const radius = Math.max(rimL.radius, rimR.radius);
    const y = crash.y - hold.drop * model.body.headHeight;
    let front = Infinity;
    for (let k = 0; k <= FRONT_POINTS; k++) {
      const z = trunkFront(model, 0, y - radius + (2 * radius * k) / FRONT_POINTS);
      if (z !== null) {
        front = Math.min(front, z);
      }
    }
    const z = Number.isFinite(front) ? front - radius - hold.room : crash.z;
    chest = [crash.x, y, Math.max(z, crash.z)];
  }
  return { sides: [plate(left, rimL, -1), plate(right, rimR, 1)], chest };
}

/** The number of heights at which {@link fitDrumPlace} measures the front of the trunk. */
const FRONT_POINTS = 16;

/**
 * Finds the move of a drum on a stand from its bind place to the place that fits the body
 * (`DrumFit`, design 5.3). The drum goes forward until its near rim is `gap` in front of the
 * trunk on the middle line, at the heights from the head up to the shoulder joints
 * (`trunkFront()`). A deep body also sets the head higher, toward `drop` below the elbows of the
 * hanging upper arms. The raise grows with the move that the bind place needs, and is full at a
 * move of one `gap`. Thus a thin body keeps the bind place, and the paws of a deep body stay in
 * front of the belly and in reach. The drum does not go down or back.
 *
 * @param model The player model.
 * @param fit The rule of the place.
 * @param head The middle of the head in the bind pose.
 * @param radius The radius of the head, in meters.
 * @param arms The two arms.
 * @returns The move, in meters, in the model axes.
 */
function fitDrumPlace(
  model: PlayerModel,
  fit: DrumFit,
  head: Vec3,
  radius: number,
  arms: readonly ArmRig[],
): Vec3 {
  const h = model.body.headHeight;
  const shoulder = (arm: ArmRig): Vector3 => new Vector3(...arm.bind.shoulder);
  // The elbow of a hanging upper arm is one upper arm length below the shoulder joint.
  const elbows = arms.map(
    (arm) => arm.bind.shoulder[1] - shoulder(arm).distanceTo(new Vector3(...arm.bind.elbow)),
  );
  const shoulders = arms.map((arm) => arm.bind.shoulder[1]);
  const mean = (values: readonly number[]): number =>
    values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
  const high = mean(shoulders);
  const room = fit.gap * h;
  // The player faces -z, so the near rim is at the larger z.
  const rim = head[2] + radius;
  // The move forward that the trunk needs with the head at a height.
  const forwardAt = (top: number): number => {
    let front = Infinity;
    for (let k = 0; k <= FRONT_POINTS; k++) {
      const z = trunkFront(model, 0, top + (k / FRONT_POINTS) * (high - top));
      if (z !== null) {
        front = Math.min(front, z);
      }
    }
    return Number.isFinite(front) ? Math.max(0, rim - (front - room)) : 0;
  };
  // The raise grows with the move that the bind place needs, and is full at one room.
  const share = room > 0 ? Math.min(1, forwardAt(head[1]) / room) : 0;
  const raise = share * Math.max(0, mean(elbows) - fit.drop * h - head[1]);
  return [0, raise, -forwardAt(head[1] + raise)];
}

/**
 * Finds the points of a percussion player that the pose needs.
 *
 * @param model A player with a percussion instrument.
 * @param instrument The instrument of the model.
 * @returns The rig.
 * @throws Error if the instrument has no target that the pose needs.
 */
export function percussionRig(model: PlayerModel, instrument: PercussionInstrument): PercussionRig {
  // A suspended cymbal has a target on its top, and the pair of hand cymbals has none.
  const suspended =
    instrument === 'cymbals' && model.instrument.targets.some((t) => t.kind === 'head');
  const hold: PercussionHold = suspended ? SUSPENDED_CYMBAL_HOLD : PERCUSSION_HOLDS[instrument];
  const h = model.body.headHeight;
  const left = armRig(model, 'L');
  const right = armRig(model, 'R');
  const inH = (v: Vec3): Vector3 => new Vector3(...v).multiplyScalar(h);
  const fromShoulder = (arm: ArmRig, v: Vec3): Vector3 =>
    inH(v).add(new Vector3(...arm.bind.shoulder));
  const malletHead = (bone: 'malletL' | 'malletR'): Vec3 =>
    bindTarget(
      model,
      findTarget(model, (t) => t.kind === 'mallet-head' && t.bone === bone),
    ).point;
  // The grip is the origin of the mallet bone.
  const malletLength = (bone: 'malletL' | 'malletR'): number => {
    const head = malletHead(bone);
    const grip = model.skeleton.positions[boneIndex(bone)] ?? head;
    return new Vector3(...head).distanceTo(new Vector3(...grip));
  };
  // The snare drum takes its place from the body (`PercussionHold.fit`), and the homes of the
  // mallets and the targets move with it.
  const place: Vec3 = hold.fit
    ? fitDrumPlace(
        model,
        hold.fit,
        bindTarget(
          model,
          findTarget(model, (t) => t.kind === 'head'),
        ).point,
        SNARE_DRUM.radius,
        [left, right],
      )
    : [0, 0, 0];
  // The x of the home points to the out side of the hand.
  const homeOf = (arm: ArmRig): Vec3 => {
    const [x, y, z] = hold.home;
    return [arm.side === 'L' ? -x : x, y, z];
  };
  // The slant of a mallet in the bind pose toward the wrist, against the bind forearm.
  const malletTilt = (arm: ArmRig, turn: Quaternion): number => {
    const forearm = new Vector3(...arm.bind.wrist).sub(new Vector3(...arm.bind.elbow)).normalize();
    const along = new Vector3(1, 0, 0).applyQuaternion(turn);
    return Math.asin(MathUtils.clamp(along.dot(forearm), -1, 1));
  };
  const mallet = (arm: ArmRig, bone: 'malletL' | 'malletR'): PercussionSide => {
    const turn = new Quaternion(
      ...(model.pieces.find((placed) => placed.piece.bone === bone)?.at.rotation ?? IDENTITY),
    );
    return {
      kind: 'mallet',
      arm,
      head: malletHead(bone),
      home: toVec3(fromShoulder(arm, homeOf(arm)).add(new Vector3(...place))),
      top: hold.top,
      across:
        hold.across && hold.across.pitch !== null && arm.side === 'R'
          ? { ...hold.across, pitch: hold.across.pitch * hold.pitchR }
          : hold.across,
      tilt: malletTilt(arm, turn),
      length: malletLength(bone),
      inverse: toQuat(turn.clone().invert()),
      strikeRoll: hold.strikeRoll,
    };
  };
  const targets = new Map<number, StrikeTarget>();
  const heads = model.instrument.targets.filter((t) => t.kind === 'head');
  let sides: readonly [PercussionSide, PercussionSide];
  let dampPlace: Vec3 | null = null;
  switch (instrument) {
    case 'timpani':
      for (const [i, head] of heads.entries()) {
        const move = hold.rim > 0 ? kettleHeadRadius(i) - hold.rim : 0;
        targets.set(i, towardPlayer(bindTarget(model, head), move));
      }
      sides = [mallet(left, 'malletL'), mallet(right, 'malletR')];
      break;
    case 'cymbals':
      if (suspended) {
        targets.set(
          0,
          bindTarget(
            model,
            findTarget(model, (t) => t.kind === 'head'),
          ),
        );
        sides = [mallet(left, 'malletL'), mallet(right, 'malletR')];
      } else {
        const plates = pairOfPlates(model, left, right, inH, targets);
        sides = plates.sides;
        dampPlace = plates.chest;
      }
      break;
    case 'bass-drum':
    case 'snare-drum':
      targets.set(
        0,
        offsetTarget(
          bindTarget(
            model,
            findTarget(model, (t) => t.kind === 'head'),
          ),
          place,
        ),
      );
      sides = [
        instrument === 'snare-drum' ? mallet(left, 'malletL') : { kind: 'free', arm: left },
        mallet(right, 'malletR'),
      ];
      // The free paw damps the left head: the right head one depth of the shell back along its
      // normal.
      if (hold.damp?.kind === 'palm') {
        const head = targets.get(0);
        if (head) {
          dampPlace = toVec3(
            new Vector3(...head.point)
              .addScaledVector(new Vector3(...head.normal), -BASS_DRUM.depth)
              .add(new Vector3(...hold.damp.wrist)),
          );
        }
      }
      break;
    case 'xylophone': {
      const bars = findTarget(model, (t) => t.kind === 'bars');
      const [low, high] = bars.keys ?? [0, -1];
      for (let key = low; key <= high; key++) {
        targets.set(key, bindTarget(model, bars, xylophoneBarPosition(key)));
      }
      sides = [mallet(left, 'malletL'), mallet(right, 'malletR')];
      break;
    }
    case 'small-percussion': {
      // The left hand holds the clip of the triangle in front of the chest.
      const clip = fromShoulder(left, PERCUSSION_PLACES.triangleClip);
      const clipBind = model.skeleton.positions[boneIndex('malletL')] ?? toVec3(clip);
      const hand = new Quaternion(...PERCUSSION_PLACES.triangleHand);
      const bindWrist = new Vector3(...left.bind.wrist);
      // Gives a bind point of the hand at the place of the hand that holds the triangle.
      const held = (point: Vec3): Vector3 =>
        new Vector3(...point).sub(bindWrist).applyQuaternion(hand);
      const wrist = toVec3(clip.sub(held(clipBind)));
      const barTarget = findTarget(model, (t) => t.kind === 'bar');
      const bar = bindTarget(model, barTarget);
      targets.set(0, {
        point: toVec3(held(bar.point).add(new Vector3(...wrist))),
        normal: toVec3(new Vector3(...bar.normal).applyQuaternion(hand)),
      });
      targets.set(
        1,
        bindTarget(
          model,
          findTarget(model, (t) => t.kind === 'head'),
        ),
      );
      // A roll strikes the two sides of the closed lower corner from inside, in turn
      // (TRIANGLE_ROLL_KEYS). Each target lies on the inner face of its side, and lifts toward
      // the inside of the corner and toward the player, so that the beater goes in and out in
      // front of the rods.
      for (const [key, local, inward] of triangleCorner()) {
        const placed = bindTarget(model, { ...barTarget, normal: inward }, local);
        targets.set(key, {
          point: toVec3(held(placed.point).add(new Vector3(...wrist))),
          normal: toVec3(
            new Vector3(...placed.normal)
              .applyQuaternion(hand)
              .add(new Vector3(0, 0, TRIANGLE_ROLL.front))
              .normalize(),
          ),
        });
      }
      sides = [
        { kind: 'hold', arm: left, wrist, hand: PERCUSSION_PLACES.triangleHand },
        mallet(right, 'malletR'),
      ];
      break;
    }
    default: {
      const unhandled: never = instrument;
      throw new Error(`The instrument "${String(unhandled)}" is not percussion.`);
    }
  }
  const ordered = [...targets.values()].toSorted((a, b) => a.point[0] - b.point[0]);
  const fallback: StrikeTarget = { point: [0, 0, 0], normal: [0, 1, 0] };
  // With a pair of front kettles, each hand rests over its front kettle.
  const [frontL, frontR] = frontKettles(targets.size);
  const pair = instrument === 'timpani' && hold.pair;
  const restL = (pair ? targets.get(frontL) : undefined) ?? ordered[0] ?? fallback;
  const restR = (pair ? targets.get(frontR) : undefined) ?? ordered.at(-1) ?? fallback;
  return {
    instrument,
    hold,
    headHeight: h,
    chestBind: model.skeleton.positions[boneIndex('chest')] ?? [0, 0, 0],
    left: sides[0],
    right: sides[1],
    targets,
    restL: offsetTarget(restL, hold.offsetL),
    restR: offsetTarget(restR, hold.offsetR),
    hangL: hangingArm(model, left),
    hangR: hangingArm(model, right),
    legs: hold.side ? plantedLegs(model) : null,
    lever: left.bind.shoulder[1] - (model.skeleton.positions[boneIndex('spine')]?.[1] ?? 0),
    place,
    dampPlace,
  };
}

/**
 * Moves a target by the offset of a hand.
 *
 * @param target The target.
 * @param offset The offset, in meters.
 * @returns The moved target.
 */
export function offsetTarget(target: StrikeTarget, offset: Vec3): StrikeTarget {
  const point = new Vector3(...target.point).add(new Vector3(...offset));
  return { point: toVec3(point), normal: target.normal };
}

/**
 * Gives the directions across a forearm (design 5.3), in the frame of the elbow: the hinge of the
 * elbow is normal to the upper arm and the forearm, as the studio skin turns its forearm
 * (`poseStudioBones()`). `up` is the direction in which a mallet leaves the fist with no twist
 * of the paw on the forearm: in the bind pose, the hinge is +x, the forearm points down, and the
 * mallet points forward. `out` is the hinge, turned to the out side of the hand.
 *
 * @param forearm The unit direction of the forearm, from the elbow to the wrist.
 * @param upper The direction of the upper arm, from the shoulder to the elbow.
 * @param side The side of the hand: its out side is -x for the left hand.
 * @param up Gets the unit direction of the mallet with no twist.
 * @param out Gets the unit direction out across the forearm, normal to `up`.
 */
export function acrossAxes(
  forearm: Vector3,
  upper: Vector3,
  side: 'L' | 'R',
  up: Vector3,
  out: Vector3,
): void {
  out.crossVectors(upper, forearm);
  if (out.lengthSq() < 1e-8) {
    out.set(1, 0, 0);
  }
  out.normalize();
  up.crossVectors(out, forearm).normalize();
  if ((side === 'L' ? -1 : 1) * out.x < 0) {
    out.negate();
  }
}

/**
 * Moves a target toward the player on the floor plane: the player stands at the origin of the
 * model axes.
 *
 * @param target The target.
 * @param distance The move, in meters.
 * @returns The moved target, or the target with no move for a distance of 0.
 */
function towardPlayer(target: StrikeTarget, distance: number): StrikeTarget {
  const [x, , z] = target.point;
  const length = Math.hypot(x, z);
  if (distance === 0 || length === 0) {
    return target;
  }
  return offsetTarget(target, [(-x / length) * distance, 0, (-z / length) * distance]);
}
