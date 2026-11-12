"""Gives the Tripo P2 fox four digits on each front paw, and writes the mesh as a new FBX file.

The source paw has three long digits that spread 47 degrees apart, as a hand. This script removes
each front paw past the wrist ring of the source (a closed ring of 11 vertices) and builds a new
paw of quad faces in its place:

1. A transition band from the wrist ring (11 vertices) to the first palm ring (14 vertices): 11
   quads and 3 triangles. A closed quad surface on a ring of 11 edges must hold an odd face, so
   the paw has these 3 triangles and no other.
2. Four palm rings of 14 vertices: 4 edges on the top, 4 on the bottom, and 3 on each side. The
   palm gets wider to the front, and its lower side bulges into a palm pad.
3. Four digits on the front of the palm. The front ring of the palm and 6 inner vertices are the
   bases of four tubes of 8 vertices each (the 4 columns of the palm). Each digit has 4 rings and
   a round tip of 4 quads about a tip vertex. As on a real fore paw, the middle two digits are the
   longest, the inner digit is shorter, and the outer digit is the shortest. The digits spread a
   little, close together, and curl down to the tips.
4. UVs: each new face takes the box projection of its main normal onto one of four clean patches
   of the dark paw fur in the color map (the top, the bottom, the sides, and the front), at
   `UV_SCALE` UV for each unit. The source paw has 0.86 UV for each unit.

The right paw is the mirror of the left paw. The rest of the mesh does not change. The script
writes the mesh in the studio units (1 unit from the soles to the ear tips) with its UV map and no
material. `import_source()` of `studio_armature.py` reads it as it reads the source FBX.

Run it in a terminal from the root of the tree:

    blender -b --factory-startup --python-exit-code 1 -P tools/blender/fox_paws.py -- \
        assets/models/fox/tripo-p2/fox.fbx assets/models/fox/tripo-p2/fox-paws.fbx
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
import studio_armature as sa  # noqa: E402

#: The x of the wrist ring of the left paw in the source (a closed ring of 11 vertices).
WRIST_X = 0.2765
#: The palm rings: the distance past the middle of the wrist ring along the paw axis, the half
#: width, the half height over and under the middle, and the shift of the middle along the up axis.
PALM = (
    (0.008, 0.0270, 0.0190, 0.0195, 0.0),
    (0.018, 0.0300, 0.0170, 0.0195, -0.0005),
    (0.029, 0.0312, 0.0135, 0.0180, -0.0013),
    (0.040, 0.0310, 0.0085, 0.0140, -0.0024),
)
#: The angle of each vertex of a palm ring in degrees, from the width axis to the up axis: the right
#: side (2), the top (5), the left side (2), and the bottom (5).
PALM_ANGLES = (12, 35, 62, 90, 118, 145, 168, 192, 215, 242, 270, 298, 325, 348)
#: Each digit: the length from the front palm ring, and the spread from the paw axis in degrees,
#: from the back of the paw (the outer digit) to the front (the inner digit, on the side of the
#: thumb of a hand). The outer digit is the shortest, and the middle two are the longest.
DIGITS = ((0.016, -4.0), (0.024, -1.2), (0.025, 1.2), (0.018, 4.0))
#: The half width and the half height of a digit, the drop of the digit middle under the palm
#: middle at the base, and the curl of each digit: the tangent turns down by 2 CURL t.
DIGIT_HW, DIGIT_HH, DIGIT_DROP, CURL = 0.0077, 0.0082, 0.0015, 5.5
#: The angles of the 8 vertices of a digit ring, in the order of the base ring of the digit.
DIGIT_ANGLES = (20, 60, 120, 160, 200, 240, 300, 340)
#: The inner vertices of the front palm ring lie this far back (the web between the digits).
WEB = 0.004
#: The exponent of the super ellipse of the palm rings and of the digit rings (2 is an ellipse).
ROUND, DIGIT_ROUND = 2.4, 2.0
#: The UV patches of the dark paw fur (the middle of a square of even color) and the UV scale.
PATCHES = {
    'top': (0.6797, 0.8730),
    'bottom': (0.5493, 0.8755),
    'side': (0.9194, 0.3032),
    'front': (0.5654, 0.1719),
}
UV_SCALE = 0.66


def super_point(angle, hw, ht, hb, exponent=ROUND):
    """A point of a super ellipse ring in the (width, up) plane."""
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    w = math.copysign(abs(c) ** (2 / exponent), c) * hw
    u = math.copysign(abs(s) ** (2 / exponent), s) * (ht if s > 0 else hb)
    return w, u


def studio(co):
    return np.array([co[0], co[2], -co[1]])


def wrist_ring(bm, side):
    """The closed ring of 11 vertices of the arm of a side (1 left, -1 right) nearest WRIST_X."""
    P = np.array([studio(v.co) for v in bm.verts])
    inside = (P[:, 0] * side > 0.07) & (P[:, 1] > 0.5) & (P[:, 1] < 0.7)
    loops = rings_around(bm, inside, (side, 0, 0))
    best = min(
        (lp for lp in loops if lp[2] and len(lp[1]) == 11),
        key=lambda lp: abs(abs(lp[0]) - WRIST_X),
    )
    if abs(abs(best[0]) - WRIST_X) > 0.004:
        raise SystemExit(f'fox_paws: no wrist ring near x {WRIST_X} (nearest {best[0]:.4f})')
    return best[1]


def rings_around(bm, inside, axis, steep=0.5):
    """The edge loops of the edges in `inside` that stand across `axis`: (mean along, vertex
    indices, closed)."""
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    P = np.array([studio(v.co) for v in bm.verts])
    ax = np.asarray(axis, float)
    ax /= np.linalg.norm(ax)
    seen, out = set(), []
    for e in bm.edges:
        a, b = e.verts
        if e.index in seen or not (inside[a.index] and inside[b.index]):
            continue
        d = P[b.index] - P[a.index]
        if abs(d @ ax) > steep * np.linalg.norm(d):
            continue
        seen.add(e.index)
        verts, closed = [a.index, b.index], False
        for direction in (0, 1):
            cur, v = e, (b if direction == 0 else a)
            while True:
                if len(v.link_edges) != 4:
                    break
                faces = set(cur.link_faces)
                nxt = [x for x in v.link_edges if x is not cur and not (set(x.link_faces) & faces)]
                if len(nxt) != 1:
                    break
                cur = nxt[0]
                if cur is e:
                    closed = True
                    break
                if cur.index in seen:
                    break
                seen.add(cur.index)
                v = cur.other_vert(v)
                if not inside[v.index]:
                    break
                if direction == 0:
                    verts.append(v.index)
                else:
                    verts.insert(0, v.index)
            if closed:
                verts = verts[:-1] if verts[-1] == verts[0] else verts
                break
        out.append((float(np.mean(P[verts] @ ax)), verts, closed))
    return out


def remove_paw(bm, ring):
    """Removes each vertex past the wrist ring (the side of the ring away from the trunk)."""
    bm.verts.ensure_lookup_table()
    ring_set = set(ring)
    tip = max(bm.verts, key=lambda v: abs(v.co.x) if v.co.x * bm.verts[ring[0]].co.x > 0 else -1)
    found, stack = {tip.index}, [tip]
    while stack:
        v = stack.pop()
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in found and o.index not in ring_set:
                found.add(o.index)
                stack.append(o)
    paw = [bm.verts[i] for i in found]
    bmesh.ops.delete(bm, geom=paw, context='VERTS')
    return len(paw)


def frame(points, side):
    """The paw frame at the wrist ring: the middle, the paw axis a (out and a little down, as the
    source paw), the width axis w (forward), and the up axis u."""
    o = Vector(np.mean(points, axis=0))
    a = Vector((0.996 * side, -0.009, -0.086)).normalized()
    u = Vector((0, 0, 1))
    u = (u - a * u.dot(a)).normalized()
    w = Vector((0, -1, 0))
    w = (w - a * w.dot(a) - u * w.dot(u)).normalized()
    return o, a, w, u


def build_paw(bm, ring, side, uv_layer):
    """Builds the new paw on the wrist ring (a list of vertices), and gives its faces UVs. Gives
    the new faces."""
    o, a, w, u = frame(np.array([v.co[:] for v in ring]), side)

    def at(s, ww, uu):
        return o + a * s + w * ww + u * uu

    palm = []
    for s, hw, ht, hb, shift in PALM:
        ring_new = []
        for ang in PALM_ANGLES:
            pw, pu = super_point(ang, hw, ht, hb)
            ring_new.append(bm.verts.new(at(s, pw, pu + shift)))
        palm.append(ring_new)
    faces = []
    # The transition band: an alignment of the wrist ring and the first palm ring by angle.
    ring_ang = [math.degrees(math.atan2((v.co - o).dot(u), (v.co - o).dot(w))) % 360 for v in ring]
    order = sorted(range(len(ring)), key=lambda i: ring_ang[i])
    if any(ring[order[i]] not in [e.other_vert(ring[order[i - 1]]) for e in ring[order[i - 1]].link_edges]
           for i in range(len(order))):
        raise SystemExit('fox_paws: the wrist ring is not in angle order')
    faces += zipper(bm, [ring[i] for i in order], [ring_ang[i] for i in order], palm[0], list(PALM_ANGLES))
    n = len(PALM_ANGLES)
    for r0, r1 in zip(palm, palm[1:]):
        for i in range(n):
            faces.append(bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i])))
    # The front ring of the palm: T0..T4 top (angles 145..35), L1 L2, B0..B4, R2, R1.
    front = palm[-1]
    idx = {ang: k for k, ang in enumerate(PALM_ANGLES)}
    top = [front[idx[ang]] for ang in (145, 118, 90, 62, 35)]
    bottom = [front[idx[ang]] for ang in (215, 242, 270, 298, 325)]
    sides = {0: (front[idx[168]], front[idx[192]]), 4: (front[idx[12]], front[idx[348]])}
    s_front = PALM[-1][0]
    for c in (1, 2, 3):
        t, b = top[c].co, bottom[c].co
        sides[c] = tuple(bm.verts.new(t.lerp(b, f) - a * WEB) for f in (1 / 3, 2 / 3))
    cu = PALM[-1][4]
    col = 2 * PALM[-1][1] / 4
    for k, (length, spread) in enumerate(DIGITS):
        base = [sides[k + 1][0], top[k + 1], top[k], sides[k][0], sides[k][1], bottom[k],
                bottom[k + 1], sides[k + 1][1]]
        c0 = at(s_front, (k - 1.5) * col, cu - DIGIT_DROP)
        d = (a * math.cos(math.radians(spread)) + w * math.sin(math.radians(spread))).normalized()
        rings = [base]
        # A round tip: rings at 1, 0.55, and 0.2 tip radii before the tip, on a sphere.
        r = DIGIT_HW
        steps = ((0.006, 1.0), (length - r, 1.0), (length - 0.55 * r, 0.89), (length - 0.2 * r, 0.6))
        for t, f in steps:
            mid = c0 + d * t - u * (CURL * t * t)
            tangent = (d - u * (2 * CURL * t)).normalized()
            up = (u - tangent * u.dot(tangent)).normalized()
            wide = tangent.cross(up)
            if wide.dot(w) < 0:
                wide = -wide
            rings.append([
                bm.verts.new(mid + wide * pw + up * pu)
                for pw, pu in (super_point(ang, DIGIT_HW * f, DIGIT_HH * f, DIGIT_HH * f, DIGIT_ROUND)
                               for ang in DIGIT_ANGLES)
            ])
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(8):
                faces.append(bm.faces.new((r0[i], r0[(i + 1) % 8], r1[(i + 1) % 8], r1[i])))
        tip = bm.verts.new(c0 + d * length - u * (CURL * length * length))
        last = rings[-1]
        for i in range(0, 8, 2):
            faces.append(bm.faces.new((last[i], last[i + 1], last[(i + 2) % 8], tip)))
    # One normal direction: each face points away from the paw axis.
    out_count = 0
    for f in faces:
        f.normal_update()
        m = f.calc_center_median()
        axis_point = o + a * max(0.0, min(0.07, (m - o).dot(a)))
        out_count += f.normal.dot(m - axis_point) > 0
    print(f'fox_paws: {out_count} of {len(faces)} new faces point out')
    if out_count < len(faces) / 2:
        for f in faces:
            f.normal_flip()
    bm.normal_update()
    box_uvs(faces, uv_layer, o, a, w, u)
    return faces


def zipper(bm, ring_a, ang_a, ring_b, ang_b):
    """Joins two closed rings, both in the order of their angles, with quads and the fewest
    triangles: the alignment of the two angle lists of least cost."""
    na, nb = len(ring_a), len(ring_b)
    shift = min(range(na), key=lambda i: abs((ang_a[i] - ang_b[0] + 180) % 360 - 180))
    ring_a = ring_a[shift:] + ring_a[:shift]
    ang_a = ang_a[shift:] + ang_a[:shift]

    def cost(i, j):
        return abs((ang_a[i % na] - ang_b[j % nb] + 180) % 360 - 180)

    inf = float('inf')
    best = [[inf] * (nb + 1) for _ in range(na + 1)]
    step = [[None] * (nb + 1) for _ in range(na + 1)]
    best[0][0] = 0.0
    for i in range(na + 1):
        for j in range(nb + 1):
            if best[i][j] == inf:
                continue
            for di, dj in ((1, 1), (1, 0), (0, 1)):
                ii, jj = i + di, j + dj
                if ii > na or jj > nb:
                    continue
                c = best[i][j] + cost(ii, jj) + (0 if (di, dj) == (1, 1) else 6.0)
                if c < best[ii][jj]:
                    best[ii][jj], step[ii][jj] = c, (di, dj)
    path, i, j = [], na, nb
    while (i, j) != (0, 0):
        di, dj = step[i][j]
        path.append((i - di, j - dj, di, dj))
        i, j = i - di, j - dj
    faces = []
    for i, j, di, dj in reversed(path):
        a0, a1 = ring_a[i % na], ring_a[(i + di) % na]
        b0, b1 = ring_b[j % nb], ring_b[(j + dj) % nb]
        if di and dj:
            faces.append(bm.faces.new((a0, a1, b1, b0)))
        elif di:
            faces.append(bm.faces.new((a0, a1, b0)))
        else:
            faces.append(bm.faces.new((a0, b1, b0)))
    return faces


def box_uvs(faces, uv_layer, o, a, w, u):
    """Gives each face the box projection of its main normal onto its fur patch."""
    mid_s = (PALM[-1][0] + max(d[0] for d in DIGITS)) / 2
    for f in faces:
        n = f.normal
        parts = {'a': n.dot(a), 'w': n.dot(w), 'u': n.dot(u)}
        main = max(parts, key=lambda k: abs(parts[k]))
        if main == 'u':
            patch = 'top' if parts['u'] > 0 else 'bottom'
        elif main == 'w':
            patch = 'side'
        else:
            patch = 'front'
        pu, pv = PATCHES[patch]
        for loop in f.loops:
            p = loop.vert.co - o
            s, ww, uu = p.dot(a) - mid_s, p.dot(w), p.dot(u)
            x, y = {'top': (s, ww), 'bottom': (s, ww), 'side': (s, uu), 'front': (ww, uu)}[patch]
            loop[uv_layer].uv = (pu + UV_SCALE * x, pv + UV_SCALE * y)


def main():
    src, out = sys.argv[sys.argv.index('--') + 1:][:2]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = sa.import_source(src, 1e-5)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv_layer = bm.loops.layers.uv.active
    for side in (1, -1):
        bm.verts.index_update()
        bm.edges.index_update()
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        ring = [bm.verts[i] for i in wrist_ring(bm, side)]
        removed = remove_paw(bm, [v.index for v in ring])
        faces = build_paw(bm, ring, side, uv_layer)
        tris = sum(1 for f in faces if len(f.verts) == 3)
        print(f'fox_paws: side {side}: removed {removed} vertices, added {len(faces)} faces '
              f'({tris} triangles) on the wrist ring at x {np.mean([v.co.x for v in ring]):.4f}')
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    many = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    print(f'fox_paws: {len(bm.verts)} vertices, {len(bm.faces)} faces, {open_edges} open edges, '
          f'{many} edges with more than two faces')
    bm.to_mesh(body.data)
    bm.free()
    body.name = body.data.name = 'fox'
    for p in body.data.polygons:
        p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.fbx(
        filepath=out, use_selection=True, object_types={'MESH'}, mesh_smooth_type='FACE',
        add_leaf_bones=False, bake_anim=False, path_mode='STRIP',
    )
    print('fox_paws: wrote', out)


if __name__ == '__main__':
    main()
