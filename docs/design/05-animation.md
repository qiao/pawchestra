# 5. Animation

## Pose index

A role is a kind of player with a pose of its own: an instrument with the species of its section
(`SECTION_SPECIES` of `models/cast.ts`). A species with a hold of its own is a role of its own.
The code holds the values of each hold. These product rules apply to each pose:

- **Real players.** Each role pose and its motion follow a real musician. The technique
  references give the source of each fact, and their section "Use in the app" gives the rules of
  the app and where the app differs: [strings](../reference/string-technique.md),
  [winds](../reference/wind-technique.md), [percussion](../reference/percussion-technique.md),
  [harp](../reference/harp-technique.md), [piano](../reference/piano-technique.md), and
  [conductor](../reference/conductor-technique.md).
- **Bodies stay.** The app keeps the mesh of each animal with no stretch of a limb. When a short
  arm does not reach, the app prefers a smaller instrument, a nearer place, or a hold of its own
  to longer arms.
- **Natural balance.** A standing pose, and a seated pose with no chair, keep the center of mass
  over the soles. The monkey trumpeter has no chair.
- **Grasp.** Each paw wraps its instrument as a real player does: the finger tips are on the
  instrument, the palm faces the tube or the shaft, and the paw is on the side that the
  technique names.
- **Arms close to the body.** The arms hang close to the sides, the elbows stay near the trunk,
  and the players hold their instruments close, as in the reference images. An arm can touch the
  body up to `ARM_CONTACT_DEPTH` of `pose/test-arm-clearance.ts`, and it does not have to touch.
- **Contact of the instruments.** A held instrument can press the fur where a real player touches
  it, as the contrabass on the lower belly, and it goes no further in. A rested instrument or bow
  can touch the body, and it never crosses it.

The roles and their holds:

- **Conductor:** bear, `CONDUCTOR_HOLD` (5.4).
- **Strings** (`pose/bowed-rig.ts`, strings 3): violin rabbit `SHOULDER_HOLD`, violin red fox
  `FOX_HOLD`, viola cat `CAT_HOLD`, cello dog `DOG_HOLD`, contrabass hippo `HIPPO_HOLD`.
- **Winds** (`pose/winds.ts`, winds 4): flute tan fox `FOX_FLUTE`, oboe mouse `MOUSE_OBOE`,
  clarinet wolf `WOLF_CLARINET`, bassoon beaver `BEAVER_BASSOON`, horn pig `PIG_HORN`, trumpet
  monkey `MONKEY_TRUMPET`, trombone panda `PANDA_TROMBONE`, tuba rhino `RHINO_TUBA`.
- **Percussion** (`pose/percussion-rig.ts`, percussion 10): timpani elephant, and the badger with
  the bass drum, the snare drum, the suspended cymbal, the small percussion, and the xylophone
  (`PERCUSSION_HOLDS`, `SUSPENDED_CYMBAL_HOLD`).
- **Piano and harp** (`pose/hands.ts`, `HANDS_HOLDS`): piano polar bear (piano), harp deer
  (harp 6).
- **Choir:** penguin, `CHOIR_HOLD` (5.3).

`INSTRUMENT_SUPPORTS` and `supportOf()` of `models/player.ts` give the supports (4.5). The
pianist sits on a bench, and the harpist on a stool. The conductor, the contrabass, the trumpet,
the tuba (as on a strap), the percussion, and the choir stand. The oboe and the bassoon have no
chair and sit in the seated pose at the seat height of their legs. The others sit on a chair. The
violins, the viola, the flute, the oboe, the clarinet, the horn, and the trombone stand as a
soloist, a player alone, or the partner of a pianist (4.2). The generic holds
`BOWED_HOLDS.violin`, `BOWED_HOLDS.cello`, `WIND_HOLDS.flute`, and `WIND_HOLDS.trombone` are for a
new species of these sections. `pnpm close-views <role> <dir>` renders a role with the views of
`ROLE_VIEWS` (7.1). Each new role or hold adds its entry here.

## 5.1 Pose function

The pose of each animal is a **pure function**. `poseAt()` calculates each pose only from the
score, the scene layout, the song time, the wall time, the transport, the audibility of the seats,
and the seed. The app keeps no state that events change. Thus seek, pause, speed, mute, and solo
changes are always correct, and the animation cannot drift from the audio.

```typescript
/** The play state. It changes only on play, pause, stop, and a seek during play. */
interface Transport {
  playing: boolean;
  /** Wall clock seconds of the last change. `null` before the first play. */
  changedAtWall: number | null;
  /** The transport before the last change, or `null` for the rest pose (5.2). */
  before: Transport | null;
  /** The song time of the first sound of the last play: 0, or the pause point (6.5). */
  startSec: number;
  /** True when a seek during play set `startSec`: no count-in (5.4, 6.5). */
  seekStart: boolean;
  /** True for the pause at the song end: the conductor bows (5.4). */
  endedAtSong: boolean;
  /** The time that the instruments stay up after a pause (`REST_TIMES.hold`), or 0. */
  holdSec: number;
  /** The wall clock seconds from a play to its first sound. */
  leadSec: number;
}

/** The mute and solo result of one seat (6.6). */
interface SeatAudibility {
  audible: boolean;
  changedAtWall: number;
  before: SeatAudibility | null;
}

/** The pose of one animal for one frame. Optional fields add the paw turns and the keys. */
interface AnimalPose {
  /** One quaternion (x, y, z, w) for each bone, in the order of `BONE_NAMES` (4.7). */
  rotations: Float32Array;
  rootOffset: Vec3;
  /** The move of the `slide` bone: the trombone slide and the damper pedal (4.6). */
  slideOffset: Vec3;
  /** The move of the `instrument` bone, such as the violin at rest (5.2). */
  instrumentOffset?: Vec3;
  /** 0 is open eyes, 1 is closed eyes. */
  blink: number;
}

interface ScenePose {
  /** One entry for each player, in the order of `SceneLayout.players`. */
  players: AnimalPose[];
  /** `null` for a chamber group, which has no conductor (4.2). */
  conductor: AnimalPose | null;
}

/** The data of one `Score` that each frame needs. */
interface PosePlan {
  players: readonly PlayerPlan[];
  conductor: PlayerPlan | null;
  /** The player that leads a chamber group, or `null` with a conductor (5.4). */
  leader: number | null;
  /** The conducted beats and the beats of the felt pulse, in song seconds. */
  beats: Float64Array;
  pulses: Float64Array;
}

/** The places of the scene for one `Score` (4.5). */
interface SceneLayout {
  stageSide: number;
  podium: Vec3;
  /** The bear on the podium top, or `null` for a chamber group. */
  conductor: { position: Vec3; facing: number } | null;
  /** `facing` is radians around y, and 0 faces -z (the back). */
  players: readonly { position: Vec3; facing: number; cast: PlayerCast }[];
  stands: readonly StandPlace[];
  risers: readonly RiserLevel[];
}

declare function layoutScene(score: Score, models?: ModelCache): SceneLayout;
declare function preparePoses(score: Score, layout: SceneLayout, seed: number): PosePlan;
declare function poseAt(
  plan: PosePlan,
  songTime: number,
  wallTime: number,
  transport: Transport,
  /** One entry for each seat. A missing entry sounds. */
  audibility: readonly (SeatAudibility | undefined)[],
  out?: ScenePoseBuffer,
): ScenePose;
```

The app calls `layoutScene()` and `preparePoses()` one time for each `Score`. Each frame then only
looks up the song time in sorted lists and writes into one buffer, so 60 players fit in the frame
budget (9.7). `poseAt()` also solves the IK of 4.7. The app poses each demo with the seed 1, so a
demo shows the same motion on each visit.

| Layer | Clock | Motion |
|---|---|---|
| Note | song time | Bow strokes, fingers, breath, mallets, hands (5.3) |
| Beat | song time | A sway with the felt pulse, and the conductor (5.4) |
| Idle | wall clock time | Breath, eye blinks, ears, tail, looks at the conductor |

- **Motion families.** Each instrument has a family with its own note layer: `bowed`,
  `woodwind`, `brass`, `keyboard`, `harp`, `percussion`, `choir`, or `conductor`.
- **Beat layer.** In a passage, a player sways from side to side with the felt pulse
  (`beatSway()`). A real player sways with a slow level of the meter, so the pulse is the
  conducted beat (5.4) up to `PULSE_TEMPO`, the preferred tempo of a listener, and 2 or 4
  conducted beats above it (`markPulses()`). Each player has a seeded side, a seeded lag behind
  the pulse, and a seeded level of one or two pulses to each side (`PlayerPlan.sway`,
  `SWAY_VARIETY`), so that a section does not sway as one copy. The lag is a part of a pulse that
  `beatSway()` subtracts from the pulse phase, the count of pulses since the first pulse. A lag in
  seconds would step with the pulse length at each tempo change, and all players would jump to
  the side in one frame. The sway fades to 0 over the last pulse, so that it stops at the last
  pulse with no jump. The sway and the breath of a player are `BODY_MOTION.scale` times the base
  angles, because the base angles move the head of a player in the default view by about 2
  pixels. The cello, the contrabass, and the harp keep the base angles (`BASE_BODY_INSTRUMENTS`):
  a floor instrument does not lean with the body, and a larger sway put the right upper arm of
  the harpist deeper into the neck of the harp.
- **Section variety.** Each player has a seeded posture (`PlayerPlan.posture`, `POSTURE_VARIETY`):
  a head tilt, a head turn, a slouch of the spine, and an ear spread, so that the players of a
  section do not look like copies. A wind player that plays keeps the head on the mouthpiece, and
  the cello, the contrabass, and the harp take no slouch (`BASE_BODY_INSTRUMENTS`), because a
  slouch brings the head to the cello neck and the right upper arm into the neck of the harp. A
  hanging ear takes a part of the spread (`OVERLAP.hanging`).
- **Clips.** A clip of a person (4.4) gives a pose from the clip and the clip time alone
  (`clipPoseAt()`), so it keeps the rule of stateless poses. Only the gallery plays a clip now.
- **Idle layer.** The idle layer uses the wall clock, so the animals stay alive while the music
  stops. Its motions come at seeded times in windows of the wall clock, so they need no state
  (`IDLE_MOTION`). Hanging ears do not twitch, as a real hanging ear does not
  (`SpeciesParams.hangingEars`).
- **Planned looks.** A real player looks up at the conductor for a reason, so most looks come
  from the music (`planLooks()` of `pose/looks.ts`, `LOOK_PLAN`): before an entry after a rest of
  at least `restSec`, at each cue of the conductor to the seat of the player (`findCues()`, 5.4),
  and on the final chord (`findFinal()`). In a chamber group the target is the leader. The plan
  keeps two song times for each look (`PlayerPlan.looks`), so the look is a function of the song
  time. The idle look of the wall clock fills the time between the planned looks. A wind player
  that plays turns only a little of a planned look (`BODY_MOTION.peek`), so that the mouthpiece
  stays on the lips. Each look, planned or idle, starts with a blink that closes in
  `LOOK_BLINK.closeSec` and opens in `openSec`, as a real blink closes fast and opens slower. Each
  turn of a look passes its end by `LOOK_OVERSHOOT.size` and settles (`overshoot()`), as a real
  head passes the end of a fast turn a little.
- **Overlap.** The ears lag behind the head, and the tail behind the sway, as loose parts do
  (`OVERLAP` of `pose/pose-at.ts`). The drag is the change of the look and of the side sway in the
  last `lagSec`, from the closed forms of the look and the sway at the two times, so the pose
  keeps no state. Each drag has a limit, and a hanging ear takes a part of it, because the hanging
  ear of the dog lies near the cello.
- **Blink.** A blink rises from 0 to 1 and falls back in `blinkSec`. A bead eye scales on y by
  `max(CLOSED_EYE_SCALE, 1 - blink)` about its eye bone. A body with lids (4.4, "Hand rig") turns
  each eye bone about the hinge axis of its lid, through the middle of the eyeball, by the share
  of the way of a bead eye from open to closed, times the angle of the lids
  (`poseBodyBones()`). So the lid closes when a bead eye closes, at the same seeded times.

## 5.2 Rest pose

Before the first play, the players are in the rest pose, because a real orchestra lifts the
instruments only when the conductor signals the start. The players lift their instruments in the
count-in (5.4, 6.5), and lower them when the hold of `transport.holdSec` after a pause ends.

- **Natural motion.** Each player has its own seeded lift and lowering (`restMotion()`,
  `REST_MOTION` of `pose/rest.ts`). The principal of a seat moves first, and the others follow in
  a ripple, as real players watch their leader. The winds lift sooner, because they also breathe
  before the first note. The conductor gives the count-in, so its motion does not vary.
- **Calm lift.** A carried instrument (`carriesInstrument()`: the violin, the viola, the woodwinds,
  and the brass) goes from the lap to the jaw or to the lips. Its lift
  (`REST_MOTION.liftSec.carried`) has the same mean time as the lowering, because a real player
  brings the instrument up calmly and is ready a moment before the entry. The shorter lift of the
  other players (`liftSec.others`) moves only the paws and the bow. Reason: with the short lift,
  the violin of the rabbit went from the lap to the jaw in about 0.45 s after a long rest, and the
  move read as a snap. Each kind has its own fit (`RestMotion.fitSec`), so the lifts of the other
  players keep their times.

  ```typescript
  /** The timing of one move of the instruments: a lift or a lowering. */
  interface RestMove {
    delaySec: number; // wall clock seconds
    durationSec: number;
    skew: number; // the seeded skew of the curve, near 1
  }

  /** The seeded lift and lowering of one animal (`PlayerPlan.motion`). */
  interface RestMotion {
    lift: RestMove;
    lower: RestMove;
    fitSec: number; // the longest lift of its kind (carried or not), with its delay
  }
  ```

- **No jump.** A move starts from the height of each player at the change, from
  `transport.before` (`changeTransport()` of `app/transport.ts`).
- **Count-in.** The slowest lift ends before the downbeat. A shorter count-in scales the lifts of
  each kind by one factor (`liftScale()`), so the downbeat keeps its time. A carried lift in the
  shortest count-in still takes longer than the lift of the other players. A pause in the
  count-in lowers the instruments at once.
- **Long rests.** A wind or string player lowers its instruments in a long rest of its own part,
  as a real player does (winds 4, strings 3.2). The strings need a longer rest, because the carry
  of the violin is a larger move. The viola and the contrabass keep the playing pose
  (`LONG_REST.keepUp`), because their moves and the rest pose of the contrabass clip more. The
  percussion has its own set position, and the piano, the harp, and the choir keep the playing
  pose. `playerWeight()` multiplies a third height from the song time
  (`longRestHeight()` of `pose/long-rests.ts`), so a seek gives the same pose. A rest of at least
  `LONG_REST.minSec` of its family counts, also before the first note and after the last note.
  The instrument stays up for `LONG_REST.holdSec`, then goes down with the seeded lowering of the
  player and its ripple. The lift starts by the fit of the player (`RestMotion.fitSec`) before
  the entry, and less `LONG_REST.liftEndBeats`, so that it ends at least that time before the
  entry and no note sounds in the lift. The principal of a seat lifts first. A rest in which the
  lift would start before the lowering ends keeps the playing pose. The rest pose is the pose of a
  muted seat (5.5).
- **No wrist flip.** A paw does not turn past 180° on its forearm in a move, because the twist
  bone (`TWIST_SHARE` of `models/body-rig.ts`) then turns over in one frame. The arm gate checks
  each move (`probeMoves()` of `tools/arm-check.ts`). The carried left paw of a violin or a viola
  turns on the way on which its twist from the bind of the body stays between -180° and 180°
  (`bodyPawTwist()`). On a supinated bind paw, this way is a supination, as a real forearm turns.
  On a pronated bind paw, the playing grip lies past 180° in the supination, so the paw turns the
  other way, through the direction of no paw twist. Reason: the change of the hold cannot change
  the bind of the body, and the other way flips the paw on six recast bodies.
- **Steady bow roll.** In a move, the roll of the bow paw around the stick mixes from the roll of
  the rest pose to the roll of the play (`restRollOf()` of `pose/bowed.ts`). The rest roll comes
  from the rest arm, and not from the moving arm. Reason: the roll toward the elbow of the moving
  arm changes fast where the stick points near the elbow. The upright rest bow of the red fox
  points up to the elbow, and its paw rolled about 180° in the first fifth of each lift.
- **Bent elbows in the moves.** A hold of short arms keeps each elbow bent in the lift and the
  lowering (`BowedHold.moveReach`, `FreePaw.moveReach`, `keepMoveBend()` of
  `pose/round-arms.ts`). The wrist comes no further from the shoulder joint than this share of
  the arm length, with a soft limit that fades to the whole length at the rest and at the play.
  The paw keeps its turn, so the bow or the carried instrument follows it. The limit also holds
  the elbow of a run across two strings (`crossPole()`). Reason: the straight path of a short arm
  leaves the reach in the middle of a move, so the arm locks straight, and the elbow then folds in
  a few frames where the path comes back into the reach. On the red fox, the bow elbow and the
  carrying left elbow went straight in each move, and the free left flute paw of the tan fox
  folded its elbow in one frame. No source gives the arm path of the lift (strings 3.2).
