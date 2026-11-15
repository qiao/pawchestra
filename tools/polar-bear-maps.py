# Writes the web color map and the web normal map of the Tripo polar bear from the maps of its FBX
# (design 4.5, assets/models/polar-bear/README.md, "Color map" and "Normal map"). The color map
# scales the source image to 2048 pixels and moves each texel in Oklab. The tan fur of the source
# goes to the white of the main polar bear in the hall light, and it keeps its strands as small
# steps of the lightness. The dark pads and mouth line keep their lightness, and the nose and the
# claws turn as dark as the nose and the black claws of the main polar bear. The texels of the
# eyeballs keep the eye paint of the source, with each iris moved to the middle of its opening in
# the view of the play (`EYE_PAINT`, "Eyes" of the README). The script reads the triangles, the
# places, and the texture points of the eyeballs (`ownEyes` of the export) and of the claws (the
# loose parts of CLAW_PARTS positions) from the rig file. The normal map limits each tilt of the
# source, scales it to 1024 pixels, and stores the tilts times NORMAL_MAP_GAIN of src/scene/fur.ts.
# The output depends only on the input files and on cwebp 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I
#   tools/polar-bear-maps.py
import json
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fur_maps import (  # noqa: E402
    SIZE, linear, linear_of_oklab, normal_map, oklab, smoothstep, srgb8,
)

SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/polar-bear/tripo-p2/polar-bear.fbm/polar-bear_normal.jpg'
RIG = 'assets/models/polar-bear/tripo-hand/polar-bear.rig.glb'
COLOR_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-color.webp'
NORMAL_OUT = 'assets/models/polar-bear/tripo-hand/polar-bear-normal.webp'
QUALITY = 60

#: The Oklab lightness, chroma, and hue (degrees) of the tan fur of the source map: the median
#: of the texels with a lightness above 0.72.
SOURCE_FUR = (0.841, 0.069, 74.3)
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
#: the Tripo mesh have 28 or 29 vertices, and the eyeballs and the lids more than 40.
CLAW_PARTS = (25, 40)
#: The texels around the claw triangles that take the claw color too.
CLAW_MARGIN = 2
#: The box of the nose in the places of the rig file (the seated bind): a triangle with its three
#: corners in the box is a nose triangle. The nose takes the color map with the smooth normals of
#: the fur. As flat gloss faces, it showed a light square in the key light.
NOSE_BOX = ((-0.03, 0.834, 0.187), (0.03, 0.887, 0.217))
#: The Oklab lightness, chroma, and hue (degrees) of the nose. The painted nose of the source
#: (median Oklab L 0.336 of its dark texels) read brown in the hall light beside the near black nose of the main polar bear.
NOSE = (0.22, 0.012, 55.0)
#: The share of the lightness steps of the nose texels around their median that the nose keeps,
#: so that the nostrils of the source still show.
NOSE_STEPS = 0.5
#: The paint of the eyeballs. 'source' keeps the eye of the source map: a black pupil in a brown
#: iris with a painted white light, and white at the outer corner. 'centered' keeps the same paint,
#: and moves the iris with its pupil and its light to the middle of the eye opening of the view of
#: the play (`center_irises()`).
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
#: opening: then the dark texels of these cells stay at the old place of the iris. With False, the
#: old place of the iris takes white up to the edge.
LASH_LINE = True
#: The barycentric slack of a second try for a ray from the middle of a ball that hits no ball
#: triangle.
WIDE_EDGE = 0.05
#: The view of the play, in which each iris lies in the middle of its opening
#: (`gaze_targets()`): the head of the pianist turns down by PLAY_HEAD_PITCH degrees in the
#: play moments (`pnpm pose-preview pianist`: chord, between, far-left, far-right), and the camera
#: of the test page looks down at the eyes by PLAY_CAMERA_ELEVATION degrees. So the camera lies
#: above the forward axis of the head by the sum.
PLAY_HEAD_PITCH = 5.2
PLAY_CAMERA_ELEVATION = 0.3
#: The turn in degrees of each iris target out and up from the middle of the opening in the play
#: view. A small turn out stops a cross-eyed look.
GAZE_OUT = 6.0
GAZE_UP = 5.0
#: The tone of the eyes for the far view of the hall (`far_tone()`), with the values of
#: `far_eyes()` of the Tripo fox and rabbit for a dark iris (the brown iris of the bear has the
#: median Oklab L 0.39). There each eye is a few pixels across, and the bright white around the
#: iris read dim and as a side glance. The source paints white only at the outer corner, so the
#: round iris of `far_eyes()` finds both edges of the iris in too few directions, and this step
#: only tones the paint. IRIS_SHADE scales the Oklab lightness of the iris, SCLERA_SHADE the
#: lightness of the white, and SCLERA_WARM is the Oklab (a, b) step of the white to a warm
#: ivory. A texel goes from iris to white by a soft step of its luma (WHITE_LUMA, sRGB) and of its
#: saturation (WHITE_SATURATION). The painted light is a gray white (luma 180 to 226, as the
#: white), so it takes the tone of the white.
IRIS_SHADE = 0.9
SCLERA_SHADE = 0.85
SCLERA_WARM = (0.008, 0.03)
WHITE_LUMA = (90.0, 170.0)
WHITE_SATURATION = (0.2, 0.4)
#: The brows (`soften_brows()`). The source paints a gray brown brow over each eye on the body
#: faces, and in the hall view it read as a dark band over the eye. A brow face is a face of the
#: body with each corner within BROW_REACH ball radii of the middle of a ball, a corner past
#: SOCKET_REACH (so that the lash line of the socket stays), and its middle more than BROW_ABOVE
#: ball radii above that middle. Its texels keep BROW_CONTRAST of their step from the fur color of
#: the side: the median texel of the body faces from BROW_REACH to FUR_REACH ball radii.
BROW_REACH = 3.4
SOCKET_REACH = 1.5
BROW_ABOVE = 0.3
FUR_REACH = 4.4
BROW_CONTRAST = 0.5
#: The texels around the brow triangles that also soften, so that the bilinear texture sample at
#: the edge of a triangle takes no old dark color.
SOFT_MARGIN = 2
#: The largest share of the texels of an eyeball that can also lie in the other eyeball.
EYE_OVERLAP = 0.01
#: The rounds of the fill of the texels around the eyeball triangles before the turned ball samples
#: the map, so that a sample at the edge of a texture island takes no color from outside it.
EYE_FILL = 4
#: The barycentric slack of a ray hit, so that a ray on the edge of two triangles hits one.
EDGE = 1e-4
#: The step of the grid of the front rays over each eye, in units of the rig file.
RAY_STEP = 0.0005


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


