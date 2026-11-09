import { describe, expect, it } from 'vitest';

import { sceneOf } from '../src/pose/test-scene.ts';
import { INSTRUMENT_PART, VIOLINIST_SWEEP } from '../src/pose/test-sweep-roles.ts';
import type { PairDepth, RoleSweep } from '../src/pose/test-sweep.ts';
import { FOLD_ROLES, roleBodies } from './fold-probe.ts';
import type { FoldCount, FoldReport, RoleSource } from './fold-probe.ts';
import {
  FIT_DEMOS,
  FIT_FORMAT,
  FIT_STEP,
  GRID_LIMIT,
  chooseDemos,
  faceSections,
  fitSweep,
  freeGaps,
  fitJson,
  fitTable,
  foldShares,
  gridChanges,
  gridVariants,
  parseFitOptions,
  readFit,
  restGaps,
  sortFitRows,
  splitHeld,
  worstPairs,
} from './hold-fit.ts';
import type { FitRow } from './hold-fit.ts';
import type { HoldReach } from './hold-reach.ts';
import { patchedDemo } from './patch-demos.ts';
import { NO_TARGETS } from './pose-depth.ts';
import type { DemoResult } from './pose-depth.ts';
import { formatVersion } from './ref-tree.ts';

/**
 * Gives a role of `FOLD_ROLES`.
 *
 * @param name The name of the role.
 * @returns The role.
 */
function foldRole(name: string): RoleSource {
  const role = FOLD_ROLES.get(name);
  if (!role) {
    throw new Error(`FOLD_ROLES has no ${name}.`);
  }
  return role;
}

/**
 * Makes the deepest point of a pair.
 *
 * @param part The moving part.
 * @param into The obstacle.
 * @param depth The depth, in meters.
 * @returns The pair.
 */
function pair(part: string, into: string, depth: number): PairDepth {
  return { part, into, depth, song: 1, wall: 11, bone: null, along: Number.NaN };
}

/**
 * Makes a count of a sample set.
 *
 * @param samples The samples.
 * @param withFold The samples with a fold.
 * @returns The count.
 */
function count(samples: number, withFold: number): FoldCount {
  return {
    samples,
    withFold,
    most: 0,
    split: { L: 0, R: 0, other: 0 },
    worst: '',
    bones: new Map(),
    byFace: new Map(),
    faceWorst: new Map(),
  };
}

/** A report of folds with 2% play folds, 10% lift folds, and 13 faces in the worst rest sample. */
const FOLDS: FoldReport = {
  demos: ['a.mid'],
  faces: 10,
  mesh: null,
  sets: {
    rest: { ...count(1, 1), most: 13, split: { L: 11, R: 0, other: 2 } },
    play: count(100, 2),
    lift: count(10, 1),
  },
};

