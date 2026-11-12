/**
 * Measures the reach of the arms of a harp player to the pluck point of each string (design 4.6,
 * 5.3), for `pnpm hold-reach <species> --instrument harp`: the spare reach of each arm to each
 * string, the strings that each hand reaches, and the strings that each hand plays in the demos.
 */
import { Quaternion, Vector3 } from 'three';

import { HARP, harpString } from '../src/models/instruments/harp.ts';
import { placePoint } from '../src/models/instruments/hold.ts';
import { buildPlayer } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import { SPECIES, instrumentScale } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { toVec3 } from '../src/models/tuples.ts';
import { splitHands } from '../src/pose/hand-notes.ts';
import { handsRig } from '../src/pose/hands.ts';
import { poseShoulder } from '../src/pose/ik.ts';
import { buildScore } from '../src/score/score.ts';
import type { DemoFile } from './patch-demos.ts';

/** The spare reach of one arm to the pluck point of one string. */
interface StringSpare {
  /** The MIDI key of the natural note of the string. */
  readonly key: number;
  /** The arm less the distance from the posed shoulder joint to the palm, in meters. */
  readonly spare: number;
}

/** The strings that one hand plays in the demos. */
interface PlayedRange {
  /** The number of chords of the hand. */
  readonly chords: number;
  /** The lowest and the highest key of the hand, or `null` with no chord. */
  readonly low: number | null;
  readonly high: number | null;
  /** The number of chords with a key out of the reach of the hand. */
  readonly missed: number;
}

/** The chords of one hand in the demos while the report sums them. */
interface HandKeys {
  /** The number of chords. */
  chords: number;
  /** The lowest and the highest key. */
  low: number;
  high: number;
  /** The keys of each chord. */
  readonly keys: number[][];
}

/** The reach of one hand of a harp player. */
interface HandReachRow {
  readonly side: 'L' | 'R';
  /** The arm from the shoulder joint over the elbow and the wrist to the middle of the palm. */
  readonly arm: number;
  /** The spare reach to each string, from the bass string. */
  readonly strings: readonly StringSpare[];
  /** The strings that the hand plays in the demos. */
  readonly played: PlayedRange;
}

/** The MIDI keys of the natural notes in an octave from C. */
const NATURALS = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * Gives the MIDI key of the natural note of each string, from the bass string.
 *
 * @returns One key for each string.
 */
function stringKeys(): number[] {
  return Array.from(
    { length: HARP.strings },
    (_, i) => HARP.keys[0] + 12 * Math.floor(i / 7) + (NATURALS[i % 7] ?? 0),
  );
}

/**
 * Writes a MIDI key as a note name, such as `C4`.
 *
 * @param key The key.
 * @returns The name.
 */
