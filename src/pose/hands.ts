import { MathUtils, Quaternion, Vector3 } from 'three';

import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { harpStringPosition } from '../models/instruments/harp.ts';
import { placePoint } from '../models/instruments/hold.ts';
import type { PlacedPiece } from '../models/instruments/hold.ts';
import { pianoKeyFront } from '../models/instruments/piano.ts';
import { IDENTITY, toVec3 } from '../models/tuples.ts';
import type { Quat, Vec3 } from '../models/tuples.ts';
import type { Steps } from '../score/steps.ts';
import type { PlayerNote } from '../score/types.ts';
import { Z_AXIS } from './axes.ts';
import { mixPole, mixRotation } from './blend.ts';
import type { InstrumentOf } from './family.ts';
import { createFrame, posePoint, setBoneRotation, setFromBasis } from './frames.ts';
import type { TorsoFrames } from './frames.ts';
import {
  HAND_MOTION,
  buildHandTrack,
  createHandState,
  handStateAt,
  splitHands,
} from './hand-notes.ts';
import type {
  HandAction,
  HandNote,
  HandReach,
  HandState,
  HandTrack,
  HandTurns,
} from './hand-notes.ts';
import { ARM_REACH, armRig, limitReach, poseShoulder, writeArm, writeCurl } from './ik.ts';
import { lapHand } from './lap.ts';
import type { LapHand } from './lap.ts';
import type { ArmRig } from './ik.ts';
import { pedalFoot } from './pedal.ts';
import { clamp01 } from './rest.ts';
import type { PedalFoot } from './pedal.ts';
import { buildDigitTrack } from './piano-digits.ts';
import type { DigitTrack } from './piano-digits.ts';
import { POLAR_BEAR_PAW, clawOffset, planFingeringSteps } from './piano-fingering.ts';
import type { PianoFingering } from './piano-fingering.ts';
import { harpFeet } from './harp-feet.ts';
import type { HarpFeet } from './harp-feet.ts';
import { HARP_FINGERING, planHarpFingerings } from './harp-fingering.ts';
import type { HarpFingering } from './harp-fingering.ts';

/** The instruments that the two hands play on keys or strings: the piano and the harp. */
export type HandsInstrument = InstrumentOf<'keyboard' | 'harp'>;

/**
 * The values of the hold of the piano and the harp (design 5.3). The directions are in the model
 * axes of the bind pose: the player faces -z, and its left is -x.
 */
interface HandsHold {
  readonly action: HandAction;
  /**
   * Gives the point of a key on the instrument, in the axes of the instrument piece, for the scale
   * of the instrument of the species (`SpeciesParams.harpScale`). The piano ignores the scale.
   */
  readonly keyPoint: (key: number, scale: number) => Vec3;
  /**
   * The palm of each hand is this far from the point of its key, in head heights `H`, in the
   * instrument axes. The offset follows the paw, so a larger body keeps its hold.
   */
  readonly palmL: Vec3;
  readonly palmR: Vec3;
  /**
   * The move of each palm for its highest keys, in the axes of the instrument piece, or `null`
   * for none. The move grows from 0 at the key `from` to the full `offset` at the key `to`, by the
   * middle of the keys of the note.
   */
  readonly highL: HighPalm | null;
  readonly highR: HighPalm | null;
  /**
   * The side of the palm of each hand: down to the keys of the piano, and to the strings of the
   * harp. In the axes of the instrument piece.
   */
  readonly faceL: Vec3;
  readonly faceR: Vec3;
  /**
   * The direction to which the fingers of each hand point, in the axes of the instrument piece, or
   * `null` for the line from the shoulder to the palm. The fingers lie in the plane of the palm,
   * so the part of the direction along the side of the palm drops out.
   */
  readonly aimL: Vec3 | null;
  readonly aimR: Vec3 | null;
  /** The forward lean of the spine in the playing pose. */
  readonly lean: number;
  /**
   * The forward lean of the spine in the rest pose. The pose mixes it with {@link HandsHold.lean}
   * by the weight of the playing pose.
   */
  readonly restLean: number;
  /**
   * The lift of the head in the rest pose, in radians: the neck and the head pitch up by it. The
   * pose mixes it with no lift by the weight of the playing pose.
   */
  readonly restHeadLift: number;
  /**
   * The side lean of the spine toward the keys of the hands in the playing pose, in radians for
   * each meter of the mean side offset of the two palms from the middle of the body, or 0 for
   * none. A real pianist leans toward the far keys.
   */
  readonly sideLean: number;
  /** The largest side lean, in radians. */
  readonly sideLeanMax: number;
  /**
   * The drop of each shoulder bone in the playing pose, in radians: the shoulders stay low, as
   * the shoulders of a real pianist.
   */
  readonly shoulderDrop: number;
  /** The keys that each hand reaches on the side of the other hand. */
  readonly reach: HandReach;
  /** The widest chord of one hand, in semitones (`splitHands()`). */
  readonly span: number;
  /** The most keys of a chord of one hand (`splitHands()`). */
  readonly most: number;
  /**
   * The least distance between the middles of the keys of the two hands, in semitones (12
   * semitones are 7 white keys), or 0 for no limit. The other hand moves out of the way of a hand
   * that comes nearer (`splitHands()`).
   */
  readonly apart: number;
  /** The directions to which the elbows point. */
  readonly poleL: Vec3;
  readonly poleR: Vec3;
  /** The curl of the fingers on the keys or the strings, and after a pluck. */
  readonly curl: number;
  readonly curlClosed: number;
  /**
   * The bend of the thumb of a fist after its pluck, in radians: digit 1 of `AnimalPose.digits`
   * (`poseThumb()` of `models/studio-rig.ts`). 0 for a hold whose thumb does not close alone.
   */
  readonly thumbClosed: number;
  /**
   * The move of each wrist away from the straight line from its rest place to its playing place,
   * at the middle of the change, in head heights: out to the side of the hand, up, and forward. A
   * paw of the round studio polar bear goes up over the front of the keys.
   */
  readonly restArc: Vec3;
  /** The left hand in the rest pose, in the lap (design 5.3). */
  readonly restL: RestingHand;
  /** The right hand in the rest pose, in the lap. */
  readonly restR: RestingHand;
}

/** A hand in the rest pose, in its lap (design 5.3). */
type RestingHand = LapHand & {
  /** The direction to which the elbow points, out to the side of the body. */
  readonly pole: Vec3;
};

/** The move of a palm for its highest keys ({@link HandsHold.highL}). */
interface HighPalm {
  /** The key at which the move starts. */
  readonly from: number;
  /** The key at which the move is full. */
  readonly to: number;
  /** The full move, in head heights `H`, in the axes of the instrument piece. */
  readonly offset: Vec3;
}

