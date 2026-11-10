# Writes the two color maps of the Tripo fox from the color map of its FBX (design 4.5,
# assets/models/fox/README.md, "Color map" and "Tan color map"): `fox-color.webp` for the red fox
# and `fox-tan-color.webp` for the tan fox. Each map scales the source image to 2048 pixels and
# moves each texel in Oklab by a step. In the red map, the orange fur goes to the red-orange of the
# main fox in the app light. In the tan map, the orange fur and the dark socks go to the tan fur and
# the tan accent of SPECIES_COLORS of src/models/colors.ts at the lightness of the tan palette of
# the faces. In both maps the cream belly, the white, and the black keep their colors. Each texel
# takes a mix of the steps of the colors, by its nearness to each color, so the blend between two
# colors of the fur stays smooth. The texels of the eyeballs keep their colors: the script reads
# their triangles and texture points from the rig file (`ownEyes` of the export). The output
# depends only on the input files.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = 'assets/models/fox/tripo-p2/fox.fbm/fox_basecolor.jpg'
RIG = 'assets/models/fox/tripo-hand/fox.rig.glb'
FOLDER = 'assets/models/fox/tripo-hand/'
SIZE = 2048
QUALITY = 60

#: The Oklab lightness, chroma, and hue (degrees) of the orange fur of the red map. The source
#: orange (L 0.638, C 0.172, h 47) is lighter than the shifted fur of the fox of main (L 0.557,
#: C 0.171, h 43.7), and the smooth body takes more light than the faces of the main fox. In the
#: seated 3/4 app view (`close-views play --at fox-red --azimuth 35`), this target gives the median
#: fur L 0.522, C 0.130, h 37.2, against L 0.521, C 0.131, h 38.7 on the fox of main.
RED_FUR = (0.42, 0.15, 52.0)
#: The colors of the red fox in the map (sRGB) and the colors that take their place, for each map:
#: the region colors of the face colors of the hand rig (assets/models/fox/README.md, "Smooth
#: surface"), and the white, the black, and the cream of the map, which keep their colors. A target
#: is an sRGB color, or ('oklch', L, C, h). The tan fur and socks take the Oklab hue and chroma of
#: the fur and the accent of SPECIES_COLORS['fox-tan'] and the Oklab lightness that the tan palette
#: of the faces gives them (paletteMap() of tools/studio-palette.ts): sRGB (186, 118, 73) and
#: (153, 97, 49). The colors of SPECIES_COLORS themselves are lighter, and the tan fur then read
#: cream in the light of the app.
MAPS = {
    'fox-color.webp': (
        ((220, 98, 12), ('oklch', *RED_FUR)),  # the orange fur to the red-orange of main
        ((73, 37, 17), (73, 37, 17)),  # the dark socks, the paws, and the ear tips
        ((244, 215, 191), (244, 215, 191)),  # the cream belly and cheeks
        ((206, 168, 143), (206, 168, 143)),  # the muzzle and the inner ears
        ((255, 255, 255), (255, 255, 255)),  # the white lights and the tail tip
        ((8, 6, 5), (8, 6, 5)),  # the black nose and lips
    ),
    'fox-tan-color.webp': (
        ((220, 98, 12), (166, 129, 83)),  # the orange fur to the tan fur
        ((73, 37, 17), (143, 102, 62)),  # the dark socks to the tan accent
        ((244, 215, 191), (244, 215, 191)),  # the cream belly and cheeks
        ((206, 168, 143), (206, 168, 143)),  # the muzzle and the inner ears
        ((255, 255, 255), (255, 255, 255)),  # the white lights and the tail tip
        ((8, 6, 5), (8, 6, 5)),  # the black nose and lips
    ),
}
#: The pairs of anchors of each map with a blend between them in the map: the orange fur to the cream, the
#: socks, the white, and the muzzle, and the socks to the black. Each pair gets two more anchors at
#: 1/3 and 2/3 of the way, in Oklab, with the same blend of the new colors.
BLENDS = ((0, 2), (0, 1), (0, 4), (0, 3), (1, 5))
#: The Oklab distance at which the share of an anchor falls to 1/e.
SPREAD = 0.06
#: The smallest chroma of an anchor for the hue step (see main()).
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


def eye_mask(path, size):
    """Gives the texels of the eyeball triangles of the rig file, grown by EYE_MARGIN texels."""
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
    triangles = read(fur['indices'], kinds[gltf['accessors'][fur['indices']]['componentType']], 3)
    points = read(fur['attributes']['TEXCOORD_0'], np.float32, 2)
    eyes = gltf['asset']['extras'].get('ownEyes')
    if not eyes:
        sys.exit(f'{path} has no eyes of the mesh.')
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    count = 0
    for side in ('L', 'R'):
        for t in eyes[side]['faces']:
            corners = points[triangles[t]] * size
            draw.polygon([(float(u), float(v)) for u, v in corners], fill=255)
            count += 1
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, count


def target_lab(target):
    """Gives the Oklab color of a target: an sRGB color, or ('oklch', L, C, h)."""
    if target[0] == 'oklch':
        _, lightness, chroma, hue = target
        h = np.radians(hue)
        return np.array([lightness, chroma * np.cos(h), chroma * np.sin(h)])
    return oklab(linear(target))


def write_map(name, anchors, image, lab, eyes, count):
    """Moves the texels of the scaled source by the steps of the anchors, and writes the map."""
    pairs = [(oklab(linear(source)), target_lab(target)) for source, target in anchors]
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
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(FOLDER + name, 'WEBP', quality=QUALITY, method=6)
    changed = np.abs(out.astype(int) - np.asarray(image).astype(int)).max(axis=-1) > 2
    print(f'{FOLDER}{name}: {SIZE} x {SIZE}, {count} eye triangles kept ({int(eyes.sum())} '
          f'texels), {changed.mean() * 100:.1f} % of the texels moved')


def main():
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    lab = oklab(linear(np.asarray(image)))
    eyes, count = eye_mask(RIG, SIZE)
    for name, anchors in MAPS.items():
        write_map(name, anchors, image, lab, eyes, count)


if __name__ == '__main__':
    main()
