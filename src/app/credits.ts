import { HALL_CREDIT, KONZERTHAUS_CREDIT } from '../audio/hall-credit.ts';
import { SOUNDFONT_CREDITS } from '../audio/soundfont-info.ts';
import { DEMOS, DEMO_IDS } from './demos.ts';
import type { CreditLink, DemoId, DemoInfo } from './demos.ts';

/** The text of the link in the drawer that opens the credits, and the heading of their dialog. */
export const CREDITS_TEXT = 'Credits';

/** The `aria-label` of the close button of the credits dialog (design 2.8). */
export const CLOSE_CREDITS_LABEL = 'Close the credits';

/** The text of the link to the third-party license file (design 2.8, 7.3). */
export const LICENSES_TEXT = 'Third-party licenses';

/** The third-party license file in the site. `tools/licenses.ts` writes it (design 7.3). */
export const LICENSES_FILE = 'third-party-licenses.txt';

/**
 * A row of the group "Sounds": the name of a sound source in the left column, and its credit
 * line with its links in the right column.
 */
export interface SoundCredit {
  /** The name of the sound source, such as "GeneralUser GS 2.0.3" or "Hall reverb". */
  readonly title: string;
  /** The authors, the license, and the changes. */
  readonly credit: string;
  /** The links after the credit line. */
  readonly links: readonly CreditLink[];
}

/** The credit block of one demo: its title, its composer, and the source of its score. */
export interface PieceCredit {
  /** The title of the demo. */
  readonly title: string;
  /** The composer of the demo. */
  readonly composer: string;
  /** The credit line of the score and of the MIDI file. */
  readonly credit: string;
  /** The links after the credit line, for a CC BY file only (design 8.1). */
  readonly links?: readonly CreditLink[];
}

/** The small line above the name of the author, on the title card of the credits dialog. */
export const AUTHOR_TEXT = 'Created by';

/**
 * The author of Pawchestra, on the title card of the credits dialog (design 2.8). The link goes to
 * the owner of `REPOSITORY_URL`.
 */
export const AUTHOR_LINK: CreditLink = {
  text: 'Xueqiao (Joe) Xu',
  href: 'https://github.com/qiao',
};

/** The copyright line at the end of the credits dialog, with the year of `LICENSE`. */
export const COPYRIGHT_TEXT = `© 2026 ${AUTHOR_LINK.text}`;

/** The heading of the group of the current demo (design 2.8, 8.2). */
export const NOW_PLAYING_LABEL = 'Now playing';

/** The heading of the group of the SoundFont credits and the hall reverb credits (design 2.8). */
export const SOUNDS_LABEL = 'Sounds';

/** The heading of the group of the demos that do not play (design 8.1). */
export const OTHER_PIECES_LABEL = 'Other pieces';

/**
 * The credits of the two hall reverbs (design 2.8, 6.8): for each impulse response, the part of
 * its credit after its name, and links to its source and to its license. CC BY 4.0 asks for the
 * credit, a link to the license, and a note of the changes. The site serves both files, so both
 * rows show with each mix preset.
 */
export const HALL_REVERB_CREDITS: readonly SoundCredit[] = [
  { title: 'Hall reverb', asset: HALL_CREDIT },
  { title: 'Cinematic hall reverb', asset: KONZERTHAUS_CREDIT },
].map(({ title, asset }) => ({
  title,
  credit: asset.attribution,
  links: [
    { text: 'Source', href: asset.sourceUrl },
    { text: asset.license, href: asset.licenseUrl },
  ],
}));

/**
 * The credits of the SoundFont (design 2.8, 6.2, 7.3): one row for each source of
 * `SOUNDFONT_CREDITS`, with a link to its web page.
 */
export const SOUND_CREDITS: readonly SoundCredit[] = SOUNDFONT_CREDITS.map((credit) => ({
  title: credit.name,
  credit: `${credit.author}, ${credit.license}.`,
  links: [{ text: 'Source', href: credit.url }],
}));

/** The texts of the credits dialog for the current piece (design 2.8, 7.3, 8.1). */
interface CreditTexts {
  /** The credit block of the current demo, or `null` for a file of the user (8.2). */
  readonly current: PieceCredit | null;
  /** The credit blocks of the other demos, in the order of the demo list. */
  readonly otherDemos: readonly PieceCredit[];
}

/**
 * Gives the texts of the credits dialog (design 2.8, 7.3, 8.1). The dialog shows the credit
 * block of the current demo first. A file of the user has no credit block. The credits list the
 * source of each demo, so the blocks of the other demos follow.
 *
 * @param current The current demo, or `null` for a file of the user.
 * @returns The texts.
 */
export function creditTexts(current: DemoId | null): CreditTexts {
  return {
    current: current ? pieceCredit(current) : null,
    otherDemos: DEMO_IDS.filter((id) => id !== current).map(pieceCredit),
  };
}

/**
 * Gives the credit block of a demo.
 *
 * @param id The demo.
 * @returns The title, the composer, the credit line, and the links of the demo.
 */
function pieceCredit(id: DemoId): PieceCredit {
  const demo: DemoInfo = DEMOS[id];
  const piece = { title: demo.title, composer: demo.composer, credit: demo.credit };
  if (demo.links) {
    return { ...piece, links: demo.links };
  }
  return piece;
}

/**
 * Gives the URL of the third-party license file (design 7.3).
 *
 * @param base The base URL of the site, with a slash at the end.
 * @returns The URL of the file.
 */
export function licensesUrl(base: string): string {
  return `${base}${LICENSES_FILE}`;
}
