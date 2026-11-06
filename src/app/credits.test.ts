import { describe, expect, it } from 'vitest';

import { DEMOS, DEMO_IDS } from './demos.ts';
import { HALL_CREDIT } from '../audio/hall-credit.ts';
import { HALL_REVERB_CREDITS, SOUND_CREDITS, creditTexts, licensesUrl } from './credits.ts';

describe('creditTexts (design 2.8, 7.3, 8.1)', () => {
  it('gives the credit block of the current demo, then the blocks of the other demos', () => {
    const texts = creditTexts('mozart-k525');
    expect(texts.current).toEqual({
      title: 'Eine kleine Nachtmusik, K. 525: I',
      composer: 'Wolfgang Amadeus Mozart',
      credit: 'Score: Mutopia Project, piece 2230, public domain. Typeset by Mike Blackstock.',
    });
    expect(texts.otherDemos.map((d) => d.title)).toEqual(
      DEMO_IDS.filter((id) => id !== 'mozart-k525').map((id) => DEMOS[id].title),
    );
    expect(texts.otherDemos[0]?.credit).toBe(
      'Score: Mutopia Project, piece 686, public domain. Typeset by Maurizio Tomasi.',
    );
  });

  it('lists the source of each demo for each piece, also for a file of the user', () => {
    for (const current of [...DEMO_IDS, null]) {
      const texts = creditTexts(current);
      const credits = [texts.current?.credit ?? null, ...texts.otherDemos.map((d) => d.credit)];
      expect(credits.filter((c) => c !== null).toSorted()).toEqual(
        DEMO_IDS.map((id) => DEMOS[id].credit).toSorted(),
      );
    }
    // A file of the user has no credit line (8.2).
    expect(creditTexts(null).current).toBeNull();
  });

  it('names each source of the SoundFont with its author, its license, and a link (6.2)', () => {
    expect(SOUND_CREDITS.map((credit) => [credit.title, credit.credit])).toEqual([
      ['GeneralUser GS 2.0.3', 'S. Christian Collins, GeneralUser GS License v2.0.'],
      [
        'VSCO 2: Community Edition',
        'Versilian Studios (Sam Gossner) and Ivy Audio (Simon Dalzell), CC0.',
      ],
      ['Versilian Community Sample Library', 'Versilian Studios, CC0.'],
    ]);
    expect(SOUND_CREDITS[0]?.links).toEqual([
      { text: 'Source', href: 'https://www.schristiancollins.com/generaluser.php' },
    ]);
  });
});

describe('HALL_REVERB_CREDITS (design 2.8, 6.8)', () => {
  it('gives the full credit of the hall reverb with links to its source and to CC BY 4.0', () => {
    const [hall] = HALL_REVERB_CREDITS;
    expect(`${hall?.title}: impulse response of ${hall?.credit}`).toBe(HALL_CREDIT.text);
    expect(hall?.links).toEqual([
      { text: 'Source', href: 'https://doi.org/10.5281/zenodo.2641166' },
      { text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
    ]);
  });
});

describe('licensesUrl (design 7.3)', () => {
  it('gives the license file at the base of the site', () => {
    expect(licensesUrl('/pawchestra/')).toBe('/pawchestra/third-party-licenses.txt');
  });
});
