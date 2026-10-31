// The look override of the dev server is the first import, so that it changes the look values
// before the other modules read them at their load (`src/app/look-override.ts`).
import { soloFromQuery } from './app/look-override.ts';
import { inject } from '@vercel/analytics';
import { App } from './app/app.ts';
import { fileFromHash } from './app/demos.ts';
import type { DevHook } from './app/dev-hook.ts';
import { NO_WEBGL2_TEXT } from './app/messages.ts';
import { yieldToMain } from './app/slices.ts';
import { probeWebgl2 } from './app/webgl.ts';
import { boneIndex } from './models/rig.ts';
import { watchPixelRatio } from './scene/pixel-ratio.ts';
import { startTierOf } from './scene/quality.ts';
import { StageScene } from './scene/stage-scene.ts';
import { showFullPageMessage } from './ui/full-page-message.ts';

/** True in the build of `pnpm deploy:vercel` (`vite.config.ts`, design 2.7). */
declare const ZOOPHONY_ANALYTICS: boolean;

/**
 * Makes the scene of the stage, or gives `null` for a browser with no WebGL2 (design 2.6). The
 * renderer can also fail to make its context, for example with no GPU. The probe, the renderer,
 * and the app each start in a later task, so that no task of the load blocks the page (design
 * 7.2).
 *
 * @param canvas The canvas of the stage.
 * @returns The scene, or `null` with no WebGL2.
 */
async function createScene(canvas: HTMLCanvasElement): Promise<StageScene | null> {
  await yieldToMain();
  const targetFormat = probeWebgl2(document.createElement('canvas'));
  if (targetFormat === null) {
    return null;
  }
  await yieldToMain();
  let scene: StageScene;
  try {
    scene = new StageScene(canvas, {
      tier: startTierOf(window),
      devicePixelRatio: window.devicePixelRatio,
      targetFormat,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  } catch (error) {
    console.error(error);
    return null;
  }
  // The app with its UI starts in a later task too.
  await yieldToMain();
  return scene;
}

/**
 * Gives the smoke test the values of the page. Only the dev server calls it.
 *
 * @param app The app.
 * @param scene The 3D scene of the app.
 */
function installDevHook(app: App, scene: StageScene): void {
  const hook: DevHook = {
    get songTime() {
      return app.songTime;
    },
    get playing() {
      return app.playing;
    },
    get cameraMode() {
      return app.cameraMode;
    },
    get cameraPosition() {
      return scene.cameraPosition ?? [];
    },
    get instruments() {
      return app.plan?.players.map((p) => p.instrument) ?? [];
    },
    rotation(player, bone) {
      const rotations = app.poses?.players[player]?.rotations;
      const i = boneIndex(bone) * 4;
      return rotations ? [...rotations.subarray(i, i + 4)] : [];
    },
  };
  window.zoophony = hook;
}

/**
 * Starts the app on the canvas of the stage, and runs its frames.
 *
 * @param canvas The canvas of the stage.
 * @param scene The 3D scene on the canvas.
 */
function start(canvas: HTMLCanvasElement, scene: StageScene): void {
  const app = new App(canvas, scene);
  const resize = (): void => {
    scene.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
  };
  // The setting "Frame rate" can skip some frames of the browser (design 2.6).
  const frame = (nowMs: number): void => {
    if (app.frameDue(nowMs)) {
      app.frame();
    }
    requestAnimationFrame(frame);
  };
  window.addEventListener('resize', resize);
  watchPixelRatio(window, resize);
  // The first size comes after the layout of the page: a read of the canvas size before it
  // forces the layout inside this task (design 7.2).
  const firstSize = new ResizeObserver(() => {
    firstSize.disconnect();
    resize();
  });
  firstSize.observe(canvas);
  if (import.meta.env.DEV) {
    installDevHook(app, scene);
    soloFromQuery(app, scene);
  }
  // The URL hash `#demo=<id>` opens a demo (design 2.2). A change of the hash in the address bar
  // shows its demo. It is no user gesture, so the first screen waits for a click.
  window.addEventListener('hashchange', () => {
    app.select(fileFromHash(location.hash, import.meta.env.DEV), false).catch(reportError);
  });
  const first = fileFromHash(location.hash, import.meta.env.DEV);
  // The first screen waits for a click, because the browser needs a user gesture (design 2.2).
  app.select(first, false).catch(reportError);
  requestAnimationFrame(frame);
}

// The deploy build counts the page views with Vercel Web Analytics. The script comes from the
// site itself, at `/_vercel/insights/script.js` (design 2.7).
if (ZOOPHONY_ANALYTICS) {
  inject({ mode: 'production' });
}

// The script replaces the load state of index.html (design 2.8).
for (const element of document.querySelectorAll('.boot')) {
  element.remove();
}
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) {
  throw new Error('The page has no canvas with the id "stage".');
}
createScene(canvas)
  .then((scene) => {
    if (scene) {
      start(canvas, scene);
    } else {
      // The app has no WebGL1 fallback (design 2.6), so the message replaces the stage.
      canvas.hidden = true;
      showFullPageMessage(document.body, NO_WEBGL2_TEXT);
    }
  })
  .catch(reportError);
