import { describe, expect, it } from 'vitest';

import { INSTRUMENT_COLORS } from '../colors.ts';
import type { Rgb } from '../mesh.ts';
import { PIANO, PIANO_INSIDE, buildPiano, buildPianoBench, pianoKeyPosition } from './piano.ts';

describe('pianoKeyPosition', () => {
  const width = PIANO.keyboardWidth / 52;

  it('puts the white keys side by side from A0 at the left to C8 at the right', () => {
    expect(pianoKeyPosition(21)[0]).toBeCloseTo(-PIANO.keyboardWidth / 2 + width / 2, 9);
    expect(pianoKeyPosition(108)[0]).toBeCloseTo(PIANO.keyboardWidth / 2 - width / 2, 9);
    // A0, B0, and 3 octaves of 7 white keys are below middle C, so its index is 23 of 52.
    expect(pianoKeyPosition(60)[0]).toBeCloseTo(-PIANO.keyboardWidth / 2 + 23.5 * width, 9);
    expect(pianoKeyPosition(62)[0] - pianoKeyPosition(60)[0]).toBeCloseTo(width, 9);
  });

  it('puts a black key between its two white keys, higher and further back', () => {
    const cSharp = pianoKeyPosition(61);
    const c = pianoKeyPosition(60);
    const d = pianoKeyPosition(62);
    expect(cSharp[0]).toBeCloseTo((c[0] + d[0]) / 2, 9);
    expect(cSharp[1]).toBeGreaterThan(c[1]);
    expect(cSharp[2]).toBeLessThan(c[2]);
  });

  it('plays the nearest key for a key outside the piano', () => {
    expect(pianoKeyPosition(10)).toEqual(pianoKeyPosition(21));
    expect(pianoKeyPosition(120)).toEqual(pianoKeyPosition(108));
  });
});

describe('buildPiano', () => {
  it('gives the case the black lacquer, and shows sheet music', () => {
    const parts = buildPiano().pieces[0]?.parts ?? [];
    const of = (color: Rgb) => parts.filter((part) => part.color === color);
    const lacquered = of(INSTRUMENT_COLORS.pianoCase).filter((part) => part.finish === 'lacquer');
    // The rim, the lid, the prop, the key bed, the cheeks, the fallboard, the desk, and the legs.
    expect(lacquered.length).toBeGreaterThanOrEqual(10);
    expect(of(INSTRUMENT_COLORS.sheet)).toHaveLength(1);
  });

  it('shows a dark well inside the rim, with the soundboard, the plate, and the strings', () => {
    const parts = buildPiano().pieces[0]?.parts ?? [];
    const heights = (color: Rgb): number[] =>
      parts
        .filter((part) => part.color === color)
        .flatMap((part) => part.corners.filter((_, i) => i % 3 === 1));
    const board = heights(INSTRUMENT_COLORS.soundboard);
    const plate = heights(INSTRUMENT_COLORS.pianoPlate);
    const strings = heights(INSTRUMENT_COLORS.pianoStrings);

    // A gold plate on the top of the rim reads as a flat gold tray. Each part lies in the well,
    // below the top of the rim.
    expect(board.length * plate.length * strings.length).toBeGreaterThan(0);
    expect(Math.max(...board)).toBeLessThan(PIANO.caseTop - 0.1);
    expect(Math.min(...plate)).toBeGreaterThan(Math.max(...board));
    expect(Math.min(...strings)).toBeGreaterThan(Math.max(...plate));
    expect(Math.max(...strings)).toBeLessThan(PIANO.caseTop - 0.03);
    expect(parts.filter((part) => part.color === INSTRUMENT_COLORS.pianoStrings)).toHaveLength(
      PIANO_INSIDE.strings,
    );
  });
});

describe('buildPianoBench', () => {
  it('has at most 120 triangles (design 4.5)', () => {
    const bench = buildPianoBench(0.45);
    const triangles = bench.positions.length / 9;
    expect(triangles).toBeLessThanOrEqual(120);
    let top = -Infinity;
    for (let i = 1; i < bench.positions.length; i += 3) {
      top = Math.max(top, bench.positions[i] ?? -Infinity);
    }
    expect(top).toBeCloseTo(0.45, 6);
  });

  it('puts a seat of another height at that height', () => {
    const bench = buildPianoBench(0.38);
    const ys = [...bench.positions].filter((_, i) => i % 3 === 1);

    expect(Math.max(...ys)).toBeCloseTo(0.38, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
  });
});
