# Writes the color map of the Tripo cat, `cat-color.webp`, from the color map of its FBX (design
# 4.5, assets/models/cat/README.md, "Color map"). The script scales the source image to 2048
# pixels and moves each texel in Oklab by a step: the warm gray fur goes to the gray of the cat of
# main in the hall light, and the cream white goes to the white of the cat of main. The pink inner
# ears and pads and the dark lines of the mouth keep their colors. Before the steps, the light
# brow spots take the fur around them, and the dark patches that the source paints away from the
# eyes and the mouth (the armpits, the neck under the chin) take the fur around them too. Each
# texel takes a mix of the steps of the colors, by its nearness to each color, so the blend
# between two colors stays smooth. The texels of the eyeballs keep their colors: the script reads
# their triangles and texture points from the rig file (`ownEyes` of the export). The script also
# writes the normal map of the fur, `cat-normal.webp`, from the normal map of the FBX ("Normal
# map" of the README), with no tilt on the brow spots and the skin over the eyes. The output depends only on
# the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/cat-maps.py
import json
import os
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = 'assets/models/cat/tripo-p2/cat.fbm/cat_basecolor.jpg'
RIG = 'assets/models/cat/tripo-hand/cat.rig.glb'
OUT = 'assets/models/cat/tripo-hand/cat-color.webp'
SIZE = 2048
QUALITY = 60
#: The normal map of the source and the web copy of the normal map of the fur.
NORMAL_SOURCE = 'assets/models/cat/tripo-p2/cat.fbm/cat_normal.jpg'
NORMAL_OUT = 'assets/models/cat/tripo-hand/cat-normal.webp'
#: The size of the normal map, its largest tilt (x, y), and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts).
NORMAL_SIZE = 1024
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4

