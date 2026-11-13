import { layoutSceneSteps } from '../models/layout-scene.ts';
import type { SceneLayout } from '../models/layout.ts';
import { ModelCache } from '../models/model-cache.ts';
import { POSE_SEED, preparePosesSteps } from '../pose/plan.ts';
import type { PosePlan } from '../pose/plan.ts';
import { buildScoreSteps } from '../score/score.ts';
import type { Steps } from '../score/steps.ts';
import type { Score, SectionSize } from '../score/types.ts';
import { SHOT_SEED, prepareShotsSteps } from '../shots/prepare.ts';
import type { ShotPlan } from '../shots/types.ts';
import { castBodiesSteps } from './body-loads.ts';

/** The scene of a score: the layout, the player models, the pose plan, and the shot plan. */
export interface ScoreScene {
  readonly layout: SceneLayout;
  /** The player models, which the layout, the plans, and the scene share. */
  readonly models: ModelCache;
  readonly plan: PosePlan;
  readonly shots: ShotPlan;
}

/**
 * Calculates the layout, the pose plan, and the shot plan of a score in steps (design 7.2). The
 * first step loads the studio bodies that the score casts. The layout, the plans, and the scene
 * share one model cache.
 *
 * @param score The score.
 * @returns The steps, which return the layout, the player models, and the plans.
 */
function* planSceneSteps(score: Score): Steps<ScoreScene> {
  yield* castBodiesSteps(score);
  const models = new ModelCache();
  const layout = yield* layoutSceneSteps(score, models);
  const plan = yield* preparePosesSteps(score, layout, POSE_SEED, models);
  const shots = yield* prepareShotsSteps(score, layout, SHOT_SEED, models);
  return { layout, models, plan, shots };
}

/**
 * Builds the score of a file that the app already checked, in steps (design 7.2): a demo, or a
 * file that `readScoreFile()` accepted.
 *
 * @param bytes The bytes of the file.
 * @param sectionSize The section size.
 * @param name The name of the file, for the error.
 * @returns The steps, which return the score.
 * @throws Error if `buildScore()` refuses the file.
 */
function* scoreSteps(bytes: Uint8Array, sectionSize: SectionSize, name: string): Steps<Score> {
  const result = yield* buildScoreSteps(bytes, sectionSize);
  if (!result.ok) {
    throw new Error(`The file "${name}" is not valid: ${result.error}.`);
  }
  return result.score;
}

/** A score and the scene of its layout. */
export interface PlannedScore {
  readonly score: Score;
  readonly scene: ScoreScene;
}

/**
 * Calculates the scene of a score in steps (design 7.2).
 *
 * @param score The score.
 * @returns The steps, which return the score and its scene.
 */
export function* planScoreSteps(score: Score): Steps<PlannedScore> {
  return { score, scene: yield* planSceneSteps(score) };
}

/**
 * Builds the score of a file that the app already checked, and calculates its scene, in steps
 * (design 7.2).
 *
 * @param bytes The bytes of the file.
 * @param sectionSize The section size.
 * @param name The name of the file, for the error.
 * @returns The steps, which return the score and its scene.
 * @throws Error if `buildScore()` refuses the file.
 */
export function* planFileSteps(
  bytes: Uint8Array,
  sectionSize: SectionSize,
  name: string,
): Steps<PlannedScore> {
  return yield* planScoreSteps(yield* scoreSteps(bytes, sectionSize, name));
}
