import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import type { Rgb } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { box, cylinder, icosphere } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize } from './piece.ts';
import type { InstrumentModel } from './types.ts';

/**
 * The sizes of the concert harp, in meters (design 4.6). In the harp axes, the base stands on the
 * floor at the origin, and the player sits at +z. The column stands at the far side (-z). The
 * soundbox rises from the base to the player, and the neck joins the top of the column to the top
 * of the soundbox. The strings stand vertical in the plane x = 0, between the soundbox and the
 * neck.
 */
export const HARP = {
  height: 1.4,
  /** The base on the floor: a bar along z at the height y, with its width on x and its height. */
  base: { z: [-0.42, 0.08], y: 0.04, width: 0.26, height: 0.08 },
  /** The bottom and the top of the column, as (y, z). */
  column: [
    [0.08, -0.38],
    [1.3, -0.38],
  ],
  /** The bottom and the top of the soundbox axis, as (y, z). */
  soundbox: [
    [0.08, -0.22],
    [0.98, 0.3],
  ],
  /** The neck from the top of the column to the top of the soundbox, as (y, z). */
  neck: [
    [1.3, -0.38],
    [1.25, -0.18],
    [1.12, 0.04],
    [1.0, 0.28],
  ],
  /** The number of strings that the model shows. */
  strings: 24,
  /** The MIDI keys of the lowest and the highest string of a concert harp: C1 and G7. */
  keys: [24, 103],
} as const;

/**
 * The place of the harp at the player (design 4.6). As a harpist sits, the harp leans back, and
 * the top of its soundbox rests on the right shoulder, near the neck of the player
 * (`docs/reference/harp-technique.md`, section 2). The base stands in front of the player, between
 * the knees in the front view, on a box ({@link HARP_STAND}). The deer is the only harp player, and
 * its body sets the place: the top of the soundbox axis is at (0.12, 0.78, -0.14) m in the model
 * axes, in front of the right shoulder joint, and the soundbox touches the front of the shoulder.
 * `pnpm hold-fit --set` and the other probes change it as `harpPlace`.
 */
export const HARP_PLACE = {
  /** The move of the base to the right of the floor point under the seat, in head heights. */
  side: -0.017,
  /** The move of the base up, in meters, at the scale 1 of the harp. */
  lift: 0.404,
  /** The distance of the base in front of the floor point, in meters, at the scale 1. */
  front: 0.684,
  /**
   * The tilt of the harp back to the player. No source gives the angle. At 12°, the neck keeps
   * 6.6 cm from the muzzle of the deer, near the 6.9 cm of an upright harp. At 15°, it keeps
   * 5.0 cm, and at 20°, 2.4 cm.
   */
  tilt: 12 * MathUtils.DEG2RAD,
  /**
   * The turn of the harp around the vertical, seen from above, so that the column goes to the
   * front left: the harp is diagonal to the player. The left hand plays the bass strings at the
   * front left, and the right hand the treble strings near the right shoulder. At 15°, the left
   * paw missed the far bass strings by up to 2.2 cm. At 45°, the neck crossed in front of the
   * muzzle, 4.0 cm from it.
   */
  turn: 25 * MathUtils.DEG2RAD,
};

/**
 * The box under a raised harp, in meters at the scale 1 (design 4.6). A short lever harp stands on
 * a box or a stool, so that it comes up to the right shoulder of the player
 * (`docs/reference/harp-technique.md`, section 1).
 */
const HARP_STAND = {
  /** The least lift of the base that gets a box (`HARP_PLACE.lift`). A lower harp stands on the floor. */
  minLift: 0.05,
  /** The width of the box, a little more than the width of the base. */
  width: 0.3,
};

/** The places of the bass string and of the treble string along z. */
const STRING_ENDS = [-0.17, 0.24] as const;

/** The diatonic step of each pitch class: a sharp plays on the string of the natural below it. */
const DIATONIC_STEPS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const;

/** The number of strings of a concert harp: C1 to G7, seven strings in each octave. */
const CONCERT_STRINGS = 47;

