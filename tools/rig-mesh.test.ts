import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Vec3 } from '../src/models/tuples.ts';
import {
  CONFIG_JOINTS,
  DEFAULT_PROBE,
  REACH_TOLERANCE,
  ANCHOR_MARK,
  anchorCells,
  animalRoles,
  armReach,
  boxMove,
  blenderArgs,
  checkReach,
  jointHead,
  legRise,
  parseArgs,
  parseConfig,
  reachLine,
  checkTable,
  checkTexts,
  chooseRoles,
  configChanges,
  foldArgs,
  foldBones,
  formLines,
  keptHeight,
  playerArgs,
  pointMove,
  printedOnly,
  rigSettings,
  setConfig,
  targetFactor,
  topFaces,
  variantText,
} from './rig-mesh.ts';
import type { CheckMeasures, CheckRow } from './rig-mesh.ts';
import type { FormJson, PlayerForm } from './rig-form.ts';
import { FOLD_ROLES, roleAnimal } from './fold-probe.ts';
import type { FaceRecord } from './fold-probe.ts';
import { ANIMALS } from './studio-body.ts';
import type { MeshRigConfig, MeshRigJoint } from './rig-mesh.ts';

/**
 * Makes the config of a figure with straight arms in the plane z = 0. The shoulder joints are 0.5
 * units high, and the app puts them 0.5 m high, so each unit is 1 m. Each arm has an upper arm and
 * a forearm of 0.1 × √2 units, and 0.02 × √2 units from the wrist to the middle of the palm.
 *
 * @param armFactor The arm factor.
 * @returns The config.
 */
function figure(armFactor: number): MeshRigConfig {
  const joint = (head: Vec3): MeshRigJoint => ({ head, tail: [head[0], head[1] + 0.1, head[2]] });
  const joints: Record<string, MeshRigJoint> = Object.fromEntries(
    CONFIG_JOINTS.map((name) => [name, joint([0, 0.3, 0])]),
  );
  joints['upper_arm_L'] = joint([0.1, 0.5, 0]);
  joints['forearm_L'] = joint([0.2, 0.4, 0]);
  joints['hand_L'] = joint([0.3, 0.3, 0]);
  joints['fingers_L'] = joint([0.34, 0.26, 0]);
  return {
    source: 'in.glb',
    output: 'out.glb',
    app: { shoulders: 0.5, reach: 0.3 * Math.SQRT2 },
    armFactor,
    joints,
  };
}

describe('pnpm rig-mesh (the asset chain of docs/agents/rigging.md)', () => {
  it('measures the reach in the app, with the factor on the upper arm and the forearm only', () => {
    expect(armReach(figure(1), 'L')).toBeCloseTo(0.22 * Math.SQRT2, 9);
    expect(armReach(figure(1.4), 'L')).toBeCloseTo(0.3 * Math.SQRT2, 9);
    expect(armReach(figure(1.4), 'R')).toBeCloseTo(0.3 * Math.SQRT2, 9);
    expect(armReach({ ...figure(1), app: { shoulders: 1, reach: 1 } }, 'L')).toBeCloseTo(
      0.44 * Math.SQRT2,
      9,
    );
  });

  it('refuses an arm factor that misses the reach, and names the factor of the target', () => {
    expect(checkReach(figure(1.4))).toBeCloseTo(0.3 * Math.SQRT2, 9);
    expect(checkReach(figure(1.4 * (1 + REACH_TOLERANCE / 2)))).toBeGreaterThan(0);
    expect(() => checkReach(figure(1.25))).toThrow(/The factor 1\.4000 gives the target/);
  });

  it('mirrors a joint of the right side from the left side', () => {
    expect(jointHead(figure(1), 'hand_R')).toEqual([-0.3, 0.3, 0]);
    expect(jointHead(figure(1), 'hips')).toEqual([0, 0.3, 0]);
    expect(() => jointHead(figure(1), 'wing_R')).toThrow(/no joint/);
  });

  it('refuses a config with no joint of a body bone, or with no arm factor', () => {
    const config = figure(1.4);
    expect(parseConfig(JSON.stringify(config))).toEqual(config);
    const { tail: _, ...joints } = config.joints;
    expect(() => parseConfig(JSON.stringify({ ...config, joints }))).toThrow(
      /lacks the joints tail/,
    );
    expect(() => parseConfig(JSON.stringify({ ...config, armFactor: 0 }))).toThrow(/positive/);
  });
});

