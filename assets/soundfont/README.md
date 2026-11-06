# SoundFont

`Pawchestra.sf3` is the SoundFont of the app, an SF3 file (Ogg Vorbis samples). The build splits it
into one file for each preset (design 6.2). `tools/build-soundfont.ts` makes it from three
sources:

- GeneralUser GS 2.0.3 by S. Christian Collins gives the base: every preset that the table below
  does not name, and the keys outside the range of the new samples.
- VS Chamber Orchestra 2: Community Edition (VSCO 2 CE) by Versilian Studios gives the strings,
  the winds, the brass, and the orchestra kit.
- The Versilian Community Sample Library (VCSL) by Versilian Studios gives the piano, the
  harpsichord, the harp, the timpani, the mallets, the recorder, and the ocarina.

| Item | Value |
|---|---|
| File | `Pawchestra.sf3`, 21,967,054 bytes |
| SHA-256 | `cbe84ed015583bfe7cff32dd951668236a1f2e4fe45a330d5cb1dbc2905b6260` |
| Build | `node tools/build-soundfont.ts`, Node 24 |
| Source checksums | `tools/soundfont-lock.json` (SHA-256 and size of each file) |

To check the file:

```bash
shasum -a 256 assets/soundfont/Pawchestra.sf3
```

## Sources and licenses

| Source | Version | License | License text |
|---|---|---|---|
| GeneralUser GS | 2.0.3, the SF3 copy of SpessaSynth at commit `6f7505087eba09bdbf345c97f5cf573fc547412e` (8,423,728 bytes, SHA-256 `e2ed326ff44d15f78f2fdc72403b6fa6b77ee7266d3aad0d2198bc95797bc66c`) | GeneralUser GS License v2.0 | `LICENSE.txt` in this folder, from <https://github.com/mrbumpy409/GeneralUser-GS/blob/97049183643d5fc5a9322a69c5b09efb667c6c3a/documentation/LICENSE.txt> |
| VSCO 2 CE | 1.1.0, branch `SFZ` of <https://github.com/sgossner/VSCO-2-CE> at commit `6dd651d55dde97fd4028699be9d4481f26917891` | CC0 1.0 | `LICENSE` of the repository at that commit. The legal code is at <https://creativecommons.org/publicdomain/zero/1.0/legalcode> |
| VCSL | branch `sfz` of <https://github.com/sgossner/VCSL> at commit `dfcf4a4918771eee884b96ad4493de82ef84daf6` | CC0 1.0 | `README.md` of that commit, and `LICENSE` of commit `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` (branch `master`) |

- The GeneralUser GS license permits use in software projects and changes to the bank or its
  packaging. It asks websites to link to the author's website, or to serve their own copy. This
  app serves its own copy.
- CC0 1.0 puts the samples in the public domain, with no condition. The VSCO 2 CE readme asks for
  a credit to Versilian Studios (Sam Gossner) and Ivy Audio (Simon Dalzell), and a link to the
  VSCO 2 CE page. The credits panel and the third-party license file give it.

## Presets from the sample libraries

All samples are mono, at the rate of the source (44.1 or 48 kHz). A part keeps the first round
robin of each key and the velocity layers of the "Layers" column. A layer is the source layer
that holds the given velocity.

