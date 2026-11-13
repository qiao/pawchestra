import type { SceneLayout } from '../models/layout.ts';
import { applyLook, parseLook, soloSeats } from '../scene/look-values.ts';
import type { StageScene } from '../scene/stage-scene.ts';
import type { App } from './app.ts';

// The look override of the dev server (design 9.3): the query `look` holds JSON of look paths and
// values, such as `?look={"BACK_ROW_LIGHT.illuminance":2.81}` (`LOOK_ROOTS` of
// `scene/look-values.ts`). This module is the first import of `src/main.ts`, so it changes the
// values before the modules of the app load. The production build drops the code, because
// `import.meta.env.DEV` is false there.
if (import.meta.env.DEV) {
  const text = new URLSearchParams(location.search).get('look');
  if (text) {
    for (const change of applyLook(parseLook(text))) {
      console.info(`look override ${change.path}: ${change.before} -> ${change.after}`);
    }
  }
}

/**
 * Solos the seats of the query `solo` of the dev server, such as `?solo=panda` or `?solo=13,14`
 * (`soloSeats()` of `scene/look-values.ts`). The app starts with no seat flags, and a new piece
 * resets them (design 6.6), so the solo waits for the layout and the seat list of the first
 * piece. Then it clicks the solo button of each seat, as the user does. Thus the light, the
 * sound, and the poses follow the solo. Only the dev server calls it.
 *
 * @param app The app.
 * @param scene The 3D scene of the app.
 */
export function soloFromQuery(app: App, scene: StageScene): void {
  const text = new URLSearchParams(location.search).get('solo');
  if (text === null) {
    return;
  }

  // The scene keeps its layout private, so the solo reads the layout of each call of show().
  let layout: SceneLayout | null = null;
  const show = scene.show.bind(scene);
  scene.show = (prepared) => {
    layout = prepared.view.layout;
    show(prepared);
  };

  const wait = (): void => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Seats"] button[aria-label^="Solo "]',
    );
    if (!app.plan || !layout || buttons.length === 0) {
      requestAnimationFrame(wait);
      return;
    }
    const seats = soloSeats(text, layout.players);
    for (const seat of seats) {
      buttons[seat]?.click();
    }
    console.info(`look override solo ${text}: seats ${seats.join(', ')}`);
  };
  requestAnimationFrame(wait);
}
