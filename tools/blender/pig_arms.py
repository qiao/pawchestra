# Output: `assets/models/pig/pig-upper.glb`.
"""Remodels the upper arms of a copy of the pig mesh, in Blender (MCP or batch).

The source has no upper arm of its own: above the elbow, the arm is a bulge of the trunk wall. For
each side, this script cuts the arm at a plane just below the elbow, where the arm is a separate
loop, removes the fused upper arm faces of the trunk wall, fills the wall again, and builds a round
tube of rings of edges from the loop of the cut up to a closed dome around the shoulder joint.
The tube and the forearm then form a free arm with no face that joins it to the trunk.

    exec(open('<this file>').read()); run(<options>)       # in the live Blender, through MCP
    blender -b --python <this file> -- <in.glb> <out.glb>   # in a batch run

The points are in the units of the rig config (`tools/mesh-rigs/pig.json`): 1 unit from the soles
to the top, soles at y = 0, y up, +z forward, +x the left side.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Quaternion, Vector
from mathutils.geometry import intersect_point_line

#: The default options: the place of the cut along the free arm axis, the radius and the inner
#: limit of the upper arm faces that go, the number of rings and of sides of the tube, the radius
#: of the tube at the shoulder as a factor of the radius at the cut, the height of the dome above
#: the shoulder, the halved loop of the cut, the move of the middle of the wall fan, the rounds of
#: smoothing of the wall and the rings of the trunk around its rim that move with it, and a factor
#: of the radius of the last ring. The dome of the right arm is higher (`domeR`): with 0.6, a
#: small dark notch showed between the top of its tube and the wall at the back. With no smoothing, the saw rim of the hole and the fan from its
#: middle showed as a star of dark spikes at the top of each shoulder (round `arm-form-2`).
OPTIONS = {
    'cut': -0.07,
    'radius': 0.07,
    'xmin': 0.15,
    'rings': 2,
    'sides': 10,
    'grow': 1.15,
    'dome': 0.6,
    'domeR': 1.2,
    'halve': True,
    'bulge': 0.0,
    'smooth': 12,
    'top': 1.0,
    'rim': 2,
}

#: The joints of the left side in rig units (`tools/mesh-rigs/pig.json`), and the free arm axis.
SHOULDER = (0.16, 0.56, 0.015)
AXIS_POINT = (0.2516, 0.4102, 0.0676)
AXIS = (0.4494, -0.799, 0.3995)


class Frame:
    """The map between Blender coordinates and rig units of one mesh."""

    def __init__(self, bm):
        zs = [v.co.z for v in bm.verts]
        self.floor = min(zs)
        self.scale = 1.0 / (max(zs) - self.floor)

    def rig(self, co):
        """Gives a Blender point in rig units."""
        s = self.scale
        return Vector((co.x * s, (co.z - self.floor) * s, -co.y * s))

    def blender(self, p):
        """Gives a point in rig units in Blender coordinates."""
        s = self.scale
        return Vector((p.x / s, -p.z / s, p.y / s + self.floor))

    def direction(self, d):
        """Gives a direction in rig units in Blender coordinates."""
        return Vector((d.x, -d.z, d.y))


def first_uv(bm, v):
    """Gives the UV of the first loop of a vertex."""
    uv = bm.loops.layers.uv.active
    for loop in v.link_loops:
        return loop[uv].uv.copy()
    return Vector((0.0, 0.0))


def set_uvs(bm, faces, source):
    """Gives each corner of the new faces the UV of its vertex in `source`, a map from vertex to
    UV."""
    uv = bm.loops.layers.uv.active
    for f in faces:
        for loop in f.loops:
            loop[uv].uv = source.get(loop.vert, first_uv(bm, loop.vert))


def remodel_side(bm, frame, sign, opts):
    """Remodels the upper arm of one side. Gives a report line."""
    R, B = frame.rig, frame.blender
    S = Vector((SHOULDER[0] * sign, SHOULDER[1], SHOULDER[2]))
    ax = Vector((AXIS[0] * sign, AXIS[1], AXIS[2])).normalized()
    Pc = Vector((AXIS_POINT[0] * sign, AXIS_POINT[1], AXIS_POINT[2])) + ax * opts['cut']

    def side_of(p):
        return (p - Pc).dot(ax)

    # 1. A clean loop at the cut plane.
    # Only the faces of the arm cross the plane in the cut: the plane also crosses the trunk,
    # and a cut there would only add faces. The crossing edges of the arm form one loop.
    crossing = {e for e in bm.edges
                if side_of(R(e.verts[0].co)) * side_of(R(e.verts[1].co)) < 0}
    link = {}
    for f in bm.faces:
        ce = [e for e in f.edges if e in crossing]
        if len(ce) == 2:
            link.setdefault(ce[0], set()).add(ce[1])
            link.setdefault(ce[1], set()).add(ce[0])
    seen, parts = set(), []
    for e in link:
        if e in seen:
            continue
        part, stack = [], [e]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            part.append(x)
            stack.extend(link[x] - seen)
        parts.append(part)

    def middle(part):
        return sum(((R(e.verts[0].co) + R(e.verts[1].co)) / 2 for e in part), Vector()) / len(part)

    arm_edges = set(min(parts, key=lambda p: (middle(p) - Pc).length))
    near = [f for f in bm.faces if any(e in arm_edges for e in f.edges)]
    before = len(bm.faces)
    geom = (list({v for f in near for v in f.verts}) + list({e for f in near for e in f.edges})
            + near)
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-7, plane_co=B(Pc),
                           plane_no=frame.direction(ax))
    # The loop of the arm: the component of the plane edges nearest to the middle of the arm.
    on = {v for v in bm.verts if abs(side_of(R(v.co))) < 1e-5 and (R(v.co) - Pc).length < 0.11}
    seen, parts = set(), []
    for v in on:
        if v in seen:
            continue
        part, stack = [], [v]
        while stack:
            w = stack.pop()
            if w in seen:
                continue
            seen.add(w)
            part.append(w)
            stack.extend(e.other_vert(w) for e in w.link_edges
                         if e.other_vert(w) in on and e.other_vert(w) not in seen)
        parts.append(part)
    L = min(parts, key=lambda p: (sum((R(v.co) for v in p), Vector()) / len(p) - Pc).length)
    degree = {v: sum(1 for e in v.link_edges if e.other_vert(v) in set(L)) for v in L}
    if any(d != 2 for d in degree.values()):
        raise RuntimeError(f'The loop of the cut is no simple cycle: {sorted(degree.values())}')
    uv_of = {v: first_uv(bm, v) for v in L}
    bisected = len(bm.faces) - before

    # 2. The fused upper arm: the faces above the plane near the axis from the cut to the
    # shoulder, and each face above the plane that touches the loop.
    U = set()
    for f in bm.faces:
        c = R(f.calc_center_median())
        if c.x * sign <= 0 or side_of(c) >= 0:
            continue
        _, t = intersect_point_line(c, S, Pc)
        q = S + (Pc - S) * max(0.0, min(1.0, t))
        if (c - q).length < opts['radius'] and c.x * sign > opts['xmin']:
            U.add(f)
    for v in L:
        for f in v.link_faces:
            if side_of(R(f.calc_center_median())) < 0:
                U.add(f)
    # The UVs of the wall around the hole, for the fill.
    wall_uv = {}
    for f in U:
        for v in f.verts:
            if v not in wall_uv:
                wall_uv[v] = first_uv(bm, v)
    bmesh.ops.delete(bm, geom=list(U), context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    L = [v for v in L if v.is_valid]
    Lset = set(L)

    # 3. The wall: fill the hole of the trunk with faces, and relax its new inner vertices.
    hole = [e for e in bm.edges if e.is_boundary
            and not (e.verts[0] in Lset and e.verts[1] in Lset)
            and R(e.verts[0].co).x * sign > 0.05]
    filled = bmesh.ops.edgeloop_fill(bm, edges=hole)['faces']
    # A fan from the middle of the hole gives the wall no thin face, as a triangulation of a long
    # hole would.
    poked = bmesh.ops.poke(bm, faces=filled, center_mode='MEAN_WEIGHTED')
    wall_faces = poked['faces']
    # The middle of the fan moves out of the trunk by a share of the mean radius of the hole, so
    # that the wall stays round where the bulge was.
    for c in poked['verts']:
        ring = [e.other_vert(c) for e in c.link_edges]
        mean = sum(((R(w.co) - R(c.co)).length for w in ring), 0.0) / len(ring)
        c.co = B(R(c.co) + Vector((sign, 0.0, 0.0)) * opts['bulge'] * mean)
    set_uvs(bm, wall_faces, wall_uv)
    # The rim of the hole is a saw of the faces that went, and the fan from its middle shows as
    # a star of spikes. The middle of the fan and the rim, and `rim` rings of the trunk around the
    # rim, move toward the mean of their neighbors in `smooth` rounds of half steps, so that the
    # wall is one smooth surface. The rings beyond them keep their places.
    moving = set(poked['verts']) | {v for e in hole if e.is_valid for v in e.verts}
    for _ in range(opts['rim']):
        moving |= {e.other_vert(v) for v in moving for e in v.link_edges
                   if R(e.other_vert(v).co).x * sign > 0.05}
    # The loop of the cut and the forearm below the plane keep their places.
    moving = [v for v in moving if v.is_valid and v not in Lset and side_of(R(v.co)) < 0]
    for _ in range(opts['smooth']):
        means = {v: sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
                 for v in moving}
        for v, m in means.items():
            v.co = v.co.lerp(m, 0.5)

    # 4. The loop of the cut keeps every second vertex: the edges between the vertices of each
    # pair collapse, so that the tube and the top of the forearm take fewer faces.
    if opts['halve']:
        cen = sum((R(v.co) for v in L), Vector()) / len(L)
        e1 = R(L[0].co) - cen
        e1 = (e1 - ax * e1.dot(ax)).normalized()
        e2 = ax.cross(e1)
        L.sort(key=lambda v: math.atan2((R(v.co) - cen).dot(e2), (R(v.co) - cen).dot(e1)))
        pairs = [bm.edges.get((L[k], L[k + 1])) for k in range(0, len(L) - 1, 2)]
        keep_uv = {}
        bmesh.ops.collapse(bm, edges=[e for e in pairs if e is not None], uvs=True)
        L = [v for v in L if v.is_valid]
        L = list({v for v in bm.verts if v.is_boundary and abs(side_of(R(v.co))) < 1e-5
                  and (R(v.co) - Pc).length < 0.075})
        uv_of.update({v: first_uv(bm, v) for v in L})

    # 5. The tube: rings from the loop of the cut to the shoulder joint, then a dome.
    cen = sum((R(v.co) for v in L), Vector()) / len(L)
    e1 = R(L[0].co) - cen
    e1 = (e1 - ax * e1.dot(ax)).normalized()
    e2 = ax.cross(e1)
    L.sort(key=lambda v: math.atan2((R(v.co) - cen).dot(e2), (R(v.co) - cen).dot(e1)))
    up = (S - cen).normalized()
    turn = (-ax).rotation_difference(up)
    angles = [math.atan2((R(v.co) - cen).dot(e2), (R(v.co) - cen).dot(e1)) for v in L]

    def loop_at(theta):
        """Gives the offset of the loop of the cut at an angle, and the vertex of the loop that
        lies nearest to it, by linear steps between the two loop vertices around the angle."""
        n = len(L)
        for i in range(n):
            a0, a1 = angles[i], angles[(i + 1) % n] + (2 * math.pi if i == n - 1 else 0.0)
            th = theta if theta >= angles[0] else theta + 2 * math.pi
            if a0 <= th <= a1:
                u = (th - a0) / max(a1 - a0, 1e-9)
                p0, p1 = R(L[i].co) - cen, R(L[(i + 1) % n].co) - cen
                return p0 + (p1 - p0) * u, L[i] if u < 0.5 else L[(i + 1) % n]
        return R(L[0].co) - cen, L[0]

    sides = opts['sides']
    thetas = [angles[0] + 2 * math.pi * j / sides for j in range(sides)]
    base = [loop_at(th) for th in thetas]
    rings, column, tube = [], {}, []
    count = opts['rings']
    for k in range(1, count + 1):
        t = k / count
        part = Quaternion().slerp(turn, t)
        middle = cen + (S - cen) * t
        grow = 1.0 + (opts['grow'] - 1.0) * t
        if k == count:
            grow *= opts['top']
        ring = []
        for off, src in base:
            v = bm.verts.new(B(middle + part @ (off * grow)))
            column[v] = uv_of.get(src, first_uv(bm, src))
            ring.append(v)
        rings.append(ring)
    # The first ring joins the loop of the cut by angle: a zipper of triangles.
    first, n = rings[0], len(L)

    def A(i):
        return angles[i % n] + 2 * math.pi * (i // n)

    def T(j):
        return thetas[0] + 2 * math.pi * j / sides

    i = j = 0
    while i < n or j < sides:
        if i < n and (j >= sides or A(i + 1) <= T(j + 1)):
            tube.append(bm.faces.new((L[i % n], L[(i + 1) % n], first[j % sides])))
            i += 1
        else:
            tube.append(bm.faces.new((L[i % n], first[(j + 1) % sides], first[j % sides])))
            j += 1
    for a, b in zip(rings[:-1], rings[1:]):
        for q in range(sides):
            r = (q + 1) % sides
            tube.append(bm.faces.new((a[q], a[r], b[r], b[q])))
    last = rings[-1]
    radius = sum(((R(v.co) - S).length for v in last), 0.0) / len(last)
    tip = bm.verts.new(B(S + up * radius * opts.get('domeL' if sign > 0 else 'domeR', opts['dome'])))
    column[tip] = column[last[0]]
    for q in range(sides):
        tube.append(bm.faces.new((last[q], last[(q + 1) % sides], tip)))
    tri = bmesh.ops.triangulate(bm, faces=tube, quad_method='BEAUTY')['faces']
    # The tube takes the fur of the forearm: the UV of the middle of the largest forearm face at
    # the loop, for each corner, so that the face colors of the rig stay plain.
    uvl = bm.loops.layers.uv.active
    below = max({f for v in L for f in v.link_faces if f not in set(tri)}, key=lambda f: f.calc_area())
    plain = sum((loop[uvl].uv for loop in below.loops), Vector((0.0, 0.0))) / len(below.loops)
    for f in tri:
        for loop in f.loops:
            loop[uvl].uv = plain
    bmesh.ops.recalc_face_normals(bm, faces=tri)
    return (f'side {"L" if sign > 0 else "R"}: loop {len(L)} vertices at {tuple(round(x, 3) for x in cen)}, '
             f'the cut adds {bisected} faces, {len(U)} faces of the fused upper arm go, '
            f'{len(wall_faces)} wall faces, '
            f'{len(tri)} tube faces, shoulder radius {radius:.3f} u')


def run(opts=None, name='pig_arms'):
    """Remodels both arms of the mesh object `name` in place. Gives the report lines."""
    opts = {**OPTIONS, **(opts or {})}
    ob = bpy.data.objects[name]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    frame = Frame(bm)
    lines = [remodel_side(bm, frame, sign, opts) for sign in (1.0, -1.0)]
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    lines.append(f'triangles: {len(bm.faces)}')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return lines


if __name__ == '__main__' and '--' in sys.argv:
    argv = sys.argv[sys.argv.index('--') + 1:]
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=argv[0])
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    mesh.name = 'pig_arms'
    print('\n'.join(run()))
    bpy.ops.export_scene.gltf(filepath=argv[1], export_format='GLB')
