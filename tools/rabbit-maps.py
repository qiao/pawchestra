# Writes the color map and the normal map of the Tripo rabbit from the maps of its FBX (design 4.5,
# assets/models/rabbit/README.md, "Color map" and "Normal map"). The color map `rabbit-color.webp`
# scales the source image to 2048 pixels and moves each texel in Oklab by a step: the cream fur
# goes to the fur of the rabbit of main in the hall light, and the pink, the brown brows, the
# white, and the black keep their colors. Each texel takes a mix of the steps of the colors, by its
# nearness to each color, so the blend between two colors stays smooth. The texels of the eyeballs
# keep the eye paint of the source, with each iris moved to the middle of its opening ("Eyes" of
# the README, `EYE_PAINT`). The brows and the dark band of each eye socket keep half of their
# contrast to the fur ("Brows"). The script reads the triangles, the places, and the texture points
# of the eyeballs from the rig file (`ownEyes` of the export).
# The normal map `rabbit-normal.webp` holds the tilts of the fur. The output depends only on the
# input files and on cwebp 1.5.0.
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
#: The paint of the eyeballs. 'source' keeps the eye of the source map: a large black pupil in an
#: amber iris with a dark ring, and white around it. 'centered' keeps the same paint, and moves the
#: iris with its pupil to the middle of the eye opening of the front view (`center_irises()`).
#: 'cartoon' paints each ball again as the cartoon eye of the sheet (`paint_eyes()`).
EYE_PAINT = 'centered'
#: The cells across the front picture of a ball (`front_cells()`), in which the iris move finds
#: the opening and the pupil.
FRONT_GRID = 120
#: The largest luma of a pupil texel, and the smallest channel and the largest saturation of a
#: white texel (sRGB).
PUPIL_LUMA = 50
WHITE_LOW = 170
WHITE_SAT = 0.25
#: The largest iris radius in degrees that the search tries.
IRIS_SEARCH = 40
#: The share of white texels of the opening from which a ring of 1 degree about the pupil lies past
#: the iris.
IRIS_WHITE = 0.05
#: The angle in degrees added to the iris radius, so that the soft edge of the iris moves with it.
IRIS_EDGE = 2.0
#: The cells of the front picture at the edge of the opening that the pupil search and the iris
#: move do not use.
EDGE_CELLS = 2
#: True when the source map paints a dark lash line in the EDGE_CELLS cells at the edge of the
#: opening: then the dark texels of these cells stay at the old place of the iris. The source map
#: of the rabbit paints no lash line, and its iris reaches the lower edge of the opening. So with
#: False, the old place of the iris takes white up to the edge, and no dark ring of the iris stays
#: at the lower edge.
LASH_LINE = False
#: The barycentric slack of a second try for a ray from the middle of a ball that hits no ball
#: triangle.
WIDE_EDGE = 0.05
#: The view of the play, in which each iris lies in the middle of its opening
#: (`gaze_targets()`): the head of the violinist turns down by PLAY_HEAD_PITCH degrees in the
#: play moments (`pnpm pose-preview violinist`: frog, tip, crossing), and the front camera of the
#: test page looks down at the eyes by PLAY_CAMERA_ELEVATION degrees (12 degrees at the middle of
#: the player, `viewCamera()` of `src/test-page/views.ts`). So the camera lies above the forward
#: axis of the head by the sum. In the front view of the bind, the iris in the middle of the
#: opening looked down in the play.
PLAY_HEAD_PITCH = 9.3
PLAY_CAMERA_ELEVATION = 7.4
#: The turn in degrees of each iris target out and up from the middle of the opening in the play
#: view. A small turn out stops a cross-eyed look.
GAZE_OUT = 6.0
GAZE_UP = 5.0
#: The share of the contrast to the fur around them that the brows and the eye sockets keep
#: (`soften_brows()`): 1 keeps the paint of the source, 0 paints them as the fur. The source
#: paints thick, dark, high brows and a dark band in each socket over the eye, and in the play
#: they read as a strong frown.
BROW_CONTRAST = 0.5
SOCKET_CONTRAST = 0.5
#: The share of the length of each brow at each end in which its contrast fades to 0, so that the
#: brow paint is shorter.
BROW_FADE = 0.25
#: The socket faces: the faces of the body with each corner within SOCKET_REACH ball radii of the
#: middle of a ball. The fur color of a side is the median texel of the body faces from
#: SOCKET_REACH to FUR_REACH ball radii.
SOCKET_REACH = 1.6
FUR_REACH = 2.6
#: The texels around the brow and the socket triangles that also soften, so that the bilinear
#: texture sample at the edge of a triangle takes no old dark color.
SOFT_MARGIN = 2
#: The share of the middle angle across of the eye opening that the gaze takes: 0 gives
#: parallel eyes that look straight ahead, 1 an eye in the middle of each opening.
GAZE_ACROSS = 0.5
#: The half width in degrees of the band across the opening about the gaze in which the height
#: of the opening counts.
GAZE_BAND = 8.0
#: The vertical radius of the oval iris as a share of half the height of the eye opening: above 1,
#: the lids cover its top and its bottom.
IRIS_HEIGHT = 1.25
#: The angle in degrees before the outer corner of the opening at which the iris ends, so that a
#: thin off-white edge shows there.
OUTER_WHITE = 7.0
#: The angle in degrees by which the iris reaches past the inner corner of the opening, so that no
#: white shows there.
INNER_REACH = 4.0
#: The pupil radius as a share of the vertical iris radius.
PUPIL_SHARE = 0.65
#: The width of the soft edge of the iris to the sclera, as a share of the iris radii.
IRIS_SOFT = 0.06
#: The sRGB colors of the iris (dark, and lighter at its lower edge), of the pupil, and of the
#: off-white sclera. The iris is near the dark brown of the eyes of the sheets.
IRIS_DARK = (62, 36, 20)
IRIS_LIGHT = (112, 68, 36)
PUPIL_COLOR = (16, 10, 7)
SCLERA = (226, 220, 208)
#: The finish of the eyes for the far view of the hall (`far_eyes()`). There each eye is a few
#: pixels across. With the source paint, a wide white field around the iris showed, and the eyes
#: read as startled or as a side glance. IRIS_SCALE 1 keeps the iris radius of the source, and
#: each shade 1 and SCLERA_WARM (0, 0) keep its colors.
#: IRIS_SCALE: the scale of the iris radius about its middle. PUPIL_RATIO: the pupil radius as a
#: share of the new iris radius. SCLERA_SHADE: the scale of the Oklab lightness of the white.
#: SCLERA_WARM: the Oklab (a, b) step of the white to a warm ivory. IRIS_SHADE: the scale of the
#: Oklab lightness of the iris. RING_SHADE and RING_WIDTH: the scale of the lightness of the outer
#: ring of the iris, and its width as a share of the iris radius.
IRIS_SCALE = 1.1
PUPIL_RATIO = 0.55
#: The turn in degrees of the middle of the new iris out from the target of `center_irises()`.
#: The target of the rabbit already lies in the middle of the opening of the play view, turned
#: out by GAZE_OUT. The turn is at most the growth of the iris radius, so that the new iris covers
#: the old iris.
FAR_GAZE_OUT = 0.0
SCLERA_SHADE = 0.85
SCLERA_WARM = (0.008, 0.03)
IRIS_SHADE = 0.9
RING_SHADE = 0.75
RING_WIDTH = 0.15
#: The luma (sRGB) and the saturation at which a texel goes from no white to white for the tone of
#: the sclera, each as a soft step (start, end). So the white keeps its shade under the lid.
WHITE_LUMA = (90.0, 170.0)
WHITE_SATURATION = (0.2, 0.4)
#: The steps in degrees of the directions about the source pupil and of the angles from it, and
#: the largest angle, at which far_eyes() reads the pupil edge and the iris edge, and the count of
#: directions in the circular median of each edge.
FAR_PHI_STEP = 3.0
FAR_THETA_STEP = 0.5
FAR_REACH = 45.0
FAR_SMOOTH = 5
#: The largest step of the pupil edge and of the iris edge of a clean direction from the median of
#: each edge, as a share of the median.
FAR_CLEAN = (0.15, 0.08)
#: The largest share of the texels of an eyeball that can also lie in the other eyeball.
EYE_OVERLAP = 0.01
#: The rounds of the fill of the texels around the eyeball triangles before the turned ball samples
#: the map, so that a sample at the edge of a texture island takes no color from outside it.
EYE_FILL = 4
#: The barycentric slack of a ray hit, so that a ray on the edge of two triangles hits one.
EDGE = 1e-4
#: The step of the grid of the front rays over each eye, in units of the rig file.
RAY_STEP = 0.0005


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
    """Gives the triangles, the places in the seated bind, the texture points, and the eyes
    (`ownEyes`) of the fur primitive of the rig file."""
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
    return triangles.reshape(-1, 3), positions.astype(np.float64), points.astype(np.float64), eyes


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
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for t in faces:
        corners = points[triangles[t]] * size
        draw.polygon([(float(u), float(v)) for u, v in corners], fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(2 * EYE_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


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


def ray_hits(origins, directions, corners, edge=None):
    """Gives, for each ray, the distance to the nearest triangle that it hits (inf for none), the
    index of that triangle, and the barycentric weights (u, v) of the hit (Moller-Trumbore)."""
    edge = EDGE if edge is None else edge
    a, e1, e2 = corners[:, 0], corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0]
    best = np.full(len(origins), np.inf)
    index = np.full(len(origins), -1)
    bary = np.zeros((len(origins), 2))
    for start in range(0, len(origins), 512):
        o = origins[start:start + 512, None, :]
        d = directions[start:start + 512, None, :]
        p = np.cross(d, e2[None])
        det = (e1[None] * p).sum(-1)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        t0 = o - a[None]
        u = (t0 * p).sum(-1) * inv
        q = np.cross(t0, e1[None])
        v = (d * q).sum(-1) * inv
        t = (e2[None] * q).sum(-1) * inv
        hit = ok & (u >= -edge) & (v >= -edge) & (u + v <= 1 + edge) & (t > 1e-6)
        t = np.where(hit, t, np.inf)
        k = t.argmin(axis=1)
        rows = np.arange(len(k))
        best[start:start + 512] = t[rows, k]
        index[start:start + 512] = np.where(np.isfinite(t[rows, k]), k, -1)
        bary[start:start + 512] = np.c_[u[rows, k], v[rows, k]]
    return best, index, bary


def eye_texels(rig, faces):
    """Gives the texels of the triangles `faces` (rows and columns), and the place of each in the
    seated bind, by the barycentric mix of the corners of its triangle."""
    triangles, positions, points, _ = rig
    ys, xs, places = [], [], []
    for f in faces:
        tri = triangles[f]
        uv = points[tri] * SIZE - 0.5
        x0, y0 = np.maximum(np.floor(uv.min(axis=0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(uv.max(axis=0)).astype(int), SIZE - 1)
        if x1 < x0 or y1 < y0:
            continue
        gy, gx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        (ax, ay), (bx, by), (cx, cy) = uv
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(area) < 1e-12:
            continue
        wb = ((gx - ax) * (cy - ay) - (cx - ax) * (gy - ay)) / area
        wc = ((bx - ax) * (gy - ay) - (gx - ax) * (by - ay)) / area
        wa = 1 - wb - wc
        inside = (wa >= -0.01) & (wb >= -0.01) & (wc >= -0.01)
        corners = positions[tri]
        place = wa[..., None] * corners[0] + wb[..., None] * corners[1] + wc[..., None] * corners[2]
        ys.append(gy[inside])
        xs.append(gx[inside])
        places.append(place[inside])
    return np.concatenate(ys), np.concatenate(xs), np.concatenate(places)


def fill_around(image, inside):
    """Gives a copy of the image in which EYE_FILL rings of texels around the texels `inside` take
    the mean color of their neighbors inside, ring by ring."""
    out = image.copy()
    have = inside.copy()
    for _ in range(EYE_FILL):
        total = np.zeros_like(out)
        count = np.zeros(have.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            total += np.roll(out * have[..., None], (dy, dx), axis=(0, 1))
            count += np.roll(have, (dy, dx), axis=(0, 1))
        ring = ~have & (count > 0)
        out[ring] = total[ring] / count[ring, None]
        have |= ring
    return out


def ball_texels(rig):
    """Gives the texels of each eyeball (rows, columns, and the place of each in the seated bind,
    by side), and a mask of the texels of the two balls. It stops when the two balls share more
    than EYE_OVERLAP of their texels, because then no ball can take its own paint."""
    eyes = rig[3]
    taken = np.zeros((SIZE, SIZE), bool)
    texels = {}
    for side in ('L', 'R'):
        ys, xs, places = eye_texels(rig, np.array(eyes[side]['faces']))
        if taken[ys, xs].sum() > EYE_OVERLAP * len(ys):
            sys.exit('The texels of the two eyeballs overlap, so no ball can take its own paint.')
        taken[ys, xs] = True
        texels[side] = (ys, xs, places)
    return texels, taken


def ball_image(rig, out, taken):
    """Gives the image of the float colors `out`, in which the padding texels around the ball
    islands, and the texels of the thin gaps between two ball triangles that the raster of
    eye_texels() leaves, take the new colors of the ball next to them (the texels `taken`). So no
    old color shows as a line on a seam."""
    triangles, points, eyes = rig[0], rig[2], rig[3]
    mask = Image.new('L', (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    for tri in triangles:
        draw.polygon([(float(x) * SIZE, float(y) * SIZE) for x, y in points[tri]], fill=255)
    ball_faces = [f for side in ('L', 'R') for f in eyes[side]['faces']]
    island = np.asarray(draw_triangles(triangles, points, ball_faces, SIZE)
                        .filter(ImageFilter.MaxFilter(3))) > 0
    padding = (~(np.asarray(mask) > 0) | island) & ~taken
    filled = fill_around(out, taken)
    out[padding] = filled[padding]
    return Image.fromarray(np.round(out).clip(0, 255).astype(np.uint8))


def smooth(a, b, x):
    """Gives the smoothstep from 0 at a to 1 at b."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ball_frame(rig, faces):
    """Gives the middle c and the radius r of the sphere of a ball, the ball directions that show
    in the front view (rays along -z: the head of the seated bind faces +z), and the axes of the
    front: t (+z), u (+y), and e (+x)."""
    triangles, positions = rig[0], rig[1]
    corners = positions[triangles]
    middles = corners.mean(axis=1)
    ball = positions[triangles[faces].ravel()]
    fit = np.linalg.lstsq(np.c_[2 * ball, np.ones(len(ball))], (ball ** 2).sum(1), rcond=None)[0]
    c = fit[:3]
    r = float(np.sqrt(fit[3] + c @ c))
    near = np.flatnonzero(np.linalg.norm(middles - c, axis=1) < 3 * r)
    gx, gy = np.meshgrid(np.arange(c[0] - 1.6 * r, c[0] + 1.6 * r, RAY_STEP),
                         np.arange(c[1] - 1.6 * r, c[1] + 1.6 * r, RAY_STEP))
    origins = np.c_[gx.ravel(), gy.ravel(), np.full(gx.size, c[2] + 1.0)]
    down = np.tile([0.0, 0.0, -1.0], (len(origins), 1))
    t_hit, hit, _ = ray_hits(origins, down, corners[near])
    on_ball = (hit >= 0) & np.isin(near[np.maximum(hit, 0)], faces)
    shown = origins[on_ball] + t_hit[on_ball, None] * down[on_ball] - c
    shown /= np.linalg.norm(shown, axis=1)[:, None]
    return c, r, shown


def angles(d, t, u, e):
    """Gives the angles in degrees of the unit directions d: the elevation above the plane of t and
    e (toward u), and the turn across from t (toward e) about u."""
    return np.degrees(np.arcsin(np.clip(d @ u, -1, 1))), np.degrees(np.arctan2(d @ e, d @ t))


def paint_eyes(rig, image):
    """Paints each eyeball as the cartoon eye of the sheet, and gives the new image. The sheet gives
    the fox and the rabbit large dark eyes with one big soft light. A half real eye (a small pupil
    in an amber iris with white around it) read uncanny on the toy-like face. For each side (c, r,
    and the front axes t, u, e of `ball_frame()`), from the ball points that show in the front
    view, with psi the elevation and lam the angle across of `angles()`:
    - The gaze g: GAZE_ACROSS of the middle angle across of the opening, and the middle
      elevation of the opening within GAZE_BAND degrees of that angle, so that both eyes look at
      the viewer nearly parallel.
    - The iris: an oval about g in (lam, psi), IRIS_HEIGHT of half the height of the opening up
      and down, to the inner corner of the opening, and to OUTER_WHITE degrees before its outer
      corner. So the iris fills almost the whole opening, and only a thin off-white edge shows at
      the outer corner. Its color goes from IRIS_DARK to IRIS_LIGHT toward its lower edge, with no
      texture.
    - The pupil: a round black disc about g of PUPIL_SHARE of the vertical iris radius, with a
      soft edge.
    - The sclera: SCLERA.
    The ball takes no painted light: the eye light of the app gives the one big soft light in the
    upper part of both eyes."""
    eyes = rig[3]
    out = np.asarray(image).astype(np.float64)
    texels, taken = ball_texels(rig)
    t, u, e = np.array([0.0, 0, 1]), np.array([0.0, 1, 0]), np.array([1.0, 0, 0])
    dark, light = np.array(IRIS_DARK, float), np.array(IRIS_LIGHT, float)
    for side, sign in (('L', 1.0), ('R', -1.0)):
        faces = np.array(eyes[side]['faces'])
        c, r, shown = ball_frame(rig, faces)
        psi, lam = angles(shown, t, u, e)
        mid_lam = (lam.min() + lam.max()) / 2
        g_lam = GAZE_ACROSS * mid_lam
        band = np.abs(lam - g_lam) < GAZE_BAND
        g_psi = (psi[band].min() + psi[band].max()) / 2
        a_y = IRIS_HEIGHT * (psi[band].max() - psi[band].min()) / 2
        # +lam is +x: the outer side of the left eye and the inner side of the right eye.
        outer = (lam.max() - g_lam if sign > 0 else g_lam - lam.min()) - OUTER_WHITE
        inner = (g_lam - lam.min() if sign > 0 else lam.max() - g_lam) + INNER_REACH
        ys, xs, places = texels[side]
        d = places - c
        d /= np.linalg.norm(d, axis=1)[:, None]
        p_d, l_d = angles(d, t, u, e)
        dl = (l_d - g_lam) * sign
        dp = p_d - g_psi
        a_x = np.where(dl > 0, outer, inner)
        rho = np.hypot(dl / a_x, dp / a_y)
        low = smooth(-0.2, 1.0, -dp / a_y)
        iris = dark * (1 - low[:, None]) + light * low[:, None]
        pupil = 1 - smooth(PUPIL_SHARE - 0.05, PUPIL_SHARE + 0.03, np.hypot(dl, dp) / a_y)
        color = iris * (1 - pupil[:, None]) + np.array(PUPIL_COLOR, float) * pupil[:, None]
        to_white = smooth(1 - IRIS_SOFT, 1 + IRIS_SOFT, rho)
        color = color * (1 - to_white[:, None]) + np.array(SCLERA, float) * to_white[:, None]
        out[ys, xs] = color
        print(f'eye {side}: opening elevation {psi[band].min():.1f} to {psi[band].max():.1f} at the '
              f'gaze, across {lam.min():.1f} to {lam.max():.1f} degrees; gaze psi {g_psi:.1f}, lam '
              f'{g_lam:.1f}; iris radii {a_y:.1f} up, {inner:.1f} in, {outer:.1f} out; pupil radius '
              f'{PUPIL_SHARE * a_y:.1f} degrees')
    return ball_image(rig, out, taken)


def sample(image, points):
    """Gives the bilinear colors of an image (float, H x W x 3) at texture points."""
    x = np.clip(points[:, 0] * SIZE - 0.5, 0, SIZE - 1.001)
    y = np.clip(points[:, 1] * SIZE - 0.5, 0, SIZE - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    return ((1 - fx) * (1 - fy) * image[y0, x0] + fx * (1 - fy) * image[y0, x0 + 1]
            + (1 - fx) * fy * image[y0 + 1, x0] + fx * fy * image[y0 + 1, x0 + 1])


def turn_matrix(a, b):
    """Gives the matrix of the shortest turn that takes the unit vector a to the unit vector b."""
    axis = np.cross(a, b)
    s = np.linalg.norm(axis)
    if s < 1e-9:
        return np.eye(3)
    k = axis / s
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    angle = np.arctan2(s, a @ b)
    return np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * K @ K


def angle_to(a, b):
    """Gives the angle in degrees between each unit vector of a and the unit vector b."""
    return np.degrees(np.arccos(np.clip(a @ b, -1, 1)))


def mirror(d, axis):
    """Gives the unit directions d mirrored about the vertical plane (the plane of +y) through the
    unit direction axis."""
    across = np.cross([0.0, 1.0, 0.0], axis)
    across /= np.linalg.norm(across)
    return d - 2 * (d @ across)[:, None] * across


def ball_colors(rig, faces, c, directions, src):
    """Gives the color of the image src on the ball at each direction from its middle c (a ray from
    c to the ball triangles), and a mask of the directions that hit the ball."""
    triangles, positions, points = rig[:3]
    ball = positions[triangles[faces]]
    _, k, bary = ray_hits(np.tile(c, (len(directions), 1)), directions, ball)
    # A ray through a small crack between two ball triangles takes the nearer triangle.
    miss = np.flatnonzero(k < 0)
    _, k2, bary2 = ray_hits(np.tile(c, (len(miss), 1)), directions[miss], ball, WIDE_EDGE)
    k[miss], bary[miss] = k2, bary2
    found = k >= 0
    tri = triangles[faces[k[found]]]
    u, v = bary[found, 0], bary[found, 1]
    uv = ((1 - u - v)[:, None] * points[tri[:, 0]] + u[:, None] * points[tri[:, 1]]
          + v[:, None] * points[tri[:, 2]])
    colors = np.zeros((len(directions), 3))
    colors[found] = sample(src, uv)
    return colors, found


def front_cells(d):
    """Gives the cell (row, column) of each unit direction d in the front picture of a ball: the
    x and y of d over FRONT_GRID cells from -1 to 1."""
    col = np.clip(((d[:, 0] + 1) / 2 * FRONT_GRID).astype(int), 0, FRONT_GRID - 1)
    row = np.clip(((1 - d[:, 1]) / 2 * FRONT_GRID).astype(int), 0, FRONT_GRID - 1)
    return row, col


def gaze_targets(rig):
    """Gives the target t of the iris of each side: the ball direction in the middle of the eye
    opening that the camera of the play sees (PLAY_HEAD_PITCH and PLAY_CAMERA_ELEVATION), turned
    out by GAZE_OUT and up by GAZE_UP degrees. The rays of the view come from the camera direction
    v, parallel. The middle of the opening is the mean place of the ball points that the rays hit,
    across the view, and t is the hit nearest to it. The two targets are mirror images (the mean
    of the two sides), so the eyes stay parallel."""
    triangles, positions, eyes = rig[0], rig[1], rig[3]
    corners = positions[triangles]
    middles = corners.mean(axis=1)
    up = np.radians(PLAY_HEAD_PITCH + PLAY_CAMERA_ELEVATION)
    v = np.array([0.0, np.sin(up), np.cos(up)])
    across = np.array([1.0, 0.0, 0.0])
    tilt = np.cross(v, across)
    found = {}
    for side in ('L', 'R'):
        faces = np.array(eyes[side]['faces'])
        c, r, _ = ball_frame(rig, faces)
        near = np.flatnonzero(np.linalg.norm(middles - c, axis=1) < 3 * r)
        steps = np.arange(-1.6 * r, 1.6 * r, RAY_STEP)
        gx, gy = np.meshgrid(steps, steps)
        origins = c + gx.ravel()[:, None] * across + gy.ravel()[:, None] * tilt + v
        rays = np.tile(-v, (len(origins), 1))
        t_hit, hit, _ = ray_hits(origins, rays, corners[near])
        on_ball = (hit >= 0) & np.isin(near[np.maximum(hit, 0)], faces)
        flat = np.c_[gx.ravel(), gy.ravel()][on_ball]
        shown = origins[on_ball] + t_hit[on_ball, None] * rays[on_ball] - c
        shown /= np.linalg.norm(shown, axis=1)[:, None]
        middle = flat.mean(axis=0)
        found[side] = (shown[np.argmin(np.linalg.norm(flat - middle, axis=1))], c, r, middle,
                       np.sqrt(len(flat) / np.pi) * RAY_STEP)
    x = (found['L'][0][0] - found['R'][0][0]) / 2
    y = (found['L'][0][1] + found['R'][0][1]) / 2
    targets = {}
    for side, sign in (('L', 1.0), ('R', -1.0)):
        psi = np.arcsin(y) + np.radians(GAZE_UP)
        lam = np.arcsin(x / np.cos(np.arcsin(y))) + np.radians(GAZE_OUT)
        targets[side] = np.array([sign * np.cos(psi) * np.sin(lam), np.sin(psi),
                                  np.cos(psi) * np.cos(lam)])
        middle_t, c, r, middle, radius = found[side]
        # The place of the iris middle in the play view against the middle of the opening.
        place = (r * targets[side]) @ np.c_[across, tilt]
        offset = (place - middle) / radius * [sign, 1]
        print(f'gaze {side}: the play view looks down {PLAY_HEAD_PITCH + PLAY_CAMERA_ELEVATION:.1f} '
              f'degrees; the middle of its opening at x {middle_t[0]:+.3f}, y {middle_t[1]:+.3f} of '
              f'the ball radius, the target at x {targets[side][0]:+.3f}, y {targets[side][1]:+.3f} '
              f'({GAZE_OUT:.1f} degrees out, {GAZE_UP:.1f} up): {offset[0]:+.2f} out and '
              f'{offset[1]:+.2f} up of the middle in the play view, in opening radii')
    return targets


def center_irises(rig, image):
    """Moves the iris of each eyeball, with its pupil and its painted light, as one decal to the
    middle of the eye opening of the play view (`gaze_targets()`), and gives the new image and the
    middle p of the pupil of each side in the source (`far_eyes()`). The source map paints
    each iris at the inner corner of its opening, so in the front view the rabbit looked
    cross-eyed. The map paints only a band of the ball around the opening, so a turn of the whole
    ball would show the dark rest of the ball in the opening. The source map of the rabbit paints
    no light on the eye, so no light moves. For each side, with c, r, and the
    ball directions of the front view of `ball_frame()`:
    - The opening: the cells of the front picture (`front_cells()`) that the front directions
      fill. The target t of the iris is the middle of the opening in the play view, a little out
      and up (`gaze_targets()`).
    - The core of the opening: the opening less EDGE_CELLS cells at its edge, where a dark lash
      line can lie.
    - The pupil p: the middle of the cells of the core with a texel of luma below PUPIL_LUMA in
      front, after an erosion to the last cells. The thin lash line and the dark ring of the iris
      go first, so the last cells lie in the middle of the pupil.
    - The iris radius a: the angle from p of the first ring of 1 degree in which at least
      IRIS_WHITE of the texels of the opening are white, plus IRIS_EDGE.
    - The iris paint: the ball directions within a of p in the core.
    - With R the turn that takes p to t, each ball texel at the direction d within a of t takes
      the source color at R^-1 d when that point is iris paint (the moved iris). The source map
      stops the iris at the inner corner of the opening, so a point outside the iris paint takes
      the mirror of R^-1 d about the vertical plane through p, on the other side of the same iris.
      When the mirror is no iris paint too, the texel keeps its color.
    - Each other texel within a of p (the old place of the iris) in the opening, but a dark lash
      line at its edge (LASH_LINE), takes the source color at its mirror about the vertical plane
      through t: the white of the other side, with its shade under the lid. A mirror point in the
      iris paint takes the median white of the opening. With no LASH_LINE, a mirror point within a
      of p at the edge of the opening also takes the median white.
    No texel takes a new color: each one is a copy of a texel of the same ball."""
    eyes = rig[3]
    out = np.asarray(image).astype(np.float64)
    texels, taken = ball_texels(rig)
    src = fill_around(out, taken)
    targets = gaze_targets(rig)
    pupils = {}
    for side in ('L', 'R'):
        faces = np.array(eyes[side]['faces'])
        c, r, shown = ball_frame(rig, faces)
        ys, xs, places = texels[side]
        d = places - c
        d /= np.linalg.norm(d, axis=1)[:, None]
        colors = src[ys, xs]
        luma = colors @ [0.2126, 0.7152, 0.0722]
        top, low = colors.max(axis=1), colors.min(axis=1)
        white = (low > WHITE_LOW) & ((top - low) / np.maximum(top, 1) < WHITE_SAT)

        # The opening, its core, and the front texel of each cell.
        grid = np.zeros((FRONT_GRID, FRONT_GRID), bool)
        grid[front_cells(shown)] = True
        grid = np.asarray(Image.fromarray(grid).filter(ImageFilter.MaxFilter(3))
                          .filter(ImageFilter.MinFilter(3))) > 0
        core = np.asarray(Image.fromarray(grid).filter(ImageFilter.MinFilter(2 * EDGE_CELLS + 1))) > 0
        row, col = front_cells(d)
        front = d[:, 2] > 0
        in_opening = front & grid[row, col]
        order = np.lexsort((-d[:, 2], row * FRONT_GRID + col))
        order = order[front[order]]
        cell = (row * FRONT_GRID + col)[order]
        first = order[np.r_[True, cell[1:] != cell[:-1]]]
        dark = np.zeros((FRONT_GRID, FRONT_GRID), bool)
        seen = np.zeros((FRONT_GRID, FRONT_GRID), bool)
        seen[row[first], col[first]] = True
        dark[row[first], col[first]] = luma[first] < PUPIL_LUMA
        # A cell with no texel takes the dark of its neighbors.
        near = np.asarray(Image.fromarray(dark).filter(ImageFilter.MaxFilter(3))) > 0
        dark = (dark | (~seen & near)) & core
        print(f'eye {side}: {int(seen[grid].mean() * 100)} % of the opening cells hold a texel, '
              f'{int(dark.sum())} dark cells')
        # The thin lash line and the dark ring of the iris go first in the erosion, so the last
        # cells hold the middle of the pupil.
        while True:
            less = np.asarray(Image.fromarray(dark).filter(ImageFilter.MinFilter(3))) > 0
            if not less.any():
                break
            dark = less
        if not dark.any():
            sys.exit(f'The eye {side} shows no pupil in the front view.')
        labels, _ = parts(dark)
        sizes = np.bincount(labels.ravel())[1:]
        rows, cols = np.nonzero(labels == 1 + int(np.argmax(sizes)))
        x = (cols.mean() + 0.5) / FRONT_GRID * 2 - 1
        y = 1 - (rows.mean() + 0.5) / FRONT_GRID * 2
        p = np.array([x, y, np.sqrt(max(0.0, 1 - x * x - y * y))])
        pupils[side] = p

        # The iris radius: the first ring with white in the opening.
        rings = angle_to(d, p)

        def white_share(k):
            band = (rings >= k) & (rings < k + 1) & in_opening
            return white[band].mean() if band.any() else 0.0

        shares = np.array([white_share(k) for k in range(IRIS_SEARCH)])
        a = float(np.argmax(shares >= IRIS_WHITE)) + IRIS_EDGE
        t = targets[side]
        turn = turn_matrix(p, t)

        def is_iris(q, cells=core):
            q_row, q_col = front_cells(q)
            return (angle_to(q, p) < a) & (q[:, 2] > 0) & cells[q_row, q_col]

        new = colors.copy()
        target = np.flatnonzero(angle_to(d, t) < a)
        source = d[target] @ turn
        own = is_iris(source)
        flip = ~own & is_iris(mirror(source, p))
        source[flip] = mirror(source[flip], p)
        use = own | flip
        got, found = ball_colors(rig, faces, c, source[use], src)
        written = np.zeros(len(d), bool)
        written[target[use][found]] = True
        new[target[use][found]] = got[found]
        # The old place of the iris takes the white across, but a lash line at the edge of the
        # opening stays.
        sclera = np.median(colors[in_opening & white], axis=0)
        lash = ~core[row, col] & (luma < PUPIL_LUMA) & LASH_LINE
        left = np.flatnonzero((rings < a) & in_opening & ~written & ~lash)
        across = mirror(d[left], t)
        got, found = ball_colors(rig, faces, c, across, src)
        in_old = is_iris(across, core if LASH_LINE else grid)
        got[in_old | ~found] = sclera
        new[left] = got
        out[ys, xs] = new
        unit = np.sqrt(len(shown) / np.pi) * RAY_STEP / r
        shift = (t[:2] - p[:2]) / unit
        print(f'iris {side}: pupil at x {p[0]:.3f}, y {p[1]:.3f} of the ball radius, target '
              f'at x {t[0]:.3f}, y {t[1]:.3f}; the iris of {a:.1f} degrees moves '
              f'{angle_to(p[None], t)[0]:.1f} degrees ({shift[0]:+.2f}, {shift[1]:+.2f} opening '
              f'radii in x, y); {int(flip.sum())} iris texels mirror, {len(left)} texels '
              f'take the white across, {int(in_old.sum())} of them the median white '
              f'{np.round(sclera).astype(int).tolist()}')
    return ball_image(rig, out, taken), pupils


def far_eyes(rig, image, source, pupils):
    """Gives the image with the eyes finished for the far view of the hall. `image` is the image of
    `center_irises()`, `source` the image before it, and `pupils` the middle p of each pupil in
    the source. The source paints each pupil off the middle of its iris, as an eye that looks to
    the side: the iris is a thick crescent on one side of the pupil and thin on the other. After
    the move of `center_irises()` the iris kept that shape, and a mirror of it showed as a second
    dark crescent. At the far view, a wide white field around the iris also showed. So the eyes
    read as startled or as a side glance. For each side:
    - The edges about p, for each direction phi about p in steps of FAR_PHI_STEP degrees, from the
      source colors on the ball at steps of FAR_THETA_STEP degrees from p: the pupil edge rho(phi)
      is the first step above PUPIL_LUMA, and the iris edge R(phi) the first white step after it
      (WHITE_LOW, WHITE_SAT), before FAR_REACH degrees. A clean direction shows both edges
      within FAR_CLEAN of their medians. In the other directions the lash line or the paint of
      the lid joins the iris. Each edge of the clean directions takes the circular median of
      FAR_SMOOTH clean directions.
    - The new iris: its middle n is the target t of the play view (`gaze_targets()`) turned out
      by FAR_GAZE_OUT degrees, its radius A is IRIS_SCALE times the median of R, and its pupil
      radius P is PUPIL_RATIO of A. Each ball texel at the angle theta and the direction phi about
      n within A, but a dark lash line at the edge of the opening (LASH_LINE), takes the mix of
      the source colors of the two clean directions g on the two sides of phi, by its angle
      between them. In a direction g, the source color is at the angle theta / P * rho(g) from p
      in the pupil, or rho(g) + (theta - P) / (A - P) * (R(g) - rho(g)) in the iris. So the pupil
      lies in the middle of a round iris, and the dark ring and the texture of the iris stay.
    - In Oklab, each white texel outside the new iris takes SCLERA_SHADE of its lightness and the
      step SCLERA_WARM, by its share of white (WHITE_LUMA, WHITE_SATURATION). Each other texel in
      the new iris takes IRIS_SHADE of its lightness, and in the outer RING_WIDTH of the iris also
      RING_SHADE. A white texel in the iris keeps its lightness.
    Each texel is a copy of a texel of the same ball, or a darker or warmer tone of it."""
    eyes = rig[3]
    out = np.asarray(image).astype(np.float64)
    texels, taken = ball_texels(rig)
    src = fill_around(np.asarray(source).astype(np.float64), taken)
    up = np.array([0.0, 1.0, 0.0])
    targets = gaze_targets(rig)
    for side in ('L', 'R'):
        faces = np.array(eyes[side]['faces'])
        c, r, shown = ball_frame(rig, faces)
        ys, xs, places = texels[side]
        d = places - c
        d /= np.linalg.norm(d, axis=1)[:, None]
        colors = out[ys, xs]
        luma = colors @ [0.2126, 0.7152, 0.0722]
        grid = np.zeros((FRONT_GRID, FRONT_GRID), bool)
        grid[front_cells(shown)] = True
        grid = np.asarray(Image.fromarray(grid).filter(ImageFilter.MaxFilter(3))
                          .filter(ImageFilter.MinFilter(3))) > 0
        core = np.asarray(Image.fromarray(grid).filter(ImageFilter.MinFilter(2 * EDGE_CELLS + 1))) > 0
        row, col = front_cells(d)
        t = targets[side]

        # The pupil edge and the iris edge about p in each direction, in the source.
        p = pupils[side]
        e_p = np.cross(up, p)
        e_p /= np.linalg.norm(e_p)
        u_p = np.cross(p, e_p)
        phi = np.radians(np.arange(0.0, 360.0, FAR_PHI_STEP))
        steps = np.arange(0.0, FAR_REACH, FAR_THETA_STEP)
        th, ph = np.meshgrid(np.radians(steps), phi)
        q = (np.cos(th).ravel()[:, None] * p + (np.sin(th) * np.cos(ph)).ravel()[:, None] * e_p
             + (np.sin(th) * np.sin(ph)).ravel()[:, None] * u_p)
        got, found = ball_colors(rig, faces, c, q, src)
        got = got.reshape(len(phi), len(steps), 3)
        found = found.reshape(len(phi), len(steps))
        top, low = got.max(axis=2), got.min(axis=2)
        white = found & (low > WHITE_LOW) & ((top - low) / np.maximum(top, 1) < WHITE_SAT)
        light = found & (got @ [0.2126, 0.7152, 0.0722] > PUPIL_LUMA)
        rho = np.full(len(phi), np.nan)
        edge = np.full(len(phi), np.nan)
        for k in range(len(phi)):
            out_of_pupil = np.flatnonzero(light[k])
            if not len(out_of_pupil):
                continue
            rho[k] = steps[out_of_pupil[0]]
            past = np.flatnonzero(white[k, out_of_pupil[0]:])
            if len(past):
                edge[k] = steps[out_of_pupil[0] + past[0]]
        # A clean direction shows both edges near their medians. In the other directions the lash
        # line or the paint of the lid joins the iris, so each of them takes the nearest clean
        # direction.
        clean = ~np.isnan(rho) & ~np.isnan(edge)
        if clean.sum() < len(phi) // 4:
            sys.exit(f'The eye {side} shows both edges in only {int(clean.sum())} directions.')
        mid_rho, mid_edge = np.median(rho[clean]), np.median(edge[clean])
        clean &= (np.abs(rho - mid_rho) < FAR_CLEAN[0] * mid_rho)
        clean &= (np.abs(edge - mid_edge) < FAR_CLEAN[1] * mid_edge)
        good = np.flatnonzero(clean)
        if len(good) < len(phi) // 4:
            sys.exit(f'The eye {side} has only {len(good)} clean directions.')
        rho, edge = rho[good], edge[good]
        half = FAR_SMOOTH // 2
        for values in (rho, edge):
            ring = np.r_[values[-half:], values, values[:half]]
            values[:] = [np.median(ring[k:k + FAR_SMOOTH]) for k in range(len(good))]

        # The new iris about n.
        big = IRIS_SCALE * float(mid_edge)
        small = PUPIL_RATIO * big
        if FAR_GAZE_OUT > big - mid_edge:
            sys.exit(f'FAR_GAZE_OUT is more than the growth of the iris radius, '
                     f'{big - mid_edge:.1f} degrees.')
        sign = 1.0 if side == 'L' else -1.0
        turn = np.radians(sign * FAR_GAZE_OUT)
        n = np.array([t[0] * np.cos(turn) + t[2] * np.sin(turn), t[1],
                      t[2] * np.cos(turn) - t[0] * np.sin(turn)])
        e_n = np.cross(up, n)
        e_n /= np.linalg.norm(e_n)
        u_n = np.cross(n, e_n)
        theta = angle_to(d, n)
        lash = ~core[row, col] & (luma < PUPIL_LUMA) & LASH_LINE
        sel = np.flatnonzero((theta < big) & ~lash)
        th = theta[sel]
        # Each texel takes the mix of the two clean directions on its two sides, by its angle
        # between them.
        x = np.mod(np.degrees(np.arctan2(d[sel] @ u_n, d[sel] @ e_n)), 360.0) / FAR_PHI_STEP
        after = np.searchsorted(good, x) % len(good)
        before = (after - 1) % len(good)
        span = np.mod(good[after] - good[before], len(phi))
        span = np.where(span == 0, len(phi), span)
        share = np.mod(x - good[before], len(phi)) / span
        got = np.zeros((len(sel), 3))
        found = np.ones(len(sel), bool)
        for g, weight in ((before, 1 - share), (after, share)):
            rho_k, edge_k = rho[g], edge[g]
            old = np.where(th < small, th / small * rho_k,
                           rho_k + (th - small) / (big - small) * (edge_k - rho_k))
            a = phi[good[g]]
            o = np.radians(old)
            q = (np.cos(o)[:, None] * p + (np.sin(o) * np.cos(a))[:, None] * e_p
                 + (np.sin(o) * np.sin(a))[:, None] * u_p)
            part, hit = ball_colors(rig, faces, c, q, src)
            got += weight[:, None] * part
            found &= hit
        new = colors.copy()
        new[sel[found]] = got[found]

        new_luma = new @ [0.2126, 0.7152, 0.0722]
        top, low = new.max(axis=1), new.min(axis=1)
        whiteness = (smooth(*WHITE_LUMA, new_luma)
                     * (1 - smooth(*WHITE_SATURATION, (top - low) / np.maximum(top, 1))))
        inside = theta < big
        lab = oklab(linear(new))
        sclera = whiteness * ~inside
        lab[:, 0] *= 1 - sclera * (1 - SCLERA_SHADE)
        lab[:, 1] += sclera * SCLERA_WARM[0]
        lab[:, 2] += sclera * SCLERA_WARM[1]
        ring = smooth(big * (1 - RING_WIDTH) - 1, big * (1 - RING_WIDTH) + 1, theta)
        shade = IRIS_SHADE * (1 - ring * (1 - RING_SHADE))
        lab[:, 0] *= 1 - (1 - whiteness) * inside * (1 - shade)
        out[ys, xs] = srgb8(linear_of_oklab(lab))
        print(f'far eye {side}: {len(good)} of {len(phi)} directions clean, pupil edge '
              f'{mid_rho:.1f} and iris edge {mid_edge:.1f} degrees about the pupil; new pupil '
              f'{small:.1f}, new iris {big:.1f} degrees; {len(sel)} texels take the round iris, '
              f'{int((sclera > 0.5).sum())} white texels take the tone of the sclera')
    return ball_image(rig, out, taken)


def loose_parts(rig):
    """Gives the part of each vertex of the fur primitive: the vertices of one triangle, and the
    vertices at the same place (the two sides of a UV seam), are in one part. The part ids are
    the smallest vertex of each part."""
    triangles, positions = rig[0], rig[1]
    parent = np.arange(len(positions))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def join(a, b):
        a, b = find(a), find(b)
        parent[max(a, b)] = min(a, b)

    for a, b, c in triangles:
        join(a, b)
        join(a, c)
    _, first, same = np.unique(np.round(positions, 6), axis=0, return_index=True,
                               return_inverse=True)
    for i, k in enumerate(same.ravel()):
        join(i, first[k])
    return np.array([find(i) for i in range(len(positions))])


def soften_brows(rig, image):
    """Moves the brows and the eye sockets toward the fur around them, and gives the new image.
    The brows are the two loose parts with each vertex above the top of the eyeballs. The sockets
    are the faces of the body near each ball (SOCKET_REACH). Each texel of their triangles, and
    SOFT_MARGIN texels around them but no eyeball texel, takes in Oklab the fur color of its side
    plus BROW_CONTRAST or SOCKET_CONTRAST of its step from that color. On a brow, the share fades
    to 0 in BROW_FADE of the length at each end, so the brow paint is also shorter. The fur color of a side is
    the median texel of the body faces from SOCKET_REACH to FUR_REACH ball radii of its ball."""
    triangles, positions, points, eyes = rig[:4]
    part = loose_parts(rig)
    ids, counts = np.unique(part, return_counts=True)
    body = ids[np.argmax(counts)]
    ball_faces = [f for side in ('L', 'R') for f in eyes[side]['faces']]
    ball_top = positions[triangles[ball_faces].ravel(), 1].max()
    face_part = part[triangles[:, 0]]
    out = np.asarray(image).copy()
    lab = oklab(linear(out))
    balls = np.asarray(draw_triangles(triangles, points, ball_faces, SIZE)) > 0
    for side, sign in (('L', 1.0), ('R', -1.0)):
        c, r, _ = ball_frame(rig, np.array(eyes[side]['faces']))
        reach = np.linalg.norm(positions[triangles] - c, axis=2).max(axis=1) / r
        body_faces = face_part == body
        sockets = np.flatnonzero(body_faces & (reach < SOCKET_REACH))
        ring = np.flatnonzero(body_faces & (reach >= SOCKET_REACH) & (reach < FUR_REACH))
        ring_texels = np.asarray(draw_triangles(triangles, points, ring, SIZE)) > 0
        fur = np.median(lab[ring_texels & ~balls], axis=0)
        brows = [k for k in ids if k != body and (positions[part == k, 1] > ball_top).all()
                 and sign * positions[part == k, 0].mean() > 0]
        if len(brows) != 1:
            sys.exit(f'The {side} side has {len(brows)} brow parts in place of 1.')
        brow_faces = np.flatnonzero(face_part == brows[0])
        # The place of each brow texel along the brow, from 0 at its inner end to 1 at its outer
        # end, gives the fade of its contrast at the two ends.
        ys, xs, places = eye_texels(rig, brow_faces)
        ends = np.abs(positions[part == brows[0], 0])
        along = (np.abs(places[:, 0]) - ends.min()) / (ends.max() - ends.min())
        fade = np.zeros((SIZE, SIZE, 3))
        fade[ys, xs] = (smooth(0, BROW_FADE, along) * smooth(0, BROW_FADE, 1 - along))[:, None]
        raster = np.zeros((SIZE, SIZE), bool)
        raster[ys, xs] = True
        fade = fill_around(fade, raster)[..., 0]
        for name, faces, keep in (('brow', brow_faces, BROW_CONTRAST * fade),
                                  ('socket', sockets, np.full((SIZE, SIZE), SOCKET_CONTRAST))):
            mask = np.asarray(draw_triangles(triangles, points, faces, SIZE)
                              .filter(ImageFilter.MaxFilter(2 * SOFT_MARGIN + 1))) > 0
            mask &= ~balls
            share = keep[mask][:, None]
            step = np.abs(lab[mask][:, 0] - fur[0])
            out[mask] = srgb8(linear_of_oklab(fur + share * (lab[mask] - fur)))
            print(f'{name} {side}: {len(faces)} faces, {int(mask.sum())} texels; fur Oklab L '
                  f'{fur[0]:.3f}; the mean lightness step to the fur goes from {step.mean():.3f} to '
                  f'{(share[:, 0] * step).mean():.3f}')
    return Image.fromarray(out)


def write_color_map():
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    rig = read_rig(RIG)
    if EYE_PAINT == 'cartoon':
        image = paint_eyes(rig, image)
    elif EYE_PAINT == 'centered':
        centered, pupils = center_irises(rig, image)
        image = far_eyes(rig, centered, image, pupils)
    image = soften_brows(rig, image)
    lab = oklab(linear(np.asarray(image)))
    eyes, count = eye_mask(rig, SIZE)
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
