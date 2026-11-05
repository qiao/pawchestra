"""Draws a part of the seated bind of a hand rig with its vertex ids, and lists its thin faces and
sharp edges (design 4.4, "Hand rig").

    blender -b --factory-startup --python-exit-code 1 --python tools/blender/bind_view.py -- \
        <file.blend> [--box x0,x1,y0,y1,z0,z1] [--ids <id,...>] [--view <axis>] \
        [--out <file.png>] [--thin <deg>] [--wide <deg>] [--sharp <deg>] [--size <px>]

`pnpm bind-view <file.blend> ...` runs it. The bind is the mesh of the export: the Action `bind`
with the keys `bind*` on (`pose_bind()` of `tools/blender/bind_edit.py`). The part is the
triangles with the middle in the box and a corner in the list of ids, in the units and the
Blender axes of the file: the animal faces -Y, and its left side is at +X. The view is the side
of the camera: `-Y` (the front, the default), `+Y`, `-X`, `+X`, `-Z`, `+Z`, or a vector such as
`1,-1,0.5`. The camera is orthographic.

The image shows the part in gray, the faces around it lighter, and a face seen from its back in
blue. A thin face (a corner below `--thin` or above `--wide` degrees) is red. A sharp edge (the
normals of its two triangles turn more than `--sharp` degrees) is magenta when it is concave and
cyan when it is convex. The ids of the visible vertices of the part are white, and the ids of the
marked vertices are yellow. A label that covers another label is left out. The script prints each
thin face and each sharp edge with its place. The triangles are the triangles of the export.
"""

import os
import struct
import sys
import zlib

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bind_edit as be  # noqa: E402

#: The camera side of each axis name of `--view`.
AXES = {
    '-Y': (0, -1, 0),
    '+Y': (0, 1, 0),
    '-X': (-1, 0, 0),
    '+X': (1, 0, 0),
    '-Z': (0, 0, -1),
    '+Z': (0, 0, 1),
}

#: The rows of the 5 x 7 glyphs, as hexadecimal bytes from the top row down.
GLYPHS = {
    '0': '0E11131519110E', '1': '040C040404040E', '2': '0E11010204081F', '3': '1F02040201110E',
    '4': '02060A121F0202', '5': '1F101E0101110E', '6': '0608101E11110E', '7': '1F010204080808',
    '8': '0E11110E11110E', '9': '0E11110F01020C', 'A': '0E11111F111111', 'B': '1E11111E11111E',
    'C': '0E11101010110E', 'D': '1C12111111121C', 'E': '1F10101E10101F', 'F': '1F10101E101010',
    'G': '0E11101711110F', 'H': '1111111F111111', 'I': '0E04040404040E', 'J': '0702020202120C',
    'K': '11121418141211', 'L': '1010101010101F', 'M': '111B1515111111', 'N': '11111915131111',
    'O': '0E11111111110E', 'P': '1E11111E101010', 'Q': '0E11111115120D', 'R': '1E11111E141211',
    'S': '0F10100E01011E', 'T': '1F040404040404', 'U': '1111111111110E', 'V': '11111111110A04',
    'W': '1111111515150A', 'X': '11110A040A1111', 'Y': '1111110A040404', 'Z': '1F01020408101F',
    '-': '0000001F000000', '.': '00000000000C0C', ',': '000000000C0408', ':': '000C0C000C0C00',
    '=': '00001F001F0000', '(': '02040808080402', ')': '08040202020408', '/': '00010204081000',
    '+': '0004041F040400', ' ': '00000000000000',
}  # fmt: skip

#: The size of a glyph pixel, and the width of a glyph with its gap, in image pixels.
TEXT_SCALE, TEXT_STEP = 2, 12

