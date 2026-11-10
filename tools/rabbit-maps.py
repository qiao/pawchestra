# Writes the color map and the normal map of the Tripo rabbit from the maps of its FBX (design 4.5,
# assets/models/rabbit/README.md, "Color map" and "Normal map"). The color map `rabbit-color.webp`
# scales the source image to 2048 pixels and moves each texel in Oklab by a step: the cream fur
# goes to the fur of the rabbit of main in the hall light, and the pink, the brown brows, the
# white, and the black keep their colors. Each texel takes a mix of the steps of the colors, by its
# nearness to each color, so the blend between two colors stays smooth. The texels of the eyeballs
# keep their colors: the script reads their triangles and texture points from the rig file
# (`ownEyes` of the export). The normal map `rabbit-normal.webp` holds the tilts of the fur. The
# output depends only on the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
import json
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg'
RIG = 'assets/models/rabbit/tripo-hand/rabbit.rig.glb'
FOLDER = 'assets/models/rabbit/tripo-hand/'
OUT = FOLDER + 'rabbit-color.webp'
SIZE = 2048
QUALITY = 60
#: The normal map of the source and the web copy of the normal map of the fur.
NORMAL_SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_normal.jpg'
NORMAL_OUT = FOLDER + 'rabbit-normal.webp'
#: The size of the normal map, its largest tilt (x, y), and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts).
NORMAL_SIZE = 1024
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4

#: The Oklab lightness, chroma, and hue (degrees) of the cream fur of the map. The hall view of the
#: app (the key light from the back, no fill light) is the target ("Color map" of the README).
FUR = (0.87, 0.045, 70.0)
#: The colors of the map (sRGB, the median texel of each region) and the colors that take their
#: place. A target is an sRGB color, or ('oklch', L, C, h).
ANCHORS = (
    ((222, 189, 155), ('oklch', *FUR)),  # the cream fur
    ((222, 161, 132), (222, 161, 132)),  # the pink inner ears, nose, and paw pads
    ((255, 255, 255), (255, 255, 255)),  # the white lights
    ((20, 14, 10), (20, 14, 10)),  # the black lines
)
#: The pairs of anchors with a blend between them in the map: the fur to the pink and to the
#: white. Each pair gets two more anchors at 1/3 and 2/3 of the way, in Oklab, with the same blend
#: of the new colors.
BLENDS = ((0, 1), (0, 2))
#: The Oklab distance at which the share of an anchor falls to 1/e.
SPREAD = 0.06
#: The smallest chroma of an anchor for the hue step (see move_texels()).
MIN_CHROMA = 0.02
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4


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


def read_rig(path):
    """Gives the triangles, the texture points, and the eyes (`ownEyes`) of the fur primitive of
    the rig file."""
    data = open(path, 'rb').read()
    length = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + length])
    binary = data[20 + length + 8:]
    fur = gltf['meshes'][0]['primitives'][0]
    if gltf['materials'][fur['material']]['name'] != 'fur' or 'TEXCOORD_0' not in fur['attributes']:
        sys.exit(f'{path} has no fur primitive with texture points.')

    def read(index, dtype, width):
        accessor = gltf['accessors'][index]
        view = gltf['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        count = accessor['count'] * width
        return np.frombuffer(binary, dtype, count, start).reshape(-1, width)

    kinds = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
    triangles = read(fur['indices'], kinds[gltf['accessors'][fur['indices']]['componentType']], 1)
    points = read(fur['attributes']['TEXCOORD_0'], np.float32, 2)
    eyes = gltf['asset']['extras'].get('ownEyes')
    if not eyes:
        sys.exit(f'{path} has no eyes of the mesh.')
    return triangles.reshape(-1, 3), points, eyes


def eye_mask(rig, size):
    """Gives the texels of the eyeball triangles of the rig file, grown by EYE_MARGIN texels."""
    triangles, points, eyes = rig
    faces = [t for side in ('L', 'R') for t in eyes[side]['faces']]
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for t in faces:
        corners = points[triangles[t]] * size
        draw.polygon([(float(u), float(v)) for u, v in corners], fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


def target_lab(target):
    """Gives the Oklab color of a target: an sRGB color, or ('oklch', L, C, h)."""
    if target[0] == 'oklch':
        _, lightness, chroma, hue = target
        h = np.radians(hue)
        return np.array([lightness, chroma * np.cos(h), chroma * np.sin(h)])
    return oklab(linear(target))


def move_texels(lab):
    """Gives the Oklab image with each texel moved by the steps of the anchors."""
    pairs = [(oklab(linear(source)), target_lab(target)) for source, target in ANCHORS]
    for i, j in BLENDS:
        for f in (1 / 3, 2 / 3):
            pairs.append(tuple(a + f * (b - a) for a, b in zip(pairs[i], pairs[j])))
    shares = []
    steps = []
    for anchor, target in pairs:
        distance = np.linalg.norm(lab - anchor, axis=-1)
        shares.append(np.exp(-((distance / SPREAD) ** 2)))
        steps.append(target - anchor)
    shares = np.stack(shares, axis=-1)
    # A texel far from each color takes the step of its nearest color.
    nearest = np.argmax(shares, axis=-1)
    shares[np.arange(SIZE)[:, None], np.arange(SIZE)[None, :], nearest] += 1e-12
    shares /= shares.sum(axis=-1, keepdims=True)
    texel_chroma = np.hypot(lab[..., 1], lab[..., 2])
    moved = lab.copy()
    for k, ((anchor, _), step) in enumerate(zip(pairs, steps)):
        # The hue step of an anchor shrinks with the chroma of the texel below the chroma of the
        # anchor, so a gray or pale texel does not turn green or blue.
        hue = np.minimum(1.0, texel_chroma / max(np.hypot(anchor[1], anchor[2]), MIN_CHROMA))
        moved[..., 0] += shares[..., k] * step[0]
        moved[..., 1] += shares[..., k] * hue * step[1]
        moved[..., 2] += shares[..., k] * hue * step[2]
    return moved


def write_color_map():
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    lab = oklab(linear(np.asarray(image)))
    eyes, count = eye_mask(read_rig(RIG), SIZE)
    moved = move_texels(lab)
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(OUT, 'WEBP', quality=QUALITY, method=6)
    changed = np.abs(out.astype(int) - np.asarray(image).astype(int)).max(axis=-1) > 2
    print(f'{OUT}: {SIZE} x {SIZE}, {count} eye triangles kept ({int(eyes.sum())} texels), '
          f'{changed.mean() * 100:.1f} % of the texels moved')


def write_normal_map():
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
          f'tilts limited, mean normal {np.round(a.reshape(-1, 3).mean(axis=0), 3).tolist()}, '
          f'{int((a[..., 2] < 0).sum())} texels with z below 0')


def main():
    write_color_map()
    write_normal_map()


if __name__ == '__main__':
    main()
