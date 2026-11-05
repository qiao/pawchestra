import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS } from '../colors.ts';
import { toQuat } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { MeshBuilder, transform } from '../mesh.ts';
import type { MeshData } from '../mesh.ts';
import { box, cylinder, plate, prism, quad } from '../primitives.ts';
import type { OutlinePoint } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize, placeCorners } from './piece.ts';
import type { InstrumentModel, KeyTurn } from './types.ts';

/**
 * The sizes of the grand piano, in meters, before {@link PIANO_SCALE} (design 4.6). In the piano
 * axes, the origin is on the floor below the middle of the front edge of the keys. The player sits
 * at +z, the case runs to -z, and the keys run along x with the lowest key at -x.
 */
export const PIANO = {
  /** The width of the 52 white keys together. */
  keyboardWidth: 1.24,
  /** The height of the top of the white keys. */
  keyTop: 0.7,
  /** The visible length of a white key and of a black key. */
  whiteKeyLength: 0.15,
  blackKeyLength: 0.09,
  /** The gap between two white keys. The key bed shows through it. */
  whiteKeyGap: 0.001,
  /** The distance of the front of the white keys in front of the key bed under them. */
  keyOverhang: 0.005,
  /** The key dip: the drop of the front of a white key at the key bottom. */
  keyDip: 0.01,
  /**
   * The distance of the balance rail behind the front edge of the white keys. A key turns around
   * the balance rail, at the height of the bottom of the white keys.
   */
  balanceRail: 0.25,
  /** The lowest and the highest key: A0 and C8. */
  keys: [21, 108],
  /** The width of the case, and its length from the front edge of the keys. */
  caseWidth: 1.4,
  caseLength: 2.0,
  /** The bottom and the top of the rim of the case. */
  caseBottom: 0.62,
  caseTop: 0.95,
  /** The angle of the open lid. */
  lidAngle: 35 * MathUtils.DEG2RAD,
} as const;

/**
 * The scale of the whole piano around the origin of the piano axes: 1.16 times a real grand
 * piano, with the keys at 0.81 m, because the polar bear pianist is a large animal on a bench
 * that fits the legs of its mesh. At this scale, the elbows of the polar bear at a shoulder height
 * of 1.15 m stand 4 to 6 cm above the keys, and its forearms are about level with the keys, as a
 * real pianist sits (`docs/reference/piano-technique.md`). At 1.22, the elbows stand 1 to 4 cm
 * above the keys, and the forearms rise 6° to the keys, and at 1.12 they slope 5° down.
 */
export const PIANO_SCALE = 1.16;

/**
 * The distance of the front of the keys in front of the floor point of the body of the pianist,
 * in head heights `H`, before a further 0.05 m (design 4.6). The keys and the pedals stand near
 * the polar bear pianist, so that its short right leg reaches the damper pedal. At 1.0 H, the
 * thigh of the pedal leg pulls the haunch 2.3 cm into the bench, and 0.9 H keeps the haunch on the
 * pad but folds up to 3 more faces at the left shoulder.
 */
export const PIANO_FRONT_H = 1.0;

/**
 * The piano bench (design 4.5): a seat of 0.75 × 0.35 m at the height of a chair seat. Under a
 * studio body, the bench fits the legs and the haunch (`StudioBody.benchDepth`). The parts of the
 * bench of `polar-bear-views.png` are shares of the seat height: the padded seat (`pad`), the
 * apron under it (`apron`), and the brass foot of each leg (`foot`).
 */
export const PIANO_BENCH = {
  width: 0.75,
  depth: 0.35,
  seatHeight: 0.45,
  pad: 0.26,
  apron: 0.1,
  foot: 0.12,
  /** The width of a leg at its top. It tapers to 0.8 of it at the foot. */
  leg: 0.065,
  /** The inset of the apron and the legs from the edges of the seat. */
  inset: 0.015,
} as const;

