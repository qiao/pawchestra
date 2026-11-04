/**
 * The size rule of the trumpet, the clarinet, and the flute (design 4.6): the size of the
 * instrument for a seated body, as a child plays a smaller instrument. The instrument sits at the
 * mouth in the hold of the species (`windHoldOf()`), and shrinks toward the mouth. The rule takes
 * the largest size at which each palm reaches its grip in the playing pose with at most
 * {@link WIND_REACH_SHARE} of its arm (`windReach()` of `tools/hold-reach.ts`), so that each elbow
 * keeps a bend. The size is then clamped to the real sizes ({@link REAL_WIND_SIZES}). When no real
 * size passes, the rule takes the real size with the nearest grips.
 *
 * Usage: node tools/wind-size.ts <trumpet | clarinet | flute> [<species>,...]
 */
import { BRASS } from '../src/models/instruments/brass.ts';
import { WOODWINDS } from '../src/models/instruments/woodwinds.ts';
import { SCALE_PARAMS, SPECIES, SPECIES_IDS, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';
import { windReach } from './hold-reach.ts';

/** The winds with a size rule. */
export type SizedWind = 'trumpet' | 'clarinet' | 'flute';

/** The winds with a size rule, in the order of the report. */
export const SIZED_WINDS = ['trumpet', 'clarinet', 'flute'] as const satisfies SizedWind[];

/**
 * Tells if an instrument has the size rule of the winds.
 *
 * @param instrument The instrument.
 * @returns True for one of {@link SIZED_WINDS}.
 */
export function isSizedWind(instrument: string): instrument is SizedWind {
  return SIZED_WINDS.some((wind) => wind === instrument);
}

/**
 * The share of the real length of a trumpet, a clarinet, or a flute that the app shows, as for the
 * violin (`BRASS`, `WOODWINDS`).
 */
const APP_SHARE = 0.85;

/**
 * The real sizes of each wind, as a factor of the instrument of the app, which stands for the
 * standard instrument at {@link APP_SHARE} of its real length (`docs/reference/wind-technique.md`,
 * section 4.2, "The size rule of the winds"). The smallest size is the smallest instrument with the
 * same hold and fingering: a pocket trumpet of 24 cm, an E-flat clarinet of 49 cm, and a piccolo
 * of 33 cm. The largest size is the size of the app, because a player with long arms bends the
 * elbows more, and no larger instrument has the same hold.
 */
export const REAL_WIND_SIZES = {
  trumpet: { smallest: (0.24 * APP_SHARE) / BRASS.trumpet.length, largest: 1 },
  clarinet: { smallest: (0.49 * APP_SHARE) / WOODWINDS.clarinet.length, largest: 1 },
  flute: { smallest: (0.33 * APP_SHARE) / WOODWINDS.flute.length, largest: 1 },
} as const satisfies Readonly<Record<SizedWind, { smallest: number; largest: number }>>;

/**
 * The largest distance from the shoulder joint to the grip of a palm in the playing pose, as a
 * share of the arm: the share of the monkey at its accepted trumpet of 0.65, the most stretched
 * own wind player.
 */
export const WIND_REACH_SHARE = 0.95;

/** The step of the search of the scale, from the largest real size down. */
const STEP = 0.01;

/**
 * The source of the size of the rule. `rule`: the largest size at which each palm reaches its
 * grip. `largest`: the largest real size, which each palm reaches. `smallest`, `nearest`: no real
 * size passes, and the size with the nearest grips is the smallest real size, or another one.
 */
export type WindSizeSource = 'rule' | 'largest' | 'smallest' | 'nearest';

/** The size of a wind for a body. */
export interface WindRule {
  /** The scale, as a factor of the instrument of the app, within {@link REAL_WIND_SIZES}. */
  readonly scale: number;
  /** The source of the scale. */
  readonly source: WindSizeSource;
  /** The larger share of the two palms with the scale: the distance to the grip over the arm. */
  readonly share: number;
}

/**
 * Gives the larger share of the two palms of a species with a wind at a scale: the distance from
 * the shoulder joint to the grip in the playing pose over the arm. The scale of the species
 * changes in memory for the measure.
 *
 * @param species The species.
 * @param instrument The wind.
 * @param scale The scale of the wind.
 * @returns The share.
 */
function shareAt(species: SpeciesId, instrument: SizedWind, scale: number): number {
  Reflect.set(SPECIES[species], SCALE_PARAMS[instrument], scale);
  const reach = windReach(species, instrument, 'chair');
  return Math.max(reach.L.play / reach.L.arm, reach.R.play / reach.R.arm);
}

/**
 * Gives the size rule of a wind for a species, with the hold of now (`windHoldOf()`). The scale
 * of the species does not change.
 *
 * @param species The species.
 * @param instrument The wind.
 * @returns The size.
 */
export function windRule(species: SpeciesId, instrument: SizedWind): WindRule {
  const params: SpeciesParams = SPECIES[species];
  const param = SCALE_PARAMS[instrument];
  const had = Object.hasOwn(params, param);
  const old = params[param];
  const real = REAL_WIND_SIZES[instrument];
  try {
    let nearest: Pick<WindRule, 'scale' | 'share'> = { scale: real.largest, share: Infinity };
    const steps = Math.floor((real.largest - real.smallest) / STEP + 1e-9);
    for (let i = 0; i <= steps; i += 1) {
      const scale = i === steps ? real.smallest : real.largest - i * STEP;
      const share = shareAt(species, instrument, scale);
      if (share <= WIND_REACH_SHARE) {
        return { scale, source: i === 0 ? 'largest' : 'rule', share };
      }
      if (share < nearest.share) {
        nearest = { scale, share };
      }
    }
    const source = nearest.scale === real.smallest ? 'smallest' : 'nearest';
    return { ...nearest, source };
  } finally {
    if (had) {
      Reflect.set(params, param, old);
    } else {
      Reflect.deleteProperty(params, param);
    }
  }
}

/**
 * Prints the size rule of a wind for each species, or for the species of the list.
 */
function main(): void {
  const instrument = process.argv[2] ?? '';
  if (!isSizedWind(instrument)) {
    throw new Error('Usage: node tools/wind-size.ts <trumpet | clarinet | flute> [<species>,...]');
  }
  const list = (process.argv[3] ?? '').split(',').filter((name) => name !== '');
  const species = list.length > 0 ? list.filter(isSpeciesId) : SPECIES_IDS;
  for (const id of species) {
    const rule = windRule(id, instrument);
    console.log(
      `${id}: ${instrument} ${rule.scale.toFixed(2)} (${rule.source}), share ${rule.share.toFixed(3)}`,
    );
  }
}

if (import.meta.main) {
  main();
}
