# Writes the web maps of the Tripo rabbit from the maps of its FBX (design 4.5,
# assets/models/rabbit/README.md, "Maps"): `rabbit-color.webp` and `rabbit-normal.webp`. The color
# map is the source image at 2048 pixels with the white fur of the sheet (FUR_CHROMA) and fur
# strands (STRANDS): each color takes a small luma step along the strands, and the hue stays. The
# pink skin (the inner ears, the nose, and the paw pads) and the eyeballs keep their color and take
# no strands (SKIN, EYE_MARGIN). The normal map adds the slope of the same strands to the tilts of
# the source, with the same skin weight. The output depends only on
# the input files, the rig file of the eyeballs, and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    SIZE, linear, linear_of_oklab, normal_map, oklab, smoothstep, srgb8, strand_tilts, strands,
)

SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_normal.jpg'
RIG = 'assets/models/rabbit/tripo-hand/rabbit.rig.glb'
COLOR_OUT = 'assets/models/rabbit/tripo-hand/rabbit-color.webp'
NORMAL_OUT = 'assets/models/rabbit/tripo-hand/rabbit-normal.webp'
QUALITY = 60
#: The texels of the eyeballs and this many texels around them take no strands.
EYE_MARGIN = 4
#: The fur strands that the maps add (`strands()`), with the values of tools/fox-maps.py. The
#: source paints soft strokes in the fur, and the strands give the fur of the app the strands of
#: the other Tripo bodies (a wavelength of 8 to 10 texels at 1024 pixels across the strands).
STRANDS = {
    #: The seed of the noise of the strands.
    'seed': 7,
    #: The sigma in texels at SIZE of the blur of the structure tensor (the strand direction).
    'direction_sigma': 24.0,
    #: The sigma in texels at SIZE of the blur of the noise: the width of a strand.
    'width_sigma': 1.4,
    #: The half length in texels at SIZE of a strand, and the step of its samples. Longer strands
    #: lay long parallel grooves over the body, which read as carved wood or clay.
    'half_length': 11.0,
    'step': 1.0,
    #: The sigma in texels at SIZE of the blur that the height of the strands loses (a high pass).
    'high_pass_sigma': 10.0,
    #: The root mean square of the x, y tilt of the strands in the normal map. The color strands
    #: and the tilts come from one height, so each dark groove of the color map is also a groove of
    #: the normals. The two cues add, so a smaller tilt than the tilts of the Tripo cat and wolf
    #: is sufficient.
    'tilt': 0.03,
    #: The luma factor of the strands in the color map, for each standard deviation of the height:
    #: a strand crest is lighter, and a groove darker.
    'luma': 0.08,
    #: The largest height of a strand, in standard deviations.
    'clip': 2.5,
}

#: The pink skin of the source, which takes no strands: the share of a texel is a smoothstep of
#: the Oklab chroma (C_RAMP) times 1 minus a smoothstep of the distance of the hue from H_MID
#: (H_RAMP, in degrees). The skin of the source has the Oklab C 0.084 to 0.097 and h 37 to 48, and
#: the cream fur C 0.053 to 0.055 and h 69 to 71.
SKIN = {'C_RAMP': (0.065, 0.08), 'H_MID': 42.0, 'H_RAMP': (12.0, 20.0)}

#: The factor of the Oklab chroma of each fur texel (`fur_tone()`). The source paints the fur
#: cream (C 0.055), and the turnaround sheet shows it white (C 0.014 to 0.021). With this factor,
#: the fur of the map has the chroma of the sheet (0.019).
FUR_CHROMA = 0.35


def skin_share(image):
    """Gives the share of the pink skin of each texel (SKIN), from 0 (fur) to 1 (skin)."""
    lab = oklab(linear(np.asarray(image)))
    C = np.hypot(lab[..., 1], lab[..., 2])
    h = np.degrees(np.arctan2(lab[..., 2], lab[..., 1]))
    dh = np.abs((h - SKIN['H_MID'] + 180) % 360 - 180)
    return smoothstep(*SKIN['C_RAMP'], C) * (1 - smoothstep(*SKIN['H_RAMP'], dh))


def fur_tone(image, fur):
    """Gives the color map with the white fur of the sheet: the Oklab chroma of each texel takes the
    factor FUR_CHROMA by its fur share (1 on the fur, 0 on the skin and on the eyeballs). The
    lightness and the hue stay."""
    lab = oklab(linear(np.asarray(image)))
    lab[..., 1:] *= 1 + fur[..., None] * (FUR_CHROMA - 1)
    return Image.fromarray(srgb8(linear_of_oklab(lab)))


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
    image = fur_tone(image, fur)
    print(f'skin share above 0.5: {(fur < 0.5).mean() * 100:.1f} % of the texels')
    image = strand_color(image, height)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        normal_map(NORMAL_SOURCE, NORMAL_OUT, strand_tilts(height, STRANDS['tilt']))


if __name__ == '__main__':
    main()
