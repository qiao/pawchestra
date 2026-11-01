/**
 * The size rule of the cello (design 4.6): the size of a cello for a seated body, as a real cellist
 * sizes a cello (`docs/reference/string-technique.md`, section 2.7). The cello stands at the place
 * of the shared hold (`BOWED_HOLDS.cello`, `fitCelloPlace()` of `src/pose/cello-place.ts`), and
 * its end pin fits the chest (`celloPinOf()`). The rule takes the largest size for which:
 *
 * - **Reach.** The left paw reaches the first position near the nut with the elbow bent to at most
 *   {@link CELLO_ELBOW}.
 * - **Chest.** The top of the back rests on the chest with an end pin of at least `minPin` of
 *   `CELLO_PLACE`.
 * - **Knees.** The middle of the lower bout is not below the knees, so that the knees can hold it.
 *
 * The size is then clamped to the real sizes ({@link REAL_CELLOS}).
 *
 * Usage: node tools/cello-size.ts [<species>,...]
 */
import { MathUtils, Quaternion, Vector3 } from 'three';

import { STRING_SCALES, VIOLIN } from '../src/models/instruments/strings.ts';
import { CELLO_PLACE, celloPinOf } from '../src/models/instruments/cello-fit.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import { SPECIES, SPECIES_IDS, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { BOWED_HOLDS, bowedRig, playingFrames } from '../src/pose/bowed-rig.ts';
import {
  BOWED_HANDS,
  MIDDLE_FINGER,
  createBowPlaces,
  instrumentAt,
  shoulderTurnL,
  stopHandAt,
  stringsAt,
} from '../src/pose/bowed.ts';
import { poseShoulder } from '../src/pose/ik.ts';
import { loadTestBodies } from '../src/models/studio-body.ts';

/**
 * The real sizes of the cello, as a factor of the cello of the app (a 4/4 of 1.2 m): the back
 * length of a 1/10 cello, 19.5 in, over the back length of a 4/4 cello, 30 in
 * (`docs/reference/string-technique.md`, section 2.7).
 */
export const REAL_CELLOS = { smallest: 19.5 / 30, largest: 1 } as const;

/**
 * The largest angle of the left elbow at the first position, between the upper arm and the
 * forearm, in radians: the angle of the dog at its accepted cello of 0.86 in the shared hold.
 */
export const CELLO_ELBOW = 65 * MathUtils.DEG2RAD;

/**
 * The place of the first position on the target `fingerboard`, from 0 at the nut to 1 at its end:
 * the first finger a whole tone above the open string (`docs/reference/string-technique.md`,
 * section 1.2), 1 − 2^(−2/12) of the string, over the fingerboard of 0.6875 of the string.
 */
export const FIRST_POSITION =
  (1 - 2 ** (-2 / 12)) / ((VIOLIN.nut - VIOLIN.fingerboardEnd) / (VIOLIN.nut - VIOLIN.bridge));

/** The source of the size of the rule: the limit that sets it, or the clamp. */
export type CelloSizeSource = 'reach' | 'chest' | 'knees' | 'smallest' | 'largest';

/** The size of a cello for a body. */
export interface CelloRule {
  /** The scale, as a factor of the cello of the app, clamped to {@link REAL_CELLOS}. */
  readonly scale: number;
  /** The limit or the clamp that sets the scale. */
  readonly source: CelloSizeSource;
  /** The largest scale of each limit, before the clamp. */
  readonly limits: Readonly<Record<'reach' | 'chest' | 'knees', number>>;
  /** The bend of the left elbow at the first position with the scale, in radians. */
  readonly elbow: number;
}

/** The scales of the search, from the smallest real cello to above the largest. */
const SEARCH = { low: 0.4, high: 1.3, steps: 18 } as const;

/**
 * Builds a cellist of a species with a cello of a scale, in memory. The source files do not
 * change.
 *
 * @param species The species.
 * @param scale The scale of the cello.
 * @returns The player.
 */
function cellistAt(species: SpeciesId, scale: number): PlayerModel {
  const params: SpeciesParams = SPECIES[species];
  const had = Object.hasOwn(params, 'celloScale');
  const old = params.celloScale;
  Reflect.set(params, 'celloScale', scale);
  try {
    return buildPlayer(species, 'cello');
  } finally {
    if (had) {
      Reflect.set(params, 'celloScale', old);
    } else {
      Reflect.deleteProperty(params, 'celloScale');
    }
  }
}

/**
 * Gives the bend of the left elbow when the left paw stops the first position, in the playing pose
 * of the shared hold: the angle between the upper arm and the forearm, π for a straight arm. A
 * place out of reach gives π.
 *
 * @param model The cellist.
 * @returns The angle, in radians.
 */
