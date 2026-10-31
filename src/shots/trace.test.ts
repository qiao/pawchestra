import { describe, expect, it } from 'vitest';

import { patchedDemo } from '../../tools/patch-demos.ts';
import {
  noteOff,
  noteOn,
  programChange,
  tempo,
  timeSignature,
  track,
  writeSmf,
} from '../midi/test-smf.ts';
import type { TestEvent } from '../midi/test-smf.ts';
import { violinPianoDuoFile } from '../models/test-chamber.ts';
import { viewAngle } from './camera-keys.ts';
import { FILM_GRAMMAR } from './grammar.ts';
import { CLOSE_DISTANCE_SHARE, traceShots } from './prepare.ts';
import { TEST_SEED, shotSceneOf } from './test-shots.ts';
import type { ShotScene } from './test-shots.ts';
import type { CutTrace, ShotTrace, TraceRange } from './trace.ts';

/** A bar of 4/4 in ticks: 2 s at 120 BPM. */
const BAR = 480 * 4;

/**
 * Makes one note in each bar of a range.
 *
 * @param channel The channel.
 * @param key The key.
 * @param from The first bar.
 * @param to The bar after the last bar.
 * @returns The events.
 */
function bars(channel: number, key: number, from: number, to: number): TestEvent[] {
  const events: TestEvent[] = [];
  for (let bar = from; bar < to; bar++) {
    events.push(noteOn(bar * BAR, channel, key, 64), noteOff(bar * BAR + BAR - 10, channel, key));
  }
  return events;
}

/**
 * Makes a file in which four seats play 20 bars, rest 16 bars, and play one more bar, as the test
 * of the hold in `prepare.test.ts`. No subject fits at the cuts in the rest.
 *
 * @returns The bytes of the file.
 */
function restFile(): Uint8Array {
  return writeSmf({
    tracks: [
      [tempo(0, 120), timeSignature(0, 4, 4)],
      ...[40, 41, 42, 43].map((program, channel) =>
        track(
          [programChange(0, channel, program)],
          [...bars(channel, 60 + channel, 0, 20), ...bars(channel, 60 + channel, 36, 37)],
        ),
      ),
    ],
  });
}

/** The range of a trace of all cuts. */
const ALL: TraceRange = { fromSec: -Infinity, toSec: Infinity };

/**
 * The scenes of the tests: the K. 525 demo, whose plan refuses close cameras by the distance, the
 * Beethoven 1 demo, whose plan has a conductor shot that fills the time, the violin and piano duo
 * of the chamber test files, and a file with a rest of all seats, in which the previous shot holds
 * on.
 */
const SCENES: readonly ShotScene[] = [
  shotSceneOf('mozart-k525.mid', (await patchedDemo('mozart-k525.mid')).bytes),
  shotSceneOf('beethoven-1.mid', (await patchedDemo('beethoven-1.mid')).bytes),
  shotSceneOf('violin-piano.mid', writeSmf(violinPianoDuoFile())),
  shotSceneOf('rest.mid', restFile()),
];

/**
 * Traces the shots of a scene.
 *
 * @param scene The scene.
 * @param range The range of the traced cuts.
 * @returns The trace.
 */
function traceOf(scene: ShotScene, range: TraceRange = ALL): ShotTrace {
  return traceShots(scene.score, scene.layout, TEST_SEED, range, scene.models);
}

/** The traces of all cuts of each scene. */
const TRACES = SCENES.map((scene) => traceOf(scene));

