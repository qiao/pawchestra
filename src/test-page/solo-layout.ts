import type { PlayerCast } from '../models/cast.ts';
import { reachOn } from '../models/footprint.ts';
import { layoutObstacles, layoutSceneSteps } from '../models/layout-scene.ts';
import type { SceneLayout } from '../models/layout.ts';
import type { ModelCache } from '../models/model-cache.ts';
import type { Support } from '../models/props.ts';
import type { SpeciesId } from '../models/species.ts';
import type { Steps } from '../score/steps.ts';
import type { Score } from '../score/types.ts';

/** The species and the support that a role of the test page gives to the player of a score. */
export interface SoloCast {
  readonly species: SpeciesId;
  readonly support: Support;
}

/**
 * Gives the middle of the footprint boxes of the players of a layout on the stage top.
 *
 * @param layout The layout.
 * @param models The player models.
 * @returns The x and the z of the middle, in meters.
 */
function middleOf(layout: SceneLayout, models: ModelCache): readonly [x: number, z: number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const box of layoutObstacles({ ...layout, conductor: null }, models).flatMap(
    (o) => o.boxes,
  )) {
    const rx = reachOn(box, 1, 0);
    const rz = reachOn(box, 0, 1);
    x0 = Math.min(x0, box.x - rx);
    x1 = Math.max(x1, box.x + rx);
    z0 = Math.min(z0, box.z - rz);
    z1 = Math.max(z1, box.z + rz);
  }
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}

/**
 * Calculates the layout of a score with one player for the test page (design 7.1, "Test page"),
 * in steps. The layout of the app puts the player alone at the stage center (design 4.2). A role
 * with another species or another support then takes the place, as a recast role of the role
 * tools does (`recastScene()` of `pose/test-scene.ts`). The player moves by the change of the
 * middle of its footprint, so that it stays at the stage center.
 *
 * @param score The score of the test phrase, with one player.
 * @param role The species and the support of the role.
 * @param models The player models, which the pose plan and the scene share.
 * @returns The steps, which return the layout.
 * @throws Error if the score has not exactly one player.
 */
export function* soloLayoutSteps(
  score: Score,
  role: SoloCast,
  models: ModelCache,
): Steps<SceneLayout> {
  const layout = yield* layoutSceneSteps(score, models);
  const [place, ...others] = layout.players;
  if (!place || others.length > 0) {
    throw new Error(`The test score has ${layout.players.length} players in place of 1.`);
  }
  if (place.cast.species === role.species && place.cast.support === role.support) {
    return layout;
  }

  const cast: PlayerCast = { ...place.cast, species: role.species, support: role.support };
  yield* models.getSteps(cast.species, cast.instrument, cast.kettles, cast.support);
  const [x0, z0] = middleOf(layout, models);
  const [x1, z1] = middleOf({ ...layout, players: [{ ...place, cast }] }, models);
  const [x, y, z] = place.position;

  return { ...layout, players: [{ ...place, cast, position: [x + x0 - x1, y, z + z0 - z1] }] };
}
