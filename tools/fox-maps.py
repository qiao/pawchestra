# Writes the two color maps of the Tripo fox from the color map of its FBX (design 4.5,
# assets/models/fox/README.md, "Color map" and "Tan color map"): `fox-color.webp` for the red fox
# and `fox-tan-color.webp` for the tan fox. Each map scales the source image to 2048 pixels and
# moves each texel in Oklab by a step. In the red map, the orange fur goes to the red-orange of the
# main fox in the app light. In the tan map, the orange fur goes to the tan fur of the main fox in
# the app light, and the dark socks go to the tan accent of SPECIES_COLORS of src/models/colors.ts
# at the lightness of the tan palette of the faces. In both maps the cream belly, the white, and the black keep their colors. Each texel
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
#: The Oklab lightness, chroma, and hue (degrees) of the orange fur of the tan map. The light of
#: the app makes the fur darker and warmer than the map. In the 3/4 app view of the tan fox
#: (`close-views play --demo mozart-k315 --at fox-tan --azimuth 35 --zoom 1.3 --time 6`), this
#: target gives the median fur L 0.636, C 0.102, h 56.0, against L 0.634, C 0.102, h 57.1 on the
#: fox of main. The lightness of the tan palette of the faces (L 0.63) gave L 0.517.
TAN_FUR = (0.80, 0.10, 75.0)
#: The colors of the red fox in the map (sRGB) and the colors that take their place, for each map:
#: the region colors of the face colors of the hand rig (assets/models/fox/README.md, "Smooth
#: surface"), and the white, the black, and the cream of the map, which keep their colors. A target
#: is an sRGB color, or ('oklch', L, C, h). The tan fur takes TAN_FUR. The tan socks take the Oklab
#: hue and chroma of the accent of SPECIES_COLORS['fox-tan'] and the Oklab lightness that the tan
#: palette of the faces gives them (paletteMap() of tools/studio-palette.ts): sRGB (153, 97, 49).
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
        ((220, 98, 12), ('oklch', *TAN_FUR)),  # the orange fur to the tan fur
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
#: The light spot that the source map paints above each eye: its middle from the middle of the
#: eyeball, in the axes of the rig file (+x the left side, +y up, +z forward), with x toward the
#: middle plane, and two radii, all in units of the distance of the eye from the middle plane.
#: In the hall light the two spots read as raised inner brows, which give a worried face. In the
#: triangles of the rig file with their middle in the inner sphere, each texel far from the orange
#: fur takes the fur around it. In the outer sphere, only the light texels do, so that the dark
#: lining of the eye keeps its color.
BROW_SPOT = ((-0.205, 0.872, 0.836), 0.5, 0.7)
#: The texels around the brow triangles that a light spot texel can also take, so that no light
#: edge stays where a texel of the spot lies just outside its triangles.
BROW_GROW = 2
#: The Oklab distance from the orange fur above which a texel of a brow triangle is a spot texel.
BROW_FAR = 0.04


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
    """Gives the triangles, the positions, the texture points, and the eyes (`ownEyes`) of the fur
    primitive of the rig file, in the seated bind of the file."""
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


def eye_middles(rig):
    """Gives the middle of the sphere of each eyeball (a least-squares fit of its corners)."""
    triangles, positions, _, eyes = rig
    middles = {}
    for side in ('L', 'R'):
        p = positions[triangles[eyes[side]['faces']].ravel()].astype(np.float64)
        fit = np.linalg.lstsq(np.c_[2 * p, np.ones(len(p))], (p ** 2).sum(1), rcond=None)[0]
        middles[side] = fit[:3]
    return middles


def brow_fill(rig, lab):
    """Paints the light brow spots over with the fur around them (see BROW_SPOT). Gives the moved
    Oklab image and the count of the painted texels."""
    triangles, positions, points, eyes = rig
    middles = eye_middles(rig)
    unit = abs(middles['L'][0])
    face_middles = positions[triangles].mean(axis=1)
    own = {t for side in ('L', 'R') for t in eyes[side]['faces']}
    offset = np.array(BROW_SPOT[0])
    inner, outer = [], []
    for side, sign in (('L', 1), ('R', -1)):
        spot = middles[side] + unit * offset * [sign, 1, 1]
        distance = np.linalg.norm(face_middles - spot, axis=1) / unit
        inner += [t for t in np.flatnonzero(distance < BROW_SPOT[1]) if t not in own]
        outer += [t for t in np.flatnonzero(distance < BROW_SPOT[2]) if t not in own]
    region = np.asarray(draw_triangles(triangles, points, inner, SIZE)) > 0
    wide = np.asarray(draw_triangles(triangles, points, outer, SIZE)) > 0
    grown = np.asarray(Image.fromarray(wide).filter(ImageFilter.MaxFilter(2 * BROW_GROW + 1))) > 0
    fur = oklab(linear(MAPS['fox-color.webp'][0][0]))
    far = np.linalg.norm(lab - fur, axis=-1) > BROW_FAR
    light = lab[..., 0] > fur[0]
    spot = (region & far) | (grown & far & light)
    keep = grown & ~spot
    out = lab.copy()
    labels, count = parts(grown)
    for k in range(1, count + 1):
        part = labels == k
        fill = part & keep
        if not (part & spot).any():
            continue
        color = np.median(lab[fill], axis=0) if fill.sum() >= 4 else fur
        out[part & spot] = color
    return out, int(spot.sum())


def parts(mask):
    """Gives the connected parts of a mask (4 neighbors) as a label image, and their count."""
    labels = np.zeros(mask.shape, np.int32)
    count = 0
    for y, x in zip(*np.nonzero(mask)):
        if labels[y, x]:
            continue
        count += 1
        stack = [(y, x)]
        labels[y, x] = count
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] \
                        and not labels[ny, nx]:
                    labels[ny, nx] = count
                    stack.append((ny, nx))
    return labels, count


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
    rig = read_rig(RIG)
    lab, painted = brow_fill(rig, oklab(linear(np.asarray(image))))
    print(f'{painted} texels of the brow spots take the fur around them')
    eyes, count = eye_mask(rig, SIZE)
    for name, anchors in MAPS.items():
        write_map(name, anchors, image, lab, eyes, count)


if __name__ == '__main__':
    main()
