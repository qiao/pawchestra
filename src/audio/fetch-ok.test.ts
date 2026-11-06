import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOk } from './fetch-ok.ts';

describe('fetchOk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives the response of a status of 200', async () => {
    const response = new Response('data', { status: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(fetchOk('https://pawchestra.test/a.sf3')).resolves.toBe(response);
  });

  it('refuses an HTTP error status, with the URL in the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );

    await expect(fetchOk(new URL('https://pawchestra.test/sf/index.json'))).rejects.toThrow(
      'Cannot load https://pawchestra.test/sf/index.json: HTTP 404.',
    );
  });
});
