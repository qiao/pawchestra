import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { BODIES } from '../src/models/bodies.ts';
import { bodyOf } from '../src/models/body.ts';
import type { BodyName } from '../src/models/body.ts';
import {
  animalSpecies,
  copiedTool,
  glbModule,
  runTool,
  speciesAnimal,
  takeGlb,
  withGlbBody,
} from './glb-swap.ts';
import { ROOT } from './ref-tree.ts';
import { ANIMALS, rigMeshSettings, bodyGlbPath } from './body-module.ts';

describe('takeGlb', () => {
  it('gives no file and the same arguments with no option', () => {
    expect(takeGlb(['rabbit', '--set', 'x=1'], '/w')).toEqual({
      glb: null,
      rest: ['rabbit', '--set', 'x=1'],
    });
  });

  it('takes the option out, and resolves the file from the folder of the caller', () => {
    expect(takeGlb(['rabbit', '--glb', 'out/a.glb', '--support', 'stand'], '/w')).toEqual({
      glb: '/w/out/a.glb',
      rest: ['rabbit', '--support', 'stand'],
    });
  });

  it('stops on an option with no file and on a second option', () => {
    expect(() => takeGlb(['rabbit', '--glb'])).toThrow('takes a GLB file');
    expect(() => takeGlb(['rabbit', '--glb', '--set'])).toThrow('takes a GLB file');
    expect(() => takeGlb(['--glb', 'a.glb', '--glb', 'b.glb'])).toThrow('more than one time');
  });
});

describe('the animal of a body', () => {
  it('names the entry of ANIMALS whose module exports the body', () => {
    const names = Object.keys(BODIES).filter((name): name is BodyName => name in BODIES);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const animal = name;
      const settings = ANIMALS.get(animal);
      const module = readFileSync(join(ROOT, 'src', 'models', 'bodies', `${animal}.ts`), 'utf8');
      expect(settings, name).toBeDefined();
      expect(module, name).toContain(`export const ${settings?.constant ?? '-'} = `);
    }
  });

  it('gives the species of each animal', () => {
    for (const animal of ANIMALS.keys()) {
      for (const species of animalSpecies(animal)) {
        expect(speciesAnimal(species)).toBe(animal);
      }
    }
    expect(animalSpecies('rabbit')).toContain('rabbit');
    expect(animalSpecies('fox')).toEqual(['fox-red', 'fox-tan']);
  });
});

describe('copiedTool', () => {
  it('copies the scripts and the configs of the mesh rigs, and not the GLB body configs', () => {
    const tools = join(ROOT, 'tools');
    expect(copiedTool(tools)).toBe(true);
    expect(copiedTool(join(tools, 'hold-reach.ts'))).toBe(true);
    expect(copiedTool(join(tools, 'glb-bodies', 'bear.json'))).toBe(false);
  });
});

describe('glbModule', () => {
  it('takes the landmark height of the settings that it gets, else the height of ANIMALS', () => {
    const rabbit = rigMeshSettings('rabbit');
    const file = bodyGlbPath('rabbit', rabbit);
    const bytes = new Uint8Array(readFileSync(file));
    const base = glbModule('rabbit', file, bytes).body;
    const settings = rabbit ? { ...rabbit, glb: relative(ROOT, file) } : null;
    const tall = settings
      ? glbModule('rabbit', file, bytes, { ...settings, height: settings.height * 1.1 })
      : null;
    expect((tall?.body.scale ?? 0) / base.scale).toBeCloseTo(1.1, 5);
  });
});

describe('withGlbBody', () => {
  const parent = mkdtempSync(join(tmpdir(), 'glb-swap-test-'));
  afterAll(() => rmSync(parent, { recursive: true, force: true }));

  it('runs a child on the body of another file, and removes the copy at the end', async () => {
    const file = join(parent, 'other.glb');
    copyFileSync(bodyGlbPath('rabbit', ANIMALS.get('rabbit')), file);
    const out = join(parent, 'source.txt');
    let copy = '';

    const code = await withGlbBody(
      'rabbit',
      file,
      async (dir) => {
        copy = dir;
        writeFileSync(
          join(dir, 'tools', 'print-source.ts'),
          [
            "import { writeFileSync } from 'node:fs';",
            "import { bodyOf } from '../src/models/body.ts';",
            `writeFileSync(${JSON.stringify(out)}, bodyOf('rabbit').source);`,
          ].join('\n'),
        );
        return runTool(dir, 'print-source.ts', []);
      },
      parent,
    );

    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(relative(ROOT, file));
    expect(bodyOf('rabbit').source).not.toBe(relative(ROOT, file));
    expect(copy).not.toBe('');
    expect(existsSync(copy)).toBe(false);
  });

  it('writes the module of the copy with the settings that it gets', async () => {
    const rabbit = rigMeshSettings('rabbit');
    const file = bodyGlbPath('rabbit', rabbit);
    const out = join(parent, 'scale.txt');
    const settings = rabbit ? { ...rabbit, height: rabbit.height * 1.1 } : undefined;

    const code = await withGlbBody(
      'rabbit',
      file,
      async (dir) => {
        writeFileSync(
          join(dir, 'tools', 'print-scale.ts'),
          [
            "import { writeFileSync } from 'node:fs';",
            "import { bodyOf } from '../src/models/body.ts';",
            `writeFileSync(${JSON.stringify(out)}, String(bodyOf('rabbit').scale));`,
          ].join('\n'),
        );
        return runTool(dir, 'print-scale.ts', []);
      },
      parent,
      settings,
    );

    expect(code).toBe(0);
    expect(Number(readFileSync(out, 'utf8')) / bodyOf('rabbit').scale).toBeCloseTo(1.1, 5);
  });
});
