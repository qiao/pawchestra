import { describe, expect, it } from 'vitest';

import type { CameraTrace, CutTrace, SearchTrace } from '../src/shots/trace.ts';
import type { Shot } from '../src/shots/types.ts';
import { formatVersion } from './ref-tree.ts';
import {
  TRACE_FORMAT,
  cutLines,
  parseTraceOptions,
  searchSummary,
  shotRows,
  traceJson,
} from './shot-trace.ts';

/** Degrees to radians. */
const DEG = Math.PI / 180;

/**
 * Makes a tested camera.
 *
 * @param azimuth The azimuth, in degrees.
 * @param refusal The refusal, or `null` for the camera of the shot.
 * @param share The share of a refusal by the distance.
 * @returns The camera.
 */
function camera(
  azimuth: number,
  refusal: CameraTrace['refusal'],
  share: number | null = null,
): CameraTrace {
  return { azimuth: azimuth * DEG, elevation: 17 * DEG, arc: 6 * DEG, refusal, kept: false, share };
}

/**
 * Makes a search.
 *
 * @param cameras The tested cameras.
 * @returns The search.
 */
function search(cameras: CameraTrace[]): SearchTrace {
  return {
    subject: 'two-shot',
    front: 0,
    wantedAzimuth: 0,
    band: [-Infinity, 30 * DEG],
    full: false,
    outsideFront: 2,
    cameras,
  };
}

/**
 * Makes a shot that starts at a time.
 *
 * @param startSec The start.
 * @param endSec The end.
 * @returns The shot.
 */
function shot(startSec: number, endSec: number): Shot {
  const key = { azimuth: 0, elevation: 0.3, zoom: 1, fov: 30 };
  return {
    kind: 'solo',
    startSec,
    endSec,
    moveEndSec: endSec,
    seats: [2],
    part: null,
    target: [0, 1, 0],
    radius: 1,
    composition: null,
    from: key,
    to: key,
    blendSec: 0,
  };
}

describe('parseTraceOptions()', () => {
  it('reads the demo with no .mid, the range, and the switch of the cameras', () => {
    expect(
      parseTraceOptions(['mozart-k315.mid', '--from', '75', '--to', '95', '--cameras']),
    ).toEqual({
      demo: 'mozart-k315',
      fromSec: 75,
      toSec: 95,
      cameras: true,
      base: null,
      json: null,
    });
  });

  it('traces all cuts with no range', () => {
    const options = parseTraceOptions(['violin-piano']);
    expect(options.fromSec).toBe(-Infinity);
    expect(options.toSec).toBe(Infinity);
    expect(options.cameras).toBe(false);
  });

  it('stops on a missing demo, an empty range, a time that is not a number, or both outputs', () => {
    expect(() => parseTraceOptions([])).toThrow('Usage');
    expect(() => parseTraceOptions(['k315', '--from', '9', '--to', '8'])).toThrow('empty');
    expect(() => parseTraceOptions(['k315', '--from', 'x'])).toThrow('not one');
    expect(() => parseTraceOptions(['k315', '--to'])).toThrow('no value');
    expect(() => parseTraceOptions(['k315', '--base', 'main', '--json', 'a.json'])).toThrow(
      'do not go together',
    );
  });
});

describe('shotRows()', () => {
  it('writes each shot that starts in the range, with both ends', () => {
    const shots = [shot(-Infinity, 4), shot(4, 9), shot(9, 14), shot(14, Infinity)];
    const rows = shotRows(shots, 4, 9);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^\| 4\.00 \| 9\.00 \| solo \| 2 \|/);
    expect(shotRows(shots, -Infinity, 0)[0]).toMatch(/^\| start \| 4\.00 \|/);
  });
});

describe('searchSummary()', () => {
  it('counts the refusals and gives the nearest share of the distance and the camera', () => {
    const text = searchSummary(
      search([
        camera(93, 'distance', 0.4415),
        camera(81, 'head'),
        camera(87, 'distance', 0.4404),
        camera(99, 'distance', 0.452),
        camera(75, null),
      ]),
    );
    expect(text).toContain('4 refused (distance share 3 (nearest 0.4404 > 0.44 at 87.0°');
    expect(text).toContain('head in the foreground 1');
    expect(text).toContain('2 outside the front');
    expect(text).toMatch(/camera 75\.0° 17\.0° arc 6\.0°$/);
  });

  it('names no camera when each camera is refused', () => {
    expect(searchSummary(search([camera(81, 'jump')]))).toMatch(/no camera$/);
  });
});

describe('cutLines()', () => {
  it('writes the end of the cut, the rule of each dropped candidate, and each try', () => {
    const cut: CutTrace = {
      cutSec: 33.6,
      dropped: [{ id: 'solo 0', kind: 'solo', rule: 'subject' }],
      candidates: [
        {
          id: 'two-shot',
          kind: 'section',
          score: 3.27,
          tier: 'other',
          entering: [],
          attempts: [{ band: 0, searches: [search([camera(87, null)])], found: true }],
        },
        { id: 'solo 1', kind: 'solo', score: 0.3, tier: 'other', entering: [1], attempts: [] },
      ],
      chosen: 0,
      fill: [],
      outcome: 'candidate',
    };
    const lines = cutLines([cut], true);
    expect(lines).toContain('Cut 33.60 s: a candidate fits.');
    expect(lines).toContain('  Dropped solo 0: rule 1, the subject of the previous shot.');
    expect(lines.some((line) => line.startsWith('      band 1: two-shot'))).toBe(true);
    expect(lines).toContain('        87.0° 17.0° arc 6.0°: the camera of the shot');
    expect(lines).toContain('  1. two-shot: score 3.27, other, chosen');
    expect(lines).toContain('  2. solo 1: score 0.30, other, entering 1, not tried');
  });
});

describe('traceJson', () => {
  it('writes the output with its format version', () => {
    const output = { traced: true, shots: ['| row |'], cuts: [] };
    const text = traceJson(output);
    expect(formatVersion(text)).toBe(TRACE_FORMAT);
    expect(JSON.parse(text)).toEqual({ version: TRACE_FORMAT, ...output });
  });
});