/** A pedal of the grand piano, from the left of the player. */
type PianoPedal = 'soft' | 'sostenuto' | 'damper';

/**
 * The pedal lyre and the three pedals of the grand piano, in meters before {@link PIANO_SCALE}
 * (design 4.6). The sizes follow real grand pianos.
 * The lyre comes down from the case under the keys to a box just above the floor, and the pedals
 * come out of the front of the box toward the player.
 */
export const PIANO_PEDALS = {
  /** The x of the middle of each pedal: the soft pedal (una corda), the sostenuto, the damper. */
  x: { soft: -0.072, sostenuto: 0, damper: 0.072 },
  /** The z of the front tip of the pedals, behind the front edge of the keys. */
  tipZ: -0.05,
  /** The length of a pedal in front of the box. */
  length: 0.12,
  /** The foot plate at the front of a pedal: its width and its length. */
  plateWidth: 0.045,
  plateLength: 0.07,
  /** The width of the shank of a pedal, between the plate and the box. */
  shankWidth: 0.028,
  /** The height of the top of a pedal at rest, and the thickness of a pedal. */
  top: 0.06,
  thickness: 0.012,
  /** The drop of the damper pedal when the foot presses it down. */
  travel: 0.023,
  /** The box at the bottom of the lyre. */
  box: { width: 0.216, depth: 0.079, bottom: 0.015, top: 0.105 },
  /** The bar at the top of the lyre, under the case. */
  bar: { width: 0.305, height: 0.05, depth: 0.06 },
  /** The x of the middle of each post at the box and at the bar, and the radius of a post. */
  post: { boxX: 0.08, barX: 0.12, radius: 0.017 },
} as const;

/** The pitch classes of the black keys. */
const BLACK_KEYS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

/**
 * The outline of the rim around the point (-0.1, -1.0), counterclockwise from +y: the front edge,
 * the curved right side, the tail, and the straight left side.
 */
const CASE_CENTER: OutlinePoint = [-0.1, -1.0];

/**
 * The inside of the open case (design 4.5, 4.6), as the piano of `mockup.png`: a dark well with
 * the soundboard at its bottom, the iron plate at the keys, and the strings above them. A gold
 * plate on the top of the rim reads as a flat gold tray. The depths are below the top of the rim,
 * in meters.
 */
export const PIANO_INSIDE = {
  /** The scale of the inner outline of the rim wall, around the center of the rim. */
  scale: 0.92,
  /** The depth of the top of the soundboard. */
  soundboardDepth: 0.14,
  /** The depth of the top of the iron plate. */
  plateDepth: 0.08,
  /** The length of the iron plate from the front of the inside toward the tail. */
  plateLength: 0.22,
  /** The depth of the strings. */
  stringDepth: 0.06,
  /** The number of strings. Each one stands for a group of strings of the real piano. */
  strings: 16,
  /** The width of a string. */
  stringWidth: 0.016,
  /** The gap from each end of a string to the rim wall. */
  stringGap: 0.06,
} as const;

const CASE_OUTLINE: readonly OutlinePoint[] = (
  [
    [0.7, -0.17],
    [0.7, -0.55],
    [0.62, -0.85],
    [0.45, -1.1],
    [0.32, -1.35],
    [0.26, -1.6],
    [0.18, -1.82],
    [0.02, -1.98],
    [-0.25, -2.0],
    [-0.5, -1.93],
    [-0.66, -1.75],
    [-0.7, -1.5],
    [-0.7, -0.17],
  ] as const
).map(([x, z]): OutlinePoint => [x - CASE_CENTER[0], z - CASE_CENTER[1]]);

/**
 * Tells whether a MIDI key is a black key.
 *
 * @param key The MIDI key.
 * @returns True for a black key.
 */
function isBlack(key: number): boolean {
  return BLACK_KEYS.has(key % 12);
}

/**
 * Counts the white keys of the piano below a key.
 *
 * @param key The MIDI key.
 * @returns The number of white keys from A0 up to the key, the key excluded.
 */