describe('the arguments of pnpm rig-mesh', () => {
  it('reads the animal and the preview folder', () => {
    expect(parseArgs(['rabbit'])).toEqual({
      animal: 'rabbit',
      preview: null,
      check: false,
      sets: [],
      probe: DEFAULT_PROBE,
      keep: null,
      noBase: false,
    });
    expect(parseArgs(['rabbit', '--preview', '/tmp/x'])).toEqual({
      animal: 'rabbit',
      preview: '/tmp/x',
      check: false,
      sets: [],
      probe: DEFAULT_PROBE,
      keep: null,
      noBase: false,
    });
    expect(parseArgs(['--preview', '/tmp/x', 'rabbit'])).toEqual({
      animal: 'rabbit',
      preview: '/tmp/x',
      check: false,
      sets: [],
      probe: DEFAULT_PROBE,
      keep: null,
      noBase: false,
    });
  });

  it('reads --check before or after the animal', () => {
    expect(parseArgs(['rabbit', '--check']).check).toBe(true);
    expect(parseArgs(['--check', 'rabbit', '--preview', 'p'])).toEqual({
      animal: 'rabbit',
      preview: 'p',
      check: true,
      sets: [],
      probe: DEFAULT_PROBE,
      keep: null,
      noBase: false,
    });
  });

  it('reads each --set of --check as one variant', () => {
    expect(
      parseArgs(['fox', '--check', '--set', 'armFactor=1.1', '--set', 'weld=0.001;armFactor=1'])
        .sets,
    ).toEqual(['armFactor=1.1', 'weld=0.001;armFactor=1']);
    expect(() => parseArgs(['fox', '--set', 'armFactor=1.1'])).toThrow(/Usage/);
    expect(() => parseArgs(['fox', '--check', '--set'])).toThrow(/Usage/);
  });

  it('reads the options of the app checks of --check', () => {
    const args = parseArgs([
      'fox',
      '--check',
      '--roles',
      'fox-violinist,flutist',
      '--step',
      '1',
      '--demo',
      'beethoven-8.mid',
      '--demo',
      'mozart-k525',
      '--faces',
      '5',
    ]);
    expect(args.probe).toEqual({
      roles: ['fox-violinist', 'flutist'],
      step: 1,
      demos: ['beethoven-8', 'mozart-k525'],
      faces: 5,
      hold: '',
      watch: [],
    });
    expect(() => parseArgs(['fox', '--roles', 'flutist'])).toThrow(/Usage/);
    expect(() => parseArgs(['fox', '--check', '--step', '0'])).toThrow(/above 0/);
    expect(() => parseArgs(['fox', '--check', '--faces', '1.5'])).toThrow(/whole number/);
  });

  it('gives the usage for other arguments', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['rabbit', '--preview'])).toThrow(/Usage/);
    expect(() => parseArgs(['rabbit', 'bear'])).toThrow(/Usage/);
  });

  it('runs the Blender script headless, fails on a Python error, and puts the preview folder last', () => {
    const args = blenderArgs('c.json', 'o.glb', 'p');
    expect(args.slice(0, 5)).toEqual([
      '-b',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
    ]);
    expect(args[5]).toMatch(/tools\/blender\/rig_mesh\.py$/);
    expect(args.slice(6)).toEqual(['--', 'c.json', 'o.glb', '--preview', 'p']);
    expect(blenderArgs('c.json', 'o.glb', null).slice(6)).toEqual(['--', 'c.json', 'o.glb']);
  });

  it('asks the Blender script for the long-armed source and the stretch check of --check', () => {
    expect(blenderArgs('c.json', 'o.glb', null, 's.obj').slice(6)).toEqual([
      '--',
      'c.json',
      'o.glb',
      '--obj',
      's.obj',
      '--check',
    ]);
  });
});