export function keyName(key: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[key % 12] ?? '?'}${Math.floor(key / 12) - 1}`;
}

/**
 * Measures the reach of each arm of a harp player to each string in the playing pose: the arm
 * less the distance from the shoulder joint to the palm at the pluck point, with the lean of the
 * hold. The hand split of the hold gives the strings of each hand in the demos.
 *
 * @param species The species.
 * @param demos The demos. Only the harp seats count.
 * @returns One row for each hand.
 */
export function harpReach(species: SpeciesId, demos: readonly DemoFile[]): HandReachRow[] {
  const model = buildPlayer(species, 'harp');
  const scale = instrumentScale(SPECIES[species], 'harp');
  const rig = handsRig(model, 'harp', scale);
  const { hold } = rig;
  const spine = new Vector3(...(model.skeleton.positions[boneIndex('spine')] ?? [0, 0, 0]));
  const lean = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -hold.lean);
  const chest = {
    rotation: lean,
    position: new Vector3(...rig.chestBind).sub(spine).applyQuaternion(lean).add(spine),
  };

  const sides: ('L' | 'R')[] = ['L', 'R'];
  const hands = sides.map((): HandKeys => ({
    chords: 0,
    low: Infinity,
    high: -Infinity,
    keys: [],
  }));
  for (const demo of demos) {
    const result = buildScore(demo.bytes, 'auto');
    if (!result.ok) {
      continue;
    }
    const { score } = result;
    for (const [seatIndex, seat] of score.seats.entries()) {
      if (seat.section !== 'harp') {
        continue;
      }
      const notes = score.notes.filter((n) => n.seatIndex === seatIndex && n.player === 0);
      const parts = splitHands(
        notes,
        notes.map(() => 0.5),
        hold.reach,
        hold.apart,
      );
      for (const [k, part] of parts.entries()) {
        const hand = hands[k];
        for (const chord of part) {
          if (hand && chord.keys.length > 0) {
            hand.chords += 1;
            hand.low = Math.min(hand.low, chord.low);
            hand.high = Math.max(hand.high, chord.high);
            hand.keys.push([...chord.keys]);
          }
        }
      }
    }
  }

  return sides.map((side, k): HandReachRow => {
    const arm = side === 'L' ? rig.left.arm : rig.right.arm;
    const shoulder = poseShoulder(arm, chest, rig.chestBind, new Quaternion()).position;
    const offset = side === 'L' ? hold.palmL : hold.palmR;
    const joint = (bone: number): Vector3 =>
      new Vector3(...(model.skeleton.positions[bone] ?? [0, 0, 0]));
    const palm = new Vector3(...(side === 'L' ? model.body.palmL : model.body.palmR));
    const length =
      joint(arm.bones.upperArm).distanceTo(joint(arm.bones.forearm)) +
      joint(arm.bones.forearm).distanceTo(joint(arm.bones.hand)) +
      joint(arm.bones.hand).distanceTo(palm);
    const strings = stringKeys().map((key): StringSpare => {
      const at = new Vector3(...hold.keyPoint(key, scale)).addScaledVector(
        new Vector3(...offset),
        rig.headHeight,
      );
      const point = new Vector3(...placePoint(rig.pieces, { bone: 'instrument', at: toVec3(at) }));
      return { key, spare: length - point.distanceTo(shoulder) };
    });
    const spareOf = (key: number): number => strings[harpString(key)]?.spare ?? -1;
    const hand = hands[k];
    const missed = (hand?.keys ?? []).filter((keys) => keys.some((key) => spareOf(key) < 0));
    return {
      side,
      arm: length,
      strings,
      played: {
        chords: hand?.chords ?? 0,
        low: hand && hand.chords > 0 ? hand.low : null,
        high: hand && hand.chords > 0 ? hand.high : null,
        missed: missed.length,
      },
    };
  });
}

/**
 * Writes the report of {@link harpReach}: for each hand, the arm, the strings in reach, the
 * strings of the demos, and the spare reach at the lowest, the middle, and the highest string.
 *
 * @param species The species.
 * @param rows The rows of the hands.
 * @returns The lines.
 */
export function harpReachLines(species: SpeciesId, rows: readonly HandReachRow[]): string[] {
  const cm = (value: number): string => `${(value * 100).toFixed(1)} cm`;
  const lines = [
    `${species} at the harp, spare reach of each arm to the pluck point of each string:`,
  ];
  for (const row of rows) {
    const reached = row.strings.filter((s) => s.spare >= 0);
    const range =
      reached.length > 0
        ? `${keyName(reached[0]?.key ?? 0)} to ${keyName(reached.at(-1)?.key ?? 0)}`
        : 'none';
    const { played } = row;
    const demo =
      played.low !== null && played.high !== null
        ? `${keyName(played.low)} to ${keyName(played.high)} in ${played.chords} chords, ${played.missed} with a string out of reach`
        : 'no chord';
    const worst = row.strings.reduce((a, b) => (b.spare < a.spare ? b : a));
    lines.push(
      `  ${row.side}: arm ${cm(row.arm)}; reaches ${range} (${reached.length} of ${row.strings.length} strings); worst ${keyName(worst.key)} ${cm(worst.spare)}`,
      `     demos: ${demo}`,
      `     spare: ${row.strings
        .filter((_, i) => i % 7 === 0 || i === row.strings.length - 1)
        .map((s) => `${keyName(s.key)} ${cm(s.spare)}`)
        .join(', ')}`,
    );
  }
  return lines;
}
