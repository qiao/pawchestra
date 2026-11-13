import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { placePoint } from '../models/instruments/hold.ts';
import {
  BASS_DRUM,
  SNARE_DRUM,
  TABLE_PLACES,
  TIMPANI,
  TRIANGLE,
  XYLOPHONE,
  kettleHeadRadius,
  xylophoneBarPosition,
} from '../models/instruments/percussion.ts';
import type { TablePlace } from '../models/instruments/percussion.ts';
import type { PlayTarget } from '../models/instruments/types.ts';
import { pawBindOf } from '../models/studio-rig.ts';
import type { PawBind } from '../models/studio-rig.ts';
import { IDENTITY, toQuat, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import { Y_AXIS, Z_AXIS } from './axes.ts';
import type { InstrumentOf } from './family.ts';
import { hangingArm } from './hang.ts';
import type { HangingArm } from './hang.ts';
import { trunkFront } from './cello-place.ts';
import { armRig, solveTwoBone } from './ik.ts';
import type { ArmRig } from './ik.ts';
import { TAMBOURINE_KEY } from './percussion-switch.ts';
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
  /** The move of each wrist up from its place on the hanging arm, in head heights `H`. */
  readonly raise: number;
  /**
   * The turn of the left and of the right stick around the forearm, up from the level direction
   * in across the body, in radians. The two sticks cross in front of the body, so they take two
   * turns and cross at two heights.
   */
  readonly rise: readonly [left: number, right: number];
}

/**
 * The damp of the sound after a note (design 5.3), as a real player stops the ring of a drum or a
 * cymbal at a rest (`docs/reference/percussion-technique.md` 5, 7). A note is damped at its end
 * when the silence from its end to the next note of the player is at least `restSec`.
 *
 * - `chest`: the hand cymbals go against the chest.
 * - `palm`: the free paw lays its palm on the far head of the bass drum.
 * - `edge`: the paw that did not strike the note grips the rim of the suspended cymbal.
 * - `fingers`: the paw that struck the note lays its fingers on the head of the timpani.
 */
export type DampRule = ChestDamp | PalmDamp | EdgeDamp | FingersDamp;

/** The damp of the hand cymbals against the chest ({@link DampRule}). */
export interface ChestDamp {
  readonly kind: 'chest';
  readonly restSec: number;
  /** The longest contact, in seconds. */
  readonly hold: number;
  /** The drop of the crash point at the damp, in head heights. */
  readonly drop: number;
  /** The room between the near rim of the cymbals and the front of the trunk, in head heights. */
  readonly room: number;
}

/**
 * The damp of the suspended cymbal ({@link DampRule}): the paw that did not strike the note goes
 * to the rim nearest to its shoulder, and the wrist lifts the head of its mallet, so that the
 * fingers touch the edge.
 */
export interface EdgeDamp {
  readonly kind: 'edge';
  readonly restSec: number;
  /** The longest contact, in seconds. */
  readonly hold: number;
  /** The distance of the rim from the middle of the cymbal, in meters. */
  readonly rim: number;
  /**
   * The grip of the mallet at the damp, from the rim point, in head heights `H`: out from the rim
   * on the line from the middle of the cymbal to the shoulder joint, and up.
   */
  readonly grip: readonly [out: number, up: number];
  /**
   * The turn of the rim point around the middle of the cymbal from the line to the shoulder joint
   * toward the out side of the hand, in radians.
   */
  readonly around: number;
  /** The share of the pitch of the mallet at the damp (`MalletAcross.pitch`). */
  readonly share: number;
  /** The forward lean of the spine at the damp, in radians, on top of `PercussionHold.lean`. */
  readonly lean: number;
}

/**
 * The damp of the timpani ({@link DampRule}): the paw that struck the note moves its grip toward
 * the player and keeps the direction of its mallet, and the wrist lifts the head of the mallet, so
 * that the end of the closed paw touches the head, as a real timpanist muffles with the back
 * fingers and keeps the mallet between the thumb and the index finger
 * (`docs/reference/percussion-technique.md` 4). The spine leans over the kettles, and the upper
 * body can turn the shoulder of the paw forward. The muffle and the lean do not follow the lift and
 * the lowering, so that a pause in a muffle keeps the paw on the head. The paw keeps the roll of
 * the mallet of its place before the muffle, and a long move to the muffle takes more time
 * (`speed`).
 */
export interface FingersDamp {
  readonly kind: 'fingers';
  readonly restSec: number;
  /** The longest contact, in seconds. */
  readonly hold: number;
  /**
   * The distance on the floor plane from the shoulder joint of the left and of the right hand to
   * the grip of the mallet at the damp, in head heights `H`. The grip lies on the line from the playing spot
   * of the hand to the player, as far toward the spot as this reach permits, so that the short arm
   * reaches the head.
   */
  readonly reach: readonly [left: number, right: number];
  /** The least distance of the grip in from the near rim of the head, in meters. */
  readonly rim: number;
  /** The height of the grip over the head, in head heights `H`. */
  readonly up: number;
  /**
   * The depth of the lowest point of the rigid paw under the head, in head heights `H`
   * (`DampHand.touch`). The skin of the studio body lies up to about 2.5 cm under that point, so
   * a negative depth lays the end of the paw lightly on the head.
   */
  readonly press: number;
  /** The share of the pitch of the mallet at the damp (`MalletAcross.pitch`). */
  readonly share: number;
  /** The forward lean of the spine at the damp, in radians. */
  readonly lean: number;
  /**
   * The turn of the upper body at the damp, in radians, so that the shoulder of the paw of the
   * damp comes forward toward its kettle.
   */
  readonly turn: number;
  /**
   * The highest speed of the grip in the move to the muffle and back, in meters each second
   * (`DampHand.moveSec`).
   */
  readonly speed: number;
  /**
   * The lift of the paw in the middle of its move to the muffle and back, in head heights `H`, so
   * that the paw passes over the hoop at the near rim of the kettle.
   */
  readonly arc: number;
}