/**
 * Calculates the height of the neck above a point of the strings plane.
 *
 * @param z The position along z.
 * @returns The height of the bottom of the neck.
 */
function neckHeight(z: number): number {
  const points = HARP.neck;
  for (let i = 0; i + 1 < points.length; i++) {
    const [y0, z0] = points[i] ?? [0, 0];
    const [y1, z1] = points[i + 1] ?? [0, 0];
    if (z <= z1 || i + 2 === points.length) {
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0) - 0.035;
    }
  }
  return HARP.height;
}

/**
 * Calculates the height of the soundboard below a point of the strings plane.
 *
 * @param z The position along z.
 * @returns The height of the soundboard, where the string starts.
 */
function boardHeight(z: number): number {
  const [[y0, z0], [y1, z1]] = HARP.soundbox;
  // The soundboard lies 0.05 m in front of the axis, toward the neck.
  return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0) + 0.05;
}

/**
 * Calculates the middle of one string of the model, in the harp axes.
 *
 * @param index The string, from 0 (the bass string) to `HARP.strings - 1`.
 * @returns The point halfway between the soundboard and the neck.
 */
function stringMiddle(index: number): Vec3 {
  const [first, last] = STRING_ENDS;
  const z = first + ((last - first) * index) / (HARP.strings - 1);
  return [0, (boardHeight(z) + neckHeight(z)) / 2, z];
}

/**
 * Finds the string of the model that shows a MIDI key (design 4.6). A concert harp has a string
 * for each natural note from C1 to G7, and a pedal raises a string by a semitone. Thus a sharp
 * plays on the string of the natural below it. The 24 strings of the model show the 47 strings
 * evenly.
 *
 * @param key The MIDI key. A key outside the harp plays the nearest string.
 * @returns The index of the string, from 0 (the bass string) to `HARP.strings - 1`.
 */
export function harpString(key: number): number {
  const k = Math.round(key);
  const step = (n: number): number => Math.floor(n / 12) * 7 + (DIATONIC_STEPS[n % 12] ?? 0);
  const concert = Math.min(Math.max(step(k) - step(HARP.keys[0]), 0), CONCERT_STRINGS - 1);
  return Math.round((concert * (HARP.strings - 1)) / (CONCERT_STRINGS - 1));
}

/**
 * Calculates the place on the strings where a hand plucks a MIDI key, in the harp axes.
 *
 * @param key The MIDI key. A key outside the harp plays the nearest string.
 * @param scale The scale of the harp of the species (`SpeciesParams.harpScale`): the harp
 *   shrinks toward its base on the floor.
 * @returns The middle of the string of the key.
 */
export function harpStringPosition(key: number, scale = 1): Vec3 {
  const [x, y, z] = stringMiddle(harpString(key));
  return [x * scale, y * scale, z * scale];
}

/**
 * Adds the box under a raised harp (design 4.6), in the axes of the harp before its scale. The box
 * stands level on the floor, and the harp leans back on it (`HARP_PLACE.tilt`), so the box top
 * touches the lowest edge of the base, the edge at the player.
 *
 * @param piece The harp.
 * @param color The color of the frame.
 */
function addStand(piece: PieceBuilder, color: Rgb): void {
  const level = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -HARP_PLACE.tilt);
  const tilt = level.clone().invert();
  let low = Infinity;
  let near = -Infinity;
  let far = Infinity;
  const { base } = HARP;
  for (const y of [base.y - base.height / 2, base.y + base.height / 2]) {
    for (const z of base.z) {
      const corner = new Vector3(0, y, z).applyQuaternion(tilt);
      low = Math.min(low, corner.y);
      near = Math.max(near, corner.z);
      far = Math.min(far, corner.z);
    }
  }
  // The floor is at -lift below the origin of the harp axes.
  const height = low + HARP_PLACE.lift;
  const middle = new Vector3(0, (low - HARP_PLACE.lift) / 2, (near + far) / 2).applyQuaternion(
    level,
  );
  piece.add(
    box(HARP_STAND.width, height, near - far),
    color,
    transform(toVec3(middle), toQuat(level)),
  );
}