export function firstPositionElbow(model: PlayerModel): number {
  const rig = bowedRig(model, 'cello', BOWED_HOLDS.cello);
  const frames = playingFrames(rig);
  const { place, strings } = createBowPlaces();
  instrumentAt(rig, frames, 1, place);
  stringsAt(rig, place, strings);
  const shoulder = poseShoulder(
    rig.armL,
    frames.chest,
    rig.chestBind,
    shoulderTurnL(rig, 1, new Quaternion()),
  ).position;
  const hand = { wrist: new Vector3(), rotation: new Quaternion() };
  stopHandAt(rig, place, strings, FIRST_POSITION, BOWED_HANDS.curlL, 0, MIDDLE_FINGER, hand);
  const bind = rig.armL.bind;
  const upper = new Vector3(...bind.shoulder).distanceTo(new Vector3(...bind.elbow));
  const fore = new Vector3(...bind.elbow).distanceTo(new Vector3(...bind.wrist));
  const reach = hand.wrist.distanceTo(shoulder);
  const cos = (upper * upper + fore * fore - reach * reach) / (2 * upper * fore);
  return Math.acos(MathUtils.clamp(cos, -1, 1));
}

/**
 * Gives the height of the middle of the lower bout above the knees, in the place of the shared
 * hold: a quarter of the body from the tail end.
 *
 * @param model The cellist.
 * @param scale The scale of its cello.
 * @returns The height over the higher knee, in meters. Below 0, the lower bout is below the knees.
 */
function lowerBoutOverKnees(model: PlayerModel, scale: number): number {
  const size = STRING_SCALES.cello * scale;
  const pin = celloPinOf(model.body, scale);
  const axis = new Vector3(-Math.tan(CELLO_PLACE.left), 1, Math.tan(CELLO_PLACE.back)).normalize();
  const bout = axis.y * (pin + 0.25 * VIOLIN.bodyLength * size);
  const knee = (side: 'L' | 'R'): number =>
    model.skeleton.positions[boneIndex(`shin${side}`)]?.[1] ?? 0;
  return bout - Math.max(knee('L'), knee('R'));
}

/**
 * Finds the largest scale of the search at which a test passes, with a bisection after the first
 * step that fails. The test passes at small scales and fails at large ones.
 *
 * @param pass The test.
 * @returns The largest passing scale, `SEARCH.low` if none passes, or `SEARCH.high` if all pass.
 */
function largestPassing(pass: (scale: number) => boolean): number {
  const { low, high, steps } = SEARCH;
  let good: number = low;
  for (let k = 0; k <= steps; k++) {
    const scale = low + ((high - low) * k) / steps;
    if (!pass(scale)) {
      let bad = scale;
      for (let i = 0; i < 6; i++) {
        const middle = (good + bad) / 2;
        if (pass(middle)) {
          good = middle;
        } else {
          bad = middle;
        }
      }
      return good;
    }
    good = scale;
  }
  return high;
}

/**
 * Gives the cello size of the rule for a species (design 4.6).
 *
 * @param species The species.
 * @returns The size.
 */
export function celloRule(species: SpeciesId): CelloRule {
  const models = new Map<number, PlayerModel>();
  const at = (scale: number): PlayerModel => {
    const found = models.get(scale);
    if (found) {
      return found;
    }
    const model = cellistAt(species, scale);
    models.set(scale, model);
    return model;
  };
  const limits = {
    reach: largestPassing((s) => firstPositionElbow(at(s)) <= CELLO_ELBOW),
    chest: largestPassing((s) => celloPinOf(at(s).body, s) > CELLO_PLACE.minPin),
    knees: largestPassing((s) => lowerBoutOverKnees(at(s), s) >= 0),
  };
  const first =
    (['reach', 'chest', 'knees'] as const).toSorted((a, b) => limits[a] - limits[b])[0] ?? 'reach';
  const ruled = limits[first];
  const scale = MathUtils.clamp(ruled, REAL_CELLOS.smallest, REAL_CELLOS.largest);
  const source: CelloSizeSource =
    ruled < REAL_CELLOS.smallest ? 'smallest' : ruled > REAL_CELLOS.largest ? 'largest' : first;
  return { scale, source, limits, elbow: firstPositionElbow(cellistAt(species, scale)) };
}

/**
 * Prints the rule for each species of the command line, or for each species.
 */
async function main(): Promise<void> {
  await loadTestBodies();
  const asked = (process.argv[2] ?? '').split(',').filter((id) => id !== '');
  const species = asked.length > 0 ? asked.filter(isSpeciesId) : [...SPECIES_IDS];
  const deg = (a: number): string => (a * MathUtils.RAD2DEG).toFixed(0);
  for (const id of species) {
    const rule = celloRule(id);
    const { reach, chest, knees } = rule.limits;
    console.log(
      `${id.padEnd(10)} x${rule.scale.toFixed(3)} ${rule.source.padEnd(8)} reach ${reach.toFixed(3)} chest ${chest.toFixed(3)} knees ${knees.toFixed(3)} elbow ${deg(rule.elbow)}°`,
    );
  }
}

if (import.meta.main) {
  await main();
}
