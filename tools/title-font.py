# Writes the font of the piece title, `public/fonts/fraunces-title.woff2`, from the variable font
# `assets/fraunces/fraunces.ttf` (design 2.8, assets/fraunces/README.md). The steps:
#
#   1. Stop when the SHA-256 of the source differs from the value of the README.
#   2. Pin each axis of the variable font to one value (`INSTANCE`), so the output is static.
#   3. Keep only the glyphs of `UNICODES`, with their kerning and their ligatures.
#   4. Keep the copyright and the license in the name table, and remove the hinting.
#   5. Write WOFF2 with no time stamp change, so each run gives the same bytes.
#
# With `--fallback <font file>`, the script also prints the descriptors of the fallback face of
# `src/ui/ui.css` for that local font: `size-adjust` from the mean advance of the demo titles, and
# the line metrics of the instance in the units of the adjusted fallback.
#
# Usage: uv run --no-project --with fonttools==4.68.0 --with brotli==1.2.1 python -I
#        tools/title-font.py [--fallback '/System/Library/Fonts/Supplemental/Georgia Bold.ttf']
import hashlib
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = 'assets/fraunces/fraunces.ttf'
SOURCE_SHA256 = '177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb'
OUT = 'public/fonts/fraunces-title.woff2'
DEMOS = 'src/app/demos.ts'

# The instance of the title: the weight and the soft corners of the wordmark, with no wonky
# letters, at the optical size of a display title.
INSTANCE = {'wght': 600, 'SOFT': 100, 'WONK': 0, 'opsz': 72}

# Basic Latin, Latin-1 Supplement, and Latin Extended-A, then the punctuation and the symbols of
# the titles: dashes, quotes, the bullet, the ellipsis, the primes, the angle quotes, the fraction
# slash, the euro sign, the trademark sign, and the minus. Fraunces has no flat sign and no sharp
# sign, so these characters come from the fallback face.
UNICODES = [
    *range(0x20, 0x7F),
    *range(0xA0, 0x100),
    *range(0x100, 0x180),
    0x2010,
    0x2013,
    0x2014,
    0x2018,
    0x2019,
    0x201A,
    0x201C,
    0x201D,
    0x201E,
    0x2022,
    0x2026,
    0x2032,
    0x2033,
    0x2039,
    0x203A,
    0x2044,
    0x20AC,
    0x2122,
    0x2212,
]

# The names to keep: the family and the style names, the version, the trademark, the designer, the
# vendor, and the license with its URL (0 to 9 and 11 to 14).
NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14]


def check_source():
    with open(SOURCE, 'rb') as file:
        digest = hashlib.sha256(file.read()).hexdigest()
    if digest != SOURCE_SHA256:
        sys.exit(f'{SOURCE} has the SHA-256 {digest}, and the README gives {SOURCE_SHA256}.')


def make_instance():
    font = TTFont(SOURCE)
    axes = {axis.axisTag for axis in font['fvar'].axes}
    if axes != set(INSTANCE):
        sys.exit(f'{SOURCE} has the axes {sorted(axes)}, and the script pins {sorted(INSTANCE)}.')
    return instancer.instantiateVariableFont(font, INSTANCE, updateFontNames=True)


def make_subset(font):
    options = subset.Options()
    options.flavor = 'woff2'
    options.hinting = False
    options.name_IDs = NAME_IDS
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.flavor = 'woff2'
    # The source time stamp stays, so each run gives the same bytes.
    font.recalcTimestamp = False
    font.save(OUT)


def demo_titles():
    with open(DEMOS, encoding='utf-8') as file:
        text = file.read()
    return re.findall(r"^\s+title: (?:'([^']*)'|\"([^\"]*)\"),$", text, re.MULTILINE)


def mean_advance(font, text):
    cmap = font.getBestCmap()
    metrics = font['hmtx'].metrics
    advances = [metrics[cmap[ord(char)]][0] for char in text if ord(char) in cmap]
    return sum(advances) / len(advances) / font['head'].unitsPerEm


def print_fallback(path):
    title = TTFont(OUT)
    local = TTFont(path)
    text = ''.join(single or double for single, double in demo_titles())
    size_adjust = mean_advance(title, text) / mean_advance(local, text)
    em = title['head'].unitsPerEm
    hhea = title['hhea']
    print(f'fallback {local["name"].getDebugName(4)}, {len(text)} characters of the demo titles')
    print(f'  size-adjust: {size_adjust * 100:.2f}%;')
    print(f'  ascent-override: {hhea.ascent / em / size_adjust * 100:.2f}%;')
    print(f'  descent-override: {-hhea.descent / em / size_adjust * 100:.2f}%;')
    print(f'  line-gap-override: {hhea.lineGap / em / size_adjust * 100:.2f}%;')


check_source()
make_subset(make_instance())
with open(OUT, 'rb') as file:
    data = file.read()
print(f'{OUT}: {len(data)} B, SHA-256 {hashlib.sha256(data).hexdigest()}')
print(f'  glyphs {len(TTFont(OUT).getGlyphOrder())}, instance {INSTANCE}')
if '--fallback' in sys.argv:
    print_fallback(sys.argv[sys.argv.index('--fallback') + 1])
