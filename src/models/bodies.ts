import type { BodyName } from './body.ts';
import type { Body } from './body-format.ts';
import { BODY_BADGER } from './bodies/badger.ts';
import { BODY_BEAR } from './bodies/bear.ts';
import { BODY_BEAVER } from './bodies/beaver.ts';
import { BODY_CAT } from './bodies/cat.ts';
import { BODY_DEER } from './bodies/deer.ts';
import { BODY_DOG } from './bodies/dog.ts';
import { BODY_ELEPHANT } from './bodies/elephant.ts';
import { BODY_FOX } from './bodies/fox.ts';
import { BODY_HIPPO } from './bodies/hippo.ts';
import { BODY_MANNEQUIN } from './bodies/mannequin.ts';
import { BODY_MONKEY } from './bodies/monkey.ts';
import { BODY_MOUSE } from './bodies/mouse.ts';
import { BODY_PANDA } from './bodies/panda.ts';
import { BODY_PENGUIN } from './bodies/penguin.ts';
import { BODY_PIG } from './bodies/pig.ts';
import { BODY_POLAR_BEAR } from './bodies/polar-bear.ts';
import { BODY_RABBIT } from './bodies/rabbit.ts';
import { BODY_RHINO } from './bodies/rhino.ts';
import { BODY_WOLF } from './bodies/wolf.ts';

/**
 * All bodies (design 4.4), by the value of `SpeciesParams.body`, for the tools and the
 * tests in Node. The browser code gets an empty record in place of this module
 * (`BROWSER_BODIES` of `vite.config.ts`), so the first download holds no body. The app
 * loads the bodies of a piece before its layout, and the gallery loads all bodies
 * (`loadBodies()` of `app/body-loads.ts`, design 7.2).
 */
export const BODIES: Readonly<Partial<Record<BodyName, Body>>> = {
  badger: BODY_BADGER,
  bear: BODY_BEAR,
  beaver: BODY_BEAVER,
  cat: BODY_CAT,
  deer: BODY_DEER,
  dog: BODY_DOG,
  elephant: BODY_ELEPHANT,
  fox: BODY_FOX,
  hippo: BODY_HIPPO,
  mannequin: BODY_MANNEQUIN,
  monkey: BODY_MONKEY,
  mouse: BODY_MOUSE,
  panda: BODY_PANDA,
  penguin: BODY_PENGUIN,
  pig: BODY_PIG,
  rhino: BODY_RHINO,
  'polar-bear': BODY_POLAR_BEAR,
  rabbit: BODY_RABBIT,
  wolf: BODY_WOLF,
} satisfies Readonly<Record<BodyName, Body>>;