#: The Oklab lightness, chroma, and hue (degrees) of the gray fur of the map. The hall view of the
#: app (the key light from the back, no fill light) is the target: see assets/models/cat/README.md,
#: "Hall fur", for the measures against the cat of main.
GRAY_FUR = (0.55, 0.0435, 268.0)
#: The Oklab lightness, chroma, and hue (degrees) of the white fur of the map.
WHITE_FUR = (0.88, 0.02, 262.0)
#: The colors of the source map (sRGB, the median texels of each region) and the colors that take
#: their place. A target is an sRGB color, or ('oklch', L, C, h).
ANCHORS = (
    ((125, 106, 97), ('oklch', *GRAY_FUR)),  # the warm gray fur
    ((239, 210, 187), ('oklch', *WHITE_FUR)),  # the cream white bib, muzzle, and paws
    ((226, 149, 130), (226, 149, 130)),  # the pink inner ears and pads
    ((44, 33, 27), (44, 33, 27)),  # the dark lines of the mouth and the eye lining
)
#: The pairs of anchors with a blend between them in the map: the fur to the white, the fur to the
#: pink, the white to the pink, and the fur to the dark lines. Each pair gets two more anchors at
#: 1/3 and 2/3 of the way, in Oklab, with the same blend of the new colors.
BLENDS = ((0, 1), (0, 2), (1, 2), (0, 3))
#: The Oklab distance at which the share of an anchor falls to 1/e.
SPREAD = 0.06
#: The smallest chroma of an anchor for the hue step (see write_map()).
MIN_CHROMA = 0.02
#: The texels of the eyeballs and this many texels around them keep their colors.
EYE_MARGIN = 4
#: The light spot that the source map paints above the inner end of each eye: its middle from the
#: middle of the eyeball in x (toward the middle plane) and y (up), in units of the distance of
#: the eye from the middle plane, and its radius in the same units. In the hall light the two
#: spots read as raised inner brows, which give a worried face. Each texel of the front triangles
#: (in front of the middle of the eye) with its middle in the spot that is lighter than the fur and
#: far from it takes the median of the other texels of its part of the map.
BROW_SPOT = ((-0.3, 1.15), 0.55)
#: The Oklab distance from the gray fur above which a texel of a brow triangle is a spot texel.
BROW_FAR = 0.05
#: The texels around the brow triangles that a light spot texel can also take.
BROW_GROW = 2
#: The dark shade that the source map paints under each light brow spot: its middle from the
#: middle of the eyeball and its radius, in the units of BROW_SPOT. In the hall light the two
#: shades read as knit brows, which give a worried face. Each texel of the front triangles with
#: its middle in the shade that is darker than the fur by more than BROW_DARK takes the median of
#: the other texels of its part of the map.
BROW_SHADE = ((-0.05, 0.8), 0.4)
#: The Oklab lightness below the gray fur under which a texel of a shade triangle is a shade
#: texel.
BROW_DARK = 0.025
#: The skin over each eye where the normal map has no tilt: the middle and the radius in the
#: units of BROW_SPOT. The source paints the brow tufts and the upper lids as strong tilts, which
#: show as dark strands over the eyes in the hall light.
BROW_FLAT = ((-0.1, 0.75), 0.6)
#: The Oklab lightness below which a texel is dark. The source paints dark patches on the armpits
#: and under the chin, which show as black bands under the arms and the head.
DARK_L = 0.42
#: The places that keep their dark texels, in units of the distance of the eyes from the middle
#: plane: within this radius of the middle of each eye (the lining), and within the second radius
#: of the mouth point, which lies this far below the middle of the two eyes in y and in front of
#: them in z.
DARK_KEEP = (1.25, 0.95, (-1.35, 0.6))
#: The texels around the dark texels that the fill reads for its color.
DARK_GROW = 3


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
    primitive of the rig file, in the seated bind of the file, and the place of each joint."""
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
    return triangles.reshape(-1, 3), positions, points, eyes, joint_places(gltf)


def joint_places(gltf):
    """Gives the place of each node of the file by its name: the translation of its world matrix."""
    nodes = gltf['nodes']
    parent = {c: i for i, node in enumerate(nodes) for c in node.get('children', [])}
    worlds = {}

    def world(i):
        if i not in worlds:
            node = nodes[i]
            x, y, z, w = node.get('rotation', [0, 0, 0, 1])
            m = np.eye(4)
            m[:3, :3] = np.array([
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
            ]) * np.array(node.get('scale', [1, 1, 1]))
            m[:3, 3] = node.get('translation', [0, 0, 0])
            worlds[i] = world(parent[i]) @ m if i in parent else m
        return worlds[i]

    return {node.get('name'): world(i)[:3, 3] for i, node in enumerate(nodes)}


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
    triangles, _, points, eyes, _ = rig
    faces = [t for side in ('L', 'R') for t in eyes[side]['faces']]
    mask = draw_triangles(triangles, points, faces, size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


def eye_middles(rig):
    """Gives the middle of the sphere of each eyeball (a least-squares fit of its corners)."""
    triangles, positions, _, eyes, _ = rig
    middles = {}
    for side in ('L', 'R'):
        p = positions[triangles[eyes[side]['faces']].ravel()].astype(np.float64)
        fit = np.linalg.lstsq(np.c_[2 * p, np.ones(len(p))], (p ** 2).sum(1), rcond=None)[0]
        middles[side] = fit[:3]
    return middles


def place_map(rig):
    """Gives the place in the seated bind of each texel of the fur triangles (NaN elsewhere), by
    the barycentric mix of the corners of its triangle."""
    triangles, positions, points, _, _ = rig
    places = np.full((SIZE, SIZE, 3), np.nan)
    for tri in triangles:
        uv = points[tri].astype(np.float64) * SIZE - 0.5
        x0, y0 = np.floor(uv.min(axis=0)).astype(int)
        x1, y1 = np.ceil(uv.max(axis=0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, SIZE - 1), min(y1, SIZE - 1)
        if x1 < x0 or y1 < y0:
            continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        (ax, ay), (bx, by), (cx, cy) = uv
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(area) < 1e-12:
            continue
        wb = ((xs - ax) * (cy - ay) - (cx - ax) * (ys - ay)) / area
        wc = ((bx - ax) * (ys - ay) - (xs - ax) * (by - ay)) / area
        wa = 1 - wb - wc
        inside = (wa >= -0.02) & (wb >= -0.02) & (wc >= -0.02)
        corners = positions[tri].astype(np.float64)
        place = wa[..., None] * corners[0] + wb[..., None] * corners[1] + wc[..., None] * corners[2]
        places[ys[inside], xs[inside]] = place[inside]
    return places



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



def eye_frame(rig):
    """Gives the middle of each eye and the distance of the eyes from the middle plane."""
    middles = eye_middles(rig)
    return middles, (abs(middles['L'][0]) + abs(middles['R'][0])) / 2


def fill_parts(lab, spot, around):
    """Gives each connected part of `spot` grown by `around` texels the median color of the other
    texels of its part."""
    grown = np.asarray(Image.fromarray(spot).filter(ImageFilter.MaxFilter(2 * around + 1))) > 0
    keep = grown & ~spot
    out = lab.copy()
    labels, count = parts(grown)
    for k in range(1, count + 1):
        part = labels == k
        if not (part & spot).any():
            continue
        fill = part & keep
        if fill.sum() >= 4:
            out[part & spot] = np.median(lab[fill], axis=0)
    return out


def brow_triangles(rig, spot_rule):
    """Gives the mask of the texels of the front triangles with their middle within the radius of
    the spot of a rule (BROW_SPOT or BROW_SHADE) over each eye, grown by BROW_GROW texels."""
    triangles, positions, points, eyes, _ = rig
    middles, unit = eye_frame(rig)
    face_middles = positions[triangles].mean(axis=1)
    own = {t for side in ('L', 'R') for t in eyes[side]['faces']}
    (ox, oy), radius = spot_rule
    inner = []
    for side, sign in (('L', 1), ('R', -1)):
        c = middles[side]
        spot = np.array([c[0] + sign * ox * unit, c[1] + oy * unit])
        d = np.hypot(face_middles[:, 0] - spot[0], face_middles[:, 1] - spot[1]) / unit
        front = face_middles[:, 2] > c[2]
        inner += [t for t in np.flatnonzero((d < radius) & front) if t not in own]
    region = np.asarray(draw_triangles(triangles, points, inner, SIZE)) > 0
    return np.asarray(Image.fromarray(region).filter(ImageFilter.MaxFilter(2 * BROW_GROW + 1))) > 0


def brow_fill(rig, lab):
    """Paints the light brow spots (see BROW_SPOT) and the dark shades under them (see BROW_SHADE)
    over with the fur around them. Gives the moved Oklab image and the counts of the painted
    texels."""
    fur = oklab(linear(ANCHORS[0][0]))
    grown = brow_triangles(rig, BROW_SPOT)
    spot = grown & (np.linalg.norm(lab - fur, axis=-1) > BROW_FAR) & (lab[..., 0] > fur[0])
    lab = fill_parts(lab, spot, BROW_GROW + 2)
    shade = brow_triangles(rig, BROW_SHADE) & (lab[..., 0] < fur[0] - BROW_DARK)
    return fill_parts(lab, shade, BROW_GROW + 2), int(spot.sum()), int(shade.sum())


def dark_fill(rig, lab, eyes):
    """Paints the dark patches away from the eyes and the mouth over with the fur around them (see
    DARK_L and DARK_KEEP). Gives the moved Oklab image and the count of the painted texels."""
    places = place_map(rig)
    middles, unit = eye_frame(rig)
    eye_r, mouth_r, (my, mz) = DARK_KEEP
    mid = (middles['L'] + middles['R']) / 2
    mouth = mid + np.array([0.0, my * unit, mz * unit])
    near = np.zeros(lab.shape[:2], bool)
    ok = np.isfinite(places[..., 0])
    for c, r in ((middles['L'], eye_r), (middles['R'], eye_r), (mouth, mouth_r)):
        d = np.full(lab.shape[:2], np.inf)
        d[ok] = np.linalg.norm(places[ok] - c, axis=-1) / unit
        near |= d < r
    spot = (lab[..., 0] < DARK_L) & ok & ~near & ~eyes
    return fill_parts(lab, spot, DARK_GROW), int(spot.sum())


def write_map(image, lab, eyes):
    """Moves the texels by the steps of the anchors, and writes the map."""
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
    moved = lab.copy()
    for k, step in enumerate(steps):
        moved += shares[..., k, None] * step
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(OUT, 'WEBP', quality=QUALITY, method=6)
    changed = np.abs(out.astype(int) - np.asarray(image).astype(int)).max(axis=-1) > 2
    print(f'{OUT}: {SIZE} x {SIZE}, {int(eyes.sum())} eye texels kept, '
          f'{changed.mean() * 100:.1f} % of the texels moved')


def write_normal_map(rig):
    """Writes the normal map of the fur: each x, y tilt of the source limited to the length
    NORMAL_LIMIT, a box scale to NORMAL_SIZE, no tilt on the triangles of the brow spots and of
    BROW_FLAT (a soft edge of 4 texels), then the tilts times NORMAL_GAIN in red and green, 255 in
    blue, and cwebp -q 60 -sharp_yuv -m 6."""
    a = np.asarray(Image.open(NORMAL_SOURCE).convert('RGB')).astype(np.float64) / 255 * 2 - 1
    t = a[..., :2].copy()
    length = np.linalg.norm(t, axis=-1)
    over = length > NORMAL_LIMIT
    t[over] *= (NORMAL_LIMIT / length[over])[:, None]
    k = t.shape[0] // NORMAL_SIZE
    small = t.reshape(NORMAL_SIZE, k, NORMAL_SIZE, k, 2).mean(axis=(1, 3))
    brows = brow_triangles(rig, BROW_SPOT) | brow_triangles(rig, BROW_FLAT)
    flat = Image.fromarray((brows * 255).astype(np.uint8)).resize((NORMAL_SIZE, NORMAL_SIZE), Image.BOX)
    flat = np.asarray(flat.filter(ImageFilter.GaussianBlur(2))).astype(np.float64) / 255
    small *= (1 - flat)[..., None]
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
          f'tilts limited, {int((flat > 0.5).sum())} brow texels with no tilt')


def main():
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = read_rig(RIG)
    eyes, count = eye_mask(rig, SIZE)
    lab, painted, shaded = brow_fill(rig, oklab(linear(np.asarray(image))))
    print(f'{painted} texels of the brow spots and {shaded} texels of their shades take the fur '
          'around them')
    lab, dark = dark_fill(rig, lab, eyes)
    print(f'{dark} dark texels away from the eyes and the mouth take the fur around them')
    write_map(image, lab, eyes)
    write_normal_map(rig)


if __name__ == '__main__':
    main()
