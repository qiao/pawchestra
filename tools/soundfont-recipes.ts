/** A sample library in a Git repository, at a fixed commit. */
interface SourceRepo {
  /** The name for the credits and the README. */
  readonly name: string;
  /** The GitHub repository, as `owner/name`. */
  readonly repository: string;
  /** The commit of the branch with the SFZ files. */
  readonly commit: string;
  /** The SPDX id of the license. */
  readonly license: string;
  /** The web page of the library. */
  readonly home: string;
}

/** The sample libraries of the SoundFont (design 6.2). */
export const SOURCES = {
  vsco: {
    name: 'VS Chamber Orchestra 2: Community Edition 1.1.0 (Versilian Studios)',
    repository: 'sgossner/VSCO-2-CE',
    commit: '6dd651d55dde97fd4028699be9d4481f26917891',
    license: 'CC0-1.0',
    home: 'https://github.com/sgossner/VSCO-2-CE',
  },
  vcsl: {
    name: 'Versilian Community Sample Library (Versilian Studios)',
    repository: 'sgossner/VCSL',
    commit: 'dfcf4a4918771eee884b96ad4493de82ef84daf6',
    license: 'CC0-1.0',
    home: 'https://github.com/sgossner/VCSL',
  },
} as const satisfies Readonly<Record<string, SourceRepo>>;

/** The id of a sample library that the SoundFont build reads. */
export type SourceId = keyof typeof SOURCES;

/** The base SoundFont. Each preset that no recipe makes comes from it. */
export const BASE_SOUNDFONT = {
  name: 'GeneralUser GS 2.0.3',
  url: 'https://raw.githubusercontent.com/spessasus/SpessaSynth/6f7505087eba09bdbf345c97f5cf573fc547412e/soundfonts/GeneralUserGS.sf3',
  sha256: 'e2ed326ff44d15f78f2fdc72403b6fa6b77ee7266d3aad0d2198bc95797bc66c',
  bytes: 8_423_728,
} as const;

/** The cut of a sustained sound: the attack and one loop (`tools/sample-cut.ts`). */
interface SustainCut {
  readonly mode: 'sustain';
  readonly loopSec: number;
  readonly crossfadeSec: number;
  /** The level below the steady level at which the sample starts, in dB. */
  readonly startDb: number;
}

/** The cut of a decaying sound (`tools/sample-cut.ts`). */
interface DecayCut {
  readonly mode: 'decay';
  /** The level below the peak at which the sample ends, in dB. */
  readonly floorDb: number;
  /** The longest sample in seconds, at key 24 and at key 96. Other keys interpolate. */
  readonly maxSec: readonly [number, number];
  /** The length of the tail loop in seconds, or 0 for a fade at the longest length. */
  readonly tailLoopSec: number;
}

/** A drum kit key that plays the regions of another key of the source. */
interface KeyMapping {
  /** The key of the kit. */
  readonly key: number;
  /** The key of the source regions. */
  readonly from: number;
}

/** One SFZ instrument in a preset. */
export interface PartRecipe {
  readonly source: SourceId;
  /** The path of the SFZ file in the repository. */
  readonly sfz: string;
  /**
   * The velocities that select the layers to keep. For each key, the layer whose velocity range
   * holds a velocity is kept. The kept layers then share the full range 0 to 127.
   */
  readonly velocities: readonly number[];
  /** The keys of the preset that this part plays. The regions are clipped to this range. */
  readonly window: readonly [number, number];
  /** The semitones by which the lowest and the highest region reach beyond the source range. */
  readonly extend: readonly [number, number];
  readonly cut: SustainCut | DecayCut;
  /** The release time in seconds, in place of the release of the SFZ file. */
  readonly releaseSec?: number;
  /** The attack time in seconds, in place of the attack of the SFZ file. */
  readonly attackSec?: number;
  /** For a drum kit: the keys to make. Undefined for a melodic part. */
  readonly keys?: readonly KeyMapping[];
}

/** One preset of the new SoundFont. */
export interface PresetRecipe {
  readonly name: string;
  /** 0 for a melodic preset, 128 for a drum kit. */
  readonly bank: 0 | 128;
  readonly program: number;
  readonly parts: readonly PartRecipe[];
}

const STRING_LOOP: SustainCut = { mode: 'sustain', loopSec: 1.2, crossfadeSec: 0.3, startDb: -9 };

const WIND_LOOP: SustainCut = { mode: 'sustain', loopSec: 1, crossfadeSec: 0.25, startDb: -12 };