/** The damp of the free paw on the far head of the bass drum ({@link DampRule}). */
export interface PalmDamp {
  readonly kind: 'palm';
  readonly restSec: number;
  /** The longest contact, in seconds. */
  readonly hold: number;
  /**
   * The wrist at the damp, from the middle of the far head, in head heights `H`, in the axes of
   * the head: out from the head along its normal, up, and along the head toward the player.
   */
  readonly wrist: Vec3;
  /**
   * The angle of the fingers down from the line along the head away from the player, in
   * radians. The palm faces the head.
   */
  readonly fingers: number;
  /**
   * The turn of the paw around the vertical from flat on the head, in radians, so that the
   * fingers point into the head and the paw keeps nearer to the line of the forearm.
   */
  readonly yaw: number;
  /**
   * The turn of the upper body to the right at the damp, in radians, so that the left shoulder
   * comes forward toward the far head.
   */
  readonly turn: number;
}

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
  /**
   * The largest height of the grip of a mallet over its target at a strike, in head heights `H`,
   * or `null` for no limit. A target far out from the home turns the mallet steeply down from
   * there, and the grip goes up toward the shoulder. With a limit, the mallet slopes down by at
   * most the angle that puts the grip at this height, and it keeps its heading on the floor
   * plane, so that the wrist stays low over the bars, as a real player keeps the hands low over
   * the keyboard (`docs/reference/percussion-technique.md` 9).
   */
  readonly gripRise: number | null;
  /**
   * The least distance of the home of a mallet out from its target along x, in head heights `H`,
   * or `null` for the home of {@link home} alone. A target out past the home of its hand moves the
   * home further out, so that the mallet still points a little in to the target, as the shaft
   * leaves the closed paw across the forearm. With no move, a mallet to an end bar points straight
   * forward along the forearm, and the paw bends far on the forearm.
   */
  readonly homeOut: number | null;
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
   * The share of the pitch between strikes (`MalletAcross.pitch`) that a ready hold keeps in the
   * rest pose. 0 lays the head of each mallet on its target, as a real timpanist rests the mallets
   * on a head. 1 keeps the heights between strikes. A hold with no ready pose does not read it.
   */
  readonly restPitch: number;
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
   * head heights `H` (`alternateHands()`). A farther target goes to the other hand when that hand is
   * nearer. `Infinity`: no limit.
   */
  readonly reach: number;
  /** The forward lean of the spine over the instrument while the player plays, in radians. */
  readonly lean: number;
  /**
   * The share of {@link lean} that the neck and the head turn back up, so that the player looks
   * ahead over the instrument, as a real player watches the conductor. 0: the head leans with the
   * spine.
   */
  readonly headUp: number;
  /**
   * The curl of the fingers of the left and of the right paw around a mallet, a stick, a beater,
   * the clip of the triangle, or the strap of a cymbal, in radians, so that the claws close on it.
   */
  readonly curl: readonly [left: number, right: number];
  /**
   * True: each paw with a mallet turns around the shaft until it has no side bend on the forearm
   * at the strike, and keeps that roll through the stroke (`gripRoll()` of `pose/percussion.ts`).
   * False: the forearm lies in the plane of the palm, and the paw bends only to the side. That
   * side bend is small when the forearm stands near the angle of the shaft from the fingers.
   */
  readonly strikeRoll: boolean;
  /**
   * True: each paw that holds a mallet, a stick, a beater, or the clip of the triangle keeps the
   * turn of the hand of the player, and the retarget does not turn it in the plane of its palm
   * toward the forearm (`PAW_TURN` of `models/studio-rig.ts`). The piece follows the hand of the
   * player, so it then stays where the bind pose holds it in the closed paw. False: the retarget
   * turns the paw, and a turn of 30° moves the claws off a stick.
   */
  readonly keepPaw: boolean;
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
interface DrumFit {
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
  // from the rim, for the look of the reference images. As a real timpanist with the German grip,
  // the palm of each paw faces down, the shaft crosses the lower side of the closed stump, and the
  // head leaves the front of the fist (TIMPANI.malletTilt, malletSpotL). The homes stand 0.66 H
  // out from the shoulders, so that the mallets point forward and 27° to 34° in, a V of about 60°,
  // and each forearm stands 54° to 60° from its shaft at a strike. With the homes 0.48 H out, the
  // shaft ran along the forearm and left the end of the stump. With 0.7 H, a right strike missed
  // its target by 7 mm. Between strikes and at rest, each mallet keeps its strike direction, and
  // the wrist lifts the head 0.3 rad (across.pitch): the mallet then slopes 13° to 17° down, and
  // its felt ball is about one inch over the head, as in the set position of a real timpanist.
  // The rest height of the lift (sizes.rest) and the peak share go with the pitch, so the full
  // stroke keeps its turn of up to 1.2 rad by the loudness (sizes.lift). With the pitch of 0.1,
  // the mallets sloped 21° to 24° down and the balls lay on the heads. The mallet points in, nearly
  // along the level axis of the turn, so a turn of 0.4 to 0.8 rad (lift 0.2, peak 8) lifted the
  // head only a few cm, and the close views showed no lift. A turn of the mallet across the
  // forearm between strikes lays the right mallet level across the belly. The elbows point down
  // and a little out from the body, so that the upper arms roll less, the skin does not twist at
  // the shoulder, no gap shows between each upper arm and the trunk from the back, and the thick
  // upper arms of the quad tubes go less far into the round belly near the elbows. The homes stand
  // 0.25 H below the shoulders and 0.2 H forward. Lower homes put the stump paws into the kettles,
  // because the paws stand over the heads. The mallets stay over the kettles in the rest pose,
  // because the hanging paws reach into the large kettles (ready).
  timpani: {
    hands: 'sides',
    sizes: { lift: 0.3, rest: 0.09 },
    // The left mallet strikes 8 cm toward the middle, so that it points in as far as the right
    // mallet: with no offset, the left mallet points 17° in and the right mallet 22°.
    offsetL: [0.08, 0, 0],
    offsetR: [-0.05, 0, 0],
    poleL: [-0.8, -1, 0.2],
    poleR: [0.8, -1, 0.2],
    rim: 0.25,
    home: [0.66, -0.25, -0.2],
    gripRise: null,
    homeOut: null,
    top: 'shoulder',
    across: { rest: -1.2, lift: 0.65, pitch: 0.3, peak: 4 },
    pitchR: 1,
    ready: true,
    // At rest, the felt balls lie on the heads (restPitch), as a real timpanist rests the mallets
    // on a head (percussion 4), because the paws cannot hang beside the large kettles.
    restPitch: 0,
    set: null,
    pair: true,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    headUp: 0,
    side: null,
    fit: null,
    // After a note before a rest, the paw that struck it muffles its head (damp). The left front
    // kettle stands nearer than the right one, so each side has its own reach. The spine leans 3°,
    // and the upper body does not turn: a turn of 17° twisted the chest 13° in 0.06 s at a muffle.
    // The stump paw of the Tripo elephant reaches 0.52 m and 0.51 m, and its rigid low point stays
    // 3.0 cm over the head, so that its skin touches the head (sweep: paws, forearms, and the trunk
    // out of the kettles). On the way to the muffle and back, the paw lifts 0.04 H (2.4 cm) in the
    // middle (arc), so that it passes over the hoop. With 2.5 cm and no arc, the left skin went
    // 3.3 cm to 3.5 cm into the kettle on the way and 3.0 cm at the muffle (body-clip limit 2.7). The grip stays level with the head, and the mallet keeps 0.5 rad of
    // the pitch (share), so that the mallet head stays out of the head. The paw moves about 25 cm
    // to the muffle, at most at 1.2 m/s (speed). In 0.06 s, it moved 6.7 m/s. With the lean of
    // 15°, the reach of 0.46 m, and a press of 1.7 cm of the old paw, the stump went 5.7 cm and
    // the forearm 6.4 cm into the kettles, the trunk 2.2 cm into a head, and the center of mass
    // moved 10 cm forward of the middle of the soles.
    damp: {
      kind: 'fingers',
      restSec: 0.5,
      hold: 0.3,
      reach: [0.876789, 0.859928],
      rim: 0.05,
      up: 0,
      press: -0.050589,
      share: 1.67,
      lean: 0.05,
      turn: 0,
      speed: 1.2,
      arc: 0.04,
    },
    // The end of the stump paw of the Tripo elephant closes a little on the shaft
    // (TIMPANI.malletSpotL and malletSpotR). The stump has no fingers: with a curl of 100° (the
    // old paw), the ring of its nails folded 44 and 43 faces at rest, and with 20° 10 and 9.
    curl: [20 * MathUtils.DEG2RAD, 20 * MathUtils.DEG2RAD],
    // Each paw turns around the shaft until it has no side bend at the strike, and keeps that roll
    // between strikes, so that the shaft stays in the closed paw. Each hand strikes one kettle in
    // one direction, so the roll stays near one value. With no roll, the shafts leave the paws
    // 80° from the thumb side between strikes, and no paw grasps its mallet.
    strikeRoll: true,
    keepPaw: false,
  },
  // The badger stands behind the drum, and the right paw holds the beater at the near rim of the
  // right head, with the beater along the head, 10° down from the level, as a real player holds it
  // parallel to the head (docs/reference/percussion-technique.md 5). The beater strikes 18 cm from
  // the middle of the head toward the player, at its height, 7 cm in from the rim, near one third.
  // The beater points from its home, near the elbow, so the head of the beater leaves the drum head
  // along its normal, and the paw and the forearm turn with it, as the stroke of the wrist and the
  // forearm of a real player. The head rests 5 cm off the drum head between strikes, and lifts up
  // to about 13 cm before a strike (sizes). The paw keeps the roll of the strike around the shaft,
  // so that the shaft leaves the fist at the side of the thumb (strikeRoll). The upper arm hangs
  // near the side, with the elbow down and back: with the elbow out, the forearm comes within 26°
  // of the shaft, and the shaft leaves the fist along the claws. The rebuilt round arm is free of
  // the trunk, and with the elbow a little in, it went 3.4 cm into the belly. The spine leans 13°
  // over the drum, and the home stands 0.5 H out, so that the beater of the Tripo badger reaches
  // each strike spot: with 7° and 0.56 H, it missed by up to 2.7 cm, and with 13° and 0.62 H, by up
  // to 2.2 cm. The paw holds the beater at the drum and the spine keeps its lean also at rest
  // (ready). The left arm hangs while the badger plays, because a single note often needs no
  // muffling. In a rest after a note, the left palm lies on the near part of the far head (damp),
  // and the upper body turns 26° so that the left shoulder comes forward: with 20°, the left
  // forearm of the Tripo badger went 2.2 cm into the belly at the drum place of now plus 2 cm to
  // the right. With no turn, the left upper arm of the old badger went 4.8 cm into the body, and
  // the drum moved or turned to the left put an upper arm 3.3 cm to 4.3 cm into the body or the
  // beater off its spot. The paw turns 37° from flat toward the forearm, so that it bends 2° on the
  // forearm at p95 (47° flat), and stands 7 cm out so that the claws stay at the head.
  'bass-drum': {
    hands: 'right',
    sizes: { lift: 0.13, rest: 0.05 },
    offsetL: [0, 0, 0],
    // The middle of the head of the beater one radius of its head off the drum head, so that it
    // touches the head at the note start.
    offsetR: [0.0215, 0, 0.18],
    poleL: POLE_L,
    poleR: [0, -0.5, 0.4],
    rim: 0,
    home: [0.5, -0.389, -0.146],
    gripRise: null,
    homeOut: null,
    top: 'up',
    across: null,
    pitchR: 1,
    ready: true,
    restPitch: 1,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0.22,
    // The neck and the head turn back up by the whole lean, so that the badger looks ahead to the
    // conductor over the drum: the head skin then stays at least 6.7 cm from the drum in the play,
    // and with the head on the leaned spine, the snout came within 1.0 cm of the top hoop.
    headUp: 1,
    side: null,
    fit: null,
    damp: {
      kind: 'palm',
      restSec: 0.5,
      hold: 0.5,
      wrist: [0.287283, 0, 1.026011],
      fingers: 0.5,
      yaw: 0.65,
      turn: 0.45,
    },
    curl: [GRIP_CURL, GRIP_CURL],
    strikeRoll: true,
    // The right paw keeps the turn of the hand, so that the curled claws close on the beater
    // (`BASS_DRUM.malletTilt`).
    keepPaw: true,
  },
  // The sticks leave the front of the fists (SNARE_DRUM.malletTilt) and point from homes 0.4 H out
  // from the shoulders, so that they make a V at a strike and slant down, as the matched grip of a
  // real player. The spine leans 3° over the drum (lean), so that the arms of the Tripo badger
  // reach the strike spots: with the homes 0.5 H out and no lean, the sticks missed the spots by
  // up to 1.4 cm. Between strikes, each stick keeps its strike direction, and the wrist
  // lifts the tip over the head (across.pitch), as a real player's stroke from the wrist. With the
  // rest direction across the forearm, the tips swing out over the rim. The pitch of 0.15 rad holds
  // each tip about 4 cm above the head between strikes, with the stick almost level, as the ready
  // position of a real player (1 to 2 inches, percussion 6). Before a strike, the wrist lifts the
  // tip higher by the loudness (sizes.lift, across.peak): about 11 cm above the head at a velocity
  // of 40, 14 cm at 100, and 15 cm at 127, below the 8 inches of a full stroke, and about 10 cm in
  // a roll. The ball at the tip touches the head at a strike (offsetL, offsetR). The drum takes
  // its place from the body (fit): at the bind place, the forearms or the paws of the recast elephant, bear, hippo, and panda went
  // 6.4 cm to 7.8 cm into the belly. With a room of 0.3 H, the paws of the recast hippo and panda
  // missed their targets by 4.7 cm to 5.8 cm more, and with the full raise for each body, the
  // sticks of the recast wolf and deer went into the raised drum.
  'snare-drum': {
    hands: 'alternate',
    sizes: { lift: 0.11, rest: 0.03 },
    // The middle of each ball one radius above the head, so that the ball touches the head at the
    // note start. With no lift, the ball went 8 mm into the head.
    offsetL: [-0.04, SNARE_DRUM.tip, 0],
    offsetR: [0.04, SNARE_DRUM.tip, 0],
    // The elbows point down and a little out and forward, so that the upper arms hang near the
    // body, as a real player keeps the elbows about a fist from the body (percussion 6): the
    // median upper arm stands 19° and 20° out from the side of the body in the play, as the
    // hanging arm of the badger (21° to 22°). With the elbows at [±1, -1, 0.3], 33° and 34°. The
    // upper arms go 1.7 cm into the arm roots (limit 2.5 cm).
    poleL: [-0.3, -1, 0.5],
    poleR: [0.3, -1, 0.5],
    rim: 0,
    home: [0.4, -0.3, -0.5],
    gripRise: null,
    homeOut: null,
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 5 },
    pitchR: 1,
    ready: false,
    restPitch: 1,
    set: { raise: 0.04104, rise: [0.1, 0.22] },
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0.05,
    headUp: 0,
    side: null,
    fit: { drop: 0.07, gap: 0.15 },
    damp: null,
    curl: [GRIP_CURL, GRIP_CURL],
    strikeRoll: true,
    // The paws keep the turn of the hands, so that the curled claws close on the sticks in each
    // sample (`pnpm wind-grip snare-drummer`). With the turn of the retarget of 24° to 35° in the
    // play, the claw tips stood 3.3 cm off the sticks, and the paws grasped in 5% of the samples.
    keepPaw: true,
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
    gripRise: null,
    homeOut: null,
    top: 'up',
    across: null,
    pitchR: 1,
    ready: false,
    restPitch: 1,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    lean: 0,
    headUp: 0,
    side: null,
    fit: null,
    damp: { kind: 'chest', restSec: 0.5, hold: 0.8, drop: 0.3, room: 0.04104 },
    curl: [GRIP_CURL, GRIP_CURL],
    strikeRoll: true,
    keepPaw: false,
  },
  // The left hand holds the triangle up, and its elbow points out to the left. The beater leaves
  // the front of the right fist (TRIANGLE.malletTilt) and keeps the angle of no twist of the paw
  // between strikes (across). Before a louder note, it turns up to 1.35 times as far back (peak):
  // with 1.5, the beater went 1.9 cm into the belly, and with 3, 5.5 cm. A roll lifts little
  // (roll). The badger holds the triangle up also at rest (ready), because the
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
    gripRise: null,
    homeOut: null,
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: null, peak: 1.35 },
    pitchR: 1,
    ready: true,
    restPitch: 1,
    set: null,
    pair: false,
    gap: 0,
    pass: 0,
    reach: Infinity,
    // The spine leans 6°, so that the beater reaches the lower triangle: with no lean, it missed
    // the strike spots by up to 2.1 cm.
    lean: 0.1,
    headUp: 0,
    side: null,
    fit: null,
    damp: null,
    // The left paw closes on the clip of the triangle with a deep curl, so that the claw tips
    // touch the thin clip (pnpm wind-grip percussionist): at 118°, the left paw grasps the clip in
    // 79% of the play and in the rest, with the tips 0.5 cm off it. At 75°, the tips stood 3.0 cm
    // off, and the paw grasped in no sample. The deep curl folds 16 faces at the knuckles inside
    // the fist (10 at 75°). The right paw closes on the short beater with less curl.
    curl: [118 * MathUtils.DEG2RAD, 75 * MathUtils.DEG2RAD],
    // A beater near the line of the forearm turns the paw fast with a roll that removes the
    // side bend, so the forearm lies in the plane of the palm.
    strikeRoll: false,
    keepPaw: false,
  },
  // The mallets leave the front of the fists (XYLOPHONE.malletTilt), as the sticks of the snare
  // drum, because a real player holds them in the matched grip of the snare drum. Between strikes,
  // each mallet keeps its strike direction, and the wrist holds the head about 4 cm over its bar
  // (across.pitch), as the low ready height of a real player. Before a strike, the wrist lifts the
  // head higher by the loudness (sizes.lift, across.peak), about 12 cm in the test score, as a real
  // player sets the stick height by the dynamic. The short arms do not reach the bars from an
  // upright body, so the spine leans over them (lean), and the body moves from side to side behind
  // the notes with the feet in place (side). A run alternates the paws where the paws do not cross,
  // and else takes a double stroke, as a real player puts in a double stroke where alternate
  // strokes would cross the hands (pass). The paws keep to their sides of the bars (gap), and a bar
  // out of the reach of one paw goes to the other paw (reach).
  xylophone: {
    hands: 'alternate',
    sizes: { lift: 0.09, rest: 0.03 },
    // The left mallet strikes 2 cm nearer to the player than the middle of the bar, and the right
    // mallet 2 cm farther, so that the heads keep apart on near bars. On the smaller bars, 3 cm
    // bends the left wrist 53° at the lowest bars, and 2 cm 49°.
    offsetL: [0, 0, 0.02],
    offsetR: [0, 0, -0.02],
    // The elbows point down, a little out, and back. With the homes out from the shoulders, the
    // median upper arm stands 28° (left) and 32° (right) out from the side of the body in the
    // play, and at most 63° and 58°. With the right elbow at [2, -1, 0.3], the right upper arm
    // stood up to 70° out. With the right elbow at [0.6, -1, 0.6], the right mallet missed a bar
    // by 4.5 mm.
    poleL: [-0.5, -1, 0.6],
    poleR: [1, -1, 0.3],
    rim: 0,
    // Each mallet points from a place 0.35 H out from its shoulder, so that the forearms stay out
    // of the leaning belly: 1.2 cm and 1.3 cm in the play and the lift (limit 1.5 cm). With the
    // homes 0.15 H out and the mallets of the old tilt, the left claws went 3.5 cm into the left
    // shoulder, and with the new tilt the forearms went 2.6 cm into the belly. With 0.3 H, the
    // forearms went 1.7 cm in.
    home: [0.35, -0.2, -0.75],
    // At the lowest and the highest bars, the target lies out past the home, so the mallet pointed
    // straight forward and 30° down, and the wrists came up to the height of the shoulders, with
    // the forearms 22° to 34° up. A real player keeps the forearms a little below level and the
    // hands low over the bars (percussion 9). The grip stays at most 0.25 H (7 cm) over its target
    // (gripRise): at the end bars, the forearms then slope 10° down to 3° up, the wrists stay 7 cm
    // to 10 cm below the shoulders, and the targets miss by at most 3.5 mm. With 0.2 H, a target
    // missed by 6.8 mm. The paws bend more on the forearms, and the arm gate counts more folded
    // faces at the wrists (L 35, R 24 in place of 22 and 15), which the 2x paw crops do not show.
    // A home moved out to the end bars (homeOut 0.45 H) kept the folds at 19 and 12, but it spread
    // the arms out to the sides as wings, 10 cm past the ends of the bars.
    gripRise: 0.25,
    homeOut: null,
    top: 'up',
    across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 6 },
    // Both heads keep one height between strikes, because the paws do not pass each other.
    pitchR: 1,
    ready: false,
    restPitch: 1,
    // At rest and in a long rest of the music, the mallets lie across the body in front of the
    // waist, side by side and facing opposite directions, as the sticks of the set position of a
    // drumline (percussion 6). No source gives the rest of a xylophonist. The left mallet turns
    // 7° up and the right mallet 7° down, so that they do not cross: the heads stay 6 cm apart in
    // height, and from the front, the two shafts slope the same way. With 6° and 13° up, the
    // shafts crossed in an X. With no set position, the hanging paws held the mallets up at
    // about 60°.
    set: { raise: 0.04104, rise: [0.12, -0.12] },
    pair: false,
    // A later strike on one bar or a near bar stays in one hand, so that a mallet does not strike
    // under the head of the other mallet, which rests over its bar. With 1 cm, the mallets touch
    // where a run goes over from one paw to the other.
    gap: 0.02,
    // A fast strike does not pass the last bar of the other paw: it takes a double stroke. With
    // low heads, a pass of one bar put one shaft on the head of the other mallet for 2.8 s of
    // the test score, and a lift of the passing head over the other head did not clear it.
    pass: 0,
    // A bar more than 1.7 H from the shoulder joint goes to the other paw. With 2.175 H, the right
    // mallet of the Tripo badger missed the highest bars by up to 12.5 cm.
    reach: 1.7,
    // The spine leans 17° over the bars, so that the paws reach the far bars from the homes out
    // from the shoulders: with 14°, the mallets missed them by up to 10 mm, and with 11° and the
    // old homes, by up to 2.6 cm.
    lean: 0.3,
    headUp: 0,
    // The short legs tilt far with a small move of the hips, and the foot skin then sinks into
    // the floor, so the hips keep their place, and the spine takes the whole move. A lean of 12°
    // moves the shoulders 5.5 cm toward the notes, so that both paws reach more bars of a run. At
    // 14°, the left paw bends 70° on the forearm, the limit of the arm gate.
    side: { span: 0.25, hips: 0, spine: 12 * MathUtils.DEG2RAD, moveSec: 0.6 },
    fit: null,
    damp: null,
    curl: [GRIP_CURL, GRIP_CURL],
    // A roll that removes the side bend at each strike turns the paws fast between the bars, so
    // the forearm lies in the plane of the palm.
    strikeRoll: false,
    // The paws keep the turn of the hands, so that the curled claws close on the mallets
    // (`XYLOPHONE.malletTilt`). With the turn of the retarget, the paw turned up to 70° from the
    // hand, and the paws grasped in no sample (`pnpm wind-grip xylophonist`).
    keepPaw: true,
  },
} as const satisfies Readonly<Record<PercussionInstrument, PercussionHold>>;