/** The holds of the piano and the harp. */
export const HANDS_HOLDS = {
  // The paw of the studio polar bear is longer than a white key, so the palm is 0.039 m (0.092 H)
  // in front of the front edge of the keys (`pianoKeyFront()`), and the curled claws lie on the
  // key tops. The left palm is 0.0572 m (0.135 H) above the keys and the right palm 0.0657 m
  // (0.155 H), because the two paws of the mesh differ. The offsets are in H, so they grow with
  // the paw. In meters, they are 1.3 times the offsets of the bear at a shoulder height of 1.15 m,
  // and the claws go at most 1 mm into the case in the play (`pnpm pose-depth pianist`).
  // The pose follows a professional pianist (`docs/reference/piano-technique.md`): the trunk leans
  // a little from the hips, less than the 20° of a posture that is not neutral, the elbows stand
  // out from the trunk, and the shoulders stay low (`shoulderDrop`). The polar bear sits tall on a
  // bench that fits its legs, and the keys stand on a lifted piano (`PIANO_LIFT`), so the lean of
  // 6° and the shoulder turn of 4° put its shoulders about 0.32 m above the keys and bend the
  // elbows 97° to 103° in the chord of the close views (`pnpm pose-preview pianist`). The lean of
  // 15° and the shoulder turn of 16° put the trunk over the knees, as if the bear stood up, with
  // the shoulders 6 cm lower and the elbows bent 69° to 74°. Keys 0.05 m or 0.1 m further away
  // (`PIANO_FRONT_H` 1.05 or 1.1) bend the elbows less (114° at 1.1), but with the upright trunk
  // only 89% or 72% of the note targets of `bach-bwv1050` are within 5 mm. A lean of 7° at 1.05 or
  // 8° at 1.1 brings them to 96% or 92% (`pnpm pose-depth pianist`). The bent elbows fold the right
  // inner elbow of the hand rig: 11 faces in the play (p95) with shoulder turns of 0° to 4° and the
  // keys at 1.0, 10 at 1.05, and 7 at 1.1 with a turn of 2° (limit 8). A lean of 8° folds 9 faces
  // of the left elbow and 13 of the right (`pnpm arm-check pianist`). Elbows that point further out
  // twist the paws more in the lift (`pnpm arm-check pianist`). The trunk leans toward the keys of
  // the two paws (`sideLean`), as a pianist leans toward the far keys. A lean up to 16° raises the
  // far right forearm 12° to the paw. The elbows point out, a little down, and a little back, clear
  // of the round trunk, as the elbows of a pianist do not touch the trunk. On the lifted piano,
  // elbows that point 0.15 up hold the elbows 17 cm above the keys and slope the forearms 18° to
  // 23° down to the keys. Elbows that point 0.3 down lower the elbows to about 10 cm above the
  // keys, and the forearms slope 4° to 10° (`pnpm pose-preview pianist`). The arms then go 6.3 cm
  // (forearms) and 7.4 cm (upper arms) into the trunk in the play, with 0.2 down 5.7 cm and 7.0 cm,
  // and with 0.5 down 7.3 cm and 7.9 cm (`pnpm pose-depth pianist`). With the trunk upright and the
  // elbows down, the upper arm twist p95 falls from 45° to 39° and the paw swing p95 from 57° to
  // 40° or less (`pnpm arm-check pianist`). Elbows that point further back put the arms deeper into the trunk.
  // The paws reach from A0 to F4 with the left paw and from E♭4 to C8 with the right paw
  // (`pose/hands.test.ts`), so a melody changes paws between them. A paw that crosses to the middle
  // of the keys puts its elbow in front of the chest: with the reach to B♭4 and from C4, the arms
  // go 10.6 cm (forearms) and 9.5 cm (upper arms) into the trunk in the play, and with this reach
  // 10.0 cm and 8.5 cm (`pnpm pose-depth pianist`). The wrists go up and forward over the case
  // between the lap and the keys (`restArc`): with the paws in the lap, the arc 0.1 H forward puts
  // the paws of the T-pose polar bear 2.6 cm into its body when they lower, and 0.25 H 0.8 cm or
  // less. With the rest paws 0.8 H in front of the lap, the arc 0.25 H forward puts the forearms
  // 1.6 cm into the case front in the lowering, and 0.15 H 1.1 cm. With the paws in the lap, an arc
  // of 0.5 H out stands the upper arms 61° out from the trunk in the lift. With no arc out, they
  // stand out at most as far as in a play. On the low bench, an arc 0.4 H up twists the paws up to
  // 42° on the forearms in the lift, and 0.2 H up 28°. With the paws on the belly of the hand rig,
  // arcs of 0 to 0.3 H out, up, or forward give the same depths in the lift and the lowering (`pnpm
  // pose-depth pianist`). On the lifted piano, the case front stands above the rest paws: the arc
  // 0.2 H up and 0.15 H forward puts the paws 3.1 cm into the case in the lift and 3.5 cm in the
  // lowering, 0.35 H up and 0.05 H forward 0.4 cm and 2.1 cm, and 0.5 H up and 0.1 H forward 0.4 cm
  // and 0.8 cm (`pnpm pose-depth pianist`). The higher arc folds up to 8 faces of the left arm in
  // the lift (p95, 6 before, `pnpm arm-check pianist`).
  piano: {
    action: 'strike',
    keyPoint: pianoKeyFront,
    palmL: [0, 0.13529, 0.092244],
    palmR: [0, 0.155395, 0.092244],
    highL: null,
    highR: null,
    faceL: [0, -1, 0],
    faceR: [0, -1, 0],
    aimL: null,
    aimR: null,
    lean: 6 * MathUtils.DEG2RAD,
    restLean: 8 * MathUtils.DEG2RAD,
    restHeadLift: 8 * MathUtils.DEG2RAD,
    // The trunk leans 80° for each meter of the mean side offset of the palms, and at most 18°, as
    // a pianist leans toward the far keys. In the hold of 3 s after a stop at the outermost key,
    // the breath turns the chest about 2°, so the arm of the Tripo polar bear goes further into the
    // belly than in the play. With 60° and 10° at most, the forearm went 5.8 cm and the upper arm
    // 6.2 cm in (main 2.4 cm and 2.1 cm), and with 80° and 18° 4.0 cm and 3.9 cm (Bach BWV 1050,
    // `pnpm pose-depth pianist`). Elbows 0.1 up in place of the side lean give 4.1 cm and 4.5 cm,
    // and they fold 10 faces of each arm in the play (p95, limit 8, `pnpm arm-check pianist`).
    sideLean: 80 * MathUtils.DEG2RAD,
    sideLeanMax: 18 * MathUtils.DEG2RAD,
    shoulderDrop: 4 * MathUtils.DEG2RAD,
    reach: { leftHighest: 65, rightLowest: 63 },
    span: HAND_MOTION.span,
    most: Infinity,
    // The wide paws of the polar bear point in along the forearms, so they go up to 4.7 cm into
    // each other when the palms are nearer than 33 cm, 24 semitones in the middle of the keys.
    // At 24 semitones, they go at most 0.2 cm into each other in the demos, and at 22 up to 1.1 cm.
    // At 25 and more, the right paw turns more than 15° further from its accepted grip
    // (`pnpm arm-check pianist`).
    apart: 24,
    // The elbows point out, a little back, and 0.15 down. With the elbows 0.3 down, the right arm
    // of the Tripo polar bear goes 6.2 cm (forearm) and 7.5 cm (upper arm) into the belly in the
    // play, 0.15 down 5.3 cm and 6.8 cm, and level 4.5 cm and 5.8 cm (`pnpm pose-depth pianist`).
    // Level elbows fold 9 faces (p95) of each arm in the play, and 0.15 down 8 and 6 (`pnpm
    // arm-check pianist`).
    poleL: [-1, -0.15, 0.2],
    poleR: [1, -0.15, 0.2],
    curl: 30 * MathUtils.DEG2RAD,
    curlClosed: 30 * MathUtils.DEG2RAD,
    thumbClosed: 0,
    restArc: [0, 0.5, 0.1],
    // The rest pose is the rest position of a pianist before a performance: the trunk sits tall
    // with a slight lean toward the piano, the head is up, and the hands rest in the lap
    // (`docs/reference/piano-technique.md`, section 8). The head lifts against the rest lean
    // (`restHeadLift`), so the gaze is level and the face shows over the lid. The round belly of
    // the polar bear covers its thighs to the knees, and the thigh tops lie out of the reach of the
    // arms (0.66 m to the palm). So the paws rest on the front of the belly, at its widest, with
    // the palms back and down on it and the fingers in toward each other, as a hand rests on a
    // round belly. The vertical line through the lap place finds the top of the belly near the knee
    // (`along` 0.85, about 1.0 m high), and the paws lie 0.42 H in front of it and a little lower.
    // With the thighs 25° down, the knee stands 4 cm further forward than with the thighs 40° down,
    // and the line through the knee (`along` 1) finds the belly lower: the forearms go 9.5 cm into
    // the belly at rest, and with `along` 0.85 1.4 cm (`pnpm pose-depth pianist`). `along` 0.85
    // puts the wrists 0.43 m below the shoulders, as `along` 1 did with the thighs 40° down. On the
    // shorter lines of `along` 0.45 to 0.7, the right line meets the top of the chest and the left
    // line misses the leg, so the old paws stood in the air beside the face and near the knee. With
    // the palms down, the forearms go 4.7 cm into the belly at rest, and with the palms back 1.1
    // cm, the upper arms none (`pnpm pose-depth pianist`). Paws 0.35 H in front of the belly top
    // put the forearms 3.3 cm into it, and paws 0.6 H in front stand over the front edge of the
    // keys, in the air. The rest elbows point out and a little back: elbows that point out, 0.3
    // down, and 0.4 back put the forearms 3.5 cm and the upper arms 0.4 cm into the belly. At rest,
    // the right shoulder folds no face (13 before), and the left paw swings 57° from the straight
    // paw of the source (73° before, `pnpm arm-check pianist`, limit 70°). The right paw turns in the
    // plane of its palm only toward a baton (`palmTurnAngle()` of `models/studio-rig.ts`), so its
    // rest fingers take the turn that the left paw gets there: they point down and back, 70° from
    // the mirror of the left fingers in the plane of the palm. With the mirror, the right paw of the
    // Tripo polar bear swings 65° from its bind and folds 17 faces of the inner wrist at rest, and
    // with the turn 36° and 8 faces (`pnpm arm-check pianist`). The belly of the Tripo polar bear
    // does not cover its thighs, so the vertical line through the lap place finds the top of the
    // thigh, 0.77 m below the shoulders. Its arms are 0.54 m long, so with the old offset (0.05 H
    // down, 0.42 H forward) the arms were straight and went 12 cm into the belly. The offset 0.4 H
    // out, 0.5 H up, and 0.2 H forward lets the arms hang at the sides of the belly, with the paws
    // beside the thighs, as the arms of a pianist hang at the sides before a performance. The
    // forearms go 0 cm and the upper arms 2.5 cm into the belly at rest, and the twist p95 at rest
    // is 42° (`pnpm pose-depth pianist`, `pnpm arm-check pianist`). With the offset 1.0 H up and
    // 0.45 H forward, the paws lay on the front of the belly, 0.30 m to 0.33 m below the
    // shoulders, and the side views showed them held at the chest. Offsets 0.5 H to 0.7 H up
    // nearer to the middle put the forearms 1.0 cm to 5.5 cm into the belly.
    restL: {
      lap: { along: 0.85, offset: [-0.4, 0.5, -0.2] },
      palm: [0.3, -0.6, 1],
      fingers: [1, -0.3, 0],
      pole: [-1, 0, 0.3],
    },
    restR: {
      lap: { along: 0.85, offset: [0.4, 0.5, -0.2] },
      palm: [-0.3, -0.6, 1],
      fingers: [-0.08, -0.84, -0.53],
      pole: [1, 0, 0.3],
    },
  },
  // The pose follows a harpist (`docs/reference/harp-technique.md`): the left hand plays the bass
  // strings from the left side and the right hand the treble strings from the right side, the
  // trunk sits erect, and the elbows rise out to the sides. The short arms of the deer set the
  // values. The measures below come from the deer of the old mesh, except where a sentence names
  // the Tripo fawn. The measures of the Tripo fawn come from the fit of the body and the harp at
  // 1/1.3 of their size (design 4.4). Both grew by 1.3. The palm offsets of this hold (`palmL`,
  // `palmR`, `highL`, `highR`) are in H, so they grew with the body: each offset and each depth in
  // meters is now 1.3 times the value of the fit that the comments give. The spine of the Tripo
  // fawn stays erect (`lean` 0): with a lean of 3°, its muzzle touched the neck of the harp
  // (`pnpm pose-depth harpist --gaps`), and erect, the gap is at least 2.3 cm. The pluck points
  // lie at 0.37 of each string (`PLUCK.share`), so the bass strings are plucked low. The left
  // palm lies 0.29 m above the pluck point, nearer to the shoulder, 19 cm left of the strings, and
  // 2.6 cm toward the player. On the harp of 0.975 in front of the chest, with the palm 16 cm left
  // of the strings and 0.30 m above, the left fingers went up to 1.3 cm through the strings, and
  // with this palm 0 cm. On the harp of the scale 0.85, with the palm 56° down, the fingers of
  // the left paw went up to 3.0 cm through the strings with the palm 14 cm left of them, 1.8 cm
  // with 16 cm (p95 0 cm), and 0.6 cm with 17 cm, where the left elbow bent to 74° (p5) against 76°
  // (`scratch/dh/evalc.ts` of the round 2026-11-13). With the palm 45° down and 9 cm left of the
  // strings, they went 6.1 cm through. On the old deer, the palm at 0.14 m above the pluck point
  // and 2 cm toward the column missed the bass strings C2 to A2 by up to 4.5 cm.
  // The left palm faces the strings and 56° down (`faceL`), as the wrists of a harpist go a
  // little down. On the harp of the scale 0.85, the paw swing p95 is 74° at 45° down, 70° at 50°,
  // 65° at 56°, and 59° at 63° (`pnpm arm-check harpist`, limit 70°), and at 63° the fingers go
  // 3.9 cm through the strings. The left shoulder lies 0.27 m from the plane of the strings, and
  // the left upper arm is 0.2 m long, so the left forearm points into the strings. With the palm square to the
  // strings, the left wrist bends back 58° to 60° in the rest, the lift, and the play, 88° from
  // the straight paw. With the palm 31° down, it bends back 26° to 31°, 58° from the straight
  // paw. With the group places of the fingering, the paw swing p95 is 57° at 45° down, 61° at
  // 39°, and 59° at 42° (`pnpm arm-check`). The right palm faces the strings, 27° down and 20°
  // back (`faceR`), as the wrists of a harpist go a little down. On the harp of 0.975, with the palm
  // 6° down, the right paw missed 1.3 % of its note targets by up to 8.5 mm. On the harp of 0.85
  // with the higher right elbow and the harp place of 2026-11-13, the right paw twists 48° on its
  // forearm at 14° down, 34° at 27° down, and 31° with the turn back (p95 of `pnpm hold-fit
  // harpist`). The turn back keeps the twist of the right forearm bone in the chord and the pluck
  // at 42° (62° with no turn back, 52° before the round). The right palm lies 6.9 cm above the
  // pluck point, 11.7 cm right of the strings, and 5.2 cm toward the player: on the harp of 0.975
  // in front of the chest, with the palm of the harp of 0.85 (10 cm above, 8.3 cm right), the right
  // elbow bent to 82° (p5, 180° is straight) against 96°. The top of the soundbox rests against
  // the chest, below the right shoulder, so the right elbow points out, up, and a little back
  // (`poleR`), and the right arm passes outside the top of the soundbox. With the elbow out and down
  // ([1, -1, 0]), the right upper arm went 1.7 cm into the soundbox in 17 % of the samples
  // (`scratch/dh/evalc.ts` of the round 2026-11-13). An elbow forward, at [0.5, -1, -1.5], twisted
  // the right paw of the old deer up to 74° on its forearm (`pnpm hold-fit harpist`). The left fingers point up and back
  // along the strings (`aimL`): with the fingers on
  // the line from the shoulder and the palm square to the strings, the left paw bends 86° to 91°
  // on its bent bind forearm. The elbows point out and down in the play: with the elbows down,
  // the left upper arm goes 6.3 cm into the chest when it reaches across to the strings. The left elbow points down and a little back (`poleL`): with the left
  // elbow at [-0.85, -1, 0] on the harp of the scale 0.85, the left paw went 4.4 cm into the body in
  // 31 % of the samples, and with this elbow 1.1 cm (`scratch/dh/evalc.ts`). With the elbow at
  // [-0.85, -1.5, 0.5], the left arm folded 7 faces (p95 of `pnpm arm-check harpist`), and with
  // this elbow 6.
  harp: {
    action: 'pluck',
    keyPoint: harpStringPosition,
    palmL: [-0.67, 1.01, 0.090569],
    palmR: [0.409, 0.24, 0.18],
    // The highest strings of the left hand lie near the chest of the Tripo fawn, and the palm 0.30 m
    // above their pluck points stands near the height of the shoulder. From C3 to D4, the left palm
    // moves up to 4 cm nearer to the strings, 6 cm down, and 6 cm toward the column. With the
    // harp place of 2026-11-13 and the move from F3 and 4 cm toward the column, the left paw went
    // 3.3 cm into the chest, and with this move 0.8 cm. The note targets do not change (`pnpm
    // hold-fit harpist`, `pnpm pose-depth harpist`).
    highL: { from: 48, to: 62, offset: [0.181139, -0.271708, -0.271708] },
    // The highest strings of the right hand lie near the right shoulder, at the neck of the harp.
    // From B3 to C7, the right palm moves up to 24 cm down the strings and 5.2 cm away from them,
    // as the right wrist of a harpist comes near the soundboard in the upper register (section 4).
    // On the harp of 0.975, with the move of 17 cm from G4, the right elbow bent to 74° (p5, 180°
    // is straight), and with this move to 96°. The note targets do not change
    // (`scratch/dh/evalc.ts` of the round 2026-11-13).
    highR: { from: 59, to: 96, offset: [0.1806, -0.85, 0] },
    faceL: [1, -1.5, 0],
    faceR: [-1, -0.55, 0.4],
    aimL: [0, 1, 0.5],
    aimR: null,
    lean: 0,
    restLean: 0,
    restHeadLift: 0,
    sideLean: 0,
    sideLeanMax: 0,
    shoulderDrop: 0,
    // The right hand reaches around the soundbox down to about G2, the lowest line of the bass
    // staff, and the left hand plays up to D4 (`docs/reference/harp-technique.md`, section 7.9).
    // The near harp of the short arms of the Tripo fawn puts the treble strings near its chest:
    // with the limit G4, the left paw went 6.2 cm into the chest, and with D4 2.6 cm. With no limit, the left hand played up to D6, where the left paw stands 0.22 m above
    // the short treble strings, at the neck. One hand reaches a tenth (16 semitones) and plays at
    // most four strings (section 7.4).
    reach: { leftHighest: 62, rightLowest: 43 },
    span: 16,
    most: HARP_FINGERING.fingers,
    apart: 0,
    poleL: [-0.85, -1.2, 0.3],
    poleR: [1, 1, 0.3],
    curl: 15 * MathUtils.DEG2RAD,
    curlClosed: 60 * MathUtils.DEG2RAD,
    // After its pluck, the thumb bends over finger 2 (`docs/reference/harp-technique.md`, section
    // 7.3). The thumb of the deer takes about three quarters of the bend, and near 90° the root of
    // the right thumb shows a thin crease, so the bend stays at 50°.
    thumbClosed: 50 * MathUtils.DEG2RAD,
    restArc: [0, 0, 0],
    // The arms hang at the sides, and each hoof touches the outer side of its thigh, as the arms
    // of a harpist hang loose at the sides in a rest (`docs/reference/harp-technique.md`, section
    // 5). The deep belly of the Tripo fawn covers the tops of its thighs, and the knees lie 0.57 m
    // from the shoulders, out of the reach of the arms. With the palms 0.48 H above the thigh and
    // 0.5 H forward, the hooves hung in the air in front of the belly with the wrists bent 26° to
    // 47°, and with the right elbow forward ([0.1, -1, -1.4]) the right paw twisted 82° on its
    // forearm at rest (`pnpm hold-fit harpist --sets rest,lift,lower`). With the palms at the
    // front of the thigh tops, the hooves went 4 to 7 cm into the belly. Now the palms lie 0.36 H
    // out from the thigh top at 0.4 of the way to the knee, 0.05 H up, and 0.1 H back. They face
    // in to the thighs and a little back, and the fingers point down. The elbows bend to 129° and
    // point back, and each wrist bends 11° from the line of its forearm. The hooves touch the
    // thighs: the left claws go 0.9 cm into the skin, and no arm goes into the harp, the strings,
    // or the body further than in the play (`scratch/hr/touch.ts`, `scratch/dh/evalc.ts` of the
    // round harp-rest). The paws twist 29° (left) and 13° (right) at rest. With the palms square
    // to the thighs, they twist 49° and 33°, and with the palms turned 0.5 back, the claws go 1.2 cm
    // into the thighs. The hanging right arm passes behind and outside the top of the soundbox.
    restL: {
      lap: { along: 0.4, offset: [-0.36, 0.05, 0.1] },
      palm: [1, 0, 0.4],
      fingers: [0, -1, -0.2],
      pole: [-0.5, 0, 1],
    },
    restR: {
      lap: { along: 0.4, offset: [0.36, 0.05, 0.1] },
      palm: [-1, 0, 0.4],
      fingers: [0, -1, -0.2],
      pole: [0.5, 0, 1],
    },
  },
} as const satisfies Readonly<Record<HandsInstrument, HandsHold>>;

