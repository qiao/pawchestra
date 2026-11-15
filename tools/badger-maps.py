# Writes the web color map and the web normal map of the Tripo badger from the maps of its FBX
# (design 4.5, assets/models/badger/README.md, "Maps"). The color map is the source image at 2048
# pixels with fur strands (STRANDS): each color takes a small luma step along the strands, and the
# hue stays. The eye paint stays as the FBX shows it, and the eyeballs keep their colors. The
# normal map adds the slope of the same strands to the tilts of the source, with no tilt of the
# source on the back of the neck (FLAT). The output depends only on the input files, the eyes and
# the triangles of the rig file, and cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/badger-maps.py
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402
from fur_maps import (  # noqa: E402
    NORMAL_SIZE, SIZE, linear, normal_map, srgb8, strand_tilts, strands,
)

SOURCE = 'assets/models/badger/tripo-p2/badger.fbm/badger_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/badger/tripo-p2/badger.fbm/badger_normal.jpg'
RIG = 'assets/models/badger/tripo-hand/badger.rig.glb'
COLOR_OUT = 'assets/models/badger/tripo-hand/badger-color.webp'
NORMAL_OUT = 'assets/models/badger/tripo-hand/badger-normal.webp'
QUALITY = 60
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4
#: The fur strands that the maps add (`strands()`), with the soft values of tools/fox-maps.py. The
#: normal map of the Tripo badger source is smooth: its median tilt at 1024 pixels is 0.012,
#: against 0.023 to 0.028 on the Tripo cat, wolf, and rabbit, so its fur shows few strands in the
#: app. The strands follow the direction of the faint strokes of the source maps, and they have
#: the scale of the strands of the other maps (a wavelength of 8 to 10 texels at 1024 pixels
#: across the strands).
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
    #: The root mean square of the x, y tilt of the strands in the normal map.
    'tilt': 0.03,
    #: The luma factor of the strands in the color map, for each standard deviation of the height:
    #: a strand crest is lighter, and a groove darker.
    'luma': 0.08,
    #: The largest height of a strand, in standard deviations.
    'clip': 2.5,
}
#: The back of the neck and the top of the back, where the normal map of the source paints a
#: crumpled pattern of small bumps: the triangles of the rig file with the middle at |x| below
#: `side`, y from `above` to `below`, and z below `behind`, and a normal with z below `facing` (the
#: studio units and axes of the bind: y up, +z forward). In the warm light, the bumps showed as red
#: and brown dots behind a raised left arm. The texels of these triangles take no tilt of the
#: source, only the tilt of the strands. The area grows by `grow` texels at NORMAL_SIZE, so that the
#: bilinear samples at the edges of its triangles take no bump, and then takes a soft edge of
#: `feather` texels.
FLAT = {
    'side': 0.13,
    'above': 0.5,
    'below': 0.86,
    'behind': -0.1,
    'facing': -0.45,
    'grow': 2,
    'feather': 1.5,
}


def strand_color(image, height, rig):
    """Gives the color map with the strands: each linear color times 1 + `luma` times the height.
    The eyeballs keep their colors."""
    lin = linear(np.asarray(image))
    factor = 1 + STRANDS['luma'] * height
    factor[gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)] = 1
    return Image.fromarray(srgb8(lin * factor[..., None]))


def flat_mask(rig):
    """Gives the share of the source tilt that each texel of the normal map loses (FLAT): 1 on
    the texels of the chosen triangles grown by `grow` texels, with a Gaussian edge of `feather`
    texels."""
    triangles, positions, points, _ = rig
    corners = positions[triangles]
    mid = corners.mean(axis=1)
    normal = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    normal /= np.linalg.norm(normal, axis=1)[:, None] + 1e-12
    f = FLAT
    chosen = (np.abs(mid[:, 0]) < f['side']) & (mid[:, 1] > f['above']) & (mid[:, 1] < f['below'])
    chosen &= (mid[:, 2] < f['behind']) & (normal[:, 2] < f['facing'])
    mask = Image.new('L', (NORMAL_SIZE, NORMAL_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    for t in np.nonzero(chosen)[0]:
        draw.polygon(
            [(float(u) * NORMAL_SIZE, float(v) * NORMAL_SIZE) for u, v in points[triangles[t]]],
            fill=255,
        )
    mask = mask.filter(ImageFilter.MaxFilter(2 * f['grow'] + 1))
    share = np.asarray(mask.filter(ImageFilter.GaussianBlur(f['feather']))).astype(np.float64) / 255
    print(f'flat: {int(chosen.sum())} triangles, {int((share > 0.5).sum())} texels')
    return share


def main():
    which = sys.argv[1:] or ['color', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    height = strands(image, NORMAL_SOURCE, STRANDS)
    image = strand_color(image, height, rig)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        tilts = strand_tilts(height, STRANDS['tilt'])
        normal_map(NORMAL_SOURCE, NORMAL_OUT, tilts, flat=flat_mask(rig))


if __name__ == '__main__':
    main()