/** The key windows of the four string sections in an ensemble preset. */
const BASSES: readonly [number, number] = [0, 35];
const CELLI: readonly [number, number] = [36, 47];
const VIOLAS: readonly [number, number] = [48, 54];
const VIOLINS: readonly [number, number] = [55, 127];
const FULL: readonly [number, number] = [0, 127];

/** Two layers: one for soft notes, one for loud notes. */
const TWO_LAYERS: readonly number[] = [45, 110];

function vsco(
  sfz: string,
  window: readonly [number, number],
  cut: SustainCut | DecayCut,
): PartRecipe {
  return { source: 'vsco', sfz, velocities: TWO_LAYERS, window, extend: [2, 5], cut };
}

function vcsl(sfz: string, velocities: readonly number[], cut: SustainCut | DecayCut): PartRecipe {
  return { source: 'vcsl', sfz, velocities, window: FULL, extend: [2, 5], cut };
}

function decay(low: number, high: number): DecayCut {
  return { mode: 'decay', floorDb: -50, maxSec: [low, high], tailLoopSec: 0 };
}

function melodic(name: string, program: number, part: PartRecipe): PresetRecipe {
  return { name, bank: 0, program, parts: [part] };
}

/** The four string sections, split by key, with an optional attack time for a slow preset. */
function ensemble(
  files: readonly [string, string, string, string],
  cut: SustainCut | DecayCut,
  attackSec?: number,
): PartRecipe[] {
  const [basses, celli, violas, violins] = files;
  const parts = [
    vsco(basses, BASSES, cut),
    vsco(celli, CELLI, cut),
    vsco(violas, VIOLAS, cut),
    vsco(violins, VIOLINS, cut),
  ];
  return attackSec === undefined ? parts : parts.map((part) => Object.assign(part, { attackSec }));
}

const PIZZ: DecayCut = { mode: 'decay', floorDb: -45, maxSec: [1.6, 0.8], tailLoopSec: 0 };

const SUSTAIN_FILES = [
  'ContrabassSusVB.sfz',
  'CelloEnsSusVib.sfz',
  'ViolaEnsSusVib.sfz',
  'ViolinEnsSusVib.sfz',
] as const;