/**
 * The hold of a suspended cymbal (`SpeciesParams.cymbalForm`), in place of
 * `PERCUSSION_HOLDS.cymbals` (design 5.3). The yarn mallets leave the front of the fists
 * (`SUSPENDED_CYMBAL.malletTilt`), as the sticks of the snare drum, and the two hands strike in
 * turn near the edge, opposite each other: the left hand at the left and the right hand at the
 * right (`docs/reference/percussion-technique.md` 7). The offsets move the target, the middle of a
 * cymbal of the scale 1, to these spots, 1.3 cm in from the rim. The homes stand 0.45 H out from
 * the shoulders, a little further out than for the snare drum, so that the mallets point in to the
 * spots. The spine leans 3° over the cymbal (`lean`), as over the snare drum.
 * Between strikes, each mallet keeps its
 * strike direction, and the wrist holds the ball about 3.5 cm over its spot (`across.pitch`), as
 * the ready position of the snare drum. Before a strike, the wrist lifts the ball higher by the
 * loudness (`sizes.lift`, `across.peak`): about 6 cm for a soft note and 13 cm for a loud note.
 * With the rest direction across the forearm, the heads swing out past the rim. At rest, the
 * mallets lie across the body over the plate, as the snare sticks of the set position, with the
 * left mallet 7° up and the right mallet 7° down (`set.rise`), so that the shafts lie side by
 * side and do not cross: with 0° and 9° up, they crossed in an X. In a rest after a
 * note, the paw that did not strike takes its grip to the near rim, and the spine leans 9° more
 * (`damp`), so that the fingers touch the edge: with no lean, the arm stretched 0.12 of the upper
 * arm (main 0.04), and a grip at the rim point nearest to the shoulder joint twisted the arm in a
 * lift 64° (main 60°). The grip stands 3 cm out from the rim and 5 cm below it, and the wrist
 * lifts the head by 8 shares of the pitch, so that the closed paw rests on the edge and the
 * mallet points 28° up over the plate, as a real player stops the cymbal with the hand on the
 * edge: each ball near the plate stays at least 5.1 cm from the axis of the bell. With 10 shares,
 * the mallet pointed 40° up toward the chest, and with 7 shares, a ball came within 1.3 cm of the
 * axis. With the grip 4 cm out and 3 cm down and 3 shares, the paw stood over the rim.
 */
