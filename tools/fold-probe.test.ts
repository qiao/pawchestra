import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { patchedDemo } from './patch-demos.ts';
import { BODY_BONES } from '../src/models/body-format.ts';
import {
  FOLD_FORMAT,
  FOLD_ROLES,
  FOLD_ROLE_TABLE,
  SAMPLE_SETS,
  faceCompareLines,
  faceFacts,
  faceSide,
  faceLines,
  foldAngle,
  foldJson,
  foldLines,
  foldedFaces,
  mainBone,
  meanTurn,
  probeFolds,
  readFaceJson,
  readFoldJson,
  relativeTurn,
  roleAnimal,
  sameFaces,
  sideSplit,
  splitText,
  turnAngle,
  turnBins,
  turnBone,
  turnLines,
  turnProbe,
  worstFold,
} from './fold-probe.ts';
import type {
  FaceJson,
  FaceRecord,
  FaceWorst,
  FoldCount,
  FoldReport,
  TurnSample,
  WorstSample,
} from './fold-probe.ts';
import { ROOT, formatVersion, refRoleKeys } from './ref-tree.ts';
import { ANIMALS } from './body-module.ts';
import type { Quat } from '../src/models/tuples.ts';

/** The identity matrix, column by column. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Makes a mesh of one triangle: the first two corners on bone 0, the third corner on bone 1.
 *
 * @returns The mesh.
 */
function triangle(): Parameters<typeof foldedFaces>[0] {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    joints: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    corners: new Uint32Array([0, 1, 2]),
  };
}

describe('foldedFaces', () => {
  it('finds no fold in the bind pose', () => {
    const mesh = triangle();
    expect(foldedFaces(mesh, [...IDENTITY, ...IDENTITY], mesh.positions)).toEqual([]);
  });

  it('finds a face whose corner moves across the opposite edge', () => {
    const mesh = triangle();
    // Bone 1 moves the third corner 2 m down: from (0, 1, 0) to (0, -1, 0).
    const moved = [...IDENTITY.slice(0, 12), 0, -2, 0, 1];
    const posed = new Float32Array([0, 0, 0, 1, 0, 0, 0, -1, 0]);
    expect(foldedFaces(mesh, [...IDENTITY, ...moved], posed)).toEqual([0]);
  });
});

describe('foldAngle', () => {
  it('gives 0° in the bind pose and 180° for a face whose corner crosses the opposite edge', () => {
    const mesh = triangle();
    expect(foldAngle(mesh, [...IDENTITY, ...IDENTITY], mesh.positions, 0)).toBeCloseTo(0, 6);
    const moved = [...IDENTITY.slice(0, 12), 0, -2, 0, 1];
    const posed = new Float32Array([0, 0, 0, 1, 0, 0, 0, -1, 0]);
    expect(foldAngle(mesh, [...IDENTITY, ...moved], posed, 0)).toBeCloseTo(180, 6);
  });
});

describe('turnBone', () => {
  /** The triangle of the folded pose, with bone 2 (spine, a child of hips) on the third corner. */
  const mesh = {
    ...triangle(),
    joints: new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]),
    colors: new Float32Array(),
    finishes: new Uint8Array(),
    correctives: [],
  };

  it('names the bone whose turn from its parent folds the face', () => {
    // Bones 0 (root) and 1 (hips) stay. Bone 2 (spine) moves the third corner 2 m down.
    const moved = [...IDENTITY.slice(0, 12), 0, -2, 0, 1];
    const matrices = new Float32Array([...IDENTITY, ...IDENTITY, ...moved]);
    const turn = turnBone(mesh, { matrices, correctives: new Float32Array() }, 0);
    expect(turn.bone).toBe(BODY_BONES[2]);
    expect(turn.turn).toBeCloseTo(180, 6);
  });

  it('names no bone in the bind pose', () => {
    const matrices = new Float32Array([...IDENTITY, ...IDENTITY, ...IDENTITY]);
    expect(turnBone(mesh, { matrices, correctives: new Float32Array() }, 0)).toEqual({
      bone: '',
      turn: 0,
    });
  });
});

describe('mainBone', () => {
  it('gives the body bone with the largest weight over the corners', () => {
    expect(mainBone(triangle(), 0)).toBe(BODY_BONES[0]);
  });
});

/**
 * Makes a mesh of two triangles that share an edge. The first vertex has three bones, and the
 * other vertices have one bone each.
 *
 * @returns The mesh.
 */
