/** One cell of a table of an `xctrace export`: the formatted value and the raw value. */
export interface TraceCell {
  /** The `fmt` attribute, for example `1.46 ms`, or an empty string. */
  readonly fmt: string;
  /** The text of the element, for example `1462959`, or an empty string. */
  readonly raw: string;
}

/** A table of an `xctrace export`: the mnemonic of each column, and the cells of each row. */
export interface TraceTable {
  /** The mnemonic of each column of the schema, for example `start` or `channel-name`. */
  readonly columns: readonly string[];
  /** The cells of each row, one cell for each column, in the order of the columns. */
  readonly rows: readonly (readonly TraceCell[])[];
}

/** The cell of an empty value, such as `<sentinel/>`. */
const EMPTY_CELL: TraceCell = { fmt: '', raw: '' };

/**
 * Replaces the five XML entities of an attribute or a text with their characters.
 *
 * @param text The text.
 * @returns The text with no entities.
 */
function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * Reads an attribute from the attribute text of a tag.
 *
 * @param attributes The attribute text, for example ` id="3" fmt="Vertex"`.
 * @param name The attribute name.
 * @returns The value, or `undefined`.
 */
function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(attributes);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

/**
 * Parses one table of `xctrace export --xpath`. The export writes each value one time with an
 * `id`, and each repeat as an element with a `ref` to that id, also inside other elements. The
 * parser keeps each id, so that each cell holds its value.
 *
 * @param xml The XML text of the export.
 * @returns The table. A row with fewer elements than columns gets empty cells at the end.
 * @throws Error if the text has no schema.
 */
export function parseTraceTable(xml: string): TraceTable {
  const schema = /<schema[\s\S]*?<\/schema>/.exec(xml)?.[0];
  if (!schema) {
    throw new Error('The xctrace export has no table schema.');
  }
  const columns = [...schema.matchAll(/<mnemonic>([^<]*)<\/mnemonic>/g)].map((m) => m[1] ?? '');

  const known = new Map<string, TraceCell>();
  const rows: TraceCell[][] = [];
  const token = /<(\/?)([\w-]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const rowMatch of xml.matchAll(/<row>([\s\S]*?)<\/row>/g)) {
    const cells: TraceCell[] = [];
    // The open elements of the row: their id, fmt, text, and the index of their cell.
    const open: { id: string | undefined; fmt: string; raw: string; cell: number }[] = [];
    for (const t of (rowMatch[1] ?? '').matchAll(token)) {
      const [, closing, , attributes = '', selfClosing, text] = t;
      if (text !== undefined) {
        const top = open.at(-1);
        if (top) {
          top.raw += unescapeXml(text);
        }
        continue;
      }
      if (closing) {
        const element = open.pop();
        if (!element) {
          continue;
        }
        const cell = { fmt: element.fmt, raw: element.raw.trim() };
        if (element.id !== undefined) {
          known.set(element.id, cell);
        }
        if (open.length === 0) {
          cells[element.cell] = cell;
        }
        continue;
      }
      const ref = attribute(attributes, 'ref');
      const id = attribute(attributes, 'id');
      const fmt = attribute(attributes, 'fmt') ?? '';
      if (selfClosing) {
        const cell = ref === undefined ? { fmt, raw: '' } : (known.get(ref) ?? EMPTY_CELL);
        if (id !== undefined) {
          known.set(id, cell);
        }
        if (open.length === 0) {
          cells.push(cell);
        }
        continue;
      }
      if (open.length === 0) {
        cells.push(EMPTY_CELL);
      }
      open.push({ id, fmt, raw: '', cell: open.length === 0 ? cells.length - 1 : -1 });
    }
    while (cells.length < columns.length) {
      cells.push(EMPTY_CELL);
    }
    rows.push(cells);
  }
  return { columns, rows };
}