export const SUSPENDED_CYMBAL_HOLD: PercussionHold = {
  hands: 'alternate',
  sizes: { lift: 0.1, rest: 0.03 },
  offsetL: [-0.187, 0, 0],
  offsetR: [0.187, 0, 0],
  poleL: [-0.6, -1, 0.3],
  poleR: [0.6, -1, 0.3],
  rim: 0,
  home: [0.45, -0.3, -0.5],
  gripRise: null,
  homeOut: null,
  top: 'up',
  across: { rest: -0.6, lift: 0.3, pitch: 0.15, peak: 5 },
  pitchR: 1,
  ready: false,
  restPitch: 1,
  set: { raise: 0.246243, rise: [0.12, -0.12] },
  pair: false,
  gap: 0,
  pass: 0,
  reach: Infinity,
  lean: 0.05,
  headUp: 0,
  side: null,
  fit: null,
  damp: {
    kind: 'edge',
    restSec: 0.5,
    hold: 0.5,
    rim: 0.2,
    grip: [0.123121, -0.205202],
    around: -0.35,
    share: 8,
    lean: 0.16,
  },
  curl: [GRIP_CURL, GRIP_CURL],
  strikeRoll: true,
  // The paws keep the turn of the hands, so that the curled claws close on the mallets: with the
  // turn of the retarget, the paws grasped in 58% to 63% of the play samples.
  keepPaw: true,
};

