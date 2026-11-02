/** The pose of one animal for one frame (design 5.1). */
export interface AnimalPose {
  /**
   * One quaternion (x, y, z, w) for each bone, in the order of `BONE_NAMES` (4.7). Each rotation
   * is relative to the parent bone, and the bind pose has no rotation.
   */
  readonly rotations: Float32Array;
  /** The offset of the root bone, for the sway. */
  readonly rootOffset: readonly [number, number, number];
  /**
   * The move of the `slide` bone from its bind place, in meters, in the axes of its parent bone
   * `instrument`. The trombone slide moves along its axis, and the damper pedal of the piano goes
   * down under the foot of the pianist (4.6, 5.3). It is (0, 0, 0) for each other instrument. The
   * scene adds it to the bind position of the bone.
   */
  readonly slideOffset: readonly [number, number, number];
  /**
   * The move of the `instrument` bone from its bind place, in meters, in the axes of its parent
   * bone. The rest pose of the violin and the viola moves it to the lap (5.2). The scene adds it
   * to the bind position of the bone. A pose with no move can leave it out.
   */
  readonly instrumentOffset?: readonly [number, number, number];
  /**
   * The turn of the left paw in the plane of its palm, in radians, in place of the turn of the
   * retarget toward the forearm (`PAW_TURN` of `models/studio-rig.ts`, 4.4), or `null` for that
   * turn. A violin or a viola at rest and in the lift and the lowering keeps the turn of the
   * playing grip, so that the instrument keeps its place in the paw (5.2). A pose with no value
   * takes `null`.
   */
  readonly pawTurnL?: number | null;
  /**
   * The bend of the right paw off the line of its forearm, in radians, after the turn of the
   * retarget toward the forearm (4.4): the bow paw of a hold with `BowedHold.pawBendR` (5.3). A
   * pose with no value takes 0.
   */
  readonly pawBendR?: number;
  /** 0 is open eyes, 1 is closed eyes. The eye bones scale on y by `max(0.05, 1 - blink)`. */
  readonly blink: number;
  /**
   * The press level of each piano key from A0 to C8 (`keyLevelsAt()`), times the weight of the
   * playing pose: 0 is up, and 1 is at the key bottom (5.3). The scene turns each key by its level
   * (4.6). It is `null` or absent for each player that is not a pianist.
   */
  readonly keys?: Float32Array | null;
}

/** The poses of the scene for one frame (design 5.1). */
export interface ScenePose {
  /** One entry for each player, in the order of `SceneLayout.players`. */
  readonly players: readonly AnimalPose[];
  /** The pose of the conductor, or `null` for a chamber group with no conductor (design 4.2). */
  readonly conductor: AnimalPose | null;
}

/** The play state. It changes only on play, pause, and stop (design 5.1, 5.2). */
export interface Transport {
  readonly playing: boolean;
  /** Wall clock seconds of the last play, pause, or stop. `null` before the first play. */
  readonly changedAtWall: number | null;
  /**
   * The transport before the last change, or `null` for the rest pose. A lift or a lowering of
   * each animal starts from its height in it at the change, so that the instruments move from
   * where they are, also after fast changes (design 5.2). `changeTransport()` of `app/` sets it,
   * and cuts the transports in which all animals stood still at the change.
   */
  readonly before: Transport | null;
  /**
   * The song time of the first sound of the last play: 0 from the song start, or the pause point
   * (design 5.2, 6.5). The count-in of the play runs before it. A seek during play moves it to
   * the seek point. 0 before the first play.
   */
  readonly startSec: number;
  /**
   * The time in seconds that the instruments stay up after a pause: `REST_TIMES.hold` (3 s), or
   * 0 after a pause in the count-in. Then the animals lower their instruments with no hold (5.2).
   */
  readonly holdSec: number;
  /**
   * For a play, the wall clock seconds from the play to its first sound: the count-in divided by
   * the speed. The lifts of the play end in this time (5.2). `Infinity` for no limit. A pause
   * keeps the value of its play.
   */
  readonly leadSec: number;
}

/** The mute and solo result of one seat (design 5.5, 6.6). */
export interface SeatAudibility {
  readonly audible: boolean;
  /** Wall clock seconds of the last change. */
  readonly changedAtWall: number;
  /**
   * The audibility before the last change, or `null` for a seat that sounded. A lift or a
   * lowering of each player starts from its height in it at the change, so that a seat that
   * sounds again soon after a mute lifts its instruments from where they are (design 5.5).
   * `changeAudibility()` of `app/` sets it, and cuts the states in which all players of the seat
   * stood still at the change.
   */
  readonly before: SeatAudibility | null;
}
