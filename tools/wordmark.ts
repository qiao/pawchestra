// Makes the wordmark of the logo (design 2.8): the name of the app in the font Fraunces, as one
// SVG path with relative integer commands. Run it with `node tools/wordmark.ts [--write]`.
//
// HarfBuzz (`hb-view`) shapes the name at the instance of `INSTANCE`, with kerning, in font units.
// The tool moves each glyph to its place, scales the em of 2000 units to 200 units, and rounds
// each point to an integer, so a point moves by at most 0.25% of the em. The left side of the view
// box is the left side of the ink. The top and the bottom of the view box come from `BOX_LETTERS`,
// the top of the "h" and the bottom of the "p" and the "y". Thus each name gets the same vertical
// box, and the CSS of the logo does not change when the name changes.
//
// Without `--write`, the tool prints the view box and the path. With `--write`, it also writes
// them into `src/ui/icons.ts` and into the load state of `index.html`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { APP_NAME } from '../src/app/page-title.ts';

/** The root of the repository. */
const ROOT = resolve(import.meta.dirname, '..');

/** The font file of the wordmark, with no change (`assets/fraunces/README.md`). */
const FONT = join(ROOT, 'assets', 'fraunces', 'fraunces.ttf');

/** The instance of the variable font. */
const INSTANCE = 'wght=600,SOFT=100,WONK=1,opsz=72';

/** The letters that give the top and the bottom of the view box. */
const BOX_LETTERS = 'hpy';

/** Font units for each unit of the path: an em of 2000 units becomes 200 units. */
const UNIT = 10;

/** One command of a glyph outline in font units, with the origin of the glyph at its place. */
interface Command {
  /** The command of `hb-view`: move, line, cubic curve, or close. */
  readonly kind: 'M' | 'L' | 'C' | 'Z';
  /** The points of the command, `[x, y]`, with y down and the baseline at 0. */
  readonly points: readonly (readonly [number, number])[];
}

/** The number of values that each command of `hb-view` takes. */
const VALUE_COUNTS = { M: 2, L: 2, C: 6, Z: 0 } as const;

/**
 * Tells if a token is a command of `hb-view`.
 *
 * @param token The token.
 * @returns True for a command.
 */
function isCommand(token: string): token is Command['kind'] {
  return token in VALUE_COUNTS;
}

/**
 * Shapes a text with HarfBuzz and reads its outline.
 *
 * @param text The text.
 * @returns The commands of all glyphs, at their places on the line.
 */
function shape(text: string): Command[] {
  const folder = mkdtempSync(join(tmpdir(), 'wordmark-'));
  const file = join(folder, 'raw.svg');
  try {
    execFileSync('hb-view', [
      `--font-file=${FONT}`,
      `--variations=${INSTANCE}`,
      '--output-format=svg',
      '--font-size=upem',
      '--margin=0',
      `--output-file=${file}`,
      text,
    ]);
    const svg = readFileSync(file, 'utf8');
    const glyphs = new Map<string, string>();
    for (const match of svg.matchAll(/<g id="(glyph-[^"]+)">\s*<path d="([^"]*)"/g)) {
      glyphs.set(match[1] ?? '', match[2] ?? '');
    }

    const commands: Command[] = [];
    for (const match of svg.matchAll(/<use xlink:href="#([^"]+)" x="([^"]+)" y="[^"]+"\/>/g)) {
      const tokens = (glyphs.get(match[1] ?? '') ?? '').trim().split(/\s+/);
      const dx = Number(match[2]);
      let index = 0;
      while (index < tokens.length) {
        const kind = tokens[index] ?? '';
        if (!isCommand(kind)) {
          throw new Error(`hb-view gave the unknown command "${kind}".`);
        }

        const points: [number, number][] = [];
        for (let value = 0; value < VALUE_COUNTS[kind]; value += 2) {
          const x = Number(tokens[index + 1 + value]) + dx;
          const y = Number(tokens[index + 2 + value]);
          points.push([x, y]);
        }
        commands.push({ kind, points });
        index += 1 + VALUE_COUNTS[kind];
      }
    }
    return commands;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * Gives the extent of the points of an outline along one axis.
 *
 * @param commands The outline.
 * @param axis 0 for x, 1 for y.
 * @returns The smallest and the largest value.
 */
function extent(commands: readonly Command[], axis: 0 | 1): [number, number] {
  const values = commands.flatMap((command) => command.points.map((point) => point[axis]));
  return [Math.min(...values), Math.max(...values)];
}

/**
 * Makes the wordmark of a name.
 *
 * @param name The name.
 * @returns The view box and the path.
 */
export function wordmark(name: string): { viewBox: string; path: string } {
  const commands = shape(name);
  const [left, right] = extent(commands, 0);
  const [top, bottom] = extent(shape(BOX_LETTERS), 1);

  let path = '';
  let last = '';
  let current: readonly [number, number] = [0, 0];
  for (const command of commands) {
    if (command.kind === 'Z') {
      path += 'z';
      last = 'z';
      continue;
    }

    const points = command.points.map(
      ([x, y]) => [Math.round((x - left) / UNIT), Math.round((y - top) / UNIT)] as const,
    );
    const values = points.flatMap(([x, y]) => [x - current[0], y - current[1]]);
    const text = values.map((value, index) => (value < 0 || index === 0 ? `${value}` : ` ${value}`));
    const letter = command.kind.toLowerCase();
    if (letter === last && letter !== 'm') {
      path += (values[0] ?? 0) < 0 ? '' : ' ';
    } else {
      path += letter;
    }
    path += text.join('');
    last = letter;
    current = points.at(-1) ?? current;
  }

  const width = Math.round((right - left) / UNIT);
  const height = Math.round((bottom - top) / UNIT);
  return { viewBox: `0 0 ${width} ${height}`, path };
}

/**
 * Writes the wordmark into the module of the icons and into the load state of the page.
 *
 * @param mark The view box and the path.
 */
function write(mark: { viewBox: string; path: string }): void {
  const icons = join(ROOT, 'src', 'ui', 'icons.ts');
  writeFileSync(
    icons,
    readFileSync(icons, 'utf8')
      .replace(/(export const WORDMARK_PATH =\s*')[^']*'/, `$1${mark.path}'`)
      .replace(/(export const WORDMARK_VIEW_BOX = ')[^']*'/, `$1${mark.viewBox}'`),
  );

  const page = join(ROOT, 'index.html');
  writeFileSync(
    page,
    readFileSync(page, 'utf8').replace(
      /<svg class="wordmark" viewBox="[^"]*" role="img" aria-label="[^"]*"><path d="[^"]*"/,
      `<svg class="wordmark" viewBox="${mark.viewBox}" role="img" aria-label="${APP_NAME}"><path d="${mark.path}"`,
    ),
  );
}

const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });
const mark = wordmark(APP_NAME);
console.log(`viewBox: ${mark.viewBox}\npath: ${mark.path}`);
if (values.write) {
  write(mark);
}