/** One interval of GPU work of one encoder on one channel of the GPU. */
export interface GpuInterval {
  /** The start, in nanoseconds from the start of the trace. */
  readonly startNs: number;
  /** The duration, in nanoseconds. */
  readonly durationNs: number;
  /** `Vertex`, `Fragment`, or `Compute`. */
  readonly channel: string;
  /** The process, for example `Google Chrome Helper (GPU) (8621)`. */
  readonly process: string;
  /** The id of the Metal command buffer. */
  readonly commandBuffer: string;
  /** The label of the encoder, for example `Command Buffer 0:Render Command 2`. */
  readonly label: string;
  /** The IOSurface reads and writes of the encoder, for example `Write Surface: 961(...)`. */
  readonly surfaces: string;
}

/**
 * Reads the GPU intervals from the table `metal-gpu-intervals` of a Metal System Trace.
 *
 * @param table The parsed table.
 * @returns The intervals.
 * @throws Error if the table has no column that the function reads.
 */
export function gpuIntervals(table: TraceTable): GpuInterval[] {
  const index = (name: string): number => {
    const i = table.columns.indexOf(name);
    if (i < 0) {
      throw new Error(`The GPU table has no column "${name}".`);
    }
    return i;
  };
  const columns = {
    start: index('start'),
    duration: index('duration'),
    channel: index('channel-name'),
    process: index('process'),
    commandBuffer: index('cmdbuffer-id'),
    label: index('event-label'),
    surfaces: index('iosurface-accesses'),
  };
  return table.rows.map((row) => {
    const cell = (i: number): TraceCell => row[i] ?? EMPTY_CELL;
    return {
      startNs: Number(cell(columns.start).raw),
      durationNs: Number(cell(columns.duration).raw),
      channel: cell(columns.channel).fmt,
      process: cell(columns.process).fmt,
      commandBuffer: cell(columns.commandBuffer).raw,
      label: cell(columns.label).fmt,
      surfaces: cell(columns.surfaces).fmt,
    };
  });
}

/**
 * Calculates the time in which at least one of the intervals runs: the union of the intervals.
 * The vertex work of a pass can run at the same time as the fragment work of the pass before it,
 * so a sum of the durations counts that time twice.
 *
 * @param intervals The intervals.
 * @returns The busy time, in milliseconds.
 */
export function busyMs(intervals: readonly GpuInterval[]): number {
  const sorted = intervals.toSorted((a, b) => a.startNs - b.startNs);
  let busy = 0;
  let end = -Infinity;
  for (const { startNs, durationNs } of sorted) {
    const stop = startNs + durationNs;
    if (stop > end) {
      busy += stop - Math.max(startNs, end);
      end = stop;
    }
  }
  return busy / 1e6;
}

/**
 * Tells if the IOSurface accesses of a command buffer are all on the surfaces of the canvas. The
 * compositor of Chrome reads the tiles of the page and writes the surface of the window, which have
 * other sizes. WebGL draws into the canvas surfaces, and a WebGL read of the canvas reads one.
 *
 * @param intervals The intervals of one command buffer.
 * @param canvas The width and the height of the drawing buffer of the canvas, in device pixels.
 * @returns True if each surface that the buffer reads or writes has the size of the canvas.
 */