/**
 * The motion of the hand cymbals (design 5.3), as a real crash
 * (`docs/reference/percussion-technique.md` 7). The plates tilt from vertical, so that the right
 * plate comes down onto the left plate. They meet a little offset, as a glancing blow, and slide on
 * past each other: the right plate down and the left plate up (`StrikeState.slide`). After a crash,
 * the plates part, turn their inner faces out to the front and up, and rise, so that the sound
 * rings to the hall. At the end of a note before a rest, they go against the chest
 * (`PercussionHold.damp`). A louder crash meets higher. The lengths are in head heights `H`.
 */
export const CRASH_MOTION = {
  /**
   * The tilt of both plates from vertical around the forward axis, in radians. With 30°, the
   * raised right plate went 3.4 cm into the right shoulder of the wolf (1.7 cm with no tilt).
   */
  tilt: 15 * MathUtils.DEG2RAD,
  /**
   * The angle of the flam, in radians: the right plate turns its top rim toward the left plate,
   * so that the plates are not parallel and the top rims meet first, as a glancing blow with the
   * air out between the plates (`docs/reference/percussion-technique.md` 7).
   */
  flam: 15 * MathUtils.DEG2RAD,
  /** The full slide of the right plate along its face, from the top of the lift to the rebound. */
  slide: 0.1,
  /** The share of the slide of the right plate that the left plate makes the other way. */
  leftShare: 0.5,
  /** The rise of the crash point from the softest to the loudest crash (`gestureSize()`). */
  raise: 0.15,
  /**
   * The turn of each inner face out to the front after a crash, in radians. Each plate also moves
   * out by the swing of its back rim, so that the back rims do not meet and the plates do not move
   * back toward the body, as a turn around the back rim moves them.
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
   * The clip of the triangle at the tip of the left thumb, from the left shoulder joint: a little
   * above the shoulder and out to the left, below the long snout of the Tripo badger. A real player
   * holds the triangle near the eye level, but the claws of the left paw in line with its forearm
   * ({@link trianglePaw}) go 5.8 cm into the snout with a clip 0.4 H higher, and 6.0 cm with a
   * clip 0.7 H higher.
   */
  triangleClip: [0.4, 0.1, -0.8],
  /**
   * The world rotation of the triangle from the bind pose of the paw that holds it: the turn of
   * the bind paw with the thumb down, so that the clip hangs from its tip, between the thumb and
   * the curled fingers (`TRIANGLE_PINCH` of `models/instruments/percussion.ts`), and the triangle
   * hangs in the plane x-y, turned 40° around the vertical. Thus the side of the triangle that the
   * beater strikes faces the right hand. The paw at the trap table takes this turn. The paw in the
   * play takes its own turn in line with its forearm ({@link trianglePaw}), and the triangle turns
   * back to this turn around the pinch (`PercussionSide.piece`).
   */
  // holdTurn(-90, 40) of pose/winds.ts.
  triangleTurn: [-0.664463, 0.241845, 0.241845, 0.664463],
  /**
   * The turn of the left paw that holds the triangle around its forearm, in radians, from the
   * hand in line with the forearm with no twist from the bind pose ({@link trianglePaw}): the
   * palm faces the clip (32° in `pnpm wind-grip percussionist`), and the paw twists 84° on its
   * forearm. With no turn, the palm faced away from the clip (146°), and the paw twisted 175°.
   */
  // SAFETY: the literal widens to a number, so that a hold tool can set it in memory.
  triangleTwist: 90 * MathUtils.DEG2RAD,
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
  const sin60 = Math.sin(60 * MathUtils.DEG2RAD);
  // The top corner hangs 0.05 m below the origin of the piece (`TRIANGLE_CLIP`).
  const top = new Vector3(0, -0.05, 0);
  const low = top.y - side * sin60;
  const corner = new Vector3(side / 2, low, 0);
  const leftCorner = new Vector3(-side / 2, low, 0);
  const { keys, fromCorner, touch } = TRIANGLE_ROLL;
  const point = (to: Vector3, inward: Vector3): Vec3 =>
    toVec3(
      corner
        .clone()
        .add(to.clone().sub(corner).setLength(fromCorner))
        .addScaledVector(inward, touch),
    );
  const intoRight = new Vector3(-sin60, -0.5, 0);
  return [
    [keys[0], point(leftCorner, Y_AXIS), toVec3(Y_AXIS)],
    [keys[1], point(top, intoRight), toVec3(intoRight)],
  ];
}

/**
 * The key of the target of the head of the tambourine in the left paw (`SwitchRig`). Key 1 is the
 * head of the tambourine on the trap table, and keys 2 and 3 are the roll targets of the triangle.
 */
export const HELD_TAMBOURINE_KEY = 4;

/**
 * The hold of the tambourine in the left paw and the strikes of the right paw on it (design 5.3),
 * as a real player holds the tambourine by its frame at or a little below the chest, tilted in,
 * and strikes it with the fingertips, the fingers, or the knuckles by the dynamic
 * (`docs/reference/percussion-technique.md` 8). The places are in head heights `H`.
 */
export const TAMBOURINE_HOLD = {
  /** The middle of the head of the held tambourine, from the left shoulder joint. */
  head: [0.7, -0.19, -1.23],
  /** The direction out of the head: up, toward the player, and toward the right paw. */
  face: [0.15, 0.9, 0.35],
  /** The direction on the head from its middle to the grip of the left paw on the frame. */
  grip: [-0.8, 0, 0.6],
  /**
   * The distance of the spot of a soft note from the middle of the head, toward the right paw,
   * in meters: the fingertips strike near the rim for pp to mp.
   */
  rimSpot: 0.07,
  /**
   * The distance of the spot of a louder note from the middle of the head, toward the right paw,
   * in meters: the fingers and the knuckles strike near the middle, as far in as the short right
   * arm reaches.
   */
  middleSpot: 0.035,
  /** A note below this loudness is soft: the fingertips strike near the rim. */
  soft: 0.4,
  /** A note above this loudness is loud: the knuckles of a loose fist strike the middle. */
  loud: 0.75,
  /** The curl of the right fingers for a soft, a middle, and a loud note, in radians. */
  curls: [0.3, 0.9, 1.5],
  /** The distance of the thumb roll from the middle of the head, in meters. */
  thumbRadius: 0.085,
  /** The arc of the thumb along the rim in a thumb roll, in radians. */
  thumbArc: 0.8,
  /**
   * The middle of the arc of a thumb roll, as a turn around the head from the direction to the
   * right paw, in radians: away from the belly.
   */
  thumbAt: 0.5,
  /** The turn of the left forearm to each side in a shake roll, in radians. */
  shake: 12 * MathUtils.DEG2RAD,
  /** The turns of a shake roll each second, as a fast turn of a door knob. */
  shakeRate: 7,
  /** A roll at or above this loudness is a shake roll, and a softer roll is a thumb roll. */
  shakeLoud: 0.5,
  /** The forward lean of the spine at the trap table, in radians. */
  tableLean: 0.15,
  /** The direction to which the right elbow points at the held tambourine. */
  poleR: [1.5, -0.5, 0.3],
  /**
   * The move of the right wrist forward in the middle of its move between the play place and the
   * trap table, in head heights `H`: the beater passes in front of the belly. On a straight line,
   * the beater went 4 cm into the belly.
   */
  beaterArc: 0.205202,
} as const;

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
      /**
       * The largest height of the grip over its target at a strike, in meters, or `null` for no
       * limit (`PercussionHold.gripRise`).
       */
      readonly gripRise: number | null;
      /**
       * The least distance of the home out from the target along x, in meters, or `null`
       * (`PercussionHold.homeOut`).
       */
      readonly homeOut: number | null;
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
      /**
       * The turn of the held piece in the hand from the bind pose: the local rotation of the
       * `malletL` bone around the pinch of the clip, so that the triangle keeps its hang while the
       * paw stays in line with its forearm ({@link trianglePaw}).
       */
      readonly piece: Quat;
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
   * The crash point of the hand cymbals at the damp against the chest (`PercussionHold.damp`), in
   * the model axes, or `null` for another hold.
   */
  readonly dampPlace: Vec3 | null;
  /**
   * The paw of each hand at a damp with the paw (`PalmDamp`, `EdgeDamp`), or `null` for a hand
   * with no such damp.
   */
  readonly dampHands: readonly [left: DampHand | null, right: DampHand | null];
  /** The held tambourine and the trap table of the small percussion player, or `null`. */
  readonly switch: SwitchRig | null;
}

