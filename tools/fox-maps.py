# Writes the web maps of the Tripo fox from the maps of its FBX (design 4.5,
# assets/models/fox/README.md, "Color map", "Tan color map", and "Normal map"):
# `fox-color.webp` for the red fox, `fox-tan-color.webp` for the tan fox, and `fox-normal.webp`,
# which both foxes share. The red map is the source image at 2048 pixels, with no change of a
# color: the fur, the brows, and the eye paint stay as the FBX shows them, as on the Tripo wolf
# (tools/wolf-maps.py). The tan map is the red map with one step of the lightness and the hue of
# the orange fur only (TAN_STEP). The cream, the socks, the dark lines, and the eyeballs keep the
# colors of the source, and each fur texel keeps its step from the other fur texels, so the strands
# stay. The output depends only on the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402

SOURCE = 'assets/models/fox/tripo-p2/fox.fbm/fox_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/fox/tripo-p2/fox.fbm/fox_normal.jpg'
RIG = 'assets/models/fox/tripo-hand/fox.rig.glb'
COLOR_OUT = 'assets/models/fox/tripo-hand/fox-color.webp'
TAN_OUT = 'assets/models/fox/tripo-hand/fox-tan-color.webp'
NORMAL_OUT = 'assets/models/fox/tripo-hand/fox-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60
#: The largest length of the x, y tilt of a normal of the source, and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts). A larger tilt is a baked edge of the source mesh.
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4
#: The step of the orange fur in the tan map: the Oklab lightness step, the hue step in degrees,
#: and the chroma factor. The orange fur of the source has the median Oklab L 0.629, C 0.165, and
#: h 48.2.
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
#: is off: the source of the fox with four-digit paws paints each iris where the gaze reads at the
#: viewer in the play view and from the default camera.
VIEW_DOWN = 30.0
GAZE_OUT = 4.0
GAZE_UP = 0.0
GAZE_SHIFT = False


def linear(srgb):
    c = np.asarray(srgb, np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb8(lin):
    c = np.clip(lin, 0.0, 1.0)
    c = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.round(c * 255.0).astype(np.uint8)


def oklab(lin):
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return np.cbrt(lin @ m1.T) @ m2.T


def linear_of_oklab(lab):
    m1 = np.array([[1.0, 0.3963377774, 0.2158037573],
                   [1.0, -0.1055613458, -0.0638541728],
                   [1.0, -0.0894841775, -1.2914855480]])
    m2 = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                   [-1.2684380046, 2.6097574011, -0.3413193965],
                   [-0.0041960863, -0.7034186147, 1.7076147010]])
    return ((lab @ m1.T) ** 3) @ m2.T


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


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
        subprocess.run(['cwebp', '-quiet', '-q', '60', '-sharp_yuv', '-m', '6', png, '-o', NORMAL_OUT],
                       check=True)
    print(f'{NORMAL_OUT}: {NORMAL_SIZE} x {NORMAL_SIZE}, {over.mean() * 100:.2f} % of the source '
          f'tilts limited, mean normal {np.round(a.reshape(-1, 3).mean(axis=0), 3).tolist()}')


def main():
    which = sys.argv[1:] or ['color', 'tan', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    if GAZE_SHIFT:
        image = gaze_shift.shift_gaze(rig, image, VIEW_DOWN, GAZE_OUT, GAZE_UP)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'tan' in which:
        tan_map(image, rig)
    if 'normal' in which:
        normal_map()


if __name__ == '__main__':
    main()
