import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { LICENSES_FILE } from './src/app/credits.ts';
import { DEFAULT_DEMO, DEMOS, demoUrl } from './src/app/demos.ts';
import {
  APP_NAME,
  SHARE_IMAGE,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from './src/app/page-title.ts';
import { gzipSiteAudio } from './tools/gzip-site.ts';
import { licenseDocument, licenseEntries } from './tools/licenses.ts';
import { escapeHtml, sitePages } from './tools/site-pages.ts';
import { configDefaults, defineConfig } from 'vitest/config';

/** The speed tests: each one compares the time of a work with a reference work (design 9.3). */
const SPEED_TESTS = '**/*-speed.test.ts';

/**
 * The paused test files (design 9.3). A change of a model can change the look of the animals, and
 * these tests check the look, the fit, or the clearance of the bodies. `pnpm test` skips them, and
 * `pnpm test:paused` runs them for information. The typecheck and the lint still read them. Remove
 * a file from the list to bring it back.
 */
const PAUSED_TESTS = [
  // The clearance of the bodies: the sweeps of the roles and the other clearance tests.
  'src/pose/*-clearance-*.test.ts',
  'src/pose/violinist-standing-clearance.test.ts',
  'src/pose/rest-clearance.test.ts',
  // The fit of a pose to a body: the bow on the strings, the reach, the holds, the paws on the
  // keys, the feet on the floor, and the poses of the sheet pages and of the gallery.
  'src/pose/bowed.test.ts',
  'src/pose/bow-hold.test.ts',
  'src/pose/hands.test.ts',
  'src/pose/winds.test.ts',
  'src/pose/percussion.test.ts',
  'src/pose/choir.test.ts',
  'src/pose/seated-feet.test.ts',
  'src/models/player.test.ts',
  'src/gallery/sheet-poses.test.ts',
  'src/gallery/view-poses.test.ts',
  // The look and the geometry of a body and of its seat: the forms, the sizes, the colors, the
  // faces, the eyes, and the triangle budgets.
  'src/models/species.test.ts',
  'src/models/budget.test.ts',
  'src/models/legs.test.ts',
  'src/models/props.test.ts',
  // The layout from the footprints of the bodies: the growth of the stages, the gaps between
  // the players, and a shot plan that the layout of one demo decides.
  'src/models/layout-scene.test.ts',
  'src/shots/choir-theme.test.ts',
  'src/shots/plan-counts.test.ts',
  'src/shots/opening-drawer.test.ts',
];

/**
 * The switch of the pause of all tests (design 9.3). While it is true, each unit test file is a
 * paused test: `pnpm test` runs no test and passes, and `pnpm test:paused` runs each unit test for
 * information. Set it to false to end the pause. Then `PAUSED_TESTS` gives the paused files again.
 */
const ALL_TESTS_PAUSED: boolean = true;

/** The test files of the project `paused`: each unit test file, or the files of `PAUSED_TESTS`. */
const PAUSED_FILES = ALL_TESTS_PAUSED ? ['**/*.test.ts'] : PAUSED_TESTS;

/**
 * The base path of the site. `ZOOPHONY_BASE` sets it for the build and for `vite preview` (design
 * 9.2). Without it, the site is at `/`.
 */
const BASE = process.env['ZOOPHONY_BASE'] ?? '/';

/**
 * True in the build of `pnpm deploy:vercel`, which sets `ZOOPHONY_ANALYTICS=1`. Only that build
 * loads Vercel Web Analytics (design 2.7), so that the local servers of the probes get no request
 * for its script.
 */
const ANALYTICS = process.env['ZOOPHONY_ANALYTICS'] === '1';

/**
 * The plugin that gives the production build an empty module in place of the look override of
 * the dev server (`src/app/look-override.ts`, design 9.3). The override is the first import of
 * `src/main.ts`, so that it acts before the other modules load. Its code is dead in the build, but
 * its imports moved the modules of the look to the front of the chunk, and the new order grew
 * the first download by about 400 B after gzip (design 7.2). The stub keeps the old order.
 */
const DEV_LOOK_OVERRIDE: Plugin = {
  name: 'zoophony:dev-look-override',
  apply: 'build',
  load(id) {
    return id.endsWith('/src/app/look-override.ts') ? 'export function soloFromQuery() {}' : null;
  },
};

/**
 * Gives the structured data of the start page (design 7.4): a schema.org `WebApplication` with the
 * texts of the meta tags, a free offer, and the need for WebGL2. It holds no personal data.
 *
 * @returns The JSON text for a script element. Each `<` is escaped, so the text cannot end the
 *   element.
 */
function webApplication(): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: APP_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    image: `${SITE_URL}${SHARE_IMAGE.path}`,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires WebGL2',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
}

