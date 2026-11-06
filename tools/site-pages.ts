import { AUTHOR_LINK, LICENSES_FILE } from '../src/app/credits.ts';
import { DEMO_IDS, DEMOS } from '../src/app/demos.ts';
import { APP_NAME, REPOSITORY_URL, SITE_DESCRIPTION, SITE_URL } from '../src/app/page-title.ts';

/**
 * One block of a site page. A text can hold links in the Markdown form `[text](target)`. A target
 * that starts with `/` is a path of the site, and each other target is a full URL.
 */
type Block =
  | {
      /** A heading below the title of the page. */
      readonly kind: 'heading';
      /** The text of the heading. */
      readonly text: string;
    }
  | {
      /** A paragraph. */
      readonly kind: 'paragraph';
      /** The text of the paragraph, with links. */
      readonly text: string;
    }
  | {
      /** A list with bullets. */
      readonly kind: 'list';
      /** The text of each item, with links. */
      readonly items: readonly string[];
    }
  | {
      /** A list of steps, in order. */
      readonly kind: 'steps';
      /** The text of each step, with links. */
      readonly items: readonly string[];
    };

/** One page of the site with a Markdown copy and an HTML copy (design 7.4). */
interface SitePage {
  /** The path of the page from the root of the site, with no extension, such as `about`. */
  readonly path: string;
  /** The title of the page: its `h1`, and the start of its HTML title. */
  readonly title: string;
  /** The text of the meta description, at most 155 characters. */
  readonly description: string;
  /** The content below the title. */
  readonly blocks: readonly Block[];
}

/** The link of a text, in the Markdown form `[text](target)`. */
const LINK = /\[([^\]]+)\]\(([^)]+)\)/gu;

/** The URL of the issue list of the repository, where a visitor sends a message (design 7.4). */
const ISSUES_URL = `${REPOSITORY_URL}/issues`;

/** The composers of the demos, in alphabetical order of the family name. */
const COMPOSERS = 'Bach, Beethoven, Boulanger, Brahms, Mendelssohn, and Mozart';

/** The list of the demos, each one with a link that opens it (design 2.2). */
const DEMO_LIST: Block = {
  kind: 'list',
  items: DEMO_IDS.map((id) => `[${DEMOS[id].title}, ${DEMOS[id].composer}](/#demo=${id})`),
};

/**
 * The start page in Markdown, for an agent that accepts `text/markdown`, and `llms.txt` (design
 * 7.4). The sections "When to use" and "When to use a different tool" tell an agent when the app
 * helps a person.
 */
const HOME: SitePage = {
  path: '',
  title: APP_NAME,
  description: SITE_DESCRIPTION,
  blocks: [
    {
      kind: 'paragraph',
      text: `${APP_NAME} is a free, open-source MIDI player for the web. Each animal of the orchestra plays one part of the piece, a bear conducts, and the camera follows the music. The app runs in the browser with WebGL2. It needs no account and no installation.`,
    },
    { kind: 'heading', text: 'When to use Pawchestra' },
    {
      kind: 'list',
      items: [
        'A person wants to hear a MIDI file and see which instrument plays each note.',
        'A person wants to show an orchestra and its instruments to children or students.',
        `A person wants to hear classical music by ${COMPOSERS}, played by an animated orchestra.`,
      ],
    },
    { kind: 'heading', text: 'When to use a different tool' },
    {
      kind: 'list',
      items: [
        'To write, edit, or convert a MIDI file. Pawchestra only plays MIDI files.',
        'To play an audio recording, such as an MP3 file.',
        'To play live MIDI input, or a MIDI file from a URL. Pawchestra cannot do these.',
      ],
    },
    { kind: 'heading', text: 'How to use it' },
    {
      kind: 'steps',
      items: [
        `Open [${APP_NAME}](/) in a browser with WebGL2.`,
        'Push the play button to hear the first piece.',
        'Open the drawer to select a different piece, or drop a MIDI file (.mid) on the page.',
        `To open a demo directly, add its hash to the URL, such as [${SITE_URL}#demo=beethoven-9](/#demo=beethoven-9).`,
      ],
    },
    { kind: 'heading', text: 'Pieces' },
    DEMO_LIST,
    { kind: 'heading', text: 'Pages' },
    {
      kind: 'list',
      items: [
        '[About](/about): what Pawchestra is and how it works.',
        '[Privacy](/privacy): the data that the site uses.',
        '[Contact](/contact): how to report a problem or send an idea.',
        `[Source code](${REPOSITORY_URL}): the repository on GitHub, under the Apache License 2.0.`,
      ],
    },
  ],
};