const BONES = {
  instrument: boneIndex('instrument'),
  root: boneIndex('root'),
} as const;

/** One hand of a piano or harp player in the bind pose. */
interface HandSide {
  /** The arm of the side. */
  readonly arm: ArmRig;
  /** The side of the palm, in the model axes. */
  readonly face: Vec3;
  /**
   * The direction of the fingers, in the model axes, or `null` for the line from the shoulder to
   * the palm ({@link HandsHold.aimL}).
   */
  readonly aim: Vec3 | null;
  /** The hand in the rest pose, in its lap or on a string (design 5.3). */
  readonly rest: {
    /** The place of the `hand` bone, in the model axes. */
    readonly wrist: Vec3;
    /** The world rotation of the `hand` bone. */
    readonly rotation: Quat;
    /** The direction to which the elbow points. */
    readonly pole: Vec3;
    /**
     * The move of the wrist away from the straight line to the playing place, at the middle of the
     * change, in meters in the model axes ({@link HandsHold.restArc}).
     */
    readonly arc: Vec3;
  };
}

/** The points of a piano or harp player in the bind pose that the pose needs. */
export interface HandsRig {
  readonly hold: HandsHold;
  /** The head height `H` of the body, in meters: the unit of the palm offsets of the hold. */
  readonly headHeight: number;
  /** The scale of the instrument of the species (`instrumentScale()` of `models/species.ts`). */
  readonly scale: number;
  readonly chestBind: Vec3;
  /** The pieces of the instrument at their places in the bind pose. */
  readonly pieces: readonly PlacedPiece[];
  readonly left: HandSide;
  readonly right: HandSide;
  /** The right foot on the damper pedal of the piano, or `null` for the harp. */
  readonly foot: PedalFoot | null;
  /** The feet on the pedals of the harp, or `null` for the piano. */
  readonly feet: HarpFeet | null;
}