- **Seated posture.** Each seated player sits tall off the chair back, with the hips above the
  knees, vertical shins, and the soles flat, as real seated string players sit: "The main point
  is that your hips are higher than your knees" (violinist.com, discussion 9372). The seat stays
  level, and its height fits the legs (`seatHeights()` of `models/props.ts`, 4.4). The polar bear
  sits on a bench that holds its whole haunch, with the thighs at most about 25° down (4.4, seat),
  as a pianist sits on the front half of the bench (piano 2).
- **Hanging arms.** A standing player with free hands hangs its arms (`HANG` of `pose/hang.ts`),
  with the palms at the height of the hips. The slim standing tan fox bends the free left elbow
  less (`FOX_HANG`), because the full bend points its forearm forward into the air. Its hanging
  left paw turns around its long axis (`FreePaw.hangRoll`), so that the palm faces the leg.
  Reason: the shortest turn of the bind paw down along the forearm twisted the paw 138° on its
  forearm. The free left arm of the bass drummer hangs with a smaller forward swing and a bend of
  about 20° (`FREE_HANG`), because the shoulder carries the lean of the spine over the drum.
  Reason: with `HANG`, its forearm stood level and forward, and the open paw stayed in the air.

The rest of each family:

- **Violin and viola.** A seated player rests as a seated violinist (strings 2.9): the instrument
  upright on the left thigh, the neck through the closed left paw, and the bow upright at the
  right side (`restHandAt()`, `UPRIGHT_BOW`). In a move, the instrument turns with the left paw as
  one rigid object (`carryLift()`), and the bow tip turns through the front (`BowVia`). Each value
  of the grip (the place on the neck, the curl, the tilt, the turn, and the gap) goes from the
  rest grip to the grip of the play (5.3, "Left paw on the neck"), so that the neck stays between
  the palm and the finger block on the way. Reason: with a mix of the two paw places, the paw
  went into the neck in the middle of the move. The
  instrument turns the short way from the rest to the play: the scroll stays up, and the body
  swings in and up to the jaw. The elbow in the middle of the move (`BowedHold.liftPoleL`) sets
  the way, because the paw supinates on the arm, and the frame of the arm turns with the elbow. An
  instrument can lead on a via (`BowedHold.carryVia`): it turns near a middle turn, and the paw
  follows it by its grip. No hold has a via. The cat rests and lifts its viola as the red fox
  rests and lifts its violin: the top plate to the front, the left elbow out and back, and the paw
  turned on the neck (`BowedHold.restYawL`). The paw carries the upright instrument out and
  forward, and it tips onto the shoulder at the end of the lift. Reason: with the paw in front of
  the chest and the top plate to the left, the supination swung the scroll in toward the chest and
  around through the front, and a via that kept the scroll up rolled the whole upper arm a full
  turn. `pnpm carry-check` gives the detour of each move from the short arc. A
  standing player hangs the bow with the tip down (`HANGING_BOW`). In the shared violin hold and
  the hold of the rabbit, the arms at rest hang out to the sides until they clear the body, with a forward swing and an elbow
  bend of each arm (`BowedHold.restArms`, `hangingArm()`). The left paw holds the upright violin at
  its hanging wrist, and the right paw the upright bow. Reason: a rest place on the thigh puts the
  upper arms of the recast bodies into the trunk, and the bind elbow keeps the bind overlap of the
  arm root. On the new rabbit body, the lap places at the knees made both arms reach nearly
  straight forward. The rabbit holds its violin upright on the lap with the left elbow near the
  side. Its right paw rests at the top of the right thigh near the hip, with the elbow bent near
  the side, and holds the bow at the frog with the tip up, out, and forward
  (`RABBIT_HOLD.restArms`, `restBow`). In a move, its bow tip turns to the left through the
  front, below the chin (`restBow.via`). Reason: a seated violinist rests the bow pointing up,
  with a fist around the frog (strings 2.9). A tip only a little out stood in front of the cheek,
  a tip that turned up through the front crossed the right eye in the front view, and a tip out
  to the right stood in front of the left cheek near the play. The paw grips the stick across the palm, so the stick rises from the thumb
  side of the closed paw, and a tip down twists the forearm. The hair of the rest bow faces the
  front and in, so that the bow turns little from the rest to the move and the paw does not flip. The cat stands the viola on the top of the left thigh, leaned a little forward, and
  holds its neck in front of the chest with the elbow bent near the side (`CAT_HOLD.rest`,
  `restPoleL`), as a seated violinist does. Its top plate faces the front and to the left, so that
  the viola turns near the short arc in a move. Reason: at the outer side of the thigh, the viola
  hung from the paw beside the hip, with its lower end below the top of the thigh, and the left
  arm went straight to the front in the middle of each move. The rest grip of a carried instrument lies in the reach of the left arm, because
  the instrument hangs from the solved paw from the first frame of a move: a grip out of reach
  makes the instrument jump into the paw. Thus the red fox stands the violin on the top of the
  thigh at about half of the way to the knee, and
  rests the bow upright beside the right thigh at the reach of its short arm. Its rest grip also
  lies well inside the reach, with the elbow bent and a little out from the side and the forearm
  about level. The paw holds the neck from the outer side, with the palm to the neck and the
  wrist nearly straight, and the top plate turns a little to the right, so that the paw twists
  less on its forearm (`FOX_HOLD.rest`, `restPoleL`, `restYawL`, `restPawTurnL`). Reason: a
  violinist keeps the back of the left hand in line with the elbow (strings 1.9). With the grip at
  the end of the reach, the arm locked straight down to the neck, and the paw bent about 60° off
  the forearm over the neck. Its bow tip turns to the left below the snout in a move
  (`FOX_HOLD.restBow.via`), so that the bow does not cross the snout. The grip also moves out and to the front in the move, and
  the elbows keep a bend ("Bent elbows in the moves"). The bow tip of the cat turns to the left
  below the chin in a move (`CAT_HOLD.restBow.via`). Reason: with the tip forward and up, the
  stick stood in front of the left cheek and the left eye near the play. A hold can lift the head at rest
  (`BowedHold.restHeadLift`). The cat keeps the head lift of its play at rest. Reason: from the
  height of the stage camera, the brow of the cat hid the top of each eye, and the face read as
  angry.
- **Cello and contrabass.** The instrument stays at its playing place. The dog holds the bow over
  the right knee with the tip up, as a cellist does. Its grip lies low and out, and both elbows
  point out, so that the round upper arms stay off the chest (5.3, "Free round arms"). The hippo
  hangs the right arm at the side of the belly, with the bow tip down and a little forward, and
  with the grip out from the knee, so that the arm hangs off the round belly
  (`HIPPO_HOLD.restBow`). Its left paw holds the neck (`restPlace`) with the elbow out to the
  side, as in the play. Reason: with the arm far out to the side, the hippo read as stiff, and a
  rest elbow far from the play elbow twists the left forearm in the moves. With the grip near the
  side, the arm lay flat on the belly with a crease at the shoulder. In a move, the bow tip of
  the cello turns from up to the left, above the strings (`LAP_CELLO_BOW.via`), and the bow tip
  of the hippo turns from down to the left and the front (`HIPPO_HOLD.restBow.via`). Reason: with
  the via of the upright violin bow, the tip turned to the front and then down in front of the
  cello before it came to the strings.
- **Winds.** The head lifts, and the instrument moves off the mouth. Both paws keep their grips
  (`restAim`), so no paw slides along the tube. A real player can rest the instrument on a leg,
  but the mouse stands with no lap, and the round bellies of the beaver and the pig cover their
  thighs. So these instruments stay in front of the belly. The pig lowers the horn in front of
  its belly, with the bell beside the right thigh and the mouthpiece below the chin
  (`HORN_REST_TURN`), as a hornist rests the horn on the lap with the bell to the right (winds
  2.2). The tuba of the rhino stands upright in front of its round belly in the play, and stays
  on its body at rest: its top turns forward about its bottom bow, and it moves a little back and
  down, so that each paw keeps its grip (`RHINO_TUBA`). Reason: with a move down and forward,
  the tuba hung in the air. The beaver lowers the bassoon across its belly, flatter
  than in the play, with the reed to the left below the chin (`BEAVER_BASSOON`). Reason: its short
  arms reach no lower rest with both paws on the bassoon, and with the right paw alone on the
  bassoon upright at its side, the bassoon went through the head in the lift and into the right
  thigh in the lowering. The wolf sets the clarinet bell on the front of its
  right knee, with the right paw on the upper joint (`restGripShiftR`), as a seated clarinetist
  rests the bell on the knee (winds 3). A shared hold with rest arms
  (`WindHold.restArms`, `armRest()` of `pose/winds.ts`) rests from the hanging arms of the body:
  the right paw holds the flute or the clarinet nearly upright at its side, at the hanging palm,
  as a flutist rests the flute vertically on the right leg (winds 2.4), and the free left paw
  hangs with the roll of its grip (`freeRoll()`). Reason: a rest place in `H` from the mouth fits
  one body only, and with both paws on the clarinet at the middle of the hanging palms, the arms
  went into the body. The seated tan fox holds the flute upright at its right side in the right
  paw, and rests the free left paw on the top of the left haunch near the hip (`FOX_FLUTE`). Each
  rest place of a free paw lies in the reach of its arm. Reason: the top of the thigh is out of
  reach of the short arm, and with a place out of reach, the arm stayed straight in the lift until
  the paw came into reach, and then the elbow folded in a few frames. The free left paw of the fox
  hangs in line with its forearm, turned about its long axis to the turn at which its skin is
  nearest to its bind (`restFreeL.palm`, `fingers`). Reason: the left paw turn of the fox chain
  fits the violin, so a paw that faced the body bent at the wrist and twisted on its forearm.
  A free paw is relaxed and half open at rest (`WIND_BODY.curlOpen`), and it closes to its grip
  curl by the square of the weight of the playing pose (`freeCurlOf()`). Reason: with the grip
  curl at each weight, the empty paw was a fist with no tube in it.
  The panda holds the trombone upright in front of the body, below the mouth,
  with the slide down and a little forward (`PANDA_TROMBONE`), as a seated player holds the slide
  vertical in front of the knee (winds 1.7). Both paws keep the grip of the play on the instrument
  (`restAim`), and the left paw slides down its tubes (`restGripShiftL`). Reason: with a rest grip
  of its own, the right hand turned about 180° from the rest to the play, and each mix of the move
  turned the right paw past 180° on its forearm. The elbows point out and down.
  The monkey trumpeter rests from its hanging arms with square shoulders (`MONKEY_TRUMPET`): the
  trumpet hangs from the right paw in front of the right thigh with its bell down, and the left
  paw leaves the valves and hangs beside the body, as a player holds the trumpet in one hand
  between two entrances. Reason: with both paws on the trumpet in front of the belly, the upper
  arms stood out to the side and the forearms crossed the chest, and with both paws at the
  hanging arms, the elbows went into the belly.
- **Piano and harp.** The polar bear sits tall with a small lean to the piano and the head up, as
  a pianist before a performance (`restLean`). The paws rest on the front of the belly with the
  palms back, because the belly covers the thighs and the thighs lie out of the reach of the arms.
  The right paw turns in the plane of its palm only toward a baton, so its rest fingers take the
  turn that the left paw gets: else the right wrist bends far from its bind and folds. On the
  Tripo polar bear, the belly does not cover the thighs, so its arms hang at the sides of the
  belly with the paws beside the thighs, as the arms of a pianist hang before a performance. Paws
  on the front of the belly looked held at the chest, and paws nearer to the middle put the arms
  into the belly.
  The deer sits up with the arms hanging at its sides, the elbows a little bent and pointing back,
  and each hoof on the outer side of its thigh (`restL`, `restR`), as the arms of a harpist hang
  loose at the sides (harp 5). The wrists stay near straight, and the palms face the thighs.
  Reason: the deep belly covers the tops of the thighs, and the knees lie out of the reach of the
  arms. With the hooves on the front of the belly, they hung in the air in front of it with bent
  wrists. With the right elbow forward in front of the soundbox, the right paw twisted far on
  its forearm. The hanging right arm passes behind and outside the top of the soundbox.
- **Percussion.** A ready player keeps its mallets over the instrument (`PercussionHold.ready`),
  because a lift from hanging arms sweeps them through the body or the kettles. At rest, the
  timpanist lays the felt balls on the heads (`PercussionHold.restPitch`). No source gives the
  rest of a timpanist. The snare sticks rest level across the waist, as a
  snare drummer between entries (`PercussionHold.set`). The mallets of the suspended cymbal and of
  the xylophone rest in the same way, side by side: the two mallets turn up by two angles
  (`MalletSet.rise`), so that the shafts do not cross in an X in the front view. Reason: no source
  gives their rest, and the hanging paws of the badger held the xylophone mallets up. The
  percussionist holds the triangle up at rest, because the trap table stands under it, and a paw
  that hangs the triangle on its stand turns over between the hanging arm and the stand. A hold
  with a set position and no ready pose also takes it in a long rest of the music (`setRests()`,
  `SET_MOTION`): before the first note, in a rest of at least 6 beats, and after the last note.
  A rest starts at the end of the damp or the follow move of the strike before it (`setRests()`
  `after`). The sticks go down in the beat after that, and lift from 2 beats to 1 beat before
  the next strike, as a drumline does (percussion 6). Reason: the sticks stood still a few cm
  over the head through each long rest. A rest that counted from the strike ended its lowering
  after its lift, and the mallets of the cymbalist jumped back to the playing position in one
  frame. The hand cymbals also go down to the hanging arms in a long rest, because no concert
  source gives a rest place, and a marching method holds the plates at the sides (percussion 7).
- **Choir.** The penguin keeps the folder in front of the chest, as a choir between two pieces.
  The flat flippers of the Tripo penguin start at the back half of the sides, so the folder hangs
  within their reach (`CHOIR_FOLDER.forward`), and the flipper tips touch its outer edges.

## 5.3 Instrument motion

- **Timing.** The motion of a note starts before the note and ends at the note start, because the
  app reads the full file first. Each player has a small seeded offset in timing and amplitude
  (`PLAYER_OFFSETS`), so that players in unison do not move as copies.
- **Loudness.** The size of a gesture comes from the velocity, CC 7, and CC 11 at the note start
  (`pose/loudness.ts`), from `Score.synthEvents`, so the sound and the gestures use the same
  events.
- **Chords.** Notes of a player that start within `CHORD_SEC` form one stroke, strike, or chord
  (3.8).
- **Units.** A hold value that follows the body is in head heights `H` (4.3): a palm offset, a
  paw gap, a grip shift, a rest offset, an arc, or a reach. A value on the instrument is in meters
  of the instrument at its scale: a target offset, a rim distance, or a part of the bow hair. The
  motion sizes (`HAND_MOTION`, `BOW_MOTION`, the percussion `sizes`, `CONDUCTOR_MOTION`) and a
  measured girth (`girthFit`) are in meters. The rig of a hold gives each value in meters for the
  pose. Reason: a body size change then keeps the hold with no edit.