def nose_mask(rig, size):
    """Gives the texels of the nose triangles of the rig file (NOSE_BOX), grown by CLAW_MARGIN
    texels, and the count of the triangles."""
    triangles, positions, points, _ = rig
    low, high = (np.array(corner) for corner in NOSE_BOX)
    inside = np.all((positions >= low) & (positions <= high), axis=1)
    faces = np.flatnonzero(inside[triangles].all(axis=1))
    mask = draw_triangles(triangles, points, faces, size)
    mask = mask.filter(ImageFilter.MaxFilter(2 * CLAW_MARGIN + 1))
    return np.asarray(mask) > 0, len(faces)


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
    share = smoothstep(*DARK, lightness)[..., None]
    return dark + share * (fur - dark)


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
    middle of the eye opening of the play view (`gaze_targets()`), and gives the new image. The
    source map paints each iris at the inner corner of its opening, so in the front view the bear
    looked cross-eyed. The map paints only a band of the ball around the opening, so a turn of the
    whole ball would show the dark rest of the ball in the opening. For each side, with c, r, and the
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
    return ball_image(rig, out, taken)


def far_tone(rig, image):
    """Gives the image with the tone of the eyes for the far view (IRIS_SHADE, SCLERA_SHADE): each
    texel of an eyeball moves in Oklab by its white share w, the soft step of its luma times one
    less the soft step of its saturation. The lightness takes the factor IRIS_SHADE (1 - w) +
    SCLERA_SHADE w, and the white also takes w times the step SCLERA_WARM."""
    out = np.asarray(image).astype(np.float64)
    _, taken = ball_texels(rig)
    colors = out[taken]
    luma = colors @ [0.2126, 0.7152, 0.0722]
    top, low = colors.max(axis=1), colors.min(axis=1)
    saturation = (top - low) / np.maximum(top, 1)
    w = smoothstep(*WHITE_LUMA, luma) * (1 - smoothstep(*WHITE_SATURATION, saturation))
    lab = oklab(linear(colors))
    lab[:, 0] *= IRIS_SHADE * (1 - w) + SCLERA_SHADE * w
    lab[:, 1:] += w[:, None] * np.array(SCLERA_WARM)
    out[taken] = srgb8(linear_of_oklab(lab))
    print(f'far tone: {int(taken.sum())} ball texels, mean white share {w.mean():.2f}')
    return Image.fromarray(np.round(out).astype(np.uint8))