function whiteKeysBelow(key: number): number {
  let count = 0;
  for (let k = PIANO.keys[0]; k < key; k++) {
    if (!isBlack(k)) {
      count++;
    }
  }
  return count;
}

/**
 * Gives the key of the piano that plays a MIDI key.
 *
 * @param key The MIDI key.
 * @returns The key, or the nearest key of the piano for a key outside it.
 */
function pianoKey(key: number): number {
  return Math.min(Math.max(Math.round(key), PIANO.keys[0]), PIANO.keys[1]);
}

/**
 * Calculates the place on a piano key where a finger plays it, in the piano axes.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point on the top of the key: near the front of a white key, and on the middle of a
 *   black key.
 */
export function pianoKeyPosition(key: number): Vec3 {
  const [x, y, z] = unscaledKeyPosition(key);
  return [x * PIANO_SCALE, y * PIANO_SCALE, z * PIANO_SCALE];
}

/**
 * Calculates the place on a piano key where a finger plays it, in the piano axes before
 * {@link PIANO_SCALE}.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point.
 */
function unscaledKeyPosition(key: number): Vec3 {
  const p = PIANO;
  const k = pianoKey(key);
  const width = p.keyboardWidth / 52;
  const left = -p.keyboardWidth / 2;
  if (isBlack(k)) {
    return [left + whiteKeysBelow(k) * width, p.keyTop + 0.012, -0.1];
  }
  return [left + (whiteKeysBelow(k) + 0.5) * width, p.keyTop, -0.04];
}

/**
 * Makes the wall of the rim around the open inside: the outer faces, the inner faces, and the
 * top edge, between the outline and the outline scaled around the origin.
 *
 * @param outline The outline, counterclockwise when seen from +y, star-shaped around the origin.
 * @param scale The scale of the inner outline.
 * @param bottom The height of the bottom of the wall.
 * @param top The height of the top of the wall.
 * @returns 6 triangles for each point of the outline.
 */
function rimWall(
  outline: readonly OutlinePoint[],
  scale: number,
  bottom: number,
  top: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i] ?? [0, 0];
    const [x1, z1] = outline[(i + 1) % outline.length] ?? [0, 0];
    const [u0, w0, u1, w1] = [x0 * scale, z0 * scale, x1 * scale, z1 * scale];
    out.push(...quad([x0, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x0, top, z0]));
    out.push(...quad([u1, bottom, w1], [u0, bottom, w0], [u0, top, w0], [u1, top, w1]));
    out.push(...quad([u0, top, w0], [x0, top, z0], [x1, top, z1], [u1, top, w1]));
  }
  return out;
}

/**
 * Finds the nearest point of an outline behind a point, on the line along -z.
 *
 * @param outline The outline.
 * @param x The x of the line.
 * @param z The z of the point.
 * @returns The z of the nearest edge of the outline below `z`, or `z` if no edge crosses the line
 *   there.
 */
function outlineBehind(outline: readonly OutlinePoint[], x: number, z: number): number {
  let nearest = -Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i] ?? [0, 0];
    const [x1, z1] = outline[(i + 1) % outline.length] ?? [0, 0];
    if (x0 === x1 || x < Math.min(x0, x1) || x > Math.max(x0, x1)) {
      continue;
    }
    const at = z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    if (at < z) {
      nearest = Math.max(nearest, at);
    }
  }
  return Number.isFinite(nearest) ? nearest : z;
}

/**
 * Adds the inside of the open case ({@link PIANO_INSIDE}): the soundboard at the bottom of the
 * well, the iron plate at the keys, and the strings from the plate to the rim wall at the tail.
 *
 * @param piece The piece of the piano.
 * @param boardY The height of the bottom of the well.
 */