/**
 * Gives the value of each placeholder `%NAME%` of `index.html`, ready for its place in the HTML:
 * the URL of the default demo for the preload script, the title lines of the default demo for the
 * static title (design 2.8, 7.2), and the texts of search and share (7.4). Each value comes from
 * a constant of the app, so that the page and the app cannot differ.
 *
 * @param base The base path of the site.
 * @returns The values by name.
 */
function indexValues(base: string): ReadonlyMap<string, string> {
  const demo = DEMOS[DEFAULT_DEMO];
  return new Map([
    ['DEFAULT_DEMO_URL', demoUrl(DEFAULT_DEMO, base)],
    ['DEFAULT_DEMO_TITLE', escapeHtml(demo.title)],
    ['DEFAULT_DEMO_COMPOSER', escapeHtml(demo.composer)],
    ['APP_NAME', escapeHtml(APP_NAME)],
    ['SITE_URL', escapeHtml(SITE_URL)],
    ['SITE_TITLE', escapeHtml(SITE_TITLE)],
    ['SITE_DESCRIPTION', escapeHtml(SITE_DESCRIPTION)],
    ['SHARE_IMAGE_URL', escapeHtml(`${SITE_URL}${SHARE_IMAGE.path}`)],
    ['SHARE_IMAGE_WIDTH', String(SHARE_IMAGE.width)],
    ['SHARE_IMAGE_HEIGHT', String(SHARE_IMAGE.height)],
    ['SHARE_IMAGE_ALT', escapeHtml(SHARE_IMAGE.alt)],
    ['WEB_APPLICATION', webApplication()],
  ]);
}

/**
 * The plugin that writes the values of {@link indexValues} into the placeholders of `index.html`,
 * in the dev server and in the build. It keeps a placeholder with no value.
 */
const INDEX_VALUES: Plugin = {
  name: 'zoophony:index-values',
  transformIndexHtml(html) {
    const values = indexValues(BASE);
    return html.replaceAll(/%([A-Z_]+)%/gu, (text, name: string) => values.get(name) ?? text);
  },
};

/**
 * The plugin that writes the files of `sitePages()` into the build (design 7.4): the Markdown copy
 * of the start page, `llms.txt`, and the other pages for agents and for visitors.
 */
const SITE_PAGES: Plugin = {
  name: 'zoophony:site-pages',
  apply: 'build',
  generateBundle() {
    for (const [fileName, source] of sitePages(BASE)) {
      this.emitFile({ type: 'asset', fileName, source });
    }
  },
};

/**
 * The plugin that puts the style sheets of `index.html` inline in its head, in the build (design
 * 7.2). A linked style sheet blocks the first paint for one more request, and the CSS is about
 * 6 kB after compression. It removes a CSS file of the bundle that no other page links. The dev
 * server keeps the links of `index.html`.
 */
const INLINE_CSS: Plugin = {
  name: 'zoophony:inline-css',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const page = bundle['index.html'];
    if (page?.type !== 'asset') {
      return;
    }

    const decode = (source: string | Uint8Array): string =>
      source instanceof Uint8Array ? new TextDecoder().decode(source) : source;
    const otherPages = Object.values(bundle)
      .filter((file) => file.type === 'asset' && file.fileName.endsWith('.html') && file !== page)
      .map((file) => (file.type === 'asset' ? decode(file.source) : ''));
    page.source = decode(page.source).replaceAll(
      /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gu,
      (link, href: string) => {
        const fileName = href.slice(BASE.length);
        const css = bundle[fileName];
        if (css?.type !== 'asset') {
          return link;
        }
        if (!otherPages.some((html) => html.includes(href))) {
          delete bundle[fileName];
        }
        return `<style>${decode(css.source).trim()}</style>`;
      },
    );
  },
};

/**
 * The plugin that gzips the preset files and the demo files of the build in place, after Vite
 * writes `dist/` (design 6.2, 7.2, `tools/gzip-site.ts`). GitHub Pages sends these types with no
 * gzip. The dev server and the Node tools keep the plain files of `public/`.
 */
const GZIP_AUDIO: Plugin = {
  name: 'zoophony:gzip-audio',
  apply: 'build',
  async writeBundle() {
    const { root, build } = this.environment.config;
    const summary = await gzipSiteAudio(resolve(root, build.outDir));
    const bytes = (value: number): string => `${value.toLocaleString('en-US')} B`;
    this.environment.logger.info(
      `Gzipped ${summary.files} preset and demo files: ${bytes(summary.plainBytes)} to ${bytes(summary.gzipBytes)}.`,
    );
  },
};

/**
 * The plugin that serves the third-party license file in the dev server (design 7.3). The build
 * writes the file into `dist/` after Vite (`tools/licenses.ts`), so the dev server has no file at
 * its path, and its HTML fallback sent the app for the link "Third-party licenses" of the credits.
 * The plugin makes the same text for each request.
 */
