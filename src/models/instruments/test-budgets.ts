import type { InstrumentId } from './types.ts';

/**
 * The largest triangle count of each instrument with all its pieces (design 4.4, source meshes).
 * Only tests read it.
 */
export const INSTRUMENT_BUDGETS = {
  violin: 1200,
  viola: 1200,
  cello: 1200,
  contrabass: 1200,
  harp: 800,
  piano: 2000,
  'choir-folder': 800,
  flute: 800,
  oboe: 800,
  clarinet: 800,
  bassoon: 800,
  horn: 1500,
  trumpet: 1000,
  trombone: 1000,
  tuba: 1200,
  timpani: 2400,
  'bass-drum': 800,
  'snare-drum': 1000,
  cymbals: 1000,
  'small-percussion': 800,
  xylophone: 1000,
  baton: 800,
} as const satisfies Readonly<Record<InstrumentId, number>>;