| Program | Preset | Source | SFZ file | Layers |
|---|---|---|---|---|
| 0, 1 | Grand Piano, Bright Grand Piano | VCSL | `Grand Piano, Steinway B.sfz` (no pedal) | 50, 110 |
| 6 | Harpsichord | VCSL | `Harpsichord, English - Normal.sfz` | 100 |
| 9 | Glockenspiel | VCSL | `Glockenspiel.sfz` | 45, 110 |
| 11 | Vibraphone | VCSL | `Vibraphone - Soft Mallets.sfz` | 45, 110 |
| 12 | Marimba | VCSL | `Marimba.sfz` | 45, 110 |
| 13 | Xylophone | VCSL | `Xylophone - Medium Mallets.sfz` | 45, 110 |
| 14 | Tubular Bells | VCSL | `Tubular Bells 2.sfz` | 110 |
| 32 | Acoustic Bass | VSCO 2 CE | `ContrabassPizz.sfz` | 45, 110 |
| 40 | Violins | VSCO 2 CE | `ViolinEnsSusVib.sfz` (section) | 45, 110 |
| 41 | Violas | VSCO 2 CE | `ViolaEnsSusVib.sfz` (section) | 45, 110 |
| 42 | Celli | VSCO 2 CE | `CelloEnsSusVib.sfz` (section) | 45, 110 |
| 43 | Basses | VSCO 2 CE | `ContrabassSusVB.sfz` (solo) | 45, 110 |
| 44 | Tremolo Strings | VSCO 2 CE | `ContrabassTrem`, `CelloEnsTrem`, `ViolaEnsTrem`, `ViolinEnsTrem` | 45, 110 |
| 45 | Pizzicato Strings | VSCO 2 CE | `ContrabassPizz`, `CelloEnsPizz`, `ViolaEnsPizz`, `ViolinEnsPizz` | 45, 110 |
| 46 | Harp | VCSL | `Concert Harp.sfz` | 45, 110 |
| 47 | Timpani | VCSL | `Timpani 2 - Scale.sfz` | 45, 110 |
| 48, 49 | Strings, Slow Strings | VSCO 2 CE | the four sustain files of 40 to 43 | 45, 110 |
| 56 | Trumpet | VSCO 2 CE | `TrumpetSus.sfz` | 45, 110 |
| 57 | Trombone | VSCO 2 CE | `TromboneSus.sfz` | 45, 110 |
| 58 | Tuba | VSCO 2 CE | `TubaSus.sfz` | 45, 110 |
| 59 | Muted Trumpet | VSCO 2 CE | `TrumpetStraightMuteSus.sfz` | 45, 110 |
| 60 | French Horns | VSCO 2 CE | `FHornSus.sfz` | 45, 110 |
| 68 | Oboe | VSCO 2 CE | `OboeSusVib.sfz` | 45, 110 |
| 70 | Bassoon | VSCO 2 CE | `BassoonSus.sfz` | 45, 110 |
| 71 | Clarinet | VSCO 2 CE | `ClarinetSus.sfz` | 45, 110 |
| 72 | Piccolo | VSCO 2 CE | `PiccoloSus.sfz` | 110 |
| 73 | Flute | VSCO 2 CE | `FluteSusVib.sfz` | 45, 110 |
| 74 | Recorder | VCSL | `Baroque Alto Recorder - Sustain.sfz` | 100 |
| 79 | Ocarina | VCSL | `Ocarina, Typical - Sus.sfz` | 100 |
| Kit 48 | Orchestra Kit | VSCO 2 CE and VCSL | `GM-StylePerc.sfz` for keys 35, 36, 38, 40, 49, 51, 54, 56, 57, 59, 75, 80, 81. `Timpani 2 - Scale.sfz` for keys 41 to 53 | 45, 110 |

`tools/soundfont-recipes.ts` holds these choices, the cut of each part, and the key ranges.

## Build

The build needs Node 24 and the packages of `pnpm install`. It downloads 783 source files
(1.42 GB) from GitHub into a cache folder, checks each file with `tools/soundfont-lock.json`,
and writes `assets/soundfont/Pawchestra.sf3`. Two builds with the same sources write the same
bytes.

```bash
node tools/build-soundfont.ts                    # cache: <os tmpdir>/pawchestra-soundfont
node tools/build-soundfont.ts --cache <folder>   # another cache folder
node tools/build-soundfont.ts --fetch-only       # only the downloads
node tools/build-soundfont.ts --update-lock      # after a change of the recipes
```

The build prints the level of each new preset against GeneralUser GS and the headroom. When the headroom changes, change
`SOUNDFONT_HEADROOM_DB` in `src/audio/soundfont-info.ts` to the same value. A test compares the
two.
