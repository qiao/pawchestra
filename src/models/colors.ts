import { srgb } from './mesh.ts';
import type { Rgb } from './mesh.ts';
import type { SpeciesId } from './species.ts';

/** The three colors of a species (design 4.5, species colors), as CSS hex colors in sRGB. */
export interface SpeciesColors {
  /** The color of the body, the head, and the limbs. */
  readonly fur: string;
  /** The color of the belly, the face, and the inside of the ears. */
  readonly belly: string;
  /** The color of the accent parts of the species (design 4.5). */
  readonly accent: string;
}

/**
 * The colors of each species (design 4.5, species colors). The fur of the red fox is the fur of
 * its rig after the color shift (`colors.shift` of `tools/mesh-rigs/fox.json`). The models and the
 * seat dots of the UI read them through `SPECIES`.
 */
export const SPECIES_COLORS = {
  rabbit: { fur: '#ece6dc', belly: '#f4f0ea', accent: '#e9a7a5' },
  'fox-red': { fur: '#bd4a00', belly: '#f6eee0', accent: '#4a3324' },
  'fox-tan': { fur: '#c9a273', belly: '#e6d3b5', accent: '#9a7148' },
  wolf: { fur: '#bab2aa', belly: '#f0ece4', accent: '#8a807a' },
  elephant: { fur: '#a8a198', belly: '#b9b2a8', accent: '#b9a39a' },
  bear: { fur: '#93603a', belly: '#9c6a44', accent: '#c9a07a' },
  cat: { fur: '#8d9298', belly: '#e2ddd4', accent: '#5f646a' },
  hippo: { fur: '#8f7d83', belly: '#b8a3a6', accent: '#6f5f66' },
  deer: { fur: '#a8774c', belly: '#e5d3b8', accent: '#3a2a20' },
  panda: { fur: '#e9e5dc', belly: '#e9e5dc', accent: '#24211e' },
  mouse: { fur: '#9a8b7e', belly: '#c9bcae', accent: '#d6a59a' },
  beaver: { fur: '#6a4630', belly: '#8c6a52', accent: '#3e2e26' },
  dog: { fur: '#e6dfd1', belly: '#f3eee4', accent: '#a0643a' },
  monkey: { fur: '#8a5a3a', belly: '#d9b892', accent: '#5a3a26' },
  pig: { fur: '#d99a8e', belly: '#e6b2a8', accent: '#c98276' },
  rhino: { fur: '#8e8a84', belly: '#a6a29b', accent: '#cfc6b5' },
  badger: { fur: '#7d7a76', belly: '#e6e1d8', accent: '#24211e' },
  penguin: { fur: '#1f1d1c', belly: '#ece8e0', accent: '#d98a3a' },
  'polar-bear': { fur: '#efeae0', belly: '#f6f2ea', accent: '#1a1715' },
} as const satisfies Readonly<Record<SpeciesId, SpeciesColors>>;

/** The colors of the stage and the props (design 4.5, scene colors), in linear values. */
export const SCENE_COLORS = {
  stageTop: srgb('#7a6359'),
  /**
   * A honey wood, as the chairs of `orchestra-latest.png`. The pale `#cdb27a` lit to a saturation
   * of about 0.48 against 0.65 under the warm white side lights.
   */
  chair: srgb('#c47c22'),
  stand: srgb('#1e1a16'),
  /**
   * The two large faces of the desk of a stand: a warm gray, so that the desk reads as an object
   * in a close shot. Black desks are the largest shapes of some close shots. The darker `#2e2722`
   * still looks black in the shade of the desk back.
   */
  standDesk: srgb('#544840'),
  /** The four narrow faces of the desk of a stand: a lighter edge around the desk. */
  standEdge: srgb('#a08b7a'),
  sheet: srgb('#ece6d6'),
} as const satisfies Readonly<Record<string, Rgb>>;

/** The colors of the instruments (design 4.5, instrument colors), in linear values. */
export const INSTRUMENT_COLORS = {
  /** The edges and the ribs of the violin and the viola. */
  violinWood: srgb('#7a3a20'),
  /** The arched top plate and the scroll of the violin and the viola. */
  violinTop: srgb('#b0562c'),
  celloWood: srgb('#7e3f1f'),
  celloTop: srgb('#b8622e'),
  bridge: srgb('#e3c99a'),
  fingerboard: srgb('#1b1714'),
  bowStick: srgb('#3b2a20'),
  bowHair: srgb('#e8e2d4'),
  strings: srgb('#9a9080'),
  harpFrame: srgb('#b07a45'),
  harpStrings: srgb('#e8e2d4'),
  pianoCase: srgb('#15120f'),
  /** The iron plate inside the piano: a dark gold, as in `mockup.png`. */
  pianoPlate: srgb('#6b5226'),
  /** The soundboard at the bottom of the inside of the piano: a warm spruce. */
  soundboard: srgb('#5a3c22'),
  /** The strings of the piano. */
  pianoStrings: srgb('#a89064'),
  /** The sheet music on the piano desk: the sheet color of the stands. */
  sheet: srgb('#ece6d6'),
  whiteKeys: srgb('#f2eee6'),
  blackKeys: srgb('#15120f'),
  folder: srgb('#2a2522'),
  silver: srgb('#c9c6bf'),
  oboe: srgb('#2a2522'),
  clarinet: srgb('#1f1b19'),
  bassoon: srgb('#7a4a2e'),
  brass: srgb('#dcb052'),
  kettle: srgb('#c27a44'),
  drumShell: srgb('#8a2f2a'),
  drumHead: srgb('#efe9dc'),
  hardware: srgb('#1e1a16'),
  stick: srgb('#cdb27a'),
  xylophoneBars: srgb('#b07a45'),
  xylophoneFrame: srgb('#3a2a22'),
  baton: srgb('#ece6d6'),
} as const satisfies Readonly<Record<string, Rgb>>;