#: The colors of the image.
COLORS = {
    'ground': (38, 38, 42),
    'back': (40, 70, 150),
    'thin': (225, 50, 40),
    'concave': (255, 0, 210),
    'convex': (0, 210, 255),
    'edge': (120, 70, 20),
    'diagonal': (95, 95, 95),
    'id': (255, 255, 255),
    'mark': (255, 230, 0),
    'box': (0, 0, 0),
}

#: The margin around the part and the height of the band of the title, in pixels.
MARGIN, BAND = 30, 40

#: The depth gap that still counts as the visible surface, in units.
DEPTH_SLACK = 0.002


def fail(text):
    """Prints a fault and stops with the exit code 1."""
    print(f'bind_view: error: {text}', file=sys.stderr, flush=True)
    sys.exit(1)


def option(rest, name, default=None):
    """Gives the value of an option of the command line, or the default."""
    if name not in rest:
        return default
    at = rest.index(name)
    if at + 1 >= len(rest):
        fail(f'The option {name} has no value.')
    return rest[at + 1]


def numbers(text, count=None):
    """Gives the numbers of a list such as `0.1,-0.2`."""
    values = [float(v) for v in text.split(',')]
    if count is not None and len(values) != count:
        fail(f'{text} must have {count} numbers.')
    return values


def camera(view):
    """Gives the unit vectors to the camera, to the right of the image, and to its top."""
    to_camera = np.array(AXES.get(view.upper()) or numbers(view, 3), float)
    to_camera /= np.linalg.norm(to_camera)
    up = np.array([0.0, 1.0, 0.0]) if abs(to_camera[2]) > 0.9 else np.array([0.0, 0.0, 1.0])
    right = np.cross(up, to_camera)
    right /= np.linalg.norm(right)
    return to_camera, right, np.cross(to_camera, right)


def draw_text(img, x, y, text, color):
    """Draws a text in the 5 x 7 glyphs with its top left corner at (x, y), on a dark box."""
    h, w, _ = img.shape
    s = TEXT_SCALE
    x0, y0 = int(x) - 2, int(y) - 2
    x1, y1 = int(x) + TEXT_STEP * len(text), int(y) + 7 * s + 2
    img[max(y0, 0) : max(min(y1, h), 0), max(x0, 0) : max(min(x1, w), 0)] = COLORS['box']
    for k, ch in enumerate(text.upper()):
        rows = bytes.fromhex(GLYPHS.get(ch, GLYPHS[' ']))
        for r, bits in enumerate(rows):
            for c in range(5):
                if bits & (16 >> c):
                    px, py = int(x) + k * TEXT_STEP + c * s, int(y) + r * s
                    if 0 <= px < w - s and 0 <= py < h - s:
                        img[py : py + s, px : px + s] = color


def fill_triangle(img, depth, q, z, color):
    """Fills a triangle of the image points q (3 x 2) and the depths z where it is nearer to the
    camera than the depth buffer."""
    h, w, _ = img.shape
    x0, y0 = np.floor(q.min(axis=0)).astype(int)
    x1, y1 = np.ceil(q.max(axis=0)).astype(int)
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w - 1), min(y1, h - 1)
    if x1 < x0 or y1 < y0:
        return
    ys, xs = np.mgrid[y0 : y1 + 1, x0 : x1 + 1]
    px, py = xs + 0.5, ys + 0.5
    (ax, ay), (bx, by), (cx, cy) = q
    area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if abs(area) < 1e-9:
        return
    w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area
    w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area
    w2 = 1.0 - w0 - w1
    inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    d = w0 * z[0] + w1 * z[1] + w2 * z[2]
    near = inside & (d > depth[y0 : y1 + 1, x0 : x1 + 1])
    depth[y0 : y1 + 1, x0 : x1 + 1][near] = d[near]
    img[y0 : y1 + 1, x0 : x1 + 1][near] = color


