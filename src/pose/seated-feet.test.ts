import { describe, expect, it } from 'vitest';

import { galleryPlan } from '../gallery/plan.ts';
import type { GalleryAnimal } from '../gallery/plan.ts';
import { CONDUCTOR, SECTION_INSTRUMENTS, SECTION_SPECIES } from '../models/cast.ts';
import type { PlayingSection } from '../models/cast.ts';
import { INSTRUMENT_SUPPORTS, buildPlayer, stanceOn } from '../models/player.ts';
import type { Support } from '../models/props.ts';
import { boneIndex } from '../models/rig.ts';
import { SPECIES } from '../models/species.ts';
import type { SpeciesId } from '../models/species.ts';
import type { InstrumentId } from '../models/instruments/types.ts';
import { createScenePose, poseAt } from './pose-at.ts';
import { poseSkeleton } from './test-kinematics.ts';
import type { PosedSkeleton } from './test-kinematics.ts';
import { NOT_STARTED } from './test-scene.ts';
import { posedCorner } from './test-skin.ts';

/** One seated animal of the test: a species with an instrument of its section on its seat. */
interface SeatedCast {
  readonly species: SpeciesId;
  readonly instrument: InstrumentId;
  readonly support: Support;
  readonly label: string;
}

/** Each species with each instrument of its section that it plays on a seat (design 4.5, 4.6). */
const SEATED: readonly SeatedCast[] = Object.keys(SECTION_SPECIES)
  .filter((section): section is PlayingSection => section in SECTION_SPECIES)
  .flatMap((section) =>
    SECTION_SPECIES[section].flatMap((species) =>
      SECTION_INSTRUMENTS[section].flatMap((instrument): SeatedCast[] => {
        const support = INSTRUMENT_SUPPORTS[instrument];
        const stance = stanceOn(support, SPECIES[species]);
        if (stance.kind !== 'seated') {
          return [];
        }
        return [
          {
            species,
            instrument,
            support,
            label: `${species} ${instrument} (${support})`,
          },
        ];
      }),
    ),
  );

/** The wall times of the samples: the idle motion breathes and sways the body. */
const WALL_TIMES = [10, 13.7, 21.1, 29.3];

/** The largest gap from the lowest point of a foot to the floor, in meters. */
const FOOT_GAP = 0.02;

/** The rounding error of the skin that counts as on the floor, in meters. */
const ROUNDING = 1e-6;

/**
 * Gives the height of the lowest point of each foot of a posed player: the lowest corner of the
 * lower leg of each side (the shin and the foot).
 *
 * @param posed The posed player.
 * @returns The heights of the left and the right foot, in meters.
 */
function soles(posed: PosedSkeleton): readonly [left: number, right: number] {
  const { mesh } = posed.model;
  const lowest = (side: 'L' | 'R'): number => {
    const bones = new Set([boneIndex(`shin${side}`), boneIndex(`foot${side}`)]);
    let low = Infinity;
    for (let c = 0; c < mesh.bones.length; c++) {
      if (bones.has(mesh.bones[c] ?? -1)) {
        low = Math.min(low, posedCorner(posed, c)[1]);
      }
    }
    return low;
  };
  return [lowest('L'), lowest('R')];
}

/**
 * Finds the feet of the seated animals that float above the floor or go into it, in the rest pose
 * at each wall time.
 *
 * @returns One line for each foot out of place.
 */
function feetOutOfPlace(): string[] {
  const animal = (cast: SeatedCast, seatIndex: number): GalleryAnimal => ({
    model: buildPlayer(cast.species, cast.instrument, 4, cast.support),
    place: {
      position: [seatIndex * 3, 0, 0],
      facing: Math.PI,
      cast: { ...cast, seatIndex, player: 0, kettles: 4 },
    },
  });
  const players = SEATED.map(animal);
  const conductor: GalleryAnimal = {
    model: buildPlayer(CONDUCTOR.species, CONDUCTOR.instrument),
    place: {
      position: [players.length * 3, 0, 0],
      facing: Math.PI,
      cast: { ...CONDUCTOR, support: 'stand', seatIndex: players.length, player: 0, kettles: 4 },
    },
  };
  const plan = galleryPlan(players, conductor, []);
  const buffer = createScenePose(plan);

  const faults = new Set<string>();
  for (const wall of WALL_TIMES) {
    const scene = poseAt(plan, 0, wall, NOT_STARTED, [], buffer);
    for (const [i, { model }] of players.entries()) {
      const pose = scene.players[i];
      const cast = SEATED[i];
      if (!pose || !cast) {
        throw new Error(`The seated player ${i} has no pose.`);
      }

      const [left, right] = soles(poseSkeleton(model, pose));
      for (const [side, sole] of [
        ['left', left],
        ['right', right],
      ] as const) {
        if (sole < -ROUNDING || sole > FOOT_GAP) {
          faults.add(`${cast.label}: the ${side} foot is ${sole.toFixed(4)} m above the floor`);
        }
      }
    }
  }
  return [...faults];
}

describe('the feet of the seated players (design 4.5)', () => {
  it('covers each seat and each species that sits', () => {
    expect(new Set(SEATED.map((cast) => cast.support))).toEqual(
      new Set(['chair', 'stool', 'bench']),
    );
    expect(SEATED.some((cast) => cast.species === 'fox-red')).toBe(true);
  });

  it('rests each foot on the floor', () => {
    // The feet of a rigged body can float above the floor on a chair, 0.0725 m (right) and
    // 0.0882 m (left) on the red fox. The model sheet `fox-views.png` lets the feet hang.
    expect(feetOutOfPlace()).toEqual([]);
  });
});