function addInside(piece: PieceBuilder, boardY: number): void {
  const inside = PIANO_INSIDE;
  const [cx, cz] = CASE_CENTER;
  const rimAt = transform([cx, 0, cz]);
  const outline = CASE_OUTLINE.map(([x, z]): OutlinePoint => [x * inside.scale, z * inside.scale]);
  const top = PIANO.caseTop;

  piece.add(prism(outline, boardY, boardY + 0.005), INSTRUMENT_COLORS.soundboard, rimAt);

  // The front of the inside is the straight front edge of the inner outline.
  const xs = outline.map(([x]) => x);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const front = Math.max(...outline.map(([, z]) => z));
  const plateY = top - inside.plateDepth;
  piece.add(
    box(right - left, 0.012, inside.plateLength),
    INSTRUMENT_COLORS.pianoPlate,
    transform([cx + (left + right) / 2, plateY - 0.006, cz + front - inside.plateLength / 2]),
    'metal',
  );

  const stringY = top - inside.stringDepth;
  const start = front - inside.stringGap;
  const step = (right - left - 2 * inside.stringGap) / (inside.strings - 1);
  const half = inside.stringWidth / 2;
  for (let i = 0; i < inside.strings; i++) {
    const x = left + inside.stringGap + i * step;
    const end = outlineBehind(outline, x, start) + inside.stringGap;
    if (end >= start) {
      continue;
    }
    piece.add(
      quad(
        [x - half, stringY, start],
        [x + half, stringY, start],
        [x + half, stringY, end],
        [x - half, stringY, end],
      ),
      INSTRUMENT_COLORS.pianoStrings,
      rimAt,
    );
  }
}

/**
 * Adds the pedal lyre ({@link PIANO_PEDALS}): the bar under the case, two posts that spread a
 * little toward the bar, and the box just above the floor.
 *
 * @param piece The piece of the piano.
 */
function addLyre(piece: PieceBuilder): void {
  const { box: base, bar, post } = PIANO_PEDALS;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const z = PIANO_PEDALS.tipZ - PIANO_PEDALS.length - base.depth / 2;
  const barBottom = PIANO.caseBottom - bar.height;
  piece.add(
    box(base.width, base.top - base.bottom, base.depth),
    dark,
    transform([0, (base.top + base.bottom) / 2, z]),
    'lacquer',
  );
  piece.add(
    box(bar.width, bar.height, bar.depth),
    dark,
    transform([0, barBottom + bar.height / 2, z]),
    'lacquer',
  );
  for (const side of [-1, 1]) {
    piece.rod(
      [side * post.boxX, base.top, z],
      [side * post.barX, barBottom, z],
      post.radius,
      6,
      dark,
      'lacquer',
    );
  }
}

/**
 * Adds one pedal ({@link PIANO_PEDALS}): the shank out of the box of the lyre, and the wider foot
 * plate at the front, with the top at the height of a pedal at rest.
 *
 * @param piece The piece that carries the pedal.
 * @param pedal The pedal.
 */
function addPedal(piece: PieceBuilder, pedal: PianoPedal): void {
  const p = PIANO_PEDALS;
  const x = p.x[pedal];
  const y = p.top - p.thickness / 2;
  const color = INSTRUMENT_COLORS.brass;
  piece.add(
    box(p.plateWidth, p.thickness, p.plateLength),
    color,
    transform([x, y, p.tipZ - p.plateLength / 2]),
    'metal',
  );
  // The shank starts inside the box, so that no gap shows when the damper pedal goes down.
  const shankFront = p.tipZ - p.plateLength;
  const shankBack = p.tipZ - p.length - p.box.depth / 2;
  piece.add(
    box(p.shankWidth, p.thickness, shankFront - shankBack),
    color,
    transform([x, y, (shankFront + shankBack) / 2]),
    'metal',
  );
}

/**
 * Calculates the middle of the front edge of the top of a pedal at rest, in the piano axes.
 *
 * @param pedal The pedal.
 * @returns The point.
 */
export function pianoPedalTip(pedal: PianoPedal): Vec3 {
  const p = PIANO_PEDALS;
  return [p.x[pedal] * PIANO_SCALE, p.top * PIANO_SCALE, p.tipZ * PIANO_SCALE];
}