const DEV_LICENSES: Plugin = {
  name: 'zoophony:dev-licenses',
  apply: 'serve',
  configureServer(server) {
    const path = `${server.config.base}${LICENSES_FILE}`;
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== path) {
        next();
        return;
      }
      licenseEntries(server.config.root).then((entries) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end(licenseDocument(entries));
      }, next);
    });
  },
};

/**
 * Makes the handler that serves the local clip files at `clips/<name>.glb` (design 4.4, 8.1). The
 * folder is `ZOOPHONY_CLIPS`, or `scratch/clips/` of the root. Git ignores `scratch/`, so a Mixamo
 * file there stays out of git. A name holds only letters, digits, `.`, `_`, and `-`.
 *
 * @param base The base path of the site.
 * @param root The root of the project.
 * @returns The handler of the server.
 */
function clipFiles(base: string, root: string): Connect.NextHandleFunction {
  const dir = process.env['ZOOPHONY_CLIPS'] ?? resolve(root, 'scratch', 'clips');
  return (request, response, next) => {
    const match = /^clips\/([\w.-]+\.glb)$/u.exec(
      (request.url ?? '').split('?')[0]?.slice(base.length) ?? '',
    );
    if (!match?.[1]) {
      next();
      return;
    }
    readFile(resolve(dir, match[1])).then(
      (bytes) => {
        response.setHeader('Content-Type', 'model/gltf-binary');
        response.end(bytes);
      },
      () => {
        response.statusCode = 404;
        response.end();
      },
    );
  };
}

/**
 * The plugin that serves the local clip files of the gallery query `clip` in the dev server and
 * in the preview server (design 4.4). The build gets no clip file, because the license of a
 * Mixamo file permits no stand-alone copy (design 8.1).
 */
const LOCAL_CLIPS: Plugin = {
  name: 'zoophony:local-clips',
  configureServer(server) {
    server.middlewares.use(clipFiles(server.config.base, server.config.root));
  },
  configurePreviewServer(server) {
    server.middlewares.use(clipFiles(server.config.base, server.config.root));
  },
};

export default defineConfig({
  base: BASE,
  // `src/main.ts` reads the constant. A build with no analytics drops the code of the package.
  define: { ZOOPHONY_ANALYTICS: JSON.stringify(ANALYTICS) },
  plugins: [
    DEV_LOOK_OVERRIDE,
    INDEX_VALUES,
    SITE_PAGES,
    INLINE_CSS,
    GZIP_AUDIO,
    DEV_LICENSES,
    LOCAL_CLIPS,
  ],
  build: {
    // tools/size.ts reads the manifest to find the static imports of the entry chunk.
    manifest: true,
    // The largest chunk, `renderer`, holds three.js, the scene code, and the studio bodies: about
    // 1,923 kB, or 739 kB after gzip. The base64 text of the studio bodies is about 500 kB
    // of it after gzip. The limit of the warning of Vite is in kB before gzip, a little above that
    // chunk. The size check of design 7.2 (`pnpm size`, 1 MB after gzip) is the real limit.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      // The gallery and the animal views are separate entries, so they do not add to the first
      // download (7.1, 7.2).
      input: {
        index: 'index.html',
        gallery: 'gallery.html',
        views: 'views.html',
      },
    },
  },
  test: {
    // Agent worktrees under .claude/ hold copies of the tests. Run only the tests of this checkout.
    // The probe scripts of an agent in scratch/ are no tests.
    exclude: [...configDefaults.exclude, '.claude/**', 'scratch/**'],
    // The slowest tests take 0.5 to 3.5 s with a low load, and 5 to 13 s at a load average of
    // 300. The default limit of 5 s failed a test under load. A test that does not end fails
    // after 60 s.
    testTimeout: 60_000,
    // While all tests are paused, the project `unit` has no file, and `pnpm test` passes.
    passWithNoTests: ALL_TESTS_PAUSED,
    projects: [
      {
        extends: true,
        test: { name: 'unit', exclude: [SPEED_TESTS, ...PAUSED_FILES] },
      },
      {
        // The speed tests compare times, so load on the machine can make them fail. They run
        // one file at a time with `pnpm test:perf`, and `pnpm test` skips them (design 9.3).
        extends: true,
        test: { name: 'perf', include: [SPEED_TESTS], fileParallelism: false },
      },
      {
        extends: true,
        test: { name: 'paused', include: PAUSED_FILES, exclude: [SPEED_TESTS] },
      },
    ],
  },
  worker: {
    // The decode Worker is a module Worker, and the worklet processor is a module script.
    format: 'es',
  },
});
