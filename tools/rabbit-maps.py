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
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402

SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_normal.jpg'
RIG = 'assets/models/rabbit/tripo-hand/rabbit.rig.glb'
COLOR_OUT = 'assets/models/rabbit/tripo-hand/rabbit-color.webp'
NORMAL_OUT = 'assets/models/rabbit/tripo-hand/rabbit-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60
#: The largest length of the x, y tilt of a normal of the source, and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts). A larger tilt is a baked edge of the source mesh.
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4
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
    #: The half length in texels at SIZE of a strand, and the step of its samples.
    'half_length': 22.0,
    'step': 1.0,
    #: The sigma in texels at SIZE of the blur that the height of the strands loses (a high pass).
    'high_pass_sigma': 10.0,
    #: The root mean square of the x, y tilt of the strands in the normal map.
    'tilt': 0.06,
    #: The luma factor of the strands in the color map, for each standard deviation of the height:
    #: a strand crest is lighter, and a groove darker.
    'luma': 0.16,
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


def blur(a, sigma):
    """Gives a Gaussian blur of a square image (wrapped edges), by the FFT."""
    f = np.fft.fftfreq(a.shape[0])
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def sample(a, y, x):
    """Gives the bilinear samples of an image at the texel points (y, x), with wrapped edges."""
    n = a.shape[0]
    y0, x0 = np.floor(y).astype(np.int64), np.floor(x).astype(np.int64)
    fy, fx = y - y0, x - x0
    y0, x0 = y0 % n, x0 % n
    y1, x1 = (y0 + 1) % n, (x0 + 1) % n
    return ((a[y0, x0] * (1 - fx) + a[y0, x1] * fx) * (1 - fy)
            + (a[y1, x0] * (1 - fx) + a[y1, x1] * fx) * fy)


def strands(image):
    """Gives the height of the fur strands at SIZE, in standard deviations, with the mean 0.

    1. The strand direction of each texel: the direction of least change of the structure tensor
       of the source maps (the luma of the color map and the two tilts of the normal map, each
       over its root mean square gradient), blurred by `direction_sigma`.
    2. White noise (seeded), blurred by `width_sigma`, then summed along the strand direction
       over `half_length` on each side with a Hann weight (a line integral convolution).
    3. A high pass (`high_pass_sigma`), then the scale to one standard deviation."""
    S = STRANDS
    luma = linear(np.asarray(image)) @ np.array([0.2126, 0.7152, 0.0722])
    tilt = np.asarray(Image.open(NORMAL_SOURCE).convert('RGB')).astype(np.float64) / 255 * 2 - 1
    k = tilt.shape[0] // SIZE
    tilt = tilt[..., :2].reshape(SIZE, k, SIZE, k, 2).mean(axis=(1, 3))
    jxx, jxy, jyy = (np.zeros((SIZE, SIZE)) for _ in range(3))
    for channel in (luma, tilt[..., 0], tilt[..., 1]):
        gy, gx = np.gradient(channel)
        norm = np.mean(gx * gx + gy * gy) + 1e-12
        jxx += gx * gx / norm
        jxy += gx * gy / norm
        jyy += gy * gy / norm
    jxx, jxy, jyy = (blur(j, S['direction_sigma']) for j in (jxx, jxy, jyy))
    # The gradient direction is 0.5 atan2(2 jxy, jxx - jyy). The strands run square to it.
    angle = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2
    dx, dy = np.cos(angle), np.sin(angle)
    noise = blur(np.random.default_rng(S['seed']).standard_normal((SIZE, SIZE)), S['width_sigma'])
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float64)
    height = np.zeros((SIZE, SIZE))
    total = 0.0
    steps = int(S['half_length'] / S['step'])
    for i in range(-steps, steps + 1):
        t = i * S['step']
        w = 0.5 + 0.5 * np.cos(np.pi * t / (S['half_length'] + S['step']))
        height += w * sample(noise, yy + t * dy, xx + t * dx)
        total += w
    height /= total
    height -= blur(height, S['high_pass_sigma'])
    height /= height.std()
    return np.clip(height, -S['clip'], S['clip'])


def strand_color(image, height):
    """Gives the color map with the strands: each linear color times 1 + `luma` times the height.
    The height of the strands is 0 on the skin and on the eyeballs (`main()`)."""
    lin = linear(np.asarray(image))
    factor = 1 + STRANDS['luma'] * height
    return Image.fromarray(srgb8(lin * factor[..., None]))


def strand_tilts(height):
    """Gives the x, y tilts of the strands at NORMAL_SIZE: the slope of the height, with the root
    mean square tilt `tilt`. The y tilt points up in the image (+v of OpenGL)."""
    gy, gx = np.gradient(height)
    t = np.stack([-gx, gy], -1)
    k = SIZE // NORMAL_SIZE
    t = t.reshape(NORMAL_SIZE, k, NORMAL_SIZE, k, 2).mean(axis=(1, 3))
    return t * (STRANDS['tilt'] / np.sqrt((t ** 2).sum(-1).mean()))


def normal_map(extra=None):
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
    if extra is not None:
        small = small + extra
        length = np.linalg.norm(small, axis=-1)
        over2 = length > NORMAL_LIMIT
        small[over2] *= (NORMAL_LIMIT / length[over2])[:, None]
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
    which = sys.argv[1:] or ['color', 'normal']
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = gaze_shift.read_rig(RIG)
    fur = 1 - skin_share(image)
    fur[gaze_shift.eye_mask(rig, SIZE, EYE_MARGIN)] = 0
    height = strands(image) * fur
    image = fur_tone(image, fur)
    print(f'skin share above 0.5: {(fur < 0.5).mean() * 100:.1f} % of the texels')
    image = strand_color(image, height)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        normal_map(strand_tilts(height))


if __name__ == '__main__':
    main()
