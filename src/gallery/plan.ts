import { Vector3 } from 'three';

import type { PlayerPlace } from '../models/layout.ts';
import type { PlayerModel } from '../models/player.ts';
import { boneIndex } from '../models/rig.ts';
import { toVec3 } from '../models/tuples.ts';
import type { Vec3 } from '../models/tuples.ts';
import { loudnessOf } from '../pose/loudness.ts';
import {
  createRigCache,
  prepareConductor,
  preparePlayer,
  pulseTimes,
  seatSeedOf,
} from '../pose/plan.ts';
import type { PosePlan } from '../pose/plan.ts';
import { mixHash } from '../pose/random.ts';
import type { Beat, PlayerNote } from '../score/types.ts';
import type { TestNote } from './notes.ts';

/** The velocity of each test note: mezzo forte. */
export const TEST_VELOCITY = 100;

/** The time of one test beat: 120 BPM in 4/4 (design 7.1). */
const TEST_BEAT_SEC = 0.5;

/** The seed of the gallery pose. */
const GALLERY_SEED = 1;

/** One animal of the gallery: its model and its place on the gallery floor. */
export interface GalleryAnimal {
  readonly model: PlayerModel;
  /** The place and the cast. A player has its own seat, with the index of the player. */
  readonly place: PlayerPlace;
}

/**
 * Makes the notes of one gallery player from the test notes (design 7.1).
 *
 * @param notes The test notes.
 * @param seatIndex The seat of the player.
 * @returns The notes, sorted by start, with the velocity {@link TEST_VELOCITY}.
 */
export function testPlayerNotes(notes: readonly TestNote[], seatIndex: number): PlayerNote[] {
  return notes
    .map((note): PlayerNote => ({
      seatIndex,
      player: 0,
      pitch: note.key,
      velocity: TEST_VELOCITY,
      startSec: note.start,
      endSec: note.start + note.length,
      technique: 'normal',
      synthChannel: 0,
    }))
    .toSorted((a, b) => a.startSec - b.startSec);
}

/**
 * Makes the beats of the conductor for the test notes: 4/4 at 120 BPM from the time 0. The beats
 * end before the end of the last note, as in a score (design 5.4).
 *
 * @param notes The test notes.
 * @returns The beats.
 */
export function testBeats(notes: readonly TestNote[]): Beat[] {
  const end = Math.max(0, ...notes.map((note) => note.start + note.length));
  const count = Math.ceil(end / TEST_BEAT_SEC);
  return Array.from({ length: count }, (_, k) => ({
    timeSec: k * TEST_BEAT_SEC,
    indexInBar: k % 4,
    beatsInBar: 4,
    pattern: 4,
    pulse: true,
  }));
}

/**
 * Gives a point 10 m in front of the head of an animal. A look at it turns the head by nothing,
 * so the gallery animals look straight ahead.
 *
 * @param animal The animal.
 * @returns The point on the gallery floor axes.
 */
function aheadOf(animal: GalleryAnimal): Vec3 {
  const { model, place } = animal;
  const head = new Vector3(...(model.skeleton.positions[boneIndex('head')] ?? [0, 0, 0]));
  return toVec3(
    head
      .add(new Vector3(0, 0, -10))
      .applyAxisAngle(new Vector3(0, 1, 0), place.facing)
      .add(new Vector3(...place.position)),
  );
}

/**
 * Calculates the pose plan of the gallery (design 7.1): each player plays the test notes, and the
 * bear conducts them. A page that keeps no bear (the query `only`) has no conductor, and its
 * players play alone. The gallery has no `Score`, so it calls `preparePlayer()` and
 * `prepareConductor()` directly.
 *
 * @param players The players, each in its own seat.
 * @param conductor The bear with the baton, or `null` for no conductor. Its cast is not used.
 * @param notes The test notes.
 * @returns The plan for `poseAt()`.
 */
export function galleryPlan(
  players: readonly GalleryAnimal[],
  conductor: GalleryAnimal | null,
  notes: readonly TestNote[],
): PosePlan {
  const rigs = createRigCache();
  const loudness = loudnessOf(TEST_VELOCITY);
  const all: PlayerNote[] = [];
  const beats = testBeats(notes);
  const beatTimes = Float64Array.from(beats, (b) => b.timeSec);
  const plans = players.map((animal, i) => {
    const own = testPlayerNotes(notes, animal.place.cast.seatIndex);
    all.push(...own);
    return preparePlayer(
      {
        model: animal.model,
        place: animal.place,
        notes: own,
        loudness: own.map(() => loudness),
        beats: beatTimes,
        lookTarget: aheadOf(animal),
        seatSeed: seatSeedOf(GALLERY_SEED, animal.place.cast.seatIndex),
      },
      mixHash(GALLERY_SEED, i),
      rigs,
    );
  });
  const sorted = all.toSorted((a, b) => a.startSec - b.startSec);
  return {
    players: plans,
    conductor: conductor
      ? prepareConductor(
          {
            model: conductor.model,
            place: conductor.place,
            beats,
            notes: sorted,
            loudness: sorted.map(() => loudness),
            seatCount: players.length,
            players: players.map((animal) => animal.place),
          },
          mixHash(GALLERY_SEED, -1),
        )
      : null,
    leader: null,
    beats: beatTimes,
    pulses: pulseTimes(beats),
  };
}