/** The page "About" (design 7.4). */
const ABOUT: SitePage = {
  path: 'about',
  title: 'About',
  description: `${APP_NAME} is a free, open-source MIDI player for the web. An orchestra of animals plays each part of a piece on a 3D stage.`,
  blocks: [
    {
      kind: 'paragraph',
      text: `${APP_NAME} is a free web app that plays MIDI files. An orchestra of animals sits on a small 3D stage, and each animal plays one part of the piece. A bear conducts. You hear the music, and you see which instrument plays each note.`,
    },
    { kind: 'heading', text: 'Who it is for' },
    {
      kind: 'paragraph',
      text: `${APP_NAME} is for people who like classical music, for teachers and children who learn the instruments of an orchestra, and for musicians who want to hear and see a MIDI file.`,
    },
    { kind: 'heading', text: 'How it works' },
    {
      kind: 'list',
      items: [
        'The app reads the MIDI file in your browser and gives each part a seat in the orchestra.',
        'A synthesizer plays the notes with the recorded samples of real instruments.',
        'Each animal moves like a real musician: it bows, blows, strikes, or plays the keys in time with its notes.',
        'The camera follows the music, or you turn the view yourself.',
      ],
    },
    { kind: 'heading', text: 'How to use it' },
    {
      kind: 'steps',
      items: [
        `Open [${APP_NAME}](/).`,
        'Push the play button to hear the first piece.',
        'Open the drawer to select a different piece, or drop a MIDI file (.mid) on the page.',
        'Use the seat list in the drawer to mute an animal or to hear it alone.',
      ],
    },
    {
      kind: 'paragraph',
      text: 'The app needs a browser with WebGL2: a current version of Chrome, Firefox, or Safari on a computer, a tablet, or a phone.',
    },
    { kind: 'heading', text: 'The pieces' },
    {
      kind: 'paragraph',
      text: `The demo list has ${DEMO_IDS.length} pieces by ${COMPOSERS}. The scores come from OpenScore and the Mutopia Project, and each one is in the public domain or has a free license. The credits in the app give the source of each score.`,
    },
    DEMO_LIST,
    { kind: 'heading', text: 'Open source' },
    {
      kind: 'paragraph',
      text: `[${AUTHOR_LINK.text}](${AUTHOR_LINK.href}) made ${APP_NAME}. The [source code](${REPOSITORY_URL}) is on GitHub under the Apache License 2.0. The sounds and the scores have their own licenses, which the credits in the app and the [third-party licenses](/${LICENSES_FILE}) give.`,
    },
  ],
};

/** The page "Contact" (design 7.4). It gives no email address, so the site holds no personal data. */
const CONTACT: SitePage = {
  path: 'contact',
  title: 'Contact',
  description: `How to contact the maker of ${APP_NAME}: report a problem, send an idea, or ask a question in the issues of the repository on GitHub.`,
  blocks: [
    {
      kind: 'paragraph',
      text: `${APP_NAME} is the project of one person, [${AUTHOR_LINK.text}](${AUTHOR_LINK.href}). To send a message, open an issue in the repository of the app on GitHub. Each person can read the issues, so do not put private data in an issue.`,
    },
    { kind: 'heading', text: 'Report a problem' },
    {
      kind: 'paragraph',
      text: `[Open an issue](${ISSUES_URL}) on GitHub. Give the browser and its version, the device, the piece or the MIDI file, and what you saw. A screenshot helps. When a MIDI file plays incorrectly, attach the file only if you have the right to share it.`,
    },
    { kind: 'heading', text: 'Send an idea or a question' },
    {
      kind: 'paragraph',
      text: `[Open an issue](${ISSUES_URL}) with your idea or your question. An idea for a new piece helps most when its score is in the public domain or has a free license.`,
    },
    { kind: 'heading', text: 'Change the code' },
    {
      kind: 'paragraph',
      text: `The [source code](${REPOSITORY_URL}) is open. Read the [contribution guide](${REPOSITORY_URL}/blob/main/CONTRIBUTING.md) before you open a pull request.`,
    },
    { kind: 'heading', text: 'Privacy' },
    {
      kind: 'paragraph',
      text: 'For a question about the data of the site, read the [privacy page](/privacy) first.',
    },
  ],
};

