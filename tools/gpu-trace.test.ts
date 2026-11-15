import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  busyMs,
  canvasWriteFrames,
  checkFrames,
  droppedPerFrame,
  frameCheckFaults,
  gpuIntervals,
  gpuSpanMs,
  otherGpuShare,
  parseTraceTable,
  webglFrames,
} from './gpu-trace.ts';
import type { GpuInterval } from './gpu-trace.ts';

/** A small export of `metal-gpu-intervals` with ids, refs, nested ids, and an empty value. */
const XML = `<?xml version="1.0"?>
<trace-query-result>
<node xpath='//trace-toc[1]/run[1]/data[1]/table[109]'><schema name="metal-gpu-intervals"><col><mnemonic>start</mnemonic></col><col><mnemonic>duration</mnemonic></col><col><mnemonic>channel-name</mnemonic></col><col><mnemonic>event-label</mnemonic></col><col><mnemonic>process</mnemonic></col><col><mnemonic>iosurface-accesses</mnemonic></col><col><mnemonic>cmdbuffer-id</mnemonic></col></schema>
<row><start-time id="1" fmt="00:00.000.100">100</start-time><duration id="2" fmt="50 ns">50</duration><gpu-channel-name id="3" fmt="Vertex">Vertex</gpu-channel-name><formatted-label id="4" fmt="Render Command 1 ( A &amp; B (7) )"><string id="5" fmt="x">x</string><process id="6" fmt="A &amp; B (7)"><pid id="7" fmt="7">7</pid></process></formatted-label><process ref="6"/><sentinel/><metal-command-buffer-id id="8" fmt="0x1">1</metal-command-buffer-id></row>
<row><start-time id="9" fmt="00:00.000.120">120</start-time><duration ref="2"/><gpu-channel-name id="10" fmt="Fragment">Fragment</gpu-channel-name><formatted-label ref="4"/><process ref="6"/><formatted-label id="11" fmt="Write Surface: 3(8×8)">Write</formatted-label><metal-command-buffer-id ref="8"/></row>
<row><start-time id="12" fmt="00:00.000.300">300</start-time><duration id="13" fmt="10 ns">10</duration><gpu-channel-name ref="3"/></row>
</node></trace-query-result>`;

describe('parseTraceTable', () => {
  it('gives each cell its value, also through a ref to an id inside another element', () => {
    const table = parseTraceTable(XML);
    expect(table.columns).toEqual([
      'start',
      'duration',
      'channel-name',
      'event-label',
      'process',
      'iosurface-accesses',
      'cmdbuffer-id',
    ]);
    expect(table.rows).toHaveLength(3);
    const [first, second, third] = table.rows;
    expect(first?.[0]).toEqual({ fmt: '00:00.000.100', raw: '100' });
    expect(first?.[4]?.fmt).toBe('A & B (7)');
    expect(first?.[5]).toEqual({ fmt: '', raw: '' });
    expect(second?.[1]).toEqual({ fmt: '50 ns', raw: '50' });
    expect(second?.[3]?.fmt).toBe('Render Command 1 ( A & B (7) )');
    expect(second?.[6]).toEqual({ fmt: '0x1', raw: '1' });
    expect(third?.[2]).toEqual({ fmt: 'Vertex', raw: 'Vertex' });
    expect(third?.[6]).toEqual({ fmt: '', raw: '' });
  });

  it('refuses a text with no schema', () => {
    expect(() => parseTraceTable('<trace-query-result/>')).toThrow(/schema/);
  });
});

describe('gpuIntervals', () => {
  it('reads the start, the duration, and the texts of each row', () => {
    const [first, second] = gpuIntervals(parseTraceTable(XML));
    expect(first).toEqual({
      startNs: 100,
      durationNs: 50,
      channel: 'Vertex',
      process: 'A & B (7)',
      commandBuffer: '1',
      label: 'Render Command 1 ( A & B (7) )',
      surfaces: '',
    });
    expect(second?.surfaces).toBe('Write Surface: 3(8×8)');
  });
});

