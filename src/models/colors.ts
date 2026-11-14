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
 * its old rig after the color shift (`colors.shift` of `tools/mesh-rigs/fox.json` at cbc8db5e4).
 * The models and the seat dots of the UI read them through `SPECIES`.
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
  mannequin: { fur: '#dbccb3', belly: '#bdccdb', accent: '#d9261f' },
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
  /** The black rubber tip of the end pin of the cello and the contrabass. */
  endPinRubber: srgb('#151312'),
  fingerboard: srgb('#1b1714'),
  bowStick: srgb('#3b2a20'),
  bowHair: srgb('#e8e2d4'),
  strings: srgb('#9a9080'),
  /** The varnished maple of the harp: the column, the neck, the soundbox, and the base. */
  harpFrame: srgb('#c9965e'),
  /** The spruce soundboard of the harp, lighter than the frame. */
  harpBoard: srgb('#e3c491'),
  /** The center strip of the soundboard, in which the strings start. */
  harpStrip: srgb('#6e3f20'),
  /** The dark inside of the soundbox, seen through the holes in its back. */
  harpHole: srgb('#1a120c'),
  /** The gut strings of the middle of the harp. */
  harpGut: srgb('#e2d2ae'),
  /** The nylon strings of the treble, lighter than the gut strings. */
  harpNylon: srgb('#f0eadc'),
  /** The C strings of the harp. */
  harpC: srgb('#b8282a'),
  /** The F strings of the harp: a dark blue. */
  harpF: srgb('#26305a'),
  /**
   * The wound wire strings of the bass: the silver of a silver-plated copper winding. A bronze
   * color with the metal finish took the warm light of the hall, so the 12 wires read as one red
   * area beside the red C strings.
   */
  harpWire: srgb('#a9aaa8'),
  pianoCase: srgb('#15120f'),
  /** The iron plate inside the piano: the gold paint of a concert grand. */
  pianoPlate: srgb('#9c7a36'),
  /** The soundboard at the bottom of the inside of the piano: a warm spruce. */
  soundboard: srgb('#5a3c22'),
  /** The steel strings and the tuning pins of the piano. */
  pianoStrings: srgb('#d4d0c8'),
  /** The bass strings of the piano: a copper winding. */
  pianoBassStrings: srgb('#a8703f'),
  /** The sheet music on the piano desk: the sheet color of the stands. */
  sheet: srgb('#ece6d6'),
  whiteKeys: srgb('#f2eee6'),
  blackKeys: srgb('#15120f'),
  folder: srgb('#2a2522'),
  // Winds
  /** The pearl tops of the finger buttons of the trumpet and the tuba. */
  pearl: srgb('#efe6d2'),
  /** The cane of the reeds of the oboe, the clarinet, and the bassoon. */
  reed: srgb('#d9b46a'),
  /** The thread that binds the cane of a double reed to its staple or its tube. */
  reedThread: srgb('#8a2f2a'),
  /** The dark bore, seen in the bell of a woodwind and the embouchure hole of the flute. */
  windBore: srgb('#120e0b'),
  /**
   * The stained maple of the bassoon: a dark red brown, as a Heckel or a Fox bassoon. The lighter
   * brown of `bassoon` read as orange under the warm light with the varnish.
   */
  bassoonStain: srgb('#5c2a1c'),
  silver: srgb('#c9c6bf'),
  oboe: srgb('#2a2522'),
  clarinet: srgb('#1f1b19'),
  brass: srgb('#dcb052'),
  /**
   * The polished copper of the timpani bowls: a deep red brown, as the kettles of
   * `orchestra-latest.png`. With the lighter `#c27a44`, the bowls read as a pale peach in the hall
   * light, at about 1.7 times the luma of the reference copper.
   */
  kettle: srgb('#96502a'),
  drumShell: srgb('#8a2f2a'),
  /**
   * The heads of the timpani and the drums: the warm cream of a calfskin or a coated head. With the
   * white `#efe9dc`, the heads clipped to white in the hall light.
   */
  drumHead: srgb('#d4c4a6'),
  hardware: srgb('#1e1a16'),
  stick: srgb('#cdb27a'),
  /** The varnished maple of the timpani mallet shafts. */
  malletShaft: srgb('#b8854f'),
  xylophoneBars: srgb('#b07a45'),
  xylophoneFrame: srgb('#3a2a22'),
  // Percussion
  /** The black of the struts, the counter hoops, and the base rings of the timpani. */
  timpaniBlack: srgb('#191614'),
  /** The wood hoops of the bass drum: a darker lacquer than the shell. */
  drumHoop: srgb('#3e1714'),
  /** The lathe grooves of a cymbal: a darker bronze between the polished rings. */
  cymbalGroove: srgb('#c89d4c'),
  /** The leather straps of the hand cymbals. */
  leather: srgb('#4b2e1c'),
  /** The felt of the timpani mallets and the bass drum beater. */
  felt: srgb('#ece4d2'),
  /** The yarn of the mallets of the suspended cymbal. */
  yarn: srgb('#7a2a36'),
  /** The hard rubber heads of the xylophone mallets. */
  malletRubber: srgb('#2c3346'),
  /** The Honduras rosewood of the xylophone bars: a reddish brown under a clear lacquer. */
  rosewood: srgb('#7c3a24'),
  baton: srgb('#ece6d6'),
} as const satisfies Readonly<Record<string, Rgb>>;
