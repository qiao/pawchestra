/**
 * The size rule of the instrument of a recast pair (design 4.4, "Cast matrix", and 4.6): a recast
 * species plays a violin or a viola of the size of the rule of a violin shop (`ruleSize()` of
 * `tools/hold-reach.ts`), clamped to the real sizes ({@link REAL_LENGTHS}), and a cello of the size
 * of the cello rule (`celloRule()` of `tools/cello-size.ts`). The cast matrix and the recast roles
 * `<role>@<species>` of `pnpm arm-check`, `pnpm pose-depth`, and `pnpm close-views` take this size,
 * so that a run of a recast role measures the pair of the matrix with no `<species>.violinScale=`
 * by hand. A change of `--set` that names the scale of the species takes the place of the rule.
 */
import { celloRule } from './cello-size.ts';
import { REAL_VIOLINS, holdReach, ruleSize } from './hold-reach.ts';
import { findRole } from './fold-probe.ts';
import { setHolds } from './hold-sets.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import { isScaledInstrument } from '../src/models/instruments/types.ts';
import { SCALE_PARAMS, SPECIES } from '../src/models/species.ts';
import type { SpeciesId, SpeciesParams } from '../src/models/species.ts';

/**
 * The real total lengths of each instrument under the chin, from the tail end to the scroll, in
 * meters. The violin: the smallest and the largest violin of the size chart of a violin teacher
 * (`REAL_VIOLINS` of `tools/hold-reach.ts`). The viola: the body lengths of 10 to 16.5 inches of a
 * viola chart (`docs/reference/string-technique.md`, 1.10), times the 1.66 of the total length of
 * a full violin (0.59 m) to its body (0.356 m).
 */
export const REAL_LENGTHS = {
  violin: REAL_VIOLINS,
  viola: { smallest: 0.42, largest: 0.7 },
} as const;

/**
 * The source of the instrument scale of a pair. `own`: the own role of the species, with the scale
 * of the app. `rule`: the rule of a violin shop or the cello rule. `smallest`, `largest`: the rule,
 * clamped to a real size. `none`: no rule fits the instrument or the arm, so the scale is 1.
 * `fixed`: the app has no scale of the instrument. `set`: a change of `--set` or `--variant`.
 */
export type ScaleSource = 'own' | 'rule' | 'smallest' | 'largest' | 'none' | 'fixed' | 'set';

/** The instrument scale of a pair. */
export interface PairScale {
  /** The scale, as a factor of the instrument of the app. */
  readonly value: number;
  /** The source of the scale. */
  readonly source: ScaleSource;
}

/**
 * Gives the scale of the size rule of an instrument for a species, with the holds of now. The
 * rules pose the hold of the species (`holdOf()`), so a change of the hold changes the size. The
 * scale of the species does not change.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @returns The scale.
 */
export function ruleScale(species: SpeciesId, instrument: InstrumentId): PairScale {
  if (!isScaledInstrument(instrument)) {
    return { value: 1, source: 'fixed' };
  }
  const params: SpeciesParams = SPECIES[species];
  const param = SCALE_PARAMS[instrument];
  const had = Object.hasOwn(params, param);
  const old = params[param];
  Reflect.deleteProperty(params, param);
  try {
    if (instrument === 'cello') {
      const cello = celloRule(species);
      const source =
        cello.source === 'smallest' || cello.source === 'largest' ? cello.source : 'rule';
      return { value: cello.scale, source };
    }
    if (instrument !== 'violin' && instrument !== 'viola') {
      return { value: 1, source: 'none' };
    }
    const reach = holdReach(species, instrument, 'chair');
    const rule = ruleSize(reach);
    if (!rule) {
      return { value: 1, source: 'none' };
    }
    const real = REAL_LENGTHS[instrument];
    const perMeter = reach.scale / reach.length;
    return rule.length < real.smallest
      ? { value: real.smallest * perMeter, source: 'smallest' }
      : rule.length > real.largest
        ? { value: real.largest * perMeter, source: 'largest' }
        : { value: rule.scale, source: 'rule' };
  } finally {
    if (had) {
      Reflect.set(params, param, old);
    }
  }
}

/**
 * Sets the instrument scale of a recast species in memory to the size rule ({@link ruleScale}),
 * and gives it. Run it after the species takes the hold of the pair, because the rules pose the
 * hold.
 *
 * @param species The species.
 * @param instrument The instrument.
 * @returns The scale.
 */
export function setRecastScale(species: SpeciesId, instrument: InstrumentId): PairScale {
  const scale = ruleScale(species, instrument);
  if (isScaledInstrument(instrument)) {
    Reflect.set(SPECIES[species], SCALE_PARAMS[instrument], scale.value);
  }
  return scale;
}

/**
 * Gives the hold changes of a run of recast roles: the changes, then the scale of the size rule of
 * each recast role with a scaled instrument, such as `wolf.violinScale=0.65`, with the changes
 * applied ({@link ruleScale}). A role whose scale the changes name keeps it. The holds of now do not
 * change.
 *
 * @param roles The names of the roles, such as `violinist@wolf`.
 * @param changes The hold changes of `--set`, or `''`.
 * @returns The changes with the scales of the rule.
 */
export function recastChanges(roles: readonly string[], changes: string): string {
  const scales: string[] = [];
  const { undo } = setHolds(changes);
  try {
    for (const name of roles) {
      const role = findRole(name);
      if (role?.kind !== 'player' || !role.recast || !isScaledInstrument(role.instrument)) {
        continue;
      }
      const { species } = role.recast;
      const path = `${species}.${SCALE_PARAMS[role.instrument]}`;
      const named = [...changes.split(';'), ...scales].some((c) => c.trim().startsWith(`${path}=`));
      if (!named) {
        scales.push(`${path}=${ruleScale(species, role.instrument).value.toFixed(4)}`);
      }
    }
  } finally {
    undo();
  }
  return [changes, ...scales].filter((c) => c.trim() !== '').join(';');
}

/**
 * Sets the hold changes of a run of recast roles in memory: the changes and the scales of the size
 * rule ({@link recastChanges}).
 *
 * @param roles The names of the roles.
 * @param changes The hold changes of `--set`, or `''`.
 * @returns The changes, with a function that puts the old values back.
 */
export function setRecastHolds(
  roles: readonly string[],
  changes: string,
): ReturnType<typeof setHolds> {
  return setHolds(recastChanges(roles, changes));
}