function twoTriangles(): Parameters<typeof faceFacts>[0] {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
    joints: new Uint8Array([3, 5, 6, 0, 1, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0]),
    weights: new Float32Array([0.2, 0.7, 0.1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    corners: new Uint32Array([0, 1, 2, 1, 3, 2]),
  };
}

/**
 * Makes a count of one sample set with the samples in which each face folds.
 *
 * @param samples The number of samples.
 * @param byFace The samples of each face, by the index of the face.
 * @returns The count.
 */
function countOf(samples: number, byFace: readonly [number, number][]): FoldCount {
  return {
    samples,
    withFold: 0,
    most: 0,
    split: { L: 0, R: 0, other: 0 },
    worst: '',
    bones: new Map(),
    byFace: new Map(byFace),
    faceWorst: new Map(),
  };
}

describe('faceFacts', () => {
  it('gives the middle, the corner angles, and the weights of each corner, the largest first', () => {
    const facts = faceFacts(twoTriangles(), 0);
    expect(facts.face).toBe(0);
    expect(facts.middle.map((x) => Number(x.toFixed(6)))).toEqual([0.333333, 0.333333, 0]);
    expect(facts.angles.map((a) => Number(a.toFixed(6)))).toEqual([90, 45, 45]);
    expect(facts.weights[0]).toEqual([
      { bone: BODY_BONES[5], weight: expect.closeTo(0.7, 6) },
      { bone: BODY_BONES[3], weight: expect.closeTo(0.2, 6) },
      { bone: BODY_BONES[6], weight: expect.closeTo(0.1, 6) },
    ]);
    expect(facts.weights[1]).toEqual([{ bone: BODY_BONES[1], weight: 1 }]);
  });
});

describe('faceLines', () => {
  it('lists the faces that fold in the most samples of all sets, with the share of each set', () => {
    const report: FoldReport = {
      demos: ['a.mid'],
      faces: 2,
      mesh: {
        ...twoTriangles(),
        colors: new Float32Array(),
        finishes: new Uint8Array(),
        correctives: [],
      },
      sets: {
        rest: countOf(4, [[0, 4]]),
        play: countOf(100, [
          [0, 1],
          [1, 30],
        ]),
        lift: countOf(10, [[1, 5]]),
      },
    };
    const rows = faceLines(report, 5).filter((line) => /^\| \d/.test(line));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^\| 1 \| 0\.0% \| 30\.0% \| 50\.0% \| /);
    expect(rows[1]).toMatch(/^\| 0 \| 100\.0% \| 1\.0% \| 0\.0% \| /);
    expect(faceLines(report, 1).filter((line) => /^\| \d/.test(line))).toHaveLength(1);
  });

  it('names no face when no face folds', () => {
    const empty: FoldReport = {
      demos: [],
      faces: 0,
      mesh: null,
      sets: { rest: countOf(1, []), play: countOf(1, []), lift: countOf(1, []) },
    };
    expect(faceLines(empty, 3)).toEqual(['No face folds.']);
  });
});

/**
 * Makes a worst fold.
 *
 * @param angle The angle of the fold, in degrees.
 * @param label The sample.
 * @returns The worst fold.
 */
function fold(angle: number, label = 'a.mid 1.00 s'): FaceWorst {
  return { label, angle, bone: 'neck', turn: 40 };
}

/**
 * Makes a worst fold of a sample set, with no corners.
 *
 * @param angle The angle of the fold, in degrees.
 * @param label The sample.
 * @returns The worst fold.
 */
function sampleFold(angle: number, label?: string): WorstSample {
  return { ...fold(angle, label), correctiveWeights: [], corners: [] };
}

describe('worstFold', () => {
  it('gives the fold with the largest angle over all sets', () => {
    const report: FoldReport = {
      demos: [],
      faces: 2,
      mesh: null,
      sets: { rest: countOf(1, []), play: countOf(1, []), lift: countOf(1, []) },
    };
    report.sets.play.faceWorst.set(1, sampleFold(150, 'play'));
    report.sets.lift.faceWorst.set(1, sampleFold(120, 'lift'));
    report.sets.rest.faceWorst.set(1, sampleFold(100, 'rest'));
    expect(worstFold(report, 1)?.label).toBe('play');
    expect(worstFold(report, 0)).toBeNull();
  });
});

/**
 * Makes a folded face of the JSON text.
 *
 * @param face The index of the face.
 * @param play The play samples with a fold.
 * @param middle The middle of the face.
 * @returns The face.
 */
function record(face: number, play: number, middle: FaceRecord['middle'] = [0, 0, 0]): FaceRecord {
  return { face, folds: { rest: 0, play, lift: 0 }, bone: 'neck', middle, worst: fold(120) };
}

/**
 * Makes the folds of a tree.
 *
 * @param topology The hash of the corners.
 * @param faces The folded faces.
 * @returns The folds, with 100 play samples.
 */