/** A wrist and the world rotation of its hand from the bind pose. */
export interface PawPlace {
  readonly wrist: Vec3;
  readonly hand: Quat;
}

/**
 * The places of the paws of the small percussion player with the held tambourine and at the trap
 * table (design 5.3).
 */
export interface SwitchRig {
  /** The left paw that holds the tambourine by its frame. */
  readonly tambourine: PawPlace;
  /** The left paw at the places of the tambourine and of the triangle on the table. */
  readonly tableTambourine: PawPlace;
  readonly tableTriangle: PawPlace;
  /** The right paw at the place of the beater on the table. */
  readonly tableBeater: PawPlace;
  /** The middle of the head of the held tambourine, and the unit normal out of it. */
  readonly head: StrikeTarget;
  /** The unit direction on the head from its middle toward the right paw. */
  readonly toRight: Vec3;
  /**
   * The world rotation of the right hand that strikes the head: the palm faces the head, and the
   * fingers point forward and to the left, between the left side and the line from the right
   * shoulder, so that the wrist stays out of the belly and in the reach of the short arm.
   */
  readonly fingerHand: Quat;
  /** The tip of the middle claw of the right paw in the bind pose, from the bind wrist. */
  readonly tip: Vec3;
  /**
   * The bind of each studio paw (`studioForearmTurn()` of `models/studio-rig.ts`): the turn of a
   * paw at a switch mixes in the frame of the studio forearm.
   */
  readonly pawBinds: Readonly<Record<'L' | 'R', PawBind>>;
}

/**
 * The place of a paw at a damp: the wrist and the turn of the free paw (`PalmDamp`), or the grip
 * of a mallet (`EdgeDamp`, `FingersDamp`), whose paw keeps the turn of its hold.
 */
export type DampHand =
  | {
      readonly kind: 'palm';
      /** The wrist, in the model axes. */
      readonly wrist: Vec3;
      /** The world rotation of the hand from the bind pose. */
      readonly hand: Quat;
    }
  | {
      readonly kind: 'grip';
      /** The grip of the mallet, in the model axes. */
      readonly grip: Vec3;
      /** The share of the pitch of the mallet. */
      readonly share: number;
      /**
       * True: the paw moves to the grip and keeps the direction of the mallet at its target
       * (`FingersDamp`). False: the mallet points from its home to the grip (`EdgeDamp`).
       */
      readonly keep: boolean;
      /**
       * The height that the lowest point of the paw goes to at the damp, in meters, or `null` for
       * no fit: the paw lays its fingers on the head of a kettle (`FingersDamp`).
       */
      readonly touch: number | null;
      /**
       * The corners of the paw in the bind pose, from the bind wrist, three numbers for each, for
       * the lowest point of the paw (`touch`). Empty with no fit.
       */
      readonly paw: Float32Array;
      /**
       * The shortest time of the move of the paw to the grip and back, in seconds
       * (`DampWish.minInSec`), or 0 for the times of `DAMP_MOTION`.
       */
      readonly moveSec: number;
      /** The lift of the paw in the middle of its move, in meters (`FingersDamp.arc`). */
      readonly arc: number;
    };

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
  /** The crash point of the damp against the chest. */
  readonly chest: Vec3;
}

/**
 * Gives the two hands of a pair of hand cymbals, and sets the crash target (design 5.3): the rims
 * meet at the crash point, along the crash normal of the tilt of `CRASH_MOTION`. It also gives the
 * crash point of the damp against the chest (`PercussionHold.damp`): lower by the drop, and as far
 * forward as the room between the rims and the front of the trunk needs.
 *
 * @param model The player with the hand cymbals.
 * @param left The left arm.
 * @param right The right arm.
 * @param inH Gives a vector in head heights in meters.
 * @param targets Gets the crash target as key 0.
 * @returns The left and the right hand, and the crash point of the damp.
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
  const rim = (bone: 'malletL' | 'malletR') => {
    const target = findTarget(model, (t) => t.kind === 'plate' && t.bone === bone);
    const { point } = bindTarget(model, target);
    const to = bindTarget(model, target, target.to).point;
    return { point, radius: new Vector3(...point).distanceTo(new Vector3(...to)) };
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
  const damp = PERCUSSION_HOLDS.cymbals.damp;
  const radius = Math.max(rimL.radius, rimR.radius);
  const y = crash.y - damp.drop * model.body.headHeight;
  const front = frontmostTrunk(model, (k) => y - radius + (2 * radius * k) / FRONT_POINTS);
  const z = Number.isFinite(front) ? front - radius - damp.room * model.body.headHeight : crash.z;
  return {
    sides: [plate(left, rimL, -1), plate(right, rimR, 1)],
    chest: [crash.x, y, Math.max(z, crash.z)],
  };
}

/** The number of steps between the heights at which {@link frontmostTrunk} measures. */
const FRONT_POINTS = 16;

/**
 * Gives the most forward point of the front of the trunk on the middle line (`trunkFront()`), at
 * `FRONT_POINTS + 1` heights.
 *
 * @param model The player model.
 * @param height Gives the height of the step `k`, from 0 to `FRONT_POINTS`, in meters.
 * @returns The least z of the front, or `Infinity` where the trunk has no front.
 */