describe('parseFitOptions', () => {
  it('takes the base first, each variant, the demos with no .mid, and the step of 1 s', () => {
    const options = parseFitOptions([
      'fox-violinist',
      '--set',
      'violin@fox-red.slant=-20deg',
      '--demo',
      'brahms-2.mid',
      '--demo',
      'beethoven-8',
    ]);
    expect(options.variants).toEqual(['', 'violin@fox-red.slant=-20deg']);
    expect(options.demos).toEqual(['brahms-2', 'beethoven-8']);
    expect(options.step).toBe(FIT_STEP);
    expect(FIT_STEP).toBe(1);
    expect(parseFitOptions(['pianist', '--step', '0.5']).step).toBe(0.5);
    expect(parseFitOptions(['pianist', '--base', 'main']).base).toBe('main');
    expect(parseFitOptions(['pianist', '--json', 'out.json']).json).toBe('out.json');
  });

  it('adds the variants of the grids after the variants of --set, and takes --faces', () => {
    const options = parseFitOptions([
      'pianist',
      '--set',
      'piano.lean=16deg',
      '--grid',
      'piano.lean=10deg:20deg:10deg',
      '--faces',
      '5',
    ]);
    expect(options.variants).toEqual([
      '',
      'piano.lean=16deg',
      'piano.lean=10deg',
      'piano.lean=20deg',
    ]);
    expect(options.grids).toEqual(['piano.lean=10deg:20deg:10deg']);
    expect(options.faces).toBe(5);
    expect(parseFitOptions(['pianist']).faces).toBe(0);
    expect(() => parseFitOptions(['pianist', '--faces', '0'])).toThrow(/above 0/);
    expect(() => parseFitOptions(['pianist', '--grid', 'piano.nothing=1:2:1'])).toThrow(
      /not known/,
    );
  });

  it('stops on --base with --json', () => {
    expect(() => parseFitOptions(['pianist', '--base', 'main', '--json', 'out.json'])).toThrow(
      'do not go together',
    );
  });

  it('stops on an unknown role, an unknown option, a change that does not fit, or a bad step', () => {
    expect(() => parseFitOptions(['harpist'])).toThrow(/Usage/);
    expect(() => parseFitOptions(['pianist', '--gaps', 'x'])).toThrow(/not known/);
    expect(() => parseFitOptions(['pianist', '--set', 'piano.nothing=1'])).toThrow(/not known/);
    expect(() => parseFitOptions(['pianist', '--step', '0'])).toThrow(/above 0/);
    expect(() => parseFitOptions(['pianist', '--demo'])).toThrow(/no value/);
  });
});

describe('gridChanges', () => {
  it('gives each value from the first to the last at each step, with both ends and the unit', () => {
    expect(gridChanges('piano.lean=10deg:20deg:5deg')).toEqual([
      'piano.lean=10deg',
      'piano.lean=15deg',
      'piano.lean=20deg',
    ]);
    expect(gridChanges('piano.curl=0.3:0.1:0.1')).toEqual([
      'piano.curl=0.3',
      'piano.curl=0.2',
      'piano.curl=0.1',
    ]);
    expect(gridChanges('piano.curl=0:0.25:0.1')).toEqual([
      'piano.curl=0',
      'piano.curl=0.1',
      'piano.curl=0.2',
    ]);
  });

  it('stops on a grid that is not <path>=<a>:<b>:<step>, a mixed unit, or a step of 0', () => {
    expect(() => gridChanges('piano.lean=10:20')).toThrow(/not <path>/);
    expect(() => gridChanges('piano.lean=10deg:20:5deg')).toThrow(/unit deg/);
    expect(() => gridChanges('piano.lean=10:x:5')).toThrow(/not a number/);
    expect(() => gridChanges('piano.lean=10:20:0')).toThrow(/above 0/);
  });
});

describe('gridVariants', () => {
  it('gives the product of the grids, the first grid outermost', () => {
    expect(gridVariants(['a.x=1:2:1', 'b.y=0:1:1'])).toEqual([
      'a.x=1;b.y=0',
      'a.x=1;b.y=1',
      'a.x=2;b.y=0',
      'a.x=2;b.y=1',
    ]);
    expect(gridVariants([])).toEqual([]);
  });

  it('stops on more variants than the limit, and states the count', () => {
    expect(GRID_LIMIT).toBe(40);
    expect(() => gridVariants(['a.x=1:7:1', 'b.y=1:6:1'])).toThrow('7 × 6 = 42 variants');
    expect(gridVariants(['a.x=1:8:1', 'b.y=1:5:1'])).toHaveLength(40);
  });
});

describe('chooseDemos', () => {
  const withRole = ['a', 'beethoven-8', 'brahms-2', 'mozart-k525'];
  const notes = new Map<string, number>();

  it('takes the demos of FIT_DEMOS with the role by default', () => {
    expect(FIT_DEMOS).toContain('beethoven-8');
    expect(FIT_DEMOS).toContain('mozart-k525');
    expect(chooseDemos([], withRole, notes)).toEqual(['beethoven-8', 'mozart-k525']);
  });

  it('takes the demo with the most notes when none of FIT_DEMOS has the role', () => {
    expect(
      chooseDemos(
        [],
        ['a', 'b', 'c'],
        new Map([
          ['a', 3],
          ['b', 5],
          ['c', 5],
        ]),
      ),
    ).toEqual(['b']);
  });

  it('takes all demos of the role with all', () => {
    expect(chooseDemos(['all'], withRole, notes)).toEqual(withRole);
  });

  it('takes the demos of --demo', () => {
    expect(chooseDemos(['brahms-2', 'a'], withRole, notes)).toEqual(['a', 'brahms-2']);
  });
});