function folds(topology: string, faces: FaceRecord[]): FaceJson {
  const set = { samples: 100, withFold: 0, most: 0, split: { L: 0, R: 0, other: 0 } };
  return { sets: { rest: set, play: set, lift: set }, topology, faces, middles: {} };
}

describe('sameFaces', () => {
  it('takes the same index when the corners are the same, else the nearest middle within 1 cm', () => {
    const other = folds('b', [record(7, 1, [0.005, 0, 0]), record(4, 1, [0.3, 0, 0])]);
    expect(sameFaces(folds('b', [record(4, 1)]), other).get(4)?.face).toBe(4);
    expect(sameFaces(folds('a', [record(4, 1)]), other).get(4)?.face).toBe(7);
    expect(sameFaces(folds('a', [record(4, 1, [0.1, 0, 0])]), other).size).toBe(0);
  });

  it('pairs each face of the other corners one time at most, the nearest pair first', () => {
    const tree = folds('a', [record(1, 1, [0, 0, 0]), record(2, 1, [0.004, 0, 0])]);
    const base = folds('b', [record(11, 1, [0.002, 0, 0]), record(12, 1, [0.009, 0, 0])]);
    const pairs = sameFaces(tree, base);
    expect([...pairs].map(([face, other]) => [face, other.face])).toEqual([
      [1, 11],
      [2, 12],
    ]);

    const rows = faceCompareLines('main', base, tree, 5).filter((line) => /^\| [\d-]/.test(line));
    expect(
      rows.map((row) =>
        row
          .split('|')
          .slice(1, 3)
          .map((cell) => cell.trim()),
      ),
    ).toEqual([
      ['1', '11'],
      ['2', '12'],
    ]);
  });
});

describe('faceCompareLines', () => {
  it('gives the shares of both trees, and marks the new and the gone faces', () => {
    const base = folds('t', [record(1, 10), record(2, 5)]);
    const tree = folds('t', [record(1, 20), record(3, 8)]);
    const rows = faceCompareLines('main', base, tree, 5).filter((line) => /^\| [\d-]/.test(line));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(
      /^\| 1 \| 1 \| 0\.0% \/ 10\.0% \/ 0\.0% \| 0\.0% \/ 20\.0% \/ 0\.0% \|  \|/,
    );
    expect(rows[1]).toMatch(/^\| 3 \| - \| .* \| new \|/);
    expect(rows[2]).toMatch(/^\| - \| 2 \| .* \| gone \|/);
  });
});

describe('foldJson and readFaceJson', () => {
  it('write and read each folded face with its worst fold and the hash of the corners', () => {
    const report: FoldReport = {
      demos: ['a.mid'],
      faces: 2,
      mesh: {
        ...twoTriangles(),
        colors: new Float32Array(),
        finishes: new Uint8Array(),
        correctives: [],
      },
      sets: { rest: countOf(1, []), play: countOf(10, [[1, 3]]), lift: countOf(5, [[1, 1]]) },
    };
    report.sets.play.faceWorst.set(1, sampleFold(130));
    expect(formatVersion(foldJson(report))).toBe(FOLD_FORMAT);
    const read = readFaceJson(foldJson(report));
    expect(read.topology).toMatch(/^[0-9a-f]{64}$/);
    expect(read.faces).toEqual([
      {
        face: 1,
        folds: { rest: 0, play: 3, lift: 1 },
        bone: mainBone(twoTriangles(), 1),
        middle: faceFacts(twoTriangles(), 1).middle,
        worst: fold(130),
      },
    ]);
  });
});

describe('foldJson and readFoldJson', () => {
  it('write and read the samples and the samples with a fold of each set', () => {
    const report: FoldReport = {
      demos: ['a.mid'],
      faces: 2,
      mesh: null,
      sets: { rest: countOf(1, [[0, 1]]), play: countOf(200, []), lift: countOf(30, []) },
    };
    report.sets.rest.withFold = 1;
    report.sets.rest.most = 13;
    report.sets.rest.split = { L: 11, R: 0, other: 2 };
    report.sets.play.withFold = 7;
    const none = { L: 0, R: 0, other: 0 };
    expect(readFoldJson(foldJson(report))).toEqual({
      rest: { samples: 1, withFold: 1, most: 13, split: { L: 11, R: 0, other: 2 } },
      play: { samples: 200, withFold: 7, most: 0, split: none },
      lift: { samples: 30, withFold: 0, most: 0, split: none },
    });
  });

  it('stops on a set with no whole counts', () => {
    const set = '{"samples":1,"withFold":0,"most":0,"split":{"L":0,"R":0,"other":0}}';
    expect(() => readFoldJson(`{"sets":{"rest":${set}}}`)).toThrow(/play/);
    expect(() =>
      readFoldJson('{"sets":{"rest":{"samples":1,"withFold":0,"most":0,"split":{"L":0}}}}'),
    ).toThrow(/rest/);
    expect(() => readFoldJson('{}')).toThrow(/rest/);
  });
});