/**
 * Finds the points of a piano or harp player that the pose needs.
 *
 * @param model A player with a piano or a harp.
 * @param instrument The instrument of the model.
 * @param scale The scale of the instrument of the species of the player (`instrumentScale()` of
 *   `models/species.ts`).
 * @returns The rig.
 * @throws Error if the instrument does not stand on the floor.
 */
export function handsRig(model: PlayerModel, instrument: HandsInstrument, scale = 1): HandsRig {
  const { positions, parents } = model.skeleton;
  if (parents[BONES.instrument] !== BONES.root) {
    throw new Error(`The ${instrument} does not stand on the floor.`);
  }
  const hold = HANDS_HOLDS[instrument];
  const main = model.pieces.find((p) => p.piece.bone === 'instrument');
  const turn = new Quaternion(...(main?.at.rotation ?? IDENTITY));
  const faceOf = (face: Vec3): Vec3 =>
    toVec3(new Vector3(...face).applyQuaternion(turn).normalize());
  const side = (s: 'L' | 'R', face: Vec3, aim: Vec3 | null, rest: RestingHand): HandSide => {
    const arm = armRig(model, s);
    const turned = faceOf(face);
    const h = model.body.headHeight;
    const [out, up, forward] = hold.restArc;
    const arc: Vec3 = [(s === 'L' ? -out : out) * h, up * h, -forward * h];
    const resting = { ...lapHand(model, arm, rest), pole: rest.pole };
    return { arm, face: turned, aim: aim && faceOf(aim), rest: { ...resting, arc } };
  };

  return {
    hold,
    headHeight: model.body.headHeight,
    scale,
    chestBind: positions[boneIndex('chest')] ?? [0, 0, 0],
    pieces: model.pieces,
    left: side('L', hold.faceL, hold.aimL, hold.restL),
    right: side('R', hold.faceR, hold.aimR, hold.restR),
    foot: instrument === 'piano' ? pedalFoot(model) : null,
    feet: instrument === 'harp' ? harpFeet(model, scale) : null,
  };
}

