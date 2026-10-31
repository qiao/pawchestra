import { describe, expect, it } from 'vitest';

import { layoutScene } from '../src/models/layout-scene.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { Transport } from '../src/pose/types.ts';
import { focusOf } from '../src/scene/focus.ts';
import { buildScore } from '../src/score/score.ts';
import { cameraAt } from '../src/shots/camera-at.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import { farPlane } from '../src/shots/view.ts';

import type { TraceCell } from './gpu-trace.ts';
import { perf60Bytes } from './write-perf-60.ts';
import {
  CHROME_SEEK_SEC,
  MAX_CPU,
  METAL_SEEK_SEC,
  checkLines,
  cpuUse,
  frameOptions,
  gpuGuardFaults,
  loadsText,
  maximumCover,
  maximumShare,
  messageLines,
  middleFramesPerSecond,
  frameStats,
  frameTable,
  framesPerSecond,
  stateTimes,
  meetsTarget,
  sumByFrame,
  traceFrames,
  xctrace,
} from './measure-frame.ts';

describe('frameStats', () => {
  it('gives the nearest rank percentiles, the max, and the part within 4 ms', () => {
    const times = Array.from({ length: 20 }, (_, i) => i * 0.25 + 0.25);
    expect(frameStats(times)).toEqual({ count: 20, p50: 2.5, p95: 4.75, max: 5, within: 0.8 });
  });

  it('gives zeros for no frames', () => {
    expect(frameStats([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, within: 0 });
  });
});

describe('sumByFrame', () => {
  it('adds each slice to the frame of its start, and drops slices outside the frames', () => {
    const starts = [1000, 2000, 3000];
    const slices = [
      { ts: 500, dur: 9000 },
      { ts: 1000, dur: 300 },
      { ts: 1999, dur: 200 },
      { ts: 2500, dur: 1000 },
      { ts: 3000, dur: 4000 },
    ];
    expect(sumByFrame(starts, slices)).toEqual([0.5, 1]);
  });
});

describe('traceFrames', () => {
  it('reads the frames of the main thread and the GPU tasks of the GPU process', () => {
    const meta = (pid: number, tid: number, name: string) => ({
      name: 'thread_name',
      ph: 'M',
      pid,
      tid,
      ts: 0,
      args: { name },
    });
    const slice = (name: string, pid: number, tid: number, ts: number, dur: number) => ({
      name,
      ph: 'X',
      pid,
      tid,
      ts,
      dur,
    });
    const events = [
      meta(1, 10, 'CrRendererMain'),
      meta(2, 20, 'CrGpuMain'),
      meta(3, 30, 'CrRendererMain'),
      slice('FireAnimationFrame', 1, 10, 0, 2000),
      slice('FireAnimationFrame', 1, 10, 16_000, 3000),
      slice('FireAnimationFrame', 1, 10, 32_000, 1000),
      slice('ThreadControllerImpl::RunTask', 1, 10, 0, 2500),
      slice('ThreadControllerImpl::RunTask', 1, 10, 10_000, 500),
      slice('ThreadControllerImpl::RunTask', 1, 10, 16_000, 3500),
      slice('ThreadControllerImpl::RunTask', 3, 30, 1000, 9000),
      slice('GPUTask', 2, 20, 2000, 1500),
      slice('GPUTask', 2, 20, 18_000, 1000),
      slice('GPUTask', 1, 10, 18_000, 7000),
    ];
    expect(traceFrames(events)).toEqual({
      callback: [2, 3],
      main: [3, 3.5],
      gpuTask: [1.5, 1],
      spanSec: 0.032,
    });
  });
});

describe('meetsTarget', () => {
  it('needs 95% of the frames within 4 ms, and at least one frame', () => {
    const passing = [...Array.from({ length: 19 }, () => 3.9), 9];
    const failing = [...Array.from({ length: 18 }, () => 3.9), 9, 9];
    expect(meetsTarget(passing)).toBe(true);
    expect(meetsTarget(failing)).toBe(false);
    expect(meetsTarget([])).toBe(false);
  });
});

describe('frameTable', () => {
  it('gives a Markdown row for each measure, with a verdict only for a target', () => {
    const lines = frameTable([
      { name: 'Main thread', times: [1, 2, 3], target: true },
      { name: 'GPU', times: [5, 6, 3], target: true },
      { name: 'Old GPU', times: [5, 6, 3], target: false },
    ]);
    expect(lines).toEqual([
      '| Measure | Frames | p50 (ms) | p95 (ms) | Max (ms) | Within 4 ms | Target |',
      '|---|---|---|---|---|---|---|',
      '| Main thread | 3 | 2.00 | 3.00 | 3.00 | 100.0% | pass |',
      '| GPU | 3 | 5.00 | 6.00 | 6.00 | 33.3% | fail |',
      '| Old GPU | 3 | 5.00 | 6.00 | 6.00 | 33.3% | information |',
    ]);
  });
});

describe('frameTable with a note', () => {
  it('fails a target row with a note, whatever its times are', () => {
    const lines = frameTable([{ name: 'GPU', times: [1, 2, 3], target: true, note: 'self-check' }]);
    expect(lines[2]).toBe('| GPU | 3 | 2.00 | 3.00 | 3.00 | 100.0% | fail (self-check) |');
  });
});

describe('checkLines', () => {
  const check = {
    frames: 650,
    spanSec: 3.25,
    droppedCanvas: { buffers: 649, ms: 454.3 },
    droppedOther: { buffers: 1298, ms: 649 },
    merged: 2,
    canvasWrites: 1303,
    endWrites: 1,
  };

  it('prints the frames against the expected counts, the merges, and the dropped time', () => {
    const [count, page, dropped, ...rest] = checkLines(check, 196, []);
    expect(count).toContain('650 WebGL frames in 3.250 s');
    expect(count).toContain(
      'against 651 from the 1303 canvas writes of the trace, with 1 at its ends (-0.2%).',
    );
    expect(count).toContain('Merged frames: 2.');
    expect(page).toContain('637 frames (2.0%), for information.');
    expect(dropped).toContain('canvas buffers 0.700 ms (649 buffers)');
    expect(dropped).toContain('other buffers 1.000 ms (1298 buffers)');
    expect(rest).toEqual([]);
  });

  it('adds a warning with the faults', () => {
    expect(checkLines(check, 200, ['A fault.']).at(-1)).toBe(
      'Warning: the self-check fails, so the GPU row fails. A fault.',
    );
  });
});

describe('frameOptions', () => {
  it('gives the defaults of the frame target', () => {
    expect(frameOptions([], true)).toEqual({
      demo: 'perf-60',
      scale: 2,
      headed: false,
      free: false,
      maxCpu: MAX_CPU,
      waitSec: 300,
      metal: true,
      gpuOnly: false,
      keep: undefined,
    });
  });

  it('reads each flag', () => {
    const flags = ['--demo=bach', '--scale=1', '--free', '--max-cpu=25', '--wait=5', '--no-metal'];
    expect(frameOptions([...flags, '--keep=out', '--headed'], true)).toEqual({
      demo: 'bach',
      scale: 1,
      headed: true,
      free: true,
      maxCpu: 25,
      waitSec: 5,
      metal: false,
      gpuOnly: false,
      keep: 'out',
    });
  });

  it('refuses an unknown flag and a value that is not a positive number', () => {
    expect(() => frameOptions(['--uncapped'], true)).toThrow(/Unknown flag/);
    expect(() => frameOptions(['perf-60'], true)).toThrow(/Unknown argument/);
    expect(() => frameOptions(['--max-cpu=high'], true)).toThrow(/positive number/);
    expect(() => frameOptions(['--max-load=8'], true)).toThrow(/Unknown flag/);
    expect(() => frameOptions(['--scale=0'], true)).toThrow(/positive number/);
  });

  it('reads --gpu-only, and refuses it with --no-metal', () => {
    expect(frameOptions(['--gpu-only'], true).gpuOnly).toBe(true);
    expect(() => frameOptions(['--gpu-only', '--no-metal'], true)).toThrow(/--gpu-only needs/);
  });

  it('records no Metal trace with no xctrace, and refuses --gpu-only then', () => {
    expect(frameOptions([], false).metal).toBe(false);
    expect(() => frameOptions(['--gpu-only'], false)).toThrow(/finds no xctrace/);
  });

  it('refuses a value flag with no value and a switch with a value', () => {
    expect(() => frameOptions(['--keep'], true)).toThrow(/needs a value/);
    expect(() => frameOptions(['--demo='], true)).toThrow(/needs a value/);
    expect(() => frameOptions(['--headed=1'], true)).toThrow(/takes no value/);
  });
});

describe('cpuUse', () => {
  it('gives the busy time of all cores over their whole time, in percent', () => {
    const core = (busy: number, idle: number) => ({
      model: 'M1 Max',
      speed: 24,
      times: { user: busy / 2, nice: 0, sys: busy / 2, idle, irq: 0 },
    });
    const before = [core(100, 900), core(0, 1000)];
    const after = [core(400, 1600), core(100, 2900)];
    // Busy 300 + 100 of 300 + 700 + 100 + 1900.
    expect(cpuUse(before, after)).toBeCloseTo(13.333, 3);
    expect(cpuUse(before, before)).toBe(0);
  });
});

describe('stateTimes', () => {
  it('adds the time of each GPU performance state', () => {
    const cell = (fmt: string, raw = ''): TraceCell => ({ fmt, raw });
    const table = {
      columns: ['start', 'duration', 'gpu-performance-state'],
      rows: [
        [cell('0'), cell('1 ms', '1000000'), cell('Minimum')],
        [cell('1'), cell('3 ms', '3000000'), cell('Maximum')],
        [cell('4'), cell('1 ms', '1000000'), cell('Minimum')],
      ],
    };
    expect(stateTimes(table)).toEqual(
      new Map([
        ['Minimum', 2],
        ['Maximum', 3],
      ]),
    );
    expect(stateTimes({ ...table, rows: [] }).size).toBe(0);
    expect(() => stateTimes({ ...table, columns: ['start'] })).toThrow(/state/);
  });
});

describe('gpuGuardFaults', () => {
  const states = (maximum: number, minimum: number) =>
    new Map([
      ['Minimum', minimum],
      ['Maximum', maximum],
    ]);

  it('gives the share of the state time in "Maximum"', () => {
    expect(maximumShare(states(2924, 1))).toBeCloseTo(0.99966, 5);
    expect(maximumShare(new Map())).toBe(0);
  });

  it('gives the part of the span of the GPU intervals that the "Maximum" rows cover', () => {
    expect(maximumCover(states(2700, 1), 3600)).toBe(0.75);
    expect(maximumCover(states(2700, 1), 0)).toBe(0);
  });

  it('passes a trace at "Maximum" with little other GPU work', () => {
    expect(gpuGuardFaults(states(2700, 300), 0.1, 3400)).toEqual([]);
  });

  it('fails a lower clock and other GPU work above 10%', () => {
    expect(gpuGuardFaults(states(2600, 400), 0.02, 3400)).toEqual([
      'The GPU was in its "Maximum" state for 86.7% of the state time, below 90%.',
    ]);
    expect(gpuGuardFaults(states(3000, 0), 0.27, 3400)).toEqual([
      'Other processes used the GPU in 27% of the trace, above 10%.',
    ]);
    expect(gpuGuardFaults(new Map(), 0, 3400)).toHaveLength(2);
  });

  it('fails one short "Maximum" row in a long trace', () => {
    // A low state that is open at both ends of the trace has no row.
    const short = new Map([['Maximum', 50]]);
    expect(maximumShare(short)).toBe(1);
    expect(gpuGuardFaults(short, 0, 3500)).toEqual([
      'The rows of the "Maximum" state cover 1.4% of the span of the GPU intervals, below 60%.',
    ]);
  });
});

describe('the seeks before the traces', () => {
  it('put each trace into one shot of perf-60.mid with the depth of field', () => {
    const result = buildScore(perf60Bytes(), 'auto');
    if (!result.ok) {
      throw new Error(result.error);
    }
    const models = new ModelCache();
    const plan = prepareShots(result.score, layoutScene(result.score, models), SHOT_SEED, models);
    const transport: Transport = {
      playing: true,
      changedAtWall: 0,
      before: null,
      startSec: 0,
      holdSec: 3,
      leadSec: Infinity,
    };
    // The settle of 1 s, then the Chrome trace of 10 s, or the start of xctrace and its record.
    const windows: [number, number][] = [
      [CHROME_SEEK_SEC + 1, CHROME_SEEK_SEC + 11],
      [METAL_SEEK_SEC + 1, METAL_SEEK_SEC + 9],
    ];
    for (const [from, to] of windows) {
      const shots = plan.shots.filter((shot) => shot.startSec < to && shot.endSec > from);
      expect(shots).toHaveLength(1);
      for (let time = from; time <= to; time += 0.5) {
        const camera = cameraAt(plan, time, transport, { aspect: 1.6, still: false });
        const distance = Math.hypot(
          ...camera.target.map((value, i) => value - (camera.position[i] ?? 0)),
        );
        const far = farPlane(distance, plan.stageSide);
        const focus = focusOf(camera.position, camera.target, camera.fov, far, plan.stageSide);
        expect(focus.active).toBe(true);
      }
    }
  });
});

describe('loadsText', () => {
  it('gives the load of each phase, with no main-thread phase for --gpu-only', () => {
    expect(loadsText({ mainThread: 4.24, gpu: 4.6, end: 11.38 })).toBe(
      'main-thread phase 4.2, GPU phase 4.6, end 11.4',
    );
    expect(loadsText({ mainThread: null, gpu: 4.6, end: 11.38 })).toBe('GPU phase 4.6, end 11.4');
  });
});

describe('messageLines', () => {
  it('gives each console message with its count, the most frequent first', () => {
    const long = `warning: ${'x'.repeat(300)}`;
    const lines = messageLines(
      new Map([
        ['error: one', 1],
        [long, 12],
      ]),
    );
    expect(lines[0]).toContain('count and text');
    expect(lines[1]).toBe(`  12 × ${long.slice(0, 200)}...`);
    expect(lines[2]).toBe('  1 × error: one');
  });

  it('says when the pages gave no message', () => {
    expect(messageLines(new Map())).toEqual(['Console warnings and errors of the pages: none.']);
  });
});

describe('middleFramesPerSecond', () => {
  it('gives the frame rate of the middle half of the window', () => {
    // 1 s at 250 fps, 2 s at 200 fps, and 1 s at 250 fps.
    const fast = (start: number) => Array.from({ length: 250 }, (_, i) => start + i * 4);
    const slow = Array.from({ length: 400 }, (_, i) => 1000 + i * 5);
    const marks = [...fast(0), ...slow, ...fast(3000)];
    expect(framesPerSecond(marks)).toBeGreaterThan(220);
    expect(middleFramesPerSecond(marks)).toBeCloseTo(200, 6);
    expect(middleFramesPerSecond([5])).toBe(0);
  });
});

describe('framesPerSecond', () => {
  it('counts the frame gaps in the time between the first and the last stamp', () => {
    expect(framesPerSecond([0, 16, 32, 48, 64])).toBe(62.5);
    expect(framesPerSecond([5])).toBe(0);
  });
});

describe('xctrace', () => {
  it('starts no run after the stop of the measure', async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(xctrace(['version'], 10_000, () => undefined, stop.signal)).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
  });
});