describe('probeFolds', async () => {
  const boulanger = await patchedDemo('boulanger-matin.mid');
  const beethoven = await patchedDemo('beethoven-9.mid');
  const pianist = FOLD_ROLES.get('pianist');
  if (!pianist) {
    throw new Error('The pianist has no role.');
  }

  it('counts each sample set of the demos with the role, and skips the other demos', () => {
    const report = probeFolds(pianist, [boulanger, beethoven], 8);
    expect(report.demos).toEqual(['boulanger-matin.mid']);
    expect(report.faces).toBeGreaterThan(1000);
    expect(report.sets.rest.samples).toBe(1);
    expect(report.mesh?.corners.length).toBe(report.faces * 3);
    for (const set of SAMPLE_SETS) {
      const count = report.sets[set];
      expect(count.samples, set).toBeGreaterThan(0);
      expect(count.withFold, set).toBeLessThanOrEqual(count.samples);
      expect(Math.max(0, ...count.byFace.values()), set).toBeLessThanOrEqual(count.withFold);
      expect(count.split.L + count.split.R + count.split.other, set).toBe(count.most);
      for (const bone of count.bones.keys()) {
        expect(BODY_BONES, bone).toContain(bone);
      }
      expect(
        [...count.faceWorst.keys()].toSorted((a, b) => a - b),
        set,
      ).toEqual([...count.byFace.keys()].toSorted((a, b) => a - b));
      for (const worst of count.faceWorst.values()) {
        expect(worst.angle, set).toBeGreaterThan(90);
        expect(BODY_BONES, set).toContain(worst.bone);
      }
    }

    const lines = foldLines('pianist', report, 8);
    for (const set of [...SAMPLE_SETS, 'all']) {
      expect(
        lines.some((line) => line.startsWith(`| ${set} |`)),
        set,
      ).toBe(true);
    }
  }, 30_000);
});

describe('roleAnimal', () => {
  it('gives each role one animal of ANIMALS, for the body of --glb', () => {
    for (const [name, role] of FOLD_ROLES) {
      expect(ANIMALS.has(roleAnimal(role)), name).toBe(true);
    }
  });
});

describe('FOLD_ROLE_TABLE', () => {
  it('names the module and the table of the roles, for the role check of --base', () => {
    const keys = refRoleKeys(ROOT, { ...FOLD_ROLE_TABLE, name: 'flutist' });
    expect(keys).toEqual([...FOLD_ROLES.keys()]);
  });
});

/**
 * Gives a turn around an axis.
 *
 * @param axis The axis.
 * @param degrees The angle, in degrees.
 * @returns The turn.
 */
function turnOf(axis: readonly [number, number, number], degrees: number): Quat {
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(...axis).normalize(),
    (degrees * Math.PI) / 180,
  );
  return [q.x, q.y, q.z, q.w];
}

describe('faceSide', () => {
  it('gives the side of the middle of a face: the left side of the animal at x < 0', () => {
    const mesh = {
      positions: new Float32Array([-1, 0, 0, -0.5, 1, 0, 0.2, 0, 0, 1, 1, 0]),
      corners: new Uint32Array([0, 1, 2, 1, 2, 3]),
    };
    expect(faceSide(mesh, 0)).toBe('L');
    expect(faceSide(mesh, 1)).toBe('R');
  });
});

describe('relativeTurn', () => {
  it('takes the turn of the frame bone off the turn of the bone', () => {
    const chest = new Matrix4().makeRotationY(Math.PI / 6).setPosition(1, 2, 3);
    const arm = new Matrix4()
      .makeRotationY(Math.PI / 6)
      .multiply(new Matrix4().makeRotationZ(Math.PI / 2));
    const matrices = [...IDENTITY, ...chest.toArray(), ...arm.toArray()];
    expect(turnAngle(relativeTurn(matrices, 2, 1), turnOf([0, 0, 1], 90))).toBeCloseTo(0, 4);
    expect(turnAngle(relativeTurn(matrices, 1, 0), turnOf([0, 1, 0], 30))).toBeCloseTo(0, 4);
  });
});

