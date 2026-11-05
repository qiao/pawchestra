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

import { STUDIO_BODIES } from '../src/models/studio-body.ts';
import type { StudioBodyName } from '../src/models/studio-body.ts';
import {
  animalSpecies,
  copiedTool,
  glbModule,
  runTool,
  speciesAnimal,
  studioAnimal,
  takeGlb,
  withGlbBody,
} from './glb-swap.ts';
import { ANIMALS, rigMeshSettings, studioGlbPath } from './studio-body.ts';

/** The repository root. */
const ROOT = join(import.meta.dirname, '..');

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

describe('the animal of a studio body', () => {
  it('names the entry of ANIMALS whose module exports the body', () => {
    const names = Object.keys(STUDIO_BODIES).filter(
      (name): name is StudioBodyName => name in STUDIO_BODIES,
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const animal = studioAnimal(name);
      const settings = ANIMALS.get(animal);
      const module = readFileSync(join(ROOT, 'src', 'models', 'studio', `${animal}.ts`), 'utf8');
      expect(settings, name).toBeDefined();
      expect(module, name).toContain(`export const ${settings?.constant ?? '-'} = `);
    }
  });

  it('gives the species of each animal, and no animal for a species with no studio body', () => {
    for (const animal of ANIMALS.keys()) {
      for (const species of animalSpecies(animal)) {
        expect(speciesAnimal(species)).toBe(animal);
      }
    }
    expect(animalSpecies('rabbit')).toContain('rabbit');
    expect(animalSpecies('fox')).toEqual(['fox-red', 'fox-tan']);
    expect(speciesAnimal('wolf')).toBeNull();
  });
});

describe('copiedTool', () => {
  it('copies the scripts and the configs of the mesh rigs, and no other file of tools/', () => {
    const tools = join(ROOT, 'tools');
    expect(copiedTool(tools)).toBe(true);
    expect(copiedTool(join(tools, 'hold-reach.ts'))).toBe(true);
    expect(copiedTool(join(tools, 'mesh-rigs'))).toBe(true);
    expect(copiedTool(join(tools, 'mesh-rigs', 'fox.json'))).toBe(true);
    expect(copiedTool(join(tools, 'glb-bodies', 'bear.json'))).toBe(false);
    expect(copiedTool(join(tools, 'blender'))).toBe(false);
  });
});

describe('glbModule', () => {
  it('takes the landmark height of the settings that it gets, else the height of ANIMALS', () => {
    const rabbit = rigMeshSettings('rabbit');
    const file = studioGlbPath('rabbit', rabbit);
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
    copyFileSync(studioGlbPath('rabbit', ANIMALS.get('rabbit')), file);
    const out = join(parent, 'source.txt');
    let copy = '';
    let configs = '';

    const code = await withGlbBody(
      'rabbit',
      file,
      async (dir) => {
        copy = dir;
        configs = readFileSync(join(dir, 'tools', 'mesh-rigs', 'rabbit.json'), 'utf8');
        writeFileSync(
          join(dir, 'tools', 'print-source.ts'),
          [
            "import { writeFileSync } from 'node:fs';",
            "import { STUDIO_BODIES } from '../src/models/studio-body.ts';",
            `writeFileSync(${JSON.stringify(out)}, STUDIO_BODIES['studio-rabbit'].source);`,
          ].join('\n'),
        );
        return runTool(dir, 'print-source.ts', []);
      },
      parent,
    );

    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(relative(ROOT, file));
    expect(configs).toBe(readFileSync(join(ROOT, 'tools', 'mesh-rigs', 'rabbit.json'), 'utf8'));
    expect(STUDIO_BODIES['studio-rabbit'].source).not.toBe(relative(ROOT, file));
    expect(copy).not.toBe('');
    expect(existsSync(copy)).toBe(false);
  });

  it('writes the module of the copy with the settings that it gets', async () => {
    const rabbit = rigMeshSettings('rabbit');
    const file = studioGlbPath('rabbit', rabbit);
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
            "import { STUDIO_BODIES } from '../src/models/studio-body.ts';",
            `writeFileSync(${JSON.stringify(out)}, String(STUDIO_BODIES['studio-rabbit'].scale));`,
          ].join('\n'),
        );
        return runTool(dir, 'print-scale.ts', []);
      },
      parent,
      settings,
    );

    expect(code).toBe(0);
    expect(Number(readFileSync(out, 'utf8')) / STUDIO_BODIES['studio-rabbit'].scale).toBeCloseTo(
      1.1,
      5,
    );
  });
});