def soften_brows(rig, image):
    """Moves the painted brows toward the fur around them (BROW_CONTRAST), and gives the new
    image. Each texel of the brow triangles of a side, and SOFT_MARGIN texels around them but no
    eyeball texel, takes in Oklab the fur color of its side plus BROW_CONTRAST of its step from
    that color."""
    triangles, positions, points, eyes = rig[:4]
    out = np.asarray(image).copy()
    lab = oklab(linear(out))
    ball_faces = [f for side in ('L', 'R') for f in eyes[side]['faces']]
    balls = np.asarray(draw_triangles(triangles, points, ball_faces, SIZE)) > 0
    body = np.ones(len(triangles), bool)
    body[ball_faces] = False
    corners = positions[triangles]
    for side in ('L', 'R'):
        c, r, _ = ball_frame(rig, np.array(eyes[side]['faces']))
        reach = np.linalg.norm(corners - c, axis=2) / r
        above = (corners.mean(axis=1)[:, 1] - c[1]) / r
        brows = np.flatnonzero(body & (reach.max(axis=1) < BROW_REACH)
                               & (reach.max(axis=1) >= SOCKET_REACH) & (above > BROW_ABOVE))
        ring = np.flatnonzero(body & (reach.min(axis=1) >= BROW_REACH)
                              & (reach.max(axis=1) < FUR_REACH))
        ring_texels = np.asarray(draw_triangles(triangles, points, ring, SIZE)) > 0
        fur = np.median(lab[ring_texels & ~balls], axis=0)
        mask = np.asarray(draw_triangles(triangles, points, brows, SIZE)
                          .filter(ImageFilter.MaxFilter(2 * SOFT_MARGIN + 1))) > 0
        mask &= ~balls
        step = np.abs(lab[mask][:, 0] - fur[0])
        out[mask] = srgb8(linear_of_oklab(fur + BROW_CONTRAST * (lab[mask] - fur)))
        print(f'brow {side}: {len(brows)} faces, {int(mask.sum())} texels; fur Oklab L {fur[0]:.3f}; '
              f'the mean lightness step to the fur goes from {step.mean():.3f} to '
              f'{BROW_CONTRAST * step.mean():.3f}')
    return Image.fromarray(out)


def color_map(rig):
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    if EYE_PAINT == 'centered':
        image = center_irises(rig, image)
    image = far_tone(rig, image)
    image = soften_brows(rig, image)
    lab = oklab(linear(np.asarray(image)))
    moved = white_fur(lab)
    claws, claw_count = claw_mask(rig, SIZE)
    median = np.median(lab[claws][:, 0])
    moved[claws] = lch(*CLAW)
    moved[claws, 0] += CLAW_STEPS * (lab[claws][:, 0] - median)
    # The dark texels of the nose take the nose color, and a texel between dark and fur takes a
    # smooth mix, so that the fur of the muzzle around the nose stays.
    nose, nose_count = nose_mask(rig, SIZE)
    dark = 1 - smoothstep(*DARK, lab[nose][:, 0])
    tone = np.tile(lch(*NOSE), (int(nose.sum()), 1))
    tone[:, 0] += NOSE_STEPS * (lab[nose][:, 0] - np.median(lab[nose][dark > 0.5][:, 0]))
    moved[nose] += dark[:, None] * (tone - moved[nose])
    eyes, count = eye_mask(rig, SIZE)
    moved[eyes] = lab[eyes]
    out = srgb8(linear_of_oklab(moved))
    Image.fromarray(out).save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {count} eye triangles kept ({int(eyes.sum())} texels), '
          f'{claw_count} claws ({int(claws.sum())} texels), {nose_count} nose triangles '
          f'({int(nose.sum())} texels), {os.path.getsize(COLOR_OUT)} bytes')


def main():
    which = sys.argv[1:] or ['color', 'normal']
    if 'color' in which:
        color_map(read_rig(RIG))
    if 'normal' in which:
        a = normal_map(NORMAL_SOURCE, NORMAL_OUT)
        print(f'{NORMAL_OUT}: {int((a[..., 2] < 0).sum())} texels with z below 0')


if __name__ == '__main__':
    main()