describe('turnAngle and meanTurn', () => {
  it('gives the angle between two turns with no regard to the sign of the quaternion', () => {
    const a = turnOf([1, 0, 0], 40);
    expect(turnAngle(a, turnOf([1, 0, 0], 10))).toBeCloseTo(30, 6);
    expect(turnAngle(a, [-a[0], -a[1], -a[2], -a[3]])).toBeCloseTo(0, 4);
  });

  it('gives the middle turn of turns near each other, also with quaternions of the other sign', () => {
    const b = turnOf([0, 1, 0], 60);
    const mean = meanTurn([
      turnOf([0, 1, 0], 50),
      [-b[0], -b[1], -b[2], -b[3]],
      turnOf([0, 1, 0], 55),
    ]);
    expect(mean && turnAngle(mean, turnOf([0, 1, 0], 55))).toBeCloseTo(0, 4);
    expect(meanTurn([])).toBeNull();
  });
});

describe('turnBins', () => {
  it('counts the samples and the folds in each bin of the angle from the mean, from 0°', () => {
    const mean = turnOf([0, 0, 1], 0);
    const samples: TurnSample[] = [
      { turn: turnOf([0, 0, 1], 5), folded: true },
      { turn: turnOf([0, 0, 1], 8), folded: false },
      { turn: turnOf([1, 0, 0], 25), folded: false },
      { turn: turnOf([0, 1, 0], 180), folded: true },
    ];
    expect(turnBins(samples, mean, 10)).toEqual([
      { from: 0, samples: 2, withFold: 1 },
      { from: 10, samples: 0, withFold: 0 },
      { from: 20, samples: 1, withFold: 0 },
      ...Array.from({ length: 14 }, (...[, k]) => ({ from: 30 + k * 10, samples: 0, withFold: 0 })),
      { from: 170, samples: 1, withFold: 1 },
    ]);
  });
});

describe('turnLines', () => {
  it('gives the mean turn of the folds, the mean direction of the arm, and the share by angle', () => {
    // The right arm hangs down in the bind pose, and the folds come with the arm out to the side.
    const out = turnOf([0, 0, 1], 90);
    const samples: TurnSample[] = [
      { turn: out, folded: true },
      { turn: turnOf([0, 0, 1], 85), folded: true },
      { turn: turnOf([0, 0, 1], 95), folded: false },
      { turn: turnOf([0, 0, 1], 20), folded: false },
    ];
    const lines = turnLines(389, 'R', samples, [0, -1, 0]);
    expect(lines[1]).toBe(
      'The face folds in 2 of 4 samples. Mean turn of the upper arm from its bind pose in these samples: 87.5° around (0.00, 0.00, 1.00).',
    );
    expect(lines[2]).toBe(
      'Mean direction of the upper arm in these samples: out 1.00, up -0.04, forward 0.00.',
    );
    expect(lines).toContain('| 0° to 10° | 3 | 2 | 66.7% |');
    expect(lines).toContain('| 60° to 70° | 1 | 0 | 0.0% |');
    // The left arm out to the left side of the animal, -x, is out too.
    const left = turnLines(7, 'L', [{ turn: turnOf([0, 0, 1], -90), folded: true }], [0, -1, 0]);
    expect(left[2]).toBe(
      'Mean direction of the upper arm in these samples: out 1.00, up -0.00, forward 0.00.',
    );
    expect(turnLines(1, 'L', [{ turn: out, folded: false }], [0, -1, 0])[1]).toBe(
      'The face folds in none of the 1 samples.',
    );
  });
});

describe('turnProbe', async () => {
  const pianist = FOLD_ROLES.get('pianist');
  const demo = await patchedDemo('boulanger-matin.mid');

  it('keeps one turn for each sample of the probe, and stops on a face that the body has not', () => {
    if (!pianist) {
      throw new Error('The pianist has no role.');
    }
    const probe = turnProbe(0);
    const report = probeFolds(pianist, [demo], 8, probe.visit);
    const all = report.sets.rest.samples + report.sets.play.samples + report.sets.lift.samples;
    expect(probe.lines()[1]).toMatch(new RegExp(` ${all} samples`));
    const none = turnProbe(10_000_000);
    probeFolds(pianist, [demo], 1000, none.visit);
    expect(() => none.lines()).toThrow(/has \d+ faces, so it has no face 10000000/);
  }, 30_000);
});

describe('sideSplit', () => {
  it('splits the faces by the side of their main bone: _L, _R, and the middle', () => {
    const split = sideSplit(['upper_arm_L', 'ear_L', 'hand_R', 'chest', 'neck', 'L', 'R']);
    expect(split).toEqual({ L: 2, R: 1, other: 4 });
    expect(splitText(split)).toBe('L 2 / R 1 / other 4');
  });
});
