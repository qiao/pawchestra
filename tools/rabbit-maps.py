# Writes the web color map and the web normal map of the Tripo rabbit from the maps of its FBX
# (design 4.5, assets/models/rabbit/README.md, "Color map" and "Normal map"). The color map is the
# source image at 2048 pixels, with no change of a color: the fur, the brows, and the eye paint
# stay as the FBX shows them. Only the iris of each eye moves (`shift_eyes()`). The normal map
# limits each tilt of the source, scales it to 1024 pixels, and stores the tilts times
# NORMAL_MAP_GAIN of src/scene/fur.ts. The output depends only on the input files and on cwebp
# 1.5.0.
#
# Usage: uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gaze_shift  # noqa: E402

SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg'
NORMAL_SOURCE = 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_normal.jpg'
RIG = 'assets/models/rabbit/tripo-hand/rabbit.rig.glb'
COLOR_OUT = 'assets/models/rabbit/tripo-hand/rabbit-color.webp'
NORMAL_OUT = 'assets/models/rabbit/tripo-hand/rabbit-normal.webp'
SIZE = 2048
NORMAL_SIZE = 1024
QUALITY = 60
#: The largest length of the x, y tilt of a normal of the source, and the gain of the stored tilts
#: (`NORMAL_MAP_GAIN` of src/scene/fur.ts). A larger tilt is a baked edge of the source mesh.
NORMAL_LIMIT = 0.2
NORMAL_GAIN = 4

#: The step in degrees of the grid of ball directions on which `shift_eyes()` finds the parts of
#: the eye paint. A cell holds the direction at the angle `lam` out from the forward axis of the
#: head (+z of the seated bind) and at the angle `psi` up.
GRID_STEP = 0.5
#: The part of the grid that can hold eye paint, in degrees: lam from, lam to, psi from, psi to.
EYE_WINDOW = (-10.0, 100.0, -40.0, 70.0)
#: The smallest channel and the largest saturation of a white texel, the largest luma of an iris
#: texel (or its smallest saturation), and the largest luma of a pupil texel (sRGB).
WHITE_LOW = 150
WHITE_SAT = 0.14
IRIS_LUMA = 110
IRIS_SAT = 0.5
PUPIL_LUMA = 50
#: The size in cells of the closing that joins the iris and the white into one painted eye.
EYE_CLOSE = 9
#: The width in cells of the band at the edge of the painted eye: the lash line and the shade of
#: the lids. The decal takes no paint from it.
EDGE_BAND = 3
#: The angle in degrees added to the iris radius, so that the soft edge of the iris moves with it.
IRIS_EDGE = 2.0
#: The view of the gaze target, in degrees down from the forward axis of the head, and the turn of
#: each target out from the middle of the painted eye in that view.
VIEW_DOWN = 15.0
GAZE_OUT = 4.0
#: The step in degrees of the turn about the iris middle that finds the paint of a hidden iris
#: point on its ring.
RING_STEP = 1.0
#: The largest angle in degrees from a point that the lids or the band hide, toward the iris
#: middle, in which `hidden_iris()` finds the open paint next to it.
HIDDEN_REACH = 20.0
#: The rim of the iris on the nose side, in degrees in from the iris radius, that takes the mirror
#: of the clean outer rim. On the nose side, the source iris meets the lash line and a pale band.
RIM_IN = 4.0
#: The angle in degrees out of the iris disk on the nose side in which a texel that is not white
#: (the pale band at the lash line) also takes the fill white.
NOSE_BAND = 4.0
#: The smallest luma of a band cell on the nose side that takes the fill white: a lighter cell is
#: the brown shade of the corner, a darker cell the lash line.
LASH_LUMA = 70


def color_map():
    """Writes the color map: the source scaled to SIZE (Lanczos), the irises moved
    (`shift_eyes()`), WebP quality QUALITY, method 6."""
    image = Image.open(SOURCE).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
    image = shift_eyes(gaze_shift.read_rig(RIG), image)
    image.save(COLOR_OUT, 'WEBP', quality=QUALITY, method=6)
    print(f'{COLOR_OUT}: {SIZE} x {SIZE}, {os.path.getsize(COLOR_OUT)} bytes')


def grid_axes():
    """Gives the lam (columns) and the psi (rows, top down) of the cells of the grid."""
    lam = np.arange(-90, 90 + GRID_STEP / 2, GRID_STEP)
    psi = np.arange(90, -90 - GRID_STEP / 2, -GRID_STEP)
    return lam, psi