def draw_line(img, depth, a, b, za, zb, color, width, hidden_width=0):
    """Draws a line from the image point a to b. A part behind the depth buffer takes the width
    `hidden_width`, and 0 leaves it out."""
    h, w, _ = img.shape
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 2
    t = np.linspace(0.0, 1.0, n)
    xs = np.clip((a[0] + (b[0] - a[0]) * t).astype(int), 0, w - 1)
    ys = np.clip((a[1] + (b[1] - a[1]) * t).astype(int), 0, h - 1)
    seen = za + (zb - za) * t >= depth[ys, xs] - DEPTH_SLACK
    for size, keep in ((width, seen), (hidden_width, ~seen)):
        r = size // 2
        for dy in range(-r, size - r):
            for dx in range(-r, size - r):
                img[np.clip(ys[keep] + dy, 0, h - 1), np.clip(xs[keep] + dx, 0, w - 1)] = color


def write_png(path, img):
    """Writes an RGB image (h x w x 3 bytes) as a PNG file."""
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(h))

    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(
            chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
        )


def place(p):
    """Gives a point as text with 3 decimals."""
    return '(' + ', '.join(f'{v:.3f}' for v in p) + ')'


def main():
    """Draws the part of the command line, and prints its thin faces and sharp edges."""
    rest = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    if not rest or rest[0].startswith('--'):
        fail('Usage: bind_view.py -- <file.blend> [--box ...] [--ids ...] [--view -Y] [--out ...]')
    blend = os.path.abspath(rest[0])
    box_text, ids_text = option(rest, '--box'), option(rest, '--ids')
    box = numbers(box_text, 6) if box_text else None
    ids = [int(v) for v in ids_text.split(',')] if ids_text else None
    view = option(rest, '--view', '-Y')
    out = option(rest, '--out') or os.path.splitext(blend)[0] + '-bind-view.png'
    small, large = float(option(rest, '--thin', '8')), float(option(rest, '--wide', '160'))
    limit, width = float(option(rest, '--sharp', '50')), int(option(rest, '--size', '1600'))
    if not os.path.isfile(blend):
        fail(f'The file {blend} does not exist.')

    bpy.ops.wm.open_mainfile(filepath=blend)
    try:
        body, rig = be.objects()
    except ValueError as error:
        fail(str(error))
    be.pose_bind(body, rig)
    p = be.bind_points(body)
    corners, faces = be.triangles(body.data)
    keep = be.part_triangles(p, corners, box, ids)
    if not keep.any():
        fail('The part has no triangle. Check the box and the ids.')
    part = np.unique(corners[keep])
    near = np.isin(corners, part).any(axis=1) & ~keep
    thin = be.thin_faces(p, corners, faces, keep, small, large)
    sharp = be.sharp_edges(p, corners, keep, limit)

    to_camera, right, up = camera(view)
    shown = keep | near
    xy = np.stack([p @ right, -(p @ up)], axis=1)
    span = xy[corners[shown]].reshape(-1, 2)
    lo, hi = span.min(axis=0), span.max(axis=0)
    scale = (width - 2 * MARGIN) / max(hi[0] - lo[0], 1e-9)
    scale = min(scale, (width - 2 * MARGIN) / max(hi[1] - lo[1], 1e-9))
    height = int((hi[1] - lo[1]) * scale) + 2 * MARGIN + BAND
    px = (xy - lo) * scale + [MARGIN, MARGIN + BAND]
    z = p @ to_camera
    img = np.empty((height, width, 3), np.uint8)
    img[:] = COLORS['ground']
    depth = np.full((height, width), -np.inf)

    n = be.normals(p, corners)
    light = to_camera + 0.8 * up - 0.3 * right
    light /= np.linalg.norm(light)
    thin_set = {row[0] for row in thin}
    for t in np.nonzero(shown)[0]:
        facing = n[t] @ to_camera > 0
        tone = 70 + 180 * max(0.0, abs(n[t] @ light))
        color = np.array([tone, tone, tone]) if facing else np.array(COLORS['back'], float)
        if t in thin_set:
            color = np.array(COLORS['thin'], float)
        if not keep[t]:
            color = 0.45 * color + 0.55 * np.array([200.0, 200.0, 200.0])
        fill_triangle(img, depth, px[corners[t]], z[corners[t]], color.astype(np.uint8))

    mesh_edges = {tuple(sorted(e.vertices)) for e in body.data.edges}
    drawn = set()
    for t in np.nonzero(shown)[0]:
        for k in range(3):
            e = tuple(sorted((int(corners[t][k]), int(corners[t][(k + 1) % 3]))))
            if e in drawn:
                continue
            drawn.add(e)
            kind = 'edge' if e in mesh_edges else 'diagonal'
            draw_line(img, depth, px[e[0]], px[e[1]], z[e[0]], z[e[1]], COLORS[kind], 1)
    for _, e, concave, _ in sharp:
        color = COLORS['concave' if concave else 'convex']
        draw_line(img, depth, px[e[0]], px[e[1]], z[e[0]], z[e[1]], color, 4, hidden_width=1)

    marks = {v for row in thin for v in row[2]} | {v for row in sharp for v in row[1]}
    marks |= set(ids or [])
    taken = np.zeros((height, width), bool)
    labels = 0
    order = sorted(part.tolist(), key=lambda v: (v not in marks, v))
    for v in order:
        x, y = px[v]
        ix, iy = int(np.clip(x, 0, width - 1)), int(np.clip(y, 0, height - 1))
        if z[v] < depth[iy, ix] - DEPTH_SLACK:
            continue
        text = str(v)
        x0, y0 = int(x) + 3, int(y) - 7 * TEXT_SCALE - 2
        x1, y1 = x0 + TEXT_STEP * len(text) + 2, y0 + 7 * TEXT_SCALE + 4
        if x0 < 0 or y0 < BAND or x1 >= width or y1 >= height or taken[y0:y1, x0:x1].any():
            continue
        taken[y0:y1, x0:x1] = True
        img[max(iy - 2, 0) : iy + 3, max(ix - 2, 0) : ix + 3] = COLORS[
            'mark' if v in marks else 'id'
        ]
        draw_text(img, x0 + 2, y0 + 2, text, COLORS['mark' if v in marks else 'id'])
        labels += 1

    title = f'VIEW {view}  {int(keep.sum())} TRIANGLES  {len(thin)} THIN  {len(sharp)} SHARP'
    draw_text(img, 10, 10, title, COLORS['id'])
    x = 10 + TEXT_STEP * (len(title) + 3)
    for name, text in (
        ('thin', 'THIN'),
        ('concave', 'CONCAVE'),
        ('convex', 'CONVEX'),
        ('back', 'BACK'),
    ):
        draw_text(img, x, 10, text, COLORS[name])
        x += TEXT_STEP * (len(text) + 2)
    write_png(out, img)

    where = f'box {box_text}' if box_text else 'all'
    where += f', ids {ids_text}' if ids_text else ''
    print(f'bind_view: {blend}, view {view}, part ({where}): {int(keep.sum())} triangles, '
          f'{len(part)} vertices', flush=True)  # fmt: skip
    for t, face, tri, lo_angle, hi_angle, mid in thin:
        size = len(body.data.polygons[face].vertices)
        print(f'thin: triangle {t} of face {face} ({size} corners) {tri} '
              f'{lo_angle:.1f} to {hi_angle:.1f} deg at {place(mid)}')  # fmt: skip
    for angle, e, concave, mid in sharp:
        kind = 'concave' if concave else 'convex'
        print(f'sharp: edge {e[0]}-{e[1]} {angle:.0f} deg {kind} at {place(mid)}')
    print(f'bind_view: wrote {out}: {width} x {height} px, {labels} of {len(part)} vertex ids '
          f'(a label that covers another is left out)', flush=True)  # fmt: skip


if __name__ == '__main__':
    main()
