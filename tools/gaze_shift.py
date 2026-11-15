# The gaze shift of the eyes of a Tripo hand rig (design 4.5): it moves the painted iris of each
# eyeball, with its pupil and its painted light, as one decal on the ball, so that the eyes look at
# a chosen view. It paints nothing new and darkens nothing: each moved texel is a copy of a texel
# of the same ball. tools/fox-maps.py, tools/rabbit-maps.py, and tools/polar-bear-maps.py use it.
# The method is the method of the earlier fox and rabbit map tools (`center_irises()` in the git
# history of tools/fox-maps.py).
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

#: The cells across the front picture of a ball (`front_cells()`), in which the move finds the
#: opening and the pupil.
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
#: The barycentric slack of a second try for a ray from the middle of a ball that hits no ball
#: triangle.
WIDE_EDGE = 0.05
#: The largest share of the texels of an eyeball that can also lie in the other eyeball.
EYE_OVERLAP = 0.01
#: The rounds of the fill of the texels around the eyeball triangles before the turned ball samples
#: the map, so that a sample at the edge of a texture island takes no color from outside it.
EYE_FILL = 4
#: The barycentric slack of a ray hit, so that a ray on the edge of two triangles hits one.
EDGE = 1e-4
#: The step of the grid of the view rays over each eye, in units of the rig file.
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
        return np.frombuffer(binary, dtype, accessor['count'] * width, start).reshape(-1, width)

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
        draw.polygon([(float(u) * size, float(v) * size) for u, v in points[triangles[t]]], fill=255)
    return mask


def eye_mask(rig, size, margin):
    """Gives the texels of the eyeball triangles of the rig file, grown by `margin` texels."""
    triangles, _, points, eyes = rig
    faces = [t for side in ('L', 'R') for t in eyes[side]['faces']]
    mask = draw_triangles(triangles, points, faces, size).filter(ImageFilter.MaxFilter(2 * margin + 1))
    return np.asarray(mask) > 0


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


def ray_hits(origins, directions, corners, edge=EDGE):
    """Gives, for each ray, the distance to the nearest triangle that it hits (inf for none), the
    index of that triangle, and the barycentric weights (u, v) of the hit (Moller-Trumbore)."""
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


