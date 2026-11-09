import { describe, expect, it } from 'vitest';

import { chord, noteOff, noteOn, programChange, track, writeSmf } from '../midi/test-smf.ts';
import type { TestFile } from '../midi/test-smf.ts';
import { scoreOf } from '../score/test-score.ts';
import { vocalSoloistsFile } from '../score/test-vocal-soloists.ts';
import type { Score, SectionSize } from '../score/types.ts';
import { patchedDemos } from '../../tools/patch-demos.ts';
import { CONDUCTOR, castScore, chamberFormOf } from './cast.ts';
import { obstacleOf, obstaclesTouch } from './footprint.ts';
import type { PlacedBox } from './footprint.ts';
import { SEATED_ARC } from './layout.ts';
import type { PlayerPlace, SceneLayout } from './layout.ts';
import {
  CHAMBER,
  CONDUCTOR_OBSTACLE,
  FOOTPRINT_GAP,
  ROW_STEP,
  SOLOIST_FACING,
  SOLOIST_PLACE,
  SPREAD_LIMITS,
  boxOnStage,
  divideSingers,
  widenRisers,
  layoutObstacles,
  layoutScene,
  placesOfCast,
} from './layout-scene.ts';
import type { Vec3 } from './tuples.ts';
import { ModelCache } from './model-cache.ts';
import { PIANO_FRONT_H, PIANO_SCALE } from './instruments/piano.ts';
import { buildPlayer } from './player.ts';
import { boneIndex } from './rig.ts';
import { PODIUM_SIZE, STAGE_CORNER_CUT } from './stage.ts';
import { choirFile } from './test-choir.ts';
import { perf60File } from './test-perf-60.ts';
import { pianoSoloFile, violinConcertinoFile } from '../score/test-audit-files.ts';
import {
  stringQuartetFile,
  stringSextetFile,
  violinPianoDuoFile,
  windQuintetFile,
} from './test-chamber.ts';
import {
  PLAYING_BONES,
  WIDE_VIEWS,
  hiddenShare,
  silhouettesOf,
  stageCamera,
} from './test-silhouettes.ts';

/** The chamber test files, and the sextet, which keeps the conductor (design 4.2). */
const CHAMBER_FILES: readonly (readonly [name: string, file: TestFile])[] = [
  ['piano solo', pianoSoloFile()],
  ['violin and piano', violinPianoDuoFile()],
  ['string quartet', stringQuartetFile()],
  ['wind quintet', windQuintetFile()],
  ['string sextet', stringSextetFile()],
];

/**
 * One model cache for all layouts of this file. A model of a kind of player is always the same, so
 * the tests build each kind once. A new cache for each layout takes most of the time of the file.
 */
const MODELS = new ModelCache();

/**
 * The layouts of the demos and of the choir test file with the three section sizes, of
 * `perf-60.mid` (9.5), and of the chamber test files (design 4.2).
 */
const LAYOUTS: readonly { name: string; score: Score; layout: SceneLayout }[] = await (async () => {
  const sizes: readonly SectionSize[] = ['auto', 'one-per-part', 'full'];
  const inputs = [
    ...(await patchedDemos()).map((demo) => ({ name: demo.file, file: demo.bytes })),
    { name: 'choir', file: writeSmf(choirFile()) },
    { name: 'concertino', file: writeSmf(violinConcertinoFile()) },
  ];
  const cases = inputs.flatMap(({ name, file }) =>
    sizes.map((size) => ({ name: `${name} ${size}`, score: scoreOf(file, size) })),
  );
  cases.push({ name: 'perf-60', score: scoreOf(perf60File(), 'one-per-part') });
  for (const [name, file] of CHAMBER_FILES) {
    cases.push({ name, score: scoreOf(file) });
  }
  return cases.map((c) => ({ ...c, layout: layoutScene(c.score, MODELS) }));
})();

/** The layouts with a conductor: all layouts except the chamber groups (design 4.2). */
const ORCHESTRAS = LAYOUTS.filter((c) => c.layout.conductor);

/** Gives the place of a player relative to the podium center: the radius and the angle. */
function polar(layout: SceneLayout, place: PlayerPlace) {
  const dx = place.position[0] - layout.podium[0];
  const dz = place.position[2] - layout.podium[2];
  return { radius: Math.hypot(dx, dz), angle: Math.atan2(dx, -dz) };
}

/**
 * Groups the seats of the instrumental rows by their radius, with the angle of each seat. The
 * soloist (design 3.8), such as the pianist, and the singers are not in a row.
 *
 * @returns The angles of each row, from the front.
 */
function rowsOf(layout: SceneLayout): Map<number, number[]> {
  const soloist = LAYOUTS.find((c) => c.layout === layout)?.score.soloist;
  const rows = new Map<number, number[]>();
  for (const p of layout.players) {
    if (p.cast.seatIndex === soloist || p.cast.support === 'riser') {
      continue;
    }
    const { radius, angle } = polar(layout, p);
    const key = Math.round(radius * 1e6) / 1e6;
    rows.set(key, [...(rows.get(key) ?? []), angle]);
  }
  return new Map([...rows].toSorted((a, b) => a[0] - b[0]));
}

/**
 * Makes a test piano concerto: the strings and a piano of a program, 16 s.
 *
 * @param program The program of the piano.
 * @returns The file.
 */
