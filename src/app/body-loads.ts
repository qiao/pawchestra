import { CONDUCTOR, speciesOf } from '../models/cast.ts';
import { SPECIES } from '../models/species.ts';
import { addStudioBody, hasStudioBody, isStudioBodyName } from '../models/studio-body.ts';
import type { StudioBodyName } from '../models/studio-body.ts';
import type { StudioBody } from '../models/studio-format.ts';
import type { Steps } from '../score/steps.ts';
import type { Score } from '../score/types.ts';

/**
 * The load of the module of each studio body (design 7.2), by the value of `SpeciesParams.body`.
 * Each module is a chunk of its own, so the first download holds no body.
 */
const BODY_LOADS = {
  'studio-badger': async () => (await import('../models/studio/badger.ts')).STUDIO_BADGER,
  'studio-bear': async () => (await import('../models/studio/bear.ts')).STUDIO_BEAR,
  'studio-beaver': async () => (await import('../models/studio/beaver.ts')).STUDIO_BEAVER,
  'studio-cat': async () => (await import('../models/studio/cat.ts')).STUDIO_CAT,
  'studio-deer': async () => (await import('../models/studio/deer.ts')).STUDIO_DEER,
  'studio-dog': async () => (await import('../models/studio/dog.ts')).STUDIO_DOG,
  'studio-elephant': async () => (await import('../models/studio/elephant.ts')).STUDIO_ELEPHANT,
  'studio-fox': async () => (await import('../models/studio/fox.ts')).STUDIO_FOX,
  'studio-hippo': async () => (await import('../models/studio/hippo.ts')).STUDIO_HIPPO,
  'studio-mannequin': async () => (await import('../models/studio/mannequin.ts')).STUDIO_MANNEQUIN,
  'studio-monkey': async () => (await import('../models/studio/monkey.ts')).STUDIO_MONKEY,
  'studio-mouse': async () => (await import('../models/studio/mouse.ts')).STUDIO_MOUSE,
  'studio-panda': async () => (await import('../models/studio/panda.ts')).STUDIO_PANDA,
  'studio-penguin': async () => (await import('../models/studio/penguin.ts')).STUDIO_PENGUIN,
  'studio-pig': async () => (await import('../models/studio/pig.ts')).STUDIO_PIG,
  'studio-polar-bear': async () =>
    (await import('../models/studio/polar-bear.ts')).STUDIO_POLAR_BEAR,
  'studio-rabbit': async () => (await import('../models/studio/rabbit.ts')).STUDIO_RABBIT,
  'studio-rhino': async () => (await import('../models/studio/rhino.ts')).STUDIO_RHINO,
  'studio-wolf': async () => (await import('../models/studio/wolf.ts')).STUDIO_WOLF,
} as const satisfies Readonly<Record<StudioBodyName, () => Promise<StudioBody>>>;

/** The names of all studio bodies. */
const ALL_BODIES: readonly StudioBodyName[] = Object.keys(BODY_LOADS).filter(isStudioBodyName);

/**
 * Loads the modules of studio bodies that are not loaded, so that a player can have them (design
 * 7.2). Each module loads one time. In Node, all bodies are loaded already.
 *
 * @param names The studio bodies. All bodies when it is not given, for the gallery.
 */
export async function loadStudioBodies(
  names: readonly StudioBodyName[] = ALL_BODIES,
): Promise<void> {
  const loads = names
    .filter((name) => !hasStudioBody(name))
    .map(async (name) => {
      addStudioBody(name, await BODY_LOADS[name]());
    });
  await Promise.all(loads);
}

/**
 * Gives the studio bodies that a score casts (design 4.3): the body of the conductor, and the body
 * of the species of each seat with players.
 *
 * @param score The score.
 * @returns Each body one time.
 */
export function castBodies(score: Score): StudioBodyName[] {
  const names = new Set<StudioBodyName>([SPECIES[CONDUCTOR.species].body]);
  for (const seat of score.seats) {
    if (seat.section !== 'sound-only' && seat.playerCount > 0) {
      names.add(SPECIES[speciesOf(seat.section, seat.indexInSection)].body);
    }
  }
  return [...names];
}

/**
 * Loads the studio bodies that a score casts and that are not loaded, as one step of a build
 * (design 7.2). The step yields the promise of the load, and `runSliced()` waits for it. With all
 * bodies loaded, as in Node, the step yields nothing.
 *
 * @param score The score.
 * @returns The steps.
 */
export function* castBodiesSteps(score: Score): Steps<void> {
  const missing = castBodies(score).filter((name) => !hasStudioBody(name));
  if (missing.length > 0) {
    yield loadStudioBodies(missing);
  }
}