describe('the check of pnpm rig-mesh', () => {
  it('gives the arm factor of the target reach, also when the factor of the config misses it', () => {
    const config = { ...figure(1.1), app: { shoulders: 0.5, reach: 0.35 } };
    const factor = targetFactor(config, 'L');
    expect(armReach(config, 'L', factor)).toBeCloseTo(0.35, 9);
    expect(targetFactor(figure(1.4), 'R')).toBeCloseTo(1.4, 9);
    expect(reachLine(config)).toContain(`the factor ${factor.toFixed(4)} gives 0.35 m`);
    expect(reachLine(config)).toContain('Shoulder joint at 0.5 u');
  });

  it('raises the shoulder joint by the growth of the legs, and takes the scale from it', () => {
    const joints = {
      ...figure(1).joints,
      thigh_L: { head: [0.05, 0.2, 0], tail: 'shin_L' },
      foot_L: { head: [0.05, 0.05, 0], tail: 'toes_L' },
    } satisfies Record<string, MeshRigJoint>;
    const short = { ...figure(1), joints };
    // The thigh and the shin span 0.15 units, so the factor 2 raises the body 0.15 units.
    const long = { ...short, legFactor: 2, app: { ...short.app, shoulders: 0.65 } };
    expect(legRise(short)).toBe(0);
    expect(legRise(long)).toBeCloseTo(0.15, 12);
    expect(armReach(long, 'L')).toBeCloseTo(armReach(short, 'L'), 12);
    expect(reachLine(long)).toContain('Shoulder joint at 0.65 u, 1.0000 m for each unit');
    expect(() => parseConfig(JSON.stringify({ ...long, legFactor: 0 }))).toThrow(/leg factor/);
    expect(() => parseConfig(JSON.stringify({ ...long, headFactor: -1 }))).toThrow(/head factor/);
    expect(() => parseConfig(JSON.stringify({ ...long, neckFactor: 0 }))).toThrow(/neck factor/);
  });

  it('takes the settings of ANIMALS, or a seated role that also stands at the shoulders of the config', () => {
    expect(rigSettings('rabbit', figure(1.4))).toEqual({
      settings: ANIMALS.get('rabbit'),
      known: true,
    });
    expect(rigSettings('red-panda', figure(1.4))).toEqual({
      settings: {
        landmark: 'shoulders',
        height: 0.5,
        seated: true,
        soloist: true,
        constant: 'STUDIO_RED_PANDA',
        crease: 0,
      },
      known: false,
    });
  });

  it('runs the app checks of each role with the body of the animal', () => {
    for (const [role, source] of FOLD_ROLES) {
      expect(animalRoles(roleAnimal(source)).map((r) => r.role)).toContain(role);
    }
    expect(animalRoles('red-panda')).toEqual([]);
  });
});

describe('the mesh rig of the rabbit', async () => {
  const path = join(import.meta.dirname, 'mesh-rigs', 'rabbit.json');
  const config = parseConfig(await readFile(path, 'utf8'));

  it('gives both arms the reach of the app with the arm factor of the config', () => {
    expect(checkReach(config)).toBeCloseTo(config.app.reach, 2);
    expect(armReach(config, 'R')).toBeCloseTo(armReach(config, 'L'), 9);
  });

  it('makes the arms longer than the arms of the source', () => {
    expect(config.armFactor).toBeGreaterThan(1);
    expect(armReach(config, 'L', 1)).toBeLessThan(config.app.reach);
  });
});