function onlyCanvasSurfaces(
  intervals: readonly GpuInterval[],
  canvas: readonly [number, number],
): boolean {
  const size = `${canvas[0]}×${canvas[1]}`;
  return intervals.every((interval) =>
    [...interval.surfaces.matchAll(/\((\d+×\d+)/g)].every((m) => m[1] === size),
  );
}

/**
 * Gives the IOSurfaces that one encoder writes, from its IOSurface accesses, such as
 * `Read Surface: 9(2880×1800:ARGB) -> Write Surface: 4(1440×900:ARGB)`.
 *
 * @param surfaces The IOSurface accesses of the encoder.
 * @returns The id and the size of each written surface, for example `4` and `1440×900`.
 */
function writtenSurfaces(surfaces: string): { readonly id: string; readonly size: string }[] {
  const writes = surfaces.split('Write Surface:')[1] ?? '';
  return [...writes.matchAll(/(\d+)\((\d+×\d+)/g)].map((m) => ({
    id: m[1] ?? '',
    size: m[2] ?? '',
  }));
}

/**
 * Tells if a command buffer holds the clear of the drawing buffer: an encoder with the label
 * `(Clear)`.
 *
 * @param intervals The intervals of one command buffer.
 * @returns True if an encoder of the buffer has the label.
 */
function holdsClear(intervals: readonly GpuInterval[]): boolean {
  return intervals.some((interval) => interval.label.includes('(Clear)'));
}

/**
 * Gives the GPU intervals of each WebGL frame of the GPU process of Chrome. The process also runs
 * the compositor of Chrome. The canvas surfaces are the surfaces with the size of the drawing
 * buffer that a command buffer with the clear writes. A command buffer writes the canvas when one
 * of its encoders writes a canvas surface and touches no other surface. The function counts a
 * command buffer that holds the clear or writes the canvas, also when the trace puts a surface of
 * the display into another encoder of it. It also counts a command buffer whose surfaces all have
 * the size of the drawing buffer, such as a buffer with no surface. It drops each other command
 * buffer as work of the compositor, which reads the tiles of the page and writes the surface of
 * the window.
 *
 * A WebGL frame starts at the command buffer with the clear. It holds each counted command buffer
 * until the next start. Each frame writes a canvas surface in two command buffers: the clear, then
 * the final pass. Sometimes the trace gives no label to the clear. Thus a frame also starts at a
 * command buffer that writes the canvas when the frame already holds its final pass.
 *
 * The Metal System Trace of Xcode has these known faults. `gpu-trace.fixture.json` holds a real
 * case of each one, and {@link checkFrames} finds a filter that they break.
 *
 * - The read and the write lists of an encoder mix. The trace lists the canvas among the writes of
 *   some encoders of the compositor that read the tiles of the page, so only an encoder with no
 *   other surface writes the canvas.
 * - Some clears have no label: 0.5% to 2% of the first command buffers have no encoder with the
 *   label `(Clear)`.
 * - A WebGL command buffer can hold surfaces of the display, such as a blit that writes a surface
 *   of 3456 × 2168 beside a read of the canvas.
 * - Some encoders have only the label `GPU Execution`, with no command buffer label.
 * - A canvas surface counts only when a clear with a label writes it. Chrome turns through about
 *   five canvas surfaces, so a short cut of a trace needs a clear with a label for each one.
 *
 * @param intervals The GPU intervals of the trace.
 * @param process The text that the process column of the GPU process holds, such as its pid.
 * @param canvas The width and the height of the drawing buffer of the canvas, in device pixels.
 * @returns The intervals of each complete frame, in the order of their start.
 */
export function webglFrames(
  intervals: readonly GpuInterval[],
  process: string,
  canvas: readonly [number, number],
): GpuInterval[][] {
  const byBuffer = new Map<string, GpuInterval[]>();
  for (const interval of intervals) {
    if (!interval.process.includes(process)) {
      continue;
    }
    const list = byBuffer.get(interval.commandBuffer) ?? [];
    list.push(interval);
    byBuffer.set(interval.commandBuffer, list);
  }

  const size = `${canvas[0]}×${canvas[1]}`;
  const canvasIds = new Set(
    [...byBuffer.values()]
      .filter((list) => holdsClear(list))
      .flatMap((list) => list.flatMap((interval) => writtenSurfaces(interval.surfaces)))
      .filter((surface) => surface.size === size)
      .map((surface) => surface.id),
  );
  // The trace sometimes lists the canvas among the writes of a compositor encoder that reads the
  // tiles of the page. Thus only an encoder with no other surface writes the canvas.
  const writesCanvas = (list: readonly GpuInterval[]): boolean =>
    list.some(
      (interval) =>
        writtenSurfaces(interval.surfaces).some((surface) => canvasIds.has(surface.id)) &&
        [...interval.surfaces.matchAll(/(\d+)\(/g)].every((m) => canvasIds.has(m[1] ?? '')),
    );
  const start = (list: readonly GpuInterval[]): number =>
    Math.min(...list.map((interval) => interval.startNs));
  const webgl = [...byBuffer.values()]
    .filter((list) => holdsClear(list) || writesCanvas(list) || onlyCanvasSurfaces(list, canvas))
    .toSorted((a, b) => start(a) - start(b));

  const frames: GpuInterval[][] = [];
  // The work before the first clear belongs to a frame that started before the trace.
  let frame: GpuInterval[] | null = null;
  let finalPass = false;
  for (const list of webgl) {
    const writes = writesCanvas(list);
    if (holdsClear(list) || (finalPass && writes)) {
      if (frame) {
        frames.push(frame);
      }
      frame = [];
      finalPass = false;
    } else if (frame && writes) {
      finalPass = true;
    }
    frame?.push(...list);
  }
  // The work after the last start can go on after the trace, so it does not count.
  return frames;
}

/** The time and the count of command buffers that a filter dropped. */
export interface DroppedBuffers {
  /** The count of the command buffers. */
  readonly buffers: number;
  /** The busy time of the command buffers, in milliseconds ({@link busyMs} of each buffer). */
  readonly ms: number;
}

/**
 * The self-check of the WebGL frames of a filter. It uses only the sizes of the surfaces, so it
 * does not depend on the labels of the encoders, as the filter does.
 *
 * The check finds the command buffers that a filter drops and the frames that it merges. It
 * cannot find a command buffer that a filter adds to a frame by mistake, such as a buffer of the
 * compositor of Chrome: the frame count and the canvas writes of each frame stay the same. On one
 * trace, a filter that adds each compositor buffer to the frame of its start passes the check with
 * 640 / 640 frames, and it raises the p50 from 4.447 ms to 4.503 ms.
 */
export interface FrameCheck {
  /** The count of the frames of the filter. */
  readonly frames: number;
  /** The time from the start of the first frame to the end of the last frame, in seconds. */
  readonly spanSec: number;
  /**
   * The command buffers of the process that no frame holds, with a start from the start of the
   * first frame to the start of the last frame, and with only
   * surfaces of the size of the drawing buffer or no surface. Such a buffer is WebGL work, such as
   * the first command buffer of a frame, which the filter of `e584e16f` dropped.
   */
  readonly droppedCanvas: DroppedBuffers;
  /**
   * The other command buffers of the process in the same time that no frame holds. Each one
   * touches a surface of another size, as the compositor of Chrome does.
   */
  readonly droppedOther: DroppedBuffers;
  /**
   * The count of the frames with more than two command buffers that write the canvas. Each frame
   * writes the canvas in two command buffers, so such a frame holds two frames, as the filter of
   * `332d09ba` gave at a clear with no label.
   */
  readonly merged: number;
  /**
   * The count of the command buffers of the process that write the canvas in the whole trace.
   * Each frame writes the canvas in two of them, so this count does not depend on the filter.
   */
  readonly canvasWrites: number;
  /**
   * The canvas writes of the partial frames at the two ends of the trace, from 0 to 3. The clear
   * and the final pass of a frame write the same canvas surface, and two frames in a row write
   * different surfaces. Thus a first write with no surface of the second write is the final pass
   * of a frame that started before the trace. The last frame has no next start, so the filter
   * does not count it: its clear, and its final pass when that pass writes the surface of the
   * clear.
   */
  readonly endWrites: number;
}

/**
 * Gives the canvas surfaces that a command buffer writes: the surfaces of the size of the drawing
 * buffer that each encoder writes when it touches no surface of another size.
 *
 * @param intervals The intervals of one command buffer.
 * @param size The size of the drawing buffer, such as `2880×1800`.
 * @returns The ids of the surfaces, or an empty set when the buffer does not write the canvas.
 */
function canvasWriteIds(intervals: readonly GpuInterval[], size: string): Set<string> {
  const ids = new Set<string>();
  for (const interval of intervals) {
    if ([...interval.surfaces.matchAll(/\((\d+×\d+)/g)].every((m) => m[1] === size)) {
      for (const surface of writtenSurfaces(interval.surfaces)) {
        if (surface.size === size) {
          ids.add(surface.id);
        }
      }
    }
  }
  return ids;
}

/**
 * Tells if a command buffer writes the canvas ({@link canvasWriteIds}).
 *
 * @param intervals The intervals of one command buffer.
 * @param size The size of the drawing buffer, such as `2880×1800`.
 * @returns True if the buffer writes the canvas.
 */
function writesCanvasSize(intervals: readonly GpuInterval[], size: string): boolean {
  return canvasWriteIds(intervals, size).size > 0;
}

/**
 * Counts the canvas writes of the partial frames at the two ends of a trace
 * ({@link FrameCheck.endWrites}).
 *
 * @param writes The canvas surfaces of each command buffer that writes the canvas, in the order
 *   of their start.
 * @returns The count, from 0 to 3.
 */
function endWriteCount(writes: readonly ReadonlySet<string>[]): number {
  const shared = (a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined) =>
    a !== undefined && b !== undefined && [...a].some((id) => b.has(id));
  const head = writes.length > 1 && !shared(writes[0], writes[1]) ? 1 : 0;
  if (writes.length <= head) {
    return head;
  }
  const pair = writes.length - head >= 2 && shared(writes.at(-2), writes.at(-1));
  return head + (pair ? 2 : 1);
}

/**
 * Checks the WebGL frames of a filter against the command buffers of the trace. The check counts
 * the command buffers that the filter dropped in the span of its frames, the frames that hold
 * more than two writes of the canvas, and the canvas writes of the whole trace.
 *
 * @param intervals The GPU intervals of the trace.
 * @param process The text that the process column of the GPU process holds, such as its pid.
 * @param canvas The width and the height of the drawing buffer of the canvas, in device pixels.
 * @param frames The intervals of each frame of the filter, such as {@link webglFrames}.
 * @returns The check.
 */
export function checkFrames(
  intervals: readonly GpuInterval[],
  process: string,
  canvas: readonly [number, number],
  frames: readonly (readonly GpuInterval[])[],
): FrameCheck {
  const size = `${canvas[0]}×${canvas[1]}`;
  const byBuffer = new Map<string, GpuInterval[]>();
  for (const interval of intervals) {
    if (interval.process.includes(process)) {
      const list = byBuffer.get(interval.commandBuffer) ?? [];
      list.push(interval);
      byBuffer.set(interval.commandBuffer, list);
    }
  }

  let start = Infinity;
  let end = -Infinity;
  const counted = new Set<string>();
  for (const frame of frames) {
    for (const interval of frame) {
      counted.add(interval.commandBuffer);
      start = Math.min(start, interval.startNs);
    }
  }
  // The first buffer of the next frame can start before the last pass of the last frame, so
  // the dropped buffers end at the start of the last frame.
  let lastStart = Infinity;
  for (const interval of frames.at(-1) ?? []) {
    end = Math.max(end, interval.startNs + interval.durationNs);
    lastStart = Math.min(lastStart, interval.startNs);
  }

  const canvasDropped: GpuInterval[][] = [];
  const otherDropped: GpuInterval[][] = [];
  // The canvas writes come from the whole trace of the process, so that a filter that loses
  // frames, also each frame, cannot lower the count.
  const writes: { readonly start: number; readonly ids: Set<string> }[] = [];
  for (const [buffer, list] of byBuffer) {
    const first = Math.min(...list.map((interval) => interval.startNs));
    const ids = canvasWriteIds(list, size);
    if (ids.size > 0) {
      writes.push({ start: first, ids });
    }
    if (first < start || first >= lastStart) {
      continue;
    }
    if (counted.has(buffer)) {
      continue;
    }
    (onlyCanvasSurfaces(list, canvas) ? canvasDropped : otherDropped).push(list);
  }
  const dropped = (lists: readonly GpuInterval[][]): DroppedBuffers => ({
    buffers: lists.length,
    ms: lists.reduce((sum, list) => sum + busyMs(list), 0),
  });

  const merged = frames.filter((frame) => {
    const buffers = new Map<string, GpuInterval[]>();
    for (const interval of frame) {
      const list = buffers.get(interval.commandBuffer) ?? [];
      list.push(interval);
      buffers.set(interval.commandBuffer, list);
    }
    return [...buffers.values()].filter((list) => writesCanvasSize(list, size)).length > 2;
  }).length;

  return {
    frames: frames.length,
    spanSec: end > start ? (end - start) / 1e9 : 0,
    droppedCanvas: dropped(canvasDropped),
    droppedOther: dropped(otherDropped),
    merged,
    canvasWrites: writes.length,
    endWrites: endWriteCount(
      writes.toSorted((a, b) => a.start - b.start).map((write) => write.ids),
    ),
  };
}

/**
 * Calculates the time of dropped command buffers for each frame. The check counts the dropped
 * buffers in each frame but the last.
 *
 * @param check The check.
 * @param dropped The dropped buffers of the check.
 * @returns The busy time for each frame, in milliseconds, or 0 with fewer than two frames.
 */
export function droppedPerFrame(check: FrameCheck, dropped: DroppedBuffers): number {
  return check.frames > 1 ? dropped.ms / (check.frames - 1) : 0;
}

/**
 * Calculates the count of complete frames that the canvas writes of the trace give: two writes in
 * each frame, after the writes of the partial frames at the ends. It does not use the frames of
 * the filter.
 *
 * @param check The check.
 * @returns The expected count of frames.
 */
export function canvasWriteFrames(check: FrameCheck): number {
  return Math.max(0, (check.canvasWrites - check.endWrites) / 2);
}

/** The largest time of dropped canvas buffers for each frame, in milliseconds (design 9.7). */
const DROPPED_CANVAS_LIMIT_MS = 0.1;

/** The largest difference of the frame count from the expected count, as a part of it. */
const FRAME_COUNT_TOLERANCE = 0.02;

/**
 * Gives the faults of a self-check of the WebGL frames (design 9.7). A fault makes the GPU row
 * of `pnpm frame` fail.
 *
 * @param check The check of {@link checkFrames}.
 * @param expected The expected count of frames, such as {@link canvasWriteFrames}. `null` skips
 *   the count.
 * @returns A text for each fault, or an empty list.
 */
export function frameCheckFaults(check: FrameCheck, expected: number | null): string[] {
  const faults: string[] = [];
  if (check.frames === 0) {
    faults.push('The filter gave no WebGL frames.');
  }
  const perFrame = droppedPerFrame(check, check.droppedCanvas);
  if (perFrame > DROPPED_CANVAS_LIMIT_MS) {
    faults.push(
      `The filter dropped ${perFrame.toFixed(2)} ms of canvas buffers in each frame, ` +
        `above ${DROPPED_CANVAS_LIMIT_MS} ms.`,
    );
  }
  if (expected !== null && Math.abs(check.frames - expected) > FRAME_COUNT_TOLERANCE * expected) {
    const off = expected > 0 ? `${((check.frames / expected - 1) * 100).toFixed(1)}%` : 'no count';
    faults.push(
      `The filter gave ${check.frames} frames against ${Math.round(expected)} expected (${off}), ` +
        `more than ${FRAME_COUNT_TOLERANCE * 100}% off.`,
    );
  }
  if (check.merged > 0) {
    faults.push(`${check.merged} frames hold more than two writes of the canvas.`);
  }
  return faults;
}

/**
 * Calculates the span of the GPU intervals of a trace: the time from the start of the first
 * interval to the end of the last one, of all processes.
 *
 * @param intervals The GPU intervals of the trace.
 * @returns The span, in milliseconds, or 0 with no intervals.
 */
export function gpuSpanMs(intervals: readonly GpuInterval[]): number {
  let start = Infinity;
  let end = -Infinity;
  for (const interval of intervals) {
    start = Math.min(start, interval.startNs);
    end = Math.max(end, interval.startNs + interval.durationNs);
  }
  return end > start ? (end - start) / 1e6 : 0;
}

/**
 * Calculates the part of the time of a trace in which other processes used the GPU. The work of
 * another process, such as a page of another browser, shares the GPU with the measured frames and
 * makes them slower.
 *
 * @param intervals The GPU intervals of the trace.
 * @param process The text that the process column of the measured process holds.
 * @returns The busy time of the other processes over the span of the intervals
 *   ({@link gpuSpanMs}), from 0 to 1, or 0 with no intervals.
 */
export function otherGpuShare(intervals: readonly GpuInterval[], process: string): number {
  const span = gpuSpanMs(intervals);
  const others = intervals.filter((interval) => !interval.process.includes(process));
  return span > 0 ? busyMs(others) / span : 0;
}
