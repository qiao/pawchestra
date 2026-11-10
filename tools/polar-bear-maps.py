# Writes the web color map and the web normal map of the Tripo polar bear from the maps of its FBX
# (design 4.5, assets/models/polar-bear/README.md, "Color map" and "Normal map"). The color map
# scales the source image to 2048 pixels and moves each texel in Oklab. The cream fur of the
# source goes to the white of the main polar bear in the hall light, and it keeps its strands as
# small steps of the lightness. The dark nose, pads, and mouth line keep their lightness, and the
# claws turn as dark as the black claws of the main polar bear. The texels of the eyeballs keep
# their colors. The script reads the triangles of the eyeballs (`ownEyes` of the export) and of the
# claws (the loose parts of CLAW_PARTS positions) and their texture points from the rig file. The normal map limits each tilt of the
# source, scales it to 1024 pixels, and stores the tilts times NORMAL_MAP_GAIN of src/scene/fur.ts.
# The output depends only on the input files.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I
#   tools/polar-bear-maps.py
import json
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_normal.jpg'
RIG = 'assets/models/polar-bear/tripo-hand/polar-bear.rig.glb'
COLOR_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-color.webp'
NORMAL_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60

#: The Oklab lightness, chroma, and hue (degrees) of the cream fur of the source map: the median
#: of the texels with a lightness above 0.72.
SOURCE_FUR = (0.818, 0.072, 76.0)
#: The Oklab lightness, chroma, and hue (degrees) that the fur of the source takes.
FUR = (0.92, 0.015, 85.0)
#: The share of the lightness steps of the fur strands around SOURCE_FUR that the fur keeps.
STRANDS = 0.7
#: The share of the chroma steps of the fur around SOURCE_FUR that the fur keeps.
CHROMA_STEPS = 0.3
#: The Oklab lightness below which a texel keeps its lightness (the nose, the claws, the pads,
#: and the mouth line), and the lightness above which it is fur. A texel between them takes a
#: smooth mix of the two moves.
DARK = (0.55, 0.72)
#: The share of its chroma that a dark texel keeps, so that the brown pads and lines read dark
#: gray as on a polar bear.
DARK_CHROMA = 0.6
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4
#: The Oklab lightness, chroma, and hue (degrees) of the claws. The source paints the claws brown
#: with light tips (median L 0.635), which read pale gray beside the black claws of the main polar
#: bear (SPECIES_COLORS accent #1a1715).
CLAW = (0.25, 0.012, 60.0)
#: The share of the lightness steps of the claw texels around their median that the claws keep.
CLAW_STEPS = 0.25
#: The smallest and the largest count of positions of a loose part that is a claw: the claws of
#: the Tripo mesh have 32 or 33 vertices, the mouth parts 11 or 12, and the eyeballs and the lids
#: more than 70.
CLAW_PARTS = (25, 40)
#: The texels around the claw triangles that take the claw color too.
CLAW_MARGIN = 2
#: The largest length of the x, y tilt of a normal of the source. A larger tilt is a baked eye
#: rim, nose, or claw edge of the source mesh, which the edited mesh does not have.
TILT_LIMIT = 0.2
#: NORMAL_MAP_GAIN of src/scene/fur.ts.
NORMAL_GAIN = 4


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


def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def read_rig(path):
    """Gives the triangles, the positions, the texture points, and the eyes (`ownEyes`) of the fur
    primitive of the rig file."""
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
    positions = read(fur['attributes']['POSITION'], np.float32, 3)
    points = read(fur['attributes']['TEXCOORD_0'], np.float32, 2)
    eyes = gltf['asset']['extras'].get('ownEyes')
    if not eyes:
        sys.exit(f'{path} has no eyes of the mesh.')
    return triangles.reshape(-1, 3), positions, points, eyes


