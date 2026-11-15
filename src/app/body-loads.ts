import { CONDUCTOR, speciesOf } from '../models/cast.ts';
import { SPECIES } from '../models/species.ts';
import { addBody, hasBody, isBodyName } from '../models/body.ts';
import type { BodyName } from '../models/body.ts';
import type { Body } from '../models/body-format.ts';
import type { Steps } from '../score/steps.ts';
import type { Score } from '../score/types.ts';

/**
 * The load of the module of each body (design 7.2), by the value of `SpeciesParams.body`.
 * Each module is a chunk of its own, so the first download holds no body.
 */
const BODY_LOADS = {
  badger: async () => (await import('../models/bodies/badger.ts')).BODY_BADGER,
  bear: async () => (await import('../models/bodies/bear.ts')).BODY_BEAR,
  beaver: async () => (await import('../models/bodies/beaver.ts')).BODY_BEAVER,
  cat: async () => (await import('../models/bodies/cat.ts')).BODY_CAT,
  deer: async () => (await import('../models/bodies/deer.ts')).BODY_DEER,
  dog: async () => (await import('../models/bodies/dog.ts')).BODY_DOG,
  elephant: async () => (await import('../models/bodies/elephant.ts')).BODY_ELEPHANT,
  fox: async () => (await import('../models/bodies/fox.ts')).BODY_FOX,
  hippo: async () => (await import('../models/bodies/hippo.ts')).BODY_HIPPO,
  mannequin: async () => (await import('../models/bodies/mannequin.ts')).BODY_MANNEQUIN,
  monkey: async () => (await import('../models/bodies/monkey.ts')).BODY_MONKEY,
  mouse: async () => (await import('../models/bodies/mouse.ts')).BODY_MOUSE,
  panda: async () => (await import('../models/bodies/panda.ts')).BODY_PANDA,
  penguin: async () => (await import('../models/bodies/penguin.ts')).BODY_PENGUIN,
  pig: async () => (await import('../models/bodies/pig.ts')).BODY_PIG,
  'polar-bear': async () => (await import('../models/bodies/polar-bear.ts')).BODY_POLAR_BEAR,
  rabbit: async () => (await import('../models/bodies/rabbit.ts')).BODY_RABBIT,
  rhino: async () => (await import('../models/bodies/rhino.ts')).BODY_RHINO,
  wolf: async () => (await import('../models/bodies/wolf.ts')).BODY_WOLF,
} as const satisfies Readonly<Record<BodyName, () => Promise<Body>>>;

/** The names of all bodies. */
const ALL_BODIES: readonly BodyName[] = Object.keys(BODY_LOADS).filter(isBodyName);

/**
 * Loads the modules of bodies that are not loaded, so that a player can have them (design
 * 7.2). Each module loads one time. In Node, all bodies are loaded already.
 *
 * @param names The bodies. All bodies when it is not given, for the gallery.
 */
export async function loadBodies(names: readonly BodyName[] = ALL_BODIES): Promise<void> {
  const loads = names
    .filter((name) => !hasBody(name))
    .map(async (name) => {
      addBody(name, await BODY_LOADS[name]());
    });
  await Promise.all(loads);
}

/**
 * Gives the bodies that a score casts (design 4.3): the body of the conductor, and the body
 * of the species of each seat with players.
 *
 * @param score The score.
 * @returns Each body one time.
 */
export function castBodies(score: Score): BodyName[] {
  const names = new Set<BodyName>([SPECIES[CONDUCTOR.species].body]);
  for (const seat of score.seats) {
    if (seat.section !== 'sound-only' && seat.playerCount > 0) {
      names.add(SPECIES[speciesOf(seat.section, seat.indexInSection)].body);
    }
  }
  return [...names];
}

/**
 * Loads the bodies that a score casts and that are not loaded, as one step of a build
 * (design 7.2). The step yields the promise of the load, and `runSliced()` waits for it. With all
 * bodies loaded, as in Node, the step yields nothing.
 *
 * @param score The score.
 * @returns The steps.
 */
export function* castBodiesSteps(score: Score): Steps<void> {
  const missing = castBodies(score).filter((name) => !hasBody(name));
  if (missing.length > 0) {
    yield loadBodies(missing);
  }
}
