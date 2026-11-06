import { describe, expect, it } from 'vitest';
import type { Manifest } from 'vite';

import {
  baseLines,
  defaultDemoFile,
  htmlAssetFiles,
  sizeReport,
  staticChunkFiles,
} from './size.ts';

const manifest: Manifest = {
  'index.html': {
    file: 'assets/index.js',
    src: 'index.html',
    isEntry: true,
    css: ['assets/index.css'],
    imports: ['_three.js', '_shared.js'],
    dynamicImports: ['src/audio/player.ts'],
  },
  '_three.js': {
    file: 'assets/three.js',
    imports: ['_shared.js'],
    assets: ['assets/rabbit-skin.webp'],
  },
  '_shared.js': { file: 'assets/shared.js', css: ['assets/shared.css'] },
  'src/audio/player.ts': {
    file: 'assets/player.js',
    isDynamicEntry: true,
    assets: ['assets/hall.wav'],
  },
};

describe('staticChunkFiles', () => {
  it('lists the entry, its static imports, their CSS, and their assets once each', () => {
    expect(staticChunkFiles(manifest, 'index.html')).toEqual([
      'assets/index.js',
      'assets/index.css',
      'assets/three.js',
      'assets/rabbit-skin.webp',
      'assets/shared.js',
      'assets/shared.css',
    ]);
  });

  it('throws for a missing chunk', () => {
    expect(() => staticChunkFiles(manifest, 'gallery.html')).toThrow('gallery.html');
  });
});

describe('htmlAssetFiles', () => {
  it('lists the scripts and the stylesheets of the assets folder', () => {
    const html = [
      '<script type="module" crossorigin src="/pawchestra/assets/polyfill.js"></script>',
      '<link rel="stylesheet" crossorigin href="/assets/index.css">',
      '<link rel="icon" href="/favicon.svg">',
      '<script src="https://example.org/assets/remote.js"></script>',
    ].join('\n');
    expect(htmlAssetFiles(html)).toEqual(['assets/polyfill.js', 'assets/index.css']);
  });
});

describe('defaultDemoFile', () => {
  it('counts the built file of the Boulanger demo, the default demo (design 7.2)', () => {
    expect(defaultDemoFile('/r/dist', '/r/demos', () => true)).toBe(
      '/r/dist/demos/boulanger-matin.mid',
    );
  });

  it('counts the source file when the build has no demo file', () => {
    expect(defaultDemoFile('/r/dist', '/r/demos', () => false)).toBe(
      '/r/demos/src/boulanger-matin.mid',
    );
  });
});

describe('sizeReport', () => {
  const parts = [
    { path: 'dist/index.html', gzipBytes: 260 },
    { path: 'demos/src/boulanger-matin.mid', gzipBytes: 13_885 },
  ];

  it('prints each part and the gzip total', () => {
    const { lines } = sizeReport(parts, 1_000_000);
    expect(lines).toContain('       260 B  dist/index.html');
    expect(lines).toContain('    14,145 B  total');
  });

  it('passes at the limit', () => {
    expect(sizeReport(parts, 14_145).pass).toBe(true);
  });

  it('fails above the limit', () => {
    const report = sizeReport(parts, 14_144);
    expect(report.pass).toBe(false);
    expect(report.lines.at(-1)).toContain('FAIL');
  });
});

describe('baseLines', () => {
  const base = [
    { path: 'dist/index.html', gzipBytes: 260 },
    { path: 'dist/assets/index.js', gzipBytes: 10_000 },
  ];

  it('prints both totals and a larger working tree as a plus', () => {
    const next = [base[0]!, { path: 'dist/assets/index.js', gzipBytes: 11_234 }];
    expect(baseLines('main (cc83899c)', base, next)).toEqual([
      'Base main (cc83899c), built in a temporary folder:',
      '    10,260 B  total of the base',
      '    11,494 B  total of the working tree',
      '    +1,234 B  difference',
    ]);
  });

  it('prints a smaller working tree as a minus, and no sign for no change', () => {
    expect(baseLines('main', base, base.slice(1)).at(-1)).toBe('      -260 B  difference');
    expect(baseLines('main', base, base).at(-1)).toBe('         0 B  difference');
  });
});
