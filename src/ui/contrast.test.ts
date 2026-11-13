import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SHADE_ALPHA, SHADE_RGB } from './title-shade.ts';

/** The stylesheet of the UI. */
const UI_CSS = readFileSync(join(import.meta.dirname, 'ui.css'), 'utf8');

/** The UI prototype of design 2.8, with its stylesheet. */
const PROTOTYPE = readFileSync(
  join(import.meta.dirname, '..', '..', 'docs', 'prototype', 'ui.html'),
  'utf8',
);

/** The smallest contrast ratio of WCAG 2.2 AA for text of normal size. */
const AA_TEXT = 4.5;

/** A color: red, green, and blue from 0 to 255, and the alpha from 0 to 1. */
interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * Gives the value of a property in the first top-level rule of a selector.
 *
 * @param css The stylesheet.
 * @param selector The selector of the rule, exactly as the stylesheet writes it.
 * @param property The property.
 * @returns The value, with no spaces at its ends.
 * @throws Error if the rule or the property is missing.
 */
function declaration(css: string, selector: string, property: string): string {
  // A rule starts a line, after a line that is not a part of a selector list.
  let start = -1;
  for (let at = css.indexOf(`${selector} {`); at >= 0; at = css.indexOf(`${selector} {`, at + 1)) {
    const before = css.slice(0, at);
    if (/(?:^|\n)[ \t]*$/u.test(before) && !before.trimEnd().endsWith(',')) {
      start = at;
      break;
    }
  }
  if (start < 0) {
    throw new Error(`The stylesheet has no rule "${selector}".`);
  }
  const body = css.slice(start, css.indexOf('}', start));
  const match = new RegExp(`(?:^|[\\s;{])${property}:\\s*([^;]+);`, 'u').exec(body);
  if (!match?.[1]) {
    throw new Error(`The rule "${selector}" has no property "${property}".`);
  }
  return match[1].trim();
}

/**
 * Reads a color: `#rrggbb`, `rgba(r, g, b, a)`, or `var(--token)` of the `:root` rule.
 *
 * @param css The stylesheet, for the tokens.
 * @param value The color text.
 * @returns The color.
 * @throws Error for another color format.
 */
function color(css: string, value: string): Rgba {
  const token = /^var\((--[\w-]+)\)$/u.exec(value)?.[1];
  if (token) {
    return color(css, declaration(css, ':root', token));
  }
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(value);
  if (hex) {
    return {
      r: parseInt(hex[1] ?? '', 16),
      g: parseInt(hex[2] ?? '', 16),
      b: parseInt(hex[3] ?? '', 16),
      a: 1,
    };
  }
  const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/u.exec(value);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  }
  throw new Error(`The color "${value}" has no known format.`);
}

/**
 * Puts a color with an opacity over an opaque color.
 *
 * @param top The upper color. Its alpha multiplies the opacity.
 * @param opacity The opacity of the upper color, from 0 to 1.
 * @param bottom The opaque lower color.
 * @returns The opaque mix.
 */