/**
 * Gives the place of a palm for the keys of a note, in the model axes: the middle of its lowest
 * and its highest key, with the offset of the palm. A fingered note puts each claw over its key:
 * the palm stands at the mean of the keys minus the offsets of their claws (`clawOffset()`). The
 * shift of a note (`HandNote.shift`) does not move the palm off its claws: the fingering puts the
 * palm away from the other hand (`PIANO_FINGERING_COSTS.room`).
 *
 * @param rig The points of the player.
 * @param side The hand.
 * @param low The lowest key.
 * @param high The highest key.
 * @param fingered The place of the palm along the keys for the fingers of the note, in the axes
 *   of the instrument, or `null` for the middle of the keys.
 * @param depth The place of the palm in toward the keys for the note, in the axes of the
 *   instrument ({@link keyDepths}), or `null` for the middle of the keys.
 * @returns The place of the palm.
 */
function palmPoint(
  rig: HandsRig,
  side: 'L' | 'R',
  low: number,
  high: number,
  fingered: number | null = null,
  depth: number | null = null,
): Vec3 {
  const { keyPoint } = rig.hold;
  const offset = side === 'L' ? rig.hold.palmL : rig.hold.palmR;
  const middle = (a: number, b: number): Vector3 =>
    new Vector3(...keyPoint(a, rig.scale))
      .add(new Vector3(...keyPoint(b, rig.scale)))
      .multiplyScalar(0.5);
  const at = middle(low, high);
  if (fingered !== null) {
    at.x = fingered;
  }
  if (depth !== null) {
    at.z = depth;
  }
  at.addScaledVector(new Vector3(...offset), rig.headHeight);
  const highPalm = side === 'L' ? rig.hold.highL : rig.hold.highR;
  if (highPalm) {
    const share = clamp01(((low + high) / 2 - highPalm.from) / (highPalm.to - highPalm.from));
    at.addScaledVector(new Vector3(...highPalm.offset), share * rig.headHeight);
  }
  return placePoint(rig.pieces, { bone: 'instrument', at: toVec3(at) });
}