def draw_triangles(triangles, points, faces, size):
    """Gives the texels of a list of triangles."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for t in faces:
        corners = points[triangles[t]] * size
        draw.polygon([(float(u), float(v)) for u, v in corners], fill=255)
    return mask


def eye_mask(rig, size):
    """Gives the texels of the eyeball triangles of the rig file, grown by EYE_MARGIN texels."""
    triangles, _, points, eyes = rig
    faces = [t for side in ('L', 'R') for t in eyes[side]['faces']]
    mask = draw_triangles(triangles, points, faces, size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


def claw_mask(rig, size):
    """Gives the texels of the claw triangles of the rig file (the loose parts with a count of
    positions in CLAW_PARTS), grown by CLAW_MARGIN texels, and the count of claws."""
    triangles, positions, points, _ = rig
    _, weld = np.unique(np.round(positions.astype(np.float64), 6), axis=0, return_inverse=True)
    weld = weld.ravel()
    parent = np.arange(weld.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for t in triangles:
        a, b, c = (find(weld[i]) for i in t)
        parent[b] = a
        parent[find(c)] = a
    roots = np.array([find(i) for i in range(len(parent))])
    sizes = np.bincount(roots)
    part = roots[weld[triangles[:, 0]]]
    claws = (sizes[part] >= CLAW_PARTS[0]) & (sizes[part] <= CLAW_PARTS[1])
    mask = draw_triangles(triangles, points, np.flatnonzero(claws), size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * CLAW_MARGIN + 1))
    return np.asarray(mask) > 0, len(set(part[claws].tolist()))


def lch(lightness, chroma, hue):
    h = np.radians(hue)
    return np.array([lightness, chroma * np.cos(h), chroma * np.sin(h)])


def white_fur(lab):
    """Moves each texel in Oklab: the fur to FUR with its strand steps, a dark texel to less
    chroma at its own lightness, and a mix of both between the DARK limits."""
    source = lch(*SOURCE_FUR)
    target = lch(*FUR)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    # The fur keeps a share of its own steps of lightness and chroma around the fur of the source,
    # with the hue of the target.
    fur = np.empty_like(lab)
    fur[..., 0] = target[0] + STRANDS * (lightness - source[0])
    fur_chroma = np.maximum(0.0, FUR[1] + CHROMA_STEPS * (chroma - SOURCE_FUR[1]))
    hue = np.radians(FUR[2])
    fur[..., 1] = fur_chroma * np.cos(hue)
    fur[..., 2] = fur_chroma * np.sin(hue)
    dark = lab.copy()
    dark[..., 1:] *= DARK_CHROMA
    share = smoothstep(lightness, *DARK)[..., None]
    return dark + share * (fur - dark)


def color_map(rig):
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    lab = oklab(linear(np.asarray(image)))
    moved = white_fur(lab)
    claws, claw_count = claw_mask(rig, SIZE)
    median = np.median(lab[claws][:, 0])
    moved[claws] = lch(*CLAW)
    moved[claws, 0] += CLAW_STEPS * (lab[claws][:, 0] - median)
    eyes, count = eye_mask(rig, SIZE)
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {count} eye triangles kept ({int(eyes.sum())} texels), '
          f'{claw_count} claws ({int(claws.sum())} texels), {os.path.getsize(COLOR_OUT)} bytes')


def normal_map():
    source = np.asarray(Image.open(NORMAL_SOURCE).convert('RGB')).astype(np.float64)
    tilt = source[..., :2] / 255.0 * 2.0 - 1.0
    length = np.hypot(tilt[..., 0], tilt[..., 1])
    limited = (length > TILT_LIMIT).mean()
    tilt *= np.minimum(1.0, TILT_LIMIT / np.maximum(length, 1e-12))[..., None]
    k = tilt.shape[0] // NORMAL_SIZE
    tilt = tilt.reshape(NORMAL_SIZE, k, NORMAL_SIZE, k, 2).mean(axis=(1, 3))
    stored = np.round((tilt * NORMAL_GAIN + 1.0) / 2.0 * 255.0)
    if stored.min() < 0 or stored.max() > 255:
        sys.exit('A stored tilt clips.')
    out = np.dstack([stored, np.full(stored.shape[:2] + (1,), 255.0)]).astype(np.uint8)
    with tempfile.TemporaryDirectory() as folder:
        png = os.path.join(folder, 'normal.png')
        Image.fromarray(out).save(png)
        subprocess.run(['cwebp', '-quiet', '-q', str(QUALITY), '-sharp_yuv', '-m', '6', png, '-o',
                        NORMAL_OUT], check=True)
    print(f'{NORMAL_OUT}: {NORMAL_SIZE} x {NORMAL_SIZE}, {limited * 100:.2f} % of the tilts '
          f'limited, {os.path.getsize(NORMAL_OUT)} bytes')


def main():
    which = sys.argv[1:] or ['color', 'normal']
    if 'color' in which:
        color_map(read_rig(RIG))
    if 'normal' in which:
        normal_map()


if __name__ == '__main__':
    main()