def eye_texels(rig, faces, size):
    """Gives the texels of the triangles `faces` (rows and columns), and the place of each in the
    seated bind, by the barycentric mix of the corners of its triangle."""
    triangles, positions, points, _ = rig
    ys, xs, places = [], [], []
    for f in faces:
        tri = triangles[f]
        uv = points[tri] * size - 0.5
        x0, y0 = np.maximum(np.floor(uv.min(axis=0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(uv.max(axis=0)).astype(int), size - 1)
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


def ball_texels(rig, size):
    """Gives the texels of each eyeball (rows, columns, and the place of each in the seated bind,
    by side), and a mask of the texels of the two balls."""
    eyes = rig[3]
    taken = np.zeros((size, size), bool)
    texels = {}
    for side in ('L', 'R'):
        ys, xs, places = eye_texels(rig, np.array(eyes[side]['faces']), size)
        if taken[ys, xs].sum() > EYE_OVERLAP * len(ys):
            sys.exit('The texels of the two eyeballs overlap, so no ball can take its own paint.')
        taken[ys, xs] = True
        texels[side] = (ys, xs, places)
    return texels, taken


def ball_image(rig, out, taken):
    """Gives the image of the float colors `out`, in which the padding texels around the ball
    islands, and the thin gaps between two ball triangles, take the new colors of the ball next to
    them (the texels `taken`). So no old color shows as a line on a seam."""
    triangles, points, eyes = rig[0], rig[2], rig[3]
    size = out.shape[0]
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    for tri in triangles:
        draw.polygon([(float(x) * size, float(y) * size) for x, y in points[tri]], fill=255)
    ball_faces = [f for side in ('L', 'R') for f in eyes[side]['faces']]
    island = np.asarray(draw_triangles(triangles, points, ball_faces, size)
                        .filter(ImageFilter.MaxFilter(3))) > 0
    padding = (~(np.asarray(mask) > 0) | island) & ~taken
    filled = fill_around(out, taken)
    out[padding] = filled[padding]
    return Image.fromarray(np.round(out).clip(0, 255).astype(np.uint8))


def ball_frame(rig, faces):
    """Gives the middle c and the radius r of the sphere of a ball, and the ball directions that
    show in the front view (rays along -z: the head of the seated bind faces +z)."""
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
    size = image.shape[0]
    x = np.clip(points[:, 0] * size - 0.5, 0, size - 1.001)
    y = np.clip(points[:, 1] * size - 0.5, 0, size - 1.001)
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


def gaze_targets(rig, view_down, gaze_out, gaze_up):
    """Gives the target t of the iris of each side: the ball direction in the middle of the eye
    opening that a camera sees from `view_down` degrees above the forward axis of the head of the
    seated bind, turned out by `gaze_out` and up by `gaze_up` degrees. The rays of the view are
    parallel. The middle of the opening is the mean place of the ball points that the rays hit,
    and t is the hit nearest to it. The two targets are mirror images (the mean of the two sides),
    so the eyes stay parallel."""
    triangles, positions, eyes = rig[0], rig[1], rig[3]
    corners = positions[triangles]
    middles = corners.mean(axis=1)
    up = np.radians(view_down)
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
        found[side] = shown[np.argmin(np.linalg.norm(flat - middle, axis=1))]
    x = (found['L'][0] - found['R'][0]) / 2
    y = (found['L'][1] + found['R'][1]) / 2
    targets = {}
    for side, sign in (('L', 1.0), ('R', -1.0)):
        psi = np.arcsin(y) + np.radians(gaze_up)
        lam = np.arcsin(x / np.cos(np.arcsin(y))) + np.radians(gaze_out)
        targets[side] = np.array([sign * np.cos(psi) * np.sin(lam), np.sin(psi),
                                  np.cos(psi) * np.cos(lam)])
        print(f'gaze {side}: the view looks down {view_down:.1f} degrees; the middle of its opening '
              f'at x {found[side][0]:+.3f}, y {found[side][1]:+.3f} of the ball radius; the target at '
              f'x {targets[side][0]:+.3f}, y {targets[side][1]:+.3f} ({gaze_out:.1f} degrees out, '
              f'{gaze_up:.1f} up)')
    return targets


def shift_gaze(rig, image, view_down, gaze_out=0.0, gaze_up=0.0, lash_line=True):
    """Moves the iris of each eyeball, with its pupil and its painted light, as one decal to the
    target of `gaze_targets()`, and gives the new image. For each side, with c, r, and the ball
    directions of the front view of `ball_frame()`:
    - The opening: the cells of the front picture (`front_cells()`) that the front directions fill.
      The core of the opening is the opening less EDGE_CELLS cells at its edge.
    - The pupil p: the middle of the cells of the core with a texel of luma below PUPIL_LUMA in
      front, after an erosion to the last cells.
    - The iris radius a: the angle from p of the first ring of 1 degree in which at least
      IRIS_WHITE of the texels of the opening are white, plus IRIS_EDGE.
    - With R the turn that takes p to the target t, each ball texel at the direction d within a of
      t takes the source color at R^-1 d when that point is iris paint (the moved iris). A point
      outside the iris paint takes the mirror of R^-1 d about the vertical plane through p, on the
      other side of the same iris. When the mirror is no iris paint too, the texel keeps its color.
    - Each other texel within a of p (the old place of the iris) in the opening takes the source
      color at its mirror about the vertical plane through t: the white of the other side. A mirror
      point in the iris paint takes the median white of the opening. With `lash_line`, the dark
      texels at the edge of the opening stay.
    No texel takes a new color: each one is a copy of a texel of the same ball."""
    eyes = rig[3]
    out = np.asarray(image).astype(np.float64)
    size = out.shape[0]
    texels, taken = ball_texels(rig, size)
    src = fill_around(out, taken)
    targets = gaze_targets(rig, view_down, gaze_out, gaze_up)
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
        near = np.asarray(Image.fromarray(dark).filter(ImageFilter.MaxFilter(3))) > 0
        dark = (dark | (~seen & near)) & core
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
        sclera = np.median(colors[in_opening & white], axis=0)
        lash = ~core[row, col] & (luma < PUPIL_LUMA) & lash_line
        left = np.flatnonzero((rings < a) & in_opening & ~written & ~lash)
        across = mirror(d[left], t)
        got, found = ball_colors(rig, faces, c, across, src)
        in_old = is_iris(across, core if lash_line else grid)
        got[in_old | ~found] = sclera
        new[left] = got
        out[ys, xs] = new
        unit = np.sqrt(len(shown) / np.pi) * RAY_STEP / r
        shift = (t[:2] - p[:2]) / unit
        print(f'iris {side}: pupil at x {p[0]:.3f}, y {p[1]:.3f} of the ball radius, target at x '
              f'{t[0]:.3f}, y {t[1]:.3f}; the iris of {a:.1f} degrees moves '
              f'{angle_to(p[None], t)[0]:.1f} degrees ({shift[0]:+.2f}, {shift[1]:+.2f} opening '
              f'radii in x, y of the front view); {int(flip.sum())} iris texels mirror, {len(left)} '
              f'texels take the white across')
    return ball_image(rig, out, taken)
