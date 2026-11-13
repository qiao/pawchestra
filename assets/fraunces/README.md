# Fraunces

The brand font Fraunces shows in three places (design 2.8):

- The logo shows the name "Pawchestra" as one SVG path. `WORDMARK_PATH` in `src/ui/icons.ts` and
  the load state of `index.html` hold the path.
- The piece title, the title card, and the end card use the font file
  `public/fonts/fraunces-title.woff2`, a static subset of the source. It loads after the first
  frame (design 7.2).
- The headline of the share image (design 7.4). `pnpm share-image` reads the source file.

`fraunces.ttf` in this folder is the source file with no change. No page of the site loads it, and
the build does not copy it.

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

The SVG keeps the glyph outlines and no font data.

## How the title font was made

`tools/title-font.py` writes `public/fonts/fraunces-title.woff2` from `fraunces.ttf`. Its head
comment gives the command with the pinned versions of fontTools and Brotli. Each run gives the
same bytes.

1. The script stops when the SHA-256 of `fraunces.ttf` differs from the value of the table above.
2. The instancer of fontTools pins the four axes at `wght=600,SOFT=100,WONK=0,opsz=72`. The
   instance has no wonky letters, so the titles read easily. The names of the instance come from
   the table `STAT`, such as "Fraunces 72pt SuperSoft SemiBold NonWonky".
3. The subsetter keeps Basic Latin, Latin-1 Supplement, Latin Extended-A, and the punctuation and
   the symbols of `UNICODES` in the script, with the kerning and the ligatures. It removes the
   hinting.
4. The name table keeps the copyright and the license with its URL (name IDs 0 and 13 to 14).

Fraunces has no flat sign (♭) and no sharp sign (♯). A title with one of them takes that glyph
from the fallback face of `src/ui/ui.css`.

`--fallback <font file>` also prints the descriptors of the fallback face for a local font:
`size-adjust` from the mean advance of the demo titles, and the line metrics of Fraunces in the
units of the adjusted fallback. The values of `src/ui/ui.css` come from Georgia Bold of macOS
(`/System/Library/Fonts/Supplemental/Georgia Bold.ttf`).

## License

The site holds a changed version of the Font Software: the static subset. The OFL permits this,
because the font has no Reserved Font Name. The file keeps the copyright and the license in its
name table, and the license file of the site (design 7.3) holds the full license text. The
repository holds the source in `fraunces.ttf`, with `LICENSE.txt` beside it.
