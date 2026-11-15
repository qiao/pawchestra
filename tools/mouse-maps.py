# Writes the web maps of the Tripo mouse from the maps of its FBX (design 4.5,
# assets/models/mouse/README.md, "Maps"): `mouse-color.webp` and `mouse-normal.webp`. The color map
# is the source image at 2048 pixels with fur strands (STRANDS): each color takes a small luma step
# along the strands, and the hue stays. The pink skin (the inner ears, the nose, the paws, the
# feet, and the tail) and the eyeballs take no strands (SKIN, EYE_MARGIN). The normal map adds the
# slope of the same strands to the tilts of the source, with the same skin weight. The output
# depends only on the input files, the rig file of the eyeballs, and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/mouse-maps.py
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    SIZE, linear, normal_map, oklab, smoothstep, srgb8, strand_tilts, strands,
)

SOURCE = 'assets/models/mouse/tripo-p2/mouse.fbm/mouse_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/mouse/tripo-p2/mouse.fbm/mouse_normal.jpg'
RIG = 'assets/models/mouse/tripo-hand/mouse.rig.glb'
COLOR_OUT = 'assets/models/mouse/tripo-hand/mouse-color.webp'
NORMAL_OUT = 'assets/models/mouse/tripo-hand/mouse-normal.webp'
QUALITY = 60
#: The texels of the eyeballs and this many texels around them take no strands.
EYE_MARGIN = 4
#: The fur strands that the maps add (`strands()`), with the soft values of tools/fox-maps.py. The
#: source paints soft strokes in the fur, and the strands give the fur of the app the strands of
#: the other Tripo bodies (a wavelength of 8 to 10 texels at 1024 pixels across the strands).
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

#: The pink skin of the source, which takes no strands: the share of a texel is a smoothstep of
#: the Oklab chroma (C_RAMP) times 1 minus a smoothstep of the distance of the hue from H_MID
#: (H_RAMP, in degrees). The skin of the source has the Oklab C 0.09 to 0.11 and h 31 to 40, and the
#: gray-taupe fur and the cream belly C 0.036 to 0.048 and h 58 to 64.
SKIN = {'C_RAMP': (0.06, 0.08), 'H_MID': 35.0, 'H_RAMP': (12.0, 20.0)}


def skin_share(image):
    """Gives the share of the pink skin of each texel (SKIN), from 0 (fur) to 1 (skin)."""
    lab = oklab(linear(np.asarray(image)))
    C = np.hypot(lab[..., 1], lab[..., 2])
    h = np.degrees(np.arctan2(lab[..., 2], lab[..., 1]))
    dh = np.abs((h - SKIN['H_MID'] + 180) % 360 - 180)
    return smoothstep(*SKIN['C_RAMP'], C) * (1 - smoothstep(*SKIN['H_RAMP'], dh))


def strand_color(image, height):
    """Gives the color map with the strands: each linear color times 1 + `luma` times the height.
    The height of the strands is 0 on the skin and on the eyeballs (`main()`)."""
    lin = linear(np.asarray(image))
    factor = 1 + STRANDS['luma'] * height
    return Image.fromarray(srgb8(lin * factor[..., None]))


def main():
    which = sys.argv[1:] or ['color', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    fur = 1 - skin_share(image)
    fur[gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)] = 0
    height = strands(image, NORMAL_SOURCE, STRANDS) * fur
    print(f'skin share above 0.5: {(fur < 0.5).mean() * 100:.1f} % of the texels')
    image = strand_color(image, height)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        normal_map(NORMAL_SOURCE, NORMAL_OUT, strand_tilts(height, STRANDS['tilt']))


if __name__ == '__main__':
    main()