describe('setConfig', () => {
  const text = JSON.stringify({
    armFactor: 1,
    weights: { haunch: { height: [0.16, 0.27] }, line: { angle: 150, head: true } },
    refine: { rings: [], flip: { note: 'a' } },
    joints: { tail: { head: [0, 0.4, -0.1] } },
    list: [{ radius: 0.1 }],
  });

  it('changes numbers, lists of numbers, flags, texts, and items of a list', () => {
    const changed = JSON.parse(
      setConfig(
        text,
        'armFactor=1.08; weights.haunch.height=0.2,0.3;weights.line.head=false;refine.flip.note=b;list.0.radius=0.12;joints.tail.head=[0,0.5,-0.2]',
      ),
    );
    expect(changed.armFactor).toBe(1.08);
    expect(changed.weights.haunch.height).toEqual([0.2, 0.3]);
    expect(changed.weights.line).toEqual({ angle: 150, head: false });
    expect(changed.refine.flip.note).toBe('b');
    expect(changed.list).toEqual([{ radius: 0.12 }]);
    expect(changed.joints.tail.head).toEqual([0, 0.5, -0.2]);
  });

  it('takes JSON text for a list that is not a list of numbers', () => {
    const changed = JSON.parse(setConfig(text, 'refine.rings=[{"joint":"forearm","radius":0.1}]'));
    expect(changed.refine.rings).toEqual([{ joint: 'forearm', radius: 0.1 }]);
  });

  it('keeps the other values', () => {
    const changed = JSON.parse(setConfig(text, 'armFactor=1.2'));
    expect({ ...changed, armFactor: 1 }).toEqual(JSON.parse(text));
  });

  it('stops on an unknown path or a value of another kind', () => {
    expect(() => setConfig(text, 'weights.clavicleFrom=0.58,0.63')).toThrow(
      /"clavicleFrom" of weights.clavicleFrom is not known/,
    );
    expect(() => setConfig(text, 'list.1.radius=0.1')).toThrow(/"1" of list.1.radius/);
    expect(() => setConfig(text, 'armFactor.x=1')).toThrow(/"x" of armFactor.x/);
    expect(() => setConfig(text, 'weights.haunch.height=0.2')).toThrow(/2 numbers/);
    expect(() => setConfig(text, 'armFactor=long')).toThrow(/not a number/);
    expect(() => setConfig(text, 'weights.line.head=1')).toThrow(/not a boolean/);
    expect(() => setConfig(text, 'refine.rings={}')).toThrow(/not a list/);
    expect(() => setConfig(text, 'armFactor')).toThrow(/<path>=<value>/);
  });
});

describe('checkTable', () => {
  const measures: CheckMeasures = {
    triangles: 3135,
    meshGzip: 27673,
    scale: 1.5504,
    seat: 0.36,
    legSeat: 0.283,
    chair: 0.25,
    reach: { L: 0.377, R: 0.3771 },
    standing: 0.000228,
    raises: [],
    folds: [
      {
        role: 'fox-violinist',
        counts: {
          rest: { samples: 14, withFold: 14, most: 13, split: { L: 0, R: 11, other: 2 } },
          play: { samples: 17788, withFold: 588, most: 9, split: { L: 0, R: 9, other: 0 } },
          lift: { samples: 434, withFold: 88, most: 13, split: { L: 0, R: 11, other: 2 } },
        },
        bones: [
          { bone: 'upper_arm_R', samples: 120 },
          { bone: 'neck', samples: 13 },
        ],
        faces: [],
        watched: [],
        topology: '',
        records: [],
        middles: {},
      },
    ],
    form: null,
  };

  it('gives one row for each variant with the measures and the folds of each role', () => {
    const lines = checkTable([
      { variant: '', measures, error: null },
      { variant: 'armFactor=1.1', measures: { ...measures, triangles: 3136 }, error: null },
    ]);
    expect(lines[0]).toBe(
      '| Variant | Triangles | Mesh gzip B | Scale m/u | Seat m | Leg seat m | Chair m | Reach L m | Reach R m | Standing mm | fox-violinist play | fox-violinist lift | fox-violinist rest | fox-violinist bones |',
    );
    expect(lines[2]).toBe(
      '| base | 3135 | 27673 | 1.5504 | 0.360 | 0.283 | 0.250 | 0.377 | 0.377 | 0.228 | 3.3% | 20.3% | 100.0% | upper_arm_R 120, neck 13 |',
    );
    expect(lines[3]).toMatch(/^\| armFactor=1\.1 \| 3136 \| /);
  });

  it('adds a column of the most folded faces of each role with --faces', () => {
    const [fold] = measures.folds;
    const faces = [
      { face: 812, samples: 52 },
      { face: 90, samples: 40 },
    ];
    const lines = checkTable([
      {
        variant: '',
        measures: { ...measures, folds: fold ? [{ ...fold, faces }] : [] },
        error: null,
      },
    ]);
    expect(lines[0]).toMatch(/\| fox-violinist bones \| fox-violinist faces \|$/);
    expect(lines[2]).toMatch(/\| upper_arm_R 120, neck 13 \| 812 52, 90 40 \|$/);
    expect(checkTable([{ variant: '', measures, error: null }])[0]).not.toContain('faces');
  });

  it('gives the message of a variant that failed', () => {
    const lines = checkTable([
      { variant: '', measures, error: null },
      { variant: 'weld=1', measures: null, error: 'Blender failed.' },
    ]);
    expect(lines[3]).toMatch(/^\| weld=1 \| failed: Blender failed\. \| - \|/);
  });
});

