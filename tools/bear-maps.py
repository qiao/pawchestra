# Writes the color map of the Tripo bear (`bear-color.webp`) from the color map of its FBX (design
# 4.5, assets/models/bear/README.md, "Color map"). The map scales the source image to 2048 pixels.
# Each texel of a fur triangle of the rig file moves in Oklab: its lightness and its chroma scale,
# and its hue turns, so that the median fur of the source goes to the brown of the bear of main and
# each strand keeps its contrast to the fur around it. Each texel of a muzzle triangle moves the
# same way to the light muzzle of the bear of main. The mouth line, the claws, and the eyes keep
# their colors. The region of a triangle is its face color in the rig file (README, "Smooth
# surface"). The output depends only on the input files.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/bear-maps.py
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = 'assets/models/bear/tripo-p2/bear.fbm/bear_basecolor.jpg'
RIG = 'assets/models/bear/tripo-hand/bear.rig.glb'
OUT = 'assets/models/bear/tripo-hand/bear-color.webp'
SIZE = 2048
QUALITY = 60

#: The regions of the map: the face color of the triangles of the region in the rig file (sRGB),
#: the median color of the source texels of the region (sRGB), and the color that this median goes
#: to (sRGB), or None for no change.
REGIONS = {
    #: The fur goes to the face color of the fur of the bear of main (Oklab L 0.391, C 0.064,
    #: h 58), which gives the median L 0.477, C 0.090, h 49 on its back in the hall view.
    'fur': ((123, 72, 31), (160, 87, 36), (95, 60, 32)),
    #: The tan muzzle goes to the light muzzle of the bear of main.
    'muzzle': ((230, 184, 139), (232, 152, 89), (234, 192, 148)),
    'mouth': ((161, 83, 67), (183, 90, 69), None),
    'claws': ((80, 54, 32), (87, 58, 32), None),
}
#: The texels around the triangles of a region that the region also takes, so that no texel of
#: the edge of a triangle keeps the source color.
GROW = 2
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
    """Gives the triangles, the texture points, the face color of each triangle (sRGB), and the
    eyes (`ownEyes`) of the fur primitive of the rig file."""
    data = open(path, 'rb').read()
    length = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + length])
    binary = data[20 + length + 8:]
    fur = gltf['meshes'][0]['primitives'][0]
    if gltf['materials'][fur['material']]['name'] != 'fur' or 'TEXCOORD_0' not in fur['attributes']:
        sys.exit(f'{path} has no fur primitive with texture points.')

    def read(index, width):
        accessor = gltf['accessors'][index]
        view = gltf['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        kinds = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
        count = accessor['count'] * width
        return np.frombuffer(binary, kinds[accessor['componentType']], count, start).reshape(-1, width)

    triangles = read(fur['indices'], 1).reshape(-1, 3)
    points = read(fur['attributes']['TEXCOORD_0'], 2)
    color_accessor = gltf['accessors'][fur['attributes']['COLOR_0']]
    colors = read(fur['attributes']['COLOR_0'], 4 if color_accessor['type'] == 'VEC4' else 3)
    colors = colors[:, :3].astype(np.float64)
    if color_accessor['componentType'] == 5121:
        colors /= 255.0
    elif color_accessor['componentType'] == 5123:
        colors /= 65535.0
    face = srgb8(colors[triangles[:, 0]]).astype(int)
    eyes = gltf['asset']['extras'].get('ownEyes')
    if not eyes:
        sys.exit(f'{path} has no eyes of the mesh.')
    return triangles, points, face, eyes


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
    triangles, points, _, eyes = rig
    faces = [t for side in ('L', 'R') for t in eyes[side]['faces']]
    mask = draw_triangles(triangles, points, faces, size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


def lch(lab):
    return lab[..., 0], np.hypot(lab[..., 1], lab[..., 2]), np.arctan2(lab[..., 2], lab[..., 1])


def region_step(lab, source, target):
    """Moves texels so that the source color goes to the target color: the lightness and the
    chroma scale by the ratios of the two colors, and the hue turns by their hue step."""
    l0, c0, h0 = lch(oklab(linear(source)))
    l1, c1, h1 = lch(oklab(linear(target)))
    lightness, chroma, hue = lch(lab)
    lightness = lightness * (l1 / l0)
    chroma = chroma * (c1 / c0)
    hue = hue + (h1 - h0)
    return np.stack([lightness, chroma * np.cos(hue), chroma * np.sin(hue)], axis=-1)


def main():
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = read_rig(RIG)
    triangles, points, face, _ = rig
    lab = oklab(linear(np.asarray(image)))
    out = lab.copy()
    for name, (key, source, target) in REGIONS.items():
        faces = np.flatnonzero((np.abs(face - key) <= 1).all(axis=1))
        if target is None:
            print(f'{name}: {len(faces)} triangles keep their colors')
            continue
        mask = draw_triangles(triangles, points, faces, SIZE)
        mask = np.asarray(mask.filter(ImageFilter.MaxFilter(2 * GROW + 1))) > 0
        out[mask] = region_step(lab[mask], source, target)
        print(f'{name}: {len(faces)} triangles, {int(mask.sum())} texels move')
    eyes, count = eye_mask(rig, SIZE)
    out[eyes] = lab[eyes]
    Image.fromarray(srgb8(linear_of_oklab(out))).save(OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{OUT}: {SIZE} x {SIZE}, {count} eye triangles keep their colors ({int(eyes.sum())} texels)')


if __name__ == '__main__':
    main()