- **Arms in the body.** A turn of the elbow about the line from the shoulder joint to the wrist
  (a swivel) keeps the paw on its target, but it cannot clear an arm that the cast matrix puts
  into the body. Reason: at the deepest moment, the arm is straight because the paw target of
  the lift or the lowering is out of reach, or the clip is at the root of the upper arm. Both
  points lie on the line of the swivel, so it does not move them. A shared hold lifts the
  shoulder bones of a round body, and keeps a free paw bent in the moves ("Free round arms in a
  shared hold", "Bent arms in the moves"). A clip at the root of the upper arm of a bent arm comes
  from the arm root of the mesh, so the rig fixes it. A larger elbow turn or shoulder turn clears
  only a small part of the depth, and it moves the grip line of the arm gate past its limit.
- **Free round arms.** A rebuilt arm that the mesh joined to the trunk (the panda, the pig, the dog,
  the beaver, the badger) is a round tube with its full inner half width. With the
  bone pose of a thinner arm, the inner side of the upper arm goes into the trunk. So the hold of such a body keeps the elbows away from the sides, as a brass player
  does (winds 1.8). A violinist keeps the left elbow under the instrument and the bow arm free of
  the body (strings 1.8, 2.3), and a cellist starts a stroke open at the shoulder (strings 2.2). At
  rest, the arms of such a body hang out until they clear the body (`restArms`). Each elbow turns
  out about the line from the shoulder joint to the grip, and the shoulder turns
  forward when the arm reaches forward. A grip nearer to the shoulder bends the elbow, so each
  degree of the turn moves the upper arm further from the trunk. When the forearm and not the upper
  arm lies on the trunk, a nearer grip pushes the forearm in. A grip away from the shoulder frees
  the forearm, but moves the paw off its keys, so the pig keeps the left grip of the play at
  rest. The right hoof of the pig lies in the bell of the horn near its axis,
  and points more along the bell than the line from its shoulder (`aimAcross` below 0), with its
  back to the axis (`faceTube`). Reason: the hoof is long and thick, so off the axis it went
  through the wall of the bell, and with the palm to the axis it twisted 166° on its forearm. The grip turn of the arm gate counts from the posed forearm, so the turn
  of the elbow adds to it (`ACCEPTED_GRIPS`). A large forward turn of the shoulder folds the
  shoulder. Reason: on a bent arm, the swivel moves the arm root off the trunk, and each paw keeps
  its grip.
- **Free round arms in a shared hold.** An own hold sets the elbows for its body. A shared hold
  (the flute, the clarinet, the trumpet, the violin, the cello) takes the rule from the body
  (`roundArms`): the out swing that an arm needs is the smallest swing of the hanging upper arm
  out to the side at which the upper arm and the elbow clear the trunk of the bind pose
  (`armOut()`). The hold keeps the swing of its accepted player (`ROUND_ARMS_FIT`), and a body that
  needs more turns each elbow of the play, the moves, and the rest out by `TURN_PER_SWING` times
  the difference (`elbowOutTurn()`), toward the side around the forward axis (`turnPoleOut()`). A
  thin body keeps the elbows of the hold. The paws keep their grips: in the 2x crops of the dog
  and the rabbit flutists and the hippo clarinetist, each paw stays on its keys with and without
  the turn, and the world pose of the palms changes much less than the elbows. So the arm gate
  counts a paw that faces its tube in such a hold from the instrument (the palm turn,
  `ACCEPTED_PALMS`, design 4.4). The percussion holds have no
  rule, because the badger plays them as its own holds. Reason: the sweep measures the inner half
  width of each arm against the trunk, so a body needs no value of its own.
- **Lifted shoulders in a shared hold.** The elbow turn cannot clear a clip at the root of the upper
  arm, where the round arm root goes into the trunk or into the shoulder of the mesh. So a hold with
  the rule also lifts each shoulder bone of a body with a large swing, up and out around the forward
  axis, in each pose (`shoulderLift()`): `LIFT_PER_SWING` times the swing above the larger of
  `LIFT_FROM` and the swing of the accepted player, up to `MAX_LIFT`. The shoulder joint goes up,
  and the paws keep their grips, so the upper arm turns less against the shoulder. A free hanging
  arm keeps its direction from the lifted joint. Reason: the arm root turns against the shoulder by
  the swing from the hanging bind, so a body with a small swing keeps its shoulders, and a lift from
  the fit of the hold alone turned the paw of a thinner body past its accepted grip. A real player
  keeps the shoulders down, and the clavicle rises only a little when the arm rises (winds 1.8), so
  the lift stays in that range and does not read as a shrug. Thus it clears only a part of the deep
  root clips, as on the pig.
- **Bent arms in the moves.** In the lift and the lowering of a shared wind hold with the rule,
  the wrist of the free hanging paw stays within `BENT_REACH` of the length of the arm from the
  shoulder joint (`keepBent()`). The limit fades to the whole length at the rest and at the play,
  so the paw keeps its places there. Reason: the straight line from the hanging wrist to the grip
  went out of reach of a short arm, as on the dog, and a straight arm puts the round root of the
  upper arm into the chest. A bent elbow follows its pole, so the elbow turn of the rule holds the
  upper arm off the trunk. A real player keeps the upper arm away from the torso (winds 1.8). A paw
  that holds the instrument or the bow keeps its path in a shared hold: a limit would move it off
  the instrument, and on the bow arm of the cat it cleared no clip. A hold of short arms can keep
  each elbow bent with a soft limit (5.2, "Bent elbows in the moves").
- **Far mouth in a shared hold.** A long snout or a big head puts the mouth far in front of the
  shoulder joints, so the paws of a heavy body miss the valves of the trumpet, also at the smallest
  size. The shared trumpet hold takes the rule of the far mouth (`WindHold.farMouth`): the mouth
  share of a body is the mean distance from the bind shoulder joints to the mouth, as a share of the
  arm (`mouthShare()`). A body with a larger share than `FAR_MOUTH_FIT` bows the head in the play by
  `BOW_PER_SHARE` times the difference, up to `MAX_BOW` (`headBow()`). The neck and the head share
  the bow as they share a look, the mouthpiece follows the mouth, and the trumpet turns down with
  the head (`bowedPlay()`). Reason: a real player brings the instrument to the mouth, the neck
  flexion follows the downward angle of the instrument, and the trumpet keeps its angle to the face
  (winds 1.4, 2.1). A forward lean of the chest does not help, because the head and the instrument
  move with the chest. The shared flute has no rule, because a bow puts the left grip of a slim body
  past the accepted grip. The bow does not clear the snout clips of the trumpet, and the heaviest
  bodies still miss the valves at `MAX_BOW`. The own trumpet hold of the monkey
  (`MONKEY_TRUMPET`) takes the rule with an own fit: the big head of the Tripo monkey puts its mouth
  farther than its arm from the shoulders, and with the head up, the straight arms stop short of the
  valves. It plays a smaller trumpet (`trumpetScale`, 4.6), its spine turns a little back in the
  play (`WindHold.lean`), and the trumpet turns a little further down on the face (`play`), so the
  head stays near the vertical and the trumpet points "slightly down", as the trumpet of a real
  player (winds 2.1). Reason: the arms reach the valves of the trumpet of the app only with the
  trumpet far below the level, and its bell then went behind the music stand. The head stays over
  the chest and the hips. The right paw lies on the valves below the
  mouth (`gripShiftR`), and the right forearm stays below the chin. Reason: a real player keeps
  the right hand on the valves below the face (winds 2.1), and the front view is the default
  view. With the paw nearer to the mouthpiece, the paw and the forearm covered the mouth. With the head bowed 14° to 16° from the vertical,
  the head center stood 6 cm to 8 cm in front of the soles, and the body read as if it fell forward.
- Version 1 has no extra effects, for example no music-note particles.

**Bowed strings** (`pose/fingering.ts`, `pose/strokes.ts`, `pose/bowed.ts`, strings 3):

- A search (Viterbi) gives each stroke its string, position, and finger before the play
  (`planHandSteps()`, `FINGERING_COSTS`), in the orchestral style: low positions and open strings. The
  hand shifts only when the notes leave its position. Vibrato keeps the width of a real player.
  A large shift takes a least time for its length (`LEFT_HAND.shiftSecPerPlace`), and in fast
  notes it starts in an earlier note of the old position. Reason: in the second half of one fast
  note, a large shift turned the left forearm by up to 89° in one frame.
- **Left paw on the neck.** The palm of the left paw stands beside the neck on the side of the
  high strings, and the finger block curls over the fingerboard and lies with its pads on the
  strings (`stopHandAt()`), as a player keeps an open space at the palm and presses the strings
  from above (strings 1.9). The grip measures each body. The pads of the palm and of the block lie
  a depth off their bones (`pawPads()`, `BowedRig.padsL`), and the fingerboard has a half width
  (`BowedRig.boardHalf`). The contact with the strings lies on the pads of the block, at the
  distance from the knuckles that keeps the pads of the palm the gap of the hold off the edge of
  the fingerboard (`BowedHold.gapL`, `restGapL`), in a part of the block (`BOWED_HANDS.padSpan`).
  The block curls 90° less the tilt of the hand (`tiltL`), plus the dip of the hold (`dipL`,
  `stopCurl()`). The pose gives the paw its turn in the plane of its palm (`BowedHold.turnL`,
  `pawTurnL`, design 4.4), and the paw turns around its contact with the strings. Reason: one
  `fingers` bone moves the whole digit block. With the middle of the block on the strings and the
  turn of the retarget around the wrist, the paw lay along the neck, the fingerboard and the nut
  went through the fist, and no digit lay over the strings.
- **Turn and tilt of the left paw.** On the violin and the viola, the forearm comes from the side
  of the bridge, so the paw turns a part of the way toward it and tilts a little over the neck
  (`CHIN_HOLD`). The wrist then bends less, and the knuckles stay near the line of the neck. On
  the cello and the contrabass, the forearm comes from behind the neck, so the paw has no turn
  and a small tilt (`FLOOR_HOLD`), and the wrist is nearly straight. Reason: a full turn onto the
  line of the forearm rolls the block onto its edge on the strings, and a large tilt bends the
  wrist toward the palm.
- **Left paw off the pegbox.** The left paw stops the strings from a start of the hold
  (`BowedHold.stopStart`, `stopRangeOf()`), and holds the neck at rest further from the nut
  (`restPlace`). Reason: the paw of the dog and of the hippo is wider than the distance from the
  first position to the pegs, so the pegs went through the back of the paw.
- The bow changes direction on each note, and short notes in one beat join into one slur
  (`slurSizes()`), because the MIDI files have no slurs. Pizzicato plucks the string, and tremolo
  makes short fast strokes (`BOW_MOTION`).
- The bow turns to the string of the next note in a smooth step of `BOW_MOTION.crossSec` for each
  string step, also in fast notes (`crossAt()`). The step ends `BOW_MOTION.crossLeadSec` before
  the note. When it does not fit into the note before, it starts in an earlier note and ends
  later by half of the part that does not fit. The steps of the strokes add up, so in a fast
  alternation they overlap, and the arm swings less around the middle of the strings. Reason:
  with a share of the note interval, a skip of two strings after a note of 53 ms took 16 ms, and
  the bow paw jumped up to 32 cm in one frame. A real player prepares the new string in the note
  before, and in a fast crossing the bow passes between the strings a little before the bow
  change (strings 2.3).
- A short run of the other technique keeps the technique of the right hand (`handTechniques()`,
  `BOW_MOTION.techniqueHoldSec`), and a change can start in the notes before the new technique.
  Reason: merged parts alternate the bow and pizzicato each 0.1 s to 0.2 s, and each change
  turned the paw by up to 175° in a few frames.
- A change from the bow to pizzicato starts at the end of the last bowed note, but not later
  than `BOW_MOTION.techniqueLeastSec` before the pizzicato note. Reason: a change that started
  `BOW_MOTION.techniqueLeadSec` before the note took the bow off the string while the last
  bowed note sounded, and a shorter change turned the bow arm at up to 3000°/s.
- In a change between the bow and pizzicato, the pose solves the bow hold and the pizzicato hold
  each with its own elbow (`holdArm()`). The hand turns at an even speed on the side on which it
  stays nearer the mean of the two forearms (`turnNear()`). The elbow moves on a straight line
  between the two holds, and the bend of the elbow mixes evenly (`mixWrist()`). Reason: a roll
  toward the elbow of the moving arm swung the cello paw by 68° in 1/240 s, the bow hand and the
  pluck hand of the contrabass are near 180° apart, and the pluck palm of the red fox is out of
  reach.
- In the lift and the lowering, the bow hand mixes the rest bow with the bow of the steady hold
  of the play (`holdArm()`), and the bow wrist has a smooth reach limit up to
  `SOFT_REACH_UNTIL` of the move (`softReach()`). Reason: the roll toward the elbow of the moving
  arm passed the far side of the stick and flicked the hippo paw by 50° in 12 ms, and the rest bow
  path went out of reach, so the arm went straight and the elbow stopped in one step.
- In the lift and the lowering, the roll of the bow hand toward the elbow has a soft limit
  around the mix of the rolls (`ROLL_SPREAD`), and it fades out near the play, so that the roll
  meets the roll of the play. Reason: the hard limit stopped and started the roll, and the play
  roll of a pizzicato hand lies at its limit, so the bow paw of the dog turned at up to 4,350°/s
  at the start of a lowering.
- The arms are a little short for the instruments. So the right shoulder turns forward and the
  stick leans, so that the bow reaches the full hair (`bowRangeOf()`).
- **Reached bow hair.** The strokes use only the part of the hair that the bow arm reaches on
  all strings with a bent elbow (`BowedRig.bowRange`, `ARM_REACH`). A hold whose bow hand turns
  on the stick (`stickTurnR`) takes the hand of the pose in the search (`steadyHand()`), at the
  sounding point of the hold in piano and in forte. Reason: with the bind grip at the contact
  point of the model, the search and the pose did not agree. The dog then played a short part
  near the tip, and the hippo played the fallback part of the search, with no visible stroke.
  The rig tells when the arm reaches no place of the hair (`BowedRig.bowReached`), and the probe
  tools warn about such a hold and about a short part (`tools/bow-warning.ts`).
- **Cello hold from the body.** The shared cello hold (`BOWED_HOLDS.cello`) reads the landmarks of
  the body in place of fixed values (`BowedHold.fit`, `fitCelloPlace()`). The end pin stands on
  the floor right of the middle, the cello leans back and to the left (`CELLO_PLACE`), the top of
  its back stands at the height of the chest, and the middle line of its back stands a gap in
  front of the trunk and the thighs, the room of the arms. The arms take the values of the
  accepted dog cellist, as directions and in `H`. The right elbow points out and down, near the
  body, so the bow paw stays near the direction of no paw twist. At rest, the right upper arm
  hangs as in the bind pose, and the grip lies at the end of the forearm (`forearmGrip()`), so
  the rest elbow stays near the play elbow on each body. In the high positions, the left paw tilts
  further over the neck (`highTilt`), so the wrist comes up beside the upper bout. Reason: a hold
  with fixed values fits one body only. With the old shared hold, the elbow pointed out and up, and the bow paw of
  12 recast bodies flipped through 180° (cast matrix, 4.4). The dog takes its place from its body
  too, with its own gap and a larger lean to the left (`DOG_HOLD.fit`), so that the scroll stands
  beside the left ear and not in front of the long muzzle, and the short bow arm reaches the
  strings. Its fit also tests lines across the upper half of the back (`CelloFit.across`), and the
  cello leans back less, so that the back of the upper bout touches the chest at the sternum. Its
  trunk leans further forward and its right shoulder turns further, so that the bow paw reaches
  the strings in front of the chest and plays about half of the hair, and its bow paw turns on
  the stick (`stickTurnR`), so that it does not flip. Reason: the chest of the beagle is round, and with the middle line alone, the
  upper bout stood deep in the chest in each sample. The short paw of the beagle holds the stick
  under its curled finger tips at the frog end, across the fingers (`SpeciesParams.bowGrip` of the
  dog), and curls the fingers further than the other holds (`BowedHold.curlR`). Its turn on the
  stick keeps the forearm on the line of the palm. Reason: with the shared grip, the stick lay
  under the palm and the finger tips stayed off it. A larger curl folds the knuckles, and a turn
  that keeps the forearm at an angle bends the bow elbow until its skin folds. The contrabass of the hippo takes its
  place from the body by the same rule, with its own lean back, lean to the left, turn of the top
  plate, end pin place, and gap (`HIPPO_HOLD.fit`): it stands nearly upright at the left side, in front of the belly, with a
  small tilt back and a turn to the right, as a standing bassist holds it. The lower bout
  rests against the left thigh, the upper bout stands below the left shoulder, and the scroll
  stands beside the head. The left elbow points out to the side, and the bow plays near level in
  front of the belly, near the end of the fingerboard (`HIPPO_HOLD.soundingPoint`). Reason: with a place that leaned the bass far
  across the body, the hippo hugged it as a cello. The turn to the right brings the frog side of
  the bow nearer to the bow arm, the right shoulder turns far forward (`reach`), and the string
  planes lie near each other (`stringTurn`), so that the short arm plays about 0.4 of the hair
  over the round belly. Reason: with a smaller turn of the bass and of the shoulder, the arm
  reached no part of the hair with a bent elbow. The other
  instruments can take this pattern: a place from the landmarks, and the
  arm values of an accepted player.
- **Violin hold from the body.** The shared violin hold (`BOWED_HOLDS.violin`) takes the arm
  values of the accepted rabbit violinist, as directions and in `H`, and its place from the
  landmarks of the body (`BowedHold.chinFit`, `fitViolinPlace()`). The tail end lies on the left
  collarbone: a share of the way from the middle line to the left shoulder joint, above the base of
  the neck, and behind the front of the upper chest (`chestFront()`), the depth of the chest. The
  violin keeps the turn of the hold. Then the head turns down or up in a small range until the jaw
  touches the chin rest and the strings at the bow (`jawGap()`), and the violin moves up or down
  for the rest of the gap, as a violinist rests the jaw on the chin rest with a straight head
  (strings 1.10). Reason: a place in `H` from the head fits one body only. With the chin hold, the
  arms of each recast body went into the body, and with the head turn of the rabbit, the jaw went
  into the violin of six bodies. The rabbit and the red fox keep their own holds (`SHOULDER_HOLD`,
  `FOX_HOLD`). The red fox turns the head to the left in the play (`BowedHold.headTurn`), so that
  its long snout points over the neck of the violin and above the bow paw at the frog. Reason:
  with a square head, the bow paw at the frog went into the snout. The bow elbow of the red fox
  points a little up at the frog and at the tip, and its left paw tilts less over the neck than in
  the chin hold. Reason: one fox body plays the violin and the flute, and with a lower bow elbow
  and more tilt, a part of an arm of the fox with four-digit paws turned more than 45°. Their holds and the viola hold of the cat turn the top plate 25° back toward up
  (`violinTurn()`), so that the instrument lies about level and tilts only a little down to the
  right (strings 1.10). Reason: with the 50° of the chin hold, the instrument read as upright on
  the chest, and the bow at the frog stood up across the face.
- **Thick paw on a floor neck.** The pads of the round paws of the dog and of the hippo are
  deeper than the finger block is long, so the contact lies at the end of its part of the block
  (`BOWED_HANDS.padSpan`), and the pads of the palm press the edge of the fingerboard. Reason:
  with the contact nearer to the finger tips, the digits stayed beside the strings.
- **Grip clearance from the girth.** The shared cello hold takes the gap of the left paw from the
  body (`BowedHold.girthFit`, `GIRTH_FIT`). It keeps the girth of the left paw of its accepted
  player, and a thicker paw keeps its palm further off the edge of the fingerboard by the
  difference (`pawGirth()`, added to `gapL`), in the play, at rest, and in the moves. Thus the paw
  keeps the free gap of the accepted
  player. A thinner paw keeps the gap of the hold, and the own holds have no rule. Reason: a real
  player holds the neck with the fingers and keeps the forearm free of the body of the instrument
  (strings 1.9), and the gap of the hold fits a thin paw. The shared violin hold has no gap rule,
  and takes the wrist clearance in its place. Reason: the paw at rest keeps its hanging wrist, so a
  rest gap from the girth of the wrist moved the violin into the belly of the heavy bodies, and a
  gap along the normal of the palm does not move the thick wrist out of the upper bout in the play.
- **Wrist clearance from the girth.** The shared violin hold takes the rest grip of the left paw
  from the body (`BowedHold.wristFit`, `wristGirth()`). The girth of the wrist end of the left
  forearm counts as a share of the length of the fingerboard, so a smaller violin of the size rule
  (4.6) counts as a thicker wrist. A wrist thicker than the wrist of the accepted rabbit holds the
  neck at rest nearer to the nut, in proportion up to a limit. The violin keeps the rest place and
  the path of the grip of the hold (`RigPoints.restCarryPlace`), and the paw slides up the neck
  in the moves. A thinner wrist and the own holds keep their grip. Reason: a real player keeps the
  forearm free of the body of the instrument (strings 1.9), and at the grip of the hold, the thick
  wrist end goes into the upper bout. The play keeps its grip, because no move of the wrist and no
  turn of the elbow moves the thick wrist end out of the upper bout.
- **Left forearm clear of the upper bout.** The left wrist of a violin or a viola stays on the
  side of the back of the instrument, so that the forearm passes under the upper bout, as the
  wrist of a real player stays under the neck (strings 1.9). The cat tilts its paw less over the
  neck than the chin hold (`CAT_HOLD.tiltL`), and plays the largest viola with which its paw
  reaches the fingerboard far enough from the upper bout (`violaScale`). Reason: the short left
  arm of the cat runs nearly straight from the shoulder to the neck, and it reached the
  fingerboard only near the upper bout. With the wrist over the plane of the top plate, its
  forearm went through the upper bout in each sample of the play and of the rest. The forearm of
  the rabbit still touches the back of the violin.
- **Bow clear of a wide head.** The stick of the bow keeps off the head over the whole stroke. The
  head of the cat is wider than its shoulders, so the cat holds the tail end of the viola on the
  left collarbone, left of the middle line (`CAT_HOLD.playShift`), and its bow slants in the plane
  of the strings with the tip toward the scroll (`slant`). Reason: with the viola under the middle
  of the jaw, the bridge lay under the left cheek, and the stick went through the cheek in the
  play. A real player holds the instrument on the left collarbone (strings 1.10). The left paw
  then stops the strings on the half of the fingerboard near the body (`BowedRig.stopRange`).
- **Cello and contrabass rest grip on the neck.** At rest, the left paw of the shared cello hold
  holds the neck near the nut (`restPlace`). The dog holds it nearer to the nut than the middle,
  and the hippo holds the neck of the contrabass above the upper bout. Reason: at 0.6, the paw
  holds the fingerboard at the top of the upper bout, and the left forearm or the paw of most
  recast bodies, the paw of the dog, and the claws of the hippo go into the upper bout at rest
  and in the moves.
- **Violin left elbow of the rabbit.** In the play, the left elbow of the rabbit comes in under
  the violin, straight down and forward (`RABBIT_HOLD.poleL`), as a violinist swings the elbow
  under the instrument (strings 1.10). At rest, it points out (`RABBIT_HOLD.restPoleL`). Reason:
  the paw of the Tripo P2 hand rig turns far from its source paw in this hold, and the two
  elbows move a part of that turn from the forearm into the upper arm, so that no arm part shows
  a twist of its skin (design 4.4). The longer arms of the rabbit and its smaller violin (4.4,
  4.6) let the left paw stop the strings from the nut (`BowedRig.stopRange`), so in the first
  position the paw holds the neck next to the pegbox, and the forearm rises under the neck, free
  of the upper bout. At rest, the left elbow bends less than the elbow of the shared hold
  (`RABBIT_HOLD.restArms`), so that the paw of the longer arm keeps the lower end of the violin
  just above the lap. Reason: a violinist in the first position holds the neck near the scroll,
  with the back of the hand in line with the forearm (strings 1.9).
- **Cello left elbow of the dog.** In the play, the left elbow of the dog points out to the side
  and a little down (`DOG_HOLD.poleL`), so that the forearm rises from the elbow to the neck. It
  goes up for each lower string (`elbowPerString`), as a cellist raises the elbow for the lower
  strings (strings 1.8), and further in the high positions (`highElbow`). Reason: with the
  nearly level elbow of the shared hold, the upper arm stood out level from the shoulder, and the
  elbow made a sharp point behind the forearm. The left upper arm of the Tripo beagle is about
  level in the play, and a cellist holds it lower. The elbow turn of the high positions keeps the
  forearm out of the upper bout. The shared hold keeps its nearly level elbow until a cast matrix
  run checks the new elbow on the recast bodies.

**Woodwinds and brass** (`pose/wind-notes.ts`, `pose/winds.ts`, winds 4):

- A wind player shows one note, and breathes in before a phrase. The mouthpiece stays at the
  mouth, so the look at the conductor turns the head only a little (`BODY_MOTION.peek`, 5.1).
- **Mouthpiece on the lips.** The mouthpiece of each own hold touches the lips over the whole play,
  and the lift ends on the lips (winds 4.2): a brass rim presses the lips 0.2 cm to 0.3 cm, with its
  middle at or a little below the mouth line, so that it lies mostly on the upper lip. A reed or a
  clarinet mouthpiece goes 0.3 cm to 0.6 cm between the lips. The flute lip plate presses the lips
  and the chin, with the embouchure hole at the lower lip. The hold moves the mouthpiece from the
  mouth point of the body (4.4) to the lips (`WindHold.lipShift`). A new mouth point of the body
  moves the seats of the layout, so only the pig has one (`mouthHeight`). A hold that moves the
  mouthpiece moves its rest place by the opposite step (`restShift`), so the rest pose stays.
  Reason: with the mouth of the rule of the nose drop, the mouthpieces of five holds stood 0.15 cm
  to 2.4 cm off the lips.
- Each paw closes around its tube (`WindHold.faceTube`, `gripShiftL`). `pnpm wind-grip` measures
  the grasp in each phase.
- **Clarinet of the wolf.** The left paw holds the upper joint and the right paw the lower joint,
  with the fingers curled over the front of the tube (`WOLF_CLARINET`). The clarinet hangs from the
  mouth forward over the knees, at less than the 45° of a real player. Both shoulder bones turn
  forward, and the elbows point down and out, a little away from the body. Reason: a real
  clarinetist holds the clarinet at about 45° with the elbows away from the sides (winds 3, 1.8),
  but the long muzzle of the wolf puts the mouthpiece far in front of the chest, and at 45° the
  arms do not reach the grips.
- **Oboe of the mouse.** The left paw holds the upper joint and the right paw the lower joint,
  each at the tone holes of its joint, with the digits curled over the front of the tube
  (`MOUSE_OBOE`, `gripShiftL`, `gripShiftR`, `gripCurl`). The reed goes between the lips at the
  front of the muzzle, on the middle line (`lipShift`). Reason: a real oboist puts the reed at
  the middle of the lips and the fingers on the holes (winds 2.3), and the reed under the muzzle
  further back read as the corner of the mouth. The left grip lies low enough on the upper joint
  that the reed and the top of the joint show between the lips and the paw. The head bows 15° in
  the play by the rule of the far mouth (`MOUSE_OBOE_FIT`), and the oboe turns with the head,
  about 15° from the vertical. Reason: a real oboist bows the head a little to the reed, and the
  paws then hold the oboe below the shoulders with the elbows down. With the head up, the arms
  pointed straight forward at the height of the shoulders. A real oboist holds the oboe 40° to
  45° from the body, but the reed at the front of the long muzzle puts the grips of a larger
  angle out of the reach of the short arms. At rest, the left elbow points down and a little out
  and forward (`restPoleL`). Reason: an elbow further out showed as a cone. Both shoulder bones turn forward, the right more than the left (`reach`, `reachL`), as
  the shoulder blades of a real player slide forward. Reason: the arms of the Tripo mouse keep
  the length of its source, and with square shoulders the paws missed their grips by 2.7 cm and
  5.2 cm. The mouse plays a smaller oboe (`oboeScale`, 4.6), the largest size at which the right
  paw reaches the holes of the lower joint with a bent elbow. The scale of an instrument is a
  factor of the instrument of the app, so the oboe keeps its size in meters when the body scale
  changes. The digit block of each paw has one bone and the thumb none, so the paws close as
  mittens.
- **Flute and clarinet holds from the body.** The shared flute and clarinet holds (`WIND_HOLDS`)
  take the arm values of the accepted tan fox and wolf, as directions and in `H`, with the lip
  plate or the mouthpiece at the mouth landmark of the body. Each paw keeps the side sign of its
  accepted player (`WindHold.aimSigns`). The shoulders turn forward only in the play
  (`turnShare()`). The rest comes from the hanging arms (5.2). Reason: the sign from the geometry
  turned the right flute paw of 7 recast bodies about 180°, and the lip shift of the wolf under
  its long muzzle put the forearms of short snouts into the body. The tan fox and the wolf keep
  their own holds (`FOX_FLUTE`, `WOLF_CLARINET`). `FOX_FLUTE` also keeps the side signs of the
  accepted grip, so the right palm of the fox faces the audience behind the flute, with the paw up
  and the digits over the keys, as a flutist turns the right palm away from the body (winds 2.4).
  Reason: the short arms of the Tripo fox put the right paw nearly in the plane of its shoulder and
  its tube, the sign from the geometry turned, and the palm faced up under the flute. The shared
  trumpet hold turns both shoulder bones forward (`reach`, `reachL`), as the shoulder blades of a
  real player slide forward. Reason: with
  square shoulders, the paws of most recast bodies miss the valves, also with the smallest trumpet
  of the size rule (4.6). A body with a far mouth also bows the head ("Far mouth in a shared
  hold"). The right palm faces the valve tops, and the right paw points a part of the way across
  them (`faceTube`, `aimSide`), as the monkey holds them. The right shoulder turns a little more
  than the left. Reason: with the roll of the shoulder, the right paw of each recast body stood up
  behind the valves, with its palm to the mouthpiece and its finger tips up, and a real player
  rests the finger tips on the valves (winds 2.1). The side aim moves the wrist off the line from
  the shoulder to the grip, so a short arm reaches the grip only with the larger turn, and a larger
  aim or turn made the arm of a slim body fold. The left paw keeps the roll of its shoulder.
- **Fingering.** Each note takes the fingering of a real chart (winds 7, `windFingering()` of
  `pose/wind-fingering.ts`), a pure function of the notes. A woodwind paw closes by the share of
  its main fingers that close a hole or a plate. A brass paw closes by the share of its valves
  that go down: the trumpet and the horn press with three valves, the horn takes the B♭ side
  above the written G4, and the tuba takes valve 4 for 1-3 and 2-4 for 1-2-3 below B♭2. The
  partials skip the flat seventh partial, as real players do (`PARTIALS`). Reason: a paw has one
  `fingers` bone, so the count of the closed fingers is the part of the chart that shows.
- **Presses.** A press ends at the note start and takes `WIND_MOTION.pressSec`, and a release
  `releaseSec`, about two times the measured key times, so that each move shows in one frame. The
  press adds a small curl to the grip (`WIND_BODY.keyCurl`), so the fingers stay close to the
  keys, as the fingers of a professional do (winds 7.4).
- The trombone slide takes the position of the chart, the lowest one, or an alternate of a fast
  note that saves two positions of travel (`planSlide()`, `SLIDE_ALTERNATE`). The positions map
  into the travel that the arm reaches, by the ratios of the real distances (`slideTravel()`) and
  a curve that spreads the near positions (`reachedShare()`). Reason: with the ratios alone, the
  second position moved the slide of the panda about 1 cm, and the slide did not show the notes.
  The arms do not grow in the pose. The panda plays the trombone of the app with the longer arms
  of its mesh (4.4) and points the slide a little to the right of straight ahead and down,
  toward the audience (`PANDA_PLAY`), lower than a real trombonist. Reason: at 45° to the right,
  the slide pointed at the next panda, at 20° the bell stood at the right knee, and the short arms
  of the Tripo panda reach little of the travel with the slide straight ahead or a little down.
  A lean or a turn of the chest in the far positions adds no reach, because the mouthpiece follows
  the chest. The slide keeps clear of the music desk.

**Percussion** (`pose/strikes.ts`, `pose/percussion.ts`, percussion 10):

- Each paw holds its mallet in the closed fingers, with the head out of the front of the fist,
  and keeps one roll on the shaft through the stroke (`MalletSpot`, `gripRoll()`). The roll of a
  mallet across the forearm comes from the arm of a body that only leans over the instrument
  (`steadyRoll()`, `PercussionRig.steadyChest`), so the sway and the breath do not turn the paw
  around the shaft. Reason: the forearm of the elephant stands where the two solutions of the
  roll meet, and the roll of the posed arm changed by up to 20° in one frame. The palm of
  each stump paw of the timpanist faces down, as in the German grip, and the shaft lies under the
  stump, in the skin of its palm side (`TIMPANI.malletSpotL`, `malletButt`). Reason: the stump
  has no fingers, and a shaft through the stump came out of the lower side of the forearm.
- **Kept paws.** A hold with `PercussionHold.keepPaw` keeps each paw that holds a piece on the
  hand of the player: the pose gives the paw the turn 0 in the plane of its palm (`pawTurnL`,
  `pawTurnR`, design 4.4). Reason: the piece follows the hand of the player, and the turn of the
  retarget toward the forearm moved the claws of the badger off its sticks.
- A mallet lifts before a strike, comes down at full speed at the note start, and rebounds
  (`STRIKE_MOTION`). A strike within `legatoSec` of the strike before it of the same hand is a
  legato stroke: the mallet lifts at once after the strike before, to the top of the new strike,
  and waits there. Reason: a real player lifts the mallet at once after the attack (percussion 3,
  4), and with a rebound to the low rest height, the mallets stood still near the heads between
  the notes of a passage. At the note start, the head touches the struck surface: each strike
  point rises by the radius of the head (`PercussionHold.ballLift`, or the offsets of the snare
  drum, the cymbal, and the bass drum). Reason: with the middle of the head on the surface, half
  of a felt ball went into the timpani head. Another strike lifts from the rest height one beat
  before the note (`leadSec`), at least `upSec` before it and in at most `upShare` of the gap. Reason: a real
  player brings the mallets up a beat before an entry, and a lift of 0.25 s read as a start with
  no preparation. A rebound starts no faster than its stroke came down, so it takes more than
  `reboundSec` after a stroke with a top below the rest height (`reboundMaxSec`). Reason: the
  beater of the triangle left a soft stroke four times faster than it came. A chord takes both
  hands, a fast repeat takes the other hand, and a hand does not cross the other.
- **Timpani hands** (`sideHands()`). Each paw of the elephant strikes only the front kettle on
  its side, because the short arms and the trunk do not let a paw cross (`PercussionHold.pair`).
  A note takes the kettle of its pitch. A note within `sideAlternateSec` of the strike before it
  takes the paw that did not strike last, on the kettle of that paw, so that a roll and a fast
  run alternate the paws, as a real timpanist plays single strokes from hand to hand (percussion
  4). The sound plays the pitch of each note. Reason: with one paw for each kettle, a run of 9
  notes each second showed 4 strikes each second of one paw, and the other paw did not move.
- **Damps.** A note is damped at its end when the silence to the next note is at least
  `DampRule.restSec`, as a real player stops the sound in a rest (percussion 5, 7). The windows
  come from the score alone (`dampTrack()` of `pose/damps.ts`): the move ends at the contact,
  stays for at most the hold, and ends before the next lift or note. The hand cymbals go against
  the chest (`ChestDamp`). While the bass drummer plays, its free left paw rests on the near top of
  the hoop of the far head (`HOOP_PAW`), and at rest the arm hangs. At a damp, the paw lays its palm
  on the near part of the far head, and the upper body turns to bring the left shoulder forward,
  with the head turned back (`PalmDamp`). Reason: the far head stands out of the reach of the short
  arm. With no turn, the left upper arm went into the body, and a drum moved or turned to the
  left put an upper arm into the body or the beater off its spot. The paw of the suspended cymbal
  that did not strike
  the note takes its grip to the near rim, so that the closed paw lies on the edge with its claws
  over the plate, and the spine leans further over the cymbal (`EdgeDamp`). The wrist lifts the mallet, so that it points a
  little up over the plate and its ball stays away from the bell (`EdgeDamp.share`), as a real
  player stops the cymbal with the hand on the edge. Reason: a steeper mallet pointed up to the
  chest, and a lower one put its ball near the bell. The move takes the time of `EdgeDamp.speed`
  for its length, because a move in 0.06 s after a short note moved the head of the mallet 7 cm
  in one frame. The plate of the suspended cymbal is a piece on the `slide`
  bone with its pivot at the bell, and it rocks after each strike: the sum of a damped sine of the
  time since each strike (`cymbalSwingAt()`, `CYMBAL_SWING`), with a limit for a roll. The damp
  stops it. The window ends before the next lift of each paw. Reason
  of the lean: with no lean, the arm stretched past the margin of the arm gate. The paw of the
  timpanist that struck the note moves toward the player with its mallet in the strike direction,
  as far toward the playing spot as the short arm reaches, and the lowest point of the paw goes to
  the head, while the spine leans (`FingersDamp`). The paw keeps the roll of the mallet of its
  playing spot (`steadyRoll()`), and on the way, a paw under the head goes up to it at once, and the
  paw lifts in the middle of its move (`FingersDamp.arc`), so that it passes over the hoop. The move
  takes the time of `FingersDamp.speed` for its length (`DampWish.minInSec`), so a short rest has
  no muffle. Reason: a move in 0.06 s jumped the paw 25 cm, the turn of the upper body twisted the
  chest, and the roll of the posed forearm turned the paw over on the way. The muffle does not
  follow the lift and the lowering. Reason: from an upright
  body, the paw stayed over the head, and higher, nearer kettles that the paw reached moved the
  left arm past the margins of the arm gate. A muffle that grew with a lift turned a paw too fast.
  The stump paws of the Tripo elephant reach farther, so its spine leans less at the muffle, and
  the rigid low point of the paw stays over the head, so that only the skin touches it. Reason:
  with the lean of the old elephant, the stump and the forearm went into the kettles, the trunk
  into a head, and the center of mass far in front of the middle of the soles.
- **Hand cymbals** (`CRASH_MOTION`, `plateHand()`). The plates tilt from vertical, so the right
  plate comes down onto the left plate at the angle of a flam (`CRASH_MOTION.flam`), so that the
  top rims meet first. The rims meet at the crash point, a little offset, and the
  plates slide on past each other, the right plate down and the left plate up by a share
  (`StrikeState.slide`). A louder crash meets higher. After a crash, each plate turns out to the
  front and up, parts, and rises, by the loudness, until the damp or the next
  lift (`ringTrack()`). A crash with no time for it goes to the chest at once. Reason: a real crash
  is a glancing blow as a flam, and a long crash turns out to the hall (percussion 7). The target
  is the plane of the rim, because the rims of two plates meet first.
- The paws of the elephant rest above the near rims, as in the reference images, so its mallets
  strike further in than a real timpanist (`PercussionHold.rim`). The short arms of the badger
  cannot hold hand cymbals out of the round body, so it plays a suspended cymbal
  (`SpeciesParams.cymbalForm`). Only a recast body plays the hand cymbals. The xylophone bars are smaller than real bars, so the short arms
  reach each one. At the xylophone, each mallet of the badger points from a place out from its
  shoulder (`PercussionHold.home`), and the spine leans further over the bars, so that the
  forearms stay out of the leaning belly. The elbows point down and back (`poleL`, `poleR`). A
  home further in puts the forearms into the belly, and less lean misses the far bars. The grip
  stays at most a few cm over its bar (`PercussionHold.gripRise`), so that the wrists stay low and
  the forearms near level at the end bars, as a real player keeps them (percussion 9). Reason: a
  bar far out from the home turned the mallet steeply down, and the wrists came up to the
  shoulders. A home moved out to the end bars spread the arms out to the sides as wings.
- **Fast rolls.** A roll is a run of single strikes on one target, faster than the visible stroke
  rate. It keeps its first strike and then each `k`-th strike (`thinRolls()`), so the kept strikes
  stay on the note grid and follow the tempo. Two hands in turn strike at most 12 times each
  second (`STRIKE_MOTION.rollSec`), also the two paws of the timpanist, and one hand at most 6
  times (`handRollSec`). The sound plays
  each note. Reason: a hand that struck each note of a roll of 20 notes each second moved as a
  buzz, and a real roll of 32nd notes at 80 beats each minute has about 11 strokes each second
  (percussion 4). A stroke in a roll of one hand lifts by `StrikeSizes.roll`.
- **Triangle.** A single note strikes the outer face of the right side. The beater turns past its
  rest direction before a louder note (`MalletAcross.peak` above 1). The lift of the loudest note
  is the peak share of the rest height (`StrikeSizes.lift`), so the beater turns through the
  whole down stroke. Reason: with a higher lift, the beater waited at its peak and made the whole
  turn in the last part of the stroke, 46° in one frame. A roll, a run of notes each
  within `TRIANGLE_ROLL.rollSec`, strikes the two sides of the closed lower corner in turn from
  inside, with a small lift (`triangleRolls()`), as a real player rolls in a closed corner
  (percussion 8). The roll targets lift toward the player, so the beater goes in and out in front
  of the rods.
- **Tambourine** (`percussion-switch.ts`, `TAMBOURINE_HOLD`). A run of tambourine notes with a
  rest of at least `switchRestSec()` before and after it is held in the left paw. In the rests
  around it, the paws go to the trap table: the left paw hangs the triangle on its stand and takes
  the tambourine, and the right paw puts down the beater, and the reverse after the run. The pose
  shows one copy of each switched piece, on the table or in a paw (`AnimalPose.held`), from the
  score alone. The turn of each paw on its forearm mixes in the frame of the body forearm
  (`tablePaw()`): the twist goes on a straight line between the places, and the bend of the wrist
  mixes on its own. The left paw also gives the turn in the plane of its palm (`pawTurnL`), so the
  body paw takes exactly the mixed turn. The right wrist goes on an arc in front of the belly
  (`TAMBOURINE_HOLD.beaterArc`). Reason: a mix in the frame of `acrossAxes()` twisted the left paw
  through 180° in 0.05 s, and on a straight line the beater went into the belly. The right paw strikes the held head with the fingers, nearer to the rim and with
  less curl for a softer note. A roll of the held tambourine is a shake of the left forearm when
  it is loud, and a thumb along the rim when it is soft. A shorter rest keeps the triangle in the
  left paw, and the beater strikes the tambourine on the table. Reason: a real player holds the
  tambourine and lays the other instruments on a trap table (percussion 8), and each piece follows
  one bone, so a piece that moves between a paw and the table has a copy at each place.
- **Xylophone.** The heads stay a few cm over the bars between strikes, and lift higher by the
  loudness before a strike. A fast strike that would pass the other paw takes a double stroke
  (`PercussionHold.pass` 0), as a real player puts in a double stroke where alternate strokes cross
  the hands (percussion 9). Reason: with low heads, a pass of one bar put one shaft on the other
  head, and a higher passing stroke did not clear it. A run on adjacent bars thus stays in one
  paw.
- **Sticks and mallets between strikes.** Each snare stick and each mallet of the suspended
  cymbal keeps its strike direction, and the wrist holds the tip a few cm above the head with the
  stick almost level (`MalletAcross.pitch`), as the ready position of a real player (percussion
  6). Before a strike, the wrist lifts the tip
  higher by the loudness of the note (`StrikeSizes.lift`, `MalletAcross.peak`), and the tip comes
  back to the ready height after the rebound. Reason: with a large pitch and no higher lift, the
  tips stood high above the head between strikes, and the stroke did not grow with the loudness.
- **Reach of the badger.** The spine of the badger leans over each instrument, and the homes of
  the sticks and the mallets stand near the shoulders (`PercussionHold.lean`,
  `PercussionHold.home`). At the suspended cymbal, the mallets are shorter than the snare sticks
  (`SUSPENDED_CYMBAL.mallet`), and they point forward to the two spots. Reason: with long mallets
  that pointed in to the spots, the upper arms stood out from the body as wings. Reason: with an upright spine and the homes further out, the sticks, the
  beater, and the mallets missed their strike spots. At the bass drum, the neck and the head turn
  back up by the whole lean (`PercussionHold.headUp`), so that the badger looks ahead to the
  conductor, as a real player does. Reason: with the head on the leaned spine, the snout came
  within 1 cm of the top hoop. At the xylophone, a bar past `reach` of one
  shoulder goes to the other paw, so that each paw strikes only the bars near its side. At the bass
  drum, the upper body turns further at a muffle (`PalmDamp.turn`), so that the left forearm stays
  out of the belly. The left paw that holds the triangle stays in line with its forearm
  (`trianglePaw()`), and the triangle turns back around the pinch of the clip, so that it keeps its
  hang (`PercussionSide.piece`). The fist closes on the clip as on the shaft of a mallet, with the
  clip in the palm under the curled fingers (`TRIANGLE_PINCH`), and the paw turns around its
  forearm until the clip hangs along that grip (`TRIANGLE_GRIP_LINE`). The clip leaves the heel of
  the fist, and the triangle hangs below it. Reason: the triangle followed the hand of the player,
  whose turn made the visible paw turn 70° in the plane of its palm, off the clip and up to the
  snout, and a paw with the palm down twisted at the wrist until its skin stood up as a fin. A clip
  in the hook of the claws needed a curl of 118°, which folded the knuckle rows into one flap. The
  clip stays in front of the upper chest and below the snout (`triangleClip`), with the left elbow
  down, because a higher clip puts the claws into the snout, and a clip nearer to the body puts the
  right forearm into the belly. At the bass drum, the roll of the beater around its shaft comes
  from the steady arm of the leaning chest (`malletHand()`), so that the turn of the body at a
  damp does not turn the paw. Reason: the forearm stands where the two rolls of `gripRoll()` meet,
  and the posed arm turned the right paw 54° in one frame.
- **Snare drum from the body.** The shared snare drum hold takes the place of the drum from the
  body (`PercussionHold.fit`, `fitDrumPlace()`). The drum goes forward until its near rim stands a
  room in front of the trunk on the middle line, from the head up to the shoulder joints. A deep
  body also sets the head higher, toward a drop below the elbows of the hanging upper arms, as a
  real player sets the head below the elbows (percussion 6). The raise grows with the move that
  the bind place needs, and it is full at a move of one room. The targets and the mallet homes
  move with the drum. The drum does not go down or back, so the badger and each thin body keep
  the bind place. Reason: at the bind place, the forearms and the paws of a deep body went into
  the belly. A move forward alone put the targets further out of the reach of the short arms, and
  a full raise for each body put the sticks of thin bodies into the drum in the lowering.

**Piano** (`pose/hands.ts`, `pose/piano-keys.ts`, piano):

- **Soft reach.** Near the full reach, the palm of a pianist or a harpist comes to the reach
  limit on a curve (`REACH_SOFTNESS` of the arm length, `softLimit()` of `pose/ik.ts`). Reason:
  the hard limit stopped the elbow in one frame, and the forearm of the polar bear snapped up to
  23° in one frame. Near the limit, the palm stops a little shorter of its key or string.
- The left hand plays low notes and the right hand high notes (`HANDS_HOLDS`, `splitHands()`).
  Each paw plays only to a few keys past the middle of the keys (`reach`), because a paw that
  crosses further puts its elbow in front of the round chest.
- A plan of the whole piece gives each narrow chord to a paw (`planHands()`), as a pianist plans
  which hand takes which notes. A dynamic program finds the paws of the least cost, in which each
  move of a palm costs the square of its distance over its time, so a fast move costs more. A
  move out of the way of the other paw counts too. Thus a melody stays in one paw. Reason: a
  chord that went to the nearer paw after a move out of the way made both paws jump at the next
  chord, up to 6.5 m/s (`bach-bwv1050`).
- The plan lets a paw play a narrow chord a few keys past its reach (`PLAN_REACH_SLACK`), at a
  cost for each key (`PLAN_REACH_COST`). Thus one paw plays a melody near the middle of the keys,
  and the two paws do not trade it note by note. Reason: in such a trade, the paw that came onto
  the keys went into the other paw. A higher lift over the other paw does not part the paws,
  because the paw that comes lowers next to the paw that leaves.
- A narrow chord that no paw reaches whole, also with the slack, can split as a wide chord does
  (`wideChordCut()`): the left paw plays its low keys and the right paw its high keys. The plan
  picks the split or the left paw by the cost. Thus the paw of a melody keeps its keys and plays
  the high key of the chord. Reason: such an octave under a melody of the right paw went to the
  left paw, so the right paw moved away and came back at once, and the paws went up to 2.5 cm into
  each other (`bach-bwv1050`).
- The wide paws keep apart (`apart`). When the two parts of a wide chord, such as a bass and a
  melody, come nearer, each part asks its palm to stand a few keys away from it
  (`HandNote.shift`). Thus the two parts stay in two paws, and one paw does not jump between them.
  The fingering gives the shift: the paw takes the claws on the side of the other paw
  (`PIANO_FINGERING_COSTS.room`), and each claw stays on its key. Reason: a palm that moved off its
  claws by the shift jumped about 12 cm between two notes.
- The paw lifts less before a near note (`HAND_MOTION.liftGapSec`), because the motion of a
  pianist gets smaller as the speed rises (piano 7).
- A long move of a paw starts early enough for its length (`HAND_MOTION.leapSpeed`), at the
  earliest at the strike of the note before, as a pianist gets to the keys of a jump ahead of time
  (piano 9.3). The length of a move counts the change of the height over the other paw
  (`HandTrack.hovers`). Reason: a move that fit only in a part of a short gap turned the forearm
  faster than 1,000° per second, and a paw that came down 8 cm from over the other paw in 66 ms
  snapped the left forearm 25° in one frame at 30 frames per second.
- At a loud note after the paw leaves the keys, the wrist drops a few degrees at the strike and
  rises a little at the release (`HAND_MOTION.kickDrop`, `wristKickAt()`), as the take-off of a
  jump starts with a small down kick of the wrist (piano 9.3). The paw turns around its claw tips
  (`kickPaw()`), so the claws stay on their keys. The drop grows with the loudness. A note kicks
  only when the kick of the note before has ended. Reason: in legato chords, two kicks added up to
  twice the drop.
- A paw that moves out of the way of the other paw goes there at most `HAND_MOTION.yieldSpeed`
  fast, from the strike of the note before and back to its next keys (`limitYields()`). For the
  missing distance, the paw lifts over the other paw (`HAND_MOTION.over`, `HandTrack.hovers`).
  Reason: in a two-voice passage, a paw jumped up to 34 cm in 50 ms out of the way and back.
- A paw that takes the keys from the other paw waits away from it until the strike of the other
  paw (`waitAway()`), with a note that only makes way. `limitYields()` then holds it near its next
  keys and lifts it over the other paw. Reason: the paw came in from far away with an eased move,
  so it was near its keys before the other paw struck, and the paws went up to 1.4 cm into each
  other (`bach-bwv1050`).
- A lifted paw that comes back to its keys after the next note also draws back from the
  fallboard (`HAND_MOTION.overBack`). Reason: it comes down next to the other paw while that paw
  rises, so the two paws pass at the same height, and they touch there.
- A paw plays the white keys near a black key at the depth of the black key, between the black
  keys (`keyDepths()` of `pose/hands.ts`): at the depth of each black key of the paw within
  `KEY_DEPTH.holdSec` of the note, and past that time, it comes out at most `KEY_DEPTH.outSpeed`
  fast. A note that only makes way takes the depth of the near notes, and the place before the
  first note takes the depth of the first note. Thus the paw stays at one depth for a group of
  notes, as a pianist plays a passage of black and white keys close to the fallboard (piano 5).
  Reason: in a fast alternation of two chords a semitone apart, the paw went 12 cm in and out at
  each note, and the upper arm swung 32°.
- Each paw plays a fingering: the fingers of the lowest cost by the rules of Parncutt et al.
  (piano 9.2, `planFingeringSteps()` of `pose/piano-fingering.ts`), with the spans scaled for the paw
  (`POLAR_BEAR_PAW`). The palm stands so that the claw of each key is over the key
  (`clawOffset()`). The move of a thumb pass starts at the note before (`HAND_MOTION.passSec`),
  as a pianist prepares the pass (piano 9.3). Reason: a palm at the middle of the keys of each
  note slid one key along the keys at each note of a scale, and a real hand stays in one position
  for a group of notes. A thumb pass has no hard span limit, and a chord has no legato limit,
  because the arm carries the hand there. With the plain limits, the C major arpeggio took a thumb
  pass on each second note.
- The paw rolls a little toward the thumb at a thumb pass, away from it at a finger pass over the
  thumb, and toward the little finger in a chord. It turns toward the next key of an arpeggio
  (`FINGER_MOTION`), as a hand turns like a cartwheel (piano 9.3). The paw turns around the claw
  of the note, so the claw stays on its key. Reason: the paw already turns about 40° on its
  forearm in the play, so larger turns twist the wrist.
- The claw of each key drops to the key bed at the note start and stays down until the note end
  (`digitBendsAt()` of `pose/piano-digits.ts`, `DIGIT_MOTION`). Before its strike, the next claw
  lifts, the thumb most, and more at a faster rate. From 8 notes/s, the next claw starts down
  before the last key reaches the key bed. The other claws rest a little up, and each claw next to
  a pressing claw follows a small part of its press (`DIGIT_MOTION.spill`, piano 9.3). The bend
  turns each digit bone around the curl axis of its paw, from -18° (up) to 20° (down). Reason:
  the claw is about 3 cm long in the app, so a larger bend tears the joined claw bases. A short
  drop takes a smaller lift, and a claw with no gap after its last press stays down, so that no
  claw turns faster than about 1,000° per second. In the rest pose, the claws bend up a little
  (`DIGIT_MOTION.lap`), and they blend to the bends of the play in the lift. The lap bend is gone
  early in the lift (`DIGIT_MOTION.lapFade`), when the paw leaves the belly. Reason: with straight
  claws, the claw tips go into the round belly at rest. With the lap bend over the whole lift, they
  go into the front of the case in the lowering onto the keys.
- Each key goes down with its notes, from the note start to the note end (`keyLevelsAt()`), so a
  seek and a mute give the correct keys at once.
- The paw moves in for a black key, so the claws lie on it, as a pianist moves the hand in toward
  the fallboard (piano 5, `pianoKeyFront()`).
- The piano is larger than a real grand piano (`PIANO_SCALE`), because the bear is large. The keys
  stand near the bear (`PIANO_FRONT_H`), because farther keys pull the haunch into the bench, and
  nearer keys fold the shoulders.
- The trunk leans toward the piano, less than the flexion of a posture that is not neutral, and
  the shoulders turn down (`lean`, `shoulderDrop`), as a pianist keeps the shoulders low (piano 3).
  The trunk sits tall with a small lean (piano 3). Reason: a larger lean puts the trunk of the bear
  over its knees, as if it stood up. The keys stand on a lifted piano at the height that the
  upright trunk needs (4.6), so the paws reach their keys.
- The elbows point out and a little down (`poleL`, `poleR`), so the arms stay clear of the round
  trunk, as the elbows of a pianist do not touch the torso (piano 4), and the forearms are almost
  level with the keys (piano 1). Reason: elbows that hang far down by the wide belly put the arms
  deep into the trunk, and elbows that point up slope the forearms down to the keys.
- The trunk leans toward the keys of the paws over a window of song time (`sideLeanAt()`), so it
  moves smoothly toward the register of a passage, as a real pianist. The neck and the head turn
  back by the lean (`BodyAngles.roll`), so that the eyes stay level.
- The right foot presses the damper pedal with the sustain pedal of the score (CC 64,
  `pedalLevelAt()`), and the synth reads the same events.

**Harp** (harp 6): the palm faces the string of its note and pulls away to pluck. The left palm
also faces down (`HANDS_HOLDS.harp.faceL`), so that the left wrist stays near straight,
as the wrists of a harpist go only a little down (harp 4). Reason: the short upper arm of the deer
cannot bring the left elbow near the plane of the strings, so the left forearm points into the
strings. With the palm square to the strings, the left wrist bent back past the paw swing limit of
the arm gate in the rest, in the lift, and in the play. The turned paw comes nearer to the
strings at the knuckles, so the left palm stays further from the strings (`palmL`), and the
fingers stay out of the strings. Reason: the fingers of the deer curl toward the palm, and with
the palm nearer, they went through the strings. The offsets of the palms are in `H`, so they grow
with the deer (4.4).
The highest strings of the left hand lie near the chest, so for them the left palm moves nearer to
the strings, lower, and toward the column (`highL`), and the paw stays out of the chest.
The top of the soundbox rests against the chest, below the right shoulder (4.6), so the right
elbow points out and up (`poleR`), and the right arm passes outside the top of the soundbox to the strings,
as the elbows of a harpist rise (harp 4). Reason: with the elbow down, the right upper arm went
into the top of the soundbox. The highest strings of the right hand lie near the right shoulder,
so for them the right palm moves down the strings and a little away from them (`highR`), as the
right wrist of a harpist comes near the soundboard in the upper register (harp 4). Reason: near
the neck of the harp, the right elbow folded back. The right palm stands above the pluck point
(`palmR`), so the right paw reaches its lowest strings. The right palm faces a little down and a
little back to the player (`faceR`), so that the right forearm twists at most 45° in the chord and
the pluck.

Each hand plays the fingering of a harpist (harp 7, `planHarpFingerings()` of
`pose/harp-fingering.ts`), a pure function of the notes of the hands:

- **Hands.** The right hand plays down to about G2, and the left hand up to about C5
  (`HANDS_HOLDS.harp.reach`). One hand reaches a tenth (`span`) and plays at most four strings
  (`most`): a chord with more strings splits between the hands, and a hand keeps four strings of
  a chord that does not split. The sound keeps each note.
- **Groups.** The notes of a hand go into groups of at most four strings within a tenth, one
  position of the hand each. A note after a gap of `HARP_FINGERING.groupGapSec` starts a new
  group. The thumb (finger 1) plays the highest string of a group and finger 4 the lowest, so a
  scale plays 4321 up and 1234 down (harp 7.4). A crossing flag marks a group that goes on with a
  run: finger 4 under the thumb up, or the thumb over finger 4 down.
- **Placing.** The palm stands at the middle of the strings of its group, so the hand moves once
  for each group and stays still in the group. It places the next group right after the last
  pluck of the group before (`HarpFingering.places`), and rests on the strings until the pluck,
  as a harpist places the fingers before they sound (harp 7.2). A move takes the time of its
  length at `HAND_MOTION.placeSpeed`, on a smooth path (harp 7.8). The first group of a hand
  places that time before its first pluck. A move with too little time after the pluck before
  starts at that pluck. Each move ends before the first pluck of its note. Reason: a move in
  0.15 s turned the forearm more than 30° in one frame at 30 frames per second.
- **Pluck.** The last pluck of a group pulls the palm away from the strings, and a pluck inside a
  group pulls it only a little (`HAND_MOTION.groupPull`), because the hand stays still and the
  fingers move (harp 7.3). The thumb closes on its own after its pluck (`thumbClosed`, digit 1 of
  `AnimalPose.digits`), and fingers 2 to 4 close as one group on the `fingers` bone after the last
  of their plucks in the group (`fingerClosesAt()`). The deer paw is a fist with a free thumb, so
  fingers 2 to 4 have no bones of their own.
- **Rolled chords.** A chord of three or more strings of both hands rolls from the lowest string
  to the highest, with the last pluck on the note start (`HARP_FINGERING.rollSec`). A chord of two
  strings, such as an octave, does not roll. Each string swings from the pluck of its finger
  (`notePlucks()`), and the sound keeps one start.
- **Damping.** After the last note before a rest of at least `HAND_MOTION.dampRestSec`, the palm
  opens flat at the place of its group, with the fingers open, and leaves before the hand places
  the next group (harp 7.6). The palm does not move in toward the strings (`dampPress`), because
  the treble strings of the near harp lie near the chest of the deer.
- **Pedals.** Each note needs the pedal of its string in its notch (`planPedals()` of
  `pose/harp-pedals.ts`): natural for a white key, and sharp for a black key, which the app plays
  on the string of the natural below it (`harpString()`). Each pedal starts in the notch of its
  first note. A pedal changes as early as the music lets it, after the last pluck in its old
  notch, and the changes of one foot keep `PEDAL_MOTION.footGapSec` apart when the music lets
  them, as a harpist moves 1 to 2 pedals each second (harp 7.7). The left foot moves D, C, and B,
  and the right foot E, F, G, and A (`PEDAL_FEET`). For each change, the foot goes from its rest
  to the pedal, lifted by `PEDAL_LIFT` over the line of its move, presses the pedal into the notch,
  and goes back to its rest (`poseHarpFeet()` of `pose/harp-feet.ts`). A move that starts on the
  pedal of the change before goes from that pedal, and the return after the press goes to the
  rest. Reason: a return to the pedal before kept the hoof at the height of a press, through the
  corner of the base. Each foot starts from its rest place (`LEG_RESTS`): the left hoof rests
  to the left of the base, behind the foot of the soundbox, with the knee out and forward, so the
  harp stands between the knees, as a harpist sits (harp 2). Reason: the near diagonal harp puts
  the foot of its soundbox and its base over the bind place of the left hoof, so the left hoof
  and shin went through them. The base stands to the right of the middle, so the right hoof rests
  a little to the right of its bind place, and its pedal moves stay out of the base. The pedals stand on the floor (4.6), so the hoof turns up around its
  heel until the front of its sole is on the pedal, as a harpist keeps the heel on the floor and
  presses with the ball of the foot (harp 7.7). Above `HEEL_PITCH`, the whole hoof lifts. For a
  pedal behind the rest place of the toe, the heel lifts (`HEEL_LIFT`). Reason: the pedals of the
  near harp lie under the knees, and a heel on the floor there puts the shin into the stool. The
  two-bone IK of the leg places the knee. The pedal turns into its notch with the press
  (`pedalNotchesAt()`, 4.6).

Each note plucks the string of its key (`harpString()`), and the string swings (harp 5,
`pose/harp-strings.ts`). `stringSwingsAt()` gives the swing of each string at a song time as a
pure function of the pluck track, so a seek, a pause, and a change of speed show the correct
swing. A paused song keeps the swing of its time, as a film camera sees a string that rings.

- The swing starts at its full size at the note start, because the finger releases the string in
  1 to 6 ms. The velocity sets its size (`STRING_MOTION.softShare`).
- The swing decays with the time constant of its register (`STRING_MOTION.ringSec`, geometric
  from the bass to the treble), and faster after the note end (`dampSec`), as the hand damps it.
- The triangle of the pluck rounds off to the arc of the first mode (`roundSec`), because the
  high partials decay first.
- A new pluck of a string replaces the swing before it, as the finger stops the string.
- The swing takes the weight of the playing pose, so a resting or a muted harpist shows still
  strings (5.5).

**Choir** (`pose/choir.ts`): the `jaw` bone opens the beak for each note and closes it after the
note (`CHOIR_MOTION`). The lower beak turns at the back of the gape, so a small angle
(`CHOIR_MOTION.jaw`) opens a long gape, as a singing bird does. A wide angle hung the long lower
beak down as a hinge. As a real singer opens the mouth for the vowel, the beak starts to open just
before the voice, and the opening goes on a little after the note start (`openShare`). The jaw opens
at most at `openRate` and closes at most at the faster `closeRate`, so no frame step snaps. In a
rest, the beak closes fully when the rest gives the time, and else as far as it can before it opens
again. In a legato, it closes a part of the way (`dip`), so that each note shows. The head lifts a
little over each phrase and keeps still on each note, as a real choir singer opens the mouth and
keeps the head still. Neighbor voices sway to opposite sides, so that the choir does not move as one
block. The flippers hold the outer edges of the folder with the elbows down and out (`CHOIR_HOLD`). A
flipper is a flat stiff paddle, so it bends only in one gentle curve of about 50° over its outer
half: each grip lies just outside the lower outer edge, in the plane of the cover
(`CHOIR_FOLDER.gripIn`, `gripFront`), the paw bends toward the palm at the wrist with the palm on
its grip (`CHOIR_HOLD.flex`), and the fingers curl a little more (`CHOIR_HOLD.curl`). The wrist
and knuckle blends of the rig spread the two bends, so that the flipper lies beside the edge and
its tip touches the edge of the cover. The covers are about as wide as an A4 page
(`CHOIR_FOLDER.width`), so that the grips stay in the reach of the flippers. Reason: with the
grips inside the edges, each flipper went through the cover, and the cover cut the flipper in the
side view. A far curl that put the tip on the front of the cover bent the outer third in one sharp
kink, with a pointed corner and stretched feathers. With the grips farther out or in front of the
cover, the curved tips stood off the folder. A larger bend at the wrist moves the wrist away
from the shoulder, and the palms missed their grips. Reason: the rebuilt flippers are free round
arms, and with the elbows of the old flippers the upper arms went into the chest. A larger turn
of the elbows turns the grips off the accepted grip.

## 5.4 Conductor

The bear beats real beat patterns from the time signatures and the tempo map. A conductor beats a
fast bar in fewer beats, so the baton beats no faster than `ONE_BEAT_TEMPO` of `score/beats.ts`.

| Time signature | Pattern (`barPattern()`) |
|---|---|
| 2/x, 3/x | 1 from `ONE_BEAT_TEMPO`, else 2 or 3 |
| 4/x | 1 from twice `ONE_BEAT_TEMPO`, 2 from `ONE_BEAT_TEMPO`, else 4 |
| 6/8, 6/4 | 2 from `TWO_BEAT_TEMPO`, else 6 |
| 9/8, 12/8 | 1 or 2 from `ONE_BEAT_TEMPO` in dotted beats, else 3 or 4 |
| others, such as 5/4 | `generic`: one down-up motion for each beat unit |

- At each beat, the baton tip is at the point of the beat (`BEAT_PATTERNS`). Between two beats,
  the tip rises in an arc and comes down at full speed. The size follows the loudness and the
  level of the passage (Expression).
- **Beat height.** At beat 1 the right wrist is in front of the chest, below the shoulder joint,
  with a bent elbow (`CONDUCTOR_HOLD.beatPoint`, `batonPivot`). The arcs and the loud
  passages move the wrist up to about the shoulder joint in the median, and the largest loud
  beats to about the chin. Reason: a real conductor beats between the waist and the chest, and
  keeps most gestures below the chin. With beat 1 above the shoulder joint, the median of the
  play was at the chin, and from the stage camera the paws stood at the height of the ears. A
  lower beat brought the baton within 2 cm of the desk of the conductor stand.
- **Beat plane in a lean.** The beat plane follows only a part of the forward lean of the
  expression (`BATON_LEAN`). Reason: the tip of the baton is far in front of the spine, so a full
  lean of a soft passage moved it down onto the desk of the conductor stand.
- **Elbows.** Both elbows point down and out (`poleL`, `poleR`), so that they hang a little away
  from the body. Reason: an elbow further out stood the upper arm out to the side and twisted it,
  and an elbow forward went into the side of the round belly.
- **Beat plane in a cue.** The beat plane turns with the whole turn of the upper body, so that
  the paw beats in front of the turned chest. Reason: with half of a turn to the left, the low
  right paw reached out to the side of the chest, and the upper arm twisted.
- **Baton in the lift.** In the lift and in the lowering (5.2), the right paw turns from the
  hanging paw to the paw of the beat on an ease (`LIFT_HAND_EASE`), so that the tip points
  forward from about a third of the lift, and forward and up from the middle, as a conductor
  raises the baton. The tip passes the height of the desk out at the right of the desk. Reason:
  a swing out and down pointed the baton down and in across the belly.
- **Count-in.** A click on play does not start the music at once: the conductor first signals the
  players to get ready. The transport starts before the start point (6.5), so the count-in is a
  set of poses at those song times (`COUNT_IN`): a ready pause, then one preparatory beat.
  A seek during play ends the count-in, and the sound starts at once. Thus a start point
  that a seek sets (`Transport.seekStart`) gets `NO_COUNT_IN`: no ready gesture, no leader
  nod, and no lift of the baton.
- **Baton.** The bear holds one baton, in the right paw, with the palm down and tilted a little
  in, as a conductor holds it between the thumb and the fingers (`CONDUCTOR_HOLD.batonRoll`). The
  roll is right for a body whose `palm` is the true palm of its paw. The fingers curl around the
  baton in each pose, also at rest and in the bow (`batonCurl`), because a conductor keeps the
  baton in the closed hand. Reason: the open rest paw of the Tripo bear showed the baton under
  the tips of its claws. The curl stays below the angle at which the knuckle crease of the Tripo
  bear folds.
- **Baton line.** In the beat, the baton is a longer line of the forearm, a little in
  ([conductor technique](../reference/conductor-technique.md) 7a). The baton points a little in at
  beat 1 (`batonPivot`), the tip is far enough forward that the arm reaches out (`beatPoint`),
  and the right elbow points out to the side (`poleR`), so the forearm points forward and a
  little out. Reason: with the baton 20° in and the elbow down, the baton stood about 50° off the
  forearm. A baton that points straight forward touched the desk of the stand when the arms came
  down after a final chord.
- **Paws of the arm gate.** In the ready gesture the left palm faces in and down, as in the quiet
  place (`readyRoll`), so the left forearm does not twist from the one to the other. In the rest
  pose the arms hang relaxed beside the round belly, a little forward, with a small bend of the
  elbows and the elbows down and back (`restArm`, `restPoleL`, `restPoleR`). The baton of the
  hanging paw hangs down beside the leg, a little forward (`restBaton`), as the baton hangs in the
  relaxed hand of a conductor with the arms down. The paw turns with no twist on its forearm, so
  the baton comes only near to its direction. In the ready gesture the left paw points level
  (`readyLift`), so that it waits at the height of the right paw. The ready gesture keeps a loose
  left fist below the curl at which the knuckle crease folds (`readyCurl`), and a nearly straight
  arm (`readyReach`). The elbow of a nearly
  straight hanging arm is ill defined, so the conductor gives it a fixed direction. The search of
  the swing out to the side sees the body only along x, so the rest arm adds an extra swing
  (`restArm.extraOut`). Reason: with the swing of the search alone, both elbows go into the round
  belly, and the full upper arms of the Tripo bear go into the sides of its chest.
- **Bow** (`pose/end-bow.ts`, `END_BOW`). At the song end, the bear ends the concert as a real
  conductor does ([conductor technique](../reference/conductor-technique.md) 8). It holds the
  release in the silence, lowers the arms to the sides, and stands still. Then it turns on the
  podium to the audience with steps, bows from the waist with the eyes down, faces the
  audience a moment, and turns back to the orchestra. The arms come down before the turn, so the
  bow does not need the hold of `transport.holdSec` (5.2). `endMotionAt()` gives the motion from
  the wall seconds after the stop at the song end (`Transport.endedAtSong`), so the pose keeps no
  state. A seek while paused keeps the transport, so the bow continues. After `END_BOW_SEC`, the
  bear stands in the rest pose that faces the orchestra, as after each other pause.

  ```text
  wall s  0     silence  lowerSec  stillSec  turnSec  down,hold,up  faceSec  turnSec  END_BOW_SEC
          |release|arms down|still   |turn left|  bow   |  face  |turn back|  rest pose
  ```

  - The turn goes from the facing of the conductor to the audience at +z of the layout
    (`ConductorLayer.audienceTurn`). The bear turns to its left, past the first violins.
  - The bear turns with steps, as a person turns on the spot (`TURN_STEPS`, `stepTurnAt()`,
    [conductor technique](../reference/conductor-technique.md) 8). The head turns first, the
    weight moves over the right foot, and the feet step in turn: the left foot first, then the
    right foot, then the left foot, and a small step of the right foot closes the feet. Each step
    turns one foot at most `gap` past the other foot. A foot turns and moves on its circle around
    the root only in the air (`swingSec`, `lift` in `H`). The planted foot keeps its place and its
    turn, and the hips turn smoothly over it. The hips move toward the foot that carries the
    weight (`weight`), and the knees bend (`knees`). The turn back takes the same steps with the
    right foot first. Reason: with a turn of the root alone, the feet slid on circles over the
    podium while they carried the weight.
  - The legs solve from the stance (`stanceOffset()`, `stepFeet()`): each ankle at its place,
    each foot flat with its turn, and each knee toward its toes. The root offset puts the hips
    over the middle of the feet, and drops them so that no leg is longer than in the bind pose.
    Outside the steps, the legs keep the solve of the hip move (`plantFeet()`). A body of another
    species takes the same motion.
  - The bow faces away from the conductor stand. Reason: the bow to the orchestra bent the head
    and the baton toward the desk, and the stand checks of two demos failed.
  - The bow turns back to the orchestra. Reason: a conductor turns back to the players after the
    bow, and the rest pose after the bow is then the same as after each other pause.
  - A play during the bow turns the bear back from where it is (`transportEndMotion()`). Each
    change after the pause at the song end plans new steps from the motion at the change back to
    the orchestra, in `returnSec`. A foot in the air at the change steps first, at once. The arms
    lift only when the bear nearly faces the orchestra (`armsTurn`). Reason: with no steps, a play
    during the bow turns the bear to the orchestra and lifts the arms in one frame. A playing arm
    of a turned body reaches across the body to the beat point. `returnSec` is at most
    `LIFT_FIT_SEC`, because `changeTransport()` cuts the transport before a play after that time.
  - The end card shows after `END_BOW_SEC` (2.8), because the card stands over the podium.

  ```typescript
  /** The motion of the conductor at the song end at one time (`pose/end-bow.ts`). */
  interface EndMotion {
    arms: number; // the share of the playing pose that the arms keep, 1 to 0
    turn: number; // the turn of the hips (the root bone) around +y, positive to the left
    headLead: number; // the turn of the head ahead of the hips
    bend: number; // the bend of the spine of the bow
    footL: number; // the turn of each foot around the root
    footR: number;
    stepL: number; // the lift of each foot in a step, 0 to 1
    stepR: number;
    weight: number; // the hips from -1 (over the right foot) to 1 (over the left foot)
    knees: number; // the share of the knee bend of the steps, 0 to 1
  }
  ```

  ```text
  turn s  0     shiftSec      + pitchSec    + 2 pitchSec   + 3 pitchSec
          |head,|  L up       |  R up       |  L up        |  R up     |
          |weight on R        |  on L       |  on R        |  on L     | settle
  feet    L 0 -> gap          R 0 -> 2 gap  L gap -> half  R -> half (half turn)
  ```
- **Chamber group.** A chamber group has no conductor, so its leader gives the count-in with a
  breath and a nod, as in a string quartet (`leaderOf()`, `LEADER_NOD`).
- **Cues.** The conductor cues each section entry, as a real conductor does (`findCues()`,
  `cueStateAt()`). A strong entry gets the baton, and each other entry the left hand. A cue to
  silent seats does not show (5.5). A body with a high head and a long muzzle gives the facts
  `cueHeadLeft`, `cueHeadRight`, and `cueLift` (4.4, "Hand rig"): the head turns less to each
  side, and the left hand rises less at the cue point. The Tripo bear takes 35°, 30°, and 12°.
  Reason: with the head turn of 50° and the hand 30° up, the right forearm of an earlier Tripo bear
  went 3.3 cm into the cheek in a turn to the right, and its left paw 5.6 cm into the head in a cue
  to the left. With these facts, no paw and no forearm of the bear goes into its head. At the cue
  point, the left arm is nearly straight (`CUE_MOTION.cueReach`), as a conductor extends the arm
  to the section. Reason: the bent elbow of the Tripo bear folds at its inner side.

  ```text
  time (s)    -1.1        -0.5      0           0.6         1.2
  head, body  |--- turn --|--- on the section --|--- back --|
  left hand     |-- rise -|-- down -|-hold|--- down --|
  baton       the beat pattern goes on in a beat plane that turns with the upper body
  ```

  ```typescript
  /** One cue of the conductor (`pose/cues.ts`). */
  interface Cue {
    entrySec: number; // the first note of the cued entry
    landSec: number; // the entry, or the downbeat of the count-in
    beatSec: number;
    kind: 'hand' | 'baton';
    seats: readonly number[];
    torsoYaw: number;
    headYaw: number;
    headPitch: number;
    handYaw: number;
    batonLift: number; // the extra height of the arc of the baton, in meters
  }
  ```

- **Expression** (`pose/conductor-expression.ts`, [conductor
  technique](../reference/conductor-technique.md)). The bear shows the music with the whole body,
  as a real conductor does. `buildExpressionTrack()` reads the score before the play, and
  `expressionAt()` looks it up at each frame, so the pose keeps no state (`EXPRESSION_RULES`,
  `EXPRESSION_MOTION`).

  ```text
  score -> level (mean of 1 s) -> soft, loud --> beat size and height, lean, head, crouch, palm
        -> trend of 2 s -> crescendo ----------> beat grows, chest opens, shoulders rise, palm up
        -> note lengths per beat -> stroke ----> legato arc, or staccato rebound, stop, and click
        -> onsets vs the 2 s before -> accent -> head and shoulder jolt, knee dip, breath before
        -> phrase starts, first beat ---------> breath: chest, head, and shoulders rise
        -> loud downbeat after a rise --------> climax: both arms open wide and high for one bar
        -> last tutti chord ------------------> final: held (hold, rise, circle) or short (stop)
  ```

  - A forte is more energetic more than larger. A loud stroke stops longer at the top of its
    rebound and falls faster into the ictus (`loudEnergy`), and the body and the head come up.
    The beat stays below the chin, except at a climax.
  - A soft passage makes the beat small and low, leans the body toward the players, lowers the
    head, bends the knees, and puts the left palm down. A left cue takes away a part of the lean
    (`cueUpright`), so the body comes up for the cue and the head stays clear of the paw.
  - A legato stroke has no stop. A staccato or accented stroke rebounds to the top of its arc,
    stops, and falls into the ictus at full speed (`strokeOf()`, `strokeRebound`, `strokeFall`).
  - The knees dip only on accents, because knees that bob with each beat are a fault of a
    conductor. Two accents are at least `accentGapSec` apart.
  - The upper body does not sway to the side with the beat or the bar, and the hips stay over
    the feet. Reason: a real conductor keeps a grounded stance, and a side sway that changed its
    side every bar or two read as a metronome. The chest twists further toward a cued section
    (`cueTwist`), and the head keeps its aim.
  - A climax is rare: it needs `climaxStartSec` of music before it, and only the largest rises
    stay, one for each `climaxEverySec`, at least `climaxGapSec` apart.
  - The left paw turns its palm up or down with the dynamics (`LEFT_HAND_PLACES`, `palm`): it
    twists on the forearm toward the twist of the side (`PALM_TWIST`), by the weights of the
    places, and the twist stops at `MAX_TWIST_L` (`twist` and `maxTwist` of `writeArm()`). The
    turn goes from the twist of the paw with no wrap. Reason: a roll toward the palm of the place
    asked for a twist near 180°, and the limit turned the paw 90° in one frame, from +45° to -45°.
  - The places of the hands lean, move, and drop with the body (`followBody()`), so the
    paws keep their clearance to the head. The beat plane takes only a part of the lean
    (`BATON_LEAN`), so that the baton stays above the desk of the stand.
  - On a held final chord, the baton leaves the beat, holds, makes one circle before the end of
    the sound, and stops a little lower. The left palm holds the chord and closes at the end. On a
    short final chord, the baton stops at its beat with no rebound. The bow follows.

- **Left hand between the cues** (`pose/conductor-left.ts`). A real conductor uses the left hand
  for the dynamics, for held notes, and for a mirror of the beat (`LEFT_HAND_PLACES`). The mirror
  stays outside of the torso (`MIRROR_IN`), and starts at the mirror point of the right wrist at
  beat 1. The quiet place rests low at the left of the lower chest with a relaxed elbow, and the
  lowered palm of a soft passage is at the chest, as a real conductor rests the left hand between
  its gestures. The places turn with the upper
  body to each side. Reason: places that stayed in a turn to the right made the left arm reach
  back across the turned chest, and the left forearm stretched past the limit of the arm gate.
  The paw of each place stays near the line of its forearm, and the left elbow points down and
  out (`CONDUCTOR_HOLD.poleL`). Reason: a paw bent far on its forearm stretched the forearm skin
  of the Tripo bear, and an elbow nearer the body put the upper arm into the shoulder. In the
  lift, the left wrist keeps its distance from the shoulder (`mixWrist()`), because a straight
  mix bent the elbow more than at both ends and folded the inner elbow.

  ```text
  quiet --mirror--> --swell--> --fade--> --hold--> --open--> --cue or ready--> wrist, fingers
  (always) (level)   (trend>0)  (trend<0,  (chord,   (climax)  (5.4 cues)
                                 soft)      final)
  each arrow mixes the next place in by its weight, from 0 to 1. A later place wins.
  the playing pose (5.2) then mixes the hanging arm into the result.
  ```

  ```typescript
  /** The data of the left hand that the pose looks up at each frame. */
  interface LeftHandTrack {
    /** The conducted beats, and the weight of each place at each beat, from 0 to 1. */
    beats: Float64Array;
    mirror: Float32Array;
    swell: Float32Array;
    fade: Float32Array;
    /** The held chords, sorted by start, and their starts for the search. */
    holds: readonly Hold[];
    holdStarts: Float64Array;
  }

  /** A held chord: a time with sound and with no new note. */
  interface Hold {
    startSec: number;
    endSec: number;
    /** The sound stops before the next notes, so the fingers close to cut it off. */
    cutOff: boolean;
  }
  ```

## 5.5 Silent seats

A muted seat, or a seat that a solo makes silent, rests: its instruments go down, and only the
idle motion continues. Thus what the user sees agrees with what the user hears. Each player
lowers and lifts with its seeded motion (5.2), with no hold and no scale. A change starts from
the height of each player at the change, from `SeatAudibility.before`
(`changeAudibility()` of `app/transport.ts`).

## 5.6 Camera shots

The cinematic camera of 2.5 films the piece as a concert film does. `cameraAt()` calculates the
camera only from the shot plan, the song time, the transport, and the view. `prepareShots()` makes
the plan one time for each score. Thus a seek, a pause, and a speed change are always correct, and
the same piece gives the same film. `pnpm shot-trace` prints the choice at each cut.

```text
 score ──> layoutScene() ──> layout ──┬──> preparePoses() ──> PosePlan ──> poseAt() ───┐
   │                                  │                                                │
   └──────────────────────────────────┴──> prepareShots() ──> ShotPlan ──> cameraAt() ─┤
                                       (one time for each score)          (each frame) │
                         songTime, transport (6.7, 5.1) ──────────────────────────────>│
                                                                                       v
                                         StageScene.pose() and StageScene.follow(camera)
```

```typescript
type ShotKind = 'wide' | 'high' | 'conductor' | 'side' | 'section' | 'solo' | 'insert';
type InsertDetail = 'keys' | 'bow' | 'fingers' | 'harp' | 'slide' | 'bell' | 'sticks' | 'bars' | 'baton';

interface ShotKey {
  azimuth: number;   // radians around y, from +z (the audience) to +x
  elevation: number; // radians above the stage plane
  zoom: number;      // a factor of the frame distance, or of the wide distance
  fov: number;       // the vertical field of view, in degrees
}

interface Shot {
  kind: ShotKind;
  startSec: number;    // the first shot starts at -Infinity
  endSec: number;      // the last shot ends at Infinity
  moveEndSec: number;
  seats: readonly number[];
  part: readonly number[] | null; // the players of a choir part, such as the sopranos
  target: Vec3;        // the camera turns around it
  halfHeight: number;  // half the frame height at the target, or 0 for a wide or a high shot
  composition: { eyes: Vec3; third: -1 | 0 | 1 } | null; // look room and headroom
  from: ShotKey;
  to: ShotKey;
  blendSec: number;    // 0 is a hard cut
  hero: number | null; // the player whose nearer eye takes the focus, or CONDUCTOR_OWNER
  detail?: InsertDetail; // only an insert
}

interface ShotPlan {
  stageSide: number;
  shots: readonly Shot[];   // the main shots, which touch
  starts: Float64Array;
  inserts: readonly Shot[]; // the detail inserts, each inside one main shot
  insertStarts: Float64Array;
}
```

Each camera stands on a sphere around its target. Cinematic mode always shows a frame of
`CINEMA_ASPECT` (21:9, design 2.5), so the planner fits and tests each shot at that aspect. A wide
or a high shot takes `WIDE_FOV`: at 21:9 it shows the horizontal angle of the stage view of a
desktop, so the stage fills the width of the frame. The wide camera cannot come nearer, so that
it stays out of the beam fade of Free mode (4.5) and keeps the full beam.

| Kind | Camera | Shot size |
|---|---|---|
| wide | the default view of 4.5, or a variant (`WIDE_VARIANTS`) | the full stage |
| high | high, near the front | the full stage |
| conductor | behind the bear: close, or over the shoulder at the players | a thigh shot, or a long shot of the players |
| side | low, from the front of one side | a group shot of its front half |
| section | low, from the front of one group | a group shot |
| solo | low, from the front of one player | a knee shot |

- The shots follow the views of `scene.png`. The conductor shows only from behind, as in the
  reference images (1).
- All shots stand low, near the eye height of the players, as the cameras on the railings of a
  concert hall. The wanted camera of each kind stands at `CAMERA_LOWER` of the height above the
  stage top that its nominal elevation gives (`SHOT_KEYS`, `WIDE_VARIANTS`). Free mode and its
  default view keep `DEFAULT_ELEVATION`.
- A close camera first tries the wanted elevation with each azimuth of the grid (the low band).
  Only then it rises in steps up to the tops of `KEY_SEARCH.bands`, because a low camera sees
  more heads in the foreground. Each candidate gets the low band and the first band before a
  candidate gets a higher band, except the best candidate at its entry.
- Each move blends its keys with a smoothstep over the full shot and turns around the target, so
  it starts and ends at rest and never cuts through the subject.
- **Drift** (`CAMERA_DRIFT`, `shots/drift.ts`). The view turns a little around the camera
  position, as a camera on a fluid head or a steadicam, so a shot does not look like a still
  render. The turn is a sum of sines of the song time with fixed phases, so the same time gives
  the same camera, a pause holds it, and a blend has no jump. The position does not move, so the
  distance floor to each animal holds. A wide or a high shot stands on a crane and drifts less.
  With reduced motion, the view does not drift (2.5).
- **Focus on the eye** (`subjectHero()`, `heroFocusDepth()`, `EYE_FOCUS`). A focus puller keeps
  the eyes of a close face sharp, the eye nearer to the camera in a shallow focus
  (`camera-technique.md`). Each shot names its hero, and the scene focuses on the nearer eye of
  the posed head of the hero (4.5). The hero of a solo is its player. The hero of a section or a
  side view is the principal player of the seat with the lead in the frame, else of the most active
  seat. The view over the shoulder of the conductor faces the players, so its hero is the lead
  player in its sphere. The close view of the conductor from behind names the conductor, and
  its eyes face away, so the focus takes the middle of its head. A wide shot names the lead
  player, and its closed aperture keeps the stage sharp. A blend moves the focus from the eye of
  the old hero to the eye of the new hero.
- **The eye of a body.** The scene reads the posed eye bones `eye_L` and `eye_R` of the body: the
  middle of a bead eye, or of the sphere of an eye of the mesh (4.4). Thus each body, also a new
  one, gives its own eye places, with no constant of a species. An eye counts when it is in the
  frame and the front of the head, from the middle of the head to the middle of the eyes, turns
  toward the camera. Else the focus takes the middle of the head, and a hero out of the frame
  keeps the focus on the point that the camera looks at. The pose cull (9.7) poses each hero of
  a frame. The focus is the view depth of the eye, because the blur of 4.5 reads the view depth.
- **Focus pull** (`FOCUS_PULL`, `CameraPose.focusPull`). After a hard cut into a close shot or an
  insert, the focus starts a little behind the eye and pulls onto it in under a second, as a
  focus puller finds the subject after a cut. The blur in front of the focus has a limit (4.5), so
  the subject is only a little soft. With reduced motion, the focus stays on the eye.

**The frame of a close shot.** A 21:9 frame that fits the height of one player shows about 2.3
times its width. Thus a close shot fits the width of its subject with the shot size of its kind
(`SHOT_SIZES`, `shots/shot-size.ts`), from `camera-technique.md`:

- The outline of the subject fills a share of the frame width, seen from each camera, with the
  perspective of its distance. The outline is the hull of the footprints of the subject players,
  with their instruments and seats, up to `SUBJECT_SIZES.outlineReach` from each player.
- Each rule of the frame holds at the end of the push-in, the closest moment of the move, so a
  move never ends closer than its shot size. The low-poly animals show their facets and the seams
  of their meshes from near. Thus a solo is a knee shot and a conductor shot a thigh shot, 1.25
  times larger than a waist shot at the end of its push-in.
- A solo, a section, or the conductor stays inside the side edges, with the target on its third
  line and the look room on the other side. A side view and the view over the shoulder fit a
  sphere, and the frame cuts its deep part. A side view holds the heads and the hands of the
  players in its sphere.
- A side view is a group-shot, so it shows one clear group. Only the players in its sphere are
  subject players: a head of another player in front of them counts in the foreground rule. Their
  eyes and their look set the composition, because the frame holds only them. The eyes of the
  players out of the frame would move the eyes of the group off the upper third line. The side
  camera stays at or below `KEY_SEARCH.sideCeiling`, because views 03 and 04 film the side low,
  and a higher camera looked down on the side over the heads of the front rows.
- At the push-in of the end of the move, the frame then grows until it holds the top of each
  head and the hands and the instruments, with the eyes on the upper third line
  (`FRAME_MARGINS`). The head has no ears (`HEAD_BONES`): a closer shot needs less headroom, and
  a close shot can cut the top of the head (`camera-technique.md`). With the ears, a waist shot
  of a rabbit or a fox showed about seven players. The fit reads each point with the perspective of the camera: a near head
  looks larger, and a high camera sees a back row higher in the frame. A last test reads the
  tops of the heads with the composed camera at the push-in, because the fit does not tilt the
  camera (`HEAD_TEST_PASSES`).
- The shot keeps half the height of its frame (`halfHeight`). The camera stands at the distance
  at which its field of view shows that frame, so the camera does not depend on the aspect of
  the view.

**Cuts and choice.** A cut falls on a downbeat or on the middle beat of a bar, with a bonus for a
phrase line (`CUT_BONUS`). The camera films the player who just started to play: a cut at an
entry gets the largest bonus. The first shot is the establishing shot of a concert film. In the
plan, it starts at the default view, and it cranes down to the low wide view while it pushes in and
zooms in to `WIDE_FOV`. `cameraAt()` starts it higher and farther than the default view
(`ESTABLISH_MOVE`), so the move reveals the whole orchestra over the opening bars. The picture
fades in from black at the play (2.5), so the jump from the first screen does not show. The end
key does not change, so the shots after the opening do not change. The first camera is farther
from each animal than the default view, so the distance floor holds. With reduced motion, the
opening holds the default view, as the plan says. The last shot cranes up from the low wide view into the default view, so a play from
the start after the end makes no cut. The planner reads the music after the cut (`MUSIC_RULES`): the share of each group, the
entries, a tutti, and the lead, because a concert film follows the melody. Then these rules apply,
in this order (`CHOICE_WEIGHTS`, `SHOT_TIMES`):

1. No repeat of the kind and the subject of the previous shot.
2. No section or solo shot of the group of the previous shot.
3. Spacing: a wide, high, conductor, or side shot waits some shots since the last one.
4. Variety: a subject that the film showed lately loses score.
5. Seeded jitter.
6. The best candidate with a clear camera wins. Else the previous shot holds.

A score with fewer than `SMALL_GROUP_SEATS` seats gets no conductor shot, because the back of the
bear gives weak frames of a solo. Mute and solo do not change the plan.

**Film grammar.** The shots obey the rules of a concert film of
`docs/reference/camera-technique.md`, with the limits of `FILM_GRAMMAR` (`shots/grammar.ts`).
`pnpm shot-trace --rules` counts the breaks of each rule over all demos.

- **The line.** The default view is the master shot. Each camera looks at most `lineAzimuth` away
  from the audience axis, so the stage keeps its left and right sides on the screen. A close
  camera also keeps the screen direction of the look of its subject in the master shot: its
  seeded offset goes to the side of the front where the master camera stands. A look within
  `neutral` of the camera axis has no direction, so it fits both sides.
- **The 30° rule.** Each shot turns the camera by at least `jumpAngle` around its target from the
  end of the previous shot, or it changes the size of the frame at the target by `jumpSize`. The
  planner tests each shot against the previous shot, also of another subject, so the rule holds
  for two shots of one subject. A wide shot takes the next variant that passes, a high shot takes
  its largest azimuth on the same side, and else the candidate has no camera.
- **Moves across a cut.** A move goes on three axes: an arc to the right or the left, a rise or a
  fall, and a push-in or a pull-out. A part of at least `moveShare` of the distance counts. The
  arc of a shot goes in the direction of the arc of the previous shot, so no move reverses at the
  cut. When that arc would leave the front range, the shot only pushes in. After a still axis,
  the seeded direction holds. The last shot cranes up into the default view, because a pull-out
  reverses the push-in of the shot before it.
- **Look room and headroom.** A close shot of a player, a section, a side, or the conductor has a
  `composition`. Its camera turns with no roll, so that the eyes of the subject stand on the upper
  third line (`thirdLine`) and the target on the third line away from the look. A neutral look
  keeps the target in the middle. The tilt stays within `maxTilt`, so the target stays in the
  frame. The camera still turns around the target, so the moves and the clearance do not change.
  The foreground tests read the frame of the composition, with the middle of the subject at the
  place of the target.

**Clearance.** The camera never stands inside a player, and the subject does not hide. The
planner tests each move and sight line against the boxes of `layoutObstacles()`, at
`CINEMA_ASPECT`, because each view shows that frame. The frame tests (`shots/test-shot-frames.ts`)
copy these numbers of the design:

- The line of sight from 0.3 m outside the target crosses no box, except the boxes within 0.4 m of
  the target.
- No head in the foreground of a close shot has a radius above 0.24 of half the frame height,
  except the blurred head of a dirty frame.
- No other object nearer than 0.9 of the focus depth covers more than 15% of a 20 × 20 grid,
  except the blurred boxes of a dirty frame.
- The sharp points of the body of no other animal cover more than `FOREGROUND.bodyShare` of
  that grid, also in a dirty frame (`foregroundBody()`). A point is sharp in front of the focus,
  and behind it while its blur disc stays below `FOREGROUND.dirtyBlur`. Thus a neighbor at the
  depth of the subject counts too: a pig beside the wolf read as the subject of a solo of the wolf.
  Each row of the grid counts the cells from the first to the last point of the body. A choir shot
  has no such test, because the orchestra stands under the singers.
- A section camera sees the face of each subject player whose head is nearer than the target:
  the line from the head to the camera turns at most `FACE_TURN` (a profile) from the front of the
  player (`Subject.faces`). A camera behind the first desk showed the back of the head of the
  nearest player in the middle of the frame. The pianists do not count, because the camera of a
  piano shot stands at the side of the keys.
- A solo of the soloist keeps the middle of the body and the feet of the bear out of the frame
  (`Subject.outside`), because the soloist stands beside the podium (3.8). With the middle of the
  body alone, the legs of the bear and the podium filled a third of the frame.
- Each camera keeps 0.6 m from each box, 1.0 m from the podium and the conductor, and 0.6 m above
  the stage top.
- A camera stays on one side of the beam cone for a full shot, because a crossing darkens the
  image at once.

**The dirty frame.** A low close camera sees the heads of the rows in front of its subject. As
the shoulder of an over-the-shoulder shot (`camera-technique.md`), a near head or a near box of
another object can stand at one side edge of the frame, when the depth of field of 4.5 blurs it
(`FOREGROUND.dirtyBlur`). Its inner edge stays in the outer part of the frame width
(`FOREGROUND.dirtyShare`), and all dirty heads of a frame stay at one side. A head over the
subject always counts. Thus a solo camera can stay low behind the front rows. The lens blurs a
near point only a little (4.5), so a dirty head stays almost sharp. Thus the part is a fifth, less
than the third of a soft shoulder in a film: with a third, the sharp head of another player took
the eye from the subject. For the same reason, a dirty body still keeps the limit of the body
cover: only a thin strip of it stays at the edge.

**The distance to the animals.** No point of an animal body in the frame of a close camera comes
nearer than `ANIMAL_FLOOR` at a sample of the move (`NEAR_SAMPLES`). The rule holds for each
animal in the frame: the subject, a neighbor, and a blurred head or body of a dirty frame. A
blend keeps the floor at the same samples of its own path, because its camera moves between the
moves of two shots. A blend that cannot keep it becomes a hard cut. The
low-poly animals show their facets and the seams of their meshes from near. The floor is 1.25
times the 5th percentile of the distance of the nearest animal of the side views, the closest
kind of shot of `pnpm shot-trace --rules`. The body is the mesh of the animal in the bind pose,
with no instrument.

**Transitions, beam, and light.** A hard cut is the default. A blend is a short camera move in a
slow or quiet window between two close shots (`BLEND_RULES`, `isCloseShot`), because a true
dissolve needs two renders for each frame.
The beam fades in the close shots, because a close camera sees the additive beam over the full
image. Each close camera stays nearer than the end of the beam fade of Free mode
(`CLOSE_DISTANCE_SHARE`), so a change from a close shot to Free mode never gives the full beam. A close shot gets its own soft key, a kicker, and a stronger vignette, as a film crew
lights each setup again (`SHOT_LIGHT`). The weights come from the kind of the shot, so they do not
change in a shot.

```typescript
const SHOT_BEAM_OPACITY = {
  wide: 1,
  high: 1,
  conductor: CLOSE_BEAM_OPACITY,
  side: CLOSE_BEAM_OPACITY,
  section: CLOSE_BEAM_OPACITY,
  solo: CLOSE_BEAM_OPACITY,
} as const satisfies Record<ShotKind, number>;
```

**Detail inserts** (`planInserts()` of `shots/inserts.ts`, `INSERT_RULES`, `INSERT_LENS`,
`INSERT_SIZES`). A concert film cuts away from its main shot to a short insert of a detail of the
playing and back (`camera-technique.md`, section 6). The plan makes the inserts after the main
shots, so they do not change the main shots. The main shot moves on under an insert, as the
camera of a live film keeps its shot while the director cuts to another camera. Thus the cut back
shows the main shot at its time, with no focus pull.

- **Details.** The paws on the keys, the bow on the strings, the left paw of a violin or a viola,
  the paws of a woodwind, the harp strings, the slide of a trombone, the bell of the other brass,
  the heads of the drums under the sticks, the bars, and the baton. The point comes from the play
  targets and the grips of the instrument (4.6). The keys and the bars take the
  place of the mean key of the notes of the insert. A cello or a double bass shows only its bow,
  because its left paw travels along the long neck, away from its grip.
- **Where.** An insert starts on a downbeat or a middle beat inside one main shot, after its cut,
  its blend, and its focus pull, and it ends on a beat before the end of the main shot. The first
  and the last shot get none, because the film first sets the place. No seat enters from
  `entryGuardSec` before the insert to its end, because the film shows each player who enters.
  The window of the insert keeps the lead of the window before it, or both windows are a tutti:
  a phrase of the current lead, a held chord, or a long tutti goes on.
- **Length and rate.** An insert lasts `lengthSec`, as a quick cutaway. At most one comes in each
  seeded `gapSec` and one in each main shot, so the film does not change its angles too fast.
- **A detail that moves.** A held detail, such as the bow, has notes over `coverage` of the
  insert. A struck detail, such as the sticks, has `strokes` notes. The baton shows in a tutti.
  A detail of the lead wins, then the most activity, with a seeded jitter. An insert does not
  show the detail or the player of the insert before it, and a detail of the two inserts before
  it loses `repeatLoss`.
- **Play pose** (`shots/insert-frame.ts`). The planner poses the player of the detail at the
  middle of the insert with `poseAt()`, and the camera frames the posed point, because a played
  trumpet holds its bell lower than the bind pose. The posed point snaps to `INSERT_LENS.snap`.
  The app gives its pose plan to the planner, and a tool with no plan gets the plan of
  `POSE_SEED`.
- **Camera.** A long lens (`INSERT_LENS.fov`), as a remote camera on a railing, with a slow
  push-in. The camera stands at a seeded offset from the front of the player, low over the
  detail. The keys take the side view of a piano shot. Its tests of the stage are those of a close
  shot: the line, one side of the beam, a clear line of sight, and no head in the foreground. The
  line of sight skips the boxes of the player of the detail, because they hold its arms in the
  bind pose.
- **Cover** (`insertCover()`, `INSERT_FRAME`). The posed body, instrument, and seat of the
  player, and the boxes of the other players and the stands, mark a grid of the frame when they
  are in front of the detail. They cover at most `coverShare` of the frame, as the foreground rule
  of a close shot, and no cell in the middle, where the detail is. A paw or a part of the
  instrument within `detailReach` of the detail is the detail. The bell inserts showed the stand
  over the lower third, and the keys inserts the near shoulder of the pianist over half the frame.
- **Soft wall.** The parts of the player that the lens blurs by at least `softBlur` cover at most
  `softShare` of the frame, in front of the detail or behind it. The blur reads the focus of the
  scene: the nearer eye in the frame, else the detail. The belly of a horn player behind its bell
  made a soft wall of fur over half of the frame.
- **Face** (`cutsFace()`). The head of the player is fully out of the frame, or both eyes are in
  it with `eyeMargin`, because an edge through the eyes or the snout looks like a mistake. A head
  seen from behind (`backView`) shows no face, so the cover test reads it.
- **Search.** The camera tries each azimuth and elevation step at the size of its detail
  (`INSERT_SIZES`), then at the larger sizes of `INSERT_LENS.sizes`: a frame of the paws of a
  flute cut the snout, and the larger frame holds the eyes. The first camera that passes the tests
  and the 30° rule at both cuts wins. A detail with no such camera gives no insert, because a weak
  insert is worse than none. The seeded angles snap to the steps of the search, the planner keeps
  the results of the stage tests for each point, and a refusal of the play pose for each detail
  and camera. A detail with `poseTries` such refusals and no insert gives no more inserts. The
  cover test reads the end of the push-in, where the objects in front look largest. These limits
  keep the plan time low, because each test of the play pose reads the posed mesh.
- **Floor.** An insert keeps `INSERT_FLOOR` from each point of a body in its frame, lower than
  `ANIMAL_FLOOR`, because its frame holds the paws and the instrument. Each head in its frame
  still keeps `ANIMAL_FLOOR`, because the faces show the facets and the seams from near.
- **Focus.** The focus stays on the detail. When the nearer eye of the player is in the frame,
  the eye rule applies.
- **Grammar.** Each cut into and out of an insert changes the size of the frame by
  `FILM_GRAMMAR.jumpSize`, or it turns the view by `jumpAngle`. An insert only pushes in, which
  is neutral on the axis of the arc, so the arc of the main shot does not reverse at its cuts.
  `pnpm shot-trace --rules` reads only the main shots.

During play, `cameraAt()` uses `t = max(songTime, transport.startSec)`, so the count-in holds the
camera of the start point.
