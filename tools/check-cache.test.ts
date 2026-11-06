import { describe, expect, it } from 'vitest';

import {
  checkKey,
  commitChecks,
  docsReadingTests,
  isDocsPath,
  parseGrepOutput,
  tipChecks,
} from './check-cache.ts';
import type { CheckKeyParts } from './check-cache.ts';

/** The parts of a key that each test changes one at a time. */
const PARTS: CheckKeyParts = {
  kind: 'commit',
  tree: 'a'.repeat(40),
  parentTree: 'b'.repeat(40),
  checks: commitChecks(['src/a.ts'], []),
  scriptHash: 'c'.repeat(64),
  node: 'v24.10.0 darwin-arm64',
  pnpm: '10.8.0',
  siteBase: '',
  modulesHash: 'd'.repeat(64),
};

/**
 * Gives the names of the checks of a commit.
 *
 * @param paths The changed paths.
 * @param docsTests The test files that read a docs path.
 * @returns The names, in their order.
 */
function checkNames(paths: readonly string[], docsTests: readonly string[]): string[] {
  return commitChecks(paths, docsTests).map((check) => check.name);
}

describe('checkKey', () => {
  it('gives the same key for the same parts', () => {
    expect(checkKey({ ...PARTS })).toBe(checkKey(PARTS));
    expect(checkKey(PARTS)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives a new key when the tree, the parent tree, or the commands change', () => {
    const changed: CheckKeyParts[] = [
      { ...PARTS, tree: 'e'.repeat(40) },
      { ...PARTS, parentTree: 'e'.repeat(40) },
      { ...PARTS, checks: [{ name: 'lint', command: 'pnpm -s lint --fix' }] },
      { ...PARTS, checks: commitChecks(['docs/a.md'], []) },
    ];

    for (const parts of changed) {
      expect(checkKey(parts)).not.toBe(checkKey(PARTS));
    }
  });

  it('gives a new key when the kind, the script, a tool, the base, or the install changes', () => {
    const changed: CheckKeyParts[] = [
      { ...PARTS, kind: 'tip' },
      { ...PARTS, scriptHash: 'e'.repeat(64) },
      { ...PARTS, node: 'v24.11.0 darwin-arm64' },
      { ...PARTS, pnpm: '10.9.0' },
      { ...PARTS, siteBase: '/pawchestra/' },
      { ...PARTS, modulesHash: 'none' },
    ];

    for (const parts of changed) {
      expect(checkKey(parts)).not.toBe(checkKey(PARTS));
    }
  });
});

describe('commitChecks', () => {
  it('runs the lint, the typecheck, the reached tests, and the format check on code', () => {
    expect(checkNames(['src/a.ts', 'docs/b.md'], [])).toEqual([
      'lint',
      'typecheck',
      'reached tests',
      'format',
    ]);
    expect(commitChecks(['src/a.ts'], [])[2]?.command).toBe(
      'pnpm -s test --changed HEAD~1 --passWithNoTests',
    );
  });

  it('runs only the format check and the docs tests on a commit of docs', () => {
    const checks = commitChecks(['docs/a.md', 'AGENTS.md'], ['src/x.test.ts', 'tools/y.test.ts']);

    expect(checks.map((check) => check.name)).toEqual(['docs tests', 'format']);
    expect(checks[0]?.command).toBe('pnpm -s test src/x.test.ts tools/y.test.ts');
  });

  it('adds the docs tests to the checks of a commit that changes code and docs', () => {
    expect(checkNames(['src/a.ts', 'docs/b.png'], ['src/x.test.ts'])).toEqual([
      'lint',
      'typecheck',
      'reached tests',
      'docs tests',
      'format',
    ]);
  });

  it('checks the code of a commit that moves a source file into docs/', () => {
    expect(checkNames(['src/a.ts', 'docs/a.ts'], [])).toContain('typecheck');
  });
});

describe('tipChecks', () => {
  it('runs the full unit suite', () => {
    expect(tipChecks()).toEqual([{ name: 'full suite', command: 'pnpm -s test' }]);
  });
});

describe('isDocsPath', () => {
  it('takes the files of docs/ and the Markdown files', () => {
    expect(isDocsPath('docs/reference/scene.png')).toBe(true);
    expect(isDocsPath('demos/README.md')).toBe(true);
    expect(isDocsPath('src/docs.ts')).toBe(false);
    expect(isDocsPath('tools/docs/a.ts')).toBe(false);
  });
});

describe('docsReadingTests', () => {
  it('finds a docs path, a docs path part, and a Markdown file name in code', () => {
    const lines = [
      { path: 'src/b.test.ts', text: "const A = readFileSync(join(ROOT, 'docs', 'ui.html'));" },
      { path: 'src/a.test.ts', text: "const B = new URL('../../docs/design/04.md', base);" },
      { path: 'src/c.test.ts', text: "  const readme = await readFile(join(DIR, 'README.md'));" },
      { path: 'src/a.test.ts', text: "readFileSync('../docs/x.png');" },
    ];

    expect(docsReadingTests(lines)).toEqual(['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts']);
  });

  it('skips the comments and the words with no path', () => {
    const lines = [
      { path: 'src/a.test.ts', text: '  // (`docs/research/legs.md`) gives the measures.' },
      { path: 'src/b.test.ts', text: ' * (`docs/research/seating.md`, section 7).' },
      { path: 'src/c.test.ts', text: "it('reads the docs of the tool', () => {" },
    ];

    expect(docsReadingTests(lines)).toEqual([]);
  });
});

describe('parseGrepOutput', () => {
  it('reads the path and the text of each line, with the colons of the text', () => {
    const rev = 'f'.repeat(40);
    const output = [
      `${rev}:src/a.test.ts:12:const A = 'docs/a.md'; // a: b`,
      `${rev}:tools/b.test.ts:3:  join('docs')`,
      '',
    ].join('\n');

    expect(parseGrepOutput(output, rev)).toEqual([
      { path: 'src/a.test.ts', text: "const A = 'docs/a.md'; // a: b" },
      { path: 'tools/b.test.ts', text: "  join('docs')" },
    ]);
  });
});
