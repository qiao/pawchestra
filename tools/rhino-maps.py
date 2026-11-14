# Writes the web color map and the web normal map of the Tripo rhino from the maps of its FBX
# (design 4.5, assets/models/rhino/README.md, "Color map" and "Normal map"). The color map is the
# source image at 2048 pixels, with no change of a color: the skin, the ears, the horns, and the
# eye paint stay as the FBX shows them. The normal map limits each tilt of the source, scales it to
# 1024 pixels, and stores the tilts times NORMAL_MAP_GAIN of src/scene/fur.ts. The output depends
# only on the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rhino-maps.py
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

SOURCE = 'assets/models/rhino/tripo-p2/rhino.fbm/rhino_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/rhino/tripo-p2/rhino.fbm/rhino_normal.jpg'
COLOR_OUT = 'assets/models/rhino/tripo-hand/rhino-color.webp'
NORMAL_OUT = 'assets/models/rhino/tripo-hand/rhino-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60
#: The largest length of the x, y tilt of a normal of the source, and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts). A larger tilt is a baked edge of the source mesh.
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4


def color_map():
    """Writes the color map: the source scaled to SIZE (Lanczos), WebP quality QUALITY, method 6."""
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')


def normal_map():
    """Writes the normal map of the fur: each x, y tilt of the source limited to the length
    NORMAL_LIMIT, a box scale to NORMAL_SIZE, then the tilts times NORMAL_GAIN in red and green,
    255 in blue (the shader does not read it), and cwebp -q 60 -sharp_yuv -m 6. The limit comes
    before the gain, so that no stored value clips."""
    a = np.asarray(Image.open(NORMAL_SOURCE).convert('RGB')).astype(np.float64) / 255 * 2 - 1
    t = a[..., :2].copy()
    length = np.linalg.norm(t, axis=-1)
    over = length > NORMAL_LIMIT
    t[over] *= (NORMAL_LIMIT / length[over])[:, None]
    k = t.shape[0] // NORMAL_SIZE
    small = t.reshape(NORMAL_SIZE, k, NORMAL_SIZE, k, 2).mean(axis=(1, 3))
    v = np.clip(small * NORMAL_GAIN, -1, 1)
    rgb = np.zeros((NORMAL_SIZE, NORMAL_SIZE, 3), np.uint8)
    rgb[..., :2] = np.round((v + 1) / 2 * 255).astype(np.uint8)
    rgb[..., 2] = 255
    with tempfile.TemporaryDirectory() as folder:
        png = os.path.join(folder, 'normal.png')
        Image.fromarray(rgb).save(png)
        subprocess.run(
            ['cwebp', '-quiet', '-q', '60', '-sharp_yuv', '-m', '6', png, '-o', NORMAL_OUT],
            check=True,
        )
    print(
        f'{NORMAL_OUT}: {NORMAL_SIZE} x {NORMAL_SIZE}, {over.mean() * 100:.2f} % of the source '
        f'tilts limited, mean normal {np.round(a.reshape(-1, 3).mean(axis=0), 3).tolist()}'
    )


def main():
    which = sys.argv[1:] or ['color', 'normal']
    if 'color' in which:
        color_map()
    if 'normal' in which:
        normal_map()


if __name__ == '__main__':
    main()