/**
 * Builds the concert harp (design 4.6). It stands in front of the player and leans back onto the
 * right shoulder, at its place of {@link HARP_PLACE}, on a box when it stands high. Both hands
 * play the strings, the left hand from the
 * left side of the strings and the right hand from the right side. A species with short arms
 * plays a smaller harp (`SpeciesParams.harpScale`), as a child plays a smaller lever harp: the
 * harp, its strings, and its distance in front of the player shrink toward its base on the floor.
 *
 * @param scale The scale of the harp, as a factor of the sizes of {@link HARP}.
 * @returns The model.
 */
export function buildHarp(scale = 1): InstrumentModel {
  const h = HARP;
  const frame = INSTRUMENT_COLORS.harpFrame;
  const piece = new PieceBuilder(scale);
  const scaled = (at: Vec3): Vec3 => [at[0] * scale, at[1] * scale, at[2] * scale];
  const yz = ([y, z]: readonly [number, number]): Vec3 => [0, y, z];

  // The base, the column with its crown, and the neck.
  const { base } = h;
  piece.bar([0, base.y, base.z[0]], [0, base.y, base.z[1]], base.width, base.height, frame);
  if (HARP_PLACE.lift > HARP_STAND.minLift) {
    addStand(piece, frame);
  }
  const [columnBottom, columnTop] = h.column;
  piece.rod(yz(columnBottom), yz(columnTop), 0.03, 6, frame);
  const crown = new Vector3(...yz(columnTop)).add(new Vector3(0, 0.04, 0));
  piece.add(icosphere(0.055), frame, transform(toVec3(crown)));
  for (let i = 0; i + 1 < h.neck.length; i++) {
    piece.bar(yz(h.neck[i] ?? [0, 0]), yz(h.neck[i + 1] ?? [0, 0]), 0.05, 0.07, frame);
  }
  // The soundbox: a square frustum, wide at the base and narrow at the top.
  const [boxBottom, boxTop] = h.soundbox;
  const axis = new Vector3(...yz(boxTop)).sub(new Vector3(...yz(boxBottom)));
  const boxTurn = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    axis.clone().normalize(),
  );
  piece.add(
    cylinder(1, 0.4, axis.length(), 4),
    frame,
    transform(yz(boxBottom), toQuat(boxTurn), [0.18, 1, 0.13]),
  );

  // The strings, from the bass string near the column to the treble string near the player.
  const middles: Vec3[] = [];
  for (let i = 0; i < h.strings; i++) {
    const middle = stringMiddle(i);
    const z = middle[2];
    piece.bar(
      [0, boardHeight(z), z],
      [0, neckHeight(z), z],
      0.004,
      0.004,
      INSTRUMENT_COLORS.harpStrings,
    );
    middles.push(middle);
  }

  const instrument = piece.build(
    'instrument',
    hold(
      'floor',
      [HARP_PLACE.side, 0, 0],
      toQuat(
        new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), HARP_PLACE.turn)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HARP_PLACE.tilt)),
      ),
      scaled([0, HARP_PLACE.lift, -HARP_PLACE.front]),
    ),
  );
  const low = scaled(middles[0] ?? [0, 0, 0]);
  const high = scaled(middles.at(-1) ?? [0, 0, 0]);
  const bassHand = scaled(middles[Math.round(h.strings * 0.35)] ?? [0, 0, 0]);
  const trebleHand = scaled(middles[Math.round(h.strings * 0.7)] ?? [0, 0, 0]);
  return {
    id: 'harp',
    parent: 'root',
    pieces: [instrument],
    grips: {
      palmL: {
        bone: 'instrument',
        at: toVec3(new Vector3(...bassHand).add(new Vector3(-0.03, 0, 0))),
      },
      palmR: {
        bone: 'instrument',
        at: toVec3(new Vector3(...trebleHand).add(new Vector3(0.03, 0, 0))),
      },
      mouth: null,
      chin: null,
    },
    targets: [
      {
        kind: 'strings',
        bone: 'instrument',
        from: low,
        to: high,
        normal: [1, 0, 0],
        keys: h.keys,
      },
    ],
    size: pieceSize(instrument),
  };
}