function over(top: Rgba, opacity: number, bottom: Rgba): Rgba {
  const a = top.a * opacity;
  const mix = (t: number, b: number): number => a * t + (1 - a) * b;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/**
 * Calculates the relative luminance of WCAG 2.2.
 *
 * @param c The opaque color.
 * @returns The luminance from 0 to 1.
 */
function luminance(c: Rgba): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/**
 * Calculates the contrast ratio of WCAG 2.2 between two opaque colors.
 *
 * @param a The first color.
 * @param b The second color.
 * @returns The ratio from 1 to 21.
 */
function contrast(a: Rgba, b: Rgba): number {
  const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

/** The selector of the title shade: one fixed gradient behind the title (design 2.8). */
const LINE_SHADE = '.title::before';

/** White, the lightest color behind the panel of the drawer: white fur in a close shot. */
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Black, the darkest color behind the panel of the drawer. */
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

describe('the text of a silent seat (design 2.8, review of step 6, N3)', () => {
  const glass = color(UI_CSS, declaration(UI_CSS, '.drawer', 'background'));
  const opacity = Number(declaration(UI_CSS, '.seat.silent .name', 'opacity'));
  const texts = {
    name: color(UI_CSS, 'var(--text)'),
    source: color(UI_CSS, declaration(UI_CSS, '.seat small', 'color')),
  };
  const rows = Object.entries({ white: WHITE, black: BLACK }).flatMap(([name, behind]) => {
    const panel = over(glass, 1, behind);
    return Object.entries({
      panel,
      hover: over(color(UI_CSS, declaration(UI_CSS, '.seat:hover', 'background')), 1, panel),
    }).map(([row, background]) => [`${row} row over ${name}`, background] as const);
  });

  it.each(rows)('meets 4.5:1 on the %s', (_, background) => {
    for (const text of Object.values(texts)) {
      expect(contrast(over(text, opacity, background), background)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('has a panel that is nearly opaque', () => {
    expect(glass.a).toBeGreaterThanOrEqual(0.9);
  });

  it('is dimmer than the text of a seat that sounds', () => {
    expect(opacity).toBeLessThan(1);
  });

  it('has the opacity of the prototype', () => {
    expect(declaration(PROTOTYPE, '.seat.silent .name', 'opacity')).toBe(String(opacity));
  });
});

describe('the credits link and the credits dialog (design 2.8)', () => {
  const glass = color(UI_CSS, declaration(UI_CSS, '.drawer', 'background'));
  const dialog = color(UI_CSS, declaration(UI_CSS, '.modal', 'background'));
  const dim = color(UI_CSS, 'var(--text-dim)');

  it('keeps 4.5:1 for the link on the drawer over white and over black', () => {
    const link = color(UI_CSS, declaration(UI_CSS, '.text-link', 'color'));
    for (const behind of [WHITE, BLACK]) {
      expect(contrast(link, over(glass, 1, behind))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('has an opaque dialog that keeps 4.5:1 for its dim text and its links', () => {
    expect(dialog.a).toBe(1);
    for (const text of [dim, color(UI_CSS, declaration(UI_CSS, '.credits a', 'color'))]) {
      expect(contrast(text, dialog)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('the title over a light animal (design 2.8, audit 2026-10-05-ux-design, VD1)', () => {
  const shade = color(UI_CSS, declaration(UI_CSS, LINE_SHADE, 'background'));
  const behind = over(shade, 1, WHITE);

  it('keeps 4.5:1 for the composer line and the title over white fur', () => {
    for (const text of ['var(--text-dim)', 'var(--text)']) {
      expect(contrast(color(UI_CSS, text), behind)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

/**
 * The backdrops of the shade test: each gray, and the colors of the scene (white and gold fur,
 * the warm floor, the beam, and full red, green, and blue) at each brightness.
 */
const BACKDROPS: readonly Rgba[] = [
  ...Array.from({ length: 256 }, (_, v) => ({ r: v, g: v, b: v, a: 1 })),
  ...[
    [255, 244, 225],
    [240, 198, 118],
    [255, 150, 60],
    [255, 220, 160],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
  ].flatMap(([r = 0, g = 0, b = 0]) =>
    Array.from({ length: 51 }, (_, step) => ({
      r: Math.round((r * step) / 50),
      g: Math.round((g * step) / 50),
      b: Math.round((b * step) / 50),
      a: 1,
    })),
  ),
];

describe('the title shade over each backdrop (design 2.8)', () => {
  const shade = color(UI_CSS, declaration(UI_CSS, LINE_SHADE, 'background'));
  const lines = {
    logo: color(UI_CSS, declaration(UI_CSS, '.title .logo', 'color')),
    title: color(UI_CSS, declaration(UI_CSS, ':root', 'color')),
    composer: color(UI_CSS, declaration(UI_CSS, '.title p', 'color')),
  } as const;

  it('has the color and the alpha of --title-shade', () => {
    expect([shade.r, shade.g, shade.b]).toEqual(SHADE_RGB);
    expect(shade.a).toBe(SHADE_ALPHA);
  });

  it.each(Object.entries(lines))('keeps 4.5:1 for the %s over each backdrop', (_, text) => {
    for (const backdrop of BACKDROPS) {
      const behind = over(shade, 1, backdrop);
      expect(contrast(text, behind), JSON.stringify(backdrop)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('the GitHub mark in the logo line (design 2.8)', () => {
  const shade = color(UI_CSS, declaration(UI_CSS, LINE_SHADE, 'background'));
  const marks = {
    rest: color(UI_CSS, declaration(UI_CSS, '.title .github', 'color')),
    hover: color(UI_CSS, declaration(UI_CSS, '.title .github:hover', 'color')),
  };

  it.each(Object.entries(marks))(
    'is white or a neutral gray at %s, as the logo rules of GitHub ask',
    (_, mark) => {
      expect(mark.r).toBe(mark.g);
      expect(mark.g).toBe(mark.b);
    },
  );

  it.each(Object.entries(marks))(
    'keeps 4.5:1 at %s over each backdrop with the title shade',
    (_, mark) => {
      for (const backdrop of BACKDROPS) {
        const behind = over(shade, 1, backdrop);
        expect(contrast(mark, behind), JSON.stringify(backdrop)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );
});
