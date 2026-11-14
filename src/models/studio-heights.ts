import type { StudioBody } from './studio-format.ts';

/**
 * The head height and the seat height of each studio body (design 4.4), in meters, by the value
 * of `SpeciesParams.body`: the values of the module of each body in `src/models/studio/`. The
 * layout reads them before the app loads the bodies of a piece (design 7.2). The command
 * `pnpm studio-body` writes this file. Do not change it by hand.
 */
export const STUDIO_HEIGHTS = {
  'studio-badger': { headHeight: 0.27948, seatHeight: 0.123762 },
  'studio-bear': { headHeight: 0.346565, seatHeight: null },
  'studio-beaver': { headHeight: 0.310441, seatHeight: 0.062187 },
  'studio-cat': { headHeight: 0.339381, seatHeight: 0.222242 },
  'studio-deer': { headHeight: 0.287073, seatHeight: 0.351835 },
  'studio-dog': { headHeight: 0.41623, seatHeight: 0.190577 },
  'studio-elephant': { headHeight: 0.593073, seatHeight: 0.489256 },
  'studio-fox': { headHeight: 0.348496, seatHeight: 0.229563 },
  'studio-hippo': { headHeight: 0.502359, seatHeight: 0.235398 },
  'studio-mannequin': { headHeight: 0.453483, seatHeight: 0.239596 },
  'studio-monkey': { headHeight: 0.400355, seatHeight: 0.401445 },
  'studio-mouse': { headHeight: 0.221512, seatHeight: 0.099865 },
  'studio-panda': { headHeight: 0.499708, seatHeight: 0.171064 },
  'studio-penguin': { headHeight: 0.217538, seatHeight: 0.041045 },
  'studio-pig': { headHeight: 0.411694, seatHeight: 0.151539 },
  'studio-polar-bear': { headHeight: 0.422794, seatHeight: 0.267538 },
  'studio-rabbit': { headHeight: 0.304675, seatHeight: 0.228945 },
  'studio-rhino': { headHeight: 0.410817, seatHeight: 0.295958 },
  'studio-wolf': { headHeight: 0.369244, seatHeight: 0.276308 },
} as const satisfies Readonly<Record<string, Pick<StudioBody, 'headHeight' | 'seatHeight'>>>;
