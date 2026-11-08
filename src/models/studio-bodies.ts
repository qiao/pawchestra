import type { StudioBodyName } from './studio-body.ts';
import type { StudioBody } from './studio-format.ts';
import { STUDIO_BADGER } from './studio/badger.ts';
import { STUDIO_BEAR } from './studio/bear.ts';
import { STUDIO_BEAVER } from './studio/beaver.ts';
import { STUDIO_CAT } from './studio/cat.ts';
import { STUDIO_DEER } from './studio/deer.ts';
import { STUDIO_DOG } from './studio/dog.ts';
import { STUDIO_ELEPHANT } from './studio/elephant.ts';
import { STUDIO_FOX } from './studio/fox.ts';
import { STUDIO_HIPPO } from './studio/hippo.ts';
import { STUDIO_MANNEQUIN } from './studio/mannequin.ts';
import { STUDIO_MONKEY } from './studio/monkey.ts';
import { STUDIO_MOUSE } from './studio/mouse.ts';
import { STUDIO_PANDA } from './studio/panda.ts';
import { STUDIO_PENGUIN } from './studio/penguin.ts';
import { STUDIO_PIG } from './studio/pig.ts';
import { STUDIO_POLAR_BEAR } from './studio/polar-bear.ts';
import { STUDIO_RABBIT } from './studio/rabbit.ts';
import { STUDIO_RHINO } from './studio/rhino.ts';
import { STUDIO_WOLF } from './studio/wolf.ts';

/**
 * All studio bodies (design 4.4), by the value of `SpeciesParams.body`, for the tools and the
 * tests in Node. The browser code gets an empty record in place of this module
 * (`BROWSER_STUDIO_BODIES` of `vite.config.ts`), so the first download holds no body. The app
 * loads the bodies of a piece before its layout, and the gallery loads all bodies
 * (`loadStudioBodies()` of `app/body-loads.ts`, design 7.2).
 */
export const STUDIO_BODIES: Readonly<Partial<Record<StudioBodyName, StudioBody>>> = {
  'studio-badger': STUDIO_BADGER,
  'studio-bear': STUDIO_BEAR,
  'studio-beaver': STUDIO_BEAVER,
  'studio-cat': STUDIO_CAT,
  'studio-deer': STUDIO_DEER,
  'studio-dog': STUDIO_DOG,
  'studio-elephant': STUDIO_ELEPHANT,
  'studio-fox': STUDIO_FOX,
  'studio-hippo': STUDIO_HIPPO,
  'studio-mannequin': STUDIO_MANNEQUIN,
  'studio-monkey': STUDIO_MONKEY,
  'studio-mouse': STUDIO_MOUSE,
  'studio-panda': STUDIO_PANDA,
  'studio-penguin': STUDIO_PENGUIN,
  'studio-pig': STUDIO_PIG,
  'studio-rhino': STUDIO_RHINO,
  'studio-polar-bear': STUDIO_POLAR_BEAR,
  'studio-rabbit': STUDIO_RABBIT,
  'studio-wolf': STUDIO_WOLF,
} satisfies Readonly<Record<StudioBodyName, StudioBody>>;