/**
 * How far the point of a black key ({@link pianoKeyFront}) stands behind the front edge of the
 * black key, in meters. The claws of the studio polar bear hang about 3 cm in front of the point,
 * so with no inset they stop over the white keys in front of the black key. A pianist also plays
 * a black key farther in than a white key.
 */
const BLACK_KEY_INSET = 0.05;

/**
 * Calculates the point of a piano key that the paw of a pianist aims at, at the height of the top
 * of the key, in the piano axes. For a white key, it is the middle of its front edge. The paw of
 * the studio polar bear is longer than a white key, so the palm stays in front of this point, and
 * the claws lie at the front of the key (design 5.3). A black key is shorter and higher, so its
 * point stands {@link BLACK_KEY_INSET} behind its own front edge, at its top. The claws then
 * reach over the white keys and lie on the black key.
 *
 * @param key The MIDI key. A key outside the piano plays the nearest key.
 * @returns The point.
 */
export function pianoKeyFront(key: number): Vec3 {
  const p = PIANO;
  const [x, y] = pianoKeyPosition(key);
  if (!isBlack(pianoKey(key))) {
    return [x, y, 0];
  }
  return [x, y, -(p.whiteKeyLength - p.blackKeyLength) * PIANO_SCALE - BLACK_KEY_INSET];
}

/**
 * Adds the 88 keys from A0 to C8 in MIDI order, each as a part of its own (design 4.6), so that
 * each key can go down with its note (5.3). The white keys stand side by side with a narrow gap
 * ({@link PIANO.whiteKeyGap}), and each black key lies on the two white keys at its sides.
 *
 * @param piece The piece of the piano.
 */
function addKeys(piece: PieceBuilder): void {
  const p = PIANO;
  const width = p.keyboardWidth / 52;
  for (let k = p.keys[0]; k <= p.keys[1]; k++) {
    const [x] = unscaledKeyPosition(k);
    if (isBlack(k)) {
      piece.key(
        k,
        box(0.012, 0.012, p.blackKeyLength),
        INSTRUMENT_COLORS.blackKeys,
        transform([x, p.keyTop + 0.006, -p.whiteKeyLength + p.blackKeyLength / 2]),
      );
    } else {
      piece.key(
        k,
        box(width - p.whiteKeyGap, 0.02, p.whiteKeyLength),
        INSTRUMENT_COLORS.whiteKeys,
        transform([x, p.keyTop - 0.01, -p.whiteKeyLength / 2]),
      );
    }
  }
}

/**
 * The line that the piano keys turn around, and the turn of a key at the key bottom (design 4.6,
 * 5.3). The line lies along the keys under the balance rail, behind the fallboard, so the front of
 * a white key goes down by the key dip, and its back less. The turn is the same at each scale.
 */
const PIANO_KEY_TURN: KeyTurn = {
  pivot: [0, (PIANO.keyTop - 0.02) * PIANO_SCALE, -PIANO.balanceRail * PIANO_SCALE],
  axis: [1, 0, 0],
  angle: Math.atan(PIANO.keyDip / PIANO.balanceRail),
};

/**
 * Builds the grand piano (design 4.6). It stands on the floor in front of the player, with the
 * lid open to the right of the player. The celesta and the organs use it too.
 *
 * @returns The model.
 */