/**
 * Gives the place of the palm along the keys for the fingers of one note (design 5.3): the mean
 * of the key places minus the offsets of their claws, so that each claw stands over its key.
 *
 * @param rig The points of the player.
 * @param side The hand.
 * @param fingering The fingering of the hand.
 * @param index The index of the note.
 * @returns The place along the keys, in the axes of the instrument, or `null` for a note with no
 *   keys.
 */
function fingeredPalmX(
  rig: HandsRig,
  side: 'L' | 'R',
  fingering: PianoFingering,
  index: number,
): number | null {
  const from = fingering.first[index] ?? 0;
  const to = fingering.first[index + 1] ?? from;
  if (to <= from) {
    return null;
  }
  let sum = 0;
  for (let j = from; j < to; j++) {
    const key = fingering.keys[j] ?? 60;
    const finger = fingering.fingers[j] ?? 3;
    sum += rig.hold.keyPoint(key, rig.scale)[0] - clawOffset(finger, side, POLAR_BEAR_PAW);
  }
  return sum / (to - from);
}

/** The depth of the keys of a piano paw (design 5.3, {@link keyDepths}). */
const KEY_DEPTH = {
  /**
   * A piano paw plays the white keys of a note at the depth of a black key of the paw that starts
   * within this time before or after the note, in seconds.
   */
  holdSec: 0.3,
  /** Past {@link KEY_DEPTH.holdSec}, the paw moves out from a black key at most this fast, in m/s. */
  outSpeed: 0.3,
} as const;

/**
 * Gives the place of the palm in toward the keys for each note of a piano paw (design 5.3). The
 * paw plays the white keys near a black key further in, between the black keys: at the depth of
 * each black key of the paw that starts within {@link KEY_DEPTH.holdSec} of the note, and past that
 * time, it comes out at most {@link KEY_DEPTH.outSpeed} fast. Thus the paw stays at one depth for
 * a group of notes, as the hand of a pianist stays in one position for a group of notes
 * (`docs/reference/piano-technique.md` section 5). Reason: a paw that went in for each black key
 * and out for each white key shook 12 cm in and out at each note of a fast alternation of two
 * chords a semitone apart.
 *
 * @param rig The points of the player.
 * @param notes The notes of the hand, sorted by start.
 * @returns The place of the palm in toward the keys of each note, in the axes of the instrument,
 *   or `null` for a note with no keys and no near note with keys. A note with no keys, which only
 *   makes way for the other paw, takes the depth of the near notes.
 */
function keyDepths(rig: HandsRig, notes: readonly HandNote[]): (number | null)[] {
  const { holdSec, outSpeed } = KEY_DEPTH;
  const own = notes.map((note) =>
    note.keys.length === 0
      ? null
      : Math.min(...note.keys.map((key) => rig.hold.keyPoint(key, rig.scale)[2])),
  );
  const known = own.filter((depth) => depth !== null);
  // The depth of the white keys, and the time past which a note cannot move the depth of a note.
  const front = Math.max(...known);
  const most = holdSec + (front - Math.min(...known)) / outSpeed;
  const depthFrom = (start: number, j: number, depth: number): number => {
    const other = own[j] ?? null;
    const away = Math.max(0, Math.abs((notes[j]?.start ?? 0) - start) - holdSec);
    return other === null ? depth : Math.min(depth, other + outSpeed * away);
  };
  return notes.map((note, i) => {
    let depth = own[i] ?? Infinity;
    for (let j = i - 1; j >= 0 && note.start - (notes[j]?.start ?? 0) <= most; j--) {
      depth = depthFrom(note.start, j, depth);
    }
    for (let j = i + 1; j < notes.length && (notes[j]?.start ?? 0) - note.start <= most; j++) {
      depth = depthFrom(note.start, j, depth);
    }
    return Number.isFinite(depth) ? Math.min(depth, front) : null;
  });
}

/**
 * The turns of the wrist of a piano paw (design 5.3). The paw already turns up to about 40° on its
 * forearm in the play, so each turn stays small, and the wrist does not twist.
 */
const FINGER_MOTION = {
  /**
   * The roll of a paw at a thumb pass under the hand (+) or a finger over the thumb (-), in radians,
   * as the wrist of a pianist turns a little toward the thumb in the pass
   * (`docs/reference/piano-technique.md` section 9.3).
   */
  passRoll: 6 * MathUtils.DEG2RAD,
  /** The roll of a paw toward its little finger in a chord, in radians: the weight of the outer key. */
  chordRoll: -4 * MathUtils.DEG2RAD,
  /**
   * The largest turn of a paw in the plane of the palm toward the next key of an arpeggio, in
   * radians, as the hand of a pianist turns like a cartwheel (section 9.3).
   */
  arpeggioYaw: 8 * MathUtils.DEG2RAD,
  /** The paw turns toward a next note that starts within this time, in seconds. */
  yawGapSec: 0.3,
} as const;

/**
 * Calculates the turns of a piano paw at each note from its fingering (design 5.3): the roll of a
 * thumb pass and of a chord, the turn toward the next key of an arpeggio, and the claw of each
 * note, around which the paw turns.
 *
 * @param notes The notes of the hand.
 * @param fingering The fingering of the hand.
 * @param side The hand.
 * @returns The turns.
 */
function handTurns(
  notes: readonly HandNote[],
  fingering: PianoFingering,
  side: 'L' | 'R',
): HandTurns {
  const m = FINGER_MOTION;
  const rolls = new Float64Array(notes.length);
  const yaws = new Float64Array(notes.length);
  const pivots = new Float64Array(notes.length);
  for (const [i, note] of notes.entries()) {
    const from = fingering.first[i] ?? 0;
    const count = (fingering.first[i + 1] ?? from) - from;
    const pass = fingering.pass[i] ?? 0;
    rolls[i] = pass * m.passRoll + (count > 1 ? m.chordRoll : 0);
    if (count === 1) {
      pivots[i] = clawOffset(fingering.fingers[from] ?? 3, side, POLAR_BEAR_PAW);
    }
    // The paw turns toward the next key of a leap of three semitones or more, as in an arpeggio.
    const next = notes[i + 1];
    const key = note.keys[0];
    const nextKey = next?.keys[0];
    if (count === 1 && next?.keys.length === 1 && key !== undefined && nextKey !== undefined) {
      const step = nextKey - key;
      const share = MathUtils.clamp((Math.abs(step) - 2) / 3, 0, 1);
      yaws[i] = next.start - note.start < m.yawGapSec ? Math.sign(step) * share * m.arpeggioYaw : 0;
    }
  }
  return { rolls, yaws, pivots };
}