/** The presets that the build makes from the sample libraries (design 6.2). */
export const PRESET_RECIPES: readonly PresetRecipe[] = [
  {
    name: 'Grand Piano',
    bank: 0,
    program: 0,
    parts: [
      {
        source: 'vcsl',
        sfz: 'Chordophones/Zithers/Grand Piano, Steinway B.sfz',
        velocities: [50, 110],
        window: FULL,
        extend: [0, 0],
        cut: { mode: 'decay', floorDb: -50, maxSec: [4.5, 1.8], tailLoopSec: 0.5 },
      },
    ],
  },
  {
    name: 'Violins',
    bank: 0,
    program: 40,
    parts: [vsco('ViolinEnsSusVib.sfz', FULL, STRING_LOOP)],
  },
  {
    name: 'Violas',
    bank: 0,
    program: 41,
    parts: [vsco('ViolaEnsSusVib.sfz', FULL, STRING_LOOP)],
  },
  {
    name: 'Celli',
    bank: 0,
    program: 42,
    parts: [vsco('CelloEnsSusVib.sfz', FULL, STRING_LOOP)],
  },
  {
    name: 'Basses',
    bank: 0,
    program: 43,
    parts: [vsco('ContrabassSusVB.sfz', FULL, STRING_LOOP)],
  },
  {
    name: 'Tremolo Strings',
    bank: 0,
    program: 44,
    parts: ensemble(
      ['ContrabassTrem.sfz', 'CelloEnsTrem.sfz', 'ViolaEnsTrem.sfz', 'ViolinEnsTrem.sfz'],
      STRING_LOOP,
    ),
  },
  {
    name: 'Pizzicato Strings',
    bank: 0,
    program: 45,
    parts: ensemble(
      ['ContrabassPizz.sfz', 'CelloEnsPizz.sfz', 'ViolaEnsPizz.sfz', 'ViolinEnsPizz.sfz'],
      PIZZ,
    ),
  },
  {
    name: 'Strings',
    bank: 0,
    program: 48,
    parts: ensemble(SUSTAIN_FILES, STRING_LOOP),
  },
  {
    name: 'Slow Strings',
    bank: 0,
    program: 49,
    parts: ensemble(SUSTAIN_FILES, STRING_LOOP, 0.35),
  },
  melodic(
    'Harpsichord',
    6,
    vcsl('Chordophones/Zithers/Harpsichord, English - Normal.sfz', [100], {
      mode: 'decay',
      floorDb: -50,
      maxSec: [4, 2],
      tailLoopSec: 0.3,
    }),
  ),
  melodic(
    'Glockenspiel',
    9,
    vcsl('Idiophones/Struck Idiophones/Glockenspiel.sfz', TWO_LAYERS, decay(3, 3)),
  ),
  melodic(
    'Vibraphone',
    11,
    vcsl('Idiophones/Struck Idiophones/Vibraphone - Soft Mallets.sfz', TWO_LAYERS, decay(5, 3)),
  ),
  melodic(
    'Marimba',
    12,
    vcsl('Idiophones/Struck Idiophones/Marimba.sfz', TWO_LAYERS, decay(2.5, 1.2)),
  ),
  melodic(
    'Xylophone',
    13,
    vcsl('Idiophones/Struck Idiophones/Xylophone - Medium Mallets.sfz', TWO_LAYERS, decay(1.5, 1)),
  ),
  melodic(
    'Tubular Bells',
    14,
    vcsl('Idiophones/Struck Idiophones/Tubular Bells 2.sfz', [110], decay(5, 4)),
  ),
  melodic('Acoustic Bass', 32, vsco('ContrabassPizz.sfz', FULL, PIZZ)),
  melodic(
    'Harp',
    46,
    vcsl('Chordophones/Composite Chordophones/Concert Harp.sfz', TWO_LAYERS, decay(3.5, 1.2)),
  ),
  melodic(
    'Timpani',
    47,
    vcsl('Membranophones/Struck Membranophones/Timpani 2 - Scale.sfz', TWO_LAYERS, decay(4, 4)),
  ),
  melodic('Trumpet', 56, vsco('TrumpetSus.sfz', FULL, WIND_LOOP)),
  melodic('Trombone', 57, vsco('TromboneSus.sfz', FULL, WIND_LOOP)),
  melodic('Tuba', 58, vsco('TubaSus.sfz', FULL, WIND_LOOP)),
  melodic('Muted Trumpet', 59, vsco('TrumpetStraightMuteSus.sfz', FULL, WIND_LOOP)),
  melodic('French Horns', 60, vsco('FHornSus.sfz', FULL, WIND_LOOP)),
  melodic('Oboe', 68, vsco('OboeSusVib.sfz', FULL, WIND_LOOP)),
  melodic('Bassoon', 70, vsco('BassoonSus.sfz', FULL, WIND_LOOP)),
  melodic('Clarinet', 71, vsco('ClarinetSus.sfz', FULL, WIND_LOOP)),
  melodic('Piccolo', 72, { ...vsco('PiccoloSus.sfz', FULL, WIND_LOOP), velocities: [110] }),
  melodic('Flute', 73, vsco('FluteSusVib.sfz', FULL, WIND_LOOP)),
  melodic(
    'Recorder',
    74,
    vcsl('Aerophones/Edge-blown Aerophones/Baroque Alto Recorder - Sustain.sfz', [100], WIND_LOOP),
  ),
  melodic(
    'Ocarina',
    79,
    vcsl('Aerophones/Edge-blown Aerophones/Ocarina, Typical - Sus.sfz', [100], WIND_LOOP),
  ),
  {
    name: 'Orchestra Kit',
    bank: 128,
    program: 48,
    parts: [
      {
        ...vsco('GM-StylePerc.sfz', FULL, {
          mode: 'decay',
          floorDb: -45,
          maxSec: [3, 3],
          tailLoopSec: 0,
        }),
        releaseSec: 4,
        keys: [
          { key: 35, from: 36 },
          { key: 36, from: 36 },
          { key: 38, from: 38 },
          { key: 40, from: 38 },
          { key: 49, from: 49 },
          { key: 51, from: 51 },
          { key: 54, from: 54 },
          { key: 56, from: 56 },
          { key: 57, from: 49 },
          { key: 59, from: 49 },
          { key: 75, from: 75 },
          { key: 80, from: 80 },
          { key: 81, from: 81 },
        ],
      },
      {
        ...vcsl(
          'Membranophones/Struck Membranophones/Timpani 2 - Scale.sfz',
          TWO_LAYERS,
          decay(4, 4),
        ),
        window: [41, 53],
        extend: [0, 0],
        releaseSec: 4,
      },
    ],
  },
];

/** The presets that copy the zones of another preset, by program, to the program they copy. */
export const PRESET_ALIASES: readonly {
  readonly name: string;
  readonly program: number;
  readonly of: number;
}[] = [{ name: 'Bright Grand Piano', program: 1, of: 0 }];
