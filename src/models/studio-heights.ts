import type { StudioBody } from './studio-format.ts';

/**
 * The head height and the seat height of each studio body (design 4.4), in meters, by the value
 * of `SpeciesParams.body`: the values of the module of each body in `src/models/studio/`. The
 * layout reads them before the app loads the bodies of a piece (design 7.2). The command
 * `pnpm studio-body` writes this file. Do not change it by hand.
 */
export const STUDIO_HEIGHTS = {
  'studio-badger': { headHeight: 0.243662, seatHeight: 0.059424 },
  'studio-bear': { headHeight: 0.357761, seatHeight: null },
  'studio-beaver': { headHeight: 0.310442, seatHeight: 0.072099 },
  'studio-cat': { headHeight: 0.339381, seatHeight: 0.201069 },
  'studio-deer': { headHeight: 0.356551, seatHeight: 0.243208 },
  'studio-dog': { headHeight: 0.327731, seatHeight: 0.150056 },
  'studio-elephant': { headHeight: 0.593073, seatHeight: 0.288117 },
  'studio-fox': { headHeight: 0.38, seatHeight: 0.257714 },
  'studio-hippo': { headHeight: 0.50236, seatHeight: 0.172691 },
  'studio-mannequin': { headHeight: 0.453483, seatHeight: 0.239596 },
  'studio-monkey': { headHeight: 0.333629, seatHeight: 0.305032 },
  'studio-mouse': { headHeight: 0.271642, seatHeight: 0.075798 },
  'studio-panda': { headHeight: 0.499711, seatHeight: 0.277426 },
  'studio-penguin': { headHeight: 0.217537, seatHeight: 0.063009 },
  'studio-pig': { headHeight: 0.411693, seatHeight: 0.127653 },
  'studio-polar-bear': { headHeight: 0.422794, seatHeight: 0.267538 },
  'studio-rabbit': { headHeight: 0.298502, seatHeight: 0.206664 },
  'studio-rhino': { headHeight: 0.388183, seatHeight: 0.100036 },
  'studio-wolf': { headHeight: 0.369244, seatHeight: 0.276308 },
} as const satisfies Readonly<Record<string, Pick<StudioBody, 'headHeight' | 'seatHeight'>>>;