def direction(lam, psi, sign):
    """Gives the unit ball direction at the angles lam (out) and psi (up), in degrees. The sign is
    +1 for the left eye (+x) and -1 for the right eye."""
    a, b = np.radians(lam), np.radians(psi)
    return np.stack([sign * np.cos(b) * np.sin(a), np.sin(b), np.cos(b) * np.cos(a)], -1)


def angles(d, sign):
    """Gives the angles lam (out) and psi (up) in degrees of unit ball directions."""
    return (np.degrees(np.arctan2(sign * d[..., 0], d[..., 2])),
            np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1))))


def cell(d, sign):
    """Gives the grid cell (row, column) of unit ball directions."""
    lam, psi = angles(d, sign)
    size = int(round(180 / GRID_STEP)) + 1
    col = np.clip(np.round((lam + 90) / GRID_STEP).astype(int), 0, size - 1)
    row = np.clip(np.round((90 - psi) / GRID_STEP).astype(int), 0, size - 1)
    return row, col


def largest(mask):
    """Gives the largest connected part of a mask."""
    labels, count = gaze_shift.parts(mask)
    if count == 0:
        return mask
    sizes = np.bincount(labels.ravel())[1:]
    return labels == 1 + int(np.argmax(sizes))


def fill_holes(mask):
    """Gives the mask with each closed hole filled."""
    labels, count = gaze_shift.parts(~mask)
    edge = np.unique(np.r_[labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    return mask | ((labels > 0) & ~np.isin(labels, edge))


def morph(mask, size, grow):
    """Gives the mask grown (MaxFilter) or shrunk (MinFilter) by a square of `size` cells."""
    kind = ImageFilter.MaxFilter if grow else ImageFilter.MinFilter
    return np.asarray(Image.fromarray(mask).filter(kind(size))) > 0


def eye_parts(rig, src, faces, c, sign):
    """Finds the parts of the eye paint of one ball on the grid:
    - The colors of the source on the ball at each cell (`ball_colors()`).
    - White: each channel above WHITE_LOW and a saturation below WHITE_SAT. Iris: a luma below
      IRIS_LUMA or a saturation above IRIS_SAT. Pupil: a luma below PUPIL_LUMA. Only in EYE_WINDOW.
    - The painted eye E: the largest part of the white and the iris, closed by EYE_CLOSE cells,
      with its holes filled. The band: the cells of E within EDGE_BAND cells of its edge.
    - The pupil p: the mean direction of the largest part of the pupil cells of E off the band.
    - The iris middle q and radius a: along the row of p, the iris runs in from the first white
      cell out of p, to the last iris cell off the band. Along the column of that middle, it runs
      from the last iris cell off the band below to the last one above.
    Gives a dict of the grids and the values."""
    lam, psi = grid_axes()
    lam_g, psi_g = np.meshgrid(lam, psi)
    dirs = direction(lam_g, psi_g, sign)
    colors, _ = gaze_shift.ball_colors(rig, faces, c, dirs.reshape(-1, 3), src)
    colors = colors.reshape(dirs.shape)
    luma = colors @ [0.2126, 0.7152, 0.0722]
    top, low = colors.max(-1), colors.min(-1)
    sat = (top - low) / np.maximum(top, 1)
    lam0, lam1, psi0, psi1 = EYE_WINDOW
    window = (lam_g > lam0) & (lam_g < lam1) & (psi_g > psi0) & (psi_g < psi1)
    white = window & (low > WHITE_LOW) & (sat < WHITE_SAT)
    iris = window & ((luma < IRIS_LUMA) | (sat > IRIS_SAT))
    eye = largest(fill_holes(morph(morph(white | iris, EYE_CLOSE, True), EYE_CLOSE, False)))
    inner = morph(eye, 2 * EDGE_BAND + 1, False)
    band = eye & ~inner
    pupil = largest(inner & (luma < PUPIL_LUMA))
    weights = np.cos(np.radians(psi_g[pupil]))[:, None]
    p = (dirs[pupil] * weights).sum(axis=0)
    p /= np.linalg.norm(p)
    row, col = cell(p[None], sign)
    row, col = int(row[0]), int(col[0])
    out = col
    while out < len(lam) - 1 and not white[row, out]:
        out += 1
    inn = col
    while inn > 0 and iris[row, inn - 1] and inner[row, inn - 1]:
        inn -= 1
    q_lam = (lam[inn] + lam[out]) / 2
    a = (lam[out] - lam[inn]) / 2
    mid = int(np.argmin(np.abs(lam - q_lam)))
    up = row
    while up > 0 and iris[up - 1, mid] and inner[up - 1, mid]:
        up -= 1
    down = row
    while down < len(psi) - 1 and iris[down + 1, mid] and inner[down + 1, mid]:
        down += 1
    q = direction(q_lam, (psi[up] + psi[down]) / 2, sign)
    return dict(colors=colors, dirs=dirs, luma=luma, white=white, iris=iris, eye=eye, band=band,
                p=p, q=q, a=a)


def view_middle(rig, faces, c, r, sign, eye):
    """Gives the ball direction in the middle of the painted eye E that a camera sees from VIEW_DOWN
    degrees above the forward axis of the head (parallel rays, as `gaze_targets()` of
    tools/gaze_shift.py): the hit nearest to the mean place of the hits in E on the view plane."""
    triangles, positions = rig[0], rig[1]
    corners = positions[triangles]
    near = np.flatnonzero(np.linalg.norm(corners.mean(axis=1) - c, axis=1) < 3 * r)
    down = np.radians(VIEW_DOWN)
    v = np.array([0.0, np.sin(down), np.cos(down)])
    across = np.array([1.0, 0.0, 0.0])
    tilt = np.cross(v, across)
    steps = np.arange(-1.6 * r, 1.6 * r, gaze_shift.RAY_STEP)
    gx, gy = np.meshgrid(steps, steps)
    origins = c + gx.ravel()[:, None] * across + gy.ravel()[:, None] * tilt + v
    rays = np.tile(-v, (len(origins), 1))
    t_hit, hit, _ = gaze_shift.ray_hits(origins, rays, corners[near])
    on_ball = (hit >= 0) & np.isin(near[np.maximum(hit, 0)], faces)
    shown = origins[on_ball] + t_hit[on_ball, None] * rays[on_ball] - c
    shown /= np.linalg.norm(shown, axis=1)[:, None]
    in_eye = eye[cell(shown, sign)]
    flat = np.c_[gx.ravel(), gy.ravel()][on_ball][in_eye]
    return shown[in_eye][np.argmin(np.linalg.norm(flat - flat.mean(axis=0), axis=1))]


def white_rows(parts, old):
    """Gives a function from psi to the fill white of the eye: the median color of the white cells
    of E off the old iris and off the band, row by row, with a linear step between rows."""
    lam, psi = grid_axes()
    use = parts['white'] & parts['eye'] & ~parts['band'] & ~old
    rows = [k for k in range(len(psi)) if use[k].sum() >= 3]
    if not rows:
        sys.exit('The eye shows no white, so the move has no fill white.')
    keys = psi[rows][::-1]
    values = np.array([np.median(parts['colors'][k][use[k]], axis=0) for k in rows])[::-1]
    return lambda at: np.stack([np.interp(at, keys, values[:, i]) for i in range(3)], -1)


def hidden_iris(points, q, open_, decal, sign):
    """Finds, for each point that the lids or the band hide (out of `open_`), the first open cell
    toward the iris middle q, in steps of GRID_STEP degrees up to HIDDEN_REACH. Gives a mask of
    the points for which that cell lies in the decal (a hidden part of the iris), and the direction
    of that cell for each point."""
    out = np.zeros(len(points), bool)
    nearest = points.copy()
    todo = np.ones(len(points), bool)
    angle = np.arccos(np.clip(points @ q, -1, 1))
    side = q[None] - (points @ q)[:, None] * points
    side /= np.maximum(np.linalg.norm(side, axis=1), 1e-12)[:, None]
    for step in np.radians(np.arange(GRID_STEP, HIDDEN_REACH + GRID_STEP / 2, GRID_STEP)):
        k = np.flatnonzero(todo & (step < angle))
        if len(k) == 0:
            break
        cand = np.cos(step) * points[k] + np.sin(step) * side[k]
        row, col = cell(cand, sign)
        hit = open_[row, col]
        out[k[hit]] = decal[row, col][hit]
        nearest[k[hit]] = cand[hit]
        todo[k[hit]] = False
    return out, nearest


def ring_points(points, q, inside, sign):
    """Gives, for each point of the iris disk about q, the nearest point on its ring about q (the
    same angle from q) that lies in `inside`, in steps of RING_STEP degrees each way. A point with
    no such point stays."""
    e1 = np.cross([0.0, 1.0, 0.0], q)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(q, e1)
    radius = np.arccos(np.clip(points @ q, -1, 1))
    turn = np.arctan2(points @ e2, points @ e1)
    out = points.copy()
    open_ = np.ones(len(points), bool)
    for step in np.arange(RING_STEP, 180 + RING_STEP / 2, RING_STEP):
        for s in (1.0, -1.0):
            if not open_.any():
                return out
            k = np.flatnonzero(open_)
            t = turn[k] + s * np.radians(step)
            cand = (np.cos(radius[k])[:, None] * q + np.sin(radius[k])[:, None]
                    * (np.cos(t)[:, None] * e1 + np.sin(t)[:, None] * e2))
            good = inside[cell(cand, sign)]
            out[k[good]] = cand[good]
            open_[k[good]] = False
    return out


def shift_eyes(rig, image):
    """Moves the iris of each eyeball, with its pupil and its painted light, as one decal on its
    ball, so that the rabbit does not look cross-eyed. Each eye has its own target, because the
    two eyes of the source are not mirror images. For each side, with the parts of `eye_parts()`:
    - The target t: the middle of the painted eye in the view of `view_middle()`, turned out by
      GAZE_OUT degrees, at the mean psi of the two pupils, so that both eyes look at one height.
    - The decal D: the iris cells of E off the band within a + IRIS_EDGE of q, grown by IRIS_EDGE
      degrees, so that the soft edge of the iris moves with it. The old place O: D and each part
      of the iris paint of E (the band included) that touches D.
    - With T the turn that takes p to t, each ball texel of E at the direction d takes the source
      color at T^-1 d when that point lies in D.
    - A point T^-1 d of the iris disk (a + IRIS_EDGE about q) that the lids or the band hide,
      with D as the first open cell toward q (`hidden_iris()`), is a hidden part of the iris. It
      takes the color of the nearest point of D on its ring about q (`ring_points()`), the clean
      side of the same iris, or else the color of that first open cell.
    - On the nose side, the source iris meets the lash line and a pale band, so its rim is not
      clean. A moved point T^-1 d on the nose half of the rim (more than a - RIM_IN from q) takes
      the mirror of that point about the vertical plane through q, on the clean outer rim, when
      that mirror point is open. When it is not open, a point out of the iris radius a does not
      move.
    - The cells of E off the band on the nose side within NOSE_BAND degrees out of the iris disk
      that are not white (the pale band), and the band cells there with a luma of LASH_LUMA or
      more (the brown shade of the corner), also belong to O.
    - Each other texel of O takes the white of its row (`white_rows()`). The rest of the band (the
      lash line and the shade of the lids on the white) keeps its paint.
    No texel takes a new color except the fill white, which is the median white of the same eye.
    Only the eyeball texels of E and the padding next to them change. Gives the new image."""
    eyes = rig[3]
    base = np.asarray(image)
    out = base.astype(np.float64)
    texels, taken = gaze_shift.ball_texels(rig, out.shape[0])
    written = np.zeros(taken.shape, bool)
    src = gaze_shift.fill_around(out, taken)
    sides = {}
    for side, sign in (('L', 1.0), ('R', -1.0)):
        faces = np.array(eyes[side]['faces'])
        c, r, _ = gaze_shift.ball_frame(rig, faces)
        parts = eye_parts(rig, src, faces, c, sign)
        parts.update(faces=faces, c=c, r=r, sign=sign,
                     middle=view_middle(rig, faces, c, r, sign, parts['eye']))
        sides[side] = parts
    height = np.mean([angles(parts['p'], parts['sign'])[1] for parts in sides.values()])
    for side, parts in sides.items():
        sign, q, p = parts['sign'], parts['q'], parts['p']
        mid_lam, mid_psi = angles(parts['middle'], sign)
        t = direction(mid_lam + GAZE_OUT, height, sign)
        turn = gaze_shift.turn_matrix(p, t)
        lam, psi = grid_axes()
        lam_g, psi_g = np.meshgrid(lam, psi)
        from_q = gaze_shift.angle_to(parts['dirs'].reshape(-1, 3), q).reshape(lam_g.shape)
        disk = from_q < parts['a'] + IRIS_EDGE
        edge = 2 * int(round(IRIS_EDGE / GRID_STEP)) + 1
        open_ = parts['eye'] & ~parts['band']
        decal = disk & open_ & morph(parts['iris'] & disk, edge, True)
        labels, _ = gaze_shift.parts(parts['iris'] & parts['eye'])
        old = decal | np.isin(labels, np.unique(labels[decal & (labels > 0)]))
        q_lam = angles(q, sign)[0]
        nose = (lam_g < q_lam) & (from_q < parts['a'] + IRIS_EDGE + NOSE_BAND)
        old |= nose & open_ & ~parts['white']
        old |= nose & parts['band'] & (parts['luma'] >= LASH_LUMA)
        fill = white_rows(parts, old)

        ys, xs, places = texels[side]
        d = places - parts['c']
        d /= np.linalg.norm(d, axis=1)[:, None]
        k_row, k_col = cell(d, sign)
        work = np.flatnonzero(parts['eye'][k_row, k_col])
        source = d[work] @ turn
        first = source.copy()
        s_row, s_col = cell(source, sign)
        in_decal = decal[s_row, s_col]
        hidden = np.zeros(len(work), bool)
        shut = np.flatnonzero(~open_[s_row, s_col] & disk[s_row, s_col])
        hidden[shut], edge_points = hidden_iris(source[shut], q, open_, decal, sign)
        k = np.flatnonzero(hidden)
        ring = ring_points(source[k], q, decal, sign)
        on_ring = decal[cell(ring, sign)]
        source[k] = np.where(on_ring[:, None], ring, edge_points[hidden[shut]])
        moved = in_decal | hidden
        radius = gaze_shift.angle_to(first, q)
        rim = np.flatnonzero((radius > parts['a'] - RIM_IN) & (angles(first, sign)[0] < q_lam)
                             & moved)
        across = gaze_shift.mirror(first[rim], q)
        clean = open_[cell(across, sign)]
        source[rim[clean]] = across[clean]
        moved[rim[~clean & (radius[rim] > parts['a'])]] = False
        colors, found = gaze_shift.ball_colors(rig, parts['faces'], parts['c'], source[moved], src)
        new = out[ys, xs].copy()
        new[work[moved][found]] = colors[found]
        left = work[~moved & old[k_row[work], k_col[work]]]
        new[left] = fill(angles(d[left], sign)[1])
        # A texel at the edge of two ball triangles can come twice, with the places of two
        # triangles. Only the changed rows write, so that a row with no change does not undo them.
        changed = np.zeros(len(d), bool)
        changed[work[moved][found]] = True
        changed[left] = True
        out[ys[changed], xs[changed]] = new[changed]
        written[ys[changed], xs[changed]] = True
        p_lam, p_psi = angles(p, sign)
        q_psi = angles(q, sign)[1]
        print(f'eye {side}: pupil at lam {p_lam:.1f}, psi {p_psi:.1f}; iris middle at lam '
              f'{q_lam:.1f}, psi {q_psi:.1f}, radius {parts["a"]:.1f}; middle of the eye at lam '
              f'{mid_lam:.1f}, psi {mid_psi:.1f}; target lam {mid_lam + GAZE_OUT:.1f}, psi '
              f'{height:.1f}; the decal turns {gaze_shift.angle_to(p[None], t)[0]:.1f} degrees '
              f'({mid_lam + GAZE_OUT - p_lam:+.1f} out, {height - p_psi:+.1f} up); '
              f'{int(moved.sum())} texels moved, {int(hidden.sum())} of them from the ring, '
              f'{int(clean.sum())} from the mirror of the outer rim, {len(left)} take the fill '
              f'white')
    # The padding next to a changed texel takes its new color (`ball_image()`), so that no old
    # color shows as a line on a seam. The other texels keep the source.
    near = morph(written, 2 * gaze_shift.EYE_FILL + 1, True)
    result = np.asarray(gaze_shift.ball_image(rig, out, taken))
    return Image.fromarray(np.where(near[..., None], result, base))


def normal_map():
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
          f'tilts limited, mean normal {np.round(a.reshape(-1, 3).mean(axis=0), 3).tolist()}')


def main():
    which = sys.argv[1:] or ['color', 'normal']
    if 'color' in which:
        color_map()
    if 'normal' in which:
        normal_map()


if __name__ == '__main__':
    main()
