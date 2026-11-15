# Writes the web color map and the web normal map of the Tripo bear from the maps of its FBX
# (design 4.5, assets/models/bear/README.md, "Maps"). The color map is the source image at 2048
# pixels with fur strands (STRANDS): each color takes a small luma step along the strands, and the
# hue stays. Then each texel takes the Oklab lightness LIGHTNESS times its lightness. The eye paint stays as the FBX shows it, and the eyeballs keep their colors. The
# normal map adds the slope of the same strands to the tilts of the source. The output depends
# only on the input files, the eyes of the rig file, the band faces of the chain (BANDS), and
# cwebp 1.5.0. Both maps paint the band faces of the turned paws as a fade from the forearm fur to
# the paw fur (tools/band_fade.py).
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/bear-maps.py
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import band_fade  # noqa: E402
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    SIZE, linear, linear_of_oklab, normal_map, oklab, srgb8, strand_tilts, strands,
)

SOURCE = 'assets/models/bear/tripo-p2/bear.fbm/bear_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/bear/tripo-p2/bear.fbm/bear_normal.jpg'
RIG = 'assets/models/bear/tripo-hand/bear.rig.glb'
COLOR_OUT = 'assets/models/bear/tripo-hand/bear-color.webp'
NORMAL_OUT = 'assets/models/bear/tripo-hand/bear-normal.webp'
#: The band faces of the paw turns, from the build of the chain (`bandFade` of its params).
BANDS = 'assets/models/bear/tripo-hand/bear-bands.json'
QUALITY = 60
#: The factor of the Oklab lightness of each texel, except the eyeballs. The key light of the hall
#: makes the fur lighter than the source: with the source colors, the median fur of the back of
#: the conductor had the Oklab L 0.637 in the hall view with no fill light, against the L 0.531 of
#: the source fur (sRGB 159, 86, 32). With the factor, the hall view gives L 0.561, and the chroma
#: and the hue of the map stay.
LIGHTNESS = 0.87
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4
#: The fur strands that the maps add (`strands()`), with the soft values of tools/badger-maps.py. The
#: maps of the Tripo bear source are smooth (assets/models/bear/README.md, "Maps"), so its fur
#: shows few strands in the app. The strands follow the direction of the faint strokes of the source maps, and they have
#: the scale of the strands of the other maps (a wavelength of 8 to 10 texels at 1024 pixels
#: across the strands).
STRANDS = {
    #: The seed of the noise of the strands.
    'seed': 7,
    #: The sigma in texels at SIZE of the blur of the structure tensor (the strand direction).
    'direction_sigma': 24.0,
    #: The sigma in texels at SIZE of the blur of the noise: the width of a strand.
    'width_sigma': 1.4,
    #: The half length in texels at SIZE of a strand, and the step of its samples.
    'half_length': 11.0,
    'step': 1.0,
    #: The sigma in texels at SIZE of the blur that the height of the strands loses (a high pass).
    'high_pass_sigma': 10.0,
    #: The root mean square of the x, y tilt of the strands in the normal map.
    'tilt': 0.03,
    #: The luma factor of the strands in the color map, for each standard deviation of the height:
    #: a strand crest is lighter, and a groove darker.
    'luma': 0.08,
    #: The largest height of a strand, in standard deviations.
    'clip': 2.5,
}


def strand_color(image, height, rig):
    """Gives the color map with the strands: each linear color times 1 + `luma` times the height,
    then the Oklab lightness times LIGHTNESS. The eyeballs keep their colors."""
    lin = linear(np.asarray(image))
    eyes = gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)
    factor = 1 + STRANDS['luma'] * height
    factor[eyes] = 1
    lab = oklab(lin * factor[..., None])
    lab[~eyes, 0] *= LIGHTNESS
    out = linear_of_oklab(lab)
    out[eyes] = lin[eyes]
    return Image.fromarray(srgb8(out))


def main():
    which = sys.argv[1:] or ['color', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    height = strands(image, NORMAL_SOURCE, STRANDS)
    image = strand_color(image, height, rig)
    bands = band_fade.read_bands(BANDS)
    faded, count = band_fade.fade_bands(np.asarray(image).astype(np.float64), bands)
    image = Image.fromarray(np.round(faded).astype(np.uint8))
    print(f'band fade: {len(bands)} band faces, {count} texels at {SIZE}')
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        normal_map(NORMAL_SOURCE, NORMAL_OUT, strand_tilts(height, STRANDS['tilt']), bands=bands)


if __name__ == '__main__':
    main()