export function buildPiano(): InstrumentModel {
  const p = PIANO;
  const dark = INSTRUMENT_COLORS.pianoCase;
  const piece = new PieceBuilder(PIANO_SCALE);
  const half = p.keyboardWidth / 2;
  const front = -0.17;

  // The rim: the case below the soundboard, and the wall around the open inside. The open lid
  // shows the inside, as the piano of `mockup.png`.
  const rimAt = transform([CASE_CENTER[0], 0, CASE_CENTER[1]]);
  const inside = PIANO_INSIDE;
  const boardY = p.caseTop - inside.soundboardDepth;
  piece.add(prism(CASE_OUTLINE, p.caseBottom, boardY), dark, rimAt, 'lacquer');
  piece.add(rimWall(CASE_OUTLINE, inside.scale, boardY, p.caseTop), dark, rimAt, 'lacquer');
  addInside(piece, boardY);
  const hingeX = -p.caseWidth / 2;
  const lid = placeCorners(
    prism(CASE_OUTLINE, 0, 0.02),
    transform([CASE_CENTER[0] - hingeX, 0, 0]),
  );
  piece.add(
    lid,
    dark,
    transform(
      [hingeX, p.caseTop, CASE_CENTER[1]],
      toQuat(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), p.lidAngle)),
    ),
    'lacquer',
  );
  // The prop stick stands on the right side of the rim and holds the lid.
  const propX = 0.33;
  const lidHeight = p.caseTop + (propX - hingeX) * Math.tan(p.lidAngle);
  piece.rod([propX, p.caseTop, -0.95], [propX, lidHeight, -0.95], 0.012, 4, dark, 'lacquer');

  // The key bed, the cheek blocks, the keys, the fallboard, and the music desk. The front of the
  // key bed stands back from the front of the keys, so that the front face of a pressed key does
  // not lie on it.
  const bedFront = -p.keyOverhang;
  piece.add(
    box(p.caseWidth, 0.06, bedFront - front),
    dark,
    transform([0, p.keyTop - 0.05, (front + bedFront) / 2]),
    'lacquer',
  );
  for (const side of [-1, 1]) {
    piece.add(
      box(0.08, 0.1, -front),
      dark,
      transform([side * (half + 0.04), p.keyTop, front / 2]),
      'lacquer',
    );
  }
  addKeys(piece);
  piece.add(
    box(p.keyboardWidth, 0.07, 0.02),
    dark,
    transform([0, p.keyTop + 0.025, front + 0.01]),
    'lacquer',
  );
  const deskTilt = toQuat(
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -15 * MathUtils.DEG2RAD),
  );
  piece.add(
    box(0.7, 0.26, 0.015),
    dark,
    transform([0, p.caseTop + 0.12, -0.38], deskTilt),
    'lacquer',
  );
  // The open sheet music on the desk, on its side to the player.
  const sheetAt = new Vector3(0, 0.01, 0.0085).applyQuaternion(new Quaternion(...deskTilt));
  piece.add(
    box(0.42, 0.2, 0.002),
    INSTRUMENT_COLORS.sheet,
    transform([0, p.caseTop + 0.12 + sheetAt.y, -0.38 + sheetAt.z], deskTilt),
  );

  // Three legs, and the lyre with the pedals.
  for (const [x, z] of [
    [-half, -0.3],
    [half, -0.3],
    [-0.15, -1.8],
  ] as const) {
    piece.add(cylinder(0.045, 0.035, p.caseBottom, 8), dark, transform([x, 0, z]), 'lacquer');
  }
  addLyre(piece);
  addPedal(piece, 'soft');
  addPedal(piece, 'sostenuto');
  // The damper pedal follows the `slide` bone, so that the foot of the pianist can press it.
  const damper = new PieceBuilder(PIANO_SCALE);
  addPedal(damper, 'damper');

  // The round belly of the studio polar bear reaches 0.45 m in front of the floor point, so keys
  // at 0.55 H + 0.05 m (0.26 m) go 15 cm into it. With an upright trunk, keys at 1.37 H stretch
  // the elbows to 117° with the upper arms 28° forward. With the claws on the key tops
  // (`HANDS_HOLDS.piano`) and the lean of the high bench, the keys at `PIANO_FRONT_H` bend the
  // elbows about 105°, and the forearms go at most 8.8 cm into the belly, under the limit of 9 cm.
  const instrument = piece.build(
    'instrument',
    hold('floor', [0, 0, -PIANO_FRONT_H], undefined, [0, 0, -0.05]),
  );
  const lowHand = pianoKeyPosition(48);
  const highHand = pianoKeyPosition(72);
  const s = PIANO_SCALE;
  return {
    id: 'piano',
    parent: 'root',
    pieces: [instrument, damper.build('slide', hold('instrument'))],
    grips: {
      palmL: { bone: 'instrument', at: [lowHand[0], (p.keyTop + 0.04) * s, -0.06 * s] },
      palmR: { bone: 'instrument', at: [highHand[0], (p.keyTop + 0.04) * s, -0.06 * s] },
      mouth: null,
      chin: null,
    },
    targets: [
      {
        kind: 'keyboard',
        bone: 'instrument',
        from: pianoKeyPosition(p.keys[0]),
        to: pianoKeyPosition(p.keys[1]),
        normal: [0, 1, 0],
        keys: p.keys,
      },
    ],
    size: pieceSize(instrument),
    keyTurn: PIANO_KEY_TURN,
  };
}

