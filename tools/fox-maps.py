# Writes the web maps of the Tripo fox from the maps of its FBX (design 4.5,
# assets/models/fox/README.md, "Color map", "Tan color map", and "Normal map"):
# `fox-color.webp` for the red fox, `fox-tan-color.webp` for the tan fox, and `fox-normal.webp`,
# which both foxes share. The red map is the source image at 2048 pixels with fur strands
# (STRANDS): each color takes a small luma step along the strands, and the hue stays. The brows
# and the eye paint stay as the FBX shows them, and the eyeballs keep their colors. The normal map
# adds the slope of the same strands to the tilts of the source. The tan map is the red map with
# one step of the lightness and the hue of the orange fur only (TAN_STEP). The cream, the socks,
# the dark lines, and the eyeballs keep the colors of the red map, and each fur texel keeps its
# step from the other fur texels, so the strands stay. The output depends only on the input files
# and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    SIZE, linear, linear_of_oklab, normal_map, oklab, smoothstep, srgb8, strand_tilts, strands,
)

SOURCE = 'assets/models/fox/tripo-p2/fox.fbm/fox_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/fox/tripo-p2/fox.fbm/fox_normal.jpg'
RIG = 'assets/models/fox/tripo-hand/fox.rig.glb'
COLOR_OUT = 'assets/models/fox/tripo-hand/fox-color.webp'
TAN_OUT = 'assets/models/fox/tripo-hand/fox-tan-color.webp'
NORMAL_OUT = 'assets/models/fox/tripo-hand/fox-normal.webp'
QUALITY = 60
#: The step of the orange fur in the tan map: the Oklab lightness step, the hue step in degrees,
#: and the chroma factor. The orange fur of the red map has the median Oklab L 0.612, C 0.166, and
#: h 46.0.
TAN_STEP = (0.06, 18.0, 1.0)
#: The share of the step of a texel: a smoothstep of the Oklab chroma (C_RAMP), times 1 minus a
#: smoothstep of the lightness (L_RAMP, the cream lies above), times 1 minus a smoothstep of the
#: distance of the hue from the hue of the fur (H_MID, H_RAMP in degrees). The cream (L 0.82, C 0.08
#: to 0.12), the socks and the lines (C below 0.08), and the white take no step.
C_RAMP = (0.09, 0.13)
L_RAMP = (0.76, 0.82)
H_MID = 50.0
H_RAMP = (15.0, 25.0)
#: The texels of the eyeballs and this many texels around them keep their colors in the tan map.
EYE_MARGIN = 4
#: The gaze shift of the eyes (tools/gaze_shift.py): the view in degrees above the forward axis of
#: the head of the seated bind in which each iris lies in the middle of its eye opening, and the
#: turn of each target out and up from that middle, in degrees. GAZE_SHIFT turns the shift on. It
#: is off: the source paints each iris where the gaze reads at the viewer in the play view and from
#: the default camera.
VIEW_DOWN = 30.0
GAZE_OUT = 4.0
GAZE_UP = 0.0
GAZE_SHIFT = False
#: The fur strands that the maps add (`strands()`). The color map and the normal map of the Tripo
#: fox source are painted smooth: the median tilt of the normal map is 0.006, against 0.023 to 0.028
#: on the Tripo cat, wolf, and rabbit, and the strand contrast of the color map is a third of that
#: of the wolf (assets/models/fox/README.md, "Fur strands"). So the fur of the fox shows no strands
#: in the app. The strands follow the direction of
#: the faint strokes of the source maps, and they have the scale of the strands of the other maps
#: (a wavelength of 8 to 10 texels at 1024 pixels across the strands).
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


def tan_map(image, rig):
    """Writes the tan map: each texel of the orange fur moves in Oklab by its share of TAN_STEP. A
    texel that leaves the sRGB gamut takes the largest chroma in the gamut at its new lightness and
    hue."""
    lab = oklab(linear(np.asarray(image)))
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a))
    dh = np.abs((h - H_MID + 180) % 360 - 180)
    share = (smoothstep(*C_RAMP, C) * (1 - smoothstep(*L_RAMP, L)) * (1 - smoothstep(*H_RAMP, dh)))
    share[gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)] = 0
    dl, dhue, kc = TAN_STEP
    L2 = L + share * dl
    h2 = np.radians(h + share * dhue)
    C2 = C * (1 + share * (kc - 1))
    k = np.ones_like(C2)
    for _ in range(40):
        lin = linear_of_oklab(np.stack([L2, k * C2 * np.cos(h2), k * C2 * np.sin(h2)], -1))
        out = ((lin < -1e-4) | (lin > 1 + 1e-4)).any(-1)
        if not out.any():
            break
        k[out] *= 0.97
    lin = linear_of_oklab(np.stack([L2, k * C2 * np.cos(h2), k * C2 * np.sin(h2)], -1))
    Image.fromarray(srgb8(lin)).save(TAN_OUT, 'WEBP', quality=QUALITY, method=6)
    fur = share > 0.5
    lab2 = oklab(lin)
    c2 = np.hypot(lab2[..., 1], lab2[..., 2])
    h3 = np.degrees(np.arctan2(lab2[..., 2], lab2[..., 1]))
    print(f'{TAN_OUT}: {SIZE} x {SIZE}, {os.path.getsize(TAN_OUT)} bytes, {fur.mean() * 100:.1f} % '
          f'of the texels are orange fur (share above 0.5); their median Oklab L, C, h go from '
          f'{np.median(L[fur]):.3f}, {np.median(C[fur]):.3f}, {np.median(h[fur]):.1f} to '
          f'{np.median(lab2[..., 0][fur]):.3f}, {np.median(c2[fur]):.3f}, {np.median(h3[fur]):.1f}')


def strand_color(image, height, rig):
    """Gives the color map with the strands: each linear color times 1 + `luma` times the height.
    The eyeballs keep their colors."""
    lin = linear(np.asarray(image))
    factor = 1 + STRANDS['luma'] * height
    factor[gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)] = 1
    return Image.fromarray(srgb8(lin * factor[..., None]))


def main():
    which = sys.argv[1:] or ['color', 'tan', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    if GAZE_SHIFT:
        image = gaze_shift.shift_gaze(rig, image, VIEW_DOWN, GAZE_OUT, GAZE_UP)
    height = strands(image, NORMAL_SOURCE, STRANDS)
    image = strand_color(image, height, rig)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'tan' in which:
        tan_map(image, rig)
    if 'normal' in which:
        normal_map(NORMAL_SOURCE, NORMAL_OUT, strand_tilts(height, STRANDS['tilt']))


if __name__ == '__main__':
    main()