describe('chooseRoles', () => {
  it('keeps the roles of --roles in the order of the animal, and stops on another role', () => {
    const roles = animalRoles('fox');
    expect(chooseRoles(roles, null)).toEqual(roles);
    expect(chooseRoles(roles, ['flutist']).map((r) => r.role)).toEqual(['flutist']);
    expect(chooseRoles(roles, ['flutist', 'fox-violinist']).map((r) => r.role)).toEqual([
      'fox-violinist',
      'flutist',
    ]);
    expect(() => chooseRoles(roles, ['pianist'])).toThrow(
      'The roles pianist are not roles of the animal. Its roles are: fox-violinist, flutist.',
    );
  });
});

describe('foldArgs', () => {
  it('gives the step and the demos to pnpm fold-probe', () => {
    expect(foldArgs('flutist', 'f.json', DEFAULT_PROBE)).toEqual(['flutist', '--json', 'f.json']);
    expect(foldArgs('flutist', 'f.json', { ...DEFAULT_PROBE, step: 1, demos: ['a', 'b'] })).toEqual(
      ['flutist', '--json', 'f.json', '--step', '1', '--demo', 'a', '--demo', 'b'],
    );
  });
});

describe('topFaces', () => {
  it('gives the faces with the most samples of all sets, and the lower index first on a tie', () => {
    const face = (index: number, rest: number, play: number, lift: number): FaceRecord => ({
      face: index,
      folds: { rest, play, lift },
      bone: 'neck',
      middle: [0, 0, 0],
      worst: null,
    });
    const faces = [face(9, 1, 2, 0), face(3, 0, 3, 0), face(7, 0, 5, 1), face(1, 0, 0, 0)];
    expect(topFaces(faces, 2)).toEqual([
      { face: 7, samples: 6 },
      { face: 3, samples: 3 },
    ]);
    expect(topFaces(faces, 9).map((f) => f.face)).toEqual([7, 3, 9]);
    expect(topFaces(faces, 0)).toEqual([]);
  });
});

describe('playerArgs', () => {
  it('gives one player for each role of a player, and none for the conductor', () => {
    expect(playerArgs(animalRoles('fox'))).toEqual([
      '--player',
      'fox-red:violin',
      '--player',
      'fox-tan:flute',
    ]);
    expect(playerArgs([{ role: 'conductor', species: 'bear' }])).toEqual([]);
  });
});