describe('worstPairs', () => {
  const role: RoleSweep = {
    ...VIOLINIST_SWEEP,
    contact: 0.015,
    accepted: [
      {
        part: 'paws',
        into: 'body',
        samples: 'play',
        depth: 0.05,
        reason: 'test',
      },
    ],
  };
  const results: DemoResult[] = [
    {
      demo: 'a violinist 1 (rabbit, chair)',
      species: 'rabbit',
      headHeight: 0.3,
      sets: [
        {
          name: 'play',
          pairs: [pair('paws', 'body', 0.04), pair('bow', 'violin', 0.01)],
          gaps: [],
        },
      ],
      targets: [],
      reached: NO_TARGETS,
    },
    {
      demo: 'b violinist 2 (fox-red, chair)',
      species: 'fox-red',
      headHeight: 0.3,
      sets: [
        { name: 'play', pairs: [pair('bow', 'violin', 0.012)], gaps: [] },
        { name: 'lift', pairs: [pair('forearms', 'body', 0.02)], gaps: [] },
      ],
      targets: [],
      reached: NO_TARGETS,
    },
  ];

  it('gives the pair of each set nearest to its limit or most over it, with its demo', () => {
    const worst = worstPairs(role, results);
    expect(worst.map((w) => [w.set, w.demo, w.pair.part, w.pair.depth, w.limit])).toEqual([
      ['play', 'b violinist 2 (fox-red, chair)', 'bow', 0.012, 0.015],
      ['lift', 'b violinist 2 (fox-red, chair)', 'forearms', 0.02, 0.015],
    ]);
  });
});

