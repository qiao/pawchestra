import { DEFAULT_DEMO, DEMOS } from './demos.ts';
import type { TitleLines } from './file-rules.ts';

/** The name of the app, at the end of the title of the page (design 2.8). */
export const APP_NAME = 'Pawchestra';

/**
 * The URL of the start page on the main host (design 7.4). Each build names it as the canonical
 * URL, also the build for GitHub Pages.
 */
export const SITE_URL = 'https://www.pawchestra.com/';

/**
 * The title of the start page (design 7.4): the name of the app and the words that people search
 * for. The page keeps it while the default demo shows ({@link pageTitle}).
 */
export const SITE_TITLE = `${APP_NAME}: 3D animal orchestra MIDI player in the browser`;

/** The share image of the start page, a file of `public/` (design 7.4). */
interface ShareImage {
  /** The path of the file from the root of the site. */
  readonly path: string;
  /** The width in pixels: the width of a large card of Open Graph. */
  readonly width: number;
  /** The height in pixels. */
  readonly height: number;
  /** The text that tells a person who cannot see the image what it shows. */
  readonly alt: string;
}

/** The share image of the start page, which `pnpm share-image` writes (design 7.4). */
export const SHARE_IMAGE: ShareImage = {
  path: 'share.jpg',
  width: 1200,
  height: 630,
  alt: 'The Pawchestra logo and the line "A web-based MIDI player with an animal orchestra." above an orchestra of animals on a wooden stage. A bear conducts them, and the view is from above and behind the bear.',
};

/** The description of the start page for search results and shares, at most 155 characters. */
export const SITE_DESCRIPTION =
  'An orchestra of animals plays classical music on a 3D stage in your browser. Play a demo by Bach, Mozart, or Beethoven, or open a MIDI file.';

/** The repository of the app on GitHub, which the link after the logo opens (design 2.8). */
export const REPOSITORY_URL = 'https://github.com/qiao/pawchestra';

/** The accessible name and the tooltip of the link to the repository (design 2.8). */
export const REPOSITORY_LABEL = 'Pawchestra on GitHub';

/**
 * The visible text of the link to the repository, in its pill after the logo (design 2.8). The
 * accessible name of the link starts with it, so that a voice command with the visible text
 * finds the link.
 */
export const REPOSITORY_TEXT = 'Open source';

/**
 * Gives the title of the page for the current piece (design 2.8): the browser tab and the history
 * then name the piece. The default demo plays on the start page, so its title is
 * {@link SITE_TITLE}, the title of `index.html` (design 7.4).
 *
 * @param lines The title lines of the piece.
 * @param demo True for a demo, whose second line is the composer. The second line of a file of
 *   the user is its file name, which the title leaves out.
 * @returns For example "Ode to Joy, Ludwig van Beethoven · Pawchestra".
 */
export function pageTitle(lines: TitleLines, demo: boolean): string {
  const start = DEMOS[DEFAULT_DEMO];
  if (demo && lines.title === start.title && lines.composer === start.composer) {
    return SITE_TITLE;
  }

  const piece = demo && lines.composer ? `${lines.title}, ${lines.composer}` : lines.title;
  return `${piece} · ${APP_NAME}`;
}
