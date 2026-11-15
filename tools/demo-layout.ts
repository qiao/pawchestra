import { layoutScene } from '../src/models/layout-scene.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import { buildScore } from '../src/score/score.ts';
import type { Score } from '../src/score/types.ts';

/** The score and the stage layout of a MIDI file, with the models of the layout. */
export interface DemoLayout {
  /** The score, with the section size "Auto" of the app. */
  readonly score: Score;
  /** The layout of the stage for the score. */
  readonly layout: SceneLayout;
  /** The models of the layout, for the later steps of a tool. */
  readonly models: ModelCache;
}

/**
 * Builds the score and the stage layout of a MIDI file, as the app does: the section size "Auto"
 * and a new model cache. A probe of `--base` copies this file into the tree of an older commit
 * (`probeScripts()` of `tools/ref-tree.ts`), so it imports only exports that old commits have.
 *
 * @param bytes The MIDI file. For a demo, the file after the changes of `demos/patches.json`.
 * @param refusal The start of the error message when `buildScore()` refuses the file.
 * @returns The score, the layout, and the models.
 * @throws Error if `buildScore()` refuses the file, with the message `<refusal>: <error>.`.
 */
export function demoLayout(bytes: Uint8Array, refusal = 'The test file was refused'): DemoLayout {
  const result = buildScore(bytes, 'auto');
  if (!result.ok) {
    throw new Error(`${refusal}: ${result.error}.`);
  }

  const models = new ModelCache();
  return { score: result.score, layout: layoutScene(result.score, models), models };
}
