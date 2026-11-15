# Writes the web color map and the web normal map of a Tripo body from the maps of its FBX
# (design 4.5, assets/models/<species>/README.md, "Color map" and "Normal map"). The color map is
# the source image at 2048 pixels, with no change of a color: the fur or the skin, the marks, and
# the eye paint stay as the FBX shows them. The normal map limits each tilt of the source, scales
# it to 1024 pixels, and stores the tilts times NORMAL_MAP_GAIN of src/scene/fur.ts. SPECIES gives
# the settings of each species. The output depends only on the input files, the band faces of the
# chain (`bands`), and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py
#     <species> [color] [normal]
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import band_fade  # noqa: E402
from fur_maps import SIZE, normal_map  # noqa: E402

QUALITY = 60
#: The radius in texels at SIZE of the fine color detail that `detail` of a species softens.
DETAIL_RADIUS = 2.0

#: The settings of each species that change the defaults:
#:
#: - `normal`: the file type of the normal map of the source, `jpg` by default.
#: - `tilt` and `detail`: the share of the fine detail of the source that the maps keep: the tilts
#:   of the normal map, and the color detail finer than DETAIL_RADIUS. The full detail of the
#:   beaver and the wolf read as carved grooves in the hall light, so their fur is softer, as on
#:   the fox and the rabbit. By default, the maps keep all the detail.
#: - `bands`: both maps paint the band faces of the turned paws as a fade from the forearm to the
#:   paw (tools/band_fade.py). The build of the chain writes the band faces
#:   (`<species>-bands.json`, `bandFade` of its params). The elephant has them at its stumps.
SPECIES = {
    'beaver': {'tilt': 0.5, 'detail': 0.7},
    'cat': {},
    'deer': {},
    'dog': {},
    'elephant': {'bands': True},
    'hippo': {},
    'monkey': {},
    'panda': {'normal': 'png'},
    'penguin': {},
    'pig': {},
    'rhino': {},
    'wolf': {'tilt': 0.5, 'detail': 0.7},
}


def color_map(species, settings, bands):
    """Writes the color map: the source scaled to SIZE (Lanczos), with the share `detail` of its
    detail finer than DETAIL_RADIUS, the band fade, WebP quality QUALITY, method 6."""
    source = f'assets/models/{species}/tripo-p2/{species}.fbm/{species}_basecolor.jpg'
    out = f'assets/models/{species}/tripo-hand/{species}-color.webp'
    image = Image.open(source).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    if 'detail' in settings:
        sharp = np.asarray(image).astype(np.float64)
        soft = np.asarray(image.filter(ImageFilter.GaussianBlur(DETAIL_RADIUS))).astype(np.float64)
        mixed = soft + settings['detail'] * (sharp - soft)
        image = Image.fromarray(np.clip(np.round(mixed), 0, 255).astype(np.uint8))
    if bands is not None:
        faded, count = band_fade.fade_bands(np.asarray(image).astype(np.float64), bands)
        image = Image.fromarray(np.round(faded).astype(np.uint8))
        print(f'band fade: {len(bands)} band faces, {count} texels at {SIZE}')
    image.save(out, 'WEBP', quality=QUALITY, method=6)
    print(f'{out}: {SIZE} x {SIZE}, {os.path.getsize(out)} bytes')


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in SPECIES:
        raise SystemExit(f'Usage: tools/tripo-maps.py <{"|".join(SPECIES)}> [color] [normal]')
    species = sys.argv[1]
    which = sys.argv[2:] or ['color', 'normal']
    settings = SPECIES[species]
    bands = None
    if settings.get('bands'):
        bands = band_fade.read_bands(f'assets/models/{species}/tripo-hand/{species}-bands.json')
    if 'color' in which:
        color_map(species, settings, bands)
    if 'normal' in which:
        kind = settings.get('normal', 'jpg')
        normal_map(
            f'assets/models/{species}/tripo-p2/{species}.fbm/{species}_normal.{kind}',
            f'assets/models/{species}/tripo-hand/{species}-normal.webp',
            bands=bands,
            share=settings.get('tilt'),
        )


if __name__ == '__main__':
    main()