/**
 * Makes a GPU interval of the process `GPU (7)`.
 *
 * @param startMs The start, in milliseconds.
 * @param ms The duration, in milliseconds.
 * @param buffer The command buffer.
 * @param label The label of the encoder.
 * @param channel The channel.
 * @param surfaces The IOSurface accesses.
 * @returns The interval.
 */
function interval(
  startMs: number,
  ms: number,
  buffer: string,
  label = 'Render Command 1',
  channel = 'Fragment',
  surfaces = '',
): GpuInterval {
  return {
    startNs: startMs * 1e6,
    durationNs: ms * 1e6,
    channel,
    process: 'GPU (7)',
    commandBuffer: buffer,
    label,
    surfaces,
  };
}

describe('busyMs', () => {
  it('counts the time of overlapping intervals one time', () => {
    expect(busyMs([interval(0, 2, 'a'), interval(1, 2, 'a'), interval(5, 1, 'a')])).toBe(4);
    expect(busyMs([])).toBe(0);
  });
});

/** The size of the drawing buffer in the tests: 1440 × 900 at the device scale 2. */
const CANVAS: readonly [number, number] = [2880, 1800];

/**
 * Gives the write of a canvas surface, as the Metal trace gives it.
 *
 * @param surface The id of the surface.
 * @returns The IOSurface accesses of the encoder.
 */
function canvasWrite(surface: number): string {
  return `Write Surface: ${surface}(2880×1800:ARGB)`;
}

/** The write of a canvas surface, as the Metal trace gives it. */
const CANVAS_WRITE = canvasWrite(9);

/**
 * Makes the first command buffer of a WebGL frame, as ANGLE on Metal gives it: 27 encoders with
 * 11 blits, the clear of the drawing buffer, and two writes of the canvas.
 *
 * @param startMs The start, in milliseconds.
 * @param buffer The command buffer.
 * @param clearLabel False for a trace that gives no label to the clear: then the buffer has no
 *   encoder 2, as in some frames of each kept trace.
 * @param surface The id of the canvas surface that the buffer writes.
 * @returns The intervals: 27 encoders (26 with no label), each 0.01 ms long and 0.01 ms apart.
 */
function firstBuffer(
  startMs: number,
  buffer: string,
  clearLabel = true,
  surface = 9,
): GpuInterval[] {
  const encoders = Array.from({ length: 27 }, (_, i) => {
    const blit = i === 4 || (i >= 7 && i % 2 === 1);
    let label = `Render Command ${i}`;
    if (blit) {
      label = `Blit Command ${i}`;
    } else if (i === 2) {
      label = 'Render Command 2   (Clear)';
    }
    const surfaces = i === 1 || i === 3 ? canvasWrite(surface) : '';
    return interval(
      startMs + i * 0.02,
      0.01,
      buffer,
      label,
      blit ? 'Compute' : 'Fragment',
      surfaces,
    );
  });
  return clearLabel ? encoders : encoders.filter((encoder) => !encoder.label.includes('(Clear)'));
}

