import type { Body } from './body-format.ts';

/**
 * The head height and the seat height of each body (design 4.4), in meters, by the value
 * of `SpeciesParams.body`: the values of the module of each body in `src/models/bodies/`. The
 * layout reads them before the app loads the bodies of a piece (design 7.2). The command
 * `pnpm body-module` writes this file. Do not change it by hand.
 */
export const BODY_HEIGHTS = {
  badger: { headHeight: 0.27948, seatHeight: 0.123762 },
  bear: { headHeight: 0.346565, seatHeight: null },
  beaver: { headHeight: 0.310441, seatHeight: 0.062187 },
  cat: { headHeight: 0.339381, seatHeight: 0.222242 },
  deer: { headHeight: 0.287073, seatHeight: 0.351835 },
  dog: { headHeight: 0.41623, seatHeight: 0.190577 },
  elephant: { headHeight: 0.593073, seatHeight: 0.489256 },
  fox: { headHeight: 0.348496, seatHeight: 0.229563 },
  hippo: { headHeight: 0.502359, seatHeight: 0.235398 },
  mannequin: { headHeight: 0.453483, seatHeight: 0.239596 },
  monkey: { headHeight: 0.400355, seatHeight: 0.401445 },
  mouse: { headHeight: 0.221512, seatHeight: 0.099865 },
  panda: { headHeight: 0.499708, seatHeight: 0.171064 },
  penguin: { headHeight: 0.217538, seatHeight: 0.041045 },
  pig: { headHeight: 0.411694, seatHeight: 0.125656 },
  'polar-bear': { headHeight: 0.422794, seatHeight: 0.267538 },
  rabbit: { headHeight: 0.304675, seatHeight: 0.228945 },
  rhino: { headHeight: 0.492665, seatHeight: 0.295958 },
  wolf: { headHeight: 0.369244, seatHeight: 0.276308 },
} as const satisfies Readonly<Record<string, Pick<Body, 'headHeight' | 'seatHeight'>>>;