describe('formLines', () => {
  const player = (top: number, width: number): PlayerForm => ({
    species: 'fox-red',
    instrument: 'violin',
    seat: 0.36,
    visibleHead: 0.386,
    standingTop: top,
    seatedTop: top - 0.065,
    width,
    depth: 1.172,
    headCenter: [0, top - 0.25, -0.1],
    headHeight: 0.236,
    nose: [0, top - 0.3, -0.3],
    instrumentBox: { min: [-0.2, top - 0.4, -0.5], max: [0.1, top - 0.3, -0.2] },
  });
  const form = (top: number, k525: number): FormJson => ({
    players: [player(top, 0.776)],
    stages: [
      { demo: 'bach-bwv1047.mid', side: 11.422 },
      { demo: 'mozart-k525.mid', side: k525 },
    ],
  });
  const row = (variant: string, top: number, k525: number): CheckRow => ({
    variant,
    measures: {
      triangles: 3135,
      meshGzip: 27673,
      scale: 1.5504,
      seat: 0.36,
      legSeat: 0.283,
      chair: 0.326,
      reach: { L: 0.604, R: 0.604 },
      standing: 0.0002,
      raises: [],
      folds: [],
      form: form(top, k525),
    },
    error: null,
  });

  it('gives each player and each stage side with its difference from main', () => {
    const lines = formLines(
      [row('', 1.587, 7.546), row('legFactor=1.6', 1.637, 8.0)],
      form(1.587, 7.546),
    );
    expect(lines).toContain(
      '| legFactor=1.6 | fox-red violin | 0.360 (+0.000) | 0.386 (+0.000) | 1.637 (+0.050) | 1.572 (+0.050) | 0.776 (+0.000) by 1.172 (+0.000) |',
    );
    expect(lines).toContain(
      '| main | fox-red violin | 0.360 | 0.386 | 1.587 | 1.522 | 0.776 by 1.172 |',
    );
    expect(lines).toContain('| mozart-k525.mid | 7.546 | 7.546 (+0.0%) | 8.000 (+6.0%) |');
    expect(lines.at(-1)).toBe('| Largest change | | none | +6.0% mozart-k525.mid |');
  });

  it('gives the hold anchors of each player with each move from main, and marks a move above 1 mm', () => {
    const lines = formLines(
      [row('', 1.587, 7.546), row('neckFactor=1.1', 1.6041, 7.546)],
      form(1.587, 7.546),
    );
    expect(lines).toContain(
      '| main | fox-red violin | (0.000, 1.337, -0.100) | 0.236 | (0.000, 1.287, -0.300) | (-0.200, 1.187, -0.500) to (0.100, 1.287, -0.200) |',
    );
    expect(lines).toContain(
      '| base | fox-red violin | (0.000, 1.337, -0.100) (0.0 mm) | 0.236 (+0.0 mm) | (0.000, 1.287, -0.300) (0.0 mm) | (-0.200, 1.187, -0.500) to (0.100, 1.287, -0.200) (0.0 mm) |',
    );
    expect(lines).toContain(
      '| neckFactor=1.1 | fox-red violin | (0.000, 1.354, -0.100) (17.1 mm MOVED) | 0.236 (+0.0 mm) | (0.000, 1.304, -0.300) (17.1 mm MOVED) | (-0.200, 1.204, -0.500) to (0.100, 1.304, -0.200) (17.1 mm MOVED) |',
    );
  });

  it('gives the values with no difference when the probe of main failed, and no lines with no form', () => {
    const lines = formLines([row('', 1.587, 7.546)], null);
    expect(lines).toContain('| Demo | base |');
    expect(lines).toContain('| mozart-k525.mid | 7.546 |');
    expect(lines.some((line) => line.startsWith('| Largest change'))).toBe(false);
    expect(formLines([{ variant: '', measures: null, error: 'Blender failed.' }], null)).toEqual(
      [],
    );
  });
});