/** The note data of the two hands. */
interface HandTracks {
  readonly left: HandTrack;
  readonly right: HandTrack;
  /** The presses of the claws of each piano paw, or `null` for a harp player. */
  readonly digits: { readonly left: DigitTrack; readonly right: DigitTrack } | null;
}

/**
 * Calculates the note data of the two hands of a piano or harp player (design 5.3), in steps
 * (design 7.2). A piano hand plays the fingering of the lowest cost (`planFingeringSteps()`), and
 * its palm stands so that the claw of each key is over the key. A harp hand plays the fingering of
 * a harpist (`planHarpFingerings()`): its palm stands at the middle of the strings of each group,
 * so it moves once for each group.
 *
 * @param rig The points of the player.
 * @param notes The notes of the player, sorted by start.
 * @param loudness The loudness of each note, in the order of `notes`.
 * @param amplitude The seeded amplitude of the player.
 * @returns The steps, which return the note data of each hand.
 */
export function* handTracksSteps(
  rig: HandsRig,
  notes: readonly PlayerNote[],
  loudness: readonly number[],
  amplitude: number,
): Steps<HandTracks> {
  const { hold } = rig;
  const [left, right] = splitHands(notes, loudness, hold.reach, hold.apart, hold.span, hold.most);
  const [firstL, firstR] = HAND_MOTION.startKeys;
  const { action } = rig.hold;
  const piano = action === 'strike';
  const fingeringL = piano ? yield* planFingeringSteps(left, 'L', POLAR_BEAR_PAW) : null;
  const fingeringR = piano ? yield* planFingeringSteps(right, 'R', POLAR_BEAR_PAW) : null;
  const harp = piano ? null : planHarpFingerings(left, right);
  const track = (
    side: 'L' | 'R',
    hand: readonly HandNote[],
    fingering: PianoFingering | null,
    strings: HarpFingering | null,
    firstKey: number,
  ): HandTrack => {
    const depths = fingering ? keyDepths(rig, hand) : null;
    return buildHandTrack(
      hand,
      action,
      (l, h, i) => {
        // A harp hand stands at the middle of the strings of the group of the note.
        const group = strings && i >= 0 ? (strings.groups[i] ?? 0) : -1;
        if (strings && group >= 0) {
          return palmPoint(rig, side, strings.groupLow[group] ?? l, strings.groupHigh[group] ?? h);
        }
        return palmPoint(
          rig,
          side,
          l,
          h,
          fingering && i >= 0 ? fingeredPalmX(rig, side, fingering, i) : null,
          // The place before the first note stands at the depth of the first note.
          depths?.[Math.max(i, 0)] ?? null,
        );
      },
      amplitude,
      firstKey,
      fingering?.pass ?? null,
      fingering && handTurns(hand, fingering, side),
      strings,
    );
  };
  return {
    left: track('L', left, fingeringL, harp?.[0] ?? null, firstL),
    right: track('R', right, fingeringR, harp?.[1] ?? null, firstR),
    digits:
      fingeringL && fingeringR
        ? {
            left: buildDigitTrack(left, fingeringL),
            right: buildDigitTrack(right, fingeringR),
          }
        : null,
  };
}

/** The motion of the two hands at one time. */
export interface HandsState {
  readonly left: HandState;
  readonly right: HandState;
}

/**
 * The half width of the window of the side lean of a keyboard player, in seconds (design 5.3).
 * The trunk follows the mean place of the hands over this time before and after the song time,
 * so it moves smoothly toward the register of a passage and does not sway with each note. With no
 * window, the head of the polar bear swings 21 cm from side to side at up to 2.6 m/s in a fast
 * passage of `bach-bwv1050`, and with 0.3 s 14 cm at up to 0.5 m/s. A wider window lets the
 * trunk lag behind the paws, so the arms cross further into the belly: with 0.35 s, the upper
 * arms go deeper than with no window.
 */
const SIDE_LEAN_WINDOW = 0.3;

/** The number of samples of the window of the side lean on each side of the song time. */
const SIDE_LEAN_STEPS = 30;

/** The scratch hand of {@link sideLeanAt}. Each call writes it before it reads it. */
const sideHand = createHandState();

/**
 * Calculates the side lean of the spine toward the keys of the two hands (design 5.3): the mean
 * side offset of the two palms from the middle of the body, times the side lean of the hold, up to
 * its largest lean. The mean takes the palms of the hand tracks over {@link SIDE_LEAN_WINDOW}
 * before and after the song time, with a raised cosine weight, so the lean comes only from the
 * score and the song time. A positive lean goes to the left of the player (-x).
 *
 * @param rig The points of the player.
 * @param left The note data of the left hand.
 * @param right The note data of the right hand.
 * @param time The song time of the note layer.
 * @returns The lean around the z axis, in radians.
 */
export function sideLeanAt(rig: HandsRig, left: HandTrack, right: HandTrack, time: number): number {
  const { sideLean, sideLeanMax } = rig.hold;
  if (sideLean === 0) {
    return 0;
  }
  let sum = 0;
  let total = 0;
  for (let k = -SIDE_LEAN_STEPS; k <= SIDE_LEAN_STEPS; k++) {
    const t = time + (k / SIDE_LEAN_STEPS) * SIDE_LEAN_WINDOW;
    const weight = 0.5 + 0.5 * Math.cos((Math.PI * k) / (SIDE_LEAN_STEPS + 1));
    handStateAt(left, t, sideHand);
    let middle = sideHand.point[0];
    handStateAt(right, t, sideHand);
    middle = (middle + sideHand.point[0]) / 2;
    sum += weight * middle;
    total += weight;
  }
  return MathUtils.clamp((-sideLean * sum) / total, -sideLeanMax, sideLeanMax);
}

/**
 * The softness of the reach of the arms of a piano or harp player, as a part of the length of the
 * arm (design 4.7, `softLimit()`). Near the full reach, the palm comes to its limit on a curve, so
 * that the elbow does not snap straight in one frame.
 */
const REACH_SOFTNESS = 0.05;

const tip = new Vector3();
const lateral = new Vector3();
const pivot = new Vector3();
const yawTurn = new Quaternion();
const rollTurn = new Quaternion();

const shoulder = createFrame();
const face = new Vector3();
const palm = new Vector3();
const fingers = new Vector3();
const palmSide = new Vector3();
const turn = new Quaternion();
const shoulderTurn = new Quaternion();
const wrist = new Vector3();
const restWrist = new Vector3();
const restHand = new Quaternion();
const arcMove = new Vector3();
const ORIGIN = [0, 0, 0] as const;

/**
 * Turns a piano paw by the roll and the yaw of its hand state, around the claw of the note
 * (design 5.3): the paw turns in the plane of the palm (+ toward the high keys), then rolls
 * around the line of its claws (+ to the thumb side, down). The palm moves so that the claw stays
 * at its place.
 *
 * @param side The side of the body.
 * @param hand The state of the hand.
 * @param down The side of the palm, in the model axes.
 * @param back The direction from the claws to the wrist, in the plane of the palm.
 * @param palmAt The place of the palm, in the model axes. The call moves it.
 * @param rotation The world rotation of the hand. The call turns it.
 */