function frontmostTrunk(model: PlayerModel, height: (k: number) => number): number {
  let front = Infinity;
  for (let k = 0; k <= FRONT_POINTS; k++) {
    const z = trunkFront(model, 0, height(k));
    if (z !== null) {
      front = Math.min(front, z);
    }
  }
  return front;
}

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
    const front = frontmostTrunk(model, (k) => top + (k / FRONT_POINTS) * (high - top));
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
      gripRise: hold.gripRise === null ? null : hold.gripRise * h,
      homeOut: hold.homeOut === null ? null : hold.homeOut * h,
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
  let dampHands: readonly [DampHand | null, DampHand | null] = [null, null];
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
        const top = bindTarget(
          model,
          findTarget(model, (t) => t.kind === 'head'),
        );
        targets.set(0, top);
        sides = [mallet(left, 'malletL'), mallet(right, 'malletR')];
        if (hold.damp?.kind === 'edge') {
          dampHands = pawsOnRim(top.point, hold.damp, [left, right], h);
        }
      } else {
        const plates = pairOfPlates(model, left, right, inH, targets);
        sides = plates.sides;
        dampPlace = plates.chest;
      }
      break;
    case 'bass-drum': {
      const head = bindTarget(
        model,
        findTarget(model, (t) => t.kind === 'head'),
      );
      targets.set(0, head);
      sides = [{ kind: 'free', arm: left }, mallet(right, 'malletR')];
      if (hold.damp?.kind === 'palm') {
        dampHands = [palmOnFarHead(head, hold.damp, h), null];
      }
      break;
    }
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
      sides = [mallet(left, 'malletL'), mallet(right, 'malletR')];
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
      const hand = new Quaternion(...PERCUSSION_PLACES.triangleTurn);
      const bindWrist = new Vector3(...left.bind.wrist);
      // Gives a bind point of the triangle at its hang from the pinch of the clip, from the wrist
      // of the triangle turn.
      const held = (point: Vec3): Vector3 =>
        new Vector3(...point).sub(bindWrist).applyQuaternion(hand);
      // The paw in line with its forearm holds the pinch at the clip place.
      const paw = trianglePaw(left, clip, new Vector3(...clipBind), hold.poleL);
      const wrist = toVec3(clip.clone().sub(held(clipBind)));
      const pawWrist = toVec3(
        clip.clone().sub(new Vector3(...clipBind).sub(bindWrist).applyQuaternion(paw)),
      );
      const barTarget = findTarget(model, (t) => t.kind === 'bar');
      const bar = bindTarget(model, barTarget);
      targets.set(0, {
        point: toVec3(held(bar.point).add(new Vector3(...wrist))),
        normal: toVec3(new Vector3(...bar.normal).applyQuaternion(hand)),
      });
      // The tambourine on the table, which the tip of the beater strikes ({@link TABLE_PLACES}):
      // one inch or two in from its rim toward the right paw.
      const onTable = bindTarget(
        model,
        findTarget(model, (t) => t.kind === 'head' && t.bone === 'instrument'),
      );
      targets.set(1, offsetTarget(onTable, [TAMBOURINE_HOLD.rimSpot, 0, 0]));
      // A roll strikes the two sides of the closed lower corner from inside, in turn
      // (`TRIANGLE_ROLL.keys`). Each target lies on the inner face of its side, and lifts toward
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
        {
          kind: 'hold',
          arm: left,
          wrist: pawWrist,
          hand: toQuat(paw),
          piece: toQuat(paw.clone().invert().multiply(hand)),
        },
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
  // The paw that struck a kettle muffles it near the playing spot of the hand.
  if (hold.damp?.kind === 'fingers') {
    const { damp } = hold;
    const spot = (rest: StrikeTarget, offset: Vec3, side: PercussionSide): DampHand => {
      const { arm } = side;
      const target = offsetTarget(rest, offset);
      // The move toward the player at which the grip is the reach from the shoulder joint, at
      // most to the least distance from the near rim.
      const [x, , z] = target.point;
      const length = Math.hypot(x, z) || 1;
      const [sx, , sz] = arm.bind.shoulder;
      const ux = -x / length;
      const uz = -z / length;
      const dx = x - sx;
      const dz = z - sz;
      const b = dx * ux + dz * uz;
      const reach = damp.reach[arm.side === 'L' ? 0 : 1] * h;
      const c = dx * dx + dz * dz - reach * reach;
      const ahead = -b - Math.sqrt(Math.max(0, b * b - c));
      const move = MathUtils.clamp(c > 0 ? ahead : 0, 0, hold.rim - damp.rim);
      const point = towardPlayer(target, move).point;
      const grip = new Vector3(point[0], point[1] + damp.up * h, point[2]);
      // The grip at a strike lies the length of the mallet back from the target, on the line
      // from the home. The smooth step of the move is 1.5 times faster than its mean speed at its
      // middle.
      const struck = new Vector3(...target.point);
      if (side.kind === 'mallet') {
        const along = struck
          .clone()
          .sub(new Vector3(...side.home))
          .normalize();
        struck.addScaledVector(along, -side.length);
      }
      return {
        kind: 'grip',
        grip: toVec3(grip),
        share: damp.share,
        keep: true,
        touch: target.point[1] - damp.press * h,
        paw: pawCorners(model, arm),
        moveSec: (1.5 * grip.distanceTo(struck)) / damp.speed,
        arc: damp.arc * h,
      };
    };
    dampHands = [spot(restL, hold.offsetL, sides[0]), spot(restR, hold.offsetR, sides[1])];
  }
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
    dampHands,
    switch: instrument === 'small-percussion' ? switchRig(model, left, right, inH) : null,
  };
}

/**
 * Gives the place of a paw that puts a piece on the trap table: the piece keeps its place in the
 * paw, so the paw takes the turn of the place, and the wrist follows the origin of the piece.
 *
 * @param model The player model.
 * @param arm The arm.
 * @param bone The bone of the piece.
 * @param place The place of the piece on the table.
 * @returns The wrist and the turn of the hand.
 */
function tablePaw(
  model: PlayerModel,
  arm: ArmRig,
  bone: 'malletL' | 'malletR',
  place: TablePlace,
): PawPlace {
  const hand = new Quaternion(...place.hand);
  const origin = new Vector3(...(model.skeleton.positions[boneIndex(bone)] ?? arm.bind.wrist));
  const wrist = new Vector3(...place.at).sub(
    origin.sub(new Vector3(...arm.bind.wrist)).applyQuaternion(hand),
  );
  return { wrist: toVec3(wrist), hand: toQuat(hand) };
}

/**
 * Gives the rotation that turns two bind directions to two target directions: the first exactly,
 * and the second as near as the first permits.
 *
 * @param fromA The first bind direction.
 * @param fromB The second bind direction.
 * @param toA The first target direction.
 * @param toB The second target direction.
 * @returns The rotation.
 */
export function turnOfPair(fromA: Vector3, fromB: Vector3, toA: Vector3, toB: Vector3): Quaternion {
  const basis = (a: Vector3, b: Vector3): Matrix4 => {
    const x = a.clone().normalize();
    const y = b.clone().projectOnPlane(x).normalize();
    return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
  };
  const target = basis(toA, toB);
  return new Quaternion().setFromRotationMatrix(target.multiply(basis(fromA, fromB).transpose()));
}

/**
 * Finds the places of the paws of the small percussion player with the held tambourine and at the
 * trap table (`SwitchRig`, design 5.3).
 *
 * @param model The player model with the small percussion.
 * @param left The left arm.
 * @param right The right arm.
 * @param inH Gives a vector in head heights in meters.
 * @returns The places.
 */
function switchRig(
  model: PlayerModel,
  left: ArmRig,
  right: ArmRig,
  inH: (v: Vec3) => Vector3,
): SwitchRig {
  const t = TAMBOURINE_HOLD;
  const held = bindTarget(
    model,
    findTarget(model, (target) => target.kind === 'head' && target.bone === 'malletL'),
  );
  const middle = inH(t.head).add(new Vector3(...left.bind.shoulder));
  const face = new Vector3(...t.face).normalize();
  const toGrip = new Vector3(...t.grip).projectOnPlane(face).normalize();
  // In the bind pose, the grip of the left paw on the frame lies behind the middle of the head.
  const pinch = new Vector3(...(model.skeleton.positions[boneIndex('malletL')] ?? left.bind.wrist));
  const bindHead = new Vector3(...held.point);
  const hand = turnOfPair(new Vector3(...held.normal), pinch.sub(bindHead), face, toGrip);
  const wrist = middle
    .clone()
    .sub(bindHead.sub(new Vector3(...left.bind.wrist)).applyQuaternion(hand));
  const toRight = new Vector3(...right.bind.shoulder).sub(middle).projectOnPlane(face).normalize();
  const fingersTo = new Vector3(-1, 0, 0).sub(toRight).projectOnPlane(face).normalize();
  // The tip of the middle claw: the lowest corner of the fingers of the right paw in the bind pose.
  const { positions, bones } = model.mesh;
  const fingers = boneIndex('fingersR');
  let tip = new Vector3(...right.bind.wrist);
  for (let c = 0; c < bones.length; c++) {
    const y = positions[c * 3 + 1] ?? Infinity;
    if (bones[c] === fingers && y < tip.y) {
      tip = new Vector3(positions[c * 3] ?? 0, y, positions[c * 3 + 2] ?? 0);
    }
  }
  return {
    tambourine: { wrist: toVec3(wrist), hand: toQuat(hand) },
    tableTambourine: tablePaw(model, left, 'malletL', TABLE_PLACES.tambourine),
    tableTriangle: tablePaw(model, left, 'malletL', TABLE_PLACES.triangle),
    tableBeater: tablePaw(model, right, 'malletR', TABLE_PLACES.beater),
    head: { point: toVec3(middle), normal: toVec3(face) },
    toRight: toVec3(toRight),
    fingerHand: toQuat(pawTurn('R', face.clone().negate(), fingersTo)),
    tip: toVec3(tip.sub(new Vector3(...right.bind.wrist))),
    pawBinds: { L: pawBindOf(model.studio.arms.L), R: pawBindOf(model.studio.arms.R) },
  };
}