describe('anchorCells', () => {
  const form: PlayerForm = {
    species: 'fox-red',
    instrument: 'violin',
    seat: 0.36,
    visibleHead: 0.386,
    standingTop: 1.587,
    seatedTop: 1.522,
    width: 0.776,
    depth: 1.172,
    headCenter: [0, 1.3, -0.1],
    headHeight: 0.236,
    nose: null,
    instrumentBox: null,
  };

  it('marks a move above 1 mm only, and gives the sign of a change of the head height', () => {
    const near: PlayerForm = { ...form, headCenter: [0, 1.3 + ANCHOR_MARK * 0.9, -0.1] };
    const far: PlayerForm = { ...form, headCenter: [0, 1.3 + ANCHOR_MARK * 1.1, -0.1] };
    const lower: PlayerForm = { ...form, headHeight: 0.234 };
    expect(anchorCells(near, form)[0]).toBe('(0.000, 1.301, -0.100) (0.9 mm)');
    expect(anchorCells(far, form)[0]).toBe('(0.000, 1.301, -0.100) (1.1 mm MOVED)');
    expect(anchorCells(lower, form)[1]).toBe('0.234 (-2.0 mm MOVED)');
    expect(anchorCells(form, undefined)).toEqual([
      '(0.000, 1.300, -0.100)',
      '0.236',
      'none',
      'none',
    ]);
  });

  it('moves a box by the larger move of its corners, and a missing point or box by nothing', () => {
    const corner: Vec3 = [0, 0, 0];
    const far: Vec3 = [1, 1, 1];
    const box = { min: corner, max: far };
    expect(boxMove({ min: [0, 0.003, 0], max: [1, 1, 1.004] }, box)).toBeCloseTo(0.004, 9);
    expect(boxMove(box, null)).toBeNull();
    expect(boxMove(null, box)).toBeNull();
    expect(pointMove([0, 0, 0], [0, 0.003, 0.004])).toBeCloseTo(0.005, 9);
    expect(pointMove(null, [0, 0, 0])).toBeNull();
    expect(pointMove([0, 0, 0], undefined)).toBeNull();
  });
});

describe('foldBones', () => {
  /**
   * Makes a folded face.
   *
   * @param index The index of the face.
   * @param bone The main bone.
   * @param play The play samples with a fold.
   * @param lift The lift samples with a fold.
   * @returns The face.
   */
  function face(index: number, bone: string, play: number, lift = 0): FaceRecord {
    return { face: index, folds: { rest: 0, play, lift }, bone, middle: [0, 0, 0], worst: null };
  }

  it('gives the bones with the most face-samples of all sets, the most first', () => {
    const faces = [
      face(1, 'neck', 13),
      face(2, 'upper_arm_R', 70, 10),
      face(3, 'upper_arm_R', 40),
      face(4, 'forearm_L', 2, 2),
      face(5, 'hand_L', 1),
      face(6, 'chest', 0),
    ];
    expect(foldBones(faces)).toEqual([
      { bone: 'upper_arm_R', samples: 120 },
      { bone: 'neck', samples: 13 },
      { bone: 'forearm_L', samples: 4 },
    ]);
    expect(foldBones([face(1, 'neck', 3), face(2, 'chest', 3)], 1)).toEqual([
      { bone: 'chest', samples: 3 },
    ]);
    expect(foldBones([face(6, 'chest', 0)])).toEqual([]);
  });
});

describe('configChanges', () => {
  it('reads each change of a variant, separated by ;', () => {
    expect(configChanges(' armFactor=1.1 ;weights.line.angle=150;')).toEqual([
      { path: 'armFactor', text: '1.1' },
      { path: 'weights.line.angle', text: '150' },
    ]);
  });

  it('stops on a variant with no change', () => {
    expect(() => configChanges('')).toThrow(/has no change/);
    expect(() => configChanges(';')).toThrow(/has no change/);
    expect(() => configChanges(' ; ')).toThrow(/has no change/);
  });
});

describe('printedOnly', () => {
  it('names the place of the real value of each path that changes only printed text', () => {
    expect(printedOnly('output', false)).toMatch(/temporary folder/);
    expect(printedOnly('app.reach', false)).toMatch(/armFactor/);
    expect(printedOnly('app.shoulders', true)).toMatch(/ANIMALS of tools\/studio-body\.ts/);
    expect(printedOnly('app', true)).toMatch(/ANIMALS of tools\/studio-body\.ts/);
    expect(printedOnly('weights.note', false)).toMatch(/note/);
    expect(printedOnly('armFactorNote', true)).toMatch(/note/);
  });

  it('lets a path change the rig', () => {
    expect(printedOnly('app.shoulders', false)).toBeNull();
    expect(printedOnly('app', false)).toBeNull();
    expect(printedOnly('armFactor', true)).toBeNull();
    expect(printedOnly('weights.haunch.height', true)).toBeNull();
    expect(printedOnly('source', true)).toBeNull();
  });
});

