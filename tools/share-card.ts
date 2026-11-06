// Draws the share card (design 7.4): the light effects and the title over a frame of the stage.
// `tools/share-image.ts` renders the frame and calls `composeCard()`. The target image is
// `docs/reference/share-card.webp`.
//
// Chromium draws the card from HTML and CSS, with no image library. Each layer is an element over
// the frame, from the bottom to the top:
//
//   frame     the stage frame, with the warm grade as a CSS filter
//   haze      a blurred copy of the frame over the top part only, so the hall lamps and the
//             balcony rail behind the title become a smooth dark wall
//   glow      a copy of the frame: only its highlights (contrast), blurred, added with `screen`
//   pool      a warm light on the floor in the middle of the stage, added with `screen`
//   shade     a dark neutral band at the top, behind the text
//   vignette  a dark edge that is darkest in the corners and lighter in the middle of the
//             sides, and a dark band at the bottom
//   title     the paw and the wordmark in gold, and one line in Fraunces
//
// The line uses `assets/fraunces/fraunces.ttf` through `@font-face`. The logo uses the paw and
// the wordmark path of `src/ui/icons.ts`, so it is the logo of the app.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser } from '@playwright/test';

import { APP_NAME } from '../src/app/page-title.ts';
import { PAW_MARKUP, WORDMARK_PATH, WORDMARK_VIEW_BOX } from '../src/ui/icons.ts';

/** The one line of the share card under the logo, in Fraunces. */
const SHARE_LINE = 'A web-based MIDI player with an animal orchestra.';

/** The size of a card. */
export interface CardSize {
  /** The width in CSS pixels. */
  readonly width: number;
  /** The height in CSS pixels. */
  readonly height: number;
  /** The device pixels for each CSS pixel, the same as in the frame of the stage. */
  readonly scale: number;
}

/**
 * The style of the card. The window has the size of the card, so 1vh is 1% of its height. The
 * text places come from the target image: each line keeps its vertical place as a part of the
 * height, and the block is centered.
 */
const CARD_STYLE = `
  html, body { margin: 0; background: #000; }
  .card { position: relative; width: 100vw; height: 100vh; overflow: hidden; isolation: isolate; }
  .card > * { position: absolute; }
  .frame, .haze, .glow { inset: 0; width: 100%; height: 100%; }
  .frame { filter: sepia(0.08) saturate(0.82) brightness(1.1) contrast(1.06); }
  .haze {
    filter: sepia(0.08) saturate(0.82) brightness(1.1) blur(16px);
    mask-image: linear-gradient(black 18%, transparent 25%);
  }
  .glow { filter: brightness(0.75) contrast(2.6) blur(9px); mix-blend-mode: screen; opacity: 0.45; }
  .pool {
    inset: 0;
    background: radial-gradient(ellipse 34% 30% at 50% 74%, rgba(255, 196, 140, 0.18), transparent);
    mix-blend-mode: screen;
  }
  .shade {
    inset: 0;
    background: linear-gradient(rgba(18, 14, 11, 0.9), rgba(18, 14, 11, 0.74) 20%, transparent 31%);
  }
  .vignette {
    inset: 0;
    background:
      linear-gradient(to top, rgba(6, 4, 2, 0.86), transparent 22%),
      radial-gradient(ellipse 95% 80% at 50% 50%, transparent 48%, rgba(0, 0, 0, 0.92));
  }
  .logo {
    left: 0;
    right: 0;
    top: 7.94vh;
    display: flex;
    justify-content: center;
    gap: 2.54vh;
    color: rgb(235, 192, 111);
    filter: drop-shadow(0 0 10px rgba(240, 180, 90, 0.35));
  }
  .logo svg { fill: currentColor; }
  .paw { width: 6.98vh; height: 6.98vh; }
  .wordmark { height: 6.9vh; margin-top: 0.56vh; }
  h1 {
    left: 0;
    right: 0;
    margin: 0;
    top: 18.35vh;
    font: 500 5.71vh / 1 'Fraunces';
    font-variation-settings: 'opsz' 48, 'SOFT' 50, 'WONK' 0;
    color: rgb(233, 225, 212);
    text-align: center;
    white-space: nowrap;
    text-shadow: 0 0 16px rgba(255, 214, 160, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6);
  }
`;

/**
 * Writes the HTML of the card.
 *
 * @param frame The URL of the frame of the stage.
 * @param font The URL of the font file of Fraunces.
 * @returns The HTML text.
 */
function cardHtml(frame: string, font: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'Fraunces'; src: url(${font}) format('truetype'); font-weight: 100 900; }
  ${CARD_STYLE}
</style>
</head>
<body>
<div class="card">
  <img class="frame" src="${frame}" alt="">
  <img class="haze" src="${frame}" alt="">
  <img class="glow" src="${frame}" alt="">
  <div class="pool"></div>
  <div class="shade"></div>
  <div class="vignette"></div>
  <div class="logo">
    <svg class="paw" viewBox="0 0 24 24" aria-hidden="true">${PAW_MARKUP}</svg>
    <svg class="wordmark" viewBox="${WORDMARK_VIEW_BOX}" role="img" aria-label="${APP_NAME}">
      <path d="${WORDMARK_PATH}"/>
    </svg>
  </div>
  <h1>${SHARE_LINE}</h1>
</div>
</body>
</html>`;
}

/**
 * Draws the card over a frame of the stage.
 *
 * @param browser The browser.
 * @param root The root of the repository, which holds the font file.
 * @param frame The PNG image of the frame, at the size and the scale of the card.
 * @param size The size of the card.
 * @returns The PNG image of the card, at the scale of the card.
 * @throws Error when Chromium cannot load the font.
 */
export async function composeCard(
  browser: Browser,
  root: string,
  frame: Buffer,
  size: CardSize,
): Promise<Buffer> {
  const font = await readFile(join(root, 'assets', 'fraunces', 'fraunces.ttf'));
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
  });
  try {
    await page.setContent(
      cardHtml(
        `data:image/png;base64,${frame.toString('base64')}`,
        `data:font/ttf;base64,${font.toString('base64')}`,
      ),
    );
    const loaded = await page.evaluate(async () => {
      await Promise.all([...document.images].map((image) => image.decode()));
      await document.fonts.ready;
      return [...document.fonts].some(
        (face) => face.family === 'Fraunces' && face.status === 'loaded',
      );
    });
    if (!loaded) {
      throw new Error('Chromium did not load the font assets/fraunces/fraunces.ttf.');
    }
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}