function turnPaw(
  side: 'L' | 'R',
  hand: HandState,
  down: Vector3,
  back: Vector3,
  palmAt: Vector3,
  rotation: Quaternion,
): void {
  // The claws point from the shoulder to the palm, and the claw row runs toward the high keys.
  tip.copy(back).negate();
  lateral.crossVectors(down, tip).normalize();
  yawTurn.setFromAxisAngle(down, hand.yaw);
  tip.applyQuaternion(yawTurn);
  // A roll about the claw line takes the side of +x down: the thumb side of the left paw.
  rollTurn.setFromAxisAngle(tip, side === 'L' ? hand.roll : -hand.roll).multiply(yawTurn);
  rotation.premultiply(rollTurn);
  pivot.copy(lateral).multiplyScalar(hand.pivot);
  palmAt.add(pivot).sub(pivot.applyQuaternion(rollTurn));
}

/**
 * The distance from the palm of a piano paw to its claw tips on the keys, in meters, along the
 * claws: the wrist kick turns the paw around the tips (`kickPaw()`), so the claws stay on their
 * keys.
 */
const KICK_PIVOT = 0.06;

const kickAxis = new Vector3();
const kickTips = new Vector3();
const kickTurn = new Quaternion();

/**
 * Drops the wrist of a piano paw by the kick of its hand state (design 5.3): the paw turns around
 * the line of its claw tips, so the wrist goes down and the claws stay on their keys.
 *
 * @param kick The drop, in radians: + down.
 * @param down The side of the palm, in the model axes.
 * @param back The direction from the claws to the wrist, in the plane of the palm.
 * @param palmAt The place of the palm, in the model axes. The call moves it.
 * @param rotation The world rotation of the hand. The call turns it.
 */
function kickPaw(
  kick: number,
  down: Vector3,
  back: Vector3,
  palmAt: Vector3,
  rotation: Quaternion,
): void {
  // A turn around back x down takes the back of the paw toward down.
  kickAxis.crossVectors(back, down).normalize();
  kickTurn.setFromAxisAngle(kickAxis, kick);
  rotation.premultiply(kickTurn);
  kickTips.copy(back).multiplyScalar(-KICK_PIVOT).add(palmAt);
  palmAt.sub(kickTips).applyQuaternion(kickTurn).add(kickTips);
}

/**
 * Writes one arm and its fingers on the keys or the strings.
 *
 * @param rig The points of the player.
 * @param side The side of the body.
 * @param hand The state of the hand.
 * @param pole The direction to which the elbow points.
 * @param frames The posed frames of the root and of the chest.
 * @param weight The eased weight of the playing pose.
 * @param rotations The rotations of the pose to write.
 */
function poseHand(
  rig: HandsRig,
  side: HandSide,
  hand: HandState,
  pole: Vec3,
  frames: TorsoFrames,
  weight: number,
  rotations: Float32Array,
): void {
  const { hold } = rig;
  const { chest, root } = frames;
  const { arm } = side;
  // The shoulder bone turns down around z: the left one toward -y from -x, the right one from +x.
  const drop = hold.shoulderDrop * weight * (arm.side === 'L' ? 1 : -1);
  shoulderTurn.setFromAxisAngle(Z_AXIS, drop);
  poseShoulder(arm, chest, rig.chestBind, shoulderTurn, shoulder);
  setBoneRotation(rotations, arm.bones.shoulder, shoulderTurn);
  face.fromArray(side.face);
  // The palm lifts against its face for a strike, and pulls back from it for a pluck.
  palm.fromArray(hand.point).addScaledVector(face, -(hand.lift + hand.pull));
  // The fingers point from the shoulder to the palm, or along the aim of the hold, in the plane of
  // the palm.
  if (side.aim) {
    fingers.fromArray(side.aim);
  } else {
    fingers.subVectors(palm, shoulder.position);
  }
  fingers.addScaledVector(face, -fingers.dot(face)).normalize().negate();
  // The bind palm side of a hand is +x on the left and -x on the right, to the body.
  palmSide.copy(face).multiplyScalar(arm.side === 'L' ? 1 : -1);
  setFromBasis(turn, palmSide, fingers);
  if (hand.roll !== 0 || hand.yaw !== 0) {
    turnPaw(arm.side, hand, face, fingers, palm, turn);
  }
  if (hand.kick !== 0) {
    kickPaw(hand.kick, face, fingers, palm, turn);
  }
  wrist.fromArray(arm.palm).applyQuaternion(turn);
  limitReach(
    arm,
    shoulder.position,
    wrist.subVectors(palm, wrist),
    (REACH_SOFTNESS * arm.reach) / ARM_REACH,
  );

  // In the rest pose, the hand rests in its lap, which does not move with the chest.
  posePoint(root, ORIGIN, side.rest.wrist, restWrist);
  restHand.fromArray(side.rest.rotation).premultiply(root.rotation);
  writeArm(
    {
      arm,
      shoulder,
      wrist: wrist.lerpVectors(restWrist, wrist, weight).add(
        arcMove
          .fromArray(side.rest.arc)
          .applyQuaternion(root.rotation)
          .multiplyScalar(4 * weight * (1 - weight)),
      ),
      hand: mixRotation(restHand, turn, weight, turn),
      // The elbow points out to the side in the rest pose.
      pole: mixPole(side.rest.pole, pole, weight),
    },
    chest.rotation,
    rotations,
  );
  // The flat palm of a damp opens the fingers.
  const curl = hold.curl + (hold.curlClosed - hold.curl) * hand.closed;
  writeCurl(arm, curl * (1 - hand.flat) * weight, rotations);
}

/**
 * Writes the arms and the fingers of a piano or harp player (design 5.3, 4.7). Each palm goes
 * to the place of its hand state, with the lift of a strike or the pull of a pluck, and the
 * two-bone IK places each arm. The palm faces the keys or the strings, and the fingers point
 * away from the shoulder. In the rest pose, the palms rest in the lap.
 *
 * The caller writes the lean of the hold into the spine before it calculates the frames.
 *
 * @param rig The points of the player.
 * @param frames The posed frames of the root and of the chest.
 * @param state The motion of the hands at the song time of the note layer.
 * @param weight The eased weight of the playing pose: 0 is the rest pose (5.2, 5.5).
 * @param rotations The rotations of the pose to write.
 */
export function poseHands(
  rig: HandsRig,
  frames: TorsoFrames,
  state: HandsState,
  weight: number,
  rotations: Float32Array,
): void {
  const { hold } = rig;
  poseHand(rig, rig.left, state.left, hold.poleL, frames, weight, rotations);
  poseHand(rig, rig.right, state.right, hold.poleR, frames, weight, rotations);
}