/** The page "Privacy" (design 2.7, 7.4). Each statement follows design 2.7. */
const PRIVACY: SitePage = {
  path: 'privacy',
  title: 'Privacy',
  description: `${APP_NAME} has no account and no cookies, and your MIDI files stay in your browser. It counts the page views with no personal identifier.`,
  blocks: [
    {
      kind: 'paragraph',
      text: `${APP_NAME} counts the page views, but it does not identify you. This page tells which data the site uses and where the data goes.`,
    },
    { kind: 'heading', text: 'What the app does not do' },
    {
      kind: 'list',
      items: [
        'It has no account and no sign-in.',
        'It sets no cookies and writes nothing to the storage of your browser.',
        'It has no ads, and no scripts that follow you to other sites.',
        'It installs no service worker.',
      ],
    },
    { kind: 'heading', text: 'Page views' },
    {
      kind: 'paragraph',
      text: 'The site counts the page views with [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy). For each page view, Vercel stores the address of the page, the page that sent you, your country and city, your browser, your operating system, and the type of your device. Vercel identifies a visit with a hash of the request, and discards the hash after 24 hours. The data does not show who you are.',
    },
    { kind: 'heading', text: 'Your MIDI files' },
    {
      kind: 'paragraph',
      text: 'When you open or drop a MIDI file, the app reads it in your browser. The file goes to no server, and the app keeps no copy after you close the page.',
    },
    { kind: 'heading', text: 'Requests to other sites' },
    {
      kind: 'paragraph',
      text: `The page, the sounds, the demo pieces, and the script that counts the page views come from the site itself. The page loads no fonts, scripts, or images from other sites. A link to a different site, such as GitHub, loads nothing until you click it.`,
    },
    { kind: 'heading', text: 'The host' },
    {
      kind: 'paragraph',
      text: 'Vercel hosts the site. Like each web server, it gets the data of each request, such as your IP address, the address of the page, and the type of your browser, to send you the page. The [privacy policy of Vercel](https://vercel.com/legal/privacy-policy) applies to this data.',
    },
    { kind: 'heading', text: 'Changes and questions' },
    {
      kind: 'paragraph',
      text: `The [source code](${REPOSITORY_URL}) of the site is public, so each change of this page shows in its history. For a question, read the [contact page](/contact).`,
    },
  ],
};

/** The pages "About", "Contact", and "Privacy", each one in HTML and in Markdown (design 7.4). */
const TRUST_PAGES: readonly SitePage[] = [ABOUT, CONTACT, PRIVACY];

/**
 * The Markdown body of a missing page, for an agent that accepts `text/markdown` (design 7.4). It
 * names the pages that guide an agent back.
 */
const NOT_FOUND: SitePage = {
  path: '404',
  title: 'Page not found',
  description: `${APP_NAME} has no page at this address.`,
  blocks: [
    {
      kind: 'paragraph',
      text: 'Open the [start page](/), read [llms.txt](/llms.txt) for a guide to the site, or read the [site map](/sitemap.xml).',
    },
  ],
};

/**
 * Escapes a text for the text or an attribute of an HTML element.
 *
 * @param text The text.
 * @returns The HTML text.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Gives the URL of a link target.
 *
 * @param target A path of the site that starts with `/`, or a full URL.
 * @param root The URL or the base path that a path of the site starts from, with a final `/`.
 * @returns The full URL, or the path from the root.
 */
function linkUrl(target: string, root: string): string {
  return target.startsWith('/') ? `${root}${target.slice(1)}` : target;
}

/**
 * Writes the links of a text as full Markdown links.
 *
 * @param text A text with links in the form `[text](target)`.
 * @returns The Markdown text, where each link names a full URL on the main host.
 */
function markdownText(text: string): string {
  return text.replaceAll(
    LINK,
    (_link, label: string, target: string) => `[${label}](${linkUrl(target, SITE_URL)})`,
  );
}

/**
 * Writes a text as HTML, with each link as an `a` element. A link to a different site sends no
 * referrer (design 2.7).
 *
 * @param text A text with links in the form `[text](target)`.
 * @param base The base path of the site.
 * @returns The HTML text.
 */
function htmlText(text: string, base: string): string {
  let html = '';
  let start = 0;
  for (const match of text.matchAll(LINK)) {
    const [link, label = '', target = ''] = match;
    const rel = target.startsWith('/') ? '' : ' rel="noreferrer"';
    html += escapeHtml(text.slice(start, match.index));
    html += `<a href="${escapeHtml(linkUrl(target, base))}"${rel}>${escapeHtml(label)}</a>`;
    start = match.index + link.length;
  }
  return html + escapeHtml(text.slice(start));
}

