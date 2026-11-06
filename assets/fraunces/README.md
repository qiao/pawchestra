# Fraunces wordmark

The logo shows the name "Pawchestra" in the font Fraunces, as one SVG path (design 2.8).
`WORDMARK_PATH` in `src/ui/icons.ts` and the load state of `index.html` hold the path. The app loads no font file.

`fraunces.ttf` in this folder is the source file with no change. Only `pnpm share-image` reads it,
to draw the headline of the share image (design 7.4). No page of the site loads it, and the build
does not copy it.

| Item | Value |
|---|---|
| Source | Google Fonts, <https://github.com/google/fonts>, folder `ofl/fraunces` |
| Source file | `Fraunces[SOFT,WONK,opsz,wght].ttf`, Fraunces v1.0 by Undercase Type |
| Commit | `ac502d8eff76ef4d9477cdcc8ef7d0c84fde5372` (2020-12-09), the last commit that changed the file |
| Source file SHA-256 | `177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb`, also of `fraunces.ttf` |
| Download | `https://raw.githubusercontent.com/google/fonts/<commit>/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf` |
| License | SIL Open Font License 1.1, Copyright 2018 The Fraunces Project Authors. `LICENSE.txt` in this folder is the `OFL.txt` of the folder |
| License SHA-256 | `bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b` |

## How the path was made

`node tools/wordmark.ts --write` makes the path from `APP_NAME` and writes it into the two files.

1. HarfBuzz 11.0.0 shapes the word at the instance `wght=600,SOFT=100,WONK=1,opsz=72`, with
   kerning, in font units (`hb-view --font-size=upem --margin=0`).
2. The tool moves each glyph to its place, scales the em of 2000 units to 200 units, and writes
   one path with relative integer commands. The rounding moves a point by at most 0.25% of the
   em. The view box goes from the left side to the right side of the ink, and from the top of the
   "h" to the bottom of the "p" and the "y". Thus each name gets the same height.

The SVG keeps the glyph outlines and no font data, so the app does not hold the Font Software.
The license file of the app still credits the font. The repository holds the Font Software in
`fraunces.ttf`, with `LICENSE.txt` beside it, as the license requires.