describe('fitTable', () => {
  const reach: HoldReach = {
    arms: { L: 0.4, R: 0.4 },
    length: 0.25,
    scale: 0.5,
    scroll: 0.38,
    stopRange: [0, 1],
    bowRange: [0.03, 0.18],
    hairLength: 0.2,
    ruleFactor: 0.9,
  };
  const row: FitRow = {
    variant: '',
    folds: foldShares(FOLDS),
    depths: [
      { set: 'play', demo: 'a', pair: pair('paws', 'body', 0.02), limit: 0.015 },
      { set: 'lift', demo: 'a', pair: pair('bow', 'violin', 0.01), limit: 0.015 },
    ],
    reach: null,
    seconds: 1,
    results: [],
    faces: [],
    held: null,
    gaps: [],
    free: [],
    lap: null,
    turns: null,
    facesOf: [],
    topFolds: [],
    spare: null,
  };

  it('marks a depth over its limit and play folds over the goal of 1%', () => {
    const [header, , base] = fitTable([row]);
    expect(header).toBe(
      '| Variant | Play folds | Lift folds | Rest faces (by side) | play depth cm (limit) | lift depth cm (limit) |',
    );
    expect(base).toBe(
      '| base | 2.0% (2/100) OVER | 10.0% (1/10) | 13 (L 11 / R 0 / other 2) | 2.0 paws>body (1.5) OVER | 1.0 bow>violin (1.5) |',
    );
  });

  it('adds the instrument in the body, the rest gap, and the rest reach of each free paw', () => {
    const flute: FitRow = {
      ...row,
      held: { set: 'lower', demo: 'a', pair: pair('instrument', 'body', 0.016), limit: 0.015 },
      gaps: [{ paw: 'paw L', gap: 0.004, demo: 'a' }],
      free: [{ side: 'L', share: 1.042 }],
    };
    const lines = fitTable([{ ...row, free: [{ side: 'L', share: 0.995 }] }, flute]);
    expect(lines[0]).toMatch(
      /\| lift depth cm \(limit\) \| Instrument in body cm \| Rest gap paw L cm \| Rest reach L \|$/,
    );
    expect(lines[2]).toMatch(/\| - \| - \| 0\.995 \|$/);
    expect(lines[3]).toMatch(/\| 1\.6 lower \| 0\.4 \| 1\.042 OVER \|$/);
    expect(fitTable([row])[0]).not.toContain('Instrument');
  });

  it('gives back the rows of its JSON text, with NaN for a depth with no bone', () => {
    const none = { ...pair('claws', 'body', 0), bone: null, along: Number.NaN };
    const results: DemoResult[] = [
      {
        demo: 'a violinist 1 (rabbit, chair)',
        species: 'rabbit',
        headHeight: 0.3,
        sets: [{ name: 'play', pairs: [none], gaps: [] }],
        targets: [],
        reached: NO_TARGETS,
      },
    ];
    const run = {
      demos: ['a'],
      rows: [
        {
          ...row,
          depths: [{ set: 'play', demo: 'a', pair: none, limit: 0.015 }],
          results,
          held: { set: 'rest', demo: 'a', pair: none, limit: 0.015 },
          gaps: [{ paw: 'paw L', gap: 0, demo: 'a' }],
          free: [{ side: 'L' as const, share: null }],
        },
      ],
    };
    expect(readFit(fitJson(run))).toEqual(run);
    expect(formatVersion(fitJson(run))).toBe(FIT_FORMAT);
  });

  it('sorts the variants by the play folds, then by the deepest point, after the base', () => {
    const variant = (name: string, withFold: number, depth: number): FitRow => ({
      ...row,
      variant: name,
      folds: { ...row.folds, play: { samples: 100, withFold } },
      depths: [{ set: 'play', demo: 'a', pair: pair('paws', 'body', depth), limit: 0.015 }],
    });
    const rows = [
      variant('', 9, 0),
      variant('a', 3, 0.02),
      variant('b', 1, 0.03),
      variant('c', 3, 0.01),
    ];
    expect(sortFitRows(rows).map((r) => r.variant)).toEqual(['', 'b', 'c', 'a']);
  });

  it('writes the faces of the base and of the best variant', () => {
    const rows: FitRow[] = [
      { ...row, faces: ['base face'] },
      { ...row, variant: 'a', folds: { ...row.folds, play: { samples: 100, withFold: 5 } } },
      {
        ...row,
        variant: 'b',
        folds: { ...row.folds, play: { samples: 100, withFold: 1 } },
        faces: ['b face'],
      },
    ];
    expect(faceSections(rows[0], 'the base', rows)).toEqual([
      '',
      'Faces of the base:',
      '',
      'base face',
      '',
      'Faces of the best variant, b:',
      '',
      'b face',
    ]);
    // With --base, the row of the commit is the base, and the working tree follows it.
    const commit: FitRow = { ...row, variant: 'main', faces: ['main face'] };
    expect(faceSections(commit, 'main', rows.slice(0, 1))).toEqual([
      '',
      'Faces of main:',
      '',
      'main face',
      '',
      'Faces of the working tree:',
      '',
      'base face',
    ]);
  });

  it('adds the rule scale, the violin length, and the reached ranges for a violin role', () => {
    const lines = fitTable([{ ...row, variant: 'violin.lean=1', reach }]);
    expect(lines[0]).toContain('| Rule scale | Violin m | stopRange | bowRange |');
    expect(lines[2]).toMatch(
      /^\| violin\.lean=1 \| .* \| 0\.450 \| 0\.250 \| 0\.00 to 1\.00 \| 0\.030 to 0\.180 m of 0\.200 m \|$/,
    );
  });
});