/**
 * Writes a page in Markdown, in the form of `llms.txt`: the title, the description as a quote, and
 * the blocks.
 *
 * @param page The page.
 * @returns The Markdown text.
 */
function pageMarkdown(page: SitePage): string {
  const parts = [`# ${page.title}`, `> ${page.description}`];
  for (const block of page.blocks) {
    if (block.kind === 'heading') {
      parts.push(`## ${block.text}`);
    } else if (block.kind === 'paragraph') {
      parts.push(markdownText(block.text));
    } else {
      const marker = (index: number): string => (block.kind === 'steps' ? `${index + 1}.` : '-');
      parts.push(
        block.items.map((item, index) => `${marker(index)} ${markdownText(item)}`).join('\n'),
      );
    }
  }
  return `${parts.join('\n\n')}\n`;
}

/** The style sheet of the HTML pages, with the colors of the UI (`src/ui/ui.css`, design 2.8). */
const PAGE_STYLE = `
:root { color-scheme: dark; background: #0b0908; color: #efe8dc;
  font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
body { max-width: 42rem; margin: 0 auto; padding: 24px 16px 48px; }
a { color: #f0c676; }
nav { display: flex; flex-wrap: wrap; gap: 4px 20px; }
header nav a:first-child { font-weight: 700; margin-right: auto; }
h1 { font-family: 'Palatino Linotype', Palatino, 'Iowan Old Style', Georgia, serif; font-size: 2rem; line-height: 1.2; margin: 40px 0 16px; }
h2 { font-size: 1.15rem; margin: 32px 0 8px; }
footer { margin-top: 48px; border-top: 1px solid rgba(255, 240, 220, 0.1); padding-top: 16px; color: #b5aa99; }
`.trim();

/** The links of the header of each HTML page. */
const NAV_LINKS: readonly string[] = [
  `[${APP_NAME}](/)`,
  '[About](/about)',
  '[Privacy](/privacy)',
  '[Contact](/contact)',
];

/**
 * Writes a page in HTML: a static page with all of its text in the HTML, the same links in the
 * header and the footer as the other pages, and a link to its Markdown copy.
 *
 * @param page The page.
 * @param base The base path of the site.
 * @returns The HTML text.
 */
function pageHtml(page: SitePage, base: string): string {
  const body: string[] = [];
  for (const block of page.blocks) {
    if (block.kind === 'heading') {
      body.push(`<h2>${htmlText(block.text, base)}</h2>`);
    } else if (block.kind === 'paragraph') {
      body.push(`<p>${htmlText(block.text, base)}</p>`);
    } else {
      const tag = block.kind === 'steps' ? 'ol' : 'ul';
      const items = block.items.map((item) => `<li>${htmlText(item, base)}</li>`).join('\n');
      body.push(`<${tag}>\n${items}\n</${tag}>`);
    }
  }

  const nav = NAV_LINKS.map((link) => htmlText(link, base)).join('\n');
  const canonical = `${SITE_URL}${page.path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · ${escapeHtml(APP_NAME)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="alternate" type="text/markdown" href="${escapeHtml(`${canonical}.md`)}">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0b0908">
<style>
${PAGE_STYLE}
</style>
</head>
<body>
<header>
<nav aria-label="Site">
${nav}
</nav>
</header>
<main>
<h1>${escapeHtml(page.title)}</h1>
${body.join('\n')}
</main>
<footer>
<p>${htmlText(`${APP_NAME} is [open source](${REPOSITORY_URL}) under the Apache License 2.0.`, base)}</p>
</footer>
</body>
</html>
`;
}

/**
 * Gives the files of the site pages for the build (design 7.4): the Markdown copy of the start
 * page as `index.md` and as `llms.txt`, the pages "About", "Contact", and "Privacy" in HTML and in
 * Markdown, and `404.md`, the Markdown body of a missing page. `vercel.json` sends a Markdown file
 * for a request that accepts `text/markdown`.
 *
 * @param base The base path of the site, with a final `/`.
 * @returns The text of each file by its path in `dist/`.
 */
export function sitePages(base: string): ReadonlyMap<string, string> {
  const home = pageMarkdown(HOME);
  const files = new Map([
    ['index.md', home],
    ['llms.txt', home],
    ['404.md', pageMarkdown(NOT_FOUND)],
  ]);
  for (const page of TRUST_PAGES) {
    files.set(`${page.path}.md`, pageMarkdown(page));
    files.set(`${page.path}.html`, pageHtml(page, base));
  }
  return files;
}