describe('traceShots() (design 5.6)', () => {
  it('gives the plan of prepareShots()', () => {
    for (const [i, scene] of SCENES.entries()) {
      expect(TRACES[i]?.plan, scene.file).toEqual(scene.plan);
    }
  });

  it('traces each cut of the range with both ends, in the order of the cuts', () => {
    for (const scene of SCENES) {
      const starts = scene.plan.shots.slice(1, -1).map((shot) => shot.startSec);
      const range = { fromSec: starts[1] ?? 0, toSec: starts[3] ?? 0 };
      const cuts = traceOf(scene, range).cuts;
      expect(
        cuts.filter((cut) => cut.outcome !== 'hold').map((cut) => cut.cutSec),
        scene.file,
      ).toEqual(starts.slice(1, 4));
      for (const cut of cuts) {
        expect(cut.cutSec).toBeGreaterThanOrEqual(range.fromSec);
        expect(cut.cutSec).toBeLessThanOrEqual(range.toSec);
      }
    }
  });

  it('names the rule that drops each candidate', () => {
    let subjects = 0;
    for (const [i, scene] of SCENES.entries()) {
      const cuts = TRACES[i]?.cuts ?? [];
      for (const cut of cuts) {
        const previous = scene.plan.shots.findLast((shot) => shot.startSec < cut.cutSec - 1e-9);
        const ids = [...cut.dropped, ...cut.candidates].map((c) => c.id);
        expect(new Set(ids).size, `${scene.file} ${cut.cutSec}`).toBe(ids.length);
        for (const dropped of cut.dropped.filter((d) => d.rule === 'subject')) {
          subjects++;
          expect(dropped.kind).toBe(previous?.kind);
        }
      }
    }
    expect(subjects).toBeGreaterThan(0);
  });

  it('ends the search of a cut with the chosen candidate, the candidate of the shot', () => {
    for (const [i, scene] of SCENES.entries()) {
      for (const cut of (TRACES[i]?.cuts ?? []).filter((c) => c.outcome === 'candidate')) {
        // The second pass gives a candidate its higher bands after each candidate failed in its
        // first bands, so a candidate after the chosen one can have tries.
        const chosen = cut.chosen === null ? undefined : cut.candidates[cut.chosen];
        const found = cut.candidates.filter((c) => c.attempts.some((a) => a.found));
        const shot = scene.plan.shots.find((s) => Math.abs(s.startSec - cut.cutSec) < 1e-9);
        const label = `${scene.file} ${cut.cutSec}`;
        expect(found, label).toEqual(chosen ? [chosen] : []);
        expect(chosen?.kind, label).toBe(shot?.kind);
        expect(chosen?.attempts.at(-1)?.found, label).toBe(true);
        const failed = cut.candidates.flatMap((c) =>
          c === chosen ? c.attempts.slice(0, -1) : c.attempts,
        );
        expect(
          failed.every((attempt) => !attempt.found),
          label,
        ).toBe(true);
      }
    }
  });

  it('traces a cut at which the previous shot holds on', () => {
    const scene = SCENES.at(-1);
    const cuts = TRACES.at(-1)?.cuts ?? [];
    const holds = cuts.filter((cut) => cut.outcome === 'hold');
    expect(holds.length).toBeGreaterThan(0);
    for (const cut of holds) {
      expect(scene?.plan.starts.includes(cut.cutSec)).toBe(false);
      expect(cut.chosen).toBeNull();
      expect(cut.candidates.every((c) => c.attempts.every((a) => !a.found))).toBe(true);
    }
  });

  it('traces the conductor that fills the time when no candidate fits', () => {
    const fills = TRACES.flatMap((trace) => trace.cuts).filter((c) => c.outcome === 'conductor');
    expect(fills.length).toBeGreaterThan(0);
    for (const cut of fills) {
      expect(cut.fill.at(-1)?.found).toBe(true);
      expect(cut.chosen).toBeNull();
      expect(cut.candidates.every((c) => c.attempts.every((a) => !a.found))).toBe(true);
    }
  });

  it('accepts the camera of the shot, and refuses a jump cut only near the previous view', () => {
    let jumps = 0;
    for (const [i, scene] of SCENES.entries()) {
      for (const cut of (TRACES[i]?.cuts ?? []).filter((c) => c.outcome === 'candidate')) {
        const at = scene.plan.shots.findIndex((s) => Math.abs(s.startSec - cut.cutSec) < 1e-9);
        const shot = scene.plan.shots[at];
        const previous = scene.plan.shots[at - 1];
        const chosen = cut.chosen === null ? undefined : cut.candidates[cut.chosen];
        const searches = chosen?.attempts.at(-1)?.searches ?? [];
        const accepted = searches.at(-1)?.cameras.at(-1);
        if (searches.length > 0) {
          expect(accepted?.refusal).toBeNull();
          expect(accepted?.azimuth).toBe(shot?.from.azimuth);
          expect(accepted?.elevation).toBe(shot?.from.elevation);
        }
        const cameras = cut.candidates.flatMap((c) =>
          c.attempts.flatMap((a) => a.searches.flatMap((search) => search.cameras)),
        );
        for (const camera of cameras.filter((c) => c.refusal === 'jump')) {
          jumps++;
          const key = { azimuth: camera.azimuth, elevation: camera.elevation, zoom: 1, fov: 30 };
          expect(previous && viewAngle(previous.to, key)).toBeLessThan(FILM_GRAMMAR.jumpAngle);
        }
      }
    }
    expect(jumps).toBeGreaterThan(0);
  });

  it('gives the share of the distance of each camera that the distance refuses', () => {
    let refused = 0;
    for (const trace of TRACES) {
      for (const cut of trace.cuts) {
        const searches = cut.candidates.flatMap((c) => c.attempts.flatMap((a) => a.searches));
        for (const camera of searches.flatMap((search) => search.cameras)) {
          if (camera.refusal === 'distance') {
            refused++;
            expect(camera.share).toBeGreaterThan(CLOSE_DISTANCE_SHARE);
          } else {
            expect(camera.share).toBeNull();
          }
        }
      }
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('gives a cut the same trace in a range that starts at the cut', () => {
    for (const [i, scene] of SCENES.entries()) {
      const cuts = TRACES[i]?.cuts ?? [];
      const late = cuts.at(-2);
      if (!late) {
        continue;
      }
      const alone: readonly CutTrace[] = traceOf(scene, {
        fromSec: late.cutSec,
        toSec: late.cutSec,
      }).cuts;
      expect(alone, scene.file).toEqual([late]);
    }
  });
});