describe('variantText', () => {
  const text = JSON.stringify(figure(1));

  it('gives the changed config of a variant', () => {
    expect(JSON.parse(variantText(text, 'armFactor=1.2', true)).armFactor).toBe(1.2);
  });

  it('stops on a path that changes only printed text, on no change, and on a bad config', () => {
    expect(() => variantText(text, 'armFactor=1.2;app.shoulders=0.8', true)).toThrow(
      /--set app\.shoulders changes only the printed text.*ANIMALS of tools\/studio-body\.ts/,
    );
    expect(() => variantText(text, 'output=x.glb', false)).toThrow(/--set output/);
    expect(() => variantText(text, ';', true)).toThrow(/has no change/);
    expect(() => variantText(text, 'armFactor=0', true)).toThrow(/positive numbers/);
  });
});

describe('keptHeight and the kept meters of a variant', () => {
  const joints = {
    ...figure(1).joints,
    thigh_L: { head: [0.05, 0.2, 0], tail: 'shin_L' },
    foot_L: { head: [0.05, 0.05, 0], tail: 'toes_L' },
  } satisfies Record<string, MeshRigJoint>;
  const short: MeshRigConfig = {
    ...figure(1),
    joints,
    legFactor: 1,
    headFactor: 1,
    neckFactor: 1,
  };
  const text = JSON.stringify(short);

  it('moves the landmark with the shoulder joints, so a longer leg keeps the meters', () => {
    // The thigh and the shin span 0.15 units: the factor 2 raises the shoulder joints from 0.5 to
    // 0.65 units, and the landmark from 0.5 m to 0.65 m.
    expect(keptHeight(short, { ...short, legFactor: 2 })).toBeCloseTo(1.3, 12);
    expect(keptHeight(short, { ...short, headFactor: 1.2, neckFactor: 0.8 })).toBe(1);

    const variant = parseConfig(variantText(text, 'legFactor=2', true));
    expect(variant.app.shoulders).toBeCloseTo(0.65, 12);
    expect(armReach(variant, 'L')).toBeCloseTo(armReach(short, 'L'), 12);
    expect(reachLine(variant)).toContain('1.0000 m for each unit');
    expect(parseConfig(variantText(text, 'headFactor=1.2', true)).app.shoulders).toBe(0.5);
  });

  it('gives the height of ANIMALS the factor, and keeps the entry with the factor 1', () => {
    const rabbit = ANIMALS.get('rabbit');
    expect(rigSettings('rabbit', short, 1).settings).toBe(rabbit);
    expect(rigSettings('rabbit', short, 1.3).settings.height).toBeCloseTo(
      (rabbit?.height ?? 0) * 1.3,
      12,
    );
    const variant = parseConfig(variantText(text, 'legFactor=2', false));
    expect(rigSettings('red-panda', variant, 1.3).settings.height).toBeCloseTo(0.65, 12);
  });
});

describe('checkTexts', () => {
  it('gives the base text as read, then each variant made from the same text', () => {
    // The text of the file, with a number that JSON writes in another form.
    const text = `${JSON.stringify(figure(1)).replace('"armFactor":1', '"armFactor":1.0')}\n`;
    const [base, variant, ...rest] = checkTexts(text, ['armFactor=1.2'], true);
    expect(base).toBe(text);
    expect(rest).toEqual([]);
    expect(JSON.parse(variant ?? '')).toEqual({ ...JSON.parse(text), armFactor: 1.2 });
  });

  it('stops before the first rig when a variant does not fit', () => {
    expect(() => checkTexts(JSON.stringify(figure(1)), ['armFactor=1.2', ''], true)).toThrow(
      /has no change/,
    );
  });
});