/**
 * Gives the four sides of a square post that tapers along y, with no caps: the caps of the legs
 * of the bench lie under the apron and on the floor.
 *
 * @param bottom The height of the bottom.
 * @param top The height of the top.
 * @param lower The half width at the bottom.
 * @param upper The half width at the top.
 * @returns 8 triangles.
 */
function postSides(bottom: number, top: number, lower: number, upper: number): number[] {
  const ring = (half: number, y: number): Vec3[] => [
    [half, y, half],
    [half, y, -half],
    [-half, y, -half],
    [-half, y, half],
  ];
  const low = ring(lower, bottom);
  const high = ring(upper, top);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.push(
      ...quad(low[i] ?? [0, 0, 0], low[j] ?? [0, 0, 0], high[j] ?? [0, 0, 0], high[i] ?? [0, 0, 0]),
    );
  }
  return out;
}

/**
 * Builds the piano bench (design 4.5, 4.6), as the bench of `polar-bear-views.png`: a padded
 * seat with round top edges, an apron under it, and four square legs that taper down to brass
 * feet, in 100 triangles. The seat center is above the origin, and the player sits on it and
 * faces -z.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param depth The depth of the seat, in meters.
 * @returns The mesh data, with all vertices on bone 0.
 */
export function buildPianoBench(
  seatHeight: number = PIANO_BENCH.seatHeight,
  depth: number = PIANO_BENCH.depth,
): MeshData {
  const b = PIANO_BENCH;
  const builder = new MeshBuilder();
  const color = INSTRUMENT_COLORS.pianoCase;
  const pad = b.pad * seatHeight;
  const apron = b.apron * seatHeight;
  const padBottom = seatHeight - pad;
  const halfX = b.width / 2;
  const halfZ = depth / 2;
  const seat: OutlinePoint[] = [
    [halfX, halfZ],
    [halfX, -halfZ],
    [-halfX, -halfZ],
    [-halfX, halfZ],
  ];
  builder.add(
    plate(seat, [
      [1, padBottom],
      [1, padBottom + 0.7 * pad],
      [0.96, seatHeight],
    ]),
    { color, finish: 'lacquer' },
  );
  builder.add(box(b.width - 2 * b.inset, apron, depth - 2 * b.inset), {
    color,
    at: transform([0, padBottom - apron / 2, 0]),
    finish: 'lacquer',
  });
  const legTop = padBottom - apron;
  const foot = b.foot * seatHeight;
  const half = b.leg / 2;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const at = transform([
        (x * (b.width - 2 * b.inset - b.leg)) / 2,
        0,
        (z * (depth - 2 * b.inset - b.leg)) / 2,
      ]);
      builder.add(postSides(foot, legTop, 0.8 * half, half), { color, at, finish: 'lacquer' });
      builder.add(postSides(0, foot, 0.72 * half, 0.8 * half), {
        color: INSTRUMENT_COLORS.brass,
        at,
        finish: 'metal',
      });
    }
  }
  return builder.build();
}