describe('webglFrames', () => {
  it('splits the WebGL work at each clear of the drawing buffer, without the compositor', () => {
    const intervals = [
      // The end of a frame that started before the trace.
      interval(0, 1, 'w0', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      ...firstBuffer(10, 'f1'),
      interval(11, 1, 'w1', 'Render Command 1', 'Vertex'),
      interval(11.5, 2, 'w1'),
      interval(14, 1, 'w1', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      // The compositor reads the canvas and writes the window, or reads the tiles of the page.
      interval(15, 3, 'c1', 'Render Command 0', 'Fragment', 'Read Surface: 9(2880×1800:ARGB)'),
      interval(18, 1, 'c1', 'Render Command 7', 'Fragment', 'Write Surface: 4(1440×900:ARGB)'),
      interval(19, 1, 'c2', 'Render Command 0', 'Fragment', 'Read Surface: 5(1472×256:ARGB)'),
      ...firstBuffer(20, 'f2'),
      interval(21, 2, 'w2'),
      interval(23, 1, 'w3', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      // Another process.
      { ...interval(24, 9, 'x'), process: 'GPU (8)' },
      // A frame that goes on after the trace.
      ...firstBuffer(30, 'f3'),
    ];
    // Each first buffer is busy for 27 * 0.01 = 0.27 ms.
    const times = webglFrames(intervals, '(7)', CANVAS).map((frame) => busyMs(frame));
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0.27 + 3.5, 6);
    expect(times[1]).toBeCloseTo(0.27 + 3, 6);
  });

  it('counts a WebGL command buffer that reads the canvas', () => {
    const intervals = [
      ...firstBuffer(0, 'f1'),
      interval(1, 2, 'w1', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      interval(3, 0.5, 'r1', 'Blit Command 0', 'Compute', 'Read Surface: 9(2880×1800:ARGB)'),
      ...firstBuffer(10, 'f2'),
    ];
    const times = webglFrames(intervals, '(7)', CANVAS).map((frame) => busyMs(frame));
    expect(times).toHaveLength(1);
    expect(times[0]).toBeCloseTo(0.27 + 2.5, 6);
  });

  it('starts a frame at a first command buffer with no clear label after the final pass', () => {
    const intervals = [
      ...firstBuffer(0, 'f1'),
      interval(1, 2, 'w1'),
      interval(3, 1, 'w2', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      ...firstBuffer(10, 'f2', false),
      interval(11, 2, 'w3'),
      interval(13, 1.5, 'w4', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      ...firstBuffer(20, 'f3'),
    ];
    // The first buffer with no label has 26 encoders: 0.26 ms busy.
    const times = webglFrames(intervals, '(7)', CANVAS).map((frame) => busyMs(frame));
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0.27 + 3, 6);
    expect(times[1]).toBeCloseTo(0.26 + 3.5, 6);
  });

  it('counts a WebGL command buffer with a surface of the display, and drops the compositor', () => {
    const intervals = [
      ...firstBuffer(0, 'f1'),
      interval(1, 2, 'w1'),
      interval(3, 1, 'w2', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      // The trace puts a blit of surfaces of the display into the first buffer of a frame.
      ...firstBuffer(10, 'f2'),
      interval(
        10.6,
        0.1,
        'f2',
        'Blit Command 4',
        'Compute',
        'Read Surface: 887(64×320:ARGB) -> Write Surface: 1075(3456×2168:ARGB)',
      ),
      interval(11, 2, 'w3'),
      interval(13, 1.5, 'w4', 'Render Command 4', 'Fragment', CANVAS_WRITE),
      // The trace lists the canvas among the writes of an encoder of the compositor.
      interval(
        15,
        0.3,
        'c1',
        'Render Command 0',
        'Fragment',
        'Read Surface: 5(1472×256:ARGB) -> Write Surface: 4(1440×900:ARGB) 9(2880×1800:ARGB)',
      ),
      ...firstBuffer(20, 'f3'),
    ];
    const times = webglFrames(intervals, '(7)', CANVAS).map((frame) => busyMs(frame));
    expect(times).toHaveLength(2);
    expect(times[0]).toBeCloseTo(0.27 + 3, 6);
    expect(times[1]).toBeCloseTo(0.27 + 0.1 + 3.5, 6);
  });
});

/**
 * Makes three WebGL frames of 10 ms each, with a command buffer of the compositor in each frame.
 * Frame `k` writes the canvas surface `10 + k`, as Chrome turns through its canvas surfaces.
 *
 * @returns The intervals: the first buffers `f1` to `f4`, the final passes `w1` to `w3`, and the
 *   compositor buffers `c1` to `c3`.
 */
function threeFrames(): GpuInterval[] {
  return [
    ...[1, 2, 3].flatMap((k) => {
      const start = (k - 1) * 10;
      return [
        ...firstBuffer(start, `f${k}`, true, 10 + k),
        interval(start + 1, 2, `w${k}`, 'Render Command 4', 'Fragment', canvasWrite(10 + k)),
        interval(
          start + 2.5,
          0.5,
          `c${k}`,
          'Render Command 0',
          'Fragment',
          'Read Surface: 5(1472×256:ARGB) -> Write Surface: 4(1440×900:ARGB)',
        ),
      ];
    }),
    ...firstBuffer(30, 'f4', true, 14),
  ];
}

/** The fixture of a real Metal trace: six WebGL frames of the run `e` (`gpu-trace.fixture.json`). */
interface TraceFixture {
  /** The source of the cuts, the process, the size of the drawing buffer, and the columns. */
  readonly header: {
    readonly process: string;
    readonly canvas: readonly [number, number];
  };
  /** The start, the duration, the channel, the buffer, the label, and the surfaces of each row. */
  readonly intervals: readonly (readonly [number, number, string, string, string, string])[];
}

/** The values of the fixture of a real Metal trace. */
interface RealTrace {
  /** The GPU process of Chrome. */
  readonly process: string;
  /** The size of the drawing buffer. */
  readonly canvas: readonly [number, number];
  /** The intervals of the GPU process. */
  readonly intervals: GpuInterval[];
}

/**
 * Reads the fixture of a real Metal trace.
 *
 * @returns The process, the size of the drawing buffer, and the intervals.
 */
function realTrace(): RealTrace {
  const text = readFileSync(join(import.meta.dirname, 'gpu-trace.fixture.json'), 'utf8');
  // SAFETY: the fixture is a file of the repository with the fields of TraceFixture.
  const { header, intervals } = JSON.parse(text) as TraceFixture;
  return {
    process: header.process,
    canvas: header.canvas,
    intervals: intervals.map(([startNs, durationNs, channel, commandBuffer, label, surfaces]) => ({
      startNs,
      durationNs,
      channel,
      process: header.process,
      commandBuffer,
      label,
      surfaces,
    })),
  };
}

describe('webglFrames on a real trace', () => {
  it('gives each frame with its busy time, also at the known faults of the trace', () => {
    // Frame 368 holds a read of the canvas and a blit of the display in one buffer. The trace
    // comes from a build that read the frame behind the title (before 837bbdbe8).
    // Frame 572 has encoders with only the label "GPU Execution". Frame 579 starts at a clear
    // with no label, which writes the canvas surface of the clear of frame 571. Compositor
    // buffers run between the frames.
    const { process, canvas, intervals } = realTrace();
    const frames = webglFrames(intervals, process, canvas);
    const times = frames.map((frame) => busyMs(frame));
    expect(times).toHaveLength(6);
    [3.933, 4.0279, 4.3632, 4.5901, 4.4152, 4.7035].forEach((ms, i) => {
      expect(times[i]).toBeCloseTo(ms, 3);
    });
    const check = checkFrames(intervals, process, canvas, frames);
    expect(frameCheckFaults(check, canvasWriteFrames(check))).toEqual([]);
    expect(check.droppedOther.buffers).toBeGreaterThan(0);
  });
});

describe('checkFrames', () => {
  it('counts the buffers that the filter dropped: canvas buffers apart from the compositor', () => {
    const intervals = threeFrames();
    const frames = webglFrames(intervals, '(7)', CANVAS);
    const check = checkFrames(intervals, '(7)', CANVAS, frames);
    expect(check.frames).toBe(3);
    expect(check.droppedCanvas).toEqual({ buffers: 0, ms: 0 });
    // The check ends at the start of the last frame, so c3 does not count.
    expect(check.droppedOther.buffers).toBe(2);
    expect(check.droppedOther.ms).toBeCloseTo(1, 6);
    expect(check.merged).toBe(0);
    // f1 to f4 and w1 to w3 write the canvas. The open frame of f4 has one write at the end.
    expect(check.canvasWrites).toBe(7);
    expect(check.endWrites).toBe(1);
    expect(canvasWriteFrames(check)).toBe(3);
    // From the start of f1 to the end of w3.
    expect(check.spanSec).toBeCloseTo(0.023, 9);

    // A filter that drops the first command buffer of each frame, as the filter of e584e16f.
    const noFirst = frames.map((frame) => frame.filter((i) => !i.commandBuffer.startsWith('f')));
    const old = checkFrames(intervals, '(7)', CANVAS, noFirst);
    expect(old.droppedCanvas.buffers).toBe(2);
    expect(droppedPerFrame(old, old.droppedCanvas)).toBeCloseTo(0.27, 6);
  });

  it('counts a frame with more than two writes of the canvas as merged', () => {
    const intervals = threeFrames();
    const [first = [], second = [], third = []] = webglFrames(intervals, '(7)', CANVAS);
    const check = checkFrames(intervals, '(7)', CANVAS, [[...first, ...second], third]);
    expect(check.frames).toBe(2);
    expect(check.merged).toBe(1);
    expect(check.canvasWrites).toBe(7);
    expect(canvasWriteFrames(check)).toBe(3);
  });

  it('counts the canvas writes of the whole trace, apart from the partial frames at its ends', () => {
    const intervals = [
      // The final pass of a frame that started before the trace.
      interval(-5, 1, 'w0', 'Render Command 4', 'Fragment', canvasWrite(10)),
      ...threeFrames(),
      // The final pass of the open frame of f4.
      interval(31, 2, 'w4', 'Render Command 4', 'Fragment', canvasWrite(14)),
    ];
    const frames = webglFrames(intervals, '(7)', CANVAS);
    const check = checkFrames(intervals, '(7)', CANVAS, frames);
    expect(check.frames).toBe(3);
    expect(check.canvasWrites).toBe(9);
    expect(check.endWrites).toBe(3);
    expect(canvasWriteFrames(check)).toBe(3);
    expect(frameCheckFaults(check, canvasWriteFrames(check))).toEqual([]);
  });

  it('fails a filter that gives no frames, or loses the frames at the ends', () => {
    const intervals = threeFrames();
    const none = checkFrames(intervals, '(7)', CANVAS, []);
    expect(canvasWriteFrames(none)).toBe(3);
    expect(frameCheckFaults(none, canvasWriteFrames(none))).toEqual([
      'The filter gave no WebGL frames.',
      'The filter gave 0 frames against 3 expected (-100.0%), more than 2% off.',
    ]);
    const middle = webglFrames(intervals, '(7)', CANVAS).slice(1, -1);
    const cut = checkFrames(intervals, '(7)', CANVAS, middle);
    expect(frameCheckFaults(cut, canvasWriteFrames(cut))).toEqual([
      'The filter gave 1 frames against 3 expected (-66.7%), more than 2% off.',
    ]);
  });
});

describe('frameCheckFaults', () => {
  const check = {
    frames: 100,
    spanSec: 0.5,
    droppedCanvas: { buffers: 0, ms: 0 },
    droppedOther: { buffers: 100, ms: 50 },
    merged: 0,
    canvasWrites: 202,
    endWrites: 2,
  };

  it('gives no fault for a frame count within 2% and no dropped canvas time', () => {
    expect(frameCheckFaults(check, 102)).toEqual([]);
    expect(frameCheckFaults(check, null)).toEqual([]);
  });

  it('gives a fault for dropped canvas time, a frame count off by more than 2%, and merges', () => {
    const dropped = { ...check, droppedCanvas: { buffers: 100, ms: 11 } };
    expect(frameCheckFaults(dropped, 100)).toEqual([
      'The filter dropped 0.11 ms of canvas buffers in each frame, above 0.1 ms.',
    ]);
    expect(frameCheckFaults(check, 97.9)).toEqual([
      'The filter gave 100 frames against 98 expected (2.1%), more than 2% off.',
    ]);
    expect(frameCheckFaults({ ...check, merged: 3 }, null)).toEqual([
      '3 frames hold more than two writes of the canvas.',
    ]);
  });
});

describe('otherGpuShare', () => {
  it('gives the busy time of the other processes over the span of the trace', () => {
    const other = (startMs: number, ms: number): GpuInterval => ({
      ...interval(startMs, ms, 'o'),
      process: 'Google Chrome Helper (8)',
    });
    const intervals = [interval(0, 4, 'a'), other(1, 2), other(2, 2), interval(8, 2, 'b')];
    expect(otherGpuShare(intervals, '(7)')).toBe(0.3);
    expect(gpuSpanMs(intervals)).toBe(10);
    expect(gpuSpanMs([])).toBe(0);
    expect(otherGpuShare([interval(0, 4, 'a')], '(7)')).toBe(0);
    expect(otherGpuShare([], '(7)')).toBe(0);
  });
});
