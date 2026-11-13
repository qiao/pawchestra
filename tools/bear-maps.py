# Writes the web color map and the web normal map of the Tripo bear from the maps of its FBX
# (design 4.5, assets/models/bear/README.md, "Maps"). The color map is the source image at 2048
# pixels with fur strands (STRANDS): each color takes a small luma step along the strands, and the
# hue stays. Then each texel takes the Oklab lightness LIGHTNESS times its lightness. The eye paint stays as the FBX shows it, and the eyeballs keep their colors. The
# normal map adds the slope of the same strands to the tilts of the source. The output depends
# only on the input files, the eyes of the rig file, and cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/bear-maps.py
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402

SOURCE = 'assets/models/bear/tripo-p2/bear.fbm/bear_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/bear/tripo-p2/bear.fbm/bear_normal.jpg'
RIG = 'assets/models/bear/tripo-hand/bear.rig.glb'
COLOR_OUT = 'assets/models/bear/tripo-hand/bear-color.webp'
NORMAL_OUT = 'assets/models/bear/tripo-hand/bear-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60
#: The largest length of the x, y tilt of a normal of the source, and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts). A larger tilt is a baked edge of the source mesh.
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4
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


def linear(srgb):
    c = np.asarray(srgb, np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb8(lin):
    c = np.clip(lin, 0.0, 1.0)
    c = np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
    return np.round(c * 255.0).astype(np.uint8)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


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
    height = strands(image)
    image = strand_color(image, height, rig)
    if 'color' in which:
        image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
        print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')
    if 'normal' in which:
        normal_map(strand_tilts(height))


if __name__ == '__main__':
    main()