/**
 * Gives the axes of a drum head that stands on its side (design 5.3): the normal, up, and the line
 * along the head toward the player. The player faces -z.
 *
 * @param normal The unit normal of the head.
 * @returns The three unit axes.
 */
function headAxes(normal: Vec3): readonly [normal: Vector3, up: Vector3, toward: Vector3] {
  const n = new Vector3(...normal);
  const toward = new Vector3().crossVectors(n, Y_AXIS).normalize();
  if (toward.z < 0) {
    toward.negate();
  }
  return [n, Y_AXIS.clone(), toward];
}

/**
 * Gives the wrist and the world rotation of the free paw on the far head of the bass drum at a
 * damp (`PalmDamp`, design 5.3). The palm faces the head, and the fingers point along the head away
 * from the player and down. In the bind pose, the palm of the left paw faces +x, the fingers point
 * down, and the thumb points forward.
 *
 * @param near The target on the near head, the head of the beater.
 * @param rule The rule of the damp.
 * @param h The head height `H` of the body, in meters: the unit of `rule.wrist`.
 * @returns The wrist and the rotation of the hand from the bind pose.
 */
function palmOnFarHead(near: StrikeTarget, rule: PalmDamp, h: number): DampHand {
  const [n, up, toward] = headAxes(near.normal);
  const middle = new Vector3(...near.point).addScaledVector(n, -BASS_DRUM.depth);
  const wrist = middle
    .addScaledVector(n, -rule.wrist[0] * h)
    .addScaledVector(up, rule.wrist[1] * h)
    .addScaledVector(toward, rule.wrist[2] * h);
  const fingers = toward
    .clone()
    .multiplyScalar(-Math.cos(rule.fingers))
    .addScaledVector(up, -Math.sin(rule.fingers));
  const hand = new Quaternion()
    .setFromAxisAngle(Y_AXIS, -rule.yaw)
    .multiply(pawTurn('L', n, fingers));
  return { kind: 'palm', wrist: toVec3(wrist), hand: toQuat(hand) };
}

/**
 * Gives the grip of the mallet of each hand at a damp of the suspended cymbal (`EdgeDamp`, design
 * 5.3): near the rim point nearest to the shoulder joint of the hand.
 *
 * @param middle The middle of the top of the cymbal.
 * @param rule The rule of the damp.
 * @param arms The left and the right arm.
 * @param h The head height `H` of the body, in meters: the unit of `rule.grip`.
 * @returns The paw of the left and of the right hand.
 */
function pawsOnRim(
  middle: Vec3,
  rule: EdgeDamp,
  arms: readonly [ArmRig, ArmRig],
  h: number,
): readonly [DampHand, DampHand] {
  const paw = (arm: ArmRig): DampHand => {
    const center = new Vector3(...middle);
    const out = new Vector3(...arm.bind.shoulder)
      .sub(center)
      .setY(0)
      .normalize()
      .applyAxisAngle(Y_AXIS, (arm.side === 'L' ? 1 : -1) * rule.around);
    const grip = center
      .addScaledVector(out, rule.rim + rule.grip[0] * h)
      .add(new Vector3(0, rule.grip[1] * h, 0));
    return {
      kind: 'grip',
      grip: toVec3(grip),
      share: rule.share,
      keep: false,
      touch: null,
      paw: new Float32Array(),
      moveSec: 0,
      arc: 0,
    };
  };
  return [paw(arms[0]), paw(arms[1])];
}

/**
 * Gives the corners of the hand bone of an arm in the bind pose, from the bind wrist, with no two
 * equal corners (`DampHand.paw`).
 *
 * @param model The player model.
 * @param arm The arm.
 * @returns Three numbers for each corner.
 */
function pawCorners(model: PlayerModel, arm: ArmRig): Float32Array {
  const { positions, bones } = model.mesh;
  const hand = boneIndex(arm.side === 'L' ? 'handL' : 'handR');
  const [wx, wy, wz] = arm.bind.wrist;
  const seen = new Set<string>();
  const out: number[] = [];
  for (let c = 0; c < bones.length; c++) {
    if (bones[c] !== hand) {
      continue;
    }
    const x = positions[c * 3] ?? 0;
    const y = positions[c * 3 + 1] ?? 0;
    const z = positions[c * 3 + 2] ?? 0;
    const key = `${x} ${y} ${z}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(x - wx, y - wy, z - wz);
    }
  }
  return Float32Array.from(out);
}

/**
 * Gives the turn of a paw from the bind pose to a palm and a finger direction. In the bind pose,
 * the palm of each paw faces in, the fingers point down, and the thumb points forward.
 *
 * @param side The side of the paw.
 * @param palm The unit direction out of the palm.
 * @param fingers The unit direction of the fingers, normal to the palm.
 * @returns The world rotation of the hand from the bind pose.
 */
function pawTurn(side: 'L' | 'R', palm: Vector3, fingers: Vector3): Quaternion {
  const sign = side === 'L' ? 1 : -1;
  const thumb = new Vector3().crossVectors(palm, fingers).multiplyScalar(sign);
  const target = new Matrix4().makeBasis(palm, fingers, thumb);
  const bind = new Matrix4().makeBasis(
    new Vector3(sign, 0, 0),
    new Vector3(0, -1, 0),
    new Vector3(0, 0, -1),
  );
  return new Quaternion().setFromRotationMatrix(target.multiply(bind.transpose()));
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

/**
 * Gives the world rotation of the left paw that holds the clip of the triangle (design 5.3): the
 * hand in line with its forearm, as a real player holds the clip at the end of the raised
 * forearm, turned around the forearm by `PERCUSSION_PLACES.triangleTwist`. The wrist follows the
 * hand, so that the pinch of the thumb stays at the clip place, and the forearm follows the wrist,
 * so the function solves the arm a few times.
 *
 * @param arm The left arm.
 * @param clip The clip place, in the model axes.
 * @param pinch The pinch of the clip in the bind pose: the origin of the `malletL` bone.
 * @param pole The direction to which the elbow points.
 * @returns The world rotation of the hand from the bind pose.
 */
function trianglePaw(arm: ArmRig, clip: Vector3, pinch: Vector3, pole: Vec3): Quaternion {
  const shoulder = new Vector3(...arm.bind.shoulder);
  const elbow = new Vector3(...arm.bind.elbow);
  const bindWrist = new Vector3(...arm.bind.wrist);
  const upper = elbow.distanceTo(shoulder);
  const lower = bindWrist.distanceTo(elbow);
  const bindFore = bindWrist.clone().sub(elbow).normalize();
  const toPinch = pinch.clone().sub(bindWrist);
  const poleAt = new Vector3(...pole);
  const hand = new Quaternion(...PERCUSSION_PLACES.triangleTurn);
  const twist = new Quaternion();
  for (let pass = 0; pass < 4; pass++) {
    const wrist = clip.clone().sub(toPinch.clone().applyQuaternion(hand));
    const joints = solveTwoBone(shoulder, wrist, upper, lower, poleAt);
    const fore = joints.wrist.clone().sub(joints.elbow).normalize();
    hand
      .setFromUnitVectors(bindFore, fore)
      .premultiply(twist.setFromAxisAngle(fore, PERCUSSION_PLACES.triangleTwist));
  }
  return hand;
}