function pianoConcerto(program: number): TestFile {
  const part = (channel: number, prog: number, key: number) =>
    track(
      [programChange(0, channel, prog)],
      ...Array.from({ length: 32 }, (_, b) => [
        noteOn(b * 480, channel, key, 70),
        noteOff(b * 480 + 470, channel, key),
      ]),
    );
  return {
    tracks: [
      [],
      part(0, 40, 76),
      part(1, 41, 62),
      part(2, 42, 55),
      part(3, 43, 43),
      track([programChange(0, 4, program)], chord(0, 4, [48, 60, 64], 480 * 32)),
    ],
  };
}

/** Finds the layout of a case. */
function layoutOf(name: string): SceneLayout {
  const found = LAYOUTS.find((c) => c.name === name);
  if (!found) {
    throw new Error(`No layout ${name}.`);
  }
  return found.layout;
}

/** Gives the players of a section in a layout, from the cast instrument. */
function playersWith(layout: SceneLayout, instrument: string): PlayerPlace[] {
  return layout.players.filter((p) => p.cast.instrument === instrument);
}

describe('layoutScene', () => {
  it('gives each player of the cast a place, in the order of the cast (design 5.1)', () => {
    for (const { name, score, layout } of LAYOUTS) {
      expect(
        layout.players.map((p) => p.cast),
        name,
      ).toEqual(castScore(score));
    }
    const perf = layoutOf('perf-60');
    expect(perf.players).toHaveLength(60);
  });

  it('takes the player models from the cache of the score (audit 2026-10-05, finding 8)', () => {
    const asked = new Set<string>();
    /** A cache that records each kind of player that the layout asks for. */
    class RecordingCache extends ModelCache {
      override get(...args: Parameters<ModelCache['get']>) {
        const [species, instrument, kettles = 4] = args;
        asked.add(`${species} ${instrument} ${kettles}`);
        return MODELS.get(...args);
      }
    }
    const score = scoreOf(perf60File(), 'one-per-part');
    layoutScene(score, new RecordingCache());
    const kinds = castScore(score).map((c) => `${c.species} ${c.instrument} ${c.kettles}`);
    expect([...asked].toSorted()).toEqual(
      [...new Set([...kinds, `${CONDUCTOR.species} ${CONDUCTOR.instrument} 4`])].toSorted(),
    );
  });

  it('throws for a player with no place (review of step 4, F9)', () => {
    const { score, layout } = LAYOUTS[0] ?? { score: undefined, layout: undefined };
    if (!score || !layout) {
      throw new Error('No layout.');
    }
    const cast = castScore(score);
    expect(placesOfCast(layout.players, cast)).toEqual(layout.players);
    const missing = layout.players.map((p, i) => (i === 3 ? undefined : p));
    expect(() => placesOfCast(missing, cast)).toThrow(/no place for player 3/);
  });

  it('keeps all chairs, players, instruments, stands, and risers apart (design 4.5)', () => {
    // The footprints of two neighbor players do not touch, so a wide body gets more arc than the
    // seat arc of 0.95 m.
    for (const { name, layout } of LAYOUTS) {
      const obstacles = layoutObstacles(layout, MODELS);
      const touching: string[] = [];
      for (const [i, a] of obstacles.entries()) {
        for (const b of obstacles.slice(i + 1)) {
          if (obstaclesTouch(a, b, 0)) {
            touching.push(`${a.label} and ${b.label}`);
          }
        }
      }
      expect(touching, name).toEqual([]);
    }
  });

  it('keeps each music stand 0.05 m from each player, with its feet (design 4.5)', () => {
    for (const { name, layout } of LAYOUTS) {
      const obstacles = layoutObstacles(layout, MODELS);
      const stands = obstacles.filter((o) => o.label.startsWith('stand '));
      const players = obstacles.filter((o) => o.label.includes('(seat '));
      const close: string[] = [];
      for (const stand of stands) {
        for (const player of players) {
          if (obstaclesTouch(stand, player, 0.05 - 1e-6)) {
            close.push(`${stand.label} and ${player.label}`);
          }
        }
      }
      expect(close, name).toEqual([]);
    }
  });

  it('keeps all items on the stage (design 4.5, stage origin)', () => {
    const reach = (b: PlacedBox): Vec3 => [
      b.halfX * Math.abs(b.cos) + b.halfZ * Math.abs(b.sin),
      0,
      b.halfX * Math.abs(b.sin) + b.halfZ * Math.abs(b.cos),
    ];
    for (const { name, layout } of LAYOUTS) {
      const half = layout.stageSide / 2;
      for (const obstacle of layoutObstacles(layout, MODELS)) {
        for (const box of obstacle.boxes) {
          expect(Math.abs(box.x) + reach(box)[0], `${name}: ${obstacle.label}`).toBeLessThanOrEqual(
            half - 0.3 + 1e-9,
          );
          expect(Math.abs(box.z) + reach(box)[2], `${name}: ${obstacle.label}`).toBeLessThanOrEqual(
            half + 1e-9,
          );
        }
      }
      expect(layout.stageSide, name).toBeGreaterThanOrEqual(5);
    }
  });

  it('lets the spread of a row keep 0.3 m from the corner cuts (design 4.5)', () => {
    // A stage of 10 m with the podium center 1 m behind the front edge. A box of 0.2 m.
    const stage = { side: 10, front: 1 };
    const box = (x: number, z: number): PlacedBox => ({
      x,
      z,
      cos: 1,
      sin: 0,
      halfX: 0.1,
      halfZ: 0.1,
      minY: 0,
      maxY: 1,
    });
    expect(boxOnStage(box(0, 0.5), stage)).toBe(true);
    expect(boxOnStage(box(4.5, -4), stage)).toBe(true);
    expect(boxOnStage(box(0, 0.65), stage)).toBe(false);
    // 0.3 m from the front edge and from the right edge, but in the cut of the front right corner.
    expect(boxOnStage(box(4.5, 0.5), stage)).toBe(false);
    expect(boxOnStage(box(-4.5, -8.5), stage)).toBe(false);
  });

  it('keeps each footprint 0.3 m from the corner cuts of the stage (design 4.5)', () => {
    // The stage outline of orchestra-latest.png has cut corners. A cut must not cut into a seat.
    const far: string[] = [];
    for (const { name, layout } of LAYOUTS) {
      for (const obstacle of layoutObstacles(layout, MODELS)) {
        for (const b of obstacle.boxes) {
          for (const [sx, sz] of [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ] as const) {
            const x = b.x + sx * b.halfX * b.cos + sz * b.halfZ * b.sin;
            const z = b.z - sx * b.halfX * b.sin + sz * b.halfZ * b.cos;
            const diagonal = Math.abs(x) + Math.abs(z);
            const limit = layout.stageSide * (1 - STAGE_CORNER_CUT) - 0.3 * Math.SQRT2;
            if (diagonal > limit + 1e-9) {
              far.push(
                `${name}: ${obstacle.label} ${(diagonal - limit).toFixed(3)} m into the cut`,
              );
            }
          }
        }
      }
    }
    expect(far).toEqual([]);
  });

  it('puts the conductor on the podium top, facing the orchestra (design 4.5)', () => {
    for (const { name, score, layout } of LAYOUTS) {
      if (chamberFormOf(score.seats)) {
        expect(layout.conductor, name).toBeNull();
        continue;
      }
      const [x, y, z] = layout.podium;
      expect(layout.conductor?.position, name).toEqual([x, y + PODIUM_SIZE[1], z]);
      expect(layout.conductor?.facing, name).toBe(0);
    }
  });

  it('puts the violins to the left of 0° and the other strings to the right (design 4.2)', () => {
    const desks = new Set(['violin', 'viola', 'cello']);
    for (const { name, layout } of ORCHESTRAS) {
      for (const p of layout.players) {
        if (!desks.has(p.cast.instrument)) {
          continue;
        }
        const { radius, angle } = polar(layout, p);
        const left = p.cast.instrument === 'violin';
        expect(left ? angle < 0 : angle > 0, `${name}: ${p.cast.instrument}`).toBe(true);
        // No string player sits behind the conductor.
        expect(Math.abs(angle) * radius, name).toBeGreaterThanOrEqual(SEATED_ARC / 2 - 1e-9);
      }
    }
  });

  it('puts the first desk of each string seat in row 0 and the other desks in row 1', () => {
    for (const { name, score, layout } of LAYOUTS) {
      const [rowZero = 0, rowOne = 0] = rowsOf(layout).keys();
      for (const p of layout.players) {
        const strings = ['violin', 'viola', 'cello'].includes(p.cast.instrument);
        if (!strings || p.cast.seatIndex === score.soloist) {
          continue;
        }
        const expected = p.cast.player < 2 ? rowZero : rowOne;
        expect(polar(layout, p).radius, `${name}: ${p.cast.instrument}`).toBeCloseTo(expected, 6);
      }
    }
  });

  it('puts the contrabasses, the timpani, and the brass of the back row in the last row', () => {
    for (const { name, layout } of LAYOUTS) {
      const radii = [...rowsOf(layout).keys()];
      const last = radii.at(-1) ?? 0;
      for (const p of layout.players) {
        if (['contrabass', 'timpani', 'trombone', 'tuba'].includes(p.cast.instrument)) {
          expect(polar(layout, p).radius, `${name}: ${p.cast.instrument}`).toBeCloseTo(last, 6);
        }
      }
    }
  });

  it('steps each row back by at least 1.2 m and keeps it within ±90° (design 4.5)', () => {
    for (const { name, layout } of ORCHESTRAS) {
      const rows = rowsOf(layout);
      const radii = [...rows.keys()];
      expect(radii[0], name).toBeGreaterThanOrEqual(2.4 - 1e-6);
      radii.slice(1).forEach((r, i) => {
        expect(r - (radii[i] ?? 0), name).toBeGreaterThanOrEqual(ROW_STEP - 1e-6);
      });
      for (const angles of rows.values()) {
        expect(Math.max(...angles.map(Math.abs)), name).toBeLessThanOrEqual(
          SPREAD_LIMITS.maxAngle + 1e-9,
        );
      }
    }
  });

  it('moves the back desks behind the first desks of their seats (design 4.5)', () => {
    // In the Beethoven 9 demo, the back desks of the cellos and the violas sit behind their first
    // desks, as in the wedges of a professional orchestra. In the removed Beethoven 5 demo, the
    // spread alone put the cello at 30°, behind the violas.
    const layout = layoutOf('beethoven-9.mid auto');
    const angle = (p: PlayerPlace): number => (polar(layout, p).angle * 180) / Math.PI;
    for (const instrument of ['cello', 'viola'] as const) {
      const seats = new Set(playersWith(layout, instrument).map((p) => p.cast.seatIndex));
      for (const seat of seats) {
        const players = playersWith(layout, instrument).filter((p) => p.cast.seatIndex === seat);
        const front = players.filter((p) => p.cast.player < 2).map(angle);
        const back = players.filter((p) => p.cast.player >= 2).map(angle);
        const middle = (list: readonly number[]): number =>
          list.reduce((sum, a) => sum + a, 0) / list.length;
        expect(back.length, `${instrument} ${seat}`).toBeGreaterThan(0);
        expect(Math.abs(middle(back) - middle(front)), `${instrument} ${seat}`).toBeLessThan(5);
      }
    }
  });

  it('keeps two neighbors of a row at most 1.6 m apart (review of step 4, F1)', () => {
    for (const { name, layout } of LAYOUTS) {
      const stringRow = (back: boolean): number | undefined => {
        const p = layout.players.find(
          (q) =>
            ['violin', 'viola', 'cello'].includes(q.cast.instrument) && q.cast.player >= 2 === back,
        );
        return p ? Math.round(polar(layout, p).radius * 1e6) / 1e6 : undefined;
      };
      const backDesks = stringRow(true);
      const splitRows = new Set([stringRow(false), backDesks]);
      for (const [radius, angles] of rowsOf(layout)) {
        // The back desks move toward the first desks of their seats after the spread. Thus
        // their arcs can be longer than 1.6 m.
        if (radius === backDesks) {
          continue;
        }
        const sorted = angles.toSorted((a, b) => a - b);
        sorted.slice(1).forEach((angle, i) => {
          const before = sorted[i] ?? angle;
          // The gap of the conductor in rows 0 and 1 has no limit.
          if (splitRows.has(radius) && before < 0 && angle > 0) {
            return;
          }
          // The pair is in this row: a player of another row can have the same angle.
          const pair = layout.players
            .filter((p) => {
              const place = polar(layout, p);
              return (
                Math.round(place.radius * 1e6) / 1e6 === radius &&
                [before, angle].includes(place.angle)
              );
            })
            .map((p) => p.cast.instrument);
          expect(pair, name).toHaveLength(2);
          // Two contrabasses with their shared stand need 2.17 m of arc before the spread, two
          // cellos 1.67 m, and a contrabass beside the timpani (1.82 m wide) 1.84 m. The case
          // and the bench of a keyboard lie along its row and need 2.9 m beside the harp. The
          // spread keeps an arc that is already longer than 1.6 m.
          const wide = new Set(['contrabass', 'cello', 'timpani']);
          if (pair.every((instrument) => wide.has(instrument)) || pair.includes('piano')) {
            return;
          }
          expect(radius * (angle - before), `${name}: ${pair.join(' and ')}`).toBeLessThanOrEqual(
            SPREAD_LIMITS.maxArc + 1e-5,
          );
        });
      }
    }
  });

  it('places a piano soloist 2.0 m to the left and 0.8 m to the front, facing +x', () => {
    const score = scoreOf(pianoConcerto(0));
    expect(score.soloist).toBe(score.seats.findIndex((s) => s.section === 'piano'));
    const layout = layoutScene(score, MODELS);
    const [pianist] = playersWith(layout, 'piano');
    expect(pianist?.cast.support).toBe('bench');
    expect(pianist?.facing).toBeCloseTo(-Math.PI / 2, 9);
    // Facing -π/2 turns the front of the model (-z) to +x.
    expect(-Math.sin(pianist?.facing ?? 0)).toBeCloseTo(1, 9);
    const species = pianist?.cast.species ?? 'rabbit';
    expect(species).toBe('polar-bear');
    const model = buildPlayer(species, 'piano');
    const keys = model.pieces[0]?.at.position ?? [0, 0, 0];
    // The front of the keys is PIANO_FRONT_H + 0.05 m in front of the floor point of the body
    // (design 4.6), along +x.
    const keyFront = (pianist?.position[0] ?? 0) - keys[2];
    expect(keyFront - (pianist?.position[0] ?? 0)).toBeCloseTo(
      PIANO_FRONT_H * model.body.headHeight + 0.05 - model.body.floor[2],
      9,
    );
    // The case is 2.0 m long from the key front before the scale of the piano, so its middle is
    // half of that to the right of it.
    expect(keyFront + PIANO_SCALE - layout.podium[0]).toBeCloseTo(-2.0, 1);
    // The front edge keeps 0.3 m in front of the piano case, which is 1.40 m wide before the scale.
    const front = layout.stageSide / 2 - layout.podium[2];
    expect(front).toBeGreaterThan(0.8 + 0.7 * PIANO_SCALE + 0.3 - 0.05);
  });

  it('seats a keyboard of the orchestra at the left of the harp, along its row (audit 2, N1)', () => {
    // The celesta of Boulanger and the harpsichord of Bach play color and continuo. At the front
    // left, their cases cover the first violins.
    for (const name of ['boulanger-matin.mid auto', 'bach-bwv1048.mid auto']) {
      const layout = layoutOf(name);
      const [pianist, ...others] = playersWith(layout, 'piano');
      expect(others, name).toEqual([]);
      if (!pianist) {
        throw new Error(`${name} has no keyboard.`);
      }
      const { radius, angle } = polar(layout, pianist);
      const strings = layout.players.filter((p) =>
        ['violin', 'viola', 'cello'].includes(p.cast.instrument),
      );
      expect(radius, name).toBeGreaterThan(
        Math.max(...strings.map((p) => polar(layout, p).radius)),
      );
      // The pianist faces along the arc toward the middle: a quarter turn from the podium.
      const turn = pianist.facing - (Math.PI - angle);
      expect(Math.cos(turn), name).toBeCloseTo(0, 9);
      expect(Math.sin(turn), name).toBeCloseTo(1, 9);
      // No player of its row sits to its left.
      const row = layout.players.filter(
        (p) => Math.abs(polar(layout, p).radius - radius) < 1e-6 && p !== pianist,
      );
      for (const p of row) {
        expect(polar(layout, p).angle, `${name}: ${p.cast.instrument}`).toBeGreaterThan(angle);
      }
    }
  });

  it('hides no first desk of the violins behind the soloist or a keyboard (audit 2, N1)', () => {
    // A box beside the lines of sight passed the clearance test of the shots. The black case of
    // the celesta covered 49% to 53% of the first violin of Boulanger in three wide views, and
    // the K. 315 flute 17% of the second violin of the first desk in the default view. The case
    // of a piano soloist stands in front of the first violins, as in a piano concerto.
    const found: string[] = [];
    for (const { name, score, layout } of LAYOUTS) {
      // The first violin seat of the orchestra. The concertino has a solo violin and the
      // violins of a string ensemble.
      const first = score.seats.findIndex((s, i) => s.section === 'violin' && i !== score.soloist);
      const front = layout.players.flatMap((p, i) =>
        (p.cast.instrument === 'piano') !== (p.cast.seatIndex === score.soloist) ? [i] : [],
      );
      const desk = layout.players.flatMap((p, i) =>
        p.cast.seatIndex === first && p.cast.player < 2 ? [i] : [],
      );
      // The default view of the first screen, with each section size: the whole player, then
      // its head, arms, and instrument. The three other wide views, with the section size of
      // the app: the head, arms, and instrument. In the frontal view, the solo rabbit of the
      // concertino hides 20% of the fox behind it, but 6% of its head, arms, and violin. With
      // "One per part", the smaller rows put that fox right behind the soloist (42%).
      for (const [v, view] of WIDE_VIEWS.entries()) {
        if (v > 0 && !name.endsWith(' auto')) {
          continue;
        }
        const silhouettes = silhouettesOf(layout, MODELS, stageCamera(layout.stageSide, view));
        for (const back of desk) {
          const share = v === 0 ? hiddenShare(silhouettes, back, front) : 0;
          const playing = hiddenShare(silhouettes, back, front, PLAYING_BONES);
          if (share >= 0.1 || playing >= (v === 0 ? 0.05 : 0.1)) {
            const shares = `${(100 * share).toFixed(0)}% and ${(100 * playing).toFixed(0)}%`;
            found.push(`${name}, azimuth ${view.azimuth}, player ${back}: ${shares}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('places the soloist of K. 315 at the front left of the conductor, standing (design 4.5)', () => {
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      const name = `mozart-k315.mid ${size}`;
      const layout = layoutOf(name);
      const [soloist, ...others] = playersWith(layout, 'flute');
      expect(others, name).toEqual([]);
      expect(soloist?.cast.support, name).toBe('stand');
      expect(soloist?.facing, name).toBeCloseTo(SOLOIST_FACING, 9);
      // The front of the soloist turns 40° from the audience (+z) to the conductor (+x).
      const facing = soloist?.facing ?? 0;
      const turn = (40 * Math.PI) / 180;
      expect(-Math.sin(facing), name).toBeCloseTo(Math.sin(turn), 9);
      expect(-Math.cos(facing), name).toBeCloseTo(Math.cos(turn), 9);
      const [x = 0, , z = 0] = soloist?.position ?? [];
      expect(x - layout.podium[0], name).toBeCloseTo(SOLOIST_PLACE[0], 9);
      expect(z - layout.podium[2], name).toBeCloseTo(SOLOIST_PLACE[1], 9);
      // The soloist plays with no music stand: the oboes and the horns have their own stands,
      // and two string players share one.
      const desks = new Map<number, number>();
      let winds = 0;
      for (const p of layout.players) {
        if (['violin', 'viola', 'cello'].includes(p.cast.instrument)) {
          desks.set(p.cast.seatIndex, (desks.get(p.cast.seatIndex) ?? 0) + 1);
        } else if (['oboe', 'horn'].includes(p.cast.instrument)) {
          winds++;
        }
      }
      const shared = [...desks.values()].reduce((sum, n) => sum + Math.ceil(n / 2), 0);
      expect(layout.stands, name).toHaveLength(shared + winds);
    }
  });

  it('keeps the front edge 0.3 m in front of the soloist and its instrument (design 4.5)', () => {
    let checked = 0;
    for (const { name, score, layout } of LAYOUTS) {
      const front = layout.stageSide / 2;
      for (const obstacle of layoutObstacles(layout, MODELS)) {
        const place = layout.players.find(
          (p) =>
            p.cast.seatIndex === score.soloist &&
            obstacle.label.startsWith(`${p.cast.species} ${p.cast.instrument}`),
        );
        if (!place) {
          continue;
        }
        for (const b of obstacle.boxes) {
          const reach = b.halfX * Math.abs(b.sin) + b.halfZ * Math.abs(b.cos);
          expect(b.z + reach, `${name}: ${obstacle.label}`).toBeLessThanOrEqual(front - 0.3 + 1e-9);
        }
        checked++;
      }
    }
    // The flute of K. 315 with each section size.
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('seats a soloist of the bassoon on a chair at the place of a standing soloist', () => {
    // The test piece of the bassoon soloist of `score/soloist.test.ts`: a loud bassoon under
    // the strings, after a rest of 4 beats.
    const line = (channel: number, program: number, key: number, velocity = 70) =>
      track(
        [programChange(0, channel, program)],
        ...Array.from({ length: 32 }, (_, b) =>
          channel === 4 && b < 4
            ? []
            : [noteOn(b * 480, channel, key, velocity), noteOff(b * 480 + 470, channel, key)],
        ),
      );
    const score = scoreOf({
      tracks: [
        [],
        line(0, 40, 76),
        line(1, 41, 62),
        line(2, 42, 55),
        line(3, 43, 43),
        line(4, 70, 50, 110),
      ],
    });
    expect(score.soloist).toBe(4);
    const layout = layoutScene(score, MODELS);
    const [bassoon] = playersWith(layout, 'bassoon');
    expect(bassoon?.cast.support).toBe('chair');
    expect((bassoon?.position[0] ?? 0) - layout.podium[0]).toBeCloseTo(SOLOIST_PLACE[0], 9);
    expect((bassoon?.position[2] ?? 0) - layout.podium[2]).toBeCloseTo(SOLOIST_PLACE[1], 9);
    const obstacles = layoutObstacles(layout, MODELS);
    for (const [i, a] of obstacles.entries()) {
      for (const b of obstacles.slice(i + 1)) {
        expect(obstaclesTouch(a, b, 0), `${a.label} and ${b.label}`).toBe(false);
      }
    }
  });

  it('shares a stand for two string players and gives each wind player its own', () => {
    const layout = layoutOf('boulanger-matin.mid auto');
    const strings = layout.players.filter((p) =>
      ['violin', 'viola', 'cello', 'contrabass'].includes(p.cast.instrument),
    );
    const winds = layout.players.filter((p) =>
      ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba'].includes(
        p.cast.instrument,
      ),
    );
    const seats = new Map<number, number>();
    for (const p of strings) {
      seats.set(p.cast.seatIndex, (seats.get(p.cast.seatIndex) ?? 0) + 1);
    }
    const shared = [...seats.values()].reduce((sum, n) => sum + Math.ceil(n / 2), 0);
    expect(layout.stands).toHaveLength(shared + winds.length);
  });

  it('keeps the ears of neighbor elephants apart (review of step 3, F12)', () => {
    const ears = new Set([boneIndex('earL'), boneIndex('earR')]);
    const mesh = buildPlayer('elephant', 'cello').mesh;
    const local: Vec3[] = [];
    for (let v = 0; v < mesh.bones.length; v++) {
      if (ears.has(mesh.bones[v] ?? -1)) {
        local.push([
          mesh.positions[v * 3] ?? 0,
          mesh.positions[v * 3 + 1] ?? 0,
          mesh.positions[v * 3 + 2] ?? 0,
        ]);
      }
    }
    const world = (p: PlayerPlace): Vec3[] =>
      local.map(([x, y, z]) => [
        p.position[0] + x * Math.cos(p.facing) + z * Math.sin(p.facing),
        y,
        p.position[2] - x * Math.sin(p.facing) + z * Math.cos(p.facing),
      ]);
    for (const { name, layout } of LAYOUTS) {
      const cellos = playersWith(layout, 'cello').toSorted(
        (a, b) => polar(layout, a).angle - polar(layout, b).angle,
      );
      cellos.slice(1).forEach((cello, i) => {
        const a = world(cellos[i] ?? cello);
        const b = world(cello);
        let nearest = Infinity;
        for (const p of a) {
          for (const q of b) {
            nearest = Math.min(nearest, Math.hypot(p[0] - q[0], p[2] - q[2]));
          }
        }
        expect(nearest, name).toBeGreaterThan(FOOTPRINT_GAP);
      });
    }
  });

  it('fills the riser levels evenly (F13)', () => {
    expect(divideSingers(32, 3)).toEqual([11, 11, 10]);
    expect(divideSingers(7, 2)).toEqual([4, 3]);
  });

  it('widens the risers past the singers by up to 1.0 m on each side (design 4.5)', () => {
    const levels = [
      { level: 0, radius: 5, height: 1, halfAngle: 0.2 },
      { level: 1, radius: 5.8, height: 1.25, halfAngle: 0.2 },
    ];
    // On a large stage with no other item, each level gets the full wing.
    const wide = widenRisers(levels, [], { side: 30, front: 1 });
    expect(wide.map((l) => l.halfAngle)).toEqual([0.2 + 1 / 5, 0.2 + 1 / 5]);
    // An item beside the risers, at 0.33 rad on the lowest level, stops the wing 0.05 m from it.
    const item = obstacleOf('item', [
      {
        x: 5 * Math.sin(0.33),
        z: -5 * Math.cos(0.33),
        cos: 1,
        sin: 0,
        halfX: 0.1,
        halfZ: 0.1,
        minY: 0,
        maxY: 2,
      },
    ]);
    const [narrow] = widenRisers(levels, [item], { side: 30, front: 1 });
    expect(narrow?.halfAngle).toBeGreaterThan(0.2);
    expect(narrow?.halfAngle).toBeLessThan(0.33 - 0.1 / 5);
    // Beethoven 9 gets the full wing, and the choir test file a part of it.
    const b9 = layoutOf('beethoven-9.mid auto').risers[0];
    const singerAngle = Math.max(
      ...playersWith(layoutOf('beethoven-9.mid auto'), 'choir-folder').map((p) =>
        Math.abs(
          Math.atan2(
            p.position[0] - layoutOf('beethoven-9.mid auto').podium[0],
            layoutOf('beethoven-9.mid auto').podium[2] - p.position[2],
          ),
        ),
      ),
    );
    expect(b9 && (b9.halfAngle - singerAngle) * b9.radius).toBeGreaterThan(1);
  });

  it('keeps the steps in front of the lowest riser level clear of the back row (design 4.5)', () => {
    for (const name of ['choir auto', 'beethoven-9.mid auto']) {
      const layout = layoutOf(name);
      const risers = layoutObstacles(layout, MODELS).find((o) => o.label === 'risers');
      if (!risers) {
        throw new Error(`${name} has no risers.`);
      }
      // The singers stand on the risers. Each other item keeps 0.05 m from them.
      const others = layoutObstacles(layout, MODELS).filter(
        (o) => o.label !== 'risers' && !o.label.includes('choir-folder'),
      );
      for (const other of others) {
        expect(obstaclesTouch(risers, other, 0.05 - 1e-6), `${name}: ${other.label}`).toBe(false);
      }
    }
  });

  it('puts the vocal soloists on the lowest level, in front of the choir (audit 2, N8)', () => {
    // In the row of the choir, the four soloists of the Ode to Joy show as 8 penguins.
    for (const size of ['auto', 'one-per-part', 'full'] as const) {
      const name = `vocal soloists ${size}`;
      const score = scoreOf(vocalSoloistsFile(), size);
      const layout = layoutScene(score, MODELS);
      const singers = playersWith(layout, 'choir-folder');
      const soloists = singers.filter((p) => p.cast.seatIndex === score.vocalSoloists);
      const choir = singers.filter((p) => p.cast.seatIndex !== score.vocalSoloists);
      expect(soloists, name).toHaveLength(4);
      const lowest = layout.risers[0];
      for (const p of soloists) {
        expect(p.position[1], name).toBeCloseTo(lowest?.height ?? 0, 9);
        expect(polar(layout, p).radius, name).toBeCloseTo(lowest?.radius ?? 0, 6);
      }
      for (const p of choir) {
        expect(p.position[1], name).toBeGreaterThan((lowest?.height ?? 0) + 0.1);
      }
      // The soloists stand 1.2 m apart, twice the arc of a singer of the choir.
      const angles = soloists.map((p) => polar(layout, p).angle).toSorted((a, b) => a - b);
      for (const [i, angle] of angles.slice(1).entries()) {
        expect((angle - (angles[i] ?? 0)) * (lowest?.radius ?? 0), name).toBeGreaterThan(1.19);
      }
    }
  });
});

/** The lowest and the highest x and z of the items of a layout. */
interface Extent {
  readonly x: readonly [number, number];
  readonly z: readonly [number, number];
}

describe('the layout of a chamber group (design 4.2, 4.5)', () => {
  /**
   * The box around a group, in the stage axes: each footprint box plus 0.3 m, and each seat plus
   * 0.5 m for the chair and 0.3 m (design 4.5, stage origin).
   */
  const extent = (layout: SceneLayout): Extent => {
    const seats = layout.players.map((p): PlacedBox => ({
      x: p.position[0],
      z: p.position[2],
      halfX: 0.5,
      halfZ: 0.5,
      cos: 1,
      sin: 0,
      minY: 0,
      maxY: 0,
    }));
    const boxes = [...layoutObstacles(layout, MODELS).flatMap((o) => o.boxes), ...seats];
    const reachX = (b: PlacedBox): number => b.halfX * Math.abs(b.cos) + b.halfZ * Math.abs(b.sin);
    const reachZ = (b: PlacedBox): number => b.halfX * Math.abs(b.sin) + b.halfZ * Math.abs(b.cos);
    return {
      x: [
        Math.min(...boxes.map((b) => b.x - reachX(b))),
        Math.max(...boxes.map((b) => b.x + reachX(b))),
      ],
      z: [
        Math.min(...boxes.map((b) => b.z - reachZ(b))),
        Math.max(...boxes.map((b) => b.z + reachZ(b))),
      ],
    };
  };

  it('gives at most 5 players no conductor and no podium, and 6 players a conductor', () => {
    for (const [name, file] of CHAMBER_FILES) {
      const layout = layoutOf(name);
      const labels = layoutObstacles(layout, MODELS).map((o) => o.label);
      const chamber = name !== 'string sextet';
      expect(layout.conductor === null, name).toBe(chamber);
      expect(labels.includes(CONDUCTOR_OBSTACLE), name).toBe(!chamber);
      expect(layout.players.length <= 5, name).toBe(chamber);
      const forms = new Map([
        ['piano solo', 'solo'],
        ['violin and piano', 'recital'],
        ['string quartet', 'arc'],
        ['wind quintet', 'arc'],
        ['string sextet', null],
      ]);
      expect(chamberFormOf(scoreOf(file).seats), name).toBe(forms.get(name));
    }
  });

  it('puts the group in the middle of a stage of 5 m (design 4.5, stage origin)', () => {
    for (const name of ['piano solo', 'violin and piano', 'string quartet', 'wind quintet']) {
      const layout = layoutOf(name);
      const { x, z } = extent(layout);
      expect((x[0] + x[1]) / 2, name).toBeCloseTo(0, 1);
      expect((z[0] + z[1]) / 2, name).toBeCloseTo(0, 1);
      expect(layout.stageSide, name).toBeLessThan(5.1);
      expect(layout.risers, name).toEqual([]);
    }
  });

  it('seats a pianist alone with the case of the piano at the stage center', () => {
    const layout = layoutOf('piano solo');
    const [pianist] = layout.players;
    expect(layout.players).toHaveLength(1);
    expect(pianist?.facing).toBe(-Math.PI / 2);
    expect(pianist?.cast.support).toBe('bench');
    expect(layout.stands).toEqual([]);
    // With a conductor, the piano solo has a stage of 8.06 m.
    expect(layout.stageSide).toBe(5);
  });

  it('stands the partner of a pianist in the crook of the piano, turned 25° to the pianist', () => {
    const layout = layoutOf('violin and piano');
    const violin = playersWith(layout, 'violin')[0];
    const pianist = playersWith(layout, 'piano')[0];
    if (!violin || !pianist) {
      throw new Error('The duo has a violin and a piano.');
    }
    expect(violin.cast.support).toBe('stand');
    expect(violin.facing).toBeCloseTo(Math.PI - CHAMBER.turn, 12);
    expect(layout.stands).toEqual([]);
    const [piano, partner] = [pianist, violin].map((p) =>
      layoutObstacles(layout, MODELS).find((o) =>
        o.boxes.some((b) => Math.hypot(b.x - p.position[0], b.z - p.position[2]) < 0.3),
      ),
    );
    if (!piano || !partner) {
      throw new Error('The duo has two obstacles.');
    }
    // In front of the case, toward the audience, and near it.
    expect(obstaclesTouch(piano, partner, FOOTPRINT_GAP)).toBe(false);
    expect(obstaclesTouch(piano, partner, FOOTPRINT_GAP + 0.03)).toBe(true);
    const caseFront = Math.max(...piano.boxes.map((b) => b.z));
    expect(violin.position[2]).toBeGreaterThan(caseFront);
    // The pianist sits at the left end of the case, and the violin stands toward the tail.
    expect(violin.position[0] - pianist.position[0]).toBeGreaterThan(1.2);
  });

  it('seats a string quartet in a half circle from the first violin to the cello', () => {
    const layout = layoutOf('string quartet');
    expect(layout.conductor).toBeNull();
    const order = layout.players.toSorted((a, b) => a.position[0] - b.position[0]);
    expect(order.map((p) => `${p.cast.instrument} ${p.cast.seatIndex}`)).toEqual([
      'violin 0',
      'violin 1',
      'viola 2',
      'cello 3',
    ]);
    for (const p of layout.players) {
      const { radius, angle } = polar(layout, p);
      expect(radius).toBeCloseTo(CHAMBER.radius, 6);
      expect(Math.abs(angle)).toBeLessThanOrEqual(CHAMBER.halfSpan + 1e-9);
      // Each player faces the middle of the arc, so the players face each other a little.
      expect(p.facing).toBeCloseTo(Math.PI - angle, 9);
      expect(p.cast.support).toBe('chair');
    }
    expect(layout.stands).toHaveLength(4);
  });

  it('seats a wind quintet in an arc of at most ±60°, with the horn in the middle', () => {
    const layout = layoutOf('wind quintet');
    const order = layout.players.toSorted((a, b) => a.position[0] - b.position[0]);
    expect(order.map((p) => p.cast.instrument)).toEqual([
      'flute',
      'oboe',
      'horn',
      'clarinet',
      'bassoon',
    ]);
    const angles = layout.players.map((p) => polar(layout, p).angle);
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(CHAMBER.halfSpan + 1e-9);
    // The flute leads the file, but the soloist rule moves no player of a chamber group.
    expect(layout.players.every((p) => p.cast.support === 'chair')).toBe(true);
  });

  it('moves a wide arc back until each player is within 60° of its middle', () => {
    // A piano and four strings need more than 2 × 60° of arc at the radius 2.4 m.
    const score = scoreOf({
      tracks: [
        ...stringQuartetFile().tracks,
        track([programChange(0, 4, 0)], chord(0, 4, [60, 64, 67], 480 * 8)),
      ],
    });
    const layout = layoutScene(score, MODELS);
    expect(layout.conductor).toBeNull();
    const places = layout.players.map((p) => polar(layout, p));
    const radius = places[0]?.radius ?? 0;
    expect(radius).toBeGreaterThan(CHAMBER.radius);
    // The ends of the arc, with the room of the end players, reach 60°.
    const widest = Math.max(...places.map((p) => Math.abs(p.angle)));
    expect(widest).toBeLessThanOrEqual(CHAMBER.halfSpan);
    expect(widest).toBeGreaterThan((45 * Math.PI) / 180);
    // The piano sits at the left end, along the arc.
    const left = layout.players.toSorted((a, b) => a.position[0] - b.position[0])[0];
    expect(left?.cast.instrument).toBe('piano');
  });
});