describe('fitSweep', async () => {
  const scene = sceneOf((await patchedDemo('brahms-2.mid')).bytes);

  it('sweeps only the bodies of the role in the sweep role that holds them', () => {
    const foxes = foldRole('fox-violinist');
    const rabbits = foldRole('violinist');
    const foxModels = new Set(roleBodies(foxes, scene).map((body) => body.model));
    const rabbitModels = new Set(roleBodies(rabbits, scene).map((body) => body.model));
    const foxSweep = fitSweep(foxes, scene);
    const rabbitSweep = fitSweep(rabbits, scene);

    expect(foxSweep?.role).toBe('violinist');
    expect(rabbitSweep?.role).toBe('violinist');
    const foxPlayers = foxSweep?.players(scene) ?? [];
    const rabbitPlayers = rabbitSweep?.players(scene) ?? [];
    expect(foxPlayers.length).toBeGreaterThan(0);
    expect(rabbitPlayers.length).toBeGreaterThan(0);
    expect(foxPlayers.every((player) => foxModels.has(player.model))).toBe(true);
    expect(rabbitPlayers.every((player) => rabbitModels.has(player.model))).toBe(true);
  });
});

describe('splitHeld', () => {
  it('gives the deepest instrument in the body, and takes each pair of it out', () => {
    const results: DemoResult[] = [
      {
        demo: 'a flutist 3 (fox-tan, chair)',
        species: 'fox-tan',
        headHeight: 0.32,
        sets: [
          {
            name: 'rest',
            pairs: [
              pair('upper arms', 'body', 0.01),
              pair(INSTRUMENT_PART.name, 'body', 0.004),
              pair(INSTRUMENT_PART.name, 'flute', 0.2),
            ],
            gaps: [],
          },
          { name: 'lower', pairs: [pair(INSTRUMENT_PART.name, 'body', 0.007)], gaps: [] },
        ],
        targets: [],
        reached: NO_TARGETS,
      },
    ];
    const { held, results: kept } = splitHeld(VIOLINIST_SWEEP, results);
    expect(held?.set).toBe('lower');
    expect(held?.pair.depth).toBe(0.007);
    expect(kept[0]?.sets.map((set) => set.pairs.map((p) => p.part))).toEqual([['upper arms'], []]);
    expect(splitHeld(VIOLINIST_SWEEP, []).held).toBeNull();
  });
});

describe('restGaps', () => {
  it('gives the largest smallest gap of each paw in the rest over the players', () => {
    const gap = (part: string, value: number) => ({
      part,
      into: 'body',
      gap: value,
      song: 0,
      wall: 10,
      bone: null,
    });
    const result = (demo: string, rest: number, play: number): DemoResult => ({
      demo,
      species: 'fox-tan',
      headHeight: 0.32,
      sets: [
        { name: 'rest', pairs: [], gaps: [gap('paw L', rest)] },
        { name: 'play', pairs: [], gaps: [gap('paw L', play)] },
      ],
      targets: [],
      reached: NO_TARGETS,
    });
    expect(
      restGaps([result('a', 0, 0.5), result('b', 0.012, 0.5), result('c', Infinity, 0.5)]),
    ).toEqual([{ paw: 'paw L', gap: 0.012, demo: 'b' }]);
    expect(restGaps([])).toEqual([]);
  });
});

describe('freeGaps and the instrument part', async () => {
  const scene = sceneOf((await patchedDemo('beethoven-8.mid')).bytes);

  it('measures the free paw of a seated flutist in the rest only, and no paw of a violinist', () => {
    const flutist = foldRole('flutist');
    const sweep = fitSweep(flutist, scene);
    const [player] = sweep?.players(scene) ?? [];
    if (!player) {
      throw new Error('The demo has no flutist.');
    }
    const gaps = freeGaps(flutist);
    expect(gaps('rest', player).map((p) => [p.part.name, p.into])).toEqual([['paw L', 'body']]);
    expect(gaps('play', player)).toEqual([]);
    const standing = { ...player, model: { ...player.model, support: 'stand' as const } };
    expect(gaps('rest', standing)).toEqual([]);
    expect(freeGaps(foldRole('fox-violinist'))('rest', player)).toEqual([]);
  });

  it('keeps the instrument part in the sweep of a role that holds its instrument', () => {
    const parts = fitSweep(foldRole('flutist'), scene)?.parts.map((part) => part.name) ?? [];
    expect(parts).toContain(INSTRUMENT_PART.name);
  });
});
