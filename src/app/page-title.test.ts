import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMOS } from './demos.ts';
import { fileTitle } from './file-rules.ts';
import { pageTitle } from './page-title.ts';

describe('pageTitle (design 2.8, audit 2026-10-05-ux-design, CP1)', () => {
  it('names the demo and its composer', () => {
    expect(pageTitle(DEMOS['beethoven-9'], true)).toBe(
      `${DEMOS['beethoven-9'].title}, Ludwig van Beethoven · Pawchestra`,
    );
  });

  it('names a file of the user with no file name', () => {
    expect(pageTitle(fileTitle('Bolero', 'ravel.mid'), false)).toBe('Bolero · Pawchestra');
    expect(pageTitle(fileTitle('', 'drums-only.mid'), false)).toBe('drums-only · Pawchestra');
  });
});

describe('the metadata of index.html (audit 2026-10-05-ux-design, CP1)', () => {
  it('has a title, a description, an icon, and Open Graph data', async () => {
    const html = await readFile(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).toContain('<title>%SITE_TITLE%</title>');
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]+"/u);
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    for (const property of ['og:title', 'og:description', 'og:type']) {
      expect(html).toMatch(new RegExp(`<meta\\s+property="${property}"\\s+content="[^"]+"`, 'u'));
    }
  });
});

describe('the development pages (design 7.1, audit 2026-10-05-ux-design, CP4)', () => {
  const root = join(import.meta.dirname, '..', '..');
  const noindex = '<meta name="robots" content="noindex" />';

  it.each(['gallery.html', 'views.html'])('keeps %s out of search engines', async (page) => {
    expect(await readFile(join(root, page), 'utf8')).toContain(noindex);
  });

  it('keeps the app page in search engines', async () => {
    expect(await readFile(join(root, 'index.html'), 'utf8')).not.toContain('noindex');
  });
});
